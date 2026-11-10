//! Port of `foundation/integrations` (read side): manifest loading
//! (`integrations.mjs`), autolinking (`autolink.mjs`), provider resolution
//! (`provider-resolution.mjs`, project policy), computer integrations
//! (`computer-integrations.mjs`) and provider identity.
//!
//! A loaded integration is a [`Record`]: the JS record's fields, by name, as
//! JSON values (`name`, `providerId`, `version`, `components`, `templates`,
//! `codemods`, `docs`, `themes`, `iconSets`, `issuesUrl`, `agentDocs`,
//! `cliCommand`, and the `__`-prefixed internals `__spec`, `__packageDir`,
//! `__manifestFile`, `__loadError`, `__providerConflict`, `__unknownKeys`,
//! `__declaredKeys`, `__packageExports`, `__local`, `__autolinked`,
//! `__dependencyField`, `__computer`, `__gapReportError`, `__discoverError`,
//! `__agentDocsError`, `__cliCommandError`). A function export (`__debug`,
//! `__discover`, `__gapReport.handle`) is a handle object
//! `{"__js":"function","name":..,"module":<manifest file>,"export":<name>}`
//! (plus `"path":["handle"]` for a member), so a caller can call it through
//! `crate::js`. Absent fields are absent (JS `undefined`).

use super::nodepath as np;
use super::paths;
use super::zod::{self, *};
use crate::json::{Map, Value};

/// A loaded integration record.
pub type Record = Map<String, Value>;

/// The manifest file names, in order.
pub const MANIFEST_BASENAMES: [&str; 3] = ["astryx.integration.ts", "astryx.integration.mjs", "astryx.integration.js"];

/// `findPresentFiles(dir, basenames)`.
pub fn find_present_files(dir: &str, basenames: &[&str]) -> Vec<String> {
    basenames.iter().map(|n| np::join2(dir, n)).filter(|p| np::exists(p)).collect()
}

/// `findManifestPaths(dir)`.
pub fn find_manifest_paths(dir: &str) -> Vec<String> {
    find_present_files(dir, &MANIFEST_BASENAMES)
}

/// A record's string field.
pub fn s<'a>(r: &'a Record, k: &str) -> Option<&'a str> {
    r.get(k).and_then(|v| v.as_str())
}

/// A record field that is present and not `undefined`/`null`.
pub fn has(r: &Record, k: &str) -> bool {
    !super::docmod::is_nullish(r.get(k))
}

const PACKAGE_NAME_RE: &str = r"^(?:@[a-z0-9][a-z0-9._~!*'()-]*\/)?[a-z0-9][a-z0-9._~!*'()-]*$";

/// `normalizeProviderId(name)`.
pub fn normalize_provider_id(name: &str) -> Result<String, String> {
    if name.trim_matches(paths::js_ws).is_empty() {
        return Err("Provider ID must be a non-empty string.".into());
    }
    use unicode_normalization_shim::nfc;
    let n = nfc(name.trim_matches(paths::js_ws)).to_lowercase();
    if regress::Regex::with_flags(PACKAGE_NAME_RE, "u").unwrap().find(&n).is_none() {
        return Err(format!("Provider ID \"{name}\" must be a bare npm package name."));
    }
    Ok(n)
}

mod unicode_normalization_shim {
    /// NFC for the ASCII package names this sees; non-ASCII names fail the
    /// package-name pattern either way, so they are returned as written.
    pub fn nfc(s: &str) -> String {
        s.to_string()
    }
}

fn provider_id_for_package(name: Option<&str>) -> Option<String> {
    let n = name?;
    if n.is_empty() {
        return None;
    }
    normalize_provider_id(n).ok()
}

fn invalid_agent_doc_line(value: &str) -> Option<String> {
    if value.is_empty() || value.trim_matches(paths::js_ws).is_empty() {
        return Some("must not be blank".into());
    }
    if value != value.trim_matches(paths::js_ws) {
        return Some("must not have surrounding whitespace".into());
    }
    for c in value.chars() {
        let cp = c as u32;
        if cp == 0 {
            return Some("must not contain NUL".into());
        }
        if cp == 0x2028 || cp == 0x2029 {
            return Some("must be a single line".into());
        }
        if cp <= 0x1f || (0x7f..=0x9f).contains(&cp) {
            return Some("must not contain control characters or line separators".into());
        }
    }
    if regress::Regex::with_flags(r"(?:ASTRYX|XDS):(START|END)", "u").unwrap().find(value).is_some() {
        return Some("must not contain managed marker text".into());
    }
    let n = value.chars().count();
    if n > 240 {
        return Some(format!("must contain at most 240 Unicode code points (received {n})"));
    }
    None
}

fn cli_command_check(value: &str) -> Option<String> {
    if let Some(m) = invalid_agent_doc_line(value) {
        return Some(m);
    }
    let n = value.chars().count();
    if n > 120 {
        return Some(format!("must contain at most 120 Unicode code points (received {n})"));
    }
    None
}

fn integration_base_schema() -> Z {
    object(
        vec![
            (
                "providerId",
                opt(string().check(StrCheck::Regex(PACKAGE_NAME_RE, "u", Some("providerId must be a canonical npm package name".into())))),
            ),
            ("components", opt(string())),
            ("templates", opt(string())),
            ("codemods", opt(string())),
            ("docs", opt(string())),
            ("themes", opt(string())),
            ("experimental", opt(object(vec![("iconSets", opt(string()))], Mode::Strip))),
            ("issuesUrl", opt(string().check(StrCheck::Url))),
            ("docsiteUrl", opt(string().check(StrCheck::Url))),
        ],
        Mode::Strip,
    )
}

fn agent_docs_schema() -> Z {
    object(
        vec![(
            "append",
            opt(Z::Array {
                item: Box::new(string().check(StrCheck::RefineMsg(invalid_agent_doc_line))),
                min: None,
                min_msg: None,
                max: Some((8, Some("append may contain at most 8 lines".into()))),
            }),
        )],
        Mode::Strip,
    )
}

/// `KNOWN_INTEGRATION_KEYS`.
pub const KNOWN_INTEGRATION_KEYS: [&str; 11] = [
    "providerId",
    "components",
    "templates",
    "codemods",
    "docs",
    "themes",
    "experimental",
    "issuesUrl",
    "docsiteUrl",
    "agentDocs",
    "cliCommand",
];

fn run(z: &Z, v: &Value, label: &str) -> Result<Value, String> {
    zod::safe_parse(z, v).map_err(|i| format_zod_error(label, &i))
}

/// `parseIntegrationBase`.
pub fn parse_integration_base(v: &Value, label: &str) -> Result<Value, String> {
    run(&integration_base_schema(), v, label)
}
/// `parseAgentDocsField`.
pub fn parse_agent_docs_field(v: &Value, label: &str) -> Result<Value, String> {
    run(&agent_docs_schema(), v, label)
}
/// `parseCliCommandField`.
pub fn parse_cli_command_field(v: &Value, label: &str) -> Result<Value, String> {
    run(&string().check(StrCheck::RefineMsg(cli_command_check)), v, label)
}

fn is_plain(v: &Value) -> bool {
    matches!(v, Value::Object(_)) && zod::received(v) == "object"
}

/// `unknownIntegrationKeys(input)`.
pub fn unknown_integration_keys(v: &Value) -> Vec<String> {
    match v {
        Value::Object(m) if is_plain(v) => m.keys().filter(|k| !KNOWN_INTEGRATION_KEYS.contains(&k.as_str())).cloned().collect(),
        _ => vec![],
    }
}

fn is_function(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::Object(m)) if m.get("__js").and_then(|x| x.as_str()) == Some("function"))
}

fn handle(v: &Value, module: &str, export: &str, path: &[&str]) -> Value {
    let mut m = v.as_object().cloned().unwrap_or_default();
    m.insert("module".into(), Value::String(module.into()));
    m.insert("export".into(), Value::String(export.into()));
    if !path.is_empty() {
        m.insert("path".into(), Value::Array(path.iter().map(|p| Value::String((*p).into())).collect()));
    }
    Value::Object(m)
}

/// `parseGapReportHandler(value, label)`.
pub fn parse_gap_report_handler(v: &Value, label: &str) -> Result<Value, String> {
    let schema = object(
        vec![
            ("audience", enum_(&["internal", "public"])),
            ("handle", Z::Custom(|v| is_function(Some(v)), "Expected a function".into())),
        ],
        Mode::Strict,
    );
    run(&schema, v, label)
}

/// `parseDiscoverSource(value, label)`.
pub fn parse_discover_source(v: &Value, label: &str) -> Result<Value, String> {
    if !is_function(Some(v)) {
        return Err(format!("{label} must be a function"));
    }
    Ok(v.clone())
}

/// What `loadManifest` returns.
#[derive(Debug, Clone, Default)]
pub struct LoadedManifest {
    pub manifest: Map<String, Value>,
    pub unknown_keys: Vec<String>,
    pub declared_keys: Vec<String>,
    pub debug: Option<Value>,
    pub gap_report: Option<Value>,
    pub gap_report_error: Option<String>,
    pub discover: Option<Value>,
    pub discover_error: Option<String>,
    pub agent_docs_error: Option<String>,
    pub cli_command_error: Option<String>,
}

/// `importUserModule(file)`: a user module, its stdout sent to stderr.
pub fn import_user_module(file: &str) -> Result<crate::js::Namespace, String> {
    let r = super::docmod::import_doc_module(file);
    let out = crate::js::take_output();
    if !out.is_empty() {
        use std::io::Write;
        let _ = std::io::stderr().write_all(&out);
    }
    r.map_err(|e| e.message)
}

/// `loadManifest(file, label)`.
pub fn load_manifest(file: &str, label: &str) -> Result<LoadedManifest, String> {
    let ns = import_user_module(file)?;
    let undefined = zod::undefined();
    let raw = ns.get("default").cloned().unwrap_or_else(|| undefined.clone());
    if super::docmod::is_undefined(Some(&raw)) {
        return Err(no_default_export_message(file, label, &ns));
    }
    let base = parse_integration_base(&raw, label)?;
    let mut out = LoadedManifest::default();
    let named = |k: &str| ns.get(k).filter(|v| !super::docmod::is_undefined(Some(v)));
    if let Some(g) = named("gapReport") {
        match parse_gap_report_handler(g, &format!("{label} named export \"gapReport\"")) {
            Ok(mut h) => {
                if let (Value::Object(m), Some(hv)) = (&mut h, g.get("handle")) {
                    m.insert("handle".into(), handle(hv, file, "gapReport", &["handle"]));
                }
                out.gap_report = Some(h);
            }
            Err(e) => out.gap_report_error = Some(e),
        }
    }
    if let Some(d) = named("discover") {
        match parse_discover_source(d, &format!("{label} named export \"discover\"")) {
            Ok(v) => out.discover = Some(handle(&v, file, "discover", &[])),
            Err(e) => out.discover_error = Some(e),
        }
    }
    let raw_obj = if is_plain(&raw) { raw.as_object() } else { None };
    let mut agent_docs = None;
    if let Some(ad) = raw_obj.and_then(|m| m.get("agentDocs")) {
        if !super::docmod::is_undefined(Some(ad)) {
            match parse_agent_docs_field(ad, &format!("{label} field \"agentDocs\"")) {
                Ok(v) => agent_docs = Some(v),
                Err(e) => out.agent_docs_error = Some(e),
            }
        }
    }
    let mut cli_command = None;
    if let Some(cc) = raw_obj.and_then(|m| m.get("cliCommand")) {
        if !super::docmod::is_undefined(Some(cc)) {
            match parse_cli_command_field(cc, &format!("{label} field \"cliCommand\"")) {
                Ok(v) => cli_command = Some(v),
                Err(e) => out.cli_command_error = Some(e),
            }
        }
    }
    let mut manifest = base.as_object().cloned().unwrap_or_default();
    if let Some(a) = agent_docs.filter(|v| !v.is_null()) {
        manifest.insert("agentDocs".into(), a);
    }
    if let Some(c) = cli_command.filter(|v| !v.is_null()) {
        manifest.insert("cliCommand".into(), c);
    }
    out.manifest = manifest;
    out.unknown_keys = unknown_integration_keys(&raw);
    out.declared_keys = match &raw {
        Value::Object(m) => m.keys().cloned().collect(),
        Value::Array(a) => (0..a.len()).map(|i| i.to_string()).collect(),
        _ => vec![],
    };
    if let Some(d) = named("debug") {
        if is_function(Some(d)) {
            out.debug = Some(handle(d, file, "debug", &[]));
        }
    }
    Ok(out)
}

fn no_default_export_message(file: &str, label: &str, ns: &crate::js::Namespace) -> String {
    let fix = "Fix: export the manifest object as the default export: `export default {components: './components'}`, naming the roots the package has.";
    let text = np::read_text(file).unwrap_or_default();
    let names: Vec<&String> = ns.keys().filter(|k| *k != "default").collect();
    if text.trim_matches(paths::js_ws).is_empty() {
        return format!("{label} is empty. {fix}");
    }
    let found = if names.is_empty() {
        String::new()
    } else {
        format!(" (it exports {})", names.iter().map(|n| format!("`{n}`")).collect::<Vec<_>>().join(", "))
    };
    format!("{label} has no default export{found}. {fix}")
}

/// `resolvePackageDir(name, cwd)`.
pub fn resolve_package_dir(name: &str, cwd: &str) -> Result<String, String> {
    if name.is_empty() || np::is_absolute(name) || name.split('/').any(|s| s == ".." || s == ".") {
        return Err(format!("Invalid integration package name \"{name}\". Use a bare package name (no path segments)."));
    }
    let nm = np::resolve(&[cwd, "node_modules"]);
    let mut parts: Vec<&str> = vec![&nm];
    parts.extend(name.split('/'));
    let dir = np::resolve(&parts);
    if dir != nm && !dir.starts_with(&format!("{nm}/")) {
        return Err(format!("Integration \"{name}\" resolves outside node_modules."));
    }
    Ok(dir)
}

/// `resolveInstalledIntegrationDir(name, cwd)`.
pub fn resolve_installed_integration_dir(name: &str, cwd: &str) -> Result<String, String> {
    let own = resolve_package_dir(name, cwd)?;
    Ok(paths::find_node_modules_package(cwd, name).map(|(p, _)| p).unwrap_or(own))
}

fn resolve_manifest_path(package_dir: &str, spec: &str) -> Result<String, String> {
    let present = find_present_files(package_dir, &MANIFEST_BASENAMES);
    if present.is_empty() {
        return Err(format!(
            "Integration package \"{spec}\" has no conventional root manifest. Add one of: {} next to its package.json.",
            MANIFEST_BASENAMES.join(", ")
        ));
    }
    if present.len() > 1 {
        return Err(format!(
            "Integration package \"{spec}\" has multiple root manifests ({}). Keep exactly one.",
            present.iter().map(|f| np::basename(f)).collect::<Vec<_>>().join(", ")
        ));
    }
    Ok(present[0].clone())
}

/// `assertWithin(target, root, {label})`: the resolved path, or the error.
pub fn assert_within(target: &str, root: &str, label: &str) -> Result<String, String> {
    super::path_safety::assert_within(target, root, false, label).map_err(|e| e.message)
}

fn put(r: &mut Record, k: &str, v: Option<Value>) {
    if let Some(v) = v {
        r.insert(k.into(), v);
    }
}

/// Insert the value, or the JS `undefined` (the key stays, as in the JS
/// record literal).
fn put_u(r: &mut Record, k: &str, v: Option<Value>) {
    r.insert(k.into(), v.unwrap_or_else(zod::undefined));
}

fn opt_str(v: Option<String>) -> Option<Value> {
    v.map(Value::String)
}

fn build_record(
    name: &str,
    pkg: &Value,
    spec: &str,
    package_dir: &str,
    manifest_file: &str,
    lm: LoadedManifest,
    local: bool,
) -> Record {
    let m = &lm.manifest;
    let pid_source = m.get("providerId").and_then(|v| v.as_str()).map(String::from).unwrap_or_else(|| name.to_string());
    let provider_id = provider_id_for_package(Some(&pid_source));
    let root = |k: Option<&Value>| -> Option<Value> {
        let v = k?.as_str()?;
        assert_within(v, package_dir, "contribution root").ok().map(Value::String)
    };
    let mut r = Record::new();
    r.insert("name".into(), Value::String(name.into()));
    put(&mut r, "providerId", provider_id.map(Value::String));
    put_u(&mut r, "version", pkg.get("version").cloned());
    put_u(&mut r, "components", root(m.get("components")));
    put_u(&mut r, "templates", root(m.get("templates")));
    put_u(&mut r, "codemods", root(m.get("codemods")));
    put_u(&mut r, "docs", root(m.get("docs")));
    put_u(&mut r, "themes", root(m.get("themes")));
    put_u(&mut r, "iconSets", root(m.get("experimental").and_then(|e| e.get("iconSets"))));
    put_u(&mut r, "issuesUrl", m.get("issuesUrl").cloned());
    put_u(&mut r, "agentDocs", m.get("agentDocs").cloned());
    put_u(&mut r, "cliCommand", m.get("cliCommand").cloned());
    put_u(&mut r, "__cliCommandError", opt_str(lm.cli_command_error));
    put_u(&mut r, "__agentDocsError", opt_str(lm.agent_docs_error));
    r.insert("__unknownKeys".into(), Value::Array(lm.unknown_keys.into_iter().map(Value::String).collect()));
    r.insert("__declaredKeys".into(), Value::Array(lm.declared_keys.into_iter().map(Value::String).collect()));
    put_u(&mut r, "__debug", lm.debug);
    put_u(&mut r, "__gapReport", lm.gap_report);
    put_u(&mut r, "__gapReportError", opt_str(lm.gap_report_error));
    put_u(&mut r, "__discover", lm.discover);
    put_u(&mut r, "__discoverError", opt_str(lm.discover_error));
    r.insert("__spec".into(), Value::String(spec.into()));
    r.insert("__packageDir".into(), Value::String(package_dir.into()));
    r.insert(
        "__packageExports".into(),
        match pkg.get("exports") {
            None | Some(Value::Null) => Value::Null,
            Some(v) => v.clone(),
        },
    );
    r.insert("__manifestFile".into(), Value::String(manifest_file.into()));
    if local {
        r.insert("__local".into(), Value::Bool(true));
    }
    r
}

fn load_error_record(name: &str, pkg: &Value, spec: &str, package_dir: &str, manifest_file: &str, err: String, local: bool) -> Record {
    let mut r = Record::new();
    r.insert("name".into(), Value::String(name.into()));
    put(&mut r, "providerId", provider_id_for_package(Some(name)).map(Value::String));
    put_u(&mut r, "version", pkg.get("version").cloned());
    r.insert("__spec".into(), Value::String(spec.into()));
    r.insert("__packageDir".into(), Value::String(package_dir.into()));
    r.insert("__manifestFile".into(), Value::String(manifest_file.into()));
    r.insert("__loadError".into(), Value::String(err));
    if local {
        r.insert("__local".into(), Value::Bool(true));
    }
    r
}

fn pkg_name(pkg: &Value) -> Option<String> {
    match pkg.get("name") {
        None | Some(Value::Null) => None,
        Some(v) if super::docmod::is_undefined(Some(v)) => None,
        Some(v) => Some(paths::js_string(Some(v))),
    }
}

/// `loadLocalIntegration(packageDir)`: Ok(None) when no manifest.
pub fn load_local_integration(package_dir: &str) -> Result<Option<Record>, String> {
    if find_manifest_paths(package_dir).is_empty() {
        return Ok(None);
    }
    let pkg_path = np::join2(package_dir, "package.json");
    let pkg = np::read_json(&pkg_path).ok_or_else(|| format!("Could not read the local integration package at {pkg_path}."))?;
    let spec = match pkg.get("name") {
        Some(Value::String(n)) if !n.is_empty() => n.clone(),
        _ => "(local integration)".into(),
    };
    let manifest_file = resolve_manifest_path(package_dir, &spec)?;
    match load_manifest(&manifest_file, &format!("Integration {spec}")) {
        Err(e) => {
            let mut r = load_error_record(&spec, &pkg, &spec, package_dir, &manifest_file, e, true);
            // A local record names its provider from package.json's name.
            r.shift_remove("providerId");
            let pid = provider_id_for_package(pkg.get("name").and_then(|v| v.as_str()));
            let mut out = Record::new();
            for (k, v) in r {
                out.insert(k.clone(), v);
                if k == "name" {
                    if let Some(p) = &pid {
                        out.insert("providerId".into(), Value::String(p.clone()));
                    }
                }
            }
            Ok(Some(out))
        }
        Ok(lm) => {
            let pid_src = lm
                .manifest
                .get("providerId")
                .and_then(|v| v.as_str())
                .map(String::from)
                .or_else(|| pkg.get("name").and_then(|v| v.as_str()).map(String::from));
            let mut r = build_record(&spec, &pkg, &spec, package_dir, &manifest_file, lm, true);
            r.shift_remove("providerId");
            let pid = pid_src.and_then(|p| provider_id_for_package(Some(&p)));
            let mut out = Record::new();
            for (k, v) in r {
                out.insert(k.clone(), v);
                if k == "name" {
                    if let Some(p) = &pid {
                        out.insert("providerId".into(), Value::String(p.clone()));
                    }
                }
            }
            Ok(Some(out))
        }
    }
}

/// `loadIntegrations(specs, {cwd, resolveProviders})`.
pub fn load_integrations(specs: &[String], cwd: &str, resolve: bool) -> Result<Vec<Record>, String> {
    let mut out = Vec::new();
    let mut seen: Vec<&String> = Vec::new();
    for spec in specs {
        if spec.is_empty() || seen.contains(&spec) {
            continue;
        }
        seen.push(spec);
        let package_dir = resolve_installed_integration_dir(spec, cwd)?;
        let pkg_path = np::join2(&package_dir, "package.json");
        let pkg = np::read_json(&pkg_path)
            .ok_or_else(|| format!("Could not find installed integration package \"{spec}\" at {pkg_path}. Install it first."))?;
        let name = pkg_name(&pkg).unwrap_or_else(|| spec.clone());
        let manifest_file = resolve_manifest_path(&package_dir, spec)?;
        match load_manifest(&manifest_file, &format!("Integration {spec}")) {
            Err(e) => out.push(load_error_record(&name, &pkg, spec, &package_dir, &manifest_file, e, false)),
            Ok(lm) => out.push(build_record(&name, &pkg, spec, &package_dir, &manifest_file, lm, false)),
        }
    }
    Ok(if resolve { resolve_providers(out.into_iter().map(|r| Candidate::configured(r)).collect()).integrations } else { out })
}

// ── Autolink ────────────────────────────────────────────────────────────────

/// `isBarePackageName(name)`.
pub fn is_bare_package_name(name: &str) -> bool {
    !name.is_empty() && !np::is_absolute(name) && !name.starts_with("@/") && !name.split('/').any(|s| s == "." || s == "..")
}

/// `readDeclaredDependencies(projectDir)`: `(name, field)`.
pub fn read_declared_dependencies(project_dir: &str) -> Vec<(String, String)> {
    let Some(pkg) = np::read_json(&np::join2(project_dir, "package.json")) else { return vec![] };
    let mut out = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for f in ["dependencies", "devDependencies", "optionalDependencies"] {
        let Some(Value::Object(m)) = pkg.get(f) else { continue };
        for k in m.keys() {
            if seen.contains(k) || !is_bare_package_name(k) {
                continue;
            }
            seen.push(k.clone());
            out.push((k.clone(), f.to_string()));
        }
    }
    out
}

/// A candidate for provider resolution.
#[derive(Debug, Clone)]
pub struct Candidate {
    /// `configured` | `autolinked` | `local` | `installed` | `extra`.
    pub source: &'static str,
    pub spec: Option<String>,
    pub package_dir: Option<String>,
    pub integration: Option<Record>,
    pub repeat: bool,
    pub error: Option<String>,
}

impl Candidate {
    pub fn configured(r: Record) -> Candidate {
        Candidate {
            source: "configured",
            spec: s(&r, "__spec").map(String::from),
            package_dir: None,
            integration: Some(r),
            repeat: false,
            error: None,
        }
    }
}

/// `loadAutolinkCandidates({projectDir, loaded})`.
pub fn load_autolink_candidates(project_dir: &str, loaded: &[Record]) -> Vec<Candidate> {
    let mut taken: Vec<String> = loaded.iter().filter_map(|r| s(r, "__packageDir")).map(np::real_or_resolve).collect();
    let mut out = Vec::new();
    for (name, field) in read_declared_dependencies(project_dir) {
        let Some((package_dir, host_dir)) = (if is_bare_package_name(&name) { paths::find_node_modules_package(project_dir, &name) } else { None }) else {
            continue;
        };
        if find_manifest_paths(&package_dir).len() != 1 {
            continue;
        }
        let identity = np::real_or_resolve(&package_dir);
        if taken.contains(&identity) {
            out.push(Candidate { source: "autolinked", spec: Some(name), package_dir: Some(package_dir), integration: None, repeat: true, error: None });
            continue;
        }
        taken.push(identity);
        match load_integrations(&[name.clone()], &host_dir, true) {
            Ok(list) => {
                let integration = list.into_iter().next().map(|mut r| {
                    r.insert("__autolinked".into(), Value::Bool(true));
                    r.insert("__dependencyField".into(), Value::String(field.clone()));
                    r
                });
                out.push(Candidate { source: "autolinked", spec: Some(name), package_dir: Some(package_dir), integration, repeat: false, error: None });
            }
            Err(e) => out.push(Candidate { source: "autolinked", spec: Some(name), package_dir: Some(package_dir), integration: None, repeat: false, error: Some(e) }),
        }
    }
    out
}

// ── Provider resolution (project policy) ───────────────────────────────────

/// One ledger entry (`ProviderLedgerEntry`).
#[derive(Debug, Clone)]
pub struct LedgerEntry {
    pub key: String,
    pub label: String,
    /// `contributes` | `set-aside` | `load-failed` | `alias-of`.
    pub outcome: &'static str,
    pub candidate: Candidate,
    pub refs: Vec<Candidate>,
    pub provider_id: Option<String>,
    pub winner: Option<String>,
    pub reason: Option<&'static str>,
    pub alias_of: Option<String>,
    pub integration: Option<Record>,
    pub error: Option<String>,
}

/// `resolveProviders` result.
#[derive(Debug, Clone, Default)]
pub struct Resolution {
    pub integrations: Vec<Record>,
    /// Entries in insertion order.
    pub ledger: Vec<LedgerEntry>,
}

struct State {
    candidate: Candidate,
    record: Option<Record>,
    key: String,
    outcome: Option<&'static str>,
    winner: Option<usize>,
    reason: Option<&'static str>,
    alias_of: Option<usize>,
    listed: Option<usize>,
}

fn claims_provider(r: Option<&Record>) -> bool {
    match r {
        Some(r) => has(r, "providerId") && !has(r, "__loadError") && !has(r, "__providerConflict"),
        None => false,
    }
}

fn describe(r: &Record) -> String {
    let name = paths::js_string(r.get("name"));
    let id = if has(r, "version") { format!("{name}@{}", paths::js_string(r.get("version"))) } else { name.clone() };
    match s(r, "__spec") {
        Some(spec) if spec != name => format!("{id} (from \"{spec}\")"),
        _ => id,
    }
}

fn package_label(r: &Record) -> String {
    let name = paths::js_string(r.get("name"));
    if has(r, "version") {
        format!("{name}@{}", paths::js_string(r.get("version")))
    } else {
        name
    }
}

fn published_identity(r: &Record) -> String {
    format!(
        "{}\u{0}{}",
        paths::js_string(r.get("name")),
        if has(r, "version") { paths::js_string(r.get("version")) } else { String::new() }
    )
}

fn provider_conflict(r: &Record, claimant: &Record) -> Record {
    let pid = paths::js_string(r.get("providerId"));
    let winner = describe(claimant);
    let set_aside = describe(r);
    let reason = if has(claimant, "__local") { "is the package being authored, so it is used" } else { "loads first and is used" };
    let mut out = Record::new();
    out.insert("name".into(), r.get("name").cloned().unwrap_or(Value::Null));
    out.insert("providerId".into(), Value::String(pid.clone()));
    put(&mut out, "version", r.get("version").cloned());
    put(&mut out, "__spec", r.get("__spec").cloned());
    put(&mut out, "__packageDir", r.get("__packageDir").cloned());
    put(&mut out, "__manifestFile", r.get("__manifestFile").cloned());
    if has(r, "__local") {
        out.insert("__local".into(), Value::Bool(true));
    }
    if has(r, "__autolinked") {
        out.insert("__autolinked".into(), Value::Bool(true));
        out.insert("__dependencyField".into(), r.get("__dependencyField").cloned().unwrap_or_else(zod::undefined));
    }
    let mut pc = Map::new();
    pc.insert("providerId".into(), Value::String(pid.clone()));
    pc.insert("claimedBy".into(), claimant.get("name").cloned().unwrap_or(Value::Null));
    pc.insert(
        "message".into(),
        Value::String(format!(
            "{set_aside} and {winner} both claim provider ID \"{pid}\". {winner} {reason}; {set_aside} contributes nothing until one package changes its providerId."
        )),
    );
    out.insert("__providerConflict".into(), Value::Object(pc));
    out
}

/// `resolveProviders(candidates)` with the project policy.
pub fn resolve_providers(candidates: Vec<Candidate>) -> Resolution {
    let mut states: Vec<State> = candidates
        .into_iter()
        .enumerate()
        .map(|(i, c)| {
            let dir = c.integration.as_ref().and_then(|r| s(r, "__packageDir").map(String::from)).or_else(|| c.package_dir.clone());
            let key = match dir {
                Some(d) if !d.is_empty() => np::real_or_resolve(&d),
                _ => format!("#{i}"),
            };
            State { record: c.integration.clone(), candidate: c, key, outcome: None, winner: None, reason: None, alias_of: None, listed: None }
        })
        .collect();

    // assembleProject: slots of (state index, record).
    let mut slots: Vec<(usize, Option<Record>)> = Vec::new();
    let mut loaded: Vec<(String, usize)> = Vec::new();
    for i in 0..states.len() {
        let st = &states[i];
        if st.candidate.repeat {
            states[i].outcome = Some("alias-of");
            continue;
        }
        if st.candidate.source == "autolinked" {
            let Some(rec) = st.record.clone().filter(|r| !has(r, "__loadError")) else {
                states[i].outcome = Some("load-failed");
                continue;
            };
            let id = published_identity(&rec);
            if let Some((_, j)) = loaded.iter().find(|(k, _)| *k == id) {
                let j = *j;
                states[i].outcome = Some("alias-of");
                states[i].alias_of = Some(j);
                continue;
            }
            loaded.push((id, i));
            slots.push((i, Some(rec)));
            continue;
        }
        if st.candidate.source == "local" && st.record.is_some() {
            let rec = st.record.clone().unwrap();
            let replaced = slots.iter().position(|(_, r)| r.as_ref().map(|r| r.get("name")) == Some(rec.get("name")));
            match replaced {
                None => slots.push((i, Some(rec))),
                Some(k) => {
                    let old = slots[k].0;
                    states[old].outcome = Some("set-aside");
                    states[old].winner = Some(i);
                    states[old].reason = Some("replaced-by-authored");
                    slots[k] = (i, Some(rec));
                }
            }
            continue;
        }
        if let Some(rec) = &st.record {
            let id = published_identity(rec);
            if !loaded.iter().any(|(k, _)| *k == id) {
                loaded.push((id, i));
            }
        }
        slots.push((i, st.record.clone()));
    }

    // markConflicts.
    let mut claims: Vec<(String, usize)> = Vec::new(); // providerId -> slot index
    for (k, (_, r)) in slots.iter().enumerate() {
        if let Some(r) = r {
            if has(r, "__local") && claims_provider(Some(r)) {
                let pid = paths::js_string(r.get("providerId"));
                if !claims.iter().any(|(p, _)| *p == pid) {
                    claims.push((pid, k));
                }
            }
        }
    }
    let mut resolved: Vec<Record> = Vec::new();
    for k in 0..slots.len() {
        let (si, rec) = slots[k].clone();
        if !claims_provider(rec.as_ref()) {
            let idx = resolved.len();
            match &rec {
                Some(r) => resolved.push(r.clone()),
                None => resolved.push(Record::new()),
            }
            let st = &mut states[si];
            st.listed = Some(idx);
            st.outcome = Some(match &rec {
                Some(r) if has(r, "__providerConflict") => "set-aside",
                Some(r) if !has(r, "__loadError") => "contributes",
                _ => "load-failed",
            });
            st.winner = None;
            st.reason = None;
            st.alias_of = None;
            continue;
        }
        let r = rec.unwrap();
        let pid = paths::js_string(r.get("providerId"));
        match claims.iter().find(|(p, _)| *p == pid).map(|(_, c)| *c) {
            None => {
                claims.push((pid, k));
                states[si].listed = Some(resolved.len());
                resolved.push(r);
                states[si].outcome = Some("contributes");
            }
            Some(c) if c == k => {
                states[si].listed = Some(resolved.len());
                resolved.push(r);
                states[si].outcome = Some("contributes");
            }
            Some(c) => {
                let claimant = slots[c].1.clone().unwrap();
                if claimant.get("name") != r.get("name") || claimant.get("version") != r.get("version") {
                    let conflict = provider_conflict(&r, &claimant);
                    states[si].listed = Some(resolved.len());
                    resolved.push(conflict);
                    states[si].outcome = Some("set-aside");
                    states[si].winner = Some(slots[c].0);
                    states[si].reason = Some(if has(&claimant, "__local") { "authored-claims" } else { "claimed-earlier" });
                } else {
                    states[si].outcome = Some("alias-of");
                    states[si].alias_of = Some(slots[c].0);
                    states[si].listed = None;
                }
            }
        }
    }

    // buildLedger.
    let rank = |o: &str| match o {
        "contributes" => 0,
        "set-aside" => 1,
        "load-failed" => 2,
        _ => 3,
    };
    let mut chosen: Vec<(String, usize)> = Vec::new();
    let mut refs: Vec<(String, Vec<Candidate>)> = Vec::new();
    for (i, st) in states.iter().enumerate() {
        let outcome = st.outcome.unwrap_or("load-failed");
        match chosen.iter_mut().find(|(k, _)| *k == st.key) {
            None => chosen.push((st.key.clone(), i)),
            Some(slot) => {
                if rank(outcome) < rank(states[slot.1].outcome.unwrap_or("load-failed")) {
                    slot.1 = i;
                }
            }
        }
        match refs.iter_mut().find(|(k, _)| *k == st.key) {
            Some((_, l)) => l.push(st.candidate.clone()),
            None => refs.push((st.key.clone(), vec![st.candidate.clone()])),
        }
    }
    let mut ledger = Vec::new();
    for (key, i) in chosen {
        let st = &states[i];
        let outcome = st.outcome.unwrap_or("load-failed");
        let label = match &st.record {
            Some(r) if super::paths::js_truthy(r.get("name")) => package_label(r),
            _ => st.candidate.spec.clone().unwrap_or_else(|| key.clone()),
        };
        let error = st.record.as_ref().and_then(|r| s(r, "__loadError").map(String::from)).or_else(|| st.candidate.error.clone());
        ledger.push(LedgerEntry {
            key: key.clone(),
            label,
            outcome,
            candidate: st.candidate.clone(),
            refs: refs.iter().find(|(k, _)| *k == key).map(|(_, l)| l.clone()).unwrap_or_else(|| vec![st.candidate.clone()]),
            provider_id: st.record.as_ref().filter(|r| has(r, "providerId")).map(|r| paths::js_string(r.get("providerId"))),
            winner: if outcome == "set-aside" { st.winner.map(|w| states[w].key.clone()) } else { None },
            reason: if outcome == "set-aside" { st.reason } else { None },
            alias_of: if outcome == "alias-of" { Some(st.alias_of.map(|a| states[a].key.clone()).unwrap_or_else(|| key.clone())) } else { None },
            integration: st.listed.map(|l| resolved[l].clone()),
            error: if outcome == "load-failed" { error } else { None },
        });
    }
    Resolution { integrations: resolved, ledger }
}

// ── Computer integrations ───────────────────────────────────────────────────

/// A computer-installed integration candidate.
#[derive(Debug, Clone)]
pub struct ComputerCandidate {
    pub name: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub package_dir: String,
    pub host_dir: String,
    pub incompatible: Option<String>,
}

fn install_owner(root: &str) -> Option<String> {
    let runner = regress::Regex::with_flags(r"[\\/]_npx[\\/]|[\\/]dlx[-\\/]|[\\/]\.bun[\\/]install[\\/]cache[\\/]|[\\/]bunx-|[\\/]xfs-", "i").unwrap();
    if runner.find(root).is_some() {
        return None;
    }
    let parts: Vec<&str> = root.split('/').collect();
    let at = parts.iter().rposition(|p| *p == "node_modules")?;
    if at < 1 {
        return None;
    }
    let mut owner = parts[..at].join("/");
    if let Some(p) = parts.iter().rposition(|p| *p == ".pnpm") {
        if p > 0 && p < at {
            let end = if parts[p - 1] == "node_modules" { p - 1 } else { p };
            owner = parts[..end].join("/");
        }
    }
    Some(if owner.is_empty() { "/".into() } else { owner })
}

/// `computerInstallRoots(cliRoot)`.
pub fn computer_install_roots(cli_root: &str) -> Vec<String> {
    let cli = np::real_or_resolve(cli_root);
    let from_pnpm = pnpm_global_folders(&cli);
    if !from_pnpm.is_empty() {
        return from_pnpm;
    }
    match install_owner(&cli) {
        Some(o) if !super::release::is_in_release_cache(&cli) => vec![o],
        _ => vec![],
    }
}

fn pnpm_global_folders(cli: &str) -> Vec<String> {
    let parts: Vec<&str> = cli.split('/').collect();
    let vre = regress::Regex::new(r"^v\d+$").unwrap();
    let isv = |s: Option<&&str>| s.map(|s| vre.find(s).is_some()).unwrap_or(false);
    let mut global = None;
    if let Some(st) = parts.iter().rposition(|p| *p == "store") {
        if st > 0 && isv(parts.get(st + 1)) && parts.get(st + 2) == Some(&"links") {
            let home = parts[..st].join("/");
            global = Some(np::join(&[if home.is_empty() { "/" } else { &home }, "global", parts[st + 1]]));
        }
    }
    if global.is_none() {
        if let Some(at) = (0..parts.len()).find(|&k| parts[k] == "global" && isv(parts.get(k + 1)) && parts.get(k + 3) == Some(&"node_modules")) {
            if at > 0 {
                let j = parts[..at + 2].join("/");
                global = Some(if j.is_empty() { "/".into() } else { j });
            }
        }
    }
    let Some(g) = global else { return vec![] };
    let Some(mut names) = np::list_dir(&g) else { return vec![] };
    super::jsort::sort_strings(&mut names);
    let folders: Vec<String> = names.iter().map(|n| np::join2(&g, n)).filter(|d| np::exists(&np::join2(d, "package.json"))).collect();
    if folders.iter().any(|d| np::real_or_resolve(&np::join(&[d, "node_modules", "@astryxdesign", "cli"])) == cli) {
        folders
    } else {
        vec![]
    }
}

fn installed_names(root: &str) -> Vec<String> {
    let modules = np::join2(root, "node_modules");
    let mut names = Vec::new();
    let Some(entries) = np::list_dir_entries(&modules) else { return names };
    for e in entries {
        if e.name.starts_with('.') {
            continue;
        }
        if e.name.starts_with('@') {
            for sc in np::list_dir(&np::join2(&modules, &e.name)).unwrap_or_default() {
                if !sc.starts_with('.') {
                    names.push(format!("{}/{sc}", e.name));
                }
            }
        } else {
            names.push(e.name);
        }
    }
    super::jsort::sort_strings(&mut names);
    names
}

/// `peerProblem(pkg, release)`.
pub fn peer_problem(pkg: &Value, release: &str) -> Option<String> {
    let peers = pkg.get("peerDependencies")?.as_object()?;
    for peer in ["@astryxdesign/core", "@astryxdesign/cli"] {
        let Some(Value::String(range)) = peers.get(peer) else { continue };
        if !super::semver::satisfies_range(release, range) {
            return Some(format!("it needs {peer} {range}, and this computer's CLI is {release}"));
        }
    }
    None
}

/// `scanComputerIntegrations({cliRoot, release})`.
pub fn scan_computer_integrations(cli_root: &str, release: &str) -> Vec<ComputerCandidate> {
    let me = np::real_or_resolve(cli_root);
    let mut found = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for root in computer_install_roots(cli_root) {
        let declared: Vec<String> = if paths::read_package_json(&root).is_some() {
            read_declared_dependencies(&root).into_iter().map(|d| d.0).collect()
        } else {
            installed_names(&root)
        };
        for name in declared {
            if name == "@astryxdesign/cli" || name == "@astryxdesign/core" {
                continue;
            }
            let Some((package_dir, host_dir)) = (if is_bare_package_name(&name) { paths::find_node_modules_package(&root, &name) } else { None }) else {
                continue;
            };
            let identity = np::real_or_resolve(&package_dir);
            if identity == me || seen.contains(&identity) {
                continue;
            }
            if find_manifest_paths(&package_dir).len() != 1 {
                continue;
            }
            let Some(pkg) = paths::read_package_json(&package_dir) else { continue };
            let Some(pname) = pkg.get("name").and_then(|v| v.as_str()) else { continue };
            if pname == "@astryxdesign/cli" || pname == "@astryxdesign/core" {
                continue;
            }
            seen.push(identity);
            found.push(ComputerCandidate {
                name: pname.into(),
                version: pkg.get("version").and_then(|v| v.as_str()).map(String::from),
                description: pkg.get("description").and_then(|v| v.as_str()).map(String::from),
                package_dir,
                host_dir,
                incompatible: peer_problem(&pkg, release),
            });
        }
    }
    found
}

/// `loadComputerIntegrations(candidates, {exclude})`.
pub fn load_computer_integrations(cands: &[ComputerCandidate], exclude: &[String]) -> Vec<Candidate> {
    let mut out = Vec::new();
    for c in cands {
        if c.incompatible.is_some() || exclude.contains(&c.name) {
            continue;
        }
        match load_integrations(&[c.name.clone()], &c.host_dir, true) {
            Ok(list) => out.push(Candidate {
                source: "autolinked",
                spec: Some(c.name.clone()),
                package_dir: Some(c.package_dir.clone()),
                integration: list.into_iter().next().map(|mut r| {
                    r.insert("__computer".into(), Value::Bool(true));
                    r
                }),
                repeat: false,
                error: None,
            }),
            Err(e) => out.push(Candidate {
                source: "autolinked",
                spec: Some(c.name.clone()),
                package_dir: Some(c.package_dir.clone()),
                integration: None,
                repeat: false,
                error: Some(e),
            }),
        }
    }
    out
}

fn global_cli_root(cwd: &str) -> Option<String> {
    let folder = np::real_or_resolve(cwd);
    let own = computer_install_roots(paths::cli_root());
    if !own.is_empty() && !own.iter().any(|r| *r == folder || is_within(r, &folder)) {
        return Some(paths::cli_root().to_string());
    }
    for c in super::search_path::astryx_commands_on_search_path() {
        if let Some(root) = &c.cli_root {
            if super::package_manager::is_global_copy(root) {
                return Some(root.clone());
            }
        }
    }
    None
}

fn is_within(parent: &str, child: &str) -> bool {
    let rel = np::relative(parent, child);
    !(rel.is_empty() || rel.starts_with("..") || np::is_absolute(&rel))
}

/// `computerIntegrationCandidates(cwd)`.
pub fn computer_integration_candidates(cwd: &str) -> Vec<ComputerCandidate> {
    let outside = super::release::is_outside_project(cwd);
    let root = if outside { Some(paths::cli_root().to_string()) } else { global_cli_root(cwd) };
    match root {
        Some(r) => scan_computer_integrations(&r, &super::release::cli_version()),
        None => vec![],
    }
}

/// `availableComputerIntegrations(cwd, installed)`.
pub fn available_computer_integrations(cwd: &str, installed: &[String]) -> Vec<ComputerCandidate> {
    let cands: Vec<ComputerCandidate> =
        computer_integration_candidates(cwd).into_iter().filter(|c| c.incompatible.is_none() && !installed.contains(&c.name)).collect();
    if cands.is_empty() {
        return cands;
    }
    let loaded = load_computer_integrations(&cands, &[]);
    let usable: Vec<String> = loaded
        .iter()
        .filter(|e| e.integration.as_ref().map(|r| !has(r, "__loadError")).unwrap_or(false))
        .filter_map(|e| e.spec.clone())
        .collect();
    cands.into_iter().filter(|c| usable.contains(&c.name)).collect()
}
