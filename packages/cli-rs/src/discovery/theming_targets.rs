//! `foundation/discovery/theming-targets.mjs`: the theming targets every Core
//! component doc declares (`collectThemingTargets`, `targetsByKey`).

use crate::cli::collate::locale_compare;
use crate::json::Value;
use std::path::Path;

#[derive(Clone, Debug)]
pub struct ThemingTarget {
    pub key: String,
    pub class_name: String,
    pub component: String,
    pub props: Vec<String>,
    pub states: Vec<String>,
    parent: Option<String>,
}

fn string_list(v: Option<&Value>) -> Vec<String> {
    match v {
        Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str().map(String::from)).collect(),
        _ => Vec::new(),
    }
}

fn dedup_push(list: &mut Vec<String>, more: &[String]) {
    for m in more {
        if !list.contains(m) {
            list.push(m.clone());
        }
    }
}

/// The `.doc.mjs` files under `dir`, in `readdirSync` order, skipping
/// `node_modules` and `__tests__`.
pub fn doc_files(dir: &Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    walk(dir, &mut out);
    out
}

fn walk(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = rd.flatten().collect();
    // readdirSync lists names in byte order on the file systems the CLI runs on.
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let name = e.file_name().to_string_lossy().into_owned();
        let full = e.path();
        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            if name == "node_modules" || name == "__tests__" {
                continue;
            }
            walk(&full, out);
            continue;
        }
        if name.ends_with(".doc.mjs") {
            out.push(full);
        }
    }
}

/// `loadComponentDoc(file)`: the doc's data, or `None` when it fails to load
/// or check.
pub fn load_doc(file: &Path) -> Option<Value> {
    super::component_discovery::load_component_doc_strict(file).ok()
}

pub fn collect_theming_targets(core_src: &Path) -> Vec<ThemingTarget> {
    if !core_src.exists() {
        return Vec::new();
    }
    let docs: Vec<(std::path::PathBuf, Option<Value>)> = doc_files(core_src).into_iter().map(|f| {
        let d = load_doc(&f);
        (f, d)
    }).collect();
    collect_from_docs(&docs)
}

/// `collectThemingTargets` over docs already loaded (`None`: failed to load).
pub fn collect_from_docs(docs: &[(std::path::PathBuf, Option<Value>)]) -> Vec<ThemingTarget> {
    let mut targets = Vec::new();
    for (file, doc) in docs {
        let Some(doc) = doc else { continue };
        let component = match doc.get("name").and_then(|v| v.as_str()) {
            Some(n) if !n.is_empty() => n.to_string(),
            _ => file.parent().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        };
        let parent = doc.get("subComponentOf").and_then(|v| v.as_str()).map(String::from);
        let list = doc.get("theming").and_then(|t| t.get("targets")).and_then(|t| t.as_array()).cloned().unwrap_or_default();
        for t in list {
            let Some(class_name) = t.get("className").and_then(|v| v.as_str()) else { continue };
            let key = class_name.strip_prefix("astryx-").unwrap_or(class_name).to_string();
            if key.is_empty() {
                continue;
            }
            targets.push(ThemingTarget {
                key,
                class_name: class_name.to_string(),
                component: component.clone(),
                props: string_list(t.get("visualProps")),
                states: string_list(t.get("states")),
                parent: parent.clone(),
            });
        }
    }
    // A sub-component doc repeating its parent's target merges into the
    // parent's single root entry.
    let mut drop = vec![false; targets.len()];
    for i in 0..targets.len() {
        let Some(parent) = targets[i].parent.clone() else { continue };
        let roots: Vec<usize> = (0..targets.len())
            .filter(|&j| targets[j].parent.is_none() && targets[j].component == parent && targets[j].class_name == targets[i].class_name)
            .collect();
        if roots.len() != 1 {
            continue;
        }
        let (props, states) = (targets[i].props.clone(), targets[i].states.clone());
        dedup_push(&mut targets[roots[0]].props, &props);
        dedup_push(&mut targets[roots[0]].states, &states);
        drop[i] = true;
    }
    let mut kept: Vec<ThemingTarget> =
        targets.into_iter().zip(drop).filter(|(_, d)| !d).map(|(t, _)| t).collect();
    kept.sort_by(|a, b| locale_compare(&a.key, &b.key).then_with(|| locale_compare(&a.component, &b.component)));
    kept
}

/// `targetsByKey`: every prop and state each target key accepts, in first-seen
/// order.
pub fn targets_by_key(targets: &[ThemingTarget]) -> indexmap::IndexMap<String, Vec<String>> {
    let mut by: indexmap::IndexMap<String, Vec<String>> = indexmap::IndexMap::new();
    for t in targets {
        let e = by.entry(t.key.clone()).or_default();
        dedup_push(e, &t.props);
        dedup_push(e, &t.states);
    }
    by
}
