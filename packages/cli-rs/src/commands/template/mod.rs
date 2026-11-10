//! `astryx template`: list, show, skeleton, copy, and the CDN starter.
//! Mirrors clients/cli/commands/template.mjs and api/template/.

pub mod cdn;
pub mod cmd;
pub mod demo_content;
pub mod discovery;
pub mod fsutil;
pub mod icons;
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
        Some(11) => ("EAGAIN", "resource temporarily unavailable"),
        Some(16) => ("EBUSY", "resource busy or locked"),
        Some(18) => ("EXDEV", "cross-device link not permitted"),
        Some(22) => ("EINVAL", "invalid argument"),
        Some(24) => ("EMFILE", "too many open files"),
        Some(27) => ("EFBIG", "file too large"),
        Some(36) => ("ENAMETOOLONG", "name too long"),
        Some(39) => ("ENOTEMPTY", "directory not empty"),
        Some(40) => ("ELOOP", "too many symbolic links encountered"),
        _ => ("EIO", "i/o error"),
    };
    format!("{code}: {desc}, {syscall} '{path}'")
}

/// `fs.mkdirSync(path, {recursive: true})`, with Node's error message
/// (`EEXIST: file already exists, mkdir '<path>'`) and code on failure.
pub fn mkdir_p(path: &str) -> Result<(), (String, String)> {
    let p = std::path::Path::new(path);
    if let Ok(m) = std::fs::metadata(p) {
        if m.is_dir() {
            return Ok(());
        }
        return Err(("EEXIST".into(), format!("EEXIST: file already exists, mkdir '{path}'")));
    }
    let mut anc = fsutil::dirname(path);
    loop {
        match std::fs::metadata(&anc) {
            Ok(m) if m.is_dir() => break,
            Ok(_) => return Err(("ENOTDIR".into(), format!("ENOTDIR: not a directory, mkdir '{path}'"))),
            Err(_) => {
                let up = fsutil::dirname(&anc);
                if up == anc {
                    break;
                }
                anc = up;
            }
        }
    }
    std::fs::create_dir_all(p).map_err(|e| {
        let m = node_err(&e, "mkdir", path);
        (m.split(':').next().unwrap_or("").to_string(), m)
    })
}
