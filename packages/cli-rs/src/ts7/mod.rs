//! A client for the TypeScript 7 compiler's API (`tsgo --api`), in Rust.
//!
//! The CLI runs its TypeScript checks on its own pinned TypeScript 7 copy (the
//! `typescript-native` package alias) through this client. Only the compiler
//! process is spawned; no JS runtime is involved.

pub mod channel;
pub mod client;
pub mod session;
pub mod syntax;
pub mod syntax_tables;

pub use channel::{Callback, ChannelError};
pub use client::{Client, Scope, Signature, Symbol, Type};

use crate::discovery::nodepath;

/// The package alias of the CLI's pinned TypeScript 7.
pub const NATIVE_PACKAGE: &str = "typescript-native";

/// `process.platform`.
fn node_platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
}

/// `process.arch`.
fn node_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        "x86" => "ia32",
        "arm" => "arm",
        other => other,
    }
}

/// The package directory `require.resolve(name + "/package.json")` finds from
/// `dir`, walking up `node_modules` folders.
pub(crate) fn resolve_package_dir(dir: &str, name: &str) -> Option<String> {
    let mut d = nodepath::resolve1(dir);
    loop {
        if !d.ends_with("/node_modules") {
            let candidate = nodepath::join(&[&d, "node_modules", name]);
            let pj = nodepath::join2(&candidate, "package.json");
            if nodepath::exists(&pj) {
                // Node resolves through symlinks (pnpm's store layout).
                return Some(std::fs::canonicalize(&candidate).map(|p| p.to_string_lossy().into_owned()).unwrap_or(candidate));
            }
        }
        let parent = nodepath::dirname(&d);
        if parent == d {
            return None;
        }
        d = parent;
    }
}

/// The compiler executable of the TypeScript package at `pkg_dir`, found the
/// way its `lib/getExePath.js` finds it from an installed package.
pub fn exe_of_package(pkg_dir: &str) -> Result<String, String> {
    let pj = nodepath::read_json(&nodepath::join2(pkg_dir, "package.json")).ok_or_else(|| format!("No package.json in {pkg_dir}"))?;
    let pkg_name = pj.get("name").and_then(|n| n.as_str()).unwrap_or("");
    let base_name = if pkg_name.starts_with('@') { pkg_name.split('/').nth(1).unwrap_or("") } else { pkg_name };
    let expected_bin = if base_name == "typescript" { "tsc" } else { "tsgo" };
    let bins: Vec<&String> = pj.get("bin").and_then(|b| b.as_object()).map(|o| o.keys().collect()).unwrap_or_default();
    if bins.len() != 1 || bins[0] != expected_bin {
        return Err(format!("Expected {pkg_name} to declare exactly one bin entry named {expected_bin}."));
    }
    let expected_package = format!("{base_name}-{}-{}", node_platform(), node_arch());
    let platform_package = format!("@typescript/{expected_package}");
    let platform_dir = resolve_package_dir(pkg_dir, &platform_package).ok_or_else(|| {
        format!("Unable to resolve {platform_package}. Either your platform is unsupported, or you are missing the package on disk.")
    })?;
    let mut exe = nodepath::join(&[&platform_dir, "lib", expected_bin]);
    if cfg!(windows) {
        exe.push_str(".exe");
    }
    if !nodepath::exists(&exe) {
        return Err(format!("Executable not found: {exe}"));
    }
    Ok(exe)
}

/// The CLI's own TypeScript 7 compiler, from its `typescript-native` package.
pub fn find_exe(cli_root: &str) -> Result<String, String> {
    let pkg = resolve_package_dir(cli_root, NATIVE_PACKAGE).ok_or_else(|| format!("Unable to resolve {NATIVE_PACKAGE}."))?;
    exe_of_package(&pkg)
}

/// File system callback answers, encoded as the Node client encodes them.
pub mod fs_reply {
    /// `readFile`: `Some(Some(text))` is content, `Some(None)` is "not
    /// found", `None` falls back to the real file system.
    pub fn read_file(result: Option<Option<&str>>) -> String {
        match result {
            None => String::new(),
            Some(content) => serde_json::to_string(&serde_json::json!({ "content": content })).unwrap_or_default(),
        }
    }
    /// A boolean callback (`fileExists`, `directoryExists`); `None` falls back.
    pub fn boolean(result: Option<bool>) -> String {
        match result {
            None => String::new(),
            Some(b) => b.to_string(),
        }
    }
    /// The callback's argument (a JSON string: the path).
    pub fn arg(raw: &str) -> String {
        serde_json::from_str::<String>(raw).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests;
