//! Port of `foundation/config/project.mjs` (`Project.load` and the
//! project-wide reads) and `config-path.mjs`, `authoring/config/parse.mjs`.
//!
//! ```ignore
//! let project = Project::load(&cwd)?;          // Err: config failed to load
//! project.config            // parsed astryx.config value (JSON, fn handles)
//! project.config_path       // Option<String>
//! project.loaded_integrations   // Vec<integrations::Record>
//! project.issues()          // Vec<ProjectIssue>
//! ```

use super::integrations::{self as integ, Candidate, Record};
use super::nodepath as np;
use super::paths;
use super::zod::{self, *};
use crate::json::{Map, Value};

/// The config file names, in order.
pub const CONFIG_BASENAMES: [&str; 3] = ["astryx.config.ts", "astryx.config.mjs", "astryx.config.js"];

/// The issues URL when a project names none.
pub const DEFAULT_ISSUES_URL: &str = "https://github.com/meta/astryx/issues/new";

/// `findConfigPath(startDir)`.
pub fn find_config_path(start: &str) -> Result<Option<String>, String> {
    let root = paths::find_package_root(start).unwrap_or_else(|| start.to_string());
    let present = integ::find_present_files(&root, &CONFIG_BASENAMES);
    if present.len() > 1 {
        return Err(format!(
            "Multiple Astryx config files found in {root} ({}). Keep exactly one.",
            present.iter().map(|p| np::basename(p)).collect::<Vec<_>>().join(", ")
        ));
    }
    Ok(present.into_iter().next())
}

fn is_fn(v: &Value) -> bool {
    matches!(v, Value::Object(m) if m.get("__js").and_then(|x| x.as_str()) == Some("function"))
}

fn config_schema() -> Z {
    let post = object(
        vec![("name", opt(string())), ("buildCommand", Z::Custom(is_fn, "Expected a function".into()))],
        Mode::Strict,
    );
    let xle = object(
        vec![("from", string()), ("description", opt(string())), ("default", opt(boolean()))],
        Mode::Strict,
    );
    object(
        vec![
            ("integrations", opt(array(string()))),
            ("issuesUrl", opt(string().check(StrCheck::Url))),
            ("hooks", opt(object(vec![("postCodemod", opt(array(post)))], Mode::Strict))),
            ("debug", opt(Z::Custom(is_fn, "Expected a function".into()))),
            (
                "gapReport",
                opt(Z::Custom(
                    |v| integ::parse_gap_report_handler(v, "gapReport handler").is_ok(),
                    "Expected a GapReportHandler {audience, handle}".into(),
                )),
            ),
            ("discover", opt(Z::Custom(is_fn, "Expected a discover source function".into()))),
            (
                "experimental",
                opt(object(
                    vec![
                        (
                            "xle",
                            opt(object(
                                vec![(
                                    "components",
                                    opt(Z::Record { key: Box::new(string()), value: Box::new(xle), refines: vec![] }),
                                )],
                                Mode::Strict,
                            )),
                        ),
                        ("iconSet", opt(Z::Str { checks: vec![StrCheck::Min(1, None)], type_msg: None })),
                    ],
                    Mode::Strict,
                )),
            ),
        ],
        Mode::Strict,
    )
}

/// `parseConfig(input, label)`.
pub fn parse_config(input: &Value, label: &str) -> Result<Value, String> {
    zod::safe_parse(&config_schema(), input).map_err(|i| format_zod_error(label, &i))
}

fn with_handles(config: &mut Value, file: &str) {
    let Value::Object(m) = config else { return };
    for k in ["debug", "discover"] {
        if let Some(Value::Object(f)) = m.get_mut(k) {
            if f.get("__js").and_then(|x| x.as_str()) == Some("function") {
                f.insert("module".into(), Value::String(file.into()));
                f.insert("export".into(), Value::String("default".into()));
                f.insert("path".into(), Value::Array(vec![Value::String(k.into())]));
            }
        }
    }
    if let Some(Value::Object(g)) = m.get_mut("gapReport") {
        if let Some(Value::Object(h)) = g.get_mut("handle") {
            h.insert("module".into(), Value::String(file.into()));
            h.insert("export".into(), Value::String("default".into()));
            h.insert("path".into(), serde_json::json!(["gapReport", "handle"]));
        }
    }
}

/// One project issue (`project.issues()` entry).
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectIssue {
    pub package: String,
    pub code: String,
    pub severity: String,
    pub message: String,
}

impl ProjectIssue {
    pub fn to_json(&self) -> Value {
        serde_json::json!({"package": self.package, "code": self.code, "severity": self.severity, "message": self.message})
    }
}

/// A pass that checks one loaded integration and returns its issues as
/// `(code, severity, message)` (`validateLoadedIntegration`).
pub type IntegrationValidator = fn(&Project, &Record) -> Result<Vec<(String, String, String)>, String>;

/// Passes `issues()` runs before the per-integration checks, for the
/// catalogs whose resolution reports issues (templates, component
/// replacements). Each returns `(package, code, severity, message)`.
pub type CatalogIssuePass = fn(&Project) -> Vec<(String, String, String, String)>;

/// The validator `issues()` runs on each integration; filled by the module
/// that ports `validate-contributions.mjs`.
pub static VALIDATOR: std::sync::OnceLock<IntegrationValidator> = std::sync::OnceLock::new();
/// The template catalog's issue pass (template lane).
pub static TEMPLATE_ISSUES: std::sync::OnceLock<CatalogIssuePass> = std::sync::OnceLock::new();
/// The component-replacement issue pass (component lane).
pub static COMPONENT_REPLACEMENT_ISSUES: std::sync::OnceLock<CatalogIssuePass> = std::sync::OnceLock::new();

/// A loaded project.
#[derive(Debug, Clone)]
pub struct Project {
    pub cwd: String,
    pub project_dir: String,
    pub config_path: Option<String>,
    /// The parsed config (`{integrations: []}` without a config file).
    pub config: Value,
    /// The configured specs (`config.integrations ?? []`).
    pub integrations: Vec<String>,
    pub loaded_integrations: Vec<Record>,
    /// The provider ledger (`providerLedgerOf(project)`).
    pub ledger: Vec<integ::LedgerEntry>,
    /// `core: 'project'` reads only the project's own Core.
    pub core_project_only: bool,
    /// Issues pushed so far, in order (`#issues`), and the integrations
    /// already checked (`#visitedIssues`, by index).
    state: std::cell::RefCell<(Vec<ProjectIssue>, Vec<usize>)>,
}

fn error_message_of(e: String) -> String {
    e
}

fn load_error_marker(name: &str, version: Option<&Value>, spec: &str, package_dir: Option<&str>, err: String) -> Record {
    let mut r = Record::new();
    r.insert("name".into(), Value::String(name.into()));
    if let Some(Value::String(v)) = version {
        r.insert("version".into(), Value::String(v.clone()));
    }
    r.insert("__spec".into(), Value::String(spec.into()));
    if let Some(d) = package_dir {
        r.insert("__packageDir".into(), Value::String(d.into()));
    }
    r.insert("__loadError".into(), Value::String(err));
    r
}

fn package_name(pkg: Option<&Value>) -> Option<String> {
    match pkg?.get("name") {
        Some(Value::String(n)) if !n.is_empty() => Some(n.clone()),
        _ => None,
    }
}

fn load_configured(specs: &[String], cwd: &str) -> Vec<Record> {
    let mut out = Vec::new();
    let mut seen: Vec<&String> = Vec::new();
    for spec in specs {
        if spec.is_empty() || seen.contains(&spec) {
            continue;
        }
        seen.push(spec);
        match integ::load_integrations(&[spec.clone()], cwd, false) {
            Ok(list) => out.extend(list),
            Err(e) => {
                let package_dir = integ::resolve_installed_integration_dir(spec, cwd).ok();
                let pkg = package_dir.as_deref().and_then(paths::read_package_json);
                out.push(load_error_marker(
                    &package_name(pkg.as_ref()).unwrap_or_else(|| spec.clone()),
                    pkg.as_ref().and_then(|p| p.get("version")),
                    spec,
                    package_dir.as_deref(),
                    error_message_of(e),
                ));
            }
        }
    }
    out
}

fn load_local_safely(project_dir: &str) -> Option<Record> {
    match integ::load_local_integration(project_dir) {
        Ok(r) => r,
        Err(e) => {
            let pkg = paths::read_package_json(project_dir);
            let name = package_name(pkg.as_ref()).unwrap_or_else(|| "(local integration)".into());
            let mut r = load_error_marker(&name, pkg.as_ref().and_then(|p| p.get("version")), &name, Some(project_dir), e);
            r.insert("__local".into(), Value::Bool(true));
            Some(r)
        }
    }
}

impl Project {
    /// `Project.load(cwd)`. Errors are the messages the JS load throws (a
    /// config that fails to import or parse, two config files).
    pub fn load(cwd: &str) -> Result<Project, String> {
        Self::load_with(cwd, false)
    }

    /// `Project.load(cwd, {fresh, core})`: with `fresh`, the config and
    /// every integration manifest are reread from disk (and serve later
    /// imports of those files).
    pub fn load_opts(cwd: &str, core_project_only: bool, fresh: bool) -> Result<Project, String> {
        if fresh {
            super::docmod::with_fresh_imports(|| Self::load_with(cwd, core_project_only))
        } else {
            Self::load_with(cwd, core_project_only)
        }
    }

    /// `Project.load(cwd, {core: 'project'})`.
    pub fn load_with(cwd: &str, core_project_only: bool) -> Result<Project, String> {
        let config_path = find_config_path(cwd)?;
        let project_dir = match &config_path {
            Some(c) => np::dirname(c),
            None => paths::find_package_root(cwd).unwrap_or_else(|| cwd.to_string()),
        };
        let mut config = serde_json::json!({"integrations": []});
        let mut specs: Vec<String> = Vec::new();
        let mut loaded: Vec<Record> = Vec::new();
        if let Some(cp) = &config_path {
            let ns = integ::import_user_module(cp)?;
            let raw = ns.get("default").cloned().unwrap_or_else(zod::undefined);
            config = parse_config(&raw, "astryx.config")?;
            with_handles(&mut config, cp);
            specs = config
                .get("integrations")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                .unwrap_or_default();
            loaded = load_configured(&specs, &project_dir);
        }
        let autolinked = integ::load_autolink_candidates(&project_dir, &loaded);
        let local = load_local_safely(&project_dir);
        let computer = if super::release::is_outside_project(cwd) {
            let mut exclude: Vec<String> = loaded.iter().filter_map(|r| integ::s(r, "name").map(String::from)).collect();
            exclude.extend(autolinked.iter().filter_map(|c| c.integration.as_ref().and_then(|r| integ::s(r, "name").map(String::from))));
            if let Some(l) = &local {
                if let Some(n) = integ::s(l, "name") {
                    exclude.push(n.into());
                }
            }
            integ::load_computer_integrations(&integ::computer_integration_candidates(cwd), &exclude)
        } else {
            vec![]
        };
        let mut cands: Vec<Candidate> = loaded.into_iter().map(Candidate::configured).collect();
        cands.extend(autolinked);
        cands.extend(computer);
        if let Some(l) = local {
            cands.push(Candidate {
                source: "local",
                spec: integ::s(&l, "__spec").map(String::from),
                package_dir: None,
                integration: Some(l),
                repeat: false,
                error: None,
            });
        }
        let res = integ::resolve_providers(cands);
        let declared: Vec<super::package_manager::DeclaredCliCommand> = res
            .integrations
            .iter()
            .filter(|r| !integ::has(r, "__loadError") && !integ::has(r, "__providerConflict"))
            .filter_map(|r| {
                Some(super::package_manager::DeclaredCliCommand {
                    package: integ::s(r, "name").or(integ::s(r, "__spec")).unwrap_or("(unnamed)").to_string(),
                    command: integ::s(r, "cliCommand")?.to_string(),
                })
            })
            .collect();
        super::package_manager::record_declared_cli_commands(&project_dir, declared);
        Ok(Project {
            cwd: cwd.to_string(),
            project_dir,
            config_path,
            config,
            integrations: specs,
            loaded_integrations: res.integrations,
            ledger: res.ledger,
            core_project_only,
            state: Default::default(),
        })
    }

    /// `project.coreDir()`.
    pub fn core_dir(&self) -> Option<String> {
        if self.core_project_only {
            paths::find_project_core_dir(&self.cwd)
        } else {
            paths::find_core_dir(&self.cwd)
        }
    }

    /// `project.issuesUrl({package})`.
    pub fn issues_url(&self, package: Option<&str>) -> Option<String> {
        match package {
            None | Some(paths::CORE_PACKAGE) | Some("") => Some(
                self.config.get("issuesUrl").and_then(|v| v.as_str()).unwrap_or(DEFAULT_ISSUES_URL).to_string(),
            ),
            Some(p) => self
                .loaded_integrations
                .iter()
                .find(|i| integ::s(i, "name") == Some(p))
                .and_then(|i| integ::s(i, "issuesUrl").map(String::from)),
        }
    }

    /// The label an integration's issues carry (`#pkgLabel`).
    pub fn package_label(r: &Record) -> String {
        if integ::has(r, "__providerConflict") {
            return if integ::has(r, "version") {
                format!("{}@{}", paths::js_string(r.get("name")), paths::js_string(r.get("version")))
            } else {
                integ::s(r, "__spec").map(String::from).unwrap_or_else(|| paths::js_string(r.get("name")))
            };
        }
        integ::s(r, "name").or(integ::s(r, "__spec")).unwrap_or("(integration)").to_string()
    }

    /// `#pushIssue(pkg, issue)`: dedupes by package, code and message.
    pub fn push_issue(&self, pkg: &str, code: &str, severity: &str, message: &str) {
        let mut st = self.state.borrow_mut();
        if st.0.iter().any(|e| e.package == pkg && e.code == code && e.message == message) {
            return;
        }
        st.0.push(ProjectIssue { package: pkg.into(), code: code.into(), severity: severity.into(), message: message.into() });
    }

    /// `#collectIssues(integration)`: checks one loaded integration once.
    pub fn collect_issues(&self, r: &Record) {
        super::validate_contributions::register();
        let Some(idx) = self.loaded_integrations.iter().position(|x| std::ptr::eq(x, r) || x == r) else { return };
        {
            let mut st = self.state.borrow_mut();
            if st.1.contains(&idx) {
                return;
            }
            st.1.push(idx);
        }
        let pkg = Self::package_label(r);
        if let Some(e) = integ::s(r, "__loadError") {
            self.push_issue(&pkg, "integration_error", "error", e);
            return;
        }
        let Some(v) = VALIDATOR.get() else { return };
        let checked = if super::paths::js_truthy(self.config.get("experimental").and_then(|e| e.get("iconSet"))) {
            r.clone()
        } else {
            let mut c = r.clone();
            c.insert("iconSets".into(), zod::undefined());
            c
        };
        match v(self, &checked) {
            Ok(found) => {
                for (c, s, m) in found {
                    self.push_issue(&pkg, &c, &s, &m);
                }
            }
            Err(e) => self.push_issue(&pkg, "integration_error", "error", &e),
        }
    }

    /// `project.issues()`.
    pub fn issues(&self) -> Vec<ProjectIssue> {
        super::validate_contributions::register();
        crate::commands::template::integration::register();
        if !self.loaded_integrations.is_empty() {
            let has_templates = self.loaded_integrations.iter().any(|i| integ::s(i, "templates").map(np::exists).unwrap_or(false));
            if has_templates {
                if let Some(pass) = TEMPLATE_ISSUES.get() {
                    for (p, c, s, m) in pass(self) {
                        self.push_issue(&p, &c, &s, &m);
                    }
                }
            }
            if let Some(pass) = COMPONENT_REPLACEMENT_ISSUES.get() {
                for (p, c, s, m) in pass(self) {
                    self.push_issue(&p, &c, &s, &m);
                }
            }
            for r in &self.loaded_integrations {
                self.collect_issues(r);
            }
        }
        self.state.borrow().0.clone()
    }

    /// `project.docs()`: the docs catalog (see `docs_discovery`).
    pub fn docs(&self) -> super::docs_discovery::DocsCatalog {
        super::docs_discovery::project_docs(self)
    }

    /// The loaded integrations that contribute (no load error, not set
    /// aside), the set every discovery loop reads.
    pub fn contributing(&self) -> impl Iterator<Item = &Record> {
        self.loaded_integrations.iter().filter(|r| !integ::has(r, "__loadError") && !integ::has(r, "__providerConflict"))
    }
}

/// `providerLedgerOf(project)` as JSON-ish rows for callers that print it.
pub fn ledger_json(p: &Project) -> Vec<Map<String, Value>> {
    p.ledger
        .iter()
        .map(|e| {
            let mut m = Map::new();
            m.insert("key".into(), Value::String(e.key.clone()));
            m.insert("label".into(), Value::String(e.label.clone()));
            m.insert("outcome".into(), Value::String(e.outcome.into()));
            if let Some(p) = &e.provider_id {
                m.insert("providerId".into(), Value::String(p.clone()));
            }
            if let Some(w) = &e.winner {
                m.insert("winner".into(), Value::String(w.clone()));
            }
            if let Some(r) = e.reason {
                m.insert("reason".into(), Value::String(r.into()));
            }
            if let Some(a) = &e.alias_of {
                m.insert("aliasOf".into(), Value::String(a.clone()));
            }
            if let Some(err) = &e.error {
                m.insert("error".into(), Value::String(err.clone()));
            }
            m
        })
        .collect()
}
