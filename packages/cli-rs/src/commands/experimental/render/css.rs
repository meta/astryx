//! A port of the PostCSS 8 tokenizer, parser and stringifier, enough to cut
//! a stylesheet the way `foundation/render/css-cut.mjs` does and print it
//! back byte for byte as PostCSS would.

#[derive(Debug, Clone, Copy, PartialEq)]
enum T {
    Space,
    Word,
    Str,
    AtWord,
    Brackets,
    Comment,
    OpenSq,
    CloseSq,
    OpenCurly,
    CloseCurly,
    Colon,
    Semi,
    OpenParen,
    CloseParen,
}

#[derive(Debug, Clone)]
struct Tok {
    t: T,
    s: String,
}

struct Tokenizer<'a> {
    css: &'a [u8],
    src: &'a str,
    pos: usize,
    buffer: Vec<Tok>,
    returned: Vec<Tok>,
    last_bad_paren: isize,
}

fn is_ws(c: u8) -> bool {
    matches!(c, b' ' | b'\n' | b'\t' | b'\r' | 0x0c)
}

impl<'a> Tokenizer<'a> {
    fn new(src: &'a str) -> Self {
        Tokenizer { css: src.as_bytes(), src, pos: 0, buffer: vec![], returned: vec![], last_bad_paren: -1 }
    }
    fn end_of_file(&self) -> bool {
        self.returned.is_empty() && self.pos >= self.css.len()
    }
    fn back(&mut self, t: Tok) {
        self.returned.push(t);
    }
    fn at(&self, i: usize) -> u8 {
        *self.css.get(i).unwrap_or(&0)
    }
    fn index_of(&self, needle: &[u8], from: usize) -> Option<usize> {
        if from >= self.css.len() {
            return None;
        }
        self.css[from..].windows(needle.len()).position(|w| w == needle).map(|p| p + from)
    }
    fn slice(&self, a: usize, b: usize) -> String {
        self.src[a..b.min(self.src.len())].to_string()
    }
    fn next(&mut self) -> Result<Option<Tok>, String> {
        if let Some(t) = self.returned.pop() {
            return Ok(Some(t));
        }
        let len = self.css.len();
        if self.pos >= len {
            return Ok(None);
        }
        let pos = self.pos;
        let code = self.css[pos];
        let tok;
        match code {
            b' ' | b'\n' | b'\t' | b'\r' | 0x0c => {
                let mut next = pos;
                loop {
                    next += 1;
                    if !is_ws(self.at(next)) || next >= len {
                        break;
                    }
                }
                tok = Tok { t: T::Space, s: self.slice(pos, next) };
                self.pos = next - 1;
            }
            b'[' | b']' | b'{' | b'}' | b':' | b';' | b')' => {
                let t = match code {
                    b'[' => T::OpenSq,
                    b']' => T::CloseSq,
                    b'{' => T::OpenCurly,
                    b'}' => T::CloseCurly,
                    b':' => T::Colon,
                    b';' => T::Semi,
                    _ => T::CloseParen,
                };
                tok = Tok { t, s: (code as char).to_string() };
            }
            b'(' => {
                let prev = self.buffer.pop().map(|t| t.s).unwrap_or_default();
                let n = self.at(pos + 1);
                if prev == "url" && n != b'\'' && n != b'"' && !is_ws(n) {
                    let mut next = pos;
                    loop {
                        let mut escaped = false;
                        match self.index_of(b")", next + 1) {
                            None => return Err("Unclosed bracket".into()),
                            Some(i) => next = i,
                        }
                        let mut e = next;
                        while e > 0 && self.at(e - 1) == b'\\' {
                            e -= 1;
                            escaped = !escaped;
                        }
                        if !escaped {
                            break;
                        }
                    }
                    tok = Tok { t: T::Brackets, s: self.slice(pos, next + 1) };
                    self.pos = next;
                } else if (pos as isize) <= self.last_bad_paren {
                    tok = Tok { t: T::OpenParen, s: "(".into() };
                } else {
                    let next = self.index_of(b")", pos + 1);
                    let bad = match next {
                        None => true,
                        Some(n) => self.css[pos + 1..=n].iter().any(|c| matches!(c, b'\r' | b'\n' | b'"' | b'\'' | b'(' | b'/' | b'\\')),
                    };
                    if bad {
                        self.last_bad_paren = match next {
                            None => len as isize,
                            Some(n) => n as isize,
                        };
                        tok = Tok { t: T::OpenParen, s: "(".into() };
                    } else {
                        let n = next.unwrap();
                        tok = Tok { t: T::Brackets, s: self.slice(pos, n + 1) };
                        self.pos = n;
                    }
                }
            }
            b'\'' | b'"' => {
                let mut next = pos;
                loop {
                    let mut escaped = false;
                    match self.index_of(&[code], next + 1) {
                        None => return Err("Unclosed string".into()),
                        Some(i) => next = i,
                    }
                    let mut e = next;
                    while e > 0 && self.at(e - 1) == b'\\' {
                        e -= 1;
                        escaped = !escaped;
                    }
                    if !escaped {
                        break;
                    }
                }
                tok = Tok { t: T::Str, s: self.slice(pos, next + 1) };
                self.pos = next;
            }
            b'@' => {
                let mut i = pos + 1;
                while i < len && !matches!(self.css[i], b'\t' | b'\n' | 0x0c | b'\r' | b' ' | b'"' | b'#' | b'\'' | b'(' | b')' | b'/' | b';' | b'[' | b'\\' | b']' | b'{' | b'}') {
                    i += 1;
                }
                // RE_AT_END: lastIndex 0 (no match) => to the end.
                let next = if i >= len { len - 1 } else { i - 1 };
                tok = Tok { t: T::AtWord, s: self.slice(pos, next + 1) };
                self.pos = next;
            }
            b'\\' => {
                let mut next = pos;
                let mut escape = true;
                while self.at(next + 1) == b'\\' {
                    next += 1;
                    escape = !escape;
                }
                let c = self.at(next + 1);
                if escape && c != b'/' && !is_ws(c) {
                    next += 1;
                    if self.at(next).is_ascii_hexdigit() {
                        while self.at(next + 1).is_ascii_hexdigit() {
                            next += 1;
                        }
                        if self.at(next + 1) == b' ' {
                            next += 1;
                        }
                    }
                }
                // A multi-byte character after the backslash.
                let mut end = next + 1;
                while end < len && !self.src.is_char_boundary(end) {
                    end += 1;
                }
                tok = Tok { t: T::Word, s: self.slice(pos, end) };
                self.pos = end - 1;
            }
            _ => {
                if code == b'/' && self.at(pos + 1) == b'*' {
                    let next = match self.index_of(b"*/", pos + 2) {
                        None => return Err("Unclosed comment".into()),
                        Some(i) => i + 1,
                    };
                    tok = Tok { t: T::Comment, s: self.slice(pos, next + 1) };
                    self.pos = next;
                } else {
                    let mut i = pos + 1;
                    while i < len {
                        let c = self.css[i];
                        if matches!(c, b'\t' | b'\n' | 0x0c | b'\r' | b' ' | b'!' | b'"' | b'#' | b'\'' | b'(' | b')' | b':' | b';' | b'@' | b'[' | b'\\' | b']' | b'{' | b'}')
                            || (c == b'/' && self.at(i + 1) == b'*')
                        {
                            break;
                        }
                        i += 1;
                    }
                    let next = if i >= len { len - 1 } else { i - 1 };
                    tok = Tok { t: T::Word, s: self.slice(pos, next + 1) };
                    self.buffer.push(tok.clone());
                    self.pos = next;
                }
            }
        }
        self.pos += 1;
        Ok(Some(tok))
    }
}

#[derive(Debug, Clone)]
pub enum Kind {
    Root,
    Comment { raw: String },
    /// `printed` is prop + between + value (raw) + important, without `;`.
    Decl { prop: String, value: String, printed: String },
    Rule { selector: String, selector_raw: Option<(String, String)>, own_semicolon: Option<String> },
    AtRule { name: String, after_name: String, params: String, params_raw: Option<(String, String)> },
}

#[derive(Debug, Clone)]
pub struct Node {
    pub kind: Kind,
    pub before: String,
    pub between: String,
    pub after: String,
    pub semicolon: Option<bool>,
    /// Children; `None` for a node with no body.
    pub nodes: Option<Vec<usize>>,
    pub parent: Option<usize>,
    pub removed: bool,
}

pub struct Tree {
    pub nodes: Vec<Node>,
}

struct Parser<'a> {
    tk: Tokenizer<'a>,
    tree: Vec<Node>,
    current: usize,
    spaces: String,
    semicolon: bool,
}

fn join(toks: &[Tok]) -> String {
    toks.iter().map(|t| t.s.as_str()).collect()
}

impl<'a> Parser<'a> {
    fn push(&mut self, kind: Kind, body: bool) -> usize {
        let is_comment = matches!(kind, Kind::Comment { .. });
        let id = self.tree.len();
        self.tree.push(Node {
            kind,
            before: std::mem::take(&mut self.spaces),
            between: String::new(),
            after: String::new(),
            semicolon: None,
            nodes: if body { Some(vec![]) } else { None },
            parent: Some(self.current),
            removed: false,
        });
        if let Some(n) = self.tree[self.current].nodes.as_mut() {
            n.push(id);
        }
        if !is_comment {
            self.semicolon = false;
        }
        id
    }

    fn spaces_and_comments_from_end(toks: &mut Vec<Tok>) -> String {
        let mut s = String::new();
        while let Some(t) = toks.last() {
            if t.t != T::Space && t.t != T::Comment {
                break;
            }
            s = toks.pop().unwrap().s + &s;
        }
        s
    }
    fn spaces_and_comments_from_start(toks: &mut Vec<Tok>) -> String {
        let mut s = String::new();
        while let Some(t) = toks.first() {
            if t.t != T::Space && t.t != T::Comment {
                break;
            }
            s += &toks.remove(0).s;
        }
        s
    }

    /// `raw(node, prop, tokens)`: (clean value, Some((raw, value)) when not clean).
    fn raw(toks: &[Tok], custom: bool) -> (String, Option<(String, String)>) {
        let mut value = String::new();
        let mut clean = true;
        let len = toks.len();
        for (i, t) in toks.iter().enumerate() {
            if t.t == T::Space && i == len - 1 && !custom {
                clean = false;
            } else if t.t == T::Comment {
                let safe = |x: Option<&Tok>| x.is_none_or(|t| t.t == T::Space);
                let prev = if i > 0 { toks.get(i - 1) } else { None };
                let next = toks.get(i + 1);
                if !safe(prev) && !safe(next) {
                    if value.ends_with(',') {
                        clean = false;
                    } else {
                        value += &t.s;
                    }
                } else {
                    clean = false;
                }
            } else {
                value += &t.s;
            }
        }
        if clean {
            (value, None)
        } else {
            (value.clone(), Some((join(toks), value)))
        }
    }

    fn end(&mut self) -> Result<(), String> {
        let cur = self.current;
        if self.tree[cur].nodes.as_ref().is_some_and(|n| !n.is_empty()) {
            self.tree[cur].semicolon = Some(self.semicolon);
        }
        self.semicolon = false;
        let sp = std::mem::take(&mut self.spaces);
        self.tree[cur].after.push_str(&sp);
        match self.tree[cur].parent {
            Some(p) => {
                self.current = p;
                Ok(())
            }
            None => Err("Unexpected }".into()),
        }
    }

    fn comment(&mut self, tok: Tok) {
        self.push(Kind::Comment { raw: tok.s }, false);
    }

    fn atrule(&mut self, tok: Tok) -> Result<(), String> {
        let name = tok.s[1..].to_string();
        if name.is_empty() {
            return Err("At-rule without name".into());
        }
        let id = self.push(Kind::AtRule { name, after_name: String::new(), params: String::new(), params_raw: None }, false);
        let mut params: Vec<Tok> = vec![];
        let mut brackets: Vec<T> = vec![];
        let mut open = false;
        let mut last = false;
        while !self.tk.end_of_file() {
            let t = self.tk.next()?.unwrap();
            let ty = t.t;
            if ty == T::OpenParen || ty == T::OpenSq {
                brackets.push(if ty == T::OpenParen { T::CloseParen } else { T::CloseSq });
            } else if ty == T::OpenCurly && !brackets.is_empty() {
                brackets.push(T::CloseCurly);
            } else if Some(&ty) == brackets.last() {
                brackets.pop();
            }
            if brackets.is_empty() {
                if ty == T::Semi {
                    self.semicolon = true;
                    break;
                } else if ty == T::OpenCurly {
                    open = true;
                    break;
                } else if ty == T::CloseCurly {
                    // The at-rule ends with its parent.
                    self.finish_atrule(id, &mut params, false);
                    self.end()?;
                    return Ok(());
                } else {
                    params.push(t);
                }
            } else {
                params.push(t);
            }
            if self.tk.end_of_file() {
                last = true;
                break;
            }
        }
        self.finish_atrule(id, &mut params, last);
        if open {
            self.tree[id].nodes = Some(vec![]);
            self.current = id;
        }
        Ok(())
    }

    fn finish_atrule(&mut self, id: usize, params: &mut Vec<Tok>, last: bool) {
        let between = Self::spaces_and_comments_from_end(params);
        self.tree[id].between = between.clone();
        if !params.is_empty() {
            let after_name = Self::spaces_and_comments_from_start(params);
            let (v, raw) = Self::raw(params, false);
            if let Kind::AtRule { after_name: an, params: p, params_raw, .. } = &mut self.tree[id].kind {
                *an = after_name;
                *p = v;
                *params_raw = raw;
            }
            if last {
                self.spaces = between;
                self.tree[id].between = String::new();
            }
        }
    }

    fn rule(&mut self, mut toks: Vec<Tok>) {
        toks.pop();
        let between = Self::spaces_and_comments_from_end(&mut toks);
        let (sel, raw) = Self::raw(&toks, false);
        let id = self.push(Kind::Rule { selector: sel, selector_raw: raw, own_semicolon: None }, true);
        self.tree[id].between = between;
        self.current = id;
    }

    fn decl(&mut self, mut toks: Vec<Tok>, custom: bool) -> Result<(), String> {
        let id = self.push(Kind::Decl { prop: String::new(), value: String::new(), printed: String::new() }, false);
        if toks.last().is_some_and(|t| t.t == T::Semi) {
            self.semicolon = true;
            toks.pop();
        }
        let mut start = 0;
        while toks[start].t != T::Word {
            if start == toks.len() - 1 {
                return Err(format!("Unknown word {}", toks[start].s));
            }
            start += 1;
        }
        let mut before_extra = join(&toks[..start]);
        let prop_start = start;
        while start < toks.len() {
            let t = toks[start].t;
            if t == T::Colon || t == T::Space || t == T::Comment {
                break;
            }
            start += 1;
        }
        let mut prop = join(&toks[prop_start..start]);
        let between_start = start;
        while start < toks.len() {
            let t = toks[start].clone();
            start += 1;
            if t.t == T::Colon {
                break;
            }
        }
        let mut between = join(&toks[between_start..start]);
        if prop.starts_with('_') || prop.starts_with('*') {
            before_extra.push_str(&prop[..1]);
            prop = prop[1..].to_string();
        }
        let fs_start = start;
        while start < toks.len() {
            let t = toks[start].t;
            if t != T::Space && t != T::Comment {
                break;
            }
            start += 1;
        }
        let mut first_spaces: Vec<Tok> = toks[fs_start..start].to_vec();
        let mut rest: Vec<Tok> = toks[start..].to_vec();
        let mut important: Option<String> = None;
        let mut i = rest.len();
        while i > 0 {
            i -= 1;
            let t = rest[i].clone();
            if t.s.to_lowercase() == "!important" {
                let s = join(&rest[i..]);
                rest.truncate(i);
                let mut sp = String::new();
                while rest.last().is_some_and(|t| t.t == T::Space) {
                    sp = rest.pop().unwrap().s + &sp;
                }
                important = Some(sp + &s);
                break;
            } else if t.s.to_lowercase() == "important" {
                let mut cache = rest.clone();
                let mut s = String::new();
                let mut j = i;
                while j > 0 {
                    let ty = cache[j].t;
                    if s.trim().starts_with('!') && ty != T::Space {
                        break;
                    }
                    s = cache.pop().unwrap().s + &s;
                    j -= 1;
                }
                if s.trim().starts_with('!') {
                    important = Some(s);
                    rest = cache;
                }
            }
            if t.t != T::Space && t.t != T::Comment {
                break;
            }
        }
        let has_word = rest.iter().any(|t| t.t != T::Space && t.t != T::Comment);
        if has_word {
            between.push_str(&join(&first_spaces));
            first_spaces.clear();
        }
        let mut all = first_spaces;
        all.extend(rest);
        let (value, raw) = Self::raw(&all, custom);
        let raw_value = raw.map(|r| r.0).unwrap_or_else(|| value.clone());
        let printed = format!("{prop}{between}{raw_value}{}", important.unwrap_or_default());
        self.tree[id].before.push_str(&before_extra);
        self.tree[id].kind = Kind::Decl { prop, value, printed };
        Ok(())
    }

    fn other(&mut self, start: Tok) -> Result<(), String> {
        let custom = start.s.starts_with("--");
        let mut end = false;
        let mut colon = false;
        let mut brackets: Vec<T> = vec![];
        let mut toks: Vec<Tok> = vec![];
        let mut tok = Some(start);
        while let Some(t) = tok {
            let ty = t.t;
            toks.push(t);
            if ty == T::OpenParen || ty == T::OpenSq {
                brackets.push(if ty == T::OpenParen { T::CloseParen } else { T::CloseSq });
            } else if custom && colon && ty == T::OpenCurly {
                brackets.push(T::CloseCurly);
            } else if brackets.is_empty() {
                if ty == T::Semi {
                    if colon {
                        return self.decl(toks, custom);
                    } else {
                        break;
                    }
                } else if ty == T::OpenCurly {
                    self.rule(toks);
                    return Ok(());
                } else if ty == T::CloseCurly {
                    let t = toks.pop().unwrap();
                    self.tk.back(t);
                    end = true;
                    break;
                } else if ty == T::Colon {
                    colon = true;
                }
            } else if Some(&ty) == brackets.last() {
                brackets.pop();
            }
            tok = self.tk.next()?;
        }
        if self.tk.end_of_file() {
            end = true;
        }
        if !brackets.is_empty() {
            return Err("Unclosed bracket".into());
        }
        if end && colon {
            if !custom {
                while let Some(t) = toks.last() {
                    if t.t != T::Space && t.t != T::Comment {
                        break;
                    }
                    let t = toks.pop().unwrap();
                    self.tk.back(t);
                }
            }
            self.decl(toks, custom)
        } else {
            Err(format!("Unknown word {}", toks.first().map(|t| t.s.clone()).unwrap_or_default()))
        }
    }

    fn free_semicolon(&mut self, tok: Tok) {
        self.spaces.push_str(&tok.s);
        let cur = self.current;
        if let Some(&prev) = self.tree[cur].nodes.as_ref().and_then(|n| n.last()) {
            if let Kind::Rule { own_semicolon, .. } = &mut self.tree[prev].kind {
                if own_semicolon.is_none() {
                    *own_semicolon = Some(std::mem::take(&mut self.spaces));
                }
            }
        }
    }

    fn parse(mut self) -> Result<Tree, String> {
        while !self.tk.end_of_file() {
            let Some(tok) = self.tk.next()? else { break };
            match tok.t {
                T::Space => self.spaces.push_str(&tok.s),
                T::Semi => self.free_semicolon(tok),
                T::CloseCurly => self.end()?,
                T::Comment => self.comment(tok),
                T::AtWord => self.atrule(tok)?,
                T::OpenCurly => {
                    let id = self.push(Kind::Rule { selector: String::new(), selector_raw: None, own_semicolon: None }, true);
                    self.current = id;
                }
                _ => self.other(tok)?,
            }
        }
        if self.tree[self.current].parent.is_some() {
            return Err("Unclosed block".into());
        }
        let cur = self.current;
        if self.tree[cur].nodes.as_ref().is_some_and(|n| !n.is_empty()) {
            self.tree[cur].semicolon = Some(self.semicolon);
        }
        let sp = std::mem::take(&mut self.spaces);
        self.tree[cur].after.push_str(&sp);
        Ok(Tree { nodes: self.tree })
    }
}

pub fn parse(css: &str) -> Result<Tree, String> {
    let root = Node {
        kind: Kind::Root,
        before: String::new(),
        between: String::new(),
        after: String::new(),
        semicolon: None,
        nodes: Some(vec![]),
        parent: None,
        removed: false,
    };
    Parser { tk: Tokenizer::new(css), tree: vec![root], current: 0, spaces: String::new(), semicolon: false }.parse()
}

impl Node {
    fn children<'a>(&'a self) -> impl Iterator<Item = usize> + 'a {
        self.nodes.iter().flatten().copied()
    }
}

impl Tree {
    pub fn remove(&mut self, id: usize) {
        self.nodes[id].removed = true;
        // Root.removeChild: the next node takes the first node's `before`.
        if self.nodes[id].parent == Some(0) {
            let kids = self.nodes[0].nodes.clone().unwrap_or_default();
            if kids.first() == Some(&id) && kids.len() > 1 {
                let b = self.nodes[id].before.clone();
                self.nodes[kids[1]].before = b;
            }
        }
        if let Some(p) = self.nodes[id].parent {
            if let Some(n) = self.nodes[p].nodes.as_mut() {
                n.retain(|&c| c != id);
            }
        }
    }

    /// `node.replaceWith(...other.nodes)`: the other tree's top nodes take
    /// this node's place.
    pub fn replace_with_tree(&mut self, id: usize, other: Tree) {
        let Some(parent) = self.nodes[id].parent else { return };
        let offset = self.nodes.len();
        let tops: Vec<usize> = other.nodes[0].nodes.clone().unwrap_or_default();
        // Moving each node out of the other root removes it there first, and
        // Root.removeChild hands the first node's `before` down the line.
        let mut other = other;
        if let Some(&first) = tops.first() {
            let b = other.nodes[first].before.clone();
            for &t in tops.iter().skip(1) {
                other.nodes[t].before = b.clone();
            }
        }
        for (i, mut n) in other.nodes.into_iter().enumerate() {
            if i == 0 {
                // The other root: a placeholder, never linked.
                n.removed = true;
                self.nodes.push(n);
                continue;
            }
            n.parent = match n.parent {
                Some(0) | None => Some(parent),
                Some(p) => Some(p + offset),
            };
            if let Some(kids) = n.nodes.as_mut() {
                for k in kids.iter_mut() {
                    *k += offset;
                }
            }
            self.nodes.push(n);
        }
        if let Some(list) = self.nodes[parent].nodes.as_mut() {
            if let Some(pos) = list.iter().position(|&c| c == id) {
                let new: Vec<usize> = tops.iter().map(|t| t + offset).collect();
                list.splice(pos..pos, new);
            }
        }
        self.remove(id);
    }

    /// Every live node in document order (PostCSS `walk`).
    pub fn walk(&self) -> Vec<usize> {
        let mut out = vec![];
        let mut stack: Vec<usize> = self.nodes[0].children().collect::<Vec<_>>().into_iter().rev().collect();
        while let Some(id) = stack.pop() {
            out.push(id);
            let kids: Vec<usize> = self.nodes[id].children().collect();
            for k in kids.into_iter().rev() {
                stack.push(k);
            }
        }
        out
    }

    pub fn to_string(&self) -> String {
        let mut out = String::new();
        self.body(0, &mut out);
        out.push_str(&self.nodes[0].after);
        out
    }

    fn body(&self, id: usize, out: &mut String) {
        let kids: Vec<usize> = self.nodes[id].children().collect();
        let mut last = kids.len() as isize - 1;
        while last > 0 {
            if !matches!(self.nodes[kids[last as usize]].kind, Kind::Comment { .. }) {
                break;
            }
            last -= 1;
        }
        let semicolon = self.nodes[id].semicolon.unwrap_or(false);
        for (i, &k) in kids.iter().enumerate() {
            let child = &self.nodes[k];
            let mut child_semi = last != i as isize || semicolon;
            if !child_semi && i < kids.len() - 1 {
                match &child.kind {
                    Kind::AtRule { .. } if child.nodes.is_none() => child_semi = true,
                    Kind::Decl { prop, .. } if prop.starts_with("--") => child_semi = true,
                    _ => {}
                }
            }
            out.push_str(&child.before);
            match &child.kind {
                Kind::Root => {}
                Kind::Comment { raw } => out.push_str(raw),
                Kind::Decl { printed, .. } => {
                    out.push_str(printed);
                    if child_semi {
                        out.push(';');
                    }
                }
                Kind::Rule { selector, selector_raw, own_semicolon } => {
                    let sel = match selector_raw {
                        Some((raw, v)) if v == selector => raw.clone(),
                        _ => selector.clone(),
                    };
                    self.block(k, &sel, out);
                    if let Some(o) = own_semicolon {
                        out.push_str(o);
                    }
                }
                Kind::AtRule { name, after_name, params, params_raw } => {
                    let p = match params_raw {
                        Some((raw, v)) if v == params => raw.clone(),
                        _ => params.clone(),
                    };
                    let mut an = after_name.clone();
                    if an.is_empty() && !p.is_empty() && !matches!(p.as_bytes()[0], b'\t' | b'\n' | 0x0c | b'\r' | b' ' | b'"' | b'#' | b'\'' | b'(' | b')' | b'/' | b';' | b'[' | b'\\' | b']' | b'{' | b'}') {
                        an = " ".into();
                    }
                    let start = format!("@{name}{an}{p}");
                    if child.nodes.is_some() {
                        self.block(k, &start, out);
                    } else {
                        out.push_str(&start);
                        out.push_str(&child.between);
                        if child_semi {
                            out.push(';');
                        }
                    }
                }
            }
        }
    }

    fn block(&self, id: usize, start: &str, out: &mut String) {
        let n = &self.nodes[id];
        out.push_str(start);
        out.push_str(&n.between);
        out.push('{');
        if n.nodes.as_ref().is_some_and(|v| !v.is_empty()) {
            self.body(id, out);
        }
        out.push_str(&n.after);
        out.push('}');
    }
}

/// `escapeHTMLInCSS` over the whole output.
fn escape_html_in_css(s: &str) -> String {
    if !s.contains('<') {
        return s.to_string();
    }
    let re = regress::Regex::with_flags(r"(<)(\/?style\b)", "gi").unwrap();
    let mut out = String::new();
    let mut last = 0;
    for m in re.find_iter(s) {
        out.push_str(&s[last..m.start()]);
        let g2 = m.group(2).map(|r| &s[r]).unwrap_or("");
        out.push_str(&format!("\\3c {g2}"));
        last = m.end();
    }
    out.push_str(&s[last..]);
    let s2 = out;
    let mut out = String::new();
    let mut rest = s2.as_str();
    while let Some(i) = rest.find("<!--") {
        out.push_str(&rest[..i]);
        out.push_str("\\3c !--");
        rest = &rest[i + 4..];
    }
    out.push_str(rest);
    out
}

// ── css-cut.mjs ─────────────────────────────────────────────────────────

/// `classesIn(markup)`, in first-seen order.
pub fn classes_in(markup: &str) -> Vec<String> {
    let mut used: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut rest = markup;
    while let Some(i) = rest.find("class=\"") {
        let before_ok = i > 0 && rest.as_bytes()[i - 1].is_ascii_whitespace();
        let after = &rest[i + 7..];
        let Some(end) = after.find('"') else { break };
        if before_ok {
            for c in after[..end].split(|ch: char| ch.is_whitespace()) {
                if !c.is_empty() && seen.insert(c.to_string()) {
                    used.push(c.to_string());
                }
            }
            rest = &after[end + 1..];
        } else {
            rest = &rest[i + 7..];
        }
    }
    used
}

fn unescape_ident(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    // First pass: hex escapes; second: any other escaped char.
    let mut first = String::new();
    while i < chars.len() {
        if chars[i] == '\\' {
            let mut j = i + 1;
            while j < chars.len() && j - i <= 6 && chars[j].is_ascii_hexdigit() {
                j += 1;
            }
            if j > i + 1 {
                let hex: String = chars[i + 1..j].iter().collect();
                if let Some(c) = u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32) {
                    first.push(c);
                }
                if j < chars.len() && chars[j].is_whitespace() {
                    j += 1;
                }
                i = j;
                continue;
            }
        }
        first.push(chars[i]);
        i += 1;
    }
    let fc: Vec<char> = first.chars().collect();
    let mut k = 0;
    while k < fc.len() {
        if fc[k] == '\\' && k + 1 < fc.len() && fc[k + 1] != '\n' {
            out.push(fc[k + 1]);
            k += 2;
        } else {
            out.push(fc[k]);
            k += 1;
        }
    }
    out
}

/// `requiredClasses(selector)`.
pub fn required_classes(selector: &str) -> Vec<String> {
    let group = regress::Regex::with_flags(r":(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)", "g").unwrap();
    let mut s = selector.to_string();
    for _ in 0..3 {
        if !regress::Regex::new(r":(not|is|where|has)\(").unwrap().find(&s).is_some() {
            break;
        }
        let mut out = String::new();
        let mut last = 0;
        for m in group.find_iter(&s) {
            out.push_str(&s[last..m.start()]);
            last = m.end();
        }
        out.push_str(&s[last..]);
        s = out;
    }
    let cls = regress::Regex::with_flags(r"\.((?:\\.|[A-Za-z0-9_-])+)", "g").unwrap();
    cls.find_iter(&s).map(|m| unescape_ident(&s[m.group(1).unwrap()])).collect()
}

fn split_selectors(list: &str) -> Vec<String> {
    let b: Vec<char> = list.chars().collect();
    let mut out = vec![];
    let mut depth = 0i32;
    let mut start = 0;
    let mut i = 0;
    while i < b.len() {
        let ch = b[i];
        if ch == '\\' {
            i += 2;
            continue;
        }
        if ch == '(' || ch == '[' {
            depth += 1;
        } else if ch == ')' || ch == ']' {
            depth -= 1;
        } else if ch == ',' && depth == 0 {
            out.push(b[start..i].iter().collect::<String>());
            start = i + 1;
        }
        i += 1;
    }
    out.push(b[start.min(b.len())..].iter().collect::<String>());
    out.into_iter().map(|s| js_trim(&s).to_string()).filter(|s| !s.is_empty()).collect()
}

fn js_trim(s: &str) -> &str {
    crate::commands::gap_report::api::js_trim(s)
}

/// `cutCss(css, used)`.
pub fn cut_css(css: &str, used: &std::collections::HashSet<String>) -> Result<String, String> {
    let mut t = parse(css)?;
    for id in t.walk() {
        if matches!(t.nodes[id].kind, Kind::Comment { .. }) {
            t.remove(id);
        }
    }
    for id in t.walk() {
        if let Kind::AtRule { name, .. } = &t.nodes[id].kind {
            if name == "layer" && t.nodes[id].nodes.is_none() {
                t.remove(id);
            }
        }
    }
    for id in t.walk() {
        if t.nodes[id].removed {
            continue;
        }
        let Kind::Rule { selector, .. } = &t.nodes[id].kind else { continue };
        if let Some(p) = t.nodes[id].parent {
            if let Kind::AtRule { name, .. } = &t.nodes[p].kind {
                if name.to_lowercase().ends_with("keyframes") {
                    continue;
                }
            }
        }
        let all = split_selectors(selector);
        let kept: Vec<String> = all.iter().filter(|s| required_classes(s).iter().all(|c| used.contains(c))).cloned().collect();
        if kept.is_empty() {
            t.remove(id);
        } else if kept.len() != all.len() {
            if let Kind::Rule { selector, .. } = &mut t.nodes[id].kind {
                *selector = kept.join(",");
            }
        }
    }
    let grouping = |n: &str| matches!(n.to_lowercase().as_str(), "media" | "supports" | "container" | "layer" | "scope" | "starting-style");
    loop {
        let mut changed = false;
        for id in t.walk() {
            if t.nodes[id].removed {
                continue;
            }
            if let Kind::AtRule { name, .. } = &t.nodes[id].kind {
                if grouping(name) && t.nodes[id].nodes.as_ref().is_some_and(|n| n.is_empty()) {
                    t.remove(id);
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    let mut named: std::collections::HashSet<String> = std::collections::HashSet::new();
    for id in t.walk() {
        if let Kind::Decl { prop, value, .. } = &t.nodes[id].kind {
            let p = prop.to_lowercase();
            if p == "animation" || p == "animation-name" {
                for w in value.split(|c: char| c.is_whitespace() || c == ',') {
                    named.insert(w.to_string());
                }
            }
        }
    }
    for id in t.walk() {
        if t.nodes[id].removed {
            continue;
        }
        if let Kind::AtRule { name, params, .. } = &t.nodes[id].kind {
            if name.to_lowercase().ends_with("keyframes") && !named.contains(js_trim(params)) {
                t.remove(id);
            }
        }
    }
    let s = escape_html_in_css(&t.to_string());
    // .replace(/\n\s*\n/g, '\n')
    let re = regress::Regex::with_flags(r"\n\s*\n", "g").unwrap();
    let mut out = String::new();
    let mut last = 0;
    for m in re.find_iter(&s) {
        out.push_str(&s[last..m.start()]);
        out.push('\n');
        last = m.end();
    }
    out.push_str(&s[last..]);
    Ok(out)
}

/// `layerOrderOf(css)`.
pub fn layer_order_of(css: &str) -> String {
    let mut bare = String::new();
    let mut rest = css;
    while let Some(i) = rest.find("/*") {
        bare.push_str(&rest[..i]);
        match rest[i + 2..].find("*/") {
            Some(j) => rest = &rest[i + 2 + j + 2..],
            None => {
                bare.push_str(&rest[i..]);
                rest = "";
            }
        }
    }
    bare.push_str(rest);
    let re = regress::Regex::new(r"@layer\s+[\w-]+(?:\s*,\s*[\w-]+)*\s*;").unwrap();
    re.find(&bare).map(|m| bare[m.range()].to_string()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trips() {
        for css in [
            "a{color:red}",
            "a { color : red ; }\n/* c */\n@media (x) { b{c:d} }\n",
            "@layer a, b;\n@layer a {\n  .x { y: z; /* k */ }\n}\n",
            ":root{--a: {b};--c:  1px }",
            "a{b:url(data:x;y)}",
        ] {
            let t = parse(css).unwrap();
            assert_eq!(t.to_string(), css);
        }
    }
}

#[cfg(test)]
mod oracle {
    #[test]
    fn matches_postcss_cuts() {
        let Ok(text) = std::fs::read_to_string("/tmp/cutoracle.json") else { return };
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        for c in v["cases"].as_array().unwrap() {
            let file = c["file"].as_str().unwrap();
            let css = std::fs::read_to_string(file).unwrap();
            if let Some(l) = c.get("layer") {
                assert_eq!(super::layer_order_of(&css), l.as_str().unwrap());
                continue;
            }
            let used: std::collections::HashSet<String> =
                c["used"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect();
            let got = super::cut_css(&css, &used).unwrap();
            let want = c["out"].as_str().unwrap();
            if got != want {
                let i = got.bytes().zip(want.bytes()).position(|(a, b)| a != b).unwrap_or(got.len().min(want.len()));
                panic!("{file} n={} at {i}: got {:?} want {:?}", used.len(), &got[i.saturating_sub(80)..(i + 80).min(got.len())], &want[i.saturating_sub(80)..(i + 80).min(want.len())]);
            }
        }
    }
}
