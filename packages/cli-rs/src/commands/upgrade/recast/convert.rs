//! Parse source with oxc and build the Babel-shaped tree recast sees, then
//! do what `recast.parse` does: fix locations, attach comments, compute
//! indents and make the working copy with `original` links.

use super::ast::*;
use super::lines::{compare_pos, Lines, Pos, PrintOpts};
use serde_json::Value as J;
use std::rc::Rc;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    /// jscodeshift `tsx` parser: Babel AST with the TypeScript plugin.
    Babel,
    /// jscodeshift `babel` parser (babel5Compat): ESTree-shaped Babel AST.
    Estree,
}

#[derive(Debug, Clone)]
pub struct ParseError {
    pub message: String,
    /// 1-based line, 0-based column (Babel `loc`).
    pub line: usize,
    pub column: usize,
}

struct Ctx<'a> {
    mode: Mode,
    u8to16: Vec<u32>,
    line_starts: Vec<usize>, // utf16 offsets of line starts in normalized source
    lines_id: usize,
    src16: &'a [u16],
}

impl<'a> Ctx<'a> {
    fn off(&self, v: &J) -> Option<f64> {
        v.as_u64().map(|b| self.u8to16[(b as usize).min(self.u8to16.len() - 1)] as f64)
    }
    fn pos(&self, off16: f64) -> Pos {
        let o = off16 as usize;
        let idx = match self.line_starts.binary_search(&o) {
            Ok(i) => i,
            Err(i) => i - 1,
        };
        Pos::new(idx + 1, o - self.line_starts[idx])
    }
}

pub struct Parsed {
    pub file: NodeId,
    pub lines_id: usize,
}

/// `recast.parse(source, {parser})`, returning the File node of the working copy.
pub fn parse(ast: &mut Ast, source: &str, mode: Mode) -> Result<Parsed, ParseError> {
    let lines = Lines::from_str_tab(source, 4);
    let normalized = lines.slice_string(
        lines.first_pos(),
        lines.last_pos(),
        &PrintOpts { tab_width: 4, use_tabs: false, reuse_whitespace: false, line_terminator: "\n".into() },
    );
    let src16: Vec<u16> = normalized.encode_utf16().collect();

    let alloc = oxc_allocator::Allocator::default();
    let st = match mode {
        Mode::Babel => oxc_span::SourceType::tsx(),
        Mode::Estree => oxc_span::SourceType::jsx().with_module(true),
    };
    let ret = oxc_parser::Parser::new(&alloc, &normalized, st)
        .with_options(oxc_parser::ParseOptions { allow_return_outside_function: true, ..Default::default() })
        .parse();
    if ret.diagnostics.has_errors() {
        let e = ret.diagnostics.errors().next();
        let (msg, off) = match e {
            Some(d) => {
                let off = d.labels.as_ref().first().map(|l| l.offset()).unwrap_or(0);
                (d.message.to_string(), off)
            }
            None => ("Unexpected token".to_string(), 0),
        };
        let mut u8to16 = Vec::with_capacity(normalized.len() + 1);
        build_u8to16(&normalized, &mut u8to16);
        let o16 = u8to16[(off as usize).min(u8to16.len() - 1)] as usize;
        let mut line = 1;
        let mut col = 0;
        for &c in &src16[..o16] {
            if c == 10 {
                line += 1;
                col = 0;
            } else {
                col += 1;
            }
        }
        let (msg, line, col) = babel_message(&msg, &src16, o16, line, col);
        return Err(ParseError { message: msg, line, column: col });
    }
    let json_text = ret.program.to_estree_json(true, false);
    let root: J = serde_json::from_str(&json_text).map_err(|e| ParseError { message: e.to_string(), line: 1, column: 0 })?;

    let mut u8to16 = Vec::with_capacity(normalized.len() + 1);
    build_u8to16(&normalized, &mut u8to16);
    let mut line_starts = vec![0usize];
    for (i, &c) in src16.iter().enumerate() {
        if c == 10 {
            line_starts.push(i + 1);
        }
    }
    let lines_id = ast.lines.len();
    ast.lines.push(Rc::new(lines));
    ast.sources.push(Rc::new(src16.clone()));

    // Comments.
    let mut comment_ids = Vec::new();
    let mut spans = Vec::new();
    {
        let ctx = Ctx { mode, u8to16: u8to16.clone(), line_starts: line_starts.clone(), lines_id, src16: &src16 };
        for c in ret.program.comments.iter() {
            let s = ctx.u8to16[c.span.start as usize] as f64;
            let e = ctx.u8to16[c.span.end as usize] as f64;
            let text = &normalized[c.span.start as usize..c.span.end as usize];
            let (ty, value) = if text.starts_with("//") {
                ("CommentLine", &text[2..])
            } else {
                ("CommentBlock", &text[2..text.len() - 2])
            };
            let id = ast.new_node(ty, vec![("value", V::s(value))]);
            let n = ast.node_mut(id);
            n.start = Some(s);
            n.end = Some(e);
            n.loc = Some(Loc { start: ctx.pos(s), end: ctx.pos(e), indent: 0, lines_id });
            comment_ids.push(id);
            spans.push((s as usize, e as usize));
        }
    }
    ast.comment_spans.push(Rc::new(spans));

    let ctx = Ctx { mode, u8to16, line_starts, lines_id, src16: &src16 };
    let program = conv_node(ast, &ctx, &root, None).as_node().unwrap();
    // Program spans the whole source in Babel.
    {
        let n = ast.node_mut(program);
        n.start = Some(0.0);
        n.end = Some(src16.len() as f64);
    }
    set_loc(ast, &ctx, program);
    let lines = ast.lines[lines_id].clone();

    let file = ast.new_node("File", vec![("program", V::Node(program))]);
    {
        let n = ast.node_mut(file);
        n.start = Some(0.0);
        n.end = Some(src16.len() as f64);
        n.loc = Some(Loc { start: lines.first_pos(), end: lines.last_pos(), indent: 0, lines_id });
    }
    // Babel's File also carries `comments` and `tokens`; recast deletes the
    // first and moves the second out of the comparison.

    fix_all_locations(ast, file, &lines);

    // trueProgramLoc
    {
        let ploc = ast.node(program).loc.clone().unwrap();
        let mut start = ploc.start;
        let mut end = ploc.end;
        if compare_pos(start, end).is_lt() {
            if let Some(p) = lines.skip_spaces(Some(start), false) {
                start = p;
            }
            if compare_pos(start, end).is_lt() {
                if let Some(p) = lines.skip_spaces(Some(end), true) {
                    end = p;
                }
            }
        }
        for &c in &comment_ids {
            let cl = ast.node(c).loc.clone().unwrap();
            if compare_pos(cl.start, start).is_lt() {
                start = cl.start;
            }
            if compare_pos(end, cl.end).is_lt() {
                end = cl.end;
            }
        }
        let l = ast.node_mut(program).loc.as_mut().unwrap();
        l.start = start;
        l.end = end;
    }

    let attach_root = if !ast.list(program, "body").is_empty() { program } else { file };
    super::comments::attach(ast, &comment_ids, attach_root, &lines);

    compute_indents(ast, file, 0, &lines);

    let copy = ast.deep_copy_with_original(file);
    Ok(Parsed { file: copy, lines_id })
}

fn build_u8to16(s: &str, out: &mut Vec<u32>) {
    let mut u16pos: u32 = 0;
    for ch in s.chars() {
        let l8 = ch.len_utf8();
        for _ in 0..l8 {
            out.push(u16pos);
        }
        u16pos += ch.len_utf16() as u32;
    }
    out.push(u16pos);
}

fn set_loc(ast: &mut Ast, ctx: &Ctx, id: NodeId) {
    let (s, e) = (ast.node(id).start, ast.node(id).end);
    if let (Some(s), Some(e)) = (s, e) {
        let loc = Loc { start: ctx.pos(s), end: ctx.pos(e), indent: 0, lines_id: ctx.lines_id };
        ast.node_mut(id).loc = Some(loc);
    }
}

fn mk(ast: &mut Ast, ctx: &Ctx, ty: &str, fields: Vec<(&str, V)>, start: Option<f64>, end: Option<f64>) -> NodeId {
    let id = ast.new_node(ty, fields);
    let n = ast.node_mut(id);
    n.start = start;
    n.end = end;
    set_loc(ast, ctx, id);
    id
}

fn jtype(v: &J) -> Option<&str> {
    v.get("type").and_then(|t| t.as_str())
}

fn conv_val(ast: &mut Ast, ctx: &Ctx, v: &J, parent: Option<&str>) -> V {
    match v {
        J::Null => V::Null,
        J::Bool(b) => V::Bool(*b),
        J::Number(n) => V::Num(n.as_f64().unwrap_or(0.0)),
        J::String(s) => V::s(s),
        J::Array(a) => V::Arr(a.iter().map(|x| conv_val(ast, ctx, x, parent)).collect()),
        J::Object(_) => {
            if jtype(v).is_some() {
                conv_node(ast, ctx, v, parent)
            } else {
                // plain object (TemplateElement value, regex)
                let mut o = Vec::new();
                if let J::Object(m) = v {
                    for (k, x) in m {
                        o.push((intern(k), conv_val(ast, ctx, x, parent)));
                    }
                }
                V::Obj(o)
            }
        }
    }
}

fn get<'b>(v: &'b J, k: &str) -> &'b J {
    v.get(k).unwrap_or(&J::Null)
}

fn is_default_ts(k: &str, v: &J) -> bool {
    // oxc emits TS-ESTree fields with empty defaults that Babel omits.
    match k {
        "decorators" => v.as_array().map(|a| a.is_empty()).unwrap_or(v.is_null()),
        "optional" | "declare" | "definite" | "abstract" | "override" | "readonly" | "const" | "in" | "out" => v == &J::Bool(false),
        "typeAnnotation" | "typeArguments" | "typeParameters" | "returnType" | "accessibility" | "superTypeArguments" => v.is_null(),
        _ => false,
    }
}

fn conv_fields(ast: &mut Ast, ctx: &Ctx, v: &J, ty: &str, skip: &[&str]) -> Vec<(&'static str, V)> {
    let mut out = Vec::new();
    if let J::Object(m) = v {
        for (k, x) in m {
            if k == "type" || k == "start" || k == "end" || skip.contains(&k.as_str()) {
                continue;
            }
            if is_default_ts(k, x) {
                continue;
            }
            let key = match (ctx.mode, k.as_str()) {
                (Mode::Babel, "typeArguments") => "typeParameters",
                (Mode::Babel, "superTypeArguments") => "superTypeParameters",
                _ => k.as_str(),
            };
            out.push((intern(key), conv_val(ast, ctx, x, Some(ty))));
        }
    }
    out
}

fn literal_babel(ast: &mut Ast, ctx: &Ctx, v: &J, s: Option<f64>, e: Option<f64>) -> NodeId {
    let raw = get(v, "raw").as_str().unwrap_or("").to_string();
    if let Some(re) = v.get("regex").filter(|r| !r.is_null()) {
        let f = vec![
            ("extra", V::Obj(vec![("raw", V::s(&raw))])),
            ("pattern", V::s(get(re, "pattern").as_str().unwrap_or(""))),
            ("flags", V::s(get(re, "flags").as_str().unwrap_or(""))),
        ];
        return mk(ast, ctx, "RegExpLiteral", f, s, e);
    }
    if let Some(b) = v.get("bigint").filter(|r| !r.is_null()) {
        let digits = b.as_str().unwrap_or("").to_string();
        let f = vec![
            ("extra", V::Obj(vec![("rawValue", V::s(&raw[..raw.len().saturating_sub(1)])), ("raw", V::s(&raw))])),
            ("value", V::s(&digits)),
        ];
        return mk(ast, ctx, "BigIntLiteral", f, s, e);
    }
    match get(v, "value") {
        J::String(st) => {
            let f = vec![("extra", V::Obj(vec![("rawValue", V::s(st)), ("raw", V::s(&raw))])), ("value", V::s(st))];
            mk(ast, ctx, "StringLiteral", f, s, e)
        }
        J::Number(n) => {
            let n = n.as_f64().unwrap_or(0.0);
            let f = vec![("extra", V::Obj(vec![("rawValue", V::Num(n)), ("raw", V::s(&raw))])), ("value", V::Num(n))];
            mk(ast, ctx, "NumericLiteral", f, s, e)
        }
        J::Bool(b) => mk(ast, ctx, "BooleanLiteral", vec![("value", V::Bool(*b))], s, e),
        _ => mk(ast, ctx, "NullLiteral", vec![], s, e),
    }
}

/// Split leading directive statements out of a statement list (Babel mode).
fn split_directives(ast: &mut Ast, ctx: &Ctx, body: &J, ty: &str) -> (V, V) {
    let mut dirs = Vec::new();
    let mut rest = Vec::new();
    let mut in_prologue = true;
    if let J::Array(items) = body {
        for st in items {
            if in_prologue && jtype(st) == Some("ExpressionStatement") && st.get("directive").map(|d| d.is_string()).unwrap_or(false) {
                let ex = get(st, "expression");
                let raw = get(ex, "raw").as_str().unwrap_or("");
                let value = &raw[1..raw.len() - 1];
                let ls = ctx.off(get(ex, "start"));
                let le = ctx.off(get(ex, "end"));
                let lit = mk(
                    ast,
                    ctx,
                    "DirectiveLiteral",
                    vec![
                        ("extra", V::Obj(vec![("rawValue", V::s(value)), ("raw", V::s(raw)), ("expressionValue", V::s(get(ex, "value").as_str().unwrap_or("")))])),
                        ("value", V::s(value)),
                    ],
                    ls,
                    le,
                );
                let d = mk(ast, ctx, "Directive", vec![("value", V::Node(lit))], ctx.off(get(st, "start")), ctx.off(get(st, "end")));
                dirs.push(V::Node(d));
                continue;
            }
            in_prologue = false;
            rest.push(conv_val(ast, ctx, st, Some(ty)));
        }
    }
    (V::Arr(rest), V::Arr(dirs))
}

/// Convert a chain (inside ChainExpression) to Babel's Optional* nodes.
fn conv_chain(ast: &mut Ast, ctx: &Ctx, v: &J) -> V {
    // Babel marks every member/call from the top of the chain down to the
    // deepest node that has `optional: true`.
    fn has_optional_below(v: &J) -> bool {
        match jtype(v) {
            Some("MemberExpression") => get(v, "optional").as_bool() == Some(true) || has_optional_below(get(v, "object")),
            Some("CallExpression") => get(v, "optional").as_bool() == Some(true) || has_optional_below(get(v, "callee")),
            Some("TSNonNullExpression") => has_optional_below(get(v, "expression")),
            _ => false,
        }
    }
    fn rec(ast: &mut Ast, ctx: &Ctx, v: &J) -> V {
        let ty = jtype(v).unwrap_or("");
        let s = ctx.off(get(v, "start"));
        let e = ctx.off(get(v, "end"));
        match ty {
            "MemberExpression" if has_optional_below(v) => {
                let obj = rec(ast, ctx, get(v, "object"));
                let prop = conv_val(ast, ctx, get(v, "property"), Some("OptionalMemberExpression"));
                let f = vec![
                    ("object", obj),
                    ("computed", V::Bool(get(v, "computed").as_bool().unwrap_or(false))),
                    ("property", prop),
                    ("optional", V::Bool(get(v, "optional").as_bool().unwrap_or(false))),
                ];
                V::Node(mk(ast, ctx, "OptionalMemberExpression", f, s, e))
            }
            "CallExpression" if has_optional_below(v) => {
                let callee = rec(ast, ctx, get(v, "callee"));
                let args = conv_val(ast, ctx, get(v, "arguments"), Some("OptionalCallExpression"));
                let mut f = vec![("callee", callee), ("arguments", args), ("optional", V::Bool(get(v, "optional").as_bool().unwrap_or(false)))];
                if let Some(ta) = v.get("typeArguments").filter(|x| !x.is_null()) {
                    f.push(("typeParameters", conv_val(ast, ctx, ta, None)));
                }
                V::Node(mk(ast, ctx, "OptionalCallExpression", f, s, e))
            }
            "TSNonNullExpression" if has_optional_below(v) => {
                let inner = rec(ast, ctx, get(v, "expression"));
                V::Node(mk(ast, ctx, "TSNonNullExpression", vec![("expression", inner)], s, e))
            }
            _ => conv_val(ast, ctx, v, None),
        }
    }
    rec(ast, ctx, v)
}

fn private_name(ast: &mut Ast, ctx: &Ctx, v: &J) -> V {
    let s = ctx.off(get(v, "start"));
    let e = ctx.off(get(v, "end"));
    let id = mk(ast, ctx, "Identifier", vec![("name", V::s(get(v, "name").as_str().unwrap_or("")))], s.map(|x| x + 1.0), e);
    V::Node(mk(ast, ctx, "PrivateName", vec![("id", V::Node(id))], s, e))
}

fn conv_node(ast: &mut Ast, ctx: &Ctx, v: &J, parent: Option<&str>) -> V {
    let ty = jtype(v).unwrap_or("").to_string();
    let s = ctx.off(get(v, "start"));
    let e = ctx.off(get(v, "end"));
    let babel = ctx.mode == Mode::Babel;
    match ty.as_str() {
        "ParenthesizedExpression" => {
            let inner = conv_val(ast, ctx, get(v, "expression"), parent);
            if let Some(id) = inner.as_node() {
                ast.set_extra(id, "parenthesized", V::Bool(true));
                ast.set_extra(id, "parenStart", V::Num(s.unwrap_or(0.0)));
            }
            return inner;
        }
        "Literal" if babel => return V::Node(literal_babel(ast, ctx, v, s, e)),
        "Literal" => {
            // babel estree: {value, raw} (+ regex/bigint)
            let mut f = Vec::new();
            if let Some(re) = v.get("regex").filter(|r| !r.is_null()) {
                f.push(("value", V::Obj(vec![])));
                f.push(("raw", V::s(get(v, "raw").as_str().unwrap_or(""))));
                f.push(("regex", conv_val(ast, ctx, re, None)));
            } else if let Some(b) = v.get("bigint").filter(|r| !r.is_null()) {
                f.push(("value", V::s(b.as_str().unwrap_or(""))));
                f.push(("raw", V::s(get(v, "raw").as_str().unwrap_or(""))));
                f.push(("bigint", V::s(b.as_str().unwrap_or(""))));
            } else {
                let val = conv_val(ast, ctx, get(v, "value"), None);
                f.push(("value", val));
                f.push(("raw", V::s(get(v, "raw").as_str().unwrap_or(""))));
            }
            return V::Node(mk(ast, ctx, "Literal", f, s, e));
        }
        "ChainExpression" if babel => return conv_chain(ast, ctx, get(v, "expression")),
        "PrivateIdentifier" => return private_name(ast, ctx, v),
        "Program" => {
            let mut f = vec![("sourceType", V::s("module")), ("interpreter", V::Null)];
            if babel {
                let (body, dirs) = split_directives(ast, ctx, get(v, "body"), "Program");
                f.push(("body", body));
                f.push(("directives", dirs));
            } else {
                let body = conv_val(ast, ctx, get(v, "body"), Some("Program"));
                f.push(("body", body));
            }
            f.push(("extra", V::Obj(vec![("topLevelAwait", V::Bool(false))])));
            return V::Node(mk(ast, ctx, "Program", f, s, e));
        }
        "BlockStatement" if babel && matches!(parent, Some("FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression")) => {
            let (body, dirs) = split_directives(ast, ctx, get(v, "body"), "BlockStatement");
            return V::Node(mk(ast, ctx, "BlockStatement", vec![("body", body), ("directives", dirs)], s, e));
        }
        "BlockStatement" if babel => {
            let body = conv_val(ast, ctx, get(v, "body"), Some("BlockStatement"));
            return V::Node(mk(ast, ctx, "BlockStatement", vec![("body", body), ("directives", V::Arr(vec![]))], s, e));
        }
        "Property" if babel => {
            let method = get(v, "method").as_bool() == Some(true);
            let kind = get(v, "kind").as_str().unwrap_or("init");
            let computed = get(v, "computed").as_bool().unwrap_or(false);
            let key = conv_val(ast, ctx, get(v, "key"), Some("ObjectProperty"));
            if method || kind == "get" || kind == "set" {
                let fv = get(v, "value");
                let mut f = vec![
                    ("method", V::Bool(method)),
                    ("key", key),
                    ("computed", V::Bool(computed)),
                    ("kind", V::s(if method { "method" } else { kind })),
                    ("id", V::Null),
                    ("generator", V::Bool(get(fv, "generator").as_bool().unwrap_or(false))),
                    ("async", V::Bool(get(fv, "async").as_bool().unwrap_or(false))),
                ];
                let params = conv_val(ast, ctx, get(fv, "params"), Some("ObjectMethod"));
                f.push(("params", params));
                for k in ["returnType", "typeParameters"] {
                    if let Some(x) = fv.get(k).filter(|x| !x.is_null()) {
                        let c = conv_val(ast, ctx, x, Some("ObjectMethod"));
                        f.push((k, c));
                    }
                }
                let body = conv_node(ast, ctx, get(fv, "body"), Some("FunctionExpression"));
                f.push(("body", body));
                return V::Node(mk(ast, ctx, "ObjectMethod", f, s, e));
            }
            let shorthand = get(v, "shorthand").as_bool().unwrap_or(false);
            let value = conv_val(ast, ctx, get(v, "value"), Some("ObjectProperty"));
            let mut f = vec![("method", V::Bool(false)), ("key", key), ("computed", V::Bool(computed)), ("shorthand", V::Bool(shorthand)), ("value", value)];
            if shorthand {
                f.push(("extra", V::Obj(vec![("shorthand", V::Bool(true))])));
            }
            return V::Node(mk(ast, ctx, "ObjectProperty", f, s, e));
        }
        "Property" => {
            let mut f = conv_fields(ast, ctx, v, "Property", &[]);
            if get(v, "shorthand").as_bool() == Some(true) {
                f.push(("extra", V::Obj(vec![("shorthand", V::Bool(true))])));
            }
            return V::Node(mk(ast, ctx, "Property", f, s, e));
        }
        "MethodDefinition" | "TSAbstractMethodDefinition" if babel => {
            let fv = get(v, "value");
            let key_j = get(v, "key");
            let private = jtype(key_j) == Some("PrivateIdentifier");
            let key = conv_val(ast, ctx, key_j, Some("ClassMethod"));
            let mut f = vec![("static", V::Bool(get(v, "static").as_bool().unwrap_or(false))), ("key", key), ("computed", V::Bool(get(v, "computed").as_bool().unwrap_or(false))), ("kind", V::s(get(v, "kind").as_str().unwrap_or("method")))];
            if ty == "TSAbstractMethodDefinition" {
                f.push(("abstract", V::Bool(true)));
            }
            for k in ["accessibility", "override", "optional"] {
                if let Some(x) = v.get(k).filter(|x| !x.is_null() && **x != J::Bool(false)) {
                    f.push((k, conv_val(ast, ctx, x, None)));
                }
            }
            if let Some(d) = v.get("decorators").filter(|d| d.as_array().map(|a| !a.is_empty()).unwrap_or(false)) {
                let dv = conv_val(ast, ctx, d, None);
                f.push(("decorators", dv));
            }
            f.push(("id", V::Null));
            f.push(("generator", V::Bool(get(fv, "generator").as_bool().unwrap_or(false))));
            f.push(("async", V::Bool(get(fv, "async").as_bool().unwrap_or(false))));
            let params = conv_val(ast, ctx, get(fv, "params"), Some("ClassMethod"));
            f.push(("params", params));
            for k in ["returnType", "typeParameters"] {
                if let Some(x) = fv.get(k).filter(|x| !x.is_null()) {
                    let c = conv_val(ast, ctx, x, Some("ClassMethod"));
                    f.push((k, c));
                }
            }
            let body_j = get(fv, "body");
            let t = if body_j.is_null() {
                "TSDeclareMethod"
            } else if private {
                "ClassPrivateMethod"
            } else {
                "ClassMethod"
            };
            if !body_j.is_null() {
                let body = conv_node(ast, ctx, body_j, Some("FunctionExpression"));
                f.push(("body", body));
            }
            return V::Node(mk(ast, ctx, t, f, s, e));
        }
        "PropertyDefinition" | "TSAbstractPropertyDefinition" | "AccessorProperty" | "TSAbstractAccessorProperty" => {
            let key_j = get(v, "key");
            let private = jtype(key_j) == Some("PrivateIdentifier");
            let mut f = conv_fields(ast, ctx, v, &ty, &["type"]);
            if ty.starts_with("TSAbstract") {
                f.push(("abstract", V::Bool(true)));
            }
            let t = if ty.contains("Accessor") {
                "ClassAccessorProperty"
            } else if private {
                "ClassPrivateProperty"
            } else {
                "ClassProperty"
            };
            return V::Node(mk(ast, ctx, t, f, s, e));
        }
        "ImportExpression" if babel => {
            let imp = mk(ast, ctx, "Import", vec![], s, s.map(|x| x + 6.0));
            let mut args = vec![conv_val(ast, ctx, get(v, "source"), Some("CallExpression"))];
            if let Some(o) = v.get("options").filter(|x| !x.is_null()) {
                args.push(conv_val(ast, ctx, o, Some("CallExpression")));
            }
            return V::Node(mk(ast, ctx, "CallExpression", vec![("callee", V::Node(imp)), ("arguments", V::Arr(args))], s, e));
        }
        "TSTypeParameter" if babel => {
            let name = get(get(v, "name"), "name").as_str().unwrap_or("").to_string();
            let mut f = vec![("name", V::s(&name))];
            for k in ["in", "out", "const"] {
                if get(v, k).as_bool() == Some(true) {
                    f.push((k, V::Bool(true)));
                }
            }
            for k in ["constraint", "default"] {
                if let Some(x) = v.get(k).filter(|x| !x.is_null()) {
                    let c = conv_val(ast, ctx, x, Some("TSTypeParameter"));
                    f.push((k, c));
                }
            }
            return V::Node(mk(ast, ctx, "TSTypeParameter", f, s, e));
        }
        "TSEnumDeclaration" if babel => {
            let mut f = conv_fields(ast, ctx, v, &ty, &["body"]);
            let members = conv_val(ast, ctx, get(get(v, "body"), "members"), Some("TSEnumDeclaration"));
            f.push(("members", members));
            return V::Node(mk(ast, ctx, "TSEnumDeclaration", f, s, e));
        }
        "TSInterfaceHeritage" | "TSClassImplements" if babel => {
            let f = conv_fields(ast, ctx, v, &ty, &[]);
            return V::Node(mk(ast, ctx, "TSExpressionWithTypeArguments", f, s, e));
        }
        "TSMethodSignature" | "TSFunctionType" | "TSConstructorType" | "TSCallSignatureDeclaration" | "TSConstructSignatureDeclaration" if babel => {
            let mut f = Vec::new();
            if let J::Object(m) = v {
                for (k, x) in m {
                    if k == "type" || k == "start" || k == "end" || is_default_ts(k, x) {
                        continue;
                    }
                    if ty == "TSMethodSignature" && (k == "accessibility" || k == "static" || k == "readonly") {
                        continue;
                    }
                    let key = match k.as_str() {
                        "params" => "parameters",
                        "returnType" => "typeAnnotation",
                        "typeArguments" => "typeParameters",
                        o => o,
                    };
                    f.push((intern(key), conv_val(ast, ctx, x, Some(&ty))));
                }
            }
            return V::Node(mk(ast, ctx, &ty, f, s, e));
        }
        "TSMappedType" if babel => {
            let key = get(get(v, "key"), "name").as_str().unwrap_or("").to_string();
            let constraint = conv_val(ast, ctx, get(v, "constraint"), Some("TSTypeParameter"));
            let ks = ctx.off(get(get(v, "key"), "start"));
            let ce = ctx.off(get(get(v, "constraint"), "end"));
            let tp = mk(ast, ctx, "TSTypeParameter", vec![("name", V::s(&key)), ("constraint", constraint)], ks, ce);
            let mut f = vec![("typeParameter", V::Node(tp))];
            for k in ["nameType", "typeAnnotation"] {
                if let Some(x) = v.get(k).filter(|x| !x.is_null()) {
                    let c = conv_val(ast, ctx, x, Some("TSMappedType"));
                    f.push((k, c));
                }
            }
            for k in ["optional", "readonly"] {
                match get(v, k) {
                    J::Bool(true) => f.push((k, V::Bool(true))),
                    J::String(x) => f.push((k, V::s(x))),
                    _ => {}
                }
            }
            return V::Node(mk(ast, ctx, "TSMappedType", f, s, e));
        }
        "JSXText" => {
            let value = get(v, "value").as_str().unwrap_or("").to_string();
            let raw = get(v, "raw").as_str().unwrap_or(&value).to_string();
            let f = if babel {
                vec![("extra", V::Obj(vec![("rawValue", V::s(&value)), ("raw", V::s(&raw))])), ("value", V::s(&value))]
            } else {
                vec![("value", V::s(&value)), ("raw", V::s(&raw))]
            };
            return V::Node(mk(ast, ctx, "JSXText", f, s, e));
        }
        "Identifier" => {
            let mut f = vec![("name", V::s(get(v, "name").as_str().unwrap_or("")))];
            if get(v, "optional").as_bool() == Some(true) {
                f.push(("optional", V::Bool(true)));
            }
            if let Some(t) = v.get("typeAnnotation").filter(|x| !x.is_null()) {
                let c = conv_val(ast, ctx, t, Some("Identifier"));
                f.push(("typeAnnotation", c));
            }
            if let Some(d) = v.get("decorators").filter(|d| d.as_array().map(|a| !a.is_empty()).unwrap_or(false)) {
                let c = conv_val(ast, ctx, d, Some("Identifier"));
                f.push(("decorators", c));
            }
            return V::Node(mk(ast, ctx, "Identifier", f, s, e));
        }
        "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression" | "TSDeclareFunction" if babel => {
            let mut f = conv_fields(ast, ctx, v, &ty, &["expression"]);
            if ty == "ArrowFunctionExpression" && !f.iter().any(|(k, _)| *k == "id") {
                f.push(("id", V::Null));
            }
            return V::Node(mk(ast, ctx, &ty, f, s, e));
        }
        "ClassDeclaration" | "ClassExpression" if babel => {
            let f = conv_fields(ast, ctx, v, &ty, &[]);
            return V::Node(mk(ast, ctx, &ty, f, s, e));
        }
        "TSTypeAssertion" | "TSAsExpression" | "TSSatisfiesExpression" => {
            let f = conv_fields(ast, ctx, v, &ty, &[]);
            return V::Node(mk(ast, ctx, &ty, f, s, e));
        }
        "TemplateElement" => {
            let f = conv_fields(ast, ctx, v, &ty, &[]);
            let raw_len = get(get(v, "value"), "raw").as_str().map(|r| r.encode_utf16().count()).unwrap_or(0) as f64;
            let mut st = s.unwrap_or(0.0);
            if let Some(&c) = ctx.src16.get(st as usize) {
                if c == b'`' as u16 || c == b'}' as u16 {
                    st += 1.0;
                }
            }
            return V::Node(mk(ast, ctx, &ty, f, Some(st), Some(st + raw_len)));
        }
        "TSImportType" if babel => {
            let mut f = Vec::new();
            let src = get(v, "source");
            let arg = if jtype(src) == Some("TSLiteralType") { get(src, "literal") } else { src };
            f.push(("argument", conv_val(ast, ctx, arg, Some("TSImportType"))));
            f.extend(conv_fields(ast, ctx, v, &ty, &["source", "argument"]));
            return V::Node(mk(ast, ctx, &ty, f, s, e));
        }
        "ImportDeclaration" | "ExportNamedDeclaration" | "ExportDefaultDeclaration" | "ImportSpecifier" | "ExportSpecifier" | "ExportAllDeclaration" if !babel => {
            let f: Vec<_> = conv_fields(ast, ctx, v, &ty, &[]).into_iter().filter(|(k, x)| !((*k == "importKind" || *k == "exportKind") && x.as_str() == Some("value"))).collect();
            return V::Node(mk(ast, ctx, &ty, f, s, e));
        }
        _ => {}
    }
    let mut f = conv_fields(ast, ctx, v, &ty, &[]);
    if matches!(ty.as_str(), "ObjectExpression" | "ObjectPattern" | "ArrayExpression" | "ArrayPattern" | "TSTypeParameterDeclaration") {
        if let Some(tc) = trailing_comma(ctx, e) {
            f.push(("extra", V::Obj(vec![("trailingComma", V::Num(tc))])));
        }
    }
    V::Node(mk(ast, ctx, &ty, f, s, e))
}

/// Babel's `extra.trailingComma`: the offset of a comma before the closing bracket.
fn trailing_comma(ctx: &Ctx, end: Option<f64>) -> Option<f64> {
    let mut i = end? as usize;
    if i == 0 {
        return None;
    }
    i -= 1; // closing bracket
    loop {
        while i > 0 && is_ws16(ctx.src16[i - 1]) {
            i -= 1;
        }
        if i >= 2 && ctx.src16[i - 1] == b'/' as u16 && ctx.src16[i - 2] == b'*' as u16 {
            // skip block comment backwards
            let mut j = i - 2;
            while j >= 2 && !(ctx.src16[j - 2] == b'/' as u16 && ctx.src16[j - 1] == b'*' as u16) {
                j -= 1;
            }
            i = j.saturating_sub(2);
            continue;
        }
        break;
    }
    if i > 0 && ctx.src16[i - 1] == b',' as u16 {
        Some((i - 1) as f64)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// fixFaultyLocations / indents

fn is_export_decl(ty: &str) -> bool {
    matches!(ty, "ExportDeclaration" | "ExportDefaultDeclaration" | "ExportDefaultSpecifier" | "DeclareExportDeclaration" | "ExportNamedDeclaration" | "ExportAllDeclaration")
}

fn fix_all_locations(ast: &mut Ast, root: NodeId, lines: &Lines) {
    let mut stack = vec![root];
    let mut seen = std::collections::HashSet::new();
    while let Some(id) = stack.pop() {
        if !seen.insert(id) {
            continue;
        }
        fix_faulty_location(ast, id, lines);
        stack.extend(ast.children(id));
    }
}

pub fn fix_faulty_location(ast: &mut Ast, id: NodeId, lines: &Lines) {
    let ty = ast.ty(id);
    if ty == "TemplateLiteral" {
        fix_template_literal(ast, id, lines);
    }
    if ty == "ForStatement" {
        for k in ["init", "test", "update"] {
            if let Some(c) = ast.child(id, k) {
                if let Some(loc) = ast.node(c).loc.clone() {
                    let mut end = loc.end;
                    let start = loc.start;
                    let mut new_end = loc.end;
                    while compare_pos(start, end).is_lt() {
                        lines.prev_pos(&mut end, false);
                        if lines.char_at(end) == Some(b';' as u16) {
                            new_end = end;
                        } else {
                            break;
                        }
                    }
                    ast.node_mut(c).loc.as_mut().unwrap().end = new_end;
                }
            }
        }
    }
    let decorators = ast.list(id, "decorators");
    if ast.node(id).loc.is_some() && !decorators.is_empty() {
        for d in decorators {
            expand_loc(ast, id, d);
        }
    } else if is_export_decl(ty) && ast.child(id, "declaration").is_some() {
        let decl = ast.child(id, "declaration").unwrap();
        ast.node_mut(decl).loc = None;
        for d in ast.list(decl, "decorators") {
            expand_loc(ast, id, d);
        }
    } else if ty == "MethodDefinition" || (ty == "Property" && (ast.flag(id, "method") || ast.flag(id, "shorthand"))) {
        if let Some(val) = ast.child(id, "value") {
            ast.node_mut(val).loc = None;
            if ast.is(val, "FunctionExpression") {
                ast.set(val, "id", V::Null);
            }
        }
    }
}

fn expand_loc(ast: &mut Ast, parent: NodeId, child: NodeId) {
    let cl = match ast.node(child).loc.clone() {
        Some(l) => l,
        None => return,
    };
    if let Some(pl) = ast.node_mut(parent).loc.as_mut() {
        if compare_pos(cl.start, pl.start).is_lt() {
            pl.start = cl.start;
        }
        if compare_pos(pl.end, cl.end).is_lt() {
            pl.end = cl.end;
        }
    }
}

fn fix_template_literal(ast: &mut Ast, id: NodeId, lines: &Lines) {
    let quasis = ast.list(id, "quasis");
    if quasis.is_empty() {
        return;
    }
    if let Some(loc) = ast.node(id).loc.clone() {
        let mut after = loc.start;
        lines.next_pos(&mut after, false);
        let first = quasis[0];
        if let Some(fl) = ast.node_mut(first).loc.as_mut() {
            if compare_pos(fl.start, after).is_lt() {
                fl.start = after;
            }
        }
        let mut right = loc.end;
        lines.prev_pos(&mut right, false);
        let last = *quasis.last().unwrap();
        if let Some(ll) = ast.node_mut(last).loc.as_mut() {
            if compare_pos(right, ll.end).is_lt() {
                ll.end = right;
            }
        }
    }
    let exprs = ast.list(id, "expressions");
    for (i, ex) in exprs.iter().enumerate() {
        let el = match ast.node(*ex).loc.clone() {
            Some(l) => l,
            None => continue,
        };
        if let Some(mut dollar) = lines.skip_spaces(Some(el.start), true) {
            if lines.prev_pos(&mut dollar, false) && lines.char_at(dollar) == Some(b'{' as u16) && lines.prev_pos(&mut dollar, false) && lines.char_at(dollar) == Some(b'$' as u16) {
                if let Some(ql) = ast.node_mut(quasis[i]).loc.as_mut() {
                    if compare_pos(dollar, ql.end).is_lt() {
                        ql.end = dollar;
                    }
                }
            }
        }
        if let Some(right) = lines.skip_spaces(Some(el.end), false) {
            if lines.char_at(right) == Some(b'}' as u16) {
                let mut r = right;
                lines.next_pos(&mut r, false);
                if i + 1 < quasis.len() {
                    if let Some(ql) = ast.node_mut(quasis[i + 1]).loc.as_mut() {
                        if compare_pos(ql.start, r).is_lt() {
                            ql.start = r;
                        }
                    }
                }
            }
        }
    }
}

fn compute_indents(ast: &mut Ast, id: NodeId, parent_indent: usize, lines: &Lines) {
    let mut indent = parent_indent;
    if let Some(loc) = ast.node(id).loc.clone() {
        let ty = ast.ty(id);
        if ty == "CommentBlock" || ty == "CommentLine" || lines.is_preceded_only_by_whitespace(loc.start) {
            indent = loc.start.column;
        }
        ast.node_mut(id).loc.as_mut().unwrap().indent = indent;
    }
    let fields: Vec<V> = ast.node(id).fields.iter().map(|(_, v)| v.clone()).collect();
    let mut kids = Vec::new();
    for v in &fields {
        collect_nodes(v, &mut kids);
    }
    for k in kids {
        compute_indents(ast, k, indent, lines);
    }
}

pub fn is_ws16(c: u16) -> bool {
    super::lines::is_ws_unit(c)
}

#[allow(dead_code)]
fn _unused(ctx: &Ctx) -> usize {
    ctx.src16.len()
}

/// Babel's wording for the parse errors oxc reports differently.
fn babel_message(msg: &str, src: &[u16], off: usize, line: usize, col: usize) -> (String, usize, usize) {
    let at = |i: usize| src.get(i).copied().unwrap_or(0);
    if msg == "Unexpected token" {
        let mut j = off;
        while j > 0 && is_ws16(at(j - 1)) {
            j -= 1;
        }
        let rest = &src[off.min(src.len())..];
        if j > 0 && at(j - 1) == b'>' as u16 && !rest.iter().any(|&c| c == b'<' as u16 || c == b'{' as u16) {
            return ("Unterminated JSX contents.".into(), line, col);
        }
        if at(off) == b'<' as u16 {
            // oxc reports the `<` of a JSX element whose name is invalid; Babel reports the token after it.
            let mut k = off + 1;
            while at(k) == b' ' as u16 || at(k) == b'\t' as u16 {
                k += 1;
            }
            let c = at(k);
            let name_start = c < 128 && ((c as u8).is_ascii_alphabetic() || c == b'_' as u16 || c == b'$' as u16 || c == b'>' as u16 || c == b'/' as u16 || c == b'{' as u16);
            if c != 0 && !name_start && c < 128 {
                return (msg.into(), line, col + (k - off));
            }
        }
        return (msg.into(), line, col);
    }
    if msg.starts_with("Unterminated string") {
        if at(off) == b'`' as u16 {
            return ("Unterminated template.".into(), line, col + 1);
        }
        // Inside a JSX tag Babel reads a multi-line JSX string up to the next
        // matching quote, then rejects the token where an attribute name belongs.
        let q = at(off);
        let mut k = off;
        let mut in_tag = false;
        while k > 0 {
            let c = at(k - 1);
            if c == b'\n' as u16 || c == b'>' as u16 {
                break;
            }
            if c == b'<' as u16 {
                let n = at(k);
                in_tag = n < 128 && ((n as u8).is_ascii_alphabetic() || n == b'_' as u16 || n == b'$' as u16);
                break;
            }
            k -= 1;
        }
        if in_tag && (q == b'"' as u16 || q == b'\'' as u16) && src[off + 1..].contains(&q) {
            return ("Unexpected token".into(), line, col);
        }
        return ("Unterminated string constant.".into(), line, col);
    }
    if msg.starts_with("Unterminated multiline comment") {
        return ("Unterminated comment.".into(), line, col);
    }
    if msg.starts_with("Unterminated regular expression") {
        return ("Unterminated regular expression.".into(), line, col + 1);
    }
    if msg.starts_with("Expected a semicolon") {
        return ("Missing semicolon.".into(), line, col);
    }
    if let Some(rest) = msg.strip_prefix("Expected corresponding JSX closing tag for '") {
        let name = rest.trim_end_matches("'.");
        let mut j = off;
        let mut c = col;
        while j >= 2 && !(at(j - 2) == b'<' as u16 && at(j - 1) == b'/' as u16) && c > 0 {
            j -= 1;
            c -= 1;
        }
        let c = if c >= 2 { c - 2 } else { col };
        return (format!("Expected corresponding JSX closing tag for <{}>.", name), line, c);
    }
    if msg.starts_with("Expected `(`") && at(off) == b'<' as u16 {
        // A JSX tag whose name runs into `=`: Babel stops at the `=`.
        let mut k = off + 1;
        while {
            let c = at(k);
            c < 128 && ((c as u8).is_ascii_alphanumeric() || matches!(c as u8, b'_' | b'$' | b'.' | b':' | b'-'))
        } {
            k += 1;
        }
        if k > off + 1 && at(k) == b'=' as u16 {
            return ("Unexpected token".into(), line, col + (k - off));
        }
    }
    if let Some(rest) = msg.strip_prefix("Expected `") {
        if msg.ends_with("but found `EOF`") {
            return ("Unexpected token".into(), line, col);
        }
        let tok = rest.split('`').next().unwrap_or("");
        return (format!("Unexpected token, expected \"{}\"", tok), line, col);
    }
    (msg.into(), line, col)
}
