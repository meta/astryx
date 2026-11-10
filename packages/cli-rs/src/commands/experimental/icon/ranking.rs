//! Port of `foundation/discovery/icon-ranking.mjs`: icon records and the
//! ranking every icon read uses. Pure: no environment access.

use super::api::{Definition, IconSet};
use crate::json::{Map, Value};

#[derive(Debug, Clone)]
pub struct Icon {
    pub id: String,
    pub export: String,
    pub module: Option<String>,
    pub words: Vec<String>,
    pub variants: Vec<(String, String, Option<String>)>,
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

fn strs(v: Option<&Value>) -> Vec<String> {
    v.and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

pub fn icons_of(set: &IconSet) -> Vec<Icon> {
    set.data
        .get("icons")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .map(|i| Icon {
                    id: s(i, "id"),
                    export: s(i, "export"),
                    module: i.get("module").and_then(|m| m.as_str()).map(String::from),
                    words: strs(i.get("words")),
                    variants: i
                        .get("variants")
                        .and_then(|v| v.as_array())
                        .map(|vs| {
                            vs.iter()
                                .map(|v| (s(v, "variant"), s(v, "export"), v.get("module").and_then(|m| m.as_str()).map(String::from)))
                                .collect()
                        })
                        .unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// `definitionsByIcon`: definition names by icon id, in `map` order.
pub fn definitions_by_icon(data: &Value) -> Vec<(String, Vec<String>)> {
    let mut out: Vec<(String, Vec<String>)> = Vec::new();
    if let Some(m) = data.get("map").and_then(|m| m.as_object()) {
        for (name, id) in m {
            let id = id.as_str().unwrap_or("").to_string();
            match out.iter_mut().find(|(i, _)| *i == id) {
                Some((_, l)) => l.push(name.clone()),
                None => out.push((id, vec![name.clone()])),
            }
        }
    }
    out
}

fn defs_for(by: &[(String, Vec<String>)], id: &str) -> Vec<String> {
    by.iter().find(|(i, _)| i == id).map(|(_, l)| l.clone()).unwrap_or_default()
}

pub fn import_line(export: &str, module: &str) -> String {
    format!("import {{{export}}} from '{module}';")
}

/// `iconRecord` as a JSON object (key order as the JS object).
pub fn icon_record(set: &IconSet, icon: &Icon, definitions: Option<Vec<String>>) -> Map<String, Value> {
    let module = icon.module.clone().unwrap_or_else(|| s(&set.data, "module"));
    let defs = definitions.unwrap_or_else(|| defs_for(&definitions_by_icon(&set.data), &icon.id));
    let mut m = Map::new();
    m.insert("set".into(), Value::String(set.name.clone()));
    m.insert("id".into(), Value::String(icon.id.clone()));
    m.insert("package".into(), Value::String(set.package.clone()));
    m.insert("module".into(), Value::String(module.clone()));
    m.insert("export".into(), Value::String(icon.export.clone()));
    m.insert("import".into(), Value::String(import_line(&icon.export, &module)));
    m.insert("words".into(), Value::Array(icon.words.iter().cloned().map(Value::String).collect()));
    m.insert("definitions".into(), Value::Array(defs.into_iter().map(Value::String).collect()));
    m.insert(
        "variants".into(),
        Value::Array(
            icon.variants
                .iter()
                .map(|(v, e, md)| {
                    let mut vm = Map::new();
                    vm.insert("variant".into(), Value::String(v.clone()));
                    vm.insert("module".into(), Value::String(md.clone().unwrap_or_else(|| module.clone())));
                    vm.insert("export".into(), Value::String(e.clone()));
                    Value::Object(vm)
                })
                .collect(),
        ),
    );
    m
}

fn squash(v: &str) -> String {
    v.to_lowercase().chars().filter(|c| !(c.is_whitespace() || *c == '_' || *c == '-')).collect()
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Tier {
    Definition,
    Exact,
    Prefix,
    Partial,
}

#[derive(Debug, Clone)]
struct IconMatch {
    tier: Tier,
    name: bool,
    meaning: bool,
    rank: i64,
    reason: String,
}

fn index_of(v: &[String], x: &str) -> i64 {
    v.iter().position(|w| w == x).map(|p| p as i64).unwrap_or(-1)
}

fn js_ws_split(s: &str) -> Vec<&str> {
    s.split(char::is_whitespace).filter(|x| !x.is_empty()).collect()
}

fn match_icon(query: &str, icon: &Icon, definitions: &[String]) -> Option<IconMatch> {
    let joined = squash(query);
    if let Some(d) = definitions.iter().find(|n| n.to_lowercase() == joined) {
        return Some(IconMatch { tier: Tier::Definition, name: false, meaning: false, rank: 0, reason: format!("definition \"{d}\"") });
    }
    let id = js_ws_split(query).join("-");
    // `query.replace(/\s+/g, '-')` keeps leading/trailing runs too; the query
    // is trimmed, so joining the parts is the same.
    let parts: Vec<&str> = icon.id.split('-').collect();
    let tags: Vec<String> = icon.words.iter().filter(|w| **w != icon.id && !parts.contains(&w.as_str())).cloned().collect();
    let tag_at = index_of(&tags, query);
    let whole = icon.id == id;
    let part_word = !whole && parts.contains(&query) && icon.words.iter().any(|w| w == query);
    if whole || part_word || tag_at >= 0 {
        return Some(IconMatch {
            tier: Tier::Exact,
            name: whole || part_word,
            meaning: !whole && !part_word,
            rank: if whole { 0 } else if part_word { 2 } else { tag_at },
            reason: if whole { format!("id \"{}\"", icon.id) } else { format!("word \"{query}\"") },
        });
    }
    if let Some(plural) = icon.words.iter().find(|w| same_word(w, query)) {
        let named = parts.contains(&plural.as_str());
        return Some(IconMatch {
            tier: Tier::Exact,
            name: named,
            meaning: !named,
            rank: if named {
                if *plural == icon.id {
                    1
                } else {
                    3
                }
            } else {
                tags.len() as i64 + index_of(&tags, plural)
            },
            reason: format!("word \"{plural}\""),
        });
    }
    if let Some(p) = icon.words.iter().find(|w| w.starts_with(query)) {
        return Some(IconMatch {
            tier: Tier::Prefix,
            name: false,
            meaning: false,
            rank: 0,
            reason: format!("word \"{p}\" starts with \"{query}\""),
        });
    }
    let compact: String = query.chars().filter(|c| !c.is_whitespace()).collect();
    if compact.encode_utf16().count() >= 3 {
        let mut all = vec![icon.id.clone()];
        all.extend(icon.words.iter().cloned());
        if let Some(c) = all.iter().find(|t| t.contains(query)) {
            return Some(IconMatch { tier: Tier::Partial, name: false, meaning: false, rank: 0, reason: format!("partial \"{c}\"") });
        }
    }
    let tokens = js_ws_split(query);
    if tokens.len() > 1 {
        let mut all: Vec<&str> = icon.id.split('-').collect();
        for w in &icon.words {
            all.extend(js_ws_split(w));
        }
        if tokens.iter().all(|t| all.iter().any(|p| p.starts_with(t))) {
            return Some(IconMatch {
                tier: Tier::Partial,
                name: false,
                meaning: false,
                rank: 0,
                reason: format!("partial \"{}\"", tokens.join(" ")),
            });
        }
    }
    None
}

fn same_word(a: &str, b: &str) -> bool {
    if a == b || a.chars().any(char::is_whitespace) || b.chars().any(char::is_whitespace) {
        return false;
    }
    let (short, long) = if a.encode_utf16().count() < b.encode_utf16().count() { (a, b) } else { (b, a) };
    short.encode_utf16().count() >= 2 && (long == format!("{short}s") || long == format!("{short}es"))
}

const FILLER: [&str; 10] = ["a", "an", "the", "go", "to", "my", "of", "for", "icon", "icons"];

fn typed_query(q: &str) -> String {
    js_ws_split(&crate::commands::gap_report::api::js_trim(q).to_lowercase()).join(" ")
}

fn icon_query(q: &str) -> String {
    let typed = typed_query(q);
    let words: Vec<&str> = typed.split(' ').filter(|w| !w.is_empty()).collect();
    let named: Vec<&str> = words.iter().copied().filter(|w| !FILLER.contains(w)).collect();
    if words.len() > 1 && !named.is_empty() {
        named.join(" ")
    } else {
        words.join(" ")
    }
}

/// `answeringMatches` over (score, entry).
pub fn answering(ranked: Vec<(i64, Map<String, Value>)>) -> Vec<(i64, Map<String, Value>)> {
    for floor in [80, 60] {
        if ranked.iter().any(|(s, _)| *s >= floor) {
            return ranked.into_iter().filter(|(s, _)| *s >= floor).collect();
        }
    }
    ranked
}

fn score_of(m: &IconMatch, leading_name: bool) -> i64 {
    match m.tier {
        Tier::Definition => 100,
        Tier::Exact => {
            if (leading_name && m.name) || (!leading_name && m.meaning) {
                90
            } else {
                80
            }
        }
        Tier::Prefix => 60,
        Tier::Partial => 40,
    }
}

fn with_definition_words(icon: &Icon, definitions: &[String], lookup: &dyn Fn(&str) -> Option<Vec<String>>) -> Icon {
    if definitions.is_empty() {
        return icon.clone();
    }
    let mut words = icon.words.clone();
    for name in definitions {
        let mut humanized = String::new();
        let chars: Vec<char> = name.chars().collect();
        for (i, c) in chars.iter().enumerate() {
            if c.is_ascii_uppercase() && i > 0 && (chars[i - 1].is_ascii_lowercase() || chars[i - 1].is_ascii_digit()) {
                humanized.push(' ');
            }
            humanized.push(*c);
        }
        let mut list = vec![humanized.to_lowercase()];
        list.extend(lookup(name).unwrap_or_default());
        for w in list {
            let l = w.to_lowercase();
            if !words.contains(&l) {
                words.push(l);
            }
        }
    }
    Icon { words, ..icon.clone() }
}

/// `rankIcons(sets, query)`: (score, entry) best first; each entry is the
/// icon record plus `reason` and `score`.
pub fn rank_icons(sets: &[&IconSet], query: &str, astryx: &[Definition], own: &dyn Fn(&IconSet, &str) -> Option<Vec<String>>) -> Vec<(i64, Map<String, Value>)> {
    let typed = typed_query(query);
    let as_typed = rank_term(sets, &typed, astryx, own);
    if as_typed.iter().any(|(s, _)| *s >= 80) {
        return as_typed;
    }
    let named = icon_query(query);
    if named == typed {
        return as_typed;
    }
    let without = rank_term(sets, &named, astryx, own);
    if without.is_empty() {
        as_typed
    } else {
        without
    }
}

fn rank_term(sets: &[&IconSet], term: &str, astryx: &[Definition], own: &dyn Fn(&IconSet, &str) -> Option<Vec<String>>) -> Vec<(i64, Map<String, Value>)> {
    struct Hit<'a> {
        set: &'a IconSet,
        icon: Icon,
        definitions: Vec<String>,
        m: IconMatch,
        set_index: usize,
    }
    let mut hits: Vec<Hit> = Vec::new();
    for (set_index, set) in sets.iter().enumerate() {
        let by = definitions_by_icon(&set.data);
        for icon in icons_of(set) {
            let definitions = defs_for(&by, &icon.id);
            let lookup = |n: &str| -> Option<Vec<String>> {
                astryx.iter().find(|d| d.name == n).map(|d| d.words.clone()).or_else(|| own(set, n))
            };
            let widened = with_definition_words(&icon, &definitions, &lookup);
            if let Some(m) = match_icon(term, &widened, &definitions) {
                hits.push(Hit { set, icon, definitions, m, set_index });
            }
        }
    }
    let (mut names, mut meanings) = (0, 0);
    for h in &hits {
        if h.m.tier == Tier::Exact {
            if h.m.name {
                names += 1;
            }
            if h.m.meaning {
                meanings += 1;
            }
        }
    }
    let leading_name = names > meanings;
    let mut found: Vec<(i64, i64, usize, String, Map<String, Value>)> = hits
        .into_iter()
        .map(|h| {
            let score = score_of(&h.m, leading_name);
            let mut entry = icon_record(h.set, &h.icon, Some(h.definitions.clone()));
            entry.insert("reason".into(), Value::String(h.m.reason.clone()));
            entry.insert("score".into(), Value::from(score));
            let rank = if h.m.tier == Tier::Exact { h.m.rank } else { 0 };
            (score, rank, h.set_index, h.icon.id.clone(), entry)
        })
        .collect();
    found.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then(a.2.cmp(&b.2))
            .then(a.1.cmp(&b.1))
            .then_with(|| crate::discovery::jsort::cmp_utf16(&a.3, &b.3))
    });
    found.into_iter().map(|(s, _, _, _, e)| (s, e)).collect()
}
