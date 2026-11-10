//! Small helpers shared by the v0.3.0+ transforms.

use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::recast::V;

/// `path.node.source.value` of an import/export declaration, when a string.
pub fn source_value(j: &J, decl: usize) -> Option<String> {
    j.ast.child(decl, "source").and_then(|s| j.ast.str_of(s, "value").map(|x| x.to_string()))
}

/// `spec.imported.name` (Identifier name only).
pub fn imported_name(j: &J, spec: usize) -> Option<String> {
    j.ast.child(spec, "imported").and_then(|i| j.ast.name(i).map(|s| s.to_string()))
}

pub fn local_name(j: &J, spec: usize) -> Option<String> {
    j.ast.child(spec, "local").and_then(|i| j.ast.name(i).map(|s| s.to_string()))
}

/// `a.name?.name` for a JSX attribute (any name node kind with a `name`).
pub fn attr_name(j: &J, a: usize) -> Option<String> {
    if !j.ast.is(a, "JSXAttribute") {
        return None;
    }
    j.ast.child(a, "name").and_then(|n| j.ast.str_of(n, "name").map(|s| s.to_string()))
}

/// The JSX opening element's plain identifier name.
pub fn jsx_ident_name(j: &J, opening: usize) -> Option<String> {
    let n = j.ast.child(opening, "name")?;
    if j.ast.is(n, "JSXIdentifier") {
        j.ast.name(n).map(|s| s.to_string())
    } else {
        None
    }
}

pub fn find_attr(j: &J, opening: usize, name: &str) -> Option<usize> {
    j.ast.list(opening, "attributes").into_iter().find(|a| attr_name(j, *a).as_deref() == Some(name))
}

/// Locals of `import {Imported as local}` from any of `sources` whose
/// imported name passes `want`.
pub fn import_locals(j: &J, sources: &[&str], want: &dyn Fn(&str) -> bool) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for ip in j.find("ImportDeclaration") {
        match source_value(j, ip.node) {
            Some(s) if sources.contains(&s.as_str()) => {}
            _ => continue,
        }
        for s in j.ast.list(ip.node, "specifiers") {
            if !j.ast.is(s, "ImportSpecifier") {
                continue;
            }
            if let Some(i) = imported_name(j, s) {
                if want(&i) {
                    let l = local_name(j, s).unwrap_or(i.clone());
                    out.push((l, i));
                }
            }
        }
    }
    out
}

pub fn obj_prop(j: &mut J, key: usize, value: usize) -> usize {
    j.b("ObjectProperty", vec![("key", V::Node(key)), ("value", V::Node(value))])
}

/// `j.property('init', key, value)`
pub fn prop_init(j: &mut J, key: usize, value: usize) -> usize {
    j.b("Property", vec![("kind", V::s("init")), ("key", V::Node(key)), ("value", V::Node(value))])
}

pub fn obj_expr(j: &mut J, props: Vec<usize>) -> usize {
    j.b("ObjectExpression", vec![("properties", V::Arr(props.into_iter().map(V::Node).collect()))])
}

pub fn done(j: &J, changed: bool) -> TResult {
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

/// `j.commentLine` / `j.commentBlock` (leading, trailing).
pub fn comment(j: &mut J, block: bool, value: &str, leading: bool, trailing: bool) -> usize {
    j.b(if block { "CommentBlock" } else { "CommentLine" }, vec![("value", V::s(value)), ("leading", V::Bool(leading)), ("trailing", V::Bool(trailing))])
}

/// `node.comments` when it is set (JS truthiness of the array).
pub fn comments_of(j: &J, n: usize) -> Option<Vec<usize>> {
    match j.ast.get(n, "comments") {
        V::Arr(a) => Some(a.iter().filter_map(|x| x.as_node()).collect()),
        _ => None,
    }
}

pub fn set_comments(j: &mut J, n: usize, cs: Vec<usize>) {
    j.ast.set(n, "comments", V::Arr(cs.into_iter().map(V::Node).collect()));
}

/// `prop.key?.name`
pub fn key_name(j: &J, prop: usize) -> Option<String> {
    j.ast.child(prop, "key").and_then(|k| j.ast.str_of(k, "name").map(|s| s.to_string()))
}

/// `node.callee.name` (any callee kind carrying a name).
pub fn callee_name(j: &J, call: usize) -> Option<String> {
    j.ast.child(call, "callee").and_then(|c| j.ast.str_of(c, "name").map(|s| s.to_string()))
}

/// `transformProp` with the opening element's path (`propPath.parent`).
pub fn transform_prop_paths(j: &mut J, o: &crate::commands::upgrade::transforms::common::PropOptions, visit: &mut dyn FnMut(&mut J, &NPath, usize, &str, &str)) {
    use crate::commands::upgrade::transforms::common::*;
    let imports = imported_components(j, o);
    if imports.direct.is_empty() && imports.namespaces.is_empty() {
        return;
    }
    for jp in j.find("JSXOpeningElement") {
        let name = j.ast.child(jp.node, "name").unwrap();
        let (comp, props, local) = match resolve_imported_component(j, name, &jp, &imports, o) {
            Some(r) => r,
            None => continue,
        };
        let mut index = 0;
        loop {
            let attrs = j.ast.list(jp.node, "attributes");
            if index >= attrs.len() {
                break;
            }
            let a = attrs[index];
            index += 1;
            if !j.ast.is(a, "JSXAttribute") {
                continue;
            }
            let an = j.ast.child(a, "name");
            let ok = an.map(|n| j.ast.is(n, "JSXIdentifier") && props.iter().any(|p| Some(p.as_str()) == j.ast.name(n))).unwrap_or(false);
            if !ok {
                continue;
            }
            visit(j, &jp, a, &comp, &local);
        }
    }
}
