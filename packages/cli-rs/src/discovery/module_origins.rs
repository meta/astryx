//! The origin and verdict reads of `foundation/discovery/module-exports.mjs`
//! (`moduleExportOrigin`, `moduleExportVerdict`, `exportOriginVerdict`,
//! `moduleParseFailure`, `exportValueKind`, `aliasedOrigin`,
//! `staticExportBindings`) that `module_exports.rs` does not carry. Each
//! module is parsed once per call into a [`Summary`] of its statements,
//! read the way the JS reads Babel's tree: top-level records
//! (`moduleDeclarations`) or every record in the tree, nested TS module
//! blocks included (`nodesOfType`), each where the JS uses it.

use super::nodepath as np;
use oxc::allocator::Allocator;
use oxc::ast::ast::*;
use oxc::parser::{ParseOptions, Parser};
use oxc::span::SourceType;
use std::collections::HashSet;

const MODULE_EXTENSIONS: &[&str] = &[".mjs", ".js", ".cjs", ".mts", ".ts", ".cts", ".tsx", ".jsx"];

fn jstr(s: oxc::str::JSStr) -> String {
    s.as_str().map(String::from).unwrap_or_else(|| s.display().to_string())
}

/// An export's origin: the module and binding that declare it.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Origin {
    pub file: String,
    pub name: String,
}

/// What an expression is, as `exportValueKind` reads it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValueKind {
    Component,
    Data,
    Unknown,
}

impl ValueKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ValueKind::Component => "component",
            ValueKind::Data => "data",
            ValueKind::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone)]
enum Shape {
    Ident(String),
    Member,
    Other,
}

#[derive(Debug, Clone)]
struct Init {
    /// The init when it is a bare identifier, before any unwrapping.
    raw_ident: Option<String>,
    /// The init without TS wrappers.
    shape: Shape,
    kind: ValueKind,
    /// The properties of an object literal init: key and the component it
    /// names; None when the object cannot be read entry by entry.
    object: Option<Option<Vec<(String, Option<String>)>>>,
    /// `exportScalarType`'s reading of the init.
    scalar: Option<&'static str>,
}

#[derive(Debug, Clone)]
struct Declarator {
    name: Option<String>,
    init: Option<Init>,
}

#[derive(Debug, Clone)]
enum DeclKind {
    Var { is_const: bool, declarators: Vec<Declarator> },
    Function { ts_declare: bool },
    Class,
    Interface,
    TypeAlias,
    Enum { is_const: bool },
    Module,
    Other,
}

#[derive(Debug, Clone)]
struct Decl {
    kind: DeclKind,
    declare: bool,
    id: Option<String>,
}

impl Decl {
    fn runtime(&self) -> bool {
        !self.declare && !matches!(self.kind, DeclKind::Function { ts_declare: true } | DeclKind::Interface | DeclKind::TypeAlias)
    }
    fn names(&self, types: bool) -> Vec<String> {
        if self.declare && !types {
            return vec![];
        }
        match &self.kind {
            DeclKind::Function { ts_declare: false } | DeclKind::Class => self.id.iter().cloned().collect(),
            DeclKind::Function { ts_declare: true } | DeclKind::Interface | DeclKind::TypeAlias | DeclKind::Enum { .. } | DeclKind::Module if types => {
                self.id.iter().cloned().collect()
            }
            DeclKind::Var { declarators, .. } => declarators.iter().filter_map(|d| d.name.clone()).collect(),
            _ => vec![],
        }
    }
}

#[derive(Debug, Clone)]
struct Spec {
    exported: Option<String>,
    local: Option<String>,
    type_only: bool,
    /// `export * as name from` (Babel's ExportNamespaceSpecifier).
    namespace: bool,
}

#[derive(Debug, Clone)]
struct Named {
    type_only: bool,
    decl: Option<Decl>,
    specs: Vec<Spec>,
    source: Option<String>,
}

#[derive(Debug, Clone)]
enum ImpKind {
    Named(String),
    Default,
    Namespace,
}

#[derive(Debug, Clone)]
struct Import {
    source: String,
    type_only: bool,
    specs: Vec<(String, ImpKind)>,
}

#[derive(Debug, Clone)]
struct DefaultExport {
    ident: Option<String>,
    runtime: bool,
    kind: ValueKind,
    scalar: Option<&'static str>,
}

/// A module's top-level statements, as the JS reads them.
#[derive(Debug, Clone, Default)]
struct Summary {
    text: String,
    imports: Vec<Import>,
    named: Vec<Named>,
    export_all: Vec<(String, bool)>,
    defaults: Vec<DefaultExport>,
    export_assignment: bool,
    /// `export import X = ...`: (name, type-only).
    import_equals: Vec<(Option<String>, bool)>,
    /// Every top-level declaration, exported or not, in order.
    decls: Vec<Decl>,
    /// The export records of the whole tree (`nodesOfType`).
    deep: Exports,
}

fn strip<'b, 'a>(e: &'b Expression<'a>) -> &'b Expression<'a> {
    let mut cur = e;
    loop {
        cur = match cur {
            Expression::TSSatisfiesExpression(x) => &x.expression,
            Expression::TSAsExpression(x) => &x.expression,
            Expression::TSNonNullExpression(x) => &x.expression,
            Expression::ParenthesizedExpression(x) => &x.expression,
            _ => return cur,
        };
    }
}

fn kind_of(e: &Expression) -> ValueKind {
    match strip(e) {
        Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_) | Expression::ClassExpression(_) | Expression::CallExpression(_) => {
            ValueKind::Component
        }
        Expression::ObjectExpression(_)
        | Expression::ArrayExpression(_)
        | Expression::StringLiteral(_)
        | Expression::NumericLiteral(_)
        | Expression::BooleanLiteral(_)
        | Expression::TemplateLiteral(_)
        | Expression::NullLiteral(_) => ValueKind::Data,
        _ => ValueKind::Unknown,
    }
}

const ELEMENT_CALLS: [&str; 7] = ["createElement", "jsx", "jsxs", "jsxDEV", "_jsx", "_jsxs", "_jsxDEV"];

fn is_element_call(callee: &Expression) -> bool {
    match callee {
        Expression::Identifier(i) => ELEMENT_CALLS.contains(&i.name.as_str()),
        Expression::StaticMemberExpression(m) => ELEMENT_CALLS.contains(&m.property.name.as_str()),
        _ => false,
    }
}

fn scalar_of(e: &Expression) -> Option<&'static str> {
    match strip(e) {
        Expression::StringLiteral(_) => Some("string"),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => Some("string"),
        Expression::NumericLiteral(_) => Some("number"),
        Expression::BooleanLiteral(_) => Some("boolean"),
        _ => None,
    }
}

fn object_entries(o: &ObjectExpression) -> Option<Vec<(String, Option<String>)>> {
    let mut out = Vec::new();
    for p in &o.properties {
        let ObjectPropertyKind::ObjectProperty(p) = p else { return None };
        if p.computed || p.method || p.kind != PropertyKind::Init {
            return None;
        }
        let key = match &p.key {
            PropertyKey::StaticIdentifier(i) => i.name.to_string(),
            PropertyKey::StringLiteral(s) => jstr(s.value),
            _ => return None,
        };
        let value = strip(&p.value);
        let named = match value {
            Expression::JSXElement(el) => match &el.opening_element.name {
                JSXElementName::Identifier(i) => Some(i.name.to_string()),
                JSXElementName::IdentifierReference(i) => Some(i.name.to_string()),
                _ => None,
            },
            Expression::CallExpression(c) if is_element_call(&c.callee) => match c.arguments.first().and_then(|a| a.as_expression()).map(strip) {
                Some(Expression::Identifier(i)) => Some(i.name.to_string()),
                _ => None,
            },
            Expression::Identifier(i) => Some(i.name.to_string()),
            _ => None,
        };
        out.push((key, named));
    }
    Some(out)
}

fn init_of(e: &Expression) -> Init {
    let raw_ident = match e {
        Expression::Identifier(i) => Some(i.name.to_string()),
        _ => None,
    };
    let s = strip(e);
    let shape = match s {
        Expression::Identifier(i) => Shape::Ident(i.name.to_string()),
        Expression::StaticMemberExpression(_) | Expression::ComputedMemberExpression(_) | Expression::PrivateFieldExpression(_) => Shape::Member,
        _ => Shape::Other,
    };
    let object = match s {
        Expression::ObjectExpression(o) => Some(object_entries(o)),
        _ => None,
    };
    Init { raw_ident, shape, kind: kind_of(e), object, scalar: scalar_of(e) }
}

fn var_decl(v: &VariableDeclaration) -> Decl {
    Decl {
            kind: DeclKind::Var {
                is_const: v.kind == VariableDeclarationKind::Const,
                declarators: v
                    .declarations
                    .iter()
                    .map(|x| Declarator {
                        name: match &x.id {
                            BindingPattern::BindingIdentifier(i) => Some(i.name.to_string()),
                            _ => None,
                        },
                        init: x.init.as_ref().map(init_of),
                    })
                    .collect(),
            },
            declare: v.declare,
            id: None,
    }
}

fn decl_of(d: &Declaration) -> Decl {
    match d {
        Declaration::VariableDeclaration(v) => var_decl(v),
        Declaration::FunctionDeclaration(f) => Decl {
            kind: DeclKind::Function { ts_declare: f.r#type == FunctionType::TSDeclareFunction },
            declare: f.declare,
            id: f.id.as_ref().map(|i| i.name.to_string()),
        },
        Declaration::ClassDeclaration(c) => Decl { kind: DeclKind::Class, declare: c.declare, id: c.id.as_ref().map(|i| i.name.to_string()) },
        Declaration::TSInterfaceDeclaration(i) => Decl { kind: DeclKind::Interface, declare: i.declare, id: Some(i.id.name.to_string()) },
        Declaration::TSTypeAliasDeclaration(t) => Decl { kind: DeclKind::TypeAlias, declare: t.declare, id: Some(t.id.name.to_string()) },
        Declaration::TSEnumDeclaration(e) => Decl { kind: DeclKind::Enum { is_const: e.r#const }, declare: e.declare, id: Some(e.id.name.to_string()) },
        Declaration::TSNamespaceDeclaration(m) => Decl { kind: DeclKind::Module, declare: m.declare, id: Some(m.id.name.to_string()) },
        Declaration::TSExternalModuleDeclaration(m) => Decl { kind: DeclKind::Module, declare: m.declare, id: None },
        Declaration::TSGlobalDeclaration(m) => Decl { kind: DeclKind::Module, declare: m.declare, id: Some("global".into()) },
        _ => Decl { kind: DeclKind::Other, declare: false, id: None },
    }
}

#[derive(Debug, Clone, Default)]
struct Exports {
    named: Vec<Named>,
    export_all: Vec<(String, bool)>,
    defaults: Vec<DefaultExport>,
}

/// The export records of one statement, as Babel's Export* nodes.
fn record_exports(stmt: &Statement, out: &mut Exports) {
    match stmt {
        Statement::ExportDeclaration(d) => {
            if let Declaration::TSImportEqualsDeclaration(_) = &d.declaration {
                return;
            }
            let decl = decl_of(&d.declaration);
            // Babel marks a type or `declare` export `exportKind: 'type'`.
            let type_only = decl.declare || matches!(decl.kind, DeclKind::Interface | DeclKind::TypeAlias);
            out.named.push(Named { type_only, decl: Some(decl), specs: vec![], source: None });
        }
        Statement::ExportNamedDeclaration(d) => {
            let specs = d
                .specifiers
                .iter()
                .map(|sp| Spec {
                    exported: Some(sp.exported.name().to_string()),
                    local: Some(sp.local.name().to_string()),
                    type_only: sp.export_kind.is_type(),
                    namespace: false,
                })
                .collect();
            out.named.push(Named { type_only: d.export_kind.is_type(), decl: None, specs, source: None });
        }
        Statement::ExportFromDeclaration(d) => {
            let specs = d
                .specifiers
                .iter()
                .map(|sp| Spec {
                    exported: Some(sp.exported.name().to_string()),
                    local: Some(sp.local.name().to_string()),
                    type_only: sp.export_kind.is_type(),
                    namespace: false,
                })
                .collect();
            out.named.push(Named { type_only: d.export_kind.is_type(), decl: None, specs, source: Some(jstr(d.source.value)) });
        }
        Statement::ExportAllDeclaration(d) => match &d.exported {
            Some(e) => out.named.push(Named {
                type_only: d.export_kind.is_type(),
                decl: None,
                specs: vec![Spec { exported: Some(e.name().to_string()), local: None, type_only: false, namespace: true }],
                source: Some(jstr(d.source.value)),
            }),
            None => out.export_all.push((jstr(d.source.value), d.export_kind.is_type())),
        },
        Statement::ExportDefaultDeclaration(d) => {
            let scalar = d.declaration.as_expression().and_then(scalar_of);
            let (ident, runtime, kind) = match &d.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(f) => {
                    let ts = f.r#type == FunctionType::TSDeclareFunction;
                    (None, !ts && !f.declare, if ts { ValueKind::Unknown } else { ValueKind::Component })
                }
                ExportDefaultDeclarationKind::ClassDeclaration(c) => (None, !c.declare, ValueKind::Component),
                ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => (None, false, ValueKind::Unknown),
                other => match other.as_expression() {
                    Some(e) => {
                        let ident = match e {
                            Expression::Identifier(i) => Some(i.name.to_string()),
                            _ => None,
                        };
                        (ident, true, kind_of(e))
                    }
                    None => (None, true, ValueKind::Unknown),
                },
            };
            out.defaults.push(DefaultExport { ident, runtime, kind, scalar });
        }
        _ => {}
    }
}

fn module_blocks<'b, 'a>(stmt: &'b Statement<'a>) -> Vec<&'b oxc::allocator::Vec<'a, Statement<'a>>> {
    fn of_namespace<'b, 'a>(n: &'b TSNamespaceDeclaration<'a>, out: &mut Vec<&'b oxc::allocator::Vec<'a, Statement<'a>>>) {
        match &n.body {
            TSNamespaceDeclarationBody::TSModuleBlock(b) => out.push(&b.body),
            TSNamespaceDeclarationBody::TSNamespaceDeclaration(inner) => of_namespace(inner, out),
        }
    }
    let mut out = Vec::new();
    let decl = match stmt {
        Statement::ExportDeclaration(d) => Some(&d.declaration),
        _ => stmt.as_declaration(),
    };
    match decl {
        Some(Declaration::TSNamespaceDeclaration(n)) => of_namespace(n, &mut out),
        Some(Declaration::TSExternalModuleDeclaration(m)) => {
            if let Some(b) = &m.body {
                out.push(&b.body);
            }
        }
        Some(Declaration::TSGlobalDeclaration(g)) => out.push(&g.body.body),
        _ => {}
    }
    out
}

/// Every export record in document order, nested TS module blocks included
/// (`nodesOfType`).
fn deep_exports(stmts: &[Statement], out: &mut Exports) {
    for stmt in stmts {
        record_exports(stmt, out);
        for block in module_blocks(stmt) {
            deep_exports(block, out);
        }
    }
}

fn parse_error(text: &str, d: &oxc::diagnostics::OxcDiagnostic) -> String {
    if let Some((msg, line, col)) = crate::js::syntax::babel_error(text, true, true) {
        return format!("{msg} ({line}:{col})");
    }
    let (line, col) = d
        .labels
        .first()
        .map(|l| {
            let off = (l.offset() as usize).min(text.len());
            let before = &text[..off];
            (before.matches('\n').count() + 1, before.rsplit('\n').next().unwrap_or("").encode_utf16().count())
        })
        .unwrap_or((1, 0));
    format!("{} ({line}:{col})", d.message)
}

fn summarize(text: &str) -> Result<Summary, String> {
    let alloc = Allocator::default();
    let opts = ParseOptions { preserve_parens: false, allow_return_outside_function: true, ..ParseOptions::default() };
    // Babel's own verdict and wording first (semantic errors included, such
    // as a binding declared twice).
    if let Some((msg, line, col)) = crate::js::syntax::babel_error(text, true, true) {
        return Err(format!("{msg} ({line}:{col})"));
    }
    let mut ret = Parser::new(&alloc, text, SourceType::tsx()).with_options(opts).parse();
    if ret.diagnostics.has_errors() {
        // Babel's TypeScript+JSX parse takes forms oxc's TSX mode refuses,
        // such as a generic arrow function.
        let plain = Parser::new(&alloc, text, SourceType::ts()).with_options(opts).parse();
        if plain.diagnostics.has_errors() {
            let d = ret.diagnostics.iter().find(|d| d.severity == oxc::diagnostics::Severity::Error).unwrap();
            return Err(parse_error(text, d));
        }
        ret = plain;
    }
    let mut s = Summary { text: text.to_string(), ..Summary::default() };
    let mut top = Exports::default();
    for stmt in &ret.program.body {
        record_exports(stmt, &mut top);
        match stmt {
            Statement::ImportDeclaration(d) => {
                let specs = d
                    .specifiers
                    .iter()
                    .flatten()
                    .map(|sp| match sp {
                        ImportDeclarationSpecifier::ImportSpecifier(x) => (x.local.name.to_string(), ImpKind::Named(x.imported.name().to_string())),
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(x) => (x.local.name.to_string(), ImpKind::Default),
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(x) => (x.local.name.to_string(), ImpKind::Namespace),
                    })
                    .collect();
                s.imports.push(Import { source: jstr(d.source.value), type_only: d.import_kind.is_type(), specs });
            }
            Statement::ExportDeclaration(d) => {
                if let Declaration::TSImportEqualsDeclaration(ie) = &d.declaration {
                    s.import_equals.push((Some(ie.id.name.to_string()), ie.import_kind.is_type()));
                } else {
                    s.decls.push(decl_of(&d.declaration));
                }
            }
            Statement::TSExportAssignment(_) => s.export_assignment = true,
            Statement::VariableDeclaration(v) => s.decls.push(var_decl(v)),
            Statement::FunctionDeclaration(f) => s.decls.push(Decl {
                kind: DeclKind::Function { ts_declare: f.r#type == FunctionType::TSDeclareFunction },
                declare: f.declare,
                id: f.id.as_ref().map(|i| i.name.to_string()),
            }),
            Statement::ClassDeclaration(c) => s.decls.push(Decl { kind: DeclKind::Class, declare: c.declare, id: c.id.as_ref().map(|i| i.name.to_string()) }),
            _ => {}
        }
    }
    let mut deep = Exports::default();
    deep_exports(&ret.program.body, &mut deep);
    s.named = top.named;
    s.export_all = top.export_all;
    s.defaults = top.defaults;
    s.deep = deep;
    Ok(s)
}

fn read(file: &str) -> Result<Summary, String> {
    let text = np::read_text(file).ok_or_else(|| format!("ENOENT: no such file or directory, open '{file}'"))?;
    summarize(&text)
}

fn candidates(base: &str) -> Vec<String> {
    let mut c = vec![base.to_string()];
    c.extend(MODULE_EXTENSIONS.iter().map(|e| format!("{base}{e}")));
    c.extend(MODULE_EXTENSIONS.iter().map(|e| np::join2(base, &format!("index{e}"))));
    c
}

/// `resolveLocalModule(specifier, fromFile)`.
pub fn resolve_local_module(specifier: &str, from_file: &str) -> Option<String> {
    if !specifier.starts_with('.') {
        return None;
    }
    let base = np::resolve(&[&np::dirname(from_file), specifier]);
    candidates(&base).into_iter().find(|c| np::is_file(c))
}

/// `resolveModuleOrPackage(specifier, fromFile)`.
pub fn resolve_module_or_package(specifier: &str, from_file: &str) -> Option<String> {
    if specifier.starts_with('.') {
        return resolve_local_module(specifier, from_file);
    }
    if specifier.starts_with("node:") || specifier.starts_with('/') {
        return None;
    }
    let parts: Vec<&str> = specifier.split('/').collect();
    let count = if specifier.starts_with('@') { 2 } else { 1 };
    let name = parts[..count.min(parts.len())].join("/");
    let rest = if parts.len() > count { parts[count..].join("/") } else { String::new() };
    let package_dir = super::paths::find_installed_package(&np::dirname(from_file), &name, usize::MAX)?;
    let pkg = np::read_json(&np::join2(&package_dir, "package.json"))?;
    if let Some(exports) = pkg.get("exports") {
        let sub = if rest.is_empty() { ".".to_string() } else { format!("./{rest}") };
        let pname = pkg.get("name").and_then(|n| n.as_str()).unwrap_or("");
        return super::package_exports::inspect_package_export(pname, Some(exports), std::path::Path::new(&package_dir), &sub)
            .target
            .map(|t| t.to_string_lossy().into_owned());
    }
    let truthy = |k: &str| pkg.get(k).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from);
    let entry = if !rest.is_empty() { rest } else { truthy("module").or_else(|| truthy("main")).unwrap_or_else(|| "index".into()) };
    candidates(&np::join2(&package_dir, &entry)).into_iter().find(|c| np::is_file(c))
}

/// `moduleParseFailure(file)`: `(file, message)` of the first module along
/// the local re-export graph that does not parse.
pub fn module_parse_failure(file: &str) -> Option<(String, String)> {
    let mut seen: Vec<String> = Vec::new();
    let mut queue = std::collections::VecDeque::from(vec![file.to_string()]);
    while let Some(next) = queue.pop_front() {
        if seen.contains(&next) {
            continue;
        }
        seen.push(next.clone());
        let s = match read(&next) {
            Ok(s) => s,
            Err(m) => return Some((next, m)),
        };
        let sources = s.named.iter().filter_map(|n| n.source.clone()).chain(s.export_all.iter().map(|e| e.0.clone()));
        for spec in sources {
            if !spec.starts_with('.') {
                continue;
            }
            if let Some(t) = resolve_local_module(&spec, &next) {
                queue.push_back(t);
            }
        }
    }
    None
}

fn binding_origin(s: &Summary, file: &str, local: &str, seen: &mut HashSet<String>, types: bool, deep: bool) -> Option<Origin> {
    for imp in &s.imports {
        if imp.type_only && !types {
            continue;
        }
        for (l, kind) in &imp.specs {
            if l != local {
                continue;
            }
            let ImpKind::Named(imported) = kind else { return None };
            let target = resolve_module_or_package(&imp.source, file)?;
            return export_origin(&target, imported, seen, types, deep);
        }
    }
    Some(Origin { file: file.into(), name: local.into() })
}

fn declared_origin(s: &Summary, file: &str, decl: &Decl, name: &str, types: bool, seen: &mut HashSet<String>, deep: bool) -> Origin {
    if let DeclKind::Var { is_const: true, declarators } = &decl.kind {
        for d in declarators {
            if d.name.as_deref() == Some(name) {
                if let Some(init) = d.init.as_ref().and_then(|i| i.raw_ident.clone()) {
                    return binding_origin(s, file, &init, seen, types, deep).unwrap_or(Origin { file: file.into(), name: name.into() });
                }
            }
        }
    }
    Origin { file: file.into(), name: name.into() }
}

/// `exportOrigin(file, exportName, seen, read, types)`: `deep` reads every
/// export record in the tree (`nodesOfType`), else the top-level ones.
fn export_origin(file: &str, export_name: &str, seen: &mut HashSet<String>, types: bool, deep: bool) -> Option<Origin> {
    if !seen.insert(format!("{file}\0{export_name}")) {
        return None;
    }
    if !np::is_file(file) {
        return None;
    }
    let s = read(file).ok()?;
    let (all_named, defaults, export_all) = if deep { (&s.deep.named, &s.deep.defaults, &s.deep.export_all) } else { (&s.named, &s.defaults, &s.export_all) };
    let named: Vec<&Named> = all_named.iter().filter(|n| !(n.type_only && !types)).collect();
    for n in &named {
        if let Some(d) = &n.decl {
            if d.names(types).iter().any(|x| x == export_name) {
                return Some(declared_origin(&s, file, d, export_name, types, seen, deep));
            }
        }
    }
    for n in &named {
        for sp in &n.specs {
            if sp.namespace || (sp.type_only && !types) || sp.exported.as_deref() != Some(export_name) {
                continue;
            }
            let local = sp.local.clone().unwrap_or_else(|| export_name.to_string());
            if let Some(src) = &n.source {
                if let Some(t) = resolve_module_or_package(src, file) {
                    if let Some(o) = export_origin(&t, &local, seen, types, deep) {
                        return Some(o);
                    }
                }
                continue;
            }
            return binding_origin(&s, file, &local, seen, types, deep);
        }
    }
    if export_name == "default" {
        for d in defaults {
            if !types && !d.runtime {
                continue;
            }
            return match &d.ident {
                Some(n) => binding_origin(&s, file, n, seen, types, deep),
                None => Some(Origin { file: file.into(), name: "default".into() }),
            };
        }
    }
    for (src, type_only) in export_all {
        if *type_only && !types {
            continue;
        }
        if let Some(t) = resolve_module_or_package(src, file) {
            if let Some(o) = export_origin(&t, export_name, seen, types, deep) {
                return Some(o);
            }
        }
    }
    None
}

/// `moduleExportOrigin(file, exportName)`.
pub fn module_export_origin(file: &str, export_name: &str) -> Option<Origin> {
    export_origin(file, export_name, &mut HashSet::new(), false, false)
}

/// A verdict: `exports`, `lacks`, or `unknown` with its reason.
#[derive(Debug, Clone, PartialEq)]
pub enum Verdict {
    Exports(Option<Origin>),
    Lacks,
    Unknown(String),
}

impl Verdict {
    pub fn name(&self) -> &'static str {
        match self {
            Verdict::Exports(_) => "exports",
            Verdict::Lacks => "lacks",
            Verdict::Unknown(_) => "unknown",
        }
    }
}

fn commonjs(text: &str) -> bool {
    regress::Regex::with_flags(r"\bmodule\.exports\b|\bexports\.[$\w]", "u").unwrap().find(text).is_some()
}

/// `moduleExportVerdict(file, exportName)`.
pub fn module_export_verdict(file: &str, export_name: &str) -> Verdict {
    verdict_in(file, export_name, &mut HashSet::new())
}

fn verdict_in(file: &str, export_name: &str, seen: &mut HashSet<String>) -> Verdict {
    if !seen.insert(format!("{file}\0{export_name}")) {
        return Verdict::Lacks;
    }
    let shown = np::basename(file);
    if !np::is_file(file) {
        return Verdict::Unknown(format!("{shown} is not a file."));
    }
    let Ok(s) = read(file) else { return Verdict::Unknown(format!("{shown} could not be read or parsed.")) };
    let mut unknown: Vec<String> = Vec::new();
    if commonjs(&s.text) {
        unknown.push(format!("{shown} uses CommonJS exports, whose names this check does not read."));
    }
    if s.export_assignment {
        unknown.push(format!("{shown} uses `export =`, whose names this check does not read."));
    }
    let mut follow = |spec: &str, imported: &str, what: &str, unknown: &mut Vec<String>, seen: &mut HashSet<String>| -> bool {
        if !spec.starts_with('.') {
            unknown.push(format!("{shown} re-exports {what} from \"{spec}\", another package this check does not read."));
            return false;
        }
        let Some(target) = resolve_local_module(spec, file) else {
            unknown.push(format!("{shown} re-exports {what} from \"{spec}\", which resolves to no file this check can read."));
            return false;
        };
        match verdict_in(&target, imported, seen) {
            Verdict::Exports(_) => true,
            Verdict::Unknown(r) => {
                unknown.push(r);
                false
            }
            Verdict::Lacks => false,
        }
    };
    for (name, type_only) in &s.import_equals {
        if name.as_deref() != Some(export_name) {
            continue;
        }
        if *type_only {
            unknown.push(format!("{shown} exports {export_name} with `export import type`, which has no runtime value this check can see."));
        } else {
            return Verdict::Exports(None);
        }
    }
    for n in &s.named {
        if n.type_only {
            continue;
        }
        if let Some(d) = &n.decl {
            match &d.kind {
                DeclKind::Var { declarators, .. } => {
                    for x in declarators {
                        match &x.name {
                            None => unknown.push(format!("{shown} exports a destructured binding, whose names this check does not read.")),
                            Some(nm) if nm == export_name => {
                                if d.declare {
                                    unknown.push(format!("{shown} declares {export_name} with `declare`, which has no runtime value this check can see."));
                                } else {
                                    return Verdict::Exports(None);
                                }
                            }
                            _ => {}
                        }
                    }
                }
                kind if d.id.as_deref() == Some(export_name) => match kind {
                    DeclKind::Interface | DeclKind::TypeAlias => {}
                    DeclKind::Module => unknown.push(format!(
                        "{shown} exports {export_name} as a TypeScript namespace, which has a runtime value only when it holds one."
                    )),
                    _ if d.declare || matches!(kind, DeclKind::Enum { is_const: true }) => unknown.push(format!(
                        "{shown} declares {export_name} as an ambient or const declaration, which has no runtime value this check can see."
                    )),
                    _ if d.runtime() => return Verdict::Exports(None),
                    _ => {}
                },
                _ => {}
            }
        }
        for sp in &n.specs {
            if sp.type_only || sp.exported.as_deref() != Some(export_name) {
                continue;
            }
            if n.source.is_none() || sp.namespace {
                return Verdict::Exports(None);
            }
            let imported = sp.local.clone().unwrap_or_else(|| export_name.to_string());
            if follow(n.source.as_deref().unwrap(), &imported, export_name, &mut unknown, seen) {
                return Verdict::Exports(None);
            }
        }
    }
    if export_name == "default" && s.defaults.iter().any(|d| d.runtime) {
        return Verdict::Exports(None);
    }
    for (src, type_only) in &s.export_all {
        if *type_only || export_name == "default" {
            continue;
        }
        if follow(src, export_name, "everything", &mut unknown, seen) {
            return Verdict::Exports(None);
        }
    }
    match unknown.into_iter().next() {
        Some(r) => Verdict::Unknown(r),
        None => Verdict::Lacks,
    }
}

/// `exportOriginVerdict(file, exportName)`.
pub fn export_origin_verdict(file: &str, export_name: &str) -> Verdict {
    if let Some(o) = module_export_origin(file, export_name) {
        return Verdict::Exports(Some(o));
    }
    match module_export_verdict(file, export_name) {
        Verdict::Lacks => Verdict::Lacks,
        Verdict::Unknown(r) => Verdict::Unknown(r),
        Verdict::Exports(_) => Verdict::Unknown(origin_gap_reason(file, export_name, &mut HashSet::new())),
    }
}

fn origin_gap_reason(file: &str, export_name: &str, seen: &mut HashSet<String>) -> String {
    let shown = np::basename(file);
    let generic = format!("{shown} exports {export_name}, but this check could not follow it to the declaration.");
    if !seen.insert(format!("{file}\0{export_name}")) {
        return generic;
    }
    let Ok(s) = read(file) else { return generic };
    let mut local: Option<String> = None;
    for n in &s.named {
        for sp in &n.specs {
            if sp.exported.as_deref() != Some(export_name) {
                continue;
            }
            if let Some(src) = &n.source {
                let Some(target) = resolve_module_or_package(src, file) else {
                    return format!("{shown} re-exports {export_name} from \"{src}\", which does not resolve from the package.");
                };
                let name = sp.local.clone().unwrap_or_else(|| export_name.to_string());
                return origin_gap_reason(&target, &name, seen);
            }
            local = sp.local.clone();
        }
    }
    if export_name == "default" {
        for d in &s.defaults {
            if let Some(i) = &d.ident {
                local = Some(i.clone());
            }
        }
    }
    let Some(local) = local else {
        for (src, type_only) in &s.export_all {
            if *type_only {
                continue;
            }
            if let Some(t) = resolve_module_or_package(src, file) {
                if matches!(module_export_verdict(&t, export_name), Verdict::Exports(_)) {
                    return origin_gap_reason(&t, export_name, seen);
                }
            }
        }
        return generic;
    };
    for imp in &s.imports {
        if imp.type_only {
            continue;
        }
        for (l, kind) in &imp.specs {
            if *l != local {
                continue;
            }
            let src = &imp.source;
            return match kind {
                ImpKind::Default => format!("{shown} exports {export_name} from a default import of \"{src}\", which this check does not follow."),
                ImpKind::Namespace => format!("{shown} exports {export_name} from a namespace import of \"{src}\", which this check does not follow."),
                ImpKind::Named(_) => {
                    if resolve_module_or_package(src, file).is_some() {
                        format!("{shown} exports {export_name} imported from \"{src}\", which this check could not follow to the declaration.")
                    } else {
                        format!("{shown} exports {export_name} imported from \"{src}\", which does not resolve from the package.")
                    }
                }
            };
        }
    }
    generic
}

fn declarator_of<'s>(s: &'s Summary, name: &str, last: bool) -> Option<&'s Declarator> {
    let mut found = None;
    for d in &s.decls {
        if let DeclKind::Var { declarators, .. } = &d.kind {
            for x in declarators {
                if x.name.as_deref() == Some(name) {
                    if !last {
                        return Some(x);
                    }
                    found = Some(x);
                }
            }
        }
    }
    found
}

/// `exportValueKind(file, exportName)`.
pub fn export_value_kind(file: &str, export_name: &str) -> ValueKind {
    let Some(origin) = module_export_origin(file, export_name) else { return ValueKind::Unknown };
    let Ok(s) = read(&origin.file) else { return ValueKind::Unknown };
    if origin.name == "default" {
        return s.defaults.first().map(|d| d.kind).unwrap_or(ValueKind::Unknown);
    }
    for d in &s.decls {
        match &d.kind {
            DeclKind::Function { ts_declare: false } | DeclKind::Class if d.id.as_deref() == Some(origin.name.as_str()) => return ValueKind::Component,
            DeclKind::Var { declarators, .. } => {
                for x in declarators {
                    if x.name.as_deref() == Some(origin.name.as_str()) {
                        return x.init.as_ref().map(|i| i.kind).unwrap_or(ValueKind::Unknown);
                    }
                }
            }
            _ => {}
        }
    }
    ValueKind::Unknown
}

/// `aliasedOrigin(origin)`: the binding an alias finally names.
pub fn aliased_origin(origin: &Origin) -> Option<Origin> {
    aliased_in(origin, &mut HashSet::new())
}

fn aliased_in(origin: &Origin, seen: &mut HashSet<String>) -> Option<Origin> {
    if !seen.insert(format!("{}\0{}", origin.file, origin.name)) {
        return None;
    }
    let s = read(&origin.file).ok()?;
    let Some(x) = declarator_of(&s, &origin.name, false) else { return Some(origin.clone()) };
    match x.init.as_ref().map(|i| &i.shape) {
        Some(Shape::Member) => None,
        Some(Shape::Ident(n)) => {
            let next = binding_origin(&s, &origin.file, n, &mut HashSet::new(), false, true)?;
            aliased_in(&next, seen)
        }
        _ => Some(origin.clone()),
    }
}

/// `staticExportBindings(file, exportName)`: each key of an exported object
/// literal and the origin of the component it names (None when unreadable).
pub fn static_export_bindings(file: &str, export_name: &str) -> Option<Vec<(String, Option<Origin>)>> {
    let origin = module_export_origin(file, export_name)?;
    let s = read(&origin.file).ok()?;
    let x = declarator_of(&s, &origin.name, true)?;
    let entries = x.init.as_ref()?.object.clone()??;
    let mut out: Vec<(String, Option<Origin>)> = Vec::new();
    for (key, named) in entries {
        let o = named.and_then(|n| binding_origin(&s, &origin.file, &n, &mut HashSet::new(), false, true));
        match out.iter_mut().find(|(k, _)| *k == key) {
            Some(slot) => slot.1 = o,
            None => out.push((key, o)),
        }
    }
    Some(out)
}

/// `followedExportNames(file)`: every runtime name the module exports,
/// `export *` followed, sorted.
pub fn followed_export_names(file: &str) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    followed_into(file, &mut HashSet::new(), &mut names);
    super::jsort::sort_strings(&mut names);
    names
}

fn followed_into(file: &str, seen: &mut HashSet<String>, names: &mut Vec<String>) {
    if !seen.insert(file.to_string()) || !np::is_file(file) {
        return;
    }
    let Ok(s) = read(file) else { return };
    let mut add = |n: &str, names: &mut Vec<String>| {
        if !names.iter().any(|x| x == n) {
            names.push(n.to_string());
        }
    };
    for n in &s.named {
        if n.type_only {
            continue;
        }
        if let Some(d) = &n.decl {
            for name in d.names(false) {
                add(&name, names);
            }
        }
        for sp in &n.specs {
            if sp.namespace || sp.type_only {
                continue;
            }
            if let Some(e) = sp.exported.as_deref().filter(|e| *e != "default") {
                add(e, names);
            }
        }
    }
    for (src, type_only) in &s.export_all {
        if *type_only {
            continue;
        }
        if let Some(t) = resolve_module_or_package(src, file) {
            followed_into(&t, seen, names);
        }
    }
}

/// `exportScalarType(file, exportName)`: `string`, `number` or `boolean`
/// for an export bound to a literal of that type.
pub fn export_scalar_type(file: &str, export_name: &str) -> Option<&'static str> {
    let origin = module_export_origin(file, export_name)?;
    let s = read(&origin.file).ok()?;
    if origin.name == "default" {
        return s.defaults.first().and_then(|d| d.scalar);
    }
    declarator_of(&s, &origin.name, false)?.init.as_ref()?.scalar
}
