//! `astryx build` (clients/cli/commands/build.mjs and api/build/): the
//! playbook with no query, else the page template to start from and the kit
//! around it.

pub mod answer;
pub mod blocks;
pub mod env;
pub mod help;
pub mod js;
pub mod kind;
pub mod rank;
pub mod signals;
pub mod start;
pub mod vocab;
pub mod weights;
pub mod words;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out};
use crate::cli::format::{self, list, records, section, text, Block, Field, Fields};
use crate::json::Value;
use signals::{BuildEnv, BuildError};
use std::collections::HashMap;
use std::path::Path;

/// `Number(s)` for a string, as JS converts it.
pub fn js_to_number(s: &str) -> f64 {
    let t = s.trim_matches(|c: char| format::js_ws(c) || c == '\u{2028}' || c == '\u{2029}');
    if t.is_empty() {
        return 0.0;
    }
    let radix = |p: &str, r: u32| -> f64 {
        if p.is_empty() || !p.chars().all(|c| c.is_digit(r)) {
            return f64::NAN;
        }
        p.chars().fold(0.0, |a, c| a * r as f64 + c.to_digit(r).unwrap() as f64)
    };
    let lower2 = t.get(..2).map(|x| x.to_ascii_lowercase());
    match lower2.as_deref() {
        Some("0x") => return radix(&t[2..], 16),
        Some("0o") => return radix(&t[2..], 8),
        Some("0b") => return radix(&t[2..], 2),
        _ => {}
    }
    let (sign, body) = match t.as_bytes()[0] {
        b'+' => (1.0, &t[1..]),
        b'-' => (-1.0, &t[1..]),
        _ => (1.0, t),
    };
    if body == "Infinity" {
        return sign * f64::INFINITY;
    }
    // StrDecimalLiteral: digits [. digits] [e[+-]digits], or . digits ...
    let b = body.as_bytes();
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
    if digits == 0 {
        return f64::NAN;
    }
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        i += 1;
        if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
            i += 1;
        }
        let st = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == st {
            return f64::NAN;
        }
    }
    if i != b.len() {
        return f64::NAN;
    }
    sign * body.parse::<f64>().unwrap_or(f64::NAN)
}

/// Run a build: `build(query, {cwd, type, limit})` with a query.
pub fn build_kit(query: &str, kind: Option<&str>, limit: f64, env: &dyn BuildEnv) -> Result<Value, BuildError> {
    if !(limit.is_finite() && limit.fract() == 0.0) || limit <= 0.0 {
        return Err(BuildError {
            message: format!("Invalid limit \"{}\". Must be a positive integer.", crate::json::js_number_to_string(limit)),
            code: "ERR_INVALID_ARGUMENT".into(),
            suggestions: Vec::new(),
        });
    }
    // The root classifier has one class: every request goes to `main`.
    let sig = signals::kit_signals(query, kind, limit, env)?;
    match env.block_picker() {
        None => Ok(answer::kit_answer(&sig, None, &HashMap::new())),
        Some(w) => {
            let input = blocks::PickInput {
                kit_blocks: &sig.kit_blocks,
                searched: &sig.searched,
                foreign: &sig.foreign,
                catalog: &sig.catalog,
                components: &sig.components,
            };
            let (names, entries) = blocks::pick_blocks(query, &input, w);
            Ok(answer::kit_answer(&sig, Some(&names), &entries))
        }
    }
}

/// `formatCliCommand(command)` for the run's folder.
fn fcc(cwd: &Path, cmd: &str) -> String {
    crate::discovery::package_manager::format_cli_command(cmd, cwd.to_str())
}

const SEARCH_ONLY_TYPES: &[&str] = &["doc", "theme"];

fn point_to_search(out: &mut Out, cwd: &Path, kind: Option<&str>, json: bool) {
    let Some(t) = kind else { return };
    if json || !SEARCH_ONLY_TYPES.contains(&t) {
        return;
    }
    let cmd = fcc(cwd, &format!("search <query> --type {t}"));
    out.eprintln(&format!("Note: a build kit has no {t}s. Find them with `{cmd}`."));
}

/// How a record field renders.
#[derive(Clone, Copy, PartialEq)]
enum Fmt {
    Plain,
    Command,
    FirstSentence,
    Deprecation,
}

fn field_of(v: Option<&Value>, fmt: Fmt, cwd: &Path) -> Field {
    let Some(v) = v else { return Field::Empty };
    let raw = Field::from_json(v);
    let empty = match &raw {
        Field::Empty => true,
        Field::Str(s) => s.is_empty(),
        Field::List(l) => l.is_empty(),
    };
    if empty || fmt == Fmt::Plain {
        return raw;
    }
    let s = format::js_string(v);
    Field::Str(match fmt {
        Fmt::Command => fcc(cwd, &s),
        Fmt::FirstSentence => answer::first_sentence(&s),
        Fmt::Deprecation => {
            let g = |k: &str| v.get(k).map(format::js_string).unwrap_or_else(|| "undefined".into());
            format::format_deprecation(&g("replacement"), &g("description"))
        }
        Fmt::Plain => unreachable!(),
    })
}

fn rec(v: &Value, fields: &[(&str, Fmt)], cwd: &Path) -> Fields {
    fields.iter().map(|(k, f)| (k.to_string(), field_of(v.get(*k), *f, cwd))).collect()
}

fn recs(items: &[Value], fields: &[(&str, Fmt)], cwd: &Path) -> Block {
    records(&items.iter().map(|v| rec(v, fields, cwd)).collect::<Vec<_>>())
}

fn arr(v: &Value, k: &str) -> Vec<Value> {
    v.get(k).and_then(|x| x.as_array()).cloned().unwrap_or_default()
}

fn st(v: &Value, k: &str) -> String {
    v.get(k).map(format::js_string).unwrap_or_default()
}

fn print_playbook(out: &mut Out, playbook: &Value, cwd: &Path) {
    let cmd = [("command", Fmt::Command), ("purpose", Fmt::Plain)];
    let steps = arr(playbook, "steps");
    let mut blocks = vec![section(&st(playbook, "title"), None)];
    for (i, step) in steps.iter().enumerate() {
        blocks.push(section(&format!("{}. {}", i + 1, st(step, "title")), None));
        blocks.push(recs(&arr(step, "commands"), &cmd, cwd));
        if let Some(r) = step.get("returns").and_then(|x| x.as_str()).filter(|s| !s.is_empty()) {
            blocks.push(format::record(&[("returns".to_string(), Field::Str(r.to_string()))]));
        }
    }
    blocks.push(section(&format!("{}. Rules (keep it on-system)", steps.len() + 1), None));
    let rules: Vec<String> = arr(playbook, "rules").iter().map(format::js_string).collect();
    blocks.push(list(&rules));
    let related = arr(playbook, "related");
    if !related.is_empty() {
        blocks.push(section("Related", None));
        blocks.push(recs(&related, &cmd, cwd));
    }
    out.emit(&blocks);
}

/// The `build` handler.
pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    // Read-only: list each folder once (as the JS command's withListingCache).
    crate::discovery::listing_cache::with_listing_cache(|| run_uncached(inv, out))
}

fn run_uncached(inv: &Invocation, out: &mut Out) -> CmdResult {
    let cwd = inv.cwd.clone();
    let json = inv.json();
    let kind = inv.opt_str("type");
    let query = inv.arg(0);
    if query.map(|q| super::build::words::js_trim(q).is_empty()).unwrap_or(true) {
        let result = help::build_help();
        point_to_search(out, &cwd, kind, json);
        if json {
            out.json_out_response(&result);
            return Ok(());
        }
        print_playbook(out, &result["data"], &cwd);
        return Ok(());
    }
    let query = query.unwrap();
    let limit = inv.opt_str("limit").map(js_to_number).unwrap_or(60.0);
    let env = env::RealEnv::new(inv);
    let result = match build_kit(query, kind, limit, &env) {
        Ok(r) => r,
        Err(e) => {
            let mut o = ErrorOpts::code(&e.code);
            o.suggestions = e.suggestions;
            return out.cli_error(&e.message, o);
        }
    };
    if json {
        out.json_out_response(&result);
        return Ok(());
    }
    point_to_search(out, &cwd, kind, json);
    render_kit(out, &result["data"], inv.flag("verbose"), &cwd);
    Ok(())
}

fn render_kit(out: &mut Out, d: &Value, verbose: bool, cwd: &Path) {
    let fcmd = |c: &str| fcc(cwd, c);
    let q = st(d, "query");
    let has_results = d.get("hasResults").and_then(|x| x.as_bool()).unwrap_or(false);
    let start = d.get("start").filter(|s| !s.is_null());
    if !has_results && start.is_none() {
        let run = crate::discovery::package_manager::get_cli_invocation(cwd.to_str());
        out.emit(&[
            text(&format!("No matches for \"{q}\".")),
            text(&format!("Try a broader term, or browse: {run} component --list")),
        ]);
        return;
    }
    use Fmt::*;
    let full: &[(&str, Fmt)] = &[
        ("name", Plain),
        ("package", Plain),
        ("domain", Plain),
        ("displayName", Plain),
        ("deprecated", Deprecation),
        ("score", Plain),
        ("reason", Plain),
        ("import", Plain),
        ("description", Plain),
        ("command", Command),
    ];
    let brief = |fields: &[&'static str]| -> Vec<(&'static str, Fmt)> {
        fields
            .iter()
            .map(|f| {
                (*f, match *f {
                    "command" => Command,
                    "description" => FirstSentence,
                    "deprecated" => Deprecation,
                    _ => Plain,
                })
            })
            .collect()
    };
    const TOP: usize = 3;
    let shown = |items: &[Value]| -> Vec<Value> { if verbose { items.to_vec() } else { items.iter().take(TOP).cloned().collect() } };
    let more = |items: &[Value]| -> String {
        if !verbose && items.len() > TOP {
            format!(" (top {TOP} of {}; --verbose for all)", items.len())
        } else {
            String::new()
        }
    };
    let mut o: Vec<Block> = vec![
        section(&format!("Build kit for \"{q}\""), None),
        text(if start.is_some() {
            "Start from the TEMPLATE, fill it with BLOCKS, and use COMPONENTS only for what is left.\nChanging a page you already have? Keep it, and use only the blocks and components."
        } else {
            "This kit is narrowed by --type, so it names no template."
        }),
    ];
    if let Some(start) = start {
        let tail = if st(start, "basis") == "fallback" {
            "Scaffold it, then put blocks inside it."
        } else {
            "Scaffold it, then replace its content. Keep its layout and spacing."
        };
        o.push(section("TEMPLATE", Some(&format!("{} {}", st(start, "reason"), tail))));
        let fields: Vec<(&str, Fmt)> = if verbose {
            vec![("name", Plain), ("package", Plain), ("displayName", Plain), ("description", Plain), ("command", Command)]
        } else {
            brief(&["name", "package", "description", "command"])
        };
        o.push(format::record(&rec(start, &fields, cwd)));
        for note in arr(start, "notes") {
            o.push(text(&format::js_string(&note)));
        }
        let alts = arr(start, "alternatives");
        if !alts.is_empty() {
            o.push(section(
                "OTHER TEMPLATES",
                Some(&format!(
                    "If the layout is wrong, scaffold one of these instead. All page templates: {}",
                    fcmd("template --list --type page")
                )),
            ));
            let f = if verbose { full.to_vec() } else { brief(&["name", "package", "description", "command"]) };
            o.push(recs(&alts, &f, cwd));
        }
    }
    let pages = arr(d, "pages");
    if !pages.is_empty() {
        if verbose {
            o.push(section("SEARCH MATCHES", Some("Page templates keyword search matched, best first.")));
            o.push(recs(&pages, full, cwd));
        } else {
            let names: Vec<String> = pages.iter().map(|p| format!("{} ({})", st(p, "name"), st(p, "package"))).collect();
            o.push(text(&format!("Keyword search matched these page templates: {}.", names.join(", "))));
        }
    }
    let blocks = arr(d, "blocks");
    if !blocks.is_empty() {
        o.push(section(
            "BLOCKS",
            Some(&format!(
                "Ready-made sections for parts the template lacks{}. Print one: {}",
                more(&blocks),
                fcmd("template <name>")
            )),
        ));
        let f = if verbose { full.to_vec() } else { brief(&["name", "package", "description"]) };
        o.push(recs(&shown(&blocks), &f, cwd));
    }
    let domain = arr(d, "domain");
    o.push(section(
        "COMPONENTS",
        Some(&format!(
            "For what the template and blocks do not cover{}. Read one: {}",
            more(&domain),
            fcmd("component <name>")
        )),
    ));
    if !domain.is_empty() {
        let f = if verbose { full.to_vec() } else { brief(&["name", "package", "deprecated", "description"]) };
        o.push(recs(&shown(&domain), &f, cwd));
    }
    o.push(format::record(&[
        ("frame".to_string(), Field::from_json(d.get("frame").unwrap_or(&Value::Null))),
        ("foundation".to_string(), Field::from_json(d.get("foundation").unwrap_or(&Value::Null))),
    ]));
    if let Some(hint) = d.get("hint").filter(|h| !h.is_null()) {
        let cmds: Vec<String> = arr(hint, "commands").iter().map(|c| fcmd(&format::js_string(c))).collect();
        o.push(section("FEW MATCHES", Some(&format!("{}\nBrowse instead:\n{}", st(hint, "reason"), cmds.join("\n")))));
    }
    out.emit(&o);
}

#[cfg(test)]
mod fixture_tests {
    //! Replays JS-recorded inputs (scripts/build-fixtures.mjs) through build's
    //! own logic. Runs when BUILD_FIXTURES names the recorded folder.
    use super::*;

    #[test]
    fn replay_fixtures() {
        let Some(dir) = std::env::var_os("BUILD_FIXTURES") else { return };
        let mut files: Vec<_> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().path()).collect();
        files.sort();
        let (mut pass, mut fail) = (0, 0);
        for f in &files {
            let fx: Value = serde_json::from_str(&std::fs::read_to_string(f).unwrap()).unwrap();
            if fx.get("error").is_some() {
                continue;
            }
            let env = env::FixtureEnv { fixture: fx.clone(), cli_root: crate::cli::env::cli_root() };
            let q = fx["query"].as_str().unwrap();
            let kind = fx["type"].as_str();
            let limit = fx["limit"].as_f64().unwrap();
            let got = build_kit(q, kind, limit, &env).map(|v| crate::json::stringify(&v, 2)).unwrap_or_else(|e| e.message);
            let want = crate::json::stringify(&fx["answer"], 2);
            if got == want {
                pass += 1;
            } else {
                fail += 1;
                if fail <= 3 {
                    let gl: Vec<&str> = got.lines().collect();
                    let wl: Vec<&str> = want.lines().collect();
                    let i = (0..gl.len().max(wl.len())).find(|&i| gl.get(i) != wl.get(i)).unwrap();
                    eprintln!("FAIL {} {:?}\n  line {i}\n  want {:?}\n  got  {:?}", f.display(), q, wl.get(i), gl.get(i));
                }
            }
        }
        eprintln!("fixtures: {pass}/{} pass", pass + fail);
        assert_eq!(fail, 0);
    }

    #[test]
    fn replay_text() {
        let (Some(dir), Some(text), Some(cwd)) =
            (std::env::var_os("BUILD_FIXTURES"), std::env::var_os("BUILD_TEXT"), std::env::var_os("BUILD_CWD"))
        else {
            return;
        };
        let cwd = std::path::PathBuf::from(cwd);
        let (mut pass, mut fail) = (0, 0);
        for i in 0..1000 {
            let f = std::path::Path::new(&dir).join(format!("{i:04}.json"));
            if !f.exists() {
                break;
            }
            let fx: Value = serde_json::from_str(&std::fs::read_to_string(&f).unwrap()).unwrap();
            if fx.get("answer").is_none() {
                continue;
            }
            for v in ["", ".v"] {
                let g = std::path::Path::new(&text).join(format!("{i}{v}.out"));
                let Ok(want) = std::fs::read_to_string(&g) else { continue };
                let mut out = Out::new(false, cwd.clone());
                if fx["answer"]["type"] == "build.help" {
                    print_playbook(&mut out, &fx["answer"]["data"], &cwd);
                } else {
                    render_kit(&mut out, &fx["answer"]["data"], v == ".v", &cwd);
                }
                if out.stdout == want {
                    pass += 1;
                } else {
                    fail += 1;
                    if fail <= 3 {
                        let gl: Vec<&str> = out.stdout.lines().collect();
                        let wl: Vec<&str> = want.lines().collect();
                        let k = (0..gl.len().max(wl.len())).find(|&k| gl.get(k) != wl.get(k)).unwrap_or(0);
                        eprintln!("FAIL {i}{v} {:?} line {k}\n  want {:?}\n  got  {:?}", fx["query"], wl.get(k), gl.get(k));
                    }
                }
            }
        }
        eprintln!("text: {pass}/{} pass", pass + fail);
        assert_eq!(fail, 0);
    }
}
