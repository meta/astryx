//! ShadCN-copied composition receipts (`api/upgrade/registry/registry.mjs`).
//!
//! TEMP: receipts are discovered and counted; reconciling found receipts
//! against the public registry is not ported yet.

use super::fsutil::s;
use super::ui::Ui;
use super::{ApiError, Opts};
use crate::json::{Map, Value};
use std::path::{Path, PathBuf};

const SKIP_DIRS: &[&str] = &[".cache", ".git", ".next", ".pnpm", ".turbo", "build", "coverage", "dist", "node_modules", "out"];

pub fn discover_registry_receipts(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if !root.exists() {
        return out;
    }
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        let mut entries: Vec<_> = rd.filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let name = e.file_name().to_string_lossy().into_owned();
            if SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            let full = dir.join(&name);
            if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            if name == ".astryx" {
                if let Ok(rd2) = std::fs::read_dir(&full) {
                    for r in rd2.filter_map(|x| x.ok()) {
                        let rn = r.file_name().to_string_lossy().into_owned();
                        if r.file_type().map(|t| t.is_file()).unwrap_or(false) && rn.ends_with(".json") {
                            out.push(full.join(rn));
                        }
                    }
                }
                continue;
            }
            walk(&full, out);
        }
    }
    walk(root, &mut out);
    out.sort_by(|a, b| s(a).encode_utf16().cmp(s(b).encode_utf16()));
    out
}

pub fn empty_summary(apply: bool) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("applied".into(), Value::Bool(apply));
    m.insert("ok".into(), Value::Bool(true));
    for k in ["found", "current", "wouldUpdate", "updated", "wouldMerge", "merged", "wouldRefreshReceipt", "receiptsRefreshed", "conflicts", "missing", "invalid", "failed"] {
        m.insert(k.into(), Value::from(0u64));
    }
    m.insert("items".into(), Value::Array(vec![]));
    m
}

fn reconcile(apply: bool, root: &Path, expected: Option<&str>) -> Result<Map<String, Value>, ApiError> {
    let receipts = discover_registry_receipts(root);
    let mut summary = empty_summary(apply);
    summary.insert("found".into(), Value::from(receipts.len() as u64));
    if receipts.is_empty() {
        return Ok(summary);
    }
    if expected.is_none() {
        return Err(ApiError::new("Could not find installed @astryxdesign/core. Install project dependencies before upgrading copied compositions.", "ERR_VERSION_DETECT"));
    }
    Err(ApiError::new("ShadCN composition receipts are not supported by this build yet.", "ERR_UNKNOWN"))
}

fn source_root(opts_path: Option<&str>, cwd: &Path) -> Result<PathBuf, ApiError> {
    super::assert_within(opts_path.unwrap_or("./src"), cwd, true, "source directory").map_err(|e| ApiError::new(e.message, "ERR_PATH_TRAVERSAL"))
}

/// `registryUpgrade(options, ctx)`
pub fn registry_upgrade(ui: &mut Ui, opts: &Opts, cwd: &Path, origin: Option<&Path>) -> Result<Value, ApiError> {
    if let Some(o) = origin {
        let r = super::fsutil::relative(o, cwd);
        ui.log(&format!("Project root: {}", if r.is_empty() { "." } else { &r }));
    }
    let installed = super::run::detect_installed_target_version(cwd);
    let expected = installed.as_ref().filter(|i| i.package_name == "@astryxdesign/core").map(|i| i.version.clone());
    let root = source_root(opts.path.as_deref(), cwd)?;
    let summary = reconcile(opts.apply, &root, expected.as_deref())?;
    let found = summary.get("found").and_then(|v| v.as_u64()).unwrap_or(0);
    if found == 0 {
        ui.log("No ShadCN composition receipts found.");
    }
    let ok = summary.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
    let applied = summary.get("applied").and_then(|v| v.as_bool()).unwrap_or(false);
    ui.log(if ok {
        if applied {
            "Registry upgrade complete\n"
        } else {
            "Registry dry run complete\n"
        }
    } else {
        "Registry upgrade finished with unresolved items\n"
    });
    Ok(Value::Object(summary))
}

/// `reconcileCompositions()` inside `run`: the summary when receipts exist.
pub fn reconcile_for_run(_ui: &mut Ui, apply: bool, path: &Path, _cwd: &Path, _origin: Option<&Path>, expected: Option<&str>) -> Result<Option<Value>, ApiError> {
    let summary = reconcile(apply, path, expected)?;
    if summary.get("found").and_then(|v| v.as_u64()).unwrap_or(0) > 0 {
        return Ok(Some(Value::Object(summary)));
    }
    Ok(None)
}
