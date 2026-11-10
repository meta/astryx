//! `detail/doc/doc.mjs`: an installed component's doc. Loading and linking
//! the doc belong to the discovery and component lanes; until their pieces
//! land, a doc lookup reports that it cannot load the file.

use super::api::Options;
use super::env::Env;
use super::model::*;
use super::scan::{find_component, Found};
use super::util::{levenshtein, lower};
use crate::json::Value;

pub fn doc_from_result(env: &Env, found: &Found, options: &Options) -> DResult<Value> {
    let lang = options.lang.clone().filter(|l| !l.is_empty()).or_else(|| options.zh.then(|| "zh".to_string()));
    let path = found.doc_path.to_string_lossy().to_string();
    let docs = match crate::discovery::doc_read::load_docs(&path, lang.as_deref(), None) {
        Ok(d) => d.unwrap_or(Value::Null),
        Err(e) => {
            return Err(DiscoverError::new(
                format!("Failed to load docs for {}: {e}", found.component),
                vec![],
                "ERR_INVALID_DOC",
            ))
        }
    };
    if let Some(err) = validate_docs(&docs) {
        return Err(DiscoverError::new(format!("Invalid docs for {}: {err}", found.component), vec![], "ERR_INVALID_DOC"));
    }
    let linked = crate::commands::component::links::link_component_response(
        crate::commands::component::api::Response::new("component.detail", Some(&found.package), docs),
        &env.cwd,
    );
    let mut r = crate::json::Map::new();
    r.insert("type".into(), "discover.detail.doc".into());
    r.insert("package".into(), found.package.clone().into());
    r.insert("data".into(), linked.data);
    Ok(Value::Object(r))
}

fn validate_docs(d: &Value) -> Option<&'static str> {
    let Value::Object(o) = d else { return Some("docs export is missing or not an object") };
    match o.get("name") {
        Some(Value::String(s)) if !s.is_empty() => {}
        _ => return Some("docs.name is missing or not a string"),
    }
    let usage = o.get("usage");
    if !matches!(usage.and_then(|u| u.get("description")), Some(Value::String(_))) {
        return Some("docs.usage.description is missing or not a string");
    }
    let truthy = |v: Option<&Value>| match v {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Number(n)) => n.as_f64().map(|x| x != 0.0).unwrap_or(false),
        _ => true,
    };
    if truthy(o.get("props")) && !o["props"].is_array() {
        return Some("docs.props must be an array");
    }
    if truthy(o.get("components")) && !o["components"].is_array() {
        return Some("docs.components must be an array");
    }
    let bp = usage.and_then(|u| u.get("bestPractices"));
    if truthy(bp) && !bp.unwrap().is_array() {
        return Some("docs.usage.bestPractices must be an array");
    }
    None
}

pub fn doc(env: &Env, packages: &[InstalledPackage], pkg_name: &str, comp: &str, options: &Options) -> DResult<Value> {
    let Some(pkg) = packages.iter().find(|p| p.name == pkg_name) else {
        return Err(DiscoverError::new(format!("Package \"{pkg_name}\" not found"), vec![], "ERR_UNKNOWN_PACKAGE"));
    };
    match find_component(std::slice::from_ref(pkg), comp) {
        Some(found) => doc_from_result(env, &found, options),
        None => {
            let low = lower(comp);
            let hits: Vec<String> = pkg.components.iter().filter(|c| lower(c).contains(&low)).cloned().collect();
            let suggestions = if !hits.is_empty() {
                hits
            } else {
                let mut m: Vec<(String, usize)> = pkg
                    .components
                    .iter()
                    .map(|c| (c.clone(), levenshtein(&low, &lower(c))))
                    .filter(|(_, d)| *d <= 3)
                    .collect();
                m.sort_by_key(|(_, d)| *d);
                m.into_iter().take(5).map(|(n, _)| n).collect()
            };
            Err(DiscoverError::new(
                format!("Component \"{comp}\" not found in {pkg_name}"),
                suggestions.into_iter().map(|s| (s, "similar name".to_string())).collect(),
                "ERR_UNKNOWN_COMPONENT",
            ))
        }
    }
}
