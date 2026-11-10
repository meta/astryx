//! This module implements the scope analysis for the AST.
//!
//! The scope analysis is done in two steps:
//! 1. Collecting bindings: This step collects all the bindings in the AST and fills the scopes with them.
//! 2. Analyzing binding escapes: This step analyzes if the bindings escape their function scopes.

#[cfg(feature = "annex-b")]
use crate::operations::annex_b_function_declarations_names;
use crate::{
    Declaration, Module, Script, StatementListItem, ToJsString,
    declaration::{Binding, ExportDeclaration, LexicalDeclaration, VariableList},
    expression::{Identifier, literal::ObjectMethodDefinition},
    function::{
        ArrowFunction, AsyncArrowFunction, AsyncFunctionDeclaration, AsyncFunctionExpression,
        AsyncGeneratorDeclaration, AsyncGeneratorExpression, ClassDeclaration, ClassElement,
        ClassExpression, FormalParameterList, FunctionBody, FunctionDeclaration,
        FunctionExpression, GeneratorDeclaration, GeneratorExpression,
    },
    operations::{
        ContainsSymbol, LexicallyScopedDeclaration, VarScopedDeclaration, bound_names, contains,
        lexically_declared_names, lexically_scoped_declarations, var_declared_names,
        var_scoped_declarations,
    },
    property::PropertyName,
    scope::{FunctionScopes, IdentifierReference, Scope},
    statement::{
        Block, Catch, ForInLoop, ForLoop, ForOfLoop, Switch, With,
        iteration::{ForLoopInitializer, IterableLoopInitializer},
    },
    visitor::{NodeRef, NodeRefMut, VisitorMut},
};
use boa_interner::{Interner, Sym};
use rustc_hash::FxHashMap;
use std::ops::ControlFlow;

/// Collect bindings and fill the scopes with them.
///
/// # Errors
/// Any break in the control flow that happened during the collection.
pub(crate) fn collect_bindings<'a, N>(
    node: &'a mut N,
    strict: bool,
    eval: bool,
    scope: &Scope,
    interner: &Interner,
) -> Result<(), &'static str>
where
    &'a mut N: Into<NodeRefMut<'a>>,
{
    let mut visitor = BindingCollectorVisitor {
        strict,
        eval,
        in_arrow: false,
        scope: scope.clone(),
        interner,
    };
    match visitor.visit(node) {
        ControlFlow::Continue(()) => Ok(()),
        ControlFlow::Break(reason) => Err(reason),
    }
}

/// Analyze if bindings escape their function scopes.
///
/// # Errors
/// Any break in the control flow that happened during the analysis.
pub(crate) fn analyze_binding_escapes<'a, N>(
    node: &'a mut N,
    in_eval: bool,
    scope: Scope,
    interner: &Interner,
) -> Result<(), &'static str>
where
    &'a mut N: Into<NodeRefMut<'a>>,
{
    let mut visitor = BindingEscapeAnalyzer {
        scope,
        direct_eval: in_eval,
        with: false,
        interner,
    };

    match visitor.visit(node.into()) {
        ControlFlow::Continue(()) => Ok(()),
        ControlFlow::Break(reason) => Err(reason),
    }
}

struct BindingEscapeAnalyzer<'interner> {
    scope: Scope,
    direct_eval: bool,
    with: bool,
    interner: &'interner Interner,
}

impl<'ast> VisitorMut<'ast> for BindingEscapeAnalyzer<'_> {
    type BreakTy = &'static str;

    fn visit_identifier_mut(&mut self, node: &'ast mut Identifier) -> ControlFlow<Self::BreakTy> {
        let name = node.to_js_string(self.interner);
        self.scope
            .access_binding(&name, self.direct_eval || self.with);
        ControlFlow::Continue(())
    }

    fn visit_block_mut(&mut self, node: &'ast mut Block) -> ControlFlow<Self::BreakTy> {
        let direct_eval_old = self.direct_eval;
        self.direct_eval = node.contains_direct_eval || self.direct_eval;
        if let Some(scope) = &mut node.scope {
            if self.direct_eval {
                scope.escape_all_bindings();
            }
            std::mem::swap(&mut self.scope, scope);
        }

        self.visit_statement_list_mut(&mut node.statements)?;
        if let Some(scope) = &mut node.scope {
            std::mem::swap(&mut self.scope, scope);
            scope.reorder_binding_indices();
        }
        self.direct_eval = direct_eval_old;
        ControlFlow::Continue(())
    }

    fn visit_switch_mut(&mut self, node: &'ast mut Switch) -> ControlFlow<Self::BreakTy> {
        self.visit_expression_mut(&mut node.val)?;
        let direct_eval_old = self.direct_eval;
        self.direct_eval = node.contains_direct_eval || self.direct_eval;
        if let Some(scope) = &mut node.scope {
            if self.direct_eval {
                scope.escape_all_bindings();
            }
            std::mem::swap(&mut self.scope, scope);
        }
        for case in &mut node.cases {
            self.visit_case_mut(case)?;
        }
        if let Some(scope) = &mut node.scope {
            std::mem::swap(&mut self.scope, scope);
            scope.reorder_binding_indices();
        }
        self.direct_eval = direct_eval_old;
        ControlFlow::Continue(())
    }

    fn visit_with_mut(&mut self, node: &'ast mut With) -> ControlFlow<Self::BreakTy> {
        let with = self.with;
        self.with = true;
        if self.direct_eval {
            node.scope.escape_all_bindings();
        }
        self.visit_expression_mut(&mut node.expression)?;
        std::mem::swap(&mut self.scope, &mut node.scope);
        self.visit_statement_mut(&mut node.statement)?;
        std::mem::swap(&mut self.scope, &mut node.scope);
        node.scope.reorder_binding_indices();
        self.with = with;
        ControlFlow::Continue(())
    }

    fn visit_catch_mut(&mut self, node: &'ast mut Catch) -> ControlFlow<Self::BreakTy> {
        let direct_eval_old = self.direct_eval;
        self.direct_eval = node.contains_direct_eval || self.direct_eval;
        if self.direct_eval {
            node.scope.escape_all_bindings();
        }
        std::mem::swap(&mut self.scope, &mut node.scope);
        if let Some(binding) = &mut node.parameter {
            self.visit_binding_mut(binding)?;
        }
        self.visit_block_mut(&mut node.block)?;
        std::mem::swap(&mut self.scope, &mut node.scope);
        node.scope.reorder_binding_indices();
        self.direct_eval = direct_eval_old;
        ControlFlow::Continue(())
    }

    fn visit_for_loop_mut(&mut self, node: &'ast mut ForLoop) -> ControlFlow<Self::BreakTy> {
        let direct_eval_old = self.direct_eval;
        self.direct_eval = node.inner.contains_direct_eval || self.direct_eval;
        if let Some(ForLoopInitializer::Lexical(decl)) = &mut node.inner.init {
            if self.direct_eval {
                decl.scope.escape_all_bindings();
            }
            std::mem::swap(&mut self.scope, &mut decl.scope);
        }
        if let Some(init) = &mut node.inner.init {
            self.visit_for_loop_initializer_mut(init)?;
        }
        if let Some(condition) = &mut node.inner.condition {
            self.visit_expression_mut(condition)?;
        }
        if let Some(final_expr) = &mut node.inner.final_expr {
            self.visit_expression_mut(final_expr)?;
        }
        self.visit_statement_mut(&mut node.inner.body)?;
        if let Some(ForLoopInitializer::Lexical(decl)) = &mut node.inner.init {
            std::mem::swap(&mut self.scope, &mut decl.scope);
            decl.scope.reorder_binding_indices();
        }
        self.direct_eval = direct_eval_old;
        ControlFlow::Continue(())
    }

    fn visit_for_in_loop_mut(&mut self, node: &'ast mut ForInLoop) -> ControlFlow<Self::BreakTy> {
        let direct_eval_old = self.direct_eval;
        if let Some(scope) = &mut node.target_scope {
            self.direct_eval = node.target_contains_direct_eval || self.direct_eval;
            if self.direct_eval {
                scope.escape_all_bindings();
            }
            std::mem::swap(&mut self.scope, scope);
        }
        self.visit_expression_mut(&mut node.target)?;
        if let Some(scope) = &mut node.target_scope {
            self.direct_eval = direct_eval_old;
            std::mem::swap(&mut self.scope, scope);
            scope.reorder_binding_indices();
        }
        if let Some(scope) = &mut node.scope {
            self.direct_eval = node.contains_direct_eval || self.direct_eval;
            if self.direct_eval {
                scope.escape_all_bindings();
            }
            std::mem::swap(&mut self.scope, scope);
        }
        self.visit_iterable_loop_initializer_mut(&mut node.initializer)?;
        self.visit_statement_mut(&mut node.body)?;
        if let Some(scope) = &mut node.scope {
            std::mem::swap(&mut self.scope, scope);
            scope.reorder_binding_indices();
        }
        self.direct_eval = direct_eval_old;
        ControlFlow::Continue(())
    }

    fn visit_for_of_loop_mut(&mut self, node: &'ast mut ForOfLoop) -> ControlFlow<Self::BreakTy> {
        let direct_eval_old = self.direct_eval;
        if let Some(scope) = &mut node.iterable_scope {
            self.direct_eval = node.iterable_contains_direct_eval || self.direct_eval;
            if self.direct_eval {
                scope.escape_all_bindings();
            }
            std::mem::swap(&mut self.scope, scope);
        }
        self.visit_expression_mut(&mut node.iterable)?;
        if let Some(scope) = &mut node.iterable_scope {
            self.direct_eval = direct_eval_old;
            std::mem::swap(&mut self.scope, scope);
            scope.reorder_binding_indices();
        }
        if let Some(scope) = &mut node.scope {
            self.direct_eval = node.contains_direct_eval || self.direct_eval;
            if self.direct_eval {
                scope.escape_all_bindings();
            }
            std::mem::swap(&mut self.scope, scope);
        }
        self.visit_iterable_loop_initializer_mut(&mut node.init)?;
        self.visit_statement_mut(&mut node.body)?;
        if let Some(scope) = &mut node.scope {
            std::mem::swap(&mut self.scope, scope);
            scope.reorder_binding_indices();
        }
        self.direct_eval = direct_eval_old;
        ControlFlow::Continue(())
    }

    fn visit_function_declaration_mut(
        &mut self,
        node: &'ast mut FunctionDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        self.visit_function_like(
            &mut node.parameters,
            &mut node.body,
            &mut node.scopes,
            node.contains_direct_eval,
        )
    }

    fn visit_generator_declaration_mut(
        &mut self,
        node: &'ast mut GeneratorDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        self.visit_function_like(
            &mut node.parameters,
            &mut node.body,
            &mut node.scopes,
            node.contains_direct_eval,
        )
    }

    fn visit_async_function_declaration_mut(
        &mut self,
        node: &'ast mut AsyncFunctionDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        self.visit_function_like(
            &mut node.parameters,
            &mut node.body,
            &mut node.scopes,
            node.contains_direct_eval,
        )
    }

    fn visit_async_generator_declaration_mut(
        &mut self,
        node: &'ast mut AsyncGeneratorDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        self.visit_function_like(
            &mut node.parameters,
            &mut node.body,
            &mut node.scopes,
            node.contains_direct_eval,
        )
    }

    fn visit_function_expression_mut(
        &mut self,
        node: &'ast mut FunctionExpression,
    ) -> ControlFlow<Self::BreakTy> {
        self.visit_function_like(
            &mut node.parameters,
            &mut node.body,
            &mut node.scopes,
            node.contains_direct_eval,
        )
    }

    fn visit_generator_expression_mut(
        &mut self,
        node: &'ast mut GeneratorExpression,
    ) -> ControlFlow<Self::BreakTy> {
        self.visit_function_like(
            &mut node.parameters,
            &mut node.body,
            &mut node.scopes,
            node.contains_direct_eval,
        )
    }

    fn visit_async_function_expression_mut(
        &mut self,
        node: &'ast mut AsyncFunctionExpression,
    ) -> ControlFlow<Self::BreakTy> {
        self.visit_function_like(
            &mut node.parameters,
            &mut node.body,
            &mut node.scopes,
            node.contains_direct_eval,
        )
    }

    fn visit_async_generator_expression_mut(
        &mut self,
        node: &'ast mut AsyncGeneratorExpression,
    ) -> ControlFlow<Self::BreakTy> {
        self.visit_function_like(
            &mut node.parameters,
            &mut node.body,
            &mut node.scopes,
            node.contains_direct_eval,
        )
    }

    fn visit_arrow_function_mut(
        &mut self,
        node: &'ast mut ArrowFunction,
    ) -> ControlFlow<Self::BreakTy> {
        self.visit_function_like(
            &mut node.parameters,
            &mut node.body,
            &mut node.scopes,
            node.contains_direct_eval,
        )
    }

    fn visit_async_arrow_function_mut(
        &mut self,
        node: &'ast mut AsyncArrowFunction,
    ) -> ControlFlow<Self::BreakTy> {
        self.visit_function_like(
            &mut node.parameters,
            &mut node.body,
            &mut node.scopes,
            node.contains_direct_eval,
        )
    }

    fn visit_class_declaration_mut(
        &mut self,
        node: &'ast mut ClassDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        node.name_scope.escape_all_bindings();
        std::mem::swap(&mut self.scope, &mut node.name_scope);
        if let Some(super_ref) = &mut node.super_ref {
            self.visit_expression_mut(super_ref)?;
        }
        if let Some(constructor) = &mut node.constructor {
            self.visit_function_expression_mut(constructor)?;
        }
        for element in &mut *node.elements {
            self.visit_class_element_mut(element)?;
        }
        std::mem::swap(&mut self.scope, &mut node.name_scope);
        node.name_scope.reorder_binding_indices();
        ControlFlow::Continue(())
    }

    fn visit_class_expression_mut(
        &mut self,
        node: &'ast mut ClassExpression,
    ) -> ControlFlow<Self::BreakTy> {
        if let Some(name_scope) = &mut node.name_scope {
            if self.direct_eval {
                name_scope.escape_all_bindings();
            }
            name_scope.escape_all_bindings();
            std::mem::swap(&mut self.scope, name_scope);
        }
        if let Some(super_ref) = &mut node.super_ref {
            self.visit_expression_mut(super_ref)?;
        }
        if let Some(constructor) = &mut node.constructor {
            self.visit_function_expression_mut(constructor)?;
        }
        for element in &mut *node.elements {
            self.visit_class_element_mut(element)?;
        }
        if let Some(name_scope) = &mut node.name_scope {
            std::mem::swap(&mut self.scope, name_scope);
            name_scope.reorder_binding_indices();
        }
        ControlFlow::Continue(())
    }

    fn visit_class_element_mut(
        &mut self,
        node: &'ast mut ClassElement,
    ) -> ControlFlow<Self::BreakTy> {
        match node {
            ClassElement::MethodDefinition(node) => self.visit_function_like(
                &mut node.parameters,
                &mut node.body,
                &mut node.scopes,
                node.contains_direct_eval,
            ),
            ClassElement::FieldDefinition(field) | ClassElement::StaticFieldDefinition(field) => {
                self.visit_property_name_mut(&mut field.name)?;
                if let Some(e) = &mut field.initializer {
                    std::mem::swap(&mut self.scope, &mut field.scope);
                    self.visit_expression_mut(e)?;
                    std::mem::swap(&mut self.scope, &mut field.scope);
                }
                ControlFlow::Continue(())
            }
            ClassElement::PrivateFieldDefinition(field)
            | ClassElement::PrivateStaticFieldDefinition(field) => {
                if let Some(e) = &mut field.initializer {
                    std::mem::swap(&mut self.scope, &mut field.scope);
                    self.visit_expression_mut(e)?;
                    std::mem::swap(&mut self.scope, &mut field.scope);
                }
                ControlFlow::Continue(())
            }
            ClassElement::StaticBlock(node) => {
                let contains_direct_eval = contains(node.statements(), ContainsSymbol::DirectEval);
                self.visit_function_like(
                    &mut FormalParameterList::default(),
                    &mut node.body,
                    &mut node.scopes,
                    contains_direct_eval,
                )
            }
        }
    }

    fn visit_object_method_definition_mut(
        &mut self,
        node: &'ast mut ObjectMethodDefinition,
    ) -> ControlFlow<Self::BreakTy> {
        self.visit_property_name_mut(&mut node.name)?;
        self.visit_function_like(
            &mut node.parameters,
            &mut node.body,
            &mut node.scopes,
            node.contains_direct_eval,
        )
    }

    fn visit_export_declaration_mut(
        &mut self,
        node: &'ast mut ExportDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        match node {
            ExportDeclaration::ReExport {
                specifier, kind, ..
            } => {
                self.visit_module_specifier_mut(specifier)?;
                self.visit_re_export_kind_mut(kind)
            }
            ExportDeclaration::List(list) => {
                for item in &mut **list {
                    self.visit_export_specifier_mut(item)?;
                }
                ControlFlow::Continue(())
            }
            ExportDeclaration::VarStatement(var) => self.visit_var_declaration_mut(var),
            ExportDeclaration::Declaration(decl) => self.visit_declaration_mut(decl),
            ExportDeclaration::DefaultFunctionDeclaration(f) => {
                self.visit_function_declaration_mut(f)
            }
            ExportDeclaration::DefaultGeneratorDeclaration(g) => {
                self.visit_generator_declaration_mut(g)
            }
            ExportDeclaration::DefaultAsyncFunctionDeclaration(af) => {
                self.visit_async_function_declaration_mut(af)
            }
            ExportDeclaration::DefaultAsyncGeneratorDeclaration(ag) => {
                self.visit_async_generator_declaration_mut(ag)
            }
            ExportDeclaration::DefaultClassDeclaration(c) => self.visit_class_declaration_mut(c),
            ExportDeclaration::DefaultAssignmentExpression(expr) => {
                let name = Sym::DEFAULT_EXPORT.to_js_string(self.interner);
                drop(self.scope.create_mutable_binding(name.clone(), false));
                self.scope.access_binding(&name, true);
                self.visit_expression_mut(expr)
            }
        }
    }

    fn visit_module_mut(&mut self, node: &'ast mut Module) -> ControlFlow<Self::BreakTy> {
        let mut scope = node.scope.clone();
        scope.escape_all_bindings();
        std::mem::swap(&mut self.scope, &mut scope);
        self.visit_module_item_list_mut(&mut node.items)?;
        std::mem::swap(&mut self.scope, &mut scope);
        scope.reorder_binding_indices();
        ControlFlow::Continue(())
    }
}

impl BindingEscapeAnalyzer<'_> {
    fn visit_function_like(
        &mut self,
        parameters: &mut FormalParameterList,
        body: &mut FunctionBody,
        scopes: &mut FunctionScopes,
        contains_direct_eval: bool,
    ) -> ControlFlow<&'static str> {
        let direct_eval_old = self.direct_eval;
        self.direct_eval = contains_direct_eval || self.direct_eval;
        if self.direct_eval {
            scopes.escape_all_bindings();
        }
        let mut scope = scopes.parameter_scope();
        std::mem::swap(&mut self.scope, &mut scope);
        self.visit_formal_parameter_list_mut(parameters)?;
        std::mem::swap(&mut self.scope, &mut scope);
        scope = scopes.body_scope();
        std::mem::swap(&mut self.scope, &mut scope);
        self.visit_function_body_mut(body)?;
        std::mem::swap(&mut self.scope, &mut scope);
        if scopes.arguments_object_accessed() && scopes.mapped_arguments_object {
            let parameter_names = bound_names(parameters);
            for name in parameter_names {
                scopes
                    .parameter_scope()
                    .access_binding(&name.to_js_string(self.interner), true);
            }
        }
        scopes.reorder_binding_indices();
        self.direct_eval = direct_eval_old;
        ControlFlow::Continue(())
    }
}

struct BindingCollectorVisitor<'interner> {
    strict: bool,
    eval: bool,
    scope: Scope,
    in_arrow: bool,
    interner: &'interner Interner,
}

impl<'ast> VisitorMut<'ast> for BindingCollectorVisitor<'_> {
    type BreakTy = &'static str;

    fn visit_this_mut(
        &mut self,
        _node: &'ast mut crate::expression::This,
    ) -> ControlFlow<Self::BreakTy> {
        // NOTE: Arrow functions inherit 'this' from their enclosing scope, so we must escape it.
        if self.in_arrow {
            self.scope.escape_this_in_enclosing_function_scope();
        }
        ControlFlow::Continue(())
    }

    fn visit_function_declaration_mut(
        &mut self,
        node: &'ast mut FunctionDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        let strict = node.body.strict();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            None,
            &mut None,
            strict,
            false,
        )
    }

    fn visit_generator_declaration_mut(
        &mut self,
        node: &'ast mut GeneratorDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        let strict = node.body.strict();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            None,
            &mut None,
            strict,
            false,
        )
    }

    fn visit_async_function_declaration_mut(
        &mut self,
        node: &'ast mut AsyncFunctionDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        let strict = node.body.strict();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            None,
            &mut None,
            strict,
            false,
        )
    }

    fn visit_async_generator_declaration_mut(
        &mut self,
        node: &'ast mut AsyncGeneratorDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        let strict = node.body.strict();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            None,
            &mut None,
            strict,
            false,
        )
    }

    fn visit_function_expression_mut(
        &mut self,
        node: &'ast mut FunctionExpression,
    ) -> ControlFlow<Self::BreakTy> {
        let name = if node.has_binding_identifier {
            node.name()
        } else {
            None
        };
        let strict = node.body.strict();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            name,
            &mut node.name_scope,
            strict,
            false,
        )
    }

    fn visit_generator_expression_mut(
        &mut self,
        node: &'ast mut GeneratorExpression,
    ) -> ControlFlow<Self::BreakTy> {
        let name = if node.has_binding_identifier {
            node.name()
        } else {
            None
        };
        let strict = node.body.strict();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            name,
            &mut node.name_scope,
            strict,
            false,
        )
    }

    fn visit_async_function_expression_mut(
        &mut self,
        node: &'ast mut AsyncFunctionExpression,
    ) -> ControlFlow<Self::BreakTy> {
        let name = if node.has_binding_identifier {
            node.name()
        } else {
            None
        };
        let strict = node.body.strict();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            name,
            &mut node.name_scope,
            strict,
            false,
        )
    }

    fn visit_async_generator_expression_mut(
        &mut self,
        node: &'ast mut AsyncGeneratorExpression,
    ) -> ControlFlow<Self::BreakTy> {
        let name = if node.has_binding_identifier {
            node.name()
        } else {
            None
        };
        let strict = node.body.strict();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            name,
            &mut node.name_scope,
            strict,
            false,
        )
    }

    fn visit_arrow_function_mut(
        &mut self,
        node: &'ast mut ArrowFunction,
    ) -> ControlFlow<Self::BreakTy> {
        let strict = node.body.strict();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            None,
            &mut None,
            strict,
            true,
        )
    }

    fn visit_async_arrow_function_mut(
        &mut self,
        node: &'ast mut AsyncArrowFunction,
    ) -> ControlFlow<Self::BreakTy> {
        let strict = node.body.strict();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            None,
            &mut None,
            strict,
            true,
        )
    }

    fn visit_class_declaration_mut(
        &mut self,
        node: &'ast mut ClassDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        let mut name_scope = Scope::new(self.scope.clone(), false);
        let name = node.name().to_js_string(self.interner);
        name_scope.create_immutable_binding(name, true);
        std::mem::swap(&mut self.scope, &mut name_scope);
        if let Some(super_ref) = &mut node.super_ref {
            self.visit_expression_mut(super_ref)?;
        }
        if let Some(constructor) = &mut node.constructor {
            self.visit_function_expression_mut(constructor)?;
        }
        for element in &mut *node.elements {
            self.visit_class_element_mut(element)?;
        }
        std::mem::swap(&mut self.scope, &mut name_scope);
        node.name_scope = name_scope;
        ControlFlow::Continue(())
    }

    fn visit_class_expression_mut(
        &mut self,
        node: &'ast mut ClassExpression,
    ) -> ControlFlow<Self::BreakTy> {
        let mut name_scope = None;
        if let Some(name) = node.name
            && node.name_scope.is_some()
        {
            let mut scope = Scope::new(self.scope.clone(), false);
            let name = name.to_js_string(self.interner);
            scope.create_immutable_binding(name, true);
            node.name_scope = Some(scope.clone());
            std::mem::swap(&mut self.scope, &mut scope);
            name_scope = Some(scope);
        }

        if let Some(super_ref) = &mut node.super_ref {
            self.visit_expression_mut(super_ref)?;
        }
        if let Some(constructor) = &mut node.constructor {
            self.visit_function_expression_mut(constructor)?;
        }
        for element in &mut *node.elements {
            self.visit_class_element_mut(element)?;
        }
        if let Some(mut scope) = name_scope {
            std::mem::swap(&mut self.scope, &mut scope);
        }
        ControlFlow::Continue(())
    }

    fn visit_class_element_mut(
        &mut self,
        node: &'ast mut ClassElement,
    ) -> ControlFlow<Self::BreakTy> {
        match node {
            ClassElement::MethodDefinition(node) => {
                let strict = node.body.strict();
                self.visit_function_like(
                    &mut node.body,
                    &mut node.parameters,
                    &mut node.scopes,
                    None,
                    &mut None,
                    strict,
                    false,
                )
            }
            ClassElement::FieldDefinition(field) | ClassElement::StaticFieldDefinition(field) => {
                self.visit_property_name_mut(&mut field.name)?;
                let mut scope = Scope::new(self.scope.clone(), true);
                std::mem::swap(&mut self.scope, &mut scope);
                if let Some(e) = &mut field.initializer {
                    self.visit_expression_mut(e)?;
                }
                std::mem::swap(&mut self.scope, &mut scope);
                field.scope = scope;
                ControlFlow::Continue(())
            }
            ClassElement::PrivateFieldDefinition(field)
            | ClassElement::PrivateStaticFieldDefinition(field) => {
                let mut scope = Scope::new(self.scope.clone(), true);
                std::mem::swap(&mut self.scope, &mut scope);
                if let Some(e) = &mut field.initializer {
                    self.visit_expression_mut(e)?;
                }
                std::mem::swap(&mut self.scope, &mut scope);
                field.scope = scope;
                ControlFlow::Continue(())
            }
            ClassElement::StaticBlock(node) => {
                let strict = node.body.strict();
                self.visit_function_like(
                    &mut node.body,
                    &mut FormalParameterList::default(),
                    &mut node.scopes,
                    None,
                    &mut None,
                    strict,
                    false,
                )
            }
        }
    }

    fn visit_object_method_definition_mut(
        &mut self,
        node: &'ast mut ObjectMethodDefinition,
    ) -> ControlFlow<Self::BreakTy> {
        match &mut node.name {
            PropertyName::Literal(_) => {}
            PropertyName::Computed(name) => {
                self.visit_expression_mut(name)?;
            }
        }
        let strict = node.body.strict();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            None,
            &mut None,
            strict,
            false,
        )
    }

    fn visit_block_mut(&mut self, node: &'ast mut Block) -> ControlFlow<Self::BreakTy> {
        let mut scope = block_declaration_instantiation(node, self.scope.clone(), self.interner);
        if let Some(scope) = &mut scope {
            std::mem::swap(&mut self.scope, scope);
        }
        self.visit_statement_list_mut(&mut node.statements)?;
        if let Some(scope) = &mut scope {
            std::mem::swap(&mut self.scope, scope);
        }
        node.scope = scope;
        ControlFlow::Continue(())
    }

    fn visit_switch_mut(&mut self, node: &'ast mut Switch) -> ControlFlow<Self::BreakTy> {
        self.visit_expression_mut(&mut node.val)?;
        let mut scope = block_declaration_instantiation(node, self.scope.clone(), self.interner);
        if let Some(scope) = &mut scope {
            std::mem::swap(&mut self.scope, scope);
        }
        for case in &mut *node.cases {
            self.visit_case_mut(case)?;
        }
        if let Some(scope) = &mut scope {
            std::mem::swap(&mut self.scope, scope);
        }
        node.scope = scope;
        ControlFlow::Continue(())
    }

    fn visit_with_mut(&mut self, node: &'ast mut With) -> ControlFlow<Self::BreakTy> {
        self.visit_expression_mut(&mut node.expression)?;
        let mut scope = Scope::new(self.scope.clone(), false);
        std::mem::swap(&mut self.scope, &mut scope);
        self.visit_statement_mut(&mut node.statement)?;
        std::mem::swap(&mut self.scope, &mut scope);
        node.scope = scope;
        ControlFlow::Continue(())
    }

    fn visit_catch_mut(&mut self, node: &'ast mut Catch) -> ControlFlow<Self::BreakTy> {
        let mut scope = Scope::new(self.scope.clone(), false);
        if let Some(binding) = node.parameter() {
            match binding {
                Binding::Identifier(ident) => {
                    let ident = ident.to_js_string(self.interner);
                    drop(scope.create_mutable_binding(ident.clone(), false));
                }
                Binding::Pattern(pattern) => {
                    for ident in bound_names(pattern) {
                        let ident = ident.to_js_string(self.interner);
                        drop(scope.create_mutable_binding(ident, false));
                    }
                }
            }
        }
        std::mem::swap(&mut self.scope, &mut scope);
        if let Some(binding) = &mut node.parameter {
            self.visit_binding_mut(binding)?;
        }
        self.visit_block_mut(&mut node.block)?;
        std::mem::swap(&mut self.scope, &mut scope);
        node.scope = scope;
        ControlFlow::Continue(())
    }

    fn visit_for_loop_mut(&mut self, node: &'ast mut ForLoop) -> ControlFlow<Self::BreakTy> {
        let scope = match &mut node.inner.init {
            Some(ForLoopInitializer::Lexical(decl)) => {
                let mut scope = Scope::new(self.scope.clone(), false);
                let names = bound_names(&decl.declaration);
                if decl.declaration.is_const() {
                    for name in &names {
                        let name = name.to_js_string(self.interner);
                        scope.create_immutable_binding(name, true);
                    }
                } else {
                    for name in &names {
                        let name = name.to_js_string(self.interner);
                        drop(scope.create_mutable_binding(name, false));
                    }
                }
                decl.scope = scope.clone();
                std::mem::swap(&mut self.scope, &mut scope);
                Some(scope)
            }
            _ => None,
        };
        if let Some(fli) = &mut node.inner.init {
            self.visit_for_loop_initializer_mut(fli)?;
        }
        if let Some(expr) = &mut node.inner.condition {
            self.visit_expression_mut(expr)?;
        }
        if let Some(expr) = &mut node.inner.final_expr {
            self.visit_expression_mut(expr)?;
        }
        self.visit_statement_mut(&mut node.inner.body)?;
        if let Some(mut scope) = scope {
            std::mem::swap(&mut self.scope, &mut scope);
        }
        ControlFlow::Continue(())
    }

    fn visit_for_in_loop_mut(&mut self, node: &'ast mut ForInLoop) -> ControlFlow<Self::BreakTy> {
        let initializer_bound_names = match node.initializer() {
            IterableLoopInitializer::Let(declaration)
            | IterableLoopInitializer::Const(declaration) => bound_names(declaration),
            _ => Vec::new(),
        };
        if initializer_bound_names.is_empty() {
            self.visit_expression_mut(&mut node.target)?;
        } else {
            let mut scope = Scope::new(self.scope.clone(), false);
            for name in &initializer_bound_names {
                let name = name.to_js_string(self.interner);
                drop(scope.create_mutable_binding(name, false));
            }
            std::mem::swap(&mut self.scope, &mut scope);
            self.visit_expression_mut(&mut node.target)?;
            std::mem::swap(&mut self.scope, &mut scope);
            node.target_scope = Some(scope);
        }
        let scope = match node.initializer() {
            IterableLoopInitializer::Let(declaration) => {
                let scope = Scope::new(self.scope.clone(), false);
                match declaration {
                    Binding::Identifier(ident) => {
                        let ident = ident.to_js_string(self.interner);
                        drop(scope.create_mutable_binding(ident.clone(), false));
                    }
                    Binding::Pattern(pattern) => {
                        for ident in bound_names(pattern) {
                            let ident = ident.to_js_string(self.interner);
                            drop(scope.create_mutable_binding(ident, false));
                        }
                    }
                }
                Some(scope)
            }
            IterableLoopInitializer::Const(declaration) => {
                let scope = Scope::new(self.scope.clone(), false);
                match declaration {
                    Binding::Identifier(ident) => {
                        let ident = ident.to_js_string(self.interner);
                        scope.create_immutable_binding(ident.clone(), true);
                    }
                    Binding::Pattern(pattern) => {
                        for ident in bound_names(pattern) {
                            let ident = ident.to_js_string(self.interner);
                            scope.create_immutable_binding(ident, true);
                        }
                    }
                }
                Some(scope)
            }
            _ => None,
        };
        if let Some(mut scope) = scope {
            std::mem::swap(&mut self.scope, &mut scope);
            self.visit_iterable_loop_initializer_mut(&mut node.initializer)?;
            self.visit_statement_mut(&mut node.body)?;
            std::mem::swap(&mut self.scope, &mut scope);
            node.scope = Some(scope);
        } else {
            self.visit_iterable_loop_initializer_mut(&mut node.initializer)?;
            self.visit_statement_mut(&mut node.body)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_for_of_loop_mut(&mut self, node: &'ast mut ForOfLoop) -> ControlFlow<Self::BreakTy> {
        let initializer_bound_names = match node.initializer() {
            IterableLoopInitializer::Let(declaration)
            | IterableLoopInitializer::Const(declaration) => bound_names(declaration),
            _ => Vec::new(),
        };
        if initializer_bound_names.is_empty() {
            self.visit_expression_mut(&mut node.iterable)?;
        } else {
            let mut scope = Scope::new(self.scope.clone(), false);
            for name in &initializer_bound_names {
                let name = name.to_js_string(self.interner);
                drop(scope.create_mutable_binding(name, false));
            }
            std::mem::swap(&mut self.scope, &mut scope);
            self.visit_expression_mut(&mut node.iterable)?;
            std::mem::swap(&mut self.scope, &mut scope);
            node.iterable_scope = Some(scope);
        }
        let scope = match node.initializer() {
            IterableLoopInitializer::Let(declaration) => {
                let scope = Scope::new(self.scope.clone(), false);
                match declaration {
                    Binding::Identifier(ident) => {
                        let ident = ident.to_js_string(self.interner);
                        drop(scope.create_mutable_binding(ident.clone(), false));
                    }
                    Binding::Pattern(pattern) => {
                        for ident in bound_names(pattern) {
                            let ident = ident.to_js_string(self.interner);
                            drop(scope.create_mutable_binding(ident, false));
                        }
                    }
                }
                Some(scope)
            }
            IterableLoopInitializer::Const(declaration) => {
                let scope = Scope::new(self.scope.clone(), false);
                match declaration {
                    Binding::Identifier(ident) => {
                        let ident = ident.to_js_string(self.interner);
                        scope.create_immutable_binding(ident.clone(), true);
                    }
                    Binding::Pattern(pattern) => {
                        for ident in bound_names(pattern) {
                            let ident = ident.to_js_string(self.interner);
                            scope.create_immutable_binding(ident, true);
                        }
                    }
                }
                Some(scope)
            }
            _ => None,
        };
        if let Some(mut scope) = scope {
            std::mem::swap(&mut self.scope, &mut scope);
            self.visit_iterable_loop_initializer_mut(&mut node.init)?;
            self.visit_statement_mut(&mut node.body)?;
            std::mem::swap(&mut self.scope, &mut scope);
            node.scope = Some(scope);
        } else {
            self.visit_iterable_loop_initializer_mut(&mut node.init)?;
            self.visit_statement_mut(&mut node.body)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_module_mut(&mut self, node: &'ast mut Module) -> ControlFlow<Self::BreakTy> {
        let mut scope = Scope::new(self.scope.clone(), true);
        module_instantiation(node, &scope, self.interner);
        std::mem::swap(&mut self.scope, &mut scope);
        self.visit_module_item_list_mut(&mut node.items)?;
        std::mem::swap(&mut self.scope, &mut scope);
        node.scope = scope;
        ControlFlow::Continue(())
    }

    fn visit_script_mut(&mut self, node: &'ast mut Script) -> ControlFlow<Self::BreakTy> {
        if self.eval {
            self.visit_statement_list_mut(node.statements_mut())?;
        } else {
            match global_declaration_instantiation(node, &self.scope, self.interner) {
                Ok(()) => {
                    self.visit_statement_list_mut(node.statements_mut())?;
                }
                Err(e) => return ControlFlow::Break(e),
            }
        }
        ControlFlow::Continue(())
    }
}

impl BindingCollectorVisitor<'_> {
    #[allow(clippy::too_many_arguments)]
    fn visit_function_like(
        &mut self,
        body: &mut FunctionBody,
        parameters: &mut FormalParameterList,
        scopes: &mut FunctionScopes,
        name: Option<Identifier>,
        name_scope: &mut Option<Scope>,
        strict: bool,
        arrow: bool,
    ) -> ControlFlow<&'static str> {
        let strict = self.strict || strict;
        let old_in_arrow = self.in_arrow;
        self.in_arrow = arrow;

        let function_scope = if let Some(name) = name {
            let scope = Scope::new(self.scope.clone(), false);
            let name = name.to_js_string(self.interner);
            scope.create_immutable_binding(name, strict);
            *name_scope = Some(scope.clone());
            Scope::new(scope, true)
        } else {
            Scope::new(self.scope.clone(), true)
        };

        let function_scopes = function_declaration_instantiation(
            body,
            parameters,
            arrow,
            strict,
            function_scope.clone(),
            self.interner,
        );

        let mut params_scope = function_scopes.parameter_scope();
        let mut body_scope = function_scopes.body_scope();

        std::mem::swap(&mut self.scope, &mut params_scope);
        self.visit_formal_parameter_list_mut(parameters)?;
        std::mem::swap(&mut self.scope, &mut params_scope);

        std::mem::swap(&mut self.scope, &mut body_scope);
        self.visit_function_body_mut(body)?;
        std::mem::swap(&mut self.scope, &mut body_scope);

        *scopes = function_scopes;

        self.in_arrow = old_in_arrow;

        ControlFlow::Continue(())
    }
}

/// Optimize scope indices when scopes only contain local bindings.
pub(crate) fn optimize_scope_indices<'a, N>(node: &'a mut N, scope: &Scope)
where
    &'a mut N: Into<NodeRefMut<'a>>,
{
    let mut visitor = ScopeIndexVisitor {
        index: scope.scope_index(),
    };
    let _ = visitor.visit(node.into());
}

/// Like [`optimize_scope_indices`] but for a [`FunctionExpression`] compiled
/// by the `Function` constructor with `force_function_scope = true`.
///
/// The `Function` constructor always pushes a function scope at runtime, so
/// the optimizer must account for that even when the function scope would
/// otherwise be elided.
pub(crate) fn optimize_scope_indices_function_constructor(
    node: &mut FunctionExpression,
    scope: &Scope,
) {
    let mut visitor = ScopeIndexVisitor {
        index: scope.scope_index(),
    };
    let _ = visitor.visit_function_like(
        &mut node.body,
        &mut node.parameters,
        &mut node.scopes,
        &mut node.name_scope,
        false,
        // Always force the function scope for the Function constructor.
        true,
    );
}

struct ScopeIndexVisitor {
    index: u32,
}

impl<'ast> VisitorMut<'ast> for ScopeIndexVisitor {
    type BreakTy = ();

    fn visit_function_declaration_mut(
        &mut self,
        node: &'ast mut FunctionDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        let contains_direct_eval = node.contains_direct_eval();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            &mut None,
            false,
            contains_direct_eval,
        )
    }

    fn visit_generator_declaration_mut(
        &mut self,
        node: &'ast mut GeneratorDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        let contains_direct_eval = node.contains_direct_eval();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            &mut None,
            false,
            contains_direct_eval,
        )
    }

    fn visit_async_function_declaration_mut(
        &mut self,
        node: &'ast mut AsyncFunctionDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        let contains_direct_eval = node.contains_direct_eval();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            &mut None,
            false,
            contains_direct_eval,
        )
    }

    fn visit_async_generator_declaration_mut(
        &mut self,
        node: &'ast mut AsyncGeneratorDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        let contains_direct_eval = node.contains_direct_eval();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            &mut None,
            false,
            contains_direct_eval,
        )
    }

    fn visit_function_expression_mut(
        &mut self,
        node: &'ast mut FunctionExpression,
    ) -> ControlFlow<Self::BreakTy> {
        let contains_direct_eval = node.contains_direct_eval();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            &mut node.name_scope,
            false,
            contains_direct_eval,
        )
    }

    fn visit_generator_expression_mut(
        &mut self,
        node: &'ast mut GeneratorExpression,
    ) -> ControlFlow<Self::BreakTy> {
        let contains_direct_eval = node.contains_direct_eval();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            &mut node.name_scope,
            false,
            contains_direct_eval,
        )
    }

    fn visit_async_function_expression_mut(
        &mut self,
        node: &'ast mut AsyncFunctionExpression,
    ) -> ControlFlow<Self::BreakTy> {
        let contains_direct_eval = node.contains_direct_eval();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            &mut node.name_scope,
            false,
            contains_direct_eval,
        )
    }

    fn visit_async_generator_expression_mut(
        &mut self,
        node: &'ast mut AsyncGeneratorExpression,
    ) -> ControlFlow<Self::BreakTy> {
        let contains_direct_eval = node.contains_direct_eval();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            &mut node.name_scope,
            false,
            contains_direct_eval,
        )
    }

    fn visit_arrow_function_mut(
        &mut self,
        node: &'ast mut ArrowFunction,
    ) -> ControlFlow<Self::BreakTy> {
        let contains_direct_eval = node.contains_direct_eval();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            &mut None,
            true,
            contains_direct_eval,
        )
    }

    fn visit_async_arrow_function_mut(
        &mut self,
        node: &'ast mut AsyncArrowFunction,
    ) -> ControlFlow<Self::BreakTy> {
        let contains_direct_eval = node.contains_direct_eval();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            &mut None,
            true,
            contains_direct_eval,
        )
    }

    fn visit_class_declaration_mut(
        &mut self,
        node: &'ast mut ClassDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        let index = self.index;
        if !node.name_scope.all_bindings_local() {
            self.index += 1;
        }
        node.name_scope.set_index(self.index);
        if let Some(super_ref) = &mut node.super_ref {
            self.visit_expression_mut(super_ref)?;
        }
        if let Some(constructor) = &mut node.constructor {
            let node = constructor;
            self.visit_function_like(
                &mut node.body,
                &mut node.parameters,
                &mut node.scopes,
                &mut node.name_scope,
                false,
                true,
            )?;
        }
        for element in &mut *node.elements {
            self.visit_class_element_mut(element)?;
        }
        self.index = index;
        ControlFlow::Continue(())
    }

    fn visit_class_expression_mut(
        &mut self,
        node: &'ast mut ClassExpression,
    ) -> ControlFlow<Self::BreakTy> {
        let index = self.index;
        if let Some(scope) = &node.name_scope {
            if !scope.all_bindings_local() {
                self.index += 1;
            }
            scope.set_index(self.index);
        }
        if let Some(super_ref) = &mut node.super_ref {
            self.visit_expression_mut(super_ref)?;
        }
        if let Some(constructor) = &mut node.constructor {
            self.visit_function_like(
                &mut constructor.body,
                &mut constructor.parameters,
                &mut constructor.scopes,
                &mut constructor.name_scope,
                false,
                true,
            )?;
        }
        for element in &mut *node.elements {
            self.visit_class_element_mut(element)?;
        }
        self.index = index;
        ControlFlow::Continue(())
    }

    fn visit_class_element_mut(
        &mut self,
        node: &'ast mut ClassElement,
    ) -> ControlFlow<Self::BreakTy> {
        match node {
            ClassElement::MethodDefinition(node) => {
                let contains_direct_eval = node.contains_direct_eval();
                self.visit_function_like(
                    &mut node.body,
                    &mut node.parameters,
                    &mut node.scopes,
                    &mut None,
                    false,
                    contains_direct_eval,
                )
            }
            ClassElement::FieldDefinition(field) | ClassElement::StaticFieldDefinition(field) => {
                self.visit_property_name_mut(&mut field.name)?;
                let index = self.index;
                self.index += 1;
                field.scope.set_index(self.index);
                if let Some(e) = &mut field.initializer {
                    self.visit_expression_mut(e)?;
                }
                self.index = index;
                ControlFlow::Continue(())
            }
            ClassElement::PrivateFieldDefinition(field)
            | ClassElement::PrivateStaticFieldDefinition(field) => {
                let index = self.index;
                self.index += 1;
                field.scope.set_index(self.index);
                if let Some(e) = &mut field.initializer {
                    self.visit_expression_mut(e)?;
                }
                self.index = index;
                ControlFlow::Continue(())
            }
            ClassElement::StaticBlock(node) => self.visit_function_like(
                &mut node.body,
                &mut FormalParameterList::default(),
                &mut node.scopes,
                &mut None,
                false,
                true,
            ),
        }
    }

    fn visit_object_method_definition_mut(
        &mut self,
        node: &'ast mut ObjectMethodDefinition,
    ) -> ControlFlow<Self::BreakTy> {
        match &mut node.name {
            PropertyName::Literal(_) => {}
            PropertyName::Computed(name) => {
                self.visit_expression_mut(name)?;
            }
        }
        let contains_direct_eval = node.contains_direct_eval();
        self.visit_function_like(
            &mut node.body,
            &mut node.parameters,
            &mut node.scopes,
            &mut None,
            false,
            contains_direct_eval,
        )
    }

    fn visit_block_mut(&mut self, node: &'ast mut Block) -> ControlFlow<Self::BreakTy> {
        let index = self.index;
        if let Some(scope) = &node.scope {
            if !scope.all_bindings_local() {
                self.index += 1;
            }
            scope.set_index(self.index);
        }
        self.visit_statement_list_mut(&mut node.statements)?;
        self.index = index;
        ControlFlow::Continue(())
    }

    fn visit_switch_mut(&mut self, node: &'ast mut Switch) -> ControlFlow<Self::BreakTy> {
        let index = self.index;
        self.visit_expression_mut(&mut node.val)?;
        if let Some(scope) = &node.scope {
            if !scope.all_bindings_local() {
                self.index += 1;
            }
            scope.set_index(self.index);
        }
        for case in &mut *node.cases {
            self.visit_case_mut(case)?;
        }
        self.index = index;
        ControlFlow::Continue(())
    }

    fn visit_with_mut(&mut self, node: &'ast mut With) -> ControlFlow<Self::BreakTy> {
        let index = self.index;
        self.visit_expression_mut(&mut node.expression)?;
        self.index += 1;
        node.scope.set_index(self.index);
        self.visit_statement_mut(&mut node.statement)?;
        self.index = index;
        ControlFlow::Continue(())
    }

    fn visit_catch_mut(&mut self, node: &'ast mut Catch) -> ControlFlow<Self::BreakTy> {
        let index = self.index;
        if !node.scope.all_bindings_local() {
            self.index += 1;
        }
        node.scope.set_index(self.index);
        if let Some(binding) = &mut node.parameter {
            self.visit_binding_mut(binding)?;
        }
        self.visit_block_mut(&mut node.block)?;
        self.index = index;
        ControlFlow::Continue(())
    }

    fn visit_for_loop_mut(&mut self, node: &'ast mut ForLoop) -> ControlFlow<Self::BreakTy> {
        let index = self.index;
        if let Some(ForLoopInitializer::Lexical(decl)) = &mut node.inner.init {
            if !decl.scope.all_bindings_local() {
                self.index += 1;
            }
            decl.scope.set_index(self.index);
        }
        if let Some(fli) = &mut node.inner.init {
            self.visit_for_loop_initializer_mut(fli)?;
        }
        if let Some(expr) = &mut node.inner.condition {
            self.visit_expression_mut(expr)?;
        }
        if let Some(expr) = &mut node.inner.final_expr {
            self.visit_expression_mut(expr)?;
        }
        self.visit_statement_mut(&mut node.inner.body)?;
        self.index = index;
        ControlFlow::Continue(())
    }

    fn visit_for_in_loop_mut(&mut self, node: &'ast mut ForInLoop) -> ControlFlow<Self::BreakTy> {
        {
            let index = self.index;
            if let Some(scope) = &node.target_scope {
                if !scope.all_bindings_local() {
                    self.index += 1;
                }
                scope.set_index(self.index);
            }
            self.visit_expression_mut(&mut node.target)?;
            self.index = index;
        }
        let index = self.index;
        if let Some(scope) = &node.scope {
            if !scope.all_bindings_local() {
                self.index += 1;
            }
            scope.set_index(self.index);
        }
        self.visit_iterable_loop_initializer_mut(&mut node.initializer)?;
        self.visit_statement_mut(&mut node.body)?;
        self.index = index;
        ControlFlow::Continue(())
    }

    fn visit_for_of_loop_mut(&mut self, node: &'ast mut ForOfLoop) -> ControlFlow<Self::BreakTy> {
        {
            let index = self.index;
            if let Some(scope) = &node.iterable_scope {
                if !scope.all_bindings_local() {
                    self.index += 1;
                }
                scope.set_index(self.index);
            }
            self.visit_expression_mut(&mut node.iterable)?;
            self.index = index;
        }
        let index = self.index;
        if let Some(scope) = &node.scope {
            if !scope.all_bindings_local() {
                self.index += 1;
            }
            scope.set_index(self.index);
        }
        self.visit_iterable_loop_initializer_mut(&mut node.init)?;
        self.visit_statement_mut(&mut node.body)?;
        self.index = index;
        ControlFlow::Continue(())
    }
}

impl ScopeIndexVisitor {
    fn visit_function_like(
        &mut self,
        body: &mut FunctionBody,
        parameters: &mut FormalParameterList,
        scopes: &mut FunctionScopes,
        name_scope: &mut Option<Scope>,
        arrow: bool,
        force_function_scope: bool,
    ) -> ControlFlow<()> {
        let index = self.index;
        if let Some(scope) = name_scope {
            if !scope.all_bindings_local() {
                self.index += 1;
            }
            scope.set_index(self.index);
        }

        if force_function_scope || !scopes.function_scope().all_bindings_local() {
            scopes.requires_function_scope = true;
            self.index += 1;
        } else if !arrow {
            assert!(scopes.function_scope().is_function());
            scopes.requires_function_scope = scopes.function_scope().escaped_this()
                || contains(parameters, ContainsSymbol::Super)
                || contains(body, ContainsSymbol::Super)
                || contains(parameters, ContainsSymbol::NewTarget)
                || contains(body, ContainsSymbol::NewTarget);
            self.index += u32::from(scopes.requires_function_scope);
        }

        scopes.function_scope.set_index(self.index);
        if let Some(scope) = &scopes.parameters_eval_scope {
            if !scope.all_bindings_local() {
                self.index += 1;
            }
            scope.set_index(self.index);
        }
        self.visit_formal_parameter_list_mut(parameters)?;
        if let Some(scope) = &scopes.parameters_scope {
            if !scope.all_bindings_local() {
                self.index += 1;
            }
            scope.set_index(self.index);
        }
        if let Some(scope) = &scopes.lexical_scope {
            if !scope.all_bindings_local() {
                self.index += 1;
            }
            scope.set_index(self.index);
        }
        self.visit_function_body_mut(body)?;
        self.index = index;
        ControlFlow::Continue(())
    }
}

/// `GlobalDeclarationInstantiation ( script, env )`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-globaldeclarationinstantiation
///
/// # Errors
///
/// - If a duplicate lexical declaration is found.
fn global_declaration_instantiation(
    script: &Script,
    env: &Scope,
    interner: &Interner,
) -> Result<(), &'static str> {
    // 1. Let lexNames be the LexicallyDeclaredNames of script.
    let lex_names = lexically_declared_names(script);

    // 2. Let varNames be the VarDeclaredNames of script.
    let var_names = var_declared_names(script);

    // 3. For each element name of lexNames, do
    for name in lex_names {
        let name = name.to_js_string(interner);

        // Note: Our implementation differs from the spec here.
        // a. If env.HasVarDeclaration(name) is true, throw a SyntaxError exception.
        // b. If env.HasLexicalDeclaration(name) is true, throw a SyntaxError exception.
        if env.has_binding(&name) {
            return Err("duplicate lexical declaration");
        }
    }

    // 4. For each element name of varNames, do
    for name in var_names {
        let name = name.to_js_string(interner);

        // a. If env.HasLexicalDeclaration(name) is true, throw a SyntaxError exception.
        if env.has_lex_binding(&name) {
            return Err("duplicate lexical declaration");
        }
    }

    // 13. Let lexDeclarations be the LexicallyScopedDeclarations of script.
    // 14. Let privateEnv be null.
    // 15. For each element d of lexDeclarations, do
    for statement in &**script.statements() {
        // a. NOTE: Lexically declared names are only instantiated here but not initialized.
        // b. For each element dn of the BoundNames of d, do
        //     i. If IsConstantDeclaration of d is true, then
        //         1. Perform ? env.CreateImmutableBinding(dn, true).
        //     ii. Else,
        //         1. Perform ? env.CreateMutableBinding(dn, false).
        if let StatementListItem::Declaration(declaration) = statement {
            match declaration.as_ref() {
                Declaration::ClassDeclaration(class) => {
                    for name in bound_names(class.as_ref()) {
                        let name = name.to_js_string(interner);
                        drop(env.create_mutable_binding(name, false));
                    }
                }
                Declaration::Lexical(LexicalDeclaration::Let(declaration)) => {
                    for name in bound_names(declaration) {
                        let name = name.to_js_string(interner);
                        drop(env.create_mutable_binding(name, false));
                    }
                }
                Declaration::Lexical(LexicalDeclaration::Const(declaration)) => {
                    for name in bound_names(declaration) {
                        let name = name.to_js_string(interner);
                        env.create_immutable_binding(name, true);
                    }
                }
                _ => {}
            }
        }
    }

    Ok(())
}

/// `BlockDeclarationInstantiation ( code, env )`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-blockdeclarationinstantiation
fn block_declaration_instantiation<'a, N>(
    block: &'a N,
    scope: Scope,
    interner: &Interner,
) -> Option<Scope>
where
    &'a N: Into<NodeRef<'a>>,
{
    let scope = Scope::new(scope, false);

    // 1. Let declarations be the LexicallyScopedDeclarations of code.
    let declarations = lexically_scoped_declarations(block);

    // 2. Let privateEnv be the running execution context's PrivateEnvironment.
    // Note: Private environments are currently handled differently.

    // 3. For each element d of declarations, do
    for d in &declarations {
        // i. If IsConstantDeclaration of d is true, then
        if let LexicallyScopedDeclaration::LexicalDeclaration(LexicalDeclaration::Const(d)) = d {
            // a. For each element dn of the BoundNames of d, do
            for dn in bound_names::<'_, VariableList>(d) {
                // 1. Perform ! env.CreateImmutableBinding(dn, true).
                let dn = dn.to_js_string(interner);
                scope.create_immutable_binding(dn, true);
            }
        }
        // ii. Else,
        else {
            // a. For each element dn of the BoundNames of d, do
            for dn in d.bound_names() {
                let dn = dn.to_js_string(interner);

                #[cfg(not(feature = "annex-b"))]
                // 1. Perform ! env.CreateMutableBinding(dn, false). NOTE: This step is replaced in section B.3.2.6.
                drop(scope.create_mutable_binding(dn, false));

                #[cfg(feature = "annex-b")]
                // 1. If ! env.HasBinding(dn) is false, then
                if !scope.has_binding(&dn) {
                    // a. Perform  ! env.CreateMutableBinding(dn, false).
                    drop(scope.create_mutable_binding(dn, false));
                }
            }
        }
    }

    if scope.num_bindings() > 0 {
        Some(scope)
    } else {
        None
    }
}

/// `FunctionDeclarationInstantiation ( func, argumentsList )`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-functiondeclarationinstantiation
fn function_declaration_instantiation(
    body: &FunctionBody,
    formals: &FormalParameterList,
    arrow: bool,
    strict: bool,
    function_scope: Scope,
    interner: &Interner,
) -> FunctionScopes {
    let mut scopes = FunctionScopes {
        function_scope,
        parameters_eval_scope: None,
        parameters_scope: None,
        lexical_scope: None,
        mapped_arguments_object: false,
        requires_function_scope: false,
    };

    // 1. Let calleeContext be the running execution context.
    // 2. Let code be func.[[ECMAScriptCode]].
    // 3. Let strict be func.[[Strict]].
    // 4. Let formals be func.[[FormalParameters]].

    // 5. Let parameterNames be the BoundNames of formals.
    let mut parameter_names = bound_names(formals);

    // 6. If parameterNames has any duplicate entries, let hasDuplicates be true. Otherwise, let hasDuplicates be false.
    // 7. Let simpleParameterList be IsSimpleParameterList of formals.

    // 8. Let hasParameterExpressions be ContainsExpression of formals.
    let has_parameter_expressions = formals.has_expressions();

    // 9. Let varNames be the VarDeclaredNames of code.
    let var_names = var_declared_names(body);

    // 10. Let varDeclarations be the VarScopedDeclarations of code.
    let var_declarations = var_scoped_declarations(body);

    // 11. Let lexicalNames be the LexicallyDeclaredNames of code.
    let lexical_names = lexically_declared_names(body);

    // 12. Let functionNames be a new empty List.
    let mut function_names = Vec::new();

    // 13. Let functionsToInitialize be a new empty List.
    // let mut functions_to_initialize = Vec::new();

    // 14. For each element d of varDeclarations, in reverse List order, do
    for declaration in var_declarations.iter().rev() {
        // a. If d is neither a VariableDeclaration nor a ForBinding nor a BindingIdentifier, then
        // a.i. Assert: d is either a FunctionDeclaration, a GeneratorDeclaration, an AsyncFunctionDeclaration, or an AsyncGeneratorDeclaration.
        // a.ii. Let fn be the sole element of the BoundNames of d.
        let name = match declaration {
            VarScopedDeclaration::FunctionDeclaration(f) => f.name(),
            VarScopedDeclaration::GeneratorDeclaration(f) => f.name(),
            VarScopedDeclaration::AsyncFunctionDeclaration(f) => f.name(),
            VarScopedDeclaration::AsyncGeneratorDeclaration(f) => f.name(),
            VarScopedDeclaration::VariableDeclaration(_) => continue,
        };

        // a.iii. If functionNames does not contain fn, then
        if !function_names.contains(&name.sym()) {
            // 1. Insert fn as the first element of functionNames.
            function_names.push(name.sym());
        }
    }

    function_names.reverse();

    // 15. Let argumentsObjectNeeded be true.
    let mut arguments_object_needed = true;

    let arguments = Sym::ARGUMENTS;

    // 16. If func.[[ThisMode]] is lexical, then
    // 17. Else if parameterNames contains "arguments", then
    if arrow || parameter_names.contains(&arguments) {
        // 16.a. NOTE: Arrow functions never have an arguments object.
        // 16.b. Set argumentsObjectNeeded to false.
        // 17.a. Set argumentsObjectNeeded to false.
        arguments_object_needed = false;
    }
    // 18. Else if hasParameterExpressions is false, then
    else if !has_parameter_expressions {
        //a. If functionNames contains "arguments" or lexicalNames contains "arguments", then
        if function_names.contains(&arguments) || lexical_names.contains(&arguments) {
            // i. Set argumentsObjectNeeded to false.
            arguments_object_needed = false;
        }
    }

    // 19. If strict is true or hasParameterExpressions is false, then
    let env = if strict || !has_parameter_expressions {
        // a. NOTE: Only a single Environment Record is needed for the parameters,
        //    since calls to eval in strict mode code cannot create new bindings which are visible outside of the eval.
        // b. Let env be the LexicalEnvironment of calleeContext.
        scopes.function_scope.clone()
    }
    // 20. Else,
    else {
        // a. NOTE: A separate Environment Record is needed to ensure that bindings created by
        //    direct eval calls in the formal parameter list are outside the environment where parameters are declared.
        // b. Let calleeEnv be the LexicalEnvironment of calleeContext.
        // c. Let env be NewDeclarativeEnvironment(calleeEnv).
        // d. Assert: The VariableEnvironment of calleeContext is calleeEnv.
        // e. Set the LexicalEnvironment of calleeContext to env.
        let scope = Scope::new(scopes.function_scope.clone(), false);
        scopes.parameters_eval_scope = Some(scope.clone());
        scope
    };

    // 22. If argumentsObjectNeeded is true, then
    //
    // NOTE(HalidOdat): Has been moved up, so "arguments" gets registered as
    //     the first binding in the environment with index 0.
    if arguments_object_needed {
        let arguments = arguments.to_js_string(interner);

        // c. If strict is true, then
        if strict {
            // i. Perform ! env.CreateImmutableBinding("arguments", false).
            // ii. NOTE: In strict mode code early errors prevent attempting to assign
            //           to this binding, so its mutability is not observable.
            env.create_immutable_binding(arguments.clone(), false);
        }
        // d. Else,
        else {
            // i. Perform ! env.CreateMutableBinding("arguments", false).
            drop(env.create_mutable_binding(arguments.clone(), false));
        }
    }

    // 21. For each String paramName of parameterNames, do
    for param_name in &parameter_names {
        let param_name = param_name.to_js_string(interner);

        // a. Let alreadyDeclared be ! env.HasBinding(paramName).
        let already_declared = env.has_binding(&param_name);

        // b. NOTE: Early errors ensure that duplicate parameter names can only occur in non-strict
        //    functions that do not have parameter default values or rest parameters.

        // c. If alreadyDeclared is false, then
        if !already_declared {
            // i. Perform ! env.CreateMutableBinding(paramName, false).
            drop(env.create_mutable_binding(param_name.clone(), false));

            // Note: In this case the function contains a mapped arguments object.
            // Because we do not track (yet) if the mapped arguments object escapes the function,
            // we have to assume that the binding might escape trough the arguments object.
            if arguments_object_needed && !strict && formals.is_simple() {
                scopes.mapped_arguments_object = true;
            }

            // Note: These steps are not necessary in our implementation.
            // ii. If hasDuplicates is true, then
            //     1. Perform ! env.InitializeBinding(paramName, undefined).
        }
    }

    // 22. If argumentsObjectNeeded is true, then
    if arguments_object_needed {
        // MOVED: a-e.
        //
        // NOTE(HalidOdat): Has been moved up, see comment above.

        // f. Let parameterBindings be the list-concatenation of parameterNames and « "arguments" ».
        parameter_names.push(arguments);
    }

    // 23. Else,
    //     a. Let parameterBindings be parameterNames.
    let parameter_bindings = parameter_names.clone();

    // 27. If hasParameterExpressions is false, then
    // 28. Else,
    #[allow(unused_variables, unused_mut)]
    let (mut instantiated_var_names, mut var_env) = if has_parameter_expressions {
        // a. NOTE: A separate Environment Record is needed to ensure that closures created by
        //          expressions in the formal parameter list do not have
        //          visibility of declarations in the function body.
        // b. Let varEnv be NewDeclarativeEnvironment(env).
        let var_env = Scope::new(env.clone(), false);
        scopes.parameters_scope = Some(var_env.clone());

        // c. Set the VariableEnvironment of calleeContext to varEnv.

        // d. Let instantiatedVarNames be a new empty List.
        let mut instantiated_var_names = Vec::new();

        // e. For each element n of varNames, do
        for n in var_names {
            // i. If instantiatedVarNames does not contain n, then
            if !instantiated_var_names.contains(&n) {
                // 1. Append n to instantiatedVarNames.
                instantiated_var_names.push(n);

                let n_string = n.to_js_string(interner);

                // 2. Perform ! varEnv.CreateMutableBinding(n, false).
                drop(var_env.create_mutable_binding(n_string, false));
            }
        }

        (instantiated_var_names, var_env)
    } else {
        // a. NOTE: Only a single Environment Record is needed for the parameters and top-level vars.
        // b. Let instantiatedVarNames be a copy of the List parameterBindings.
        let mut instantiated_var_names = parameter_bindings;

        // c. For each element n of varNames, do
        for n in var_names {
            // i. If instantiatedVarNames does not contain n, then
            if !instantiated_var_names.contains(&n) {
                // 1. Append n to instantiatedVarNames.
                instantiated_var_names.push(n);

                let n = n.to_js_string(interner);

                // 2. Perform ! env.CreateMutableBinding(n, false).
                // 3. Perform ! env.InitializeBinding(n, undefined).
                drop(env.create_mutable_binding(n, true));
            }
        }

        // d. Let varEnv be env.
        (instantiated_var_names, env)
    };

    // 29. NOTE: Annex B.3.2.1 adds additional steps at this point.
    // 29. If strict is false, then
    #[cfg(feature = "annex-b")]
    if !strict {
        // a. For each FunctionDeclaration f that is directly contained in the StatementList
        //    of a Block, CaseClause, or DefaultClause, do
        for f in annex_b_function_declarations_names(body) {
            // i. Let F be StringValue of the BindingIdentifier of f.
            // ii. If replacing the FunctionDeclaration f with a VariableStatement that has F
            //     as a BindingIdentifier would not produce any Early Errors
            //     for func and parameterNames does not contain F, then
            if !lexical_names.contains(&f) && !parameter_names.contains(&f) {
                // 1. NOTE: A var binding for F is only instantiated here if it is neither a
                //    VarDeclaredName, the name of a formal parameter, or another FunctionDeclaration.

                // 2. If initializedBindings does not contain F and F is not "arguments", then
                if !instantiated_var_names.contains(&f) && f != arguments {
                    let f_string = f.to_js_string(interner);

                    // a. Perform ! varEnv.CreateMutableBinding(F, false).
                    // b. Perform ! varEnv.InitializeBinding(F, undefined).
                    drop(var_env.create_mutable_binding(f_string, false));

                    // c. Append F to instantiatedVarNames.
                    instantiated_var_names.push(f);
                }
            }
        }
    }

    // 30. If strict is false, then
    // 31. Else,
    let lex_env = if strict {
        // a. Let lexEnv be varEnv.
        var_env
    } else {
        // a. Let lexEnv be NewDeclarativeEnvironment(varEnv).
        // b. NOTE: Non-strict functions use a separate Environment Record for top-level lexical
        //    declarations so that a direct eval can determine whether any var scoped declarations
        //    introduced by the eval code conflict with pre-existing top-level lexically scoped declarations.
        //    This is not needed for strict functions because a strict direct eval always
        //    places all declarations into a new Environment Record.
        let lex_env = Scope::new(var_env, false);
        scopes.lexical_scope = Some(lex_env.clone());
        lex_env
    };

    // 32. Set the LexicalEnvironment of calleeContext to lexEnv.
    // 33. Let lexDeclarations be the LexicallyScopedDeclarations of code.
    // 34. For each element d of lexDeclarations, do
    //     a. NOTE: A lexically declared name cannot be the same as a function/generator declaration,
    //        formal parameter, or a var name. Lexically declared names are only instantiated here but not initialized.
    //     b. For each element dn of the BoundNames of d, do
    //         i. If IsConstantDeclaration of d is true, then
    //             1. Perform ! lexEnv.CreateImmutableBinding(dn, true).
    //         ii. Else,
    //             1. Perform ! lexEnv.CreateMutableBinding(dn, false).
    for statement in body.statements() {
        if let StatementListItem::Declaration(declaration) = statement {
            match declaration.as_ref() {
                Declaration::ClassDeclaration(class) => {
                    for name in bound_names(class.as_ref()) {
                        let name = name.to_js_string(interner);
                        drop(lex_env.create_mutable_binding(name, false));
                    }
                }
                Declaration::Lexical(LexicalDeclaration::Let(declaration)) => {
                    for name in bound_names(declaration) {
                        let name = name.to_js_string(interner);
                        drop(lex_env.create_mutable_binding(name, false));
                    }
                }
                Declaration::Lexical(LexicalDeclaration::Const(declaration)) => {
                    for name in bound_names(declaration) {
                        let name = name.to_js_string(interner);
                        lex_env.create_immutable_binding(name, true);
                    }
                }
                _ => {}
            }
        }
    }

    // 35. Let privateEnv be the PrivateEnvironment of calleeContext.
    // 36. For each Parse Node f of functionsToInitialize, do

    if let Some(lexical_scope) = &scopes.lexical_scope
        && lexical_scope.num_bindings() == 0
    {
        scopes.lexical_scope = None;
    }

    // 37. Return unused.
    scopes
}

/// Abstract operation [`InitializeEnvironment ( )`][spec].
///
/// [spec]: https://tc39.es/ecma262/#sec-source-text-module-record-initialize-environment
fn module_instantiation(module: &Module, env: &Scope, interner: &Interner) {
    for entry in module.items().import_entries() {
        let local_name = entry.local_name().to_js_string(interner);
        env.create_immutable_binding(local_name, true);
    }
    let var_declarations = var_scoped_declarations(module);
    let mut declared_var_names = Vec::new();
    for var in var_declarations {
        for name in var.bound_names() {
            let name = name.to_js_string(interner);
            if !declared_var_names.contains(&name) {
                drop(env.create_mutable_binding(name.clone(), false));
                declared_var_names.push(name);
            }
        }
    }

    let lex_declarations = lexically_scoped_declarations(module);
    for declaration in lex_declarations {
        match declaration {
            LexicallyScopedDeclaration::FunctionDeclaration(f) => {
                let name = bound_names(f)[0].to_js_string(interner);
                drop(env.create_mutable_binding(name, false));
            }
            LexicallyScopedDeclaration::GeneratorDeclaration(g) => {
                let name = bound_names(g)[0].to_js_string(interner);
                drop(env.create_mutable_binding(name, false));
            }
            LexicallyScopedDeclaration::AsyncFunctionDeclaration(af) => {
                let name = bound_names(af)[0].to_js_string(interner);
                drop(env.create_mutable_binding(name, false));
            }
            LexicallyScopedDeclaration::AsyncGeneratorDeclaration(ag) => {
                let name = bound_names(ag)[0].to_js_string(interner);
                drop(env.create_mutable_binding(name, false));
            }
            LexicallyScopedDeclaration::ClassDeclaration(class) => {
                for name in bound_names(class) {
                    let name = name.to_js_string(interner);
                    drop(env.create_mutable_binding(name, false));
                }
            }
            LexicallyScopedDeclaration::LexicalDeclaration(LexicalDeclaration::Const(c)) => {
                for name in bound_names(c) {
                    let name = name.to_js_string(interner);
                    env.create_immutable_binding(name, true);
                }
            }
            LexicallyScopedDeclaration::LexicalDeclaration(LexicalDeclaration::Let(l)) => {
                for name in bound_names(l) {
                    let name = name.to_js_string(interner);
                    drop(env.create_mutable_binding(name, false));
                }
            }
            LexicallyScopedDeclaration::LexicalDeclaration(LexicalDeclaration::Using(u)) => {
                for name in bound_names(u) {
                    let name = name.to_js_string(interner);
                    drop(env.create_mutable_binding(name, false));
                }
            }
            LexicallyScopedDeclaration::LexicalDeclaration(LexicalDeclaration::AwaitUsing(au)) => {
                for name in bound_names(au) {
                    let name = name.to_js_string(interner);
                    drop(env.create_mutable_binding(name, false));
                }
            }
            LexicallyScopedDeclaration::AssignmentExpression(expr) => {
                for name in bound_names(expr) {
                    let name = name.to_js_string(interner);
                    drop(env.create_mutable_binding(name, false));
                }
            }
        }
    }
}

/// This struct isused to store bindings created during the declaration of an eval ast node.
#[derive(Debug, Default)]
pub struct EvalDeclarationBindings {
    /// New annexb function names created during the declaration of an eval ast node.
    pub new_annex_b_function_names: Vec<IdentifierReference>,

    /// New function names created during the declaration of an eval ast node.
    pub new_function_names: FxHashMap<Identifier, IdentifierReference>,

    /// Variable names declared during the declaration of an eval ast node.
    pub declared_var_names: Vec<IdentifierReference>,
}

/// `EvalDeclarationInstantiation ( body, varEnv, lexEnv, privateEnv, strict )`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-evaldeclarationinstantiation
///
/// # Errors
///
/// * Returns a syntax error if a duplicate lexical declaration is found.
/// * Returns a syntax error if a variable declaration in an eval function already exists as a lexical variable.
#[allow(clippy::missing_panics_doc)]
pub(crate) fn eval_declaration_instantiation_scope(
    body: &Script,
    strict: bool,
    var_env: &Scope,
    lex_env: &Scope,
    #[allow(unused_variables)] annex_b_function_names: &[Sym],
    interner: &Interner,
) -> Result<EvalDeclarationBindings, String> {
    let mut result = EvalDeclarationBindings::default();

    // 2. Let varDeclarations be the VarScopedDeclarations of body.
    let var_declarations = var_scoped_declarations(body);

    // 3. If strict is false, then
    if !strict {
        // 1. Let varNames be the VarDeclaredNames of body.
        let var_names = var_declared_names(body);

        // a. If varEnv is a Global Environment Record, then
        if var_env.is_global() {
            // i. For each element name of varNames, do
            for name in &var_names {
                let name = name.to_js_string(interner);

                // 1. If varEnv.HasLexicalDeclaration(name) is true, throw a SyntaxError exception.
                // 2. NOTE: eval will not create a global var declaration that would be shadowed by a global lexical declaration.
                if var_env.has_lex_binding(&name) {
                    return Err(format!(
                        "duplicate lexical declaration {}",
                        name.to_std_string_escaped()
                    ));
                }
            }
        }

        // b. Let thisEnv be lexEnv.
        let mut this_env = lex_env;

        // c. Assert: The following loop will terminate.
        // d. Repeat, while thisEnv is not varEnv,
        while this_env.scope_index() != var_env.scope_index() {
            // i. If thisEnv is not an Object Environment Record, then
            // 1. NOTE: The environment of with statements cannot contain any lexical
            //    declaration so it doesn't need to be checked for var/let hoisting conflicts.
            // 2. For each element name of varNames, do
            for name in &var_names {
                let name = interner.resolve_expect(*name).utf16().into();

                // a. If ! thisEnv.HasBinding(name) is true, then
                if this_env.has_binding(&name) {
                    // i. Throw a SyntaxError exception.
                    // ii. NOTE: Annex B.3.4 defines alternate semantics for the above step.
                    return Err(format!(
                        "variable declaration {} in eval function already exists as a lexical variable",
                        name.to_std_string_escaped()
                    ));
                }
                // b. NOTE: A direct eval will not hoist var declaration over a like-named lexical declaration.
            }

            // ii. Set thisEnv to thisEnv.[[OuterEnv]].
            if let Some(outer) = this_env.outer() {
                this_env = outer;
            } else {
                break;
            }
        }
    }

    // NOTE: These steps depend on the current environment state are done before bytecode compilation,
    //       in `eval_declaration_instantiation_context`.
    //
    // SKIP: 4. Let privateIdentifiers be a new empty List.
    // SKIP: 5. Let pointer be privateEnv.
    // SKIP: 6. Repeat, while pointer is not null,
    //           a. For each Private Name binding of pointer.[[Names]], do
    //               i. If privateIdentifiers does not contain binding.[[Description]],
    //                  append binding.[[Description]] to privateIdentifiers.
    //           b. Set pointer to pointer.[[OuterPrivateEnvironment]].
    // SKIP: 7. If AllPrivateIdentifiersValid of body with argument privateIdentifiers is false, throw a SyntaxError exception.

    // 8. Let functionsToInitialize be a new empty List.
    let mut functions_to_initialize = Vec::new();

    // 9. Let declaredFunctionNames be a new empty List.
    let mut declared_function_names = Vec::new();

    // 10. For each element d of varDeclarations, in reverse List order, do
    for declaration in var_declarations.iter().rev() {
        // a. If d is not either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
        // a.i. Assert: d is either a FunctionDeclaration, a GeneratorDeclaration, an AsyncFunctionDeclaration, or an AsyncGeneratorDeclaration.
        // a.ii. NOTE: If there are multiple function declarations for the same name, the last declaration is used.
        // a.iii. Let fn be the sole element of the BoundNames of d.
        let name = match &declaration {
            VarScopedDeclaration::FunctionDeclaration(f) => f.name(),
            VarScopedDeclaration::GeneratorDeclaration(f) => f.name(),
            VarScopedDeclaration::AsyncFunctionDeclaration(f) => f.name(),
            VarScopedDeclaration::AsyncGeneratorDeclaration(f) => f.name(),
            VarScopedDeclaration::VariableDeclaration(_) => continue,
        };
        // a.iv. If declaredFunctionNames does not contain fn, then
        if !declared_function_names.contains(&name.sym()) {
            // 1. If varEnv is a Global Environment Record, then
            // 2. Append fn to declaredFunctionNames.
            declared_function_names.push(name.sym());

            // 3. Insert d as the first element of functionsToInitialize.
            functions_to_initialize.push(declaration.clone());
        }
    }

    functions_to_initialize.reverse();

    // 11. NOTE: Annex B.3.2.3 adds additional steps at this point.
    // 11. If strict is false, then
    #[cfg(feature = "annex-b")]
    if !strict {
        // NOTE: This diviates from the specification, we split the first part of defining the annex-b names
        //       in `eval_declaration_instantiation_context`, because it depends on the context.
        if !var_env.is_global() {
            for name in annex_b_function_names {
                let f = name.to_js_string(interner);
                // i. Let bindingExists be ! varEnv.HasBinding(F).
                // ii. If bindingExists is false, then
                if !var_env.has_binding(&f) {
                    // i. Perform ! varEnv.CreateMutableBinding(F, true).
                    // ii. Perform ! varEnv.InitializeBinding(F, undefined).
                    let binding = var_env.create_mutable_binding(f, true);
                    result
                        .new_annex_b_function_names
                        .push(IdentifierReference::new(
                            binding,
                            !var_env.is_function(),
                            true,
                        ));
                }
            }
        }
    }

    // 12. Let declaredVarNames be a new empty List.
    let mut declared_var_names = Vec::new();

    // 13. For each element d of varDeclarations, do
    for declaration in var_declarations {
        // a. If d is either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
        let VarScopedDeclaration::VariableDeclaration(declaration) = declaration else {
            continue;
        };

        // a.i. For each String vn of the BoundNames of d, do
        for name in bound_names(&declaration) {
            // 1. If declaredFunctionNames does not contain vn, then
            if !declared_function_names.contains(&name) {
                // a. If varEnv is a Global Environment Record, then
                // b. If declaredVarNames does not contain vn, then
                if !declared_var_names.contains(&name) {
                    // i. Append vn to declaredVarNames.
                    declared_var_names.push(name);
                }
            }
        }
    }

    // 14. NOTE: No abnormal terminations occur after this algorithm step unless varEnv is a
    //           Global Environment Record and the global object is a Proxy exotic object.

    // 15. Let lexDeclarations be the LexicallyScopedDeclarations of body.
    // 16. For each element d of lexDeclarations, do
    for statement in &**body.statements() {
        // a. NOTE: Lexically declared names are only instantiated here but not initialized.
        // b. For each element dn of the BoundNames of d, do
        //     i. If IsConstantDeclaration of d is true, then
        //         1. Perform ? lexEnv.CreateImmutableBinding(dn, true).
        //     ii. Else,
        //         1. Perform ? lexEnv.CreateMutableBinding(dn, false).
        if let StatementListItem::Declaration(declaration) = statement {
            match declaration.as_ref() {
                Declaration::ClassDeclaration(class) => {
                    for name in bound_names(class.as_ref()) {
                        let name = name.to_js_string(interner);
                        drop(lex_env.create_mutable_binding(name, false));
                    }
                }
                Declaration::Lexical(LexicalDeclaration::Let(declaration)) => {
                    for name in bound_names(declaration) {
                        let name = name.to_js_string(interner);
                        drop(lex_env.create_mutable_binding(name, false));
                    }
                }
                Declaration::Lexical(LexicalDeclaration::Const(declaration)) => {
                    for name in bound_names(declaration) {
                        let name = name.to_js_string(interner);
                        lex_env.create_immutable_binding(name, true);
                    }
                }
                _ => {}
            }
        }
    }

    // 17. For each Parse Node f of functionsToInitialize, do
    for function in functions_to_initialize {
        // a. Let fn be the sole element of the BoundNames of f.
        let name = match &function {
            VarScopedDeclaration::FunctionDeclaration(f) => f.name(),
            VarScopedDeclaration::GeneratorDeclaration(f) => f.name(),
            VarScopedDeclaration::AsyncFunctionDeclaration(f) => f.name(),
            VarScopedDeclaration::AsyncGeneratorDeclaration(f) => f.name(),
            VarScopedDeclaration::VariableDeclaration(_) => {
                continue;
            }
        };

        // c. If varEnv is a Global Environment Record, then
        // d. Else,
        if !var_env.is_global() {
            // b. Let fo be InstantiateFunctionObject of f with arguments lexEnv and privateEnv.
            let n = name.to_js_string(interner);

            // i. Let bindingExists be ! varEnv.HasBinding(fn).
            let binding_exists = var_env.has_binding(&n);

            // ii. If bindingExists is false, then
            // iii. Else,
            if binding_exists {
                // 1. Perform ! varEnv.SetMutableBinding(fn, fo, false).
                let binding = var_env.set_mutable_binding(n).expect("must not fail");
                result.new_function_names.insert(
                    name,
                    IdentifierReference::new(binding.locator(), !var_env.is_function(), true),
                );
            } else {
                // 1. NOTE: The following invocation cannot return an abrupt completion because of the validation preceding step 14.
                // 2. Perform ! varEnv.CreateMutableBinding(fn, true).
                // 3. Perform ! varEnv.InitializeBinding(fn, fo).
                let binding = var_env.create_mutable_binding(n, !strict);
                result.new_function_names.insert(
                    name,
                    IdentifierReference::new(binding, !var_env.is_function(), true),
                );
            }
        }
    }

    // 18. For each String vn of declaredVarNames, do
    for name in declared_var_names {
        // a. If varEnv is a Global Environment Record, then
        // b. Else,
        if !var_env.is_global() {
            let name = name.to_js_string(interner);

            // i. Let bindingExists be ! varEnv.HasBinding(vn).
            let binding_exists = var_env.has_binding(&name);

            // ii. If bindingExists is false, then
            if !binding_exists {
                // 1. NOTE: The following invocation cannot return an abrupt completion because of the validation preceding step 14.
                // 2. Perform ! varEnv.CreateMutableBinding(vn, true).
                // 3. Perform ! varEnv.InitializeBinding(vn, undefined).
                drop(var_env.create_mutable_binding(name.clone(), true));
            }

            let binding = var_env
                .get_binding_reference(&name)
                .expect("binding must exist");
            result.declared_var_names.push(IdentifierReference::new(
                binding.locator(),
                !var_env.is_function(),
                true,
            ));
        }
    }

    // 19. Return unused.
    Ok(result)
}
