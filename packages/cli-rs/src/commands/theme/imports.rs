//! Built imports for an added theme. Port of
//! foundation/discovery/theme-imports.mjs and the package-exports helper it reads.

use super::discovery::Theme;
use super::state::{self, Entry};
use crate::commands::template::fsutil;
use crate::json::Value;
use std::path::Path;

const MODULE_EXTENSIONS: &[&str] = &[".mjs", ".js", ".cjs", ".mts", ".ts", ".cts", ".tsx", ".jsx"];
const CONDITION_ORDER: &[&str] = &["import", "default", "browser", "node", "require"];

fn target_string(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Array(a) => a.iter().find_map(target_string),
        Value::Object(m) => {
            let mut keys: Vec<&str> = CONDITION_ORDER.iter().copied().filter(|k| m.contains_key(*k)).collect();
            for k in m.keys() {
                if k != "types" && !CONDITION_ORDER.contains(&k.as_str()) {
                    keys.push(k);
                }
            }
            keys.iter().find_map(|k| target_string(&m[*k]))
        }
        _ => None,
    }
}

fn subpath_value(map: &crate::json::Map<String, Value>, subpath: &str) -> (bool, Value, String) {
    if let Some(v) = map.get(subpath) {
        return (!v.is_null(), v.clone(), String::new());
    }
    let mut patterns: Vec<&String> = map.keys().filter(|k| k.starts_with("./") && k.split('*').count() == 2).collect();
    patterns.sort_by(|a, b| b.len().cmp(&a.len()));
    for p in patterns {
        let star = p.find('*').unwrap();
        let (pre, suf) = (&p[..star], &p[star + 1..]);
        if subpath.len() >= pre.len() + suf.len() && subpath.starts_with(pre) && subpath.ends_with(suf) {
            let v = &map[p.as_str()];
            return (!v.is_null(), v.clone(), subpath[pre.len()..subpath.len() - suf.len()].to_string());
        }
    }
    (false, Value::Null, String::new())
}

/// (hasMap, exported, target)
fn export_value(exports: Option<&Value>, subpath: &str) -> (bool, bool, Option<String>) {
    let Some(ex) = exports else { return (false, true, None) };
    let Some(m) = ex.as_object() else {
        return (true, subpath == "." && !ex.is_null(), if subpath == "." { target_string(ex) } else { None });
    };
    if !m.keys().any(|k| k.starts_with('.')) {
        return (true, subpath == ".", if subpath == "." { target_string(ex) } else { None });
    }
    let (found, value, wild) = subpath_value(m, subpath);
    let target = if found { target_string(&value) } else { None };
    (true, found && target.is_some(), target.map(|t| t.replace('*', &wild)))
}

fn regular_file(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

fn resolve_target(dir: &str, target: &str) -> Option<String> {
    if !target.starts_with("./") {
        return None;
    }
    let r = fsutil::resolve(dir, target);
    let root = fsutil::normalize(dir);
    if r != root && !r.starts_with(&format!("{root}/")) {
        return None;
    }
    regular_file(&r).then_some(r)
}

fn resolve_legacy(dir: &str, subpath: &str) -> Option<String> {
    if !subpath.starts_with("./") {
        return None;
    }
    let base = fsutil::resolve(dir, &subpath[2..]);
    let root = fsutil::normalize(dir);
    if base != root && !base.starts_with(&format!("{root}/")) {
        return None;
    }
    let mut c = vec![base.clone()];
    c.extend(MODULE_EXTENSIONS.iter().map(|e| format!("{base}{e}")));
    c.extend(MODULE_EXTENSIONS.iter().map(|e| fsutil::join(&base, &format!("index{e}"))));
    c.into_iter().find(|p| regular_file(p))
}

pub struct ExportInfo {
    pub specifier: String,
    pub exported: bool,
    pub target: Option<String>,
}

/// `inspectPackageExport`.
pub fn inspect_export(pkg: &Value, dir: &str, subpath: &str) -> ExportInfo {
    let name = pkg.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let (has_map, exported, t) = export_value(pkg.get("exports"), subpath);
    let target = if has_map { t.and_then(|t| resolve_target(dir, &t)) } else { resolve_legacy(dir, subpath) };
    let suffix = if subpath == "." { String::new() } else { format!("/{}", &subpath[2..]) };
    ExportInfo { specifier: format!("{name}{suffix}"), exported, target }
}

fn fmt_cmd_at(cmd: &str, cwd: &str) -> String {
    crate::cli::env::format_cli_command_at(Path::new(cwd), cmd)
}

fn module_exports(file: &str, name: &str) -> bool {
    crate::discovery::module_exports::module_exports_name(Path::new(file), name)
}

/// `resolveThemeImports`. Err carries the ThemeImportError message.
pub fn resolve(theme: &Theme, cwd: &str, owner_count: usize) -> Result<Entry, String> {
    if theme.source == "local" || state::is_local_owner(&theme.package) {
        return resolve_local(theme, cwd);
    }
    let import_package = theme.import_package().to_string();
    let Some(dir) = theme.package_dir.clone().or_else(|| crate::discovery::paths::find_installed_package(cwd, &import_package, 6)) else {
        return Err(format!(
            "Theme package \"{import_package}\" is not installed. Run `npm install {import_package}` (or yarn/pnpm/bun), then run `{}`.",
            fmt_cmd_at(&format!("theme add {}", theme.slug), cwd)
        ));
    };
    let pj = fsutil::join(&dir, "package.json");
    let pkg: Value = match std::fs::read_to_string(&pj).map_err(|e| e.to_string()).and_then(|t| serde_json::from_str(&t).map_err(|e| e.to_string())) {
        Ok(v) => v,
        Err(e) => return Err(format!("Cannot read theme package metadata at {pj}: {e}")),
    };
    let triplet = |m: &str, s: &str, f: &str| (inspect_export(&pkg, &dir, m), inspect_export(&pkg, &dir, s), inspect_export(&pkg, &dir, f));
    let complete = |t: &(ExportInfo, ExportInfo, ExportInfo)| t.0.exported && t.0.target.is_some() && t.1.exported && t.1.target.is_some();
    let slug = &theme.slug;
    let per = triplet(&format!("./themes/{slug}"), &format!("./themes/{slug}.css"), &format!("./themes/{slug}.fonts.css"));
    let single = if owner_count == 1 { Some(triplet("./built", "./theme.css", "./fonts.css")) } else { None };
    let selected = if complete(&per) {
        &per
    } else if single.as_ref().map_or(false, |s| complete(s)) {
        single.as_ref().unwrap()
    } else {
        let name = pkg.get("name").and_then(|v| v.as_str()).unwrap_or("undefined");
        let mut missing = Vec::new();
        if !per.0.exported || per.0.target.is_none() {
            missing.push(format!("module export {name}/themes/{slug}"));
        }
        if !per.1.exported || per.1.target.is_none() {
            missing.push(format!("stylesheet export {name}/themes/{slug}.css"));
        }
        if owner_count == 1 {
            missing.push(format!("or the single-theme exports {name}/built and {name}/theme.css"));
        }
        return Err(format!(
            "Theme \"{slug}\" from {import_package} has no resolvable built module and stylesheet. Missing {}. The package must build and export them before it can be added.",
            missing.join(", ")
        ));
    };
    if selected.2.exported && selected.2.target.is_none() {
        return Err(format!(
            "Theme \"{slug}\" from {import_package} exports {}, but that font stylesheet does not resolve from the installed package.",
            selected.2.specifier
        ));
    }
    if !selected.0.target.as_deref().map_or(false, |t| module_exports(t, &theme.export_name)) {
        return Err(format!(
            "Theme \"{slug}\" built module {} does not export \"{}\". Rebuild the package theme before adding it.",
            selected.0.specifier, theme.export_name
        ));
    }
    Ok(Entry {
        slug: slug.clone(),
        owner: import_package,
        export_name: theme.export_name.clone(),
        module: selected.0.specifier.clone(),
        stylesheet: selected.1.specifier.clone(),
        font_stylesheet: if selected.2.exported && selected.2.target.is_some() { Some(selected.2.specifier.clone()) } else { None },
        source: if theme.source == "bundled" || theme.bundled { "bundled".into() } else { "package".into() },
        module_file: selected.0.target.clone(),
        stylesheet_file: selected.1.target.clone(),
        font_stylesheet_file: selected.2.target.clone(),
    })
}

fn resolve_local(theme: &Theme, cwd: &str) -> Result<Entry, String> {
    let module_file = fsutil::join(&theme.source_dir, &format!("{}.js", theme.slug));
    let stylesheet_file = fsutil::join(&theme.source_dir, &format!("{}.css", theme.slug));
    let font_file = fsutil::join(&theme.source_dir, &format!("{}.fonts.css", theme.slug));
    let missing: Vec<&String> = [&module_file, &stylesheet_file].into_iter().filter(|f| !regular_file(f)).collect();
    let source_rel = fsutil::relative(cwd, &fsutil::join(&theme.source_dir, &theme.entry));
    if !missing.is_empty() {
        return Err(format!(
            "Local theme \"{}\" is not built. Run `{}` and try again. Missing: {}.",
            theme.slug,
            fmt_cmd_at(&format!("theme build {source_rel}"), cwd),
            missing.iter().map(|f| fsutil::relative(cwd, f)).collect::<Vec<_>>().join(", ")
        ));
    }
    if !module_exports(&module_file, &theme.export_name) {
        return Err(format!(
            "Local theme \"{}\" built module {} does not export \"{}\". Rebuild it with `{}`.",
            theme.slug,
            fsutil::relative(cwd, &module_file),
            theme.export_name,
            fmt_cmd_at(&format!("theme build {source_rel}"), cwd)
        ));
    }
    Ok(Entry {
        slug: theme.slug.clone(),
        owner: theme.package.clone(),
        export_name: theme.export_name.clone(),
        module: String::new(),
        stylesheet: String::new(),
        font_stylesheet: None,
        source: "local".into(),
        module_file: Some(module_file),
        stylesheet_file: Some(stylesheet_file),
        font_stylesheet_file: Path::new(&font_file).exists().then_some(font_file),
    })
}
