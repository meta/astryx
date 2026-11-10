//! The integration manifest writer: adds one contribution root (or one
//! agent-doc line) to `astryx.integration.*` without touching anything the
//! author wrote. The JS CLI patches the manifest with recast; this module
//! reproduces recast's output byte for byte for the shapes the writer edits:
//! it reprints only the object or array that gains a member, reusing the
//! source of every existing member and its comments as recast does.

use super::lines::{Lines, Pos};
use oxc::allocator::Allocator;
use oxc::ast::ast::*;
use oxc::parser::{ParseOptions, Parser};
use oxc::span::SourceType;

#[derive(Clone, Debug)]
pub struct ObjInfo {
    pub start: u32,
    pub end: u32,
    /// Start offsets of every enclosing node, outermost first.
    pub ancestors: Vec<u32>,
    pub props: Vec<PropInfo>,
    /// Set when the object is the export default declaration itself: recast
    /// then reprints the whole statement. (start, end, parenthesized)
    pub export_stmt: Option<(u32, u32, bool)>,
}

#[derive(Clone, Debug)]
pub struct ArrInfo {
    pub start: u32,
    pub end: u32,
    pub ancestors: Vec<u32>,
    pub elems: Vec<(u32, u32)>,
    /// String values of the elements that are plain string literals.
    pub strings: Vec<Option<String>>,
}

#[derive(Clone, Debug)]
pub enum ValInfo {
    Object(ObjInfo),
    Array(ArrInfo),
    Other,
}

#[derive(Clone, Debug)]
pub struct PropInfo {
    pub start: u32,
    pub end: u32,
    pub spread: bool,
    /// Identifier or string-literal key name.
    pub key: Option<String>,
    pub computed: bool,
    pub method: bool,
    pub value: Option<Box<ValInfo>>,
    /// The value is a string literal with this value.
    pub string_value: Option<String>,
}

impl PropInfo {
    /// recast's `propertyNamed` (manifest-writer): a static, non-computed
    /// property, not a method.
    pub fn named(&self, name: &str) -> bool {
        !self.spread && !self.computed && !self.method && self.key.as_deref() == Some(name)
    }
    /// add-contribution's `propNamed`: any key spelled as an identifier or a
    /// string, computed or not, methods included.
    pub fn loosely_named(&self, name: &str) -> bool {
        !self.spread && self.key.as_deref() == Some(name)
    }
}

#[derive(Clone, Debug)]
pub struct Comment {
    pub start: u32,
    pub end: u32,
    pub line: bool,
}

pub struct Analysis {
    pub source: String,
    pub root: Option<ObjInfo>,
    pub comments: Vec<Comment>,
}

/// A node the writer adds.
#[derive(Clone, Debug)]
pub enum NewNode {
    Str(String),
    Array(Vec<NewNode>),
    Object(Vec<(String, NewNode)>),
}

// ── Parsing ──────────────────────────────────────────────────────────

fn unwrap_expr<'b, 'a>(mut e: &'b Expression<'a>, starts: &mut Vec<u32>) -> &'b Expression<'a> {
    loop {
        match e {
            Expression::TSAsExpression(x) => {
                starts.push(x.span.start);
                e = &x.expression;
            }
            Expression::TSSatisfiesExpression(x) => {
                starts.push(x.span.start);
                e = &x.expression;
            }
            Expression::ParenthesizedExpression(x) => {
                e = &x.expression;
            }
            _ => return e,
        }
    }
}

fn jsstr(s: oxc::str::JSStr) -> String {
    s.as_str().unwrap_or_default().to_string()
}

fn key_name(k: &PropertyKey) -> Option<String> {
    match k {
        PropertyKey::StaticIdentifier(id) => Some(id.name.to_string()),
        PropertyKey::StringLiteral(s) => Some(jsstr(s.value)),
        PropertyKey::Identifier(id) => Some(id.name.to_string()),
        _ => None,
    }
}

fn obj_info(o: &ObjectExpression, ancestors: Vec<u32>) -> ObjInfo {
    let mut inner_anc = ancestors.clone();
    inner_anc.push(o.span.start);
    let props = o
        .properties
        .iter()
        .map(|p| match p {
            ObjectPropertyKind::SpreadProperty(s) => PropInfo {
                start: s.span.start,
                end: s.span.end,
                spread: true,
                key: None,
                computed: false,
                method: false,
                value: None,
                string_value: None,
            },
            ObjectPropertyKind::ObjectProperty(p) => {
                let mut anc = inner_anc.clone();
                anc.push(p.span.start);
                let value = if p.method || p.kind != PropertyKind::Init {
                    None
                } else {
                    let v = unwrap_expr(&p.value, &mut anc);
                    Some(Box::new(val_info(v, anc.clone())))
                };
                let string_value = match unwrap_expr(&p.value, &mut Vec::new()) {
                    Expression::StringLiteral(s) if !p.method => Some(jsstr(s.value)),
                    _ => None,
                };
                PropInfo {
                    start: p.span.start,
                    end: p.span.end,
                    spread: false,
                    key: key_name(&p.key),
                    computed: p.computed,
                    method: p.method || p.kind != PropertyKind::Init,
                    value,
                    string_value,
                }
            }
        })
        .collect();
    ObjInfo { start: o.span.start, end: o.span.end, ancestors, props, export_stmt: None }
}

fn val_info(e: &Expression, ancestors: Vec<u32>) -> ValInfo {
    match e {
        Expression::ObjectExpression(o) => ValInfo::Object(obj_info(o, ancestors)),
        Expression::ArrayExpression(a) => {
            let mut elems = Vec::new();
            let mut strings = Vec::new();
            for el in a.elements.iter() {
                match el {
                    ArrayExpressionElement::Elision(_) => {}
                    ArrayExpressionElement::SpreadElement(s) => {
                        elems.push((s.span.start, s.span.end));
                        strings.push(None);
                    }
                    other => {
                        let ex = other.to_expression();
                        let sp = oxc::span::GetSpan::span(ex);
                        elems.push((sp.start, sp.end));
                        strings.push(match ex {
                            Expression::StringLiteral(s) => Some(jsstr(s.value)),
                            _ => None,
                        });
                    }
                }
            }
            ValInfo::Array(ArrInfo { start: a.span.start, end: a.span.end, ancestors, elems, strings })
        }
        _ => ValInfo::Other,
    }
}

/// Parse a manifest and find the object literal it exports, as the JS
/// writer's `findManifestObject` does. `Err` carries the parse error.
pub fn analyze(source: &str) -> Result<Analysis, String> {
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, source, SourceType::tsx())
        .with_options(ParseOptions { preserve_parens: false, allow_return_outside_function: true, ..ParseOptions::default() })
        .parse();
    if let Some(err) = ret.diagnostics.first() {
        return Err(err.to_string());
    }
    let program = &ret.program;
    let comments = program
        .comments
        .iter()
        .map(|c| Comment { start: c.span.start, end: c.span.end, line: c.kind == CommentKind::Line })
        .collect();
    let root = find_root(program);
    Ok(Analysis { source: source.to_string(), root, comments })
}

fn find_root(program: &Program) -> Option<ObjInfo> {
    let mut defaults = Vec::new();
    for st in program.body.iter() {
        if let Statement::ExportDefaultDeclaration(d) = st {
            defaults.push(d);
        }
    }
    if defaults.len() != 1 {
        return None;
    }
    let d = defaults[0];
    let mut anc = vec![program.span.start, d.span.start];
    let expr = d.declaration.as_expression()?;
    if let Expression::ObjectExpression(o) = expr {
        let mut info = obj_info(o, anc);
        let between = &program.source_text[d.span.start as usize..o.span.start as usize];
        info.export_stmt = Some((d.span.start, d.span.end, between.trim_end().ends_with('(')));
        return Some(info);
    }
    if let Expression::ParenthesizedExpression(p) = expr {
        if let Expression::ObjectExpression(o) = &p.expression {
            let mut info = obj_info(o, anc);
            info.export_stmt = Some((d.span.start, d.span.end, true));
            return Some(info);
        }
    }
    let mut e = unwrap_expr(expr, &mut anc);
    if let Expression::Identifier(id) = e {
        let mut found: Vec<(Vec<u32>, Option<&Expression>)> = Vec::new();
        for st in program.body.iter() {
            collect_declarators(st, &id.name, vec![program.span.start], &mut found);
        }
        if found.len() != 1 {
            return None;
        }
        let (a, init) = found.pop().unwrap();
        let init = init?;
        anc = a;
        e = unwrap_expr(init, &mut anc);
    }
    if let Expression::CallExpression(c) = e {
        if let Some(first) = c.arguments.first() {
            anc.push(c.span.start);
            match first.as_expression() {
                Some(x) => e = unwrap_expr(x, &mut anc),
                None => return None,
            }
        }
    }
    match e {
        Expression::ObjectExpression(o) => Some(obj_info(o, anc)),
        _ => None,
    }
}

fn collect_declarators<'b, 'a>(st: &'b Statement<'a>, name: &str, anc: Vec<u32>, out: &mut Vec<(Vec<u32>, Option<&'b Expression<'a>>)>) {
    let decl: Option<(&VariableDeclaration, Vec<u32>)> = match st {
        Statement::VariableDeclaration(v) => Some((&**v, anc.clone())),
        Statement::ExportDeclaration(e) => match &e.declaration {
            Declaration::VariableDeclaration(v) => {
                let mut a = anc.clone();
                a.push(e.span.start);
                Some((&**v, a))
            }
            _ => None,
        },
        _ => None,
    };
    if let Some((v, a)) = decl {
        for d in v.declarations.iter() {
            if let BindingPattern::BindingIdentifier(b) = &d.id {
                if b.name == name {
                    // A declarator without an initializer still counts as a
                    // binding; it just yields no object.
                    let mut aa = a.clone();
                    aa.push(v.span.start);
                    aa.push(d.span.start);
                    out.push((aa, d.init.as_ref()));
                }
            }
        }
    }
}


// ── Printing (recast) ────────────────────────────────────────────────

/// Source text with recast positions (line, UTF-16 column).
pub struct Src {
    pub lines: Lines,
    pos_of_byte: Vec<Pos>,
}

impl Src {
    pub fn new(source: &str) -> Src {
        let u: Vec<u16> = source.encode_utf16().collect();
        let lines = Lines::from_u16(&u, 4);
        let mut pos_of_byte = Vec::with_capacity(source.len() + 1);
        let mut line = 1usize;
        let mut col = 0i64;
        let bytes = source.as_bytes();
        let mut i = 0;
        let chars: Vec<(usize, char)> = source.char_indices().collect();
        let mut ci = 0;
        while ci < chars.len() {
            let (bi, ch) = chars[ci];
            let next_bi = if ci + 1 < chars.len() { chars[ci + 1].0 } else { source.len() };
            for _ in bi..next_bi {
                pos_of_byte.push(Pos { line, column: col });
            }
            i = next_bi;
            match ch {
                '\r' => {
                    if bytes.get(next_bi) == Some(&b'\n') {
                        // The LF belongs to this terminator.
                        pos_of_byte.push(Pos { line, column: col + 1 });
                        ci += 1;
                        i = next_bi + 1;
                    }
                    line += 1;
                    col = 0;
                }
                '\n' | '\u{2028}' | '\u{2029}' => {
                    line += 1;
                    col = 0;
                }
                c => col += c.len_utf16() as i64,
            }
            ci += 1;
        }
        let _ = i;
        pos_of_byte.push(Pos { line, column: col });
        Src { lines, pos_of_byte }
    }

    /// A source offset as a recast position: columns inside the leading
    /// whitespace count tabs as recast does.
    pub fn pos(&self, byte: u32) -> Pos {
        let p = self.pos_of_byte[byte as usize];
        let info = &self.lines.infos[p.line - 1];
        let k = p.column as usize;
        let column = if k <= info.slice_start {
            super::lines::count_spaces(&info.line[..k], 4)
        } else {
            info.indent + (k - info.slice_start) as i64
        };
        Pos { line: p.line, column }
    }

    fn only_ws_between(&self, a: Pos, b: Pos) -> bool {
        if b <= a {
            return true;
        }
        let s = self.lines.slice(a, b).to_string_with(4);
        s.encode_utf16().all(super::lines::js_space)
    }

    /// recast's TreeCopier indent for a node, given its ancestors' starts.
    pub fn node_indent(&self, ancestors: &[u32], start: u32) -> i64 {
        let mut indent = 0i64;
        for &a in ancestors.iter().chain(std::iter::once(&start)) {
            let p = self.pos(a);
            if self.lines.is_preceded_only_by_whitespace(p) {
                indent = p.column;
            }
        }
        indent
    }
}

#[derive(Clone, Debug)]
struct Attached {
    c: Comment,
    leading: bool,
}

/// Attach each comment directly inside a container to one of its children,
/// as recast's `attach` and `breakTies` do.
fn attach(src: &Src, children: &[(u32, u32)], comments: &[Comment], cstart: u32, cend: u32) -> Vec<Vec<Attached>> {
    let mut out: Vec<Vec<Attached>> = vec![Vec::new(); children.len()];
    let inside: Vec<&Comment> = comments
        .iter()
        .filter(|c| c.start >= cstart && c.end <= cend && !children.iter().any(|(s, e)| c.start >= *s && c.end <= *e))
        .collect();
    let mut ties: Vec<(&Comment, usize, usize)> = Vec::new();
    fn break_ties(src: &Src, ties: &mut Vec<(&Comment, usize, usize)>, children: &[(u32, u32)], out: &mut [Vec<Attached>]) {
        if ties.is_empty() {
            return;
        }
        let pn = ties[0].1;
        let fnode = ties[0].2;
        let mut gap_end = src.pos(children[fnode].0);
        let count = ties.len();
        let mut idx = count;
        while idx > 0 {
            let c = ties[idx - 1].0;
            if !src.only_ws_between(src.pos(c.end), gap_end) {
                break;
            }
            gap_end = src.pos(c.start);
            idx -= 1;
        }
        let fn_col = src.pos(children[fnode].0).column;
        while idx < count && ties[idx].0.line && src.pos(ties[idx].0.start).column > fn_col {
            idx += 1;
        }
        for (i, (c, _, _)) in ties.iter().enumerate() {
            if i < idx {
                out[pn].push(Attached { c: (*c).clone(), leading: false });
            } else {
                out[fnode].push(Attached { c: (*c).clone(), leading: true });
            }
        }
        ties.clear();
    }
    for c in inside {
        let pn = children.iter().rposition(|(_, e)| *e <= c.start);
        let fnode = children.iter().position(|(s, _)| *s >= c.end);
        match (pn, fnode) {
            (Some(p), Some(f)) => {
                if let Some(last) = ties.last() {
                    if last.2 != f {
                        break_ties(src, &mut ties, children, &mut out);
                    }
                }
                ties.push((c, p, f));
            }
            (Some(p), None) => {
                break_ties(src, &mut ties, children, &mut out);
                out[p].push(Attached { c: c.clone(), leading: false });
            }
            (None, Some(f)) => {
                break_ties(src, &mut ties, children, &mut out);
                out[f].push(Attached { c: c.clone(), leading: true });
            }
            (None, None) => {
                // A dangling comment: recast drops it when it reprints.
                break_ties(src, &mut ties, children, &mut out);
            }
        }
    }
    break_ties(src, &mut ties, children, &mut out);
    out
}

fn print_comment_text(src: &Src, c: &Comment) -> Lines {
    let s = src.pos(c.start);
    let e = src.pos(c.end);
    src.lines.slice(s, e).indent_tail(-s.column)
}

fn print_reused(src: &Src, start: u32, end: u32, indent: i64, comments: &[Attached]) -> Lines {
    let inner = src.lines.slice(src.pos(start), src.pos(end)).indent_tail(-indent);
    if comments.is_empty() {
        return inner;
    }
    let mut leading: Vec<Lines> = Vec::new();
    let mut trailing: Vec<Lines> = vec![inner];
    for a in comments {
        if a.leading || a.c.line {
            let mut parts = vec![print_comment_text(src, &a.c)];
            if !a.leading {
                parts.push(Lines::from_str("\n"));
            } else {
                let end = src.pos(a.c.end);
                let to = src.lines.skip_spaces(end, false).unwrap_or_else(|| src.lines.last_pos());
                let ts = src.lines.slice(end, to);
                if ts.len() == 1 {
                    parts.push(ts);
                } else {
                    parts.push(Lines::from_str(&"\n".repeat(ts.len() - 1)));
                }
            }
            leading.push(Lines::concat(parts));
        } else {
            let start = src.pos(a.c.start);
            let from = src.lines.skip_spaces(start, true).unwrap_or_else(|| src.lines.first_pos());
            let ls = src.lines.slice(from, start);
            let mut parts = Vec::new();
            if ls.len() == 1 {
                parts.push(ls);
            } else {
                parts.push(Lines::from_str(&"\n".repeat(ls.len() - 1)));
            }
            parts.push(print_comment_text(src, &a.c));
            trailing.push(Lines::concat(parts));
        }
    }
    leading.extend(trailing);
    Lines::concat(leading)
}

/// recast's `nodeStr` with `quote: 'single'`.
pub fn single_quote(s: &str) -> String {
    let swapped: String = s.chars().map(|c| match c {
        '\'' => '"',
        '"' => '\'',
        c => c,
    }).collect();
    let mut j = String::new();
    crate::json::quote(&mut j, &swapped);
    j.chars().map(|c| match c {
        '\'' => '"',
        '"' => '\'',
        c => c,
    }).collect()
}

fn print_new(node: &NewNode, tw: usize) -> Lines {
    match node {
        NewNode::Str(s) => Lines::from_str(&single_quote(s)),
        NewNode::Array(items) => print_array(items.iter().map(|i| print_new(i, tw)).collect(), tw),
        NewNode::Object(props) => print_object(
            props
                .iter()
                .map(|(k, v)| Lines::concat(vec![Lines::from_str(k), Lines::from_str(": "), print_new(v, tw)]))
                .collect(),
            tw,
        ),
    }
}

fn print_object(children: Vec<Lines>, tw: usize) -> Lines {
    let len = children.len();
    let one_line = len == 0;
    let mut parts: Vec<Lines> = vec![Lines::from_str(if one_line { "{" } else { "{\n" })];
    let mut allow_break = false;
    for (i, ch) in children.into_iter().enumerate() {
        let lines = if one_line { ch } else { ch.indent(tw as i64) };
        let multi = lines.len() > 1;
        if multi && allow_break {
            parts.push(Lines::from_str("\n"));
        }
        parts.push(lines);
        if i < len - 1 {
            parts.push(Lines::from_str(if multi { ",\n\n" } else { ",\n" }));
            allow_break = !multi;
        }
    }
    parts.push(Lines::from_str(if one_line { "}" } else { "\n}" }));
    Lines::concat(parts)
}

fn print_array(printed: Vec<Lines>, tw: usize) -> Lines {
    let len = printed.len();
    let joined = Lines::join(&Lines::from_str(", "), printed.clone());
    let one_line = joined.first_line_length() <= 74;
    let mut parts = vec![Lines::from_str(if one_line { "[" } else { "[\n" })];
    for (i, l) in printed.into_iter().enumerate() {
        let l = if one_line {
            if i > 0 {
                parts.push(Lines::from_str(" "));
            }
            l
        } else {
            l.indent(tw as i64)
        };
        parts.push(l);
        if i < len - 1 {
            parts.push(Lines::from_str(","));
        }
        if !one_line {
            parts.push(Lines::from_str("\n"));
        }
    }
    parts.push(Lines::from_str("]"));
    Lines::concat(parts)
}

/// Which container gains the new member.
pub enum Target<'x> {
    Object(&'x ObjInfo),
    Array(&'x ArrInfo),
}

/// Reprint `target` with `new_child` appended, as recast does, and return
/// the whole new file text (`toSource({quote: 'single', reuseWhitespace:
/// true})`, then a final newline when the source ended with one).
pub fn append_member(an: &Analysis, target: Target, new_child: NewNode) -> String {
    let src = Src::new(&an.source);
    let tw = src.lines.guess_tab_width();
    let (cstart, cend, ancestors, children): (u32, u32, &[u32], Vec<(u32, u32)>) = match &target {
        Target::Object(o) => (o.start, o.end, &o.ancestors, o.props.iter().map(|p| (p.start, p.end)).collect()),
        Target::Array(a) => (a.start, a.end, &a.ancestors, a.elems.clone()),
    };
    let cindent = src.node_indent(ancestors, cstart);
    let attached = attach(&src, &children, &an.comments, cstart, cend);
    let mut child_ancestors = ancestors.to_vec();
    child_ancestors.push(cstart);
    let mut printed: Vec<Lines> = children
        .iter()
        .enumerate()
        .map(|(i, (s, e))| {
            let ind = src.node_indent(&child_ancestors, *s);
            print_reused(&src, *s, *e, ind, &attached[i])
        })
        .collect();
    let new_lines = match (&target, new_child) {
        (Target::Object(_), NewNode::Object(props)) => {
            for (k, v) in props {
                printed.push(Lines::concat(vec![Lines::from_str(&k), Lines::from_str(": "), print_new(&v, tw)]));
            }
            print_object(printed, tw)
        }
        (Target::Array(_), n) => {
            printed.push(print_new(&n, tw));
            print_array(printed, tw)
        }
        (Target::Object(_), _) => unreachable!("an object gains properties"),
    };
    let (cstart, cend, new_lines) = match &target {
        Target::Object(o) if o.export_stmt.is_some() => {
            let (ss, se, parens) = o.export_stmt.unwrap();
            let mut parts = vec![Lines::from_str("export "), Lines::from_str("default ")];
            if parens {
                parts.push(Lines::from_str("("));
            }
            parts.push(new_lines);
            if parens {
                parts.push(Lines::from_str(")"));
            }
            parts.push(Lines::from_str(";"));
            let indent = src.node_indent(&[], ss);
            (ss, se, Lines::concat(parts).indent_tail(indent))
        }
        _ => (cstart, cend, new_lines.indent_tail(cindent)),
    };
    let whole = Lines::concat(vec![
        src.lines.slice(src.lines.first_pos(), src.pos(cstart)),
        new_lines,
        src.lines.slice(src.pos(cend), src.lines.last_pos()),
    ]);
    let mut next = whole.to_string_with(4);
    if an.source.ends_with('\n') && !next.ends_with('\n') {
        next.push('\n');
    }
    next
}

// ── The two edits the JS CLI makes ───────────────────────────────────

/// `patchIntegrationRoot`'s source rewrite: add `kind: 'rootPath'` (kind may
/// be a dotted path into nested objects) to the manifest source. The caller
/// has already checked that the key is not set. `Err` is the JS message.
pub fn patch_root_source(source: &str, basename: &str, kind: &str, root_path: &str) -> Result<String, String> {
    let an = analyze(source).map_err(|e| format!("Could not parse {basename}: {e}"))?;
    let Some(root) = an.root.clone() else {
        return Err(format!("Could not update {basename} safely: its default export is not a static object literal."));
    };
    let keys: Vec<&str> = kind.split('.').collect();
    let leaf = *keys.last().unwrap();
    let mut object = &root;
    let mut missing: Option<usize> = None;
    for (i, key) in keys[..keys.len() - 1].iter().enumerate() {
        match object.props.iter().find(|p| p.named(key)) {
            None => {
                if object.props.iter().any(|p| p.spread) {
                    return Err(format!(
                        "Could not update {basename} safely: it spreads another object (`...`) where \"{key}\" would go, so a written \"{key}\" could replace what the spread sets. Set \"{kind}: '{root_path}'\" in it yourself."
                    ));
                }
                missing = Some(i);
                break;
            }
            Some(holder) => match holder.value.as_deref() {
                Some(ValInfo::Object(o)) => object = o,
                _ => {
                    return Err(format!(
                        "Could not update {basename} safely: its `{key}` field is not a static object literal. Set \"{kind}: '{root_path}'\" in it yourself."
                    ))
                }
            },
        }
    }
    let new_child = match missing {
        None => {
            if object.props.iter().any(|p| p.named(leaf)) {
                return Err(format!("{basename} changed while preparing {kind}. Run the command again."));
            }
            NewNode::Object(vec![(leaf.to_string(), NewNode::Str(root_path.to_string()))])
        }
        Some(i) => {
            let mut node = NewNode::Str(root_path.to_string());
            let mut name = leaf.to_string();
            for key in keys[i..keys.len() - 1].iter().rev() {
                node = NewNode::Object(vec![(name, node)]);
                name = key.to_string();
            }
            NewNode::Object(vec![(name, node)])
        }
    };
    let obj = object.clone();
    Ok(append_member(&an, Target::Object(&obj), new_child))
}

/// `integration add agent-doc`'s source rewrite: append `line` to
/// `agentDocs.append`, creating the field when missing. `current_len` is
/// how many lines the loaded manifest already has. `Err` is the JS message.
pub fn add_agent_doc_source(source: &str, basename: &str, line: &str, current_len: usize) -> Result<String, String> {
    let an = analyze(source).map_err(|e| format!("Could not parse {basename}: {e}"))?;
    let Some(root) = an.root.clone() else {
        return Err(format!("Could not update {basename} safely: its default export is not a static object literal."));
    };
    let docs: Vec<&PropInfo> = root.props.iter().filter(|p| p.loosely_named("agentDocs")).collect();
    if docs.len() > 1 {
        return Err("Cannot update agentDocs safely: the manifest declares it more than once.".into());
    }
    let s = |l: &str| NewNode::Str(l.to_string());
    if let Some(prop) = docs.first() {
        let Some(ValInfo::Object(o)) = prop.value.as_deref() else {
            return Err("Cannot update agentDocs safely: it is not a static object literal.".into());
        };
        let appends: Vec<&PropInfo> = o.props.iter().filter(|p| p.loosely_named("append")).collect();
        if appends.len() > 1 {
            return Err("Cannot update agentDocs safely: append is declared more than once.".into());
        }
        if let Some(ap) = appends.first() {
            let Some(ValInfo::Array(a)) = ap.value.as_deref() else {
                return Err("Cannot update agentDocs safely: append is not a static array literal.".into());
            };
            return Ok(append_member(&an, Target::Array(a), s(line)));
        }
        return Ok(append_member(&an, Target::Object(o), NewNode::Object(vec![("append".into(), NewNode::Array(vec![s(line)]))])));
    }
    if current_len > 0 {
        return Err("Cannot update agentDocs safely: it comes from a spread or computed property.".into());
    }
    Ok(append_member(
        &an,
        Target::Object(&root),
        NewNode::Object(vec![("agentDocs".into(), NewNode::Object(vec![("append".into(), NewNode::Array(vec![s(line)]))]))]),
    ))
}
