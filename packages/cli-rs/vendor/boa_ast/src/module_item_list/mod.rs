//! Module item list AST nodes.
//!
//! More information:
//!  - [ECMAScript specification][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-modules

use crate::{
    StatementListItem,
    declaration::{
        ExportDeclaration, ExportEntry, ExportSpecifier, ImportAttribute, ImportDeclaration,
        ImportEntry, ImportKind, ImportName, IndirectExportEntry, LocalExportEntry,
        ModuleSpecifier, ReExportImportName, ReExportKind,
    },
    operations::{BoundNamesVisitor, bound_names},
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::Sym;
use indexmap::IndexSet;
use rustc_hash::{FxHashSet, FxHasher};
use std::{convert::Infallible, hash::BuildHasherDefault, ops::ControlFlow};

/// Module item list AST node.
///
/// It contains a list of module items.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ModuleItemList
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ModuleItemList {
    items: Box<[ModuleItem]>,
}

impl ModuleItemList {
    /// Gets the list of module items.
    #[inline]
    #[must_use]
    pub const fn items(&self) -> &[ModuleItem] {
        &self.items
    }

    /// Abstract operation [`ExportedNames`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-static-semantics-exportednames
    #[inline]
    #[must_use]
    pub fn exported_names(&self) -> Vec<Sym> {
        #[derive(Debug)]
        struct ExportedItemsVisitor<'vec>(&'vec mut Vec<Sym>);

        impl<'ast> Visitor<'ast> for ExportedItemsVisitor<'_> {
            type BreakTy = Infallible;

            fn visit_import_declaration(
                &mut self,
                _: &'ast ImportDeclaration,
            ) -> ControlFlow<Self::BreakTy> {
                ControlFlow::Continue(())
            }
            fn visit_statement_list_item(
                &mut self,
                _: &'ast StatementListItem,
            ) -> ControlFlow<Self::BreakTy> {
                ControlFlow::Continue(())
            }
            fn visit_export_specifier(
                &mut self,
                node: &'ast ExportSpecifier,
            ) -> ControlFlow<Self::BreakTy> {
                self.0.push(node.alias());
                ControlFlow::Continue(())
            }
            fn visit_export_declaration(
                &mut self,
                node: &'ast ExportDeclaration,
            ) -> ControlFlow<Self::BreakTy> {
                match node {
                    ExportDeclaration::ReExport { kind, .. } => {
                        match kind {
                            ReExportKind::Namespaced { name: Some(name) } => self.0.push(*name),
                            ReExportKind::Namespaced { name: None } => {}
                            ReExportKind::Named { names } => {
                                for specifier in &**names {
                                    self.visit_export_specifier(specifier)?;
                                }
                            }
                        }
                        ControlFlow::Continue(())
                    }
                    ExportDeclaration::List(list) => {
                        for specifier in &**list {
                            self.visit_export_specifier(specifier)?;
                        }
                        ControlFlow::Continue(())
                    }
                    ExportDeclaration::VarStatement(var) => {
                        BoundNamesVisitor(self.0).visit_var_declaration(var)
                    }
                    ExportDeclaration::Declaration(decl) => {
                        BoundNamesVisitor(self.0).visit_declaration(decl)
                    }
                    ExportDeclaration::DefaultFunctionDeclaration(_)
                    | ExportDeclaration::DefaultGeneratorDeclaration(_)
                    | ExportDeclaration::DefaultAsyncFunctionDeclaration(_)
                    | ExportDeclaration::DefaultAsyncGeneratorDeclaration(_)
                    | ExportDeclaration::DefaultClassDeclaration(_)
                    | ExportDeclaration::DefaultAssignmentExpression(_) => {
                        self.0.push(Sym::DEFAULT);
                        ControlFlow::Continue(())
                    }
                }
            }
        }

        let mut names = Vec::new();

        let _ = ExportedItemsVisitor(&mut names).visit_module_item_list(self);

        names
    }

    /// Abstract operation [`ExportedBindings`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-static-semantics-exportedbindings
    #[inline]
    #[must_use]
    pub fn exported_bindings(&self) -> FxHashSet<Sym> {
        #[derive(Debug)]
        struct ExportedBindingsVisitor<'vec>(&'vec mut FxHashSet<Sym>);

        impl<'ast> Visitor<'ast> for ExportedBindingsVisitor<'_> {
            type BreakTy = Infallible;

            fn visit_import_declaration(
                &mut self,
                _: &'ast ImportDeclaration,
            ) -> ControlFlow<Self::BreakTy> {
                ControlFlow::Continue(())
            }
            fn visit_statement_list_item(
                &mut self,
                _: &'ast StatementListItem,
            ) -> ControlFlow<Self::BreakTy> {
                ControlFlow::Continue(())
            }
            fn visit_export_specifier(
                &mut self,
                node: &'ast ExportSpecifier,
            ) -> ControlFlow<Self::BreakTy> {
                self.0.insert(node.private_name());
                ControlFlow::Continue(())
            }
            fn visit_export_declaration(
                &mut self,
                node: &'ast ExportDeclaration,
            ) -> ControlFlow<Self::BreakTy> {
                let name = match node {
                    ExportDeclaration::ReExport { .. } => return ControlFlow::Continue(()),
                    ExportDeclaration::List(list) => {
                        for specifier in &**list {
                            self.visit_export_specifier(specifier)?;
                        }
                        return ControlFlow::Continue(());
                    }
                    ExportDeclaration::DefaultAssignmentExpression(expr) => {
                        return BoundNamesVisitor(self.0).visit_expression(expr);
                    }
                    ExportDeclaration::VarStatement(var) => {
                        return BoundNamesVisitor(self.0).visit_var_declaration(var);
                    }
                    ExportDeclaration::Declaration(decl) => {
                        return BoundNamesVisitor(self.0).visit_declaration(decl);
                    }
                    ExportDeclaration::DefaultFunctionDeclaration(f) => f.name(),
                    ExportDeclaration::DefaultGeneratorDeclaration(g) => g.name(),
                    ExportDeclaration::DefaultAsyncFunctionDeclaration(af) => af.name(),
                    ExportDeclaration::DefaultAsyncGeneratorDeclaration(ag) => ag.name(),
                    ExportDeclaration::DefaultClassDeclaration(cl) => cl.name(),
                };

                self.0.insert(name.sym());

                ControlFlow::Continue(())
            }
        }

        let mut names = FxHashSet::default();

        let _ = ExportedBindingsVisitor(&mut names).visit_module_item_list(self);

        names
    }

    /// Operation [`ModuleRequests`][spec].
    ///
    /// Gets the list of modules that need to be fetched by the module resolver to link this module.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-static-semantics-modulerequests
    #[inline]
    #[must_use]
    pub fn requests(&self) -> IndexSet<Sym, BuildHasherDefault<FxHasher>> {
        #[derive(Debug)]
        struct RequestsVisitor<'vec>(&'vec mut IndexSet<Sym, BuildHasherDefault<FxHasher>>);

        impl<'ast> Visitor<'ast> for RequestsVisitor<'_> {
            type BreakTy = Infallible;

            fn visit_statement_list_item(
                &mut self,
                _: &'ast StatementListItem,
            ) -> ControlFlow<Self::BreakTy> {
                ControlFlow::Continue(())
            }
            fn visit_module_specifier(
                &mut self,
                node: &'ast ModuleSpecifier,
            ) -> ControlFlow<Self::BreakTy> {
                self.0.insert(node.sym());
                ControlFlow::Continue(())
            }
        }

        let mut requests = IndexSet::default();

        let _ = RequestsVisitor(&mut requests).visit_module_item_list(self);

        requests
    }

    /// Operation [`ImportEntries`][spec].
    ///
    /// Gets the list of import entries of this module.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-static-semantics-importentries
    #[inline]
    #[must_use]
    pub fn import_entries(&self) -> Vec<ImportEntry> {
        #[derive(Debug)]
        struct ImportEntriesVisitor<'vec>(&'vec mut Vec<ImportEntry>);

        impl<'ast> Visitor<'ast> for ImportEntriesVisitor<'_> {
            type BreakTy = Infallible;

            fn visit_module_item(&mut self, node: &'ast ModuleItem) -> ControlFlow<Self::BreakTy> {
                match node {
                    ModuleItem::ImportDeclaration(import) => self.visit_import_declaration(import),
                    ModuleItem::ExportDeclaration(_) | ModuleItem::StatementListItem(_) => {
                        ControlFlow::Continue(())
                    }
                }
            }

            fn visit_import_declaration(
                &mut self,
                node: &'ast ImportDeclaration,
            ) -> ControlFlow<Self::BreakTy> {
                let module = node.specifier().sym();
                let attributes: Box<[ImportAttribute]> = Box::from(node.attributes());

                if let Some(default) = node.default() {
                    self.0.push(ImportEntry::new(
                        module,
                        ImportName::Name(Sym::DEFAULT),
                        default,
                        attributes.clone(),
                    ));
                }

                match node.kind() {
                    ImportKind::DefaultOrUnnamed => {}
                    ImportKind::Namespaced { binding } => {
                        self.0.push(ImportEntry::new(
                            module,
                            ImportName::Namespace,
                            *binding,
                            attributes.clone(),
                        ));
                    }
                    ImportKind::Named { names } => {
                        for name in &**names {
                            self.0.push(ImportEntry::new(
                                module,
                                ImportName::Name(name.export_name()),
                                name.binding(),
                                attributes.clone(),
                            ));
                        }
                    }
                }

                ControlFlow::Continue(())
            }
        }

        let mut entries = Vec::default();

        let _ = ImportEntriesVisitor(&mut entries).visit_module_item_list(self);

        entries
    }

    /// Operation [`ExportEntries`][spec].
    ///
    /// Gets the list of export entries of this module.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-static-semantics-exportentries
    #[inline]
    #[must_use]
    pub fn export_entries(&self) -> Vec<ExportEntry> {
        #[derive(Debug)]
        struct ExportEntriesVisitor<'vec>(&'vec mut Vec<ExportEntry>);

        impl<'ast> Visitor<'ast> for ExportEntriesVisitor<'_> {
            type BreakTy = Infallible;

            fn visit_module_item(&mut self, node: &'ast ModuleItem) -> ControlFlow<Self::BreakTy> {
                match node {
                    ModuleItem::ExportDeclaration(import) => self.visit_export_declaration(import),
                    ModuleItem::ImportDeclaration(_) | ModuleItem::StatementListItem(_) => {
                        ControlFlow::Continue(())
                    }
                }
            }

            fn visit_export_declaration(
                &mut self,
                node: &'ast ExportDeclaration,
            ) -> ControlFlow<Self::BreakTy> {
                let name = match node {
                    ExportDeclaration::ReExport {
                        kind,
                        specifier,
                        attributes,
                    } => {
                        let module = specifier.sym();
                        let attrs = attributes.clone();

                        match kind {
                            ReExportKind::Namespaced { name: Some(name) } => {
                                self.0.push(
                                    IndirectExportEntry::new(
                                        module,
                                        ReExportImportName::Star,
                                        *name,
                                        attrs.clone(),
                                    )
                                    .into(),
                                );
                            }
                            ReExportKind::Namespaced { name: None } => {
                                self.0.push(ExportEntry::StarReExport {
                                    module_request: module,
                                    attributes: attrs.clone(),
                                });
                            }

                            ReExportKind::Named { names } => {
                                for name in &**names {
                                    self.0.push(
                                        IndirectExportEntry::new(
                                            module,
                                            ReExportImportName::Name(name.private_name()),
                                            name.alias(),
                                            attrs.clone(),
                                        )
                                        .into(),
                                    );
                                }
                            }
                        }

                        return ControlFlow::Continue(());
                    }
                    ExportDeclaration::List(names) => {
                        for name in &**names {
                            self.0.push(
                                LocalExportEntry::new(name.private_name(), name.alias()).into(),
                            );
                        }
                        return ControlFlow::Continue(());
                    }
                    ExportDeclaration::VarStatement(var) => {
                        for name in bound_names(var) {
                            self.0.push(LocalExportEntry::new(name, name).into());
                        }
                        return ControlFlow::Continue(());
                    }
                    ExportDeclaration::Declaration(decl) => {
                        for name in bound_names(decl) {
                            self.0.push(LocalExportEntry::new(name, name).into());
                        }
                        return ControlFlow::Continue(());
                    }
                    ExportDeclaration::DefaultFunctionDeclaration(f) => f.name().sym(),
                    ExportDeclaration::DefaultGeneratorDeclaration(g) => g.name().sym(),
                    ExportDeclaration::DefaultAsyncFunctionDeclaration(af) => af.name().sym(),
                    ExportDeclaration::DefaultAsyncGeneratorDeclaration(ag) => ag.name().sym(),
                    ExportDeclaration::DefaultClassDeclaration(c) => c.name().sym(),
                    ExportDeclaration::DefaultAssignmentExpression(_) => Sym::DEFAULT_EXPORT,
                };

                self.0
                    .push(LocalExportEntry::new(name, Sym::DEFAULT).into());

                ControlFlow::Continue(())
            }
        }

        let mut entries = Vec::default();

        let _ = ExportEntriesVisitor(&mut entries).visit_module_item_list(self);

        entries
    }
}

impl<T> From<T> for ModuleItemList
where
    T: Into<Box<[ModuleItem]>>,
{
    #[inline]
    fn from(items: T) -> Self {
        Self {
            items: items.into(),
        }
    }
}

impl VisitWith for ModuleItemList {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        for item in &*self.items {
            visitor.visit_module_item(item)?;
        }

        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        for item in &mut *self.items {
            visitor.visit_module_item_mut(item)?;
        }

        ControlFlow::Continue(())
    }
}

/// Module item AST node.
///
/// This is an extension over a [`StatementList`](crate::StatementList), which can also include
/// multiple [`ImportDeclaration`] and [`ExportDeclaration`] nodes, along with
/// [`StatementListItem`] nodes.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ModuleItem
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug, PartialEq)]
pub enum ModuleItem {
    /// See [`ImportDeclaration`].
    ImportDeclaration(ImportDeclaration),
    /// See [`ExportDeclaration`].
    ExportDeclaration(Box<ExportDeclaration>),
    /// See [`StatementListItem`].
    StatementListItem(StatementListItem),
}

impl VisitWith for ModuleItem {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::ImportDeclaration(i) => visitor.visit_import_declaration(i),
            Self::ExportDeclaration(e) => visitor.visit_export_declaration(e),
            Self::StatementListItem(s) => visitor.visit_statement_list_item(s),
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::ImportDeclaration(i) => visitor.visit_import_declaration_mut(i),
            Self::ExportDeclaration(e) => visitor.visit_export_declaration_mut(e),
            Self::StatementListItem(s) => visitor.visit_statement_list_item_mut(s),
        }
    }
}
