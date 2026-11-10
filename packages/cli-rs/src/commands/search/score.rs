//! One term's score against one candidate (`_candidate-score.mjs`), a whole
//! query's score (`_score.mjs`), compound names (`_compound.mjs`), the title
//! tiers (`_titles.mjs`) and domain priority (`_priority.mjs`).

use super::cand::{Candidate, Word};
use super::words::*;
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Alias {
    No,
    Partial,
    Keyword,
}

/// A search term's forms, worked out once per term (`termWords` plus what
/// the prose and typo checks read).
#[derive(Debug)]
pub struct Term {
    pub term: String,
    pub forms: HashSet<String>,
    pub starts: Vec<String>,
    pub len: usize,
    pub u16: Vec<u16>,
    pub nospace: String,
    pub has_ws: bool,
    pub joined: String,
    pub roots: Vec<String>,
    pub split_words: Vec<String>,
}

impl Term {
    pub fn new(term: &str) -> Term {
        let forms_l = forms_list(term);
        let forms: HashSet<String> = forms_l.iter().cloned().collect();
        let mut starts = vec![term.to_string()];
        for s in singulars_of(term) {
            if jlen(&s) >= 5 {
                starts.push(s);
            }
        }
        let len = jlen(term);
        let roots = if len >= 3 {
            let mut seen = HashSet::new();
            let mut r = Vec::new();
            // [...new Set([stem(term), ...t.forms])]: forms in Set order.
            let mut order = vec![stem(term)];
            let mut fseen = HashSet::new();
            for f in &forms_l {
                if fseen.insert(f.clone()) {
                    order.push(f.clone());
                }
            }
            for f in order {
                if jlen(&f) >= 3 && seen.insert(f.clone()) {
                    r.push(f);
                }
            }
            r
        } else {
            Vec::new()
        };
        Term {
            term: term.to_string(),
            forms,
            starts,
            len,
            u16: term.encode_utf16().collect(),
            nospace: strip_ws(term),
            has_ws: has_ws(term),
            joined: joined(term),
            roots,
            split_words: split_ws(term).into_iter().filter(|w| !w.is_empty()).map(String::from).collect(),
        }
    }

    /// `sameTermWord(t, w)` with the word's forms precomputed.
    fn same_forms(&self, w: &str, w_forms: &[String]) -> bool {
        w == self.term || w_forms.iter().any(|f| self.forms.contains(f))
    }

    fn same_set(&self, w: &str, w_forms: &HashSet<String>) -> bool {
        w == self.term || w_forms.iter().any(|f| self.forms.contains(f))
    }

    fn covers_half(&self, text_len: usize) -> bool {
        self.len >= 4 && (self.len as f64) / (text_len as f64) >= 0.5
    }

    /// `startsATermWordOf(t, text)`.
    fn starts_a_word_of(&self, w: &Word) -> bool {
        if !self.covers_half(w.orig_len) {
            return false;
        }
        w.words.iter().zip(&w.words_forms).any(|(x, xf)| {
            self.starts.iter().any(|f| x.starts_with(f.as_str())) || self.same_set(x, xf)
        })
    }
}

fn singulars_of(w: &str) -> Vec<String> {
    let mut out = Vec::new();
    let n = jlen(w);
    if n > 3 && w.ends_with('s') {
        out.push(w[..w.len() - 1].to_string());
    }
    if n > 4 && w.ends_with("es") {
        out.push(w[..w.len() - 2].to_string());
    }
    if n > 4 && w.ends_with("ies") {
        out.push(format!("{}y", &w[..w.len() - 3]));
    }
    out
}

/// The term cache for one query.
#[derive(Default)]
pub struct Terms {
    map: std::collections::HashMap<String, std::rc::Rc<Term>>,
}

impl Terms {
    pub fn get(&mut self, t: &str) -> std::rc::Rc<Term> {
        if let Some(x) = self.map.get(t) {
            return x.clone();
        }
        let x = std::rc::Rc::new(Term::new(t));
        self.map.insert(t.to_string(), x.clone());
        x
    }
}

#[derive(Debug, Clone)]
pub struct Hit {
    pub score: i64,
    pub reason: String,
    pub alias: Alias,
}

#[derive(Clone, Copy, Default)]
pub struct Opts {
    pub fuzzy: bool,
    pub joins: bool,
    pub part: bool,
    pub synonym: bool,
}

impl Opts {
    pub fn new() -> Opts {
        Opts { fuzzy: true, joins: true, part: false, synonym: false }
    }
}

fn is_word_char(c: Option<char>) -> bool {
    c.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn boundary(text: &str, p: usize) -> bool {
    let before = text[..p].chars().next_back();
    let after = text[p..].chars().next();
    is_word_char(before) != is_word_char(after)
}

/// `/\b(?:roots)(s|es|ing|ed|ies)?\b/.test(text)`.
pub fn prose_match(text: &str, roots: &[String]) -> bool {
    for root in roots {
        for (i, _) in text.match_indices(root.as_str()) {
            if !boundary(text, i) {
                continue;
            }
            let e = i + root.len();
            for suf in ["s", "es", "ing", "ed", "ies", ""] {
                if text[e..].starts_with(suf) && boundary(text, e + suf.len()) {
                    return true;
                }
            }
        }
    }
    false
}

fn spells_out(t: &Term, name: &Word, c: &Candidate) -> bool {
    let words = &t.split_words;
    let parts = &name.words;
    if words.len() < 2 || words.len() != parts.len() {
        return false;
    }
    let mut expanded = false;
    for (w, p) in words.iter().zip(parts) {
        if same_word(w, p) {
            continue;
        }
        if jlen(p) != 1 || !w.starts_with(p.as_str()) {
            return false;
        }
        if !c.desc_words.iter().any(|d| same_word(d, w)) {
            return false;
        }
        expanded = true;
    }
    expanded
}

fn head_of_letters(t: &Term, name: &Word) -> bool {
    let parts = &name.words;
    parts.len() >= 2
        && t.same_set(&parts[parts.len() - 1], &name.words_forms[parts.len() - 1])
        && parts[..parts.len() - 1].iter().all(|p| jlen(p) == 1)
}

fn weak_keyword_score(t: &Term, kw: &Word) -> i64 {
    if kw.lower == t.term || t.same_forms(&kw.lower, &kw.lower_forms) {
        return 60;
    }
    if t.starts_a_word_of(kw) {
        40
    } else {
        0
    }
}

/// `scoreCandidate(term, candidate, opts)`.
pub fn score_candidate(t: &Term, c: &Candidate, o: Opts) -> Option<Hit> {
    let term = t.term.as_str();
    let mut best = 0i64;
    let mut reason = String::new();
    let mut alias = Alias::No;
    macro_rules! consider {
        ($s:expr, $why:expr) => {
            consider!($s, $why, Alias::No)
        };
        ($s:expr, $why:expr, $a:expr) => {{
            let s: i64 = $s;
            if s > best {
                best = s;
                reason = $why;
                alias = $a;
            }
        }};
    }
    let domain = c.domain.as_str();
    for nw in &c.names {
        let name_lower = nw.lower.as_str();
        let leaf = &name_lower[name_lower.rfind('/').map(|i| i + 1).unwrap_or(0)..];
        let spelled = domain != "doc" && !has_ws_us_dash(name_lower) && name_lower == t.nospace;
        if name_lower == term || leaf == term || spelled {
            consider!(100, "exact name".into());
        } else if o.joins
            && (domain == "component" || domain == "hook")
            && t.has_ws
            && name_lower.starts_with(t.nospace.as_str())
            && (jlen(&t.nospace) as f64) / (nw.u16.len() as f64) >= 0.75
        {
            consider!(95, format!("name \"{}\" spelled", nw.orig), Alias::Partial);
        } else if domain != "doc" && domain != "theme" && spells_out(t, nw, c) {
            consider!(95, format!("name \"{}\" spelled out", nw.orig));
        } else if plural_of(name_lower, term) || plural_of(term, name_lower) {
            consider!(99, "plural of the name".into());
        } else {
            if t.same_forms(name_lower, &nw.lower_forms) {
                consider!(95, format!("name \"{}\"", nw.orig));
            } else if !o.part && domain != "doc" && domain != "theme" && head_of_letters(t, nw) {
                consider!(90, format!("name \"{}\" ends in \"{}\"", nw.orig, term));
            } else if t.starts_a_word_of(nw) {
                consider!(60, format!("name contains \"{}\"", term));
            }
            if o.fuzzy {
                if let Some(d) = typo_distance(&t.term, &nw.lower, t.u16.len(), nw.u16.len()) {
                    consider!(
                        if d == 1 {
                            80
                        } else if d == 2 {
                            40
                        } else {
                            20
                        },
                        format!("similar name (distance {d})")
                    );
                }
            }
        }
    }

    if !o.part && !o.synonym {
        if let Some(fam) = c.family.as_deref().filter(|f| !f.is_empty()) {
            if c.family_index.unwrap_or(f64::INFINITY) < 3.0 {
                let fl = lower(fam);
                if term == fl || term == words_of(fam).join(" ") || t.nospace == fl {
                    consider!(90, format!("member of {fam}"));
                }
            }
        }
    }

    for kw in &c.kws {
        if kw.lower == term {
            consider!(90, format!("keyword \"{}\"", kw.orig));
            continue;
        }
        if o.joins && domain != "doc" && t.has_ws && kw.orig == t.joined {
            consider!(90, format!("keyword \"{}\"", kw.orig), Alias::Keyword);
            continue;
        }
        if t.same_forms(&kw.lower, &kw.lower_forms) {
            consider!(88, format!("keyword \"{}\"", kw.orig));
            continue;
        }
        if t.starts_a_word_of(kw) {
            consider!(70, format!("keyword \"{}\"", kw.orig));
        }
        if o.fuzzy {
            if let Some(d) = typo_distance(&t.term, &kw.lower, t.u16.len(), kw.u16.len()) {
                if d <= 2 {
                    consider!(if d == 1 { 70 } else { 30 }, format!("keyword \"{}\" (distance {d})", kw.orig));
                }
            }
        }
    }

    let read_weak = match &c.bound_words {
        None => true,
        Some(b) => b.iter().any(|kw| weak_keyword_score(t, kw) > 0),
    };
    if read_weak {
        for kw in &c.weak_words {
            let s = weak_keyword_score(t, kw);
            if s > 0 {
                consider!(s, format!("renders {}", kw.orig));
            }
        }
    }

    if t.len >= 3 {
        if !c.description.is_empty() && prose_match(&c.desc_lower, &t.roots) {
            consider!(50, format!("description mentions \"{term}\""));
        } else {
            let mut matched_prose = false;
            for (blob, low) in c.prose.iter().zip(&c.prose_lower) {
                if !blob.is_empty() && prose_match(low, &t.roots) {
                    consider!(50, format!("docs mention \"{term}\""));
                    matched_prose = true;
                    break;
                }
            }
            if !matched_prose {
                for (blob, low) in c.guidance.iter().zip(&c.guidance_lower) {
                    if !blob.is_empty() && prose_match(low, &t.roots) {
                        consider!(45, format!("guidance mentions \"{term}\""));
                        break;
                    }
                }
            }
        }
    }
    if best > 0 {
        Some(Hit { score: best, reason, alias })
    } else {
        None
    }
}

/// JS `Math.round`.
pub fn js_round(x: f64) -> f64 {
    let f = x.floor();
    if x - f >= 0.5 {
        f + 1.0
    } else {
        f
    }
}

/// `bestForToken(tok, candidate, opts)`.
pub fn best_for_token(terms: &mut Terms, tok: &str, c: &Candidate, o: Opts) -> Option<Hit> {
    let t = terms.get(tok);
    let mut best = score_candidate(&t, c, o);
    if let Some(syns) = synonym_index().get(tok) {
        for s in syns {
            let st = terms.get(s);
            if let Some(h) = score_candidate(&st, c, Opts { synonym: true, ..o }) {
                let score = js_round(h.score as f64 * 0.85) as i64;
                if best.as_ref().is_none_or(|b| score > b.score) {
                    best = Some(Hit { score, reason: format!("{} (~{tok})", h.reason), alias: Alias::No });
                }
            }
        }
    }
    best
}

// ── _compound.mjs ──────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Compound {
    pub score: i64,
    pub reason: String,
    pub covered: HashSet<String>,
    pub alias: Alias,
    pub alias_words: usize,
}

pub const MAX_RUN_WORDS: usize = 6;

/// Each run of 2..=6 adjacent words, longest first, joined.
pub fn query_runs(words: &[String]) -> Vec<(Vec<String>, String)> {
    let mut runs = Vec::new();
    let max = words.len().min(MAX_RUN_WORDS);
    let mut len = max;
    while len >= 2 {
        for i in 0..=words.len() - len {
            let run = words[i..i + len].to_vec();
            let w = run.concat();
            runs.push((run, w));
        }
        len -= 1;
    }
    runs
}

/// `compoundHit(words, candidate)`.
pub fn compound_hit(runs: &[(Vec<String>, String)], nwords: usize, c: &Candidate) -> Option<Compound> {
    if c.domain == "doc" || nwords < 2 {
        return None;
    }
    let partial = c.domain == "component" || c.domain == "hook";
    let mut best: Option<Compound> = None;
    for (run, word) in runs {
        let mut score = 0i64;
        let mut reason = String::new();
        let mut kind = Alias::No;
        for nw in &c.names {
            let name_joined = joined(&nw.orig);
            let nj = name_joined.as_str();
            if nj == word || plural_of(word, nj) || (c.domain == "hook" && nj.len() == word.len() + 3 && nj.starts_with("use") && &nj[3..] == word) {
                if score < 100 {
                    score = 100;
                    reason = format!("name {} spelled", nw.orig);
                    kind = Alias::No;
                }
            } else if !partial {
                continue;
            } else if nj.starts_with(word.as_str()) && (word.len() as f64) / (jlen(nj) as f64) >= 0.75 {
                if score < 95 {
                    score = 95;
                    reason = format!("name {} spelled", nw.orig);
                    kind = Alias::Partial;
                }
            } else if (word.len() as f64) / (jlen(nj) as f64) >= 0.5 && {
                let off = if nw.words.first().map(|s| s.as_str()) == Some("use") { 1 } else { 0 };
                run.iter().enumerate().all(|(j, w)| nw.words.get(j + off) == Some(w))
            } {
                if score < 92 {
                    score = 92;
                    reason = format!("name {} starts \"{}\"", nw.orig, run.join(" "));
                    kind = Alias::Partial;
                }
            } else if (word.len() as f64) / (jlen(nj) as f64) >= 0.5
                && (0..nw.words.len()).any(|k| run.iter().enumerate().all(|(j, w)| nw.words.get(k + j) == Some(w)))
            {
                if score < 70 {
                    score = 70;
                    reason = format!("name {} holds \"{}\"", nw.orig, run.join(" "));
                    kind = Alias::Partial;
                }
            }
        }
        if score < 90 && c.compound_kws.iter().any(|k| k == word) {
            score = 90;
            reason = format!("keyword \"{}\" spelled", run.join(" "));
            kind = Alias::Keyword;
        }
        if score > best.as_ref().map_or(0, |b| b.score) {
            let mut covered = HashSet::new();
            for a in 0..run.len() {
                for b in a + 1..=run.len() {
                    covered.insert(run[a..b].concat());
                }
            }
            best = Some(Compound {
                score,
                reason,
                covered,
                alias: kind,
                alias_words: if kind == Alias::No { 0 } else { run.len() },
            });
        }
    }
    best
}

// ── _titles.mjs ─────────────────────────────────────────────────────

pub const TITLE_PHRASE_SCORE: i64 = 170;
pub const TITLE_IN_QUERY_SCORE: i64 = 160;

pub fn heading_with_phrase<'a>(query: &[String], c: &'a Candidate) -> Option<&'a str> {
    if query.len() < 2 {
        return None;
    }
    let titles = c.titles.as_ref()?;
    let tw = c.title_words.as_ref()?;
    for (title, words) in titles.iter().zip(tw) {
        if words.len() < query.len() {
            continue;
        }
        for i in 0..=words.len() - query.len() {
            if query.iter().enumerate().all(|(j, w)| same_phrase_word(&words[i + j], w)) {
                return Some(title);
            }
        }
    }
    None
}

pub fn title_in_query<'a>(query: &[String], c: &'a Candidate) -> Option<&'a str> {
    let titles = c.titles.as_ref()?;
    let tw = c.title_words.as_ref()?;
    for (title, words) in titles.iter().zip(tw) {
        if words.len() < 2 || words.len() > query.len() {
            continue;
        }
        for i in 0..=query.len() - words.len() {
            if words.iter().enumerate().all(|(j, w)| same_phrase_word(&query[i + j], w)) {
                return Some(title);
            }
        }
    }
    None
}

// ── _score.mjs ──────────────────────────────────────────────────────

const MIN_TOKEN_SCORE: i64 = 50;
pub const FULL_COVERAGE_SCORE: i64 = 151;
pub const STRONG_TOKEN_SCORE: i64 = 70;

#[derive(Debug, Clone)]
pub struct QueryHit {
    pub score: i64,
    pub reason: String,
    pub matched: usize,
    pub total: usize,
    pub alias: Alias,
    pub alias_words: usize,
}

/// What one query brings to `scoreQuery`, worked out once.
pub struct QueryCtx {
    pub term: String,
    pub tokens: Vec<String>,
    /// The words for compound names (empty when the query names an entry).
    pub words: Vec<String>,
    pub runs: Vec<(Vec<String>, String)>,
    /// `phraseWords(term)`.
    pub term_phrase: Vec<String>,
    pub fuzzy: bool,
    pub phrase: bool,
    pub terms: Terms,
}

impl QueryCtx {
    pub fn new(term: &str, tokens: Vec<String>, words: Vec<String>) -> QueryCtx {
        let term_phrase = phrase_words(term);
        let fuzzy = tokens.len() <= 1 || !has_ws(term);
        let phrase = term_phrase.len() >= 2 || words.len() >= 2;
        QueryCtx {
            term: term.to_string(),
            runs: query_runs(&words),
            tokens,
            words,
            term_phrase,
            fuzzy,
            phrase,
            terms: Terms::default(),
        }
    }
}

/// `scoreQuery(term, tokens, candidate, words, {plain})`, with the compound
/// hit it read (`compoundOf`).
pub fn score_query(q: &mut QueryCtx, c: &Candidate, plain: bool) -> (Option<QueryHit>, Option<Compound>) {
    let total = q.tokens.len().max(1);
    let as_full = |h: Hit| QueryHit { score: h.score, reason: h.reason, matched: total, total, alias: Alias::No, alias_words: 0 };
    let fuzzy = q.fuzzy;
    let tt = q.terms.get(&q.term.clone());
    let full = score_candidate(&tt, c, Opts { fuzzy, joins: !plain && !q.words.is_empty(), part: false, synonym: false });
    let mut compound = compound_hit(&q.runs, q.words.len(), c);
    let compound_seen = compound.clone();
    if plain && compound.as_ref().is_some_and(|x| x.alias != Alias::No) {
        compound = None;
    }
    let few_tokens = |q: &mut QueryCtx, full: Option<Hit>| -> Option<QueryHit> {
        let single = if q.tokens.len() == 1 {
            let tok = q.tokens[0].clone();
            best_for_token(&mut q.terms, &tok, c, Opts { fuzzy, ..Opts::new() })
        } else {
            None
        };
        if let Some(f) = &full {
            if single.as_ref().is_none_or(|s| f.score >= s.score) {
                return Some(as_full(f.clone()));
            }
        }
        single.map(as_full)
    };
    if q.tokens.len() <= 1 && !q.phrase {
        return (few_tokens(q, full), compound_seen);
    }
    if let Some(f) = &full {
        if f.score >= 90 {
            let mut h = as_full(Hit { score: f.score + 100, reason: f.reason.clone(), alias: Alias::No });
            if f.alias != Alias::No {
                h.alias = f.alias;
                h.alias_words = q.words.len();
            }
            return (Some(h), compound_seen);
        }
    }
    if let Some(heading) = heading_with_phrase(&q.term_phrase, c) {
        return (
            Some(as_full(Hit {
                score: TITLE_PHRASE_SCORE,
                reason: format!("title \"{heading}\" holds the whole query"),
                alias: Alias::No,
            })),
            compound_seen,
        );
    }
    if q.tokens.len() <= 1 {
        return (few_tokens(q, full), compound_seen);
    }
    let mut strongest = 0i64;
    let mut matched = 0usize;
    let mut token_sum = 0i64;
    let mut hit_terms: Vec<String> = Vec::new();
    let mut alias = Alias::No;
    let mut alias_words = 0usize;
    let tokens = q.tokens.clone();
    for tok in &tokens {
        let mut h = best_for_token(&mut q.terms, tok, c, Opts { fuzzy, part: true, ..Opts::new() }).map(|h| (h.score, h.alias));
        if let Some(cp) = &compound {
            if cp.covered.contains(&joined(tok)) && cp.score > h.map_or(0, |x| x.0) {
                h = Some((cp.score, cp.alias));
                if cp.alias != Alias::No && cp.score >= MIN_TOKEN_SCORE {
                    alias = if alias == Alias::Partial { alias } else { cp.alias };
                    alias_words = cp.alias_words;
                }
            }
        }
        if let Some((s, _)) = h {
            if s >= MIN_TOKEN_SCORE {
                if s > strongest {
                    strongest = s;
                }
                matched += 1;
                hit_terms.push(tok.clone());
                token_sum += s;
            }
        }
    }
    if let Some(named) = title_in_query(&q.term_phrase, c) {
        return (
            Some(QueryHit {
                score: TITLE_IN_QUERY_SCORE + matched.min(9) as i64,
                reason: format!("the query names the title \"{named}\""),
                matched,
                total,
                alias: Alias::No,
                alias_words: 0,
            }),
            compound_seen,
        );
    }
    if matched == 0 {
        return (full.map(as_full), compound_seen);
    }
    let reason = format!("matches {}/{} terms: {}", matched, tokens.len(), hit_terms.join(", "));
    if matched == tokens.len() && strongest >= STRONG_TOKEN_SCORE {
        let m = matched as i64;
        let bonus = ((token_sum - m * MIN_TOKEN_SCORE) as f64 / (m * 5) as f64).floor() as i64;
        return (
            Some(QueryHit {
                score: FULL_COVERAGE_SCORE + bonus.min(8),
                reason,
                matched,
                total,
                alias,
                alias_words: if alias == Alias::No { 0 } else { alias_words },
            }),
            compound_seen,
        );
    }
    let coverage = matched as f64 / tokens.len() as f64;
    let token_score =
        js_round(strongest as f64 + ((matched - 1).min(3) * 12) as f64 + coverage * 15.0) as i64;
    if let Some(f) = &full {
        if f.score >= token_score {
            return (Some(as_full(f.clone())), compound_seen);
        }
    }
    (
        Some(QueryHit {
            score: token_score,
            reason,
            matched,
            total,
            alias,
            alias_words: if alias == Alias::No { 0 } else { alias_words },
        }),
        compound_seen,
    )
}

// ── _priority.mjs ───────────────────────────────────────────────────

/// `domainPriority(term, tokens, candidate, hit, words)`.
pub fn domain_priority(q: &mut QueryCtx, c: &Candidate, hit: &QueryHit, compound: &Option<Compound>) -> u8 {
    let mut words: Vec<String> = vec![q.term.clone()];
    words.extend(q.tokens.iter().cloned());
    if c.domain == "doc" {
        let topic = lower(c.topic.as_deref().unwrap_or(&c.name));
        let leaf = topic[topic.rfind('/').map(|i| i + 1).unwrap_or(0)..].to_string();
        let mut named = vec![topic.clone(), leaf];
        if c.section.is_none() {
            if let Some(t0) = c.titles.as_ref().and_then(|t| t.first()).filter(|t| !t.is_empty()) {
                named.push(t0.clone());
            }
        }
        if named.iter().any(|n| same_phrase_words(&q.term_phrase, &phrase_words(n))) {
            return 2;
        }
        if q.term_phrase.len() >= 2 && c.section.is_none() && c.declared.iter().any(|k| same_phrase_words(&q.term_phrase, &phrase_words(k))) {
            return 1;
        }
        let bare = Candidate::bare(&topic);
        if words.iter().any(|w| {
            let t = q.terms.get(w);
            score_candidate(&t, &bare, Opts { fuzzy: false, ..Opts::new() }).map_or(0, |h| h.score) >= 95
        }) {
            return 1;
        }
        if hit.score >= TITLE_IN_QUERY_SCORE && hit.score < TITLE_PHRASE_SCORE {
            return 1;
        }
        if hit.score >= FULL_COVERAGE_SCORE && hit.score < TITLE_IN_QUERY_SCORE && hit.matched == hit.total {
            let title_words = c.title_words.as_ref().and_then(|t| t.first()).cloned().unwrap_or_default();
            let list: Vec<String> = if q.tokens.is_empty() { vec![q.term.clone()] } else { q.tokens.clone() };
            if list.iter().any(|t| title_words.iter().any(|w| same_phrase_word(t, w) || same_word(t, w))) {
                return 1;
            }
        }
        return 0;
    }
    if hit.score >= FULL_COVERAGE_SCORE {
        return 1;
    }
    if compound.as_ref().map_or(0, |x| x.score) >= STRONG_TOKEN_SCORE {
        return 1;
    }
    let fuzzy = q.tokens.len() <= 1;
    let multi = q.tokens.len() > 1;
    for (i, w) in words.iter().enumerate() {
        let h = best_for_token(&mut q.terms, w, c, Opts { fuzzy, part: i > 0 && multi, ..Opts::new() });
        if h.map_or(0, |x| x.score) >= STRONG_TOKEN_SCORE {
            return 1;
        }
    }
    0
}
