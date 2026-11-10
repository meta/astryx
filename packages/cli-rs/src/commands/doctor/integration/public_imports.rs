//! Port of `foundation/integrations/public-imports.mjs` (and
//! `exports-subpaths.mjs`): whether what an integration package tells apps
//! to import is importable, read from source with oxc where the JS uses
//! `@babel/parser`.

use crate::discovery::component_discovery as cd;
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};
use std::collections::{HashMap, HashSet};

const CORE: &str = "@astryxdesign/core";
const MODULE_EXTENSIONS: &[&str] = &[".tsx", ".ts", ".mts", ".jsx", ".mjs", ".js", ".cjs", ".cts"];
const DECLARATION_EXTENSIONS: &[&str] = &[".d.ts", ".d.mts", ".d.cts"];

fn is_record(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::Object(_)))
}

fn is_file(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

fn rel(from: &str, to: &str) -> String {
    np::relative(from, to)
}

fn js_json(v: &Value) -> String {
    crate::json::stringify(v, 0)
}

fn jstr(s: &str) -> String {
    js_json(&Value::String(s.into()))
}

/* ── exports-subpaths.mjs ── */

/// `importable(value)`.
pub fn importable(v: &Value) -> bool {
    match v {
        Value::String(_) => true,
        Value::Array(a) => a.iter().any(importable),
        Value::Object(m) => m.iter().any(|(c, t)| c != "require" && c != "types" && importable(t)),
        _ => false,
    }
}

/// `allTargets(value)`.
pub fn all_targets(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::String(s) => out.push(s.clone()),
        Value::Array(a) => a.iter().for_each(|x| all_targets(x, out)),
        Value::Object(m) => m.values().for_each(|x| all_targets(x, out)),
        _ => {}
    }
}

#[derive(Debug, Clone)]
pub struct Declaration {
    /// `no_exports` | `root_only` | `declared` | `not_importable` | `missing` | `blocked`.
    pub state: &'static str,
    /// `value`, None when absent (`value: null` reads as Some(Null)).
    pub value: Option<Value>,
    pub wildcard: Option<String>,
}

impl Declaration {
    fn state(state: &'static str) -> Declaration {
        Declaration { state, value: None, wildcard: None }
    }
}

/// `subpathDeclaration(exportsField, subpath)`.
pub fn subpath_declaration(exports: Option<&Value>, subpath: &str) -> Declaration {
    let Some(ex) = exports.filter(|v| !v.is_null()) else { return Declaration::state("no_exports") };
    let keys: Vec<&String> = ex.as_object().map(|m| m.keys().collect()).unwrap_or_default();
    let is_map = ex.is_object() && keys.iter().all(|k| k.starts_with('.'));
    if !is_map {
        if subpath != "." {
            return Declaration::state("root_only");
        }
        let state = if importable(ex) { "declared" } else { "not_importable" };
        return Declaration { state, value: Some(ex.clone()), wildcard: None };
    }
    let map = ex.as_object().unwrap();
    let mut hit: Option<(Value, String)> = None;
    if let Some(v) = map.get(subpath) {
        hit = Some((v.clone(), String::new()));
    } else {
        let mut patterns: Vec<&String> = keys.iter().copied().filter(|k| k.split('*').count() == 2).collect();
        let idx = |k: &str| k.encode_utf16().position(|c| c == b'*' as u16).unwrap_or(0) as i64;
        patterns.sort_by(|a, b| (idx(b) - idx(a)).cmp(&0).then((b.encode_utf16().count() as i64 - a.encode_utf16().count() as i64).cmp(&0)));
        for p in patterns {
            let star = p.find('*').unwrap();
            let (prefix, suffix) = (&p[..star], &p[star + 1..]);
            if subpath.len() >= prefix.len() + suffix.len() && subpath.starts_with(prefix) && subpath.ends_with(suffix) {
                hit = Some((map[p.as_str()].clone(), subpath[prefix.len()..subpath.len() - suffix.len()].to_string()));
                break;
            }
        }
    }
    let Some((value, wildcard)) = hit else { return Declaration::state("missing") };
    if value.is_null() {
        return Declaration::state("blocked");
    }
    let state = if importable(&value) { "declared" } else { "not_importable" };
    Declaration { state, value: Some(value), wildcard: Some(wildcard) }
}

/* ── import specifiers ── */

/// `splitSpecifier(specifier)`: (package, `./`-subpath).
pub fn split_specifier(spec: &str) -> Option<(String, String)> {
    if spec.starts_with('.') || spec.starts_with('/') {
        return None;
    }
    let m = crate::doctor_re!(r"^((?:@[^/\s]+\/)?[^/\s]+)(\/.*)?$").find(spec)?;
    let pkg = spec[m.group(1).unwrap()].to_string();
    let sub = m.group(2).map(|r| format!(".{}", &spec[r])).unwrap_or_else(|| ".".into());
    Some((pkg, sub))
}

#[derive(Debug, Clone)]
pub struct Binding {
    pub imported: String,
    pub type_only: bool,
}

#[derive(Debug, Clone)]
pub struct Statement {
    pub source: String,
    pub names: Vec<Binding>,
    pub namespace: bool,
    pub type_only: bool,
}

fn parse_ok<T>(text: &str, jsx: bool, f: impl FnOnce(&oxc::ast::ast::Program, bool) -> T) -> Option<T> {
    use oxc::allocator::Allocator;
    use oxc::parser::{ParseOptions, Parser};
    use oxc::span::SourceType;
    let alloc = Allocator::default();
    let st = SourceType::mjs().with_typescript(true).with_jsx(jsx);
    let opts = ParseOptions { allow_return_outside_function: true, ..Default::default() };
    let ret = Parser::new(&alloc, text, st).with_options(opts).parse();
    if ret.fatal_error {
        return None;
    }
    Some(f(&ret.program, !ret.diagnostics.is_empty()))
}

fn export_name(n: &oxc::ast::ast::ModuleExportName) -> String {
    use oxc::ast::ast::ModuleExportName as M;
    match n {
        M::IdentifierName(i) => i.name.to_string(),
        M::IdentifierReference(i) => i.name.to_string(),
        M::StringLiteral(s) => s.value.display().to_string(),
    }
}

/// `readImports(text)`.
pub fn read_imports(text: &str) -> Vec<Statement> {
    use oxc::ast::ast::*;
    let parsed = parse_ok(text, true, |program, _| {
        let mut out = Vec::new();
        for stmt in &program.body {
            let Statement::ImportDeclaration(d) = stmt else { continue };
            let type_only = d.import_kind.is_type();
            let mut s = self::Statement { source: d.source.value.display().to_string(), names: vec![], namespace: false, type_only };
            for sp in d.specifiers.iter().flatten() {
                match sp {
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => s.names.push(Binding { imported: "default".into(), type_only }),
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => s.namespace = true,
                    ImportDeclarationSpecifier::ImportSpecifier(x) => {
                        s.names.push(Binding { imported: export_name(&x.imported), type_only: type_only || x.import_kind.is_type() })
                    }
                }
            }
            out.push(s);
        }
        out
    });
    if let Some(p) = parsed {
        return p;
    }
    let mut out = Vec::new();
    let re = crate::doctor_re!(r#"(?:^|[;\n])\s*import\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]"#, "g");
    for m in re.find_iter(text) {
        let type_only = m.group(1).is_some();
        let clause = text[m.group(2).unwrap()].trim().to_string();
        let mut s = self::Statement {
            source: text[m.group(3).unwrap()].to_string(),
            names: vec![],
            namespace: crate::doctor_re!(r"\*\s*as\s").find(&clause).is_some(),
            type_only,
        };
        use crate::commands::doctor::util::JsRe;
        let braces = crate::doctor_re!(r"\{([^}]*)\}").find(&clause).map(|b| clause[b.group(1).unwrap()].to_string());
        let head = crate::doctor_re!(r"\*\s*as\s+[\w$]+").replace(&crate::doctor_re!(r"\{[^}]*\}").replace(&clause, ""), "");
        if crate::doctor_re!(r"^([\w$]+)").find(head.trim()).is_some() {
            s.names.push(Binding { imported: "default".into(), type_only });
        }
        if let Some(b) = braces {
            for part in b.split(',') {
                let item = part.trim();
                if item.is_empty() {
                    continue;
                }
                let t = crate::doctor_re!(r"^type\s+").find(item).is_some();
                let stripped = crate::doctor_re!(r"^type\s+").replace(item, "");
                let name = crate::doctor_re!(r"\s+as\s+").split(&stripped)[0].trim().to_string();
                if crate::doctor_re!(r"^[\w$]+$").find(&name).is_some() {
                    s.names.push(Binding { imported: name, type_only: type_only || t });
                }
            }
        }
        out.push(s);
    }
    out
}

/* ── module export names ── */

#[derive(Debug, Clone, Default)]
pub struct Exports {
    pub names: Vec<String>,
    pub complete: bool,
    pub types: Vec<String>,
    pub typed: bool,
}

impl Exports {
    pub fn has(&self, n: &str) -> bool {
        self.names.iter().any(|x| x == n)
    }
}

fn add(v: &mut Vec<String>, n: String) {
    if !v.contains(&n) {
        v.push(n);
    }
}

pub type Cache = HashMap<String, Exports>;

fn typed_re(file: &str) -> bool {
    crate::doctor_re!(r"\.(?:[cm]?tsx?)$", "u").find(file).is_some()
}

fn decl_re(file: &str) -> bool {
    crate::doctor_re!(r"\.d\.[cm]?ts$", "u").find(file).is_some()
}

fn declaration_twin(file: &str) -> Option<String> {
    let m = crate::doctor_re!(r"\.([cm]?)jsx?$", "u").find(file)?;
    let stem = &file[..m.start()];
    let c = &file[m.group(1).unwrap()];
    [format!(".d.{c}ts"), ".d.ts".to_string()].iter().map(|e| format!("{stem}{e}")).find(|f| is_file(f))
}

fn resolve_relative(spec: &str, from: &str) -> Option<String> {
    use crate::commands::doctor::util::JsRe;
    let base = np::resolve(&[&np::dirname(from), spec]);
    let stripped = crate::doctor_re!(r"\.(?:m?js|jsx|cjs)$", "u").replace(&base, "");
    if typed_re(from) && !decl_re(from) {
        let src = [".ts", ".tsx", ".mts", ".cts"]
            .iter()
            .map(|e| format!("{stripped}{e}"))
            .chain(DECLARATION_EXTENSIONS.iter().map(|e| format!("{stripped}{e}")))
            .find(|f| is_file(f));
        if let Some(s) = src {
            if stripped != base {
                return Some(s);
            }
        }
    }
    if decl_re(from) {
        let twin = DECLARATION_EXTENSIONS
            .iter()
            .map(|e| format!("{stripped}{e}"))
            .chain(DECLARATION_EXTENSIONS.iter().map(|e| np::join2(&base, &format!("index{e}"))))
            .find(|f| is_file(f));
        if twin.is_some() {
            return twin;
        }
    }
    std::iter::once(base.clone())
        .chain(MODULE_EXTENSIONS.iter().map(|e| format!("{base}{e}")))
        .chain(MODULE_EXTENSIONS.iter().map(|e| format!("{stripped}{e}")))
        .chain(MODULE_EXTENSIONS.iter().map(|e| np::join2(&base, &format!("index{e}"))))
        .find(|f| is_file(f))
}

/// `moduleExportNames(file, cache)`.
pub fn module_export_names(file: &str, cache: &mut Cache) -> Exports {
    let (e, _) = read_export_names(file, cache, &[]);
    e
}

fn read_export_names(file: &str, cache: &mut Cache, stack: &[String]) -> (Exports, HashSet<String>) {
    if stack.iter().any(|s| s == file) {
        let mut c = HashSet::new();
        c.insert(file.to_string());
        return (Exports { complete: true, typed: true, ..Default::default() }, c);
    }
    if let Some(c) = cache.get(file) {
        return (c.clone(), HashSet::new());
    }
    let (mut own, mut cycle) = read_own_export_names(file, cache, stack);
    if let Some(twin) = declaration_twin(file) {
        if !stack.contains(&twin) {
            let mut st = stack.to_vec();
            st.push(file.to_string());
            let (d, dc) = read_export_names(&twin, cache, &st);
            for n in d.names.iter() {
                add(&mut own.names, n.clone());
            }
            for n in d.types.iter() {
                add(&mut own.types, n.clone());
            }
            cycle.extend(dc);
            if d.complete && d.typed {
                own.complete = true;
                own.typed = true;
            }
        }
    }
    cycle.remove(file);
    if cycle.is_empty() {
        cache.insert(file.to_string(), own.clone());
    }
    (own, cycle)
}

fn decl_id(d: &oxc::ast::ast::Declaration) -> Option<String> {
    use oxc::ast::ast::Declaration as D;
    match d {
        D::FunctionDeclaration(f) => f.id.as_ref().map(|i| i.name.to_string()),
        D::ClassDeclaration(c) => c.id.as_ref().map(|i| i.name.to_string()),
        D::TSTypeAliasDeclaration(t) => Some(t.id.name.to_string()),
        D::TSInterfaceDeclaration(t) => Some(t.id.name.to_string()),
        D::TSEnumDeclaration(t) => Some(t.id.name.to_string()),
        D::TSNamespaceDeclaration(m) => Some(m.id.name.to_string()),
        D::TSGlobalDeclaration(_) => Some("global".into()),
        D::TSImportEqualsDeclaration(t) => Some(t.id.name.to_string()),
        _ => None,
    }
}

fn read_own_export_names(file: &str, cache: &mut Cache, stack: &[String]) -> (Exports, HashSet<String>) {
    use oxc::ast::ast::*;
    let mut ex = Exports { typed: typed_re(file), ..Default::default() };
    let mut cycle: HashSet<String> = HashSet::new();
    if crate::doctor_re!(r"\.c[jt]s$", "u").find(file).is_some() {
        return (ex, cycle);
    }
    let Some(text) = std::fs::read(file).ok().map(|b| String::from_utf8_lossy(&b).into_owned()) else { return (ex, cycle) };
    // Collect what the walk needs, then follow `export *` after the parse.
    struct Facts {
        esm: bool,
        errors: bool,
        implicit_names: Vec<(String, bool)>,
        implicit_incomplete: bool,
        items: Vec<Item>,
    }
    enum Item {
        Default,
        Assignment,
        ImportEquals(String, bool),
        Named { name: String, ty: bool },
        VarIncomplete,
        AllAs(String),
        All(String),
    }
    let facts = parse_ok(&text, true, |program, errors| {
        let mut f = Facts { esm: false, errors, implicit_names: vec![], implicit_incomplete: false, items: vec![] };
        for s in &program.body {
            if matches!(
                s,
                Statement::ImportDeclaration(_)
                    | Statement::ExportNamedDeclaration(_)
                    | Statement::ExportDeclaration(_)
                    | Statement::ExportFromDeclaration(_)
                    | Statement::ExportDefaultDeclaration(_)
                    | Statement::ExportAllDeclaration(_)
                    | Statement::TSExportAssignment(_)
            ) {
                f.esm = true;
            }
        }
        if decl_re(file) {
            let explicit = program.body.iter().any(|s| match s {
                Statement::ExportNamedDeclaration(_) | Statement::ExportFromDeclaration(_) => true,
                Statement::ExportDefaultDeclaration(d) => !matches!(
                    d.declaration,
                    ExportDefaultDeclarationKind::FunctionDeclaration(_)
                        | ExportDefaultDeclarationKind::ClassDeclaration(_)
                        | ExportDefaultDeclarationKind::TSInterfaceDeclaration(_)
                ),
                Statement::TSExportAssignment(_) | Statement::ExportAllDeclaration(_) => true,
                _ => false,
            });
            if !explicit {
                for s in &program.body {
                    let d: Option<&Declaration> = match s {
                        Statement::ExportDeclaration(e) => Some(&e.declaration),
                        other => other.as_declaration(),
                    };
                    let Some(d) = d else { continue };
                    match d {
                        Declaration::VariableDeclaration(v) => {
                            for decl in &v.declarations {
                                match &decl.id {
                                    BindingPattern::BindingIdentifier(i) => f.implicit_names.push((i.name.to_string(), false)),
                                    _ => f.implicit_incomplete = true,
                                }
                            }
                        }
                        Declaration::TSInterfaceDeclaration(_) | Declaration::TSTypeAliasDeclaration(_) => {
                            if let Some(n) = decl_id(d) {
                                f.implicit_names.push((n, true));
                            }
                        }
                        Declaration::FunctionDeclaration(_)
                        | Declaration::ClassDeclaration(_)
                        | Declaration::TSEnumDeclaration(_)
                        | Declaration::TSNamespaceDeclaration(_)
                        | Declaration::TSGlobalDeclaration(_) => {
                            if let Some(n) = decl_id(d) {
                                f.implicit_names.push((n, false));
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        for s in &program.body {
            match s {
                Statement::ExportDefaultDeclaration(_) => f.items.push(Item::Default),
                Statement::TSExportAssignment(_) => f.items.push(Item::Assignment),
                Statement::TSImportEqualsDeclaration(_) => {}
                Statement::ExportDeclaration(e) => {
                    let ty = false;
                    {
                        let d = &e.declaration;
                        if let Declaration::TSImportEqualsDeclaration(t) = d {
                            f.items.push(Item::ImportEquals(t.id.name.to_string(), t.import_kind.is_type()));
                            continue;
                        }
                        if let Some(n) = decl_id(d) {
                            let is_type = ty || matches!(d, Declaration::TSInterfaceDeclaration(_) | Declaration::TSTypeAliasDeclaration(_));
                            f.items.push(Item::Named { name: n, ty: is_type });
                        }
                        if let Declaration::VariableDeclaration(v) = d {
                            for decl in &v.declarations {
                                match &decl.id {
                                    BindingPattern::BindingIdentifier(i) => f.items.push(Item::Named { name: i.name.to_string(), ty: false }),
                                    _ => f.items.push(Item::VarIncomplete),
                                }
                            }
                        }
                    }
                }
                Statement::ExportNamedDeclaration(e) => {
                    let ty = e.export_kind.is_type();
                    for sp in &e.specifiers {
                        f.items.push(Item::Named { name: export_name(&sp.exported), ty: ty || sp.export_kind.is_type() });
                    }
                }
                Statement::ExportFromDeclaration(e) => {
                    let ty = e.export_kind.is_type();
                    for sp in &e.specifiers {
                        f.items.push(Item::Named { name: export_name(&sp.exported), ty: ty || sp.export_kind.is_type() });
                    }
                }
                Statement::ExportAllDeclaration(e) => match &e.exported {
                    Some(n) => f.items.push(Item::AllAs(export_name(n))),
                    None => f.items.push(Item::All(e.source.value.display().to_string())),
                },
                _ => {}
            }
        }
        f
    });
    let Some(f) = facts else { return (ex, cycle) };
    let mut complete = !f.errors;
    if !f.esm {
        return (ex, cycle);
    }
    if crate::doctor_re!(r"\b(?:module\.exports|exports\.[\w$]+)\s*=", "u").find(&text).is_some() {
        return (ex, cycle);
    }
    if f.implicit_incomplete {
        complete = false;
    }
    for (n, ty) in f.implicit_names {
        add(&mut ex.names, n.clone());
        if ty {
            add(&mut ex.types, n);
        }
    }
    for item in f.items {
        match item {
            Item::Default => add(&mut ex.names, "default".into()),
            Item::Assignment => complete = false,
            Item::ImportEquals(n, ty) => {
                add(&mut ex.names, n.clone());
                if ty {
                    add(&mut ex.types, n);
                    complete = false;
                }
            }
            Item::Named { name, ty } => {
                add(&mut ex.names, name.clone());
                if ty {
                    add(&mut ex.types, name);
                }
            }
            Item::VarIncomplete => complete = false,
            Item::AllAs(n) => add(&mut ex.names, n),
            Item::All(source) => {
                let target = if source.starts_with('.') { resolve_relative(&source, file) } else { None };
                let Some(target) = target else {
                    complete = false;
                    continue;
                };
                let mut st = stack.to_vec();
                st.push(file.to_string());
                let (inner, ic) = read_export_names(&target, cache, &st);
                for n in inner.names {
                    if n != "default" {
                        add(&mut ex.names, n);
                    }
                }
                for n in inner.types {
                    add(&mut ex.types, n);
                }
                if !inner.complete {
                    complete = false;
                }
                if !inner.typed {
                    ex.typed = false;
                }
                cycle.extend(ic);
            }
        }
    }
    ex.complete = complete;
    (ex, cycle)
}

/* ── the check ── */

struct Ctx {
    package_dir: String,
    name: Option<String>,
    exports: Option<Value>,
    unchecked: Vec<Value>,
    cache: Cache,
    augmentation: Option<Option<String>>,
    files: Vec<String>,
    roots: Vec<String>,
}

fn declaration_in(ctx: &Ctx, subpath: &str) -> Declaration {
    let d = subpath_declaration(ctx.exports.as_ref(), subpath);
    if d.state != "no_exports" {
        return d;
    }
    if subpath == "." {
        return Declaration { state: "declared", value: Some(Value::Null), wildcard: Some(String::new()) };
    }
    let root = np::resolve1(&ctx.package_dir);
    let base = np::resolve(&[&root, &subpath[2..]]);
    if !base.starts_with(&format!("{root}/")) {
        return d;
    }
    let file = std::iter::once(base.clone())
        .chain(MODULE_EXTENSIONS.iter().map(|e| format!("{base}{e}")))
        .chain(MODULE_EXTENSIONS.iter().map(|e| np::join2(&base, &format!("index{e}"))))
        .find(|f| is_file(f));
    match file {
        Some(f) => Declaration { state: "declared", value: Some(Value::String(format!("./{}", rel(&root, &f)))), wildcard: Some(String::new()) },
        None => d,
    }
}

fn targets_of(package_dir: &str, d: &Declaration) -> (Vec<String>, bool) {
    if d.state != "declared" {
        return (vec![], false);
    }
    let root = np::resolve1(package_dir);
    let mut ts = Vec::new();
    if let Some(v) = &d.value {
        all_targets(v, &mut ts);
    }
    let all: Vec<String> = ts
        .iter()
        .filter(|t| t.starts_with("./"))
        .map(|t| np::resolve(&[&root, &t.replace('*', d.wildcard.as_deref().unwrap_or(""))]))
        .filter(|f| *f == root || f.starts_with(&format!("{root}/")))
        .collect();
    let files: Vec<String> = all.iter().filter(|f| is_file(f)).cloned().collect();
    let present = files.len() == all.len();
    (files, present)
}

fn existing_targets(package_dir: &str, d: &Declaration) -> Vec<String> {
    targets_of(package_dir, d).0
}

fn subpath_for(ctx: &Ctx, file: &str) -> Option<String> {
    let map = ctx.exports.as_ref()?.as_object()?;
    let wanted = format!("./{}", rel(&ctx.package_dir, file));
    for (key, value) in map {
        if !key.starts_with('.') || !importable(value) {
            continue;
        }
        let mut ts = Vec::new();
        all_targets(value, &mut ts);
        for t in ts {
            if !key.contains('*') {
                if t == wanted {
                    return Some(key.clone());
                }
                continue;
            }
            let Some(star) = t.find('*') else { continue };
            let (prefix, suffix) = (&t[..star], &t[star + 1..]);
            if wanted.starts_with(prefix) && wanted.ends_with(suffix) && wanted.len() >= prefix.len() + suffix.len() {
                return Some(key.replacen('*', &wanted[prefix.len()..wanted.len() - suffix.len()], 1));
            }
        }
    }
    None
}

fn condition_names(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::Array(a) => a.iter().for_each(|x| condition_names(x, out)),
        Value::Object(m) => {
            for (k, x) in m {
                if !out.contains(k) {
                    out.push(k.clone());
                }
                condition_names(x, out);
            }
        }
        _ => {}
    }
}

fn why_undeclared(d: &Declaration, subpath: &str) -> String {
    match d.state {
        "no_exports" => format!("package.json has no \"exports\" and no file exists at \"{subpath}\""),
        "root_only" => "package.json \"exports\" names only the package root, which blocks every subpath".into(),
        "blocked" => format!("package.json \"exports\" maps \"{subpath}\" to null"),
        "not_importable" => {
            let mut names = Vec::new();
            if let Some(v) = &d.value {
                condition_names(v, &mut names);
            }
            if names.is_empty() {
                format!("package.json \"exports\" gives \"{subpath}\" no target an ES module import can load")
            } else {
                format!(
                    "package.json \"exports\" gives \"{subpath}\" only the {} condition{}, none of which an ES module import loads",
                    names.iter().map(|n| format!("\"{n}\"")).collect::<Vec<_>>().join(", "),
                    if names.len() == 1 { "" } else { "s" }
                )
            }
        }
        _ => format!("package.json \"exports\" does not declare \"{subpath}\""),
    }
}

fn exports_fix(ctx: &Ctx, state: &str, subpath: &str, target: &str) -> String {
    let entry = format!("{}: {}", jstr(subpath), jstr(target));
    match state {
        "no_exports" => format!("point it at a file the package ships, or add \"exports\": {{{entry}}} to package.json (an \"exports\" map makes every path it does not list private, so list \".\" and the package's other public paths too)."),
        "root_only" => format!("make \"exports\" a subpath map: {{\".\": {}, {entry}}}.", js_json(ctx.exports.as_ref().unwrap_or(&Value::Null))),
        "not_importable" => format!("add an ES module condition to \"{subpath}\" in package.json \"exports\", e.g. \"default\": {} (or the built file).", jstr(target)),
        "blocked" => format!("replace the null for \"{subpath}\" in package.json \"exports\" with {}, or stop advertising it.", jstr(target)),
        _ => format!("add {entry} to package.json \"exports\" (or the built file it compiles to)."),
    }
}

fn missing_names(stmt: &Statement, files: &[String], cache: &mut Cache, all_present: bool, values: bool) -> Option<Vec<String>> {
    let wanted: Vec<&String> = stmt.names.iter().filter(|b| !b.type_only).map(|b| &b.imported).collect();
    if wanted.is_empty() {
        return Some(vec![]);
    }
    if files.is_empty() {
        return None;
    }
    let mut incomplete = false;
    let mut typed = false;
    let mut seen: Vec<String> = Vec::new();
    for f in files {
        let list = module_export_names(f, cache);
        if wanted.iter().all(|n| list.has(n)) {
            return Some(vec![]);
        }
        if !list.complete {
            incomplete = true;
        }
        if list.typed {
            typed = true;
        }
        for n in list.names {
            add(&mut seen, n);
        }
    }
    if incomplete || (!typed && !values) || !all_present {
        return None;
    }
    Some(wanted.into_iter().filter(|n| !seen.contains(n)).cloned().collect())
}

fn unchecked_reason(files: &[String], all_present: bool) -> String {
    if files.is_empty() || !all_present {
        "a file its package.json \"exports\" entry names does not exist yet (build output), so the names it imports were not checked".into()
    } else {
        "its module's export list cannot be read in full (CommonJS, an `export *` from another package, a parse error, or JavaScript with no declaration file for its types), so the names it imports were not checked".into()
    }
}

fn unbuilt_output(ctx: &Ctx, subpath: &str, d: &Declaration) -> bool {
    if d.state != "no_exports" || subpath == "." {
        return false;
    }
    let top = subpath[2..].split('/').next().unwrap_or("");
    if top.is_empty() {
        return false;
    }
    let top_dir = np::resolve(&[&ctx.package_dir, top]);
    if !np::exists(&top_dir) {
        return true;
    }
    ctx.files.iter().any(|f| f == top) && !ctx.roots.iter().any(|r| *r == top_dir || r.starts_with(&format!("{top_dir}/")))
}

fn unbuilt_reason(subpath: &str) -> String {
    format!("package.json has no \"exports\", and \"{subpath}\" is build output that is not built yet, so it was not checked")
}

fn built_ext(s: &str) -> bool {
    crate::doctor_re!(r"\.[cm]?jsx?$", "u").find(s).is_some()
}

fn fix_target(subpath: &str, source_target: Option<&str>) -> String {
    if let Some(st) = source_target {
        if !(built_ext(subpath) && !built_ext(st)) {
            return st.to_string();
        }
    }
    if built_ext(subpath) {
        format!("<the built file \"{subpath}\" names>")
    } else {
        format!("./{}.tsx", &subpath[2..])
    }
}

fn types_targets(v: &Value, wildcard: &str, under: bool, out: &mut Vec<String>) {
    match v {
        Value::String(s) => {
            if under {
                out.push(s.replacen('*', wildcard, 1));
            }
        }
        Value::Array(a) => a.iter().for_each(|x| types_targets(x, wildcard, under, out)),
        Value::Object(m) => {
            for (c, x) in m {
                if c == "require" {
                    continue;
                }
                types_targets(x, wildcard, under || c == "types", out);
            }
        }
        _ => {}
    }
}

fn declared_type_names(file: &str) -> Option<Vec<String>> {
    use oxc::ast::ast::*;
    let text = std::fs::read_to_string(file).ok()?;
    parse_ok(&text, false, |program, _| {
        let type_name = |d: Option<&Declaration>| match d {
            Some(Declaration::TSInterfaceDeclaration(t)) => Some(t.id.name.to_string()),
            Some(Declaration::TSTypeAliasDeclaration(t)) => Some(t.id.name.to_string()),
            _ => None,
        };
        let mut local: Vec<String> = Vec::new();
        for s in &program.body {
            if let Some(n) = type_name(s.as_declaration()) {
                add(&mut local, n);
            }
            if let Statement::ExportDeclaration(e) = s {
                if let Some(n) = type_name(Some(&e.declaration)) {
                    add(&mut local, n);
                }
            }
        }
        let mut names: Vec<String> = Vec::new();
        for s in &program.body {
            match s {
                Statement::ExportDeclaration(e) => {
                    if let Some(n) = type_name(Some(&e.declaration)) {
                        add(&mut names, n);
                    }
                }
                Statement::ExportNamedDeclaration(e) => {
                    for sp in &e.specifiers {
                        let ex = export_name(&sp.exported);
                        if e.export_kind.is_type() || sp.export_kind.is_type() || local.contains(&export_name(&sp.local)) {
                            add(&mut names, ex);
                        }
                    }
                }
                Statement::ExportFromDeclaration(e) => {
                    for sp in &e.specifiers {
                        if e.export_kind.is_type() || sp.export_kind.is_type() {
                            add(&mut names, export_name(&sp.exported));
                        }
                    }
                }
                _ => {}
            }
        }
        names
    })
}

fn type_only_statement(s: &Statement) -> bool {
    s.type_only || (!s.namespace && !s.names.is_empty() && s.names.iter().all(|b| b.type_only))
}

fn types_only_import(ctx: &Ctx, s: &Statement, subpath: &str, d: &Declaration) -> Option<String> {
    if type_only_statement(s) {
        return None;
    }
    let not = format!("\"{subpath}\" reaches an ES module import only through a \"types\" target in package.json \"exports\", which nothing loads at run time");
    if s.namespace || s.names.is_empty() {
        return Some(format!("{not}, and a namespace or side-effect import of it cannot be judged from source, so it was not checked"));
    }
    let mut files = Vec::new();
    if let Some(v) = &d.value {
        types_targets(v, d.wildcard.as_deref().unwrap_or(""), false, &mut files);
    }
    let mut types: Vec<String> = Vec::new();
    let mut read = false;
    for t in &files {
        if let Some(found) = declared_type_names(&np::resolve(&[&ctx.package_dir, t])) {
            read = true;
            for n in found {
                add(&mut types, n);
            }
        }
    }
    if !read {
        return Some(format!(
            "{not}, and its types file {} could not be read (it may be build output), so it was not checked",
            files.iter().map(|f| format!("\"{f}\"")).collect::<Vec<_>>().join(", ")
        ));
    }
    let unknown: Vec<&String> = s.names.iter().filter(|b| !b.type_only && !types.contains(&b.imported)).map(|b| &b.imported).collect();
    if unknown.is_empty() {
        return None;
    }
    Some(format!(
        "{not}, and its types file does not declare {} as a type, so it was not checked",
        unknown.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ")
    ))
}

fn augments_own_module(ctx: &Ctx, text: &str, name: &str) -> bool {
    use oxc::ast::ast::*;
    if crate::doctor_re!(r"\bdeclare\s+module\b", "u").find(text).is_none() {
        return false;
    }
    let r = parse_ok(text, name.ends_with(".tsx"), |program, _| {
        program.body.iter().any(|s| {
            let d: Option<&Declaration> = match s {
                Statement::ExportDeclaration(e) => Some(&e.declaration),
                other => other.as_declaration(),
            };
            let Some(Declaration::TSExternalModuleDeclaration(m)) = d else { return false };
            let spec = m.id.value.display().to_string();
            if spec.contains('*') {
                return false;
            }
            if spec.starts_with("./") || spec.starts_with("../") {
                return true;
            }
            ctx.name.as_ref().map(|n| spec == *n || spec.starts_with(&format!("{n}/"))).unwrap_or(false)
        })
    });
    r.unwrap_or(true)
}

fn augmentation_reason(ctx: &mut Ctx) -> Option<String> {
    if let Some(a) = &ctx.augmentation {
        return a.clone();
    }
    let root = np::resolve1(&ctx.package_dir);
    let mut queue = std::collections::VecDeque::from([root.clone()]);
    let mut seen = 0usize;
    let mut reason = None;
    'walk: while let Some(current) = queue.pop_front() {
        let Some(mut entries) = np::read_dir(&current) else { continue };
        entries.sort_by(|a, b| crate::discovery::jsort::locale_compare(&a.name, &b.name));
        for e in entries {
            seen += 1;
            if seen > 5000 {
                reason = Some("the package has more than 5000 files to search for a `declare module` block, which can add names to its modules, so the names it imports were not checked".to_string());
                break 'walk;
            }
            let full = np::join2(&current, &e.name);
            if e.is_dir {
                if e.name != "node_modules" && !e.name.starts_with('.') {
                    queue.push_back(full);
                }
                continue;
            }
            if !e.is_file || crate::doctor_re!(r"\.(?:d\.[cm]?ts|[cm]?ts|tsx)$", "u").find(&e.name).is_none() {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&full) else { continue };
            if augments_own_module(ctx, &text, &e.name) {
                reason = Some(format!(
                    "\"{}\" has a `declare module` block for a module of the package, which can add names to it, so the names it imports were not checked",
                    rel(&root, &full)
                ));
                break 'walk;
            }
        }
    }
    ctx.augmentation = Some(reason.clone());
    reason
}

struct Judged {
    undeclared: Option<Declaration>,
    missing: Option<Vec<String>>,
    reason: Option<String>,
}

fn judge_own_import(ctx: &mut Ctx, s: &Statement, subpath: &str) -> Judged {
    let d = declaration_in(ctx, subpath);
    if d.state == "not_importable" {
        let mut tt = Vec::new();
        if let Some(v) = &d.value {
            types_targets(v, d.wildcard.as_deref().unwrap_or(""), false, &mut tt);
        }
        if !tt.is_empty() {
            return Judged { undeclared: None, missing: Some(vec![]), reason: types_only_import(ctx, s, subpath, &d) };
        }
    }
    if d.state != "declared" {
        return Judged { undeclared: Some(d), missing: None, reason: None };
    }
    if subpath == "." && matches!(d.value, Some(Value::Null)) {
        return Judged {
            undeclared: None,
            missing: None,
            reason: Some("package.json has no \"exports\", and the root module \"main\" names is not read, so the names it imports were not checked".into()),
        };
    }
    let (files, present) = targets_of(&ctx.package_dir, &d);
    let missing = missing_names(s, &files, &mut ctx.cache, present, false);
    if missing.as_ref().map(|m| !m.is_empty()).unwrap_or(false) {
        if let Some(a) = augmentation_reason(ctx) {
            return Judged { undeclared: None, missing: None, reason: Some(a) };
        }
    }
    let reason = if missing.is_none() { Some(unchecked_reason(&files, present)) } else { None };
    Judged { undeclared: None, missing, reason }
}

fn subpath_exporting(ctx: &mut Ctx, name: &str, preferred: Option<&str>) -> Option<String> {
    let keys: Vec<String> = ctx.exports.as_ref()?.as_object()?.keys().cloned().collect();
    let mut exports_name = |ctx: &mut Ctx, sub: &str| {
        let d = declaration_in(ctx, sub);
        existing_targets(&ctx.package_dir, &d).iter().any(|f| module_export_names(f, &mut ctx.cache).has(name))
    };
    if let Some(p) = preferred {
        if exports_name(ctx, p) {
            return Some(p.to_string());
        }
    }
    for k in keys {
        if !k.starts_with('.') || k.contains('*') || Some(k.as_str()) == preferred {
            continue;
        }
        if exports_name(ctx, &k) {
            return Some(k);
        }
    }
    None
}

fn note(code: &str, message: String) -> Value {
    let mut m = Map::new();
    m.insert("code".into(), Value::String(code.into()));
    m.insert("message".into(), Value::String(message));
    Value::Object(m)
}

fn unchecked(file: &str, specifier: &str, reason: String) -> Value {
    let mut m = Map::new();
    m.insert("file".into(), Value::String(file.into()));
    m.insert("specifier".into(), Value::String(specifier.into()));
    m.insert("reason".into(), Value::String(reason));
    Value::Object(m)
}

fn strip_module_ext(s: &str) -> String {
    use crate::commands::doctor::util::JsRe;
    crate::doctor_re!(r"\.[cm]?[jt]sx?$", "u").replace(s, "")
}

fn component_issues(ctx: &mut Ctx, integration: &Map<String, Value>) -> Vec<Value> {
    let mut issues = Vec::new();
    let Some(pkg_name) = ctx.name.clone() else { return issues };
    let li = crate::discovery::validate_contributions::loaded_integration(integration);
    if li.components.is_none() {
        return issues;
    }
    let records = cd::discover_integration_components(&li, false);
    let mut by_doc: Vec<(std::path::PathBuf, Vec<&cd::IntegrationRecord>)> = Vec::new();
    for r in &records {
        match by_doc.iter_mut().find(|(d, _)| *d == r.doc_path) {
            Some(e) => e.1.push(r),
            None => by_doc.push((r.doc_path.clone(), vec![r])),
        }
    }
    for (doc_path, list) in by_doc {
        let Ok(doc) = cd::load_component_doc_strict(&doc_path) else { continue };
        if !doc.is_object() {
            continue;
        }
        let doc_s = doc_path.to_string_lossy().into_owned();
        let shown_doc = rel(&ctx.package_dir, &doc_s);
        let record = list[0];
        let source = record.source_path.as_ref().map(|p| p.to_string_lossy().into_owned());
        let source_target = source.as_ref().map(|s| format!("./{}", rel(&ctx.package_dir, s)));
        let authored = doc.get("import").and_then(|v| v.as_str()).map(String::from);
        let specifier = match &authored {
            Some(a) => a.clone(),
            None => cd::resolve_integration_import_path(
                &cd::ImportOwner {
                    exports_map: Some(ctx.exports.clone().unwrap_or(Value::Null)),
                    package_dir: Some(ctx.package_dir.clone().into()),
                    doc_path: Some(doc_path.clone()),
                    package_name: pkg_name.clone(),
                },
                &record.name,
                None,
            ),
        };
        let split = split_specifier(&specifier);
        let entry_key = source_target.as_ref().map(|s| strip_module_ext(s));
        let per_component = entry_key.as_ref().map(|k| format!("add \"{k}\": \"{}\" to package.json \"exports\" and set import: '{pkg_name}{}' in the doc", source_target.as_ref().unwrap(), &k[1..]));
        let gives = if authored.is_some() { format!("gives import \"{specifier}\"") } else { format!("has no import, so apps are told to import from \"{specifier}\"") };
        let declared = source.as_ref().and_then(|s| subpath_for(ctx, s));
        let suggested = declared.clone().or_else(|| source_target.as_ref().map(|s| strip_module_ext(s)));
        match &split {
            Some((pkg, _)) if *pkg != pkg_name => {
                issues.push(note(
                    "component_import_other_package",
                    format!(
                        "Component doc \"{shown_doc}\" {gives}, which names package \"{pkg}\", not this package \"{pkg_name}\", so apps are told to import the component from somewhere it is not. Fix: set import: '{pkg_name}{}' in the doc.",
                        suggested.as_ref().map(|s| s[1..].to_string()).unwrap_or_default()
                    ),
                ));
            }
            Some((_, subpath)) => {
                let d = declaration_in(ctx, subpath);
                if unbuilt_output(ctx, subpath, &d) {
                    ctx.unchecked.push(unchecked(&shown_doc, &specifier, unbuilt_reason(subpath)));
                } else if d.state == "declared" && subpath == "." && matches!(d.value, Some(Value::Null)) {
                    ctx.unchecked.push(unchecked(
                        &shown_doc,
                        &specifier,
                        "package.json has no \"exports\", and the root module \"main\" names is not read, so the component names were not checked".into(),
                    ));
                } else if d.state == "declared" {
                    let doc_name = doc.get("name").and_then(|v| v.as_str());
                    let judged: Vec<&&cd::IntegrationRecord> = list.iter().filter(|r| doc_name.map(|n| n == r.name).unwrap_or(true)).collect();
                    let (files, present) = targets_of(&ctx.package_dir, &d);
                    let stmt = Statement {
                        source: specifier.clone(),
                        names: judged.iter().map(|r| Binding { imported: r.name.clone(), type_only: false }).collect(),
                        namespace: false,
                        type_only: false,
                    };
                    let missing = if judged.is_empty() { Some(vec![]) } else { missing_names(&stmt, &files, &mut ctx.cache, present, true) };
                    if missing.is_none() {
                        ctx.unchecked.push(unchecked(&shown_doc, &specifier, unchecked_reason(&files, present)));
                    }
                    for name in missing.unwrap_or_default() {
                        let there = subpath_exporting(ctx, &name, declared.as_deref());
                        let own_entry = per_component.is_some()
                            && source.is_some()
                            && entry_key.as_deref() != Some(subpath.as_str())
                            && module_export_names(source.as_ref().unwrap(), &mut ctx.cache).has(&name);
                        let fix = match there {
                            Some(t) => format!(
                                "set import: '{pkg_name}{}' in the doc (that subpath exports it), or export \"{name}\" from the module \"{specifier}\" loads.",
                                if t == "." { String::new() } else { t[1..].to_string() }
                            ),
                            None => format!(
                                "export \"{name}\" from the module \"{specifier}\" loads{}.",
                                if own_entry { format!(", or {}", per_component.as_ref().unwrap()) } else { String::new() }
                            ),
                        };
                        issues.push(note(
                            "component_import_missing_name",
                            format!("Component doc \"{shown_doc}\" {gives}, but that module does not export \"{name}\", so apps that follow the doc get nothing. Fix: {fix}"),
                        ));
                    }
                } else {
                    let already = match &declared {
                        Some(dd) if dd != subpath => format!("set import: '{pkg_name}{}' (already exported), or ", &dd[1..]),
                        _ => String::new(),
                    };
                    let tail = if subpath == "." && per_component.is_some() {
                        format!("{}.", per_component.as_ref().unwrap())
                    } else {
                        exports_fix(ctx, d.state, subpath, &fix_target(subpath, source_target.as_deref()))
                    };
                    issues.push(note(
                        "component_import_not_exported",
                        format!(
                            "Component doc \"{shown_doc}\" {gives}, but {}, so apps cannot import the component from it. Fix: {already}{tail}",
                            why_undeclared(&d, subpath)
                        ),
                    ));
                }
            }
            None => {}
        }
        // Examples.
        let examples = doc.get("examples").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        for (index, example) in examples.iter().enumerate() {
            let Some(code) = example.get("code").and_then(|v| v.as_str()) else { continue };
            if !example.is_object() {
                continue;
            }
            let label = match example.get("label").and_then(|v| v.as_str()) {
                Some(l) => format!("\"{l}\""),
                None => format!("#{}", index + 1),
            };
            for stmt in read_imports(code) {
                let Some((pkg, subpath)) = split_specifier(&stmt.source) else { continue };
                if pkg != pkg_name {
                    continue;
                }
                let j = judge_own_import(ctx, &stmt, &subpath);
                if let Some(reason) = &j.reason {
                    ctx.unchecked.push(unchecked(&shown_doc, &stmt.source, format!("example {label}: {reason}")));
                }
                if let Some(u) = &j.undeclared {
                    if unbuilt_output(ctx, &subpath, u) {
                        ctx.unchecked.push(unchecked(&shown_doc, &stmt.source, format!("example {label}: {}", unbuilt_reason(&subpath))));
                    } else {
                        let fix = example_fix(ctx, &stmt, &subpath, u, authored.as_deref(), declared.as_deref(), source.as_deref(), source_target.as_deref(), &pkg_name);
                        issues.push(note(
                            "example_import_not_exported",
                            format!(
                                "Component doc \"{shown_doc}\" example {label} imports \"{}\", but {}, so the example fails when an app copies it. Fix: {fix}",
                                stmt.source,
                                why_undeclared(u, &subpath)
                            ),
                        ));
                    }
                } else if let Some(missing) = j.missing.filter(|m| !m.is_empty()) {
                    let names: Vec<String> = list.iter().map(|r| r.name.clone()).collect();
                    let fix = missing_name_fix(ctx, &stmt, &subpath, &missing, &names, authored.as_deref(), &pkg_name);
                    issues.push(note(
                        "example_import_missing_name",
                        format!(
                            "Component doc \"{shown_doc}\" example {label} imports {} from \"{}\", which does not export {}, so the example fails when an app copies it. Fix: {fix}",
                            missing.iter().map(|n| format!("\"{n}\"")).collect::<Vec<_>>().join(", "),
                            stmt.source,
                            if missing.len() == 1 { "it" } else { "them" }
                        ),
                    ));
                }
            }
        }
    }
    issues
}

fn provides_all(ctx: &mut Ctx, s: &Statement, candidate: &str) -> bool {
    if !s.names.iter().any(|b| !b.type_only) {
        return false;
    }
    let d = declaration_in(ctx, candidate);
    if d.state != "declared" || matches!(d.value, None | Some(Value::Null)) {
        return false;
    }
    let (files, present) = targets_of(&ctx.package_dir, &d);
    matches!(missing_names(s, &files, &mut ctx.cache, present, false), Some(m) if m.is_empty())
}

#[allow(clippy::too_many_arguments)]
fn example_fix(
    ctx: &mut Ctx,
    s: &Statement,
    subpath: &str,
    undeclared: &Declaration,
    authored: Option<&str>,
    declared: Option<&str>,
    source: Option<&str>,
    source_target: Option<&str>,
    pkg_name: &str,
) -> String {
    let values: Vec<String> = s.names.iter().filter(|b| !b.type_only).map(|b| b.imported.clone()).collect();
    let own = authored.and_then(split_specifier);
    if !values.is_empty() {
        if let (Some(a), Some((opkg, osub))) = (authored, &own) {
            if a != s.source && opkg == pkg_name && provides_all(ctx, s, osub) {
                return format!("import from '{a}' in the example, as the doc's import does.");
            }
        }
        if let Some(d) = declared {
            if d != subpath && provides_all(ctx, s, d) {
                return format!("import from '{pkg_name}{}' in the example (already exported).", &d[1..]);
            }
        }
    }
    let root = np::resolve1(&ctx.package_dir);
    let at_subpath = std::iter::once(String::new())
        .chain(MODULE_EXTENSIONS.iter().map(|e| e.to_string()))
        .chain(MODULE_EXTENSIONS.iter().map(|e| format!("/index{e}")))
        .map(|ext| np::resolve(&[&ctx.package_dir, &format!("{}{ext}", &subpath[2..])]))
        .find(|f| f.starts_with(&format!("{root}/")) && is_file(f));
    let source_has_all = !values.is_empty()
        && source.is_some()
        && values.iter().all(|n| module_export_names(source.unwrap(), &mut ctx.cache).has(n));
    let target = match at_subpath {
        Some(a) => format!("./{}", rel(&ctx.package_dir, &a)),
        None if source_has_all && source_target.is_some() => fix_target(subpath, source_target),
        None if !values.is_empty() => format!("<the file that exports {}>", values.join(", ")),
        None => "<the file it loads>".into(),
    };
    exports_fix(ctx, undeclared.state, subpath, &target)
}

fn missing_name_fix(ctx: &mut Ctx, s: &Statement, subpath: &str, missing: &[String], doc_names: &[String], authored: Option<&str>, pkg_name: &str) -> String {
    let d = declaration_in(ctx, subpath);
    let mut there: Vec<String> = Vec::new();
    for f in existing_targets(&ctx.package_dir, &d) {
        for n in module_export_names(&f, &mut ctx.cache).names {
            add(&mut there, n);
        }
    }
    let names: Vec<&String> = doc_names.iter().filter(|n| there.contains(n)).collect();
    let export_it = format!("export {} from it", if missing.len() == 1 { "the name" } else { "the names" });
    if !names.is_empty() {
        return format!(
            "import a name that module exports ({} for this doc), or {export_it}.",
            names.iter().map(|n| format!("\"{n}\"")).collect::<Vec<_>>().join(", ")
        );
    }
    if let Some(a) = authored {
        if let Some((opkg, osub)) = split_specifier(a) {
            if a != s.source && opkg == pkg_name && provides_all(ctx, s, &osub) {
                return format!("import from '{a}', as the doc's import does, or {export_it}.");
            }
        }
    }
    let mut c = export_it.chars();
    let first = c.next().unwrap().to_uppercase().collect::<String>();
    format!("{first}{}.", c.as_str())
}

fn default_export_candidate(text: &str, ex: &Exports) -> Option<String> {
    use oxc::ast::ast::*;
    parse_ok(text, true, |program, _| {
        let mut local: Vec<(String, &'static str)> = Vec::new();
        let mut record = |d: Option<&Declaration>| match d {
            Some(Declaration::FunctionDeclaration(f)) => {
                if let Some(id) = &f.id {
                    local.push((id.name.to_string(), "callable"));
                }
            }
            Some(Declaration::ClassDeclaration(c)) => {
                if let Some(id) = &c.id {
                    local.push((id.name.to_string(), "callable"));
                }
            }
            Some(Declaration::VariableDeclaration(v)) if v.kind == VariableDeclarationKind::Const => {
                for decl in &v.declarations {
                    if let BindingPattern::BindingIdentifier(i) = &decl.id {
                        local.push((i.name.to_string(), "const"));
                    }
                }
            }
            _ => {}
        };
        for st in &program.body {
            match st {
                Statement::ExportDeclaration(e) => record(Some(&e.declaration)),
                other => record(other.as_declaration()),
            }
        }
        let kind_of = |n: &str| local.iter().rev().find(|(k, _)| k == n).map(|(_, k)| *k);
        let mut candidates: Vec<(String, &'static str)> = Vec::new();
        for st in &program.body {
            let names: Vec<String> = match st {
                Statement::ExportDeclaration(e) => match &e.declaration {
                    Declaration::VariableDeclaration(v) => v
                        .declarations
                        .iter()
                        .filter_map(|d| match &d.id {
                            BindingPattern::BindingIdentifier(i) => Some(i.name.to_string()),
                            _ => None,
                        })
                        .collect(),
                    d => decl_id(d).into_iter().collect(),
                },
                Statement::ExportNamedDeclaration(e) if !e.export_kind.is_type() => e
                    .specifiers
                    .iter()
                    .filter(|sp| !sp.export_kind.is_type() && export_name(&sp.exported) == export_name(&sp.local))
                    .map(|sp| export_name(&sp.local))
                    .collect(),
                _ => vec![],
            };
            for n in names {
                if let Some(k) = kind_of(&n) {
                    candidates.push((n, k));
                }
            }
        }
        let fits = |n: &str| crate::doctor_re!(r"^[A-Z]", "u").find(n).is_some() && crate::doctor_re!(r"[a-z]", "u").find(n).is_some() && !ex.types.iter().any(|t| t == n);
        candidates
            .iter()
            .find(|(n, k)| *k == "callable" && fits(n))
            .or_else(|| candidates.iter().find(|(n, k)| *k == "const" && fits(n)))
            .map(|(n, _)| n.clone())
    })
    .flatten()
}

fn template_issues(ctx: &mut Ctx, integration: &Map<String, Value>, core: Option<&(String, Value)>) -> Vec<Value> {
    let mut issues = Vec::new();
    let Some(root) = integration.get("templates").and_then(|v| v.as_str()).map(String::from) else { return issues };
    let (templates, _) = crate::commands::template::integration::for_one(integration);
    for t in templates {
        let id = t.dir_name.clone();
        let file = t.file_path.clone();
        let shown = rel(&ctx.package_dir, &file);
        let source_target = format!("./{shown}");
        let subpath = {
            use crate::commands::doctor::util::JsRe;
            format!("./{}", crate::doctor_re!(r"\.tsx?$", "u").replace(&shown, ""))
        };
        let d = declaration_in(ctx, &subpath);
        if let Some(n) = &ctx.name {
            if d.state != "declared" {
                issues.push(note(
                    "template_import_not_exported",
                    format!(
                        "Template \"{id}\" has public import \"{n}{}\", but {}, so it cannot be imported once published. Fix: {}",
                        &subpath[1..],
                        why_undeclared(&d, &subpath),
                        exports_fix(ctx, d.state, &subpath, &source_target)
                    ),
                ));
            }
        }
        let text = std::fs::read(&file).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
        if !text.is_empty() {
            let exported = module_export_names(&file, &mut ctx.cache);
            if exported.complete && !exported.has("default") {
                let fix = match default_export_candidate(&text, &exported) {
                    Some(named) => format!("add `export default {named};` to {shown}, or make {named} the default export"),
                    None => format!("export the template's component as the default export of {shown} (`export default function …`)"),
                };
                let what = match &ctx.name {
                    None => "anything that renders the template gets nothing".to_string(),
                    Some(n) => format!("its public import \"{n}{}\" and anything that renders the template get nothing", &subpath[1..]),
                };
                issues.push(note("template_no_default_export", format!("Template \"{id}\" ({shown}) has no default export, so {what}. Fix: {fix}.")));
            }
        }
        for st in read_imports(&text) {
            let spec = st.source.clone();
            if spec.starts_with('.') {
                let target = np::resolve(&[&np::dirname(&file), &spec]);
                if target != root && !target.starts_with(&format!("{root}/")) {
                    issues.push(note(
                        "template_import_outside_root",
                        format!(
                            "Template \"{id}\" ({shown}) imports \"{spec}\", a path outside the templates root; `astryx template` copies only the template into an app, where that path does not exist. Fix: import it through the package's public name (e.g. '{}/…' declared in package.json \"exports\"), or move the code into the template.",
                            ctx.name.clone().unwrap_or_else(|| "<package name>".into())
                        ),
                    ));
                }
                continue;
            }
            let Some((pkg, sub)) = split_specifier(&spec) else { continue };
            if ctx.name.as_deref() == Some(pkg.as_str()) {
                let j = judge_own_import(ctx, &st, &sub);
                if let Some(reason) = &j.reason {
                    ctx.unchecked.push(unchecked(&shown, &spec, reason.clone()));
                }
                if let Some(u) = &j.undeclared {
                    if unbuilt_output(ctx, &sub, u) {
                        ctx.unchecked.push(unchecked(&shown, &spec, unbuilt_reason(&sub)));
                    } else {
                        issues.push(note(
                            "template_private_import",
                            format!(
                                "Template \"{id}\" ({shown}) imports \"{spec}\", but {}, so the template breaks in an app. Fix: import from a subpath package.json \"exports\" declares, or add one for it.",
                                why_undeclared(u, &sub)
                            ),
                        ));
                    }
                } else if let Some(m) = j.missing.filter(|m| !m.is_empty()) {
                    issues.push(note(
                        "template_import_missing_name",
                        format!(
                            "Template \"{id}\" ({shown}) imports {} from \"{spec}\", which does not export {}, so the template breaks in an app. Fix: import a name that module exports, or export the name from it.",
                            m.iter().map(|n| format!("\"{n}\"")).collect::<Vec<_>>().join(", "),
                            if m.len() == 1 { "it" } else { "them" }
                        ),
                    ));
                }
            } else if pkg == CORE && core.is_none() {
                ctx.unchecked.push(unchecked(&shown, &spec, "@astryxdesign/core is not installed, so Core's package.json \"exports\" could not be read".into()));
            } else if pkg == CORE && sub != "." {
                let (core_dir, core_pkg) = core.unwrap();
                let cd_ = {
                    let saved_exports = ctx.exports.clone();
                    let saved_dir = ctx.package_dir.clone();
                    ctx.exports = core_pkg.get("exports").cloned();
                    ctx.package_dir = core_dir.clone();
                    let d = declaration_in(ctx, &sub);
                    ctx.exports = saved_exports;
                    ctx.package_dir = saved_dir;
                    d
                };
                if cd_.state != "declared" {
                    let top = sub.split('/').find(|s| !s.is_empty() && *s != "." && *s != "src").map(String::from);
                    let hint = match &top {
                        Some(t) if subpath_declaration(core_pkg.get("exports"), &format!("./{t}")).state == "declared" => format!("'{CORE}/{t}'"),
                        _ => "a subpath Core's package.json \"exports\" declares".to_string(),
                    };
                    issues.push(note(
                        "template_private_import",
                        format!("Template \"{id}\" ({shown}) imports \"{spec}\", a path Core's package.json \"exports\" does not declare, so the template breaks in an app. Fix: import from {hint}."),
                    ));
                }
            }
        }
    }
    issues
}

/// `publicImportIssues(packageDir, integration)`: (notes, report).
pub fn public_import_issues(package_dir: &str, integration: &Map<String, Value>) -> (Vec<Value>, Value) {
    let mut report = Map::new();
    report.insert("status".into(), Value::String("checked".into()));
    report.insert("findings".into(), Value::Array(vec![]));
    let pkg = np::read_json(&np::join2(package_dir, "package.json"));
    let Some(pkg) = pkg.filter(|p| p.is_object()) else {
        report.insert("unchecked".into(), Value::Array(vec![unchecked("package.json", "", "package.json could not be read, so no import was checked".into())]));
        return (vec![], Value::Object(report));
    };
    let raw = pkg.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from);
    let name = raw.clone().filter(|r| crate::discovery::integrations::normalize_provider_id(r).is_ok());
    let mut ctx = Ctx {
        package_dir: package_dir.to_string(),
        name: name.clone(),
        exports: pkg.get("exports").cloned(),
        unchecked: vec![],
        cache: HashMap::new(),
        augmentation: None,
        files: pkg
            .get("files")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str())
                    .map(|e| {
                        use crate::commands::doctor::util::JsRe;
                        crate::doctor_re!(r"\/+$", "u").replace(&crate::doctor_re!(r"^\.\/", "u").replace(e, ""), "")
                    })
                    .collect()
            })
            .unwrap_or_default(),
        roots: ["components", "templates", "docs", "themes", "codemods"]
            .iter()
            .filter_map(|k| integration.get(*k).and_then(|v| v.as_str()).map(np::resolve1))
            .collect(),
    };
    if name.is_none() {
        let why = match &raw {
            None => "package.json has no \"name\"".to_string(),
            Some(r) => format!("package.json \"name\" {} is not a bare package name", jstr(r)),
        };
        ctx.unchecked.push(unchecked(
            "package.json",
            "",
            format!("{why}, so imports of the package's own name were not checked; only template imports outside the templates root and of Core were"),
        ));
    }
    let core_dir = if name.as_deref() == Some(CORE) { Some(package_dir.to_string()) } else { crate::discovery::paths::find_project_core_dir(package_dir) };
    let core_pkg = core_dir.as_ref().and_then(|d| np::read_json(&np::join2(d, "package.json"))).filter(|p| p.get("name").and_then(|v| v.as_str()) == Some(CORE));
    let core = core_pkg.map(|p| (core_dir.clone().unwrap(), p));
    let mut notes = component_issues(&mut ctx, integration);
    notes.extend(template_issues(&mut ctx, integration, core.as_ref()));
    report.insert("unchecked".into(), Value::Array(ctx.unchecked));
    let _ = is_record(None);
    (notes, Value::Object(report))
}
