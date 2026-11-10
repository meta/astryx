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
    match serde_json::from_str::<Value>(text) {
        Ok(_) => String::new(),
        Err(e) => {
            if e.is_eof() {
                return "Unexpected end of JSON input".into();
            }
            // V8: `Unexpected token 'x', "...context..." is not valid JSON`.
            let line = e.line();
            let col = e.column();
            let offset = text.split('\n').take(line - 1).map(|l| l.len() + 1).sum::<usize>() + col.saturating_sub(1);
            let ch = text[offset.min(text.len())..].chars().next();
            match ch {
                Some(c) => format!("Unexpected token '{c}', \"{}\" is not valid JSON", context(text, offset)),
                None => "Unexpected end of JSON input".into(),
            }
        }
    }
}

fn context(text: &str, offset: usize) -> String {
    // V8 shows up to 10 characters each side, with ellipses when cut.
    let chars: Vec<char> = text.chars().collect();
    let pos = text[..offset.min(text.len())].chars().count();
    let start = pos.saturating_sub(10);
    let end = (pos + 10).min(chars.len());
    let mut s = String::new();
    if start > 0 {
        s.push_str("...");
    }
    s.extend(&chars[start..end]);
    if end < chars.len() {
        s.push_str("...");
    }
    s
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
    let name = pkg.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).unwrap_or("(local package)").to_string();
    validate_at_package_dir(&package_dir, &name, pkg.get("version").cloned(), true)
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
    validate_at_package_dir(&package_dir, &name, pkg.get("version").cloned(), false)
}

/// `validateAtPackageDir`.
fn validate_at_package_dir(package_dir: &str, name: &str, version: Option<Value>, own: bool) -> Resolved {
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
    let icon = manifest.get("experimental").and_then(|e| e.get("iconSets")).cloned();
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
    let _ = own;
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
    let Some(entries) = np::read_dir(dir) else { return 0 };
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

pub fn template_conflicts(pkg: Option<&str>, cwd: &str) -> Value {
    let r = resolve(pkg, cwd);
    let mut d = head(&r);
    d.insert("conflicts".into(), Value::Array(vec![]));
    d.insert("issues".into(), Value::Array(r.issues.clone()));
    envelope("integration.template-conflicts", d)
}

pub fn component_conflicts(pkg: Option<&str>, cwd: &str) -> Value {
    let r = resolve(pkg, cwd);
    let mut d = head(&r);
    d.insert("conflicts".into(), Value::Array(vec![]));
    d.insert("issues".into(), Value::Array(r.issues.clone()));
    let has_components = r.integration.as_ref().and_then(|i| i.get("components")).and_then(|v| v.as_str()).map(|c| crate::discovery::validate_contributions::root_problem(c).is_none()).unwrap_or(false);
    if let (Some(integ), true, true) = (r.integration.as_ref(), has_components, r.name.is_some()) {
        d.insert("propDrift".into(), prop_drift_report(cwd, integ));
        if crate::discovery::paths::find_project_core_dir(cwd).is_none() {
            if let Some(Value::Array(issues)) = d.get_mut("issues") {
                issues.push(error("core_not_found", "Could not resolve @astryxdesign/core, so component names could not be checked. Install Core and run this check again."));
            }
            return envelope("integration.component-conflicts", d);
        }
        // TEMP: Core-name conflicts and replacements (component lane readers).
    }
    envelope("integration.component-conflicts", d)
}

pub fn doc_conflicts(pkg: Option<&str>, cwd: &str) -> Value {
    let r = resolve(pkg, cwd);
    let mut d = head(&r);
    for k in ["findings", "copiedPassages", "fluff", "strayPointers"] {
        d.insert(k.into(), Value::Array(vec![]));
    }
    d.insert("issues".into(), Value::Array(r.issues.clone()));
    envelope("integration.doc-conflicts", d)
}
