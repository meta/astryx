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
pub fn strip(source: &str, path: &Path, jsx: bool) -> Result<String, String> {
    let allocator = Allocator::default();
    let ts = is_typescript(path);
    let jsx = jsx || is_jsx(path);
    let mut source_type = if ts { SourceType::ts() } else { SourceType::mjs() };
    source_type = source_type.with_module(true).with_jsx(jsx);
    let ret = Parser::new(&allocator, source, source_type).parse();
    if let Some(err) = ret.diagnostics.first() {
        return Err(err.message.to_string());
    }
    let mut program = ret.program;
    let scoping = SemanticBuilder::new().with_enum_eval(true).build(&program).semantic.into_scoping();
    let mut options = TransformOptions::default();
    options.jsx.runtime = JsxRuntime::Classic;
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
