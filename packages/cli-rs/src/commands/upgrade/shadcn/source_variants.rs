//! ShadCN JavaScript source variants (`authoring/shadcn/source-variants.mjs`):
//! the target ShadCN writes when `tsx` is false, the precompiled declaration,
//! the TypeScript-stripping transform, and printer-only equivalence.

use super::receipt::posix_extname;
use crate::commands::upgrade::recast::{self, Ast, Mode, NodeId, V};

/// `shadcnJavaScriptTarget(target)`
pub fn js_target(target: &str) -> String {
    match posix_extname(target).as_str() {
        ".tsx" => format!("{}.jsx", &target[..target.len() - 4]),
        ".ts" => format!("{}.js", &target[..target.len() - 3]),
        _ => target.to_string(),
    }
}

fn js_stem(source_target: &str) -> Result<&str, String> {
    let ext = posix_extname(source_target);
    if ext != ".jsx" && ext != ".js" {
        return Err(format!("Precompiled declaration source must be JavaScript: {source_target}"));
    }
    Ok(&source_target[..source_target.len() - ext.len()])
}

/// `createShadcnPrecompiledDeclaration(sourceTarget)`
pub fn precompiled_declaration(source_target: &str) -> Result<String, String> {
    let stem = js_stem(source_target)?;
    Ok(format!("declare module '*{stem}' {{\n  const Component: import('react').ComponentType;\n  export default Component;\n}}\n"))
}

/// `shadcnPrecompiledDeclarationTarget(sourceTarget)`
pub fn precompiled_declaration_target(source_target: &str) -> Result<String, String> {
    Ok(format!("{}.astryx.d.mts", js_stem(source_target)?))
}

/// `transformShadcnJavaScriptSource(source)`
pub fn transform(source: &str) -> Result<String, String> {
    let mut ast = Ast::new();
    let parsed = recast::parse(&mut ast, source, Mode::Babel).map_err(|e| format!("{} ({}:{})", e.message, e.line, e.column))?;
    super::ts_strip::strip(&mut ast, parsed.file, source)?;
    Ok(recast::to_source(&ast, parsed.file, recast::Config::default()))
}

// ---------------------------------------------------------------------------
// Printer-only equivalence.

/// The tree as `JSON.stringify(normalizeJavaScriptAst(tree))` without
/// comments: sorted keys, no positions or `extra`.
pub fn normalized_json(ast: &Ast, id: NodeId) -> String {
    let mut out = String::new();
    write_node(ast, id, &mut out);
    out
}

fn write_val(ast: &Ast, v: &V, out: &mut String) {
    match v {
        V::Undef | V::Null => out.push_str("null"),
        V::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        V::Num(n) => {
            if n.is_finite() {
                out.push_str(&crate::json::js_number_to_string(*n))
            } else {
                out.push_str("null")
            }
        }
        V::Str(s) => crate::json::quote(out, s),
        V::Node(n) => write_node(ast, *n, out),
        V::Arr(a) => {
            out.push('[');
            for (i, x) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_val(ast, x, out);
            }
            out.push(']');
        }
        V::Obj(o) => {
            let mut keys: Vec<(&str, &V)> = o.iter().filter(|(k, v)| !matches!(v, V::Undef) && !skip_key(k)).map(|(k, v)| (*k, v)).collect();
            keys.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
            write_obj(ast, &keys, out);
        }
    }
}

fn skip_key(k: &str) -> bool {
    matches!(k, "start" | "end" | "loc" | "range" | "extra" | "tokens" | "errors" | "comments" | "leading" | "trailing" | "leadingComments" | "trailingComments" | "innerComments")
}

fn write_obj(ast: &Ast, keys: &[(&str, &V)], out: &mut String) {
    out.push('{');
    for (i, (k, v)) in keys.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        crate::json::quote(out, k);
        out.push(':');
        write_val(ast, v, out);
    }
    out.push('}');
}

fn write_node(ast: &Ast, id: NodeId, out: &mut String) {
    let n = ast.node(id);
    let ty = V::s(n.ty);
    let mut keys: Vec<(&str, &V)> = n.fields.iter().filter(|(k, v)| !matches!(v, V::Undef) && !skip_key(k)).map(|(k, v)| (*k, v)).collect();
    keys.push(("type", &ty));
    keys.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
    write_obj(ast, &keys, out);
}

/// Where each comment sits among the nodes, the way Babel attaches it: the
/// innermost node holding it, the outermost node inside that one ending at
/// the previous token, and the outermost one starting at the next token.
fn comment_signature(ast: &Ast, root: NodeId, lines_id: usize) -> Vec<String> {
    let mut order: Vec<(NodeId, usize, usize)> = Vec::new();
    fn walk(ast: &Ast, id: NodeId, order: &mut Vec<(NodeId, usize, usize)>) {
        let n = ast.node(id);
        if let (Some(s), Some(e)) = (n.start, n.end) {
            order.push((id, s as usize, e as usize));
        }
        for c in ast.children(id) {
            walk(ast, c, order);
        }
    }
    walk(ast, root, &mut order);
    let src = &ast.sources[lines_id];
    let spans = &ast.comment_spans[lines_id];
    let is_space = |c: u16| matches!(c, 0x09 | 0x0a | 0x0b | 0x0c | 0x0d | 0x20 | 0xa0 | 0xfeff | 0x1680 | 0x2000..=0x200a | 0x2028 | 0x2029 | 0x202f | 0x205f | 0x3000);
    let mut out = Vec::new();
    for &(cs, ce) in spans.iter() {
        let text = String::from_utf16_lossy(&src[cs..ce]);
        let mut ws_start = cs;
        loop {
            if ws_start > 0 && is_space(src[ws_start - 1]) {
                ws_start -= 1;
            } else if let Some(&(s, _)) = spans.iter().find(|&&(_, e)| e == ws_start && ws_start > 0) {
                ws_start = s;
            } else {
                break;
            }
        }
        let mut ws_end = ce;
        loop {
            if ws_end < src.len() && is_space(src[ws_end]) {
                ws_end += 1;
            } else if let Some(&(_, e)) = spans.iter().find(|&&(s, _)| s == ws_end) {
                ws_end = e;
            } else {
                break;
            }
        }
        let mut holder = 0usize;
        for (i, &(_, s, e)) in order.iter().enumerate() {
            if s <= ws_start && e >= ws_end {
                holder = i;
            }
        }
        let (hs, he) = order.get(holder).map(|o| (o.1, o.2)).unwrap_or((0, usize::MAX));
        let inside = |i: usize, s: usize, e: usize| i != holder && s >= hs && e <= he;
        let leading = order.iter().enumerate().position(|(i, &(_, s, e))| inside(i, s, e) && e == ws_start).map(|x| x as isize).unwrap_or(-1);
        let trailing = order.iter().enumerate().position(|(i, &(_, s, e))| inside(i, s, e) && s == ws_end).map(|x| x as isize).unwrap_or(-1);
        let comma = ws_start > 0 && src[ws_start - 1] == b',' as u16;
        out.push(format!("{text}\u{0}{holder}\u{0}{leading}\u{0}{trailing}\u{0}{comma}"));
    }
    out
}

fn equivalence_key(source: &str) -> Option<(String, Vec<String>)> {
    let mut ast = Ast::new();
    let parsed = recast::parse(&mut ast, source, Mode::Babel).ok()?;
    let program = ast.child(parsed.file, "program")?;
    // Babel's Program also names its interpreter (null without one).
    let json = normalized_json(&ast, program);
    let sig = comment_signature(&ast, program, parsed.lines_id);
    Some((json, sig))
}

/// `shadcnJavaScriptSourcesEquivalent(left, right)`
pub fn sources_equivalent(left: &str, right: &str) -> bool {
    match (equivalence_key(left), equivalence_key(right)) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    }
}
