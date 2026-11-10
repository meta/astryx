//! `astryx gap-report`: port of `clients/cli/commands/gap-report.mjs` (the
//! terminal adapter) over `api.rs` (the API).

pub mod api;
mod project;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out, Suggestion};
use crate::cli::format::{json_fields, record, records, section, text, Block, Fields};
use crate::json::Value;
use api::{GapError, GapOptions, GapResult};

pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let o = GapOptions {
        category: inv.opt_str("category").map(String::from),
        reason: inv.opt_str("reason").map(String::from),
        detail: inv.opt_str("additionalContext").map(String::from),
        package: inv.opt_str("package").map(String::from),
        confirm_public: inv.flag("confirmPublic"),
        list_categories: inv.flag("listCategories"),
        to: inv.opt_str("to").map(String::from),
    };
    let cwd = inv.cwd.clone();
    let load = || project::load(&cwd);
    let runner = project::Runner::default();
    let env = api::Env {
        project: &load,
        runner: &runner,
        source: project::invocation_source(),
        timestamp: project::iso_now(),
    };
    let result = api::gap_report(inv.arg(0), &o, &env);
    out.ewrite(&String::from_utf8_lossy(&runner.output.borrow()));
    let result = match result {
        Ok(r) => r,
        Err(e) => return out.cli_error(&e.message, error_opts(&e)),
    };
    out.ewrite(&failure_stderr(&result));
    let failure = is_failure(&result);
    if inv.json() {
        let (kind, data, meta) = api::response_value(&result);
        out.json_out(&kind, None, data, meta);
        if failure {
            out.exit_code = 1;
        }
        return Ok(());
    }
    out.write(&render_text(&result));
    if failure {
        out.exit_code = 1;
    }
    Ok(())
}

fn error_opts(e: &GapError) -> ErrorOpts {
    let opts = ErrorOpts::code(&e.code);
    match &e.suggestions {
        Some(s) => opts.suggestions(s.iter().map(|(n, r)| Suggestion::new(n.clone(), r.clone())).collect()),
        None => opts,
    }
}

/// Whether the CLI exits 1 after the receipt: a failed or partial delivery.
pub fn is_failure(r: &GapResult) -> bool {
    matches!(r, GapResult::File(rc) if rc.status == "failed" || rc.status == "partial")
}

/// One stderr line per failed delivery when the run failed, in both modes.
pub fn failure_stderr(r: &GapResult) -> String {
    let mut s = String::new();
    if let GapResult::File(rc) = r {
        if is_failure(r) {
            for d in rc.deliveries.iter().filter(|d| d.status == "failed") {
                s.push_str(&format!(
                    "gap-report: delivery to {} failed: {}\n",
                    d.handler,
                    d.message.as_deref().unwrap_or("no message")
                ));
            }
        }
    }
    s
}

/// One `emit` as `console.log` prints it.
fn emit(blocks: &[Block]) -> String {
    format!("{}\n", crate::cli::format::join_blocks(blocks))
}

fn rows(items: &Value, fields: &[&str]) -> Vec<Fields> {
    items.as_array().map(|a| a.iter().map(|o| json_fields(o, Some(fields))).collect()).unwrap_or_default()
}

fn destination_blocks(destinations: &Value) -> String {
    emit(&[
        section("Destinations", None),
        records(&rows(destinations, &["to", "default", "issuesUrl"])),
        text(api::ASK_DESTINATION_MESSAGE),
    ])
}

/// The text form of a result.
pub fn render_text(r: &GapResult) -> String {
    let (_, data, meta) = api::response_value(r);
    let mut out = String::new();
    match r {
        GapResult::Categories { .. } => {
            out.push_str(&emit(&[section("Gap report categories", None), records(&rows(&data, &["value", "label"]))]));
            if let Some(m) = meta {
                out.push_str(&destination_blocks(&m["destinations"]));
            }
        }
        GapResult::File(rc) => {
            let heading = match rc.status.as_str() {
                "filed" => "Gap report filed",
                "partial" => "Gap report partially filed",
                "failed" => "Gap report failed",
                _ => "Gap report route",
            };
            out.push_str(&emit(&[
                section(heading, None),
                record(&json_fields(&data, Some(&["status", "package", "issuesUrl", "filedCount", "routedOnlyCount"]))),
            ]));
            if !rc.deliveries.is_empty() {
                out.push_str(&emit(&[
                    section("Deliveries", None),
                    records(&rows(&data["deliveries"], &["handlerType", "handler", "audience", "status", "url", "message"])),
                ]));
            }
            if rc.destinations.is_some() {
                out.push_str(&destination_blocks(&data["destinations"]));
            }
        }
    }
    out
}

/// The `cliError` text form, for unit tests.
#[cfg(test)]
fn error_text(e: &GapError) -> String {
    let mut out = Out::new(false, std::env::current_dir().unwrap());
    let _ = out.cli_error(&e.message, error_opts(e));
    out.stderr
}

#[cfg(test)]
#[derive(Debug)]
struct Output {
    stdout: String,
    stderr: String,
    exit: i32,
}

#[cfg(test)]
mod tests {
    use super::api::*;
    use super::{error_text, failure_stderr, is_failure, render_text, Output};

    struct Fake;
    impl GapProject for Fake {
        fn config_issues_url(&self) -> Option<String> {
            None
        }
        fn config_path(&self) -> Option<String> {
            None
        }
        fn project_handler(&self) -> Option<Handler> {
            None
        }
        fn integrations(&self) -> Vec<Integration> {
            ["@astryxdesign/charts", "@astryxdesign/lab"]
                .iter()
                .map(|n| Integration {
                    name: n.to_string(),
                    issues_url: Some("https://github.com/meta/astryx/issues".into()),
                    ..Default::default()
                })
                .collect()
        }
        fn route_owner(&self, _c: &str) -> Result<Option<String>, GapError> {
            Ok(None)
        }
    }
    struct NoRun;
    impl HandlerRunner for NoRun {
        fn call(&self, _m: &str, _s: HandlerSource, _r: &crate::json::Value) -> RunOutcome {
            RunOutcome::Threw("unused".into())
        }
    }

    fn run(c: Option<&str>, o: GapOptions) -> Output {
        let load = || -> Result<Box<dyn GapProject>, GapError> { Ok(Box::new(Fake)) };
        let env = Env { project: &load, runner: &NoRun, source: "unknown".into(), timestamp: "t".into() };
        match gap_report(c, &o, &env) {
            Ok(r) => Output {
                stdout: render_text(&r),
                stderr: failure_stderr(&r),
                exit: if is_failure(&r) { 1 } else { 0 },
            },
            Err(e) => Output { stdout: String::new(), stderr: error_text(&e), exit: 1 },
        }
    }

    fn opts(cat: &str, reason: &str) -> GapOptions {
        GapOptions { category: Some(cat.into()), reason: Some(reason.into()), ..Default::default() }
    }

    #[test]
    fn matches_js_text() {
        let o = run(None, GapOptions { list_categories: true, ..Default::default() });
        assert_eq!(o.stdout, include_str!("testdata/cats.txt"));
        let o = run(Some("Button"), opts("other", "x"));
        assert_eq!(o.stdout, include_str!("testdata/button.txt"));
        let o = run(Some("Button"), GapOptions { package: Some("@x/y".into()), ..opts("other", "x") });
        assert_eq!(o.stderr, include_str!("testdata/badpkg.err"));
        let o = run(
            Some("Button"),
            GapOptions { to: Some("@astryxdesign/lab".into()), confirm_public: true, ..opts("other", "x") },
        );
        assert_eq!(o.stdout, include_str!("testdata/lab_confirm.txt"));
        assert_eq!(o.stderr, include_str!("testdata/lab_confirm.err"));
        assert_eq!(o.exit, 1);
    }
}
