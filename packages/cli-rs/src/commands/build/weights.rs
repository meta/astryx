//! Word weights for build's START (`api/build/kit/weights.mjs`): checked-in
//! per-template word weights, blended with the page ranker's scores.

use super::js::{self, re};
use super::rank::RankedPage;
use super::vocab::stopwords;
use super::words::PageTemplate;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

pub const SHELL: &str = "SHELL";
const SHELL_FAMILY: &str = "Shell";

#[derive(Debug, Clone)]
pub struct WeightTable {
    pub words: Vec<String>,
    pub bias: Vec<f64>,
    pub clip: f64,
    pub step: f64,
    /// One per word: UTF-16 code units, one per candidate.
    pub rows: Vec<Vec<u16>>,
    pub index: HashMap<String, usize>,
}

#[derive(Debug, Clone)]
pub struct WeightsFile {
    pub candidates: Vec<String>,
    pub tables: Vec<WeightTable>,
    pub blend: Vec<f64>,
}

impl WeightsFile {
    /// Parse and validate a weights file as `isWeightsFile` does.
    pub fn from_json(file: &serde_json::Value) -> Option<WeightsFile> {
        let candidates: Vec<String> =
            file.get("candidates")?.as_array()?.iter().map(|c| c.as_str().map(str::to_string)).collect::<Option<_>>()?;
        let n = candidates.len();
        if n == 0 {
            return None;
        }
        let tables_v = file.get("tables")?.as_array()?;
        if tables_v.is_empty() {
            return None;
        }
        let num = |v: &serde_json::Value| v.as_f64().filter(|x| x.is_finite());
        let mut tables = Vec::new();
        for t in tables_v {
            let words: Vec<String> =
                t.get("words")?.as_array()?.iter().map(|w| w.as_str().map(str::to_string)).collect::<Option<_>>()?;
            let rows_v = t.get("rows")?.as_array()?;
            if rows_v.len() != words.len() {
                return None;
            }
            let mut rows = Vec::new();
            for r in rows_v {
                let s = r.as_str()?;
                let u: Vec<u16> = s.encode_utf16().collect();
                if u.len() != n {
                    return None;
                }
                rows.push(u);
            }
            let bias: Vec<f64> = t.get("bias")?.as_array()?.iter().map(num).collect::<Option<_>>()?;
            if bias.len() != n {
                return None;
            }
            let clip = num(t.get("clip")?)?;
            let step = num(t.get("step")?)?;
            // `new Map(words.map((w, i) => [w, i]))`: a repeated word keeps its last row.
            let mut index = HashMap::new();
            for (i, w) in words.iter().enumerate() {
                index.insert(w.clone(), i);
            }
            tables.push(WeightTable { words, bias, clip, step, rows, index });
        }
        let blend: Vec<f64> = file.get("blend")?.as_array()?.iter().map(num).collect::<Option<_>>()?;
        if blend.len() != 3 * (tables.len() + 1) + 1 {
            return None;
        }
        Some(WeightsFile { candidates, tables, blend })
    }
}

// The Porter (1980) stemmer.
const CONS: &str = "[^aeiou][^aeiouy]*";
const VOW: &str = "[aeiouy][aeiou]*";

fn mgr0() -> &'static js::Regex {
    re(&format!("^({CONS})?{VOW}{CONS}"), "")
}
fn meq1() -> &'static js::Regex {
    re(&format!("^({CONS})?{VOW}{CONS}({VOW})?$"), "")
}
fn mgr1() -> &'static js::Regex {
    re(&format!("^({CONS})?{VOW}{CONS}{VOW}{CONS}"), "")
}
fn has_vowel() -> &'static js::Regex {
    re(&format!("^({CONS})?[aeiouy]"), "")
}
fn cvc() -> &'static js::Regex {
    re(&format!("^{CONS}[aeiouy][^aeiouwxy]$"), "")
}

fn step2(s: &str) -> &'static str {
    match s {
        "ational" => "ate",
        "tional" => "tion",
        "enci" => "ence",
        "anci" => "ance",
        "izer" => "ize",
        "bli" => "ble",
        "alli" => "al",
        "entli" => "ent",
        "eli" => "e",
        "ousli" => "ous",
        "ization" => "ize",
        "ation" => "ate",
        "ator" => "ate",
        "alism" => "al",
        "iveness" => "ive",
        "fulness" => "ful",
        "ousness" => "ous",
        "aliti" => "al",
        "iviti" => "ive",
        "biliti" => "ble",
        "logi" => "log",
        _ => unreachable!(),
    }
}

fn step3(s: &str) -> &'static str {
    match s {
        "icate" => "ic",
        "ative" => "",
        "alize" => "al",
        "iciti" => "ic",
        "ical" => "ic",
        "ful" => "",
        "ness" => "",
        _ => unreachable!(),
    }
}

/// Groups of an anchored regex match on `w`.
fn exec(pattern: &str, w: &str) -> Option<Vec<String>> {
    let r = re(pattern, "");
    let m = r.find(w)?;
    Some(
        m.groups()
            .map(|g| g.map(|g| w[g].to_string()).unwrap_or_default())
            .collect(),
    )
}

thread_local! {
    static STEMS: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
}

/// The Porter stem of a lowercase word.
pub fn porter(word: &str) -> String {
    if let Some(s) = STEMS.with(|c| c.borrow().get(word).cloned()) {
        return s;
    }
    let out = porter_uncached(word);
    STEMS.with(|c| c.borrow_mut().insert(word.to_string(), out.clone()));
    out
}

fn porter_uncached(word: &str) -> String {
    let mut w = word.to_string();
    if js::len16(&w) < 3 || w.chars().any(|c| c.is_ascii_digit()) {
        return w;
    }
    let leading_y = w.starts_with('y');
    if leading_y {
        w = format!("Y{}", &w[1..]);
    }
    if let Some(m) = exec(r"^(.+?)(ss|i)es$", &w) {
        w = format!("{}{}", m[1], m[2]);
    } else if let Some(m) = exec(r"^(.+?)([^s])s$", &w) {
        w = format!("{}{}", m[1], m[2]);
    }
    if let Some(m) = exec(r"^(.+?)eed$", &w) {
        if js::test(&m[1], mgr0()) {
            w = slice_end(&w, 1);
        }
    } else if let Some(m) = exec(r"^(.+?)(ed|ing)$", &w).filter(|m| js::test(&m[1], has_vowel())) {
        w = m[1].clone();
        if js::test(&w, re(r"(at|bl|iz)$", "")) {
            w.push('e');
        } else if js::test(&w, re(r"([^aeiouylsz])\1$", "")) {
            w = slice_end(&w, 1);
        } else if js::test(&w, cvc()) {
            w.push('e');
        }
    }
    if let Some(m) = exec(r"^(.+?)y$", &w).filter(|m| js::test(&m[1], has_vowel())) {
        w = format!("{}i", m[1]);
    }
    if let Some(m) = exec(
        r"^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$",
        &w,
    )
    .filter(|m| js::test(&m[1], mgr0()))
    {
        w = format!("{}{}", m[1], step2(&m[2]));
    }
    if let Some(m) = exec(r"^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$", &w).filter(|m| js::test(&m[1], mgr0())) {
        w = format!("{}{}", m[1], step3(&m[2]));
    }
    if let Some(m) =
        exec(r"^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$", &w)
    {
        if js::test(&m[1], mgr1()) {
            w = m[1].clone();
        }
    } else if let Some(m) = exec(r"^(.+?)(s|t)(ion)$", &w) {
        if js::test(&format!("{}{}", m[1], m[2]), mgr1()) {
            w = format!("{}{}", m[1], m[2]);
        }
    }
    if let Some(m) = exec(r"^(.+?)e$", &w) {
        if js::test(&m[1], mgr1()) || (js::test(&m[1], meq1()) && !js::test(&m[1], cvc())) {
            w = m[1].clone();
        }
    }
    if js::test(&w, re(r"ll$", "")) && js::test(&w, mgr1()) {
        w = slice_end(&w, 1);
    }
    if leading_y {
        w = format!("y{}", js::slice16(&w, 1, usize::MAX));
    }
    w
}

/// `w.slice(0, -k)` in UTF-16 units.
fn slice_end(w: &str, k: usize) -> String {
    let n = js::len16(w);
    js::slice16(w, 0, n.saturating_sub(k))
}

/// Lowercase words of an idea that can carry weight: two or more
/// characters, no digits.
pub fn weight_words(idea: &str) -> Vec<String> {
    let l = js::lower(idea);
    js::split(&l, re(r"[^a-z0-9]+", ""))
        .into_iter()
        .filter(|w| js::len16(w) >= 2 && !w.chars().any(|c| c.is_ascii_digit()))
        .collect()
}

fn table_scores(table: &WeightTable, words: &[String], n: usize) -> Vec<f64> {
    let mut out: Vec<f64> = table.bias.iter().take(n).copied().collect();
    while out.len() < n {
        // `Float64Array.from(bias.slice(0, n))` is never short: bias has n.
        out.push(0.0);
    }
    for w in words {
        let Some(&i) = table.index.get(w) else { continue };
        let row = &table.rows[i];
        for c in 0..n {
            let code = row.get(c).map(|x| *x as f64).unwrap_or(f64::NAN);
            out[c] += (code - 97.0) * table.step - table.clip;
        }
    }
    out
}

fn round4(x: f64) -> f64 {
    js::round(x * 1e4) / 1e4
}

/// The ranker's scores as a blend member.
fn ranker_scores(ranked: &[RankedPage], pick: Option<&RankedPage>) -> HashMap<String, f64> {
    let mut out: indexmap::IndexMap<String, f64> = indexmap::IndexMap::new();
    for r in ranked {
        if r.family != SHELL_FAMILY {
            out.insert(r.name.clone(), r.score);
        }
    }
    let mut vals: Vec<f64> = vec![0.0];
    vals.extend(out.values().copied());
    let top = crate::route::js_max(&vals);
    let page_start = pick.filter(|p| p.family != SHELL_FAMILY).map(|p| p.name.clone());
    out.insert(SHELL.to_string(), if page_start.is_some() { -1.0 } else { top + 1.0 });
    if let Some(ps) = page_start {
        out.insert(ps, top + 2.0);
    }
    out.into_iter().collect()
}

fn member_features(v: &[Option<f64>]) -> Vec<[f64; 3]> {
    let finite: Vec<f64> = v.iter().filter_map(|x| *x).collect();
    let len = finite.len().max(1) as f64;
    let mean = finite.iter().fold(0.0, |a, b| a + b) / len;
    let var = finite.iter().fold(0.0, |a, b| a + (b - mean) * (b - mean)) / len;
    let mut sd = var.sqrt();
    if sd == 0.0 || sd.is_nan() {
        sd = 1.0;
    }
    let val: Vec<f64> = v.iter().map(|x| x.unwrap_or(-1e9)).collect();
    let mut order: Vec<usize> = (0..v.len()).collect();
    order.sort_by(|&a, &b| js::num_cmp(val[b] - val[a]));
    let mut rank = vec![0usize; v.len()];
    for (r, &ci) in order.iter().enumerate() {
        rank[ci] = r;
    }
    v.iter()
        .enumerate()
        .map(|(i, x)| {
            [
                match x {
                    None => -4.0,
                    Some(x) => {
                        let z = (x - mean) / sd;
                        // Math.max(-4, Math.min(4, z))
                        crate::route::js_max(&[-4.0, js_min(4.0, z)])
                    }
                },
                1.0 / (rank[i] as f64 + 1.0),
                if rank[i] == 0 { 1.0 } else { 0.0 },
            ]
        })
        .collect()
}

fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a < b {
        a
    } else {
        b
    }
}

fn own_words(name: &str, catalog: &[PageTemplate], words: &HashSet<String>) -> usize {
    let Some(t) = catalog.iter().find(|c| c.name == name) else { return 0 };
    let mut text = vec![t.display_name.clone(), t.category.clone()];
    text.extend(t.keywords.iter().cloned());
    let own: HashSet<String> =
        weight_words(&text.join(" ")).into_iter().filter(|w| !stopwords().contains(w.as_str())).map(|w| porter(&w)).collect();
    words.iter().filter(|w| own.contains(*w)).count()
}

const FAMILY_SLACK: usize = 2;

fn family_at(name: &str, catalog: &[PageTemplate], order: &[String]) -> f64 {
    let t = catalog.iter().find(|c| c.name == name);
    let cat = t.map(|t| t.category.as_str()).unwrap_or("");
    let family: Vec<String> = weight_words(cat.split(" - ").next().unwrap_or("")).iter().map(|w| porter(w)).collect();
    let at = if family.is_empty() { None } else { order.iter().position(|w| family.contains(w)) };
    match at {
        Some(i) => i as f64,
        None => f64::INFINITY,
    }
}

struct Blend {
    cands: Vec<String>,
    scores: Vec<f64>,
    position: HashMap<String, usize>,
}

fn blend(idea: &str, ranked: &[RankedPage], pick: Option<&RankedPage>, catalog: &[PageTemplate], weights: &WeightsFile) -> Blend {
    let ready: HashSet<&str> = catalog.iter().map(|t| t.name.as_str()).collect();
    let shell_ids: HashSet<&str> = ranked.iter().filter(|r| r.family == SHELL_FAMILY).map(|r| r.name.as_str()).collect();
    let mut cands: Vec<String> =
        weights.candidates.iter().filter(|c| *c == SHELL || ready.contains(c.as_str())).cloned().collect();
    for t in catalog {
        if !shell_ids.contains(t.name.as_str()) && !weights.candidates.contains(&t.name) {
            cands.push(t.name.clone());
        }
    }
    let mut position = HashMap::new();
    for (i, c) in weights.candidates.iter().enumerate() {
        position.insert(c.clone(), i);
    }
    // A Set of stems, iterated in insertion order.
    let mut words: Vec<String> = Vec::new();
    for w in weight_words(idea) {
        let s = porter(&w);
        if !words.contains(&s) {
            words.push(s);
        }
    }
    let mut members: Vec<Vec<Option<f64>>> = weights
        .tables
        .iter()
        .map(|table| {
            let s = table_scores(table, &words, weights.candidates.len());
            cands.iter().map(|c| position.get(c).map(|&i| round4(s[i]))).collect()
        })
        .collect();
    let from_ranker = ranker_scores(ranked, pick);
    let ranker_member: Vec<Option<f64>> = cands.iter().map(|c| from_ranker.get(c).map(|x| round4(*x))).collect();
    members.insert(1, ranker_member);
    let feats: Vec<Vec<[f64; 3]>> = members.iter().map(|m| member_features(m)).collect();
    let scores = cands
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let mut s = 0.0;
            let mut j = 0;
            for f in &feats {
                for x in f[i] {
                    s += x * weights.blend[j];
                    j += 1;
                }
            }
            s + (if c == SHELL { 1.0 } else { 0.0 }) * weights.blend[j]
        })
        .collect();
    Blend { cands, scores, position }
}

pub fn blend_order(
    idea: &str,
    ranked: &[RankedPage],
    pick: Option<&RankedPage>,
    catalog: &[PageTemplate],
    weights: Option<&WeightsFile>,
) -> Option<Vec<String>> {
    let weights = weights?;
    let b = blend(idea, ranked, pick, catalog, weights);
    let mut xs: Vec<(String, f64, usize)> =
        b.cands.iter().enumerate().map(|(i, c)| (c.clone(), b.scores[i], i)).filter(|x| x.0 != SHELL).collect();
    xs.sort_by(|x, y| js::num_cmp(y.1 - x.1).then(x.2.cmp(&y.2)));
    Some(xs.into_iter().map(|x| x.0).collect())
}

/// Where an idea starts, by the blended weights: `Some(Some(id))` a template,
/// `Some(None)` the app shell, `None` without weights.
pub fn weigh_start(
    idea: &str,
    ranked: &[RankedPage],
    pick: Option<&RankedPage>,
    catalog: &[PageTemplate],
    weights: Option<&WeightsFile>,
    new_page: bool,
) -> Option<Option<String>> {
    let weights = weights?;
    let b = blend(idea, ranked, pick, catalog, weights);
    let best = |ok: &dyn Fn(&str) -> bool| -> Option<String> {
        let mut at: Option<usize> = None;
        for c in 0..b.cands.len() {
            if ok(&b.cands[c]) && (at.is_none() || b.scores[c] > b.scores[at.unwrap()]) {
                at = Some(c);
            }
        }
        at.map(|i| b.cands[i].clone())
    };
    let kept = pick
        .filter(|p| p.family != SHELL_FAMILY && b.cands.contains(&p.name))
        .map(|p| p.name.clone());
    if kept.is_some() && pick.map(|p| p.container_matched).unwrap_or(false) {
        return Some(kept);
    }
    if let Some(k) = kept.as_ref().filter(|k| !b.position.contains_key(*k)) {
        let listed = best(&|c| c != SHELL && b.position.contains_key(c));
        let Some(listed) = listed else { return Some(kept) };
        let content: Vec<String> = weight_words(idea).into_iter().filter(|w| !stopwords().contains(w.as_str())).collect();
        let said: HashSet<String> = content.iter().map(|w| porter(w)).collect();
        let mine = own_words(k, catalog, &said);
        let theirs = own_words(&listed, catalog, &said);
        if mine >= theirs {
            return Some(kept);
        }
        let order: Vec<String> = content.iter().map(|w| porter(w)).collect();
        return Some(Some(
            if family_at(k, catalog, &order) < family_at(&listed, catalog, &order)
                && mine + FAMILY_SLACK >= theirs
            {
                k.clone()
            } else {
                listed
            },
        ));
    }
    let top = best(&|_| true);
    if top.as_deref() != Some(SHELL) {
        return Some(top);
    }
    if new_page && kept.is_some() {
        return Some(kept);
    }
    Some(None)
}
