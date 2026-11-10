//! Module specifier resolution, as Node resolves `import` (ESM mode) and as
//! jiti resolves inside a `.ts` graph (CommonJS-style: extension and
//! `index` probing).

use crate::json::Value;
use std::path::{Component, Path, PathBuf};

/// Which loader resolves and runs a module graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Mode {
    /// Node's native `import`.
    Esm,
    /// jiti (the JS CLI loads `.ts` through it).
    Jiti,
    /// Node's CommonJS `require`.
    Cjs,
}

/// Where a specifier points.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolved {
    /// A Node builtin, without the `node:` prefix (e.g. "path").
    Builtin(String),
    /// A file on disk, by real path.
    File(PathBuf),
}

/// A resolution failure, with Node's code and message.
#[derive(Debug, Clone)]
pub struct ResolveError {
    pub code: &'static str,
    pub message: String,
}

pub const BUILTINS: &[&str] = &[
    "assert", "assert/strict", "async_hooks", "buffer", "child_process", "constants", "crypto",
    "events", "fs", "fs/promises", "module", "os", "path", "path/posix", "perf_hooks", "process",
    "querystring", "readline", "stream", "string_decoder", "timers", "tty", "url", "util",
    "util/types", "v8", "vm", "worker_threads", "zlib",
];

/// Node's ESM conditions (Node 22).
const ESM_CONDITIONS: &[&str] = &["node", "import", "module-sync", "node-addons", "default"];
/// jiti resolves through Node's CommonJS resolver with the import conditions
/// it passes; the CommonJS `require` condition also matches.
const JITI_CONDITIONS: &[&str] = &["node", "import", "require", "module-sync", "node-addons", "default"];

/// Lexically normalize a path (no filesystem access).
pub fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// The real path of an existing file, as Node keys its module cache.
pub fn real(p: &Path) -> PathBuf {
    super::vfs::canonicalize(p).unwrap_or_else(|_| normalize(p))
}

fn is_file(p: &Path) -> bool {
    super::vfs::is_file(p)
}

fn is_dir(p: &Path) -> bool {
    super::vfs::is_dir(p)
}

/// Percent-decode a file URL path.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// `url.fileURLToPath` for `file:` URLs (POSIX).
pub fn file_url_to_path(url: &str) -> Option<PathBuf> {
    let rest = url.strip_prefix("file://")?;
    let rest = rest.strip_prefix("localhost").unwrap_or(rest);
    let rest = rest.split(['?', '#']).next().unwrap_or("");
    Some(PathBuf::from(percent_decode(rest)))
}

/// `url.pathToFileURL(p).href` (POSIX), with Node's escaping.
pub fn path_to_file_url(p: &Path) -> String {
    let s = p.to_string_lossy();
    let mut out = String::from("file://");
    for b in s.as_bytes() {
        let c = *b;
        let keep = c.is_ascii_alphanumeric()
            || matches!(
                c,
                b'/' | b'-' | b'.' | b'_' | b'~' | b'!' | b'$' | b'&' | b'\'' | b'(' | b')' | b'*'
                    | b'+' | b',' | b';' | b'=' | b':' | b'@'
            );
        if keep {
            out.push(c as char);
        } else {
            out.push_str(&format!("%{:02X}", c));
        }
    }
    out
}

fn read_json(p: &Path) -> Option<Value> {
    let text = super::vfs::read_to_string(p).ok()?;
    serde_json::from_str(&text).ok()
}

/// The nearest `package.json` at or above `dir`, with its parsed content.
pub fn nearest_package_json(dir: &Path) -> Option<(PathBuf, Value)> {
    let mut d = Some(dir);
    while let Some(cur) = d {
        if cur.file_name().map(|n| n == "node_modules").unwrap_or(false) {
            return None;
        }
        let pj = cur.join("package.json");
        if is_file(&pj) {
            if let Some(v) = read_json(&pj) {
                return Some((pj, v));
            }
        }
        d = cur.parent();
    }
    None
}

/// Whether a `.js` file is an ES module by its package's `"type"`.
pub fn package_type_is_module(file: &Path) -> bool {
    file.parent()
        .and_then(nearest_package_json)
        .map(|(_, v)| v.get("type").and_then(|t| t.as_str()) == Some("module"))
        .unwrap_or(false)
}

fn not_found_module(path: &Path, from: &Path) -> ResolveError {
    ResolveError {
        code: "ERR_MODULE_NOT_FOUND",
        message: format!(
            "Cannot find module '{}' imported from {}",
            path.display(),
            from.display()
        ),
    }
}

/// Per-load resolution settings (jiti's `extensions` and the aliases a
/// caller maps specifiers to). The default changes nothing.
#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct Profile {
    /// Specifier -> file, checked before anything else.
    pub aliases: Vec<(String, PathBuf)>,
    /// jiti's extension probe order (with the dots), for `Mode::Jiti`.
    pub extensions: Option<Vec<String>>,
    /// Specifier -> virtual module id (the engine resolves these itself).
    pub virtuals: Vec<(String, u64)>,
    /// jiti's synchronous `jiti(file)` path: package `exports` match the
    /// require conditions first, then the import conditions.
    pub sync: bool,
    /// Real path -> source text used in place of the file's.
    pub overrides: Vec<(PathBuf, String)>,
}

thread_local! {
    static JITI_EXTS_OVERRIDE: std::cell::RefCell<Option<Vec<String>>> = const { std::cell::RefCell::new(None) };
    static JITI_CONDITIONS_OVERRIDE: std::cell::Cell<Option<&'static [&'static str]>> = const { std::cell::Cell::new(None) };
}

/// Internal code for an exports target that does not exist; reported as
/// `MODULE_NOT_FOUND` with the target's path.
const EXPORT_TARGET_MISSING: &str = "MODULE_NOT_FOUND_EXPORT_TARGET";

/// Resolve `specifier` imported from the file `from`.
pub fn resolve(specifier: &str, from: &Path, mode: Mode) -> Result<Resolved, ResolveError> {
    resolve_with(specifier, from, mode, &Profile::default())
}

/// [`resolve`] under a [`Profile`].
pub fn resolve_with(
    specifier: &str,
    from: &Path,
    mode: Mode,
    profile: &Profile,
) -> Result<Resolved, ResolveError> {
    if let Some((_, target)) = profile.aliases.iter().find(|(s, _)| s == specifier) {
        return Ok(Resolved::File(real(target)));
    }
    let prev = JITI_EXTS_OVERRIDE.with(|o| std::mem::replace(&mut *o.borrow_mut(), profile.extensions.clone()));
    let result = if profile.sync && mode == Mode::Jiti {
        // jiti tries the require conditions, then the import conditions.
        let first = with_jiti_conditions(CJS_CONDITIONS, || resolve_inner(specifier, from, mode));
        match first {
            Err(e) => with_jiti_conditions(JITI_IMPORT_CONDITIONS, || resolve_inner(specifier, from, mode)).map_err(|_| e),
            ok => ok,
        }
    } else if mode == Mode::Jiti {
        // jiti's import tries the import conditions, then the require
        // conditions: a missing import target is retried, and when both
        // are missing the error names the require target.
        match resolve_inner(specifier, from, mode) {
            Err(e) if e.code == EXPORT_TARGET_MISSING => with_jiti_conditions(CJS_CONDITIONS, || resolve_inner(specifier, from, mode)),
            other => other,
        }
    } else {
        resolve_inner(specifier, from, mode)
    };
    JITI_EXTS_OVERRIDE.with(|o| *o.borrow_mut() = prev);
    // CommonJS (and jiti) name the specifier as written.
    match result {
        Err(e) if e.code == EXPORT_TARGET_MISSING => Err(ResolveError { code: "MODULE_NOT_FOUND", message: e.message }),
        Err(e) if e.code == "MODULE_NOT_FOUND" => Err(ResolveError {
            code: e.code,
            message: format!("Cannot find module '{specifier}'\nRequire stack:\n- {}", from.display()),
        }),
        other => other,
    }
}

fn resolve_inner(specifier: &str, from: &Path, mode: Mode) -> Result<Resolved, ResolveError> {
    if let Some(name) = specifier.strip_prefix("node:") {
        return Ok(Resolved::Builtin(name.to_string()));
    }
    if BUILTINS.contains(&specifier) {
        return Ok(Resolved::Builtin(specifier.to_string()));
    }
    let base = from.parent().unwrap_or(Path::new("/"));
    if specifier.starts_with("file://") {
        let p = file_url_to_path(specifier).unwrap_or_default();
        return resolve_path(&p, from, mode);
    }
    if specifier.starts_with('/') || specifier.starts_with("./") || specifier.starts_with("../")
        || specifier == "." || specifier == ".."
    {
        let target = normalize(&base.join(if mode == Mode::Esm {
            percent_decode(specifier)
        } else {
            specifier.to_string()
        }));
        return resolve_path(&target, from, mode);
    }
    if specifier.starts_with('#') {
        return resolve_imports(specifier, from, mode);
    }
    resolve_package(specifier, from, mode)
}

fn resolve_path(target: &Path, from: &Path, mode: Mode) -> Result<Resolved, ResolveError> {
    match mode {
        Mode::Esm => {
            if is_file(target) {
                return Ok(Resolved::File(real(target)));
            }
            if is_dir(target) {
                return Err(ResolveError {
                    code: "ERR_UNSUPPORTED_DIR_IMPORT",
                    message: format!(
                        "Directory import '{}' is not supported resolving ES modules imported from {}",
                        target.display(),
                        from.display()
                    ),
                });
            }
            Err(not_found_module(target, from))
        }
        Mode::Jiti | Mode::Cjs => match cjs_file_or_dir(target, mode) {
            Some(p) => Ok(Resolved::File(real(&p))),
            None => Err(ResolveError {
                code: "MODULE_NOT_FOUND",
                message: format!(
                    "Cannot find module '{}'\nRequire stack:\n- {}",
                    target.display(),
                    from.display()
                ),
            }),
        },
    }
}

/// jiti's extension list (the default), tried after the exact path.
const JITI_EXTS: &[&str] = &[
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx", ".json",
];

fn cjs_file_or_dir(target: &Path, mode: Mode) -> Option<PathBuf> {
    if is_file(target) {
        return Some(target.to_path_buf());
    }
    let s = target.to_string_lossy().to_string();
    for ext in exts(mode).iter() {
        let p = PathBuf::from(format!("{s}{ext}"));
        if is_file(&p) {
            return Some(p);
        }
    }
    // A `.js` import may name a `.ts` source.
    if mode == Mode::Jiti {
      if let Some(stem) = s.strip_suffix(".js") {
        for ext in [".ts", ".tsx"] {
            let p = PathBuf::from(format!("{stem}{ext}"));
            if is_file(&p) {
                return Some(p);
            }
        }
      }
    }
    if is_dir(target) {
        if let Some(pj) = read_json(&target.join("package.json")) {
            if let Some(main) = pj.get("main").and_then(|m| m.as_str()) {
                let m = normalize(&target.join(main));
                if let Some(p) = cjs_file(&m, mode).or_else(|| cjs_index(&m, mode)) {
                    return Some(p);
                }
            }
        }
        return cjs_index(target, mode);
    }
    None
}

fn cjs_file(target: &Path, mode: Mode) -> Option<PathBuf> {
    if is_file(target) {
        return Some(target.to_path_buf());
    }
    let s = target.to_string_lossy().to_string();
    exts(mode)
        .iter()
        .map(|e| PathBuf::from(format!("{s}{e}")))
        .find(|p| is_file(p))
}

fn cjs_index(dir: &Path, mode: Mode) -> Option<PathBuf> {
    exts(mode)
        .iter()
        .map(|e| dir.join(format!("index{e}")))
        .find(|p| is_file(p))
}

/// Split a bare specifier into package name and subpath ("." or "./x").
fn split_package(spec: &str) -> Option<(String, String)> {
    let mut parts = spec.splitn(3, '/');
    let first = parts.next()?;
    let (name, rest) = if first.starts_with('@') {
        let second = parts.next()?;
        (format!("{first}/{second}"), parts.next())
    } else {
        let rest = spec.splitn(2, '/').nth(1);
        (first.to_string(), rest)
    };
    if name.is_empty() || name.starts_with('.') || name.contains('\\') || name.contains('%') {
        return None;
    }
    let sub = match rest {
        Some(r) if !r.is_empty() => format!("./{r}"),
        _ => ".".to_string(),
    };
    Some((name, sub))
}

const CJS_CONDITIONS: &[&str] = &["node", "require", "module-sync", "node-addons", "default"];

/// The import conditions jiti's synchronous path falls back to.
const JITI_IMPORT_CONDITIONS: &[&str] = &["node", "import", "default"];

fn with_jiti_conditions<R>(c: &'static [&'static str], f: impl FnOnce() -> R) -> R {
    let prev = JITI_CONDITIONS_OVERRIDE.with(|o| o.replace(Some(c)));
    let r = f();
    JITI_CONDITIONS_OVERRIDE.with(|o| o.set(prev));
    r
}

fn conditions(mode: Mode) -> &'static [&'static str] {
    match mode {
        Mode::Esm => ESM_CONDITIONS,
        Mode::Jiti => JITI_CONDITIONS_OVERRIDE.with(|o| o.get()).unwrap_or(JITI_CONDITIONS),
        Mode::Cjs => CJS_CONDITIONS,
    }
}

/// Node's CommonJS extension list.
const CJS_EXTS: &[&str] = &[".js", ".json", ".node"];

fn exts(mode: Mode) -> Vec<String> {
    let own = |l: &[&str]| l.iter().map(|e| e.to_string()).collect::<Vec<_>>();
    match mode {
        Mode::Cjs => own(CJS_EXTS),
        _ => JITI_EXTS_OVERRIDE.with(|o| o.borrow().clone()).unwrap_or_else(|| own(JITI_EXTS)),
    }
}

fn resolve_package(spec: &str, from: &Path, mode: Mode) -> Result<Resolved, ResolveError> {
    let Some((name, sub)) = split_package(spec) else {
        return Err(ResolveError {
            code: "ERR_INVALID_MODULE_SPECIFIER",
            message: format!(
                "Invalid module \"{spec}\" is not a valid package name imported from {}",
                from.display()
            ),
        });
    };
    // Self-reference through the nearest package.json's own name + exports.
    if let Some((pj_path, pj)) = from.parent().and_then(nearest_package_json) {
        if pj.get("name").and_then(|n| n.as_str()) == Some(name.as_str()) {
            if let Some(exports) = pj.get("exports") {
                let dir = pj_path.parent().unwrap().to_path_buf();
                return resolve_exports(&dir, exports, &sub, spec, from, mode, &pj_path);
            }
        }
    }
    let mut d = from.parent();
    while let Some(cur) = d {
        if cur.file_name().map(|n| n != "node_modules").unwrap_or(true) {
            let pkg_dir = cur.join("node_modules").join(&name);
            if is_dir(&pkg_dir) {
                return resolve_in_package(&pkg_dir, &sub, spec, from, mode);
            }
        }
        d = cur.parent();
    }
    Err(match mode {
        Mode::Esm => ResolveError {
            code: "ERR_MODULE_NOT_FOUND",
            message: format!("Cannot find package '{name}' imported from {}", from.display()),
        },
        Mode::Jiti | Mode::Cjs => ResolveError {
            code: "MODULE_NOT_FOUND",
            message: format!("Cannot find module '{spec}'\nRequire stack:\n- {}", from.display()),
        },
    })
}

fn resolve_in_package(
    pkg_dir: &Path,
    sub: &str,
    spec: &str,
    from: &Path,
    mode: Mode,
) -> Result<Resolved, ResolveError> {
    let pj_path = pkg_dir.join("package.json");
    let pj = read_json(&pj_path);
    if let Some(exports) = pj.as_ref().and_then(|p| p.get("exports")) {
        return resolve_exports(pkg_dir, exports, sub, spec, from, mode, &pj_path);
    }
    if sub == "." {
        let main = pj.as_ref().and_then(|p| p.get("main")).and_then(|m| m.as_str());
        if let Some(main) = main {
            let m = normalize(&pkg_dir.join(main));
            let found = match mode {
                Mode::Esm => legacy_main(&m),
                Mode::Jiti | Mode::Cjs => cjs_file(&m, mode).or_else(|| cjs_index(&m, mode)),
            };
            if let Some(p) = found {
                return Ok(Resolved::File(real(&p)));
            }
        }
        let idx = match mode {
            Mode::Esm => Some(pkg_dir.join("index.js")).filter(|p| is_file(p)),
            Mode::Jiti | Mode::Cjs => cjs_index(pkg_dir, mode),
        };
        return match idx {
            Some(p) => Ok(Resolved::File(real(&p))),
            None => Err(match mode {
                // Node 22 names the file legacy main resolution last
                // looked for: the `main` target, else `index.js`.
                Mode::Esm => ResolveError {
                    code: "ERR_MODULE_NOT_FOUND",
                    message: format!(
                        "Cannot find package '{}' imported from {}",
                        match main {
                            Some(m) => normalize(&pkg_dir.join(m)),
                            None => pkg_dir.join("index.js"),
                        }
                        .display(),
                        from.display()
                    ),
                },
                Mode::Jiti | Mode::Cjs => ResolveError {
                    code: "MODULE_NOT_FOUND",
                    message: format!(
                        "Cannot find module '{spec}'\nRequire stack:\n- {}",
                        from.display()
                    ),
                },
            }),
        };
    }
    let target = normalize(&pkg_dir.join(&sub[2..]));
    resolve_path(&target, from, mode)
}

fn legacy_main(m: &Path) -> Option<PathBuf> {
    let s = m.to_string_lossy().to_string();
    let candidates = [
        m.to_path_buf(),
        PathBuf::from(format!("{s}.js")),
        PathBuf::from(format!("{s}.json")),
        PathBuf::from(format!("{s}.node")),
        m.join("index.js"),
        m.join("index.json"),
        m.join("index.node"),
    ];
    candidates.into_iter().find(|p| is_file(p))
}

fn not_exported(pkg_dir: &Path, sub: &str, from: &Path, pj_path: &Path) -> ResolveError {
    let _ = pkg_dir;
    ResolveError {
        code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
        message: if sub == "." {
            format!(
                "No \"exports\" main defined in {} imported from {}",
                pj_path.display(),
                from.display()
            )
        } else {
            format!(
                "Package subpath '{sub}' is not defined by \"exports\" in {} imported from {}",
                pj_path.display(),
                from.display()
            )
        },
    }
}

fn resolve_exports(
    pkg_dir: &Path,
    exports: &Value,
    sub: &str,
    spec: &str,
    from: &Path,
    mode: Mode,
    pj_path: &Path,
) -> Result<Resolved, ResolveError> {
    let _ = spec;
    // Normalize: a string, array, or condition object is the "." export.
    let is_subpath_map = exports
        .as_object()
        .map(|o| o.keys().next().map(|k| k.starts_with('.')).unwrap_or(false))
        .unwrap_or(false);
    let target = if is_subpath_map {
        let map = exports.as_object().unwrap();
        match_subpath(map, sub)
            .and_then(|(t, star)| resolve_target(pkg_dir, t, star.as_deref(), mode))
    } else if sub == "." {
        resolve_target(pkg_dir, exports, None, mode)
    } else {
        None
    };
    match target {
        Some(Some(p)) => {
            if is_file(&p) {
                Ok(Resolved::File(real(&p)))
            } else {
                match mode {
                    Mode::Esm => Err(not_found_module(&p, from)),
                    // A package's export target that is missing is named by
                    // its path, not by the specifier (Node and jiti both).
                    Mode::Jiti | Mode::Cjs => Err(ResolveError {
                        code: EXPORT_TARGET_MISSING,
                        message: format!(
                            "Cannot find module '{}'\nRequire stack:\n- {}",
                            p.display(),
                            from.display()
                        ),
                    }),
                }
            }
        }
        _ => Err(not_exported(pkg_dir, sub, from, pj_path)),
    }
}

/// Find the exports entry for `sub`, with the `*` capture.
fn match_subpath<'a>(
    map: &'a crate::json::Map<String, Value>,
    sub: &str,
) -> Option<(&'a Value, Option<String>)> {
    if let Some(v) = map.get(sub) {
        if !sub.contains('*') {
            return Some((v, None));
        }
    }
    // Longest pattern prefix wins (Node's PATTERN_KEY_COMPARE).
    let mut best: Option<(&str, &Value, String)> = None;
    for (k, v) in map {
        if let Some(star) = k.find('*') {
            let (pre, post) = (&k[..star], &k[star + 1..]);
            if sub.starts_with(pre) && sub.len() >= pre.len() + post.len() && sub.ends_with(post)
                && sub != pre
            {
                let cap = sub[pre.len()..sub.len() - post.len()].to_string();
                let better = match &best {
                    None => true,
                    Some((bk, _, _)) => pattern_cmp(k, bk),
                };
                if better {
                    best = Some((k, v, cap));
                }
            }
        }
    }
    best.map(|(_, v, c)| (v, Some(c)))
}

fn pattern_cmp(a: &str, b: &str) -> bool {
    let ai = a.find('*').map(|i| i + 1).unwrap_or(a.len());
    let bi = b.find('*').map(|i| i + 1).unwrap_or(b.len());
    if ai != bi {
        return ai > bi;
    }
    a.len() > b.len()
}

/// Resolve an exports target. `None` = no match; `Some(None)` = explicitly
/// excluded (null); `Some(Some(p))` = a path.
fn resolve_target(
    pkg_dir: &Path,
    target: &Value,
    star: Option<&str>,
    mode: Mode,
) -> Option<Option<PathBuf>> {
    match target {
        Value::String(s) => {
            if !s.starts_with("./") {
                return None;
            }
            let s = match star {
                Some(c) => s.replace('*', c),
                None => s.clone(),
            };
            Some(Some(normalize(&pkg_dir.join(&s))))
        }
        Value::Array(items) => {
            for item in items {
                if let Some(r) = resolve_target(pkg_dir, item, star, mode) {
                    return Some(r);
                }
            }
            None
        }
        Value::Object(conds) => {
            for (k, v) in conds {
                if conditions(mode).contains(&k.as_str()) {
                    if let Some(r) = resolve_target(pkg_dir, v, star, mode) {
                        return Some(r);
                    }
                }
            }
            None
        }
        Value::Null => Some(None),
        _ => None,
    }
}

fn resolve_imports(spec: &str, from: &Path, mode: Mode) -> Result<Resolved, ResolveError> {
    let not_defined = |pj: Option<&Path>| ResolveError {
        code: "ERR_PACKAGE_IMPORT_NOT_DEFINED",
        message: format!(
            "Package import specifier \"{spec}\" is not defined{} imported from {}",
            pj.map(|p| format!(" in package {}", p.display())).unwrap_or_default(),
            from.display()
        ),
    };
    let Some((pj_path, pj)) = from.parent().and_then(nearest_package_json) else {
        return Err(not_defined(None));
    };
    let dir = pj_path.parent().unwrap().to_path_buf();
    let Some(map) = pj.get("imports").and_then(|i| i.as_object()) else {
        return Err(not_defined(Some(&pj_path)));
    };
    let found = match_subpath(map, spec);
    let Some((t, star)) = found else {
        return Err(not_defined(Some(&pj_path)));
    };
    // An imports target may be a bare package specifier.
    if let Value::String(s) = t {
        if !s.starts_with("./") {
            let s = match &star {
                Some(c) => s.replace('*', c),
                None => s.clone(),
            };
            return resolve_package(&s, from, mode);
        }
    }
    match resolve_target(&dir, t, star.as_deref(), mode) {
        Some(Some(p)) if is_file(&p) => Ok(Resolved::File(real(&p))),
        Some(Some(p)) => Err(not_found_module(&p, from)),
        _ => Err(not_defined(Some(&pj_path))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_packages() {
        assert_eq!(split_package("react"), Some(("react".into(), ".".into())));
        assert_eq!(split_package("@a/b/c/d"), Some(("@a/b".into(), "./c/d".into())));
        assert_eq!(split_package("a/b"), Some(("a".into(), "./b".into())));
    }

    #[test]
    fn globs() {
        assert!(glob_match("**/*.css", "dist/a/b.css"));
        assert!(glob_match("**/*.css", "b.css"));
        assert!(!glob_match("**/*.css", "dist/b.js"));
        assert!(glob_match("**/*.stylex.js", "dist/theme/tokens.stylex.js"));
        assert!(!glob_match("*.css", "a/b.css"));
    }

    #[test]
    fn file_urls() {
        assert_eq!(path_to_file_url(Path::new("/a b/c#d.mjs")), "file:///a%20b/c%23d.mjs");
        assert_eq!(file_url_to_path("file:///a%20b/c.mjs"), Some(PathBuf::from("/a b/c.mjs")));
    }
}

/// Whether the package that holds `file` declares that loading `file` has no
/// side effects: `"sideEffects": false`, or a pattern list that `file` does
/// not match (bundler semantics: a pattern without `/` matches the base name).
pub fn package_is_pure(file: &Path) -> bool {
    let Some((pj_path, pj)) = file.parent().and_then(nearest_package_json) else {
        return false;
    };
    match pj.get("sideEffects") {
        Some(Value::Bool(false)) => true,
        Some(Value::Array(patterns)) => {
            let dir = pj_path.parent().unwrap_or(Path::new("/"));
            let rel = file.strip_prefix(dir).unwrap_or(file).to_string_lossy().into_owned();
            let base = file.file_name().map(|b| b.to_string_lossy().into_owned()).unwrap_or_default();
            !patterns.iter().filter_map(|p| p.as_str()).any(|p| {
                let p = p.strip_prefix("./").unwrap_or(p);
                if p.contains('/') { glob_match(p, &rel) } else { glob_match(p, &base) }
            })
        }
        _ => false,
    }
}

/// Glob match: `**` spans directories, `*` and `?` stay within one.
pub fn glob_match(pattern: &str, path: &str) -> bool {
    fn go(p: &[u8], s: &[u8]) -> bool {
        if p.is_empty() {
            return s.is_empty();
        }
        if p.starts_with(b"**/") {
            // Zero or more whole directories.
            if go(&p[3..], s) {
                return true;
            }
            return s.iter().enumerate().any(|(i, c)| *c == b'/' && go(&p[3..], &s[i + 1..]));
        }
        if p.starts_with(b"**") {
            return (0..=s.len()).any(|i| go(&p[2..], &s[i..]));
        }
        match p[0] {
            b'*' => (0..=s.len()).take_while(|i| *i == 0 || s[i - 1] != b'/').any(|i| go(&p[1..], &s[i..])),
            b'?' => !s.is_empty() && s[0] != b'/' && go(&p[1..], &s[1..]),
            c => !s.is_empty() && s[0] == c && go(&p[1..], &s[1..]),
        }
    }
    go(pattern.as_bytes(), path.as_bytes())
}

/// For a bare import of a package root whose package has no `"exports"`,
/// declares `"sideEffects": false` and names an ES `"module"` entry: that
/// entry. Bundlers load it in place of `"main"`; it can be cut down to the
/// names imported (see `prune.rs`).
pub fn pure_module_entry(spec: &str, from: &Path) -> Option<PathBuf> {
    let (name, sub) = split_package(spec)?;
    if sub != "." {
        return None;
    }
    let mut d = from.parent();
    while let Some(cur) = d {
        if cur.file_name().map(|n| n != "node_modules").unwrap_or(true) {
            let pkg_dir = cur.join("node_modules").join(&name);
            if is_dir(&pkg_dir) {
                let pj = read_json(&pkg_dir.join("package.json"))?;
                if pj.get("exports").is_some() || pj.get("sideEffects") != Some(&Value::Bool(false)) {
                    return None;
                }
                // Only when "main" is ES too: a CommonJS "main" can load a
                // different graph (other dependency builds), so its output
                // can differ from the "module" build.
                let main = pj.get("main").and_then(Value::as_str).unwrap_or("index.js");
                let main_is_esm = main.ends_with(".mjs")
                    || (pj.get("type").and_then(Value::as_str) == Some("module") && !main.ends_with(".cjs"));
                if !main_is_esm {
                    return None;
                }
                let module = pj.get("module")?.as_str()?;
                let p = normalize(&pkg_dir.join(module));
                return is_file(&p).then(|| real(&p));
            }
        }
        d = cur.parent();
    }
    None
}
