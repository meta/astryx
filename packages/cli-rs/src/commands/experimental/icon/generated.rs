//! Port of `writeGeneratedIcons` and `generatedModuleText`
//! (foundation/discovery/icon-set-writer.mjs): the set's generated module and
//! its declaration file, plus the reads of that module (`generatedNamesOf`,
//! `generatedOrigins`).

use super::api::{ierr, IconError};
use crate::discovery::icon_set_writer::{self as w, GENERATED_HEADER, THEME_MAP_NAME};
use crate::discovery::nodepath as np;
use crate::json::Value;
use std::collections::{BTreeMap, HashSet};

const ADAPTER_LOCAL: &str = "adaptIcon";
const REACT_IMPORT: &str = "import {createElement} from 'react'";
const THEME_ELEMENT_PROPS: &str = "{'aria-hidden': true, 'width': '1em', 'height': '1em', 'style': {'width': '1em', 'height': '1em'}}";

/// One icon export of the generated module.
#[derive(Debug, Clone)]
pub struct GeneratedIcon {
    pub name: String,
    pub from: String,
    pub source: String,
    pub adapt: bool,
}

fn generated_statements(text: &str, label: &str) -> Result<Vec<String>, IconError> {
    w::read_generated_statements(text, label).map_err(|m| ierr(m, vec![], "ERR_INVALID_ARGUMENT"))
}

fn terminated(statement: &str) -> String {
    let re = regress::Regex::new(r"^(?:export (?:default )?)?(?:declare )?(?:abstract )?(?:async )?(?:function\b|class\b|interface\b|enum\b|namespace\b|module\b)").unwrap();
    if re.find(statement).is_some() {
        statement.to_string()
    } else {
        format!("{statement};")
    }
}

fn statement_name(line: &str) -> Option<String> {
    let named = regress::Regex::new(r"^(?:export|import) \{\s*([$\w]+)(?:\s+as\s+([$\w]+))?\s*\}").unwrap();
    if let Some(m) = named.find(line) {
        return Some(line[m.group(2).or(m.group(1)).unwrap()].to_string());
    }
    if let Some(m) = regress::Regex::new(r"^export const ([$\w]+)\b").unwrap().find(line) {
        return Some(line[m.group(1).unwrap()].to_string());
    }
    regress::Regex::new(r"^import ([$\w]+) from ").unwrap().find(line).map(|m| line[m.group(1).unwrap()].to_string())
}

/// `ICON_NAMES` (authoring/doctypes/icon-set/icon-names.mjs): the names a
/// theme map covers.
pub const ICON_NAMES: [&str; 29] = [
    "close", "chevronDown", "chevronLeft", "chevronRight", "chevronsLeft", "chevronsRight", "check", "success", "error", "warning",
    "info", "calendar", "clock", "externalLink", "menu", "moreHorizontal", "search", "upload", "arrowUp", "arrowDown", "arrowsUpDown",
    "funnel", "eyeSlash", "viewColumns", "copy", "checkDouble", "wrench", "stop", "microphone",
];

fn built_in_names() -> HashSet<String> {
    ICON_NAMES.iter().map(|s| s.to_string()).collect()
}

fn js_sort(v: &mut [String]) {
    v.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(a, b));
}

/// Insertion-ordered set.
#[derive(Default)]
struct OSet(Vec<String>, HashSet<String>);
impl OSet {
    fn add(&mut self, s: String) {
        if self.1.insert(s.clone()) {
            self.0.push(s);
        }
    }
}

/// `generatedModuleText(packageDir, generated, before, data, icons, remove)`.
pub fn generated_module_text(package_dir: &str, generated: &str, before: Option<&str>, data: &Value, icons: &[GeneratedIcon], remove: &[String]) -> Result<(String, Option<String>), IconError> {
    let file = np::join2(package_dir, generated);
    let file_dir = np::dirname(&file);
    let specifier_of = |from: &str| -> String {
        if !from.starts_with("./") {
            return from.to_string();
        }
        let r = np::relative(&file_dir, &np::join2(package_dir, from));
        if r.starts_with('.') { r } else { format!("./{r}") }
    };
    let theme_name = if data.get("themeMap").and_then(|v| v.as_str()) == Some(THEME_MAP_NAME) { Some(THEME_MAP_NAME) } else { None };
    let lines = match before {
        None => vec![],
        Some(b) => generated_statements(b, generated)?,
    };
    let line_set: HashSet<&String> = lines.iter().collect();
    let removed: HashSet<&String> = remove.iter().collect();
    let theme_import = |line: &str| theme_name.is_some() && line.starts_with("import {") && line_set.contains(&format!("export{}", &line["import".len()..]));
    let managed = |line: &str| -> bool {
        if let Some(name) = statement_name(line) {
            if removed.contains(&name) {
                return true;
            }
            if let Some(base) = name.strip_suffix("Source") {
                if removed.contains(&base.to_string()) {
                    return true;
                }
            }
            if name == ADAPTER_LOCAL {
                return true;
            }
        }
        line == REACT_IMPORT || theme_import(line) || theme_name.is_some_and(|t| line.starts_with(&format!("export const {t} = ")))
    };
    let mut imports = OSet::default();
    let mut exports = OSet::default();
    for l in &lines {
        if managed(l) {
            continue;
        }
        if l.starts_with("import ") {
            imports.add(l.clone());
        } else {
            exports.add(l.clone());
        }
    }
    let mut exported: BTreeMap<String, String> = BTreeMap::new();
    for l in &exports.0 {
        if let Some(n) = statement_name(l) {
            exported.entry(n).or_insert_with(|| l.clone());
        }
    }
    for icon in icons {
        let specifier = specifier_of(&icon.from);
        let mut want = vec![];
        let mut want_imports = vec![];
        if icon.adapt {
            let local = format!("{}Source", icon.name);
            want_imports.push(if icon.source == "default" {
                format!("import {local} from '{specifier}'")
            } else if icon.source == local {
                format!("import {{{local}}} from '{specifier}'")
            } else {
                format!("import {{{} as {local}}} from '{specifier}'", icon.source)
            });
            want.push(format!("export const {} = {ADAPTER_LOCAL}({local})", icon.name));
        } else {
            want.push(if icon.source == icon.name {
                format!("export {{{}}} from '{specifier}'", icon.name)
            } else {
                format!("export {{{} as {}}} from '{specifier}'", icon.source, icon.name)
            });
        }
        if let Some(prior) = exported.get(&icon.name) {
            if *prior != want[0] {
                return Err(ierr(
                    format!("The generated icons module already exports {} as `{}`. Pass another name, or edit {generated}.", icon.name, terminated(prior)),
                    vec![],
                    "ERR_FILE_EXISTS",
                ));
            }
            continue;
        }
        for l in want_imports {
            imports.add(l);
        }
        for l in want {
            exports.add(l.clone());
            exported.insert(icon.name.clone(), l);
        }
    }
    let needs_adapter = exports.0.iter().any(|l| l.contains(&format!("= {ADAPTER_LOCAL}(")));
    let adapter = data.get("adapter").filter(|a| a.is_object());
    if needs_adapter && adapter.is_none() {
        return Err(ierr(
            "An icon here is not a component, so the set needs an adapter. Declare \"adapter\": {\"module\": \"./src/adapt.js\", \"export\": \"adapt\"} in the data file: a function in your package that turns the library export into a component (astryx docs cli/experimental/icon-sets library-shapes).",
            vec![],
            "ERR_INVALID_ARGUMENT",
        ));
    }
    let mut theme: Vec<String> = vec![];
    let mut theme_imports = OSet::default();
    if theme_name.is_some() {
        let built_in = built_in_names();
        let icons_data = data.get("icons").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let by_id = |id: &str| -> Option<String> {
            // Map semantics: the last icon with an id wins.
            icons_data.iter().rev().find(|i| i.get("id").and_then(|v| v.as_str()) == Some(id)).and_then(|i| i.get("export").and_then(|v| v.as_str()).map(String::from))
        };
        let map = data.get("map").and_then(|m| m.as_object()).cloned().unwrap_or_default();
        let mut keys: Vec<String> = map.keys().cloned().collect();
        js_sort(&mut keys);
        for name in keys {
            let Some(export_name) = map.get(&name).and_then(|v| v.as_str()).and_then(by_id) else { continue };
            if built_in.contains(&name) {
                theme.push(format!("  {name}: createElement({export_name}, {THEME_ELEMENT_PROPS}),"));
                if let Some(line) = exported.get(&export_name) {
                    if line.starts_with("export {") {
                        theme_imports.add(format!("import{}", &line["export".len()..]));
                    }
                }
            }
        }
    }
    let adapter_line: Vec<String> = match (needs_adapter, adapter) {
        (true, Some(a)) => vec![format!(
            "import {{{} as {ADAPTER_LOCAL}}} from '{}'",
            a.get("export").and_then(|v| v.as_str()).unwrap_or(""),
            specifier_of(a.get("module").and_then(|v| v.as_str()).unwrap_or(""))
        )],
        _ => vec![],
    };
    let mut body: Vec<String> = vec![];
    if theme_name.is_some() {
        body.push(REACT_IMPORT.into());
    }
    body.extend(adapter_line);
    let mut im: Vec<String> = imports.0.iter().cloned().chain(theme_imports.0.iter().cloned()).collect();
    js_sort(&mut im);
    body.extend(im);
    let mut ex = exports.0.clone();
    js_sort(&mut ex);
    body.extend(ex);
    let mut js: Vec<String> = GENERATED_HEADER.iter().map(|s| s.to_string()).collect();
    js.extend(body.iter().map(|l| terminated(l)));
    if let Some(t) = theme_name {
        if theme.is_empty() {
            js.push(format!("export const {t} = {{}};"));
        } else {
            js.push(format!("export const {t} = {{"));
            js.extend(theme);
            js.push("};".into());
        }
    }
    js.push(String::new());
    let js = js.join("\n");
    let dts = match crate::discovery::contribution_inventory::generated_types_path(generated) {
        Some(_) => Some(w::generated_types_text(&generated_statements(&js, generated)?)),
        None => None,
    };
    Ok((js, dts))
}

/// `writeGeneratedIcons(packageDir, generated, data, icons, remove)`: the
/// files written (package-relative) and whether anything changed.
pub fn write_generated_icons(package_dir: &str, generated: &str, data: &Value, icons: &[GeneratedIcon], remove: &[String]) -> Result<Vec<String>, IconError> {
    let file = crate::commands::swizzle::path_safety::assert_within(generated, package_dir, false, "generated icons module")
        .map_err(|e| ierr(e.message.clone(), vec![], "ERR_PATH_TRAVERSAL"))?;
    let before = std::fs::read_to_string(&file).ok();
    let (js, dts) = generated_module_text(package_dir, generated, before.as_deref(), data, icons, remove)?;
    let types_rel = crate::discovery::contribution_inventory::generated_types_path(generated);
    let mut files = vec![];
    let mut put = |target: &str, text: &str, prior: Option<&str>, rel: &str| -> Result<(), IconError> {
        if prior == Some(text) {
            return Ok(());
        }
        super::writer::journal_file(target);
        if let Some(parent) = std::path::Path::new(target).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        super::writer::replace_text(target, text)?;
        files.push(rel.strip_prefix("./").unwrap_or(rel).to_string());
        Ok(())
    };
    put(&file, &js, before.as_deref(), generated)?;
    if let (Some(tr), Some(d)) = (&types_rel, &dts) {
        let tf = np::join2(package_dir, tr);
        let tb = std::fs::read_to_string(&tf).ok();
        put(&tf, d, tb.as_deref(), tr)?;
    }
    Ok(files)
}

fn read_statements(package_dir: &str, generated: &str) -> Option<(String, Vec<String>)> {
    let file = np::join2(package_dir, generated);
    let text = std::fs::read_to_string(&file).ok()?;
    let st = w::read_generated_statements(&text, generated).ok()?;
    Some((file, st))
}

/// `generatedNamesOf(packageDir, generated, from, source)`.
pub fn generated_names_of(package_dir: &str, generated: &str, from: &str, source: &str) -> Vec<String> {
    let mut names = vec![];
    let Some((file, statements)) = read_statements(package_dir, generated) else { return names };
    let mut specifier = from.to_string();
    if from.starts_with("./") {
        specifier = np::relative(&np::dirname(&file), &np::join2(package_dir, from));
        if !specifier.starts_with('.') {
            specifier = format!("./{specifier}");
        }
    }
    let tail = format!(" from '{specifier}'");
    for st in statements {
        let Some(head) = st.strip_suffix(&tail) else { continue };
        let cap = |re: &str| regress::Regex::new(re).unwrap().find(head).map(|m| head[m.group(1).unwrap()].to_string());
        if source == "default" {
            if let Some(n) = cap(r"^import (\w+)Source$") {
                names.push(n);
            }
            if let Some(n) = cap(r"^export \{default as (\w+)\}$") {
                names.push(n);
            }
            continue;
        }
        if head == format!("export {{{source}}}") {
            names.push(source.to_string());
        }
        if let Some(n) = cap(&format!(r"^export \{{{source} as (\w+)\}}$")) {
            names.push(n);
        }
        if let Some(n) = cap(&format!(r"^import \{{{source} as (\w+)Source\}}$")) {
            names.push(n);
        }
        if head == format!("import {{{source}}}") {
            if let Some(b) = source.strip_suffix("Source") {
                names.push(b.to_string());
            }
        }
    }
    names
}

/// `generatedOrigins(packageDir, generated)`: export name -> (module, source).
pub fn generated_origins(package_dir: &str, generated: &str) -> Vec<(String, String, String)> {
    let mut out: Vec<(String, String, String)> = vec![];
    let Some((file, statements)) = read_statements(package_dir, generated) else { return out };
    let from_root = |spec: &str| -> String {
        if !spec.starts_with('.') {
            return spec.to_string();
        }
        format!("./{}", np::relative(package_dir, &np::resolve(&[&np::dirname(&file), spec])))
    };
    let mut set = |name: String, module: String, source: String| match out.iter_mut().find(|(n, _, _)| *n == name) {
        Some(slot) => {
            slot.1 = module;
            slot.2 = source;
        }
        None => out.push((name, module, source)),
    };
    let re1 = regress::Regex::new(r"^export \{(\w+)(?: as (\w+))?\} from '([^']+)'$").unwrap();
    let re2 = regress::Regex::new(r"^import \{(\w+) as (\w+)Source\} from '([^']+)'$").unwrap();
    let re3 = regress::Regex::new(r"^import (\w+)Source from '([^']+)'$").unwrap();
    for st in statements {
        let g = |m: &regress::Match, i: usize| m.group(i).map(|r| st[r].to_string());
        if let Some(m) = re1.find(&st) {
            set(g(&m, 2).or(g(&m, 1)).unwrap(), from_root(&g(&m, 3).unwrap()), g(&m, 1).unwrap());
            continue;
        }
        if let Some(m) = re2.find(&st) {
            set(g(&m, 2).unwrap(), from_root(&g(&m, 3).unwrap()), g(&m, 1).unwrap());
            continue;
        }
        if let Some(m) = re3.find(&st) {
            set(g(&m, 1).unwrap(), from_root(&g(&m, 2).unwrap()), "default".into());
        }
    }
    out
}

/// `sameIconModule(a, b)`.
pub fn same_icon_module(a: &str, b: &str) -> bool {
    let norm = |v: &str| -> String {
        if v.starts_with('.') {
            let n = crate::commands::experimental::render::reverse::posix_normalize(v);
            format!("./{}", n.strip_prefix("./").unwrap_or(&n))
        } else {
            v.to_string()
        }
    };
    norm(a) == norm(b)
}
