//! The docs tree (foundation/doc-compiler/tree.mjs `buildDocsTree`): every
//! namespace, the docs placed or adopted into them, and the flat topics in
//! their generated topic levels, each at one route.
//!
//! Owner: the docs lane (agreed with discovery).

use crate::json::{Map, Value};
use std::collections::{HashMap, HashSet};

pub const CLI_PROVIDER: &str = "@astryxdesign/cli";
pub const CLI_PROVIDER_ID: &str = "@astryxdesign/cli";

const KIND_GROUPS: &[(&str, &str, &str, &str)] = &[
    ("command", "commands", "Commands", "Every command and subcommand."),
    ("function", "functions", "Functions", "Every function: its signature, parameters, returns, and errors."),
    ("schema", "schemas", "Schemas", "Data shapes, field by field."),
    ("enum", "enums", "Enums", "Every fixed list of values, such as error codes and response types."),
    ("generic", "guides", "Guides", "Every guide."),
];

const TOPIC_LEVELS: &[(&str, &str, &str)] = &[
    (
        "guides",
        "Guides",
        "Guides that stand on their own: getting started, principles, theming, and working with AI. Each topic keeps its own name; open one by it.",
    ),
    (
        "foundations",
        "Foundations",
        "Color, elevation, icons, illustrations, motion, shape, and spacing: the visual foundations every component builds on. Each topic keeps its own name; open one by it.",
    ),
];

fn topic_level(category: Option<&str>) -> &'static str {
    if category == Some("foundations") {
        "foundations"
    } else {
        "guides"
    }
}

fn is_route_segment(s: &str) -> bool {
    !s.is_empty() && s.split('-').all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
}

/// `routeSegment(name)`.
pub fn route_segment(name: &str) -> String {
    let chars: Vec<char> = name.chars().collect();
    let mut spaced = String::new();
    for (i, &c) in chars.iter().enumerate() {
        if i > 0 && c.is_ascii_uppercase() && (chars[i - 1].is_ascii_lowercase() || chars[i - 1].is_ascii_digit()) {
            spaced.push('-');
        }
        spaced.push(c);
    }
    let lower = spaced.to_lowercase();
    let mut out = String::new();
    let mut gap = false;
    for c in lower.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            if gap && !out.is_empty() {
                out.push('-');
            }
            gap = false;
            out.push(c);
        } else {
            gap = true;
        }
    }
    out
}

fn encode_segment(v: &str) -> String {
    let mut out = String::new();
    for b in v.as_bytes() {
        let c = *b as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            out.push(c);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

/// `normalizeProviderId(name)`, or None when it is not a bare npm name.
pub fn normalize_provider_id(name: &str) -> Option<String> {
    let t = name.trim_matches(crate::cli::format::js_ws);
    if t.is_empty() {
        return None;
    }
    use unicode_normalization::UnicodeNormalization;
    let n: String = t.nfc().collect::<String>().to_lowercase();
    let ok_part = |p: &str| -> bool {
        let mut cs = p.chars();
        match cs.next() {
            Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit() => {}
            _ => return false,
        }
        cs.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "._~!*'()-".contains(c))
    };
    let valid = match n.strip_prefix('@') {
        Some(rest) => match rest.split_once('/') {
            Some((scope, pkg)) => ok_part(scope) && ok_part(pkg),
            None => false,
        },
        None => ok_part(&n),
    };
    if valid {
        Some(n)
    } else {
        None
    }
}

/// `createDocId(provider, kind, name)`.
pub fn create_doc_id(provider: &str, kind: &str, name: &str) -> String {
    let p = normalize_provider_id(provider).unwrap_or_else(|| provider.to_string());
    use unicode_normalization::UnicodeNormalization;
    let n: String = name.trim_matches(crate::cli::format::js_ws).nfc().collect();
    format!("astryx:artifact:v1/{}/{kind}/{}", encode_segment(&p), encode_segment(&n))
}

#[derive(Debug, Clone)]
pub struct NamespaceInput {
    pub provider: String,
    pub provider_id: String,
    pub source: String,
    pub doc: Value,
    pub rank: i64,
}

#[derive(Debug, Clone, Default)]
pub struct DocInput {
    pub provider: String,
    pub provider_id: String,
    pub source: String,
    pub kind: String,
    pub name: String,
    pub title: String,
    pub summary: String,
    pub group: Option<String>,
    pub placement: Option<Value>,
    pub topic_file: Option<String>,
    pub self_doc: Option<Value>,
    pub rank: i64,
}

#[derive(Debug, Clone, Default)]
pub struct TopicInput {
    pub provider: String,
    pub provider_id: String,
    pub name: String,
    pub title: String,
    pub summary: String,
    pub category: Option<String>,
    pub source: String,
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct Slot {
    pub name: String,
    pub title: Value,
    pub children: Vec<String>,
}

/// What a guide an integration replaces or extends by its route does to it.
#[derive(Debug, Clone, Default)]
pub struct GuideOverlay {
    pub replacement: Option<Value>,
    pub replaced_package: Option<String>,
    pub extensions: Vec<Value>,
}

#[derive(Debug, Clone)]
pub struct TreeNode {
    pub id: Option<String>,
    pub route: String,
    pub kind: String,
    pub provider: String,
    pub provider_id: String,
    pub name: String,
    pub title: String,
    pub summary: String,
    pub parent: Option<String>,
    pub slot: Option<String>,
    pub order: Option<f64>,
    pub generated: bool,
    pub flat_topic: Option<String>,
    pub topic_file: Option<String>,
    pub self_doc: Option<Value>,
    pub slots: Vec<Slot>,
    pub source: String,
    pub guide_overlay: Option<GuideOverlay>,
}

#[derive(Debug, Clone)]
pub struct Diagnostic {
    pub code: String,
    pub provider: String,
    pub source: String,
    pub message: String,
    pub field: Option<String>,
    pub severity: String,
}

pub struct DocsTree {
    /// In route order.
    pub nodes: Vec<TreeNode>,
    by_route: HashMap<String, usize>,
    by_folded: HashMap<String, usize>,
    pub diagnostics: Vec<Diagnostic>,
}

impl DocsTree {
    pub fn get(&self, route: &str) -> Option<&TreeNode> {
        self.by_route.get(route).map(|&i| &self.nodes[i])
    }
    pub fn get_mut(&mut self, route: &str) -> Option<&mut TreeNode> {
        self.by_route.get(route).copied().map(move |i| &mut self.nodes[i])
    }
    pub fn get_folded(&self, route: &str) -> Option<&TreeNode> {
        self.by_folded.get(&route.to_lowercase()).map(|&i| &self.nodes[i])
    }
    pub fn roots(&self) -> Vec<&TreeNode> {
        self.nodes.iter().filter(|n| n.parent.is_none()).collect()
    }
    pub fn ancestors(&self, node: &TreeNode) -> Vec<&TreeNode> {
        let mut chain = Vec::new();
        let mut p = node.parent.as_deref().and_then(|r| self.get(r));
        while let Some(n) = p {
            chain.insert(0, n);
            p = n.parent.as_deref().and_then(|r| self.get(r));
        }
        chain
    }
    /// `isExperimentalTreeNode(tree, node)`.
    pub fn is_experimental(&self, node: &TreeNode) -> bool {
        let exp = |n: &TreeNode| n.self_doc.as_ref().and_then(|d| d.get("stability")).and_then(|s| s.as_str()) == Some("experimental");
        exp(node) || self.ancestors(node).into_iter().any(exp)
    }
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

fn slot_names(doc: &Value) -> Vec<String> {
    doc.get("slots").and_then(|x| x.as_object()).map(|o| o.keys().cloned().collect()).unwrap_or_default()
}

fn resolve_parent(parent: &str, provider: &str, declared: &[(String, NamespaceInput)]) -> Result<String, String> {
    let (owner, name) = if let Some(n) = parent.strip_prefix("namespace:").filter(|n| !n.is_empty()) {
        (provider.to_string(), n.to_string())
    } else if let Some(i) = parent.rfind("/namespace/").filter(|&i| i > 0 && !parent[i + 11..].is_empty() && !parent[i + 11..].contains('/')) {
        (parent[..i].to_string(), parent[i + 11..].to_string())
    } else {
        return Err(format!("placement.parent \"{parent}\" is not a namespace reference. Write \"namespace:<name>\"."));
    };
    if owner != provider {
        return Err(format!("placement.parent \"{parent}\" belongs to {owner}. A doc can only be placed in a namespace of its own package ({provider})."));
    }
    let key = format!("{owner}\u{0}{name}");
    if !declared.iter().any(|(k, _)| *k == key) {
        let mut names: Vec<String> = declared.iter().filter(|(_, ns)| ns.provider == provider).map(|(_, ns)| format!("\"{}\"", s(&ns.doc, "name"))).collect();
        names.sort();
        return Err(format!(
            "placement.parent \"{parent}\" names no namespace; {provider} declares {}.",
            if names.is_empty() { "none".to_string() } else { names.join(", ") }
        ));
    }
    Ok(key)
}

fn check_placement(placement: &Value, kind: &str, provider: &str, declared: &[(String, NamespaceInput)]) -> Result<(String, String), String> {
    let key = resolve_parent(&s(placement, "parent"), provider, declared)?;
    let parent = &declared.iter().find(|(k, _)| *k == key).unwrap().1;
    let names = slot_names(&parent.doc);
    let pname = s(&parent.doc, "name");
    let slot = match placement.get("slot").and_then(|x| x.as_str()) {
        Some(sl) => sl.to_string(),
        None if names.len() == 1 => names[0].clone(),
        None => return Err(format!("placement names no slot, and namespace \"{pname}\" has {} ({}). Name one with placement.slot.", names.len(), names.join(", "))),
    };
    let Some(declared_slot) = parent.doc.get("slots").and_then(|x| x.get(&slot)) else {
        return Err(format!("placement.slot \"{slot}\" is not a slot of namespace \"{pname}\"; it declares {}.", names.join(", ")));
    };
    let kinds: Vec<String> = declared_slot.get("accepts").and_then(|a| a.get("kinds")).and_then(|k| k.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    if !kinds.iter().any(|k| k == kind) {
        return Err(format!("slot \"{slot}\" of namespace \"{pname}\" does not accept {kind} docs; it accepts {}.", kinds.join(", ")));
    }
    Ok((key, slot))
}

/// `buildDocsTree({namespaces, docs, topics})`.
pub fn build_docs_tree(namespaces: &[NamespaceInput], docs: &[DocInput], topics: &[TopicInput]) -> DocsTree {
    let mut diagnostics: Vec<Diagnostic> = Vec::new();
    let mut report = |code: &str, provider: &str, source: &str, message: String, field: Option<&str>| {
        diagnostics.push(Diagnostic { code: code.into(), provider: provider.into(), source: source.into(), message, field: field.map(String::from), severity: "error".into() });
    };
    let mut cli_routes: HashSet<String> = HashSet::new();
    if !topics.is_empty() {
        for (r, _, _) in TOPIC_LEVELS {
            cli_routes.insert(r.to_string());
        }
    }
    for t in topics {
        if t.provider == CLI_PROVIDER {
            cli_routes.insert(t.name.to_lowercase());
        }
    }
    let mut alias_routes: HashMap<String, &TopicInput> = HashMap::new();
    for t in topics {
        for a in &t.aliases {
            alias_routes.insert(a.to_lowercase(), t);
        }
    }
    let mut sorted_ns: Vec<&NamespaceInput> = namespaces.iter().collect();
    sorted_ns.sort_by(|a, b| {
        a.rank.cmp(&b.rank).then(a.provider.cmp(&b.provider)).then(s(&a.doc, "name").cmp(&s(&b.doc, "name"))).then(a.source.cmp(&b.source))
    });
    let mut declared: Vec<(String, NamespaceInput)> = Vec::new();
    for input in sorted_ns {
        let name = s(&input.doc, "name");
        if !is_route_segment(&name) {
            report("invalid_namespace", &input.provider, &input.source, format!("Namespace \"{name}\" is not a route segment. Use lowercase letters and digits joined by single hyphens."), Some("name"));
            continue;
        }
        let key = format!("{}\u{0}{name}", input.provider);
        if let Some((_, first)) = declared.iter().find(|(k, _)| *k == key) {
            let msg = format!("Namespace \"{name}\" is declared twice in {}: {} and {}.", input.provider, first.source, input.source);
            report("invalid_namespace", &input.provider, &input.source, msg, Some("name"));
            continue;
        }
        declared.push((key, input.clone()));
    }
    // parentOf: key -> None (root) | Some((parentKey, slot, order))
    let mut parent_of: HashMap<String, Option<(String, String, Option<f64>)>> = HashMap::new();
    for (key, input) in &declared {
        match input.doc.get("placement").filter(|p| !p.is_null()) {
            None => {
                parent_of.insert(key.clone(), None);
            }
            Some(p) => match check_placement(p, "namespace", &input.provider, &declared) {
                Err(e) => report("invalid_placement", &input.provider, &input.source, e, Some("placement")),
                Ok((pk, slot)) => {
                    parent_of.insert(key.clone(), Some((pk, slot, p.get("order").and_then(|o| o.as_f64()))));
                }
            },
        }
    }
    let mut route_of: HashMap<String, Option<String>> = HashMap::new();
    fn route_for(key: &str, seen: &mut HashSet<String>, parent_of: &HashMap<String, Option<(String, String, Option<f64>)>>, declared: &[(String, NamespaceInput)], route_of: &mut HashMap<String, Option<String>>) -> Option<String> {
        if let Some(r) = route_of.get(key) {
            return r.clone();
        }
        if !parent_of.contains_key(key) || seen.contains(key) {
            return None;
        }
        seen.insert(key.to_string());
        let home = parent_of.get(key).unwrap().clone();
        let name = s(&declared.iter().find(|(k, _)| k == key).unwrap().1.doc, "name");
        let parent_route = match &home {
            None => Some(String::new()),
            Some((pk, _, _)) => route_for(pk, seen, parent_of, declared, route_of),
        };
        let route = match parent_route {
            None => None,
            Some(p) if p.is_empty() => Some(name),
            Some(p) => Some(format!("{p}/{name}")),
        };
        route_of.insert(key.to_string(), route.clone());
        route
    }
    for (key, input) in &declared {
        if route_for(key, &mut HashSet::new(), &parent_of, &declared, &mut route_of).is_none() && parent_of.contains_key(key) {
            report(
                "invalid_placement",
                &input.provider,
                &input.source,
                format!("Namespace \"{}\" has no route: its placement forms a cycle, or a namespace above it was withdrawn.", s(&input.doc, "name")),
                Some("placement"),
            );
        }
    }

    let mut nodes: Vec<TreeNode> = Vec::new();
    let mut by_route: HashMap<String, usize> = HashMap::new();
    let mut by_folded: HashMap<String, usize> = HashMap::new();
    let mut add_node = |node: TreeNode, at_provider: &str, at_source: &str, nodes: &mut Vec<TreeNode>, report: &mut dyn FnMut(&str, &str, &str, String, Option<&str>)| -> bool {
        let folded = node.route.to_lowercase();
        let label = |n: &TreeNode| n.id.clone().unwrap_or_else(|| format!("the generated level \"{}\"", n.route));
        if node.provider != CLI_PROVIDER && cli_routes.contains(&folded) {
            report("duplicate_route", at_provider, at_source, format!("{} takes the route \"{}\", which the CLI's own docs keep. Rename it.", label(&node), node.route), None);
            return false;
        }
        if let Some(alias) = alias_routes.get(&folded) {
            if node.provider != CLI_PROVIDER && node.flat_topic.as_deref() != Some(alias.name.as_str()) {
                report(
                    "duplicate_route",
                    at_provider,
                    at_source,
                    format!("{} takes the route \"{}\", which the topic \"{}\" also answers to, because it replaced a topic of that name. Rename it.", label(&node), node.route, alias.name),
                    None,
                );
                return false;
            }
        }
        if let Some(&ti) = by_folded.get(&folded) {
            let taken = &nodes[ti];
            if taken.provider == CLI_PROVIDER && node.provider != CLI_PROVIDER && !node.generated {
                let what = |n: &TreeNode| match n.kind.as_str() {
                    "namespace" => "namespace".to_string(),
                    "generic" => "topic".to_string(),
                    k => format!("{k} doc"),
                };
                let scope = node.provider.rsplit('/').next().unwrap_or("").to_string();
                let mut cleaned = String::new();
                let mut gap = false;
                for c in scope.chars() {
                    if c.is_ascii_alphanumeric() {
                        if gap {
                            cleaned.push('-');
                        }
                        gap = false;
                        cleaned.push(c);
                    } else {
                        gap = true;
                    }
                }
                if gap {
                    cleaned.push('-');
                }
                let cleaned = cleaned.trim_start_matches('-').to_string();
                let cleaned = cleaned.strip_suffix('-').unwrap_or(&cleaned).to_lowercase();
                // The JS removes one leading and one trailing hyphen only.
                let suggestion = format!("{}-{}", if cleaned.is_empty() { "my".to_string() } else { cleaned }, node.name.to_lowercase());
                report(
                    "duplicate_route",
                    at_provider,
                    at_source,
                    format!(
                        "The {} \"{}\" from {} and Astryx's own {} \"{}\" both have the route \"{}\", so `astryx docs {}` cannot open both. Fix: rename \"{}\" (its `name` and its file), such as `name: '{}'`{}.",
                        what(&node),
                        node.name,
                        node.provider,
                        what(taken),
                        taken.name,
                        node.route,
                        node.route,
                        node.name,
                        suggestion,
                        if node.route.contains('/') { ", or place it elsewhere" } else { "" }
                    ),
                    None,
                );
                return false;
            }
            let msg = format!("{} and {} both have the route \"{}\". Rename or move one of them.", label(&node), label(taken), node.route);
            report("duplicate_route", at_provider, at_source, msg, None);
            return false;
        }
        nodes.push(node);
        let i = nodes.len() - 1;
        by_route.insert(nodes[i].route.clone(), i);
        by_folded.insert(folded, i);
        true
    };

    let mut parents_first: Vec<&(String, NamespaceInput)> = declared.iter().collect();
    parents_first.sort_by_key(|(k, _)| route_of.get(k).cloned().flatten().unwrap_or_default().split('/').count());
    for (key, input) in parents_first {
        let Some(route) = route_of.get(key).cloned().flatten() else { continue };
        let home = parent_of.get(key).cloned().flatten();
        if let Some((pk, _, _)) = &home {
            if route_of.get(pk).cloned().flatten().is_none() {
                route_of.insert(key.clone(), None);
                report(
                    "invalid_placement",
                    &input.provider,
                    &input.source,
                    format!("Namespace \"{}\" has no route: the namespace it is placed in was withdrawn.", s(&input.doc, "name")),
                    Some("placement"),
                );
                continue;
            }
        }
        let parent_route = home.as_ref().and_then(|(pk, _, _)| route_of.get(pk).cloned().flatten());
        let slots = input
            .doc
            .get("slots")
            .and_then(|x| x.as_object())
            .map(|o| o.iter().map(|(n, sl)| Slot { name: n.clone(), title: sl.get("title").cloned().unwrap_or(Value::Null), children: vec![] }).collect())
            .unwrap_or_default();
        let node = TreeNode {
            id: Some(create_doc_id(&input.provider_id, "namespace", &s(&input.doc, "name"))),
            route,
            kind: "namespace".into(),
            provider: input.provider.clone(),
            provider_id: input.provider_id.clone(),
            name: s(&input.doc, "name"),
            title: s(&input.doc, "title"),
            summary: s(&input.doc, "summary"),
            parent: parent_route,
            slot: home.as_ref().map(|h| h.1.clone()),
            order: home.as_ref().and_then(|h| h.2),
            generated: false,
            flat_topic: None,
            topic_file: None,
            self_doc: Some(input.doc.clone()),
            slots,
            source: input.source.clone(),
            guide_overlay: None,
        };
        if !add_node(node, &input.provider, &input.source, &mut nodes, &mut report) {
            route_of.insert(key.clone(), None);
        }
    }

    let mut sorted_docs: Vec<&DocInput> = docs.iter().collect();
    sorted_docs.sort_by(|a, b| a.rank.cmp(&b.rank).then(a.provider.cmp(&b.provider)).then(a.kind.cmp(&b.kind)).then(a.name.cmp(&b.name)).then(a.source.cmp(&b.source)));
    for doc in sorted_docs {
        let mut home: Option<(String, String, Option<f64>)> = None;
        if let Some(p) = doc.placement.as_ref().filter(|p| !p.is_null()) {
            match check_placement(p, &doc.kind, &doc.provider, &declared) {
                Err(e) => {
                    report("invalid_placement", &doc.provider, &doc.source, e, Some("placement"));
                    continue;
                }
                Ok((key, slot)) => match route_of.get(&key).cloned().flatten() {
                    None => {
                        report("invalid_placement", &doc.provider, &doc.source, format!("placement.parent \"{}\" names a namespace that has no route.", s(p, "parent")), Some("placement"));
                        continue;
                    }
                    Some(pr) => home = Some((pr, slot, p.get("order").and_then(|o| o.as_f64()))),
                },
            }
        } else if let Some(group) = &doc.group {
            // adoptionsFor
            let mut matches: Vec<(&String, &NamespaceInput, &Value)> = Vec::new();
            for (key, ns) in &declared {
                if route_of.get(key).cloned().flatten().is_none() {
                    continue;
                }
                for rule in ns.doc.get("adopts").and_then(|a| a.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
                    let src = rule.get("source").cloned().unwrap_or(Value::Null);
                    if src.get("group").and_then(|g| g.as_str()) != Some(group.as_str()) {
                        continue;
                    }
                    let shared = src.get("packages").and_then(|p| p.as_str()) == Some("all") && ns.provider == CLI_PROVIDER && ns.doc.get("stability").and_then(|x| x.as_str()) == Some("experimental");
                    if ns.provider != doc.provider && !shared {
                        continue;
                    }
                    if let Some(kinds) = src.get("kinds").and_then(|k| k.as_array()) {
                        if !kinds.iter().any(|k| k.as_str() == Some(doc.kind.as_str())) {
                            continue;
                        }
                    }
                    matches.push((key, ns, rule));
                }
            }
            if matches.len() > 1 {
                let names: Vec<String> = matches.iter().map(|m| format!("\"{}\"", s(&m.1.doc, "name"))).collect();
                report("overlapping_adoption", &doc.provider, &doc.source, format!("{}/{}/{} is adopted by {}; exactly one namespace may adopt a doc.", doc.provider, doc.kind, doc.name, names.join(" and ")), None);
                continue;
            }
            if let Some((key, ns, rule)) = matches.first() {
                let ns_route = route_of.get(*key).cloned().flatten().unwrap();
                let into = s(rule, "into");
                if rule.get("groupBy").and_then(|g| g.as_str()) == Some("kind") {
                    let (segment, title, summary) = match KIND_GROUPS.iter().find(|g| g.0 == doc.kind) {
                        Some(g) => (g.1.to_string(), g.2.to_string(), g.3.to_string()),
                        None => (format!("{}s", route_segment(&doc.kind)), doc.kind.clone(), format!("Every {} doc.", doc.kind)),
                    };
                    let group_route = format!("{ns_route}/{segment}");
                    if !by_route_has(&nodes, &group_route) {
                        let kinds: Vec<String> = rule.get("source").and_then(|s| s.get("kinds")).and_then(|k| k.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
                        let order = kinds.iter().position(|k| *k == doc.kind).map(|i| i as f64);
                        let node = TreeNode {
                            id: None,
                            route: group_route.clone(),
                            kind: "namespace".into(),
                            provider: ns.provider.clone(),
                            provider_id: ns.provider_id.clone(),
                            name: segment.clone(),
                            title: title.clone(),
                            summary,
                            parent: Some(ns_route.clone()),
                            slot: Some(into.clone()),
                            order,
                            generated: true,
                            flat_topic: None,
                            topic_file: None,
                            self_doc: None,
                            slots: vec![Slot { name: "items".into(), title: Value::from(title), children: vec![] }],
                            source: ns.source.clone(),
                            guide_overlay: None,
                        };
                        let (p, so) = (ns.provider.clone(), ns.source.clone());
                        add_node(node, &p, &so, &mut nodes, &mut report);
                    }
                    let generated = nodes.iter().find(|n| n.route == group_route).map(|n| n.generated).unwrap_or(false);
                    if !generated {
                        continue;
                    }
                    home = Some((group_route, "items".into(), None));
                } else {
                    home = Some((ns_route, into, None));
                }
            }
        }
        let Some((parent_route, slot, order)) = home else { continue };
        let segment = route_segment(&doc.name);
        if segment.is_empty() {
            report("invalid_placement", &doc.provider, &doc.source, format!("{}/{}/{} has no route segment: its name holds no letters or digits.", doc.provider, doc.kind, doc.name), Some("name"));
            continue;
        }
        let node = TreeNode {
            id: Some(create_doc_id(&doc.provider_id, &doc.kind, &doc.name)),
            route: format!("{parent_route}/{segment}"),
            kind: doc.kind.clone(),
            provider: doc.provider.clone(),
            provider_id: doc.provider_id.clone(),
            name: doc.name.clone(),
            title: doc.title.clone(),
            summary: doc.summary.clone(),
            parent: Some(parent_route),
            slot: Some(slot),
            order,
            generated: false,
            flat_topic: None,
            topic_file: doc.topic_file.clone(),
            self_doc: doc.self_doc.clone(),
            slots: vec![],
            source: doc.source.clone(),
            guide_overlay: None,
        };
        add_node(node, &doc.provider, &doc.source, &mut nodes, &mut report);
    }

    for (route, title, summary) in TOPIC_LEVELS {
        let members: Vec<&TopicInput> = topics.iter().filter(|t| topic_level(t.category.as_deref()) == *route).collect();
        if members.is_empty() {
            continue;
        }
        let home = TreeNode {
            id: None,
            route: route.to_string(),
            kind: "namespace".into(),
            provider: CLI_PROVIDER.into(),
            provider_id: CLI_PROVIDER_ID.into(),
            name: route.to_string(),
            title: title.to_string(),
            summary: summary.to_string(),
            parent: None,
            slot: None,
            order: None,
            generated: true,
            flat_topic: None,
            topic_file: None,
            self_doc: None,
            slots: vec![Slot { name: "topics".into(), title: Value::from("Topics"), children: vec![] }],
            source: "generated".into(),
            guide_overlay: None,
        };
        if !add_node(home, CLI_PROVIDER, "generated", &mut nodes, &mut report) {
            continue;
        }
        for (i, t) in members.iter().enumerate() {
            let node = TreeNode {
                id: Some(create_doc_id(&t.provider_id, "generic", &t.name)),
                route: t.name.clone(),
                kind: "generic".into(),
                provider: t.provider.clone(),
                provider_id: t.provider_id.clone(),
                name: t.name.clone(),
                title: t.title.clone(),
                summary: t.summary.clone(),
                parent: Some(route.to_string()),
                slot: Some("topics".into()),
                order: Some(i as f64),
                generated: false,
                flat_topic: Some(t.name.clone()),
                topic_file: None,
                self_doc: None,
                slots: vec![],
                source: t.source.clone(),
                guide_overlay: None,
            };
            add_node(node, &t.provider, &t.source, &mut nodes, &mut report);
        }
    }
    drop(add_node);

    // Link children into their parents' slots, in insertion order.
    let links: Vec<(String, String, String)> = nodes.iter().filter_map(|n| n.parent.clone().map(|p| (p, n.slot.clone().unwrap_or_default(), n.route.clone()))).collect();
    for (p, slot, route) in links {
        if let Some(&pi) = by_route.get(&p) {
            if let Some(sl) = nodes[pi].slots.iter_mut().find(|s| s.name == slot) {
                sl.children.push(route);
            }
        }
    }
    let info: HashMap<String, (Option<f64>, String, String)> = nodes.iter().map(|n| (n.route.clone(), (n.order, n.title.to_lowercase(), n.id.clone().unwrap_or_else(|| n.route.clone())))).collect();
    for n in nodes.iter_mut() {
        for sl in n.slots.iter_mut() {
            sl.children.sort_by(|a, b| {
                let x = &info[a];
                let y = &info[b];
                let xo = x.0.unwrap_or(f64::INFINITY);
                let yo = y.0.unwrap_or(f64::INFINITY);
                // Infinity - Infinity is NaN, which the comparator treats as 0.
                let d = xo - yo;
                let ord = if d.is_nan() || d == 0.0 {
                    std::cmp::Ordering::Equal
                } else if d < 0.0 {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Greater
                };
                ord.then_with(|| x.1.cmp(&y.1)).then_with(|| x.2.cmp(&y.2))
            });
        }
    }
    for t in topics {
        if t.provider == CLI_PROVIDER {
            continue;
        }
        for alias in &t.aliases {
            if let Some(&hi) = by_folded.get(&alias.to_lowercase()) {
                if nodes[hi].provider == CLI_PROVIDER {
                    report(
                        "duplicate_route",
                        &t.provider,
                        &t.source,
                        format!("The topic \"{}\" answers to \"{alias}\" through replaces, but the CLI's own docs keep that route, so `astryx docs {alias}` opens theirs. Drop that replacement.", t.name),
                        None,
                    );
                }
            }
        }
    }
    // Route order (UTF-16 code unit order equals byte order for these).
    let folded_routes: HashMap<String, String> = by_folded.iter().map(|(k, &i)| (k.clone(), nodes[i].route.clone())).collect();
    nodes.sort_by(|a, b| js_cmp(&a.route, &b.route));
    let by_route: HashMap<String, usize> = nodes.iter().enumerate().map(|(i, n)| (n.route.clone(), i)).collect();
    let by_folded: HashMap<String, usize> = folded_routes.into_iter().map(|(k, r)| (k, by_route[&r])).collect();
    drop(report);
    DocsTree { nodes, by_route, by_folded, diagnostics }
}

fn by_route_has(nodes: &[TreeNode], route: &str) -> bool {
    nodes.iter().any(|n| n.route == route)
}

/// JS `<` on strings: UTF-16 code units.
pub fn js_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

impl TreeNode {
    /// The node as the generator's model holds it, for the reads.
    pub fn to_model(&self, tree: &DocsTree, content: Option<Value>, related: Vec<String>) -> Value {
        let mut m = Map::new();
        m.insert("route".into(), Value::from(self.route.as_str()));
        m.insert("name".into(), Value::from(self.name.as_str()));
        m.insert("id".into(), self.id.clone().map(Value::from).unwrap_or(Value::Null));
        m.insert("kind".into(), Value::from(self.kind.as_str()));
        m.insert("title".into(), Value::from(self.title.as_str()));
        m.insert("summary".into(), Value::from(self.summary.as_str()));
        m.insert("parent".into(), self.parent.clone().map(Value::from).unwrap_or(Value::Null));
        m.insert("provider".into(), Value::from(self.provider.as_str()));
        m.insert("providerId".into(), Value::from(self.provider_id.as_str()));
        m.insert("generated".into(), Value::Bool(self.generated));
        m.insert("flatTopic".into(), self.flat_topic.clone().map(Value::from).unwrap_or(Value::Null));
        m.insert("topicFile".into(), Value::Bool(self.topic_file.is_some()));
        m.insert("selfDoc".into(), Value::Bool(self.self_doc.is_some()));
        m.insert("experimental".into(), Value::Bool(tree.is_experimental(self)));
        m.insert(
            "slots".into(),
            Value::Array(
                self.slots
                    .iter()
                    .map(|sl| {
                        let mut o = Map::new();
                        o.insert("name".into(), Value::from(sl.name.as_str()));
                        o.insert("title".into(), sl.title.clone());
                        o.insert("children".into(), Value::Array(sl.children.iter().map(|c| Value::from(c.as_str())).collect()));
                        Value::Object(o)
                    })
                    .collect(),
            ),
        );
        m.insert("related".into(), Value::Array(related.into_iter().map(Value::from).collect()));
        m.insert("content".into(), content.unwrap_or(Value::Null));
        Value::Object(m)
    }
}
