//! What a copied template needs that the project lacks.
//! Port of foundation/discovery/template-needs.mjs.

use super::{fsutil, ApiError};
use crate::cli::command::Invocation;
use crate::json::Value;
use std::path::Path;

pub struct Needs {
    pub notes: Vec<String>,
    pub missing: Vec<String>,
    pub install_command: Option<String>,
}

const NODE_BUILTINS: &[&str] = &[
    "_http_agent", "_http_client", "_http_common", "_http_incoming", "_http_outgoing", "_http_server", "_stream_duplex",
    "_stream_passthrough", "_stream_readable", "_stream_transform", "_stream_wrap", "_stream_writable", "_tls_common",
    "_tls_wrap", "assert", "assert/strict", "async_hooks", "buffer", "child_process", "cluster", "console", "constants",
    "crypto", "dgram", "diagnostics_channel", "dns", "dns/promises", "domain", "events", "fs", "fs/promises", "http",
    "http2", "https", "inspector", "inspector/promises", "module", "net", "os", "path", "path/posix", "path/win32",
    "perf_hooks", "process", "punycode", "querystring", "readline", "readline/promises", "repl", "stream",
    "stream/consumers", "stream/promises", "stream/web", "string_decoder", "sys", "timers", "timers/promises", "tls",
    "trace_events", "tty", "url", "util", "util/types", "v8", "vm", "wasi", "worker_threads", "zlib",
];

/// `extractImportedPackages`.
pub fn imported_packages(source: &str) -> Vec<String> {
    let re = regress::Regex::new(r#"(?:from\s+|import\s*\(?)['"]((?:@[^/'"]+\/)?[^./'"@][^'"]*)['"]"#).expect("regex");
    let mut out: Vec<String> = Vec::new();
    for m in re.find_iter(source) {
        let Some(g) = m.group(1) else { continue };
        let spec = &source[g];
        if spec.starts_with("node:") {
            continue;
        }
        let name = if spec.starts_with('@') {
            spec.split('/').take(2).collect::<Vec<_>>().join("/")
        } else {
            spec.split('/').next().unwrap_or("").to_string()
        };
        if NODE_BUILTINS.contains(&name.as_str()) {
            continue;
        }
        if !out.contains(&name) {
            out.push(name);
        }
    }
    out
}

fn read_json(p: &str) -> Option<Value> {
    serde_json::from_str(&std::fs::read_to_string(p).ok()?).ok()
}

fn deps_of(pkg: &Value) -> Vec<String> {
    let mut v = Vec::new();
    for k in ["dependencies", "devDependencies"] {
        if let Some(Value::Object(m)) = pkg.get(k) {
            v.extend(m.keys().cloned());
        }
    }
    v
}

/// `findWorkspaceRoot`.
// TEMP: replace with src/discovery paths::find_workspace_root when it lands.
fn workspace_root(start: &str) -> String {
    let mut nearest: Option<String> = None;
    let mut dir = fsutil::normalize(start);
    loop {
        if Path::new(&fsutil::join(&dir, "pnpm-workspace.yaml")).exists()
            || read_json(&fsutil::join(&dir, "package.json")).map_or(false, |p| p.get("workspaces").map_or(false, |w| !w.is_null()))
        {
            return dir;
        }
        if nearest.is_none() && Path::new(&fsutil::join(&dir, "package.json")).exists() {
            nearest = Some(dir.clone());
        }
        let p = fsutil::dirname(&dir);
        if p == dir {
            break;
        }
        dir = p;
    }
    nearest.unwrap_or_else(|| fsutil::normalize(start))
}

/// Lockfiles in one folder, as (pm, file).
fn lockfiles_in(dir: &str) -> Vec<(&'static str, &'static str)> {
    let all = [
        ("pnpm", "pnpm-lock.yaml"),
        ("yarn", "yarn.lock"),
        ("bun", "bun.lock"),
        ("bun", "bun.lockb"),
        ("npm", "package-lock.json"),
    ];
    all.iter().copied().filter(|(_, f)| Path::new(&fsutil::join(dir, f)).exists()).collect()
}

/// `decidePackageManagerIn` (TEMP, simplified): (pm or None when ambiguous, lockfiles).
// TEMP: replace with src/discovery package_manager::decide_package_manager_in when it lands.
fn decide_in(dir: &str) -> Option<(Option<String>, Vec<&'static str>)> {
    let locks = lockfiles_in(dir);
    let declared = read_json(&fsutil::join(dir, "package.json"))
        .and_then(|p| p.get("packageManager").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .and_then(|s| s.split('@').next().map(|x| x.to_string()))
        .filter(|s| ["npm", "pnpm", "yarn", "bun"].contains(&s.as_str()));
    if let Some(d) = declared {
        return Some((Some(d), locks.iter().map(|l| l.1).collect()));
    }
    if locks.len() == 1 {
        return Some((Some(locks[0].0.to_string()), vec![locks[0].1]));
    }
    if locks.len() > 1 {
        return Some((None, locks.iter().map(|l| l.1).collect()));
    }
    None
}

fn add_verb(pm: &str) -> &'static str {
    match pm {
        "pnpm" => "pnpm add",
        "yarn" => "yarn add",
        "bun" => "bun add",
        _ => "npm install",
    }
}

fn detect_stylex(cwd: &str) -> bool {
    let Some(pkg) = read_json(&fsutil::join(cwd, "package.json")) else { return false };
    let deps = deps_of(&pkg);
    [
        "@stylexjs/babel-plugin", "@stylexjs/rollup-plugin", "@stylexjs/webpack-plugin", "@stylexjs/nextjs-plugin",
        "@stylexjs/unplugin", "vite-plugin-stylex", "unplugin-stylex", "@stylexswc/unplugin", "@stylexswc/nextjs-plugin",
        "stylex-webpack",
    ]
    .iter()
    .any(|d| deps.iter().any(|x| x == d))
}

/// `analyzeTemplateNeeds`.
pub fn analyze(inv: &Invocation, source: &str, cwd: &str) -> Needs {
    let imported = imported_packages(source);
    let external: Vec<String> = imported
        .iter()
        .filter(|n| *n != "react" && *n != "react-dom" && !n.starts_with("@astryxdesign/") && *n != "@stylexjs/stylex")
        .cloned()
        .collect();
    let project_deps = read_json(&fsutil::join(cwd, "package.json")).map(|p| deps_of(&p)).unwrap_or_default();
    let missing: Vec<String> = external.into_iter().filter(|p| !project_deps.contains(p)).collect();
    let mut install = None;
    let mut no_cmd = None;
    if !missing.is_empty() {
        let ranges = read_json(&fsutil::path_str(&inv.cli_root.join("package.json")))
            .and_then(|p| p.get("devDependencies").cloned())
            .unwrap_or(Value::Null);
        let specs: Vec<String> = missing
            .iter()
            .map(|p| match ranges.get(p).and_then(|v| v.as_str()) {
                Some(r) if !r.is_empty() => format!("{p}@\"{r}\""),
                _ => p.clone(),
            })
            .collect();
        let root = workspace_root(cwd);
        let mut dir = fsutil::normalize(cwd);
        let mut verb: Option<String> = Some("npm install".into());
        loop {
            if let Some((pm, locks)) = decide_in(&dir) {
                match pm {
                    Some(pm) => verb = Some(add_verb(&pm).to_string()),
                    None => {
                        verb = None;
                        let r = fsutil::relative(cwd, &dir);
                        let where_ = if r.is_empty() { ".".to_string() } else { r };
                        no_cmd = Some(format!(
                            "Install missing dependencies: {}. No install command: {where_} has {}, and nothing there says which package manager to use.",
                            specs.join(" "),
                            locks.join(" and ")
                        ));
                    }
                }
                break;
            }
            let p = fsutil::dirname(&dir);
            if dir == root || p == dir {
                break;
            }
            dir = p;
        }
        if let Some(v) = verb {
            install = Some(format!("{v} {}", specs.join(" ")));
        }
    }
    let uses_stylex = imported.iter().any(|x| x == "@stylexjs/stylex");
    let mut notes = Vec::new();
    if !missing.is_empty() {
        notes.push(match &install {
            Some(c) => format!("Install missing dependencies: {c}"),
            None => no_cmd.unwrap_or_default(),
        });
    }
    if uses_stylex && !detect_stylex(cwd) {
        notes.push(format!(
            "This template uses StyleX. Your project needs a StyleX compiler plugin \u{2014} see `{}` for setup steps.",
            crate::cli::env::format_cli_command("docs styling-overview")
        ));
    }
    Needs { notes, missing, install_command: install }
}

/// `writeFailed(path, cwd, err)`.
pub fn write_failed(path: &str, cwd: &str, e: &std::io::Error) -> ApiError {
    let rel = {
        let r = fsutil::relative(cwd, path);
        if r.is_empty() { path.to_string() } else { r }
    };
    let msg = super::node_err(e, "open", path);
    let errno = msg.split(':').next().unwrap_or("").to_string();
    write_failed_code(path, cwd, &errno)
}

/// `writeFailed` for an error whose code is known.
pub fn write_failed_code(path: &str, cwd: &str, errno: &str) -> ApiError {
    let rel = {
        let r = fsutil::relative(cwd, path);
        if r.is_empty() { path.to_string() } else { r }
    };
    let why = if errno == "EACCES" || errno == "EPERM" { " (no permission)" } else { "" };
    ApiError::new(&format!("Could not write {rel}: {errno}{why}. Nothing was written."), "ERR_WRITE_FAILED")
}
