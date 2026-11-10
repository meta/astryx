//! A port of postcss-selector-parser 7 (lossless `astSync`, the node tree,
//! `toString`, and the mutation and walking helpers the codemods use), plus
//! `cssesc`. Token positions are byte offsets; error indexes are reported in
//! UTF-16 units as JavaScript does.

use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SType {
    Root,
    Selector,
    Pseudo,
    Class,
    Id,
    Tag,
    Universal,
    Attribute,
    Combinator,
    Nesting,
    Comment,
    Str,
}

impl SType {
    pub fn name(self) -> &'static str {
        match self {
            SType::Root => "root",
            SType::Selector => "selector",
            SType::Pseudo => "pseudo",
            SType::Class => "class",
            SType::Id => "id",
            SType::Tag => "tag",
            SType::Universal => "universal",
            SType::Attribute => "attribute",
            SType::Combinator => "combinator",
            SType::Nesting => "nesting",
            SType::Comment => "comment",
            SType::Str => "string",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Ns {
    None,
    True,
    S(String),
}

#[derive(Clone, Debug)]
pub struct SNode {
    pub ty: SType,
    pub parent: Option<usize>,
    pub nodes: Option<Vec<usize>>,
    pub value: Option<String>,
    /// `raws.<prop>` strings (value, namespace, attribute, operator, insensitiveFlag).
    pub raws: HashMap<&'static str, String>,
    /// `spaces.<key>`: "before", "after", and "attribute.before" style keys.
    pub spaces: HashMap<String, String>,
    /// `raws.spaces.<key>`.
    pub raw_spaces: HashMap<String, String>,
    pub namespace: Ns,
    pub attribute: Option<String>,
    pub operator: Option<String>,
    pub quote_mark: Option<Option<char>>,
    pub insensitive: bool,
    pub trailing_comma: bool,
    pub source_index: usize,
}

impl SNode {
    pub fn new(ty: SType) -> SNode {
        SNode { ty, parent: None, nodes: if matches!(ty, SType::Root | SType::Selector | SType::Pseudo) { Some(vec![]) } else { None }, value: None, raws: HashMap::new(), spaces: HashMap::new(), raw_spaces: HashMap::new(), namespace: Ns::None, attribute: None, operator: None, quote_mark: None, insensitive: false, trailing_comma: false, source_index: 0 }
    }
    fn sp(&self, k: &str) -> String {
        self.spaces.get(k).cloned().unwrap_or_default()
    }
    pub fn raw_space_before(&self) -> String {
        match self.raw_spaces.get("before") {
            Some(s) => s.clone(),
            None => self.sp("before"),
        }
    }
    pub fn raw_space_after(&self) -> String {
        match self.raw_spaces.get("after") {
            Some(s) => s.clone(),
            None => self.sp("after"),
        }
    }
    pub fn val(&self) -> &str {
        self.value.as_deref().unwrap_or("")
    }
}

#[derive(Clone, Debug)]
pub struct SelError {
    pub message: String,
    /// UTF-16 index into the selector, when the error carries one.
    pub index: Option<usize>,
}

pub struct Sel {
    pub n: Vec<SNode>,
    pub root: usize,
    indexes: HashMap<usize, HashMap<usize, usize>>,
    last_each: usize,
}

// ---------------------------------------------------------------- tokenizer

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum T {
    Space,
    Combinator,
    Str,
    Comment,
    Word,
    C(u8),
}

#[derive(Clone, Copy, Debug)]
struct Tk {
    t: T,
    start: usize,
    end: usize,
}

fn is_word_delim(c: u8) -> bool {
    matches!(c, b' ' | b'\t' | b'\n' | b'\r' | 0x0c | b'&' | b'*' | b'!' | b',' | b':' | b';' | b'(' | b')' | b'[' | b']' | b'\'' | b'"' | b'+' | b'|' | b'~' | b'>' | b'=' | b'$' | b'^' | b'/')
}

fn consume_escape(css: &[u8], start: usize) -> usize {
    let mut next = start;
    let code = css.get(next + 1).copied();
    match code {
        Some(b'\t') | Some(b'\n') | Some(b'\r') | Some(0x0c) => {}
        Some(c) if c.is_ascii_hexdigit() => {
            let mut digits = 0;
            let mut code;
            loop {
                next += 1;
                digits += 1;
                code = css.get(next + 1).copied();
                if !(code.map(|c| c.is_ascii_hexdigit()).unwrap_or(false) && digits < 6) {
                    break;
                }
            }
            if digits < 6 && code == Some(b' ') {
                next += 1;
            }
        }
        _ => next += 1,
    }
    next
}

fn consume_word(css: &[u8], start: usize) -> usize {
    let mut next = start;
    loop {
        let code = css.get(next).copied();
        match code {
            Some(c) if is_word_delim(c) => return next - 1,
            Some(b'\\') => next = consume_escape(css, next) + 1,
            _ => next += 1,
        }
        if next >= css.len() {
            break;
        }
    }
    next - 1
}

fn index_of(s: &str, pat: &str, from: usize) -> Option<usize> {
    if from > s.len() {
        return None;
    }
    s[from..].find(pat).map(|i| i + from)
}

fn u16_at(s: &str, b: usize) -> usize {
    let mut b = b.min(s.len());
    while !s.is_char_boundary(b) {
        b -= 1;
    }
    s[..b].encode_utf16().count()
}

fn tokenize(css: &str) -> Result<Vec<Tk>, SelError> {
    let b = css.as_bytes();
    let len = b.len();
    let mut toks = vec![];
    let mut start = 0;
    while start < len {
        let code = b[start];
        let (t, end): (T, usize);
        match code {
            b' ' | b'\t' | b'\n' | b'\r' | 0x0c => {
                let mut next = start;
                loop {
                    next += 1;
                    match b.get(next) {
                        Some(b' ') | Some(b'\n') | Some(b'\t') | Some(b'\r') | Some(0x0c) => {}
                        _ => break,
                    }
                }
                t = T::Space;
                end = next;
            }
            b'+' | b'>' | b'~' | b'|' => {
                let mut next = start;
                loop {
                    next += 1;
                    match b.get(next) {
                        Some(b'+') | Some(b'>') | Some(b'~') | Some(b'|') => {}
                        _ => break,
                    }
                }
                t = T::Combinator;
                end = next;
            }
            b'*' | b'&' | b'!' | b',' | b'=' | b'$' | b'^' | b'[' | b']' | b':' | b';' | b'(' | b')' => {
                t = T::C(code);
                end = start + 1;
            }
            b'\'' | b'"' => {
                let q = if code == b'\'' { "'" } else { "\"" };
                let mut next = start;
                loop {
                    let mut escaped = false;
                    match index_of(css, q, next + 1) {
                        Some(n) => next = n,
                        None => return Err(SelError { message: "Unclosed quote".into(), index: None }),
                    }
                    let mut ep = next;
                    while ep > 0 && b[ep - 1] == b'\\' {
                        ep -= 1;
                        escaped = !escaped;
                    }
                    if !escaped {
                        break;
                    }
                }
                t = T::Str;
                end = next + 1;
            }
            _ => {
                if code == b'/' && b.get(start + 1) == Some(&b'*') {
                    let next = match index_of(css, "*/", start + 2) {
                        Some(n) => n + 1,
                        None => return Err(SelError { message: "Unclosed comment".into(), index: None }),
                    };
                    t = T::Comment;
                    end = next + 1;
                } else if code == b'/' {
                    t = T::C(b'/');
                    end = start + 1;
                } else {
                    let next = consume_word(b, start);
                    t = T::Word;
                    let mut e = next + 1;
                    while e < len && !css.is_char_boundary(e) {
                        e += 1;
                    }
                    end = e.min(len).max(start + 1);
                }
            }
        }
        toks.push(Tk { t, start, end: end.min(len) });
        start = end.min(len);
        if end > len {
            break;
        }
    }
    Ok(toks)
}

// ---------------------------------------------------------------- unescape / cssesc

fn gobble_hex(s: &[char]) -> Option<(String, usize)> {
    let mut hex = String::new();
    let mut space_terminated = false;
    for i in 0..6.min(s.len()) {
        let c = s[i].to_ascii_lowercase();
        let valid = c.is_ascii_hexdigit() && (c.is_ascii_digit() || ('a'..='f').contains(&c));
        space_terminated = c == ' ';
        if !valid {
            break;
        }
        hex.push(c);
    }
    if hex.is_empty() {
        return None;
    }
    let cp = u32::from_str_radix(&hex, 16).unwrap_or(0);
    let extra = hex.len() + if space_terminated { 1 } else { 0 };
    if (0xd800..=0xdfff).contains(&cp) || cp == 0 || cp > 0x10ffff {
        return Some(("\u{FFFD}".into(), extra));
    }
    Some((char::from_u32(cp).map(|c| c.to_string()).unwrap_or_else(|| "\u{FFFD}".into()), extra))
}

/// `unesc`
pub fn unesc(s: &str) -> String {
    if !s.contains('\\') {
        return s.to_string();
    }
    let cs: Vec<char> = s.chars().collect();
    let mut ret = String::new();
    let mut i = 0;
    while i < cs.len() {
        if cs[i] == '\\' {
            let end = (i + 7).min(cs.len());
            if let Some((g, n)) = gobble_hex(&cs[(i + 1).min(cs.len())..end]) {
                ret.push_str(&g);
                i += n + 1;
                continue;
            }
            if cs.get(i + 1) == Some(&'\\') {
                ret.push('\\');
                i += 2;
                continue;
            }
            if cs.len() == i + 1 {
                ret.push(cs[i]);
            }
            i += 1;
            continue;
        }
        ret.push(cs[i]);
        i += 1;
    }
    ret
}

pub enum EscMode {
    Ident,
    Single,
    Double,
}

/// `cssesc(value, {isIdentifier: true})` or the quoted `wrap: true` forms.
pub fn cssesc(s: &str, mode: EscMode) -> String {
    let is_ident = matches!(mode, EscMode::Ident);
    let quote = match mode {
        EscMode::Double => '"',
        _ => '\'',
    };
    let units: Vec<u16> = s.encode_utf16().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < units.len() {
        let mut cp = units[i] as u32;
        i += 1;
        if cp < 0x20 || cp > 0x7e {
            if (0xd800..=0xdbff).contains(&cp) && i < units.len() {
                let extra = units[i] as u32;
                i += 1;
                if extra & 0xfc00 == 0xdc00 {
                    cp = ((cp & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000;
                } else {
                    i -= 1;
                }
            }
            out.push_str(&format!("\\{} ", format!("{:x}", cp).to_uppercase()));
        } else {
            let ch = cp as u8 as char;
            if matches!(ch, '\t' | '\n' | '\x0c' | '\r' | '\x0b') {
                out.push_str(&format!("\\{} ", format!("{:x}", cp).to_uppercase()));
            } else if ch == '\\' || (!is_ident && ch == quote && (ch == '"' || ch == '\'')) || (is_ident && single_escape(ch)) {
                out.push('\\');
                out.push(ch);
            } else {
                out.push(ch);
            }
        }
    }
    if is_ident {
        let first = s.chars().next();
        let ob = out.as_bytes();
        if ob.len() >= 2 && ob[0] == b'-' && (ob[1] == b'-' || ob[1].is_ascii_digit()) {
            out = format!("\\-{}", &out[1..]);
        } else if let Some(f) = first {
            if f.is_ascii_digit() {
                out = format!("\\3{} {}", f, &out[f.len_utf8()..]);
            }
        }
    }
    out = crate::commands::upgrade::jsre::replace_fn("(^|\\\\+)?(\\\\[A-F0-9]{1,6})\\x20(?![a-fA-F0-9\\x20])", "g", &out, |g| {
        let g1 = g[1].unwrap_or("");
        if !g1.is_empty() && g1.len() % 2 == 1 {
            return g[0].unwrap_or("").to_string();
        }
        format!("{}{}", g1, g[2].unwrap_or(""))
    });
    if !is_ident {
        return format!("{}{}{}", quote, out, quote);
    }
    out
}

fn single_escape(c: char) -> bool {
    // /[ -,\.\/:-@\[\]\^`\{-~]/
    matches!(c, ' '..=',' | '.' | '/' | ':'..='@' | '[' | ']' | '^' | '`' | '{'..='~')
}

// ---------------------------------------------------------------- parser

struct P<'a> {
    css: &'a str,
    toks: Vec<Tk>,
    pos: usize,
    sel: Sel,
    current: usize,
    spaces: String,
}

fn is_ws_tok(t: T) -> bool {
    t == T::Space
}

impl<'a> P<'a> {
    fn cur(&self) -> Option<Tk> {
        self.toks.get(self.pos).copied()
    }
    fn next_tok(&self) -> Option<Tk> {
        self.toks.get(self.pos + 1).copied()
    }
    fn prev_tok(&self) -> Option<Tk> {
        if self.pos == 0 {
            None
        } else {
            self.toks.get(self.pos - 1).copied()
        }
    }
    fn content(&self, t: Tk) -> &'a str {
        &self.css[t.start..t.end]
    }
    fn cc(&self) -> &'a str {
        self.content(self.cur().unwrap())
    }
    fn err(&self, msg: impl Into<String>, byte: Option<usize>) -> SelError {
        SelError { message: msg.into(), index: byte.map(|b| u16_at(self.css, b)) }
    }
    fn err_raw_index(&self, msg: impl Into<String>, idx: usize) -> SelError {
        SelError { message: msg.into(), index: Some(idx) }
    }
    fn expected(&self, desc: &str, byte: usize, found: Option<&str>) -> SelError {
        let an = if desc.starts_with(['a', 'e', 'i', 'o', 'u']) { "an" } else { "a" };
        match found {
            None => self.err(format!("Expected {} {}.", an, desc), Some(byte)),
            Some(f) => self.err(format!("Expected {} {}, found \"{}\" instead.", an, desc, f), Some(byte)),
        }
    }
    fn add(&mut self, n: SNode) -> usize {
        self.sel.n.push(n);
        self.sel.n.len() - 1
    }
    fn append_to(&mut self, parent: usize, child: usize) {
        self.sel.n[child].parent = Some(parent);
        self.sel.n[parent].nodes.get_or_insert_with(Vec::new).push(child);
    }
    fn last_of(&self, c: usize) -> Option<usize> {
        self.sel.n[c].nodes.as_ref().and_then(|n| n.last().copied())
    }
    fn new_node(&mut self, mut n: SNode, namespace: Option<Ns>) -> usize {
        if let Some(ns) = namespace {
            let ns = match ns {
                Ns::S(s) if !s.is_empty() && s.chars().all(|c| c == ' ') => {
                    self.spaces.push_str(&s);
                    Ns::True
                }
                other => other,
            };
            if ns != Ns::None {
                n.namespace = ns;
                if let Ns::S(s) = &n.namespace {
                    if s.contains('\\') {
                        let raw = s.clone();
                        n.namespace = Ns::S(unesc(&raw));
                        n.raws.entry("namespace").or_insert(raw);
                    }
                }
            }
        }
        if !self.spaces.is_empty() {
            n.spaces.insert("before".into(), std::mem::take(&mut self.spaces));
        }
        let id = self.add(n);
        let c = self.current;
        self.append_to(c, id);
        id
    }

    fn run(&mut self) -> Result<(), SelError> {
        while self.pos < self.toks.len() {
            self.parse(true)?;
        }
        Ok(())
    }

    fn parse(&mut self, throw_on_paren: bool) -> Result<(), SelError> {
        let t = self.cur().unwrap();
        match t.t {
            T::Space => self.space(),
            T::Comment => {
                let mut n = SNode::new(SType::Comment);
                n.value = Some(self.cc().to_string());
                n.source_index = t.start;
                self.new_node(n, None);
                self.pos += 1;
                Ok(())
            }
            T::C(b'(') => self.parentheses(),
            T::C(b')') => {
                if throw_on_paren {
                    return Err(self.expected("opening parenthesis", t.start, None));
                }
                Ok(())
            }
            T::C(b'[') => self.attribute(),
            T::C(b'$') | T::C(b'^') | T::C(b'=') | T::Word => self.word(None),
            T::C(b':') => self.pseudo(),
            T::C(b',') => self.comma(),
            T::C(b'*') => self.universal(None),
            T::C(b'&') => self.nesting(),
            T::C(b'/') | T::Combinator => self.combinator(),
            T::Str => {
                let mut n = SNode::new(SType::Str);
                n.value = Some(self.cc().to_string());
                n.source_index = t.start;
                self.new_node(n, None);
                self.pos += 1;
                Ok(())
            }
            T::C(b']') => Err(self.expected("opening square bracket", t.start, None)),
            T::C(b';') => Err(self.err("Expected a backslash preceding the semicolon.", Some(t.start))),
            _ => Err(self.unexpected()),
        }
    }

    fn unexpected(&self) -> SelError {
        // `this.error(msg, number)`: PostCSS ignores a bare number position.
        SelError { message: format!("Unexpected '{}'. Escaping special characters with \\ may help.", self.cc()), index: None }
    }

    fn space(&mut self) -> Result<(), SelError> {
        let content = self.cc().to_string();
        let prev = self.prev_tok();
        let cur_all_comments = self.sel.n[self.current].nodes.as_ref().map(|ns| ns.iter().all(|&n| self.sel.n[n].ty == SType::Comment)).unwrap_or(true);
        if self.pos == 0 || matches!(prev.map(|p| p.t), Some(T::C(b',')) | Some(T::C(b'('))) || cur_all_comments {
            self.spaces = content;
            self.pos += 1;
        } else if self.pos == self.toks.len() - 1 || matches!(self.next_tok().map(|n| n.t), Some(T::C(b',')) | Some(T::C(b')'))) {
            let last = self.last_of(self.current).unwrap();
            self.sel.n[last].spaces.insert("after".into(), content);
            self.pos += 1;
        } else {
            self.combinator()?;
        }
        Ok(())
    }

    fn locate_next_meaningful(&self, start: usize) -> Option<usize> {
        let mut i = start;
        while i < self.toks.len() {
            if matches!(self.toks[i].t, T::Space | T::Comment) {
                i += 1;
                continue;
            }
            return Some(i);
        }
        None
    }

    fn parse_ws_equiv(&mut self, stop: Option<usize>) -> Vec<SNode> {
        let stop = stop.unwrap_or(self.toks.len());
        let start_pos = self.pos;
        let mut nodes: Vec<SNode> = vec![];
        let mut space = String::new();
        let mut last_comment: Option<usize> = None;
        loop {
            let t = self.cur().unwrap();
            if is_ws_tok(t.t) {
                space.push_str(self.content(t));
            } else if t.t == T::Comment {
                let mut c = SNode::new(SType::Comment);
                c.value = Some(self.content(t).to_string());
                c.source_index = t.start;
                if !space.is_empty() {
                    c.spaces.insert("before".into(), std::mem::take(&mut space));
                }
                nodes.push(c);
                last_comment = Some(nodes.len() - 1);
            }
            self.pos += 1;
            if self.pos >= stop {
                break;
            }
        }
        if !space.is_empty() {
            if let Some(lc) = last_comment {
                nodes[lc].spaces.insert("after".into(), space);
            } else {
                let mut s = SNode::new(SType::Str);
                s.value = Some(String::new());
                s.source_index = self.toks[start_pos].start;
                s.spaces.insert("before".into(), space);
                s.spaces.insert("after".into(), String::new());
                nodes.push(s);
            }
        }
        nodes
    }

    fn ws_to_space(nodes: &[SNode]) -> (String, Option<String>) {
        let mut space = String::new();
        let mut raw = String::new();
        for n in nodes {
            let sb = n.sp("before");
            space.push_str(&sb);
            space.push_str(&n.sp("after"));
            raw.push_str(&sb);
            raw.push_str(n.val());
            raw.push_str(&n.raw_space_after());
        }
        if raw == space {
            (space, None)
        } else {
            (space, Some(raw))
        }
    }

    fn is_named_combinator(&self, p: usize) -> bool {
        matches!(self.toks.get(p).map(|t| t.t), Some(T::C(b'/'))) && matches!(self.toks.get(p + 1).map(|t| t.t), Some(T::Word)) && matches!(self.toks.get(p + 2).map(|t| t.t), Some(T::C(b'/')))
    }

    fn combinator(&mut self) -> Result<(), SelError> {
        if self.cc() == "|" {
            return self.namespace();
        }
        let next_sig = self.locate_next_meaningful(self.pos);
        if next_sig.is_none() || matches!(self.toks[next_sig.unwrap()].t, T::C(b',') | T::C(b')')) {
            let nodes = self.parse_ws_equiv(next_sig);
            if !nodes.is_empty() {
                if let Some(last) = self.last_of(self.current) {
                    let (space, raw) = Self::ws_to_space(&nodes);
                    if let Some(r) = raw {
                        let cur = self.sel.n[last].raw_space_after();
                        self.sel.n[last].raw_spaces.insert("after".into(), cur + &r);
                    }
                    let a = self.sel.n[last].sp("after");
                    self.sel.n[last].spaces.insert("after".into(), a + &space);
                } else {
                    for n in nodes {
                        self.new_node(n, None);
                    }
                }
            }
            return Ok(());
        }
        let next_sig = next_sig.unwrap();
        let first = self.cur().unwrap();
        let mut sods: Option<Vec<SNode>> = None;
        if next_sig > self.pos {
            sods = Some(self.parse_ws_equiv(Some(next_sig)));
        }
        let mut node: Option<SNode> = None;
        if self.is_named_combinator(self.pos) {
            let name_raw = self.content(self.toks[self.pos + 1]).to_string();
            let name = unesc(&name_raw).to_lowercase();
            let mut n = SNode::new(SType::Combinator);
            if name != name_raw {
                n.raws.insert("value", format!("/{}/", name_raw));
            }
            n.value = Some(format!("/{}/", name));
            n.source_index = self.cur().unwrap().start;
            self.pos += 3;
            node = Some(n);
        } else if self.cur().map(|t| t.t) == Some(T::Combinator) {
            let mut n = SNode::new(SType::Combinator);
            n.value = Some(self.cc().to_string());
            n.source_index = self.cur().unwrap().start;
            self.pos += 1;
            node = Some(n);
        } else if self.cur().map(|t| is_ws_tok(t.t)).unwrap_or(false) {
        } else if sods.is_none() {
            return Err(self.unexpected());
        }
        let mut node = match node {
            Some(mut n) => {
                if let Some(s) = &sods {
                    let (space, raw) = Self::ws_to_space(s);
                    n.spaces.insert("before".into(), space);
                    match raw {
                        Some(r) => {
                            n.raw_spaces.insert("before".into(), r);
                        }
                        None => {
                            // `rawSpaceBefore = undefined` stores undefined
                            n.raw_spaces.remove("before");
                        }
                    }
                }
                n
            }
            None => {
                let s = sods.unwrap_or_default();
                let (space, raw) = Self::ws_to_space_required(&s);
                let raw = match raw {
                    Some(r) if !r.is_empty() => r,
                    _ => space.clone(),
                };
                let mut n = SNode::new(SType::Combinator);
                n.value = Some(" ".into());
                n.source_index = first.start;
                if space.ends_with(' ') && raw.ends_with(' ') {
                    n.spaces.insert("before".into(), space[..space.len() - 1].to_string());
                    n.raw_spaces.insert("before".into(), raw[..raw.len() - 1].to_string());
                } else if space.starts_with(' ') && raw.starts_with(' ') {
                    n.spaces.insert("after".into(), space[1..].to_string());
                    n.raw_spaces.insert("after".into(), raw[1..].to_string());
                } else {
                    n.raws.insert("value", raw);
                }
                n
            }
        };
        if self.cur().map(|t| t.t) == Some(T::Space) {
            node.spaces.insert("after".into(), self.cc().to_string());
            self.pos += 1;
        }
        self.new_node(node, None);
        Ok(())
    }

    fn ws_to_space_required(nodes: &[SNode]) -> (String, Option<String>) {
        // lossless: `requiredSpace` changes nothing
        Self::ws_to_space(nodes)
    }

    fn comma(&mut self) -> Result<(), SelError> {
        if self.pos == self.toks.len() - 1 {
            self.sel.n[self.sel.root].trailing_comma = true;
            self.pos += 1;
            return Ok(());
        }
        let mut s = SNode::new(SType::Selector);
        s.source_index = self.toks[self.pos + 1].start;
        let id = self.add(s);
        let parent = self.sel.n[self.current].parent.unwrap();
        self.append_to(parent, id);
        self.current = id;
        self.pos += 1;
        Ok(())
    }

    fn namespace(&mut self) -> Result<(), SelError> {
        let prev = self.prev_tok();
        let before = match prev {
            Some(p) if matches!(p.t, T::Word | T::C(b'*') | T::C(b'&')) => Ns::S(self.content(p).to_string()),
            _ => Ns::True,
        };
        let nt = match self.next_tok() {
            Some(n) => n,
            None => return Err(SelError { message: "Unexpected '|'.".into(), index: None }),
        };
        if nt.t == T::Word {
            self.pos += 1;
            return self.word(Some(before));
        } else if nt.t == T::C(b'*') {
            self.pos += 1;
            return self.universal(Some(before));
        }
        Err(SelError { message: "Unexpected '|'.".into(), index: None })
    }

    fn nesting(&mut self) -> Result<(), SelError> {
        if let Some(n) = self.next_tok() {
            if self.content(n) == "|" {
                self.pos += 1;
                return Ok(());
            }
        }
        let t = self.cur().unwrap();
        let mut n = SNode::new(SType::Nesting);
        n.value = Some(self.cc().to_string());
        n.source_index = t.start;
        self.new_node(n, None);
        self.pos += 1;
        Ok(())
    }

    fn universal(&mut self, ns: Option<Ns>) -> Result<(), SelError> {
        if let Some(n) = self.next_tok() {
            if self.content(n) == "|" {
                self.pos += 1;
                return self.namespace();
            }
        }
        let t = self.cur().unwrap();
        let mut n = SNode::new(SType::Universal);
        n.value = Some(self.cc().to_string());
        n.source_index = t.start;
        self.new_node(n, ns);
        self.pos += 1;
        Ok(())
    }

    fn word(&mut self, ns: Option<Ns>) -> Result<(), SelError> {
        if let Some(n) = self.next_tok() {
            if self.content(n) == "|" {
                self.pos += 1;
                return self.namespace();
            }
        }
        self.split_word(ns, false)
    }

    fn split_word(&mut self, mut ns: Option<Ns>, pseudo_first: bool) -> Result<(), SelError> {
        self.split_word_cb(&mut ns, pseudo_first, None)
    }

    /// Returns the first piece when `first_cb` is requested (the pseudo case).
    fn split_word_cb(&mut self, ns: &mut Option<Ns>, _unused: bool, mut first: Option<&mut dyn FnMut(&mut P<'a>, String, usize) -> Result<(), SelError>>) -> Result<(), SelError> {
        let mut next = self.next_tok();
        let mut word = self.cc().to_string();
        while let Some(nt) = next {
            if !matches!(nt.t, T::C(b'$') | T::C(b'^') | T::C(b'=') | T::Word) {
                break;
            }
            self.pos += 1;
            let current = self.cc().to_string();
            word.push_str(&current);
            if current.ends_with('\\') {
                if let Some(n2) = self.next_tok() {
                    if n2.t == T::Space {
                        word.push_str(self.content(n2));
                        self.pos += 1;
                    }
                }
            }
            next = self.next_tok();
        }
        let wb = word.as_bytes();
        let keyframes = crate::commands::upgrade::jsre::test("^\\d+\\.\\d+%$", "", &word);
        let has_class: Vec<usize> = (0..wb.len()).filter(|&i| wb[i] == b'.' && !(i > 0 && wb[i - 1] == b'\\') && !keyframes).collect();
        let interp: Vec<usize> = (0..wb.len()).filter(|&i| wb[i] == b'#' && wb.get(i + 1) == Some(&b'{')).collect();
        let has_id: Vec<usize> = (0..wb.len()).filter(|&i| wb[i] == b'#' && !(i > 0 && wb[i - 1] == b'\\') && !interp.contains(&i)).collect();
        let mut indices: Vec<usize> = vec![0];
        for &i in has_class.iter().chain(has_id.iter()) {
            if !indices.contains(&i) {
                indices.push(i);
            }
        }
        indices.sort();
        let cur = self.cur().unwrap();
        let count = indices.len();
        for (i, &ind) in indices.iter().enumerate() {
            let index = indices.get(i + 1).copied().filter(|&x| x != 0).unwrap_or(word.len());
            let value = word[ind..index].to_string();
            if i == 0 {
                if let Some(f) = first.as_mut() {
                    f(self, value, count)?;
                    continue;
                }
            }
            let source_index = cur.start + ind;
            let mut n;
            if has_class.contains(&ind) {
                n = SNode::new(SType::Class);
                n.value = Some(value[1..].to_string());
            } else if has_id.contains(&ind) {
                n = SNode::new(SType::Id);
                n.value = Some(value[1..].to_string());
            } else {
                n = SNode::new(SType::Tag);
                n.value = Some(value.clone());
            }
            n.source_index = source_index;
            let v = n.value.clone().unwrap();
            if v.contains('\\') {
                n.value = Some(unesc(&v));
                n.raws.entry("value").or_insert(v);
            }
            self.new_node(n, ns.take());
        }
        self.pos += 1;
        Ok(())
    }

    fn pseudo(&mut self) -> Result<(), SelError> {
        let mut pseudo_str = String::new();
        let starting = self.cur().unwrap();
        while self.cur().map(|t| t.t) == Some(T::C(b':')) {
            pseudo_str.push_str(self.cc());
            self.pos += 1;
        }
        let cur = match self.cur() {
            Some(c) => c,
            None => {
                // `this.expected([...], this.position - 1)`: a token index.
                return Err(self.err_raw_index("Expected a pseudo-class or pseudo-element.", self.pos - 1));
            }
        };
        if cur.t == T::Word {
            let mut ns = None;
            let mut cb = |p: &mut P<'a>, first: String, length: usize| -> Result<(), SelError> {
                let mut n = SNode::new(SType::Pseudo);
                n.value = Some(format!("{}{}", pseudo_str, first));
                n.source_index = starting.start;
                p.new_node(n, None);
                if length > 1 {
                    if let Some(nt) = p.next_tok() {
                        if nt.t == T::C(b'(') {
                            return Err(p.err("Misplaced parenthesis.", Some(nt.start)));
                        }
                    }
                }
                Ok(())
            };
            self.split_word_cb(&mut ns, false, Some(&mut cb))
        } else {
            Err(self.expected("pseudo-class or pseudo-element", cur.start, None))
        }
    }

    fn parentheses(&mut self) -> Result<(), SelError> {
        let last = self.last_of(self.current);
        let mut unbalanced = 1;
        let opening = self.cur().unwrap();
        self.pos += 1;
        if let Some(l) = last.filter(|&l| self.sel.n[l].ty == SType::Pseudo) {
            let mut s = SNode::new(SType::Selector);
            s.source_index = self.toks.get(self.pos).map(|t| t.start).unwrap_or(0);
            let sid = self.add(s);
            self.append_to(l, sid);
            let cache = self.current;
            self.current = sid;
            while self.pos < self.toks.len() && unbalanced > 0 {
                let t = self.cur().unwrap();
                if t.t == T::C(b'(') {
                    unbalanced += 1;
                }
                if t.t == T::C(b')') {
                    unbalanced -= 1;
                }
                if unbalanced > 0 {
                    self.parse(false)?;
                } else {
                    self.pos += 1;
                }
            }
            self.current = cache;
        } else {
            let mut paren_value = String::from("(");
            let paren_start = self.cur();
            while self.pos < self.toks.len() && unbalanced > 0 {
                let t = self.cur().unwrap();
                if t.t == T::C(b'(') {
                    unbalanced += 1;
                }
                if t.t == T::C(b')') {
                    unbalanced -= 1;
                }
                paren_value.push_str(self.content(t));
                self.pos += 1;
            }
            if let Some(l) = last {
                // appendToPropertyAndEscape("value", v, v)
                let orig = self.sel.n[l].value.clone().unwrap_or_default();
                let orig_esc = self.sel.n[l].raws.get("value").cloned();
                self.sel.n[l].value = Some(orig.clone() + &paren_value);
                match orig_esc {
                    Some(e) if !e.is_empty() => {
                        self.sel.n[l].raws.insert("value", e + &paren_value);
                    }
                    _ => {
                        self.sel.n[l].raws.remove("value");
                    }
                }
            } else {
                let mut s = SNode::new(SType::Str);
                s.value = Some(paren_value);
                s.source_index = paren_start.map(|t| t.start).unwrap_or(opening.start);
                self.new_node(s, None);
            }
        }
        if unbalanced > 0 {
            let at = self.cur().unwrap_or(opening).start;
            return Err(self.expected("closing parenthesis", at, None));
        }
        Ok(())
    }

    fn attribute(&mut self) -> Result<(), SelError> {
        let mut attr: Vec<Tk> = vec![];
        let starting = self.cur().unwrap();
        self.pos += 1;
        while self.pos < self.toks.len() && self.cur().unwrap().t != T::C(b']') {
            attr.push(self.cur().unwrap());
            self.pos += 1;
        }
        if self.cur().is_none() {
            return Err(self.expected("closing square bracket", starting.start, None));
        }
        let len = attr.len();
        let mut node = SNode::new(SType::Attribute);
        node.source_index = starting.start;
        if len == 1 && attr[0].t != T::Word {
            return Err(self.expected("attribute", attr[0].start, None));
        }
        let mut pos = 0;
        let mut space_before = String::new();
        let mut comment_before = String::new();
        let mut last_added: Option<&'static str> = None;
        let mut space_after_meaningful = false;
        let mut value_set = false;
        while pos < len {
            let token = attr[pos];
            let content = self.content(token).to_string();
            let next = attr.get(pos + 1).copied();
            match token.t {
                T::Space => {
                    space_after_meaningful = true;
                    if let Some(la) = last_added {
                        let k = format!("{}.after", la);
                        let prev = node.spaces.get(&k).cloned().unwrap_or_default();
                        node.spaces.insert(k.clone(), prev + &content);
                        if let Some(ex) = node.raw_spaces.get(&k).cloned() {
                            if !ex.is_empty() {
                                node.raw_spaces.insert(k, ex + &content);
                            }
                        }
                    } else {
                        space_before.push_str(&content);
                        comment_before.push_str(&content);
                    }
                }
                T::C(b'*') => {
                    if next.map(|n| n.t) == Some(T::C(b'=')) {
                        node.operator = Some(content.clone());
                        last_added = Some("operator");
                    } else if (node.namespace == Ns::None || (last_added == Some("namespace") && !space_after_meaningful)) && next.is_some() {
                        if !space_before.is_empty() {
                            node.spaces.insert("attribute.before".into(), std::mem::take(&mut space_before));
                        }
                        if !comment_before.is_empty() {
                            node.raw_spaces.insert("attribute.before".into(), std::mem::take(&mut comment_before));
                        }
                        let cur = match &node.namespace {
                            Ns::S(s) => s.clone(),
                            Ns::True => "true".into(),
                            Ns::None => String::new(),
                        };
                        node.namespace = Ns::S(cur + &content);
                        if let Some(r) = node.raws.get("namespace").cloned() {
                            if !r.is_empty() {
                                node.raws.insert("namespace", r + &content);
                            }
                        }
                        last_added = Some("namespace");
                    }
                    space_after_meaningful = false;
                }
                T::C(b'$') if last_added == Some("value") => {
                    let old_raw = node.raws.get("value").cloned();
                    node.value = Some(node.value.clone().unwrap_or_default() + "$");
                    if let Some(o) = old_raw {
                        if !o.is_empty() {
                            node.raws.insert("value", o + "$");
                        }
                    }
                }
                T::C(b'$') | T::C(b'^') => {
                    if next.map(|n| n.t) == Some(T::C(b'=')) {
                        node.operator = Some(content.clone());
                        last_added = Some("operator");
                    }
                    space_after_meaningful = false;
                }
                T::Combinator => {
                    if content == "~" && next.map(|n| n.t) == Some(T::C(b'=')) {
                        node.operator = Some(content.clone());
                        last_added = Some("operator");
                    }
                    if content != "|" {
                        space_after_meaningful = false;
                    } else {
                        if next.map(|n| n.t) == Some(T::C(b'=')) {
                            node.operator = Some(content.clone());
                            last_added = Some("operator");
                        } else if node.namespace == Ns::None && node.attribute.is_none() {
                            node.namespace = Ns::True;
                        }
                        space_after_meaningful = false;
                    }
                }
                T::Word => {
                    let ns_empty = node.namespace == Ns::None;
                    if next.is_some() && self.content(next.unwrap()) == "|" && attr.get(pos + 2).map(|t| t.t != T::C(b'=')).unwrap_or(false) && node.operator.is_none() && ns_empty {
                        node.namespace = Ns::S(content.clone());
                        last_added = Some("namespace");
                    } else if node.attribute.as_deref().map(|a| a.is_empty()).unwrap_or(true) || (last_added == Some("attribute") && !space_after_meaningful) {
                        if !space_before.is_empty() {
                            node.spaces.insert("attribute.before".into(), std::mem::take(&mut space_before));
                        }
                        if !comment_before.is_empty() {
                            node.raw_spaces.insert("attribute.before".into(), std::mem::take(&mut comment_before));
                        }
                        node.attribute = Some(node.attribute.clone().unwrap_or_default() + &content);
                        if let Some(r) = node.raws.get("attribute").cloned() {
                            if !r.is_empty() {
                                node.raws.insert("attribute", r + &content);
                            }
                        }
                        last_added = Some("attribute");
                    } else if (!value_set) || (last_added == Some("value") && !(space_after_meaningful || matches!(node.quote_mark, Some(Some(_))))) {
                        let un = unesc(&content);
                        let old_raw = node.raws.get("value").cloned().unwrap_or_default();
                        let old_value = node.value.clone().unwrap_or_default();
                        node.value = Some(old_value.clone() + &un);
                        value_set = true;
                        node.quote_mark = Some(None);
                        if un != content || !old_raw.is_empty() {
                            let base = if old_raw.is_empty() { old_value } else { old_raw };
                            node.raws.insert("value", base + &content);
                        }
                        last_added = Some("value");
                    } else {
                        let insensitive = content == "i" || content == "I";
                        if value_set && (matches!(node.quote_mark, Some(Some(_))) || space_after_meaningful) {
                            node.insensitive = insensitive;
                            if !insensitive || content == "I" {
                                node.raws.insert("insensitiveFlag", content.clone());
                            }
                            last_added = Some("insensitive");
                            if !space_before.is_empty() {
                                node.spaces.insert("insensitive.before".into(), std::mem::take(&mut space_before));
                            }
                            if !comment_before.is_empty() {
                                node.raw_spaces.insert("insensitive.before".into(), std::mem::take(&mut comment_before));
                            }
                        } else if value_set {
                            last_added = Some("value");
                            node.value = Some(node.value.clone().unwrap_or_default() + &content);
                            if let Some(r) = node.raws.get("value").cloned() {
                                if !r.is_empty() {
                                    node.raws.insert("value", r + &content);
                                }
                            }
                        }
                    }
                    space_after_meaningful = false;
                }
                T::Str => {
                    if node.attribute.as_deref().map(|a| a.is_empty()).unwrap_or(true) || node.operator.as_deref().map(|a| a.is_empty()).unwrap_or(true) {
                        return Err(self.err("Expected an attribute followed by an operator preceding the string.", Some(token.start)));
                    }
                    let (un, qm) = unescape_value(&content);
                    node.value = Some(un);
                    value_set = true;
                    node.quote_mark = Some(qm);
                    last_added = Some("value");
                    node.raws.insert("value", content.clone());
                    space_after_meaningful = false;
                }
                T::C(b'=') => {
                    if node.attribute.as_deref().map(|a| a.is_empty()).unwrap_or(true) {
                        return Err(self.expected("attribute", token.start, Some(&content)));
                    }
                    if node.value.as_deref().map(|v| !v.is_empty()).unwrap_or(false) {
                        return Err(self.err("Unexpected \"=\" found; an operator was already defined.", Some(token.start)));
                    }
                    node.operator = Some(match &node.operator {
                        Some(o) if !o.is_empty() => o.clone() + &content,
                        _ => content.clone(),
                    });
                    last_added = Some("operator");
                    space_after_meaningful = false;
                }
                T::Comment => {
                    if let Some(la) = last_added {
                        if space_after_meaningful || next.map(|n| n.t) == Some(T::Space) || la == "insensitive" {
                            let k = format!("{}.after", la);
                            let last_c = node.spaces.get(&k).cloned().unwrap_or_default();
                            let raw_last = node.raw_spaces.get(&k).cloned().filter(|s| !s.is_empty()).unwrap_or(last_c);
                            node.raw_spaces.insert(k, raw_last + &content);
                        } else {
                            let last_value = match la {
                                "operator" => node.operator.clone(),
                                "attribute" => node.attribute.clone(),
                                "value" => node.value.clone(),
                                "namespace" => match &node.namespace {
                                    Ns::S(s) => Some(s.clone()),
                                    Ns::True => Some("true".into()),
                                    Ns::None => None,
                                },
                                _ => Some(if node.insensitive { "true".into() } else { "false".into() }),
                            }
                            .unwrap_or_default();
                            let key: &'static str = match la {
                                "operator" => "operator",
                                "attribute" => "attribute",
                                "value" => "value",
                                "namespace" => "namespace",
                                _ => "insensitive",
                            };
                            let raw_last = node.raws.get(key).cloned().filter(|s| !s.is_empty()).unwrap_or(last_value);
                            node.raws.insert(key, raw_last + &content);
                        }
                    } else {
                        comment_before.push_str(&content);
                    }
                }
                _ => return Err(self.err(format!("Unexpected \"{}\" found.", content), Some(token.start))),
            }
            pos += 1;
        }
        for prop in ["attribute", "namespace"] {
            let v = if prop == "attribute" {
                node.attribute.clone()
            } else {
                match &node.namespace {
                    Ns::S(s) => Some(s.clone()),
                    _ => None,
                }
            };
            if let Some(v) = v {
                if v.contains('\\') {
                    let un = unesc(&v);
                    if prop == "attribute" {
                        node.attribute = Some(un);
                    } else {
                        node.namespace = Ns::S(un);
                    }
                    let key: &'static str = if prop == "attribute" { "attribute" } else { "namespace" };
                    node.raws.entry(key).or_insert(v);
                }
            }
        }
        if !value_set {
            node.value = None;
        }
        self.new_node(node, None);
        self.pos += 1;
        Ok(())
    }
}

fn unescape_value(v: &str) -> (String, Option<char>) {
    let mut q = None;
    let mut un = v.to_string();
    if let Some(c) = crate::commands::upgrade::jsre::captures("^('|\")([^]*)\\1$", "", v) {
        q = c[1].as_ref().and_then(|s| s.chars().next());
        un = c[2].clone().unwrap_or_default();
    }
    (unesc(&un), q)
}

/// `selectorParser().astSync(css, {lossless: true})`
pub fn parse(css: &str) -> Result<Sel, SelError> {
    let toks = tokenize(css)?;
    let mut sel = Sel { n: vec![], root: 0, indexes: HashMap::new(), last_each: 0 };
    sel.n.push(SNode::new(SType::Root));
    let mut s = SNode::new(SType::Selector);
    s.parent = Some(0);
    sel.n.push(s);
    sel.n[0].nodes = Some(vec![1]);
    let mut p = P { css, toks, pos: 0, sel, current: 1, spaces: String::new() };
    p.run()?;
    Ok(p.sel)
}

// ---------------------------------------------------------------- tree API

impl Sel {
    pub fn kids(&self, id: usize) -> Vec<usize> {
        self.n[id].nodes.clone().unwrap_or_default()
    }
    pub fn ty(&self, id: usize) -> SType {
        self.n[id].ty
    }
    pub fn val(&self, id: usize) -> &str {
        self.n[id].val()
    }
    pub fn add(&mut self, n: SNode) -> usize {
        self.n.push(n);
        self.n.len() - 1
    }

    /// Builders: `selectorParser.className({value})` etc.
    pub fn class_name(&mut self, v: &str) -> usize {
        let mut n = SNode::new(SType::Class);
        n.value = Some(v.to_string());
        self.add(n)
    }
    pub fn combinator(&mut self, v: &str) -> usize {
        let mut n = SNode::new(SType::Combinator);
        n.value = Some(v.to_string());
        self.add(n)
    }
    pub fn universal(&mut self, v: &str) -> usize {
        let mut n = SNode::new(SType::Universal);
        n.value = Some(v.to_string());
        self.add(n)
    }
    pub fn selector(&mut self, kids: Vec<usize>) -> usize {
        let mut n = SNode::new(SType::Selector);
        n.value = Some(String::new());
        let id = self.add(n);
        for k in &kids {
            self.n[*k].parent = Some(id);
        }
        self.n[id].nodes = Some(kids);
        id
    }
    pub fn pseudo(&mut self, v: &str, kids: Vec<usize>) -> usize {
        let mut n = SNode::new(SType::Pseudo);
        n.value = Some(v.to_string());
        let id = self.add(n);
        for k in &kids {
            self.n[*k].parent = Some(id);
        }
        self.n[id].nodes = Some(kids);
        id
    }
    /// `selectorParser.attribute({attribute, operator: '=', value, quoteMark: '"', raws: {value}})`
    pub fn attribute_eq(&mut self, attribute: &str, value: &str, raw_value: &str) -> usize {
        let mut n = SNode::new(SType::Attribute);
        n.attribute = Some(attribute.to_string());
        n.operator = Some("=".into());
        n.value = Some(value.to_string());
        n.quote_mark = Some(Some('"'));
        n.raws.insert("value", raw_value.to_string());
        self.add(n)
    }

    /// `node.clone()`: deep copy without the parent link.
    pub fn clone_node(&mut self, id: usize) -> usize {
        let mut c = self.n[id].clone();
        c.parent = None;
        let kids = c.nodes.clone();
        let nid = self.add(c);
        if let Some(ks) = kids {
            let mut nk = vec![];
            for k in ks {
                let ck = self.clone_node(k);
                self.n[ck].parent = Some(nid);
                nk.push(ck);
            }
            self.n[nid].nodes = Some(nk);
        }
        nid
    }

    pub fn index_in(&self, parent: usize, child: usize) -> Option<usize> {
        self.n[parent].nodes.as_ref().and_then(|ns| ns.iter().position(|&x| x == child))
    }

    pub fn remove(&mut self, id: usize) {
        if let Some(p) = self.n[id].parent {
            let i = self.index_in(p, id).unwrap();
            self.n[p].nodes.as_mut().unwrap().remove(i);
            if let Some(m) = self.indexes.get_mut(&p) {
                for v in m.values_mut() {
                    if *v as i64 >= i as i64 {
                        *v = v.wrapping_sub(1);
                    }
                }
            }
        }
        self.n[id].parent = None;
    }

    pub fn insert_before(&mut self, parent: usize, old: usize, new: usize) {
        self.n[new].parent = Some(parent);
        let oi = self.index_in(parent, old).unwrap();
        self.n[parent].nodes.as_mut().unwrap().insert(oi, new);
        if let Some(m) = self.indexes.get_mut(&parent) {
            for v in m.values_mut() {
                if *v != usize::MAX && *v >= oi {
                    *v += 1;
                }
            }
        }
    }

    pub fn insert_after(&mut self, parent: usize, old: usize, new: usize) {
        self.n[new].parent = Some(parent);
        let oi = self.index_in(parent, old).unwrap();
        self.n[parent].nodes.as_mut().unwrap().insert(oi + 1, new);
        if let Some(m) = self.indexes.get_mut(&parent) {
            for v in m.values_mut() {
                if *v != usize::MAX && oi < *v {
                    *v += 1;
                }
            }
        }
    }

    pub fn replace_with(&mut self, id: usize, new: usize) {
        if let Some(p) = self.n[id].parent {
            self.insert_before(p, id, new);
            self.remove(id);
        }
    }

    /// `container.each(cb)` with live indexes; `cb` returns false to stop.
    pub fn each(&mut self, c: usize, f: &mut dyn FnMut(&mut Sel, usize) -> bool) -> bool {
        self.last_each += 1;
        let it = self.last_each;
        self.indexes.entry(c).or_default().insert(it, 0);
        let mut stopped = false;
        loop {
            let i = self.indexes[&c][&it];
            let len = self.n[c].nodes.as_ref().map(|n| n.len()).unwrap_or(0);
            // `index` may have wrapped below zero after a removal at 0
            if i == usize::MAX {
                self.indexes.get_mut(&c).unwrap().insert(it, 0);
                continue;
            }
            if i >= len {
                break;
            }
            let child = self.n[c].nodes.as_ref().unwrap()[i];
            if !f(self, child) {
                stopped = true;
                break;
            }
            let i = self.indexes[&c][&it];
            self.indexes.get_mut(&c).unwrap().insert(it, i.wrapping_add(1));
        }
        self.indexes.get_mut(&c).unwrap().remove(&it);
        !stopped
    }

    pub fn walk(&mut self, c: usize, f: &mut dyn FnMut(&mut Sel, usize) -> bool) -> bool {
        self.each(c, &mut |s, node| {
            let mut r = f(s, node);
            if r && s.n[node].nodes.as_ref().map(|n| !n.is_empty()).unwrap_or(false) {
                r = s.walk(node, f);
            }
            r
        })
    }

    pub fn walk_type(&mut self, c: usize, ty: SType, f: &mut dyn FnMut(&mut Sel, usize)) {
        self.walk(c, &mut |s, n| {
            if s.n[n].ty == ty {
                f(s, n);
            }
            true
        });
    }

    /// `node.value = v` for a class (re-escapes as an identifier).
    pub fn set_class_value(&mut self, id: usize, v: &str) {
        let esc = cssesc(v, EscMode::Ident);
        if esc != v {
            self.n[id].raws.insert("value", esc);
        } else {
            self.n[id].raws.remove("value");
        }
        self.n[id].value = Some(v.to_string());
    }

    // ------------------------------------------------------------ toString

    fn stringify_prop(&self, id: usize, name: &'static str) -> String {
        let n = &self.n[id];
        if let Some(r) = n.raws.get(name) {
            if !r.is_empty() {
                return r.clone();
            }
        }
        match name {
            "value" => n.val().to_string(),
            "operator" => n.operator.clone().unwrap_or_default(),
            "insensitiveFlag" => if n.insensitive { "i".into() } else { String::new() },
            "namespace" => match &n.namespace {
                Ns::S(s) => s.clone(),
                Ns::True => "true".into(),
                Ns::None => String::new(),
            },
            "attribute" => n.attribute.clone().unwrap_or_default(),
            _ => String::new(),
        }
    }

    fn ns_present(&self, id: usize) -> bool {
        match &self.n[id].namespace {
            Ns::None => false,
            Ns::True => true,
            Ns::S(s) => !s.is_empty(),
        }
    }

    fn namespace_string(&self, id: usize) -> String {
        if !self.ns_present(id) {
            return String::new();
        }
        if let Some(r) = self.n[id].raws.get("namespace") {
            if !r.is_empty() {
                return r.clone();
            }
        }
        match &self.n[id].namespace {
            Ns::True => String::new(),
            Ns::S(s) => s.clone(),
            Ns::None => String::new(),
        }
    }

    fn qualified(&self, id: usize, v: &str) -> String {
        if self.ns_present(id) {
            format!("{}|{}", self.namespace_string(id), v)
        } else {
            v.to_string()
        }
    }

    fn attr_spaces(&self, id: usize, name: &str) -> (String, String) {
        let n = &self.n[id];
        let mut before = n.spaces.get(&format!("{}.before", name)).cloned().unwrap_or_default();
        let mut after = n.spaces.get(&format!("{}.after", name)).cloned().unwrap_or_default();
        if let Some(b) = n.raw_spaces.get(&format!("{}.before", name)) {
            before = b.clone();
        }
        if let Some(a) = n.raw_spaces.get(&format!("{}.after", name)) {
            after = a.clone();
        }
        (before, after)
    }

    pub fn to_string(&self, id: usize) -> String {
        let n = &self.n[id];
        match n.ty {
            SType::Root => {
                let s = self.kids(id).iter().map(|&k| self.to_string(k)).collect::<Vec<_>>().join(",");
                if n.trailing_comma {
                    s + ","
                } else {
                    s
                }
            }
            SType::Selector => self.kids(id).iter().map(|&k| self.to_string(k)).collect::<String>(),
            SType::Pseudo => {
                let kids = self.kids(id);
                let params = if !kids.is_empty() { format!("({})", kids.iter().map(|&k| self.to_string(k)).collect::<Vec<_>>().join(",")) } else { String::new() };
                format!("{}{}{}{}", n.raw_space_before(), self.stringify_prop(id, "value"), params, n.raw_space_after())
            }
            SType::Attribute => {
                let mut s = n.raw_space_before() + "[";
                let qa = self.qualified(id, &{
                    let r = n.raws.get("attribute").cloned().filter(|x| !x.is_empty());
                    r.unwrap_or_else(|| n.attribute.clone().unwrap_or_default())
                });
                let (b, a) = self.attr_spaces(id, "attribute");
                s.push_str(&format!("{}{}{}", b, qa, a));
                if n.operator.as_deref().map(|o| !o.is_empty()).unwrap_or(false) && n.value.is_some() {
                    let (b, a) = self.attr_spaces(id, "operator");
                    s.push_str(&format!("{}{}{}", b, self.stringify_prop(id, "operator"), a));
                    let (b, a) = self.attr_spaces(id, "value");
                    s.push_str(&format!("{}{}{}", b, self.stringify_prop(id, "value"), a));
                    let flag = self.stringify_prop(id, "insensitiveFlag");
                    let (mut b, a) = self.attr_spaces(id, "insensitive");
                    let quoted = matches!(n.quote_mark, Some(Some('\'')) | Some(Some('"')));
                    if !flag.is_empty() && !quoted && b.is_empty() && n.spaces.get("value.after").map(|s| s.is_empty()).unwrap_or(true) {
                        b = " ".into();
                    }
                    s.push_str(&format!("{}{}{}", b, flag, a));
                }
                s.push(']');
                s.push_str(&n.raw_space_after());
                s
            }
            _ => {
                let v = self.stringify_prop(id, "value");
                let vs = match n.ty {
                    SType::Class => format!(".{}", v),
                    SType::Id => format!("#{}", v),
                    SType::Tag | SType::Universal => self.qualified(id, &v),
                    _ => v,
                };
                format!("{}{}{}", n.raw_space_before(), vs, n.raw_space_after())
            }
        }
    }
}
