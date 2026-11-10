//! Path helpers that behave like Node's `path` module (POSIX) and the CLI's
//! path-safety guards, used by the template and theme commands.

use std::fs;
use std::path::{Path, PathBuf};

/// `path.normalize` on a POSIX path string, without a trailing slash.
pub fn normalize(p: &str) -> String {
    let abs = p.starts_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if parts.last().map_or(false, |l| *l != "..") {
                    parts.pop();
                } else if !abs {
                    parts.push("..");
                }
            }
            s => parts.push(s),
        }
    }
    let joined = parts.join("/");
    if abs {
        format!("/{joined}")
    } else if joined.is_empty() {
        ".".into()
    } else {
        joined
    }
}

/// `path.resolve(base, p)`.
pub fn resolve(base: &str, p: &str) -> String {
    if p.starts_with('/') {
        normalize(p)
    } else {
        normalize(&format!("{base}/{p}"))
    }
}

/// `path.join(a, b)`.
pub fn join(a: &str, b: &str) -> String {
    if a.is_empty() {
        return normalize(b);
    }
    if b.is_empty() {
        return normalize(a);
    }
    normalize(&format!("{a}/{b}"))
}

/// `path.dirname`.
pub fn dirname(p: &str) -> String {
    let t = p.trim_end_matches('/');
    if t.is_empty() {
        return if p.starts_with('/') { "/".into() } else { ".".into() };
    }
    match t.rfind('/') {
        Some(0) => "/".into(),
        Some(i) => t[..i].trim_end_matches('/').to_string().max_or_root(),
        None => ".".into(),
    }
}

trait RootFix {
    fn max_or_root(self) -> String;
}
impl RootFix for String {
    fn max_or_root(self) -> String {
        if self.is_empty() {
            "/".into()
        } else {
            self
        }
    }
}

/// `path.basename`.
pub fn basename(p: &str) -> String {
    let t = p.trim_end_matches('/');
    match t.rfind('/') {
        Some(i) => t[i + 1..].to_string(),
        None => t.to_string(),
    }
}

/// `path.extname`.
pub fn extname(p: &str) -> String {
    let b = basename(p);
    match b.rfind('.') {
        Some(0) | None => String::new(),
        Some(i) => b[i..].to_string(),
    }
}

/// `path.relative(from, to)` for absolute paths.
pub fn relative(from: &str, to: &str) -> String {
    let f = normalize(from);
    let t = normalize(to);
    if f == t {
        return String::new();
    }
    let fp: Vec<&str> = f.split('/').filter(|s| !s.is_empty()).collect();
    let tp: Vec<&str> = t.split('/').filter(|s| !s.is_empty()).collect();
    let mut i = 0;
    while i < fp.len() && i < tp.len() && fp[i] == tp[i] {
        i += 1;
    }
    let mut out: Vec<&str> = Vec::new();
    for _ in i..fp.len() {
        out.push("..");
    }
    out.extend(&tp[i..]);
    out.join("/")
}

pub fn path_str(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

/// A path-safety failure: message and error code (`PATH_ABSOLUTE`,
/// `ERR_PATH_TRAVERSAL`, ...).
#[derive(Debug, Clone)]
pub struct PathSafetyError {
    pub message: String,
    pub code: String,
}

/// `assertWithin(targetPath, rootDir, {label})`.
pub fn assert_within(target: &str, root: &str, label: &str) -> Result<String, PathSafetyError> {
    let err = |m: String, c: &str| PathSafetyError { message: m, code: c.into() };
    if target.is_empty() {
        return Err(err(format!("Invalid {label}: must be a non-empty string"), "PATH_INVALID"));
    }
    if target.contains('\0') {
        return Err(err(format!("Invalid {label}: contains a NUL byte"), "PATH_INVALID"));
    }
    if target.starts_with('/') {
        return Err(err(
            format!("Invalid {label} \"{target}\": absolute paths are not allowed. Use a path relative to the project root."),
            "PATH_ABSOLUTE",
        ));
    }
    let abs_root = normalize(root);
    let resolved = resolve(&abs_root, target);
    let with_sep = if abs_root.ends_with('/') { abs_root.clone() } else { format!("{abs_root}/") };
    if resolved != abs_root && !resolved.starts_with(&with_sep) {
        return Err(err(
            format!(
                "Invalid {label} \"{target}\": resolves outside the project root ({abs_root}). Path traversal is not allowed."
            ),
            "ERR_PATH_TRAVERSAL",
        ));
    }
    if let (Some(real_root), Some(real_target)) = (canonical(&abs_root, 0), canonical(&resolved, 0)) {
        let rs = if real_root.ends_with('/') { real_root.clone() } else { format!("{real_root}/") };
        if real_target != real_root && !real_target.starts_with(&rs) {
            return Err(err(
                format!(
                    "Invalid {label} \"{target}\": resolves outside the project root ({abs_root}) via a symlink. Path traversal is not allowed."
                ),
                "ERR_PATH_TRAVERSAL",
            ));
        }
    }
    Ok(resolved)
}

fn canonical(target: &str, hops: usize) -> Option<String> {
    if hops > 40 {
        return None;
    }
    let meta = match fs::symlink_metadata(target) {
        Ok(m) => m,
        Err(e) => {
            let missing = e.kind() == std::io::ErrorKind::NotFound || e.raw_os_error() == Some(20);
            if !missing {
                return None;
            }
            let parent = dirname(target);
            if parent == target {
                return Some(target.to_string());
            }
            return Some(join(&canonical(&parent, hops)?, &basename(target)));
        }
    };
    if let Ok(r) = fs::canonicalize(target) {
        return Some(path_str(&r));
    }
    if !meta.file_type().is_symlink() {
        return None;
    }
    let link = fs::read_link(target).ok()?;
    let parent = fs::canonicalize(dirname(target)).ok()?;
    canonical(&resolve(&path_str(&parent), &path_str(&link)), hops + 1)
}

const FILE_EXTENSIONS: &[&str] = &[".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".css", ".scss", ".json", ".md", ".html"];

/// `isFilePathArg`.
pub fn is_file_path_arg(p: &str) -> bool {
    if p.is_empty() || p.ends_with('/') || p.ends_with('\\') {
        return false;
    }
    let ext = extname(&basename(p)).to_lowercase();
    !ext.is_empty() && FILE_EXTENSIONS.contains(&ext.as_str())
}

/// `stripCopyrightHeader`.
pub fn strip_copyright_header(source: &str) -> String {
    let s = strip_one(source, "// Copyright (c) Meta Platforms, Inc. and affiliates.", true);
    strip_one(&s, "<!-- Copyright (c) Meta Platforms, Inc. and affiliates. -->", false)
}

fn strip_one(source: &str, header: &str, allow_shebang: bool) -> String {
    let mut prefix_len = 0;
    let rest = source;
    if rest.starts_with('\u{FEFF}') {
        prefix_len += '\u{FEFF}'.len_utf8();
    }
    if allow_shebang && source[prefix_len..].starts_with("#!") {
        let after = &source[prefix_len..];
        if let Some(nl) = after.find('\n') {
            let line = &after[..nl];
            let line_body = line.strip_suffix('\r').unwrap_or(line);
            if !line_body.contains('\r') {
                prefix_len += nl + 1;
            }
        }
    }
    let after = &source[prefix_len..];
    if let Some(r) = after.strip_prefix(header) {
        let r = if let Some(x) = r.strip_prefix("\r\n") {
            x
        } else if let Some(x) = r.strip_prefix('\n') {
            x
        } else {
            return source.to_string();
        };
        let mut r = r;
        loop {
            if let Some(x) = r.strip_prefix("\r\n") {
                r = x;
            } else if let Some(x) = r.strip_prefix('\n') {
                r = x;
            } else {
                break;
            }
        }
        return format!("{}{}", &source[..prefix_len], r);
    }
    source.to_string()
}

/// Make a path buffer from a string.
pub fn pb(s: &str) -> PathBuf {
    PathBuf::from(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths() {
        assert_eq!(relative("/a/b", "/a/b/c/d"), "c/d");
        assert_eq!(relative("/a/b", "/a/x"), "../x");
        assert_eq!(dirname("/a/b/c"), "/a/b");
        assert_eq!(dirname("a"), ".");
        assert_eq!(dirname("/a"), "/");
        assert_eq!(resolve("/r", "../x.ts"), "/x.ts");
        assert!(is_file_path_arg("./foo.tsx"));
        assert!(!is_file_path_arg("./out"));
        assert_eq!(strip_copyright_header("// Copyright (c) Meta Platforms, Inc. and affiliates.\n\nx"), "x");
    }
}
