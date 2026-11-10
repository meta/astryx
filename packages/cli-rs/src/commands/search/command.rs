//! The `astryx search` command (`clients/cli/commands/search.mjs`).

use super::api;
use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out, Suggestion};
use crate::cli::format::{records, section, text, Block, Field, Fields};
use crate::json::Value;

/// JS `Number(string)`.
pub fn js_number(s: &str) -> f64 {
    let t = super::words::js_trim(s);
    if t.is_empty() {
        return 0.0;
    }
    let radix = |p: &str, r: u32| -> f64 {
        if p.is_empty() {
            return f64::NAN;
        }
        u128::from_str_radix(p, r).map(|v| v as f64).unwrap_or(f64::NAN)
    };
    if let Some(h) = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")) {
        return radix(h, 16);
    }
    if let Some(o) = t.strip_prefix("0o").or_else(|| t.strip_prefix("0O")) {
        return radix(o, 8);
    }
    if let Some(b) = t.strip_prefix("0b").or_else(|| t.strip_prefix("0B")) {
        return radix(b, 2);
    }
    match t {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    let ok = {
        let b = t.trim_start_matches(['+', '-']).as_bytes();
        let mut i = 0;
        let mut digits = 0;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
            digits += 1;
        }
        if i < b.len() && b[i] == b'.' {
            i += 1;
            while i < b.len() && b[i].is_ascii_digit() {
                i += 1;
                digits += 1;
            }
        }
        if digits > 0 && i < b.len() && (b[i] == b'e' || b[i] == b'E') {
            i += 1;
            if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
                i += 1;
            }
            let s = i;
            while i < b.len() && b[i].is_ascii_digit() {
                i += 1;
            }
            if i == s {
                return f64::NAN;
            }
        }
        digits > 0 && i == b.len() && t.matches(['+', '-']).count() <= 2
    };
    if !ok || t.starts_with("+-") || t.starts_with("-+") || t.starts_with("--") || t.starts_with("++") {
        return f64::NAN;
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

/// One shell word: the value when plain, else single-quoted.
fn shell_word(v: &str) -> String {
    let plain = !v.is_empty()
        && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || matches!(c, '@' | '.' | '/' | ':' | '-'));
    if plain {
        v.to_string()
    } else {
        format!("'{}'", v.replace('\'', "'\\''"))
    }
}

fn discover_hint(run: &str, query: &str, type_: Option<&str>) -> Vec<Block> {
    if type_ == Some("hook") {
        return Vec::new();
    }
    vec![text(&format!("More in packages you could add: {run} discover {}", shell_word(query)))]
}

pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    // Read-only: list each folder once (as the JS command's withListingCache).
    crate::discovery::listing_cache::with_listing_cache(|| run_uncached(inv, out))
}

fn run_uncached(inv: &Invocation, out: &mut Out) -> CmdResult {
    let json = inv.json();
    let query = inv.arg_list(0).join(" ");
    let cwd = inv.cwd.clone();
    if let Ok(project) = crate::discovery::project::Project::load(&cwd.to_string_lossy()) {
        crate::discovery::integration_warnings::warn_on_integration_issues(&project, json, out);
    }
    let limit = match inv.opt_str("limit") {
        Some(s) => Some(js_number(s)),
        None => Some(20.0),
    };
    let type_ = inv.opt_str("type").filter(|t| !t.is_empty());
    let result = match api::search(&query, &cwd, type_, limit, &inv.cli_root) {
        Ok(r) => r,
        Err(e) => {
            let sugg = e.suggestions.iter().map(|(n, r)| Suggestion::new(n.clone(), r.clone())).collect();
            return out.cli_error(&e.message, ErrorOpts::code(&e.code).suggestions(sugg));
        }
    };
    if json {
        out.json_out_response(&result);
        return Ok(());
    }
    let cwd_s = cwd.to_string_lossy().to_string();
    let run = crate::discovery::package_manager::get_cli_invocation(Some(&cwd_s));
    let data = &result["data"];
    let q = data["query"].as_str().unwrap_or("");
    let match_count = data["matchCount"].as_u64().unwrap_or(0) as usize;
    let results = data["results"].as_array().cloned().unwrap_or_default();
    let partial = result.get("meta").and_then(|m| m.get("partial"));
    if let Some(p) = partial {
        out.eprintln(&format!(
            "astryx: components, hooks, and templates were not searched: {}",
            p["reason"].as_str().unwrap_or("")
        ));
    }
    let note: Vec<Block> = if partial.is_some() {
        vec![text("Components, hooks, and templates need @astryxdesign/core, which could not be found (see the line above), so only the docs and themes were searched.")]
    } else {
        Vec::new()
    };
    if results.is_empty() {
        let mut blocks = vec![text(&format!("No results for \"{q}\"."))];
        blocks.extend(note.iter().cloned());
        blocks.push(text(&format!(
            "Try a broader term, or browse: {run} {}",
            if note.is_empty() { "component --list" } else { "docs" }
        )));
        blocks.extend(discover_hint(&run, q, type_));
        out.emit(&blocks);
        return Ok(());
    }
    let verbose = inv.flag("verbose");
    let mut fields = vec!["name", "section", "domain", "package", "title", "displayName", "kind", "deprecated"];
    if verbose {
        fields.extend(["score", "reason"]);
    }
    fields.extend(["import", "description", "command", "parent"]);
    let items: Vec<Fields> = results
        .iter()
        .map(|r| {
            fields
                .iter()
                .map(|k| {
                    let v = r.get(*k).unwrap_or(&Value::Null);
                    let empty = matches!(v, Value::Null) || v.as_str() == Some("") || v.as_array().is_some_and(|a| a.is_empty());
                    let f = if empty {
                        Field::Empty
                    } else {
                        match *k {
                            "command" | "parent" => Field::Str(crate::discovery::package_manager::format_cli_command(
                                &crate::cli::format::js_string(v),
                                Some(&cwd_s),
                            )),
                            "deprecated" => Field::Str(format!(
                                "use {}: {}",
                                v.get("replacement").map(js_or_undefined).unwrap_or_else(|| "undefined".into()),
                                v.get("description").map(js_or_undefined).unwrap_or_else(|| "undefined".into())
                            )),
                            _ => Field::from_json(v),
                        }
                    };
                    (k.to_string(), f)
                })
                .collect()
        })
        .collect();
    let heading = if match_count > results.len() {
        format!("Results for \"{q}\" ({} of {match_count})", results.len())
    } else {
        format!("Results for \"{q}\" ({})", results.len())
    };
    let mut blocks = vec![section(&heading, None), records(&items)];
    blocks.extend(note);
    blocks.extend(discover_hint(&run, q, type_));
    out.emit(&blocks);
    Ok(())
}

fn js_or_undefined(v: &Value) -> String {
    crate::cli::format::js_string(v)
}
