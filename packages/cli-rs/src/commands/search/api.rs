//! `search(query, options)` and `searchCore(query, options)` (`search.mjs`):
//! gather the candidates a query's domains hold, then rank them.

use super::cand::Candidate;
use super::gather;
use super::index::{check_search_args, SearchError};
use super::learned::{run_tree, SearchData};
use super::lexical::{rank_lexical, response_json, Catalog, Lexical};
use super::words::CORELESS_DOMAINS;
use crate::json::Value;
use std::path::Path;

/// What a gather found (`gatherCandidates`).
pub struct Gathered {
    pub catalog: Catalog,
    pub core_skipped_code: Option<String>,
    /// The component candidates' `(name, keywords)` when components were read.
    pub components: Vec<(String, Vec<String>)>,
}

/// The gathered candidates as JSON (for checks against an exported index).
pub fn gather_values(cwd: &Path, type_: Option<&str>) -> Result<Vec<Value>, SearchError> {
    gather_raw(cwd, type_).map(|r| r.0)
}

/// `resolveSearchCore(type, requireCoreDir, cwd)` then `gatherDomains`.
pub fn gather_candidates(cwd: &Path, type_: Option<&str>) -> Result<Gathered, SearchError> {
    let (all, searched_components, outside, core_skipped, core_skipped_code, components) = gather_raw(cwd, type_)?;
    Ok(Gathered {
        catalog: Catalog { all: gather::par_map(&all, Candidate::from_json), searched_components, outside, core_skipped },
        core_skipped_code,
        components,
    })
}

type Raw = (Vec<Value>, bool, bool, Option<String>, Option<String>, Vec<(String, Vec<String>)>);

fn gather_raw(cwd: &Path, type_: Option<&str>) -> Result<Raw, SearchError> {
    let cwd_s = cwd.to_string_lossy().to_string();
    let needs_core = type_.is_none_or(|t| !CORELESS_DOMAINS.contains(&t));
    let mut core_dir = None;
    let mut core_skipped = None;
    let mut core_skipped_code = None;
    if needs_core && type_.is_some() {
        match crate::discovery::paths::require_core_dir(&cwd_s) {
            Ok(d) => core_dir = Some(d),
            Err(e) => {
                return Err(SearchError { message: e.message, suggestions: Vec::new(), code: e.code.to_string() })
            }
        }
    } else if needs_core {
        match crate::discovery::paths::require_core_dir(&cwd_s) {
            Ok(d) => core_dir = Some(d),
            Err(e) => {
                core_skipped = Some(e.message);
                core_skipped_code = Some(e.code.to_string());
            }
        }
    }
    let wants = |d: &str| (type_.is_none() && (core_dir.is_some() || CORELESS_DOMAINS.contains(&d))) || type_ == Some(d);
    let pm = crate::discovery::package_manager::doc_package_manager(Some(&cwd_s));
    let core = core_dir.as_ref().map(|d| Path::new(d).to_path_buf());
    let mut all: Vec<Value> = Vec::new();
    if let Some(core) = core.as_deref() {
        gather::preload_core(core, wants("component"), wants("hook"));
    }
    let components = if wants("component") {
        gather::gather_components(core.as_deref().unwrap(), cwd)
            .map_err(|m| SearchError { message: m, suggestions: Vec::new(), code: "ERR_UNKNOWN".into() })?
    } else {
        Vec::new()
    };
    let component_kw: Vec<(String, Vec<String>)> = components
        .iter()
        .map(|c| {
            (
                c["name"].as_str().unwrap_or("").to_string(),
                c["keywords"].as_array().map(|a| a.iter().map(super::cand::js_str).collect()).unwrap_or_default(),
            )
        })
        .collect();
    all.extend(components);
    if wants("hook") {
        all.extend(gather::gather_hooks(core.as_deref().unwrap()));
    }
    if wants("doc") {
        let mut docs = gather::own_docs(&pm);
        let extra = gather::integration_docs(cwd);
        if !extra.is_empty() {
            let at = gather::own_topic_count().min(docs.len());
            docs.splice(at..at, extra);
        }
        all.extend(docs);
    }
    if wants("template") {
        all.extend(gather::gather_templates(&crate::cli::env::cli_root(), cwd));
    }
    let mut themes_found = false;
    if wants("theme") {
        let themes = gather::gather_themes(&crate::cli::env::cli_root(), cwd);
        themes_found = !themes.is_empty();
        all.extend(themes);
    }
    let outside = themes_found && crate::discovery::release::is_outside_project(&cwd_s);
    Ok((all, wants("component"), outside, core_skipped, core_skipped_code, component_kw))
}

/// `search(query, {cwd, type, limit})`: the response JSON.
pub fn search(query: &str, cwd: &Path, type_: Option<&str>, limit: Option<f64>, cli_root: &Path) -> Result<Value, SearchError> {
    check_search_args(query, type_, limit)?;
    let g = gather_candidates(cwd, type_)?;
    let data = SearchData::load(cli_root);
    let limit = limit.map_or(20, to_limit);
    let lex = run_tree(query, limit, &g.catalog, &data);
    Ok(response_json(&lex, &g.catalog, &lex.results))
}

fn to_limit(l: f64) -> usize {
    if l > 1e15 {
        usize::MAX
    } else {
        l as usize
    }
}

/// `searchCore(query, {cwd, type, limit})`, as `build` reads it.
pub struct CoreAnswer {
    pub query: String,
    pub match_count: usize,
    /// Each result's JSON, with its coverage `(matched, total)`.
    pub results: Vec<(Value, Option<(usize, usize)>)>,
    /// The components the search read (`searchedComponents`), when it read them.
    pub searched_components: Option<Vec<(String, Vec<String>)>>,
    pub response: Value,
}

pub fn search_core(query: &str, cwd: &Path, type_: Option<&str>, limit: Option<f64>) -> Result<CoreAnswer, SearchError> {
    check_search_args(query, type_, limit)?;
    let g = gather_candidates(cwd, type_)?;
    let lex: Lexical = rank_lexical(query, limit.map_or(20, to_limit), &g.catalog);
    let response = response_json(&lex, &g.catalog, &lex.results);
    let results = response["data"]["results"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .zip(&lex.results)
        .map(|(v, r)| (v, Some((r.matched, r.total))))
        .collect();
    Ok(CoreAnswer {
        query: lex.query.clone(),
        match_count: lex.match_count,
        results,
        searched_components: if g.catalog.searched_components { Some(g.components) } else { None },
        response,
    })
}

/// `componentKeywords(coreDir, cwd)`: every component with its keywords
/// (empty when Core cannot be listed; see [`try_component_keywords`]).
pub fn component_keywords(core_dir: &Path, cwd: &Path) -> Vec<(String, Vec<String>)> {
    try_component_keywords(core_dir, cwd).unwrap_or_default()
}

/// `componentKeywords(coreDir, cwd)`, with the error Node throws when Core's
/// `src` cannot be listed.
pub fn try_component_keywords(core_dir: &Path, cwd: &Path) -> Result<Vec<(String, Vec<String>)>, SearchError> {
    gather::component_keywords(core_dir, cwd)
        .map_err(|m| SearchError { message: m, suggestions: Vec::new(), code: "ERR_UNKNOWN".into() })
}
