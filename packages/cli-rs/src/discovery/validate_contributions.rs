//! Port of `foundation/integrations/validate-contributions.mjs`: the checks
//! every loaded integration gets (`validateLoadedIntegration`), used by
//! `Project.issues()`, the integration warnings and `doctor integration`.
//! Owner: the `doctor` lane (registered as `project::VALIDATOR`).
//! TEMP: template, codemod, doc and theme discovery belong to other lanes;
//! each check runs once its reader lands. The `Fix:` texts that need the
//! contribution-fix context (`contribution-fixes.mjs`) use their default.

use super::component_discovery as cd;
use super::integrations::{self as integ, Record};
use super::nodepath as np;
use super::project::Project;
use crate::json::Value;
use std::path::PathBuf;

/// One finding: `(code, severity, message)`, and whether it is listed only.
#[derive(Debug, Clone, PartialEq)]
pub struct Finding {
    pub code: String,
    pub severity: &'static str,
    pub message: String,
    pub listed: bool,
}

fn err(code: &str, m: impl Into<String>) -> Finding {
    Finding { code: code.into(), severity: "error", message: m.into(), listed: false }
}
fn warn(code: &str, m: impl Into<String>) -> Finding {
    Finding { code: code.into(), severity: "warning", message: m.into(), listed: false }
}
fn listed(code: &str, m: impl Into<String>) -> Finding {
    Finding { code: code.into(), severity: "warning", message: m.into(), listed: true }
}

fn nullish(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => true,
        Some(Value::Object(m)) => m.len() == 1 && m.get("__js").and_then(|x| x.as_str()) == Some("undefined"),
        _ => false,
    }
}

fn s<'a>(r: &'a Record, k: &str) -> Option<&'a str> {
    r.get(k).and_then(|v| v.as_str())
}

fn strs(r: &Record, k: &str) -> Vec<String> {
    r.get(k).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

fn manifest_name(r: &Record) -> String {
    s(r, "__manifestFile").map(np::basename).unwrap_or_else(|| "the integration manifest".into())
}

fn edit_distance(a: &[u16], b: &[u16]) -> usize {
    let mut d = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for j in 0..=b.len() {
        d[0][j] = j;
    }
    for i in 1..=a.len() {
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            d[i][j] = (d[i - 1][j] + 1).min(d[i][j - 1] + 1).min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }
    d[a.len()][b.len()]
}

/// `nearestKnownKey(key)`.
pub fn nearest_known_key(key: &str) -> Option<&'static str> {
    let lower: Vec<u16> = key.to_lowercase().encode_utf16().collect();
    let limit = if lower.len() <= 4 { 1 } else { 2 };
    let close: Vec<&'static str> = integ::KNOWN_INTEGRATION_KEYS
        .iter()
        .copied()
        .filter(|k| edit_distance(&lower, &k.to_lowercase().encode_utf16().collect::<Vec<_>>()) <= limit)
        .collect();
    if close.len() == 1 {
        Some(close[0])
    } else {
        None
    }
}

fn check_unknown_keys(r: &Record, out: &mut Vec<Finding>) {
    let keys = strs(r, "__unknownKeys");
    if keys.is_empty() {
        return;
    }
    let declared = strs(r, "__declaredKeys");
    let typos: Vec<(String, &str)> = keys.iter().filter_map(|k| nearest_known_key(k).map(|n| (k.clone(), n))).collect();
    for (key, known) in &typos {
        let fix = if declared.iter().any(|d| d == known) {
            format!("Fix: remove \"{key}\" from {}; it already sets \"{known}\".", manifest_name(r))
        } else {
            format!("Fix: rename \"{key}\" to \"{known}\" in {}.", manifest_name(r))
        };
        out.push(warn(
            "unknown_manifest_key",
            format!("This CLI does not know the manifest key \"{key}\", so it is ignored. Did you mean `{known}`? {fix} If it is a key from a newer Astryx CLI instead, upgrading @astryxdesign/cli picks it up."),
        ));
    }
    let rest: Vec<&String> = keys.iter().filter(|k| !typos.iter().any(|(t, _)| t == *k)).collect();
    if rest.is_empty() {
        return;
    }
    let one = rest.len() == 1;
    out.push(warn(
        "unknown_manifest_key",
        format!(
            "This CLI does not know the manifest {} {}, so {} ignored \u{2014} everything else in the manifest still applies. This usually means the integration was published against a newer Astryx CLI than this project resolves; upgrading @astryxdesign/cli picks it up.",
            if one { "key" } else { "keys" },
            rest.iter().map(|k| format!("\"{k}\"")).collect::<Vec<_>>().join(", "),
            if one { "it is" } else { "they are" }
        ),
    ));
}

pub enum RootProblem {
    Missing,
    NotAFolder,
    Unreadable(String),
}

fn errno_code(e: &std::io::Error) -> String {
    match e.raw_os_error() {
        Some(2) => "ENOENT".into(),
        Some(20) => "ENOTDIR".into(),
        Some(13) => "EACCES".into(),
        Some(1) => "EPERM".into(),
        Some(40) => "ELOOP".into(),
        _ => "unknown error".into(),
    }
}

fn access_ok(path: &str, mode: i32) -> Result<(), String> {
    let c = std::ffi::CString::new(path).map_err(|_| "EINVAL".to_string())?;
    // SAFETY: a valid C string; access() only reads it.
    let r = unsafe { libc_access(c.as_ptr(), mode) };
    if r == 0 {
        Ok(())
    } else {
        Err(errno_code(&std::io::Error::last_os_error()))
    }
}

extern "C" {
    #[link_name = "access"]
    fn libc_access(path: *const std::os::raw::c_char, mode: i32) -> i32;
}

/// `rootProblem(root)`.
pub fn root_problem(root: &str) -> Option<RootProblem> {
    match std::fs::metadata(root) {
        Err(e) => {
            let code = errno_code(&e);
            if code == "ENOENT" || code == "ENOTDIR" {
                Some(RootProblem::Missing)
            } else {
                Some(RootProblem::Unreadable(code))
            }
        }
        Ok(m) if !m.is_dir() => Some(RootProblem::NotAFolder),
        Ok(_) => access_ok(root, 4 | 1).err().map(RootProblem::Unreadable),
    }
}

fn slash(p: &str) -> String {
    p.to_string()
}

/// `symlinkedFolder(root, packageDir)`: (link path, its real target).
pub fn symlinked_folder(root: &str, package_dir: &str) -> Option<(String, String)> {
    let rel = np::relative(package_dir, root);
    if rel.is_empty() || rel.starts_with("..") || np::is_absolute(&rel) {
        return None;
    }
    let mut current = package_dir.to_string();
    for seg in rel.split('/') {
        current = np::join2(&current, seg);
        match std::fs::symlink_metadata(&current) {
            Ok(m) if m.file_type().is_symlink() => return np::realpath(&current).map(|t| (current.clone(), t)),
            Ok(_) => {}
            Err(_) => return None,
        }
    }
    None
}

const ROOT_KINDS: &[&str] = &["components", "templates", "codemods", "docs", "themes", "iconSets"];

fn root_of<'a>(r: &'a Record, kind: &str) -> Option<&'a str> {
    if nullish(r.get(kind)) {
        None
    } else {
        s(r, kind)
    }
}

fn check_roots(r: &Record, out: &mut Vec<Finding>) {
    let package_dir = s(r, "__packageDir");
    for kind in ROOT_KINDS {
        let Some(root) = root_of(r, kind) else { continue };
        match root_problem(root) {
            None => {
                let Some(pd) = package_dir else { continue };
                let Some((link, _target)) = symlinked_folder(root, pd) else { continue };
                let shown = slash(&np::relative(pd, &link));
                let real_pkg = np::realpath(pd).unwrap_or_else(|| pd.to_string());
                let target = slash(&np::relative(&real_pkg, &np::realpath(&link).unwrap_or_default()));
                let real_root = slash(&np::relative(&real_pkg, &np::realpath(root).unwrap_or_default()));
                let outside = target.starts_with("../") || np::is_absolute(&target);
                let fix = if outside {
                    "replace the link with a real folder holding its files".to_string()
                } else {
                    format!(
                        "replace the link with the folder itself (move {target}/ to {shown}/), or set `{kind}: './{real_root}'` in {}",
                        manifest_name(r)
                    )
                };
                out.push(listed(
                    "symlinked_root",
                    format!(
                        "Declared {kind} root \"{}\" is reached through the symlink \"{shown}\" (to \"{target}\"). Astryx follows it locally, but npm pack does not follow a symlinked folder, so the published package ships none of these files. Fix: {fix}.",
                        slash(&np::relative(pd, root))
                    ),
                ));
            }
            Some(RootProblem::Missing) => out.push(err("missing_root", format!("Declared {kind} root does not exist on disk: {root}"))),
            Some(RootProblem::NotAFolder) => out.push(err(
                "invalid_root",
                format!("Declared {kind} root is a file, not a folder: {root}. Fix: point \"{kind}\" in the manifest at the folder that holds them."),
            )),
            Some(RootProblem::Unreadable(code)) => out.push(err(
                "unreadable_root",
                format!("Declared {kind} root cannot be read ({code}): {root}. Fix: make it readable by the user running astryx."),
            )),
        }
    }
}

fn usable_root<'a>(r: &'a Record, kind: &str) -> Option<&'a str> {
    root_of(r, kind).filter(|root| root_problem(root).is_none())
}

const MANIFEST_BASENAMES: &[&str] = &["astryx.integration.ts", "astryx.integration.mjs", "astryx.integration.js"];

/// `fs.readdirSync`: sorted by name bytes, as libuv sorts a listing.
fn read_dir_sorted(dir: &str) -> Option<Vec<np::Dirent>> {
    let mut v = np::read_dir(dir)?;
    v.sort_by(|a, b| a.name.as_bytes().cmp(b.name.as_bytes()));
    Some(v)
}

fn check_codemods(r: &Record, out: &mut Vec<Finding>) {
    let Some(root) = usable_root(r, "codemods") else { return };
    let file_re = crate::doctor_re!(r"\.(?:ts|mjs|js)$");
    let test_re = crate::doctor_re!(r"\.(?:test|spec|fixture)\.(?:ts|mjs|js)$", "u");
    let skip: &[&str] = &["node_modules", ".git", "__tests__", "__fixtures__"];
    let Some(entries) = read_dir_sorted(root) else { return };
    let package_dir = s(r, "__packageDir");
    for e in entries {
        if e.is_file
            && file_re.find(&e.name).is_some()
            && test_re.find(&e.name).is_none()
            && !(package_dir == Some(root) && MANIFEST_BASENAMES.contains(&e.name.as_str()))
        {
            let base = package_dir.map(String::from).unwrap_or_else(|| np::dirname(root));
            let shown = np::relative(&base, &np::join2(root, &e.name));
            let dir = np::dirname(&shown);
            out.push(warn(
                "codemod_outside_version",
                format!(
                    "Codemod file \"{shown}\" is outside a version folder, so upgrade will never load it. Fix: move it into the folder named for the version it migrates to, for example {dir}/1.2.0/{}.",
                    e.name
                ),
            ));
        }
        if e.is_dir && !skip.contains(&e.name.as_str()) && !super::semver::is_valid_semver(&e.name) {
            out.push(err(
                "invalid_codemod_version",
                format!("Codemod folder \"{}\" is not an exact semver version such as 1.2.0. Fix: rename it to the exact version its codemods migrate to.", e.name),
            ));
        }
    }
    if let Err(e) = crate::commands::upgrade::integration_discovery::discover_integration_codemods(std::slice::from_ref(r)) {
        out.push(err("invalid_codemod", e));
    }
}

fn check_templates(r: &Record, out: &mut Vec<Finding>) {
    let Some(root) = usable_root(r, "templates") else { return };
    let (_, errors) = crate::commands::template::integration::for_one(r);
    for e in errors {
        let severity = match e.severity.as_deref() {
            Some("warning") => "warning",
            _ => "error",
        };
        out.push(Finding { code: e.code.unwrap_or_else(|| "invalid_template".into()), severity, message: e.message, listed: false });
    }
    let shared = usable_root(r, "components").map(|c| np::resolve1(c) == np::resolve1(root)).unwrap_or(false);
    for file in template_source_only_candidates(root) {
        if shared && file.starts_with(|c: char| c.is_ascii_uppercase()) {
            continue;
        }
        let stem = &file[..file.len() - 4];
        out.push(warn(
            "source_without_template_doc",
            format!("Template source \"{file}\" has no same-stem metadata file {stem}.doc.mjs, so `astryx template` never lists it. Fix: add {stem}.doc.mjs beside it with type: 'page' or 'block'; `astryx docs authoring integration-template-doc` lists its fields. If it is not a template, move it out of the templates root."),
        ));
    }
}

/// `findTemplateSourceOnlyCandidates(root)`.
pub fn template_source_only_candidates(root: &str) -> Vec<String> {
    let Some(entries) = read_dir_sorted(root) else { return vec![] };
    let mut out: Vec<String> = Vec::new();
    for e in entries {
        if !e.is_file && !e.is_symlink {
            continue;
        }
        let Some(stem) = e.name.strip_suffix(".tsx").filter(|s| !s.is_empty()) else { continue };
        if crate::doctor_re!(r"\.(?:test|spec|stories)$", "u").find(stem).is_some() {
            continue;
        }
        let paired = [".doc.ts", ".doc.mjs", ".doc.js", ".template.ts", ".template.mjs", ".template.js"]
            .iter()
            .any(|sfx| np::exists(&np::join2(root, &format!("{stem}{sfx}"))));
        if !paired {
            out.push(e.name.clone());
        }
    }
    super::jsort::sort_strings(&mut out);
    out
}

/// `findSourceOnlyCandidates(root, names)`.
pub fn source_only_candidates(root: &str, registered: &[String]) -> Vec<String> {
    let Some(entries) = read_dir_sorted(root) else { return vec![] };
    let mut out: Vec<String> = Vec::new();
    for e in entries {
        if !e.is_file && !e.is_symlink {
            continue;
        }
        let Some(m) = crate::doctor_re!(r"^([A-Z][A-Za-z0-9]+)\.tsx$", "u").find(&e.name) else { continue };
        let name = &e.name[m.group(1).unwrap()];
        if !registered.iter().any(|r| r == name) {
            out.push(name.to_string());
        }
    }
    super::jsort::sort_strings(&mut out);
    out
}

/// The record as component discovery reads it.
pub fn loaded_integration(r: &Record) -> cd::LoadedIntegration {
    cd::LoadedIntegration {
        name: s(r, "name").unwrap_or("").to_string(),
        version: s(r, "version").map(String::from),
        components: root_of(r, "components").map(PathBuf::from),
        issues_url: s(r, "issuesUrl").map(String::from),
        package_dir: s(r, "__packageDir").map(PathBuf::from),
        package_exports: r.get("__packageExports").cloned(),
        provider_id: s(r, "providerId").map(String::from),
        autolinked: r.get("__autolinked").and_then(|v| v.as_bool()).unwrap_or(false),
        load_error: !nullish(r.get("__loadError")),
    }
}

fn check_components(r: &Record, out: &mut Vec<Finding>) {
    let Some(root) = usable_root(r, "components") else { return };
    let li = loaded_integration(r);
    let valid = cd::discover_valid_integration_components(&li, false);
    for (name, message) in &valid.errors {
        let record = valid.discovered.iter().find(|d| &d.name == name);
        match record {
            Some(rec) if rec.source_path.is_none() => {
                let doc_name = np::basename(&rec.doc_path.to_string_lossy());
                let doc_dir = np::dirname(&rec.doc_path.to_string_lossy());
                let stem = cd::doc_stem(&rec.doc_path);
                let other = [".jsx", ".js", ".ts", ".mjs"].iter().map(|x| format!("{stem}{x}")).find(|f| np::exists(&np::join2(&doc_dir, f)));
                let (msg, fix) = match other {
                    Some(o) => (
                        format!("{}: found {o}, but a component source must be a .tsx file.", message.trim_end_matches('.')),
                        format!("Fix: rename {o} to {}.tsx (and point its package export at the new file).", rec.name),
                    ),
                    None => (message.clone(), format!("Fix: add {}.tsx beside {doc_name}.", rec.name)),
                };
                out.push(err("invalid_component", format!("{msg} {fix}")));
            }
            _ => out.push(err("invalid_component", message.clone())),
        }
    }
    let names: Vec<String> = valid.discovered.iter().map(|d| d.name.clone()).collect();
    for name in source_only_candidates(root, &names) {
        if [".doc.ts", ".doc.mjs", ".doc.js"].iter().any(|sfx| np::exists(&np::join2(root, &format!("{name}{sfx}")))) {
            continue;
        }
        out.push(warn(
            "source_without_component_doc",
            format!("Component source \"{name}.tsx\" has no same-stem metadata file {name}.doc.mjs, so Astryx ignores it. Fix: add {name}.doc.mjs beside it with type: 'component'; `astryx docs authoring component-doc` lists its fields."),
        ));
    }
}

/// Every finding for one loaded integration (`allLoadedIntegrationIssues`).
pub fn all_findings(r: &Record) -> Vec<Finding> {
    if let Some(c) = r.get("__providerConflict").filter(|v| !nullish(Some(v))) {
        return vec![warn("duplicate_provider", c.get("message").map(|m| super::paths::js_string(Some(m))).unwrap_or_default())];
    }
    if !nullish(r.get("__loadError")) {
        return vec![err("integration_error", super::paths::js_string(r.get("__loadError")))];
    }
    let mut out = Vec::new();
    check_unknown_keys(r, &mut out);
    if !nullish(r.get("__agentDocsError")) {
        out.push(err("invalid_agent_docs", super::paths::js_string(r.get("__agentDocsError"))));
    }
    if !nullish(r.get("__cliCommandError")) {
        out.push(warn(
            "invalid_cli_command",
            format!(
                "{}. The command is ignored; printed commands use the package-manager prefix.",
                super::paths::js_string(r.get("__cliCommandError"))
            ),
        ));
    }
    check_roots(r, &mut out);
    check_codemods(r, &mut out);
    check_templates(r, &mut out);
    check_components(r, &mut out);
    check_docs(r, &mut out);
    check_themes(r, &mut out);
    out
}

fn check_themes(r: &Record, out: &mut Vec<Finding>) {
    if usable_root(r, "themes").is_none() {
        return;
    }
    if let Err(e) = crate::commands::theme::discovery::discover_integration_themes(r) {
        out.push(err("invalid_theme", e));
    }
}

fn check_docs(r: &Record, out: &mut Vec<Finding>) {
    if usable_root(r, "docs").is_none() {
        return;
    }
    for e in super::docs_discovery::discover_integration_docs(r).errors {
        out.push(err("invalid_doc", e));
    }
}

/// `validateLoadedIntegration(record)`: the counted findings.
pub fn validate_loaded(r: &Record) -> Vec<(String, String, String)> {
    all_findings(r).into_iter().filter(|f| !f.listed).map(|f| (f.code, f.severity.to_string(), f.message)).collect()
}

fn validator(_p: &Project, r: &Record) -> Result<Vec<(String, String, String)>, String> {
    Ok(validate_loaded(r))
}

/// Register the validator `Project.issues()` runs.
pub fn register() {
    let _ = super::project::VALIDATOR.set(validator);
    crate::commands::component::deps::register();
    crate::commands::template::integration::register();
}
