//! ECMAScript Abstract Syntax Tree visitors.
//!
//! This module contains visitors which can be used to inspect or modify AST nodes. This allows for
//! fine-grained manipulation of ASTs for analysis, rewriting, or instrumentation.

use std::ops::ControlFlow;

use crate::{
    Module, ModuleItem, ModuleItemList, Script, StatementList, StatementListItem,
    declaration::{
        Binding, Declaration, ExportDeclaration, ExportSpecifier, ImportAttribute,
        ImportDeclaration, ImportKind, ImportSpecifier, LexicalDeclaration, ModuleSpecifier,
        ReExportKind, VarDeclaration, Variable, VariableList,
    },
    expression::{
        Await, Call, Expression, Identifier, ImportCall, ImportMeta, New, NewTarget, Optional,
        OptionalOperation, OptionalOperationKind, Parenthesized, RegExpLiteral, Spread, SuperCall,
        TaggedTemplate, This, Yield,
        access::{
            PrivatePropertyAccess, PropertyAccess, PropertyAccessField, SimplePropertyAccess,
            SuperPropertyAccess,
        },
        literal::{
            ArrayLiteral, Literal, ObjectLiteral, ObjectMethodDefinition, PropertyDefinition,
            TemplateElement, TemplateLiteral,
        },
        operator::{
            Binary, BinaryInPrivate, Conditional, Unary, Update,
            assign::{Assign, AssignTarget},
        },
    },
    function::{
        ArrowFunction, AsyncArrowFunction, AsyncFunctionDeclaration, AsyncFunctionExpression,
        AsyncGeneratorDeclaration, AsyncGeneratorExpression, ClassDeclaration, ClassElement,
        ClassExpression, FormalParameter, FormalParameterList, FunctionBody, FunctionDeclaration,
        FunctionExpression, GeneratorDeclaration, GeneratorExpression, PrivateName,
    },
    pattern::{ArrayPattern, ArrayPatternElement, ObjectPattern, ObjectPatternElement, Pattern},
    property::PropertyName,
    statement::{
        Block, Case, Catch, Finally, If, Labelled, LabelledItem, Return, Statement, Switch, Throw,
        Try, With,
        iteration::{
            Break, Continue, DoWhileLoop, ForInLoop, ForLoop, ForLoopInitializer, ForOfLoop,
            IterableLoopInitializer, WhileLoop,
        },
    },
};
use boa_interner::Sym;

/// Creates the default visit function implementation for a particular type
macro_rules! define_visit {
    ($fn_name:ident, $type_name:ident) => {
        #[doc = concat!("Visits a `", stringify!($type_name), "` with this visitor")]
        fn $fn_name(&mut self, node: &'ast $type_name) -> ControlFlow<Self::BreakTy> {
            node.visit_with(self)
        }
    };
}

/// Creates the default mutable visit function implementation for a particular type
macro_rules! define_visit_mut {
    ($fn_name:ident, $type_name:ident) => {
        #[doc = concat!("Visits a `", stringify!($type_name), "` with this visitor, mutably")]
        fn $fn_name(&mut self, node: &'ast mut $type_name) -> ControlFlow<Self::BreakTy> {
            node.visit_with_mut(self)
        }
    };
}

/// Generates the `NodeRef` and `NodeMutRef` enums from a list of variants.
macro_rules! node_ref {
    (
        $(
            $Variant:ident
        ),*
        $(,)?
    ) => {
        /// A reference to a node visitable by a [`Visitor`].
        #[derive(Debug, Clone, Copy)]
        #[allow(missing_docs)]
        pub enum NodeRef<'a> {
            $(
                $Variant(&'a $Variant)
            ),*
        }

        $(
            impl<'a> From<&'a $Variant> for NodeRef<'a> {
                fn from(node: &'a $Variant) -> NodeRef<'a> {
                    Self::$Variant(node)
                }
            }
        )*

        /// A mutable reference to a node visitable by a [`VisitorMut`].
        #[derive(Debug)]
        #[allow(missing_docs)]
        pub enum NodeRefMut<'a> {
            $(
                $Variant(&'a mut $Variant)
            ),*
        }

        $(
            impl<'a> From<&'a mut $Variant> for NodeRefMut<'a> {
                fn from(node: &'a mut $Variant) -> NodeRefMut<'a> {
                    Self::$Variant(node)
                }
            }
        )*
    }
}

node_ref! {
    Script,
    Module,
    FunctionBody,
    StatementList,
    StatementListItem,
    Statement,
    Declaration,
    FunctionExpression,
    FunctionDeclaration,
    GeneratorExpression,
    GeneratorDeclaration,
    AsyncFunctionExpression,
    AsyncFunctionDeclaration,
    AsyncGeneratorExpression,
    AsyncGeneratorDeclaration,
    ClassExpression,
    ClassDeclaration,
    LexicalDeclaration,
    Block,
    VarDeclaration,
    Expression,
    If,
    DoWhileLoop,
    WhileLoop,
    ForLoop,
    ForInLoop,
    ForOfLoop,
    Switch,
    Continue,
    Break,
    Return,
    Labelled,
    With,
    Throw,
    Try,
    This,
    NewTarget,
    ImportMeta,
    Identifier,
    FormalParameterList,
    ClassElement,
    PrivateName,
    VariableList,
    Variable,
    Binding,
    Pattern,
    Literal,
    RegExpLiteral,
    ArrayLiteral,
    ObjectLiteral,
    Spread,
    ArrowFunction,
    AsyncArrowFunction,
    TemplateLiteral,
    PropertyAccess,
    New,
    Call,
    SuperCall,
    ImportCall,
    Optional,
    TaggedTemplate,
    Assign,
    Unary,
    Update,
    Binary,
    BinaryInPrivate,
    Conditional,
    Await,
    Yield,
    Parenthesized,
    ForLoopInitializer,
    IterableLoopInitializer,
    Case,
    Sym,
    LabelledItem,
    Catch,
    Finally,
    FormalParameter,
    PropertyName,
    ObjectMethodDefinition,
    ObjectPattern,
    ArrayPattern,
    PropertyDefinition,
    TemplateElement,
    SimplePropertyAccess,
    PrivatePropertyAccess,
    SuperPropertyAccess,
    OptionalOperation,
    AssignTarget,
    ObjectPatternElement,
    ArrayPatternElement,
    PropertyAccessField,
    OptionalOperationKind,
    ModuleItemList,
    ModuleItem,
    ModuleSpecifier,
    ImportAttribute,
    ImportKind,
    ImportDeclaration,
    ImportSpecifier,
    ReExportKind,
    ExportDeclaration,
    ExportSpecifier,
}

/// Represents an AST visitor.
///
/// This implementation is based largely on [chalk](https://github.com/rust-lang/chalk/blob/23d39c90ceb9242fbd4c43e9368e813e7c2179f7/chalk-ir/src/visit.rs)'s
/// visitor pattern.
pub trait Visitor<'ast>: Sized {
    /// Type which will be propagated from the visitor if completing early.
    type BreakTy;

    define_visit!(visit_script, Script);
    define_visit!(visit_module, Module);
    define_visit!(visit_function_body, FunctionBody);
    define_visit!(visit_statement_list, StatementList);
    define_visit!(visit_statement_list_item, StatementListItem);
    define_visit!(visit_statement, Statement);
    define_visit!(visit_declaration, Declaration);
    define_visit!(visit_function_expression, FunctionExpression);
    define_visit!(visit_function_declaration, FunctionDeclaration);
    define_visit!(visit_generator_expression, GeneratorExpression);
    define_visit!(visit_generator_declaration, GeneratorDeclaration);
    define_visit!(visit_async_function_expression, AsyncFunctionExpression);
    define_visit!(visit_async_function_declaration, AsyncFunctionDeclaration);
    define_visit!(visit_async_generator_expression, AsyncGeneratorExpression);
    define_visit!(visit_async_generator_declaration, AsyncGeneratorDeclaration);
    define_visit!(visit_class_expression, ClassExpression);
    define_visit!(visit_class_declaration, ClassDeclaration);
    define_visit!(visit_lexical_declaration, LexicalDeclaration);
    define_visit!(visit_block, Block);
    define_visit!(visit_var_declaration, VarDeclaration);
    define_visit!(visit_expression, Expression);
    define_visit!(visit_if, If);
    define_visit!(visit_do_while_loop, DoWhileLoop);
    define_visit!(visit_while_loop, WhileLoop);
    define_visit!(visit_for_loop, ForLoop);
    define_visit!(visit_for_in_loop, ForInLoop);
    define_visit!(visit_for_of_loop, ForOfLoop);
    define_visit!(visit_switch, Switch);
    define_visit!(visit_continue, Continue);
    define_visit!(visit_break, Break);
    define_visit!(visit_return, Return);
    define_visit!(visit_labelled, Labelled);
    define_visit!(visit_throw, Throw);
    define_visit!(visit_try, Try);
    define_visit!(visit_with, With);
    define_visit!(visit_this, This);
    define_visit!(visit_identifier, Identifier);
    define_visit!(visit_formal_parameter_list, FormalParameterList);
    define_visit!(visit_class_element, ClassElement);
    define_visit!(visit_private_name, PrivateName);
    define_visit!(visit_variable_list, VariableList);
    define_visit!(visit_variable, Variable);
    define_visit!(visit_binding, Binding);
    define_visit!(visit_pattern, Pattern);
    define_visit!(visit_literal, Literal);
    define_visit!(visit_reg_exp_literal, RegExpLiteral);
    define_visit!(visit_array_literal, ArrayLiteral);
    define_visit!(visit_object_literal, ObjectLiteral);
    define_visit!(visit_spread, Spread);
    define_visit!(visit_arrow_function, ArrowFunction);
    define_visit!(visit_async_arrow_function, AsyncArrowFunction);
    define_visit!(visit_template_literal, TemplateLiteral);
    define_visit!(visit_property_access, PropertyAccess);
    define_visit!(visit_new, New);
    define_visit!(visit_call, Call);
    define_visit!(visit_super_call, SuperCall);
    define_visit!(visit_import_call, ImportCall);
    define_visit!(visit_optional, Optional);
    define_visit!(visit_tagged_template, TaggedTemplate);
    define_visit!(visit_assign, Assign);
    define_visit!(visit_unary, Unary);
    define_visit!(visit_update, Update);
    define_visit!(visit_binary, Binary);
    define_visit!(visit_binary_in_private, BinaryInPrivate);
    define_visit!(visit_conditional, Conditional);
    define_visit!(visit_await, Await);
    define_visit!(visit_yield, Yield);
    define_visit!(visit_parenthesized, Parenthesized);
    define_visit!(visit_new_target, NewTarget);
    define_visit!(visit_import_meta, ImportMeta);
    define_visit!(visit_for_loop_initializer, ForLoopInitializer);
    define_visit!(visit_iterable_loop_initializer, IterableLoopInitializer);
    define_visit!(visit_case, Case);
    define_visit!(visit_sym, Sym);
    define_visit!(visit_labelled_item, LabelledItem);
    define_visit!(visit_catch, Catch);
    define_visit!(visit_finally, Finally);
    define_visit!(visit_formal_parameter, FormalParameter);
    define_visit!(visit_property_name, PropertyName);
    define_visit!(visit_object_method_definition, ObjectMethodDefinition);
    define_visit!(visit_object_pattern, ObjectPattern);
    define_visit!(visit_array_pattern, ArrayPattern);
    define_visit!(visit_property_definition, PropertyDefinition);
    define_visit!(visit_template_element, TemplateElement);
    define_visit!(visit_simple_property_access, SimplePropertyAccess);
    define_visit!(visit_private_property_access, PrivatePropertyAccess);
    define_visit!(visit_super_property_access, SuperPropertyAccess);
    define_visit!(visit_optional_operation, OptionalOperation);
    define_visit!(visit_assign_target, AssignTarget);
    define_visit!(visit_object_pattern_element, ObjectPatternElement);
    define_visit!(visit_array_pattern_element, ArrayPatternElement);
    define_visit!(visit_property_access_field, PropertyAccessField);
    define_visit!(visit_optional_operation_kind, OptionalOperationKind);
    define_visit!(visit_module_item_list, ModuleItemList);
    define_visit!(visit_module_item, ModuleItem);
    define_visit!(visit_module_specifier, ModuleSpecifier);
    define_visit!(visit_import_attribute, ImportAttribute);
    define_visit!(visit_import_kind, ImportKind);
    define_visit!(visit_import_declaration, ImportDeclaration);
    define_visit!(visit_import_specifier, ImportSpecifier);
    define_visit!(visit_re_export_kind, ReExportKind);
    define_visit!(visit_export_declaration, ExportDeclaration);
    define_visit!(visit_export_specifier, ExportSpecifier);

    /// Generic entry point for a node that is visitable by a `Visitor`.
    ///
    /// This is usually used for generic functions that need to visit an unnamed AST node.
    fn visit<N: Into<NodeRef<'ast>>>(&mut self, node: N) -> ControlFlow<Self::BreakTy> {
        let node = node.into();
        match node {
            NodeRef::Script(n) => self.visit_script(n),
            NodeRef::Module(n) => self.visit_module(n),
            NodeRef::FunctionBody(n) => self.visit_function_body(n),
            NodeRef::StatementList(n) => self.visit_statement_list(n),
            NodeRef::StatementListItem(n) => self.visit_statement_list_item(n),
            NodeRef::Statement(n) => self.visit_statement(n),
            NodeRef::Declaration(n) => self.visit_declaration(n),
            NodeRef::FunctionExpression(n) => self.visit_function_expression(n),
            NodeRef::FunctionDeclaration(n) => self.visit_function_declaration(n),
            NodeRef::GeneratorExpression(n) => self.visit_generator_expression(n),
            NodeRef::GeneratorDeclaration(n) => self.visit_generator_declaration(n),
            NodeRef::AsyncFunctionExpression(n) => self.visit_async_function_expression(n),
            NodeRef::AsyncFunctionDeclaration(n) => self.visit_async_function_declaration(n),
            NodeRef::AsyncGeneratorExpression(n) => self.visit_async_generator_expression(n),
            NodeRef::AsyncGeneratorDeclaration(n) => self.visit_async_generator_declaration(n),
            NodeRef::ClassExpression(n) => self.visit_class_expression(n),
            NodeRef::ClassDeclaration(n) => self.visit_class_declaration(n),
            NodeRef::LexicalDeclaration(n) => self.visit_lexical_declaration(n),
            NodeRef::Block(n) => self.visit_block(n),
            NodeRef::VarDeclaration(n) => self.visit_var_declaration(n),
            NodeRef::Expression(n) => self.visit_expression(n),
            NodeRef::If(n) => self.visit_if(n),
            NodeRef::DoWhileLoop(n) => self.visit_do_while_loop(n),
            NodeRef::WhileLoop(n) => self.visit_while_loop(n),
            NodeRef::ForLoop(n) => self.visit_for_loop(n),
            NodeRef::ForInLoop(n) => self.visit_for_in_loop(n),
            NodeRef::ForOfLoop(n) => self.visit_for_of_loop(n),
            NodeRef::Switch(n) => self.visit_switch(n),
            NodeRef::Continue(n) => self.visit_continue(n),
            NodeRef::Break(n) => self.visit_break(n),
            NodeRef::Return(n) => self.visit_return(n),
            NodeRef::Labelled(n) => self.visit_labelled(n),
            NodeRef::With(n) => self.visit_with(n),
            NodeRef::Throw(n) => self.visit_throw(n),
            NodeRef::Try(n) => self.visit_try(n),
            NodeRef::This(n) => self.visit_this(n),
            NodeRef::NewTarget(n) => self.visit_new_target(n),
            NodeRef::ImportMeta(n) => self.visit_import_meta(n),
            NodeRef::Identifier(n) => self.visit_identifier(n),
            NodeRef::FormalParameterList(n) => self.visit_formal_parameter_list(n),
            NodeRef::ClassElement(n) => self.visit_class_element(n),
            NodeRef::PrivateName(n) => self.visit_private_name(n),
            NodeRef::VariableList(n) => self.visit_variable_list(n),
            NodeRef::Variable(n) => self.visit_variable(n),
            NodeRef::Binding(n) => self.visit_binding(n),
            NodeRef::Pattern(n) => self.visit_pattern(n),
            NodeRef::Literal(n) => self.visit_literal(n),
            NodeRef::RegExpLiteral(n) => self.visit_reg_exp_literal(n),
            NodeRef::ArrayLiteral(n) => self.visit_array_literal(n),
            NodeRef::ObjectLiteral(n) => self.visit_object_literal(n),
            NodeRef::Spread(n) => self.visit_spread(n),
            NodeRef::ArrowFunction(n) => self.visit_arrow_function(n),
            NodeRef::AsyncArrowFunction(n) => self.visit_async_arrow_function(n),
            NodeRef::TemplateLiteral(n) => self.visit_template_literal(n),
            NodeRef::PropertyAccess(n) => self.visit_property_access(n),
            NodeRef::New(n) => self.visit_new(n),
            NodeRef::Call(n) => self.visit_call(n),
            NodeRef::SuperCall(n) => self.visit_super_call(n),
            NodeRef::ImportCall(n) => self.visit_import_call(n),
            NodeRef::Optional(n) => self.visit_optional(n),
            NodeRef::TaggedTemplate(n) => self.visit_tagged_template(n),
            NodeRef::Assign(n) => self.visit_assign(n),
            NodeRef::Unary(n) => self.visit_unary(n),
            NodeRef::Update(n) => self.visit_update(n),
            NodeRef::Binary(n) => self.visit_binary(n),
            NodeRef::BinaryInPrivate(n) => self.visit_binary_in_private(n),
            NodeRef::Conditional(n) => self.visit_conditional(n),
            NodeRef::Await(n) => self.visit_await(n),
            NodeRef::Yield(n) => self.visit_yield(n),
            NodeRef::Parenthesized(n) => self.visit_parenthesized(n),
            NodeRef::ForLoopInitializer(n) => self.visit_for_loop_initializer(n),
            NodeRef::IterableLoopInitializer(n) => self.visit_iterable_loop_initializer(n),
            NodeRef::Case(n) => self.visit_case(n),
            NodeRef::Sym(n) => self.visit_sym(n),
            NodeRef::LabelledItem(n) => self.visit_labelled_item(n),
            NodeRef::Catch(n) => self.visit_catch(n),
            NodeRef::Finally(n) => self.visit_finally(n),
            NodeRef::FormalParameter(n) => self.visit_formal_parameter(n),
            NodeRef::PropertyName(n) => self.visit_property_name(n),
            NodeRef::ObjectMethodDefinition(n) => self.visit_object_method_definition(n),
            NodeRef::ObjectPattern(n) => self.visit_object_pattern(n),
            NodeRef::ArrayPattern(n) => self.visit_array_pattern(n),
            NodeRef::PropertyDefinition(n) => self.visit_property_definition(n),
            NodeRef::TemplateElement(n) => self.visit_template_element(n),
            NodeRef::SimplePropertyAccess(n) => self.visit_simple_property_access(n),
            NodeRef::PrivatePropertyAccess(n) => self.visit_private_property_access(n),
            NodeRef::SuperPropertyAccess(n) => self.visit_super_property_access(n),
            NodeRef::OptionalOperation(n) => self.visit_optional_operation(n),
            NodeRef::AssignTarget(n) => self.visit_assign_target(n),
            NodeRef::ObjectPatternElement(n) => self.visit_object_pattern_element(n),
            NodeRef::ArrayPatternElement(n) => self.visit_array_pattern_element(n),
            NodeRef::PropertyAccessField(n) => self.visit_property_access_field(n),
            NodeRef::OptionalOperationKind(n) => self.visit_optional_operation_kind(n),
            NodeRef::ModuleItemList(n) => self.visit_module_item_list(n),
            NodeRef::ModuleItem(n) => self.visit_module_item(n),
            NodeRef::ModuleSpecifier(n) => self.visit_module_specifier(n),
            NodeRef::ImportAttribute(n) => self.visit_import_attribute(n),
            NodeRef::ImportKind(n) => self.visit_import_kind(n),
            NodeRef::ImportDeclaration(n) => self.visit_import_declaration(n),
            NodeRef::ImportSpecifier(n) => self.visit_import_specifier(n),
            NodeRef::ReExportKind(n) => self.visit_re_export_kind(n),
            NodeRef::ExportDeclaration(n) => self.visit_export_declaration(n),
            NodeRef::ExportSpecifier(n) => self.visit_export_specifier(n),
        }
    }
}

/// Represents an AST visitor which can modify AST content.
///
/// This implementation is based largely on [chalk](https://github.com/rust-lang/chalk/blob/23d39c90ceb9242fbd4c43e9368e813e7c2179f7/chalk-ir/src/visit.rs)'s
/// visitor pattern.
pub trait VisitorMut<'ast>: Sized {
    /// Type which will be propagated from the visitor if completing early.
    type BreakTy;

    define_visit_mut!(visit_script_mut, Script);
    define_visit_mut!(visit_module_mut, Module);
    define_visit_mut!(visit_function_body_mut, FunctionBody);
    define_visit_mut!(visit_statement_list_mut, StatementList);
    define_visit_mut!(visit_statement_list_item_mut, StatementListItem);
    define_visit_mut!(visit_statement_mut, Statement);
    define_visit_mut!(visit_declaration_mut, Declaration);
    define_visit_mut!(visit_function_expression_mut, FunctionExpression);
    define_visit_mut!(visit_function_declaration_mut, FunctionDeclaration);
    define_visit_mut!(visit_generator_expression_mut, GeneratorExpression);
    define_visit_mut!(visit_generator_declaration_mut, GeneratorDeclaration);
    define_visit_mut!(visit_async_function_expression_mut, AsyncFunctionExpression);
    define_visit_mut!(
        visit_async_function_declaration_mut,
        AsyncFunctionDeclaration
    );
    define_visit_mut!(
        visit_async_generator_expression_mut,
        AsyncGeneratorExpression
    );
    define_visit_mut!(
        visit_async_generator_declaration_mut,
        AsyncGeneratorDeclaration
    );
    define_visit_mut!(visit_class_expression_mut, ClassExpression);
    define_visit_mut!(visit_class_declaration_mut, ClassDeclaration);
    define_visit_mut!(visit_lexical_declaration_mut, LexicalDeclaration);
    define_visit_mut!(visit_block_mut, Block);
    define_visit_mut!(visit_var_declaration_mut, VarDeclaration);
    define_visit_mut!(visit_expression_mut, Expression);
    define_visit_mut!(visit_if_mut, If);
    define_visit_mut!(visit_do_while_loop_mut, DoWhileLoop);
    define_visit_mut!(visit_while_loop_mut, WhileLoop);
    define_visit_mut!(visit_for_loop_mut, ForLoop);
    define_visit_mut!(visit_for_in_loop_mut, ForInLoop);
    define_visit_mut!(visit_for_of_loop_mut, ForOfLoop);
    define_visit_mut!(visit_switch_mut, Switch);
    define_visit_mut!(visit_continue_mut, Continue);
    define_visit_mut!(visit_break_mut, Break);
    define_visit_mut!(visit_return_mut, Return);
    define_visit_mut!(visit_labelled_mut, Labelled);
    define_visit_mut!(visit_throw_mut, Throw);
    define_visit_mut!(visit_try_mut, Try);
    define_visit_mut!(visit_with_mut, With);
    define_visit_mut!(visit_this_mut, This);
    define_visit_mut!(visit_identifier_mut, Identifier);
    define_visit_mut!(visit_formal_parameter_list_mut, FormalParameterList);
    define_visit_mut!(visit_class_element_mut, ClassElement);
    define_visit_mut!(visit_private_name_mut, PrivateName);
    define_visit_mut!(visit_variable_list_mut, VariableList);
    define_visit_mut!(visit_variable_mut, Variable);
    define_visit_mut!(visit_binding_mut, Binding);
    define_visit_mut!(visit_pattern_mut, Pattern);
    define_visit_mut!(visit_literal_mut, Literal);
    define_visit_mut!(visit_reg_exp_literal_mut, RegExpLiteral);
    define_visit_mut!(visit_array_literal_mut, ArrayLiteral);
    define_visit_mut!(visit_object_literal_mut, ObjectLiteral);
    define_visit_mut!(visit_spread_mut, Spread);
    define_visit_mut!(visit_arrow_function_mut, ArrowFunction);
    define_visit_mut!(visit_async_arrow_function_mut, AsyncArrowFunction);
    define_visit_mut!(visit_template_literal_mut, TemplateLiteral);
    define_visit_mut!(visit_property_access_mut, PropertyAccess);
    define_visit_mut!(visit_new_mut, New);
    define_visit_mut!(visit_call_mut, Call);
    define_visit_mut!(visit_super_call_mut, SuperCall);
    define_visit_mut!(visit_import_call_mut, ImportCall);
    define_visit_mut!(visit_optional_mut, Optional);
    define_visit_mut!(visit_tagged_template_mut, TaggedTemplate);
    define_visit_mut!(visit_assign_mut, Assign);
    define_visit_mut!(visit_unary_mut, Unary);
    define_visit_mut!(visit_update_mut, Update);
    define_visit_mut!(visit_binary_mut, Binary);
    define_visit_mut!(visit_binary_in_private_mut, BinaryInPrivate);
    define_visit_mut!(visit_conditional_mut, Conditional);
    define_visit_mut!(visit_await_mut, Await);
    define_visit_mut!(visit_yield_mut, Yield);
    define_visit_mut!(visit_parenthesized_mut, Parenthesized);
    define_visit_mut!(visit_new_target_mut, NewTarget);
    define_visit_mut!(visit_import_meta_mut, ImportMeta);
    define_visit_mut!(visit_for_loop_initializer_mut, ForLoopInitializer);
    define_visit_mut!(visit_iterable_loop_initializer_mut, IterableLoopInitializer);
    define_visit_mut!(visit_case_mut, Case);
    define_visit_mut!(visit_sym_mut, Sym);
    define_visit_mut!(visit_labelled_item_mut, LabelledItem);
    define_visit_mut!(visit_catch_mut, Catch);
    define_visit_mut!(visit_finally_mut, Finally);
    define_visit_mut!(visit_formal_parameter_mut, FormalParameter);
    define_visit_mut!(visit_property_name_mut, PropertyName);
    define_visit_mut!(visit_object_method_definition_mut, ObjectMethodDefinition);
    define_visit_mut!(visit_object_pattern_mut, ObjectPattern);
    define_visit_mut!(visit_array_pattern_mut, ArrayPattern);
    define_visit_mut!(visit_property_definition_mut, PropertyDefinition);
    define_visit_mut!(visit_template_element_mut, TemplateElement);
    define_visit_mut!(visit_simple_property_access_mut, SimplePropertyAccess);
    define_visit_mut!(visit_private_property_access_mut, PrivatePropertyAccess);
    define_visit_mut!(visit_super_property_access_mut, SuperPropertyAccess);
    define_visit_mut!(visit_optional_operation_mut, OptionalOperation);
    define_visit_mut!(visit_assign_target_mut, AssignTarget);
    define_visit_mut!(visit_object_pattern_element_mut, ObjectPatternElement);
    define_visit_mut!(visit_array_pattern_element_mut, ArrayPatternElement);
    define_visit_mut!(visit_property_access_field_mut, PropertyAccessField);
    define_visit_mut!(visit_optional_operation_kind_mut, OptionalOperationKind);
    define_visit_mut!(visit_module_item_list_mut, ModuleItemList);
    define_visit_mut!(visit_module_item_mut, ModuleItem);
    define_visit_mut!(visit_module_specifier_mut, ModuleSpecifier);
    define_visit_mut!(visit_import_attribute_mut, ImportAttribute);
    define_visit_mut!(visit_import_kind_mut, ImportKind);
    define_visit_mut!(visit_import_declaration_mut, ImportDeclaration);
    define_visit_mut!(visit_import_specifier_mut, ImportSpecifier);
    define_visit_mut!(visit_re_export_kind_mut, ReExportKind);
    define_visit_mut!(visit_export_declaration_mut, ExportDeclaration);
    define_visit_mut!(visit_export_specifier_mut, ExportSpecifier);

    /// Generic entry point for a node that is visitable by a `VisitorMut`.
    ///
    /// This is usually used for generic functions that need to visit an unnamed AST node.
    fn visit<N: Into<NodeRefMut<'ast>>>(&mut self, node: N) -> ControlFlow<Self::BreakTy> {
        let node = node.into();
        match node {
            NodeRefMut::Script(n) => self.visit_script_mut(n),
            NodeRefMut::Module(n) => self.visit_module_mut(n),
            NodeRefMut::FunctionBody(n) => self.visit_function_body_mut(n),
            NodeRefMut::StatementList(n) => self.visit_statement_list_mut(n),
            NodeRefMut::StatementListItem(n) => self.visit_statement_list_item_mut(n),
            NodeRefMut::Statement(n) => self.visit_statement_mut(n),
            NodeRefMut::Declaration(n) => self.visit_declaration_mut(n),
            NodeRefMut::FunctionExpression(n) => self.visit_function_expression_mut(n),
            NodeRefMut::FunctionDeclaration(n) => self.visit_function_declaration_mut(n),
            NodeRefMut::GeneratorExpression(n) => self.visit_generator_expression_mut(n),
            NodeRefMut::GeneratorDeclaration(n) => self.visit_generator_declaration_mut(n),
            NodeRefMut::AsyncFunctionExpression(n) => self.visit_async_function_expression_mut(n),
            NodeRefMut::AsyncFunctionDeclaration(n) => self.visit_async_function_declaration_mut(n),
            NodeRefMut::AsyncGeneratorExpression(n) => self.visit_async_generator_expression_mut(n),
            NodeRefMut::AsyncGeneratorDeclaration(n) => {
                self.visit_async_generator_declaration_mut(n)
            }
            NodeRefMut::ClassExpression(n) => self.visit_class_expression_mut(n),
            NodeRefMut::ClassDeclaration(n) => self.visit_class_declaration_mut(n),
            NodeRefMut::LexicalDeclaration(n) => self.visit_lexical_declaration_mut(n),
            NodeRefMut::Block(n) => self.visit_block_mut(n),
            NodeRefMut::VarDeclaration(n) => self.visit_var_declaration_mut(n),
            NodeRefMut::Expression(n) => self.visit_expression_mut(n),
            NodeRefMut::If(n) => self.visit_if_mut(n),
            NodeRefMut::DoWhileLoop(n) => self.visit_do_while_loop_mut(n),
            NodeRefMut::WhileLoop(n) => self.visit_while_loop_mut(n),
            NodeRefMut::ForLoop(n) => self.visit_for_loop_mut(n),
            NodeRefMut::ForInLoop(n) => self.visit_for_in_loop_mut(n),
            NodeRefMut::ForOfLoop(n) => self.visit_for_of_loop_mut(n),
            NodeRefMut::Switch(n) => self.visit_switch_mut(n),
            NodeRefMut::Continue(n) => self.visit_continue_mut(n),
            NodeRefMut::Break(n) => self.visit_break_mut(n),
            NodeRefMut::Return(n) => self.visit_return_mut(n),
            NodeRefMut::Labelled(n) => self.visit_labelled_mut(n),
            NodeRefMut::With(n) => self.visit_with_mut(n),
            NodeRefMut::Throw(n) => self.visit_throw_mut(n),
            NodeRefMut::Try(n) => self.visit_try_mut(n),
            NodeRefMut::This(n) => self.visit_this_mut(n),
            NodeRefMut::NewTarget(n) => self.visit_new_target_mut(n),
            NodeRefMut::ImportMeta(n) => self.visit_import_meta_mut(n),
            NodeRefMut::Identifier(n) => self.visit_identifier_mut(n),
            NodeRefMut::FormalParameterList(n) => self.visit_formal_parameter_list_mut(n),
            NodeRefMut::ClassElement(n) => self.visit_class_element_mut(n),
            NodeRefMut::PrivateName(n) => self.visit_private_name_mut(n),
            NodeRefMut::VariableList(n) => self.visit_variable_list_mut(n),
            NodeRefMut::Variable(n) => self.visit_variable_mut(n),
            NodeRefMut::Binding(n) => self.visit_binding_mut(n),
            NodeRefMut::Pattern(n) => self.visit_pattern_mut(n),
            NodeRefMut::Literal(n) => self.visit_literal_mut(n),
            NodeRefMut::RegExpLiteral(n) => self.visit_reg_exp_literal_mut(n),
            NodeRefMut::ArrayLiteral(n) => self.visit_array_literal_mut(n),
            NodeRefMut::ObjectLiteral(n) => self.visit_object_literal_mut(n),
            NodeRefMut::Spread(n) => self.visit_spread_mut(n),
            NodeRefMut::ArrowFunction(n) => self.visit_arrow_function_mut(n),
            NodeRefMut::AsyncArrowFunction(n) => self.visit_async_arrow_function_mut(n),
            NodeRefMut::TemplateLiteral(n) => self.visit_template_literal_mut(n),
            NodeRefMut::PropertyAccess(n) => self.visit_property_access_mut(n),
            NodeRefMut::New(n) => self.visit_new_mut(n),
            NodeRefMut::Call(n) => self.visit_call_mut(n),
            NodeRefMut::SuperCall(n) => self.visit_super_call_mut(n),
            NodeRefMut::ImportCall(n) => self.visit_import_call_mut(n),
            NodeRefMut::Optional(n) => self.visit_optional_mut(n),
            NodeRefMut::TaggedTemplate(n) => self.visit_tagged_template_mut(n),
            NodeRefMut::Assign(n) => self.visit_assign_mut(n),
            NodeRefMut::Unary(n) => self.visit_unary_mut(n),
            NodeRefMut::Update(n) => self.visit_update_mut(n),
            NodeRefMut::Binary(n) => self.visit_binary_mut(n),
            NodeRefMut::BinaryInPrivate(n) => self.visit_binary_in_private_mut(n),
            NodeRefMut::Conditional(n) => self.visit_conditional_mut(n),
            NodeRefMut::Await(n) => self.visit_await_mut(n),
            NodeRefMut::Yield(n) => self.visit_yield_mut(n),
            NodeRefMut::Parenthesized(n) => self.visit_parenthesized_mut(n),
            NodeRefMut::ForLoopInitializer(n) => self.visit_for_loop_initializer_mut(n),
            NodeRefMut::IterableLoopInitializer(n) => self.visit_iterable_loop_initializer_mut(n),
            NodeRefMut::Case(n) => self.visit_case_mut(n),
            NodeRefMut::Sym(n) => self.visit_sym_mut(n),
            NodeRefMut::LabelledItem(n) => self.visit_labelled_item_mut(n),
            NodeRefMut::Catch(n) => self.visit_catch_mut(n),
            NodeRefMut::Finally(n) => self.visit_finally_mut(n),
            NodeRefMut::FormalParameter(n) => self.visit_formal_parameter_mut(n),
            NodeRefMut::PropertyName(n) => self.visit_property_name_mut(n),
            NodeRefMut::ObjectMethodDefinition(n) => self.visit_object_method_definition_mut(n),
            NodeRefMut::ObjectPattern(n) => self.visit_object_pattern_mut(n),
            NodeRefMut::ArrayPattern(n) => self.visit_array_pattern_mut(n),
            NodeRefMut::PropertyDefinition(n) => self.visit_property_definition_mut(n),
            NodeRefMut::TemplateElement(n) => self.visit_template_element_mut(n),
            NodeRefMut::SimplePropertyAccess(n) => self.visit_simple_property_access_mut(n),
            NodeRefMut::PrivatePropertyAccess(n) => self.visit_private_property_access_mut(n),
            NodeRefMut::SuperPropertyAccess(n) => self.visit_super_property_access_mut(n),
            NodeRefMut::OptionalOperation(n) => self.visit_optional_operation_mut(n),
            NodeRefMut::AssignTarget(n) => self.visit_assign_target_mut(n),
            NodeRefMut::ObjectPatternElement(n) => self.visit_object_pattern_element_mut(n),
            NodeRefMut::ArrayPatternElement(n) => self.visit_array_pattern_element_mut(n),
            NodeRefMut::PropertyAccessField(n) => self.visit_property_access_field_mut(n),
            NodeRefMut::OptionalOperationKind(n) => self.visit_optional_operation_kind_mut(n),
            NodeRefMut::ModuleItemList(n) => self.visit_module_item_list_mut(n),
            NodeRefMut::ModuleItem(n) => self.visit_module_item_mut(n),
            NodeRefMut::ModuleSpecifier(n) => self.visit_module_specifier_mut(n),
            NodeRefMut::ImportAttribute(n) => self.visit_import_attribute_mut(n),
            NodeRefMut::ImportKind(n) => self.visit_import_kind_mut(n),
            NodeRefMut::ImportDeclaration(n) => self.visit_import_declaration_mut(n),
            NodeRefMut::ImportSpecifier(n) => self.visit_import_specifier_mut(n),
            NodeRefMut::ReExportKind(n) => self.visit_re_export_kind_mut(n),
            NodeRefMut::ExportDeclaration(n) => self.visit_export_declaration_mut(n),
            NodeRefMut::ExportSpecifier(n) => self.visit_export_specifier_mut(n),
        }
    }
}

/// Denotes that a type may be visited, providing a method which allows a visitor to traverse its
/// private fields.
pub trait VisitWith {
    /// Visit this node with the provided visitor.
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>;

    /// Visit this node with the provided visitor mutably, allowing the visitor to modify private
    /// fields.
    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>;
}

// implementation for Sym as it is out-of-crate
impl VisitWith for Sym {
    fn visit_with<'a, V>(&'a self, _visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, _visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        ControlFlow::Continue(())
    }
}
