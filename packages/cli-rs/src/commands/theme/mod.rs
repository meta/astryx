//! `astryx theme` subcommands other than `build` and `palette`:
//! `add`, `eject`, `list`, `remove`, `targets`, `template`, `use`.
//! Mirrors clients/cli/commands/theme.mjs and api/theme/.

pub mod app;
pub mod descriptor;
pub mod discovery;
pub mod graph;
pub mod imports;
pub mod recorded;
pub mod state;
pub mod targets;
pub mod template;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out};
use crate::commands::template::ApiError;

/// Print an API error through `cliError`, as every theme action's catch does.
pub(crate) fn fail(out: &mut Out, e: ApiError) -> CmdResult {
    let opts = if e.code.is_empty() { ErrorOpts::default() } else { ErrorOpts::code(&e.code) };
    out.cli_error(&e.message, opts.suggestions(e.suggestions))
}

/// `warnOnThemeIntegrationIssues(json)`.
pub(crate) fn warn_theme_integration_issues(inv: &Invocation, out: &mut Out) {
    crate::commands::template::integration::warn_on_integration_issues(inv, out);
}

pub fn template_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    template::run(inv, out)
}
pub fn add(inv: &Invocation, out: &mut Out) -> CmdResult {
    app::add_cmd(inv, out)
}
pub fn eject(inv: &Invocation, out: &mut Out) -> CmdResult {
    app::eject_cmd(inv, out)
}
pub fn list(inv: &Invocation, out: &mut Out) -> CmdResult {
    app::list_cmd(inv, out)
}
pub fn remove(inv: &Invocation, out: &mut Out) -> CmdResult {
    app::remove_cmd(inv, out)
}
pub fn targets_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    targets::run(inv, out)
}
pub fn use_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    app::use_cmd(inv, out)
}
