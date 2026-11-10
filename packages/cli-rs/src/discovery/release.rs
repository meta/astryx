//! Port of the read side of `foundation/release` (`project.mjs` facts,
//! `choose.mjs` choice, `run-context.mjs` carried Core and `answeredBy`,
//! `cache.mjs` cached-release check) and `foundation/env/user-dirs.mjs`.
//!
//! The clone never hands a run off and never downloads a release. Where the
//! JS bin would hand off to the project's own CLI, the clone answers as that
//! CLI would: the copy is `project`.

use super::nodepath as np;
use super::paths::{self, CLI_PACKAGE_NAME, CORE_PACKAGE, REPOSITORY_MARKERS};
use crate::json::{Map, Value};

/// An installed package and its version.
#[derive(Debug, Clone, PartialEq)]
pub struct InstalledPackage {
    pub dir: String,
    pub version: String,
}

fn installed_as(dir: &str, name: &str) -> Option<InstalledPackage> {
    let pkg = np::read_json(&np::join2(dir, "package.json"))?;
    if pkg.get("name").and_then(|v| v.as_str()) != Some(name) {
        return None;
    }
    let version = pkg.get("version")?.as_str()?.to_string();
    Some(InstalledPackage { dir: dir.to_string(), version })
}

fn nearby_read_core(start: &str) -> Option<InstalledPackage> {
    let mut dir = np::resolve1(start);
    for _ in 0..5 {
        if let Some(w) = installed_as(&np::join(&[&dir, "packages", "core"]), CORE_PACKAGE) {
            return Some(w);
        }
        if let Some(i) = installed_as(&np::join(&[&dir, "node_modules", "@astryxdesign", "core"]), CORE_PACKAGE) {
            return Some(i);
        }
        let parent = np::dirname(&dir);
        if parent == dir {
            break;
        }
        dir = parent;
    }
    None
}

/// `findReadCore`.
pub fn find_read_core(start: &str) -> Option<InstalledPackage> {
    if let Some(n) = nearby_read_core(start) {
        return Some(n);
    }
    let d = find_declaring_package(start)?;
    if d.dir != np::resolve1(start) {
        nearby_read_core(&d.dir)
    } else {
        None
    }
}

/// `findProjectCli`.
pub fn find_project_cli(start: &str) -> Option<InstalledPackage> {
    let start = np::resolve1(start);
    if let Some(dir) = paths::find_installed_package(&start, CLI_PACKAGE_NAME, paths::INSTALLED_REACH) {
        return installed_as(&dir, CLI_PACKAGE_NAME);
    }
    let mut at = start;
    for _ in 0..6 {
        if let Some(own) = installed_as(&at, CLI_PACKAGE_NAME)
            .or_else(|| installed_as(&np::join(&[&at, "packages", "cli"]), CLI_PACKAGE_NAME))
        {
            return Some(own);
        }
        let parent = np::dirname(&at);
        if parent == at {
            break;
        }
        at = parent;
    }
    None
}

/// A package.json that declares the Core or the CLI.
#[derive(Debug, Clone, PartialEq)]
pub struct DeclaringPackage {
    pub dir: String,
    pub core: Option<String>,
    pub cli: Option<String>,
}

fn declared_ranges(pkg: Option<&Value>) -> (Option<String>, Option<String>) {
    let mut core = None;
    let mut cli = None;
    let pkg = match pkg {
        Some(v @ (Value::Object(_) | Value::Array(_))) => v,
        _ => return (None, None),
    };
    for f in paths::DEPENDENCY_FIELDS {
        let Some(deps) = pkg.get(f) else { continue };
        if !paths::js_truthy(Some(deps)) || !deps.is_object() {
            continue;
        }
        if core.is_none() {
            if let Some(Value::String(s)) = deps.get(CORE_PACKAGE) {
                core = Some(s.clone());
            }
        }
        if cli.is_none() {
            if let Some(Value::String(s)) = deps.get(CLI_PACKAGE_NAME) {
                cli = Some(s.clone());
            }
        }
    }
    (core, cli)
}

/// `findDeclaringPackage`.
pub fn find_declaring_package(start: &str) -> Option<DeclaringPackage> {
    let home = np::resolve1(&np::homedir());
    let start = np::resolve1(start);
    let mut dir = start.clone();
    loop {
        if dir != home || dir == start {
            let pkg = np::read_json(&np::join2(&dir, "package.json"));
            let (core, cli) = declared_ranges(pkg.as_ref());
            if core.is_some() || cli.is_some() {
                return Some(DeclaringPackage { dir, core, cli });
            }
        }
        if REPOSITORY_MARKERS.iter().any(|m| np::exists(&np::join2(&dir, m))) {
            return None;
        }
        let parent = np::dirname(&dir);
        if parent == dir {
            return None;
        }
        dir = parent;
    }
}

const LOCKFILES: [&str; 5] = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"];

/// `findLockfile`.
pub fn find_lockfile(member: &str) -> Option<String> {
    let mut dir = np::resolve1(member);
    loop {
        for n in LOCKFILES {
            let f = np::join2(&dir, n);
            if np::exists(&f) {
                return Some(f);
            }
        }
        if REPOSITORY_MARKERS.iter().any(|m| np::exists(&np::join2(&dir, m))) {
            return None;
        }
        let parent = np::dirname(&dir);
        if parent == dir {
            return None;
        }
        dir = parent;
    }
}

fn escape_re(s: &str) -> String {
    let mut o = String::new();
    for c in s.chars() {
        if ".*+?^${}()|[]\\/".contains(c) {
            o.push('\\');
        }
        o.push(c);
    }
    o
}

fn clean_version(v: &str) -> Option<String> {
    let v = v.strip_prefix("npm:").unwrap_or(v);
    let v = match v.find('(') {
        Some(i) => &v[..i],
        None => v,
    };
    let re = regress::Regex::new(r"^\d+\.\d+\.\d+").unwrap();
    re.find(v).map(|_| v.to_string())
}

fn re_find<'a>(re: &str, text: &'a str, group: usize) -> Option<&'a str> {
    let r = regress::Regex::new(re).ok()?;
    let m = r.find(text)?;
    m.group(group).map(|g| &text[g])
}

/// `lockedVersion`.
pub fn locked_version(lockfile: &str, member: &str, name: &str, range: Option<&str>) -> Option<String> {
    let text = np::read_text(lockfile)?;
    let base = np::basename(lockfile);
    let rel = np::relative(&np::dirname(lockfile), member);
    if base == "package-lock.json" || base == "npm-shrinkwrap.json" {
        let lock = np::parse_json(&text);
        if let Some(Value::Object(pk)) = lock.as_ref().and_then(|l| l.get("packages")) {
            let keys = [
                if rel.is_empty() { None } else { Some(format!("{rel}/node_modules/{name}")) },
                Some(format!("node_modules/{name}")),
            ];
            for k in keys.into_iter().flatten() {
                if let Some(Value::String(v)) = pk.get(&k).and_then(|e| e.get("version")) {
                    return Some(v.clone());
                }
            }
        }
        return lock
            .as_ref()
            .and_then(|l| l.get("dependencies"))
            .and_then(|d| d.get(name))
            .and_then(|e| e.get("version"))
            .and_then(|v| v.as_str())
            .map(String::from);
    }
    if base == "pnpm-lock.yaml" {
        let lines = paths::split_lines_crlf(&text);
        let importer = if rel.is_empty() { ".".to_string() } else { rel.clone() };
        let mut in_importers = false;
        let mut in_this = false;
        let imp_re = regress::Regex::new(r#"^ {2}(?! )(['"]?)(.+?)\1:\s*$"#).unwrap();
        let dep_re = regress::Regex::new(&format!(r#"^ {{6}}(['"]?){}\1:\s*$"#, escape_re(name))).unwrap();
        let mut i = 0;
        while i < lines.len() {
            let line = lines[i];
            if re_find(r"^importers:\s*$", line, 0).is_some() {
                in_importers = true;
                i += 1;
                continue;
            }
            if in_importers && re_find(r"^\S", line, 0).is_some() {
                break;
            }
            if !in_importers {
                i += 1;
                continue;
            }
            if let Some(m) = imp_re.find(line) {
                in_this = &line[m.group(2).unwrap()] == importer;
                i += 1;
                continue;
            }
            if !in_this || dep_re.find(line).is_none() {
                i += 1;
                continue;
            }
            let mut j = i + 1;
            while j < lines.len() && lines[j].starts_with("        ") {
                if let Some(v) = re_find(r#"^ {8}version:\s*['"]?([^'"\s(]+)"#, lines[j], 1) {
                    return clean_version(v);
                }
                j += 1;
            }
            i += 1;
        }
        let key = format!(r#"^ {{2}}['"]?/?{}[@/](\d[^:'"\s(]*)"#, escape_re(name));
        let r = regress::Regex::with_flags(&key, "m").ok()?;
        let m = r.find(&text)?;
        return clean_version(&text[m.group(1).unwrap()]);
    }
    if base == "yarn.lock" {
        let blocks = split_yarn_blocks(&text);
        let mut versions = Vec::new();
        for block in blocks {
            let lines = paths::split_lines_crlf(block);
            let head = lines[0];
            let head = regress::Regex::new(r":\s*$").unwrap().find(head).map(|m| &head[..m.start()]).unwrap_or(head);
            let descriptors: Vec<String> = head
                .split(',')
                .map(|d| {
                    let d = d.trim_matches(paths::js_ws);
                    let d = d.strip_prefix('"').unwrap_or(d);
                    d.strip_suffix('"').unwrap_or(d).to_string()
                })
                .collect();
            let ours: Vec<&String> = descriptors
                .iter()
                .filter(|d| d.starts_with(&format!("{name}@")) && !d.starts_with(&format!("{name}@patch:")))
                .collect();
            if ours.is_empty() {
                continue;
            }
            let vline = lines[1..].iter().find(|l| re_find(r"^\s+version:?\s", l, 0).is_some());
            let version = vline.and_then(|l| re_find(r#"version:?\s+"?([^"\s]+)"?"#, l, 1)).and_then(clean_version);
            let Some(version) = version else { continue };
            if let Some(r) = range {
                if ours.iter().any(|d| **d == format!("{name}@{r}") || **d == format!("{name}@npm:{r}")) {
                    return Some(version);
                }
            }
            versions.push(version);
        }
        return if versions.len() == 1 { versions.pop() } else { None };
    }
    if base == "bun.lock" {
        let re = format!(r#""{}"\s*:\s*\[\s*"{}@([^"]+)""#, escape_re(name), escape_re(name));
        return re_find(&re, &text, 1).and_then(clean_version);
    }
    None
}

/// `text.split(/\r?\n(?=\S)/)`.
fn split_yarn_blocks(text: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    let b = text.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\n' {
            let next = text[i + 1..].chars().next();
            if next.map(|c| !paths::js_ws(c)).unwrap_or(false) {
                let end = if i > start && b[i - 1] == b'\r' { i - 1 } else { i };
                out.push(&text[start..end]);
                start = i + 1;
            }
        }
        i += 1;
    }
    out.push(&text[start..]);
    out
}

/// `ReleaseFacts`.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ReleaseFacts {
    pub in_project: bool,
    pub core: Option<InstalledPackage>,
    pub cli: Option<InstalledPackage>,
    pub declaring_dir: Option<String>,
    pub declared_core_range: Option<String>,
    pub declared_cli_range: Option<String>,
    pub locked_core_version: Option<String>,
    pub locked_cli_version: Option<String>,
}

/// `readReleaseFacts`.
pub fn read_release_facts(start: &str) -> ReleaseFacts {
    let declaring = find_declaring_package(start);
    let from_root = declaring.as_ref().filter(|d| d.dir != np::resolve1(start)).map(|d| d.dir.clone());
    let core = find_read_core(start);
    let cli = find_project_cli(start).or_else(|| from_root.as_deref().and_then(find_project_cli));
    let mut lc = None;
    let mut lcli = None;
    if let Some(d) = &declaring {
        if core.is_none() || cli.is_none() {
            if let Some(lf) = find_lockfile(&d.dir) {
                lc = d.core.as_deref().and_then(|r| locked_version(&lf, &d.dir, CORE_PACKAGE, Some(r)));
                lcli = d.cli.as_deref().and_then(|r| locked_version(&lf, &d.dir, CLI_PACKAGE_NAME, Some(r)));
            }
        }
    }
    ReleaseFacts {
        in_project: core.is_some() || cli.is_some() || declaring.is_some(),
        core,
        cli,
        declaring_dir: declaring.as_ref().map(|d| d.dir.clone()),
        declared_core_range: declaring.as_ref().and_then(|d| d.core.clone()),
        declared_cli_range: declaring.as_ref().and_then(|d| d.cli.clone()),
        locked_core_version: lc,
        locked_cli_version: lcli,
    }
}

/// `isReleaseVersion`.
pub fn is_release_version(v: Option<&str>) -> bool {
    let re = regress::Regex::new(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$").unwrap();
    v.map(|s| re.find(s).is_some()).unwrap_or(false)
}

/// The release choice for a folder (`ReleaseChoice`).
#[derive(Debug, Clone, PartialEq)]
pub struct ReleaseChoice {
    /// `project` | `starting` | `matched` | `carried` | `fallback`.
    pub copy: String,
    pub version: String,
    pub core_version: Option<String>,
    pub in_project: bool,
    pub unavailable: Option<String>,
}

/// `runningCopy(CLI_ROOT).version`.
pub fn cli_version() -> String {
    let pkg = np::read_json(&np::join2(paths::cli_root(), "package.json"));
    match pkg.as_ref().and_then(|p| p.get("version")) {
        None | Some(Value::Null) => "0.0.0".into(),
        Some(v) => paths::js_string(Some(v)),
    }
}

/// `projectRootOf`.
pub fn project_root_of(f: &ReleaseFacts) -> Option<String> {
    if let Some(d) = &f.declaring_dir {
        return Some(d.clone());
    }
    let dir = f.core.as_ref().or(f.cli.as_ref())?.dir.clone();
    let r = np::resolve1(&dir);
    let parts: Vec<&str> = r.split('/').collect();
    if let Some(at) = parts.iter().position(|p| *p == "node_modules") {
        if at > 0 {
            let j = parts[..at].join("/");
            return Some(if j.is_empty() { "/".into() } else { j });
        }
    }
    Some(np::dirname(&np::dirname(&dir)))
}

fn inside_no_nm(child: &str, parent: Option<&str>) -> bool {
    let Some(parent) = parent else { return false };
    let p = np::real_or_resolve(parent);
    let rel = np::relative(&p, child);
    if rel.is_empty() || rel.starts_with("..") || np::is_absolute(&rel) {
        return false;
    }
    !rel.split('/').any(|s| s == "node_modules")
}

pub fn core_version_of(f: &ReleaseFacts) -> Option<String> {
    if let Some(c) = &f.core {
        return Some(c.version.clone());
    }
    if is_release_version(f.locked_core_version.as_deref()) {
        return f.locked_core_version.clone();
    }
    f.declared_core_range.as_deref().and_then(exact_version)
}

fn exact_version(spec: &str) -> Option<String> {
    let t = spec.trim_matches(paths::js_ws);
    let t = t.strip_prefix('=').unwrap_or(t);
    let t = t.strip_prefix('v').unwrap_or(t);
    if is_release_version(Some(t)) {
        Some(t.to_string())
    } else {
        None
    }
}

fn cli_bin_of(cli_dir: &str) -> Option<String> {
    let pkg = np::read_json(&np::join2(cli_dir, "package.json"))?;
    let bin = match pkg.get("bin") {
        Some(Value::String(s)) => s.clone(),
        Some(o @ Value::Object(_)) => o.get("astryx")?.as_str()?.to_string(),
        _ => return None,
    };
    let f = np::join2(cli_dir, &bin);
    if np::exists(&f) {
        Some(f)
    } else {
        None
    }
}

/// The choice for a run in `cwd` (`runChoice`). Computer-level commands
/// (`init --user`, `docs global`) pass `computer`.
pub fn choose_release(cwd: &str, computer: bool) -> ReleaseChoice {
    let self_root = paths::cli_root();
    let self_version = cli_version();
    let facts = if computer { ReleaseFacts::default() } else { read_release_facts(cwd) };
    let self_real = np::real_or_resolve(self_root);
    if !facts.in_project {
        return ReleaseChoice {
            copy: "carried".into(),
            version: self_version,
            core_version: None,
            in_project: false,
            unavailable: None,
        };
    }
    let Some(cli) = facts.cli.clone() else {
        let inside = inside_no_nm(&self_real, project_root_of(&facts).as_deref());
        return ReleaseChoice {
            copy: if inside { "project".into() } else { "starting".into() },
            version: self_version,
            core_version: core_version_of(&facts),
            in_project: true,
            unavailable: None,
        };
    };
    if np::real_or_resolve(&cli.dir) == self_real || cli_bin_of(&cli.dir).is_some() {
        // Answered by the project's own CLI (directly, or after the hand-off
        // the JS bin makes).
        return ReleaseChoice {
            copy: "project".into(),
            version: cli.version.clone(),
            core_version: facts.core.as_ref().map(|c| c.version.clone()),
            in_project: true,
            unavailable: None,
        };
    }
    let version = facts
        .core
        .as_ref()
        .map(|c| c.version.clone())
        .or_else(|| facts.locked_core_version.clone().filter(|v| is_release_version(Some(v))))
        .or_else(|| facts.declared_core_range.as_deref().and_then(exact_version))
        .or_else(|| Some(cli.version.clone()));
    let core_version = facts.core.as_ref().map(|c| c.version.clone()).or(version.clone());
    if version.is_none() || version.as_deref() == Some(self_version.as_str()) {
        if inside_no_nm(&self_real, project_root_of(&facts).as_deref()) {
            return ReleaseChoice {
                copy: "project".into(),
                version: self_version,
                core_version: facts.core.as_ref().map(|c| c.version.clone()),
                in_project: true,
                unavailable: None,
            };
        }
    }
    ReleaseChoice {
        copy: "matched".into(),
        version: version.unwrap_or(self_version),
        core_version,
        in_project: true,
        unavailable: None,
    }
}

/// `isComputerLevel(argv)`.
pub fn is_computer_level(argv: &[String]) -> bool {
    let mut words: Vec<&str> = Vec::new();
    let mut i = 0;
    while i < argv.len() && words.len() < 2 {
        let a = argv[i].as_str();
        if matches!(a, "--lang" | "--detail" | "--depth") {
            i += 2;
            continue;
        }
        if !a.starts_with('-') {
            words.push(a);
        }
        i += 1;
    }
    match words.first() {
        Some(&"init") => argv.iter().any(|a| a == "--user"),
        Some(&"docs") => words.get(1).map(|t| *t == "global" || t.starts_with("global/")).unwrap_or(false),
        _ => false,
    }
}

/// `runChoice(cwd)` for this process's argv.
pub fn run_choice(cwd: &str) -> ReleaseChoice {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    choose_release(cwd, is_computer_level(&argv))
}

/// `userCacheDir()` (Linux; macOS layout on macOS).
pub fn user_cache_dir() -> String {
    let home = np::homedir();
    if cfg!(target_os = "macos") {
        return np::join(&[&home, "Library", "Caches", "astryx"]);
    }
    let xdg = std::env::var("XDG_CACHE_HOME").ok().filter(|v| !v.is_empty() && np::is_absolute(v));
    np::join(&[&xdg.unwrap_or_else(|| np::join2(&home, ".cache")), "astryx"])
}

/// `userConfigDir()`.
pub fn user_config_dir() -> String {
    let home = np::homedir();
    if cfg!(target_os = "macos") {
        return np::join(&[&home, "Library", "Application Support", "astryx"]);
    }
    let xdg = std::env::var("XDG_CONFIG_HOME").ok().filter(|v| !v.is_empty() && np::is_absolute(v));
    np::join(&[&xdg.unwrap_or_else(|| np::join2(&home, ".config")), "astryx"])
}

/// `isInReleaseCache(dir)`.
pub fn is_in_release_cache(dir: &str) -> bool {
    let releases = np::real_or_resolve(&np::join2(&user_cache_dir(), "releases"));
    let rel = np::relative(&releases, &np::real_or_resolve(dir));
    !(rel.is_empty() || rel.starts_with("..") || np::is_absolute(&rel))
}

fn sha256_hex(file: &str) -> Option<String> {
    use sha2::Digest;
    let bytes = std::fs::read(file).ok()?;
    let d = sha2::Sha256::digest(&bytes);
    Some(d.iter().map(|b| format!("{b:02x}")).collect())
}

fn tree_size(dir: &str) -> Option<(u64, u64)> {
    let mut count = 0;
    let mut bytes = 0;
    fn walk(d: &str, c: &mut u64, b: &mut u64) -> Option<()> {
        for e in np::read_dir(d)? {
            let p = np::join2(d, &e.name);
            if e.is_dir {
                walk(&p, c, b)?;
            } else {
                *c += 1;
                *b += std::fs::metadata(&p).ok()?.len();
            }
        }
        Some(())
    }
    walk(dir, &mut count, &mut bytes)?;
    Some((count, bytes))
}

/// `cachedRelease(version)`: the cached release's Core folder, when the
/// release is installed and verified.
pub fn cached_release_core(version: &str) -> Option<String> {
    if !is_release_version(Some(version)) {
        return None;
    }
    let dir = np::join(&[&user_cache_dir(), "releases", version]);
    let marker = np::read_json(&np::join2(&dir, "release.json"))?;
    if marker.get("version").and_then(|v| v.as_str()) != Some(version) {
        return None;
    }
    let files = marker.get("files")?;
    if !paths::js_truthy(Some(files)) {
        return None;
    }
    let cli_dir = np::join(&[&dir, "node_modules", "@astryxdesign", "cli"]);
    let core_dir = np::join(&[&dir, "node_modules", "@astryxdesign", "core"]);
    let bin = cli_bin_of(&cli_dir)?;
    for rel in [
        "node_modules/@astryxdesign/cli/package.json".to_string(),
        "node_modules/@astryxdesign/core/package.json".to_string(),
        np::relative(&dir, &bin),
    ] {
        let want = files.get(&rel)?.as_str()?;
        if sha256_hex(&np::join2(&dir, &rel)).as_deref() != Some(want) {
            return None;
        }
    }
    let tree = match (tree_size(&cli_dir), tree_size(&core_dir)) {
        (Some((cc, cb)), Some((oc, ob))) => {
            let mut m = Map::new();
            let mut c = Map::new();
            c.insert("count".into(), Value::from(cc));
            c.insert("bytes".into(), Value::from(cb));
            let mut o = Map::new();
            o.insert("count".into(), Value::from(oc));
            o.insert("bytes".into(), Value::from(ob));
            m.insert("cli".into(), Value::Object(c));
            m.insert("core".into(), Value::Object(o));
            Value::Object(m)
        }
        _ => Value::Null,
    };
    let recorded = marker.get("tree").cloned().unwrap_or(Value::Null);
    if crate::json::stringify(&tree, 0) != crate::json::stringify(&recorded, 0) {
        return None;
    }
    Some(core_dir)
}

/// The carried Core (`carriedCore` result).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct CarriedCore {
    pub dir: Option<String>,
    pub unavailable: Option<String>,
    pub version: Option<String>,
    pub reason: Option<String>,
}

/// `carriedCore({fetch})`. The clone cannot install a release; with `fetch`
/// and nothing cached it reports the release unavailable.
pub fn carried_core(fetch: bool) -> CarriedCore {
    let version = cli_version();
    let beside = np::resolve(&[paths::cli_root(), "..", "core"]);
    if let Some(pkg) = np::read_json(&np::join2(&beside, "package.json")) {
        if pkg.get("name").and_then(|v| v.as_str()) == Some(CORE_PACKAGE)
            && pkg.get("version").and_then(|v| v.as_str()) == Some(version.as_str())
        {
            return CarriedCore { dir: Some(beside), ..Default::default() };
        }
    }
    if let Some(c) = cached_release_core(&version) {
        return CarriedCore { dir: Some(c), ..Default::default() };
    }
    if !fetch {
        return CarriedCore::default();
    }
    let reason = "the Rust clone does not download releases".to_string();
    CarriedCore {
        dir: None,
        unavailable: Some(format!("Core {version} could not be installed: {reason}")),
        version: Some(version),
        reason: Some(reason),
    }
}

/// `carriedCoreFor(startDir, fetch)` in paths.mjs.
pub fn carried_core_for(start: &str, fetch: bool) -> CarriedCore {
    let carried = carried_core(false);
    if carried.dir.is_none() && !fetch {
        return carried;
    }
    if run_choice(start).copy == "project" {
        return CarriedCore::default();
    }
    if carried.dir.is_some() {
        carried
    } else {
        carried_core(true)
    }
}

/// `answeredBy(cwd)`: `{cli, core, copy}`.
pub fn answered_by(cwd: &str) -> Value {
    let choice = run_choice(cwd);
    let mut core = find_read_core(cwd).map(|c| c.version);
    if core.is_none() && choice.copy != "project" {
        if let Some(d) = carried_core(false).dir {
            core = np::read_json(&np::join2(&d, "package.json"))
                .and_then(|p| p.get("version").and_then(|v| v.as_str()).map(String::from));
        }
    }
    let mut m = Map::new();
    m.insert("cli".into(), Value::String(cli_version()));
    m.insert("core".into(), core.map(Value::String).unwrap_or(Value::Null));
    m.insert("copy".into(), Value::String(choice.copy));
    Value::Object(m)
}

/// `isOutsideProject(cwd)` (env/project-scope.mjs).
pub fn is_outside_project(cwd: &str) -> bool {
    !run_choice(cwd).in_project
}
