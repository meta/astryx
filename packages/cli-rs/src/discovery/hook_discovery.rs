//! Port of `foundation/discovery/hook-discovery.mjs`: find and group Core
//! hook docs.

use crate::discovery::component_discovery::{exists_case_exact, list_dir, list_dir_entries, path_exists};
use crate::text::{code_unit_cmp, levenshtein_distance, locale_compare};
use indexmap::IndexMap;
use std::path::{Path, PathBuf};

const SKIP_DIRS: &[&str] = &["utils", "__tests__", "node_modules"];

/// `/^(?:use|create)[A-Z]\w*\.doc\.mjs$/`.
fn is_hook_doc_file(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".doc.mjs") else { return false };
    let rest = stem.strip_prefix("use").or_else(|| stem.strip_prefix("create"));
    let Some(rest) = rest else { return false };
    let b = rest.as_bytes();
    !b.is_empty() && b[0].is_ascii_uppercase() && b[1..].iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
}

/// A field at line start indented at most four spaces, `[^'"]+` value.
fn field_up_to_four(text: &str, key: &str) -> Option<String> {
    let b = text.as_bytes();
    let mut line_start = 0usize;
    loop {
        let mut i = line_start;
        let mut sp = 0;
        while i < b.len() && b[i] == b' ' && sp < 4 {
            i += 1;
            sp += 1;
        }
        if b[i..].starts_with(key.as_bytes()) && b.get(i + key.len()) == Some(&b':') {
            let mut j = i + key.len() + 1;
            while j < b.len() && b[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < b.len() && (b[j] == b'\'' || b[j] == b'"') {
                let s = j + 1;
                let mut e = s;
                while e < b.len() && b[e] != b'\'' && b[e] != b'"' {
                    e += 1;
                }
                if e < b.len() && e > s {
                    return Some(text[s..e].to_string());
                }
            }
        }
        match text[line_start..].find('\n') {
            Some(off) => line_start += off + 1,
            None => return None,
        }
    }
}

/// `RELATED_HOOKS_RE` group 1: the text inside `relatedHooks: [...]`.
fn related_hooks_text(text: &str) -> Option<String> {
    let b = text.as_bytes();
    let mut line_start = 0usize;
    loop {
        let mut i = line_start;
        let mut sp = 0;
        while i < b.len() && b[i] == b' ' && sp < 4 {
            i += 1;
            sp += 1;
        }
        if b[i..].starts_with(b"relatedHooks:") {
            let mut j = i + 13;
            while j < b.len() && b[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < b.len() && b[j] == b'[' {
                if let Some(end) = text[j + 1..].find(']') {
                    return Some(text[j + 1..j + 1 + end].to_string());
                }
            }
        }
        match text[line_start..].find('\n') {
            Some(off) => line_start += off + 1,
            None => return None,
        }
    }
}

fn read_hook_category(doc_path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(doc_path).ok()?;
    let c = field_up_to_four(&content, "category")?;
    let mut chars = c.chars();
    let first = chars.next()?;
    Some(first.to_uppercase().collect::<String>() + chars.as_str())
}

fn is_beside_own_hook(doc_path: &Path, hook_name: &str) -> bool {
    let Some(rest) = hook_name.strip_prefix("create") else { return false };
    let own = format!("'use{rest}'");
    std::fs::read_to_string(doc_path)
        .ok()
        .and_then(|t| related_hooks_text(&t))
        .is_some_and(|r| r.contains(&own))
}

fn hook_name_from_file(file: &str) -> String {
    file.replacen(".doc.mjs", "", 1)
}

/// Hooks grouped by category, `Other` last.
pub type HookGroups = IndexMap<String, Vec<String>>;

/// `discoverHooks(coreDir)`.
pub fn discover_hooks(core_dir: &Path) -> HookGroups {
    let src_dir = core_dir.join("src");
    let hooks_dir = src_dir.join("hooks");
    let mut cats: IndexMap<String, String> = IndexMap::new();
    if path_exists(&hooks_dir) {
        for e in list_dir_entries(&hooks_dir) {
            // Dirent#isFile: a symbolic link is not a file here.
            if e.is_dir || e.is_symlink || !e.name.ends_with(".doc.mjs") {
                continue;
            }
            let name = hook_name_from_file(&e.name);
            let cat = read_hook_category(&hooks_dir.join(&e.name)).unwrap_or_else(|| "Other".into());
            cats.insert(name, cat);
        }
    }
    fn scan(dir: &Path, cats: &mut IndexMap<String, String>) {
        if !path_exists(dir) {
            return;
        }
        for e in list_dir_entries(dir) {
            if e.is_dir && !SKIP_DIRS.contains(&e.name.as_str()) {
                scan(&dir.join(&e.name), cats);
            } else if !e.is_dir && !e.is_symlink && is_hook_doc_file(&e.name) {
                let name = hook_name_from_file(&e.name);
                let doc = dir.join(&e.name);
                if !cats.contains_key(&name) && !is_beside_own_hook(&doc, &name) {
                    let cat = read_hook_category(&doc).unwrap_or_else(|| "Other".into());
                    cats.insert(name, cat);
                }
            }
        }
    }
    if path_exists(&src_dir) {
        for e in list_dir_entries(&src_dir) {
            if !e.is_dir || SKIP_DIRS.contains(&e.name.as_str()) || e.name == "hooks" {
                continue;
            }
            scan(&src_dir.join(&e.name), &mut cats);
        }
    }
    let mut groups: IndexMap<String, Vec<String>> = IndexMap::new();
    for (name, cat) in cats {
        groups.entry(cat).or_default().push(name);
    }
    for m in groups.values_mut() {
        m.sort_by(|a, b| code_unit_cmp(a, b));
    }
    let mut entries: Vec<(String, Vec<String>)> = groups.into_iter().collect();
    entries.sort_by(|a, b| {
        if a.0 == "Other" && b.0 == "Other" {
            std::cmp::Ordering::Equal
        } else if a.0 == "Other" {
            std::cmp::Ordering::Greater
        } else if b.0 == "Other" {
            std::cmp::Ordering::Less
        } else {
            locale_compare(&a.0, &b.0)
        }
    });
    entries.into_iter().collect()
}

/// `getAllHookNames(coreDir)`.
pub fn get_all_hook_names(core_dir: &Path) -> Vec<String> {
    discover_hooks(core_dir).into_values().flatten().collect()
}

fn upper_first(s: &str) -> String {
    // JS charAt(0).toUpperCase(): one UTF-16 unit; names are ASCII here.
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

/// `findHookDoc(coreDir, name)`.
pub fn find_hook_doc(core_dir: &Path, name: &str) -> Option<PathBuf> {
    let src_dir = core_dir.join("src");
    let hooks_dir = src_dir.join("hooks");
    let normalized = name.strip_prefix("use").unwrap_or(name);
    let with_use = format!("use{}", upper_first(normalized));
    let mut unique: Vec<String> = Vec::new();
    for c in [name.to_string(), with_use.clone(), format!("use{normalized}")] {
        if !unique.contains(&c) {
            unique.push(c);
        }
    }
    for c in &unique {
        let direct = hooks_dir.join(format!("{c}.doc.mjs"));
        if exists_case_exact(&direct, &hooks_dir) {
            return Some(direct);
        }
    }
    if path_exists(&hooks_dir) {
        for entry in list_dir(&hooks_dir) {
            if !entry.ends_with(".doc.mjs") {
                continue;
            }
            let hn = hook_name_from_file(&entry).to_lowercase();
            if hn == name.to_lowercase() || hn == with_use.to_lowercase() {
                return Some(hooks_dir.join(entry));
            }
        }
    }
    fn search(dir: &Path, candidates: &[String]) -> Option<PathBuf> {
        if !path_exists(dir) {
            return None;
        }
        for e in list_dir_entries(dir) {
            if e.is_dir && !SKIP_DIRS.contains(&e.name.as_str()) {
                if let Some(f) = search(&dir.join(&e.name), candidates) {
                    return Some(f);
                }
            } else if !e.is_dir && !e.is_symlink && e.name.ends_with(".doc.mjs") {
                let hn = hook_name_from_file(&e.name);
                for c in candidates {
                    if hn == *c || hn.to_lowercase() == c.to_lowercase() {
                        return Some(dir.join(&e.name));
                    }
                }
            }
        }
        None
    }
    if path_exists(&src_dir) {
        for e in list_dir_entries(&src_dir) {
            if !e.is_dir || SKIP_DIRS.contains(&e.name.as_str()) || e.name == "hooks" {
                continue;
            }
            if let Some(f) = search(&src_dir.join(&e.name), &unique) {
                return Some(f);
            }
        }
    }
    let needle = name.to_lowercase();
    let mut best: Option<String> = None;
    let mut best_dist = usize::MAX;
    for hn in get_all_hook_names(core_dir) {
        let d = levenshtein_distance(&needle, &hn.to_lowercase());
        if d < best_dist {
            best_dist = d;
            best = Some(hn);
        }
    }
    match best {
        Some(b) if best_dist <= 3 => find_hook_doc(core_dir, &b),
        _ => None,
    }
}
