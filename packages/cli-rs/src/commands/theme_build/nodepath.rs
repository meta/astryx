//! Node's `path` (POSIX) and the CLI's path-safety guard
//! (`foundation/fs/path-safety.mjs` `assertWithin`), as theme build and palette
//! generate use them. Paths are strings, as in Node.

use std::fs;

/// `path.normalize` for POSIX paths.
pub fn normalize(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let abs = p.starts_with('/');
    let trailing = p.ends_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if !parts.is_empty() && *parts.last().unwrap() != ".." {
                    parts.pop();
                } else if !abs {
                    parts.push("..");
                }
            }
            s => parts.push(s),
        }
    }
    let mut out = parts.join("/");
    if out.is_empty() && !abs {
        out = ".".into();
    }
    if trailing && !out.is_empty() {
        out.push('/');
    }
    if abs {
        format!("/{out}")
    } else {
        out
    }
}

/// `path.resolve(...segments)` with `cwd` as the process directory.
pub fn resolve(cwd: &str, segments: &[&str]) -> String {
    let mut acc = String::new();
    for seg in segments.iter().rev() {
        if seg.is_empty() {
            continue;
        }
        acc = if acc.is_empty() { seg.to_string() } else { format!("{seg}/{acc}") };
        if seg.starts_with('/') {
            break;
        }
    }
    if !acc.starts_with('/') {
        acc = if acc.is_empty() { cwd.to_string() } else { format!("{cwd}/{acc}") };
    }
    let n = normalize(&acc);
    if n.len() > 1 && n.ends_with('/') {
        n[..n.len() - 1].to_string()
    } else {
        n
    }
}

/// `path.join(...segments)`.
pub fn join(segments: &[&str]) -> String {
    let joined: Vec<&str> = segments.iter().copied().filter(|s| !s.is_empty()).collect();
    if joined.is_empty() {
        return ".".into();
    }
    normalize(&joined.join("/"))
}

/// `path.relative(from, to)`, both resolved against `cwd`.
pub fn relative(cwd: &str, from: &str, to: &str) -> String {
    let from = resolve(cwd, &[from]);
    let to = resolve(cwd, &[to]);
    if from == to {
        return String::new();
    }
    let f: Vec<&str> = from.split('/').filter(|s| !s.is_empty()).collect();
    let t: Vec<&str> = to.split('/').filter(|s| !s.is_empty()).collect();
    let mut i = 0;
    while i < f.len() && i < t.len() && f[i] == t[i] {
        i += 1;
    }
    let mut out: Vec<String> = Vec::new();
    for _ in i..f.len() {
        out.push("..".into());
    }
    for s in &t[i..] {
        out.push(s.to_string());
    }
    out.join("/")
}

/// `path.dirname`.
pub fn dirname(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let trimmed = p.trim_end_matches('/');
    if trimmed.is_empty() {
        return "/".into();
    }
    match trimmed.rfind('/') {
        None => ".".into(),
        Some(0) => "/".into(),
        Some(i) => {
            let d = trimmed[..i].trim_end_matches('/');
            if d.is_empty() {
                "/".into()
            } else {
                d.to_string()
            }
        }
    }
}

/// `path.basename`.
pub fn basename(p: &str) -> String {
    let trimmed = p.trim_end_matches('/');
    match trimmed.rfind('/') {
        None => trimmed.to_string(),
        Some(i) => trimmed[i + 1..].to_string(),
    }
}

/// `path.extname`.
pub fn extname(p: &str) -> String {
    let base = basename(p);
    match base.rfind('.') {
        None | Some(0) => String::new(),
        Some(i) => base[i..].to_string(),
    }
}

pub struct PathSafetyError {
    pub message: String,
    pub code: &'static str,
}

const MAX_SYMLINK_HOPS: usize = 40;

fn canonical_path(target: &str, hops: usize) -> Result<String, ()> {
    if hops > MAX_SYMLINK_HOPS {
        return Err(());
    }
    let meta = match fs::symlink_metadata(target) {
        Ok(m) => m,
        Err(e) => {
            let missing = e.kind() == std::io::ErrorKind::NotFound || e.raw_os_error() == Some(20);
            if !missing {
                return Err(());
            }
            let parent = dirname(target);
            if parent == target {
                return Ok(target.to_string());
            }
            return Ok(join(&[&canonical_path(&parent, hops)?, &basename(target)]));
        }
    };
    if let Ok(r) = fs::canonicalize(target) {
        return Ok(r.to_string_lossy().into_owned());
    }
    if !meta.file_type().is_symlink() {
        return Err(());
    }
    let link = fs::read_link(target).map_err(|_| ())?;
    let dir = fs::canonicalize(dirname(target)).map_err(|_| ())?;
    let next = resolve(&dir.to_string_lossy(), &[&link.to_string_lossy()]);
    canonical_path(&next, hops + 1)
}

/// `assertWithin(targetPath, rootDir, {label})`.
pub fn assert_within(target: &str, root: &str, label: &str, allow_absolute: bool) -> Result<String, PathSafetyError> {
    if target.is_empty() {
        return Err(PathSafetyError { message: format!("Invalid {label}: must be a non-empty string"), code: "PATH_INVALID" });
    }
    if target.contains('\0') {
        return Err(PathSafetyError { message: format!("Invalid {label}: contains a NUL byte"), code: "PATH_INVALID" });
    }
    if target.starts_with('/') && !allow_absolute {
        return Err(PathSafetyError {
            message: format!(
                "Invalid {label} \"{target}\": absolute paths are not allowed. Use a path relative to the project root."
            ),
            code: "PATH_ABSOLUTE",
        });
    }
    let abs_root = resolve(root, &[root]);
    let resolved = resolve(&abs_root, &[target]);
    let root_sep = if abs_root.ends_with('/') { abs_root.clone() } else { format!("{abs_root}/") };
    if resolved != abs_root && !resolved.starts_with(&root_sep) {
        return Err(PathSafetyError {
            message: format!(
                "Invalid {label} \"{target}\": resolves outside the project root ({abs_root}). Path traversal is not allowed."
            ),
            code: "ERR_PATH_TRAVERSAL",
        });
    }
    if let (Ok(real_root), Ok(real_target)) = (canonical_path(&abs_root, 0), canonical_path(&resolved, 0)) {
        let sep = if real_root.ends_with('/') { real_root.clone() } else { format!("{real_root}/") };
        if real_target != real_root && !real_target.starts_with(&sep) {
            return Err(PathSafetyError {
                message: format!(
                    "Invalid {label} \"{target}\": resolves outside the project root ({abs_root}) via a symlink. Path traversal is not allowed."
                ),
                code: "ERR_PATH_TRAVERSAL",
            });
        }
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_path_semantics() {
        assert_eq!(resolve("/a/b", &["../c/./d/"]), "/a/c/d");
        assert_eq!(relative("/x", "/a/b", "/a/c/d"), "../c/d");
        assert_eq!(dirname("/a/b/c.ts"), "/a/b");
        assert_eq!(dirname("c.ts"), ".");
        assert_eq!(extname("x/y.palette.ts"), ".ts");
        assert_eq!(extname(".hidden"), "");
        assert_eq!(normalize("a/../.."), "..");
    }
}
