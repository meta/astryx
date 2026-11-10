//! `astryx docs` (clients/cli/commands/docs.mjs over api/docs).

pub mod api;
pub mod model;
pub mod runtime;
pub mod sections;
pub mod text;

pub use runtime::{link_resolver, LinkResolver};

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out, Suggestion};
use crate::json::Value;
use std::path::Path;

/// `docPackageManager(cwd)`: the package manager a doc's `{@pm}` steps
/// render for.
pub fn doc_package_manager(cwd: &Path) -> String {
    crate::discovery::package_manager::doc_package_manager(Some(&cwd.to_string_lossy()))
}

/// The parsed command line.
struct Parsed {
    topic: Option<String>,
    section: Option<String>,
    index: bool,
    full: bool,
    depth: Option<String>,
    /// `program.getOptionValueSource('detail') !== 'default'`.
    detail_given: bool,
}

fn parse(inv: &Invocation) -> (Parsed, crate::cli::command::Globals) {
    (
        Parsed {
            topic: inv.arg(0).map(String::from),
            section: inv.arg(1).map(String::from),
            index: inv.flag("index"),
            full: inv.flag("full"),
            depth: inv.opt_str("depth").map(String::from),
            detail_given: inv.global_opt_source("detail").map(|s| s != "default").unwrap_or(false),
        },
        inv.globals.clone(),
    )
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
