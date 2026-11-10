//! A port of PostCSS 8 (`postcss.parse`, the node tree, and the default
//! stringifier) for the CSS codemods. Offsets are UTF-8 byte offsets
//! internally; positions in error messages are converted to the UTF-16 lines
//! and columns PostCSS reports.

use std::cell::RefCell;
use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Root,
    Rule,
    AtRule,
    Decl,
    Comment,
}

/// A raw value that PostCSS keeps beside a cleaned one (`raws.selector`).
#[derive(Clone, Debug)]
pub struct RawPair {
    pub raw: String,
    pub value: String,
}

#[derive(Clone, Debug, Default)]
pub struct Raws {
    pub before: Option<String>,
    pub after: Option<String>,
    pub between: Option<String>,
    pub after_name: Option<String>,
    pub semicolon: Option<bool>,
    pub own_semicolon: Option<String>,
    pub left: Option<String>,
    pub right: Option<String>,
    pub important: Option<String>,
    pub selector: Option<RawPair>,
    pub params: Option<RawPair>,
    pub value: Option<RawPair>,
}

#[derive(Clone, Debug)]
pub struct PNode {
    pub kind: Kind,
    pub parent: Option<usize>,
    pub nodes: Option<Vec<usize>>,
    pub raws: Raws,
    pub selector: String,
    pub name: String,
    pub params: String,
    pub prop: String,
    pub value: String,
    pub important: bool,
    pub text: String,
    /// Byte offset of the node's start in the input, when parsed.
    pub start: Option<usize>,
    pub end: Option<usize>,
}

impl PNode {
    fn new(kind: Kind) -> PNode {
        PNode { kind, parent: None, nodes: None, raws: Raws::default(), selector: String::new(), name: String::new(), params: String::new(), prop: String::new(), value: String::new(), important: false, text: String::new(), start: None, end: None }
    }
}

/// A CSS syntax error with PostCSS's message and 1-based position.
#[derive(Clone, Debug)]
pub struct CssError {
    pub message: String,
    pub reason: String,
    pub line: Option<usize>,
    pub column: Option<usize>,
}

pub struct Input {
    pub css: String,
    pub file: Option<String>,
    pub has_bom: bool,
    line_starts: Vec<usize>,
}

impl Input {
    pub fn new(css: &str, from: Option<&str>) -> Input {
        let (css, has_bom) = if css.starts_with('\u{FEFF}') || css.starts_with('\u{FFFE}') { (css[3..].to_string(), true) } else { (css.to_string(), false) };
        let file = from.map(|f| {
            let is_url = f.find("://").map(|i| i > 0 && f[..i].chars().all(|c| c.is_ascii_alphanumeric() || c == '_')).unwrap_or(false);
            if is_url || f.starts_with('/') {
                f.to_string()
            } else {
                resolve_path(f)
            }
        });
        let mut line_starts = vec![0];
        for (i, b) in css.bytes().enumerate() {
            if b == b'\n' {
                line_starts.push(i + 1);
            }
        }
        Input { css, file, has_bom, line_starts }
    }

    fn u16len(&self, a: usize, b: usize) -> usize {
        self.css[a..b].encode_utf16().count()
    }

    /// `fromOffset`, from a byte offset: (line, UTF-16 column), 1-based.
    pub fn from_offset(&self, off: usize) -> (usize, usize) {
        let off = off.min(self.css.len());
        let idx = match self.line_starts.binary_search(&off) {
            Ok(i) => i,
            Err(i) => i - 1,
        };
        (idx + 1, self.u16len(self.line_starts[idx], off) + 1)
    }

    pub fn error_at(&self, reason: &str, off: usize) -> CssError {
        let (l, c) = self.from_offset(off);
        self.error_lc(reason, l, c)
    }

    pub fn error_lc(&self, reason: &str, line: usize, column: usize) -> CssError {
        let file = self.file.clone().unwrap_or_else(|| "<css input>".to_string());
        CssError { message: format!("{}:{}:{}: {}", file, line, column, reason), reason: reason.to_string(), line: Some(line), column: Some(column) }
    }
}

/// `path.resolve(p)` against the working directory.
pub fn resolve_path(p: &str) -> String {
    let cwd = std::env::current_dir().map(|d| d.to_string_lossy().to_string()).unwrap_or_else(|_| "/".into());
    let joined = format!("{}/{}", cwd, p);
    let mut parts: Vec<&str> = vec![];
    for seg in joined.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    format!("/{}", parts.join("/"))
}

// ---------------------------------------------------------------- tokenizer

#[derive(Clone, Debug)]
pub struct Tok {
    pub ty: &'static str,
    pub text: String,
    pub start: Option<usize>,
    pub end: Option<usize>,
}

struct Tokenizer<'a> {
    css: &'a [u8],
    src: &'a str,
    pos: usize,
    buffer: Vec<Tok>,
    returned: Vec<Tok>,
    last_bad_paren: i64,
}

fn is_ws(c: u8) -> bool {
    matches!(c, b' ' | b'\n' | b'\t' | b'\r' | 0x0c)
}

impl<'a> Tokenizer<'a> {
    fn at(&self, i: usize) -> Option<u8> {
        self.css.get(i).copied()
    }
    fn index_of(&self, pat: &str, from: usize) -> Option<usize> {
        if from > self.src.len() {
            return None;
        }
        self.src[from..].find(pat).map(|i| i + from)
    }
    fn end_of_file(&self) -> bool {
        self.returned.is_empty() && self.pos >= self.css.len()
    }
    fn back(&mut self, t: Tok) {
        self.returned.push(t);
    }
    fn tok(&self, ty: &'static str, a: usize, b: usize) -> Tok {
        Tok { ty, text: self.src[a..b + 1].to_string(), start: Some(a), end: Some(b) }
    }
    fn next_token(&mut self, input: &Input) -> Result<Option<Tok>, CssError> {
        if let Some(t) = self.returned.pop() {
            return Ok(Some(t));
        }
        if self.pos >= self.css.len() {
            return Ok(None);
        }
        let pos = self.pos;
        let code = self.css[pos];
        let cur: Tok;
        match code {
            b' ' | b'\n' | b'\t' | b'\r' | 0x0c => {
                let mut next = pos;
                loop {
                    next += 1;
                    match self.at(next) {
                        Some(c) if is_ws(c) => {}
                        _ => break,
                    }
                }
                cur = Tok { ty: "space", text: self.src[pos..next].to_string(), start: None, end: None };
                self.pos = next - 1;
            }
            b'[' | b']' | b'{' | b'}' | b':' | b';' | b')' => {
                let ty = match code {
                    b'[' => "[",
                    b']' => "]",
                    b'{' => "{",
                    b'}' => "}",
                    b':' => ":",
                    b';' => ";",
                    _ => ")",
                };
                cur = Tok { ty, text: ty.to_string(), start: Some(pos), end: None };
            }
            b'(' => {
                let prev = self.buffer.pop().map(|t| t.text).unwrap_or_default();
                let n = self.at(pos + 1);
                if prev == "url" && !matches!(n, Some(b'\'') | Some(b'"') | Some(b' ') | Some(b'\n') | Some(b'\t') | Some(0x0c) | Some(b'\r')) {
                    let mut next = pos;
                    loop {
                        let mut escaped = false;
                        match self.index_of(")", next + 1) {
                            Some(n) => next = n,
                            None => return Err(input.error_at("Unclosed bracket", self.pos)),
                        }
                        let mut ep = next;
                        while ep > 0 && self.css[ep - 1] == b'\\' {
                            ep -= 1;
                            escaped = !escaped;
                        }
                        if !escaped {
                            break;
                        }
                    }
                    cur = self.tok("brackets", pos, next);
                    self.pos = next;
                } else if (pos as i64) <= self.last_bad_paren {
                    cur = Tok { ty: "(", text: "(".into(), start: Some(pos), end: None };
                } else {
                    let next = self.index_of(")", pos + 1);
                    let bad = match next {
                        None => true,
                        Some(n) => {
                            let content = &self.css[pos..n + 1];
                            content.iter().skip(1).any(|c| matches!(c, b'\r' | b'\n' | b'"' | b'\'' | b'(' | b'/' | b'\\'))
                        }
                    };
                    if bad {
                        self.last_bad_paren = match next {
                            None => self.css.len() as i64,
                            Some(n) => n as i64,
                        };
                        cur = Tok { ty: "(", text: "(".into(), start: Some(pos), end: None };
                    } else {
                        let n = next.unwrap();
                        cur = self.tok("brackets", pos, n);
                        self.pos = n;
                    }
                }
            }
            b'\'' | b'"' => {
                let q = if code == b'\'' { "'" } else { "\"" };
                let mut next = pos;
                loop {
                    let mut escaped = false;
                    match self.index_of(q, next + 1) {
                        Some(n) => next = n,
                        None => return Err(input.error_at("Unclosed string", self.pos)),
                    }
                    let mut ep = next;
                    while ep > 0 && self.css[ep - 1] == b'\\' {
                        ep -= 1;
                        escaped = !escaped;
                    }
                    if !escaped {
                        break;
                    }
                }
                cur = self.tok("string", pos, next);
                self.pos = next;
            }
            b'@' => {
                let mut i = pos + 1;
                while i < self.css.len() && !matches!(self.css[i], b'\t' | b'\n' | 0x0c | b'\r' | b' ' | b'"' | b'#' | b'\'' | b'(' | b')' | b'/' | b';' | b'[' | b'\\' | b']' | b'{' | b'}') {
                    i += 1;
                }
                let next = if i >= self.css.len() { self.css.len() - 1 } else { i - 1 };
                cur = self.tok("at-word", pos, next);
                self.pos = next;
            }
            b'\\' => {
                let mut next = pos;
                let mut escape = true;
                while self.at(next + 1) == Some(b'\\') {
                    next += 1;
                    escape = !escape;
                }
                let c = self.at(next + 1);
                if escape && !matches!(c, Some(b'/') | Some(b' ') | Some(b'\n') | Some(b'\t') | Some(b'\r') | Some(0x0c)) && c.is_some() {
                    next += 1;
                    if self.at(next).map(|c| c.is_ascii_hexdigit()).unwrap_or(false) {
                        while self.at(next + 1).map(|c| c.is_ascii_hexdigit()).unwrap_or(false) {
                            next += 1;
                        }
                        if self.at(next + 1) == Some(b' ') {
                            next += 1;
                        }
                    }
                } else if escape && c.is_none() {
                    // `css.charCodeAt(past end)` is NaN: the escape takes the
                    // (missing) next character.
                    next += 1;
                }
                let next = next.min(self.css.len() - 1);
                // extend to a char boundary
                let mut e = next + 1;
                while e < self.css.len() && !self.src.is_char_boundary(e) {
                    e += 1;
                }
                cur = Tok { ty: "word", text: self.src[pos..e].to_string(), start: Some(pos), end: Some(e - 1) };
                self.pos = e - 1;
            }
            _ => {
                if code == b'/' && self.at(pos + 1) == Some(b'*') {
                    let next = match self.index_of("*/", pos + 2) {
                        Some(n) => n + 1,
                        None => return Err(input.error_at("Unclosed comment", self.pos)),
                    };
                    cur = self.tok("comment", pos, next);
                    self.pos = next;
                } else {
                    let mut i = pos + 1;
                    while i < self.css.len() {
                        let c = self.css[i];
                        if matches!(c, b'\t' | b'\n' | 0x0c | b'\r' | b' ' | b'!' | b'"' | b'#' | b'\'' | b'(' | b')' | b':' | b';' | b'@' | b'[' | b'\\' | b']' | b'{' | b'}') || (c == b'/' && self.at(i + 1) == Some(b'*')) {
                            break;
                        }
                        i += 1;
                    }
                    let next = if i >= self.css.len() { self.css.len() - 1 } else { i - 1 };
                    cur = self.tok("word", pos, next);
                    self.buffer.push(cur.clone());
                    self.pos = next;
                }
            }
        }
        self.pos += 1;
        Ok(Some(cur))
    }
}

// ---------------------------------------------------------------- tree

pub struct Css {
    pub nodes: Vec<PNode>,
    pub root: usize,
    pub input: Input,
    indexes: RefCell<HashMap<usize, HashMap<usize, usize>>>,
    last_each: RefCell<usize>,
}

fn tokens_to_string(t: &[Tok], from: usize, to: usize) -> String {
    t[from..to].iter().map(|x| x.text.as_str()).collect()
}

struct Parser<'a> {
    css: Css,
    current: usize,
    spaces: String,
    semicolon: bool,
    tk: Tokenizer<'a>,
}

impl<'a> Parser<'a> {
    fn push(&mut self, n: PNode) -> usize {
        let id = self.css.nodes.len();
        let mut n = n;
        n.parent = Some(self.current);
        self.css.nodes.push(n);
        self.css.nodes[self.current].nodes.get_or_insert_with(Vec::new).push(id);
        id
    }
    fn init(&mut self, mut n: PNode, offset: Option<usize>) -> usize {
        n.start = offset;
        n.raws.before = Some(std::mem::take(&mut self.spaces));
        if n.kind != Kind::Comment {
            self.semicolon = false;
        }
        self.push(n)
    }
    fn next(&mut self) -> Result<Option<Tok>, CssError> {
        let input = &self.css.input as *const Input;
        // SAFETY: the tokenizer never touches `css.input` mutably.
        self.tk.next_token(unsafe { &*input })
    }
    fn err(&self, reason: &str, off: usize) -> CssError {
        self.css.input.error_at(reason, off)
    }

    fn parse(&mut self) -> Result<(), CssError> {
        while !self.tk.end_of_file() {
            let t = self.next()?.unwrap();
            match t.ty {
                "space" => self.spaces.push_str(&t.text),
                ";" => self.free_semicolon(&t),
                "}" => self.end(&t)?,
                "comment" => self.comment(&t),
                "at-word" => self.atrule(t)?,
                "{" => self.empty_rule(&t),
                _ => self.other(t)?,
            }
        }
        self.end_file()
    }

    fn comment(&mut self, t: &Tok) {
        let mut n = PNode::new(Kind::Comment);
        let text = &t.text[2..t.text.len() - 2];
        if js_trim(text).is_empty() {
            n.text = String::new();
            n.raws.left = Some(text.to_string());
            n.raws.right = Some(String::new());
        } else {
            let lead = text.len() - js_trim_start(text).len();
            let trail = text.len() - js_trim_end(text).len();
            n.text = text[lead..text.len() - trail].to_string();
            n.raws.left = Some(text[..lead].to_string());
            n.raws.right = Some(text[text.len() - trail..].to_string());
        }
        n.end = t.end.or(t.start).map(|e| e + 1);
        self.init(n, t.start);
    }

    fn empty_rule(&mut self, t: &Tok) {
        let mut n = PNode::new(Kind::Rule);
        n.selector = String::new();
        n.raws.between = Some(String::new());
        n.nodes = Some(vec![]);
        let id = self.init(n, t.start);
        self.current = id;
    }

    fn free_semicolon(&mut self, t: &Tok) {
        self.spaces.push_str(&t.text);
        if let Some(ns) = &self.css.nodes[self.current].nodes {
            if let Some(&prev) = ns.last() {
                let p = &self.css.nodes[prev];
                if p.kind == Kind::Rule && p.raws.own_semicolon.as_deref().map(|s| s.is_empty()).unwrap_or(true) {
                    let s = std::mem::take(&mut self.spaces);
                    self.css.nodes[prev].raws.own_semicolon = Some(s);
                }
            }
        }
    }

    fn end(&mut self, t: &Tok) -> Result<(), CssError> {
        let cur = self.current;
        if self.css.nodes[cur].nodes.as_ref().map(|n| !n.is_empty()).unwrap_or(false) {
            self.css.nodes[cur].raws.semicolon = Some(self.semicolon);
        }
        self.semicolon = false;
        let after = self.css.nodes[cur].raws.after.clone().unwrap_or_default() + &self.spaces;
        self.css.nodes[cur].raws.after = Some(after);
        self.spaces.clear();
        match self.css.nodes[cur].parent {
            Some(p) => {
                self.css.nodes[cur].end = t.start.map(|s| s + 1);
                self.current = p;
                Ok(())
            }
            None => Err(self.err("Unexpected }", t.start.unwrap_or(0))),
        }
    }

    fn end_file(&mut self) -> Result<(), CssError> {
        let cur = self.current;
        if self.css.nodes[cur].parent.is_some() {
            let (l, c) = self.css.input.from_offset(self.css.nodes[cur].start.unwrap_or(0));
            return Err(self.css.input.error_lc("Unclosed block", l, c));
        }
        if self.css.nodes[cur].nodes.as_ref().map(|n| !n.is_empty()).unwrap_or(false) {
            self.css.nodes[cur].raws.semicolon = Some(self.semicolon);
        }
        let after = self.css.nodes[cur].raws.after.clone().unwrap_or_default() + &self.spaces;
        self.css.nodes[cur].raws.after = Some(after);
        Ok(())
    }

    fn other(&mut self, start: Tok) -> Result<(), CssError> {
        let mut end = false;
        let mut colon = false;
        let mut bracket: Option<Tok> = None;
        let mut brackets: Vec<&'static str> = vec![];
        let custom = start.text.starts_with("--");
        let mut tokens: Vec<Tok> = vec![];
        let mut token = Some(start);
        while let Some(t) = token {
            let ty = t.ty;
            tokens.push(t.clone());
            if ty == "(" || ty == "[" {
                if bracket.is_none() {
                    bracket = Some(t.clone());
                }
                brackets.push(if ty == "(" { ")" } else { "]" });
            } else if custom && colon && ty == "{" {
                if bracket.is_none() {
                    bracket = Some(t.clone());
                }
                brackets.push("}");
            } else if brackets.is_empty() {
                if ty == ";" {
                    if colon {
                        return self.decl(tokens, custom);
                    } else {
                        break;
                    }
                } else if ty == "{" {
                    return self.rule(tokens);
                } else if ty == "}" {
                    let b = tokens.pop().unwrap();
                    self.tk.back(b);
                    end = true;
                    break;
                } else if ty == ":" {
                    colon = true;
                }
            } else if Some(&ty) == brackets.last() {
                brackets.pop();
                if brackets.is_empty() {
                    bracket = None;
                }
            }
            token = self.next()?;
        }
        if self.tk.end_of_file() {
            end = true;
        }
        if !brackets.is_empty() {
            return Err(self.err("Unclosed bracket", bracket.unwrap().start.unwrap_or(0)));
        }
        if end && colon {
            if !custom {
                while let Some(last) = tokens.last() {
                    if last.ty != "space" && last.ty != "comment" {
                        break;
                    }
                    let b = tokens.pop().unwrap();
                    self.tk.back(b);
                }
            }
            self.decl(tokens, custom)
        } else {
            Err(self.err(&format!("Unknown word {}", tokens[0].text), tokens[0].start.unwrap_or(0)))
        }
    }

    fn rule(&mut self, mut tokens: Vec<Tok>) -> Result<(), CssError> {
        tokens.pop();
        let mut n = PNode::new(Kind::Rule);
        n.nodes = Some(vec![]);
        let start = tokens[0].start;
        n.raws.between = Some(spaces_and_comments_from_end(&mut tokens));
        raw(&mut n, "selector", &tokens, false);
        let id = self.init(n, start);
        self.current = id;
        Ok(())
    }

    fn decl(&mut self, mut tokens: Vec<Tok>, custom: bool) -> Result<(), CssError> {
        let mut n = PNode::new(Kind::Decl);
        let first_start = tokens[0].start;
        let id = self.init(PNode::new(Kind::Decl), first_start);
        if tokens.last().map(|t| t.ty == ";").unwrap_or(false) {
            self.semicolon = true;
            tokens.pop();
        }
        let mut start = 0;
        while tokens[start].ty != "word" {
            if start == tokens.len() - 1 {
                return Err(self.err(&format!("Unknown word {}", tokens[start].text), tokens[start].start.unwrap_or(0)));
            }
            start += 1;
        }
        let mut before = tokens_to_string(&tokens, 0, start);
        let real_start = tokens[start].start;
        let prop_start = start;
        while start < tokens.len() {
            let ty = tokens[start].ty;
            if ty == ":" || ty == "space" || ty == "comment" {
                break;
            }
            start += 1;
        }
        n.prop = tokens_to_string(&tokens, prop_start, start);
        let between_start = start;
        while start < tokens.len() {
            let t = &tokens[start];
            start += 1;
            if t.ty == ":" {
                break;
            }
            if t.ty == "word" && t.text.chars().any(|c| c.is_ascii_alphanumeric() || c == '_') {
                return Err(self.err(&format!("Unknown word {}", t.text), t.start.unwrap_or(0)));
            }
        }
        let mut between = tokens_to_string(&tokens, between_start, start);
        if n.prop.starts_with('_') || n.prop.starts_with('*') {
            before.push_str(&n.prop[..1]);
            n.prop = n.prop[1..].to_string();
        }
        let fs_start = start;
        while start < tokens.len() {
            let ty = tokens[start].ty;
            if ty != "space" && ty != "comment" {
                break;
            }
            start += 1;
        }
        let mut first_spaces: Vec<Tok> = tokens[fs_start..start].to_vec();
        let mut tokens: Vec<Tok> = tokens[start..].to_vec();
        let mut i = tokens.len() as i64 - 1;
        while i >= 0 {
            let t = tokens[i as usize].clone();
            let lower = t.text.to_lowercase();
            if lower == "!important" {
                n.important = true;
                let mut s: String = tokens[i as usize..].iter().map(|x| x.text.as_str()).collect();
                tokens.truncate(i as usize);
                s = spaces_from_end(&mut tokens) + &s;
                if s != " !important" {
                    n.raws.important = Some(s);
                }
                break;
            } else if lower == "important" {
                let mut cache = tokens.clone();
                let mut s = String::new();
                let mut jj = i;
                while jj > 0 {
                    let ty = cache[jj as usize].ty;
                    if js_trim(&s).starts_with('!') && ty != "space" {
                        break;
                    }
                    s = cache.pop().unwrap().text + &s;
                    jj -= 1;
                }
                if js_trim(&s).starts_with('!') {
                    n.important = true;
                    n.raws.important = Some(s);
                    tokens = cache;
                }
            }
            if t.ty != "space" && t.ty != "comment" {
                break;
            }
            i -= 1;
        }
        let has_word = tokens.iter().any(|t| t.ty != "space" && t.ty != "comment");
        if has_word {
            between.push_str(&first_spaces.iter().map(|t| t.text.as_str()).collect::<String>());
            first_spaces.clear();
        }
        first_spaces.extend(tokens.iter().cloned());
        n.raws.between = Some(between);
        raw(&mut n, "value", &first_spaces, custom);
        if n.value.contains(':') && !custom {
            if let Some(off) = check_missed_semicolon(&tokens) {
                return Err(self.err("Missed semicolon", off));
            }
        }
        n.start = real_start;
        n.parent = self.css.nodes[id].parent;
        n.raws.before = Some(self.css.nodes[id].raws.before.clone().unwrap_or_default() + &before);
        self.css.nodes[id] = n;
        Ok(())
    }

    fn atrule(&mut self, t: Tok) -> Result<(), CssError> {
        let mut n = PNode::new(Kind::AtRule);
        n.name = t.text[1..].to_string();
        if n.name.is_empty() {
            return Err(self.err("At-rule without name", t.start.unwrap_or(0)));
        }
        let name = std::mem::take(&mut n.name);
        let id = self.init(n, t.start);
        let mut n = PNode::new(Kind::AtRule);
        n.name = name;
        let mut last = false;
        let mut open = false;
        let mut params: Vec<Tok> = vec![];
        let mut brackets: Vec<&'static str> = vec![];
        let mut ended_by_close: Option<Tok> = None;
        while !self.tk.end_of_file() {
            let tok = self.next()?.unwrap();
            let ty = tok.ty;
            if ty == "(" || ty == "[" {
                brackets.push(if ty == "(" { ")" } else { "]" });
            } else if ty == "{" && !brackets.is_empty() {
                brackets.push("}");
            } else if Some(&ty) == brackets.last() {
                brackets.pop();
            }
            if brackets.is_empty() {
                if ty == ";" {
                    self.semicolon = true;
                    break;
                } else if ty == "{" {
                    open = true;
                    break;
                } else if ty == "}" {
                    ended_by_close = Some(tok);
                    break;
                } else {
                    params.push(tok);
                }
            } else {
                params.push(tok);
            }
            if self.tk.end_of_file() {
                last = true;
                break;
            }
        }
        n.raws.between = Some(spaces_and_comments_from_end(&mut params));
        if !params.is_empty() {
            n.raws.after_name = Some(spaces_and_comments_from_start(&mut params));
            raw(&mut n, "params", &params, false);
        } else {
            n.raws.after_name = Some(String::new());
            n.params = String::new();
        }
        if open {
            n.nodes = Some(vec![]);
        }
        n.start = t.start;
        n.parent = self.css.nodes[id].parent;
        n.raws.before = self.css.nodes[id].raws.before.clone();
        self.css.nodes[id] = n;
        if !params.is_empty() && last {
            self.spaces = self.css.nodes[id].raws.between.clone().unwrap_or_default();
            self.css.nodes[id].raws.between = Some(String::new());
        }
        if open {
            self.current = id;
        }
        if let Some(c) = ended_by_close {
            self.end(&c)?;
        }
        Ok(())
    }
}

fn check_missed_semicolon(tokens: &[Tok]) -> Option<usize> {
    // `colon()`
    let mut brackets = 0i64;
    let mut prev: Option<&Tok> = None;
    let mut colon_at = None;
    for (i, t) in tokens.iter().enumerate() {
        if t.ty == "(" {
            brackets += 1;
        }
        if t.ty == ")" {
            brackets -= 1;
        }
        if brackets == 0 && t.ty == ":" {
            match prev {
                None => return t.start, // `Double colon`
                Some(p) if p.ty == "word" && p.text == "progid" => {
                    prev = Some(t);
                    continue;
                }
                _ => {
                    colon_at = Some(i);
                    break;
                }
            }
        }
        prev = Some(t);
    }
    let colon = colon_at?;
    let mut founded = 0;
    let mut token = None;
    let mut j = colon as i64 - 1;
    while j >= 0 {
        let t = &tokens[j as usize];
        if t.ty != "space" {
            founded += 1;
            token = Some(t);
            if founded == 2 {
                break;
            }
        }
        j -= 1;
    }
    let t = token?;
    Some(if t.ty == "word" { t.end.unwrap_or(0) + 1 } else { t.start.unwrap_or(0) })
}

fn spaces_and_comments_from_end(tokens: &mut Vec<Tok>) -> String {
    let mut s = String::new();
    while let Some(t) = tokens.last() {
        if t.ty != "space" && t.ty != "comment" {
            break;
        }
        s = tokens.pop().unwrap().text + &s;
    }
    s
}

fn spaces_and_comments_from_start(tokens: &mut Vec<Tok>) -> String {
    let mut s = String::new();
    while let Some(t) = tokens.first() {
        if t.ty != "space" && t.ty != "comment" {
            break;
        }
        s.push_str(&tokens.remove(0).text);
    }
    s
}

fn spaces_from_end(tokens: &mut Vec<Tok>) -> String {
    let mut s = String::new();
    while let Some(t) = tokens.last() {
        if t.ty != "space" {
            break;
        }
        s = tokens.pop().unwrap().text + &s;
    }
    s
}

fn raw(n: &mut PNode, prop: &str, tokens: &[Tok], custom: bool) {
    let len = tokens.len();
    let mut value = String::new();
    let mut clean = true;
    for i in 0..len {
        let t = &tokens[i];
        if t.ty == "space" && i == len - 1 && !custom {
            clean = false;
        } else if t.ty == "comment" {
            let prev = if i > 0 { tokens[i - 1].ty } else { "empty" };
            let next = if i + 1 < len { tokens[i + 1].ty } else { "empty" };
            let safe = |x: &str| x == "empty" || x == "space";
            if !safe(prev) && !safe(next) {
                if value.ends_with(',') {
                    clean = false;
                } else {
                    value.push_str(&t.text);
                }
            } else {
                clean = false;
            }
        } else {
            value.push_str(&t.text);
        }
    }
    let pair = if !clean { Some(RawPair { raw: tokens.iter().map(|t| t.text.as_str()).collect(), value: value.clone() }) } else { None };
    match prop {
        "selector" => {
            n.raws.selector = pair;
            n.selector = value;
        }
        "params" => {
            n.raws.params = pair;
            n.params = value;
        }
        _ => {
            n.raws.value = pair;
            n.value = value;
        }
    }
}

pub fn is_js_ws(c: char) -> bool {
    matches!(c, '\u{9}' | '\u{a}' | '\u{b}' | '\u{c}' | '\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_ws)
}
fn js_trim_start(s: &str) -> &str {
    s.trim_start_matches(is_js_ws)
}
fn js_trim_end(s: &str) -> &str {
    s.trim_end_matches(is_js_ws)
}

/// `postcss.parse(css, {from})`.
pub fn parse(css: &str, from: Option<&str>) -> Result<Css, CssError> {
    let input = Input::new(css, from);
    let src: &str = unsafe { &*(input.css.as_str() as *const str) };
    let mut root = PNode::new(Kind::Root);
    root.nodes = Some(vec![]);
    root.start = Some(0);
    let c = Css { nodes: vec![root], root: 0, input, indexes: RefCell::new(HashMap::new()), last_each: RefCell::new(0) };
    let mut p = Parser { css: c, current: 0, spaces: String::new(), semicolon: false, tk: Tokenizer { css: src.as_bytes(), src, pos: 0, buffer: vec![], returned: vec![], last_bad_paren: -1 } };
    p.parse()?;
    Ok(p.css)
}

// ---------------------------------------------------------------- mutation & walking

impl Css {
    pub fn children(&self, id: usize) -> Vec<usize> {
        self.nodes[id].nodes.clone().unwrap_or_default()
    }

    /// Pre-order walk with PostCSS's live indexes: insertions and removals in
    /// a visited container during the callback shift the iteration.
    pub fn walk(&mut self, f: &mut dyn FnMut(&mut Css, usize)) {
        self.walk_in(self.root, f);
    }

    fn iterator(&self, container: usize) -> usize {
        let mut le = self.last_each.borrow_mut();
        *le += 1;
        let id = *le;
        self.indexes.borrow_mut().entry(container).or_default().insert(id, 0);
        id
    }
    fn idx(&self, container: usize, it: usize) -> usize {
        self.indexes.borrow()[&container][&it]
    }
    fn set_idx(&self, container: usize, it: usize, v: usize) {
        self.indexes.borrow_mut().get_mut(&container).unwrap().insert(it, v);
    }
    fn drop_it(&self, container: usize, it: usize) {
        if let Some(m) = self.indexes.borrow_mut().get_mut(&container) {
            m.remove(&it);
        }
    }

    fn walk_in(&mut self, container: usize, f: &mut dyn FnMut(&mut Css, usize)) {
        if self.nodes[container].nodes.is_none() {
            return;
        }
        let it = self.iterator(container);
        loop {
            let i = self.idx(container, it);
            let kids = self.children(container);
            if i >= kids.len() {
                break;
            }
            let child = kids[i];
            f(self, child);
            if self.nodes[child].nodes.is_some() {
                self.walk_in(child, f);
            }
            let i = self.idx(container, it);
            self.set_idx(container, it, i + 1);
        }
        self.drop_it(container, it);
    }

    pub fn walk_kind(&mut self, kind: Kind, f: &mut dyn FnMut(&mut Css, usize)) {
        self.walk(&mut |c, id| {
            if c.nodes[id].kind == kind {
                f(c, id)
            }
        });
    }

    pub fn walk_at_rules(&mut self, name: &str, f: &mut dyn FnMut(&mut Css, usize)) {
        self.walk(&mut |c, id| {
            if c.nodes[id].kind == Kind::AtRule && c.nodes[id].name == name {
                f(c, id)
            }
        });
    }

    pub fn new_comment(&mut self, text: &str) -> usize {
        let mut n = PNode::new(Kind::Comment);
        n.text = text.to_string();
        self.nodes.push(n);
        self.nodes.len() - 1
    }

    /// `node.before(add)` for one new (parentless) node.
    pub fn insert_before(&mut self, exist: usize, add: usize) {
        let parent = self.nodes[exist].parent.unwrap();
        let kids = self.children(parent);
        let exist_index = kids.iter().position(|&k| k == exist).unwrap();
        let prepend = exist_index == 0;
        // Container.normalize
        if self.nodes[add].raws.before.is_none() {
            if let Some(b) = self.nodes[exist].raws.before.clone() {
                self.nodes[add].raws.before = Some(b.chars().filter(|c| is_js_ws(*c)).collect());
            }
        }
        if self.nodes[parent].kind == Kind::Root {
            let keep_before = false;
            if prepend {
                if kids.len() > 1 {
                    let b = self.nodes[kids[1]].raws.before.clone();
                    self.nodes[exist].raws.before = b;
                } else {
                    self.nodes[exist].raws.before = None;
                }
            } else if kids.first() != Some(&exist) && !keep_before {
                let b = self.nodes[exist].raws.before.clone();
                self.nodes[add].raws.before = b;
            }
        }
        self.nodes[add].parent = Some(parent);
        let mut kids = kids;
        kids.insert(exist_index, add);
        self.nodes[parent].nodes = Some(kids);
        if let Some(m) = self.indexes.borrow_mut().get_mut(&parent) {
            for v in m.values_mut() {
                if exist_index <= *v {
                    *v += 1;
                }
            }
        }
    }

    pub fn first_of(&self, id: usize) -> Option<usize> {
        self.nodes[id].nodes.as_ref().and_then(|n| n.first().copied())
    }

    // ------------------------------------------------------------ stringify

    pub fn to_string(&self) -> String {
        let mut s = Stringifier { css: self, cache: RefCell::new(HashMap::new()), out: String::new() };
        s.root(self.root);
        s.out
    }

    pub fn depth_root(&self, id: usize) -> usize {
        let mut cur = id;
        while let Some(p) = self.nodes[cur].parent {
            cur = p;
        }
        cur
    }
}

struct Stringifier<'a> {
    css: &'a Css,
    cache: RefCell<HashMap<&'static str, RawOut>>,
    out: String,
}

#[derive(Clone, Debug)]
enum RawOut {
    S(String),
    B(bool),
}

impl RawOut {
    fn s(self) -> String {
        match self {
            RawOut::S(s) => s,
            RawOut::B(b) => b.to_string(),
        }
    }
    fn b(&self) -> bool {
        match self {
            RawOut::S(s) => !s.is_empty(),
            RawOut::B(b) => *b,
        }
    }
}

fn escape_html_in_css(s: &str) -> String {
    if !s.contains('<') {
        return s.to_string();
    }
    let a = crate::commands::upgrade::jsre::replace_fn("(<)(\\/?style\\b)", "gi", s, |g| format!("\\3c {}", g[2].unwrap_or("")));
    crate::commands::upgrade::jsre::replace_fn("(<)(!--)", "g", &a, |g| format!("\\3c {}", g[2].unwrap_or("")))
}

fn strip_non_ws(s: &str) -> String {
    // `.replace(/\S/g, '')`
    s.chars().filter(|c| is_js_ws(*c)).collect()
}

fn strip_last_line(s: &str) -> String {
    // `.replace(/[^\n]+$/, '')`
    match s.rfind('\n') {
        Some(i) => s[..i + 1].to_string(),
        None => String::new(),
    }
}

impl<'a> Stringifier<'a> {
    fn n(&self, id: usize) -> &PNode {
        &self.css.nodes[id]
    }

    fn own_raw(&self, id: usize, own: &str) -> Option<RawOut> {
        let r = &self.n(id).raws;
        match own {
            "before" => r.before.clone().map(RawOut::S),
            "after" => r.after.clone().map(RawOut::S),
            "between" => r.between.clone().map(RawOut::S),
            "afterName" => r.after_name.clone().map(RawOut::S),
            "semicolon" => r.semicolon.map(RawOut::B),
            "left" => r.left.clone().map(RawOut::S),
            "right" => r.right.clone().map(RawOut::S),
            "indent" => None,
            _ => None,
        }
    }

    fn default_raw(detect: &str) -> RawOut {
        match detect {
            "after" | "beforeClose" | "beforeComment" | "beforeDecl" | "beforeRule" => RawOut::S("\n".into()),
            "beforeOpen" => RawOut::S(" ".into()),
            "colon" => RawOut::S(": ".into()),
            "commentLeft" | "commentRight" => RawOut::S(" ".into()),
            "emptyBody" => RawOut::S(String::new()),
            "indent" => RawOut::S("    ".into()),
            "semicolon" => RawOut::B(false),
            _ => RawOut::S(String::new()),
        }
    }

    fn walk_all(&self, root: usize, f: &mut dyn FnMut(usize) -> bool) -> bool {
        for c in self.css.children(root) {
            if !f(c) {
                return false;
            }
            if self.n(c).nodes.is_some() && !self.walk_all(c, f) {
                return false;
            }
        }
        true
    }

    fn raw(&self, id: usize, own: Option<&str>, detect: &'static str) -> RawOut {
        if let Some(o) = own {
            if let Some(v) = self.own_raw(id, o) {
                return v;
            }
        }
        let parent = self.n(id).parent;
        if detect == "before" {
            match parent {
                None => return RawOut::S(String::new()),
                Some(p) if self.n(p).kind == Kind::Root && self.css.first_of(p) == Some(id) => return RawOut::S(String::new()),
                _ => {}
            }
        }
        if parent.is_none() {
            return Self::default_raw(detect);
        }
        let root = self.css.depth_root(id);
        if let Some(v) = self.cache.borrow().get(detect) {
            return v.clone();
        }
        if detect == "before" || detect == "after" {
            return self.before_after(id, detect);
        }
        let value: Option<RawOut> = match detect {
            "beforeClose" => self.raw_before_close(root),
            "beforeComment" => Some(self.raw_before_comment(root, id)),
            "beforeDecl" => Some(self.raw_before_decl(root, id)),
            "beforeOpen" => self.raw_before_open(root),
            "beforeRule" => self.raw_before_rule(root),
            "colon" => self.raw_colon(root),
            "emptyBody" => self.raw_empty_body(root),
            "indent" => self.raw_indent(root),
            "semicolon" => self.raw_semicolon(root),
            _ => {
                let mut v = None;
                if let Some(o) = own {
                    self.walk_all(root, &mut |i| {
                        v = self.own_raw(i, o);
                        v.is_none()
                    });
                }
                v
            }
        };
        let v = value.unwrap_or_else(|| Self::default_raw(detect));
        self.cache.borrow_mut().insert(detect, v.clone());
        v
    }

    fn before_after(&self, id: usize, detect: &str) -> RawOut {
        let k = self.n(id).kind;
        let mut value = if k == Kind::Decl {
            self.raw(id, None, "beforeDecl").s()
        } else if k == Kind::Comment {
            self.raw(id, None, "beforeComment").s()
        } else if detect == "before" {
            self.raw(id, None, "beforeRule").s()
        } else {
            self.raw(id, None, "beforeClose").s()
        };
        let mut buf = self.n(id).parent;
        let mut depth = 0;
        while let Some(b) = buf {
            if self.n(b).kind == Kind::Root {
                break;
            }
            depth += 1;
            buf = self.n(b).parent;
        }
        if value.contains('\n') {
            let indent = self.raw(id, None, "indent").s();
            if !indent.is_empty() {
                for _ in 0..depth {
                    value.push_str(&indent);
                }
            }
        }
        RawOut::S(value)
    }

    fn raw_before_close(&self, root: usize) -> Option<RawOut> {
        let mut value: Option<String> = None;
        self.walk_all(root, &mut |i| {
            if self.n(i).nodes.as_ref().map(|n| !n.is_empty()).unwrap_or(false) {
                if let Some(a) = &self.n(i).raws.after {
                    let mut v = a.clone();
                    if v.contains('\n') {
                        v = strip_last_line(&v);
                    }
                    value = Some(v);
                    return false;
                }
            }
            true
        });
        value.map(|v| RawOut::S(if v.is_empty() { v } else { strip_non_ws(&v) }))
    }

    fn raw_before_comment(&self, root: usize, id: usize) -> RawOut {
        let mut value: Option<String> = None;
        self.walk_all(root, &mut |i| {
            if self.n(i).kind == Kind::Comment {
                if let Some(b) = &self.n(i).raws.before {
                    let mut v = b.clone();
                    if v.contains('\n') {
                        v = strip_last_line(&v);
                    }
                    value = Some(v);
                    return false;
                }
            }
            true
        });
        match value {
            None => self.raw(id, None, "beforeDecl"),
            Some(v) => RawOut::S(if v.is_empty() { v } else { strip_non_ws(&v) }),
        }
    }

    fn raw_before_decl(&self, root: usize, id: usize) -> RawOut {
        let mut value: Option<String> = None;
        self.walk_all(root, &mut |i| {
            if self.n(i).kind == Kind::Decl {
                if let Some(b) = &self.n(i).raws.before {
                    let mut v = b.clone();
                    if v.contains('\n') {
                        v = strip_last_line(&v);
                    }
                    value = Some(v);
                    return false;
                }
            }
            true
        });
        match value {
            None => self.raw(id, None, "beforeRule"),
            Some(v) => RawOut::S(if v.is_empty() { v } else { strip_non_ws(&v) }),
        }
    }

    fn raw_before_open(&self, root: usize) -> Option<RawOut> {
        let mut value = None;
        self.walk_all(root, &mut |i| {
            if self.n(i).kind != Kind::Decl {
                value = self.n(i).raws.between.clone();
                if value.is_some() {
                    return false;
                }
            }
            true
        });
        value.map(RawOut::S)
    }

    fn raw_before_rule(&self, root: usize) -> Option<RawOut> {
        let mut value: Option<String> = None;
        self.walk_all(root, &mut |i| {
            let n = self.n(i);
            if n.nodes.is_some() && (n.parent != Some(root) || self.css.first_of(root) != Some(i)) {
                if let Some(b) = &n.raws.before {
                    let mut v = b.clone();
                    if v.contains('\n') {
                        v = strip_last_line(&v);
                    }
                    value = Some(v);
                    return false;
                }
            }
            true
        });
        value.map(|v| RawOut::S(if v.is_empty() { v } else { strip_non_ws(&v) }))
    }

    fn raw_colon(&self, root: usize) -> Option<RawOut> {
        let mut value = None;
        self.walk_all(root, &mut |i| {
            if self.n(i).kind == Kind::Decl {
                if let Some(b) = &self.n(i).raws.between {
                    value = Some(b.chars().filter(|c| is_js_ws(*c) || *c == ':').collect::<String>());
                    return false;
                }
            }
            true
        });
        value.map(RawOut::S)
    }

    fn raw_empty_body(&self, root: usize) -> Option<RawOut> {
        let mut value = None;
        self.walk_all(root, &mut |i| {
            if self.n(i).nodes.as_ref().map(|n| n.is_empty()).unwrap_or(false) {
                value = self.n(i).raws.after.clone();
                if value.is_some() {
                    return false;
                }
            }
            true
        });
        value.map(RawOut::S)
    }

    fn raw_indent(&self, root: usize) -> Option<RawOut> {
        let mut value = None;
        self.walk_all(root, &mut |i| {
            let p = self.n(i).parent;
            if let Some(p) = p {
                if p != root && self.n(p).parent == Some(root) {
                    if let Some(b) = &self.n(i).raws.before {
                        let last = b.split('\n').last().unwrap_or("");
                        value = Some(strip_non_ws(last));
                        return false;
                    }
                }
            }
            true
        });
        value.map(RawOut::S)
    }

    fn raw_semicolon(&self, root: usize) -> Option<RawOut> {
        let mut value = None;
        self.walk_all(root, &mut |i| {
            let n = self.n(i);
            if let Some(ns) = &n.nodes {
                if let Some(&l) = ns.last() {
                    if self.n(l).kind == Kind::Decl {
                        value = n.raws.semicolon;
                        if value.is_some() {
                            return false;
                        }
                    }
                }
            }
            true
        });
        value.map(RawOut::B)
    }

    fn raw_value(&self, id: usize, prop: &str) -> String {
        let n = self.n(id);
        let (v, r) = match prop {
            "selector" => (&n.selector, &n.raws.selector),
            "params" => (&n.params, &n.raws.params),
            _ => (&n.value, &n.raws.value),
        };
        if let Some(r) = r {
            if r.value == *v {
                return r.raw.clone();
            }
        }
        v.clone()
    }

    fn atrule_start(&self, id: usize) -> String {
        let n = self.n(id);
        let name = format!("@{}", n.name);
        let params = if !n.params.is_empty() { self.raw_value(id, "params") } else { String::new() };
        let after_name = match &n.raws.after_name {
            None => {
                if params.is_empty() {
                    String::new()
                } else {
                    " ".into()
                }
            }
            Some(a) if a.is_empty() && !params.is_empty() && !matches!(params.as_bytes()[0], b'\t' | b'\n' | 0x0c | b'\r' | b' ' | b'"' | b'#' | b'\'' | b'(' | b')' | b'/' | b';' | b'[' | b'\\' | b']' | b'{' | b'}') => " ".into(),
            Some(a) => a.clone(),
        };
        name + &after_name + &params
    }

    fn root(&mut self, id: usize) {
        if self.css.input.has_bom {
            self.out.push('\u{FEFF}');
        }
        self.body(id);
        if let Some(a) = &self.n(id).raws.after {
            if !a.is_empty() {
                let a = escape_html_in_css(a);
                self.out.push_str(&a);
            }
        }
    }

    fn body(&mut self, id: usize) {
        let nodes = self.css.children(id);
        let mut last = nodes.len() as i64 - 1;
        while last > 0 {
            if self.n(nodes[last as usize]).kind != Kind::Comment {
                break;
            }
            last -= 1;
        }
        let semicolon = self.raw(id, Some("semicolon"), "semicolon").b();
        for (i, &child) in nodes.iter().enumerate() {
            let mut child_semi = last != i as i64 || semicolon;
            let c = self.n(child);
            if !child_semi && i < nodes.len() - 1 && ((c.kind == Kind::AtRule && c.nodes.is_none()) || (c.kind == Kind::Decl && c.prop.starts_with("--"))) {
                child_semi = true;
            }
            let before = self.raw(child, Some("before"), "before").s();
            if !before.is_empty() {
                let b = escape_html_in_css(&before);
                self.out.push_str(&b);
            }
            self.stringify(child, child_semi);
        }
    }

    fn stringify(&mut self, id: usize, semicolon: bool) {
        match self.n(id).kind {
            Kind::Rule => {
                let sel = self.raw_value(id, "selector");
                self.block(id, &sel);
                if let Some(o) = self.n(id).raws.own_semicolon.clone() {
                    if !o.is_empty() {
                        let o = escape_html_in_css(&o);
                        self.out.push_str(&o);
                    }
                }
            }
            Kind::AtRule => {
                let start = self.atrule_start(id);
                if self.n(id).nodes.is_some() {
                    self.block(id, &start);
                } else {
                    let end = self.n(id).raws.between.clone().unwrap_or_default() + if semicolon { ";" } else { "" };
                    let s = escape_html_in_css(&(start + &end));
                    self.out.push_str(&s);
                }
            }
            Kind::Decl => {
                let between = self.raw(id, Some("between"), "colon").s();
                let n = self.n(id);
                let mut s = n.prop.clone() + &between + &self.raw_value(id, "value");
                if n.important {
                    s.push_str(n.raws.important.as_deref().unwrap_or(" !important"));
                }
                if semicolon {
                    s.push(';');
                }
                let s = escape_html_in_css(&s);
                self.out.push_str(&s);
            }
            Kind::Comment => {
                let left = self.raw(id, Some("left"), "commentLeft").s();
                let right = self.raw(id, Some("right"), "commentRight").s();
                let s = escape_html_in_css(&format!("/*{}{}{}*/", left, self.n(id).text, right));
                self.out.push_str(&s);
            }
            Kind::Root => self.body(id),
        }
    }

    fn block(&mut self, id: usize, start: &str) {
        let between = self.raw(id, Some("between"), "beforeOpen").s();
        let s = escape_html_in_css(&(start.to_string() + &between)) + "{";
        self.out.push_str(&s);
        let after = if self.n(id).nodes.as_ref().map(|n| !n.is_empty()).unwrap_or(false) {
            self.body(id);
            self.raw(id, Some("after"), "after").s()
        } else {
            self.raw(id, Some("after"), "emptyBody").s()
        };
        if !after.is_empty() {
            let a = escape_html_in_css(&after);
            self.out.push_str(&a);
        }
        self.out.push('}');
    }
}

impl Css {
    /// `node.error(message, {index})` positioned inside a parsed node, with
    /// `index` in UTF-16 units from the node's start.
    pub fn error_inside(&self, id: usize, reason: &str, index: Option<usize>) -> CssError {
        let start = self.nodes[id].start.unwrap_or(0);
        let (mut line, mut col) = self.input.from_offset(start);
        if let Some(index) = index {
            if index > 0 {
                let mut units = 0;
                for ch in self.input.css[start..].chars() {
                    if units >= index {
                        break;
                    }
                    if ch == '\n' {
                        col = 1;
                        line += 1;
                    } else {
                        col += ch.len_utf16();
                    }
                    units += ch.len_utf16();
                }
            }
        }
        self.input.error_lc(reason, line, col)
    }
}
