//! The parts of PostCSS's tree the theme checks walk: rules with their
//! selectors and declarations, at-rules with their names and params, and each
//! node's at-rule ancestors.

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

/// `postcss.parse(css)`: the root's nodes (the experimental render lane's
/// PostCSS port), without comments. Err = PostCSS's syntax error.
pub fn parse(css: &str) -> Result<Vec<Node>, String> {
    use crate::commands::experimental::render::css as pc;
    let tree = pc::parse(css)?;
    fn convert(tree: &pc::Tree, ids: &[usize]) -> Vec<Node> {
        let mut out = Vec::new();
        for &id in ids {
            let n = &tree.nodes[id];
            if n.removed {
                continue;
            }
            let kids: Vec<usize> = n.nodes.clone().unwrap_or_default();
            match &n.kind {
                pc::Kind::Rule { selector, .. } => out.push(Node::Rule { selector: selector.clone(), children: convert(tree, &kids) }),
                pc::Kind::AtRule { name, params, .. } => out.push(Node::AtRule { name: name.clone(), params: params.clone(), children: convert(tree, &kids) }),
                pc::Kind::Decl { prop, value, printed } => {
                    let important = printed.trim_end().len() > prop.len() + n.between.len() + value.len() && printed.contains('!');
                    out.push(Node::Decl(Decl { prop: prop.clone(), value: value.clone(), important }));
                }
                _ => {}
            }
        }
        out
    }
    let root: Vec<usize> = tree.nodes[0].nodes.clone().unwrap_or_default();
    Ok(convert(&tree, &root))
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
