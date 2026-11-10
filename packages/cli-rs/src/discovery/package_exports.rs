//! Port of `foundation/discovery/package-exports.mjs`: resolve a package
//! subpath through its `exports` map (or the legacy file lookup).

use crate::json::Value;
use std::path::{Path, PathBuf};

const MODULE_EXTENSIONS: &[&str] = &[".mjs", ".js", ".cjs", ".mts", ".ts", ".cts", ".tsx", ".jsx"];
const CONDITION_ORDER: &[&str] = &["import", "default", "browser", "node", "require"];

fn target_string(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Array(a) => a.iter().find_map(|i| target_string(i).filter(|s| !s.is_empty())),
        Value::Object(m) => {
            let mut keys: Vec<&str> = CONDITION_ORDER.iter().copied().filter(|k| m.contains_key(*k)).collect();
            keys.extend(m.keys().map(String::as_str).filter(|k| *k != "types" && !CONDITION_ORDER.contains(k)));
            keys.iter().find_map(|k| target_string(&m[*k]).filter(|s| !s.is_empty()))
        }
        _ => None,
    }
}

struct Selected<'a> {
    found: bool,
    value: Option<&'a Value>,
    wildcard: String,
}

fn subpath_value<'a>(map: &'a crate::json::Map<String, Value>, subpath: &str) -> Selected<'a> {
    if let Some(v) = map.get(subpath) {
        return Selected { found: !v.is_null(), value: Some(v), wildcard: String::new() };
    }
    let mut patterns: Vec<&String> = map.keys().filter(|k| k.starts_with("./") && k.matches('*').count() == 1).collect();
    // Stable sort, longest first.
    patterns.sort_by(|a, b| b.encode_utf16().count().cmp(&a.encode_utf16().count()));
    for p in patterns {
        let star = p.find('*').unwrap();
        let (prefix, suffix) = (&p[..star], &p[star + 1..]);
        if subpath.len() >= prefix.len() + suffix.len() && subpath.starts_with(prefix) && subpath.ends_with(suffix) {
            let v = &map[p];
            return Selected {
                found: !v.is_null(),
                value: Some(v),
                wildcard: subpath[prefix.len()..subpath.len() - suffix.len()].to_string(),
            };
        }
    }
    Selected { found: false, value: None, wildcard: String::new() }
}

struct ExportValue {
    has_map: bool,
    exported: bool,
    target: Option<String>,
}

fn export_value(exports: Option<&Value>, subpath: &str) -> ExportValue {
    let Some(field) = exports else { return ExportValue { has_map: false, exported: true, target: None } };
    let Value::Object(map) = field else {
        return ExportValue {
            has_map: true,
            exported: subpath == "." && !field.is_null(),
            target: if subpath == "." { target_string(field) } else { None },
        };
    };
    if !map.keys().any(|k| k.starts_with('.')) {
        return ExportValue {
            has_map: true,
            exported: subpath == ".",
            target: if subpath == "." { target_string(field) } else { None },
        };
    }
    let sel = subpath_value(map, subpath);
    let target = if sel.found { sel.value.and_then(target_string) } else { None };
    ExportValue {
        has_map: true,
        exported: sel.found && target.is_some(),
        target: target.map(|t| t.replace('*', &sel.wildcard)),
    }
}

fn inside(root: &Path, p: &Path) -> bool {
    p == root || p.starts_with(root)
}

fn resolve_target(package_dir: &Path, target: &str) -> Option<PathBuf> {
    if !target.starts_with("./") {
        return None;
    }
    let root = super::module_exports::normalize(package_dir);
    let resolved = super::module_exports::normalize(&root.join(target));
    if !inside(&root, &resolved) {
        return None;
    }
    resolved.is_file().then_some(resolved)
}

fn resolve_legacy(package_dir: &Path, subpath: &str) -> Option<PathBuf> {
    let rest = subpath.strip_prefix("./")?;
    let root = super::module_exports::normalize(package_dir);
    let base = super::module_exports::normalize(&root.join(rest));
    if !inside(&root, &base) {
        return None;
    }
    let mut c = vec![base.clone()];
    for e in MODULE_EXTENSIONS {
        c.push(PathBuf::from(format!("{}{e}", base.display())));
    }
    for e in MODULE_EXTENSIONS {
        c.push(base.join(format!("index{e}")));
    }
    c.into_iter().find(|p| p.is_file())
}

/// `sourceExportTarget(pkg, packageDir, subpath)`: the `source` condition's
/// file, when the selected export is a conditions object that names one.
pub fn source_export_target(exports: Option<&Value>, package_dir: &Path, subpath: &str) -> Option<PathBuf> {
    let field = exports?;
    if field.is_null() {
        return None;
    }
    let (value, wildcard) = match field {
        Value::Object(map) if map.keys().any(|k| k.starts_with('.')) => {
            let sel = subpath_value(map, subpath);
            if !sel.found {
                return None;
            }
            (sel.value?, sel.wildcard)
        }
        _ => {
            if subpath != "." {
                return None;
            }
            (field, String::new())
        }
    };
    let src = value.as_object()?.get("source")?.as_str()?;
    resolve_target(package_dir, &src.replace('*', &wildcard))
}

/// What `inspectPackageExport` reports.
#[derive(Debug, Clone)]
pub struct PackageExport {
    pub subpath: String,
    pub specifier: String,
    pub exported: bool,
    pub target: Option<PathBuf>,
    pub authored_target: Option<String>,
}

/// `inspectPackageExport(pkg, packageDir, subpath)`. `exports` is `None`
/// when the package has no `exports` field at all.
pub fn inspect_package_export(name: &str, exports: Option<&Value>, package_dir: &Path, subpath: &str) -> PackageExport {
    let sel = export_value(exports, subpath);
    let target = if sel.has_map {
        sel.target.as_deref().filter(|t| !t.is_empty()).and_then(|t| resolve_target(package_dir, t))
    } else {
        resolve_legacy(package_dir, subpath)
    };
    let suffix = if subpath == "." { String::new() } else { format!("/{}", &subpath[2.min(subpath.len())..]) };
    PackageExport {
        subpath: subpath.into(),
        specifier: format!("{name}{suffix}"),
        exported: sel.exported,
        target,
        authored_target: sel.target,
    }
}
