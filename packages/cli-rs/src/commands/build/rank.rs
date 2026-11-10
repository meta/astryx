//! The page ranker behind build's START (`api/build/kit/rank.mjs`).

use super::js::{self, num_cmp};
use super::words::{
    containers_of, family_words_of, head_end, modifiers_of, normalized, pairs_of, synonyms_of, terms, IdeaKind,
    PageTemplate, SHELL_FAMILY,
};
use indexmap::{IndexMap, IndexSet};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct RankedPage {
    pub name: String,
    pub score: f64,
    pub hits: usize,
    pub family_named: bool,
    pub head_named: bool,
    pub container_matched: bool,
    pub family: String,
    pub base: bool,
    pub matched: IndexSet<String>,
}

const SYNONYM_SHARE: f64 = 0.5;
const CONTAINER: f64 = 2.0;
const MODIFIER: f64 = 0.5;
const HEAD_FAMILY: f64 = 12.0;
const BODY_FAMILY: f64 = 2.0;
const FAMILY_BASE: f64 = 2.0;
pub const START_SCORE: f64 = 10.0;
const START_TERMS: usize = 2;

struct Doc {
    family: String,
    bag: HashMap<String, f64>,
    bag_order: Vec<String>,
    pairs: IndexSet<String>,
}

pub fn rank_pages(query: &str, pages: &[PageTemplate]) -> Vec<RankedPage> {
    let docs: Vec<Doc> = pages
        .iter()
        .map(|page| {
            let mut parts = page.category.split(" - ");
            let family = parts.next().unwrap_or("").to_string();
            let variant = parts.collect::<Vec<_>>().join(" - ");
            let id = page.name.replace('-', " ");
            let keywords = page.keywords.join(", ");
            let fields: [(&str, f64); 6] = [
                (&id, 3.0),
                (&variant, 3.0),
                (&family, 2.0),
                (&page.display_name, 2.0),
                (&keywords, 2.0),
                (&page.description, 1.0),
            ];
            let mut bag: HashMap<String, f64> = HashMap::new();
            let mut bag_order = Vec::new();
            for (text, weight) in fields.iter() {
                for t in terms(text) {
                    match bag.get_mut(&t) {
                        Some(v) => {
                            if *weight > *v {
                                *v = *weight
                            }
                        }
                        None => {
                            bag_order.push(t.clone());
                            bag.insert(t, *weight);
                        }
                    }
                }
            }
            let texts: Vec<&str> = fields.iter().map(|(t, _)| *t).collect();
            Doc { family: super::words::js_trim(&family), bag, bag_order, pairs: pairs_of(&texts) }
        })
        .collect();

    let mut df: HashMap<String, usize> = HashMap::new();
    for d in &docs {
        for t in &d.bag_order {
            *df.entry(t.clone()).or_insert(0) += 1;
        }
    }
    let n = docs.len() as f64;
    let idf = |t: &str| -> f64 {
        match df.get(t) {
            Some(&d) if d > 0 => {
                let d = d as f64;
                js::ln(1.0 + (n - d + 0.5) / (d + 0.5))
            }
            _ => 0.0,
        }
    };

    let family_of_word = family_words_of(pages);
    let families_in = |ts: &[String]| -> IndexSet<String> {
        ts.iter().filter_map(|t| family_of_word.get(t).cloned()).collect()
    };

    let query_terms: Vec<String> = terms(query).into_iter().collect::<IndexSet<_>>().into_iter().collect();
    let head_families = families_in(&terms(&js::split_first(query, head_end())));
    let named_families = families_in(&query_terms);
    let modifiers: IndexMap<String, IndexSet<String>> = modifiers_of(query);
    let containers = containers_of(query);
    let syn = synonyms_of();

    let mut ranked: Vec<RankedPage> = docs
        .iter()
        .zip(pages)
        .map(|(doc, page)| {
            let mut score = 0.0f64;
            let mut hits = 0;
            let mut container_matched = false;
            let mut matched = IndexSet::new();
            let bag = |t: &str| doc.bag.get(t).copied().unwrap_or(0.0);
            for t in &query_terms {
                let discounted = match modifiers.get(t) {
                    Some(modified) => !modified.iter().any(|n| doc.pairs.contains(&format!("{t} {n}"))),
                    None => false,
                };
                let direct = idf(t) * bag(t) * if discounted { MODIFIER } else { 1.0 };
                let mut via_synonym = 0.0f64;
                if let Some(set) = syn.get(t) {
                    for s in set {
                        if query_terms.contains(s) {
                            continue;
                        }
                        via_synonym = js_max2(via_synonym, SYNONYM_SHARE * idf(s) * bag(s));
                    }
                }
                let value = js_max2(direct, via_synonym) * if containers.contains(t) { CONTAINER } else { 1.0 };
                if value > 0.0 {
                    score += value;
                    hits += 1;
                    matched.insert(t.clone());
                    if containers.contains(t) {
                        container_matched = true;
                    }
                }
            }
            let family_named = named_families.contains(&doc.family);
            let head_named = head_families.contains(&doc.family);
            if head_named {
                score += HEAD_FAMILY;
            } else if family_named {
                score += BODY_FAMILY;
            }
            let base = normalized(&page.name) == normalized(&doc.family);
            if family_named && base {
                score += FAMILY_BASE;
            }
            RankedPage {
                name: page.name.clone(),
                score,
                hits,
                family_named,
                head_named,
                container_matched,
                family: doc.family.clone(),
                base,
                matched,
            }
        })
        .collect();
    ranked.sort_by(|a, b| {
        num_cmp(b.score - a.score)
            .then_with(|| a.name.split('-').count().cmp(&b.name.split('-').count()))
            .then_with(|| js::locale_compare(&a.name, &b.name))
    });
    base_first(ranked)
}

/// `Math.max(a, b)` for non-NaN numbers.
fn js_max2(a: f64, b: f64) -> f64 {
    crate::route::js_max(&[a, b])
}

fn base_first(ranked: Vec<RankedPage>) -> Vec<RankedPage> {
    let Some(top) = ranked.first() else { return ranked };
    if top.base || !top.family_named {
        return ranked;
    }
    let Some(bi) = ranked.iter().position(|r| r.base && r.family == top.family) else { return ranked };
    let base = &ranked[bi];
    if base.score < START_SCORE || (base.hits < START_TERMS && !base.head_named) {
        return ranked;
    }
    let own = top.matched.iter().filter(|t| !base.matched.contains(*t)).count();
    if own >= START_TERMS {
        return ranked;
    }
    let mut out = Vec::with_capacity(ranked.len());
    out.push(ranked[bi].clone());
    for (i, r) in ranked.into_iter().enumerate() {
        if i != bi {
            out.push(r);
        }
    }
    out
}

pub fn pick_alternatives(ranked: &[RankedPage], start_name: &str, count: usize) -> Vec<RankedPage> {
    ranked
        .iter()
        .filter(|r| r.name != start_name && r.hits > 0 && r.score >= START_SCORE / 2.0)
        .take(count)
        .cloned()
        .collect()
}

pub fn pick_start(ranked: &[RankedPage], kind: IdeaKind) -> Option<RankedPage> {
    if kind != IdeaKind::Page {
        if kind == IdeaKind::Part {
            if let Some(host) = ranked.iter().find(|r| r.base && r.family_named) {
                return Some(host.clone());
            }
        }
        let lead = pick_start(ranked, IdeaKind::Page);
        return lead.filter(|l| l.family == SHELL_FAMILY);
    }
    let top = ranked.first()?;
    if top.score < START_SCORE {
        return None;
    }
    if top.hits >= START_TERMS || top.family_named || top.container_matched {
        Some(top.clone())
    } else {
        None
    }
}
