//! The interface every command implements.
//!
//! The shell parses the arguments exactly as Commander does (from the
//! command's CommandDoc), runs the `--json` gate, then calls the command's
//! handler with an [`Invocation`] (what was parsed) and an [`Out`] (where the
//! command writes). A handler returns `Ok(())` when it finishes normally, or
//! `Err(Exit(code))` to stop at once, as `process.exit(code)` does in the JS
//! CLI. Exit codes without an early stop go through `out.exit_code`, as
//! `process.exitCode` does.
//!
//! Register a handler with one line in `src/commands/mod.rs`, keyed by the
//! full command name (`"blog"`, `"theme build"`).

use crate::json::{self, Map, Value};
use indexmap::IndexMap;
use std::path::PathBuf;

/// Stop the run now with this exit code (`process.exit(code)`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Exit(pub i32);

/// What a handler returns.
pub type CmdResult = Result<(), Exit>;

/// A command handler.
pub type Handler = fn(&Invocation, &mut Out) -> CmdResult;

/// One positional argument, as Commander passes it to the action.
#[derive(Debug, Clone, PartialEq)]
pub enum Arg {
    /// An optional argument the user left out (`undefined`).
    Missing,
    One(String),
    /// A variadic argument (`<names...>` / `[names...]`); empty when an
    /// optional variadic is left out (Commander passes `[]`).
    Many(Vec<String>),
}

/// One option value, as Commander stores it in `opts()`.
#[derive(Debug, Clone, PartialEq)]
pub enum OptValue {
    Bool(bool),
    Str(String),
    /// A variadic option (`--names <n...>`).
    List(Vec<String>),
}

impl OptValue {
    /// The value as JSON, as `JSON.stringify(cmd.opts())` would show it.
    pub fn to_json(&self) -> Value {
        match self {
            OptValue::Bool(b) => Value::Bool(*b),
            OptValue::Str(s) => Value::String(s.clone()),
            OptValue::List(v) => Value::Array(v.iter().cloned().map(Value::String).collect()),
        }
    }
}

/// The root (global) options. Every command can read them, as
/// `program.opts()` in the JS CLI.
#[derive(Debug, Clone, PartialEq)]
pub struct Globals {
    pub json: bool,
    pub dense: bool,
    pub zh: bool,
    /// `--lang <locale>`: `en`, `zh` or `dense` when given.
    pub lang: Option<String>,
    /// `--detail <level>`: defaults to `full`.
    pub detail: String,
}

impl Default for Globals {
    fn default() -> Self {
        Globals { json: false, dense: false, zh: false, lang: None, detail: "full".into() }
    }
}

/// Where an option's value came from (`cmd.getOptionValueSource`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OptSource {
    Default,
    Cli,
}

/// What the shell parsed for one run of one command.
#[derive(Debug, Clone)]
pub struct Invocation {
    /// The full command name: `"blog"`, `"theme build"`.
    pub name: String,
    /// Positional arguments in declared order (one entry per declared
    /// argument, `Arg::Missing` for an optional one left out).
    pub args: Vec<Arg>,
    /// Extra operands beyond the declared ones (Commander's `cmd.args` tail;
    /// it allows excess arguments).
    pub extra_args: Vec<String>,
    /// The command's own options, keyed by Commander's attribute name
    /// (camelCase: `--dry-run` -> `dryRun`, `--no-color` -> `color`), in the
    /// order Commander lists them in `opts()`. Options with no value and no
    /// default are absent, as in Commander.
    pub opts: IndexMap<String, OptValue>,
    pub opt_sources: IndexMap<String, OptSource>,
    /// Each ancestor group's own options (`parent.opts()`), root first,
    /// keyed by the ancestor's full name (`""` is the root).
    pub parent_opts: Vec<(String, IndexMap<String, OptValue>)>,
    /// Every operand and unknown argument Commander left in `cmd.args`.
    pub all_args: Vec<String>,
    pub globals: Globals,
    /// The working folder of the run.
    pub cwd: PathBuf,
    /// The CLI package root (`packages/cli`): where `assets/` lives.
    pub cli_root: PathBuf,
    /// The arguments after `astryx`, unparsed.
    pub argv: Vec<String>,
}

impl Invocation {
    /// Positional argument `i` when it is a single given value.
    pub fn arg(&self, i: usize) -> Option<&str> {
        match self.args.get(i) {
            Some(Arg::One(s)) => Some(s.as_str()),
            _ => None,
        }
    }

    /// Positional argument `i` as a list (variadic); empty when missing.
    pub fn arg_list(&self, i: usize) -> Vec<String> {
        match self.args.get(i) {
            Some(Arg::Many(v)) => v.clone(),
            Some(Arg::One(s)) => vec![s.clone()],
            _ => Vec::new(),
        }
    }

    pub fn opt(&self, key: &str) -> Option<&OptValue> {
        self.opts.get(key)
    }

    /// True when the option is set to `true` (a boolean flag, or an
    /// optional-value option given with no value).
    pub fn flag(&self, key: &str) -> bool {
        matches!(self.opts.get(key), Some(OptValue::Bool(true)))
    }

    /// The option's string value, if it has one.
    pub fn opt_str(&self, key: &str) -> Option<&str> {
        match self.opts.get(key) {
            Some(OptValue::Str(s)) => Some(s.as_str()),
            _ => None,
        }
    }

    /// The option's list value (variadic); a single string becomes one item.
    pub fn opt_list(&self, key: &str) -> Option<Vec<String>> {
        match self.opts.get(key) {
            Some(OptValue::List(v)) => Some(v.clone()),
            Some(OptValue::Str(s)) => Some(vec![s.clone()]),
            _ => None,
        }
    }

    /// `cmd.opts()` as a JSON object.
    pub fn opts_json(&self) -> Value {
        let mut m = Map::new();
        for (k, v) in &self.opts {
            m.insert(k.clone(), v.to_json());
        }
        Value::Object(m)
    }

    /// An ancestor group's option (`doctorCmd.opts().built`).
    pub fn parent_opt(&self, group: &str, key: &str) -> Option<&OptValue> {
        self.parent_opts.iter().find(|(n, _)| n == group).and_then(|(_, m)| m.get(key))
    }

    pub fn json(&self) -> bool {
        self.globals.json
    }

    /// A minimal invocation for unit tests.
    pub fn for_test(name: &str) -> Invocation {
        Invocation {
            name: name.to_string(),
            args: Vec::new(),
            extra_args: Vec::new(),
            opts: IndexMap::new(),
            opt_sources: IndexMap::new(),
            parent_opts: Vec::new(),
            all_args: Vec::new(),
            globals: Globals::default(),
            cwd: std::env::current_dir().unwrap_or_default(),
            cli_root: crate::cli::env::cli_root(),
            argv: Vec::new(),
        }
    }
}

/// One suggestion in an error (`{name, reason?}`).
#[derive(Debug, Clone, PartialEq)]
pub struct Suggestion {
    pub name: String,
    pub reason: Option<String>,
}

impl Suggestion {
    pub fn new(name: impl Into<String>, reason: impl Into<String>) -> Self {
        Suggestion { name: name.into(), reason: Some(reason.into()) }
    }
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("name".into(), Value::String(self.name.clone()));
        if let Some(r) = &self.reason {
            m.insert("reason".into(), Value::String(r.clone()));
        }
        Value::Object(m)
    }
}

/// Options for [`Out::cli_error`] (`cliError(message, options)`).
#[derive(Debug, Clone)]
pub struct ErrorOpts {
    pub code: String,
    pub suggestions: Vec<Suggestion>,
    pub exit_code: i32,
    /// `hard: false` sets the exit code and returns instead of stopping.
    pub hard: bool,
    /// An optional `receipt` object for the JSON envelope.
    pub receipt: Option<Value>,
}

impl Default for ErrorOpts {
    fn default() -> Self {
        ErrorOpts { code: "ERR_UNKNOWN".into(), suggestions: Vec::new(), exit_code: 1, hard: true, receipt: None }
    }
}

impl ErrorOpts {
    pub fn code(code: &str) -> Self {
        ErrorOpts { code: code.into(), ..Default::default() }
    }
    pub fn suggestions(mut self, s: Vec<Suggestion>) -> Self {
        self.suggestions = s;
        self
    }
}

/// A command's output: stdout, stderr and exit code, written by the shell to
/// the real streams when the run ends.
#[derive(Debug, Default)]
pub struct Out {
    pub stdout: String,
    pub stderr: String,
    /// `process.exitCode`.
    pub exit_code: i32,
    /// JSON mode: set by the shell before the handler runs when `--json` is
    /// given. `log`/`warn` print nothing in JSON mode (humanLog/humanWarn).
    pub json_mode: bool,
    /// An envelope was printed (`process.__xdsJsonHandled`).
    pub json_handled: bool,
    /// `answeredBy` for `meta`; the shell fills it in (lazily computed when
    /// `None`).
    pub answered_by: Option<Value>,
    pub cwd: PathBuf,
    /// Write each chunk to the real streams as it is produced, so stdout and
    /// stderr interleave as the JS CLI's do (set by the binary).
    pub live: bool,
    flushed_out: usize,
    flushed_err: usize,
}

impl Out {
    /// Write what is not yet on the real streams (live mode only).
    pub fn sync(&mut self) {
        if !self.live {
            return;
        }
        use std::io::Write;
        if self.stdout.len() > self.flushed_out {
            let mut so = std::io::stdout().lock();
            let _ = so.write_all(self.stdout[self.flushed_out..].as_bytes());
            let _ = so.flush();
            self.flushed_out = self.stdout.len();
        }
        if self.stderr.len() > self.flushed_err {
            let mut se = std::io::stderr().lock();
            let _ = se.write_all(self.stderr[self.flushed_err..].as_bytes());
            let _ = se.flush();
            self.flushed_err = self.stderr.len();
        }
    }

    pub fn new(json_mode: bool, cwd: PathBuf) -> Out {
        Out { json_mode, cwd, ..Default::default() }
    }

    /// `console.log(s)`: always prints, with a newline.
    pub fn println(&mut self, s: &str) {
        self.sync();
        self.stdout.push_str(s);
        self.stdout.push('\n');
        self.sync();
    }

    /// `console.error(s)`: always prints, with a newline.
    pub fn eprintln(&mut self, s: &str) {
        self.sync();
        self.stderr.push_str(s);
        self.stderr.push('\n');
        self.sync();
    }

    /// `process.stdout.write(s)`: no newline.
    pub fn write(&mut self, s: &str) {
        self.sync();
        self.stdout.push_str(s);
        self.sync();
    }

    /// `process.stderr.write(s)`: no newline.
    pub fn ewrite(&mut self, s: &str) {
        self.sync();
        self.stderr.push_str(s);
        self.sync();
    }

    /// `humanLog(s)`: stdout unless in JSON mode.
    pub fn log(&mut self, s: &str) {
        if !self.json_mode {
            self.println(s);
        }
    }

    /// `humanWarn(s)`: stderr unless in JSON mode.
    pub fn warn(&mut self, s: &str) {
        if !self.json_mode {
            self.eprintln(s);
        }
    }

    /// `emit(...blocks)`: join non-empty blocks with a blank line, humanLog.
    pub fn emit(&mut self, blocks: &[crate::cli::format::Block]) {
        let body = crate::cli::format::join_blocks(blocks);
        self.log(&body);
    }

    fn answered_by(&mut self) -> Value {
        if self.answered_by.is_none() {
            self.answered_by = Some(crate::cli::env::answered_by(&self.cwd));
        }
        self.answered_by.clone().unwrap()
    }

    /// `jsonOut({type, package?, data, meta?})`: print the success envelope
    /// `{apiVersion, type, package?, data, meta: {...meta, answeredBy}}`.
    pub fn json_out(&mut self, kind: &str, package: Option<Value>, data: Value, meta: Option<Map<String, Value>>) {
        let mut env = Map::new();
        env.insert("apiVersion".into(), Value::from(1));
        env.insert("type".into(), Value::String(kind.into()));
        if let Some(p) = package {
            env.insert("package".into(), p);
        }
        env.insert("data".into(), data);
        let mut m = meta.unwrap_or_default();
        m.shift_remove("answeredBy");
        m.insert("answeredBy".into(), self.answered_by());
        env.insert("meta".into(), Value::Object(m));
        self.json_handled = true;
        let line = json::to_stdout_line(&Value::Object(env));
        self.write(&line);
    }

    /// `jsonOut(response)` for a response already shaped as
    /// `{type, package?, data, meta?}`.
    pub fn json_out_response(&mut self, response: &Value) {
        let kind = response.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let package = response.get("package").cloned();
        let data = response.get("data").cloned().unwrap_or(Value::Null);
        let meta = response.get("meta").and_then(|m| m.as_object()).cloned();
        self.json_out(&kind, package, data, meta);
    }

    /// Print a value as `console.log(JSON.stringify(v, null, 2))`.
    pub fn print_json(&mut self, v: &Value) {
        let line = json::to_stdout_line(v);
        self.write(&line);
    }

    /// `cliError(message, options)`. In JSON mode prints the error envelope
    /// on stdout and stops with exit 1. Otherwise prints `Error: <message>`
    /// and the suggestions on stderr, then stops with `exit_code` (or, when
    /// `hard` is false, sets it and returns `Ok`).
    pub fn cli_error(&mut self, message: &str, opts: ErrorOpts) -> CmdResult {
        if self.json_mode {
            return Err(self.json_error(message, &opts.suggestions, &opts.code, opts.receipt.as_ref()));
        }
        self.eprintln(&format!("Error: {message}"));
        if !opts.suggestions.is_empty() {
            self.eprintln("");
            for s in &opts.suggestions {
                let name = if s.name == "astryx" || s.name.starts_with("astryx ") || s.name.starts_with("astryx\t") {
                    crate::cli::env::format_cli_command_at(&self.cwd, s.name.trim_start_matches("astryx").trim_start())
                } else {
                    s.name.clone()
                };
                match &s.reason {
                    Some(r) if !r.is_empty() => self.eprintln(&format!("  {name}  ({r})")),
                    _ => self.eprintln(&format!("  {name}")),
                }
            }
        }
        if opts.hard {
            Err(Exit(opts.exit_code))
        } else {
            self.exit_code = opts.exit_code;
            Ok(())
        }
    }

    /// `jsonError(message, suggestions, code, receipt)`: print the error
    /// envelope and return the exit to stop with (always 1).
    pub fn json_error(&mut self, message: &str, suggestions: &[Suggestion], code: &str, receipt: Option<&Value>) -> Exit {
        self.json_handled = true;
        let env = error_envelope(message, suggestions, code, receipt);
        self.print_json(&env);
        Exit(1)
    }
}

/// `toErrorEnvelope`: `{apiVersion: 1, error, code, suggestions?, receipt?}`.
/// An unknown code becomes `ERR_UNKNOWN`.
pub fn error_envelope(message: &str, suggestions: &[Suggestion], code: &str, receipt: Option<&Value>) -> Value {
    let mut env = Map::new();
    env.insert("apiVersion".into(), Value::from(1));
    env.insert("error".into(), Value::String(message.into()));
    let code = if crate::cli::error_codes::is_error_code(code) { code } else { "ERR_UNKNOWN" };
    env.insert("code".into(), Value::String(code.into()));
    if !suggestions.is_empty() {
        env.insert("suggestions".into(), Value::Array(suggestions.iter().map(|s| s.to_json()).collect()));
    }
    if let Some(r) = receipt {
        if r.is_object() || r.is_array() {
            env.insert("receipt".into(), r.clone());
        }
    }
    Value::Object(env)
}
