//! Export declaration AST nodes.
//!
//! This module contains `export` declaration AST nodes.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-exports
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export

use super::{ImportAttribute, ModuleSpecifier, VarDeclaration};
use crate::{
    Declaration, Expression,
    function::{
        AsyncFunctionDeclaration, AsyncGeneratorDeclaration, ClassDeclaration, FunctionDeclaration,
        GeneratorDeclaration,
    },
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::Sym;
use std::ops::ControlFlow;

/// The kind of re-export in an [`ExportDeclaration`].
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ReExportKind {
    /// Namespaced Re-export (`export * as name from "module-name"`).
    Namespaced {
        /// Reexported name for the imported module.
        name: Option<Sym>,
    },
    /// Re-export list (`export { export1, export2 as alias2 } from "module-name"`).
    Named {
        /// List of the required re-exports of the re-exported module.
        names: Box<[ExportSpecifier]>,
    },
}

impl VisitWith for ReExportKind {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::Namespaced { name: Some(name) } => visitor.visit_sym(name),
            Self::Namespaced { name: None } => ControlFlow::Continue(()),
            Self::Named { names } => {
                for name in &**names {
                    visitor.visit_export_specifier(name)?;
                }
                ControlFlow::Continue(())
            }
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::Namespaced { name: Some(name) } => visitor.visit_sym_mut(name),
            Self::Namespaced { name: None } => ControlFlow::Continue(()),
            Self::Named { names } => {
                for name in &mut **names {
                    visitor.visit_export_specifier_mut(name)?;
                }
                ControlFlow::Continue(())
            }
        }
    }
}

/// An export declaration AST node.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ExportDeclaration
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug, PartialEq)]
pub enum ExportDeclaration {
    /// Re-export.
    ReExport {
        /// The kind of reexport declared.
        kind: ReExportKind,
        /// Reexported module specifier.
        specifier: ModuleSpecifier,
        /// Re-export attributes.
        attributes: Box<[ImportAttribute]>,
    },
    /// List of exports.
    List(Box<[ExportSpecifier]>),
    /// Variable statement export.
    VarStatement(VarDeclaration),
    /// Declaration export.
    Declaration(Declaration),
    /// Default function export.
    DefaultFunctionDeclaration(FunctionDeclaration),
    /// Default generator export.
    DefaultGeneratorDeclaration(GeneratorDeclaration),
    /// Default async function export.
    DefaultAsyncFunctionDeclaration(AsyncFunctionDeclaration),
    /// Default async generator export.
    DefaultAsyncGeneratorDeclaration(AsyncGeneratorDeclaration),
    /// Default class declaration export.
    DefaultClassDeclaration(Box<ClassDeclaration>),
    /// Default assignment expression export.
    DefaultAssignmentExpression(Expression),
}

impl VisitWith for ExportDeclaration {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::ReExport {
                specifier,
                kind,
                attributes,
            } => {
                visitor.visit_module_specifier(specifier)?;
                visitor.visit_re_export_kind(kind)?;
                for attribute in &**attributes {
                    visitor.visit_import_attribute(attribute)?;
                }
                ControlFlow::Continue(())
            }
            Self::List(list) => {
                for item in &**list {
                    visitor.visit_export_specifier(item)?;
                }
                ControlFlow::Continue(())
            }
            Self::VarStatement(var) => visitor.visit_var_declaration(var),
            Self::Declaration(decl) => visitor.visit_declaration(decl),
            Self::DefaultFunctionDeclaration(f) => visitor.visit_function_declaration(f),
            Self::DefaultGeneratorDeclaration(g) => visitor.visit_generator_declaration(g),
            Self::DefaultAsyncFunctionDeclaration(af) => {
                visitor.visit_async_function_declaration(af)
            }
            Self::DefaultAsyncGeneratorDeclaration(ag) => {
                visitor.visit_async_generator_declaration(ag)
            }
            Self::DefaultClassDeclaration(c) => visitor.visit_class_declaration(c),
            Self::DefaultAssignmentExpression(expr) => visitor.visit_expression(expr),
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::ReExport {
                specifier,
                kind,
                attributes,
            } => {
                visitor.visit_module_specifier_mut(specifier)?;
                visitor.visit_re_export_kind_mut(kind)?;
                for attribute in &mut **attributes {
                    visitor.visit_import_attribute_mut(attribute)?;
                }
                ControlFlow::Continue(())
            }
            Self::List(list) => {
                for item in &mut **list {
                    visitor.visit_export_specifier_mut(item)?;
                }
                ControlFlow::Continue(())
            }
            Self::VarStatement(var) => visitor.visit_var_declaration_mut(var),
            Self::Declaration(decl) => visitor.visit_declaration_mut(decl),
            Self::DefaultFunctionDeclaration(f) => visitor.visit_function_declaration_mut(f),
            Self::DefaultGeneratorDeclaration(g) => visitor.visit_generator_declaration_mut(g),
            Self::DefaultAsyncFunctionDeclaration(af) => {
                visitor.visit_async_function_declaration_mut(af)
            }
            Self::DefaultAsyncGeneratorDeclaration(ag) => {
                visitor.visit_async_generator_declaration_mut(ag)
            }
            Self::DefaultClassDeclaration(c) => visitor.visit_class_declaration_mut(c),
            Self::DefaultAssignmentExpression(expr) => visitor.visit_expression_mut(expr),
        }
    }
}

/// Export specifier
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ExportSpecifier
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, Copy, PartialEq, Eq)]
pub struct ExportSpecifier {
    alias: Sym,
    private_name: Sym,
    string_literal: bool,
}

impl ExportSpecifier {
    /// Creates a new [`ExportSpecifier`].
    #[inline]
    #[must_use]
    pub const fn new(alias: Sym, private_name: Sym, string_literal: bool) -> Self {
        Self {
            alias,
            private_name,
            string_literal,
        }
    }

    /// Gets the original alias.
    #[inline]
    #[must_use]
    pub const fn alias(self) -> Sym {
        self.alias
    }

    /// Gets the private name of the export inside the module.
    #[inline]
    #[must_use]
    pub const fn private_name(self) -> Sym {
        self.private_name
    }

    /// Returns `true` if the private name of the specifier was a `StringLiteral`.
    #[inline]
    #[must_use]
    pub const fn string_literal(&self) -> bool {
        self.string_literal
    }
}

impl VisitWith for ExportSpecifier {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_sym(&self.alias)?;
        visitor.visit_sym(&self.private_name)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_sym_mut(&mut self.alias)?;
        visitor.visit_sym_mut(&mut self.private_name)
    }
}

/// The name under which a reexported binding is exported by a module.
///
/// This differs slightly from the spec, since `[[ImportName]]` can be either a name, `all-but-default`
/// or `all`, but the last two exports can be identified with the `export_name` field from
/// [`ExportEntry`], which joins both variants into a single `Star` variant.
#[derive(Debug, Clone, Copy)]
pub enum ReExportImportName {
    /// A binding of the imported module.
    Name(Sym),
    /// All exports of the module.
    Star,
}

/// [`ExportEntry`][spec] record.
///
/// [spec]: https://tc39.es/ecma262/#table-exportentry-records
#[derive(Debug, Clone)]
pub enum ExportEntry {
    /// An ordinary export entry
    Ordinary(LocalExportEntry),
    /// A star reexport entry.
    StarReExport {
        /// The module from where this reexport will import.
        module_request: Sym,
        /// The import attributes for this reexport.
        attributes: Box<[ImportAttribute]>,
    },
    /// A reexport entry with an export name.
    ReExport(IndirectExportEntry),
}

impl From<IndirectExportEntry> for ExportEntry {
    fn from(v: IndirectExportEntry) -> Self {
        Self::ReExport(v)
    }
}

impl From<LocalExportEntry> for ExportEntry {
    fn from(v: LocalExportEntry) -> Self {
        Self::Ordinary(v)
    }
}

/// A local export entry
#[derive(Debug, Clone, Copy)]
pub struct LocalExportEntry {
    local_name: Sym,
    export_name: Sym,
}

impl LocalExportEntry {
    /// Creates a new `LocalExportEntry`.
    #[must_use]
    pub const fn new(local_name: Sym, export_name: Sym) -> Self {
        Self {
            local_name,
            export_name,
        }
    }

    /// Gets the local name of this export entry.
    #[must_use]
    pub const fn local_name(&self) -> Sym {
        self.local_name
    }

    /// Gets the export name of this export entry.
    #[must_use]
    pub const fn export_name(&self) -> Sym {
        self.export_name
    }
}

/// A reexported export entry.
#[derive(Debug, Clone)]
pub struct IndirectExportEntry {
    module_request: Sym,
    import_name: ReExportImportName,
    export_name: Sym,
    attributes: Box<[ImportAttribute]>,
}

impl IndirectExportEntry {
    /// Creates a new `IndirectExportEntry`.
    #[must_use]
    pub fn new(
        module_request: Sym,
        import_name: ReExportImportName,
        export_name: Sym,
        attributes: Box<[ImportAttribute]>,
    ) -> Self {
        Self {
            module_request,
            import_name,
            export_name,
            attributes,
        }
    }

    /// Gets the module from where this entry reexports.
    #[must_use]
    pub const fn module_request(&self) -> Sym {
        self.module_request
    }

    /// Gets the import name of the reexport.
    #[must_use]
    pub const fn import_name(&self) -> ReExportImportName {
        self.import_name
    }

    /// Gets the public alias of the reexport.
    #[must_use]
    pub const fn export_name(&self) -> Sym {
        self.export_name
    }

    /// Gets the import attributes.
    #[must_use]
    pub fn attributes(&self) -> &[ImportAttribute] {
        &self.attributes
    }
}
