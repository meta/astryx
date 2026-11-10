//! What `npm pack` does for `integration verify`: the file list
//! (npm-packlist and ignore-walk rules), the tarball (node-tar, portable
//! headers) and its gzip size: level 9 through the system zlib, the library
//! Node itself links, so the compressed size matches byte for byte.

use crate::json::Value;
use std::cmp::Ordering;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

// ── minimatch (the subset ignore rules use) ──────────────────────────

#[derive(Clone, Debug)]
struct Rule {
    negate: bool,
    /// Brace-expanded alternatives, each split on `/`.
    sets: Vec<Vec<String>>,
}

fn expand_braces(p: &str) -> Vec<String> {
    let chars: Vec<char> = p.chars().collect();
    let mut depth = 0;
    let mut start = None;
    for (i, c) in chars.iter().enumerate() {
        match c {
            '{' => {
                if depth == 0 {
                    start = Some(i);
                }
                depth += 1;
            }
            '}' if depth > 0 => {
                depth -= 1;
                if depth == 0 {
                    let s = start.unwrap();
                    let inner: String = chars[s + 1..i].iter().collect();
                    let pre: String = chars[..s].iter().collect();
                    let post: String = chars[i + 1..].iter().collect();
                    // Split the inner on top-level commas.
                    let mut parts = Vec::new();
                    let mut d = 0;
                    let mut cur = String::new();
                    for ch in inner.chars() {
                        match ch {
                            '{' => {
                                d += 1;
                                cur.push(ch)
                            }
                            '}' => {
                                d -= 1;
                                cur.push(ch)
                            }
                            ',' if d == 0 => parts.push(std::mem::take(&mut cur)),
                            _ => cur.push(ch),
                        }
                    }
                    parts.push(cur);
                    if parts.len() < 2 {
                        return vec![p.to_string()];
                    }
                    let mut out = Vec::new();
                    for part in parts {
                        for e in expand_braces(&format!("{pre}{part}{post}")) {
                            out.push(e);
                        }
                    }
                    return out;
                }
            }
            _ => {}
        }
    }
    vec![p.to_string()]
}

impl Rule {
    fn new(line: &str) -> Rule {
        let mut p = line.trim();
        let mut negate = false;
        while let Some(r) = p.strip_prefix('!') {
            negate = !negate;
            p = r;
        }
        let sets = expand_braces(p).into_iter().map(|e| e.split('/').map(|s| s.to_string()).collect()).collect();
        Rule { negate, sets }
    }

    fn matches(&self, file: &str, partial: bool) -> bool {
        let fparts: Vec<&str> = file.split('/').collect();
        for set in &self.sets {
            let pat: Vec<&str> = set.iter().map(|s| s.as_str()).collect();
            let ok = if pat.len() == 1 {
                // matchBase: a slash-less pattern matches the basename.
                let base = fparts.iter().rev().find(|s| !s.is_empty()).copied().unwrap_or("");
                let base_only = if file.ends_with('/') { vec![base, ""] } else { vec![base] };
                match_parts(&base_only, &pat, partial) || match_parts(&[base], &pat, partial)
            } else {
                match_parts(&fparts, &pat, partial)
            };
            if ok {
                return true;
            }
        }
        false
    }
}

fn match_parts(file: &[&str], pat: &[&str], partial: bool) -> bool {
    if pat.is_empty() {
        return file.is_empty();
    }
    if pat[0] == "**" {
        if pat.len() == 1 {
            return true;
        }
        for i in 0..=file.len() {
            if match_parts(&file[i..], &pat[1..], partial) {
                return true;
            }
        }
        return partial && false;
    }
    if file.is_empty() {
        return partial;
    }
    if !match_segment(file[0], pat[0]) {
        return false;
    }
    if file.len() == 1 && pat.len() == 2 && pat[1].is_empty() {
        // `foo/` pattern against `foo`: a file is not a folder.
        return false;
    }
    match_parts(&file[1..], &pat[1..], partial)
}

fn match_segment(s: &str, p: &str) -> bool {
    let s: Vec<char> = s.to_lowercase().chars().collect();
    let p: Vec<char> = p.to_lowercase().chars().collect();
    fn rec(s: &[char], p: &[char]) -> bool {
        if p.is_empty() {
            return s.is_empty();
        }
        match p[0] {
            '*' => {
                for i in 0..=s.len() {
                    if rec(&s[i..], &p[1..]) {
                        return true;
                    }
                }
                false
            }
            '?' => !s.is_empty() && rec(&s[1..], &p[1..]),
            '[' => {
                let Some(end) = p.iter().skip(1).position(|c| *c == ']').map(|e| e + 1) else {
                    return !s.is_empty() && s[0] == '[' && rec(&s[1..], &p[1..]);
                };
                if s.is_empty() {
                    return false;
                }
                let mut class = &p[1..end];
                let neg = matches!(class.first(), Some('!') | Some('^'));
                if neg {
                    class = &class[1..];
                }
                let mut hit = false;
                let mut i = 0;
                while i < class.len() {
                    if i + 2 < class.len() && class[i + 1] == '-' {
                        if s[0] >= class[i] && s[0] <= class[i + 2] {
                            hit = true;
                        }
                        i += 3;
                    } else {
                        if s[0] == class[i] {
                            hit = true;
                        }
                        i += 1;
                    }
                }
                hit != neg && rec(&s[1..], &p[end + 1..])
            }
            '\\' if p.len() > 1 => !s.is_empty() && s[0] == p[1] && rec(&s[1..], &p[2..]),
            c => !s.is_empty() && s[0] == c && rec(&s[1..], &p[1..]),
        }
    }
    rec(&s, &p)
}

fn parse_rules(text: &str) -> Vec<Rule> {
    text.split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .filter(|l| {
            let t = l.trim();
            !t.is_empty() && !t.starts_with('#')
        })
        .map(Rule::new)
        .collect()
}

// ── npm-packlist ─────────────────────────────────────────────────────

const DEFAULTS: &[&str] = &[
    ".npmignore", ".gitignore", "**/.git", "**/.svn", "**/.hg", "**/CVS", "**/.git/**", "**/.svn/**", "**/.hg/**", "**/CVS/**", "/.lock-wscript",
    "/.wafpickle-*", "/build/config.gypi", "npm-debug.log", "**/.npmrc", ".*.swp", ".DS_Store", "**/.DS_Store/**", "._*", "**/._*/**", "*.orig",
    "/archived-packages/**",
];

struct Walker<'p> {
    path: PathBuf,
    basename: String,
    parent: Option<&'p Walker<'p>>,
    /// Rule sets in precedence order (already pruned).
    rules: Vec<Vec<Rule>>,
    exact: bool,
}

impl<'p> Walker<'p> {
    fn filter_entry(&self, entry: &str, partial: bool, entry_basename: Option<&str>) -> bool {
        let mut included = true;
        if let Some(parent) = self.parent {
            let pe = format!("{}/{}", self.basename, entry);
            let pb = entry_basename.unwrap_or(entry);
            included = parent.filter_entry(&pe, partial, Some(pb));
            if !included && !self.exact {
                return false;
            }
        }
        for set in &self.rules {
            for rule in set {
                if rule.negate == included {
                    continue;
                }
                let is_relative = entry_basename.is_some() && rule.sets.iter().any(|part| part.len() <= if part.last().map(|s| !s.is_empty()).unwrap_or(false) { 1 } else { 2 });
                let m = rule.matches(&format!("/{entry}"), false)
                    || rule.matches(entry, false)
                    || (partial
                        && (rule.matches(&format!("/{entry}/"), false)
                            || rule.matches(&format!("{entry}/"), false)
                            || (rule.negate && (rule.matches(&format!("/{entry}"), true) || rule.matches(entry, true)))
                            || (is_relative && {
                                let b = entry_basename.unwrap();
                                rule.matches(&format!("/{b}/"), false)
                                    || rule.matches(&format!("{b}/"), false)
                                    || (rule.negate && (rule.matches(&format!("/{b}"), true) || rule.matches(b, true)))
                            })));
                if m {
                    included = rule.negate;
                }
            }
        }
        included
    }
}

fn read_rules(dir: &Path, name: &str) -> Option<Vec<Rule>> {
    fs::read_to_string(dir.join(name)).ok().map(|t| parse_rules(&t))
}

fn walk(w: &Walker, root: &Path, out: &mut Vec<String>) {
    let Ok(rd) = fs::read_dir(&w.path) else { return };
    let mut entries: Vec<String> = rd.flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
    entries.sort();
    for entry in entries {
        let pass_file = w.filter_entry(&entry, false, None);
        let pass_dir = w.filter_entry(&entry, true, None);
        if !pass_file && !pass_dir {
            continue;
        }
        if entry.contains('*') {
            continue;
        }
        let abs = w.path.join(&entry);
        let Ok(meta) = fs::symlink_metadata(&abs) else { continue };
        if meta.is_file() {
            if pass_file {
                out.push(abs.strip_prefix(root).unwrap().to_string_lossy().to_string());
            }
        } else if meta.is_dir() && pass_dir {
            let exact = pass_file || w.filter_entry(&format!("{entry}/"), false, None);
            let mut rules = vec![parse_rules(&DEFAULTS.join("\n"))];
            let npmignore = read_rules(&abs, ".npmignore");
            let gitignore = read_rules(&abs, ".gitignore");
            if let Some(n) = npmignore {
                rules.push(n);
            } else if let Some(g) = gitignore {
                rules.push(g);
            }
            rules.push(parse_rules("/.git"));
            let child = Walker { path: abs, basename: entry.clone(), parent: Some(w), rules, exact };
            walk(&child, root, out);
        }
    }
}

fn ext_of(p: &str) -> String {
    let base = p.rsplit('/').next().unwrap_or(p);
    match base.rfind('.') {
        Some(0) | None => String::new(),
        Some(i) => base[i..].to_lowercase(),
    }
}

/// The files `npm pack` puts in the tarball, in tar order.
pub fn packlist(dir: &Path, pkg: &Value) -> Vec<String> {
    let mut strict: Vec<String> = vec![
        "/.git".into(),
        "!/package.json".into(),
        "!/readme{,.*[^~$]}".into(),
        "!/copying{,.*[^~$]}".into(),
        "!/license{,.*[^~$]}".into(),
        "!/licence{,.*[^~$]}".into(),
        "/.git".into(),
        "/node_modules".into(),
        ".npmrc".into(),
        "/package-lock.json".into(),
        "/yarn.lock".into(),
        "/pnpm-lock.yaml".into(),
    ];
    let mut rules: Vec<Vec<Rule>> = vec![parse_rules(&DEFAULTS.join("\n"))];
    let mut pkg_rules: Option<Vec<Rule>> = None;
    if let Some(Value::Array(files)) = pkg.get("files") {
        let mut ignores = vec!["*".to_string()];
        for f in files.iter().filter_map(|f| f.as_str()) {
            let mut file = f.to_string();
            if file.starts_with("./") {
                file = file[1..].to_string();
            }
            if file.ends_with("/*") {
                file.push('*');
            }
            let inverse = format!("!{file}");
            let stat_path = dir.join(file.trim_start_matches('!').trim_start_matches('/'));
            match fs::symlink_metadata(&stat_path) {
                Ok(m) if m.is_file() => strict.insert(0, inverse),
                Ok(m) if m.is_dir() => {
                    ignores.push(inverse.clone());
                    ignores.push(format!("{inverse}/**"));
                }
                Ok(_) => {}
                Err(_) => ignores.push(inverse),
            }
        }
        pkg_rules = Some(parse_rules(&ignores.join("\n")));
    }
    if let Some(Value::String(b)) = pkg.get("browser") {
        strict.push(format!("!/{b}"));
    }
    if let Some(Value::String(m)) = pkg.get("main") {
        strict.push(format!("!/{m}"));
    }
    match pkg.get("bin") {
        Some(Value::Object(b)) => {
            for v in b.values().filter_map(|v| v.as_str()) {
                strict.push(format!("!/{v}"));
            }
        }
        Some(Value::String(s)) => strict.push(format!("!/{s}")),
        _ => {}
    }
    match pkg_rules {
        Some(r) => rules.push(r),
        None => {
            if let Some(n) = read_rules(dir, ".npmignore") {
                rules.push(n);
            } else if let Some(g) = read_rules(dir, ".gitignore") {
                rules.push(g);
            }
        }
    }
    rules.push(parse_rules(&strict.join("\n")));
    let root = Walker { path: dir.to_path_buf(), basename: crate::commands::integration::add_helpers::basename(dir), parent: None, rules, exact: false };
    let mut out = Vec::new();
    walk(&root, dir, &mut out);
    let lc = crate::text::collate::locale_compare;
    out.sort_by(|a, b| {
        let (ea, eb) = (ext_of(a), ext_of(b));
        let ba = a.rsplit('/').next().unwrap_or(a).to_lowercase();
        let bb = b.rsplit('/').next().unwrap_or(b).to_lowercase();
        let o = lc(&ea, &eb);
        if o != Ordering::Equal {
            return o;
        }
        let o = lc(&ba, &bb);
        if o != Ordering::Equal {
            return o;
        }
        lc(a, b)
    });
    out
}

// ── node-tar (portable) and gzip ─────────────────────────────────────

fn octal(buf: &mut [u8], off: usize, size: usize, n: u64) {
    let s = format!("{:o}", n);
    let digits = size - 2;
    let txt = format!("{}{} ", "0".repeat(digits.saturating_sub(s.len())), s);
    buf[off..off + txt.len()].copy_from_slice(txt.as_bytes());
}

fn header(path: &str, size: u64, mode: u32) -> Vec<u8> {
    let mut h = vec![0u8; 512];
    let (prefix, name) = if path.len() <= 100 {
        ("", path)
    } else {
        match path[..path.len().min(156)].rfind('/') {
            Some(i) if path.len() - i - 1 <= 100 && i <= 155 => (&path[..i], &path[i + 1..]),
            _ => ("", path),
        }
    };
    let nb = name.as_bytes();
    h[..nb.len().min(100)].copy_from_slice(&nb[..nb.len().min(100)]);
    octal(&mut h, 100, 8, mode as u64);
    octal(&mut h, 124, 12, size);
    octal(&mut h, 136, 12, 499162500);
    h[156] = b'0';
    h[257..263].copy_from_slice(b"ustar\0");
    h[263..265].copy_from_slice(b"00");
    octal(&mut h, 329, 8, 0);
    octal(&mut h, 337, 8, 0);
    let pb = prefix.as_bytes();
    h[345..345 + pb.len().min(155)].copy_from_slice(&pb[..pb.len().min(155)]);
    for b in &mut h[148..156] {
        *b = b' ';
    }
    let sum: u64 = h.iter().map(|b| *b as u64).sum();
    octal(&mut h, 148, 8, sum);
    h[155] = 0;
    h
}

pub struct PackResult {
    pub filename: String,
    pub file_count: usize,
    pub size: usize,
    pub unpacked_size: u64,
    pub files: Vec<String>,
}

/// `npm pack --json`, without running lifecycle scripts.
pub fn npm_pack(dir: &Path, pkg: &Value) -> Result<PackResult, String> {
    // npm's own manifest checks, with the summary its `--json` error carries.
    let truthy = |v: Option<&Value>| match v {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Number(n)) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(true),
        _ => true,
    };
    let failed = |summary: &str| Err(format!("npm pack failed (exit 1): {summary}."));
    if !pkg.is_object() && !pkg.is_array() {
        let shown = match pkg {
            Value::String(t) => t.clone(),
            other => crate::cli::format::js_string(other),
        };
        return failed(&format!("Cannot use 'in' operator to search for 'bundleDependencies' in {shown}"));
    }
    if !truthy(pkg.get("name")) || !truthy(pkg.get("version")) {
        return failed("Invalid package, must have name and version");
    }
    if !pkg.get("name").map(|n| n.is_string()).unwrap_or(false) {
        return failed("manifest.name.replace is not a function");
    }
    let name = pkg.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let version = pkg.get("version").map(crate::cli::format::js_string).unwrap_or_default();
    let version = version.as_str();
    let files = packlist(dir, pkg);
    let mut tar: Vec<u8> = Vec::new();
    let mut unpacked = 0u64;
    for f in &files {
        let abs = dir.join(f);
        let data = fs::read(&abs).map_err(|e| e.to_string())?;
        let meta = fs::metadata(&abs).map_err(|e| e.to_string())?;
        use std::os::unix::fs::PermissionsExt;
        let mode = (meta.permissions().mode() | 0o600) & !0o022 & 0o7777;
        tar.extend(header(&format!("package/{f}"), data.len() as u64, mode));
        tar.extend(&data);
        let pad = (512 - data.len() % 512) % 512;
        tar.extend(std::iter::repeat(0u8).take(pad));
        unpacked += data.len() as u64;
    }
    tar.extend(std::iter::repeat(0u8).take(1024));
    let mut e = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::new(9));
    e.write_all(&tar).map_err(|e| e.to_string())?;
    let deflated = e.finish().map_err(|e| e.to_string())?;
    let size = deflated.len() + 18;
    let base = name.strip_prefix('@').unwrap_or(name).replace('/', "-");
    Ok(PackResult { filename: format!("{base}-{version}.tgz"), file_count: files.len(), size, unpacked_size: unpacked, files })
}
