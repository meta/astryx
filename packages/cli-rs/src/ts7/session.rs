//! A session on the CLI's own TypeScript 7 compiler, as `openTypeScript` in
//! `foundation/discovery/project-typescript.mjs`: virtual files served through
//! the file system callbacks, programs opened through a virtual tsconfig, and
//! the syntax trees of the files read.

use super::client::{Client, Scope};
use super::syntax::{Syntax, V};
use super::{fs_reply, Callback};
use crate::discovery::nodepath as np;
use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::atomic::{AtomicUsize, Ordering};

/// The virtual tsconfig counter, per process as in the JS module.
static CONFIG_COUNT: AtomicUsize = AtomicUsize::new(0);

/// A program of one snapshot.
#[derive(Clone, Debug)]
pub struct Project {
    pub snapshot: u64,
    pub id: String,
    pub config_file_name: String,
    /// `project.compilerOptions`.
    pub compiler_options: Value,
}

pub struct Session {
    pub client: Client,
    pub syntax: Syntax,
    pub version: String,
    files: Rc<RefCell<HashMap<String, String>>>,
    /// Source files already read: (snapshot, project, path) → node.
    source_files: HashMap<(u64, String, String), V>,
    cwd: String,
    /// Parsed texts by extension and text, and each tree's syntax errors.
    parsed: HashMap<String, V>,
    parse_diagnostics: HashMap<V, Vec<Value>>,
    parse_config: Option<String>,
    parse_count: usize,
}

/// `nativeTypeScriptFailedReason(error, outcome)`.
pub fn failed_reason(error: &str, outcome: &str) -> String {
    format!("This CLI's TypeScript 7 compiler could not start ({error}), so {outcome}. Reinstall @astryxdesign/cli for this platform and run this check again.")
}

/// `resolveProjectTypeScript(dirs)`: the version of the project's own
/// `typescript`, trying each directory in order.
pub fn project_typescript_version(dirs: &[&str]) -> Option<String> {
    for dir in dirs.iter().filter(|d| !d.is_empty()) {
        let mut d = np::resolve1(dir);
        loop {
            if !d.ends_with("/node_modules") {
                let pj = np::join(&[&d, "node_modules", "typescript", "package.json"]);
                if np::exists(&pj) {
                    if let Some(v) = np::read_json(&pj).and_then(|p| p.get("version").and_then(|v| v.as_str()).map(String::from)).filter(|v| !v.is_empty()) {
                        return Some(v);
                    }
                    break;
                }
            }
            let parent = np::dirname(&d);
            if parent == d {
                break;
            }
            d = parent;
        }
    }
    None
}

impl Session {
    /// `openTypeScript({cwd})`; `Err` is the error message.
    pub fn open(cwd: &str) -> Result<Session, String> {
        let cli_root = crate::discovery::paths::cli_root();
        let pkg = super::resolve_package_dir(cli_root, super::NATIVE_PACKAGE)
            .ok_or_else(|| format!("Cannot find module '{}/unstable/sync'", super::NATIVE_PACKAGE))?;
        let version = np::read_json(&np::join2(&pkg, "package.json"))
            .and_then(|p| p.get("version").and_then(|v| v.as_str()).map(String::from))
            .unwrap_or_default();
        let exe = super::exe_of_package(&pkg)?;
        let files: Rc<RefCell<HashMap<String, String>>> = Rc::default();
        let (f1, f2) = (files.clone(), files.clone());
        let read_file: Callback = Box::new(move |raw| {
            let p = fs_reply::arg(raw);
            let files = f1.borrow();
            Ok(fs_reply::read_file(files.get(&p).map(|t| Some(t.as_str()))))
        });
        let file_exists: Callback = Box::new(move |raw| {
            let p = fs_reply::arg(raw);
            Ok(fs_reply::boolean(if f2.borrow().contains_key(&p) { Some(true) } else { None }))
        });
        let mut client = Client::spawn(&exe, cwd, vec![("readFile", read_file), ("fileExists", file_exists)]).map_err(|e| e.0)?;
        client.initialize().map_err(|e| e.0)?;
        Ok(Session {
            client,
            syntax: Syntax::new(),
            version,
            files,
            source_files: HashMap::new(),
            cwd: cwd.to_string(),
            parsed: HashMap::new(),
            parse_diagnostics: HashMap::new(),
            parse_config: None,
            parse_count: 0,
        })
    }

    /// Serve `text` as the file at `file`.
    pub fn set(&mut self, file: &str, text: &str) {
        self.files.borrow_mut().insert(file.to_string(), text.to_string());
    }

    fn project_of(snap: &Value, config: &str) -> Option<Project> {
        let snapshot = snap.get("snapshot")?.as_u64()?;
        let p = snap.get("projects")?.as_array()?.iter().find(|p| p.get("configFileName").and_then(|c| c.as_str()) == Some(config))?;
        Some(Project {
            snapshot,
            id: p.get("id")?.as_str()?.to_string(),
            config_file_name: config.to_string(),
            compiler_options: p.get("compilerOptions").cloned().unwrap_or(Value::Null),
        })
    }

    /// `writeConfig(dir, config)`: the virtual tsconfig's path.
    fn write_config(&mut self, dir: &str, text: String) -> String {
        let n = CONFIG_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
        let config = np::join2(dir, &format!("__astryx_check_{n}.tsconfig.json"));
        self.set(&config, &text);
        config
    }

    /// `session.project(dir, rootNames, compilerOptions, changed)`.
    /// `compiler_options` is the exact JSON text of the options object.
    pub fn project(&mut self, dir: &str, root_names: &[String], compiler_options: &str, changed: &[String]) -> Result<Project, String> {
        self.project_with(dir, root_names, compiler_options, changed, None, None)
    }

    /// `session.project(dir, rootNames, compilerOptions, changed, {extends, include})`.
    pub fn project_with(
        &mut self,
        dir: &str,
        root_names: &[String],
        compiler_options: &str,
        changed: &[String],
        extends: Option<&str>,
        include: Option<&[String]>,
    ) -> Result<Project, String> {
        let files = serde_json::to_string(root_names).unwrap_or_default();
        let mut text = String::from("{");
        if let Some(e) = extends {
            text.push_str(&format!("\"extends\":{},", serde_json::to_string(e).unwrap_or_default()));
        }
        text.push_str(&format!("\"compilerOptions\":{compiler_options},\"files\":{files}"));
        if let Some(inc) = include {
            text.push_str(&format!(",\"include\":{}", serde_json::to_string(inc).unwrap_or_default()));
        }
        text.push('}');
        let config = self.write_config(dir, text);
        let params = if changed.is_empty() {
            json!({ "openProjects": [config] })
        } else {
            json!({ "openProjects": [config], "fileChanges": { "changed": changed } })
        };
        let snap = self.client.update_snapshot_with(&params).map_err(|e| e.0)?;
        Self::project_of(&snap, &config).ok_or_else(|| "no project".to_string())
    }

    /// `session.update(project, changed)`.
    pub fn update(&mut self, project: &Project, changed: &[String]) -> Result<Project, String> {
        let snap = self.client.update_snapshot_with(&json!({ "fileChanges": { "changed": changed } })).map_err(|e| e.0)?;
        Self::project_of(&snap, &project.config_file_name).ok_or_else(|| "no project".to_string())
    }

    /// `project.compilerOptions`.
    pub fn project_compiler_options(&self, project: &Project) -> Value {
        project.compiler_options.clone()
    }

    /// Requests scoped to a project.
    pub fn scope(&mut self, project: &Project) -> Scope<'_> {
        Scope::new(&mut self.client, project.snapshot, &project.id)
    }

    /// `program.getSourceFile(file)`: its node, or `V::Undef`.
    pub fn source_file(&mut self, project: &Project, file: &str) -> V {
        let key = (project.snapshot, project.id.clone(), file.to_string());
        if let Some(v) = self.source_files.get(&key) {
            return *v;
        }
        let v = match self.scope(project).get_source_file(file) {
            Ok(Some(bytes)) => self.syntax.add(bytes),
            _ => V::Undef,
        };
        self.source_files.insert(key, v);
        v
    }

    /// `program.get<kind>Diagnostics(file)`.
    pub fn diagnostics(&mut self, project: &Project, kind: &str, file: &str) -> Vec<Value> {
        self.scope(project).diagnostics(kind, Some(file)).unwrap_or_default()
    }

    /// `api.parseConfigFile(file)`.
    pub fn parse_config_file(&mut self, file: &str) -> Option<Value> {
        self.client.parse_config_file(file).ok().flatten()
    }

    /// Parse texts, each alone, through one throwaway program; kept by text.
    pub fn parse(&mut self, entries: &[(String, String)]) {
        let mut todo: Vec<(String, String)> = Vec::new();
        let mut keys: Vec<String> = Vec::new();
        for (file_name, text) in entries {
            let ext = text_ext(file_name);
            let key = format!("{ext}\0{text}");
            if self.parsed.contains_key(&key) || keys.contains(&key) {
                continue;
            }
            keys.push(key.clone());
            self.parse_count += 1;
            let file = np::join2(&self.cwd, &format!("__astryx_text_{}{ext}", self.parse_count));
            self.set(&file, text);
            todo.push((key, file));
        }
        if todo.is_empty() {
            return;
        }
        let files: Vec<&String> = todo.iter().map(|(_, f)| f).collect();
        let text = format!(
            "{{\"compilerOptions\":{{\"noLib\":true,\"noResolve\":true,\"allowJs\":true,\"noEmit\":true,\"types\":[]}},\"files\":{}}}",
            serde_json::to_string(&files).unwrap_or_default()
        );
        let cwd = self.cwd.clone();
        let config = self.write_config(&cwd, text);
        let params = match &self.parse_config {
            Some(prev) => json!({ "openProjects": [config], "closeProjects": [prev] }),
            None => json!({ "openProjects": [config] }),
        };
        let Ok(snap) = self.client.update_snapshot_with(&params) else { return };
        self.parse_config = Some(config.clone());
        let Some(project) = Self::project_of(&snap, &config) else { return };
        for (key, file) in todo {
            let sf = self.source_file(&project, &file);
            let diags = self.diagnostics(&project, "Syntactic", &file);
            self.parse_diagnostics.insert(sf, diags);
            self.parsed.insert(key, sf);
        }
    }

    /// `syntax.createSourceFile(fileName, text)`: the tree of `text` parsed
    /// alone, its kind from `fileName`'s extension.
    pub fn create_source_file(&mut self, file_name: &str, text: &str) -> V {
        self.parse(&[(file_name.to_string(), text.to_string())]);
        let key = format!("{}\0{text}", text_ext(file_name));
        self.parsed.get(&key).copied().unwrap_or_default()
    }

    /// `syntax.parseDiagnosticsOf(sf)`.
    pub fn parse_diagnostics_of(&self, sf: &V) -> &[Value] {
        self.parse_diagnostics.get(sf).map(|v| v.as_slice()).unwrap_or(&[])
    }

    pub fn close(&mut self) {
        self.client.close();
    }
}

/// `/\.[cm]?[jt]sx?$/.exec(fileName)?.[0] ?? '.ts'`.
fn text_ext(file_name: &str) -> String {
    for ext in [".mjsx", ".cjsx", ".mtsx", ".ctsx", ".mjs", ".cjs", ".mts", ".cts", ".jsx", ".tsx", ".js", ".ts"] {
        if file_name.ends_with(ext) {
            return ext.to_string();
        }
    }
    ".ts".to_string()
}

impl Drop for Session {
    fn drop(&mut self) {
        self.client.close();
    }
}

/// `flattenDiagnostic(d, newLine)`.
pub fn flatten_diagnostic(d: &Value, new_line: &str) -> String {
    fn visit(d: &Value, indent: usize, new_line: &str, out: &mut String) {
        if indent > 0 {
            out.push_str(new_line);
            out.push_str(&"  ".repeat(indent));
        }
        out.push_str(d.get("text").and_then(|t| t.as_str()).unwrap_or(""));
        if let Some(kids) = d.get("messageChain").and_then(|c| c.as_array()) {
            for k in kids {
                visit(k, indent + 1, new_line, out);
            }
        }
    }
    let mut out = String::new();
    visit(d, 0, new_line, &mut out);
    out
}

/// `diagnosticChain(d)`: each level's first message, outermost first.
pub fn diagnostic_chain(d: &Value) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = Some(d);
    while let Some(x) = cur {
        out.push(x.get("text").and_then(|t| t.as_str()).unwrap_or("").to_string());
        cur = x.get("messageChain").and_then(|c| c.as_array()).and_then(|a| a.first());
    }
    out
}

/// The version of this CLI's TypeScript 7, or `unknown` when it cannot load.
pub fn native_version() -> String {
    let cli_root = crate::discovery::paths::cli_root();
    super::resolve_package_dir(cli_root, super::NATIVE_PACKAGE)
        .and_then(|pkg| np::read_json(&np::join2(&pkg, "package.json")))
        .and_then(|p| p.get("version").and_then(|v| v.as_str()).map(String::from))
        .unwrap_or_else(|| "unknown".into())
}
