//! Search's tree and learned searchers: the entry table (`_entries.mjs`), the
//! signals and their weighted rank (`_features.mjs`), the band-keeping order
//! (`_order.mjs`), the searchers (`_main-searcher.mjs` and its two topic
//! twins) and the root classifier (`tree.mjs`, `foundation/route`).

use super::cand::Candidate;
use super::lexical::*;
use super::words::*;
use crate::json::Value;
use std::collections::{HashMap, HashSet};

pub const DOMAINS: [&str; 5] = ["component", "hook", "doc", "template", "theme"];

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SearcherWeights {
    pub w: Vec<f64>,
    pub mu: Vec<f64>,
    pub sd: Vec<f64>,
}

pub use crate::route::ClassifierWeights;

#[derive(Debug, Clone, Default)]
pub struct Card {
    pub what: String,
    pub synonyms: Vec<String>,
    pub props: Vec<String>,
}

pub struct SearchData {
    pub cards: HashMap<String, Card>,
    pub router: ClassifierWeights,
    pub main: SearcherWeights,
    pub doc: SearcherWeights,
    pub template: SearcherWeights,
}

fn read_json(path: &std::path::Path) -> Value {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("parse {}: {e}", path.display()))
}

impl SearchData {
    /// `loadSearchData()`: the static files beside `api/search`.
    pub fn load(cli_root: &std::path::Path) -> SearchData {
        let dir = cli_root.join("api").join("search");
        let cards_v = read_json(&dir.join("_cards.json"));
        let mut cards = HashMap::new();
        if let Value::Object(m) = &cards_v {
            for (k, v) in m {
                let list = |key: &str| -> Vec<String> {
                    v.get(key)
                        .and_then(|x| x.as_array())
                        .map(|a| a.iter().map(super::cand::js_str).collect())
                        .unwrap_or_default()
                };
                cards.insert(
                    k.clone(),
                    Card {
                        what: v.get("what").map(super::cand::js_str).unwrap_or_default(),
                        synonyms: list("synonyms"),
                        props: list("props"),
                    },
                );
            }
        }
        let router_v = read_json(&dir.join("tree.weights.json"));
        let router = ClassifierWeights::from_json(&router_v).expect("router weights");
        let sw = |f: &str| -> SearcherWeights { serde_json::from_value(read_json(&dir.join(f))).expect("weights") };
        SearchData {
            cards,
            router,
            main: sw("_main-searcher.weights.json"),
            doc: sw("_doc-searcher.weights.json"),
            template: sw("_template-searcher.weights.json"),
        }
    }
}

use crate::route::classify;

// ── _entries.mjs ────────────────────────────────────────────────────

pub struct Field {
    pub post: HashMap<String, Vec<(usize, f64)>>,
    pub idf: HashMap<String, f64>,
    pub len: Vec<f64>,
    pub avg: f64,
}

pub struct EntryTable {
    pub ids: Vec<String>,
    pub index: HashMap<String, usize>,
    pub domain: Vec<usize>,
    pub name: Vec<Vec<String>>,
    pub fields: [Field; 3],
}

fn entry_id(c: &Candidate) -> String {
    if c.domain == "doc" {
        let sec = c.section.as_deref().filter(|s| !s.is_empty()).map(|s| format!("#{s}")).unwrap_or_default();
        format!("doc:{}{}", c.topic.as_deref().unwrap_or(&c.name), sec)
    } else {
        format!("{}:{}", c.domain, c.result_name())
    }
}

/// `entryOf(table, res)`.
pub fn entry_of(table: &EntryTable, r: &SearchResult) -> Option<usize> {
    let sec = r.section.as_deref().filter(|s| !s.is_empty()).map(|s| format!("#{s}")).unwrap_or_default();
    let id = format!("{}:{}{}", r.domain, r.name, sec);
    let pkg = r.package.as_deref().unwrap_or("undefined");
    table.index.get(&format!("{id}|{pkg}")).or_else(|| table.index.get(&id)).copied()
}

fn counts(list: Vec<String>) -> Vec<(String, f64)> {
    let mut order: Vec<(String, f64)> = Vec::new();
    let mut at: HashMap<String, usize> = HashMap::new();
    for w in list {
        if let Some(&i) = at.get(&w) {
            order[i].1 += 1.0;
        } else {
            at.insert(w.clone(), order.len());
            order.push((w, 1.0));
        }
    }
    order
}

/// `buildTable(all, cards)`.
pub fn build_table(all: &[Candidate], cards: &HashMap<String, Card>) -> EntryTable {
    let mut by: HashMap<String, Vec<usize>> = HashMap::new();
    let mut by_order: Vec<String> = Vec::new();
    let mut owner: HashMap<String, String> = HashMap::new();
    for (ci, c) in all.iter().enumerate() {
        let plain = entry_id(c);
        let pkg = c.package.clone().unwrap_or_default();
        owner.entry(plain.clone()).or_insert_with(|| pkg.clone());
        let id = if &pkg == owner.get(&plain).unwrap() {
            plain
        } else {
            format!("{plain}|{}", c.package.as_deref().unwrap_or("undefined"))
        };
        by.entry(id.clone())
            .or_insert_with(|| {
                by_order.push(id.clone());
                Vec::new()
            })
            .push(ci);
    }
    let mut ids = by_order;
    ids.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    // Each entry's word counts are its own: work them out on a few threads.
    let per: Vec<(usize, Vec<String>, [Vec<(String, f64)>; 3])> = super::gather::par_map(&ids, |id: &String| {
        let group = &by[id];
        let plain = id.split('|').next().unwrap().split('#').next().unwrap();
        let colon = plain.find(':').unwrap_or(0);
        let (d, name) = (&plain[..colon], &plain[colon + 1..]);
        let nw: Vec<String> = name_words(name).iter().map(|w| fold(w)).collect();
        let dom = DOMAINS.iter().position(|x| *x == d).unwrap_or(usize::MAX);
        let mut text: Vec<&str> = Vec::new();
        for &ci in group {
            let c = &all[ci];
            text.push(&c.description);
            text.extend(c.keywords.iter().map(|s| s.as_str()));
            text.extend(c.aliases.iter().map(|s| s.as_str()));
            if let Some(t) = &c.titles {
                text.extend(t.iter().map(|s| s.as_str()));
            }
            text.extend(c.guidance.iter().take(10).map(|s| s.as_str()));
            text.extend(c.prose.iter().take(4).map(|s| s.as_str()));
        }
        let card = if d == "component" || d == "hook" { cards.get(name) } else { None };
        let mut name_list = nw.clone();
        name_list.push(nw.concat());
        let name_counts = counts(name_list);
        let desc_counts = counts(qwords(&text.join(" ")).iter().map(|w| fold(w)).collect());
        let card_counts = counts(match card {
            Some(card) => {
                let mut parts = vec![card.what.clone()];
                parts.extend(card.synonyms.iter().cloned());
                parts.extend(card.props.iter().cloned());
                qwords(&parts.join(" ")).iter().map(|w| fold(w)).collect()
            }
            None => Vec::new(),
        });
        (dom, nw, [name_counts, desc_counts, card_counts])
    });
    let mut docs: [Vec<Vec<(String, f64)>>; 3] = [Vec::new(), Vec::new(), Vec::new()];
    let mut domain = Vec::new();
    let mut names = Vec::new();
    for (dom, nw, [a, b, c]) in per {
        domain.push(dom);
        names.push(nw);
        docs[0].push(a);
        docs[1].push(b);
        docs[2].push(c);
    }
    let n = ids.len() as f64;
    let fields = docs.map(|field_docs| {
        let mut post: HashMap<String, Vec<(usize, f64)>> = HashMap::new();
        let mut df: HashMap<String, f64> = HashMap::new();
        let mut len = Vec::new();
        for (k, m) in field_docs.iter().enumerate() {
            let mut l = 1.0;
            for (w, c) in m {
                l += c;
                *df.entry(w.clone()).or_insert(0.0) += 1.0;
                post.entry(w.clone()).or_default().push((k, *c));
            }
            len.push(l);
        }
        let idf = df.iter().map(|(w, d)| (w.clone(), crate::js::jsmath::log(1.0 + (n - d + 0.5) / (d + 0.5)))).collect();
        let avg = len.iter().fold(0.0, |a, b| a + b) / n;
        Field { post, idf, len, avg }
    });
    EntryTable { index: ids.iter().enumerate().map(|(k, id)| (id.clone(), k)).collect(), ids, domain, name: names, fields }
}

// ── _features.mjs ───────────────────────────────────────────────────

const S: usize = 19;
const PER: [usize; 8] = [0, 1, 9, 10, 11, 12, 15, 17];

fn signals(table: &EntryTable, query: &str, lexical: &[SearchResult], route: &[f64]) -> Vec<[f64; S]> {
    let n = table.ids.len();
    let mut rows = vec![[0.0f64; S]; n];
    let mut seen = HashSet::new();
    let mut r = 0usize;
    for res in lexical {
        let Some(k) = entry_of(table, res) else { continue };
        if !seen.insert(k) {
            continue;
        }
        r += 1;
        let x = &mut rows[k];
        x[0] = res.score as f64 / 100.0;
        x[1] = 1.0 / r as f64;
        x[2] = 1.0;
        x[3] = if r <= 20 { 1.0 } else { 0.0 };
    }
    for k in 0..n {
        if let Some(cell) = rows[k].get_mut(4 + table.domain[k]) {
            *cell = 1.0;
        }
    }
    let mut qw: Vec<String> = Vec::new();
    for w in query_words(query) {
        if !qw.contains(&w) {
            qw.push(w);
        }
    }
    if !qw.is_empty() {
        let mut hits = vec![vec![0u8; n]; qw.len()];
        for (j, f) in table.fields.iter().enumerate() {
            for (a, w) in qw.iter().enumerate() {
                if let Some(list) = f.post.get(w) {
                    let idf = f.idf.get(w).copied().unwrap_or(0.0);
                    for &(k, c) in list {
                        rows[k][9 + j] += (idf * c * 2.2) / (c + 1.2 * (0.25 + (0.75 * f.len[k]) / f.avg));
                        hits[a][k] = 1;
                    }
                }
            }
        }
        for k in 0..n {
            let mut cov = 0usize;
            for h in &hits {
                cov += h[k] as usize;
            }
            rows[k][12] = cov as f64 / qw.len() as f64;
            rows[k][13] = if cov == qw.len() && qw.len() > 1 { 1.0 } else { 0.0 };
            rows[k][14] = hits[qw.len() - 1][k] as f64;
        }
    }
    for k in 0..n {
        rows[k][15] = route.get(table.domain[k]).copied().unwrap_or(f64::NAN);
        rows[k][16] = route[5];
    }
    let all: Vec<String> = qwords(query).iter().map(|w| fold(w)).collect();
    let spaced = format!(" {} ", all.join(" "));
    let mut runs = HashSet::new();
    for len in 1..=3 {
        if len > all.len() {
            break;
        }
        for a in 0..=all.len() - len {
            runs.insert(all[a..a + len].concat());
        }
    }
    let whole = all.concat();
    for k in 0..n {
        let nw = &table.name[k];
        if nw.is_empty() {
            continue;
        }
        let j = nw.concat();
        if spaced.contains(&format!(" {} ", nw.join(" "))) || runs.contains(&j) {
            rows[k][17] = 1.0;
            if j == whole {
                rows[k][18] = 1.0;
            }
        }
    }
    rows
}

fn rank(table: &EntryTable, rows: &[[f64; S]], weights: &SearcherWeights) -> Vec<usize> {
    let (w, mu, sd) = (&weights.w, &weights.mu, &weights.sd);
    let score: Vec<f64> = rows
        .iter()
        .enumerate()
        .map(|(k, x)| {
            let mut s = 0.0f64;
            for j in 0..S {
                s += ((x[j] - mu[j]) / sd[j]) * w[j];
            }
            let d = table.domain[k];
            for (p, &j) in PER.iter().enumerate() {
                for dd in 0..DOMAINS.len() {
                    let c = S + p * DOMAINS.len() + dd;
                    let v = if dd == d { x[j] } else { 0.0 };
                    s += ((v - mu[c]) / sd[c]) * w[c];
                }
            }
            super::score::js_round(s * 1e9) / 1e9
        })
        .collect();
    let mut order: Vec<usize> = (0..rows.len()).collect();
    order.sort_by(|&a, &b| {
        let d = score[b] - score[a];
        if d != 0.0 && !d.is_nan() {
            return if d > 0.0 { std::cmp::Ordering::Greater } else { std::cmp::Ordering::Less };
        }
        a.cmp(&b)
    });
    order
}

// ── _order.mjs ──────────────────────────────────────────────────────

const BANDS: [i64; 7] = [195, 188, 170, 160, 151, 100, 55];

fn band_of(score: i64) -> usize {
    BANDS.iter().position(|f| score >= *f).unwrap_or(BANDS.len())
}

struct Item {
    res: SearchResult,
    i: usize,
    band: usize,
    learned: f64,
}

fn block_of(it: &Item) -> (usize, i64) {
    (it.band, it.res.score)
}

fn is_named(it: &Item) -> bool {
    let r = &it.res.reason;
    it.res.score >= 95 && (r.starts_with("exact name") || r.starts_with("plural of the name") || r.starts_with("name "))
}

fn keep_lexical(items: Vec<Item>, pick: impl Fn(&Item) -> bool) -> Vec<Item> {
    let at: Vec<usize> = items.iter().enumerate().filter(|(_, it)| pick(it)).map(|(j, _)| j).collect();
    reorder_at(items, &at)
}

/// Put the items at positions `at` back in lexical (`i`) order among themselves.
fn reorder_at(items: Vec<Item>, at: &[usize]) -> Vec<Item> {
    if at.len() < 2 {
        return items;
    }
    let mut sorted: Vec<usize> = at.to_vec();
    sorted.sort_by_key(|&j| items[j].i);
    let mut slots: Vec<Option<Item>> = items.into_iter().map(Some).collect();
    let taken: Vec<Item> = sorted.iter().map(|&j| slots[j].take().unwrap()).collect();
    for (n, it) in taken.into_iter().enumerate() {
        slots[at[n]] = Some(it);
    }
    slots.into_iter().map(|x| x.unwrap()).collect()
}

fn integration_ties(items: Vec<Item>) -> Vec<Item> {
    let mut groups: Vec<(i64, Vec<usize>)> = Vec::new();
    for (j, it) in items.iter().enumerate() {
        let pkg = it.res.package.as_deref().unwrap_or("");
        if pkg.is_empty() || pkg.starts_with("@astryxdesign/") {
            continue;
        }
        match groups.iter_mut().find(|g| g.0 == it.res.score) {
            Some(g) => g.1.push(j),
            None => groups.push((it.res.score, vec![j])),
        }
    }
    let mut out = items;
    for (_, at) in groups {
        out = reorder_at(out, &at);
    }
    out
}

/// `/^matches \d+\/\d+ terms: (.*)$/`.
fn matched_terms(reason: &str) -> Option<&str> {
    let rest = reason.strip_prefix("matches ")?;
    let d1 = rest.bytes().take_while(|c| c.is_ascii_digit()).count();
    if d1 == 0 {
        return None;
    }
    let rest = rest[d1..].strip_prefix('/')?;
    let d2 = rest.bytes().take_while(|c| c.is_ascii_digit()).count();
    if d2 == 0 {
        return None;
    }
    let rest = rest[d2..].strip_prefix(" terms: ")?;
    if rest.contains(['\n', '\r', '\u{2028}', '\u{2029}']) {
        return None;
    }
    Some(rest)
}

fn ties_by_fit(ranked: Vec<Item>, table: &EntryTable) -> Vec<Item> {
    if ranked.len() < 3 {
        return ranked;
    }
    let first: Vec<String> = name_words(&ranked[0].res.name).iter().map(|w| fold(w)).collect();
    let idf = &table.fields[1].idf;
    let rarest = idf.values().copied().fold(0.0f64, f64::max);
    let related = |it: &Item| -> bool {
        let name: Vec<String> = name_words(&it.res.name).iter().map(|w| fold(w)).collect();
        (!first.is_empty() && name.len() > first.len() && first.iter().enumerate().all(|(n, w)| &name[n] == w))
            || it.res.reason.starts_with("member of ")
    };
    let rarity = |it: &Item| -> f64 {
        let Some(m) = matched_terms(&it.res.reason) else { return 0.0 };
        let mut sum = 0.0;
        for t in m.split(", ") {
            for part in qwords(t) {
                sum += idf.get(&fold(&part)).copied().unwrap_or(rarest);
            }
        }
        sum
    };
    let mut iter = ranked.into_iter();
    let mut out = vec![iter.next().unwrap()];
    let rest: Vec<Item> = iter.collect();
    let mut parts = 0;
    let mut i = 0;
    let at = |it: &Item| (block_of(it), it.res.domain.clone());
    let mut rest_slots: Vec<Option<Item>> = rest.into_iter().map(Some).collect();
    while i < rest_slots.len() {
        let key = at(rest_slots[i].as_ref().unwrap());
        let mut j = i;
        while j < rest_slots.len() && at(rest_slots[j].as_ref().unwrap()) == key {
            j += 1;
        }
        let run: Vec<Item> = (i..j).map(|x| rest_slots[x].take().unwrap()).collect();
        if run.len() > 1 {
            let mut keyed: Vec<(Item, usize, bool, f64)> = run
                .into_iter()
                .enumerate()
                .map(|(n, it)| {
                    let r = parts < 2 && related(&it);
                    if r {
                        parts += 1;
                    }
                    let f = rarity(&it);
                    (it, n, r, f)
                })
                .collect();
            keyed.sort_by(|a, b| {
                let r = (b.2 as i32) - (a.2 as i32);
                if r != 0 {
                    return r.cmp(&0);
                }
                let f = b.3 - a.3;
                if f != 0.0 && !f.is_nan() {
                    return if f > 0.0 { std::cmp::Ordering::Greater } else { std::cmp::Ordering::Less };
                }
                a.1.cmp(&b.1)
            });
            out.extend(keyed.into_iter().map(|k| k.0));
        } else {
            out.extend(run);
        }
        i = j;
    }
    out
}

fn query_word_count(q: &str) -> usize {
    qwords(q).len()
}

fn order_matches(table: &EntryTable, order: &[usize], lexical: Lexical, query: &str, limit: usize) -> Lexical {
    let mut place: HashMap<usize, usize> = HashMap::new();
    for (i, &k) in order.iter().enumerate() {
        place.insert(k, i);
    }
    let mut run: i64 = -1;
    let mut last: Option<(usize, bool)> = None;
    let items: Vec<Item> = lexical
        .results
        .into_iter()
        .enumerate()
        .map(|(i, res)| {
            let key = (band_of(res.score), res.domain == "doc");
            if Some(key) != last {
                run += 1;
                last = Some(key);
            }
            let learned = match entry_of(table, &res) {
                Some(k) => place.get(&k).map_or(f64::INFINITY, |p| *p as f64),
                None => f64::INFINITY,
            };
            Item { res, i, band: run as usize, learned }
        })
        .collect();
    let mut block: HashMap<(usize, i64), f64> = HashMap::new();
    for it in &items {
        let at = if is_named(it) { -1.0 } else { it.learned };
        let k = block_of(it);
        if !block.contains_key(&k) || at == -1.0 {
            block.insert(k, at);
        }
    }
    let mut ranked = items;
    ranked.sort_by(|x, y| {
        x.band
            .cmp(&y.band)
            .then_with(|| {
                let a = block[&block_of(x)];
                let b = block[&block_of(y)];
                // (a - b) with Infinity - Infinity = NaN treated as 0.
                let d = a - b;
                if d.is_nan() || d == 0.0 {
                    std::cmp::Ordering::Equal
                } else if d < 0.0 {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Greater
                }
            })
            .then_with(|| x.i.cmp(&y.i))
    });
    if query_word_count(query) <= 2 {
        ranked = keep_lexical(ranked, |it| it.res.score >= 151);
    }
    ranked = integration_ties(ranked);
    let mut shown = ties_by_fit(ranked, table);
    shown.truncate(limit);
    Lexical { query: lexical.query, match_count: lexical.match_count, results: shown.into_iter().map(|it| it.res).collect() }
}

// ── the searchers and the tree ──────────────────────────────────────

fn loose_name(text: &str) -> String {
    let l = lower(text);
    let mut out = String::new();
    let mut in_sep = false;
    for ch in l.chars() {
        if ch == '-' || ch == '_' || ch == '/' {
            if !in_sep {
                out.push(' ');
                in_sep = true;
            }
        } else {
            out.push(ch);
            in_sep = false;
        }
    }
    // \s+ -> ' ' then trim.
    let mut out2 = String::new();
    let mut in_ws = false;
    for ch in out.chars() {
        if js_space(ch) {
            if !in_ws {
                out2.push(' ');
                in_ws = true;
            }
        } else {
            out2.push(ch);
            in_ws = false;
        }
    }
    js_trim(&out2).to_string()
}

fn names_loosely(c: &Candidate, loose: &str) -> bool {
    if loose.is_empty() {
        return false;
    }
    let mut names: Vec<&str> = vec![&c.name];
    names.extend(c.aliases.iter().map(|s| s.as_str()));
    for x in [&c.title, &c.topic, &c.result_name, &c.command_name].into_iter().flatten() {
        names.push(x);
    }
    names.iter().any(|n| {
        if n.is_empty() {
            return false;
        }
        let whole = loose_name(n);
        let last = loose_name(n.rsplit('/').next().unwrap_or(""));
        whole == loose || last == loose
    })
}

/// `rankWith(request, catalog, weights)`.
pub fn rank_with(query: &str, limit: usize, catalog: &Catalog, data: &SearchData, weights: &SearcherWeights, table_fn: &dyn Fn() -> std::rc::Rc<EntryTable>) -> Lexical {
    let term = lower(js_trim(query));
    let loose = loose_name(&term);
    if catalog.all.iter().any(|c| names_whole(c, &term) || names_loosely(c, &loose)) {
        return rank_lexical(query, limit, catalog);
    }
    // The entry table does not depend on the query's matches: build it
    // beside the lexical ranking.
    let (table, lexical) = std::thread::scope(|scope| {
        let t = scope.spawn(|| build_table(&catalog.all, &data.cards));
        let lexical = rank_lexical(query, usize::MAX, catalog);
        (t.join().unwrap(), lexical)
    });
    let _ = table_fn;
    let route = classify(&data.router, &router_tokens(query));
    let rows = signals(&table, query, &lexical.results, &route);
    let order = rank(&table, &rows, weights);
    order_matches(&table, &order, lexical, query, limit)
}

/// `runTree(SEARCH_TREE, ...)`: the root classifier, then the searcher.
pub fn run_tree(query: &str, limit: usize, catalog: &Catalog, data: &SearchData) -> Lexical {
    let p = classify(&data.router, &router_tokens(query));
    let max = p.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let best = p.iter().position(|x| *x == max).unwrap_or(0);
    let class = data.router.classes.get(best).map(|s| s.as_str()).unwrap_or("");
    let weights = match class {
        "doc" if p[best] >= 0.4 => &data.doc,
        "template" if p[best] >= 0.4 => &data.template,
        _ => &data.main,
    };
    let cell: std::cell::OnceCell<std::rc::Rc<EntryTable>> = std::cell::OnceCell::new();
    let table = || cell.get_or_init(|| std::rc::Rc::new(build_table(&catalog.all, &data.cards))).clone();
    rank_with(query, limit, catalog, data, weights, &table)
}
