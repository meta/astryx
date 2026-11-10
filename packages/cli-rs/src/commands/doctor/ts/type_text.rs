//! Port of `foundation/discovery/type-text.mjs`: a written type, normalized
//! with the project's own TypeScript parser so two spellings of one type
//! compare equal.

use super::Ts;
use super::JsValue;
use std::collections::HashMap;

pub const UNPARSED: &str = "\u{0}";


const FN: u8 = 0;
const UNION: u8 = 1;
const INTERSECTION: u8 = 2;
const OPERATOR: u8 = 3;
const POSTFIX: u8 = 4;
const PRIMARY: u8 = 5;

#[derive(Clone)]
struct Printed {
    text: String,
    level: u8,
    literal: Option<&'static str>,
}

fn done(text: String, level: u8) -> Printed {
    Printed { text, level, literal: None }
}

fn is_ws(c: u16) -> bool {
    char::from_u32(c as u32).map(crate::discovery::paths::js_ws).unwrap_or(false)
}

fn is_word(c: Option<u16>) -> bool {
    matches!(c, Some(c) if c < 128 && ((c as u8).is_ascii_alphanumeric() || c == b'_' as u16 || c == b'$' as u16))
}

/// `compact(text)`.
pub fn compact(text: &str) -> String {
    let t: Vec<u16> = text.encode_utf16().collect();
    let n = t.len();
    let comment = |at: usize| t.get(at) == Some(&(b'/' as u16)) && matches!(t.get(at + 1), Some(&c) if c == b'*' as u16 || c == b'/' as u16);
    let index_of = |pat: &[u16], from: usize| -> isize {
        if from > n {
            return -1;
        }
        (from..n.saturating_sub(pat.len() - 1)).find(|&i| t[i..i + pat.len()] == *pat).map(|i| i as isize).unwrap_or(-1)
    };
    let mut out: Vec<u16> = Vec::new();
    let mut i = 0usize;
    while i < n {
        let c = t[i];
        if c == b'"' as u16 || c == b'\'' as u16 || c == b'`' as u16 {
            let mut j = i + 1;
            while j < n && t[j] != c {
                j += if t[j] == b'\\' as u16 { 2 } else { 1 };
            }
            out.extend_from_slice(&t[i..(j + 1).min(n)]);
            i = j + 1;
            continue;
        }
        if is_ws(c) || comment(i) {
            let mut k = i;
            while k < n && (is_ws(t[k]) || comment(k)) {
                if !comment(k) {
                    k += 1;
                    continue;
                }
                let end = if t[k + 1] == b'*' as u16 {
                    index_of(&[b'*' as u16, b'/' as u16], k + 2) + 2
                } else {
                    index_of(&[b'\n' as u16], k + 2)
                };
                k = if end <= 1 { n } else { end as usize };
            }
            if is_word(out.last().copied()) && is_word(t.get(k).copied()) {
                out.push(b' ' as u16);
            }
            i = k;
            continue;
        }
        out.push(c);
        i += 1;
    }
    String::from_utf16_lossy(&out)
}

pub fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', "\\n"))
}

fn text_of(t: &mut Ts, node: &JsValue) -> String {
    let v = t.get(node, "text");
    t.s(&v)
}

fn get_text(t: &mut Ts, node: &JsValue, sf: Option<&JsValue>) -> String {
    let args: Vec<JsValue> = sf.cloned().into_iter().collect();
    let v = t.m(node, "getText", &args);
    t.s(&v)
}

fn some(v: &JsValue) -> bool {
    !v.is_undefined() && !v.is_null()
}

fn print(t: &mut Ts, sf: &JsValue, node: &JsValue) -> Printed {
    let k = |t: &mut Ts, n: &str| t.enum_value("SyntaxKind", n);
    let kept = |t: &mut Ts| done(compact(&get_text(t, node, Some(sf))), FN);
    if t.is("isParenthesizedTypeNode", node) {
        let ty = t.get(node, "type");
        return print(t, sf, &ty);
    }
    if t.is("isUnionTypeNode", node) {
        let parts = union_parts(t, sf, node, false);
        return if parts.len() == 1 { parts[0].clone() } else { done(parts.iter().map(display).collect::<Vec<_>>().join("|"), UNION) };
    }
    if t.is("isIntersectionTypeNode", node) {
        let mut parts: Vec<JsValue> = Vec::new();
        fn flatten(t: &mut Ts, n: &JsValue, parts: &mut Vec<JsValue>) {
            let inner = unwrap_paren(t, n);
            if t.is("isIntersectionTypeNode", &inner) {
                let ty = t.get(&inner, "types");
                for x in t.items(&ty) {
                    flatten(t, &x, parts);
                }
            } else {
                parts.push(inner);
            }
        }
        flatten(t, node, &mut parts);
        let texts: Vec<String> = parts.iter().map(|p| at(t, sf, p, OPERATOR)).collect();
        return done(texts.join("&"), INTERSECTION);
    }
    if t.is("isFunctionTypeNode", node) || t.is("isConstructorTypeNode", node) {
        let prefix = if t.is("isConstructorTypeNode", node) {
            let abs = k(t, "AbstractKeyword");
            let mods = t.get(node, "modifiers");
            let is_abs = t.items(&mods).iter().any(|m| t.kind(m) == abs);
            format!("{}new", if is_abs { "abstract " } else { "" })
        } else {
            String::new()
        };
        let tp = type_parameters(t, sf, node);
        let ps = t.get(node, "parameters");
        let pr = parameters(t, sf, &ps);
        let rt = return_type(t, sf, node);
        return done(format!("{prefix}{tp}({pr})=>{rt}"), FN);
    }
    if t.is("isConditionalTypeNode", node) {
        let (a, b, c, d) = (t.get(node, "checkType"), t.get(node, "extendsType"), t.get(node, "trueType"), t.get(node, "falseType"));
        let s = format!("{} extends {}?{}:{}", at(t, sf, &a, UNION), at(t, sf, &b, UNION), at(t, sf, &c, UNION), at(t, sf, &d, UNION));
        return done(s, FN);
    }
    if t.is("isArrayTypeNode", node) {
        let e = t.get(node, "elementType");
        return done(format!("{}[]", at(t, sf, &e, POSTFIX)), POSTFIX);
    }
    if t.is("isIndexedAccessTypeNode", node) {
        let (o, i) = (t.get(node, "objectType"), t.get(node, "indexType"));
        return done(format!("{}[{}]", at(t, sf, &o, POSTFIX), at(t, sf, &i, UNION)), POSTFIX);
    }
    if t.is("isTypeOperatorNode", node) {
        let op = t.get(node, "operator");
        let op = t.n(&op);
        let ty = t.get(node, "type");
        if op == k(t, "ReadonlyKeyword") {
            return print(t, sf, &ty);
        }
        let word = if op == k(t, "KeyOfKeyword") { "keyof" } else { "unique" };
        return done(format!("{word} {}", at(t, sf, &ty, OPERATOR)), OPERATOR);
    }
    if t.is("isInferTypeNode", node) {
        let p = t.get(node, "typeParameter");
        let name = t.get(&p, "name");
        let name = text_of(t, &name);
        let c = t.get(&p, "constraint");
        return if some(&c) { done(format!("infer {name} extends {}", at(t, sf, &c, UNION)), FN) } else { done(format!("infer {name}"), OPERATOR) };
    }
    if t.is("isTypeReferenceNode", node) {
        let tn = t.get(node, "typeName");
        let name = entity_name(t, &tn, true);
        let args = t.get(node, "typeArguments");
        let args = t.items(&args);
        if args.len() == 1 && (name == "Array" || name == "ReadonlyArray") {
            return done(format!("{}[]", at(t, sf, &args[0], POSTFIX)), POSTFIX);
        }
        if args.len() == 1 && name == "Readonly" {
            return print(t, sf, &args[0]);
        }
        let ta = type_arguments(t, sf, &args);
        return done(name + &ta, PRIMARY);
    }
    if t.is("isTypeQueryNode", node) {
        let en = t.get(node, "exprName");
        let name = entity_name(t, &en, false);
        let args = t.get(node, "typeArguments");
        let args = t.items(&args);
        let ta = type_arguments(t, sf, &args);
        return done(format!("typeof {name}{ta}"), PRIMARY);
    }
    if t.is("isImportTypeNode", node) {
        let arg = t.get(node, "argument");
        let lit = t.get(&arg, "literal");
        let attrs = t.get(node, "attributes");
        let asserts = t.get(node, "assertions");
        if !some(&lit) || !t.is("isStringLiteral", &lit) || some(&attrs) || some(&asserts) {
            return kept(t);
        }
        let q = t.get(node, "qualifier");
        let qualifier = if some(&q) { format!(".{}", entity_name(t, &q, false)) } else { String::new() };
        let tof = t.get(node, "isTypeOf").to_boolean();
        let args = t.get(node, "typeArguments");
        let args = t.items(&args);
        let ta = type_arguments(t, sf, &args);
        let lt = text_of(t, &lit);
        return done(format!("{}import({}){qualifier}{ta}", if tof { "typeof " } else { "" }, quote(&lt)), PRIMARY);
    }
    if t.is("isTupleTypeNode", node) {
        let els = t.get(node, "elements");
        let parts: Vec<String> = t.items(&els).iter().map(|e| tuple_element(t, sf, e)).collect();
        return done(format!("[{}]", parts.join(",")), PRIMARY);
    }
    if t.is("isTypeLiteralNode", node) {
        return done(type_literal(t, sf, node), PRIMARY);
    }
    if t.is("isMappedTypeNode", node) {
        let p = t.get(node, "typeParameter");
        let name = t.get(&p, "name");
        let name = text_of(t, &name);
        let c = t.get(&p, "constraint");
        let nt = t.get(node, "nameType");
        let as_ = if some(&nt) { format!(" as {}", at(t, sf, &nt, UNION)) } else { String::new() };
        let qt = t.get(node, "questionToken");
        let question = if some(&qt) {
            if t.kind(&qt) == k(t, "MinusToken") {
                "-?"
            } else {
                "?"
            }
        } else {
            ""
        };
        let ty = t.get(node, "type");
        let value = if some(&ty) { format!(":{}", at(t, sf, &ty, UNION)) } else { String::new() };
        let cs = at(t, sf, &c, UNION);
        return done(format!("{{[{name} in {cs}{as_}]{question}{value}}}"), PRIMARY);
    }
    if t.is("isLiteralTypeNode", node) {
        let l = t.get(node, "literal");
        return literal(t, &l).unwrap_or_else(|| kept(t));
    }
    if t.is("isTemplateLiteralTypeNode", node) {
        let raw = |s: &str| {
            let s = s.replace('\\', "\\\\");
            let mut out = String::new();
            let mut it = s.chars().peekable();
            while let Some(c) = it.next() {
                if c == '`' {
                    out.push_str("\\`");
                } else if c == '$' && it.peek() == Some(&'{') {
                    it.next();
                    out.push_str("\\${");
                } else {
                    out.push(c);
                }
            }
            out
        };
        let head = t.get(node, "head");
        let h = text_of(t, &head);
        let mut s = format!("`{}", raw(&h));
        let spans = t.get(node, "templateSpans");
        for sp in t.items(&spans) {
            let ty = t.get(&sp, "type");
            let lit = t.get(&sp, "literal");
            let lt = text_of(t, &lit);
            s.push_str(&format!("${{{}}}{}", at(t, sf, &ty, UNION), raw(&lt)));
        }
        s.push('`');
        return done(s, PRIMARY);
    }
    let kind = t.kind(node);
    if kind == k(t, "ThisType") {
        return done("this".into(), PRIMARY);
    }
    if (kind >= k(t, "FirstKeyword") && kind <= k(t, "LastKeyword")) || kind == k(t, "NullKeyword") {
        let text = get_text(t, node, Some(sf));
        return if crate::doctor_re!(r"^[a-z]+$").find(&text).is_some() { done(text, PRIMARY) } else { kept(t) };
    }
    kept(t)
}

fn unwrap_paren(t: &mut Ts, node: &JsValue) -> JsValue {
    let mut inner = node.clone();
    while t.is("isParenthesizedTypeNode", &inner) {
        inner = t.get(&inner, "type");
    }
    inner
}

fn display(p: &Printed) -> String {
    if p.level < INTERSECTION {
        format!("({})", p.text)
    } else {
        p.text.clone()
    }
}

fn js_sort(v: &mut [String]) {
    v.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
}

fn union_parts(t: &mut Ts, sf: &JsValue, node: &JsValue, optional: bool) -> Vec<Printed> {
    let mut members: Vec<Printed> = Vec::new();
    fn visit(t: &mut Ts, sf: &JsValue, n: &JsValue, members: &mut Vec<Printed>) {
        let inner = unwrap_paren(t, n);
        if t.is("isUnionTypeNode", &inner) {
            let ty = t.get(&inner, "types");
            for x in t.items(&ty) {
                visit(t, sf, &x, members);
            }
            return;
        }
        if t.is("isTypeReferenceNode", &inner) {
            let args = t.get(&inner, "typeArguments");
            let args = t.items(&args);
            let tn = t.get(&inner, "typeName");
            if args.len() == 1 && entity_name(t, &tn, true) == "Readonly" {
                visit(t, sf, &args[0], members);
                return;
            }
        }
        if t.is("isTypeOperatorNode", &inner) {
            let op = t.get(&inner, "operator");
            if t.n(&op) == t.enum_value("SyntaxKind", "ReadonlyKeyword") {
                let ty = t.get(&inner, "type");
                visit(t, sf, &ty, members);
                return;
            }
        }
        members.push(print(t, sf, &inner));
    }
    visit(t, sf, node, &mut members);
    let texts: Vec<String> = members.iter().map(display).collect();
    let mut absorbed: Vec<&str> = ["string", "number", "boolean"].into_iter().filter(|x| texts.iter().any(|y| y == x)).collect();
    if texts.iter().any(|x| x == "true") && texts.iter().any(|x| x == "false") && !absorbed.contains(&"boolean") {
        absorbed.push("boolean");
    }
    let mut out: Vec<(String, Printed)> = Vec::new();
    let mut set = |out: &mut Vec<(String, Printed)>, k: String, v: Printed| match out.iter_mut().find(|(x, _)| *x == k) {
        Some(e) => e.1 = v,
        None => out.push((k, v)),
    };
    for m in &members {
        if let Some(l) = m.literal {
            if l != "other" && absorbed.contains(&l) {
                continue;
            }
        }
        set(&mut out, display(m), m.clone());
    }
    if absorbed.contains(&"boolean") {
        set(&mut out, "boolean".into(), done("boolean".into(), PRIMARY));
    }
    if out.len() > 1 {
        out.retain(|(k, _)| k != "never");
    }
    if optional {
        out.retain(|(k, _)| k != "undefined");
    }
    let mut keys: Vec<String> = out.iter().map(|(k, _)| k.clone()).collect();
    js_sort(&mut keys);
    keys.into_iter().map(|k| out.iter().find(|(x, _)| *x == k).unwrap().1.clone()).collect()
}

fn js_number_text(text: &str) -> Option<f64> {
    Some(crate::discovery::semver::js_number(text))
}

fn literal(t: &mut Ts, lit: &JsValue) -> Option<Printed> {
    let kind = t.kind(lit);
    let k = |t: &mut Ts, n: &str| t.enum_value("SyntaxKind", n);
    if t.is("isStringLiteral", lit) || kind == k(t, "NoSubstitutionTemplateLiteral") {
        let s = text_of(t, lit);
        return Some(Printed { text: quote(&s), level: PRIMARY, literal: Some("string") });
    }
    if t.is("isNumericLiteral", lit) {
        let v = js_number_text(&text_of(t, lit))?;
        return v.is_finite().then(|| Printed { text: crate::json::js_number_to_string(v), level: PRIMARY, literal: Some("number") });
    }
    if t.is("isPrefixUnaryExpression", lit) {
        let op = t.get(lit, "operator");
        let operand = t.get(lit, "operand");
        if t.n(&op) == k(t, "MinusToken") && t.is("isNumericLiteral", &operand) {
            let v = -js_number_text(&text_of(t, &operand))?;
            return v.is_finite().then(|| Printed { text: crate::json::js_number_to_string(v), level: PRIMARY, literal: Some("number") });
        }
    }
    if kind == k(t, "TrueKeyword") || kind == k(t, "FalseKeyword") {
        let tr = kind == k(t, "TrueKeyword");
        return Some(Printed { text: (if tr { "true" } else { "false" }).into(), level: PRIMARY, literal: Some("boolean") });
    }
    if kind == k(t, "NullKeyword") {
        return Some(done("null".into(), PRIMARY));
    }
    None
}

pub fn entity_name(t: &mut Ts, name: &JsValue, drop_react: bool) -> String {
    if t.is("isIdentifier", name) {
        return text_of(t, name);
    }
    if t.is("isQualifiedName", name) {
        let l = t.get(name, "left");
        let r = t.get(name, "right");
        let right = text_of(t, &r);
        let left = entity_name(t, &l, false);
        return if drop_react && left == "React" {
            right
        } else {
            format!("{}.{right}", if drop_react { entity_name(t, &l, true) } else { left })
        };
    }
    compact(&get_text(t, name, None))
}

fn type_arguments(t: &mut Ts, sf: &JsValue, args: &[JsValue]) -> String {
    if args.is_empty() {
        return String::new();
    }
    let parts: Vec<String> = args.iter().map(|a| at(t, sf, a, UNION)).collect();
    format!("<{}>", parts.join(","))
}

fn at(t: &mut Ts, sf: &JsValue, node: &JsValue, level: u8) -> String {
    let p = print(t, sf, node);
    if p.level < level {
        format!("({})", p.text)
    } else {
        p.text
    }
}

fn type_parameters(t: &mut Ts, sf: &JsValue, node: &JsValue) -> String {
    let list = t.get(node, "typeParameters");
    let list = t.items(&list);
    if list.is_empty() {
        return String::new();
    }
    let parts: Vec<String> = list
        .iter()
        .map(|p| {
            let name = t.get(p, "name");
            let mut s = text_of(t, &name);
            let c = t.get(p, "constraint");
            if some(&c) {
                s.push_str(&format!(" extends {}", at(t, sf, &c, UNION)));
            }
            let d = t.get(p, "default");
            if some(&d) {
                s.push_str(&format!("={}", at(t, sf, &d, UNION)));
            }
            s
        })
        .collect();
    format!("<{}>", parts.join(","))
}

fn parameters(t: &mut Ts, sf: &JsValue, list: &JsValue) -> String {
    let list = t.items(list);
    list.iter()
        .map(|p| {
            let ty = t.get(p, "type");
            let tys = if some(&ty) { at(t, sf, &ty, UNION) } else { "any".into() };
            let name = t.get(p, "name");
            let this_ = t.is("isIdentifier", &name) && text_of(t, &name) == "this";
            let dots = some(&t.get(p, "dotDotDotToken"));
            let q = some(&t.get(p, "questionToken"));
            format!("{}{}{tys}{}", if dots { "..." } else { "" }, if this_ { "this:" } else { "" }, if q { "?" } else { "" })
        })
        .collect::<Vec<_>>()
        .join(",")
}

fn return_type(t: &mut Ts, sf: &JsValue, node: &JsValue) -> String {
    let ty = t.get(node, "type");
    if !some(&ty) {
        return "any".into();
    }
    if !t.is("isTypePredicateNode", &ty) {
        return print(t, sf, &ty).text;
    }
    let name = t.get(&ty, "parameterName");
    let subject = if t.is("isIdentifier", &name) {
        let nt = text_of(t, &name);
        let ps = t.get(node, "parameters");
        let place = t.items(&ps).iter().position(|p| {
            let n = t.get(p, "name");
            t.is("isIdentifier", &n) && text_of(t, &n) == nt
        });
        match place {
            Some(i) => format!("#{i}"),
            None => nt,
        }
    } else {
        "this".into()
    };
    let asserts = if some(&t.get(&ty, "assertsModifier")) { "asserts " } else { "" };
    let inner = t.get(&ty, "type");
    let is = if some(&inner) { format!(" is {}", at(t, sf, &inner, UNION)) } else { String::new() };
    format!("{asserts}{subject}{is}")
}

fn tuple_element(t: &mut Ts, sf: &JsValue, e: &JsValue) -> String {
    if t.is("isNamedTupleMember", e) {
        let dots = some(&t.get(e, "dotDotDotToken"));
        let q = some(&t.get(e, "questionToken"));
        let ty = t.get(e, "type");
        return format!("{}{}{}", if dots { "..." } else { "" }, at(t, sf, &ty, if dots || q { POSTFIX } else { UNION }), if q { "?" } else { "" });
    }
    if t.is("isOptionalTypeNode", e) {
        let ty = t.get(e, "type");
        return format!("{}?", at(t, sf, &ty, POSTFIX));
    }
    if t.is("isRestTypeNode", e) {
        let ty = t.get(e, "type");
        return format!("...{}", at(t, sf, &ty, POSTFIX));
    }
    at(t, sf, e, UNION)
}

fn type_literal(t: &mut Ts, sf: &JsValue, node: &JsValue) -> String {
    let mut properties: Vec<String> = Vec::new();
    let mut others: Vec<String> = Vec::new();
    let members = t.get(node, "members");
    for m in t.items(&members) {
        let optional = if some(&t.get(&m, "questionToken")) { "?" } else { "" };
        let name = t.get(&m, "name");
        if t.is("isPropertySignature", &m) {
            let ty = t.get(&m, "type");
            let tys = if some(&ty) { at(t, sf, &ty, UNION) } else { "any".into() };
            properties.push(format!("{}{optional}:{tys}", property_name(t, &name)));
        } else if t.is("isMethodSignature", &m) {
            let tp = type_parameters(t, sf, &m);
            let ps = t.get(&m, "parameters");
            let pr = parameters(t, sf, &ps);
            let rt = return_type(t, sf, &m);
            others.push(format!("{}{optional}{tp}({pr}):{rt}", property_name(t, &name)));
        } else if t.is("isCallSignatureDeclaration", &m) {
            let tp = type_parameters(t, sf, &m);
            let ps = t.get(&m, "parameters");
            let pr = parameters(t, sf, &ps);
            let rt = return_type(t, sf, &m);
            others.push(format!("{tp}({pr}):{rt}"));
        } else if t.is("isConstructSignatureDeclaration", &m) {
            let tp = type_parameters(t, sf, &m);
            let ps = t.get(&m, "parameters");
            let pr = parameters(t, sf, &ps);
            let rt = return_type(t, sf, &m);
            others.push(format!("new {tp}({pr}):{rt}"));
        } else if t.is("isIndexSignatureDeclaration", &m) {
            let ps = t.get(&m, "parameters");
            let p0 = t.get_i(&ps, 0);
            let pty = t.get(&p0, "type");
            let key = if some(&pty) { at(t, sf, &pty, UNION) } else { "any".into() };
            let ty = t.get(&m, "type");
            let tys = if some(&ty) { at(t, sf, &ty, UNION) } else { "any".into() };
            others.push(format!("[_:{key}]:{tys}"));
        } else {
            let c = compact(&get_text(t, &m, Some(sf)));
            let c = c.strip_suffix(';').or_else(|| c.strip_suffix(',')).map(String::from).unwrap_or(c);
            others.push(c);
        }
    }
    js_sort(&mut properties);
    properties.extend(others);
    format!("{{{}}}", properties.join(";"))
}

fn property_name(t: &mut Ts, name: &JsValue) -> String {
    if t.is("isIdentifier", name) || t.is("isPrivateIdentifier", name) {
        return text_of(t, name);
    }
    if t.is("isStringLiteral", name) {
        let s = text_of(t, name);
        return if crate::doctor_re!(r"^[A-Za-z_$][\w$]*$").find(&s).is_some() { s } else { quote(&s) };
    }
    if t.is("isNumericLiteral", name) {
        let v = js_number_text(&text_of(t, name)).unwrap_or(f64::NAN);
        return crate::json::js_number_to_string(v);
    }
    compact(&get_text(t, name, None))
}

thread_local! {
    static CACHE: std::cell::RefCell<HashMap<String, Vec<String>>> = std::cell::RefCell::new(HashMap::new());
}

fn invalid(t: &mut Ts, sf_text: &[u16], node: &JsValue) -> bool {
    let k = |t: &mut Ts, n: &str| t.enum_value("SyntaxKind", n);
    let kind = t.kind(node);
    if kind >= k(t, "FirstJSDocNode") && kind <= k(t, "LastJSDocNode") {
        return true;
    }
    let args = t.get(node, "typeArguments");
    if some(&args) {
        let mut name = t.get(node, "typeName");
        if !some(&name) {
            name = t.get(node, "exprName");
        }
        if !some(&name) {
            name = t.get(node, "qualifier");
        }
        let n = t.items(&args).len();
        if n == 0 || trailing_comma(t, sf_text, &args, node) {
            return true;
        }
        if some(&name) {
            let a = t.end(&name) as usize;
            let b = t.get(&args, "pos");
            let b = t.n(&b) as usize;
            let between = String::from_utf16_lossy(&sf_text[a.min(b)..b]);
            use crate::commands::doctor::util::JsRe;
            let cleaned = crate::doctor_re!(r"/\*[\s\S]*?\*/|//[^\n]*", "g").replace_all(&between, "");
            if cleaned.contains('.') {
                return true;
            }
        }
    }
    if t.is("isPropertySignature", node) && some(&t.get(node, "initializer")) {
        return true;
    }
    if t.is("isTypeParameterDeclaration", node) {
        let mods = t.get(node, "modifiers");
        let (ik, ok) = (k(t, "InKeyword"), k(t, "OutKeyword"));
        if t.items(&mods).iter().any(|m| {
            let mk = t.kind(m);
            mk == ik || mk == ok
        }) {
            return true;
        }
    }
    if t.is("isIndexSignatureDeclaration", node) {
        let ps = t.get(node, "parameters");
        let ps = t.items(&ps);
        let ty = t.get(node, "type");
        if ps.len() != 1 || !some(&ty) || ps.iter().any(|p| some(&t.get(p, "questionToken")) || some(&t.get(p, "dotDotDotToken")) || !some(&t.get(p, "type"))) {
            return true;
        }
    }
    if t.is("isMappedTypeNode", node) {
        let ms = t.get(node, "members");
        if !t.items(&ms).is_empty() {
            return true;
        }
    }
    if t.is("isParameter", node) {
        let mods = t.get(node, "modifiers");
        if some(&t.get(node, "initializer")) || !t.items(&mods).is_empty() {
            return true;
        }
    }
    if t.is("isTypeElement", node) {
        let mods = t.get(node, "modifiers");
        let rk = k(t, "ReadonlyKeyword");
        if t.items(&mods).iter().any(|m| t.kind(m) != rk) {
            return true;
        }
    }
    for c in t.children(node) {
        if invalid(t, sf_text, &c) {
            return true;
        }
    }
    false
}

/// `normalizeTypeText(text, {ts, optional})`.
/// TypeScript 7's node lists do not say whether a comma ends them: the text
/// after the last element, up to the node's end, does.
fn trailing_comma(t: &mut Ts, sf_text: &[u16], args: &JsValue, node: &JsValue) -> bool {
    let items = t.items(args);
    let Some(last) = items.last() else { return false };
    let a = t.end(last).max(0.0) as usize;
    let b = t.end(node).max(0.0) as usize;
    let between = String::from_utf16_lossy(&sf_text[a.min(sf_text.len())..b.min(sf_text.len()).max(a.min(sf_text.len()))]);
    use crate::commands::doctor::util::JsRe;
    let cleaned = crate::doctor_re!(r"/\*[\s\S]*?\*/|//[^\n]*", "g").replace_all(&between, "");
    cleaned.trim_matches(crate::discovery::paths::js_ws).starts_with(',')
}

pub fn normalize_type_text(t: &mut Ts, text: &str, optional: bool) -> Vec<String> {
    let key = format!("{}{text}", if optional { 1 } else { 0 });
    if let Some(hit) = CACHE.with(|c| c.borrow().get(&key).cloned()) {
        return hit;
    }
    let src = format!("type T = {text}\n;");
    let (f, s) = (t.str("type-text.ts"), t.str(&src));
    let sf = t.f("createSourceFile", &[f, s]);
    let stmts = t.get(&sf, "statements");
    let stmts = t.items(&stmts);
    let ok = stmts.len() == 1 && t.is("isTypeAliasDeclaration", &stmts[0]) && t.parse_diagnostics_count(&sf) == 0 && {
        let ty = t.get(&stmts[0], "type");
        let sf_text: Vec<u16> = src.encode_utf16().collect();
        !invalid(t, &sf_text, &ty)
    };
    let result = if ok {
        let ty = t.get(&stmts[0], "type");
        union_parts(t, &sf, &ty, optional).iter().map(display).collect()
    } else {
        vec![format!("{UNPARSED}{}", compact(text))]
    };
    CACHE.with(|c| c.borrow_mut().insert(key, result.clone()));
    result
}
