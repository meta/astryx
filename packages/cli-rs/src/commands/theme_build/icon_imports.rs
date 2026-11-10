//! `api/theme/build/icon-imports.mjs`: trace the selected theme export's
//! `icons` (or `componentIcons`) back to import bindings, statically, so the
//! built module can import the registry rather than inline it.
//!
//! The JS CLI walks a Babel AST; this walks oxc's, converted first into a
//! small owned tree holding only what the tracer reads.

use super::build_impl::{err, ApiError};
use super::nodepath;
use crate::json::{self, Value};
use oxc::allocator::Allocator;
use oxc::ast::ast::*;
use oxc::ast_visit::{walk, Visit};
use oxc::parser::Parser;
use oxc::semantic::{Scoping, SemanticBuilder};
use oxc::span::SourceType;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

// ---------------------------------------------------------------------------
// The owned tree.

#[derive(Debug)]
pub enum N {
    Ident(String),
    /// `optional`: inside an optional chain (Babel's OptionalMemberExpression).
    Member { object: Rc<N>, prop: MProp, optional: bool },
    Call { callee: Rc<N>, args: Vec<Rc<N>> },
    Object(Vec<P>),
    Null,
    Str(String),
    Num(f64),
    Bool(bool),
    Template { cooked: Option<String>, exprs: usize },
    Void,
    Function,
    Other,
}

#[derive(Debug)]
pub enum MProp {
    Name(String),
    ComputedStr(String),
    Computed,
}

#[derive(Debug)]
pub enum P {
    Spread(Rc<N>),
    Prop { key: Option<String>, computed_str: Option<String>, computed: bool, value: Rc<N>, method: bool, init: bool },
}

fn js(s: oxc::str::JSStr) -> String {
    s.as_str().unwrap_or("").to_string()
}

fn mep_name(m: &ModuleExportName) -> String {
    match m {
        ModuleExportName::IdentifierName(n) => n.name.to_string(),
        ModuleExportName::IdentifierReference(n) => n.name.to_string(),
        ModuleExportName::StringLiteral(s) => js(s.value),
    }
}

fn conv(e: &Expression) -> Rc<N> {
    Rc::new(conv_inner(e, false))
}

fn member(m: &MemberExpression, optional: bool) -> N {
    match m {
        MemberExpression::StaticMemberExpression(s) => N::Member {
            object: Rc::new(conv_inner(&s.object, optional)),
            prop: MProp::Name(s.property.name.to_string()),
            optional,
        },
        MemberExpression::ComputedMemberExpression(c) => N::Member {
            object: Rc::new(conv_inner(&c.object, optional)),
            prop: match c.expression.without_parentheses() {
                Expression::StringLiteral(s) => MProp::ComputedStr(js(s.value)),
                _ => MProp::Computed,
            },
            optional,
        },
        MemberExpression::PrivateFieldExpression(_) => N::Other,
    }
}

fn conv_inner(e: &Expression, in_chain: bool) -> N {
    match e {
        Expression::ParenthesizedExpression(p) => conv_inner(&p.expression, in_chain),
        Expression::TSAsExpression(x) => conv_inner(&x.expression, in_chain),
        Expression::TSSatisfiesExpression(x) => conv_inner(&x.expression, in_chain),
        Expression::TSNonNullExpression(x) => conv_inner(&x.expression, in_chain),
        Expression::TSTypeAssertion(x) => conv_inner(&x.expression, in_chain),
        Expression::Identifier(i) => N::Ident(i.name.to_string()),
        Expression::NullLiteral(_) => N::Null,
        Expression::StringLiteral(s) => N::Str(js(s.value)),
        Expression::NumericLiteral(n) => N::Num(n.value),
        Expression::BooleanLiteral(b) => N::Bool(b.value),
        Expression::TemplateLiteral(t) => N::Template {
            cooked: t.quasis.first().and_then(|q| q.value.cooked.map(js)),
            exprs: t.expressions.len(),
        },
        Expression::UnaryExpression(u) if u.operator == oxc::syntax::operator::UnaryOperator::Void => N::Void,
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => N::Function,
        Expression::CallExpression(c) => N::Call { callee: Rc::new(conv_inner(&c.callee, in_chain)), args: c.arguments.iter().map(arg).collect() },
        Expression::ChainExpression(c) => match &c.expression {
            ChainElement::CallExpression(_) => N::Other,
            ChainElement::TSNonNullExpression(x) => conv_inner(&x.expression, true),
            m => m.as_member_expression().map(|m| member(m, true)).unwrap_or(N::Other),
        },
        Expression::ObjectExpression(o) => N::Object(
            o.properties
                .iter()
                .map(|p| match p {
                    ObjectPropertyKind::SpreadProperty(s) => P::Spread(conv(&s.argument)),
                    ObjectPropertyKind::ObjectProperty(p) => {
                        let (key, computed_str) = match &p.key {
                            PropertyKey::StaticIdentifier(i) => (Some(i.name.to_string()), None),
                            PropertyKey::StringLiteral(s) => (Some(js(s.value)), Some(js(s.value))),
                            _ => (None, None),
                        };
                        P::Prop {
                            key: if p.computed { None } else { key },
                            computed_str: if p.computed { computed_str } else { None },
                            computed: p.computed,
                            value: conv(&p.value),
                            method: p.method,
                            init: p.kind == PropertyKind::Init,
                        }
                    }
                })
                .collect(),
        ),
        _ => match e.as_member_expression() {
            Some(m) => member(m, in_chain),
            None => N::Other,
        },
    }
}

fn arg(a: &Argument) -> Rc<N> {
    match a {
        Argument::SpreadElement(_) => Rc::new(N::Other),
        _ => conv(a.to_expression()),
    }
}

fn binding_names(p: &BindingPattern, out: &mut Vec<String>) {
    match p {
        BindingPattern::BindingIdentifier(i) => out.push(i.name.to_string()),
        BindingPattern::AssignmentPattern(a) => binding_names(&a.left, out),
        BindingPattern::ObjectPattern(o) => {
            for prop in &o.properties {
                binding_names(&prop.value, out);
            }
            if let Some(r) = &o.rest {
                binding_names(&r.argument, out);
            }
        }
        BindingPattern::ArrayPattern(a) => {
            for el in a.elements.iter().flatten() {
                binding_names(el, out);
            }
            if let Some(r) = &a.rest {
                binding_names(&r.argument, out);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Modules.

#[derive(Clone, Debug)]
pub struct ImportB {
    pub source: String,
    pub imported_name: Option<String>,
    pub local_name: String,
}

#[derive(Clone, Debug)]
enum Binding {
    Import(ImportB),
    Const(Rc<N>),
    Unsupported,
}

#[derive(Clone, Debug)]
enum Export {
    Node(Rc<N>),
    Binding(ImportB),
}

struct Module {
    filename: String,
    bindings: HashMap<String, Binding>,
    exports: HashMap<String, Export>,
    stars: Vec<String>,
    mutated: HashSet<String>,
}

fn unwrap(n: &Rc<N>) -> &Rc<N> {
    n
}

fn root_identifier(n: &N) -> Option<String> {
    match n {
        N::Ident(s) => Some(s.clone()),
        N::Member { object, .. } => root_identifier(object),
        _ => None,
    }
}

/// The root identifier of an expression, with the reference it resolves to.
fn root_ref<'a>(e: &'a Expression<'a>) -> Option<&'a IdentifierReference<'a>> {
    let e = e.without_parentheses();
    match e {
        Expression::Identifier(i) => Some(i),
        Expression::TSAsExpression(x) => root_ref(&x.expression),
        Expression::TSSatisfiesExpression(x) => root_ref(&x.expression),
        Expression::TSNonNullExpression(x) => root_ref(&x.expression),
        Expression::TSTypeAssertion(x) => root_ref(&x.expression),
        Expression::ChainExpression(c) => match &c.expression {
            ChainElement::CallExpression(_) => None,
            ChainElement::TSNonNullExpression(x) => root_ref(&x.expression),
            m => m.as_member_expression().and_then(|m| root_ref(m.object())),
        },
        _ => e.as_member_expression().and_then(|m| root_ref(m.object())),
    }
}

fn target_root<'a>(t: &'a SimpleAssignmentTarget<'a>) -> Option<&'a IdentifierReference<'a>> {
    match t {
        SimpleAssignmentTarget::AssignmentTargetIdentifier(i) => Some(i),
        SimpleAssignmentTarget::TSAsExpression(x) => root_ref(&x.expression),
        SimpleAssignmentTarget::TSSatisfiesExpression(x) => root_ref(&x.expression),
        SimpleAssignmentTarget::TSNonNullExpression(x) => root_ref(&x.expression),
        SimpleAssignmentTarget::TSTypeAssertion(x) => root_ref(&x.expression),
        _ => t.as_member_expression().and_then(|m| root_ref(m.object())),
    }
}

struct Mutations<'s> {
    scoping: &'s Scoping,
    bindings: &'s HashMap<String, Binding>,
    out: HashSet<String>,
}

impl Mutations<'_> {
    fn mark(&mut self, r: Option<&IdentifierReference>) {
        let Some(r) = r else { return };
        let Some(rid) = r.reference_id.get() else { return };
        let Some(sym) = self.scoping.get_reference(rid).symbol_id() else { return };
        if self.scoping.symbol_scope_id(sym) == self.scoping.root_scope_id() {
            self.out.insert(r.name.to_string());
        }
    }
}

impl<'a> Visit<'a> for Mutations<'_> {
    fn visit_assignment_expression(&mut self, it: &AssignmentExpression<'a>) {
        if let Some(s) = it.left.as_simple_assignment_target() {
            self.mark(target_root(s));
        }
        walk::walk_assignment_expression(self, it);
    }
    fn visit_update_expression(&mut self, it: &UpdateExpression<'a>) {
        self.mark(target_root(&it.argument));
        walk::walk_update_expression(self, it);
    }
    fn visit_unary_expression(&mut self, it: &UnaryExpression<'a>) {
        if it.operator == oxc::syntax::operator::UnaryOperator::Delete {
            self.mark(root_ref(&it.argument));
        }
        walk::walk_unary_expression(self, it);
    }
    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        let callee = conv(&it.callee);
        if !is_define_theme_in(self.bindings, &callee, &mut HashSet::new()) {
            if let Some(m) = it.callee.without_parentheses().as_member_expression() {
                self.mark(root_ref(m.object()));
            }
            for a in &it.arguments {
                if !matches!(a, Argument::SpreadElement(_)) {
                    self.mark(root_ref(a.to_expression()));
                }
            }
        }
        walk::walk_call_expression(self, it);
    }
}

fn is_define_theme_in(bindings: &HashMap<String, Binding>, n: &N, seen: &mut HashSet<String>) -> bool {
    match n {
        N::Ident(name) => {
            if !seen.insert(name.clone()) {
                return false;
            }
            match bindings.get(name) {
                Some(Binding::Const(node)) => is_define_theme_in(bindings, node, seen),
                Some(Binding::Import(b)) => {
                    (b.source == "@astryxdesign/core" || b.source == "@astryxdesign/core/theme") && b.imported_name.as_deref() == Some("defineTheme")
                }
                _ => false,
            }
        }
        N::Member { object, prop: MProp::Name(p), optional: false } if p == "defineTheme" => {
            if let N::Ident(o) = object.as_ref() {
                if let Some(Binding::Import(b)) = bindings.get(o) {
                    return b.imported_name.as_deref() == Some("*") && (b.source == "@astryxdesign/core" || b.source == "@astryxdesign/core/theme");
                }
            }
            false
        }
        _ => false,
    }
}

fn parse_module(filename: &str, source: &str) -> Option<Module> {
    let allocator = Allocator::default();
    let ts = regress::Regex::new(r"\.[cm]?ts$").unwrap().find(filename).is_some();
    let st = if ts { SourceType::ts() } else { SourceType::tsx() }.with_module(true);
    let ret = Parser::new(&allocator, source, st).parse();
    if !ret.diagnostics.is_empty() {
        return None;
    }
    let program = ret.program;
    let mut m = Module { filename: filename.to_string(), bindings: HashMap::new(), exports: HashMap::new(), stars: vec![], mutated: HashSet::new() };
    let mut aliases: HashMap<String, String> = HashMap::new();
    for stmt in &program.body {
        if let Statement::ImportDeclaration(d) = stmt {
            if !d.import_kind.is_type() {
                for s in d.specifiers.iter().flatten() {
                    match s {
                        ImportDeclarationSpecifier::ImportSpecifier(i) => {
                            if i.import_kind.is_type() {
                                continue;
                            }
                            m.bindings.insert(
                                i.local.name.to_string(),
                                Binding::Import(ImportB {
                                    source: js(d.source.value),
                                    imported_name: Some(mep_name(&i.imported)),
                                    local_name: i.local.name.to_string(),
                                }),
                            );
                        }
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(i) => {
                            m.bindings.insert(
                                i.local.name.to_string(),
                                Binding::Import(ImportB { source: js(d.source.value), imported_name: Some("default".into()), local_name: i.local.name.to_string() }),
                            );
                        }
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(i) => {
                            m.bindings.insert(
                                i.local.name.to_string(),
                                Binding::Import(ImportB { source: js(d.source.value), imported_name: Some("*".into()), local_name: i.local.name.to_string() }),
                            );
                        }
                    }
                }
            }
        }
        let (decl, exported) = match stmt {
            Statement::ExportDeclaration(e) => match &e.declaration {
                Declaration::VariableDeclaration(v) => (Some(&**v), true),
                _ => (None, true),
            },
            Statement::VariableDeclaration(v) => (Some(&**v), false),
            _ => (None, false),
        };
        if let Some(v) = decl {
            for item in &v.declarations {
                let init = item.init.as_ref().map(conv);
                if let Some(original) = init.as_ref().and_then(|n| root_identifier(n)) {
                    let mut names = vec![];
                    binding_names(&item.id, &mut names);
                    for n in names {
                        aliases.insert(n, original.clone());
                    }
                }
                let BindingPattern::BindingIdentifier(id) = &item.id else { continue };
                let node = init.unwrap_or_else(|| Rc::new(N::Other));
                m.bindings.insert(
                    id.name.to_string(),
                    if v.kind == VariableDeclarationKind::Const { Binding::Const(node) } else { Binding::Unsupported },
                );
                if exported {
                    m.exports.insert(id.name.to_string(), Export::Node(Rc::new(N::Ident(id.name.to_string()))));
                }
            }
        }
        match stmt {
            Statement::ExportDefaultDeclaration(d) => {
                let node = match &d.declaration {
                    ExportDefaultDeclarationKind::FunctionDeclaration(_) => Rc::new(N::Function),
                    ExportDefaultDeclarationKind::ClassDeclaration(_) | ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => Rc::new(N::Other),
                    other => conv(other.to_expression()),
                };
                m.exports.insert("default".into(), Export::Node(node));
            }
            Statement::ExportNamedDeclaration(e) if !e.export_kind.is_type() => {
                for s in &e.specifiers {
                    if s.export_kind.is_type() {
                        continue;
                    }
                    m.exports.insert(mep_name(&s.exported), Export::Node(Rc::new(N::Ident(mep_name(&s.local)))));
                }
            }
            Statement::ExportFromDeclaration(e) if !e.export_kind.is_type() => {
                for s in &e.specifiers {
                    if s.export_kind.is_type() {
                        continue;
                    }
                    let local = mep_name(&s.local);
                    m.exports.insert(
                        mep_name(&s.exported),
                        Export::Binding(ImportB { source: js(e.source.value), imported_name: Some(local.clone()), local_name: local }),
                    );
                }
            }
            Statement::ExportAllDeclaration(e) if !e.export_kind.is_type() => match &e.exported {
                Some(name) => {
                    let n = mep_name(name);
                    m.exports.insert(n.clone(), Export::Binding(ImportB { source: js(e.source.value), imported_name: Some("*".into()), local_name: n }));
                }
                None => m.stars.push(js(e.source.value)),
            },
            _ => {}
        }
    }
    let semantic = SemanticBuilder::new().build(&program).semantic;
    let scoping = semantic.scoping();
    let mut muts = Mutations { scoping, bindings: &m.bindings, out: HashSet::new() };
    muts.visit_program(&program);
    let mut mutated = muts.out;
    let extra: Vec<String> = mutated.iter().filter_map(|n| aliases.get(n).cloned()).collect();
    mutated.extend(extra);
    m.mutated = mutated;
    Some(m)
}

// ---------------------------------------------------------------------------
// Plans.

#[derive(Clone, Debug)]
pub struct Ref {
    module: String,
    binding: ImportB,
    members: Vec<String>,
}

#[derive(Clone, Debug)]
enum Slot {
    Json(Option<Value>),
    Ref(Ref),
    Object(Vec<(String, Slot)>),
}

#[derive(Clone, Debug)]
enum Plan {
    Registry { r: Ref, preferred: String, override_: bool, entries: bool },
    Merge { base: Box<Plan>, own: Box<Plan>, theme: bool },
    Object(Vec<(String, Slot)>),
}

pub struct Options<'a> {
    pub has_icons: bool,
    pub function_entries: bool,
    pub field: &'a str,
    pub merge_name: String,
    pub reserved: Vec<String>,
    pub raw_input: bool,
    /// The theme file's bytes as loaded.
    pub entry_source: String,
}

#[derive(Clone, Debug)]
pub struct IconImports {
    pub imports: Vec<(String, String, String)>,
    pub expression: String,
    pub export_name: String,
    pub merge_name: Option<String>,
    pub icons_specifier_import_path: Option<String>,
    pub icons_specifier_local_name: Option<String>,
}

struct Tracer<'o> {
    o: &'o Options<'o>,
    entry: String,
    modules: HashMap<String, Rc<Module>>,
    active: HashSet<String>,
    inspected: bool,
}

const THEME_MODULE_EXTENSIONS: [&str; 10] = [".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx", ".mjs", ".cjs", ".js", ".json"];

/// jiti's resolution of a relative theme import with the build's extension
/// order.
fn resolve_module(spec: &str, from: &str) -> Option<String> {
    let base = nodepath::resolve(&nodepath::dirname(from), &[spec]);
    let is_file = |p: &str| std::path::Path::new(p).is_file();
    if is_file(&base) {
        return Some(base);
    }
    for e in THEME_MODULE_EXTENSIONS {
        let c = format!("{base}{e}");
        if is_file(&c) {
            return Some(c);
        }
    }
    for e in THEME_MODULE_EXTENSIONS {
        let c = format!("{base}/index{e}");
        if is_file(&c) {
            return Some(c);
        }
    }
    None
}

impl Tracer<'_> {
    fn fail(&self, name: Option<&str>, reason: &str) -> ApiError {
        let field = self.o.field;
        if field == "componentIcons" {
            let value = name.map(|n| format!("`componentIcons: {n}`")).unwrap_or_else(|| "componentIcons".into());
            return err(
                format!(
                    "Theme sets {value} but the build cannot carry it. {}A built theme carries names, null, and requests made of static values, constants, or imported bindings, and slot functions imported from their own module.",
                    if reason.is_empty() { String::new() } else { format!("{reason} ") }
                ),
                "ERR_THEME_INVALID",
            );
        }
        let registry = name.map(|n| format!("`icons: {n}`")).unwrap_or_else(|| "an icon registry".into());
        err(
            format!(
                "Theme sets {registry} but no import for the registry was found. The generated module cannot preserve inline registries because they may contain React elements, which cannot be serialized. {}Move the registry to its own module and import it into the theme file.",
                if reason.is_empty() { String::new() } else { format!("{reason} ") }
            ),
            "ERR_THEME_INVALID",
        )
    }

    fn guard<T>(&mut self, key: String, f: impl FnOnce(&mut Self) -> Result<T, ApiError>) -> Result<T, ApiError> {
        if self.active.contains(&key) {
            return Err(self.fail(None, "The icon reference contains a cycle."));
        }
        self.active.insert(key.clone());
        let r = f(self);
        self.active.remove(&key);
        r
    }

    fn read_module(&mut self, filename: &str) -> Result<Rc<Module>, ApiError> {
        if let Some(m) = self.modules.get(filename) {
            return Ok(m.clone());
        }
        let source = if nodepath::resolve("/", &[filename]) == nodepath::resolve("/", &[&self.entry]) {
            self.o.entry_source.clone()
        } else {
            std::fs::read_to_string(filename).unwrap_or_default()
        };
        let m = parse_module(filename, &source).ok_or_else(|| self.fail(None, "The selected theme module could not be parsed."))?;
        let rc = Rc::new(m);
        self.modules.insert(filename.to_string(), rc.clone());
        Ok(rc)
    }

    fn checked_binding(&self, m: &Module, name: &str) -> Result<Binding, ApiError> {
        if m.mutated.contains(name) {
            return Err(self.fail(Some(name), "The referenced binding is mutated or passed to unsupported code."));
        }
        match m.bindings.get(name) {
            None | Some(Binding::Unsupported) => Err(self.fail(Some(name), "")),
            Some(b) => Ok(b.clone()),
        }
    }

    fn reference(&mut self, m: &Rc<Module>, n: &Rc<N>) -> Result<Option<Ref>, ApiError> {
        match n.as_ref() {
            N::Ident(name) => {
                let name = name.clone();
                let key = format!("{}:reference:{}", m.filename, name);
                let m2 = m.clone();
                self.guard(key, move |t| match t.checked_binding(&m2, &name)? {
                    Binding::Import(b) => Ok(Some(Ref { module: m2.filename.clone(), binding: b, members: vec![] })),
                    Binding::Const(node) => t.reference(&m2, &node),
                    Binding::Unsupported => unreachable!(),
                })
            }
            N::Member { object, prop, optional: false } => {
                let name = match prop {
                    MProp::Name(s) | MProp::ComputedStr(s) => s.clone(),
                    MProp::Computed => return Err(self.fail(None, "")),
                };
                let Some(mut r) = self.reference(m, object)? else { return Ok(None) };
                r.members.push(name);
                Ok(Some(r))
            }
            _ => Ok(None),
        }
    }

    fn imported_export(&mut self, r: &Ref) -> Result<Option<(Rc<Module>, String)>, ApiError> {
        if !r.binding.source.starts_with('.') {
            return Ok(None);
        }
        let filename = resolve_module(&r.binding.source, &r.module)
            .ok_or_else(|| self.fail(Some(&r.binding.local_name), "The inherited theme module could not be resolved."))?;
        let mut name = r.binding.imported_name.clone();
        let mut members = r.members.clone();
        if name.as_deref() == Some("*") {
            name = if members.is_empty() { None } else { Some(members.remove(0)) };
        }
        let Some(name) = name.filter(|n| !n.is_empty()) else {
            return Err(self.fail(Some(&r.binding.local_name), "The inherited theme must name a module export."));
        };
        if !members.is_empty() {
            return Err(self.fail(Some(&r.binding.local_name), "The inherited theme must name a module export."));
        }
        let m = self.read_module(&filename)?;
        Ok(Some((m, name)))
    }

    fn selected_export(&mut self, m: &Rc<Module>, name: &str) -> Result<Export, ApiError> {
        if let Some(e) = m.exports.get(name) {
            return Ok(e.clone());
        }
        for source in m.stars.clone() {
            if name == "default" {
                continue;
            }
            let binding = ImportB { source, imported_name: Some(name.to_string()), local_name: name.to_string() };
            let r = Ref { module: m.filename.clone(), binding: binding.clone(), members: vec![] };
            if let Some((tm, _)) = self.imported_export(&r)? {
                if tm.exports.contains_key(name) || !tm.stars.is_empty() {
                    return Ok(Export::Binding(binding));
                }
            }
        }
        Err(self.fail(None, &format!("The selected export \"{name}\" has no statically resolved declaration.")))
    }

    fn default_name(&self) -> &'static str {
        if self.o.field == "componentIcons" {
            "themeComponentIcons"
        } else {
            "themeIcons"
        }
    }

    fn package_theme(&self, r: Ref) -> Plan {
        if self.o.function_entries {
            Plan::Registry { r, preferred: self.default_name().into(), override_: false, entries: true }
        } else {
            let mut r = r;
            r.members.push(self.o.field.to_string());
            Plan::Registry { r, preferred: self.default_name().into(), override_: false, entries: false }
        }
    }

    fn exported_theme(&mut self, m: &Rc<Module>, name: &str, reject_opaque: bool) -> Result<Option<Plan>, ApiError> {
        let key = format!("{}:theme-export:{}", m.filename, name);
        let m2 = m.clone();
        let name = name.to_string();
        self.guard(key, move |t| match t.selected_export(&m2, &name)? {
            Export::Binding(b) => t.theme_reference(Ref { module: m2.filename.clone(), binding: b, members: vec![] }, reject_opaque),
            Export::Node(n) => t.theme(&m2, &n, reject_opaque),
        })
    }

    fn is_built_theme(m: &Module, n: &N, seen: &mut HashSet<String>) -> bool {
        match n {
            N::Ident(name) => {
                if !seen.insert(name.clone()) {
                    return false;
                }
                matches!(m.bindings.get(name), Some(Binding::Const(node)) if Self::is_built_theme(m, node, seen))
            }
            N::Object(props) => props.iter().any(|p| matches!(p, P::Prop { key: Some(k), value, .. } if k == "__built" && matches!(value.as_ref(), N::Bool(true)))),
            _ => false,
        }
    }

    fn theme_reference(&mut self, r: Ref, reject_opaque: bool) -> Result<Option<Plan>, ApiError> {
        let target = self.imported_export(&r)?;
        if let (Some((tm, tname)), true) = (&target, self.o.field == "componentIcons") {
            if let Export::Node(n) = self.selected_export(tm, tname)? {
                if Self::is_built_theme(tm, &n, &mut HashSet::new()) {
                    return Ok(Some(self.package_theme(r)));
                }
            }
        }
        if let Some((tm, tname)) = target {
            return self.exported_theme(&tm, &tname, reject_opaque);
        }
        if reject_opaque {
            return Err(self.fail(Some(&r.binding.local_name), "A raw package configuration cannot supply a resolved theme registry."));
        }
        Ok(Some(self.package_theme(r)))
    }

    fn registry(&mut self, m: &Rc<Module>, n: &Rc<N>, preferred: Option<String>) -> Result<Option<Plan>, ApiError> {
        self.inspected = true;
        match n.as_ref() {
            N::Null | N::Void => return Ok(None),
            N::Ident(name) => {
                if name == "undefined" && !m.bindings.contains_key(name) {
                    return Ok(None);
                }
                let key = format!("{}:registry:{}", m.filename, name);
                let m2 = m.clone();
                let name = name.clone();
                return self.guard(key, move |t| match t.checked_binding(&m2, &name)? {
                    Binding::Const(node) => t.registry(&m2, &node, Some(preferred.unwrap_or(name))),
                    Binding::Import(b) => Ok(Some(Plan::Registry {
                        r: Ref { module: m2.filename.clone(), binding: b, members: vec![] },
                        preferred: preferred.unwrap_or(name),
                        override_: true,
                        entries: false,
                    })),
                    Binding::Unsupported => unreachable!(),
                });
            }
            N::Member { optional: false, .. } => {
                if let Some(r) = self.reference(m, n)? {
                    let override_ = r.binding.imported_name.as_deref() == Some("*") && r.members.len() == 1;
                    return Ok(Some(Plan::Registry { r, preferred: preferred.unwrap_or_else(|| self.default_name().into()), override_, entries: false }));
                }
            }
            _ => {}
        }
        if let N::Object(props) = n.as_ref() {
            if self.o.field == "componentIcons" {
                return self.slot_object(m, props);
            }
            if props.iter().all(|p| matches!(p, P::Spread(_))) {
                let mut result: Option<Plan> = None;
                for p in props {
                    if let P::Spread(a) = p {
                        if let Some(next) = self.registry(m, a, None)? {
                            result = Some(match result {
                                Some(b) => Plan::Merge { base: Box::new(b), own: Box::new(next), theme: false },
                                None => next,
                            });
                        }
                    }
                }
                return Ok(result);
            }
        }
        let name = preferred.or_else(|| root_identifier(n));
        Err(self.fail(name.as_deref(), ""))
    }

    fn plain_key(p: &P) -> Option<String> {
        match p {
            P::Prop { key, computed_str, computed, method, init, .. } => {
                if *method || !*init {
                    return None;
                }
                if !*computed {
                    key.clone()
                } else {
                    computed_str.clone()
                }
            }
            _ => None,
        }
    }

    fn slot_data(&mut self, m: &Rc<Module>, n: &Rc<N>, path: &HashSet<String>) -> Result<Option<Slot>, ApiError> {
        Ok(match n.as_ref() {
            N::Null => Some(Slot::Json(Some(Value::Null))),
            N::Str(s) => Some(Slot::Json(Some(Value::String(s.clone())))),
            N::Num(x) => Some(Slot::Json(Some(json::num(*x)))),
            N::Bool(b) => Some(Slot::Json(Some(Value::Bool(*b)))),
            N::Template { cooked, exprs: 0 } => Some(Slot::Json(Some(cooked.clone().map(Value::String).unwrap_or(Value::Null)))),
            N::Void => Some(Slot::Json(None)),
            N::Ident(name) if name == "undefined" && !m.bindings.contains_key(name) => Some(Slot::Json(None)),
            N::Ident(name) => {
                let Some(b) = m.bindings.get(name).cloned() else { return Ok(None) };
                if m.mutated.contains(name) || path.contains(name) {
                    return Ok(None);
                }
                match b {
                    Binding::Import(b) => Some(Slot::Ref(Ref { module: m.filename.clone(), binding: b, members: vec![] })),
                    Binding::Const(node) => {
                        let mut p = path.clone();
                        p.insert(name.clone());
                        self.slot_data(m, &node, &p)?
                    }
                    Binding::Unsupported => None,
                }
            }
            N::Member { object, prop, optional: false } => {
                let name = match prop {
                    MProp::Name(s) | MProp::ComputedStr(s) => s.clone(),
                    MProp::Computed => return Ok(None),
                };
                match self.slot_data(m, object, path)? {
                    None => None,
                    Some(Slot::Ref(mut r)) => {
                        r.members.push(name);
                        Some(Slot::Ref(r))
                    }
                    Some(Slot::Object(entries)) => Some(entries.iter().rev().find(|(k, _)| *k == name).map(|e| e.1.clone()).unwrap_or(Slot::Json(None))),
                    Some(Slot::Json(_)) => None,
                }
            }
            N::Object(props) => {
                let mut entries = Vec::new();
                for p in props {
                    let Some(key) = Self::plain_key(p) else { return Ok(None) };
                    let P::Prop { value, .. } = p else { return Ok(None) };
                    let Some(v) = self.slot_data(m, value, path)? else { return Ok(None) };
                    entries.push((key, v));
                }
                Some(Slot::Object(entries))
            }
            _ => None,
        })
    }

    fn is_local_function(m: &Module, n: &N, seen: &mut HashSet<String>) -> bool {
        match n {
            N::Ident(name) if !seen.contains(name) => {
                seen.insert(name.clone());
                matches!(m.bindings.get(name), Some(Binding::Const(node)) if Self::is_local_function(m, node, seen))
            }
            N::Function => true,
            _ => false,
        }
    }

    fn slot_object(&mut self, m: &Rc<Module>, props: &[P]) -> Result<Option<Plan>, ApiError> {
        let mut result: Option<Plan> = None;
        let mut entries: Option<Vec<(String, Slot)>> = None;
        fn add(result: &mut Option<Plan>, next: Option<Plan>) {
            if let Some(n) = next {
                *result = Some(match result.take() {
                    Some(b) => Plan::Merge { base: Box::new(b), own: Box::new(n), theme: false },
                    None => n,
                });
            }
        }
        for p in props {
            if let P::Spread(a) = p {
                if let Some(e) = entries.take() {
                    add(&mut result, Some(Plan::Object(e)));
                }
                let next = self.registry(m, a, None)?;
                add(&mut result, next);
                continue;
            }
            let Some(key) = Self::plain_key(p) else {
                return Err(self.fail(None, "A slot must be a plain property with a static name."));
            };
            let P::Prop { value, .. } = p else { unreachable!() };
            let data = match self.slot_data(m, value, &HashSet::new())? {
                Some(d) => d,
                None => {
                    let reason = if Self::is_local_function(m, value, &mut HashSet::new()) {
                        format!("The slot function for \"{key}\" is defined in the theme file.")
                    } else {
                        format!("The value for \"{key}\" is neither a static value nor an imported binding.")
                    };
                    return Err(self.fail(None, &reason));
                }
            };
            entries.get_or_insert_with(Vec::new).push((key, data));
        }
        if let Some(e) = entries {
            add(&mut result, Some(Plan::Object(e)));
        }
        Ok(result)
    }

    /// The theme config's relevant fields: field, `__field`, `extends`.
    fn fields(&mut self, m: &Rc<Module>, n: &Rc<N>) -> Result<Vec<(String, FieldVal)>, ApiError> {
        match n.as_ref() {
            N::Ident(name) => {
                let key = format!("{}:fields:{}", m.filename, name);
                let m2 = m.clone();
                let name = name.clone();
                return self.guard(key, move |t| match t.checked_binding(&m2, &name)? {
                    Binding::Const(node) => t.fields(&m2, &node),
                    Binding::Import(b) => t.reference_fields(Ref { module: m2.filename.clone(), binding: b, members: vec![] }),
                    Binding::Unsupported => unreachable!(),
                });
            }
            N::Member { .. } => {
                if let N::Member { optional: false, .. } = n.as_ref() {
                    if let Some(r) = self.reference(m, n)? {
                        return self.reference_fields(r);
                    }
                }
            }
            N::Call { callee, .. } if is_define_theme_in(&m.bindings, callee, &mut HashSet::new()) => {
                let plan = self.theme(m, n, false)?;
                return Ok(vec![(self.o.field.to_string(), FieldVal::Plan(plan))]);
            }
            _ => {}
        }
        let N::Object(props) = n.as_ref() else { return Err(self.fail(None, "")) };
        let entries_field = format!("__{}", self.o.field);
        let mut result: Vec<(String, FieldVal)> = Vec::new();
        let mut set = |result: &mut Vec<(String, FieldVal)>, k: String, v: FieldVal| {
            if let Some(e) = result.iter_mut().find(|e| e.0 == k) {
                e.1 = v;
            } else {
                result.push((k, v));
            }
        };
        for p in props {
            match p {
                P::Spread(a) => {
                    for (k, v) in self.fields(m, a)? {
                        set(&mut result, k, v);
                    }
                }
                P::Prop { key, computed_str, computed, value, method, init } => {
                    let k = if *computed { computed_str.clone() } else { key.clone() };
                    let Some(k) = k else { return Err(self.fail(None, "Computed theme keys cannot be resolved.")) };
                    if k != self.o.field && k != entries_field && k != "extends" {
                        continue;
                    }
                    if *method || !*init {
                        return Err(self.fail(None, ""));
                    }
                    set(&mut result, k, FieldVal::Node(m.clone(), value.clone()));
                }
            }
        }
        Ok(result)
    }

    fn reference_fields(&mut self, r: Ref) -> Result<Vec<(String, FieldVal)>, ApiError> {
        let Some((tm, tname)) = self.imported_export(&r)? else {
            return Err(self.fail(Some(&r.binding.local_name), "A package configuration cannot be inspected for inherited registries."));
        };
        let key = format!("{}:fields-export:{}", tm.filename, tname);
        self.guard(key, move |t| match t.selected_export(&tm, &tname)? {
            Export::Binding(b) => t.reference_fields(Ref { module: tm.filename.clone(), binding: b, members: vec![] }),
            Export::Node(n) => t.fields(&tm, &n),
        })
    }

    fn theme(&mut self, m: &Rc<Module>, n: &Rc<N>, reject_opaque: bool) -> Result<Option<Plan>, ApiError> {
        let mut node = n.clone();
        match n.as_ref() {
            N::Ident(name) => {
                let key = format!("{}:theme:{}", m.filename, name);
                let m2 = m.clone();
                let name = name.clone();
                return self.guard(key, move |t| match t.checked_binding(&m2, &name)? {
                    Binding::Const(node) => t.theme(&m2, &node, reject_opaque),
                    Binding::Import(b) => t.theme_reference(Ref { module: m2.filename.clone(), binding: b, members: vec![] }, reject_opaque),
                    Binding::Unsupported => unreachable!(),
                });
            }
            N::Member { optional: false, .. } => {
                if let Some(r) = self.reference(m, n)? {
                    return self.theme_reference(r, reject_opaque);
                }
            }
            N::Call { callee, args } => {
                if !is_define_theme_in(&m.bindings, callee, &mut HashSet::new()) || args.len() != 1 {
                    return Err(self.fail(None, ""));
                }
                node = args[0].clone();
            }
            _ => {}
        }
        let config = self.fields(m, &node)?;
        let get = |k: &str| config.iter().find(|e| e.0 == k).map(|e| e.1.clone());
        let base_field = get("extends");
        let icon_field = get(&format!("__{}", self.o.field)).or_else(|| get(self.o.field));
        let base = match base_field {
            Some(FieldVal::Node(bm, bn)) => self.theme(&bm, &bn, false)?,
            Some(FieldVal::Plan(p)) => p,
            None => None,
        };
        let own = match icon_field {
            Some(FieldVal::Plan(p)) => p,
            Some(FieldVal::Node(im, inode)) => self.registry(&im, &inode, None)?,
            None => None,
        };
        if self.o.field == "componentIcons" {
            if let (Some(o), None) = (&own, &base) {
                return Ok(Some(Plan::Merge { base: Box::new(Plan::Object(vec![])), own: Box::new(o.clone()), theme: true }));
            }
        }
        Ok(match (base, own) {
            (Some(b), Some(o)) => Some(Plan::Merge { base: Box::new(b), own: Box::new(o), theme: true }),
            (b, o) => o.or(b),
        })
    }
}

#[derive(Clone)]
enum FieldVal {
    Node(Rc<Module>, Rc<N>),
    Plan(Option<Plan>),
}

struct Renderer<'a> {
    field: &'a str,
    merge_name: &'a str,
    entry_dir: String,
    used: HashSet<String>,
    imports: Vec<(String, String, String)>,
    emitted: HashMap<String, String>,
    uses_merge: bool,
    default_name: &'static str,
}

fn is_ident(s: &str) -> bool {
    let mut c = s.chars();
    matches!(c.next(), Some(f) if f.is_ascii_alphabetic() || f == '_' || f == '$') && c.all(|x| x.is_ascii_alphanumeric() || x == '_' || x == '$')
}

impl Renderer<'_> {
    fn allocate(&mut self, preferred: &str) -> String {
        let stem = if is_ident(preferred) && !["default", "await", "yield"].contains(&preferred) { preferred.to_string() } else { self.default_name.to_string() };
        let mut name = stem.clone();
        let mut i = 1;
        while self.used.contains(&name) {
            name = format!("{stem}{i}");
            i += 1;
        }
        self.used.insert(name.clone());
        name
    }

    fn import_path(&self, r: &Ref) -> String {
        let source = &r.binding.source;
        if !source.starts_with('.') || nodepath::dirname(&r.module) == self.entry_dir {
            return source.clone();
        }
        let abs = nodepath::resolve(&nodepath::dirname(&r.module), &[source]);
        let rel = nodepath::relative("/", &self.entry_dir, &abs);
        if rel.starts_with('.') {
            rel
        } else {
            format!("./{rel}")
        }
    }

    fn imported_target(&mut self, r: &Ref) -> (String, String, String) {
        let source = self.import_path(r);
        let members = Value::Array(r.members.iter().map(|m| Value::String(m.clone())).collect());
        let identity = format!("{source}\0{}\0{}", r.binding.imported_name.clone().unwrap_or_else(|| "undefined".into()), json::stringify(&members, 0));
        let local = match self.emitted.get(&identity) {
            Some(l) => l.clone(),
            None => {
                let l = self.allocate(&r.binding.local_name);
                self.emitted.insert(identity, l.clone());
                self.imports.push((source.clone(), r.binding.imported_name.clone().unwrap_or_default(), l.clone()));
                l
            }
        };
        let mut target = local.clone();
        for m in &r.members {
            target.push_str(&format!("[{}]", json::stringify(&Value::String(m.clone()), 0)));
        }
        (source, local, target)
    }

    fn render_data(&mut self, d: &Slot) -> String {
        match d {
            Slot::Ref(r) => self.imported_target(r).2,
            Slot::Object(entries) => {
                let parts: Vec<String> = entries
                    .iter()
                    .map(|(k, v)| format!("{}: {}", json::stringify(&Value::String(k.clone()), 0), self.render_data(v)))
                    .collect();
                format!("{{{}}}", parts.join(", "))
            }
            Slot::Json(None) => "void 0".into(),
            Slot::Json(Some(v)) => json::stringify(v, 0),
        }
    }

    /// `(expression, preferredName, overridePath, overrideLocalName)`.
    fn render(&mut self, p: &Plan) -> (String, String, Option<String>, Option<String>) {
        match p {
            Plan::Merge { base, own, theme } => {
                let b = self.render(base);
                let o = self.render(own);
                let theme_merge = self.field == "componentIcons" && *theme;
                if theme_merge {
                    self.uses_merge = true;
                }
                (
                    if theme_merge { format!("{}({}, {})", self.merge_name, b.0, o.0) } else { format!("{{...{}, ...{}}}", b.0, o.0) },
                    self.default_name.into(),
                    o.2,
                    o.3,
                )
            }
            Plan::Object(entries) => (self.render_data(&Slot::Object(entries.clone())), self.default_name.into(), None, None),
            Plan::Registry { r, preferred, override_, entries } => {
                let (source, local, target) = self.imported_target(r);
                let expression = if *entries {
                    format!(
                        "{{...{target}[{}], ...{target}[{}]}}",
                        json::stringify(&Value::String(self.field.into()), 0),
                        json::stringify(&Value::String(format!("__{}", self.field)), 0)
                    )
                } else {
                    target
                };
                let pref = if r.members.is_empty() && *preferred == r.binding.local_name { local.clone() } else { preferred.clone() };
                (expression, pref, override_.then(|| source), override_.then(|| local))
            }
        }
    }
}

/// `resolveIconImports(filePath, exportName, options)`.
pub fn resolve_icon_imports(file_path: &str, export_name: Option<&str>, o: &Options) -> Result<Option<IconImports>, ApiError> {
    let mut t = Tracer { o, entry: file_path.to_string(), modules: HashMap::new(), active: HashSet::new(), inspected: false };
    let Some(export_name) = export_name else {
        if !o.has_icons {
            return Ok(None);
        }
        return Err(t.fail(None, "The selected theme export could not be identified."));
    };
    let plan = (|| {
        let m = t.read_module(file_path)?;
        t.exported_theme(&m, export_name, o.raw_input)
    })();
    let plan = match plan {
        Ok(p) => p,
        Err(e) => {
            if !o.has_icons && !t.inspected {
                return Ok(None);
            }
            return Err(e);
        }
    };
    let Some(plan) = plan else {
        if o.has_icons {
            return Err(t.fail(None, ""));
        }
        return Ok(None);
    };
    let default_name = t.default_name();
    let mut r = Renderer {
        field: o.field,
        merge_name: &o.merge_name,
        entry_dir: nodepath::dirname(file_path),
        used: o.reserved.iter().cloned().collect(),
        imports: vec![],
        emitted: HashMap::new(),
        uses_merge: false,
        default_name,
    };
    let (expression, preferred, opath, olocal) = r.render(&plan);
    let name = if preferred == expression && r.imports.iter().any(|i| i.2 == expression) { expression.clone() } else { r.allocate(&preferred) };
    let _ = unwrap(&Rc::new(N::Other));
    Ok(Some(IconImports {
        imports: r.imports,
        expression,
        export_name: name,
        merge_name: r.uses_merge.then(|| o.merge_name.clone()),
        icons_specifier_import_path: opath,
        icons_specifier_local_name: olocal,
    }))
}
