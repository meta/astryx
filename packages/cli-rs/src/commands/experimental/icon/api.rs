//! Port of `api/icon` (dispatcher, options, records, the leaves' checks) and
//! the parts of `foundation/discovery/icon-*` the read path needs.

use crate::cli::command::Suggestion;
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};

pub const DEFAULT_ICON_LIMIT: f64 = 10.0;

#[derive(Debug, Clone)]
pub struct IconError {
    pub message: String,
    pub suggestions: Vec<Suggestion>,
    pub code: String,
}

pub fn ierr(message: impl Into<String>, suggestions: Vec<Suggestion>, code: &str) -> IconError {
    IconError { message: message.into(), suggestions, code: code.into() }
}

/// One installed icon set (DiscoveredIconSet), as the read path uses it.
#[derive(Debug, Clone)]
pub struct IconSet {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub license: String,
    pub package: String,
    /// The validated `<name>.icons.json`.
    pub data: Value,
    /// The set's own definitions.
    pub definitions: Vec<Definition>,
}

#[derive(Debug, Clone)]
pub struct Withdrawn {
    pub name: String,
    pub package: String,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct Choice {
    pub status: String,
    /// Index into `sets`.
    pub set: Option<usize>,
    pub reason: String,
}

pub struct IconSets {
    pub sets: Vec<IconSet>,
    pub withdrawn: Vec<Withdrawn>,
    pub choice: Choice,
}

/// One Astryx icon definition.
#[derive(Debug, Clone)]
pub struct Definition {
    pub name: String,
    pub built_in: bool,
    pub description: String,
    pub words: Vec<String>,
}

fn definition_of(d: &crate::discovery::icon_definition_discovery::DiscoveredIconDefinition) -> Definition {
    Definition { name: d.name().to_string(), built_in: d.built_in(), description: d.description().to_string(), words: d.words() }
}

/// `loadIconSets(cwd)`: `Project.load(cwd).iconSets({experimental: true})`.
/// A project that fails to load has no sets here.
pub fn load_icon_sets(cwd: &str) -> Result<IconSets, IconError> {
    use crate::discovery::icon_set_discovery as isd;
    // A config that fails to load fails the command, as Project.load throws.
    let project = crate::discovery::project::Project::load(&np::resolve1(cwd)).map_err(|m| ierr(m, vec![], "ERR_UNKNOWN"))?;
    let (sets, withdrawn, choice) = isd::project_icon_sets(&project);
    Ok(IconSets {
        sets: sets
            .into_iter()
            .map(|s| IconSet {
                name: s.name,
                display_name: s.display_name,
                description: s.description,
                license: s.license,
                package: s.package,
                data: s.data,
                definitions: s.definitions.iter().map(definition_of).collect(),
            })
            .collect(),
        withdrawn: withdrawn.into_iter().map(|w| Withdrawn { name: w.name, package: w.package, reason: w.reason }).collect(),
        choice: Choice { status: choice.status.into(), set: choice.set, reason: choice.reason },
    })
}

pub fn icon_set_key(s: &IconSet) -> String {
    format!("{}/{}", s.package, s.name)
}

/// `chooseProjectIconSet`.
pub fn choose_project_icon_set(sets: &[IconSet], configured: Option<&str>, withdrawn: &[Withdrawn]) -> Choice {
    if let Some(c) = configured.filter(|c| !c.is_empty()) {
        let exact: Vec<usize> = (0..sets.len()).filter(|&i| icon_set_key(&sets[i]) == c).collect();
        let by_name: Vec<usize> =
            if !exact.is_empty() { exact } else { (0..sets.len()).filter(|&i| sets[i].name == c).collect() };
        if by_name.len() == 1 {
            return Choice {
                status: "selected".into(),
                set: Some(by_name[0]),
                reason: format!("experimental.iconSet names \"{c}\"."),
            };
        }
        if by_name.len() > 1 {
            return Choice {
                status: "ambiguous".into(),
                set: None,
                reason: format!(
                    "experimental.iconSet \"{c}\" names a set in {}; write it as \"<package>/<set>\".",
                    by_name.iter().map(|&i| sets[i].package.clone()).collect::<Vec<_>>().join(" and ")
                ),
            };
        }
        let gone = withdrawn_named(withdrawn, c);
        if !gone.is_empty() {
            return Choice {
                status: "withdrawn".into(),
                set: None,
                reason: format!(
                    "experimental.iconSet names \"{c}\", which is installed but withdrawn: {}",
                    gone.iter().map(|w| w.reason.clone()).collect::<Vec<_>>().join(" ")
                ),
            };
        }
        let installed = if sets.is_empty() {
            String::new()
        } else {
            format!(" (installed: {})", sets.iter().map(icon_set_key).collect::<Vec<_>>().join(", "))
        };
        return Choice {
            status: "missing".into(),
            set: None,
            reason: format!("experimental.iconSet names \"{c}\", but no installed set has that name{installed}."),
        };
    }
    match sets.len() {
        1 => Choice {
            status: "selected".into(),
            set: Some(0),
            reason: format!("\"{}\" is the only installed icon set.", icon_set_key(&sets[0])),
        },
        0 => Choice { status: "none".into(), set: None, reason: "No icon set is installed.".into() },
        n => Choice {
            status: "ambiguous".into(),
            set: None,
            reason: format!(
                "{n} icon sets are installed ({}) and astryx.config sets no experimental.iconSet.",
                sets.iter().map(icon_set_key).collect::<Vec<_>>().join(", ")
            ),
        },
    }
}

fn withdrawn_named<'a>(withdrawn: &'a [Withdrawn], selector: &str) -> Vec<&'a Withdrawn> {
    let exact: Vec<&Withdrawn> = withdrawn.iter().filter(|w| format!("{}/{}", w.package, w.name) == selector).collect();
    if !exact.is_empty() {
        exact
    } else {
        withdrawn.iter().filter(|w| w.name == selector).collect()
    }
}

/// `setsNamed`.
pub fn sets_named<'a>(sets: &'a [IconSet], selector: &str) -> Vec<&'a IconSet> {
    let exact: Vec<&IconSet> = sets.iter().filter(|s| icon_set_key(s) == selector).collect();
    if !exact.is_empty() {
        exact
    } else {
        sets.iter().filter(|s| s.name == selector).collect()
    }
}

/// `unusableSet`.
pub fn unusable_set(sets: &[IconSet], withdrawn: &[Withdrawn], selector: &str) -> IconError {
    let named = withdrawn_named(withdrawn, selector);
    let message = if named.is_empty() {
        format!("No installed icon set named \"{selector}\"")
    } else {
        format!(
            "Icon set \"{selector}\" is installed but withdrawn: {}",
            named.iter().map(|w| w.reason.clone()).collect::<Vec<_>>().join(" ")
        )
    };
    let candidates: Vec<String> = sets.iter().flat_map(|s| [s.name.clone(), icon_set_key(s)]).collect();
    ierr(message, closest(selector, &candidates, "installed icon set", 5), "ERR_NOT_FOUND")
}

/// `levenshteinDistance` over UTF-16 code units.
pub fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<u16> = a.encode_utf16().collect();
    let b: Vec<u16> = b.encode_utf16().collect();
    // levenshtein.mjs: a length gap over 5 is never a match.
    if a.len().abs_diff(b.len()) > 5 {
        return 999;
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut cur = vec![i; b.len() + 1];
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
        }
        prev = cur;
    }
    prev[b.len()]
}

/// `closest(wanted, candidates, reason, max)`.
pub fn closest(wanted: &str, candidates: &[String], reason: &str, max: usize) -> Vec<Suggestion> {
    let mut seen: Vec<String> = Vec::new();
    for c in candidates {
        if !seen.contains(c) {
            seen.push(c.clone());
        }
    }
    let mut scored: Vec<(usize, String)> = seen.into_iter().map(|n| (levenshtein(wanted, &n), n)).collect();
    scored.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| crate::cli::collate::locale_compare(&a.1, &b.1)));
    scored.into_iter().take(max).map(|(_, n)| Suggestion::new(n, reason)).collect()
}

/// `refuseIgnoredPairs`.
pub fn refuse_ignored_pairs(given: &[(&str, bool)], pairs: &[(&str, &str)]) -> Result<(), IconError> {
    let has = |k: &str| given.iter().any(|(n, v)| *n == k && *v);
    for (a, b) in pairs {
        if has(a) && has(b) {
            return Err(ierr(format!("{a} and {b} cannot be used together"), vec![], "ERR_INVALID_OPTION"));
        }
    }
    Ok(())
}

/// JS `Number(string)`.
pub fn js_number(s: &str) -> f64 {
    let t = crate::commands::gap_report::api::js_trim(s);
    if t.is_empty() {
        return 0.0;
    }
    let radix = |p: &str, r: u32| -> Option<f64> {
        let rest = t.strip_prefix(p).or_else(|| t.strip_prefix(&p.to_uppercase()))?;
        if rest.is_empty() {
            return Some(f64::NAN);
        }
        let mut v = 0f64;
        for c in rest.chars() {
            v = v * r as f64 + c.to_digit(r)? as f64;
        }
        Some(v)
    };
    for (p, r) in [("0x", 16), ("0o", 8), ("0b", 2)] {
        if t.len() >= 2 && t[..2].eq_ignore_ascii_case(p) {
            return radix(p, r).unwrap_or(f64::NAN);
        }
    }
    match t {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    let valid = {
        let b = t.strip_prefix(['+', '-']).unwrap_or(t);
        let (mant, exp) = match b.find(['e', 'E']) {
            Some(i) => (&b[..i], Some(&b[i + 1..])),
            None => (b, None),
        };
        let mant_ok = {
            let parts: Vec<&str> = mant.splitn(2, '.').collect();
            let int = parts[0];
            let frac = parts.get(1).copied().unwrap_or("");
            (!int.is_empty() || !frac.is_empty())
                && int.chars().all(|c| c.is_ascii_digit())
                && frac.chars().all(|c| c.is_ascii_digit())
        };
        let exp_ok = exp.is_none_or(|e| {
            let e = e.strip_prefix(['+', '-']).unwrap_or(e);
            !e.is_empty() && e.chars().all(|c| c.is_ascii_digit())
        });
        mant_ok && exp_ok
    };
    if !valid {
        return f64::NAN;
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

pub struct IconOptions {
    pub list: bool,
    pub set: Option<String>,
    pub limit: Option<f64>,
    pub all_icons: bool,
    pub definitions: bool,
}

fn passed_str(v: &Option<String>) -> bool {
    v.as_deref().is_some_and(|s| !s.is_empty())
}

/// `<set>/<id>` or `<package>/<set>/<id>`.
fn is_reference(s: &str) -> bool {
    let Some(first) = s.chars().next() else { return false };
    if first.is_whitespace() || first == '/' || s.chars().any(char::is_whitespace) {
        return false;
    }
    let Some(slash) = s.rfind('/') else { return false };
    if slash == 0 {
        return false;
    }
    let id = &s[slash + 1..];
    !id.is_empty()
        && id.split('-').all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
}

pub enum IconResult {
    List(Value),
    Definitions(Value),
    SetIcons(Value),
    Search(Value),
    Detail { package: String, data: Value },
}

/// The `icon(query, options)` dispatcher.
pub fn icon(query: Option<&str>, o: &IconOptions, cwd: &str, defs: &dyn Fn() -> Vec<Definition>) -> Result<IconResult, IconError> {
    let given = crate::commands::gap_report::api::js_trim(query.unwrap_or(""));
    refuse_ignored_pairs(
        &[
            ("a query", !given.is_empty()),
            ("--list", o.list),
            ("--definitions", o.definitions),
            ("--all-icons", o.all_icons),
            ("--set", passed_str(&o.set)),
            ("--limit", o.limit.is_some()),
            ("a <set>/<id> query", is_reference(given)),
        ],
        &[
            ("--list", "a query"),
            ("--list", "--definitions"),
            ("--list", "--all-icons"),
            ("--list", "--set"),
            ("--list", "--limit"),
            ("--definitions", "a query"),
            ("--definitions", "--all-icons"),
            ("--definitions", "--set"),
            ("--definitions", "--limit"),
            ("--all-icons", "a query"),
            ("--all-icons", "--limit"),
            ("a <set>/<id> query", "--set"),
            ("a <set>/<id> query", "--limit"),
        ],
    )?;
    let limit = o.limit.unwrap_or(DEFAULT_ICON_LIMIT);
    let term = given;
    if o.list {
        return Ok(IconResult::List(icon_list(cwd, &defs())?));
    }
    if o.definitions {
        let list: Vec<Value> = defs()
            .into_iter()
            .map(|d| {
                let mut m = Map::new();
                m.insert("name".into(), Value::String(d.name));
                m.insert("builtIn".into(), Value::Bool(d.built_in));
                m.insert("description".into(), Value::String(d.description));
                m.insert("words".into(), Value::Array(d.words.into_iter().map(Value::String).collect()));
                Value::Object(m)
            })
            .collect();
        let mut data = Map::new();
        data.insert("definitions".into(), Value::Array(list));
        return Ok(IconResult::Definitions(Value::Object(data)));
    }
    if o.all_icons {
        let Some(set) = &o.set else {
            return Err(ierr(
                "--all-icons lists every icon of one set: pass --set",
                vec![Suggestion::new("astryx experimental icon --set <name> --all-icons", "list one set's icons")],
                "ERR_INVALID_ARGUMENT",
            ));
        };
        return icon_set_icons(cwd, set).map(IconResult::SetIcons);
    }
    if term.is_empty() {
        return Err(ierr(
            "An icon query is required",
            vec![
                Suggestion::new("astryx experimental icon delete", "find icons by meaning"),
                Suggestion::new("astryx experimental icon --list", "list the installed sets"),
            ],
            "ERR_MISSING_ARGUMENT",
        ));
    }
    if !(limit.fract() == 0.0 && limit.is_finite()) || limit <= 0.0 {
        return Err(ierr(
            format!("Invalid limit \"{}\". Must be a positive integer.", crate::json::js_number_to_string(limit)),
            vec![],
            "ERR_INVALID_ARGUMENT",
        ));
    }
    if is_reference(term) {
        return icon_detail(term, cwd, &defs());
    }
    icon_search(term, cwd, o.set.as_deref(), limit, &defs()).map(IconResult::Search)
}

fn icon_list(cwd: &str, defs: &[Definition]) -> Result<Value, IconError> {
    let IconSets { sets, withdrawn, choice } = load_icon_sets(cwd)?;
    let built_in: Vec<&str> = defs.iter().filter(|d| d.built_in).map(|d| d.name.as_str()).collect();
    let mut data = Map::new();
    data.insert("status".into(), Value::String(choice.status.clone()));
    data.insert(
        "projectSet".into(),
        choice.set.map(|i| Value::String(icon_set_key(&sets[i]))).unwrap_or(Value::Null),
    );
    data.insert("reason".into(), Value::String(choice.reason.clone()));
    let list: Vec<Value> = sets
        .iter()
        .enumerate()
        .map(|(i, set)| {
            let mapped: Vec<String> =
                set.data.get("map").and_then(|m| m.as_object()).map(|m| m.keys().cloned().collect()).unwrap_or_default();
            let has = |n: &str| mapped.iter().any(|k| k == n);
            let mut m = Map::new();
            m.insert("name".into(), Value::String(set.name.clone()));
            m.insert("displayName".into(), Value::String(set.display_name.clone()));
            m.insert("description".into(), Value::String(set.description.clone()));
            m.insert("package".into(), Value::String(set.package.clone()));
            m.insert("license".into(), Value::String(set.license.clone()));
            m.insert(
                "iconCount".into(),
                Value::from(set.data.get("icons").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0)),
            );
            m.insert("default".into(), set.data.get("default").cloned().unwrap_or(Value::Null));
            m.insert("variants".into(), set.data.get("variants").cloned().unwrap_or(Value::Null));
            let mut bi = Map::new();
            bi.insert("mapped".into(), Value::from(built_in.iter().filter(|n| has(n)).count()));
            bi.insert("total".into(), Value::from(built_in.len()));
            bi.insert(
                "missing".into(),
                Value::Array(built_in.iter().filter(|n| !has(n)).map(|n| Value::String(n.to_string())).collect()),
            );
            let mut ax = Map::new();
            ax.insert("mapped".into(), Value::from(defs.iter().filter(|d| has(&d.name)).count()));
            ax.insert("total".into(), Value::from(defs.len()));
            let mut cov = Map::new();
            cov.insert("builtIn".into(), Value::Object(bi));
            cov.insert("astryx".into(), Value::Object(ax));
            cov.insert("own".into(), Value::Array(set.definitions.iter().map(|d| Value::String(d.name.clone())).collect()));
            m.insert("coverage".into(), Value::Object(cov));
            m.insert("project".into(), Value::Bool(choice.set == Some(i)));
            Value::Object(m)
        })
        .collect();
    data.insert("sets".into(), Value::Array(list));
    data.insert(
        "withdrawn".into(),
        Value::Array(
            withdrawn
                .iter()
                .map(|w| {
                    let mut m = Map::new();
                    m.insert("name".into(), Value::String(w.name.clone()));
                    m.insert("package".into(), Value::String(w.package.clone()));
                    m.insert("reason".into(), Value::String(w.reason.clone()));
                    Value::Object(m)
                })
                .collect(),
        ),
    );
    Ok(Value::Object(data))
}

fn icon_set_icons(cwd: &str, set: &str) -> Result<Value, IconError> {
    let IconSets { sets, withdrawn, .. } = load_icon_sets(cwd)?;
    let named = sets_named(&sets, set);
    if named.is_empty() {
        return Err(unusable_set(&sets, &withdrawn, set));
    }
    if named.len() > 1 {
        return Err(ierr(
            format!("\"{set}\" names {} sets; name one as <package>/<set>", named.len()),
            named.iter().map(|s| Suggestion::new(icon_set_key(s), "name the package")).collect(),
            "ERR_INVALID_ARGUMENT",
        ));
    }
    let only = named[0];
    let by = super::ranking::definitions_by_icon(&only.data);
    let mut icons = super::ranking::icons_of(only);
    icons.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(&a.id, &b.id));
    let mut data = Map::new();
    data.insert("set".into(), Value::String(only.name.clone()));
    data.insert("package".into(), Value::String(only.package.clone()));
    data.insert("iconCount".into(), Value::from(icons.len()));
    data.insert(
        "icons".into(),
        Value::Array(
            icons
                .iter()
                .map(|i| {
                    let mut defs: Vec<String> = by.iter().find(|(id, _)| *id == i.id).map(|(_, l)| l.clone()).unwrap_or_default();
                    defs.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(a, b));
                    let mut m = Map::new();
                    m.insert("id".into(), Value::String(i.id.clone()));
                    m.insert("export".into(), Value::String(i.export.clone()));
                    m.insert("words".into(), Value::Array(i.words.iter().cloned().map(Value::String).collect()));
                    m.insert("definitions".into(), Value::Array(defs.into_iter().map(Value::String).collect()));
                    Value::Object(m)
                })
                .collect(),
        ),
    );
    Ok(Value::Object(data))
}

fn own_words(set: &IconSet, name: &str) -> Option<Vec<String>> {
    set.definitions.iter().find(|d| d.name == name).map(|d| d.words.clone())
}

fn icon_search(term: &str, cwd: &str, set: Option<&str>, limit: f64, defs: &[Definition]) -> Result<Value, IconError> {
    let IconSets { sets, withdrawn, .. } = load_icon_sets(cwd)?;
    let searched: Vec<&IconSet> = match set {
        Some(sel) => {
            let named = sets_named(&sets, sel);
            if named.is_empty() {
                return Err(unusable_set(&sets, &withdrawn, sel));
            }
            named
        }
        None => sets.iter().collect(),
    };
    let ranked = super::ranking::rank_icons(&searched, term, defs, &own_words);
    let matches = super::ranking::answering(ranked);
    let mut data = Map::new();
    data.insert("query".into(), Value::String(crate::commands::gap_report::api::js_trim(term).to_string()));
    data.insert("matchCount".into(), Value::from(matches.len()));
    data.insert(
        "matches".into(),
        Value::Array(matches.into_iter().take(limit as usize).map(|(_, e)| Value::Object(e)).collect()),
    );
    Ok(Value::Object(data))
}

fn icon_detail(reference: &str, cwd: &str, defs: &[Definition]) -> Result<IconResult, IconError> {
    let slash = reference.rfind('/').unwrap_or(0);
    let selector = &reference[..slash];
    let id = &reference[slash + 1..];
    let IconSets { sets, withdrawn, .. } = load_icon_sets(cwd)?;
    let named = sets_named(&sets, selector);
    if named.is_empty() {
        return Err(unusable_set(&sets, &withdrawn, selector));
    }
    if named.len() > 1 {
        return Err(ierr(
            format!(
                "Icon set name \"{selector}\" is installed by {}",
                named.iter().map(|s| s.package.clone()).collect::<Vec<_>>().join(" and ")
            ),
            named.iter().map(|s| Suggestion::new(format!("{}/{}/{id}", s.package, s.name), "name the package")).collect(),
            "ERR_INVALID_ARGUMENT",
        ));
    }
    let set = named[0];
    let icons = super::ranking::icons_of(set);
    let Some(icon) = icons.iter().find(|i| i.id == id) else {
        let nearby: Vec<String> = super::ranking::rank_icons(&[set], &id.replace('-', " "), defs, &own_words)
            .into_iter()
            .map(|(_, e)| format!("{}/{}", set.name, e["id"].as_str().unwrap_or("")))
            .collect();
        let suggestions = if !nearby.is_empty() {
            nearby.into_iter().take(5).map(|n| Suggestion::new(n, "similar icon")).collect()
        } else {
            let ids: Vec<String> = icons.iter().map(|i| i.id.clone()).collect();
            closest(id, &ids, "icon in this set", 5)
                .into_iter()
                .map(|s| Suggestion { name: format!("{}/{}", set.name, s.name), reason: s.reason })
                .collect()
        };
        return Err(ierr(format!("No icon \"{id}\" in icon set \"{}\"", set.name), suggestions, "ERR_NOT_FOUND"));
    };
    let mut record = super::ranking::icon_record(set, icon, None);
    if let Some(Value::Array(vs)) = record.get_mut("variants") {
        for v in vs.iter_mut() {
            let e = v["export"].as_str().unwrap_or("").to_string();
            let m = v["module"].as_str().unwrap_or("").to_string();
            if let Value::Object(o) = v {
                o.insert("import".into(), Value::String(super::ranking::import_line(&e, &m)));
            }
        }
    }
    Ok(IconResult::Detail { package: set.package.clone(), data: Value::Object(record) })
}

/// `refuseOutsideProject`.
pub fn refuse_outside_project(cwd: &str, command: &str, where_: &str) -> Result<(), IconError> {
    let outside = !crate::discovery::release::run_choice(cwd).in_project;
    if !outside || has_package_json_above(cwd) {
        return Ok(());
    }
    Err(ierr(format!("astryx {command} works only in a project. Run it in {where_}."), vec![], "ERR_PROJECT_REQUIRED"))
}

fn has_package_json_above(dir: &str) -> bool {
    let mut at = np::resolve1(dir);
    loop {
        if np::exists(&np::join2(&at, "package.json")) {
            return true;
        }
        let parent = np::dirname(&at);
        if parent == at {
            return false;
        }
        at = parent;
    }
}

/// `packageDirOf` (icon-set-writer).
pub fn package_dir_of(cwd: &str) -> Result<String, IconError> {
    let mut dir = np::resolve1(cwd);
    for _ in 0..50 {
        if np::exists(&np::join2(&dir, "package.json")) {
            return Ok(dir);
        }
        let parent = np::dirname(&dir);
        if parent == dir {
            break;
        }
        dir = parent;
    }
    Err(ierr("No package.json found. Run this command inside the icon-set package.", vec![], "ERR_FILE_NOT_FOUND"))
}

pub const MANIFEST_BASENAMES: [&str; 3] = ["astryx.integration.ts", "astryx.integration.mjs", "astryx.integration.js"];

/// `findLocalIntegrationManifestOrNull`.
pub fn find_local_manifest(package_dir: &str) -> Result<Option<String>, IconError> {
    let found: Vec<String> =
        MANIFEST_BASENAMES.iter().map(|n| np::join2(package_dir, n)).filter(|p| np::exists(p)).collect();
    match found.len() {
        0 => Ok(None),
        1 => Ok(Some(found[0].clone())),
        _ => Err(ierr(
            format!(
                "Multiple integration manifests found ({}). Keep exactly one.",
                found.iter().map(|f| np::basename(f)).collect::<Vec<_>>().join(", ")
            ),
            vec![],
            "ERR_UNKNOWN",
        )),
    }
}

/// Astryx's icon definitions.
pub fn astryx_icon_definitions(_cli_root: &std::path::Path) -> Vec<Definition> {
    crate::discovery::icon_definition_discovery::astryx_icon_definitions().definitions.iter().map(definition_of).collect()
}

#[allow(dead_code)]
fn old_definitions(cli_root: &std::path::Path) -> Vec<Definition> {
    let dir = cli_root.join("assets/icons/definitions");
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().to_string()).collect())
        .unwrap_or_default();
    names.retain(|n| n.ends_with(".doc.mjs"));
    names.sort_by(|a, b| crate::cli::collate::locale_compare(a, b));
    let mut out = Vec::new();
    for n in names {
        let Ok(ns) = crate::js::import_module(&dir.join(&n), &crate::js::ImportOptions::default()) else { continue };
        let Some(d) = ns.get("default") else { continue };
        out.push(Definition {
            name: d.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            built_in: d.get("builtIn").and_then(|v| v.as_bool()) == Some(true),
            description: d.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            words: d
                .get("words")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                .unwrap_or_default(),
        });
    }
    out
}
