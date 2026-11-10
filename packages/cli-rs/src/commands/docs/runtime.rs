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

/// What links can name beyond the tree and the topics: the CLI's authoring
/// self-docs and schema fields (from the model), the CLI's typed docs'
/// content, and the components and templates `astryx component` and
/// `astryx template` open.
#[derive(Debug, Clone)]
struct Component {
    name: String,
    package: String,
    provider_id: String,
    title: String,
    summary: String,
    replaces: Option<String>,
}

#[derive(Default)]
pub struct LinkData {
    authoring: Vec<Value>,
    schema_fields: Value,
    /// Route -> the typed doc's linked content (CLI typed docs).
    typed_content: HashMap<String, Value>,
    cwd: String,
    /// `(name, package, provider id, title, summary, replaces)`, read on
    /// first use.
    components: std::cell::OnceCell<Vec<Component>>,
    /// `(type, id, package, provider id, title, description, replaces)`,
    /// read on first use.
    templates: std::cell::OnceCell<Vec<(String, String, String, String, String, String, Option<String>)>>,
}

const CORE_PACKAGE: &str = "@astryxdesign/core";
const AUTHORING_REFERENCE_ROUTE: &str = "authoring/field-reference";
const EXPERIMENTAL_AUTHORING_ROUTE: &str = "cli/experimental/icon-set-files";

impl LinkData {
    pub fn load(variant: &Variant, model_nodes: &[Value], cwd: &str) -> LinkData {
        let typed_content = model_nodes.iter().filter(|n| n["selfDoc"] == true).map(|n| (s(n, "route"), n["content"].clone())).collect();
        LinkData {
            authoring: variant.authoring(),
            schema_fields: variant.schema_fields(),
            typed_content,
            cwd: cwd.to_string(),
            components: Default::default(),
            templates: Default::default(),
        }
    }

    /// The link data one integration package's own check reads
    /// (`packageContributions`): Core's components and templates, and the
    /// package's own.
    fn for_package(variant: &Variant, model_nodes: &[Value], integration: &Record) -> LinkData {
        use crate::discovery::component_discovery as cd;
        let dir = integration.get("__packageDir").and_then(|d| d.as_str()).map(String::from).unwrap_or_else(|| std::env::current_dir().unwrap_or_default().to_string_lossy().to_string());
        let data = LinkData::load(variant, model_nodes, &dir);
        let name = integration.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
        let own = integration.get("providerId").and_then(|n| n.as_str()).map(String::from).unwrap_or_else(|| name.clone());
        let mut components: Vec<Component> = Self::load_components_core(&dir);
        if integration.get("components").map(|c| !c.is_null()).unwrap_or(false) {
            let li = crate::commands::component::deps::integration_of(integration);
            for r in cd::discover_valid_integration_components(&li, false).components {
                let (title, summary) = Self::read_component(&r.name, Some(&r.doc_path));
                let replaces = r.replaces.as_ref().and_then(|v| v.as_str()).map(String::from);
                components.push(Component { name: r.name.clone(), package: name.clone(), provider_id: own.clone(), title, summary, replaces });
            }
        }
        let mut templates = Vec::new();
        let cli_root = crate::cli::env::cli_root();
        for t in crate::commands::template::discovery::discover_core(&cli_root) {
            if t.kind == "page" || t.kind == "block" {
                templates.push((t.kind.clone(), t.dir_name.clone(), CORE_PACKAGE.to_string(), CORE_PACKAGE.to_string(), t.display_name.clone().unwrap_or_else(|| t.name.clone()), t.description.clone(), None));
            }
        }
        if integration.get("templates").map(|c| !c.is_null()).unwrap_or(false) {
            for t in crate::commands::template::integration::for_one(integration).0 {
                if t.kind == "page" || t.kind == "block" {
                    templates.push((t.kind.clone(), t.dir_name.clone(), name.clone(), own.clone(), t.display_name.clone().unwrap_or_else(|| t.name.clone()), t.description.clone(), t.replaces.clone()));
                }
            }
        }
        let _ = data.components.set(components);
        let _ = data.templates.set(templates);
        data
    }

    fn components(&self) -> &Vec<Component> {
        self.components.get_or_init(|| Self::load_components(&self.cwd))
    }

    fn templates(&self) -> &Vec<(String, String, String, String, String, String, Option<String>)> {
        self.templates.get_or_init(|| Self::load_templates(&self.cwd))
    }

    fn load_components_core(cwd: &str) -> Vec<Component> {
        let mut out = Vec::new();
        if let Some(core) = crate::discovery::paths::find_core_dir(cwd) {
            for c in crate::discovery::component_discovery::discover_owned_components(std::path::Path::new(&core), &[]) {
                let (title, summary) = Self::read_component(&c.name, c.doc_path.as_deref());
                out.push(Component { name: c.name.clone(), package: CORE_PACKAGE.into(), provider_id: CORE_PACKAGE.into(), title, summary, replaces: None });
            }
        }
        out
    }

    fn read_component(name: &str, doc_path: Option<&std::path::Path>) -> (String, String) {
        Self::read_component_doc(name, doc_path)
    }

    fn load_components(cwd: &str) -> Vec<Component> {
        use crate::discovery::component_discovery as cd;
        let read = |name: &str, doc_path: Option<&std::path::Path>| -> (String, String) { Self::read_component_doc(name, doc_path) };
        let mut components = Vec::new();
        let core = crate::discovery::paths::find_core_dir(cwd);
        if let Some(core) = &core {
            for c in cd::discover_owned_components(std::path::Path::new(core), &[]) {
                let (title, summary) = read(&c.name, c.doc_path.as_deref());
                components.push(Component { name: c.name.clone(), package: CORE_PACKAGE.into(), provider_id: CORE_PACKAGE.into(), title, summary, replaces: None });
            }
        }
        let ints = crate::commands::component::deps::load_integrations_safely(std::path::Path::new(cwd));
        if !ints.is_empty() {
            let cmd = crate::cli::env::format_cli_command_at(std::path::Path::new(cwd), "component --list");
            let active = crate::discovery::component_replacement::resolve_component_replacements(core.as_deref().map(std::path::Path::new), &ints, &cmd).active;
            for i in ints.iter().filter(|i| !i.load_error) {
                let provider = i.provider_id.clone().unwrap_or_else(|| i.name.clone());
                for r in cd::discover_valid_integration_components(i, false).components {
                    let (title, summary) = read(&r.name, Some(&r.doc_path));
                    let replaces = active.iter().find(|a| a.package == r.package && a.name == r.name).map(|a| a.target.clone());
                    components.push(Component { name: r.name.clone(), package: r.package.clone(), provider_id: provider.clone(), title, summary, replaces });
                }
            }
        }
        components
    }

    fn read_component_doc(name: &str, doc_path: Option<&std::path::Path>) -> (String, String) {
        let doc = doc_path.and_then(|p| crate::discovery::doc_read::load_component_doc(&p.to_string_lossy(), None, None).ok().flatten()).and_then(|d| json_plain(&d));
        let entry = doc.as_ref().and_then(|d| {
            if d["name"].as_str() == Some(name) {
                Some(d.clone())
            } else {
                d["components"].as_array().and_then(|a| a.iter().find(|e| e["name"].as_str() == Some(name)).cloned())
            }
        });
        let title = entry.as_ref().and_then(|e| e["displayName"].as_str()).map(String::from).unwrap_or_else(|| name.to_string());
        let summary = entry.as_ref().and_then(|e| e["description"].as_str()).or_else(|| doc.as_ref().and_then(|d| d["description"].as_str())).unwrap_or("").to_string();
        (title, summary)
    }

    fn load_templates(cwd: &str) -> Vec<(String, String, String, String, String, String, Option<String>)> {
        let mut templates = Vec::new();
        let cli_root = crate::cli::env::cli_root();
        for t in crate::commands::template::discovery::discover_core(&cli_root) {
            if t.kind != "page" && t.kind != "block" {
                continue;
            }
            templates.push((t.kind.clone(), t.dir_name.clone(), CORE_PACKAGE.to_string(), CORE_PACKAGE.to_string(), t.display_name.clone().unwrap_or_else(|| t.name.clone()), t.description.clone(), None));
        }
        let (its, _) = crate::commands::template::integration::discover_integration_templates(cwd);
        for t in its {
            if t.kind != "page" && t.kind != "block" {
                continue;
            }
            let pkg = t.pkg().to_string();
            templates.push((t.kind.clone(), t.dir_name.clone(), pkg.clone(), pkg, t.display_name.clone().unwrap_or_else(|| t.name.clone()), t.description.clone(), t.replaces.clone()));
        }
        templates
    }
}

/// A typed doc a reference block can include.
struct Typed {
    kind: String,
    content: Value,
    fields: Option<Value>,
    /// A namespace's own blocks and its provider id, linked only when a
    /// reference block includes it.
    blocks: Option<(Value, String)>,
}

struct Found {
    link: Value,
    kind: String,
    typed: Option<Typed>,
}

struct Finder<'a> {
    tree: &'a DocsTree,
    topics: &'a [Value],
    data: &'a LinkData,
}

fn link_value(target: &str, id: &str, route: Option<&str>, title: &str, summary: &str, command: &str) -> Value {
    let mut l = Map::new();
    l.insert("target".into(), Value::from(target));
    l.insert("id".into(), Value::from(id));
    l.insert("route".into(), route.map(Value::from).unwrap_or(Value::Null));
    l.insert("title".into(), Value::from(title));
    l.insert("summary".into(), Value::from(summary));
    l.insert("command".into(), Value::from(command));
    Value::Object(l)
}

impl Finder<'_> {
    /// `catalog.resolve(name)`: a topic by its name, or a name it took over.
    fn resolve_topic(&self, name: &str) -> Option<&Value> {
        let wanted = name.to_lowercase();
        self.topics.iter().find(|t| s(t, "name").to_lowercase() == wanted).or_else(|| {
            self.topics.iter().find(|t| t["aliases"].as_array().map(|a| a.iter().any(|x| x.as_str() == Some(wanted.as_str()))).unwrap_or(false))
        })
    }

    fn find(&self, target: &str, from_provider: &str) -> Result<Value, String> {
        self.find_doc(target, from_provider).map(|f| f.link)
    }

    /// `docFinderOver(...)`.
    fn find_doc(&self, target: &str, from_provider: &str) -> Result<Found, String> {
        use crate::discovery::doc_compiler::tree::create_doc_id;
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
            let link = link_value(target, node.id.as_deref().unwrap(), Some(&node.route), &node.title, &node.summary, &format!("astryx docs {}", node.route));
            let typed = match &node.self_doc {
                Some(doc) if node.kind != "namespace" => match self.data.typed_content.get(&node.route) {
                    Some(c) if node.provider == CLI => Some(Typed { kind: node.kind.clone(), content: c.clone(), fields: self.data.schema_fields.get(&node.route).cloned(), blocks: None }),
                    _ => Some(Typed { kind: node.kind.clone(), content: Value::Array(vec![]), fields: None, blocks: Some((Value::Array(typed_doc_content(doc)), node.provider_id.clone())) }),
                },
                Some(doc) => Some(match self.data.typed_content.get(&node.route) {
                    Some(c) if node.provider == CLI => Typed { kind: "namespace".into(), content: c.clone(), fields: None, blocks: None },
                    _ => Typed {
                        kind: "namespace".into(),
                        content: Value::Array(vec![]),
                        fields: None,
                        blocks: Some((doc.get("blocks").cloned().unwrap_or(Value::Array(vec![])), node.provider_id.clone())),
                    },
                }),
                None => None,
            };
            return Ok(Found { link, kind: node.kind.clone(), typed });
        }
        if provider == crate::discovery::doc_compiler::tree::CLI_PROVIDER_ID {
            if let Some(a) = self.data.authoring.iter().find(|a| s(a, "type") == parsed.kind && s(a, "name") == parsed.name) {
                let experimental = a["experimental"] == true;
                let route = if experimental { EXPERIMENTAL_AUTHORING_ROUTE } else { AUTHORING_REFERENCE_ROUTE };
                let title = a["displayName"].as_str().map(String::from).unwrap_or_else(|| s(a, "name"));
                let link = link_value(
                    target,
                    &create_doc_id(&provider, &s(a, "type"), &s(a, "name")),
                    Some(route),
                    &title,
                    &s(a, "description"),
                    &format!("astryx docs {} {}", if experimental { route } else { "authoring" }, s(a, "name")),
                );
                let fields = serde_json::json!({"fieldOrder": a["fieldOrder"], "fields": a["fields"]});
                return Ok(Found { link, kind: parsed.kind.clone(), typed: Some(Typed { kind: s(a, "type"), content: a["content"].clone(), fields: Some(fields), blocks: None }) });
            }
        }
        if parsed.kind == "generic" {
            let wanted = parsed.name.to_lowercase();
            if let Some(t) = self.resolve_topic(&parsed.name) {
                let tp = t.get("providerId").and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| s(t, "package"));
                let aliased = t["aliases"].as_array().map(|a| a.iter().any(|x| x.as_str() == Some(wanted.as_str()))).unwrap_or(false)
                    || t["replaces"].as_str().map(|r| r.to_lowercase() == wanted).unwrap_or(false);
                if normalize_provider_id(&tp).as_deref() == Some(provider.as_str()) || aliased {
                    let title = t.get("title").and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| s(t, "name"));
                    let link = link_value(target, &create_doc_id(&provider, "generic", &parsed.name), Some(&s(t, "name")), &title, &s(t, "description"), &format!("astryx docs {}", s(t, "name")));
                    return Ok(Found { link, kind: "generic".into(), typed: None });
                }
            }
        }
        if parsed.kind == "component" {
            let same = |pid: &str| normalize_provider_id(pid).as_deref() == Some(provider.as_str());
            if let Some(c) = self.data.components().iter().find(|c| c.name == parsed.name && same(&c.provider_id)) {
                let select = c.package != CORE_PACKAGE || self.data.components().iter().any(|o| o.package != CORE_PACKAGE && (o.name == c.name || o.replaces.as_deref() == Some(c.name.as_str())));
                let command = format!("astryx component {}{}", c.name, if select { format!(" --package {}", c.package) } else { String::new() });
                let summary_text = if c.summary.contains("{@") {
                    let pid = if provider == normalize_provider_id(CORE_PACKAGE).unwrap_or_default() { crate::discovery::doc_compiler::tree::CLI_PROVIDER_ID.to_string() } else { provider.clone() };
                    let mut f = |t: &str| self.find(t, &pid).ok();
                    resolve_inline(&c.summary, &mut f)
                } else {
                    crate::discovery::doc_compiler::links::render_tokens(&c.summary, None)
                };
                let link = link_value(target, &create_doc_id(&provider, "component", &c.name), None, &c.title, &summary_text, &command);
                return Ok(Found { link, kind: "component".into(), typed: None });
            }
        }
        if parsed.kind == "page" || parsed.kind == "block" {
            let same = |pid: &str| normalize_provider_id(pid).as_deref() == Some(provider.as_str());
            if let Some(t) = self.data.templates().iter().find(|t| t.0 == parsed.kind && t.1 == parsed.name && same(&t.3)) {
                let select = t.2 != CORE_PACKAGE || self.data.templates().iter().any(|o| o.2 != CORE_PACKAGE && o.0 == t.0 && (o.1 == parsed.name || o.6.as_deref() == Some(parsed.name.as_str())));
                let command = format!("astryx template {} --type {}{}", parsed.name, t.0, if select { format!(" --package {}", t.2) } else { String::new() });
                let summary = crate::discovery::doc_compiler::links::render_tokens(&t.5, None);
                let link = link_value(target, &create_doc_id(&provider, &t.0, &parsed.name), None, &t.4, &summary, &command);
                return Ok(Found { link, kind: t.0.clone(), typed: None });
            }
        }
        let search_type = match parsed.kind.as_str() {
            "component" => "component",
            "page" | "block" => "template",
            _ => "doc",
        };
        Err(format!("\"{target}\" names no doc. Find it with `astryx search {} --type {search_type}`, then name it as `[<provider>:]<kind>:<name>`.", parsed.name))
    }

    /// `docIncluder(...)`: what one reference block includes of the doc it
    /// names.
    fn include(&self, block: &Value, from_provider: &str) -> (Vec<Value>, Vec<String>) {
        let target = block["target"].as_str().unwrap_or("");
        let Ok(found) = self.find_doc(target, from_provider) else { return (vec![], vec![]) };
        let projection = block.get("projection");
        let fields = projection.and_then(|p| p.get("fields")).filter(|f| !f.is_null());
        let sections = projection.and_then(|p| p.get("sections")).filter(|f| !f.is_null());
        let presentation = block.get("presentation").and_then(|p| p.as_str()).unwrap_or("full");
        let mut problems = Vec::new();
        if sections.is_some() {
            problems.push("projection.sections: a reference block does not include topic sections; reference a schema, command, function, or enum doc, and name the fields of a schema with projection.fields".to_string());
        }
        let Some(typed) = found.typed else {
            let given = block.get("presentation").and_then(|p| p.as_str()).unwrap_or("summary");
            if fields.is_some() || given != "summary" {
                let kind = match found.kind.as_str() {
                    "generic" => "topic".to_string(),
                    "namespace" => "namespace".to_string(),
                    k => format!("{k} doc"),
                };
                problems.push(format!("\"{target}\" is a {kind}, which a reference block shows only by its title and summary; remove the projection and the presentation, or reference a schema, command, function, or enum doc"));
            }
            return (vec![], problems);
        };
        if presentation == "summary" {
            if fields.is_some() {
                problems.push("projection.fields: a summary includes no fields; remove projection.fields or presentation: 'summary'".to_string());
            }
            return (vec![], problems);
        }
        let mut content: Vec<Value> = if let (Some(fields), "schema") = (fields, typed.kind.as_str()) {
            let empty = Value::Null;
            let tf = typed.fields.as_ref().unwrap_or(&empty);
            let mut rows = Vec::new();
            let mut missing = Vec::new();
            let order: Vec<String> = tf["fieldOrder"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
            let title = found.link["title"].as_str().unwrap_or("").to_string();
            for name in fields.as_array().cloned().unwrap_or_default() {
                let n = crate::cli::format::js_string(&name);
                match tf["fields"].get(&n) {
                    Some(r) => rows.extend(r.as_array().cloned().unwrap_or_default()),
                    None => {
                        problems.push(format!("projection.fields: \"{n}\" is not a field of {title} ({target}). Its fields: {}", order.join(", ")));
                        missing.push(serde_json::json!({"type": "prose", "text": format!("[reference: field \"{n}\" not found in \"{target}\"]")}));
                    }
                }
            }
            let mut c = Vec::new();
            if !rows.is_empty() {
                c.push(serde_json::json!({"type": "table", "headers": ["Field", "Type", "Required", "Description"], "rows": rows}));
            }
            c.extend(missing);
            c
        } else {
            if fields.is_some() {
                problems.push(format!("projection.fields: names the fields of a schema doc, and \"{target}\" is a {} doc; remove it to include the whole doc", typed.kind));
            }
            if let Some((blocks, pid)) = &typed.blocks {
                let mut resolve = |t: &str| self.find(t, pid);
                link_blocks(blocks.as_array().map(|a| a.as_slice()).unwrap_or(&[]), &mut resolve, None, None).0
            } else {
                typed.content.as_array().cloned().unwrap_or_default()
            }
        };
        if presentation == "compact" {
            content.retain(|b| b["type"] != "code");
        }
        (content, problems)
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
    pub data: LinkData,
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
        self_doc: v["ref"].get("selfDoc").and_then(json_plain),
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
pub fn build(variant: &Variant, catalog: DocsCatalog, cwd: &str) -> Built {
    let model_nodes = variant.nodes();
    let data = LinkData::load(variant, &model_nodes, cwd);
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
    apply_guide_overlays(&mut tree, &catalog);
    // Summaries: the CLI's as the model rendered them; the rest rendered here.
    let finder_topics = topics.clone();
    let rendered: Vec<(String, String)> = {
        let finder = Finder { tree: &tree, topics: &finder_topics, data: &data };
        tree.nodes
            .iter()
            .map(|n| {
                let replaced = n.guide_overlay.as_ref().and_then(|o| o.replacement.as_ref());
                let model = model_by_route.get(&n.route).filter(|m| replaced.is_none() && n.provider == CLI && s(m, "provider") == CLI && (n.flat_topic.is_none() || finder_topics.iter().any(|t| s(t, "name") == n.route && t["pure"] == true)));
                match model {
                    Some(m) => (n.route.clone(), s(m, "summary")),
                    None => {
                        let pid = replaced.map(|r| r.get("providerId").and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| s(r, "package"))).unwrap_or_else(|| n.provider_id.clone());
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
        let finder = Finder { tree: &tree, topics: &finder_topics, data: &data };
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
            let content = content.or_else(|| match &n.self_doc {
                Some(doc) if n.kind == "namespace" => {
                    let finder = Finder { tree: &tree, topics: &finder_topics, data: &data };
                    let pid = n.provider_id.clone();
                    let mut resolve = |t: &str| finder.find(t, &pid);
                    let blocks = doc.get("blocks").and_then(|b| b.as_array()).cloned().unwrap_or_default();
                    Some(Value::Array(link_blocks(&blocks, &mut resolve, None, None).0))
                }
                Some(doc) => {
                    let finder = Finder { tree: &tree, topics: &finder_topics, data: &data };
                    let pid = n.provider_id.clone();
                    let mut resolve = |t: &str| finder.find(t, &pid);
                    Some(Value::Array(link_blocks(&typed_doc_content(doc), &mut resolve, None, None).0))
                }
                None => None,
            });
            let related = m.and_then(|m| m["related"].as_array().cloned()).unwrap_or_default().into_iter().filter_map(|r| r.as_str().map(String::from)).collect();
            n.to_model(&tree, content, related)
        })
        .collect();

    let units = units_of(&catalog, &tree);
    let mut reads = HashMap::new();
    let finder = Finder { tree: &tree, topics: &finder_topics, data: &data };
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
    Built { tree, nodes, topics, reads, issues: catalog.issues.clone(), data }
}

fn topic_read(finder: &Finder, variant: &Variant, lowered: &Lowered, u: &Unit, package_of: &dyn Fn(&str) -> String, links: Value, lang: &str) -> Value {
    // Link each section's blocks against the provider that wrote it, and the
    // topic's own text fields against the topic's.
    let mut sections = Vec::new();
    for sec in lowered.doc["sections"].as_array().cloned().unwrap_or_default() {
        let id = s(&sec, "id");
        let pid = lowered.section_providers.get(&id).and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| u.provider_id.clone());
        let mut resolve = |t: &str| finder.find(t, &pid);
        let mut include = |b: &Value| finder.include(b, &pid);
        let (content, _) = link_blocks(sec["content"].as_array().map(|a| a.as_slice()).unwrap_or(&[]), &mut resolve, Some(&id), Some(&mut include));
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

impl Built {
    /// The link a target names in this project, or the problem with it, as
    /// written in a doc of `from_provider`: `link_resolver` without building
    /// the tree again.
    pub fn resolve(&self, target: &str, from_provider: &str) -> Result<Value, String> {
        Finder { tree: &self.tree, topics: &self.topics, data: &self.data }.find(target, from_provider)
    }
}

/// How a doc's `{@link}` targets resolve in a project (`linkResolver`): the
/// docs tree's docs by identity, and flat topics. For other commands that
/// render doc text, such as `component`.
pub struct LinkResolver {
    tree: DocsTree,
    topics: Vec<Value>,
    data: LinkData,
}

impl LinkResolver {
    /// The link a target names, or the problem with it, as written in a doc
    /// of `from_provider`.
    pub fn resolve(&self, target: &str, from_provider: &str) -> Result<Value, String> {
        Finder { tree: &self.tree, topics: &self.topics, data: &self.data }.find(target, from_provider)
    }
}

/// The project's link resolver.
pub fn link_resolver(cwd: &str) -> LinkResolver {
    let pm = crate::discovery::package_manager::doc_package_manager(Some(cwd));
    crate::discovery::doc_compiler::links::set_doc_pm(&pm);
    let variant = Variant::get(&pm);
    let catalog = discover(cwd).unwrap_or_else(DocsCatalog::from_builtins);
    let built = build(&variant, catalog, cwd);
    LinkResolver { tree: built.tree, topics: built.topics, data: built.data }
}

/// What integrations do to a guide the tree places, by its route (or the
/// route it moved from): a replacement reads in its place, extensions merge
/// onto it (`buildProjectTree`).
fn apply_guide_overlays(tree: &mut DocsTree, catalog: &DocsCatalog) {
    use crate::discovery::doc_compiler::tree::GuideOverlay;
    const MOVED: &[(&str, &str)] = &[("cli/integrations", "authoring"), ("cli-integrations", "authoring")];
    for record in &catalog.guide_targeters {
        let Some(route) = record.replaces.clone().or_else(|| record.extends_topic.clone()) else { continue };
        let found = tree.get(&route).or_else(|| tree.get_folded(&route)).map(|n| n.route.clone()).or_else(|| {
            let wanted = route.to_lowercase();
            MOVED.iter().find_map(|(from, to)| {
                if wanted != *from && !wanted.starts_with(&format!("{from}/")) {
                    return None;
                }
                tree.get_folded(&format!("{to}{}", &wanted[from.len()..])).map(|n| n.route.clone())
            })
        });
        let Some(at) = found else { continue };
        let Some(node) = tree.get_mut(&at) else { continue };
        if node.kind != "generic" || node.topic_file.is_none() {
            continue;
        }
        let mut rec = Map::new();
        rec.insert("package".into(), Value::from(record.package.as_str()));
        rec.insert("path".into(), Value::from(record.path.as_str()));
        if let Some(p) = &record.provider_id {
            rec.insert("providerId".into(), Value::from(p.as_str()));
        }
        if let Some(t) = &record.title {
            rec.insert("title".into(), t.clone());
        }
        if let Some(d) = &record.description {
            rec.insert("description".into(), d.clone());
        }
        let overlay = node.guide_overlay.clone().unwrap_or_default();
        if record.replaces.is_some() {
            node.guide_overlay = Some(GuideOverlay {
                replaced_package: overlay.replacement.as_ref().map(|r| s(r, "package")),
                replacement: Some(Value::Object(rec)),
                extensions: vec![],
            });
        } else {
            let mut o = overlay;
            o.extensions.push(Value::Object(rec));
            node.guide_overlay = Some(o);
        }
    }
    for node in tree.nodes.iter_mut() {
        if let Some(r) = node.guide_overlay.as_ref().and_then(|o| o.replacement.clone()) {
            if let Some(t) = r.get("title").and_then(|x| x.as_str()) {
                node.title = t.to_string();
            }
            if let Some(d) = r.get("description").and_then(|x| x.as_str()) {
                node.summary = d.to_string();
            }
        }
    }
}

/// Every topic read the catalog and tree build at run time: each topic an
/// integration wrote, replaced or extended, and each guide an integration
/// placed, replaced or extended.
fn units_of(catalog: &DocsCatalog, tree: &DocsTree) -> Vec<Unit> {
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
    let cli_tree_dir = crate::cli::env::cli_root().join("assets").join("docs").join("tree");
    for n in &tree.nodes {
        if n.kind != "generic" || (n.provider == CLI && n.guide_overlay.is_none()) {
            continue;
        }
        let Some(file) = &n.topic_file else { continue };
        let file = if n.provider == CLI && !file.contains('/') { cli_tree_dir.join(file).to_string_lossy().to_string() } else { file.clone() };
        let overlay = n.guide_overlay.clone().unwrap_or_default();
        let ext = |e: &Value| (s(e, "package"), e.get("providerId").and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| s(e, "package")), s(e, "path"));
        let extensions: Vec<(String, String, String)> = overlay.extensions.iter().map(ext).collect();
        match &overlay.replacement {
            Some(r) => units.push(Unit {
                key: format!("guide:{}", n.route),
                name: n.route.clone(),
                package: s(r, "package"),
                provider_id: r.get("providerId").and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| s(r, "package")),
                path: s(r, "path"),
                extensions,
                is_guide: true,
                replaces: Some(n.route.clone()),
                replaced_package: Some(overlay.replaced_package.clone().unwrap_or_else(|| n.provider.clone())),
            }),
            None => units.push(Unit {
                key: format!("guide:{}", n.route),
                name: n.route.clone(),
                package: n.provider.clone(),
                provider_id: n.provider_id.clone(),
                path: file,
                extensions,
                is_guide: true,
                replaces: None,
                replaced_package: None,
            }),
        }
    }
    units
}

// ─── What doctor checks of one integration's docs ─────────────────────────

use crate::discovery::docs_discovery::{IntegrationDocs as DiscoveredDocs, TreeInputs};
use crate::discovery::integrations::Record;

/// The catalog one integration package's docs read, as doctor checks it
/// before any app configures it (`packageCatalog`): the CLI's topics and the
/// package's own docs.
pub fn package_catalog(discovered: &DiscoveredDocs) -> DocsCatalog {
    let mut catalog = DocsCatalog::from_builtins();
    for r in &discovered.records {
        catalog.add(r);
    }
    let rank1 = |list: &[crate::discovery::docs_discovery::TreeInput]| {
        list.iter()
            .map(|m| {
                let mut m = m.clone();
                m.insert("rank".into(), Value::from(1));
                m
            })
            .collect()
    };
    catalog.add_tree_inputs(TreeInputs { namespaces: rank1(&discovered.namespaces), guides: rank1(&discovered.guides) });
    catalog
}

fn package_cwd(integration: &Record) -> String {
    integration
        .get("__packageDir")
        .and_then(|d| d.as_str())
        .map(String::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default().to_string_lossy().to_string())
}

fn built_for(catalog: &DocsCatalog, cwd: &str) -> Built {
    let here = std::env::current_dir().unwrap_or_default().to_string_lossy().to_string();
    let pm = crate::discovery::package_manager::doc_package_manager(Some(&here));
    crate::discovery::doc_compiler::links::set_doc_pm(&pm);
    let variant = Variant::get(&pm);
    build(&variant, catalog.clone(), cwd)
}

fn format_problem(where_: &str, p: &crate::discovery::doc_compiler::links::LinkProblem) -> String {
    format!(
        "{where_}{}{}: {}",
        p.section.as_ref().map(|s| format!(" \u{a7} {s}")).unwrap_or_default(),
        p.field.as_ref().map(|f| format!(" ({f})")).unwrap_or_default(),
        p.message
    )
}

/// `topicLinkProblems(catalog, entry)`: every link problem in one topic, its
/// sections first, then its own text fields.
fn unit_problems(finder: &Finder, u: &Unit) -> Vec<crate::discovery::doc_compiler::links::LinkProblem> {
    let (doc, _) = load(&u.path, "en");
    let Some(doc) = doc else { return vec![] };
    let base = TopicSource { provider_id: u.provider_id.clone(), doc, overlay: None };
    let exts: Vec<TopicSource> = u.extensions.iter().filter_map(|(_, pid, path)| load(path, "en").0.map(|d| TopicSource { provider_id: pid.clone(), doc: d, overlay: None })).collect();
    let Ok(lowered) = lower_topic(&u.name, &base, &exts) else { return vec![] };
    let mut problems = Vec::new();
    for sec in lowered.doc["sections"].as_array().cloned().unwrap_or_default() {
        let id = s(&sec, "id");
        let pid = lowered.section_providers.get(&id).and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| u.provider_id.clone());
        let mut resolve = |t: &str| finder.find(t, &pid);
        let mut include = |b: &Value| finder.include(b, &pid);
        let at = if id.is_empty() { s(&sec, "title") } else { id.clone() };
        let (_, ps) = link_blocks(sec["content"].as_array().map(|a| a.as_slice()).unwrap_or(&[]), &mut resolve, Some(&at), Some(&mut include));
        problems.extend(ps);
    }
    let mut fields = Map::new();
    for k in ["description", "summary"] {
        if let Some(d) = lowered.doc.get(k).filter(|d| d.is_string()) {
            fields.insert(k.into(), d.clone());
        }
    }
    let mut resolve = |t: &str| finder.find(t, &u.provider_id);
    let (_, ps) = link_fields(&Value::Object(fields), &mut resolve);
    problems.extend(ps);
    problems
}

/// `docsLinkProblems(catalog, tree, {owner, references})`.
fn docs_link_problems(built: &Built, catalog: &DocsCatalog, owner: Option<&str>, references: bool) -> Vec<String> {
    let finder = Finder { tree: &built.tree, topics: &built.topics, data: &built.data };
    let units = units_of(catalog, &built.tree);
    let mut out = Vec::new();
    let mut note = |where_: &str, found: Vec<crate::discovery::doc_compiler::links::LinkProblem>| {
        for p in found {
            if p.include != references {
                continue;
            }
            out.push(format_problem(where_, &p));
        }
    };
    for e in catalog.entries() {
        if let Some(owner) = owner {
            if e.package != owner && !e.extensions.iter().any(|x| x.package == owner) {
                continue;
            }
        }
        let u = units.iter().find(|u| u.key == format!("topic:{}", e.name));
        let found = match u {
            Some(u) => unit_problems(&finder, u),
            None => vec![],
        };
        note(&e.name, found);
    }
    for n in &built.tree.nodes {
        let overlay = n.guide_overlay.as_ref();
        let owned = match owner {
            None => true,
            Some(owner) => {
                n.provider == owner
                    || overlay.and_then(|o| o.replacement.as_ref()).map(|r| s(r, "package") == owner).unwrap_or(false)
                    || overlay.map(|o| o.extensions.iter().any(|x| s(x, "package") == owner)).unwrap_or(false)
            }
        };
        if !owned {
            continue;
        }
        if n.kind == "generic" && n.topic_file.is_some() {
            if let Some(u) = units.iter().find(|u| u.key == format!("guide:{}", n.route)) {
                note(&n.route, unit_problems(&finder, u));
            }
        } else if let Some(doc) = &n.self_doc {
            if n.kind == "namespace" {
                let pid = n.provider_id.clone();
                let mut resolve = |t: &str| finder.find(t, &pid);
                let blocks = doc.get("blocks").and_then(|b| b.as_array()).cloned().unwrap_or_default();
                note(&n.route, link_blocks(&blocks, &mut resolve, None, None).1);
            }
        }
    }
    out
}

/// `packageDocsProblems(integration, discovered)`: the tree problems its
/// docs make (errors) and each link in them that names no doc (warnings).
pub fn package_docs_problems(integration: &Record, discovered: &DiscoveredDocs) -> Vec<(&'static str, String)> {
    let name = integration.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
    let catalog = package_catalog(discovered);
    let built = built_for(&catalog, &package_cwd(integration));
    let mut out: Vec<(&'static str, String)> = built
        .tree
        .diagnostics
        .iter()
        .filter(|d| d.severity == "error" && d.provider == name)
        .map(|d| ("error", format!("{}: {}", if d.source.is_empty() { name.clone() } else { d.source.clone() }, d.message)))
        .collect();
    for m in docs_link_problems(&built, &catalog, Some(&name), false) {
        out.push(("warning", m));
    }
    out
}

/// `packageReferenceProblems(integration, discovered)`: each reference block
/// in its docs that cannot include what it names.
pub fn package_reference_problems(integration: &Record, discovered: &DiscoveredDocs) -> Vec<String> {
    let name = integration.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
    let catalog = package_catalog(discovered);
    let built = built_for(&catalog, &package_cwd(integration));
    docs_link_problems(&built, &catalog, Some(&name), true)
}

/// One doc that replaces or extends another, as a package's own check sees
/// it (`DocTarget`).
#[derive(Debug, Clone)]
pub struct DocTarget {
    pub topic: String,
    pub relationship: &'static str,
    pub target: String,
    /// `topic`, `guide`, `namespace`, or None when it names nothing.
    pub kind: Option<&'static str>,
    pub owner: Option<String>,
    pub guide: Option<String>,
    pub guides_below: Vec<String>,
    /// `(section, field, key)` for each `before`/`after` that found no section.
    pub unplaced: Vec<(String, String, String)>,
}

fn placed_guides_below(tree: &DocsTree, namespace: &str) -> Vec<String> {
    let mut routes = Vec::new();
    let mut level = vec![namespace.to_string()];
    while !level.is_empty() {
        let mut next = Vec::new();
        for p in &level {
            let Some(parent) = tree.get(p) else { continue };
            for slot in &parent.slots {
                for r in &slot.children {
                    let Some(child) = tree.get(r) else { continue };
                    if child.parent.as_deref() != Some(p.as_str()) {
                        continue;
                    }
                    if child.kind == "generic" && child.topic_file.is_some() {
                        routes.push(child.route.clone());
                    }
                    if !child.slots.is_empty() {
                        next.push(child.route.clone());
                    }
                }
            }
        }
        level = next;
    }
    routes
}

/// `packageDocTargets(integration, discovered)`.
pub fn package_doc_targets(integration: &Record, discovered: &DiscoveredDocs) -> Vec<DocTarget> {
    use crate::discovery::docs_discovery::merge_topic_report;
    let catalog = package_catalog(discovered);
    let built = built_for(&catalog, &package_cwd(integration));
    let tree = &built.tree;
    let cli_tree_dir = crate::cli::env::cli_root().join("assets").join("docs").join("tree");
    let file_of = |n: &crate::discovery::doc_compiler::tree::TreeNode| -> Option<String> {
        let f = n.topic_file.clone()?;
        Some(if n.provider == CLI && !f.contains('/') { cli_tree_dir.join(f).to_string_lossy().to_string() } else { f })
    };
    let moved = |route: &str| -> Option<String> {
        let wanted = route.to_lowercase();
        for (from, to) in [("cli/integrations", "authoring"), ("cli-integrations", "authoring")] {
            if wanted != from && !wanted.starts_with(&format!("{from}/")) {
                continue;
            }
            if let Some(n) = tree.get_folded(&format!("{to}{}", &wanted[from.len()..])) {
                return Some(n.route.clone());
            }
        }
        None
    };
    let node_at = |route: &str| tree.get(route).or_else(|| tree.get_folded(route)).map(|n| n.route.clone()).or_else(|| moved(route));
    let mut out = Vec::new();
    for record in &discovered.records {
        let (relationship, target) = match (&record.replaces, &record.extends_topic) {
            (Some(r), _) => ("replaces", r.clone()),
            (None, Some(e)) => ("extends", e.clone()),
            _ => continue,
        };
        let mut kind = None;
        let mut owner = None;
        let mut base_path: Option<String> = None;
        let mut extensions: Vec<String> = Vec::new();
        let mut guides_below = Vec::new();
        let mut guide = None;
        if target.contains('/') {
            if let Some(n) = node_at(&target).and_then(|r| tree.get(&r)).filter(|n| n.kind == "generic" && n.topic_file.is_some()) {
                kind = Some("guide");
                guide = Some(n.route.clone());
                owner = Some(n.provider.clone());
                base_path = n.guide_overlay.as_ref().and_then(|o| o.replacement.as_ref()).map(|r| s(r, "path")).or_else(|| file_of(n));
                extensions = n.guide_overlay.as_ref().map(|o| o.extensions.iter().map(|e| s(e, "path")).collect()).unwrap_or_default();
            }
        } else if let Some(entry) = catalog.resolve(&target) {
            kind = Some("topic");
            if entry.path == record.path {
                owner = entry.replaced_package.clone();
            } else {
                owner = Some(entry.package.clone());
                base_path = Some(entry.path.clone());
                extensions = entry.extensions.iter().map(|e| e.path.clone()).collect();
            }
        }
        if kind.is_none() {
            if let Some(n) = node_at(&target).and_then(|r| tree.get(&r)).filter(|n| n.kind == "namespace") {
                kind = Some("namespace");
                owner = Some(n.provider.clone());
                guides_below = placed_guides_below(tree, &n.route);
            }
        }
        let mut unplaced = Vec::new();
        if relationship == "extends" {
            if let Some(bp) = &base_path {
                let mut doc = load(bp, "en").0;
                for path in &extensions {
                    let Some(d) = doc.clone() else { break };
                    let Some(file) = load(path, "en").0 else { continue };
                    let (merged, missing) = merge_topic_report(&d, &file);
                    if *path == record.path {
                        unplaced = missing.into_iter().map(|u| (u.section, u.field.to_string(), u.key)).collect();
                        break;
                    }
                    doc = Some(merged);
                }
            }
        }
        out.push(DocTarget { topic: record.name.clone(), relationship, target, kind, owner, guide, guides_below, unplaced });
    }
    out
}

/// `cliDocSection(doc).content` for a typed doc another package wrote: its
/// icon definitions (the only typed docs an integration places today).
fn typed_doc_content(doc: &Value) -> Vec<Value> {
    if doc["type"] != "icon-definition" {
        return vec![];
    }
    let name = s(doc, "name");
    let words: Vec<String> = doc["words"].as_array().map(|a| a.iter().map(|w| format!("`{}`", crate::cli::format::js_string(w))).collect()).unwrap_or_default();
    let mut rows = vec![serde_json::json!(["Words", words.join(", ")])];
    if doc["builtIn"] == true {
        rows.push(serde_json::json!(["Built in", "Yes: every icon set maps it, and Core renders it."]));
    }
    vec![
        serde_json::json!({"type": "prose", "text": doc.get("description").cloned().unwrap_or(Value::Null)}),
        serde_json::json!({"type": "table", "headers": ["Field", "Value"], "rows": rows}),
        serde_json::json!({"type": "prose", "text": format!("An icon set registers the icon that draws this definition in its data file: `\"map\": {{\"{name}\": \"<icon id>\"}}`. Find it in each installed set: `astryx experimental icon {name}`.")}),
        serde_json::json!({"type": "prose", "text": "Icon definitions are experimental: they may change or be removed in a patch release."}),
    ]
}

/// `packageComponentLinkProblems(integration, discovered)`: each link in the
/// package's own component docs that names no doc, a warning each.
pub fn package_component_link_problems(integration: &Record, discovered: &DiscoveredDocs) -> Vec<(&'static str, String)> {
    use crate::discovery::component_discovery as cd;
    let name = integration.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
    let own = integration.get("providerId").and_then(|n| n.as_str()).map(String::from).unwrap_or_else(|| name.clone());
    if normalize_provider_id(&own).is_none() {
        return vec![];
    }
    if integration.get("components").map(|c| c.is_null()).unwrap_or(true) {
        return vec![];
    }
    let catalog = package_catalog(discovered);
    let mut built = built_for(&catalog, &package_cwd(integration));
    let here = std::env::current_dir().unwrap_or_default().to_string_lossy().to_string();
    let variant = Variant::get(&crate::discovery::package_manager::doc_package_manager(Some(&here)));
    built.data = LinkData::for_package(&variant, &variant.nodes(), integration);
    let finder = Finder { tree: &built.tree, topics: &built.topics, data: &built.data };
    let li = crate::commands::component::deps::integration_of(integration);
    let mut out = Vec::new();
    let mut seen: Vec<std::path::PathBuf> = Vec::new();
    for r in cd::discover_valid_integration_components(&li, false).components {
        if seen.contains(&r.doc_path) {
            continue;
        }
        seen.push(r.doc_path.clone());
        let Ok(Some(doc)) = crate::discovery::doc_read::load_component_doc(&r.doc_path.to_string_lossy(), None, None) else { continue };
        let Some(doc) = json_plain(&doc) else { continue };
        if !crate::json::stringify(&doc, 0).contains("{@") {
            continue;
        }
        let mut resolve = |t: &str| finder.find(t, &own);
        let (_, problems) = link_fields(&doc, &mut resolve);
        let shown = doc["name"].as_str().map(String::from).unwrap_or_else(|| r.name.clone());
        for p in problems {
            out.push(("warning", format!("component {shown}{}: {}", p.field.as_ref().map(|f| format!(" ({f})")).unwrap_or_default(), p.message)));
        }
    }
    out
}

#[cfg(test)]
mod package_tests {
    /// Prints what the package readers report for the docsint fixture, to
    /// compare with the JS readers (set ASTRYX_RS_DOCSINT to its folder).
    /// Prints doctor's docs-tree report as JSON for the folder in
    /// ASTRYX_RS_TREE_DIR, to compare with the JS check.
    #[test]
    fn doctor_tree_report_json() {
        let Some(dir) = std::env::var_os("ASTRYX_RS_TREE_DIR") else { return };
        let dir = dir.to_string_lossy().to_string();
        std::env::set_current_dir(&dir).unwrap();
        let (problems, (docs, sections, roots)) = super::doctor_tree_report(&dir).unwrap();
        println!("TREEJSON {}", serde_json::json!({"problems": problems, "counts": [docs, sections, roots]}));
    }

    #[test]
    fn package_readers_on_docsint() {
        let Some(dir) = std::env::var_os("ASTRYX_RS_DOCSINT") else { return };
        let dir = dir.to_string_lossy().to_string();
        std::env::set_current_dir(&dir).unwrap();
        let p = crate::discovery::project::Project::load(&dir).unwrap();
        for i in &p.loaded_integrations {
            let d = crate::discovery::docs_discovery::discover_integration_docs(i);
            let targets: Vec<_> = super::package_doc_targets(i, &d).into_iter().map(|t| (t.topic, t.relationship, t.target, t.kind, t.owner, t.guide, t.guides_below.len(), t.unplaced)).collect();
            println!("RS tree={:?}", super::doctor_tree_report(&dir));
            println!("RS c={:?}\nRS docs={:?}\nRS refs={:?}\nRS targets={:?}", super::package_component_link_problems(i, &d), super::package_docs_problems(i, &d), super::package_reference_problems(i, &d), targets);
        }
    }
}

/// What doctor's `docs-tree` check reads (`checkDocsTree`): the problems, in
/// its order, and `(docs, sections, roots)` for its pass message.
///
/// The CLI's own docs are checked when the model is generated (their link
/// problems, unadopted self-docs and typed edges are empty, or `doctor` in a
/// plain project would warn), so only what integrations add or change is
/// read here.
pub fn doctor_tree_report(cwd: &str) -> Result<(Vec<String>, (usize, usize, usize)), String> {
    let pm = crate::discovery::package_manager::doc_package_manager(Some(cwd));
    crate::discovery::doc_compiler::links::set_doc_pm(&pm);
    let variant = Variant::get(&pm);
    let catalog = discover(cwd).unwrap_or_else(DocsCatalog::from_builtins);
    let built = build(&variant, catalog.clone(), cwd);
    let mut problems: Vec<String> = built
        .tree
        .diagnostics
        .iter()
        .filter(|d| d.severity == "error")
        .map(|d| format!("{}: {}", if d.source.is_empty() { if d.provider.is_empty() { "docs tree".to_string() } else { d.provider.clone() } } else { d.source.clone() }, d.message))
        .collect();
    problems.extend(docs_link_problems(&built, &catalog, None, false));
    problems.extend(docs_link_problems(&built, &catalog, None, true));
    let nodes: Vec<_> = built.tree.nodes.iter().filter(|n| !built.tree.is_experimental(n)).collect();
    let namespaces = nodes.iter().filter(|n| n.kind == "namespace").count();
    Ok((problems, (nodes.len() - namespaces, namespaces, built.tree.roots().len())))
}
