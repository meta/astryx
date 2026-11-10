//! A non-bundled theme's module graph, checked without running it: every
//! local import resolves to a file copied with the theme, and the entry
//! exports the descriptor's runtime name. Port of `validateThemeModuleGraph`,
//! `moduleExportsName` and the built-module messages in
//! foundation/discovery/theme-discovery.mjs.

use crate::commands::template::fsutil;
use oxc::allocator::Allocator;
use oxc::ast::ast::*;
use oxc::parser::Parser;
use oxc::span::SourceType;
use oxc_ast_visit::{walk, Visit};
use std::collections::HashSet;

/// `THEME_MODULE_EXTENSIONS`, in the JS order.
pub const THEME_MODULE_EXTENSIONS: &[&str] = &[".mjs", ".js", ".mts", ".ts", ".tsx", ".jsx"];

/// How a graph check fails: `Reference` and `Export` messages pass through as
/// they are; `Parse` is the parser's message, which the caller wraps.
pub enum GraphError {
    Reference(String),
    Export(String),
    Parse(String),
}

pub struct Graph<'s> {
    pub theme_dir: &'s str,
    pub allowed: &'s HashSet<String>,
}

fn lit(s: &StringLiteral) -> String {
    s.value.display().to_string()
}

/// `localThemeModuleCandidates(specifier, fromFile)`.
fn candidates(specifier: &str, from_file: &str) -> Vec<String> {
    if !specifier.starts_with('.') {
        return Vec::new();
    }
    let base = fsutil::resolve(&fsutil::dirname(from_file), specifier);
    let mut out = vec![base.clone()];
    out.extend(THEME_MODULE_EXTENSIONS.iter().map(|e| format!("{base}{e}")));
    out.extend(THEME_MODULE_EXTENSIONS.iter().map(|e| fsutil::join(&base, &format!("index{e}"))));
    out
}

impl Graph<'_> {
    /// `resolveLocalThemeModule(specifier, fromFile, themeDir, allowedFiles)`.
    fn resolve(&self, specifier: &str, from_file: &str) -> Option<String> {
        for c in candidates(specifier, from_file) {
            if !std::fs::metadata(&c).map(|m| m.is_file()).unwrap_or(false) {
                continue;
            }
            let Ok(confined) = crate::discovery::path_safety::assert_within(&c, self.theme_dir, true, "theme module") else { continue };
            if self.allowed.contains(&confined) {
                return Some(confined);
            }
        }
        None
    }

    /// `validateThemeModuleGraph(file, …, owner, entry, descriptorPath)`.
    pub fn validate(&self, file: &str, owner: &str, entry: &str, descriptor: &str, seen: &mut HashSet<String>) -> Result<(), GraphError> {
        if !seen.insert(file.to_string()) {
            return Ok(());
        }
        for specifier in module_specifiers(file)? {
            if !specifier.starts_with('.') {
                continue;
            }
            match self.resolve(&specifier, file) {
                None => {
                    let descriptor_abs = fsutil::normalize(descriptor);
                    if candidates(&specifier, file).iter().any(|c| fsutil::normalize(c) == descriptor_abs) {
                        return Err(GraphError::Reference(format!(
                            "Theme entry \"{entry}\" from {owner} must not import its descriptor \"{}\". Theme descriptors are authoring metadata, not runtime modules.",
                            fsutil::basename(descriptor)
                        )));
                    }
                    return Err(GraphError::Reference(format!(
                        "Theme entry \"{entry}\" from {owner} references local module \"{specifier}\" that must resolve to a file inside the theme directory."
                    )));
                }
                Some(target) => {
                    if THEME_MODULE_EXTENSIONS.contains(&extname(&target).as_str()) {
                        self.validate(&target, owner, entry, descriptor, seen)?;
                    }
                }
            }
        }
        Ok(())
    }

    /// `moduleExportsName(file, exportName, …)`: a runtime export, following
    /// local re-exports and imports confined to the theme's files.
    pub fn exports_name(&self, file: &str, export_name: &str, seen: &mut HashSet<String>) -> Result<bool, GraphError> {
        let identity = format!("{file}\0{export_name}");
        if seen.contains(&identity) || !self.allowed.contains(file) || !std::path::Path::new(file).exists() {
            return Ok(false);
        }
        seen.insert(identity);
        let ts = ends_with_any(file, &[".ts", ".tsx", ".mts"]);
        let text = std::fs::read_to_string(file).unwrap_or_default();
        let alloc = Allocator::default();
        let program = parse(&alloc, &text, ts)?;
        let body = &program.body;
        // Named exports, in source order (babel keeps `export * as ns` here).
        for st in body.iter() {
            match st {
                Statement::ExportDeclaration(d) => {
                    if declaration_exports_name(&d.declaration, export_name) {
                        return Ok(true);
                    }
                }
                Statement::ExportNamedDeclaration(d) => {
                    if d.export_kind.is_type() {
                        continue;
                    }
                    for spec in d.specifiers.iter() {
                        if spec.export_kind.is_type() || spec.exported.name().as_str() != export_name {
                            continue;
                        }
                        if self.has_runtime_binding(body, spec.local.name().as_str(), file, seen)? {
                            return Ok(true);
                        }
                    }
                }
                Statement::ExportFromDeclaration(d) => {
                    if d.export_kind.is_type() {
                        continue;
                    }
                    for spec in d.specifiers.iter() {
                        if spec.export_kind.is_type() || spec.exported.name().as_str() != export_name {
                            continue;
                        }
                        let target = self.resolve(&lit(&d.source), file);
                        if let Some(t) = target {
                            if self.exports_name(&t, spec.local.name().as_str(), seen)? {
                                return Ok(true);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        if export_name == "default"
            && body.iter().any(|st| matches!(st, Statement::ExportDefaultDeclaration(d) if runtime_default(&d.declaration)))
        {
            return Ok(true);
        }
        for st in body.iter() {
            if let Statement::ExportAllDeclaration(d) = st {
                if d.export_kind.is_type() || d.exported.is_some() {
                    continue;
                }
                if let Some(t) = self.resolve(&lit(&d.source), file) {
                    if self.exports_name(&t, export_name, seen)? {
                        return Ok(true);
                    }
                }
            }
        }
        Ok(false)
    }

    /// `hasRuntimeBinding(statements, localName, …)`.
    fn has_runtime_binding(&self, body: &[Statement], local: &str, file: &str, seen: &mut HashSet<String>) -> Result<bool, GraphError> {
        if body.iter().any(|st| st.as_declaration().is_some_and(|d| declaration_exports_name(d, local))) {
            return Ok(true);
        }
        for st in body {
            let Statement::ImportDeclaration(imp) = st else { continue };
            if imp.import_kind.is_type() {
                continue;
            }
            for spec in imp.specifiers.iter().flatten() {
                let (name, kind_type) = match spec {
                    ImportDeclarationSpecifier::ImportSpecifier(s) => (s.local.name.as_str(), s.import_kind.is_type()),
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => (s.local.name.as_str(), false),
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => (s.local.name.as_str(), false),
                };
                if name != local || kind_type {
                    continue;
                }
                let source = lit(&imp.source);
                if !source.starts_with('.') {
                    return Ok(true);
                }
                let Some(target) = self.resolve(&source, file) else { return Ok(false) };
                let imported = match spec {
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => return Ok(true),
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => "default".to_string(),
                    ImportDeclarationSpecifier::ImportSpecifier(s) => s.imported.name().to_string(),
                };
                return self.exports_name(&target, &imported, seen);
            }
        }
        Ok(false)
    }
}

fn ends_with_any(s: &str, exts: &[&str]) -> bool {
    exts.iter().any(|e| s.ends_with(e))
}

/// `path.extname`.
fn extname(p: &str) -> String {
    let base = fsutil::basename(p);
    match base.rfind('.') {
        Some(i) if i > 0 => base[i..].to_string(),
        _ => String::new(),
    }
}

/// jscodeshift's `tsx` parser for TypeScript, its `babel` parser (with JSX)
/// otherwise; a syntax error is babel's message with its `(line:column)`.
fn parse<'a>(alloc: &'a Allocator, text: &'a str, ts: bool) -> Result<Program<'a>, GraphError> {
    let st = if ts { SourceType::tsx() } else { SourceType::mjs().with_jsx(true) };
    let ret = Parser::new(alloc, text, st).parse();
    if ret.diagnostics.has_errors() || ret.fatal_error {
        let msg = match crate::js::syntax::babel_error(text, ts, true) {
            Some((m, line, col)) => format!("{m} ({line}:{col})"),
            None => ret.diagnostics.first().map(|d| d.message.to_string()).unwrap_or_else(|| "Unexpected token".into()),
        };
        return Err(GraphError::Parse(msg));
    }
    Ok(ret.program)
}

/// `moduleSpecifiers(file)`: imports, then named re-exports, then `export *`,
/// then dynamic imports, each in source order.
fn module_specifiers(file: &str) -> Result<Vec<String>, GraphError> {
    let ts = ends_with_any(file, &[".ts", ".tsx", ".mts", ".cts"]);
    let text = std::fs::read_to_string(file).unwrap_or_default();
    let alloc = Allocator::default();
    let program = parse(&alloc, &text, ts)?;
    #[derive(Default)]
    struct V {
        imports: Vec<String>,
        named: Vec<String>,
        all: Vec<String>,
        dynamic: Vec<String>,
    }
    impl<'a> Visit<'a> for V {
        fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
            self.imports.push(lit(&it.source));
        }
        fn visit_export_from_declaration(&mut self, it: &ExportFromDeclaration<'a>) {
            self.named.push(lit(&it.source));
        }
        fn visit_export_all_declaration(&mut self, it: &ExportAllDeclaration<'a>) {
            if it.exported.is_some() {
                self.named.push(lit(&it.source));
            } else {
                self.all.push(lit(&it.source));
            }
        }
        fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
            if let Expression::StringLiteral(s) = &it.source {
                self.dynamic.push(lit(s));
            }
            walk::walk_import_expression(self, it);
        }
    }
    let mut v = V::default();
    v.visit_program(&program);
    let mut out = v.imports;
    out.extend(v.named);
    out.extend(v.all);
    out.extend(v.dynamic);
    Ok(out)
}

/// `declarationExportsName(declaration, exportName)`.
fn declaration_exports_name(decl: &Declaration, name: &str) -> bool {
    match decl {
        Declaration::FunctionDeclaration(f) => {
            !f.declare && f.r#type != FunctionType::TSDeclareFunction && f.id.as_ref().is_some_and(|id| id.name == name)
        }
        Declaration::ClassDeclaration(c) => !c.declare && c.id.as_ref().is_some_and(|id| id.name == name),
        Declaration::VariableDeclaration(v) => {
            !v.declare
                && v.declarations.iter().any(|d| matches!(&d.id, BindingPattern::BindingIdentifier(id) if id.name == name))
        }
        _ => false,
    }
}

/// `isRuntimeDefaultDeclaration(declaration)`.
fn runtime_default(kind: &ExportDefaultDeclarationKind) -> bool {
    match kind {
        ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => false,
        ExportDefaultDeclarationKind::FunctionDeclaration(f) => !f.declare && f.r#type != FunctionType::TSDeclareFunction,
        ExportDefaultDeclarationKind::ClassDeclaration(c) => !c.declare,
        _ => true,
    }
}

// ── built modules ───────────────────────────────────────────────────────

fn re(src: &str, flags: &str) -> regress::Regex {
    regress::Regex::with_flags(src, flags).expect("regex")
}

/// `isBuiltThemeModule(file)`.
fn is_built_theme_module(file: &str) -> bool {
    if !(file.ends_with(".js") || file.ends_with(".mjs")) {
        return false;
    }
    let Ok(text) = std::fs::read_to_string(file) else { return false };
    text.contains("@generated by `astryx theme build`") && re(r"\bdefineTheme\b", "u").find(&text).is_none()
}

/// `builtThemeSourceFix(sourceDir, sources, doc, exportName)`.
pub fn built_theme_source_fix(source_dir: &str, sources: &[String], doc: &str, export_name: &str) -> Option<String> {
    if export_name.ends_with("Theme") {
        return None;
    }
    let built: Vec<&String> = sources.iter().filter(|f| is_built_theme_module(&fsutil::join(source_dir, f))).collect();
    let source: Vec<&String> = sources.iter().filter(|f| !built.contains(f)).collect();
    if built.is_empty() || source.len() != 1 {
        return None;
    }
    let extension = &source[0][export_name.len()..];
    let stem = format!("{export_name}Theme");
    let cmd = crate::cli::env::format_cli_command_at(std::path::Path::new(source_dir), "theme build");
    Some(format!(
        "Fix: {} is the module `{cmd}` writes, which takes the theme's name; rename {} to {stem}{extension} and {doc} to {stem}.doc.mjs, export `{stem}` from it, and build again.",
        built.iter().map(|f| format!("\"{f}\"")).collect::<Vec<_>>().join(", "),
        source[0]
    ))
}

/// `builtModuleDescriptorMessage(label, sourceDir, entry, exportName, doc, slug, files)`.
pub fn built_module_descriptor_message(
    label: &str,
    source_dir: &str,
    entry: &str,
    export_name: &str,
    doc: &str,
    slug: &str,
    files: &[String],
) -> Option<String> {
    if !is_built_theme_module(&fsutil::join(source_dir, entry)) {
        return None;
    }
    let head = format!(
        "{label} shares its stem with the built module \"{entry}\", which does not export \"{export_name}\": a descriptor must share its stem with the source that calls defineTheme."
    );
    Some(match confirmed_theme_source(source_dir, entry, slug, files) {
        None => format!(
            "{head} Fix: rename {doc} to share its stem with the theme's source (the module that calls defineTheme, such as {export_name}Theme.ts)."
        ),
        Some(source) => {
            let stem = match source.rfind('.') {
                Some(i) => &source[..i],
                None => source.as_str(),
            };
            format!("{head} The theme's source is \"{source}\". Fix: rename {doc} to {stem}.doc.mjs.")
        }
    })
}

/// `confirmedThemeSource(sourceDir, built, slug, files)`.
fn confirmed_theme_source(source_dir: &str, built: &str, slug: &str, files: &[String]) -> Option<String> {
    let own: Vec<&String> = files
        .iter()
        .filter(|f| !f.contains('/') && f.as_str() != built && THEME_MODULE_EXTENSIONS.iter().any(|e| f.ends_with(e)))
        .collect();
    let read = |f: &str| std::fs::read_to_string(fsutil::join(source_dir, f)).unwrap_or_default();
    let built_text = read(built);
    if let Some(m) = re(r"^\s*\*?\s*Source:\s*(\S+)\s*$", "mu").find(&built_text) {
        if let Some(g) = m.group(1) {
            let named = built_text[g].replace('\\', "/");
            let named = named.rsplit('/').next().unwrap_or("").to_string();
            if own.iter().any(|f| **f == named) {
                return Some(named);
            }
        }
    }
    let mut quoted = String::new();
    for c in slug.chars() {
        if ".*+?^${}()|[]\\".contains(c) {
            quoted.push('\\');
        }
        quoted.push(c);
    }
    let naming = re(&format!(r#"\bdefineTheme\s*\(\s*\{{[^}}]*\bname\s*:\s*['"`]{quoted}['"`]"#), "u");
    let matches: Vec<&&String> = own.iter().filter(|f| naming.find(&read(f)).is_some()).collect();
    if matches.len() == 1 {
        Some((*matches[0]).clone())
    } else {
        None
    }
}
