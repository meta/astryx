//! `astryx template`: list, show, skeleton, copy, and the CDN starter.
//! Mirrors clients/cli/commands/template.mjs and api/template/.

pub mod cdn;
pub mod cmd;
pub mod demo_content;
pub mod discovery;
pub mod fsutil;
pub mod integration;
pub mod needs;
pub mod skeleton;
pub mod source;

use crate::cli::command::Suggestion;

/// An `AstryxError` as the API layer throws it: message, suggestions, code.
#[derive(Debug, Clone)]
pub struct ApiError {
    pub message: String,
    pub suggestions: Vec<Suggestion>,
    pub code: String,
}

impl ApiError {
    pub fn new(message: &str, code: &str) -> Self {
        ApiError { message: message.into(), suggestions: Vec::new(), code: code.into() }
    }
    pub fn with(message: &str, suggestions: Vec<Suggestion>, code: &str) -> Self {
        ApiError { message: message.into(), suggestions, code: code.into() }
    }
    /// A path-safety failure always reaches the caller as `ERR_PATH_TRAVERSAL`.
    pub fn from_path(e: fsutil::PathSafetyError) -> Self {
        ApiError::new(&e.message, "ERR_PATH_TRAVERSAL")
    }
}

/// A Node `fs` error message: `EACCES: permission denied, open '/x'`.
pub fn node_err(e: &std::io::Error, syscall: &str, path: &str) -> String {
    let (code, desc) = match e.raw_os_error() {
        Some(1) => ("EPERM", "operation not permitted"),
        Some(2) => ("ENOENT", "no such file or directory"),
        Some(13) => ("EACCES", "permission denied"),
        Some(17) => ("EEXIST", "file already exists"),
        Some(20) => ("ENOTDIR", "not a directory"),
        Some(21) => ("EISDIR", "illegal operation on a directory"),
        Some(30) => ("EROFS", "read-only file system"),
        Some(28) => ("ENOSPC", "no space left on device"),
        _ => ("EIO", "i/o error"),
    };
    format!("{code}: {desc}, {syscall} '{path}'")
}
