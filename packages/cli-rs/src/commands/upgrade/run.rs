//! `api/upgrade/run/run.mjs`, `status.mjs` and the agent-docs parts of
//! `_adapter.mjs`.

use super::fsutil::{relative, s};
use super::protection::Resolver;
use super::registry::{transforms_between, VersionManifest};
use super::runner::{self, DeclinedRow, ErrorRow, OutcomeRow, ProtectedRow, RunOptions, RunOutcome};
use super::ui::Ui;
use super::{ApiError, Opts};
use crate::discovery::semver::{semver_gt, semver_gte};
use crate::json::{Map, Value};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};

fn o() -> Map<String, Value> {
    Map::new()
}
fn vs(s: &str) -> Value {
    Value::String(s.to_string())
}
fn varr(v: Vec<String>) -> Value {
    Value::Array(v.into_iter().map(Value::String).collect())
}

pub struct Installed {
    pub version: String,
    pub package_name: String,
}

pub fn detect_installed_target_version(cwd: &Path) -> Option<Installed> {
    let (name, dir) = crate::discovery::paths::find_project_package_of(&s(cwd), &["@astryxdesign/core", "@xds/core"])?;
    let text = std::fs::read_to_string(Path::new(&dir).join("package.json")).ok()?;
    let pkg: serde_json::Value = serde_json::from_str(&text).ok()?;
    let v = pkg.get("version")?.as_str()?.to_string();
    if v.is_empty() {
        return None;
    }
    Some(Installed { version: v, package_name: name })
}

// ---- agent docs ----

#[derive(Clone)]
pub struct AgentDocsSummary {
    pub status: String,
    pub installed_version: String,
    pub from_versions: Vec<String>,
    pub files: Vec<String>,
    pub refreshed: bool,
    pub action: String,
}

impl AgentDocsSummary {
    pub fn current(v: &str) -> AgentDocsSummary {
        AgentDocsSummary { status: "current".into(), installed_version: v.into(), from_versions: vec![], files: vec![], refreshed: false, action: "none".into() }
    }
    pub fn to_json(&self) -> Value {
        let mut m = o();
        m.insert("status".into(), vs(&self.status));
        m.insert("installedVersion".into(), vs(&self.installed_version));
        m.insert("fromVersions".into(), varr(self.from_versions.clone()));
        m.insert("files".into(), varr(self.files.clone()));
        m.insert("refreshed".into(), Value::Bool(self.refreshed));
        m.insert("action".into(), vs(&self.action));
        Value::Object(m)
    }
}

pub struct AgentDocsPlan {
    pub cwd: PathBuf,
    pub origin: Option<PathBuf>,
    pub rendered: Option<String>,
    pub summary: AgentDocsSummary,
}

fn init_advice(cwd: &Path, origin: Option<&Path>) -> String {
    let command = format!("`{}`", crate::discovery::package_manager::format_cli_command("astryx init --features agents", None));
    match origin {
        None => command,
        Some(o) => {
            let r = relative(o, cwd);
            format!("{} in {} (the project root)", command, if r.is_empty() { ".".into() } else { r })
        }
    }
}

fn home_refusal_line(dir: &str, missing: bool) -> String {
    let where_ = format!("{} is the home folder or a settings folder in it, which every project's agents read.", dir);
    if missing {
        format!("Agent docs not installed: {} To have agent docs, move the project into a folder of its own, or add the Astryx block to its agent file by hand.", where_)
    } else {
        format!("Agent docs not refreshed: {} To keep agent docs, move the project into a folder of its own; otherwise update or remove the Astryx block there by hand.", where_)
    }
}

pub fn prepare_agent_docs_refresh(ui: &mut Ui, cwd: &Path, origin: Option<&Path>, installed: &str, apply: bool, cli_root: &Path) -> AgentDocsPlan {
    use crate::commands::init::agent_docs as ad;
    let cs = s(cwd);
    let initial = ad::inspect_agent_docs(&cs, installed, None);
    let mut summary = AgentDocsSummary { status: initial.status.to_string(), installed_version: installed.into(), from_versions: initial.block_versions.clone(), files: vec![], refreshed: false, action: "none".into() };
    let mk = |rendered: Option<String>, summary: AgentDocsSummary| AgentDocsPlan { cwd: cwd.to_path_buf(), origin: origin.map(|p| p.to_path_buf()), rendered, summary };
    if initial.status == "missing" {
        if ad::assert_agent_docs_target(&cs).is_err() {
            summary.action = "error".into();
            ui.warn(&home_refusal_line(&ad::real_dir(&cs), true));
            return mk(None, summary);
        }
        summary.action = "nudge-init".into();
        ui.warn(&format!("No Astryx agent-docs block found - AI agents have no component index. Run {} to install it.", init_advice(cwd, origin)));
        return mk(None, summary);
    }
    let rendered = match ad::render_agent_docs_block(&cs, &s(cli_root)) {
        Ok(r) => r,
        Err(_) => {
            summary.action = "error".into();
            summary.files = initial.files.iter().map(|f| f.path.clone()).collect();
            ui.warn(&format!("Could not render the expected agent docs. Run {} to update them manually.", init_advice(cwd, origin)));
            return mk(None, summary);
        }
    };
    let insp = ad::inspect_agent_docs(&cs, installed, Some(&rendered));
    summary.status = insp.status.to_string();
    summary.from_versions = insp.block_versions.clone();
    summary.files = insp.stale_files.clone();
    if insp.status == "current" {
        return mk(Some(rendered), summary);
    }
    if ad::assert_agent_docs_target(&cs).is_err() {
        summary.action = "error".into();
        ui.warn(&home_refusal_line(&ad::real_dir(&cs), false));
        return mk(None, summary);
    }
    summary.action = "would-refresh".into();
    if !apply {
        ui.warn(&format!("Agent docs differ from the installed Astryx and integration configuration. Re-run with --apply to refresh ({}).", summary.files.join(", ")));
    }
    mk(Some(rendered), summary)
}

pub fn apply_agent_docs_refresh(ui: &mut Ui, plan: AgentDocsPlan) -> AgentDocsSummary {
    use crate::commands::init::agent_docs as ad;
    let mut summary = plan.summary;
    let rendered = match plan.rendered {
        Some(r) if summary.action == "would-refresh" => r,
        _ => return summary,
    };
    let mut skipped = Vec::new();
    let res = ad::install_agent_docs(&s(&plan.cwd), &ad::InstallOptions { agent: None, paths: None, only_replace: true, rendered_block: rendered, refuse_escapes: false }, &mut skipped);
    for (file, reason) in &skipped {
        ui.warn(&format!("Note: {} left as it is ({}).", file, reason));
    }
    match res {
        Ok(written) => {
            summary.refreshed = !written.is_empty();
            summary.files = written.clone();
            summary.action = if summary.refreshed { "refreshed".into() } else { "error".into() };
            if summary.refreshed {
                ui.log(&format!("[ok] Agent docs refreshed -> {}", written.join(", ")));
            } else {
                ui.warn(&format!("Agent docs look stale but couldn't be refreshed. Run {} to reinstall the block.", init_advice(&plan.cwd, plan.origin.as_deref())));
            }
        }
        Err(e) => {
            summary.action = "error".into();
            summary.refreshed = false;
            if matches!(e, ad::DocsError::Home(_)) {
                ui.warn(&home_refusal_line(&ad::real_dir(&s(&plan.cwd)), false));
            } else {
                ui.warn(&format!("Could not refresh agent docs. Run {} to update them manually.", init_advice(&plan.cwd, plan.origin.as_deref())));
            }
        }
    }
    summary
}

fn agent_docs_for(ui: &mut Ui, cwd: &Path, origin: Option<&Path>, installed: &str, apply: bool, cli_root: &Path) -> AgentDocsSummary {
    let plan = prepare_agent_docs_refresh(ui, cwd, origin, installed, apply, cli_root);
    if apply {
        apply_agent_docs_refresh(ui, plan)
    } else {
        plan.summary
    }
}

// ---- cliBehindCore ----

pub struct CliBehindCore {
    pub cli_version: String,
    pub command: String,
}

impl CliBehindCore {
    fn to_json(&self) -> Value {
        let mut m = o();
        m.insert("cliVersion".into(), vs(&self.cli_version));
        m.insert("command".into(), vs(&self.command));
        Value::Object(m)
    }
}

fn read_running_cli_version(cli_root: &Path) -> Option<String> {
    let text = std::fs::read_to_string(cli_root.join("package.json")).ok()?;
    let pkg: serde_json::Value = serde_json::from_str(&text).ok()?;
    let v = pkg.get("version")?.as_str()?.to_string();
    if crate::discovery::semver::is_valid_semver(&v) {
        Some(v)
    } else {
        None
    }
}

fn detect_cli_behind_core(from: &str, to: &str, package_name: &str, opts: &Opts, cwd: &Path, source: &Path, cli_root: &Path) -> Option<CliBehindCore> {
    use crate::discovery::package_manager as pm;
    if package_name != "@astryxdesign/core" {
        return None;
    }
    let cli_version = read_running_cli_version(cli_root)?;
    if !semver_gt(to, &cli_version) || !semver_gt(to, from) {
        return None;
    }
    let run_folder = super::fsutil::resolve(cwd);
    let folder = std::fs::canonicalize(&run_folder).unwrap_or(run_folder.clone());
    let rel = relative(&run_folder, source);
    let scanned = if rel.is_empty() { folder.clone() } else { super::fsutil::normalize(&folder.join(rel)) };
    let mut args: Vec<String> = vec!["upgrade".into(), "--from".into(), from.into(), "--path".into(), s(&scanned)];
    if let Some(c) = &opts.codemod {
        args.push("--codemod".into());
        args.push(c.clone());
    }
    for n in &opts.skip_codemod {
        args.push("--skip-codemod".into());
        args.push(n.clone());
    }
    for n in &opts.integration {
        args.push("--integration".into());
        args.push(n.clone());
    }
    if opts.force {
        args.push("--force".into());
    }
    if opts.install_deps {
        args.push("--install-deps".into());
    }
    if opts.apply {
        args.push("--apply".into());
    }
    let mut parts = vec![pm::get_dlx_prefix(Some(&s(cwd))).to_string()];
    parts.push(pm::quote_command_argument(&format!("@astryxdesign/cli@{}", to)));
    for a in &args {
        parts.push(pm::quote_command_argument(a));
    }
    let upgrade = parts.join(" ");
    Some(CliBehindCore { cli_version, command: pm::command_in_folder(&s(&folder), &upgrade) })
}

pub fn log_cli_behind_core(ui: &mut Ui, c: &CliBehindCore, to: &str) {
    ui.warn(&format!(
        "This CLI ({}) is older than the installed @astryxdesign/core ({}): it has no codemods for releases after {}, so it cannot finish this upgrade. Run it with the CLI that matches your Core:",
        c.cli_version, to, c.cli_version
    ));
    ui.warn(&format!("  {}", c.command));
}

// ---- summaries ----

#[derive(Clone)]
pub struct ProtectedSummary {
    pub file: String,
    pub codemods: Vec<String>,
    pub reasons: Vec<String>,
    pub declarations: Vec<String>,
    pub commands: Vec<String>,
}

fn sorted(set: BTreeSet<String>) -> Vec<String> {
    let mut v: Vec<String> = set.into_iter().collect();
    v.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    v
}

fn locale_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    crate::discovery::jsort::locale_compare(a, b)
}

pub fn summarize_protected(rows: &[ProtectedRow]) -> Vec<ProtectedSummary> {
    let mut order: Vec<String> = Vec::new();
    let mut map: std::collections::HashMap<String, (BTreeSet<String>, BTreeSet<String>, BTreeSet<String>, BTreeSet<String>)> = Default::default();
    for r in rows {
        if !map.contains_key(&r.file) {
            order.push(r.file.clone());
        }
        let e = map.entry(r.file.clone()).or_default();
        e.0.insert(r.codemod.clone());
        e.1.insert(r.reason.clone());
        e.2.insert(r.declaration.clone());
        if let Some(c) = &r.command {
            if !c.is_empty() {
                e.3.insert(c.clone());
            }
        }
    }
    let mut out: Vec<ProtectedSummary> = order
        .into_iter()
        .map(|f| {
            let (a, b, c, d) = map.remove(&f).unwrap();
            ProtectedSummary { file: f, codemods: sorted(a), reasons: sorted(b), declarations: sorted(c), commands: sorted(d) }
        })
        .collect();
    out.sort_by(|a, b| locale_cmp(&a.file, &b.file));
    out
}

fn protected_json(p: &ProtectedSummary) -> Value {
    let mut m = o();
    m.insert("file".into(), vs(&p.file));
    m.insert("codemods".into(), varr(p.codemods.clone()));
    m.insert("reasons".into(), varr(p.reasons.clone()));
    m.insert("declarations".into(), varr(p.declarations.clone()));
    m.insert("commands".into(), varr(p.commands.clone()));
    Value::Object(m)
}

const MANUAL: &str = "manual migration needed";
const LOCATION_UNKNOWN: &str = "(location unknown)";

#[derive(Clone)]
pub struct DeclinedSummary {
    pub file: String,
    pub location: Option<String>,
    pub reason: String,
}

pub fn summarize_declined(rows: &[DeclinedRow], protected_files: &[String]) -> Vec<DeclinedSummary> {
    let blocked: HashSet<&String> = protected_files.iter().collect();
    let mut order: Vec<String> = Vec::new();
    let mut map: std::collections::HashMap<String, Vec<(Option<String>, String)>> = Default::default();
    for r in rows {
        if blocked.contains(&r.file) {
            continue;
        }
        let f = map.entry(r.file.clone()).or_insert_with(|| {
            order.push(r.file.clone());
            Vec::new()
        });
        if !f.iter().any(|(l, re)| *re == r.reason && *l == r.location) {
            f.push((r.location.clone(), r.reason.clone()));
        }
    }
    let mut out: Vec<DeclinedSummary> = order
        .into_iter()
        .map(|file| {
            let findings = map.remove(&file).unwrap();
            let location = findings[0].0.clone();
            let reason = findings
                .iter()
                .enumerate()
                .map(|(i, (l, r))| {
                    if i == 0 || *l == location {
                        r.clone()
                    } else if let Some(l) = l {
                        format!("{} (at {})", r, l)
                    } else {
                        format!("{} {}", r, LOCATION_UNKNOWN)
                    }
                })
                .collect::<Vec<_>>()
                .join("; ");
            DeclinedSummary { file, location, reason }
        })
        .collect();
    out.sort_by(|a, b| locale_cmp(&a.file, &b.file));
    out
}

fn declined_json(d: &DeclinedSummary) -> Value {
    let mut m = o();
    m.insert("file".into(), vs(&d.file));
    if let Some(l) = &d.location {
        m.insert("location".into(), vs(l));
    }
    m.insert("reason".into(), vs(&d.reason));
    Value::Object(m)
}

fn declined_findings(d: &DeclinedSummary) -> Vec<(Option<String>, String)> {
    let parts = split_findings(&d.reason);
    parts
        .into_iter()
        .enumerate()
        .map(|(i, text)| {
            if i == 0 {
                return (d.location.clone(), text);
            }
            if let Some(t) = text.strip_suffix(&format!(" {}", LOCATION_UNKNOWN)) {
                return (None, t.to_string());
            }
            if let Some(c) = super::jsre::captures(r" \(at ([^)]+)\)$", "", &text) {
                let whole = c[0].clone().unwrap();
                return (c[1].clone(), text[..text.len() - whole.len()].to_string());
            }
            (d.location.clone(), text)
        })
        .collect()
}

fn split_findings(s: &str) -> Vec<String> {
    // `reason.split(/; (?=(?:unparseable protected file|manual migration needed) \()/)`
    let r = super::jsre::re(r"; (?=(?:unparseable protected file|manual migration needed) \()", "");
    let mut out = Vec::new();
    let mut last = 0;
    for m in r.find_iter(s) {
        out.push(s[last..m.range().start].to_string());
        last = m.range().end;
    }
    out.push(s[last..].to_string());
    out
}

fn manual_declined_rows(outcomes: &[OutcomeRow]) -> Vec<DeclinedRow> {
    outcomes
        .iter()
        .filter(|x| x.kind == "manual")
        .map(|x| DeclinedRow { file: x.file.clone(), codemod: x.codemod.clone(), location: x.line.map(|l| l.to_string()), reason: format!("{} ({}): {}", MANUAL, x.codemod, x.message) })
        .collect()
}

fn count_manual(declined: &[DeclinedSummary]) -> usize {
    declined.iter().flat_map(declined_findings).filter(|(_, t)| t.starts_with(MANUAL)).count()
}

fn log_declined(ui: &mut Ui, declined: &[DeclinedSummary]) {
    let mut manual = Vec::new();
    let mut unparseable = Vec::new();
    for d in declined {
        for (l, t) in declined_findings(d) {
            if t.starts_with(MANUAL) {
                manual.push((d.file.clone(), l, t));
            } else {
                unparseable.push((d.file.clone(), l, t));
            }
        }
    }
    let files = |rows: &Vec<(String, Option<String>, String)>| rows.iter().map(|r| r.0.clone()).collect::<HashSet<_>>().len();
    let mut lines = |ui: &mut Ui, rows: &Vec<(String, Option<String>, String)>| {
        for (f, l, t) in rows {
            ui.warn(&format!("  {}{} - {}", f, l.as_ref().map(|l| format!(":{}", l)).unwrap_or_default(), t));
        }
    };
    if !unparseable.is_empty() {
        let n = files(&unparseable);
        ui.warn(&format!("{} protected file{} skipped because {} not parse; review manually:", n, if n == 1 { " was" } else { "s were" }, if n == 1 { "it does" } else { "they do" }));
        lines(ui, &unparseable);
    }
    if !manual.is_empty() {
        let n = files(&manual);
        ui.warn(&format!("{} file{} a manual migration that upgrade cannot make; review manually:", n, if n == 1 { " needs" } else { "s need" }));
        lines(ui, &manual);
    }
}

#[derive(Clone)]
pub struct RegenSummary {
    pub file: String,
    pub codemods: Vec<String>,
    pub commands: Vec<String>,
    pub messages: Vec<String>,
}

fn summarize_regenerate(protected: &[ProtectedSummary], outcomes: &[OutcomeRow]) -> Vec<RegenSummary> {
    let mut order: Vec<String> = Vec::new();
    let mut map: std::collections::HashMap<String, (BTreeSet<String>, BTreeSet<String>, BTreeSet<String>)> = Default::default();
    fn row(map: &mut std::collections::HashMap<String, (BTreeSet<String>, BTreeSet<String>, BTreeSet<String>)>, f: &str, order: &mut Vec<String>) {
        if !map.contains_key(f) {
            order.push(f.to_string());
            map.insert(f.to_string(), Default::default());
        }
    }
    for p in protected {
        if !p.reasons.iter().any(|r| r == "generated") {
            continue;
        }
        row(&mut map, &p.file, &mut order);
        let e = map.get_mut(&p.file).unwrap();
        e.0.extend(p.codemods.iter().cloned());
        e.1.extend(p.commands.iter().cloned());
    }
    for x in outcomes {
        if x.kind != "regenerate" {
            continue;
        }
        row(&mut map, &x.file, &mut order);
        let e = map.get_mut(&x.file).unwrap();
        e.0.insert(x.codemod.clone());
        e.1.extend(x.commands.iter().cloned());
        e.2.insert(x.message.clone());
    }
    let mut out: Vec<RegenSummary> = order
        .into_iter()
        .map(|f| {
            let (a, b, c) = map.remove(&f).unwrap();
            RegenSummary { file: f, codemods: sorted(a), commands: sorted(b), messages: sorted(c) }
        })
        .collect();
    out.sort_by(|a, b| locale_cmp(&a.file, &b.file));
    out
}

fn regen_json(r: &RegenSummary) -> Value {
    let mut m = o();
    m.insert("file".into(), vs(&r.file));
    m.insert("codemods".into(), varr(r.codemods.clone()));
    m.insert("commands".into(), varr(r.commands.clone()));
    m.insert("messages".into(), varr(r.messages.clone()));
    Value::Object(m)
}

fn log_protected_files(ui: &mut Ui, header: &str, files: &[ProtectedSummary]) {
    if files.is_empty() {
        return;
    }
    ui.error(header);
    for p in files {
        ui.error(&format!("  {} — {}", p.file, p.declarations.join("; ")));
        for c in &p.commands {
            ui.log(&format!("  Regenerate with: {}", c));
        }
    }
}

fn log_regenerate(ui: &mut Ui, regen: &[RegenSummary], printed: &[ProtectedSummary]) {
    let skip: HashSet<&String> = printed.iter().map(|p| &p.file).collect();
    let rows: Vec<&RegenSummary> = regen.iter().filter(|r| !skip.contains(&r.file)).collect();
    if rows.is_empty() {
        return;
    }
    ui.error(&format!("{} generated file{} must be regenerated:", rows.len(), if rows.len() == 1 { "" } else { "s" }));
    for r in rows {
        ui.error(&format!("  {}{}", r.file, if r.messages.is_empty() { String::new() } else { format!(" — {}", r.messages.join(" ")) }));
        for c in &r.commands {
            ui.log(&format!("  Regenerate with: {}", c));
        }
    }
}

fn regeneration_protection_rows(outcomes: &[OutcomeRow], prot: &Resolver, cwd: &Path) -> Vec<ProtectedRow> {
    let mut rows = Vec::new();
    for x in outcomes {
        if x.kind != "regenerate" {
            continue;
        }
        for item in prot.classify(&super::fsutil::resolve_from(cwd, &x.file)) {
            let mut commands: Vec<String> = item.command.iter().cloned().collect();
            commands.extend(x.commands.iter().cloned());
            let base = ProtectedRow { file: item.file.clone(), codemod: x.codemod.clone(), reason: item.reason.clone(), declaration: item.declaration.clone(), generated: item.reason == "generated", command: None };
            if commands.is_empty() {
                rows.push(base.clone());
            }
            for c in commands {
                rows.push(ProtectedRow { command: Some(c), ..base.clone() });
            }
        }
    }
    rows
}

fn regeneration_errors(outcomes: &[OutcomeRow], prot: &Resolver, cwd: &Path) -> Vec<ErrorRow> {
    outcomes
        .iter()
        .filter(|x| x.kind == "regenerate" && prot.classify(&super::fsutil::resolve_from(cwd, &x.file)).is_empty())
        .map(|x| ErrorRow { file: x.file.clone(), codemod: x.codemod.clone(), error: x.message.clone() })
        .collect()
}

fn error_json(e: &ErrorRow) -> Value {
    let mut m = o();
    m.insert("file".into(), vs(&e.file));
    m.insert("codemod".into(), vs(&e.codemod));
    m.insert("error".into(), vs(&e.error));
    Value::Object(m)
}

fn unique_rel(cwd: &Path, files: &[PathBuf]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for f in files {
        if seen.insert(f.clone()) {
            out.push(relative(cwd, f));
        }
    }
    out
}

pub struct Receipt {
    pub from: String,
    pub to: String,
    pub codemods: usize,
    pub integrations: Vec<String>,
    pub agent_docs: AgentDocsSummary,
    pub source_path_found: bool,
    pub files_changed: usize,
    pub transforms_applied: usize,
    pub modified_files: Vec<String>,
    pub protected_files: Vec<ProtectedSummary>,
    pub declined: Vec<DeclinedSummary>,
    pub regenerate: Vec<RegenSummary>,
    pub complete: bool,
    pub error_code: Option<String>,
    pub errors: Vec<ErrorRow>,
    pub cli_behind_core: Option<CliBehindCore>,
}

impl Receipt {
    pub fn to_json(&self) -> Value {
        let mut m = o();
        m.insert("from".into(), vs(&self.from));
        m.insert("to".into(), vs(&self.to));
        m.insert("codemods".into(), Value::from(self.codemods as u64));
        m.insert("integrations".into(), varr(self.integrations.clone()));
        m.insert("agentDocsRefreshed".into(), Value::Bool(self.agent_docs.refreshed));
        m.insert("agentDocs".into(), self.agent_docs.to_json());
        m.insert("sourcePathFound".into(), Value::Bool(self.source_path_found));
        m.insert("filesChanged".into(), Value::from(self.files_changed as u64));
        m.insert("transformsApplied".into(), Value::from(self.transforms_applied as u64));
        m.insert("modifiedFiles".into(), varr(self.modified_files.clone()));
        m.insert("protectedFiles".into(), Value::Array(self.protected_files.iter().map(protected_json).collect()));
        m.insert("declinedCandidates".into(), Value::Array(self.declined.iter().map(declined_json).collect()));
        m.insert("regenerate".into(), Value::Array(self.regenerate.iter().map(regen_json).collect()));
        m.insert("complete".into(), Value::Bool(self.complete));
        if let Some(c) = &self.error_code {
            m.insert("errorCode".into(), vs(c));
        }
        m.insert("errors".into(), Value::Array(self.errors.iter().map(error_json).collect()));
        if let Some(c) = &self.cli_behind_core {
            m.insert("cliBehindCore".into(), c.to_json());
        }
        Value::Object(m)
    }
}

pub struct Response {
    pub kind: &'static str,
    pub data: Value,
}

fn status_up_to_date(ui: &mut Ui, from: &str, to: &str, agent_docs: AgentDocsSummary) -> Response {
    ui.log("[ok] Already up to date - no codemods to run.");
    ui.log("Use --force to run codemods anyway.");
    ui.log("Done\n");
    let mut m = o();
    m.insert("status".into(), vs("up_to_date"));
    m.insert("from".into(), vs(from));
    m.insert("to".into(), vs(to));
    m.insert("agentDocs".into(), agent_docs.to_json());
    Response { kind: "upgrade.status", data: Value::Object(m) }
}

fn status_no_codemods(ui: &mut Ui, from: &str, to: &str, agent_docs: AgentDocsSummary, cbc: Option<CliBehindCore>) -> Response {
    match &cbc {
        Some(c) => log_cli_behind_core(ui, c, to),
        None => ui.log("[ok] No codemods available for this version range."),
    }
    ui.log(if cbc.is_some() { "Upgrade incomplete\n" } else { "Done\n" });
    let mut m = o();
    m.insert("status".into(), vs("no_codemods"));
    m.insert("from".into(), vs(from));
    m.insert("to".into(), vs(to));
    m.insert("agentDocs".into(), agent_docs.to_json());
    if let Some(c) = &cbc {
        m.insert("cliBehindCore".into(), c.to_json());
    }
    Response { kind: "upgrade.status", data: Value::Object(m) }
}

fn status_config_fixable(ui: &mut Ui, from: &str, to: &str, config_error: &str, config_codemods: &[String], agent_docs: AgentDocsSummary, cbc: Option<CliBehindCore>) -> Response {
    let flags: Vec<String> = config_codemods.iter().map(|n| format!("--codemod {}", n)).collect();
    let suggested = format!("astryx upgrade --from {} {} --apply", from, flags.join(" "));
    let guidance = "Your astryx.config currently fails strict validation, but a pending config codemod would repair it. This dry run previewed the fix without writing. Re-run with --apply to apply it, or run just the config codemod(s) now:";
    ui.warn(guidance);
    ui.log(&format!("  {}", crate::discovery::package_manager::format_cli_command(&suggested, None)));
    let note = "Integrations are skipped in this preview; they will be processed on the --apply run.";
    ui.log(note);
    if let Some(c) = &cbc {
        log_cli_behind_core(ui, c, to);
    }
    ui.log(if cbc.is_some() { "Upgrade incomplete\n" } else { "Dry run complete\n" });
    let mut m = o();
    m.insert("status".into(), vs("config_fixable"));
    m.insert("from".into(), vs(from));
    m.insert("to".into(), vs(to));
    m.insert("configError".into(), vs(config_error));
    m.insert("configCodemods".into(), varr(config_codemods.to_vec()));
    m.insert("suggestedCommand".into(), vs(&suggested));
    m.insert("message".into(), vs(guidance));
    m.insert("note".into(), vs(note));
    m.insert("agentDocs".into(), agent_docs.to_json());
    if let Some(c) = &cbc {
        m.insert("cliBehindCore".into(), c.to_json());
    }
    Response { kind: "upgrade.status", data: Value::Object(m) }
}

/// An API failure that carries a receipt.
fn fail_with_receipt(message: String, code: &str, receipt: Value) -> ApiError {
    ApiError { message, code: code.into(), receipt: Some(receipt) }
}

pub fn run(ui: &mut Ui, opts: &Opts, cwd: &Path, origin: Option<&Path>, cli_root: &Path) -> Result<Response, ApiError> {
    let raw_path = opts.path.clone().unwrap_or_else(|| "./src".into());
    let path_ = match super::assert_within(&raw_path, cwd, true, "source directory") {
        Ok(p) => p,
        Err(e) => {
            ui.error(&e.message);
            ui.log("Aborted\n");
            return Err(ApiError::new(e.message, "ERR_PATH_TRAVERSAL"));
        }
    };
    let apply = opts.apply;
    let source_found = path_.exists();
    let current = opts.from.clone().unwrap_or_default();
    if let Some(o) = origin {
        let r = relative(o, cwd);
        ui.log(&format!("Project root: {}", if r.is_empty() { "." } else { &r }));
        let r = relative(o, &path_);
        ui.log(&format!("Source folder: {}", if r.is_empty() { "." } else { &r }));
    }
    let installed = match detect_installed_target_version(cwd) {
        Some(i) => i,
        None => {
            let msg = if crate::discovery::release::is_outside_project(&s(cwd)) {
                "Could not find installed @astryxdesign/core (or legacy @xds/core). This folder is outside a project; upgrade migrates the code of an app project that installs @astryxdesign/core.".to_string()
            } else {
                format!("Could not find installed @astryxdesign/core (or legacy @xds/core). Install the target version first, then rerun `{} upgrade --from <old-version>`.", crate::discovery::package_manager::get_cli_invocation(None))
            };
            ui.error(&msg);
            ui.log("Aborted\n");
            return Err(ApiError::new(msg, "ERR_VERSION_DETECT"));
        }
    };
    let target = installed.version.clone();
    ui.log(&format!("From version: {}", current));
    ui.log(&format!("Installed target: {} ({})", target, installed.package_name));
    // reconcileCompositions: registry receipts under the source path.
    let reconcile = |ui: &mut Ui| -> Result<Option<Value>, ApiError> {
        if opts.codemod.is_some() {
            return Ok(None);
        }
        super::registry_compositions::reconcile_for_run(ui, apply, &path_, cwd, origin, if installed.package_name == "@astryxdesign/core" { Some(target.as_str()) } else { None })
    };
    if !opts.force && semver_gte(&current, &target) {
        let reg = reconcile(ui)?;
        let ad = agent_docs_for(ui, cwd, origin, &target, apply, cli_root);
        let mut r = status_up_to_date(ui, &current, &target, ad);
        attach_registry(&mut r.data, reg);
        return Ok(r);
    }
    let cbc = detect_cli_behind_core(&current, &target, &installed.package_name, opts, cwd, &path_, cli_root);
    let manifests: Vec<VersionManifest> = transforms_between(&current, &target);
    let mut config_names: Vec<String> = Vec::new();
    for m in &manifests {
        for t in &m.transforms {
            if let Some(c) = &opts.codemod {
                if &t.name != c {
                    continue;
                }
            }
            if t.codemod_type.as_deref() == Some("config") {
                config_names.push(t.name.clone());
            }
        }
    }
    let skip: HashSet<String> = opts.skip_codemod.iter().cloned().collect();
    let mut total = 0usize;
    let mut total_optional = 0usize;
    for m in &manifests {
        for t in &m.transforms {
            if let Some(c) = &opts.codemod {
                if &t.name != c {
                    continue;
                }
            }
            if skip.contains(&t.name) {
                continue;
            }
            if t.optional && opts.codemod.is_none() {
                total_optional += 1;
            } else {
                total += 1;
            }
        }
    }
    let protection = match Resolver::new(cwd, Default::default()) {
        Ok(r) => r,
        Err(e) => {
            ui.error(&e.message);
            ui.log("Upgrade failed\n");
            return Err(ApiError::new(e.message, "ERR_CODEMOD_PROTECTION_SOURCE"));
        }
    };
    let mut outcomes: Vec<OutcomeRow> = Vec::new();
    let run_opts = RunOptions { apply, path: &path_, codemod: opts.codemod.as_deref(), skip: &skip, silent: ui.silent, root: cwd, covers_target: cbc.is_none() };
    let core = match runner::run_codemods(ui.out, &manifests, &run_opts, protection, &mut outcomes) {
        RunOutcome::Done(r) => Some(r),
        RunOutcome::SourceMissing => None,
    };
    let prot_now = Resolver::new(cwd, Default::default()).ok();
    // loadProjectContext
    let project = load_project_context(cwd, &opts.integration);
    let (integrations, hooks, config_path, records, icon_sets) = match &project {
        Ok(c) => (c.integrations.clone(), c.hooks.clone(), c.config_path.clone(), c.records.clone(), c.icon_sets),
        Err(_) => (vec![], vec![], None, vec![], false),
    };
    if let Err(config_err) = project {
        let prot = prot_now.as_ref().unwrap();
        let mut all_protected: Vec<ProtectedRow> = core.as_ref().map(|c| c.protected_files.clone()).unwrap_or_default();
        all_protected.extend(regeneration_protection_rows(&outcomes, prot, cwd));
        let stale = regeneration_errors(&outcomes, prot, cwd);
        let mut errs: Vec<ErrorRow> = core.as_ref().map(|c| c.errors.clone()).unwrap_or_default();
        errs.extend(stale.clone());
        errs.push(ErrorRow { file: ".".into(), codemod: "config".into(), error: config_err.clone() });
        if !all_protected.is_empty() {
            let protected_files = summarize_protected(&all_protected);
            let regen = summarize_regenerate(&protected_files, &outcomes);
            ui.error(&config_err);
            log_protected_files(ui, "ERR_CODEMOD_PROTECTED: protected codemod changes remain while loading the Astryx config.", &protected_files);
            log_regenerate(ui, &regen, &protected_files);
            if let Some(c) = &cbc {
                log_cli_behind_core(ui, c, &target);
            }
            ui.log("Upgrade incomplete: protected changes remain\n");
            let mut declined_rows: Vec<DeclinedRow> = core.as_ref().map(|c| c.declined.clone()).unwrap_or_default();
            declined_rows.extend(manual_declined_rows(&outcomes));
            let pfiles: Vec<String> = all_protected.iter().map(|p| p.file.clone()).collect();
            let declined = summarize_declined(&declined_rows, &pfiles);
            log_declined(ui, &declined);
            let receipt = Receipt {
                from: current.clone(),
                to: target.clone(),
                codemods: total,
                integrations: vec![],
                agent_docs: AgentDocsSummary::current(&target),
                source_path_found: source_found,
                files_changed: core.as_ref().map(|c| c.total_files_changed).unwrap_or(0),
                transforms_applied: core.as_ref().map(|c| c.total_transforms_applied).unwrap_or(0),
                modified_files: unique_rel(cwd, &core.as_ref().map(|c| c.changed_files.clone()).unwrap_or_default()),
                protected_files,
                declined,
                regenerate: regen,
                complete: false,
                error_code: Some("ERR_CODEMOD_PROTECTED".into()),
                errors: errs,
                cli_behind_core: cbc,
            };
            return Ok(Response { kind: "upgrade.run", data: receipt.to_json() });
        }
        let would_fix = !config_names.is_empty() && core.as_ref().map(|c| c.total_files_changed).unwrap_or(0) > 0;
        if !apply && would_fix {
            let insp = crate::commands::init::agent_docs::inspect_agent_docs(&s(cwd), &target, None);
            let ad = AgentDocsSummary {
                status: insp.status.to_string(),
                installed_version: target.clone(),
                from_versions: insp.block_versions.clone(),
                files: insp.stale_files.clone(),
                refreshed: false,
                action: if insp.status == "missing" { "nudge-init".into() } else { "none".into() },
            };
            return Ok(status_config_fixable(ui, &current, &target, &config_err, &config_names, ad, cbc));
        }
        ui.error(&config_err);
        ui.log("Aborted\n");
        if core.as_ref().map(|c| !c.written_files.is_empty()).unwrap_or(false) || !outcomes.is_empty() {
            if let Some(c) = &cbc {
                log_cli_behind_core(ui, c, &target);
            }
            let stopped = stopped_receipt(ui, &current, &target, total, vec![], source_found, cwd, core.as_ref().map(|c| c.changed_files.clone()).unwrap_or_default(), core.as_ref().map(|c| c.total_transforms_applied).unwrap_or(0), vec![], &outcomes, errs, core.as_ref().map(|c| c.declined.clone()).unwrap_or_default(), "ERR_INVALID_ARGUMENT", cbc);
            return Err(fail_with_receipt(config_err, "ERR_INVALID_ARGUMENT", stopped));
        }
        return Err(ApiError::new(config_err, "ERR_INVALID_ARGUMENT"));
    }
    if !integrations.is_empty() {
        ui.log(&format!("Integrations: {}", integrations.join(", ")));
    }
    {
        let recs: Vec<crate::discovery::integrations::Record> = records
            .iter()
            .map(|r| {
                let mut r = r.clone();
                if !icon_sets {
                    r.shift_remove("iconSets");
                }
                r
            })
            .collect();
        let silent = ui.silent;
        crate::discovery::integration_warnings::warn_on_integrations(&recs, silent, ui.out);
    }
    let integration_groups = select_integration_codemods_for(&records, &current, &target);
    let has_integration = integration_groups.iter().any(|(_, c)| !c.is_empty());
    for (_, list) in &integration_groups {
        for c in list {
            if let Some(want) = &opts.codemod {
                if &c.id != want {
                    continue;
                }
            }
            if skip.contains(&c.id) {
                continue;
            }
            if c.is_optional && opts.codemod.is_none() {
                total_optional += 1;
            } else {
                total += 1;
            }
        }
    }
    if manifests.is_empty() && !has_integration {
        let reg = reconcile(ui)?;
        let ad = agent_docs_for(ui, cwd, origin, &target, apply, cli_root);
        let mut r = status_no_codemods(ui, &current, &target, ad, cbc);
        attach_registry(&mut r.data, reg);
        return Ok(r);
    }
    if total == 0 && total_optional == 0 {
        let msg = format!("Codemod \"{}\" not found. Use --list to see available codemods.", opts.codemod.clone().unwrap_or_default());
        ui.error(&msg);
        ui.log("Aborted\n");
        return Err(ApiError::new(msg, "ERR_UNKNOWN_CODEMOD"));
    }
    if total > 0 {
        ui.log(&format!("{} codemod{} to run{}", total, if total == 1 { "" } else { "s" }, if apply { "" } else { " (dry run)" }));
    } else {
        ui.log("No automatic codemods to run for this version range.");
    }
    let integ = if has_integration {
        let staged: HashMap<PathBuf, String> = core.as_ref().map(|c| c.staged_contents.clone()).unwrap_or_default();
        let wrote = core.as_ref().map(|c| !c.written_files.is_empty()).unwrap_or(false);
        let prot = if wrote || !staged.is_empty() {
            Resolver::new(cwd, staged.iter().map(|(k, v)| (k.clone(), Some(v.clone()))).collect()).unwrap_or_else(|_| Resolver::new(cwd, Default::default()).unwrap())
        } else {
            Resolver::new(cwd, Default::default()).unwrap()
        };
        ui.log("Applying integration codemods...");
        let io = runner::IntegrationRunOptions { apply, path: &path_, codemod: opts.codemod.as_deref(), skip: &skip, silent: ui.silent, root: cwd };
        let mut ignore = Vec::new();
        Some(runner::run_integration_codemods(ui.out, &integration_groups, &io, prot, staged, &mut ignore))
    } else {
        None
    };
    let reg = reconcile(ui)?;
    let reg_written: Vec<PathBuf> = Vec::new();
    let mut changed_core: Vec<PathBuf> = core.as_ref().map(|c| c.changed_files.clone()).unwrap_or_default();
    changed_core.extend(integ.as_ref().map(|c| c.changed_files.clone()).unwrap_or_default());
    let merged_files_changed = changed_core.iter().collect::<HashSet<_>>().len();
    let merged_applied = core.as_ref().map(|c| c.total_transforms_applied).unwrap_or(0) + integ.as_ref().map(|c| c.total_transforms_applied).unwrap_or(0);
    let mut merged_changed = changed_core.clone();
    merged_changed.extend(reg_written.iter().cloned());
    let mut merged_errors: Vec<ErrorRow> = core.as_ref().map(|c| c.errors.clone()).unwrap_or_default();
    merged_errors.extend(integ.as_ref().map(|c| c.errors.clone()).unwrap_or_default());
    let mut initial_protected: Vec<ProtectedRow> = core.as_ref().map(|c| c.protected_files.clone()).unwrap_or_default();
    initial_protected.extend(integ.as_ref().map(|c| c.protected_files.clone()).unwrap_or_default());
    let mut initial_declined: Vec<DeclinedRow> = core.as_ref().map(|c| c.declined.clone()).unwrap_or_default();
    initial_declined.extend(integ.as_ref().map(|c| c.declined.clone()).unwrap_or_default());
    let mut final_errors0 = merged_errors.clone();
    let prot0 = prot_now.unwrap();
    let generated_blocked = initial_protected.iter().any(|p| p.generated);
    let reported_regen: Vec<OutcomeRow> = outcomes.iter().filter(|x| x.kind == "regenerate").cloned().collect();
    let should_run_hooks = !hooks.is_empty() && (merged_files_changed > 0 || !reg_written.is_empty() || generated_blocked || !reported_regen.is_empty());
    let mut before_hooks: Vec<(PathBuf, Vec<u8>)> = Vec::new();
    if apply && should_run_hooks {
        let mut files: Vec<String> = initial_protected.iter().map(|p| p.file.clone()).collect();
        files.extend(reported_regen.iter().map(|x| x.file.clone()));
        for f in files {
            let abs = super::fsutil::resolve_from(cwd, &f);
            let rel = relative(cwd, &abs);
            if rel == ".." || rel.starts_with("../") || Path::new(&rel).is_absolute() {
                continue;
            }
            if let Ok(md) = std::fs::symlink_metadata(&abs) {
                if md.is_file() {
                    if let Ok(b) = std::fs::read(&abs) {
                        before_hooks.push((abs, b));
                    }
                }
            }
        }
    }
    let mut hook_modified: Vec<PathBuf> = Vec::new();
    let mut hook_failure: Option<String> = None;
    if should_run_hooks {
        let files: Vec<String> = unique_rel(cwd, &merged_changed);
        if let Err(herr) = super::hooks::run_post_codemod_hooks(ui, &hooks, config_path.as_deref(), cwd, &files, apply) {
            let msg = format!("Post-codemod hook failed: {}", herr);
            ui.error(&msg);
            let prot_regen = regeneration_protection_rows(&outcomes, &prot0, cwd);
            if initial_protected.is_empty() && prot_regen.is_empty() {
                ui.log("Upgrade failed\n");
                let mut errs = merged_errors.clone();
                errs.extend(regeneration_errors(&outcomes, &prot0, cwd));
                errs.push(ErrorRow { file: ".".into(), codemod: "post-codemod-hook".into(), error: msg.clone() });
                let mut stopped = stopped_receipt(ui, &current, &target, total, integrations.clone(), source_found, cwd, merged_changed.clone(), merged_applied, vec![], &outcomes, errs, initial_declined.clone(), "ERR_CODEMOD_FAILED", cbc);
                attach_registry(&mut stopped, reg);
                return Err(fail_with_receipt(msg, "ERR_CODEMOD_FAILED", stopped));
            }
            final_errors0 = merged_errors.clone();
            final_errors0.push(ErrorRow { file: ".".into(), codemod: "post-codemod-hook".into(), error: msg.clone() });
            hook_failure = Some(msg);
            ui.log("Regeneration failed; protected changes remain\n");
        }
        if apply {
            for (f, before) in &before_hooks {
                match std::fs::read(f) {
                    Ok(now) if now == *before => {}
                    _ => hook_modified.push(f.clone()),
                }
            }
        }
    }
    let mut remaining_protected = initial_protected.clone();
    let mut remaining_declined: Vec<DeclinedRow> = initial_declined.clone();
    let mut outcomes = outcomes;
    let mut final_prot = prot0;
    if apply && should_run_hooks && hook_failure.is_none() {
        let refreshed = match Resolver::new(cwd, Default::default()) {
            Ok(r) => r,
            Err(e) => {
                ui.error(&e.message);
                ui.log("Upgrade failed\n");
                if let Some(c) = &cbc {
                    log_cli_behind_core(ui, c, &target);
                }
                let mut prows = initial_protected.clone();
                prows.extend(regeneration_protection_rows(&outcomes, &final_prot, cwd));
                let mut errs = merged_errors.clone();
                errs.extend(regeneration_errors(&outcomes, &final_prot, cwd));
                errs.push(ErrorRow { file: ".".into(), codemod: "file-protection".into(), error: e.message.clone() });
                let mut ch = merged_changed.clone();
                ch.extend(hook_modified.iter().cloned());
                let mut stopped = stopped_receipt(ui, &current, &target, total, integrations.clone(), source_found, cwd, ch, merged_applied, prows, &outcomes, errs, initial_declined.clone(), "ERR_CODEMOD_PROTECTION_SOURCE", cbc);
                attach_registry(&mut stopped, reg);
                return Err(fail_with_receipt(e.message, "ERR_CODEMOD_PROTECTION_SOURCE", stopped));
            }
        };
        let mut re_outcomes: Vec<OutcomeRow> = Vec::new();
        let check_opts = RunOptions { apply: false, path: &path_, codemod: opts.codemod.as_deref(), skip: &skip, silent: true, root: cwd, covers_target: true };
        let check_prot = Resolver::new(cwd, Default::default()).unwrap_or_else(|_| Resolver::new(cwd, Default::default()).unwrap());
        let checked = match runner::run_codemods(ui.out, &manifests, &check_opts, check_prot, &mut re_outcomes) {
            RunOutcome::Done(r) => Some(r),
            RunOutcome::SourceMissing => None,
        };
        let integ_check = if has_integration {
            let staged: HashMap<PathBuf, String> = checked.as_ref().map(|c| c.staged_contents.clone()).unwrap_or_default();
            let prot = if !staged.is_empty() {
                Resolver::new(cwd, staged.iter().map(|(k, v)| (k.clone(), Some(v.clone()))).collect()).unwrap_or_else(|_| Resolver::new(cwd, Default::default()).unwrap())
            } else {
                Resolver::new(cwd, Default::default()).unwrap()
            };
            let io = runner::IntegrationRunOptions { apply: false, path: &path_, codemod: opts.codemod.as_deref(), skip: &skip, silent: true, root: cwd };
            let mut ignore = Vec::new();
            Some(runner::run_integration_codemods(ui.out, &integration_groups, &io, prot, staged, &mut ignore))
        } else {
            None
        };
        let mut rechecked: Vec<ProtectedRow> = checked.as_ref().map(|c| c.protected_files.clone()).unwrap_or_default();
        rechecked.extend(integ_check.as_ref().map(|c| c.protected_files.clone()).unwrap_or_default());
        let mut rechanged: Vec<String> = checked.as_ref().map(|c| c.changed_files.iter().map(|f| relative(cwd, f)).collect()).unwrap_or_default();
        rechanged.extend(integ_check.as_ref().map(|c| c.changed_files.iter().map(|f| relative(cwd, f)).collect::<Vec<_>>()).unwrap_or_default());
        for f in rechanged {
            rechecked.extend(initial_protected.iter().filter(|p| p.file == f).cloned());
        }
        remaining_protected = rechecked;
        remaining_declined = checked.as_ref().map(|c| c.declined.clone()).unwrap_or_default();
        remaining_declined.extend(integ_check.as_ref().map(|c| c.declined.clone()).unwrap_or_default());
        outcomes = re_outcomes;
        final_prot = refreshed;
        final_errors0 = merged_errors.clone();
        final_errors0.extend(checked.as_ref().map(|c| c.errors.clone()).unwrap_or_default());
        final_errors0.extend(integ_check.as_ref().map(|c| c.errors.clone()).unwrap_or_default());
    }
    merged_changed.extend(hook_modified.iter().cloned());
    let mut prot_rows = remaining_protected.clone();
    prot_rows.extend(regeneration_protection_rows(&outcomes, &final_prot, cwd));
    let protected_files = summarize_protected(&prot_rows);
    let mut declined_rows = remaining_declined;
    declined_rows.extend(manual_declined_rows(&outcomes));
    let pfiles: Vec<String> = protected_files.iter().map(|p| p.file.clone()).collect();
    let declined = summarize_declined(&declined_rows, &pfiles);
    log_declined(ui, &declined);
    let regen = summarize_regenerate(&protected_files, &outcomes);
    let mut final_errors = final_errors0;
    final_errors.extend(regeneration_errors(&outcomes, &final_prot, cwd));
    let blocked = !protected_files.is_empty();
    let complete = !blocked && final_errors.is_empty();
    let error_code = if blocked {
        Some("ERR_CODEMOD_PROTECTED".to_string())
    } else if !final_errors.is_empty() {
        Some("ERR_CODEMOD_FAILED".to_string())
    } else {
        None
    };
    let n = protected_files.len();
    log_protected_files(ui, &format!("ERR_CODEMOD_PROTECTED: {} protected file{} still require{} a codemod change:", n, if n == 1 { "" } else { "s" }, if n == 1 { "s" } else { "" }), &protected_files);
    log_regenerate(ui, &regen, &protected_files);
    let mut receipt = Receipt {
        from: current.clone(),
        to: target.clone(),
        codemods: total,
        integrations,
        agent_docs: AgentDocsSummary::current(&target),
        source_path_found: source_found,
        files_changed: merged_files_changed,
        transforms_applied: merged_applied,
        modified_files: unique_rel(cwd, &merged_changed),
        protected_files: protected_files.clone(),
        declined: declined.clone(),
        regenerate: regen,
        complete,
        error_code,
        errors: final_errors.clone(),
        cli_behind_core: None,
    };
    if !final_errors.is_empty() && !blocked {
        let msg = format!("Upgrade completed with {} codemod error{}.", final_errors.len(), if final_errors.len() == 1 { "" } else { "s" });
        ui.log("Upgrade failed\n");
        receipt.cli_behind_core = cbc;
        let mut j = receipt.to_json();
        attach_registry(&mut j, reg);
        return Err(fail_with_receipt(msg, "ERR_CODEMOD_FAILED", j));
    }
    if receipt.complete {
        let plan = prepare_agent_docs_refresh(ui, cwd, origin, &target, apply, cli_root);
        let ad = if apply { apply_agent_docs_refresh(ui, plan) } else { plan.summary };
        receipt.agent_docs = ad;
    }
    if let Some(c) = &cbc {
        log_cli_behind_core(ui, c, &target);
    }
    let done = if cbc.is_some() {
        "Upgrade incomplete"
    } else if apply {
        "Upgrade complete"
    } else {
        "Dry run complete"
    };
    let manual = count_manual(&declined);
    let manual_note = if manual > 0 { format!("; {} manual migration{} listed above", manual, if manual == 1 { "" } else { "s" }) } else { String::new() };
    let registry_ok = reg.as_ref().and_then(|r| r.get("ok")).and_then(|v| v.as_bool()).unwrap_or(true);
    let last = if !protected_files.is_empty() {
        "Upgrade incomplete: protected changes remain\n".to_string()
    } else if !registry_ok {
        "Upgrade finished with unresolved registry items\n".to_string()
    } else if source_found {
        format!("{}{}\n", done, manual_note)
    } else {
        let r = relative(cwd, &path_);
        format!(
            "{}{}, but {} does not exist, so no source files were scanned. Pass --path <your source directory> if your code does not live in ./src.\n",
            done,
            manual_note,
            if r.is_empty() { "." } else { &r }
        )
    };
    ui.log(&last);
    receipt.cli_behind_core = cbc;
    let mut data = receipt.to_json();
    attach_registry(&mut data, reg);
    Ok(Response { kind: "upgrade.run", data })
}

/// Insert `registryCompositions` where the JS spreads it (before `cliBehindCore`).
fn attach_registry(data: &mut Value, reg: Option<Value>) {
    let Some(reg) = reg else { return };
    if let Value::Object(m) = data {
        let cbc = m.shift_remove("cliBehindCore");
        m.insert("registryCompositions".into(), reg);
        if let Some(c) = cbc {
            m.insert("cliBehindCore".into(), c);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn stopped_receipt(
    ui: &mut Ui,
    from: &str,
    to: &str,
    codemods: usize,
    integrations: Vec<String>,
    source_found: bool,
    cwd: &Path,
    changed: Vec<PathBuf>,
    applied: usize,
    protected_rows: Vec<ProtectedRow>,
    outcomes: &[OutcomeRow],
    errors: Vec<ErrorRow>,
    declined_rows: Vec<DeclinedRow>,
    code: &str,
    cbc: Option<CliBehindCore>,
) -> Value {
    let protected_files = summarize_protected(&protected_rows);
    let modified = unique_rel(cwd, &changed);
    let regen = summarize_regenerate(&protected_files, outcomes);
    log_regenerate(ui, &regen, &[]);
    let mut rows = declined_rows;
    rows.extend(manual_declined_rows(outcomes));
    let pfiles: Vec<String> = protected_rows.iter().map(|p| p.file.clone()).collect();
    let declined = summarize_declined(&rows, &pfiles);
    log_declined(ui, &declined);
    let r = Receipt {
        from: from.into(),
        to: to.into(),
        codemods,
        integrations,
        agent_docs: AgentDocsSummary::current(to),
        source_path_found: source_found,
        files_changed: modified.len(),
        transforms_applied: applied,
        modified_files: modified,
        protected_files,
        declined,
        regenerate: regen,
        complete: false,
        error_code: Some(code.into()),
        errors,
        cli_behind_core: cbc,
    };
    r.to_json()
}

pub struct ProjectContext {
    pub integrations: Vec<String>,
    pub records: Vec<crate::discovery::integrations::Record>,
    pub icon_sets: bool,
    pub hooks: Vec<Value>,
    pub config_path: Option<String>,
}

/// `loadProjectContext(cwd, extraIntegrationSpecs)`: integration names (for
/// the receipt) and the postCodemod hooks, or the config load error.
fn load_project_context(cwd: &Path, extra_specs: &[String]) -> Result<ProjectContext, String> {
    use crate::discovery::integrations as integ;
    let project = crate::discovery::project::Project::load_opts(&s(cwd), true, true)?;
    let hooks = project.config.get("hooks").and_then(|h| h.get("postCodemod")).and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let configured: HashSet<String> = project.integrations.iter().cloned().collect();
    let mut names: Vec<String> = Vec::new();
    let mut records: Vec<integ::Record> = Vec::new();
    let name_of = |r: &integ::Record| integ::s(r, "name").filter(|n| !n.is_empty()).or_else(|| integ::s(r, "__spec")).unwrap_or("").to_string();
    for r in &project.loaded_integrations {
        let autolinked = integ::has(r, "__autolinked");
        let spec = integ::s(r, "__spec").unwrap_or("").to_string();
        // upgrade's codemod rule: autolinked and local packages are not listed.
        let keep = !autolinked && configured.contains(&spec);
        if keep && !integ::has(r, "__providerConflict") {
            records.push(r.clone());
            let n = name_of(r);
            if !names.contains(&n) {
                names.push(n);
            }
        }
    }
    let mut seen = HashSet::new();
    let extras: Vec<String> = extra_specs.iter().filter(|x| !x.is_empty() && seen.insert((*x).clone())).filter(|x| !configured.contains(*x)).cloned().collect();
    if !extras.is_empty() {
        let loaded = integ::load_integrations(&extras, &s(cwd), false)?;
        for r in &loaded {
            records.push(r.clone());
            let n = name_of(r);
            if !names.contains(&n) {
                names.push(n);
            }
        }
    }
    let icon_sets = project.config.get("experimental").and_then(|e| e.get("iconSet")).map(|v| !(v.is_null() || *v == Value::Bool(false) || v.get("__js").is_some() && v.get("__js").and_then(|x| x.as_str()) == Some("undefined"))).unwrap_or(false);
    Ok(ProjectContext { integrations: names, records, icon_sets, hooks, config_path: project.config_path.clone() })
}


/// `selectIntegrationCodemodsFor(integrations, from, to)`: an integration
/// whose codemods fail to load is skipped.
fn select_integration_codemods_for(records: &[crate::discovery::integrations::Record], from: &str, to: &str) -> Vec<(String, Vec<super::integration_discovery::IntegrationCodemod>)> {
    use super::integration_discovery as idisc;
    let mut by: Vec<(String, Vec<idisc::IntegrationCodemod>)> = Vec::new();
    for r in records {
        if crate::discovery::integrations::s(r, "codemods").map(|c| c.is_empty()).unwrap_or(true) {
            continue;
        }
        if let Ok(groups) = idisc::discover_integration_codemods(std::slice::from_ref(r)) {
            for (v, list) in groups {
                match by.iter_mut().find(|(x, _)| *x == v) {
                    Some((_, l)) => l.extend(list),
                    None => by.push((v, list)),
                }
            }
        }
    }
    idisc::select_integration_codemods(&by, from, to)
}
