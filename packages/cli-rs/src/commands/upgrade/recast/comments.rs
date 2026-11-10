//! recast `comments.attach`: hang each comment on a node as leading,
//! trailing or dangling, in the node's `comments` field.

use super::ast::*;
use super::lines::{compare_pos, Lines};
use std::collections::HashMap;

fn sorted_child_nodes(ast: &Ast, node: NodeId, cache: &mut HashMap<NodeId, Vec<NodeId>>) -> Vec<NodeId> {
    if let Some(c) = cache.get(&node) {
        return c.clone();
    }
    let mut result: Vec<NodeId> = Vec::new();
    for (k, v) in &ast.node(node).fields {
        if *k == "comments" {
            continue;
        }
        collect_into(ast, v, &mut result);
    }
    cache.insert(node, result.clone());
    result
}

fn collect_into(ast: &Ast, v: &V, result: &mut Vec<NodeId>) {
    match v {
        V::Node(n) => {
            let n = *n;
            if let Some(loc) = &ast.node(n).loc {
                let mut i = result.len() as isize - 1;
                while i >= 0 {
                    let child = result[i as usize];
                    if let Some(cl) = &ast.node(child).loc {
                        if compare_pos(cl.end, loc.start).is_le() {
                            break;
                        }
                    }
                    i -= 1;
                }
                result.insert((i + 1) as usize, n);
            } else {
                for (k, v) in &ast.node(n).fields {
                    if *k == "comments" {
                        continue;
                    }
                    collect_into(ast, v, result);
                }
            }
        }
        V::Arr(a) => {
            for x in a {
                collect_into(ast, x, result);
            }
        }
        _ => {}
    }
}

#[derive(Default, Clone)]
struct Deco {
    preceding: Option<NodeId>,
    enclosing: Option<NodeId>,
    following: Option<NodeId>,
}

fn decorate(ast: &Ast, node: NodeId, comment: NodeId, d: &mut Deco, cache: &mut HashMap<NodeId, Vec<NodeId>>) {
    let children = sorted_child_nodes(ast, node, cache);
    let cl = ast.node(comment).loc.clone().unwrap();
    let mut left = 0usize;
    let mut right = children.len();
    let mut preceding = None;
    let mut following = None;
    while left < right {
        let middle = (left + right) >> 1;
        let child = children[middle];
        let chl = ast.node(child).loc.clone().unwrap();
        if compare_pos(chl.start, cl.start).is_le() && compare_pos(cl.end, chl.end).is_le() {
            d.enclosing = Some(child);
            decorate(ast, child, comment, d, cache);
            return;
        }
        if compare_pos(chl.end, cl.start).is_le() {
            preceding = Some(child);
            left = middle + 1;
            continue;
        }
        if compare_pos(cl.end, chl.start).is_le() {
            following = Some(child);
            right = middle;
            continue;
        }
        // Overlap: recast throws. Treat as enclosing-less.
        break;
    }
    if preceding.is_some() {
        d.preceding = preceding;
    }
    if following.is_some() {
        d.following = following;
    }
}

fn add_comment(ast: &mut Ast, node: NodeId, comment: NodeId, leading: bool, trailing: bool) {
    ast.set(comment, "leading", V::Bool(leading));
    ast.set(comment, "trailing", V::Bool(trailing));
    let mut list = match ast.get(node, "comments") {
        V::Arr(a) => a.clone(),
        _ => Vec::new(),
    };
    list.push(V::Node(comment));
    ast.set(node, "comments", V::Arr(list));
}

pub fn attach(ast: &mut Ast, comments: &[NodeId], root: NodeId, lines: &Lines) {
    let mut cache = HashMap::new();
    let mut ties: Vec<(NodeId, Deco)> = Vec::new();
    for &c in comments {
        let mut d = Deco::default();
        decorate(ast, root, c, &mut d, &mut cache);
        match (d.preceding, d.following) {
            (Some(_), Some(f)) => {
                if let Some(last) = ties.last() {
                    if last.1.following != Some(f) {
                        break_ties(ast, &mut ties, lines);
                    }
                }
                ties.push((c, d));
            }
            (Some(p), None) => {
                break_ties(ast, &mut ties, lines);
                add_comment(ast, p, c, false, true);
            }
            (None, Some(f)) => {
                break_ties(ast, &mut ties, lines);
                add_comment(ast, f, c, true, false);
            }
            (None, None) => {
                break_ties(ast, &mut ties, lines);
                let en = d.enclosing.unwrap_or(root);
                add_comment(ast, en, c, false, false);
            }
        }
    }
    break_ties(ast, &mut ties, lines);
}

fn break_ties(ast: &mut Ast, ties: &mut Vec<(NodeId, Deco)>, lines: &Lines) {
    let n = ties.len();
    if n == 0 {
        return;
    }
    let pn = ties[0].1.preceding.unwrap();
    let fnode = ties[0].1.following.unwrap();
    let mut gap_end = ast.node(fnode).loc.clone().unwrap().start;
    let mut idx = n;
    while idx > 0 {
        let c = ties[idx - 1].0;
        let cl = ast.node(c).loc.clone().unwrap();
        let gap = lines.slice_string(cl.end, gap_end, &Default::default());
        if gap.chars().any(|ch| !super::lines::is_ws_unit(ch as u32 as u16) || (ch as u32) > 0xffff) {
            break;
        }
        gap_end = cl.start;
        idx -= 1;
    }
    let f_col = ast.node(fnode).loc.clone().unwrap().start.column;
    while idx <= n && idx < n {
        let c = ties[idx].0;
        if ast.ty(c) == "CommentLine" && ast.node(c).loc.clone().unwrap().start.column > f_col {
            idx += 1;
        } else {
            break;
        }
    }
    if idx > 0 {
        if let Some(en) = ties[idx - 1].1.enclosing {
            if ast.ty(en) == "CallExpression" {
                idx -= 1;
            }
        }
    }
    let list: Vec<NodeId> = ties.iter().map(|t| t.0).collect();
    for (i, c) in list.into_iter().enumerate() {
        if i < idx {
            add_comment(ast, pn, c, false, true);
        } else {
            add_comment(ast, fnode, c, true, false);
        }
    }
    ties.clear();
}
