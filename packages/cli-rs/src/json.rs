//! JSON values with JavaScript semantics.
//!
//! The CLI's JSON output is a contract. This module writes a value exactly as
//! `JSON.stringify(value, null, indent)` writes it in Node:
//! - object keys keep insertion order (integer-like keys are the caller's job:
//!   a JS object lists them first, in ascending order; see `js_key_order`);
//! - numbers print as ECMAScript `Number#toString` prints them (via `ryu-js`);
//!   NaN and the infinities print as `null`; `-0` prints as `0`;
//! - strings escape `"`, `\`, and control characters the way V8 does.

pub use serde_json::{Map, Number, Value};

/// Write `value` as `JSON.stringify(value, null, indent)` does.
/// `indent == 0` gives the compact form.
pub fn stringify(value: &Value, indent: usize) -> String {
    let mut out = String::new();
    write_value(&mut out, value, indent, 0);
    out
}

/// Write `value` as `JSON.stringify(value, null, 2)` does, plus the newline
/// that `console.log` adds.
pub fn to_stdout_line(value: &Value) -> String {
    let mut s = stringify(value, 2);
    s.push('\n');
    s
}

/// ECMAScript `Number#toString` for an f64.
pub fn js_number_to_string(n: f64) -> String {
    if n.is_nan() || n.is_infinite() {
        // Only JSON callers reach this through `write_number`, which writes
        // null. Plain string conversion keeps the JS spelling.
        if n.is_nan() {
            return "NaN".to_string();
        }
        return if n > 0.0 { "Infinity".to_string() } else { "-Infinity".to_string() };
    }
    if n == 0.0 {
        return "0".to_string();
    }
    let mut buf = ryu_js::Buffer::new();
    buf.format_finite(n).to_string()
}

/// Make a JSON number from an f64 with JS semantics (all numbers are doubles).
pub fn num(n: f64) -> Value {
    match Number::from_f64(n) {
        Some(x) => Value::Number(x),
        None => Value::Null,
    }
}

/// Reorder an object's keys as a JS object orders them: array-index keys
/// (canonical non-negative integers below 2^32 - 1) first, ascending; then
/// every other key in insertion order.
pub fn js_key_order(map: Map<String, Value>) -> Map<String, Value> {
    let mut index_keys: Vec<(u32, String, Value)> = Vec::new();
    let mut rest: Vec<(String, Value)> = Vec::new();
    for (k, v) in map {
        match array_index(&k) {
            Some(i) => index_keys.push((i, k, v)),
            None => rest.push((k, v)),
        }
    }
    if index_keys.is_empty() {
        return rest.into_iter().collect();
    }
    index_keys.sort_by_key(|(i, _, _)| *i);
    let mut out = Map::new();
    for (_, k, v) in index_keys {
        out.insert(k, v);
    }
    for (k, v) in rest {
        out.insert(k, v);
    }
    out
}

fn array_index(k: &str) -> Option<u32> {
    if k.is_empty() || (k.len() > 1 && k.starts_with('0')) || !k.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let n: u64 = k.parse().ok()?;
    if n < u32::MAX as u64 {
        Some(n as u32)
    } else {
        None
    }
}

fn write_number(out: &mut String, n: &Number) {
    if let Some(i) = n.as_i64() {
        // Exact for |i| <= 2^53; beyond that JS would have rounded already.
        if i.unsigned_abs() <= (1u64 << 53) {
            out.push_str(&i.to_string());
            return;
        }
    }
    if let Some(u) = n.as_u64() {
        if u <= (1u64 << 53) {
            out.push_str(&u.to_string());
            return;
        }
    }
    match n.as_f64() {
        Some(f) if f.is_finite() => out.push_str(&js_number_to_string(f)),
        _ => out.push_str("null"),
    }
}

/// V8's JSON string quoting.
pub fn quote(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn newline_indent(out: &mut String, indent: usize, depth: usize) {
    out.push('\n');
    for _ in 0..indent * depth {
        out.push(' ');
    }
}

fn write_value(out: &mut String, v: &Value, indent: usize, depth: usize) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => write_number(out, n),
        Value::String(s) => quote(out, s),
        Value::Array(items) => {
            if items.is_empty() {
                out.push_str("[]");
                return;
            }
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                if indent > 0 {
                    newline_indent(out, indent, depth + 1);
                }
                write_value(out, item, indent, depth + 1);
            }
            if indent > 0 {
                newline_indent(out, indent, depth);
            }
            out.push(']');
        }
        Value::Object(map) => {
            if map.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push('{');
            for (i, (k, item)) in map.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                if indent > 0 {
                    newline_indent(out, indent, depth + 1);
                }
                quote(out, k);
                out.push(':');
                if indent > 0 {
                    out.push(' ');
                }
                write_value(out, item, indent, depth + 1);
            }
            if indent > 0 {
                newline_indent(out, indent, depth);
            }
            out.push('}');
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn matches_json_stringify() {
        let v = json!({"a": 1, "b": [1.5, "x\n\u{1}", {}], "c": [], "d": null, "e": 1e21, "f": 0.1});
        assert_eq!(
            stringify(&v, 2),
            "{\n  \"a\": 1,\n  \"b\": [\n    1.5,\n    \"x\\n\\u0001\",\n    {}\n  ],\n  \"c\": [],\n  \"d\": null,\n  \"e\": 1e+21,\n  \"f\": 0.1\n}"
        );
        assert_eq!(stringify(&v, 0), "{\"a\":1,\"b\":[1.5,\"x\\n\\u0001\",{}],\"c\":[],\"d\":null,\"e\":1e+21,\"f\":0.1}");
    }
}

/// What `JSON.stringify` keeps of a value that may hold `crate::js` marker
/// objects (`{"__js": ...}`): `None` where it drops the value (undefined,
/// functions, symbols), and each marker as JSON writes it (NaN and Infinity
/// as null, a Date as its ISO string, a Map, Set, RegExp, Error or Promise as
/// `{}`). Arrays keep their length: a dropped item becomes null.
pub fn js_json_value(v: &Value) -> Option<Value> {
    match v {
        Value::Object(m) => {
            if let Some(kind) = m.get("__js").and_then(|k| k.as_str()) {
                return match kind {
                    "undefined" | "function" | "symbol" => None,
                    "number" => Some(Value::Null),
                    "date" => Some(m.get("iso").cloned().unwrap_or(Value::Null)),
                    _ => Some(Value::Object(Map::new())),
                };
            }
            let mut out = Map::new();
            for (k, x) in m {
                if let Some(y) = js_json_value(x) {
                    out.insert(k.clone(), y);
                }
            }
            Some(Value::Object(out))
        }
        Value::Array(a) => Some(Value::Array(a.iter().map(|x| js_json_value(x).unwrap_or(Value::Null)).collect())),
        other => Some(other.clone()),
    }
}
