use super::{BindingAccessOpcode, ByteCompiler, Literal, Register, ToJsString};
use crate::{
    js_string,
    vm::{CodeBlock, CodeBlockFlags, opcode::BindingOpcode},
};
use boa_ast::{
    Expression,
    expression::Identifier,
    function::{
        ClassDeclaration, ClassElement, ClassElementName, ClassExpression, FormalParameterList,
        FunctionExpression,
    },
    property::{MethodDefinitionKind, PropertyName},
    scope::Scope,
};
use boa_gc::Gc;
use boa_interner::Sym;
use thin_vec::ThinVec;

// Static class elements that are initialized at a later time in the class creation.
enum StaticElement {
    // A static class block with it's function code.
    StaticBlock(Gc<CodeBlock>),

    // A static class field with it's function code, an optional name index and the information if the function is an anonymous function.
    StaticField {
        code: Gc<CodeBlock>,
        name_index: StaticFieldName,
        is_anonymous_function: bool,
    },
}

enum StaticFieldName {
    PrivateName(u32),
    Index(u32),
    Register(Register),
}

/// Describes the complete specification of a class.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct ClassSpec<'a> {
    name: Option<Identifier>,
    super_ref: Option<&'a Expression>,
    constructor: Option<&'a FunctionExpression>,
    elements: &'a [ClassElement],
    has_binding_identifier: bool,
    name_scope: Option<&'a Scope>,
}

impl<'a> From<&'a ClassDeclaration> for ClassSpec<'a> {
    fn from(class: &'a ClassDeclaration) -> Self {
        Self {
            name: Some(class.name()),
            super_ref: class.super_ref(),
            constructor: class.constructor(),
            elements: class.elements(),
            has_binding_identifier: true,
            name_scope: Some(class.name_scope()),
        }
    }
}

impl<'a> From<&'a ClassExpression> for ClassSpec<'a> {
    fn from(class: &'a ClassExpression) -> Self {
        Self {
            name: class.name(),
            super_ref: class.super_ref(),
            constructor: class.constructor(),
            elements: class.elements(),
            has_binding_identifier: class.name().is_some(),
            name_scope: class.name_scope(),
        }
    }
}

impl ByteCompiler<'_> {
    /// This function compiles a class declaration or expression.
    ///
    /// The compilation of a class declaration and expression is mostly equal.
    /// A class declaration binds the resulting class object to it's identifier.
    /// A class expression leaves the resulting class object on the stack for following operations.
    pub(crate) fn compile_class(&mut self, class: ClassSpec<'_>, dst: Option<&Register>) {
        // 11.2.2 Strict Mode Code - <https://tc39.es/ecma262/#sec-strict-mode-code>
        //  - All parts of a ClassDeclaration or a ClassExpression are strict mode code.
        let strict = self.strict();
        self.code_block_flags |= CodeBlockFlags::STRICT;

        let class_name = class
            .name
            .map_or(Sym::EMPTY_STRING, Identifier::sym)
            .to_js_string(self.interner());

        let outer_scope = self.push_declarative_scope(class.name_scope);

        // The new span is not the same as the parent `ByteCompiler` have.
        let spanned_source_text = self.spanned_source_text.clone_only_source();
        let mut compiler = ByteCompiler::new(
            class_name.clone(),
            true,
            self.json_parse,
            self.variable_scope.clone(),
            self.lexical_scope.clone(),
            false,
            false,
            self.interner,
            self.in_with,
            spanned_source_text,
            self.source_path.clone(),
        );

        compiler.code_block_flags |= CodeBlockFlags::IS_CLASS_CONSTRUCTOR;

        let value = compiler.register_allocator.alloc();
        if let Some(expr) = &class.constructor {
            compiler.code_block_flags |= CodeBlockFlags::HAS_FUNCTION_SCOPE;
            let _ = compiler.push_scope(expr.scopes().function_scope());

            compiler.length = expr.parameters().length();
            compiler.params = expr.parameters().clone();
            compiler.parameter_scope = expr.scopes().parameter_scope();

            compiler.function_declaration_instantiation(
                expr.body(),
                expr.parameters(),
                false,
                true,
                false,
                expr.scopes(),
            );

            {
                let mut compiler = compiler.position_guard(expr);
                compiler.compile_statement_list(expr.body().statement_list(), false, false);
            }

            compiler.bytecode.emit_store_undefined(value.variable());
        } else if class.super_ref.is_some() {
            // We push an empty, unused function scope since the compiler expects a function scope.
            compiler.code_block_flags |= CodeBlockFlags::HAS_FUNCTION_SCOPE;
            let _ = compiler.push_scope(&Scope::new(compiler.lexical_scope.clone(), true));
            compiler.bytecode.emit_super_call_derived();
            compiler.pop_into_register(&value);
            compiler.bytecode.emit_bind_this_value(value.variable());
        } else {
            // We push an empty, unused function scope since the compiler expects a function scope.
            compiler.code_block_flags |= CodeBlockFlags::HAS_FUNCTION_SCOPE;
            let _ = compiler.push_scope(&Scope::new(compiler.lexical_scope.clone(), true));
            compiler.bytecode.emit_store_undefined(value.variable());
        }
        compiler.bytecode.emit_set_accumulator(value.variable());
        compiler.register_allocator.dealloc(value);

        // 17. If ClassHeritageopt is present, set F.[[ConstructorKind]] to derived.
        compiler.code_block_flags.set(
            CodeBlockFlags::IS_DERIVED_CONSTRUCTOR,
            class.super_ref.is_some(),
        );

        let code = Gc::new(compiler.finish());
        let index = self.push_function_to_constants(code);

        let class_register = self.register_allocator.alloc();
        self.emit_get_function(&class_register, index);

        let prototype_register = self.register_allocator.alloc();

        if let Some(node) = class.super_ref {
            self.compile_expr(node, &prototype_register);
            self.bytecode.emit_store_class_prototype(
                prototype_register.variable(),
                class_register.variable(),
                prototype_register.variable(),
            );
        } else {
            self.bytecode
                .emit_store_undefined(prototype_register.variable());
        }

        let proto_register = self.register_allocator.alloc();

        self.bytecode.emit_set_class_prototype(
            proto_register.variable(),
            prototype_register.variable(),
            class_register.variable(),
        );
        self.register_allocator.dealloc(prototype_register);

        let mut name_indices = ThinVec::new();
        for element in class.elements {
            match element {
                ClassElement::MethodDefinition(m) => {
                    if let ClassElementName::PrivateName(name) = m.name() {
                        let index = self.get_or_insert_private_name(*name);
                        name_indices.push(index);
                    }
                }
                ClassElement::PrivateFieldDefinition(field)
                | ClassElement::PrivateStaticFieldDefinition(field) => {
                    let index = self.get_or_insert_private_name(*field.name());
                    name_indices.push(index);
                }
                _ => {}
            }
        }
        self.bytecode
            .emit_push_private_environment(class_register.variable(), name_indices);

        let mut static_elements = Vec::new();

        if let Some(scope) = class.name_scope {
            let binding = scope.get_identifier_reference(class_name.clone());
            let index = self.insert_binding(binding);
            self.emit_binding_access(
                BindingAccessOpcode::PutLexicalValue,
                &index,
                &class_register,
            );
        }

        for element in class.elements {
            match element {
                ClassElement::MethodDefinition(m) => match m.name() {
                    ClassElementName::PropertyName(PropertyName::Literal(name)) => {
                        let index = self.get_or_insert_name(name.sym());
                        let method = self.method(m.into());

                        let object_register = if m.is_static() {
                            &class_register
                        } else {
                            &proto_register
                        };

                        match (m.is_static(), m.kind()) {
                            (true, MethodDefinitionKind::Get) => {
                                self.bytecode.emit_define_class_static_getter_by_name(
                                    method.variable(),
                                    object_register.variable(),
                                    index.into(),
                                );
                            }
                            (true, MethodDefinitionKind::Set) => {
                                self.bytecode.emit_define_class_static_setter_by_name(
                                    method.variable(),
                                    object_register.variable(),
                                    index.into(),
                                );
                            }
                            (true, _) => {
                                self.bytecode.emit_define_class_static_method_by_name(
                                    method.variable(),
                                    object_register.variable(),
                                    index.into(),
                                );
                            }
                            (false, MethodDefinitionKind::Get) => {
                                self.bytecode.emit_define_class_getter_by_name(
                                    method.variable(),
                                    object_register.variable(),
                                    index.into(),
                                );
                            }
                            (false, MethodDefinitionKind::Set) => {
                                self.bytecode.emit_define_class_setter_by_name(
                                    method.variable(),
                                    object_register.variable(),
                                    index.into(),
                                );
                            }
                            (false, _) => {
                                self.bytecode.emit_define_class_method_by_name(
                                    method.variable(),
                                    object_register.variable(),
                                    index.into(),
                                );
                            }
                        }

                        self.register_allocator.dealloc(method);
                    }
                    ClassElementName::PropertyName(PropertyName::Computed(name)) => {
                        let key = self.register_allocator.alloc();
                        self.compile_expr(name, &key);
                        self.bytecode
                            .emit_to_property_key(key.variable(), key.variable());
                        let method = self.method(m.into());
                        let object_register = if m.is_static() {
                            &class_register
                        } else {
                            &proto_register
                        };

                        match (m.is_static(), m.kind()) {
                            (true, MethodDefinitionKind::Get) => {
                                self.bytecode.emit_define_class_static_getter_by_value(
                                    method.variable(),
                                    key.variable(),
                                    object_register.variable(),
                                );
                            }
                            (true, MethodDefinitionKind::Set) => {
                                self.bytecode.emit_define_class_static_setter_by_value(
                                    method.variable(),
                                    key.variable(),
                                    object_register.variable(),
                                );
                            }
                            (true, _) => {
                                self.bytecode.emit_define_class_static_method_by_value(
                                    method.variable(),
                                    key.variable(),
                                    object_register.variable(),
                                );
                            }
                            (false, MethodDefinitionKind::Get) => {
                                self.bytecode.emit_define_class_getter_by_value(
                                    method.variable(),
                                    key.variable(),
                                    object_register.variable(),
                                );
                            }
                            (false, MethodDefinitionKind::Set) => {
                                self.bytecode.emit_define_class_setter_by_value(
                                    method.variable(),
                                    key.variable(),
                                    object_register.variable(),
                                );
                            }
                            (false, _) => {
                                self.bytecode.emit_define_class_method_by_value(
                                    method.variable(),
                                    key.variable(),
                                    object_register.variable(),
                                );
                            }
                        }

                        self.register_allocator.dealloc(method);
                        self.register_allocator.dealloc(key);
                    }
                    ClassElementName::PrivateName(name) => {
                        let index = self.get_or_insert_private_name(*name);
                        let method = self.method(m.into());
                        match (m.is_static(), m.kind()) {
                            (true, MethodDefinitionKind::Get) => {
                                self.bytecode.emit_set_private_getter(
                                    class_register.variable(),
                                    method.variable(),
                                    index.into(),
                                );
                            }
                            (true, MethodDefinitionKind::Set) => {
                                self.bytecode.emit_set_private_setter(
                                    class_register.variable(),
                                    method.variable(),
                                    index.into(),
                                );
                            }
                            (true, _) => {
                                self.bytecode.emit_set_private_method(
                                    class_register.variable(),
                                    method.variable(),
                                    index.into(),
                                );
                            }
                            (false, MethodDefinitionKind::Get) => {
                                self.bytecode.emit_push_class_private_getter(
                                    class_register.variable(),
                                    method.variable(),
                                    index.into(),
                                );
                            }
                            (false, MethodDefinitionKind::Set) => {
                                self.bytecode.emit_push_class_private_setter(
                                    class_register.variable(),
                                    method.variable(),
                                    index.into(),
                                );
                            }
                            (false, _) => {
                                self.bytecode.emit_push_class_private_method(
                                    class_register.variable(),
                                    proto_register.variable(),
                                    method.variable(),
                                    index.into(),
                                );
                            }
                        }
                        self.register_allocator.dealloc(method);
                    }
                },
                ClassElement::FieldDefinition(field) => {
                    let name = self.register_allocator.alloc();
                    match field.name() {
                        PropertyName::Literal(ident) => {
                            self.emit_store_literal(
                                Literal::String(
                                    self.interner()
                                        .resolve_expect(ident.sym())
                                        .into_common(false),
                                ),
                                &name,
                            );
                        }
                        PropertyName::Computed(expr) => {
                            self.compile_expr(expr, &name);
                        }
                    }
                    let mut field_compiler = ByteCompiler::new(
                        js_string!(),
                        true,
                        self.json_parse,
                        self.variable_scope.clone(),
                        self.lexical_scope.clone(),
                        false,
                        false,
                        self.interner,
                        self.in_with,
                        self.spanned_source_text.clone_only_source(),
                        self.source_path.clone(),
                    );

                    // Function environment
                    field_compiler.code_block_flags |= CodeBlockFlags::HAS_FUNCTION_SCOPE;
                    let _ = field_compiler.push_scope(field.scope());
                    let value = field_compiler.register_allocator.alloc();
                    let is_anonymous_function = if let Some(node) = &field.initializer() {
                        field_compiler.compile_expr(node, &value);
                        node.is_anonymous_function_definition()
                    } else {
                        field_compiler
                            .bytecode
                            .emit_store_undefined(value.variable());
                        false
                    };

                    field_compiler
                        .bytecode
                        .emit_set_accumulator(value.variable());
                    field_compiler.register_allocator.dealloc(value);

                    field_compiler.code_block_flags |= CodeBlockFlags::IN_CLASS_FIELD_INITIALIZER;

                    let code = Gc::new(field_compiler.finish());
                    let index = self.push_function_to_constants(code);

                    let dst = self.register_allocator.alloc();
                    self.emit_get_function(&dst, index);
                    self.bytecode.emit_push_class_field(
                        class_register.variable(),
                        name.variable(),
                        dst.variable(),
                        is_anonymous_function.into(),
                    );
                    self.register_allocator.dealloc(name);
                    self.register_allocator.dealloc(dst);
                }
                ClassElement::PrivateFieldDefinition(field) => {
                    let name_index = self.get_or_insert_private_name(*field.name());
                    let mut field_compiler = ByteCompiler::new(
                        class_name.clone(),
                        true,
                        self.json_parse,
                        self.variable_scope.clone(),
                        self.lexical_scope.clone(),
                        false,
                        false,
                        self.interner,
                        self.in_with,
                        self.spanned_source_text.clone_only_source(),
                        self.source_path.clone(),
                    );
                    field_compiler.code_block_flags |= CodeBlockFlags::HAS_FUNCTION_SCOPE;
                    let _ = field_compiler.push_scope(field.scope());
                    let value = field_compiler.register_allocator.alloc();
                    if let Some(node) = field.initializer() {
                        field_compiler.compile_expr(node, &value);
                    } else {
                        field_compiler
                            .bytecode
                            .emit_store_undefined(value.variable());
                    }
                    field_compiler
                        .bytecode
                        .emit_set_accumulator(value.variable());
                    field_compiler.register_allocator.dealloc(value);

                    field_compiler.code_block_flags |= CodeBlockFlags::IN_CLASS_FIELD_INITIALIZER;

                    let code = Gc::new(field_compiler.finish());
                    let index = self.push_function_to_constants(code);
                    let dst = self.register_allocator.alloc();
                    self.emit_get_function(&dst, index);
                    self.bytecode.emit_push_class_field_private(
                        class_register.variable(),
                        dst.variable(),
                        name_index.into(),
                    );
                    self.register_allocator.dealloc(dst);
                }
                ClassElement::StaticFieldDefinition(field) => {
                    let name_index = match field.name() {
                        PropertyName::Literal(name) => {
                            StaticFieldName::Index(self.get_or_insert_name(name.sym()))
                        }
                        PropertyName::Computed(name) => {
                            let name_register = self.register_allocator.alloc();
                            self.compile_expr(name, &name_register);
                            StaticFieldName::Register(name_register)
                        }
                    };
                    let mut field_compiler = ByteCompiler::new(
                        class_name.clone(),
                        true,
                        self.json_parse,
                        self.variable_scope.clone(),
                        self.lexical_scope.clone(),
                        false,
                        false,
                        self.interner,
                        self.in_with,
                        self.spanned_source_text.clone_only_source(),
                        self.source_path.clone(),
                    );
                    field_compiler.code_block_flags |= CodeBlockFlags::HAS_FUNCTION_SCOPE;
                    let _ = field_compiler.push_scope(field.scope());
                    let value = field_compiler.register_allocator.alloc();
                    let is_anonymous_function = if let Some(node) = &field.initializer() {
                        field_compiler.compile_expr(node, &value);
                        node.is_anonymous_function_definition()
                    } else {
                        field_compiler
                            .bytecode
                            .emit_store_undefined(value.variable());
                        false
                    };

                    field_compiler
                        .bytecode
                        .emit_set_accumulator(value.variable());
                    field_compiler.register_allocator.dealloc(value);

                    field_compiler.code_block_flags |= CodeBlockFlags::IN_CLASS_FIELD_INITIALIZER;

                    let code = field_compiler.finish();
                    let code = Gc::new(code);

                    static_elements.push(StaticElement::StaticField {
                        code,
                        name_index,
                        is_anonymous_function,
                    });
                }
                ClassElement::PrivateStaticFieldDefinition(field) => {
                    let name_index = self.get_or_insert_private_name(*field.name());
                    let mut field_compiler = ByteCompiler::new(
                        class_name.clone(),
                        true,
                        self.json_parse,
                        self.variable_scope.clone(),
                        self.lexical_scope.clone(),
                        false,
                        false,
                        self.interner,
                        self.in_with,
                        self.spanned_source_text.clone_only_source(),
                        self.source_path.clone(),
                    );
                    field_compiler.code_block_flags |= CodeBlockFlags::HAS_FUNCTION_SCOPE;
                    let _ = field_compiler.push_scope(field.scope());
                    let value = field_compiler.register_allocator.alloc();
                    let is_anonymous_function = if let Some(node) = &field.initializer() {
                        field_compiler.compile_expr(node, &value);
                        node.is_anonymous_function_definition()
                    } else {
                        field_compiler
                            .bytecode
                            .emit_store_undefined(value.variable());
                        false
                    };

                    field_compiler
                        .bytecode
                        .emit_set_accumulator(value.variable());
                    field_compiler.register_allocator.dealloc(value);

                    field_compiler.code_block_flags |= CodeBlockFlags::IN_CLASS_FIELD_INITIALIZER;

                    let code = field_compiler.finish();
                    let code = Gc::new(code);

                    static_elements.push(StaticElement::StaticField {
                        code,
                        name_index: StaticFieldName::PrivateName(name_index),
                        is_anonymous_function,
                    });
                }
                ClassElement::StaticBlock(block) => {
                    let mut compiler = ByteCompiler::new(
                        Sym::EMPTY_STRING.to_js_string(self.interner()),
                        true,
                        false,
                        self.variable_scope.clone(),
                        self.lexical_scope.clone(),
                        false,
                        false,
                        self.interner,
                        self.in_with,
                        self.spanned_source_text.clone_only_source(),
                        self.source_path.clone(),
                    );
                    compiler.code_block_flags |= CodeBlockFlags::HAS_FUNCTION_SCOPE;
                    let _ = compiler.push_scope(block.scopes().function_scope());

                    compiler.function_declaration_instantiation(
                        block.statements(),
                        &FormalParameterList::default(),
                        false,
                        true,
                        false,
                        block.scopes(),
                    );

                    {
                        let mut compiler = compiler.position_guard(block.statements());
                        compiler.compile_statement_list(
                            block.statements().statement_list(),
                            false,
                            false,
                        );
                    }

                    let code = Gc::new(compiler.finish());
                    static_elements.push(StaticElement::StaticBlock(code));
                }
            }
        }

        for element in static_elements {
            match element {
                StaticElement::StaticBlock(code) => {
                    let index = self.push_function_to_constants(code);
                    let function = self.register_allocator.alloc();
                    self.emit_get_function(&function, index);
                    self.bytecode
                        .emit_set_home_object(function.variable(), class_register.variable());
                    self.push_from_register(&class_register);
                    self.push_from_register(&function);
                    self.register_allocator.dealloc(function);
                    self.bytecode.emit_call(0u32.into());
                    self.bytecode.emit_pop();
                }
                StaticElement::StaticField {
                    code,
                    name_index,
                    is_anonymous_function,
                } => {
                    let index = self.push_function_to_constants(code);
                    let function = self.register_allocator.alloc();
                    self.emit_get_function(&function, index);
                    self.bytecode
                        .emit_set_home_object(function.variable(), class_register.variable());
                    self.push_from_register(&class_register);
                    self.push_from_register(&function);
                    self.register_allocator.dealloc(function);
                    self.bytecode.emit_call(0u32.into());
                    let value = self.register_allocator.alloc();
                    self.pop_into_register(&value);
                    match name_index {
                        StaticFieldName::PrivateName(name) => {
                            self.bytecode.emit_define_private_field(
                                class_register.variable(),
                                value.variable(),
                                name.into(),
                            );
                        }
                        StaticFieldName::Index(name) => {
                            self.bytecode.emit_define_own_property_by_name(
                                class_register.variable(),
                                value.variable(),
                                name.into(),
                            );
                        }
                        StaticFieldName::Register(key) => {
                            if is_anonymous_function {
                                self.bytecode
                                    .emit_to_property_key(key.variable(), key.variable());
                                self.bytecode.emit_set_function_name(
                                    value.variable(),
                                    key.variable(),
                                    0u32.into(),
                                );
                            }
                            self.bytecode.emit_define_own_property_by_value(
                                value.variable(),
                                key.variable(),
                                class_register.variable(),
                            );
                            self.register_allocator.dealloc(key);
                        }
                    }

                    self.register_allocator.dealloc(value);
                }
            }
        }

        self.register_allocator.dealloc(proto_register);

        self.pop_declarative_scope(outer_scope);
        self.bytecode.emit_pop_private_environment();

        if let Some(dst) = dst {
            self.bytecode
                .emit_move(dst.variable(), class_register.variable());
        } else {
            self.emit_binding(BindingOpcode::InitVar, class_name, &class_register);
        }

        self.register_allocator.dealloc(class_register);

        // NOTE: Reset strict mode to before class declaration/expression evaluation.
        self.code_block_flags.set(CodeBlockFlags::STRICT, strict);
    }
}
