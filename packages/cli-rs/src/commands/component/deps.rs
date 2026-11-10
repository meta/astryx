//! Typed adapters over the shared readers the component views call (doc
//! views, integrations, Project issues) and the theme reader (resolveTheme).

use crate::json::Value;
use std::path::{Path, PathBuf};

/// A coded error from a shared lookup (`err.code`, `err.message`).
#[derive(Debug, Clone)]
pub struct Coded {
    pub message: String,
    pub code: String,
}

/// `requireCoreDir(cwd)`.
pub fn require_core_dir(cwd: &Path) -> Result<PathBuf, Coded> {
    crate::discovery::paths::require_core_dir(&cwd.to_string_lossy())
        .map(PathBuf::from)
        .map_err(|e| Coded { message: e.message, code: e.code.to_string() })
}

/// Options for [`read_doc_view`] (`readDocView(path, {root, lang, strict})`).
#[derive(Debug, Clone, Default)]
pub struct ReadOpts {
    /// `components` or `hooks`.
    pub root: &'static str,
    pub lang: Option<String>,
    /// `strict: true` with the user loader (loadComponentDoc) versus the
    /// native loader, unchecked (loadDocs).
    pub strict: bool,
}

/// `localeOf({zh, dense, lang})`.
pub fn locale_of(zh: bool, dense: bool, lang: Option<&str>) -> Option<String> {
    match lang {
        Some(l) if !l.is_empty() => Some(l.to_string()),
        _ if dense => Some("dense".into()),
        _ if zh => Some("zh".into()),
        _ => None,
    }
}

/// `readDocView(docPath, opts)`: a compiled doc as plain data; `Null` when
/// the file exports no doc (`undefined`).
pub fn read_doc_view(doc_path: &Path, opts: &ReadOpts) -> Result<Value, String> {
    use crate::discovery::doc_read::{read_doc_view as rdv, ReadDocOptions};
    let file = doc_path.to_string_lossy().into_owned();
    let mut o = ReadDocOptions::new(opts.root);
    o.lang = opts.lang.clone();
    o.label = Some(file.clone());
    if opts.strict {
        o.strict = true;
    } else {
        o.loader = crate::discovery::docmod::Loader::Native;
    }
    rdv(&file, &o).map(|v| v.unwrap_or(Value::Null))
}

/// `readDocView(path, {root: 'components', loader: 'native', exports: ['docs']})`,
/// the read component search scores keywords with.
pub fn read_docs_export(doc_path: &Path) -> Option<Value> {
    use crate::discovery::doc_read::{read_doc_view as rdv, ReadDocOptions};
    let file = doc_path.to_string_lossy().into_owned();
    let mut o = ReadDocOptions::new("components");
    o.loader = crate::discovery::docmod::Loader::Native;
    o.exports = Some(vec!["docs".into()]);
    rdv(&file, &o).ok().flatten()
}

pub use crate::discovery::component_discovery::LoadedIntegration;

/// One project integration record as the component reads take it.
pub fn integration_of(r: &crate::discovery::integrations::Record) -> LoadedIntegration {
    let st = |k: &str| r.get(k).and_then(|v| v.as_str()).map(String::from);
    let defined = |k: &str| r.get(k).filter(|v| !crate::discovery::docmod::is_undefined(Some(v))).cloned();
    LoadedIntegration {
        name: st("name").unwrap_or_default(),
        version: st("version"),
        components: st("components").map(PathBuf::from),
        issues_url: st("issuesUrl"),
        package_dir: st("__packageDir").map(PathBuf::from),
        package_exports: defined("__packageExports"),
        provider_id: st("providerId"),
        autolinked: r.get("__autolinked").and_then(|v| v.as_bool()).unwrap_or(false),
        load_error: r.get("__loadError").is_some_and(|v| !crate::discovery::docmod::is_undefined(Some(v))),
    }
}

/// `Project.load(cwd).loadedIntegrations`, empty on any failure.
pub fn load_integrations_safely(cwd: &Path) -> Vec<LoadedIntegration> {
    thread_local! {
        static CACHE: std::cell::RefCell<std::collections::HashMap<PathBuf, Vec<LoadedIntegration>>> = Default::default();
    }
    if let Some(v) = CACHE.with(|c| c.borrow().get(cwd).cloned()) {
        return v;
    }
    let v: Vec<LoadedIntegration> = match crate::discovery::project::Project::load(&cwd.to_string_lossy()) {
        Ok(p) => p.loaded_integrations.iter().map(integration_of).collect(),
        Err(_) => Vec::new(),
    };
    CACHE.with(|c| c.borrow_mut().insert(cwd.to_path_buf(), v.clone()));
    v
}

/// The component-replacement issue pass `project.issues()` runs.
pub fn component_replacement_issues(p: &crate::discovery::project::Project) -> Vec<(String, String, String, String)> {
    let ints: Vec<LoadedIntegration> = p.loaded_integrations.iter().map(integration_of).collect();
    let core = p.core_dir().map(PathBuf::from);
    let cmd = crate::cli::env::format_cli_command_at(Path::new(&p.cwd), "component --list");
    crate::discovery::component_replacement::resolve_component_replacements(core.as_deref(), &ints, &cmd)
        .findings
        .into_iter()
        .filter(|f| f.opted_in)
        .map(|f| (f.package, f.code, f.severity, f.message))
        .collect()
}

/// Registers the component-replacement pass `project.issues()` runs.
pub fn register() {
    let _ = crate::discovery::project::COMPONENT_REPLACEMENT_ISSUES.set(component_replacement_issues);
}

/// `warnOnIntegrationIssues(project, {json})` after `Project.load(cwd)`; any
/// failure prints nothing.
pub fn warn_on_integration_issues(cwd: &Path, json: bool, out: &mut crate::cli::command::Out) {
    register();
    if let Ok(p) = crate::discovery::project::Project::load(&cwd.to_string_lossy()) {
        crate::discovery::integration_warnings::warn_on_integration_issues(&p, json, out);
    }
}

fn warn_theme(out: &mut crate::cli::command::Out, message: &str) {
    let is_cf = |c: char| {
        matches!(c as u32,
            0xAD | 0x600..=0x605 | 0x61C | 0x6DD | 0x70F | 0x890..=0x891 | 0x8E2 | 0x180E | 0x200B..=0x200F | 0x202A..=0x202E
            | 0x2060..=0x2064 | 0x2066..=0x206F | 0xFEFF | 0xFFF9..=0xFFFB | 0x110BD | 0x110CD | 0x13430..=0x1343F
            | 0x1BCA0..=0x1BCA3 | 0x1D173..=0x1D17A | 0xE0001 | 0xE0020..=0xE007F)
    };
    let clean: String = message.chars().map(|c| if c.is_control() || is_cf(c) { '\u{FFFD}' } else { c }).collect();
    out.eprintln(&clean);
}

fn object_has_name(v: &Value) -> bool {
    v.is_object() && super::jsv::truthy(v.get("name"))
}

/// `extractTheme(mod)`.
fn extract_theme(m: &Value) -> Option<Value> {
    if !m.is_object() {
        return None;
    }
    let obj = if super::jsv::truthy(m.get("default")) { m.get("default").unwrap() } else { m };
    if super::jsv::truthy(obj.get("name")) && (super::jsv::truthy(obj.get("tokens")) || super::jsv::truthy(obj.get("variants"))) {
        return Some(obj.clone());
    }
    if let Some(t) = m.get("theme").filter(|t| object_has_name(t)) {
        return Some(t.clone());
    }
    for (k, v) in m.as_object().unwrap() {
        if k.ends_with("Theme") && object_has_name(v) {
            return Some(v.clone());
        }
    }
    None
}

fn theme_data(m: &Value, specifier: &str, out: &mut crate::cli::command::Out) -> Option<Value> {
    let Some(theme) = extract_theme(m) else {
        warn_theme(out, &format!("⚠ theme: loaded \"{specifier}\" but could not find a theme object"));
        return None;
    };
    let pick = |k: &str| -> Value {
        match theme.get(k) {
            Some(v) if super::jsv::truthy(Some(v)) => v.clone(),
            _ => Value::Null,
        }
    };
    let mut d = crate::json::Map::new();
    d.insert("name".into(), pick("name"));
    d.insert("variants".into(), pick("variants"));
    d.insert("fonts".into(), pick("fonts"));
    Some(Value::Object(d))
}

/// `legacyRequire(target)` from the CLI's own `lib/resolve-theme.mjs`: a path
/// resolves from the project folder, a package name from the CLI's folder.
fn try_load_legacy(specifier: &str, cwd: &Path) -> Option<Value> {
    use crate::js::resolve::{resolve, Mode, Resolved};
    let from = crate::cli::env::cli_root().join("clients/cli/lib/resolve-theme.mjs");
    let file = if specifier.starts_with('.') || specifier.starts_with('/') {
        let target = crate::discovery::module_exports::normalize(&cwd.join(specifier));
        match resolve(&target.to_string_lossy(), &from, Mode::Cjs).ok()? {
            Resolved::File(f) => f,
            Resolved::Builtin(_) => return None,
        }
    } else {
        match resolve(specifier, &from, Mode::Cjs).ok()? {
            Resolved::File(f) => f,
            Resolved::Builtin(_) => return None,
        }
    };
    let ns = crate::js::import_module(&file, &crate::js::ImportOptions::default()).ok()?;
    let esm = file.extension().is_some_and(|e| e == "mjs")
        || (file.extension().is_some_and(|e| e == "js") && crate::js::resolve::package_type_is_module(&file));
    let ns = Value::Object(ns);
    // `require` of a CommonJS file returns `module.exports`, the namespace's
    // default; of an ES module, the namespace itself.
    Some(if esm { ns } else { ns.get("default").cloned().unwrap_or(ns) })
}

/// `resolveTheme(cwd)`: `{name, variants, fonts}` of the project's theme,
/// `None` when it has none. Problems print as `console.warn`; `Err` is a
/// recorded theme that failed to load (its first message line).
pub fn resolve_theme(cwd: &Path, out: &mut crate::cli::command::Out) -> Result<Option<Value>, String> {
    let cli_root = crate::cli::env::cli_root();
    let loaded = crate::commands::theme::recorded::resolve_recorded_theme(&cli_root, &cwd.to_string_lossy(), None).map_err(|e| {
        let first = e.message.split('\n').next().unwrap_or("").trim().to_string();
        if first.is_empty() { e.name.clone() } else { first }
    })?;
    if loaded.configured {
        let Some(m) = loaded.module else {
            let p = loaded.problem.clone().unwrap_or_else(|| format!("could not resolve the generated default theme ({})", loaded.specifier));
            warn_theme(out, &format!("⚠ theme: {p}"));
            return Ok(None);
        };
        return Ok(theme_data(&Value::Object(m), &loaded.specifier, out));
    }
    let pkg = std::fs::read_to_string(cwd.join("package.json")).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok());
    let spec = pkg.as_ref().and_then(|p| p.get("astryx")).and_then(|a| a.get("theme")).filter(|t| super::jsv::truthy(Some(t)));
    let Some(Value::String(spec)) = spec else { return Ok(None) };
    let spec = spec.clone();
    let m = if spec.starts_with('.') || spec.starts_with('/') {
        match try_load_legacy(&spec, cwd) {
            Some(m) => m,
            None => {
                warn_theme(out, &format!("⚠ theme: could not resolve file \"{spec}\" from {}", cwd.display()));
                return Ok(None);
            }
        }
    } else if spec.starts_with('@') {
        match try_load_legacy(&spec, cwd) {
            Some(m) => m,
            None => {
                warn_theme(out, &format!("⚠ theme: could not resolve package \"{spec}\""));
                return Ok(None);
            }
        }
    } else {
        let conventional = format!("@astryxdesign/theme-{spec}");
        match try_load_legacy(&conventional, cwd).or_else(|| try_load_legacy(&spec, cwd)) {
            Some(m) => m,
            None => {
                warn_theme(out, &format!("⚠ theme: could not resolve \"{spec}\" (tried {conventional} and {spec})"));
                return Ok(None);
            }
        }
    };
    Ok(theme_data(&m, &spec, out))
}
