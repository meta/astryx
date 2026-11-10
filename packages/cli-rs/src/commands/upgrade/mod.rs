//! `astryx upgrade`: version migration codemods, ported from
//! `packages/cli/assets/codemods` and `packages/cli/api/upgrade`.

pub mod css;
pub mod fsutil;
pub mod hooks;
pub mod integration_discovery;
pub mod jsc;
pub mod jsre;
pub mod protection;
pub mod recast;
pub mod registry;
pub mod registry_compositions;
pub mod run;
pub mod shadcn;
pub mod runner;
pub mod transforms;
pub mod ui;

#[cfg(test)]
mod fixtures_test;
#[cfg(test)]
mod project_tests;

use crate::cli::command::{CmdResult, Exit, Invocation, OptSource, Out};
use crate::cli::format::{json_fields, records, section, Block};
use crate::json::{Map, Value};
use fsutil::s;
use std::path::{Path, PathBuf};
use ui::Ui;

/// Parsed `upgrade` options (`UpgradeOptions`).
#[derive(Debug, Clone, Default)]
pub struct Opts {
    pub from: Option<String>,
    pub apply: bool,
    pub force: bool,
    pub codemod: Option<String>,
    pub skip_codemod: Vec<String>,
    pub integration: Vec<String>,
    pub path: Option<String>,
    pub install_deps: bool,
    pub registry: bool,
    pub list: bool,
}

#[derive(Debug, Clone)]
pub struct ApiError {
    pub message: String,
    pub code: String,
    pub receipt: Option<Value>,
}

impl ApiError {
    pub fn new(message: impl Into<String>, code: &str) -> ApiError {
        ApiError { message: message.into(), code: code.into(), receipt: None }
    }
}

pub struct PathSafetyError {
    pub message: String,
}

/// `assertWithin(targetPath, rootDir, {allowAbsolute, label})`
pub fn assert_within(target: &str, root: &Path, allow_absolute: bool, label: &str) -> Result<PathBuf, PathSafetyError> {
    if target.is_empty() {
        return Err(PathSafetyError { message: format!("Invalid {}: must be a non-empty string", label) });
    }
    if target.contains('\0') {
        return Err(PathSafetyError { message: format!("Invalid {}: contains a NUL byte", label) });
    }
    if Path::new(target).is_absolute() && !allow_absolute {
        return Err(PathSafetyError { message: format!("Invalid {} \"{}\": absolute paths are not allowed. Use a path relative to the project root.", label, target) });
    }
    let abs_root = fsutil::resolve(root);
    let resolved = fsutil::resolve_from(&abs_root, target);
    let root_s = s(&abs_root);
    let root_sep = if root_s.ends_with('/') { root_s.clone() } else { format!("{}/", root_s) };
    let res_s = s(&resolved);
    if res_s != root_s && !res_s.starts_with(&root_sep) {
        return Err(PathSafetyError { message: format!("Invalid {} \"{}\": resolves outside the project root ({}). Path traversal is not allowed.", label, target, root_s) });
    }
    if let (Some(rr), Some(rt)) = (canonical(&abs_root, 0), canonical(&resolved, 0)) {
        let rrs = s(&rr);
        let rrsep = if rrs.ends_with('/') { rrs.clone() } else { format!("{}/", rrs) };
        let rts = s(&rt);
        if rts != rrs && !rts.starts_with(&rrsep) {
            return Err(PathSafetyError { message: format!("Invalid {} \"{}\": resolves outside the project root ({}) via a symlink. Path traversal is not allowed.", label, target, root_s) });
        }
    }
    Ok(resolved)
}

fn canonical(target: &Path, hops: usize) -> Option<PathBuf> {
    if hops > 40 {
        return None;
    }
    let md = match std::fs::symlink_metadata(target) {
        Ok(m) => m,
        Err(e) => {
            if e.kind() != std::io::ErrorKind::NotFound && e.raw_os_error() != Some(20) {
                return None;
            }
            let parent = target.parent()?;
            if parent == target {
                return Some(target.to_path_buf());
            }
            return Some(canonical(parent, hops)?.join(target.file_name()?));
        }
    };
    match std::fs::canonicalize(target) {
        Ok(p) => Some(p),
        Err(_) => {
            if !md.file_type().is_symlink() {
                return None;
            }
            let link = std::fs::read_link(target).ok()?;
            let dir = std::fs::canonicalize(target.parent()?).ok()?;
            canonical(&fsutil::normalize(&dir.join(link)), hops + 1)
        }
    }
}

pub struct Scoped {
    pub opts: Opts,
    pub cwd: PathBuf,
    pub origin: Option<PathBuf>,
}

/// `scopeToProject(options, cwd)`
pub fn scope_to_project(opts: &Opts, cwd: &Path) -> Scoped {
    let here = fsutil::resolve(cwd);
    let root = crate::discovery::paths::find_astryx_project(&s(&here)).map(PathBuf::from).unwrap_or(here.clone());
    if root == here {
        return Scoped { opts: opts.clone(), cwd: here, origin: None };
    }
    let mut o = opts.clone();
    if let Some(p) = &opts.path {
        o.path = Some(s(&fsutil::resolve_from(&here, p)));
    }
    Scoped { opts: o, cwd: root, origin: Some(here) }
}

fn rebase_path(root: &Path, origin: &Path, file: &str) -> String {
    let r = fsutil::relative(origin, &fsutil::resolve_from(root, file));
    if r.is_empty() {
        ".".into()
    } else {
        r
    }
}

fn rebase_declaration(root: &Path, origin: &Path, d: &str) -> String {
    for pat in [r"^(excluded by )(.+?)(:\d+)?$", r"^(linguist-(?:generated|vendored) in )(.+?)(:\d+)$", r"^(symbolic link at )(.+)()$"] {
        if let Some(m) = jsre::captures(pat, "u", d) {
            return format!("{}{}{}", m[1].clone().unwrap_or_default(), rebase_path(root, origin, m[2].as_deref().unwrap_or("")), m[3].clone().unwrap_or_default());
        }
    }
    d.to_string()
}

/// `relativeToOrigin(result, scoped)`
pub fn relative_to_origin(data: &mut Value, root: &Path, origin: Option<&Path>) {
    let Some(origin) = origin else { return };
    let Value::Object(m) = data else { return };
    if let Some(Value::Object(ad)) = m.get_mut("agentDocs") {
        if let Some(Value::Array(files)) = ad.get_mut("files") {
            for f in files.iter_mut() {
                if let Value::String(s0) = f {
                    *s0 = rebase_path(root, origin, s0);
                }
            }
        }
    }
    if let Some(Value::Array(files)) = m.get_mut("modifiedFiles") {
        for f in files.iter_mut() {
            if let Value::String(s0) = f {
                *s0 = rebase_path(root, origin, s0);
            }
        }
    }
    for key in ["protectedFiles", "declinedCandidates", "errors", "regenerate"] {
        if let Some(Value::Array(rows)) = m.get_mut(key) {
            for row in rows.iter_mut() {
                if let Value::Object(r) = row {
                    if let Some(Value::String(f)) = r.get("file").cloned() {
                        r.insert("file".into(), Value::String(rebase_path(root, origin, &f)));
                    }
                    if let Some(Value::Array(ds)) = r.get_mut("declarations") {
                        for d in ds.iter_mut() {
                            if let Value::String(x) = d {
                                *x = rebase_declaration(root, origin, x);
                            }
                        }
                    }
                }
            }
        }
    }
}

pub struct ApiResponse {
    pub kind: String,
    pub data: Value,
}

fn list_data() -> Vec<(String, String, String, Option<String>, bool)> {
    let mut out = Vec::new();
    for m in &registry::registry().versions {
        for t in &m.transforms {
            out.push((t.name.clone(), t.title.clone(), m.version.clone(), t.pr.clone(), t.optional));
        }
    }
    out
}

fn list(ui: &mut Ui) -> ApiResponse {
    let all = list_data();
    ui.log("Available codemods from @astryxdesign/core:");
    for (name, title, _v, pr, optional) in &all {
        ui.log(&format!("  {} - {}{} ({})", name, ui::to_ascii(title), if *optional { " (optional)" } else { "" }, pr.clone().unwrap_or_else(|| "undefined".into())));
    }
    ui.log("Done\n");
    let data = Value::Array(
        all.into_iter()
            .map(|(name, title, version, _pr, optional)| {
                let mut m = Map::new();
                m.insert("name".into(), Value::String(name));
                m.insert("package".into(), Value::String("@astryxdesign/core".into()));
                m.insert("title".into(), Value::String(title));
                m.insert("version".into(), Value::String(version));
                m.insert("optional".into(), Value::Bool(optional));
                Value::Object(m)
            })
            .collect(),
    );
    ApiResponse { kind: "upgrade.list".into(), data }
}

/// `upgrade(options, {cwd})` (api/upgrade/upgrade.mjs)
pub fn upgrade_api(ui: &mut Ui, opts: &Opts, cwd: &Path, cli_root: &Path) -> Result<ApiResponse, ApiError> {
    ui.log("\nUpgrade");
    let abort = |ui: &mut Ui, msg: String, code: &str| -> Result<ApiResponse, ApiError> {
        ui.error(&msg);
        ui.log("Aborted\n");
        Err(ApiError::new(msg, code))
    };
    if opts.list && opts.registry {
        return abort(ui, "`--list` and `--registry` cannot be used together.".into(), "ERR_INVALID_ARGUMENT");
    }
    if opts.list {
        let mut ignored: Vec<&str> = Vec::new();
        if opts.from.as_deref().map(|f| !f.is_empty()).unwrap_or(false) {
            ignored.push("--from");
        }
        if opts.force {
            ignored.push("--force");
        }
        if opts.apply {
            ignored.push("--apply");
        }
        if opts.path.as_deref().map(|p| !p.is_empty() && p != "./src").unwrap_or(false) {
            ignored.push("--path");
        }
        if opts.codemod.as_deref().map(|c| !c.is_empty()).unwrap_or(false) {
            ignored.push("--codemod");
        }
        if !opts.skip_codemod.is_empty() {
            ignored.push("--skip-codemod");
        }
        if !opts.integration.is_empty() {
            ignored.push("--integration");
        }
        if opts.install_deps {
            ignored.push("--install-deps");
        }
        if !ignored.is_empty() {
            return abort(ui, format!("`--list` cannot be combined with {}: it lists available codemods and does not run a migration.", ignored.join(", ")), "ERR_INVALID_ARGUMENT");
        }
    }
    if opts.registry {
        let mut inc: Vec<&str> = Vec::new();
        if opts.from.as_deref().map(|f| !f.is_empty()).unwrap_or(false) {
            inc.push("--from");
        }
        if opts.force {
            inc.push("--force");
        }
        if opts.codemod.as_deref().map(|c| !c.is_empty()).unwrap_or(false) {
            inc.push("--codemod");
        }
        if !opts.skip_codemod.is_empty() {
            inc.push("--skip-codemod");
        }
        if !opts.integration.is_empty() {
            inc.push("--integration");
        }
        if opts.install_deps {
            inc.push("--install-deps");
        }
        if !inc.is_empty() {
            return abort(ui, format!("`--registry` cannot be combined with {}.", inc.join(", ")), "ERR_INVALID_ARGUMENT");
        }
        let sc = scope_to_project(opts, cwd);
        let data = registry_compositions::registry_upgrade(ui, &sc.opts, &sc.cwd, sc.origin.as_deref())?;
        return Ok(ApiResponse { kind: "upgrade.registry".into(), data });
    }
    let from = opts.from.clone().unwrap_or_default();
    if !opts.list && from.is_empty() {
        let msg = if crate::discovery::release::is_outside_project(&s(cwd)) {
            "Missing required --from. This folder is outside a project; upgrade migrates the code of an app project that installs @astryxdesign/core.".to_string()
        } else {
            format!("Missing required --from. Install the target version first, then run `{} upgrade --from <old-version>`.", crate::discovery::package_manager::get_cli_invocation(None))
        };
        return abort(ui, msg, "ERR_INVALID_ARGUMENT");
    }
    if !opts.list && !crate::discovery::semver::is_valid_semver(&from) {
        return abort(ui, format!("Invalid --from value: \"{}\". Expected a semver string like 0.0.5.", from), "ERR_INVALID_VERSION");
    }
    if opts.list {
        return Ok(list(ui));
    }
    let sc = scope_to_project(opts, cwd);
    match run::run(ui, &sc.opts, &sc.cwd, sc.origin.as_deref(), cli_root) {
        Ok(r) => {
            let mut data = r.data;
            relative_to_origin(&mut data, &sc.cwd, sc.origin.as_deref());
            Ok(ApiResponse { kind: r.kind.into(), data })
        }
        Err(mut e) => {
            if let Some(rc) = e.receipt.as_mut() {
                relative_to_origin(rc, &sc.cwd, sc.origin.as_deref());
            }
            Err(e)
        }
    }
}

fn opts_from(inv: &Invocation) -> Opts {
    let path = if inv.opt_sources.get("path") == Some(&OptSource::Default) { None } else { inv.opt_str("path").map(|s| s.to_string()) };
    Opts {
        from: inv.opt_str("from").map(|s| s.to_string()),
        apply: inv.flag("apply"),
        force: inv.flag("force"),
        codemod: inv.opt_str("codemod").map(|s| s.to_string()),
        skip_codemod: inv.opt_list("skipCodemod").unwrap_or_default(),
        integration: inv.opt_list("integration").unwrap_or_default(),
        path,
        install_deps: inv.flag("installDeps"),
        registry: inv.flag("registry"),
        list: inv.flag("list"),
    }
}

/// The `upgrade` command handler (clients/cli/commands/upgrade.mjs).
pub fn run_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    let json = inv.globals.json;
    let opts = opts_from(inv);
    let is_list = opts.list;
    let silent = json || is_list;
    let result = {
        let mut ui = Ui { out, silent };
        upgrade_api(&mut ui, &opts, &inv.cwd, &inv.cli_root)
    };
    let result = match result {
        Ok(r) => r,
        Err(e) => {
            if e.code == "CRASH" {
                // An uncaught error: the JS CLI reports it as ERR_UNKNOWN under
                // --json, else prints it (with a Node stack trace); exit 1.
                if json {
                    return Err(out.json_error(&e.message, &[], "ERR_UNKNOWN", None));
                }
                out.println(&format!("Error: {}", e.message));
                out.exit_code = 1;
                return Ok(());
            }
            if json {
                return Err(out.json_error(&e.message, &[], &e.code, e.receipt.as_ref()));
            }
            if is_list {
                out.eprintln(&e.message);
            }
            out.exit_code = 1;
            return Ok(());
        }
    };
    if json {
        out.json_out(&result.kind, None, result.data.clone(), None);
    } else if result.kind == "upgrade.list" {
        let rows: Vec<Value> = result.data.as_array().cloned().unwrap_or_default();
        let items: Vec<_> = rows.iter().map(|r| json_fields(r, Some(&["name", "package", "title", "version", "optional"]))).collect();
        let blocks: Vec<Block> = vec![section("Available codemods", None), records(&items)];
        out.emit(&blocks);
    }
    let registry_summary = match result.kind.as_str() {
        "upgrade.registry" => Some(result.data.clone()),
        "upgrade.run" | "upgrade.status" => result.data.get("registryCompositions").cloned(),
        _ => None,
    };
    if let Some(r) = registry_summary {
        if r.get("ok").and_then(|v| v.as_bool()) == Some(false) {
            out.exit_code = 1;
        }
    }
    if result.kind == "upgrade.run" && result.data.get("complete").and_then(|v| v.as_bool()) == Some(false) {
        out.exit_code = 1;
    }
    let _ = Exit(0);
    Ok(())
}
