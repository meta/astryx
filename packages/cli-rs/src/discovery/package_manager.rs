//! Port of `foundation/env/package-manager.mjs` and `cli-command.mjs`:
//! package-manager detection, the CLI invocation every printed command
//! starts with, `{@pm}` doc rendering choice, and shell quoting.

use super::nodepath as np;
use super::paths;
use super::release;
use crate::json::Value;
use std::cell::RefCell;
use std::collections::HashMap;

const KNOWN_PMS: [&str; 4] = ["yarn", "pnpm", "bun", "npm"];
const LOCKFILES: [(&str, &[&str]); 4] = [
    ("yarn", &["yarn.lock"]),
    ("pnpm", &["pnpm-lock.yaml"]),
    ("bun", &["bun.lockb", "bun.lock"]),
    ("npm", &["package-lock.json"]),
];
const PROJECT_EVIDENCE: [(&str, &[&str]); 3] = [
    ("pnpm", &["pnpm-workspace.yaml"]),
    ("yarn", &[".yarnrc.yml", ".yarnrc"]),
    ("bun", &["bunfig.toml"]),
];

/// The published CLI package name.
pub const CLI_PACKAGE: &str = "@astryxdesign/cli";
/// The CLI binary name.
pub const CLI_BIN: &str = "astryx";

/// A lockfile found on disk.
#[derive(Debug, Clone, PartialEq)]
pub struct FoundLockfile {
    pub pm: &'static str,
    pub file: &'static str,
}

/// `PackageManagerResolution`.
#[derive(Debug, Clone, PartialEq)]
pub struct PackageManagerResolution {
    /// `yarn` | `pnpm` | `bun` | `npm` | `npx` (nothing detected / ambiguous).
    pub pm: String,
    pub ambiguous: bool,
    pub dir: Option<String>,
    pub candidates: Vec<String>,
    pub declared: Option<String>,
    /// `declared` | `lockfile` | `evidence` | `runner` | `none`.
    pub source: &'static str,
    pub stray_lockfiles: Vec<FoundLockfile>,
    /// Every lockfile in `dir` (decidePackageManagerIn's `lockfiles`).
    pub lockfiles: Vec<FoundLockfile>,
}

fn declared_package_manager(dir: &str) -> Option<String> {
    let pj = np::join2(dir, "package.json");
    if !np::exists(&pj) {
        return None;
    }
    let pkg = np::read_json(&pj)?;
    let field = match pkg.get("packageManager") {
        None | Some(Value::Null) => String::new(),
        v => paths::js_string(v),
    };
    let name = field.split('@').next().unwrap_or("").to_string();
    if KNOWN_PMS.contains(&name.as_str()) {
        Some(name)
    } else {
        None
    }
}

fn user_agent() -> String {
    std::env::var("npm_config_user_agent").unwrap_or_default()
}

fn running_package_manager() -> Option<String> {
    let ua = user_agent();
    let name = ua.split('/').next().unwrap_or("").to_string();
    if KNOWN_PMS.contains(&name.as_str()) {
        Some(name)
    } else {
        None
    }
}

fn lockfiles_in(dir: &str) -> Vec<FoundLockfile> {
    let mut out = Vec::new();
    for (pm, names) in LOCKFILES {
        if let Some(f) = names.iter().find(|n| np::exists(&np::join2(dir, n))) {
            out.push(FoundLockfile { pm, file: f });
        }
    }
    out
}

fn evidence_in(dir: &str) -> Vec<&'static str> {
    PROJECT_EVIDENCE
        .iter()
        .filter(|(_, names)| names.iter().any(|n| np::exists(&np::join2(dir, n))))
        .map(|(pm, _)| *pm)
        .collect()
}

/// `decidePackageManagerIn(dir)`.
pub fn decide_package_manager_in(dir: &str) -> Option<PackageManagerResolution> {
    let locks = lockfiles_in(dir);
    let candidates: Vec<String> = locks.iter().map(|l| l.pm.to_string()).collect();
    let declared = declared_package_manager(dir);
    let base = |pm: String, source: &'static str, ambiguous: bool| PackageManagerResolution {
        pm,
        ambiguous,
        dir: Some(dir.to_string()),
        candidates: candidates.clone(),
        declared: None,
        source,
        stray_lockfiles: vec![],
        lockfiles: locks.clone(),
    };
    if let Some(d) = declared {
        let mut r = base(d.clone(), "declared", false);
        r.stray_lockfiles = locks.iter().filter(|l| l.pm != d).cloned().collect();
        r.declared = Some(d);
        return Some(r);
    }
    if locks.len() == 1 {
        return Some(base(locks[0].pm.into(), "lockfile", false));
    }
    if locks.len() > 1 {
        let ev: Vec<&str> = evidence_in(dir).into_iter().filter(|pm| candidates.iter().any(|c| c == pm)).collect();
        if ev.len() == 1 {
            return Some(base(ev[0].into(), "evidence", false));
        }
        return Some(base("npx".into(), "none", true));
    }
    None
}

/// `explainPackageManager(targetDir)`.
pub fn explain_package_manager(target: Option<&str>) -> PackageManagerResolution {
    let mut dir = np::resolve1(target.unwrap_or("."));
    while dir != "/" {
        if let Some(d) = decide_package_manager_in(&dir) {
            return d;
        }
        dir = np::dirname(&dir);
    }
    let running = running_package_manager();
    PackageManagerResolution {
        pm: running.clone().unwrap_or_else(|| "npx".into()),
        ambiguous: false,
        dir: None,
        candidates: vec![],
        declared: None,
        source: if running.is_some() { "runner" } else { "none" },
        stray_lockfiles: vec![],
        lockfiles: vec![],
    }
}

/// `detectPackageManager(targetDir)`.
pub fn detect_package_manager(target: Option<&str>) -> String {
    explain_package_manager(target).pm
}

/// `getRunPrefix(targetDir)`.
pub fn get_run_prefix(target: Option<&str>) -> &'static str {
    match detect_package_manager(target).as_str() {
        "yarn" => "yarn",
        "pnpm" => "pnpm exec",
        "bun" => "bunx",
        _ => "npx",
    }
}

/// `getDlxPrefix(targetDir)`.
pub fn get_dlx_prefix(target: Option<&str>) -> &'static str {
    let r = explain_package_manager(target);
    match r.pm.as_str() {
        "yarn" => {
            if is_yarn_classic(&r) {
                "npx"
            } else {
                "yarn dlx"
            }
        }
        "pnpm" => "pnpm dlx",
        "bun" => "bunx",
        _ => "npx",
    }
}

fn first_match(re: &str, text: &str, flags: &str) -> Option<Vec<Option<String>>> {
    let r = regress::Regex::with_flags(re, flags).ok()?;
    let m = r.find(text)?;
    Some(m.groups().map(|g| g.map(|g| text[g].to_string())).collect())
}

fn is_yarn_classic(r: &PackageManagerResolution) -> bool {
    if let Some(dir) = &r.dir {
        if let Some(major) = declared_yarn_major(dir) {
            return major == 1.0;
        }
        let lock = np::join2(dir, "yarn.lock");
        if np::exists(&lock) {
            let head = read_head(&lock);
            if first_match(r"^# yarn lockfile v1\b", &head, "m").is_some() {
                return true;
            }
            if first_match(r"^__metadata:", &head, "m").is_some() {
                return false;
            }
        }
        if np::exists(&np::join2(dir, ".yarnrc.yml")) {
            return false;
        }
        if np::exists(&np::join2(dir, ".yarnrc")) {
            return true;
        }
    }
    match first_match(r"^yarn\/(\d+)\.", &user_agent(), "") {
        Some(g) => g[1].as_deref() == Some("1"),
        None => false,
    }
}

fn declared_yarn_major(dir: &str) -> Option<f64> {
    let pkg = np::read_json(&np::join2(dir, "package.json"))?;
    let field = match pkg.get("packageManager") {
        None | Some(Value::Null) => String::new(),
        v => paths::js_string(v),
    };
    let g = first_match(r"^yarn@(\d+)(?:[.+]|$)", &field, "")?;
    g[1].as_deref().map(super::semver::js_number)
}

fn read_head(file: &str) -> String {
    use std::io::Read;
    let Ok(mut f) = std::fs::File::open(file) else { return String::new() };
    let mut buf = vec![0u8; 512];
    let n = f.read(&mut buf).unwrap_or(0);
    String::from_utf8_lossy(&buf[..n]).into_owned()
}

/// `isCliOneOff()`: never, for the clone's own binary path; kept for parity.
pub fn is_cli_one_off() -> bool {
    let entry = std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    first_match(r"\/_npx\/|\/dlx[-/]|\/\.bun\/install\/cache\/|\/bunx-", &entry, "").is_some()
}

/// `cliBinResolves(targetDir)`.
pub fn cli_bin_resolves(target: Option<&str>) -> bool {
    let mut dir = np::resolve1(target.unwrap_or("."));
    loop {
        let bin = np::join(&[&dir, "node_modules", ".bin"]);
        if ["astryx", "astryx.cmd", "astryx.ps1"].iter().any(|n| np::exists(&np::join2(&bin, n))) {
            return true;
        }
        let parent = np::dirname(&dir);
        if parent == dir {
            return false;
        }
        dir = parent;
    }
}

/// One integration's declared `cliCommand`.
#[derive(Debug, Clone, PartialEq)]
pub struct DeclaredCliCommand {
    pub package: String,
    pub command: String,
}

thread_local! {
    static DECLARED: RefCell<HashMap<String, Vec<DeclaredCliCommand>>> = RefCell::new(HashMap::new());
    static DOOR: RefCell<Option<String>> = const { RefCell::new(None) };
}

fn project_key(dir: &str) -> String {
    let start = np::resolve1(dir);
    let mut cur = start.clone();
    loop {
        if np::exists(&np::join2(&cur, "package.json")) {
            return cur;
        }
        let parent = np::dirname(&cur);
        if parent == cur {
            return start;
        }
        cur = parent;
    }
}

/// `recordDeclaredCliCommands(projectDir, ...)`; Project.load calls it.
pub fn record_declared_cli_commands(project_dir: &str, declared: Vec<DeclaredCliCommand>) {
    DECLARED.with(|d| d.borrow_mut().insert(project_key(project_dir), declared));
}

/// `hasRecordedProject(targetDir)`.
pub fn has_recorded_project(target: Option<&str>) -> bool {
    DECLARED.with(|d| d.borrow().contains_key(&project_key(target.unwrap_or("."))))
}

/// `declaredCliCommand(targetDir)`: `(command, conflict, declared)`.
pub fn declared_cli_command(target: Option<&str>) -> (Option<String>, bool, Vec<DeclaredCliCommand>) {
    let declared = DECLARED.with(|d| d.borrow().get(&project_key(target.unwrap_or("."))).cloned().unwrap_or_default());
    let mut set: Vec<&str> = Vec::new();
    for e in &declared {
        if !set.contains(&e.command.as_str()) {
            set.push(&e.command);
        }
    }
    if set.len() == 1 {
        return (Some(declared[0].command.clone()), false, declared.clone());
    }
    (None, set.len() > 1, declared.clone())
}

/// `runWithCliDoor`: set (or clear) the host door.
pub fn set_cli_door(door: Option<String>) {
    DOOR.with(|d| *d.borrow_mut() = door);
}

fn cli_door() -> Option<String> {
    DOOR.with(|d| d.borrow().clone())
}

/// Where a printed command runs, for `getCliInvocation` options.
#[derive(Debug, Clone, Default)]
pub struct InvocationOptions {
    pub installed: bool,
    /// `{version, own}` of another project's release.
    pub release: Option<(String, bool)>,
}

/// `getCliInvocation(targetDir)`.
pub fn get_cli_invocation(target: Option<&str>) -> String {
    get_cli_invocation_with(target, &InvocationOptions::default())
}

/// `getCliInvocation(targetDir, {installed, release})`.
pub fn get_cli_invocation_with(target: Option<&str>, opts: &InvocationOptions) -> String {
    let (cmd, conflict, _) = declared_cli_command(target);
    if let Some(c) = cmd {
        return c;
    }
    let guess = || {
        let own = opts.release.as_ref().map(|r| r.1).unwrap_or(false);
        if opts.installed || (own && cli_bin_resolves(target)) {
            format!("{} {CLI_BIN}", get_run_prefix(target))
        } else if let Some((v, _)) = &opts.release {
            format!("{} {CLI_PACKAGE}@{v}", get_dlx_prefix(target))
        } else {
            guess_cli_invocation(target)
        }
    };
    if conflict {
        return guess();
    }
    cli_door().unwrap_or_else(guess)
}

/// `guessCliInvocation(targetDir)`.
pub fn guess_cli_invocation(target: Option<&str>) -> String {
    let choice = release::run_choice(&np::cwd());
    if choice.copy == "project" && !is_cli_one_off() && cli_bin_resolves(target) {
        return format!("{} {CLI_BIN}", get_run_prefix(target));
    }
    if !choice.in_project && (is_global_copy(paths::cli_root()) || release::is_in_release_cache(paths::cli_root())) {
        return CLI_BIN.into();
    }
    format!("{} {CLI_PACKAGE}@{}", get_dlx_prefix(target), release::cli_version())
}

/// `isGlobalCopy(cliRoot)` (choose.mjs), for Linux and macOS.
/// `installPlaceOf(root)`: whether a CLI root is a runner's temporary copy,
/// and the folder whose `node_modules` holds it.
#[derive(Debug, Clone, PartialEq)]
pub struct InstallPlace {
    pub runner: bool,
    pub owner: Option<String>,
    pub known_global: bool,
}

/// `installPlaceOf(root)`.
pub fn install_place_of(root: &str) -> InstallPlace {
    if first_match(r"[\\/]_npx[\\/]|[\\/]dlx[-\\/]|[\\/]\.bun[\\/]install[\\/]cache[\\/]|[\\/]bunx-|[\\/]xfs-", root, "i").is_some() {
        return InstallPlace { runner: true, owner: None, known_global: false };
    }
    let sep = if first_match(r"^[A-Za-z]:\\|^\\\\", root, "").is_some() { "\\" } else { "/" };
    let parts: Vec<&str> = root.split(['\\', '/']).collect();
    let Some(at) = parts.iter().rposition(|p| *p == "node_modules").filter(|at| *at >= 1) else {
        return InstallPlace { runner: false, owner: None, known_global: false };
    };
    let or_sep = |v: String| if v.is_empty() { sep.to_string() } else { v };
    let mut owner = or_sep(parts[..at].join(sep));
    if let Some(pnpm_at) = parts.iter().rposition(|p| *p == ".pnpm") {
        if pnpm_at > 0 && pnpm_at < at {
            let end = if parts[pnpm_at - 1] == "node_modules" { pnpm_at - 1 } else { pnpm_at };
            owner = or_sep(parts[..end].join(sep));
        }
    }
    let known_global = [r"[\\/]global[\\/]v?\d+(?:[\\/][^\\/]+)?$", r"(?i)[\\/]yarn[\\/](?:data[\\/])?global$", r"(?i)[\\/]install[\\/]global$"]
        .iter()
        .any(|re| {
            let (re, flags) = match re.strip_prefix("(?i)") {
                Some(r) => (r, "i"),
                None => (*re, ""),
            };
            first_match(re, &owner, flags).is_some()
        });
    InstallPlace { runner: false, owner: Some(owner), known_global }
}

/// `globalFolderOf(root)`: the package manager whose global folder holds
/// this CLI root, and that folder.
pub fn global_folder_of(root: &str) -> Option<(&'static str, String)> {
    global_folder_in(root, configured_global_folders())
}

/// `globalFolderOf(root, {home, env})`.
pub fn global_folder_of_in(root: &str, home: &str, env: &dyn Fn(&str) -> Option<String>) -> Option<(&'static str, String)> {
    global_folder_in(root, configured_global_folders_in(home, env))
}

fn global_folder_in(root: &str, folders: Vec<(&'static str, String)>) -> Option<(&'static str, String)> {
    let place = install_place_of(root);
    if place.runner {
        return None;
    }
    let owner = place.owner?;
    for (manager, folder) in folders {
        let folder = np::real_or_resolve(&folder);
        if manager == "pnpm" {
            let rel = np::relative(&np::normalize(&folder), &np::normalize(&owner));
            if !(rel.is_empty() || rel.starts_with("..") || np::is_absolute(&rel)) && first_match(r"^v?\d+(?:[\\/][^\\/]+)?$", &rel, "u").is_some() {
                return Some(("pnpm", owner));
            }
        } else if np::normalize(&folder) == np::normalize(&owner) {
            return Some((manager, owner));
        }
    }
    None
}

pub fn is_global_copy(cli_root: &str) -> bool {
    let root = np::real_or_resolve(cli_root);
    let runner = first_match(
        r"[\\/]_npx[\\/]|[\\/]dlx[-\\/]|[\\/]\.bun[\\/]install[\\/]cache[\\/]|[\\/]bunx-|[\\/]xfs-",
        &root,
        "i",
    )
    .is_some();
    if runner {
        return false;
    }
    let parts: Vec<&str> = root.split('/').collect();
    let Some(at) = parts.iter().rposition(|p| *p == "node_modules") else { return false };
    if at < 1 {
        return false;
    }
    let mut owner = parts[..at].join("/");
    if let Some(pnpm_at) = parts.iter().rposition(|p| *p == ".pnpm") {
        if pnpm_at > 0 && pnpm_at < at {
            let end = if parts[pnpm_at - 1] == "node_modules" { pnpm_at - 1 } else { pnpm_at };
            owner = parts[..end].join("/");
        }
    }
    if owner.is_empty() {
        owner = "/".into();
    }
    if release::is_in_release_cache(&root) {
        return false;
    }
    for (manager, folder) in configured_global_folders() {
        let folder = np::real_or_resolve(&folder);
        if manager == "pnpm" {
            let rel = np::relative(&folder, &owner);
            if !(rel.is_empty() || rel.starts_with("..") || np::is_absolute(&rel))
                && first_match(r"^v?\d+(?:[\\/][^\\/]+)?$", &rel, "u").is_some()
            {
                return true;
            }
        } else if np::normalize(&folder) == np::normalize(&owner) {
            return true;
        }
    }
    let links_at = parts.iter().rposition(|p| *p == "links");
    if let Some(l) = links_at {
        if l >= 2 && first_match(r"^v\d+$", parts[l - 1], "u").is_some() {
            // pnpm global store links: global only when a pnpm global folder
            // links to it.
            for (manager, folder) in configured_global_folders() {
                if manager != "pnpm" {
                    continue;
                }
                for v in np::list_dir(&folder).unwrap_or_default() {
                    if first_match(r"^v?\d+$", &v, "u").is_none() {
                        continue;
                    }
                    let d = np::join2(&folder, &v);
                    let mut cands = vec![d.clone()];
                    cands.extend(np::list_dir(&d).unwrap_or_default().iter().map(|id| np::join2(&d, id)));
                    for c in cands {
                        if np::real_or_resolve(&np::join(&[&c, "node_modules", "@astryxdesign", "cli"])) == root {
                            return true;
                        }
                    }
                }
            }
            return false;
        }
    }
    !np::exists(&np::join2(&owner, "package.json"))
}

fn setting_in(file: &str, key: &str) -> Option<String> {
    let text = np::read_text(file)?;
    let mut esc = String::new();
    for c in key.chars() {
        if ".*+?^${}()|[]\\".contains(c) {
            esc.push('\\');
        }
        esc.push(c);
    }
    let g = first_match(&format!(r"^\s*{esc}\s*(?:=|\s)\s*(.+?)\s*$"), &text, "mu")?;
    let v = g[1].clone()?;
    let b: Vec<char> = v.chars().collect();
    if b.len() >= 2 && (b[0] == '"' || b[0] == '\'') && b[b.len() - 1] == b[0] {
        Some(b[1..b.len() - 1].iter().collect())
    } else {
        Some(v)
    }
}

fn configured_global_folders() -> Vec<(&'static str, String)> {
    configured_global_folders_in(&np::homedir(), &|k| std::env::var(k).ok())
}

/// `configuredGlobalFolders({home, env})`.
pub fn configured_global_folders_in(home: &str, env: &dyn Fn(&str) -> Option<String>) -> Vec<(&'static str, String)> {
    let home = home.to_string();
    let abs = |v: Option<String>| -> Option<String> {
        let v = v.filter(|s| !s.is_empty())?;
        let e = if let Some(rest) = v.strip_prefix('~') { np::join2(&home, rest) } else { v };
        if np::is_absolute(&e) {
            Some(np::normalize(&e))
        } else {
            None
        }
    };
    let xdg_config = abs(env("XDG_CONFIG_HOME")).unwrap_or_else(|| np::join2(&home, ".config"));
    let xdg_data = abs(env("XDG_DATA_HOME"));
    let mut out = Vec::new();
    out.push(("bun", np::join(&[&abs(env("BUN_INSTALL")).unwrap_or_else(|| np::join2(&home, ".bun")), "install", "global"])));
    for f in [np::join2(&home, ".bunfig.toml"), np::join2(&xdg_config, ".bunfig.toml")] {
        if let Some(d) = abs(setting_in(&f, "globalDir")) {
            out.push(("bun", d));
        }
    }
    let yarn_setting = abs(env("YARN_GLOBAL_FOLDER"))
        .or_else(|| abs(env("npm_config_global_folder")))
        .or_else(|| abs(setting_in(&np::join2(&home, ".yarnrc"), "global-folder")));
    let yarn_data = match &xdg_data {
        Some(x) => np::join2(x, "yarn"),
        None => np::join(&[&home, ".config", "yarn"]),
    };
    out.push(("yarn", yarn_setting.unwrap_or_else(|| np::join2(&yarn_data, "global"))));
    let pnpm_home = abs(env("PNPM_HOME")).unwrap_or_else(|| match &xdg_data {
        Some(x) => np::join2(x, "pnpm"),
        None if cfg!(target_os = "macos") => np::join(&[&home, "Library", "pnpm"]),
        None => np::join(&[&home, ".local", "share", "pnpm"]),
    });
    out.push(("pnpm", np::join2(&pnpm_home, "global")));
    for f in [np::join2(&home, ".npmrc"), np::join(&[&xdg_config, "pnpm", "rc"])] {
        if let Some(d) = abs(setting_in(&f, "global-dir")) {
            out.push(("pnpm", d));
        }
    }
    out
}

/// `formatCliCommand(command, targetDir)`.
pub fn format_cli_command(command: &str, target: Option<&str>) -> String {
    let sub = strip_astryx(command);
    let stem = get_cli_invocation(target);
    if sub.is_empty() {
        stem
    } else {
        format!("{stem} {sub}")
    }
}

/// `String(command).replace(/^\s*astryx\b\s*/, '').trim()`.
fn strip_astryx(command: &str) -> String {
    let re = regress::Regex::new(r"^\s*astryx\b\s*").unwrap();
    let s = match re.find(command) {
        Some(m) => format!("{}{}", &command[..m.start()], &command[m.end()..]),
        None => command.to_string(),
    };
    s.trim_matches(paths::js_ws).to_string()
}

fn prefix_line(line: &str, stem: &str, lang: Option<&str>) -> String {
    let inline = |l: &str| replace_all(l, r"`astryx(?=[\s`])", |_| format!("`{stem}"));
    let shell = |l: &str| {
        replace_all(l, r"(^\s*(?:\$\s+)?|(?:&&|\|\||;|\|)\s*)astryx(?=\s|$)", |g| {
            format!("{}{stem}", g[1].clone().unwrap_or_default())
        })
    };
    match lang {
        None => inline(line),
        Some(l) if ["", "bash", "sh", "shell", "zsh", "console"].contains(&l) => shell(line),
        Some(l) if ["text", "txt", "markdown", "md"].contains(&l) => shell(&inline(line)),
        _ => line.to_string(),
    }
}

/// JS `text.replace(/re/g, fn)` with a regress regex.
pub fn replace_all(text: &str, re: &str, f: impl Fn(&[Option<String>]) -> String) -> String {
    let r = regress::Regex::new(re).unwrap();
    let mut out = String::new();
    let mut last = 0;
    for m in r.find_iter(text) {
        out.push_str(&text[last..m.start()]);
        let groups: Vec<Option<String>> = m.groups().map(|g| g.map(|g| text[g].to_string())).collect();
        out.push_str(&f(&groups));
        last = m.end();
    }
    out.push_str(&text[last..]);
    out
}

/// `prefixCliCommands(text, stem, lang)`.
pub fn prefix_cli_commands(text: &str, stem: &str, lang: Option<&str>) -> String {
    if stem == CLI_BIN {
        return text.to_string();
    }
    let block_lang = lang.map(|l| l.to_lowercase());
    let fence_re = regress::Regex::new(r"^\s*(`{3,}|~{3,})\s*([\w-]*)").unwrap();
    let mut fence: Option<(String, String)> = None;
    text.split('\n')
        .map(|line| {
            if let Some(bl) = &block_lang {
                return prefix_line(line, stem, Some(bl));
            }
            if let Some(m) = fence_re.find(line) {
                let marker = line[m.group(1).unwrap()].to_string();
                let lang = line[m.group(2).unwrap()].to_lowercase();
                match &fence {
                    None => fence = Some((marker, lang)),
                    Some((fm, _)) if marker.starts_with(fm.as_str()) => fence = None,
                    _ => {}
                }
                return line.to_string();
            }
            prefix_line(line, stem, fence.as_ref().map(|f| f.1.as_str()))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

thread_local! {
    static DOC_PM: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// `runWithDocPackageManager`: set (or clear) the host's doc package manager.
pub fn set_doc_package_manager(pm: Option<String>) {
    DOC_PM.with(|d| *d.borrow_mut() = pm);
}

/// `docPackageManager(targetDir)`: `npm` | `yarn-classic` | `yarn` | `pnpm` | `bun`.
pub fn doc_package_manager(target: Option<&str>) -> String {
    if let Some(p) = DOC_PM.with(|d| d.borrow().clone()) {
        return p;
    }
    let r = explain_package_manager(target);
    match r.pm.as_str() {
        "yarn" => {
            if is_yarn_classic(&r) {
                "yarn-classic".into()
            } else {
                "yarn".into()
            }
        }
        "pnpm" => "pnpm".into(),
        "bun" => "bun".into(),
        _ => "npm".into(),
    }
}

/// `quoteCommandArgument(value)` for a POSIX shell.
pub fn quote_command_argument(value: &str) -> String {
    let ok = !value.is_empty()
        && value.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '@' | '/' | '.' | '_' | '-'));
    if ok {
        return value.to_string();
    }
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// `commandInFolder(dir, command)` for a POSIX shell.
pub fn command_in_folder(dir: &str, command: &str) -> String {
    format!("cd {} && {command}", quote_command_argument(dir))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quoting_and_prefix() {
        assert_eq!(quote_command_argument("a b"), "'a b'");
        assert_eq!(quote_command_argument("it's"), "'it'\\''s'");
        assert_eq!(quote_command_argument(""), "''");
        assert_eq!(strip_astryx("  astryx docs tokens "), "docs tokens");
        assert_eq!(strip_astryx("astryxx"), "astryxx");
        let t = "Run `astryx docs`.\n```bash\n$ astryx build && astryx doctor\n```\nastryx plain";
        assert_eq!(
            prefix_cli_commands(t, "pnpm exec astryx", None),
            "Run `pnpm exec astryx docs`.\n```bash\n$ pnpm exec astryx build && pnpm exec astryx doctor\n```\nastryx plain"
        );
    }
}
