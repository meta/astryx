//! Port of the parts of `foundation/discovery/module-exports.mjs` that
//! component discovery reads: which file declares a module's export, and a
//! module's exported object as plain data, both without running the module.
//! Parsed with oxc as TSX, as the JS parses every module with Babel's
//! `jsx` + `typescript` plugins.

use crate::json::{Map, Value};
use oxc::allocator::Allocator;
use oxc::ast::ast::*;
use oxc::parser::Parser;
use oxc::span::SourceType;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

fn jstr(s: &oxc::str::JSStr) -> String {
    match s.as_str() {
        Some(t) => t.to_string(),
        None => s.display().to_string(),
    }
}

/// Marks an object that left a computed or spread value out (`HAS_COMPUTED`).
/// JS keeps it as a non-enumerable symbol; here it is a key no doc can write.
pub const HAS_COMPUTED: &str = "\u{0}hasComputed";

const MODULE_EXTENSIONS: &[&str] = &[".mjs", ".js", ".cjs", ".mts", ".ts", ".cts", ".tsx", ".jsx"];

/// `writesWord(text, word)`.
fn writes_word(text: &str, word: &str) -> bool {
    let mut from = 0;
    while let Some(off) = text[from..].find(word) {
        let at = from + off;
        let before = text[..at].chars().next_back();
        let after = text[at + word.len()..].chars().next();
        let w = |c: Option<char>| c.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
        if !w(before) && !w(after) {
            return true;
        }
        from = at + text[at..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
    }
    false
}

/// `/\bexport\s*\*/`.
fn has_export_all(text: &str) -> bool {
    let mut from = 0;
    while let Some(off) = text[from..].find("export") {
        let at = from + off;
        let before = text[..at].chars().next_back();
        if !before.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_') {
            let rest = text[at + 6..].trim_start_matches(|c: char| c.is_whitespace());
            if rest.starts_with('*') {
                return true;
            }
        }
        from = at + 6;
    }
    false
}

/// `resolveLocalModule(specifier, fromFile)`.
pub fn resolve_local_module(specifier: &str, from_file: &Path) -> Option<PathBuf> {
    if !specifier.starts_with('.') {
        return None;
    }
    let base = normalize(&from_file.parent()?.join(specifier));
    let mut candidates = vec![base.clone()];
    for e in MODULE_EXTENSIONS {
        candidates.push(PathBuf::from(format!("{}{e}", base.display())));
    }
    for e in MODULE_EXTENSIONS {
        candidates.push(base.join(format!("index{e}")));
    }
    candidates.into_iter().find(|c| super::nodepath::is_file(&c.to_string_lossy()))
}

/// `path.resolve` without touching the disk.
pub fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn with_program<R>(text: &str, f: impl FnOnce(&Program) -> R) -> Option<R> {
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, text, SourceType::tsx()).parse();
    if ret.diagnostics.has_errors() {
        return None;
    }
    Some(f(&ret.program))
}

fn declared_names(decl: &Declaration) -> Vec<String> {
    match decl {
        Declaration::FunctionDeclaration(f) => {
            if f.declare || f.r#type == FunctionType::TSDeclareFunction {
                return Vec::new();
            }
            f.id.as_ref().map(|id| vec![id.name.to_string()]).unwrap_or_default()
        }
        Declaration::ClassDeclaration(c) => {
            if c.declare {
                return Vec::new();
            }
            c.id.as_ref().map(|id| vec![id.name.to_string()]).unwrap_or_default()
        }
        Declaration::VariableDeclaration(v) => {
            if v.declare {
                return Vec::new();
            }
            v.declarations
                .iter()
                .filter_map(|d| match &d.id {
                    BindingPattern::BindingIdentifier(id) => Some(id.name.to_string()),
                    _ => None,
                })
                .collect()
        }
        _ => Vec::new(),
    }
}

fn runtime_default(kind: &ExportDefaultDeclarationKind) -> bool {
    match kind {
        ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => false,
        ExportDefaultDeclarationKind::FunctionDeclaration(f) => {
            !f.declare && f.r#type != FunctionType::TSDeclareFunction
        }
        ExportDefaultDeclarationKind::ClassDeclaration(c) => !c.declare,
        _ => true,
    }
}

enum Step {
    Found(PathBuf),
    Follow(PathBuf, String),
}

/// `moduleExportSource(file, exportName)`.
pub fn module_export_source(file: &Path, export_name: &str) -> Option<PathBuf> {
    let mut seen = HashSet::new();
    export_source(file, export_name, &mut seen)
}

/// `moduleExportsName(file, exportName)`.
pub fn module_exports_name(file: &Path, export_name: &str) -> bool {
    module_export_source(file, export_name).is_some()
}

fn export_source(file: &Path, export_name: &str, seen: &mut HashSet<(PathBuf, String)>) -> Option<PathBuf> {
    if !seen.insert((file.to_path_buf(), export_name.to_string())) {
        return None;
    }
    if !super::nodepath::is_file(&file.to_string_lossy()) {
        return None;
    }
    let text = super::nodepath::read_text(&file.to_string_lossy())?;
    if export_name != "default" && !writes_word(&text, export_name) && !has_export_all(&text) {
        return None;
    }
    // Collect what to do in source order, then follow re-exports.
    let (named, default_found, alls) = with_program(&text, |program| {
        let mut named: Vec<Vec<Step>> = Vec::new();
        let mut default_found = false;
        let mut alls: Vec<String> = Vec::new();
        for stmt in &program.body {
            match stmt {
                Statement::ExportDeclaration(node) => {
                    if declared_names(&node.declaration).iter().any(|n| n == export_name) {
                        named.push(vec![Step::Found(file.to_path_buf())]);
                    }
                }
                Statement::ExportNamedDeclaration(node) => {
                    if node.export_kind.is_type() {
                        continue;
                    }
                    let mut steps = Vec::new();
                    for spec in &node.specifiers {
                        if !spec.export_kind.is_type() && spec.exported.name().as_str() == export_name {
                            steps.push(Step::Found(file.to_path_buf()));
                        }
                    }
                    named.push(steps);
                }
                Statement::ExportFromDeclaration(node) => {
                    if node.export_kind.is_type() {
                        continue;
                    }
                    let mut steps = Vec::new();
                    for spec in &node.specifiers {
                        if spec.export_kind.is_type() || spec.exported.name().as_str() != export_name {
                            continue;
                        }
                        if let Some(target) = resolve_local_module(&jstr(&node.source.value), file) {
                            steps.push(Step::Follow(target, spec.local.name().to_string()));
                        }
                    }
                    named.push(steps);
                }
                Statement::ExportDefaultDeclaration(node) => {
                    if runtime_default(&node.declaration) {
                        default_found = true;
                    }
                }
                Statement::ExportAllDeclaration(node) => {
                    if node.export_kind.is_type() || node.exported.is_some() {
                        continue;
                    }
                    alls.push(jstr(&node.source.value));
                }
                _ => {}
            }
        }
        (named, default_found, alls)
    })?;
    for steps in named {
        for step in steps {
            match step {
                Step::Found(p) => return Some(p),
                Step::Follow(target, imported) => {
                    if let Some(d) = export_source(&target, &imported, seen) {
                        return Some(d);
                    }
                }
            }
        }
    }
    if export_name == "default" && default_found {
        return Some(file.to_path_buf());
    }
    for spec in alls {
        if let Some(target) = resolve_local_module(&spec, file) {
            // `found = moduleExportSource(...)`: a later `export *` replaces
            // an earlier miss but never an earlier hit.
            if let Some(f) = export_source(&target, export_name, seen) {
                return Some(f);
            }
        }
    }
    None
}

// ── staticExportObject ─────────────────────────────────────────────────

fn unwrap_ts<'a, 'b>(mut e: &'b Expression<'a>) -> &'b Expression<'a> {
    loop {
        e = match e {
            Expression::TSSatisfiesExpression(x) => &x.expression,
            Expression::TSAsExpression(x) => &x.expression,
            Expression::TSNonNullExpression(x) => &x.expression,
            Expression::ParenthesizedExpression(x) => &x.expression,
            _ => return e,
        }
    }
}

fn js_num(n: f64) -> Value {
    crate::json::num(n)
}

struct Literal<'p, 'a> {
    bindings: Vec<(String, &'p Expression<'a>)>,
}

impl<'p, 'a> Literal<'p, 'a> {
    fn binding(&self, name: &str) -> Option<&'p Expression<'a>> {
        // Map#set keeps the last initializer for a repeated name.
        self.bindings.iter().rev().find(|(n, _)| n == name).map(|(_, e)| *e)
    }

    fn value(&self, node: &Expression<'a>, following: &HashSet<String>) -> Option<Value> {
        let v = unwrap_ts(node);
        match v {
            Expression::StringLiteral(s) => Some(Value::String(jstr(&s.value))),
            Expression::NumericLiteral(n) => Some(js_num(n.value)),
            Expression::BooleanLiteral(b) => Some(Value::Bool(b.value)),
            Expression::NullLiteral(_) => Some(Value::Null),
            Expression::TemplateLiteral(t) => {
                if t.expressions.is_empty() {
                    t.quasis.first().and_then(|q| q.value.cooked.as_ref()).map(|c| Value::String(jstr(c)))
                } else {
                    None
                }
            }
            Expression::Identifier(id) => {
                let name = id.name.to_string();
                if following.contains(&name) {
                    return None;
                }
                let init = self.binding(&name)?;
                let mut next = following.clone();
                next.insert(name);
                self.value(init, &next)
            }
            Expression::ArrayExpression(arr) => {
                let mut out = Vec::new();
                for el in &arr.elements {
                    let item = match el {
                        ArrayExpressionElement::SpreadElement(_) | ArrayExpressionElement::Elision(_) => None,
                        other => other.as_expression().and_then(|e| self.value(e, following)),
                    };
                    if let Some(i) = item {
                        out.push(i);
                    }
                }
                Some(Value::Array(out))
            }
            Expression::ObjectExpression(obj) => {
                let mut object = Map::new();
                let mut computed = false;
                for prop in &obj.properties {
                    match prop {
                        ObjectPropertyKind::SpreadProperty(_) => {
                            object = Map::new();
                            computed = true;
                        }
                        ObjectPropertyKind::ObjectProperty(p) => {
                            let key: Option<String> = if p.computed {
                                None
                            } else {
                                match &p.key {
                                    PropertyKey::StaticIdentifier(i) => Some(i.name.to_string()),
                                    PropertyKey::StringLiteral(s) => Some(jstr(&s.value)),
                                    // `property.key.value` of a numeric key is a
                                    // number, not a string: skipped.
                                    _ => None,
                                }
                            };
                            // Babel's ObjectMethod is not an ObjectProperty.
                            let item = match &key {
                                Some(_) if !p.method && p.kind == PropertyKind::Init => self.value(&p.value, following),
                                _ => None,
                            };
                            if item.is_none() {
                                computed = true;
                            }
                            let Some(key) = key else { continue };
                            match item {
                                None => {
                                    object.shift_remove(&key);
                                }
                                Some(i) => {
                                    object.insert(key, i);
                                }
                            }
                        }
                    }
                }
                let mut object = crate::json::js_key_order(object);
                if computed {
                    object.insert(HAS_COMPUTED.to_string(), Value::Bool(true));
                }
                Some(Value::Object(object))
            }
            _ => None,
        }
    }
}

/// `staticExportObject(file, exportNames)`: the first of `export_names` the
/// module exports, as plain data, when it is an object literal.
pub fn static_export_object(file: &Path, export_names: &[&str]) -> Option<Map<String, Value>> {
    let text = super::nodepath::read_text(&file.to_string_lossy())?;
    with_program(&text, |program| {
        let body = &program.body;
        let mut lit = Literal { bindings: Vec::new() };
        for stmt in body {
            let decl = match stmt {
                Statement::ExportDeclaration(n) => match &n.declaration {
                    Declaration::VariableDeclaration(v) => Some(&**v),
                    _ => None,
                },
                Statement::VariableDeclaration(v) => Some(&**v),
                _ => None,
            };
            let Some(decl) = decl else { continue };
            for d in &decl.declarations {
                if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&d.id, &d.init) {
                    lit.bindings.push((id.name.to_string(), init));
                }
            }
        }
        enum Exported<'p, 'a> {
            Expr(&'p Expression<'a>),
            Ident(String),
            NotLiteral,
        }
        let exported = |name: &str| -> Option<Exported> {
            for stmt in body {
                if name == "default" {
                    if let Statement::ExportDefaultDeclaration(d) = stmt {
                        return Some(match d.declaration.as_expression() {
                            Some(e) => Exported::Expr(e),
                            None => Exported::NotLiteral,
                        });
                    }
                }
                if let Statement::ExportDeclaration(n) = stmt {
                    let Declaration::VariableDeclaration(v) = &n.declaration else { continue };
                    for d in &v.declarations {
                        if let BindingPattern::BindingIdentifier(id) = &d.id {
                            if id.name.as_str() == name {
                                return Some(match &d.init {
                                    Some(e) => Exported::Expr(e),
                                    None => Exported::NotLiteral,
                                });
                            }
                        }
                    }
                    continue;
                }
                let Statement::ExportNamedDeclaration(n) = stmt else { continue };
                if n.export_kind.is_type() {
                    continue;
                }
                for s in &n.specifiers {
                    if s.exported.name().as_str() == name {
                        return Some(Exported::Ident(s.local.name().to_string()));
                    }
                }
            }
            None
        };
        for name in export_names {
            let Some(node) = exported(name) else { continue };
            let value = match node {
                Exported::Expr(e) => lit.value(e, &HashSet::new()),
                Exported::Ident(id) => lit.binding(&id).and_then(|init| {
                    let mut f = HashSet::new();
                    f.insert(id.clone());
                    lit.value(init, &f)
                }),
                Exported::NotLiteral => None,
            };
            return match value {
                Some(Value::Object(m)) => Some(m),
                _ => None,
            };
        }
        None
    })
    .flatten()
}

fn find_prop<'b, 'a>(o: &'b ObjectExpression<'a>, key: &str) -> Option<&'b Expression<'a>> {
    for p in &o.properties {
        let ObjectPropertyKind::ObjectProperty(p) = p else { continue };
        if p.computed || p.method || p.kind != PropertyKind::Init {
            continue;
        }
        let name = match &p.key {
            PropertyKey::StaticIdentifier(i) => Some(i.name.as_str()),
            PropertyKey::StringLiteral(s) => s.value.as_str(),
            _ => None,
        };
        if name == Some(key) {
            return Some(&p.value);
        }
    }
    None
}

/// `docMemberNames(source)` from component discovery: the static
/// `{name: '<Name>'}` entries of the doc object's `components`, parsed as a
/// plain module (no JSX, no TypeScript), as Babel's defaults parse it.
pub fn doc_member_names(source: &str) -> Vec<String> {
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, source, SourceType::mjs()).parse();
    if ret.diagnostics.has_errors() {
        return Vec::new();
    }
    let program = ret.program;
    let mut constants: Vec<(String, &Expression)> = Vec::new();
    let mut default_export: Option<&ExportDefaultDeclarationKind> = None;
    let mut docs_export: Option<&Expression> = None;
    for stmt in &program.body {
        let (decl, exported) = match stmt {
            Statement::ExportDeclaration(n) => match &n.declaration {
                Declaration::VariableDeclaration(v) => (Some(&**v), true),
                _ => (None, true),
            },
            Statement::VariableDeclaration(v) => (Some(&**v), false),
            _ => (None, false),
        };
        if let Some(v) = decl {
            for d in &v.declarations {
                if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&d.id, &d.init) {
                    constants.push((id.name.to_string(), init));
                    if exported && id.name.as_str() == "docs" {
                        docs_export = Some(init);
                    }
                }
            }
        }
        if let Statement::ExportDefaultDeclaration(d) = stmt {
            default_export = Some(&d.declaration);
        }
    }
    let mut doc: Option<&Expression> = match default_export {
        Some(k) => match k.as_expression() {
            Some(e) => Some(e),
            None => return Vec::new(),
        },
        None => docs_export,
    };
    if let Some(Expression::Identifier(id)) = doc {
        doc = constants.iter().rev().find(|(n, _)| n == id.name.as_str()).map(|(_, e)| *e);
    }
    let Some(Expression::ObjectExpression(obj)) = doc else { return Vec::new() };
    let Some(Expression::ArrayExpression(members)) = find_prop(obj, "components") else { return Vec::new() };
    let mut out = Vec::new();
    for el in &members.elements {
        let Some(Expression::ObjectExpression(o)) = el.as_expression() else { continue };
        if let Some(Expression::StringLiteral(s)) = find_prop(o, "name") {
            out.push(jstr(&s.value));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn members() {
        let src = "const x = {components: [{name: 'HStack'}, {name: `T`}, {name: 'VStack', props: []}]};\nexport default x;";
        assert_eq!(doc_member_names(src), vec!["HStack", "VStack"]);
        assert!(writes_word("export function Foo()", "Foo"));
        assert!(!writes_word("FooBar", "Foo"));
        assert!(has_export_all("export * from './a'"));
    }
}
