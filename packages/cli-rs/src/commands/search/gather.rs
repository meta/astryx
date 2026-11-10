//! Search's adapter (`_adapter.mjs`, `_gather-*.mjs`): the candidates a query's
//! domains hold. Core's components and hooks are read from the project's
//! `@astryxdesign/core` docs at run time; the CLI's own docs, templates and
//! bundled themes come from the compiled file `data/own-candidates.json`
//! (scripts/gen-search-candidates.mjs).

use crate::commands::component::deps::{self, ReadOpts};
use crate::discovery::component_discovery::{
    discover_components, discover_valid_integration_components, doc_stem, family_member, find_component_readme,
    find_external_component_doc, for_each_integration_doc, integration_member_entry, integration_record_hold,
    is_integration_member, list_dir, resolve_import_path, resolve_integration_import_path, ImportOwner,
    LoadedIntegration, NameHold,
};
use std::collections::HashSet;
use std::path::PathBuf;
use crate::discovery::hook_discovery::{discover_hooks, find_hook_doc};
use crate::json::{Map, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;

pub const CORE_PACKAGE: &str = "@astryxdesign/core";

fn own() -> &'static Value {
    static OWN: OnceLock<Value> = OnceLock::new();
    OWN.get_or_init(|| serde_json::from_str(include_str!("data/own-candidates.json")).expect("own candidates"))
}

/// The CLI's own doc candidates, as the docs render for `pm`.
pub fn own_docs(pm: &str) -> Vec<Value> {
    let o = own();
    let base = o["base"].as_array().cloned().unwrap_or_default();
    let diffs = o["diffs"].get(pm).and_then(|d| d.as_object());
    match diffs {
        None => base,
        Some(d) => base
            .into_iter()
            .enumerate()
            .map(|(i, c)| d.get(&i.to_string()).cloned().unwrap_or(c))
            .collect(),
    }
}

pub fn own_templates() -> Vec<Value> {
    own()["templates"].as_array().cloned().unwrap_or_default()
}

pub fn own_themes() -> Vec<Value> {
    own()["themes"].as_array().cloned().unwrap_or_default()
}

fn doc_cache() -> &'static std::sync::Mutex<HashMap<(PathBuf, &'static str), Value>> {
    static C: OnceLock<std::sync::Mutex<HashMap<(PathBuf, &'static str), Value>>> = OnceLock::new();
    C.get_or_init(Default::default)
}

fn read_doc(doc_path: &Path, root: &'static str) -> Value {
    deps::read_doc_view(doc_path, &ReadOpts { root, lang: None, strict: false }).unwrap_or(Value::Null)
}

/// `loadModuleDoc(docPath, exportName, root)`: the doc, or null.
fn load_module_doc(doc_path: &Path, root: &'static str) -> Value {
    let key = (doc_path.to_path_buf(), root);
    if let Some(v) = doc_cache().lock().unwrap().get(&key) {
        return v.clone();
    }
    let v = read_doc(doc_path, root);
    doc_cache().lock().unwrap().insert(key, v.clone());
    v
}

/// Load many docs at once, each thread with its own engine. A doc evaluates
/// on its own, so the order the threads finish in changes nothing.
pub fn preload_docs(docs: Vec<(PathBuf, &'static str)>) {
    let docs: Vec<(PathBuf, &'static str)> = {
        let cache = doc_cache().lock().unwrap();
        docs.into_iter().filter(|k| !cache.contains_key(k)).collect()
    };
    if docs.len() < 8 {
        return;
    }
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get()).clamp(1, 8);
    let next = std::sync::atomic::AtomicUsize::new(0);
    std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| loop {
                let i = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                let Some((path, root)) = docs.get(i) else { break };
                let v = read_doc(path, root);
                doc_cache().lock().unwrap().insert((path.clone(), *root), v);
            });
        }
    });
}

/// Map `f` over `items` on a few threads, keeping the order. The file
/// lookups it runs are independent reads.
pub fn par_map<T: Sync, R: Send>(items: &[T], f: impl Fn(&T) -> R + Sync) -> Vec<R> {
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get()).clamp(1, 8);
    if items.len() < 16 || threads == 1 {
        return items.iter().map(f).collect();
    }
    let chunk = items.len().div_ceil(threads);
    std::thread::scope(|scope| {
        let handles: Vec<_> =
            items.chunks(chunk).map(|part| scope.spawn(|| part.iter().map(&f).collect::<Vec<R>>())).collect();
        handles.into_iter().flat_map(|h| h.join().unwrap()).collect()
    })
}

/// Run `f` over a few contiguous chunks of `items` on threads and join the
/// results in order.
pub fn par_map_chunks<T: Sync, R: Send>(items: &[T], f: impl Fn(&[T]) -> Vec<R> + Sync) -> Vec<R> {
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get()).clamp(1, 8);
    if items.len() < 64 || threads == 1 {
        return f(items);
    }
    let chunk = items.len().div_ceil(threads);
    std::thread::scope(|scope| {
        let handles: Vec<_> = items.chunks(chunk).map(|part| scope.spawn(|| f(part))).collect();
        handles.into_iter().flat_map(|h| h.join().unwrap()).collect()
    })
}

/// What Core's file layout gives search, read once: each component's doc
/// and import path, the family docs without a component, each hook's doc.
struct CoreLayout {
    names: Vec<String>,
    readmes: Vec<Option<PathBuf>>,
    imports: Vec<String>,
    family_docs: Vec<PathBuf>,
    hooks: Vec<(String, Option<PathBuf>)>,
}

fn core_layout(core_dir: &Path) -> std::sync::Arc<CoreLayout> {
    static C: OnceLock<std::sync::Mutex<HashMap<PathBuf, std::sync::Arc<CoreLayout>>>> = OnceLock::new();
    let cache = C.get_or_init(Default::default);
    if let Some(l) = cache.lock().unwrap().get(core_dir) {
        return l.clone();
    }
    let (names, hook_names) = std::thread::scope(|scope| {
        let h = scope.spawn(|| discover_hooks(core_dir).into_values().flatten().collect::<Vec<String>>());
        let n: Vec<String> = discover_components(core_dir).into_values().flatten().collect();
        (n, h.join().unwrap())
    });
    let per: Vec<(Option<PathBuf>, String)> =
        par_map(&names, |c| (find_component_readme(core_dir, c), resolve_import_path(core_dir, c)));
    let (readmes, imports) = per.into_iter().unzip();
    let src = core_dir.join("src");
    let family_docs = if src.exists() {
        list_dir(&src)
            .into_iter()
            .filter(|dir| !names.contains(dir))
            .map(|dir| src.join(&dir).join(format!("{dir}.doc.mjs")))
            .filter(|doc| doc.exists())
            .collect()
    } else {
        Vec::new()
    };
    let hooks = hook_names.iter().cloned().zip(par_map(&hook_names, |h| find_hook_doc(core_dir, h))).collect();
    let l = std::sync::Arc::new(CoreLayout { names, readmes, imports, family_docs, hooks });
    cache.lock().unwrap().insert(core_dir.to_path_buf(), l.clone());
    l
}

/// The docs Core's components and hooks read.
fn core_doc_paths(core_dir: &Path, hooks: bool) -> Vec<(PathBuf, &'static str)> {
    let l = core_layout(core_dir);
    let mut out: Vec<(PathBuf, &'static str)> = l
        .readmes
        .iter()
        .flatten()
        .filter(|p| p.to_string_lossy().ends_with(".doc.mjs"))
        .map(|p| (p.clone(), "components"))
        .collect();
    out.extend(l.family_docs.iter().map(|d| (d.clone(), "components")));
    if hooks {
        out.extend(l.hooks.iter().filter_map(|(_, p)| p.clone()).map(|p| (p, "hooks")));
    }
    out
}

/// Load every Core doc a search of these domains reads, in parallel.
pub fn preload_core(core_dir: &Path, components: bool, hooks: bool) {
    if components || hooks {
        let mut docs = core_doc_paths(core_dir, hooks);
        if !components {
            docs.retain(|d| d.1 == "hooks");
        }
        preload_docs(docs);
    }
}

fn truthy(v: Option<&Value>) -> bool {
    v.is_some_and(super::cand::truthy)
}

fn arr(v: Option<&Value>) -> Value {
    match v {
        Some(Value::Array(a)) => Value::Array(a.clone()),
        _ => Value::Array(Vec::new()),
    }
}

/// `doc.usage?.description || doc.description || ''`.
fn description_of(doc: &Value) -> Value {
    let u = doc.get("usage").and_then(|u| u.get("description"));
    if truthy(u) {
        return u.unwrap().clone();
    }
    let d = doc.get("description");
    if truthy(d) {
        return d.unwrap().clone();
    }
    Value::String(String::new())
}

/// `guidanceFrom(doc)`.
pub fn guidance_from(doc: &Value) -> Vec<Value> {
    if doc.is_null() {
        return Vec::new();
    }
    let mut entries: Vec<&Value> = Vec::new();
    if let Some(Value::Array(a)) = doc.get("features") {
        entries.extend(a.iter());
    }
    if let Some(Value::Array(a)) = doc.get("usage").and_then(|u| u.get("bestPractices")) {
        entries.extend(a.iter());
    }
    entries
        .into_iter()
        .filter_map(|e| {
            let s = match e {
                Value::String(s) => s.clone(),
                Value::Object(_) => ["title", "text", "description", "do", "dont"]
                    .iter()
                    .filter_map(|k| e.get(*k).filter(|v| super::cand::truthy(v)).map(super::cand::js_str))
                    .collect::<Vec<_>>()
                    .join(" "),
                _ => return None,
            };
            if s.is_empty() {
                None
            } else {
                Some(Value::String(s))
            }
        })
        .collect()
}

/// `familyPlaces(docs)`.
fn family_places(docs: &Value, out: &mut HashMap<String, (String, usize)>) {
    let Some(name) = docs.get("name").and_then(|n| n.as_str()) else { return };
    let members: Vec<String> = match docs.get("components") {
        Some(Value::Array(a)) => a
            .iter()
            .filter_map(|m| match m {
                Value::String(s) => Some(s.clone()),
                _ => m.get("name").and_then(|n| n.as_str()).map(String::from),
            })
            .filter(|n| n != name)
            .collect(),
        _ => Vec::new(),
    };
    for (i, n) in members.into_iter().enumerate() {
        out.insert(n, (name.to_string(), i));
    }
}

/// `gatherCoreComponents(coreDir)`.
pub fn gather_core_components(core_dir: &Path) -> Vec<Value> {
    let layout = core_layout(core_dir);
    let names = &layout.names;
    let mut places: HashMap<String, (String, usize)> = HashMap::new();
    let mut out = Vec::new();
    for (ci, comp) in names.iter().enumerate() {
        let mut m = Map::new();
        m.insert("domain".into(), "component".into());
        m.insert("name".into(), Value::String(comp.clone()));
        let mut keywords = Value::Array(Vec::new());
        let mut description = Value::String(String::new());
        let mut guidance = Vec::new();
        let mut deprecated = None;
        if let Some(readme) = &layout.readmes[ci] {
            if readme.to_string_lossy().ends_with(".doc.mjs") {
                let loaded = load_module_doc(readme, "components");
                let doc = family_member(&loaded, comp).unwrap_or(&loaded);
                if super::cand::truthy(doc) {
                    keywords = arr(doc.get("keywords"));
                    description = description_of(doc);
                    guidance = guidance_from(doc);
                    deprecated = doc.get("deprecated").filter(|d| super::cand::truthy(d)).cloned();
                }
                family_places(&loaded, &mut places);
            }
        }
        m.insert("keywords".into(), keywords);
        m.insert("description".into(), description);
        m.insert("guidance".into(), Value::Array(guidance));
        if let Some(d) = deprecated {
            m.insert("_deprecated".into(), d);
        }
        m.insert("_package".into(), CORE_PACKAGE.into());
        m.insert("_import".into(), Value::String(layout.imports[ci].clone()));
        out.push(m);
    }
    for doc in &layout.family_docs {
        family_places(&load_module_doc(doc, "components"), &mut places);
    }
    out.into_iter()
        .map(|mut m| {
            let name = m["name"].as_str().unwrap_or("").to_string();
            if let Some((fam, i)) = places.get(&name) {
                m.insert("_family".into(), Value::String(fam.clone()));
                m.insert("_familyIndex".into(), Value::from(*i));
            }
            Value::Object(m)
        })
        .collect()
}

/// `gatherHooks(coreDir)`.
pub fn gather_hooks(core_dir: &Path) -> Vec<Value> {
    let layout = core_layout(core_dir);
    layout
        .hooks
        .iter()
        .map(|(name, doc_path)| {
            let name = name.clone();
            let mut keywords = Value::Array(Vec::new());
            let mut description = Value::String(String::new());
            let mut import = Value::String("@astryxdesign/core/hooks".into());
            if let Some(doc_path) = doc_path {
                let doc = load_module_doc(doc_path, "hooks");
                if super::cand::truthy(&doc) {
                    keywords = arr(doc.get("keywords"));
                    description = description_of(&doc);
                    if truthy(doc.get("importPath")) {
                        import = doc["importPath"].clone();
                    }
                }
            }
            let mut m = Map::new();
            m.insert("domain".into(), "hook".into());
            m.insert("name".into(), Value::String(name));
            m.insert("keywords".into(), keywords);
            m.insert("description".into(), description);
            m.insert("_package".into(), CORE_PACKAGE.into());
            m.insert("_import".into(), import);
            Value::Object(m)
        })
        .collect()
}

struct IntegrationGather {
    candidates: Vec<Map<String, Value>>,
    file_named: HashMap<String, HashSet<PathBuf>>,
    documented: HashMap<String, HashSet<PathBuf>>,
}

/// `gatherIntegrationComponents(loadedIntegrations)`.
fn gather_integration_components(integrations: &[LoadedIntegration]) -> IntegrationGather {
    let mut g = IntegrationGather { candidates: Vec::new(), file_named: HashMap::new(), documented: HashMap::new() };
    for integration in integrations {
        let valid = discover_valid_integration_components(integration, true);
        let renamed: HashSet<PathBuf> = valid
            .discovered
            .iter()
            .filter(|r| integration_record_hold(&r.name, Some(&r.doc_path)) == NameHold::Doc)
            .filter(|r| !is_integration_member(&r.name, Some(&r.doc_path)))
            .map(|r| r.doc_path.clone())
            .collect();
        let mut doc_paths: Vec<PathBuf> = Vec::new();
        if let Some(dir) = &integration.components {
            for_each_integration_doc(dir, &mut |doc_path: &Path, stem: &str| {
                if !renamed.contains(doc_path) {
                    g.file_named.entry(stem.to_string()).or_default().insert(doc_path.to_path_buf());
                }
                doc_paths.push(doc_path.to_path_buf());
            });
        }
        let mut places: HashMap<String, (String, usize)> = HashMap::new();
        for d in &doc_paths {
            family_places(&load_module_doc(d, "components"), &mut places);
        }
        for rec in &valid.components {
            let loaded = load_module_doc(&rec.doc_path, "components");
            let member = is_integration_member(&rec.name, Some(&rec.doc_path));
            let doc: Value = if member {
                integration_member_entry(&loaded, &rec.name, &rec.doc_path).cloned().unwrap_or(Value::Null)
            } else {
                loaded.clone()
            };
            let file_name = doc_stem(&rec.doc_path);
            let hold = integration_record_hold(&rec.name, Some(&rec.doc_path));
            if hold == NameHold::Doc {
                g.documented.entry(rec.name.clone()).or_default().insert(rec.doc_path.clone());
            }
            if renamed.contains(&rec.doc_path) && !member {
                g.documented.entry(file_name.clone()).or_default().insert(rec.doc_path.clone());
            }
            let has_doc = super::cand::truthy(&doc);
            let mut m = Map::new();
            m.insert("domain".into(), "component".into());
            m.insert("name".into(), Value::String(rec.name.clone()));
            m.insert(
                "aliases".into(),
                Value::Array(if !member && file_name != rec.name { vec![Value::String(file_name.clone())] } else { vec![] }),
            );
            m.insert("_hold".into(), Value::String(if hold == NameHold::Doc { "doc" } else { "file" }.into()));
            m.insert("_docPath".into(), Value::String(rec.doc_path.to_string_lossy().into()));
            m.insert("keywords".into(), if has_doc { arr(doc.get("keywords")) } else { Value::Array(vec![]) });
            m.insert("description".into(), if has_doc { description_of(&doc) } else { Value::String(String::new()) });
            m.insert("guidance".into(), Value::Array(guidance_from(&doc)));
            if has_doc {
                if let Some(d) = doc.get("deprecated").filter(|d| super::cand::truthy(d)) {
                    m.insert("_deprecated".into(), d.clone());
                }
            }
            if let Some((fam, i)) = places.get(&rec.name) {
                m.insert("_family".into(), Value::String(fam.clone()));
                m.insert("_familyIndex".into(), Value::from(*i));
            }
            let package = if rec.package.is_empty() { integration.name.clone() } else { rec.package.clone() };
            m.insert("_package".into(), Value::String(package));
            let authored = loaded.get("import").and_then(|v| v.as_str());
            let owner = ImportOwner {
                exports_map: integration.package_exports.clone(),
                package_dir: integration.package_dir.clone(),
                doc_path: Some(rec.doc_path.clone()),
                package_name: rec.package.clone(),
            };
            m.insert("_import".into(), Value::String(resolve_integration_import_path(&owner, &rec.name, authored)));
            g.candidates.push(m);
        }
    }
    g
}

/// `gatherComponents(coreDir, cwd)`: Core's plus every integration's, with
/// the owner rule and component replacements applied.
pub fn gather_components(core_dir: &Path, cwd: &Path) -> Result<Vec<Value>, String> {
    scandir_check(&core_dir.join("src"))?;
    let integrations = deps::load_integrations_safely(cwd);
    let core = gather_core_components(core_dir);
    if integrations.is_empty() {
        return Ok(core);
    }
    let ig = gather_integration_components(&integrations);
    let list_cmd = crate::cli::env::format_cli_command_at(cwd, "component --list");
    let replacements =
        crate::discovery::component_replacement::resolve_component_replacements(Some(core_dir), &integrations, &list_cmd);
    let target_of: HashMap<(String, String), String> = replacements
        .active
        .iter()
        .map(|a| ((a.package.clone(), a.name.clone()), a.target.clone()))
        .collect();
    let core_names: HashSet<String> = core.iter().map(|c| c["name"].as_str().unwrap_or("").to_string()).collect();
    let opens = |name: &str, c: &Map<String, Value>| -> bool {
        let doc = c.get("_docPath").and_then(|d| d.as_str()).map(PathBuf::from);
        !core_names.contains(name)
            && find_component_readme(core_dir, name).is_none()
            && ig.file_named.get(name).is_none_or(|s| s.iter().all(|d| Some(d) == doc.as_ref()))
            && ig.documented.get(name).is_none_or(|s| s.iter().all(|d| Some(d) == doc.as_ref()))
    };
    let cwd_s = cwd.to_string_lossy().to_string();
    let mut externals: Option<Vec<crate::discovery::paths::ExternalPackage>> = None;
    let mut legacy_documents = |name: &str| -> bool {
        externals
            .get_or_insert_with(|| crate::discovery::paths::discover_external_packages(&cwd_s))
            .iter()
            .any(|e| {
                find_external_component_doc(Path::new(&e.docs_dir), name)
                    .is_some_and(|p| p.to_string_lossy().ends_with(".doc.mjs"))
            })
    };
    let ruled: Vec<Map<String, Value>> = ig
        .candidates
        .iter()
        .map(|c| {
            let name = c["name"].as_str().unwrap_or("").to_string();
            let aliases: Vec<Value> = c["aliases"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter(|a| opens(a.as_str().unwrap_or(""), c))
                .collect();
            let mut out = c.clone();
            out.insert("aliases".into(), Value::Array(aliases));
            if c["_hold"] == "doc" && (!opens(&name, c) || legacy_documents(&name)) {
                out.insert(
                    "_command".into(),
                    Value::String(format!(
                        "astryx component {} --package {}",
                        name,
                        c["_package"].as_str().unwrap_or("")
                    )),
                );
            }
            out
        })
        .collect();
    let mut result: Vec<Value> = core
        .into_iter()
        .filter(|c| replacements.for_target(c["name"].as_str().unwrap_or("")).is_none())
        .collect();
    let (plain, commanded): (Vec<_>, Vec<_>) = ruled.into_iter().partition(|c| !c.contains_key("_command"));
    for mut c in plain.into_iter().chain(commanded) {
        let name = c["name"].as_str().unwrap_or("").to_string();
        let pkg = c["_package"].as_str().unwrap_or("").to_string();
        if let Some(target) = target_of.get(&(pkg.clone(), name.clone())) {
            if let Some(Value::Array(a)) = c.get_mut("aliases") {
                a.push(Value::String(target.clone()));
            }
        } else if let Some(sh) = replacements.for_target(&name) {
            if sh.package != pkg {
                c.insert("_command".into(), Value::String(format!("astryx component {name} --package {pkg}")));
            }
        }
        result.push(Value::Object(c));
    }
    Ok(result)
}

/// The error Node's `readdirSync` throws for a folder it cannot list.
pub fn scandir_check(dir: &Path) -> Result<(), String> {
    match std::fs::metadata(dir) {
        Ok(m) if m.is_dir() => Ok(()),
        Ok(_) => Err(format!("ENOTDIR: not a directory, scandir '{}'", dir.display())),
        Err(_) => Err(format!("ENOENT: no such file or directory, scandir '{}'", dir.display())),
    }
}

/// `componentKeywords(coreDir, cwd)`: every component the project can use,
/// with the keywords its own doc declares.
pub fn component_keywords(core_dir: &Path, cwd: &Path) -> Result<Vec<(String, Vec<String>)>, String> {
    scandir_check(&core_dir.join("src"))?;
    preload_core(core_dir, true, false);
    let integrations = deps::load_integrations_safely(cwd);
    let list_cmd = crate::cli::env::format_cli_command_at(cwd, "component --list");
    let replacements =
        crate::discovery::component_replacement::resolve_component_replacements(Some(core_dir), &integrations, &list_cmd);
    let kw = |c: &Value| -> (String, Vec<String>) {
        (
            c["name"].as_str().unwrap_or("").to_string(),
            c["keywords"].as_array().map(|a| a.iter().map(super::cand::js_str).collect()).unwrap_or_default(),
        )
    };
    let mut out: Vec<(String, Vec<String>)> = gather_core_components(core_dir)
        .iter()
        .filter(|c| replacements.for_target(c["name"].as_str().unwrap_or("")).is_none())
        .map(kw)
        .collect();
    let ig = gather_integration_components(&integrations);
    out.extend(ig.candidates.iter().map(|m| kw(&Value::Object(m.clone()))));
    Ok(out)
}

/// `subjectName(t)`: the display name as another name and title, when it
/// names the block's subject.
fn subject_name(display: &str, example_for: &str) -> Option<String> {
    let name = super::words::js_trim(display).to_string();
    let words = super::words::words_of(&name);
    let subject = super::words::words_of(example_for);
    if words.len() < 2 || subject.is_empty() {
        return None;
    }
    if subject.iter().all(|s| words.iter().any(|w| super::words::same_word(s, w))) {
        Some(name)
    } else {
        None
    }
}

/// One template candidate (`gatherTemplates`' map), for a template the
/// compiled file does not hold.
fn template_candidate(t: &crate::commands::template::discovery::Template) -> Value {
    let command_name = t.replaces.clone().unwrap_or_else(|| t.dir_name.clone());
    let mut keywords: Vec<Value> = match &t.components_used {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    };
    for id in t.lookup_ids() {
        if id != command_name {
            keywords.push(Value::String(id.to_string()));
        }
    }
    let mut weak: Vec<Value> = Vec::new();
    if t.kind == "page" {
        if !t.file_path.is_empty() {
            if let Ok(source) = std::fs::read_to_string(&t.file_path) {
                weak = crate::commands::template::source::components_in_source(&source)
                    .into_iter()
                    .map(Value::String)
                    .collect();
            }
        }
        if !t.category.is_empty() {
            for w in t.category.split(|c: char| !c.is_ascii_alphanumeric()).filter(|w| !w.is_empty()) {
                keywords.push(Value::String(w.to_string()));
            }
        }
    }
    let mut m = Map::new();
    m.insert("domain".into(), "template".into());
    m.insert("name".into(), Value::String(command_name.clone()));
    m.insert("keywords".into(), Value::Array(keywords));
    m.insert("weakKeywords".into(), Value::Array(weak));
    m.insert("description".into(), Value::String(t.description.clone()));
    m.insert("prose".into(), Value::Array(t.keywords.iter().cloned().map(Value::String).collect()));
    if let Some(name) = subject_name(t.display_name.as_deref().unwrap_or(&t.name), t.example_for.as_deref().unwrap_or("")) {
        m.insert("aliases".into(), Value::Array(vec![Value::String(name.clone())]));
        m.insert("titles".into(), Value::Array(vec![Value::String(name)]));
    }
    m.insert("_displayName".into(), Value::String(t.name.clone()));
    m.insert("_package".into(), Value::String(t.pkg().to_string()));
    m.insert("_kind".into(), Value::String(t.kind.clone()));
    m.insert("_resultName".into(), Value::String(t.dir_name.clone()));
    m.insert("_commandName".into(), Value::String(command_name));
    Value::Object(m)
}

/// `gatherTemplates(cwd)`: the compiled candidates for the CLI's own
/// templates, the others built from template discovery, in its order.
pub fn gather_templates(cli_root: &Path, cwd: &Path) -> Vec<Value> {
    let cwd_s = cwd.to_string_lossy().to_string();
    let all = crate::commands::template::discovery::discover_all(cli_root, &cwd_s);
    if all.iter().all(|t| t.pkg() == CORE_PACKAGE && t.replaces.is_none()) {
        return own_templates();
    }
    let own: HashMap<(String, String), Value> = own_templates()
        .into_iter()
        .map(|c| {
            (
                (c["_kind"].as_str().unwrap_or("").to_string(), c["_resultName"].as_str().unwrap_or("").to_string()),
                c,
            )
        })
        .collect();
    all.iter()
        .map(|t| {
            if t.pkg() == CORE_PACKAGE && t.replaces.is_none() {
                if let Some(c) = own.get(&(t.kind.clone(), t.dir_name.clone())) {
                    return c.clone();
                }
            }
            template_candidate(t)
        })
        .collect()
}

/// `gatherThemes(cwd)`.
pub fn gather_themes(cli_root: &Path, cwd: &Path) -> Vec<Value> {
    let themes = crate::commands::theme::discovery::available(cli_root, &cwd.to_string_lossy(), true);
    themes
        .into_iter()
        .map(|t| {
            let mut m = Map::new();
            m.insert("domain".into(), "theme".into());
            m.insert("name".into(), Value::String(t.slug.clone()));
            m.insert(
                "aliases".into(),
                Value::Array(if t.display_name.is_empty() { vec![] } else { vec![Value::String(t.display_name.clone())] }),
            );
            m.insert("description".into(), Value::String(t.description.clone()));
            if !t.display_name.is_empty() {
                m.insert("_displayName".into(), Value::String(t.display_name.clone()));
            }
            m.insert("_package".into(), Value::String(t.package.clone()));
            Value::Object(m)
        })
        .collect()
}

// ── Integration docs ────────────────────────────────────────────────
// TEMP: a project's integration topics, read here until the docs lane's
// runtime catalog serves them: a generic topic with no namespace, placed in
// the guides level, as the docs tree places it.

/// `sectionTitleKey` / `sectionKey`.
fn section_key(section: &Value) -> String {
    if let Some(id) = section.get("id").and_then(|v| v.as_str()) {
        return id.to_string();
    }
    crate::commands::docs::sections::section_title_key(section.get("title").and_then(|v| v.as_str()).unwrap_or(""))
}

/// `sectionSummary(section)`.
fn section_summary(section: &Value) -> String {
    let empty = Vec::new();
    let content = section.get("content").and_then(|c| c.as_array()).unwrap_or(&empty);
    let first = content.iter().find(|b| {
        (b["type"] == "prose" && b["text"].is_string()) || (b["type"] == "list" && b["items"].is_array())
    });
    let raw = match first {
        None => String::new(),
        Some(b) if b["type"] == "prose" => super::cand::js_str(&b["text"]),
        Some(b) => b["items"].get(0).map(|x| if x.is_null() { String::new() } else { super::cand::js_str(x) }).unwrap_or_default(),
    };
    let text = super::words::js_trim(&super::words::split_ws(&raw).join(" ")).to_string();
    let max = 240usize;
    let u: Vec<u16> = text.encode_utf16().collect();
    if u.len() <= max {
        return text;
    }
    let cut = String::from_utf16_lossy(&u[..max - 1]);
    let space = cut.rfind(' ').map(|b| super::words::jlen(&cut[..b]));
    let kept = match space {
        Some(sp) if sp > max / 2 => String::from_utf16_lossy(&u[..sp]),
        _ => cut,
    };
    format!("{}…", kept.trim_end())
}

fn headings(section: &Value) -> Vec<String> {
    section
        .get("content")
        .and_then(|c| c.as_array())
        .map(|a| {
            a.iter()
                .filter(|b| b["type"] == "heading" && super::cand::truthy(&b["text"]))
                .map(|b| super::cand::js_str(&b["text"]))
                .collect()
        })
        .unwrap_or_default()
}

fn plain_cell(v: &Value) -> String {
    let s = if v.is_null() { String::new() } else { super::cand::js_str(v) };
    super::words::unlink_text(&s).replace('`', "")
}

/// `sectionProse(section)`.
fn section_prose(section: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if super::cand::truthy(&section["title"]) {
        out.push(super::cand::js_str(&section["title"]));
    }
    for b in section.get("content").and_then(|c| c.as_array()).into_iter().flatten() {
        let t = b["type"].as_str().unwrap_or("");
        if (t == "prose" || t == "heading") && super::cand::truthy(&b["text"]) {
            out.push(super::cand::js_str(&b["text"]));
        } else if t == "list" && b["items"].is_array() {
            for item in b["items"].as_array().unwrap() {
                let text = if item.is_string() { item.clone() } else { item.get("text").cloned().unwrap_or(Value::Null) };
                if let Some(s) = text.as_str() {
                    out.push(s.to_string());
                }
            }
        } else if t == "table" && b["rows"].is_array() {
            for row in b["rows"].as_array().unwrap() {
                out.push(row.as_array().map(|r| r.iter().map(plain_cell).collect::<Vec<_>>().join(" ")).unwrap_or_default());
            }
        } else if t == "code" && b["code"].is_string() {
            let mut parts = Vec::new();
            if super::cand::truthy(&b["label"]) {
                parts.push(super::cand::js_str(&b["label"]));
            }
            if super::cand::truthy(&b["code"]) {
                parts.push(super::cand::js_str(&b["code"]));
            }
            out.push(parts.join(" "));
        }
    }
    out
}

/// `codeTerms(part)`: identifiers in code ticks, 2 to 40 non-space chars.
fn code_terms(part: &Value) -> Vec<String> {
    let mut terms: Vec<String> = Vec::new();
    let mut scan = |text: &str| {
        let mut rest = text;
        while let Some(a) = rest.find('`') {
            let after = &rest[a + 1..];
            match after.find('`') {
                Some(b) => {
                    let inner = &after[..b];
                    let n = super::words::jlen(inner);
                    if (2..=40).contains(&n) && !inner.chars().any(super::words::js_space) {
                        if !terms.iter().any(|t| t == inner) {
                            terms.push(inner.to_string());
                        }
                        rest = &after[b + 1..];
                    } else {
                        rest = after;
                    }
                }
                None => break,
            }
        }
    };
    for b in part.get("content").and_then(|c| c.as_array()).into_iter().flatten() {
        let t = b["type"].as_str().unwrap_or("");
        if t == "prose" {
            scan(&if b["text"].is_null() { String::new() } else { super::cand::js_str(&b["text"]) });
        } else if t == "list" && b["items"].is_array() {
            for item in b["items"].as_array().unwrap() {
                let v = if item.is_string() { item.clone() } else { item.get("text").cloned().unwrap_or(Value::Null) };
                scan(&if v.is_null() { String::new() } else { super::cand::js_str(&v) });
            }
        } else if t == "table" && b["rows"].is_array() {
            for row in b["rows"].as_array().unwrap() {
                for cell in row.as_array().into_iter().flatten() {
                    scan(&if cell.is_null() { String::new() } else { super::cand::js_str(cell) });
                }
            }
        }
    }
    terms
}

/// `topicCandidates(...)` for a flat topic.
fn topic_candidates(name: &str, doc: &Value, path: &str, parent: &str, pkg: &str) -> Vec<Value> {
    let sections: Vec<Value> = doc.get("sections").and_then(|s| s.as_array()).cloned().unwrap_or_default();
    let split = sections.len() > 1;
    let title = doc.get("title").filter(|t| super::cand::truthy(t)).map(super::cand::js_str);
    let doc_title = path.to_string();
    let leaf = &name[name.rfind('/').map_or(0, |i| i + 1)..];
    let mut keywords: Vec<Value> = Vec::new();
    if leaf != name {
        keywords.push(Value::String(leaf.replace('-', " ")));
    }
    if let Some(t) = &title {
        keywords.push(Value::String(t.clone()));
    }
    let declared = arr(doc.get("keywords"));
    keywords.extend(declared.as_array().cloned().unwrap_or_default());
    let mut titles: Vec<Value> = vec![Value::String(title.clone().unwrap_or_else(|| name.to_string()))];
    let prose: Vec<Value> = if split {
        sections.iter().filter(|s| super::cand::truthy(&s["title"])).map(|s| s["title"].clone()).collect()
    } else {
        sections.iter().flat_map(section_prose).map(Value::String).collect()
    };
    if !split {
        for s in &sections {
            if super::cand::truthy(&s["title"]) {
                titles.push(s["title"].clone());
            }
            titles.extend(headings(s).into_iter().map(Value::String));
        }
    }
    let mut m = Map::new();
    m.insert("domain".into(), "doc".into());
    m.insert("name".into(), Value::String(name.into()));
    m.insert("keywords".into(), Value::Array(keywords));
    m.insert("_declared".into(), declared);
    m.insert("description".into(), doc.get("description").filter(|d| super::cand::truthy(d)).cloned().unwrap_or(Value::String(String::new())));
    m.insert("prose".into(), Value::Array(prose));
    m.insert("titles".into(), Value::Array(titles));
    m.insert("_topic".into(), Value::String(name.into()));
    m.insert("_title".into(), Value::String(doc_title.clone()));
    m.insert(
        "_command".into(),
        Value::String(if split { format!("astryx docs {name} --index") } else { format!("astryx docs {name}") }),
    );
    m.insert("_parent".into(), Value::String(parent.into()));
    m.insert("_package".into(), Value::String(pkg.into()));
    let mut out = vec![Value::Object(m)];
    if !split {
        return out;
    }
    for s in &sections {
        let key = section_key(s);
        let st = super::cand::js_str(&s["title"]);
        let mut kw: Vec<Value> = Vec::new();
        if super::cand::truthy(&s["title"]) {
            kw.push(s["title"].clone());
        }
        kw.extend(headings(s).into_iter().map(Value::String));
        kw.extend(code_terms(s).into_iter().map(Value::String));
        let mut titles: Vec<Value> = Vec::new();
        if super::cand::truthy(&s["title"]) {
            titles.push(s["title"].clone());
        }
        titles.extend(headings(s).into_iter().map(Value::String));
        let mut m = Map::new();
        m.insert("domain".into(), "doc".into());
        m.insert("name".into(), Value::String(key.clone()));
        m.insert("keywords".into(), Value::Array(kw));
        m.insert("description".into(), Value::String(section_summary(s)));
        m.insert("prose".into(), Value::Array(section_prose(s).into_iter().map(Value::String).collect()));
        m.insert("titles".into(), Value::Array(titles));
        m.insert("_topic".into(), Value::String(name.into()));
        m.insert("_section".into(), Value::String(key.clone()));
        m.insert("_title".into(), Value::String(format!("{doc_title} › {st}")));
        m.insert("_command".into(), Value::String(format!("astryx docs {name} {key}")));
        m.insert("_parent".into(), Value::String(format!("astryx docs {name} --index")));
        m.insert("_package".into(), Value::String(pkg.into()));
        out.push(Value::Object(m));
    }
    out
}

/// The doc candidates a project's integrations add, and where they go among
/// the CLI's own (after its topics).
pub fn integration_docs(cwd: &Path) -> Vec<Value> {
    let Ok(project) = crate::discovery::project::Project::load(&cwd.to_string_lossy()) else { return Vec::new() };
    let mut out = Vec::new();
    for r in project.contributing() {
        let Some(dir) = crate::discovery::integrations::s(r, "docs").map(String::from) else { continue };
        let pkg = crate::discovery::integrations::s(r, "name").unwrap_or("").to_string();
        let mut files: Vec<String> = list_dir(Path::new(&dir))
            .into_iter()
            .filter(|f| f.ends_with(".doc.mjs") || f.ends_with(".doc.ts") || f.ends_with(".doc.js"))
            .collect();
        files.sort();
        for f in files {
            let path = Path::new(&dir).join(&f);
            let Ok(ns) = crate::js::import_module(&path, &crate::js::ImportOptions::default()) else { continue };
            let Some(doc) = ns.get("default").filter(|d| d.is_object()) else { continue };
            if doc["type"] != "generic" || doc.get("namespace").is_some_and(|n| !n.is_null()) {
                continue;
            }
            if doc.get("stability").and_then(|s| s.as_str()) == Some("experimental") {
                continue;
            }
            let stem = f.split(".doc.").next().unwrap_or(&f).to_string();
            let name = doc.get("name").and_then(|n| n.as_str()).map(String::from).unwrap_or(stem);
            let title = doc.get("title").filter(|t| super::cand::truthy(t)).map(super::cand::js_str).unwrap_or_else(|| name.clone());
            out.extend(topic_candidates(&name, doc, &format!("Guides › {title}"), "astryx docs guides", &pkg));
        }
    }
    out
}

/// Where integration topics go among the CLI's own doc candidates.
pub fn own_topic_count() -> usize {
    own()["topicCount"].as_u64().unwrap_or(0) as usize
}
