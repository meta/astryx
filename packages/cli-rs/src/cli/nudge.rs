//! The once-a-day setup reminder (`clients/cli/index.mjs` preAction and
//! postAction hooks) and the per-user state it records
//! (`foundation/release/notices.mjs` takeNotice, `global-state.mjs`).
//!
//! TEMP pieces until their owners land: agent-doc state (init lane),
//! findAstryxProject / findPackageRoot (discovery lane; workspace members
//! are not recognized yet).

use crate::cli::release::{self, normalize, read_json};
use crate::json::{Map, Value};
use std::path::{Path, PathBuf};

const AGENT_DOC_PATHS: &[&str] = &["AGENTS.md", "CLAUDE.md", ".claude/CLAUDE.md", "GEMINI.md", ".cursorrules", ".hermes.md", "HERMES.md"];
const INIT_MARKERS: &[&str] = &["<!-- ASTRYX:START -->", "<!-- XDS:START -->"];
const REPOSITORY_MARKERS: &[&str] = &[".git", ".hg", ".sl"];
const INTEGRATION_MANIFEST_FILES: &[&str] = &["astryx.integration.ts", "astryx.integration.mjs", "astryx.integration.js"];
pub const SETUP_REMINDER_KEY: &str = "setup:";
const NOTICE_INTERVAL_MS: f64 = 24.0 * 60.0 * 60_000.0;
const FORGET_AFTER_MS: f64 = 30.0 * 24.0 * 60.0 * 60_000.0;

fn real_dir(p: &Path) -> PathBuf {
    std::fs::canonicalize(p).unwrap_or_else(|_| normalize(p))
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").filter(|h| !h.is_empty()).map(PathBuf::from)
}

fn holds_astryx_block(content: &str) -> bool {
    for marker in INIT_MARKERS {
        let mut from_search = 0;
        while let Some(i) = content[from_search..].find(marker) {
            let at = from_search + i;
            let from = at + marker.len();
            let end = content[from..].find("<!--").map(|j| from + j);
            let inner = match end {
                Some(e) => &content[from..e],
                None => &content[from..],
            }
            .trim();
            let is_ref = inner.starts_with('@') && inner.len() > 1 && !inner.chars().any(char::is_whitespace);
            if !is_ref {
                return true;
            }
            from_search = from;
        }
    }
    false
}

/// `isAstryxInitialized(dir)`.
pub fn is_astryx_initialized(dir: &Path) -> bool {
    AGENT_DOC_PATHS.iter().any(|rel| std::fs::read_to_string(dir.join(rel)).map(|c| holds_astryx_block(&c)).unwrap_or(false))
}

/// `isAstryxPromptInReach(startDir)`.
pub fn is_astryx_prompt_in_reach(start: &Path) -> bool {
    let start = normalize(start);
    let mut root = None;
    let mut d = start.clone();
    loop {
        if d.join(".git").exists() {
            root = Some(d.clone());
            break;
        }
        match d.parent() {
            Some(p) => d = p.to_path_buf(),
            None => break,
        }
    }
    let Some(root) = root else { return is_astryx_initialized(&start) };
    let mut dir = start;
    loop {
        if is_astryx_initialized(&dir) {
            return true;
        }
        if dir == root {
            return false;
        }
        match dir.parent() {
            Some(p) => dir = p.to_path_buf(),
            None => return false,
        }
    }
}

fn declares_scope(pkg: &Value, scopes: &[&str]) -> bool {
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].iter().any(|f| pkg.get(*f).and_then(|d| d.as_object()).map(|d| d.keys().any(|k| scopes.iter().any(|s| k.starts_with(s)))).unwrap_or(false))
}

/// `resolveAgentDocsRoot(cwd)` / `agentDocsTargetDir(cwd)`.
pub fn agent_docs_target_dir(cwd: &Path) -> PathBuf {
    let home_real = home().map(|h| real_dir(&h));
    let mut dir = normalize(cwd);
    let mut nearest: Option<PathBuf> = None;
    for _ in 0..50 {
        if home_real.as_ref() == Some(&real_dir(&dir)) {
            break;
        }
        let file = dir.join("package.json");
        if file.exists() {
            let parsed = read_json(&file).filter(|v| v.is_object());
            if parsed.as_ref().map(|p| declares_scope(p, &["@astryxdesign/"])).unwrap_or(false) {
                return dir;
            }
            if nearest.is_none() {
                nearest = Some(dir.clone());
            }
        }
        if REPOSITORY_MARKERS.iter().any(|m| dir.join(m).exists()) {
            break;
        }
        match dir.parent() {
            Some(p) => dir = p.to_path_buf(),
            None => break,
        }
    }
    nearest.unwrap_or_else(|| cwd.to_path_buf())
}

/// `isHomeOrSettingsFolder(dir)` (assertAgentDocsTarget throws when true).
pub fn is_home_or_settings_folder(dir: &Path) -> bool {
    let Some(h) = home() else { return false };
    let h = real_dir(&h);
    let d = real_dir(dir);
    if d == h {
        return true;
    }
    let Ok(rel) = d.strip_prefix(&h) else { return false };
    let parts: Vec<_> = rel.components().collect();
    if !parts[0].as_os_str().to_string_lossy().starts_with('.') {
        return false;
    }
    let mut current = d.clone();
    for _ in (2..=parts.len()).rev() {
        if current.join("package.json").exists() {
            return false;
        }
        current = current.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    }
    true
}

/// `findAstryxProject(startDir)` (TEMP: no workspace members).
pub fn find_astryx_project(start: &Path) -> Option<PathBuf> {
    let home_real = home().map(|h| real_dir(&h));
    let mut dir = normalize(start);
    loop {
        if home_real.as_ref() == Some(&real_dir(&dir)) {
            return None;
        }
        if read_json(&dir.join("package.json")).filter(|v| v.is_object()).map(|p| declares_scope(&p, &["@astryxdesign/", "@xds/"])).unwrap_or(false) {
            return Some(dir);
        }
        if REPOSITORY_MARKERS.iter().any(|m| dir.join(m).exists()) {
            return None;
        }
        match dir.parent() {
            Some(p) => dir = p.to_path_buf(),
            None => return None,
        }
    }
}

pub fn find_package_root(start: &Path) -> Option<PathBuf> {
    let mut dir = normalize(start);
    loop {
        if dir.join("package.json").exists() {
            return Some(dir);
        }
        match dir.parent() {
            Some(p) => dir = p.to_path_buf(),
            None => return None,
        }
    }
}

/// `installFolder(cwd)`: `(dir, moved)`.
pub fn install_folder(cwd: &Path) -> Option<(PathBuf, bool)> {
    let project = find_astryx_project(cwd)?;
    match find_package_root(cwd) {
        Some(n) if n != project => Some((project, true)),
        _ => Some((cwd.to_path_buf(), false)),
    }
}

fn in_own_source_checkout(cwd: &Path) -> bool {
    let root = crate::cli::env::cli_root();
    let root = normalize(&root);
    if root.components().any(|c| c.as_os_str() == "node_modules") {
        return false;
    }
    let mut checkout = root.clone();
    while !checkout.join("pnpm-workspace.yaml").exists() {
        match checkout.parent() {
            Some(p) => checkout = p.to_path_buf(),
            None => return false,
        }
    }
    normalize(cwd).starts_with(&checkout)
}

/// `setupNudge(invocation, {before})` trimmed at the end.
fn setup_nudge(invocation: &str, before: Option<&str>) -> String {
    let run = match before {
        Some(b) => format!("`{b}`, then `{invocation} init`"),
        None => format!("`{invocation} init`"),
    };
    format!("\nNext step: run {run} to finish setup and install the Astryx agent prompt.")
}

/// `projectRelease(dir)`: `(version, own)`.
fn project_release(dir: &Path) -> Option<(String, bool)> {
    let facts = release::read_release_facts(dir);
    if let Some(c) = &facts.cli {
        return Some((c.version.clone(), true));
    }
    crate::discovery::release::core_version_of(&facts).map(|v| (v, false))
}

fn is_ci() -> bool {
    match std::env::var("CI") {
        Ok(v) => !v.is_empty() && v != "0" && v.to_lowercase() != "false",
        Err(_) => false,
    }
}

/// The reminder a run would print after its command: `(root, line)`.
pub fn decide(cwd: &Path, action_name: &str, json: bool) -> Option<(PathBuf, String)> {
    if json || action_name == "init" || action_name == "agent-docs" {
        return None;
    }
    if !cwd.join("package.json").exists() {
        return None;
    }
    let choice = release::run_choice(cwd);
    if !choice.in_project {
        return None;
    }
    if INTEGRATION_MANIFEST_FILES.iter().any(|f| cwd.join(f).exists()) {
        return None;
    }
    if in_own_source_checkout(cwd) || is_astryx_prompt_in_reach(cwd) {
        return None;
    }
    let target_dir = agent_docs_target_dir(cwd);
    if is_astryx_initialized(&target_dir) || is_home_or_settings_folder(&target_dir) {
        return None;
    }
    let (dir, moved) = install_folder(cwd)?;
    if moved {
        let inv = release::cli_invocation_with(&dir, false, project_release(&dir));
        let before = format!("cd {}", crate::discovery::package_manager::quote_command_argument(&dir.to_string_lossy()));
        return Some((dir, setup_nudge(&inv, Some(&before))));
    }
    if choice.copy == "starting" {
        if let Some(core) = choice.core_version.as_ref().filter(|c| **c != choice.version) {
            let facts = release::read_release_facts(cwd);
            let root = crate::discovery::release::project_root_of(&facts).map(PathBuf::from).unwrap_or_else(|| cwd.to_path_buf());
            let add = match release::detect_package_manager(&root).as_str() {
                "pnpm" => "pnpm add",
                "yarn" => "yarn add",
                "bun" => "bun add",
                _ => "npm install",
            };
            let command = format!("{add} {}@{core}", release::CLI_PACKAGE_NAME);
            let inv = release::cli_invocation_with(&root, true, None);
            return Some((root, setup_nudge(&inv, Some(&command))));
        }
    }
    Some((target_dir, setup_nudge(&release::cli_invocation(cwd), None)))
}

/// `userConfigDir()` on Linux.
pub fn user_config_dir() -> PathBuf {
    let xdg = std::env::var("XDG_CONFIG_HOME").ok().filter(|v| !v.is_empty() && v.starts_with('/'));
    let base = xdg.map(PathBuf::from).unwrap_or_else(|| home().unwrap_or_else(|| PathBuf::from("/")).join(".config"));
    base.join("astryx")
}

fn now_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

/// `takeNotice(key)`: whether the notice may print now; records its time.
pub fn take_notice(key: &str) -> bool {
    let dir = user_config_dir();
    if std::fs::create_dir_all(&dir).is_err() {
        return false;
    }
    let lock = dir.join(".lock-state");
    if std::fs::create_dir(&lock).is_err() {
        return false;
    }
    let file = dir.join("state.json");
    let state = read_json(&file).filter(|v| v.is_object()).unwrap_or(Value::Object(Map::new()));
    let now = now_ms();
    let shown = state.get("notifiedAt").and_then(|v| v.as_object()).cloned().unwrap_or_default();
    let taken = if let Some(last) = shown.get(key).and_then(|v| v.as_f64()) {
        now - last >= NOTICE_INTERVAL_MS
    } else {
        true
    };
    let mut ok = false;
    if taken {
        let mut next = Map::new();
        for (k, t) in &shown {
            if let Some(t) = t.as_f64() {
                if now - t < FORGET_AFTER_MS {
                    next.insert(k.clone(), crate::json::num(t));
                }
            }
        }
        next.shift_remove(key);
        next.insert(key.to_string(), crate::json::num(now));
        let mut st = state.as_object().cloned().unwrap_or_default();
        st.insert("notifiedAt".into(), Value::Object(next));
        let tmp = dir.join(format!("state.json.{}.tmp", std::process::id()));
        let text = format!("{}\n", crate::json::stringify(&Value::Object(st), 2));
        ok = std::fs::write(&tmp, text).is_ok() && std::fs::rename(&tmp, &file).is_ok();
    }
    let _ = std::fs::remove_dir_all(&lock);
    ok
}

/// The postAction half: print the reminder after a command that succeeded.
pub fn after_action(reminder: Option<(PathBuf, String)>, exit_code: i32, out: &mut crate::cli::command::Out) {
    let Some((root, line)) = reminder else { return };
    if exit_code != 0 || is_ci() {
        return;
    }
    if take_notice(&format!("{SETUP_REMINDER_KEY}{}", root.to_string_lossy())) {
        out.eprintln(&line);
    }
}
