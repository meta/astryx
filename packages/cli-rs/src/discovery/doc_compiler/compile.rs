//! Lowering and linking one reference topic (foundation/doc-compiler/compile.mjs
//! `lowerReferenceTopic`, `linkReferenceTopic`) and the lenses a read takes of
//! it (lenses.mjs, docs-section-key.mjs `buildDocsIndexData`).
//!
//! Owner: the docs lane (agreed with discovery).
//! Extensions (`extends`) merge in order through `mergeTopic`; every caller
//! drops a topic whose merge fails, so the error text is not shown.

use crate::json::{Map, Value};
use unicode_normalization::UnicodeNormalization;

/// A lowered topic: its doc with section keys stamped, each section's
/// authored title and provider.
#[derive(Debug, Clone)]
pub struct Lowered {
    pub id: String,
    pub doc: Value,
    /// Section id -> authored title.
    pub source_titles: Map<String, Value>,
    /// Section id -> provider id.
    pub section_providers: Map<String, Value>,
}

/// `sectionTitleKey(title)`.
pub fn section_title_key(title: &str) -> String {
    let folded: String = title.nfkd().filter(|c| !('\u{300}'..='\u{36f}').contains(c)).collect();
    let lower = folded.to_lowercase().replace('&', " and ");
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

fn is_section_key(s: &str) -> bool {
    !s.is_empty() && s.split('-').all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
}

fn title_of(section: &Value) -> String {
    section.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string()
}

/// `legacyTitleMatchIndex(sections, query)` with each section's authored title.
fn legacy_title_match(titles: &[String], query: &str) -> Option<usize> {
    let lower = query.to_lowercase();
    titles.iter().position(|t| t.to_lowercase().contains(&lower))
}

/// `applyOverlay(docs, translation)`: returns the doc and each section's
/// authored title.
fn apply_overlay(doc: &Value, translation: &Value) -> (Value, Vec<String>) {
    let sections = doc.get("sections").and_then(|s| s.as_array()).cloned().unwrap_or_default();
    let authored: Vec<String> = sections.iter().map(title_of).collect();
    let by_section: Vec<&Value> = translation.get("sections").and_then(|s| s.as_array()).map(|a| a.iter().filter(|t| t.get("section").map(|x| !x.is_null()).unwrap_or(false)).collect()).unwrap_or_default();
    let find = |title: &str| -> Option<&Value> { by_section.iter().rev().find(|t| t.get("section").and_then(|x| x.as_str()) == Some(title)).copied() };
    let mut out = doc.as_object().cloned().unwrap_or_default();
    if let Some(d) = translation.get("description").filter(|d| d.as_str().map(|s| !s.is_empty()).unwrap_or(false)) {
        out.insert("description".into(), d.clone());
    }
    let new_sections: Vec<Value> = sections
        .iter()
        .map(|section| {
            let Some(ts) = find(&title_of(section)) else { return section.clone() };
            let mut localized = section.as_object().cloned().unwrap_or_default();
            if let Some(t) = ts.get("title").filter(|t| t.as_str().map(|s| !s.is_empty()).unwrap_or(false)) {
                localized.insert("title".into(), t.clone());
            }
            let content: Vec<Value> = section
                .get("content")
                .and_then(|c| c.as_array())
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .enumerate()
                .map(|(bi, block)| {
                    let Some(tb) = ts.get("content").and_then(|c| c.get(bi)).filter(|t| !t.is_null()) else { return block };
                    let (tt, bt) = (tb.get("type").and_then(|x| x.as_str()), block.get("type").and_then(|x| x.as_str()));
                    let mut b = block.as_object().cloned().unwrap_or_default();
                    if tt == Some("prose") && bt == Some("prose") {
                        b.insert("text".into(), tb.get("text").cloned().unwrap_or(Value::Null));
                        return Value::Object(b);
                    }
                    if tt == Some("list") && bt == Some("list") {
                        b.insert("items".into(), tb.get("items").cloned().unwrap_or(Value::Null));
                        return Value::Object(b);
                    }
                    block
                })
                .collect();
            localized.insert("content".into(), Value::Array(content));
            Value::Object(localized)
        })
        .collect();
    out.insert("sections".into(), Value::Array(new_sections));
    (Value::Object(out), authored)
}

/// `lowerReferenceTopic(input)` for a topic with no extensions.
pub fn lower_reference_topic(id: &str, provider_id: &str, base: &Value, overlay: Option<&Value>) -> Lowered {
    let (doc, authored) = match overlay {
        Some(o) => apply_overlay(base, o),
        None => {
            let t = base.get("sections").and_then(|s| s.as_array()).map(|a| a.iter().map(title_of).collect()).unwrap_or_default();
            (base.clone(), t)
        }
    };
    let sections = doc.get("sections").and_then(|s| s.as_array()).cloned().unwrap_or_default();
    // withoutPosition, then withSectionKeys.
    let sections: Vec<Value> = sections
        .into_iter()
        .map(|s| {
            let mut m = s.as_object().cloned().unwrap_or_default();
            let has = m.get("before").map(|v| !v.is_null()).unwrap_or(false) || m.get("after").map(|v| !v.is_null()).unwrap_or(false);
            if has {
                m.shift_remove("before");
                m.shift_remove("after");
            }
            Value::Object(m)
        })
        .collect();
    let reserved: Vec<String> = sections.iter().filter_map(|s| s.get("id").and_then(|i| i.as_str())).filter(|i| is_section_key(i)).map(String::from).collect();
    let mut used: Vec<String> = Vec::new();
    let mut keyed = Vec::new();
    let mut source_titles = Map::new();
    let mut section_providers = Map::new();
    for (index, section) in sections.iter().enumerate() {
        let mut m = section.as_object().cloned().unwrap_or_default();
        let key = match m.get("id").filter(|v| !v.is_null()) {
            Some(id) => {
                let k = id.as_str().map(String::from).unwrap_or_else(|| crate::cli::format::js_string(id));
                used.push(k.clone());
                k
            }
            None => {
                let base_key = {
                    let k = section_title_key(&authored[index]);
                    if k.is_empty() {
                        format!("section-{}", index + 1)
                    } else {
                        k
                    }
                };
                let mut key = base_key.clone();
                let mut suffix = 2;
                while reserved.contains(&key) || used.contains(&key) || legacy_title_match(&authored, &key).map(|i| i != index).unwrap_or(false) {
                    key = format!("{base_key}-{suffix}");
                    suffix += 1;
                }
                used.push(key.clone());
                m.insert("id".into(), Value::from(key.as_str()));
                key
            }
        };
        source_titles.insert(key.clone(), Value::from(authored[index].as_str()));
        section_providers.insert(key, Value::from(provider_id));
        keyed.push(Value::Object(m));
    }
    let mut out = doc.as_object().cloned().unwrap_or_default();
    out.insert("sections".into(), Value::Array(keyed));
    Lowered { id: id.to_string(), doc: Value::Object(out), source_titles, section_providers }
}

/// `sectionSummary(section)`.
pub fn section_summary(section: &Value) -> String {
    const MAX: usize = 240;
    let first = section.get("content").and_then(|c| c.as_array()).and_then(|a| {
        a.iter().find(|b| {
            let t = b.get("type").and_then(|x| x.as_str());
            (t == Some("prose") && b.get("text").map(|x| x.is_string()).unwrap_or(false)) || (t == Some("list") && b.get("items").map(|x| x.is_array()).unwrap_or(false))
        })
    });
    let raw = match first {
        None => String::new(),
        Some(b) if b.get("type").and_then(|x| x.as_str()) == Some("prose") => b["text"].as_str().unwrap_or("").to_string(),
        Some(b) => match b["items"].get(0) {
            None | Some(Value::Null) => String::new(),
            Some(v) => crate::cli::format::js_string(v),
        },
    };
    let mut text = String::new();
    let mut ws = false;
    for c in raw.chars() {
        if crate::cli::format::js_ws(c) {
            ws = true;
        } else {
            if ws && !text.is_empty() {
                text.push(' ');
            }
            ws = false;
            text.push(c);
        }
    }
    let units: Vec<u16> = text.encode_utf16().collect();
    if units.len() <= MAX {
        return text;
    }
    let cut = String::from_utf16_lossy(&units[..MAX - 1]);
    let cut_units: Vec<u16> = cut.encode_utf16().collect();
    let space = cut_units.iter().rposition(|&u| u == ' ' as u16);
    let kept = match space {
        Some(sp) if sp > MAX / 2 => String::from_utf16_lossy(&cut_units[..sp]),
        _ => cut,
    };
    format!("{}…", kept.trim_end_matches(crate::cli::format::js_ws))
}

/// `buildDocsIndexData(doc)`.
pub fn index_view(doc: &Value) -> Value {
    let mut m = Map::new();
    m.insert("name".into(), doc.get("name").cloned().unwrap_or(Value::Null));
    m.insert("title".into(), doc.get("title").cloned().unwrap_or(Value::Null));
    m.insert("description".into(), doc.get("description").cloned().unwrap_or(Value::Null));
    let sections: Vec<Value> = doc
        .get("sections")
        .and_then(|s| s.as_array())
        .map(|a| {
            a.iter()
                .map(|s| {
                    let mut o = Map::new();
                    o.insert("id".into(), s.get("id").cloned().unwrap_or(Value::Null));
                    o.insert("title".into(), s.get("title").cloned().unwrap_or(Value::Null));
                    o.insert("summary".into(), Value::from(section_summary(s)));
                    Value::Object(o)
                })
                .collect()
        })
        .unwrap_or_default();
    m.insert("sections".into(), Value::Array(sections));
    // JSON drops undefined fields.
    let m: Map<String, Value> = m.into_iter().filter(|(k, v)| !(v.is_null() && k != "sections")).collect();
    Value::Object(m)
}

/// A token reference's target, resolved: `None` for an unknown topic.
pub struct RefTarget {
    pub id: String,
    pub sections: Vec<Value>,
    pub source_titles: Map<String, Value>,
}

/// `sectionView(node, section)` for a section whose token refs and
/// reference blocks are already linked.
pub fn section_view(lowered: &Lowered, section: &Value, lower_target: &mut dyn FnMut(&str) -> Option<RefTarget>) -> Value {
    let mut content = Vec::new();
    let mut preview_type: Option<Value> = None;
    for block in section.get("content").and_then(|c| c.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
        let ty = block.get("type").and_then(|t| t.as_str());
        if ty == Some("reference") {
            content.extend(reference_view(block));
            continue;
        }
        if ty != Some("token-ref") {
            content.push(block.clone());
            continue;
        }
        let topic = block.get("topic").and_then(|t| t.as_str()).unwrap_or("");
        let wanted_section = block.get("section").and_then(|t| t.as_str()).unwrap_or("");
        match lower_target(topic) {
            None => content.push(prose(format!("[token-ref: unknown topic \"{topic}\"]"))),
            Some(target) => {
                let wanted = wanted_section.to_lowercase();
                let found = target.sections.iter().find(|s| {
                    let id = s.get("id").and_then(|i| i.as_str()).unwrap_or("");
                    let authored = target.source_titles.get(id).and_then(|t| t.as_str()).map(String::from).unwrap_or_else(|| title_of(s));
                    id == wanted_section || authored.to_lowercase() == wanted
                });
                match found {
                    None => content.push(prose(format!("[token-ref: section \"{wanted_section}\" not found in \"{topic}\"]"))),
                    Some(f) => {
                        content.extend(f.get("content").and_then(|c| c.as_array()).cloned().unwrap_or_default());
                        let has_own = section.get("previewType").map(|p| !p.is_null() && p != &Value::Bool(false) && p != "").unwrap_or(false);
                        if let Some(pt) = f.get("previewType").filter(|p| !p.is_null() && *p != &Value::Bool(false) && *p != "") {
                            if !has_own {
                                preview_type = Some(pt.clone());
                            }
                        }
                    }
                }
            }
        }
    }
    let mut view = section.as_object().cloned().unwrap_or_default();
    if let Some(pt) = preview_type {
        view.insert("previewType".into(), pt);
    }
    view.insert("content".into(), Value::Array(content));
    let _ = lowered;
    Value::Object(view)
}

fn prose(text: String) -> Value {
    let mut m = Map::new();
    m.insert("type".into(), Value::from("prose"));
    m.insert("text".into(), Value::from(text));
    Value::Object(m)
}

fn reference_view(block: &Value) -> Vec<Value> {
    let target = block.get("target").and_then(|t| t.as_str()).unwrap_or("");
    let link = block.get("link").cloned().unwrap_or(Value::Null);
    if link.is_null() {
        return vec![prose(format!("[reference: \"{target}\" names no doc]"))];
    }
    let included: Vec<Value> = block.get("content").and_then(|c| c.as_array()).cloned().unwrap_or_default();
    let title = link.get("title").map(crate::cli::format::js_string).unwrap_or_default();
    let command = link.get("command").and_then(|c| c.as_str()).unwrap_or("");
    if included.is_empty() {
        let summary = link.get("summary").filter(|s| !s.is_null()).map(crate::cli::format::js_string).unwrap_or_default();
        let summary = summary.trim_matches(crate::cli::format::js_ws);
        let lead = if summary.is_empty() {
            title
        } else {
            let end = if summary.ends_with(['.', '!', '?']) { "" } else { "." };
            format!("{title}: {summary}{end}")
        };
        return vec![prose(format!("{lead} Read it with `{command}`."))];
    }
    let mut out = included;
    out.push(prose(format!("From {title}: `{command}`")));
    out
}

/// One file of a topic: its provider id, its authored doc and the overlay
/// for the read's language.
#[derive(Debug, Clone)]
pub struct TopicSource {
    pub provider_id: String,
    pub doc: Value,
    pub overlay: Option<Value>,
}

/// `applyOverlay(docs, translation)` with the authored title kept as a mark.
fn apply_overlay_marked(doc: &Value, translation: &Value) -> Value {
    use crate::discovery::docs_section_key as dsk;
    let (out, authored) = apply_overlay(doc, translation);
    let original = doc.get("sections").and_then(|s| s.as_array()).cloned().unwrap_or_default();
    let mut m = out.as_object().cloned().unwrap_or_default();
    let sections: Vec<Value> = out["sections"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(i, s)| {
            if original.get(i) == Some(&s) {
                return s;
            }
            Value::Object(dsk::with_source_title(s.as_object().cloned().unwrap_or_default(), Some(&Value::from(authored[i].as_str()))))
        })
        .collect();
    m.insert("sections".into(), Value::Array(sections));
    Value::Object(m)
}

fn mark_provider(doc: &Value, provider: &str) -> Value {
    use crate::discovery::docs_section_key as dsk;
    let mut m = doc.as_object().cloned().unwrap_or_default();
    let sections: Vec<Value> = doc["sections"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|s| {
            let st = dsk::source_title(s);
            let mut sm = dsk::spread(s.as_object().unwrap_or(&Map::new()));
            sm.insert(dsk::SECTION_PROVIDER.into(), Value::from(provider));
            Value::Object(dsk::with_source_title(sm, st.as_ref()))
        })
        .collect();
    m.insert("sections".into(), Value::Array(sections));
    Value::Object(m)
}

/// `lowerReferenceTopic(input)`: the base file, overlaid, each extension
/// merged onto it in order, keys stamped.
pub fn lower_topic(id: &str, base: &TopicSource, extensions: &[TopicSource]) -> Result<Lowered, String> {
    use crate::discovery::docs_discovery::{merge_topic, without_position};
    use crate::discovery::docs_section_key as dsk;
    let read = |s: &TopicSource| match &s.overlay {
        Some(o) => apply_overlay_marked(&s.doc, o),
        None => s.doc.clone(),
    };
    let mut doc = mark_provider(&read(base), &base.provider_id);
    for ext in extensions {
        doc = merge_topic(&doc, &mark_provider(&read(ext), &ext.provider_id));
        let problems = dsk::section_key_errors(doc["sections"].as_array().map(|a| a.as_slice()).unwrap_or(&[]));
        if !problems.is_empty() {
            return Err(format!("extending {id} leaves duplicate authored section IDs: {}", problems.join("; ")));
        }
    }
    let mut m = doc.as_object().cloned().unwrap_or_default();
    let sections: Vec<Value> = doc["sections"].as_array().cloned().unwrap_or_default().iter().map(without_position).collect();
    m.insert("sections".into(), Value::Array(sections));
    let keyed = dsk::with_section_keys(&Value::Object(m));
    let mut source_titles = Map::new();
    let mut section_providers = Map::new();
    for s in keyed["sections"].as_array().cloned().unwrap_or_default() {
        let id = s.get("id").map(|v| crate::cli::format::js_string(v)).unwrap_or_default();
        source_titles.insert(id.clone(), dsk::source_title(&s).unwrap_or(Value::Null));
        section_providers.insert(id, s.get(dsk::SECTION_PROVIDER).cloned().unwrap_or_else(|| Value::from(base.provider_id.as_str())));
    }
    let mut doc = keyed;
    dsk::strip_marks(&mut doc);
    Ok(Lowered { id: id.to_string(), doc, source_titles, section_providers })
}
