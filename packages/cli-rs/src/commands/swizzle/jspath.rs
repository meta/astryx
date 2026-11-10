//! Node's `path` module (POSIX flavor) over plain strings, so path arithmetic
//! gives the bytes the JS CLI prints.

pub fn is_absolute(p: &str) -> bool {
    p.starts_with('/')
}

/// `path.normalize` without the trailing-slash rule's special cases beyond Node's.
fn normalize_string(path: &str, allow_above_root: bool) -> String {
    let mut res: Vec<&str> = Vec::new();
    for seg in path.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." {
            if !res.is_empty() && *res.last().unwrap() != ".." {
                res.pop();
            } else if allow_above_root {
                res.push("..");
            }
            continue;
        }
        res.push(seg);
    }
    res.join("/")
}

pub fn normalize(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let abs = is_absolute(p);
    let trailing = p.ends_with('/');
    let mut s = normalize_string(p, !abs);
    if s.is_empty() {
        if abs {
            return "/".into();
        }
        return if trailing { "./".into() } else { ".".into() };
    }
    if trailing {
        s.push('/');
    }
    if abs {
        format!("/{s}")
    } else {
        s
    }
}

pub fn cwd() -> String {
    std::env::var("PWD")
        .ok()
        .filter(|p| {
            // PWD may be stale; trust it only when it names the real cwd.
            let real = std::env::current_dir().ok();
            match (std::fs::canonicalize(p).ok(), real.and_then(|r| std::fs::canonicalize(r).ok())) {
                (Some(a), Some(b)) => a == b,
                _ => false,
            }
        })
        .unwrap_or_else(|| std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| "/".into()))
}

pub fn resolve(parts: &[&str]) -> String {
    let mut resolved = String::new();
    let mut abs = false;
    for p in parts.iter().rev() {
        if p.is_empty() {
            continue;
        }
        resolved = if resolved.is_empty() { p.to_string() } else { format!("{p}/{resolved}") };
        if is_absolute(p) {
            abs = true;
            break;
        }
    }
    if !abs {
        let c = process_cwd();
        resolved = if resolved.is_empty() { c } else { format!("{c}/{resolved}") };
    }
    let s = normalize_string(&resolved, false);
    format!("/{s}")
}

/// `process.cwd()`: Node reports the real path (getcwd), not $PWD.
pub fn process_cwd() -> String {
    std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| "/".into())
}

pub fn resolve1(p: &str) -> String {
    resolve(&[p])
}

pub fn join(parts: &[&str]) -> String {
    let joined: Vec<&str> = parts.iter().copied().filter(|p| !p.is_empty()).collect();
    if joined.is_empty() {
        return ".".into();
    }
    normalize(&joined.join("/"))
}

pub fn join2(a: &str, b: &str) -> String {
    join(&[a, b])
}

pub fn dirname(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let has_root = p.starts_with('/');
    let bytes = p.as_bytes();
    let mut end: isize = -1;
    let mut matched_slash = true;
    let mut i = bytes.len() as isize - 1;
    while i >= 1 {
        if bytes[i as usize] == b'/' {
            if !matched_slash {
                end = i;
                break;
            }
        } else {
            matched_slash = false;
        }
        i -= 1;
    }
    if end == -1 {
        return if has_root { "/".into() } else { ".".into() };
    }
    if has_root && end == 1 {
        return "//".into();
    }
    p[..end as usize].to_string()
}

pub fn basename(p: &str) -> String {
    let trimmed = p.trim_end_matches('/');
    if trimmed.is_empty() {
        return if p.is_empty() { String::new() } else { String::new() };
    }
    match trimmed.rfind('/') {
        Some(i) => trimmed[i + 1..].to_string(),
        None => trimmed.to_string(),
    }
}

/// `path.basename(p, ext)`.
pub fn basename_ext(p: &str, ext: &str) -> String {
    let b = basename(p);
    if !ext.is_empty() && b.ends_with(ext) && b != ext {
        b[..b.len() - ext.len()].to_string()
    } else {
        b
    }
}

pub fn extname(p: &str) -> String {
    let b = basename(p);
    let start_dot = b.starts_with('.') as usize;
    match b[start_dot..].rfind('.') {
        Some(i) if i + start_dot > 0 => b[i + start_dot..].to_string(),
        _ => String::new(),
    }
}

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

/// `fs.realpathSync`, as a string; None when it fails.
pub fn realpath(p: &str) -> Option<String> {
    std::fs::canonicalize(p).ok().map(|x| x.to_string_lossy().into_owned())
}

pub fn exists(p: &str) -> bool {
    std::fs::metadata(p).is_ok()
}

pub fn is_file(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

pub fn is_dir(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_dir()).unwrap_or(false)
}

/// `fs.readdirSync(dir)` names, sorted as libuv returns them (strcmp).
pub fn readdir(dir: &str) -> Option<Vec<String>> {
    let mut v: Vec<String> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    Some(v)
}

pub fn read_to_string(p: &str) -> Option<String> {
    std::fs::read(p).ok().map(|b| String::from_utf8_lossy(&b).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn basics() {
        assert_eq!(relative("/a/b/c", "/a/d"), "../../d");
        assert_eq!(dirname("/a/b/c"), "/a/b");
        assert_eq!(dirname("/a"), "/");
        assert_eq!(join(&["a", "../b", "c/"]), "b/c/");
        assert_eq!(normalize("./a/../.."), "..");
        assert_eq!(extname("a.stylex.ts"), ".ts");
        assert_eq!(extname(".hermes"), "");
        assert_eq!(basename_ext("x/AGENTS.md", ".md"), "AGENTS");
    }
}
