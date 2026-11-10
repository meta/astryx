//! The words build's page ranker reads (`api/build/kit/words.mjs`): a
//! template's terms and families, an idea's modifiers, containers and phrase
//! pairs, and search's synonyms.

use super::js::{self, re, Regex};
use super::vocab::{stem, stopwords, SYNONYMS};
use indexmap::{IndexMap, IndexSet};
use std::sync::OnceLock;

/// A page template the kit can recommend starting from.
#[derive(Debug, Clone, Default)]
pub struct PageTemplate {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub package: String,
    pub category: String,
    pub keywords: Vec<String>,
    pub file_path: String,
    pub command: String,
}

/// A block the kit can name, as search names a block result.
#[derive(Debug, Clone, Default)]
pub struct BlockTemplate {
    pub name: String,
    pub package: String,
    pub display_name: String,
    pub description: String,
    pub command: String,
}

/// A component, as the ranker reads it.
#[derive(Debug, Clone, Default)]
pub struct ComponentWords {
    pub name: String,
    pub keywords: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdeaKind {
    Page,
    Part,
    Edit,
}

pub const SHELL_FAMILY: &str = "Shell";

pub fn head_end() -> &'static Regex {
    re(
        r":|,|;|\(|\s[-\u2013\u2014]\s|\b(?:with|showing|listing|for|that|where|plus|including|containing|featuring|which|to|from|of)\b",
        "i",
    )
}

pub fn container_phrase() -> &'static Regex {
    re(r"\b(?:in|inside|within)\s+(?:a|an|the)\s+([a-z-]+)(?:\s+([a-z-]+))?", "i")
}

pub fn phrase_end() -> &'static Regex {
    re(r"[^a-z0-9\s-]+|\s(?:and|or|with|for|of|to|in|on|at|by|from|the|a|an|plus)\s", "")
}

const OVERLAY_FRAMES: &[&str] = &["modal", "dialog", "drawer", "sheet", "popup", "overlay"];

fn is_content_word(t: &str) -> bool {
    t.len() >= 2 && (t == "side" || !stopwords().contains(t))
}

/// Content terms of a text: lowercase alphanumeric words, stopwords removed,
/// stemmed.
pub fn terms(text: &str) -> Vec<String> {
    js::alnum_runs(&js::lower(text))
        .into_iter()
        .filter(|t| is_content_word(t))
        .map(|t| stem(&t))
        .collect()
}

/// The terms of an idea that only ever modify another word, each with the
/// words it modifies.
pub fn modifiers_of(query: &str) -> IndexMap<String, IndexSet<String>> {
    let mut heads = IndexSet::new();
    let mut modifiers: IndexMap<String, IndexSet<String>> = IndexMap::new();
    for phrase in js::split(&js::lower(query), phrase_end()) {
        let words = terms(&phrase);
        for (i, w) in words.iter().enumerate() {
            if i == words.len() - 1 {
                heads.insert(w.clone());
            } else {
                modifiers.entry(w.clone()).or_default().insert(words[i + 1].clone());
            }
        }
    }
    for h in &heads {
        modifiers.shift_remove(h);
    }
    modifiers
}

/// Adjacent term pairs the texts name, "a b".
pub fn pairs_of(texts: &[&str]) -> IndexSet<String> {
    let mut pairs = IndexSet::new();
    for text in texts {
        for phrase in js::split(&js::lower(text), phrase_end()) {
            let words = terms(&phrase);
            for i in 1..words.len() {
                pairs.insert(format!("{} {}", words[i - 1], words[i]));
            }
        }
    }
    pairs
}

/// The overlay frames a text names in a container phrase ("in a modal").
pub fn containers_of(query: &str) -> IndexSet<String> {
    let mut found = IndexSet::new();
    let r = container_phrase();
    for m in r.find_iter(query) {
        let g1 = m.group(1).map(|g| &query[g]).unwrap_or("");
        let g2 = m.group(2).map(|g| &query[g]).unwrap_or("");
        for t in terms(&format!("{g1} {g2}")) {
            if OVERLAY_FRAMES.contains(&t.as_str()) {
                found.insert(t);
            }
        }
    }
    found
}

/// Lowercase alphanumeric words joined by single spaces.
pub fn normalized(text: &str) -> String {
    js::alnum_runs(&js::lower(text)).join(" ")
}

/// Stemmed synonym lookup built from search's vocabulary, both directions.
pub fn synonyms_of() -> &'static IndexMap<String, IndexSet<String>> {
    static S: OnceLock<IndexMap<String, IndexSet<String>>> = OnceLock::new();
    S.get_or_init(|| {
        let mut index: IndexMap<String, IndexSet<String>> = IndexMap::new();
        let mut add = |a: String, b: String| {
            index.entry(a).or_default().insert(b);
        };
        for (key, values) in SYNONYMS {
            let k = stem(key);
            for value in values.iter() {
                let v = stem(value);
                add(k.clone(), v.clone());
                add(v.clone(), k.clone());
                for other in values.iter() {
                    if other != value {
                        add(v.clone(), stem(other));
                    }
                }
            }
        }
        index
    })
}

/// A template's family: its category before " - ", trimmed.
pub fn family_of(page: &PageTemplate) -> String {
    js_trim(page.category.split(" - ").next().unwrap_or(""))
}

/// `String#trim` (JS whitespace).
pub fn js_trim(s: &str) -> String {
    s.trim_matches(|c: char| crate::cli::format::js_ws(c)).to_string()
}

/// Family words, from the templates' own ids: a word in the ids of two or
/// more templates of one family, plus the family's name when a template
/// carries it. Each word maps to its family.
pub fn family_words_of(pages: &[PageTemplate]) -> IndexMap<String, String> {
    let mut id_words: IndexMap<String, IndexMap<String, usize>> = IndexMap::new();
    for page in pages {
        let family = family_of(page);
        let counts = id_words.entry(family).or_default();
        let mut seen = IndexSet::new();
        for w in page.name.split('-') {
            if !seen.insert(w) {
                continue;
            }
            if js::len16(w) >= 3 {
                *counts.entry(stem(w)).or_insert(0) += 1;
            }
        }
    }
    let mut family_of_word = IndexMap::new();
    for (family, counts) in &id_words {
        let mut heads: Vec<String> = counts.iter().filter(|(_, c)| **c >= 2).map(|(w, _)| w.clone()).collect();
        let norm = normalized(family);
        let name = norm.split(' ').last().unwrap_or("").to_string();
        if js::len16(&name) >= 3 && counts.contains_key(&stem(&name)) {
            heads.push(stem(&name));
        }
        for head in heads {
            family_of_word.entry(head).or_insert_with(|| family.clone());
        }
    }
    family_of_word
}
