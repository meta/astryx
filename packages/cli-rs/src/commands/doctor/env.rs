//! What doctor reads from its surroundings, kept apart so the checks stay pure
//! (port of the readers in `api/doctor/_adapter.mjs` and the foundation
//! pieces they call); shared pieces come from their owners.

use crate::discovery::{nodepath as np, package_manager as pm, paths, release};
use crate::json::Value;
use sha2::{Digest, Sha256};
use std::path::Path;

pub const MIN_NODE_VERSION: &str = "22.13.0";

/// The Node version the JS CLI would report (`process.versions.node`): the
/// `node` first on the search path. The clone never runs it; the version is
/// read from the release URLs every Node build embeds
/// (`process.release.sourceUrl`), in the binary or the `libnode` it links.
pub fn node_version() -> String {
    static V: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    V.get_or_init(|| find_node_version().unwrap_or_else(|| "0.0.0".into())).clone()
}

fn find_node_version() -> Option<String> {
    let path = std::env::var("PATH").unwrap_or_default();
    let node = path.split(':').filter(|d| !d.is_empty()).map(|d| Path::new(d).join("node")).find(|p| p.is_file())?;
    let real = std::fs::canonicalize(&node).unwrap_or(node);
    if let Some(v) = version_in_file(&real) {
        return Some(v);
    }
    // A shared build links libnode: look beside the binary and in the
    // system library folders.
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    if let Some(bin) = real.parent() {
        dirs.push(bin.join("../lib"));
        dirs.push(bin.join("../lib64"));
    }
    for d in ["/lib64", "/usr/lib64", "/lib", "/usr/lib", "/usr/local/lib", "/lib/x86_64-linux-gnu", "/usr/lib/x86_64-linux-gnu"] {
        dirs.push(d.into());
    }
    for d in dirs {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        let mut libs: Vec<_> = rd
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.file_name().map(|n| n.to_string_lossy().starts_with("libnode.so")).unwrap_or(false))
            .collect();
        libs.sort();
        for lib in libs {
            if let Some(v) = version_in_file(&lib) {
                return Some(v);
            }
        }
    }
    None
}

fn version_in_file(file: &Path) -> Option<String> {
    let bytes = std::fs::read(file).ok()?;
    let needle = b"/download/release/v";
    let mut i = 0;
    while let Some(p) = find(&bytes[i..], needle) {
        let start = i + p + needle.len();
        let rest = &bytes[start..bytes.len().min(start + 40)];
        let end = rest.iter().position(|&b| b == b'/').unwrap_or(0);
        if end > 0 {
            let v = std::str::from_utf8(&rest[..end]).ok()?;
            if v.split('.').count() == 3 && v.split('.').all(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())) {
                return Some(v.to_string());
            }
        }
        i = start;
    }
    None
}

fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    // The node library is ~80 MB: a SIMD substring search keeps this fast.
    memchr::memmem::find(hay, needle)
}

/// `isNodeVersionSupported`.
pub fn is_node_version_supported(version: &str) -> bool {
    let parse = |v: &str| -> (i64, i64, i64) {
        let c = v.trim().trim_start_matches('v');
        let mut it = c.split('.').map(|s| {
            let digits: String = s.trim_start().chars().take_while(|c| c.is_ascii_digit()).collect();
            digits.parse::<i64>().unwrap_or(0)
        });
        (it.next().unwrap_or(0), it.next().unwrap_or(0), it.next().unwrap_or(0))
    };
    let v = parse(version);
    let m = parse(MIN_NODE_VERSION);
    if v.0 != m.0 {
        return v.0 > m.0;
    }
    if v.1 != m.1 {
        return v.1 > m.1;
    }
    v.2 >= m.2
}

pub fn cli_root() -> String {
    paths::cli_root().to_string()
}

pub fn home() -> String {
    np::homedir()
}

pub fn read_json(file: &str) -> Option<Value> {
    np::read_json(file)
}

pub fn pkg_version(dir: Option<&str>) -> Option<String> {
    let d = dir?;
    read_json(&np::join2(d, "package.json"))?.get("version").and_then(|v| v.as_str()).map(String::from)
}

/// `formatCliCommand(cmd, cwd)`.
pub fn fmt(cmd: &str, cwd: &str) -> String {
    pm::format_cli_command(cmd, Some(cwd))
}

/// `formatCliCommand(cmd)` with no folder (the process's own).
pub fn fmt0(cmd: &str) -> String {
    pm::format_cli_command(cmd, None)
}

pub fn invocation(cwd: &str) -> String {
    pm::get_cli_invocation(Some(cwd))
}

/* ── release notices (full port of foundation/release/notices.mjs readers; no shared version) ── */

pub fn user_config_dir() -> String {
    release::user_config_dir()
}

fn global_state() -> Value {
    match read_json(&np::join2(&user_config_dir(), "state.json")) {
        Some(v @ Value::Object(_)) => v,
        _ => Value::Object(Default::default()),
    }
}

/// `knownLatest()`: `(version, node)`.
pub fn known_latest() -> Option<(String, Option<String>)> {
    let s = global_state();
    if !s.get("checkOkAt").map(|v| v.is_number()).unwrap_or(false) {
        return None;
    }
    let latest = s.get("latest").and_then(|v| v.as_str())?;
    if !release::is_release_version(Some(latest)) {
        return None;
    }
    Some((latest.to_string(), s.get("latestNode").and_then(|v| v.as_str()).map(String::from)))
}

/// `lastCheckFailure()`.
pub fn last_check_failure() -> Option<(f64, String)> {
    let s = global_state();
    let f = s.get("checkFailed")?;
    let at = f.get("at")?.as_f64()?;
    let reason = f.get("reason")?.as_str()?.to_string();
    if let Some(ok) = s.get("checkOkAt").and_then(|v| v.as_f64()) {
        if ok > at {
            return None;
        }
    }
    Some((at, reason))
}

/// `lastNoticeSkip()`: `(key, reason, at)`.
pub fn last_notice_skip() -> Option<(String, String, f64)> {
    let s = global_state();
    let skips = s.get("noticeSkips")?.as_object()?;
    let mut newest: Option<(String, String, f64)> = None;
    for (k, v) in skips {
        if k.starts_with("setup:") {
            continue;
        }
        let Some(at) = v.get("at").and_then(|x| x.as_f64()) else { continue };
        if newest.as_ref().map(|n| at > n.2).unwrap_or(true) {
            let reason = match v.get("reason") {
                Some(Value::String(s)) => s.clone(),
                Some(other) => crate::cli::format::js_string(other),
                None => "undefined".into(),
            };
            newest = Some((k.clone(), reason, at));
        }
    }
    newest
}

/// `stateLockHolder()`: `(pid, host, since)`.
pub fn state_lock_holder() -> Option<(Option<i64>, Option<String>, f64)> {
    let lock = np::join2(&user_config_dir(), ".lock-state");
    let md = std::fs::metadata(&lock).ok()?;
    let since = md
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs_f64()
        * 1000.0;
    let owner = read_json(&np::join2(&lock, "owner.json"));
    let pid = owner.as_ref().and_then(|o| o.get("pid")).and_then(|v| v.as_i64());
    let host = owner.as_ref().and_then(|o| o.get("host")).and_then(|v| v.as_str()).map(String::from);
    Some((pid, host, since))
}

pub struct InstallFolder {
    pub dir: String,
    pub moved: bool,
}

/// `installFolder(cwd)`.
pub fn install_folder(cwd: &str) -> Option<InstallFolder> {
    let project = paths::find_astryx_project(cwd)?;
    match paths::find_package_root(cwd) {
        Some(n) if n != project => Some(InstallFolder { dir: project, moved: true }),
        _ => Some(InstallFolder { dir: cwd.to_string(), moved: false }),
    }
}

fn add_word(dir: &str) -> &'static str {
    match pm::detect_package_manager(Some(dir)).as_str() {
        "pnpm" => "pnpm add",
        "yarn" => "yarn add",
        "bun" => "bun add",
        _ => "npm install",
    }
}

fn project_root(cwd: &str) -> String {
    release::project_root_of(&release::read_release_facts(cwd)).unwrap_or_else(|| cwd.to_string())
}

pub const RUN_FROM_PROJECT: &str = "Run this from the Astryx project's folder, or declare an Astryx package in this folder's package.json to make it a project of its own.";

/// `addCliCommandFor(cwd, version)` (via `cliInstallAdvice`).
pub fn add_cli_command_for(cwd: &str, version: &str) -> Option<String> {
    let target = install_folder(cwd)?;
    if target.moved {
        return None;
    }
    let root = project_root(cwd);
    Some(format!("{} @astryxdesign/cli@{version}", add_word(&root)))
}

/// `alignCliAndCore({cwd, cli, core})`.
pub fn align_command(cwd: &str, cli: &str, core: &str) -> Option<String> {
    let target = install_folder(cwd)?;
    if target.moved {
        return None;
    }
    let root = project_root(cwd);
    let add = add_word(&root);
    if crate::discovery::semver::semver_compare(cli, core) > 0.0 {
        let opts = pm::InvocationOptions { installed: true, ..Default::default() };
        Some(format!(
            "{add} @astryxdesign/core@{cli}, then {} upgrade --from {core} --apply",
            pm::get_cli_invocation_with(Some(&root), &opts)
        ))
    } else {
        Some(format!("{add} @astryxdesign/cli@{core}"))
    }
}

/// `projectAddCommand(cwd)`: the add prefix, or None.
pub fn project_add_prefix(cwd: &str) -> Option<&'static str> {
    let target = install_folder(cwd)?;
    if target.moved {
        return None;
    }
    Some(add_word(cwd))
}

pub fn inside_project_elsewhere(cwd: &str) -> bool {
    install_folder(cwd).map(|f| f.moved).unwrap_or(false)
}

fn is_behind(version: &str, newest: &str) -> bool {
    release::is_release_version(Some(version))
        && release::is_release_version(Some(newest))
        && !version.contains('-')
        && !newest.contains('-')
        && crate::discovery::semver::semver_compare(newest, version) > 0.0
}

pub struct ProjectLag {
    pub current: String,
    pub newest: String,
    pub node: Option<String>,
    pub install: String,
    pub upgrade: String,
}

/// `projectLag({cwd, current})`.
pub fn project_lag(cwd: &str, given: &str) -> Option<ProjectLag> {
    let (newest, node) = known_latest()?;
    let facts = release::read_release_facts(cwd);
    if !facts.in_project {
        return None;
    }
    let target = install_folder(cwd)?;
    let root = if target.moved { target.dir.clone() } else { release::project_root_of(&facts).unwrap_or_else(|| cwd.to_string()) };
    let current = if target.moved {
        let f = release::read_release_facts(&root);
        f.cli.as_ref().map(|c| c.version.clone()).or_else(|| core_version_of(&f)).unwrap_or_else(|| given.to_string())
    } else {
        given.to_string()
    };
    if !is_behind(&current, &newest) {
        return None;
    }
    let add = format!("{} @astryxdesign/core@{newest} @astryxdesign/cli@{newest}", add_word(&root));
    let install = if target.moved { pm::command_in_folder(&root, &add) } else { add };
    let opts = pm::InvocationOptions { installed: true, ..Default::default() };
    let stem = pm::get_cli_invocation_with(Some(&root), &opts);
    let up = format!("{stem} upgrade --from {current} --apply");
    let upgrade = if target.moved { pm::command_in_folder(&root, &up) } else { up };
    Some(ProjectLag { current, newest, node, install, upgrade })
}

/// `coreVersionOf(facts)`.
pub fn core_version_of(f: &release::ReleaseFacts) -> Option<String> {
    if let Some(c) = &f.core {
        return Some(c.version.clone());
    }
    if release::is_release_version(f.locked_core_version.as_deref()) {
        return f.locked_core_version.clone();
    }
    if let Some(range) = &f.declared_core_range {
        let t = range.trim();
        let t = t.strip_prefix('=').unwrap_or(t);
        let t = t.strip_prefix('v').unwrap_or(t);
        if release::is_release_version(Some(t)) {
            return Some(t.to_string());
        }
    }
    None
}

pub fn project_core_version(cwd: &str) -> Option<String> {
    core_version_of(&release::read_release_facts(cwd))
}

pub fn project_has_own_cli(cwd: &str) -> bool {
    release::read_release_facts(cwd).cli.is_some()
}

/// `upgradeLine(command, node)`.
pub fn upgrade_line(command: &str, node: Option<&str>) -> String {
    let nv = node_version();
    match node {
        Some(n) if !crate::discovery::semver::satisfies_range(&nv, n) => {
            format!("To upgrade, install Node {n} (this computer runs Node {nv}), then run: {command}")
        }
        _ => format!("To upgrade, run: {command}"),
    }
}

pub fn available_line(current: &str, newest: &str) -> String {
    format!("A new release of Astryx is available: {current} \u{2192} {newest}")
}

/* ── the search path (discovery's search-path reader) ── */

pub struct SearchPathCommand {
    pub file: String,
    pub astryx: bool,
    pub cli_root: Option<String>,
    pub version: Option<String>,
    pub hands_off: Option<bool>,
    pub upgrade: Option<String>,
    pub runner: bool,
}

/// `astryxCommandsOnSearchPath()` with each row's upgrade command and runner flag.
pub fn search_path_commands() -> Vec<SearchPathCommand> {
    crate::discovery::search_path::astryx_commands_on_search_path()
        .into_iter()
        .map(|r| SearchPathCommand {
            upgrade: r.cli_root.as_deref().map(global_upgrade_command),
            runner: r.cli_root.as_deref().map(is_runner_place).unwrap_or(false),
            file: r.file,
            astryx: r.astryx,
            cli_root: r.cli_root,
            version: r.version,
            hands_off: r.hands_off,
        })
        .collect()
}

fn is_runner_place(root: &str) -> bool {
    crate::doctor_re!(r"[\\/]_npx[\\/]|[\\/]dlx[-\\/]|[\\/]\.bun[\\/]install[\\/]cache[\\/]|[\\/]bunx-|[\\/]xfs-", "i").find(root).is_some()
}

/// `globalUpgradeCommand(cliRoot)` (`foundation/release/notices.mjs`).
pub fn global_upgrade_command(cli_root: &str) -> String {
    let at = np::realpath(cli_root).unwrap_or_else(|| cli_root.to_string());
    let latest = "@astryxdesign/cli@latest";
    if crate::doctor_re!(r"[\\/]\.volta[\\/]", "iu").find(&at).is_some() {
        return format!("volta install {latest}");
    }
    let global = pm::global_folder_of(&at);
    match global.as_ref().map(|g| g.0) {
        Some("bun") => return format!("bun add -g {latest}"),
        Some("yarn") => return format!("yarn global add {latest}"),
        _ => {}
    }
    if global.as_ref().map(|g| g.0) == Some("pnpm") || crate::doctor_re!(r"[\\/]pnpm[\\/]|[\\/]global[\\/]v?\d+[\\/]", "iu").find(&at).is_some() {
        return format!("pnpm add -g {latest}");
    }
    match npm_own_prefix(&at) {
        Some(prefix) => format!("npm i -g --prefix {prefix} {latest}"),
        None => format!("npm i -g {latest}"),
    }
}

/// `npmOwnPrefix(at)` on macOS and Linux: the npm prefix holding the CLI,
/// as a person types it, when it is not one npm uses by default (Node's own
/// prefix, `/usr/local`, `/usr`).
fn npm_own_prefix(at: &str) -> Option<String> {
    let parts: Vec<&str> = at.split(['/', '\\']).collect();
    let n = parts.len();
    if n < 4 || parts[n - 1] != "cli" || parts[n - 2] != "@astryxdesign" || parts[n - 3] != "node_modules" || parts[n - 4] != "lib" {
        return None;
    }
    let joined = parts[..n - 4].join("/");
    let prefix = if joined.is_empty() { "/".to_string() } else { joined };
    // Node's own prefix: the folder above the `bin` that holds `node`.
    let node_prefix = crate::discovery::search_path::executables_on_search_path(&["node"], &std::env::var("PATH").unwrap_or_default())
        .first()
        .map(|f| np::dirname(&np::dirname(&np::realpath(f).unwrap_or_else(|| f.clone()))));
    let defaults: Vec<String> = node_prefix.into_iter().chain(["/usr/local".to_string(), "/usr".to_string()]).collect();
    if defaults.iter().any(|d| np::resolve1(d) == np::resolve1(&prefix)) {
        return None;
    }
    let home = np::homedir();
    let rel = np::relative(&home, &prefix);
    if rel.is_empty() {
        return Some("~".into());
    }
    if !rel.starts_with("..") && !np::is_absolute(&rel) {
        return Some(format!("~/{rel}"));
    }
    Some(if prefix.chars().any(char::is_whitespace) { crate::json::stringify(&Value::String(prefix), 0) } else { prefix })
}


/* ── agent docs (init's readers; the refusal is doctor's own wording) ── */

pub use crate::commands::init::agent_docs::AGENT_DOC_PATHS;

/// `holdsAstryxBlock(content)`.
pub fn holds_astryx_block(content: &str) -> bool {
    crate::commands::init::agent_docs::holds_astryx_block(content)
}

fn real_dir(p: &str) -> String {
    np::real_or_resolve(p)
}

fn relative_to_home(dir: &str) -> Option<String> {
    let home = np::homedir();
    if home.is_empty() {
        return None;
    }
    Some(np::relative(&real_dir(&home), &real_dir(dir)))
}

fn is_home_folder(dir: &str) -> bool {
    relative_to_home(dir).as_deref() == Some("")
}

fn is_home_or_settings_folder(dir: &str) -> bool {
    let Some(rel) = relative_to_home(dir) else { return false };
    if rel.is_empty() {
        return true;
    }
    if rel == ".." || rel.starts_with("../") || np::is_absolute(&rel) {
        return false;
    }
    let parts: Vec<&str> = rel.split('/').collect();
    if !parts[0].starts_with('.') {
        return false;
    }
    let mut current = real_dir(dir);
    let mut depth = parts.len();
    while depth > 1 {
        if np::exists(&np::join2(&current, "package.json")) {
            return false;
        }
        current = np::dirname(&current);
        depth -= 1;
    }
    true
}

/// Why init writes no agent docs for `cwd`, or None.
pub fn agent_docs_refusal(cwd: &str) -> Option<String> {
    let target = agent_docs_target_dir(cwd);
    if is_home_or_settings_folder(&target) {
        Some(format!(
            "Agent docs are not written into the home folder, or into a settings folder in it outside a project ({}): agents read the files there in every project. Run init inside a project folder.",
            real_dir(&target)
        ))
    } else {
        None
    }
}

/// `resolveAgentDocsRoot(cwd)`.
pub fn resolve_agent_docs_root(cwd: &str) -> Option<String> {
    crate::commands::init::agent_docs::resolve_agent_docs_root(cwd)
}

pub fn agent_docs_target_dir(cwd: &str) -> String {
    crate::commands::init::agent_docs::agent_docs_target_dir(cwd)
}

/* ── computer-level agent text (init renders it; the read-only state is a full port) ── */

pub const COMPUTER_COMMAND: &str = "astryx";
pub const COMPUTER_INSTALL_STEP: &str = "npm i -g @astryxdesign/cli";

pub struct AgentTextEntry {
    pub path: String,
    pub state: &'static str,
}

pub struct AgentTextState {
    pub install: bool,
    pub links: Vec<String>,
    pub entries: Vec<AgentTextEntry>,
    pub command: Option<String>,
    pub install_step: Option<String>,
}

const WORKFLOW_TITLE: &str = "WORKFLOW \u{2014} start every page from a template, never from scratch:";
const WORKFLOW_STEPS: &[&str] = &[
    "1. `astryx build \"<idea>\"` \u{2014} names the template to scaffold from and the parts it lacks.",
    "2. `astryx template <name> <path>` \u{2014} scaffold it; keep its frame, gap and padding; replace the content.",
    "3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.",
];
const SELF_CHECK_CSS: &str = "replace any raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or a token";
const SKILL_DESCRIPTION: &str = "Astryx, a design system and UI library, is available on this computer through the astryx command; use it when building or changing UI, choosing components, layout, styling or theming, working with a design system, or in any project that depends on @astryxdesign packages or mentions Astryx.";

fn skill_file() -> String {
    np::join(&[&np::homedir(), ".agents", "skills", "astryx", "SKILL.md"])
}

fn render_agent_text(command: &str, install: &str) -> String {
    crate::commands::init::user::render(command, install)
}

fn sha_hex(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

fn has_markers(content: &str) -> bool {
    match content.find("<!-- ASTRYX:START -->") {
        Some(s) => content[s..].contains("<!-- ASTRYX:END -->"),
        None => false,
    }
}

fn is_unedited(content: &str) -> bool {
    let re = crate::doctor_re!(r"^<!-- astryx-managed sha256:([0-9a-f]{64}) -->\n", "mu");
    let Some(m) = re.find(content) else { return false };
    let hash = &content[m.group(1).unwrap()];
    let stripped = format!("{}{}", &content[..m.start()], &content[m.end()..]);
    sha_hex(&stripped) == hash
}

fn state_of(file: &str, expected: &str) -> &'static str {
    let Ok(md) = std::fs::symlink_metadata(file) else { return "absent" };
    if !md.is_file() {
        return "foreign";
    }
    let Ok(content) = std::fs::read_to_string(file) else { return "foreign" };
    if !has_markers(&content) {
        return "foreign";
    }
    if content == expected {
        return "current";
    }
    if is_unedited(&content) {
        "differs"
    } else {
        "edited"
    }
}

fn copy_state_of(at: &str, expected: &str) -> &'static str {
    let Ok(md) = std::fs::symlink_metadata(at) else { return "absent" };
    if !md.is_dir() {
        return "foreign";
    }
    let Ok(rd) = std::fs::read_dir(at) else { return "foreign" };
    let names: Vec<String> = rd.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    if names.is_empty() {
        return "absent";
    }
    if names.len() != 1 || names[0] != "SKILL.md" {
        return "foreign";
    }
    let state = state_of(&np::join2(at, "SKILL.md"), expected);
    if state == "current" && expected.is_empty() {
        "differs"
    } else {
        state
    }
}

fn real_path_lenient(p: &str) -> String {
    match np::realpath(p) {
        Some(r) => r,
        None => {
            let parent = np::dirname(p);
            if parent == p {
                p.to_string()
            } else {
                np::join2(&real_path_lenient(&parent), &np::basename(p))
            }
        }
    }
}

fn link_state_of(at: &str, folder: &str) -> &'static str {
    let Ok(md) = std::fs::symlink_metadata(at) else { return "absent" };
    if md.file_type().is_symlink() {
        let Ok(text) = std::fs::read_link(at) else { return "foreign" };
        let text = text.to_string_lossy().into_owned();
        let followed = np::resolve(&[&real_path_lenient(&np::dirname(at)), &text]);
        let wanted = real_path_lenient(folder);
        let trim = |s: &str| s.trim_end_matches('/').to_string();
        if trim(&followed) == wanted {
            return if np::exists(&np::join2(folder, "SKILL.md")) { "linked" } else { "dangling" };
        }
        let named = np::resolve(&[&np::dirname(at), &text]);
        return if trim(&named) == folder { "dangling" } else { "foreign" };
    }
    if !md.is_dir() {
        return "foreign";
    }
    if copy_state_of(at, "") == "differs" {
        "differs"
    } else {
        "foreign"
    }
}

/// `computerAgentTextState()`.
pub fn computer_agent_text_state() -> AgentTextState {
    let settings = read_json(&np::join2(&user_config_dir(), "settings.json")).filter(|v| v.is_object());
    let cat = settings.as_ref().and_then(|s| s.get("computerAgentText"));
    let install = cat.and_then(|c| c.get("install")).map(|v| v.as_bool() != Some(false)).unwrap_or(true);
    let links: Vec<String> = cat
        .and_then(|c| c.get("links"))
        .and_then(|l| l.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let text = std::fs::read_to_string(skill_file()).ok();
    let command = text.as_deref().and_then(|t| {
        crate::doctor_re!(r"Start with `(.+?) search '", "u").find(t).map(|m| t[m.group(1).unwrap()].to_string())
    });
    let install_step = text.as_deref().and_then(|t| {
        crate::doctor_re!(r"is not found, run `(.+?)` first\.", "u").find(t).map(|m| t[m.group(1).unwrap()].to_string())
    });
    // computerInstallStep({for: 'judge'}): the recorded step, else this
    // copy's own when it is a global copy, else npm's.
    let judge = install_step.clone().unwrap_or_else(|| COMPUTER_INSTALL_STEP.to_string());
    let expected = render_agent_text(COMPUTER_COMMAND, &judge);
    let home = np::homedir();
    let folder = np::join(&[&home, ".agents", "skills", "astryx"]);
    let mut entries = vec![AgentTextEntry { path: skill_file(), state: state_of(&skill_file(), &expected) }];
    let places: &[(&[&str], Option<&[&str]>, bool)] = &[
        (&[".claude", "skills"], None, false),
        (&[".kiro", "skills"], Some(&[".kiro"]), false),
        (&[".codeium", "windsurf", "skills"], Some(&[".codeium", "windsurf"]), false),
        (&[".letta", "skills"], Some(&[".letta"]), false),
        (
            &["Library", "Developer", "Xcode", "CodingAssistant", "ClaudeAgentConfig", "skills"],
            Some(&["Library", "Developer", "Xcode", "CodingAssistant"]),
            false,
        ),
        (&[".config", "agents", "skills"], Some(&[".config", "agents", "skills"]), false),
        (&[".continue", "skills"], Some(&[".continue"]), true),
    ];
    for (skills, when, copy) in places {
        let mut parts = vec![home.as_str()];
        parts.extend_from_slice(skills);
        parts.push("astryx");
        let p = np::join(&parts);
        let wanted = match when {
            None => true,
            Some(w) => {
                let mut wp = vec![home.as_str()];
                wp.extend_from_slice(w);
                np::exists(&np::join(&wp))
            }
        };
        if !wanted && !links.contains(&p) {
            continue;
        }
        let ls = link_state_of(&p, &folder);
        let state = if *copy && ls != "linked" { copy_state_of(&p, &expected) } else { ls };
        entries.push(AgentTextEntry { path: p, state });
    }
    AgentTextState { install, links, entries, command, install_step }
}

/// `displayHomePath(file)`.
pub fn display_home_path(file: &str) -> String {
    crate::commands::init::user::display_home_path(file, &crate::commands::init::user::homedir())
}

/* ── computer integrations ── */

pub struct ComputerIntegration {
    pub name: String,
    pub version: Option<String>,
    pub incompatible: Option<String>,
}

/// `computerIntegrationCandidates(cwd)`.
pub fn computer_integration_candidates(cwd: &str) -> Vec<ComputerIntegration> {
    crate::discovery::integrations::computer_integration_candidates(cwd)
        .into_iter()
        .map(|c| ComputerIntegration { name: c.name, version: c.version, incompatible: c.incompatible })
        .collect()
}

/// `availableComputerIntegrations(cwd, installed)`.
pub fn available_computer_integrations(cwd: &str, installed: &[String]) -> Vec<ComputerIntegration> {
    crate::discovery::integrations::available_computer_integrations(cwd, installed)
        .into_iter()
        .map(|c| ComputerIntegration { name: c.name, version: c.version, incompatible: c.incompatible })
        .collect()
}
