//! The facts the swizzle readers need from one JS/TS module, read with oxc
//! the way the JS CLI reads them with Babel: imports, exports, re-exports,
//! `import()` calls and `import('…')` types. Offsets are byte offsets into
//! the module's text.

macro_rules! jsv {
    ($e:expr) => {
        $e.display().to_string()
    };
}

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_parser::Parser;
use oxc_span::SourceType;

#[derive(Debug, Clone)]
pub enum ImpKind {
    Named(String),
    Default,
    Namespace,
}

#[derive(Debug, Clone)]
pub struct ImpSpec {
    pub kind: ImpKind,
    pub local: String,
    pub type_only: bool,
}

#[derive(Debug, Clone)]
pub struct ImportDecl {
    pub source: String,
    pub type_only: bool,
    pub specifiers: Vec<ImpSpec>,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone)]
pub struct ExpSpec {
    pub local: String,
    pub exported: String,
    pub type_only: bool,
}

/// What an exported declaration binds.
#[derive(Debug, Clone, Default)]
pub struct DeclInfo {
    /// `declare` set (Babel's `declaration.declare === true`).
    pub declare: bool,
    /// A function or class declaration's name (runtime).
    pub runtime_id: Option<String>,
    /// A type declaration's name (interface, type alias, enum, namespace,
    /// declared function).
    pub type_id: Option<String>,
    /// A variable declaration's identifier names.
    pub var_names: Vec<String>,
    /// `const name = init` where init is an identifier.
    pub const_inits: Vec<(String, String)>,
    /// Names the graph's `declares` set takes from this declaration.
    pub graph_names: Vec<String>,
}

impl DeclInfo {
    pub fn names(&self, types: bool) -> Vec<String> {
        if self.declare && !types {
            return Vec::new();
        }
        if let Some(id) = &self.runtime_id {
            return vec![id.clone()];
        }
        if types {
            if let Some(id) = &self.type_id {
                return vec![id.clone()];
            }
        }
        self.var_names.clone()
    }
}

#[derive(Debug, Clone)]
pub struct ExportNamed {
    pub declaration: Option<DeclInfo>,
    pub specifiers: Vec<ExpSpec>,
    pub source: Option<String>,
    pub type_only: bool,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone)]
pub struct ExportAll {
    pub source: String,
    pub exported: Option<String>,
    pub type_only: bool,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone)]
pub enum DefaultKind {
    Identifier(String),
    /// Anything else; `runtime` is Babel's `runtimeDefault`.
    Other { runtime: bool },
}

/// A module-level statement the graph reads, in body order.
#[derive(Debug, Clone)]
pub enum TopRef {
    Import(usize),
    ExportNamed(usize),
    ExportAll(usize),
}

#[derive(Debug, Clone, Default)]
pub struct ModuleInfo {
    pub parsed: bool,
    /// Top-level imports.
    pub imports: Vec<ImportDecl>,
    /// Export declarations at any depth (namespaces included), source order.
    pub export_named: Vec<ExportNamed>,
    pub export_all: Vec<ExportAll>,
    pub export_default: Vec<DefaultKind>,
    /// Top-level statements, in order, by index into the lists above. Only
    /// top-level export entries are referenced.
    pub top: Vec<TopRef>,
    /// `import('…')` calls and types: (value, start, end) of the literal.
    pub dynamic: Vec<(String, usize, usize)>,
    /// Graph's `declares`: names top-level export declarations bind.
    pub declares: Vec<String>,
}

fn mod_name(n: &ModuleExportName) -> String {
    match n {
        ModuleExportName::IdentifierName(i) => i.name.to_string(),
        ModuleExportName::IdentifierReference(i) => i.name.to_string(),
        ModuleExportName::StringLiteral(s) => jsv!(s.value),
    }
}

fn exp_spec(s: &ExportSpecifier) -> ExpSpec {
    ExpSpec { local: mod_name(&s.local), exported: mod_name(&s.exported), type_only: is_type(s.export_kind) }
}

fn is_type(k: ImportOrExportKind) -> bool {
    matches!(k, ImportOrExportKind::Type)
}

fn decl_info(d: &Declaration) -> DeclInfo {
    let mut info = DeclInfo::default();
    match d {
        Declaration::VariableDeclaration(v) => {
            info.declare = v.declare;
            for dec in &v.declarations {
                if let BindingPattern::BindingIdentifier(id) = &dec.id {
                    info.var_names.push(id.name.to_string());
                    info.graph_names.push(id.name.to_string());
                    if v.kind == VariableDeclarationKind::Const {
                        if let Some(Expression::Identifier(init)) = &dec.init {
                            info.const_inits.push((id.name.to_string(), init.name.to_string()));
                        }
                    }
                }
            }
        }
        Declaration::FunctionDeclaration(f) => {
            info.declare = f.declare;
            let name = f.id.as_ref().map(|i| i.name.to_string());
            if matches!(f.r#type, FunctionType::TSDeclareFunction) {
                info.type_id = name.clone();
            } else {
                info.runtime_id = name.clone();
            }
            if let Some(n) = name {
                info.graph_names.push(n);
            }
        }
        Declaration::ClassDeclaration(c) => {
            info.declare = c.declare;
            info.runtime_id = c.id.as_ref().map(|i| i.name.to_string());
            if let Some(n) = &info.runtime_id {
                info.graph_names.push(n.clone());
            }
        }
        Declaration::TSTypeAliasDeclaration(t) => {
            info.declare = t.declare;
            info.type_id = Some(t.id.name.to_string());
            info.graph_names.push(t.id.name.to_string());
        }
        Declaration::TSInterfaceDeclaration(t) => {
            info.declare = t.declare;
            info.type_id = Some(t.id.name.to_string());
            info.graph_names.push(t.id.name.to_string());
        }
        Declaration::TSEnumDeclaration(t) => {
            info.declare = t.declare;
            info.type_id = Some(t.id.name.to_string());
            info.graph_names.push(t.id.name.to_string());
        }
        Declaration::TSNamespaceDeclaration(t) => {
            info.declare = t.declare;
            info.type_id = Some(t.id.name.to_string());
            info.graph_names.push(t.id.name.to_string());
        }
        Declaration::TSGlobalDeclaration(t) => {
            info.declare = t.declare;
            info.type_id = Some("global".into());
            info.graph_names.push("global".into());
        }
        Declaration::TSExternalModuleDeclaration(t) => {
            info.declare = t.declare;
        }
        Declaration::TSImportEqualsDeclaration(_) => {}
    }
    info
}

struct Collector<'s> {
    info: &'s mut ModuleInfo,
}

impl<'s> Collector<'s> {
    #[allow(clippy::too_many_arguments)]
    fn push_named(&mut self, top: bool, declaration: Option<DeclInfo>, specifiers: Vec<ExpSpec>, source: Option<String>, type_only: bool, start: u32, end: u32) {
        if top {
            if let Some(di) = &declaration {
                for n in &di.graph_names {
                    if !self.info.declares.contains(n) {
                        self.info.declares.push(n.clone());
                    }
                }
            }
            self.info.top.push(TopRef::ExportNamed(self.info.export_named.len()));
        }
        self.info.export_named.push(ExportNamed { declaration, specifiers, source, type_only, start: start as usize, end: end as usize });
    }

    fn statements(&mut self, body: &[Statement], top: bool) {
        for st in body {
            match st {
                Statement::ImportDeclaration(d) if top => {
                    let mut specs = Vec::new();
                    for s in d.specifiers.iter().flatten() {
                        match s {
                            ImportDeclarationSpecifier::ImportSpecifier(x) => specs.push(ImpSpec {
                                kind: ImpKind::Named(mod_name(&x.imported)),
                                local: x.local.name.to_string(),
                                type_only: is_type(x.import_kind),
                            }),
                            ImportDeclarationSpecifier::ImportDefaultSpecifier(x) => specs.push(ImpSpec {
                                kind: ImpKind::Default,
                                local: x.local.name.to_string(),
                                type_only: false,
                            }),
                            ImportDeclarationSpecifier::ImportNamespaceSpecifier(x) => specs.push(ImpSpec {
                                kind: ImpKind::Namespace,
                                local: x.local.name.to_string(),
                                type_only: false,
                            }),
                        }
                    }
                    self.info.top.push(TopRef::Import(self.info.imports.len()));
                    self.info.imports.push(ImportDecl {
                        source: jsv!(d.source.value),
                        type_only: is_type(d.import_kind),
                        specifiers: specs,
                        start: d.span.start as usize,
                        end: d.span.end as usize,
                    });
                }
                Statement::ExportDeclaration(d) => {
                    let declaration = Some(decl_info(&d.declaration));
                    self.push_named(top, declaration, Vec::new(), None, false, d.span.start, d.span.end);
                    if let Declaration::TSNamespaceDeclaration(ns) = &d.declaration {
                        self.namespace(ns);
                    }
                }
                Statement::ExportNamedDeclaration(d) => {
                    let specs = d.specifiers.iter().map(exp_spec).collect();
                    self.push_named(top, None, specs, None, is_type(d.export_kind), d.span.start, d.span.end);
                }
                Statement::ExportFromDeclaration(d) => {
                    let specs = d.specifiers.iter().map(exp_spec).collect();
                    self.push_named(top, None, specs, Some(jsv!(d.source.value)), is_type(d.export_kind), d.span.start, d.span.end);
                }
                Statement::ExportAllDeclaration(d) => {
                    if top {
                        self.info.top.push(TopRef::ExportAll(self.info.export_all.len()));
                    }
                    self.info.export_all.push(ExportAll {
                        source: jsv!(d.source.value),
                        exported: d.exported.as_ref().map(mod_name),
                        type_only: is_type(d.export_kind),
                        start: d.span.start as usize,
                        end: d.span.end as usize,
                    });
                }
                Statement::ExportDefaultDeclaration(d) => {
                    let kind = match &d.declaration {
                        ExportDefaultDeclarationKind::Identifier(i) => DefaultKind::Identifier(i.name.to_string()),
                        ExportDefaultDeclarationKind::FunctionDeclaration(f) => DefaultKind::Other {
                            runtime: !f.declare && !matches!(f.r#type, FunctionType::TSDeclareFunction),
                        },
                        ExportDefaultDeclarationKind::ClassDeclaration(c) => DefaultKind::Other { runtime: !c.declare },
                        ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => DefaultKind::Other { runtime: false },
                        _ => DefaultKind::Other { runtime: true },
                    };
                    self.info.export_default.push(kind);
                }
                Statement::TSNamespaceDeclaration(ns) => self.namespace(ns),
                Statement::TSGlobalDeclaration(g) => self.statements(&g.body.body, false),
                Statement::TSExternalModuleDeclaration(m) => {
                    if let Some(b) = &m.body {
                        self.statements(&b.body, false);
                    }
                }
                _ => {}
            }
        }
    }

    fn namespace(&mut self, ns: &TSNamespaceDeclaration) {
        match &ns.body {
            TSNamespaceDeclarationBody::TSModuleBlock(b) => self.statements(&b.body, false),
            TSNamespaceDeclarationBody::TSNamespaceDeclaration(inner) => self.namespace(inner),
        }
    }
}

struct DynVisitor<'s> {
    found: &'s mut Vec<(String, usize, usize)>,
}

impl<'a, 's> Visit<'a> for DynVisitor<'s> {
    fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
        if let Expression::StringLiteral(s) = &it.source {
            self.found.push((jsv!(s.value), s.span.start as usize, s.span.end as usize));
        }
        oxc_ast_visit::walk::walk_import_expression(self, it);
    }
    fn visit_ts_import_type(&mut self, it: &TSImportType<'a>) {
        let s = &it.source;
        self.found.push((jsv!(s.value), s.span.start as usize, s.span.end as usize));
        oxc_ast_visit::walk::walk_ts_import_type(self, it);
    }
}

/// Parse `code` as a module (TypeScript when `ts`, always with JSX, as the
/// JS readers configure Babel). `strict`: a module with syntax errors reads
/// as unparsed (Babel without error recovery throws).
pub fn read_module(code: &str, file: &str, strict: bool) -> ModuleInfo {
    let ts = file.ends_with(".ts") || file.ends_with(".tsx") || file.ends_with(".mts") || file.ends_with(".cts");
    let source_type = if ts {
        if file.ends_with(".tsx") {
            SourceType::tsx()
        } else {
            SourceType::ts()
        }
    } else {
        SourceType::jsx().with_module(true)
    };
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, code, source_type).parse();
    let mut info = ModuleInfo::default();
    if ret.fatal_error || (strict && ret.diagnostics.has_errors()) {
        return info;
    }
    info.parsed = true;
    Collector { info: &mut info }.statements(&ret.program.body, true);
    let mut dynamic = Vec::new();
    DynVisitor { found: &mut dynamic }.visit_program(&ret.program);
    info.dynamic = dynamic;
    info
}
