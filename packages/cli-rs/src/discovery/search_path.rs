//! Port of `foundation/env/search-path.mjs` (POSIX): the `astryx` commands
//! on PATH and the CLI package each one starts.

use super::nodepath as np;

const CLI_PACKAGE: &str = "@astryxdesign/cli";
const MAX_SHIM_BYTES: u64 = 64 * 1024;

fn cli_version_at(dir: &str) -> Option<String> {
    let pkg = np::read_json(&np::join2(dir, "package.json"))?;
    if pkg.get("name").and_then(|v| v.as_str()) != Some(CLI_PACKAGE) {
        return None;
    }
    Some(match pkg.get("version") {
        None | Some(crate::json::Value::Null) => String::new(),
        v => super::paths::js_string(v),
    })
}

fn hands_off_at(dir: &str) -> bool {
    np::exists(&np::join(&[dir, "foundation", "release", "choose.mjs"]))
}

fn find_up(start: &str) -> Option<String> {
    let mut dir = start.to_string();
    loop {
        if cli_version_at(&dir).is_some() {
            return Some(dir);
        }
        let parent = np::dirname(&dir);
        if parent == dir {
            return None;
        }
        dir = parent;
    }
}

/// `astryxCliRootOf(file)`.
pub fn astryx_cli_root_of(file: &str) -> Option<String> {
    let real = np::realpath(file)?;
    if let Some(d) = find_up(&np::dirname(&real)) {
        return Some(d);
    }
    let meta = std::fs::metadata(&real).ok()?;
    if meta.len() > MAX_SHIM_BYTES {
        return None;
    }
    let text = np::read_text(&real)?;
    let base = np::dirname(file);
    let target_re = regress::Regex::with_flags(r"^\s*(?:#|@?rem|::)\s*cmd-shim-target=(.+?)\s*$", "imu").unwrap();
    if let Some(m) = target_re.find(&text) {
        let target = &text[m.group(1).unwrap()];
        if np::is_absolute(target) {
            if let Some(d) = find_up(&np::dirname(target)) {
                return Some(d);
            }
        }
    }
    let pkg_re = regress::Regex::with_flags(
        r#"((?:\$basedir(?:_abs|_win)?|%~dp0|%dp0%|\$PSScriptRoot)?[^"'\s:;$%]*node_modules[\\/]@astryxdesign[\\/]cli)(?=[\\/"'])"#,
        "gu",
    )
    .unwrap();
    let base_re = regress::Regex::with_flags(r"^(?:\$basedir(?:_abs|_win)?|%~dp0|%dp0%|\$PSScriptRoot)[\\/]?", "u").unwrap();
    for m in pkg_re.find_iter(&text) {
        let named = &text[m.group(1).unwrap()];
        let named = match base_re.find(named) {
            Some(b) => format!("{base}/{}", &named[b.end()..]),
            None => named.to_string(),
        };
        let named = named.replace('\\', "/");
        let dir = np::resolve(&[&base, &named]);
        if cli_version_at(&dir).is_some() {
            return Some(dir);
        }
    }
    None
}

fn names_cli_package(file: &str) -> bool {
    let Some(real) = np::realpath(file) else { return false };
    match std::fs::metadata(&real) {
        Ok(m) if m.len() <= MAX_SHIM_BYTES => {}
        _ => return false,
    }
    let Some(text) = np::read_text(&real) else { return false };
    regress::Regex::with_flags(r"node_modules[\\/]@astryxdesign[\\/]cli[\\/]", "u")
        .unwrap()
        .find(&text)
        .is_some()
}

fn is_runnable(file: &str) -> bool {
    match std::fs::metadata(file) {
        Ok(m) if m.is_file() => {
            // accessSync(X_OK) for this process's user.
            let Ok(c) = std::ffi::CString::new(file) else { return false };
            unsafe { libc_access(c.as_ptr()) }
        }
        _ => false,
    }
}

extern "C" {
    fn access(path: *const std::os::raw::c_char, mode: i32) -> i32;
}

unsafe fn libc_access(p: *const std::os::raw::c_char) -> bool {
    access(p, 1) == 0
}

/// `executablesOnSearchPath(names)`.
pub fn executables_on_search_path(names: &[&str], search_path: &str) -> Vec<String> {
    let mut files = Vec::new();
    for dir in search_path.split(':') {
        if dir.is_empty() {
            continue;
        }
        if let Some(f) = names.iter().map(|n| np::join2(dir, n)).find(|c| is_runnable(c)) {
            files.push(f);
        }
    }
    files
}

/// One `astryx` command on PATH.
#[derive(Debug, Clone, PartialEq)]
pub struct SearchPathCommand {
    pub file: String,
    pub astryx: bool,
    pub cli_root: Option<String>,
    pub version: Option<String>,
    pub hands_off: Option<bool>,
}

/// `astryxCommandsOnSearchPath()`.
pub fn astryx_commands_on_search_path() -> Vec<SearchPathCommand> {
    let sp = std::env::var("PATH").or_else(|_| std::env::var("Path")).unwrap_or_default();
    astryx_commands_on(&sp)
}

/// `astryxCommandsOnSearchPath({searchPath})`.
pub fn astryx_commands_on(search_path: &str) -> Vec<SearchPathCommand> {
    let mut rows = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for file in executables_on_search_path(&["astryx"], search_path) {
        let key = np::realpath(&file).unwrap_or_else(|| file.clone());
        if seen.contains(&key) {
            continue;
        }
        seen.push(key);
        let cli_root = astryx_cli_root_of(&file);
        rows.push(SearchPathCommand {
            astryx: cli_root.is_some() || names_cli_package(&file),
            version: cli_root.as_deref().and_then(cli_version_at),
            hands_off: cli_root.as_deref().map(hands_off_at),
            cli_root,
            file,
        });
    }
    rows
}
