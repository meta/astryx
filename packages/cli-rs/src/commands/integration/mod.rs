//! `astryx integration add|check|verify|pack`
//! (`clients/cli/commands/integration.mjs`).

pub mod add;
pub mod add_helpers;
pub mod add_theme;
pub mod agent_docs;
pub mod check;
pub mod cli_requirement;
pub mod jsjson;
pub mod lines;
pub mod manifest_load;
pub mod manifest_writer;
pub mod pack;
pub mod semver;
pub mod theme_fresh;
pub mod verify;

#[cfg(test)]
mod writer_tests;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out, Suggestion};
use crate::cli::format::{json_fields, list, records, section, text, to_ascii, Block, Field};
use crate::json::Value;

/// `astryx integration add <kind> <name>`.
pub fn add(inv: &Invocation, out: &mut Out) -> CmdResult {
    let kind = inv.arg(0).unwrap_or("").to_string();
    let name = inv.arg(1).unwrap_or("").to_string();
    let opts = add::AddOptions {
        cwd: inv.cwd.clone(),
        dry_run: if inv.opts.contains_key("dryRun") { Some(inv.flag("dryRun")) } else { None },
        template_type: inv.opt_str("type").map(String::from),
        replaces: inv.opt_str("replaces").map(String::from),
        extends: inv.opt_str("extends").map(String::from),
        parent: inv.opt_str("parent").map(String::from),
        to: inv.opt_str("to").map(String::from),
        from: inv.opt_str("from").map(String::from),
    };
    let result = match add::integration_add(&kind, &name, &opts) {
        Ok(r) => r,
        Err(e) => {
            let mut eo = ErrorOpts::default();
            if let Some(c) = &e.code {
                eo.code = c.clone();
            }
            eo.suggestions = e.suggestions.iter().map(|(n, r)| Suggestion::new(n.clone(), r.clone())).collect();
            return out.cli_error(&e.message, eo);
        }
    };
    if inv.json() {
        out.json_out_response(&result);
        return Ok(());
    }
    let d = &result["data"];
    let dry = d["dryRun"].as_bool().unwrap_or(false);
    let written = d["written"].as_bool().unwrap_or(false);
    let state = if dry { "plan" } else if written { "ok" } else { "unchanged" };
    let heading = if dry {
        format!("{kind} contribution plan")
    } else if written {
        format!("{kind} contribution added")
    } else {
        format!("{kind} contribution unchanged")
    };
    let manifest = d["manifest"].as_str().unwrap_or("");
    let mut blocks = vec![section(&heading, None), text(&format!("[{state}] {}", d["name"].as_str().unwrap_or("")))];
    if d["root"].is_object() {
        let created = d["root"]["created"].as_bool().unwrap_or(false);
        blocks.push(text(&format!(
            "{} {kind} root {} in {manifest}.",
            if created { "Declare" } else { "Use" },
            d["root"]["path"].as_str().unwrap_or("")
        )));
    } else {
        blocks.push(text(&format!("Update {manifest}.")));
    }
    let files: Vec<String> = d["files"].as_array().map(|a| a.iter().filter_map(|f| f.as_str().map(String::from)).collect()).unwrap_or_default();
    if !files.is_empty() {
        blocks.push(list(&files));
    }
    out.emit(&blocks);
    Ok(())
}

/// The JS `list` for items given as arrays of lines.
fn list_lines(items: &[Vec<String>]) -> Block {
    let rendered: Vec<String> = items
        .iter()
        .map(|lines| {
            let mut out = vec![format!("- {}", lines.first().map(|s| s.as_str()).unwrap_or(""))];
            out.extend(lines.iter().skip(1).map(|l| format!("  {l}")));
            out.join("\n")
        })
        .collect();
    let multi = rendered.iter().any(|r| r.contains('\n'));
    Block(to_ascii(&rendered.join(if multi { "\n\n" } else { "\n" })))
}

fn format_cli(inv: &Invocation, cmd: &str) -> String {
    let sub = cmd.trim_start();
    let sub = sub.strip_prefix("astryx").map(|s| s.trim_start()).unwrap_or(sub).trim();
    crate::cli::env::format_cli_command_at(&inv.cwd, sub)
}

fn verify_package(inv: &Invocation, out: &mut Out) -> CmdResult {
    let result = verify::integration_pack_check(&inv.cwd);
    let d = &result["data"];
    if inv.json() {
        out.json_out_response(&result);
    } else {
        let packable = d["packable"].as_bool().unwrap_or(false);
        let identity: Vec<String> = [&d["name"], &d["version"]]
            .iter()
            .filter_map(|v| match v {
                Value::String(s) if !s.is_empty() => Some(s.clone()),
                _ => None,
            })
            .collect();
        let identity = identity.join("@");
        let mut blocks = vec![
            section(if packable { "Integration package ready" } else { "Integration package check failed" }, None),
            text(&format!("{} {}", if packable { "[ok]" } else { "[fail]" }, if identity.is_empty() { "local package" } else { &identity })),
        ];
        if d["tarball"].is_object() {
            blocks.push(text(&format!(
                "{} packed files; {}/{} required files present.",
                d["tarball"]["fileCount"], d["inventory"]["packedFiles"], d["inventory"]["expectedFiles"]
            )));
        }
        let local = &d["contributions"]["local"];
        let icon_sets = local.get("iconSets").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
        if local.is_object() && icon_sets > 0 {
            let n = |k: &str| local.get(k).and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
            let counts: Vec<String> = [("component", n("components")), ("template", n("templates")), ("theme", n("themes")), ("doc topic", n("docs")), ("codemod", n("codemods")), ("icon set", icon_sets)]
                .iter()
                .filter(|(_, c)| *c > 0)
                .map(|(w, c)| format!("{c} {w}{}", if *c == 1 { "" } else { "s" }))
                .collect();
            if !counts.is_empty() {
                blocks.push(text(&format!("Contributes {}.", counts.join(", "))));
            }
        }
        let issues = d["issues"].as_array().cloned().unwrap_or_default();
        if !issues.is_empty() {
            let items: Vec<Vec<String>> = issues
                .iter()
                .map(|i| {
                    let mut l = vec![format!(
                        "[{}] {}",
                        if i["severity"] == "error" { "fail" } else { "warn" },
                        crate::cli::format::js_string(&i["message"])
                    )];
                    if !matches!(i.get("file"), None | Some(Value::Null)) {
                        let line = match i.get("line") {
                            None | Some(Value::Null) => String::new(),
                            Some(v) => format!(":{}", crate::cli::format::js_string(v)),
                        };
                        l.push(format!("file: {}{line}", crate::cli::format::js_string(&i["file"])));
                    }
                    if !matches!(i.get("fix"), None | Some(Value::Null)) {
                        l.push(format!("fix: {}", crate::cli::format::js_string(&i["fix"])));
                    }
                    l
                })
                .collect();
            blocks.push(list_lines(&items));
        }
        out.emit(&blocks);
    }
    if d["packable"] != Value::Bool(true) {
        out.exit_code = 1;
    }
    Ok(())
}

/// `astryx integration verify`.
pub fn verify(inv: &Invocation, out: &mut Out) -> CmdResult {
    verify_package(inv, out)
}

/// `astryx integration pack` (deprecated alias of verify).
pub fn pack(inv: &Invocation, out: &mut Out) -> CmdResult {
    if !inv.flag("check") {
        let msg = format!(
            "`integration pack` is now `integration verify`: run `{}` to check the package the way npm will publish it. To build the tarball, run `npm pack`.",
            format_cli(inv, "integration verify")
        );
        return out.cli_error(&msg, ErrorOpts::code("ERR_INVALID_ARGUMENT"));
    }
    if !inv.json() {
        let msg = format!("Note: `integration pack --check` is deprecated. Run `{}`: it runs the same check.", format_cli(inv, "integration verify"));
        out.eprintln(&msg);
    }
    verify_package(inv, out)
}

/// `astryx integration check`.
pub fn check(inv: &Invocation, out: &mut Out) -> CmdResult {
    let strict = inv.flag("strict");
    let next = inv.flag("next");
    let responses = check::run_checks(&inv.cwd);
    let result = check::combine(responses, strict, next);
    let d = &result["data"];
    if inv.json() {
        out.json_out_response(&result);
    } else {
        let checks = d["checks"].as_array().cloned().unwrap_or_default();
        let no_package = checks
            .first()
            .and_then(|c| c["response"]["data"]["issues"].as_array())
            .map(|a| a.iter().any(|i| i["code"] == "no_package"))
            .unwrap_or(false);
        if no_package {
            out.emit(&[text("Nothing was checked: no package.json found. Run this command inside a package directory.")]);
        } else if d["validated"] != Value::Bool(true) {
            out.emit(&[text("Nothing was checked: no astryx.integration.* found next to package.json. Run this command in an integration package's folder.")]);
        } else {
            let mut seen = std::collections::HashSet::new();
            for (i, c) in checks.iter().enumerate() {
                if i > 0 {
                    out.emit(&[text("")]);
                }
                let blocks = crate::commands::doctor::integration::print_integration_check_response(&c["response"], &mut seen);
                out.emit(&blocks);
            }
        }
        let plural = |n: u64, w: &str| format!("{n} {w}{}", if n == 1 { "" } else { "s" });
        let errors = d["errors"].as_u64().unwrap_or(0);
        let warnings = d["warnings"].as_u64().unwrap_or(0);
        let skipped = d["skipped"].as_array().map(|a| a.len()).unwrap_or(0);
        let unchecked = d["unchecked"].as_u64().unwrap_or(0);
        let counts = format!("{}, {}, {skipped} skipped", plural(errors, "error"), plural(warnings, "warning"));
        let not_compared = if unchecked > 0 { format!(" {} could not be compared; the checks above list them.", plural(unchecked, "item")) } else { String::new() };
        let closing = if no_package {
            format!("[fail] {counts}. No package.json was found here, so nothing was checked.")
        } else if checks.iter().any(|c| c["failed"] == Value::Bool(true)) {
            format!("[fail] {counts}. Address the items marked [fail] above.")
        } else if d["failed"] == Value::Bool(true) {
            format!("[fail] {counts}. --strict fails on every warning and on skipped work; fix them, or drop --strict to fail only on errors.")
        } else if warnings > 0 || skipped > 0 {
            format!("[ok] {counts}. No check failed; review the warnings and skipped work above (--strict fails on them).{not_compared}")
        } else if !not_compared.is_empty() {
            format!("[ok] {counts}. No check failed.{not_compared}")
        } else {
            format!("[ok] {counts}. Every check passed.")
        };
        let identity = if no_package {
            "(no package.json)".to_string()
        } else if !d["version"].is_null() {
            format!("{}@{}", crate::cli::format::js_string(&d["name"]), crate::cli::format::js_string(&d["version"]))
        } else if d["name"].is_null() {
            "(local package)".to_string()
        } else {
            crate::cli::format::js_string(&d["name"])
        };
        let mut blocks = Vec::new();
        let failures = d["failures"].as_array().cloned().unwrap_or_default();
        if !failures.is_empty() {
            blocks.push(section("Failing under --strict", None));
            let items: Vec<_> = failures
                .iter()
                .map(|f| {
                    let mut fields = json_fields(f, Some(&["severity", "check", "code", "component", "prop", "file", "line"]));
                    fields[0].1 = Field::Str("[fail]".into());
                    fields
                })
                .collect();
            blocks.push(records(&items));
        }
        blocks.push(section(
            &format!(
                "Integration check: {identity}{}{}",
                if strict { " (strict)" } else { "" },
                if next { " (next)" } else { "" }
            ),
            None,
        ));
        let rows: Vec<_> = checks.iter().map(|c| json_fields(c, Some(&["check", "failed", "errors", "warnings", "skipped"]))).collect();
        blocks.push(records(&rows));
        blocks.push(text(&closing));
        let upcoming = d["upcoming"].as_u64().unwrap_or(0);
        if upcoming > 0 && !next {
            blocks.push(text(&format!(
                "{} above (the notes) will fail --strict from the next minor release. Fix {} ahead: {}",
                plural(upcoming, "finding"),
                if upcoming == 1 { "it" } else { "them" },
                format_cli(inv, "astryx integration check --strict --next")
            )));
        }
        out.emit(&blocks);
    }
    if d["failed"] == Value::Bool(true) {
        out.exit_code = 1;
    }
    Ok(())
}

#[cfg(test)]
mod pack_tests {
    #[test]
    fn matches_npm_pack() {
        let Ok(dir) = std::env::var("INTEGRATION_PACK_DIR") else { return };
        let dir = std::path::Path::new(&dir);
        let pkg = super::jsjson::parse(&std::fs::read_to_string(dir.join("package.json")).unwrap()).unwrap();
        let r = super::pack::npm_pack(dir, &pkg).unwrap();
        eprintln!("files={:?} size={} unpacked={} name={}", r.files, r.size, r.unpacked_size, r.filename);
    }

    /// Deflates every `*.bin` in INTEGRATION_GZIP_DIR at level 9 and writes
    /// `<name>.rs` beside it, for comparison with Node's zlib.gzipSync.
    #[test]
    fn gzip_corpus() {
        use std::io::Write;
        let Ok(dir) = std::env::var("INTEGRATION_GZIP_DIR") else { return };
        for e in std::fs::read_dir(&dir).unwrap().flatten() {
            let p = e.path();
            if p.extension().map(|x| x == "bin").unwrap_or(false) {
                let data = std::fs::read(&p).unwrap();
                let mut enc = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::new(9));
                enc.write_all(&data).unwrap();
                std::fs::write(p.with_extension("rs"), enc.finish().unwrap()).unwrap();
            }
        }
    }
}
