//! The docs read for a project whose integrations ship docs: the CLI's tree
//! inputs from the model plus the integrations' own, built again at run time,
//! and each integration topic lowered and linked as the JS doc compiler does.
//!
//! TEMP pieces until discovery's docs_discovery lands: the minimal
//! `discoverIntegrationDocs` below; `extends` and `replaces` of another topic;
//! links to authoring, component and template docs; typed-doc inclusion in
//! reference blocks; an integration namespace's own `blocks`.

use super::model::{cli_tree_inputs, Variant};
use crate::discovery::doc_compiler::compile::{index_view, lower_topic, section_view, Lowered, RefTarget, TopicSource};
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

struct Finder<'a> {
    tree: &'a DocsTree,
    topics: &'a [Value],
}

impl Finder<'_> {
    /// `catalog.resolve(name)`: a topic by its name, or a name it took over.
    fn resolve_topic(&self, name: &str) -> Option<&Value> {
        let wanted = name.to_lowercase();
        self.topics.iter().find(|t| s(t, "name").to_lowercase() == wanted).or_else(|| {
            self.topics.iter().find(|t| t["aliases"].as_array().map(|a| a.iter().any(|x| x.as_str() == Some(wanted.as_str()))).unwrap_or(false))
        })
    }

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
            if let Some(t) = self.resolve_topic(&parsed.name) {
                let tp = t.get("providerId").and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| s(t, "package"));
                let aliased = t["aliases"].as_array().map(|a| a.iter().any(|x| x.as_str() == Some(wanted.as_str()))).unwrap_or(false)
                    || t["replaces"].as_str().map(|r| r.to_lowercase() == wanted).unwrap_or(false);
                if normalize_provider_id(&tp).as_deref() == Some(provider.as_str()) || aliased {
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


// ─── The project's docs, built at run time ─────────────────────────────────

use crate::discovery::docs_discovery::{project_docs, DocsCatalog, TopicEntry};

const CLI: &str = crate::discovery::doc_compiler::tree::CLI_PROVIDER;

fn integrated(c: &DocsCatalog) -> bool {
    c.entries().iter().any(|e| e.package != CLI || !e.extensions.is_empty() || e.replaces.is_some()) || !c.tree_inputs.is_empty() || !c.issues.is_empty() || !c.guide_targeters.is_empty()
}

/// The project's docs catalog, when its integrations change anything.
pub fn discover(cwd: &str) -> Option<DocsCatalog> {
    let project = crate::discovery::project::Project::load(cwd).ok()?;
    let catalog = project_docs(&project);
    integrated(&catalog).then_some(catalog)
}

fn plain_doc(v: Option<Value>) -> Option<Value> {
    v.and_then(|d| json_plain(&d))
}

fn load(path: &str, lang: &str) -> (Option<Value>, Option<Value>) {
    let f = crate::discovery::doc_read::load_topic_file(path, if lang == "en" { None } else { Some(lang) });
    (plain_doc(f.doc), plain_doc(f.overlay))
}

pub struct Built {
    pub tree: DocsTree,
    pub nodes: Vec<Value>,
    pub topics: Vec<Value>,
    pub reads: HashMap<String, Value>,
    pub issues: Vec<(String, String)>,
}

fn tree_input_namespace(m: &Map<String, Value>) -> NamespaceInput {
    let v = Value::Object(m.clone());
    NamespaceInput { provider: s(&v, "provider"), provider_id: s(&v, "providerId"), source: s(&v, "source"), doc: v["doc"].clone(), rank: v["rank"].as_i64().unwrap_or(0) }
}

fn tree_input_doc(m: &Map<String, Value>) -> DocInput {
    let v = Value::Object(m.clone());
    DocInput {
        provider: s(&v, "provider"),
        provider_id: s(&v, "providerId"),
        source: s(&v, "source"),
        kind: s(&v, "kind"),
        name: s(&v, "name"),
        title: s(&v, "title"),
        summary: s(&v, "summary"),
        group: v["group"].as_str().map(String::from),
        placement: if v["placement"].is_null() { None } else { Some(v["placement"].clone()) },
        topic_file: v["ref"]["topicFile"].as_str().map(String::from),
        self_doc: None,
        rank: v["rank"].as_i64().unwrap_or(0),
    }
}

/// A topic a read opens at run time: its files and who wrote each.
struct Unit {
    key: String,
    name: String,
    package: String,
    provider_id: String,
    path: String,
    extensions: Vec<(String, String, String)>,
    is_guide: bool,
    replaces: Option<String>,
    replaced_package: Option<String>,
}

fn pure_cli(e: &TopicEntry) -> bool {
    e.package == CLI && e.extensions.is_empty() && e.replaces.is_none()
}

/// Build the project's docs from the model and the catalog.
pub fn build(variant: &Variant, catalog: DocsCatalog) -> Built {
    let model_nodes = variant.nodes();
    let model_topics = variant.topics();
    let model_by_route: HashMap<String, &Value> = model_nodes.iter().map(|n| (s(n, "route"), n)).collect();
    let (mut ns, mut docs, _) = cli_inputs(&cli_tree_inputs(), &model_nodes);
    for inputs in &catalog.tree_inputs {
        ns.extend(inputs.namespaces.iter().map(tree_input_namespace));
        docs.extend(inputs.guides.iter().map(tree_input_doc));
    }
    let mut topics = Vec::new();
    let mut topic_inputs = Vec::new();
    for e in catalog.entries() {
        let aliases = catalog.aliases_of(e);
        let model_topic = model_topics.iter().find(|t| s(t, "name") == e.name);
        let model_node = model_by_route.get(&e.name).filter(|n| n["flatTopic"].as_str() == Some(e.name.as_str()));
        let mut t = Map::new();
        t.insert("name".into(), Value::from(e.name.as_str()));
        t.insert("package".into(), Value::from(e.package.as_str()));
        t.insert("providerId".into(), e.provider_id.clone().map(Value::from).unwrap_or(Value::Null));
        let (title, description, category) = if e.package == CLI && e.replaces.is_none() {
            let n = model_node.copied();
            (
                n.map(|n| s(n, "title")).unwrap_or_else(|| e.name.clone()),
                model_topic.map(|t| s(t, "description")).unwrap_or_default(),
                n.and_then(|n| if n["parent"] == "foundations" { Some("foundations".to_string()) } else { None }),
            )
        } else {
            let file = load(&e.path, "en").0;
            let pick = |v: &Option<Value>, k: &str| v.as_ref().and_then(|d| d.get(k)).and_then(|x| x.as_str()).map(String::from);
            (
                e.title.as_ref().and_then(|x| x.as_str()).map(String::from).or_else(|| pick(&file, "title")).unwrap_or_else(|| e.name.clone()),
                e.description.as_ref().and_then(|x| x.as_str()).map(String::from).or_else(|| pick(&file, "description")).unwrap_or_default(),
                e.category.as_ref().and_then(|x| x.as_str()).map(String::from).or_else(|| pick(&file, "category")),
            )
        };
        t.insert("title".into(), Value::from(title.as_str()));
        t.insert("description".into(), Value::from(description.as_str()));
        t.insert("aliases".into(), Value::Array(aliases.iter().map(|a| Value::from(a.as_str())).collect()));
        if let Some(r) = &e.replaces {
            t.insert("replaces".into(), Value::from(r.as_str()));
            if let Some(p) = &e.replaced_package {
                t.insert("replacedPackage".into(), Value::from(p.as_str()));
            }
        }
        t.insert("pure".into(), Value::Bool(pure_cli(e)));
        topics.push(Value::Object(t));
        topic_inputs.push(TopicInput {
            provider: e.package.clone(),
            provider_id: e.provider_id.clone().unwrap_or_else(|| e.package.clone()),
            name: e.name.clone(),
            title,
            summary: description,
            category,
            source: format!("{}:{}", e.package, e.name),
            aliases,
        });
    }
    let mut tree = build_docs_tree(&ns, &docs, &topic_inputs);
    // Summaries: the CLI's as the model rendered them; the rest rendered here.
    let finder_topics = topics.clone();
    let rendered: Vec<(String, String)> = {
        let finder = Finder { tree: &tree, topics: &finder_topics };
        tree.nodes
            .iter()
            .map(|n| {
                let model = model_by_route.get(&n.route).filter(|m| n.provider == CLI && s(m, "provider") == CLI && (n.flat_topic.is_none() || finder_topics.iter().any(|t| s(t, "name") == n.route && t["pure"] == true)));
                match model {
                    Some(m) => (n.route.clone(), s(m, "summary")),
                    None => {
                        let pid = n.provider_id.clone();
                        let mut find = |t: &str| finder.find(t, &pid).ok();
                        (n.route.clone(), resolve_inline(&n.summary, &mut find))
                    }
                }
            })
            .collect()
    };
    for (route, summary) in rendered {
        if let Some(n) = tree.get_mut(&route) {
            n.summary = summary;
        }
    }
    {
        let finder = Finder { tree: &tree, topics: &finder_topics };
        for t in topics.iter_mut() {
            if t["pure"] == true {
                continue;
            }
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
            let m = model_by_route.get(&n.route).filter(|m| n.provider == CLI && s(m, "provider") == CLI);
            let content = m.map(|m| m["content"].clone()).filter(|c| !c.is_null());
            let content = content.or_else(|| if n.self_doc.is_some() { Some(Value::Array(vec![])) } else { None });
            let related = m.and_then(|m| m["related"].as_array().cloned()).unwrap_or_default().into_iter().filter_map(|r| r.as_str().map(String::from)).collect();
            n.to_model(&tree, content, related)
        })
        .collect();

    // Topic reads built here: every topic an integration wrote, replaced or
    // extended, and every guide an integration placed.
    let mut units = Vec::new();
    for e in catalog.entries() {
        if pure_cli(e) {
            continue;
        }
        units.push(Unit {
            key: format!("topic:{}", e.name),
            name: e.name.clone(),
            package: e.package.clone(),
            provider_id: e.provider_id.clone().unwrap_or_else(|| e.package.clone()),
            path: e.path.clone(),
            extensions: e.extensions.iter().map(|x| (x.package.clone(), x.provider_id.clone().unwrap_or_else(|| x.package.clone()), x.path.clone())).collect(),
            is_guide: false,
            replaces: e.replaces.clone(),
            replaced_package: e.replaced_package.clone(),
        });
    }
    for n in &tree.nodes {
        if n.kind != "generic" || n.provider == CLI {
            continue;
        }
        let Some(file) = &n.topic_file else { continue };
        units.push(Unit {
            key: format!("guide:{}", n.route),
            name: n.route.clone(),
            package: n.provider.clone(),
            provider_id: n.provider_id.clone(),
            path: file.clone(),
            extensions: vec![],
            is_guide: true,
            replaces: None,
            replaced_package: None,
        });
    }
    let mut reads = HashMap::new();
    let finder = Finder { tree: &tree, topics: &finder_topics };
    for u in &units {
        let links = if u.is_guide {
            place_links(&tree, &u.name)
        } else {
            match tree.get(&u.name).filter(|n| n.flat_topic.as_deref() == Some(u.name.as_str())) {
                Some(_) => place_links(&tree, &u.name),
                None => serde_json::json!({"up": "astryx docs"}),
            }
        };
        let mut packages: Vec<(String, String)> = vec![(normalize_provider_id(&u.provider_id).unwrap_or_else(|| u.provider_id.clone()), u.package.clone())];
        for (pkg, pid, _) in &u.extensions {
            packages.push((normalize_provider_id(pid).unwrap_or_else(|| pid.clone()), pkg.clone()));
        }
        for lang in ["en", "dense", "zh"] {
            let (doc, overlay) = load(&u.path, lang);
            let Some(doc) = doc else { continue };
            let base = TopicSource { provider_id: u.provider_id.clone(), doc, overlay };
            let exts: Vec<TopicSource> = u
                .extensions
                .iter()
                .filter_map(|(_, pid, path)| {
                    let (d, o) = load(path, lang);
                    d.map(|d| TopicSource { provider_id: pid.clone(), doc: d, overlay: o })
                })
                .collect();
            let Ok(lowered) = lower_topic(&u.name, &base, &exts) else { continue };
            let package_of = |id: &str| -> String {
                let p = lowered.section_providers.get(id).and_then(|x| x.as_str()).and_then(normalize_provider_id);
                p.and_then(|p| packages.iter().rev().find(|(k, _)| *k == p).map(|(_, v)| v.clone())).unwrap_or_else(|| u.package.clone())
            };
            let read = topic_read(&finder, variant, &lowered, u, &package_of, links.clone(), lang);
            reads.insert(format!("{}:{lang}", u.key), read);
        }
    }
    drop(finder);
    Built { tree, nodes, topics, reads, issues: catalog.issues.clone() }
}

fn topic_read(finder: &Finder, variant: &Variant, lowered: &Lowered, u: &Unit, package_of: &dyn Fn(&str) -> String, links: Value, lang: &str) -> Value {
    // Link each section's blocks against the provider that wrote it, and the
    // topic's own text fields against the topic's.
    let mut sections = Vec::new();
    for sec in lowered.doc["sections"].as_array().cloned().unwrap_or_default() {
        let id = s(&sec, "id");
        let pid = lowered.section_providers.get(&id).and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| u.provider_id.clone());
        let mut resolve = |t: &str| finder.find(t, &pid);
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
    let mut resolve = |t: &str| finder.find(t, &u.provider_id);
    let (linked_fields, _) = link_fields(&Value::Object(fields), &mut resolve);
    let mut doc = lowered.doc.as_object().cloned().unwrap_or_default();
    for (k, v) in linked_fields.as_object().cloned().unwrap_or_default() {
        doc.insert(k, v);
    }
    doc.insert("sections".into(), Value::Array(sections.clone()));
    let node = Lowered { id: lowered.id.clone(), doc: Value::Object(doc.clone()), source_titles: lowered.source_titles.clone(), section_providers: lowered.section_providers.clone() };
    let mut lower_target = |topic: &str| ref_target(variant, topic, lang, finder);
    let views: Vec<Value> = sections.iter().map(|sec| section_view(&node, sec, &mut lower_target)).collect();
    let mut detail = doc.clone();
    let detail_sections: Vec<Value> = views
        .iter()
        .map(|v| {
            let mut m = Map::new();
            m.insert("id".into(), v.get("id").cloned().unwrap_or(Value::Null));
            m.insert("title".into(), v.get("title").cloned().unwrap_or(Value::Null));
            m.insert("package".into(), Value::from(package_of(&s(v, "id"))));
            for (k, x) in v.as_object().cloned().unwrap_or_default() {
                if k != "id" && k != "title" {
                    m.insert(k, x);
                }
            }
            Value::Object(m)
        })
        .collect();
    detail.insert("sections".into(), Value::Array(detail_sections));
    if u.is_guide {
        detail.insert("name".into(), Value::from(u.name.as_str()));
    }
    if let Some(r) = &u.replaces {
        detail.insert("replaces".into(), Value::from(r.as_str()));
        if let Some(p) = &u.replaced_package {
            detail.insert("replacedPackage".into(), Value::from(p.as_str()));
        }
    }
    detail.insert("links".into(), links.clone());
    let mut index = index_view(&node.doc).as_object().cloned().unwrap_or_default();
    if u.is_guide {
        index.insert("name".into(), Value::from(u.name.as_str()));
    }
    if let Some(r) = &u.replaces {
        index.insert("replaces".into(), Value::from(r.as_str()));
        if let Some(p) = &u.replaced_package {
            index.insert("replacedPackage".into(), Value::from(p.as_str()));
        }
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
            m.insert("package".into(), Value::from(package_of(&s(&sec, "id"))));
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
            m.insert("package".into(), Value::from(package_of(&id)));
            m.insert("detailAt".into(), Value::from(i));
            Value::Object(m)
        })
        .collect();
    let mut read = Map::new();
    read.insert("package".into(), Value::from(u.package.as_str()));
    read.insert("detail".into(), Value::Object(detail));
    read.insert("index".into(), Value::Object(index));
    read.insert("reader".into(), Value::Array(reader));
    read.insert("childSections".into(), Value::Array(views));
    Value::Object(read)
}

/// `referenceTargets(catalog, lang)` as far as this port goes: a topic of the
/// catalog, lowered for the same language.
fn ref_target(variant: &Variant, topic: &str, lang: &str, finder: &Finder) -> Option<RefTarget> {
    let t = finder.resolve_topic(topic)?;
    let name = s(t, "name");
    let read = variant.read(&format!("topic:{name}:{lang}"))?;
    let mut source_titles = Map::new();
    for r in read["reader"].as_array().cloned().unwrap_or_default() {
        source_titles.insert(s(&r, "key"), r["sourceTitle"].clone());
    }
    Some(RefTarget { id: name, sections: read["childSections"].as_array().cloned().unwrap_or_default(), source_titles })
}

/// How a doc's `{@link}` targets resolve in a project (`linkResolver`): the
/// docs tree's docs by identity, and flat topics. For other commands that
/// render doc text, such as `component`.
pub struct LinkResolver {
    tree: DocsTree,
    topics: Vec<Value>,
}

impl LinkResolver {
    /// The link a target names, or the problem with it, as written in a doc
    /// of `from_provider`.
    pub fn resolve(&self, target: &str, from_provider: &str) -> Result<Value, String> {
        Finder { tree: &self.tree, topics: &self.topics }.find(target, from_provider)
    }
}

/// The project's link resolver.
pub fn link_resolver(cwd: &str) -> LinkResolver {
    let pm = crate::discovery::package_manager::doc_package_manager(Some(cwd));
    crate::discovery::doc_compiler::links::set_doc_pm(&pm);
    let variant = Variant::get(&pm);
    let catalog = discover(cwd).unwrap_or_else(DocsCatalog::from_builtins);
    let built = build(&variant, catalog);
    LinkResolver { tree: built.tree, topics: built.topics }
}
