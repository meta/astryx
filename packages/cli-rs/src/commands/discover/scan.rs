//! `_package-scanner.mjs`: component docs inside an integration's components
//! root.

use super::model::InstalledPackage;
use std::path::{Path, PathBuf};

/// `fs.readdirSync(dir, {withFileTypes: true})`: libuv sorts by bytes.
fn read_dir_sorted(dir: &Path) -> Option<Vec<(String, bool)>> {
    let rd = std::fs::read_dir(dir).ok()?;
    let mut v: Vec<(String, bool)> = rd
        .filter_map(|e| e.ok())
        .map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            // Dirent.isDirectory() does not follow symlinks.
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            (name, is_dir)
        })
        .collect();
    v.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));
    Some(v)
}

pub fn discover_doc_components(docs_dir: &Path) -> Vec<String> {
    if !docs_dir.exists() {
        return vec![];
    }
    let mut out = vec![];
    fn walk(dir: &Path, out: &mut Vec<String>) {
        let Some(entries) = read_dir_sorted(dir) else { return };
        for (name, is_dir) in entries {
            if name == "node_modules" || name == "__tests__" {
                continue;
            }
            let full = dir.join(&name);
            if is_dir {
                walk(&full, out);
            } else if name.ends_with(".doc.mjs") {
                out.push(name.replacen(".doc.mjs", "", 1));
            }
        }
    }
    walk(docs_dir, &mut out);
    // `Array#sort()` compares UTF-16 code units.
    out.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    out
}

pub struct Found {
    pub package: String,
    pub doc_path: PathBuf,
    pub component: String,
}

pub fn find_component(packages: &[InstalledPackage], name: &str) -> Option<Found> {
    let low = name.to_lowercase();
    for pkg in packages {
        let Some(m) = pkg.components.iter().find(|c| c.to_lowercase() == low) else { continue };
        let Some(dir) = &pkg.docs_dir else { continue };
        if let Some(p) = find_doc_file(dir, m) {
            return Some(Found { package: pkg.name.clone(), doc_path: p, component: m.clone() });
        }
    }
    None
}

fn find_doc_file(dir: &Path, name: &str) -> Option<PathBuf> {
    let target = format!("{name}.doc.mjs");
    fn walk(dir: &Path, target: &str) -> Option<PathBuf> {
        for (n, is_dir) in read_dir_sorted(dir)? {
            if n == "node_modules" || n == "__tests__" {
                continue;
            }
            let full = dir.join(&n);
            if is_dir {
                if let Some(f) = walk(&full, target) {
                    return Some(f);
                }
            } else if n == target {
                return Some(full);
            }
        }
        None
    }
    walk(dir, &target)
}
