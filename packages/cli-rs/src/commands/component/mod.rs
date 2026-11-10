//! `astryx component`: list components or print component docs. Port of
//! `clients/cli/commands/component.mjs` and `api/component/`.

pub mod api;
pub mod deps;
pub mod format;
pub mod jsv;
pub mod links;
pub mod list;
pub mod templates;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out};
use crate::cli::format::{code, json_fields, list as list_block, record, records, section, text, Block, Field, Fields};
use crate::discovery::component_discovery::{discover_components, find_component_readme, resolve_import_path, CORE_PACKAGE};
use crate::json::Value;
use api::{Name, Options};
use format::*;
use jsv::{s, tpl};
use std::collections::{HashMap, HashSet};
use std::path::Path;

fn pkg_record(pkg: &str) -> Block {
    record(&[("package".to_string(), Field::from(pkg))])
}

fn fields_of(v: &Value, keys: &[&str]) -> Fields {
    json_fields(v, Some(keys))
}

/// `componentDetailBlocks(result, requestedName, detail, themeData)`.
fn detail_blocks(result: &Value, requested_name: &str, detail: &str, theme: Option<&Value>, run: &str) -> Result<Vec<Block>, Thrown> {
    let last = requested_name.rsplit('/').next().unwrap_or(requested_name);
    let requested = last.strip_prefix("XDS").unwrap_or(last).to_string();
    let kind = s(result.get("type")).unwrap_or("");
    let package = tpl(result.get("package"));
    let data = result.get("data").cloned().unwrap_or(Value::Null);
    let resolved = if kind == "component.detail" && data.get("name").is_some_and(|n| n.is_string()) && s(data.get("replaces")) == Some(requested.as_str()) {
        s(data.get("name")).unwrap().to_string()
    } else {
        requested.clone()
    };
    match kind {
        "component.detail" => {
            let mut out = vec![pkg_record(&package)];
            if jsv::truthy(data.get("parentDoc")) {
                out.push(record(&fields_of(&data, &["parentDoc"])));
            }
            let import = s(data.get("import"));
            out.push(code(&match detail {
                "brief" => try_format_brief(&data, &resolved, import, theme)?,
                "compact" => format_compact(&data, &resolved, import, run),
                _ => format_full(&data, theme, import, run),
            }));
            Ok(out)
        }
        "component.detail.props" => {
            let mut m = crate::json::Map::new();
            m.insert("props".into(), data.clone());
            Ok(vec![pkg_record(&package), code(&format_props(&Value::Object(m), &resolved))])
        }
        "component.detail.source" | "component.detail.showcase" => Ok(vec![code(&tpl(data.get("source")))]),
        "component.detail.blocks" => {
            let owned = |b: &Value, label: String| -> String {
                if tpl(b.get("package")) == package { label } else { format!("{label} ({})", tpl(b.get("package"))) }
            };
            let mut out = vec![pkg_record(&package)];
            let showcase = data.get("showcase").filter(|v| !v.is_null());
            let examples = jsv::arr(data.get("examples"));
            let related = jsv::arr(data.get("related"));
            if let Some(sc) = showcase {
                let mut m = sc.as_object().cloned().unwrap_or_default();
                m.insert("displayName".into(), Value::String(owned(sc, tpl(sc.get("displayName")))));
                out.push(section("Showcase", None));
                out.push(record(&fields_of(&Value::Object(m), &["displayName", "description"])));
            }
            if !examples.is_empty() {
                out.push(section("Examples", None));
                let rows: Vec<Fields> = examples
                    .iter()
                    .map(|b| {
                        let mut m = b.as_object().cloned().unwrap_or_default();
                        m.insert("name".into(), Value::String(owned(b, tpl(b.get("name")))));
                        fields_of(&Value::Object(m), &["name", "description"])
                    })
                    .collect();
                out.push(records(&rows));
            }
            if !related.is_empty() {
                out.push(section(&format!("Related: {} blocks that use {}", related.len(), tpl(data.get("component"))), None));
                let items: Vec<String> = related.iter().map(|b| owned(b, tpl(b.get("name")))).collect();
                out.push(list_block(&items));
            }
            if showcase.is_none() && examples.is_empty() && related.is_empty() {
                out.push(text(&format!("No blocks found for {}", tpl(data.get("component")))));
            }
            Ok(out)
        }
        _ => Ok(Vec::new()),
    }
}

/// `formatBriefAll(coreDir, {zh, lang, themeData, replacements, categories})`.
fn format_brief_all(core_dir: &Path, zh: bool, lang: Option<&str>, theme: Option<&Value>, replacements: &HashMap<String, Value>, categories: &[String]) -> Result<String, Thrown> {
    let shown: HashSet<&String> = categories.iter().collect();
    let mut output: Vec<String> = Vec::new();
    for (key, comps) in discover_components(core_dir) {
        if !shown.contains(&key) {
            continue;
        }
        if !(comps.len() == 1 && comps[0] == key) {
            output.push(format!("## {key}\n"));
        }
        for comp in &comps {
            if let Some(rep) = replacements.get(comp) {
                let text = try_format_brief(rep, &tpl(rep.get("name")), s(rep.get("import")), theme)?;
                let mut lines: Vec<String> = text.split('\n').map(String::from).collect();
                lines[0] = format!("{}  [{}]", lines[0], tpl(rep.get("package")));
                output.push(lines.join("\n"));
                continue;
            }
            match find_component_readme(core_dir, comp).filter(|p| p.to_string_lossy().ends_with(".doc.mjs")) {
                Some(p) => {
                    // A doc that fails to load throws here, failing the command.
                    let docs = api::load_docs(&p, zh, lang).map_err(|m| ("Error".to_string(), m))?;
                    output.push(try_format_brief(&docs, comp, Some(&resolve_import_path(core_dir, comp)), theme)?);
                }
                None => output.push(format!("{comp}\n  (no docs)\n")),
            }
        }
    }
    Ok(output.join("\n"))
}

/// The `component` command handler.
pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    // Read-only: list each folder once (as the JS command's withListingCache).
    crate::discovery::listing_cache::with_listing_cache(|| run_uncached(inv, out))
}

fn run_uncached(inv: &Invocation, out: &mut Out) -> CmdResult {
    let run = crate::cli::env::cli_invocation(&inv.cwd);
    let names = inv.arg_list(0);
    let name = if names.len() == 1 { Some(names[0].clone()) } else { None };
    let api_input = if names.is_empty() {
        Name::None
    } else if let Some(n) = &name {
        Name::One(n.clone())
    } else {
        Name::Many(names.clone())
    };
    let g = &inv.globals;
    let category = inv.opt_str("category").map(String::from);
    let is_list = inv.flag("list") || category.as_deref().is_some_and(|c| !c.is_empty()) || names.is_empty();
    let mut detail = g.detail.clone();
    if is_list && matches!(crate::commands::hook::inv_detail_source(inv), crate::cli::command::OptSource::Default) {
        detail = "brief".into();
    }
    let json = g.json;
    if !["full", "compact", "brief"].contains(&detail.as_str()) {
        return out.cli_error(&format!("Invalid --detail value \"{detail}\". Valid levels: full, compact, brief"), ErrorOpts::code("ERR_INVALID_DETAIL"));
    }
    deps::warn_on_integration_issues(&inv.cwd, json, out);
    let opts = Options {
        cwd: inv.cwd.clone(),
        cli_root: inv.cli_root.clone(),
        list: inv.flag("list"),
        category: category.clone(),
        package: inv.opt_str("package").map(String::from),
        props: inv.flag("props"),
        source: inv.flag("source"),
        showcase: inv.flag("showcase"),
        blocks: inv.flag("blocks"),
        detail: Some(detail.clone()),
        lang: g.lang.clone(),
        zh: g.zh,
        dense: g.dense,
    };
    let result = match api::component(&api_input, &opts) {
        Ok(r) => r,
        Err(e) => return out.cli_error(&e.message, ErrorOpts::code(&e.code).suggestions(e.suggestions.unwrap_or_default())),
    };
    if result.kind == "component.batch" && jsv::arr(result.data.get("results")).iter().any(|r| s(r.get("status")) != Some("found")) {
        out.exit_code = 1;
    }
    if json {
        out.json_out(&result.kind, result.package.clone().map(Value::String), crate::json::js_json_value(&result.data).unwrap_or(Value::Null), None);
        return Ok(());
    }
    let core_dir = match deps::require_core_dir(&inv.cwd) {
        Ok(d) => d,
        Err(_) => return Ok(()),
    };
    let theme = match deps::resolve_theme(&inv.cwd, out) {
        Ok(t) => t,
        Err(msg) => return out.cli_error(&format!("Could not load the recorded theme: {msg}"), ErrorOpts::code("ERR_THEME_LOAD")),
    };
    let theme = theme.as_ref();
    let list_footer = text(&format!(
        "Import from the path shown (e.g. import {{Button}} from '@astryxdesign/core/Button')\nUsage: {run} component <name> [name...]"
    ));
    let data = &result.data;
    match result.kind.as_str() {
        "component.list" => {
            let groups = data.get("components").and_then(|c| c.as_object()).cloned().unwrap_or_default();
            match s(data.get("detail")).unwrap_or("names") {
                "full" => {
                    let mut reps: HashMap<String, Value> = HashMap::new();
                    for items in groups.values() {
                        for item in jsv::arr(Some(items)) {
                            if s(item.get("package")) != Some(CORE_PACKAGE) {
                                if let Some(r) = s(item.get("replaces")) {
                                    reps.insert(r.to_string(), item.clone());
                                }
                            }
                        }
                    }
                    let cats: Vec<String> = groups.keys().cloned().collect();
                    let all = match format_brief_all(&core_dir, g.zh, g.lang.as_deref(), theme, &reps, &cats) {
                        Ok(t) => t,
                        Err((n, m)) => return Err(out.fatal(&n, &m, None)),
                    };
                    out.emit(&[code(&all)]);
                }
                "compact" => {
                    let entries: Vec<(&String, &Value)> = groups.iter().collect();
                    let mut blocks = Vec::new();
                    for (cat, items) in &entries {
                        let items = jsv::arr(Some(items));
                        let ungrouped = entries.len() == 1 && items.len() == 1 && s(items[0].get("name")) == Some(cat.as_str());
                        if !ungrouped {
                            blocks.push(section(cat, None));
                        }
                        let rows: Vec<Fields> = items
                            .iter()
                            .map(|item| {
                                let mut m = item.as_object().cloned().unwrap_or_default();
                                if s(item.get("package")) != Some(CORE_PACKAGE) {
                                    m.insert("import".into(), Value::String(format!("{}  [{}]", tpl(item.get("import")), tpl(item.get("package")))));
                                }
                                fields_of(&Value::Object(m), &["name", "import", "description"])
                            })
                            .collect();
                        blocks.push(records(&rows));
                    }
                    blocks.push(list_footer);
                    out.emit(&blocks);
                }
                _ => {
                    let mut counts: HashMap<String, HashSet<String>> = HashMap::new();
                    for items in groups.values() {
                        for item in jsv::arr(Some(items)) {
                            counts.entry(tpl(item.get("name"))).or_default().insert(tpl(item.get("package")));
                        }
                    }
                    let first = groups.iter().next();
                    let use_cat = category.as_deref().is_some_and(|c| !c.is_empty()) && first.is_some();
                    let mut entries: Vec<Value> = if use_cat {
                        jsv::arr(first.map(|f| f.1)).to_vec()
                    } else {
                        groups.values().flat_map(|v| jsv::arr(Some(v)).to_vec()).collect()
                    };
                    api::sort_by_locale(&mut entries);
                    let rows: Vec<Fields> = entries
                        .iter()
                        .map(|item| {
                            let n = tpl(item.get("name"));
                            let path = match item.get("import").filter(|v| !v.is_null()) {
                                Some(v) => tpl(Some(v)),
                                None => resolve_import_path(&core_dir, &n),
                            };
                            let pkg = tpl(item.get("package"));
                            let qualify = pkg != CORE_PACKAGE || counts.get(&n).map_or(0, |s| s.len()) > 1;
                            let cell = if qualify { format!("{path}  [{pkg}]") } else { path };
                            vec![("name".to_string(), Field::from(n)), ("import".to_string(), Field::from(cell))]
                        })
                        .collect();
                    let head = if use_cat { section(first.unwrap().0, None) } else { section(&format!("Components ({})", entries.len()), None) };
                    out.emit(&[head, records(&rows), list_footer]);
                }
            }
        }
        "component.batch" => {
            let mut blocks = vec![
                section("Component batch", None),
                record(&[("count".to_string(), Field::from(tpl(data.get("count"))))]),
                section("Results", None),
            ];
            for row in jsv::arr(data.get("results")) {
                let selector = tpl(row.get("selector"));
                blocks.push(section(&selector, None));
                if s(row.get("status")) == Some("found") {
                    blocks.push(record(&fields_of(row, &["selector", "status"])));
                    blocks.push(section("Result", None));
                    let r = row.get("result").cloned().unwrap_or(Value::Null);
                    let rk = s(r.get("type")).unwrap_or("");
                    if rk == "component.detail.source" || rk == "component.detail.showcase" {
                        blocks.push(pkg_record(&tpl(r.get("package"))));
                    }
                    match detail_blocks(&r, &selector, &detail, theme, &run) {
                        Ok(b) => blocks.extend(b),
                        Err((n, m)) => return Err(out.fatal(&n, &m, None)),
                    }
                    continue;
                }
                blocks.push(record(&fields_of(row, &["selector", "status", "code", "error"])));
                if s(row.get("status")) == Some("ambiguous") {
                    blocks.push(section("Candidates", None));
                    let rows: Vec<Fields> = jsv::arr(row.get("candidates")).iter().map(|c| fields_of(c, &["package", "component", "kind", "installed"])).collect();
                    blocks.push(records(&rows));
                } else if jsv::has_len(row.get("suggestions")) {
                    blocks.push(section("Suggestions", None));
                    let rows: Vec<Fields> = jsv::arr(row.get("suggestions")).iter().map(|c| fields_of(c, &["name", "reason"])).collect();
                    blocks.push(records(&rows));
                }
            }
            out.emit(&blocks);
        }
        k if k.starts_with("component.detail") => {
            if k == "component.detail.source" || k == "component.detail.showcase" {
                out.eprintln(&format!("package: {}", result.package.clone().unwrap_or_else(|| "undefined".into())));
            }
            let rv = result.to_json();
            let blocks = match detail_blocks(&rv, name.as_deref().unwrap_or(""), &detail, theme, &run) {
                Ok(b) => b,
                Err((n, m)) => return Err(out.fatal(&n, &m, None)),
            };
            out.emit(&blocks);
        }
        _ => {}
    }
    Ok(())
}
