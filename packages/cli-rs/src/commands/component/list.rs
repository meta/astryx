//! Port of `api/component/list/list.mjs`.

use super::api::{external_grouped, family_member_of, load_component_doc, sort_by_locale, valid_integration_components, ApiError, Options, Response};
use super::deps;
use super::jsv::{at, truthy};
use crate::cli::command::Suggestion;
use crate::discovery::component_discovery::{
    find_component_readme, find_external_component_doc, resolve_import_path, resolve_integration_import_path,
    ImportOwner, CORE_PACKAGE,
};
use crate::discovery::component_replacement::{resolve_component_replacements, ActiveReplacement, ComponentReplacements};
use crate::json::{Map, Value};
use std::collections::HashSet;
use std::path::Path;

fn sv(s: &str) -> Value {
    Value::String(s.into())
}

fn core_names_entry(name: &str) -> Value {
    let mut m = Map::new();
    m.insert("name".into(), sv(name));
    m.insert("package".into(), sv(CORE_PACKAGE));
    Value::Object(m)
}

/// `{name: doc.name, package: CORE_PACKAGE, ...doc}`.
fn core_entry(doc: &Value) -> Value {
    let mut m = Map::new();
    m.insert("name".into(), doc.get("name").cloned().unwrap_or(Value::Null));
    m.insert("package".into(), sv(CORE_PACKAGE));
    if let Some(o) = doc.as_object() {
        for (k, v) in o {
            m.insert(k.clone(), v.clone());
        }
    }
    if doc.get("name").is_none() {
        // `name: undefined` spread: JSON drops an undefined value.
        m.shift_remove("name");
    }
    Value::Object(crate::json::js_key_order(m))
}

fn member_entry(docs: &Value, name: &str, core_dir: &Path) -> Option<Value> {
    let member = family_member_of(docs, name)?;
    let mut m = Map::new();
    m.insert("name".into(), sv(name));
    m.insert("package".into(), sv(CORE_PACKAGE));
    m.insert("displayName".into(), member.get("displayName").filter(|v| !v.is_null()).cloned().unwrap_or_else(|| sv(name)));
    if let Some(g) = docs.get("group").filter(|g| truthy(Some(g))) {
        m.insert("group".into(), g.clone());
    }
    if let Some(c) = docs.get("category").filter(|c| truthy(Some(c))) {
        m.insert("category".into(), c.clone());
    }
    let usage = match member.get("usage").filter(|u| !u.is_null()) {
        Some(u) => u.clone(),
        None => {
            let mut u = Map::new();
            u.insert("description".into(), member.get("description").filter(|d| !d.is_null()).cloned().unwrap_or_else(|| sv("")));
            Value::Object(u)
        }
    };
    m.insert("usage".into(), usage);
    m.insert("props".into(), member.get("props").filter(|p| !p.is_null()).cloned().unwrap_or(Value::Array(vec![])));
    if let Some(e) = member.get("examples").filter(|e| truthy(Some(e))) {
        m.insert("examples".into(), e.clone());
    }
    if let Some(t) = docs.get("theming").filter(|t| truthy(Some(t))) {
        m.insert("theming".into(), t.clone());
    }
    m.insert("import".into(), sv(&resolve_import_path(core_dir, name)));
    Some(Value::Object(m))
}

fn xds_fallback(comp: &str) -> Value {
    let mut m = Map::new();
    m.insert("name".into(), sv(&format!("XDS{comp}")));
    m.insert("package".into(), sv(CORE_PACKAGE));
    m.insert("description".into(), sv(""));
    Value::Object(m)
}

fn rep_import(rep: &ActiveReplacement, authored: Option<&str>) -> String {
    resolve_integration_import_path(
        &ImportOwner {
            exports_map: rep.integration.package_exports.clone(),
            package_dir: rep.integration.package_dir.clone(),
            doc_path: Some(rep.doc_path.clone()),
            package_name: rep.package.clone(),
        },
        &rep.name,
        authored,
    )
}

fn replacement_entry(rep: &ActiveReplacement, detail: &str, opts: &Options) -> Value {
    let lang = opts.lang.as_deref();
    let docs = if detail == "full" {
        load_component_doc(&rep.doc_path, opts.zh, opts.dense, lang)
    } else {
        load_component_doc(&rep.doc_path, opts.zh, false, lang)
    }
    .ok();
    let import = rep_import(rep, docs.as_ref().and_then(|d| d.get("import")).and_then(|v| v.as_str()));
    let mut m = Map::new();
    match detail {
        "names" => {
            m.insert("name".into(), sv(&rep.name));
            m.insert("package".into(), sv(&rep.package));
            m.insert("import".into(), sv(&import));
        }
        "compact" => {
            m.insert("name".into(), sv(&rep.name));
            m.insert("package".into(), sv(&rep.package));
            let d = docs.as_ref();
            let desc = super::jsv::or_str(&[d.and_then(|d| at(d, &["usage", "description"])), d.and_then(|d| d.get("description"))]);
            m.insert("description".into(), sv(&desc));
            m.insert("import".into(), sv(&import));
        }
        _ => {
            let Some(docs) = docs else {
                m.insert("name".into(), sv(&rep.name));
                m.insert("package".into(), sv(&rep.package));
                m.insert("description".into(), sv(""));
                return Value::Object(m);
            };
            let mut doc = docs.as_object().cloned().unwrap_or_default();
            doc.shift_remove("package");
            m.insert("name".into(), doc.get("name").filter(|n| !n.is_null()).cloned().unwrap_or_else(|| sv(&rep.name)));
            m.insert("package".into(), sv(&rep.package));
            for (k, v) in doc {
                m.insert(k, v);
            }
            m.insert("import".into(), sv(&import));
            m = crate::json::js_key_order(m);
        }
    }
    Value::Object(m)
}

fn compact_core(core_dir: &Path, comp: &str, opts: &Options) -> Value {
    let mut m = Map::new();
    m.insert("name".into(), sv(comp));
    m.insert("package".into(), sv(CORE_PACKAGE));
    let mut desc = String::new();
    if let Some(readme) = find_component_readme(core_dir, comp).filter(|r| r.to_string_lossy().ends_with(".doc.mjs")) {
        if let Ok(docs) = load_component_doc(&readme, opts.zh, false, opts.lang.as_deref()) {
            let fm = family_member_of(&docs, comp).and_then(|f| f.get("description"));
            desc = super::jsv::or_str(&[fm, at(&docs, &["usage", "description"]), docs.get("description")]);
        }
    }
    m.insert("description".into(), sv(&desc));
    m.insert("import".into(), sv(&resolve_import_path(core_dir, comp)));
    Value::Object(m)
}

fn full_core(core_dir: &Path, comp: &str, opts: &Options) -> Value {
    let Some(readme) = find_component_readme(core_dir, comp).filter(|r| r.to_string_lossy().ends_with(".doc.mjs")) else {
        return xds_fallback(comp);
    };
    match load_component_doc(&readme, opts.zh, opts.dense, opts.lang.as_deref()) {
        Ok(docs) => member_entry(&docs, comp, core_dir).unwrap_or_else(|| core_entry(&docs)),
        Err(_) => xds_fallback(comp),
    }
}

fn entry_for(core_dir: &Path, comp: &str, level: &str, reps: &ComponentReplacements, opts: &Options) -> Value {
    if let Some(rep) = reps.for_target(comp) {
        return replacement_entry(rep, level, opts);
    }
    match level {
        "compact" => compact_core(core_dir, comp, opts),
        "full" => full_core(core_dir, comp, opts),
        _ => core_names_entry(comp),
    }
}

fn list_response(level: &str, comps: Map<String, Value>) -> Response {
    let mut d = Map::new();
    d.insert("detail".into(), sv(level));
    d.insert("components".into(), Value::Object(comps));
    Response::new("component.list", None, Value::Object(d))
}

/// `componentList(coreDir, {cwd, category, detail, zh, dense, lang})`.
pub fn component_list(core_dir: &Path, opts: &Options) -> Result<Response, ApiError> {
    let components = crate::discovery::component_discovery::try_discover_components(core_dir)
        .map_err(|m| ApiError::new(m, None, "ENOENT"))?;
    let cwd = &opts.cwd;
    let integrations = deps::load_integrations_safely(cwd);
    let list_cmd = crate::cli::env::format_cli_command_at(cwd, "component --list");
    let reps = resolve_component_replacements(Some(core_dir), &integrations, &list_cmd);
    let detail = opts.detail.clone().unwrap_or_else(|| "brief".into());
    let level = match detail.as_str() {
        "compact" => "compact",
        "full" => "full",
        _ => "names",
    };

    if let Some(category) = opts.category.as_deref().filter(|c| !c.is_empty()) {
        let Some((key, comps)) = components.iter().find(|(k, _)| k.to_lowercase() == category.to_lowercase()) else {
            return Err(ApiError::new(
                format!("Unknown category \"{category}\""),
                Some(components.keys().map(|k| Suggestion::new(k.clone(), "valid category")).collect()),
                "ERR_UNKNOWN_CATEGORY",
            ));
        };
        let entries: Vec<Value> = comps.iter().map(|c| entry_for(core_dir, c, level, &reps, opts)).collect();
        let mut m = Map::new();
        m.insert(key.clone(), Value::Array(entries));
        return Ok(list_response(level, m));
    }

    let mut list_data = Map::new();
    for (cat, comps) in &components {
        let entries: Vec<Value> = comps.iter().map(|c| entry_for(core_dir, c, level, &reps, opts)).collect();
        list_data.insert(cat.clone(), Value::Array(entries));
    }
    if level != "names" {
        return Ok(list_response(level, list_data));
    }

    let listed: HashSet<(String, String)> = reps.active.iter().map(|a| (a.package.clone(), a.name.clone())).collect();
    let mut seen: HashSet<String> = HashSet::new();
    for integration in &integrations {
        seen.insert(integration.name.clone());
        let owned = valid_integration_components(integration);
        let mut by_group: indexmap::IndexMap<String, Vec<Value>> = indexmap::IndexMap::new();
        for rec in owned {
            if listed.contains(&(integration.name.clone(), rec.name.clone())) {
                continue;
            }
            let label = rec.group.clone().unwrap_or_else(|| integration.name.clone());
            let key = format!("{label} ({})", integration.name);
            let owner = ImportOwner {
                exports_map: integration.package_exports.clone(),
                package_dir: integration.package_dir.clone(),
                doc_path: Some(rec.doc_path.clone()),
                package_name: integration.name.clone(),
            };
            let mut import = resolve_integration_import_path(&owner, &rec.name, None);
            if let Ok(docs) = load_component_doc(&rec.doc_path, opts.zh, false, opts.lang.as_deref()) {
                import = resolve_integration_import_path(&owner, &rec.name, docs.get("import").and_then(|v| v.as_str()));
            }
            let mut m = Map::new();
            m.insert("name".into(), sv(&rec.name));
            m.insert("package".into(), sv(&integration.name));
            m.insert("import".into(), sv(&import));
            by_group.entry(key).or_default().push(Value::Object(m));
        }
        for (key, mut members) in by_group {
            sort_by_locale(&mut members);
            list_data.insert(key, Value::Array(members));
        }
    }

    for ext in super::api::discover_external_packages(cwd) {
        if seen.contains(&ext.name) {
            continue;
        }
        let grouped = external_grouped(&ext.docs_dir);
        if grouped.is_empty() {
            continue;
        }
        let has_groups = grouped.iter().any(|(k, v)| v.len() > 1 || v[0] != *k);
        let entries_for = |names: &[String]| -> Value {
            Value::Array(
                names
                    .iter()
                    .map(|n| {
                        let doc_path = find_external_component_doc(&ext.docs_dir, n);
                        let docs = doc_path
                            .filter(|p| p.to_string_lossy().ends_with(".doc.mjs"))
                            .and_then(|p| load_component_doc(&p, opts.zh, false, opts.lang.as_deref()).ok())
                            .unwrap_or(Value::Object(Map::new()));
                        let owner = ImportOwner { exports_map: None, package_dir: None, doc_path: None, package_name: ext.name.clone() };
                        let import = resolve_integration_import_path(&owner, n, docs.get("import").and_then(|v| v.as_str()));
                        let mut m = Map::new();
                        m.insert("name".into(), sv(n));
                        m.insert("package".into(), sv(&ext.name));
                        m.insert("import".into(), sv(&import));
                        Value::Object(m)
                    })
                    .collect(),
            )
        };
        if has_groups {
            for (g, members) in &grouped {
                list_data.insert(format!("{g} ({})", ext.name), entries_for(members));
            }
        } else {
            let mut all: Vec<String> = grouped.values().flatten().cloned().collect();
            all.sort_by(|a, b| crate::text::code_unit_cmp(a, b));
            if !all.is_empty() {
                list_data.insert(format!("{} ({})", ext.category, ext.name), entries_for(&all));
            }
        }
    }
    Ok(list_response("names", list_data))
}
