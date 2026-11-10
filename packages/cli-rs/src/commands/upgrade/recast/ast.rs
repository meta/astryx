//! A Babel-shaped AST in an arena, with recast's `original` links and
//! source locations.

use super::lines::{Lines, Pos};
use std::rc::Rc;

pub type NodeId = usize;

#[derive(Clone, Debug)]
pub enum V {
    Undef,
    Null,
    Bool(bool),
    Num(f64),
    Str(Rc<str>),
    Node(NodeId),
    Arr(Vec<V>),
    Obj(Vec<(&'static str, V)>),
}

impl V {
    pub fn s(s: &str) -> V {
        V::Str(Rc::from(s))
    }
    pub fn as_node(&self) -> Option<NodeId> {
        if let V::Node(n) = self {
            Some(*n)
        } else {
            None
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        if let V::Str(s) = self {
            Some(s)
        } else {
            None
        }
    }
    pub fn as_bool(&self) -> bool {
        match self {
            V::Bool(b) => *b,
            V::Undef | V::Null => false,
            V::Num(n) => *n != 0.0 && !n.is_nan(),
            V::Str(s) => !s.is_empty(),
            _ => true,
        }
    }
    pub fn as_num(&self) -> Option<f64> {
        if let V::Num(n) = self {
            Some(*n)
        } else {
            None
        }
    }
    pub fn as_arr(&self) -> Option<&Vec<V>> {
        if let V::Arr(a) = self {
            Some(a)
        } else {
            None
        }
    }
    pub fn is_nullish(&self) -> bool {
        matches!(self, V::Undef | V::Null)
    }
    pub fn obj_get(&self, k: &str) -> &V {
        if let V::Obj(o) = self {
            for (kk, v) in o {
                if *kk == k {
                    return v;
                }
            }
        }
        &V::Undef
    }
}

#[derive(Clone, Debug)]
pub struct Loc {
    pub start: Pos,
    pub end: Pos,
    pub indent: usize,
    /// Token indexes are not modelled; prev/next tokens come from the text.
    pub lines_id: usize,
}

#[derive(Clone, Debug)]
pub struct Node {
    pub ty: &'static str,
    pub fields: Vec<(&'static str, V)>,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub loc: Option<Loc>,
    pub original: Option<NodeId>,
}

pub fn intern(s: &str) -> &'static str {
    use std::cell::RefCell;
    use std::collections::HashSet;
    thread_local! {
        static SET: RefCell<HashSet<&'static str>> = RefCell::new(HashSet::new());
    }
    SET.with(|set| {
        let mut set = set.borrow_mut();
        if let Some(s) = set.get(s) {
            return *s;
        }
        let leaked: &'static str = Box::leak(s.to_string().into_boxed_str());
        set.insert(leaked);
        leaked
    })
}

pub struct Ast {
    pub nodes: Vec<Node>,
    /// Lines of each parsed source (index = Loc::lines_id).
    pub lines: Vec<Rc<Lines>>,
    /// Normalized source (what the parser saw) as UTF-16, per lines_id.
    pub sources: Vec<Rc<Vec<u16>>>,
    /// Comment spans (UTF-16 offsets) per lines_id, sorted.
    pub comment_spans: Vec<Rc<Vec<(usize, usize)>>>,
}

impl Ast {
    pub fn new() -> Ast {
        Ast { nodes: Vec::new(), lines: Vec::new(), sources: Vec::new(), comment_spans: Vec::new() }
    }

    pub fn node(&self, id: NodeId) -> &Node {
        &self.nodes[id]
    }
    pub fn node_mut(&mut self, id: NodeId) -> &mut Node {
        &mut self.nodes[id]
    }
    pub fn ty(&self, id: NodeId) -> &'static str {
        self.nodes[id].ty
    }
    pub fn is(&self, id: NodeId, ty: &str) -> bool {
        self.nodes[id].ty == ty
    }

    pub fn get(&self, id: NodeId, k: &str) -> &V {
        for (kk, v) in &self.nodes[id].fields {
            if *kk == k {
                return v;
            }
        }
        &V::Undef
    }
    pub fn has(&self, id: NodeId, k: &str) -> bool {
        self.nodes[id].fields.iter().any(|(kk, _)| *kk == k)
    }
    pub fn child(&self, id: NodeId, k: &str) -> Option<NodeId> {
        self.get(id, k).as_node()
    }
    pub fn str_of(&self, id: NodeId, k: &str) -> Option<&str> {
        self.get(id, k).as_str()
    }
    pub fn flag(&self, id: NodeId, k: &str) -> bool {
        self.get(id, k).as_bool()
    }
    pub fn list(&self, id: NodeId, k: &str) -> Vec<NodeId> {
        match self.get(id, k) {
            V::Arr(a) => a.iter().filter_map(|v| v.as_node()).collect(),
            _ => Vec::new(),
        }
    }
    /// Array items including holes (None).
    pub fn list_opt(&self, id: NodeId, k: &str) -> Vec<Option<NodeId>> {
        match self.get(id, k) {
            V::Arr(a) => a.iter().map(|v| v.as_node()).collect(),
            _ => Vec::new(),
        }
    }
    pub fn set(&mut self, id: NodeId, k: &str, v: V) {
        let k = intern(k);
        let n = &mut self.nodes[id];
        for (kk, vv) in n.fields.iter_mut() {
            if *kk == k {
                *vv = v;
                return;
            }
        }
        n.fields.push((k, v));
    }
    pub fn set_node(&mut self, id: NodeId, k: &str, child: NodeId) {
        self.set(id, k, V::Node(child));
    }
    pub fn set_list(&mut self, id: NodeId, k: &str, items: Vec<NodeId>) {
        self.set(id, k, V::Arr(items.into_iter().map(V::Node).collect()));
    }
    pub fn delete(&mut self, id: NodeId, k: &str) {
        self.nodes[id].fields.retain(|(kk, _)| *kk != k);
    }

    pub fn extra(&self, id: NodeId, k: &str) -> &V {
        self.get(id, "extra").obj_get(k)
    }
    pub fn set_extra(&mut self, id: NodeId, k: &'static str, v: V) {
        let mut ex = match self.get(id, "extra") {
            V::Obj(o) => o.clone(),
            _ => Vec::new(),
        };
        if let Some(e) = ex.iter_mut().find(|(kk, _)| *kk == k) {
            e.1 = v;
        } else {
            ex.push((k, v));
        }
        self.set(id, "extra", V::Obj(ex));
    }

    /// A brand-new node, as an ast-types builder makes it.
    pub fn new_node(&mut self, ty: &str, fields: Vec<(&str, V)>) -> NodeId {
        let id = self.nodes.len();
        self.nodes.push(Node {
            ty: intern(ty),
            fields: fields.into_iter().map(|(k, v)| (intern(k), v)).collect(),
            start: None,
            end: None,
            loc: None,
            original: None,
        });
        id
    }

    pub fn name(&self, id: NodeId) -> Option<&str> {
        self.str_of(id, "name")
    }

    /// Deep copy (`TreeCopier.copy`): every node gets `original` = source.
    pub fn deep_copy_with_original(&mut self, root: NodeId) -> NodeId {
        let mut map = std::collections::HashMap::new();
        self.copy_rec(root, &mut map)
    }

    fn copy_rec(&mut self, id: NodeId, map: &mut std::collections::HashMap<NodeId, NodeId>) -> NodeId {
        if let Some(&c) = map.get(&id) {
            return c;
        }
        let new_id = self.nodes.len();
        let mut n = self.nodes[id].clone();
        n.original = Some(id);
        self.nodes.push(n);
        map.insert(id, new_id);
        let fields = self.nodes[id].fields.clone();
        let mut out = Vec::with_capacity(fields.len());
        for (k, v) in fields {
            out.push((k, self.copy_v(&v, map)));
        }
        self.nodes[new_id].fields = out;
        new_id
    }

    fn copy_v(&mut self, v: &V, map: &mut std::collections::HashMap<NodeId, NodeId>) -> V {
        match v {
            V::Node(c) => V::Node(self.copy_rec(*c, map)),
            V::Arr(a) => V::Arr(a.iter().map(|x| self.copy_v(x, map)).collect()),
            V::Obj(o) => V::Obj(o.iter().map(|(k, x)| (*k, self.copy_v(x, map))).collect()),
            other => other.clone(),
        }
    }

    /// Plain deep clone of a subtree (fresh nodes, no `original` links kept
    /// beyond what the nodes carry). Used where a transform builds a node
    /// from an existing one by JSON-ish copying.
    pub fn clone_subtree(&mut self, id: NodeId) -> NodeId {
        let new_id = self.nodes.len();
        let n = self.nodes[id].clone();
        self.nodes.push(n);
        let fields = self.nodes[id].fields.clone();
        let mut out = Vec::new();
        for (k, v) in fields {
            out.push((k, self.clone_v(&v)));
        }
        self.nodes[new_id].fields = out;
        new_id
    }
    fn clone_v(&mut self, v: &V) -> V {
        match v {
            V::Node(c) => V::Node(self.clone_subtree(*c)),
            V::Arr(a) => V::Arr(a.iter().map(|x| self.clone_v(x)).collect()),
            V::Obj(o) => V::Obj(o.iter().map(|(k, x)| (*k, self.clone_v(x))).collect()),
            other => other.clone(),
        }
    }

    /// Child node ids in field order (arrays flattened).
    pub fn children(&self, id: NodeId) -> Vec<NodeId> {
        let mut out = Vec::new();
        for (k, v) in &self.nodes[id].fields {
            if *k == "comments" {
                continue;
            }
            collect_nodes(v, &mut out);
        }
        out
    }
}

pub fn collect_nodes(v: &V, out: &mut Vec<NodeId>) {
    match v {
        V::Node(n) => out.push(*n),
        V::Arr(a) => {
            for x in a {
                collect_nodes(x, out);
            }
        }
        _ => {}
    }
}

impl Default for Ast {
    fn default() -> Self {
        Ast::new()
    }
}
