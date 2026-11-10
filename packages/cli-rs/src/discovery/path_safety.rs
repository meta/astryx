//! Port of `foundation/fs/path-safety.mjs`.

use super::nodepath as np;

/// `PathSafetyError` (`name: 'PathSafetyError'`, `code`).
#[derive(Debug, Clone, PartialEq)]
pub struct PathSafetyError {
    pub message: String,
    /// `PATH_INVALID`, `PATH_ABSOLUTE`, `ERR_PATH_TRAVERSAL`, `NAME_INVALID`,
    /// `NAME_HAS_SEPARATOR`, `NAME_TRAVERSAL`, `NAME_BAD_CHARS`.
    pub code: &'static str,
}

impl std::fmt::Display for PathSafetyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

fn err(message: String, code: &'static str) -> PathSafetyError {
    PathSafetyError { message, code }
}

/// `assertWithin(targetPath, rootDir, {allowAbsolute, label})`.
pub fn assert_within(target: &str, root: &str, allow_absolute: bool, label: &str) -> Result<String, PathSafetyError> {
    if target.is_empty() {
        return Err(err(format!("Invalid {label}: must be a non-empty string"), "PATH_INVALID"));
    }
    if target.contains('\0') {
        return Err(err(format!("Invalid {label}: contains a NUL byte"), "PATH_INVALID"));
    }
    if np::is_absolute(target) && !allow_absolute {
        return Err(err(
            format!("Invalid {label} \"{target}\": absolute paths are not allowed. Use a path relative to the project root."),
            "PATH_ABSOLUTE",
        ));
    }
    let abs_root = np::resolve1(root);
    let resolved = np::resolve(&[&abs_root, target]);
    let with_sep = if abs_root.ends_with('/') { abs_root.clone() } else { format!("{abs_root}/") };
    if resolved != abs_root && !resolved.starts_with(&with_sep) {
        return Err(err(
            format!("Invalid {label} \"{target}\": resolves outside the project root ({abs_root}). Path traversal is not allowed."),
            "ERR_PATH_TRAVERSAL",
        ));
    }
    if let (Some(rr), Some(rt)) = (canonical_path(&abs_root, 0), canonical_path(&resolved, 0)) {
        let rs = if rr.ends_with('/') { rr.clone() } else { format!("{rr}/") };
        if rt != rr && !rt.starts_with(&rs) {
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

/// Every symlink resolved, dangling ones included; None where the JS throws
/// (a loop, an unreadable entry), which falls back to the lexical result.
pub fn canonical_path(target: &str, hops: usize) -> Option<String> {
    if hops > 40 {
        return None;
    }
    let stat = match std::fs::symlink_metadata(target) {
        Err(e) => {
            if e.kind() != std::io::ErrorKind::NotFound && e.raw_os_error() != Some(20) {
                return None;
            }
            let parent = np::dirname(target);
            if parent == target {
                return Some(target.to_string());
            }
            return Some(np::join2(&canonical_path(&parent, hops)?, &np::basename(target)));
        }
        Ok(m) => m,
    };
    if let Some(r) = np::realpath(target) {
        return Some(r);
    }
    if !stat.file_type().is_symlink() {
        return None;
    }
    let link = std::fs::read_link(target).ok()?.to_string_lossy().into_owned();
    let dir = np::realpath(&np::dirname(target))?;
    canonical_path(&np::resolve(&[&dir, &link]), hops + 1)
}

/// `sanitizeName(name, {label})`.
pub fn sanitize_name(name: &str, label: &str) -> Result<String, PathSafetyError> {
    if name.is_empty() {
        return Err(err(format!("Invalid {label}: must be a non-empty string"), "NAME_INVALID"));
    }
    if name.contains('\0') {
        return Err(err(format!("Invalid {label}: contains a NUL byte"), "NAME_INVALID"));
    }
    if name.contains('/') || name.contains('\\') {
        return Err(err(
            format!("Invalid {label} \"{name}\": must not contain path separators ('/' or '\\\\')."),
            "NAME_HAS_SEPARATOR",
        ));
    }
    if name.starts_with('.') {
        return Err(err(format!("Invalid {label} \"{name}\": must not start with '.'."), "NAME_TRAVERSAL"));
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')) {
        return Err(err(
            format!("Invalid {label} \"{name}\": only letters, digits, '.', '_', and '-' are allowed."),
            "NAME_BAD_CHARS",
        ));
    }
    Ok(name.to_string())
}

/// `isFilePathArg(pathArg)`.
pub fn is_file_path_arg(p: &str) -> bool {
    if p.is_empty() || p.ends_with('/') || p.ends_with('\\') {
        return false;
    }
    let ext = np::extname(&np::basename(p)).to_lowercase();
    [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".css", ".scss", ".json", ".md", ".html"].contains(&ext.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_and_paths() {
        assert!(sanitize_name("../x", "name").is_err());
        assert_eq!(sanitize_name(".x", "name").unwrap_err().code, "NAME_TRAVERSAL");
        assert!(is_file_path_arg("src/a.tsx"));
        assert!(!is_file_path_arg("src/a/"));
        assert_eq!(assert_within("../x", "/tmp/a", false, "path").unwrap_err().code, "ERR_PATH_TRAVERSAL");
        assert_eq!(assert_within("b/c", "/tmp/a", false, "path").unwrap(), "/tmp/a/b/c");
    }
}
