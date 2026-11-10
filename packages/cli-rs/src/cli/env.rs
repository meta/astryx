//! What the run reads from its surroundings: the CLI root and version, the
//! run prefix and `answeredBy` (ported in `crate::discovery`).

use crate::json::Value;
use std::path::{Path, PathBuf};

/// The CLI package root (`packages/cli`).
pub fn cli_root() -> PathBuf {
    PathBuf::from(crate::discovery::paths::cli_root())
}

/// The CLI version (`packages/cli/package.json` `version`).
pub fn cli_version() -> String {
    crate::discovery::release::cli_version()
}

/// `getCliInvocation(cwd)`: how to run the CLI here.
pub fn cli_invocation(cwd: &Path) -> String {
    crate::cli::release::cli_invocation(cwd)
}

/// `formatCliCommand(cmd)` for a run in `cwd`.
pub fn format_cli_command_at(cwd: &Path, cmd: &str) -> String {
    let inv = cli_invocation(cwd);
    if cmd.is_empty() {
        inv
    } else {
        format!("{inv} {cmd}")
    }
}

/// `formatCliCommand(cmd)` in the current folder.
pub fn format_cli_command(cmd: &str) -> String {
    crate::discovery::package_manager::format_cli_command(cmd, None)
}

/// `answeredBy(cwd)`: `{cli, core, copy}`.
pub fn answered_by(cwd: &Path) -> Value {
    crate::cli::release::answered_by(cwd)
}
