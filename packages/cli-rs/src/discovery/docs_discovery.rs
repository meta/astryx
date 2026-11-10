//! Port of `foundation/discovery/docs-discovery.mjs`: the CLI's own topics,
//! the topics integrations contribute, topic checks, `mergeTopic`, and the
//! `DocsCatalog`; plus `Project.docs()`.

use super::docmod;
use super::docs_section_key::{self as dsk, PLACED_AFTER};
use super::doctypes;
use super::integrations::{self as integ, Record};
use super::nodepath as np;
use super::paths;
use super::project::Project;
use crate::json::{Map, Value};

/// Owner package of the built-in topics (`CLI_PROVIDER_ID`).
pub const BUILTIN_DOCS_PACKAGE: &str = "@astryxdesign/cli";

fn builtin_docs_dir() -> String {
    np::join(&[paths::cli_root(), "assets", "docs"])
}

fn is_topic_file(name: &str) -> Option<String> {
    let stem = name.strip_suffix(".doc.mjs")?;
    if !stem.is_empty() && stem.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        Some(stem.to_string())
    } else {
        None
    }
}

/// `discoverBuiltinTopics()`: `(topic, file)` in listing order.
pub fn discover_builtin_topics() -> Vec<(String, String)> {
    let dir = builtin_docs_dir();
    let mut out = Vec::new();
    for f in np::list_dir(&dir).unwrap_or_default() {
        if let Some(t) = is_topic_file(&f) {
            // Object keys: a later file with the same topic would overwrite.
            if let Some(slot) = out.iter_mut().find(|(n, _): &&mut (String, String)| *n == t) {
                slot.1 = np::join2(&dir, &f);
            } else {
                out.push((t, np::join2(&dir, &f)));
            }
        }
    }
    out
}

/// `builtinGuideFiles()`.
pub fn builtin_guide_files() -> Vec<String> {
    let mut files: Vec<String> = discover_builtin_topics().into_iter().map(|t| t.1).collect();
    let tree = np::join2(&builtin_docs_dir(), "tree");
    if let Some(mut names) = np::list_dir(&tree) {
        super::jsort::sort_strings(&mut names);
        for f in names {
            if is_topic_file(&f).is_some() {
                files.push(np::join2(&tree, &f));
            }
        }
    }
    files
}

/// `loadTopicModule(file)`: the authored doc value.
pub fn load_topic_module(file: &str) -> Result<Value, String> {
    let ns = docmod::import_doc_module(file).map_err(|e| e.message)?;
    match docmod::first_export(&ns, &["docs", "default"]) {
        Some(v) if !docmod::is_nullish(Some(v)) => Ok(v.clone()),
        _ => Err(format!("{} exports no doc. A topic exports `docs` (or a default export).", np::basename(file))),
    }
}

fn is_nullish(v: Option<&Value>) -> bool {
    docmod::is_nullish(v)
}

fn js(v: &Value) -> String {
    crate::json::stringify(v, 0)
}

fn json_or_undefined(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(x) if docmod::is_undefined(Some(x)) => "undefined".into(),
        Some(x) => js(x),
    }
}

fn non_empty_str(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::String(s)) if !s.is_empty())
}

const BLOCK_KINDS: [&str; 7] = ["prose", "heading", "code", "table", "list", "token-ref", "reference"];

fn block_fields(t: &str) -> &'static [&'static str] {
    match t {
        "prose" => &["text"],
        "heading" => &["level", "text"],
        "code" => &["lang", "code"],
        "table" => &["headers", "rows"],
        "list" => &["style", "items"],
        "token-ref" => &["topic", "section"],
        "reference" => &["target"],
        _ => &[],
    }
}

fn optional_block_fields(t: &str) -> &'static [&'static str] {
    match t {
        "code" => &["label"],
        "reference" => &["projection", "presentation"],
        _ => &[],
    }
}

/// `problemsInTopic(doc, {placement})`.
pub fn problems_in_topic(doc: &Value, placement: bool) -> Vec<String> {
    if doc.get("type").and_then(|t| t.as_str()) == Some("namespace") {
        return vec![format!(
            "\"{}\" is a namespace doc, which the docs tree reads, not the topic list. The CLI keeps its own in assets/docs/tree; an integration ships its namespace docs in its docs directory.",
            paths::js_string(doc.get("name"))
        )];
    }
    let mut problems = Vec::new();
    for f in ["name", "title", "description"] {
        if !non_empty_str(doc.get(f)) {
            problems.push(format!("{f}: expected a non-empty string"));
        }
    }
    if let Some(Value::String(n)) = doc.get("name") {
        if n.is_empty() || !n.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
            problems.push(format!(
                "name: \"{n}\" is not URL-safe. A topic name is its CLI argument and its docsite path, so it may hold only letters, digits, \"_\" and \"-\"."
            ));
        }
    }
    for f in ["placement", "aliases", "audience"] {
        if f == "placement" && placement {
            continue;
        }
        if !is_nullish(doc.get(f)) {
            problems.push(format!("{f}: requires the compiled graph reader and is not supported by legacy topic readers"));
        }
    }
    let Some(Value::Array(sections)) = doc.get("sections").filter(|s| s.as_array().map(|a| !a.is_empty()).unwrap_or(false)) else {
        problems.push("sections: expected at least one section".into());
        return problems;
    };
    for (s, section) in sections.iter().enumerate() {
        let at = format!("sections[{s}]");
        if !non_empty_str(section.get("title")) {
            problems.push(format!("{at}.title: expected a non-empty string"));
        }
        if let Value::Object(m) = section {
            for k in m.keys() {
                if k.starts_with('\u{1}') {
                    continue;
                }
                if !["id", "title", "category", "content", "previewType", "before", "after"].contains(&k.as_str()) {
                    problems.push(format!("{at}.{k}: not a field of a section"));
                }
            }
        }
        for f in ["before", "after"] {
            let v = section.get(f);
            if !is_nullish(v) && !non_empty_str(v) {
                problems.push(format!("{at}.{f}: expected the key of a section, as `--index` shows it"));
            }
        }
        if !is_nullish(section.get("before")) && !is_nullish(section.get("after")) {
            problems.push(format!("{at}: sets both `before` and `after`; a section goes in one place"));
        }
        let Some(Value::Array(content)) = section.get("content") else {
            problems.push(format!("{at}.content: expected an array of blocks"));
            continue;
        };
        for (b, block) in content.iter().enumerate() {
            let block_at = format!("{at}.content[{b}]");
            let t = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
            let typ = block.get("type");
            if !BLOCK_KINDS.contains(&t) || !matches!(typ, Some(Value::String(_))) {
                if t == "workflow" || t == "collection" {
                    problems.push(format!(
                        "{block_at}.type: {} requires the compiled graph renderer and is not supported by legacy topic readers",
                        js(typ.unwrap())
                    ));
                } else {
                    problems.push(format!("{block_at}.type: {} is not one of {}", json_or_undefined(typ), BLOCK_KINDS.join(", ")));
                }
                continue;
            }
            for f in block_fields(t) {
                match block.get(*f) {
                    v if is_nullish(v) => problems.push(format!("{block_at}.{f}: required for a {t} block")),
                    Some(Value::String(s)) if s.trim_matches(paths::js_ws).is_empty() => {
                        problems.push(format!("{block_at}.{f}: expected a non-empty string"))
                    }
                    Some(Value::Array(a)) if a.is_empty() => problems.push(format!("{block_at}.{f}: expected a non-empty array")),
                    _ => {}
                }
            }
            let allowed_values: Vec<(&str, Vec<Value>)> = match t {
                "heading" => vec![("level", vec![Value::from(3), Value::from(4), Value::from(5), Value::from(6)])],
                "list" => vec![("style", ["ordered", "unordered", "do", "dont"].iter().map(|s| Value::from(*s)).collect())],
                "reference" => vec![("presentation", ["summary", "compact", "full"].iter().map(|s| Value::from(*s)).collect())],
                _ => vec![],
            };
            for (f, values) in allowed_values {
                let v = block.get(f);
                if !is_nullish(v) && !values.iter().any(|x| Some(x) == v || (x.is_number() && v.and_then(|y| y.as_f64()) == x.as_f64())) {
                    let list: Vec<String> = values.iter().map(|x| paths::js_string(Some(x))).collect();
                    problems.push(format!("{block_at}.{f}: {} is not one of {}", js(v.unwrap()), list.join(", ")));
                }
            }
            if t == "table" {
                if let (Some(Value::Array(h)), Some(Value::Array(rows))) = (block.get("headers"), block.get("rows")) {
                    for (r, row) in rows.iter().enumerate() {
                        match row {
                            Value::Array(cells) if cells.len() != h.len() => problems.push(format!(
                                "{block_at}.rows[{r}]: has {} cells but the table has {} headers",
                                cells.len(),
                                h.len()
                            )),
                            Value::Array(_) => {}
                            _ => problems.push(format!("{block_at}.rows[{r}]: expected an array of cells")),
                        }
                    }
                }
            }
            if let Value::Object(m) = block {
                for k in m.keys() {
                    if k != "type" && !block_fields(t).contains(&k.as_str()) && !optional_block_fields(t).contains(&k.as_str()) {
                        problems.push(format!("{block_at}.{k}: not a field of a {t} block"));
                    }
                }
            }
            if t == "reference" && !is_nullish(block.get("projection")) {
                let p = block.get("projection").unwrap();
                match p {
                    Value::Object(pm) if super::zod::received(p) == "object" => {
                        for (k, names) in pm {
                            if k != "fields" && k != "sections" {
                                problems.push(format!("{block_at}.projection.{k}: not a field of a projection"));
                            } else {
                                let ok = matches!(names, Value::Array(a) if !a.is_empty() && a.iter().all(|n| matches!(n, Value::String(s) if !s.trim_matches(paths::js_ws).is_empty())));
                                if !ok {
                                    problems.push(format!("{block_at}.projection.{k}: expected a non-empty array of names"));
                                }
                            }
                        }
                    }
                    _ => problems.push(format!(
                        "{block_at}.projection: expected {{fields?, sections?}}, naming the parts of the doc to include"
                    )),
                }
            }
        }
    }
    problems.extend(dsk::section_key_errors(sections));
    problems
}

/// `problemsInNamespace(doc)`.
pub fn problems_in_namespace(doc: &Value) -> Vec<String> {
    let mut problems = Vec::new();
    for f in ["name", "title", "summary"] {
        if !non_empty_str(doc.get(f)) {
            problems.push(format!("{f}: expected a non-empty string"));
        }
    }
    let slots = doc.get("slots");
    let Some(Value::Object(sm)) = slots.filter(|s| !is_nullish(Some(s))) else {
        problems.push("slots: expected at least one slot".into());
        return problems;
    };
    if sm.is_empty() {
        problems.push("slots: expected at least one slot".into());
        return problems;
    }
    for (name, slot) in sm {
        if !non_empty_str(slot.get("title")) {
            problems.push(format!("slots.{name}.title: expected a non-empty string"));
        }
        let ok = matches!(slot.get("accepts").and_then(|a| a.get("kinds")), Some(Value::Array(a)) if !a.is_empty());
        if !ok {
            problems.push(format!("slots.{name}.accepts.kinds: expected at least one kind"));
        }
    }
    problems
}

/// A doc file discovered under a docs root (`DocsTopicRecord`).
#[derive(Debug, Clone, PartialEq)]
pub struct TopicRecord {
    pub name: String,
    pub package: String,
    pub provider_id: Option<String>,
    pub path: String,
    pub title: Option<Value>,
    pub description: Option<Value>,
    pub category: Option<Value>,
    pub replaces: Option<String>,
    pub extends_topic: Option<String>,
}

/// A namespace or placed guide for the docs tree (`TreeNamespaceInput` /
/// `TreeDocInput`), as JSON with the JS field names; `rank` is set by
/// `Project.docs()`.
pub type TreeInput = Map<String, Value>;

/// `discoverIntegrationDocs(integration)` result.
#[derive(Debug, Clone, Default)]
pub struct IntegrationDocs {
    pub records: Vec<TopicRecord>,
    pub errors: Vec<String>,
    pub namespaces: Vec<TreeInput>,
    pub guides: Vec<TreeInput>,
}

fn opt_string(v: Option<&Value>) -> Option<String> {
    match v {
        v if is_nullish(v) => None,
        Some(x) => Some(paths::js_string(Some(x))),
        None => None,
    }
}

/// `discoverIntegrationDocs(integration)`.
pub fn discover_integration_docs(integration: &Record) -> IntegrationDocs {
    let mut out = IntegrationDocs::default();
    let Some(docs_dir) = integ::s(integration, "docs").filter(|d| !d.is_empty() && np::is_dir(d)).map(String::from) else {
        return out;
    };
    let name = integ::s(integration, "name").unwrap_or("").to_string();
    let provider_id = integ::s(integration, "providerId").map(String::from).unwrap_or_else(|| name.clone());
    let mut files = Vec::new();
    fn scan(dir: &str, files: &mut Vec<String>) {
        for e in np::list_dir_entries(dir).unwrap_or_default() {
            if e.name == "node_modules" || e.name == "__tests__" {
                continue;
            }
            let full = np::join2(dir, &e.name);
            if e.is_dir {
                scan(&full, files);
            } else if [".doc.ts", ".doc.mjs", ".doc.js"].iter().any(|s| e.name.ends_with(s)) {
                files.push(full);
            }
        }
    }
    scan(&docs_dir, &mut files);
    super::jsort::sort_strings(&mut files);
    let mut seen: Vec<(String, String)> = Vec::new();
    for file in files {
        let rel = np::relative(&docs_dir, &file);
        let doc = load_topic_module(&file).and_then(|d| doctypes::parse_readable_doc(&d, &np::basename(&file)));
        let doc = match doc {
            Ok(d) => d,
            Err(e) => {
                out.errors.push(format!("{rel}: {e}"));
                continue;
            }
        };
        let source = format!("{name}/{rel}");
        let mk_base = |kind: &str| {
            let mut m = Map::new();
            m.insert("provider".into(), Value::String(name.clone()));
            m.insert("providerId".into(), Value::String(provider_id.clone()));
            m.insert("source".into(), Value::String(source.clone()));
            let _ = kind;
            m
        };
        if doc.get("type").and_then(|t| t.as_str()) == Some("namespace") {
            let problems = problems_in_namespace(&doc);
            if !problems.is_empty() {
                out.errors.push(format!(
                    "{rel} is not a usable namespace doc:\n{}",
                    problems.iter().map(|p| format!("  {p}")).collect::<Vec<_>>().join("\n")
                ));
                continue;
            }
            let mut m = mk_base("namespace");
            m.insert("doc".into(), doc);
            out.namespaces.push(m);
            continue;
        }
        let placed = !is_nullish(doc.get("placement"));
        let problems = problems_in_topic(&doc, placed);
        if !problems.is_empty() {
            out.errors.push(format!(
                "{rel} is not a usable topic:\n{}",
                problems.iter().map(|p| format!("  {p}")).collect::<Vec<_>>().join("\n")
            ));
            continue;
        }
        let tname = paths::js_string(doc.get("name"));
        let key = tname.to_lowercase();
        if let Some((_, prev)) = seen.iter().find(|(k, _)| *k == key) {
            out.errors.push(format!(
                "{rel} and {prev} both define the topic \"{tname}\". Each topic name is a URL and a CLI argument, so they have to be unique."
            ));
            continue;
        }
        seen.push((key, rel.clone()));
        let replaces = doc.get("replaces").filter(|v| !is_nullish(Some(v)));
        let extends = doc.get("extends").filter(|v| !is_nullish(Some(v)));
        if placed {
            if replaces.is_some() || extends.is_some() {
                out.errors.push(format!(
                    "{rel} is placed in the docs tree and also declares `{}`. A placed guide has its own route; only a flat topic takes over or extends another.",
                    if replaces.is_some() { "replaces" } else { "extends" }
                ));
                continue;
            }
            let mut m = mk_base("guide");
            m.insert("kind".into(), Value::String("generic".into()));
            m.insert("name".into(), doc.get("name").cloned().unwrap_or(Value::Null));
            m.insert("title".into(), doc.get("title").cloned().unwrap_or(Value::Null));
            m.insert("summary".into(), doc.get("description").cloned().unwrap_or(Value::Null));
            m.insert("group".into(), Value::Null);
            m.insert("placement".into(), doc.get("placement").cloned().unwrap_or(Value::Null));
            m.insert("ref".into(), serde_json::json!({"topicFile": file}));
            out.guides.push(m);
            continue;
        }
        if replaces.is_some() && extends.is_some() {
            out.errors.push(format!(
                "{rel} declares both `replaces` and `extends`. A topic either takes another's place or merges onto it."
            ));
            continue;
        }
        out.records.push(TopicRecord {
            name: tname,
            package: name.clone(),
            provider_id: if provider_id == name { None } else { Some(provider_id.clone()) },
            path: file,
            title: doc.get("title").cloned(),
            description: doc.get("description").cloned(),
            category: Some(doc.get("category").filter(|v| !is_nullish(Some(v))).cloned().unwrap_or(Value::Null)),
            replaces: opt_string(replaces),
            extends_topic: opt_string(extends),
        });
    }
    out
}

// ── mergeTopic ─────────────────────────────────────────────────────────────

/// `withoutPosition(section)`.
pub fn without_position(section: &Value) -> Value {
    if is_nullish(section.get("before")) && is_nullish(section.get("after")) {
        return section.clone();
    }
    let mut m = section.as_object().cloned().unwrap_or_default();
    m.shift_remove("before");
    m.shift_remove("after");
    Value::Object(m)
}

fn find_merge_target(sections: &[Value], section: &Value) -> Option<usize> {
    let title = dsk::source_title(section);
    let key = dsk::section_key(section);
    let by_key = || sections.iter().position(|c| dsk::section_key(c) == key);
    let legacy = || sections.iter().position(|c| is_nullish(c.get("id")) && dsk::source_title(c) == title);
    if !is_nullish(section.get("id")) {
        return by_key().or_else(legacy);
    }
    if let Some(l) = legacy() {
        return Some(l);
    }
    if let Some(s) = sections.iter().position(|c| dsk::source_title(c) == title) {
        return Some(s);
    }
    sections.iter().position(|c| c.get("id").and_then(|v| v.as_str()) == Some(key.as_str()))
}

/// An unplaced `before`/`after` (`mergeTopicReport` result entry).
#[derive(Debug, Clone, PartialEq)]
pub struct Unplaced {
    pub section: String,
    pub field: &'static str,
    pub key: String,
}

/// `mergeTopicReport(base, overlay)`.
pub fn merge_topic_report(base: &Value, overlay: &Value) -> (Value, Vec<Unplaced>) {
    let mut sections: Vec<Value> = base.get("sections").and_then(|s| s.as_array()).cloned().unwrap_or_default();
    let mut unplaced = Vec::new();
    for authored in overlay.get("sections").and_then(|s| s.as_array()).cloned().unwrap_or_default() {
        let mut section = without_position(&authored);
        match find_merge_target(&sections, &section) {
            None => {
                let field = if !is_nullish(authored.get("before")) { "before" } else { "after" };
                let Some(Value::String(key)) = authored.get(field).cloned() else {
                    sections.push(section);
                    continue;
                };
                let anchor = sections.iter().position(|c| dsk::section_key(c) == key || c.get("id").and_then(|v| v.as_str()) == Some(key.as_str()));
                match anchor {
                    None => {
                        unplaced.push(Unplaced { section: dsk::section_key(&section), field, key });
                        sections.push(section);
                    }
                    Some(a) if field == "before" => {
                        if let Some(pa) = sections[a].get(PLACED_AFTER).cloned() {
                            section.as_object_mut().unwrap().insert(PLACED_AFTER.into(), pa);
                        }
                        sections.insert(a, section);
                    }
                    Some(a) => {
                        let mut group = vec![key.clone()];
                        let mut at = a + 1;
                        while at < sections.len()
                            && sections[at].get(PLACED_AFTER).and_then(|v| v.as_str()).map(|p| group.iter().any(|g| g == p)).unwrap_or(false)
                        {
                            group.push(dsk::section_key(&sections[at]));
                            at += 1;
                        }
                        section.as_object_mut().unwrap().insert(PLACED_AFTER.into(), Value::String(key));
                        sections.insert(at, section);
                    }
                }
            }
            Some(at) => {
                let replaced = sections[at].clone();
                let replacing = if is_nullish(section.get("id")) && !is_nullish(replaced.get("id")) {
                    let st = dsk::source_title(&section);
                    let mut m = dsk::spread(section.as_object().unwrap());
                    m.insert("id".into(), replaced["id"].clone());
                    Value::Object(dsk::with_source_title(m, st.as_ref()))
                } else {
                    section.clone()
                };
                if let Some(pa) = replaced.get(PLACED_AFTER).cloned() {
                    let mut placed = if replacing == section {
                        // withoutPosition({...section}) keeps the marks it copies back.
                        let mut m = dsk::spread(section.as_object().unwrap());
                        m.shift_remove("before");
                        m.shift_remove("after");
                        for (k, v) in section.as_object().unwrap() {
                            if k.starts_with('\u{1}') && !m.contains_key(k) {
                                m.insert(k.clone(), v.clone());
                            }
                        }
                        Value::Object(m)
                    } else {
                        replacing
                    };
                    if let Value::Object(pm) = &mut placed {
                        for (k, v) in section.as_object().unwrap() {
                            if k.starts_with('\u{1}') && !pm.contains_key(k) {
                                pm.insert(k.clone(), v.clone());
                            }
                        }
                        pm.insert(PLACED_AFTER.into(), pa);
                    }
                    sections[at] = placed;
                } else {
                    sections[at] = replacing;
                }
            }
        }
    }
    let mut d = base.as_object().cloned().unwrap_or_default();
    d.insert("sections".into(), Value::Array(sections));
    (Value::Object(d), unplaced)
}

/// `mergeTopic(base, overlay)`.
pub fn merge_topic(base: &Value, overlay: &Value) -> Value {
    merge_topic_report(base, overlay).0
}

// ── DocsCatalog ────────────────────────────────────────────────────────────

/// An extension overlay on a topic.
#[derive(Debug, Clone, PartialEq)]
pub struct Extension {
    pub package: String,
    pub path: String,
    pub provider_id: Option<String>,
}

/// A resolved catalog topic (`DocsTopicEntry`).
#[derive(Debug, Clone, PartialEq)]
pub struct TopicEntry {
    pub name: String,
    pub package: String,
    pub provider_id: Option<String>,
    pub path: String,
    pub title: Option<Value>,
    pub description: Option<Value>,
    pub category: Option<Value>,
    pub replaces: Option<String>,
    pub replaced_package: Option<String>,
    pub extensions: Vec<Extension>,
    pub parent: Option<String>,
    pub route: Option<String>,
    pub tree: bool,
}

/// What integrations do to one tree guide (`GuideOverlay`).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct GuideOverlay {
    pub replacement: Option<TopicRecord>,
    pub extensions: Vec<Extension>,
    pub replaced_package: Option<String>,
}

/// A catalog issue (`{code, severity, message}`).
#[derive(Debug, Clone, PartialEq)]
pub struct CatalogIssue {
    pub code: &'static str,
    pub severity: &'static str,
    pub message: String,
}

/// The tree inputs one integration adds (`addTreeInputs`).
#[derive(Debug, Clone, Default)]
pub struct TreeInputs {
    pub namespaces: Vec<TreeInput>,
    pub guides: Vec<TreeInput>,
}

/// `DocsCatalog`.
#[derive(Debug, Clone, Default)]
pub struct DocsCatalog {
    /// In insertion order, keyed by lowercase name.
    topics: Vec<(String, TopicEntry)>,
    aliases: Vec<(String, String)>,
    pub tree_inputs: Vec<TreeInputs>,
    /// `catalog.issues` (`{package, message}`).
    pub issues: Vec<(String, String)>,
    guide_overlays: Vec<(String, GuideOverlay)>,
    pub guide_targeters: Vec<TopicRecord>,
}

impl DocsCatalog {
    /// `DocsCatalog.fromBuiltins()`.
    pub fn from_builtins() -> DocsCatalog {
        let mut c = DocsCatalog::default();
        for (name, file) in discover_builtin_topics() {
            c.topics.push((
                name.to_lowercase(),
                TopicEntry {
                    name,
                    package: BUILTIN_DOCS_PACKAGE.into(),
                    provider_id: None,
                    path: file,
                    title: None,
                    description: None,
                    category: None,
                    replaces: None,
                    replaced_package: None,
                    extensions: vec![],
                    parent: None,
                    route: None,
                    tree: false,
                },
            ));
        }
        c
    }

    fn target_guide(&mut self, record: &TopicRecord) {
        let route = record.replaces.clone().or_else(|| record.extends_topic.clone()).unwrap();
        let key = route.to_lowercase();
        let idx = match self.guide_overlays.iter().position(|(k, _)| *k == key) {
            Some(i) => i,
            None => {
                self.guide_overlays.push((key, GuideOverlay::default()));
                self.guide_overlays.len() - 1
            }
        };
        let overlay = &mut self.guide_overlays[idx].1;
        if record.replaces.is_some() {
            if let Some(earlier) = &overlay.replacement {
                overlay.replaced_package = Some(earlier.package.clone());
            }
            overlay.replacement = Some(record.clone());
            overlay.extensions.clear();
        } else {
            overlay.extensions.push(Extension { package: record.package.clone(), path: record.path.clone(), provider_id: record.provider_id.clone() });
        }
        self.guide_targeters.push(record.clone());
    }

    /// `catalog.guideOverlay(route)`.
    pub fn guide_overlay(&self, route: &str) -> Option<&GuideOverlay> {
        let k = route.to_lowercase();
        self.guide_overlays.iter().find(|(r, _)| *r == k).map(|(_, o)| o)
    }

    /// `catalog.addIssue({package, message})`.
    pub fn add_issue(&mut self, package: String, message: String) {
        self.issues.push((package, message));
    }

    /// `catalog.addTreeInputs(inputs)`.
    pub fn add_tree_inputs(&mut self, inputs: TreeInputs) {
        if !inputs.namespaces.is_empty() || !inputs.guides.is_empty() {
            self.tree_inputs.push(inputs);
        }
    }

    fn resolve_index(&self, name: &str) -> Option<usize> {
        let mut key = name.to_lowercase();
        for _ in 0..=self.aliases.len() {
            if let Some(i) = self.topics.iter().position(|(k, _)| *k == key) {
                return Some(i);
            }
            match self.aliases.iter().find(|(f, _)| *f == key) {
                Some((_, to)) => key = to.clone(),
                None => return None,
            }
        }
        None
    }

    /// `catalog.resolve(name)`.
    pub fn resolve(&self, name: &str) -> Option<&TopicEntry> {
        self.resolve_index(name).map(|i| &self.topics[i].1)
    }

    /// `catalog.add(record)`: an issue, or None.
    pub fn add(&mut self, record: &TopicRecord) -> Option<CatalogIssue> {
        if let Some(ext) = &record.extends_topic {
            let target = self.resolve_index(ext);
            if target.is_none() && ext.contains('/') {
                self.target_guide(record);
                return None;
            }
            let Some(t) = target else {
                return Some(CatalogIssue {
                    code: "invalid_doc",
                    severity: "error",
                    message: format!("\"{}\" extends \"{ext}\", which is not a topic in this project.", record.name),
                });
            };
            self.topics[t].1.extensions.push(Extension {
                package: record.package.clone(),
                path: record.path.clone(),
                provider_id: record.provider_id.clone(),
            });
            return None;
        }
        if let Some(rep) = &record.replaces {
            let target = self.resolve_index(rep);
            if target.is_none() && rep.contains('/') {
                self.target_guide(record);
                return None;
            }
            let Some(t) = target else {
                return Some(CatalogIssue {
                    code: "invalid_doc",
                    severity: "error",
                    message: format!("\"{}\" replaces \"{rep}\", which is not a topic in this project.", record.name),
                });
            };
            let target = self.topics[t].1.clone();
            let warning = if target.package != BUILTIN_DOCS_PACKAGE {
                Some(CatalogIssue {
                    code: "duplicate_doc",
                    severity: "warning",
                    message: format!(
                        "Topic \"{rep}\" is replaced by both {} and {}. {} is configured later, so it wins.",
                        target.package, record.package, record.package
                    ),
                })
            } else {
                None
            };
            let replaced_key = target.name.to_lowercase();
            let replacement_key = record.name.to_lowercase();
            let entry = TopicEntry {
                name: record.name.clone(),
                package: record.package.clone(),
                provider_id: record.provider_id.clone(),
                path: record.path.clone(),
                title: record.title.clone(),
                description: record.description.clone(),
                category: record.category.clone(),
                replaces: Some(target.name.clone()),
                replaced_package: Some(target.package.clone()),
                extensions: vec![],
                parent: None,
                route: None,
                tree: false,
            };
            // #replaceAt: rebuild in order; a later duplicate key is dropped
            // (Map.set on an existing key keeps the first position).
            let mut next: Vec<(String, TopicEntry)> = Vec::new();
            for (k, v) in std::mem::take(&mut self.topics) {
                let (nk, nv) = if k == replaced_key { (replacement_key.clone(), entry.clone()) } else { (k, v) };
                if let Some(slot) = next.iter_mut().find(|(x, _)| *x == nk) {
                    slot.1 = nv;
                } else {
                    next.push((nk, nv));
                }
            }
            self.topics = next;
            if replacement_key != replaced_key {
                match self.aliases.iter_mut().find(|(f, _)| *f == replaced_key) {
                    Some(slot) => slot.1 = replacement_key.clone(),
                    None => self.aliases.push((replaced_key.clone(), replacement_key.clone())),
                }
                for (_, to) in self.aliases.iter_mut() {
                    if *to == replaced_key {
                        *to = replacement_key.clone();
                    }
                }
            }
            return warning;
        }
        let key = record.name.to_lowercase();
        if let Some((_, existing)) = self.topics.iter().find(|(k, _)| *k == key) {
            return Some(CatalogIssue {
                code: "invalid_doc",
                severity: "error",
                message: format!(
                    "Topic \"{}\" is already provided by {}. Give it another name, or declare `replaces: '{}'` to take its place.",
                    record.name, existing.package, record.name
                ),
            });
        }
        self.topics.push((
            key,
            TopicEntry {
                name: record.name.clone(),
                package: record.package.clone(),
                provider_id: record.provider_id.clone(),
                path: record.path.clone(),
                title: record.title.clone(),
                description: record.description.clone(),
                category: record.category.clone(),
                replaces: None,
                replaced_package: None,
                extensions: vec![],
                parent: None,
                route: None,
                tree: false,
            },
        ));
        None
    }

    /// `catalog.aliasesOf(entry)`.
    pub fn aliases_of(&self, entry: &TopicEntry) -> Vec<String> {
        let key = entry.name.to_lowercase();
        self.aliases.iter().filter(|(_, to)| *to == key).map(|(f, _)| f.clone()).collect()
    }

    /// `catalog.names()`.
    pub fn names(&self) -> Vec<String> {
        self.topics.iter().map(|(_, e)| e.name.clone()).collect()
    }

    /// `catalog.entries()`.
    pub fn entries(&self) -> Vec<&TopicEntry> {
        self.topics.iter().map(|(_, e)| e).collect()
    }
}

/// `Project.docs()`: the catalog, pushing integration issues into the
/// project's issue list as the JS does.
pub fn project_docs(project: &Project) -> DocsCatalog {
    let mut catalog = DocsCatalog::from_builtins();
    let mut rank = 0;
    for integration in &project.loaded_integrations {
        rank += 1;
        project.collect_issues(integration);
        let pkg = Project::package_label(integration);
        if !integ::has(integration, "docs") || integ::s(integration, "docs") == Some("") {
            continue;
        }
        let found = discover_integration_docs(integration);
        for e in &found.errors {
            project.push_issue(&pkg, "invalid_doc", "error", e);
        }
        if !found.errors.is_empty() {
            for e in found.errors {
                catalog.add_issue(integ::s(integration, "name").map(String::from).unwrap_or_else(|| pkg.clone()), e);
            }
            continue;
        }
        for r in &found.records {
            if let Some(issue) = catalog.add(r) {
                project.push_issue(&pkg, issue.code, issue.severity, &issue.message);
            }
        }
        let with_rank = |list: Vec<TreeInput>| {
            list.into_iter()
                .map(|mut m| {
                    m.insert("rank".into(), Value::from(rank));
                    m
                })
                .collect()
        };
        catalog.add_tree_inputs(TreeInputs { namespaces: with_rank(found.namespaces), guides: with_rank(found.guides) });
    }
    if let Some(hook) = ICON_SET_TREE_INPUTS.get() {
        for inputs in hook(project) {
            catalog.add_tree_inputs(inputs);
        }
    }
    catalog
}

/// The icon-set lane's contribution to `Project.docs()`: the tree inputs of
/// each installed icon set's definitions (empty without the opt-in).
pub static ICON_SET_TREE_INPUTS: std::sync::OnceLock<fn(&Project) -> Vec<TreeInputs>> = std::sync::OnceLock::new();
