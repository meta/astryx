//! TypeScript and JSX stripping with oxc, before Boa parses a module.

use oxc::allocator::Allocator;
use oxc::codegen::{Codegen, CodegenOptions};
use oxc::parser::Parser;
use oxc::semantic::SemanticBuilder;
use oxc::span::SourceType;
use oxc::transformer::{JsxRuntime, TransformOptions, Transformer};
use std::path::Path;

/// Whether a path needs the TypeScript transform.
pub fn is_typescript(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("ts" | "tsx" | "mts" | "cts")
    )
}

pub fn is_jsx(path: &Path) -> bool {
    matches!(path.extension().and_then(|e| e.to_str()), Some("tsx" | "jsx"))
}

/// Strip types (and transform JSX to `React.createElement` calls when `jsx`
/// is set or the file is `.tsx`/`.jsx`). Returns the JS source, or a
/// SyntaxError message.
pub fn strip(source: &str, path: &Path, jsx: bool, automatic: bool) -> Result<String, String> {
    let allocator = Allocator::default();
    let ts = is_typescript(path);
    let jsx = jsx || is_jsx(path);
    let mut source_type = if ts { SourceType::ts() } else { SourceType::mjs() };
    source_type = source_type.with_module(true).with_jsx(jsx);
    // Where babel and oxc read JSX differently, give oxc babel's reading.
    let rewritten = super::syntax::babel_normalize(source, ts, jsx);
    let source = rewritten.as_deref().unwrap_or(source);
    let ret = Parser::new(&allocator, source, source_type).parse();
    if let Some(err) = ret.diagnostics.first() {
        return Err(err.message.to_string());
    }
    let mut program = ret.program;
    let scoping = SemanticBuilder::new().with_enum_eval(true).build(&program).semantic.into_scoping();
    let mut options = TransformOptions::default();
    options.jsx.runtime = if automatic { JsxRuntime::Automatic } else { JsxRuntime::Classic };
    options.jsx.jsx_plugin = jsx;
    options.typescript.only_remove_type_imports = false;
    let ret = Transformer::new(&allocator, path, &options).build_with_scoping(scoping, &mut program);
    if let Some(err) = ret.diagnostics.first() {
        return Err(err.message.to_string());
    }
    let out = Codegen::new().with_options(CodegenOptions::default()).build(&program);
    Ok(out.code)
}

/// Rewrite each `a ** b` (and `x **= b` on a plain name) to a call of
/// `__astryx_pow`, so the exponent operator computes what Node computes
/// (`Math.pow`'s bit-exact port). Everything else keeps its bytes, so line
/// and column numbers stay as written. Returns `None` when nothing changes or
/// oxc cannot parse the source.
pub fn rewrite_pow(source: &str, module: bool) -> Option<String> {
    use oxc::ast::ast::{AssignmentExpression, AssignmentTarget, BinaryExpression};
    use oxc::ast_visit::{walk, Visit};
    use oxc::span::GetSpan;
    use oxc::syntax::operator::{AssignmentOperator, BinaryOperator};

    if !source.contains("**") {
        return None;
    }
    // (position, order at that position, deleted bytes, inserted text);
    // at one position, closings come before replacements before openings.
    struct Edits(Vec<(u32, u8, u32, String)>);
    impl<'a> Visit<'a> for Edits {
        fn visit_binary_expression(&mut self, it: &BinaryExpression<'a>) {
            if it.operator == BinaryOperator::Exponential {
                let (l, r) = (it.left.span(), it.right.span());
                self.0.push((it.span.start, 2, 0, "__astryx_pow(".into()));
                self.0.push((l.end, 1, r.start - l.end, ", ".into()));
                self.0.push((it.span.end, 0, 0, ")".into()));
            }
            walk::walk_binary_expression(self, it);
        }
        fn visit_assignment_expression(&mut self, it: &AssignmentExpression<'a>) {
            if it.operator == AssignmentOperator::Exponential {
                if let AssignmentTarget::AssignmentTargetIdentifier(id) = &it.left {
                    let (l, r) = (id.span, it.right.span());
                    let name = id.name.as_str();
                    self.0.push((l.end, 1, r.start - l.end, format!(" = __astryx_pow({name}, ")));
                    self.0.push((it.span.end, 0, 0, ")".into()));
                }
            }
            walk::walk_assignment_expression(self, it);
        }
    }
    let allocator = Allocator::default();
    let source_type = if module { SourceType::mjs() } else { SourceType::cjs() };
    let ret = Parser::new(&allocator, source, source_type).parse();
    if !ret.diagnostics.is_empty() {
        return None;
    }
    let mut edits = Edits(Vec::new());
    edits.visit_program(&ret.program);
    if edits.0.is_empty() {
        return None;
    }
    edits.0.sort_by_key(|e| (e.0, e.1));
    let mut out = String::with_capacity(source.len() + edits.0.len() * 8);
    let mut cursor = 0usize;
    for (pos, _, del, text) in edits.0 {
        let pos = pos as usize;
        if pos < cursor {
            return None;
        }
        out.push_str(&source[cursor..pos]);
        out.push_str(&text);
        cursor = pos + del as usize;
    }
    out.push_str(&source[cursor..]);
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::rewrite_pow;

    #[test]
    fn rewrites_exponent() {
        assert_eq!(
            rewrite_pow("const a = (x + 1) ** 2 ** y; z **= 3; /** c */", true).unwrap(),
            "const a = __astryx_pow((x + 1), __astryx_pow(2, y)); z = __astryx_pow(z, 3); /** c */"
        );
        assert_eq!(rewrite_pow("/** doc */ const a = 1;", true), None);
    }
}

/// jiti runs a module as CommonJS, so an imported name reads the exporting
/// module's property when used: a name the module does not export is
/// `undefined`, not a link error. Rewrite each default and named import to a
/// namespace import and each use to a property read, `(0, ns.name)`, as
/// babel's CommonJS transform does. Other bytes stay; `None` when nothing
/// changes or oxc cannot parse the source.
pub fn jiti_import_reads(source: &str) -> Option<String> {
    use oxc::ast::ast::{ImportDeclarationSpecifier, ImportOrExportKind, Statement};
    use oxc::ast::AstKind;
    use oxc::span::GetSpan;

    if !source.contains("import") {
        return None;
    }
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, source, SourceType::mjs()).parse();
    if !ret.diagnostics.is_empty() {
        return None;
    }
    let program = ret.program;
    let semantic = SemanticBuilder::new().with_build_nodes(true).build(&program).semantic;
    let scoping = semantic.scoping();
    let nodes = semantic.nodes();
    let text = |s: oxc::span::Span| &source[s.start as usize..s.end as usize];
    let ident_re = |s: &str| {
        let mut cs = s.chars();
        cs.next().map(|c| c.is_ascii_alphabetic() || c == '_' || c == '$').unwrap_or(false)
            && cs.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
    };
    let mut edits: Vec<(u32, u32, String)> = Vec::new();
    let mut n = 0;
    for stmt in &program.body {
        let Statement::ImportDeclaration(d) = stmt else { continue };
        if d.import_kind == ImportOrExportKind::Type || d.with_clause.is_some() {
            continue;
        }
        let Some(specs) = &d.specifiers else { continue };
        let mut ns_name: Option<String> = None;
        let mut rewritten: Vec<(oxc::semantic::SymbolId, String)> = Vec::new();
        let mut kept: Vec<String> = Vec::new();
        for sp in specs {
            match sp {
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => ns_name = Some(s.local.name.to_string()),
                ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                    rewritten.push((s.local.symbol_id(), "default".into()))
                }
                ImportDeclarationSpecifier::ImportSpecifier(s) => {
                    if s.import_kind == ImportOrExportKind::Type {
                        continue;
                    }
                    rewritten.push((s.local.symbol_id(), s.imported.name().to_string()))
                }
            }
        }
        // A binding re-exported by name keeps its real import.
        rewritten.retain(|(sym, _)| {
            let exported = scoping.get_resolved_reference_ids(*sym).iter().any(|r| {
                let id = scoping.get_reference(*r).node_id();
                matches!(nodes.parent_kind(id), AstKind::ExportSpecifier(_))
            });
            if exported {
                kept.push(scoping.symbol_name(*sym).to_string());
            }
            !exported
        });
        if rewritten.is_empty() {
            continue;
        }
        let ns = ns_name.clone().unwrap_or_else(|| {
            n += 1;
            format!("__jiti_import_{n}")
        });
        let mut decl = format!("import * as {ns} from {};", text(d.source.span));
        if !kept.is_empty() {
            let keep: Vec<&str> = specs
                .iter()
                .filter(|sp| kept.iter().any(|k| k == sp.local().name.as_str()))
                .map(|sp| match sp {
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                        let _ = s;
                        "default as __jiti_default"
                    }
                    _ => text(sp.span()),
                })
                .collect();
            let keep: Vec<String> = keep
                .iter()
                .map(|k| {
                    if *k == "default as __jiti_default" {
                        let local = specs
                            .iter()
                            .find_map(|sp| match sp {
                                ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => Some(s.local.name.to_string()),
                                _ => None,
                            })
                            .unwrap_or_default();
                        format!("default as {local}")
                    } else {
                        k.to_string()
                    }
                })
                .collect();
            decl.push_str(&format!(" import {{ {} }} from {};", keep.join(", "), text(d.source.span)));
        }
        edits.push((d.span.start, d.span.end, decl));
        for (sym, name) in rewritten {
            let member = if ident_re(&name) { format!("{ns}.{name}") } else { format!("{ns}[{name:?}]") };
            for r in scoping.get_resolved_reference_ids(sym) {
                let id = scoping.get_reference(*r).node_id();
                let AstKind::IdentifierReference(ident) = nodes.get_node(id).kind() else { return None };
                let shorthand = matches!(nodes.parent_kind(id), AstKind::ObjectProperty(p) if p.shorthand);
                let local = ident.name.as_str();
                let read = if shorthand { format!("{local}: (0, {member})") } else { format!("(0, {member})") };
                edits.push((ident.span.start, ident.span.end, read));
            }
        }
    }
    if edits.is_empty() {
        return None;
    }
    edits.sort_by_key(|e| e.0);
    let mut out = String::with_capacity(source.len() + 64);
    let mut cursor = 0usize;
    for (start, end, t) in edits {
        if (start as usize) < cursor {
            return None;
        }
        out.push_str(&source[cursor..start as usize]);
        out.push_str(&t);
        cursor = end as usize;
    }
    out.push_str(&source[cursor..]);
    Some(out)
}

#[cfg(test)]
mod jiti_tests {
    use super::jiti_import_reads;

    #[test]
    fn imports_read_properties() {
        assert_eq!(
            jiti_import_reads("import d, {a, b as c} from './x';\nexport const v = [d, a(), {c}];\n").unwrap(),
            "import * as __jiti_import_1 from './x';\nexport const v = [(0, __jiti_import_1.default), (0, __jiti_import_1.a)(), {c: (0, __jiti_import_1.b)}];\n"
        );
        assert_eq!(jiti_import_reads("import * as n from './x'; export default n;"), None);
    }
}
