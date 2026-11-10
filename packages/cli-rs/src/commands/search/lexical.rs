//! The lexical ranker (`_lexical.mjs` `rankLexical`) and the result shape
//! (`_result.mjs` `toResult`).

use super::cand::Candidate;
use super::score::*;
use super::words::*;
use crate::json::{Map, Value};
use std::collections::HashMap;

/// One search result, with the fields ranking reads kept typed.
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub domain: String,
    pub name: String,
    pub package: Option<String>,
    pub section: Option<String>,
    pub score: i64,
    pub reason: String,
    pub matched: usize,
    pub total: usize,
    /// Index of the candidate in the catalog.
    pub cand: usize,
    pub description: String,
}

/// `toResult(candidate, ...)` as JSON, key order as the JS spread builds it.
pub fn result_json(r: &SearchResult, c: &Candidate, outside: bool) -> Value {
    let mut m = Map::new();
    let s = |x: &str| Value::String(x.to_string());
    m.insert("domain".into(), s(&c.domain));
    m.insert("name".into(), s(c.result_name()));
    if let Some(p) = &c.package {
        m.insert("package".into(), s(p));
    }
    m.insert("score".into(), Value::from(r.score));
    m.insert("reason".into(), s(&r.reason));
    m.insert("description".into(), s(&r.description));
    match c.domain.as_str() {
        "component" => {
            if let Some(i) = &c.import {
                m.insert("import".into(), s(i));
            }
            m.insert(
                "command".into(),
                s(&c.command.clone().unwrap_or_else(|| format!("astryx component {}", c.name))),
            );
            if let Some(d) = &c.deprecated {
                m.insert("deprecated".into(), d.clone());
            }
        }
        "hook" => {
            if let Some(i) = &c.import {
                m.insert("import".into(), s(i));
            }
            m.insert("command".into(), s(&format!("astryx hook {}", c.name)));
        }
        "doc" => {
            m.insert("name".into(), s(c.topic.as_deref().unwrap_or(&c.name)));
            if let Some(sec) = c.section.as_deref().filter(|x| !x.is_empty()) {
                m.insert("section".into(), s(sec));
            }
            if let Some(t) = &c.title {
                m.insert("title".into(), s(t));
            }
            m.insert("command".into(), s(&c.command.clone().unwrap_or_else(|| format!("astryx docs {}", c.name))));
            if let Some(p) = c.parent.as_deref().filter(|x| !x.is_empty()) {
                m.insert("parent".into(), s(p));
            }
        }
        "template" => {
            if let Some(d) = c.display_name.as_ref() {
                m.insert("displayName".into(), d.clone());
            }
            if let Some(k) = c.kind.as_ref() {
                m.insert("kind".into(), k.clone());
            }
            let kind = c.kind.as_ref().map(super::cand::js_str).unwrap_or_else(|| "undefined".into());
            m.insert(
                "command".into(),
                s(&format!("astryx template {} --type {}", c.command_name.as_deref().unwrap_or(&c.name), kind)),
            );
        }
        "theme" => {
            if let Some(d) = c.display_name.as_ref() {
                m.insert("displayName".into(), d.clone());
            }
            let verb = if outside { "eject" } else { "add" };
            m.insert("command".into(), s(&format!("astryx theme {verb} {}", c.name)));
        }
        _ => {}
    }
    Value::Object(m)
}

/// `namesWhole(candidate, term)`.
pub fn names_whole(c: &Candidate, term: &str) -> bool {
    let nospace = strip_ws(term);
    std::iter::once(&c.name).chain(c.aliases.iter()).any(|n| {
        let l = lower(n);
        l == term || (c.domain != "doc" && !has_ws_us_dash(&l) && l == nospace)
    })
}

/// The catalog a ranking reads.
pub struct Catalog {
    pub all: Vec<Candidate>,
    /// Indexes of the component candidates.
    pub searched_components: bool,
    pub outside: bool,
    pub core_skipped: Option<String>,
}

/// The lexical response, typed.
pub struct Lexical {
    pub query: String,
    pub match_count: usize,
    pub results: Vec<SearchResult>,
}

struct Ranked {
    result: SearchResult,
    priority: u8,
    key: f64,
    alias: Alias,
    alias_words: usize,
    span: Option<(usize, usize)>,
    word: Option<(usize, usize)>,
}

/// `localeCompare` (ICU root collation).
pub fn locale_compare(a: &str, b: &str) -> std::cmp::Ordering {
    super::collate::compare(a, b)
}

/// `rankLexical(query, {limit}, catalog)`.
pub fn rank_lexical(query: &str, limit: usize, catalog: &Catalog) -> Lexical {
    let trimmed = js_trim(query);
    let term = lower(trimmed);
    let all = &catalog.all;
    let spelled = spell_identifiers(trimmed);
    let exact = all.iter().any(|c| names_whole(c, &term));
    let split = !exact && !has_ws(&term) && spelled != term && {
        let t = Term::new(&term);
        !all.iter().any(|c| score_candidate(&t, c, Opts::new()).is_some())
    };
    let tokens = tokenize_query(if split { &spelled } else { &term });
    let words = if exact {
        Vec::new()
    } else {
        phrase_words(if split || has_ws(&term) { &spelled } else { &term })
    };
    let query_words = phrase_words(&spelled);
    let typed: std::collections::HashSet<String> = {
        let b = query.as_bytes();
        let mut out = std::collections::HashSet::new();
        let mut i = 0;
        while i < b.len() {
            if b[i].is_ascii_alphanumeric() {
                let s = i;
                while i < b.len() && b[i].is_ascii_alphanumeric() {
                    i += 1;
                }
                let w = &query[s..i];
                if w.bytes().any(|c| c.is_ascii_uppercase()) {
                    out.insert(w.to_ascii_lowercase());
                }
            } else {
                i += 1;
            }
        }
        out
    };
    let mut spans: HashMap<String, (usize, usize)> = HashMap::new();
    let mut len = query_words.len().min(MAX_RUN_WORDS);
    while len >= 1 {
        for a in 0..=query_words.len() - len {
            if len == 1 && !typed.contains(&query_words[a]) {
                continue;
            }
            let run = query_words[a..a + len].concat();
            spans.entry(run).or_insert((a, a + len));
        }
        len -= 1;
    }
    let word_named = |c: &Candidate| -> Option<(usize, usize)> {
        if c.domain == "doc" {
            return None;
        }
        for n in &c.joined_names {
            let plural = format!("{n}s");
            if let Some(at) = query_words.iter().position(|w| w == n || *w == plural) {
                return Some((at, at + 1));
            }
        }
        None
    };
    let named_span = |c: &Candidate| -> Option<(usize, usize)> {
        if c.domain == "doc" {
            return None;
        }
        let mut best: Option<(usize, usize)> = None;
        for n in &c.joined_names {
            let span = spans
                .get(n)
                .or_else(|| spans.get(&format!("{n}s")))
                .or_else(|| if es_ending(n) { spans.get(&format!("{n}es")) } else { None })
                .copied();
            if let Some(s) = span {
                if best.is_none_or(|b| s.1 - s.0 > b.1 - b.0) {
                    best = Some(s);
                }
            }
        }
        best
    };

    let mut q = QueryCtx::new(&term, tokens, words);
    let mut ranked: Vec<Ranked> = Vec::new();
    for (ci, c) in all.iter().enumerate() {
        let (hit, compound) = score_query(&mut q, c, false);
        if let Some(hit) = hit {
            let priority = domain_priority(&mut q, c, &hit, &compound);
            ranked.push(Ranked {
                result: SearchResult {
                    domain: c.domain.clone(),
                    name: if c.domain == "doc" {
                        c.topic.clone().unwrap_or_else(|| c.name.clone())
                    } else {
                        c.result_name().to_string()
                    },
                    package: c.package.clone(),
                    section: if c.domain == "doc" { c.section.clone().filter(|s| !s.is_empty()) } else { None },
                    score: hit.score,
                    reason: hit.reason.clone(),
                    matched: hit.matched,
                    total: hit.total,
                    cand: ci,
                    description: c.description.clone(),
                },
                priority,
                key: hit.score as f64,
                alias: hit.alias,
                alias_words: hit.alias_words,
                span: named_span(c),
                word: word_named(c),
            });
        }
    }
    let inside = |inner: (usize, usize), outer: (usize, usize)| {
        outer.0 <= inner.0 && outer.1 >= inner.1 && outer.1 - outer.0 > inner.1 - inner.0
    };
    let named: Vec<bool> = ranked
        .iter()
        .enumerate()
        .map(|(i, r)| {
            r.span.is_some_and(|s| {
                !ranked.iter().enumerate().any(|(j, o)| j != i && o.span.is_some_and(|os| inside(s, os)))
            })
        })
        .collect();
    let named_floor = ranked
        .iter()
        .zip(&named)
        .filter(|(_, n)| **n)
        .map(|(r, _)| r.key)
        .fold(f64::INFINITY, f64::min);
    let longest_named =
        ranked.iter().zip(&named).filter(|(_, n)| **n).map(|(r, _)| r.span.map_or(0, |s| s.1 - s.0)).max().unwrap_or(0);
    for i in 0..ranked.len() {
        if named[i] {
            continue;
        }
        let r = &ranked[i];
        if r.alias == Alias::No || r.word.is_some() {
            continue;
        }
        if r.alias == Alias::Partial && r.alias_words > longest_named {
            continue;
        }
        let c = &all[r.result.cand];
        let own = score_query(&mut q, c, true).0.map_or(0, |h| h.score) as f64;
        let r = &mut ranked[i];
        r.key = own.max(r.key.min(named_floor - 0.5));
    }

    let domain_order = |d: &str| -> i32 {
        match d {
            "component" => 0,
            "hook" => 1,
            "doc" => 2,
            "template" => 3,
            "theme" => 4,
            _ => 9,
        }
    };
    let by_score = |x: &Ranked, y: &Ranked| -> std::cmp::Ordering {
        // kb - ka || domain || localeCompare
        let d = y.key - x.key;
        if d != 0.0 {
            return if d > 0.0 { std::cmp::Ordering::Greater } else { std::cmp::Ordering::Less };
        }
        let dd = domain_order(&x.result.domain) - domain_order(&y.result.domain);
        if dd != 0 {
            return dd.cmp(&0);
        }
        locale_compare(&x.result.name, &y.result.name)
    };
    let (mut others, mut docs): (Vec<Ranked>, Vec<Ranked>) = ranked.into_iter().partition(|r| r.result.domain != "doc");
    others.sort_by(&by_score);
    let has_others = !others.is_empty();
    docs.sort_by(|x, y| {
        let p = if has_others {
            (y.priority as i32) - (x.priority as i32)
        } else {
            ((y.priority == 2) as i32) - ((x.priority == 2) as i32)
        };
        if p != 0 {
            return p.cmp(&0);
        }
        by_score(x, y)
    });
    let mut scored: Vec<SearchResult> = Vec::with_capacity(others.len() + docs.len());
    let (mut i, mut j) = (0, 0);
    while i < others.len() || j < docs.len() {
        let other_first = if j >= docs.len() {
            true
        } else if i >= others.len() {
            false
        } else {
            let (o, d) = (&others[i], &docs[j]);
            (o.priority != 0 && d.priority == 0) || by_score(o, d) == std::cmp::Ordering::Less
        };
        if other_first {
            scored.push(others[i].result.clone());
            i += 1;
        } else {
            scored.push(docs[j].result.clone());
            j += 1;
        }
    }
    let match_count = scored.len();
    scored.truncate(limit);
    Lexical { query: trimmed.to_string(), match_count, results: scored }
}

/// The lexical response as JSON (`{type, data, meta?}`).
pub fn response_json(lex: &Lexical, catalog: &Catalog, results: &[SearchResult]) -> Value {
    let mut data = Map::new();
    data.insert("query".into(), Value::String(lex.query.clone()));
    data.insert("matchCount".into(), Value::from(lex.match_count));
    data.insert(
        "results".into(),
        Value::Array(results.iter().map(|r| result_json(r, &catalog.all[r.cand], catalog.outside)).collect()),
    );
    let mut m = Map::new();
    m.insert("type".into(), Value::String("search".into()));
    m.insert("data".into(), Value::Object(data));
    if let Some(reason) = catalog.core_skipped.as_deref().filter(|s| !s.is_empty()) {
        let mut partial = Map::new();
        partial.insert(
            "skipped".into(),
            Value::Array(vec!["component".into(), "hook".into(), "template".into()]),
        );
        partial.insert("reason".into(), Value::String(reason.into()));
        let mut meta = Map::new();
        meta.insert("partial".into(), Value::Object(partial));
        m.insert("meta".into(), Value::Object(meta));
    }
    Value::Object(m)
}
