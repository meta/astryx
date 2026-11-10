//! TEMP: replace with src/discovery fs/path-safety when it lands.

use super::jspath as p;

#[derive(Debug, Clone)]
pub struct PathSafetyError {
    pub message: String,
    pub code: String,
}

fn err(message: String, code: &str) -> PathSafetyError {
    PathSafetyError { message, code: code.into() }
}

fn canonical_path(target: &str, hops: usize) -> Result<String, ()> {
    if hops > 40 {
        return Err(());
    }
    let meta = match std::fs::symlink_metadata(target) {
        Ok(m) => m,
        Err(e) => {
            let not_dir = e.raw_os_error() == Some(20);
            if e.kind() != std::io::ErrorKind::NotFound && !not_dir {
                return Err(());
            }
            let parent = p::dirname(target);
            if parent == target {
                return Ok(target.to_string());
            }
            return Ok(p::join2(&canonical_path(&parent, hops)?, &p::basename(target)));
        }
    };
    if let Some(r) = p::realpath(target) {
        return Ok(r);
    }
    if !meta.file_type().is_symlink() {
        return Err(());
    }
    let link = std::fs::read_link(target).map_err(|_| ())?;
    let dir = p::realpath(&p::dirname(target)).ok_or(())?;
    canonical_path(&p::resolve(&[&dir, &link.to_string_lossy()]), hops + 1)
}

pub fn assert_within(target: &str, root: &str, allow_absolute: bool, label: &str) -> Result<String, PathSafetyError> {
    if target.is_empty() {
        return Err(err(format!("Invalid {label}: must be a non-empty string"), "PATH_INVALID"));
    }
    if target.contains('\0') {
        return Err(err(format!("Invalid {label}: contains a NUL byte"), "PATH_INVALID"));
    }
    if p::is_absolute(target) && !allow_absolute {
        return Err(err(
            format!("Invalid {label} \"{target}\": absolute paths are not allowed. Use a path relative to the project root."),
            "PATH_ABSOLUTE",
        ));
    }
    let abs_root = p::resolve1(root);
    let resolved = p::resolve(&[&abs_root, target]);
    let with_sep = if abs_root.ends_with('/') { abs_root.clone() } else { format!("{abs_root}/") };
    if resolved != abs_root && !resolved.starts_with(&with_sep) {
        return Err(err(
            format!("Invalid {label} \"{target}\": resolves outside the project root ({abs_root}). Path traversal is not allowed."),
            "ERR_PATH_TRAVERSAL",
        ));
    }
    if let (Ok(rr), Ok(rt)) = (canonical_path(&abs_root, 0), canonical_path(&resolved, 0)) {
        let rws = if rr.ends_with('/') { rr.clone() } else { format!("{rr}/") };
        if rt != rr && !rt.starts_with(&rws) {
            return Err(err(
                format!("Invalid {label} \"{target}\": resolves outside the project root ({abs_root}) via a symlink. Path traversal is not allowed."),
                "ERR_PATH_TRAVERSAL",
            ));
        }
    }
    Ok(resolved)
}

pub fn sanitize_name(name: &str, label: &str) -> Result<(), PathSafetyError> {
    if name.is_empty() {
        return Err(err(format!("Invalid {label}: must be a non-empty string"), "NAME_INVALID"));
    }
    if name.contains('\0') {
        return Err(err(format!("Invalid {label}: contains a NUL byte"), "NAME_INVALID"));
    }
    if name.contains('/') || name.contains('\\') {
        return Err(err(format!("Invalid {label} \"{name}\": must not contain path separators ('/' or '\\\\')."), "NAME_HAS_SEPARATOR"));
    }
    if name.starts_with('.') {
        return Err(err(format!("Invalid {label} \"{name}\": must not start with '.'."), "NAME_TRAVERSAL"));
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-') {
        return Err(err(format!("Invalid {label} \"{name}\": only letters, digits, '.', '_', and '-' are allowed."), "NAME_BAD_CHARS"));
    }
    Ok(())
}
