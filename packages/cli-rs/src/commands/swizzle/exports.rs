//! TEMP: replace with src/discovery (module-exports, package-exports,
//! exports-subpaths, fs/paths) when the discovery lane lands them. Only the
//! parts swizzle reads are here.

use super::jspath as p;
use super::module_info::{read_module, DefaultKind, ImpKind, ModuleInfo};
use crate::json::Value;
use indexmap::IndexMap;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

pub const MODULE_EXTENSIONS: &[&str] = &[".mjs", ".js", ".cjs", ".mts", ".ts", ".cts", ".tsx", ".jsx"];

thread_local! {
    static STRICT: RefCell<HashMap<String, Rc<ModuleInfo>>> = RefCell::new(HashMap::new());
    static LOOSE: RefCell<HashMap<String, Rc<ModuleInfo>>> = RefCell::new(HashMap::new());
    static TEXTS: RefCell<HashMap<String, Rc<String>>> = RefCell::new(HashMap::new());
}

pub fn module_text(file: &str) -> Option<Rc<String>> {
    if let Some(t) = TEXTS.with(|c| c.borrow().get(file).cloned()) {
        return Some(t);
    }
    let t = Rc::new(p::read_to_string(file)?);
    TEXTS.with(|c| c.borrow_mut().insert(file.to_string(), t.clone()));
    Some(t)
}

/// Forget every read file (a later step of the same run may change files).
pub fn clear_caches() {
    STRICT.with(|c| c.borrow_mut().clear());
    LOOSE.with(|c| c.borrow_mut().clear());
    TEXTS.with(|c| c.borrow_mut().clear());
}

/// The module-exports reader's parse (no error recovery): None when it
/// fails.
pub fn parse_strict(file: &str) -> Option<Rc<ModuleInfo>> {
    if let Some(m) = STRICT.with(|c| c.borrow().get(file).cloned()) {
        return if m.parsed { Some(m) } else { None };
    }
    let text = module_text(file)?;
    let m = Rc::new(read_module(&text, file, true));
    STRICT.with(|c| c.borrow_mut().insert(file.to_string(), m.clone()));
    if m.parsed {
        Some(m)
    } else {
        None
    }
}

/// The swizzle graph's parse (error recovery on).
pub fn parse_loose(file: &str, text: &str) -> Rc<ModuleInfo> {
    if let Some(m) = LOOSE.with(|c| c.borrow().get(file).cloned()) {
        return m;
    }
    let m = Rc::new(read_module(text, file, false));
    LOOSE.with(|c| c.borrow_mut().insert(file.to_string(), m.clone()));
    m
}

pub fn resolve_local_module(specifier: &str, from_file: &str) -> Option<String> {
    crate::discovery::module_origins::resolve_local_module(specifier, from_file)
}

fn resolve_module_or_package(specifier: &str, from_file: &str) -> Option<String> {
    crate::discovery::module_origins::resolve_module_or_package(specifier, from_file)
}


pub fn read_json(file: &str) -> Option<Value> {
    serde_json::from_str(&p::read_to_string(file)?).ok()
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Origin {
    pub file: String,
    pub name: String,
}

pub type Origins = IndexMap<String, Origin>;

/// One `moduleExportOrigins` memo (per read mode), shared by a whole copy.
#[derive(Default)]
pub struct OriginsMemo {
    memo: HashMap<String, Rc<Origins>>,
}

struct Reading {
    types: bool,
    open: HashMap<String, (usize, Rc<RefCell<Origins>>)>,
}

impl OriginsMemo {
    pub fn origins(&mut self, file: &str, types: bool) -> Rc<Origins> {
        let mut read = Reading { types, open: HashMap::new() };
        let (o, _) = self.origins_of(file, &mut read);
        o
    }

    fn origins_of(&mut self, file: &str, read: &mut Reading) -> (Rc<Origins>, usize) {
        let key = format!("{}\0{}", if read.types { "type" } else { "value" }, file);
        if let Some(k) = self.memo.get(&key) {
            return (k.clone(), usize::MAX);
        }
        if let Some((depth, o)) = read.open.get(&key) {
            return (Rc::new(o.borrow().clone()), *depth);
        }
        let depth = read.open.len();
        let origins = Rc::new(RefCell::new(Origins::new()));
        read.open.insert(key.clone(), (depth, origins.clone()));
        let mut low = usize::MAX;
        self.fill(file, read, &origins, &mut low);
        read.open.remove(&key);
        let done = Rc::new(origins.borrow().clone());
        if low >= depth {
            self.memo.insert(key, done.clone());
        }
        (done, low)
    }

    fn fill(&mut self, file: &str, read: &mut Reading, origins: &Rc<RefCell<Origins>>, low: &mut usize) {
        if !p::is_file(file) {
            return;
        }
        let Some(ast) = parse_strict(file) else { return };
        let types = read.types;
        let mut named: HashSet<String> = HashSet::new();
        let (decls, specs) = named_export_index(&ast, types);
        for di in &decls {
            for name in di.names(types) {
                named.insert(name.clone());
                if !origins.borrow().contains_key(&name) {
                    let o = declared_origin(&ast, file, di, &name, types, &mut HashSet::new());
                    origins.borrow_mut().insert(name, o);
                }
            }
        }
        for (export_name, entries) in &specs {
            named.insert(export_name.clone());
            if origins.borrow().contains_key(export_name) {
                continue;
            }
            for (source, local) in entries {
                let mut origin = None;
                if let Some(src) = source {
                    if let Some(target) = resolve_module_or_package(src, file) {
                        let (res, rlow) = self.origins_of(&target, read);
                        *low = (*low).min(rlow);
                        origin = res.get(local).cloned().or_else(|| {
                            if rlow < usize::MAX {
                                export_origin(&target, local, &mut HashSet::new(), types)
                            } else {
                                None
                            }
                        });
                    }
                } else {
                    origin = binding_origin(&ast, file, local, &mut HashSet::new(), types);
                }
                if let Some(o) = origin {
                    origins.borrow_mut().insert(export_name.clone(), o);
                    break;
                }
                if source.is_none() {
                    break;
                }
            }
        }
        if let Some(def) = ast.export_default.first() {
            named.insert("default".into());
            if !origins.borrow().contains_key("default") {
                let skip = !types && matches!(def, DefaultKind::Other { runtime: false });
                // A skipped declaration is followed by the next one, as the
                // JS loop `continue`s.
                let pick = if skip {
                    ast.export_default.iter().skip(1).find(|d| !matches!(d, DefaultKind::Other { runtime: false }))
                } else {
                    Some(def)
                };
                if let Some(d) = pick {
                    let o = match d {
                        DefaultKind::Identifier(n) => binding_origin(&ast, file, n, &mut HashSet::new(), types),
                        _ => Some(Origin { file: file.to_string(), name: "default".into() }),
                    };
                    if let Some(o) = o {
                        origins.borrow_mut().insert("default".into(), o);
                    }
                }
            }
        }
        for ea in &ast.export_all {
            if (ea.type_only && !types) || ea.exported.is_some() {
                continue;
            }
            let Some(target) = resolve_module_or_package(&ea.source, file) else { continue };
            let (res, rlow) = self.origins_of(&target, read);
            *low = (*low).min(rlow);
            for (name, o) in res.iter() {
                if name != "default" && !named.contains(name) && !origins.borrow().contains_key(name) {
                    origins.borrow_mut().insert(name.clone(), o.clone());
                }
            }
        }
    }
}

type SpecIndex = IndexMap<String, Vec<(Option<String>, String)>>;

fn named_export_index(ast: &ModuleInfo, types: bool) -> (Vec<super::module_info::DeclInfo>, SpecIndex) {
    let mut decls = Vec::new();
    let mut specs: SpecIndex = IndexMap::new();
    for n in &ast.export_named {
        if n.type_only && !types {
            continue;
        }
        if let Some(d) = &n.declaration {
            decls.push(d.clone());
        }
        for s in &n.specifiers {
            if s.type_only && !types {
                continue;
            }
            specs.entry(s.exported.clone()).or_default().push((n.source.clone(), s.local.clone()));
        }
    }
    (decls, specs)
}

fn declared_origin(
    ast: &ModuleInfo,
    file: &str,
    di: &super::module_info::DeclInfo,
    name: &str,
    types: bool,
    seen: &mut HashSet<String>,
) -> Origin {
    for (n, init) in &di.const_inits {
        if n == name {
            return binding_origin(ast, file, init, seen, types).unwrap_or(Origin { file: file.into(), name: name.into() });
        }
    }
    Origin { file: file.into(), name: name.into() }
}

fn binding_origin(ast: &ModuleInfo, file: &str, local: &str, seen: &mut HashSet<String>, types: bool) -> Option<Origin> {
    for imp in &ast.imports {
        if imp.type_only && !types {
            continue;
        }
        for s in &imp.specifiers {
            if s.local != local {
                continue;
            }
            let ImpKind::Named(imported) = &s.kind else { return None };
            let target = resolve_module_or_package(&imp.source, file)?;
            return export_origin(&target, imported, seen, types);
        }
    }
    Some(Origin { file: file.into(), name: local.into() })
}

pub fn export_origin(file: &str, export_name: &str, seen: &mut HashSet<String>, types: bool) -> Option<Origin> {
    let identity = format!("{file}\0{export_name}");
    if seen.contains(&identity) {
        return None;
    }
    seen.insert(identity);
    if !p::is_file(file) {
        return None;
    }
    let ast = parse_strict(file)?;
    let (decls, specs) = named_export_index(&ast, types);
    for di in &decls {
        if di.names(types).iter().any(|n| n == export_name) {
            return Some(declared_origin(&ast, file, di, export_name, types, seen));
        }
    }
    if let Some(entries) = specs.get(export_name) {
        for (source, local) in entries {
            if let Some(src) = source {
                let target = resolve_module_or_package(src, file);
                if let Some(t) = target {
                    if let Some(o) = export_origin(&t, local, seen, types) {
                        return Some(o);
                    }
                }
                continue;
            }
            return binding_origin(&ast, file, local, seen, types);
        }
    }
    if export_name == "default" {
        for d in &ast.export_default {
            if !types && matches!(d, DefaultKind::Other { runtime: false }) {
                continue;
            }
            return match d {
                DefaultKind::Identifier(n) => binding_origin(&ast, file, n, seen, types),
                _ => Some(Origin { file: file.into(), name: "default".into() }),
            };
        }
    }
    for ea in &ast.export_all {
        if (ea.type_only && !types) || ea.exported.is_some() {
            continue;
        }
        if let Some(t) = resolve_module_or_package(&ea.source, file) {
            if let Some(o) = export_origin(&t, export_name, seen, types) {
                return Some(o);
            }
        }
    }
    None
}

// ---- package-exports (discovery) ----

pub struct PackageExport {
    pub exported: bool,
    pub target: Option<String>,
}

pub fn inspect_package_export(pkg: &Value, package_dir: &str, subpath: &str) -> PackageExport {
    let name = pkg.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let r = crate::discovery::package_exports::inspect_package_export(name, pkg.get("exports"), std::path::Path::new(package_dir), subpath);
    PackageExport { exported: r.exported, target: r.target.map(|t| t.to_string_lossy().into_owned()) }
}

pub fn source_export_target(pkg: &Value, package_dir: &str, subpath: &str) -> Option<String> {
    crate::discovery::package_exports::source_export_target(pkg.get("exports"), std::path::Path::new(package_dir), subpath)
        .map(|t| t.to_string_lossy().into_owned())
}

/// UTF-16 length, as JS `.length`.
fn jlen(s: &str) -> usize {
    s.encode_utf16().count()
}

// ---- exports-subpaths ----

pub fn all_targets(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::String(s) => out.push(s.clone()),
        Value::Array(a) => a.iter().for_each(|x| all_targets(x, out)),
        Value::Object(m) => m.values().for_each(|x| all_targets(x, out)),
        _ => {}
    }
}

fn importable(v: &Value) -> bool {
    match v {
        Value::String(_) => true,
        Value::Array(a) => a.iter().any(importable),
        Value::Object(m) => m.iter().any(|(c, t)| c != "require" && c != "types" && importable(t)),
        _ => false,
    }
}

/// Whether `subpathDeclaration(...).state === 'declared'`.
pub fn subpath_declared(exports: Option<&Value>, subpath: &str) -> bool {
    let Some(ex) = exports.filter(|e| !e.is_null()) else { return false };
    let is_map = matches!(ex, Value::Object(m) if m.keys().all(|k| k.starts_with('.')));
    if !is_map {
        return subpath == "." && importable(ex);
    }
    let map = ex.as_object().unwrap();
    let hit = if let Some(v) = map.get(subpath) {
        Some(v)
    } else {
        let mut pats: Vec<&String> = map.keys().filter(|k| k.split('*').count() == 2).collect();
        pats.sort_by(|a, b| {
            let (sa, sb) = (jlen(&a[..a.find('*').unwrap()]), jlen(&b[..b.find('*').unwrap()]));
            sb.cmp(&sa).then(jlen(b).cmp(&jlen(a)))
        });
        pats.into_iter()
            .find(|pat| {
                let star = pat.find('*').unwrap();
                let (pre, suf) = (&pat[..star], &pat[star + 1..]);
                subpath.len() >= pre.len() + suf.len() && subpath.starts_with(pre) && subpath.ends_with(suf)
            })
            .map(|k| &map[k.as_str()])
    };
    match hit {
        None => false,
        Some(v) if v.is_null() => false,
        Some(v) => importable(v),
    }
}

// ---- fs/paths ----

fn installed_in(dir: &str, name: &str) -> Option<String> {
    let mut parts = vec![dir, "node_modules"];
    parts.extend(name.split('/'));
    let cand = p::join(&parts);
    if p::exists(&p::join2(&cand, "package.json")) {
        Some(cand)
    } else {
        None
    }
}

pub fn folders_up(start: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut dir = p::resolve1(start);
    loop {
        out.push(dir.clone());
        let parent = p::dirname(&dir);
        if parent == dir {
            break;
        }
        dir = parent;
    }
    out
}

/// `findNodeModulesPackage`: (packageDir, hostDir).
pub fn find_node_modules_package(start: &str, name: &str) -> Option<(String, String)> {
    for dir in folders_up(start) {
        if let Some(pd) = installed_in(&dir, name) {
            return Some((pd, dir));
        }
    }
    None
}

pub fn find_package_root(start: &str) -> Option<String> {
    folders_up(start).into_iter().find(|d| p::exists(&p::join2(d, "package.json")))
}


/// `findProjectCoreDir`.
pub fn find_project_core_dir(start: &str) -> Option<String> {
    crate::discovery::paths::find_project_core_dir(start)
}

/// `listComponents(coreDir)`.
pub fn list_components(core_dir: &str) -> Vec<String> {
    let src = p::join2(core_dir, "src");
    let Ok(rd) = std::fs::read_dir(&src) else { return Vec::new() };
    let mut v: Vec<String> = rd
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.chars().next().map(|c| c.is_ascii_uppercase()).unwrap_or(false))
        .collect();
    v.sort();
    v
}

// ---- served-packages / node:module ----

pub fn package_of(spec: &str) -> String {
    if spec.starts_with('@') {
        spec.split('/').take(2).collect::<Vec<_>>().join("/")
    } else {
        spec.split('/').next().unwrap_or("").to_string()
    }
}

const BUILTINS: &[&str] = &[
    "_http_agent", "_http_client", "_http_common", "_http_incoming", "_http_outgoing", "_http_server", "_stream_duplex",
    "_stream_passthrough", "_stream_readable", "_stream_transform", "_stream_wrap", "_stream_writable", "_tls_common",
    "_tls_wrap", "assert", "assert/strict", "async_hooks", "buffer", "child_process", "cluster", "console", "constants",
    "crypto", "dgram", "diagnostics_channel", "dns", "dns/promises", "domain", "events", "fs", "fs/promises", "http",
    "http2", "https", "inspector", "inspector/promises", "module", "net", "os", "path", "path/posix", "path/win32",
    "perf_hooks", "process", "punycode", "querystring", "readline", "readline/promises", "repl", "stream",
    "stream/consumers", "stream/promises", "stream/web", "string_decoder", "sys", "timers", "timers/promises", "tls",
    "trace_events", "tty", "url", "util", "util/types", "v8", "vm", "wasi", "worker_threads", "zlib",
];

/// `isBuiltin(spec)` from node:module (a `node:` prefix is checked by the caller).
pub fn is_builtin(spec: &str) -> bool {
    BUILTINS.contains(&spec)
}
