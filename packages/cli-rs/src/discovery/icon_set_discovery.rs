//! Port of `foundation/discovery/icon-set-discovery.mjs` and
//! `authoring/doctypes/icon-set/parse.mjs`: the one seam every icon surface
//! reads installed icon sets through. Nothing is executed: the descriptor is
//! read statically and the data file is JSON.

use super::icon_definition_discovery::{self as defs, DiscoveredIconDefinition};
use super::integrations::{self as integ, Record};
use super::nodepath as np;
use super::zod::{self, *};
use crate::json::{Map, Value};
use std::sync::Arc;

/// One installed icon set (DiscoveredIconSet).
#[derive(Debug, Clone)]
pub struct DiscoveredIconSet {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub maintained: bool,
    pub license: String,
    pub package: String,
    pub package_dir: Option<String>,
    pub dir: String,
    pub doc_path: String,
    pub data_path: String,
    /// The validated data file.
    pub data: Value,
    pub notices: Vec<String>,
    pub definitions: Vec<DiscoveredIconDefinition>,
    pub module_file: Option<String>,
}

impl DiscoveredIconSet {
    pub fn key(&self) -> String {
        format!("{}/{}", self.package, self.name)
    }
}

#[derive(Debug, Clone)]
pub struct WithdrawnIconSet {
    pub name: String,
    pub package: String,
    /// `invalid` or `unresolved`.
    pub kind: &'static str,
    pub reason: String,
}

/// The project's icon set (IconSetChoice); `set` indexes `sets`.
#[derive(Debug, Clone)]
pub struct IconSetChoice {
    pub status: &'static str,
    pub set: Option<usize>,
    pub configured: Option<String>,
    pub reason: String,
}

fn is_kebab(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts[0].chars().next().is_some_and(|c| c.is_ascii_lowercase())
        && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
}

/// `/^(?:licen[cs]e|notice|copying)(?:[.-].*)?$/iu`.
pub fn is_notice_file(name: &str) -> bool {
    let l = name.to_lowercase();
    for stem in ["license", "licence", "notice", "copying"] {
        if let Some(rest) = l.strip_prefix(stem) {
            if rest.is_empty() || rest.starts_with('.') || rest.starts_with('-') {
                return true;
            }
        }
    }
    false
}

/// `licenseNoticeFix(setDir, library)`.
pub fn license_notice_fix(set_dir: &str, library: &str) -> String {
    format!("Add a NOTICE (or LICENSE) file to {set_dir} that names {library} and its license: `{set_dir}/NOTICE`. A file named LICENSE, LICENCE, NOTICE, or COPYING, in any case and with an optional suffix such as NOTICE.md or LICENSE-MIT, counts in the set directory or the package root.")
}

/// `hasLicenseNotice(dir)`.
pub fn has_license_notice(dir: &str) -> bool {
    np::read_dir(dir).is_some_and(|es| es.iter().any(|e| e.is_file && is_notice_file(&e.name)))
}

// ── Parsers (authoring/doctypes/icon-set/parse.mjs) ──────────────────────

fn not_blank(s: &str) -> bool {
    !crate::commands::gap_report::api::js_trim(s).is_empty()
}

fn non_blank(field: &'static str) -> Z {
    let msg = match field {
        "name" => "name must not be blank",
        "displayName" => "displayName must not be blank",
        "license" => "license must not be blank",
        "variant" => "variant must not be blank",
        "word" => "word must not be blank",
        "source.package" => "source.package must not be blank",
        "source.version" => "source.version must not be blank",
        _ => "must not be blank",
    };
    string().check(StrCheck::Refine(not_blank, msg.into(), true))
}

const KEBAB: &str = r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$";
const ID: &str = r"^[a-z0-9]+(?:-[a-z0-9]+)*$";
const EXPORT: &str = r"^[$A-Z_a-z][$\w]*$";
const PACKAGE_PATH: &str = r"^\.\/(?:[A-Za-z0-9._~@-]+\/)*[A-Za-z0-9._~@-]+$";
const MODULE: &str = r"^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(?:\/[A-Za-z0-9._~-]+)*$";

fn re(src: &'static str, msg: &str) -> StrCheck {
    StrCheck::Regex(src, "u", Some(msg.into()))
}

fn no_dot_segments_after_first(v: &str) -> bool {
    !v.split('/').skip(1).any(|p| p == ".." || p == ".")
}
fn no_dot_segments(v: &str) -> bool {
    !v.split('/').any(|p| p == ".." || p == ".")
}
fn js_module_file(v: &str) -> bool {
    [".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".mts"].iter().any(|e| v.ends_with(e))
}
fn lower_trimmed(w: &str) -> bool {
    w == w.to_lowercase() && w == w.trim()
}

fn package_path() -> Z {
    string()
        .check(re(PACKAGE_PATH, "must be a ./ path inside the package"))
        .check(StrCheck::Refine(no_dot_segments_after_first, "must not contain \".\" or \"..\" segments".into(), false))
}

fn module_schema() -> Z {
    string()
        .check(re(MODULE, "module must be a package import specifier, never a relative or absolute path"))
        .check(StrCheck::Refine(no_dot_segments, "module must not contain \".\" or \"..\" segments".into(), false))
}

fn export_schema() -> Z {
    string().check(re(EXPORT, "export must be a JavaScript identifier"))
}

fn variant_name() -> Z {
    string().check(re(KEBAB, "a variant must be lowercase kebab-case"))
}

fn icon_set_doc_schema() -> Z {
    object(
        vec![
            ("type", lit("icon-set")),
            ("name", non_blank("name").check(re(KEBAB, "name must be lowercase kebab-case starting with a letter"))),
            ("displayName", non_blank("displayName")),
            ("description", string()),
            ("maintained", boolean()),
            ("license", non_blank("license")),
        ],
        Mode::Strict,
    )
}

fn data_schema() -> Z {
    let variant = object(
        vec![("variant", variant_name()), ("export", export_schema()), ("module", opt(module_schema()))],
        Mode::Strict,
    );
    let matched = object(
        vec![
            ("set", string().check(re(KEBAB, "set must be a lower-kebab set name"))),
            ("export", export_schema()),
            ("variant", opt(non_blank("variant"))),
            ("confidence", enum_(&["exact", "strong", "likely"])),
        ],
        Mode::Strict,
    );
    let words = Z::Array {
        item: Box::new(non_blank("word").check(StrCheck::Refine(lower_trimmed, "words must be lower-case and trimmed".into(), false))),
        min: Some(1),
        min_msg: Some("an icon must have at least one word".into()),
        max: None,
    };
    let icon = object(
        vec![
            ("id", string().check(re(ID, "id must be lowercase kebab-case letters and digits"))),
            ("export", export_schema()),
            ("module", opt(module_schema())),
            ("words", words),
            ("variants", opt(array(variant))),
            ("matches", opt(array(matched))),
        ],
        Mode::Strict,
    );
    let source = object(
        vec![("package", non_blank("source.package")), ("version", non_blank("source.version"))],
        Mode::Strict,
    );
    let default = object(vec![("variant", opt(variant_name()))], Mode::Strict);
    let generated = package_path().check(StrCheck::Refine(
        js_module_file,
        "generated must be a JavaScript or TypeScript module file".into(),
        false,
    ));
    let adapter = object(vec![("module", package_path()), ("export", export_schema())], Mode::Strict);
    let map = Z::Record { key: Box::new(string()), value: Box::new(string()), refines: vec![] };
    object(
        vec![
            ("schemaVersion", literal(Value::from(1))),
            ("module", module_schema()),
            ("source", opt(source)),
            ("exclude", opt(array(export_schema()))),
            ("variants", opt(array_min(variant_name(), 1))),
            ("default", opt(default)),
            ("themeMap", opt(export_schema())),
            ("map", opt(map)),
            ("generated", opt(generated)),
            ("adapter", opt(adapter)),
            ("icons", array(icon)),
        ],
        Mode::Strict,
    )
    .refine(Arc::new(data_refine))
}

fn custom(path: Vec<Seg>, message: String) -> Issue {
    Issue { code: "custom", path, message, cont: true }
}

fn key(k: &str) -> Seg {
    Seg::Key(k.to_string())
}

fn data_refine(data: &Value, issues: &mut Vec<Issue>) {
    let declared: Vec<String> = data
        .get("variants")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let check_variant = |variant: Option<&str>, at: Vec<Seg>, issues: &mut Vec<Issue>| {
        if let Some(v) = variant {
            if !declared.iter().any(|d| d == v) {
                let mut p = at;
                p.push(key("variant"));
                issues.push(custom(p, format!("variant \"{v}\" is not in variants")));
            }
        }
    };
    for (at, v) in declared.iter().enumerate() {
        if declared.iter().position(|d| d == v) != Some(at) {
            issues.push(custom(vec![key("variants"), Seg::Index(at)], format!("variant \"{v}\" is listed twice")));
        }
    }
    let default_variant = data.get("default").and_then(|d| d.get("variant")).and_then(|v| v.as_str());
    if data.get("default").is_some_and(|d| d.is_object()) {
        check_variant(default_variant, vec![key("default")], issues);
    }
    let mut ids: Vec<(String, usize)> = Vec::new();
    let icons = data.get("icons").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    for (index, icon) in icons.iter().enumerate() {
        let id = icon.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        match ids.iter().find(|(i, _)| *i == id) {
            Some((_, first)) => issues.push(custom(
                vec![key("icons"), Seg::Index(index), key("id")],
                format!("duplicate id \"{id}\" (also icons.{first})"),
            )),
            None => ids.push((id, index)),
        }
        let mut named: Vec<String> = Vec::new();
        for (at, m) in icon.get("matches").and_then(|v| v.as_array()).cloned().unwrap_or_default().iter().enumerate() {
            let set = m.get("set").and_then(|v| v.as_str()).unwrap_or("");
            let variant = m.get("variant").and_then(|v| v.as_str());
            let export = m.get("export").and_then(|v| v.as_str()).unwrap_or("");
            let k = format!("{set}\0{}\0{export}", variant.unwrap_or(""));
            if named.contains(&k) {
                issues.push(custom(
                    vec![key("icons"), Seg::Index(index), key("matches"), Seg::Index(at)],
                    format!(
                        "the match {set}{} \"{export}\" is listed twice",
                        variant.filter(|v| !v.is_empty()).map(|v| format!(" {v}")).unwrap_or_default()
                    ),
                ));
            }
            named.push(k);
        }
        let mut drawn: Vec<String> = Vec::new();
        for (at, entry) in icon.get("variants").and_then(|v| v.as_array()).cloned().unwrap_or_default().iter().enumerate() {
            let where_ = vec![key("icons"), Seg::Index(index), key("variants"), Seg::Index(at)];
            let v = entry.get("variant").and_then(|x| x.as_str()).unwrap_or("").to_string();
            check_variant(Some(&v), where_.clone(), issues);
            let mut p = where_.clone();
            p.push(key("variant"));
            if Some(v.as_str()) == default_variant {
                issues.push(custom(p, format!("variant \"{v}\" is the default: the icon's own export draws it")));
            } else if drawn.contains(&v) {
                issues.push(custom(p, format!("variant \"{v}\" is listed twice")));
            }
            drawn.push(v);
        }
    }
    if let Some(m) = data.get("map").and_then(|v| v.as_object()) {
        for (name, id) in m {
            let camel = name.chars().next().is_some_and(|c| c.is_ascii_lowercase()) && name.chars().all(|c| c.is_ascii_alphanumeric());
            if !camel {
                issues.push(custom(
                    vec![key("map"), key(name)],
                    format!("\"{name}\" is not an icon definition name: definitions are camelCase"),
                ));
            }
            let id = id.as_str().unwrap_or("");
            if !ids.iter().any(|(i, _)| i == id) {
                issues.push(custom(vec![key("map"), key(name)], format!("\"{id}\" is not the id of an icon in this file")));
            }
        }
    }
}

/// `parseIconSet(input, label)`.
pub fn parse_icon_set(input: &Value, label: &str) -> Result<Value, String> {
    let r = zod::safe_parse(&icon_set_doc_schema(), input);
    let proto = input.as_object().is_some_and(|m| m.contains_key("__proto__"));
    match r {
        Ok(v) if !proto => Ok(v),
        r => {
            let mut issues = r.err().unwrap_or_default();
            if proto {
                issues.push(Issue {
                    code: "unrecognized_keys",
                    path: vec![],
                    message: "Unrecognized key: \"__proto__\"".into(),
                    cont: false,
                });
            }
            Err(format_zod_error(label, &issues))
        }
    }
}

/// `parseIconSetData(input, label)`.
pub fn parse_icon_set_data(input: &Value, label: &str) -> Result<Value, String> {
    zod::safe_parse(&data_schema(), input).map_err(|issues| format_zod_error(label, &issues))
}

// ── Discovery ───────────────────────────────────────────────────────────

fn is_ignored_entry(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules" || name == "CVS" || name == "npm-debug.log" || name.ends_with(".orig")
}

/// `discoverIconSetDirectory(root, owner)`: sets, and (name, message) errors.
pub fn discover_icon_set_directory(root: &str, owner: &str) -> (Vec<DiscoveredIconSet>, Vec<(String, String)>) {
    let mut sets = Vec::new();
    let mut errors = Vec::new();
    let Some(mut entries) = np::read_dir(root) else { return (sets, errors) };
    entries.sort_by(|a, b| super::jsort::locale_compare(&a.name, &b.name));
    for e in entries {
        if is_ignored_entry(&e.name) || !e.is_dir || !is_kebab(&e.name) {
            continue;
        }
        match read_icon_set(root, &e.name, owner) {
            Ok(s) => sets.push(s),
            Err(m) => errors.push((e.name.clone(), m)),
        }
    }
    (sets, errors)
}

fn read_icon_set(root: &str, name: &str, owner: &str) -> Result<DiscoveredIconSet, String> {
    let dir = integ::assert_within(name, root, "icon set directory")?;
    let doc_path = np::join2(&dir, &format!("{name}.doc.mjs"));
    let data_path = np::join2(&dir, &format!("{name}.icons.json"));
    let label = format!("Icon set \"{name}\" in {owner}");
    for (file, what) in [(&doc_path, "descriptor"), (&data_path, "data file")] {
        match std::fs::symlink_metadata(file) {
            Err(_) => return Err(format!("{label} has no {what}: add {} to its directory.", np::basename(file))),
            Ok(m) if !m.is_file() => {
                return Err(format!("{label}: {} must be a regular file inside the set directory.", np::basename(file)))
            }
            _ => {}
        }
    }
    let raw_doc = crate::commands::theme::descriptor::read_static_descriptor_value(
        &doc_path,
        &format!("{label} descriptor"),
        "IconSetDoc",
        false,
    )?;
    let doc = parse_icon_set(&raw_doc, &format!("{label} descriptor"))?;
    let doc_name = doc.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if doc_name != name {
        return Err(format!(
            "{label}: the descriptor names \"{doc_name}\", but a set's name must equal its directory name."
        ));
    }
    let text = std::fs::read_to_string(&data_path).map_err(|e| e.to_string())?;
    let raw: Value = match super::nodepath::parse_json(&text) {
        Some(v) => v,
        None => {
            return Err(format!("{label}: {name}.icons.json is not valid JSON: {}", json_error_message(&text)));
        }
    };
    let data = parse_icon_set_data(&raw, &format!("{label} data file"))?;
    for icon in data.get("icons").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        for m in icon.get("matches").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
            if m.get("set").and_then(|v| v.as_str()) == Some(name) {
                return Err(format!(
                    "{label} data file is invalid: icon \"{}\" has a match that names this set itself; a match names an icon in another set.",
                    icon.get("id").and_then(|v| v.as_str()).unwrap_or("")
                ));
            }
        }
    }
    let own = defs::read_definitions_dir(&np::join2(&dir, "definitions"), owner);
    if !own.errors.is_empty() {
        return Err(format!("{label}: {}", own.errors.iter().map(|e| e.1.clone()).collect::<Vec<_>>().join(" ")));
    }
    let astryx = defs::astryx_definitions_by_name();
    if let Some(m) = data.get("map").and_then(|v| v.as_object()) {
        for (dname, id) in m {
            if astryx.iter().any(|(n, _)| n == dname) || own.definitions.iter().any(|d| d.name() == dname) {
                continue;
            }
            return Err(format!(
                "{label} data file is invalid: map \"{dname}\" (icon \"{}\") is not an icon definition. Declare it in definitions/{dname}.doc.mjs, or use an Astryx icon definition (astryx docs cli/experimental/icon-definitions).",
                id.as_str().unwrap_or("")
            ));
        }
    }
    let mut notices: Vec<String> = np::read_dir(&dir)
        .unwrap_or_default()
        .into_iter()
        .filter(|e| e.is_file && is_notice_file(&e.name))
        .map(|e| e.name)
        .collect();
    notices.sort_by(|a, b| super::jsort::cmp_utf16(a, b));
    let gs = |k: &str| doc.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    Ok(DiscoveredIconSet {
        name: name.to_string(),
        display_name: gs("displayName"),
        description: gs("description"),
        maintained: doc.get("maintained").and_then(|v| v.as_bool()).unwrap_or(false),
        license: gs("license"),
        package: owner.to_string(),
        package_dir: None,
        dir,
        doc_path,
        data_path,
        data,
        notices,
        definitions: own.definitions,
        module_file: None,
    })
}

/// V8's `JSON.parse` message for invalid text (the common cases).
pub fn json_error_message(text: &str) -> String {
    match serde_json::from_str::<serde_json::Value>(text) {
        Ok(_) => String::new(),
        Err(e) => {
            if text.trim().is_empty() {
                return "Unexpected end of JSON input".into();
            }
            // Position as a character offset into the text.
            let line = e.line();
            let col = e.column();
            let mut pos = 0usize;
            for (i, l) in text.split('\n').enumerate() {
                if i + 1 == line {
                    pos += col.saturating_sub(1);
                    break;
                }
                pos += l.chars().count() + 1;
            }
            let ch = text.chars().nth(pos);
            match ch {
                None => "Unexpected end of JSON input".into(),
                Some(c) => format!("Unexpected token '{c}', \"{}\" is not valid JSON", snippet(text)),
            }
        }
    }
}

fn snippet(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= 10 {
        text.to_string()
    } else {
        format!("{}...", chars[..10].iter().collect::<String>())
    }
}

/// `definitionsByIcon(data)`: definition names by icon id, in map order.
pub fn definitions_by_icon(data: &Value) -> Vec<(String, Vec<String>)> {
    let mut out: Vec<(String, Vec<String>)> = Vec::new();
    if let Some(m) = data.get("map").and_then(|m| m.as_object()) {
        for (name, id) in m {
            let id = id.as_str().unwrap_or("").to_string();
            match out.iter_mut().find(|(i, _)| *i == id) {
                Some((_, l)) => l.push(name.clone()),
                None => out.push((id, vec![name.clone()])),
            }
        }
    }
    out
}

/// `splitSpecifier(specifier)`: (name, subpath).
pub fn split_specifier(spec: &str) -> (String, String) {
    let parts: Vec<&str> = spec.split('/').collect();
    let count = if spec.starts_with('@') { 2 } else { 1 };
    let name = parts.iter().take(count).cloned().collect::<Vec<_>>().join("/");
    let rest = parts.iter().skip(count).cloned().collect::<Vec<_>>().join("/");
    (name, if rest.is_empty() { ".".into() } else { format!("./{rest}") })
}

fn legacy_root_entry(package_dir: &str, pkg: &Value) -> Option<String> {
    let mut candidates: Vec<String> = Vec::new();
    for k in ["module", "main"] {
        if let Some(s) = pkg.get(k).and_then(|v| v.as_str()) {
            candidates.push(s.to_string());
        }
    }
    candidates.extend(["index.js", "index.mjs", "index.ts"].map(String::from));
    for c in candidates {
        for f in [c.clone(), format!("{c}.js"), format!("{c}.mjs")] {
            if let Ok(resolved) = integ::assert_within(&f, package_dir, "package entry") {
                if np::is_file(&resolved) {
                    return Some(resolved);
                }
            }
        }
    }
    None
}

/// `resolveIconModule(specifier, fromDir, self)`.
pub fn resolve_icon_module(spec: &str, from_dir: &str, self_name: Option<&str>, self_dir: Option<&str>) -> Option<String> {
    let (name, subpath) = split_specifier(spec);
    let package_dir = match (self_name, self_dir) {
        (Some(n), Some(d)) if n == name => d.to_string(),
        _ => super::paths::find_installed_package(from_dir, &name, usize::MAX)?,
    };
    let pkg = np::read_json(&np::join2(&package_dir, "package.json"))?;
    if pkg.get("exports").is_none() && subpath == "." {
        return legacy_root_entry(&package_dir, &pkg);
    }
    let pkg_name = pkg.get("name").and_then(|v| v.as_str()).unwrap_or("");
    super::package_exports::inspect_package_export(pkg_name, pkg.get("exports"), np::p(&package_dir), &subpath)
        .target
        .map(|t| t.to_string_lossy().to_string())
}

/// `discoverIntegrationIconSets(integration, {projectDir})`, over a loaded
/// integration record (JS field names).
pub fn discover_integration_icon_sets(integration: &Record, project_dir: &str) -> (Vec<DiscoveredIconSet>, Vec<WithdrawnIconSet>) {
    let mut sets = Vec::new();
    let mut withdrawn = Vec::new();
    let Some(root) = integ::s(integration, "iconSets").filter(|s| !s.is_empty()) else { return (sets, withdrawn) };
    let name = integ::s(integration, "name").unwrap_or("").to_string();
    let package_dir = integ::s(integration, "__packageDir").map(String::from);
    let (found, errors) = discover_icon_set_directory(root, &name);
    for (n, m) in errors {
        withdrawn.push(WithdrawnIconSet { name: n, package: name.clone(), kind: "invalid", reason: m });
    }
    for mut set in found {
        let module = set.data.get("module").and_then(|v| v.as_str()).unwrap_or("").to_string();
        match resolve_icon_module(&module, project_dir, Some(&name), package_dir.as_deref()) {
            None => withdrawn.push(WithdrawnIconSet {
                name: set.name.clone(),
                package: name.clone(),
                kind: "unresolved",
                reason: format!(
                    "Icon set \"{}\" in {name}: its module \"{module}\" does not resolve from the project. Install it, or fix \"module\" in {}.icons.json.",
                    set.name, set.name
                ),
            }),
            Some(file) => {
                set.package_dir = package_dir.clone();
                set.module_file = Some(file);
                sets.push(set);
            }
        }
    }
    (sets, withdrawn)
}

/// `withdrawnNamed(withdrawn, selector)`.
pub fn withdrawn_named<'a>(withdrawn: &'a [WithdrawnIconSet], selector: &str) -> Vec<&'a WithdrawnIconSet> {
    let exact: Vec<&WithdrawnIconSet> =
        withdrawn.iter().filter(|w| format!("{}/{}", w.package, w.name) == selector).collect();
    if !exact.is_empty() {
        exact
    } else {
        withdrawn.iter().filter(|w| w.name == selector).collect()
    }
}

/// `chooseProjectIconSet(sets, configured, withdrawn)`.
pub fn choose_project_icon_set(sets: &[DiscoveredIconSet], configured: Option<&str>, withdrawn: &[WithdrawnIconSet]) -> IconSetChoice {
    if let Some(c) = configured.filter(|c| !c.is_empty()) {
        let exact: Vec<usize> = (0..sets.len()).filter(|&i| sets[i].key() == c).collect();
        let by_name: Vec<usize> =
            if !exact.is_empty() { exact } else { (0..sets.len()).filter(|&i| sets[i].name == c).collect() };
        let configured = Some(c.to_string());
        if by_name.len() == 1 {
            return IconSetChoice { status: "selected", set: Some(by_name[0]), configured, reason: format!("experimental.iconSet names \"{c}\".") };
        }
        if by_name.len() > 1 {
            return IconSetChoice {
                status: "ambiguous",
                set: None,
                configured,
                reason: format!(
                    "experimental.iconSet \"{c}\" names a set in {}; write it as \"<package>/<set>\".",
                    by_name.iter().map(|&i| sets[i].package.clone()).collect::<Vec<_>>().join(" and ")
                ),
            };
        }
        let gone = withdrawn_named(withdrawn, c);
        if !gone.is_empty() {
            return IconSetChoice {
                status: "withdrawn",
                set: None,
                configured,
                reason: format!(
                    "experimental.iconSet names \"{c}\", which is installed but withdrawn: {}",
                    gone.iter().map(|w| w.reason.clone()).collect::<Vec<_>>().join(" ")
                ),
            };
        }
        let installed = if sets.is_empty() {
            String::new()
        } else {
            format!(" (installed: {})", sets.iter().map(|s| s.key()).collect::<Vec<_>>().join(", "))
        };
        return IconSetChoice {
            status: "missing",
            set: None,
            configured,
            reason: format!("experimental.iconSet names \"{c}\", but no installed set has that name{installed}."),
        };
    }
    match sets.len() {
        1 => IconSetChoice {
            status: "selected",
            set: Some(0),
            configured: None,
            reason: format!("\"{}\" is the only installed icon set.", sets[0].key()),
        },
        0 => IconSetChoice { status: "none", set: None, configured: None, reason: "No icon set is installed.".into() },
        n => IconSetChoice {
            status: "ambiguous",
            set: None,
            configured: None,
            reason: format!(
                "{n} icon sets are installed ({}) and astryx.config sets no experimental.iconSet.",
                sets.iter().map(|s| s.key()).collect::<Vec<_>>().join(", ")
            ),
        },
    }
}

/// `orderIconSets(sets, choice)`: the project's set first. The choice's
/// index is updated to 0 when it moves.
pub fn order_icon_sets(mut sets: Vec<DiscoveredIconSet>, choice: &mut IconSetChoice) -> Vec<DiscoveredIconSet> {
    if let Some(i) = choice.set {
        let first = sets.remove(i);
        sets.insert(0, first);
        choice.set = Some(0);
    }
    sets
}

/// `project.iconSets({experimental: true})` over a loaded project: every
/// loaded integration's sets (skipping failed loads and provider
/// conflicts), the withdrawn ones, and the project's choice. Issues the JS
/// Project collects go to `issues` as (package label, message).
pub fn project_icon_sets(project: &super::project::Project) -> (Vec<DiscoveredIconSet>, Vec<WithdrawnIconSet>, IconSetChoice) {
    let project_dir = super::paths::find_package_root(&project.cwd).unwrap_or_else(|| project.cwd.clone());
    let mut sets = Vec::new();
    let mut withdrawn = Vec::new();
    for r in &project.loaded_integrations {
        if !integ::has(r, "iconSets") || integ::has(r, "__loadError") || integ::has(r, "__providerConflict") {
            continue;
        }
        let (s, w) = discover_integration_icon_sets(r, &project_dir);
        sets.extend(s);
        withdrawn.extend(w);
    }
    let configured = project
        .config
        .get("experimental")
        .and_then(|e| e.get("iconSet"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let mut choice = choose_project_icon_set(&sets, configured.as_deref(), &withdrawn);
    let sets = order_icon_sets(sets, &mut choice);
    (sets, withdrawn, choice)
}

/// A set as a JSON object with the JS field names (for callers that keep
/// records as maps).
pub fn set_to_json(s: &DiscoveredIconSet) -> Value {
    let mut m = Map::new();
    m.insert("name".into(), Value::String(s.name.clone()));
    m.insert("displayName".into(), Value::String(s.display_name.clone()));
    m.insert("description".into(), Value::String(s.description.clone()));
    m.insert("maintained".into(), Value::Bool(s.maintained));
    m.insert("license".into(), Value::String(s.license.clone()));
    m.insert("package".into(), Value::String(s.package.clone()));
    if let Some(d) = &s.package_dir {
        m.insert("packageDir".into(), Value::String(d.clone()));
    }
    m.insert("dir".into(), Value::String(s.dir.clone()));
    m.insert("docPath".into(), Value::String(s.doc_path.clone()));
    m.insert("dataPath".into(), Value::String(s.data_path.clone()));
    m.insert("data".into(), s.data.clone());
    m.insert("notices".into(), Value::Array(s.notices.iter().cloned().map(Value::String).collect()));
    m.insert(
        "definitions".into(),
        Value::Array(
            s.definitions
                .iter()
                .map(|d| {
                    let mut dm = Map::new();
                    dm.insert("doc".into(), d.doc.clone());
                    dm.insert("file".into(), Value::String(d.file.clone()));
                    dm.insert("package".into(), Value::String(d.package.clone()));
                    Value::Object(dm)
                })
                .collect(),
        ),
    );
    if let Some(f) = &s.module_file {
        m.insert("moduleFile".into(), Value::String(f.clone()));
    }
    Value::Object(m)
}
