//! `@babel/plugin-transform-typescript` 7.29 with its default options, run
//! on the recast tree the way `transformFromAstSync(ast, source, {cloneInputAst:
//! false})` mutates it: fields set to null, nodes spliced out of their arrays,
//! wrappers replaced by the node they wrap. The printer then reuses the
//! original text of every node left alone.
//!
//! Import elision follows the plugin: a value import whose every reference
//! sits in a type position is removed, except `React` in a file with JSX.
//! The plugin reads the JSX pragma from `file.ast.comments`, which recast
//! has already moved onto the nodes, so the pragma is always `React`.

use crate::commands::upgrade::recast::{Ast, NodeId, V};
use std::collections::{HashMap, HashSet};

enum Act {
    Keep,
    Remove,
    Replace(NodeId),
}

struct State {
    /// `NEEDS_EXPLICIT_ESM` for the program: unset, true or false.
    esm: Option<bool>,
    global_types: HashSet<String>,
    bindings: HashSet<String>,
    /// Set when a node in a non-array slot is removed and Babel's removal
    /// hooks remove its parent instead.
    remove_parent: bool,
    /// Babel's `leadingComments` / `trailingComments` of nodes whose lists
    /// were read or changed (comment indexes).
    babel_comments: HashMap<NodeId, (Option<Vec<usize>>, Option<Vec<usize>>)>,
    lines_id: usize,
}

impl State {
    fn esm_init(&mut self) {
        if self.esm.is_none() {
            self.esm = Some(true);
        }
    }
    fn is_global_type(&self, name: &str) -> bool {
        !self.bindings.contains(name) && self.global_types.contains(name)
    }
}

fn truthy(ast: &Ast, id: NodeId, k: &str) -> bool {
    match ast.get(id, k) {
        V::Undef | V::Null => false,
        V::Bool(b) => *b,
        V::Str(s) => !s.is_empty(),
        V::Num(n) => *n != 0.0 && !n.is_nan(),
        _ => true,
    }
}

fn null_if(ast: &mut Ast, id: NodeId, keys: &[&str]) {
    for k in keys {
        if truthy(ast, id, k) {
            ast.set(id, k, V::Null);
        }
    }
}

fn remove_from_list(ast: &mut Ast, parent: NodeId, key: &str, child: NodeId) {
    if let V::Arr(a) = ast.get(parent, key).clone() {
        let kept: Vec<V> = a.into_iter().filter(|v| v.as_node() != Some(child)).collect();
        ast.set(parent, key, V::Arr(kept));
    }
}

fn is_js_space(c: u16) -> bool {
    matches!(c, 0x09 | 0x0a | 0x0b | 0x0c | 0x0d | 0x20 | 0xa0 | 0xfeff | 0x1680 | 0x2000..=0x200a | 0x2028 | 0x2029 | 0x202f | 0x205f | 0x3000)
}

/// The comments in the gap of whitespace and comments before `pos` (or
/// after it): Babel attaches them as the node's leading (trailing) comments.
fn gap_comments(ast: &Ast, lines_id: usize, pos: usize, before: bool) -> Option<Vec<usize>> {
    let src = &ast.sources[lines_id];
    let spans = &ast.comment_spans[lines_id];
    let mut out = Vec::new();
    let mut p = pos;
    if before {
        loop {
            if p > 0 && is_js_space(src[p - 1]) {
                p -= 1;
            } else if let Some(i) = spans.iter().position(|&(_, e)| e == p && p > 0) {
                out.push(i);
                p = spans[i].0;
            } else {
                break;
            }
        }
        out.reverse();
    } else {
        loop {
            if p < src.len() && is_js_space(src[p]) {
                p += 1;
            } else if let Some(i) = spans.iter().position(|&(s, _)| s == p) {
                out.push(i);
                p = spans[i].1;
            } else {
                break;
            }
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn babel_comments(ast: &Ast, st: &mut State, id: NodeId) -> (Option<Vec<usize>>, Option<Vec<usize>>) {
    if let Some(c) = st.babel_comments.get(&id) {
        return c.clone();
    }
    let n = ast.node(id);
    let c = match (n.start, n.end) {
        (Some(s), Some(e)) => (gap_comments(ast, st.lines_id, s as usize, true), gap_comments(ast, st.lines_id, e as usize, false)),
        _ => (None, None),
    };
    st.babel_comments.insert(id, c.clone());
    c
}

/// `t.addComments(node, type, comments)`; marks the node when its list
/// changes, which keeps recast from patching it.
fn add_comments(ast: &mut Ast, st: &mut State, id: NodeId, leading: bool, comments: Vec<usize>) {
    let (mut lead, mut trail) = babel_comments(ast, st, id);
    let slot = if leading { &mut lead } else { &mut trail };
    let changed = match slot {
        Some(list) => {
            if comments.is_empty() {
                false
            } else {
                if leading {
                    let mut c = comments.clone();
                    c.extend(list.iter().copied());
                    *list = c;
                } else {
                    list.extend(comments.iter().copied());
                }
                true
            }
        }
        None => {
            *slot = Some(comments.clone());
            true
        }
    };
    if changed {
        let list: Vec<V> = slot.clone().unwrap_or_default().into_iter().map(|i| V::Num(i as f64)).collect();
        ast.set(id, if leading { "leadingComments" } else { "trailingComments" }, V::Arr(list));
    }
    st.babel_comments.insert(id, (lead, trail));
}

fn remove_if_existing(list: &[usize], existing: &Option<Vec<usize>>) -> Vec<usize> {
    match existing {
        None => list.to_vec(),
        Some(e) => list.iter().copied().filter(|x| !e.contains(x)).collect(),
    }
}

/// `path.remove()` on an array item: `shareCommentsWithSiblings`, then splice.
fn remove_at(ast: &mut Ast, st: &mut State, parent: NodeId, key: &str, child: NodeId) {
    let arr = ast.get(parent, key).as_arr().cloned().unwrap_or_default();
    let Some(i) = arr.iter().position(|v| v.as_node() == Some(child)) else { return };
    let (leading, trailing) = babel_comments(ast, st, child);
    if leading.is_some() || trailing.is_some() {
        let prev = if i > 0 { arr[i - 1].as_node() } else { None };
        let next = arr.get(i + 1).and_then(|v| v.as_node());
        if let Some(p) = prev {
            if let Some(l) = &leading {
                let existing = babel_comments(ast, st, p).1;
                add_comments(ast, st, p, false, remove_if_existing(l, &existing));
            }
            if let (Some(t), None) = (&trailing, next) {
                add_comments(ast, st, p, false, t.clone());
            }
        }
        if let Some(n) = next {
            if let Some(t) = &trailing {
                let existing = babel_comments(ast, st, n).0;
                add_comments(ast, st, n, true, remove_if_existing(t, &existing));
            }
            if let (Some(l), None) = (&leading, prev) {
                add_comments(ast, st, n, true, l.clone());
            }
        }
    }
    remove_from_list(ast, parent, key, child);
}

/// Names a declaration binds (`getBindingIdentifiers` for patterns).
fn pattern_names(ast: &Ast, id: NodeId, out: &mut Vec<String>) {
    match ast.ty(id) {
        "Identifier" => {
            if let Some(n) = ast.name(id) {
                out.push(n.to_string());
            }
        }
        "ObjectPattern" => {
            for p in ast.list(id, "properties") {
                if ast.is(p, "RestElement") {
                    if let Some(a) = ast.child(p, "argument") {
                        pattern_names(ast, a, out);
                    }
                } else if let Some(v) = ast.child(p, "value") {
                    pattern_names(ast, v, out);
                }
            }
        }
        "ArrayPattern" => {
            for e in ast.list(id, "elements") {
                pattern_names(ast, e, out);
            }
        }
        "AssignmentPattern" => {
            if let Some(l) = ast.child(id, "left") {
                pattern_names(ast, l, out);
            }
        }
        "RestElement" => {
            if let Some(a) = ast.child(id, "argument") {
                pattern_names(ast, a, out);
            }
        }
        _ => {}
    }
}

fn declared_names(ast: &Ast, stmt: NodeId) -> Vec<String> {
    let mut out = Vec::new();
    match ast.ty(stmt) {
        "VariableDeclaration" => {
            for d in ast.list(stmt, "declarations") {
                if let Some(i) = ast.child(d, "id") {
                    pattern_names(ast, i, &mut out);
                }
            }
        }
        "FunctionDeclaration" | "ClassDeclaration" | "TSEnumDeclaration" => {
            if let Some(n) = ast.child(stmt, "id").and_then(|i| ast.name(i)) {
                out.push(n.to_string());
            }
        }
        "TSModuleDeclaration" => {
            if let Some(i) = ast.child(stmt, "id") {
                if ast.is(i, "Identifier") && !truthy(ast, stmt, "declare") {
                    out.push(ast.name(i).unwrap_or("").to_string());
                }
            }
        }
        _ => {}
    }
    out
}

pub fn strip(ast: &mut Ast, file: NodeId, source: &str) -> Result<(), String> {
    let program = ast.child(file, "program").ok_or("ShadCN JavaScript transform produced no AST")?;
    let usage = import_usage(source)?;
    let lines_id = ast.node(program).loc.as_ref().map(|l| l.lines_id).unwrap_or(0);
    let mut st = State { esm: None, global_types: HashSet::new(), bindings: HashSet::new(), remove_parent: false, babel_comments: HashMap::new(), lines_id };
    program_enter(ast, program, &usage, &mut st)?;
    for stmt in ast.list(program, "body") {
        let s = if ast.ty(stmt).starts_with("Export") { ast.child(stmt, "declaration") } else { Some(stmt) };
        if let Some(s) = s {
            for n in declared_names(ast, s) {
                st.bindings.insert(n);
            }
        }
        if ast.is(stmt, "ImportDeclaration") {
            for sp in ast.list(stmt, "specifiers") {
                if let Some(n) = ast.child(sp, "local").and_then(|l| ast.name(l)) {
                    st.bindings.insert(n.to_string());
                }
            }
        }
    }
    visit_children(ast, program, &mut st)?;
    if st.esm == Some(true) && ast.str_of(program, "sourceType") == Some("module") {
        let decl = ast.new_node("ExportNamedDeclaration", vec![("declaration", V::Null), ("specifiers", V::Arr(vec![])), ("source", V::Null)]);
        let mut body = ast.get(program, "body").as_arr().cloned().unwrap_or_default();
        body.push(V::Node(decl));
        ast.set(program, "body", V::Arr(body));
    }
    Ok(())
}

fn program_enter(ast: &mut Ast, program: NodeId, usage: &[Vec<bool>], st: &mut State) -> Result<(), String> {
    let body = ast.list(program, "body");
    let mut import_index = 0usize;
    for stmt in body {
        if ast.is(stmt, "ImportDeclaration") {
            let type_only = usage.get(import_index).cloned().unwrap_or_default();
            import_index += 1;
            st.esm_init();
            let specs = ast.list(stmt, "specifiers");
            if ast.str_of(stmt, "importKind") == Some("type") {
                for sp in &specs {
                    if let Some(n) = ast.child(*sp, "local").and_then(|l| ast.name(l)) {
                        st.global_types.insert(n.to_string());
                    }
                }
                remove_at(ast, st, program, "body", stmt);
                continue;
            }
            let mut to_remove: Vec<NodeId> = Vec::new();
            for sp in &specs {
                if ast.is(*sp, "ImportSpecifier") && ast.str_of(*sp, "importKind") == Some("type") {
                    if let Some(n) = ast.child(*sp, "local").and_then(|l| ast.name(l)) {
                        st.global_types.insert(n.to_string());
                    }
                    to_remove.push(*sp);
                }
            }
            if specs.is_empty() {
                st.esm = Some(false);
                continue;
            }
            for (i, sp) in specs.iter().enumerate() {
                if to_remove.contains(sp) {
                    continue;
                }
                if type_only.get(i).copied().unwrap_or(false) {
                    to_remove.push(*sp);
                } else {
                    st.esm = Some(false);
                }
            }
            if to_remove.len() == specs.len() {
                remove_at(ast, st, program, "body", stmt);
            } else {
                for sp in to_remove {
                    remove_at(ast, st, stmt, "specifiers", sp);
                }
            }
            continue;
        }
        let mut s = Some(stmt);
        if ast.ty(stmt).starts_with("Export") && ast.ty(stmt) != "ExportAllDeclaration" {
            s = ast.child(stmt, "declaration");
        }
        let Some(s) = s else { continue };
        let declare = truthy(ast, s, "declare");
        match ast.ty(s) {
            "VariableDeclaration" if declare => {
                for n in declared_names(ast, s) {
                    st.global_types.insert(n);
                }
            }
            "TSTypeAliasDeclaration" | "TSInterfaceDeclaration" => {
                if let Some(n) = ast.child(s, "id").and_then(|i| ast.name(i)) {
                    st.global_types.insert(n.to_string());
                }
            }
            "TSDeclareFunction" | "TSModuleDeclaration" | "ClassDeclaration" | "TSEnumDeclaration" => {
                let id = ast.child(s, "id");
                let is_ident = id.map(|i| ast.is(i, "Identifier")).unwrap_or(false);
                let ok = match ast.ty(s) {
                    "TSDeclareFunction" => is_ident,
                    "TSModuleDeclaration" => declare && is_ident,
                    _ => declare,
                };
                if ok {
                    if let Some(n) = id.and_then(|i| ast.name(i)) {
                        st.global_types.insert(n.to_string());
                    }
                }
            }
            _ => {}
        }
    }
    Ok(())
}

/// Visit every child slot of `id`, applying removals and replacements.
fn visit_children(ast: &mut Ast, id: NodeId, st: &mut State) -> Result<(), String> {
    let keys: Vec<&'static str> = ast.node(id).fields.iter().map(|(k, _)| *k).collect();
    for k in keys {
        if k == "comments" || k == "extra" {
            continue;
        }
        match ast.get(id, k).clone() {
            V::Node(c) => {
                let mut cur = c;
                loop {
                    match visit(ast, cur, id, k, st)? {
                        Act::Keep => break,
                        Act::Replace(n) => {
                            mark_replaced(ast, n);
                            ast.set(id, k, V::Node(n));
                            cur = n;
                        }
                        Act::Remove => {
                            let parent_ty = ast.ty(id);
                            let removes_parent = (k == "declaration" && matches!(parent_ty, "ExportNamedDeclaration" | "ExportDefaultDeclaration"))
                                || (k == "expression" && parent_ty == "ExpressionStatement");
                            if removes_parent {
                                st.remove_parent = true;
                                return Ok(());
                            }
                            ast.set(id, k, V::Null);
                            break;
                        }
                    }
                }
            }
            V::Arr(_) => {
                let mut i = 0usize;
                loop {
                    let Some(item) = ast.get(id, k).as_arr().and_then(|a| a.get(i).cloned()) else { break };
                    let V::Node(c) = item else {
                        i += 1;
                        continue;
                    };
                    match visit(ast, c, id, k, st)? {
                        Act::Keep => i += 1,
                        Act::Remove => remove_at(ast, st, id, k, c),
                        Act::Replace(n) => {
                            mark_replaced(ast, n);
                            if let V::Arr(mut a) = ast.get(id, k).clone() {
                                a[i] = V::Node(n);
                                ast.set(id, k, V::Arr(a));
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    Ok(())
}

/// `replaceWith` runs `t.inheritsComments(replacement, old)`, which gives the
/// replacement fresh comment lists; recast then prints it generically.
fn mark_replaced(ast: &mut Ast, n: NodeId) {
    ast.set(n, "leadingComments", V::Arr(vec![]));
}

fn is_function(ty: &str) -> bool {
    matches!(ty, "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression" | "ObjectMethod" | "ClassMethod" | "ClassPrivateMethod")
}

fn visit(ast: &mut Ast, id: NodeId, parent: NodeId, _key: &str, st: &mut State) -> Result<Act, String> {
    let ty = ast.ty(id);
    match ty {
        "Identifier" => {
            null_if(ast, id, &["typeAnnotation", "optional"]);
        }
        "ObjectPattern" | "ArrayPattern" | "AssignmentPattern" | "RestElement" => {
            null_if(ast, id, &["typeAnnotation"]);
        }
        "ExportNamedDeclaration" => {
            st.esm_init();
            if ast.str_of(id, "exportKind") == Some("type") {
                return Ok(Act::Remove);
            }
            let specs = ast.list(id, "specifiers");
            let has_source = truthy(ast, id, "source");
            if has_source && !specs.is_empty() && specs.iter().all(|s| ast.is(*s, "ExportSpecifier") && ast.str_of(*s, "exportKind") == Some("type")) {
                return Ok(Act::Remove);
            }
            if !has_source
                && !specs.is_empty()
                && specs.iter().all(|s| ast.is(*s, "ExportSpecifier") && ast.child(*s, "local").and_then(|l| ast.name(l)).map(|n| st.is_global_type(n)).unwrap_or(false))
            {
                return Ok(Act::Remove);
            }
            if let Some(d) = ast.child(id, "declaration") {
                if ast.is(d, "TSModuleDeclaration") && !truthy(ast, d, "declare") && ast.child(d, "id").map(|i| !ast.is(i, "StringLiteral")).unwrap_or(false) {
                    return Err("TypeScript namespaces are not supported by this transform".into());
                }
            }
            st.esm = Some(false);
        }
        "ExportAllDeclaration" => {
            if ast.str_of(id, "exportKind") == Some("type") {
                return Ok(Act::Remove);
            }
        }
        "ExportSpecifier" => {
            let local = ast.child(id, "local").and_then(|l| ast.name(l)).unwrap_or("").to_string();
            if (!truthy(ast, parent, "source") && st.is_global_type(&local)) || ast.str_of(id, "exportKind") == Some("type") {
                return Ok(Act::Remove);
            }
        }
        "ExportDefaultDeclaration" => {
            st.esm_init();
            if let Some(d) = ast.child(id, "declaration") {
                if ast.is(d, "Identifier") && st.is_global_type(ast.name(d).unwrap_or("")) {
                    return Ok(Act::Remove);
                }
            }
            st.esm = Some(false);
        }
        "TSDeclareFunction" | "TSDeclareMethod" | "TSIndexSignature" | "TSInterfaceDeclaration" | "TSTypeAliasDeclaration" => return Ok(Act::Remove),
        "VariableDeclaration" => {
            if truthy(ast, id, "declare") {
                for n in declared_names(ast, id) {
                    st.bindings.remove(&n);
                }
                return Ok(Act::Remove);
            }
        }
        "VariableDeclarator" => null_if(ast, id, &["definite"]),
        "ClassDeclaration" | "ClassExpression" => {
            if ty == "ClassDeclaration" && truthy(ast, id, "declare") {
                for n in declared_names(ast, id) {
                    st.bindings.remove(&n);
                }
                return Ok(Act::Remove);
            }
            visit_class(ast, id, st)?;
        }
        "TSModuleDeclaration" => {
            let string_id = ast.child(id, "id").map(|i| ast.is(i, "StringLiteral")).unwrap_or(false);
            if truthy(ast, id, "declare") || string_id {
                return Ok(Act::Remove);
            }
            return Err("TypeScript namespaces are not supported by this transform".into());
        }
        "TSEnumDeclaration" => {
            if truthy(ast, id, "declare") {
                return Ok(Act::Remove);
            }
            return Err("TypeScript enums are not supported by this transform".into());
        }
        "TSImportEqualsDeclaration" | "TSExportAssignment" => {
            return Err("`import = require()` and `export =` are only supported when compiling modules to CommonJS.".into());
        }
        "TSTypeAssertion" | "TSNonNullExpression" | "TSInstantiationExpression" => {
            if let Some(e) = ast.child(id, "expression") {
                return Ok(Act::Replace(e));
            }
        }
        "TSAsExpression" | "TSSatisfiesExpression" => {
            let mut e = ast.child(id, "expression");
            while let Some(x) = e {
                if ast.is(x, "TSAsExpression") || ast.is(x, "TSSatisfiesExpression") {
                    e = ast.child(x, "expression");
                } else {
                    break;
                }
            }
            if let Some(x) = e {
                return Ok(Act::Replace(x));
            }
        }
        "CallExpression" | "OptionalCallExpression" | "NewExpression" | "JSXOpeningElement" | "TaggedTemplateExpression" => {
            null_if(ast, id, &["typeParameters"]);
        }
        _ => {}
    }
    if is_function(ty) {
        null_if(ast, id, &["typeParameters", "returnType"]);
        let params = ast.list(id, "params");
        if let Some(&first) = params.first() {
            if ast.is(first, "Identifier") && ast.name(first) == Some("this") {
                remove_from_list(ast, id, "params", first);
            }
        }
    }
    let before = st.remove_parent;
    st.remove_parent = false;
    visit_children(ast, id, st)?;
    let removed = st.remove_parent;
    st.remove_parent = before;
    Ok(if removed { Act::Remove } else { Act::Keep })
}

fn visit_class(ast: &mut Ast, class: NodeId, st: &mut State) -> Result<(), String> {
    null_if(ast, class, &["typeParameters", "superTypeParameters", "implements", "abstract"]);
    let Some(body) = ast.child(class, "body") else { return Ok(()) };
    for member in ast.list(body, "body") {
        match ast.ty(member) {
            "ClassMethod" | "ClassPrivateMethod" => {
                if ast.str_of(member, "kind") == Some("constructor") {
                    visit_constructor(ast, class, member)?;
                } else {
                    null_if(ast, member, &["accessibility", "abstract", "optional", "override"]);
                }
            }
            "ClassProperty" | "ClassPrivateProperty" | "ClassAccessorProperty" => {
                let private = ast.is(member, "ClassPrivateProperty");
                let has_value = truthy(ast, member, "value");
                let decorated = truthy(ast, member, "decorators");
                if truthy(ast, member, "declare") {
                    return Err("The 'declare' modifier is only allowed when the 'allowDeclareFields' option of @babel/plugin-transform-typescript or @babel/preset-typescript is enabled.".into());
                } else if truthy(ast, member, "definite") {
                    if has_value {
                        return Err("Definitely assigned fields cannot be initialized here, but only in the constructor".into());
                    }
                    if !decorated && !private {
                        remove_at(ast, st, body, "body", member);
                    }
                } else if truthy(ast, member, "abstract") || (!has_value && !decorated && !private) {
                    remove_at(ast, st, body, "body", member);
                }
                null_if(ast, member, &["accessibility", "abstract", "readonly", "optional", "typeAnnotation", "definite", "declare", "override"]);
            }
            _ => {}
        }
    }
    Ok(())
}

fn this_assign(ast: &mut Ast, name: &str) -> NodeId {
    let this = ast.new_node("ThisExpression", vec![]);
    let prop = ast.new_node("Identifier", vec![("name", V::s(name))]);
    let member = ast.new_node("MemberExpression", vec![("object", V::Node(this)), ("property", V::Node(prop)), ("computed", V::Bool(false))]);
    let right = ast.new_node("Identifier", vec![("name", V::s(name))]);
    let assign = ast.new_node("AssignmentExpression", vec![("operator", V::s("=")), ("left", V::Node(member)), ("right", V::Node(right))]);
    ast.new_node("ExpressionStatement", vec![("expression", V::Node(assign))])
}

fn visit_constructor(ast: &mut Ast, class: NodeId, ctor: NodeId) -> Result<(), String> {
    null_if(ast, ctor, &["accessibility"]);
    let mut names = Vec::new();
    if let V::Arr(mut params) = ast.get(ctor, "params").clone() {
        for p in params.iter_mut() {
            let Some(pid) = p.as_node() else { continue };
            if !ast.is(pid, "TSParameterProperty") {
                continue;
            }
            let Some(param) = ast.child(pid, "parameter") else { continue };
            let id = if ast.is(param, "Identifier") {
                param
            } else if ast.is(param, "AssignmentPattern") && ast.child(param, "left").map(|l| ast.is(l, "Identifier")).unwrap_or(false) {
                ast.child(param, "left").unwrap()
            } else {
                return Err("Parameter properties can not be destructuring patterns.".into());
            };
            names.push(ast.name(id).unwrap_or("").to_string());
            *p = V::Node(param);
        }
        ast.set(ctor, "params", V::Arr(params));
    }
    if names.is_empty() {
        return Ok(());
    }
    let Some(block) = ast.child(ctor, "body") else { return Ok(()) };
    if truthy(ast, class, "superClass") {
        let mut supers = Vec::new();
        find_bare_supers(ast, block, &mut supers);
        if supers.is_empty() {
            return Err("A derived constructor with parameter properties must call super()".into());
        }
        for (holder, stmt) in supers {
            let nodes: Vec<V> = names.iter().map(|n| V::Node(this_assign(ast, n))).collect();
            if let V::Arr(mut a) = ast.get(holder, "body").clone() {
                let at = a.iter().position(|v| v.as_node() == Some(stmt)).map(|i| i + 1).unwrap_or(a.len());
                for (j, n) in nodes.into_iter().enumerate() {
                    a.insert(at + j, n);
                }
                ast.set(holder, "body", V::Arr(a));
            }
        }
    } else {
        let nodes: Vec<V> = names.iter().map(|n| V::Node(this_assign(ast, n))).collect();
        let mut a = ast.get(block, "body").as_arr().cloned().unwrap_or_default();
        for (j, n) in nodes.into_iter().enumerate() {
            a.insert(j, n);
        }
        ast.set(block, "body", V::Arr(a));
    }
    Ok(())
}

/// `super(...)` expression statements in a constructor, outside nested
/// functions and classes: (block holding it, the statement).
fn find_bare_supers(ast: &Ast, block: NodeId, out: &mut Vec<(NodeId, NodeId)>) {
    for stmt in ast.list(block, "body") {
        if ast.is(stmt, "ExpressionStatement") {
            if let Some(e) = ast.child(stmt, "expression") {
                if ast.is(e, "CallExpression") && ast.child(e, "callee").map(|c| ast.is(c, "Super")).unwrap_or(false) {
                    out.push((block, stmt));
                    continue;
                }
            }
        }
        for c in ast.children(stmt) {
            if ast.is(c, "BlockStatement") {
                find_bare_supers(ast, c, out);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Which value imports are only used as types (Babel `isImportTypeOnly`).

fn import_usage(source: &str) -> Result<Vec<Vec<bool>>, String> {
    use oxc::ast::ast::{ImportDeclarationSpecifier, ImportOrExportKind, Statement};
    use oxc::ast::AstKind;
    use oxc::semantic::SemanticBuilder;
    let alloc = oxc_allocator::Allocator::default();
    let ret = oxc_parser::Parser::new(&alloc, source, oxc_span::SourceType::tsx())
        .with_options(oxc_parser::ParseOptions { allow_return_outside_function: true, ..Default::default() })
        .parse();
    let program = ret.program;
    let semantic = SemanticBuilder::new().with_build_nodes(true).build(&program).semantic;
    let scoping = semantic.scoping();
    let nodes = semantic.nodes();
    let has_jsx = nodes.iter().any(|n| matches!(n.kind(), AstKind::JSXElement(_) | AstKind::JSXFragment(_)));
    let in_type = |ref_node: oxc::semantic::NodeId| -> bool {
        match nodes.parent_kind(ref_node) {
            AstKind::TSTypeReference(_) | AstKind::TSClassImplements(_) | AstKind::TSInterfaceHeritage(_) | AstKind::TSTypeQuery(_) => true,
            AstKind::TSQualifiedName(_) => {
                let mut cur = nodes.parent_id(ref_node);
                while matches!(nodes.get_node(cur).kind(), AstKind::TSQualifiedName(_)) {
                    cur = nodes.parent_id(cur);
                }
                !matches!(nodes.get_node(cur).kind(), AstKind::TSImportEqualsDeclaration(_))
            }
            AstKind::ExportSpecifier(spec) => {
                let parent = nodes.parent_id(ref_node);
                let decl_type = matches!(nodes.parent_kind(parent), AstKind::ExportNamedDeclaration(d) if d.export_kind == ImportOrExportKind::Type);
                spec.export_kind == ImportOrExportKind::Type || decl_type
            }
            _ => false,
        }
    };
    let mut out = Vec::new();
    for stmt in &program.body {
        let Statement::ImportDeclaration(d) = stmt else { continue };
        let mut row = Vec::new();
        if let Some(specs) = &d.specifiers {
            for sp in specs {
                let local = match sp {
                    ImportDeclarationSpecifier::ImportSpecifier(s) => &s.local,
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => &s.local,
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => &s.local,
                };
                let all_types = match local.symbol_id.get() {
                    Some(sym) => scoping.get_resolved_reference_ids(sym).iter().all(|r| in_type(scoping.get_reference(*r).node_id())),
                    None => true,
                };
                let name = local.name.as_str();
                row.push(all_types && (name != "React" || !has_jsx));
            }
        }
        out.push(row);
    }
    Ok(out)
}
