//! A small jscodeshift: find nodes, walk paths, replace and remove, build
//! nodes, scope lookups, and `toSource`.

use super::recast::ast::*;
use super::recast::{self, Config, Mode, Quote};

#[derive(Clone, Copy, Debug)]
pub struct Link {
    pub parent: NodeId,
    pub key: &'static str,
    /// Whether the child sits in an array field.
    pub in_array: bool,
}

#[derive(Clone, Debug)]
pub struct NPath {
    pub node: NodeId,
    pub parents: Vec<Link>,
}

impl NPath {
    pub fn parent(&self) -> Option<NodeId> {
        self.parents.last().map(|l| l.parent)
    }
    pub fn parent_path(&self) -> Option<NPath> {
        if self.parents.is_empty() {
            return None;
        }
        let mut p = self.parents.clone();
        let l = p.pop().unwrap();
        Some(NPath { node: l.parent, parents: p })
    }
    pub fn key(&self) -> Option<&'static str> {
        self.parents.last().map(|l| l.key)
    }
    /// Ancestors, nearest first.
    pub fn ancestors(&self) -> impl Iterator<Item = NodeId> + '_ {
        self.parents.iter().rev().map(|l| l.parent)
    }
    pub fn child(&self, key: &'static str, id: NodeId, in_array: bool) -> NPath {
        let mut p = self.parents.clone();
        p.push(Link { parent: self.node, key, in_array });
        NPath { node: id, parents: p }
    }
}

/// The parse failure of a file's own source, marked like `parse.mjs` does.
#[derive(Debug, Clone)]
pub struct CodemodError {
    pub message: String,
    pub parse: bool,
    pub line: Option<usize>,
    pub column: Option<usize>,
    /// A codemod outcome (`ManualMigrationRequired` / `RegenerationRequired`).
    pub outcome: Option<Outcome>,
    /// A PostCSS `CssSyntaxError` (its own line/column, 1-based).
    pub css: bool,
}

/// What `outcome.mjs` marks on a thrown error.
#[derive(Debug, Clone)]
pub enum Outcome {
    Manual { line: Option<usize> },
    Regenerate { commands: Vec<String> },
}

impl CodemodError {
    pub fn msg(m: impl Into<String>) -> CodemodError {
        CodemodError { message: m.into(), parse: false, line: None, column: None, outcome: None, css: false }
    }
    /// `throw new ManualMigrationRequired(message, {line})`
    pub fn manual(m: impl Into<String>, line: Option<usize>) -> CodemodError {
        CodemodError { outcome: Some(Outcome::Manual { line }), ..CodemodError::msg(m) }
    }
    /// `throw new RegenerationRequired(message, {commands})`
    pub fn regenerate(m: impl Into<String>, commands: Vec<String>) -> CodemodError {
        CodemodError { outcome: Some(Outcome::Regenerate { commands }), ..CodemodError::msg(m) }
    }
}

pub type TResult = Result<Option<String>, CodemodError>;

pub struct J {
    pub ast: Ast,
    pub root: NodeId,
    pub mode: Mode,
}

pub fn mode_for_path(path: &str) -> Mode {
    if path.ends_with(".tsx") || path.ends_with(".ts") {
        Mode::Babel
    } else {
        Mode::Estree
    }
}

/// `j(file.source)` with the runner's parser for the file.
pub fn parse_file(source: &str, path: &str) -> Result<J, CodemodError> {
    parse_with(source, mode_for_path(path))
}

pub fn parse_with(source: &str, mode: Mode) -> Result<J, CodemodError> {
    let mut ast = Ast::new();
    match recast::parse(&mut ast, source, mode) {
        Ok(p) => Ok(J { ast, root: p.file, mode }),
        Err(e) => Err(CodemodError { message: format!("{} ({}:{})", e.message, e.line, e.column), parse: true, line: Some(e.line), column: Some(e.column), outcome: None, css: false }),
    }
}

impl J {
    pub fn to_source(&self, quote: Option<Quote>) -> String {
        let mut c = Config::default();
        if let Some(q) = quote {
            c.quote = q;
        }
        recast::to_source(&self.ast, self.root, c)
    }
    pub fn to_source_single(&self) -> String {
        self.to_source(Some(Quote::Single))
    }

    pub fn program(&self) -> NodeId {
        self.ast.child(self.root, "program").unwrap()
    }

    /// Every node (pre-order, field order) under `start`, with paths.
    pub fn find_from(&self, start: &NPath, ty: Option<&str>) -> Vec<NPath> {
        let mut out = Vec::new();
        self.walk(start, &mut |p| {
            if ty.map(|t| type_matches(self.ast.ty(p.node), t)).unwrap_or(true) {
                out.push(p.clone());
            }
        });
        out
    }

    /// `root.find(j.Type)`: descendants of the File (the root itself excluded).
    pub fn find(&self, ty: &str) -> Vec<NPath> {
        let root = NPath { node: self.root, parents: vec![] };
        self.find_from(&root, Some(ty)).into_iter().filter(|p| p.node != self.root).collect()
    }

    pub fn find_any(&self, tys: &[&str]) -> Vec<NPath> {
        let root = NPath { node: self.root, parents: vec![] };
        let mut out = Vec::new();
        self.walk(&root, &mut |p| {
            if tys.contains(&self.ast.ty(p.node)) {
                out.push(p.clone());
            }
        });
        out
    }

    /// Descendants of a path (`j(path).find(...)`), excluding itself.
    pub fn find_in(&self, start: &NPath, ty: &str) -> Vec<NPath> {
        self.find_from(start, Some(ty)).into_iter().filter(|p| p.node != start.node).collect()
    }

    pub fn walk(&self, start: &NPath, f: &mut dyn FnMut(&NPath)) {
        f(start);
        let fields: Vec<(&'static str, V)> = self.ast.node(start.node).fields.clone();
        for (k, v) in fields {
            if k == "comments" || k == "extra" {
                continue;
            }
            match v {
                V::Node(c) => {
                    let p = start.child(k, c, false);
                    self.walk(&p, f);
                }
                V::Arr(a) => {
                    for x in a {
                        if let V::Node(c) = x {
                            let p = start.child(k, c, true);
                            self.walk(&p, f);
                        }
                    }
                }
                _ => {}
            }
        }
    }

    /// Replace the node at `p` with `new` in its parent.
    pub fn replace(&mut self, p: &NPath, new: NodeId) {
        self.replace_many(p, vec![new]);
    }

    pub fn replace_many(&mut self, p: &NPath, new: Vec<NodeId>) {
        let l = match p.parents.last() {
            Some(l) => *l,
            None => return,
        };
        let cur = self.ast.get(l.parent, l.key).clone();
        match cur {
            V::Arr(a) => {
                let mut out = Vec::new();
                for x in a {
                    if x.as_node() == Some(p.node) {
                        out.extend(new.iter().map(|n| V::Node(*n)));
                    } else {
                        out.push(x);
                    }
                }
                self.ast.set(l.parent, l.key, V::Arr(out));
            }
            _ => {
                let v = match new.first() {
                    Some(n) => V::Node(*n),
                    None => V::Null,
                };
                self.ast.set(l.parent, l.key, v);
            }
        }
    }

    /// `path.prune()` / `collection.remove()`.
    pub fn remove(&mut self, p: &NPath) {
        self.replace_many(p, vec![]);
        if let Some(pp) = p.parent_path() {
            self.clean_up_after_prune(&pp);
        }
    }

    fn clean_up_after_prune(&mut self, pp: &NPath) {
        let n = pp.node;
        match self.ast.ty(n) {
            "VariableDeclaration" => {
                if self.ast.list(n, "declarations").is_empty() {
                    self.remove(pp);
                }
            }
            "ExpressionStatement" => {
                if self.ast.child(n, "expression").is_none() {
                    self.remove(pp);
                }
            }
            "IfStatement" => {
                // ast-types: a pruned consequent/alternate is fixed up; rare here.
            }
            _ => {}
        }
    }

    pub fn insert_after(&mut self, p: &NPath, new: Vec<NodeId>) {
        let l = match p.parents.last() {
            Some(l) => *l,
            None => return,
        };
        if let V::Arr(a) = self.ast.get(l.parent, l.key).clone() {
            let mut out = Vec::new();
            for x in a {
                let hit = x.as_node() == Some(p.node);
                out.push(x);
                if hit {
                    out.extend(new.iter().map(|n| V::Node(*n)));
                }
            }
            self.ast.set(l.parent, l.key, V::Arr(out));
        }
    }

    pub fn insert_before(&mut self, p: &NPath, new: Vec<NodeId>) {
        let l = match p.parents.last() {
            Some(l) => *l,
            None => return,
        };
        if let V::Arr(a) = self.ast.get(l.parent, l.key).clone() {
            let mut out = Vec::new();
            for x in a {
                if x.as_node() == Some(p.node) {
                    out.extend(new.iter().map(|n| V::Node(*n)));
                }
                out.push(x);
            }
            self.ast.set(l.parent, l.key, V::Arr(out));
        }
    }

    // ---- builders (ast-types shapes) ----

    pub fn b(&mut self, ty: &str, fields: Vec<(&str, V)>) -> NodeId {
        self.ast.new_node(ty, fields)
    }
    pub fn identifier(&mut self, name: &str) -> NodeId {
        self.b("Identifier", vec![("name", V::s(name))])
    }
    pub fn jsx_identifier(&mut self, name: &str) -> NodeId {
        self.b("JSXIdentifier", vec![("name", V::s(name))])
    }
    pub fn string_literal(&mut self, s: &str) -> NodeId {
        self.b("StringLiteral", vec![("value", V::s(s))])
    }
    /// `j.literal(value)`
    pub fn literal_str(&mut self, s: &str) -> NodeId {
        self.b("Literal", vec![("value", V::s(s))])
    }
    pub fn literal_num(&mut self, n: f64) -> NodeId {
        self.b("Literal", vec![("value", V::Num(n))])
    }
    pub fn literal_bool(&mut self, b: bool) -> NodeId {
        self.b("Literal", vec![("value", V::Bool(b))])
    }
    pub fn numeric_literal(&mut self, n: f64) -> NodeId {
        self.b("NumericLiteral", vec![("value", V::Num(n))])
    }
    pub fn boolean_literal(&mut self, b: bool) -> NodeId {
        self.b("BooleanLiteral", vec![("value", V::Bool(b))])
    }
    pub fn jsx_attribute(&mut self, name: &str, value: Option<NodeId>) -> NodeId {
        let n = self.jsx_identifier(name);
        self.b("JSXAttribute", vec![("name", V::Node(n)), ("value", value.map(V::Node).unwrap_or(V::Null))])
    }
    pub fn jsx_expression_container(&mut self, e: NodeId) -> NodeId {
        self.b("JSXExpressionContainer", vec![("expression", V::Node(e))])
    }
    pub fn member(&mut self, obj: NodeId, prop: NodeId, computed: bool) -> NodeId {
        self.b("MemberExpression", vec![("object", V::Node(obj)), ("property", V::Node(prop)), ("computed", V::Bool(computed))])
    }
    pub fn import_specifier(&mut self, imported: &str, local: Option<&str>) -> NodeId {
        let i = self.identifier(imported);
        let l = self.identifier(local.unwrap_or(imported));
        self.b("ImportSpecifier", vec![("imported", V::Node(i)), ("local", V::Node(l))])
    }
    pub fn import_declaration(&mut self, specs: Vec<NodeId>, source: &str) -> NodeId {
        let s = self.literal_str(source);
        self.b("ImportDeclaration", vec![("specifiers", V::Arr(specs.into_iter().map(V::Node).collect())), ("source", V::Node(s))])
    }

    // ---- accessors ----

    pub fn name_of(&self, id: Option<NodeId>) -> Option<String> {
        id.and_then(|n| self.ast.name(n)).map(|s| s.to_string())
    }

    /// A string literal's value (`StringLiteral` or string `Literal`).
    pub fn string_value(&self, id: NodeId) -> Option<String> {
        match self.ast.ty(id) {
            "StringLiteral" | "Literal" => self.ast.str_of(id, "value").map(|s| s.to_string()),
            _ => None,
        }
    }

    pub fn is_string_literal(&self, id: NodeId) -> bool {
        matches!(self.ast.ty(id), "StringLiteral") || (self.ast.is(id, "Literal") && self.ast.str_of(id, "value").is_some())
    }

    pub fn jsx_attr_name(&self, attr: NodeId) -> Option<String> {
        if !self.ast.is(attr, "JSXAttribute") {
            return None;
        }
        let n = self.ast.child(attr, "name")?;
        self.ast.name(n).map(|s| s.to_string())
    }

    pub fn set_name(&mut self, id: NodeId, name: &str) {
        self.ast.set(id, "name", V::s(name));
    }

    // ---- scope (ast-types Scope: Program, functions, catch clauses) ----

    /// The scope node that declares `name`, looking outward from `p`.
    pub fn lookup_scope(&self, p: &NPath, name: &str) -> Option<NodeId> {
        let mut chain: Vec<NodeId> = vec![p.node];
        chain.extend(p.ancestors());
        let mut prev: Option<NodeId> = None;
        for &n in chain.iter() {
            let ty = self.ast.ty(n);
            let is_scope = matches!(ty, "Program" | "CatchClause") || super::recast::types::is_function(ty);
            // a function's own name is bound in the enclosing scope (declarations)
            if is_scope && Some(n) != prev.filter(|_| false) && self.scope_declares(n, name) {
                return Some(n);
            }
            prev = Some(n);
        }
        None
    }

    pub fn is_module_binding(&self, p: &NPath, name: &str) -> bool {
        self.lookup_scope(p, name).map(|n| self.ast.is(n, "Program")).unwrap_or(false)
    }

    pub fn scope_declares(&self, scope: NodeId, name: &str) -> bool {
        let ast = &self.ast;
        let ty = ast.ty(scope);
        if ty == "CatchClause" {
            if let Some(p) = ast.child(scope, "param") {
                return pattern_binds(ast, p, name);
            }
            return false;
        }
        if super::recast::types::is_function(ty) {
            for p in ast.list(scope, "params") {
                if pattern_binds(ast, p, name) {
                    return true;
                }
            }
            if ty == "FunctionExpression" {
                if let Some(id) = ast.child(scope, "id") {
                    if ast.name(id) == Some(name) {
                        return true;
                    }
                }
            }
            if let Some(b) = ast.child(scope, "body") {
                return scan_declares(ast, b, name);
            }
            return false;
        }
        // Program
        for st in ast.list(scope, "body") {
            if scan_declares(ast, st, name) {
                return true;
            }
        }
        false
    }
}

pub fn pattern_binds(ast: &Ast, p: NodeId, name: &str) -> bool {
    match ast.ty(p) {
        "Identifier" => ast.name(p) == Some(name),
        "AssignmentPattern" => ast.child(p, "left").map(|l| pattern_binds(ast, l, name)).unwrap_or(false),
        "RestElement" => ast.child(p, "argument").map(|l| pattern_binds(ast, l, name)).unwrap_or(false),
        "ArrayPattern" => ast.list(p, "elements").into_iter().any(|e| pattern_binds(ast, e, name)),
        "ObjectPattern" => ast.list(p, "properties").into_iter().any(|pr| match ast.ty(pr) {
            "ObjectProperty" | "Property" => ast.child(pr, "value").map(|v| pattern_binds(ast, v, name)).unwrap_or(false),
            _ => pattern_binds(ast, pr, name),
        }),
        "TSParameterProperty" => ast.child(p, "parameter").map(|l| pattern_binds(ast, l, name)).unwrap_or(false),
        _ => false,
    }
}

/// Declarations in a subtree that belong to the enclosing function scope
/// (not descending into nested functions).
fn scan_declares(ast: &Ast, n: NodeId, name: &str) -> bool {
    let ty = ast.ty(n);
    match ty {
        "FunctionDeclaration" | "TSDeclareFunction" => return ast.child(n, "id").map(|i| ast.name(i) == Some(name)).unwrap_or(false),
        "ClassDeclaration" => return ast.child(n, "id").map(|i| ast.name(i) == Some(name)).unwrap_or(false),
        "VariableDeclarator" => {
            if ast.child(n, "id").map(|i| pattern_binds(ast, i, name)).unwrap_or(false) {
                return true;
            }
            return ast.child(n, "init").map(|i| scan_declares(ast, i, name)).unwrap_or(false);
        }
        "ImportSpecifier" | "ImportDefaultSpecifier" | "ImportNamespaceSpecifier" => {
            return ast.child(n, "local").map(|i| ast.name(i) == Some(name)).unwrap_or(false);
        }
        "TSEnumDeclaration" | "TSModuleDeclaration" => return ast.child(n, "id").map(|i| ast.name(i) == Some(name)).unwrap_or(false),
        _ => {}
    }
    if super::recast::types::is_function(ty) || ty == "ClassExpression" || ty == "CatchClause" {
        return false;
    }
    for c in ast.children(n) {
        if scan_declares(ast, c, name) {
            return true;
        }
    }
    false
}

/// `namedTypes[query].check(node)` for the queries the codemods use.
pub fn type_matches(ty: &str, query: &str) -> bool {
    use super::recast::types::*;
    if ty == query {
        return true;
    }
    match query {
        "Literal" => is_literal(ty),
        "Expression" => is_expression(ty),
        "Statement" => is_statement(ty),
        "Function" => is_function(ty),
        "MemberExpression" => ty == "OptionalMemberExpression" || ty == "JSXMemberExpression",
        "CallExpression" => ty == "OptionalCallExpression",
        "Identifier" => ty == "JSXIdentifier",
        "Node" => !is_comment(ty),
        "Comment" => is_comment(ty),
        "Declaration" => is_statement(ty) && !matches!(ty, "ExpressionStatement" | "BlockStatement" | "EmptyStatement" | "IfStatement" | "ReturnStatement" | "ForStatement" | "WhileStatement" | "TryStatement" | "ThrowStatement" | "SwitchStatement" | "LabeledStatement" | "BreakStatement" | "ContinueStatement" | "DoWhileStatement" | "ForInStatement" | "ForOfStatement" | "DebuggerStatement" | "WithStatement"),
        _ => false,
    }
}

/// The token-rename pattern the CSS-variable codemods build: longest first,
/// not followed by an identifier character.
pub fn token_pattern(map: &[(&str, &str)]) -> String {
    let mut keys: Vec<&str> = map.iter().map(|(k, _)| *k).collect();
    keys.sort_by(|a, b| b.encode_utf16().count().cmp(&a.encode_utf16().count()));
    format!("(?:{})(?![a-zA-Z0-9_-])", keys.iter().map(|k| super::jsre::escape(k)).collect::<Vec<_>>().join("|"))
}

pub fn replace_tokens(map: &[(&str, &str)], s: &str) -> String {
    let pat = token_pattern(map);
    super::jsre::replace_fn(&pat, "g", s, |g| {
        let m = g[0].unwrap_or("");
        map.iter().find(|(k, _)| *k == m).map(|(_, v)| v.to_string()).unwrap_or_else(|| m.to_string())
    })
}

impl J {
    /// StringLiteral, string Literal (incl. JSXText) and template quasis.
    pub fn replace_string_tokens(&mut self, map: &[(&str, &str)]) -> bool {
        let mut changed = false;
        let mut targets = self.find("StringLiteral");
        targets.extend(self.find("Literal"));
        for p in targets {
            if let Some(v) = self.ast.str_of(p.node, "value").map(|s| s.to_string()) {
                let r = replace_tokens(map, &v);
                if r != v {
                    self.ast.set(p.node, "value", V::s(&r));
                    changed = true;
                }
            }
        }
        for p in self.find("TemplateLiteral") {
            for q in self.ast.list(p.node, "quasis") {
                let val = self.ast.get(q, "value").clone();
                let raw = val.obj_get("raw").as_str().unwrap_or("").to_string();
                let r = replace_tokens(map, &raw);
                if r != raw {
                    let cooked = val.obj_get("cooked").as_str().map(|c| replace_tokens(map, c));
                    let nv = V::Obj(vec![("raw", V::s(&r)), ("cooked", cooked.map(|c| V::s(&c)).unwrap_or(V::Null))]);
                    self.ast.set(q, "value", nv);
                    changed = true;
                }
            }
        }
        changed
    }
}
