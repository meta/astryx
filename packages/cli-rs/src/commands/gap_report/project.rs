//! The project view, handler runner and env facts gap-report reads.
//! TEMP: `invocation_source` until the shell ports the debug env capture.

use super::api::{GapError, GapProject, Handler, HandlerRunner, HandlerSource, Integration, RunOutcome};
use crate::json::Value;
use std::io::IsTerminal;
use std::path::Path;

use crate::discovery::component_discovery::{self as cd, LoadedIntegration, NameHold};
use crate::discovery::integrations::{self as integ, Record};
use crate::discovery::project::Project;
use std::path::PathBuf;

/// The project gap-report reads: `Project.load(cwd)` and its loaded
/// integrations.
struct RealProject {
    cwd: String,
    project: Project,
}

fn handler_of(v: Option<&Value>, module: &str) -> Option<Handler> {
    let h = v.filter(|v| !crate::discovery::docmod::is_nullish(Some(v)))?;
    let audience = h.get("audience").and_then(|a| a.as_str())?.to_string();
    let name = h.get("handle").and_then(|f| f.get("name")).and_then(|n| n.as_str()).unwrap_or("");
    let id = h.get("handle").and_then(|f| f.get("id")).map(|i| i.to_string());
    // Identity of the `handle` function: the engine's id when it gives one,
    // else its name in its module.
    Some(Handler { audience, identity: id.unwrap_or_else(|| format!("{module}\0{name}")) })
}

fn str_of(r: &Record, k: &str) -> Option<String> {
    integ::s(r, k).map(String::from)
}

/// A loaded integration record as component discovery takes it.
pub fn loaded_integration(r: &Record) -> LoadedIntegration {
    LoadedIntegration {
        name: str_of(r, "name").unwrap_or_default(),
        version: str_of(r, "version"),
        components: str_of(r, "components").map(PathBuf::from),
        issues_url: str_of(r, "issuesUrl"),
        package_dir: str_of(r, "__packageDir").map(PathBuf::from),
        package_exports: r.get("__packageExports").cloned(),
        provider_id: str_of(r, "providerId"),
        autolinked: r.get("__autolinked").and_then(|v| v.as_bool()) == Some(true),
        load_error: integ::has(r, "__loadError"),
    }
}

impl GapProject for RealProject {
    fn config_issues_url(&self) -> Option<String> {
        self.project.config.get("issuesUrl").and_then(|v| v.as_str()).map(String::from)
    }
    fn config_path(&self) -> Option<String> {
        self.project.config_path.clone()
    }
    fn project_handler(&self) -> Option<Handler> {
        handler_of(self.project.config.get("gapReport"), &self.project.config_path.clone().unwrap_or_default())
    }
    fn integrations(&self) -> Vec<Integration> {
        self.project
            .loaded_integrations
            .iter()
            .map(|r| {
                let manifest = str_of(r, "__manifestFile").unwrap_or_default();
                Integration {
                    name: str_of(r, "name").unwrap_or_default(),
                    spec: str_of(r, "__spec"),
                    version: str_of(r, "version"),
                    issues_url: str_of(r, "issuesUrl").filter(|u| !u.is_empty()),
                    load_error: if integ::has(r, "__loadError") {
                        Some(r.get("__loadError").map(crate::cli::format::js_string).unwrap_or_default())
                    } else {
                        None
                    },
                    gap_report_error: str_of(r, "__gapReportError"),
                    handler: handler_of(r.get("__gapReport"), &manifest),
                    manifest_file: manifest,
                }
            })
            .collect()
    }
    fn route_owner(&self, component: &str) -> Result<Option<String>, GapError> {
        let core_pkg = crate::discovery::paths::CORE_PACKAGE;
        let bare = component.strip_prefix("XDS").unwrap_or(component);
        let ints: Vec<LoadedIntegration> = self.project.loaded_integrations.iter().map(loaded_integration).collect();
        let core_dir = self.project.core_dir().map(PathBuf::from);
        // project.components(): Core's, then each integration's valid ones.
        let mut records: Vec<(String, String, Option<PathBuf>)> = Vec::new();
        if let Some(cdir) = &core_dir {
            for r in cd::discover_owned_components(cdir, &[]) {
                records.push((r.name, r.package, r.doc_path));
            }
        }
        for i in ints.iter().filter(|i| !i.load_error) {
            for r in cd::discover_valid_integration_components(i, true).components {
                records.push((r.name, r.package, Some(r.doc_path)));
            }
        }
        let wanted = bare.to_lowercase();
        let core_name = records
            .iter()
            .find(|(n, p, _)| p == core_pkg && n.to_lowercase() == wanted)
            .map(|(n, _, _)| n.clone())
            .unwrap_or_else(|| bare.to_string());
        let list_cmd = crate::cli::env::format_cli_command_at(std::path::Path::new(&self.cwd), "component --list");
        let replacements = crate::discovery::component_replacement::resolve_component_replacements(core_dir.as_deref(), &ints, &list_cmd);
        if let Some(rep) = replacements.for_target(&core_name) {
            return Ok(Some(rep.package.clone()));
        }
        let loads: Vec<(String, Option<PathBuf>)> = records.iter().map(|(_, p, d)| (p.clone(), d.clone())).collect();
        // (package, docPath, hold)
        let mut recorded: Vec<(String, String, Option<PathBuf>, NameHold)> = Vec::new();
        for i in ints.iter().filter(|i| !i.load_error) {
            for r in cd::discover_integration_components(i, true) {
                if r.name.to_lowercase() == wanted {
                    let hold = cd::integration_record_hold(&r.name, Some(&r.doc_path));
                    recorded.push((r.name.clone(), r.package.clone(), Some(r.doc_path.clone()), hold));
                } else if cd::doc_stem(&r.doc_path).to_lowercase() == wanted && !cd::is_integration_member(&r.name, Some(&r.doc_path)) {
                    recorded.push((r.name.clone(), r.package.clone(), Some(r.doc_path.clone()), NameHold::Doc));
                }
            }
        }
        let mut spellings: Vec<String> = vec![bare.to_string()];
        for (name, _, doc, _) in &recorded {
            let mut cands = vec![name.clone()];
            if let Some(d) = doc {
                cands.push(cd::doc_stem(d));
            }
            for c in cands {
                if c.to_lowercase() == wanted && !spellings.contains(&c) {
                    spellings.push(c);
                }
            }
        }
        let core_docs = core_dir.as_ref().is_some_and(|c| spellings.iter().any(|n| cd::find_component_readme(c, n).is_some()));
        let mut owners_all: Vec<(String, Option<PathBuf>, NameHold)> = Vec::new();
        for (n, p, d) in &records {
            if p == core_pkg && n.to_lowercase() == wanted {
                owners_all.push((p.clone(), d.clone(), NameHold::Core));
            }
        }
        for (_, p, d, h) in &recorded {
            owners_all.push((p.clone(), d.clone(), *h));
        }
        for i in ints.iter().filter(|i| !i.load_error) {
            for sp in &spellings {
                if let Some(found) = cd::find_integration_component(i, sp) {
                    if found.hold == NameHold::File {
                        owners_all.push((i.name.clone(), Some(found.doc_path.clone()), NameHold::File));
                    }
                }
            }
        }
        let ruled: Vec<(String, Option<PathBuf>, NameHold)> = cd::unscoped_component_owners(&owners_all, |o| o.2)
            .into_iter()
            .filter(|o| !core_docs || o.2 != NameHold::Doc)
            .collect();
        let hold_docs: Vec<(NameHold, Option<PathBuf>)> = ruled.iter().map(|o| (o.2, o.1.clone())).collect();
        let keeps = spellings
            .iter()
            .any(|n| crate::commands::component::api::legacy_external_keeps(std::path::Path::new(&self.cwd), n, &hold_docs));
        let mut owners: Vec<String> = Vec::new();
        if !keeps {
            for (p, d, h) in &ruled {
                if *h == NameHold::Core || loads.iter().any(|(lp, ld)| lp == p && ld == d) {
                    if !owners.contains(p) {
                        owners.push(p.clone());
                    }
                }
            }
        }
        if owners.len() > 1 {
            return Err(GapError::new(
                format!("Component \"{component}\" is provided by multiple packages. Re-run with --package <pkg> to choose one."),
                Some(owners.iter().map(|o| (o.clone(), "provides this component".to_string())).collect()),
                "ERR_AMBIGUOUS_COMPONENT",
            ));
        }
        Ok(owners.into_iter().next())
    }
}

pub fn load(cwd: &Path) -> Result<Box<dyn GapProject>, GapError> {
    let cwd = crate::discovery::nodepath::resolve1(&cwd.to_string_lossy());
    match Project::load(&cwd) {
        Ok(project) => Ok(Box::new(RealProject { cwd, project })),
        // Project.load's own error reaches the CLI's catch.
        Err(message) => Err(GapError::new(message, None, "ERR_UNKNOWN")),
    }
}

/// Runs each handler through the module loader, as the JS CLI's worker does:
/// what it prints goes to stderr, and how it ends is the worker's message.
#[derive(Default)]
pub struct Runner {
    /// Handler output, in order, for the CLI's stderr.
    pub output: std::cell::RefCell<Vec<u8>>,
}

impl HandlerRunner for Runner {
    fn call(&self, module: &str, source: HandlerSource, report: &Value) -> RunOutcome {
        use crate::js::{call_export, CallError, CallOptions};
        let path: &[&str] = match source {
            HandlerSource::Project => &["default", "gapReport", "handle"],
            HandlerSource::Integration => &["gapReport", "handle"],
        };
        let mut signal = crate::json::Map::new();
        signal.insert("signal".into(), serde_json::json!({"__js": "abort_signal"}));
        let opts = CallOptions { timeout_ms: Some(30_000), capture_output: true, ..Default::default() };
        let result = call_export(std::path::Path::new(module), path, &[report.clone(), Value::Object(signal)], &opts);
        let mut out = self.output.borrow_mut();
        match result {
            Ok(r) => {
                out.extend_from_slice(&r.output);
                if r.exit_code.is_some() {
                    RunOutcome::ExitCode
                } else {
                    RunOutcome::Returned(match r.value {
                        Value::Object(ref m) if m.get("__js").and_then(|v| v.as_str()) == Some("undefined") => None,
                        v => Some(v),
                    })
                }
            }
            Err(CallError::Load(e)) => RunOutcome::Threw(e.message),
            Err(CallError::NotAFunction(_)) => {
                RunOutcome::Threw("Gap report handler could not be reloaded in its worker.".into())
            }
            Err(CallError::Thrown { error, output, .. }) => {
                out.extend_from_slice(&output);
                RunOutcome::Threw(error.message)
            }
            Err(CallError::Exit { code, output }) => {
                out.extend_from_slice(&output);
                RunOutcome::Exit(Some(code.to_string()))
            }
            Err(CallError::Timeout { output }) => {
                out.extend_from_slice(&output);
                RunOutcome::TimedOut
            }
            // The worker's abort listener keeps it alive, so a promise that
            // never settles runs into the deadline; nothing else can happen.
            Err(CallError::Unsettled { output }) => {
                out.extend_from_slice(&output);
                RunOutcome::TimedOut
            }
        }
    }
}

fn env_set(key: &str) -> bool {
    std::env::var_os(key).is_some_and(|v| !v.is_empty())
}

fn non_empty(key: &str) -> Option<String> {
    let v = std::env::var(key).ok()?;
    let t = super::api::js_trim(&v);
    (!t.is_empty()).then(|| t.to_string())
}

/// `captureEnv().invocationSource`: ai, automation, human or unknown.
pub fn invocation_source() -> String {
    const CI_PROVIDERS: [&str; 13] = [
        "GITHUB_ACTIONS",
        "GITLAB_CI",
        "CIRCLECI",
        "BUILDKITE",
        "TRAVIS",
        "JENKINS_URL",
        "TEAMCITY_VERSION",
        "TF_BUILD",
        "BITBUCKET_BUILD_NUMBER",
        "CODEBUILD_BUILD_ID",
        "DRONE",
        "VERCEL",
        "NETLIFY",
    ];
    const AGENT_SIGNALS: [&str; 6] =
        ["CURSOR_TRACE_ID", "CURSOR_AGENT", "CLAUDECODE", "CLAUDE_CODE", "AIDER_MODEL", "GITHUB_COPILOT_AGENT"];
    let agent = non_empty("AGENT").is_some() || AGENT_SIGNALS.iter().any(|k| env_set(k));
    if agent || non_empty("AGENT_SESSION_ID").is_some() {
        return "ai".into();
    }
    let ci = CI_PROVIDERS.iter().any(|k| env_set(k))
        || std::env::var("CI").is_ok_and(|v| !v.is_empty() && v != "0" && v != "false");
    if ci {
        return "automation".into();
    }
    if std::io::stdout().is_terminal() {
        return "human".into();
    }
    "unknown".into()
}

/// `new Date().toISOString()`.
pub fn iso_now() -> String {
    let d = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let ms = d.as_millis() as i64;
    let secs = ms.div_euclid(1000);
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    // Civil-from-days (Howard Hinnant).
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60,
        ms.rem_euclid(1000)
    )
}
