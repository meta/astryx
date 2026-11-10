//! `assets/codemods/integration-discovery.mjs`: an integration's codemods,
//! grouped by version folder.

use crate::discovery::integrations::{self as integ, Record};
use crate::discovery::zod::{self, Mode, Z};
use crate::json::Value;
use std::path::{Path, PathBuf};

const CODEMOD_EXTENSIONS: &[&str] = &[".ts", ".mjs", ".js"];
const SKIP_DIRS: &[&str] = &["node_modules", ".git", "__tests__", "__fixtures__"];

#[derive(Debug, Clone)]
pub struct IntegrationCodemod {
    pub id: String,
    pub kind: String, // code | config
    pub title: String,
    pub description: Option<String>,
    pub is_optional: bool,
    pub file_extensions: Option<Vec<String>>,
    pub package: String,
    pub file: PathBuf,
}

fn is_test_file(name: &str) -> bool {
    super::jsre::test(r"\.(test|spec)\.[^.]+$", "", name) || super::jsre::test(r"\.fixture\.[^.]+$", "", name)
}

fn collect_codemod_files(version_dir: &Path) -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    fn walk(dir: &Path, root: &Path, out: &mut Vec<(String, PathBuf)>) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        for e in rd.filter_map(|e| e.ok()) {
            let name = e.file_name().to_string_lossy().into_owned();
            let full = dir.join(&name);
            if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                if SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                walk(&full, root, out);
                continue;
            }
            let ext = super::fsutil::extname(&full);
            if !CODEMOD_EXTENSIONS.contains(&ext.as_str()) || is_test_file(&name) {
                continue;
            }
            let rel = super::fsutil::relative(root, &full);
            let id = rel[..rel.len() - ext.len()].to_string();
            out.push((id, full));
        }
    }
    walk(version_dir, version_dir, &mut out);
    out.sort_by(|a, b| crate::discovery::jsort::locale_compare(&a.0, &b.0));
    out
}

fn is_function(v: &Value) -> bool {
    v.get("__js").and_then(|x| x.as_str()) == Some("function")
}

fn codemod_schema() -> Z {
    let transform = Z::Custom(is_function, "Expected a function".into());
    let code = zod::object(
        vec![
            ("title", zod::string()),
            ("description", zod::opt(zod::string())),
            ("isOptional", zod::opt(zod::boolean())),
            ("fileExtensions", zod::opt(zod::array(zod::string()))),
            ("transform", transform.clone()),
            ("type", zod::lit("code")),
        ],
        Mode::Strict,
    );
    let config = zod::object(
        vec![("title", zod::string()), ("description", zod::opt(zod::string())), ("isOptional", zod::opt(zod::boolean())), ("transform", transform), ("type", zod::lit("config"))],
        Mode::Strict,
    );
    zod::disc("type", vec![code, config])
}

/// `discoverIntegrationCodemods(loadedIntegrations)`: version → codemods, in
/// the order the JS Map holds them, or the first error's message.
pub fn discover_integration_codemods(records: &[Record]) -> Result<Vec<(String, Vec<IntegrationCodemod>)>, String> {
    let mut by_version: Vec<(String, Vec<IntegrationCodemod>)> = Vec::new();
    for r in records {
        let root = match integ::s(r, "codemods").filter(|s| !s.is_empty()) {
            Some(x) => PathBuf::from(x),
            None => continue,
        };
        let label = integ::s(r, "name").or_else(|| integ::s(r, "__spec")).unwrap_or("integration").to_string();
        if !root.is_dir() {
            return Err(format!("Integration \"{}\" declares a codemods directory that does not exist: {}", label, root.display()));
        }
        let mut folders: Vec<String> = std::fs::read_dir(&root)
            .map(|rd| rd.filter_map(|e| e.ok()).filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false)).map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| !SKIP_DIRS.contains(&n.as_str())).collect())
            .unwrap_or_default();
        // readdir order is the directory's; sort by name as most file systems list.
        folders.sort();
        let mut id_to_version: Vec<(String, String)> = Vec::new();
        for version in folders {
            let vdir = root.join(&version);
            let mut seen: Vec<String> = Vec::new();
            for (id, file) in collect_codemod_files(&vdir) {
                let shown = match integ::s(r, "__packageDir") {
                    Some(pd) if !pd.is_empty() => super::fsutil::relative(Path::new(pd), &file),
                    _ => file.display().to_string(),
                };
                let item_label = format!("Integration \"{}\" codemod {}/{} ({})", label, version, id, shown);
                if seen.contains(&id) {
                    return Err(format!("Integration \"{}\" has a duplicate codemod id \"{}\" within version {}.", label, id, version));
                }
                seen.push(id.clone());
                if let Some((_, prior)) = id_to_version.iter().find(|(i, _)| *i == id) {
                    if *prior != version {
                        return Err(format!("Integration \"{}\" reuses codemod id \"{}\" across versions {} and {}. Codemod ids must be unique within a package.", label, id, prior, version));
                    }
                }
                id_to_version.push((id.clone(), version.clone()));
                let ns = integ::import_user_module(&file.display().to_string())?;
                let def = ns.get("default").cloned().unwrap_or_else(zod::undefined);
                let parsed = zod::safe_parse(&codemod_schema(), &def).map_err(|issues| zod::format_zod_error(&item_label, &issues))?;
                let entry = IntegrationCodemod {
                    id: id.clone(),
                    kind: parsed.get("type").and_then(|v| v.as_str()).unwrap_or("code").to_string(),
                    title: parsed.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    description: parsed.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    is_optional: parsed.get("isOptional").and_then(|v| v.as_bool()).unwrap_or(false),
                    file_extensions: parsed.get("fileExtensions").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()),
                    package: label.clone(),
                    file,
                };
                match by_version.iter_mut().find(|(v, _)| *v == version) {
                    Some((_, list)) => list.push(entry),
                    None => by_version.push((version.clone(), vec![entry])),
                }
            }
        }
    }
    Ok(by_version)
}

/// `selectIntegrationCodemods(byVersion, from, to)`
pub fn select_integration_codemods(by_version: &[(String, Vec<IntegrationCodemod>)], from: &str, to: &str) -> Vec<(String, Vec<IntegrationCodemod>)> {
    use crate::discovery::semver::semver_compare;
    let mut versions: Vec<&String> = by_version.iter().map(|(v, _)| v).collect();
    versions.sort_by(|a, b| semver_compare(a, b).partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal));
    let mut out = Vec::new();
    for v in versions {
        if semver_compare(v, from) > 0.0 && semver_compare(v, to) <= 0.0 {
            if let Some((_, c)) = by_version.iter().find(|(vv, _)| vv == v) {
                out.push((v.clone(), c.clone()));
            }
        }
    }
    out
}

/// The `collectIdentities` codemod hook: `{version, id}` sorted by
/// `version/id` (localeCompare), or the discovery error.
pub fn codemod_identities(r: &Record) -> (Vec<Value>, Vec<String>) {
    match discover_integration_codemods(std::slice::from_ref(r)) {
        Err(e) => (vec![], vec![e]),
        Ok(by) => {
            let mut rows: Vec<(String, Value)> = Vec::new();
            for (v, list) in by {
                for c in list {
                    let mut m = crate::json::Map::new();
                    m.insert("version".into(), Value::String(v.clone()));
                    m.insert("id".into(), Value::String(c.id.clone()));
                    rows.push((format!("{}/{}", v, c.id), Value::Object(m)));
                }
            }
            rows.sort_by(|a, b| crate::discovery::jsort::locale_compare(&a.0, &b.0));
            (rows.into_iter().map(|x| x.1).collect(), vec![])
        }
    }
}
