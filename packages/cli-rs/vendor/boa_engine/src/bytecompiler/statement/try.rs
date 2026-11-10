use crate::{
    bytecompiler::{ByteCompiler, Register, ToJsString, jump_control::JumpControlInfoFlags},
    vm::{CallFrame, opcode::BindingOpcode},
};
use boa_ast::{
    Statement, StatementListItem,
    declaration::Binding,
    statement::{Block, Catch, Finally, Try},
};

enum TryVariant<'a> {
    Catch(&'a Catch),
    Finally((&'a Finally, Register, Register)),
    CatchFinally((&'a Catch, &'a Finally, Register, Register)),
}

impl TryVariant<'_> {
    fn finally_re_throw_register(&self) -> Option<(&Register, &Register)> {
        match self {
            TryVariant::Catch(_) => None,
            TryVariant::Finally((_, f, i)) | TryVariant::CatchFinally((_, _, f, i)) => Some((f, i)),
        }
    }
}

impl ByteCompiler<'_> {
    /// Compile try statement.
    pub(crate) fn compile_try(&mut self, t: &Try, use_expr: bool) {
        let variant = match (t.catch(), t.finally()) {
            (Some(catch), Some(finally)) => {
                let finally_re_throw = self.register_allocator.alloc();
                let finally_jump_index = self.register_allocator.alloc();

                self.bytecode.emit_store_true(finally_re_throw.variable());
                self.bytecode.emit_store_zero(finally_jump_index.variable());

                self.push_try_with_finally_control_info(
                    &finally_re_throw,
                    &finally_jump_index,
                    use_expr,
                );
                TryVariant::CatchFinally((catch, finally, finally_re_throw, finally_jump_index))
            }
            (Some(catch), None) => TryVariant::Catch(catch),
            (None, Some(finally)) => {
                let finally_re_throw = self.register_allocator.alloc();
                let finally_jump_index = self.register_allocator.alloc();

                self.bytecode.emit_store_true(finally_re_throw.variable());
                self.bytecode.emit_store_zero(finally_jump_index.variable());

                self.push_try_with_finally_control_info(
                    &finally_re_throw,
                    &finally_jump_index,
                    use_expr,
                );
                TryVariant::Finally((finally, finally_re_throw, finally_jump_index))
            }
            (None, None) => unreachable!("try statement must have either catch or finally"),
        };

        let try_handler = self.push_handler();

        // Compile try block
        self.compile_block(t.block(), use_expr);

        if let Some((finally_re_throw, _)) = variant.finally_re_throw_register() {
            self.bytecode.emit_store_false(finally_re_throw.variable());
        }

        let finally = self.jump();

        self.patch_handler(try_handler);

        match variant {
            TryVariant::Catch(c) => {
                let error = self.register_allocator.alloc();
                self.bytecode.emit_exception(error.variable());
                self.compile_catch_stmt(c, &error, use_expr);
                self.register_allocator.dealloc(error);
                self.patch_jump(finally);
            }
            TryVariant::CatchFinally((c, f, finally_re_throw, finally_jump_index)) => {
                let catch_handler = self.push_handler();
                let error = self.register_allocator.alloc();
                self.bytecode.emit_exception(error.variable());
                self.compile_catch_stmt(c, &error, use_expr);
                self.bytecode.emit_store_false(finally_re_throw.variable());

                let no_throw = self.jump();
                self.patch_handler(catch_handler);
                self.bytecode.emit_store_true(finally_re_throw.variable());

                self.patch_jump(no_throw);
                self.patch_jump(finally);

                let finally_start = self.next_opcode_location();
                self.jump_info
                    .last_mut()
                    .expect("there should be a try block")
                    .flags |= JumpControlInfoFlags::IN_FINALLY;
                self.compile_finally_stmt(f);
                self.register_allocator.dealloc(error);
                let do_not_throw_exit = self.jump_if_false(&finally_re_throw);
                self.bytecode.emit_re_throw();
                self.patch_jump(do_not_throw_exit);
                self.pop_try_with_finally_control_info(finally_start);
                self.register_allocator.dealloc(finally_re_throw);
                self.register_allocator.dealloc(finally_jump_index);
            }
            TryVariant::Finally((f, finally_re_throw, finally_jump_index))
                if self.is_generator() =>
            {
                let catch_handler = self.push_handler();
                let error = self.register_allocator.alloc();
                self.bytecode.emit_exception(error.variable());
                // Is this a generator `return()` empty exception?
                //
                // This is false because when the `Exception` opcode is executed,
                // it rethrows the empty exception, so if we reached this section,
                // that means it's not an `return()` generator exception.
                let re_throw_generator = self.register_allocator.alloc();
                self.bytecode
                    .emit_store_false(re_throw_generator.variable());

                // Should we rethrow the exception?
                self.bytecode.emit_store_true(finally_re_throw.variable());

                let no_throw = self.jump();
                self.patch_handler(catch_handler);
                self.bytecode.emit_store_true(re_throw_generator.variable());

                self.patch_jump(no_throw);
                self.patch_jump(finally);

                let finally_start = self.next_opcode_location();
                self.jump_info
                    .last_mut()
                    .expect("there should be a try block")
                    .flags |= JumpControlInfoFlags::IN_FINALLY;
                self.compile_finally_stmt(f);
                let do_not_throw_exit = self.jump_if_false(&finally_re_throw);
                let is_generator_exit = self.jump_if_true(&re_throw_generator);
                self.bytecode.emit_throw(error.variable());
                self.register_allocator.dealloc(error);
                self.patch_jump(is_generator_exit);
                self.bytecode.emit_re_throw();
                self.patch_jump(do_not_throw_exit);
                self.register_allocator.dealloc(re_throw_generator);
                self.pop_try_with_finally_control_info(finally_start);
                self.register_allocator.dealloc(finally_re_throw);
                self.register_allocator.dealloc(finally_jump_index);
            }
            TryVariant::Finally((f, finally_re_throw, finally_jump_index)) => {
                let catch_handler = self.push_handler();
                let error = self.register_allocator.alloc();
                self.bytecode.emit_exception(error.variable());
                self.bytecode.emit_store_true(finally_re_throw.variable());

                let no_throw = self.jump();
                self.patch_handler(catch_handler);

                self.patch_jump(no_throw);
                self.patch_jump(finally);

                let finally_start = self.next_opcode_location();
                self.jump_info
                    .last_mut()
                    .expect("there should be a try block")
                    .flags |= JumpControlInfoFlags::IN_FINALLY;
                self.compile_finally_stmt(f);
                let do_not_throw_exit = self.jump_if_false(&finally_re_throw);
                self.bytecode.emit_throw(error.variable());
                self.register_allocator.dealloc(error);
                self.patch_jump(do_not_throw_exit);
                self.pop_try_with_finally_control_info(finally_start);
                self.register_allocator.dealloc(finally_re_throw);
                self.register_allocator.dealloc(finally_jump_index);
            }
        }
    }

    pub(crate) fn compile_catch_stmt(&mut self, catch: &Catch, error: &Register, use_expr: bool) {
        let outer_scope = self.push_declarative_scope(Some(catch.scope()));

        if let Some(binding) = catch.parameter() {
            match binding {
                Binding::Identifier(ident) => {
                    let ident = ident.to_js_string(self.interner());
                    self.emit_binding(BindingOpcode::InitLexical, ident, error);
                }
                Binding::Pattern(pattern) => {
                    self.compile_declaration_pattern(pattern, BindingOpcode::InitLexical, error);
                }
            }
        }

        self.compile_catch_finally_block(catch.block(), use_expr);

        self.pop_declarative_scope(outer_scope);
    }

    pub(crate) fn compile_finally_stmt(&mut self, finally: &Finally) {
        // TODO: We could probably remove the Get/SetAccumulatorFromStack if we check that there is no break/continues statements.
        let value = self.register_allocator.alloc();
        self.bytecode
            .emit_set_register_from_accumulator(value.variable());
        self.compile_catch_finally_block(finally.block(), false);
        self.bytecode.emit_set_accumulator(value.variable());
        self.register_allocator.dealloc(value);
    }

    /// Compile a catch or finally block.
    ///
    /// If the block contains a break or continue as the first statement,
    /// the return value is set to undefined.
    /// See the [ECMAScript reference][spec] for more information.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-try-statement-runtime-semantics-evaluation
    fn compile_catch_finally_block(&mut self, block: &Block, use_expr: bool) {
        let mut b = block;

        while let Some(statement) = b.statement_list().first() {
            match statement {
                StatementListItem::Statement(statement) => match statement.as_ref() {
                    Statement::Break(_) | Statement::Continue(_) => {
                        self.bytecode
                            .emit_set_accumulator(CallFrame::undefined_register().variable());
                        break;
                    }
                    Statement::Block(block) => b = block,
                    _ => break,
                },
                StatementListItem::Declaration(_) => break,
            }
        }

        self.compile_block(block, use_expr);
    }
}
