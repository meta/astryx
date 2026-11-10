//! Port of `foundation/discovery/docs-section-key.mjs`.
//!
//! JS keeps a section's authored title (and, during compilation, its
//! provider and merge placement) under Symbol keys that JSON never sees.
//! Here they are map keys that start with U+0001 ([`SOURCE_TITLE`],
//! [`SECTION_PROVIDER`], [`PLACED_AFTER`]); [`strip_marks`] removes them, and
//! every JSON output path must call it (as `JSON.stringify` drops symbols).
//! `{...section}` copies only enumerable symbols: use [`spread`].

use crate::json::{Map, Value};

/// The authored title (`Symbol('astryx.docs.sourceTitle')`, non-enumerable).
pub const SOURCE_TITLE: &str = "\u{1}sourceTitle";
/// The section's provider (`SECTION_PROVIDER`, enumerable: spreads copy it).
pub const SECTION_PROVIDER: &str = "\u{1}sectionProvider";
/// A merge placement (`PLACED_AFTER`, non-enumerable).
pub const PLACED_AFTER: &str = "\u{1}placedAfter";

/// `SECTION_KEY_RE`.
pub fn is_section_key(s: &str) -> bool {
    regress::Regex::new(r"^[a-z0-9]+(?:-[a-z0-9]+)*$").unwrap().find(s).is_some()
}

/// `{...section}`: own enumerable keys, which drops the non-enumerable marks.
pub fn spread(section: &Map<String, Value>) -> Map<String, Value> {
    section.iter().filter(|(k, _)| k.as_str() != SOURCE_TITLE && k.as_str() != PLACED_AFTER).map(|(k, v)| (k.clone(), v.clone())).collect()
}

/// Remove every mark, recursively.
pub fn strip_marks(v: &mut Value) {
    match v {
        Value::Object(m) => {
            m.retain(|k, _| !k.starts_with('\u{1}'));
            for (_, x) in m.iter_mut() {
                strip_marks(x);
            }
        }
        Value::Array(a) => a.iter_mut().for_each(strip_marks),
        _ => {}
    }
}

/// `withSourceTitle(section, title)`.
pub fn with_source_title(mut section: Map<String, Value>, title: Option<&Value>) -> Map<String, Value> {
    section.insert(SOURCE_TITLE.into(), title.cloned().unwrap_or_else(super::zod::undefined));
    section
}

fn nullish(v: Option<&Value>) -> bool {
    super::docmod::is_nullish(v)
}

/// `sourceTitle(section)` (`section[SOURCE_TITLE] ?? section.title`).
pub fn source_title(section: &Value) -> Option<Value> {
    let st = section.get(SOURCE_TITLE);
    if !nullish(st) {
        return st.cloned();
    }
    section.get("title").filter(|v| !super::docmod::is_undefined(Some(v))).cloned()
}

fn source_title_str(section: &Value) -> Option<String> {
    source_title(section).and_then(|v| v.as_str().map(String::from))
}

/// `sectionTitleKey(title)`.
pub fn section_title_key(title: Option<&str>) -> String {
    use unicode_normalization::UnicodeNormalization;
    let Some(t) = title else { return String::new() };
    let n: String = t.nfkd().filter(|c| !('\u{300}'..='\u{36f}').contains(c)).collect();
    let lower = n.to_lowercase().replace('&', " and ");
    let mut out = String::new();
    let mut dash = false;
    for c in lower.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
            dash = false;
        } else if !dash {
            out.push('-');
            dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

/// `sectionKey(section)`.
pub fn section_key(section: &Value) -> String {
    match section.get("id") {
        Some(Value::String(s)) => s.clone(),
        _ => section_title_key(source_title_str(section).as_deref()),
    }
}

fn js_lower(s: &str) -> String {
    s.to_lowercase()
}

fn legacy_title_match_index(sections: &[Value], query: &str) -> Option<usize> {
    let lower = js_lower(query);
    sections.iter().position(|s| match source_title(s) {
        Some(Value::String(t)) => js_lower(&t).contains(&lower),
        _ => false,
    })
}

/// `routeSegment(name)`.
pub fn route_segment(name: &str) -> String {
    let chars: Vec<char> = name.chars().collect();
    let mut s = String::new();
    for (i, c) in chars.iter().enumerate() {
        s.push(*c);
        if (c.is_ascii_lowercase() || c.is_ascii_digit()) && chars.get(i + 1).map(|n| n.is_ascii_uppercase()).unwrap_or(false) {
            s.push('-');
        }
    }
    let lower = s.to_lowercase();
    let mut out = String::new();
    let mut dash = false;
    for c in lower.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
            dash = false;
        } else if !dash {
            out.push('-');
            dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn json(v: &Value) -> String {
    crate::json::stringify(v, 0)
}

/// `sectionKeyErrors(sections)`.
pub fn section_key_errors(sections: &[Value]) -> Vec<String> {
    let mut problems = Vec::new();
    let mut seen: Vec<(String, usize)> = Vec::new();
    for (s, section) in sections.iter().enumerate() {
        let id = section.get("id");
        if nullish(id) {
            continue;
        }
        let at = format!("sections[{s}]");
        let id = id.unwrap();
        let Some(ids) = id.as_str().filter(|x| is_section_key(x)) else {
            problems.push(format!(
                "{at}.id: {} is not a stable key. Use lowercase letters and digits joined by single hyphens.",
                json(id)
            ));
            continue;
        };
        if let Some((_, first)) = seen.iter().find(|(k, _)| k == ids) {
            problems.push(format!("{at}: the key \"{ids}\" is already used by sections[{first}]. Give one of them a distinct id."));
            continue;
        }
        if let Some(owner) = legacy_title_match_index(sections, ids) {
            if owner != s {
                problems.push(format!(
                    "{at}.id: the key \"{ids}\" is already a legacy title query for sections[{owner}]. Choose an id that resolves to this section."
                ));
                continue;
            }
        }
        seen.push((ids.to_string(), s));
    }
    problems
}

/// `sectionKeyProblems(sections)`.
pub fn section_key_problems(sections: &[Value]) -> Vec<String> {
    let mut problems = Vec::new();
    let mut seen: Vec<(String, usize)> = Vec::new();
    for (s, section) in sections.iter().enumerate() {
        let at = format!("sections[{s}]");
        let id = section.get("id");
        let title_ok = matches!(section.get("title"), Some(Value::String(t)) if !t.is_empty());
        if nullish(id) && !title_ok {
            continue;
        }
        if !nullish(id) && !id.unwrap().as_str().map(is_section_key).unwrap_or(false) {
            problems.push(format!(
                "{at}.id: {} is not a stable key. Use lowercase letters and digits joined by single hyphens.",
                json(id.unwrap())
            ));
            continue;
        }
        let key = section_key(section);
        if key.is_empty() {
            problems.push(format!(
                "{at}: no key derives from the title {}. A deterministic section-N compatibility key is used; add an explicit id.",
                section.get("title").map(json).unwrap_or_else(|| "undefined".into())
            ));
            continue;
        }
        if let Some((_, first)) = seen.iter().find(|(k, _)| *k == key) {
            problems.push(format!(
                "{at}: the key \"{key}\" is already used by sections[{first}]. A suffixed compatibility key is used for title-derived collisions; give one of them a distinct id or title."
            ));
            continue;
        }
        seen.push((key, s));
    }
    problems
}

/// `withSectionKeys(doc)`.
pub fn with_section_keys(doc: &Value) -> Value {
    let sections: Vec<Value> = doc.get("sections").and_then(|s| s.as_array()).cloned().unwrap_or_default();
    let reserved: Vec<String> = sections.iter().filter_map(|s| s.get("id").and_then(|v| v.as_str()).filter(|x| is_section_key(x)).map(String::from)).collect();
    let mut used: Vec<String> = Vec::new();
    let out: Vec<Value> = sections
        .iter()
        .enumerate()
        .map(|(index, section)| {
            if !nullish(section.get("id")) {
                used.push(super::paths::js_string(section.get("id")));
                return section.clone();
            }
            let derived = section_title_key(source_title_str(section).as_deref());
            let base = if derived.is_empty() { format!("section-{}", index + 1) } else { derived };
            let mut key = base.clone();
            let mut suffix = 2;
            while reserved.contains(&key)
                || used.contains(&key)
                || legacy_title_match_index(&sections, &key).map(|i| i != index).unwrap_or(false)
            {
                key = format!("{base}-{suffix}");
                suffix += 1;
            }
            used.push(key.clone());
            let st = source_title(section);
            let mut m = spread(section.as_object().unwrap_or(&Map::new()));
            m.insert("id".into(), Value::String(key));
            Value::Object(with_source_title(m, st.as_ref()))
        })
        .collect();
    let mut d = doc.as_object().cloned().unwrap_or_default();
    d.insert("sections".into(), Value::Array(out));
    Value::Object(d)
}

/// `findDocSection(sections, query)`: `(section, candidates)`.
pub fn find_doc_section(sections: &[Value], query: &str) -> (Option<Value>, Vec<Value>) {
    let wanted = query.trim_matches(super::paths::js_ws);
    let by_key = sections.iter().find(|s| section_key(s) == wanted);
    let localized = sections.iter().any(|s| source_title(s) != s.get("title").cloned());
    if let (Some(b), true) = (by_key, localized) {
        return (Some(b.clone()), vec![]);
    }
    let lower = js_lower(wanted);
    let legacy: Vec<Value> = sections
        .iter()
        .filter(|s| s.get("title").and_then(|t| t.as_str()).map(|t| js_lower(t).contains(&lower)).unwrap_or(false))
        .cloned()
        .collect();
    if !legacy.is_empty() {
        let first = legacy[0].clone();
        return (Some(first), if legacy.len() > 1 { legacy } else { vec![] });
    }
    if let Some(b) = sections.iter().find(|s| section_key(s) == wanted) {
        return (Some(b.clone()), vec![]);
    }
    let derived = section_title_key(Some(wanted));
    let found = sections.iter().find(|s| !derived.is_empty() && section_title_key(source_title_str(s).as_deref()) == derived);
    (found.cloned(), vec![])
}

/// `sectionSummary(section, max = 240)`.
pub fn section_summary(section: &Value, max: usize) -> String {
    let content = section.get("content").and_then(|c| c.as_array()).cloned().unwrap_or_default();
    let first = content.iter().find(|b| {
        (b.get("type").and_then(|t| t.as_str()) == Some("prose") && b.get("text").map(|t| t.is_string()).unwrap_or(false))
            || (b.get("type").and_then(|t| t.as_str()) == Some("list") && b.get("items").map(|i| i.is_array()).unwrap_or(false))
    });
    let raw = match first {
        None => String::new(),
        Some(b) if b.get("type").and_then(|t| t.as_str()) == Some("prose") => b["text"].as_str().unwrap_or("").to_string(),
        Some(b) => match b["items"].get(0) {
            None | Some(Value::Null) => String::new(),
            Some(v) if super::docmod::is_undefined(Some(v)) => String::new(),
            Some(v) => super::paths::js_string(Some(v)),
        },
    };
    let mut text = String::new();
    let mut ws = false;
    for c in raw.chars() {
        if super::paths::js_ws(c) {
            if !ws {
                text.push(' ');
            }
            ws = true;
        } else {
            text.push(c);
            ws = false;
        }
    }
    let text = text.trim_matches(super::paths::js_ws).to_string();
    let units: Vec<u16> = text.encode_utf16().collect();
    if units.len() <= max {
        return text;
    }
    let cut = String::from_utf16_lossy(&units[..max - 1]);
    let cut_units: Vec<u16> = cut.encode_utf16().collect();
    let space = cut_units.iter().rposition(|u| *u == b' ' as u16);
    let kept = match space {
        Some(sp) if sp as f64 > max as f64 / 2.0 => String::from_utf16_lossy(&cut_units[..sp]),
        _ => cut,
    };
    format!("{}…", kept.trim_end_matches(super::paths::js_ws))
}

/// `buildDocsIndexData(doc)`.
pub fn build_docs_index_data(doc: &Value) -> Value {
    let sections: Vec<Value> = doc
        .get("sections")
        .and_then(|s| s.as_array())
        .map(|a| {
            a.iter()
                .map(|s| serde_json::json!({"id": section_key(s), "title": s.get("title").cloned().unwrap_or(Value::Null), "summary": section_summary(s, 240)}))
                .collect()
        })
        .unwrap_or_default();
    serde_json::json!({"name": doc.get("name"), "title": doc.get("title"), "description": doc.get("description"), "sections": sections})
}
