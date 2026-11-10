//! Port of the authoring core of `foundation/discovery/icon-set-writer.mjs`
//! (the local set, the data file, the write journal, names) and of
//! `api/icon/map/map.mjs`.

use super::api::{ierr, IconError};
use crate::cli::command::Suggestion;
use crate::discovery::icon_set_discovery::{self as isd, DiscoveredIconSet};
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};
use std::cell::RefCell;

// ---- write journal (allOrNothing) ----

#[derive(Default)]
struct Journal {
    files: Vec<(String, Option<Vec<u8>>)>,
    dirs: Vec<String>,
}

thread_local! {
    static JOURNAL: RefCell<Option<Journal>> = const { RefCell::new(None) };
}

/// `journalFile(file)`: remember a file's bytes before its first write.
pub fn journal_file(file: &str) {
    JOURNAL.with(|j| {
        let mut j = j.borrow_mut();
        let Some(j) = j.as_mut() else { return };
        let full = np::resolve1(file);
        if j.files.iter().any(|(f, _)| *f == full) {
            return;
        }
        let bytes = if np::exists(&full) { std::fs::read(&full).ok() } else { None };
        j.files.push((full.clone(), bytes));
        let mut missing = None;
        let mut dir = np::dirname(&full);
        while !np::exists(&dir) && np::dirname(&dir) != dir {
            missing = Some(dir.clone());
            dir = np::dirname(&dir);
        }
        if let Some(m) = missing {
            if !j.dirs.contains(&m) {
                j.dirs.push(m);
            }
        }
    });
}

/// `authoring(step)`: all or nothing.
pub fn all_or_nothing<T>(step: impl FnOnce() -> Result<T, IconError>) -> Result<T, IconError> {
    JOURNAL.with(|j| *j.borrow_mut() = Some(Journal::default()));
    let r = step();
    let journal = JOURNAL.with(|j| j.borrow_mut().take()).unwrap_or_default();
    if r.is_err() {
        for (file, bytes) in journal.files.iter().rev() {
            match bytes {
                None => {
                    let _ = std::fs::remove_file(file);
                }
                Some(b) => {
                    if std::fs::read(file).ok().as_ref() != Some(b) {
                        let _ = std::fs::write(file, b);
                    }
                }
            }
        }
        for d in journal.dirs.iter().rev() {
            let _ = std::fs::remove_dir_all(d);
        }
    }
    r
}

/// `replaceText(file, text)`.
pub fn replace_text(file: &str, text: &str) -> Result<(), IconError> {
    journal_file(file);
    let tmp = np::join2(&np::dirname(file), &format!(".{}.tmp-{}", np::basename(file), std::process::id()));
    let r = std::fs::write(&tmp, text).and_then(|_| std::fs::rename(&tmp, file));
    if let Err(e) = r {
        let _ = std::fs::remove_file(&tmp);
        return Err(ierr(format!("Could not write {}: {e}", np::basename(file)), vec![], "ERR_WRITE_FAILED"));
    }
    Ok(())
}

/// Write a new file (`wx`), journaled.
pub fn write_new(file: &str, text: &str) -> Result<(), IconError> {
    journal_file(file);
    if let Some(parent) = std::path::Path::new(file).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(file, text).map_err(|e| ierr(format!("Could not write {}: {e}", np::basename(file)), vec![], "ERR_WRITE_FAILED"))
}

// ---- names ----

/// `closestNames(wanted, candidates, max)`.
pub fn closest_names(wanted: &str, candidates: &[String], max: usize) -> Vec<String> {
    let lower = wanted.to_lowercase();
    let limit = 2usize.max(lower.encode_utf16().count().div_ceil(3));
    let mut seen: Vec<String> = vec![];
    for c in candidates {
        if !seen.contains(c) {
            seen.push(c.clone());
        }
    }
    let mut scored: Vec<(usize, String)> = seen
        .into_iter()
        .map(|n| (super::api::levenshtein(&lower, &n.to_lowercase()), n))
        .filter(|(d, _)| *d <= limit)
        .collect();
    scored.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| crate::discovery::jsort::cmp_utf16(&a.1, &b.1)));
    scored.into_iter().take(max).map(|(_, n)| n).collect()
}

fn re_replace(re: &str, s: &str, f: &dyn Fn(&regress::Match, &str) -> String) -> String {
    let r = regress::Regex::with_flags(re, "gu").unwrap();
    let mut out = String::new();
    let mut last = 0;
    for m in r.find_iter(s) {
        out.push_str(&s[last..m.start()]);
        out.push_str(&f(&m, s));
        last = m.end();
    }
    out.push_str(&s[last..]);
    out
}

/// `iconIdOf(name)`.
pub fn icon_id_of(name: &str) -> String {
    let a = name.strip_suffix("Icon").unwrap_or(name).to_string();
    let b = re_replace(r"([0-9])[xX](?=[0-9])", &a, &|m, t| format!("{}x", &t[m.group(1).unwrap()]));
    let c = re_replace(r"([a-z][A-Z])(?=[0-9])", &b, &|m, t| format!("{}-", &t[m.group(1).unwrap()]));
    let d = re_replace(r"([a-z])(?=[A-Z0-9])", &c, &|m, t| {
        let letter = &t[m.group(1).unwrap()];
        let prev = t[..m.start()].chars().last();
        if letter == "x" && prev.is_some_and(|p| p.is_ascii_digit()) {
            letter.to_string()
        } else {
            format!("{letter}-")
        }
    });
    let e = re_replace(r"([0-9])([A-Z])", &d, &|m, t| format!("{}-{}", &t[m.group(1).unwrap()], &t[m.group(2).unwrap()]));
    let f = re_replace(r"([A-Z])([A-Z][a-z])", &e, &|m, t| format!("{}-{}", &t[m.group(1).unwrap()], &t[m.group(2).unwrap()]));
    f.to_lowercase()
}

pub fn icon_export_name(name: &str) -> String {
    let mut cs = name.chars();
    let pascal = match cs.next() {
        Some(f) => format!("{}{}", f.to_uppercase(), cs.as_str()),
        None => String::new(),
    };
    if pascal.ends_with("Icon") { pascal } else { format!("{pascal}Icon") }
}

fn icons(set: &DiscoveredIconSet) -> Vec<Value> {
    set.data.get("icons").and_then(|v| v.as_array()).cloned().unwrap_or_default()
}

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("")
}

fn words_of(v: &Value) -> Vec<String> {
    v.get("words").and_then(|w| w.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

pub fn icon_ids(set: &DiscoveredIconSet) -> Vec<String> {
    icons(set).iter().map(|i| s(i, "id").to_string()).collect()
}

/// `iconIdIn(set, id)`.
pub fn icon_id_in(set: &DiscoveredIconSet, id: &str) -> Option<String> {
    let all = icons(set);
    if all.iter().any(|i| s(i, "id") == id) {
        return Some(id.to_string());
    }
    let lower = id.to_lowercase();
    if let Some(i) = all.iter().find(|i| {
        let e = s(i, "export").to_lowercase();
        e == lower || e == format!("{lower}icon")
    }) {
        return Some(s(i, "id").to_string());
    }
    let mut candidates = vec![id.to_string()];
    if id.chars().any(|c| c.is_ascii_uppercase()) {
        candidates.push(icon_id_of(id));
    }
    for c in candidates {
        if all.iter().any(|i| s(i, "id") == c) {
            return Some(c);
        }
        let holders: Vec<&Value> =
            all.iter().filter(|i| crate::discovery::icon_set_writer::other_names_of(s(i, "id"), &words_of(i)).contains(&c)).collect();
        if holders.len() == 1 {
            return Some(s(holders[0], "id").to_string());
        }
    }
    None
}

/// `iconsWithWord(set, word)`.
pub fn icons_with_word(set: &DiscoveredIconSet, word: &str) -> Vec<String> {
    icons(set)
        .iter()
        .filter(|i| words_of(i).iter().any(|w| w == word) || s(i, "id").split('-').any(|p| p == word))
        .map(|i| s(i, "id").to_string())
        .take(5)
        .collect()
}

/// `mappableDefinitions(set, extra)`, in insertion order.
pub fn mappable_definitions(set: &DiscoveredIconSet, extra: &[String]) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    let mut push = |n: String| {
        if !out.contains(&n) {
            out.push(n);
        }
    };
    for (n, _) in crate::discovery::icon_definition_discovery::astryx_definitions_by_name() {
        push(n);
    }
    for d in &set.definitions {
        push(d.name().to_string());
    }
    for e in extra {
        push(e.clone());
    }
    out
}

/// `definitionNameOf(name, known)`.
pub fn definition_name_of(name: &str, known: &[String]) -> String {
    if known.iter().any(|k| k == name) {
        return name.to_string();
    }
    let camel = re_replace(r"-([a-z0-9])", name, &|m, t| t[m.group(1).unwrap()].to_uppercase());
    if known.contains(&camel) { camel } else { name.to_string() }
}

// ---- the local set ----

pub struct LocalSet {
    pub package_dir: String,
    pub pkg: Value,
    pub root: String,
    pub set: DiscoveredIconSet,
    pub sets: Vec<DiscoveredIconSet>,
}

/// `findLocalIconSet(cwd, selector)`.
pub fn find_local_icon_set(cwd: &str, selector: Option<&str>) -> Result<LocalSet, IconError> {
    let package_dir = super::api::package_dir_of(cwd)?;
    let text = std::fs::read_to_string(np::join2(&package_dir, "package.json"))
        .map_err(|e| ierr(format!("Cannot read package.json: {e}"), vec![], "ERR_INVALID_ARGUMENT"))?;
    let pkg = np::parse_json(&text).ok_or_else(|| ierr("Cannot read package.json: invalid JSON", vec![], "ERR_INVALID_ARGUMENT"))?;
    let declared = match super::api::find_local_manifest(&package_dir)? {
        None => None,
        Some(file) => {
            let manifest = crate::commands::integration::manifest_load::load_manifest_labeled(np::p(&file), "Integration manifest").map_err(|e| {
                ierr(e.message.clone(), e.suggestions.iter().map(|(n, r)| Suggestion::new(n.clone(), r.clone())).collect(), e.code.as_deref().unwrap_or("ERR_UNKNOWN"))
            })?;
            Some(manifest)
                .as_ref()
                .and_then(|d| d.get("experimental"))
                .and_then(|e| e.get("iconSets"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from)
        }
    };
    let Some(declared) = declared else {
        return Err(ierr(
            "This package ships no icon set. Add one first.",
            vec![Suggestion::new("astryx experimental icon new-set <name>", "add an icon set")],
            "ERR_NOT_FOUND",
        ));
    };
    let root = crate::commands::swizzle::path_safety::assert_within(&declared, &package_dir, false, "experimental.iconSets root")
        .map_err(|e| ierr(e.message.clone(), vec![], "ERR_PATH_TRAVERSAL"))?;
    let owner = pkg.get("name").and_then(|v| v.as_str()).unwrap_or("(local integration)").to_string();
    let (sets, errors) = isd::discover_icon_set_directory(&root, &owner);
    let named: Vec<&DiscoveredIconSet> = match selector {
        Some(sel) => sets.iter().filter(|s| s.name == sel).collect(),
        None => sets.iter().collect(),
    };
    if named.len() == 1 {
        let mut set = named[0].clone();
        set.package_dir = Some(package_dir.clone());
        return Ok(LocalSet { package_dir, pkg, root, set, sets: sets.clone() });
    }
    if let Some(sel) = selector {
        if let Some((_, msg)) = errors.iter().find(|(n, _)| n == sel) {
            return Err(ierr(format!("Icon set \"{sel}\" is in this package but withdrawn: {msg}"), vec![], "ERR_NOT_FOUND"));
        }
    }
    let names: Vec<String> = sets.iter().map(|s| s.name.clone()).collect();
    if named.is_empty() {
        if let Some(sel) = selector {
            return Err(ierr(
                format!("No icon set named \"{sel}\" in this package"),
                names.iter().map(|n| Suggestion::new(n.clone(), "an icon set in this package")).collect(),
                "ERR_NOT_FOUND",
            ));
        }
    }
    let message = if names.is_empty() {
        match errors.first() {
            Some((_, m)) => format!("This package has no valid icon set: {m}"),
            None => "This package has no valid icon set.".into(),
        }
    } else {
        format!("This package has {} icon sets; name one with --set.", names.len())
    };
    Err(ierr(
        message,
        names.iter().map(|n| Suggestion::new(format!("--set {n}"), "an icon set in this package")).collect(),
        if names.is_empty() { "ERR_NOT_FOUND" } else { "ERR_INVALID_ARGUMENT" },
    ))
}

const DATA_KEYS: [&str; 11] = ["schemaVersion", "module", "source", "exclude", "generated", "adapter", "variants", "default", "themeMap", "map", "icons"];

/// `iconSetDataText(data)`.
pub fn icon_set_data_text(data: &Value) -> String {
    let mut ordered = Map::new();
    let obj = data.as_object().cloned().unwrap_or_default();
    for k in DATA_KEYS {
        let Some(v) = obj.get(k) else { continue };
        if k == "map" {
            let mut entries: Vec<(String, Value)> = v.as_object().map(|m| m.iter().map(|(a, b)| (a.clone(), b.clone())).collect()).unwrap_or_default();
            entries.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(&a.0, &b.0));
            ordered.insert(k.into(), Value::Object(entries.into_iter().collect()));
        } else {
            ordered.insert(k.into(), v.clone());
        }
    }
    for (k, v) in &obj {
        if !DATA_KEYS.contains(&k.as_str()) {
            ordered.insert(k.clone(), v.clone());
        }
    }
    format!("{}\n", crate::json::stringify(&Value::Object(ordered), 2))
}

/// `writeIconSetData(set, next, {extraDefinitions})`.
pub fn write_icon_set_data(set: &DiscoveredIconSet, next: &Value, extra: &[String]) -> Result<(), IconError> {
    let label = format!("Icon set \"{}\"", set.name);
    let parsed = isd::parse_icon_set_data(next, &format!("{label} data file")).map_err(|m| ierr(m, vec![], "ERR_INVALID_ARGUMENT"))?;
    let known = mappable_definitions(set, extra);
    if let Some(map) = parsed.get("map").and_then(|m| m.as_object()) {
        for name in map.keys() {
            if !known.contains(name) {
                let mut sug: Vec<Suggestion> =
                    closest_names(name, &known, 5).into_iter().map(|n| Suggestion::new(n, "a known icon definition")).collect();
                sug.push(Suggestion::new(
                    format!("astryx experimental icon new-definition {name} --set {}", set.name),
                    "add it as your own definition",
                ));
                return Err(ierr(
                    format!("\"{name}\" is not an icon definition. Use an Astryx icon definition (astryx docs cli/experimental/icon-definitions), or add your own."),
                    sug,
                    "ERR_INVALID_ARGUMENT",
                ));
            }
        }
    }
    replace_text(&set.data_path, &icon_set_data_text(next))
}

fn refusal_suggestions(set: &DiscoveredIconSet, name: &str, ids: &[String]) -> Vec<Suggestion> {
    let mut all: Vec<String> = vec![];
    for n in icons_with_word(set, name).into_iter().chain(closest_names(name, ids, 5)) {
        if !all.contains(&n) {
            all.push(n);
        }
    }
    all.into_iter().take(5).map(|n| Suggestion::new(n, "an icon in this set")).collect()
}

fn data_file(local: &LocalSet) -> String {
    np::relative(&local.package_dir, &local.set.data_path)
}

/// Write the data file, and the generated module when the set has one.
fn write_map(local: &LocalSet, next: &Value) -> Result<Vec<String>, IconError> {
    let mut files = vec![];
    if let Some(generated) = local.set.data.get("generated").and_then(|g| g.as_str()) {
        files = super::generated::write_generated_icons(&local.package_dir, generated, next, &[], &[])?;
    }
    write_icon_set_data(&local.set, next, &[])?;
    Ok(files)
}

/// `iconMap(definition, icon, options)` after the argument checks.
pub fn icon_map(cwd: &str, selector: Option<&str>, definition: &str, icon: Option<&str>, remove: bool) -> Result<Value, IconError> {
    all_or_nothing(|| {
        let local = find_local_icon_set(cwd, selector)?;
        let set = &local.set;
        let known = mappable_definitions(set, &[]);
        let definition = definition_name_of(definition, &known);
        let icon = if remove { None } else { icon.map(|i| icon_id_in(set, i).unwrap_or_else(|| i.to_string())) };
        let mut map = set.data.get("map").and_then(|m| m.as_object()).cloned().unwrap_or_default();
        let previous = map.get(&definition).and_then(|v| v.as_str()).map(String::from);
        if remove {
            map.remove(&definition);
        } else {
            if !known.contains(&definition) {
                let mut sug: Vec<Suggestion> =
                    closest_names(&definition, &known, 5).into_iter().map(|n| Suggestion::new(n, "a known icon definition")).collect();
                sug.push(Suggestion::new(
                    format!("astryx experimental icon new-definition {definition} --set {}", set.name),
                    "add it as your own definition",
                ));
                return Err(ierr(format!("\"{definition}\" is not an icon definition."), sug, "ERR_NOT_FOUND"));
            }
            let ids = icon_ids(set);
            let i = icon.clone().unwrap_or_default();
            if !ids.contains(&i) {
                return Err(ierr(
                    format!("Icon set \"{}\" has no icon \"{i}\". Name an icon by its id, its export name, or another name its library exports it as; a word it carries is not its name.", set.name),
                    refusal_suggestions(set, &i, &ids),
                    "ERR_NOT_FOUND",
                ));
            }
            map.insert(definition.clone(), Value::String(i));
        }
        let changed = if remove { previous.is_some() } else { previous.as_deref() != icon.as_deref() };
        let mut files = vec![];
        if changed {
            let mut next = set.data.clone();
            next.as_object_mut().unwrap().insert("map".into(), Value::Object(map));
            files = write_map(&local, &next)?;
        }
        let mut d = Map::new();
        d.insert("set".into(), Value::String(set.name.clone()));
        d.insert("package".into(), Value::String(set.package.clone()));
        d.insert("file".into(), Value::String(data_file(&local)));
        d.insert("definition".into(), Value::String(definition));
        d.insert("icon".into(), icon.map(Value::String).unwrap_or(Value::Null));
        d.insert("previous".into(), previous.map(Value::String).unwrap_or(Value::Null));
        d.insert("changed".into(), Value::Bool(changed));
        if !files.is_empty() {
            d.insert("files".into(), Value::Array(files.into_iter().map(Value::String).collect()));
        }
        Ok(Value::Object(d))
    })
}

/// `mapMany({cwd, selector, pairs})`.
pub fn icon_map_many(cwd: &str, selector: Option<&str>, pairs: &str) -> Result<Value, IconError> {
    let items: Vec<&str> = pairs.split(|c: char| c == ',' || c.is_whitespace()).filter(|x| !x.is_empty()).collect();
    if items.is_empty() {
        return Err(ierr("Pass --pairs with <definition>=<icon> entries, such as close=x-mark,search=magnifying-glass.", vec![], "ERR_MISSING_ARGUMENT"));
    }
    all_or_nothing(|| {
        let local = find_local_icon_set(cwd, selector)?;
        let set = &local.set;
        let known = mappable_definitions(set, &[]);
        let ids = icon_ids(set);
        let mut map = set.data.get("map").and_then(|m| m.as_object()).cloned().unwrap_or_default();
        let mut entries = vec![];
        let pair_re = regress::Regex::new(r"^([^=]+)=([^=]+)$").unwrap();
        for item in items {
            let Some(m) = pair_re.find(item) else {
                return Err(ierr(format!("\"{item}\" is not a <definition>=<icon> pair."), vec![], "ERR_INVALID_ARGUMENT"));
            };
            let name = definition_name_of(&item[m.group(1).unwrap()], &known);
            let raw_id = &item[m.group(2).unwrap()];
            let id = icon_id_in(set, raw_id).unwrap_or_else(|| raw_id.to_string());
            if !known.contains(&name) {
                return Err(ierr(
                    format!("\"{name}\" is not an icon definition. Nothing was written."),
                    closest_names(&name, &known, 5).into_iter().map(|n| Suggestion::new(n, "a known icon definition")).collect(),
                    "ERR_NOT_FOUND",
                ));
            }
            if !ids.contains(&id) {
                return Err(ierr(
                    format!("Icon set \"{}\" has no icon \"{id}\" (for {name}). Name an icon by its id, its export name, or another name its library exports it as; a word it carries is not its name. Nothing was written.", set.name),
                    refusal_suggestions(set, &id, &ids),
                    "ERR_NOT_FOUND",
                ));
            }
            let previous = map.get(&name).and_then(|v| v.as_str()).map(String::from);
            map.insert(name.clone(), Value::String(id.clone()));
            let mut e = Map::new();
            e.insert("definition".into(), Value::String(name));
            e.insert("icon".into(), Value::String(id.clone()));
            e.insert("changed".into(), Value::Bool(previous.as_deref() != Some(id.as_str())));
            e.insert("previous".into(), previous.map(Value::String).unwrap_or(Value::Null));
            // key order: definition, icon, previous, changed
            let mut ordered = Map::new();
            for k in ["definition", "icon", "previous", "changed"] {
                ordered.insert(k.into(), e[k].clone());
            }
            entries.push(Value::Object(ordered));
        }
        let changed = entries.iter().any(|e| e["changed"] == Value::Bool(true));
        let mut files = vec![];
        if changed {
            let mut next = set.data.clone();
            next.as_object_mut().unwrap().insert("map".into(), Value::Object(map));
            files = write_map(&local, &next)?;
        }
        let mut d = Map::new();
        d.insert("set".into(), Value::String(set.name.clone()));
        d.insert("package".into(), Value::String(set.package.clone()));
        d.insert("file".into(), Value::String(data_file(&local)));
        d.insert("entries".into(), Value::Array(entries));
        d.insert("changed".into(), Value::Bool(changed));
        if !files.is_empty() {
            d.insert("files".into(), Value::Array(files.into_iter().map(Value::String).collect()));
        }
        Ok(Value::Object(d))
    })
}

// ---- new-definition ----

/// `definitionNameFromInput(name)`.
pub fn definition_name_from_input(name: &str) -> String {
    if regress::Regex::new(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$").unwrap().find(name).is_some() {
        re_replace(r"-([a-z0-9])", name, &|m, t| t[m.group(1).unwrap()].to_uppercase())
    } else {
        name.to_string()
    }
}

pub struct NewDefinition {
    pub name: String,
    pub description: String,
    pub words: Vec<String>,
}

/// `checkNewDefinition(set, given)`.
pub fn check_new_definition(name: &str, description: Option<&str>, words: Option<&[String]>) -> Result<NewDefinition, IconError> {
    let name = definition_name_from_input(name);
    if regress::Regex::new(r"^[a-z][a-zA-Z0-9]*$").unwrap().find(&name).is_none() {
        return Err(ierr(
            format!("Invalid icon definition name \"{name}\": use camelCase (aiHelper) or kebab-case (ai-helper), starting with a lower-case letter."),
            vec![],
            "ERR_INVALID_ARGUMENT",
        ));
    }
    if crate::discovery::icon_definition_discovery::astryx_definitions_by_name().iter().any(|(n, _)| *n == name) {
        return Err(ierr(
            format!("Astryx already has the icon definition \"{name}\"; map to it instead of adding your own."),
            vec![Suggestion::new(format!("--definition {name}"), "use Astryx's definition")],
            "ERR_INVALID_ARGUMENT",
        ));
    }
    let description = crate::commands::gap_report::api::js_trim(description.unwrap_or("")).to_string();
    let mut ws: Vec<String> = vec![];
    for w in words.unwrap_or(&[]) {
        let w = crate::commands::gap_report::api::js_trim(w).to_lowercase();
        if !w.is_empty() && !ws.contains(&w) {
            ws.push(w);
        }
    }
    if description.is_empty() || ws.is_empty() {
        return Err(ierr(
            "A new icon definition needs --description and --words: one sentence on what the icon is for, and the words people search for.",
            vec![],
            "ERR_MISSING_ARGUMENT",
        ));
    }
    Ok(NewDefinition { name, description, words: ws })
}

/// `iconDefinitionSource(doc)`.
pub fn icon_definition_source(doc: &NewDefinition) -> String {
    let q = super::authoring::quote_js;
    [
        "/** @type {import('@astryxdesign/cli/authoring').IconDefinitionDoc} */".to_string(),
        "export default {".into(),
        "  type: 'icon-definition',".into(),
        format!("  name: {},", q(&doc.name)),
        format!("  description: {},", q(&doc.description)),
        format!("  words: [{}],", doc.words.iter().map(|w| q(w)).collect::<Vec<_>>().join(", ")),
        "};".into(),
        String::new(),
    ]
    .join("\n")
}

pub fn definition_file(set: &DiscoveredIconSet, name: &str) -> String {
    np::join(&[&set.dir, "definitions", &format!("{name}.doc.mjs")])
}

/// `writeDefinitionFile(set, doc)`.
pub fn write_definition_file(set: &DiscoveredIconSet, doc: &NewDefinition) -> Result<(), IconError> {
    let file = definition_file(set, &doc.name);
    if np::exists(&file) {
        return Err(ierr(format!("Refusing to overwrite existing file definitions/{}.doc.mjs.", doc.name), vec![], "ERR_FILE_EXISTS"));
    }
    write_new(&file, &icon_definition_source(doc))
}

fn manifest_rel(package_dir: &str) -> String {
    let m = super::api::find_local_manifest(package_dir).ok().flatten().unwrap_or_else(|| np::join2(package_dir, "astryx.integration.mjs"));
    np::relative(package_dir, &m)
}

/// `addIconDefinition(name, options)`.
pub fn add_icon_definition(cwd: &str, selector: Option<&str>, name: &str, description: Option<&str>, words: Option<&[String]>, icon: Option<&str>, dry_run: bool) -> Result<Value, IconError> {
    all_or_nothing(|| {
        let local = find_local_icon_set(cwd, selector)?;
        let set = &local.set;
        let doc = check_new_definition(name, description, words)?;
        let file = definition_file(set, &doc.name);
        if np::exists(&file) {
            return Err(ierr(format!("Refusing to overwrite existing file {}.", np::relative(&local.package_dir, &file)), vec![], "ERR_FILE_EXISTS"));
        }
        let ids = icon_ids(set);
        if let Some(i) = icon {
            if !ids.iter().any(|x| x == i) {
                return Err(ierr(
                    format!("Icon set \"{}\" has no icon \"{i}\".", set.name),
                    ids.iter().filter(|id| id.contains(i) || i.contains(id.as_str())).take(5).map(|id| Suggestion::new(id.clone(), "an icon in this set")).collect(),
                    "ERR_NOT_FOUND",
                ));
            }
        }
        let mut files = vec![np::relative(&local.package_dir, &file)];
        if icon.is_some() {
            files.push(np::relative(&local.package_dir, &set.data_path));
        }
        if !dry_run {
            write_definition_file(set, &doc)?;
            if let Some(i) = icon {
                let mut next = set.data.clone();
                let mut map = next.get("map").and_then(|m| m.as_object()).cloned().unwrap_or_default();
                map.insert(doc.name.clone(), Value::String(i.to_string()));
                next.as_object_mut().unwrap().insert("map".into(), Value::Object(map));
                write_icon_set_data(set, &next, &[doc.name.clone()])?;
            }
            find_local_icon_set(cwd, Some(&set.name))?;
        }
        let root = format!("./{}", np::relative(&local.package_dir, &local.root));
        let r = crate::commands::integration::add_helpers::receipt(
            "icon-definition",
            &doc.name,
            Some((root, false)),
            &manifest_rel(&local.package_dir),
            &files,
            dry_run,
        );
        Ok(r.get("data").cloned().unwrap_or(r))
    })
}
