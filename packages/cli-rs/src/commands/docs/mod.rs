//! `astryx docs` (clients/cli/commands/docs.mjs over api/docs).

pub mod api;
pub mod model;
pub mod runtime;
pub mod sections;
pub mod suggest;
pub mod text;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, OptSource, Out, Suggestion};
use crate::json::Value;
use std::path::Path;

/// `docPackageManager(cwd)`: the package manager a doc's `{@pm}` steps
/// render for.
pub fn doc_package_manager(cwd: &Path) -> String {
    crate::discovery::package_manager::doc_package_manager(Some(&cwd.to_string_lossy()))
}

/// The parsed command line. TEMP: read from the shell's parse once it fills
/// `args`/`opts`; until then parsed here from the raw operands.
struct Parsed {
    topic: Option<String>,
    section: Option<String>,
    index: bool,
    full: bool,
    depth: Option<String>,
    detail_given: bool,
}

fn parse(inv: &Invocation) -> (Parsed, crate::cli::command::Globals) {
    let mut g = inv.globals.clone();
    if !inv.args.is_empty() || !inv.opts.is_empty() {
        return (
            Parsed {
                topic: inv.arg(0).map(String::from),
                section: inv.arg(1).map(String::from),
                index: inv.flag("index"),
                full: inv.flag("full"),
                depth: inv.opt_str("depth").map(String::from),
                // TEMP: the shell does not say where a global option's value
                // came from yet (`program.getOptionValueSource('detail')`).
                detail_given: matches!(inv.opt_sources.get("detail"), Some(OptSource::Cli))
                    || inv.argv.iter().any(|a| a == "--detail" || a.starts_with("--detail=")),
            },
            g,
        );
    }
    let mut p = Parsed { topic: None, section: None, index: false, full: false, depth: None, detail_given: false };
    let mut pos = Vec::new();
    let mut it = inv.extra_args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--index" => p.index = true,
            "--full" => p.full = true,
            "--depth" => p.depth = it.next().cloned(),
            "--json" => g.json = true,
            "--dense" => g.dense = true,
            "--zh" => g.zh = true,
            "--lang" => g.lang = it.next().cloned(),
            "--detail" => {
                g.detail = it.next().cloned().unwrap_or_default();
                p.detail_given = true;
            }
            x if x.starts_with("--depth=") => p.depth = Some(x[8..].to_string()),
            x if x.starts_with("--lang=") => g.lang = Some(x[7..].to_string()),
            x if x.starts_with("--detail=") => {
                g.detail = x[9..].to_string();
                p.detail_given = true;
            }
            x => pos.push(x.to_string()),
        }
    }
    p.topic = pos.first().cloned();
    p.section = pos.get(1).cloned();
    (p, g)
}

fn suggestions(s: Vec<(String, String)>) -> Vec<Suggestion> {
    s.into_iter().map(|(n, r)| Suggestion::new(n, r)).collect()
}

pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let (p, g) = parse(inv);
    let run = crate::cli::env::cli_invocation(&inv.cwd);
    let ctx = text::Ctx { run: run.clone() };
    let lang = g.lang.clone().filter(|l| !l.is_empty());
    let detail = if g.detail.is_empty() { "full".to_string() } else { g.detail.clone() };
    if p.index && p.full {
        return out.cli_error(
            "Ask for the section list or the whole topic, not both: --index and --full cannot both be set.",
            ErrorOpts::code("ERR_INVALID_ARGUMENT"),
        );
    }
    let depth: Option<Option<u64>> = match &p.depth {
        None => None,
        Some(d) if d == "all" => Some(None),
        Some(d) if !d.is_empty() && d.chars().all(|c| c.is_ascii_digit()) => Some(Some(d.parse::<f64>().unwrap_or(f64::MAX) as u64)),
        Some(d) => {
            return out.cli_error(&format!("--depth takes a number of levels (0, 1, 2, ...) or all, not \"{d}\"."), ErrorOpts::code("ERR_INVALID_ARGUMENT"));
        }
    };
    let child_detail = if p.detail_given { detail.clone() } else { "brief".to_string() };
    let list_sections = p.index || (!g.json && !p.full && !g.dense && lang.as_deref() != Some("dense") && p.section.is_none());
    let pm = doc_package_manager(&inv.cwd);
    crate::discovery::doc_compiler::links::set_doc_pm(&pm);
    let mut docs = api::Docs::load_project(&pm, &inv.cwd.to_string_lossy());
    let base = api::DocsOptions { lang: lang.clone(), zh: g.zh, dense: g.dense, ..Default::default() };
    let opts = api::DocsOptions {
        index: list_sections,
        depth,
        detail: if depth.is_some() { Some(child_detail.clone()) } else { None },
        ..base.clone()
    };
    let fmt = |c: &str| ctx.format_cli_command(c);
    docs.set_command_format(&fmt);
    let result = docs.docs(p.topic.as_deref(), p.section.as_deref(), &opts, &fmt).and_then(|r| {
        if !p.index && r["type"] == "docs.index" && r["data"]["sections"].as_array().map(|a| a.len()).unwrap_or(0) <= 1 {
            docs.docs(p.topic.as_deref(), p.section.as_deref(), &base, &fmt)
        } else {
            Ok(r)
        }
    });
    let result = match result {
        Ok(r) => r,
        Err(e) => {
            let mut o = ErrorOpts::code(e.code);
            o.suggestions = suggestions(e.suggestions);
            return out.cli_error(&e.message, o);
        }
    };
    if g.json {
        out.json_out_response(&result);
        return Ok(());
    }
    let pkg = result["package"].as_str().unwrap_or("").to_string();
    let blocks = match result["type"].as_str().unwrap_or("") {
        "docs.list" => text::emit_list(&ctx, &result),
        "docs.index" => text::emit_index(&ctx, &result["data"], &pkg),
        "docs.detail" => text::emit_detail(&ctx, &result["data"], &pkg, &detail),
        "docs.detail.section" => text::emit_section(&ctx, &result["data"], &pkg, &detail),
        "docs.node" => {
            if depth.is_some() {
                text::emit_tree(&ctx, &result["data"], &detail, &child_detail)
            } else {
                text::emit_node(&ctx, &result["data"], &detail)
            }
        }
        _ => vec![],
    };
    out.emit(&blocks);
    let _ = Value::Null;
    Ok(())
}
