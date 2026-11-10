//! `validateIntegration` and the authoring checks' entry points
//! (`api/integration/validate-integration.mjs`, `authoring-checks.mjs`).
//! TEMP: once a manifest is found, the contribution validators, doc checks
//! and conflict discovery need discovery's integration readers; until they
//! land, a found package reports what loading its manifest says.

use super::error;
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};

pub const MANIFEST_BASENAMES: &[&str] = &["astryx.integration.ts", "astryx.integration.mjs", "astryx.integration.js"];

/// `ValidateResult`.
#[derive(Default)]
pub struct Resolved {
    pub found: bool,
    pub no_package_json: bool,
    pub name: Option<String>,
    pub version: Option<Value>,
    pub issues: Vec<Value>,
    pub notes: Vec<Value>,
    pub listed: Vec<Value>,
    pub integration: Option<Value>,
    pub public_imports: Option<Value>,
}

fn find_manifest_paths(dir: &str) -> Vec<String> {
    MANIFEST_BASENAMES.iter().map(|n| np::join2(dir, n)).filter(|p| np::exists(p)).collect()
}

fn find_nearest_package_json(cwd: &str) -> Option<String> {
    let mut dir = np::resolve1(cwd);
    loop {
        let c = np::join2(&dir, "package.json");
        if np::exists(&c) {
            return Some(c);
        }
        let parent = np::dirname(&dir);
        if parent == dir {
            return None;
        }
        dir = parent;
    }
}

fn json_parse_error(file: &str) -> String {
    // TEMP: Node's JSON.parse message wording; the shared JSON reader owns it.
    crate::discovery::nodepath::read_text(file)
        .map(|t| js_json_error(&t))
        .unwrap_or_else(|| "Unexpected end of JSON input".into())
}

/// V8's `JSON.parse` error message for text that does not parse.
pub fn js_json_error(text: &str) -> String {
    // A BOM is not stripped by readFileSync, so it is a token to JSON.parse.
    super::super::jsonerr::json_parse_error(text).unwrap_or_default()
}

/// `validateLocalIntegration(cwd)`.
pub fn validate_local(cwd: &str) -> Resolved {
    let Some(pkg_json) = find_nearest_package_json(cwd) else {
        return Resolved { no_package_json: true, ..Default::default() };
    };
    let package_dir = np::dirname(&pkg_json);
    let manifests = find_manifest_paths(&package_dir);
    if manifests.is_empty() {
        return Resolved::default();
    }
    let Some(pkg) = np::read_json(&pkg_json) else {
        return Resolved {
            found: true,
            name: Some("(local package)".into()),
            issues: vec![error("invalid_package_json", format!("Could not parse {pkg_json}: {}", json_parse_error(&pkg_json)))],
            ..Default::default()
        };
    };
    let fields = package_json_field_issues(&pkg, &pkg_json);
    let name = pkg.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).unwrap_or("(local package)").to_string();
    let mut r = validate_at_package_dir(&package_dir, &name, pkg.get("version").cloned(), Opts { own: true, cwd: package_dir.clone(), icon_sets: true, scan: true });
    let mut head = fields;
    if let Some(integ) = &r.integration {
        let manifest = integ.get("__manifestFile").and_then(|v| v.as_str()).unwrap_or("");
        head.extend(provider_id_issues(pkg.get("name"), integ.get("__declaredProviderId"), manifest));
    }
    head.append(&mut r.listed);
    r.listed = head;
    r
}

fn listed_issue(code: &str, message: String) -> Value {
    super::issue(code, "warning", message)
}

/// `packageJsonFieldIssues(pkg, pkgJsonPath)`.
fn package_json_field_issues(pkg: &Value, pkg_json: &str) -> Vec<Value> {
    let shown = np::basename(pkg_json);
    let mut out = Vec::new();
    if !matches!(pkg.get("name"), Some(Value::String(s)) if !s.is_empty()) {
        out.push(listed_issue(
            "invalid_package_json",
            format!("{shown} has no \"name\", so npm cannot pack or publish the package, and a project that installs it has no name to select it by. Fix: add \"name\": \"@your-scope/your-package\" to {shown}."),
        ));
    }
    if pkg.get("private") != Some(&Value::Bool(true)) && !matches!(pkg.get("version"), Some(Value::String(s)) if !s.is_empty()) {
        out.push(listed_issue(
            "invalid_package_json",
            format!("{shown} has no \"version\", so npm cannot pack or publish the package. Fix: add \"version\": \"0.1.0\" to {shown}."),
        ));
    }
    out
}

/// `providerIdIssues(name, declared, manifestFile)`.
fn provider_id_issues(name: Option<&Value>, declared: Option<&Value>, manifest_file: &str) -> Vec<Value> {
    let is_pkg = |n: &str| crate::discovery::integrations::normalize_provider_id(n).is_ok();
    let Some(Value::String(name)) = name else { return vec![] };
    if name.is_empty() || is_pkg(name) {
        return vec![];
    }
    if let Some(Value::String(d)) = declared {
        if is_pkg(d) {
            return vec![];
        }
    }
    let manifest = np::basename(manifest_file);
    vec![listed_issue(
        "no_provider_id",
        format!(
            "No provider ID can be derived for this package: package.json \"name\" {} is not a bare package name (an optional @scope/ and a name, each starting with a lowercase letter or digit and holding only lowercase letters, digits, \"-\", \".\", \"_\" and \"~\"), and {manifest} declares no providerId that is one. Astryx files the package's components, templates and docs under that ID, so links to them and selecting the package cannot work. Fix: rename the package, such as \"@your-scope/your-package\", or set `providerId: '@your-scope/your-package'` in {manifest}.",
            crate::json::stringify(&Value::String(name.clone()), 0)
        ),
    )]
}

pub struct Opts {
    pub own: bool,
    pub cwd: String,
    pub icon_sets: bool,
    pub scan: bool,
}

/// `projectUsesIconSets(cwd)`.
fn project_uses_icon_sets(cwd: &str) -> bool {
    match crate::discovery::project::Project::load_with(cwd, false) {
        Ok(p) => crate::commands::doctor::util::truthy(p.config.get("experimental").and_then(|e| e.get("iconSet"))),
        Err(_) => false,
    }
}

/// `validateInstalledIntegration(spec, cwd)`.
pub fn validate_installed(spec: &str, cwd: &str) -> Resolved {
    let invalid = spec.is_empty() || spec.starts_with('/') || spec.split('/').any(|s| s == ".." || s == ".");
    if invalid {
        return Resolved {
            found: true,
            name: Some(spec.into()),
            issues: vec![error(
                "invalid_package_spec",
                format!("Invalid integration package name \"{spec}\". Use a bare package name (no path segments)."),
            )],
            ..Default::default()
        };
    }
    let node_modules = np::resolve(&[cwd, "node_modules"]);
    let parts: Vec<&str> = spec.split('/').collect();
    let mut segs = vec![node_modules.as_str()];
    segs.extend(parts.iter());
    let own = np::resolve(&segs);
    if own != node_modules && !own.starts_with(&format!("{node_modules}/")) {
        return Resolved {
            found: true,
            name: Some(spec.into()),
            issues: vec![error("invalid_package_spec", format!("Integration \"{spec}\" resolves outside node_modules."))],
            ..Default::default()
        };
    }
    let package_dir = crate::discovery::paths::find_node_modules_package(cwd, spec).map(|(d, _)| d).unwrap_or(own);
    let pkg_json = np::join2(&package_dir, "package.json");
    let Some(pkg) = np::read_json(&pkg_json) else {
        let exists = np::exists(&pkg_json);
        return Resolved {
            found: true,
            name: Some(spec.into()),
            issues: vec![if exists {
                error("invalid_package_json", format!("Could not parse {pkg_json}: {}", json_parse_error(&pkg_json)))
            } else {
                error("package_not_found", format!("Could not find installed integration package \"{spec}\" at {pkg_json}. Install it first."))
            }],
            ..Default::default()
        };
    };
    let name = match pkg.get("name") {
        None | Some(Value::Null) => spec.to_string(),
        Some(v) => crate::cli::format::js_string(v),
    };
    let icon_sets = project_uses_icon_sets(cwd);
    validate_at_package_dir(&package_dir, &name, pkg.get("version").cloned(), Opts { own: false, cwd: cwd.to_string(), icon_sets, scan: false })
}

/// `validateAtPackageDir`.
fn validate_at_package_dir(package_dir: &str, name: &str, version: Option<Value>, opts: Opts) -> Resolved {
    let own = opts.own;
    use crate::discovery::integrations as integ;
    use crate::discovery::validate_contributions as vc;
    let mut r = Resolved { found: true, name: Some(name.into()), version: version.clone(), ..Default::default() };
    let manifests = find_manifest_paths(package_dir);
    if manifests.is_empty() {
        r.issues.push(error("missing_manifest", format!("No astryx.integration.{{ts,mjs,js}} found next to package.json in {package_dir}.")));
        return r;
    }
    if manifests.len() > 1 {
        r.issues.push(error(
            "multiple_manifests",
            format!(
                "Multiple root manifests present ({}). Keep exactly one.",
                manifests.iter().map(|m| np::basename(m)).collect::<Vec<_>>().join(", ")
            ),
        ));
        return r;
    }
    let manifest_file = manifests[0].clone();
    let loaded = match integ::load_manifest(&manifest_file, &format!("Integration manifest ({})", np::basename(&manifest_file))) {
        Ok(m) => m,
        Err(e) => {
            r.issues.push(error("invalid_manifest", e));
            return r;
        }
    };
    let manifest = &loaded.manifest;
    let mut absolute_roots: Vec<String> = Vec::new();
    let mut resolve_root = |r: &mut Resolved, value: Option<&Value>, key: &str| -> Option<String> {
        let v = value.and_then(|v| v.as_str())?;
        if np::is_absolute(v) {
            let inside = np::relative(package_dir, v);
            let relative = if inside.is_empty() || (!inside.starts_with("..") && !np::is_absolute(&inside)) {
                let s = format!("./{inside}");
                Some(s.strip_suffix('/').map(String::from).unwrap_or(s))
            } else {
                None
            };
            let tail = match &relative {
                Some(rel) => format!(
                    " Fix: set `{key}: '{}'` in {}.",
                    if rel == "./" { "." } else { rel.as_str() },
                    np::basename(&manifest_file)
                ),
                None => format!(" It also points outside the package. Fix: move the files into the package and set `{key}` to their folder relative to package.json, such as './{key}'."),
            };
            r.issues.push(error(
                "root_outside_package",
                format!("The {key} root \"{v}\" is an absolute path, so Astryx reads nothing from it: a root is relative to the package, so it resolves the same wherever the package is installed.{tail}"),
            ));
            if relative.is_some() {
                absolute_roots.push(np::resolve1(v));
            }
            return None;
        }
        match integ::assert_within(v, package_dir, "contribution root") {
            Ok(p) => Some(p),
            Err(_) => {
                r.issues.push(error(
                    "root_outside_package",
                    format!("The contribution root \"{v}\" resolves outside the integration package directory. Contribution roots must stay within the package."),
                ));
                None
            }
        }
    };
    let mut rec = Map::new();
    rec.insert("name".into(), Value::String(name.into()));
    rec.insert("version".into(), version.clone().unwrap_or(Value::Null));
    for key in ["components", "templates", "codemods", "docs", "themes"] {
        let root = resolve_root(&mut r, manifest.get(key), key);
        rec.insert(key.into(), root.map(Value::String).unwrap_or(Value::Null));
    }
    let icon = if opts.icon_sets { manifest.get("experimental").and_then(|e| e.get("iconSets")).cloned() } else { None };
    let icon_root = resolve_root(&mut r, icon.as_ref(), "experimental.iconSets");
    rec.insert("iconSets".into(), icon_root.map(Value::String).unwrap_or(Value::Null));
    for (k, src) in [("issuesUrl", "issuesUrl"), ("agentDocs", "agentDocs"), ("cliCommand", "cliCommand")] {
        rec.insert(k.into(), manifest.get(src).cloned().unwrap_or(Value::Null));
    }
    rec.insert("__cliCommandError".into(), loaded.cli_command_error.clone().map(Value::String).unwrap_or(Value::Null));
    rec.insert("__agentDocsError".into(), loaded.agent_docs_error.clone().map(Value::String).unwrap_or(Value::Null));
    rec.insert("__unknownKeys".into(), Value::Array(loaded.unknown_keys.iter().cloned().map(Value::String).collect()));
    rec.insert("__declaredKeys".into(), Value::Array(loaded.declared_keys.iter().cloned().map(Value::String).collect()));
    rec.insert("__spec".into(), Value::String(name.into()));
    rec.insert("__declaredProviderId".into(), manifest.get("providerId").cloned().unwrap_or(Value::Null));
    rec.insert("__packageDir".into(), Value::String(package_dir.into()));
    rec.insert("__manifestFile".into(), Value::String(manifest_file.clone()));
    for f in vc::all_findings(&rec) {
        let v = super::issue(&f.code, f.severity, f.message.clone());
        if f.listed {
            r.listed.push(v);
        } else if f.code == "invalid_cli_command" {
            let mut m = Map::new();
            m.insert("code".into(), Value::String(f.code));
            m.insert("message".into(), Value::String(f.message));
            r.notes.push(Value::Object(m));
        } else {
            r.issues.push(v);
        }
    }
    let integ_rec = rec.clone();
    {
        let choice = crate::discovery::release::run_choice(&opts.cwd);
        let from = if choice.in_project && choice.copy == "starting" { choice.core_version.clone() } else { None };
        if let Some(p) = crate::discovery::cli_requirement::cli_peer_version_problem(&integ_rec, None, &opts.cwd, own, from.as_deref()) {
            let mut m = Map::new();
            m.insert("code".into(), Value::String("cli_peer_version".into()));
            m.insert("message".into(), Value::String(p));
            r.notes.push(Value::Object(m));
        }
    }
    // TEMP: unread theme folders and icon-set checks (theme and icon readers).
    let usable = |k: &str| rec.get(k).and_then(|v| v.as_str()).filter(|r| vc::root_problem(r).is_none()).map(String::from);
    let mut consistency_rec = Map::new();
    consistency_rec.insert("components".into(), usable("components").map(Value::String).unwrap_or(Value::Null));
    consistency_rec.insert("docs".into(), usable("docs").map(Value::String).unwrap_or(Value::Null));
    for i in crate::discovery::doc_consistency::integration_doc_consistency(&consistency_rec, package_dir) {
        r.issues.push(i);
    }
    let (public_notes, report) = super::public_imports::public_import_issues(package_dir, &rec);
    for n in public_notes {
        let mut m = n.as_object().cloned().unwrap_or_default();
        m.insert("next".into(), Value::Bool(true));
        r.notes.push(Value::Object(m));
    }
    r.public_imports = Some(report);
    r.integration = Some(Value::Object(rec));
    r
}

/// TypeScript as `resolveProjectTypeScript([cwd, packageDir])` finds it:
/// None when it is not installed, Some(version) when it is.
/// TEMP: running a project's TypeScript compiler needs the JS engine; until
/// then an installed compiler is reported by version only.
pub fn project_typescript(dirs: &[&str]) -> Option<String> {
    for d in dirs {
        let mut dir = np::resolve1(d);
        loop {
            let pj = np::join(&[&dir, "node_modules", "typescript", "package.json"]);
            if let Some(v) = np::read_json(&pj).and_then(|p| p.get("version").and_then(|x| x.as_str()).map(String::from)) {
                return Some(v);
            }
            let parent = np::dirname(&dir);
            if parent == dir {
                break;
            }
            dir = parent;
        }
    }
    None
}

const TYPESCRIPT_FIX: &str = "On TypeScript 7, add its TypeScript 6 API package (`npm install -D @typescript/typescript6`); otherwise install TypeScript 5.0 through 6 (`npm install -D typescript@6`). Then run this check again.";

fn prop_drift_report(cwd: &str, integration: &Value) -> Value {
    let pd = integration.get("__packageDir").and_then(|v| v.as_str()).unwrap_or(cwd).to_string();
    let _ts = project_typescript(&[cwd, &pd]);
    let mut m = Map::new();
    m.insert("status".into(), Value::String("skipped".into()));
    m.insert(
        "reason".into(),
        Value::String(format!("TypeScript is not installed in this project, so documented props were not compared with the code. {TYPESCRIPT_FIX}")),
    );
    m.insert("components".into(), Value::from(0));
    m.insert("typesCompared".into(), Value::from(0));
    for k in ["findings", "unchecked", "typesNotCompared"] {
        m.insert(k.into(), Value::Array(vec![]));
    }
    Value::Object(m)
}

fn doc_types_report(cwd: &str, integration: &Value) -> Value {
    let pd = integration.get("__packageDir").and_then(|v| v.as_str()).unwrap_or(cwd).to_string();
    let mut files = 0usize;
    for k in ["components", "templates", "docs", "themes"] {
        if let Some(root) = integration.get(k).and_then(|v| v.as_str()) {
            files += count_docs(root);
        }
    }
    let mut m = Map::new();
    if files == 0 {
        m.insert("status".into(), Value::String("checked".into()));
    } else {
        let _ts = project_typescript(&[cwd, &pd]);
        m.insert("status".into(), Value::String("skipped".into()));
        m.insert(
            "reason".into(),
            Value::String(format!("TypeScript is not installed in this project, so docs were not checked against the authoring types. {TYPESCRIPT_FIX}")),
        );
    }
    m.insert("docs".into(), Value::from(0));
    m.insert("findings".into(), Value::Array(vec![]));
    m.insert("unchecked".into(), Value::Array(vec![]));
    Value::Object(m)
}

fn count_docs(dir: &str) -> usize {
    let Some(entries) = crate::commands::doctor::support::read_dir_sorted(dir) else { return 0 };
    let mut n = 0;
    for e in entries {
        if e.name == "node_modules" || e.name.starts_with('.') {
            continue;
        }
        let full = np::join2(dir, &e.name);
        if e.is_dir {
            n += count_docs(&full);
        } else if crate::doctor_re!(r"\.doc\.(?:ts|mjs|js)$").find(&e.name).is_some() {
            n += 1;
        }
    }
    n
}

fn empty_checked() -> Value {
    let mut m = Map::new();
    m.insert("status".into(), Value::String("checked".into()));
    m.insert("findings".into(), Value::Array(vec![]));
    m.insert("unchecked".into(), Value::Array(vec![]));
    Value::Object(m)
}

fn resolve(pkg: Option<&str>, cwd: &str) -> Resolved {
    match pkg {
        Some(p) => validate_installed(p, cwd),
        None => validate_local(cwd),
    }
}

fn head(r: &Resolved) -> Map<String, Value> {
    let mut d = Map::new();
    d.insert("validated".into(), Value::Bool(r.found));
    d.insert("name".into(), if r.found { r.name.clone().map(Value::String).unwrap_or(Value::Null) } else { Value::Null });
    d.insert(
        "version".into(),
        if r.found { r.version.clone().filter(|v| !v.is_null()).unwrap_or(Value::Null) } else { Value::Null },
    );
    d
}

fn envelope(kind: &str, data: Map<String, Value>) -> Value {
    let mut m = Map::new();
    m.insert("type".into(), Value::String(kind.into()));
    m.insert("data".into(), Value::Object(data));
    Value::Object(m)
}

/// `validateIntegration(pkg, {cwd})`.
pub fn validate_integration(pkg: Option<&str>, cwd: &str) -> Value {
    let r = resolve(pkg, cwd);
    let mut d = head(&r);
    let issues = if r.no_package_json {
        vec![error("no_package", "No package.json found. Run this command inside a package directory.")]
    } else {
        r.issues.clone()
    };
    d.insert("issues".into(), Value::Array(issues));
    let mut notes: Vec<Value> = Vec::new();
    if r.found {
        notes.extend(r.notes.iter().cloned());
        for l in &r.listed {
            let mut m = Map::new();
            m.insert("code".into(), l.get("code").cloned().unwrap_or(Value::Null));
            m.insert("message".into(), l.get("message").cloned().unwrap_or(Value::Null));
            m.insert("next".into(), Value::Bool(true));
            notes.push(Value::Object(m));
        }
    }
    let examples = r.integration.as_ref().filter(|_| r.found).map(super::examples::component_examples_check);
    if let Some(ex) = &examples {
        notes.extend(ex.notes.iter().cloned());
    }
    if let Some(integ) = r.integration.as_ref().filter(|_| r.found) {
        if let (Some(rec), true) = (integ.as_object(), !crate::commands::doctor::util::nullish(integ.get("docs"))) {
            let pd = rec.get("__packageDir").and_then(|v| v.as_str()).map(String::from);
            let docs = crate::discovery::docs_discovery::discover_integration_docs(rec);
            for each in crate::discovery::runner_commands::find_doc_commands(&docs) {
                let message = match &pd {
                    Some(p) => format!("{}: {}", np::relative(p, &each.file), each.message),
                    None => each.message.clone(),
                };
                let mut m = Map::new();
                m.insert("code".into(), Value::String(each.code.into()));
                m.insert("message".into(), Value::String(message));
                m.insert("next".into(), Value::Bool(true));
                notes.push(Value::Object(m));
            }
            // TEMP: docTargetNotes (the docs tree's target reader).
        }
    }
    if !notes.is_empty() {
        d.insert("notes".into(), Value::Array(notes));
    }
    if let Some(integ) = r.integration.as_ref().filter(|_| r.found) {
        d.insert("docTypes".into(), doc_types_report(cwd, integ));
        d.insert("docNames".into(), empty_checked());
        d.insert("blockComponents".into(), empty_checked());
    }
    if let Some(ex) = examples.filter(|e| !e.unchecked.is_empty()) {
        let mut m = Map::new();
        m.insert("status".into(), Value::String("checked".into()));
        m.insert("findings".into(), Value::Array(vec![]));
        m.insert("unchecked".into(), Value::Array(ex.unchecked));
        d.insert("exampleAssets".into(), Value::Object(m));
    }
    if r.found {
        if let Some(p) = &r.public_imports {
            d.insert("publicImports".into(), p.clone());
        }
    }
    envelope("integration.validate", d)
}

/// `resolveIntegration(pkg, cwd)` (authoring-checks): unusable roots dropped,
/// the provider ID set or the package marked unnamed.
fn resolve_usable(pkg: Option<&str>, cwd: &str) -> Resolved {
    let mut r = resolve(pkg, cwd);
    if !r.found {
        return r;
    }
    if let Some(Value::Object(m)) = &mut r.integration {
        let id = m.get("__declaredProviderId").filter(|v| !v.is_null()).or_else(|| m.get("name")).and_then(|v| v.as_str()).map(String::from);
        match id.as_deref().map(crate::discovery::integrations::normalize_provider_id) {
            Some(Ok(p)) => {
                m.insert("providerId".into(), Value::String(p));
            }
            _ => {
                m.insert("__unnamed".into(), Value::Bool(true));
            }
        }
        for k in ["components", "templates", "codemods", "docs", "themes"] {
            let bad = m.get(k).and_then(|v| v.as_str()).map(|r| crate::discovery::validate_contributions::root_problem(r).is_some()).unwrap_or(false);
            if bad {
                m.insert(k.into(), Value::Null);
            }
        }
    }
    r
}

/// `addErrors(issues, errors, code)`.
fn add_error(issues: &mut Vec<Value>, code: &str, severity: &str, message: &str) {
    if issues.iter().any(|i| i.get("code").and_then(|v| v.as_str()) == Some(code) && i.get("message").and_then(|v| v.as_str()) == Some(message)) {
        return;
    }
    issues.push(super::issue(code, severity, message.to_string()));
}

fn shell_arg(v: &str) -> String {
    if crate::doctor_re!(r"^[A-Za-z0-9@/._-]+$").find(v).is_some() {
        v.to_string()
    } else {
        format!("'{}'", v.replace('\'', "'\\''"))
    }
}

pub fn template_conflicts(pkg: Option<&str>, cwd: &str) -> Value {
    use crate::commands::template::discovery as td;
    let r = resolve_usable(pkg, cwd);
    let mut d = head(&r);
    let mut issues = r.issues.clone();
    let name = if r.found { r.name.clone() } else { None };
    let (Some(integ), Some(name)) = (r.integration.as_ref().and_then(|i| i.as_object()), name) else {
        d.insert("conflicts".into(), Value::Array(vec![]));
        d.insert("issues".into(), Value::Array(issues));
        return envelope("integration.template-conflicts", d);
    };
    let (templates, errors) = crate::commands::template::integration::for_one(integ);
    let core_templates = td::discover_core(std::path::Path::new(&crate::discovery::paths::cli_root()));
    for e in &errors {
        let sev = if e.severity.as_deref() == Some("warning") { "warning" } else { "error" };
        add_error(&mut issues, e.code.as_deref().unwrap_or("invalid_template"), sev, &e.message);
    }
    let mut all = core_templates.clone();
    all.extend(templates.iter().cloned());
    let (resolved, rerrors) = td::apply_replacements_with_errors(all, errors.iter().filter(|e| e.replacement_target.is_some()).cloned().collect());
    for e in rerrors {
        let code = e.code.clone().unwrap_or_default();
        let sev = e.severity.clone().unwrap_or_else(|| "error".into());
        add_error(&mut issues, &code, &sev, &e.message);
    }
    let active: Vec<String> = resolved.iter().filter(|t| t.package.as_deref() == Some(name.as_str()) && t.replaces.is_some()).map(|t| t.dir_name.clone()).collect();
    let mut core_by_id: Vec<(String, Vec<(String, String)>)> = Vec::new();
    for t in &core_templates {
        match core_by_id.iter_mut().find(|(k, _)| *k == t.dir_name) {
            Some(e) => e.1.push((t.kind.clone(), t.name.clone())),
            None => core_by_id.push((t.dir_name.clone(), vec![(t.kind.clone(), t.name.clone())])),
        }
    }
    for (_, m) in core_by_id.iter_mut() {
        m.sort_by(|a, b| crate::discovery::jsort::locale_compare(&format!("{}:{}", a.0, a.1), &format!("{}:{}", b.0, b.1)));
    }
    let run = crate::discovery::package_manager::get_cli_invocation(Some(cwd));
    let mut conflicts: Vec<(String, Value)> = Vec::new();
    for t in &templates {
        let Some((_, same)) = core_by_id.iter().find(|(k, _)| *k == t.dir_name) else { continue };
        let replacement_active = active.contains(&t.dir_name);
        if replacement_active && t.replaces.as_deref() == Some(t.dir_name.as_str()) {
            continue;
        }
        let kinds = same.iter().map(|(k, n)| format!("{k} \"{n}\"")).collect::<Vec<_>>().join(", ");
        let mut m = Map::new();
        m.insert("id".into(), Value::String(t.dir_name.clone()));
        m.insert("severity".into(), Value::String("warning".into()));
        m.insert("integrationPackage".into(), Value::String(name.clone()));
        m.insert("integrationType".into(), Value::String(t.kind.clone()));
        m.insert("integrationName".into(), Value::String(t.name.clone()));
        m.insert(
            "coreMatches".into(),
            Value::Array(
                same.iter()
                    .map(|(k, n)| {
                        let mut x = Map::new();
                        x.insert("type".into(), Value::String(k.clone()));
                        x.insert("name".into(), Value::String(n.clone()));
                        Value::Object(x)
                    })
                    .collect(),
            ),
        );
        m.insert(
            "message".into(),
            Value::String(format!("Template id \"{}\" conflicts with Core ({kinds}). Consider renaming the integration template. If you keep it, always select it with --package.", t.dir_name)),
        );
        m.insert("command".into(), Value::String(format!("{run} template {} --package {}", shell_arg(&t.dir_name), shell_arg(&name))));
        conflicts.push((format!("{}:", t.dir_name), Value::Object(m)));
    }
    conflicts.sort_by(|a, b| crate::discovery::jsort::locale_compare(&a.0, &b.0));
    d.insert("conflicts".into(), Value::Array(conflicts.into_iter().map(|(_, v)| v).collect()));
    d.insert("issues".into(), Value::Array(issues));
    envelope("integration.template-conflicts", d)
}

pub fn component_conflicts(pkg: Option<&str>, cwd: &str) -> Value {
    let r = resolve_usable(pkg, cwd);
    let mut d = head(&r);
    let mut issues = r.issues.clone();
    let name = if r.found { r.name.clone() } else { None };
    let integ = r.integration.as_ref().and_then(|i| i.as_object()).filter(|i| i.get("components").and_then(|v| v.as_str()).is_some());
    let (Some(integ), Some(name)) = (integ, name) else {
        d.insert("conflicts".into(), Value::Array(vec![]));
        d.insert("issues".into(), Value::Array(issues));
        return envelope("integration.component-conflicts", d);
    };
    let prop_drift = prop_drift_report(cwd, &Value::Object(integ.clone()));
    // TEMP: packageComponentLinkProblems (docs lane's graph reader).
    let Some(core_dir) = crate::discovery::paths::find_project_core_dir(cwd) else {
        issues.push(error("core_not_found", "Could not resolve @astryxdesign/core, so component names could not be checked. Install Core and run this check again."));
        d.insert("conflicts".into(), Value::Array(vec![]));
        d.insert("issues".into(), Value::Array(issues));
        d.insert("propDrift".into(), prop_drift);
        return envelope("integration.component-conflicts", d);
    };
    let core_path = std::path::PathBuf::from(&core_dir);
    let core_names: Vec<String> = crate::discovery::component_discovery::discover_owned_components(&core_path, &[])
        .into_iter()
        .filter(|c| c.package == "@astryxdesign/core")
        .map(|c| c.name)
        .collect();
    let li = crate::discovery::validate_contributions::loaded_integration(integ);
    let reps = crate::discovery::component_replacement::resolve_component_replacements(Some(&core_path), std::slice::from_ref(&li), &crate::commands::doctor::env::fmt0("component --list"));
    for f in &reps.findings {
        add_error(&mut issues, if f.code.is_empty() { "invalid_component_replacement" } else { &f.code }, if f.severity == "warning" { "warning" } else { "error" }, &f.message);
    }
    let intentional: Vec<String> = reps.active.iter().filter(|a| a.package == name && a.name == a.target).map(|a| a.name.clone()).collect();
    let run = crate::discovery::package_manager::get_cli_invocation(Some(cwd));
    let mut conflicts: Vec<(String, Value)> = crate::discovery::component_discovery::discover_integration_components(&li, false)
        .into_iter()
        .filter(|c| core_names.contains(&c.name) && !intentional.contains(&c.name))
        .map(|c| {
            let mut m = Map::new();
            m.insert("name".into(), Value::String(c.name.clone()));
            m.insert("severity".into(), Value::String("warning".into()));
            m.insert("integrationPackage".into(), Value::String(name.clone()));
            m.insert(
                "message".into(),
                Value::String(format!("Component \"{}\" conflicts with Core. Consider renaming the integration component. If you keep it, always select it with --package.", c.name)),
            );
            m.insert("command".into(), Value::String(format!("{run} component {} --package {}", shell_arg(&c.name), shell_arg(&name))));
            (c.name, Value::Object(m))
        })
        .collect();
    conflicts.sort_by(|a, b| crate::discovery::jsort::locale_compare(&a.0, &b.0));
    d.insert("conflicts".into(), Value::Array(conflicts.into_iter().map(|(_, v)| v).collect()));
    d.insert("issues".into(), Value::Array(issues));
    d.insert("propDrift".into(), prop_drift);
    envelope("integration.component-conflicts", d)
}

const UNNAMED_PROVIDER: &str = "astryx-unnamed-local-package";

fn unnamed_shown(m: &str) -> String {
    m.split(&format!("{UNNAMED_PROVIDER}/")).collect::<Vec<_>>().join("").split(UNNAMED_PROVIDER).collect::<Vec<_>>().join("this package")
}

fn stray_components(integ: &Map<String, Value>) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    if integ.get("components").and_then(|v| v.as_str()).is_none() {
        return out;
    }
    let li = crate::discovery::validate_contributions::loaded_integration(integ);
    for r in crate::discovery::component_discovery::discover_valid_integration_components(&li, false).components {
        let f = r.doc_path.to_string_lossy().into_owned();
        if out.iter().any(|(_, x)| *x == f) {
            continue;
        }
        out.push((r.name.clone(), f));
    }
    out
}

pub fn doc_conflicts(pkg: Option<&str>, cwd: &str) -> Value {
    use crate::discovery::docs_discovery as dd;
    let r = resolve_usable(pkg, cwd);
    let mut d = head(&r);
    let mut issues = r.issues.clone();
    let name = if r.found { r.name.clone() } else { None };
    let integ = r.integration.as_ref().and_then(|i| i.as_object()).cloned();
    let pd = integ.as_ref().and_then(|i| i.get("__packageDir")).and_then(|v| v.as_str()).map(String::from);
    let from_pkg = |f: &str| match &pd {
        Some(p) => np::relative(p, f),
        None => f.to_string(),
    };
    let mut copied: Vec<Value> = Vec::new();
    let mut fluff: Vec<Value> = Vec::new();
    let mut stray: Vec<Value> = Vec::new();
    let mut findings: Vec<(String, Value)> = Vec::new();
    let has_docs = integ.as_ref().map(|i| i.get("docs").and_then(|v| v.as_str()).is_some()).unwrap_or(false);
    if !has_docs || name.is_none() {
        if let (Some(_), Some(i)) = (&name, &integ) {
            if i.get("components").and_then(|v| v.as_str()).is_some() {
                let empty = dd::IntegrationDocs::default();
                for s in crate::discovery::stray_pointers::find_stray_pointers(&empty, &stray_components(i)) {
                    issues.push(super::issue("stray_doc_pointer", "warning", s.message.clone()));
                    let mut v = s.to_json();
                    if let Value::Object(m) = &mut v {
                        m.insert("file".into(), Value::String(from_pkg(&s.file)));
                    }
                    stray.push(v);
                }
            }
        }
    } else {
        let mut docs_integ = integ.clone().unwrap();
        if docs_integ.get("__unnamed") == Some(&Value::Bool(true)) {
            docs_integ.insert("name".into(), Value::String(UNNAMED_PROVIDER.into()));
            docs_integ.insert("providerId".into(), Value::String(UNNAMED_PROVIDER.into()));
        }
        let discovered = dd::discover_integration_docs(&docs_integ);
        for e in &discovered.errors {
            add_error(&mut issues, "invalid_doc", "error", e);
        }
        let builtin = dd::discover_builtin_topics();
        let core_topic = |k: &str| builtin.iter().find(|(t, _)| t.to_lowercase() == k.to_lowercase()).map(|(t, _)| t.clone());
        let finding = |topic: &str, severity: &str, rel: &str, core: &str, message: String| {
            let mut m = Map::new();
            m.insert("topic".into(), Value::String(topic.into()));
            m.insert("severity".into(), Value::String(severity.into()));
            m.insert("relationship".into(), Value::String(rel.into()));
            m.insert("coreTopic".into(), Value::String(core.into()));
            m.insert("message".into(), Value::String(message));
            (format!("{topic}:{rel}"), Value::Object(m))
        };
        for rec in &discovered.records {
            let replaced = rec.replaces.as_deref().and_then(|x| core_topic(x));
            let extended = rec.extends_topic.as_deref().and_then(|x| core_topic(x));
            let same = core_topic(&rec.name);
            if let Some(c) = &replaced {
                findings.push(finding(&rec.name, "info", "replaces", c, format!("Intentional override: \"{}\" replaces the Core topic \"{c}\".", rec.name)));
            }
            if let Some(c) = &extended {
                findings.push(finding(&rec.name, "info", "extends", c, format!("Intentional extension: \"{}\" extends the Core topic \"{c}\".", rec.name)));
            }
            let guide_route = rec.replaces.as_deref().map(|x| x.contains('/')).unwrap_or(false);
            if let Some(c) = &same {
                if rec.extends_topic.is_none() && !guide_route && replaced.as_ref() != Some(c) {
                    findings.push(finding(
                        &rec.name,
                        "error",
                        "accidental",
                        c,
                        format!("Accidental conflict: \"{}\" is already a Core topic. Rename it, declare replaces: '{c}' to take it over, or declare extends: '{c}' to merge sections.", rec.name),
                    ));
                }
            }
        }
        // TEMP: CLI-guide targets, docs graph and reference checks (docs lane).
        findings.sort_by(|a, b| crate::discovery::jsort::locale_compare(&a.0, &b.0));
        if discovered.errors.is_empty() {
            for c in crate::discovery::copied_passages::find_copied_passages(&discovered) {
                let msg = unnamed_shown(&c.message);
                issues.push(super::issue("copied_passage", "warning", msg.clone()));
                let mut v = c.to_json();
                if let Value::Object(m) = &mut v {
                    m.insert("message".into(), Value::String(msg));
                }
                copied.push(v);
            }
            for f in crate::discovery::doc_fluff::find_fluff(&discovered) {
                let msg = unnamed_shown(&f.message);
                issues.push(super::issue("doc_fluff", "warning", msg.clone()));
                let mut v = f.to_json();
                if let Value::Object(m) = &mut v {
                    m.insert("file".into(), Value::String(from_pkg(&f.file)));
                    m.insert("message".into(), Value::String(msg));
                }
                fluff.push(v);
            }
            for s in crate::discovery::stray_pointers::find_stray_pointers(&discovered, &stray_components(integ.as_ref().unwrap())) {
                issues.push(super::issue("stray_doc_pointer", "warning", s.message.clone()));
                let mut v = s.to_json();
                if let Value::Object(m) = &mut v {
                    m.insert("file".into(), Value::String(from_pkg(&s.file)));
                }
                stray.push(v);
            }
        }
    }
    d.insert("findings".into(), Value::Array(findings.into_iter().map(|(_, v)| v).collect()));
    d.insert("copiedPassages".into(), Value::Array(copied));
    d.insert("fluff".into(), Value::Array(fluff));
    d.insert("strayPointers".into(), Value::Array(stray));
    d.insert("issues".into(), Value::Array(issues));
    envelope("integration.doc-conflicts", d)
}
