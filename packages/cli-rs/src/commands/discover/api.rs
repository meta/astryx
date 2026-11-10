//! `discover()` and its leaves: list, detail, item, doc, search. Each
//! response is the JSON object the JS API returns (`{type, package?, data,
//! meta?}`), so `--json` and the text projection read the same value.

use super::env::{nearest_manifest, Env};
use super::model::*;
use super::sources::{call_sources, has_sources, official_list, read_kinds, OfficialList, Request, DEPENDENCY_FIELDS};
use super::util::{js_sort_by, levenshtein, locale_compare, lower, ord_to_num};
use crate::json::{Map, Value};
use std::collections::{HashMap, HashSet};

const DEFAULT_LIMIT: usize = 20;

#[derive(Default, Clone)]
pub struct Options {
    pub components: bool,
    pub type_: Option<String>,
    pub installed: bool,
    pub available: bool,
    /// `Number(options.limit)`: None when not given.
    pub limit: Option<f64>,
    /// The raw `--limit` text, for the error message.
    pub limit_raw: Option<String>,
    pub lang: Option<String>,
    pub zh: bool,
}

struct Target {
    scoped: bool,
    name: String,
    version: Option<String>,
    item: Option<String>,
}

fn idx16(s: &str, pat: char, from: usize) -> Option<usize> {
    // byte index search; inputs are compared by char so byte offsets are fine
    s.get(from..).and_then(|r| r.find(pat)).map(|i| i + from)
}

fn split_target(query: &str) -> Target {
    let scoped = query.starts_with('@');
    let first = query.find('/');
    let split = if scoped {
        match first {
            None => None,
            Some(f) => idx16(query, '/', f + 1),
        }
    } else {
        first
    };
    let mut head = query;
    let mut rest: Option<String> = None;
    if let Some(s) = split {
        if s > 0 {
            head = &query[..s];
            let r = &query[s + 1..];
            rest = if r.is_empty() { None } else { Some(r.to_string()) };
        }
    }
    let first = head.chars().next().map(|c| c.len_utf8()).unwrap_or(0);
    let at = head[first..].find('@').map(|i| i + first);
    let (name, version) = match at {
        Some(a) => {
            let v = &head[a + 1..];
            (head[..a].to_string(), if v.is_empty() { None } else { Some(v.to_string()) })
        }
        None => (head.to_string(), None),
    };
    // A first char that is a multi-byte char: `indexOf('@', 1)` starts at UTF-16
    // unit 1; for '@'-led names the first char is ASCII so byte 1 is right.
    Target { scoped, name, version, item: rest }
}

pub fn check_options(o: &Options, kinds: &[&str]) -> DResult<()> {
    if let Some(t) = &o.type_ {
        if !kinds.contains(&t.as_str()) {
            return Err(DiscoverError::new(
                format!("Unknown --type \"{t}\""),
                kinds.iter().map(|k| (k.to_string(), "item kind".to_string())).collect(),
                "ERR_INVALID_OPTION",
            ));
        }
    }
    if o.installed && o.available {
        return Err(DiscoverError::new(
            "--installed and --available cannot be used together",
            vec![],
            "ERR_INVALID_OPTION",
        ));
    }
    if let Some(n) = o.limit {
        if !(n.is_finite() && n.fract() == 0.0 && n > 0.0) {
            return Err(DiscoverError::new(
                format!("--limit must be a positive integer, not \"{}\"", crate::json::js_number_to_string(n)),
                vec![],
                "ERR_INVALID_OPTION",
            ));
        }
    }
    Ok(())
}

pub struct Declarations {
    pub dependency: Vec<(String, String)>,
    pub any: HashSet<String>,
}

impl Declarations {
    fn dependency_get(&self, name: &str) -> Option<&String> {
        self.dependency.iter().find(|(r, _)| r == name).map(|(_, l)| l)
    }
}

fn declared_package(name: &str, spec: &Value) -> String {
    let Value::String(s) = spec else { return name.to_string() };
    let Some(target) = s.strip_prefix("npm:") else { return name.to_string() };
    match target.get(1..).and_then(|r| r.find('@')) {
        Some(i) => target[..i + 1].to_string(),
        None => target.to_string(),
    }
}

fn official_declarations(env: &Env, official: &[CatalogPackage]) -> Declarations {
    let names: HashSet<&str> = official.iter().map(|p| p.package.as_str()).collect();
    let mut d = Declarations { dependency: vec![], any: HashSet::new() };
    let Some((_, pkg)) = nearest_manifest(&env.project_cwd()) else { return d };
    for field in DEPENDENCY_FIELDS {
        let Some(Value::Object(deps)) = pkg.get(field) else { continue };
        for (local, spec) in deps {
            let real = declared_package(local, spec);
            if !names.contains(real.as_str()) {
                continue;
            }
            d.any.insert(real.clone());
            if field != "peerDependencies" && d.dependency_get(&real).is_none() {
                d.dependency.push((real, local.clone()));
            }
        }
    }
    d
}

fn declared_dependencies(env: &Env) -> HashSet<String> {
    let mut names = HashSet::new();
    let Some(p) = &env.project else { return names };
    let Ok(text) = std::fs::read_to_string(p.cwd.join("package.json")) else { return names };
    let Ok(pkg) = serde_json::from_str::<Value>(&text) else { return names };
    for field in DEPENDENCY_FIELDS {
        if let Some(Value::Object(deps)) = pkg.get(field) {
            for k in deps.keys() {
                names.insert(k.clone());
            }
        }
    }
    names
}

/// `addCommand(project, {official})`.
fn add_command(env: &Env, name: &str, version: Option<&str>, official: Option<&[CatalogPackage]>) -> String {
    let verb = &env.add_verb;
    if let Some(v) = version {
        return format!("{verb} {name}@{v}");
    }
    let pin = official.and_then(|o| o.iter().find(|p| p.package == name)).and_then(|p| p.pin.clone());
    match pin {
        None => format!("{verb} {name}"),
        Some(pin) if super::util::is_valid_semver(&pin) => format!("{verb} {name}@{pin}"),
        Some(pin) => format!("{verb} \"{name}@{pin}\""),
    }
}

fn official_first<T>(items: Vec<T>, official: &[CatalogPackage], name_of: impl Fn(&T) -> &str) -> Vec<T> {
    let order: HashMap<&str, usize> = official.iter().enumerate().map(|(i, p)| (p.package.as_str(), i)).collect();
    let n = order.len();
    let mut v = items;
    let rank = |x: &T| *order.get(name_of(x)).unwrap_or(&n);
    v.sort_by_key(|x| rank(x));
    v
}

/// `describeInstalled(project, scanned)`.
fn describe_installed(env: &Env) -> (Vec<InstalledPackage>, bool) {
    let Some(project) = &env.project else { return (vec![], false) };
    let configured = !project.integrations.is_empty();
    let mut out = vec![];
    let mut seen_scanned: HashSet<String> = HashSet::new();
    for i in &project.integrations {
        if i.load_error.is_some() {
            continue;
        }
        let mut components = vec![];
        let mut docs_dir = None;
        if let Some(dir) = &i.components_dir {
            // scanAllPackages: first explicit package per name with components.
            if !seen_scanned.contains(&i.name) {
                let comps = super::scan::discover_doc_components(dir);
                if !comps.is_empty() {
                    seen_scanned.insert(i.name.clone());
                    components = comps;
                    docs_dir = Some(dir.clone());
                }
            }
        }
        out.push(InstalledPackage {
            name: i.name.clone(),
            category: i.name.clone(),
            version: i.version.clone(),
            description: None,
            display_name: None,
            docs_dir,
            components,
            lists: vec![
                ("templates".into(), i.templates.clone()),
                ("docs".into(), i.docs.clone()),
                ("themes".into(), i.themes.clone()),
                ("codemods".into(), i.codemods.clone()),
                ("iconSets".into(), i.icon_sets.iter().map(|s| s.name.clone()).collect()),
            ],
            icon_set_details: i.icon_sets.clone(),
            withdrawn_icon_sets: i.withdrawn_icon_sets.clone(),
            latest: None,
            declared_official: false,
        });
    }
    (out, configured)
}

fn item_lists(contributions: &[Contribution]) -> Vec<(String, Vec<String>)> {
    let mut lists = vec![];
    for (kind, field) in KIND_FIELDS.iter().skip(1) {
        let names: Vec<String> = contributions.iter().filter(|c| c.kind == *kind).map(|c| c.name.clone()).collect();
        if !names.is_empty() {
            lists.push((field.to_string(), names));
        }
    }
    lists
}

fn with_declared_official(
    env: &Env,
    installed: &[InstalledPackage],
    catalog: &CatalogResult,
    declared: &Declarations,
    official: &[CatalogPackage],
) -> Vec<InstalledPackage> {
    let loaded: HashSet<&str> = env
        .project
        .as_ref()
        .map(|p| p.integrations.iter().map(|i| i.name.as_str()).collect())
        .unwrap_or_default();
    let mut all: Vec<InstalledPackage> = installed.to_vec();
    for pkg in &catalog.packages {
        let Some(local) = declared.dependency_get(&pkg.package) else { continue };
        if !pkg.official || loaded.contains(pkg.package.as_str()) {
            continue;
        }
        let components: Vec<String> =
            pkg.contributions.iter().filter(|c| c.kind == "component").map(|c| c.name.clone()).collect();
        all.push(InstalledPackage {
            name: pkg.package.clone(),
            category: pkg.package.clone(),
            version: env.installed_version(local),
            description: pkg.description.clone(),
            components,
            lists: item_lists(&pkg.contributions),
            declared_official: true,
            ..Default::default()
        });
    }
    official_first(all, official, |p| p.name.as_str())
}

/// `catalogState`.
fn catalog_state(
    pkg: &CatalogPackage,
    installed: &HashSet<String>,
    declared: &HashSet<String>,
    official_declared: Option<&HashSet<String>>,
) -> (&'static str, Option<String>) {
    if installed.contains(&pkg.package) {
        return ("installed", None);
    }
    let set = match (pkg.official, official_declared) {
        (true, Some(o)) => o,
        _ => declared,
    };
    if set.contains(&pkg.package) {
        return ("declared", None);
    }
    if let Some(a) = pkg.aliases.iter().find(|n| installed.contains(*n) || declared.contains(*n)) {
        return ("alias", Some(a.clone()));
    }
    ("available", None)
}

fn default_version(pkg: &CatalogPackage) -> Option<String> {
    pkg.latest.clone().or_else(|| pkg.versions.first().map(|v| v.version.clone()))
}

/// `catalogEntry(pkg, version)`.
fn catalog_entry(pkg: &CatalogPackage, version: Option<&str>, with_category: bool) -> Map<String, Value> {
    let mut e = Map::new();
    e.insert("name".into(), pkg.package.clone().into());
    e.insert("package".into(), pkg.package.clone().into());
    if with_category {
        e.insert("category".into(), pkg.package.clone().into());
    }
    let comps: Vec<String> = pkg.contributions.iter().filter(|c| c.kind == "component").map(|c| c.name.clone()).collect();
    e.insert("components".into(), strs(&comps));
    if let Some(v) = version {
        if !v.is_empty() {
            e.insert("version".into(), v.into());
        }
    }
    if let Some(d) = &pkg.description {
        if !d.is_empty() {
            e.insert("description".into(), d.clone().into());
        }
    }
    for (f, names) in item_lists(&pkg.contributions) {
        e.insert(f, strs(&names));
    }
    e
}

fn installed_names(pkgs: &[InstalledPackage]) -> HashSet<String> {
    pkgs.iter().map(|p| p.name.clone()).collect()
}

fn has_kind(entry: &Map<String, Value>, kind: &str) -> bool {
    field_of(kind)
        .and_then(|f| entry.get(f))
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false)
}

pub struct Ctx<'a> {
    env: &'a Env,
    official: OfficialList,
    declarations: Declarations,
    declared: HashSet<String>,
    integrations: Vec<InstalledPackage>,
}

impl<'a> Ctx<'a> {
    fn catalog_for(&self, req: &Request) -> CatalogResult {
        call_sources(self.env, req, &self.official)
    }
    fn installed_for(&self, catalog: &CatalogResult) -> Vec<InstalledPackage> {
        with_declared_official(self.env, &self.integrations, catalog, &self.declarations, &self.official.packages)
    }
    fn install_for(&self, pkg: &CatalogPackage) -> String {
        if pkg.official {
            add_command(self.env, &pkg.package, None, Some(&self.official.packages))
        } else {
            add_command(self.env, &pkg.package, None, None)
        }
    }
}

/// `discover(query, options)`.
pub fn discover(env: &Env, query: Option<&str>, options: &Options) -> DResult<Value> {
    check_options(options, &kinds_for_check(Some(env), options))?;
    let only = if options.installed {
        Some("installed")
    } else if options.available {
        Some("available")
    } else {
        None
    };
    let (integrations, configured) = describe_installed(env);
    let declared = declared_dependencies(env);
    let official = official_list(env);
    let declarations = official_declarations(env, &official.packages);
    let ctx = Ctx { env, official, declarations, declared, integrations };

    let query = query.filter(|q| !q.is_empty());
    if query.is_none() || (ctx.integrations.is_empty() && !has_sources(env)) {
        let catalog = ctx.catalog_for(&Request::default());
        let packages = ctx.installed_for(&catalog);
        let computer = computer_available_entries(env, &packages, &ctx.declared);
        let from_sources = official_first(
            available_entries(&ctx, &catalog, &packages),
            &ctx.official.packages,
            |e| e.get("name").and_then(|v| v.as_str()).unwrap_or(""),
        );
        let named: HashSet<String> =
            from_sources.iter().filter_map(|e| e.get("name").and_then(|v| v.as_str()).map(String::from)).collect();
        let mut available = from_sources;
        for c in computer {
            if !named.contains(c.get("name").and_then(|v| v.as_str()).unwrap_or("")) {
                available.push(c);
            }
        }
        return Ok(list(with_latest(packages, &catalog), configured, available, &catalog.sources, options.type_.as_deref(), only));
    }
    let query = query.unwrap();
    let target = split_target(query);

    let installed_pkg = ctx.integrations.iter().find(|p| p.name == target.name).cloned();
    if let (Some(pkg), Some(item), None) = (&installed_pkg, &target.item, &target.version) {
        if let Some(found) = super::scan::find_component(std::slice::from_ref(pkg), item) {
            return super::doc::doc_from_result(env, &found, options);
        }
    }
    if target.scoped {
        let catalog = ctx.catalog_for(&Request { package: Some(target.name.clone()), version: target.version.clone() });
        return package_view(&ctx, &target, &catalog, options);
    }
    let listing = ctx.catalog_for(&Request::default());
    let is_package = installed_pkg.is_some() || listing.packages.iter().any(|p| p.package == target.name);
    if is_package && (target.version.is_some() || target.item.is_some() || target.name == query) {
        let catalog = ctx.catalog_for(&Request { package: Some(target.name.clone()), version: target.version.clone() });
        return package_view(&ctx, &target, &catalog, options);
    }
    let packages = ctx.installed_for(&listing);
    let items = search_items(&packages, &listing, &ctx.declared, Some(&ctx.declarations.any));
    let limit = options.limit.map(|n| n as usize).unwrap_or(DEFAULT_LIMIT);
    search(&packages, query, items, options.type_.as_deref(), only, limit)
}

fn computer_available_entries(env: &Env, installed: &[InstalledPackage], declared: &HashSet<String>) -> Vec<Map<String, Value>> {
    if env.outside_project {
        return vec![];
    }
    let mut have: HashSet<String> = installed.iter().map(|p| p.name.clone()).collect();
    have.extend(declared.iter().cloned());
    let have: Vec<String> = have.into_iter().collect();
    crate::discovery::integrations::available_computer_integrations(&env.cwd.to_string_lossy(), &have)
        .iter()
        .map(|c| {
            let mut m = Map::new();
            m.insert("name".into(), c.name.clone().into());
            m.insert("package".into(), c.name.clone().into());
            m.insert("components".into(), Value::Array(vec![]));
            opt(&mut m, "version", &c.version);
            opt(&mut m, "description", &c.description);
            m.insert("source".into(), "installed for this computer".into());
            if let Some(verb) = &env.project_add_verb {
                m.insert("install".into(), format!("{verb} {}", c.name).into());
            }
            m
        })
        .collect()
}

fn available_entries(ctx: &Ctx, catalog: &CatalogResult, installed: &[InstalledPackage]) -> Vec<Map<String, Value>> {
    let names = installed_names(installed);
    let mut integrations: HashSet<String> = HashSet::new();
    let mut out = vec![];
    for pkg in &catalog.packages {
        if catalog_state(pkg, &names, &ctx.declared, Some(&ctx.declarations.any)).0 != "available" {
            continue;
        }
        if !integrations.insert(pkg.integration.clone()) {
            continue;
        }
        let v = default_version(pkg);
        let mut e = catalog_entry(pkg, v.as_deref(), false);
        if !pkg.aliases.is_empty() {
            e.insert("aliases".into(), strs(&pkg.aliases));
        }
        e.insert("source".into(), pkg.source.clone().into());
        e.insert("install".into(), ctx.install_for(pkg).into());
        out.push(e);
    }
    out
}

fn with_latest(installed: Vec<InstalledPackage>, catalog: &CatalogResult) -> Vec<InstalledPackage> {
    installed
        .into_iter()
        .map(|mut p| {
            // `new Map(...)`: the last entry per name wins.
            if let Some(c) = catalog.packages.iter().rev().find(|c| c.package == p.name) {
                if let Some(l) = &c.latest {
                    if !l.is_empty() {
                        p.latest = Some(l.clone());
                    }
                }
            }
            p
        })
        .collect()
}

fn list(
    packages: Vec<InstalledPackage>,
    configured: bool,
    available: Vec<Map<String, Value>>,
    sources: &[SourceState],
    type_: Option<&str>,
    only: Option<&str>,
) -> Value {
    let keep = |e: &Map<String, Value>| type_.map(|t| has_kind(e, t)).unwrap_or(true);
    let shown: Vec<&InstalledPackage> = if only == Some("available") {
        vec![]
    } else {
        packages.iter().filter(|p| keep(&to_entry(p))).collect()
    };
    let data: Vec<Value> = shown.iter().map(|p| Value::Object(to_entry(p))).collect();
    let mut meta = Map::new();
    if !shown.iter().any(|p| !p.declared_official) {
        meta.insert("configured".into(), configured.into());
    }
    let avail: Vec<Value> = if only == Some("installed") {
        vec![]
    } else {
        available.into_iter().filter(|e| keep(e)).map(Value::Object).collect()
    };
    meta.insert("available".into(), Value::Array(avail));
    meta.insert("sources".into(), Value::Array(sources.iter().map(|s| s.to_json()).collect()));
    let mut r = Map::new();
    r.insert("type".into(), "discover.list".into());
    r.insert("data".into(), Value::Array(data));
    r.insert("meta".into(), Value::Object(meta));
    Value::Object(r)
}

fn similar_items(entry: &CatalogPackage, wanted: &str) -> Vec<(String, String)> {
    let low = lower(wanted);
    let mut names: Vec<String> = vec![];
    for c in &entry.contributions {
        if !names.contains(&c.name) {
            names.push(c.name.clone());
        }
    }
    let hits: Vec<String> = names.iter().filter(|n| lower(n).contains(&low)).cloned().collect();
    let picked: Vec<String> = if !hits.is_empty() {
        hits.into_iter().take(5).collect()
    } else {
        let mut m: Vec<(String, usize)> =
            names.iter().map(|n| (n.clone(), levenshtein(&low, &lower(n)))).filter(|(_, d)| *d <= 3).collect();
        m.sort_by_key(|(_, d)| *d);
        m.into_iter().take(5).map(|(n, _)| n).collect()
    };
    picked.into_iter().map(|n| (format!("{}/{}", entry.package, n), "similar name".into())).collect()
}

fn package_view(ctx: &Ctx, target: &Target, catalog: &CatalogResult, options: &Options) -> DResult<Value> {
    let packages = ctx.installed_for(catalog);
    let names = installed_names(&packages);
    let entry = catalog.packages.iter().find(|p| p.package == target.name);
    let installed_as = entry.and_then(|e| catalog_state(e, &names, &ctx.declared, Some(&ctx.declarations.any)).1);
    let is_integration = ctx.integrations.iter().any(|p| p.name == target.name);
    let official_only = entry.map(|e| e.official).unwrap_or(false) && !is_integration;
    if let (true, Some(v), Some(entry)) = (official_only, &target.version, entry) {
        let local = packages.iter().find(|p| p.name == target.name).and_then(|p| p.version.clone());
        if Some(v) != local.as_ref() && !entry.versions.iter().any(|x| &x.version == v) {
            let known = if !entry.versions.is_empty() {
                format!("it knows {}", entry.versions.iter().map(|x| x.version.clone()).collect::<Vec<_>>().join(", "))
            } else {
                "it knows no version of it for this project".to_string()
            };
            let mut vs: Vec<String> = vec![];
            for x in entry.versions.iter().map(|x| Some(x.version.clone())).chain([local.clone()]).flatten() {
                if !vs.contains(&x) {
                    vs.push(x);
                }
            }
            return Err(DiscoverError::new(
                format!(
                    "{}@{} is not a version discover knows here: {known}. Other versions are on the package registry.",
                    target.name, v
                ),
                vs.into_iter().map(|x| (format!("{}@{x}", target.name), "version discover knows".into())).collect(),
                "ERR_UNKNOWN_PACKAGE",
            ));
        }
    }
    let use_official = entry.map(|e| e.official).unwrap_or(false);
    let add = |name: &str, version: Option<&str>| {
        add_command(ctx.env, name, version, if use_official { Some(&ctx.official.packages) } else { None })
    };
    let Some(item_name) = &target.item else {
        return detail(&packages, &target.name, entry, target.version.as_deref(), &add, installed_as);
    };
    if let Some(found) = item(&packages, &target.name, item_name, entry, target.version.as_deref(), &add, installed_as.clone()) {
        return Ok(found);
    }
    if let Some((_, reason)) = packages
        .iter()
        .find(|p| p.name == target.name)
        .and_then(|p| p.withdrawn_icon_sets.iter().find(|(n, _)| n == item_name))
    {
        return Err(DiscoverError::new(
            format!("Icon set \"{item_name}\" in {} is installed but withdrawn: {reason}", target.name),
            vec![],
            "ERR_UNKNOWN_COMPONENT",
        ));
    }
    if official_only {
        return Err(DiscoverError::new(
            format!("\"{item_name}\" not found in {}", target.name),
            similar_items(entry.unwrap(), item_name),
            "ERR_UNKNOWN_PACKAGE",
        ));
    }
    if let (Some(e), false) = (entry, is_integration) {
        return Err(DiscoverError::new(
            format!("\"{item_name}\" not found in {}", target.name),
            similar_items(e, item_name),
            "ERR_UNKNOWN_COMPONENT",
        ));
    }
    super::doc::doc(ctx.env, &ctx.integrations, &target.name, item_name, options)
}

fn detail(
    packages: &[InstalledPackage],
    name: &str,
    catalog: Option<&CatalogPackage>,
    version: Option<&str>,
    add: &dyn Fn(&str, Option<&str>) -> String,
    installed_as: Option<String>,
) -> DResult<Value> {
    let pkg = packages.iter().find(|p| p.name == name);
    if pkg.is_none() && catalog.is_none() {
        return Err(DiscoverError::new(
            format!("Package \"{name}\" not found"),
            packages.iter().map(|p| (p.name.clone(), "available package".into())).collect(),
            "ERR_UNKNOWN_PACKAGE",
        ));
    }
    let mut known: Vec<String> = catalog.map(|c| c.versions.iter().map(|v| v.version.clone()).collect()).unwrap_or_default();
    if let Some(v) = pkg.and_then(|p| p.version.clone()).filter(|v| !v.is_empty()) {
        if !known.contains(&v) {
            known.push(v);
        }
    }
    if let Some(v) = version {
        if !known.iter().any(|k| k == v) {
            let releases: Vec<String> =
                catalog.map(|c| c.versions.iter().filter(|v| !v.prerelease).map(|v| v.version.clone()).collect()).unwrap_or_default();
            let pool = if !releases.is_empty() { releases } else { known.clone() };
            return Err(DiscoverError::new(
                format!("Version \"{v}\" of {name} not found"),
                pool.into_iter().take(5).map(|x| (format!("{name}@{x}"), "published version".into())).collect(),
                "ERR_NOT_FOUND",
            ));
        }
    }
    let local = pkg.map(|p| version.is_none() || version == p.version.as_deref()).unwrap_or(false);
    let mut data = if local {
        let mut d = to_entry(pkg.unwrap());
        d.insert("installed".into(), true.into());
        d
    } else {
        let c = catalog.unwrap();
        let v = version.map(String::from).or_else(|| default_version(c));
        let mut d = catalog_entry(c, v.as_deref(), true);
        d.insert("installed".into(), pkg.is_some().into());
        if let Some(iv) = pkg.and_then(|p| p.version.clone()).filter(|v| !v.is_empty()) {
            d.insert("installedVersion".into(), iv.into());
        }
        d
    };
    if let Some(c) = catalog {
        if let Some(l) = c.latest.clone().filter(|l| !l.is_empty()) {
            data.insert("latest".into(), l.into());
        }
        if !c.aliases.is_empty() {
            data.insert("aliases".into(), strs(&c.aliases));
        }
        data.insert("source".into(), c.source.clone().into());
    }
    if pkg.is_none() {
        if let Some(a) = installed_as.filter(|a| !a.is_empty()) {
            data.insert("installedAs".into(), a.into());
        } else {
            data.insert("install".into(), add(name, version).into());
        }
    }
    if let Some(c) = catalog {
        data.insert("versions".into(), Value::Array(c.versions.iter().map(|v| v.to_json()).collect()));
    }
    let mut r = Map::new();
    r.insert("type".into(), "discover.detail".into());
    r.insert("package".into(), crate::cli::format::js_string(data.get("name").unwrap_or(&Value::Null)).into());
    r.insert("data".into(), Value::Object(data));
    Ok(Value::Object(r))
}

fn item(
    packages: &[InstalledPackage],
    package_name: &str,
    item_name: &str,
    catalog: Option<&CatalogPackage>,
    version: Option<&str>,
    add: &dyn Fn(&str, Option<&str>) -> String,
    installed_as: Option<String>,
) -> Option<Value> {
    let pkg = packages.iter().find(|p| p.name == package_name);
    let wrap = |data: Map<String, Value>| {
        let mut r = Map::new();
        r.insert("type".into(), "discover.item".into());
        r.insert("package".into(), package_name.into());
        r.insert("data".into(), Value::Object(data));
        Value::Object(r)
    };
    if let Some(p) = pkg {
        if version.is_none() || version == p.version.as_deref() {
            for (kind, field) in KIND_FIELDS.iter().skip(1) {
                let Some(names) = p.list(field) else { continue };
                if !names.iter().any(|n| n == item_name) {
                    continue;
                }
                let mut d = Map::new();
                d.insert("package".into(), package_name.into());
                if let Some(v) = p.version.clone().filter(|v| !v.is_empty()) {
                    d.insert("version".into(), v.into());
                }
                d.insert("kind".into(), (*kind).into());
                d.insert("name".into(), item_name.into());
                if *kind == "icon-set" {
                    if let Some(set) = p.icon_set_details.iter().find(|s| s.name == item_name) {
                        d.insert("title".into(), set.display_name.clone().into());
                        d.insert("summary".into(), set.description.clone().into());
                        d.insert("license".into(), set.license.clone().into());
                        d.insert("iconCount".into(), crate::json::num(set.icon_count));
                        if let Some(def) = &set.default {
                            d.insert("default".into(), def.clone());
                        }
                        d.insert("definitions".into(), strs(&set.definitions));
                        d.insert(
                            "command".into(),
                            format!("astryx experimental icon <words> --set {package_name}/{item_name}").into(),
                        );
                    }
                }
                d.insert("installed".into(), true.into());
                return Some(wrap(d));
            }
        }
    }
    let catalog = catalog?;
    let low = lower(item_name);
    let found = catalog
        .contributions
        .iter()
        .find(|c| c.name == item_name)
        .or_else(|| catalog.contributions.iter().find(|c| lower(&c.name) == low))?;
    let shown = version.map(String::from).or_else(|| default_version(catalog));
    let mut d = Map::new();
    d.insert("package".into(), package_name.into());
    if let Some(s) = shown.filter(|s| !s.is_empty()) {
        d.insert("version".into(), s.into());
    }
    d.insert("kind".into(), found.kind.clone().into());
    d.insert("name".into(), found.name.clone().into());
    if let Some(t) = found.title.clone().filter(|t| !t.is_empty()) {
        d.insert("title".into(), t.into());
    }
    if let Some(t) = found.summary.clone().filter(|t| !t.is_empty()) {
        d.insert("summary".into(), t.into());
    }
    if let Some(k) = &found.keywords {
        d.insert("keywords".into(), strs(k));
    }
    if let Some(n) = found.icon_count {
        d.insert("iconCount".into(), crate::json::num(n));
    }
    if let Some(k) = &found.definitions {
        d.insert("definitions".into(), strs(k));
    }
    if found.kind == "icon-set" && pkg.is_some() {
        d.insert("command".into(), format!("astryx experimental icon <words> --set {package_name}/{}", found.name).into());
    }
    d.insert("installed".into(), pkg.is_some().into());
    if pkg.is_none() {
        match installed_as.filter(|a| !a.is_empty()) {
            Some(a) => {
                d.insert("installedAs".into(), a.into());
            }
            None => {
                d.insert("install".into(), add(package_name, version).into());
            }
        }
    }
    d.insert("source".into(), catalog.source.clone().into());
    Some(wrap(d))
}

pub struct SearchItem {
    package: String,
    kind: String,
    name: String,
    installed: bool,
    title: Option<String>,
    summary: Option<String>,
    keywords: Option<Vec<String>>,
    description: Option<String>,
}

fn search_items(
    installed: &[InstalledPackage],
    catalog: &CatalogResult,
    declared: &HashSet<String>,
    official_declared: Option<&HashSet<String>>,
) -> Vec<SearchItem> {
    let mut items = vec![];
    let mk = |package: &str, kind: &str, name: &str, installed: bool| SearchItem {
        package: package.into(),
        kind: kind.into(),
        name: name.into(),
        installed,
        title: None,
        summary: None,
        keywords: None,
        description: None,
    };
    for p in installed {
        let mut it = mk(&p.name, "package", &p.name, true);
        it.description = p.description.clone().filter(|d| !d.is_empty());
        items.push(it);
        for (kind, field) in KIND_FIELDS.iter().skip(1) {
            if let Some(names) = p.list(field) {
                for n in names {
                    items.push(mk(&p.name, kind, n, true));
                }
            }
        }
    }
    let names = installed_names(installed);
    let mut integrations: HashSet<String> = HashSet::new();
    for pkg in &catalog.packages {
        if catalog_state(pkg, &names, declared, official_declared).0 != "available" {
            continue;
        }
        if !integrations.insert(pkg.integration.clone()) {
            continue;
        }
        let mut it = mk(&pkg.package, "package", &pkg.package, false);
        it.description = pkg.description.clone().filter(|d| !d.is_empty());
        items.push(it);
        for c in &pkg.contributions {
            let mut it = mk(&pkg.package, &c.kind, &c.name, false);
            it.title = c.title.clone().filter(|t| !t.is_empty());
            it.summary = c.summary.clone().filter(|t| !t.is_empty());
            it.keywords = c.keywords.clone();
            items.push(it);
        }
    }
    items
}

fn rank(item: &SearchItem, low: &str) -> Option<f64> {
    let name = lower(&item.name);
    if name == low {
        return Some(0.0);
    }
    if name.starts_with(low) {
        return Some(1.0);
    }
    if name.contains(low) {
        return Some(2.0);
    }
    let dist = levenshtein(low, &name);
    if (1..=3).contains(&dist) {
        let min = [0, 5, 8, 11][dist];
        if super::util::len16(low).min(super::util::len16(&name)) >= min {
            return Some(3.0 + (dist as f64 - 1.0) / 10.0);
        }
    }
    let mut parts: Vec<String> = vec![];
    for s in [&item.title, &item.summary, &item.description].into_iter().flatten() {
        if !s.is_empty() {
            parts.push(s.clone());
        }
    }
    for k in item.keywords.iter().flatten() {
        if !k.is_empty() {
            parts.push(k.clone());
        }
    }
    if lower(&parts.join("\n")).contains(low) {
        return Some(4.0);
    }
    None
}

fn kind_order(k: &str) -> f64 {
    if k == "package" {
        return 0.0;
    }
    match DISCOVER_KINDS.iter().position(|x| *x == k) {
        Some(i) => (i + 1) as f64,
        None => -1.0,
    }
}

fn search(
    packages: &[InstalledPackage],
    query: &str,
    items: Vec<SearchItem>,
    type_: Option<&str>,
    only: Option<&str>,
    limit: usize,
) -> DResult<Value> {
    if query.trim().is_empty() {
        return Err(DiscoverError::new(
            "A search query is required",
            vec![("astryx discover button".into(), "example".into())],
            "ERR_INVALID_ARGUMENT",
        ));
    }
    let low = lower(query);
    let mut all: Vec<SearchItem> = vec![];
    for p in packages {
        for c in &p.components {
            all.push(SearchItem {
                package: p.name.clone(),
                kind: "component".into(),
                name: c.clone(),
                installed: true,
                title: None,
                summary: None,
                keywords: None,
                description: None,
            });
        }
    }
    let installed_components: Vec<(String, String)> = all.iter().map(|i| (i.package.clone(), i.name.clone())).collect();
    all.extend(items);
    let mut ranked: Vec<(SearchItem, f64)> = all
        .into_iter()
        .filter(|i| type_.map(|t| i.kind == t).unwrap_or(true))
        .filter(|i| match only {
            Some("installed") => i.installed,
            Some("available") => !i.installed,
            _ => true,
        })
        .filter_map(|i| rank(&i, &low).map(|s| (i, s)))
        .collect();
    js_sort_by(&mut ranked, |(a, sa), (b, sb)| {
        let d = sa - sb;
        if d != 0.0 {
            return d;
        }
        let d = (b.installed as i32 - a.installed as i32) as f64;
        if d != 0.0 {
            return d;
        }
        let d = kind_order(&a.kind) - kind_order(&b.kind);
        if d != 0.0 {
            return d;
        }
        let d = ord_to_num(locale_compare(&a.package, &b.package));
        if d != 0.0 {
            return d;
        }
        ord_to_num(locale_compare(&a.name, &b.name))
    });
    if !ranked.is_empty() {
        let total = ranked.len();
        let matches: Vec<Value> = ranked
            .iter()
            .take(limit)
            .map(|(i, _)| {
                let mut m = Map::new();
                m.insert("package".into(), i.package.clone().into());
                m.insert("component".into(), i.name.clone().into());
                m.insert("kind".into(), i.kind.clone().into());
                m.insert("installed".into(), i.installed.into());
                opt(&mut m, "title", &i.title);
                opt(&mut m, "summary", &i.summary);
                Value::Object(m)
            })
            .collect();
        let shown = matches.len();
        let mut data = Map::new();
        data.insert("query".into(), query.into());
        data.insert("matches".into(), Value::Array(matches));
        if shown < total {
            data.insert("total".into(), crate::json::num(total as f64));
        }
        let mut r = Map::new();
        r.insert("type".into(), "discover.search".into());
        r.insert("data".into(), Value::Object(data));
        return Ok(Value::Object(r));
    }
    let mut fuzzy: Vec<(String, String, usize)> = installed_components
        .into_iter()
        .map(|(p, n)| {
            let d = levenshtein(&low, &lower(&n));
            (p, n, d)
        })
        .filter(|x| x.2 <= 3)
        .collect();
    fuzzy.sort_by_key(|x| x.2);
    fuzzy.truncate(5);
    if !fuzzy.is_empty() {
        return Err(DiscoverError::new(
            format!("\"{query}\" not found"),
            fuzzy.into_iter().map(|(p, n, _)| (format!("{p}/{n}"), "similar name".into())).collect(),
            "ERR_NOT_FOUND",
        ));
    }
    Err(DiscoverError::new(format!("\"{query}\" not found in any package"), vec![], "ERR_NOT_FOUND"))
}

/// The kinds `--type` may name: the stable kinds, or, for an experimental
/// kind, what the project reads (stable when it cannot be loaded).
pub fn kinds_for_check(env: Option<&Env>, options: &Options) -> Vec<&'static str> {
    match (&options.type_, env) {
        (Some(t), Some(env)) if !STABLE_KINDS.contains(&t.as_str()) => read_kinds(env),
        _ => STABLE_KINDS.to_vec(),
    }
}

/// `answersQueries(project)`.
pub fn answers_queries(env: &Env) -> bool {
    let Some(p) = &env.project else { return false };
    p.integrations.iter().any(|i| i.load_error.is_none()) || has_sources(env)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn targets() {
        let t = split_target("@a/b@1.0/Item");
        assert_eq!((t.name.as_str(), t.version.as_deref(), t.item.as_deref()), ("@a/b", Some("1.0"), Some("Item")));
        let t = split_target("button");
        assert!(!t.scoped && t.item.is_none());
    }
}
