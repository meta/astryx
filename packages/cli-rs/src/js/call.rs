//! Calling a function a user module exports: discover sources, gap-report
//! handlers, theme helpers. Arguments go in as JSON; the result (awaited when
//! it is a promise) comes back as JSON with the marker rules of `convert.rs`.

use super::engine::{self, with_engine};
use super::{ImportOptions, JitiOptions, JsError};
use crate::json::Value;
use std::path::Path;

/// Options for [`call_export`].
#[derive(Debug, Clone, Default)]
pub struct CallOptions {
    /// How to import the module.
    pub import: ImportOptions,
    /// jiti options for the module's whole graph.
    pub jiti: JitiOptions,
    /// Give up when the call has not settled after this long (wall clock,
    /// counted while the engine waits on timers).
    pub timeout_ms: Option<u64>,
    /// Collect what the module writes to stdout/stderr (console, process
    /// streams) into the result instead of writing it to stderr.
    pub capture_output: bool,
}

/// A settled call.
#[derive(Debug, Clone)]
pub struct CallResult {
    pub value: Value,
    /// Captured output (empty unless `capture_output`).
    pub output: Vec<u8>,
    /// `process.exitCode` when the code set it.
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone)]
pub enum CallError {
    /// The module failed to load.
    Load(JsError),
    /// The export path does not name a function. The string is the path
    /// joined with dots.
    NotAFunction(String),
    /// The function threw, or its promise rejected.
    Thrown { error: JsError, output: Vec<u8>, exit_code: Option<i32> },
    /// The code called `process.exit(code)`.
    Exit { code: i32, output: Vec<u8> },
    /// The deadline passed first.
    Timeout { output: Vec<u8> },
    /// The promise never settled and nothing was left to wait on.
    Unsettled { output: Vec<u8> },
}

/// Import `path`, walk `export` from its namespace (`["default", "gapReport",
/// "handle"]`), and call the function there with `args`, `this` being the
/// object that holds it. A promise result is awaited.
///
/// Arguments are plain JSON, plus markers: `{"__js": "undefined"}` and
/// `{"__js": "abort_signal"}` (a fresh, never-aborted `AbortSignal`).
pub fn call_export(
    path: &Path,
    export: &[&str],
    args: &[Value],
    opts: &CallOptions,
) -> Result<CallResult, CallError> {
    let prev = opts.capture_output.then(|| engine::set_capture(true));
    let result = with_engine(|e| e.call_export(path, export, args, opts));
    if let Some(prev) = prev {
        let out = engine::set_capture(false);
        let _ = prev;
        return match result {
            Ok(mut r) => {
                r.output = out;
                Ok(r)
            }
            Err(CallError::Thrown { error, exit_code, .. }) => {
                Err(CallError::Thrown { error, output: out, exit_code })
            }
            Err(CallError::Exit { code, .. }) => Err(CallError::Exit { code, output: out }),
            Err(CallError::Timeout { .. }) => Err(CallError::Timeout { output: out }),
            Err(CallError::Unsettled { .. }) => Err(CallError::Unsettled { output: out }),
            Err(other) => Err(other),
        };
    }
    result
}
