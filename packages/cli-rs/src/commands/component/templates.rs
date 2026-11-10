//! The template reads `component --showcase` and `--blocks` use
//! (`findShowcase`, `findRelatedBlocks`, `replaceDemoContent` from
//! `foundation/discovery/template-adapter.mjs`), over the template lane's
//! block discovery.

use super::api::Response;
use crate::commands::template::discovery::{discover_blocks, discover_external_blocks, Template};
use crate::json::{Map, Value};
use std::path::{Path, PathBuf};

fn all_blocks(cwd: &Path) -> Vec<Template> {
    let cli_root = crate::cli::env::cli_root();
    let mut v = discover_blocks(&cli_root);
    v.extend(discover_external_blocks(&cwd.to_string_lossy()));
    v
}

fn components_used(t: &Template) -> Vec<String> {
    match &t.components_used {
        Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str().map(String::from)).collect(),
        _ => Vec::new(),
    }
}

fn basename(p: &str) -> &str {
    p.trim_end_matches('/').rsplit('/').next().unwrap_or(p)
}

/// `findShowcase(name, cwd, {package})`: the showcase file and its aspect
/// ratio.
pub fn find_showcase(name: &str, cwd: &Path, package: Option<&str>) -> Option<(PathBuf, Value)> {
    let lc = name.to_lowercase();
    let showcases: Vec<Template> = all_blocks(cwd)
        .into_iter()
        .filter(|b| b.is_showcase == Some(true) && package.map_or(true, |p| b.package.as_deref() == Some(p)))
        .collect();
    let result = |b: &Template| (PathBuf::from(&b.file_path), b.aspect_ratio.clone().unwrap_or(Value::Null));
    if let Some(b) = showcases.iter().find(|b| b.example_for.as_deref().unwrap_or("").to_lowercase() == lc) {
        return Some(result(b));
    }
    if let Some(b) = showcases.iter().find(|b| basename(&b.category).to_lowercase() == lc) {
        return Some(result(b));
    }
    showcases.iter().find(|b| components_used(b).iter().any(|c| c.to_lowercase() == lc)).map(result)
}

/// `replaceDemoContent(source).source`.
pub fn replace_demo_content(source: &str) -> String {
    match crate::commands::template::demo_content::replace_demo_content(source) {
        Ok((s, _)) => s,
        Err(_) => source.to_string(),
    }
}

fn entry(b: &Template) -> Value {
    let mut m = Map::new();
    m.insert("name".into(), Value::String(b.dir_name.clone()));
    m.insert("package".into(), Value::String(b.pkg().to_string()));
    m.insert("displayName".into(), Value::String(b.name.clone()));
    m.insert("description".into(), Value::String(b.description.clone()));
    m.insert("isShowcase".into(), Value::Bool(b.is_showcase.unwrap_or(false)));
    m.insert("category".into(), Value::String(b.category.clone()));
    Value::Object(m)
}

/// `componentDetailBlocks(componentName, cwd, ownerPackage)`.
pub fn component_detail_blocks(name: &str, cwd: &Path, owner_package: &str) -> Response {
    let lc = name.to_lowercase();
    let all: Vec<Template> = all_blocks(cwd).into_iter().filter(|b| components_used(b).iter().any(|c| c.to_lowercase() == lc)).collect();
    let own: Vec<&Template> = all.iter().filter(|b| basename(&b.category) == name).collect();
    let examples: Vec<&Template> = if !own.is_empty() {
        own
    } else {
        all.iter().filter(|b| components_used(b).iter().any(|c| c == name)).collect()
    };
    let example_set: std::collections::HashSet<&str> = examples.iter().map(|b| b.dir_name.as_str()).collect();
    let showcase = examples.iter().position(|b| b.is_showcase == Some(true));
    let related: Vec<Value> = all.iter().filter(|b| !example_set.contains(b.dir_name.as_str())).map(entry).collect();
    let mut d = Map::new();
    d.insert("component".into(), Value::String(name.into()));
    d.insert("showcase".into(), showcase.map(|i| entry(examples[i])).unwrap_or(Value::Null));
    d.insert(
        "examples".into(),
        Value::Array(examples.iter().enumerate().filter(|(i, _)| Some(*i) != showcase).map(|(_, b)| entry(b)).collect()),
    );
    d.insert("related".into(), Value::Array(related));
    Response::new("component.detail.blocks", Some(owner_package), Value::Object(d))
}
