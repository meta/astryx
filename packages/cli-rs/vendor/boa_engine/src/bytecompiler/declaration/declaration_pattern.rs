use crate::{
    bytecompiler::{Access, ByteCompiler, Literal, Register, ToJsString},
    vm::opcode::BindingOpcode,
};
use boa_ast::{
    pattern::{ArrayPatternElement, ObjectPatternElement, Pattern},
    property::PropertyName,
};
use thin_vec::ThinVec;

impl ByteCompiler<'_> {
    pub(crate) fn compile_declaration_pattern_impl(
        &mut self,
        pattern: &Pattern,
        def: BindingOpcode,
        object: &Register,
    ) {
        let src = self.v8_pattern_src.take();
        let nested = std::mem::replace(&mut self.v8_nested_pattern, true);
        self.compile_declaration_pattern_body(pattern, def, object, src, nested);
        self.v8_nested_pattern = nested;
    }

    fn compile_declaration_pattern_body(
        &mut self,
        pattern: &Pattern,
        def: BindingOpcode,
        object: &Register,
        src: Option<(String, String)>,
        nested: bool,
    ) {
        match pattern {
            Pattern::Object(pattern) => {
                self.bytecode
                    .emit_value_not_null_or_undefined(object.variable());
                {
                    let shown = src.as_ref().map(|s| s.0.clone()).unwrap_or_else(|| '\u{1}'.to_string());
                    let first = pattern.bindings().first().and_then(|b| match b {
                        ObjectPatternElement::SingleName { name: PropertyName::Literal(id), .. }
                        | ObjectPatternElement::Pattern { name: PropertyName::Literal(id), .. } => {
                            Some(self.interner().resolve_expect(id.sym()).to_string())
                        }
                        _ => None,
                    });
                    let v = crate::bytecompiler::v8_names_value();
                    let t = match first {
                        Some(name) if nested && src.is_none() => format!("Cannot read properties of {v} (reading '{name}')"),
                        Some(name) => format!("Cannot destructure property '{name}' of '{shown}' as it is {v}."),
                        None => format!("Cannot destructure '{shown}' as it is {v}."),
                    };
                    self.note_v8('D', t);
                }

                let mut excluded_keys_registers = Vec::new();
                let rest_exits = pattern.has_rest();

                for binding in pattern.bindings() {
                    use ObjectPatternElement::{
                        AssignmentPropertyAccess, AssignmentRestPropertyAccess, Pattern,
                        RestProperty, SingleName,
                    };

                    match binding {
                        //  SingleNameBinding : BindingIdentifier Initializer[opt]
                        SingleName {
                            ident,
                            name,
                            default_init,
                        } => {
                            let dst = self.register_allocator.alloc();

                            match name {
                                PropertyName::Literal(ident) => {
                                    self.emit_get_property_by_name(&dst, None, object, ident.sym());
                                    let key = self.register_allocator.alloc();
                                    self.emit_store_literal(
                                        Literal::String(
                                            self.interner()
                                                .resolve_expect(ident.sym())
                                                .into_common(false),
                                        ),
                                        &key,
                                    );
                                    excluded_keys_registers.push(key);
                                }
                                PropertyName::Computed(node) => {
                                    let key = self.register_allocator.alloc();
                                    self.compile_expr(node, &key);
                                    if rest_exits {
                                        self.bytecode.emit_get_property_by_value_push(
                                            dst.variable(),
                                            key.variable(),
                                            object.variable(),
                                            object.variable(),
                                        );
                                        excluded_keys_registers.push(key);
                                    } else {
                                        self.bytecode.emit_get_property_by_value(
                                            dst.variable(),
                                            key.variable(),
                                            object.variable(),
                                            object.variable(),
                                        );
                                        self.register_allocator.dealloc(key);
                                    }
                                }
                            }

                            if let Some(init) = default_init {
                                let skip = self.jump_if_not_undefined(&dst);
                                self.compile_expr(init, &dst);
                                self.patch_jump(skip);
                            }

                            self.emit_binding(def, ident.to_js_string(self.interner()), &dst);
                            self.register_allocator.dealloc(dst);
                        }
                        //  BindingRestProperty : ... BindingIdentifier
                        RestProperty { ident } => {
                            let value = self.register_allocator.alloc();
                            self.bytecode.emit_store_empty_object(value.variable());
                            let mut excluded_keys =
                                ThinVec::with_capacity(excluded_keys_registers.len());
                            for r in &excluded_keys_registers {
                                excluded_keys.push(r.variable());
                            }
                            self.bytecode.emit_copy_data_properties(
                                value.variable(),
                                object.variable(),
                                excluded_keys,
                            );
                            while let Some(r) = excluded_keys_registers.pop() {
                                self.register_allocator.dealloc(r);
                            }
                            self.emit_binding(def, ident.to_js_string(self.interner()), &value);
                            self.register_allocator.dealloc(value);
                        }
                        AssignmentRestPropertyAccess { access } => {
                            let value = self.register_allocator.alloc();
                            self.bytecode.emit_store_empty_object(value.variable());
                            let mut excluded_keys =
                                ThinVec::with_capacity(excluded_keys_registers.len());
                            for r in &excluded_keys_registers {
                                excluded_keys.push(r.variable());
                            }
                            self.bytecode.emit_copy_data_properties(
                                value.variable(),
                                object.variable(),
                                excluded_keys,
                            );
                            while let Some(r) = excluded_keys_registers.pop() {
                                self.register_allocator.dealloc(r);
                            }
                            self.access_set(Access::Property { access }, |_| &value);
                            self.register_allocator.dealloc(value);
                        }
                        AssignmentPropertyAccess {
                            name,
                            access,
                            default_init,
                        } => {
                            let key = self.register_allocator.alloc();
                            match &name {
                                PropertyName::Literal(ident) => {
                                    let key = self.register_allocator.alloc();
                                    self.emit_store_literal(
                                        Literal::String(
                                            self.interner()
                                                .resolve_expect(ident.sym())
                                                .into_common(false),
                                        ),
                                        &key,
                                    );
                                    excluded_keys_registers.push(key);
                                }
                                PropertyName::Computed(node) => {
                                    self.compile_expr(node, &key);
                                    self.bytecode
                                        .emit_to_property_key(key.variable(), key.variable());
                                }
                            }

                            let dst = self.register_allocator.alloc();
                            self.access_set(
                                Access::Property { access },
                                |compiler: &mut ByteCompiler<'_>| {
                                    match name {
                                        PropertyName::Literal(ident) => {
                                            compiler.emit_get_property_by_name(
                                                &dst,
                                                None,
                                                object,
                                                ident.sym(),
                                            );
                                            compiler.register_allocator.dealloc(key);
                                        }
                                        PropertyName::Computed(_) => {
                                            if rest_exits {
                                                compiler.bytecode.emit_get_property_by_value_push(
                                                    dst.variable(),
                                                    key.variable(),
                                                    object.variable(),
                                                    object.variable(),
                                                );
                                                excluded_keys_registers.push(key);
                                            } else {
                                                compiler.bytecode.emit_get_property_by_value(
                                                    dst.variable(),
                                                    key.variable(),
                                                    object.variable(),
                                                    object.variable(),
                                                );
                                                compiler.register_allocator.dealloc(key);
                                            }
                                        }
                                    }

                                    if let Some(init) = default_init {
                                        let skip = compiler.jump_if_not_undefined(&dst);
                                        compiler.compile_expr(init, &dst);
                                        compiler.patch_jump(skip);
                                    }

                                    &dst
                                },
                            );
                            self.register_allocator.dealloc(dst);
                        }
                        Pattern {
                            name,
                            pattern,
                            default_init,
                        } => {
                            let dst = self.register_allocator.alloc();

                            match name {
                                PropertyName::Literal(ident) => {
                                    self.emit_get_property_by_name(&dst, None, object, ident.sym());
                                }
                                PropertyName::Computed(node) => {
                                    let key = self.register_allocator.alloc();
                                    self.compile_expr(node, &key);
                                    self.bytecode.emit_get_property_by_value(
                                        dst.variable(),
                                        key.variable(),
                                        object.variable(),
                                        object.variable(),
                                    );
                                    self.register_allocator.dealloc(key);
                                }
                            }

                            if let Some(init) = default_init {
                                let skip = self.jump_if_not_undefined(&dst);
                                self.compile_expr(init, &dst);
                                self.patch_jump(skip);
                            }
                            self.compile_declaration_pattern(pattern, def, &dst);
                            self.register_allocator.dealloc(dst);
                        }
                    }
                }

                while let Some(r) = excluded_keys_registers.pop() {
                    self.register_allocator.dealloc(r);
                }
            }
            Pattern::Array(pattern) => {
                let v = crate::bytecompiler::v8_names_value();
                let t = src.as_ref().map(|s| s.1.clone()).unwrap_or_else(|| {
                    if nested {
                        format!("{v} is not iterable (cannot read property Symbol(Symbol.iterator))")
                    } else {
                        format!("{v} is not iterable")
                    }
                });
                self.bytecode
                    .emit_value_not_null_or_undefined(object.variable());
                self.note_v8('D', t.clone());
                self.bytecode.emit_get_iterator(object.variable());
                self.note_v8('I', t);

                let handler_index = self.push_handler();
                for element in pattern.bindings() {
                    self.compile_array_pattern_element(element, def);
                }

                let no_exception_thrown = self.jump();
                self.patch_handler(handler_index);

                let has_exception = self.register_allocator.alloc();
                let exception = self.register_allocator.alloc();
                self.bytecode
                    .emit_maybe_exception(has_exception.variable(), exception.variable());

                let iterator_close_handler = self.push_handler();
                self.iterator_close(false);
                self.patch_handler(iterator_close_handler);

                let jump = self.jump_if_false(&has_exception);
                self.register_allocator.dealloc(has_exception);

                self.bytecode.emit_throw(exception.variable());
                self.register_allocator.dealloc(exception);

                self.patch_jump(jump);
                self.bytecode.emit_re_throw();

                self.patch_jump(no_exception_thrown);

                self.iterator_close(false);
            }
        }
    }

    fn compile_array_pattern_element(&mut self, element: &ArrayPatternElement, def: BindingOpcode) {
        use ArrayPatternElement::{
            Elision, Pattern, PatternRest, PropertyAccess, PropertyAccessRest, SingleName,
            SingleNameRest,
        };

        match element {
            // ArrayBindingPattern : [ Elision ]
            Elision => {
                self.bytecode.emit_iterator_next();
            }
            // SingleNameBinding : BindingIdentifier Initializer[opt]
            SingleName {
                ident,
                default_init,
            } => {
                self.bytecode.emit_iterator_next();
                let value = self.register_allocator.alloc();
                self.bytecode.emit_iterator_done(value.variable());
                self.if_else(
                    &value,
                    |compiler| compiler.bytecode.emit_store_undefined(value.variable()),
                    |compiler| compiler.bytecode.emit_iterator_value(value.variable()),
                );

                if let Some(init) = default_init {
                    let skip = self.jump_if_not_undefined(&value);
                    self.compile_expr(init, &value);
                    self.patch_jump(skip);
                }

                self.emit_binding(def, ident.to_js_string(self.interner()), &value);
                self.register_allocator.dealloc(value);
            }
            PropertyAccess {
                access,
                default_init,
            } => {
                let value = self.register_allocator.alloc();
                self.access_set(Access::Property { access }, |compiler| {
                    compiler.bytecode.emit_iterator_next();
                    compiler.bytecode.emit_iterator_done(value.variable());
                    compiler.if_else(
                        &value,
                        |compiler| compiler.bytecode.emit_store_undefined(value.variable()),
                        |compiler| compiler.bytecode.emit_iterator_value(value.variable()),
                    );

                    if let Some(init) = default_init {
                        let skip = compiler.jump_if_not_undefined(&value);
                        compiler.compile_expr(init, &value);
                        compiler.patch_jump(skip);
                    }

                    &value
                });
                self.register_allocator.dealloc(value);
            }
            // BindingElement : BindingPattern Initializer[opt]
            Pattern {
                pattern,
                default_init,
            } => {
                self.bytecode.emit_iterator_next();
                let value = self.register_allocator.alloc();
                self.bytecode.emit_iterator_done(value.variable());
                self.if_else(
                    &value,
                    |compiler| compiler.bytecode.emit_store_undefined(value.variable()),
                    |compiler| compiler.bytecode.emit_iterator_value(value.variable()),
                );

                if let Some(init) = default_init {
                    let skip = self.jump_if_not_undefined(&value);
                    self.compile_expr(init, &value);
                    self.patch_jump(skip);
                }
                self.compile_declaration_pattern(pattern, def, &value);
                self.register_allocator.dealloc(value);
            }
            // BindingRestElement : ... BindingIdentifier
            SingleNameRest { ident } => {
                let value = self.register_allocator.alloc();
                self.bytecode.emit_iterator_to_array(value.variable());
                self.emit_binding(def, ident.to_js_string(self.interner()), &value);
                self.register_allocator.dealloc(value);
            }
            PropertyAccessRest { access } => {
                let value = self.register_allocator.alloc();
                self.access_set(Access::Property { access }, |compiler| {
                    compiler.bytecode.emit_iterator_to_array(value.variable());
                    &value
                });
                self.register_allocator.dealloc(value);
            }
            // BindingRestElement : ... BindingPattern
            PatternRest { pattern } => {
                let value = self.register_allocator.alloc();
                self.bytecode.emit_iterator_to_array(value.variable());
                self.compile_declaration_pattern(pattern, def, &value);
                self.register_allocator.dealloc(value);
            }
        }
    }
}
