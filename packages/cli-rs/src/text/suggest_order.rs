//! Port of `foundation/text/suggest-order.mjs`.

use super::{js_len, js_lower, levenshtein_distance, levenshtein_within, locale_compare};
use super::string_utils::ScoredMatch;
use crate::json::Value;
use std::collections::{BTreeSet, HashMap, HashSet};

const NEAR_NAME_SCORE: f64 = 19.6;
const SYNONYM_SCORE: f64 = 90.0;
const SAME_WORDS_SCORE: f64 = 100.0;

fn singular(word: String) -> String {
    if js_len(&word) > 3 && word.ends_with('s') && !word.ends_with("ss") {
        let mut w = word;
        w.pop();
        w
    } else {
        word
    }
}

/// Tokens of `/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g` over an
/// ASCII alphanumeric run.
fn camel_tokens(part: &[u8]) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    let n = part.len();
    while i < n {
        let c = part[i];
        if c.is_ascii_uppercase() {
            let mut l = 0;
            while i + l < n && part[i + l].is_ascii_uppercase() {
                l += 1;
            }
            if l >= 2 && i + l < n && part[i + l].is_ascii_lowercase() {
                out.push(String::from_utf8_lossy(&part[i..i + l - 1]).into_owned());
                i += l - 1;
                continue;
            }
            if i + 1 < n && part[i + 1].is_ascii_lowercase() {
                let mut j = i + 1;
                while j < n && part[j].is_ascii_lowercase() {
                    j += 1;
                }
                out.push(String::from_utf8_lossy(&part[i..j]).into_owned());
                i = j;
                continue;
            }
            out.push(String::from_utf8_lossy(&part[i..i + l]).into_owned());
            i += l;
        } else if c.is_ascii_lowercase() {
            let mut j = i;
            while j < n && part[j].is_ascii_lowercase() {
                j += 1;
            }
            out.push(String::from_utf8_lossy(&part[i..j]).into_owned());
            i = j;
        } else if c.is_ascii_digit() {
            let mut j = i;
            while j < n && part[j].is_ascii_digit() {
                j += 1;
            }
            out.push(String::from_utf8_lossy(&part[i..j]).into_owned());
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

/// `nameWords(text)`.
pub fn name_words(text: &str) -> Vec<String> {
    let mut words = Vec::new();
    for part in text.split(|c: char| !c.is_ascii_alphanumeric()) {
        if part.is_empty() {
            continue;
        }
        for w in camel_tokens(part.as_bytes()) {
            words.push(singular(w.to_ascii_lowercase()));
        }
    }
    words
}

fn near_name_slips(typed: &str, name: &str) -> usize {
    let (tl, nl) = (js_len(typed), js_len(name));
    let shorter = tl.min(nl);
    let cap = if shorter >= 8 { 2 } else if shorter >= 5 { 1 } else { 0 };
    if cap == 0 || tl.abs_diff(nl) > cap {
        return 0;
    }
    let slips = levenshtein_within(typed, name, cap, true);
    if slips <= cap { slips } else { 0 }
}

fn affinity_of(typed: &[String], name: &str, typos: bool) -> f64 {
    let words = name_words(name);
    if typed.is_empty() || words.is_empty() {
        return 0.0;
    }
    let typed_joined = typed.concat();
    let joined = words.concat();
    if joined == typed_joined {
        return 40.0;
    }
    let slips = if typos { near_name_slips(&typed_joined, &joined) } else { 0 };
    let near = if slips > 0 { NEAR_NAME_SCORE - slips as f64 * 0.2 } else { 0.0 };
    let have: HashSet<&String> = words.iter().collect();
    let want: HashSet<&String> = typed.iter().collect();
    let covered = typed.iter().filter(|w| have.contains(w)).count() as f64 / typed.len() as f64;
    let precise = words.iter().filter(|w| want.contains(w)).count() as f64 / words.len() as f64;
    let prefix = if joined.starts_with(&typed_joined) || typed_joined.starts_with(&joined) { 1.0 } else { 0.0 };
    let tier = if covered == 1.0 { 2.0 } else if covered > 0.0 { 1.0 } else { 0.0 };
    near.max(tier * 10.0 + covered * 4.0 + precise * 2.0 + prefix + precise * 0.01)
}

fn score_by_affinity<T: Clone>(
    typed_name: &str,
    items: &[T],
    names_of: &dyn Fn(&T) -> Vec<String>,
    typos: bool,
) -> Vec<(usize, f64)> {
    let typed = name_words(typed_name);
    let mut scored: Vec<(usize, f64)> = items
        .iter()
        .enumerate()
        .map(|(i, item)| {
            let mut best = 0.0f64;
            for n in names_of(item) {
                if !n.is_empty() {
                    best = best.max(affinity_of(&typed, &n, typos));
                }
            }
            (i, best)
        })
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap().then(a.0.cmp(&b.0)));
    scored
}

/// `orderByAffinity(typedName, items, namesOf, {typos, closest})`.
pub fn order_by_affinity<T: Clone>(
    typed_name: &str,
    items: &[T],
    names_of: &dyn Fn(&T) -> Vec<String>,
    typos: bool,
    closest: bool,
) -> Vec<T> {
    if !typos {
        return order_by_words(typed_name, items, names_of, closest)
            .into_iter()
            .map(|i| items[i].clone())
            .collect();
    }
    let scored = score_by_affinity(typed_name, items, names_of, true);
    if !closest {
        return scored.into_iter().map(|(i, _)| items[i].clone()).collect();
    }
    let kept: BTreeSet<usize> = order_by_words(typed_name, items, names_of, closest).into_iter().collect();
    scored
        .into_iter()
        .filter(|(i, s)| kept.contains(i) || (*s < 20.0 && *s > NEAR_NAME_SCORE - 1.0))
        .take(kept.len())
        .map(|(i, _)| items[i].clone())
        .collect()
}

fn order_by_words<T: Clone>(
    typed_name: &str,
    items: &[T],
    names_of: &dyn Fn(&T) -> Vec<String>,
    closest: bool,
) -> Vec<usize> {
    let scored = score_by_affinity(typed_name, items, names_of, false);
    if !closest {
        return scored.into_iter().map(|(i, _)| i).collect();
    }
    let words: Vec<String> = name_words(typed_name).into_iter().filter(|w| js_len(w) > 1).collect();
    let tier_of = |i: usize| -> i64 {
        let mut best = 0.0f64;
        for n in names_of(&items[i]) {
            if !n.is_empty() {
                best = best.max(affinity_of(&words, &n, false));
            }
        }
        (best / 10.0).floor() as i64
    };
    let tiers: Vec<i64> = scored.iter().map(|(i, _)| tier_of(*i)).collect();
    let top = tiers.iter().copied().max().unwrap_or(0).max(0);
    if top == 0 {
        return scored.into_iter().map(|(i, _)| i).collect();
    }
    let need = top.min(2);
    scored
        .into_iter()
        .zip(tiers)
        .filter(|(_, t)| *t >= need)
        .map(|((i, _), _)| i)
        .collect()
}

/// `orderRouteSuggestions(topic, suggestions, options)` over `{name, ...}` rows.
pub fn order_route_suggestions<T: Clone>(
    topic: &str,
    suggestions: &[T],
    name_of: &dyn Fn(&T) -> String,
    typos: bool,
    closest: bool,
) -> Vec<T> {
    let mut shared = suggestions.first().map(|s| name_of(s)).unwrap_or_default();
    for s in suggestions {
        let n = name_of(s);
        while !shared.is_empty() && !n.starts_with(&shared) {
            shared.pop();
        }
    }
    let namespace = match shared.rfind('/') {
        Some(i) => shared[..=i].to_string(),
        None => String::new(),
    };
    if !namespace.is_empty() && topic.starts_with(&namespace) {
        let ns = namespace.clone();
        order_by_affinity(
            &topic[namespace.len()..],
            suggestions,
            &|s: &T| vec![name_of(s)[ns.len()..].to_string()],
            typos,
            closest,
        )
    } else {
        order_by_affinity(topic, suggestions, &|s: &T| vec![name_of(s)], typos, closest)
    }
}

const LIBRARY_WORDS: &[&str] = &[
    "mui", "material", "chakra", "ant", "antd", "radix", "bootstrap", "mantine", "shadcn", "headless",
    "aria", "react",
];

/// `synonymMatches(needle, cards)`: names whose card lists the typed name as
/// a synonym. Returned in card order.
pub fn synonym_matches(needle: &str, cards: &Value) -> Vec<String> {
    let typed = name_words(needle).concat();
    let mut found = Vec::new();
    if typed.is_empty() {
        return found;
    }
    let Some(obj) = cards.as_object() else { return found };
    for (name, card) in obj {
        let Some(Value::Array(syns)) = card.get("synonyms") else { continue };
        for syn in syns {
            let Some(syn) = syn.as_str() else { continue };
            let mut words = name_words(syn);
            let whole = words.concat();
            while words.len() > 1 && LIBRARY_WORDS.contains(&words[0].as_str()) {
                words.remove(0);
            }
            if whole == typed || words.concat() == typed {
                if !found.contains(name) {
                    found.push(name.clone());
                }
                break;
            }
        }
    }
    found
}

const PART_WORDS: &[&str] = &[
    "header", "footer", "body", "content", "title", "heading", "description", "item", "trigger",
    "action", "close", "group", "cell", "row", "column", "label", "icon", "root", "wrapper",
];

fn same_part(w: &str) -> &'static [&'static str] {
    match w {
        "item" => &["item", "option"],
        "option" => &["option", "item"],
        "header" => &["header", "heading", "title"],
        "heading" => &["heading", "header", "title"],
        "title" => &["title", "heading", "header"],
        _ => &[],
    }
}

fn compound_match(typed: &[String], name: &str) -> Option<(f64, &'static str)> {
    if typed.len() < 2 {
        return None;
    }
    let words = name_words(name);
    let n = words.len();
    let t = typed.len();
    if n >= 2 && words[..n - 1] == typed[..t - 1] && same_part(&typed[t - 1]).contains(&words[n - 1].as_str()) {
        return Some((79.0, "same part of the family"));
    }
    if n > t && words[n - t..] == typed[..] {
        return Some((78.0, "name ends with the words typed"));
    }
    if n > t && words[0] == typed[0] && words[n - 1] == typed[t - 1] {
        return Some((77.0, "same part of the family"));
    }
    if n < t && typed[..n] == words[..] && typed[n..].iter().all(|w| PART_WORDS.contains(&w.as_str())) {
        return Some((72.0, "the family this part belongs to"));
    }
    None
}

/// `rankComponentSuggestions(needle, results, allNames, synonyms)`.
pub fn rank_component_suggestions(
    needle: &str,
    results: &[ScoredMatch],
    all_names: &[String],
    synonyms: &[String],
) -> Vec<ScoredMatch> {
    let term = js_lower(needle);
    let typed = name_words(needle);
    struct Row {
        name: String,
        score: f64,
        reason: String,
        keyword_at: f64,
    }
    let mut order: Vec<String> = Vec::new();
    let mut by_name: HashMap<String, Row> = HashMap::new();
    let set = |order: &mut Vec<String>, by: &mut HashMap<String, Row>, row: Row| {
        if !by.contains_key(&row.name) {
            order.push(row.name.clone());
        }
        by.insert(row.name.clone(), row);
    };
    for r in results {
        set(&mut order, &mut by_name, Row {
            name: r.name.clone(),
            score: r.score,
            reason: r.reason.clone(),
            keyword_at: r.keyword_at.map(|k| k as f64).unwrap_or(f64::INFINITY),
        });
    }
    let joined = typed.concat();
    for name in all_names {
        if !joined.is_empty() && name_words(name).concat() == joined {
            set(&mut order, &mut by_name, Row { name: name.clone(), score: SAME_WORDS_SCORE, reason: "same name".into(), keyword_at: -1.0 });
        }
    }
    for name in synonyms {
        if !all_names.contains(name) {
            continue;
        }
        let prior = by_name.get(name).map(|p| p.score);
        if prior.map_or(true, |s| s < SYNONYM_SCORE) {
            set(&mut order, &mut by_name, Row { name: name.clone(), score: SYNONYM_SCORE, reason: "another name for it".into(), keyword_at: f64::INFINITY });
        }
    }
    for name in all_names {
        let Some((score, reason)) = compound_match(&typed, name) else { continue };
        let prior = by_name.get(name).map(|p| p.score);
        if prior.map_or(true, |s| score > s) {
            set(&mut order, &mut by_name, Row { name: name.clone(), score, reason: reason.into(), keyword_at: f64::INFINITY });
        }
    }
    let term16: Vec<u16> = term.encode_utf16().collect();
    let lead = |name: &str| -> f64 {
        let lower: Vec<u16> = js_lower(name).encode_utf16().collect();
        let mut i = 0;
        while i < term16.len() && i < lower.len() && term16[i] == lower[i] {
            i += 1;
        }
        i as f64 / term16.len().max(lower.len()) as f64
    };
    let shared = |name: &str| -> f64 {
        let words = name_words(name);
        let has = |t: &String| {
            words.iter().any(|w| {
                w == t || (js_len(w).min(js_len(t)) >= 3 && (w.starts_with(t.as_str()) || t.starts_with(w.as_str())))
            })
        };
        let count = typed.iter().filter(|t| has(t)).count() as f64;
        if typed.len() > 1 && has(&typed[typed.len() - 1]) { count + 0.5 } else { count }
    };
    struct Ranked {
        name: String,
        score: f64,
        reason: String,
        keyword_at: f64,
        synonym: f64,
        shared: f64,
        distance: usize,
        lead: f64,
    }
    let mut ranked: Vec<Ranked> = order
        .iter()
        .map(|n| {
            let r = &by_name[n];
            Ranked {
                name: r.name.clone(),
                score: r.score,
                reason: r.reason.clone(),
                keyword_at: r.keyword_at,
                synonym: if synonyms.contains(&r.name) { 1.0 } else { 0.0 },
                shared: shared(&r.name),
                distance: levenshtein_distance(&term, &js_lower(&r.name)),
                lead: lead(&r.name),
            }
        })
        .collect();
    let cmp_f = |x: f64, y: f64| x.partial_cmp(&y).unwrap_or(std::cmp::Ordering::Equal);
    ranked.sort_by(|a, b| {
        cmp_f(b.score, a.score)
            .then(cmp_f(b.synonym, a.synonym))
            .then(cmp_f(b.shared, a.shared))
            .then(cmp_f(a.keyword_at, b.keyword_at))
            .then(a.distance.cmp(&b.distance))
            .then(cmp_f(b.lead, a.lead))
            .then_with(|| locale_compare(&a.name, &b.name))
    });
    ranked
        .into_iter()
        .map(|r| ScoredMatch { name: r.name, score: r.score, reason: r.reason, keyword_at: None })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn words() {
        assert_eq!(name_words("HTMLEditor"), vec!["html", "editor"]);
        assert_eq!(name_words("useFocusTraps"), vec!["use", "focu", "trap"]);
        assert_eq!(name_words("ABC"), vec!["abc"]);
    }
}
