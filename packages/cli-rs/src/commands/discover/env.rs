//! What discover reads from the environment, gathered once per run.
//! The shared loaders (Project.load, package manager, release choice) belong
//! to the discovery and shell lanes; the pieces here marked TEMP are the
//! smallest local versions until those land.

use crate::json::Value;
use std::path::{Path, PathBuf};

/// A discover source: a function the project or an integration exports.
pub trait Source {
    /// Identity, so one function shared by two origins is called once.
    fn id(&self) -> usize;
    /// Call it with `{signal, package?, version?}`; Err is the thrown message.
    fn call(&self, request: &crate::json::Map<String, Value>) -> Result<Value, String>;
}

pub struct Integration {
    pub name: String,
    pub version: Option<String>,
    pub components_dir: Option<PathBuf>,
    pub load_error: Option<String>,
    pub discover: Option<Box<dyn Source>>,
    pub discover_error: Option<String>,
    pub templates: Vec<String>,
    pub docs: Vec<String>,
    pub themes: Vec<String>,
    pub codemods: Vec<String>,
    pub icon_sets: Vec<super::model::IconSetSummary>,
    pub withdrawn_icon_sets: Vec<(String, String)>,
}

pub struct Project {
    pub cwd: PathBuf,
    pub config_discover: Option<Box<dyn Source>>,
    pub icon_sets: bool,
    pub integrations: Vec<Integration>,
}

pub struct Env {
    pub cwd: PathBuf,
    pub cli_root: PathBuf,
    /// How to invoke the CLI in printed commands (`getCliInvocation`).
    pub run: String,
    /// The package-manager add verb (`pnpm add`, `npm install`, ...).
    pub add_verb: String,
    /// Outside any project (`isOutsideProject`).
    pub outside_project: bool,
    pub project: Option<Project>,
    /// `projectAddCommand(cwd)` verb, when there is a project to add to.
    pub project_add_verb: Option<String>,
    pub cache_dir: PathBuf,
}

impl Env {
    pub fn cli_version(&self) -> Option<String> {
        package_version(&self.cli_root)
    }

    /// `findInstalledPackage(cwd, name)` then its version.
    pub fn installed_version(&self, name: &str) -> Option<String> {
        let start = self.project.as_ref().map(|p| p.cwd.clone()).unwrap_or_else(|| self.cwd.clone());
        find_installed_package(&start, name).and_then(|d| package_version(&d))
    }

    pub fn project_cwd(&self) -> PathBuf {
        self.project.as_ref().map(|p| p.cwd.clone()).unwrap_or_else(|| self.cwd.clone())
    }
}

/// The version in a package directory's package.json, if it names one.
pub fn package_version(dir: &Path) -> Option<String> {
    let text = std::fs::read_to_string(dir.join("package.json")).ok()?;
    let v: Value = serde_json::from_str(&text).ok()?;
    match v.get("version") {
        Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
        _ => None,
    }
}

/// TEMP: replace with src/discovery findInstalledPackage. Walks up from
/// `start` looking in each `node_modules/<name>/package.json`.
pub fn find_installed_package(start: &Path, name: &str) -> Option<PathBuf> {
    let mut dir = Some(start);
    while let Some(d) = dir {
        let cand = d.join("node_modules").join(name);
        if cand.join("package.json").is_file() {
            return Some(std::fs::canonicalize(&cand).unwrap_or(cand));
        }
        dir = d.parent();
    }
    None
}

/// The nearest package.json at or above `start`, read.
pub fn nearest_manifest(start: &Path) -> Option<(PathBuf, Value)> {
    let mut dir = start.to_path_buf();
    loop {
        let file = dir.join("package.json");
        if file.exists() {
            let text = std::fs::read_to_string(&file).ok()?;
            return serde_json::from_str::<Value>(&text).ok().map(|v| (dir, v));
        }
        match dir.parent() {
            Some(p) => dir = p.to_path_buf(),
            None => return None,
        }
    }
}

/// A discover source exported by a JS module: `export_path` walks the module
/// namespace (`["default", "discover"]` for the config, `["discover"]` for an
/// integration manifest).
pub struct JsSource {
    pub file: PathBuf,
    pub export_path: Vec<String>,
    /// Where it comes from, for the timeout message.
    pub label: String,
}

impl Source for JsSource {
    fn id(&self) -> usize {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        self.file.hash(&mut h);
        self.export_path.hash(&mut h);
        h.finish() as usize
    }

    fn call(&self, request: &crate::json::Map<String, Value>) -> Result<Value, String> {
        use crate::js::{call_export, CallError, CallOptions};
        let mut arg = crate::json::Map::new();
        arg.insert("signal".into(), serde_json::json!({"__js": "abort_signal"}));
        for (k, v) in request {
            arg.insert(k.clone(), v.clone());
        }
        let path: Vec<&str> = self.export_path.iter().map(|s| s.as_str()).collect();
        let opts = CallOptions { timeout_ms: Some(30_000), ..Default::default() };
        match call_export(&self.file, &path, &[Value::Object(arg)], &opts) {
            Ok(r) => Ok(r.value),
            Err(CallError::Thrown { error, .. }) => {
                Err(if error.name.is_empty() { error.to_js_string() } else { error.message })
            }
            Err(CallError::Timeout { .. }) | Err(CallError::Unsettled { .. }) => {
                Err(format!("{} did not answer within 30 seconds", self.label))
            }
            Err(CallError::Load(e)) => Err(e.message),
            Err(CallError::NotAFunction(p)) => Err(format!("{p} is not a function")),
            Err(CallError::Exit { code, .. }) => Err(format!("process.exit({code})")),
        }
    }
}
