//! Port of `foundation/integrations/exports-subpaths.mjs`.

use crate::json::Value;

/// `isRecord(value)`.
pub fn is_record(v: &Value) -> bool {
    matches!(v, Value::Object(_)) && super::zod::received(v) == "object"
}

/// `importable(value)`.
pub fn importable(v: &Value) -> bool {
    match v {
        Value::String(_) => true,
        Value::Array(a) => a.iter().any(importable),
        Value::Object(m) if is_record(v) => m.iter().any(|(c, t)| c != "require" && c != "types" && importable(t)),
        _ => false,
    }
}

/// `allTargets(value)`.
pub fn all_targets(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::String(s) => out.push(s.clone()),
        Value::Array(a) => a.iter().for_each(|x| all_targets(x, out)),
        Value::Object(m) if is_record(v) => m.values().for_each(|x| all_targets(x, out)),
        _ => {}
    }
}

/// `subpathDeclaration(exportsField, subpath)` result.
#[derive(Debug, Clone, PartialEq)]
pub struct SubpathDeclaration {
    /// `no_exports` | `root_only` | `declared` | `not_importable` | `missing` | `blocked`.
    pub state: &'static str,
    pub value: Option<Value>,
    pub wildcard: Option<String>,
}

fn decl(state: &'static str, value: Option<Value>, wildcard: Option<String>) -> SubpathDeclaration {
    SubpathDeclaration { state, value, wildcard }
}

/// `subpathDeclaration(exportsField, subpath)`.
pub fn subpath_declaration(exports: Option<&Value>, subpath: &str) -> SubpathDeclaration {
    let Some(ex) = exports.filter(|v| !super::docmod::is_nullish(Some(v))) else { return decl("no_exports", None, None) };
    let keys: Vec<String> = if is_record(ex) { ex.as_object().unwrap().keys().cloned().collect() } else { vec![] };
    let is_map = is_record(ex) && keys.iter().all(|k| k.starts_with('.'));
    if !is_map {
        if subpath != "." {
            return decl("root_only", None, None);
        }
        return if importable(ex) { decl("declared", Some(ex.clone()), None) } else { decl("not_importable", Some(ex.clone()), None) };
    }
    let map = ex.as_object().unwrap();
    let mut hit: Option<(Value, String)> = None;
    if let Some(v) = map.get(subpath) {
        hit = Some((v.clone(), String::new()));
    } else {
        let mut patterns: Vec<&String> = keys.iter().filter(|k| k.split('*').count() == 2).collect();
        patterns.sort_by(|a, b| {
            let (ia, ib) = (a.find('*').unwrap() as i64, b.find('*').unwrap() as i64);
            (ib - ia).cmp(&0).then_with(|| (b.len() as i64 - a.len() as i64).cmp(&0))
        });
        for p in patterns {
            let star = p.find('*').unwrap();
            let (prefix, suffix) = (&p[..star], &p[star + 1..]);
            if subpath.len() >= prefix.len() + suffix.len() && subpath.starts_with(prefix) && subpath.ends_with(suffix) {
                hit = Some((map[p.as_str()].clone(), subpath[prefix.len()..subpath.len() - suffix.len()].to_string()));
                break;
            }
        }
    }
    let Some((value, wildcard)) = hit else { return decl("missing", None, None) };
    if super::docmod::is_nullish(Some(&value)) {
        return decl("blocked", None, None);
    }
    if !importable(&value) {
        return decl("not_importable", Some(value), Some(wildcard));
    }
    decl("declared", Some(value), Some(wildcard))
}
