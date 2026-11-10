//! Yarn Plug'n'Play lookups (`findPnpPackage` in `foundation/fs/paths.mjs`).
//!
//! The JS asks the PnP runtime only inside a PnP process: one Node started
//! with the project's `.pnp.cjs` required (`yarn` puts `--require
//! <project>/.pnp.cjs` in `NODE_OPTIONS`), which sets `process.versions.pnp`.
//! This reads the same `NODE_OPTIONS`, then answers
//! `require('pnpapi').resolveToUnqualified(name, from + '/')` from the
//! runtime's serialized state, as the runtime does: the issuer's package
//! (the longest package location holding it), that package's dependency,
//! then the top-level fallbacks the state allows.

use super::nodepath as np;
use crate::json::Value;
use std::cell::RefCell;
use std::collections::HashMap;

/// One PnP runtime's state (`hydrateRuntimeState`).
#[derive(Debug, Clone)]
struct Runtime {
    /// The `.pnp.cjs` file (real path).
    api_path: String,
    /// Its folder: package locations are relative to it.
    base: String,
    ignore: Option<regress::Regex>,
    enable_top_level_fallback: bool,
    fallback_exclusion: HashMap<String, Vec<String>>,
    fallback_pool: Vec<(String, Value)>,
    /// location → (locator, discardFromLookup).
    locators_by_location: HashMap<String, ((Option<String>, Option<String>), bool)>,
    /// (name, reference) → (location, dependencies).
    registry: HashMap<(Option<String>, Option<String>), (String, Vec<(String, Value)>)>,
}

thread_local! {
    static LOADED: RefCell<Vec<Runtime>> = const { RefCell::new(Vec::new()) };
    static NODE_OPTIONS_OVERRIDE: RefCell<Option<Option<String>>> = const { RefCell::new(None) };
}

/// Run `f` as if `NODE_OPTIONS` were `value` on this thread (tests).
pub fn with_node_options<R>(value: Option<&str>, f: impl FnOnce() -> R) -> R {
    let prev = NODE_OPTIONS_OVERRIDE.with(|o| o.replace(Some(value.map(String::from))));
    let r = f();
    NODE_OPTIONS_OVERRIDE.with(|o| *o.borrow_mut() = prev);
    r
}

/// The `.pnp.cjs` a PnP process loaded: the first `--require`/`-r` in
/// `NODE_OPTIONS` naming a `.pnp.cjs` or `.pnp.js` file, as a real path.
pub fn pnp_process_runtime() -> Option<String> {
    let opts = match NODE_OPTIONS_OVERRIDE.with(|o| o.borrow().clone()) {
        Some(v) => v?,
        None => std::env::var("NODE_OPTIONS").ok()?,
    };
    let words = split_node_options(&opts);
    let mut i = 0;
    while i < words.len() {
        let w = &words[i];
        let value = if w == "--require" || w == "-r" {
            i += 1;
            words.get(i).cloned()
        } else {
            w.strip_prefix("--require=").map(String::from)
        };
        i += 1;
        let Some(v) = value else { continue };
        let base = np::basename(&v);
        if base == ".pnp.cjs" || base == ".pnp.js" {
            let abs = np::resolve1(&v);
            if np::is_file(&abs) {
                return Some(np::real_or_resolve(&abs));
            }
        }
    }
    None
}

/// `NODE_OPTIONS` words, as Node splits them (spaces, double quotes, `\`).
fn split_node_options(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_word = false;
    let mut quoted = false;
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' if quoted => {
                if let Some(n) = chars.next() {
                    cur.push(n);
                }
            }
            '"' => {
                quoted = !quoted;
                in_word = true;
            }
            ' ' if !quoted => {
                if in_word {
                    out.push(std::mem::take(&mut cur));
                    in_word = false;
                }
            }
            _ => {
                cur.push(c);
                in_word = true;
            }
        }
    }
    if in_word {
        out.push(cur);
    }
    out
}

fn str_or_null(v: &Value) -> Option<String> {
    v.as_str().map(String::from)
}

/// The JSON string a `.pnp.cjs` holds in `RAW_RUNTIME_STATE`, or the
/// `.pnp.data.json` beside it.
fn raw_state(api_path: &str) -> Option<Value> {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::{BindingPattern, Expression, Statement};
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    let text = np::read_text(api_path)?;
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, &text, SourceType::cjs()).parse();
    for stmt in &ret.program.body {
        let Statement::VariableDeclaration(v) = stmt else { continue };
        for d in &v.declarations {
            let BindingPattern::BindingIdentifier(id) = &d.id else { continue };
            if id.name != "RAW_RUNTIME_STATE" {
                continue;
            }
            if let Some(Expression::StringLiteral(s)) = &d.init {
                return np::parse_json(s.value.as_str()?);
            }
        }
    }
    np::read_json(&np::join2(&np::dirname(api_path), ".pnp.data.json"))
}

fn load(api_path: &str) -> Option<Runtime> {
    let data = raw_state(api_path)?;
    let base = np::dirname(api_path);
    let ignore = data.get("ignorePatternData").and_then(|v| v.as_str()).and_then(|p| regress::Regex::new(p).ok());
    let mut locators_by_location: HashMap<String, ((Option<String>, Option<String>), bool)> = HashMap::new();
    let mut registry = HashMap::new();
    for entry in data.get("packageRegistryData").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let name = str_or_null(&entry[0]);
        for store in entry[1].as_array().cloned().unwrap_or_default() {
            let reference = str_or_null(&store[0]);
            let info = &store[1];
            let location = info.get("packageLocation").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let discard = info.get("discardFromLookup").and_then(|v| v.as_bool()).unwrap_or(false);
            let locator = (name.clone(), reference.clone());
            match locators_by_location.get_mut(&location) {
                None => {
                    locators_by_location.insert(location.clone(), (locator.clone(), discard));
                }
                Some(e) => {
                    e.1 = e.1 && discard;
                    if !discard {
                        e.0 = locator.clone();
                    }
                }
            }
            let deps: Vec<(String, Value)> = info
                .get("packageDependencies")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|d| Some((d[0].as_str()?.to_string(), d[1].clone()))).collect())
                .unwrap_or_default();
            registry.insert(locator, (location, deps));
        }
    }
    let fallback_exclusion = data
        .get("fallbackExclusionList")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|e| Some((e[0].as_str()?.to_string(), e[1].as_array()?.iter().filter_map(|r| r.as_str().map(String::from)).collect())))
                .collect()
        })
        .unwrap_or_default();
    let fallback_pool = data
        .get("fallbackPool")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|e| Some((e[0].as_str()?.to_string(), e[1].clone()))).collect())
        .unwrap_or_default();
    Some(Runtime {
        api_path: api_path.to_string(),
        base,
        ignore,
        enable_top_level_fallback: data.get("enableTopLevelFallback").and_then(|v| v.as_bool()).unwrap_or(false),
        fallback_exclusion,
        fallback_pool,
        locators_by_location,
        registry,
    })
}

impl Runtime {
    fn is_ignored(&self, path: &str) -> bool {
        let Some(re) = &self.ignore else { return false };
        let sub = if path == self.base {
            ".".to_string()
        } else if let Some(rest) = path.strip_prefix(&format!("{}/", self.base)) {
            rest.to_string()
        } else {
            return false;
        };
        re.find(sub.trim_end_matches('/')).is_some()
    }

    /// `findPackageLocator(location)`.
    fn find_locator(&self, location: &str) -> Option<(Option<String>, Option<String>)> {
        if self.is_ignored(location) {
            return None;
        }
        let mut rel = np::relative(&self.base, location);
        let strict = rel.starts_with('/') || rel == "." || rel == ".." || rel.starts_with("./") || rel.starts_with("../");
        if !strict {
            rel = format!("./{rel}");
        }
        if !rel.ends_with('/') {
            rel.push('/');
        }
        loop {
            match self.locators_by_location.get(&rel) {
                Some((loc, discard)) if !discard => return Some(loc.clone()),
                _ => {
                    let cut = rel[..rel.len().saturating_sub(1)].rfind('/').map(|i| i + 1).unwrap_or(0);
                    rel.truncate(cut);
                    if rel.is_empty() {
                        return None;
                    }
                }
            }
        }
    }

    fn deps_of(&self, loc: &(Option<String>, Option<String>)) -> Option<&Vec<(String, Value)>> {
        self.registry.get(loc).map(|e| &e.1)
    }

    /// `resolveToUnqualified(name, issuer)` for a bare package name; None
    /// where the runtime throws or answers with a file.
    fn resolve_unqualified(&self, name: &str, issuer: &str) -> Option<String> {
        if self.is_ignored(issuer) {
            return None;
        }
        let issuer_loc = self.find_locator(issuer)?;
        let deps = self.deps_of(&issuer_loc)?;
        let mut reference: Option<Value> = deps.iter().find(|(n, _)| n == name).map(|(_, r)| r.clone()).filter(|r| !r.is_null());
        let mut fallback: Option<Value> = None;
        if reference.is_none() && issuer_loc.0.is_some() {
            let excluded = self
                .fallback_exclusion
                .get(issuer_loc.0.as_ref().unwrap())
                .is_some_and(|refs| issuer_loc.1.as_ref().is_some_and(|r| refs.contains(r)));
            if !excluded {
                let mut fallbacks: Vec<(Option<String>, Option<String>)> = Vec::new();
                if self.enable_top_level_fallback {
                    fallbacks.push((None, None));
                }
                for compat in ["react-scripts", "gatsby"] {
                    let mut refs: Vec<&Option<String>> =
                        self.registry.keys().filter(|(n, _)| n.as_deref() == Some(compat)).map(|(_, r)| r).collect();
                    refs.sort();
                    for r in refs {
                        fallbacks.push((Some(compat.into()), r.clone()));
                    }
                }
                for f in &fallbacks {
                    if let Some(r) = self.deps_of(f).and_then(|d| d.iter().find(|(n, _)| n == name)).map(|(_, r)| r.clone()) {
                        if !r.is_null() {
                            reference = Some(r);
                            break;
                        }
                    }
                }
                if self.enable_top_level_fallback && reference.is_none() {
                    fallback = self.fallback_pool.iter().find(|(n, _)| n == name).map(|(_, r)| r.clone()).filter(|r| !r.is_null());
                }
            }
        }
        // An undeclared or unprovided dependency is an error, which a
        // top-level fallback turns into a warning.
        let reference = match reference.or(fallback) {
            Some(r) => r,
            None => return None,
        };
        let dep_loc = match &reference {
            Value::Array(a) => (a.first().and_then(|v| v.as_str()).map(String::from), a.get(1).and_then(|v| v.as_str()).map(String::from)),
            Value::String(r) => (Some(name.to_string()), Some(r.clone())),
            _ => return None,
        };
        let (location, _) = self.registry.get(&dep_loc)?;
        if location.is_empty() {
            return None;
        }
        Some(posix_normalize_keep_slash(&format!("{}/{}", self.base, location)))
    }
}

/// `path.posix.normalize`, which keeps a trailing slash.
fn posix_normalize_keep_slash(p: &str) -> String {
    let n = np::normalize(p);
    if p.ends_with('/') && !n.ends_with('/') {
        format!("{n}/")
    } else {
        n
    }
}

/// `findApiPathFor(modulePath)`: the loaded runtime that owns the path,
/// else the nearest `.pnp.cjs` (or `.pnp.js`) above it.
fn find_api_for(initial: &str, module_path: &str) -> Option<Runtime> {
    LOADED.with(|l| {
        let mut l = l.borrow_mut();
        if l.first().is_some_and(|r| r.api_path != initial) {
            l.clear();
        }
        if l.is_empty() {
            l.push(load(initial)?);
        }
        let owners: Vec<&Runtime> = l.iter().filter(|r| r.find_locator(module_path).is_some()).collect();
        if l.len() == 1 && owners.len() == 1 {
            return Some(owners[0].clone());
        }
        if !owners.is_empty() {
            let len = |r: &Runtime| {
                let loc = r.find_locator(module_path).unwrap();
                r.registry.get(&loc).map(|e| e.0.len()).unwrap_or(0)
            };
            let best = owners.iter().map(|r| len(r)).max().unwrap_or(0);
            let top: Vec<&&Runtime> = owners.iter().filter(|r| len(r) == best).collect();
            // Several runtimes owning one path is an error in the runtime.
            return if top.len() == 1 { Some((*top[0]).clone()) } else { None };
        }
        let mut cur = np::resolve1(module_path);
        loop {
            for f in [".pnp.cjs", ".pnp.js"] {
                let cand = np::join2(&cur, f);
                if np::is_file(&cand) {
                    let real = np::real_or_resolve(&cand);
                    if let Some(r) = l.iter().find(|r| r.api_path == real) {
                        return Some(r.clone());
                    }
                    let r = load(&real)?;
                    l.push(r.clone());
                    return Some(r);
                }
            }
            let next = np::dirname(&cur);
            if next == cur {
                return None;
            }
            cur = next;
        }
    })
}

/// `findPnpPackage(startDir, name)`: where the PnP runtime of this process
/// says `name` lives for `startDir` (with the runtime's trailing slash),
/// when its `package.json` is there.
pub fn find_pnp_package(start: &str, name: &str) -> Option<String> {
    let initial = pnp_process_runtime()?;
    let from = np::resolve1(start);
    let api = find_api_for(&initial, &np::join2(&from, "noop.js"))?;
    let dir = api.resolve_unqualified(name, &format!("{}/", from.trim_end_matches('/')))?;
    if np::exists(&np::join2(&dir, "package.json")) {
        Some(dir)
    } else {
        None
    }
}
