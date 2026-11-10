//! Port of `foundation/discovery/doc-fluff.mjs`: filler phrases and low
//! content density in a package's doc topics. Offsets are UTF-16 indexes.

use super::copied_passages::{self as cp, file_words, line_at_offset, locate_words, prose_strings, text_words};
use super::docs_discovery::{builtin_guide_files, IntegrationDocs};
use super::file_protection::js_replace;
use super::nodepath as np;
use crate::json::Value;
use std::sync::OnceLock;

/// `FILLER_PHRASES`.
pub const FILLER_PHRASES: [&str; 23] = [
    "it's important to note",
    "it is important to note",
    "important to note that",
    "it's worth noting",
    "it is worth noting",
    "worth noting that",
    "it should be noted",
    "please note",
    "note that",
    "as mentioned above",
    "as mentioned earlier",
    "as mentioned before",
    "as noted above",
    "as you can see",
    "needless to say",
    "in order to",
    "due to the fact that",
    "for the purpose of",
    "at this point in time",
    "in other words",
    "basically",
    "essentially",
    "obviously",
];

fn instead(p: &str) -> Option<&'static str> {
    match p {
        "in order to" => Some("to"),
        "due to the fact that" => Some("because"),
        "for the purpose of" => Some("to or for"),
        "at this point in time" => Some("now"),
        _ => None,
    }
}

pub const DENSITY_MIN_WORDS: usize = 80;
pub const MIN_DENSITY: f64 = 0.5;

fn escape(p: &str) -> String {
    super::doc_consistency::escape_re(p)
}

fn phrase_source(p: &str) -> String {
    if p == "note that" {
        format!(r"(?:^|[.;:!?]\s+){}\b", escape(p))
    } else {
        format!(r"(?<![a-z'-]){}(?![a-z-])", escape(p))
    }
}

fn blank(span: &str) -> String {
    " ".repeat(span.encode_utf16().count())
}

/// `maskProse(text)`: same UTF-16 length.
pub fn mask_prose(text: &str) -> String {
    let r = |s: &str, re: &str, f: &dyn Fn(&str) -> String| js_replace(s, re, "", true, &|g, _, _| f(g[0].as_deref().unwrap_or("")));
    let t = r(text, r"\{@link\s[^}]*\}", &blank);
    let t = r(&t, r"`[^`]*`", &blank);
    let t = r(&t, "\"[^\"]*\"|\u{201c}[^\u{201d}]*\u{201d}|\u{2018}[^\u{2019}]*\u{2019}", &blank);
    let t = t.replace('\u{2019}', "'");
    r(&t, r"(?<![A-Za-z])'[^']*'(?![A-Za-z])", &blank)
}

/// One filler occurrence (`fillerAt` entry).
#[derive(Debug, Clone, PartialEq)]
pub struct Filler {
    pub phrase: &'static str,
    pub at: usize,
    pub that_after: bool,
}

fn utf16_index(s: &str, byte: usize) -> usize {
    s[..byte].encode_utf16().count()
}

/// `fillerAt(text)`.
pub fn filler_at(text: &str) -> Vec<Filler> {
    let prose = mask_prose(text);
    let prose_u16: Vec<u16> = prose.encode_utf16().collect();
    let mut found: Vec<Filler> = Vec::new();
    for phrase in FILLER_PHRASES {
        let re = regress::Regex::with_flags(&phrase_source(phrase), "gi").unwrap();
        for m in re.find_iter(&prose) {
            let matched = prose[m.range()].to_lowercase();
            let inner = matched.find(phrase).map(|b| matched[..b].encode_utf16().count()).unwrap_or(0);
            let at = utf16_index(&prose, m.start()) + inner;
            let plen = phrase.encode_utf16().count();
            if found.iter().any(|f| at >= f.at && at < f.at + f.phrase.encode_utf16().count()) {
                continue;
            }
            let after = String::from_utf16_lossy(&prose_u16[(at + plen).min(prose_u16.len())..]);
            let that_after = regress::Regex::new(r"\bnot(?:e|ed|ing)$").unwrap().find(phrase).is_some()
                && !phrase.ends_with("that")
                && regress::Regex::with_flags(r"^\s+that\b", "i").unwrap().find(&after).is_some();
            found.push(Filler { phrase, at, that_after });
        }
    }
    found.sort_by_key(|f| f.at);
    found
}

/// `fillerIn(text)`.
pub fn filler_in(text: &str) -> Vec<&'static str> {
    filler_at(text).into_iter().map(|f| f.phrase).collect()
}

/// `density(words)`.
pub fn density(words: &[String]) -> f64 {
    if words.is_empty() {
        return 1.0;
    }
    let content = words.iter().filter(|w| cp::content_words_of(&[w.as_str()]) == 1).count();
    content as f64 / words.len() as f64
}

/// `floorTo(value, places)`.
pub fn floor_to(v: f64, places: i32) -> f64 {
    let scale = 10f64.powi(places);
    (v * scale + 1e-9).floor() / scale
}

/// `sharePercent(share)`.
pub fn share_percent(share: f64) -> String {
    format!("{:.1}%", floor_to(share * 100.0, 1))
}

/// `densityWords(doc)` (the words alone).
pub fn density_words(doc: &Value) -> Vec<String> {
    prose_strings(doc).iter().flat_map(|p| cp::passage_words(&mask_prose(&p.text))).collect()
}

/// `coreDensityMedian()`.
pub fn core_density_median() -> f64 {
    static M: OnceLock<f64> = OnceLock::new();
    *M.get_or_init(|| {
        let mut scores: Vec<f64> = Vec::new();
        for f in builtin_guide_files() {
            let Some(doc) = cp::load_quietly(&f) else { continue };
            if !doc.get("name").map(|n| n.is_string()).unwrap_or(false) {
                continue;
            }
            let w = density_words(&doc);
            if w.len() >= DENSITY_MIN_WORDS {
                scores.push(density(&w));
            }
        }
        scores.sort_by(|a, b| a.partial_cmp(b).unwrap());
        if scores.is_empty() {
            0.0
        } else {
            scores[scores.len() / 2]
        }
    })
}

/// One fluff finding.
#[derive(Debug, Clone, PartialEq)]
pub struct Fluff {
    pub topic: String,
    /// `phrase` | `density`.
    pub kind: &'static str,
    pub phrase: Option<&'static str>,
    pub section: Option<String>,
    pub file: String,
    pub line: Option<usize>,
    pub density: Option<f64>,
    pub message: String,
}

impl Fluff {
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "topic": self.topic, "kind": self.kind, "phrase": self.phrase, "section": self.section,
            "file": self.file, "line": self.line, "density": self.density.map(crate::json::num), "message": self.message,
        })
    }
}

fn js_round(v: f64) -> f64 {
    (v + 0.5).floor()
}

/// `findFluff(discovered)`.
pub fn find_fluff(discovered: &IntegrationDocs) -> Vec<Fluff> {
    let mut topics: Vec<(String, Option<String>)> = discovered.records.iter().map(|r| (r.name.clone(), Some(r.path.clone()))).collect();
    for g in &discovered.guides {
        topics.push((super::paths::js_string(g.get("name")), g.get("ref").and_then(|r| r.get("topicFile")).and_then(|f| f.as_str()).map(String::from)));
    }
    let mut found = Vec::new();
    for (name, file) in topics {
        let Some(file) = file else { continue };
        let Some(doc) = cp::load_quietly(&file) else { continue };
        let source = np::read_text(&file).map(|t| file_words(&t)).unwrap_or_default();
        let mut cursor = 0usize;
        for ps in prose_strings(&doc) {
            let words = text_words(&ps.text);
            let mut index = locate_words(&source, &words, cursor);
            if index < 0 {
                index = locate_words(&source, &words, 0);
            }
            if index >= 0 {
                cursor = index as usize + words.len();
            }
            for f in filler_at(&ps.text) {
                let line = if index < 0 { None } else { line_at_offset(&source, index as usize, &words, f.at) };
                let where_ = match &ps.section {
                    Some(s) if !s.is_empty() => format!(" (section \"{s}\")"),
                    _ => String::new(),
                };
                let at_line = line.map(|l| format!(" (line {l})")).unwrap_or_default();
                let advice = match instead(f.phrase) {
                    Some(i) => format!("Write \"{i}\" instead."),
                    None if f.that_after => "Cut it and the \"that\" after it; the sentence says the same without them.".into(),
                    None => "Cut it; the sentence says the same without it.".into(),
                };
                found.push(Fluff {
                    topic: name.clone(),
                    kind: "phrase",
                    phrase: Some(f.phrase),
                    section: ps.section.clone(),
                    file: file.clone(),
                    line,
                    density: None,
                    message: format!("\"{name}\"{where_} pads its prose with \"{}\"{at_line}. {advice}", f.phrase),
                });
            }
        }
        let words = density_words(&doc);
        if words.len() < DENSITY_MIN_WORDS {
            continue;
        }
        let score = density(&words);
        if score >= MIN_DENSITY {
            continue;
        }
        let median = core_density_median();
        found.push(Fluff {
            topic: name.clone(),
            kind: "density",
            phrase: None,
            section: None,
            file: file.clone(),
            line: None,
            density: Some(floor_to(score, 3)),
            message: format!(
                "\"{name}\" is mostly glue: {} of its {} prose words carry content, under the {}% floor (Core's guides have a median of {}%). Cut filler and restated context until each sentence states one thing.",
                share_percent(score),
                words.len(),
                js_round(MIN_DENSITY * 100.0),
                crate::json::js_number_to_string(js_round(median * 100.0))
            ),
        });
    }
    found
}
