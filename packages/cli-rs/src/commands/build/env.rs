//! Build's environment access (`api/build/_adapter.mjs`): templates,
//! components, search, setup notes, and the checked-in weights.
//!
//! TEMP: search, template discovery, component keywords and setup notes are
//! owned by other lanes (search: src/commands/search/, discovery:
//! src/discovery/). Until they land, the real environment reports them as
//! unavailable, and `FixtureEnv` replays what the JS CLI recorded.

use super::blocks::BlockPickerWeights;
use super::signals::{BuildEnv, BuildError, Scored, SearchCore};
use super::weights::WeightsFile;
use super::words::{BlockTemplate, ComponentWords, PageTemplate};
use crate::json::Value;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

/// `loadWeights()`: kit/weights.json, null when absent or malformed.
pub fn load_weights(cli_root: &Path) -> Option<&'static WeightsFile> {
    static W: OnceLock<Option<WeightsFile>> = OnceLock::new();
    W.get_or_init(|| read_json(&cli_root.join("api/build/kit/weights.json")).and_then(|v| WeightsFile::from_json(&v)))
        .as_ref()
}

/// `loadBlockPicker()`: blocks/blocks.weights.json, null when absent or malformed.
pub fn load_block_picker(cli_root: &Path) -> Option<&'static BlockPickerWeights> {
    static W: OnceLock<Option<BlockPickerWeights>> = OnceLock::new();
    W.get_or_init(|| {
        read_json(&cli_root.join("api/build/blocks/blocks.weights.json")).and_then(|v| BlockPickerWeights::from_json(&v))
    })
    .as_ref()
}

pub struct RealEnv<'a> {
    pub cwd: PathBuf,
    pub cli_root: PathBuf,
    pub inv: &'a crate::cli::command::Invocation,
}

impl<'a> RealEnv<'a> {
    pub fn new(inv: &'a crate::cli::command::Invocation) -> RealEnv<'a> {
        RealEnv { cwd: inv.cwd.clone(), cli_root: inv.cli_root.clone(), inv }
    }
    fn cwd_str(&self) -> String {
        self.cwd.to_string_lossy().into_owned()
    }
}

impl BuildEnv for RealEnv<'_> {
    fn require_core(&self) -> Result<(), BuildError> {
        crate::discovery::paths::require_core_dir(&self.cwd_str()).map(|_| ()).map_err(|e| BuildError {
            message: e.message,
            code: e.code.to_string(),
            suggestions: vec![],
        })
    }
    fn search_core(&self, query: &str, kind: Option<&str>, limit: f64) -> Result<SearchCore, BuildError> {
        let a = crate::commands::search::search_core(query, &self.cwd, kind, Some(limit)).map_err(|e| BuildError {
            message: e.message,
            code: e.code,
            suggestions: e
                .suggestions
                .into_iter()
                .map(|(n, r)| crate::cli::command::Suggestion { name: n, reason: Some(r) })
                .collect(),
        })?;
        Ok(SearchCore {
            query: a.query,
            match_count: a.match_count as f64,
            results: a
                .results
                .into_iter()
                .map(|(entry, c)| Scored { entry, coverage: c.map(|(m, t)| (m as f64, t as f64)) })
                .collect(),
            searched_components: a.searched_components.map(|v| {
                v.into_iter().map(|(name, keywords)| ComponentWords { name, keywords }).collect()
            }),
        })
    }
    fn load_templates(&self) -> (Vec<PageTemplate>, Vec<BlockTemplate>) {
        use crate::commands::template::discovery as td;
        let all = td::discover_all(&self.cli_root, &self.cwd_str());
        let pages = all
            .iter()
            .filter(|t| t.kind == "page" && t.is_ready)
            .map(|t| PageTemplate {
                name: t.dir_name.clone(),
                display_name: t.display_name.clone().filter(|d| !d.is_empty()).unwrap_or_else(|| t.name.clone()),
                description: t.description.clone(),
                package: t.pkg().to_string(),
                category: t.category.clone(),
                keywords: t.keywords.clone(),
                file_path: t.file_path.clone(),
                command: format!("astryx template {} --type page", t.replaces.as_ref().unwrap_or(&t.dir_name)),
            })
            .collect();
        let blocks = all
            .iter()
            .filter(|t| t.kind == "block")
            .map(|t| BlockTemplate {
                name: t.dir_name.clone(),
                package: t.pkg().to_string(),
                display_name: t.name.clone(),
                description: t.description.clone(),
                command: format!("astryx template {} --type block", t.replaces.as_ref().unwrap_or(&t.dir_name)),
            })
            .collect();
        (pages, blocks)
    }
    fn load_components(&self) -> Vec<ComponentWords> {
        let Some(core) = crate::discovery::paths::find_core_dir(&self.cwd_str()) else { return Vec::new() };
        crate::commands::search::component_keywords(Path::new(&core), &self.cwd)
            .into_iter()
            .map(|(name, keywords)| ComponentWords { name, keywords })
            .collect()
    }
    fn template_setup_notes(&self, t: &PageTemplate) -> Vec<String> {
        match std::fs::read_to_string(&t.file_path) {
            Ok(source) => crate::commands::template::needs::analyze(self.inv, &source, &self.cwd_str()).notes,
            Err(_) => Vec::new(),
        }
    }
    fn weights(&self) -> Option<&WeightsFile> {
        load_weights(&self.cli_root)
    }
    fn block_picker(&self) -> Option<&BlockPickerWeights> {
        load_block_picker(&self.cli_root)
    }
}

fn strs(v: Option<&Value>) -> Vec<String> {
    v.and_then(|x| x.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

pub fn components_from_json(v: &Value) -> Vec<ComponentWords> {
    v.as_array()
        .map(|a| a.iter().map(|c| ComponentWords { name: s(c, "name"), keywords: strs(c.get("keywords")) }).collect())
        .unwrap_or_default()
}

/// A recorded environment: what the JS CLI's adapter and search returned for
/// one query (written by `scripts/build-fixtures.mjs`).
pub struct FixtureEnv {
    pub fixture: Value,
    pub cli_root: PathBuf,
}

impl BuildEnv for FixtureEnv {
    fn require_core(&self) -> Result<(), BuildError> {
        Ok(())
    }
    fn search_core(&self, _query: &str, _kind: Option<&str>, _limit: f64) -> Result<SearchCore, BuildError> {
        let sc = &self.fixture["search"];
        let results = sc["results"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| Scored {
                entry: r["entry"].clone(),
                coverage: r.get("coverage").filter(|c| !c.is_null()).map(|c| {
                    (c["matched"].as_f64().unwrap_or(0.0), c["total"].as_f64().unwrap_or(0.0))
                }),
            })
            .collect();
        Ok(SearchCore {
            query: s(sc, "query"),
            match_count: sc["matchCount"].as_f64().unwrap_or(0.0),
            results,
            searched_components: sc.get("searchedComponents").filter(|c| !c.is_null()).map(components_from_json),
        })
    }
    fn load_templates(&self) -> (Vec<PageTemplate>, Vec<BlockTemplate>) {
        let t = &self.fixture["templates"];
        let pages = t["pages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| PageTemplate {
                name: s(p, "name"),
                display_name: s(p, "displayName"),
                description: s(p, "description"),
                package: s(p, "package"),
                category: s(p, "category"),
                keywords: strs(p.get("keywords")),
                file_path: s(p, "filePath"),
                command: s(p, "command"),
            })
            .collect();
        let blocks = t["blocks"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| BlockTemplate {
                name: s(b, "name"),
                package: s(b, "package"),
                display_name: s(b, "displayName"),
                description: s(b, "description"),
                command: s(b, "command"),
            })
            .collect();
        (pages, blocks)
    }
    fn load_components(&self) -> Vec<ComponentWords> {
        components_from_json(&self.fixture["components"])
    }
    fn template_setup_notes(&self, t: &PageTemplate) -> Vec<String> {
        strs(self.fixture["notes"].get(&t.name))
    }
    fn weights(&self) -> Option<&WeightsFile> {
        load_weights(&self.cli_root)
    }
    fn block_picker(&self) -> Option<&BlockPickerWeights> {
        load_block_picker(&self.cli_root)
    }
}
