//! A small CSS reader with the parts of PostCSS's tree the theme checks walk:
//! rules with their selectors and declarations, at-rules with their names and
//! params, and each node's at-rule ancestors.

#[derive(Debug, Clone)]
pub struct Decl {
    pub prop: String,
    pub value: String,
    pub important: bool,
}

#[derive(Debug, Clone)]
pub enum Node {
    Rule { selector: String, children: Vec<Node> },
    AtRule { name: String, params: String, children: Vec<Node> },
    Decl(Decl),
}

fn strip_comments(s: &str) -> String {
    let mut out = String::new();
    let c: Vec<char> = s.chars().collect();
    let mut i = 0;
    let mut quote: Option<char> = None;
    while i < c.len() {
        if let Some(q) = quote {
            out.push(c[i]);
            if c[i] == '\\' && i + 1 < c.len() {
                out.push(c[i + 1]);
                i += 2;
                continue;
            }
            if c[i] == q {
                quote = None;
            }
            i += 1;
            continue;
        }
        if c[i] == '"' || c[i] == '\'' {
            quote = Some(c[i]);
            out.push(c[i]);
            i += 1;
            continue;
        }
        if c[i] == '/' && c.get(i + 1) == Some(&'*') {
            let mut j = i + 2;
            while j + 1 < c.len() && !(c[j] == '*' && c[j + 1] == '/') {
                j += 1;
            }
            i = (j + 2).min(c.len());
            continue;
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

struct P {
    c: Vec<char>,
    i: usize,
}

impl P {
    /// Read until one of `stops` at depth 0, outside strings and parens.
    fn until(&mut self, stops: &[char]) -> (String, Option<char>) {
        let mut out = String::new();
        let mut depth = 0i32;
        let mut quote: Option<char> = None;
        while self.i < self.c.len() {
            let ch = self.c[self.i];
            if let Some(q) = quote {
                out.push(ch);
                if ch == '\\' && self.i + 1 < self.c.len() {
                    out.push(self.c[self.i + 1]);
                    self.i += 2;
                    continue;
                }
                if ch == q {
                    quote = None;
                }
                self.i += 1;
                continue;
            }
            match ch {
                '"' | '\'' => quote = Some(ch),
                '(' => depth += 1,
                ')' => depth -= 1,
                _ => {}
            }
            if depth <= 0 && stops.contains(&ch) {
                self.i += 1;
                return (out, Some(ch));
            }
            out.push(ch);
            self.i += 1;
        }
        (out, None)
    }

    fn block(&mut self) -> Vec<Node> {
        let mut nodes = Vec::new();
        loop {
            while self.i < self.c.len() && self.c[self.i].is_whitespace() {
                self.i += 1;
            }
            if self.i >= self.c.len() {
                return nodes;
            }
            if self.c[self.i] == '}' {
                self.i += 1;
                return nodes;
            }
            if self.c[self.i] == ';' {
                self.i += 1;
                continue;
            }
            if self.c[self.i] == '@' {
                self.i += 1;
                let start = self.i;
                while self.i < self.c.len() && (self.c[self.i].is_alphanumeric() || self.c[self.i] == '-' || self.c[self.i] == '_') {
                    self.i += 1;
                }
                let name: String = self.c[start..self.i].iter().collect();
                let (params, stop) = self.until(&['{', ';', '}']);
                let params = params.trim().to_string();
                let children = if stop == Some('{') { self.block() } else { vec![] };
                if stop == Some('}') {
                    nodes.push(Node::AtRule { name, params, children });
                    return nodes;
                }
                nodes.push(Node::AtRule { name, params, children });
                continue;
            }
            let (text, stop) = self.until(&['{', ';', '}']);
            match stop {
                Some('{') => {
                    let children = self.block();
                    nodes.push(Node::Rule { selector: text.trim().to_string(), children });
                }
                _ => {
                    if let Some(colon) = text.find(':') {
                        let prop = text[..colon].trim().to_string();
                        let mut value = text[colon + 1..].trim().to_string();
                        let mut important = false;
                        let lower = value.to_lowercase();
                        if let Some(pos) = lower.rfind("!important") {
                            if lower[pos + 10..].trim().is_empty() {
                                important = true;
                                value = value[..pos].trim().to_string();
                            }
                        }
                        if !prop.is_empty() {
                            nodes.push(Node::Decl(Decl { prop, value, important }));
                        }
                    }
                    if stop == Some('}') {
                        return nodes;
                    }
                }
            }
        }
    }
}

/// `postcss.parse(css)`: the root's nodes.
pub fn parse(css: &str) -> Vec<Node> {
    let mut p = P { c: strip_comments(css).chars().collect(), i: 0 };
    p.block()
}

/// Every at-rule, depth first, with its own nodes.
pub fn walk_at_rules<'a>(nodes: &'a [Node], out: &mut Vec<&'a Node>) {
    for n in nodes {
        match n {
            Node::AtRule { children, .. } => {
                out.push(n);
                walk_at_rules(children, out);
            }
            Node::Rule { children, .. } => walk_at_rules(children, out),
            Node::Decl(_) => {}
        }
    }
}

/// Every declaration under `nodes`, depth first.
pub fn walk_decls<'a>(nodes: &'a [Node], out: &mut Vec<&'a Decl>) {
    for n in nodes {
        match n {
            Node::Decl(d) => out.push(d),
            Node::Rule { children, .. } | Node::AtRule { children, .. } => walk_decls(children, out),
        }
    }
}

/// Every rule, depth first, with its at-rule ancestors (name, params),
/// nearest last.
pub fn walk_rules<'a>(nodes: &'a [Node], ancestors: &mut Vec<(&'a str, &'a str)>, out: &mut Vec<(&'a str, &'a [Node], Vec<(&'a str, &'a str)>)>) {
    for n in nodes {
        match n {
            Node::Rule { selector, children } => {
                out.push((selector.as_str(), children.as_slice(), ancestors.clone()));
                walk_rules(children, ancestors, out);
            }
            Node::AtRule { name, params, children } => {
                ancestors.push((name.as_str(), params.as_str()));
                walk_rules(children, ancestors, out);
                ancestors.pop();
            }
            Node::Decl(_) => {}
        }
    }
}
