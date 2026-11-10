//! `astryx hook`: list Core hooks or print one hook's docs. Port of
//! `clients/cli/commands/hook.mjs` and `api/hook/`.

pub mod format;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, OptSource, Out, Suggestion};
use crate::cli::format::{code, list, record, section, text, Block, Field};
use crate::commands::component::deps::{self, ReadOpts};
use crate::commands::component::jsv::{at, truthy};
use crate::discovery::hook_discovery::{discover_hooks, find_hook_doc, get_all_hook_names};
use crate::json::{Map, Value};
use crate::text::levenshtein_distance;
use format::*;
use std::path::Path;

const CORE_PACKAGE: &str = "@astryxdesign/core";
const DEFAULT_IMPORT: &str = "@astryxdesign/core/hooks";

/// An API failure: `AstryxError(message, suggestions, code)`.
#[derive(Debug, Clone)]
pub struct ApiError {
    pub message: String,
    pub suggestions: Option<Vec<Suggestion>>,
    pub code: String,
}

impl ApiError {
    pub fn new(message: impl Into<String>, suggestions: Option<Vec<Suggestion>>, code: &str) -> Self {
        ApiError { message: message.into(), suggestions, code: code.into() }
    }
}

/// A typed API response `{type, package?, data}`.
#[derive(Debug, Clone)]
pub struct Response {
    pub kind: String,
    pub package: Option<String>,
    pub data: Value,
}

fn load_hook(path: &Path, zh: bool, lang: Option<&str>) -> Result<Value, String> {
    deps::read_doc_view(path, &ReadOpts { root: "hooks", lang: deps::locale_of(zh, false, lang), strict: false })
}

fn resolve_hook_doc(core_dir: &Path, name: &str, zh: bool, lang: Option<&str>) -> Result<Value, ApiError> {
    let Some(doc_path) = find_hook_doc(core_dir, name) else {
        let needle = name.to_lowercase();
        let mut sugg: Vec<(String, usize)> = get_all_hook_names(core_dir)
            .into_iter()
            .map(|h| {
                let d = levenshtein_distance(&needle, &h.to_lowercase());
                (h, d)
            })
            .filter(|(_, d)| *d <= 5)
            .collect();
        sugg.sort_by_key(|(_, d)| *d);
        let sugg: Vec<Suggestion> = sugg
            .into_iter()
            .take(5)
            .map(|(n, d)| Suggestion::new(n, format!("similar name (distance {d})")))
            .collect();
        return Err(ApiError::new(format!("No hook named \"{name}\""), Some(sugg), "ERR_UNKNOWN_HOOK"));
    };
    load_hook(&doc_path, zh, lang).map_err(|m| ApiError::new(m, None, "ERR_UNKNOWN"))
}

fn compact_entry(core_dir: &Path, name: &str, zh: bool, lang: Option<&str>) -> Value {
    let mut m = Map::new();
    m.insert("name".into(), Value::String(name.into()));
    let loaded = find_hook_doc(core_dir, name).and_then(|p| load_hook(&p, zh, lang).ok());
    let (desc, imp) = match &loaded {
        Some(d) => {
            let desc = at(d, &["usage", "description"]);
            let imp = d.get("importPath");
            (
                if truthy(desc) { desc.unwrap().clone() } else { Value::String(String::new()) },
                if truthy(imp) { imp.unwrap().clone() } else { Value::String(DEFAULT_IMPORT.into()) },
            )
        }
        None => (Value::String(String::new()), Value::String(DEFAULT_IMPORT.into())),
    };
    m.insert("description".into(), desc);
    m.insert("import".into(), imp);
    Value::Object(m)
}

fn full_entry(core_dir: &Path, name: &str, zh: bool, lang: Option<&str>) -> Value {
    find_hook_doc(core_dir, name).and_then(|p| load_hook(&p, zh, lang).ok()).unwrap_or_else(|| {
        let mut m = Map::new();
        m.insert("name".into(), Value::String(name.into()));
        Value::Object(m)
    })
}

/// `hook(name, options)` from `api/hook/hook.mjs`.
pub fn hook_api(
    cwd: &Path,
    name: Option<&str>,
    list_flag: bool,
    category: Option<&str>,
    params: bool,
    detail: &str,
    zh: bool,
    lang: Option<&str>,
) -> Result<Response, ApiError> {
    let core_dir = deps::require_core_dir(cwd).map_err(|e| ApiError::new(e.message, None, &e.code))?;
    let name = name.filter(|n| !n.is_empty());
    if category.is_some_and(|c| !c.is_empty()) || list_flag || name.is_none() {
        let hooks = discover_hooks(&core_dir);
        let category = category.filter(|c| !c.is_empty());
        let groups: Vec<(String, Vec<String>)> = match category {
            Some(cat) => {
                let Some((k, v)) = hooks.iter().find(|(k, _)| k.to_lowercase() == cat.to_lowercase()) else {
                    let sugg = hooks.keys().map(|k| Suggestion::new(k.clone(), "valid category")).collect();
                    return Err(ApiError::new(format!("Unknown category \"{cat}\""), Some(sugg), "ERR_UNKNOWN_CATEGORY"));
                };
                vec![(k.clone(), v.clone())]
            }
            None => hooks.into_iter().collect(),
        };
        let mut comps = Map::new();
        let level = match detail {
            "compact" => "compact",
            "full" => "full",
            _ => "names",
        };
        for (cat, names) in groups {
            let v = match level {
                "compact" => Value::Array(names.iter().map(|n| compact_entry(&core_dir, n, zh, lang)).collect()),
                "full" => Value::Array(names.iter().map(|n| full_entry(&core_dir, n, zh, lang)).collect()),
                _ => Value::Array(names.into_iter().map(Value::String).collect()),
            };
            comps.insert(cat, v);
        }
        let mut data = Map::new();
        data.insert("detail".into(), Value::String(level.into()));
        data.insert("components".into(), Value::Object(comps));
        return Ok(Response { kind: "hook.list".into(), package: Some(CORE_PACKAGE.into()), data: Value::Object(data) });
    }
    let name = name.unwrap();
    let docs = resolve_hook_doc(&core_dir, name, zh, lang)?;
    if params {
        let p = docs.get("params").filter(|v| truthy(Some(v))).cloned().unwrap_or(Value::Array(vec![]));
        return Ok(Response { kind: "hook.detail.params".into(), package: Some(CORE_PACKAGE.into()), data: p });
    }
    Ok(Response { kind: "hook.detail".into(), package: Some(CORE_PACKAGE.into()), data: docs })
}

fn package_record(pkg: &str) -> Block {
    record(&[("package".to_string(), Field::from(pkg))])
}

/// The `hook` command handler.
pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let run = crate::cli::env::cli_invocation(&inv.cwd);
    let name = inv.arg(0).map(String::from);
    let zh = inv.globals.zh;
    let lang = inv.globals.lang.clone();
    let list_flag = inv.flag("list");
    let category = inv.opt_str("category").map(String::from);
    let is_list = list_flag || category.as_deref().is_some_and(|c| !c.is_empty()) || name.as_deref().map_or(true, str::is_empty);
    let mut detail = inv.globals.detail.clone();
    let from_default = !matches!(inv_detail_source(inv), OptSource::Cli);
    if is_list && from_default {
        detail = "brief".into();
    }
    if !["full", "compact", "brief"].contains(&detail.as_str()) {
        return out.cli_error(
            &format!("Invalid --detail value \"{detail}\". Valid levels: full, compact, brief"),
            ErrorOpts::code("ERR_INVALID_DETAIL"),
        );
    }
    let result = match hook_api(&inv.cwd, name.as_deref(), list_flag, category.as_deref(), inv.flag("params"), &detail, zh, lang.as_deref()) {
        Ok(r) => r,
        Err(e) => {
            return out.cli_error(&e.message, ErrorOpts::code(&e.code).suggestions(e.suggestions.unwrap_or_default()));
        }
    };
    if inv.json() {
        out.json_out(&result.kind, result.package.clone().map(Value::String), crate::json::js_json_value(&result.data).unwrap_or(Value::Null), None);
        return Ok(());
    }
    let pkg = result.package.clone().unwrap_or_default();
    match result.kind.as_str() {
        "hook.list" => {
            out.emit(&[package_record(&pkg)]);
            let level = result.data.get("detail").and_then(|v| v.as_str()).unwrap_or("names");
            let groups = result.data.get("components").and_then(|v| v.as_object()).cloned().unwrap_or_default();
            match level {
                "full" => {
                    let blocks: Vec<Block> = groups
                        .iter()
                        .map(|(cat, items)| {
                            let body = items
                                .as_array()
                                .map(|a| a.as_slice())
                                .unwrap_or(&[])
                                .iter()
                                .map(|item| {
                                    let imp = item.get("importPath").filter(|v| truthy(Some(v))).and_then(|v| v.as_str()).unwrap_or(DEFAULT_IMPORT).to_string();
                                    format_hook_compact(item, Some(&imp))
                                })
                                .collect::<Vec<_>>()
                                .join("\n");
                            code(&format!("## {cat}\n\n{body}"))
                        })
                        .collect();
                    out.emit(&blocks);
                }
                "compact" => {
                    let mut blocks = Vec::new();
                    for (cat, items) in &groups {
                        blocks.push(section(cat, None));
                        let rows: Vec<_> = items
                            .as_array()
                            .map(|a| a.as_slice())
                            .unwrap_or(&[])
                            .iter()
                            .map(|i| crate::cli::format::json_fields(i, Some(&["name", "description"])))
                            .collect();
                        blocks.push(crate::cli::format::records(&rows));
                    }
                    blocks.push(text(&format!("Usage: {run} hook <name>")));
                    out.emit(&blocks);
                }
                _ => {
                    let names_of = |v: &Value| -> Vec<String> {
                        v.as_array().map(|a| a.iter().map(|x| crate::cli::format::js_string(x)).collect()).unwrap_or_default()
                    };
                    if category.is_some() {
                        if let Some((cat, names)) = groups.iter().next() {
                            out.emit(&[section(&format!("{cat}:"), None), list(&names_of(names))]);
                        }
                    } else {
                        let mut blocks = Vec::new();
                        for (cat, names) in &groups {
                            blocks.push(section(cat, None));
                            blocks.push(list(&names_of(names)));
                        }
                        blocks.push(text(&format!("Usage: {run} hook <name>")));
                        out.emit(&blocks);
                    }
                }
            }
        }
        "hook.detail" => {
            let doc = match detail.as_str() {
                "brief" => format_hook_brief(&result.data),
                "compact" => {
                    let imp = result.data.get("importPath").filter(|v| truthy(Some(v))).and_then(|v| v.as_str()).unwrap_or(DEFAULT_IMPORT).to_string();
                    format_hook_compact(&result.data, Some(&imp))
                }
                _ => format_hook_full(&result.data),
            };
            let mut blocks = vec![package_record(&pkg), code(&doc)];
            let related = result.data.get("relatedComponents");
            if crate::commands::component::jsv::has_len(related) && related.is_some_and(|r| r.is_array()) {
                blocks.push(text(&format!("Block templates: {run} component <name> --blocks for {}", join_values(related))));
            }
            out.emit(&blocks);
        }
        "hook.detail.params" => {
            out.emit(&[package_record(&pkg), code(&format_hook_params(&result.data, name.as_deref().unwrap_or("")))]);
        }
        _ => {}
    }
    Ok(())
}

/// `program.getOptionValueSource('detail')`.
pub fn inv_detail_source(inv: &Invocation) -> OptSource {
    inv.opt_sources.get("detail").copied().unwrap_or_else(|| {
        if inv.argv.iter().any(|a| a == "--detail" || a.starts_with("--detail=")) {
            OptSource::Cli
        } else {
            OptSource::Default
        }
    })
}
