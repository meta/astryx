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

/// Where each comment sits among the nodes: its text, the deepest node that
/// holds it, the last node that ends before it and the first that starts
/// after it (by preorder index). Babel attaches comments by these positions.
fn comment_signature(ast: &Ast, root: NodeId, lines_id: usize) -> Vec<String> {
    let mut order: Vec<(NodeId, f64, f64)> = Vec::new();
    fn walk(ast: &Ast, id: NodeId, order: &mut Vec<(NodeId, f64, f64)>) {
        let n = ast.node(id);
        if let (Some(s), Some(e)) = (n.start, n.end) {
            order.push((id, s, e));
        }
        for c in ast.children(id) {
            walk(ast, c, order);
        }
    }
    walk(ast, root, &mut order);
    let src = &ast.sources[lines_id];
    let mut out = Vec::new();
    for &(cs, ce) in ast.comment_spans[lines_id].iter() {
        let (cs, ce) = (cs as f64, ce as f64);
        let text = String::from_utf16_lossy(&src[cs as usize..ce as usize]);
        let mut holder = 0usize;
        let mut before: isize = -1;
        let mut after: isize = -1;
        for (i, &(_, s, e)) in order.iter().enumerate() {
            if s <= cs && e >= ce {
                holder = i;
            }
            if e <= cs {
                before = i as isize;
            }
            if after < 0 && s >= ce {
                after = i as isize;
            }
        }
        out.push(format!("{text}\u{0}{holder}\u{0}{before}\u{0}{after}"));
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
