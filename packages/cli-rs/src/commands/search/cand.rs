//! A search candidate, read once from its gathered JSON with the forms the
//! scorers need worked out ahead (lowercase names, name words, word forms).

use super::words::*;
use crate::json::Value;
use std::collections::HashSet;

/// JS `String(value)` for the values a candidate holds.
pub fn js_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => crate::json::js_number_to_string(n.as_f64().unwrap_or(0.0)),
        Value::Array(a) => a.iter().map(|x| if x.is_null() { String::new() } else { js_str(x) }).collect::<Vec<_>>().join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

fn opt_str(v: &Value, key: &str) -> Option<String> {
    match v.get(key) {
        None | Some(Value::Null) => None,
        Some(x) => Some(js_str(x)),
    }
}

fn str_list(v: &Value, key: &str) -> Option<Vec<String>> {
    match v.get(key) {
        Some(Value::Array(a)) => Some(a.iter().map(js_str).collect()),
        _ => None,
    }
}

/// A name or keyword with its derived forms.
#[derive(Debug, Clone)]
pub struct Word {
    pub orig: String,
    pub lower: String,
    pub u16: Vec<u16>,
    pub orig_len: usize,
    pub words: Vec<String>,
    pub words_forms: Vec<HashSet<String>>,
    pub lower_forms: Vec<String>,
}

impl Word {
    pub fn new(orig: &str) -> Word {
        let lower = lower(orig);
        let words = words_of(orig);
        Word {
            orig: orig.to_string(),
            u16: lower.encode_utf16().collect(),
            orig_len: jlen(orig),
            words_forms: words.iter().map(|w| word_forms(w)).collect(),
            lower_forms: forms_list(&lower),
            words,
            lower,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Candidate {
    pub domain: String,
    pub name: String,
    pub aliases: Vec<String>,
    pub keywords: Vec<String>,
    pub declared: Vec<String>,
    pub weak: Vec<String>,
    pub weak_bound: Option<Vec<String>>,
    pub description: String,
    pub prose: Vec<String>,
    pub guidance: Vec<String>,
    pub titles: Option<Vec<String>>,
    pub import: Option<String>,
    pub title: Option<String>,
    pub topic: Option<String>,
    pub section: Option<String>,
    pub command: Option<String>,
    pub parent: Option<String>,
    pub package: Option<String>,
    pub display_name: Option<Value>,
    pub family: Option<String>,
    pub family_index: Option<f64>,
    pub kind: Option<Value>,
    pub result_name: Option<String>,
    pub command_name: Option<String>,
    pub deprecated: Option<Value>,
    pub display_description: Option<String>,
    // Derived.
    /// `[name, ...aliases.filter(Boolean)]` with forms.
    pub names: Vec<Word>,
    pub kws: Vec<Word>,
    pub weak_words: Vec<Word>,
    pub bound_words: Option<Vec<Word>>,
    pub desc_lower: String,
    pub prose_lower: Vec<String>,
    pub guidance_lower: Vec<String>,
    pub desc_words: Vec<String>,
    /// Joined forms of `[name, ...aliases]`.
    pub joined_names: Vec<String>,
    /// One-word lowercase keywords (compound reads).
    pub compound_kws: Vec<String>,
    pub title_words: Option<Vec<Vec<String>>>,
}

impl Candidate {
    pub fn from_json(v: &Value) -> Candidate {
        let name = opt_str(v, "name").unwrap_or_default();
        let aliases = str_list(v, "aliases").unwrap_or_default();
        let keywords = str_list(v, "keywords").unwrap_or_default();
        let description = match v.get("description") {
            None | Some(Value::Null) => String::new(),
            Some(x) => js_str(x),
        };
        let prose = str_list(v, "prose").unwrap_or_default();
        let guidance = str_list(v, "guidance").unwrap_or_default();
        let weak = str_list(v, "weakKeywords").unwrap_or_default();
        let weak_bound = str_list(v, "weakKeywordBound");
        let titles = str_list(v, "titles");
        let names: Vec<Word> =
            std::iter::once(&name).chain(aliases.iter().filter(|a| !a.is_empty())).map(|n| Word::new(n)).collect();
        let joined_names = std::iter::once(&name).chain(aliases.iter()).map(|n| joined(n)).collect();
        let compound_kws = keywords
            .iter()
            .filter(|k| !k.is_empty() && k.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
            .cloned()
            .collect();
        Candidate {
            domain: opt_str(v, "domain").unwrap_or_default(),
            declared: str_list(v, "_declared").unwrap_or_default(),
            import: opt_str(v, "_import"),
            title: opt_str(v, "_title"),
            topic: opt_str(v, "_topic"),
            section: opt_str(v, "_section"),
            command: opt_str(v, "_command"),
            parent: opt_str(v, "_parent"),
            package: opt_str(v, "_package"),
            display_name: v.get("_displayName").cloned(),
            family: opt_str(v, "_family"),
            family_index: v.get("_familyIndex").and_then(|x| x.as_f64()),
            kind: v.get("_kind").cloned(),
            result_name: opt_str(v, "_resultName"),
            command_name: opt_str(v, "_commandName"),
            deprecated: v.get("_deprecated").filter(|d| truthy(d)).cloned(),
            display_description: v.get("_displayDescription").and_then(|x| x.as_str()).map(String::from),
            kws: keywords.iter().map(|k| Word::new(k)).collect(),
            weak_words: weak.iter().map(|k| Word::new(k)).collect(),
            bound_words: weak_bound.as_ref().map(|b| b.iter().map(|k| Word::new(k)).collect()),
            desc_lower: lower(&description),
            desc_words: words_of(&description),
            prose_lower: prose.iter().map(|p| lower(p)).collect(),
            guidance_lower: guidance.iter().map(|p| lower(p)).collect(),
            title_words: titles.as_ref().map(|t| t.iter().map(|x| phrase_words(x)).collect()),
            names,
            joined_names,
            compound_kws,
            name,
            aliases,
            keywords,
            description,
            prose,
            guidance,
            weak,
            weak_bound,
            titles,
        }
    }

    /// A bare candidate with only a name (domainPriority's topic check).
    pub fn bare(name: &str) -> Candidate {
        let mut m = crate::json::Map::new();
        m.insert("name".into(), Value::String(name.into()));
        Candidate::from_json(&Value::Object(m))
    }

    pub fn result_name(&self) -> &str {
        self.result_name.as_deref().unwrap_or(&self.name)
    }
}

/// JS truthiness of a JSON value.
pub fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|x| x != 0.0 && !x.is_nan()),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
