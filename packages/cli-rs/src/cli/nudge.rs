//! The once-a-day setup reminder (`clients/cli/index.mjs` preAction and
//! postAction hooks) and the per-user state it records
//! (`foundation/release/notices.mjs` takeNotice, `global-state.mjs`).
//! Agent-doc state comes from init's agent-docs port; project lookups from
//! discovery's paths.

use crate::cli::release::{self, normalize, read_json};
use crate::json::{Map, Value};
use std::path::{Path, PathBuf};

const INTEGRATION_MANIFEST_FILES: &[&str] = &["astryx.integration.ts", "astryx.integration.mjs", "astryx.integration.js"];
pub const SETUP_REMINDER_KEY: &str = "setup:";
const NOTICE_INTERVAL_MS: f64 = 24.0 * 60.0 * 60_000.0;
const FORGET_AFTER_MS: f64 = 30.0 * 24.0 * 60.0 * 60_000.0;

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").filter(|h| !h.is_empty()).map(PathBuf::from)
}

/// `isAstryxInitialized(dir)`.
pub fn is_astryx_initialized(dir: &Path) -> bool {
    crate::commands::init::agent_docs::is_astryx_initialized(&dir.to_string_lossy())
}

/// `isAstryxPromptInReach(startDir)`.
pub fn is_astryx_prompt_in_reach(start: &Path) -> bool {
    crate::commands::init::agent_docs::is_astryx_prompt_in_reach(&start.to_string_lossy())
}

/// `agentDocsTargetDir(cwd)`.
pub fn agent_docs_target_dir(cwd: &Path) -> PathBuf {
    PathBuf::from(crate::commands::init::agent_docs::agent_docs_target_dir(&cwd.to_string_lossy()))
}

/// `isHomeOrSettingsFolder(dir)` (assertAgentDocsTarget throws when true).
pub fn is_home_or_settings_folder(dir: &Path) -> bool {
    crate::commands::init::agent_docs::is_home_or_settings_folder(&dir.to_string_lossy())
}

/// `findAstryxProject(startDir)`.
pub fn find_astryx_project(start: &Path) -> Option<PathBuf> {
    crate::discovery::paths::find_astryx_project(&start.to_string_lossy()).map(PathBuf::from)
}

/// `findPackageRoot(startDir)`.
pub fn find_package_root(start: &Path) -> Option<PathBuf> {
    crate::discovery::paths::find_package_root(&start.to_string_lossy()).map(PathBuf::from)
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

const STALE_LOCK_MS: f64 = 30.0 * 60_000.0;
const FOREIGN_LOCK_MS: f64 = 20.0 * 60_000.0;
const UNOWNED_LOCK_MS: f64 = 10_000.0;
const STATE_LOCK_WAIT_MS: f64 = 2000.0;

/// `os.hostname()`.
fn hostname() -> String {
    std::fs::read_to_string("/proc/sys/kernel/hostname").map(|s| s.trim_end_matches('\n').to_string()).unwrap_or_default()
}

/// `process.kill(pid, 0)` succeeds or fails with EPERM.
fn is_alive(pid: i64) -> bool {
    pid > 0 && Path::new(&format!("/proc/{pid}")).exists()
}

fn mtime_ms(p: &Path) -> Option<f64> {
    let m = std::fs::metadata(p).ok()?.modified().ok()?;
    Some(match m.duration_since(std::time::UNIX_EPOCH) {
        Ok(d) => d.as_secs_f64() * 1000.0,
        Err(e) => -(e.duration().as_secs_f64() * 1000.0),
    })
}

/// `lockIsStale(lockDir, now)` (release/cache.mjs). A foreign lock is never
/// "silent" within one run: that needs a minute of watching.
fn lock_is_stale(lock: &Path, now: f64) -> bool {
    let Some(mtime) = mtime_ms(lock) else { return false };
    let age = now - mtime;
    if age > STALE_LOCK_MS {
        return true;
    }
    let Some(owner) = read_json(&lock.join("owner.json")) else { return age > UNOWNED_LOCK_MS };
    let pid = owner.get("pid").and_then(|v| v.as_f64()).filter(|f| f.fract() == 0.0 && f.is_finite());
    let host_matches = owner.get("host").and_then(|v| v.as_str()) == Some(hostname().as_str());
    match pid {
        Some(pid) if host_matches => !is_alive(pid as i64),
        _ => age > FOREIGN_LOCK_MS,
    }
}

/// `tryLock(lockDir)`: `Ok(true)` taken, `Ok(false)` held by another run,
/// `Err` when the folder cannot be written.
fn try_lock(lock: &Path) -> std::io::Result<bool> {
    if let Some(parent) = lock.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if let Err(e) = std::fs::create_dir(lock) {
        if e.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(e);
        }
        if !lock_is_stale(lock, now_ms()) {
            return Ok(false);
        }
        let aside = PathBuf::from(format!("{}.stale-{}-{}", lock.to_string_lossy(), std::process::id(), random_tag()));
        if std::fs::rename(lock, &aside).is_err() {
            return Ok(false);
        }
        let _ = std::fs::remove_dir_all(&aside).or_else(|_| std::fs::remove_file(&aside));
        if std::fs::create_dir(lock).is_err() {
            return Ok(false);
        }
    }
    let mut owner = Map::new();
    owner.insert("pid".into(), Value::from(std::process::id()));
    owner.insert("host".into(), Value::String(hostname()));
    owner.insert("at".into(), crate::json::num(now_ms()));
    let _ = std::fs::write(lock.join("owner.json"), crate::json::stringify(&Value::Object(owner), 0));
    Ok(true)
}

fn random_tag() -> String {
    let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_nanos()).unwrap_or(0) ^ std::process::id().rotate_left(13);
    let mut x = n as u64 | 1;
    let mut out = String::new();
    for _ in 0..6 {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let d = ((x >> 33) % 36) as u32;
        out.push(std::char::from_digit(d, 36).unwrap());
    }
    out
}

/// `tryStateLock(stateDir, change)`: `None` when the lock was not taken
/// (held past the wait, or the folder cannot be written).
fn with_state_lock<T>(dir: &Path, change: impl FnOnce() -> T) -> Option<T> {
    let lock = dir.join(".lock-state");
    // The JS deadline reads the wall clock, as this does.
    let deadline = now_ms() + STATE_LOCK_WAIT_MS;
    loop {
        match try_lock(&lock) {
            Ok(true) => break,
            Ok(false) => {
                if now_ms() > deadline {
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            Err(_) => return None,
        }
    }
    let v = change();
    let _ = std::fs::remove_dir_all(&lock).or_else(|_| std::fs::remove_file(&lock));
    Some(v)
}

/// `takeNotice(key)`: whether the notice may print now; records its time.
pub fn take_notice(key: &str) -> bool {
    let dir = user_config_dir();
    if std::fs::create_dir_all(&dir).is_err() {
        return false;
    }
    let file = dir.join("state.json");
    let outcome = with_state_lock(&dir, || {
        let state = read_json(&file).filter(|v| v.is_object()).unwrap_or(Value::Object(Map::new()));
        let now = now_ms();
        let shown = state.get("notifiedAt").and_then(|v| v.as_object()).cloned().unwrap_or_default();
        if let Some(last) = shown.get(key).and_then(|v| v.as_f64()) {
            if now - last < NOTICE_INTERVAL_MS {
                return false;
            }
        }
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
        std::fs::write(&tmp, text).is_ok() && std::fs::rename(&tmp, &file).is_ok()
    });
    outcome == Some(true)
}

/// `updateGlobalState(patch)`: merge `patch` into the saved state under the
/// state lock (the same wait and stale-lock takeover as takeNotice). An
/// unwritable folder or a lock that stays taken keeps nothing.
pub fn update_global_state(dir: &Path, patch: Map<String, Value>) {
    let _ = std::fs::create_dir_all(dir);
    let file = dir.join("state.json");
    with_state_lock(dir, || {
        let mut state = read_json(&file).filter(|v| v.is_object()).and_then(|v| v.as_object().cloned()).unwrap_or_default();
        for (k, v) in patch {
            state.insert(k, v);
        }
        let tmp = dir.join(format!("state.json.{}.tmp", std::process::id()));
        let text = format!("{}\n", crate::json::stringify(&Value::Object(crate::json::js_key_order(state)), 2));
        if std::fs::write(&tmp, text).is_ok() {
            let _ = std::fs::rename(&tmp, &file);
        }
    });
}

/// `recordAgentTextWritten(version, stateDir)`.
pub fn record_agent_text_written(version: &str, dir: &Path) {
    if !release::is_release_version(version) {
        return;
    }
    let mut written = Map::new();
    written.insert("writtenBy".into(), Value::String(version.into()));
    let mut patch = Map::new();
    patch.insert("agentText".into(), Value::Object(written));
    update_global_state(dir, patch);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn lock_at(name: &str, age_s: u64, owner: Option<Value>) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("astryx-lock-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        if let Some(o) = owner {
            std::fs::write(dir.join("owner.json"), crate::json::stringify(&o, 0)).unwrap();
        }
        let t = std::time::SystemTime::now() - std::time::Duration::from_secs(age_s);
        std::fs::File::open(&dir).unwrap().set_modified(t).unwrap();
        dir
    }

    #[test]
    fn stale_lock_rules_follow_js() {
        let now = now_ms();
        let host = hostname();
        assert!(!lock_is_stale(&lock_at("unowned-fresh", 5, None), now));
        assert!(lock_is_stale(&lock_at("unowned-old", 11, None), now));
        let live = serde_json::json!({"pid": std::process::id(), "host": host, "at": 0});
        assert!(!lock_is_stale(&lock_at("live", 60, Some(live.clone())), now));
        assert!(lock_is_stale(&lock_at("live-old", 31 * 60, Some(live)), now));
        let dead = serde_json::json!({"pid": 2147480000u32, "host": host, "at": 0});
        assert!(lock_is_stale(&lock_at("dead", 1, Some(dead)), now));
        let foreign = serde_json::json!({"pid": 1, "host": "elsewhere.example", "at": 0});
        assert!(!lock_is_stale(&lock_at("foreign", 19 * 60, Some(foreign.clone())), now));
        assert!(lock_is_stale(&lock_at("foreign-old", 21 * 60, Some(foreign)), now));
        let odd_pid = serde_json::json!({"pid": "12", "host": host, "at": 0});
        assert!(!lock_is_stale(&lock_at("odd-pid", 60, Some(odd_pid)), now));
    }

    #[test]
    fn stale_lock_is_taken_over() {
        let lock = lock_at("takeover", 60, None);
        assert!(try_lock(&lock).unwrap());
        let owner = read_json(&lock.join("owner.json")).unwrap();
        assert_eq!(owner["pid"], Value::from(std::process::id()));
        assert!(!try_lock(&lock).unwrap());
        let _ = std::fs::remove_dir_all(&lock);
    }
}
