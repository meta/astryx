//! Port of `foundation/discovery/prop-drift.mjs`: documented props against
//! each component's TypeScript props, read with the project's own compiler.

use super::type_match::{aliased, judge_type, union_members, JudgeCtx, Verdict};
use super::Ts;
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};
use boa_engine::JsValue;
use std::cell::RefCell;
use std::rc::Rc;

pub const PROPS_NOT_DOCUMENTED: &[&str] = &["className", "style", "xstyle", "data-testid", "ref", "key"];
const NOT_EXACT: &str = "not a form the check judges exactly";
const VARIANTS: &str = "the prop's variants give this field different types";
const CODE_DEFAULT_NOT_LITERAL: &str = "its default in the code is not a literal, so the documented default was not compared";
const DOC_DEFAULT_NOT_LITERAL: &str = "its documented default is not a literal, so it was not compared with the code's";

pub(crate) fn some(v: &JsValue) -> bool {
    !v.is_undefined() && !v.is_null()
}

pub(crate) fn fl(t: &mut Ts, v: &JsValue, key: &str) -> u64 {
    let f = t.get(v, key);
    let n = t.n(&f);
    if n.is_nan() {
        0
    } else {
        n as i64 as u64
    }
}

pub(crate) fn tf(t: &mut Ts, n: &str) -> u64 {
    t.enum_value("TypeFlags", n) as i64 as u64
}
pub(crate) fn sf_(t: &mut Ts, n: &str) -> u64 {
    t.enum_value("SymbolFlags", n) as i64 as u64
}
pub(crate) fn of_(t: &mut Ts, n: &str) -> u64 {
    t.enum_value("ObjectFlags", n) as i64 as u64
}
pub(crate) fn sk(t: &mut Ts, n: &str) -> f64 {
    t.enum_value("SyntaxKind", n)
}

pub(crate) fn name_of(t: &mut Ts, v: &JsValue) -> String {
    let n = t.get(v, "name");
    t.s(&n)
}

pub(crate) fn text_of(t: &mut Ts, v: &JsValue) -> String {
    let n = t.get(v, "text");
    t.s(&n)
}

pub(crate) fn file_of(t: &mut Ts, node: &JsValue) -> String {
    let sf = t.m(node, "getSourceFile", &[]);
    let f = t.get(&sf, "fileName");
    t.s(&f)
}

pub(crate) fn is_union(t: &mut Ts, ty: &JsValue) -> bool {
    t.m(ty, "isUnion", &[]).to_boolean()
}
pub(crate) fn is_inter(t: &mut Ts, ty: &JsValue) -> bool {
    t.m(ty, "isIntersection", &[]).to_boolean()
}
pub(crate) fn types_of(t: &mut Ts, ty: &JsValue) -> Vec<JsValue> {
    let v = t.get(ty, "types");
    t.items(&v)
}
pub(crate) fn decls(t: &mut Ts, sym: &JsValue) -> Vec<JsValue> {
    let v = t.get(sym, "declarations");
    t.items(&v)
}

pub(crate) fn contains(t: &Ts, list: &[JsValue], v: &JsValue) -> bool {
    list.iter().any(|x| t.same(x, v))
}

/// `strongest(found)`.
pub(crate) fn strongest(found: &[Option<&'static str>]) -> Option<&'static str> {
    ["own", "foreign", "unknown"].into_iter().find(|a| found.contains(&Some(*a)))
}

#[derive(Clone, Debug, PartialEq)]
pub enum Lit {
    Str(String),
    Num(f64),
    Bool(bool),
    Null,
    NotLiteral,
}

fn default_text(v: &Lit) -> String {
    match v {
        Lit::Str(s) => format!("'{s}'"),
        Lit::Num(n) => crate::json::js_number_to_string(*n),
        Lit::Bool(b) => b.to_string(),
        Lit::Null => "null".into(),
        Lit::NotLiteral => String::new(),
    }
}

fn lit_eq(a: &Lit, b: &Lit) -> bool {
    match (a, b) {
        (Lit::Num(x), Lit::Num(y)) => x == y,
        _ => a == b,
    }
}

/// `documentedDefault(written)`.
fn documented_default(written: &Value) -> Option<Lit> {
    match written {
        Value::Number(n) => Some(Lit::Num(n.as_f64().unwrap_or(f64::NAN))),
        Value::Bool(b) => Some(Lit::Bool(*b)),
        Value::Null => Some(Lit::Null),
        Value::String(s) => {
            let text = s.trim_matches(crate::discovery::paths::js_ws);
            if let Some(m) = crate::doctor_re!(r"^(['\x22`])([^'\x22`]*)\1$").find(text) {
                return Some(Lit::Str(text[m.group(2).unwrap()].to_string()));
            }
            if crate::doctor_re!(r"^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$", "i").find(text).is_some() {
                return Some(Lit::Num(crate::discovery::semver::js_number(text)));
            }
            match text {
                "true" => Some(Lit::Bool(true)),
                "false" => Some(Lit::Bool(false)),
                "null" => Some(Lit::Null),
                _ => None,
            }
        }
        _ => None,
    }
}

/// `literalValue(ts, node)`.
fn literal_value(t: &mut Ts, node: &JsValue) -> Option<Lit> {
    if t.is("isStringLiteral", node) || t.is("isNoSubstitutionTemplateLiteral", node) {
        return Some(Lit::Str(text_of(t, node)));
    }
    if t.is("isNumericLiteral", node) {
        return Some(Lit::Num(crate::discovery::semver::js_number(&text_of(t, node))));
    }
    if t.is("isPrefixUnaryExpression", node) {
        let op = t.get(node, "operator");
        let operand = t.get(node, "operand");
        if t.n(&op) == sk(t, "MinusToken") && t.is("isNumericLiteral", &operand) {
            return Some(Lit::Num(-crate::discovery::semver::js_number(&text_of(t, &operand))));
        }
    }
    let k = t.kind(node);
    if k == sk(t, "TrueKeyword") {
        return Some(Lit::Bool(true));
    }
    if k == sk(t, "FalseKeyword") {
        return Some(Lit::Bool(false));
    }
    if k == sk(t, "NullKeyword") {
        return Some(Lit::Null);
    }
    None
}

/// `literalDefaults(ts, symbol)`.
fn literal_defaults(t: &mut Ts, symbol: &JsValue) -> Vec<(String, Lit)> {
    let mut out: Vec<(String, Lit)> = Vec::new();
    fn fn_of(t: &mut Ts, node: &JsValue, depth: usize) -> Option<JsValue> {
        if !some(node) || depth > 4 {
            return None;
        }
        if t.is("isFunctionDeclaration", node) || t.is("isArrowFunction", node) || t.is("isFunctionExpression", node) {
            return Some(node.clone());
        }
        if t.is("isVariableDeclaration", node) {
            let i = t.get(node, "initializer");
            return fn_of(t, &i, depth + 1);
        }
        if t.is("isParenthesizedExpression", node) || t.is("isAsExpression", node) || t.is("isSatisfiesExpression", node) {
            let e = t.get(node, "expression");
            return fn_of(t, &e, depth + 1);
        }
        if t.is("isCallExpression", node) {
            let args = t.get(node, "arguments");
            for a in t.items(&args) {
                if let Some(f) = fn_of(t, &a, depth + 1) {
                    return Some(f);
                }
            }
        }
        None
    }
    let vd = if some(symbol) { t.get(symbol, "valueDeclaration") } else { JsValue::undefined() };
    let Some(f) = fn_of(t, &vd, 0) else { return out };
    let ps = t.get(&f, "parameters");
    let p0 = t.get_i(&ps, 0);
    let pattern = t.get(&p0, "name");
    if !some(&pattern) || !t.is("isObjectBindingPattern", &pattern) {
        return out;
    }
    let els = t.get(&pattern, "elements");
    for e in t.items(&els) {
        let init = t.get(&e, "initializer");
        if some(&t.get(&e, "dotDotDotToken")) || !some(&init) {
            continue;
        }
        let pn = t.get(&e, "propertyName");
        let key = if some(&pn) { pn } else { t.get(&e, "name") };
        if !(t.is("isIdentifier", &key) || t.is("isStringLiteral", &key) || t.is("isNumericLiteral", &key)) {
            continue;
        }
        let k = text_of(t, &key);
        let v = literal_value(t, &init).unwrap_or(Lit::NotLiteral);
        match out.iter_mut().find(|(x, _)| *x == k) {
            Some(slot) => slot.1 = v,
            None => out.push((k, v)),
        }
    }
    out
}

fn type_to_string(t: &mut Ts, checker: &JsValue, ty: &JsValue, at: Option<&JsValue>, flags: Option<u64>) -> String {
    let mut args = vec![ty.clone()];
    if let Some(a) = at {
        args.push(a.clone());
    } else if flags.is_some() {
        args.push(JsValue::undefined());
    }
    if let Some(f) = flags {
        args.push(JsValue::from(f as f64));
    }
    let v = t.m(checker, "typeToString", &args);
    t.s(&v)
}

pub(crate) fn tff(t: &mut Ts, n: &str) -> u64 {
    t.enum_value("TypeFormatFlags", n) as i64 as u64
}

pub fn literal_defaults_pub(t: &mut Ts, symbol: &JsValue) -> Vec<(String, Lit)> {
    literal_defaults(t, symbol)
}
