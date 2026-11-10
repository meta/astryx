//! `astryx discover`: browse the integrations a project has and could add.
//! Port of `clients/cli/commands/discover.mjs` and `api/discover/`.

pub mod api;
pub mod doc;
pub mod env;
pub mod model;
mod project;
pub mod scan;
pub mod sources;
pub mod util;
mod zodish;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out, Suggestion};
use crate::cli::format::{code, list, section, text, Block, Field, Fields};
use crate::json::{Map, Value};
use env::Env;
use model::OFFICIAL_SOURCE_NAME;

const MAX_ITEMS_SHOWN: usize = 10;
const ITEM_FIELDS: [&str; 7] = ["components", "templates", "docs", "themes", "codemods", "agentDocs", "iconSets"];

fn kind_plural(kind: &str) -> String {
    match kind {
        "component" => "components",
        "template" => "templates",
        "doc" => "docs",
        "theme" => "themes",
        "codemod" => "codemods",
        "agent-doc" => "agent docs",
        "icon-set" => "icon sets",
        other => other,
    }
    .to_string()
}

/// JS `Number(s)` for a CLI string.
fn js_number(s: &str) -> f64 {
    let t = s.trim_matches(|c: char| crate::cli::format::js_ws(c));
    if t.is_empty() {
        return 0.0;
    }
    let lower = t.to_ascii_lowercase();
    for (p, radix) in [("0x", 16), ("0o", 8), ("0b", 2)] {
        if let Some(r) = lower.strip_prefix(p) {
            if r.is_empty() || r.contains(['+', '-']) {
                return f64::NAN;
            }
            return u128::from_str_radix(r, radix).map(|n| n as f64).unwrap_or(f64::NAN);
        }
    }
    match t {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    let ok = t.bytes().all(|c| c.is_ascii_digit() || matches!(c, b'.' | b'e' | b'E' | b'+' | b'-'));
    if !ok || lower.contains("inf") || lower.contains("nan") {
        return f64::NAN;
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

/// What discover reads from the environment, through the discovery lane.
fn build_env(inv: &Invocation, out: &mut Out) -> Result<Env, String> {
    use crate::discovery::{package_manager, release};
    let cwd = inv.cwd.clone();
    let cwd_s = cwd.to_string_lossy().to_string();
    let add_verb = match package_manager::detect_package_manager(Some(&cwd_s)).as_str() {
        "pnpm" => "pnpm add",
        "yarn" => "yarn add",
        "bun" => "bun add",
        _ => "npm install",
    }
    .to_string();
    let outside = release::is_outside_project(&cwd_s);
    let loaded = crate::discovery::project::Project::load(&cwd_s);
    if let Ok(p) = &loaded {
        crate::discovery::integration_warnings::warn_on_integration_issues(p, inv.json(), out);
    }
    let project = project::from_project(loaded?);
    Ok(Env {
        cwd: cwd.clone(),
        cli_root: inv.cli_root.clone(),
        run: package_manager::get_cli_invocation(Some(&cwd_s)),
        add_verb: add_verb.clone(),
        outside_project: outside,
        project: Some(project),
        // `projectAddCommand(cwd)`: none outside a project's own folder.
        project_add_verb: match crate::cli::nudge::install_folder(&cwd) {
            Some((_, false)) => Some(add_verb),
            _ => None,
        },
        cache_dir: std::path::PathBuf::from(release::user_cache_dir()),
    })
}


pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let query = inv.arg(0);
    if query == Some("") {
        return out.cli_error(
            "Argument <query> is an empty string. An empty argument is not the same as an omitted one, and ignoring it would silently discard the rest of the command: pass a value, or leave <query> out of `astryx discover` entirely.",
            ErrorOpts::code("ERR_INVALID_ARGUMENT"),
        );
    }
    let env = build_env(inv, out);
    let queries = env.as_ref().map(api::answers_queries).unwrap_or(true);
    let options = api::Options {
        components: inv.flag("components"),
        type_: inv.opt_str("type").map(String::from),
        installed: inv.flag("installed"),
        available: inv.flag("available"),
        limit: inv.opt_str("limit").map(js_number),
        limit_raw: inv.opt_str("limit").map(String::from),
        lang: inv.globals.lang.clone(),
        zh: inv.globals.zh,
    };
    // discover() checks its options before it loads the project.
    if let Err(e) = api::check_options(&options, &api::kinds_for_check(env.as_ref().ok(), &options)) {
        let s = e.suggestions.into_iter().map(|(n, r)| Suggestion::new(n, r)).collect();
        return out.cli_error(&e.message, ErrorOpts::code(e.code).suggestions(s));
    }
    // Project.load failing is the API's own failure: it has no code.
    let env = match env {
        Ok(e) => e,
        Err(message) => return out.cli_error(&message, ErrorOpts::code("ERR_UNKNOWN")),
    };
    let result = match api::discover(&env, query, &options) {
        Ok(r) => r,
        Err(e) => {
            let s = e.suggestions.into_iter().map(|(n, r)| Suggestion::new(n, r)).collect();
            return out.cli_error(&e.message, ErrorOpts::code(e.code).suggestions(s));
        }
    };
    if inv.json() {
        // A doc page carries the module's values: JSON.stringify drops
        // undefined and functions.
        let result = crate::js::to_json_data(&result).unwrap_or(result);
        out.json_out_response(&result);
        return Ok(());
    }
    let blocks = render(&env, &result, query, &options, queries, &inv.globals.detail);
    out.emit(&blocks);
    Ok(())
}

fn str_of<'a>(m: &'a Map<String, Value>, k: &str) -> Option<&'a str> {
    m.get(k).and_then(|v| v.as_str())
}

fn summary(names: &[Value]) -> String {
    let all: Vec<String> = names.iter().map(crate::cli::format::js_string).collect();
    let shown = all.iter().take(MAX_ITEMS_SHOWN).cloned().collect::<Vec<_>>().join(", ");
    if all.len() > MAX_ITEMS_SHOWN {
        format!("{shown}, +{} more", all.len() - MAX_ITEMS_SHOWN)
    } else {
        shown
    }
}

/// `record(obj, {omit, format: itemListOptions(full)})` as Fields.
fn fields(obj: &Map<String, Value>, omit: &[&str], full: bool) -> Fields {
    obj.iter()
        .filter(|(k, _)| !omit.contains(&k.as_str()))
        .map(|(k, v)| {
            let f = match v {
                Value::Array(a) if !full && ITEM_FIELDS.contains(&k.as_str()) => {
                    if a.is_empty() {
                        Field::Empty
                    } else {
                        Field::Str(summary(a))
                    }
                }
                other => Field::from_json(other),
            };
            (k.clone(), f)
        })
        .collect()
}

fn records_of(items: &[Value], full: bool) -> Block {
    let fs: Vec<Fields> = items.iter().filter_map(|v| v.as_object()).map(|o| fields(o, &[], full)).collect();
    crate::cli::format::records(&fs)
}

fn source_notes(sources: &[Value]) -> Vec<Block> {
    sources
        .iter()
        .filter_map(|s| s.as_object())
        .filter(|s| str_of(s, "status") != Some("fresh"))
        .map(|s| {
            let from = str_of(s, "from").unwrap_or("");
            let error = s.get("error").map(crate::cli::format::js_string).unwrap_or_else(|| "undefined".into());
            if str_of(s, "status") == Some("saved") {
                text(&format!(
                    "The discover source from {from} did not answer ({error}), so this uses the copy saved {}.",
                    str_of(s, "savedAt").unwrap_or("")
                ))
            } else {
                text(&format!("The discover source from {from} is unavailable: {error}"))
            }
        })
        .collect()
}

fn source_subtitle(sources: &[Value]) -> Option<String> {
    let answered: Vec<&Map<String, Value>> =
        sources.iter().filter_map(|s| s.as_object()).filter(|s| str_of(s, "status") != Some("failed")).collect();
    if answered.is_empty() {
        return None;
    }
    Some(format!(
        "from {}",
        answered
            .iter()
            .map(|s| {
                let name = str_of(s, "name").unwrap_or("");
                match str_of(s, "generatedAt").filter(|g| !g.is_empty()) {
                    Some(g) => format!("{name} ({})", util::slice16(g, 10)),
                    None => name.to_string(),
                }
            })
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

fn version_lines(versions: &[Value], shown: Option<&str>, installed: Option<&str>, latest: Option<&str>) -> Vec<String> {
    versions
        .iter()
        .filter_map(|v| v.as_object())
        .filter(|v| v.get("prerelease") != Some(&Value::Bool(true)) || str_of(v, "version") == shown)
        .map(|v| {
            let ver = str_of(v, "version");
            let mut tags: Vec<String> = vec![];
            if ver == latest && latest.is_some() {
                tags.push("latest".into());
            }
            if ver == installed && installed.is_some() {
                tags.push("installed".into());
            }
            if shown.is_some() && ver == shown && ver != installed && ver != latest {
                tags.push("shown".into());
            }
            let status = v.get("status").map(crate::cli::format::js_string).unwrap_or_default();
            if status != "ok" && !status.is_empty() {
                tags.push(status);
            }
            let date = match str_of(v, "publishedAt") {
                Some(p) if !p.is_empty() => util::slice16(p, 10),
                _ => "date unknown".into(),
            };
            let tail = if tags.is_empty() { String::new() } else { format!("  {}", tags.join(", ")) };
            format!("{}  {date}{tail}", ver.unwrap_or(""))
        })
        .collect()
}

fn adds_more_than_themes(entry: &Map<String, Value>) -> bool {
    ITEM_FIELDS
        .iter()
        .any(|f| *f != "themes" && entry.get(*f).and_then(|v| v.as_array()).map(|a| !a.is_empty()).unwrap_or(false))
}

/// `pinNote(install, shown, source)`.
fn pin_note(install: &str, shown: Option<&str>, source: Option<&str>) -> Option<String> {
    if source != Some(OFFICIAL_SOURCE_NAME) {
        return None;
    }
    // /\S@([\d^~<>=*xXv][^"]*)"?$/u
    let pin = pin_of(install)?;
    if Some(pin.as_str()) == shown {
        return None;
    }
    Some(if util::is_valid_semver(&pin) {
        format!("This installs {pin}, the version that matches this project's Core.")
    } else {
        format!("This installs the newest release in {pin}, the Core range this project declares.")
    })
}

fn pin_of(install: &str) -> Option<String> {
    let chars: Vec<char> = install.chars().collect();
    // Leftmost match wins: scan for `\S@` followed by the class.
    for i in 1..chars.len() {
        if chars[i] != '@' || chars[i - 1].is_whitespace() {
            continue;
        }
        let Some(&first) = chars.get(i + 1) else { continue };
        if !(first.is_ascii_digit() || "^~<>=*xXv".contains(first)) {
            continue;
        }
        // [^"]* greedy, then "?$
        let mut j = i + 2;
        while j < chars.len() && chars[j] != '"' {
            j += 1;
        }
        let rest: String = chars[j..].iter().collect();
        if rest.is_empty() || rest == "\"" {
            return Some(chars[i + 1..j].iter().collect());
        }
    }
    None
}

fn add_blocks(install: &str, themes: &[String], adds_other: bool, run: &str, note: Option<String>) -> Vec<Block> {
    let mut b = vec![section("Add it", None), code(install)];
    if let Some(n) = note {
        b.push(text(&n));
    }
    if !themes.is_empty() {
        b.push(text(if themes.len() == 1 { "Then use its theme:" } else { "Then use one of its themes:" }));
        b.push(code(&themes.iter().map(|s| format!("{run} theme add {s}")).collect::<Vec<_>>().join("\n")));
    }
    if adds_other || themes.is_empty() {
        b.push(text("Astryx loads an integration on the next command once it is a dependency."));
    }
    b
}

fn render(env: &Env, result: &Value, query: Option<&str>, options: &api::Options, queries: bool, detail: &str) -> Vec<Block> {
    let run = env.run.as_str();
    let kind = result.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let empty = Map::new();
    match kind {
        "discover.list" => {
            let data = result["data"].as_array().cloned().unwrap_or_default();
            let meta = result.get("meta").and_then(|m| m.as_object()).unwrap_or(&empty);
            let available = meta.get("available").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let sources = meta.get("sources").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let kind_p = options.type_.as_deref().map(kind_plural);
            let mut blocks = vec![];
            if !options.available {
                blocks.push(section("Installed", None));
                blocks.push(if !data.is_empty() {
                    records_of(&data, options.components)
                } else {
                    text(&match &kind_p {
                        Some(k) => format!("None of this project's integrations add {k}."),
                        None if meta.get("configured") == Some(&Value::Bool(true)) => {
                            "No external components found in configured integrations.".into()
                        }
                        None => "None yet.".into(),
                    })
                });
            }
            if !options.installed {
                let sub = source_subtitle(&sources);
                blocks.push(section("Available", sub.as_deref()));
                blocks.push(if !available.is_empty() {
                    records_of(&available, options.components)
                } else {
                    let any = sources.iter().any(|s| s.get("status").and_then(|v| v.as_str()) != Some("failed"));
                    text(&if !any {
                        "No source answered, so there is nothing to list.".to_string()
                    } else if let Some(k) = &kind_p {
                        format!("No package you could add adds {k}.")
                    } else {
                        "Nothing new to add: this project has every integration its sources list.".to_string()
                    })
                });
            }
            blocks.extend(source_notes(&sources));
            if !queries {
                if let Some(q) = query.filter(|q| !q.trim().is_empty()) {
                    blocks.push(text(&format!(
                        "This project loads no integration and has no discover source of its own, so discover lists everything instead of answering \"{q}\"."
                    )));
                }
                let themes: Vec<String> = available
                    .iter()
                    .filter_map(|e| e.get("themes").and_then(|t| t.as_array()))
                    .flatten()
                    .map(crate::cli::format::js_string)
                    .collect();
                let mut lines = vec!["To add a package, run its install command.".to_string()];
                if let Some(t) = themes.first() {
                    lines.push(format!("Then use a theme it adds: {run} theme add <theme>, for example {run} theme add {t}"));
                }
                blocks.push(text(&lines.join("\n")));
            } else {
                blocks.push(text(
                    &[
                        "Usage:".to_string(),
                        format!("  {run} discover <package>            Browse a package and its versions"),
                        format!("  {run} discover <package>/<item>     View one item"),
                        format!("  {run} discover <search>             Search every item and package"),
                    ]
                    .join("\n"),
                ));
            }
            blocks
        }
        "discover.detail" => {
            let d = result["data"].as_object().unwrap_or(&empty);
            let mut blocks = vec![crate::cli::format::record(&fields(d, &["versions", "install"], true))];
            let versions = d.get("versions").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let name = str_of(d, "name").unwrap_or("");
            if !versions.is_empty() {
                let shown = str_of(d, "version");
                let installed = if d.get("installed") == Some(&Value::Bool(true)) {
                    str_of(d, "installedVersion").or(shown)
                } else {
                    None
                };
                let lines = version_lines(&versions, shown, installed, str_of(d, "latest"));
                let pre = versions
                    .iter()
                    .filter(|v| v.get("prerelease") == Some(&Value::Bool(true)) && v.get("version").and_then(|x| x.as_str()) != shown)
                    .count();
                blocks.push(section("Versions", Some(&format!("{} known, newest first", versions.len()))));
                if !lines.is_empty() {
                    blocks.push(list(&lines));
                }
                if pre > 0 {
                    let lead = if pre == 1 { "1 prerelease is".to_string() } else { format!("{pre} prereleases are") };
                    blocks.push(text(&format!("{lead} not listed. See any version: {run} discover {name}@<version>")));
                }
            }
            if let Some(install) = str_of(d, "install").filter(|s| !s.is_empty()) {
                let themes: Vec<String> = d
                    .get("themes")
                    .and_then(|t| t.as_array())
                    .map(|a| a.iter().map(crate::cli::format::js_string).collect())
                    .unwrap_or_default();
                blocks.extend(add_blocks(
                    install,
                    &themes,
                    adds_more_than_themes(d),
                    run,
                    pin_note(install, str_of(d, "version"), str_of(d, "source")),
                ));
            } else if let Some(a) = str_of(d, "installedAs").filter(|s| !s.is_empty()) {
                blocks.push(text(&format!("This project already has this integration as {a}.")));
            }
            let has_components = d.get("components").and_then(|c| c.as_array()).map(|a| !a.is_empty()).unwrap_or(false);
            blocks.push(text(&if d.get("installed") == Some(&Value::Bool(true)) && has_components {
                format!("Usage: {run} discover {name}/<ComponentName>")
            } else {
                format!("See one item: {run} discover {name}/<item>")
            }));
            blocks
        }
        "discover.detail.doc" => {
            use crate::commands::component::format::{format_brief, format_compact, format_full};
            let docs = &result["data"];
            let name = docs.get("name").map(crate::cli::format::js_string).unwrap_or_default();
            let md = match detail {
                "brief" => format_brief(docs, &name, Some(""), None),
                "compact" => format_compact(docs, &name, Some(""), run),
                _ => format_full(docs, None, None, run),
            };
            let pkg = result.get("package").map(crate::cli::format::js_string).unwrap_or_default();
            vec![crate::cli::format::record(&vec![("package".to_string(), Field::Str(pkg))]), code(&md)]
        }
        "discover.item" => {
            let d = result["data"].as_object().unwrap_or(&empty);
            let mut blocks = vec![crate::cli::format::record(&fields(d, &["install"], true))];
            if let Some(install) = str_of(d, "install").filter(|s| !s.is_empty()) {
                let is_theme = str_of(d, "kind") == Some("theme");
                let themes = if is_theme { vec![str_of(d, "name").unwrap_or("").to_string()] } else { vec![] };
                blocks.extend(add_blocks(install, &themes, !is_theme, run, pin_note(install, str_of(d, "version"), str_of(d, "source"))));
            }
            blocks.push(text(&format!("Its package: {run} discover {}", str_of(d, "package").unwrap_or(""))));
            blocks
        }
        "discover.search" => {
            let d = result["data"].as_object().unwrap_or(&empty);
            let matches = d.get("matches").and_then(|m| m.as_array()).cloned().unwrap_or_default();
            let total = d.get("total").and_then(|t| t.as_f64());
            let count = total.map(|t| t as usize).unwrap_or(matches.len());
            let q = str_of(d, "query").unwrap_or("");
            let sub = total.map(|_| format!("showing the first {}", matches.len()));
            let lines: Vec<String> = matches
                .iter()
                .filter_map(|m| m.as_object())
                .map(|m| {
                    let k = str_of(m, "kind").unwrap_or("");
                    let pkg = str_of(m, "package").unwrap_or("");
                    let target =
                        if k == "package" { pkg.to_string() } else { format!("{pkg}/{}", str_of(m, "component").unwrap_or("")) };
                    let mut tags = vec![];
                    if !k.is_empty() && k != "component" {
                        tags.push(k.to_string());
                    }
                    if m.get("installed") == Some(&Value::Bool(false)) {
                        tags.push("not installed".into());
                    }
                    let tail = if tags.is_empty() { String::new() } else { format!("  ({})", tags.join(", ")) };
                    format!("{run} discover {target}{tail}")
                })
                .collect();
            vec![
                section(&format!("Found {count} {} for \"{q}\"", if count == 1 { "match" } else { "matches" }), sub.as_deref()),
                list(&lines),
            ]
        }
        _ => vec![],
    }
}
