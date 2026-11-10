//! Links between docs (foundation/doc-compiler/links.mjs): parse a link
//! target, resolve `{@link}` in text, and link a doc's blocks and fields.
//!
//! Owner: the docs lane (agreed with discovery).

use super::doc_syntax::render_command_tokens;
use crate::json::{Map, Value};
use std::cell::RefCell;
use std::sync::OnceLock;

pub const LINK_KINDS: &[&str] = &["generic", "command", "function", "schema", "enum", "namespace", "component", "page", "block"];

thread_local! {
    static DOC_PM: RefCell<String> = RefCell::new("npm".to_string());
}

/// The package manager `{@pm}` steps render for in this run
/// (`docPackageManager(process.cwd())`).
pub fn set_doc_pm(pm: &str) {
    DOC_PM.with(|d| *d.borrow_mut() = pm.to_string());
}

pub fn doc_pm() -> String {
    DOC_PM.with(|d| d.borrow().clone())
}

fn inline_link_re() -> &'static regress::Regex {
    static R: OnceLock<regress::Regex> = OnceLock::new();
    R.get_or_init(|| regress::Regex::new(r"\{@link\s+([^{}]+?)\s*\}").unwrap())
}

/// A parsed link target.
#[derive(Debug, Clone)]
pub struct LinkTarget {
    pub provider: Option<String>,
    pub kind: String,
    pub name: String,
}

fn js_trim(s: &str) -> &str {
    s.trim_matches(crate::cli::format::js_ws)
}

/// `parseLinkTarget(target)`.
pub fn parse_link_target(target: &str) -> Result<LinkTarget, String> {
    if js_trim(target).is_empty() {
        return Err("a link target is a non-empty string: `[<provider>:]<kind>:<name>`".into());
    }
    let parts: Vec<&str> = js_trim(target).split(':').collect();
    if parts.len() < 2 || parts.len() > 3 || parts.iter().any(|p| js_trim(p).is_empty()) {
        return Err(format!("\"{target}\" is not `[<provider>:]<kind>:<name>`"));
    }
    let provider = if parts.len() == 3 { Some(js_trim(parts[0]).to_string()) } else { None };
    let kind = js_trim(parts[parts.len() - 2]).to_string();
    let name = js_trim(parts[parts.len() - 1]).to_string();
    if !LINK_KINDS.contains(&kind.as_str()) {
        return Err(format!("\"{target}\" names the kind \"{kind}\"; a doc kind is one of {}", LINK_KINDS.join(", ")));
    }
    Ok(LinkTarget { provider, kind, name })
}

/// `renderTokens(text, lang)`.
pub fn render_tokens(text: &str, lang: Option<&str>) -> String {
    if !text.contains("{@") {
        return text.to_string();
    }
    render_command_tokens(text, "astryx", &doc_pm(), lang)
}

/// `text.split(/(`[^`]*`)/)`.
fn split_code_spans(text: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut rest = text;
    let mut cur = String::new();
    loop {
        let Some(i) = rest.find('`') else {
            cur.push_str(rest);
            break;
        };
        match rest[i + 1..].find('`') {
            Some(j) => {
                cur.push_str(&rest[..i]);
                parts.push(std::mem::take(&mut cur));
                parts.push(rest[i..i + 1 + j + 1].to_string());
                rest = &rest[i + 1 + j + 1..];
            }
            None => {
                cur.push_str(rest);
                break;
            }
        }
    }
    parts.push(cur);
    parts
}

/// A resolver: the link a target names, or the problem with it.
pub type Resolve<'a> = dyn FnMut(&str) -> Result<Value, String> + 'a;

/// `resolveInline(text, find)`: each `{@link}` outside code ticks as the
/// command that opens its doc; one that finds nothing prints as written.
pub fn resolve_inline(text: &str, find: &mut dyn FnMut(&str) -> Option<Value>) -> String {
    if !text.contains("{@link") {
        return render_tokens(text, None);
    }
    let re = inline_link_re();
    let mut out = String::new();
    for part in split_code_spans(text) {
        if part.starts_with('`') {
            out.push_str(&part);
            continue;
        }
        let mut last = 0;
        for m in re.find_iter(&part) {
            let target = &part[m.group(1).unwrap()];
            let link = find(target);
            out.push_str(&part[last..m.start()]);
            match link {
                Some(l) => {
                    out.push('`');
                    out.push_str(l.get("command").and_then(|c| c.as_str()).unwrap_or(""));
                    out.push('`');
                }
                None => out.push_str(&part[m.range()]),
            }
            last = m.end();
        }
        out.push_str(&part[last..]);
    }
    render_tokens(&out, None)
}

/// `unlinkText(text)`.
pub fn unlink_text(text: &str) -> String {
    let rendered = render_tokens(text, None);
    let re = inline_link_re();
    split_code_spans(&rendered)
        .into_iter()
        .map(|part| {
            if part.starts_with('`') {
                return part;
            }
            let mut out = String::new();
            let mut last = 0;
            for m in re.find_iter(&part) {
                let target = &part[m.group(1).unwrap()];
                out.push_str(&part[last..m.start()]);
                match parse_link_target(target) {
                    Ok(p) => out.push_str(&p.name),
                    Err(_) => out.push_str(target),
                }
                last = m.end();
            }
            out.push_str(&part[last..]);
            out
        })
        .collect()
}

/// One link that names no doc.
#[derive(Debug, Clone)]
pub struct LinkProblem {
    pub target: String,
    pub message: String,
    pub section: Option<String>,
    pub field: Option<String>,
    pub include: bool,
}

const TEXT_FIELDS: &[&str] = &["description", "summary", "label"];
const CODE_FIELDS: &[&str] = &["code", "playground", "slotElements", "registry", "keywords"];

/// `linkFields(doc, resolve)`: every text field (description, summary,
/// label, propDescriptions) of a doc with its links resolved.
pub fn link_fields(doc: &Value, resolve: &mut Resolve) -> (Value, Vec<LinkProblem>) {
    let mut problems = Vec::new();
    fn walk(value: &Value, at: &str, text: bool, resolve: &mut Resolve, problems: &mut Vec<LinkProblem>) -> Value {
        match value {
            Value::String(s) => {
                if !text {
                    return value.clone();
                }
                let mut find = |target: &str| match resolve(target) {
                    Ok(l) => Some(l),
                    Err(p) => {
                        problems.push(LinkProblem { target: target.into(), message: p, section: None, field: Some(at.into()), include: false });
                        None
                    }
                };
                Value::String(resolve_inline(s, &mut find))
            }
            Value::Array(a) => Value::Array(a.iter().enumerate().map(|(i, v)| walk(v, &format!("{at}[{i}]"), false, resolve, problems)).collect()),
            Value::Object(o) => {
                let mut out = Map::new();
                for (k, f) in o {
                    let path = if at.is_empty() { k.clone() } else { format!("{at}.{k}") };
                    if CODE_FIELDS.contains(&k.as_str()) {
                        out.insert(k.clone(), f.clone());
                    } else if k == "propDescriptions" && f.is_object() {
                        let mut d = Map::new();
                        for (p, desc) in f.as_object().unwrap() {
                            d.insert(p.clone(), walk(desc, &format!("{path}.{p}"), true, resolve, problems));
                        }
                        out.insert(k.clone(), Value::Object(d));
                    } else {
                        out.insert(k.clone(), walk(f, &path, TEXT_FIELDS.contains(&k.as_str()), resolve, problems));
                    }
                }
                Value::Object(out)
            }
            other => other.clone(),
        }
    }
    let out = walk(doc, "", false, resolve, &mut problems);
    (out, problems)
}

/// What a reference block includes of the doc it names.
pub type Include<'a> = dyn FnMut(&Value) -> (Vec<Value>, Vec<String>) + 'a;

fn with(block: &Value, key: &str, v: Value) -> Value {
    let mut m = block.as_object().cloned().unwrap_or_default();
    m.insert(key.into(), v);
    Value::Object(m)
}

/// `linkBlocks(blocks, resolve, at, include)`.
pub fn link_blocks(blocks: &[Value], resolve: &mut Resolve, section: Option<&str>, mut include: Option<&mut Include>) -> (Vec<Value>, Vec<LinkProblem>) {
    let mut problems: Vec<LinkProblem> = Vec::new();
    let mut content = Vec::new();
    let sec = section.map(String::from);
    for block in blocks {
        let ty = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let mut link_text = |t: &Value, problems: &mut Vec<LinkProblem>, resolve: &mut Resolve| -> Value {
            match t {
                Value::String(s) => {
                    let mut find = |target: &str| match resolve(target) {
                        Ok(l) => Some(l),
                        Err(p) => {
                            problems.push(LinkProblem { target: target.into(), message: p, section: sec.clone(), field: None, include: false });
                            None
                        }
                    };
                    Value::String(resolve_inline(s, &mut find))
                }
                other => other.clone(),
            }
        };
        match ty {
            "prose" | "heading" => {
                let t = link_text(block.get("text").unwrap_or(&Value::Null), &mut problems, resolve);
                content.push(with(block, "text", t));
            }
            "list" => {
                let items: Vec<Value> = block.get("items").and_then(|x| x.as_array()).cloned().unwrap_or_default();
                let linked: Vec<Value> = items.iter().map(|i| link_text(i, &mut problems, resolve)).collect();
                content.push(with(block, "items", Value::Array(linked)));
            }
            "table" => {
                let rows: Vec<Value> = block.get("rows").and_then(|x| x.as_array()).cloned().unwrap_or_default();
                let mut out_rows = Vec::new();
                for r in rows {
                    let cells: Vec<Value> = r.as_array().cloned().unwrap_or_default();
                    out_rows.push(Value::Array(cells.iter().map(|c| link_text(c, &mut problems, resolve)).collect()));
                }
                let headers: Vec<Value> = block.get("headers").and_then(|x| x.as_array()).cloned().unwrap_or_default();
                let h: Vec<Value> = headers.iter().map(|c| link_text(c, &mut problems, resolve)).collect();
                let b = with(block, "headers", Value::Array(h));
                content.push(with(&b, "rows", Value::Array(out_rows)));
            }
            "reference" => {
                let target = block.get("target").and_then(|t| t.as_str()).unwrap_or("").to_string();
                match resolve(&target) {
                    Err(p) => {
                        problems.push(LinkProblem { target: target.clone(), message: p, section: sec.clone(), field: None, include: true });
                        content.push(with(block, "link", Value::Null));
                    }
                    Ok(found) => {
                        let mut linked = with(block, "link", found);
                        if let Some(inc) = include.as_mut() {
                            let (c, ps) = inc(block);
                            for message in ps {
                                problems.push(LinkProblem { target: target.clone(), message, section: sec.clone(), field: None, include: true });
                            }
                            linked = with(&linked, "content", Value::Array(c));
                        }
                        content.push(linked);
                    }
                }
            }
            "workflow" => {
                let steps: Vec<Value> = block.get("steps").and_then(|x| x.as_array()).cloned().unwrap_or_default();
                let mut out = Vec::new();
                for step in steps {
                    let mut linked = step.as_object().cloned().unwrap_or_default();
                    if let Some(d) = step.get("description").filter(|d| !d.is_null()) {
                        linked.insert("description".into(), link_text(d, &mut problems, resolve));
                    }
                    if let Some(Value::Array(refs)) = step.get("references") {
                        let mut links = Vec::new();
                        for t in refs {
                            let ts = t.as_str().unwrap_or("");
                            match resolve(ts) {
                                Ok(l) => links.push(l),
                                Err(p) => {
                                    problems.push(LinkProblem { target: ts.into(), message: p, section: sec.clone(), field: None, include: false });
                                    links.push(Value::Null);
                                }
                            }
                        }
                        linked.insert("links".into(), Value::Array(links));
                    }
                    out.push(Value::Object(linked));
                }
                content.push(with(block, "steps", Value::Array(out)));
            }
            "code" => {
                let code = block.get("code").and_then(|c| c.as_str()).map(String::from);
                let lang = block.get("lang").and_then(|l| l.as_str()).unwrap_or("");
                match code {
                    Some(c) => content.push(with(block, "code", Value::String(render_tokens(&c, Some(lang))))),
                    None => content.push(block.clone()),
                }
            }
            "collection" => {
                let slot = block.get("source").and_then(|s| s.get("slot")).and_then(|s| s.as_str()).unwrap_or("");
                problems.push(LinkProblem {
                    target: format!("collection:{slot}"),
                    message: "a collection block is not rendered yet; link each doc with a reference block instead".into(),
                    section: sec.clone(),
                    field: None,
                    include: false,
                });
                content.push(block.clone());
            }
            _ => content.push(block.clone()),
        }
    }
    (content, problems)
}
