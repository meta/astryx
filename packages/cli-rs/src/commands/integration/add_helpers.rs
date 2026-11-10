//! Shared helpers for integration contribution writers (`add-helpers.mjs`,
//! `path-safety.mjs`): package resolution, path safety, package.json
//! updates, and the staged write transaction.

use super::jsjson;
use crate::json::{Map, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};

/// An error a writer throws: the message, the stable code, suggestions.
#[derive(Debug, Clone)]
pub struct AddError {
    pub message: String,
    pub code: Option<String>,
    pub suggestions: Vec<(String, String)>,
}

impl AddError {
    pub fn new(message: impl Into<String>, code: &str) -> AddError {
        AddError { message: message.into(), code: Some(code.to_string()), suggestions: Vec::new() }
    }
    /// A plain `Error` (no code).
    pub fn plain(message: impl Into<String>) -> AddError {
        AddError { message: message.into(), code: None, suggestions: Vec::new() }
    }
}

pub type R<T> = Result<T, AddError>;

// ── Paths (node:path, POSIX) ─────────────────────────────────────────

/// `path.resolve(base, p)`.
pub fn resolve(base: &Path, p: &str) -> PathBuf {
    let joined = if p.starts_with('/') { PathBuf::from(p) } else { base.join(p) };
    normalize(&joined)
}

/// Lexical normalization, as `path.resolve` does it.
pub fn normalize(p: &Path) -> PathBuf {
    let mut out: Vec<String> = Vec::new();
    for c in p.components() {
        match c {
            Component::RootDir | Component::Prefix(_) => out.clear(),
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            Component::Normal(s) => out.push(s.to_string_lossy().to_string()),
        }
    }
    PathBuf::from(format!("/{}", out.join("/")))
}

/// `path.relative(from, to)` with `/` separators.
pub fn relative(from: &Path, to: &Path) -> String {
    let f: Vec<String> = normalize(from).components().filter_map(|c| match c {
        Component::Normal(s) => Some(s.to_string_lossy().to_string()),
        _ => None,
    }).collect();
    let t: Vec<String> = normalize(to).components().filter_map(|c| match c {
        Component::Normal(s) => Some(s.to_string_lossy().to_string()),
        _ => None,
    }).collect();
    let mut i = 0;
    while i < f.len() && i < t.len() && f[i] == t[i] {
        i += 1;
    }
    let mut parts: Vec<String> = Vec::new();
    for _ in i..f.len() {
        parts.push("..".into());
    }
    parts.extend(t[i..].iter().cloned());
    parts.join("/")
}

pub fn basename(p: &Path) -> String {
    p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
}

pub fn path_str(p: &Path) -> String {
    p.to_string_lossy().to_string()
}

/// A path-safety failure: message and its code.
#[derive(Debug, Clone)]
pub struct PathSafetyError {
    pub message: String,
    pub code: String,
}

fn canonical_path(target: &Path, hops: usize) -> Result<PathBuf, ()> {
    if hops > 40 {
        return Err(());
    }
    match fs::symlink_metadata(target) {
        Err(e) => {
            let missing = e.kind() == std::io::ErrorKind::NotFound || e.raw_os_error() == Some(20);
            if !missing {
                return Err(());
            }
            let parent = target.parent().unwrap_or(target);
            if parent == target {
                return Ok(target.to_path_buf());
            }
            Ok(canonical_path(parent, hops)?.join(target.file_name().unwrap_or_default()))
        }
        Ok(meta) => {
            if let Ok(r) = fs::canonicalize(target) {
                return Ok(r);
            }
            if !meta.file_type().is_symlink() {
                return Err(());
            }
            let link = fs::read_link(target).map_err(|_| ())?;
            let dir = fs::canonicalize(target.parent().unwrap_or(Path::new("/"))).map_err(|_| ())?;
            canonical_path(&resolve(&dir, &link.to_string_lossy()), hops + 1)
        }
    }
}

/// `assertWithin(targetPath, rootDir, {label, allowAbsolute})`.
pub fn assert_within(target: &str, root: &Path, label: &str, allow_absolute: bool) -> Result<PathBuf, PathSafetyError> {
    if target.is_empty() {
        return Err(PathSafetyError { message: format!("Invalid {label}: must be a non-empty string"), code: "PATH_INVALID".into() });
    }
    if target.contains('\0') {
        return Err(PathSafetyError { message: format!("Invalid {label}: contains a NUL byte"), code: "PATH_INVALID".into() });
    }
    if target.starts_with('/') && !allow_absolute {
        return Err(PathSafetyError {
            message: format!("Invalid {label} \"{target}\": absolute paths are not allowed. Use a path relative to the project root."),
            code: "PATH_ABSOLUTE".into(),
        });
    }
    let abs_root = normalize(root);
    let resolved = resolve(&abs_root, target);
    let root_s = path_str(&abs_root);
    let root_sep = if root_s.ends_with('/') { root_s.clone() } else { format!("{root_s}/") };
    let res_s = path_str(&resolved);
    if res_s != root_s && !res_s.starts_with(&root_sep) {
        return Err(PathSafetyError {
            message: format!("Invalid {label} \"{target}\": resolves outside the project root ({root_s}). Path traversal is not allowed."),
            code: "ERR_PATH_TRAVERSAL".into(),
        });
    }
    if let (Ok(real_root), Ok(real_target)) = (canonical_path(&abs_root, 0), canonical_path(&resolved, 0)) {
        let rr = path_str(&real_root);
        let rr_sep = if rr.ends_with('/') { rr.clone() } else { format!("{rr}/") };
        let rt = path_str(&real_target);
        if rt != rr && !rt.starts_with(&rr_sep) {
            return Err(PathSafetyError {
                message: format!("Invalid {label} \"{target}\": resolves outside the project root ({root_s}) via a symlink. Path traversal is not allowed."),
                code: "ERR_PATH_TRAVERSAL".into(),
            });
        }
    }
    Ok(resolved)
}

/// `sanitizeName(name, {label})`.
pub fn sanitize_name(name: &str, label: &str) -> Result<(), PathSafetyError> {
    let e = |m: String, c: &str| Err(PathSafetyError { message: m, code: c.into() });
    if name.is_empty() {
        return e(format!("Invalid {label}: must be a non-empty string"), "NAME_INVALID");
    }
    if name.contains('\0') {
        return e(format!("Invalid {label}: contains a NUL byte"), "NAME_INVALID");
    }
    if name.contains('/') || name.contains('\\') {
        return e(format!("Invalid {label} \"{name}\": must not contain path separators ('/' or '\\\\')."), "NAME_HAS_SEPARATOR");
    }
    if name.starts_with('.') {
        return e(format!("Invalid {label} \"{name}\": must not start with '.'."), "NAME_TRAVERSAL");
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-') {
        return e(format!("Invalid {label} \"{name}\": only letters, digits, '.', '_', and '-' are allowed."), "NAME_BAD_CHARS");
    }
    Ok(())
}

/// `assertWithin` for a target the caller made itself: a failure is an
/// uncaught error carrying the path-safety code.
pub fn within(target: &str, root: &Path, label: &str) -> R<PathBuf> {
    assert_within(target, root, label, false).map_err(|e| AddError::new(e.message, &e.code))
}

// ── Package and manifest ─────────────────────────────────────────────

pub const MANIFEST_BASENAMES: [&str; 3] = ["astryx.integration.ts", "astryx.integration.mjs", "astryx.integration.js"];

pub fn find_manifest_paths(dir: &Path) -> Vec<PathBuf> {
    MANIFEST_BASENAMES.iter().map(|n| dir.join(n)).filter(|p| p.exists()).collect()
}

/// `findLocalIntegrationManifestOrNull`.
pub fn find_local_manifest(dir: &Path) -> R<Option<PathBuf>> {
    let m = find_manifest_paths(dir);
    if m.len() > 1 {
        return Err(AddError::plain(format!(
            "Multiple integration manifests found ({}). Keep exactly one.",
            m.iter().map(|p| basename(p)).collect::<Vec<_>>().join(", ")
        )));
    }
    Ok(m.into_iter().next())
}

pub fn find_package_dir(start: &Path) -> R<PathBuf> {
    let mut dir = normalize(start);
    for _ in 0..50 {
        if dir.join("package.json").exists() {
            return Ok(dir);
        }
        match dir.parent() {
            Some(p) if p != dir => dir = p.to_path_buf(),
            _ => break,
        }
    }
    Err(AddError::new("No package.json found. Run this command inside an integration package.", "ERR_FILE_NOT_FOUND"))
}

pub struct Package {
    pub dir: PathBuf,
    pub file: PathBuf,
    pub pkg: Value,
    pub owner: String,
    pub manifest_file: PathBuf,
    pub manifest_exists: bool,
}

pub fn read_package_json(file: &Path, code: &str) -> R<Value> {
    let text = fs::read_to_string(file).map_err(|e| AddError::new(format!("Cannot read package.json: {e}"), code))?;
    jsjson::parse(&text).map_err(|m| AddError::new(format!("Cannot read package.json: {m}"), code))
}

pub fn owner_of(pkg: &Value) -> String {
    match pkg.get("name") {
        Some(Value::String(s)) => s.clone(),
        _ => "(local integration)".into(),
    }
}

/// `resolvePackage(cwd)`.
pub fn resolve_package(cwd: &Path) -> R<Package> {
    let dir = find_package_dir(cwd)?;
    let file = dir.join("package.json");
    let pkg = read_package_json(&file, "ERR_INVALID_ARGUMENT")?;
    let owner = owner_of(&pkg);
    let existing = find_local_manifest(&dir)?;
    let here = normalize(cwd);
    if existing.is_none() && dir != here {
        return Err(AddError::new(
            format!(
                "{} has no package.json. The nearest is {} ({owner}), which is not an Astryx integration yet. Run this in your integration package's own directory, next to its package.json.",
                path_str(&here),
                path_str(&file)
            ),
            "ERR_INVALID_ARGUMENT",
        ));
    }
    let manifest_exists = existing.is_some();
    let manifest_file = existing.unwrap_or_else(|| dir.join("astryx.integration.mjs"));
    Ok(Package { dir, file, pkg, owner, manifest_file, manifest_exists })
}

pub fn project_path(dir: &Path, p: &Path) -> String {
    relative(dir, p)
}

pub fn kebab_to_title(slug: &str) -> String {
    let words: Vec<&str> = slug.split(|c| c == '-' || c == '_').filter(|w| !w.is_empty()).collect();
    if words.is_empty() {
        return slug.to_string();
    }
    words
        .iter()
        .map(|w| {
            let mut u: Vec<u16> = w.encode_utf16().collect();
            let first = String::from_utf16_lossy(&u[..1]).to_uppercase();
            let rest = String::from_utf16_lossy(&u.split_off(1));
            format!("{first}{rest}")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn is_kebab(name: &str) -> bool {
    let b = name.as_bytes();
    if b.is_empty() || !b[0].is_ascii_lowercase() {
        return false;
    }
    let mut prev_dash = false;
    for &c in b {
        if c == b'-' {
            if prev_dash {
                return false;
            }
            prev_dash = true;
        } else if c.is_ascii_lowercase() || c.is_ascii_digit() {
            prev_dash = false;
        } else {
            return false;
        }
    }
    !prev_dash
}

/// The receipt every `integration add` returns.
pub fn receipt(kind: &str, name: &str, root: Option<(String, bool)>, manifest: &str, files: &[String], dry_run: bool) -> Value {
    let mut data = Map::new();
    data.insert("kind".into(), Value::String(kind.into()));
    data.insert("name".into(), Value::String(name.into()));
    data.insert(
        "root".into(),
        match root {
            None => Value::Null,
            Some((p, c)) => {
                let mut r = Map::new();
                r.insert("path".into(), Value::String(p));
                r.insert("created".into(), Value::Bool(c));
                Value::Object(r)
            }
        },
    );
    data.insert("manifest".into(), Value::String(manifest.into()));
    data.insert("files".into(), Value::Array(files.iter().cloned().map(Value::String).collect()));
    data.insert("written".into(), Value::Bool(!dry_run));
    data.insert("dryRun".into(), Value::Bool(dry_run));
    let mut out = Map::new();
    out.insert("type".into(), Value::String("integration.add".into()));
    out.insert("data".into(), Value::Object(data));
    Value::Object(out)
}

// ── package.json updates ─────────────────────────────────────────────

pub struct PackageJsonUpdate {
    pub contents: String,
    pub expected_original: Vec<u8>,
}

pub struct ExportEntry {
    pub subpath: String,
    pub target: String,
}

fn norm_entry(v: &str) -> String {
    let s = v.strip_prefix("./").unwrap_or(v);
    s.strip_suffix('/').unwrap_or(s).to_string()
}

/// The indentation package.json uses: `/\n([ \t]+)"/`, else two spaces.
pub fn detect_indent(original: &str) -> String {
    let b = original.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\n' {
            let mut j = i + 1;
            while j < b.len() && (b[j] == b' ' || b[j] == b'\t') {
                j += 1;
            }
            if j > i + 1 && j < b.len() && b[j] == b'"' {
                return original[i + 1..j].to_string();
            }
        }
        i += 1;
    }
    "  ".into()
}

/// `packageJsonFilesUpdate`.
pub fn package_json_files_update(
    package_file: &Path,
    entries: &[String],
    public_exports: &[ExportEntry],
    create_exports: bool,
    side_effects: &[&str],
) -> R<Option<PackageJsonUpdate>> {
    let expected_original = fs::read(package_file).map_err(|e| AddError::plain(e.to_string()))?;
    let original = String::from_utf8_lossy(&expected_original).to_string();
    let mut pkg = jsjson::parse(&original).map_err(|m| AddError::new(format!("Cannot update package.json: {m}"), "ERR_INVALID_ARGUMENT"))?;
    let mut changed = false;
    let Value::Object(obj) = &mut pkg else {
        // A JSON value that is not an object: no fields to read or set.
        return Ok(None);
    };
    if let Some(files) = obj.get_mut("files") {
        let ok = matches!(files, Value::Array(a) if a.iter().all(|x| x.is_string()));
        if !ok {
            return Err(AddError::new(
                "package.json files must be an array of strings before Astryx can add the contribution root.",
                "ERR_INVALID_ARGUMENT",
            ));
        }
        let Value::Array(arr) = files else { unreachable!() };
        for item in entries.iter().map(|e| norm_entry(e)) {
            if arr.iter().any(|v| norm_entry(v.as_str().unwrap()) == item) {
                continue;
            }
            arr.push(Value::String(item));
            changed = true;
        }
    }
    if (obj.contains_key("exports") || create_exports) && !public_exports.is_empty() {
        let authored = obj.get("exports").cloned();
        let mut map: Map<String, Value> = match &authored {
            None => Map::new(),
            Some(Value::Object(m)) => {
                let has_sub = m.keys().any(|k| k.starts_with('.'));
                let has_cond = m.keys().any(|k| !k.starts_with('.'));
                if has_sub && has_cond {
                    return Err(AddError::new(
                        "package.json exports mixes subpaths and conditions, so Astryx cannot add a contribution export safely.",
                        "ERR_INTEGRATION_EXPORT_CONFLICT",
                    ));
                }
                if has_cond {
                    let mut x = Map::new();
                    x.insert(".".into(), Value::Object(m.clone()));
                    x
                } else {
                    m.clone()
                }
            }
            Some(other) => {
                let mut x = Map::new();
                x.insert(".".into(), other.clone());
                x
            }
        };
        let replaced = !matches!(&authored, Some(Value::Object(m)) if !m.keys().any(|k| !k.starts_with('.')));
        for e in public_exports {
            let key = format!("./{}", norm_entry(&e.subpath));
            let value = format!("./{}", norm_entry(&e.target));
            if let Some(cur) = map.get(&key) {
                if cur.as_str() != Some(value.as_str()) {
                    return Err(AddError::new(
                        format!("package.json exports already maps \"{key}\" to a different target; refusing to replace it with \"{value}\"."),
                        "ERR_INTEGRATION_EXPORT_CONFLICT",
                    ));
                }
                continue;
            }
            map.insert(key, Value::String(value));
            changed = true;
        }
        // `exportsMap !== authored` always holds (it is a new object), so the
        // field is written whenever this branch runs.
        let _ = replaced;
        obj.insert("exports".into(), Value::Object(crate::json::js_key_order(map)));
    }
    if !side_effects.is_empty() {
        if let Some(se) = obj.get_mut("sideEffects") {
            match se {
                Value::Bool(false) => {
                    *se = Value::Array(side_effects.iter().map(|s| Value::String(s.to_string())).collect());
                    changed = true;
                }
                Value::Array(a) => {
                    if a.iter().any(|x| !x.is_string()) {
                        return Err(AddError::new(
                            "package.json sideEffects must be a boolean or an array of strings before Astryx can add theme CSS.",
                            "ERR_INVALID_ARGUMENT",
                        ));
                    }
                    for p in side_effects {
                        if a.iter().any(|x| x.as_str() == Some(p)) {
                            continue;
                        }
                        a.push(Value::String(p.to_string()));
                        changed = true;
                    }
                }
                Value::Bool(true) => {}
                _ => {
                    return Err(AddError::new(
                        "package.json sideEffects must be a boolean or an array of strings before Astryx can add theme CSS.",
                        "ERR_INVALID_ARGUMENT",
                    ))
                }
            }
        }
    }
    if !changed {
        return Ok(None);
    }
    let indent = detect_indent(&original);
    let mut contents = jsjson::stringify_gap(&pkg, &indent);
    if original.ends_with('\n') {
        contents.push('\n');
    }
    Ok(Some(PackageJsonUpdate { contents, expected_original }))
}

/// `packageJsonUpdate`: the root, the manifest, and public exports.
pub fn package_json_update(
    package_file: &Path,
    root_path: &str,
    manifest_name: &str,
    public_exports: &[ExportEntry],
    create_exports: bool,
    side_effects: &[&str],
) -> R<Option<PackageJsonUpdate>> {
    package_json_files_update(package_file, &[root_path.to_string(), manifest_name.to_string()], public_exports, create_exports, side_effects)
}

// ── Staged writes ────────────────────────────────────────────────────

pub struct WritePlan {
    pub path: PathBuf,
    pub contents: Vec<u8>,
    pub create_only: bool,
    pub expected_original: Option<Vec<u8>>,
}

impl WritePlan {
    pub fn create(path: PathBuf, contents: impl Into<Vec<u8>>) -> WritePlan {
        WritePlan { path, contents: contents.into(), create_only: true, expected_original: None }
    }
}

/// Undo handle for `apply_writes`.
pub struct Rollback {
    published: Vec<(PathBuf, Vec<u8>, Option<Vec<u8>>)>,
}

impl Rollback {
    pub fn run(self) {
        for (path, contents, original) in self.published.into_iter().rev() {
            match fs::read(&path) {
                Ok(cur) if cur == contents => match original {
                    None => {
                        let _ = fs::remove_file(&path);
                    }
                    Some(o) => {
                        let _ = fs::write(&path, o);
                    }
                },
                _ => {}
            }
        }
    }
}

/// `applyWrites(plans)`: several writes as one operation.
pub fn apply_writes(plans: &[WritePlan]) -> R<Rollback> {
    let mut rb = Rollback { published: Vec::new() };
    for plan in plans {
        if let Some(dir) = plan.path.parent() {
            if let Err(e) = fs::create_dir_all(dir) {
                rb.run();
                return Err(AddError::plain(e.to_string()));
            }
        }
        if let Ok(m) = fs::symlink_metadata(&plan.path) {
            if m.file_type().is_symlink() {
                rb.run();
                return Err(AddError::new(format!("Refusing to replace symlinked file {}.", path_str(&plan.path)), "ERR_PATH_TRAVERSAL"));
            }
        }
        let exists = plan.path.exists();
        if plan.create_only && exists {
            rb.run();
            return Err(AddError::new(format!("Refusing to overwrite existing file {}.", path_str(&plan.path)), "ERR_FILE_EXISTS"));
        }
        let original = if exists { fs::read(&plan.path).ok() } else { None };
        if let Some(exp) = &plan.expected_original {
            if original.as_ref() != Some(exp) {
                rb.run();
                return Err(AddError::plain(format!("File changed while preparing: {}", path_str(&plan.path))));
            }
        }
        let res = if exists {
            fs::write(&plan.path, &plan.contents)
        } else {
            fs::OpenOptions::new().write(true).create_new(true).open(&plan.path).and_then(|mut f| {
                use std::io::Write;
                f.write_all(&plan.contents)
            })
        };
        if let Err(e) = res {
            rb.run();
            return Err(AddError::plain(e.to_string()));
        }
        rb.published.push((plan.path.clone(), plan.contents.clone(), original));
    }
    Ok(rb)
}
