//! Port of `foundation/fs/paths.mjs`: the Astryx project a folder belongs to,
//! its workspace root, its `@astryxdesign/core` and other installed
//! packages, and the CLI package root.

use super::nodepath as np;
use crate::json::Value;
use std::sync::OnceLock;

/// The package every Core lookup answers for.
pub const CORE_PACKAGE: &str = "@astryxdesign/core";
/// The CLI package.
pub const CLI_PACKAGE_NAME: &str = "@astryxdesign/cli";

const CORE_REACH: usize = 5;
pub const INSTALLED_REACH: usize = 6;
const ASTRYX_SCOPES: [&str; 2] = ["@astryxdesign/", "@xds/"];
pub const DEPENDENCY_FIELDS: [&str; 4] = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
];
pub const REPOSITORY_MARKERS: [&str; 3] = [".git", ".hg", ".sl"];

/// Root of the CLI package (`CLI_ROOT`): `packages/cli` beside this crate.
///
/// Found from the running binary (`<crate>/target/<profile>/astryx`, walking
/// up to a folder whose sibling `cli` holds the CLI package), else from the
/// crate folder at build time. `ASTRYX_RS_CLI_ROOT` overrides both (tests).
/// Resolved through symbolic links, as Node resolves `import.meta.url`.
pub fn cli_root() -> &'static str {
    static ROOT: OnceLock<String> = OnceLock::new();
    ROOT.get_or_init(|| {
        if let Ok(v) = std::env::var("ASTRYX_RS_CLI_ROOT") {
            if !v.is_empty() {
                return np::real_or_resolve(&v);
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            let exe = exe.to_string_lossy().into_owned();
            let mut dir = np::dirname(&np::real_or_resolve(&exe));
            loop {
                let cand = np::join(&[&dir, "..", "cli"]);
                if np::basename(&dir) == "cli-rs" && is_cli_package(&cand) {
                    return np::real_or_resolve(&cand);
                }
                let parent = np::dirname(&dir);
                if parent == dir {
                    break;
                }
                dir = parent;
            }
        }
        let manifest = env!("CARGO_MANIFEST_DIR");
        np::real_or_resolve(&np::join(&[manifest, "..", "cli"]))
    })
}

fn is_cli_package(dir: &str) -> bool {
    read_package_json(dir)
        .and_then(|p| p.get("name").and_then(|n| n.as_str()).map(|n| n == CLI_PACKAGE_NAME))
        .unwrap_or(false)
}

/// The package.json in `dir`, when it parses to a JSON object (or array:
/// JS `typeof [] === 'object'`). `null` reads as absent.
pub fn read_package_json(dir: &str) -> Option<Value> {
    let v = np::read_json(&np::join2(dir, "package.json"))?;
    match v {
        Value::Object(_) | Value::Array(_) => Some(v),
        _ => None,
    }
}

/// `startDir` and every folder above it, nearest first.
pub fn folders_up_from(start: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut dir = np::resolve1(start);
    loop {
        out.push(dir.clone());
        let parent = np::dirname(&dir);
        if parent == dir {
            return out;
        }
        dir = parent;
    }
}

fn installed_in(dir: &str, name: &str) -> Option<String> {
    let mut parts: Vec<&str> = vec![dir, "node_modules"];
    parts.extend(name.split('/'));
    let candidate = np::join(&parts);
    if np::exists(&np::join2(&candidate, "package.json")) {
        Some(candidate)
    } else {
        None
    }
}

fn is_core_source(dir: &str) -> bool {
    read_package_json(dir)
        .map(|p| p.get("name").and_then(|n| n.as_str()) == Some(CORE_PACKAGE))
        .unwrap_or(false)
}

fn home_folder() -> Option<String> {
    let h = np::homedir();
    if h.is_empty() {
        None
    } else {
        Some(np::real_or_resolve(&h))
    }
}

fn is_inside(child: &str, parent: &str) -> bool {
    let rel = np::relative(parent, child);
    !rel.is_empty() && !rel.starts_with("..") && !np::is_absolute(&rel)
}

fn declares_astryx(dir: &str) -> bool {
    let Some(pkg) = read_package_json(dir) else { return false };
    DEPENDENCY_FIELDS.iter().any(|f| match pkg.get(*f) {
        Some(Value::Object(m)) => m
            .keys()
            .any(|n| ASTRYX_SCOPES.iter().any(|s| n.starts_with(s))),
        // A string or array dependency field: Object.keys over its indexes.
        _ => false,
    })
}

/// `findPackageRoot`: the folder of the nearest package.json.
pub fn find_package_root(start: &str) -> Option<String> {
    folders_up_from(start)
        .into_iter()
        .find(|d| np::exists(&np::join2(d, "package.json")))
}

/// `findAstryxProject`.
pub fn find_astryx_project(start: &str) -> Option<String> {
    let home = home_folder();
    for dir in folders_up_from(start) {
        if let Some(h) = &home {
            if &np::real_or_resolve(&dir) == h {
                return None;
            }
        }
        if declares_astryx(&dir) || is_astryx_workspace_member(&dir) {
            return Some(dir);
        }
        if REPOSITORY_MARKERS
            .iter()
            .any(|m| np::exists(&np::join2(&dir, m)))
        {
            return None;
        }
    }
    None
}

/// `findWorkspaceRoot`.
pub fn find_workspace_root(start: &str) -> String {
    let mut nearest: Option<String> = None;
    for dir in folders_up_from(start) {
        if np::exists(&np::join2(&dir, "pnpm-workspace.yaml"))
            || read_package_json(&dir)
                .map(|p| p.get("workspaces").map(|w| !w.is_null()).unwrap_or(false))
                .unwrap_or(false)
        {
            return dir;
        }
        if nearest.is_none() && np::exists(&np::join2(&dir, "package.json")) {
            nearest = Some(dir);
        }
    }
    nearest.unwrap_or_else(|| np::resolve1(start))
}

fn workspace_bound(project: &str) -> String {
    let workspace = find_workspace_root(project);
    if let Some(home) = home_folder() {
        if is_inside(&np::real_or_resolve(project), &home)
            && !is_inside(&np::real_or_resolve(&workspace), &home)
        {
            return project.to_string();
        }
    }
    workspace
}

fn escape_regexp(c: char, out: &mut String) {
    if ".*+?^${}()|[]\\".contains(c) {
        out.push('\\');
    }
    out.push(c);
}

fn brace_list(glob: &[char], start: usize) -> Option<(Vec<String>, usize)> {
    let mut alts = Vec::new();
    let mut depth = 0i32;
    let mut from = start + 1;
    for i in start..glob.len() {
        if glob[i] == '{' {
            depth += 1;
        } else if glob[i] == '}' {
            depth -= 1;
            if depth == 0 {
                alts.push(glob[from..i].iter().collect());
                return Some((alts, i));
            }
        } else if glob[i] == ',' && depth == 1 {
            alts.push(glob[from..i].iter().collect());
            from = i + 1;
        }
    }
    None
}

fn glob_source(glob: &str) -> String {
    let chars: Vec<char> = glob.chars().collect();
    let mut src = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let list = if c == '{' { brace_list(&chars, i) } else { None };
        if c == '*' && chars.get(i + 1) == Some(&'*') {
            if chars.get(i + 2) == Some(&'/') {
                src.push_str("(?:.*/)?");
                i += 2;
            } else {
                src.push_str(".*");
                i += 1;
            }
        } else if c == '*' {
            src.push_str("[^/]*");
        } else if c == '?' {
            src.push_str("[^/]");
        } else if let Some((alts, end)) = list {
            let parts: Vec<String> = alts.iter().map(|a| glob_source(a)).collect();
            src.push_str(&format!("(?:{})", parts.join("|")));
            i = end;
        } else {
            escape_regexp(c, &mut src);
        }
        i += 1;
    }
    src
}

fn workspace_pattern_matches(pattern: &str, rel: &str) -> bool {
    let mut g = pattern.trim();
    while let Some(rest) = g.strip_prefix("./") {
        g = rest;
    }
    let g = g.trim_end_matches('/');
    let src = format!("^{}$", glob_source(g));
    match regress::Regex::new(&src) {
        Ok(re) => re.find(rel).is_some(),
        Err(_) => false,
    }
}

fn pnpm_workspace_patterns(dir: &str) -> Vec<String> {
    let Some(text) = np::read_text(&np::join2(dir, "pnpm-workspace.yaml")) else {
        return vec![];
    };
    let lines: Vec<&str> = split_lines_crlf(&text);
    let is_packages = |l: &str| {
        l.strip_prefix("packages")
            .map(|r| r.trim_start_matches(|c: char| js_ws(c)).starts_with(':'))
            .unwrap_or(false)
    };
    let Some(start) = lines.iter().position(|l| is_packages(l)) else {
        return vec![];
    };
    let unquote = |item: &str| -> String {
        let t = item.trim_matches(js_ws);
        let b: Vec<char> = t.chars().collect();
        if b.len() >= 2 && (b[0] == '\'' || b[0] == '"') && b[b.len() - 1] == b[0] {
            b[1..b.len() - 1].iter().collect()
        } else {
            t.to_string()
        }
    };
    let first = lines[start];
    let after = &first[first.find(':').unwrap() + 1..];
    // .replace(/\s#.*$/, '')
    let mut inline = after.to_string();
    if let Some(pos) = find_ws_hash(&inline) {
        inline.truncate(pos);
    }
    let inline = inline.trim_matches(js_ws).to_string();
    if inline.starts_with('[') {
        let mut s = inline.as_str();
        s = s.strip_prefix('[').unwrap_or(s);
        let s = s.strip_suffix(']').unwrap_or(s);
        return s
            .split(',')
            .map(unquote)
            .filter(|x| !x.is_empty())
            .collect();
    }
    let mut out = Vec::new();
    for line in &lines[start + 1..] {
        let t = line.trim_matches(js_ws);
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        // /^\s*-\s*(.+?)\s*(?:\s#.*)?$/
        let re = regress::Regex::new(r"^\s*-\s*(.+?)\s*(?:\s#.*)?$").unwrap();
        match re.find(line) {
            Some(m) => {
                let g = m.group(1).unwrap();
                out.push(unquote(&line[g]));
            }
            None => break,
        }
    }
    out
}

fn find_ws_hash(s: &str) -> Option<usize> {
    let chars: Vec<(usize, char)> = s.char_indices().collect();
    for w in 0..chars.len().saturating_sub(1) {
        if js_ws(chars[w].1) && chars[w + 1].1 == '#' {
            return Some(chars[w].0);
        }
    }
    None
}

/// JS `\s` / `String#trim` whitespace.
pub fn js_ws(c: char) -> bool {
    matches!(
        c,
        '\u{9}' | '\u{a}' | '\u{b}' | '\u{c}' | '\u{d}' | ' ' | '\u{a0}' | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

/// `text.split(/\r?\n/)`.
pub fn split_lines_crlf(text: &str) -> Vec<&str> {
    text.split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .collect()
}

fn is_workspace_member(dir: &str, root: &str) -> bool {
    let rel = np::relative(root, dir);
    if rel.is_empty() || rel.starts_with("..") || np::is_absolute(&rel) {
        return false;
    }
    let mut patterns: Vec<String> = Vec::new();
    if let Some(pkg) = read_package_json(root) {
        match pkg.get("workspaces") {
            Some(Value::Array(a)) => {
                patterns.extend(a.iter().filter_map(|v| v.as_str().map(String::from)))
            }
            Some(Value::Object(o)) => {
                if let Some(Value::Array(a)) = o.get("packages") {
                    patterns.extend(a.iter().filter_map(|v| v.as_str().map(String::from)))
                }
            }
            _ => {}
        }
    }
    patterns.extend(pnpm_workspace_patterns(root));
    patterns
        .iter()
        .any(|p| !p.starts_with('!') && workspace_pattern_matches(p, &rel))
        && !patterns
            .iter()
            .any(|p| p.starts_with('!') && workspace_pattern_matches(&p[1..], &rel))
}

fn is_astryx_workspace_member(dir: &str) -> bool {
    if !np::exists(&np::join2(dir, "package.json")) {
        return false;
    }
    let root = workspace_bound(dir);
    root != dir && declares_astryx(&root) && is_workspace_member(dir, &root)
}

fn read_folders(start: &str, reach: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for dir in folders_up_from(start) {
        if out.len() >= reach {
            break;
        }
        out.push(dir);
    }
    let searched = out.clone();
    if let Some(project) = find_astryx_project(start) {
        let bound = workspace_bound(&project);
        for dir in folders_up_from(&project) {
            if !searched.contains(&dir) {
                out.push(dir.clone());
            }
            if dir == bound {
                break;
            }
        }
    }
    out
}

fn find_nearby_core_dir(start: &str) -> Option<String> {
    for dir in read_folders(start, CORE_REACH) {
        let source = np::join(&[&dir, "packages", "core"]);
        if is_core_source(&source) {
            return Some(source);
        }
        if let Some(i) = installed_in(&dir, CORE_PACKAGE) {
            return Some(i);
        }
    }
    // Yarn Plug'n'Play: only inside a PnP process, which this never is.
    None
}

/// `findProjectCoreDir`: the project's own Core, never a carried one.
pub fn find_project_core_dir(start: &str) -> Option<String> {
    if let Some(n) = find_nearby_core_dir(start) {
        return Some(n);
    }
    let declaring = super::release::find_declaring_package(start)?;
    if declaring.dir != np::resolve1(start) {
        find_nearby_core_dir(&declaring.dir)
    } else {
        None
    }
}

/// `findCoreDir`: the project's Core, else the Core the answering copy
/// carries (never fetched).
pub fn find_core_dir(start: &str) -> Option<String> {
    find_project_core_dir(start).or_else(|| super::release::carried_core_for(start, false).dir)
}

/// Error codes a Core lookup throws with (`ERROR_CODES`).
#[derive(Debug, Clone, PartialEq)]
pub struct CodedError {
    pub message: String,
    pub code: &'static str,
}

/// `unavailableCoreMessage`.
pub fn unavailable_core_message(found: &super::release::CarriedCore, in_project: bool) -> String {
    let unavailable = found.unavailable.clone().unwrap_or_default();
    let unwritable = unavailable.contains("cannot be written");
    if in_project {
        let core = match &found.version {
            Some(v) => format!("Core {v}"),
            None => "its Core".into(),
        };
        let why = match &found.reason {
            Some(r) if !r.is_empty() => format!(" ({r})"),
            _ => String::new(),
        };
        return format!(
            "This project has no Core installed, and {core} could not be downloaded{why}. Install the project's dependencies{}, then run again.",
            if unwritable { ", or make that folder writable" } else { "" }
        );
    }
    format!(
        "{unavailable}. Outside a project, commands that read Core use the Core of the release that answers; {}.",
        if unwritable {
            "make that folder writable and run again"
        } else {
            "run again when the package registry can be reached"
        }
    )
}

/// `requireCoreDir`. The clone never downloads a release: a carried Core
/// that is not already beside the CLI or in the release cache is reported
/// unavailable with the message the JS CLI prints when it cannot fetch.
pub fn require_core_dir(start: &str) -> Result<String, CodedError> {
    if let Some(d) = find_project_core_dir(start) {
        return Ok(d);
    }
    let found = super::release::carried_core_for(start, true);
    if found.unavailable.is_some() {
        return Err(CodedError {
            message: unavailable_core_message(&found, super::release::run_choice(start).in_project),
            code: "ERR_VERSIONS_UNAVAILABLE",
        });
    }
    if let Some(d) = found.dir {
        return Ok(d);
    }
    Err(CodedError {
        message: "Could not find @astryxdesign/core package".into(),
        code: "ERR_CORE_NOT_FOUND",
    })
}

/// `findCarriedCoreDir`.
pub fn find_carried_core_dir(start: &str, fetch: bool) -> Option<String> {
    super::release::carried_core_for(start, fetch).dir
}

/// `findNodeModulesPackage`: `(packageDir, hostDir)`.
pub fn find_node_modules_package(start: &str, name: &str) -> Option<(String, String)> {
    for dir in folders_up_from(start) {
        if let Some(p) = installed_in(&dir, name) {
            return Some((p, dir));
        }
    }
    None
}

/// `findInstalledPackage(startDir, name, maxDepth = 6)`. `usize::MAX` walks
/// every ancestor.
pub fn find_installed_package(start: &str, name: &str, max_depth: usize) -> Option<String> {
    for dir in read_folders(start, max_depth) {
        if let Some(p) = installed_in(&dir, name) {
            return Some(p);
        }
    }
    None
}

/// `findProjectPackageOf`: `(name, packageDir)`.
pub fn find_project_package_of(start: &str, names: &[&str]) -> Option<(String, String)> {
    let Some(project) = find_astryx_project(start) else {
        let dir = np::resolve1(start);
        for n in names {
            if let Some(p) = installed_in(&dir, n) {
                return Some((n.to_string(), p));
            }
        }
        return None;
    };
    let workspace = workspace_bound(&project);
    let top = if workspace != project && is_workspace_member(&project, &workspace) {
        workspace
    } else {
        project.clone()
    };
    for dir in folders_up_from(&project) {
        for n in names {
            if let Some(p) = installed_in(&dir, n) {
                return Some((n.to_string(), p));
            }
        }
        if dir == top {
            break;
        }
    }
    None
}

/// `findProjectRoot`: the nearest of 5 folders whose package.json has
/// `workspaces`.
pub fn find_project_root(start: &str) -> Option<String> {
    let mut dir = start.to_string();
    for _ in 0..5 {
        let pkg_path = np::join2(&dir, "package.json");
        if np::exists(&pkg_path) {
            if let Some(pkg) = np::read_json(&pkg_path) {
                if js_truthy(pkg.get("workspaces")) {
                    return Some(dir);
                }
            }
        }
        let parent = np::dirname(&dir);
        if parent == dir {
            break;
        }
        dir = parent;
    }
    None
}

/// JS truthiness of an optional JSON value.
pub fn js_truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(true),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// An external Astryx-compatible package (`discoverExternalPackages`).
#[derive(Debug, Clone, PartialEq)]
pub struct ExternalPackage {
    pub name: String,
    pub category: String,
    pub docs_dir: String,
    pub blocks_dir: Option<String>,
}

/// `discoverExternalPackages`.
pub fn discover_external_packages(start: &str) -> Vec<ExternalPackage> {
    let mut out = Vec::new();
    let mut dir = start.to_string();
    let mut nm: Option<String> = None;
    for _ in 0..5 {
        let cand = np::join2(&dir, "node_modules");
        if np::exists(&cand) {
            nm = Some(cand);
            break;
        }
        let parent = np::dirname(&dir);
        if parent == dir {
            break;
        }
        dir = parent;
    }
    let Some(nm) = nm else { return out };
    fn scan(search: &str, out: &mut Vec<ExternalPackage>) {
        if !np::exists(search) {
            return;
        }
        for e in np::list_dir_entries(search).unwrap_or_default() {
            if !e.is_dir {
                continue;
            }
            if e.name.starts_with('.') {
                continue;
            }
            let full = np::join2(search, &e.name);
            if e.name.starts_with('@') {
                scan(&full, out);
                continue;
            }
            let pj = np::join2(&full, "package.json");
            if !np::exists(&pj) {
                continue;
            }
            let Some(pkg) = np::read_json(&pj) else { continue };
            if pkg.get("name").and_then(|v| v.as_str()) == Some(CORE_PACKAGE) {
                continue;
            }
            let Some(ax) = pkg.get("astryx") else { continue };
            if !js_truthy(Some(ax)) || !js_truthy(ax.get("docs")) {
                continue;
            }
            let name = js_string(pkg.get("name"));
            let category = if js_truthy(ax.get("category")) {
                js_string(ax.get("category"))
            } else {
                name.clone()
            };
            out.push(ExternalPackage {
                name,
                category,
                docs_dir: np::resolve(&[&full, &js_string(ax.get("docs"))]),
                blocks_dir: if js_truthy(ax.get("blocks")) {
                    Some(np::resolve(&[&full, &js_string(ax.get("blocks"))]))
                } else {
                    None
                },
            });
        }
    }
    scan(&nm, &mut out);
    out
}

/// `String(value)` for simple JSON values.
pub fn js_string(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => crate::json::js_number_to_string(n.as_f64().unwrap_or(0.0)),
        Some(Value::Array(a)) => a
            .iter()
            .map(|x| match x {
                Value::Null => String::new(),
                o => js_string(Some(o)),
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}

/// `listComponents(coreDir)`: capitalized folders of `src`, sorted.
pub fn list_components(core_dir: &str) -> Vec<String> {
    let src = np::join2(core_dir, "src");
    let Some(entries) = np::read_dir(&src) else { return vec![] };
    let mut v: Vec<String> = entries
        .into_iter()
        .filter(|e| e.is_dir && e.name.chars().next().map(|c| c.is_ascii_uppercase()).unwrap_or(false))
        .map(|e| e.name)
        .collect();
    crate::discovery::jsort::sort_strings(&mut v);
    v
}

/// `existsCaseExact(targetPath, rootDir)`.
pub fn exists_case_exact(target: &str, root: &str) -> bool {
    let rel = np::relative(root, target);
    if rel.is_empty() {
        return np::exists(target);
    }
    if np::is_absolute(&rel) || rel == ".." || rel.starts_with("../") {
        return false;
    }
    if super::listing_cache::active() {
        // Inside an operation the folders' listings answer (see
        // component_discovery::exists_case_exact).
        return match super::listing_cache::find_entry_path(std::path::Path::new(root), std::path::Path::new(&rel)) {
            None => false,
            Some(kind) => !kind.is_some_and(|k| k.is_symlink) || np::exists(target),
        };
    }
    if !np::exists(target) {
        return false;
    }
    let mut dir = root.to_string();
    for seg in rel.split('/') {
        match np::list_dir(&dir) {
            Some(names) if names.iter().any(|n| n == seg) => {}
            _ => return false,
        }
        dir = np::join2(&dir, seg);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn globs() {
        assert!(workspace_pattern_matches("packages/*", "packages/core"));
        assert!(!workspace_pattern_matches("packages/*", "packages/a/b"));
        assert!(workspace_pattern_matches("./apps/**", "apps/a/b"));
        assert!(workspace_pattern_matches("{apps,packages}/*", "apps/x"));
        assert!(workspace_pattern_matches("packages/**/x", "packages/x"));
    }
}
