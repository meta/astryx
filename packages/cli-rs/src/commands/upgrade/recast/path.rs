//! recast `FastPath`: a stack of (name, value) pairs from the root down.

use super::ast::*;
use super::types::*;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PName {
    Root,
    Key(&'static str),
    Idx(usize),
}

#[derive(Clone)]
pub struct Path {
    pub stack: Vec<(PName, V)>,
}

fn is_node(ast: &Ast, v: &V) -> Option<NodeId> {
    match v {
        V::Node(n) if !is_comment(ast.ty(*n)) => Some(*n),
        _ => None,
    }
}

impl Path {
    pub fn new(v: V) -> Path {
        Path { stack: vec![(PName::Root, v)] }
    }
    pub fn value(&self) -> &V {
        &self.stack.last().unwrap().1
    }
    pub fn name(&self) -> PName {
        self.stack.last().unwrap().0
    }
    pub fn push(&mut self, name: PName, v: V) {
        self.stack.push((name, v));
    }
    pub fn pop(&mut self) {
        self.stack.pop();
    }
    pub fn get_node(&self, ast: &Ast, count: usize) -> Option<NodeId> {
        let mut c = count as isize;
        for (_, v) in self.stack.iter().rev() {
            if let Some(n) = is_node(ast, v) {
                c -= 1;
                if c < 0 {
                    return Some(n);
                }
            }
        }
        None
    }
    pub fn node(&self, ast: &Ast) -> Option<NodeId> {
        self.get_node(ast, 0)
    }
    pub fn parent_node(&self, ast: &Ast) -> Option<NodeId> {
        self.get_node(ast, 1)
    }
    pub fn root_value(&self) -> &V {
        &self.stack[0].1
    }

    pub fn needs_parens(&self, ast: &Ast, assume_expr: bool, override_unparen: Option<NodeId>) -> bool {
        let node = match self.node(ast) {
            Some(n) => n,
            None => return false,
        };
        let nty = ast.ty(node);
        if nty == "AssignmentExpression" {
            if let Some(l) = ast.child(node, "left") {
                if ast.is(l, "ObjectPattern") {
                    return true;
                }
            }
        }
        let parent = self.parent_node(ast);
        let name = self.name();
        if self.value().as_node() != Some(node) {
            return false;
        }
        if is_statement(nty) {
            return false;
        }
        if nty == "Identifier" {
            return false;
        }
        if let Some(p) = parent {
            if ast.is(p, "ParenthesizedExpression") {
                return false;
            }
        }
        if ast.extra(node, "parenthesized").as_bool() && override_unparen != Some(node) {
            return true;
        }
        let parent = match parent {
            Some(p) => p,
            None => return false,
        };
        let pty = ast.ty(parent);
        let is_field = |k: &str| name == PName::Key(intern(k)) && ast.child(parent, k) == Some(node);
        if nty == "UnaryExpression" && pty == "BinaryExpression" && is_field("left") && ast.str_of(parent, "operator") == Some("**") {
            return true;
        }
        if pty == "TaggedTemplateExpression" && is_field("tag") {
            if matches!(
                nty,
                "UnaryExpression" | "UpdateExpression" | "BinaryExpression" | "LogicalExpression" | "ConditionalExpression" | "AssignmentExpression" | "AwaitExpression" | "YieldExpression" | "ArrowFunctionExpression"
            ) {
                return true;
            }
        }
        match nty {
            "UnaryExpression" | "SpreadElement" | "SpreadProperty" => {
                return is_member(pty) && is_field("object");
            }
            "UpdateExpression" => {
                return match pty {
                    "MemberExpression" => is_field("object"),
                    "CallExpression" | "NewExpression" => is_field("callee"),
                    _ => false,
                };
            }
            "BinaryExpression" | "LogicalExpression" => match pty {
                "CallExpression" | "OptionalCallExpression" => return is_field("callee"),
                "UnaryExpression" | "SpreadElement" | "SpreadProperty" => return true,
                "MemberExpression" | "OptionalMemberExpression" => return is_field("object"),
                "BinaryExpression" | "LogicalExpression" => {
                    let po = ast.str_of(parent, "operator").unwrap_or("");
                    let no = ast.str_of(node, "operator").unwrap_or("");
                    let pp = precedence(po);
                    let np = precedence(no);
                    if pp > np {
                        return true;
                    }
                    if pp == np {
                        if po == "**" {
                            return name == PName::Key("left");
                        }
                        if name == PName::Key("right") {
                            return true;
                        }
                    }
                }
                _ => return false,
            },
            "SequenceExpression" => {
                return match pty {
                    "ReturnStatement" | "ForStatement" => false,
                    "ExpressionStatement" => name != PName::Key("expression"),
                    _ => true,
                };
            }
            "Literal" => {
                return pty == "MemberExpression" && ast.get(node, "value").as_num().is_some() && is_field("object");
            }
            "NumericLiteral" => return pty == "MemberExpression" && is_field("object"),
            "YieldExpression" | "AwaitExpression" | "AssignmentExpression" | "ConditionalExpression" => {
                return match pty {
                    "UnaryExpression" | "SpreadElement" | "SpreadProperty" | "BinaryExpression" | "LogicalExpression" => true,
                    "CallExpression" | "OptionalCallExpression" | "NewExpression" => is_field("callee"),
                    "ConditionalExpression" => is_field("test"),
                    "MemberExpression" | "OptionalMemberExpression" => is_field("object"),
                    _ => false,
                };
            }
            "ArrowFunctionExpression" => {
                if is_call(pty) && is_field("callee") {
                    return true;
                }
                if is_member(pty) && is_field("object") {
                    return true;
                }
                if pty == "TSAsExpression" && is_field("expression") {
                    return true;
                }
                return is_binary(pty);
            }
            "ObjectExpression" => {
                if pty == "ArrowFunctionExpression" && is_field("body") {
                    return true;
                }
            }
            "TSAsExpression" => {
                if pty == "ArrowFunctionExpression" && is_field("body") {
                    if let Some(e) = ast.child(node, "expression") {
                        if ast.is(e, "ObjectExpression") {
                            return true;
                        }
                    }
                }
            }
            "CallExpression" => {
                if name == PName::Key("declaration") && pty == "ExportDefaultDeclaration" {
                    if let Some(c) = ast.child(node, "callee") {
                        if ast.is(c, "FunctionExpression") {
                            return true;
                        }
                    }
                }
            }
            _ => {}
        }
        if pty == "NewExpression" && is_field("callee") {
            return contains_call(ast, node);
        }
        if !assume_expr && !self.can_be_first_in_statement(ast) && self.first_in_statement(ast) {
            return true;
        }
        false
    }

    pub fn can_be_first_in_statement(&self, ast: &Ast) -> bool {
        match self.node(ast) {
            Some(n) => !matches!(ast.ty(n), "FunctionExpression" | "ObjectExpression" | "ClassExpression"),
            None => true,
        }
    }

    pub fn first_in_statement(&self, ast: &Ast) -> bool {
        let s = &self.stack;
        let mut parent_name = PName::Root;
        let mut parent: Option<NodeId> = None;
        let mut child_name;
        let mut child: Option<NodeId>;
        let mut i = s.len() as isize - 1;
        // childName starts undefined
        let mut cn: Option<PName> = None;
        let _ = &mut cn;
        child_name = PName::Root;
        child = None;
        while i >= 0 {
            let (nm, v) = &s[i as usize];
            if let Some(n) = is_node(ast, v) {
                child_name = parent_name;
                child = parent;
                parent_name = *nm;
                parent = Some(n);
            }
            if parent.is_none() || child.is_none() {
                i -= 1;
                continue;
            }
            let p = parent.unwrap();
            let pty = ast.ty(p);
            if pty == "BlockStatement" && parent_name == PName::Key("body") && child_name == PName::Idx(0) {
                return true;
            }
            if pty == "ExpressionStatement" && child_name == PName::Key("expression") {
                return true;
            }
            if pty == "AssignmentExpression" && child_name == PName::Key("left") {
                return true;
            }
            if pty == "ArrowFunctionExpression" && child_name == PName::Key("body") {
                return true;
            }
            if pty == "SequenceExpression" && (i as usize + 1) < s.len() && s[i as usize + 1].0 == PName::Key("expressions") && child_name == PName::Idx(0) {
                i -= 1;
                continue;
            }
            if is_call(pty) && child_name == PName::Key("callee") {
                i -= 1;
                continue;
            }
            if is_member(pty) && child_name == PName::Key("object") {
                i -= 1;
                continue;
            }
            if pty == "ConditionalExpression" && child_name == PName::Key("test") {
                i -= 1;
                continue;
            }
            if is_binary(pty) && child_name == PName::Key("left") {
                i -= 1;
                continue;
            }
            if pty == "UnaryExpression" && !ast.flag(p, "prefix") && child_name == PName::Key("argument") {
                i -= 1;
                continue;
            }
            return false;
        }
        true
    }

    /// Whether the node is wrapped in parentheses in its source text.
    pub fn has_parens(&self, ast: &Ast) -> bool {
        let node = match self.node(ast) {
            Some(n) => n,
            None => return false,
        };
        let (prev, next) = match (prev_token(ast, node, self), next_token(ast, node, self)) {
            (Some(p), Some(n)) => (p, n),
            _ => return false,
        };
        if prev == b'(' as u16 {
            if next == b')' as u16 {
                return true;
            }
            let just = !self.can_be_first_in_statement(ast) && self.first_in_statement(ast) && !self.needs_parens(ast, true, None);
            if just {
                return true;
            }
        }
        false
    }
}

fn root_start_end(ast: &Ast, path: &Path) -> Option<(usize, usize)> {
    let r = path.root_value().as_node()?;
    let n = ast.node(r);
    Some((n.start? as usize, n.end? as usize))
}

/// The first character of the previous non-comment token before `node`.
pub fn prev_token(ast: &Ast, node: NodeId, path: &Path) -> Option<u16> {
    let n = ast.node(node);
    let loc = n.loc.as_ref()?;
    let src = &ast.sources[loc.lines_id];
    let spans = &ast.comment_spans[loc.lines_id];
    let mut i = n.start? as usize;
    'outer: loop {
        while i > 0 && super::lines::is_ws_unit(src[i - 1]) {
            i -= 1;
        }
        if i == 0 {
            return None;
        }
        for &(s, e) in spans.iter() {
            if e == i {
                i = s;
                continue 'outer;
            }
        }
        break;
    }
    let (rs, _) = root_start_end(ast, path)?;
    if i - 1 < rs {
        return None;
    }
    Some(src[i - 1])
}

pub fn next_token(ast: &Ast, node: NodeId, path: &Path) -> Option<u16> {
    let n = ast.node(node);
    let loc = n.loc.as_ref()?;
    let src = &ast.sources[loc.lines_id];
    let spans = &ast.comment_spans[loc.lines_id];
    let mut i = n.end? as usize;
    'outer: loop {
        while i < src.len() && super::lines::is_ws_unit(src[i]) {
            i += 1;
        }
        if i >= src.len() {
            return None;
        }
        for &(s, e) in spans.iter() {
            if s == i {
                i = e;
                continue 'outer;
            }
        }
        break;
    }
    let (_, re) = root_start_end(ast, path)?;
    if i + 1 > re {
        return None;
    }
    Some(src[i])
}

pub fn precedence(op: &str) -> i32 {
    match op {
        "??" => 0,
        "||" => 1,
        "&&" => 2,
        "|" => 3,
        "^" => 4,
        "&" => 5,
        "==" | "===" | "!=" | "!==" => 6,
        "<" | ">" | "<=" | ">=" | "in" | "instanceof" => 7,
        ">>" | "<<" | ">>>" => 8,
        "+" | "-" => 9,
        "*" | "/" | "%" => 10,
        "**" => 11,
        _ => -100,
    }
}

fn contains_call(ast: &Ast, node: NodeId) -> bool {
    if ast.is(node, "CallExpression") {
        return true;
    }
    ast.children(node).into_iter().any(|c| contains_call(ast, c))
}
