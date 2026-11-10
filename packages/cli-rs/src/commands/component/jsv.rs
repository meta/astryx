//! Small helpers for reading loaded docs with JS semantics: truthiness,
//! `a || b`, template-literal `String(x)`, `?.length`.

use crate::json::Value;

/// Whether a value is the engine's `undefined` marker.
pub fn is_undef(v: &Value) -> bool {
    v.as_object().is_some_and(|m| m.get("__js").and_then(|k| k.as_str()) == Some("undefined"))
}

/// JS truthiness of a value; `None` is `undefined`.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        Some(x) if is_undef(x) => false,
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// `obj?.a?.b` by keys.
pub fn at<'a>(v: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut cur = v;
    for k in path {
        cur = cur.as_object()?.get(*k)?;
    }
    Some(cur)
}

/// `` `${x}` ``: `undefined` for a missing value.
pub fn tpl(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(x) if is_undef(x) => "undefined".into(),
        Some(v) => crate::cli::format::js_string(v),
    }
}

/// `String(x ?? '')`.
pub fn str_or_empty(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => String::new(),
        Some(x) if is_undef(x) => String::new(),
        Some(v) => crate::cli::format::js_string(v),
    }
}

/// The first truthy of the values, as a string (`a || b || ''`).
pub fn or_str(vals: &[Option<&Value>]) -> String {
    for v in vals {
        if truthy(*v) {
            return crate::cli::format::js_string(v.unwrap());
        }
    }
    String::new()
}

/// `x?.length` as a non-empty array check (`x?.length` truthy). Strings have
/// a length too.
pub fn has_len(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::String(s)) => !s.is_empty(),
        _ => false,
    }
}

/// The array at `v`, or empty.
pub fn arr(v: Option<&Value>) -> &[Value] {
    match v {
        Some(Value::Array(a)) => a.as_slice(),
        _ => &[],
    }
}

/// `'key' in obj`.
pub fn has_key(v: &Value, key: &str) -> bool {
    v.as_object().is_some_and(|m| m.contains_key(key))
}

/// The string at `v` when it is one.
pub fn s(v: Option<&Value>) -> Option<&str> {
    v.and_then(|v| v.as_str())
}
