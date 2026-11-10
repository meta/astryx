//! Node `path` semantics doctor needs, and small fs readers.

use crate::json::Value;
use std::path::{Component, Path, PathBuf};

/// `path.normalize` for an absolute path: drop `.`, fold `..`.
pub fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::from("/");
    for c in p.components() {
        match c {
            Component::RootDir | Component::Prefix(_) => out = PathBuf::from("/"),
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            Component::Normal(s) => out.push(s),
        }
    }
    out
}

/// `path.resolve(base, p)`.
pub fn resolve(base: &Path, p: &str) -> PathBuf {
    normalize(&base.join(p))
}

/// `path.join(base, p)` (p may start with `/`).
pub fn join(base: &Path, p: &str) -> PathBuf {
    normalize(&base.join(p.trim_start_matches('/')))
}

/// `path.relative(from, to)` with `/` separators.
pub fn relative(from: &Path, to: &Path) -> String {
    let from = normalize(from);
    let to = normalize(to);
    let f: Vec<_> = from.components().collect();
    let t: Vec<_> = to.components().collect();
    let mut i = 0;
    while i < f.len() && i < t.len() && f[i] == t[i] {
        i += 1;
    }
    let mut parts: Vec<String> = Vec::new();
    for _ in i..f.len() {
        parts.push("..".into());
    }
    for c in &t[i..] {
        parts.push(c.as_os_str().to_string_lossy().into_owned());
    }
    parts.join("/")
}

/// `JSON.parse(readFileSync(file))`, or None.
pub fn read_json(file: &Path) -> Option<Value> {
    let s = std::fs::read_to_string(file).ok()?;
    serde_json::from_str(&s).ok()
}

/// `fs.readdirSync(dir, {withFileTypes: true})`: sorted by name bytes, as
/// libuv sorts a directory listing.
pub fn read_dir_sorted(dir: &str) -> Option<Vec<crate::discovery::nodepath::Dirent>> {
    let mut v = crate::discovery::nodepath::read_dir(dir)?;
    v.sort_by(|a, b| a.name.as_bytes().cmp(b.name.as_bytes()));
    Some(v)
}
