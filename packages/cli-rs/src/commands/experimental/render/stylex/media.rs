//! StyleX's media-query reader (`MediaQuery` in @stylexjs/shared): parse an
//! `@media` key, normalize ranges, and print it back, for
//! `lastMediaQueryWinsTransform`.

#[derive(Debug, Clone, PartialEq)]
pub enum PairValue {
    Len { value: f64, unit: String },
    Ident(String),
    Ratio(f64, f64),
    Num(f64),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Q {
    Keyword { key: String, not: bool, only: bool },
    Word(String),
    Pair { key: String, value: PairValue },
    Not(Box<Q>),
    And(Vec<Q>),
    Or(Vec<Q>),
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Ws,
    Open,
    Close,
    Comma,
    Colon,
    Ident(String),
    At(String),
    Dim(f64, String),
    Num(f64),
    Delim(char),
}

fn tokenize(s: &str) -> Option<Vec<Tok>> {
    let cs: Vec<char> = s.chars().collect();
    let mut i = 0;
    let mut out = vec![];
    let ident_start = |c: char| c.is_ascii_alphabetic() || c == '_' || c == '-' || !c.is_ascii();
    let ident_char = |c: char| c.is_ascii_alphanumeric() || c == '_' || c == '-' || !c.is_ascii();
    while i < cs.len() {
        let c = cs[i];
        if c.is_whitespace() {
            while i < cs.len() && cs[i].is_whitespace() {
                i += 1;
            }
            out.push(Tok::Ws);
        } else if c == '(' {
            out.push(Tok::Open);
            i += 1;
        } else if c == ')' {
            out.push(Tok::Close);
            i += 1;
        } else if c == ',' {
            out.push(Tok::Comma);
            i += 1;
        } else if c == ':' {
            out.push(Tok::Colon);
            i += 1;
        } else if c == '@' {
            let st = i + 1;
            i += 1;
            while i < cs.len() && ident_char(cs[i]) {
                i += 1;
            }
            out.push(Tok::At(cs[st..i].iter().collect()));
        } else if c.is_ascii_digit() || ((c == '.' || c == '+' || c == '-') && cs.get(i + 1).is_some_and(|n| n.is_ascii_digit() || (*n == '.' && cs.get(i + 2).is_some_and(|m| m.is_ascii_digit())))) {
            let st = i;
            if c == '+' || c == '-' {
                i += 1;
            }
            while i < cs.len() && (cs[i].is_ascii_digit() || cs[i] == '.') {
                i += 1;
            }
            let num: f64 = cs[st..i].iter().collect::<String>().parse().ok()?;
            if i < cs.len() && (ident_start(cs[i]) || cs[i] == '%') && cs[i] != '-' {
                let us = i;
                if cs[i] == '%' {
                    i += 1;
                } else {
                    while i < cs.len() && ident_char(cs[i]) {
                        i += 1;
                    }
                }
                out.push(Tok::Dim(num, cs[us..i].iter().collect()));
            } else {
                out.push(Tok::Num(num));
            }
        } else if ident_start(c) {
            let st = i;
            while i < cs.len() && ident_char(cs[i]) {
                i += 1;
            }
            out.push(Tok::Ident(cs[st..i].iter().collect()));
        } else {
            out.push(Tok::Delim(c));
            i += 1;
        }
    }
    Some(out)
}

struct P {
    t: Vec<Tok>,
}

type R = Option<(Q, usize)>;

impl P {
    fn at(&self, i: usize) -> Option<&Tok> {
        self.t.get(i)
    }
    fn ows(&self, i: usize) -> usize {
        if self.at(i) == Some(&Tok::Ws) { i + 1 } else { i }
    }
    fn ident(&self, i: usize) -> Option<(String, usize)> {
        match self.at(i) {
            Some(Tok::Ident(s)) => Some((s.clone(), i + 1)),
            _ => None,
        }
    }
    fn keyword(&self, i: usize) -> R {
        // ['not'] ['only'] (screen|print|all), separated by whitespace
        let mut j = i;
        let mut not = false;
        let mut only = false;
        if let Some((w, n)) = self.ident(j) {
            if w == "not" && self.at(n) == Some(&Tok::Ws) {
                not = true;
                j = n + 1;
            }
        }
        if let Some((w, n)) = self.ident(j) {
            if w == "only" && self.at(n) == Some(&Tok::Ws) {
                only = true;
                j = n + 1;
            }
        }
        let (k, n) = self.ident(j)?;
        if k == "screen" || k == "print" || k == "all" {
            return Some((Q::Keyword { key: k, not, only }, n));
        }
        None
    }
    fn word_rule(&self, i: usize) -> R {
        if self.at(i) != Some(&Tok::Open) {
            return None;
        }
        let (k, n) = self.ident(i + 1)?;
        if self.at(n) != Some(&Tok::Close) || !["color", "monochrome", "grid", "color-index"].contains(&k.as_str()) {
            return None;
        }
        Some((Q::Word(k), n + 1))
    }
    fn rule_value(&self, i: usize) -> Option<(PairValue, usize)> {
        match self.at(i)? {
            Tok::Dim(v, u) => Some((PairValue::Len { value: *v, unit: u.clone() }, i + 1)),
            Tok::Ident(s) => Some((PairValue::Ident(s.clone()), i + 1)),
            Tok::Num(a) => {
                let j = self.ows(i + 1);
                if self.at(j) == Some(&Tok::Delim('/')) {
                    let k = self.ows(j + 1);
                    if let Some(Tok::Num(b)) = self.at(k) {
                        return Some((PairValue::Ratio(*a, *b), k + 1));
                    }
                }
                Some((PairValue::Num(*a), i + 1))
            }
            _ => None,
        }
    }
    fn pair(&self, i: usize) -> R {
        if self.at(i) != Some(&Tok::Open) {
            return None;
        }
        let j = self.ows(i + 1);
        let (k, j) = self.ident(j)?;
        let j = self.ows(j);
        if self.at(j) != Some(&Tok::Colon) {
            return None;
        }
        let j = self.ows(j + 1);
        let (v, j) = self.rule_value(j)?;
        let j = self.ows(j);
        if self.at(j) != Some(&Tok::Close) {
            return None;
        }
        Some((Q::Pair { key: k, value: v }, j + 1))
    }
    fn op(&self, i: usize) -> Option<(char, bool, usize)> {
        let Some(Tok::Delim(c)) = self.at(i) else { return None };
        if *c != '<' && *c != '>' {
            return None;
        }
        let j = self.ows(i + 1);
        if self.at(j) == Some(&Tok::Delim('=')) {
            return Some((*c, true, j + 1));
        }
        Some((*c, false, i + 1))
    }
    fn adjust(v: f64, eq: bool, max: bool) -> f64 {
        if eq {
            v
        } else if max {
            v - 0.01
        } else {
            v + 0.01
        }
    }
    fn ineq(&self, i: usize) -> R {
        if self.at(i) != Some(&Tok::Open) {
            return None;
        }
        let j = self.ows(i + 1);
        // (width >= 600px)
        if let Some((k, n)) = self.ident(j) {
            if k == "width" || k == "height" {
                let n = self.ows(n);
                let (op, eq, n) = self.op(n)?;
                let n = self.ows(n);
                let Some(Tok::Dim(v, u)) = self.at(n) else { return None };
                let n = self.ows(n + 1);
                if self.at(n) != Some(&Tok::Close) {
                    return None;
                }
                let key = if op == '>' { format!("min-{k}") } else { format!("max-{k}") };
                let max = key.starts_with("max-");
                return Some((Q::Pair { key, value: PairValue::Len { value: Self::adjust(*v, eq, max), unit: u.clone() } }, n + 1));
            }
            return None;
        }
        // (600px <= width)
        let Some(Tok::Dim(v, u)) = self.at(j) else { return None };
        let n = self.ows(j + 1);
        let (op, eq, n) = self.op(n)?;
        let n = self.ows(n);
        let (k, n) = self.ident(n)?;
        if k != "width" && k != "height" {
            return None;
        }
        let n = self.ows(n);
        if self.at(n) != Some(&Tok::Close) {
            return None;
        }
        let key = if op == '>' { format!("max-{k}") } else { format!("min-{k}") };
        let max = key.starts_with("max-");
        Some((Q::Pair { key, value: PairValue::Len { value: Self::adjust(*v, eq, max), unit: u.clone() } }, n + 1))
    }
    fn double_ineq(&self, i: usize) -> R {
        if self.at(i) != Some(&Tok::Open) {
            return None;
        }
        let j = self.ows(i + 1);
        let Some(Tok::Dim(lv, lu)) = self.at(j) else { return None };
        let n = self.ows(j + 1);
        let (op, eq, n) = self.op(n)?;
        let n = self.ows(n);
        let (k, n) = self.ident(n)?;
        if k != "width" && k != "height" {
            return None;
        }
        let n = self.ows(n);
        let (op2, eq2, n) = self.op(n)?;
        let n = self.ows(n);
        let Some(Tok::Dim(uv, uu)) = self.at(n) else { return None };
        let n = self.ows(n + 1);
        if self.at(n) != Some(&Tok::Close) {
            return None;
        }
        let lk = if op == '>' { format!("max-{k}") } else { format!("min-{k}") };
        let uk = if op2 == '>' { format!("min-{k}") } else { format!("max-{k}") };
        let lmax = lk.starts_with("max-");
        let umax = uk.starts_with("max-");
        Some((
            Q::And(vec![
                Q::Pair { key: lk, value: PairValue::Len { value: Self::adjust(*lv, eq, lmax), unit: lu.clone() } },
                Q::Pair { key: uk, value: PairValue::Len { value: Self::adjust(*uv, eq2, umax), unit: uu.clone() } },
            ]),
            n + 1,
        ))
    }
    fn not_rule(&self, i: usize) -> R {
        if self.at(i) != Some(&Tok::Open) {
            return None;
        }
        let (w, n) = self.ident(i + 1)?;
        if w != "not" || self.at(n) != Some(&Tok::Ws) {
            return None;
        }
        let (r, n) = self.normal_inner(n + 1)?;
        if self.at(n) != Some(&Tok::Close) {
            return None;
        }
        Some((Q::Not(Box::new(r)), n + 1))
    }
    /// `getNormalRuleParser()` (inside `(not ...)`), with trailing space.
    fn normal_inner(&self, i: usize) -> R {
        let r = (|| {
            if self.at(i) == Some(&Tok::Open) {
                if let Some((k, n)) = self.ident(i + 1) {
                    if (k == "screen" || k == "print" || k == "all") && self.at(n) == Some(&Tok::Close) {
                        return Some((Q::Keyword { key: k, not: false, only: false }, n + 1));
                    }
                }
            }
            self.and_rules(i)
                .or_else(|| self.or_rules(i))
                .or_else(|| self.pair(i))
                .or_else(|| self.word_rule(i))
                .or_else(|| self.not_rule(i))
                .or_else(|| self.paren(i, true))
                .or_else(|| self.paren(i, false))
        })()?;
        Some((r.0, self.ows(r.1)))
    }
    fn paren(&self, i: usize, or: bool) -> R {
        if self.at(i) != Some(&Tok::Open) {
            return None;
        }
        let (r, n) = if or { self.or_rules(i + 1)? } else { self.and_rules(i + 1)? };
        if self.at(n) != Some(&Tok::Close) {
            return None;
        }
        Some((r, n + 1))
    }
    fn part(&self, i: usize) -> R {
        self.keyword(i)
            .or_else(|| self.paren(i, true))
            .or_else(|| self.paren(i, false))
            .or_else(|| self.not_rule(i))
            .or_else(|| self.double_ineq(i))
            .or_else(|| self.ineq(i))
            .or_else(|| self.pair(i))
            .or_else(|| self.word_rule(i))
    }
    fn joined(&self, i: usize, word: &str) -> Option<(Vec<Q>, usize)> {
        let (first, mut n) = self.part(i)?;
        let mut parts = vec![first];
        loop {
            if self.at(n) != Some(&Tok::Ws) {
                break;
            }
            let Some((w, m)) = self.ident(n + 1) else { break };
            if w != word || self.at(m) != Some(&Tok::Ws) {
                break;
            }
            let Some((p, m2)) = self.part(m + 1) else { break };
            parts.push(p);
            n = m2;
        }
        Some((parts, n))
    }
    fn and_rules(&self, i: usize) -> R {
        let (parts, n) = self.joined(i, "and")?;
        if parts.len() < 2 {
            return None;
        }
        Some((Q::And(parts), n))
    }
    fn or_rules(&self, i: usize) -> R {
        let (parts, n) = self.joined(i, "or")?;
        if parts.len() < 2 {
            return None;
        }
        Some((Q::Or(parts), n))
    }
    fn normal(&self, i: usize) -> R {
        self.and_rules(i)
            .or_else(|| self.or_rules(i))
            .or_else(|| self.keyword(i))
            .or_else(|| self.not_rule(i))
            .or_else(|| self.double_ineq(i))
            .or_else(|| self.ineq(i))
            .or_else(|| self.pair(i))
            .or_else(|| self.word_rule(i))
            .or_else(|| self.paren(i, true))
            .or_else(|| self.paren(i, false))
    }
    fn leading_not(&self, i: usize) -> R {
        let (w, n) = self.ident(i)?;
        if w != "not" || self.at(n) != Some(&Tok::Ws) {
            return None;
        }
        let j = n + 1;
        let (r, m) = self
            .paren(j, true)
            .or_else(|| self.paren(j, false))
            .or_else(|| self.not_rule(j))
            .or_else(|| self.ineq(j))
            .or_else(|| self.pair(j))
            .or_else(|| self.word_rule(j))?;
        Some((Q::Not(Box::new(r)), m))
    }
}

/// Parse an `@media ...` key.
pub fn parse(key: &str) -> Option<Q> {
    let t = tokenize(key)?;
    let p = P { t };
    let Some(Tok::At(a)) = p.at(0) else { return None };
    if a != "media" || p.at(1) != Some(&Tok::Ws) {
        return None;
    }
    let mut sets = vec![];
    let mut i = 2;
    loop {
        let (q, n) = p.leading_not(i).or_else(|| p.normal(i))?;
        sets.push(q);
        let m = p.ows(n);
        if p.at(m) == Some(&Tok::Comma) {
            i = p.ows(m + 1);
            continue;
        }
        if m != p.t.len() {
            return None;
        }
        break;
    }
    let rule = if sets.len() > 1 { Q::Or(sets) } else { sets.pop().unwrap() };
    Some(normalize(rule))
}

fn len_pair(r: &Q) -> Option<(&str, f64, &str, bool)> {
    match r {
        Q::Pair { key, value: PairValue::Len { value, unit } } if ["min-width", "max-width", "min-height", "max-height"].contains(&key.as_str()) => Some((key, *value, unit, false)),
        Q::Not(inner) => match &**inner {
            Q::Pair { key, value: PairValue::Len { value, unit } } if ["min-width", "max-width", "min-height", "max-height"].contains(&key.as_str()) => Some((key, *value, unit, true)),
            _ => None,
        },
        _ => None,
    }
}

fn merge_intervals(rules: Vec<Q>) -> Vec<Q> {
    for (idx, r) in rules.iter().enumerate() {
        if let Q::Not(inner) = r {
            if let Q::And(inner_rules) = &**inner {
                if inner_rules.len() == 2 {
                    let others: Vec<Q> = rules.iter().enumerate().filter(|(i, _)| *i != idx).map(|(_, r)| r.clone()).collect();
                    let mut l = others.clone();
                    l.push(Q::Not(Box::new(inner_rules[0].clone())));
                    let mut rr = others;
                    rr.push(Q::Not(Box::new(inner_rules[1].clone())));
                    let branches: Vec<Q> = [merge_intervals(l), merge_intervals(rr)]
                        .into_iter()
                        .filter(|b| !b.is_empty())
                        .map(|b| if b.len() == 1 { b.into_iter().next().unwrap() } else { Q::And(b) })
                        .collect();
                    return vec![Q::Or(branches)];
                }
            }
        }
    }
    let mut intervals: Vec<(String, Vec<(f64, f64)>, Option<String>)> = vec![("width".into(), vec![], None), ("height".into(), vec![], None)];
    let mut conflict = false;
    for r in &rules {
        let Some((key, value, unit, negated)) = len_pair(r) else { return rules };
        let dim = if key.ends_with("width") { 0 } else { 1 };
        let slot = &mut intervals[dim];
        if slot.1.is_empty() {
            slot.2 = Some(unit.to_string());
        } else if slot.2.as_deref() != Some(unit) {
            conflict = true;
        }
        let is_min = key.starts_with("min-");
        slot.1.push(match (is_min, negated) {
            (true, false) => (value, f64::INFINITY),
            (false, false) => (f64::NEG_INFINITY, value),
            (true, true) => (f64::NEG_INFINITY, value - 0.01),
            (false, true) => (value + 0.01, f64::INFINITY),
        });
    }
    if conflict {
        return rules;
    }
    let mut result = vec![];
    for (dim, ivs, unit) in &intervals {
        if ivs.is_empty() {
            continue;
        }
        let mut lower = f64::NEG_INFINITY;
        let mut upper = f64::INFINITY;
        for (l, u) in ivs {
            if *l > lower {
                lower = *l;
            }
            if *u < upper {
                upper = *u;
            }
        }
        if lower > upper {
            return vec![];
        }
        let u = unit.clone().unwrap_or_default();
        if lower != f64::NEG_INFINITY {
            result.push(Q::Pair { key: format!("min-{dim}"), value: PairValue::Len { value: lower, unit: u.clone() } });
        }
        if upper != f64::INFINITY {
            result.push(Q::Pair { key: format!("max-{dim}"), value: PairValue::Len { value: upper, unit: u } });
        }
    }
    if result.is_empty() { rules } else { result }
}

pub fn normalize(rule: Q) -> Q {
    match rule {
        Q::And(rules) => {
            let mut flat = vec![];
            for r in rules {
                match normalize(r) {
                    Q::And(inner) => flat.extend(inner),
                    o => flat.push(o),
                }
            }
            let merged = merge_intervals(flat);
            if merged.is_empty() {
                return Q::Keyword { key: "all".into(), not: true, only: false };
            }
            Q::And(merged)
        }
        Q::Or(rules) => Q::Or(rules.into_iter().map(normalize).collect()),
        Q::Not(r) => {
            let n = normalize(*r);
            match n {
                Q::Keyword { ref key, not: true, .. } if key == "all" => Q::Keyword { key: "all".into(), not: false, only: false },
                Q::Not(inner) => normalize(*inner),
                o => Q::Not(Box::new(o)),
            }
        }
        o => o,
    }
}

fn num(n: f64) -> String {
    crate::json::js_number_to_string(n)
}

fn to_str(q: &Q, top: bool) -> String {
    match q {
        Q::Keyword { key, not, only } => {
            let prefix = if *not { "not " } else if *only { "only " } else { "" };
            format!("{prefix}{}", if top || *only || *not { key.clone() } else { format!("({key})") })
        }
        Q::Word(k) => format!("({k})"),
        Q::Pair { key, value } => match value {
            PairValue::Ratio(a, b) => format!("({key}: {} / {})", num(*a), num(*b)),
            PairValue::Ident(s) => format!("({key}: {s})"),
            PairValue::Len { value, unit } => format!("({key}: {}{unit})", num(*value)),
            PairValue::Num(n) => format!("({key}: {})", num(*n)),
        },
        Q::Not(r) => match &**r {
            Q::And(_) | Q::Or(_) | Q::Not(_) => format!("(not ({}))", to_str(r, false)),
            o => format!("(not {})", to_str(o, false)),
        },
        Q::And(rules) => rules.iter().map(|r| to_str(r, false)).collect::<Vec<_>>().join(" and "),
        Q::Or(rules) => {
            let valid: Vec<&Q> = rules.iter().filter(|r| !matches!(r, Q::Or(v) if v.is_empty())).collect();
            if valid.is_empty() {
                return "not all".into();
            }
            if valid.len() == 1 {
                return to_str(valid[0], top);
            }
            let parts: Vec<String> = valid
                .iter()
                .map(|r| match r {
                    Q::And(_) | Q::Or(_) => {
                        let s = to_str(r, false);
                        if top { s } else { format!("({s})") }
                    }
                    o => to_str(o, false),
                })
                .collect();
            parts.join(if top { ", " } else { " or " })
        }
    }
}

pub fn to_string(q: &Q) -> String {
    format!("@media {}", to_str(q, true))
}

/// `combineMediaQueryWithNegations(current, negations)`.
pub fn combine_with_negations(current: Q, negations: &[Q]) -> Q {
    if negations.is_empty() {
        return current;
    }
    let nots: Vec<Q> = negations.iter().map(|n| Q::Not(Box::new(n.clone()))).collect();
    let combined = match current {
        Q::Or(rules) => Q::Or(
            rules
                .into_iter()
                .map(|r| {
                    let mut v = vec![r];
                    v.extend(nots.clone());
                    Q::And(v)
                })
                .collect(),
        ),
        c => {
            let mut v = vec![c];
            v.extend(nots);
            Q::And(v)
        }
    };
    normalize(combined)
}
