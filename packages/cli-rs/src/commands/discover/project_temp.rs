//! TEMP: replace with src/discovery Project::load, loaded_integrations,
//! collect_identities and issues once they land. The smallest loader that
//! lets discover run against real projects: configured integrations from
//! `astryx.config.*`, then autolinked dependencies with a manifest; items
//! read by file name.

use super::env::{Integration, Project};
use crate::json::Value;
use std::path::{Path, PathBuf};




/// The project through discovery's `Project::load`; item lists are TEMP
/// (file names) until `collect_identities` lands.
pub fn from_project(p: crate::discovery::project::Project) -> Project {
    let config_discover = handle(p.config.get("discover"), "the discover source from astryx.config");
    let icon_sets = crate::discovery::paths::js_truthy(p.config.get("experimental").and_then(|e| e.get("iconSet")));
    let integrations = p.loaded_integrations.iter().map(|r| integration_of(r, icon_sets.then_some(p.project_dir.as_str()))).collect();
    Project { cwd: PathBuf::from(&p.project_dir), config_discover, icon_sets, integrations }
}

fn handle(v: Option<&Value>, label: &str) -> Option<Box<dyn super::env::Source>> {
    let m = v?.as_object()?;
    if m.get("__js").and_then(|x| x.as_str()) != Some("function") {
        return None;
    }
    let module = m.get("module")?.as_str()?;
    let mut export_path = vec![m.get("export")?.as_str()?.to_string()];
    if let Some(Value::Array(a)) = m.get("path") {
        export_path.extend(a.iter().filter_map(|x| x.as_str().map(String::from)));
    }
    Some(Box::new(super::env::JsSource { file: PathBuf::from(module), export_path, label: label.into() }))
}

fn integration_of(r: &crate::json::Map<String, Value>, icon_project: Option<&str>) -> Integration {
    let st = |k: &str| r.get(k).and_then(|v| v.as_str()).map(String::from);
    let name = st("name").unwrap_or_default();
    let dir = |k: &str| st(k).map(PathBuf::from);
    let mut it = Integration {
        version: st("version"),
        components_dir: dir("components"),
        load_error: st("__loadError"),
        discover: handle(r.get("__discover"), &format!("the discover source from {name}")),
        discover_error: st("__discoverError"),
        templates: vec![],
        docs: vec![],
        themes: vec![],
        codemods: vec![],
        icon_sets: vec![],
        withdrawn_icon_sets: vec![],
        name,
    };
    if it.load_error.is_some() {
        return it;
    }
    // Icon sets are experimental: listed only in a project that opts in.
    if let Some(project_dir) = icon_project {
        let (sets, withdrawn) = crate::discovery::icon_set_discovery::discover_integration_icon_sets(r, project_dir);
        it.icon_sets = sets
            .iter()
            .map(|set| {
                let mut defs: Vec<String> =
                    set.data.get("map").and_then(|m| m.as_object()).map(|m| m.keys().cloned().collect()).unwrap_or_default();
                defs.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
                super::model::IconSetSummary {
                    name: set.name.clone(),
                    display_name: set.display_name.clone(),
                    description: set.description.clone(),
                    license: set.license.clone(),
                    icon_count: set.data.get("icons").and_then(|i| i.as_array()).map(|a| a.len()).unwrap_or(0) as f64,
                    default: set.data.get("default").filter(|d| crate::discovery::paths::js_truthy(Some(d))).cloned(),
                    definitions: defs,
                }
            })
            .collect();
        it.withdrawn_icon_sets = withdrawn.into_iter().map(|w| (w.name, w.reason)).collect();
    }
    // `collectIdentities({...integration, components: undefined, iconSets: undefined})`.
    let mut bare = r.clone();
    bare.shift_remove("components");
    bare.shift_remove("iconSets");
    let (ids, _) = crate::discovery::contribution_inventory::collect_identities(&bare);
    let field = |v: &Vec<Value>, k: &str| -> Vec<String> {
        v.iter().filter_map(|x| x.get(k).and_then(|s| s.as_str()).map(String::from)).collect()
    };
    it.docs = ids.docs.clone();
    it.templates = field(&ids.templates, "id");
    it.themes = field(&ids.themes, "slug");
    it.codemods = ids
        .codemods
        .iter()
        .map(|c| format!("{}/{}", crate::cli::format::js_string(&c["version"]), crate::cli::format::js_string(&c["id"])))
        .collect();
    // TEMP: until the template and theme lanes register their discovery in
    // contribution_inventory, read those by file name.
    if it.templates.is_empty() {
        if let Some(t) = dir("templates") {
            it.templates = stems(&t, &[".template.mjs", ".doc.mjs"]);
        }
    }
    if !it.themes.is_empty() {
        return it;
    }
    if let Some(t) = dir("themes") {
        let mut v: Vec<String> = std::fs::read_dir(&t)
            .map(|rd| rd.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().into_owned()).collect())
            .unwrap_or_default();
        v.sort_by(|a, b| super::util::locale_compare(a, b));
        it.themes = v;
    }
    it
}

fn stems(dir: &Path, suffixes: &[&str]) -> Vec<String> {
    let mut out = vec![];
    fn walk(d: &Path, suffixes: &[&str], out: &mut Vec<String>) {
        let Ok(rd) = std::fs::read_dir(d) else { return };
        for e in rd.filter_map(|e| e.ok()) {
            let n = e.file_name().to_string_lossy().into_owned();
            if n == "node_modules" {
                continue;
            }
            if e.path().is_dir() {
                walk(&e.path(), suffixes, out);
            } else if let Some(s) = suffixes.iter().find(|s| n.ends_with(*s)) {
                let stem = n[..n.len() - s.len()].to_string();
                if !out.contains(&stem) {
                    out.push(stem);
                }
            }
        }
    }
    walk(dir, suffixes, &mut out);
    out.sort_by(|a, b| super::util::locale_compare(a, b));
    out
}
