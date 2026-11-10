//! What build weighs for one request (`api/build/kit/signals.mjs`).

use super::kind::idea_kind;
use super::rank::rank_pages;
use super::start::{as_template, choose_start, pick_start_alternatives};
use super::weights::WeightsFile;
use super::words::{BlockTemplate, ComponentWords, IdeaKind, PageTemplate};
use crate::json::Value;
use std::collections::{HashMap, HashSet};

const PAGE_DIRECT: f64 = 95.0;
const PAGE_FLOOR: f64 = 50.0;
const DOMAIN_FLOOR: f64 = 60.0;
const PAGE_COVERAGE: f64 = 0.5;
pub const CORE_PROVIDER_ID: &str = "@astryxdesign/core";

/// One search result and the coverage search kept for it.
#[derive(Debug, Clone)]
pub struct Scored {
    pub entry: Value,
    pub coverage: Option<(f64, f64)>,
}

/// What build reads from search's lexical ranker.
#[derive(Debug, Clone)]
pub struct SearchCore {
    pub query: String,
    pub match_count: f64,
    pub results: Vec<Scored>,
    /// The components the search was scored against (None when narrowed away).
    pub searched_components: Option<Vec<ComponentWords>>,
}

/// An error a build run reports (`AstryxError`: message, code, suggestions).
#[derive(Debug, Clone)]
pub struct BuildError {
    pub message: String,
    pub code: String,
    pub suggestions: Vec<crate::cli::command::Suggestion>,
}

/// The environment a build reads: search, templates, components, notes.
pub trait BuildEnv {
    /// `coreDirOrThrow(requireBuildCoreDir, cwd)`.
    fn require_core(&self) -> Result<(), BuildError>;
    /// `searchCore(query, {cwd, type, limit})`.
    fn search_core(&self, query: &str, kind: Option<&str>, limit: f64) -> Result<SearchCore, BuildError>;
    /// `loadTemplates(cwd)`.
    fn load_templates(&self) -> (Vec<PageTemplate>, Vec<BlockTemplate>);
    /// `loadComponents(cwd)`.
    fn load_components(&self) -> Vec<ComponentWords>;
    /// `templateSetupNotes(template, cwd)`.
    fn template_setup_notes(&self, t: &PageTemplate) -> Vec<String>;
    fn weights(&self) -> Option<&WeightsFile>;
    fn block_picker(&self) -> Option<&super::blocks::BlockPickerWeights>;
}

pub type BlockScore = (String, f64, Option<f64>, Option<f64>);

pub struct KitSignals {
    pub query: String,
    pub match_count: f64,
    pub direct_match: bool,
    pub start: Option<Value>,
    pub pages: Vec<Value>,
    pub blocks: Vec<Value>,
    pub domain: Vec<Value>,
    pub kit_blocks: Vec<String>,
    pub searched: Vec<BlockScore>,
    pub searched_entries: HashMap<String, Value>,
    pub foreign: Vec<String>,
    pub catalog: Vec<BlockTemplate>,
    pub components: Vec<ComponentWords>,
}

fn sget<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("")
}

fn score(v: &Value) -> f64 {
    v.get("score").and_then(|x| x.as_f64()).unwrap_or(f64::NAN)
}

fn is_int(x: f64) -> bool {
    x.is_finite() && x.fract() == 0.0
}

pub fn kit_signals(query: &str, kind: Option<&str>, limit: f64, env: &dyn BuildEnv) -> Result<KitSignals, BuildError> {
    if kind != Some("doc") {
        env.require_core()?;
    }
    let search_limit = if is_int(limit) && limit > 0.0 { limit.max(200.0) } else { limit };
    let result = env.search_core(query, kind, search_limit)?;
    let results = &result.results;
    let match_count = result.match_count;

    let covers = |r: &Scored| -> bool {
        let total = r.coverage.map(|c| c.1).unwrap_or(1.0);
        if total <= 1.0 {
            return true;
        }
        r.coverage.map(|c| c.0).unwrap_or(0.0) / total >= PAGE_COVERAGE
    };

    let matched_pages: Vec<&Scored> = results
        .iter()
        .filter(|r| {
            sget(&r.entry, "domain") == "template"
                && sget(&r.entry, "kind") != "block"
                && score(&r.entry) >= PAGE_FLOOR
                && covers(r)
        })
        .take(3)
        .collect();
    let searched_blocks: Vec<&Scored> = results
        .iter()
        .filter(|r| sget(&r.entry, "domain") == "template" && sget(&r.entry, "kind") == "block")
        .collect();
    let blocks: Vec<&Scored> = searched_blocks.iter().copied().filter(|r| score(&r.entry) >= DOMAIN_FLOOR).take(5).collect();
    let always: HashSet<&str> = super::answer::FRAME.iter().chain(super::answer::FOUNDATION.iter()).copied().collect();
    let domain: Vec<&Scored> = results
        .iter()
        .filter(|r| {
            let d = sget(&r.entry, "domain");
            (d == "component" || d == "hook") && score(&r.entry) >= DOMAIN_FLOOR && !always.contains(sget(&r.entry, "name"))
        })
        .take(6)
        .collect();
    let direct_match = !matched_pages.is_empty() && score(&matched_pages[0].entry) >= PAGE_DIRECT;

    let pages: Vec<Value> = matched_pages
        .iter()
        .map(|p| {
            let mut e = p.entry.clone();
            if !direct_match {
                let cmd = format!("{} --skeleton", crate::cli::format::js_string(e.get("command").unwrap_or(&Value::Null)));
                if let Some(m) = e.as_object_mut() {
                    m.insert("command".into(), Value::String(cmd));
                }
            }
            e
        })
        .collect();

    // `arr.slice(0, Math.max(0, budget))`; budget may be NaN (slice reads it as 0).
    let mut budget = limit;
    let mut to_limit = |n: usize| -> usize {
        let b = if budget.is_nan() { 0.0 } else { budget.max(0.0) };
        let take = if b >= n as f64 { n } else { b.floor() as usize };
        budget -= take as f64;
        take
    };
    let pages_kept: Vec<Value> = pages.iter().take(to_limit(pages.len())).cloned().collect();
    let blocks_kept: Vec<Value> = blocks.iter().take(to_limit(blocks.len())).map(|r| r.entry.clone()).collect();
    let domain_kept: Vec<Value> = domain.iter().take(to_limit(domain.len())).map(|r| r.entry.clone()).collect();

    let wants_pages = kind.is_none() || kind == Some("template");
    let (catalog, block_catalog) = if wants_pages { env.load_templates() } else { (Vec::new(), Vec::new()) };
    let ranked = if wants_pages { rank_pages(query, &catalog) } else { Vec::new() };
    let components: Vec<ComponentWords> = if wants_pages {
        match &result.searched_components {
            Some(c) => c.clone(),
            None => env.load_components(),
        }
    } else {
        Vec::new()
    };
    let idea = if wants_pages { idea_kind(query, &catalog, &components) } else { IdeaKind::Page };
    let page_names: Vec<String> = matched_pages.iter().map(|p| sget(&p.entry, "name").to_string()).collect();
    let chosen = if wants_pages {
        choose_start(&ranked, idea, &page_names, direct_match, &catalog, query, env.weights())
    } else {
        None
    };
    let start = chosen.map(|mut c| {
        let name = sget(&Value::Object(c.clone()), "name").to_string();
        let alts: Vec<Value> = pick_start_alternatives(&ranked, idea, &name, &catalog, query, env.weights())
            .iter()
            .filter_map(|r| catalog.iter().find(|t| t.name == r.name).map(|t| Value::Object(as_template(t))))
            .collect();
        c.insert("alternatives".into(), Value::Array(alts));
        if let Some(t) = catalog.iter().find(|t| t.name == name) {
            let notes = env.template_setup_notes(t);
            if !notes.is_empty() {
                c.insert("notes".into(), Value::Array(notes.into_iter().map(Value::String).collect()));
            }
        }
        Value::Object(c)
    });

    let searched: Vec<BlockScore> = searched_blocks
        .iter()
        .map(|r| (sget(&r.entry, "name").to_string(), score(&r.entry), r.coverage.map(|c| c.0), r.coverage.map(|c| c.1)))
        .collect();
    let mut searched_entries = HashMap::new();
    for r in searched_blocks.iter().rev() {
        searched_entries.insert(sget(&r.entry, "name").to_string(), r.entry.clone());
    }
    let mut foreign: Vec<String> = Vec::new();
    {
        let mut seen = HashSet::new();
        let pkgs = blocks_kept
            .iter()
            .map(|b| (sget(b, "name").to_string(), b.get("package").and_then(|x| x.as_str()).map(str::to_string)))
            .chain(searched_blocks.iter().map(|r| {
                (sget(&r.entry, "name").to_string(), r.entry.get("package").and_then(|x| x.as_str()).map(str::to_string))
            }))
            .chain(block_catalog.iter().map(|b| (b.name.clone(), Some(b.package.clone()))));
        for (name, pkg) in pkgs {
            if pkg.as_deref() != Some(CORE_PROVIDER_ID) && seen.insert(name.clone()) {
                foreign.push(name);
            }
        }
    }
    Ok(KitSignals {
        query: result.query.clone(),
        match_count,
        direct_match,
        start,
        kit_blocks: blocks_kept.iter().map(|b| sget(b, "name").to_string()).collect(),
        pages: pages_kept,
        blocks: blocks_kept,
        domain: domain_kept,
        searched,
        searched_entries,
        foreign,
        catalog: block_catalog,
        components,
    })
}
