//! Port of `foundation/discovery/stray-pointers.mjs`: written
//! `astryx docs <name>` commands that should be `{@link}` pointers.

use super::copied_passages::{file_words, line_at_offset, load_quietly, locate_words, text_words, FileWord, TextWord};
use super::docs_discovery::{builtin_guide_files, IntegrationDocs};
use super::nodepath as np;
use crate::json::Value;
use std::sync::OnceLock;

const POINTER: &str = r"`astryx docs ([A-Za-z0-9_][A-Za-z0-9_-]*)`|`?\{@command docs ([A-Za-z0-9_][A-Za-z0-9_-]*)\}`?";

fn core_kinds() -> &'static Vec<(String, &'static str)> {
    static K: OnceLock<Vec<(String, &'static str)>> = OnceLock::new();
    K.get_or_init(|| {
        let mut out: Vec<(String, &'static str)> = Vec::new();
        for f in builtin_guide_files() {
            let Some(doc) = load_quietly(&f) else { continue };
            let Some(Value::String(n)) = doc.get("name") else { continue };
            let kind = if doc.get("type").and_then(|t| t.as_str()) == Some("namespace") { "namespace" } else { "generic" };
            match out.iter_mut().find(|(k, _)| k == n) {
                Some(slot) => slot.1 = kind,
                None => out.push((n.clone(), kind)),
            }
        }
        out
    })
}

const TEXT_FIELDS: [&str; 3] = ["description", "summary", "label"];
const CODE_FIELDS: [&str; 5] = ["code", "playground", "slotElements", "registry", "keywords"];

/// `textFields(doc)` (links.mjs): `(field path, text)`.
pub fn text_fields(doc: &Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    fn walk(v: &Value, at: &str, text: bool, out: &mut Vec<(String, String)>) {
        match v {
            Value::String(s) => {
                if text {
                    out.push((at.to_string(), s.clone()));
                }
            }
            Value::Array(a) => {
                for (i, x) in a.iter().enumerate() {
                    walk(x, &format!("{at}[{i}]"), false, out);
                }
            }
            Value::Object(m) => {
                if m.contains_key("__js") {
                    return;
                }
                for (k, f) in m {
                    let path = if at.is_empty() { k.clone() } else { format!("{at}.{k}") };
                    if CODE_FIELDS.contains(&k.as_str()) {
                        continue;
                    }
                    if k == "propDescriptions" && matches!(f, Value::Object(_)) {
                        for (p, d) in f.as_object().unwrap() {
                            walk(d, &format!("{path}.{p}"), true, out);
                        }
                    } else {
                        walk(f, &path, TEXT_FIELDS.contains(&k.as_str()), out);
                    }
                }
            }
            _ => {}
        }
    }
    walk(doc, "", false, &mut out);
    out
}

/// A linkable string (`{text, section, field}`).
#[derive(Debug, Clone)]
pub struct Linkable {
    pub text: String,
    pub section: Option<String>,
    pub field: Option<String>,
}

/// `linkableStrings(doc)`.
pub fn linkable_strings(doc: &Value) -> Vec<Linkable> {
    let mut out = Vec::new();
    if !doc.is_object() || super::docmod::is_undefined(Some(doc)) {
        return out;
    }
    if !matches!(doc.get("sections"), Some(Value::Array(_))) {
        for (field, text) in text_fields(doc) {
            out.push(Linkable { text, section: None, field: Some(field) });
        }
        return out;
    }
    for f in ["description", "summary"] {
        if let Some(Value::String(t)) = doc.get(f) {
            out.push(Linkable { text: t.clone(), section: None, field: Some(f.into()) });
        }
    }
    fn walk(v: &Value, section: &Option<String>, out: &mut Vec<Linkable>) {
        match v {
            Value::Array(a) => a.iter().for_each(|x| walk(x, section, out)),
            Value::Object(m) => {
                if m.contains_key("__js") {
                    return;
                }
                let title = m.get("title").and_then(|t| t.as_str()).map(String::from).or_else(|| section.clone());
                if let Some(s @ Value::Array(_)) = m.get("sections") {
                    walk(s, section, out);
                }
                let Some(Value::Array(content)) = m.get("content") else { return };
                for block in content {
                    let mut add = |t: &Value| {
                        if let Value::String(s) = t {
                            out.push(Linkable { text: s.clone(), section: title.clone(), field: None });
                        }
                    };
                    match block.get("type").and_then(|t| t.as_str()) {
                        Some("prose") | Some("heading") => {
                            if let Some(t) = block.get("text") {
                                add(t);
                            }
                        }
                        Some("list") => {
                            if let Some(Value::Array(items)) = block.get("items") {
                                items.iter().for_each(add);
                            }
                        }
                        Some("table") => {
                            if let Some(Value::Array(h)) = block.get("headers") {
                                h.iter().for_each(&mut add);
                            }
                            if let Some(Value::Array(rows)) = block.get("rows") {
                                for r in rows {
                                    if let Value::Array(cells) = r {
                                        cells.iter().for_each(&mut add);
                                    }
                                }
                            }
                        }
                        _ => walk(block, &title, out),
                    }
                }
            }
            _ => {}
        }
    }
    walk(doc, &None, &mut out);
    out
}

/// `pointersIn(text)`.
pub fn pointers_in(text: &str) -> Vec<String> {
    let re = regress::Regex::with_flags(POINTER, "g").unwrap();
    re.find_iter(text).map(|m| text[m.group(1).or(m.group(2)).unwrap()].to_string()).collect()
}

fn locate_string(lines: &[&str], file: &[FileWord], text: &str, words: &[TextWord], from: usize) -> i64 {
    let mut starts: Vec<usize> = Vec::new();
    let mut at = locate_words(file, words, 0);
    while at >= 0 {
        starts.push(at as usize);
        at = locate_words(file, words, at as usize + 1);
    }
    if starts.is_empty() {
        return -1;
    }
    let literals: Vec<String> =
        if text.contains('\n') { vec![] } else { vec![format!("'{text}'"), format!("\"{text}\""), format!("'{}'", text.replace('\'', "\\'"))] };
    let quoted: Vec<usize> = starts
        .iter()
        .copied()
        .filter(|a| lines.get(file[*a].line - 1).map(|l| literals.iter().any(|lit| l.contains(lit.as_str()))).unwrap_or(false))
        .collect();
    let pool = if quoted.is_empty() { starts } else { quoted };
    pool.iter().copied().find(|a| *a >= from).unwrap_or(pool[0]) as i64
}

/// One stray-pointer finding.
#[derive(Debug, Clone, PartialEq)]
pub struct StrayPointer {
    pub topic: String,
    /// `topic` | `component`.
    pub kind: &'static str,
    pub section: Option<String>,
    pub field: Option<String>,
    pub file: String,
    pub line: Option<usize>,
    pub pointer: String,
    pub link: String,
    pub message: String,
}

impl StrayPointer {
    pub fn to_json(&self) -> Value {
        serde_json::json!({"topic": self.topic, "kind": self.kind, "section": self.section, "field": self.field, "file": self.file,
            "line": self.line, "pointer": self.pointer, "link": self.link, "message": self.message})
    }
}

/// `findStrayPointers(discovered)`; `components` is `discovered.components`
/// (`{name, file}`).
pub fn find_stray_pointers(discovered: &IntegrationDocs, components: &[(String, String)]) -> Vec<StrayPointer> {
    let mut topics: Vec<(String, Option<String>, &'static str)> = discovered.records.iter().map(|r| (r.name.clone(), Some(r.path.clone()), "topic")).collect();
    for g in &discovered.guides {
        topics.push((
            super::paths::js_string(g.get("name")),
            g.get("ref").and_then(|r| r.get("topicFile")).and_then(|f| f.as_str()).map(String::from),
            "topic",
        ));
    }
    let mut own: Vec<(String, &'static str)> = Vec::new();
    for (n, _, _) in &topics {
        match own.iter_mut().find(|(k, _)| k == n) {
            Some(slot) => slot.1 = "generic",
            None => own.push((n.clone(), "generic")),
        }
    }
    for ns in &discovered.namespaces {
        if let Some(Value::String(n)) = ns.get("doc").and_then(|d| d.get("name")) {
            if !own.iter().any(|(k, _)| k == n) {
                own.push((n.clone(), "namespace"));
            }
        }
    }
    for (n, f) in components {
        topics.push((n.clone(), Some(f.clone()), "component"));
    }
    let core = core_kinds();
    let mut extends_of: Vec<(String, String)> = Vec::new();
    for (n, f, _) in &topics {
        let Some(f) = f else { continue };
        if let Some(Value::String(e)) = load_quietly(f).as_ref().and_then(|d| d.get("extends")) {
            match extends_of.iter_mut().find(|(k, _)| k == n) {
                Some(slot) => slot.1 = e.clone(),
                None => extends_of.push((n.clone(), e.clone())),
            }
        }
    }
    let own_kind = |n: &str| own.iter().find(|(k, _)| k == n).map(|x| x.1);
    let core_kind = |n: &str| core.iter().find(|(k, _)| k == n).map(|x| x.1);
    let link_for = |target: &str| -> Option<String> {
        if let Some((_, page)) = extends_of.iter().find(|(k, _)| k == target) {
            if let Some(k) = own_kind(page) {
                if !extends_of.iter().any(|(x, _)| x == page) {
                    return Some(format!("{{@link {k}:{page}}}"));
                }
            }
            return core_kind(page).map(|k| format!("{{@link @astryxdesign/cli:{k}:{page}}}"));
        }
        own_kind(target)
            .map(|k| format!("{{@link {k}:{target}}}"))
            .or_else(|| core_kind(target).map(|k| format!("{{@link @astryxdesign/cli:{k}:{target}}}")))
    };
    let re = regress::Regex::with_flags(POINTER, "g").unwrap();
    let mut found = Vec::new();
    for (tname, file, kind) in &topics {
        let Some(file) = file else { continue };
        let Some(doc) = load_quietly(file) else { continue };
        let raw = np::read_text(file).unwrap_or_default();
        let source = if raw.is_empty() { vec![] } else { file_words(&raw) };
        let lines: Vec<&str> = if raw.is_empty() { vec![] } else { raw.split('\n').collect() };
        let name = if *kind == "component" {
            doc.get("name").and_then(|n| n.as_str()).map(String::from).unwrap_or_else(|| tname.clone())
        } else {
            tname.clone()
        };
        let label = if *kind == "component" { format!("component \"{name}\"") } else { format!("\"{name}\"") };
        let mut cursor = 0usize;
        for l in linkable_strings(&doc) {
            let words = text_words(&l.text);
            let index = locate_string(&lines, &source, &l.text, &words, cursor);
            if index >= 0 {
                cursor = index as usize + words.len();
            }
            for m in re.find_iter(&l.text) {
                let target = l.text[m.group(1).or(m.group(2)).unwrap()].to_string();
                let Some(link) = link_for(&target) else { continue };
                let command = if m.group(1).is_some() { format!("astryx docs {target}") } else { l.text[m.range()].replace('`', "") };
                let at16 = l.text[..m.start()].encode_utf16().count();
                let line = if index < 0 { None } else { line_at_offset(&source, index as usize, &words, at16 + 1) };
                let mut wh: Vec<String> = Vec::new();
                if let Some(s) = l.section.as_ref().filter(|s| !s.is_empty()) {
                    wh.push(format!("section \"{s}\""));
                }
                if let Some(f) = l.field.as_ref().filter(|s| !s.is_empty()) {
                    wh.push(format!("field {f}"));
                }
                if let Some(li) = line {
                    wh.push(format!("line {li}"));
                }
                let where_ = if wh.is_empty() { String::new() } else { format!(" ({})", wh.join(", ")) };
                found.push(StrayPointer {
                    topic: name.clone(),
                    kind,
                    section: l.section.clone(),
                    field: l.field.clone(),
                    file: file.clone(),
                    line,
                    pointer: command.clone(),
                    link: link.clone(),
                    message: format!(
                        "{label}{where_} points at a doc with the written command `{command}`. Replace `{command}`, code ticks included, with {link}: the CLI prints the command that opens the doc, and doctor checks the link."
                    ),
                });
            }
        }
    }
    found
}
