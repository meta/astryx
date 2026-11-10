//! `blockComponentsCheck` and `componentDocNamesCheck`
//! (`validate-contributions.mjs`), with the module-export reads they use
//! (`moduleExportNames`, `moduleExportVerdict` from `module-exports.mjs`),
//! parsed with oxc where the JS uses `@babel/parser`.
//! The verdict is discovery's; `moduleExportNames` is ported here in full
//! (no shared reader exports it).

use crate::discovery::component_discovery as cd;
use crate::discovery::nodepath as np;
use crate::discovery::validate_contributions as vc;
use crate::json::{Map, Value};
use oxc::allocator::Allocator;
use oxc::ast::ast::*;
use oxc::parser::{ParseOptions, Parser};
use oxc::span::SourceType;
use oxc_ast_visit::{walk, Visit};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

fn read_text(file: &str) -> Option<String> {
    if !std::fs::metadata(file).map(|m| m.is_file()).unwrap_or(false) {
        return None;
    }
    std::fs::read(file).ok().map(|b| String::from_utf8_lossy(&b).into_owned())
}

/// Parse as module-exports' `parseModule` does (jsx + typescript, throwing on
/// any error): `None` when it would throw.
fn with_module<T>(text: &str, f: impl FnOnce(&Program) -> T) -> Option<T> {
    let alloc = Allocator::default();
    let opts = ParseOptions { allow_return_outside_function: true, ..Default::default() };
    let ret = Parser::new(&alloc, text, SourceType::mjs().with_typescript(true).with_jsx(true)).with_options(opts).parse();
    if ret.fatal_error || !ret.diagnostics.is_empty() {
        return None;
    }
    Some(f(&ret.program))
}

fn export_name(n: &ModuleExportName) -> String {
    match n {
        ModuleExportName::IdentifierName(i) => i.name.to_string(),
        ModuleExportName::IdentifierReference(i) => i.name.to_string(),
        ModuleExportName::StringLiteral(s) => s.value.display().to_string(),
    }
}

fn commonjs(text: &str) -> bool {
    crate::doctor_re!(r"\bmodule\.exports\b|\bexports\.[$\w]", "u").find(text).is_some()
}

/// `runtimeDefault(declaration)` for a named export's declaration, and its
/// `id.name`.
fn declaration_runtime(d: &Declaration) -> (bool, Option<String>) {
    match d {
        Declaration::FunctionDeclaration(f) => (!f.declare && f.body.is_some(), f.id.as_ref().map(|i| i.name.to_string())),
        Declaration::ClassDeclaration(c) => (!c.declare, c.id.as_ref().map(|i| i.name.to_string())),
        Declaration::TSTypeAliasDeclaration(t) => (false, Some(t.id.name.to_string())),
        Declaration::TSInterfaceDeclaration(t) => (false, Some(t.id.name.to_string())),
        Declaration::TSEnumDeclaration(e) => (!e.declare, Some(e.id.name.to_string())),
        Declaration::TSNamespaceDeclaration(n) => (!n.declare, Some(n.id.name.to_string())),
        Declaration::TSGlobalDeclaration(g) => (!g.declare, Some("global".into())),
        Declaration::TSExternalModuleDeclaration(m) => (!m.declare, None),
        Declaration::TSImportEqualsDeclaration(t) => (true, Some(t.id.name.to_string())),
        Declaration::VariableDeclaration(v) => (!v.declare, None),
    }
}

/// `runtimeDefault` for a default export.
fn default_runtime(d: &ExportDefaultDeclarationKind) -> bool {
    match d {
        ExportDefaultDeclarationKind::FunctionDeclaration(f) => !f.declare && f.body.is_some(),
        ExportDefaultDeclarationKind::ClassDeclaration(c) => !c.declare,
        ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => false,
        _ => true,
    }
}

/// `moduleExportNames(file)`: sorted, or None when it cannot see them all.
pub fn module_export_names(file: &str) -> Option<Vec<String>> {
    let text = read_text(file)?;
    with_module(&text, |program| {
        if commonjs(&text) {
            return None;
        }
        for s in &program.body {
            match s {
                Statement::TSExportAssignment(_) => return None,
                Statement::ExportAllDeclaration(e) if e.exported.is_none() => return None,
                _ => {}
            }
        }
        let mut names: Vec<String> = Vec::new();
        let mut add = |n: String| {
            if !names.contains(&n) {
                names.push(n);
            }
        };
        for s in &program.body {
            match s {
                Statement::ExportDeclaration(e) => match &e.declaration {
                    Declaration::TSImportEqualsDeclaration(t) => {
                        if t.import_kind.is_type() {
                            continue;
                        }
                        add(t.id.name.to_string());
                    }
                    Declaration::VariableDeclaration(v) => {
                        for item in &v.declarations {
                            match &item.id {
                                BindingPattern::BindingIdentifier(i) => add(i.name.to_string()),
                                _ => return None,
                            }
                        }
                    }
                    d => {
                        let (runtime, id) = declaration_runtime(d);
                        if !runtime {
                            continue;
                        }
                        match id {
                            Some(n) => add(n),
                            None => return None,
                        }
                    }
                },
                Statement::ExportNamedDeclaration(e) if !e.export_kind.is_type() => {
                    for sp in &e.specifiers {
                        if !sp.export_kind.is_type() {
                            add(export_name(&sp.exported));
                        }
                    }
                }
                Statement::ExportFromDeclaration(e) if !e.export_kind.is_type() => {
                    for sp in &e.specifiers {
                        if !sp.export_kind.is_type() {
                            add(export_name(&sp.exported));
                        }
                    }
                }
                Statement::ExportAllDeclaration(e) if !e.export_kind.is_type() => {
                    if let Some(n) = &e.exported {
                        add(export_name(n));
                    }
                }
                _ => {}
            }
        }
        if program.body.iter().any(|s| matches!(s, Statement::ExportDefaultDeclaration(d) if default_runtime(&d.declaration))) {
            add("default".into());
        }
        names.sort();
        Some(names)
    })
    .flatten()
}

pub enum Verdict {
    Exports,
    Lacks,
    Unknown(String),
}

/// `moduleExportVerdict(file, exportName)`.
pub fn module_export_verdict(file: &str, export_name_: &str) -> Verdict {
    use crate::discovery::module_origins as mo;
    match mo::module_export_verdict(file, export_name_) {
        mo::Verdict::Exports(_) => Verdict::Exports,
        mo::Verdict::Lacks => Verdict::Lacks,
        mo::Verdict::Unknown(r) => Verdict::Unknown(r),
    }
}

fn verdict(file: &str, name: &str, seen: &mut HashSet<String>) -> Verdict {
    let identity = format!("{file}\0{name}");
    if !seen.insert(identity) {
        return Verdict::Lacks;
    }
    let shown = np::basename(file);
    if !std::fs::metadata(file).map(|m| m.is_file()).unwrap_or(false) {
        return Verdict::Unknown(format!("{shown} is not a file."));
    }
    let Some(text) = read_text(file) else { return Verdict::Unknown(format!("{shown} could not be read or parsed.")) };
    // Collect what the walk needs; follow re-exports after the parse.
    enum Step {
        Exports,
        Unknown(String),
        Follow(String, String, String),
    }
    let steps = with_module(&text, |program| {
        let mut steps: Vec<Step> = Vec::new();
        if commonjs(&text) {
            steps.push(Step::Unknown(format!("{shown} uses CommonJS exports, whose names this check does not read.")));
        }
        if program.body.iter().any(|s| matches!(s, Statement::TSExportAssignment(_))) {
            steps.push(Step::Unknown(format!("{shown} uses `export =`, whose names this check does not read.")));
        }
        for s in &program.body {
            if let Statement::ExportDeclaration(e) = s {
                if let Declaration::TSImportEqualsDeclaration(t) = &e.declaration {
                    if t.id.name != name {
                        continue;
                    }
                    if t.import_kind.is_type() {
                        steps.push(Step::Unknown(format!(
                            "{shown} exports {name} with `export import type`, which has no runtime value this check can see."
                        )));
                    } else {
                        steps.push(Step::Exports);
                        return steps;
                    }
                }
            }
        }
        for s in &program.body {
            match s {
                Statement::ExportDeclaration(e) => match &e.declaration {
                    Declaration::TSImportEqualsDeclaration(_) => {}
                    Declaration::VariableDeclaration(v) => {
                        for item in &v.declarations {
                            match &item.id {
                                BindingPattern::BindingIdentifier(i) if i.name == name => {
                                    if v.declare {
                                        steps.push(Step::Unknown(format!(
                                            "{shown} declares {name} with `declare`, which has no runtime value this check can see."
                                        )));
                                    } else {
                                        steps.push(Step::Exports);
                                        return steps;
                                    }
                                }
                                BindingPattern::BindingIdentifier(_) => {}
                                _ => steps.push(Step::Unknown(format!(
                                    "{shown} exports a destructured binding, whose names this check does not read."
                                ))),
                            }
                        }
                    }
                    d => {
                        let (runtime, id) = declaration_runtime(d);
                        if id.as_deref() != Some(name) {
                            continue;
                        }
                        match d {
                            Declaration::TSInterfaceDeclaration(_) | Declaration::TSTypeAliasDeclaration(_) => {}
                            Declaration::TSNamespaceDeclaration(_) | Declaration::TSGlobalDeclaration(_) => steps.push(Step::Unknown(format!(
                                "{shown} exports {name} as a TypeScript namespace, which has a runtime value only when it holds one."
                            ))),
                            _ => {
                                let declared = match d {
                                    Declaration::FunctionDeclaration(f) => f.declare || f.body.is_none(),
                                    Declaration::ClassDeclaration(c) => c.declare,
                                    Declaration::TSEnumDeclaration(en) => en.declare || en.r#const,
                                    _ => false,
                                };
                                let ambient_fn = matches!(d, Declaration::FunctionDeclaration(f) if f.body.is_none() && !f.declare);
                                if declared && !ambient_fn {
                                    steps.push(Step::Unknown(format!(
                                        "{shown} declares {name} as an ambient or const declaration, which has no runtime value this check can see."
                                    )));
                                } else if runtime {
                                    steps.push(Step::Exports);
                                    return steps;
                                }
                            }
                        }
                    }
                },
                Statement::ExportNamedDeclaration(e) if !e.export_kind.is_type() => {
                    for sp in &e.specifiers {
                        if !sp.export_kind.is_type() && export_name(&sp.exported) == name {
                            steps.push(Step::Exports);
                            return steps;
                        }
                    }
                }
                Statement::ExportFromDeclaration(e) if !e.export_kind.is_type() => {
                    for sp in &e.specifiers {
                        if sp.export_kind.is_type() || export_name(&sp.exported) != name {
                            continue;
                        }
                        steps.push(Step::Follow(e.source.value.display().to_string(), export_name(&sp.local), name.to_string()));
                    }
                }
                Statement::ExportAllDeclaration(e) if !e.export_kind.is_type() => {
                    // Babel 7 reads `export * as ns from` as a named namespace specifier.
                    if let Some(n) = &e.exported {
                        if export_name(n) == name {
                            steps.push(Step::Exports);
                            return steps;
                        }
                    }
                }
                _ => {}
            }
        }
        if name == "default" && program.body.iter().any(|s| matches!(s, Statement::ExportDefaultDeclaration(d) if default_runtime(&d.declaration))) {
            steps.push(Step::Exports);
            return steps;
        }
        for s in &program.body {
            if let Statement::ExportAllDeclaration(e) = s {
                if e.export_kind.is_type() || e.exported.is_some() || name == "default" {
                    continue;
                }
                steps.push(Step::Follow(e.source.value.display().to_string(), name.to_string(), "everything".into()));
            }
        }
        steps
    });
    let Some(steps) = steps else { return Verdict::Unknown(format!("{shown} could not be read or parsed.")) };
    let mut unknown: Vec<String> = Vec::new();
    for step in steps {
        match step {
            Step::Exports => return Verdict::Exports,
            Step::Unknown(r) => unknown.push(r),
            Step::Follow(spec, imported, what) => {
                if !spec.starts_with('.') {
                    unknown.push(format!("{shown} re-exports {what} from \"{spec}\", another package this check does not read."));
                    continue;
                }
                let Some(target) = crate::discovery::module_exports::resolve_local_module(&spec, Path::new(file)) else {
                    unknown.push(format!("{shown} re-exports {what} from \"{spec}\", which resolves to no file this check can read."));
                    continue;
                };
                match verdict(&target.to_string_lossy(), &imported, seen) {
                    Verdict::Exports => return Verdict::Exports,
                    Verdict::Unknown(r) => unknown.push(r),
                    Verdict::Lacks => {}
                }
            }
        }
    }
    match unknown.into_iter().next() {
        Some(r) => Verdict::Unknown(r),
        None => Verdict::Lacks,
    }
}

/// `defaultBinding(file)`.
fn default_binding(file: &str) -> Option<String> {
    let text = std::fs::read_to_string(file).ok()?;
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, &text, SourceType::mjs().with_typescript(true).with_jsx(true)).parse();
    if ret.fatal_error {
        return None;
    }
    for s in &ret.program.body {
        let Statement::ExportDefaultDeclaration(d) = s else { continue };
        return match &d.declaration {
            ExportDefaultDeclarationKind::FunctionDeclaration(f) => f.id.as_ref().map(|i| i.name.to_string()),
            ExportDefaultDeclarationKind::ClassDeclaration(c) => c.id.as_ref().map(|i| i.name.to_string()),
            ExportDefaultDeclarationKind::TSInterfaceDeclaration(i) => Some(i.id.name.to_string()),
            ExportDefaultDeclarationKind::Identifier(i) => Some(i.name.to_string()),
            _ => continue,
        };
    }
    None
}

fn checked_report(unchecked: Vec<(String, String, String)>, base: &str) -> Value {
    let mut m = Map::new();
    m.insert("status".into(), Value::String("checked".into()));
    m.insert("findings".into(), Value::Array(vec![]));
    m.insert(
        "unchecked".into(),
        Value::Array(
            unchecked
                .into_iter()
                .map(|(doc, name, reason)| {
                    let mut x = Map::new();
                    x.insert("file".into(), Value::String(np::relative(base, &doc)));
                    x.insert("name".into(), Value::String(name));
                    x.insert("reason".into(), Value::String(reason));
                    Value::Object(x)
                })
                .collect(),
        ),
    );
    Value::Object(m)
}

fn note(code: &str, message: String) -> Value {
    let mut m = Map::new();
    m.insert("code".into(), Value::String(code.into()));
    m.insert("message".into(), Value::String(message));
    Value::Object(m)
}

const COMPONENT_DOC_SUFFIXES: &[&str] = &[".doc.ts", ".doc.mjs", ".doc.js"];

fn doc_stem_of(file: &str) -> &str {
    COMPONENT_DOC_SUFFIXES.iter().find(|s| file.ends_with(*s)).map(|s| &file[..file.len() - s.len()]).unwrap_or(file)
}

/// `componentDocFiles(root).caseMismatch`: doc paths whose source differs in case.
fn case_mismatch(root: &str) -> HashSet<String> {
    let mut out = HashSet::new();
    fn walk(dir: &str, out: &mut HashSet<String>) {
        let Some(entries) = crate::commands::doctor::support::read_dir_sorted(dir) else { return };
        let names: Vec<String> = entries.iter().map(|e| e.name.clone()).collect();
        for e in &entries {
            let full = np::join2(dir, &e.name);
            if e.is_dir {
                if e.name != "node_modules" && e.name != "__tests__" {
                    walk(&full, out);
                }
                continue;
            }
            let stem = doc_stem_of(&e.name);
            if stem == e.name {
                continue;
            }
            let source = format!("{stem}.tsx");
            if names.contains(&source) {
                continue;
            }
            let other = names.iter().find(|n| **n != source && n.to_lowercase() == source.to_lowercase());
            if let Some(o) = other {
                let ostem = &o[..o.len().saturating_sub(4)];
                if !COMPONENT_DOC_SUFFIXES.iter().any(|s| names.contains(&format!("{ostem}{s}"))) {
                    out.insert(full);
                }
            }
        }
    }
    walk(root, &mut out);
    out
}

/// `componentDocNamesCheck(integration)`: (report, notes).
pub fn component_doc_names_check(integration: &Map<String, Value>) -> (Value, Vec<Value>) {
    let mut findings: Vec<String> = Vec::new();
    let mut unchecked: Vec<(String, String, String)> = Vec::new();
    let root = integration.get("components").and_then(|v| v.as_str()).map(String::from);
    if let Some(root) = root.as_ref().filter(|r| vc::root_problem(r).is_none()) {
        let li = vc::loaded_integration(integration);
        let base = integration.get("__packageDir").and_then(|v| v.as_str()).unwrap_or(root).to_string();
        let skip = case_mismatch(root);
        for record in cd::discover_valid_integration_components(&li, true).components {
            if cd::is_integration_member(&record.name, Some(&record.doc_path)) {
                continue;
            }
            let doc_s = record.doc_path.to_string_lossy().into_owned();
            if skip.contains(&doc_s) {
                continue;
            }
            let Some(source) = record.source_path.clone() else { continue };
            let Ok(doc) = cd::load_component_doc_strict(&record.doc_path) else { continue };
            let Some(name) = doc.get("name").and_then(|v| v.as_str()).map(String::from) else { continue };
            if name == record.name {
                continue;
            }
            let printed = cd::imported_module(&li, &record.doc_path, doc.as_object());
            if matches!(printed, Some(None)) {
                unchecked.push((doc_s, name, "Its import names another package, or resolves to no file this check can read.".into()));
                continue;
            }
            let module: PathBuf = printed.clone().flatten().unwrap_or(source);
            let module_s = module.to_string_lossy().into_owned();
            let shown = np::relative(&base, &module_s);
            match module_export_verdict(&module_s, &name) {
                Verdict::Exports => continue,
                Verdict::Unknown(reason) => {
                    unchecked.push((doc_s, name, reason));
                    continue;
                }
                Verdict::Lacks => {}
            }
            let exported = module_export_names(&module_s);
            let default_only = matches!(&exported, Some(v) if v.len() == 1 && v[0] == "default");
            if default_only && printed.is_none() {
                unchecked.push((doc_s, name, format!("{shown} exports a default, which the package entry may publish under any name.")));
                continue;
            }
            let file = np::basename(&doc_s);
            let fix = if default_only {
                if default_binding(&module_s).as_deref() == Some(name.as_str()) {
                    format!("Fix: add `export {{{name}}};` to {shown}, so it exports {name} by name as well, or set the doc's import to the module that publishes it as {name}.")
                } else {
                    format!("Fix: bind the default to {name} in {shown} and export it by name too (`const {name} = …; export default {name}; export {{{name}}};`), or set the doc's import to the module that publishes it as {name}.")
                }
            } else if crate::discovery::module_exports::module_exports_name(&module, &record.name) {
                format!("Fix: set name: '{}' in {file}.", record.name)
            } else {
                let comps: Vec<String> = exported
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|e| crate::doctor_re!(r"^[A-Z][A-Za-z0-9]*$", "u").find(e).is_some())
                    .collect();
                if comps.len() == 1 {
                    format!("Fix: set name: '{}' in {file}, the component {shown} exports.", comps[0])
                } else {
                    format!(
                        "Fix: set name in {file} to the component {shown} exports{}.",
                        if comps.len() > 1 { format!(" ({})", comps.join(", ")) } else { String::new() }
                    )
                }
            };
            findings.push(format!(
                "Component doc \"{}\" sets name: '{name}', but {shown}, the module its import names, does not export {name}, so Astryx lists the component as \"{}\" (its file name), and `astryx component {}` prints `import {{{name}}}`. {fix}",
                np::relative(root, &doc_s),
                record.name,
                record.name
            ));
        }
    }
    let base = integration.get("__packageDir").and_then(|v| v.as_str()).map(String::from).or(root).unwrap_or_default();
    (checked_report(unchecked, &base), findings.into_iter().map(|m| note("doc_name_mismatch", m)).collect())
}

/* ── block components ── */

const LOCAL_MODULE_EXTENSIONS: &[&str] = &[".tsx", ".ts", ".jsx", ".js", ".mjs"];
const RENDERLESS: &[&str] = &["react", "react-dom", "@stylexjs/stylex"];

fn renderless(source: &str) -> bool {
    RENDERLESS.iter().any(|k| source == *k || source.starts_with(&format!("{k}/")))
}

fn known_source(source: &str) -> bool {
    source.starts_with('.') || renderless(source) || source == "@astryxdesign/core" || source.starts_with("@astryxdesign/core/")
}

/// `ownPackageModule(integration, specifier)`.
fn own_package_module(integration: &Map<String, Value>, spec: &str) -> Option<PathBuf> {
    let name = integration.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty())?;
    let dir = integration.get("__packageDir").and_then(|v| v.as_str())?;
    if spec != name && !spec.starts_with(&format!("{name}/")) {
        return None;
    }
    let dir_p = Path::new(dir);
    let exports = cd::read_package_exports(Some(dir_p));
    if spec == name && exports.is_null() {
        let pkg = np::read_json(&np::join2(dir, "package.json"))?;
        let entry = match pkg.get("main").and_then(|m| m.as_str()) {
            Some(m) if !m.is_empty() => {
                let norm = posix_normalize(m);
                format!("./{}", norm.strip_prefix("./").unwrap_or(&norm))
            }
            _ => "./index".into(),
        };
        return crate::discovery::package_exports::inspect_package_export("", None, dir_p, &entry).target;
    }
    let sub = if spec == name { ".".to_string() } else { format!("./{}", &spec[name.len() + 1..]) };
    let ex = if exports.is_null() { None } else { Some(&exports) };
    crate::discovery::package_exports::inspect_package_export(name, ex, dir_p, &sub).target
}

fn is_file(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

fn ext_ok(p: &str) -> bool {
    LOCAL_MODULE_EXTENSIONS.iter().any(|e| np::extname(p) == *e)
}

/// `importedNames(file, integration)`: (names, unread reasons).
fn imported_names(file: &str, integration: &Map<String, Value>) -> (HashSet<String>, Vec<String>) {
    let mut names: HashSet<String> = HashSet::new();
    let mut unread: Vec<String> = Vec::new();
    let top = np::dirname(file);
    let shown_top = np::basename(file);
    let mut seen: HashSet<String> = HashSet::new();
    let package_name = integration.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from);
    let mut queue: Vec<String> = vec![file.to_string()];
    // Depth first, in the order the imports appear.
    fn visit(
        current: &str,
        top: &str,
        shown_top: &str,
        integration: &Map<String, Value>,
        package_name: &Option<String>,
        seen: &mut HashSet<String>,
        names: &mut HashSet<String>,
        unread: &mut Vec<String>,
    ) {
        if !seen.insert(current.to_string()) {
            return;
        }
        let rel = np::relative(top, current);
        let shown = if rel.is_empty() { shown_top.to_string() } else { rel };
        let Ok(text) = std::fs::read(current).map(|b| String::from_utf8_lossy(&b).into_owned()) else {
            unread.push(format!("{shown} could not be read, so the components it renders are not known."));
            return;
        };
        let alloc = Allocator::default();
        let ret = Parser::new(&alloc, &text, SourceType::mjs().with_typescript(true).with_jsx(true)).parse();
        if ret.fatal_error {
            unread.push(format!("{shown} could not be read, so the components it renders are not known."));
            return;
        }
        if !ret.diagnostics.is_empty() {
            unread.push(format!("{shown} does not parse cleanly, so the components it renders are not known."));
        }
        let mut bindings: Vec<(String, String)> = Vec::new();
        for s in &ret.program.body {
            let (source, kind_type) = match s {
                Statement::ImportDeclaration(d) => (d.source.value.display().to_string(), d.import_kind.is_type()),
                Statement::ExportFromDeclaration(d) => (d.source.value.display().to_string(), d.export_kind.is_type()),
                Statement::ExportAllDeclaration(d) => (d.source.value.display().to_string(), d.export_kind.is_type()),
                _ => continue,
            };
            if kind_type {
                continue;
            }
            let own = package_name.as_ref().map(|p| source == *p || source.starts_with(&format!("{p}/"))).unwrap_or(false);
            if !own && !known_source(&source) {
                unread.push(format!("{shown} imports from \"{source}\", another package whose components may render ones this check does not see."));
            }
            match s {
                Statement::ImportDeclaration(d) => {
                    for sp in d.specifiers.iter().flatten() {
                        match sp {
                            ImportDeclarationSpecifier::ImportNamespaceSpecifier(n) => {
                                if renderless(&source) {
                                    continue;
                                }
                                unread.push(format!(
                                    "{shown} imports \"{source}\" as a namespace ({}), whose component names this check does not read.",
                                    n.local.name
                                ));
                            }
                            ImportDeclarationSpecifier::ImportDefaultSpecifier(dflt) => {
                                if !renderless(&source) {
                                    unread.push(format!(
                                        "{shown} imports the default of \"{source}\" as {}, which may be any component.",
                                        dflt.local.name
                                    ));
                                }
                                names.insert(dflt.local.name.to_string());
                                bindings.push((dflt.local.name.to_string(), source.clone()));
                            }
                            ImportDeclarationSpecifier::ImportSpecifier(x) => {
                                if x.import_kind.is_type() {
                                    continue;
                                }
                                names.insert(x.local.name.to_string());
                                bindings.push((x.local.name.to_string(), source.clone()));
                                let imported = export_name(&x.imported);
                                if imported == "default" {
                                    unread.push(format!(
                                        "{shown} imports the default of \"{source}\" as {}, which may be any component.",
                                        x.local.name
                                    ));
                                } else {
                                    names.insert(imported);
                                }
                            }
                        }
                    }
                }
                Statement::ExportFromDeclaration(d) => {
                    for sp in &d.specifiers {
                        if sp.export_kind.is_type() {
                            continue;
                        }
                        let local = export_name(&sp.local);
                        let exported = export_name(&sp.exported);
                        if local == "default" {
                            unread.push(format!("{shown} re-exports the default of \"{source}\" as {exported}, which may be any component."));
                        } else {
                            names.insert(local);
                        }
                        names.insert(exported);
                    }
                }
                Statement::ExportAllDeclaration(d) => {
                    if let Some(n) = &d.exported {
                        // Babel 7: `export * as UI from` is a named namespace specifier.
                        unread.push(format!(
                            "{shown} re-exports \"{source}\" as a whole ({}), whose component names this check does not read.",
                            export_name(n)
                        ));
                    } else if !source.starts_with('.') && !own {
                        unread.push(format!("{shown} re-exports everything from \"{source}\", whose component names this check does not read."));
                        continue;
                    }
                }
                _ => {}
            }
            if !source.starts_with('.') && !own {
                continue;
            }
            if own {
                let resolved = own_package_module(integration, &source).map(|p| p.to_string_lossy().into_owned());
                match resolved {
                    Some(r) if is_file(&r) && ext_ok(&r) => visit(&r, top, shown_top, integration, package_name, seen, names, unread),
                    _ => unread.push(format!("{shown} imports \"{source}\", this package's own name, which resolves to no source this check can read.")),
                }
                continue;
            }
            let base = np::resolve(&[&np::dirname(current), &source]);
            let target = std::iter::once(base.clone())
                .chain(LOCAL_MODULE_EXTENSIONS.iter().map(|e| format!("{base}{e}")))
                .chain(LOCAL_MODULE_EXTENSIONS.iter().map(|e| np::join2(&base, &format!("index{e}"))))
                .find(|c| is_file(c));
            match target {
                None => unread.push(format!("{shown} imports \"{source}\", which resolves to no file this check can read.")),
                Some(t) if ext_ok(&t) => visit(&t, top, shown_top, integration, package_name, seen, names, unread),
                _ => {}
            }
        }
        // What the module renders that this check does not model.
        struct Declared<'s> {
            set: &'s mut HashSet<String>,
        }
        impl<'a> Visit<'a> for Declared<'_> {
            fn visit_function(&mut self, it: &Function<'a>, flags: oxc::semantic::ScopeFlags) {
                if it.is_declaration() {
                    if let Some(id) = &it.id {
                        self.set.insert(id.name.to_string());
                    }
                }
                walk::walk_function(self, it, flags);
            }
            fn visit_class(&mut self, it: &Class<'a>) {
                if it.is_declaration() {
                    if let Some(id) = &it.id {
                        self.set.insert(id.name.to_string());
                    }
                }
                walk::walk_class(self, it);
            }
            fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
                if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&it.id, &it.init) {
                    if matches!(init, Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) | Expression::ClassExpression(_)) {
                        self.set.insert(id.name.to_string());
                    }
                }
                walk::walk_variable_declarator(self, it);
            }
        }
        let mut declared: HashSet<String> = HashSet::new();
        Declared { set: &mut declared }.visit_program(&ret.program);
        struct Reads<'s> {
            shown: &'s str,
            names: &'s HashSet<String>,
            declared: &'s HashSet<String>,
            bindings: &'s [(String, String)],
            unread: &'s mut Vec<String>,
        }
        impl Reads<'_> {
            fn from(&self, n: &str) -> String {
                self.bindings.iter().find(|(k, _)| k == n).map(|(_, s)| format!(" (imported from \"{s}\")")).unwrap_or_default()
            }
            fn bound(&self, n: &str) -> bool {
                self.bindings.iter().any(|(k, _)| k == n)
            }
            fn member(&mut self, object: &Expression) {
                if let Expression::Identifier(o) = object {
                    if self.bound(&o.name) {
                        let m = format!("{} reads members of {}{}, whose names this check does not read.", self.shown, o.name, self.from(&o.name));
                        self.unread.push(m);
                    }
                }
            }
        }
        fn jsx_object_name(o: &JSXMemberExpressionObject) -> String {
            match o {
                JSXMemberExpressionObject::IdentifierReference(i) => i.name.to_string(),
                JSXMemberExpressionObject::MemberExpression(m) => jsx_object_name(&m.object),
                JSXMemberExpressionObject::ThisExpression(_) => "this".into(),
            }
        }
        impl<'a> Visit<'a> for Reads<'_> {
            fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
                let id = match &it.name {
                    JSXElementName::Identifier(i) => Some(i.name.to_string()),
                    JSXElementName::IdentifierReference(i) => Some(i.name.to_string()),
                    _ => None,
                };
                if let Some(n) = id {
                    if n.starts_with(|c: char| c.is_ascii_uppercase()) && !self.names.contains(&n) && !self.declared.contains(&n) {
                        let m = format!("{} renders {n}, a value this check does not trace to an import.", self.shown);
                        self.unread.push(m);
                    }
                }
                walk::walk_jsx_opening_element(self, it);
            }
            fn visit_jsx_member_expression(&mut self, it: &JSXMemberExpression<'a>) {
                let n = jsx_object_name(&it.object);
                let m = format!("{} renders members of {n}{}, whose names this check does not read.", self.shown, self.from(&n));
                self.unread.push(m);
                walk::walk_jsx_member_expression(self, it);
            }
            fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
                if let Some(Expression::Identifier(init)) = &it.init {
                    if self.bound(&init.name) {
                        let m = format!("{} reads {}{} into another name, which this check does not follow.", self.shown, init.name, self.from(&init.name));
                        self.unread.push(m);
                    }
                }
                walk::walk_variable_declarator(self, it);
            }
            fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
                self.member(&it.object);
                walk::walk_static_member_expression(self, it);
            }
            fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
                self.member(&it.object);
                walk::walk_computed_member_expression(self, it);
            }
            fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
                if let Expression::Identifier(c) = &it.callee {
                    if c.name == "require" {
                        let spec = match it.arguments.first() {
                            Some(Argument::StringLiteral(s)) => format!("\"{}\"", s.value.display()),
                            _ => "a module".into(),
                        };
                        let m = format!("{} loads {spec} with require(), whose component names this check does not read.", self.shown);
                        self.unread.push(m);
                    }
                }
                walk::walk_call_expression(self, it);
            }
            fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
                let spec = match &it.source {
                    Expression::StringLiteral(s) => format!("\"{}\"", s.value.display()),
                    _ => "a module".into(),
                };
                let m = format!("{} loads {spec} with a dynamic import(), whose component names this check does not read.", self.shown);
                self.unread.push(m);
                walk::walk_import_expression(self, it);
            }
        }
        let names_now = names.clone();
        let mut r = Reads { shown: &shown, names: &names_now, declared: &declared, bindings: &bindings, unread };
        r.visit_program(&ret.program);
    }
    let first = queue.pop().unwrap();
    visit(&first, &top, &shown_top, integration, &package_name, &mut seen, &mut names, &mut unread);
    (names, unread)
}

/// `blockComponentsCheck(integration)`: (report, notes).
pub fn block_components_check(integration: &Map<String, Value>) -> (Value, Vec<Value>) {
    let mut findings: Vec<String> = Vec::new();
    let mut unchecked: Vec<(String, String, String)> = Vec::new();
    let root = integration.get("templates").and_then(|v| v.as_str()).map(String::from);
    let base = integration.get("__packageDir").and_then(|v| v.as_str()).map(String::from).or(root.clone()).unwrap_or_default();
    if let Some(root) = root.as_ref().filter(|r| vc::root_problem(r).is_none()) {
        let (templates, _) = crate::commands::template::integration::for_one(integration);
        let li = vc::loaded_integration(integration);
        let own: HashSet<String> = cd::discover_integration_components(&li, true).into_iter().map(|r| r.name).collect();
        let core_dir = crate::discovery::paths::find_project_core_dir(integration.get("__packageDir").and_then(|v| v.as_str()).unwrap_or(root));
        let mut in_core: std::collections::HashMap<String, bool> = Default::default();
        for t in &templates {
            let mut fields: Vec<(&str, String)> = Vec::new();
            if let Some(e) = &t.example_for {
                fields.push(("exampleFor", e.clone()));
            }
            if let Some(Value::Array(a)) = &t.components_used {
                fields.extend(a.iter().filter_map(|x| x.as_str()).map(|n| ("componentsUsed", n.to_string())));
            }
            if fields.is_empty() {
                continue;
            }
            let (imported, unread) = imported_names(&t.file_path, integration);
            for (field, name) in fields {
                if own.contains(&name) || imported.contains(&name) {
                    continue;
                }
                let core_has = match &core_dir {
                    None => false,
                    Some(c) => *in_core.entry(name.clone()).or_insert_with(|| cd::find_component_readme(Path::new(c), &name).is_some()),
                };
                if core_has {
                    continue;
                }
                if let Some(first) = unread.first() {
                    unchecked.push((t.doc_path.clone(), name, first.clone()));
                    continue;
                }
                if core_dir.is_none() {
                    unchecked.push((t.doc_path.clone(), name, "Core is not installed, so its component names cannot be checked.".into()));
                    continue;
                }
                findings.push(format!(
                    "Template \"{}\" names \"{name}\" in {field}, but neither this package nor Core has a component by that name and the template does not import it, so `astryx template --list` and the block's search keywords give a component name no one can look up. Fix: use the component's exact name, or remove \"{name}\" from {field}.",
                    t.dir_name
                ));
            }
        }
    }
    (checked_report(unchecked, &base), findings.into_iter().map(|m| note("unknown_block_component", m)).collect())
}

/// `path.posix.normalize(p)`.
fn posix_normalize(p: &str) -> String {
    let abs = p.starts_with('/');
    let trailing = p.ends_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if parts.last().is_some_and(|l| *l != "..") {
                    parts.pop();
                } else if !abs {
                    parts.push("..");
                }
            }
            s => parts.push(s),
        }
    }
    let mut out = parts.join("/");
    if out.is_empty() && !abs {
        out = ".".into();
    }
    if trailing && !out.is_empty() {
        out.push('/');
    }
    if abs {
        format!("/{out}")
    } else {
        out
    }
}
