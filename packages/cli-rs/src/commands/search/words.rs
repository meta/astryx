//! Word handling for search: `_words.mjs`, `_query.mjs`, `_synonyms.mjs`,
//! and the word helpers of `_query-words.mjs`. Regular expressions are written
//! out by hand with JS semantics (ASCII classes, UTF-16 lengths).

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

/// `String#length`: UTF-16 code units.
pub fn jlen(s: &str) -> usize {
    if s.is_ascii() {
        s.len()
    } else {
        s.encode_utf16().count()
    }
}

/// JS `\s`.
pub fn js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
            | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

/// `String#trim`.
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(js_space)
}

/// `s.split(/\s+/)`.
pub fn split_ws(s: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    let mut in_ws = false;
    let mut ws_start = 0;
    for (i, c) in s.char_indices() {
        if js_space(c) {
            if !in_ws {
                in_ws = true;
                ws_start = i;
            }
        } else if in_ws {
            out.push(&s[start..ws_start]);
            start = i;
            in_ws = false;
        }
    }
    if in_ws {
        out.push(&s[start..ws_start]);
        out.push("");
    } else {
        out.push(&s[start..]);
    }
    out
}

/// `s.replace(/\s+/g, '')`.
pub fn strip_ws(s: &str) -> String {
    s.chars().filter(|c| !js_space(*c)).collect()
}

pub fn has_ws(s: &str) -> bool {
    s.chars().any(js_space)
}

/// `/[\s_-]/.test(s)`.
pub fn has_ws_us_dash(s: &str) -> bool {
    s.chars().any(|c| js_space(c) || c == '_' || c == '-')
}

/// `String#toLowerCase`.
pub fn lower(s: &str) -> String {
    if s.is_ascii() {
        s.to_ascii_lowercase()
    } else {
        s.to_lowercase()
    }
}

fn is_alnum_lower(c: u8) -> bool {
    c.is_ascii_lowercase() || c.is_ascii_digit()
}

/// `text.match(/[a-z0-9]+/g) ?? []` on text as given.
pub fn alnum_runs(text: &str) -> Vec<String> {
    let b = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if is_alnum_lower(b[i]) {
            let s = i;
            while i < b.len() && is_alnum_lower(b[i]) {
                i += 1;
            }
            out.push(text[s..i].to_string());
        } else {
            i += 1;
        }
    }
    out
}

/// `s.replace(/([a-z0-9])([A-Z])/g, '$1 $2')`.
pub fn split_lower_upper(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len() + 8);
    let mut i = 0;
    while i < c.len() {
        if i + 1 < c.len()
            && (c[i].is_ascii_lowercase() || c[i].is_ascii_digit())
            && c[i + 1].is_ascii_uppercase()
        {
            out.push(c[i]);
            out.push(' ');
            out.push(c[i + 1]);
            i += 2;
        } else {
            out.push(c[i]);
            i += 1;
        }
    }
    out
}

/// `s.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')`.
pub fn split_upper_upper_lower(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len() + 8);
    let mut i = 0;
    while i < c.len() {
        if i + 2 < c.len()
            && c[i].is_ascii_uppercase()
            && c[i + 1].is_ascii_uppercase()
            && c[i + 2].is_ascii_lowercase()
        {
            out.push(c[i]);
            out.push(' ');
            out.push(c[i + 1]);
            out.push(c[i + 2]);
            i += 3;
        } else {
            out.push(c[i]);
            i += 1;
        }
    }
    out
}

/// `s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')`.
fn split_upper_run_lower(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len() + 8);
    let mut i = 0;
    while i < c.len() {
        if c[i].is_ascii_uppercase() {
            let mut j = i;
            while j < c.len() && c[j].is_ascii_uppercase() {
                j += 1;
            }
            if j - i >= 2 && j < c.len() && c[j].is_ascii_lowercase() {
                for &ch in &c[i..j - 1] {
                    out.push(ch);
                }
                out.push(' ');
                out.push(c[j - 1]);
                out.push(c[j]);
                i = j + 1;
            } else {
                for &ch in &c[i..j] {
                    out.push(ch);
                }
                i = j;
            }
        } else {
            out.push(c[i]);
            i += 1;
        }
    }
    out
}

// ── _words.mjs ──────────────────────────────────────────────────────

/// `stem(w)`.
pub fn stem(w: &str) -> String {
    for suf in ["ing", "ed", "ies", "es", "s"] {
        if jlen(w) > suf.len() + 2 && w.ends_with(suf) {
            let base = &w[..w.len() - suf.len()];
            return if suf == "ies" { format!("{base}y") } else { base.to_string() };
        }
    }
    w.to_string()
}

fn doubled_consonant(base: &str) -> bool {
    let b = base.as_bytes();
    if b.len() < 2 {
        return false;
    }
    let (x, y) = (b[b.len() - 2], b[b.len() - 1]);
    x == y && x.is_ascii_lowercase() && !matches!(x, b'a' | b'e' | b'i' | b'o' | b'u')
}

/// `someForm`'s forms of a word, in visit order (duplicates possible).
pub fn forms_list(w: &str) -> Vec<String> {
    let mut out = vec![w.to_string(), stem(w)];
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
    if n >= 6 && w.ends_with("ing") {
        let base = &w[..w.len() - 3];
        out.push(base.to_string());
        out.push(format!("{base}e"));
        if doubled_consonant(base) {
            out.push(base[..base.len() - 1].to_string());
        }
    }
    out
}

/// `wordForms(w)`.
pub fn word_forms(w: &str) -> HashSet<String> {
    forms_list(w).into_iter().collect()
}

/// `sameWord(a, b)`.
pub fn same_word(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    let forms = word_forms(a);
    forms_list(b).iter().any(|f| forms.contains(f))
}

/// `wordsOf(text)`.
pub fn words_of(text: &str) -> Vec<String> {
    let s = lower(&split_upper_upper_lower(&split_lower_upper(text)));
    alnum_runs(&s)
}

/// `spellIdentifiers(query)`.
pub fn spell_identifiers(q: &str) -> String {
    lower(&split_upper_upper_lower(&split_lower_upper(q)))
}

/// `joined(text)`.
pub fn joined(text: &str) -> String {
    let l = lower(text);
    l.chars().filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit()).collect()
}

/// `typoDistance(a, b)`.
pub fn typo_distance(a: &str, b: &str, a_len: usize, b_len: usize) -> Option<usize> {
    let shorter = a_len.min(b_len);
    let cap = if shorter >= 11 {
        3
    } else if shorter >= 8 {
        2
    } else if shorter >= 5 {
        1
    } else {
        0
    };
    if cap == 0 {
        return None;
    }
    let d = crate::text::levenshtein_within(a, b, cap, false);
    if d >= 1 && d <= cap {
        Some(d)
    } else {
        None
    }
}

// ── _query.mjs ──────────────────────────────────────────────────────

pub const SEARCH_DOMAINS: [&str; 5] = ["component", "hook", "doc", "template", "theme"];
pub const CORELESS_DOMAINS: [&str; 2] = ["doc", "theme"];

/// `STOPWORDS`, in declaration order.
pub const STOPWORDS_LIST: &[&str] = &[
    "a", "an", "the", "of", "for", "to", "with", "and", "or", "in", "on", "at", "by", "that", "this", "my", "your",
    "our", "their", "is", "are", "be", "it", "its", "as", "from", "page", "screen", "app", "application", "view",
    "where", "you", "can", "some", "like", "just", "basically", "kinda", "want", "wants", "need", "needs",
    "something", "thing", "things", "build", "make", "create", "i", "me", "we", "us", "so", "up", "out", "over",
    "side", "one", "big",
];

pub fn is_stopword(w: &str) -> bool {
    static SET: OnceLock<HashSet<&'static str>> = OnceLock::new();
    SET.get_or_init(|| STOPWORDS_LIST.iter().copied().collect()).contains(w)
}

/// `tokenizeQuery(term)`.
pub fn tokenize_query(term: &str) -> Vec<String> {
    split_ws(term)
        .into_iter()
        .map(|t| t.trim_matches(|c: char| !(c.is_ascii_lowercase() || c.is_ascii_digit())).to_string())
        .filter(|t| jlen(t) >= 2 && !is_stopword(t))
        .collect()
}

/// `unlinkText(text)` for search's word reading: inline `{@link …}` targets
/// outside code spans become their names. Doc command tokens (`{@command}`,
/// `{@pm}`) stay as written. TEMP: replace with the discovery lane's doc
/// compiler `unlink_text` when it lands.
pub fn unlink_text(text: &str) -> String {
    if !text.contains("{@link") {
        return text.to_string();
    }
    // Split on code spans: (`[^`]*`)
    let mut out = String::new();
    let mut rest = text;
    loop {
        match rest.find('`') {
            Some(a) => match rest[a + 1..].find('`') {
                Some(b) => {
                    out.push_str(&unlink_part(&rest[..a]));
                    out.push_str(&rest[a..a + 1 + b + 1]);
                    rest = &rest[a + 1 + b + 1..];
                }
                None => {
                    out.push_str(&unlink_part(rest));
                    break;
                }
            },
            None => {
                out.push_str(&unlink_part(rest));
                break;
            }
        }
    }
    out
}

const LINK_KINDS: [&str; 9] =
    ["generic", "command", "function", "schema", "enum", "namespace", "component", "page", "block"];

fn link_name(target: &str) -> Option<String> {
    let t = js_trim(target);
    if t.is_empty() {
        return None;
    }
    let parts: Vec<&str> = t.split(':').collect();
    if parts.len() < 2 || parts.len() > 3 || parts.iter().any(|p| js_trim(p).is_empty()) {
        return None;
    }
    let kind = js_trim(parts[parts.len() - 2]);
    if !LINK_KINDS.contains(&kind) {
        return None;
    }
    Some(js_trim(parts[parts.len() - 1]).to_string())
}

/// `part.replace(/\{@link\s+([^{}]+?)\s*\}/g, …)`.
fn unlink_part(part: &str) -> String {
    let mut out = String::new();
    let mut i = 0;
    let b = part.as_bytes();
    while i < b.len() {
        if part[i..].starts_with("{@link") {
            let after = i + 6;
            // \s+ then lazy [^{}]+? then \s* then }
            let rest = &part[after..];
            let ws: usize = rest.chars().take_while(|c| js_space(*c)).map(|c| c.len_utf8()).sum();
            if ws > 0 {
                let body_start = after + ws;
                if let Some(close) = part[body_start..].find(['{', '}']) {
                    if part.as_bytes()[body_start + close] == b'}' && close > 0 {
                        let inner = &part[body_start..body_start + close];
                        let target = inner.trim_end_matches(js_space);
                        if !target.is_empty() {
                            out.push_str(&link_name(target).unwrap_or_else(|| target.to_string()));
                            i = body_start + close + 1;
                            continue;
                        }
                    }
                }
            }
        }
        let ch = part[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// `phraseWords(text)`.
pub fn phrase_words(text: &str) -> Vec<String> {
    alnum_runs(&lower(&unlink_text(text)))
}

/// `samePhraseWord(a, b)`.
pub fn same_phrase_word(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    let (la, lb) = (a.len(), b.len());
    (lb == la + 1 && b.starts_with(a) && b.ends_with('s'))
        || (la == lb + 1 && a.starts_with(b) && a.ends_with('s'))
        || (lb == la + 2 && b.starts_with(a) && b.ends_with("es"))
        || (la == lb + 2 && a.starts_with(b) && a.ends_with("es"))
}

/// `samePhrase(a, b)`.
pub fn same_phrase(a: &str, b: &str) -> bool {
    let x = phrase_words(a);
    let y = phrase_words(b);
    same_phrase_words(&x, &y)
}

pub fn same_phrase_words(x: &[String], y: &[String]) -> bool {
    !x.is_empty() && x.len() == y.len() && x.iter().zip(y).all(|(w, v)| same_phrase_word(w, v) || same_word(w, v))
}

/// `/(?:s|x|z|ch|sh)$/.test(w)`.
pub fn es_ending(w: &str) -> bool {
    w.ends_with('s') || w.ends_with('x') || w.ends_with('z') || w.ends_with("ch") || w.ends_with("sh")
}

/// `pluralOf(plural, word)`.
pub fn plural_of(plural: &str, word: &str) -> bool {
    if jlen(word) < 3 {
        return false;
    }
    if plural.len() == word.len() + 1 && plural.starts_with(word) && plural.ends_with('s') {
        return true;
    }
    es_ending(word) && plural.len() == word.len() + 2 && plural.starts_with(word) && plural.ends_with("es")
}

// ── _synonyms.mjs ───────────────────────────────────────────────────

/// `SYNONYMS`, key order kept.
pub const SYNONYMS: &[(&str, &[&str])] = &[
    ("dashboard", &["overview", "analytics", "kpi", "kpis", "metrics", "stats", "reporting", "insights", "control"]),
    ("login", &["signin", "auth", "authentication", "sso", "credentials", "account"]),
    ("signup", &["register", "registration", "onboarding"]),
    ("payment", &["checkout", "billing", "card", "pay", "purchase", "order"]),
    ("pricing", &["plans", "plan", "tiers", "tier", "subscription", "subscriptions"]),
    ("chat", &["messaging", "message", "messages", "conversation", "inbox", "dm"]),
    ("settings", &["preferences", "config", "configuration", "account"]),
    ("calendar", &["schedule", "scheduling", "events", "event", "month", "agenda"]),
    ("table", &["list", "rows", "records", "grid", "spreadsheet", "datatable"]),
    ("gallery", &["photos", "photo", "images", "image", "pictures"]),
    ("hero", &["banner", "splash", "headline", "landing"]),
    ("form", &["fields", "input", "inputs", "survey"]),
    ("profile", &["bio", "avatar", "user"]),
    ("documentation", &["docs", "reference", "guide", "api"]),
    ("navigation", &["nav", "menu", "sidebar"]),
];

/// `SYNONYM_INDEX`: token -> expansions in Set insertion order.
pub fn synonym_index() -> &'static HashMap<String, Vec<String>> {
    static IDX: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();
    IDX.get_or_init(|| {
        let mut idx: HashMap<String, Vec<String>> = HashMap::new();
        let mut add = |a: &str, b: &str| {
            let set = idx.entry(a.to_string()).or_default();
            if !set.iter().any(|x| x == b) {
                set.push(b.to_string());
            }
        };
        for (key, vals) in SYNONYMS {
            for v in vals.iter() {
                add(key, v);
                add(v, key);
                for v2 in vals.iter() {
                    if v2 != v {
                        add(v, v2);
                    }
                }
            }
        }
        idx
    })
}

// ── _query-words.mjs ────────────────────────────────────────────────

const QW_STOP: &[&str] = &[
    "a", "an", "the", "of", "for", "to", "with", "and", "or", "in", "on", "by", "is", "it", "my", "me", "i", "we",
    "you", "this", "that", "be", "as", "at", "from", "use", "using", "how", "what", "which", "show", "make", "add",
    "create", "get", "set", "any", "can", "do", "does", "not", "no", "into", "via",
];

/// `words(text)` of `_query-words.mjs`.
pub fn qwords(text: &str) -> Vec<String> {
    alnum_runs(&lower(text))
}

/// `fold(w)`.
pub fn fold(w: &str) -> String {
    let n = w.len();
    if n > 4 && w.ends_with("ies") {
        return format!("{}y", &w[..n - 3]);
    }
    if n > 3 && w.ends_with("es") && matches!(w.as_bytes()[n - 3], b's' | b'x' | b'z') {
        return w[..n - 2].to_string();
    }
    if n > 3 && w.ends_with('s') && !w.ends_with("ss") {
        return w[..n - 1].to_string();
    }
    w.to_string()
}

/// `nameWords(name)`.
pub fn name_words(name: &str) -> Vec<String> {
    let s: String = name.chars().map(|c| if c == '/' || c == '-' { ' ' } else { c }).collect();
    let s = split_upper_run_lower(&split_lower_upper(&s));
    qwords(&s)
}

/// `queryWords(q)`.
pub fn query_words(q: &str) -> Vec<String> {
    qwords(q).into_iter().filter(|w| !QW_STOP.contains(&w.as_str())).map(|w| fold(&w)).collect()
}

/// `queryTokens(q)`.
pub fn query_tokens(q: &str) -> Vec<String> {
    let qw = query_words(q);
    let mut out: Vec<String> = Vec::new();
    let mut seen = HashSet::new();
    let pairs: Vec<String> = (1..qw.len()).map(|i| format!("{}_{}", qw[i - 1], qw[i])).collect();
    for w in qw.iter().chain(pairs.iter()) {
        if seen.insert(w.clone()) {
            out.push(w.clone());
        }
    }
    out
}

/// `routerTokens(q)`.
pub fn router_tokens(q: &str) -> Vec<String> {
    let ws = qwords(q);
    let mut flags = vec![format!("#n{}", ws.len().min(6))];
    const QUESTION: [&str; 8] = ["how", "what", "why", "when", "where", "can", "does", "is"];
    if !ws.is_empty() && QUESTION.contains(&ws[0].as_str()) {
        flags.push("#question".into());
    }
    let usehook = split_ws(q).iter().any(|w| {
        w.starts_with("use") && w.as_bytes().get(3).is_some_and(|c| c.is_ascii_lowercase())
    }) || {
        // /\buse[A-Z]/
        let b = q.as_bytes();
        (0..b.len()).any(|i| {
            b[i..].starts_with(b"use")
                && b.get(i + 3).is_some_and(|c| c.is_ascii_uppercase())
                && (i == 0 || !is_word_byte(b[i - 1]))
        })
    };
    if usehook {
        flags.push("#usehook".into());
    }
    if camel(q) {
        flags.push("#camel".into());
    }
    let mut out = query_tokens(q);
    out.extend(flags);
    out.push("#bias".into());
    out
}

/// `/[A-Z][a-z]+[A-Z]/.test(q)`.
fn camel(q: &str) -> bool {
    let b = q.as_bytes();
    for i in 0..b.len() {
        if b[i].is_ascii_uppercase() {
            let mut j = i + 1;
            while j < b.len() && b[j].is_ascii_lowercase() {
                j += 1;
            }
            if j > i + 1 && j < b.len() && b[j].is_ascii_uppercase() {
                return true;
            }
        }
    }
    false
}

/// JS `\w` for one byte (non-ASCII bytes are never word characters).
pub fn is_word_byte(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_like_js() {
        assert_eq!(split_ws("a  b"), vec!["a", "b"]);
        assert_eq!(split_ws(" a"), vec!["", "a"]);
        assert_eq!(split_ws("a "), vec!["a", ""]);
        assert_eq!(name_words("DateRangeInput"), vec!["date", "range", "input"]);
        assert_eq!(name_words("HTMLParser"), vec!["html", "parser"]);
        assert_eq!(words_of("Dashboard - Analytics"), vec!["dashboard", "analytics"]);
        assert_eq!(stem("charting"), "chart");
        assert_eq!(fold("boxes"), "box");
        assert!(same_word("tables", "table"));
        assert!(same_word("dragging", "drag"));
        assert_eq!(unlink_text("see {@link component:Button} now"), "see Button now");
    }
}
