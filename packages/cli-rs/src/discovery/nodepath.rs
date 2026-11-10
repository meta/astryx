//! Node's `path` and `fs` helpers on POSIX, with Node's exact semantics:
//! lexical `resolve`/`join`/`normalize`/`relative`, `existsSync` (follows
//! symbolic links), `realpathSync`, and JSON file reads.
//!
//! Paths are `String`s (UTF-8), as in the JS CLI, so callers can compare and
//! print them exactly as Node does.

use crate::json::Value;
use std::path::Path;

/// `path.normalize` (posix).
pub fn normalize(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let absolute = p.starts_with('/');
    let trailing = p.ends_with('/');
    let mut out: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if !out.is_empty() && *out.last().unwrap() != ".." {
                    out.pop();
                } else if !absolute {
                    out.push("..");
                }
            }
            s => out.push(s),
        }
    }
    let mut s = out.join("/");
    if s.is_empty() && !absolute {
        s = ".".into();
    }
    if trailing && s != "." && !s.is_empty() {
        s.push('/');
    } else if trailing && s == "." && p != "./" && !absolute {
        // Node: normalize("./") is "./"
        s = "./".into();
    }
    if absolute {
        format!("/{s}")
    } else {
        s
    }
}

/// `path.join` (posix).
pub fn join(parts: &[&str]) -> String {
    let joined: Vec<&str> = parts.iter().copied().filter(|p| !p.is_empty()).collect();
    if joined.is_empty() {
        return ".".into();
    }
    normalize(&joined.join("/"))
}

/// Two-part `path.join`.
pub fn join2(a: &str, b: &str) -> String {
    join(&[a, b])
}

/// `process.cwd()`.
pub fn cwd() -> String {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "/".into())
}

/// `path.resolve(...parts)` (posix), against `process.cwd()`.
pub fn resolve(parts: &[&str]) -> String {
    let mut resolved = String::new();
    let mut absolute = false;
    for p in parts.iter().rev() {
        if p.is_empty() {
            continue;
        }
        resolved = if resolved.is_empty() {
            (*p).to_string()
        } else {
            format!("{p}/{resolved}")
        };
        if p.starts_with('/') {
            absolute = true;
            break;
        }
    }
    if !absolute {
        let c = cwd();
        resolved = if resolved.is_empty() { c } else { format!("{c}/{resolved}") };
    }
    let n = normalize(&resolved);
    if n.len() > 1 && n.ends_with('/') {
        n[..n.len() - 1].to_string()
    } else {
        n
    }
}

/// One-part `path.resolve`.
pub fn resolve1(p: &str) -> String {
    resolve(&[p])
}

/// `path.dirname` (posix).
pub fn dirname(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let bytes = p.as_bytes();
    let has_root = bytes[0] == b'/';
    let mut end: isize = -1;
    let mut matched_slash = true;
    for i in (1..bytes.len()).rev() {
        if bytes[i] == b'/' {
            if !matched_slash {
                end = i as isize;
                break;
            }
        } else {
            matched_slash = false;
        }
    }
    if end == -1 {
        return if has_root { "/".into() } else { ".".into() };
    }
    if has_root && end == 1 {
        return "//".into();
    }
    p[..end as usize].to_string()
}

/// `path.basename` (posix), without an extension argument.
pub fn basename(p: &str) -> String {
    let t = p.trim_end_matches('/');
    if t.is_empty() {
        return String::new();
    }
    match t.rfind('/') {
        Some(i) => t[i + 1..].to_string(),
        None => t.to_string(),
    }
}

/// `path.extname` (posix).
pub fn extname(p: &str) -> String {
    let b = basename(p);
    match b.rfind('.') {
        Some(0) | None => String::new(),
        Some(i) => b[i..].to_string(),
    }
}

/// `path.relative(from, to)` (posix).
pub fn relative(from: &str, to: &str) -> String {
    let from = resolve1(from);
    let to = resolve1(to);
    if from == to {
        return String::new();
    }
    let f: Vec<&str> = from.split('/').filter(|s| !s.is_empty()).collect();
    let t: Vec<&str> = to.split('/').filter(|s| !s.is_empty()).collect();
    let mut i = 0;
    while i < f.len() && i < t.len() && f[i] == t[i] {
        i += 1;
    }
    let mut out: Vec<&str> = Vec::new();
    for _ in i..f.len() {
        out.push("..");
    }
    out.extend_from_slice(&t[i..]);
    out.join("/")
}

/// `path.isAbsolute` (posix).
pub fn is_absolute(p: &str) -> bool {
    p.starts_with('/')
}

/// `fs.existsSync` (follows symbolic links).
pub fn exists(p: &str) -> bool {
    super::listing_cache::exists(Path::new(p))
}

/// A directory, following links (`statSync(p).isDirectory()`).
pub fn is_dir(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_dir()).unwrap_or(false)
}

/// A regular file, following links.
pub fn is_file(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

/// `fs.realpathSync(p)`, or `path.resolve(p)` when it fails.
pub fn real_or_resolve(p: &str) -> String {
    match std::fs::canonicalize(p) {
        Ok(r) => r.to_string_lossy().into_owned(),
        Err(_) => resolve1(p),
    }
}

/// `fs.realpathSync(p)`.
pub fn realpath(p: &str) -> Option<String> {
    std::fs::canonicalize(p).ok().map(|r| r.to_string_lossy().into_owned())
}

/// `fs.readFileSync(p, 'utf-8')`. Invalid UTF-8 becomes U+FFFD, as in Node.
pub fn read_text(p: &str) -> Option<String> {
    std::fs::read(p).ok().map(|b| match String::from_utf8(b) {
        Ok(s) => s,
        Err(e) => String::from_utf8_lossy(e.as_bytes()).into_owned(),
    })
}

/// `JSON.parse(readFileSync(p))`, or None when missing or invalid. Node strips
/// nothing: a BOM makes `JSON.parse` fail, and so does it here.
pub fn read_json(p: &str) -> Option<Value> {
    let text = read_text(p)?;
    parse_json(&text)
}

/// `JSON.parse(text)`, None on a syntax error. JSON.parse accepts surrounding
/// JSON whitespace only (space, tab, CR, LF).
pub fn parse_json(text: &str) -> Option<Value> {
    serde_json::from_str::<Value>(text).ok()
}

/// A directory entry, as `readdirSync(dir, {withFileTypes: true})` gives it.
#[derive(Debug, Clone)]
pub struct Dirent {
    pub name: String,
    /// `isDirectory()`: a real directory, NOT a link to one.
    pub is_dir: bool,
    pub is_file: bool,
    pub is_symlink: bool,
}

/// `fs.readdirSync(dir, {withFileTypes: true})`, in the order Node returns
/// it: libuv's scandir sorts by name bytes. None when the folder cannot be read.
pub fn read_dir(dir: &str) -> Option<Vec<Dirent>> {
    let raw = super::listing_cache::read_dir(Path::new(dir))?;
    let mut out: Vec<Dirent> = raw
        .iter()
        .filter_map(|e| {
            let k = e.kind?;
            Some(Dirent { name: e.name.clone(), is_dir: k.is_dir, is_file: k.is_file, is_symlink: k.is_symlink })
        })
        .collect();
    out.sort_by(|a, b| a.name.as_bytes().cmp(b.name.as_bytes()));
    Some(out)
}

/// `fs.readdirSync(dir)` names. Node's order on Linux is the libuv scandir
/// order, which sorts entries by name (strcmp). Use this order everywhere a
/// JS caller iterates a listing without sorting.
pub fn list_dir(dir: &str) -> Option<Vec<String>> {
    let mut v: Vec<String> = read_dir(dir)?.into_iter().map(|d| d.name).collect();
    v.sort();
    Some(v)
}

/// `readdirSync(dir, {withFileTypes: true})` in Node's order (sorted by name,
/// as libuv's scandir returns them).
pub fn list_dir_entries(dir: &str) -> Option<Vec<Dirent>> {
    let mut v = read_dir(dir)?;
    v.sort_by(|a, b| a.name.as_bytes().cmp(b.name.as_bytes()));
    Some(v)
}

/// `os.homedir()`: `$HOME`, else the passwd entry.
pub fn homedir() -> String {
    match std::env::var("HOME") {
        Ok(h) if !h.is_empty() => h,
        _ => std::env::var("USERPROFILE").unwrap_or_default(),
    }
}

/// A `Path` view.
pub fn p(s: &str) -> &Path {
    Path::new(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn node_path_semantics() {
        assert_eq!(normalize("/a/b/../c/./d/"), "/a/c/d/");
        assert_eq!(join(&["a", "../..", "b"]), "../b");
        assert_eq!(dirname("/a/b/"), "/a");
        assert_eq!(dirname("/a"), "/");
        assert_eq!(dirname("a"), ".");
        assert_eq!(relative("/a/b/c", "/a/d"), "../../d");
        assert_eq!(relative("/a", "/a/b/c"), "b/c");
        assert_eq!(resolve(&["/a/b", "../c/"]), "/a/c");
        assert_eq!(basename("/a/b.doc.mjs"), "b.doc.mjs");
        assert_eq!(extname("/a/b.doc.mjs"), ".mjs");
        assert_eq!(extname(".gitignore"), "");
    }
}
