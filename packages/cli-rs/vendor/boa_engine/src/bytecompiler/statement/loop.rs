use boa_ast::{
    declaration::Binding,
    operations::bound_names,
    scope::BindingLocatorError,
    statement::{
        DoWhileLoop, ForInLoop, ForLoop, ForOfLoop, WhileLoop,
        iteration::{ForLoopInitializer, IterableLoopInitializer},
    },
};
use boa_interner::Sym;

use crate::{
    bytecompiler::{Access, BindingAccessOpcode, ByteCompiler, ToJsString},
    vm::opcode::BindingOpcode,
};

impl ByteCompiler<'_> {
    pub(crate) fn compile_for_loop(
        &mut self,
        for_loop: &ForLoop,
        label: Option<Sym>,
        use_expr: bool,
    ) {
        let mut let_binding_indices = None;
        let mut outer_scope_local = None;
        let mut outer_scope = None;

        if let Some(init) = for_loop.init() {
            match init {
                ForLoopInitializer::Expression(expr) => {
                    let value = self.register_allocator.alloc();
                    self.compile_expr(expr, &value);
                    self.register_allocator.dealloc(value);
                }
                ForLoopInitializer::Var(decl) => {
                    self.compile_var_decl(decl);
                }
                ForLoopInitializer::Lexical(decl) => {
                    let scope_index = if decl.scope().all_bindings_local() {
                        outer_scope_local = Some(self.lexical_scope.clone());
                        self.lexical_scope = decl.scope().clone();
                        None
                    } else {
                        outer_scope = Some(self.lexical_scope.clone());
                        let scope_index = self.push_scope(decl.scope());
                        self.bytecode.emit_push_scope(scope_index.into());
                        Some(scope_index)
                    };

                    let names = bound_names(decl.declaration());
                    if decl.declaration().is_const() {
                    } else {
                        let mut indices = Vec::with_capacity(names.len());
                        for name in &names {
                            let name = name.to_js_string(self.interner());
                            let binding = decl
                                .scope()
                                .get_binding_reference(&name)
                                .expect("binding must exist");
                            let index = self.insert_binding(binding);
                            indices.push(index);
                        }
                        let_binding_indices = Some((indices, scope_index));
                    }
                    self.compile_lexical_decl(decl.declaration());
                }
            }
        }

        self.push_empty_loop_jump_control(use_expr);

        // Hoist loop-invariant constants from the condition (e.g. `10` in `i < 10`)
        // so the value is loaded into a register once, not on every iteration.
        let hoisted = self.try_hoist_loop_condition(for_loop.condition());

        // Per-iteration binding copy: for `for (let i = ...)`, each iteration needs
        // a fresh binding per the spec (important for closures). When the scope requires
        // a runtime environment (scope_index is Some), we must pop/push the environment
        // and copy bindings. When all bindings are local (scope_index is None), the
        // GetName/PutLexicalValue pair is a no-op (Move to temp, Move back) and can be skipped.
        if let Some((let_binding_indices, Some(scope_index))) = &let_binding_indices {
            let mut values = Vec::with_capacity(let_binding_indices.len());
            for index in let_binding_indices {
                let value = self.register_allocator.alloc();
                self.emit_binding_access(BindingAccessOpcode::GetName, index, &value);
                values.push((index, value));
            }

            self.bytecode.emit_pop_environment();
            self.bytecode.emit_push_scope((*scope_index).into());

            for (index, value) in values {
                self.emit_binding_access(BindingAccessOpcode::PutLexicalValue, index, &value);
                self.register_allocator.dealloc(value);
            }
        }

        let initial_jump = self.jump();
        let start_address = self.next_opcode_location();

        self.current_jump_control_mut()
            .expect("jump_control must exist as it was just pushed")
            .set_label(label);
        self.current_jump_control_mut()
            .expect("jump_control must exist as it was just pushed")
            .set_start_address(start_address);

        if let Some((let_binding_indices, Some(scope_index))) = &let_binding_indices {
            let mut values = Vec::with_capacity(let_binding_indices.len());
            for index in let_binding_indices {
                let value = self.register_allocator.alloc();
                self.emit_binding_access(BindingAccessOpcode::GetName, index, &value);
                values.push((index, value));
            }

            self.bytecode.emit_pop_environment();
            self.bytecode.emit_push_scope((*scope_index).into());

            for (index, value) in values {
                self.emit_binding_access(BindingAccessOpcode::PutLexicalValue, index, &value);
                self.register_allocator.dealloc(value);
            }
        }

        self.bytecode.emit_increment_loop_iteration();

        if let Some(final_expr) = for_loop.final_expr() {
            self.compile_expr_for_side_effects(final_expr);
        }

        self.patch_jump(initial_jump);

        let exit = for_loop
            .condition()
            .map(|condition| self.compile_condition_and_branch(condition, hoisted.as_ref()));

        self.compile_stmt(for_loop.body(), use_expr, true);

        self.bytecode.emit_jump(start_address);

        if let Some(exit) = exit {
            self.patch_jump(exit);
        }
        self.pop_loop_control_info();

        if let Some(hoisted) = hoisted {
            self.register_allocator.dealloc(hoisted.register);
        }

        if let Some(outer_scope_local) = outer_scope_local {
            self.lexical_scope = outer_scope_local;
        }
        self.pop_declarative_scope(outer_scope);
    }

    pub(crate) fn compile_for_in_loop(
        &mut self,
        for_in_loop: &ForInLoop,
        label: Option<Sym>,
        use_expr: bool,
    ) {
        // Handle https://tc39.es/ecma262/#prod-annexB-ForInOfStatement
        if let IterableLoopInitializer::Var(var) = for_in_loop.initializer()
            && let Binding::Identifier(ident) = var.binding()
            && let Some(init) = var.init()
        {
            let ident = ident.to_js_string(self.interner());
            let value = self.register_allocator.alloc();
            self.compile_expr(init, &value);
            self.emit_binding(BindingOpcode::InitVar, ident, &value);
            self.register_allocator.dealloc(value);
        }
        let outer_scope = self.push_declarative_scope(for_in_loop.target_scope());
        let value = self.register_allocator.alloc();
        self.compile_expr(for_in_loop.target(), &value);
        self.pop_declarative_scope(outer_scope);

        let early_exit = self.jump_if_null_or_undefined(&value);

        self.bytecode.emit_create_for_in_iterator(value.variable());

        self.register_allocator.dealloc(value);

        let start_address = self.next_opcode_location();
        self.push_loop_control_info_for_of_in_loop(label, start_address, use_expr);
        self.bytecode.emit_increment_loop_iteration();

        self.bytecode.emit_iterator_next();

        let done_reg = self.register_allocator.alloc();
        self.bytecode.emit_iterator_done(done_reg.variable());
        let exit = self.jump_if_true(&done_reg);
        self.register_allocator.dealloc(done_reg);

        let outer_scope = self.push_declarative_scope(for_in_loop.scope());

        // For let/const with a local identifier binding, emit iterator_value
        // directly into the binding's persistent register to avoid a Move.
        if let IterableLoopInitializer::Let(Binding::Identifier(ident))
        | IterableLoopInitializer::Const(Binding::Identifier(ident)) = for_in_loop.initializer()
            && let ident = ident.to_js_string(self.interner())
            && let binding = self.lexical_scope.get_identifier_reference(ident)
            && binding.local()
        {
            let reg = self.register_allocator.alloc_persistent();
            self.local_binding_registers.insert(binding, reg.index());
            self.bytecode.emit_iterator_value(reg.variable());
        } else {
            let value = self.register_allocator.alloc();
            self.bytecode.emit_iterator_value(value.variable());

            match for_in_loop.initializer() {
                IterableLoopInitializer::Identifier(ident) => {
                    let ident = ident.to_js_string(self.interner());
                    self.emit_binding(BindingOpcode::InitVar, ident, &value);
                }
                IterableLoopInitializer::Access(access) => {
                    self.access_set(Access::Property { access }, |_| &value);
                }
                IterableLoopInitializer::Var(declaration) => match declaration.binding() {
                    Binding::Identifier(ident) => {
                        let ident = ident.to_js_string(self.interner());
                        self.emit_binding(BindingOpcode::InitVar, ident, &value);
                    }
                    Binding::Pattern(pattern) => {
                        self.compile_declaration_pattern(pattern, BindingOpcode::InitVar, &value);
                    }
                },
                IterableLoopInitializer::Let(declaration)
                | IterableLoopInitializer::Const(declaration) => match declaration {
                    Binding::Identifier(ident) => {
                        let ident = ident.to_js_string(self.interner());
                        self.emit_binding(BindingOpcode::InitLexical, ident, &value);
                    }
                    Binding::Pattern(pattern) => {
                        self.compile_declaration_pattern(
                            pattern,
                            BindingOpcode::InitLexical,
                            &value,
                        );
                    }
                },
                IterableLoopInitializer::Pattern(pattern) => {
                    self.compile_declaration_pattern(pattern, BindingOpcode::SetName, &value);
                }
            }

            self.register_allocator.dealloc(value);
        }

        self.compile_stmt(for_in_loop.body(), use_expr, true);
        self.pop_declarative_scope(outer_scope);

        self.bytecode.emit_jump(start_address);

        self.patch_jump(exit);
        self.pop_loop_control_info();

        self.iterator_close(false);
        self.patch_jump(early_exit);
    }

    pub(crate) fn compile_for_of_loop(
        &mut self,
        for_of_loop: &ForOfLoop,
        label: Option<Sym>,
        use_expr: bool,
    ) {
        let outer_scope = self.push_declarative_scope(for_of_loop.iterable_scope());
        let object = self.register_allocator.alloc();
        self.compile_expr(for_of_loop.iterable(), &object);
        self.pop_declarative_scope(outer_scope);

        if for_of_loop.r#await() {
            self.bytecode.emit_get_async_iterator(object.variable());
        } else {
            self.bytecode.emit_get_iterator(object.variable());
            let t = self.v8_not_iterable(for_of_loop.iterable(), crate::bytecompiler::IterSite::ForOf);
            self.note_v8('I', t);
        }

        self.register_allocator.dealloc(object);

        let start_address = self.next_opcode_location();
        if for_of_loop.r#await() {
            self.push_loop_control_info_for_await_of_loop(label, start_address, use_expr);
        } else {
            self.push_loop_control_info_for_of_in_loop(label, start_address, use_expr);
        }
        self.bytecode.emit_increment_loop_iteration();

        self.bytecode.emit_iterator_next();
        if for_of_loop.r#await() {
            let value = self.register_allocator.alloc();
            self.bytecode.emit_iterator_result(value.variable());
            self.bytecode.emit_await(value.variable());
            let resume_kind = self.register_allocator.alloc();
            self.pop_into_register(&resume_kind);
            self.pop_into_register(&value);

            self.bytecode
                .emit_iterator_finish_async_next(resume_kind.variable(), value.variable());
            self.generator_next(&value, &resume_kind);
            self.register_allocator.dealloc(value);
            self.register_allocator.dealloc(resume_kind);
        }

        let done_reg = self.register_allocator.alloc();
        self.bytecode.emit_iterator_done(done_reg.variable());
        let exit = self.jump_if_true(&done_reg);
        self.register_allocator.dealloc(done_reg);

        let outer_scope = self.push_declarative_scope(for_of_loop.scope());

        // For let/const with a local identifier binding, emit iterator_value
        // directly into the binding's persistent register to avoid a Move.
        let handler_index = if let IterableLoopInitializer::Let(Binding::Identifier(ident))
        | IterableLoopInitializer::Const(Binding::Identifier(ident)) =
            for_of_loop.initializer()
            && let ident = ident.to_js_string(self.interner())
            && let ident = self.lexical_scope.get_identifier_reference(ident)
            && ident.local()
        {
            let reg = self.register_allocator.alloc_persistent();
            self.local_binding_registers.insert(ident, reg.index());
            self.bytecode.emit_iterator_value(reg.variable());

            self.push_handler()
        } else {
            let value = self.register_allocator.alloc();
            self.bytecode.emit_iterator_value(value.variable());
            let handler_index = self.push_handler();
            match for_of_loop.initializer() {
                IterableLoopInitializer::Identifier(ident) => {
                    let ident = ident.to_js_string(self.interner());
                    match self.lexical_scope.set_mutable_binding(ident.clone()) {
                        Ok(binding) => {
                            let index = self.insert_binding(binding);
                            self.emit_binding_access(
                                BindingAccessOpcode::DefInitVar,
                                &index,
                                &value,
                            );
                        }
                        Err(BindingLocatorError::MutateImmutable) => {
                            let index = self.get_or_insert_string(ident);
                            self.bytecode.emit_throw_mutate_immutable(index.into());
                        }
                        Err(BindingLocatorError::Silent) => {}
                    }
                }
                IterableLoopInitializer::Access(access) => {
                    self.access_set(Access::Property { access }, |_| &value);
                }
                IterableLoopInitializer::Var(declaration) => {
                    // ignore initializers since those aren't allowed on for-of loops.
                    assert!(declaration.init().is_none());
                    match declaration.binding() {
                        Binding::Identifier(ident) => {
                            let ident = ident.to_js_string(self.interner());
                            self.emit_binding(BindingOpcode::InitVar, ident, &value);
                        }
                        Binding::Pattern(pattern) => {
                            self.compile_declaration_pattern(
                                pattern,
                                BindingOpcode::InitVar,
                                &value,
                            );
                        }
                    }
                }
                IterableLoopInitializer::Let(declaration)
                | IterableLoopInitializer::Const(declaration) => match declaration {
                    Binding::Identifier(ident) => {
                        let ident = ident.to_js_string(self.interner());
                        self.emit_binding(BindingOpcode::InitLexical, ident, &value);
                    }
                    Binding::Pattern(pattern) => {
                        self.compile_declaration_pattern(
                            pattern,
                            BindingOpcode::InitLexical,
                            &value,
                        );
                    }
                },
                IterableLoopInitializer::Pattern(pattern) => {
                    self.compile_declaration_pattern(pattern, BindingOpcode::SetName, &value);
                }
            }

            self.register_allocator.dealloc(value);
            handler_index
        };

        self.compile_stmt(for_of_loop.body(), use_expr, true);

        {
            let exit = self.jump();
            self.patch_handler(handler_index);

            let error = self.register_allocator.alloc();
            self.bytecode.emit_exception(error.variable());

            // NOTE: Capture throw of the iterator close and ignore it.
            let handler_index = self.push_handler();
            self.iterator_close(for_of_loop.r#await());
            self.patch_handler(handler_index);

            self.bytecode.emit_throw(error.variable());
            self.register_allocator.dealloc(error);
            self.patch_jump(exit);
        }

        self.pop_declarative_scope(outer_scope);
        self.bytecode.emit_jump(start_address);

        self.patch_jump(exit);
        self.pop_loop_control_info();

        self.iterator_close(for_of_loop.r#await());
    }

    pub(crate) fn compile_while_loop(
        &mut self,
        while_loop: &WhileLoop,
        label: Option<Sym>,
        use_expr: bool,
    ) {
        // Hoist loop-invariant constants from the condition.
        let hoisted = self.try_hoist_loop_condition(Some(while_loop.condition()));

        let start_address = self.next_opcode_location();
        self.bytecode.emit_increment_loop_iteration();
        self.push_loop_control_info(label, start_address, use_expr);

        let exit = self.compile_condition_and_branch(while_loop.condition(), hoisted.as_ref());

        self.compile_stmt(while_loop.body(), use_expr, true);

        self.bytecode.emit_jump(start_address);

        self.patch_jump(exit);
        self.pop_loop_control_info();

        if let Some(hoisted) = hoisted {
            self.register_allocator.dealloc(hoisted.register);
        }
    }

    pub(crate) fn compile_do_while_loop(
        &mut self,
        do_while_loop: &DoWhileLoop,
        label: Option<Sym>,
        use_expr: bool,
    ) {
        // Hoist loop-invariant constants from the condition.
        let hoisted = self.try_hoist_loop_condition(Some(do_while_loop.cond()));

        let initial_label = self.jump();

        let start_address = self.next_opcode_location();

        self.push_loop_control_info(label, start_address, use_expr);

        let condition_label_address = self.next_opcode_location();
        self.bytecode.emit_increment_loop_iteration();

        let exit = self.compile_condition_and_branch(do_while_loop.cond(), hoisted.as_ref());

        self.patch_jump(initial_label);

        self.compile_stmt(do_while_loop.body(), use_expr, true);

        self.bytecode.emit_jump(condition_label_address);
        self.patch_jump(exit);

        self.pop_loop_control_info();

        if let Some(hoisted) = hoisted {
            self.register_allocator.dealloc(hoisted.register);
        }
    }
}
