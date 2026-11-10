//! `rankSearchIndex(query, indexes, options)` (`search-index.mjs`): rank
//! stored candidates with search's tree.

use super::cand::Candidate;
use super::learned::{run_tree, SearchData};
use super::lexical::{response_json, Catalog};
use crate::json::Value;

/// A search API error: message, suggestions (name, reason) and code.
#[derive(Debug, Clone)]
pub struct SearchError {
    pub message: String,
    pub suggestions: Vec<(String, String)>,
    pub code: String,
}

impl SearchError {
    pub fn invalid(message: String, suggestions: Vec<(String, String)>) -> SearchError {
        SearchError { message, suggestions, code: "ERR_INVALID_ARGUMENT".into() }
    }
}

/// `checkSearchArgs(query, {type, limit})`. `limit` is the JS number given.
pub fn check_search_args(query: &str, type_: Option<&str>, limit: Option<f64>) -> Result<(), SearchError> {
    if super::words::js_trim(query).is_empty() {
        return Err(SearchError::invalid(
            "A search query is required".into(),
            vec![("astryx search button".into(), "example".into())],
        ));
    }
    if let Some(t) = type_.filter(|t| !t.is_empty()) {
        if !super::words::SEARCH_DOMAINS.contains(&t) {
            return Err(SearchError::invalid(
                format!("Unknown --type \"{t}\""),
                super::words::SEARCH_DOMAINS.iter().map(|d| (d.to_string(), "valid type".to_string())).collect(),
            ));
        }
    }
    if let Some(l) = limit {
        if !(l.is_finite() && l.fract() == 0.0) || l <= 0.0 {
            return Err(SearchError::invalid(
                format!("Invalid limit \"{}\". Must be a positive integer.", crate::json::js_number_to_string(l)),
                Vec::new(),
            ));
        }
    }
    Ok(())
}

/// Rank one stored index's candidates (already version-checked).
pub fn rank_candidates(
    query: &str,
    candidates: &[Value],
    type_: Option<&str>,
    limit: Option<f64>,
    core_skipped: Option<String>,
    data: &SearchData,
) -> Result<Value, SearchError> {
    check_search_args(query, type_, limit)?;
    let wanted: Vec<&Value> = candidates
        .iter()
        .filter(|c| type_.is_none() || c.get("domain").and_then(|d| d.as_str()) == type_)
        .collect();
    let catalog = Catalog {
        all: wanted.iter().map(|v| Candidate::from_json(v)).collect(),
        searched_components: true,
        outside: false,
        core_skipped,
    };
    rank_catalog(query, &catalog, limit, data)
}

/// Rank a catalog with search's tree, as `rankSearchIndex` answers.
pub fn rank_catalog(query: &str, catalog: &Catalog, limit: Option<f64>, data: &SearchData) -> Result<Value, SearchError> {
    let limit = limit.map_or(20, |l| if l > 1e15 { usize::MAX } else { l as usize });
    let lex = run_tree(query, limit, catalog, data);
    let mut resp = response_json(&lex, catalog, &lex.results);
    // withDisplayDescriptions
    if let Some(results) = resp.pointer_mut("/data/results").and_then(|r| r.as_array_mut()) {
        for (r, sr) in results.iter_mut().zip(&lex.results) {
            let c = &catalog.all[sr.cand];
            if c.domain == "component" {
                if let Some(d) = &c.display_description {
                    r["description"] = Value::String(d.clone());
                }
            }
        }
    }
    Ok(resp)
}
