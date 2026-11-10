//! Port of `foundation/discovery/type-match.mjs`: whether a documented type
//! says the same as the code's type, read with the project's TypeScript.

use super::type_text::{normalize_type_text, UNPARSED};
use super::Ts;
use boa_engine::JsValue;

const MAX_DEPTH: usize = 6;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Verdict {
    Match,
    Mismatch,
    NotCompared,
}

pub struct JudgeCtx {
    pub checker: JsValue,
    pub program: JsValue,
    pub location: JsValue,
    pub optional: bool,
    pub nullable: bool,
    pub exact_optional: bool,
    pub written: Vec<Vec<String>>,
}

fn literal_part(v: &str) -> String {
    format!("'{}'", v.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn encode_part(text: &str) -> String {
    text.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c.to_string() } else { format!("%{:x};", c as u32) })
        .collect()
}

fn decode_part(text: &str) -> String {
    let re = crate::doctor_re!(r"%([0-9a-f]+);", "g");
    let mut out = String::new();
    let mut last = 0;
    for m in re.find_iter(text) {
        out.push_str(&text[last..m.start()]);
        let hex = &text[m.group(1).unwrap()];
        if let Some(c) = u32::from_str_radix(hex, 16).ok().and_then(char::from_u32) {
            out.push(c);
        }
        last = m.end();
    }
    out.push_str(&text[last..]);
    out
}

const KEYWORD_TYPES: &[&str] = &["string", "number", "boolean", "bigint", "symbol", "object", "any", "unknown", "never", "void", "undefined", "null", "true", "false"];

fn js_sort(v: &mut Vec<String>) {
    v.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
}

fn uniq(v: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for x in v {
        if !out.contains(&x) {
            out.push(x);
        }
    }
    out
}

/// `judgeType(docType, codeTypes, ctx)`.
pub fn judge_type(t: &mut Ts, doc_type: &str, code_types: &[JsValue], ctx: &JudgeCtx) -> Verdict {
    let notation = if parse_type(t, doc_type).is_some() {
        None
    } else {
        let a = crate::doctor_re!(r"^\s*([A-Za-z_$][\w$.]*)\s*=(?!>)\s*([\s\S]+)$");
        let b = crate::doctor_re!(r"^\s*([A-Za-z_$][\w$.]*)\s*\(([\s\S]+)\)\s*$");
        a.find(doc_type).or_else(|| b.find(doc_type)).map(|m| (doc_type[m.group(1).unwrap()].to_string(), doc_type[m.group(2).unwrap()].to_string()))
    };
    let mut texts = vec![doc_type.to_string()];
    if let Some((name, rest)) = notation {
        let Some(rest_node) = parse_type(t, &rest) else { return Verdict::NotCompared };
        let is_default = KEYWORD_TYPES.contains(&name.as_str()) || is_value(t, &rest_node);
        texts = if is_default { vec![name] } else { vec![name, rest] };
    }
    let verdicts: Vec<Verdict> = texts.iter().map(|x| judge_one(t, x, code_types, ctx)).collect();
    if verdicts.contains(&Verdict::Mismatch) {
        return Verdict::Mismatch;
    }
    if verdicts.iter().all(|v| *v == Verdict::Match) {
        Verdict::Match
    } else {
        Verdict::NotCompared
    }
}

/// Replace each quoted string or whitespace run with `f(match, before, after)`.
fn replace_quoted_or_space(text: &str, f: &dyn Fn(&str, Option<char>, Option<char>) -> String) -> String {
    let re = crate::doctor_re!(r#"'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\s+"#, "g");
    let mut out = String::new();
    let mut last = 0;
    for m in re.find_iter(text) {
        out.push_str(&text[last..m.start()]);
        let before = text[..m.start()].chars().last();
        let after = text[m.end()..].chars().next();
        out.push_str(&f(&text[m.start()..m.end()], before, after));
        last = m.end();
    }
    out.push_str(&text[last..]);
    out
}

fn is_ws_start(s: &str) -> bool {
    s.chars().next().map(crate::discovery::paths::js_ws).unwrap_or(false)
}

fn wordc(c: Option<char>) -> bool {
    matches!(c, Some(c) if c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

fn as_written(text: &str) -> String {
    let trimmed = text.trim_matches(crate::discovery::paths::js_ws);
    replace_quoted_or_space(trimmed, &|m, b, a| {
        if !is_ws_start(m) {
            m.to_string()
        } else if wordc(b) && wordc(a) {
            " ".into()
        } else {
            String::new()
        }
    })
}

fn readonly(text: &str) -> bool {
    let masked = replace_quoted_or_space(text, &|m, _, _| if is_ws_start(m) { m.to_string() } else { "''".into() });
    crate::doctor_re!(r"\breadonly\b(?!\s*[:?])|\bReadonly(?:Array)?\s*<").find(&masked).is_some()
}

fn judge_one(t: &mut Ts, doc_type: &str, code_types: &[JsValue], ctx: &JudgeCtx) -> Verdict {
    let optional = ctx.optional;
    let doc = normalize_type_text(t, doc_type, optional).join("|");
    if doc.starts_with(UNPARSED) {
        return Verdict::NotCompared;
    }
    let doc_readonly = readonly(doc_type);
    let mut same_text = false;
    for texts in &ctx.written {
        let r = if doc_readonly || texts.iter().any(|x| readonly(x)) {
            texts.len() == 1 && as_written(&texts[0]) == as_written(doc_type)
        } else {
            !texts.is_empty() && {
                let mut all: Vec<String> = Vec::new();
                for x in texts {
                    all.extend(normalize_type_text(t, x, optional));
                }
                let mut all = uniq(all);
                js_sort(&mut all);
                all.join("|") == doc
            }
        };
        if r && !react_name_differs(t, ctx, doc_type, texts) {
            same_text = true;
            break;
        }
    }
    if same_text {
        return Verdict::Match;
    }
    let node = parse_type(t, doc_type);
    let doc_parts = node.and_then(|n| doc_atoms(t, ctx, &n, 0));
    let code_parts = code_atoms(t, ctx, code_types, 0);
    let (Some(doc_parts), Some(code_parts)) = (doc_parts, code_parts) else { return Verdict::NotCompared };
    let mutable = |atoms: &[String]| -> String {
        let re = crate::doctor_re!(r"'(?:\\.|[^'\\])*'|readonly\[", "g");
        let mapped: Vec<String> = atoms
            .iter()
            .map(|a| {
                let mut out = String::new();
                let mut last = 0;
                for m in re.find_iter(a) {
                    out.push_str(&a[last..m.start()]);
                    let part = &a[m.start()..m.end()];
                    out.push_str(if part == "readonly[" { "[" } else { part });
                    last = m.end();
                }
                out.push_str(&a[last..]);
                out
            })
            .collect();
        reduced(ctx, &mapped, true)
    };
    let doc_r = reduced(ctx, &doc_parts, true);
    let code = reduced(ctx, &code_parts, true);
    if doc_r == code || doc_r == mutable(&code_parts) {
        return Verdict::Match;
    }
    let joined = [doc_parts.clone(), code_parts.clone()].concat().join("|");
    let mut owners: Vec<String> = Vec::new();
    for m in crate::doctor_re!(r"enum:[^#|\]]*#[^#|\]]*", "g").find_iter(&joined) {
        let s = joined[m.start()..m.end()].to_string();
        if !owners.contains(&s) {
            owners.push(s);
        }
    }
    let names: Vec<String> = owners.iter().map(|o| o.split('#').next().unwrap_or("").to_string()).collect();
    if uniq(names.clone()).len() < names.len() {
        return Verdict::NotCompared;
    }
    if mutable(&doc_parts) != mutable(&code_parts) {
        return Verdict::Mismatch;
    }
    if code == mutable(&code_parts) {
        Verdict::Mismatch
    } else {
        Verdict::NotCompared
    }
}

fn is_number_atom(a: &str) -> bool {
    crate::doctor_re!(r"^-?\d").find(a).is_some() || crate::doctor_re!(r"^(?:NaN|-?Infinity)$").find(a).is_some()
}

fn reduced(ctx: &JudgeCtx, atoms: &[String], top: bool) -> String {
    let mut kept: Vec<String> = Vec::new();
    for a in atoms {
        if (a == "undefined" && ((top && ctx.optional) || ctx.nullable)) || (a == "null" && ctx.nullable) {
            continue;
        }
        if !kept.contains(a) {
            kept.push(a.clone());
        }
    }
    if kept.iter().any(|a| a == "string") {
        kept.retain(|a| !(a.starts_with('\'') || a.starts_with("enum:")));
    }
    let snapshot = kept.clone();
    for a in &snapshot {
        if a.starts_with("enum:") {
            let value = decode_part(&a[a.rfind('#').map(|i| i + 1).unwrap_or(0)..]);
            if kept.contains(&literal_part(&value)) {
                kept.retain(|x| x != a);
            }
        }
    }
    if kept.iter().any(|a| a == "number") {
        kept.retain(|a| !is_number_atom(a));
    }
    if kept.iter().any(|a| a == "void") {
        kept.retain(|a| a != "undefined");
    }
    let snapshot = kept.clone();
    for a in &snapshot {
        if !kept.contains(a) {
            continue;
        }
        if is_array_part(a) && (kept.iter().any(|x| x == "object") || kept.iter().any(|o| o != a && array_covers(o, a))) {
            kept.retain(|x| x != a);
        }
    }
    js_sort(&mut kept);
    kept.join("|")
}

fn is_array_part(a: &str) -> bool {
    a.starts_with('[') || a.starts_with("readonly[")
}

fn union_parts(text: &str) -> Vec<String> {
    let t: Vec<char> = text.chars().collect();
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut quoted = false;
    let mut start = 0usize;
    let mut i = 0usize;
    while i < t.len() {
        let c = t[i];
        if quoted {
            if c == '\\' {
                i += 1;
            } else if c == '\'' {
                quoted = false;
            }
        } else if c == '\'' {
            quoted = true;
        } else if c == '[' {
            depth += 1;
        } else if c == ']' {
            depth -= 1;
        } else if c == '|' && depth == 0 {
            parts.push(t[start..i].iter().collect::<String>());
            start = i + 1;
        }
        i += 1;
    }
    parts.push(t[start.min(t.len())..].iter().collect::<String>());
    parts.into_iter().filter(|p| !p.is_empty()).collect()
}

fn array_covers(wide: &str, narrow: &str) -> bool {
    if !is_array_part(wide) || !is_array_part(narrow) {
        return false;
    }
    if narrow.starts_with("readonly") && !wide.starts_with("readonly") {
        return false;
    }
    let inner = |p: &str| -> Vec<String> {
        let open = p.find('[').unwrap_or(0);
        union_parts(&p[open + 1..p.len() - 1])
    };
    let taken = inner(wide);
    inner(narrow).iter().all(|part| {
        taken.contains(part)
            || (taken.iter().any(|x| x == "string") && (part.starts_with('\'') || part.starts_with("enum:")))
            || (taken.iter().any(|x| x == "number") && crate::doctor_re!(r"^(?:-?\d|NaN$|-?Infinity$)").find(part).is_some())
            || (part == "undefined" && taken.iter().any(|x| x == "void"))
            || (is_array_part(part) && (taken.iter().any(|x| x == "object") || taken.iter().any(|o| array_covers(o, part))))
    })
}

fn is_value(t: &mut Ts, node: &JsValue) -> bool {
    if t.is("isParenthesizedTypeNode", node) {
        let ty = t.get(node, "type");
        return is_value(t, &ty);
    }
    let kind = t.kind(node);
    let undef = t.enum_value("SyntaxKind", "UndefinedKeyword");
    let null = t.enum_value("SyntaxKind", "NullKeyword");
    t.is("isLiteralTypeNode", node) || kind == undef || kind == null || (t.is("isTypeReferenceNode", node) && {
        let a = t.get(node, "typeArguments");
        t.items(&a).is_empty()
    })
}

/// `parseType(ts, text)`.
pub fn parse_type(t: &mut Ts, text: &str) -> Option<JsValue> {
    let src = format!("type __Documented = {text};");
    let latest = t.enum_value("ScriptTarget", "Latest");
    let tsk = t.enum_value("ScriptKind", "TS");
    let (f, s) = (t.str("__documented_type__.ts"), t.str(&src));
    let sf = t.f("createSourceFile", &[f, s, JsValue::from(latest), JsValue::from(true), JsValue::from(tsk)]);
    let stmts = t.get(&sf, "statements");
    let stmts = t.items(&stmts);
    let diags = t.get(&sf, "parseDiagnostics");
    if !t.items(&diags).is_empty() || stmts.len() != 1 || !t.is("isTypeAliasDeclaration", &stmts[0]) {
        return None;
    }
    let ty = t.get(&stmts[0], "type");
    let len = src.encode_utf16().count();
    if t.end(&ty) as usize != len - 1 {
        return None;
    }
    Some(ty)
}

fn doc_atoms(t: &mut Ts, ctx: &JudgeCtx, node: &JsValue, depth: usize) -> Option<Vec<String>> {
    if depth > MAX_DEPTH {
        return None;
    }
    if t.is("isParenthesizedTypeNode", node) {
        let ty = t.get(node, "type");
        return doc_atoms(t, ctx, &ty, depth);
    }
    if t.is("isUnionTypeNode", node) {
        let tys = t.get(node, "types");
        let mut out = Vec::new();
        let mut all = true;
        for x in t.items(&tys) {
            match doc_atoms(t, ctx, &x, depth + 1) {
                Some(p) => out.extend(p),
                None => all = false,
            }
        }
        return all.then_some(out);
    }
    let kind = t.kind(node);
    let k = |t: &mut Ts, n: &str| t.enum_value("SyntaxKind", n);
    let keywords: [(&str, &[&str]); 10] = [
        ("StringKeyword", &["string"]),
        ("NumberKeyword", &["number"]),
        ("BooleanKeyword", &["false", "true"]),
        ("BigIntKeyword", &["bigint"]),
        ("SymbolKeyword", &["symbol"]),
        ("UndefinedKeyword", &["undefined"]),
        ("VoidKeyword", &["void"]),
        ("ObjectKeyword", &["object"]),
        ("NullKeyword", &["null"]),
        ("NeverKeyword", &[]),
    ];
    for (name, atoms) in keywords {
        if kind == k(t, name) {
            return Some(atoms.iter().map(|s| s.to_string()).collect());
        }
    }
    if t.is("isLiteralTypeNode", node) {
        let lit = t.get(node, "literal");
        if t.is("isStringLiteral", &lit) || t.is("isNoSubstitutionTemplateLiteral", &lit) {
            let v = t.get(&lit, "text");
            return Some(vec![literal_part(&t.s(&v))]);
        }
        if t.is("isNumericLiteral", &lit) {
            let v = t.get(&lit, "text");
            let n = crate::discovery::semver::js_number(&t.s(&v));
            return Some(vec![crate::json::js_number_to_string(n)]);
        }
        if t.is("isPrefixUnaryExpression", &lit) {
            let op = t.get(&lit, "operator");
            let operand = t.get(&lit, "operand");
            if t.n(&op) == k(t, "MinusToken") && t.is("isNumericLiteral", &operand) {
                let v = t.get(&operand, "text");
                let n = -crate::discovery::semver::js_number(&t.s(&v));
                return Some(vec![crate::json::js_number_to_string(n)]);
            }
        }
        let lk = t.kind(&lit);
        if lk == k(t, "TrueKeyword") {
            return Some(vec!["true".into()]);
        }
        if lk == k(t, "FalseKeyword") {
            return Some(vec!["false".into()]);
        }
        if lk == k(t, "NullKeyword") {
            return Some(vec!["null".into()]);
        }
        return None;
    }
    let array = |t: &mut Ts, element: &JsValue, ro: bool| -> Option<Vec<String>> {
        let parts = doc_atoms(t, ctx, element, depth + 1)?;
        Some(vec![format!("{}[{}]", if ro { "readonly" } else { "" }, reduced(ctx, &parts, false))])
    };
    if t.is("isArrayTypeNode", node) {
        let e = t.get(node, "elementType");
        return array(t, &e, false);
    }
    if t.is("isTypeOperatorNode", node) {
        let op = t.get(node, "operator");
        let ty = t.get(node, "type");
        if t.n(&op) == k(t, "ReadonlyKeyword") && t.is("isArrayTypeNode", &ty) {
            let e = t.get(&ty, "elementType");
            return array(t, &e, true);
        }
    }
    if t.is("isTypeReferenceNode", node) {
        let tn = t.get(node, "typeName");
        let name = reference_name(t, &tn);
        let args = t.get(node, "typeArguments");
        let args = t.items(&args);
        if (name == "Array" || name == "ReadonlyArray") && args.len() == 1 {
            return array(t, &args[0], name == "ReadonlyArray");
        }
        if !args.is_empty() {
            return None;
        }
        let named = resolve_name(t, ctx, &name)?;
        return code_atoms(t, ctx, &[named], depth + 1);
    }
    None
}

fn flag(t: &mut Ts, group: &str, name: &str) -> u64 {
    t.enum_value(group, name) as i64 as u64
}

fn flags_of(t: &mut Ts, v: &JsValue, key: &str) -> u64 {
    let f = t.get(v, key);
    t.n(&f) as i64 as u64
}

pub fn union_members(t: &mut Ts, ty: &JsValue) -> Vec<JsValue> {
    if t.m(ty, "isUnion", &[]).to_boolean() {
        let tys = t.get(ty, "types");
        t.items(&tys)
    } else {
        vec![ty.clone()]
    }
}

fn code_atoms(t: &mut Ts, ctx: &JudgeCtx, types: &[JsValue], depth: usize) -> Option<Vec<String>> {
    if depth > MAX_DEPTH {
        return None;
    }
    let f = |t: &mut Ts, n: &str| flag(t, "TypeFlags", n);
    let mut out = Vec::new();
    for ty in types {
        for u in union_members(t, ty) {
            let fl = flags_of(t, &u, "flags");
            if fl & f(t, "EnumLiteral") != 0 {
                let sym = t.get(&u, "symbol");
                let decl = t.get(&sym, "valueDeclaration");
                let owner = if !decl.is_undefined() {
                    let parent = t.get(&decl, "parent");
                    let name = t.get(&parent, "name");
                    t.m(&ctx.checker, "getSymbolAtLocation", &[name])
                } else {
                    JsValue::undefined()
                };
                if fl & f(t, "StringLiteral") == 0 || owner.is_undefined() || owner.is_null() {
                    return None;
                }
                let oname = t.get(&owner, "name");
                let oname = t.s(&oname);
                let fq = t.m(&ctx.checker, "getFullyQualifiedName", &[owner.clone()]);
                let fq = t.s(&fq);
                let value = t.get(&u, "value");
                let value = t.s(&value);
                out.push(format!("enum:{oname}#{}#{}", encode_part(&fq), encode_part(&value)));
            } else if fl & f(t, "StringLiteral") != 0 {
                let v = t.get(&u, "value");
                out.push(literal_part(&t.s(&v)));
            } else if fl & f(t, "NumberLiteral") != 0 {
                let v = t.get(&u, "value");
                out.push(crate::json::js_number_to_string(t.n(&v)));
            } else if fl & f(t, "BooleanLiteral") != 0 {
                let v = t.get(&u, "intrinsicName");
                out.push(t.s(&v));
            } else if fl & f(t, "String") != 0 {
                out.push("string".into());
            } else if fl & f(t, "Number") != 0 {
                out.push("number".into());
            } else if fl & f(t, "BigInt") != 0 {
                out.push("bigint".into());
            } else if fl & f(t, "ESSymbol") != 0 {
                out.push("symbol".into());
            } else if fl & f(t, "Null") != 0 {
                out.push("null".into());
            } else if fl & f(t, "Undefined") != 0 {
                let ud = t.m(&ctx.checker, "getUndefinedType", &[]);
                if !ctx.exact_optional || t.same(&u, &ud) {
                    out.push("undefined".into());
                }
            } else if fl & f(t, "Void") != 0 {
                out.push("void".into());
            } else if fl & f(t, "NonPrimitive") != 0 {
                out.push("object".into());
            } else if fl & f(t, "Never") != 0 {
                continue;
            } else {
                let sym = t.get(&u, "symbol");
                let name = t.get(&sym, "name");
                let name = t.opt_s(&name).unwrap_or_default();
                let of = flags_of(t, &u, "objectFlags");
                let element = if (name == "Array" || name == "ReadonlyArray") && of & flag(t, "ObjectFlags", "Reference") != 0 {
                    let args = t.m(&ctx.checker, "getTypeArguments", &[u.clone()]);
                    Some(t.get_i(&args, 0))
                } else {
                    None
                };
                let parts = element.filter(|e| !e.is_undefined()).and_then(|e| code_atoms(t, ctx, &[e], depth + 1))?;
                out.push(format!("{}[{}]", if name == "ReadonlyArray" { "readonly" } else { "" }, reduced(ctx, &parts, false)));
            }
        }
    }
    Some(out)
}

fn reference_name(t: &mut Ts, type_name: &JsValue) -> String {
    if t.is("isIdentifier", type_name) {
        let v = t.get(type_name, "text");
        return t.s(&v);
    }
    let l = t.get(type_name, "left");
    let r = t.get(type_name, "right");
    let rt = t.get(&r, "text");
    format!("{}.{}", reference_name(t, &l), t.s(&rt))
}

fn react_name_differs(t: &mut Ts, ctx: &JudgeCtx, doc_type: &str, texts: &[String]) -> bool {
    let names = |list: &[String]| -> (Vec<String>, Vec<String>) {
        let masked = list
            .iter()
            .map(|x| replace_quoted_or_space(x, &|m, _, _| if is_ws_start(m) { " ".into() } else { "''".into() }))
            .collect::<Vec<_>>()
            .join(" ");
        let mut q = Vec::new();
        for m in crate::doctor_re!(r"(?<![\w$.])React\s*\.\s*([A-Za-z_$][\w$]*)", "g").find_iter(&masked) {
            let s = masked[m.group(1).unwrap()].to_string();
            if !q.contains(&s) {
                q.push(s);
            }
        }
        let mut b = Vec::new();
        for m in crate::doctor_re!(r"(?<![\w$.]|\.\s)([A-Za-z_$][\w$]*)", "g").find_iter(&masked) {
            let s = masked[m.group(1).unwrap()].to_string();
            if !b.contains(&s) {
                b.push(s);
            }
        }
        (q, b)
    };
    let (dq, db) = names(&[doc_type.to_string()]);
    let (cq, cb) = names(texts);
    let mut crossed: Vec<String> = dq.iter().filter(|n| cb.contains(n)).cloned().collect();
    crossed.extend(cq.iter().filter(|n| db.contains(n)).cloned());
    crossed.iter().any(|name| {
        let bare = resolve_symbol(t, ctx, name);
        match bare {
            Some(b) => {
                let react = resolve_symbol(t, ctx, &format!("React.{name}"));
                !react.map(|r| t.same(&r, &b)).unwrap_or(false)
            }
            None => false,
        }
    })
}

fn resolve_name(t: &mut Ts, ctx: &JudgeCtx, name: &str) -> Option<JsValue> {
    let resolved = resolve_symbol(t, ctx, name)?;
    let decls = t.get(&resolved, "declarations");
    let decls = t.items(&decls);
    if !decls.is_empty()
        && decls.iter().all(|d| {
            let sf = t.m(d, "getSourceFile", &[]);
            t.m(&ctx.program, "isSourceFileDefaultLibrary", &[sf]).to_boolean()
        })
    {
        return None;
    }
    let fl = flags_of(t, &resolved, "flags");
    if fl & flag(t, "SymbolFlags", "Type") != 0 {
        let v = t.m(&ctx.checker, "getDeclaredTypeOfSymbol", &[resolved]);
        if v.is_undefined() {
            None
        } else {
            Some(v)
        }
    } else {
        None
    }
}

pub fn aliased(t: &mut Ts, checker: &JsValue, symbol: &JsValue) -> JsValue {
    if symbol.is_undefined() || symbol.is_null() {
        return symbol.clone();
    }
    let fl = flags_of(t, symbol, "flags");
    if fl & flag(t, "SymbolFlags", "Alias") != 0 {
        t.m(checker, "getAliasedSymbol", &[symbol.clone()])
    } else {
        symbol.clone()
    }
}

fn resolve_symbol(t: &mut Ts, ctx: &JudgeCtx, name: &str) -> Option<JsValue> {
    let meaning = flag(t, "SymbolFlags", "Type") | flag(t, "SymbolFlags", "Alias") | flag(t, "SymbolFlags", "Namespace");
    let mut parts = name.split('.');
    let head = parts.next().unwrap_or("");
    let in_scope = t.call(&ctx.checker, "getSymbolsInScope", &[ctx.location.clone(), JsValue::from(meaning as f64)]).ok()?;
    let mut symbol: Option<JsValue> = None;
    for s in t.items(&in_scope) {
        let n = t.get(&s, "name");
        if t.s(&n) != head {
            continue;
        }
        let e = t.m(&ctx.checker, "getExportSymbolOfSymbol", &[s]);
        if flags_of(t, &e, "flags") & meaning != 0 {
            symbol = Some(e);
            break;
        }
    }
    for part in parts {
        symbol = match symbol {
            Some(s) => {
                let target = aliased(t, &ctx.checker, &s);
                let exports = t.call(&ctx.checker, "getExportsOfModule", &[target]).ok()?;
                let found = t.items(&exports).into_iter().find(|e| {
                    let n = t.get(e, "name");
                    t.s(&n) == part
                });
                found
            }
            None => None,
        };
    }
    let s = symbol?;
    let r = aliased(t, &ctx.checker, &s);
    if r.is_undefined() || r.is_null() {
        None
    } else {
        Some(r)
    }
}
