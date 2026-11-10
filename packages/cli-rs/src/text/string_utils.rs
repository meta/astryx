//! Port of `foundation/text/string-utils.mjs`.

use super::{js_len, js_lower, levenshtein_distance, locale_compare};
use crate::json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// One scored component match.
#[derive(Debug, Clone, PartialEq)]
pub struct ScoredMatch {
    pub name: String,
    pub score: f64,
    pub reason: String,
    /// Index of the keyword that set the score, when one did.
    pub keyword_at: Option<usize>,
}

/// `findClosestComponents(name, components, maxDistance)`.
pub fn find_closest_components(
    name: &str,
    all_names: &[String],
    max_distance: usize,
) -> Vec<(String, usize)> {
    let needle = js_lower(name);
    let mut matches: Vec<(String, usize)> = all_names
        .iter()
        .map(|c| (c.clone(), levenshtein_distance(&needle, &js_lower(c))))
        .filter(|(_, d)| *d <= max_distance)
        .collect();
    matches.sort_by_key(|(_, d)| *d);
    matches
}

fn is_word(u: u16) -> bool {
    (u as u32) < 128 && ((u as u8).is_ascii_alphanumeric() || u == b'_' as u16)
}

/// `new RegExp('\\b' + escape(term) + '\\b').test(text)`.
pub fn has_word(text: &str, term: &str) -> bool {
    let t: Vec<u16> = text.encode_utf16().collect();
    let w: Vec<u16> = term.encode_utf16().collect();
    if w.is_empty() || w.len() > t.len() {
        return w.is_empty() && false;
    }
    let boundary = |i: usize| -> bool {
        let before = i > 0 && is_word(t[i - 1]);
        let after = i < t.len() && is_word(t[i]);
        before != after
    };
    for i in 0..=t.len() - w.len() {
        if t[i..i + w.len()] == w[..] && boundary(i) && boundary(i + w.len()) {
            return true;
        }
    }
    false
}

/// Locates a core component's doc as `searchComponents` does.
fn doc_path_of(src_dir: &Path, comp: &str) -> Option<PathBuf> {
    let direct = src_dir.join(comp).join(format!("{comp}.doc.mjs"));
    if direct.exists() {
        return Some(direct);
    }
    let xds = src_dir.join(comp).join(format!("XDS{comp}.doc.mjs"));
    if xds.exists() {
        return Some(xds);
    }
    if !src_dir.exists() {
        return None;
    }
    for entry in crate::discovery::component_discovery::list_dir_entries(src_dir) {
        if !entry.is_dir {
            continue;
        }
        let nested = src_dir.join(&entry.name).join(comp).join(format!("{comp}.doc.mjs"));
        if nested.exists() {
            return Some(nested);
        }
    }
    None
}

/// `searchComponents(needle, coreDir, components)`. `doc_view` reads the
/// `docs` export of a component doc (the doc compiler's `readDocView`).
pub fn search_components(
    needle: &str,
    core_dir: &Path,
    all_names: &[String],
    doc_view: &dyn Fn(&Path) -> Option<Value>,
) -> Vec<ScoredMatch> {
    let term = js_lower(needle);
    let term_len = js_len(&term);
    let mut order: Vec<String> = Vec::new();
    let mut scored: HashMap<String, ScoredMatch> = HashMap::new();
    let mut keyword_at: HashMap<String, usize> = HashMap::new();

    let add = |scored: &mut HashMap<String, ScoredMatch>,
                   order: &mut Vec<String>,
                   name: &str,
                   score: f64,
                   reason: String| {
        match scored.get(name) {
            Some(e) if score <= e.score => {}
            Some(_) => {
                scored.insert(
                    name.to_string(),
                    ScoredMatch { name: name.to_string(), score, reason, keyword_at: None },
                );
            }
            None => {
                order.push(name.to_string());
                scored.insert(
                    name.to_string(),
                    ScoredMatch { name: name.to_string(), score, reason, keyword_at: None },
                );
            }
        }
    };

    for comp in all_names {
        let lower = js_lower(comp);
        if lower == term {
            add(&mut scored, &mut order, comp, 100.0, "exact name".into());
            continue;
        }
        let (shorter, longer) = if term_len < js_len(&lower) { (&term, &lower) } else { (&lower, &term) };
        if js_len(shorter) >= 4 && longer.contains(shorter.as_str()) {
            let coverage = js_len(shorter) as f64 / js_len(longer) as f64;
            if coverage >= 0.5 {
                add(&mut scored, &mut order, comp, 60.0, format!("name contains \"{shorter}\""));
            }
        }
        let dist = levenshtein_distance(&term, &lower);
        match dist {
            1 => add(&mut scored, &mut order, comp, 80.0, format!("similar name (distance {dist})")),
            2 => add(&mut scored, &mut order, comp, 40.0, format!("similar name (distance {dist})")),
            3 => add(&mut scored, &mut order, comp, 20.0, format!("similar name (distance {dist})")),
            _ => {}
        }
    }

    let src_dir = core_dir.join("src");
    for comp in all_names {
        let Some(doc_path) = doc_path_of(&src_dir, comp) else { continue };
        let Some(docs) = doc_view(&doc_path) else { continue };
        if docs.is_null() {
            continue;
        }
        if let Some(Value::Array(keywords)) = docs.get("keywords") {
            for (at, kw) in keywords.iter().enumerate() {
                let Some(kw) = kw.as_str() else { break };
                let kw_lower = js_lower(kw);
                let before = scored.get(comp).map(|s| s.score).unwrap_or(0.0);
                if kw_lower == term {
                    add(&mut scored, &mut order, comp, 90.0, format!("keyword \"{kw}\""));
                    if !keyword_at.contains_key(comp) || before < 90.0 {
                        keyword_at.insert(comp.clone(), at);
                    }
                    break;
                }
                let (s, l) = if term_len < js_len(&kw_lower) { (&term, &kw_lower) } else { (&kw_lower, &term) };
                if js_len(s) >= 4 && l.contains(s.as_str()) {
                    let coverage = js_len(s) as f64 / js_len(l) as f64;
                    if coverage >= 0.5 {
                        add(&mut scored, &mut order, comp, 70.0, format!("keyword \"{kw}\""));
                    }
                }
                let dist = levenshtein_distance(&term, &kw_lower);
                if dist == 1 {
                    add(&mut scored, &mut order, comp, 70.0, format!("keyword \"{kw}\" (distance {dist})"));
                } else if dist == 2 {
                    add(&mut scored, &mut order, comp, 30.0, format!("keyword \"{kw}\" (distance {dist})"));
                }
                if scored.get(comp).map(|s| s.score).unwrap_or(0.0) > before {
                    keyword_at.insert(comp.clone(), at);
                }
            }
        }
        let desc = docs
            .get("usage")
            .and_then(|u| u.get("description"))
            .and_then(truthy_str)
            .or_else(|| docs.get("description").and_then(truthy_str));
        if let Some(desc) = desc {
            if term_len >= 3 && has_word(&js_lower(desc), &term) {
                add(&mut scored, &mut order, comp, 50.0, format!("description mentions \"{term}\""));
            }
        }
        if let Some(Value::Array(bps)) = docs.get("usage").and_then(|u| u.get("bestPractices")) {
            if term_len >= 3 {
                for bp in bps {
                    let d = bp.get("description").and_then(|d| d.as_str()).unwrap_or("");
                    if has_word(&js_lower(d), &term) {
                        add(&mut scored, &mut order, comp, 50.0, format!("best practice mentions \"{term}\""));
                        break;
                    }
                }
            }
        }
    }

    if scored.is_empty() {
        let words = split_words(needle);
        let by_lower: HashMap<String, &String> = all_names.iter().map(|n| (js_lower(n), n)).collect();
        let longest = all_names.iter().map(|n| js_len(n)).max().unwrap_or(0);
        for i in 0..words.len() {
            let mut run = String::new();
            for j in i + 1..=words.len() {
                run.push_str(&words[j - 1]);
                if js_len(&run) > longest {
                    break;
                }
                if js_len(&run) < 4 || run == term {
                    continue;
                }
                let Some(comp) = by_lower.get(&run) else { continue };
                let span = (j - i).min(4);
                let at_end = if j == words.len() { 1 } else { 0 };
                add(&mut scored, &mut order, comp, (10 + span + at_end) as f64, format!("name part \"{run}\""));
            }
        }
        let best = scored.values().map(|r| r.score).fold(0.0, f64::max);
        scored.retain(|_, r| r.score >= best);
    }

    let mut results: Vec<ScoredMatch> = order
        .iter()
        .filter_map(|n| scored.get(n).cloned())
        .map(|mut r| {
            r.keyword_at = keyword_at.get(&r.name).copied();
            r
        })
        .collect();
    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap()
            .then_with(|| locale_compare(&a.name, &b.name))
    });
    results
}

fn truthy_str(v: &Value) -> Option<&str> {
    v.as_str().filter(|s| !s.is_empty())
}

/// The word split of the name-part fallback: camel case apart, lower case,
/// split on anything not a letter or digit.
fn split_words(needle: &str) -> Vec<String> {
    let chars: Vec<char> = needle.chars().collect();
    // /([a-z0-9])([A-Z])/g -> '$1 $2'
    let mut a = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        a.push(c);
        if (c.is_ascii_lowercase() || c.is_ascii_digit())
            && i + 1 < chars.len()
            && chars[i + 1].is_ascii_uppercase()
        {
            a.push(' ');
            a.push(chars[i + 1]);
            i += 2;
            continue;
        }
        i += 1;
    }
    // /([A-Z])([A-Z][a-z])/g -> '$1 $2'
    let chars: Vec<char> = a.chars().collect();
    let mut b = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_ascii_uppercase()
            && i + 2 < chars.len()
            && chars[i + 1].is_ascii_uppercase()
            && chars[i + 2].is_ascii_lowercase()
        {
            b.push(c);
            b.push(' ');
            b.push(chars[i + 1]);
            b.push(chars[i + 2]);
            i += 3;
            continue;
        }
        b.push(c);
        i += 1;
    }
    js_lower(&b)
        .split(|c: char| !(c.is_ascii_lowercase() || c.is_ascii_digit()))
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

/// `firstSentence(text)`.
pub fn first_sentence(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let b = flat.as_bytes();
    for (i, &c) in b.iter().enumerate() {
        if (c == b'.' || c == b'!' || c == b'?') && (i + 1 == b.len() || b[i + 1] == b' ') {
            let before = &flat[..i];
            let lower = before.to_ascii_lowercase();
            let abbrev = (lower.ends_with("e.g") || lower.ends_with("i.e")) && {
                let k = before.len() - 3;
                k == 0 || !is_word(b[k - 1] as u16)
            };
            if !abbrev {
                return flat[..=i].to_string();
            }
        }
    }
    flat
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn words() {
        assert_eq!(split_words("DataTableRow"), vec!["data", "table", "row"]);
        assert_eq!(split_words("HTMLEditor"), vec!["html", "editor"]);
        assert!(has_word("a button here", "button"));
        assert!(!has_word("buttons", "button"));
        assert_eq!(first_sentence("Use it, e.g. here. Then"), "Use it, e.g. here.");
    }
}
