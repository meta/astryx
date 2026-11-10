//! build's block picker (`api/build/blocks/blocks.mjs`): ranks every block in
//! the catalog for a request by meaning, and keeps build's own count.

use super::js::{self, re};
use super::vocab::stopword_list;
use super::words::{BlockTemplate, ComponentWords};
use crate::json::{Map, Value};
use base64::Engine;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

pub struct BlockPickerWeights {
    pub vocab: Vec<String>,
    pub index: HashMap<String, usize>,
    pub idf: Vec<f64>,
    pub dims: usize,
    pub request: Vec<i8>,
    pub request_scale: f64,
    pub doc: Vec<i8>,
    pub doc_scale: f64,
    pub lexical: f64,
    pub known: Vec<String>,
    pub theta: Theta,
}

#[derive(Default, Clone, Copy)]
pub struct Theta {
    pub g: f64,
    pub grank: f64,
    pub gmargin: f64,
    pub seen: f64,
    pub lex: f64,
    pub sscore: f64,
    pub scov: f64,
    pub srank: f64,
    pub inkit: f64,
    pub kitpos: f64,
    pub mention: f64,
    pub show: f64,
}

fn b64(s: &str) -> Option<Vec<u8>> {
    base64::engine::general_purpose::STANDARD.decode(s.trim_end_matches('=')).ok().or_else(|| {
        base64::engine::general_purpose::STANDARD_NO_PAD.decode(s.trim_end_matches('=')).ok()
    })
}

impl BlockPickerWeights {
    /// Parse and validate as `isBlockPickerWeights` does; decode as `decode`.
    pub fn from_json(w: &Value) -> Option<BlockPickerWeights> {
        let vocab: Vec<String> =
            w.get("vocab")?.as_array()?.iter().map(|t| t.as_str().map(str::to_string)).collect::<Option<_>>()?;
        let n = vocab.len();
        if n == 0 {
            return None;
        }
        let num = |v: Option<&Value>| v.and_then(|v| v.as_f64()).filter(|x| x.is_finite());
        let idf_raw: Vec<f64> = w.get("idf")?.as_array()?.iter().map(|x| num(Some(x))).collect::<Option<_>>()?;
        if idf_raw.len() != n {
            return None;
        }
        let dims_f = w.get("dims")?.as_f64()?;
        if dims_f.fract() != 0.0 || dims_f <= 0.0 {
            return None;
        }
        let dims = dims_f as usize;
        let req = b64(w.get("request")?.as_str()?)?;
        let doc = b64(w.get("doc")?.as_str()?)?;
        if req.len() != n * dims || doc.len() != n * dims {
            return None;
        }
        let request_scale = num(w.get("requestScale"))?;
        let doc_scale = num(w.get("docScale"))?;
        let lexical = num(w.get("lexical"))?;
        let known: Vec<String> =
            w.get("known")?.as_array()?.iter().map(|t| t.as_str().map(str::to_string)).collect::<Option<_>>()?;
        let th = w.get("theta")?;
        let t = |k: &str| num(th.get(k));
        let theta = Theta {
            g: t("g")?,
            grank: t("grank")?,
            gmargin: t("gmargin")?,
            seen: t("seen")?,
            lex: t("lex")?,
            sscore: t("sscore")?,
            scov: t("scov")?,
            srank: t("srank")?,
            inkit: t("inkit")?,
            kitpos: t("kitpos")?,
            mention: t("mention")?,
            show: t("show")?,
        };
        let mut index = HashMap::new();
        for (i, v) in vocab.iter().enumerate() {
            index.insert(v.clone(), i);
        }
        let signed = |b: Vec<u8>| b.into_iter().map(|x| (x as i16 - 128) as i8).collect();
        Some(BlockPickerWeights {
            idf: idf_raw.iter().map(|x| x / 1024.0).collect(),
            index,
            vocab,
            dims,
            request: signed(req),
            request_scale,
            doc: signed(doc),
            doc_scale,
            lexical,
            known,
            theta,
        })
    }
}

fn stop() -> &'static HashSet<String> {
    static S: OnceLock<HashSet<String>> = OnceLock::new();
    S.get_or_init(|| {
        let mut s: HashSet<String> = stopword_list().iter().map(|x| x.to_string()).collect();
        let a = "about above across after again against all along already also although \
always am among amongst an and another any anyone anything anywhere are \
around as at be because been before behind being below beneath beside \
besides between beyond both but by can could despite did do does doing \
down during each either else enough even ever every everyone everything \
everywhere except few following for from further had has have having he \
her here hers herself him himself his how however if in inside instead \
into is it its itself just least less little lot lots many may maybe me \
might more most much must my myself near neither never no nobody none \
nor not nothing now nowhere of off often on once one ones only onto or \
other others ought our ours ourselves out outside over own past per \
perhaps quite rather same several shall she should since so some someone \
something sometimes somewhat somewhere still such than that the their \
theirs them themselves then there these they this those though through \
throughout thus till to together too toward towards under underneath \
unless unlike until up upon usually very via was we were what whatever \
when whenever where whereas whether which whichever while who whoever \
whom whomever whose why will with within without would yet you your \
yours yourself yourselves";
        let b = "a an the and or of for to in on with by at from as is are be this that \
it its my our your their me we you i into via per each all any some page \
app screen ui view build make create need want like show shows showing \
using use one two new add list item items basic simple showcase example \
default variant";
        for w in a.split(' ').chain(b.split(' ')) {
            s.insert(w.to_string());
        }
        s
    })
}

fn context() -> &'static HashSet<&'static str> {
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| {
        "in on inside within into above below under beneath next beside to for \
with and from of near over across along around after before at"
            .split(' ')
            .collect()
    })
}

const POOL_MATCHES: usize = 60;
const POOL_SEARCHED: usize = 60;
const POOL_OVERLAPS: usize = 20;
const TOP: usize = 80;

/// A word with a plural or verb ending removed (words over four letters).
pub fn stem_of(w: &str) -> String {
    let n = js::len16(w);
    if n <= 4 {
        return w.to_string();
    }
    if w.ends_with("ies") {
        return format!("{}y", &w[..w.len() - 3]);
    }
    if js::test(w, re(r"(?:s|x|z|ch|sh)es$", "")) {
        return w[..w.len() - 2].to_string();
    }
    if w.ends_with('s') && !w.ends_with("ss") {
        return w[..w.len() - 1].to_string();
    }
    if w.ends_with("ing") {
        return w[..w.len() - 3].to_string();
    }
    if w.ends_with("ed") {
        return w[..w.len() - 2].to_string();
    }
    w.to_string()
}

/// An identifier's words, lowercase.
pub fn words_of(text: &str) -> Vec<String> {
    let a = re(r"([a-z0-9])([A-Z])", "").replace_all(text, "$1 $2");
    let b = re(r"([A-Z])([A-Z][a-z])", "").replace_all(&a, "$1 $2");
    js::split(&js::lower(&b), re(r"[^a-z0-9]+", "")).into_iter().filter(|s| !s.is_empty()).collect()
}

/// `match(/[a-z0-9]{2,}/g)` on a lowercased text.
fn runs2(lower: &str) -> Vec<String> {
    js::alnum_runs(lower).into_iter().filter(|w| w.len() >= 2).collect()
}

/// A text's stemmed content words, then its adjacent pairs as `a_b`.
pub fn terms_of(text: &str) -> Vec<String> {
    let words: Vec<String> =
        runs2(&js::lower(text)).into_iter().filter(|w| !stop().contains(w)).map(|w| stem_of(&w)).collect();
    let mut out = words.clone();
    for i in 0..words.len().saturating_sub(1) {
        out.push(format!("{}_{}", words[i], words[i + 1]));
    }
    out
}

/// A sparse unit vector, as an insertion-ordered list of (index, value).
type Sparse = Vec<(usize, f64)>;

fn vector_of(terms: &[String], d: &BlockPickerWeights) -> Sparse {
    let mut counts: Vec<(usize, f64)> = Vec::new();
    let mut pos: HashMap<usize, usize> = HashMap::new();
    for t in terms {
        if let Some(&i) = d.index.get(t) {
            match pos.get(&i) {
                Some(&p) => counts[p].1 += 1.0,
                None => {
                    pos.insert(i, counts.len());
                    counts.push((i, 1.0));
                }
            }
        }
    }
    let mut v: Sparse = Vec::new();
    let mut sq = 0.0;
    for (i, c) in counts {
        let x = (1.0 + js::ln(c)) * d.idf[i];
        v.push((i, x));
        sq += x * x;
    }
    let mut norm = js::sqrt(sq);
    if norm == 0.0 || norm.is_nan() {
        norm = 1.0;
    }
    for e in v.iter_mut() {
        e.1 /= norm;
    }
    v
}

fn get_sparse(v: &Sparse, i: usize) -> Option<f64> {
    v.iter().find(|(j, _)| *j == i).map(|(_, x)| *x)
}

fn project(v: &Sparse, m: &[i8], scale: f64, dims: usize) -> Vec<f64> {
    let mut out = vec![0.0f64; dims];
    for &(i, x) in v {
        let row = i * dims;
        for k in 0..dims {
            out[k] += x * m[row + k] as f64;
        }
    }
    for o in out.iter_mut() {
        *o *= scale;
    }
    out
}

fn component_of(block: &BlockTemplate, names: &[String]) -> String {
    for c in names {
        if block.name.starts_with(c.as_str()) {
            return c.clone();
        }
    }
    // `block.displayName ?? block.name`: catalog blocks always carry a display name.
    let display = &block.display_name;
    display.split(" \u{2014} ").next().unwrap_or("").replace(' ', "")
}

struct CatBlock {
    component: String,
    vector: Sparse,
    projected: Vec<f64>,
}

struct Catalog {
    blocks: Vec<(String, CatBlock)>,
    by_name: HashMap<String, usize>,
    phrases: Vec<(String, Vec<(Vec<String>, f64)>)>,
}

fn read_catalog(catalog: &[BlockTemplate], components: &[ComponentWords], w: &BlockPickerWeights) -> Catalog {
    let mut names: Vec<String> = components.iter().map(|c| c.name.clone()).collect();
    // Stable sort by UTF-16 length, longest first.
    names.sort_by(|a, b| js::len16(b).cmp(&js::len16(a)));
    // `new Map(components.map(c => [c.name, c.keywords ?? []]))`: last wins.
    let mut keywords: HashMap<&str, &Vec<String>> = HashMap::new();
    for c in components {
        keywords.insert(c.name.as_str(), &c.keywords);
    }
    let empty: Vec<String> = Vec::new();
    let mut blocks: Vec<(String, CatBlock)> = Vec::new();
    let mut by_name = HashMap::new();
    for b in catalog {
        if by_name.contains_key(&b.name) {
            continue;
        }
        let component = component_of(b, &names);
        let kw = keywords.get(component.as_str()).copied().unwrap_or(&empty);
        let text = [
            words_of(&b.name).join(" "),
            b.display_name.clone(),
            b.description.clone(),
            words_of(&component).join(" "),
            kw.join(" "),
        ]
        .join(" ");
        let vector = vector_of(&terms_of(&text), w);
        let projected = project(&vector, &w.doc, w.doc_scale, w.dims);
        by_name.insert(b.name.clone(), blocks.len());
        blocks.push((b.name.clone(), CatBlock { component, vector, projected }));
    }
    let mut shared: HashMap<String, usize> = HashMap::new();
    for c in components {
        let mut seen = HashSet::new();
        for k in &c.keywords {
            let k = k.replace('-', " ");
            if seen.insert(k.clone()) {
                *shared.entry(k).or_insert(0) += 1;
            }
        }
    }
    let phrase = |s: &str| -> Vec<String> {
        js::split(&js::lower(s), re(r"\s+", "")).into_iter().filter(|x| !x.is_empty()).map(|x| stem_of(&x)).collect()
    };
    let mut with_blocks: Vec<String> = Vec::new();
    for (_, b) in &blocks {
        if !with_blocks.contains(&b.component) {
            with_blocks.push(b.component.clone());
        }
    }
    let mut phrases = Vec::new();
    for c in with_blocks {
        let mut list = vec![(phrase(&words_of(&c).join(" ")), 3.0)];
        for k in keywords.get(c.as_str()).copied().unwrap_or(&empty) {
            let k = k.replace('-', " ");
            let sh = shared.get(&k).copied().unwrap_or(0);
            if sh <= 3 {
                let div = if sh == 0 { 1 } else { sh };
                list.push((phrase(&k), 1.0 / div as f64));
            }
        }
        phrases.push((c, list));
    }
    Catalog { blocks, by_name, phrases }
}

fn named_components(request: &str, phrases: &[(String, Vec<(Vec<String>, f64)>)]) -> HashMap<String, f64> {
    let raw = js::alnum_runs(&js::lower(request));
    let stems: Vec<String> = raw.iter().map(|w| stem_of(w)).collect();
    let context_at = raw.iter().enumerate().position(|(k, w)| k > 0 && context().contains(w.as_str())).unwrap_or(raw.len());
    let mut out = HashMap::new();
    for (c, list) in phrases {
        let mut best = 0.0f64;
        for (p, w) in list {
            if p.is_empty() {
                continue;
            }
            let mut at: Option<usize> = None;
            let mut i = 0;
            while i + p.len() <= stems.len() && at.is_none() {
                if p.iter().enumerate().all(|(k, x)| &stems[i + k] == x) {
                    at = Some(i);
                }
                i += 1;
            }
            let Some(at) = at else { continue };
            let s = w
                * (1.0 + 0.3 * (p.len() as f64 - 1.0))
                * (if at < context_at { 1.0 } else { 0.5 })
                * (1.0 - 0.01 * at as f64);
            if s > best {
                best = s;
            }
        }
        if best != 0.0 {
            out.insert(c.clone(), best);
        }
    }
    out
}

fn writes_name(words: &[String], block: &str) -> bool {
    let name = js::lower(block);
    let length = words_of(block).len();
    for i in 0..words.len() {
        let mut run = String::new();
        let mut n = 0;
        while n < length && i + n < words.len() {
            run.push_str(&words[i + n]);
            if run == name {
                return true;
            }
            n += 1;
        }
    }
    false
}

/// What the picker reads from build's signals.
pub struct PickInput<'a> {
    pub kit_blocks: &'a [String],
    /// `[name, score, matched, total]` for every block search returned.
    pub searched: &'a [(String, f64, Option<f64>, Option<f64>)],
    pub foreign: &'a [String],
    pub catalog: &'a [BlockTemplate],
    pub components: &'a [ComponentWords],
}

/// The blocks build names for a request, ranked by the picker, and an entry
/// for each listed block search did not return.
pub fn pick_blocks(request: &str, s: &PickInput, w: &BlockPickerWeights) -> (Vec<String>, HashMap<String, Value>) {
    let own = s.kit_blocks;
    let mut entries = HashMap::new();
    if own.is_empty() {
        return (Vec::new(), entries);
    }
    let cat = read_catalog(s.catalog, s.components, w);
    let q = vector_of(&terms_of(request), w);
    let eq = project(&q, &w.request, w.request_scale, w.dims);
    let qmap: HashMap<usize, f64> = q.iter().copied().collect();
    let dot = |v: &Sparse| -> f64 {
        // Iterate q in its order, as the JS does.
        let vm: HashMap<usize, f64> = v.iter().copied().collect();
        let mut sum = 0.0;
        for &(i, x) in &q {
            if let Some(y) = vm.get(&i) {
                sum += x * y;
            }
        }
        sum
    };
    let _ = &qmap;
    // name -> (match, overlap), in catalog order.
    let mut scored: Vec<(String, f64, f64)> = Vec::new();
    let mut scored_at: HashMap<String, usize> = HashMap::new();
    for (name, b) in &cat.blocks {
        let mut sum = 0.0;
        for k in 0..w.dims {
            sum += eq[k] * b.projected[k];
        }
        let overlap = dot(&b.vector);
        scored_at.insert(name.clone(), scored.len());
        scored.push((name.clone(), sum + w.lexical * overlap, overlap));
    }
    let get = |b: &str| -> (f64, f64) {
        match scored_at.get(b) {
            Some(&i) => (scored[i].1, scored[i].2),
            None => (f64::NEG_INFINITY, 0.0),
        }
    };
    let mut ranked: Vec<String> = scored.iter().map(|x| x.0.clone()).collect();
    ranked.sort_by(|a, b| js::num_cmp(get(b).0 - get(a).0));
    let top: Vec<String> = ranked.iter().take(TOP).cloned().collect();
    let best = if !top.is_empty() { get(&top[0]).0 } else { 0.0 };
    let second = if top.len() > 1 { get(&top[1]).0 } else { 0.0 };
    let floor = if !top.is_empty() { get(&top[top.len() - 1]).0 } else { 0.0 };
    let mut place: HashMap<&str, usize> = HashMap::new();
    for (k, b) in top.iter().enumerate() {
        place.insert(b.as_str(), k);
    }
    let mut found: HashMap<&str, (usize, usize)> = HashMap::new(); // name -> (index into searched, k)
    for (k, srow) in s.searched.iter().enumerate() {
        found.entry(srow.0.as_str()).or_insert((k, k));
    }
    let mut overlaps: Vec<String> = scored.iter().filter(|x| x.2 > 0.0).map(|x| x.0.clone()).collect();
    overlaps.sort_by(|a, b| {
        js::num_cmp(get(b).1 - get(a).1).then_with(|| if js::cmp16(a, b) == std::cmp::Ordering::Less { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater })
    });
    let mut pool: Vec<String> = Vec::new();
    {
        let mut seen = HashSet::new();
        let it = own
            .iter()
            .cloned()
            .chain(top.iter().take(POOL_MATCHES).cloned())
            .chain(s.searched.iter().take(POOL_SEARCHED).map(|x| x.0.clone()))
            .chain(overlaps.iter().take(POOL_OVERLAPS).cloned());
        for b in it {
            if seen.insert(b.clone()) {
                pool.push(b);
            }
        }
    }
    pool.retain(|b| scored_at.contains_key(b) || found.contains_key(b.as_str()));
    let known: HashSet<&str> = w.known.iter().map(|s| s.as_str()).collect();
    let named = named_components(request, &cat.phrases);
    let t = w.theta;
    let show_re = re("Showcase|Basic", "");
    let mut final_: Vec<(String, usize, f64)> = pool
        .iter()
        .enumerate()
        .map(|(pos, b)| {
            let m = if place.contains_key(b.as_str()) { get(b).0 } else { floor };
            let f = found.get(b.as_str()).map(|&(i, k)| (&s.searched[i], k));
            let component = cat.by_name.get(b).map(|&i| cat.blocks[i].1.component.clone());
            let own_at = own.iter().position(|x| x == b);
            let sv = f.map(|(row, _)| row);
            let score = t.g * (m - best)
                + t.grank * place.get(b.as_str()).map(|&x| x as f64).unwrap_or(99.0)
                + t.gmargin * (m - second)
                + t.seen * (if known.contains(b.as_str()) { 1.0 } else { 0.0 })
                + t.lex * get(b).1
                + t.sscore * sv.map(|r| r.1 / 100.0).unwrap_or(0.0)
                + t.scov
                    * sv.map(|r| r.2.unwrap_or(0.0) / crate::route::js_max(&[r.3.unwrap_or(0.0), 1.0])).unwrap_or(0.0)
                + t.srank * f.map(|(_, k)| k as f64).unwrap_or(300.0)
                + t.inkit * (if own_at.is_some() { 1.0 } else { 0.0 })
                + t.kitpos * own_at.map(|x| x as f64).unwrap_or(9.0)
                + t.mention * component.as_ref().map(|c| named.get(c).copied().unwrap_or(0.0)).unwrap_or(0.0)
                + t.show * (if js::test(b, show_re) { 1.0 } else { 0.0 });
            (b.clone(), pos, score)
        })
        .collect();
    final_.sort_by(|a, b| js::num_cmp(b.2 - a.2).then(a.1.cmp(&b.1)));
    let foreign: HashSet<&str> = s.foreign.iter().map(|x| x.as_str()).collect();
    let words = words_of(request);
    let keeps: Vec<bool> = own.iter().map(|b| foreign.contains(b.as_str()) || writes_name(&words, b)).collect();
    let kept: HashSet<&str> = own.iter().zip(&keeps).filter(|(_, k)| **k).map(|(b, _)| b.as_str()).collect();
    let order: Vec<String> = final_
        .iter()
        .map(|x| x.0.clone())
        .filter(|b| !kept.contains(b.as_str()) && !foreign.contains(b.as_str()))
        .chain(own.iter().filter(|b| !kept.contains(b.as_str())).cloned())
        .collect();
    let mut out: Vec<String> = Vec::new();
    let mut next = 0;
    for k in 0..own.len() {
        if keeps[k] {
            out.push(own[k].clone());
            continue;
        }
        // `order[next]` past the end is `undefined`, which `out.includes` never
        // holds; the JS then pushes `undefined`. Build lists never run short.
        while next < order.len() && out.contains(&order[next]) {
            next += 1;
        }
        if next < order.len() {
            out.push(order[next].clone());
        }
        next += 1;
    }
    let max = crate::route::js_max(&final_.iter().map(|x| x.2).collect::<Vec<_>>());
    let mut by_name: HashMap<&str, &BlockTemplate> = HashMap::new();
    for b in s.catalog {
        by_name.insert(b.name.as_str(), b);
    }
    for name in &out {
        if found.contains_key(name.as_str()) || own.contains(name) {
            continue;
        }
        let Some(block) = by_name.get(name.as_str()) else { continue };
        let Some(x) = final_.iter().find(|f| &f.0 == name) else { continue };
        let mut e = Map::new();
        e.insert("domain".into(), Value::String("template".into()));
        e.insert("name".into(), Value::String(name.clone()));
        e.insert("package".into(), Value::String(block.package.clone()));
        let sc = crate::route::js_max(&[1.0, js::round(100.0 * js::exp(x.2 - max))]);
        e.insert("score".into(), crate::json::num(sc));
        let cb = cat.by_name.get(name).map(|&i| &cat.blocks[i].1);
        e.insert("reason".into(), Value::String(reason_for(request, cb, w)));
        e.insert("description".into(), Value::String(block.description.clone()));
        e.insert("displayName".into(), Value::String(block.display_name.clone()));
        e.insert("kind".into(), Value::String("block".into()));
        e.insert("command".into(), Value::String(block.command.clone()));
        entries.insert(name.clone(), Value::Object(e));
    }
    (out, entries)
}

fn reason_for(request: &str, block: Option<&CatBlock>, w: &BlockPickerWeights) -> String {
    let Some(block) = block else { return "fits by meaning".into() };
    let raw = runs2(&js::lower(request));
    let mut word_of: HashMap<String, String> = HashMap::new();
    for x in &raw {
        if !stop().contains(x) {
            word_of.entry(stem_of(x)).or_insert_with(|| x.clone());
        }
    }
    let q = vector_of(&terms_of(request), w);
    let mut parts: Vec<(String, f64)> = Vec::new();
    for &(i, x) in &q {
        let term = &w.vocab[i];
        if term.contains('_') {
            continue;
        }
        let mut s = 0.0;
        let row = i * w.dims;
        for k in 0..w.dims {
            s += w.request[row + k] as f64 * block.projected[k];
        }
        s = x * s * w.request_scale + w.lexical * x * get_sparse(&block.vector, i).unwrap_or(0.0);
        if s > 0.0 {
            parts.push((word_of.get(term).cloned().unwrap_or_else(|| term.clone()), s));
        }
    }
    parts.sort_by(|a, b| js::num_cmp(b.1 - a.1));
    let top: Vec<String> = parts.iter().take(3).map(|p| p.0.clone()).collect();
    if top.is_empty() {
        "fits by meaning".into()
    } else {
        format!("fits by meaning: {}", top.join(", "))
    }
}
