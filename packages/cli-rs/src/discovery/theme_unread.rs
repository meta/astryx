//! `unreadThemeFolders(themeRoot, {packageDir, packageName})` from
//! `foundation/discovery/theme-discovery.mjs`: folders under a themes root
//! that look like a theme but are not one, and that no module imports.

use super::nodepath as np;

const MODULE_FILE_RE: &str = r"\.(?:[cm]?[jt]s|[jt]sx)$";

fn is_module(name: &str) -> bool {
    regress::Regex::with_flags(MODULE_FILE_RE, "u").unwrap().find(name).is_some()
}

/// `isIgnoredThemeEntry(name)`.
pub fn is_ignored_theme_entry(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules" || name == "CVS" || name == "npm-debug.log" || name.ends_with(".orig")
}

/// `listThemeFolder(folder).files`: sorted POSIX paths relative to it.
fn theme_files(folder: &str) -> Vec<String> {
    let mut files = Vec::new();
    fn walk(root: &str, dir: &str, files: &mut Vec<String>) {
        for e in np::list_dir_entries(dir).unwrap_or_default() {
            if is_ignored_theme_entry(&e.name) {
                continue;
            }
            let full = np::join2(dir, &e.name);
            if e.is_symlink {
                continue;
            }
            if e.is_dir {
                walk(root, &full, files);
            } else if e.is_file {
                files.push(np::relative(root, &full));
            }
        }
    }
    walk(folder, folder, &mut files);
    super::jsort::sort_strings(&mut files);
    files
}

fn looks_like_theme(folder: &str, files: &[String]) -> bool {
    let own = np::basename(folder).to_lowercase();
    let doc = regress::Regex::with_flags(r"\.doc\.[^.]+$", "u").unwrap();
    files.iter().any(|f| {
        let name = f.rsplit('/').next().unwrap_or(f).to_lowercase();
        let stem = match name.rfind('.') {
            Some(i) if i + 1 < name.len() => name[..i].to_string(),
            _ => name.clone(),
        };
        doc.find(&name).is_some() || name.contains("theme") || (is_module(&name) && (stem == "index" || stem == own))
    })
}

/// `unreadThemeFolders(themeRoot, {packageDir, packageName})`.
pub fn unread_theme_folders(theme_root: &str, package_dir: Option<&str>, package_name: Option<&str>) -> Vec<String> {
    if !np::is_dir(theme_root) {
        return vec![];
    }
    let entries = np::list_dir_entries(theme_root).unwrap_or_default();
    let mut folders: Vec<String> = entries.iter().filter(|e| e.is_dir && !is_ignored_theme_entry(&e.name)).map(|e| np::join2(theme_root, &e.name)).collect();
    super::jsort::sort_strings(&mut folders);
    let unread: Vec<String> = folders
        .iter()
        .filter(|f| {
            if crate::commands::theme::discovery::is_theme_folder(f) {
                return false;
            }
            let files = theme_files(f);
            files.iter().any(|x| is_module(x)) && looks_like_theme(f, &files)
        })
        .cloned()
        .collect();
    if unread.is_empty() {
        return vec![];
    }
    let mut modules: Vec<String> = entries.iter().filter(|e| e.is_file && !is_ignored_theme_entry(&e.name) && is_module(&e.name)).map(|e| np::join2(theme_root, &e.name)).collect();
    for f in &folders {
        modules.extend(theme_files(f).into_iter().filter(|x| is_module(x)).map(|x| np::join2(f, &x)));
    }
    let own = package_name.filter(|n| !n.is_empty()).map(|n| format!("{n}/"));
    let mut imported: Vec<String> = Vec::new();
    for file in &modules {
        let Some(specs) = super::contribution_fixes::import_specifiers(file) else { continue };
        for spec in specs {
            if spec.starts_with('.') {
                imported.push(np::resolve(&[&np::dirname(file), &spec]));
            } else if let (Some(own), Some(dir)) = (&own, package_dir.filter(|d| !d.is_empty())) {
                if let Some(rest) = spec.strip_prefix(own.as_str()) {
                    imported.push(np::resolve(&[dir, rest]));
                }
            }
        }
    }
    unread.into_iter().filter(|f| !imported.iter().any(|t| t == f || t.starts_with(&format!("{f}/")))).collect()
}
