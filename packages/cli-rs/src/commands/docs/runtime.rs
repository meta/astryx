//! The docs read for a project whose integrations ship docs: the CLI's tree
//! inputs from the model plus the integrations' own, built again at run time,
//! and each integration topic lowered and linked as the JS doc compiler does.
//!
//! TEMP pieces until discovery's docs_discovery lands: the minimal
//! `discoverIntegrationDocs` below; `extends` and `replaces` of another topic;
//! links to authoring, component and template docs; typed-doc inclusion in
//! reference blocks; an integration namespace's own `blocks`.

use super::model::{cli_tree_inputs, Variant};
use crate::discovery::doc_compiler::compile::{index_view, lower_reference_topic, section_view, Lowered, RefTarget};
use crate::discovery::doc_compiler::links::{link_blocks, link_fields, parse_link_target, resolve_inline};
use crate::discovery::doc_compiler::tree::{build_docs_tree, normalize_provider_id, DocInput, DocsTree, NamespaceInput, TopicInput};
use crate::json::{Map, Value};
use std::collections::HashMap;

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

/// The CLI's own tree inputs, and its flat topics as the model's tree holds
/// them.
pub fn cli_inputs(inputs: &Value, model_nodes: &[Value]) -> (Vec<NamespaceInput>, Vec<DocInput>, Vec<TopicInput>) {
    let ns = inputs["namespaces"]
        .as_array()
        .map(|a| a.iter().map(|n| NamespaceInput { provider: s(n, "provider"), provider_id: s(n, "providerId"), source: s(n, "source"), doc: n["doc"].clone(), rank: 0 }).collect())
        .unwrap_or_default();
    let docs = inputs["docs"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|d| {
                    let topic_file = d["topicFile"].as_str().map(String::from);
                    let self_doc = if topic_file.is_none() {
                        let mut m = Map::new();
                        if let Some(st) = d["stability"].as_str() {
                            m.insert("stability".into(), Value::from(st));
                        }
                        Some(Value::Object(m))
                    } else {
                        None
                    };
                    DocInput {
                        provider: s(d, "provider"),
                        provider_id: s(d, "providerId"),
                        source: s(d, "source"),
                        kind: s(d, "kind"),
                        name: s(d, "name"),
                        title: s(d, "title"),
                        summary: s(d, "summary"),
                        group: d["group"].as_str().map(String::from),
                        placement: if d["placement"].is_null() { None } else { Some(d["placement"].clone()) },
                        topic_file,
                        self_doc,
                        rank: 0,
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let topics = model_nodes
        .iter()
        .filter(|n| n["flatTopic"].is_string())
        .map(|n| TopicInput {
            provider: s(n, "provider"),
            provider_id: s(n, "providerId"),
            name: s(n, "name"),
            title: s(n, "title"),
            summary: s(n, "summary"),
            category: if n["parent"] == "foundations" { Some("foundations".into()) } else { None },
            source: format!("{}:{}", s(n, "provider"), s(n, "name")),
            aliases: vec![],
        })
        .collect();
    (ns, docs, topics)
}

/// `JSON.parse(JSON.stringify(v))` over a value from `crate::js`.
pub fn json_plain(v: &Value) -> Option<Value> {
    match v {
        Value::Object(m) => {
            if let Some(kind) = m.get("__js").and_then(|k| k.as_str()) {
                return match kind {
                    "function" | "undefined" | "symbol" => None,
                    "number" => Some(Value::Null),
                    "date" => Some(m.get("iso").cloned().unwrap_or(Value::Null)),
                    "circular" => None,
                    _ => Some(Value::Object(Map::new())),
                };
            }
            let mut out = Map::new();
            for (k, x) in m {
                if let Some(p) = json_plain(x) {
                    out.insert(k.clone(), p);
                }
            }
            Some(Value::Object(out))
        }
        Value::Array(a) => Some(Value::Array(a.iter().map(|x| json_plain(x).unwrap_or(Value::Null)).collect())),
        other => Some(other.clone()),
    }
}

/// One topic an integration contributes.
#[derive(Debug, Clone)]
pub struct TopicRecord {
    pub name: String,
    pub package: String,
    pub provider_id: String,
    pub path: String,
    pub doc: Value,
    pub category: Option<String>,
    pub replaces: Option<String>,
    pub extends: Option<String>,
}

/// One placed guide an integration contributes.
#[derive(Debug, Clone)]
pub struct GuideRecord {
    pub input: DocInput,
    pub doc: Value,
}

#[derive(Debug, Default)]
pub struct IntegrationDocs {
    pub records: Vec<TopicRecord>,
    pub namespaces: Vec<NamespaceInput>,
    pub guides: Vec<GuideRecord>,
    /// `(package, message)` for each package whose docs did not load.
    pub issues: Vec<(String, String)>,
}

impl IntegrationDocs {
    pub fn is_empty(&self) -> bool {
        self.records.is_empty() && self.namespaces.is_empty() && self.guides.is_empty() && self.issues.is_empty()
    }
}

const SUFFIXES: &[&str] = &[".doc.ts", ".doc.mjs", ".doc.js"];

fn scan(dir: &std::path::Path, out: &mut Vec<String>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = rd.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let name = e.file_name().to_string_lossy().to_string();
        if name == "node_modules" || name == "__tests__" {
            continue;
        }
        let p = e.path();
        if p.is_dir() {
            scan(&p, out);
        } else if SUFFIXES.iter().any(|sfx| name.ends_with(sfx)) {
            out.push(p.to_string_lossy().to_string());
        }
    }
}

fn load_topic_module(file: &str) -> Result<Value, String> {
    let ns = crate::discovery::docmod::import_doc_module(file).map_err(|e| e.message)?;
    let pick = |k: &str| ns.get(k).filter(|v| !crate::discovery::docmod::is_undefined(Some(v))).cloned();
    let raw = pick("docs").or_else(|| pick("default"));
    match raw {
        None => Err(format!("{} exports no doc. A topic exports `docs` (or a default export).", std::path::Path::new(file).file_name().unwrap().to_string_lossy())),
        Some(v) => Ok(v),
    }
}

fn is_topic_name(n: &str) -> bool {
    !n.is_empty() && n.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// TEMP: replace with discovery's `discoverIntegrationDocs(integration)`.
fn discover_one(name: &str, provider_id: &str, docs_dir: &str, out: &mut IntegrationDocs, rank: i64) {
    let dir = std::path::Path::new(docs_dir);
    if !dir.is_dir() {
        return;
    }
    let mut files = Vec::new();
    scan(dir, &mut files);
    files.sort();
    let mut errors: Vec<String> = Vec::new();
    let mut records = Vec::new();
    let mut namespaces = Vec::new();
    let mut guides = Vec::new();
    let mut seen: HashMap<String, String> = HashMap::new();
    for file in &files {
        let relative = file.strip_prefix(&format!("{docs_dir}/")).unwrap_or(file).to_string();
        let base = std::path::Path::new(file).file_name().unwrap().to_string_lossy().to_string();
        let doc = match load_topic_module(file).and_then(|raw| crate::discovery::doctypes::parse_readable_doc(&raw, &base)) {
            Ok(d) => json_plain(&d).unwrap_or(Value::Null),
            Err(e) => {
                errors.push(format!("{relative}: {e}"));
                continue;
            }
        };
        let source = format!("{name}/{relative}");
        if doc.get("type").and_then(|t| t.as_str()) == Some("namespace") {
            namespaces.push(NamespaceInput { provider: name.into(), provider_id: provider_id.into(), source, doc, rank });
            continue;
        }
        let topic_name = s(&doc, "name");
        if topic_name.is_empty() || s(&doc, "title").is_empty() || s(&doc, "description").is_empty() || !is_topic_name(&topic_name) {
            errors.push(format!("{relative} is not a usable topic"));
            continue;
        }
        let key = topic_name.to_lowercase();
        if let Some(prev) = seen.get(&key) {
            errors.push(format!(
                "{relative} and {prev} both define the topic \"{topic_name}\". Each topic name is a URL and a CLI argument, so they have to be unique."
            ));
            continue;
        }
        seen.insert(key, relative.clone());
        let placed = doc.get("placement").map(|p| !p.is_null()).unwrap_or(false);
        if placed {
            guides.push(GuideRecord {
                input: DocInput {
                    provider: name.into(),
                    provider_id: provider_id.into(),
                    source,
                    kind: "generic".into(),
                    name: topic_name.clone(),
                    title: s(&doc, "title"),
                    summary: s(&doc, "description"),
                    group: None,
                    placement: doc.get("placement").cloned(),
                    topic_file: Some(file.clone()),
                    self_doc: None,
                    rank,
                },
                doc,
            });
            continue;
        }
        records.push(TopicRecord {
            name: topic_name,
            package: name.into(),
            provider_id: provider_id.into(),
            path: file.clone(),
            category: doc.get("category").and_then(|c| c.as_str()).map(String::from),
            replaces: doc.get("replaces").and_then(|c| c.as_str()).map(String::from),
            extends: doc.get("extends").and_then(|c| c.as_str()).map(String::from),
            doc,
        });
    }
    if !errors.is_empty() {
        for e in errors {
            out.issues.push((name.to_string(), e));
        }
        return;
    }
    out.records.extend(records);
    out.namespaces.extend(namespaces);
    out.guides.extend(guides);
}

/// The docs the project's integrations contribute.
pub fn discover(cwd: &str) -> IntegrationDocs {
    let mut out = IntegrationDocs::default();
    let Ok(project) = crate::discovery::project::Project::load(cwd) else { return out };
    let mut rank = 0;
    for r in project.contributing() {
        rank += 1;
        let Some(docs_dir) = r.get("docs").and_then(|d| d.as_str()) else { continue };
        let name = r.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
        let provider_id = r.get("providerId").and_then(|n| n.as_str()).map(String::from).unwrap_or_else(|| name.clone());
        discover_one(&name, &provider_id, docs_dir, &mut out, rank);
    }
    out
}

fn overlay_path(path: &str, lang: &str) -> String {
    let p = std::path::Path::new(path);
    let base = p.file_name().unwrap().to_string_lossy();
    let stem = base.strip_suffix(".doc.mjs").unwrap_or(&base);
    p.with_file_name(format!("{stem}.doc.{lang}.mjs")).to_string_lossy().to_string()
}

fn load_overlay(path: &str, lang: &str) -> Option<Value> {
    if lang == "en" {
        return None;
    }
    let op = overlay_path(path, lang);
    if !std::path::Path::new(&op).exists() {
        return None;
    }
    let ns = crate::discovery::docmod::import_doc_module(&op).ok()?;
    let pick = |k: &str| ns.get(k).filter(|v| !crate::discovery::docmod::is_undefined(Some(v)) && !v.is_null() && *v != &Value::Bool(false)).cloned();
    pick("docsZh").or_else(|| pick("docsDense")).and_then(|v| json_plain(&v))
}

// ─── The project's docs, built at run time ─────────────────────────────────

pub struct Built {
    pub nodes: Vec<Value>,
    pub topics: Vec<Value>,
    pub reads: HashMap<String, Value>,
    pub issues: Vec<(String, String)>,
}

struct Finder<'a> {
    tree: &'a DocsTree,
    topics: &'a [Value],
}

impl Finder<'_> {
    /// `docFinderOver(...)` as far as this port goes: a doc of the tree by
    /// its identity, or a flat topic.
    fn find(&self, target: &str, from_provider: &str) -> Result<Value, String> {
        let parsed = parse_link_target(target)?;
        let provider = match normalize_provider_id(parsed.provider.as_deref().unwrap_or(from_provider)) {
            Some(p) => p,
            None => {
                return Err(format!(
                    "\"{target}\" names \"{}\", which is not a provider id: an npm package name, or the `providerId` its manifest declares",
                    parsed.provider.unwrap_or_default()
                ))
            }
        };
        let fold = |n: &str| if parsed.kind == "generic" { n.to_lowercase() } else { n.to_string() };
        if let Some(node) = self.tree.nodes.iter().find(|n| {
            n.id.is_some() && n.kind == parsed.kind && fold(&n.name) == fold(&parsed.name) && normalize_provider_id(&n.provider_id).unwrap_or_else(|| n.provider_id.clone()) == provider
        }) {
            let mut l = Map::new();
            l.insert("target".into(), Value::from(target));
            l.insert("id".into(), Value::from(node.id.clone().unwrap()));
            l.insert("route".into(), Value::from(node.route.as_str()));
            l.insert("title".into(), Value::from(node.title.as_str()));
            l.insert("summary".into(), Value::from(node.summary.as_str()));
            l.insert("command".into(), Value::from(format!("astryx docs {}", node.route)));
            return Ok(Value::Object(l));
        }
        if parsed.kind == "generic" {
            let wanted = parsed.name.to_lowercase();
            if let Some(t) = self.topics.iter().find(|t| s(t, "name").to_lowercase() == wanted) {
                let tp = t.get("providerId").and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| s(t, "package"));
                if normalize_provider_id(&tp).as_deref() == Some(provider.as_str()) {
                    let mut l = Map::new();
                    l.insert("target".into(), Value::from(target));
                    l.insert("id".into(), Value::from(crate::discovery::doc_compiler::tree::create_doc_id(&provider, "generic", &parsed.name)));
                    l.insert("route".into(), Value::from(s(t, "name")));
                    l.insert("title".into(), t.get("title").cloned().unwrap_or(Value::from(s(t, "name"))));
                    l.insert("summary".into(), t.get("description").cloned().unwrap_or(Value::from("")));
                    l.insert("command".into(), Value::from(format!("astryx docs {}", s(t, "name"))));
                    return Ok(Value::Object(l));
                }
            }
        }
        let search_type = match parsed.kind.as_str() {
            "component" => "component",
            "page" | "block" => "template",
            _ => "doc",
        };
        Err(format!("\"{target}\" names no doc. Find it with `astryx search {} --type {search_type}`, then name it as `[<provider>:]<kind>:<name>`.", parsed.name))
    }
}

fn place_links(tree: &DocsTree, route: &str) -> Value {
    let Some(node) = tree.get(route) else { return Value::Null };
    let mut links = Map::new();
    links.insert("up".into(), Value::from(match &node.parent {
        None => "astryx docs".to_string(),
        Some(p) => format!("astryx docs {p}"),
    }));
    let experimental = tree.is_experimental(node);
    let siblings: Vec<String> = node
        .parent
        .as_deref()
        .and_then(|p| tree.get(p))
        .and_then(|p| p.slots.iter().find(|sl| sl.children.iter().any(|c| c == route)))
        .map(|sl| sl.children.clone())
        .unwrap_or_default()
        .into_iter()
        .filter(|r| tree.get(r).map(|n| tree.is_experimental(n) == experimental).unwrap_or(true))
        .collect();
    if let Some(at) = siblings.iter().position(|r| r == route) {
        if at > 0 {
            links.insert("previous".into(), Value::from(format!("astryx docs {}", siblings[at - 1])));
        }
        if at + 1 < siblings.len() {
            links.insert("next".into(), Value::from(format!("astryx docs {}", siblings[at + 1])));
        }
    }
    Value::Object(links)
}

/// Build the project's docs from the model and the integrations' docs.
pub fn build(variant: &Variant, found: IntegrationDocs) -> Built {
    let model_nodes = variant.nodes();
    let mut topics = variant.topics();
    let (mut ns, mut docs, mut topic_inputs) = cli_inputs(&cli_tree_inputs(), &model_nodes);
    ns.extend(found.namespaces.iter().cloned());
    docs.extend(found.guides.iter().map(|g| g.input.clone()));
    let mut issues = found.issues.clone();
    // Each record joins the catalog (TEMP: a new topic only).
    let mut added: Vec<&TopicRecord> = Vec::new();
    for r in &found.records {
        if r.replaces.is_some() || r.extends.is_some() {
            continue;
        }
        if let Some(existing) = topics.iter().find(|t| s(t, "name").to_lowercase() == r.name.to_lowercase()) {
            issues.push((
                r.package.clone(),
                format!("Topic \"{}\" is already provided by {}. Give it another name, or declare `replaces: '{}'` to take its place.", r.name, s(existing, "package"), r.name),
            ));
            continue;
        }
        let mut t = Map::new();
        t.insert("name".into(), Value::from(r.name.as_str()));
        t.insert("package".into(), Value::from(r.package.as_str()));
        t.insert("providerId".into(), if r.provider_id == r.package { Value::Null } else { Value::from(r.provider_id.as_str()) });
        t.insert("title".into(), r.doc.get("title").cloned().unwrap_or(Value::Null));
        t.insert("description".into(), r.doc.get("description").cloned().unwrap_or(Value::from("")));
        topics.push(Value::Object(t));
        topic_inputs.push(TopicInput {
            provider: r.package.clone(),
            provider_id: r.provider_id.clone(),
            name: r.name.clone(),
            title: s(&r.doc, "title"),
            summary: s(&r.doc, "description"),
            category: r.category.clone(),
            source: format!("{}:{}", r.package, r.name),
            aliases: vec![],
        });
        added.push(r);
    }
    // The flat topics read in catalog order: built-ins first, as the model
    // lists them, then each integration's.
    let mut tree = build_docs_tree(&ns, &docs, &topic_inputs);
    let model_by_route: HashMap<String, &Value> = model_nodes.iter().map(|n| (s(n, "route"), n)).collect();
    // Summaries: the CLI's as the model rendered them; the rest rendered here.
    let finder_topics = topics.clone();
    let summaries: Vec<(String, String)> = tree
        .nodes
        .iter()
        .map(|n| {
            let summary = match model_by_route.get(&n.route) {
                Some(m) if n.provider == crate::discovery::doc_compiler::tree::CLI_PROVIDER => s(m, "summary"),
                _ => n.summary.clone(),
            };
            (n.route.clone(), summary)
        })
        .collect();
    let rendered: Vec<(String, String)> = {
        let finder = Finder { tree: &tree, topics: &finder_topics };
        summaries
            .into_iter()
            .map(|(route, summary)| {
                let node = tree.get(&route).unwrap();
                if node.provider == crate::discovery::doc_compiler::tree::CLI_PROVIDER && model_by_route.contains_key(&route) {
                    return (route, summary);
                }
                let pid = node.provider_id.clone();
                let mut find = |t: &str| finder.find(t, &pid).ok();
                (route, resolve_inline(&summary, &mut find))
            })
            .collect()
    };
    for (route, summary) in rendered {
        if let Some(n) = tree.get_mut(&route) {
            n.summary = summary;
        }
    }
    // The topic list's descriptions, linked.
    {
        let finder = Finder { tree: &tree, topics: &finder_topics };
        for t in topics.iter_mut().skip(variant.topics().len()) {
            let pid = t.get("providerId").and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| s(t, "package"));
            let d = s(t, "description");
            let mut find = |x: &str| finder.find(x, &pid).ok();
            let linked = resolve_inline(&d, &mut find);
            t.as_object_mut().unwrap().insert("description".into(), Value::from(linked));
        }
    }
    let nodes: Vec<Value> = tree
        .nodes
        .iter()
        .map(|n| {
            let m = model_by_route.get(&n.route).filter(|_| n.provider == crate::discovery::doc_compiler::tree::CLI_PROVIDER);
            let content = m.map(|m| m["content"].clone()).filter(|c| !c.is_null());
            let content = content.or_else(|| if n.self_doc.is_some() { Some(Value::Array(vec![])) } else { None });
            let related = m.and_then(|m| m["related"].as_array().cloned()).unwrap_or_default().into_iter().filter_map(|r| r.as_str().map(String::from)).collect();
            n.to_model(&tree, content, related)
        })
        .collect();

    // Topic reads for each integration topic and guide.
    let mut reads = HashMap::new();
    let finder = Finder { tree: &tree, topics: &finder_topics };
    let mut units: Vec<(String, String, String, String, Value, String, bool)> = Vec::new();
    for r in &added {
        units.push((format!("topic:{}", r.name), r.name.clone(), r.package.clone(), r.provider_id.clone(), r.doc.clone(), r.path.clone(), false));
    }
    for g in &found.guides {
        let Some(node) = tree.nodes.iter().find(|n| n.topic_file.as_deref() == g.input.topic_file.as_deref() && n.provider == g.input.provider) else { continue };
        units.push((format!("guide:{}", node.route), node.route.clone(), g.input.provider.clone(), g.input.provider_id.clone(), g.doc.clone(), g.input.topic_file.clone().unwrap_or_default(), true));
    }
    for (key, name, package, provider_id, doc, path, is_guide) in units {
        let links = if is_guide {
            place_links(&tree, &name)
        } else {
            match tree.get(&name).filter(|n| n.flat_topic.as_deref() == Some(name.as_str())) {
                Some(_) => place_links(&tree, &name),
                None => serde_json::json!({"up": "astryx docs"}),
            }
        };
        for lang in ["en", "dense", "zh"] {
            let overlay = load_overlay(&path, lang);
            let lowered = lower_reference_topic(&name, &provider_id, &doc, overlay.as_ref());
            let read = topic_read(&finder, variant, &lowered, &name, &package, &provider_id, is_guide, links.clone(), lang, &added);
            reads.insert(format!("{key}:{lang}"), read);
        }
    }
    Built { nodes, topics, reads, issues }
}

#[allow(clippy::too_many_arguments)]
fn topic_read(finder: &Finder, variant: &Variant, lowered: &Lowered, name: &str, package: &str, provider_id: &str, is_guide: bool, links: Value, lang: &str, added: &[&TopicRecord]) -> Value {
    // Link each section's blocks and the topic's own text fields.
    let mut sections = Vec::new();
    for sec in lowered.doc["sections"].as_array().cloned().unwrap_or_default() {
        let mut resolve = |t: &str| finder.find(t, provider_id);
        let id = s(&sec, "id");
        let (content, _) = link_blocks(sec["content"].as_array().map(|a| a.as_slice()).unwrap_or(&[]), &mut resolve, Some(&id), None);
        let mut m = sec.as_object().cloned().unwrap_or_default();
        m.insert("content".into(), Value::Array(content));
        sections.push(Value::Object(m));
    }
    let mut fields = Map::new();
    if let Some(d) = lowered.doc.get("description").filter(|d| d.is_string()) {
        fields.insert("description".into(), d.clone());
    }
    if let Some(d) = lowered.doc.get("summary").filter(|d| d.is_string()) {
        fields.insert("summary".into(), d.clone());
    }
    let mut resolve = |t: &str| finder.find(t, provider_id);
    let (linked_fields, _) = link_fields(&Value::Object(fields), &mut resolve);
    let mut doc = lowered.doc.as_object().cloned().unwrap_or_default();
    for (k, v) in linked_fields.as_object().cloned().unwrap_or_default() {
        doc.insert(k, v);
    }
    doc.insert("sections".into(), Value::Array(sections.clone()));
    let node = Lowered { id: lowered.id.clone(), doc: Value::Object(doc.clone()), source_titles: lowered.source_titles.clone(), section_providers: lowered.section_providers.clone() };
    let mut lower_target = |topic: &str| ref_target(variant, topic, lang, added, finder);
    let views: Vec<Value> = sections.iter().map(|sec| section_view(&node, sec, &mut lower_target)).collect();
    let mut detail = doc.clone();
    detail.insert("sections".into(), Value::Array(vec![]));
    let detail_sections: Vec<Value> = views
        .iter()
        .map(|v| {
            let mut m = Map::new();
            m.insert("id".into(), v.get("id").cloned().unwrap_or(Value::Null));
            m.insert("title".into(), v.get("title").cloned().unwrap_or(Value::Null));
            m.insert("package".into(), Value::from(package));
            for (k, x) in v.as_object().cloned().unwrap_or_default() {
                if k != "id" && k != "title" {
                    m.insert(k, x);
                }
            }
            Value::Object(m)
        })
        .collect();
    detail.insert("sections".into(), Value::Array(detail_sections));
    if is_guide {
        detail.insert("name".into(), Value::from(name));
    }
    detail.insert("links".into(), links.clone());
    let mut index = index_view(&node.doc).as_object().cloned().unwrap_or_default();
    if is_guide {
        index.insert("name".into(), Value::from(name));
    }
    let isecs: Vec<Value> = index
        .get("sections")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|sec| {
            let mut m = Map::new();
            m.insert("id".into(), sec["id"].clone());
            m.insert("title".into(), sec["title"].clone());
            m.insert("package".into(), Value::from(package));
            m.insert("summary".into(), sec["summary"].clone());
            Value::Object(m)
        })
        .collect();
    index.insert("sections".into(), Value::Array(isecs));
    index.insert("links".into(), links);
    let reader: Vec<Value> = lowered.doc["sections"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(i, sec)| {
            let id = s(sec, "id");
            let mut m = Map::new();
            m.insert("key".into(), Value::from(id.as_str()));
            m.insert("title".into(), sec["title"].clone());
            m.insert("sourceTitle".into(), lowered.source_titles.get(&id).cloned().unwrap_or(sec["title"].clone()));
            m.insert("package".into(), Value::from(package));
            m.insert("detailAt".into(), Value::from(i));
            Value::Object(m)
        })
        .collect();
    let mut read = Map::new();
    read.insert("package".into(), Value::from(package));
    read.insert("detail".into(), Value::Object(detail));
    read.insert("index".into(), Value::Object(index));
    read.insert("reader".into(), Value::Array(reader));
    read.insert("childSections".into(), Value::Array(views));
    Value::Object(read)
}

/// `referenceTargets(catalog, lang)` as far as this port goes.
fn ref_target(variant: &Variant, topic: &str, lang: &str, added: &[&TopicRecord], finder: &Finder) -> Option<RefTarget> {
    let wanted = topic.to_lowercase();
    if let Some(r) = added.iter().find(|r| r.name.to_lowercase() == wanted) {
        let overlay = load_overlay(&r.path, lang);
        let l = lower_reference_topic(&r.name, &r.provider_id, &r.doc, overlay.as_ref());
        return Some(RefTarget { id: l.id.clone(), sections: l.doc["sections"].as_array().cloned().unwrap_or_default(), source_titles: l.source_titles });
    }
    let t = finder.topics.iter().find(|t| s(t, "name").to_lowercase() == wanted)?;
    let read = variant.read(&format!("topic:{}:{lang}", s(t, "name")))?;
    let mut source_titles = Map::new();
    for r in read["reader"].as_array().cloned().unwrap_or_default() {
        source_titles.insert(s(&r, "key"), r["sourceTitle"].clone());
    }
    Some(RefTarget { id: s(t, "name"), sections: read["childSections"].as_array().cloned().unwrap_or_default(), source_titles })
}
