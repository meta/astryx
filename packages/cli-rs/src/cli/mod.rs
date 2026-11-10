//! The command-line shell: argument parsing that behaves like Commander 12 as
//! the JavaScript CLI configures it (help text, parse errors, exit codes, the
//! `--json` error envelope), then dispatch to `crate::commands`.
//!
//! Owner: the `shell` lane.

pub mod builtin;
pub mod collate;
pub mod command;
pub mod env;
pub mod error_codes;
pub mod format;
pub mod nudge;
pub mod parse;
pub mod program;
pub mod release;


/// Exit code the clone uses for a command it does not implement yet. The JS
/// CLI never uses it, so the suite can never mistake it for a match.
pub const NOT_CLONED: i32 = 70;

/// Run once: parse, dispatch, write the streams, return the exit code.
pub fn run(args: Vec<String>) -> i32 {
    let cwd = std::env::current_dir().unwrap_or_default();
    let (mut out, code) = parse::run_live(args, cwd, true);
    out.sync();
    code
}

/// Run once and return the output instead of writing it.
pub fn run_captured(args: Vec<String>) -> (command::Out, i32) {
    let cwd = std::env::current_dir().unwrap_or_default();
    parse::run(args, cwd)
}
