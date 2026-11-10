//! Port of `foundation/discovery/icon-set-checks.mjs` (with
//! `icon-set-paths.mjs`): the issues `integration check` and doctor report
//! for a package's icon sets, and each set's coverage.

use super::contribution_inventory::generated_types_path;
use super::icon_set_discovery::{discover_icon_set_directory, has_license_notice, license_notice_fix, resolve_icon_module, split_specifier, DiscoveredIconSet};
use super::icon_set_writer as writer;
use super::integrations::{self as integ, Record};
use super::module_origins::{self as mo, Verdict};
use super::nodepath as np;
use crate::json::{Map, Value};
use serde_json::json;
use std::collections::HashMap;

pub const INVALID_ICON_SET: &str = "invalid_icon_set";
pub const ICON_EXPORT_MISSING: &str = "icon_export_missing";
pub const ICON_THEME_MAP_MISMATCH: &str = "icon_theme_map_mismatch";
pub const ICON_BUILTIN_DEFINITION_MISSING: &str = "icon_builtin_definition_missing";
pub const ICON_GENERATED_TYPES_MISMATCH: &str = "icon_generated_types_mismatch";
pub const ICON_MODULE_INVALID: &str = "icon_module_invalid";
pub const ICON_MODULE_NOT_PUBLIC: &str = "icon_module_not_public";
pub const ICON_EXPORT_NAME: &str = "icon_export_name";
pub const ICON_NOT_COMPONENT: &str = "icon_not_component";
pub const ICON_DEFINITION_SHADOWED: &str = "icon_definition_shadowed";
pub const ICON_DEFINITION_UNUSED: &str = "icon_definition_unused";
pub const ICON_SOURCE_VERSION_DRIFT: &str = "icon_source_version_drift";
pub const ICON_LICENSE_NOTICE_MISSING: &str = "icon_license_notice_missing";
pub const SUGGESTIONS_PER_DEFINITION: usize = 3;
const FIND_FLOOR: i64 = 60;

/// `generatedTypesPath(generated)` (icon-set-paths.mjs).
pub fn icon_generated_types_path(generated: &str) -> Option<String> {
    generated_types_path(generated)
}

fn issue(code: &str, severity: &str, message: String) -> Value {
    json!({"code": code, "severity": severity, "message": message})
}

fn err(code: &str, message: String) -> Value {
    issue(code, "error", message)
}

fn warn(code: &str, message: String) -> Value {
    issue(code, "warning", message)
}

/// The set names whose entries could not be checked, with each entry
/// (`{icon|adapter|entry, reason}`), in first-seen order.
pub type Unchecked = Vec<(String, Vec<Value>)>;

fn s<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(|x| x.as_str())
}

fn rel(from: &str, to: &str) -> String {
    np::relative(from, to)
}

/// One definition, as the checks read it.
#[derive(Debug, Clone)]
pub struct Def {
    pub name: String,
    pub built_in: bool,
    pub description: String,
    pub words: Vec<String>,
}

fn astryx_defs() -> Vec<Def> {
    super::icon_definition_discovery::astryx_icon_definitions()
        .definitions
        .iter()
        .map(|d| Def { name: d.name().to_string(), built_in: d.built_in(), description: d.description().to_string(), words: d.words() })
        .collect()
}

fn own_defs(set: &DiscoveredIconSet) -> Vec<Def> {
    set.definitions.iter().map(|d| Def { name: d.name().to_string(), built_in: d.built_in(), description: d.description().to_string(), words: d.words() }).collect()
}

fn map_keys(set: &DiscoveredIconSet) -> Vec<String> {
    set.data.get("map").and_then(|m| m.as_object()).map(|m| m.keys().cloned().collect()).unwrap_or_default()
}

fn icons(set: &DiscoveredIconSet) -> Vec<Value> {
    set.data.get("icons").and_then(|i| i.as_array()).cloned().unwrap_or_default()
}

fn words_of(icon: &Value) -> Vec<String> {
    icon.get("words").and_then(|w| w.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

fn shell_arg(v: &str) -> String {
    if !v.is_empty() && v.chars().all(|c| c.is_ascii_alphanumeric() || "@/._-".contains(c)) {
        v.to_string()
    } else {
        format!("'{}'", v.replace('\'', "'\\''"))
    }
}

fn is_file(f: &str) -> bool {
    np::is_file(f)
}

/// `iconSetIssues(packageDir, loaded, unchecked)`.
pub fn icon_set_issues(package_dir: &str, loaded: &Record, unchecked: &mut Unchecked) -> Vec<Value> {
    let Some(root) = integ::s(loaded, "iconSets").filter(|r| !r.is_empty()) else { return vec![] };
    let name = integ::s(loaded, "name").unwrap_or("");
    let mut issues = Vec::new();
    let (sets, errors) = discover_icon_set_directory(root, name);
    for (_, m) in errors {
        issues.push(err(INVALID_ICON_SET, m));
    }
    let pkg = np::read_json(&np::join2(package_dir, "package.json")).unwrap_or(Value::Object(Map::new()));
    for set in &sets {
        let mut not_checked: Vec<Value> = Vec::new();
        issues.extend(check_contract(set, package_dir, name, &pkg, &mut not_checked));
        issues.extend(check_definitions(set));
        match unparsed_module(set, package_dir, name) {
            Some(b) => issues.push(b),
            None => issues.extend(check_exports(set, package_dir, name, &mut not_checked)),
        }
        if !not_checked.is_empty() {
            match unchecked.iter_mut().find(|(k, _)| *k == set.name) {
                Some(slot) => slot.1 = not_checked,
                None => unchecked.push((set.name.clone(), not_checked)),
            }
        }
        issues.extend(check_upstream(set, package_dir, &pkg));
    }
    issues
}

fn module_of(set: &DiscoveredIconSet) -> String {
    s(&set.data, "module").unwrap_or("").to_string()
}

fn unparsed_module(set: &DiscoveredIconSet, package_dir: &str, package_name: &str) -> Option<Value> {
    let entry = resolve_icon_module(&module_of(set), package_dir, Some(package_name), Some(package_dir));
    let mut files: Vec<String> = entry.into_iter().collect();
    if let Some(g) = s(&set.data, "generated").filter(|g| !g.is_empty()) {
        let f = np::join2(package_dir, g);
        if np::exists(&f) {
            files.push(f);
        }
    }
    for f in files {
        if let Some((file, message)) = mo::module_parse_failure(&f) {
            return Some(err(
                ICON_MODULE_INVALID,
                format!(
                    "Icon set \"{}\": {} does not parse ({message}), so its exports cannot be read. Fix the file; for the generated icons module, delete the broken lines and run `astryx experimental icon add` again.",
                    set.name,
                    rel(package_dir, &file)
                ),
            ));
        }
    }
    None
}

fn is_public(module: &str, package_name: &str, pkg: &Value, package_dir: &str) -> bool {
    if module == package_name {
        return true;
    }
    let (name, subpath) = split_specifier(module);
    let Some(exports) = pkg.get("exports") else { return false };
    if name != package_name {
        return false;
    }
    super::package_exports::inspect_package_export(package_name, Some(exports), std::path::Path::new(package_dir), &subpath).exported
}

fn check_contract(set: &DiscoveredIconSet, package_dir: &str, package_name: &str, pkg: &Value, unchecked: &mut Vec<Value>) -> Vec<Value> {
    let mut issues = Vec::new();
    let label = format!("Icon set \"{}\"", set.name);
    let module = module_of(set);
    let mut check_module = |m: &str, what: &str, issues: &mut Vec<Value>| {
        if !is_public(m, package_name, pkg, package_dir) {
            issues.push(err(
                ICON_MODULE_NOT_PUBLIC,
                format!(
                    "{label}: {what} is read from \"{m}\", which is not {package_name} or one of its package.json \"exports\" subpaths. Every icon is a named export of the set's own package; re-export it there (`astryx experimental icon add` does this)."
                ),
            ));
        }
    };
    let name_re = regress::Regex::with_flags(r"^[A-Z][A-Za-z0-9]*Icon$", "u").unwrap();
    let check_name = |n: &str, what: &str, issues: &mut Vec<Value>| {
        if name_re.find(n).is_none() {
            issues.push(warn(ICON_EXPORT_NAME, format!("{label}: {what} is exported as \"{n}\"; icon exports are named <Name>Icon, such as TrashIcon.")));
        }
    };
    check_module(&module, "the set", &mut issues);
    for icon in icons(set) {
        let id = s(&icon, "id").unwrap_or("");
        let im = s(&icon, "module").filter(|m| !m.is_empty());
        if let Some(m) = im {
            if m != module {
                check_module(m, &format!("icon \"{id}\""), &mut issues);
            }
        }
        check_name(s(&icon, "export").unwrap_or(""), &format!("icon \"{id}\""), &mut issues);
        for v in icon.get("variants").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
            if let Some(vm) = s(&v, "module").filter(|m| !m.is_empty()) {
                if vm != im.unwrap_or(&module) {
                    check_module(vm, &format!("a variant of icon \"{id}\""), &mut issues);
                }
            }
            check_name(s(&v, "export").unwrap_or(""), &format!("a variant of icon \"{id}\""), &mut issues);
        }
    }
    if let Some(generated) = s(&set.data, "generated").filter(|g| !g.is_empty()) {
        let file = np::join2(package_dir, generated);
        let types_rel = generated_types_path(generated);
        if let (true, Some(types_rel)) = (np::exists(&file), &types_rel) {
            let types_file = np::join2(package_dir, types_rel);
            let expected = np::read_text(&file).and_then(|t| writer::read_generated_statements(&t, generated).ok()).map(|st| writer::generated_types_text(&st));
            let actual = if np::exists(&types_file) { np::read_text(&types_file) } else { None };
            if let Some(expected) = expected {
                if actual.as_deref().map(|a| !writer::generated_types_match(a, &expected, "")).unwrap_or(true) {
                    issues.push(err(
                        ICON_GENERATED_TYPES_MISMATCH,
                        format!(
                            "{label}: {types_rel} {}. Run `astryx experimental icon map` or `astryx experimental icon add` to rewrite it, or restore it from the generated module's exports.",
                            if actual.is_none() { "is missing" } else { "does not match its generated module" }
                        ),
                    ));
                }
            }
        }
        if !np::exists(&file) {
            issues.push(err(
                ICON_EXPORT_MISSING,
                format!("{label}: its generated icons module \"{generated}\" does not exist. Run `astryx experimental icon add` for each icon, or remove \"generated\"."),
            ));
        }
    }
    if let Some(adapter) = set.data.get("adapter").filter(|a| a.is_object()) {
        let m = s(adapter, "module").unwrap_or("");
        let n = s(adapter, "export").unwrap_or("");
        let file = resolve_file(&np::join2(package_dir, m));
        let found = file.map(|f| mo::export_origin_verdict(&f, n));
        match found {
            Some(Verdict::Unknown(reason)) => unchecked.push(json!({"adapter": n, "reason": reason})),
            None | Some(Verdict::Lacks) => issues.push(err(ICON_EXPORT_MISSING, format!("{label}: its adapter \"{n}\" from \"{m}\" does not exist. Export the function there, or fix \"adapter\"."))),
            _ => {}
        }
    }
    issues
}

fn resolve_file(base: &str) -> Option<String> {
    let mut c = vec![base.to_string()];
    c.extend([".mjs", ".js", ".cjs", ".ts", ".tsx", ".jsx", ".mts"].iter().map(|e| format!("{base}{e}")));
    c.into_iter().find(|f| is_file(f))
}

fn check_definitions(set: &DiscoveredIconSet) -> Vec<Value> {
    let mut issues = Vec::new();
    let label = format!("Icon set \"{}\"", set.name);
    let mapped = map_keys(set);
    let astryx = astryx_defs();
    for doc in &astryx {
        if mapped.contains(&doc.name) || !doc.built_in {
            continue;
        }
        let hint = suggest_icon(set, doc).map(|(_, icon)| format!(" Suggested: astryx experimental icon map {} {icon} --set {}.", doc.name, set.name)).unwrap_or_default();
        issues.push(err(
            ICON_BUILTIN_DEFINITION_MISSING,
            format!(
                "{label} maps no icon to the built-in icon definition \"{}\" ({} Words: {}.). Every set maps every built-in definition: run `astryx experimental icon map {} <icon id> --set {}` with the icon that draws it{}.{hint}",
                doc.name,
                doc.description,
                doc.words.join(", "),
                doc.name,
                set.name,
                find_hint(set, doc)
            ),
        ));
    }
    let names: Vec<&String> = astryx.iter().map(|d| &d.name).collect();
    for doc in own_defs(set) {
        if names.contains(&&doc.name) {
            issues.push(warn(
                ICON_DEFINITION_SHADOWED,
                format!(
                    "{label} declares the icon definition \"{}\", which Astryx now has. Map your icon to Astryx's definition and remove definitions/{}.doc.mjs; Astryx's is the one templates use.",
                    doc.name, doc.name
                ),
            ));
        } else if !mapped.contains(&doc.name) {
            let sug = suggest_icon(set, &doc).map(|(_, icon)| format!(" Suggested: astryx experimental icon map {} {icon} --set {}.", doc.name, set.name)).unwrap_or_default();
            issues.push(warn(
                ICON_DEFINITION_UNUSED,
                format!(
                    "{label} declares the icon definition \"{}\", but \"map\" names no icon for it. Map it with `astryx experimental icon map {} <icon id> --set {}`, or remove definitions/{}.doc.mjs.{sug}",
                    doc.name, doc.name, set.name, doc.name
                ),
            ));
        }
    }
    issues
}

/// `iconSetCoverage(loaded, unchecked)`.
pub fn icon_set_coverage(loaded: &Record, unchecked: &Unchecked) -> Vec<Value> {
    let Some(root) = integ::s(loaded, "iconSets").filter(|r| !r.is_empty()) else { return vec![] };
    let (sets, _) = discover_icon_set_directory(root, integ::s(loaded, "name").unwrap_or(""));
    let astryx = astryx_defs();
    let names: Vec<String> = astryx.iter().map(|d| d.name.clone()).collect();
    sets.iter()
        .map(|set| {
            let mapped = map_keys(set);
            let mut all = astryx.clone();
            all.extend(own_defs(set).into_iter().filter(|d| !names.contains(&d.name)));
            let unmapped: Vec<Def> = all.into_iter().filter(|d| !mapped.contains(&d.name)).collect();
            json!({
                "set": set.name,
                "unmappedDefinitions": unmapped.iter().filter(|d| names.contains(&d.name) && !d.built_in)
                    .map(|d| json!({"name": d.name, "description": d.description, "words": d.words})).collect::<Vec<_>>(),
                "suggestions": unmapped.iter().filter_map(|d| suggest_icon(set, d).map(|(_, icon)| json!({"definition": d.name, "icon": icon}))).collect::<Vec<_>>(),
                "unchecked": unchecked.iter().find(|(k, _)| *k == set.name).map(|(_, v)| v.clone()).unwrap_or_default(),
            })
        })
        .collect()
}

/// `suggestIcon(set, doc)`: `(definition, icon)`.
pub fn suggest_icon(set: &DiscoveredIconSet, doc: &Def) -> Option<(String, String)> {
    suggested_icons(set, doc).into_iter().next().map(|(icon, _)| (doc.name.clone(), icon))
}

const NEGATING_WORDS: [&str; 13] = ["off", "slash", "x", "open", "minus", "ban", "dashed", "dot", "code", "formatting", "exclamation", "question", "warning"];

fn opposite(w: &str) -> Option<&'static str> {
    Some(match w {
        "horizontal" => "vertical",
        "vertical" => "horizontal",
        "left" => "right",
        "right" => "left",
        "up" => "down",
        "down" => "up",
        "in" => "out",
        "out" => "in",
        _ => return None,
    })
}

fn stem(w: &str) -> String {
    if w.encode_utf16().count() > 3 && w.ends_with('s') && !w.ends_with("ss") {
        w[..w.len() - 1].to_string()
    } else {
        w.to_string()
    }
}

fn to_id(name: &str) -> String {
    let mut out = String::new();
    let mut prev: Option<char> = None;
    for c in name.chars() {
        if c.is_ascii_uppercase() && prev.map(|p| p.is_ascii_lowercase() || p.is_ascii_digit()).unwrap_or(false) {
            out.push('-');
        }
        out.push(c);
        prev = Some(c);
    }
    out.to_lowercase()
}

struct Indexed {
    id: String,
    words: Vec<String>,
    raw: Vec<String>,
    other: Vec<String>,
}

/// `suggestedIcons(set, doc)`: `(icon, word)`, at most three.
pub fn suggested_icons(set: &DiscoveredIconSet, doc: &Def) -> Vec<(String, String)> {
    let name_id = to_id(&doc.name);
    let name_words: Vec<String> = name_id.split('-').map(stem).collect();
    let map = set.data.get("map").and_then(|m| m.as_object()).cloned().unwrap_or_default();
    let mut taken: Vec<String> = map.iter().filter(|(n, _)| **n != doc.name).filter_map(|(_, id)| id.as_str().map(String::from)).collect();
    for d in astryx_defs().into_iter().chain(own_defs(set)) {
        let id = to_id(&d.name);
        if id != name_id {
            taken.push(id);
        }
    }
    let word_ids: Vec<String> = doc
        .words
        .iter()
        .map(|w| w.trim_matches(super::paths::js_ws).to_lowercase().split(super::paths::js_ws).filter(|x| !x.is_empty()).collect::<Vec<_>>().join("-"))
        .collect();
    let mut meaning: Vec<String> = name_words.clone();
    meaning.extend(word_ids.iter().flat_map(|id| id.split('-').map(stem).collect::<Vec<_>>()));
    let index: Vec<Indexed> = icons(set)
        .iter()
        .map(|i| {
            let id = s(i, "id").unwrap_or("").to_string();
            Indexed {
                words: id.split('-').map(stem).collect(),
                raw: id.split('-').map(String::from).collect(),
                other: writer::other_names_of(&id, &words_of(i)),
                id,
            }
        })
        .collect();
    let fit = |words: &[String]| words.iter().filter(|w| meaning.contains(w)).count() as i64;
    let ranked = |mut list: Vec<&Indexed>| {
        list.sort_by(|a, b| {
            (fit(&b.words) - fit(&a.words))
                .cmp(&0)
                .then(a.words.len().cmp(&b.words.len()))
                .then(super::jsort::cmp_utf16(&a.id, &b.id))
        });
        list.into_iter().map(|i| i.id.clone()).collect::<Vec<String>>()
    };
    let opp: Vec<&str> = name_words.iter().filter_map(|w| opposite(w)).collect();
    let negated = |words: &[String]| words.iter().any(|w| NEGATING_WORDS.contains(&w.as_str()) || opp.contains(&w.as_str()));
    let mut found: Vec<(String, String)> = Vec::new();
    let mut add = |icon: &str, word: &str, found: &mut Vec<(String, String)>| {
        if taken.iter().any(|t| t == icon) || found.iter().any(|f| f.0 == icon) {
            return;
        }
        found.push((icon.to_string(), word.to_string()));
    };
    let squashed = name_id.replace('-', "");
    for i in &index {
        if i.id == name_id || i.id.replace('-', "") == squashed || (i.words.len() == name_words.len() && i.words.iter().zip(&name_words).all(|(a, b)| a == b)) {
            add(&i.id, &name_id, &mut found);
        }
    }
    for i in &index {
        if i.other.contains(&name_id) {
            add(&i.id, &name_id, &mut found);
        }
    }
    let name_raw: Vec<&str> = name_id.split('-').collect();
    let starts: Vec<&Indexed> =
        index.iter().filter(|i| i.raw.len() > name_raw.len() && name_raw.iter().enumerate().all(|(k, w)| i.raw[k] == *w) && !negated(&i.raw[name_raw.len()..])).collect();
    for id in ranked(starts) {
        add(&id, &name_id, &mut found);
    }
    for id in &word_ids {
        if index.iter().any(|i| i.id == *id) {
            add(id, &id.replace('-', " "), &mut found);
        }
    }
    for (k, id) in word_ids.iter().enumerate() {
        for i in &index {
            if i.other.contains(id) {
                add(&i.id, &doc.words[k], &mut found);
            }
        }
    }
    let qualifier = regress::Regex::with_flags(r"^(?:\d+(?:x\d+)?|circle|square|small|big|large|alt|horizontal|vertical)$", "u").unwrap();
    let three = regress::Regex::with_flags(r"^[a-z]{3,}$", "u").unwrap();
    for word in &doc.words {
        if three.find(word).is_none() {
            continue;
        }
        let list: Vec<&Indexed> = index
            .iter()
            .filter(|i| i.raw.len() == 2 && i.raw[0] == *word && i.raw[1] != *word && qualifier.find(&i.raw[1]).is_some() && !negated(&i.raw[1..]))
            .collect();
        for id in ranked(list) {
            add(&id, word, &mut found);
        }
    }
    found.truncate(SUGGESTIONS_PER_DEFINITION);
    found
}

fn as_rank_set(set: &DiscoveredIconSet) -> crate::commands::experimental::icon::api::IconSet {
    crate::commands::experimental::icon::api::IconSet {
        name: set.name.clone(),
        display_name: set.display_name.clone(),
        description: set.description.clone(),
        license: set.license.clone(),
        package: set.package.clone(),
        data: set.data.clone(),
        definitions: own_defs(set).into_iter().map(|d| crate::commands::experimental::icon::api::Definition { name: d.name, built_in: d.built_in, description: d.description, words: d.words }).collect(),
    }
}

fn find_hint(set: &DiscoveredIconSet, doc: &Def) -> String {
    use crate::commands::experimental::icon::api::{Definition, IconSet};
    let mut queries = vec![{
        let mut out = String::new();
        let mut prev: Option<char> = None;
        for c in doc.name.chars() {
            if c.is_ascii_uppercase() && prev.map(|p| p.is_ascii_lowercase() || p.is_ascii_digit()).unwrap_or(false) {
                out.push(' ');
            }
            out.push(c);
            prev = Some(c);
        }
        out.to_lowercase()
    }];
    queries.extend(doc.words.iter().cloned());
    let rs = as_rank_set(set);
    let astryx: Vec<Definition> = astryx_defs().into_iter().map(|d| Definition { name: d.name, built_in: d.built_in, description: d.description, words: d.words }).collect();
    let own = |s: &IconSet, n: &str| s.definitions.iter().find(|d| d.name == n).map(|d| d.words.clone());
    for q in &queries {
        let found = crate::commands::experimental::icon::ranking::rank_icons(&[&rs], q, &astryx, &own);
        if found.iter().any(|(score, _)| *score >= FIND_FLOOR) {
            return format!(" (icons matching \"{q}\": `astryx experimental icon {} --set {}`)", shell_arg(q), set.name);
        }
    }
    format!(
        " (no icon in the set has its name or words: pick the library icon that draws it; if the library has none, map the closest, or add your own artwork with `astryx experimental icon add <Name> --from ./src/icons/<name>.js --definition {} --set {}`)",
        doc.name, set.name
    )
}

fn entry_not_wired(set: &DiscoveredIconSet, package_dir: &str, package_name: &str, unbuilt: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    let generated = s(&set.data, "generated").filter(|g| !g.is_empty())?;
    if !np::exists(&np::join2(package_dir, generated)) {
        return None;
    }
    let module = module_of(set);
    if split_specifier(&module).0 != package_name {
        return None;
    }
    if unbuilt(&module).is_some() {
        return None;
    }
    let pkg = np::read_json(&np::join2(package_dir, "package.json"))?;
    let theme_map = s(&set.data, "themeMap").unwrap_or(writer::THEME_MAP_NAME);
    let note = writer::entry_wiring_note(package_dir, &pkg, generated, Some(&module), Some(theme_map))?;
    let entry = resolve_icon_module(&module, package_dir, Some(package_name), Some(package_dir));
    let some_icon = entry.as_ref().map(|e| {
        icons(set).iter().any(|i| s(i, "module").filter(|m| !m.is_empty()).unwrap_or(&module) == module && mo::export_origin_verdict(e, s(i, "export").unwrap_or("")) != Verdict::Lacks)
    });
    if some_icon == Some(true) {
        None
    } else {
        Some(note)
    }
}

fn check_exports(set: &DiscoveredIconSet, package_dir: &str, package_name: &str, unchecked: &mut Vec<Value>) -> Vec<Value> {
    let mut issues = Vec::new();
    let label = format!("Icon set \"{}\"", set.name);
    let module = module_of(set);
    let mut files: HashMap<String, Option<String>> = HashMap::new();
    let mut file_of = |spec: &str| -> Option<String> {
        files.entry(spec.to_string()).or_insert_with(|| resolve_icon_module(spec, package_dir, Some(package_name), Some(package_dir))).clone()
    };
    let unbuilt_target = |spec: &str| -> Option<String> {
        let (name, subpath) = split_specifier(spec);
        if name != package_name {
            return None;
        }
        let pkg = np::read_json(&np::join2(package_dir, "package.json"))?;
        let exports = pkg.get("exports")?;
        let f = super::package_exports::inspect_package_export(package_name, Some(exports), std::path::Path::new(package_dir), &subpath);
        if f.exported && f.target.is_none() {
            f.authored_target.filter(|t| !t.is_empty())
        } else {
            None
        }
    };
    let mut origins: HashMap<String, Option<mo::Origin>> = HashMap::new();
    let mut origin_of = |spec: &str, name: &str, what: &str, subject: Value, component: bool, issues: &mut Vec<Value>, unchecked: &mut Vec<Value>| -> Option<mo::Origin> {
        let key = format!("{spec}\0{name}");
        if let Some(o) = origins.get(&key) {
            return o.clone();
        }
        let file = file_of(spec);
        let found = file.as_ref().map(|f| mo::export_origin_verdict(f, name));
        let origin = match &found {
            Some(Verdict::Exports(o)) => o.clone(),
            _ => None,
        };
        origins.insert(key, origin.clone());
        let unbuilt = if file.is_some() { None } else { unbuilt_target(spec) };
        let with_reason = |reason: String| {
            let mut m = subject.as_object().cloned().unwrap_or_default();
            m.insert("reason".into(), Value::String(reason));
            Value::Object(m)
        };
        if let Some(u) = unbuilt {
            unchecked.push(with_reason(format!("{what} is read from \"{spec}\", whose exports target {u} is not there yet; build the package and run the check again.")));
        } else if file.is_none() {
            issues.push(err(
                ICON_EXPORT_MISSING,
                format!(
                    "{label}: {what} is read from \"{spec}\", which does not resolve from the package. Fix \"module\" in {}.icons.json, or add the subpath to package.json \"exports\".",
                    set.name
                ),
            ));
        } else if let Some(Verdict::Unknown(r)) = &found {
            unchecked.push(with_reason(format!("{what} names export \"{name}\" of \"{spec}\", which this check could not prove: {r}")));
        } else if origin.is_none() {
            issues.push(err(
                ICON_EXPORT_MISSING,
                format!("{label}: {what} names export \"{name}\", which \"{spec}\" does not export at runtime. Export it, or fix the name in {}.icons.json.", set.name),
            ));
        } else if component && mo::export_value_kind(file.as_deref().unwrap(), name) == mo::ValueKind::Data {
            issues.push(err(
                ICON_NOT_COMPONENT,
                format!(
                    "{label}: {what} names export \"{name}\", which is a value, not a component. Export a React component, or add it with `astryx experimental icon add` and declare an \"adapter\" that turns it into one."
                ),
            ));
        }
        origin
    };
    let built_in: Vec<String> = astryx_defs().into_iter().filter(|d| d.built_in).map(|d| d.name).collect();
    let wiring = entry_not_wired(set, package_dir, package_name, &unbuilt_target);
    if let Some(w) = &wiring {
        issues.push(err(ICON_EXPORT_MISSING, format!("{label}: its icons are not exported from \"{module}\" yet. {w}")));
    }
    let mut icon_origins: HashMap<String, Option<mo::Origin>> = HashMap::new();
    for icon in icons(set) {
        let id = s(&icon, "id").unwrap_or("").to_string();
        let m = s(&icon, "module").filter(|m| !m.is_empty()).unwrap_or(&module).to_string();
        if wiring.is_some() && m == module {
            continue;
        }
        let o = origin_of(&m, s(&icon, "export").unwrap_or(""), &format!("icon \"{id}\""), json!({"icon": id}), true, &mut issues, unchecked);
        icon_origins.insert(id.clone(), o);
        for v in icon.get("variants").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
            let vm = s(&v, "module").filter(|m| !m.is_empty()).unwrap_or(&m).to_string();
            origin_of(&vm, s(&v, "export").unwrap_or(""), &format!("a variant of icon \"{id}\""), json!({"icon": id}), true, &mut issues, unchecked);
        }
    }
    let mut fillers: Vec<(String, String, Option<mo::Origin>)> = Vec::new();
    if let Some(map) = set.data.get("map").and_then(|m| m.as_object()) {
        for (name, id) in map {
            if built_in.contains(name) {
                let id = id.as_str().unwrap_or("").to_string();
                let o = icon_origins.get(&id).cloned().flatten();
                fillers.push((name.clone(), id, o));
            }
        }
    }
    if fillers.is_empty() {
        return issues;
    }
    let Some(theme_map) = s(&set.data, "themeMap").filter(|t| !t.is_empty()).map(String::from) else {
        issues.push(err(
            ICON_THEME_MAP_MISMATCH,
            format!(
                "{label} maps the built-in icon definitions {} but names no \"themeMap\". Export an object keyed by exactly those names and name it in {}.icons.json.",
                fillers.iter().map(|f| f.0.as_str()).collect::<Vec<_>>().join(", "),
                set.name
            ),
        ));
        return issues;
    };
    if wiring.is_some() {
        return issues;
    }
    let map_origin = origin_of(&module, &theme_map, "the theme map", json!({"entry": theme_map}), false, &mut issues, unchecked);
    let file = file_of(&module);
    let (Some(_), Some(file)) = (map_origin, file) else { return issues };
    let Some(bindings) = mo::static_export_bindings(&file, &theme_map) else {
        unchecked.push(json!({
            "entry": theme_map,
            "reason": format!("Theme map \"{theme_map}\" is not one object literal the static reader can read, so none of its entries were checked. Export it as `export const {theme_map} = {{...}}` to have it checked."),
        }));
        return issues;
    };
    for (key, _) in &bindings {
        if !fillers.iter().any(|f| f.0 == *key) {
            issues.push(err(
                ICON_THEME_MAP_MISMATCH,
                format!("{label}: theme map \"{theme_map}\" has \"{key}\", which \"map\" does not map. Remove it, or add \"{key}\" to \"map\" with the id of the icon that draws it."),
            ));
        }
    }
    for (name, id, origin) in &fillers {
        let Some((_, value)) = bindings.iter().find(|(k, _)| k == name) else {
            issues.push(err(ICON_THEME_MAP_MISMATCH, format!("{label}: theme map \"{theme_map}\" has no \"{name}\", which \"map\" maps to icon \"{id}\". Add it.")));
            continue;
        };
        let Some(value) = value else {
            unchecked.push(json!({
                "entry": name,
                "reason": format!("Theme map \"{theme_map}\" has an entry for \"{name}\" the static reader cannot read. Write it as the icon's binding ({name}: TrashIcon), an element (<TrashIcon />), or createElement(TrashIcon) to have it checked."),
            }));
            continue;
        };
        let Some(origin) = origin else { continue };
        let mapped = mo::aliased_origin(value);
        let drawn = mo::aliased_origin(origin);
        let (Some(mapped), Some(drawn)) = (mapped, drawn) else {
            unchecked.push(json!({
                "entry": name,
                "reason": format!("Theme map \"{theme_map}\" maps \"{name}\" through an alias the static reader cannot follow to its declaration, so it was not compared with icon \"{id}\". Point it at the icon's export, or alias a binding declared in this package."),
            }));
            continue;
        };
        if mapped != drawn {
            issues.push(err(
                ICON_THEME_MAP_MISMATCH,
                format!("{label}: theme map \"{theme_map}\" maps \"{name}\" to other artwork than icon \"{id}\", which \"map\" names for it. Point it at the icon's export."),
            ));
        }
    }
    issues
}

fn check_upstream(set: &DiscoveredIconSet, package_dir: &str, pkg: &Value) -> Vec<Value> {
    let Some(source) = set.data.get("source").filter(|v| v.is_object()) else { return vec![] };
    let mut issues = Vec::new();
    let label = format!("Icon set \"{}\"", set.name);
    let spkg = s(source, "package").unwrap_or("");
    let sver = s(source, "version").unwrap_or("");
    let range = ["dependencies", "peerDependencies", "optionalDependencies"].iter().find_map(|f| pkg.get(*f).and_then(|d| d.get(spkg)).and_then(|v| v.as_str()));
    let installed = super::paths::find_installed_package(package_dir, spkg, usize::MAX)
        .and_then(|d| np::read_json(&np::join2(&d, "package.json")))
        .and_then(|p| p.get("version").and_then(|v| v.as_str()).map(String::from));
    let refresh = format!(
        "Refresh it: `astryx experimental icon new-set {} --from <the {spkg} module it wraps>`, then rerun any `add --variant … --all`.",
        set.name
    );
    if let Some(inst) = installed.as_deref().filter(|i| *i != sver) {
        issues.push(warn(ICON_SOURCE_VERSION_DRIFT, format!("{label} was generated from {spkg}@{sver}, but the package resolves {spkg}@{inst}. {refresh}")));
    } else if installed.is_none() {
        if let Some(r) = range {
            if !super::semver::satisfies_range(sver, r) {
                issues.push(warn(ICON_SOURCE_VERSION_DRIFT, format!("{label} was generated from {spkg}@{sver}, but the package depends on {spkg}@{r}. {refresh}")));
            }
        }
    }
    if !has_license_notice(&set.dir) && !has_license_notice(package_dir) {
        issues.push(warn(
            ICON_LICENSE_NOTICE_MISSING,
            format!(
                "{label} is generated from {spkg}@{sver} but ships no license notice. {} If the library ships a LICENSE or NOTICE file, copy that file there instead.",
                license_notice_fix(&rel(package_dir, &set.dir), &format!("{spkg}@{sver}"))
            ),
        ));
    }
    issues
}
