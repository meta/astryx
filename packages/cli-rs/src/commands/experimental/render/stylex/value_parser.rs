//! Port of postcss-value-parser 4.2.0 (parse, stringify, walk, unit), the
//! value reader StyleX normalizes CSS values with.

#[derive(Debug, Clone, PartialEq)]
pub enum Kind {
    Word,
    Space,
    Str,
    Comment,
    Div,
    Function,
    UnicodeRange,
}

#[derive(Debug, Clone)]
pub struct Node {
    pub kind: Kind,
    pub value: String,
    pub before: String,
    pub after: String,
    pub quote: String,
    pub unclosed: bool,
    pub nodes: Vec<Node>,
    pub source_index: usize,
    pub source_end_index: usize,
}

impl Node {
    fn new(kind: Kind, value: String, source_index: usize, source_end_index: usize) -> Node {
        Node { kind, value, before: String::new(), after: String::new(), quote: String::new(), unclosed: false, nodes: vec![], source_index, source_end_index }
    }
}

const OPEN: u32 = '(' as u32;
const CLOSE: u32 = ')' as u32;
const SQ: u32 = '\'' as u32;
const DQ: u32 = '"' as u32;
const BS: u32 = '\\' as u32;
const SLASH: u32 = '/' as u32;
const COMMA: u32 = ',' as u32;
const COLON: u32 = ':' as u32;
const STAR: u32 = '*' as u32;

/// `parse(input)`.
pub fn parse(input: &str) -> Vec<Node> {
    let mut v: Vec<char> = input.chars().collect();
    let max = v.len();
    let at = |v: &Vec<char>, i: usize| -> u32 { v.get(i).map(|c| *c as u32).unwrap_or(u32::MAX) };
    // u32::MAX stands for NaN: every comparison false, and `<= 32` false.
    let le32 = |c: u32| c != u32::MAX && c <= 32;
    let slice = |v: &Vec<char>, a: usize, b: usize| -> String { v[a.min(v.len())..b.min(v.len())].iter().collect() };
    let index_of = |v: &Vec<char>, ch: char, from: usize| -> Option<usize> { (from..v.len()).find(|&i| v[i] == ch) };
    // A stack of node paths: each frame is the function node being filled.
    let mut root: Vec<Node> = vec![];
    let mut path: Vec<usize> = vec![];
    fn tokens_at<'a>(root: &'a mut Vec<Node>, path: &[usize]) -> &'a mut Vec<Node> {
        let mut cur = root;
        for &i in path {
            cur = &mut cur[i].nodes;
        }
        cur
    }
    fn node_at<'a>(root: &'a mut Vec<Node>, path: &[usize]) -> &'a mut Node {
        let (last, init) = path.split_last().unwrap();
        &mut tokens_at(root, init)[*last]
    }
    let mut pos = 0usize;
    let mut code = at(&v, pos);
    let mut balanced = 0usize;
    let mut name = String::new();
    let mut before = String::new();
    let mut after = String::new();
    while pos < max {
        let parent_is_calc = !path.is_empty() && {
            let p = node_at(&mut root, &path);
            p.kind == Kind::Function && p.value == "calc"
        };
        let has_parent = !path.is_empty();
        if le32(code) {
            let mut next = pos;
            loop {
                next += 1;
                code = at(&v, next);
                if !le32(code) {
                    break;
                }
            }
            let token = slice(&v, pos, next);
            let tokens = tokens_at(&mut root, &path);
            let prev_div = tokens.last().is_some_and(|p| p.kind == Kind::Div);
            if code == CLOSE && balanced > 0 {
                after = token;
            } else if prev_div {
                let p = tokens.last_mut().unwrap();
                p.source_end_index += token.chars().count();
                p.after = token;
            } else if code == COMMA || code == COLON || (code == SLASH && at(&v, next + 1) != STAR && (!has_parent || !parent_is_calc)) {
                before = token;
            } else {
                tokens.push(Node::new(Kind::Space, token, pos, next));
            }
            pos = next;
        } else if code == SQ || code == DQ {
            let mut next = pos;
            let quote = if code == SQ { '\'' } else { '"' };
            let mut node = Node::new(Kind::Str, String::new(), pos, 0);
            node.quote = quote.to_string();
            loop {
                let mut escape = false;
                match index_of(&v, quote, next + 1) {
                    Some(n) => {
                        next = n;
                        let mut ep = next;
                        while ep > 0 && at(&v, ep - 1) == BS {
                            ep -= 1;
                            escape = !escape;
                        }
                    }
                    None => {
                        v.push(quote);
                        next = v.len() - 1;
                        node.unclosed = true;
                    }
                }
                if !escape {
                    break;
                }
            }
            node.value = slice(&v, pos + 1, next);
            node.source_end_index = if node.unclosed { next } else { next + 1 };
            tokens_at(&mut root, &path).push(node);
            pos = next + 1;
            code = at(&v, pos);
        } else if code == SLASH && at(&v, pos + 1) == STAR {
            let found = (pos..v.len().saturating_sub(1)).find(|&i| v[i] == '*' && v[i + 1] == '/');
            let mut node = Node::new(Kind::Comment, String::new(), pos, 0);
            let next = match found {
                Some(n) => {
                    node.source_end_index = n + 2;
                    n
                }
                None => {
                    node.unclosed = true;
                    node.source_end_index = v.len();
                    v.len()
                }
            };
            node.value = slice(&v, pos + 2, next);
            tokens_at(&mut root, &path).push(node);
            pos = next + 2;
            code = at(&v, pos);
        } else if (code == SLASH || code == STAR) && has_parent && parent_is_calc {
            let token = v[pos].to_string();
            tokens_at(&mut root, &path).push(Node::new(Kind::Word, token, pos - before.chars().count(), pos + 1));
            pos += 1;
            code = at(&v, pos);
        } else if code == SLASH || code == COMMA || code == COLON {
            let token = v[pos].to_string();
            let mut n = Node::new(Kind::Div, token, pos - before.chars().count(), pos + 1);
            n.before = std::mem::take(&mut before);
            tokens_at(&mut root, &path).push(n);
            pos += 1;
            code = at(&v, pos);
        } else if code == OPEN {
            let mut next = pos;
            loop {
                next += 1;
                code = at(&v, next);
                if !le32(code) {
                    break;
                }
            }
            let open_pos = pos;
            let mut node = Node::new(Kind::Function, name.clone(), pos - name.chars().count(), 0);
            node.before = slice(&v, open_pos + 1, next);
            pos = next;
            if name == "url" && code != SQ && code != DQ {
                next -= 1;
                loop {
                    let mut escape = false;
                    match index_of(&v, ')', next + 1) {
                        Some(n) => {
                            next = n;
                            let mut ep = next;
                            while ep > 0 && at(&v, ep - 1) == BS {
                                ep -= 1;
                                escape = !escape;
                            }
                        }
                        None => {
                            v.push(')');
                            next = v.len() - 1;
                            node.unclosed = true;
                        }
                    }
                    if !escape {
                        break;
                    }
                }
                let mut wp = next;
                loop {
                    wp -= 1;
                    code = at(&v, wp);
                    if !le32(code) {
                        break;
                    }
                }
                if open_pos < wp {
                    if pos != wp + 1 {
                        node.nodes = vec![Node::new(Kind::Word, slice(&v, pos, wp + 1), pos, wp + 1)];
                    }
                    if node.unclosed && wp + 1 != next {
                        node.nodes.push(Node::new(Kind::Space, slice(&v, wp + 1, next), wp + 1, next));
                    } else {
                        node.after = slice(&v, wp + 1, next);
                        node.source_end_index = next;
                    }
                }
                pos = next + 1;
                node.source_end_index = if node.unclosed { next } else { pos };
                code = at(&v, pos);
                tokens_at(&mut root, &path).push(node);
            } else {
                balanced += 1;
                node.source_end_index = pos + 1;
                let tokens = tokens_at(&mut root, &path);
                tokens.push(node);
                let idx = tokens.len() - 1;
                path.push(idx);
            }
            name.clear();
        } else if code == CLOSE && balanced > 0 {
            pos += 1;
            code = at(&v, pos);
            let a = std::mem::take(&mut after);
            let p = node_at(&mut root, &path);
            p.source_end_index += a.chars().count();
            p.after = a;
            balanced -= 1;
            node_at(&mut root, &path).source_end_index = pos;
            path.pop();
        } else {
            let mut next = pos;
            loop {
                if code == BS {
                    next += 1;
                }
                next += 1;
                code = at(&v, next);
                let stop = le32(code)
                    || code == SQ
                    || code == DQ
                    || code == COMMA
                    || code == COLON
                    || code == SLASH
                    || code == OPEN
                    || (code == STAR && has_parent && parent_is_calc)
                    || (code == CLOSE && balanced > 0);
                if !(next < max && !stop) {
                    break;
                }
            }
            let token = slice(&v, pos, next);
            if code == OPEN {
                name = token;
            } else {
                let tc: Vec<char> = token.chars().collect();
                let ur = tc.len() >= 2
                    && (tc[0] == 'u' || tc[0] == 'U')
                    && tc[1] == '+'
                    && tc.len() > 2
                    && tc[2..].iter().all(|c| c.is_ascii_hexdigit() || *c == '?' || *c == '-');
                tokens_at(&mut root, &path).push(Node::new(if ur { Kind::UnicodeRange } else { Kind::Word }, token, pos, next));
            }
            pos = next;
        }
    }
    let len = v.len();
    while !path.is_empty() {
        let n = node_at(&mut root, &path);
        n.unclosed = true;
        n.source_end_index = len;
        path.pop();
    }
    root
}

pub fn stringify_node(n: &Node) -> String {
    match n.kind {
        Kind::Word | Kind::Space | Kind::UnicodeRange => n.value.clone(),
        Kind::Str => format!("{}{}{}", n.quote, n.value, if n.unclosed { "" } else { &n.quote }),
        Kind::Comment => format!("/*{}{}", n.value, if n.unclosed { "" } else { "*/" }),
        Kind::Div => format!("{}{}{}", n.before, n.value, n.after),
        Kind::Function => format!("{}({}{}{}{}", n.value, n.before, stringify(&n.nodes), n.after, if n.unclosed { "" } else { ")" }),
    }
}

pub fn stringify(nodes: &[Node]) -> String {
    nodes.iter().map(stringify_node).collect()
}

/// `walk(nodes, cb)` (top-down), mutable, with each node's index in its own
/// list.
pub fn walk(nodes: &mut [Node], cb: &mut dyn FnMut(&mut Node, usize)) {
    for i in 0..nodes.len() {
        cb(&mut nodes[i], i);
        if nodes[i].kind == Kind::Function {
            walk(&mut nodes[i].nodes, cb);
        }
    }
}

/// `unit(value)`: (number, unit) or None.
pub fn unit(value: &str) -> Option<(String, String)> {
    let v: Vec<char> = value.chars().collect();
    let c = |i: usize| v.get(i).copied().unwrap_or('\0');
    let digit = |ch: char| ch.is_ascii_digit();
    let like_number = {
        let c0 = c(0);
        if c0 == '+' || c0 == '-' {
            digit(c(1)) || (c(1) == '.' && digit(c(2)))
        } else if c0 == '.' {
            digit(c(1))
        } else {
            digit(c0)
        }
    };
    if v.is_empty() || !like_number {
        return None;
    }
    let mut pos = 0;
    if c(0) == '+' || c(0) == '-' {
        pos += 1;
    }
    while pos < v.len() && digit(c(pos)) {
        pos += 1;
    }
    if c(pos) == '.' && digit(c(pos + 1)) {
        pos += 2;
        while pos < v.len() && digit(c(pos)) {
            pos += 1;
        }
    }
    if (c(pos) == 'e' || c(pos) == 'E') && (digit(c(pos + 1)) || ((c(pos + 1) == '+' || c(pos + 1) == '-') && digit(c(pos + 2)))) {
        pos += if c(pos + 1) == '+' || c(pos + 1) == '-' { 3 } else { 2 };
        while pos < v.len() && digit(c(pos)) {
            pos += 1;
        }
    }
    Some((v[..pos].iter().collect(), v[pos..].iter().collect()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trips() {
        for s in ["1px solid red", "calc(100% - 8px)", "url( a.png )", "rgba(0, 0, 0, .5)", "a/b", "'x' \"y\"", "var(--a,  2px)"] {
            assert_eq!(stringify(&parse(s)), s);
        }
    }
}
