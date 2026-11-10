//! `@babel/plugin-transform-typescript` 7.29 enums (`enum.js`) and namespaces
//! (`namespace.js`), with the default options (`optimizeConstEnums: false`,
//! `allowNamespaces: true`). The nodes are built the way Babel's templates
//! build them, so recast prints them the same: the template parentheses
//! become `extra.parenthesized`.

use crate::commands::upgrade::recast::{Ast, NodeId, V};
use std::collections::{HashMap, HashSet};

/// A constant enum member value.
#[derive(Debug, Clone, PartialEq)]
pub enum CV {
    Num(f64),
    Str(String),
}

/// Enum data (`ENUMS`) and generated names, kept across one file.
#[derive(Default)]
pub struct EnumState {
    /// Enum name → its members in order (`None`: not a constant).
    pub enums: HashMap<String, Vec<(String, Option<CV>)>>,
    /// `parentPath.setData(name, true)`: (container, enum name).
    pub seen: HashSet<(NodeId, String)>,
    /// Names already used in the file (bindings, references, uids).
    pub used: HashSet<String>,
}

impl EnumState {
    /// `scope.generateUid(name)`.
    pub fn generate_uid(&mut self, name: &str) -> String {
        let base: String = {
            let t = name.trim_start_matches('_');
            t.trim_end_matches(|c: char| c.is_ascii_digit()).to_string()
        };
        let mut i = 1;
        loop {
            let uid = if i > 1 { format!("_{}{}", base, i) } else { format!("_{}", base) };
            if !self.used.contains(&uid) {
                self.used.insert(uid.clone());
                return uid;
            }
            i += 1;
        }
    }
}

fn ident(ast: &mut Ast, name: &str) -> NodeId {
    ast.new_node("Identifier", vec![("name", V::s(name))])
}

fn str_lit(ast: &mut Ast, s: &str) -> NodeId {
    ast.new_node("StringLiteral", vec![("value", V::s(s))])
}

fn num_lit(ast: &mut Ast, n: f64) -> NodeId {
    ast.new_node("NumericLiteral", vec![("value", V::Num(n))])
}

fn paren(ast: &mut Ast, id: NodeId) -> NodeId {
    ast.set_extra(id, "parenthesized", V::Bool(true));
    id
}

fn member(ast: &mut Ast, obj: NodeId, prop: NodeId, computed: bool) -> NodeId {
    ast.new_node("MemberExpression", vec![("object", V::Node(obj)), ("property", V::Node(prop)), ("computed", V::Bool(computed))])
}

fn assign(ast: &mut Ast, left: NodeId, right: NodeId) -> NodeId {
    ast.new_node("AssignmentExpression", vec![("operator", V::s("=")), ("left", V::Node(left)), ("right", V::Node(right))])
}

fn expr_stmt(ast: &mut Ast, e: NodeId) -> NodeId {
    ast.new_node("ExpressionStatement", vec![("expression", V::Node(e))])
}

fn logical_or(ast: &mut Ast, l: NodeId, r: NodeId) -> NodeId {
    ast.new_node("LogicalExpression", vec![("operator", V::s("||")), ("left", V::Node(l)), ("right", V::Node(r))])
}

fn object(ast: &mut Ast) -> NodeId {
    ast.new_node("ObjectExpression", vec![("properties", V::Arr(vec![]))])
}

/// `t.cloneNode(node)` of a simple node (identifiers and member chains).
fn clone_simple(ast: &mut Ast, id: NodeId) -> NodeId {
    let fields: Vec<(&str, V)> = ast.node(id).fields.iter().filter(|(k, _)| !matches!(*k, "start" | "end" | "loc" | "comments" | "extra" | "leadingComments" | "trailingComments" | "innerComments")).map(|(k, v)| (*k, v.clone())).collect();
    let ty = ast.ty(id);
    let mut out: Vec<(&str, V)> = Vec::new();
    for (k, v) in fields {
        let v = match v {
            V::Node(c) => V::Node(clone_simple(ast, c)),
            other => other,
        };
        out.push((k, v));
    }
    ast.new_node(ty, out)
}

fn function_iife(ast: &mut Ast, param: &str, body: Vec<NodeId>, arg: NodeId) -> NodeId {
    let p = ident(ast, param);
    let block = ast.new_node("BlockStatement", vec![("body", V::Arr(body.into_iter().map(V::Node).collect())), ("directives", V::Arr(vec![]))]);
    let f = ast.new_node(
        "FunctionExpression",
        vec![("id", V::Null), ("params", V::Arr(vec![V::Node(p)])), ("body", V::Node(block)), ("generator", V::Bool(false)), ("async", V::Bool(false))],
    );
    let f = paren(ast, f);
    ast.new_node("CallExpression", vec![("callee", V::Node(f)), ("arguments", V::Arr(vec![V::Node(arg)]))])
}

// ---------------------------------------------------------------- enums

fn to_int32(n: f64) -> i32 {
    if !n.is_finite() {
        return 0;
    }
    let m = n.trunc().rem_euclid(4294967296.0);
    (if m >= 2147483648.0 { m - 4294967296.0 } else { m }) as i32
}

fn to_uint32(n: f64) -> u32 {
    to_int32(n) as u32
}

fn js_string(v: &CV) -> String {
    match v {
        CV::Str(s) => s.clone(),
        CV::Num(n) => crate::json::js_number_to_string(*n),
    }
}

fn to_num(v: &CV) -> f64 {
    match v {
        CV::Num(n) => *n,
        CV::Str(s) => {
            let t = s.trim();
            if t.is_empty() {
                0.0
            } else {
                t.parse::<f64>().unwrap_or(f64::NAN)
            }
        }
    }
}

struct Eval<'a> {
    prev: &'a [(String, Option<CV>)],
    enums: &'a HashMap<String, Vec<(String, Option<CV>)>>,
    consts: &'a HashMap<String, NodeId>,
    seen: HashSet<String>,
}

impl Eval<'_> {
    fn eval(&mut self, ast: &Ast, id: NodeId) -> Option<CV> {
        match ast.ty(id) {
            "MemberExpression" | "Identifier" => self.eval_ref(ast, id),
            "StringLiteral" => ast.str_of(id, "value").map(|s| CV::Str(s.to_string())),
            "NumericLiteral" => match ast.get(id, "value") {
                V::Num(n) => Some(CV::Num(*n)),
                _ => None,
            },
            "UnaryExpression" => {
                let v = self.eval(ast, ast.child(id, "argument")?)?;
                match ast.str_of(id, "operator")? {
                    "+" => Some(v),
                    "-" => Some(CV::Num(-to_num(&v))),
                    "~" => Some(CV::Num(!to_int32(to_num(&v)) as f64)),
                    _ => None,
                }
            }
            "BinaryExpression" => {
                let l = self.eval(ast, ast.child(id, "left")?)?;
                let r = self.eval(ast, ast.child(id, "right")?)?;
                let (a, b) = (to_num(&l), to_num(&r));
                Some(match ast.str_of(id, "operator")? {
                    "|" => CV::Num((to_int32(a) | to_int32(b)) as f64),
                    "&" => CV::Num((to_int32(a) & to_int32(b)) as f64),
                    ">>" => CV::Num((to_int32(a) >> (to_uint32(b) & 31)) as f64),
                    ">>>" => CV::Num((to_uint32(a) >> (to_uint32(b) & 31)) as f64),
                    "<<" => CV::Num((to_int32(a).wrapping_shl(to_uint32(b) & 31)) as f64),
                    "^" => CV::Num((to_int32(a) ^ to_int32(b)) as f64),
                    "*" => CV::Num(a * b),
                    "/" => CV::Num(a / b),
                    "+" => match (&l, &r) {
                        (CV::Num(x), CV::Num(y)) => CV::Num(x + y),
                        _ => CV::Str(format!("{}{}", js_string(&l), js_string(&r))),
                    },
                    "-" => CV::Num(a - b),
                    "%" => CV::Num(a % b),
                    "**" => CV::Num(a.powf(b)),
                    _ => return None,
                })
            }
            "TemplateLiteral" => {
                let quasis = ast.list(id, "quasis");
                let cooked = |q: NodeId| ast.get(q, "value").obj_get("cooked").as_str().map(|s| s.to_string());
                if quasis.len() == 1 {
                    return cooked(quasis[0]).map(CV::Str);
                }
                let exprs = ast.list(id, "expressions");
                let mut s = String::new();
                for (i, q) in quasis.iter().enumerate() {
                    s.push_str(&cooked(*q)?);
                    if i + 1 < quasis.len() {
                        let v = self.eval_ref(ast, *exprs.get(i)?)?;
                        s.push_str(&js_string(&v));
                    }
                }
                Some(CV::Str(s))
            }
            _ => None,
        }
    }

    fn eval_ref(&mut self, ast: &Ast, id: NodeId) -> Option<CV> {
        if ast.is(id, "MemberExpression") {
            let obj = ast.child(id, "object")?;
            let prop = ast.child(id, "property")?;
            let computed = ast.get(id, "computed").as_bool();
            if !ast.is(obj, "Identifier") || (if computed { !ast.is(prop, "StringLiteral") } else { !ast.is(prop, "Identifier") }) {
                return None;
            }
            let data = self.enums.get(ast.name(obj)?)?;
            // Babel reads `prop.computed ? prop.value : prop.name`: a computed
            // string key reads `name`, which is undefined.
            let key = if computed { return None } else { ast.name(prop)? };
            return data.iter().rev().find(|(k, _)| k == key).and_then(|(_, v)| v.clone());
        }
        if ast.is(id, "Identifier") {
            let name = ast.name(id)?.to_string();
            if name == "Infinity" || name == "NaN" {
                return Some(CV::Num(if name == "NaN" { f64::NAN } else { f64::INFINITY }));
            }
            if let Some((_, v)) = self.prev.iter().rev().find(|(k, _)| *k == name) {
                return v.clone();
            }
            if self.seen.contains(&name) {
                return None;
            }
            self.seen.insert(name.clone());
            let init = *self.consts.get(&name)?;
            return self.eval(ast, init);
        }
        None
    }
}

fn is_syntactically_string(ast: &Ast, id: NodeId) -> bool {
    match ast.ty(id) {
        "BinaryExpression" => ast.str_of(id, "operator") == Some("+") && (ast.child(id, "left").map(|l| is_syntactically_string(ast, l)).unwrap_or(false) || ast.child(id, "right").map(|r| is_syntactically_string(ast, r)).unwrap_or(false)),
        "TemplateLiteral" | "StringLiteral" => true,
        "TSAsExpression" | "TSSatisfiesExpression" | "TSNonNullExpression" | "TSTypeAssertion" => ast.child(id, "expression").map(|e| is_syntactically_string(ast, e)).unwrap_or(false),
        _ => false,
    }
}

fn value_node(ast: &mut Ast, v: &CV) -> NodeId {
    match v {
        CV::Str(s) => str_lit(ast, s),
        CV::Num(n) => {
            if n.is_nan() {
                ident(ast, "NaN")
            } else if *n == f64::INFINITY {
                ident(ast, "Infinity")
            } else if *n == f64::NEG_INFINITY {
                let i = ident(ast, "Infinity");
                ast.new_node("UnaryExpression", vec![("operator", V::s("-")), ("prefix", V::Bool(true)), ("argument", V::Node(i))])
            } else if *n < 0.0 || (*n == 0.0 && n.is_sign_negative()) {
                let l = num_lit(ast, -n);
                ast.new_node("UnaryExpression", vec![("operator", V::s("-")), ("prefix", V::Bool(true)), ("argument", V::Node(l))])
            } else {
                num_lit(ast, *n)
            }
        }
    }
}

/// Rewrite references to earlier members inside a non-constant initializer
/// to `Enum.member`.
fn rewrite_refs(ast: &mut Ast, id: NodeId, parent: Option<(NodeId, &'static str)>, enum_id: NodeId, names: &HashSet<String>) -> Option<NodeId> {
    if ast.is(id, "Identifier") {
        let referenced = match parent {
            Some((p, k)) => {
                let pt = ast.ty(p);
                !((matches!(pt, "MemberExpression" | "OptionalMemberExpression") && k == "property" && !ast.get(p, "computed").as_bool())
                    || (matches!(pt, "ObjectProperty" | "ObjectMethod") && k == "key" && !ast.get(p, "computed").as_bool()))
            }
            None => true,
        };
        if referenced && ast.name(id).map(|n| names.contains(n)).unwrap_or(false) {
            let obj = clone_simple(ast, enum_id);
            let prop = clone_simple(ast, id);
            return Some(member(ast, obj, prop, false));
        }
        return None;
    }
    let keys: Vec<&'static str> = ast.node(id).fields.iter().map(|(k, _)| *k).collect();
    for k in keys {
        if matches!(k, "comments" | "extra" | "loc" | "leadingComments" | "trailingComments" | "innerComments") {
            continue;
        }
        match ast.get(id, k).clone() {
            V::Node(c) => {
                if let Some(n) = rewrite_refs(ast, c, Some((id, k)), enum_id, names) {
                    ast.set(id, k, V::Node(n));
                }
            }
            V::Arr(a) => {
                let mut changed = false;
                let mut out = a.clone();
                for (i, v) in a.iter().enumerate() {
                    if let V::Node(c) = v {
                        if let Some(n) = rewrite_refs(ast, *c, Some((id, k)), enum_id, names) {
                            out[i] = V::Node(n);
                            changed = true;
                        }
                    }
                }
                if changed {
                    ast.set(id, k, V::Arr(out));
                }
            }
            _ => {}
        }
    }
    None
}

/// `transpileEnum`: the replacement statement for a (non-`declare`) enum.
/// `container` is the Program or block that holds it (through an export);
/// `exported`: the enum is an export's declaration. Returns the new node: a
/// declaration (to put in the enum's place) or, for a repeated enum, an
/// expression statement (to put in place of the export or the enum).
pub fn transpile_enum(ast: &mut Ast, st: &mut EnumState, enum_node: NodeId, container: NodeId, is_global: bool, consts: &HashMap<String, NodeId>) -> Result<NodeId, String> {
    let id = ast.child(enum_node, "id").ok_or("enum without id")?;
    let name = ast.name(id).unwrap_or("").to_string();
    let mut data: Vec<(String, Option<CV>)> = st.enums.get(&name).cloned().unwrap_or_default();
    let members = ast.list(enum_node, "members");
    let mut const_value: Option<CV> = Some(CV::Num(-1.0));
    let mut last_name = String::new();
    let mut values: Vec<(String, NodeId)> = Vec::new();
    for m in members {
        let mid = ast.child(m, "id").ok_or("enum member without id")?;
        let mname = if ast.is(mid, "Identifier") { ast.name(mid).unwrap_or("").to_string() } else { ast.str_of(mid, "value").unwrap_or("").to_string() };
        let value;
        if let Some(init) = ast.child(m, "initializer") {
            let cv = {
                let mut ev = Eval { prev: &data, enums: &st.enums, consts, seen: HashSet::new() };
                ev.eval(ast, init)
            };
            const_value = cv.clone();
            match cv {
                Some(cv) => {
                    data.push((mname.clone(), Some(cv.clone())));
                    value = value_node(ast, &cv);
                }
                None => {
                    let names: HashSet<String> = data.iter().map(|(k, _)| k.clone()).collect();
                    value = rewrite_refs(ast, init, None, id, &names).unwrap_or(init);
                    data.push((mname.clone(), None));
                }
            }
        } else {
            match &const_value {
                Some(CV::Num(n)) => {
                    let n = n + 1.0;
                    const_value = Some(CV::Num(n));
                    value = num_lit(ast, n);
                    data.push((mname.clone(), Some(CV::Num(n))));
                }
                Some(CV::Str(_)) => return Err("Enum member must have initializer.".into()),
                None => {
                    let obj = clone_simple(ast, id);
                    let key = str_lit(ast, &last_name);
                    let last_ref = member(ast, obj, key, true);
                    let one = num_lit(ast, 1.0);
                    value = ast.new_node("BinaryExpression", vec![("operator", V::s("+")), ("left", V::Node(one)), ("right", V::Node(last_ref))]);
                    data.push((mname.clone(), None));
                }
            }
        }
        last_name = mname.clone();
        values.push((mname, value));
    }
    let mut assignments = Vec::new();
    for (mname, value) in values {
        let e1 = clone_simple(ast, id);
        let k1 = str_lit(ast, &mname);
        let target = member(ast, e1, k1, true);
        let stmt = if is_syntactically_string(ast, value) {
            let a = assign(ast, target, value);
            expr_stmt(ast, a)
        } else {
            let inner = assign(ast, target, value);
            let e2 = clone_simple(ast, id);
            let outer_target = member(ast, e2, inner, true);
            let n = str_lit(ast, &mname);
            let a = assign(ast, outer_target, n);
            expr_stmt(ast, a)
        };
        assignments.push(stmt);
    }
    let ret_id = clone_simple(ast, id);
    let ret = ast.new_node("ReturnStatement", vec![("argument", V::Node(ret_id))]);
    assignments.push(ret);
    let seen = !st.seen.insert((container, name.clone()));
    let mut init = object(ast);
    if seen || is_global {
        let i = clone_simple(ast, id);
        init = logical_or(ast, i, init);
    }
    let iife = function_iife(ast, &name, assignments, init);
    let iife = paren(ast, iife);
    st.enums.insert(name.clone(), data);
    if seen {
        let target = clone_simple(ast, id);
        let a = assign(ast, target, iife);
        return Ok(expr_stmt(ast, a));
    }
    let decl = ast.new_node("VariableDeclarator", vec![("id", V::Node(id)), ("init", V::Node(iife))]);
    Ok(ast.new_node("VariableDeclaration", vec![("kind", V::s(if is_global { "var" } else { "let" })), ("declarations", V::Arr(vec![V::Node(decl)]))]))
}

// ----------------------------------------------------------- namespaces

/// The leftmost identifier of a namespace id (`A` of `A.B.C`).
pub fn first_identifier(ast: &Ast, id: NodeId) -> NodeId {
    if ast.is(id, "TSQualifiedName") {
        if let Some(l) = ast.child(id, "left") {
            return first_identifier(ast, l);
        }
    }
    id
}

/// Babel's shape for `namespace A.B.C {}`: nested declarations.
fn normalize_dotted(ast: &mut Ast, ns: NodeId) {
    let Some(id) = ast.child(ns, "id") else { return };
    if !ast.is(id, "TSQualifiedName") {
        return;
    }
    let mut parts = Vec::new();
    let mut cur = id;
    while ast.is(cur, "TSQualifiedName") {
        parts.push(ast.child(cur, "right").unwrap());
        cur = ast.child(cur, "left").unwrap();
    }
    parts.push(cur);
    parts.reverse();
    let mut body = ast.child(ns, "body").unwrap();
    for part in parts[1..].iter().rev() {
        body = ast.new_node("TSModuleDeclaration", vec![("id", V::Node(*part)), ("body", V::Node(body))]);
    }
    ast.set(ns, "id", V::Node(parts[0]));
    ast.set(ns, "body", V::Node(body));
}

fn get_declaration(ast: &mut Ast, name: &str) -> NodeId {
    let i = ident(ast, name);
    let d = ast.new_node("VariableDeclarator", vec![("id", V::Node(i)), ("init", V::Null)]);
    ast.new_node("VariableDeclaration", vec![("kind", V::s("let")), ("declarations", V::Arr(vec![V::Node(d)]))])
}

fn ns_member(ast: &mut Ast, name: &str, item: &str) -> NodeId {
    let o = ident(ast, name);
    let p = ident(ast, item);
    member(ast, o, p, false)
}

fn binding_names(ast: &Ast, id: NodeId, out: &mut Vec<String>) {
    match ast.ty(id) {
        "Identifier" => out.push(ast.name(id).unwrap_or("").to_string()),
        "ObjectPattern" => {
            for p in ast.list(id, "properties") {
                if ast.is(p, "RestElement") {
                    if let Some(a) = ast.child(p, "argument") {
                        binding_names(ast, a, out);
                    }
                } else if let Some(v) = ast.child(p, "value") {
                    binding_names(ast, v, out);
                }
            }
        }
        "ArrayPattern" => {
            for e in ast.list(id, "elements") {
                binding_names(ast, e, out);
            }
        }
        "AssignmentPattern" => {
            if let Some(l) = ast.child(id, "left") {
                binding_names(ast, l, out);
            }
        }
        "RestElement" => {
            if let Some(a) = ast.child(id, "argument") {
                binding_names(ast, a, out);
            }
        }
        "VariableDeclaration" => {
            for d in ast.list(id, "declarations") {
                if let Some(i) = ast.child(d, "id") {
                    binding_names(ast, i, out);
                }
            }
        }
        _ => {}
    }
}

fn handle_variable_declaration(ast: &mut Ast, node: NodeId, name: &str) -> Result<Vec<NodeId>, String> {
    if ast.str_of(node, "kind") != Some("const") {
        return Err("Namespaces exporting non-const are not supported by Babel. Change to const or see: https://babeljs.io/docs/en/babel-plugin-transform-typescript".into());
    }
    let decls = ast.list(node, "declarations");
    if decls.iter().all(|d| ast.child(*d, "id").map(|i| ast.is(i, "Identifier")).unwrap_or(false)) {
        for d in decls {
            let item = ast.child(d, "id").and_then(|i| ast.name(i)).unwrap_or("").to_string();
            let target = ns_member(ast, name, &item);
            let init = ast.get(d, "init").clone();
            let a = ast.new_node("AssignmentExpression", vec![("operator", V::s("=")), ("left", V::Node(target)), ("right", init)]);
            ast.set(d, "init", V::Node(a));
        }
        return Ok(vec![node]);
    }
    let mut names = Vec::new();
    binding_names(ast, node, &mut names);
    let mut seen = HashSet::new();
    let mut assigns = Vec::new();
    for n in names {
        if !seen.insert(n.clone()) {
            continue;
        }
        let target = ns_member(ast, name, &n);
        let v = ident(ast, &n);
        assigns.push(V::Node(assign(ast, target, v)));
    }
    let seq = ast.new_node("SequenceExpression", vec![("expressions", V::Arr(assigns))]);
    let s = expr_stmt(ast, seq);
    Ok(vec![node, s])
}

fn is_typescript(ty: &str) -> bool {
    ty.starts_with("TS")
}

/// `handleNested(path, node, parentExport)`: the IIFE statement, or `None`
/// for a namespace with no runtime content.
pub fn handle_nested(ast: &mut Ast, st: &mut EnumState, node: NodeId, parent_export: Option<&str>) -> Result<Option<NodeId>, String> {
    normalize_dotted(ast, node);
    let real_name = ast.child(node, "id").ok_or("namespace without id")?;
    let real = ast.name(real_name).unwrap_or("").to_string();
    let name = st.generate_uid(&real);
    let body = ast.child(node, "body").ok_or("namespace without body")?;
    let mut top: Vec<NodeId> = if ast.is(body, "TSModuleBlock") {
        ast.list(body, "body")
    } else {
        vec![ast.new_node("ExportNamedDeclaration", vec![("declaration", V::Node(body)), ("specifiers", V::Arr(vec![])), ("source", V::Null)])]
    };
    let mut names: HashSet<String> = HashSet::new();
    let mut is_empty = true;
    let mut i = 0usize;
    while i < top.len() {
        let sub = top[i];
        match ast.ty(sub) {
            "TSModuleDeclaration" => {
                if !ast.child(sub, "id").map(|x| ast.is(x, "Identifier") || ast.is(x, "TSQualifiedName")).unwrap_or(false) {
                    return Err("Ambient modules cannot be nested in other modules or namespaces.".into());
                }
                let transformed = handle_nested(ast, st, sub, None)?;
                if let Some(t) = transformed {
                    is_empty = false;
                    let module_name = ast.child(sub, "id").and_then(|x| ast.name(x)).unwrap_or("").to_string();
                    if names.contains(&module_name) {
                        top[i] = t;
                    } else {
                        names.insert(module_name.clone());
                        let d = get_declaration(ast, &module_name);
                        top.splice(i..i + 1, [d, t]);
                        i += 1;
                    }
                }
                i += 1;
                continue;
            }
            "TSEnumDeclaration" | "FunctionDeclaration" | "ClassDeclaration" => {
                is_empty = false;
                if let Some(n) = ast.child(sub, "id").and_then(|x| ast.name(x)) {
                    names.insert(n.to_string());
                }
                i += 1;
                continue;
            }
            "VariableDeclaration" => {
                is_empty = false;
                let mut ns = Vec::new();
                binding_names(ast, sub, &mut ns);
                names.extend(ns);
                i += 1;
                continue;
            }
            "ExportNamedDeclaration" => {}
            t => {
                is_empty = is_empty && is_typescript(t);
                i += 1;
                continue;
            }
        }
        let Some(decl) = ast.child(sub, "declaration") else {
            i += 1;
            continue;
        };
        if ast.get(decl, "declare").as_bool() {
            i += 1;
            continue;
        }
        match ast.ty(decl) {
            "TSEnumDeclaration" | "FunctionDeclaration" | "ClassDeclaration" => {
                is_empty = false;
                let item = ast.child(decl, "id").and_then(|x| ast.name(x)).unwrap_or("").to_string();
                names.insert(item.clone());
                let target = ns_member(ast, &name, &item);
                let v = ident(ast, &item);
                let a = assign(ast, target, v);
                let s = expr_stmt(ast, a);
                top.splice(i..i + 1, [decl, s]);
                i += 2;
            }
            "VariableDeclaration" => {
                is_empty = false;
                let nodes = handle_variable_declaration(ast, decl, &name)?;
                let n = nodes.len();
                top.splice(i..i + 1, nodes);
                i += n;
            }
            "TSModuleDeclaration" => {
                if !ast.child(decl, "id").map(|x| ast.is(x, "Identifier") || ast.is(x, "TSQualifiedName")).unwrap_or(false) {
                    return Err("Ambient modules cannot be nested in other modules or namespaces.".into());
                }
                let transformed = handle_nested(ast, st, decl, Some(&name))?;
                match transformed {
                    Some(t) => {
                        is_empty = false;
                        let module_name = ast.child(decl, "id").and_then(|x| ast.name(x)).unwrap_or("").to_string();
                        if names.contains(&module_name) {
                            top[i] = t;
                            i += 1;
                        } else {
                            names.insert(module_name.clone());
                            let d = get_declaration(ast, &module_name);
                            top.splice(i..i + 1, [d, t]);
                            i += 2;
                        }
                    }
                    None => {
                        top.remove(i);
                    }
                }
            }
            _ => i += 1,
        }
    }
    if is_empty {
        return Ok(None);
    }
    let mut fallthrough = object(ast);
    if let Some(pe) = parent_export {
        let o1 = ident(ast, pe);
        let p1 = clone_simple(ast, real_name);
        let m1 = member(ast, o1, p1, false);
        let o2 = ident(ast, pe);
        let p2 = clone_simple(ast, real_name);
        let m2 = member(ast, o2, p2, false);
        let a = assign(ast, m2, fallthrough);
        let a = paren(ast, a);
        let l = logical_or(ast, m1, a);
        fallthrough = paren(ast, l);
    }
    let rn2 = clone_simple(ast, real_name);
    let a = assign(ast, rn2, fallthrough);
    let a = paren(ast, a);
    let arg = logical_or(ast, real_name, a);
    let call = function_iife(ast, &name, top, arg);
    Ok(Some(expr_stmt(ast, call)))
}
