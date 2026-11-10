//! Loading less of a side-effect-free package, as bundlers do.
//!
//! A package whose `package.json` says `"sideEffects": false` promises that
//! loading a module only defines exports. When a module imports a few names
//! from such a package's barrel (an index that only re-exports), the engine
//! loads a barrel cut down to those names, so it skips the modules nobody
//! uses. Results are the same; loading an icon library's 4000-module barrel
//! for three icons is not.

use oxc::allocator::Allocator;
use oxc::ast::ast::{ImportDeclarationSpecifier, ImportOrExportKind, Statement};
use oxc::ast_visit::{walk, Visit};
use oxc::parser::Parser;
use oxc::span::SourceType;
use std::collections::{BTreeSet, HashMap};

/// What a module uses from one import specifier.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Wanted {
    /// Everything (namespace import, `export *`, dynamic import).
    All,
    /// Only these export names (empty: a bare `import 'x'`).
    Names(BTreeSet<String>),
}

impl Wanted {
    fn merge(&mut self, other: Wanted) {
        match (self as &mut Wanted, other) {
            (Wanted::All, _) => {}
            (me, Wanted::All) => *me = Wanted::All,
            (Wanted::Names(a), Wanted::Names(b)) => a.extend(b),
        }
    }
}

/// The names a module's static imports and re-exports take, by specifier.
/// A specifier absent from the map (a computed dynamic import) counts as
/// [`Wanted::All`].
pub fn import_usage(source: &str) -> HashMap<String, Wanted> {
    let mut usage: HashMap<String, Wanted> = HashMap::new();
    if !(source.contains("import") || source.contains("export")) {
        return usage;
    }
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, source, SourceType::mjs()).parse();
    if !ret.diagnostics.is_empty() {
        return usage;
    }
    let mut add = |spec: &str, w: Wanted| match usage.get_mut(spec) {
        Some(cur) => cur.merge(w),
        None => {
            usage.insert(spec.to_string(), w);
        }
    };
    for stmt in &ret.program.body {
        match stmt {
            Statement::ImportDeclaration(d) => {
                if d.import_kind == ImportOrExportKind::Type {
                    continue;
                }
                let mut names = BTreeSet::new();
                let mut all = false;
                for s in d.specifiers.iter().flatten() {
                    match s {
                        ImportDeclarationSpecifier::ImportSpecifier(s) => {
                            names.insert(s.imported.name().to_string());
                        }
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => {
                            names.insert("default".to_string());
                        }
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => all = true,
                    }
                }
                add(d.source.value.as_str().unwrap_or(""), if all { Wanted::All } else { Wanted::Names(names) });
            }
            Statement::ExportFromDeclaration(d) => {
                let names = d.specifiers.iter().map(|s| s.local.name().to_string()).collect();
                add(d.source.value.as_str().unwrap_or(""), Wanted::Names(names));
            }
            Statement::ExportAllDeclaration(d) => add(d.source.value.as_str().unwrap_or(""), Wanted::All),
            _ => {}
        }
    }
    struct Dynamic<'u>(&'u mut Vec<String>);
    impl<'a> Visit<'a> for Dynamic<'_> {
        fn visit_import_expression(&mut self, it: &oxc::ast::ast::ImportExpression<'a>) {
            if let oxc::ast::ast::Expression::StringLiteral(s) = &it.source {
                self.0.push(s.value.as_str().unwrap_or("").to_string());
            }
            walk::walk_import_expression(self, it);
        }
    }
    if source.contains("import(") {
        let mut dynamic = Vec::new();
        Dynamic(&mut dynamic).visit_program(&ret.program);
        for spec in dynamic {
            add(&spec, Wanted::All);
        }
    }
    usage
}

/// A barrel cut down to `wanted`, or `None` when `source` does more than
/// import and re-export.
pub fn prune_barrel(source: &str, wanted: &BTreeSet<String>) -> Option<String> {
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, source, SourceType::mjs()).parse();
    if !ret.diagnostics.is_empty() {
        return None;
    }
    let text = |span: oxc::span::Span| &source[span.start as usize..span.end as usize];
    // Pass 1: which local bindings the kept `export {local as name}` need.
    let mut needed_locals = BTreeSet::new();
    for stmt in &ret.program.body {
        match stmt {
            Statement::ImportDeclaration(_)
            | Statement::ExportFromDeclaration(_)
            | Statement::ExportAllDeclaration(_)
            | Statement::EmptyStatement(_) => {}
            Statement::ExportNamedDeclaration(d) => {
                for s in &d.specifiers {
                    if wanted.contains(s.exported.name().as_ref() as &str) {
                        needed_locals.insert(s.local.name().to_string());
                    }
                }
            }
            _ => return None,
        }
    }
    let mut out = String::new();
    for stmt in &ret.program.body {
        match stmt {
            Statement::ImportDeclaration(d) => {
                let keep = d.specifiers.iter().flatten().any(|s| {
                    let local = match s {
                        ImportDeclarationSpecifier::ImportSpecifier(s) => s.local.name.as_str(),
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => s.local.name.as_str(),
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => s.local.name.as_str(),
                    };
                    needed_locals.contains(local)
                });
                if keep {
                    out.push_str(text(d.span));
                    out.push('\n');
                }
            }
            Statement::ExportFromDeclaration(d) => {
                let kept: Vec<&str> = d
                    .specifiers
                    .iter()
                    .filter(|s| wanted.contains(s.exported.name().as_ref() as &str))
                    .map(|s| text(s.span))
                    .collect();
                if !kept.is_empty() {
                    out.push_str(&format!("export {{ {} }} from {};\n", kept.join(", "), text(d.source.span)));
                }
            }
            Statement::ExportAllDeclaration(d) => {
                let keep = match &d.exported {
                    Some(name) => wanted.contains(name.name().as_ref() as &str),
                    None => true,
                };
                if keep {
                    out.push_str(text(d.span));
                    out.push('\n');
                }
            }
            Statement::ExportNamedDeclaration(d) => {
                let kept: Vec<&str> = d
                    .specifiers
                    .iter()
                    .filter(|s| wanted.contains(s.exported.name().as_ref() as &str))
                    .map(|s| text(s.span))
                    .collect();
                if !kept.is_empty() {
                    out.push_str(&format!("export {{ {} }};\n", kept.join(", ")));
                }
            }
            _ => {}
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_and_pruning() {
        let u = import_usage("import a, {b as c} from 'x'; import * as n from 'y'; export {d} from 'x'; import('z');");
        assert_eq!(u["x"], Wanted::Names(["b", "d", "default"].iter().map(|s| s.to_string()).collect()));
        assert_eq!(u["y"], Wanted::All);
        assert_eq!(u["z"], Wanted::All);
        let barrel = "\"use strict\";\nimport * as index from './icons/index.mjs';\nexport { index as icons };\nexport { default as X, default as XIcon } from './icons/x.mjs';\nexport { default as Y } from './icons/y.mjs';\n";
        let want: BTreeSet<String> = ["X".to_string()].into();
        assert_eq!(prune_barrel(barrel, &want).unwrap(), "export { default as X } from './icons/x.mjs';\n");
        assert_eq!(prune_barrel("export const a = 1;", &want), None);
    }
}
