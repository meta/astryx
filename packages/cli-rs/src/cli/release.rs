//! The global-mode/release decision as far as it changes the shell's output:
//! the who-answered line `startRun` prints before a command. The choice
//! itself, the run prefix and `answeredBy` are ported once, in
//! `crate::discovery::{release, package_manager}`; this module only adapts
//! them to paths.

use crate::discovery::{package_manager as pm, release as rel};
use std::path::{Path, PathBuf};

pub use rel::ReleaseChoice as Choice;

pub const CLI_PACKAGE_NAME: &str = "@astryxdesign/cli";

fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

pub fn read_json(file: &Path) -> Option<crate::json::Value> {
    let text = std::fs::read_to_string(file).ok()?;
    serde_json::from_str(&text).ok()
}

/// `path.resolve` normalization (no symlinks).
pub fn normalize(p: &Path) -> PathBuf {
    let base = if p.is_absolute() { PathBuf::new() } else { std::env::current_dir().unwrap_or_default() };
    let mut out = PathBuf::new();
    for c in base.join(p).components() {
        match c {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

pub fn run_choice(cwd: &Path) -> Choice {
    rel::run_choice(&s(cwd))
}

pub fn read_release_facts(dir: &Path) -> rel::ReleaseFacts {
    rel::read_release_facts(&s(dir))
}

pub fn is_release_version(v: &str) -> bool {
    rel::is_release_version(Some(v))
}

pub fn detect_package_manager(dir: &Path) -> String {
    pm::detect_package_manager(Some(&s(dir)))
}

pub fn doc_package_manager(dir: &Path) -> String {
    pm::doc_package_manager(Some(&s(dir)))
}

pub fn cli_bin_resolves(dir: &Path) -> bool {
    pm::cli_bin_resolves(Some(&s(dir)))
}

/// `getCliInvocation(target, {installed, release})`.
pub fn cli_invocation_with(target: &Path, installed: bool, release: Option<(String, bool)>) -> String {
    pm::get_cli_invocation_with(Some(&s(target)), &pm::InvocationOptions { installed, release })
}

/// `getCliInvocation(cwd)`.
pub fn cli_invocation(cwd: &Path) -> String {
    pm::get_cli_invocation(Some(&s(cwd)))
}

/// `answeredBy(cwd)`.
pub fn answered_by(cwd: &Path) -> crate::json::Value {
    rel::answered_by(&s(cwd))
}

/// The line `startRun` prints on stderr before the command, if any.
pub fn start_notice(cwd: &Path, argv: &[String]) -> Option<String> {
    if argv.iter().any(|a| a == "--json") {
        return None;
    }
    let computer = rel::is_computer_level(argv);
    let choice = rel::choose_release(&s(cwd), computer);
    if choice.unavailable.is_some() {
        return None;
    }
    if choice.copy != "matched" && choice.copy != "carried" {
        return None;
    }
    let core = choice.core_version.clone().unwrap_or_else(|| choice.version.clone());
    Some(if computer {
        format!("astryx: answered by CLI {} with Core {core}, for this computer", choice.version)
    } else if choice.copy == "matched" {
        format!("astryx: answered by CLI {} with Core {core}, the release that matches this project's Core", choice.version)
    } else {
        format!("astryx: answered by CLI {} with Core {core}, outside a project", choice.version)
    })
}

/// `(core version the run reads, copy)`, from `answeredBy`.
pub fn core_and_copy(cwd: &Path) -> (Option<String>, String) {
    let a = answered_by(cwd);
    (a.get("core").and_then(|v| v.as_str()).map(String::from), a.get("copy").and_then(|v| v.as_str()).unwrap_or("").to_string())
}
