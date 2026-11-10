//! recast `patcher`: find the smallest changed subtrees and splice their
//! new text into the original source.

use super::ast::*;
use super::lines::{concat, Lines, Pos};
use super::path::{PName, Path};
use super::types::*;

pub struct Reprint {
    pub old_path: Path,
    pub new_path: Path,
}

pub struct Patcher {
    pub lines: Lines,
    pub replacements: Vec<(Pos, Pos, Lines)>,
}

impl Patcher {
    pub fn new(lines: Lines) -> Patcher {
        Patcher { lines, replacements: Vec::new() }
    }
    pub fn replace(&mut self, start: Pos, end: Pos, lines: Lines) {
        self.replacements.push((start, end, lines));
    }
    pub fn get(&mut self, start: Pos, end: Pos) -> Lines {
        let mut slice_from = start;
        let mut to_concat = Vec::new();
        self.replacements.sort_by(|a, b| super::lines::compare_pos(a.0, b.0));
        for (rs, re, rl) in &self.replacements {
            if super::lines::compare_pos(slice_from, *rs).is_gt() {
                // overlapping replacement: ignored
            } else {
                to_concat.push(self.lines.slice(slice_from, *rs));
                to_concat.push(rl.clone());
                slice_from = *re;
            }
        }
        to_concat.push(self.lines.slice(slice_from, end));
        concat(&to_concat)
    }
}

/// Equality of leaf values with ast-types defaults: a missing field equals
/// null or false.
fn defaultish(v: &V) -> bool {
    matches!(v, V::Undef | V::Null | V::Bool(false))
}

pub fn find_reprints(ast: &Ast, new_path: &mut Path, reprints: &mut Vec<Reprint>) -> bool {
    let new_node = new_path.value().as_node().unwrap();
    let old_node = match ast.node(new_node).original {
        Some(o) => o,
        None => return false,
    };
    if ast.ty(new_node) != ast.ty(old_node) {
        return false;
    }
    let mut old_path = Path::new(V::Node(old_node));
    let ok = find_child_reprints(ast, new_path, &mut old_path, reprints);
    if !ok {
        reprints.clear();
    }
    ok
}

fn find_any_reprints(ast: &Ast, new_path: &mut Path, old_path: &mut Path, key: Option<&str>, reprints: &mut Vec<Reprint>) -> bool {
    let nv = new_path.value().clone();
    let ov = old_path.value().clone();
    match (&nv, &ov) {
        (V::Node(a), V::Node(b)) if a == b => return true,
        _ => {}
    }
    match &nv {
        V::Arr(_) => find_array_reprints(ast, new_path, old_path, reprints),
        V::Node(_) | V::Obj(_) => find_object_reprints(ast, new_path, old_path, reprints),
        _ => {
            // primitives: ===, with ast-types field defaults for def fields
            match (&nv, &ov) {
                (V::Str(a), V::Str(b)) => a == b,
                (V::Num(a), V::Num(b)) => a == b,
                (V::Bool(a), V::Bool(b)) => a == b,
                (V::Null, V::Null) | (V::Undef, V::Undef) => true,
                _ => {
                    let nodefault = matches!(key, Some("start") | Some("end") | Some("extra"));
                    !nodefault && defaultish(&nv) && defaultish(&ov)
                }
            }
        }
    }
}

pub fn find_array_reprints(ast: &Ast, new_path: &mut Path, old_path: &mut Path, reprints: &mut Vec<Reprint>) -> bool {
    let na = match new_path.value() {
        V::Arr(a) => a.clone(),
        _ => return false,
    };
    let oa = match old_path.value() {
        V::Arr(a) => a.clone(),
        _ => return false,
    };
    if na.len() != oa.len() {
        return false;
    }
    for i in 0..na.len() {
        new_path.push(PName::Idx(i), na[i].clone());
        old_path.push(PName::Idx(i), oa[i].clone());
        let ok = find_any_reprints(ast, new_path, old_path, None, reprints);
        new_path.pop();
        old_path.pop();
        if !ok {
            return false;
        }
    }
    true
}

fn find_object_reprints(ast: &Ast, new_path: &mut Path, old_path: &mut Path, reprints: &mut Vec<Reprint>) -> bool {
    let nv = new_path.value().clone();
    let ov = old_path.value().clone();
    match (&nv, &ov) {
        (V::Node(n), V::Node(o)) => {
            let (n, o) = (*n, *o);
            if n == o {
                return true;
            }
            if ast.ty(n) == ast.ty(o) {
                let mut child = Vec::new();
                if find_child_reprints(ast, new_path, old_path, &mut child) {
                    reprints.extend(child);
                } else if ast.node(o).loc.is_some() {
                    reprints.push(Reprint { old_path: old_path.clone(), new_path: new_path.clone() });
                } else {
                    return false;
                }
                return true;
            }
            if is_expression(ast.ty(n)) && is_expression(ast.ty(o)) && ast.node(o).loc.is_some() {
                reprints.push(Reprint { old_path: old_path.clone(), new_path: new_path.clone() });
                return true;
            }
            false
        }
        (V::Obj(_), V::Obj(_)) => find_child_reprints(ast, new_path, old_path, reprints),
        _ => false,
    }
}

fn keys_of(ast: &Ast, v: &V) -> Vec<&'static str> {
    match v {
        V::Node(n) => {
            let node = ast.node(*n);
            let mut k: Vec<&'static str> = vec!["type"];
            if node.start.is_some() {
                k.push("start");
            }
            if node.end.is_some() {
                k.push("end");
            }
            k.extend(node.fields.iter().map(|(kk, _)| *kk));
            k
        }
        V::Obj(o) => o.iter().map(|(k, _)| *k).collect(),
        _ => vec![],
    }
}

fn field_value(ast: &Ast, v: &V, k: &str) -> V {
    match v {
        V::Node(n) => {
            let node = ast.node(*n);
            match k {
                "type" => V::s(node.ty),
                "start" => node.start.map(V::Num).unwrap_or(V::Undef),
                "end" => node.end.map(V::Num).unwrap_or(V::Undef),
                _ => ast.get(*n, k).clone(),
            }
        }
        V::Obj(_) => v.obj_get(k).clone(),
        _ => V::Undef,
    }
}

fn find_child_reprints(ast: &Ast, new_path: &mut Path, old_path: &mut Path, reprints: &mut Vec<Reprint>) -> bool {
    let nv = new_path.value().clone();
    let ov = old_path.value().clone();
    if new_path.needs_parens(ast, false, None) && !old_path.has_parens(ast) {
        return false;
    }
    let mut keys = keys_of(ast, &ov);
    for k in keys_of(ast, &nv) {
        if !keys.contains(&k) {
            keys.push(k);
        }
    }
    let original_count = reprints.len();
    for k in keys {
        if k.starts_with('_') {
            continue;
        }
        let a = field_value(ast, &nv, k);
        let b = field_value(ast, &ov, k);
        new_path.push(PName::Key(k), a);
        old_path.push(PName::Key(k), b);
        let ok = find_any_reprints(ast, new_path, old_path, Some(k), reprints);
        new_path.pop();
        old_path.pop();
        if !ok {
            return false;
        }
    }
    if let Some(n) = new_path.node(ast) {
        if ast.is(n, "ReturnStatement") && reprints.len() > original_count {
            return false;
        }
    }
    true
}
