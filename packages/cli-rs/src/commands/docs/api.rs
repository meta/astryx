//! `docs()` (api/docs/docs.mjs and its leaves): routes a read by argument
//! shape into the list, a topic's index, whole doc or one section, or a node
//! of the docs tree, and answers with the `{type, package?, data, meta?}`
//! response the JS API returns.
//!
//! TEMP: the catalog and tree are the CLI's own docs from the embedded model;
//! integration docs need the discovery lane's doc compiler.

use super::model::Variant;
use super::sections::{find_doc_section, section_title_key, ReaderSection};
use crate::json::{Map, Value};
use std::collections::HashMap;

/// A docs error: `AstryxError(message, suggestions, code)`.
#[derive(Debug, Clone)]
pub struct DocsError {
    pub message: String,
    pub suggestions: Vec<(String, String)>,
    pub code: &'static str,
}

fn err(message: String, suggestions: Vec<(String, String)>, code: &'static str) -> DocsError {
    DocsError { message, suggestions, code }
}

/// What `docs(topic, section, options)` was asked.
#[derive(Debug, Clone, Default)]
pub struct DocsOptions {
    pub lang: Option<String>,
    pub zh: bool,
    pub dense: bool,
    pub index: bool,
    /// `None`, `Some(None)` for `'all'`, `Some(Some(n))` for n levels.
    pub depth: Option<Option<u64>>,
    pub detail: Option<String>,
}

impl DocsOptions {
    fn effective_lang(&self) -> &'static str {
        let lang = self.lang.as_deref().filter(|l| !l.is_empty());
        let l = match lang {
            Some(l) => l,
            None if self.dense => "dense",
            None if self.zh => "zh",
            None => "en",
        };
        match l {
            "dense" => "dense",
            "zh" => "zh",
            _ => "en",
        }
    }
}

struct DepthRead {
    /// u64::MAX for every level.
    depth: u64,
    detail: String,
    lang: &'static str,
}

// ─── Tree ─────────────────────────────────────────────────────────────────

pub struct Node {
    pub v: Value,
}

impl Node {
    fn s(&self, k: &str) -> &str {
        self.v.get(k).and_then(|x| x.as_str()).unwrap_or("")
    }
    pub fn route(&self) -> &str {
        self.s("route")
    }
    pub fn name(&self) -> &str {
        self.s("name")
    }
    pub fn kind(&self) -> &str {
        self.s("kind")
    }
    pub fn title(&self) -> &str {
        self.s("title")
    }
    pub fn summary(&self) -> &str {
        self.s("summary")
    }
    pub fn provider(&self) -> &str {
        self.s("provider")
    }
    pub fn parent(&self) -> Option<&str> {
        self.v.get("parent").and_then(|x| x.as_str())
    }
    pub fn flat_topic(&self) -> Option<&str> {
        self.v.get("flatTopic").and_then(|x| x.as_str())
    }
    pub fn topic_file(&self) -> bool {
        self.v.get("topicFile").and_then(|x| x.as_bool()).unwrap_or(false)
    }
    pub fn experimental(&self) -> bool {
        self.v.get("experimental").and_then(|x| x.as_bool()).unwrap_or(false)
    }
    /// `(name, title, children)` per slot.
    pub fn slots(&self) -> Vec<(Value, Value, Vec<String>)> {
        self.v
            .get("slots")
            .and_then(|x| x.as_array())
            .map(|a| {
                a.iter()
                    .map(|s| {
                        let children = s
                            .get("children")
                            .and_then(|c| c.as_array())
                            .map(|c| c.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                            .unwrap_or_default();
                        (s.get("name").cloned().unwrap_or(Value::Null), s.get("title").cloned().unwrap_or(Value::Null), children)
                    })
                    .collect()
            })
            .unwrap_or_default()
    }
    fn is_guide(&self) -> bool {
        self.kind() == "generic" && self.topic_file()
    }
}

pub struct Tree {
    pub nodes: Vec<Node>,
    by_route: HashMap<String, usize>,
    by_folded: HashMap<String, usize>,
}

impl Tree {
    fn new(nodes: Vec<Value>) -> Tree {
        let nodes: Vec<Node> = nodes.into_iter().map(|v| Node { v }).collect();
        let mut by_route = HashMap::new();
        let mut by_folded = HashMap::new();
        for (i, n) in nodes.iter().enumerate() {
            by_route.insert(n.route().to_string(), i);
            by_folded.entry(n.route().to_lowercase()).or_insert(i);
        }
        Tree { nodes, by_route, by_folded }
    }
    pub fn get(&self, route: &str) -> Option<&Node> {
        self.by_route.get(route).map(|&i| &self.nodes[i])
    }
    pub fn get_folded(&self, route: &str) -> Option<&Node> {
        self.by_folded.get(&route.to_lowercase()).map(|&i| &self.nodes[i])
    }
    fn get_any(&self, route: &str) -> Option<&Node> {
        self.get(route).or_else(|| self.get_folded(route))
    }
    pub fn roots(&self) -> Vec<&Node> {
        self.nodes.iter().filter(|n| n.parent().is_none()).collect()
    }
    fn ancestors(&self, node: &Node) -> Vec<&Node> {
        let mut chain = Vec::new();
        let mut parent = node.parent().and_then(|p| self.get(p));
        while let Some(p) = parent {
            chain.insert(0, p);
            parent = p.parent().and_then(|q| self.get(q));
        }
        chain
    }
}

// ─── Catalog ──────────────────────────────────────────────────────────────

pub struct Topic {
    pub v: Value,
}

impl Topic {
    pub fn name(&self) -> &str {
        self.v.get("name").and_then(|x| x.as_str()).unwrap_or("")
    }
    pub fn package(&self) -> &str {
        self.v.get("package").and_then(|x| x.as_str()).unwrap_or("")
    }
}

/// A topic a read opens: a flat topic, or a guide the tree places.
#[derive(Clone)]
struct Entry {
    name: String,
    package: String,
    tree: bool,
}

impl Entry {
    fn key(&self, lang: &str) -> String {
        format!("{}:{}:{}", if self.tree { "guide" } else { "topic" }, self.name, lang)
    }
}

pub struct Docs {
    pub variant: Variant,
    pub tree: Tree,
    pub topics: Vec<Topic>,
    /// Topic reads built at run time (integration topics and guides).
    extra_reads: HashMap<String, Value>,
    /// `(package, message)` for each package whose docs did not load.
    issues: Vec<(String, String)>,
    not_loaded_suffix: String,
    /// Built at run time from a catalog the integrations changed.
    runtime: bool,
}

enum Owner<'a> {
    Topic(Entry),
    Node(&'a Node),
}

impl Docs {
    pub fn load(pm: &str) -> Docs {
        let variant = Variant::get(pm);
        let tree = Tree::new(variant.nodes());
        let topics = variant.topics().into_iter().map(|v| Topic { v }).collect();
        Docs { variant, tree, topics, extra_reads: HashMap::new(), issues: vec![], not_loaded_suffix: String::new(), runtime: false }
    }

    /// The project's docs: the CLI's own, plus whatever its integrations
    /// contribute.
    pub fn load_project(pm: &str, cwd: &str) -> Docs {
        let Some(catalog) = super::runtime::discover(cwd) else { return Self::load(pm) };
        let variant = Variant::get(pm);
        let built = super::runtime::build(&variant, catalog, cwd);
        Docs {
            tree: Tree::new(built.nodes),
            topics: built.topics.into_iter().map(|v| Topic { v }).collect(),
            variant,
            extra_reads: built.reads,
            issues: built.issues,
            not_loaded_suffix: String::new(),
            runtime: true,
        }
    }

    fn read(&self, key: &str) -> Option<Value> {
        match self.extra_reads.get(key) {
            Some(v) => Some(v.clone()),
            None => {
                let mut v = self.variant.read(key)?;
                if self.runtime {
                    // The CLI's own topic, in a tree the integrations changed:
                    // its moves come from this tree.
                    let mut parts = key.splitn(2, ':');
                    let kind = parts.next().unwrap_or("");
                    let rest = parts.next().unwrap_or("");
                    let name = &rest[..rest.rfind(':').unwrap_or(rest.len())];
                    let placed = self.tree.get(name).filter(|n| if kind == "guide" { n.kind() == "generic" } else { n.flat_topic() == Some(name) });
                    if let Some(node) = placed {
                        let links = Value::Object(self.place_links(node));
                        for k in ["detail", "index"] {
                            if let Some(m) = v.get_mut(k).and_then(|x| x.as_object_mut()) {
                                m.insert("links".into(), links.clone());
                            }
                        }
                    }
                }
                Some(v)
            }
        }
    }

    /// Set the stem the `notLoaded` sentence prints its command with.
    pub fn set_command_format(&mut self, format_cmd: &dyn Fn(&str) -> String) {
        self.not_loaded_suffix = self.not_loaded(format_cmd);
    }

    /// `notLoaded(catalog)`.
    fn not_loaded(&self, format_cmd: &dyn Fn(&str) -> String) -> String {
        let mut packages: Vec<&str> = Vec::new();
        for (p, _) in &self.issues {
            if !packages.contains(&p.as_str()) {
                packages.push(p);
            }
        }
        if packages.is_empty() {
            return String::new();
        }
        format!(". The docs of {} did not load; run `{}` in that package to see why.", packages.join(", "), format_cmd("doctor integration docs"))
    }

    fn resolve(&self, name: &str) -> Option<&Topic> {
        let key = name.to_lowercase();
        self.topics.iter().find(|t| t.name().to_lowercase() == key).or_else(|| {
            self.topics.iter().find(|t| t.v["aliases"].as_array().map(|a| a.iter().any(|x| x.as_str() == Some(key.as_str()))).unwrap_or(false))
        })
    }

    fn topic_entry(t: &Topic) -> Entry {
        Entry { name: t.name().to_string(), package: t.package().to_string(), tree: false }
    }

    fn guide_entry(n: &Node) -> Entry {
        let package = n.v.get("replacementPackage").and_then(|p| p.as_str()).unwrap_or(n.provider());
        Entry { name: n.route().to_string(), package: package.to_string(), tree: true }
    }

    fn name_owner(&self, name: &str) -> Option<Owner<'_>> {
        if let Some(node) = self.tree.get_any(name) {
            return match node.flat_topic() {
                None => Some(Owner::Node(node)),
                Some(flat) => self.resolve(flat).map(|t| Owner::Topic(Self::topic_entry(t))),
            };
        }
        if let Some(t) = self.resolve(name) {
            return match self.route_owner(t) {
                None => Some(Owner::Topic(Self::topic_entry(t))),
                Some(n) => Some(Owner::Node(n)),
            };
        }
        self.child_owner(name).map(Owner::Node)
    }

    fn route_owner(&self, t: &Topic) -> Option<&Node> {
        let node = self.tree.get_any(t.name())?;
        if node.flat_topic() == Some(t.name()) && node.provider() == t.package() {
            None
        } else {
            Some(node)
        }
    }

    fn child_owner(&self, name: &str) -> Option<&Node> {
        let wanted = name.to_lowercase();
        let slash = wanted.rfind('/').filter(|&i| i > 0);
        let unstuttered = slash.map(|s| {
            let parent = &wanted[..s];
            let last = &parent[parent.rfind('/').map(|i| i + 1).unwrap_or(0)..];
            format!("{parent}/{last}-{}", &wanted[s + 1..])
        });
        let matches: Vec<&Node> = self
            .tree
            .nodes
            .iter()
            .filter(|n| {
                n.flat_topic().is_none()
                    && n.route().contains('/')
                    && !n.experimental()
                    && (n.name().to_lowercase() == wanted || unstuttered.as_deref().map(|u| n.route().to_lowercase() == u).unwrap_or(false))
            })
            .collect();
        if matches.len() == 1 {
            Some(matches[0])
        } else {
            None
        }
    }

    fn holds_own_name(&self, t: &Topic) -> bool {
        match self.name_owner(t.name()) {
            Some(Owner::Topic(e)) => e.name == t.name() && e.package == t.package(),
            _ => false,
        }
    }

    /// Resolve a docs argument the way `resolveDocsArgument` does.
    fn resolve_argument(&self, topic: &str) -> Option<Owner<'_>> {
        if topic.is_empty() {
            return None;
        }
        match self.name_owner(topic)? {
            Owner::Node(n) if n.kind() == "generic" => Some(Owner::Topic(Self::guide_entry(n))),
            other => Some(other),
        }
    }

    // ─── Errors ───────────────────────────────────────────────────────────

    const MOVED_ROUTES: &'static [(&'static str, &'static str)] = &[("cli/integrations", "authoring"), ("cli-integrations", "authoring")];

    fn moved_route(&self, topic: &str) -> Option<&Node> {
        let wanted = topic.to_lowercase();
        for (from, to) in Self::MOVED_ROUTES {
            if wanted != *from && !wanted.starts_with(&format!("{from}/")) {
                continue;
            }
            if let Some(n) = self.tree.get_folded(&format!("{to}{}", &wanted[from.len()..])) {
                return Some(n);
            }
        }
        None
    }

    fn unknown_topic_error(&self, topic: &str) -> DocsError {
        let mut suggestions: Vec<(String, String)> = Vec::new();
        let mut route_children = false;
        if topic.contains('/') {
            let parts: Vec<&str> = topic.split('/').collect();
            let mut depth = parts.len() - 1;
            while depth > 0 && suggestions.is_empty() {
                if let Some(near) = self.tree.get(&parts[..depth].join("/")) {
                    route_children = true;
                    for (_, _, children) in near.slots() {
                        for r in children {
                            let reason = self.tree.get(&r).map(|n| n.summary().to_string()).unwrap_or_default();
                            suggestions.push((r, reason));
                        }
                    }
                }
                depth -= 1;
            }
        }
        if suggestions.is_empty() {
            let wanted = topic.to_lowercase();
            suggestions = self
                .tree
                .nodes
                .iter()
                .filter(|n| n.flat_topic().is_none() && (n.name().to_lowercase() == wanted || n.route().replace('/', "-").to_lowercase() == wanted))
                .map(|n| (n.route().to_string(), n.summary().to_string()))
                .collect();
        }
        if suggestions.is_empty() {
            for r in self.tree.roots() {
                suggestions.push((r.route().to_string(), "docs namespace".into()));
            }
            for t in &self.topics {
                suggestions.push((t.name().to_string(), "available topic".into()));
            }
        }
        suggestions = crate::text::suggest_order::order_route_suggestions(topic, &suggestions, &|s: &(String, String)| s.0.clone(), false, !route_children);
        if let Some(moved) = self.moved_route(topic) {
            let mut s = vec![(moved.route().to_string(), moved.summary().to_string())];
            s.extend(suggestions.into_iter().filter(|(n, _)| n != moved.route()));
            return err(format!("Unknown topic \"{topic}\". It moved to \"{}\"{}", moved.route(), self.not_loaded_suffix), s, "ERR_UNKNOWN_TOPIC");
        }
        err(format!("Unknown topic \"{topic}\"{}", self.not_loaded_suffix), suggestions, "ERR_UNKNOWN_TOPIC")
    }

    // ─── Reads ────────────────────────────────────────────────────────────

    /// `docs(topic, section, options)`.
    pub fn docs(&self, topic: Option<&str>, section: Option<&str>, options: &DocsOptions, format_cmd: &dyn Fn(&str) -> String) -> Result<Value, DocsError> {
        let read = self.depth_read(options)?;
        let topic = match topic {
            Some(t) if !t.is_empty() => t,
            _ => return Ok(self.list(options.depth)),
        };
        match self.resolve_argument(topic) {
            None => Err(self.unknown_topic_error(topic)),
            Some(Owner::Node(node)) => {
                if let Some(section) = section.filter(|s| !s.is_empty()) {
                    if node.kind() == "namespace" {
                        return self.namespace_section(node, section, options);
                    }
                    return Err(err(
                        format!("\"{}\" has no sections. Read it whole: {}.", node.route(), format_cmd(&format!("docs {}", node.route()))),
                        vec![(node.route().to_string(), node.summary().to_string())],
                        "ERR_UNKNOWN_SECTION",
                    ));
                }
                let mut r = Map::new();
                r.insert("type".into(), Value::from("docs.node"));
                r.insert("package".into(), Value::from(node.provider()));
                r.insert("data".into(), self.node_view(node, read.as_ref()));
                Ok(Value::Object(r))
            }
            Some(Owner::Topic(entry)) => {
                let lang = options.effective_lang();
                if let Some(section) = section.filter(|s| !s.is_empty()) {
                    return self.section(&entry, topic, section, lang);
                }
                let read = self.read(&entry.key(lang)).ok_or_else(|| self.unknown_topic_error(topic))?;
                let (ty, data) = if options.index { ("docs.index", read["index"].clone()) } else { ("docs.detail", read["detail"].clone()) };
                let mut r = Map::new();
                r.insert("type".into(), Value::from(ty));
                r.insert("package".into(), Value::from(entry.package.as_str()));
                r.insert("data".into(), data);
                Ok(Value::Object(r))
            }
        }
    }

    fn depth_read(&self, options: &DocsOptions) -> Result<Option<DepthRead>, DocsError> {
        if let Some(d) = &options.detail {
            if !["brief", "compact", "full"].contains(&d.as_str()) {
                return Err(err(format!("detail is brief, compact, or full, not {}.", crate::json::stringify(&Value::from(d.as_str()), 0)), vec![], "ERR_INVALID_DETAIL"));
            }
        }
        if options.depth.is_none() && options.detail.is_none() {
            return Ok(None);
        }
        Ok(Some(DepthRead {
            depth: match options.depth {
                None => 1,
                Some(None) => u64::MAX,
                Some(Some(n)) => n,
            },
            detail: options.detail.clone().unwrap_or_else(|| "brief".into()),
            lang: options.effective_lang(),
        }))
    }

    fn list(&self, depth: Option<Option<u64>>) -> Value {
        let mut entries = Vec::new();
        for t in &self.topics {
            if !self.holds_own_name(t) {
                continue;
            }
            let mut m = Map::new();
            m.insert("topic".into(), Value::from(t.name()));
            m.insert("description".into(), t.v.get("description").cloned().unwrap_or(Value::from("")));
            m.insert("package".into(), Value::from(t.package()));
            if let Some(r) = t.v.get("replaces").filter(|r| r.is_string()) {
                m.insert("replaces".into(), r.clone());
                if let Some(p) = t.v.get("replacedPackage").filter(|r| r.is_string()) {
                    m.insert("replacedPackage".into(), p.clone());
                }
            }
            entries.push(Value::Object(m));
        }
        let levels = depth.map(|d| d.unwrap_or(u64::MAX));
        let namespaces: Vec<Value> = self.tree.roots().into_iter().map(|r| self.branch(r, levels)).collect();
        let mut r = Map::new();
        r.insert("type".into(), Value::from("docs.list"));
        r.insert("data".into(), Value::Array(entries));
        let mut meta = Map::new();
        if !namespaces.is_empty() {
            meta.insert("namespaces".into(), Value::Array(namespaces));
        }
        if !self.issues.is_empty() {
            let issues: Vec<Value> = self
                .issues
                .iter()
                .map(|(p, m)| {
                    let mut o = Map::new();
                    o.insert("package".into(), Value::from(p.as_str()));
                    o.insert("message".into(), Value::from(m.as_str()));
                    Value::Object(o)
                })
                .collect();
            meta.insert("notLoaded".into(), Value::Array(issues));
        }
        if !meta.is_empty() {
            r.insert("meta".into(), Value::Object(meta));
        }
        Value::Object(r)
    }

    fn branch(&self, node: &Node, levels: Option<u64>) -> Value {
        let mut listed = Map::new();
        listed.insert("topic".into(), Value::from(node.route()));
        listed.insert("description".into(), Value::from(node.summary()));
        listed.insert("package".into(), Value::from(node.provider()));
        let Some(levels) = levels else { return Value::Object(listed) };
        let below: Vec<String> = node.slots().into_iter().flat_map(|(_, _, c)| c).collect();
        if levels == 0 {
            if !below.is_empty() {
                listed.insert("childCount".into(), Value::from(below.len()));
            }
            return Value::Object(listed);
        }
        let children: Vec<Value> = below
            .iter()
            .filter_map(|r| self.tree.get(r))
            .map(|child| {
                let rest = self.branch(child, Some(levels - 1));
                let mut v = self.child_identity(child);
                let route = v["route"].clone();
                let summary = v["summary"].clone();
                let m = v.as_object_mut().unwrap();
                m.insert("topic".into(), route);
                m.insert("description".into(), summary);
                if let Some(c) = rest.get("children") {
                    m.insert("children".into(), c.clone());
                }
                if let Some(c) = rest.get("childCount") {
                    m.insert("childCount".into(), c.clone());
                }
                v
            })
            .collect();
        if !children.is_empty() {
            listed.insert("children".into(), Value::Array(children));
        }
        Value::Object(listed)
    }

    fn child_identity(&self, child: &Node) -> Value {
        let mut m = Map::new();
        let route = child.route();
        m.insert("route".into(), Value::from(route));
        m.insert("name".into(), Value::from(&route[route.rfind('/').map(|i| i + 1).unwrap_or(0)..]));
        match child.v.get("replacementPackage").and_then(|p| p.as_str()) {
            Some(rp) => {
                m.insert("package".into(), Value::from(rp));
                m.insert("replaces".into(), Value::from(route));
                m.insert("replacedPackage".into(), child.v.get("replacedPackage").cloned().unwrap_or(Value::from(child.provider())));
            }
            None => {
                m.insert("package".into(), Value::from(child.provider()));
            }
        }
        m.insert("kind".into(), Value::from(child.kind()));
        m.insert("title".into(), child.v.get("title").cloned().unwrap_or(Value::Null));
        m.insert("summary".into(), child.v.get("summary").cloned().unwrap_or(Value::Null));
        if child.experimental() {
            m.insert("stability".into(), Value::from("experimental"));
        }
        Value::Object(m)
    }

    fn node_content(node: &Node) -> Value {
        match node.v.get("content") {
            Some(Value::Array(a)) => Value::Array(a.clone()),
            _ => Value::Array(vec![]),
        }
    }

    fn node_view(&self, node: &Node, read: Option<&DepthRead>) -> Value {
        let slots: Vec<(Value, Value, Vec<String>)> = node.slots().into_iter().filter(|(_, _, c)| !c.is_empty()).collect();
        let mut m = Map::new();
        m.insert("id".into(), node.v.get("id").cloned().unwrap_or(Value::Null));
        m.insert("route".into(), Value::from(node.route()));
        m.insert("kind".into(), Value::from(node.kind()));
        m.insert("package".into(), Value::from(node.provider()));
        m.insert("title".into(), node.v.get("title").cloned().unwrap_or(Value::Null));
        m.insert("summary".into(), node.v.get("summary").cloned().unwrap_or(Value::Null));
        if node.experimental() {
            m.insert("stability".into(), Value::from("experimental"));
        }
        let crumbs: Vec<Value> = self
            .tree
            .ancestors(node)
            .into_iter()
            .map(|a| {
                let mut c = Map::new();
                c.insert("route".into(), Value::from(a.route()));
                c.insert("title".into(), a.v.get("title").cloned().unwrap_or(Value::Null));
                Value::Object(c)
            })
            .collect();
        m.insert("breadcrumb".into(), Value::Array(crumbs));
        let slot_values: Vec<Value> = match read {
            None => slots
                .iter()
                .map(|(name, title, children)| {
                    let mut s = Map::new();
                    s.insert("name".into(), name.clone());
                    s.insert("title".into(), title.clone());
                    s.insert("children".into(), Value::Array(children.iter().filter_map(|r| self.tree.get(r)).map(|c| self.child_identity(c)).collect()));
                    Value::Object(s)
                })
                .collect(),
            Some(r) if r.depth >= 1 => self.slots_below(&slots, 1, r),
            Some(_) => vec![],
        };
        m.insert("slots".into(), Value::Array(slot_values));
        m.insert("content".into(), Self::node_content(node));
        m.insert("links".into(), self.node_links(node));
        if let Some(r) = read {
            if r.depth < 1 && !slots.is_empty() {
                m.insert("childCount".into(), Value::from(slots.iter().map(|s| s.2.len()).sum::<usize>()));
            }
        }
        Value::Object(m)
    }

    fn slots_below(&self, slots: &[(Value, Value, Vec<String>)], level: u64, read: &DepthRead) -> Vec<Value> {
        slots
            .iter()
            .map(|(name, title, children)| {
                let mut s = Map::new();
                s.insert("name".into(), name.clone());
                s.insert("title".into(), title.clone());
                s.insert("children".into(), Value::Array(children.iter().filter_map(|r| self.tree.get(r)).map(|c| self.child_below(c, level, read)).collect()));
                Value::Object(s)
            })
            .collect()
    }

    fn child_below(&self, child: &Node, level: u64, read: &DepthRead) -> Value {
        let mut view = self.child_identity(child);
        if read.detail != "brief" {
            let m = view.as_object_mut().unwrap();
            if child.kind() == "generic" {
                let entry = if child.topic_file() {
                    Some(Self::guide_entry(child))
                } else if let Some(flat) = child.flat_topic() {
                    self.resolve(flat).map(Self::topic_entry)
                } else {
                    None
                };
                if let Some(e) = entry {
                    if let Some(r) = self.read(&e.key(read.lang)) {
                        m.insert("sections".into(), r["childSections"].clone());
                    }
                }
            } else {
                m.insert("content".into(), Self::node_content(child));
            }
        }
        let slots: Vec<(Value, Value, Vec<String>)> = child.slots().into_iter().filter(|(_, _, c)| !c.is_empty()).collect();
        if !slots.is_empty() {
            let m = view.as_object_mut().unwrap();
            if level < read.depth {
                m.insert("slots".into(), Value::Array(self.slots_below(&slots, level + 1, read)));
            } else {
                m.insert("childCount".into(), Value::from(slots.iter().map(|s| s.2.len()).sum::<usize>()));
            }
        }
        view
    }

    fn place_links(&self, node: &Node) -> Map<String, Value> {
        let mut links = Map::new();
        links.insert("up".into(), Value::from(match node.parent() {
            None => "astryx docs".to_string(),
            Some(p) => format!("astryx docs {p}"),
        }));
        let parent = node.parent().and_then(|p| self.tree.get(p));
        let experimental = node.experimental();
        let siblings: Vec<String> = parent
            .and_then(|p| p.slots().into_iter().find(|(_, _, c)| c.iter().any(|r| r == node.route())))
            .map(|(_, _, c)| c)
            .unwrap_or_default()
            .into_iter()
            .filter(|r| self.tree.get(r).map(|s| s.experimental() == experimental).unwrap_or(true))
            .collect();
        if let Some(at) = siblings.iter().position(|r| r == node.route()) {
            if at > 0 {
                links.insert("previous".into(), Value::from(format!("astryx docs {}", siblings[at - 1])));
            }
            if at + 1 < siblings.len() {
                links.insert("next".into(), Value::from(format!("astryx docs {}", siblings[at + 1])));
            }
        }
        links
    }

    fn node_links(&self, node: &Node) -> Value {
        let mut links = self.place_links(node);
        if let Some(Value::Array(related)) = node.v.get("related") {
            if !related.is_empty() {
                links.insert(
                    "related".into(),
                    Value::Array(related.iter().map(|r| Value::from(format!("astryx docs {}", r.as_str().unwrap_or("")))).collect()),
                );
            }
        }
        Value::Object(links)
    }

    fn reader_sections(read: &Value) -> Vec<ReaderSection> {
        read["reader"]
            .as_array()
            .map(|a| {
                a.iter()
                    .map(|s| ReaderSection {
                        key: s["key"].as_str().unwrap_or("").to_string(),
                        title: s["title"].as_str().unwrap_or("").to_string(),
                        source_title: s["sourceTitle"].as_str().unwrap_or("").to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn section(&self, entry: &Entry, topic: &str, section: &str, lang: &str) -> Result<Value, DocsError> {
        if section.trim().is_empty() {
            return Err(err("A section name is required".into(), vec![], "ERR_UNKNOWN_SECTION"));
        }
        let read = self.read(&entry.key(lang)).ok_or_else(|| self.unknown_topic_error(topic))?;
        let sections = Self::reader_sections(&read);
        match find_doc_section(&sections, section) {
            None => Err(err(
                format!("Section \"{section}\" not found in \"{topic}\""),
                sections.iter().map(|s| (s.title.clone(), "available section".to_string())).collect(),
                "ERR_UNKNOWN_SECTION",
            )),
            Some(at) => Ok(self.section_response(entry, &read, &sections, at)),
        }
    }

    fn section_response(&self, entry: &Entry, read: &Value, sections: &[ReaderSection], at: usize) -> Value {
        let r = &read["reader"][at];
        let mut data = match r.get("detailAt").and_then(|x| x.as_u64()) {
            Some(i) => read["childSections"][i as usize].clone(),
            None => r["view"].clone(),
        };
        let mut links = Map::new();
        links.insert("up".into(), Value::from(format!("astryx docs {} --index", entry.name)));
        if at > 0 {
            links.insert("previous".into(), Value::from(format!("astryx docs {} {}", entry.name, sections[at - 1].key)));
        }
        if at + 1 < sections.len() {
            links.insert("next".into(), Value::from(format!("astryx docs {} {}", entry.name, sections[at + 1].key)));
        }
        if let Some(m) = data.as_object_mut() {
            m.insert("links".into(), Value::Object(links));
        }
        let mut out = Map::new();
        out.insert("type".into(), Value::from("docs.detail.section"));
        out.insert("package".into(), r["package"].clone());
        out.insert("data".into(), data);
        Value::Object(out)
    }

    fn guides_below<'a>(&'a self, namespace: &'a Node, out: &mut Vec<&'a Node>) {
        for (_, _, children) in namespace.slots() {
            for r in children {
                let Some(child) = self.tree.get(&r) else { continue };
                if child.parent() != Some(namespace.route()) {
                    continue;
                }
                if child.kind() == "namespace" {
                    self.guides_below(child, out);
                } else if child.is_guide() {
                    out.push(child);
                }
            }
        }
    }

    fn namespace_section(&self, namespace: &Node, section: &str, options: &DocsOptions) -> Result<Value, DocsError> {
        if section.trim().is_empty() {
            return Err(err("A section name is required".into(), vec![], "ERR_UNKNOWN_SECTION"));
        }
        let lang = options.effective_lang();
        let mut guides = Vec::new();
        self.guides_below(namespace, &mut guides);
        let wanted = section.trim();
        let derived = section_title_key(wanted);
        struct Found<'a> {
            guide: &'a Node,
            entry: Entry,
            read: Value,
            sections: Vec<ReaderSection>,
            at: usize,
        }
        let mut by_key: Vec<usize> = Vec::new();
        let mut found: Vec<Found> = Vec::new();
        for g in &guides {
            let entry = Self::guide_entry(g);
            let Some(read) = self.read(&entry.key(lang)) else { continue };
            let sections = Self::reader_sections(&read);
            let Some(at) = find_doc_section(&sections, wanted) else { continue };
            let m = &sections[at];
            let keyed = m.key == wanted || (!derived.is_empty() && section_title_key(&m.source_title) == derived);
            found.push(Found { guide: g, entry, read, sections, at });
            if keyed {
                by_key.push(found.len() - 1);
            }
        }
        let matches: Vec<&Found> = if !by_key.is_empty() { by_key.iter().map(|&i| &found[i]).collect() } else { found.iter().collect() };
        if matches.len() == 1 {
            let f = matches[0];
            return Ok(self.section_response(&f.entry, &f.read, &f.sections, f.at));
        }
        if guides.is_empty() {
            let mut s = Vec::new();
            for (_, _, children) in namespace.slots() {
                for r in children {
                    let reason = self.tree.get(&r).map(|n| n.summary().to_string()).unwrap_or_default();
                    s.push((r, reason));
                }
            }
            return Err(err(format!("\"{}\" has no sections. Open one of its children instead.", namespace.route()), s, "ERR_UNKNOWN_SECTION"));
        }
        if matches.is_empty() {
            return Err(err(
                format!("Section \"{section}\" is not in any guide under \"{}\". Open one of its guides instead.", namespace.route()),
                guides.iter().map(|g| (g.route().to_string(), g.summary().to_string())).collect(),
                "ERR_UNKNOWN_SECTION",
            ));
        }
        Err(err(
            format!("Section \"{section}\" matches sections in more than one guide under \"{}\". Read it from one of them.", namespace.route()),
            matches.iter().map(|f| (f.guide.route().to_string(), format!("has \"{}\"", f.sections[f.at].title))).collect(),
            "ERR_UNKNOWN_SECTION",
        ))
    }
}
