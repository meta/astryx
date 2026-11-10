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

/// What a module exports: its own names, and the specifiers it re-exports
/// with `export * from`.
#[derive(Debug, Clone, Default)]
pub struct ExportInfo {
    pub names: BTreeSet<String>,
    pub stars: Vec<String>,
}

/// The export names of a module's source (`None` when oxc cannot parse it).
pub fn export_info(source: &str) -> Option<ExportInfo> {
    use oxc::ast::ast::Declaration;
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, source, SourceType::mjs()).parse();
    if !ret.diagnostics.is_empty() {
        return None;
    }
    let mut info = ExportInfo::default();
    for stmt in &ret.program.body {
        match stmt {
            Statement::ExportDefaultDeclaration(_) => {
                info.names.insert("default".into());
            }
            Statement::ExportDeclaration(d) => match &d.declaration {
                Declaration::VariableDeclaration(v) => {
                    for decl in &v.declarations {
                        for id in decl.id.get_binding_identifiers() {
                            info.names.insert(id.name.to_string());
                        }
                    }
                }
                Declaration::FunctionDeclaration(f) => {
                    if let Some(id) = &f.id {
                        info.names.insert(id.name.to_string());
                    }
                }
                Declaration::ClassDeclaration(c) => {
                    if let Some(id) = &c.id {
                        info.names.insert(id.name.to_string());
                    }
                }
                _ => {}
            },
            Statement::ExportNamedDeclaration(d) => {
                for sp in &d.specifiers {
                    info.names.insert(sp.exported.name().to_string());
                }
            }
            Statement::ExportFromDeclaration(d) => {
                for sp in &d.specifiers {
                    info.names.insert(sp.exported.name().to_string());
                }
            }
            Statement::ExportAllDeclaration(d) => match &d.exported {
                Some(n) => {
                    info.names.insert(n.name().to_string());
                }
                None => info.stars.push(d.source.value.as_str().unwrap_or("").to_string()),
            },
            _ => {}
        }
    }
    Some(info)
}

/// Callbacks [`prune_barrel`] needs about the modules a barrel names.
pub trait BarrelContext {
    /// Every name the module at `spec` exports (`export *` followed),
    /// without `default`; `None` when unknown.
    fn star_names(&self, spec: &str) -> Option<BTreeSet<String>>;
    /// Whether the module at `spec` declares side effects (it must still
    /// load when nothing is taken from it).
    fn has_side_effects(&self, spec: &str) -> bool;
}

/// A barrel cut down to `wanted`, or `None` when `source` does more than
/// import and re-export.
pub fn prune_barrel(source: &str, wanted: &BTreeSet<String>, cx: &dyn BarrelContext) -> Option<String> {
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
    // `export *` sources: the wanted names each one supplies. A wanted name
    // two sources supply is ambiguous; leave such a barrel whole.
    let mut star_keep: HashMap<String, Option<BTreeSet<String>>> = HashMap::new();
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for stmt in &ret.program.body {
        if let Statement::ExportAllDeclaration(d) = stmt {
            if d.exported.is_none() {
                let spec = d.source.value.as_str().unwrap_or("").to_string();
                let keep = cx.star_names(&spec).map(|names| {
                    names.intersection(wanted).cloned().collect::<BTreeSet<String>>()
                });
                if let Some(k) = &keep {
                    for n in k {
                        if !seen.insert(n.clone()) {
                            return None;
                        }
                    }
                }
                star_keep.insert(spec, keep);
            }
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
                } else if cx.has_side_effects(d.source.value.as_str().unwrap_or("")) {
                    out.push_str(&format!("import {};\n", text(d.source.span)));
                }
            }
            Statement::ExportAllDeclaration(d) => {
                let spec = d.source.value.as_str().unwrap_or("");
                match &d.exported {
                    Some(name) => {
                        if wanted.contains(name.name().as_ref() as &str) {
                            out.push_str(text(d.span));
                            out.push('\n');
                        } else if cx.has_side_effects(spec) {
                            out.push_str(&format!("import {};\n", text(d.source.span)));
                        }
                    }
                    None => match star_keep.get(spec) {
                        Some(Some(keep)) if !keep.is_empty() => {
                            let names: Vec<&str> = keep.iter().map(|s| s.as_str()).collect();
                            out.push_str(&format!("export {{ {} }} from {};\n", names.join(", "), text(d.source.span)));
                        }
                        Some(Some(_)) => {
                            if cx.has_side_effects(spec) {
                                out.push_str(&format!("import {};\n", text(d.source.span)));
                            }
                        }
                        _ => {
                            out.push_str(text(d.span));
                            out.push('\n');
                        }
                    },
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
        struct Cx;
        impl BarrelContext for Cx {
            fn star_names(&self, spec: &str) -> Option<BTreeSet<String>> {
                match spec {
                    "./a.js" => Some(["X".to_string(), "Q".to_string()].into()),
                    "./b.js" => Some(["Z".to_string()].into()),
                    _ => None,
                }
            }
            fn has_side_effects(&self, spec: &str) -> bool {
                spec == "./b.js"
            }
        }
        let want: BTreeSet<String> = ["X".to_string()].into();
        assert_eq!(prune_barrel(barrel, &want, &Cx).unwrap(), "export { default as X } from './icons/x.mjs';\n");
        assert_eq!(prune_barrel("export const a = 1;", &want, &Cx), None);
        assert_eq!(
            prune_barrel("'use client';\nexport * from './a.js';\nexport * from './b.js';\nexport * from './c.js';\n", &want, &Cx).unwrap(),
            "export { X } from './a.js';\nimport './b.js';\nexport * from './c.js';\n"
        );
    }
}
