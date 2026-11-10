//! Which files `npm pack` puts in a package (npm-packlist's rules), so the
//! template-asset check reads the same answer `npm pack --dry-run` gives
//! without running npm: the strict exclusions, the `files` field, and each
//! folder's `.npmignore` (or `.gitignore` where it has none), applied from
//! the package root down.

use crate::discovery::nodepath as np;

const DEFAULT_RULES: &[&str] = &[
    ".npmignore",
    ".gitignore",
    "**/.git",
    "**/.svn",
    "**/.hg",
    "**/CVS",
    "**/.git/**",
    "**/.svn/**",
    "**/.hg/**",
    "**/CVS/**",
    "/.lock-wscript",
    "/.wafpickle-*",
    "/build/config.gypi",
    "npm-debug.log",
    "**/.npmrc",
    ".*.swp",
    ".DS_Store",
    "**/.DS_Store/**",
    "._*",
    "**/._*/**",
    "*.orig",
    "/archived-packages/**",
];

const STRICT_ROOT: &[&str] = &["node_modules", ".git", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock"];

struct Rule {
    negate: bool,
    dir_only: bool,
    re: regress::Regex,
}

fn glob_to_regex(glob: &str, anchored: bool) -> String {
    let c: Vec<char> = glob.chars().collect();
    let mut out = String::from(if anchored { "^" } else { "^(?:.*/)?" });
    let mut i = 0;
    while i < c.len() {
        let ch = c[i];
        if ch == '*' {
            if c.get(i + 1) == Some(&'*') {
                let at_start = i == 0 || c[i - 1] == '/';
                let at_end = i + 2 == c.len() || c.get(i + 2) == Some(&'/');
                if at_start && at_end {
                    if i + 2 == c.len() {
                        out.push_str(".*");
                        i += 2;
                    } else {
                        out.push_str("(?:.*/)?");
                        i += 3;
                    }
                    continue;
                }
                out.push_str("[^/]*");
                i += 2;
                continue;
            }
            out.push_str("[^/]*");
        } else if ch == '?' {
            out.push_str("[^/]");
        } else if ch == '[' {
            if let Some(end) = c[i + 1..].iter().position(|x| *x == ']') {
                let body: String = c[i + 1..i + 1 + end].iter().collect();
                let body = body.strip_prefix('!').map(|b| format!("^{b}")).unwrap_or(body);
                out.push('[');
                out.push_str(&body.replace('\\', "\\\\"));
                out.push(']');
                i += end + 2;
                continue;
            }
            out.push_str("\\[");
        } else if ch == '\\' && i + 1 < c.len() {
            out.push_str(&regex_escape(c[i + 1]));
            i += 2;
            continue;
        } else {
            out.push_str(&regex_escape(ch));
        }
        i += 1;
    }
    out.push('$');
    out
}

fn regex_escape(ch: char) -> String {
    if ".+^${}()|[]\\/*?".contains(ch) {
        format!("\\{ch}")
    } else {
        ch.to_string()
    }
}

fn rule(line: &str) -> Option<Rule> {
    let mut l = line.trim_end_matches(['\r']).to_string();
    if l.trim().is_empty() || l.starts_with('#') {
        return None;
    }
    while l.ends_with(' ') && !l.ends_with("\\ ") {
        l.pop();
    }
    let negate = l.starts_with('!');
    if negate {
        l.remove(0);
    }
    let dir_only = l.ends_with('/');
    let l = l.trim_end_matches('/');
    let anchored = l.starts_with('/') || l.contains('/');
    let l = l.trim_start_matches('/');
    if l.is_empty() {
        return None;
    }
    regress::Regex::new(&glob_to_regex(l, anchored)).ok().map(|re| Rule { negate, dir_only, re })
}

fn rules_of(text: &str) -> Vec<Rule> {
    text.lines().filter_map(rule).collect()
}

/// Apply rules to `rel` (relative to the rules' folder): each folder on the
/// way and the file itself, later rules winning.
fn apply(rules: &[Rule], rel: &str, is_dir: bool, state: &mut bool) {
    let parts: Vec<&str> = rel.split('/').collect();
    for (i, _) in parts.iter().enumerate() {
        let sub = parts[..=i].join("/");
        let dir = i + 1 < parts.len() || is_dir;
        for r in rules {
            if r.dir_only && !dir {
                continue;
            }
            if r.re.find(&sub).is_some() {
                // An excluded folder excludes what is in it; a negation that
                // names the file itself brings it back.
                if i + 1 < parts.len() && !r.negate {
                    *state = false;
                } else if i + 1 == parts.len() || r.negate {
                    *state = r.negate;
                }
            }
        }
    }
}

fn read(file: &str) -> Option<String> {
    std::fs::read(file).ok().map(|b| String::from_utf8_lossy(&b).into_owned())
}

/// The root rules a `files` field makes: everything out, each entry (and what
/// is in it) back in, each `!` entry out again.
fn files_rules(files: &[String]) -> Vec<Rule> {
    let mut out: Vec<Rule> = rule("*").into_iter().collect();
    for f in files {
        let (neg, body) = match f.strip_prefix('!') {
            Some(b) => (true, b),
            None => (false, f.as_str()),
        };
        let body = body.trim_start_matches("./").trim_end_matches('/');
        let body = body.strip_suffix("/**").unwrap_or(body);
        if body.is_empty() {
            continue;
        }
        let anchored = format!("/{body}");
        for pat in [anchored.clone(), format!("{anchored}/**")] {
            let line = if neg { pat } else { format!("!{pat}") };
            if let Some(r) = rule(&line) {
                out.push(r);
            }
        }
    }
    out
}

/// Whether `npm pack` packs the file at `rel` (POSIX, from the package root).
pub fn npm_packs_file(base: &str, rel: &str, files: Option<&[String]>) -> bool {
    let parts: Vec<&str> = rel.split('/').collect();
    if parts[0] == "node_modules" || parts[0] == ".git" || (parts.len() == 1 && STRICT_ROOT.contains(&parts[0])) {
        return false;
    }
    if parts.len() == 1 {
        let lower = parts[0].to_lowercase();
        if lower == "package.json" || ["readme", "copying", "license", "licence"].iter().any(|p| lower.starts_with(p)) {
            return true;
        }
    }
    let defaults: Vec<Rule> = DEFAULT_RULES.iter().filter_map(|r| rule(r)).collect();
    let mut state = true;
    for (depth, _) in parts.iter().enumerate() {
        let dir_rel = parts[..depth].join("/");
        let dir = if dir_rel.is_empty() { base.to_string() } else { np::join2(base, &dir_rel) };
        let below = parts[depth..].join("/");
        let mut rules: Vec<Rule> = Vec::new();
        if depth == 0 {
            rules.extend(defaults.iter().map(|r| Rule { negate: r.negate, dir_only: r.dir_only, re: r.re.clone() }));
        }
        match (depth, files) {
            (0, Some(f)) => rules.extend(files_rules(f)),
            _ => {
                let own = read(&np::join2(&dir, ".npmignore")).or_else(|| read(&np::join2(&dir, ".gitignore")));
                if let Some(t) = own {
                    rules.extend(rules_of(&t));
                }
            }
        }
        apply(&rules, &below, false, &mut state);
        if !state {
            // A folder npm leaves out is never walked into.
            let dirs_only = parts[depth..parts.len() - 1].join("/");
            if !dirs_only.is_empty() {
                let mut dir_state = true;
                apply(&rules, &dirs_only, true, &mut dir_state);
                if !dir_state {
                    return false;
                }
            }
        }
    }
    state
}

/// Whether `npm pack` packs the asset: the file, or anything in the folder.
pub fn npm_packs(base: &str, rel: &str, is_folder: bool, files: Option<&[String]>) -> bool {
    if !is_folder {
        return npm_packs_file(base, rel, files);
    }
    let mut stack = vec![rel.to_string()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(np::join2(base, &d)) else { continue };
        let mut names: Vec<(String, bool)> = rd.filter_map(|e| e.ok()).map(|e| (e.file_name().to_string_lossy().into_owned(), e.file_type().map(|t| t.is_dir()).unwrap_or(false))).collect();
        names.sort();
        for (n, is_dir) in names {
            let child = format!("{d}/{n}");
            if is_dir {
                stack.push(child);
            } else if npm_packs_file(base, &child, files) {
                return true;
            }
        }
    }
    false
}
