//! `astryx doctor`: project and computer health checks, `--built`, and the
//! `doctor integration` leaves. Port of `clients/cli/commands/doctor.mjs` and
//! `api/doctor/`.

pub mod built;
pub mod checks;
pub mod docs_checks;
pub mod env;
pub mod integration;
pub mod project;
pub mod themes;
pub mod support;
pub mod jsonerr;
pub mod util;

use crate::cli::format::{record, records, section, text, Block, Field, Fields};
use crate::json::{Map, Value};

/// One diagnostic result. Field order is the JSON key order.
#[derive(Debug, Clone, PartialEq)]
pub struct Check {
    pub id: String,
    pub label: String,
    pub status: Status,
    pub message: String,
    pub fix: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Pass,
    Warn,
    Fail,
    Info,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Pass => "pass",
            Status::Warn => "warn",
            Status::Fail => "fail",
            Status::Info => "info",
        }
    }
}

impl Check {
    pub fn new(id: &str, label: &str, status: Status, message: impl Into<String>) -> Check {
        Check { id: id.into(), label: label.into(), status, message: message.into(), fix: None }
    }
    pub fn fix(mut self, fix: impl Into<String>) -> Check {
        self.fix = Some(fix.into());
        self
    }
    pub fn fix_opt(mut self, fix: Option<String>) -> Check {
        self.fix = fix;
        self
    }
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("id".into(), Value::String(self.id.clone()));
        m.insert("label".into(), Value::String(self.label.clone()));
        m.insert("status".into(), Value::String(self.status.as_str().into()));
        m.insert("message".into(), Value::String(self.message.clone()));
        if let Some(f) = &self.fix {
            m.insert("fix".into(), Value::String(f.clone()));
        }
        Value::Object(m)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Summary {
    pub pass: usize,
    pub warn: usize,
    pub fail: usize,
    pub info: usize,
}

#[derive(Debug, Clone)]
pub struct Report {
    pub checks: Vec<Check>,
    pub summary: Summary,
}

impl Report {
    pub fn from_checks(checks: Vec<Check>) -> Report {
        let mut summary = Summary::default();
        for c in &checks {
            match c.status {
                Status::Pass => summary.pass += 1,
                Status::Warn => summary.warn += 1,
                Status::Fail => summary.fail += 1,
                Status::Info => summary.info += 1,
            }
        }
        Report { checks, summary }
    }

    /// `data` of the `doctor` JSON envelope.
    pub fn to_json(&self) -> Value {
        let mut s = Map::new();
        s.insert("pass".into(), Value::from(self.summary.pass as u64));
        s.insert("warn".into(), Value::from(self.summary.warn as u64));
        s.insert("fail".into(), Value::from(self.summary.fail as u64));
        s.insert("info".into(), Value::from(self.summary.info as u64));
        let mut m = Map::new();
        m.insert("checks".into(), Value::Array(self.checks.iter().map(Check::to_json).collect()));
        m.insert("summary".into(), Value::Object(s));
        Value::Object(m)
    }

    /// The blocks `printHuman` emits.
    pub fn to_blocks(&self) -> Vec<Block> {
        let Summary { warn, fail, .. } = self.summary;
        let closing = if fail > 0 {
            "Some checks failed. Address the items marked [fail] above."
        } else if warn > 0 {
            "No failures \u{2014} but review the [warn] warnings above when you can."
        } else {
            "All checks passed. Your Astryx setup looks healthy."
        };
        let recs: Vec<Fields> = self
            .checks
            .iter()
            .map(|c| {
                vec![
                    ("id".to_string(), Field::from(c.id.clone())),
                    ("status".to_string(), Field::from(status_token(c.status.as_str()).to_string())),
                    ("label".to_string(), Field::from(c.label.clone())),
                    ("message".to_string(), Field::from(c.message.clone())),
                    ("fix".to_string(), Field::from(c.fix.clone())),
                ]
            })
            .collect();
        let n = |k: &str, v: usize| (k.to_string(), Field::from(v.to_string()));
        vec![
            section("astryx doctor \u{2014} diagnosing your setup", None),
            records(&recs),
            section("summary", None),
            record(&[n("pass", self.summary.pass), n("warn", warn), n("fail", fail), n("info", self.summary.info)]),
            text(closing),
        ]
    }
}

/// `[ok]`, `[warn]`, `[fail]`, `[info]`, else the status itself.
pub fn status_token(status: &str) -> &str {
    match status {
        "pass" => "[ok]",
        "warn" | "warning" => "[warn]",
        "fail" | "error" => "[fail]",
        "info" => "[info]",
        other => other,
    }
}

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out, Suggestion};

fn unknown_word(inv: &Invocation) -> Option<String> {
    temp_operands(inv).0.into_iter().next()
}

/// TEMP: until the shell's Commander parser fills `opts`, read `--built`
/// from the raw operands. Returns (operands, built).
fn temp_operands(inv: &Invocation) -> (Vec<String>, Option<String>) {
    if let Some(b) = inv.opt_str("built") {
        return (inv.extra_args.iter().filter(|a| !a.starts_with('-')).cloned().collect(), Some(b.to_string()));
    }
    let mut ops = Vec::new();
    let mut built = None;
    let mut it = inv.extra_args.iter();
    while let Some(a) = it.next() {
        if a == "--built" {
            built = it.next().cloned();
        } else if let Some(v) = a.strip_prefix("--built=") {
            built = Some(v.to_string());
        } else if !a.starts_with('-') {
            ops.push(a.clone());
        }
    }
    (ops, built)
}

fn unknown_subcommand(out: &mut Out, label: &str, word: &str, children: &[&str]) -> CmdResult {
    out.cli_error(
        &format!("unknown subcommand '{label} {word}'"),
        ErrorOpts::code("ERR_UNKNOWN_SUBCOMMAND")
            .suggestions(children.iter().map(|c| Suggestion::new(*c, "available subcommand")).collect()),
    )
}

/// `astryx doctor`.
pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    if let Some(word) = unknown_word(inv) {
        return unknown_subcommand(out, "doctor", &word, &["integration"]);
    }
    let built = temp_operands(inv).1;
    let report = checks::run_checks(&inv.cwd, built.as_deref());
    if inv.json() {
        out.json_out("doctor", None, report.to_json(), None);
    } else {
        out.emit(&report.to_blocks());
    }
    if report.summary.fail > 0 {
        out.exit_code = 1;
    }
    Ok(())
}
