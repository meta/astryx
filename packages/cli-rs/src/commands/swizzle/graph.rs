//! Port of api/swizzle/_moduleGraph.mjs: for each module a component
//! reaches, whether the copy imports it from the owner package's public
//! exports or carries it in the output, and the edits each file needs.

use super::exports::{self as ex, Origin, OriginsMemo};
use super::jspath as p;
use super::module_info::{ImpKind, ModuleInfo, TopRef};
use crate::json::Value;
use indexmap::{IndexMap, IndexSet};
use regress::Regex;
use std::collections::HashMap;
use std::rc::Rc;

fn code_file(f: &str) -> bool {
    Regex::new(r"\.[cm]?[jt]sx?$").unwrap().find(f).is_some()
}
fn declaration_file(f: &str) -> bool {
    Regex::new(r"\.d\.[cm]?ts$").unwrap().find(f).is_some()
}
fn stylex_file(f: &str) -> bool {
    Regex::new(r"\.stylex\.[cm]?[jt]sx?$").unwrap().find(f).is_some()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Choice {
    Fixed(String),
    Rel { from: String, to: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RefKind {
    Named,
    Namespace,
    SideEffect,
    Dynamic,
    ReexportAll,
    ReexportNamed,
}

#[derive(Debug, Clone)]
pub struct Spec {
    imported: String,
    local: String,
    type_only: bool,
}

#[derive(Debug, Clone)]
struct ModRef {
    kind: RefKind,
    source: String,
    start: usize,
    end: usize,
    type_only: bool,
    specifiers: Vec<Spec>,
}

#[derive(Debug, Clone)]
pub enum Edit {
    /// Replace the quoted specifier (or, when no quoted match, keep slice).
    Source { start: usize, end: usize, quote: char, matched: bool, slice: String, choice: Choice },
    Statements { start: usize, end: usize, keyword: &'static str, type_only: bool, groups: Vec<(Choice, Vec<Spec>)> },
}

impl Edit {
    fn start(&self) -> usize {
        match self {
            Edit::Source { start, .. } | Edit::Statements { start, .. } => *start,
        }
    }
    fn end(&self) -> usize {
        match self {
            Edit::Source { end, .. } | Edit::Statements { end, .. } => *end,
        }
    }
    fn render(&self, spec_of: &dyn Fn(&Choice) -> String) -> String {
        match self {
            Edit::Source { quote, matched, slice, choice, .. } => {
                if *matched {
                    format!("{quote}{}{quote}", spec_of(choice))
                } else {
                    slice.clone()
                }
            }
            Edit::Statements { keyword, type_only, groups, .. } => render_statements(keyword, *type_only, groups, spec_of),
        }
    }
}

pub struct Planned {
    pub code: Rc<String>,
    pub edits: Vec<Edit>,
}

pub struct CopyPlan {
    pub files: IndexMap<String, Planned>,
    pub depends_on: HashMap<String, IndexSet<String>>,
    pub other_packages: Vec<(String, String)>,
    pub dependencies: IndexMap<String, String>,
}

/// The module's references, in the order the JS reader lists them.
fn references(info: &ModuleInfo) -> Vec<ModRef> {
    let mut refs = Vec::new();
    for t in &info.top {
        match t {
            TopRef::Import(i) => {
                let d = &info.imports[*i];
                let ns = d.specifiers.iter().find(|s| matches!(s.kind, ImpKind::Namespace));
                let named: Vec<_> = d.specifiers.iter().filter(|s| !matches!(s.kind, ImpKind::Namespace)).collect();
                let base = |kind, specifiers| ModRef { kind, source: d.source.clone(), start: d.start, end: d.end, type_only: d.type_only, specifiers };
                if d.specifiers.is_empty() {
                    refs.push(base(RefKind::SideEffect, vec![]));
                } else if ns.is_some() {
                    refs.push(base(RefKind::Namespace, vec![]));
                } else {
                    let specs = named
                        .iter()
                        .map(|s| Spec {
                            imported: match &s.kind {
                                ImpKind::Named(n) => n.clone(),
                                _ => "default".into(),
                            },
                            local: s.local.clone(),
                            type_only: d.type_only || s.type_only,
                        })
                        .collect();
                    refs.push(base(RefKind::Named, specs));
                }
            }
            TopRef::ExportAll(i) => {
                let d = &info.export_all[*i];
                if let Some(exported) = &d.exported {
                    // Babel 7 reads `export * as ns from` as a named re-export.
                    refs.push(ModRef {
                        kind: RefKind::ReexportNamed,
                        source: d.source.clone(),
                        start: d.start,
                        end: d.end,
                        type_only: d.type_only,
                        specifiers: vec![Spec { imported: "*".into(), local: exported.clone(), type_only: d.type_only }],
                    });
                } else {
                    refs.push(ModRef { kind: RefKind::ReexportAll, source: d.source.clone(), start: d.start, end: d.end, type_only: d.type_only, specifiers: vec![] });
                }
            }
            TopRef::ExportNamed(i) => {
                let d = &info.export_named[*i];
                if let Some(src) = &d.source {
                    refs.push(ModRef {
                        kind: RefKind::ReexportNamed,
                        source: src.clone(),
                        start: d.start,
                        end: d.end,
                        type_only: d.type_only,
                        specifiers: d.specifiers.iter().map(|s| Spec { imported: s.local.clone(), local: s.exported.clone(), type_only: d.type_only || s.type_only }).collect(),
                    });
                }
            }
        }
    }
    for (v, s, e) in &info.dynamic {
        refs.push(ModRef { kind: RefKind::Dynamic, source: v.clone(), start: *s, end: *e, type_only: false, specifiers: vec![] });
    }
    refs
}

struct Parsed {
    code: Rc<String>,
    refs: Vec<ModRef>,
    info: Rc<ModuleInfo>,
}

fn parse_module(file: &str) -> Parsed {
    let code = ex::module_text(file).unwrap_or_else(|| Rc::new(String::new()));
    if !code_file(file) {
        return Parsed { code, refs: vec![], info: Rc::new(ModuleInfo::default()) };
    }
    let info = ex::parse_loose(file, &code);
    Parsed { code, refs: references(&info), info }
}

fn to_posix(s: &str) -> String {
    s.to_string()
}

struct Surface {
    by_origin_value: HashMap<String, Vec<(String, String)>>,
    by_origin_type: HashMap<String, Vec<(String, String)>>,
    by_file: HashMap<String, String>,
    exports_field: Option<Value>,
}

struct Ctx {
    package_dir: String,
    src_root: String,
    owner_package: String,
    surface: Surface,
}

struct Memos {
    value: OriginsMemo,
    types: OriginsMemo,
}

impl Memos {
    fn origins(&mut self, file: &str, types: bool) -> Rc<ex::Origins> {
        if types {
            self.types.origins(file, true)
        } else {
            self.value.origins(file, false)
        }
    }
    fn origin_of(&mut self, file: &str, name: &str) -> Option<Origin> {
        self.origins(file, true).get(name).cloned()
    }
    fn export_name_of(&mut self, origin: &Origin) -> Option<String> {
        for (name, found) in self.origins(&origin.file, true).iter() {
            if found.file == origin.file && found.name == origin.name {
                return Some(name.clone());
            }
        }
        None
    }
}

fn wildcard_subpaths(package_dir: &str, root: &str, key: &str, value: &Value) -> Vec<String> {
    let mut subpaths = Vec::new();
    let mut targets = Vec::new();
    ex::all_targets(value, &mut targets);
    for pattern in targets {
        if !pattern.starts_with("./") || !pattern.contains('*') {
            continue;
        }
        let fixed = &pattern[2..pattern.find('*').unwrap()];
        let cut = fixed.rfind('/').map(|i| i + 1).unwrap_or(0);
        let base = p::resolve(&[package_dir, &fixed[..cut]]);
        if !base.starts_with(root) || !p::exists(&base) {
            continue;
        }
        // Node's recursive readdir: breadth first, each folder sorted.
        let mut queue = vec![base.clone()];
        let mut i = 0;
        let mut files = Vec::new();
        while i < queue.len() {
            let dir = queue[i].clone();
            i += 1;
            let Ok(rd) = std::fs::read_dir(&dir) else { continue };
            let mut ents: Vec<(String, bool, bool)> = rd
                .filter_map(|e| e.ok())
                .map(|e| {
                    let ft = e.file_type().ok();
                    (e.file_name().to_string_lossy().into_owned(), ft.map(|t| t.is_dir()).unwrap_or(false), ft.map(|t| t.is_file()).unwrap_or(false))
                })
                .collect();
            ents.sort();
            for (name, is_dir, is_file) in ents {
                let full = p::join2(&dir, &name);
                if is_file {
                    files.push(full.clone());
                }
                if is_dir {
                    queue.push(full);
                }
            }
        }
        for file in files {
            if p::relative(&base, &file).split('/').any(|s| s == "node_modules") {
                continue;
            }
            let rel = to_posix(&p::relative(package_dir, &file));
            if !rel.starts_with(fixed) {
                continue;
            }
            let rest = &rel[fixed.len()..];
            let pat = &pattern[2..];
            let mut ends: Vec<usize> = rest.char_indices().map(|(i, c)| i + c.len_utf8()).collect();
            ends.dedup();
            for end in ends {
                let star = &rest[..end];
                if pat.replace('*', star) == rel {
                    subpaths.push(key.replacen('*', star, 1));
                    break;
                }
            }
        }
    }
    subpaths
}

fn exported_source_files(pkg: &Value, package_dir: &str, root: &str) -> Vec<(String, String)> {
    let exports = pkg.get("exports");
    let mut candidates: IndexSet<String> = IndexSet::new();
    candidates.insert(".".into());
    if let Some(Value::Object(m)) = exports {
        if m.keys().any(|k| k.starts_with('.')) {
            for (k, v) in m {
                if !k.contains('*') {
                    candidates.insert(k.clone());
                    continue;
                }
                for s in wildcard_subpaths(package_dir, root, k, v) {
                    candidates.insert(s);
                }
            }
        }
    }
    let internal = Regex::new(r"^\./internal(/|$)").unwrap();
    let mut found = Vec::new();
    for sub in candidates {
        if internal.find(&sub).is_some() {
            continue;
        }
        let ins = ex::inspect_package_export(pkg, package_dir, &sub);
        if !ins.exported {
            continue;
        }
        let file = ex::source_export_target(pkg, package_dir, &sub).or(ins.target);
        if let Some(f) = file {
            if f.starts_with(&format!("{root}/")) && !declaration_file(&f) {
                found.push((sub, f));
            }
        }
    }
    found
}

fn public_surface(package_dir: &str, src_root: &str, memos: &mut Memos) -> Surface {
    let pkg = ex::read_json(&p::join2(package_dir, "package.json")).unwrap_or(Value::Object(Default::default()));
    let exports_field = pkg.get("exports").filter(|e| e.is_object()).cloned();
    let mut s = Surface { by_origin_value: HashMap::new(), by_origin_type: HashMap::new(), by_file: HashMap::new(), exports_field };
    for (sub, file) in exported_source_files(&pkg, package_dir, src_root) {
        s.by_file.insert(file.clone(), sub.clone());
        if !code_file(&file) {
            continue;
        }
        for types in [false, true] {
            let origins = memos.origins(&file, types);
            let map = if types { &mut s.by_origin_type } else { &mut s.by_origin_value };
            for (name, o) in origins.iter() {
                map.entry(format!("{}#{}", o.file, o.name)).or_default().push((sub.clone(), name.clone()));
            }
        }
    }
    s
}

impl Ctx {
    fn in_source(&self, f: &str) -> bool {
        f.starts_with(&format!("{}/", self.src_root))
    }
    fn exporters_of(&self, memos: &mut Memos, file: &str, name: &str, type_only: bool) -> Vec<(String, String)> {
        let Some(o) = memos.origin_of(file, name) else { return vec![] };
        let map = if type_only { &self.surface.by_origin_type } else { &self.surface.by_origin_value };
        map.get(&format!("{}#{}", o.file, o.name)).cloned().unwrap_or_default()
    }
    fn pick_subpath(&self, subpaths: &[String], file: &str) -> Option<String> {
        if subpaths.is_empty() {
            return None;
        }
        let rel = to_posix(&p::relative(&self.src_root, file));
        let top = format!("./{}", rel.split('/').next().unwrap_or(""));
        if let Some(s) = subpaths.iter().find(|s| **s == top) {
            return Some(s.clone());
        }
        if let Some(s) = subpaths.iter().find(|s| *s == ".") {
            return Some(s.clone());
        }
        let mut sorted = subpaths.to_vec();
        sorted.sort_by_key(|s| s.encode_utf16().count());
        Some(sorted[0].clone())
    }
    fn subpath_covering_module(&self, memos: &mut Memos, file: &str) -> Option<String> {
        if let Some(e) = self.surface.by_file.get(file) {
            return Some(e.clone());
        }
        let names: Vec<String> = memos.origins(file, true).keys().cloned().collect();
        if names.is_empty() {
            return None;
        }
        let values = memos.origins(file, false);
        let mut options: Vec<Vec<String>> = Vec::new();
        for name in &names {
            let list = self
                .exporters_of(memos, file, name, !values.contains_key(name))
                .into_iter()
                .filter(|(_, n)| n == name)
                .map(|(s, _)| s)
                .collect();
            options.push(list);
        }
        let mut common = options[0].clone();
        for list in &options[1..] {
            common.retain(|s| list.contains(s));
        }
        if stylex_file(file) {
            None
        } else {
            self.pick_subpath(&common, file)
        }
    }
    fn choose_public(&self, subpaths: &[String], target: &str, origin_file: Option<&str>) -> Option<String> {
        if let Some(of) = origin_file {
            if let Some(exact) = self.surface.by_file.get(of) {
                if subpaths.contains(exact) {
                    return Some(exact.clone());
                }
            }
        }
        if stylex_file(target) || origin_file.map(stylex_file).unwrap_or(false) {
            return None;
        }
        self.pick_subpath(subpaths, target)
    }
    fn public_specifier(&self, sub: &str) -> String {
        if sub == "." {
            self.owner_package.clone()
        } else {
            format!("{}/{}", self.owner_package, &sub[2..])
        }
    }
}

fn escape_regex(s: &str) -> String {
    let mut o = String::new();
    for c in s.chars() {
        if ".*+?^${}()|[]\\".contains(c) {
            o.push('\\');
        }
        o.push(c);
    }
    o
}

fn source_edit(code: &str, r: &ModRef, choice: Choice) -> Edit {
    let slice = &code[r.start..r.end];
    let re = Regex::new(&format!("(['\"]){}\\1", escape_regex(&r.source))).unwrap();
    match re.find(slice) {
        Some(m) => {
            let at = r.start + m.start();
            let len = m.end() - m.start();
            let quote = slice[m.start()..].chars().next().unwrap();
            Edit::Source { start: at, end: at + len, quote, matched: true, slice: slice.to_string(), choice }
        }
        None => Edit::Source { start: r.start, end: r.start, quote: '\'', matched: false, slice: slice.to_string(), choice },
    }
}

fn render_statements(keyword: &str, type_only: bool, groups: &[(Choice, Vec<Spec>)], spec_of: &dyn Fn(&Choice) -> String) -> String {
    let mut statements = Vec::new();
    for (choice, specs) in groups {
        let specifier = spec_of(choice);
        if let Some(star) = specs.iter().find(|s| s.imported == "*") {
            statements.push(format!("export * as {} from '{}';", star.local, specifier));
        }
        let named: Vec<&Spec> = specs.iter().filter(|s| s.imported != "*").collect();
        if named.is_empty() {
            continue;
        }
        let all_type = type_only || named.iter().all(|s| s.type_only);
        let parts: Vec<String> = named
            .iter()
            .map(|s| {
                let prefix = if !all_type && s.type_only { "type " } else { "" };
                if s.imported == s.local {
                    format!("{prefix}{}", s.local)
                } else {
                    format!("{prefix}{} as {}", s.imported, s.local)
                }
            })
            .collect();
        let head = format!("{keyword} {}", if all_type { "type " } else { "" });
        let one = format!("{head}{{{}}} from '{specifier}';", parts.join(", "));
        if one.encode_utf16().count() <= 80 {
            statements.push(one);
        } else {
            let body: Vec<String> = parts.iter().map(|p| format!("  {p},")).collect();
            statements.push(format!("{head}{{\n{}\n}} from '{specifier}';", body.join("\n")));
        }
    }
    statements.join("\n")
}

pub fn render_file(planned: &Planned, spec_of: &dyn Fn(&Choice) -> String) -> String {
    let mut out = planned.code.to_string();
    let mut edits: Vec<&Edit> = planned.edits.iter().collect();
    // Stable sort descending by start, as the JS does.
    edits.sort_by(|a, b| b.start().cmp(&a.start()));
    for e in edits {
        let rendered = e.render(spec_of);
        out = format!("{}{}{}", &out[..e.start()], rendered, &out[e.end()..]);
    }
    out
}

pub fn relative_specifier_between(from_dest: &str, to_dest: &str) -> String {
    let mut rel = to_posix(&p::relative(&p::dirname(from_dest), to_dest));
    if declaration_file(to_dest) {
        rel = Regex::new(r"\.d\.[cm]?ts$").unwrap().find(&rel).map(|m| rel[..m.start()].to_string()).unwrap_or(rel);
    } else {
        rel = Regex::new(r"\.(?:[cm]?[jt]sx?)$").unwrap().find(&rel).map(|m| rel[..m.start()].to_string()).unwrap_or(rel);
    }
    if rel.starts_with('.') {
        rel
    } else {
        format!("./{rel}")
    }
}

fn declared_ranges(package_dir: &str, names: &IndexSet<String>) -> IndexMap<String, String> {
    let manifest = ex::read_json(&p::join2(package_dir, "package.json")).unwrap_or(Value::Null);
    let mut sorted: Vec<&String> = names.iter().collect();
    sorted.sort();
    let mut out = IndexMap::new();
    for n in sorted {
        let get = |field: &str| manifest.get(field).and_then(|d| d.get(n.as_str())).and_then(|v| v.as_str()).map(String::from);
        let r = get("dependencies").or_else(|| get("optionalDependencies")).or_else(|| get("peerDependencies")).unwrap_or_else(|| "*".into());
        out.insert(n.clone(), r);
    }
    out
}

struct Planner {
    memos: Memos,
    owner: Ctx,
    others: Vec<(String, Ctx)>,
    files: IndexMap<String, Planned>,
    depends_on: HashMap<String, IndexSet<String>>,
    packages: IndexSet<String>,
    queue: std::collections::VecDeque<String>,
    queued: std::collections::HashSet<String>,
    component_dir: String,
    owner_package: String,
}

impl Planner {
    fn enqueue(&mut self, f: &str) {
        if self.queued.insert(f.to_string()) {
            self.queue.push_back(f.to_string());
        }
    }
    fn in_component(&self, f: &str) -> bool {
        f.starts_with(&format!("{}/", self.component_dir))
    }
    fn carry(&mut self, from: &str, to: &str) -> Choice {
        self.enqueue(to);
        self.depends_on.entry(from.to_string()).or_default().insert(to.to_string());
        Choice::Rel { from: from.into(), to: to.into() }
    }
    /// Index into others, or None for the owner.
    fn context_of(&self, file: &str) -> Option<usize> {
        if file.starts_with(&format!("{}/", self.owner.src_root)) {
            return None;
        }
        self.others.iter().position(|(root, _)| file.starts_with(&format!("{root}/")))
    }
    fn ctx(&self, i: Option<usize>) -> &Ctx {
        match i {
            None => &self.owner,
            Some(i) => &self.others[i].1,
        }
    }

    fn internal_module_of(&mut self, file: &str, specifier: &str) -> Option<String> {
        let name = ex::package_of(specifier);
        let sub = specifier.get(name.len() + 1..).unwrap_or("").to_string();
        if !name.starts_with("@astryxdesign/") || name == self.owner_package {
            return None;
        }
        if Regex::new(r"^internal(/|$)").unwrap().find(&sub).is_none() {
            return None;
        }
        if name.is_empty() || name.split('/').any(|s| s == "." || s == "..") || name.starts_with("@/") {
            return None;
        }
        let (installed, _) = ex::find_node_modules_package(&p::dirname(file), &name)?;
        let dir = p::realpath(&installed)?;
        let pkg = ex::read_json(&p::join2(&dir, "package.json"))?;
        let target = ex::source_export_target(&pkg, &dir, &format!("./{sub}"))?;
        if stylex_file(&target) {
            return None;
        }
        let src = p::join2(&dir, "src");
        let root = if target.starts_with(&format!("{src}/")) { src } else { dir.clone() };
        if !self.others.iter().any(|(r, _)| *r == root) {
            let surface = public_surface(&dir, &root, &mut self.memos);
            self.others.push((root.clone(), Ctx { package_dir: dir, src_root: root, owner_package: name, surface }));
        }
        Some(target)
    }

    fn run(&mut self) {
        while let Some(file) = self.queue.pop_front() {
            let parsed = parse_module(&file);
            let mut edits = Vec::new();
            if code_file(&file) {
                let ci = self.context_of(&file);
                for r in &parsed.refs {
                    if !r.source.starts_with('.') {
                        if let Some(internal) = self.internal_module_of(&file, &r.source) {
                            let c = self.carry(&file, &internal);
                            edits.push(source_edit(&parsed.code, r, c));
                            continue;
                        }
                        let builtin = r.source.starts_with("node:") || ex::is_builtin(&r.source);
                        let name = ex::package_of(&r.source);
                        if !builtin && name != self.owner_package {
                            self.packages.insert(name);
                        }
                        continue;
                    }
                    let Some(target) = ex::resolve_local_module(&r.source, &file) else { continue };
                    if self.in_component(&target) {
                        if self.in_component(&file) {
                            self.enqueue(&target);
                        } else {
                            let c = self.carry(&file, &target);
                            edits.push(source_edit(&parsed.code, r, c));
                        }
                        continue;
                    }
                    let in_src = self.ctx(ci).in_source(&target);
                    if !code_file(&target) || !in_src {
                        let ctx = self.ctx(ci);
                        let sub = format!("./{}", to_posix(&p::relative(&ctx.package_dir, &target)));
                        if ex::subpath_declared(ctx.surface.exports_field.as_ref(), &sub) {
                            let pkgname = ctx.owner_package.clone();
                            if ci.is_some() {
                                self.packages.insert(pkgname.clone());
                            }
                            edits.push(source_edit(&parsed.code, r, Choice::Fixed(format!("{pkgname}/{}", &sub[2..]))));
                            continue;
                        }
                        if !in_src {
                            continue;
                        }
                        let c = self.carry(&file, &target);
                        edits.push(source_edit(&parsed.code, r, c));
                        continue;
                    }
                    let e = self.plan_reference(ci, &file, &parsed, r, &target);
                    edits.push(e);
                }
            }
            self.files.insert(file.clone(), Planned { code: parsed.code.clone(), edits });
        }
    }

    fn plan_reference(&mut self, ci: Option<usize>, file: &str, parsed: &Parsed, r: &ModRef, target: &str) -> Edit {
        if ci.is_some() {
            let n = self.ctx(ci).owner_package.clone();
            self.packages.insert(n);
        }
        if r.kind != RefKind::Named && r.kind != RefKind::ReexportNamed {
            let covering = {
                let (memos, ctx) = self.split(ci);
                ctx.subpath_covering_module(memos, target)
            };
            let choice = match covering {
                Some(c) => Choice::Fixed(self.ctx(ci).public_specifier(&c)),
                None => self.carry(file, target),
            };
            return source_edit(&parsed.code, r, choice);
        }
        let mut groups: Vec<(Choice, Vec<Spec>)> = Vec::new();
        fn add(groups: &mut Vec<(Choice, Vec<Spec>)>, choice: Choice, spec: Spec) {
            let same = groups.iter_mut().find(|(g, _)| match (&choice, g) {
                (Choice::Fixed(a), Choice::Fixed(b)) => a == b,
                (Choice::Rel { to: a, .. }, Choice::Rel { to: b, .. }) => a == b,
                _ => false,
            });
            match same {
                Some((_, specs)) => specs.push(spec),
                None => groups.push((choice, vec![spec])),
            }
        }
        for spec in &r.specifiers {
            if spec.imported == "*" {
                let covering = {
                    let (memos, ctx) = self.split(ci);
                    ctx.subpath_covering_module(memos, target)
                };
                let choice = match covering {
                    Some(c) => Choice::Fixed(self.ctx(ci).public_specifier(&c)),
                    None => self.carry(file, target),
                };
                add(&mut groups, choice, spec.clone());
                continue;
            }
            let origin = self.memos.origin_of(target, &spec.imported);
            let (public_options, chosen) = {
                let (memos, ctx) = self.split(ci);
                let opts = ctx.exporters_of(memos, target, &spec.imported, spec.type_only);
                let subs: Vec<String> = opts.iter().map(|(s, _)| s.clone()).collect();
                let chosen = ctx.choose_public(&subs, target, origin.as_ref().map(|o| o.file.as_str()));
                (opts, chosen)
            };
            if let Some(ch) = chosen {
                let exported = public_options.iter().find(|(s, _)| *s == ch).unwrap().1.clone();
                let c = Choice::Fixed(self.ctx(ci).public_specifier(&ch));
                add(&mut groups, c, Spec { imported: exported, ..spec.clone() });
            } else {
                let defining = match &origin {
                    Some(o) if o.file != target && self.ctx(ci).in_source(&o.file) && !parse_module(target).info.declares.contains(&spec.imported) => self.memos.export_name_of(o),
                    _ => None,
                };
                match (&origin, defining) {
                    (Some(o), Some(def)) => {
                        let c = self.carry(file, &o.file);
                        add(&mut groups, c, Spec { imported: def, ..spec.clone() });
                    }
                    _ => {
                        let c = self.carry(file, target);
                        add(&mut groups, c, spec.clone());
                    }
                }
            }
        }
        let unchanged = groups.len() == 1 && groups[0].1.iter().zip(r.specifiers.iter()).all(|(a, b)| a.imported == b.imported);
        if unchanged {
            return source_edit(&parsed.code, r, groups[0].0.clone());
        }
        Edit::Statements {
            start: r.start,
            end: r.end,
            keyword: if r.kind == RefKind::ReexportNamed { "export" } else { "import" },
            type_only: r.type_only,
            groups,
        }
    }

    fn split(&mut self, ci: Option<usize>) -> (&mut Memos, &Ctx) {
        let ctx = match ci {
            None => &self.owner,
            Some(i) => &self.others[i].1,
        };
        (&mut self.memos, ctx)
    }
}

pub fn plan_copy(package_dir: &str, src_root: &str, component_dir: &str, owner_package: &str, entries: &[String]) -> CopyPlan {
    let mut memos = Memos { value: OriginsMemo::default(), types: OriginsMemo::default() };
    let surface = public_surface(package_dir, src_root, &mut memos);
    let owner = Ctx { package_dir: package_dir.into(), src_root: src_root.into(), owner_package: owner_package.into(), surface };
    let mut pl = Planner {
        memos,
        owner,
        others: Vec::new(),
        files: IndexMap::new(),
        depends_on: HashMap::new(),
        packages: IndexSet::new(),
        queue: Default::default(),
        queued: Default::default(),
        component_dir: component_dir.into(),
        owner_package: owner_package.into(),
    };
    for e in entries {
        pl.enqueue(e);
    }
    pl.run();
    let dependencies = declared_ranges(package_dir, &pl.packages);
    CopyPlan {
        files: pl.files,
        depends_on: pl.depends_on,
        other_packages: pl.others.iter().map(|(root, c)| (root.clone(), c.owner_package.clone())).collect(),
        dependencies,
    }
}
