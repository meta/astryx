//! Discover sources and the official list: `callSources`, `officialList`,
//! `parseDiscoverCatalog`, saved copies.

use super::env::{nearest_manifest, Env};
use super::model::*;
use super::util::{is_valid_semver, locale_compare_numeric, semver_compare};
use crate::json::{Map, Value};
use std::collections::HashSet;

const SOURCE_TIMEOUT_SECS: u64 = 30;

pub struct OfficialList {
    pub packages: Vec<CatalogPackage>,
    pub error: Option<String>,
}

const OWN_DEPENDENCY_FIELDS: [&str; 3] = ["dependencies", "devDependencies", "optionalDependencies"];
pub const DEPENDENCY_FIELDS: [&str; 4] =
    ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

/// Newest first: by release number, then a release before its prereleases.
pub fn newer_first(a: &str, b: &str) -> f64 {
    let by = semver_compare(b, a);
    if by != 0.0 {
        return by;
    }
    let a_rel = !a.contains('-');
    let b_rel = !b.contains('-');
    if a_rel != b_rel {
        return if a_rel { -1.0 } else { 1.0 };
    }
    super::util::ord_to_num(locale_compare_numeric(b, a))
}

struct Core {
    version: Option<String>,
    range: Option<String>,
}

/// `RANGE_PART` from the adapter.
fn range_part_ok(part: &str) -> bool {
    let mut s = part;
    for op in [">=", "<=", ">", "<", "=", "^", "~"] {
        if let Some(r) = s.strip_prefix(op) {
            s = r;
            break;
        }
    }
    let s = s.strip_prefix('v').unwrap_or(s);
    // split off build and prerelease
    let (main, build) = match s.find('+') {
        Some(i) => (&s[..i], Some(&s[i + 1..])),
        None => (s, None),
    };
    let ident_ok = |x: &str| !x.is_empty() && x.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-');
    if let Some(b) = build {
        if !ident_ok(b) {
            return false;
        }
    }
    let (nums, pre) = match main.find('-') {
        Some(i) => (&main[..i], Some(&main[i + 1..])),
        None => (main, None),
    };
    if let Some(p) = pre {
        if !ident_ok(p) {
            return false;
        }
    }
    let parts: Vec<&str> = nums.split('.').collect();
    if parts.is_empty() || parts.len() > 3 {
        return false;
    }
    parts.iter().all(|p| {
        !p.is_empty() && (p.bytes().all(|c| c.is_ascii_digit()) || *p == "x" || *p == "X" || *p == "*")
    })
}

fn is_semver_range(spec: &str) -> bool {
    // split(/\s*\|\|\s*|\s+/u)
    let t = spec.trim();
    let mut parts: Vec<String> = Vec::new();
    for union in t.split("||") {
        for p in union.split_whitespace() {
            parts.push(p.to_string());
        }
        // "a || b": a trailing empty piece cannot occur after trim except "a||" -> handled by empties
        if union.trim().is_empty() {
            parts.push(String::new());
        }
    }
    let parts: Vec<String> = parts.into_iter().filter(|p| p != "-").collect();
    !parts.is_empty() && parts.iter().all(|p| range_part_ok(p))
}

fn project_core(env: &Env) -> Option<Core> {
    if let Some(v) = env.installed_version("@astryxdesign/core") {
        return Some(Core { version: Some(v), range: None });
    }
    let manifest = nearest_manifest(&env.project_cwd());
    for field in OWN_DEPENDENCY_FIELDS {
        let spec = manifest
            .as_ref()
            .and_then(|(_, pkg)| pkg.get(field))
            .and_then(|deps| deps.get("@astryxdesign/core"));
        let Some(Value::String(spec)) = spec else { continue };
        let range = join_operators(spec.trim());
        let exact = range.strip_prefix('=').unwrap_or(&range).to_string();
        if is_valid_semver(&exact) {
            return Some(Core { version: Some(exact), range: None });
        }
        return Some(if is_semver_range(&range) {
            Core { version: None, range: Some(range) }
        } else {
            Core { version: None, range: None }
        });
    }
    None
}

/// `.replace(/([<>]=?|=|\^|~)\s+/gu, '$1')`
fn join_operators(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let mut op_len = 0;
        if c == '<' || c == '>' {
            op_len = if chars.get(i + 1) == Some(&'=') { 2 } else { 1 };
        } else if c == '=' || c == '^' || c == '~' {
            op_len = 1;
        }
        if op_len > 0 {
            let mut j = i + op_len;
            let ws_start = j;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            out.extend(&chars[i..i + op_len]);
            if j > ws_start {
                i = j;
            } else {
                i += op_len;
            }
            continue;
        }
        out.push(c);
        i += 1;
    }
    out
}

/// `officialList({project})`.
pub fn official_list(env: &Env) -> OfficialList {
    match official_list_inner(env) {
        Ok(packages) => OfficialList { packages, error: None },
        Err(e) => OfficialList { packages: vec![], error: Some(format!("the official list could not be read ({e})")) },
    }
}

fn official_list_inner(env: &Env) -> Result<Vec<CatalogPackage>, String> {
    let cli = env.cli_version().ok_or_else(|| "the CLI package names no version".to_string())?;
    let core = if env.project.is_none() { None } else { project_core(env) };
    let file = env.cli_root.join("assets").join("discover").join("official-packages.json");
    let text = std::fs::read_to_string(&file).map_err(|e| {
        format!(
            "ENOENT: no such file or directory, open '{}'{}",
            file.display(),
            if e.kind() == std::io::ErrorKind::NotFound { "" } else { "" }
        )
    })?;
    let list: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let canary_cli = cli.contains("-canary.");
    let is_release = |v: &str| !v.contains('-');
    let mut rel: Vec<String> = [Some(cli.clone()), core.as_ref().and_then(|c| c.version.clone())]
        .into_iter()
        .flatten()
        .filter(|v| is_release(v))
        .collect();
    super::util::js_sort_by(&mut rel, |a, b| newer_first(a, b));
    let latest = rel.first().cloned();
    let mut out = Vec::new();
    let pkgs = list.get("packages").and_then(|p| p.as_array()).ok_or("list.packages is not iterable")?;
    for pkg in pkgs {
        let mut listed: Vec<String> = vec![];
        let mut entry_latest: Option<String> = None;
        let mut pin: Option<String> = None;
        if pkg.get("canaryOnly") == Some(&Value::Bool(true)) {
            if !canary_cli {
                continue;
            }
            match &core {
                None => pin = Some(cli.clone()),
                Some(c) if c.version.as_deref().map(|v| !is_release(v)).unwrap_or(false) => pin = c.version.clone(),
                _ => continue,
            }
            listed = vec![pin.clone().unwrap()];
        } else if pkg.get("releasedWithCore") == Some(&Value::Bool(true)) {
            entry_latest = latest.clone();
            let mut set: Vec<String> = vec![];
            for v in [if is_release(&cli) { Some(cli.clone()) } else { None }, core.as_ref().and_then(|c| c.version.clone())]
                .into_iter()
                .flatten()
            {
                if !set.contains(&v) {
                    set.push(v);
                }
            }
            super::util::js_sort_by(&mut set, |a, b| newer_first(a, b));
            listed = set;
            pin = match &core {
                None => {
                    if canary_cli {
                        None
                    } else {
                        Some(cli.clone())
                    }
                }
                Some(c) => c.version.clone().or(c.range.clone()).or(entry_latest.clone()),
            };
        }
        let name = pkg.get("package").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let description = match pkg.get("description") {
            Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
            _ => None,
        };
        let contributions = pkg
            .get("contributions")
            .and_then(|c| c.as_array())
            .map(|a| a.iter().map(contribution_from).collect())
            .unwrap_or_default();
        out.push(CatalogPackage {
            package: name.clone(),
            integration: name,
            aliases: vec![],
            description,
            latest: entry_latest,
            versions: listed
                .iter()
                .map(|v| Version { version: v.clone(), published_at: None, prerelease: v.contains('-'), status: "ok".into() })
                .collect(),
            contributions,
            source: String::new(),
            official: false,
            pin: pin.filter(|p| !p.is_empty()),
        });
    }
    Ok(out)
}

pub fn contribution_from(c: &Value) -> Contribution {
    let s = |k: &str| c.get(k).and_then(|v| v.as_str()).map(|x| x.to_string());
    Contribution {
        kind: s("kind").unwrap_or_default(),
        name: s("name").unwrap_or_default(),
        title: s("title"),
        summary: s("summary"),
        keywords: c
            .get("keywords")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()),
        icon_count: c.get("iconCount").and_then(|v| v.as_f64()),
        definitions: c
            .get("definitions")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()),
    }
}

pub fn opted_into_icon_sets(env: &Env) -> bool {
    env.project.as_ref().map(|p| p.icon_sets).unwrap_or(false)
}

pub fn read_kinds(env: &Env) -> Vec<&'static str> {
    if opted_into_icon_sets(env) {
        DISCOVER_KINDS.to_vec()
    } else {
        STABLE_KINDS.to_vec()
    }
}

pub fn has_sources(env: &Env) -> bool {
    let Some(p) = &env.project else { return false };
    if p.config_discover.is_some() {
        return true;
    }
    p.integrations.iter().any(|i| i.discover.is_some() || i.discover_error.is_some())
}

#[derive(Default, Clone)]
pub struct Request {
    pub package: Option<String>,
    pub version: Option<String>,
}

/// `callSources(project, request, {official})`.
pub fn call_sources(env: &Env, request: &Request, official: &OfficialList) -> CatalogResult {
    let own = call_own_sources(env, request);
    let mut seen: HashSet<String> = HashSet::new();
    for p in &own.packages {
        seen.insert(p.package.clone());
        seen.insert(p.integration.clone());
        for a in &p.aliases {
            seen.insert(a.clone());
        }
    }
    let mut packages = own.packages;
    for pkg in &official.packages {
        if seen.contains(&pkg.package) {
            continue;
        }
        if let Some(want) = &request.package {
            if &pkg.package != want {
                continue;
            }
        }
        let mut p = pkg.clone();
        p.pin = None;
        p.source = OFFICIAL_SOURCE_NAME.into();
        p.official = true;
        packages.push(p);
    }
    let mut sources = own.sources;
    sources.push(match &official.error {
        Some(e) => SourceState {
            name: OFFICIAL_SOURCE_NAME.into(),
            from: OFFICIAL_SOURCE_FROM.into(),
            status: "failed",
            generated_at: None,
            complete: None,
            saved_at: None,
            error: Some(e.clone()),
        },
        None => SourceState {
            name: OFFICIAL_SOURCE_NAME.into(),
            from: OFFICIAL_SOURCE_FROM.into(),
            status: "fresh",
            generated_at: None,
            complete: Some(true),
            saved_at: None,
            error: None,
        },
    });
    if !opted_into_icon_sets(env) {
        let kinds = read_kinds(env);
        for p in &mut packages {
            p.contributions.retain(|c| kinds.contains(&c.kind.as_str()));
        }
    }
    CatalogResult { sources, packages }
}

fn call_own_sources(env: &Env, request: &Request) -> CatalogResult {
    let mut result = CatalogResult::default();
    let Some(project) = &env.project else { return result };
    let icon_sets = project.icon_sets;
    struct Origin<'a> {
        from: String,
        source: Option<&'a dyn super::env::Source>,
        error: Option<String>,
    }
    let mut origins: Vec<Origin> = vec![];
    if let Some(s) = &project.config_discover {
        origins.push(Origin { from: "astryx.config".into(), source: Some(s.as_ref()), error: None });
    }
    for i in &project.integrations {
        if let Some(e) = &i.discover_error {
            origins.push(Origin { from: i.name.clone(), source: None, error: Some(e.clone()) });
        } else if let Some(s) = &i.discover {
            origins.push(Origin { from: i.name.clone(), source: Some(s.as_ref()), error: None });
        }
    }
    let mut called: HashSet<usize> = HashSet::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut ask = Map::new();
    if let Some(p) = &request.package {
        ask.insert("package".into(), p.clone().into());
        if let Some(v) = &request.version {
            ask.insert("version".into(), v.clone().into());
        }
    }
    for o in origins {
        let Some(source) = o.source else {
            result.sources.push(SourceState {
                name: o.from.clone(),
                from: o.from.clone(),
                status: "failed",
                generated_at: None,
                complete: None,
                saved_at: None,
                error: o.error,
            });
            continue;
        };
        if !called.insert(source.id()) {
            continue;
        }
        let label = format!("the discover source from {}", o.from);
        let file = saved_copy_path(env, &o.from, request);
        let answer = source.call(&ask).and_then(|v| parse_discover_catalog(&v, &label, icon_sets));
        let catalog = match answer {
            Ok(catalog) => {
                write_saved_copy(&file, &catalog.raw);
                result.sources.push(SourceState {
                    name: catalog.name.clone(),
                    from: o.from.clone(),
                    status: "fresh",
                    generated_at: Some(catalog.generated_at.clone()),
                    complete: Some(catalog.complete),
                    saved_at: None,
                    error: None,
                });
                catalog
            }
            Err(message) => match read_saved_copy(&file, &label, icon_sets) {
                None => {
                    result.sources.push(SourceState {
                        name: o.from.clone(),
                        from: o.from.clone(),
                        status: "failed",
                        generated_at: None,
                        complete: None,
                        saved_at: None,
                        error: Some(message),
                    });
                    continue;
                }
                Some((saved_at, catalog)) => {
                    result.sources.push(SourceState {
                        name: catalog.name.clone(),
                        from: o.from.clone(),
                        status: "saved",
                        generated_at: Some(catalog.generated_at.clone()),
                        complete: Some(catalog.complete),
                        saved_at: Some(saved_at),
                        error: Some(message),
                    });
                    catalog
                }
            },
        };
        for mut pkg in catalog.packages {
            if !seen.insert(pkg.package.clone()) {
                continue;
            }
            pkg.source = catalog.name.clone();
            result.packages.push(pkg);
        }
    }
    let _ = SOURCE_TIMEOUT_SECS;
    result
}

pub struct ParsedCatalog {
    pub name: String,
    pub generated_at: String,
    pub complete: bool,
    pub packages: Vec<CatalogPackage>,
    /// The parsed catalog as JSON, for the saved copy.
    pub raw: Value,
}

fn saved_copy_path(env: &Env, from: &str, request: &Request) -> std::path::PathBuf {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(format!(
        "{from}\n{}\n{}",
        request.package.clone().unwrap_or_default(),
        request.version.clone().unwrap_or_default()
    ));
    let hex: String = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
    env.cache_dir.join("discover").join(format!("{}.json", &hex[..32]))
}

fn read_saved_copy(file: &std::path::Path, label: &str, icon_sets: bool) -> Option<(String, ParsedCatalog)> {
    let text = std::fs::read_to_string(file).ok()?;
    let saved: Value = serde_json::from_str(&text).ok()?;
    let saved_at = crate::cli::format::js_string(saved.get("savedAt").unwrap_or(&Value::Null));
    let saved_at = if saved.get("savedAt").is_none() { "undefined".to_string() } else { saved_at };
    let catalog = parse_discover_catalog(saved.get("catalog").unwrap_or(&Value::Null), label, icon_sets).ok()?;
    Some((saved_at, catalog))
}

fn write_saved_copy(file: &std::path::Path, catalog: &Value) {
    let Some(dir) = file.parent() else { return };
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    let mut m = Map::new();
    m.insert("savedAt".into(), now_iso().into());
    m.insert("catalog".into(), catalog.clone());
    let tmp = format!("{}.{}.tmp", file.display(), std::process::id());
    if std::fs::write(&tmp, crate::json::stringify(&Value::Object(m), 0)).is_ok() {
        let _ = std::fs::rename(&tmp, file);
    }
}

fn now_iso() -> String {
    let d = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let ms = d.as_millis() as i64;
    let secs = ms.div_euclid(1000);
    let (y, mo, da) = civil_from_days(secs.div_euclid(86400));
    let rem = secs.rem_euclid(86400);
    format!(
        "{y:04}-{mo:02}-{da:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60,
        ms.rem_euclid(1000)
    )
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// `parseDiscoverCatalog(value, label, {iconSets})`.
pub fn parse_discover_catalog(value: &Value, label: &str, icon_sets: bool) -> Result<ParsedCatalog, String> {
    let cleaned = drop_undefined(value);
    let value = &cleaned;
    if let Value::Object(o) = value {
        if let Some(v) = o.get("schemaVersion") {
            if v != &Value::from(1) {
                return Err(format!(
                    "{label} returned schemaVersion {}; this CLI reads schemaVersion 1",
                    crate::cli::format::js_string(v)
                ));
            }
        }
    }
    super::zodish::check_catalog(value, icon_sets).map_err(|(path, msg)| {
        let where_ = if path.is_empty() { String::new() } else { format!(" at {}", path.join(".")) };
        format!("{label} returned an invalid catalog{where_}: {msg}")
    })?;
    let known: Vec<&str> = DISCOVER_KINDS.iter().copied().filter(|k| icon_sets || *k != "icon-set").collect();
    let src = &value["source"];
    let mut packages = Vec::new();
    let mut raw_pkgs = Vec::new();
    for p in value["packages"].as_array().unwrap() {
        let s = |k: &str| p.get(k).and_then(|v| v.as_str()).map(String::from);
        let mut versions: Vec<Version> = p["versions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| Version {
                version: v["version"].as_str().unwrap_or("").into(),
                published_at: v["publishedAt"].as_str().map(String::from),
                prerelease: v["prerelease"].as_bool().unwrap_or(false),
                status: v["status"].as_str().unwrap_or("").into(),
            })
            .collect();
        versions.sort_by(|a, b| {
            let n = newest_first(a, b);
            n.partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal)
        });
        let mut contributions: Vec<Contribution> = p["contributions"].as_array().unwrap().iter().map(contribution_from).collect();
        if !icon_sets {
            for c in &mut contributions {
                c.icon_count = None;
                c.definitions = None;
            }
        }
        contributions.retain(|c| known.contains(&c.kind.as_str()));
        let pkg = CatalogPackage {
            package: s("package").unwrap_or_default(),
            integration: s("integration").unwrap_or_default(),
            aliases: p["aliases"].as_array().unwrap().iter().filter_map(|x| x.as_str().map(String::from)).collect(),
            description: s("description"),
            latest: s("latest"),
            versions,
            contributions,
            source: String::new(),
            official: false,
            pin: None,
        };
        raw_pkgs.push(catalog_package_json(&pkg));
        packages.push(pkg);
    }
    let raw = serde_json::json!({
        "schemaVersion": 1,
        "source": {
            "name": src["name"],
            "generatedAt": src["generatedAt"],
            "complete": src["complete"],
        },
        "packages": raw_pkgs,
    });
    Ok(ParsedCatalog {
        name: src["name"].as_str().unwrap_or("").into(),
        generated_at: src["generatedAt"].as_str().unwrap_or("").into(),
        complete: src["complete"].as_bool().unwrap_or(false),
        packages,
        raw,
    })
}

fn catalog_package_json(p: &CatalogPackage) -> Value {
    let mut m = Map::new();
    m.insert("package".into(), p.package.clone().into());
    m.insert("integration".into(), p.integration.clone().into());
    m.insert("aliases".into(), strs(&p.aliases));
    opt(&mut m, "description", &p.description);
    m.insert("latest".into(), p.latest.clone().map(Value::String).unwrap_or(Value::Null));
    m.insert("versions".into(), Value::Array(p.versions.iter().map(|v| v.to_json()).collect()));
    m.insert(
        "contributions".into(),
        Value::Array(
            p.contributions
                .iter()
                .map(|c| {
                    let mut o = Map::new();
                    o.insert("kind".into(), c.kind.clone().into());
                    o.insert("name".into(), c.name.clone().into());
                    opt(&mut o, "title", &c.title);
                    opt(&mut o, "summary", &c.summary);
                    if let Some(k) = &c.keywords {
                        o.insert("keywords".into(), strs(k));
                    }
                    if let Some(n) = c.icon_count {
                        o.insert("iconCount".into(), crate::json::num(n));
                    }
                    if let Some(d) = &c.definitions {
                        o.insert("definitions".into(), strs(d));
                    }
                    Value::Object(o)
                })
                .collect(),
        ),
    );
    Value::Object(m)
}

fn newest_first(a: &Version, b: &Version) -> f64 {
    let at = parse_date(a.published_at.as_deref());
    let bt = parse_date(b.published_at.as_deref());
    if at.is_none() != bt.is_none() {
        return if at.is_none() { 1.0 } else { -1.0 };
    }
    if let (Some(x), Some(y)) = (at, bt) {
        if x != y {
            return y - x;
        }
    }
    super::util::ord_to_num(locale_compare_numeric(&b.version, &a.version))
}

/// `Date.parse(text)`, NaN as `None`.
fn parse_date(s: Option<&str>) -> Option<f64> {
    super::date::date_parse(s.unwrap_or(""))
}

/// Object properties holding `undefined` are absent, as zod sees them.
fn drop_undefined(v: &Value) -> Value {
    match v {
        Value::Object(o) => Value::Object(
            o.iter()
                .filter(|(_, x)| x.get("__js").and_then(|k| k.as_str()) != Some("undefined"))
                .map(|(k, x)| (k.clone(), drop_undefined(x)))
                .collect(),
        ),
        Value::Array(a) => Value::Array(a.iter().map(drop_undefined).collect()),
        other => other.clone(),
    }
}
