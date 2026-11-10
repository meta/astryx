use thin_vec::thin_vec;

use crate::{
    bytecompiler::{ByteCompiler, Label, Register},
    js_string,
    vm::GeneratorResumeKind,
};

impl ByteCompiler<'_> {
    pub(crate) fn generator_next(&mut self, value: &Register, resume_kind: &Register) {
        // NOTE: +4 to jump past the index operand.
        let jump_table_index = self.next_opcode_location() + size_of::<u32>() as u32;
        self.bytecode.emit_jump_table(
            resume_kind.index(),
            thin_vec![
                Self::DUMMY_ADDRESS, // GeneratorResumeKind::Normal
                Self::DUMMY_ADDRESS, // GeneratorResumeKind::Throw
                                     // GeneratorResumeKind::Return is the default case
            ],
        );
        // Return branch
        self.bytecode.emit_set_accumulator(value.variable());
        self.bytecode.emit_re_throw();

        // Normal branch
        let normal = self.next_opcode_location();
        let end = self.jump();

        // Throw branch
        let throw = self.next_opcode_location();
        self.bytecode.emit_throw(value.variable());

        self.patch_jump(end);
        self.bytecode
            .patch_jump_table(jump_table_index, &[normal, throw]);
    }

    pub(crate) fn generator_delegate_next(
        &mut self,
        value: &Register,
        resume_kind: &Register,
        is_return: &Register,
    ) -> (Label, Label) {
        let iterator = self.register_allocator.alloc();
        let next = self.register_allocator.alloc();
        self.bytecode
            .emit_iterator_pop(iterator.variable(), next.variable());

        // NOTE: +4 to jump past the index operand.
        let jump_table_index = self.next_opcode_location() + size_of::<u32>() as u32;
        self.bytecode.emit_jump_table(
            resume_kind.index(),
            thin_vec![
                Self::DUMMY_ADDRESS, // GeneratorResumeKind::Normal
                Self::DUMMY_ADDRESS, // GeneratorResumeKind::Throw
                                     // GeneratorResumeKind::Return is the default case
            ],
        );

        // GeneratorResumeKind::Return
        let name_index = self.get_or_insert_string(js_string!("return"));
        self.bytecode
            .emit_move(is_return.variable(), iterator.variable());

        self.bytecode
            .emit_get_method(is_return.variable(), name_index.into());

        // If the return method is unavailable, jump outside the resume.
        let return_method_undefined = self.jump_if_null_or_undefined(is_return);

        // Return method is available. Call and set `is_return = true` and
        // `value = returned value`.
        self.push_from_register(&iterator);
        self.push_from_register(is_return);
        self.push_from_register(value);
        self.bytecode.emit_call(1u8.into());
        self.bytecode.emit_store_true(is_return.variable());
        self.pop_into_register(value);
        let return_jump = self.jump();

        // GeneratorResumeKind::Normal
        let normal = self.next_opcode_location();
        self.push_from_register(&iterator);
        self.push_from_register(&next);
        self.push_from_register(value);
        self.bytecode.emit_call(1u8.into());
        self.bytecode.emit_store_false(is_return.variable());
        self.pop_into_register(value);
        let normal_jump = self.jump();

        // GeneratorResumeKind::Throw
        let throw = self.next_opcode_location();
        let name_index = self.get_or_insert_string(js_string!("throw"));
        self.bytecode
            .emit_move(is_return.variable(), iterator.variable());
        self.bytecode
            .emit_get_method(is_return.variable(), name_index.into());

        let skip_push = self.jump_if_not_undefined(is_return);
        self.bytecode
            .emit_iterator_push(iterator.variable(), next.variable());
        // If the return method is unavailable, jump outside the resume.
        let throw_method_undefined = self.jump();

        self.patch_jump(skip_push);

        // Throw method is available. Call and set `is_return = true` and
        // `value = returned value`.
        self.push_from_register(&iterator);
        self.push_from_register(is_return);
        self.push_from_register(value);
        self.bytecode.emit_call(1u8.into());
        self.bytecode.emit_store_false(is_return.variable());
        self.pop_into_register(value);

        self.bytecode
            .patch_jump_table(jump_table_index, &[normal, throw]);
        self.patch_jump(return_jump);
        self.patch_jump(normal_jump);

        self.bytecode
            .emit_iterator_push(iterator.variable(), next.variable());
        self.register_allocator.dealloc(iterator);
        self.register_allocator.dealloc(next);

        (return_method_undefined, throw_method_undefined)
    }

    pub(crate) fn generator_delegate_resume(
        &mut self,
        value: &Register,
        resume_kind: &Register,
        is_return: &Register,
    ) -> (Label, Label) {
        let not_throw = self.jump_if_not_resume_kind(GeneratorResumeKind::Throw, resume_kind);

        // resume_kind is throw. Pop the active iterator and raise the error.
        self.bytecode
            .emit_iterator_pop(resume_kind.variable(), resume_kind.variable());
        self.bytecode.emit_throw(value.variable());
        self.patch_jump(not_throw);

        // resume_kind is not throw. Try to update the iterator result
        self.bytecode.emit_iterator_update_result(value.variable());

        // `value` should contain a boolean with `iterator.done()` at this point.
        // skip pop if the iterator is not done yet
        let skip_pop = self.jump_if_false(value);

        self.bytecode.emit_iterator_value(value.variable());
        self.bytecode
            .emit_iterator_pop(resume_kind.variable(), resume_kind.variable());
        let return_gen = self.jump_if_true(is_return);
        let exit = self.jump();

        self.patch_jump(skip_pop);

        (return_gen, exit)
    }
}
