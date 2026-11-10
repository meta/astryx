//! Loading user-authored JavaScript and TypeScript modules (`.doc.mjs`,
//! `.doc.ts`, `astryx.config.*`, integration manifests, templates' docs) the
//! way the JS CLI loads them (native import for `.mjs`/`.js`, jiti for `.ts`),
//! inside the Rust binary.
//!
//! Owner: the `jsengine` lane. Engine: Boa (a JavaScript engine written in
//! Rust), with oxc to strip TypeScript and JSX. Every other module calls only
//! this interface.
//!
//! One engine lives per thread. Modules stay cached in it for the life of the
//! thread, as Node keeps them for the life of the process; `fresh` rereads
//! the root file only.

mod builtins;
mod call;
mod convert;
mod engine;
pub mod live;
pub mod jsmath;
pub mod jsonparse;
mod prune;
pub mod syntax;
pub mod resolve;
mod transform;
pub mod vfs;

use crate::json::Value;
use std::path::{Path, PathBuf};

pub use call::{call_export, CallError, CallOptions, CallResult};
pub use convert::to_json_data;

/// How a load failed, with the message the JS CLI would have seen.
#[derive(Debug, Clone)]
pub struct JsError {
    /// The thrown error's `name`, e.g. "SyntaxError", "TypeError", "Error".
    /// For a thrown non-object, empty.
    pub name: String,
    /// The thrown error's `message`, or `String(value)` for a non-Error.
    pub message: String,
    /// The thrown error's `code` (e.g. "ERR_MODULE_NOT_FOUND"), if any.
    pub code: Option<String>,
    /// The module whose load failed (the root of the import).
    pub file: PathBuf,
}

impl JsError {
    /// `String(err)` as Node prints it: `name: message` (or `message` alone
    /// when the name is empty).
    pub fn to_js_string(&self) -> String {
        if self.name.is_empty() {
            self.message.clone()
        } else if self.message.is_empty() {
            self.name.clone()
        } else {
            format!("{}: {}", self.name, self.message)
        }
    }
}

/// Options that mirror the JS loaders' flags.
#[derive(Debug, Clone, Default)]
pub struct ImportOptions {
    /// Allow JSX in `.ts`/`.tsx` (template discovery's jiti).
    pub jsx: bool,
    /// Bypass the module cache (jiti `moduleCache: false`, fresh reads).
    pub fresh: bool,
}

/// jiti options some loaders pass (theme build). The default changes
/// nothing.
#[derive(Debug, Clone, Default)]
pub struct JitiOptions {
    /// Load the file through jiti whatever its extension (jiti resolution
    /// and error wording for its whole graph).
    pub force: bool,
    /// Specifier -> file, applied before any other resolution in the graph
    /// (jiti `virtualModules` pointing at real files).
    pub aliases: Vec<(String, PathBuf)>,
    /// jiti's `extensions` probe order, with dots (e.g. `".ts"`).
    pub extensions: Option<Vec<String>>,
    /// jiti `jsx: {runtime: 'automatic'}`: JSX in any file, compiled to
    /// `react/jsx-runtime` calls.
    pub jsx_automatic: bool,
    /// Specifier -> virtual module id (from `Engine::register_virtual`),
    /// for the whole graph (jiti `virtualModules` with live values).
    pub virtual_modules: Vec<(String, u64)>,
    /// jiti's synchronous path (`jiti(file)`), which the JS CLI takes
    /// whenever it passes virtual modules (so non-empty `virtual_modules`
    /// implies it): package `exports` resolve with the require conditions
    /// first, and a file with an extension jiti does not know loads through
    /// Node's `require`, as JavaScript.
    pub sync: bool,
    /// File -> source text the graph uses in place of the file's (still
    /// transformed as that file would be, its imports resolved from the
    /// file's own place, and recorded under its path).
    pub source_overrides: Vec<(PathBuf, String)>,
}

/// A loaded module's namespace: every export, converted to JSON values with
/// JS key order. Functions and other non-data values convert to marker
/// objects with a `__js` key (`{"__js": "function", "name": ...}`,
/// `{"__js": "undefined"}`, ...; the full table is in `convert.rs`), so
/// callers can tell them apart. [`to_json_data`] applies `JSON.stringify`
/// semantics to a converted value.
pub type Namespace = crate::json::Map<String, Value>;

/// Import a module and return its namespace.
///
/// `.ts` (and `.tsx`/`.mts`/`.cts`) load as jiti loads them; anything else
/// loads as Node's native `import` does.
pub fn import_module(path: &Path, opts: &ImportOptions) -> Result<Namespace, JsError> {
    engine::with_engine(|e| e.import(path, opts))
}

/// [`import_module`] with jiti's options.
pub fn import_module_jiti(path: &Path, opts: &ImportOptions, jiti: &JitiOptions) -> Result<Namespace, JsError> {
    engine::with_engine(|e| e.import_with(path, opts, jiti))
}

/// Start (`true`) or stop (`false`) collecting what modules write to stdout
/// and stderr, returning what was collected so far. While off (the default),
/// module output goes straight to stderr, as the JS CLI sends a loading
/// module's stdout to stderr.
pub fn capture_output(on: bool) -> Vec<u8> {
    engine::set_capture(on)
}

/// Compatibility for callers written against the first loader: module output
/// now goes straight to stderr unless `capture_output(true)` is on, so there
/// is nothing left to take.
pub fn take_output() -> Vec<u8> {
    Vec::new()
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod profile_tests;

/// Start (`true`) or stop (`false`) capturing console calls as
/// `(level, text)` pairs (`log`, `info`, `debug`, `warn`, `error`, `trace`;
/// text as `util.format` makes it), returning what was captured so far.
/// While off (the default), console text goes to stderr.
pub fn capture_console(on: bool) -> Vec<(String, String)> {
    engine::set_console_capture(on)
}

/// Start (`true`) or stop (`false`) recording each module file the engine
/// loads (ES, CommonJS, JSON), in load order; returns the list so far.
/// Builtins and modules already cached are not listed.
pub fn record_loads(on: bool) -> Vec<PathBuf> {
    engine::set_load_recording(on)
}

/// The file the last syntax error came from (a load names only its root).
pub fn last_syntax_error_file() -> Option<PathBuf> {
    engine::LAST_SYNTAX_FILE.with(|f| f.borrow().clone())
}

/// When `err` is a module-not-found error from resolution, the specifier as
/// the importing module wrote it.
pub fn missing_specifier(err: &JsError) -> Option<String> {
    engine::missing_specifier(&err.message)
}

/// A replacement for one `Math` function: takes the call's arguments, each
/// converted with `ToNumber`, and returns the result.
pub type MathFn = fn(&[f64]) -> f64;

/// Replace `Math.<name>` in this thread's engine (now, and in an engine
/// started later). Node computes some `Math` functions differently from
/// Rust's libm in the last bits; a bit-exact port goes in through here.
pub fn override_math(name: &'static str, f: MathFn) {
    engine::override_math(name, f)
}
