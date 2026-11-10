//! Port of `api/gap-report/gap-report.mjs`: validate the report, pick the
//! package that owns it, then send it to every handler, or with none to the
//! owner's issues URL.

use crate::json::{Map, Value};
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub const CORE_PACKAGE: &str = "@astryxdesign/core";
pub const DEFAULT_ISSUES_URL: &str = "https://github.com/meta/astryx/issues/new";
const HANDLER_TIMEOUT: Duration = Duration::from_secs(30);

pub const CATEGORIES: [(&str, &str); 8] = [
    ("missing_component", "Missing component"),
    ("missing_variant", "Missing variant or prop"),
    ("layout_gap", "Layout gap"),
    ("styling_gap", "Styling gap"),
    ("a11y_gap", "Accessibility gap"),
    ("api_friction", "API friction"),
    ("docs_gap", "Documentation gap"),
    ("other", "Other"),
];

pub const PUBLIC_CONFIRMATION_MESSAGE: &str = "Rerun with --confirm-public to file this report.";
pub const ASK_DESTINATION_MESSAGE: &str = "Ask the person where to file this report, then pass their choice with --to <package>. Never pick a package destination yourself; leave --to out to use the default.";

/// An `AstryxError`: message, suggestions (name, reason), code.
#[derive(Debug, Clone, PartialEq)]
pub struct GapError {
    pub message: String,
    pub suggestions: Option<Vec<(String, String)>>,
    pub code: String,
}

impl GapError {
    pub fn new(message: impl Into<String>, suggestions: Option<Vec<(String, String)>>, code: &str) -> Self {
        GapError { message: message.into(), suggestions, code: code.to_string() }
    }
}

#[derive(Debug, Clone, Default)]
pub struct GapOptions {
    pub category: Option<String>,
    pub reason: Option<String>,
    pub detail: Option<String>,
    pub package: Option<String>,
    pub confirm_public: bool,
    pub list_categories: bool,
    pub to: Option<String>,
}

/// One loaded (or failed) integration, as the project lists it.
#[derive(Debug, Clone, Default)]
pub struct Integration {
    pub name: String,
    /// The spec as written in config (`__spec`).
    pub spec: Option<String>,
    pub version: Option<String>,
    pub issues_url: Option<String>,
    pub load_error: Option<String>,
    pub gap_report_error: Option<String>,
    /// A valid `gapReport` named export.
    pub handler: Option<Handler>,
    pub manifest_file: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Handler {
    /// "internal" or "public".
    pub audience: String,
    /// Identity of the `handle` function, for dedupe (same function object).
    pub identity: String,
}

/// What gap-report reads from the project. Discovery provides the real one.
pub trait GapProject {
    fn config_issues_url(&self) -> Option<String>;
    fn config_path(&self) -> Option<String>;
    fn project_handler(&self) -> Option<Handler>;
    fn integrations(&self) -> Vec<Integration>;
    /// The owner rule of `selectTarget` without the explicit package: the
    /// replacing package, else the unique owner, else none (Core). Errors
    /// carry ERR_AMBIGUOUS_COMPONENT.
    fn route_owner(&self, component: &str) -> Result<Option<String>, GapError>;
}

/// Runs a handler's `handle(report, {signal})` in isolation.
pub trait HandlerRunner {
    fn call(&self, module_path: &str, source: HandlerSource, report: &Value) -> RunOutcome;
}

/// How one isolated handler call ended (the worker's messages).
#[derive(Debug, Clone, PartialEq)]
pub enum RunOutcome {
    /// The resolved value; `None` for `undefined`.
    Returned(Option<Value>),
    /// A throw or rejection: the error's message.
    Threw(String),
    /// The handler changed `process.exitCode`.
    ExitCode,
    /// The handler called `process.exit(code)`; `None` prints `undefined`.
    Exit(Option<String>),
    TimedOut,
}

/// `parseGapReportReceipt` then the delivery outcome `callHandler` records.
pub fn outcome_of(run: RunOutcome) -> DeliveryOutcome {
    match run {
        RunOutcome::Threw(m) => failed(m),
        RunOutcome::ExitCode => failed("Handler changed process.exitCode."),
        RunOutcome::Exit(code) => failed(format!(
            "Handler called process.exit({}).",
            code.unwrap_or_else(|| "undefined".into())
        )),
        RunOutcome::TimedOut => failed("Gap report handler timed out."),
        RunOutcome::Returned(v) => match v.as_ref().and_then(parse_receipt) {
            Some(o) => o,
            None => failed("Handler returned an invalid receipt."),
        },
    }
}

fn is_http_url(s: &str) -> bool {
    let l = s.to_ascii_lowercase();
    let rest = if let Some(r) = l.strip_prefix("https:") {
        r
    } else if let Some(r) = l.strip_prefix("http:") {
        r
    } else {
        return false;
    };
    let host = rest.trim_start_matches(['/', '\\']);
    let end = host.find(['/', '\\', '?', '#']).unwrap_or(host.len());
    let host = &host[..end];
    let host = host.rsplit('@').next().unwrap_or("");
    !host.is_empty() && !host.contains(' ')
}

/// `parseGapReportReceipt`: a strict `{status, url?, message?}`.
pub fn parse_receipt(v: &Value) -> Option<DeliveryOutcome> {
    let m = v.as_object()?;
    if m.keys().any(|k| !matches!(k.as_str(), "status" | "url" | "message")) {
        return None;
    }
    let status = m.get("status")?.as_str()?;
    if !matches!(status, "filed" | "routed_only" | "skipped") {
        return None;
    }
    let text = |k: &str| -> Result<Option<String>, ()> {
        match m.get(k) {
            None => Ok(None),
            Some(Value::String(s)) => Ok(Some(js_trim(s).to_string()).filter(|s| !s.is_empty())),
            Some(_) => Err(()),
        }
    };
    let url = text("url").ok()?;
    let message = text("message").ok()?;
    if status == "routed_only" && url.is_none() {
        return None;
    }
    if let Some(u) = &url {
        if !is_http_url(u) {
            return None;
        }
    }
    if message.as_ref().is_some_and(|m| m.chars().count() > 2000) {
        return None;
    }
    if status != "skipped" && url.is_none() && message.is_none() {
        return None;
    }
    Some(DeliveryOutcome { status: status.into(), url, message })
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum HandlerSource {
    Project,
    Integration,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DeliveryOutcome {
    pub status: String,
    pub url: Option<String>,
    pub message: Option<String>,
}

pub fn failed(message: impl Into<String>) -> DeliveryOutcome {
    DeliveryOutcome { status: "failed".into(), url: None, message: Some(message.into()) }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Delivery {
    pub handler_type: String,
    pub handler: String,
    pub audience: Option<String>,
    pub status: String,
    pub url: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Destination {
    pub to: Option<String>,
    pub default: bool,
    pub issues_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Receipt {
    pub status: String,
    pub package: String,
    pub issues_url: Option<String>,
    pub deliveries: Vec<Delivery>,
    pub filed_count: usize,
    pub routed_only_count: usize,
    /// With `ask`.
    pub destinations: Option<Vec<Destination>>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum GapResult {
    Categories { destinations: Option<Vec<Destination>> },
    File(Receipt),
}

const ERR_MISSING_ARGUMENT: &str = "ERR_MISSING_ARGUMENT";
const ERR_INVALID_ARGUMENT: &str = "ERR_INVALID_ARGUMENT";
const ERR_UNKNOWN_CATEGORY: &str = "ERR_UNKNOWN_CATEGORY";
const ERR_UNKNOWN_PACKAGE: &str = "ERR_UNKNOWN_PACKAGE";
const ERR_NOT_FOUND: &str = "ERR_NOT_FOUND";

/// `String#trim`: JS whitespace and line terminators.
pub fn js_trim(s: &str) -> &str {
    let ws = |c: char| {
        matches!(
            c,
            '\u{9}' | '\u{a}' | '\u{b}' | '\u{c}' | '\u{d}' | ' ' | '\u{a0}' | '\u{1680}'
                | '\u{2000}'..='\u{200a}'
                | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
        )
    };
    s.trim_matches(ws)
}

/// `Array.from(value).length`: code points (lone surrogates count as one,
/// which a Rust `str` never holds).
fn character_count(s: &str) -> usize {
    s.chars().count()
}

fn required_text(value: Option<&str>, label: &str, max: usize) -> Result<String, GapError> {
    let v = match value {
        Some(v) if !js_trim(v).is_empty() => js_trim(v),
        _ => return Err(GapError::new(format!("{label} is required."), None, ERR_MISSING_ARGUMENT)),
    };
    if character_count(v) > max {
        return Err(GapError::new(
            format!("{label} must be {max} characters or fewer."),
            None,
            ERR_INVALID_ARGUMENT,
        ));
    }
    Ok(v.to_string())
}

fn optional_detail(value: Option<&str>) -> Result<Option<String>, GapError> {
    let v = match value {
        None | Some("") => return Ok(None),
        Some(v) => js_trim(v),
    };
    if v.is_empty() {
        return Ok(None);
    }
    if character_count(v) > 8000 {
        return Err(GapError::new("detail must be 8000 characters or fewer.", None, ERR_INVALID_ARGUMENT));
    }
    Ok(Some(v.to_string()))
}

struct Target {
    package: String,
    version: Option<String>,
    issues_url: Option<String>,
}

fn issues_url_for(project: &dyn GapProject, ints: &[Integration], pkg: &str) -> Option<String> {
    if pkg.is_empty() || pkg == CORE_PACKAGE {
        return Some(project.config_issues_url().unwrap_or_else(|| DEFAULT_ISSUES_URL.to_string()));
    }
    ints.iter().find(|i| i.name == pkg).and_then(|i| i.issues_url.clone())
}

fn target_for_package(project: &dyn GapProject, ints: &[Integration], pkg: &str) -> Result<Target, GapError> {
    if pkg == CORE_PACKAGE {
        return Ok(Target {
            package: CORE_PACKAGE.into(),
            version: None,
            issues_url: issues_url_for(project, ints, CORE_PACKAGE),
        });
    }
    let Some(i) = ints.iter().find(|i| i.name == pkg || i.spec.as_deref() == Some(pkg)) else {
        return Err(GapError::new(
            format!("No loaded integration package named \"{pkg}\"."),
            Some(ints.iter().map(|i| (i.name.clone(), "loaded integration".to_string())).collect()),
            ERR_UNKNOWN_PACKAGE,
        ));
    };
    Ok(Target {
        package: i.name.clone(),
        version: i.version.clone(),
        issues_url: issues_url_for(project, ints, &i.name),
    })
}

fn list_destinations(ints: &[Integration]) -> Vec<Destination> {
    let mut out = vec![Destination { to: None, default: true, issues_url: None }];
    for i in ints {
        let Some(url) = i.issues_url.as_ref().filter(|u| !u.is_empty()) else { continue };
        if i.load_error.is_some() {
            continue;
        }
        if out.iter().any(|d| d.to.as_deref() == Some(i.name.as_str())) {
            continue;
        }
        out.push(Destination { to: Some(i.name.clone()), default: false, issues_url: Some(url.clone()) });
    }
    out
}

fn aggregate_status(deliveries: &[Delivery]) -> &'static str {
    if deliveries.is_empty() {
        return "skipped";
    }
    let has = |s: &str| deliveries.iter().any(|d| d.status == s);
    let all = |s: &str| deliveries.iter().all(|d| d.status == s);
    if all("consent_required") {
        return "consent_required";
    }
    if all("skipped") {
        return "skipped";
    }
    if all("failed") {
        return "failed";
    }
    if !has("filed") && has("routed_only") && !has("failed") {
        return "routed_only";
    }
    let filed = has("filed");
    let fail = has("failed");
    let handled = has("routed_only") || has("skipped") || has("consent_required");
    if fail && (filed || handled) {
        return "partial";
    }
    if fail {
        return "failed";
    }
    if filed {
        return "filed";
    }
    if has("routed_only") {
        return "routed_only";
    }
    if has("consent_required") {
        return "consent_required";
    }
    "skipped"
}

/// `githubRoute`: `https://github.com/<owner>/<repo>/issues[/new]`.
pub fn github_route(issues_url: &str) -> Option<String> {
    let rest = parse_https_github(issues_url)?;
    let parts: Vec<&str> = rest.split('/').filter(|p| !p.is_empty()).collect();
    if parts.len() < 3 || parts.len() > 4 || parts[2] != "issues" || (parts.len() == 4 && parts[3] != "new") {
        return None;
    }
    Some(format!("{}/{}", parts[0], parts[1]))
}

/// The pathname of a WHATWG URL whose scheme is https and host github.com,
/// for the inputs an issues URL takes. Query and fragment are dropped.
fn parse_https_github(s: &str) -> Option<String> {
    let s = s.trim_matches(|c: char| c <= ' ');
    let s: String = s.chars().filter(|c| !matches!(c, '\t' | '\n' | '\r')).collect();
    let colon = s.find(':')?;
    if !s[..colon].eq_ignore_ascii_case("https") {
        return None;
    }
    let mut rest = &s[colon + 1..];
    rest = rest.trim_start_matches(['/', '\\']);
    let end = rest.find(['/', '\\', '?', '#']).unwrap_or(rest.len());
    let mut host = &rest[..end];
    if let Some(at) = host.rfind('@') {
        host = &host[at + 1..];
    }
    let host = host.strip_suffix(":443").unwrap_or(host);
    let host = host.strip_suffix('.').unwrap_or(host);
    if !host.eq_ignore_ascii_case("github.com") {
        return None;
    }
    let after = &rest[end..];
    let path_end = after.find(['?', '#']).unwrap_or(after.len());
    Some(after[..path_end].replace('\\', "/"))
}

pub struct RouteReport {
    pub component: String,
    pub category_label: String,
    pub intention: String,
    pub detail: Option<String>,
    pub source: String,
    pub timestamp: String,
}

/// `str.slice(0, n)` in UTF-16 code units.
fn utf16_slice(s: &str, n: usize) -> String {
    let units: Vec<u16> = s.encode_utf16().take(n).collect();
    String::from_utf16_lossy(&units)
}

fn run_github(report: &RouteReport, repo: &str) -> DeliveryOutcome {
    let title = format!("[gap] {}: {}", report.component, utf16_slice(&report.intention, 70));
    let mut lines = vec![
        format!("Component: {}", report.component),
        format!("Category: {}", report.category_label),
        format!("Source: {}", report.source),
        format!("Reported: {}", report.timestamp),
        String::new(),
        "## Intention".into(),
        String::new(),
        report.intention.clone(),
    ];
    if let Some(d) = &report.detail {
        lines.extend([String::new(), "## Additional context".into(), String::new(), d.clone()]);
    }
    let body = lines.join("\n");
    let fail = DeliveryOutcome {
        status: "failed".into(),
        url: None,
        message: Some("GitHub CLI could not create the routed issue. Install and authenticate gh, then retry.".into()),
    };
    let child = Command::new("gh")
        .args(["issue", "create", "--repo", repo, "--title", &title, "--body", &body])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let Ok(mut child) = child else { return fail };
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let out_t = std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = stdout.read_to_end(&mut b);
        b
    });
    let err_t = std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = stderr.read_to_end(&mut b);
    });
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break Some(s),
            Ok(None) if start.elapsed() < HANDLER_TIMEOUT => std::thread::sleep(Duration::from_millis(10)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };
    let out = out_t.join().unwrap_or_default();
    let _ = err_t.join();
    match status {
        Some(s) if s.success() => {
            let text = String::from_utf8_lossy(&out);
            let value = js_trim(&text).to_string();
            let is_url = {
                let l = value.to_ascii_lowercase();
                (l.starts_with("https://") || l.starts_with("http://")) && value.len() > 8
            };
            let url = if is_url { Some(value.clone()) } else { None };
            let message = if url.is_some() {
                "Gap report filed.".to_string()
            } else if value.is_empty() {
                "Gap report filed.".to_string()
            } else {
                value
            };
            DeliveryOutcome { status: "filed".into(), url, message: Some(message) }
        }
        _ => fail,
    }
}

fn deliver_to_issues_url(issues_url: &str, report: &RouteReport, confirm: bool) -> Delivery {
    let gh = github_route(issues_url);
    let mk = |handler: &str, audience: Option<&str>, o: DeliveryOutcome| Delivery {
        handler_type: "fallback".into(),
        handler: handler.into(),
        audience: audience.map(String::from),
        status: o.status,
        url: o.url,
        message: o.message,
    };
    match gh {
        Some(_) if !confirm => mk(
            "github",
            Some("public"),
            DeliveryOutcome {
                status: "consent_required".into(),
                url: None,
                message: Some(PUBLIC_CONFIRMATION_MESSAGE.into()),
            },
        ),
        Some(repo) => mk("github", Some("public"), run_github(report, &repo)),
        None => mk(
            "issuesUrl",
            None,
            DeliveryOutcome {
                status: "routed_only".into(),
                url: Some(issues_url.into()),
                message: Some("No automatic handler is available; open the routed URL to file this report.".into()),
            },
        ),
    }
}

/// `JSON.stringify(String(to).slice(0, 214))`.
fn quoted(s: &str) -> String {
    let mut out = String::new();
    crate::json::quote(&mut out, &utf16_slice(s, 214));
    out
}

pub struct Env<'a> {
    /// Loads the project; `Err` when no project loads (only the categories
    /// listing tolerates that).
    pub project: &'a dyn Fn() -> Result<Box<dyn GapProject>, GapError>,
    pub runner: &'a dyn HandlerRunner,
    pub source: String,
    pub timestamp: String,
}

pub fn gap_report(component: Option<&str>, o: &GapOptions, env: &Env) -> Result<GapResult, GapError> {
    if o.list_categories {
        let mut ignored = Vec::new();
        let truthy = |v: &Option<String>| v.as_deref().is_some_and(|s| !s.is_empty());
        if component.is_some_and(|s| !s.is_empty()) {
            ignored.push("component");
        }
        if truthy(&o.category) {
            ignored.push("--category");
        }
        if truthy(&o.reason) {
            ignored.push("--reason");
        }
        if truthy(&o.detail) {
            ignored.push("--additional-context");
        }
        if truthy(&o.package) {
            ignored.push("--package");
        }
        if o.confirm_public {
            ignored.push("--confirm-public");
        }
        if o.to.is_some() {
            ignored.push("--to");
        }
        if !ignored.is_empty() {
            return Err(GapError::new(
                format!(
                    "`--list-categories` cannot be combined with {}: it lists categories and ignores submission options.",
                    ignored.join(", ")
                ),
                None,
                ERR_INVALID_ARGUMENT,
            ));
        }
        let destinations = match (env.project)() {
            Ok(p) => list_destinations(&p.integrations()),
            Err(_) => vec![Destination { to: None, default: true, issues_url: None }],
        };
        return Ok(GapResult::Categories {
            destinations: if destinations.len() > 1 { Some(destinations) } else { None },
        });
    }

    let component = required_text(component, "component", 120)?;
    let category = required_text(o.category.as_deref(), "category", 80)?;
    let Some(&(cat_value, cat_label)) = CATEGORIES.iter().find(|(v, _)| *v == category) else {
        return Err(GapError::new(
            format!("Unknown gap category \"{category}\"."),
            Some(CATEGORIES.iter().map(|(v, l)| (v.to_string(), l.to_string())).collect()),
            ERR_UNKNOWN_CATEGORY,
        ));
    };
    let intention = required_text(o.reason.as_deref(), "reason", 2000)?;
    let detail = optional_detail(o.detail.as_deref())?;
    let project = (env.project)()?;
    let ints = project.integrations();
    let target = match o.package.as_deref().filter(|p| !p.is_empty()) {
        Some(p) => target_for_package(&*project, &ints, p)?,
        None => match project.route_owner(&component)? {
            Some(owner) => target_for_package(&*project, &ints, &owner)?,
            None => target_for_package(&*project, &ints, CORE_PACKAGE)?,
        },
    };

    let destinations = list_destinations(&ints);
    let mut chosen: Option<Destination> = None;
    if let Some(to) = &o.to {
        chosen = destinations.iter().find(|d| !d.default && d.to.as_deref() == Some(to.as_str())).cloned();
        if chosen.is_none() {
            let choices: Vec<&Destination> = destinations.iter().filter(|d| !d.default).collect();
            let named = quoted(to);
            let message = if choices.is_empty() {
                format!("No gap-report destination {named}: no loaded integration names an issues URL. Leave out --to for the default.")
            } else {
                format!(
                    "No gap-report destination {named}. Choose one of: {}; or leave out --to for the default.",
                    choices.iter().map(|d| d.to.clone().unwrap_or_default()).collect::<Vec<_>>().join(", ")
                )
            };
            return Err(GapError::new(
                message,
                Some(
                    choices
                        .iter()
                        .map(|d| (d.to.clone().unwrap_or_default(), d.issues_url.clone().unwrap_or_default()))
                        .collect(),
                ),
                ERR_UNKNOWN_PACKAGE,
            ));
        }
    }

    let route = RouteReport {
        component: component.clone(),
        category_label: cat_label.into(),
        intention: intention.clone(),
        detail: detail.clone(),
        source: env.source.clone(),
        timestamp: env.timestamp.clone(),
    };

    let mut deliveries = Vec::new();
    if let Some(c) = &chosen {
        deliveries.push(deliver_to_issues_url(c.issues_url.as_deref().unwrap_or(""), &route, o.confirm_public));
    } else {
        let entries = collect_handlers(&*project, &ints);
        if !entries.is_empty() {
            let report = report_value(&route, cat_value, &target);
            for e in entries {
                deliveries.push(deliver_entry(e, &report, o.confirm_public, env.runner));
            }
        } else {
            let Some(url) = target.issues_url.clone() else {
                return Err(GapError::new(
                    format!("Package \"{}\" provides neither a report handler nor an issues URL.", target.package),
                    None,
                    ERR_NOT_FOUND,
                ));
            };
            deliveries.push(deliver_to_issues_url(&url, &route, o.confirm_public));
        }
    }

    let filed_count = deliveries.iter().filter(|d| d.status == "filed").count();
    let routed_only_count = deliveries.iter().filter(|d| d.status == "routed_only").count();
    let status = aggregate_status(&deliveries).to_string();
    Ok(GapResult::File(Receipt {
        status,
        package: target.package,
        issues_url: match &chosen {
            Some(c) => c.issues_url.clone(),
            None => target.issues_url,
        },
        deliveries,
        filed_count,
        routed_only_count,
        destinations: if chosen.is_none() && destinations.len() > 1 { Some(destinations) } else { None },
    }))
}

enum Entry {
    Handler { handler_type: &'static str, name: String, handler: Handler, module: String, source: HandlerSource },
    Malformed { name: String, error: String },
}

fn collect_handlers(project: &dyn GapProject, ints: &[Integration]) -> Vec<Entry> {
    let mut entries = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    if let Some(h) = project.project_handler() {
        seen.push(h.identity.clone());
        entries.push(Entry::Handler {
            handler_type: "project",
            name: "project".into(),
            handler: h,
            module: project.config_path().unwrap_or_default(),
            source: HandlerSource::Project,
        });
    }
    for i in ints {
        if let Some(e) = &i.load_error {
            entries.push(Entry::Malformed {
                name: i.name.clone(),
                error: format!("Integration failed to load, so it could not receive this report: {e}. Fix the package or remove it from integrations in astryx.config, then rerun."),
            });
            continue;
        }
        if let Some(e) = &i.gap_report_error {
            entries.push(Entry::Malformed { name: i.name.clone(), error: e.clone() });
            continue;
        }
        let Some(h) = &i.handler else { continue };
        if seen.contains(&h.identity) {
            continue;
        }
        seen.push(h.identity.clone());
        entries.push(Entry::Handler {
            handler_type: "integration",
            name: i.name.clone(),
            handler: h.clone(),
            module: i.manifest_file.clone(),
            source: HandlerSource::Integration,
        });
    }
    entries
}

fn deliver_entry(e: Entry, report: &Value, confirm: bool, runner: &dyn HandlerRunner) -> Delivery {
    match e {
        Entry::Malformed { name, error } => Delivery {
            handler_type: "integration".into(),
            handler: name,
            audience: None,
            status: "failed".into(),
            url: None,
            message: Some(error),
        },
        Entry::Handler { handler_type, name, handler, module, source } => {
            let o = if handler.audience == "public" && !confirm {
                DeliveryOutcome {
                    status: "consent_required".into(),
                    url: None,
                    message: Some(PUBLIC_CONFIRMATION_MESSAGE.into()),
                }
            } else {
                outcome_of(runner.call(&module, source, report))
            };
            Delivery {
                handler_type: handler_type.into(),
                handler: name,
                audience: Some(handler.audience),
                status: o.status,
                url: o.url,
                message: o.message,
            }
        }
    }
}

fn opt(v: &Option<String>) -> Value {
    v.clone().map(Value::String).unwrap_or(Value::Null)
}

fn report_value(r: &RouteReport, category: &str, t: &Target) -> Value {
    let mut m = Map::new();
    m.insert("schemaVersion".into(), Value::from(1));
    m.insert("component".into(), Value::String(r.component.clone()));
    m.insert("category".into(), Value::String(category.into()));
    m.insert("categoryLabel".into(), Value::String(r.category_label.clone()));
    m.insert("intention".into(), Value::String(r.intention.clone()));
    if let Some(d) = &r.detail {
        m.insert("detail".into(), Value::String(d.clone()));
    }
    m.insert("source".into(), Value::String(r.source.clone()));
    m.insert("timestamp".into(), Value::String(r.timestamp.clone()));
    let mut tm = Map::new();
    tm.insert("package".into(), Value::String(t.package.clone()));
    tm.insert("version".into(), opt(&t.version));
    tm.insert("issuesUrl".into(), opt(&t.issues_url));
    m.insert("target".into(), Value::Object(tm));
    Value::Object(m)
}

// ---- JSON shapes ----

pub fn destination_value(d: &Destination) -> Value {
    let mut m = Map::new();
    m.insert("to".into(), opt(&d.to));
    m.insert("default".into(), Value::Bool(d.default));
    m.insert("issuesUrl".into(), opt(&d.issues_url));
    Value::Object(m)
}

pub fn delivery_value(d: &Delivery) -> Value {
    let mut m = Map::new();
    m.insert("handlerType".into(), Value::String(d.handler_type.clone()));
    m.insert("handler".into(), Value::String(d.handler.clone()));
    m.insert("audience".into(), opt(&d.audience));
    m.insert("status".into(), Value::String(d.status.clone()));
    m.insert("url".into(), opt(&d.url));
    m.insert("message".into(), opt(&d.message));
    Value::Object(m)
}

/// The response `{type, data, meta?}` that `jsonOut` wraps.
pub fn response_value(r: &GapResult) -> (String, Value, Option<Map<String, Value>>) {
    match r {
        GapResult::Categories { destinations } => {
            let data = Value::Array(
                CATEGORIES
                    .iter()
                    .map(|(v, l)| {
                        let mut m = Map::new();
                        m.insert("value".into(), Value::String(v.to_string()));
                        m.insert("label".into(), Value::String(l.to_string()));
                        Value::Object(m)
                    })
                    .collect(),
            );
            let meta = destinations.as_ref().map(|ds| {
                let mut m = Map::new();
                m.insert("destinations".into(), Value::Array(ds.iter().map(destination_value).collect()));
                m.insert("ask".into(), Value::String(ASK_DESTINATION_MESSAGE.into()));
                m
            });
            ("gap-report.categories".into(), data, meta)
        }
        GapResult::File(rc) => {
            let mut m = Map::new();
            m.insert("status".into(), Value::String(rc.status.clone()));
            m.insert("package".into(), Value::String(rc.package.clone()));
            m.insert("issuesUrl".into(), opt(&rc.issues_url));
            m.insert("deliveries".into(), Value::Array(rc.deliveries.iter().map(delivery_value).collect()));
            m.insert("filedCount".into(), Value::from(rc.filed_count));
            m.insert("routedOnlyCount".into(), Value::from(rc.routed_only_count));
            if let Some(ds) = &rc.destinations {
                m.insert("destinations".into(), Value::Array(ds.iter().map(destination_value).collect()));
                m.insert("ask".into(), Value::String(ASK_DESTINATION_MESSAGE.into()));
            }
            ("gap-report.file".into(), Value::Object(m), None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_routes() {
        assert_eq!(github_route("https://github.com/meta/astryx/issues").as_deref(), Some("meta/astryx"));
        assert_eq!(github_route("https://github.com/meta/astryx/issues/new").as_deref(), Some("meta/astryx"));
        assert_eq!(github_route("https://GitHub.com/a/b/issues/new?x=1").as_deref(), Some("a/b"));
        assert_eq!(github_route("https://github.com/a/b/issues/1"), None);
        assert_eq!(github_route("http://github.com/a/b/issues"), None);
        assert_eq!(github_route("https://gitlab.com/a/b/issues"), None);
    }

    #[test]
    fn statuses() {
        let d = |s: &str| Delivery {
            handler_type: "x".into(),
            handler: "x".into(),
            audience: None,
            status: s.into(),
            url: None,
            message: None,
        };
        assert_eq!(aggregate_status(&[d("failed"), d("filed")]), "partial");
        assert_eq!(aggregate_status(&[d("routed_only"), d("skipped")]), "routed_only");
        assert_eq!(aggregate_status(&[d("skipped"), d("consent_required")]), "consent_required");
        assert_eq!(aggregate_status(&[d("filed"), d("skipped")]), "filed");
    }
}
