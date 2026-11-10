//! Search's doc candidates in a project whose integrations change the docs
//! (`_gather-docs.mjs` over the project's catalog): topics an integration
//! adds, replaces or extends, namespaces and placed guides, and links that
//! now open another doc. Read at run time with the docs lane's project tree
//! and link resolver; every other project reads the compiled candidates.

use super::gather::{code_terms, headings, own_docs_hidden, plain_cell, section_prose, section_summary};
use crate::commands::docs::runtime;
use crate::discovery::doc_compiler::compile::{lower_topic, TopicSource};
use crate::discovery::doc_compiler::links::{link_blocks, link_fields};
use crate::discovery::doc_compiler::tree::{DocsTree, TreeNode, CLI_PROVIDER};
use crate::discovery::docs_discovery::{DocsCatalog, TopicEntry};
use crate::json::{Map, Value};
use std::collections::{HashMap, HashSet};

fn truthy(v: Option<&Value>) -> bool {
    v.is_some_and(super::cand::truthy)
}

fn js(v: &Value) -> String {
    super::cand::js_str(v)
}

/// `holdsOwnName(tree, catalog, entry)`.
fn holds_own_name(tree: &DocsTree, catalog: &DocsCatalog, e: &TopicEntry) -> bool {
    let node = tree.get(&e.name).or_else(|| tree.get_folded(&e.name));
    let owner = match node {
        Some(n) => match &n.flat_topic {
            None => return false,
            Some(flat) => catalog.resolve(flat),
        },
        None => catalog.resolve(&e.name),
    };
    owner.is_some_and(|o| o.name == e.name && o.package == e.package)
}

/// A topic's files, lowered and linked: the doc and each section's provider.
struct Linked {
    doc: Value,
    providers: Map<String, Value>,
}

fn load_doc(path: &str) -> Option<Value> {
    let f = crate::discovery::doc_read::load_topic_file(path, None);
    f.doc.and_then(|d| runtime::json_plain(&d))
}

fn lower_and_link(
    name: &str,
    provider_id: &str,
    path: &str,
    extensions: &[(String, String)],
    resolver: &runtime::LinkResolver,
) -> Option<Linked> {
    let base = TopicSource { provider_id: provider_id.to_string(), doc: load_doc(path)?, overlay: None };
    let exts: Vec<TopicSource> = extensions
        .iter()
        .filter_map(|(pid, p)| load_doc(p).map(|d| TopicSource { provider_id: pid.clone(), doc: d, overlay: None }))
        .collect();
    let lowered = lower_topic(name, &base, &exts).ok()?;
    let mut sections = Vec::new();
    for sec in lowered.doc["sections"].as_array().cloned().unwrap_or_default() {
        let id = sec.get("id").map(js).unwrap_or_default();
        let pid = lowered
            .section_providers
            .get(&id)
            .and_then(|x| x.as_str())
            .and_then(norm_opt)
            .unwrap_or_else(|| provider_id.to_string());
        let mut resolve = |t: &str| resolver.resolve(t, &pid);
        let (content, _) =
            link_blocks(sec["content"].as_array().map(|a| a.as_slice()).unwrap_or(&[]), &mut resolve, Some(&id), None);
        let mut m = sec.as_object().cloned().unwrap_or_default();
        m.insert("content".into(), Value::Array(content));
        sections.push(Value::Object(m));
    }
    let mut fields = Map::new();
    for k in ["description", "summary"] {
        if let Some(d) = lowered.doc.get(k).filter(|d| d.is_string()) {
            fields.insert(k.into(), d.clone());
        }
    }
    let mut resolve = |t: &str| resolver.resolve(t, provider_id);
    let (linked_fields, _) = link_fields(&Value::Object(fields), &mut resolve);
    let mut doc = lowered.doc.as_object().cloned().unwrap_or_default();
    for (k, v) in linked_fields.as_object().cloned().unwrap_or_default() {
        doc.insert(k, v);
    }
    doc.insert("sections".into(), Value::Array(sections));
    Some(Linked { doc: Value::Object(doc), providers: lowered.section_providers })
}

/// `topicCandidates(name, doc, title, summary, path, parent, pkg, sectionPackage)`.
#[allow(clippy::too_many_arguments)]
fn topic_candidates(
    name: &str,
    doc: Option<&Value>,
    title: Option<&str>,
    summary: &str,
    path: Option<&str>,
    parent: Option<&str>,
    pkg: Option<&str>,
    section_package: &dyn Fn(&str) -> Option<String>,
) -> Vec<Value> {
    let null = Value::Null;
    let d = doc.unwrap_or(&null);
    let sections: Vec<Value> = d.get("sections").and_then(|s| s.as_array()).cloned().unwrap_or_default();
    let doc_title_field = d.get("title").filter(|t| super::cand::truthy(t)).map(js);
    let title_or = doc_title_field.clone().or_else(|| title.filter(|t| !t.is_empty()).map(String::from));
    let doc_title =
        path.filter(|p| !p.is_empty()).map(String::from).or_else(|| title_or.clone()).unwrap_or_else(|| name.to_string());
    let split = sections.len() > 1;
    let leaf = &name[name.rfind('/').map_or(0, |i| i + 1)..];
    let mut keywords: Vec<Value> = Vec::new();
    if leaf != name {
        keywords.push(Value::String(leaf.replace('-', " ")));
    }
    if let Some(t) = &title_or {
        keywords.push(Value::String(t.clone()));
    }
    let declared = match d.get("keywords") {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    };
    keywords.extend(declared.iter().cloned());
    let description = match d.get("description").filter(|x| super::cand::truthy(x)) {
        Some(x) => x.clone(),
        None => Value::String(summary.to_string()),
    };
    let prose: Vec<Value> = if split {
        sections.iter().filter(|s| super::cand::truthy(&s["title"])).map(|s| s["title"].clone()).collect()
    } else {
        sections.iter().flat_map(section_prose).map(Value::String).collect()
    };
    let mut titles: Vec<Value> = vec![Value::String(title_or.clone().unwrap_or_else(|| name.to_string()))];
    if !split {
        for s in &sections {
            titles.push(s["title"].clone());
            titles.extend(headings(s).into_iter().map(Value::String));
        }
    }
    titles.retain(super::cand::truthy);
    let mut m = Map::new();
    m.insert("domain".into(), "doc".into());
    m.insert("name".into(), Value::String(name.into()));
    m.insert("keywords".into(), Value::Array(keywords));
    m.insert("_declared".into(), Value::Array(declared));
    m.insert("description".into(), description);
    m.insert("prose".into(), Value::Array(prose));
    m.insert("titles".into(), Value::Array(titles));
    m.insert("_topic".into(), Value::String(name.into()));
    m.insert("_title".into(), Value::String(doc_title.clone()));
    m.insert(
        "_command".into(),
        Value::String(if split { format!("astryx docs {name} --index") } else { format!("astryx docs {name}") }),
    );
    if let Some(p) = parent.filter(|p| !p.is_empty()) {
        m.insert("_parent".into(), Value::String(p.into()));
    }
    if let Some(p) = pkg.filter(|p| !p.is_empty()) {
        m.insert("_package".into(), Value::String(p.into()));
    }
    let mut out = vec![Value::Object(m)];
    if !split {
        return out;
    }
    for s in &sections {
        let key = s.get("id").map(js).unwrap_or_default();
        let st = js(&s["title"]);
        let mut kw: Vec<Value> = Vec::new();
        if super::cand::truthy(&s["title"]) {
            kw.push(s["title"].clone());
        }
        kw.extend(headings(s).into_iter().map(Value::String));
        kw.extend(code_terms(s).into_iter().map(Value::String));
        let mut titles: Vec<Value> = vec![s["title"].clone()];
        titles.extend(headings(s).into_iter().map(Value::String));
        titles.retain(super::cand::truthy);
        let mut m = Map::new();
        m.insert("domain".into(), "doc".into());
        m.insert("name".into(), Value::String(key.clone()));
        m.insert("keywords".into(), Value::Array(kw));
        m.insert("description".into(), Value::String(section_summary(s)));
        m.insert("prose".into(), Value::Array(section_prose(s).into_iter().map(Value::String).collect()));
        m.insert("titles".into(), Value::Array(titles));
        m.insert("_topic".into(), Value::String(name.into()));
        m.insert("_section".into(), Value::String(key.clone()));
        m.insert("_title".into(), Value::String(format!("{doc_title} › {st}")));
        m.insert("_command".into(), Value::String(format!("astryx docs {name} {key}")));
        m.insert("_parent".into(), Value::String(format!("astryx docs {name} --index")));
        if let Some(p) = section_package(&key).or_else(|| pkg.map(String::from)).filter(|p| !p.is_empty()) {
            m.insert("_package".into(), Value::String(p));
        }
        out.push(Value::Object(m));
    }
    out
}

fn is_experimental(doc: &Value) -> bool {
    doc.get("stability").and_then(|s| s.as_str()) == Some("experimental")
}

fn without_hidden(mut doc: Value, hidden: &HashSet<String>) -> Value {
    if hidden.is_empty() {
        return doc;
    }
    if let Some(Value::Array(sections)) = doc.get_mut("sections") {
        sections.retain(|s| !s.get("id").and_then(|i| i.as_str()).is_some_and(|i| hidden.contains(i)));
    }
    doc
}

fn package_of(map: &[(String, String)], providers: &Map<String, Value>, key: &str) -> Option<String> {
    let p = providers.get(key).and_then(|x| x.as_str())?;
    let p = norm_opt(p)?;
    map.iter().rev().find(|(k, _)| *k == p).map(|(_, v)| v.clone())
}

fn norm(id: &str) -> String {
    norm_opt(id).unwrap_or_else(|| id.to_string())
}

fn ancestors_path(tree: &DocsTree, node: &TreeNode) -> Vec<String> {
    tree.ancestors(node).into_iter().map(|a| a.title.clone()).collect()
}

/// The doc candidates of a project whose integrations change its docs, or
/// None when they change nothing (the compiled candidates are exact then).
pub fn project_docs(cwd: &str, pm: &str, force: bool) -> Option<Vec<Value>> {
    let catalog = match runtime::discover(cwd) {
        Some(c) => c,
        None if force => crate::discovery::project::Project::load(cwd).ok()?.docs(),
        None => return None,
    };
    crate::discovery::doc_compiler::links::set_doc_pm(pm);
    let variant = crate::commands::docs::model::Variant::get(pm);
    let resolver = runtime::link_resolver(cwd);
    let built = runtime::build(&variant, catalog.clone(), cwd);
    let tree = &built.tree;
    let hidden: HashSet<String> = own_docs_hidden().into_iter().collect();
    let node_content: HashMap<String, Value> =
        built.nodes.iter().map(|n| (js(&n["route"]), n["content"].clone())).collect();
    let own = super::gather::own_docs(pm);
    let mut out: Vec<Value> = Vec::new();

    for e in catalog.entries() {
        if !holds_own_name(tree, &catalog, e) {
            continue;
        }
        let pid = e.provider_id.clone().unwrap_or_else(|| e.package.clone());
        let exts: Vec<(String, String)> = e
            .extensions
            .iter()
            .map(|x| (x.provider_id.clone().unwrap_or_else(|| x.package.clone()), x.path.clone()))
            .collect();
        let linked = lower_and_link(&e.name, &pid, &e.path, &exts, &resolver);
        if linked.as_ref().is_some_and(|l| is_experimental(&l.doc)) {
            continue;
        }
        let doc = linked.as_ref().map(|l| without_hidden(l.doc.clone(), &hidden));
        let home = tree.get(&e.name).filter(|n| n.flat_topic.as_deref() == Some(e.name.as_str()));
        let entry_title = e.title.as_ref().filter(|t| super::cand::truthy(t)).map(js);
        let path = home.map(|n| {
            let mut p = ancestors_path(tree, n);
            let own_title = doc
                .as_ref()
                .and_then(|d| d.get("title"))
                .filter(|t| super::cand::truthy(t))
                .map(js)
                .or_else(|| entry_title.clone())
                .unwrap_or_else(|| e.name.clone());
            p.push(own_title);
            p.join(" › ")
        });
        let parent = home.map(|n| format!("astryx docs {}", n.parent.clone().unwrap_or_default()));
        let mut packages: Vec<(String, String)> = vec![(norm(&pid), e.package.clone())];
        for x in &e.extensions {
            packages.push((norm(&x.provider_id.clone().unwrap_or_else(|| x.package.clone())), x.package.clone()));
        }
        let providers = linked.as_ref().map(|l| l.providers.clone()).unwrap_or_default();
        let sp = |key: &str| package_of(&packages, &providers, key).or_else(|| Some(e.package.clone()));
        out.extend(topic_candidates(
            &e.name,
            doc.as_ref(),
            entry_title.as_deref(),
            "",
            path.as_deref(),
            parent.as_deref(),
            Some(&e.package),
            &sp,
        ));
    }

    let cli_tree_dir = crate::cli::env::cli_root().join("assets").join("docs").join("tree");
    for node in &tree.nodes {
        if node.flat_topic.is_some() || tree.is_experimental(node) {
            continue;
        }
        let mut path = ancestors_path(tree, node);
        path.push(node.title.clone());
        let path = path.join(" › ");
        let parent_cmd = node.parent.as_ref().map(|p| format!("astryx docs {p}"));
        if node.kind == "generic" {
            // `guideEntry(node)`.
            let overlay = node.guide_overlay.clone().unwrap_or_default();
            let s = |v: &Value, k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
            let (package, pid, file) = match &overlay.replacement {
                Some(r) => (
                    s(r, "package"),
                    r.get("providerId").and_then(|x| x.as_str()).map(String::from).unwrap_or_else(|| s(r, "package")),
                    s(r, "path"),
                ),
                None => {
                    let Some(f) = node.topic_file.clone() else { continue };
                    let f = if node.provider == CLI_PROVIDER && !f.contains('/') {
                        cli_tree_dir.join(&f).to_string_lossy().to_string()
                    } else {
                        f
                    };
                    (node.provider.clone(), node.provider_id.clone(), f)
                }
            };
            let exts: Vec<(String, String)> = overlay
                .extensions
                .iter()
                .map(|x| (x.get("providerId").and_then(|v| v.as_str()).map(String::from).unwrap_or_else(|| s(x, "package")), s(x, "path")))
                .collect();
            let linked = lower_and_link(&node.route, &pid, &file, &exts, &resolver);
            let mut packages: Vec<(String, String)> = vec![(norm(&pid), package.clone())];
            for x in &overlay.extensions {
                let xp = x.get("providerId").and_then(|v| v.as_str()).map(String::from).unwrap_or_else(|| s(x, "package"));
                packages.push((norm(&xp), s(x, "package")));
            }
            let providers = linked.as_ref().map(|l| l.providers.clone()).unwrap_or_default();
            let sp = |key: &str| package_of(&packages, &providers, key).or_else(|| Some(package.clone()));
            let doc = linked.map(|l| l.doc);
            out.extend(topic_candidates(
                &node.route,
                doc.as_ref(),
                Some(&node.title),
                &raw_summary(node, &own),
                Some(&path),
                parent_cmd.as_deref(),
                Some(&package),
                &sp,
            ));
            continue;
        }
        // A typed doc: the CLI's own are compiled; an integration's is read.
        if node.provider == CLI_PROVIDER {
            out.extend(own.iter().filter(|c| c["_topic"] == node.route.as_str() && c.get("_section").is_none()).cloned());
            continue;
        }
        let content = node_content.get(&node.route).cloned().unwrap_or(Value::Array(vec![]));
        let self_kw: Vec<Value> = node
            .self_doc
            .as_ref()
            .and_then(|d| d.get("keywords"))
            .and_then(|k| k.as_array())
            .cloned()
            .unwrap_or_default();
        let mut defined: Vec<Value> = Vec::new();
        for b in content.as_array().into_iter().flatten() {
            if b["type"] != "table" || !b["rows"].is_array() {
                continue;
            }
            for row in b["rows"].as_array().unwrap() {
                if let Some(c) = row.get(0).filter(|c| !c.is_null()) {
                    defined.push(Value::String(plain_cell(c)));
                }
            }
        }
        let part = serde_json::json!({ "content": content });
        let mut keywords = vec![Value::String(node.route[node.route.rfind('/').map_or(0, |i| i + 1)..].to_string())];
        keywords.extend(self_kw.iter().cloned());
        keywords.extend(defined);
        keywords.extend(code_terms(&part).into_iter().map(Value::String));
        let section = serde_json::json!({ "title": node.title, "content": content });
        let mut m = Map::new();
        m.insert("domain".into(), "doc".into());
        m.insert("name".into(), Value::String(node.name.clone()));
        m.insert("keywords".into(), Value::Array(keywords));
        m.insert("_declared".into(), Value::Array(self_kw));
        m.insert("description".into(), Value::String(raw_summary(node, &own)));
        m.insert("prose".into(), Value::Array(section_prose(&section).into_iter().map(Value::String).collect()));
        m.insert("titles".into(), Value::Array(vec![Value::String(node.title.clone())]));
        m.insert("_topic".into(), Value::String(node.route.clone()));
        m.insert("_title".into(), Value::String(path));
        m.insert("_command".into(), Value::String(format!("astryx docs {}", node.route)));
        m.insert("_parent".into(), Value::String(parent_cmd.unwrap_or_else(|| "astryx docs".into())));
        m.insert("_package".into(), Value::String(node.provider.clone()));
        out.push(Value::Object(m));
    }
    let _ = truthy;
    Some(out)
}

/// A node's summary as the docs tree reads it, before its links render: the
/// doc's own `summary`, else the compiled candidate's, else the tree's.
fn raw_summary(node: &TreeNode, own: &[Value]) -> String {
    if let Some(s) = node.self_doc.as_ref().and_then(|d| d.get("summary")).and_then(|s| s.as_str()) {
        return s.to_string();
    }
    if node.provider == CLI_PROVIDER && node.guide_overlay.is_none() {
        if let Some(c) = own.iter().find(|c| c["_topic"] == node.route.as_str() && c.get("_section").is_none()) {
            if let Some(d) = c.get("description").and_then(|d| d.as_str()) {
                return d.to_string();
            }
        }
    }
    node.summary.clone()
}

fn norm_opt(id: &str) -> Option<String> {
    crate::discovery::integrations::normalize_provider_id(id).ok()
}
