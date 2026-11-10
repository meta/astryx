//! Port of `foundation/discovery/doc-consistency.mjs`: doc structure the
//! reader silently drops (duplicate props, unknown translated props, empty
//! sections, colliding section keys, orphan overlays).

use super::docmod;
use super::docs_section_key as dsk;
use super::integrations::{self as integ, Record};
use super::nodepath as np;
use crate::json::{Map, Value};

const TOPIC_SUFFIXES: [&str; 3] = [".doc.ts", ".doc.mjs", ".doc.js"];

/// A finding: `{code, severity: 'warning', message, fix, file, line?}`.
pub fn finding(code: &str, message: String, fix: String, file: &str, line: Option<usize>) -> Value {
    let mut m = Map::new();
    m.insert("code".into(), Value::String(code.into()));
    m.insert("severity".into(), Value::String("warning".into()));
    m.insert("message".into(), Value::String(message));
    m.insert("fix".into(), Value::String(fix));
    m.insert("file".into(), Value::String(file.into()));
    if let Some(l) = line {
        m.insert("line".into(), Value::from(l));
    }
    Value::Object(m)
}

/// `lineOf(text, pattern, nth, from)`: 1-based line of the nth match (the
/// last when fewer), searching from byte offset `from`.
pub fn line_of(text: &str, pattern: &str, nth: usize, from: usize) -> Option<usize> {
    if text.is_empty() {
        return None;
    }
    let re = regress::Regex::with_flags(pattern, "g").ok()?;
    let rest = &text[from..];
    let matches: Vec<usize> = re.find_iter(rest).map(|m| m.start()).collect();
    if matches.is_empty() {
        return None;
    }
    let idx = matches[nth.min(matches.len() - 1)];
    Some(text[..from + idx].split('\n').count())
}

/// `escapeRe(value)`.
pub fn escape_re(v: &str) -> String {
    let mut o = String::new();
    for c in v.chars() {
        if ".*+?^${}()|[]\\".contains(c) {
            o.push('\\');
        }
        o.push(c);
    }
    o
}

fn name_pattern(v: &str) -> String {
    format!(r#"\bname['"]?\s*:\s*(['"`]){}\1"#, escape_re(v))
}

fn names_of(prop: &Value) -> Vec<String> {
    let Some(Value::String(n)) = prop.get("name") else { return vec![] };
    let re = regress::Regex::new(r"\s+\/\s+").unwrap();
    let mut parts = Vec::new();
    let mut last = 0;
    for m in re.find_iter(n) {
        parts.push(&n[last..m.start()]);
        last = m.end();
    }
    parts.push(&n[last..]);
    parts.iter().map(|p| p.trim_matches(super::paths::js_ws).to_string()).filter(|p| !p.is_empty()).collect()
}

fn s(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(x) if docmod::is_undefined(Some(x)) => "undefined".into(),
        Some(x) => super::paths::js_string(Some(x)),
    }
}

fn nn(v: Option<&Value>) -> String {
    // String(x ?? '')
    if docmod::is_nullish(v) {
        String::new()
    } else {
        s(v)
    }
}

fn prop_tables(doc: &Value) -> Vec<(String, String, Vec<Value>)> {
    let mut t = Vec::new();
    if let Some(Value::Array(p)) = doc.get("props") {
        t.push(("props".into(), nn(doc.get("name")), p.clone()));
    }
    if let Some(Value::Array(c)) = doc.get("components") {
        for (i, e) in c.iter().enumerate() {
            if let Some(Value::Array(p)) = e.get("props") {
                if super::paths::js_truthy(Some(e)) {
                    t.push((format!("components[{i}].props"), nn(e.get("name")), p.clone()));
                }
            }
        }
    }
    t
}

fn edit_distance(a: &[u16], b: &[u16]) -> usize {
    let mut row: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut prev = row[0];
        row[0] = i;
        for j in 1..=b.len() {
            let kept = row[j];
            row[j] = (row[j] + 1).min(row[j - 1] + 1).min(prev + if a[i - 1] == b[j - 1] { 0 } else { 1 });
            prev = kept;
        }
    }
    row[b.len()]
}

/// `closest(name, names)`.
pub fn closest(name: &str, names: &[String]) -> Option<String> {
    let a: Vec<u16> = name.to_lowercase().encode_utf16().collect();
    let mut best: Option<&String> = None;
    let mut bd = usize::MAX;
    for c in names {
        let b: Vec<u16> = c.to_lowercase().encode_utf16().collect();
        let d = edit_distance(&a, &b);
        if d < bd {
            best = Some(c);
            bd = d;
        }
    }
    let limit = 2.max(name.encode_utf16().count() / 3);
    best.filter(|_| bd <= limit).cloned()
}

fn is_obj(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::Object(_))) && !docmod::is_undefined(v) && v.map(super::zod::received).as_deref() == Some("object")
}

/// `componentDocProblems(mod, file, text)`.
pub fn component_doc_problems(ns: &Map<String, Value>, file: &str, text: &str) -> Vec<Value> {
    let mut issues = Vec::new();
    let doc = match docmod::first_export(ns, &["default", "docs"]) {
        Some(d) if is_obj(Some(d)) || matches!(d, Value::Array(_)) => d.clone(),
        _ => return issues,
    };
    let tables = prop_tables(&doc);
    let mut seen_names: Vec<(String, usize)> = Vec::new();
    for (at, owner, props) in &tables {
        let mut first: Vec<(String, usize)> = Vec::new();
        for (i, prop) in props.iter().enumerate() {
            for name in names_of(prop) {
                let whole = match prop.get("name") {
                    Some(Value::String(w)) => w.clone(),
                    _ => name.clone(),
                };
                let nth = seen_names.iter().find(|(k, _)| *k == whole).map(|x| x.1).unwrap_or(0);
                match seen_names.iter_mut().find(|(k, _)| *k == whole) {
                    Some(slot) => slot.1 = nth + 1,
                    None => seen_names.push((whole.clone(), 1)),
                }
                let Some(earlier) = first.iter().find(|(k, _)| *k == name).map(|x| x.1) else {
                    first.push((name.clone(), i));
                    continue;
                };
                let own = if owner.is_empty() { String::new() } else { format!("{owner}'s ") };
                issues.push(finding(
                    "duplicate_prop",
                    format!("{own}prop \"{name}\" is documented twice: {at}[{earlier}] and {at}[{i}]."),
                    format!("In {file}, delete {at}[{i}] (the second \"{name}\" entry), keeping what it adds in {at}[{earlier}]."),
                    file,
                    line_of(text, &name_pattern(&whole), nth, 0),
                ));
            }
        }
    }
    for export in ["docsZh", "docsDense"] {
        let Some(overlay) = ns.get(export).filter(|o| is_obj(Some(o)) || matches!(o, Value::Array(_))) else { continue };
        let mut checks: Vec<(String, Option<Value>, Option<Vec<Value>>, String)> = vec![(
            format!("{export}.propDescriptions"),
            overlay.get("propDescriptions").cloned(),
            doc.get("props").and_then(|p| p.as_array()).cloned(),
            nn(doc.get("name")),
        )];
        if let (Some(Value::Array(oc)), Some(Value::Array(dc))) = (overlay.get("components"), doc.get("components")) {
            for (i, entry) in oc.iter().enumerate() {
                if !is_obj(Some(entry)) && !matches!(entry, Value::Array(_)) {
                    continue;
                }
                let base = dc.iter().find(|c| c.get("name") == entry.get("name")).or_else(|| dc.get(i));
                let owner = match base.and_then(|b| b.get("name")).filter(|v| !docmod::is_nullish(Some(v))) {
                    Some(n) => s(Some(n)),
                    None => nn(entry.get("name")),
                };
                checks.push((
                    format!("{export}.components[{i}].propDescriptions"),
                    entry.get("propDescriptions").cloned(),
                    base.and_then(|b| b.get("props")).and_then(|p| p.as_array()).cloned(),
                    owner,
                ));
            }
        }
        let export_at = regress::Regex::new(&format!(r"\b{export}\b\s*=")).unwrap().find(text).map(|m| m.start()).unwrap_or(0);
        for (at, descriptions, props, owner) in checks {
            let Some(props) = props else { continue };
            let Some(Value::Object(desc)) = descriptions.filter(|d| is_obj(Some(d))) else { continue };
            let known: Vec<String> = props.iter().filter_map(|p| p.get("name").and_then(|n| n.as_str()).map(String::from)).collect();
            let mut whole_of: Vec<(String, String)> = Vec::new();
            for p in &props {
                for each in names_of(p) {
                    let w = p.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                    match whole_of.iter_mut().find(|(k, _)| *k == each) {
                        Some(slot) => slot.1 = w,
                        None => whole_of.push((each, w)),
                    }
                }
            }
            for key in desc.keys() {
                if known.contains(key) {
                    continue;
                }
                let mut cands: Vec<String> = whole_of.iter().map(|x| x.0.clone()).collect();
                cands.extend(known.iter().cloned());
                let near = closest(key, &cands).map(|part| whole_of.iter().find(|x| x.0 == part).map(|x| x.1.clone()).unwrap_or(part));
                let who = if owner.is_empty() { "the doc".to_string() } else { owner.clone() };
                issues.push(finding(
                    "unknown_translated_prop",
                    format!(
                        "{at} names \"{key}\", but no prop entry of {who} is named \"{key}\" (an overlay matches an entry's whole name), so that text is never shown."
                    ),
                    match &near {
                        Some(n) => format!("In {file}, rename the key \"{key}\" in {at} to \"{n}\"."),
                        None => format!("In {file}, remove \"{key}\" from {at}, or document the prop \"{key}\" first."),
                    },
                    file,
                    line_of(text, &format!(r#"(['"`]?){}\1\s*:"#, escape_re(key)), 0, export_at),
                ));
            }
        }
    }
    issues
}

/// `filesUnder(dir, test)`: sorted.
pub fn files_under(dir: &str, test: &dyn Fn(&str) -> bool) -> Vec<String> {
    let mut found = Vec::new();
    fn walk(d: &str, test: &dyn Fn(&str) -> bool, found: &mut Vec<String>) {
        let Some(entries) = np::read_dir(d) else { return };
        for e in entries {
            if ["node_modules", ".git", "__tests__"].contains(&e.name.as_str()) {
                continue;
            }
            let full = np::join2(d, &e.name);
            if e.is_dir {
                walk(&full, test, found);
            } else if test(&e.name) {
                found.push(full);
            }
        }
    }
    walk(dir, test, &mut found);
    super::jsort::sort_strings(&mut found);
    found
}

/// `topicDocProblems(doc, file, text)`.
pub fn topic_doc_problems(doc: &Value, file: &str, text: &str) -> Vec<Value> {
    let mut issues = Vec::new();
    if !(is_obj(Some(doc)) || matches!(doc, Value::Array(_))) || doc.get("type").and_then(|t| t.as_str()) == Some("namespace") {
        return issues;
    }
    let name = nn(doc.get("name"));
    let sections: Vec<Value> = doc.get("sections").and_then(|s| s.as_array()).cloned().unwrap_or_default();
    let mut empties = 0;
    for (i, sec) in sections.iter().enumerate() {
        if matches!(sec.get("content"), Some(Value::Array(a)) if a.is_empty()) {
            let nth = empties;
            empties += 1;
            let title = match sec.get("title") {
                Some(Value::String(t)) => format!(" \"{t}\""),
                _ => String::new(),
            };
            issues.push(finding(
                "empty_section",
                format!("Topic \"{name}\" section{title} (sections[{i}]) has no content, so it reads as a bare title."),
                format!("In {file}, give sections[{i}] content, such as content: [{{type: 'prose', text: '…'}}], or delete the section."),
                file,
                line_of(text, r#"\bcontent['"]?\s*:\s*\[\s*\]"#, nth, 0),
            ));
        }
    }
    let re = regress::Regex::new(r#"^sections\[(\d+)\]: the key "([^"]+)" is already used by sections\[(\d+)\]"#).unwrap();
    for problem in dsk::section_key_problems(&sections) {
        let Some(m) = re.find(&problem) else { continue };
        let later: usize = problem[m.group(1).unwrap()].parse().unwrap();
        let key = problem[m.group(2).unwrap()].to_string();
        let earlier: usize = problem[m.group(3).unwrap()].parse().unwrap();
        if !docmod::is_nullish(sections.get(later).and_then(|s| s.get("id"))) {
            continue;
        }
        let keyed = dsk::with_section_keys(&serde_json::json!({ "sections": sections }));
        let served = keyed["sections"][later].get("id").and_then(|v| v.as_str()).map(String::from).unwrap_or(format!("{key}-2"));
        let later_line = match sections[later].get("title") {
            Some(Value::String(t)) => {
                let nth = sections[..later].iter().filter(|e| e.get("title").and_then(|x| x.as_str()) == Some(t.as_str())).count();
                line_of(text, &format!(r#"\btitle['"]?\s*:\s*(['"`]){}\1"#, escape_re(t)), nth, 0)
            }
            _ => None,
        };
        let title_of = |i: usize| match sections[i].get("title") {
            Some(Value::String(t)) => format!(" \"{t}\""),
            _ => String::new(),
        };
        issues.push(finding(
            "duplicate_section_key",
            format!(
                "Topic \"{name}\": sections[{earlier}]{} and sections[{later}]{} both have the key \"{key}\", so `astryx docs {name} {key}` opens only sections[{earlier}]; sections[{later}] is served at \"{served}\", a key no one wrote.",
                title_of(earlier),
                title_of(later)
            ),
            format!("In {file}, give sections[{later}] its own title, or write the key it is already served at: id: '{served}'."),
            file,
            later_line,
        ));
    }
    issues
}

/// `integrationDocConsistency(integration, packageDir)`.
pub fn integration_doc_consistency(integration: &Record, package_dir: &str) -> Vec<Value> {
    let mut issues = Vec::new();
    let rel = |f: &str| np::relative(package_dir, f);
    let is_topic = |n: &str| TOPIC_SUFFIXES.iter().any(|s| n.ends_with(s));
    if let Some(c) = integ::s(integration, "components").filter(|c| !c.is_empty()) {
        for doc in files_under(c, &is_topic) {
            let Ok(ns) = docmod::import_doc_module(&doc) else { continue };
            issues.extend(component_doc_problems(&ns, &rel(&doc), &np::read_text(&doc).unwrap_or_default()));
        }
    }
    if let Some(docs) = integ::s(integration, "docs").filter(|d| !d.is_empty() && np::exists(d)) {
        let mut topics: Vec<(String, Value)> = Vec::new();
        for f in files_under(docs, &is_topic) {
            if let Ok(ns) = docmod::import_doc_module(&f) {
                let d = docmod::first_export(&ns, &["docs", "default"]).cloned().unwrap_or(Value::Null);
                topics.push((f, d));
            }
        }
        for (f, d) in &topics {
            issues.extend(topic_doc_problems(d, &rel(f), &np::read_text(f).unwrap_or_default()));
        }
        let langs = super::doc_read::OVERLAY_LANGUAGES;
        for overlay in files_under(docs, &|n| langs.iter().any(|l| n.ends_with(&format!(".doc.{l}.mjs")))) {
            let base = np::basename(&overlay);
            let lang = langs.iter().find(|l| base.ends_with(&format!(".doc.{l}.mjs"))).unwrap();
            let stem = &base[..base.len() - format!(".doc.{lang}.mjs").len()];
            let dir = np::dirname(&overlay);
            if TOPIC_SUFFIXES.iter().any(|s| np::exists(&np::join2(&dir, &format!("{stem}{s}")))) {
                continue;
            }
            let topic_names: Vec<String> = topics
                .iter()
                .filter(|(f, _)| np::dirname(f) == dir)
                .map(|(f, _)| {
                    let b = np::basename(f);
                    for s in TOPIC_SUFFIXES {
                        if let Some(x) = b.strip_suffix(s) {
                            return x.to_string();
                        }
                    }
                    b
                })
                .collect();
            let near = closest(stem, &topic_names);
            let ro = rel(&overlay);
            issues.push(finding(
                "orphan_doc_overlay",
                format!("{ro} overlays a topic file {stem}.doc.mjs that does not exist, so it ships and is never read."),
                match near {
                    Some(n) => format!("Rename {ro} to {}, the overlay of {n}.doc.mjs.", rel(&np::join2(&dir, &format!("{n}.doc.{lang}.mjs")))),
                    None => format!("Delete {ro}, or add the topic it translates as {}.", rel(&np::join2(&dir, &format!("{stem}.doc.mjs")))),
                },
                &ro,
                Some(1),
            ));
        }
    }
    issues
}
