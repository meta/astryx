//! What theme build reads from Core's component docs and declarations: the
//! theming targets, the built-in visual-prop values, and the augmentable
//! `*Map` interfaces (build.mjs `loadKnownValuesIndex`,
//! `resolveAugmentationTargetCandidates`, `readComponentDeclarations`).
//! Core here is the one beside the CLI (`<cli>/../core`), as in the JS CLI.

use crate::discovery::theming_targets;
use crate::json::Value;
use indexmap::IndexMap;
use std::cell::RefCell;
use std::path::{Path, PathBuf};

type Docs = Vec<(PathBuf, Option<Value>)>;

thread_local! {
    static DOCS: RefCell<Option<(PathBuf, std::rc::Rc<Docs>)>> = const { RefCell::new(None) };
    static DECLS: RefCell<std::collections::HashMap<String, String>> = RefCell::new(Default::default());
}

pub fn core_root(cli_root: &str) -> Option<PathBuf> {
    let p = super::nodepath::resolve(cli_root, &["../core"]);
    let p = PathBuf::from(p);
    p.exists().then_some(p)
}

/// Every Core `.doc.mjs` under `src/`, loaded once.
pub fn docs(cli_root: &str) -> Option<std::rc::Rc<Docs>> {
    let src = core_root(cli_root)?.join("src");
    if !src.exists() {
        return None;
    }
    DOCS.with(|d| {
        if let Some((p, docs)) = d.borrow().as_ref() {
            if *p == src {
                return Some(docs.clone());
            }
        }
        let list: Docs = theming_targets::doc_files(&src)
            .into_iter()
            .map(|f| {
                let doc = theming_targets::load_doc(&f);
                (f, doc)
            })
            .collect();
        let rc = std::rc::Rc::new(list);
        *d.borrow_mut() = Some((src, rc.clone()));
        Some(rc)
    })
}

/// `getKnownComponents().propsByKey`, or `None` without docs.
pub fn known_components(cli_root: &str) -> Option<IndexMap<String, Vec<String>>> {
    let docs = docs(cli_root)?;
    let by = theming_targets::targets_by_key(&theming_targets::collect_from_docs(&docs));
    (!by.is_empty()).then_some(by)
}

fn target_name(v: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = v.chars().collect();
    for (i, c) in chars.iter().enumerate() {
        if i > 0 && c.is_ascii_uppercase() && (chars[i - 1].is_ascii_lowercase() || chars[i - 1].is_ascii_digit()) {
            out.push('-');
        }
        out.push(*c);
    }
    let ws = regress::Regex::new(r"\s+").unwrap();
    let mut r = String::new();
    let mut last = 0;
    for m in ws.find_iter(&out) {
        r.push_str(&out[last..m.start()]);
        r.push('-');
        last = m.end();
    }
    r.push_str(&out[last..]);
    r.to_lowercase()
}

fn values_from_props(props: &[Value]) -> IndexMap<String, Vec<String>> {
    let quoted = regress::Regex::new(r"'([^']+)'").unwrap();
    let numeric = regress::Regex::new(r"^-?\d+(?:\.\d+)?$").unwrap();
    let mut out: IndexMap<String, Vec<String>> = IndexMap::new();
    for p in props {
        let (Some(name), Some(ty)) = (p.get("name").and_then(|v| v.as_str()), p.get("type").and_then(|v| v.as_str())) else { continue };
        let mut values: Vec<String> = Vec::new();
        for m in quoted.find_iter(ty) {
            let s = &ty[m.range()];
            let v = s[1..s.len() - 1].to_string();
            if !values.contains(&v) {
                values.push(v);
            }
        }
        for part in ty.split('|').map(|x| x.trim_matches(crate::cli::format::js_ws)) {
            if numeric.find(part).is_some() && !values.contains(&part.to_string()) {
                values.push(part.to_string());
            }
        }
        if !values.is_empty() {
            out.insert(name.to_string(), values);
        }
    }
    out
}

fn arr(v: Option<&Value>) -> Vec<Value> {
    v.and_then(|x| x.as_array()).cloned().unwrap_or_default()
}

fn union(into: &mut Vec<String>, more: &[String]) {
    for m in more {
        if !into.contains(m) {
            into.push(m.clone());
        }
    }
}

thread_local! {
    static KNOWN_VALUES: RefCell<Option<IndexMap<String, IndexMap<String, Vec<String>>>>> = const { RefCell::new(None) };
}

fn known_values_index(cli_root: &str) -> IndexMap<String, IndexMap<String, Vec<String>>> {
    if let Some(v) = KNOWN_VALUES.with(|k| k.borrow().clone()) {
        return v;
    }
    let mut collected: IndexMap<String, IndexMap<String, Vec<String>>> = IndexMap::new();
    if let Some(docs) = docs(cli_root) {
        let mut by_owner: IndexMap<String, IndexMap<String, Vec<String>>> = IndexMap::new();
        let add = |name: &str, props: &[Value], by_owner: &mut IndexMap<String, IndexMap<String, Vec<String>>>| {
            let owner = by_owner.entry(target_name(name)).or_default();
            for (prop, values) in values_from_props(props) {
                union(owner.entry(prop).or_default(), &values);
            }
        };
        for (_, doc) in docs.iter() {
            let Some(doc) = doc else { continue };
            if let Some(n) = doc.get("name").and_then(|v| v.as_str()) {
                add(n, &arr(doc.get("props")), &mut by_owner);
            }
            for c in arr(doc.get("components")) {
                if let Some(n) = c.get("name").and_then(|v| v.as_str()) {
                    add(n, &arr(c.get("props")), &mut by_owner);
                }
            }
        }
        for (_, doc) in docs.iter() {
            let Some(doc) = doc else { continue };
            let mut all_props = arr(doc.get("props"));
            for c in arr(doc.get("components")) {
                all_props.extend(arr(c.get("props")));
            }
            let local = values_from_props(&all_props);
            for t in arr(doc.get("theming").and_then(|t| t.get("targets"))) {
                let Some(cn) = t.get("className").and_then(|v| v.as_str()) else { continue };
                let component = cn.strip_prefix("astryx-").unwrap_or(cn).to_string();
                let owner = by_owner.get(&component).cloned().unwrap_or_default();
                let entry = collected.entry(component).or_default();
                for prop in arr(t.get("visualProps")) {
                    let Some(prop) = prop.as_str().map(String::from).or_else(|| Some(crate::cli::format::js_string(&prop))) else { continue };
                    let e = entry.entry(prop.clone()).or_default();
                    union(e, local.get(&prop).map(|v| v.as_slice()).unwrap_or(&[]));
                    union(e, owner.get(&prop).map(|v| v.as_slice()).unwrap_or(&[]));
                }
            }
        }
    }
    KNOWN_VALUES.with(|k| *k.borrow_mut() = Some(collected.clone()));
    collected
}

fn to_pascal(name: &str) -> String {
    name.split('-')
        .map(|p| {
            let mut c = p.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect()
}

/// `readComponentDeclarations(pascalName, {includeTypes})`.
fn read_declarations(cli_root: &str, pascal: &str, include_types: bool) -> String {
    let key = format!("{pascal}:{include_types}");
    if let Some(v) = DECLS.with(|d| d.borrow().get(&key).cloned()) {
        return v;
    }
    let mut contents = String::new();
    if let Some(root) = core_root(cli_root) {
        let mut sets = vec![vec![root.join("dist").join(pascal).join("index.d.ts")], vec![root.join("src").join(pascal).join("index.ts")]];
        if include_types {
            sets[0].push(root.join("dist").join(pascal).join("types.d.ts"));
            sets[1].push(root.join("src").join(pascal).join("types.ts"));
        }
        for files in sets {
            if files[0].exists() {
                for f in &files {
                    if let Ok(t) = std::fs::read_to_string(f) {
                        contents.push_str(&t);
                        contents.push('\n');
                    }
                }
                if !contents.is_empty() {
                    break;
                }
            }
        }
    }
    DECLS.with(|d| d.borrow_mut().insert(key, contents.clone()));
    contents
}

/// `componentHasAugmentableInterface`.
pub fn has_augmentable_interface(cli_root: &str, pascal: &str, interface: &str, include_types: bool) -> bool {
    let decl = read_declarations(cli_root, pascal, include_types);
    if decl.is_empty() {
        return false;
    }
    let re = regress::Regex::new(&format!(r"\binterface\s+{interface}\b")).unwrap();
    re.find(&decl).is_some()
}

fn augmentation_candidates(cli_root: &str, component: &str) -> Vec<(String, String)> {
    let fallback = vec![(to_pascal(component), to_pascal(component))];
    let Some(docs) = docs(cli_root) else { return fallback };
    let mut out: Vec<(String, String)> = Vec::new();
    let mut add = |m: String, i: String| {
        if !out.contains(&(m.clone(), i.clone())) {
            out.push((m, i));
        }
    };
    for (file, doc) in docs.iter() {
        let Some(doc) = doc else { continue };
        let matches = arr(doc.get("theming").and_then(|t| t.get("targets"))).iter().any(|t| {
            t.get("className").and_then(|v| v.as_str()).map(|c| c.strip_prefix("astryx-").unwrap_or(c) == component).unwrap_or(false)
        });
        if !matches {
            continue;
        }
        let module = match doc.get("name").and_then(|v| v.as_str()) {
            Some(n) if !n.is_empty() => n.to_string(),
            _ => file.parent().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        };
        add(module.clone(), to_pascal(component));
        add(module.clone(), module.clone());
        for c in arr(doc.get("components")) {
            if let Some(n) = c.get("name").and_then(|v| v.as_str()) {
                add(module.clone(), n.to_string());
            }
        }
    }
    for (m, i) in fallback {
        add(m, i);
    }
    out
}

/// `resolveAugmentationTarget(component, prop)`: `(moduleName, interfaceName)`.
pub fn augmentation_target(cli_root: &str, component: &str, prop: &str) -> Option<(String, String)> {
    if component == "text" && prop == "type" {
        return has_augmentable_interface(cli_root, "theme", "CustomTextTypes", true).then(|| ("theme".to_string(), "CustomTextTypes".to_string()));
    }
    let mut c = prop.chars();
    let prop_pascal = match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    };
    augmentation_candidates(cli_root, component).into_iter().find_map(|(m, i)| {
        let iface = format!("{i}{prop_pascal}Map");
        (iface != "IconVariantMap" && has_augmentable_interface(cli_root, &m, &iface, false)).then(|| (m, iface))
    })
}

#[derive(PartialEq)]
pub enum ValueClass {
    Builtin,
    Enrollment,
    Unresolved,
}

/// `classifyComponentValue`.
pub fn classify(cli_root: &str, component: &str, prop: &str, value: &str) -> ValueClass {
    let index = known_values_index(cli_root);
    if let Some(known) = index.get(component).and_then(|k| k.get(prop)) {
        if known.iter().any(|v| v == value) {
            return ValueClass::Builtin;
        }
    }
    if augmentation_target(cli_root, component, prop).is_some() {
        ValueClass::Enrollment
    } else {
        ValueClass::Unresolved
    }
}

#[allow(dead_code)]
fn unused(_: &Path) {}
