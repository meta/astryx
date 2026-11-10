//! Node `path` helpers: `path.resolve` and `path.relative` on strings,
//! without touching the file system.

use std::path::{Component, Path, PathBuf};

/// `path.resolve(p)` against the process cwd.
pub fn resolve(p: &Path) -> PathBuf {
    if p.is_absolute() {
        normalize(p)
    } else {
        normalize(&std::env::current_dir().unwrap_or_default().join(p))
    }
}

pub fn resolve_from(base: &Path, p: &str) -> PathBuf {
    let pp = Path::new(p);
    if pp.is_absolute() {
        normalize(pp)
    } else {
        normalize(&base.join(pp))
    }
}

pub fn normalize(p: &Path) -> PathBuf {
    let mut out: Vec<String> = Vec::new();
    for c in p.components() {
        match c {
            Component::RootDir | Component::Prefix(_) => out.clear(),
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            Component::Normal(s) => out.push(s.to_string_lossy().into_owned()),
        }
    }
    PathBuf::from(format!("/{}", out.join("/")))
}

/// `path.relative(from, to)` with `/` separators.
pub fn relative(from: &Path, to: &Path) -> String {
    let f = normalize(from);
    let t = normalize(to);
    let fa: Vec<String> = f.components().filter_map(|c| if let Component::Normal(s) = c { Some(s.to_string_lossy().into_owned()) } else { None }).collect();
    let ta: Vec<String> = t.components().filter_map(|c| if let Component::Normal(s) = c { Some(s.to_string_lossy().into_owned()) } else { None }).collect();
    let mut i = 0;
    while i < fa.len() && i < ta.len() && fa[i] == ta[i] {
        i += 1;
    }
    let mut parts: Vec<String> = Vec::new();
    for _ in i..fa.len() {
        parts.push("..".into());
    }
    parts.extend(ta[i..].iter().cloned());
    parts.join("/")
}

/// `path.extname`
pub fn extname(p: &Path) -> String {
    let name = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    match name.rfind('.') {
        Some(0) | None => String::new(),
        Some(i) => name[i..].to_string(),
    }
}

/// A Node-style error message for an fs error (`ENOENT: no such file or directory, open '<p>'`).
pub fn io_message(e: &std::io::Error, syscall: &str, p: &Path) -> String {
    let (code, text) = match e.kind() {
        std::io::ErrorKind::NotFound => ("ENOENT", "no such file or directory"),
        std::io::ErrorKind::PermissionDenied => ("EACCES", "permission denied"),
        _ => match e.raw_os_error() {
            Some(20) => ("ENOTDIR", "not a directory"),
            Some(21) => ("EISDIR", "illegal operation on a directory"),
            _ => ("EIO", "i/o error"),
        },
    };
    format!("{}: {}, {} '{}'", code, text, syscall, p.display())
}

pub fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}
