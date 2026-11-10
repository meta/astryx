//! The loaded project doctor reads (`Project.load(cwd, {core: 'project'})`
//! and the provider ledger), plus small readers of `config` and
//! `integrations/autolink`.
//! TEMP: replace `load` with src/discovery Project.load when it lands.

use crate::discovery::nodepath as np;
use crate::json::Value;

#[derive(Debug, Clone)]
pub struct Configured {
    pub spec: String,
    pub label: String,
    pub error: Option<String>,
}

/// What `runChecks` gathers from the loaded project.
#[derive(Debug, Clone, Default)]
pub struct ProjectState {
    /// Every loaded integration record (`project.loadedIntegrations`), or
    /// None when the project could not be read.
    pub integrations: Option<Vec<Value>>,
    /// `project.issues()`: `{package, code, severity, message}`.
    pub issues: Option<Vec<Value>>,
    pub autolink_failures: Option<Vec<(String, String)>>,
    pub configured: Option<Vec<Configured>>,
    pub project_error: Option<String>,
    pub docs_catalog_issues: Vec<Value>,
    pub docs_catalog_error: Option<String>,
    pub icon_sets: Option<Value>,
}

pub const CONFIG_BASENAMES: &[&str] = &["astryx.config.ts", "astryx.config.mjs", "astryx.config.js"];
pub const MANIFEST_BASENAMES: &[&str] = &["astryx.integration.ts", "astryx.integration.mjs", "astryx.integration.js"];

/// `findConfigPath(cwd)`: Err carries the multiple-files message.
pub fn find_config_path(cwd: &str) -> Result<Option<String>, String> {
    let root = crate::discovery::paths::find_package_root(cwd).unwrap_or_else(|| cwd.to_string());
    let present: Vec<String> = CONFIG_BASENAMES.iter().map(|n| np::join2(&root, n)).filter(|p| np::exists(p)).collect();
    if present.len() > 1 {
        return Err(format!(
            "Multiple Astryx config files found in {root} ({}). Keep exactly one.",
            present.iter().map(|p| np::basename(p)).collect::<Vec<_>>().join(", ")
        ));
    }
    Ok(present.into_iter().next())
}

/// Import the config and judge its default export: Ok(None) for an object
/// or no default, Ok(Some(typeof)) for another value, Err(message) when it
/// does not load.
pub fn import_config_default(path: &str) -> Result<Option<String>, String> {
    let ns = crate::js::import_module(std::path::Path::new(path), &Default::default()).map_err(|e| e.message)?;
    match ns.get("default") {
        None => Ok(None),
        Some(Value::Object(m)) => {
            if m.get("__js").and_then(|v| v.as_str()) == Some("function") {
                Ok(Some("function".into()))
            } else {
                Ok(None)
            }
        }
        Some(Value::Array(_)) => Ok(None),
        Some(Value::Null) => Ok(Some("object".into())),
        Some(Value::String(_)) => Ok(Some("string".into())),
        Some(Value::Number(_)) => Ok(Some("number".into())),
        Some(Value::Bool(_)) => Ok(Some("boolean".into())),
    }
}

/// `readDeclaredDependencies(dir)`: `(name, field)`.
pub fn read_declared_dependencies(dir: &str) -> Vec<(String, String)> {
    let Some(pkg) = np::read_json(&np::join2(dir, "package.json")) else { return vec![] };
    let mut out: Vec<(String, String)> = Vec::new();
    for field in ["dependencies", "devDependencies", "optionalDependencies"] {
        let Some(entry) = pkg.get(field).and_then(|v| v.as_object()) else { continue };
        for name in entry.keys() {
            if out.iter().any(|(n, _)| n == name) || !is_bare_package_name(name) {
                continue;
            }
            out.push((name.clone(), field.to_string()));
        }
    }
    out
}

fn is_bare_package_name(name: &str) -> bool {
    !name.is_empty() && !name.starts_with('/') && !name.starts_with("@/") && !name.split('/').any(|s| s == "." || s == "..")
}

/// `scanAutolinkCandidates(dir)` specs (repeats included).
pub fn scan_autolink_specs(dir: &str) -> Vec<String> {
    let mut out = Vec::new();
    for (name, _) in read_declared_dependencies(dir) {
        let Some((pkg_dir, _)) = crate::discovery::paths::find_node_modules_package(dir, &name) else { continue };
        let manifests = MANIFEST_BASENAMES.iter().filter(|m| np::exists(&np::join2(&pkg_dir, m))).count();
        if manifests != 1 {
            continue;
        }
        out.push(name);
    }
    out
}

/// `builtIntegrationPackages(target, cwd)`.
pub fn built_integration_packages(target: &str, cwd: &str) -> Vec<String> {
    let mut dir = np::resolve(&[cwd, target]);
    match std::fs::metadata(&dir) {
        Ok(m) if !m.is_dir() => dir = np::dirname(&dir),
        Ok(_) => {}
        Err(_) => dir = np::resolve1(cwd),
    }
    let mut at = dir;
    loop {
        if np::exists(&np::join2(&at, "package.json")) {
            let mut out: Vec<String> = Vec::new();
            for s in scan_autolink_specs(&at) {
                if !out.contains(&s) {
                    out.push(s);
                }
            }
            return out;
        }
        let parent = np::dirname(&at);
        if parent == at {
            return vec![];
        }
        at = parent;
    }
}

/// The package names the folder's nearest package.json declares.
pub fn declared_package_names(cwd: &str) -> Vec<String> {
    let mut dir = np::resolve1(cwd);
    loop {
        if np::exists(&np::join2(&dir, "package.json")) {
            return read_declared_dependencies(&dir).into_iter().map(|(n, _)| n).collect();
        }
        let parent = np::dirname(&dir);
        if parent == dir {
            return vec![];
        }
        dir = parent;
    }
}

/// `Project.load(cwd, {core: 'project'})` and what `runChecks` reads from it.
pub fn load(cwd: &str) -> ProjectState {
    use crate::discovery::project::Project;
    crate::discovery::validate_contributions::register();
    let p = match Project::load_with(cwd, true) {
        Ok(p) => p,
        Err(e) => return ProjectState { project_error: Some(e), ..Default::default() },
    };
    let ledger = &p.ledger;
    let by_key = |k: &str| ledger.iter().find(|e| e.key == k);
    let mut configured = Vec::new();
    for entry in ledger {
        if !entry.refs.iter().any(|r| r.source == "configured" && !r.repeat) {
            continue;
        }
        let r = entry.refs.iter().find(|c| c.source == "configured");
        let mut effective = entry;
        let mut seen: Vec<String> = Vec::new();
        while effective.outcome == "set-aside" && effective.reason == Some("replaced-by-authored") {
            let Some(w) = &effective.winner else { break };
            if seen.contains(w) {
                break;
            }
            let Some(next) = by_key(w) else { break };
            seen.push(w.clone());
            effective = next;
        }
        let authored = effective.refs.iter().find(|c| c.source == "local");
        let authored_error = authored
            .and_then(|a| a.integration.as_ref().and_then(|i| i.get("__loadError")).filter(|v| !super::util::nullish(Some(v))).map(crate::cli::format::js_string))
            .or_else(|| authored.and_then(|a| a.error.clone()));
        let error = if effective.outcome == "load-failed" {
            Some(effective.error.clone().unwrap_or_else(|| "its manifest could not be loaded".into()))
        } else {
            authored_error
        };
        let spec = r.and_then(|c| c.spec.clone()).unwrap_or_else(|| entry.label.clone());
        let label = entry
            .integration
            .as_ref()
            .and_then(|i| i.get("name"))
            .filter(|v| !v.is_null())
            .map(crate::cli::format::js_string)
            .or_else(|| r.and_then(|c| c.spec.clone()))
            .unwrap_or_else(|| entry.label.clone());
        configured.push(Configured { spec, label, error });
    }
    let autolink_failures: Vec<(String, String)> = ledger
        .iter()
        .filter(|e| e.outcome == "load-failed" && e.candidate.source == "autolinked")
        .map(|e| {
            (
                e.candidate.spec.clone().unwrap_or_else(|| e.label.clone()),
                e.error.clone().unwrap_or_else(|| "its manifest could not be loaded".into()),
            )
        })
        .collect();
    let issues: Vec<Value> = p.issues().iter().map(|i| i.to_json()).collect();
    let docs_catalog_issues = issues.iter().filter(|i| i.get("code").and_then(|c| c.as_str()) == Some("invalid_doc")).cloned().collect();
    ProjectState {
        integrations: Some(p.loaded_integrations.iter().map(|r| Value::Object(r.clone())).collect()),
        issues: Some(issues),
        autolink_failures: Some(autolink_failures),
        configured: Some(configured),
        project_error: None,
        docs_catalog_issues,
        docs_catalog_error: None,
        icon_sets: None,
    }
}
