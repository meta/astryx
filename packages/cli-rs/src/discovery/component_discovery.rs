//! Port of `foundation/discovery/component-discovery.mjs`: find, list and
//! resolve Astryx components in Core and in integrations.
//!
//! Directory listings follow Node's `readdirSync`, which libuv returns in
//! byte order of the names.

use crate::json::Value;
use crate::text::{code_unit_cmp, locale_compare};
use indexmap::IndexMap;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The owner package name for built-in (Core) components.
pub const CORE_PACKAGE: &str = "@astryxdesign/core";

const SKIP_DIRS: &[&str] = &["hooks", "utils", "__tests__", "node_modules"];

/// Doc-file suffixes for integration components, in preference order.
pub const INTEGRATION_DOC_SUFFIXES: &[&str] = &[".doc.ts", ".doc.mjs", ".doc.js"];

// ── File system helpers ─────────────────────────────────────────────────
// Path-typed views over the shared listing cache and `paths::exists_case_exact`.

/// One directory entry, as `fs.Dirent` reports it (no symlink following).
#[derive(Debug, Clone)]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
    pub is_symlink: bool,
}

/// `fs.readdirSync(dir, {withFileTypes: true})`, in byte order of the names.
/// Empty when the folder cannot be read.
pub fn list_dir_entries(dir: &Path) -> Vec<DirEntry> {
    let Some(rd) = super::nodepath::read_dir(&dir.to_string_lossy()) else { return Vec::new() };
    let mut out: Vec<DirEntry> =
        rd.into_iter().map(|e| DirEntry { name: e.name, is_dir: e.is_dir, is_symlink: e.is_symlink }).collect();
    out.sort_by(|a, b| a.name.as_bytes().cmp(b.name.as_bytes()));
    out
}

/// `fs.readdirSync(dir)`: the names, in byte order.
pub fn list_dir(dir: &Path) -> Vec<String> {
    list_dir_entries(dir).into_iter().map(|e| e.name).collect()
}

/// `fs.existsSync`: follows symbolic links.
pub fn path_exists(p: &Path) -> bool {
    super::nodepath::exists(&p.to_string_lossy())
}

/// `existsCaseExact(target, root)`: the path exists and every segment below
/// `root` is spelled exactly as listed.
pub fn exists_case_exact(target: &Path, root: &Path) -> bool {
    super::paths::exists_case_exact(&target.to_string_lossy(), &root.to_string_lossy())
}

fn read_text(p: &Path) -> Option<String> {
    super::nodepath::read_text(&p.to_string_lossy())
}

// ── Doc text scans ──────────────────────────────────────────────────────

/// A top-level field at line start, indented at most two spaces:
/// `(?:^|\n) {0,2}<key>:\s*['"]([^'"]+)['"]` and friends. `quoted_key`
/// allows the key in quotes; `stop_newline` excludes `\n` from the value.
fn top_level_fields(text: &str, key: &str, quoted_key: bool, stop_newline: bool, first_only: bool) -> Vec<String> {
    let b = text.as_bytes();
    let mut out = Vec::new();
    let mut line_start = 0usize;
    loop {
        // At a line start (0 or after '\n').
        let mut i = line_start;
        let mut spaces = 0;
        while i < b.len() && b[i] == b' ' && spaces < 2 {
            i += 1;
            spaces += 1;
        }
        // The regex tries 0..=2 spaces; keys never start with a space, so the
        // greedy count is the only one that can match.
        if let Some(v) = match_field(b, i, key, quoted_key, stop_newline) {
            out.push(v);
            if first_only {
                return out;
            }
        }
        match text[line_start..].find('\n') {
            Some(off) => line_start = line_start + off + 1,
            None => break,
        }
    }
    out
}

fn is_js_ws(c: u8) -> bool {
    matches!(c, b' ' | b'\t' | b'\n' | b'\r' | 0x0b | 0x0c)
}

fn match_field(b: &[u8], mut i: usize, key: &str, quoted_key: bool, stop_newline: bool) -> Option<String> {
    if quoted_key && i < b.len() && (b[i] == b'\'' || b[i] == b'"') {
        i += 1;
        if !b[i..].starts_with(key.as_bytes()) {
            return None;
        }
        i += key.len();
        if i < b.len() && (b[i] == b'\'' || b[i] == b'"') {
            i += 1;
        }
    } else {
        if !b[i..].starts_with(key.as_bytes()) {
            return None;
        }
        i += key.len();
        if quoted_key && i < b.len() && (b[i] == b'\'' || b[i] == b'"') {
            i += 1;
        }
    }
    // Optional whitespace before ':' only when the key may be quoted.
    if quoted_key {
        while i < b.len() && is_js_ws(b[i]) {
            i += 1;
        }
    }
    if i >= b.len() || b[i] != b':' {
        return None;
    }
    i += 1;
    while i < b.len() && is_js_ws(b[i]) {
        i += 1;
    }
    if i >= b.len() || (b[i] != b'\'' && b[i] != b'"') {
        return None;
    }
    i += 1;
    let start = i;
    while i < b.len() && b[i] != b'\'' && b[i] != b'"' && !(stop_newline && b[i] == b'\n') {
        i += 1;
    }
    if i >= b.len() || i == start || (b[i] != b'\'' && b[i] != b'"') {
        return None;
    }
    Some(String::from_utf8_lossy(&b[start..i]).into_owned())
}

/// `HIDDEN_RE`: `(?:^|\n) {0,2}hidden:\s*true`.
fn has_hidden_true(text: &str) -> bool {
    let b = text.as_bytes();
    let mut line_start = 0usize;
    loop {
        let mut i = line_start;
        let mut spaces = 0;
        while i < b.len() && b[i] == b' ' && spaces < 2 {
            i += 1;
            spaces += 1;
        }
        if b[i..].starts_with(b"hidden:") {
            let mut j = i + 7;
            while j < b.len() && is_js_ws(b[j]) {
                j += 1;
            }
            if b[j..].starts_with(b"true") {
                return true;
            }
        }
        match text[line_start..].find('\n') {
            Some(off) => line_start = line_start + off + 1,
            None => return false,
        }
    }
}

/// `HIDDEN_COMPONENTS_RE` and its quoted names.
fn hidden_components(text: &str) -> HashSet<String> {
    let mut set = HashSet::new();
    let b = text.as_bytes();
    let mut line_start = 0usize;
    loop {
        let mut i = line_start;
        let mut spaces = 0;
        while i < b.len() && b[i] == b' ' && spaces < 2 {
            i += 1;
            spaces += 1;
        }
        if b[i..].starts_with(b"hiddenComponents:") {
            let mut j = i + 17;
            while j < b.len() && is_js_ws(b[j]) {
                j += 1;
            }
            if j < b.len() && b[j] == b'[' {
                if let Some(end) = text[j + 1..].find(']') {
                    let inner = &text[j + 1..j + 1 + end];
                    let ib = inner.as_bytes();
                    let mut k = 0;
                    while k < ib.len() {
                        if ib[k] == b'\'' || ib[k] == b'"' {
                            let s = k + 1;
                            let mut e = s;
                            while e < ib.len() && ib[e] != b'\'' && ib[e] != b'"' {
                                e += 1;
                            }
                            if e < ib.len() && e > s {
                                set.insert(inner[s..e].to_string());
                                k = e + 1;
                                continue;
                            }
                            if e >= ib.len() {
                                break;
                            }
                            // `''`: the regex needs one char; retry from the
                            // closing quote.
                            k = e;
                            continue;
                        }
                        k += 1;
                    }
                    return set;
                }
            }
        }
        match text[line_start..].find('\n') {
            Some(off) => line_start = line_start + off + 1,
            None => return set,
        }
    }
}

/// What a quick scan of a doc's text finds before anything parses it.
#[derive(Debug, Clone, Default)]
pub struct DocScan {
    pub names: Vec<String>,
    pub has_members: bool,
    pub replaces: Option<String>,
}

fn has_word_components(text: &str) -> bool {
    let b = text.as_bytes();
    let w = b"components";
    let is_w = |c: u8| c.is_ascii_alphanumeric() || c == b'_';
    let mut from = 0;
    while let Some(off) = text[from..].find("components") {
        let i = from + off;
        let before = i > 0 && is_w(b[i - 1]);
        let after = i + w.len() < b.len() && is_w(b[i + w.len()]);
        if !before && !after {
            return true;
        }
        from = i + 1;
    }
    false
}

/// `scanDocText(text)`.
pub fn scan_doc_text(text: &str) -> DocScan {
    DocScan {
        names: if text.contains("...") { Vec::new() } else { top_level_fields(text, "name", true, true, false) },
        has_members: has_word_components(text),
        replaces: top_level_fields(text, "replaces", true, true, true).into_iter().next(),
    }
}

/// `readDocMeta(docPath)`.
#[derive(Debug, Clone, Default)]
pub struct DocMeta {
    pub group: Option<String>,
    pub hidden_components: HashSet<String>,
    pub hidden: bool,
    pub scan: DocScan,
}

pub fn read_doc_meta(doc_path: &Path) -> DocMeta {
    let Some(content) = read_text(doc_path) else { return DocMeta::default() };
    DocMeta {
        group: top_level_fields(&content, "group", false, false, true).into_iter().next(),
        hidden_components: hidden_components(&content),
        hidden: has_hidden_true(&content),
        scan: scan_doc_text(&content),
    }
}

/// `read_doc_meta` without the `scan` (left default): what grouping needs.
fn read_group_meta(doc_path: &Path) -> DocMeta {
    let Some(content) = read_text(doc_path) else { return DocMeta::default() };
    DocMeta {
        group: top_level_fields(&content, "group", false, false, true).into_iter().next(),
        hidden_components: hidden_components(&content),
        hidden: has_hidden_true(&content),
        scan: DocScan::default(),
    }
}

/// `isHiddenComponentDoc(docPath)`.
pub fn is_hidden_component_doc(doc_path: &Path) -> bool {
    read_group_meta(doc_path).hidden
}

// ── Family docs ─────────────────────────────────────────────────────────

/// `docMemberNames(source)`: static `{name: '<Name>'}` entries in the doc
/// object's `components` array, read without running the doc.
pub fn doc_member_names(source: &str) -> Vec<String> {
    crate::discovery::module_exports::doc_member_names(source)
}

fn has_own_folder(src_dir: &Path, name: &str) -> bool {
    [format!("{name}.tsx"), format!("XDS{name}.tsx")]
        .iter()
        .any(|f| exists_case_exact(&src_dir.join(name).join(f), src_dir))
}

fn member_cache() -> &'static Mutex<HashMap<PathBuf, Vec<String>>> {
    static C: std::sync::OnceLock<Mutex<HashMap<PathBuf, Vec<String>>>> = std::sync::OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

fn read_doc_members(doc_path: &Path) -> Vec<String> {
    if let Some(v) = member_cache().lock().unwrap().get(doc_path) {
        return v.clone();
    }
    let members = read_text(doc_path).map(|s| doc_member_names(&s)).unwrap_or_default();
    member_cache().lock().unwrap().insert(doc_path.to_path_buf(), members.clone());
    members
}

/// `SIBLING_IMPORT_RE` folders: `from '../X...'` / `import('../X...')`.
fn sibling_import_dirs(source: &str) -> Vec<String> {
    let b = source.as_bytes();
    let mut out = Vec::new();
    let is_w = |c: u8| c.is_ascii_alphanumeric() || c == b'_';
    let mut i = 0;
    while i < b.len() {
        let mut j = None;
        if b[i..].starts_with(b"from") && (i == 0 || !is_w(b[i - 1])) {
            j = Some(i + 4);
        } else if b[i..].starts_with(b"import") && (i == 0 || !is_w(b[i - 1])) {
            let mut k = i + 6;
            while k < b.len() && is_js_ws(b[k]) {
                k += 1;
            }
            if k < b.len() && b[k] == b'(' {
                j = Some(k + 1);
            }
        }
        if let Some(mut k) = j {
            while k < b.len() && is_js_ws(b[k]) {
                k += 1;
            }
            if k < b.len() && (b[k] == b'\'' || b[k] == b'"') && b[k + 1..].starts_with(b"../") {
                let s = k + 4;
                let mut e = s;
                while e < b.len() && (b[e].is_ascii_alphanumeric() || b[e] == b'_' || b[e] == b'-') {
                    e += 1;
                }
                if e > s && e < b.len() {
                    // (?:\/[^'"]*)?['"]
                    let mut t = e;
                    if b[t] == b'/' {
                        while t < b.len() && b[t] != b'\'' && b[t] != b'"' {
                            t += 1;
                        }
                    }
                    if t < b.len() && (b[t] == b'\'' || b[t] == b'"') {
                        out.push(source[s..e].to_string());
                        i = t + 1;
                        continue;
                    }
                }
            }
        }
        i += 1;
    }
    out
}

fn find_family_doc(src_dir: &Path, name: &str) -> Option<PathBuf> {
    let source_path = [format!("{name}.tsx"), format!("XDS{name}.tsx")]
        .iter()
        .map(|f| src_dir.join(name).join(f))
        .find(|f| exists_case_exact(f, src_dir))?;
    let source = read_text(&source_path)?;
    let mut families: Vec<String> = Vec::new();
    for d in sibling_import_dirs(&source) {
        if !families.contains(&d) {
            families.push(d);
        }
    }
    families.retain(|d| d != name && !SKIP_DIRS.contains(&d.as_str()));
    families.sort_by(|a, b| code_unit_cmp(a, b));
    let xds = format!("XDS{name}");
    for dir in families {
        let dir_path = src_dir.join(&dir);
        if !exists_case_exact(&dir_path, src_dir) {
            continue;
        }
        for file in list_dir(&dir_path) {
            if !file.ends_with(".doc.mjs") {
                continue;
            }
            let doc_path = dir_path.join(&file);
            let members = read_doc_members(&doc_path);
            if members.iter().any(|m| m == name || *m == xds) {
                return Some(doc_path);
            }
        }
    }
    None
}

/// `familyMember(docs, name)`: the entry a family doc gives `name` in its
/// `components`, when the doc is not the component's own.
pub fn family_member<'a>(docs: &'a Value, name: &str) -> Option<&'a Value> {
    let doc_name = docs.get("name").and_then(|v| v.as_str());
    let xds = format!("XDS{name}");
    if docs.is_null() || doc_name == Some(name) || doc_name == Some(xds.as_str()) {
        return None;
    }
    let members = docs.get("components")?.as_array()?;
    members.iter().find(|m| {
        let n = m.get("name").and_then(|v| v.as_str());
        n == Some(name) || n == Some(xds.as_str())
    })
}

// ── Core discovery ──────────────────────────────────────────────────────

fn is_component_source_file(file_name: &str, dir_path: &Path) -> bool {
    if file_name.contains(".test.") || file_name.contains("Context.") {
        return false;
    }
    let Some(stem) = file_name.strip_suffix(".tsx") else { return false };
    let word = |s: &str| !s.is_empty() && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_');
    // /^XDS[A-Z]\w+\.tsx$/
    if let Some(rest) = stem.strip_prefix("XDS") {
        let rb = rest.as_bytes();
        if rb.len() >= 2 && rb[0].is_ascii_uppercase() && word(&rest[1..]) {
            return true;
        }
    }
    // /^[A-Z]\w+\.tsx$/ plus a sibling doc.
    let sb = stem.as_bytes();
    if sb.len() >= 2 && sb[0].is_ascii_uppercase() && word(&stem[1..]) {
        return path_exists(&dir_path.join(format!("{stem}.doc.mjs")))
            || path_exists(&dir_path.join(format!("XDS{stem}.doc.mjs")));
    }
    false
}

fn component_name_from_file(file_name: &str) -> String {
    let s = file_name.strip_prefix("XDS").unwrap_or(file_name);
    s.strip_suffix(".tsx").unwrap_or(s).to_string()
}

/// Core components grouped as `discoverComponents` returns them: group name
/// (or the component's own name) to sorted members, keys in locale order.
pub type ComponentGroups = IndexMap<String, Vec<String>>;

fn groups_cache() -> &'static Mutex<HashMap<PathBuf, ComponentGroups>> {
    static C: std::sync::OnceLock<Mutex<HashMap<PathBuf, ComponentGroups>>> = std::sync::OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

/// `discoverComponents(coreDir)`.
pub fn discover_components(core_dir: &Path) -> ComponentGroups {
    if let Some(g) = groups_cache().lock().unwrap().get(core_dir) {
        return g.clone();
    }
    let g = read_component_groups(core_dir);
    groups_cache().lock().unwrap().insert(core_dir.to_path_buf(), g.clone());
    g
}

/// `discoverComponents(coreDir)`, failing as Node's `readdirSync` fails
/// when Core has no `src` folder.
pub fn try_discover_components(core_dir: &Path) -> Result<ComponentGroups, String> {
    let src = core_dir.join("src");
    if super::zipfs::is_special(&src.to_string_lossy()) {
        if !super::nodepath::is_dir(&src.to_string_lossy()) {
            let what = if super::nodepath::exists(&src.to_string_lossy()) { "ENOTDIR: not a directory" } else { "ENOENT: no such file or directory" };
            return Err(format!("{what}, scandir '{}'", src.display()));
        }
    } else if let Err(e) = std::fs::read_dir(&src) {
        let what = match e.kind() {
            std::io::ErrorKind::NotFound => "ENOENT: no such file or directory",
            std::io::ErrorKind::PermissionDenied => "EACCES: permission denied",
            _ => "ENOTDIR: not a directory",
        };
        return Err(format!("{what}, scandir '{}'", src.display()));
    }
    Ok(discover_components(core_dir))
}

/// Every Core component name, in group order.
pub fn all_component_names(core_dir: &Path) -> Vec<String> {
    discover_components(core_dir).into_values().flatten().collect()
}

fn order_groups(component_groups: Vec<(String, Option<String>)>) -> ComponentGroups {
    let mut groups: IndexMap<String, Vec<String>> = IndexMap::new();
    let mut ungrouped: Vec<String> = Vec::new();
    for (name, group) in component_groups {
        match group {
            Some(g) => groups.entry(g).or_default().push(name),
            None => ungrouped.push(name),
        }
    }
    for members in groups.values_mut() {
        members.sort_by(|a, b| code_unit_cmp(a, b));
    }
    let mut entries: Vec<(String, Vec<String>)> = groups.into_iter().collect();
    for n in ungrouped {
        entries.push((n.clone(), vec![n]));
    }
    entries.sort_by(|a, b| locale_compare(&a.0, &b.0));
    entries.into_iter().collect()
}

fn read_component_groups(core_dir: &Path) -> ComponentGroups {
    let src_dir = core_dir.join("src");
    let mut component_groups: Vec<(String, Option<String>)> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    fn collect(dir: &Path) -> Vec<String> {
        let mut out = Vec::new();
        if !path_exists(dir) {
            return out;
        }
        for e in list_dir_entries(dir) {
            if e.is_dir {
                out.extend(collect(&dir.join(&e.name)));
            } else if is_component_source_file(&e.name, dir) {
                out.push(e.name);
            }
        }
        out
    }

    let top = list_dir_entries(&src_dir);
    for entry in &top {
        if !entry.is_dir || SKIP_DIRS.contains(&entry.name.as_str()) {
            continue;
        }
        let dir_path = src_dir.join(&entry.name);
        let files = collect(&dir_path);
        let mut doc_file = dir_path.join(format!("{}.doc.mjs", entry.name));
        if !path_exists(&doc_file) {
            doc_file = dir_path.join(format!("XDS{}.doc.mjs", entry.name));
        }
        let doc_exists = path_exists(&doc_file);
        let meta = if doc_exists { read_group_meta(&doc_file) } else { DocMeta::default() };
        if meta.hidden {
            continue;
        }
        for file_name in files {
            let name = component_name_from_file(&file_name);
            if meta.hidden_components.contains(&name) {
                continue;
            }
            let mut group = meta.group.clone();
            let mut comp_doc = dir_path.join(format!("{name}.doc.mjs"));
            if !path_exists(&comp_doc) {
                comp_doc = dir_path.join(format!("XDS{name}.doc.mjs"));
            }
            let has_comp_doc = path_exists(&comp_doc);
            if has_comp_doc {
                let cm = read_group_meta(&comp_doc);
                if cm.group.is_some() {
                    group = cm.group;
                }
            }
            if !doc_exists && !has_comp_doc {
                continue;
            }
            if seen.insert(name.clone()) {
                component_groups.push((name, group));
            }
        }
    }

    for entry in &top {
        if !entry.is_dir || SKIP_DIRS.contains(&entry.name.as_str()) {
            continue;
        }
        let name = &entry.name;
        if seen.contains(name) || name.ends_with("Context") {
            continue;
        }
        if list_dir(&src_dir.join(name)).iter().any(|f| f.ends_with(".doc.mjs")) {
            continue;
        }
        if !has_own_folder(&src_dir, name) {
            continue;
        }
        let Some(doc_path) = find_component_readme(core_dir, name) else { continue };
        if !doc_path.to_string_lossy().ends_with(".doc.mjs") {
            continue;
        }
        let meta = read_group_meta(&doc_path);
        if meta.hidden || meta.hidden_components.contains(name) {
            continue;
        }
        seen.insert(name.clone());
        component_groups.push((name.clone(), meta.group));
    }

    order_groups(component_groups)
}

/// `findComponentReadme(coreDir, name)`.
pub fn find_component_readme(core_dir: &Path, name: &str) -> Option<PathBuf> {
    let src_dir = core_dir.join("src");
    let exact = format!("{name}.doc.mjs");
    let xds = format!("XDS{name}.doc.mjs");
    let direct = src_dir.join(name).join(&exact);
    if exists_case_exact(&direct, &src_dir) {
        return Some(direct);
    }
    let direct_xds = src_dir.join(name).join(&xds);
    if exists_case_exact(&direct_xds, &src_dir) {
        return Some(direct_xds);
    }
    let entries = list_dir_entries(&src_dir);
    for e in entries.iter().filter(|e| e.is_dir) {
        let nested = src_dir.join(&e.name).join(name).join(&exact);
        if exists_case_exact(&nested, &src_dir) {
            return Some(nested);
        }
        let nested_xds = src_dir.join(&e.name).join(name).join(&xds);
        if exists_case_exact(&nested_xds, &src_dir) {
            return Some(nested_xds);
        }
    }
    for e in entries.iter().filter(|e| e.is_dir) {
        let per = src_dir.join(&e.name).join(&exact);
        if exists_case_exact(&per, &src_dir) {
            return Some(per);
        }
        let per_xds = src_dir.join(&e.name).join(&xds);
        if exists_case_exact(&per_xds, &src_dir) {
            return Some(per_xds);
        }
    }
    if let Some(source) = find_component_source(core_dir, name) {
        let mut dir = source.parent().map(Path::to_path_buf);
        while let Some(d) = dir {
            if !d.to_string_lossy().starts_with(&*src_dir.to_string_lossy()) {
                break;
            }
            for f in list_dir(&d) {
                if f.ends_with(".doc.mjs") {
                    return Some(d.join(f));
                }
            }
            dir = d.parent().map(Path::to_path_buf);
        }
    }
    if has_own_folder(&src_dir, name) {
        return find_family_doc(&src_dir, name);
    }
    None
}

fn own_file_names(name: &str) -> [String; 4] {
    [format!("XDS{name}.tsx"), format!("{name}.tsx"), format!("XDS{name}.ts"), format!("{name}.ts")]
}

fn own_source_file(core_dir: &Path, name: &str) -> Option<PathBuf> {
    let src_dir = core_dir.join("src");
    let candidates = own_file_names(name);
    fn search(dir: &Path, listed: bool, candidates: &[String]) -> Option<PathBuf> {
        if !listed && !path_exists(dir) {
            return None;
        }
        let entries = list_dir_entries(dir);
        for c in candidates {
            let Some(e) = entries.iter().find(|e| e.name == *c) else { continue };
            let exact = dir.join(c);
            if !e.is_symlink || path_exists(&exact) {
                return Some(exact);
            }
        }
        for e in &entries {
            if e.is_dir {
                if let Some(f) = search(&dir.join(&e.name), true, candidates) {
                    return Some(f);
                }
            }
        }
        None
    }
    let direct = src_dir.join(name);
    if exists_case_exact(&direct, &src_dir) {
        if let Some(f) = search(&direct, false, &candidates) {
            return Some(f);
        }
    }
    for e in list_dir_entries(&src_dir) {
        if !e.is_dir {
            continue;
        }
        let nested = src_dir.join(&e.name).join(name);
        if exists_case_exact(&nested, &src_dir) {
            if let Some(f) = search(&nested, false, &candidates) {
                return Some(f);
            }
        }
    }
    search(&src_dir, false, &candidates)
}

fn is_component_or_hook_name(stem: &str) -> bool {
    let s = stem.strip_prefix("use").filter(|r| r.as_bytes().first().is_some_and(|c| c.is_ascii_uppercase())).unwrap_or(stem);
    let b = s.as_bytes();
    !b.is_empty() && b[0].is_ascii_uppercase() && b.iter().all(|c| c.is_ascii_alphanumeric())
}

fn case_stem_index(src_dir: &Path) -> HashMap<String, Vec<(String, PathBuf)>> {
    static C: std::sync::OnceLock<Mutex<HashMap<PathBuf, HashMap<String, Vec<(String, PathBuf)>>>>> = std::sync::OnceLock::new();
    let cache = C.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(v) = cache.lock().unwrap().get(src_dir) {
        return v.clone();
    }
    let mut index: HashMap<String, Vec<(String, PathBuf)>> = HashMap::new();
    fn visit(dir: &Path, index: &mut HashMap<String, Vec<(String, PathBuf)>>) {
        for e in list_dir_entries(dir) {
            let p = dir.join(&e.name);
            if e.is_dir {
                if e.name != "__tests__" {
                    visit(&p, index);
                }
                continue;
            }
            // /^(?:XDS)?(.+)\.tsx?$/
            let base = e.name.strip_suffix(".tsx").or_else(|| e.name.strip_suffix(".ts"));
            let Some(base) = base else { continue };
            let stem = match base.strip_prefix("XDS") {
                Some(r) if !r.is_empty() => r,
                _ => base,
            };
            if stem.is_empty() || !is_component_or_hook_name(stem) {
                continue;
            }
            index.entry(stem.to_lowercase()).or_default().push((stem.to_string(), p));
        }
    }
    if path_exists(src_dir) {
        visit(src_dir, &mut index);
    }
    cache.lock().unwrap().insert(src_dir.to_path_buf(), index.clone());
    index
}

fn case_spelled_component_source(src_dir: &Path, name: &str) -> Option<PathBuf> {
    let index = case_stem_index(src_dir);
    for (stem, file) in index.get(&name.to_lowercase()).cloned().unwrap_or_default() {
        if stem != name
            && (crate::discovery::module_exports::module_exports_name(&file, &stem)
                || crate::discovery::module_exports::module_exports_name(&file, &format!("XDS{stem}")))
        {
            return Some(file);
        }
    }
    None
}

/// `findComponentSource(coreDir, name)`.
pub fn find_component_source(core_dir: &Path, name: &str) -> Option<PathBuf> {
    let found = own_source_file(core_dir, name)?;
    if case_spelled_component_source(&core_dir.join("src"), name).is_none() {
        Some(found)
    } else {
        None
    }
}

fn export_keys_of(core_dir: &Path) -> std::sync::Arc<Vec<String>> {
    let key = format!("export-keys\0{}", core_dir.display());
    crate::discovery::listing_cache::once_per_listing(&key, || read_export_keys(core_dir))
}

fn read_export_keys(core_dir: &Path) -> Vec<String> {
    let pkg = core_dir.join("package.json");
    let Some(text) = read_text(&pkg) else { return Vec::new() };
    let Ok(v) = serde_json::from_str::<Value>(&text) else { return Vec::new() };
    match v.get("exports") {
        Some(Value::Object(m)) => m.keys().cloned().collect(),
        _ => Vec::new(),
    }
}

/// `resolveImportPath(coreDir, componentName)`.
pub fn resolve_import_path(core_dir: &Path, component_name: &str) -> String {
    let src_dir = core_dir.join("src");
    let keys = export_keys_of(core_dir);
    let want = format!("./{component_name}").to_lowercase();
    if let Some(k) = keys.iter().find(|k| k.to_lowercase() == want) {
        return format!("{CORE_PACKAGE}/{}", &k[2..]);
    }
    let Some(source) = find_component_source(core_dir, component_name) else {
        return CORE_PACKAGE.to_string();
    };
    let Ok(rel) = source.strip_prefix(&src_dir) else { return CORE_PACKAGE.to_string() };
    let top = rel.components().next().map(|c| c.as_os_str().to_string_lossy().into_owned()).unwrap_or_default();
    let want = format!("./{top}").to_lowercase();
    if let Some(k) = keys.iter().find(|k| k.to_lowercase() == want) {
        return format!("{CORE_PACKAGE}/{}", &k[2..]);
    }
    CORE_PACKAGE.to_string()
}

/// `exportsPublish(exportsMap, subpath)`.
pub fn exports_publish(exports_map: Option<&Value>, subpath: &str) -> bool {
    let Some(Value::Object(map)) = exports_map else { return false };
    if let Some(v) = map.get(subpath) {
        return !v.is_null();
    }
    for (key, target) in map {
        let Some(star) = key.find('*') else { continue };
        if key[star + 1..].contains('*') {
            continue;
        }
        let prefix = &key[..star];
        let suffix = &key[star + 1..];
        if subpath.len() >= prefix.len() + suffix.len() && subpath.starts_with(prefix) && subpath.ends_with(suffix) {
            return !target.is_null();
        }
    }
    false
}

/// What `resolveIntegrationImportPath` needs to know about an owner.
#[derive(Debug, Clone, Default)]
pub struct ImportOwner {
    /// `None`: no parsed map, read the manifest. `Some(Null)`: no exports.
    pub exports_map: Option<Value>,
    pub package_dir: Option<PathBuf>,
    pub doc_path: Option<PathBuf>,
    pub package_name: String,
}

/// `readPackageExports(packageDir)`.
pub fn read_package_exports(package_dir: Option<&Path>) -> Value {
    let Some(dir) = package_dir else { return Value::Null };
    read_text(&dir.join("package.json"))
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.get("exports").cloned())
        .unwrap_or(Value::Null)
}

/// `resolveIntegrationImportPath(owner, componentName, authoredImport)`.
pub fn resolve_integration_import_path(owner: &ImportOwner, component_name: &str, authored: Option<&str>) -> String {
    if let Some(a) = authored.filter(|a| !a.is_empty()) {
        return a.to_string();
    }
    let map = match &owner.exports_map {
        None => read_package_exports(owner.package_dir.as_deref()),
        Some(m) => m.clone(),
    };
    let directory = match &owner.doc_path {
        Some(p) => p.parent().and_then(|d| d.file_name()).map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        None => component_name.to_string(),
    };
    if exports_publish(Some(&map), &format!("./{directory}")) {
        format!("{}/{directory}", owner.package_name)
    } else {
        owner.package_name.clone()
    }
}

// ── Legacy external packages (pkg.astryx.docs) ──────────────────────────

/// `discoverExternalComponentsGrouped(docsDir)`.
pub fn discover_external_components_grouped(docs_dir: &Path) -> ComponentGroups {
    if !path_exists(docs_dir) {
        return IndexMap::new();
    }
    let mut found: IndexMap<String, Option<String>> = IndexMap::new();
    fn scan(dir: &Path, found: &mut IndexMap<String, Option<String>>) {
        for e in list_dir_entries(dir) {
            if e.name == "node_modules" || e.name == "__tests__" {
                continue;
            }
            let full = dir.join(&e.name);
            if e.is_dir {
                scan(&full, found);
            } else if e.name.ends_with(".doc.mjs") {
                let name = e.name.replacen(".doc.mjs", "", 1);
                let meta = read_doc_meta(&full);
                if !meta.hidden {
                    found.insert(name, meta.group);
                }
            }
        }
    }
    scan(docs_dir, &mut found);
    order_groups(found.into_iter().collect())
}

/// `findExternalComponentDoc(docsDir, name)`.
pub fn find_external_component_doc(docs_dir: &Path, name: &str) -> Option<PathBuf> {
    if !path_exists(docs_dir) {
        return None;
    }
    let target = format!("{name}.doc.mjs");
    fn scan(dir: &Path, target: &str) -> Option<PathBuf> {
        for e in list_dir_entries(dir) {
            if e.name == "node_modules" || e.name == "__tests__" {
                continue;
            }
            let full = dir.join(&e.name);
            if e.is_dir {
                if let Some(f) = scan(&full, target) {
                    return Some(f);
                }
            } else if e.name == target {
                return Some(full);
            }
        }
        None
    }
    scan(docs_dir, &target)
}

/// `docStem(docPath)`.
pub fn doc_stem(doc_path: &Path) -> String {
    let base = doc_path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    for s in [".doc.ts", ".doc.mjs", ".doc.js"] {
        if let Some(stem) = base.strip_suffix(s) {
            return stem.to_string();
        }
    }
    base
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scans() {
        let t = "export default {\n  name: 'Button',\n  group: \"Buttons\",\n  hiddenComponents: ['A', \"B\"],\n    group: 'Nested',\n};";
        assert_eq!(top_level_fields(t, "group", false, false, true), vec!["Buttons"]);
        assert_eq!(scan_doc_text(t).names, vec!["Button"]);
        let h = hidden_components(t);
        assert!(h.contains("A") && h.contains("B"));
        assert!(!has_hidden_true(t));
        assert!(has_hidden_true("x\n hidden: true"));
        assert_eq!(sibling_import_dirs("import {S} from '../Stack/Stack';\nimport('../Foo')"), vec!["Stack", "Foo"]);
    }
}

// ── Integrations ────────────────────────────────────────────────────────

/// One loaded integration, the fields component discovery reads.
/// A typed view of a project integration record (`deps::integration_of`).
#[derive(Debug, Clone, Default)]
pub struct LoadedIntegration {
    pub name: String,
    pub version: Option<String>,
    /// The resolved `components` folder.
    pub components: Option<PathBuf>,
    pub issues_url: Option<String>,
    /// `__packageDir`.
    pub package_dir: Option<PathBuf>,
    /// `__packageExports`: `None` when unread, `Some(Null)` when the package
    /// has no `exports`.
    pub package_exports: Option<Value>,
    pub provider_id: Option<String>,
    /// `__autolinked`.
    pub autolinked: bool,
    /// `__loadError` is set.
    pub load_error: bool,
}

/// Loads a component doc strictly (`loadComponentDoc(docPath)`), as data,
/// through the shared `readDocView`.
pub fn load_component_doc_strict(doc_path: &Path) -> Result<Value, String> {
    crate::commands::component::deps::read_doc_view(
        doc_path,
        &crate::commands::component::deps::ReadOpts { root: "components", lang: None, strict: true },
    )
}

/// An integration component record.
#[derive(Debug, Clone)]
pub struct IntegrationRecord {
    pub name: String,
    pub package: String,
    pub doc_path: PathBuf,
    pub source_path: Option<PathBuf>,
    pub issues_url: Option<String>,
    pub group: Option<String>,
    /// `replaces` from the loaded doc, when it sets one.
    pub replaces: Option<Value>,
}

const COMPONENT_NAME_CHARS: fn(u8) -> bool = |c| c.is_ascii_alphanumeric() || c == b'_' || c == b'$';

/// `/^[A-Z][\w$]*$/`.
pub fn is_component_name(name: &str) -> bool {
    let b = name.as_bytes();
    !b.is_empty() && b[0].is_ascii_uppercase() && b[1..].iter().all(|c| COMPONENT_NAME_CHARS(*c))
}

fn doc_object(doc_path: &Path) -> Option<crate::json::Map<String, Value>> {
    crate::discovery::module_exports::static_export_object(doc_path, &["default", "docs"])
}

/// Keys of a static object, without the `HAS_COMPUTED` marker.
fn own_key_count(m: &crate::json::Map<String, Value>) -> usize {
    m.keys().filter(|k| *k != crate::discovery::module_exports::HAS_COMPUTED).count()
}

fn other_export_name(doc_path: &Path, source_path: Option<&Path>, stem: &str, names: &[String]) -> Option<String> {
    let source_path = source_path?;
    if !names.is_empty() && names.iter().all(|n| n == stem) {
        return None;
    }
    let name = doc_object(doc_path)?.get("name")?.as_str()?.to_string();
    use crate::discovery::module_exports::module_exports_name;
    if name != stem && is_component_name(&name) && module_exports_name(source_path, &name) && !module_exports_name(source_path, stem) {
        Some(name)
    } else {
        None
    }
}

fn integration_exports_map(integration: &LoadedIntegration) -> Value {
    match &integration.package_exports {
        Some(v) => v.clone(),
        None => read_package_exports(integration.package_dir.as_deref()),
    }
}

fn package_main(package_dir: &Path) -> Option<PathBuf> {
    let text = read_text(&package_dir.join("package.json"))?;
    let pkg: Value = serde_json::from_str(&text).ok()?;
    let entry = match pkg.get("main").and_then(|m| m.as_str()) {
        Some(m) if !m.is_empty() => {
            let norm = posix_normalize(m);
            format!("./{}", norm.strip_prefix("./").unwrap_or(&norm))
        }
        _ => "./index".to_string(),
    };
    crate::discovery::package_exports::inspect_package_export("", None, package_dir, &entry).target
}

fn posix_normalize(p: &str) -> String {
    let abs = p.starts_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if parts.last().is_some_and(|l| *l != "..") {
                    parts.pop();
                } else if !abs {
                    parts.push("..");
                }
            }
            s => parts.push(s),
        }
    }
    let mut out = parts.join("/");
    if abs {
        out = format!("/{out}");
    }
    if p.ends_with('/') && !out.is_empty() {
        out.push('/');
    }
    if out.is_empty() {
        out = if abs { "/".into() } else { ".".into() };
    }
    out
}

/// `importedModule(integration, docPath, doc)`: `None` when the integration
/// has no package facts (`undefined`), `Some(None)` when the import is not the
/// package's own (`null`).
pub fn imported_module(integration: &LoadedIntegration, doc_path: &Path, doc: Option<&crate::json::Map<String, Value>>) -> Option<Option<PathBuf>> {
    let package_dir = integration.package_dir.as_ref()?;
    if integration.name.is_empty() {
        return None;
    }
    let name = &integration.name;
    let exports = integration_exports_map(integration);
    let owner = ImportOwner {
        exports_map: Some(exports.clone()),
        package_dir: Some(package_dir.clone()),
        doc_path: Some(doc_path.to_path_buf()),
        package_name: name.clone(),
    };
    let authored = doc.and_then(|d| d.get("import")).and_then(|v| v.as_str());
    let specifier = resolve_integration_import_path(&owner, &doc_stem(doc_path), authored);
    if specifier != *name && !specifier.starts_with(&format!("{name}/")) {
        return Some(None);
    }
    if specifier == *name && exports.is_null() {
        return Some(package_main(package_dir));
    }
    let subpath = if specifier == *name { ".".to_string() } else { format!("./{}", &specifier[name.len() + 1..]) };
    let ex = if exports.is_null() { None } else { Some(&exports) };
    Some(
        crate::discovery::package_exports::source_export_target(ex, package_dir, &subpath)
            .or_else(|| crate::discovery::package_exports::inspect_package_export(name, ex, package_dir, &subpath).target),
    )
}

fn is_within(folder: &Path, file: &Path) -> bool {
    file != folder && file.starts_with(folder)
}

/// `folderSourceFor(folder, name)`.
pub fn folder_source_for(folder: &Path, name: &str) -> Option<PathBuf> {
    let mut files: Vec<PathBuf> = Vec::new();
    fn scan(dir: &Path, files: &mut Vec<PathBuf>) {
        for e in list_dir_entries(dir) {
            if e.name == "node_modules" || e.name == "__tests__" || e.name.starts_with('.') {
                continue;
            }
            let full = dir.join(&e.name);
            if e.is_dir {
                scan(&full, files);
            } else if e.name.ends_with(".tsx")
                && !e.name.ends_with(".test.tsx")
                && !e.name.ends_with(".spec.tsx")
                && !e.name.ends_with(".stories.tsx")
            {
                files.push(full);
            }
        }
    }
    scan(folder, &mut files);
    files.sort_by(|a, b| code_unit_cmp(&a.to_string_lossy(), &b.to_string_lossy()));
    for f in files {
        if let Some(d) = crate::discovery::module_exports::module_export_source(&f, name) {
            if d.to_string_lossy().ends_with(".tsx") && is_within(folder, &d) {
                return Some(d);
            }
        }
    }
    None
}

fn family_members(
    integration: &LoadedIntegration,
    doc_path: &Path,
    family_source: Option<&Path>,
    own_name: Option<&str>,
    only: Option<&str>,
) -> Vec<(String, Option<PathBuf>)> {
    let doc = doc_object(doc_path);
    let entries: Vec<Value> = doc.as_ref().and_then(|d| d.get("components")).and_then(|c| c.as_array()).cloned().unwrap_or_default();
    let hidden: Vec<String> = doc
        .as_ref()
        .and_then(|d| d.get("hiddenComponents"))
        .and_then(|h| h.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let stem = doc_stem(doc_path);
    let mut names = Vec::new();
    for entry in &entries {
        let Some(obj) = entry.as_object() else { continue };
        let Some(name) = obj.get("name").and_then(|n| n.as_str()) else { continue };
        let full = own_key_count(obj) > 1 || obj.contains_key(crate::discovery::module_exports::HAS_COMPUTED);
        if !full || !is_component_name(name) || hidden.iter().any(|h| h == name) {
            continue;
        }
        if name == stem || Some(name) == own_name {
            continue;
        }
        if only.is_some_and(|o| o != name) {
            continue;
        }
        names.push(name.to_string());
    }
    if names.is_empty() {
        return Vec::new();
    }
    let module = match imported_module(integration, doc_path, doc.as_ref()) {
        None => family_source.map(Path::to_path_buf),
        Some(m) => m,
    };
    let Some(module) = module else { return Vec::new() };
    let folder = doc_path.parent().unwrap_or(Path::new("")).to_path_buf();
    let in_folder = |f: &Option<PathBuf>| f.as_ref().is_some_and(|f| f.to_string_lossy().ends_with(".tsx") && is_within(&folder, f));
    let mut out = Vec::new();
    for name in names {
        let Some(exported) = crate::discovery::module_exports::module_export_source(&module, &name) else { continue };
        let first = family_source.and_then(|fs| crate::discovery::module_exports::module_export_source(fs, &name));
        let reached = [first, Some(exported)].into_iter().find(|f| in_folder(f)).flatten();
        let source = reached.or_else(|| folder_source_for(&folder, &name));
        out.push((name, source));
    }
    out
}

fn is_own_record(name: &str, doc_path: &Path) -> bool {
    let stem = doc_stem(doc_path);
    if stem == name {
        return true;
    }
    other_export_name(doc_path, integration_source_for_doc(doc_path).as_deref(), &stem, &[]).as_deref() == Some(name)
}

/// `isIntegrationMember(record)`.
pub fn is_integration_member(name: &str, doc_path: Option<&Path>) -> bool {
    match doc_path {
        None => false,
        Some(p) => !is_own_record(name, p),
    }
}

/// `integrationMemberEntry(doc, record)`.
pub fn integration_member_entry<'a>(doc: &'a Value, name: &str, doc_path: &Path) -> Option<&'a Value> {
    if !doc.is_object() || is_own_record(name, doc_path) {
        return None;
    }
    doc.get("components")?.as_array()?.iter().find(|e| e.get("name").and_then(|n| n.as_str()) == Some(name))
}

fn is_folder(p: &Path) -> bool {
    super::nodepath::is_dir(&p.to_string_lossy())
}

fn doc_suffix_rank(name: &str) -> (String, i32) {
    for (i, s) in INTEGRATION_DOC_SUFFIXES.iter().enumerate() {
        if let Some(stem) = name.strip_suffix(s) {
            return (stem.to_string(), i as i32);
        }
    }
    (name.to_string(), -1)
}

/// `forEachIntegrationDoc(componentsDir, visit)`.
pub fn for_each_integration_doc(components_dir: &Path, visit: &mut dyn FnMut(&Path, &str)) {
    if !is_folder(components_dir) {
        return;
    }
    fn scan(dir: &Path, visit: &mut dyn FnMut(&Path, &str)) {
        let mut entries = list_dir_entries(dir);
        entries.sort_by(|a, b| {
            let (ls, lr) = doc_suffix_rank(&a.name);
            let (rs, rr) = doc_suffix_rank(&b.name);
            if ls == rs { lr.cmp(&rr) } else { code_unit_cmp(&ls, &rs) }
        });
        for e in entries {
            if e.name == "node_modules" || e.name == "__tests__" {
                continue;
            }
            let full = dir.join(&e.name);
            if e.is_dir {
                scan(&full, visit);
                continue;
            }
            if let Some(s) = INTEGRATION_DOC_SUFFIXES.iter().find(|s| e.name.ends_with(*s)) {
                visit(&full, &e.name[..e.name.len() - s.len()]);
            }
        }
    }
    scan(components_dir, visit);
}

/// `integrationSourceForDoc(docPath)`.
pub fn integration_source_for_doc(doc_path: &Path) -> Option<PathBuf> {
    let dir = doc_path.parent()?;
    let c = dir.join(format!("{}.tsx", doc_stem(doc_path)));
    path_exists(&c).then_some(c)
}

/// `discoverIntegrationComponents(integration, {documentedNames})`.
pub fn discover_integration_components(integration: &LoadedIntegration, documented_names: bool) -> Vec<IntegrationRecord> {
    let Some(dir) = integration.components.as_ref().filter(|d| is_folder(d)) else { return Vec::new() };
    let mut by_name: IndexMap<String, IntegrationRecord> = IndexMap::new();
    let mut scans: HashMap<String, DocScan> = HashMap::new();
    let mut taken: HashSet<String> = HashSet::new();
    for_each_integration_doc(dir, &mut |full, name| {
        taken.insert(name.to_string());
        let meta = read_doc_meta(full);
        if meta.hidden || by_name.contains_key(name) {
            return;
        }
        by_name.insert(
            name.to_string(),
            IntegrationRecord {
                name: name.to_string(),
                package: integration.name.clone(),
                doc_path: full.to_path_buf(),
                source_path: integration_source_for_doc(full),
                issues_url: integration.issues_url.clone(),
                group: meta.group,
                replaces: None,
            },
        );
        scans.insert(name.to_string(), meta.scan);
    });
    if !documented_names {
        return by_name.into_values().collect();
    }
    for s in scans.values() {
        if let Some(r) = &s.replaces {
            taken.insert(r.clone());
        }
    }
    let records: Vec<IntegrationRecord> = by_name.into_values().collect();
    let mut by_path = records.clone();
    by_path.sort_by(|a, b| code_unit_cmp(&a.doc_path.to_string_lossy(), &b.doc_path.to_string_lossy()));
    let mut export_names: HashMap<String, String> = HashMap::new();
    for r in &by_path {
        let names = scans.get(&r.name).map(|s| s.names.clone()).unwrap_or_default();
        let Some(en) = other_export_name(&r.doc_path, r.source_path.as_deref(), &r.name, &names) else { continue };
        if taken.contains(&en) {
            continue;
        }
        taken.insert(en.clone());
        export_names.insert(r.name.clone(), en);
    }
    let mut members = Vec::new();
    for r in &by_path {
        if !scans.get(&r.name).is_some_and(|s| s.has_members) {
            continue;
        }
        let own = export_names.get(&r.name).map(String::as_str);
        for (name, source) in family_members(integration, &r.doc_path, r.source_path.as_deref(), own, None) {
            if taken.contains(&name) {
                continue;
            }
            taken.insert(name.clone());
            let mut m = r.clone();
            m.name = name;
            m.source_path = source;
            members.push(m);
        }
    }
    let mut named: Vec<IntegrationRecord> = records
        .into_iter()
        .map(|mut r| {
            if let Some(n) = export_names.get(&r.name) {
                r.name = n.clone();
            }
            r
        })
        .collect();
    named.extend(members);
    named
}

/// What `discoverValidIntegrationComponents` returns.
#[derive(Debug, Clone, Default)]
pub struct ValidComponents {
    pub components: Vec<IntegrationRecord>,
    pub discovered: Vec<IntegrationRecord>,
    pub errors: Vec<(String, String)>,
}

/// `discoverValidIntegrationComponents(integration, {documentedNames})`.
pub fn discover_valid_integration_components(integration: &LoadedIntegration, documented_names: bool) -> ValidComponents {
    let discovered = discover_integration_components(integration, documented_names);
    let mut out = ValidComponents { discovered: discovered.clone(), ..Default::default() };
    let mut failed: HashSet<PathBuf> = HashSet::new();
    for r in discovered {
        let own = is_own_record(&r.name, &r.doc_path);
        if r.source_path.is_none() && own {
            out.errors.push((
                r.name.clone(),
                format!("Component \"{}\" is missing its same-stem source file {}.tsx.", r.name, r.name),
            ));
            continue;
        }
        match load_component_doc_strict(&r.doc_path) {
            Ok(doc) => {
                let mut v = r.clone();
                if own {
                    if let Some(rep) = doc.as_object().and_then(|d| d.get("replaces")) {
                        v.replaces = Some(rep.clone());
                    }
                }
                out.components.push(v);
            }
            Err(msg) => {
                if failed.contains(&r.doc_path) {
                    continue;
                }
                failed.insert(r.doc_path.clone());
                let name = doc_stem(&r.doc_path);
                out.errors.push((name.clone(), format!("Component \"{name}\" has invalid metadata: {msg}")));
            }
        }
    }
    out
}

/// How an owner holds a component name: `core`, `file` (its doc's file
/// name) or `doc` (an export name its doc records).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NameHold {
    Core,
    File,
    Doc,
}

/// `integrationRecordHold(record)`.
pub fn integration_record_hold(name: &str, doc_path: Option<&Path>) -> NameHold {
    match doc_path {
        None => NameHold::File,
        Some(p) if doc_stem(p) == name => NameHold::File,
        _ => NameHold::Doc,
    }
}

struct Candidate {
    doc_path: PathBuf,
    scan: DocScan,
    source_path: Option<PathBuf>,
}

fn find_documented_component(integration: &LoadedIntegration, components_dir: &Path, name: &str) -> Option<(PathBuf, Option<PathBuf>)> {
    if !is_component_name(name) {
        return None;
    }
    let literals = [format!("'{name}'"), format!("\"{name}\""), format!("`{name}`")];
    let mut stems: HashSet<String> = HashSet::new();
    let mut candidates: Vec<Candidate> = Vec::new();
    for_each_integration_doc(components_dir, &mut |doc_path, stem| {
        let Some(text) = read_text(doc_path) else { return };
        if has_hidden_true(&text) || stems.contains(stem) {
            return;
        }
        stems.insert(stem.to_string());
        if !literals.iter().any(|l| text.contains(l.as_str())) {
            return;
        }
        candidates.push(Candidate { doc_path: doc_path.to_path_buf(), scan: scan_doc_text(&text), source_path: integration_source_for_doc(doc_path) });
    });
    if candidates.iter().any(|c| c.scan.replaces.as_deref() == Some(name)) {
        return None;
    }
    candidates.sort_by(|a, b| code_unit_cmp(&a.doc_path.to_string_lossy(), &b.doc_path.to_string_lossy()));
    for c in &candidates {
        let stem = doc_stem(&c.doc_path);
        if other_export_name(&c.doc_path, c.source_path.as_deref(), &stem, &c.scan.names).as_deref() == Some(name) {
            return Some((c.doc_path.clone(), c.source_path.clone()));
        }
    }
    for c in &candidates {
        if !c.scan.has_members {
            continue;
        }
        let stem = doc_stem(&c.doc_path);
        let own = other_export_name(&c.doc_path, c.source_path.as_deref(), &stem, &c.scan.names);
        if let Some((_, src)) = family_members(integration, &c.doc_path, c.source_path.as_deref(), own.as_deref(), Some(name)).into_iter().next() {
            return Some((c.doc_path.clone(), src));
        }
    }
    None
}

fn find_same_stem_doc(components_dir: &Path, name: &str) -> Option<PathBuf> {
    fn scan(dir: &Path, name: &str) -> Option<PathBuf> {
        let entries = list_dir_entries(dir);
        for s in INTEGRATION_DOC_SUFFIXES {
            let c = dir.join(format!("{name}{s}"));
            if path_exists(&c) {
                return Some(c);
            }
        }
        for e in entries {
            if e.name == "node_modules" || e.name == "__tests__" {
                continue;
            }
            if e.is_dir {
                if let Some(f) = scan(&dir.join(&e.name), name) {
                    return Some(f);
                }
            }
        }
        None
    }
    scan(components_dir, name)
}

/// What `findIntegrationComponent` finds.
#[derive(Debug, Clone)]
pub struct FoundComponent {
    pub doc_path: PathBuf,
    pub source_path: Option<PathBuf>,
    pub hold: NameHold,
}

/// `findIntegrationComponent(integration, name)`.
pub fn find_integration_component(integration: &LoadedIntegration, name: &str) -> Option<FoundComponent> {
    let dir = integration.components.as_ref().filter(|d| is_folder(d))?;
    if let Some(same) = find_same_stem_doc(dir, name) {
        let export_name = other_export_name(&same, integration_source_for_doc(&same).as_deref(), name, &read_doc_meta(&same).scan.names);
        let renamed = match &export_name {
            Some(en) => {
                find_same_stem_doc(dir, en).is_none()
                    && find_documented_component(integration, dir, en).map(|(d, _)| d).as_deref() == Some(same.as_path())
            }
            None => false,
        };
        return Some(FoundComponent {
            source_path: integration_source_for_doc(&same),
            doc_path: same,
            hold: if renamed { NameHold::Doc } else { NameHold::File },
        });
    }
    find_documented_component(integration, dir, name).map(|(d, s)| FoundComponent { doc_path: d, source_path: s, hold: NameHold::Doc })
}

/// `recordedDocName(integration, docPath)`.
pub fn recorded_doc_name(integration: &LoadedIntegration, doc_path: &Path) -> String {
    let stem = doc_stem(doc_path);
    match find_integration_component(integration, &stem) {
        Some(f) if f.doc_path == doc_path && f.hold == NameHold::Doc => {
            other_export_name(doc_path, integration_source_for_doc(doc_path).as_deref(), &stem, &read_doc_meta(doc_path).scan.names).unwrap_or(stem)
        }
        _ => stem,
    }
}

/// `findIntegrationComponentDoc(integration, name)`.
pub fn find_integration_component_doc(integration: &LoadedIntegration, name: &str) -> Option<PathBuf> {
    find_integration_component(integration, name).map(|f| f.doc_path)
}

/// `findIntegrationComponentSource(integration, name)`.
pub fn find_integration_component_source(integration: &LoadedIntegration, name: &str) -> Option<PathBuf> {
    find_integration_component(integration, name).and_then(|f| f.source_path)
}

/// `unscopedComponentOwners(owners)`: owners holding the name by file (or
/// Core) win over owners holding it only as a recorded export name.
pub fn unscoped_component_owners<T: Clone>(owners: &[T], hold: impl Fn(&T) -> NameHold) -> Vec<T> {
    let primary: Vec<T> = owners.iter().filter(|o| hold(o) != NameHold::Doc).cloned().collect();
    if primary.is_empty() { owners.to_vec() } else { primary }
}

/// One owned component, as `discoverOwnedComponents` lists it.
#[derive(Debug, Clone)]
pub struct OwnedComponent {
    pub name: String,
    pub package: String,
    pub group: Option<String>,
    pub doc_path: Option<PathBuf>,
    pub source_path: Option<PathBuf>,
    pub issues_url: Option<String>,
}

/// `discoverOwnedComponents(coreDir, loadedIntegrations)`.
pub fn discover_owned_components(core_dir: &Path, integrations: &[LoadedIntegration]) -> Vec<OwnedComponent> {
    let mut out = Vec::new();
    for (key, members) in discover_components(core_dir) {
        let ungrouped = members.len() == 1 && members[0] == key;
        for name in members {
            out.push(OwnedComponent {
                group: if ungrouped { None } else { Some(key.clone()) },
                doc_path: find_component_readme(core_dir, &name),
                source_path: find_component_source(core_dir, &name),
                package: CORE_PACKAGE.into(),
                issues_url: None,
                name,
            });
        }
    }
    for i in integrations {
        for r in discover_integration_components(i, true) {
            out.push(OwnedComponent {
                name: r.name,
                package: r.package,
                group: r.group,
                doc_path: Some(r.doc_path),
                source_path: r.source_path,
                issues_url: r.issues_url,
            });
        }
    }
    out
}
