//! A small port of the zod v4 behavior the doc schemas rely on: parse output
//! (shape keys first, then passed-through keys; stripped keys dropped), issue
//! order, default messages, abort/continue rules for unions and refinements.
//!
//! Values are `crate::json::Value`s as `crate::js` converts them: the JS
//! `undefined` is `{"__js":"undefined"}` (or an absent key), functions are
//! `{"__js":"function"}`.

use crate::json::{Map, Value};
use std::sync::Arc;

/// One path segment.
#[derive(Debug, Clone, PartialEq)]
pub enum Seg {
    Key(String),
    Index(usize),
}

impl Seg {
    fn text(&self) -> String {
        match self {
            Seg::Key(k) => k.clone(),
            Seg::Index(i) => i.to_string(),
        }
    }
}

/// A zod issue.
#[derive(Debug, Clone, PartialEq)]
pub struct Issue {
    pub code: &'static str,
    pub path: Vec<Seg>,
    pub message: String,
    /// `continue: true` issues do not abort (checks and refinements).
    pub cont: bool,
}

impl Issue {
    pub fn path_text(&self) -> String {
        if self.path.is_empty() {
            "(root)".into()
        } else {
            self.path.iter().map(|s| s.text()).collect::<Vec<_>>().join(".")
        }
    }
}

/// `formatZodError(label, error)`.
pub fn format_zod_error(label: &str, issues: &[Issue]) -> String {
    let parts: Vec<String> = issues.iter().map(|i| format!("{}: {}", i.path_text(), i.message)).collect();
    format!("{label} is invalid: {}", parts.join("; "))
}

/// Unknown-key policy of an object.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Mode {
    Strip,
    Passthrough,
    Strict,
}

/// A refinement: sees the parsed value, pushes issues (paths relative).
pub type Refine = Arc<dyn Fn(&Value, &mut Vec<Issue>) + Send + Sync>;

/// A schema.
#[derive(Clone)]
pub enum Z {
    Str { checks: Vec<StrCheck>, type_msg: Option<String> },
    Num { int: bool, safe: bool, positive: bool },
    Bool,
    Unknown,
    Literal(Value),
    Enum(Vec<&'static str>),
    Array { item: Box<Z>, min: Option<usize>, min_msg: Option<String>, max: Option<(usize, Option<String>)> },
    /// `z.custom(fn, {message})`.
    Custom(fn(&Value) -> bool, String),
    Object { shape: Vec<(&'static str, Z)>, mode: Mode, refines: Vec<Refine> },
    Optional(Box<Z>),
    Union(Vec<Z>),
    Disc(&'static str, Vec<Z>),
    Record { key: Box<Z>, value: Box<Z>, refines: Vec<(Refine, Option<String>)> },
    Lazy(fn() -> Z),
}

/// A string check, run in order.
#[derive(Clone)]
pub enum StrCheck {
    Min(usize, Option<String>),
    /// A JS regex source (no slashes) and flags, with an optional message.
    Regex(&'static str, &'static str, Option<String>),
    /// A refinement: passes when the function returns true; `abort` stops
    /// later checks.
    Refine(fn(&str) -> bool, String, bool),
    /// `.url()`: `new URL(value.trim())` must succeed.
    Url,
    /// `.max(n, msg)` in UTF-16 units.
    Max(usize, Option<String>),
    /// A refinement that may name its own message (superRefine on a string).
    RefineMsg(fn(&str) -> Option<String>),
}

/// Whether `new URL(text)` would succeed (WHATWG URL parsing, approximated:
/// a scheme, and a host for the special schemes).
pub fn js_url_parses(text: &str) -> bool {
    let t = text.trim_matches(|c: char| c <= ' ');
    let Some(colon) = t.find(':') else { return false };
    let scheme = &t[..colon];
    let mut chars = scheme.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.')) {
        return false;
    }
    let rest = &t[colon + 1..];
    let special = ["http", "https", "ftp", "ws", "wss"].contains(&scheme.to_ascii_lowercase().as_str());
    if special {
        let r = rest.trim_start_matches(['/', '\\']);
        let host_end = r.find(['/', '\\', '?', '#']).unwrap_or(r.len());
        let auth = &r[..host_end];
        let host = auth.rsplit('@').next().unwrap_or("");
        let host = match host.rfind(':') {
            Some(i) if !host.starts_with('[') || host[..i].ends_with(']') => {
                let port = &host[i + 1..];
                if !port.is_empty() && !port.chars().all(|c| c.is_ascii_digit()) {
                    return false;
                }
                &host[..i]
            }
            _ => host,
        };
        if host.is_empty() || host.contains(' ') {
            return false;
        }
    }
    true
}

// Builders.
pub fn string() -> Z {
    Z::Str { checks: vec![], type_msg: None }
}
pub fn non_empty() -> Z {
    Z::Str { checks: vec![StrCheck::Min(1, None)], type_msg: None }
}
pub fn string_min(n: usize, msg: &str) -> Z {
    Z::Str { checks: vec![StrCheck::Min(n, Some(msg.to_string()))], type_msg: None }
}
pub fn number() -> Z {
    Z::Num { int: false, safe: false, positive: false }
}
pub fn int_safe() -> Z {
    Z::Num { int: true, safe: true, positive: false }
}
pub fn positive() -> Z {
    Z::Num { int: false, safe: false, positive: true }
}
pub fn boolean() -> Z {
    Z::Bool
}
pub fn unknown() -> Z {
    Z::Unknown
}
pub fn literal(v: Value) -> Z {
    Z::Literal(v)
}
pub fn lit(s: &str) -> Z {
    Z::Literal(Value::String(s.into()))
}
pub fn enum_(v: &[&'static str]) -> Z {
    Z::Enum(v.to_vec())
}
pub fn array(item: Z) -> Z {
    Z::Array { item: Box::new(item), min: None, min_msg: None, max: None }
}
pub fn array_min(item: Z, n: usize) -> Z {
    Z::Array { item: Box::new(item), min: Some(n), min_msg: None, max: None }
}
pub fn object(shape: Vec<(&'static str, Z)>, mode: Mode) -> Z {
    Z::Object { shape, mode, refines: vec![] }
}
pub fn opt(z: Z) -> Z {
    Z::Optional(Box::new(z))
}
pub fn union(v: Vec<Z>) -> Z {
    Z::Union(v)
}
pub fn disc(key: &'static str, v: Vec<Z>) -> Z {
    Z::Disc(key, v)
}

impl Z {
    /// Add a check to a string schema.
    pub fn check(self, c: StrCheck) -> Z {
        match self {
            Z::Str { mut checks, type_msg } => {
                checks.push(c);
                Z::Str { checks, type_msg }
            }
            other => other,
        }
    }
    /// `z.string({error})`.
    pub fn type_message(self, m: &str) -> Z {
        match self {
            Z::Str { checks, .. } => Z::Str { checks, type_msg: Some(m.into()) },
            other => other,
        }
    }
    /// `.superRefine(f)` on an object schema.
    pub fn refine(self, f: Refine) -> Z {
        match self {
            Z::Object { shape, mode, mut refines } => {
                refines.push(f);
                Z::Object { shape, mode, refines }
            }
            other => other,
        }
    }
    /// `.extend({...})` (later keys replace, in place).
    pub fn extend(self, more: Vec<(&'static str, Z)>) -> Z {
        match self {
            Z::Object { mut shape, mode, .. } => {
                for (k, z) in more {
                    if let Some(slot) = shape.iter_mut().find(|(n, _)| *n == k) {
                        slot.1 = z;
                    } else {
                        shape.push((k, z));
                    }
                }
                Z::Object { shape, mode, refines: vec![] }
            }
            other => other,
        }
    }
    /// `.passthrough()` / `.strict()`.
    pub fn mode(self, m: Mode) -> Z {
        match self {
            Z::Object { shape, refines, .. } => Z::Object { shape, mode: m, refines },
            other => other,
        }
    }
}

/// JS `undefined` marker.
pub fn undefined() -> Value {
    let mut m = Map::new();
    m.insert("__js".into(), Value::String("undefined".into()));
    Value::Object(m)
}

fn marker(v: &Value) -> Option<&str> {
    match v {
        Value::Object(m) => m.get("__js").and_then(|x| x.as_str()),
        _ => None,
    }
}

/// zod's parsed type name for messages.
pub fn received(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(_) => "boolean".into(),
        Value::Number(_) => "number".into(),
        Value::String(_) => "string".into(),
        Value::Array(_) => "array".into(),
        Value::Object(_) => match marker(v) {
            Some("undefined") => "undefined".into(),
            Some("function") => "function".into(),
            Some("symbol") => "symbol".into(),
            Some("bigint") => "bigint".into(),
            Some("date") => "Date".into(),
            Some("number") => {
                let s = v.get("value").and_then(|x| x.as_str()).unwrap_or("");
                if s == "NaN" {
                    "NaN".into()
                } else {
                    "number".into()
                }
            }
            Some("promise") => "promise".into(),
            Some("map") => "map".into(),
            Some("set") => "set".into(),
            _ => "object".into(),
        },
    }
}

fn is_plain_object(v: &Value) -> bool {
    match v {
        Value::Object(_) => match marker(v) {
            None => true,
            Some("regexp") | Some("error") | Some("circular") => true,
            _ => false,
        },
        _ => false,
    }
}

fn is_undef(v: &Value) -> bool {
    marker(v) == Some("undefined")
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

fn literal_text(v: &Value) -> String {
    match v {
        Value::String(s) => serde_json::to_string(s).unwrap(),
        other => crate::json::stringify(other, 0),
    }
}

fn aborted(issues: &[Issue], from: usize) -> bool {
    issues[from..].iter().any(|i| !i.cont)
}

fn issue(code: &'static str, path: &[Seg], message: String, cont: bool) -> Issue {
    Issue { code, path: path.to_vec(), message, cont }
}

fn type_issue(expected: &str, v: &Value, path: &[Seg], msg: &Option<String>) -> Issue {
    issue(
        "invalid_type",
        path,
        msg.clone().unwrap_or_else(|| format!("Invalid input: expected {expected}, received {}", received(v))),
        false,
    )
}

/// `schema.safeParse(value)`: the output value, or every issue.
pub fn safe_parse(z: &Z, v: &Value) -> Result<Value, Vec<Issue>> {
    let (out, issues) = parse_all(z, v);
    if issues.is_empty() {
        Ok(out)
    } else {
        Err(issues)
    }
}

/// The output value and every issue, so a caller can run a refinement
/// when no issue aborted.
pub fn parse_all(z: &Z, v: &Value) -> (Value, Vec<Issue>) {
    let mut issues = Vec::new();
    let out = parse(z, v, &[], &mut issues);
    (out, issues)
}

/// Whether any issue aborts (zod `aborted`).
pub fn any_aborted(issues: &[Issue]) -> bool {
    issues.iter().any(|i| !i.cont)
}

fn parse(z: &Z, v: &Value, path: &[Seg], issues: &mut Vec<Issue>) -> Value {
    match z {
        Z::Lazy(f) => parse(&f(), v, path, issues),
        Z::Optional(inner) => {
            if is_undef(v) {
                v.clone()
            } else {
                parse(inner, v, path, issues)
            }
        }
        Z::Unknown => v.clone(),
        Z::Str { checks, type_msg } => {
            let Value::String(s) = v else {
                issues.push(type_issue("string", v, path, type_msg));
                return v.clone();
            };
            let mut stop = false;
            for c in checks {
                if stop {
                    break;
                }
                match c {
                    StrCheck::Min(n, msg) => {
                        if utf16_len(s) < *n {
                            issues.push(issue(
                                "too_small",
                                path,
                                msg.clone().unwrap_or_else(|| format!("Too small: expected string to have >={n} characters")),
                                true,
                            ));
                        }
                    }
                    StrCheck::Regex(src, flags, msg) => {
                        let ok = regress::Regex::with_flags(src, *flags).map(|r| r.find(s).is_some()).unwrap_or(false);
                        if !ok {
                            let text = format!("/{src}/{flags}");
                            issues.push(issue(
                                "invalid_format",
                                path,
                                msg.clone().unwrap_or_else(|| format!("Invalid string: must match pattern {text}")),
                                true,
                            ));
                        }
                    }
                    StrCheck::Url => {
                        if !js_url_parses(s) {
                            issues.push(issue("invalid_format", path, "Invalid URL".into(), true));
                        }
                    }
                    StrCheck::Max(n, msg) => {
                        if utf16_len(s) > *n {
                            issues.push(issue(
                                "too_big",
                                path,
                                msg.clone().unwrap_or_else(|| format!("Too big: expected string to have <={n} characters")),
                                true,
                            ));
                        }
                    }
                    StrCheck::RefineMsg(f) => {
                        if let Some(m) = f(s) {
                            issues.push(issue("custom", path, m, true));
                        }
                    }
                    StrCheck::Refine(f, msg, abort) => {
                        if !f(s) {
                            issues.push(issue("custom", path, msg.clone(), !*abort));
                            if *abort {
                                stop = true;
                            }
                        }
                    }
                }
            }
            v.clone()
        }
        Z::Num { int, safe, positive } => {
            let Value::Number(n) = v else {
                issues.push(type_issue("number", v, path, &None));
                return v.clone();
            };
            let f = n.as_f64().unwrap_or(0.0);
            if *positive && f <= 0.0 {
                issues.push(issue("too_small", path, "Too small: expected number to be >0".into(), true));
            }
            if *int && f.fract() != 0.0 {
                issues.push(issue("invalid_type", path, "Invalid input: expected int, received number".into(), false));
            } else if *safe && f.abs() > 9007199254740991.0 {
                issues.push(issue(
                    if f > 0.0 { "too_big" } else { "too_small" },
                    path,
                    if f > 0.0 {
                        "Too big: expected int to be <=9007199254740991".into()
                    } else {
                        "Too small: expected int to be >=-9007199254740991".into()
                    },
                    true,
                ));
            }
            v.clone()
        }
        Z::Bool => {
            if !v.is_boolean() {
                issues.push(type_issue("boolean", v, path, &None));
            }
            v.clone()
        }
        Z::Literal(l) => {
            if v != l {
                issues.push(issue("invalid_value", path, format!("Invalid input: expected {}", literal_text(l)), false));
            }
            v.clone()
        }
        Z::Enum(opts) => {
            let ok = matches!(v, Value::String(s) if opts.contains(&s.as_str()));
            if !ok {
                let list: Vec<String> = opts.iter().map(|o| serde_json::to_string(o).unwrap()).collect();
                issues.push(issue(
                    "invalid_value",
                    path,
                    if opts.len() == 1 {
                        format!("Invalid input: expected {}", list[0])
                    } else {
                        format!("Invalid option: expected one of {}", list.join("|"))
                    },
                    false,
                ));
            }
            v.clone()
        }
        Z::Custom(f, msg) => {
            if !f(v) {
                issues.push(issue("custom", path, msg.clone(), false));
            }
            v.clone()
        }
        Z::Array { item, min, min_msg, max } => {
            let Value::Array(a) = v else {
                issues.push(type_issue("array", v, path, &None));
                return v.clone();
            };
            let start = issues.len();
            let mut out = Vec::with_capacity(a.len());
            for (i, x) in a.iter().enumerate() {
                let mut p = path.to_vec();
                p.push(Seg::Index(i));
                out.push(parse(item, x, &p, issues));
            }
            if let Some(n) = min {
                if !aborted(issues, start) && a.len() < *n {
                    issues.push(issue("too_small", path, min_msg.clone().unwrap_or_else(|| format!("Too small: expected array to have >={n} items")), true));
                }
            }
            if let Some((n, msg)) = max {
                if !aborted(issues, start) && a.len() > *n {
                    issues.push(issue(
                        "too_big",
                        path,
                        msg.clone().unwrap_or_else(|| format!("Too big: expected array to have <={n} items")),
                        true,
                    ));
                }
            }
            Value::Array(out)
        }
        Z::Object { shape, mode, refines } => {
            if !is_plain_object(v) {
                issues.push(type_issue("object", v, path, &None));
                return v.clone();
            }
            let input = v.as_object().unwrap();
            let start = issues.len();
            let mut out = Map::new();
            for (k, sz) in shape {
                let mut p = path.to_vec();
                p.push(Seg::Key((*k).to_string()));
                match input.get(*k) {
                    Some(x) => {
                        let r = parse(sz, x, &p, issues);
                        out.insert((*k).to_string(), r);
                    }
                    None => {
                        let u = undefined();
                        let before = issues.len();
                        parse(sz, &u, &p, issues);
                        let _ = before;
                    }
                }
            }
            let unknown: Vec<&String> = input.keys().filter(|k| !shape.iter().any(|(n, _)| n == &k.as_str())).collect();
            match mode {
                Mode::Passthrough => {
                    for k in &unknown {
                        out.insert((*k).clone(), input[k.as_str()].clone());
                    }
                }
                Mode::Strict => {
                    if !unknown.is_empty() {
                        let names: Vec<String> = unknown.iter().map(|k| serde_json::to_string(k).unwrap()).collect();
                        issues.push(issue(
                            "unrecognized_keys",
                            path,
                            format!(
                                "Unrecognized key{}: {}",
                                if names.len() > 1 { "s" } else { "" },
                                names.join(", ")
                            ),
                            false,
                        ));
                    }
                }
                Mode::Strip => {}
            }
            let out = Value::Object(out);
            if !refines.is_empty() && !aborted(issues, start) {
                for r in refines {
                    let mut local = Vec::new();
                    r(&out, &mut local);
                    for mut i in local {
                        let mut p = path.to_vec();
                        p.extend(i.path);
                        i.path = p;
                        i.cont = true;
                        issues.push(i);
                    }
                }
            }
            out
        }
        Z::Record { key, value, refines } => {
            if !is_plain_object(v) {
                issues.push(type_issue("record", v, path, &None));
                return v.clone();
            }
            let start = issues.len();
            let mut out = Map::new();
            for (k, x) in v.as_object().unwrap() {
                let mut p = path.to_vec();
                p.push(Seg::Key(k.clone()));
                let mut kis = Vec::new();
                parse(key, &Value::String(k.clone()), &[], &mut kis);
                if !kis.is_empty() {
                    issues.push(issue("invalid_key", &p, "Invalid key in record".into(), false));
                    continue;
                }
                let r = parse(value, x, &p, issues);
                out.insert(k.clone(), r);
            }
            let out = Value::Object(out);
            if !aborted(issues, start) {
                for (r, _) in refines {
                    let mut local = Vec::new();
                    r(&out, &mut local);
                    for mut i in local {
                        let mut p = path.to_vec();
                        p.extend(i.path);
                        i.path = p;
                        i.cont = true;
                        issues.push(i);
                    }
                }
            }
            out
        }
        Z::Union(opts) => {
            let mut results: Vec<(Value, Vec<Issue>)> = Vec::new();
            for o in opts {
                let mut local = Vec::new();
                let out = parse(o, v, path, &mut local);
                if local.is_empty() {
                    return out;
                }
                results.push((out, local));
            }
            let nonaborted: Vec<&(Value, Vec<Issue>)> = results.iter().filter(|(_, is)| !aborted(is, 0)).collect();
            if nonaborted.len() == 1 {
                issues.extend(nonaborted[0].1.iter().cloned());
                return nonaborted[0].0.clone();
            }
            issues.push(issue("invalid_union", path, "Invalid input".into(), false));
            v.clone()
        }
        Z::Disc(key, opts) => {
            if !is_plain_object(v) {
                issues.push(type_issue("object", v, path, &None));
                return v.clone();
            }
            let d = v.get(*key);
            for o in opts {
                if let Z::Object { shape, .. } = o {
                    if let Some((_, Z::Literal(l))) = shape.iter().find(|(n, _)| n == key) {
                        if Some(l) == d {
                            return parse(o, v, path, issues);
                        }
                    }
                }
            }
            let names: Vec<String> = opts
                .iter()
                .filter_map(|o| match o {
                    Z::Object { shape, .. } => shape.iter().find(|(n, _)| n == key).and_then(|(_, z)| match z {
                        Z::Literal(Value::String(s)) => Some(format!("'{s}'")),
                        Z::Literal(l) => Some(crate::json::stringify(l, 0)),
                        _ => None,
                    }),
                    _ => None,
                })
                .collect();
            let mut p = path.to_vec();
            p.push(Seg::Key((*key).to_string()));
            issues.push(issue(
                "invalid_union",
                &p,
                format!("Invalid discriminator value. Expected {}", names.join(" | ")),
                false,
            ));
            v.clone()
        }
    }
}
