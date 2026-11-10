//! `JumpControlInfo` tracks relevant jump information used during compilation.
//!
//! Primarily, jump control tracks information related to the compilation of [iteration
//! statements][iteration spec], [switch statements][switch spec], [try statements][try spec],
//! and [labelled statements][labelled spec].
//!
//! [iteration spec]: https://tc39.es/ecma262/#sec-iteration-statements
//! [switch spec]: https://tc39.es/ecma262/#sec-switch-statement
//! [try spec]: https://tc39.es/ecma262/#sec-try-statement
//! [labelled spec]: https://tc39.es/ecma262/#sec-labelled-statements

use super::Register;
use crate::{
    bytecompiler::{ByteCompiler, Label},
    vm::{CallFrame, Handler, opcode::Address},
};
use bitflags::bitflags;
use boa_interner::Sym;
use thin_vec::thin_vec;

/// An actions to be performed for the local control flow.
#[derive(Debug, Clone, Copy)]
pub(crate) enum JumpRecordAction {
    /// Places a [`crate::vm::opcode::Opcode::Jump`], transfers to a specified [`JumpControlInfo`] to be handled when it gets popped.
    Transfer {
        /// [`JumpControlInfo`] index to be transferred.
        index: u32,
    },

    /// Places [`crate::vm::opcode::Opcode::PopEnvironment`] opcodes, `count` times.
    PopEnvironments { count: u32 },

    /// Closes the an iterator.
    CloseIterator { r#async: bool },

    /// Handles finally, this needs to be done if we are in the try or catch section of a try statement that
    /// has a finally block.
    ///
    /// It places push integer value [`crate::vm::opcode::Opcode`] as well as [`crate::vm::opcode::Opcode::StoreFalse`], which means don't [`ReThrow`](crate::vm::opcode::Opcode::ReThrow).
    ///
    /// The integer is an index used to jump. See [`crate::vm::opcode::Opcode::JumpTable`]. This is needed because the following code:
    ///
    /// ```JavaScript
    /// do {
    ///     try {
    ///         if (cond) {
    ///             continue;
    ///         }
    ///
    ///         break;
    ///     } finally {
    ///         // Must execute the finally, even if `continue` is executed or `break` is executed.
    ///     }
    /// } while (true)
    /// ```
    ///
    /// Both `continue` and `break` must go through the finally, but the `continue` goes to the beginning of the loop,
    /// and the `break` goes to the end of the loop, this is solved by having a jump table (See [`crate::vm::opcode::Opcode::JumpTable`])
    /// at the end of finally (It is constructed in [`ByteCompiler::pop_try_with_finally_control_info()`]).
    HandleFinally {
        /// Jump table index.
        index: u32,
        /// Register for the flag that indicated if the finally block needs to re throw.
        finally_throw_flag: u32,
        /// Register for the index in the jump table.
        finally_throw_index: u32,
    },
}

/// Local Control flow type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum JumpRecordKind {
    Break,
    Continue,
    Return { return_value_on_stack: bool },
}

/// This represents a local control flow handling. See [`JumpRecordKind`] for types.
#[derive(Debug, Clone)]
pub(crate) struct JumpRecord {
    kind: JumpRecordKind,
    label: Label,
    actions: Vec<JumpRecordAction>,
}

impl JumpRecord {
    pub(crate) const fn new(kind: JumpRecordKind, actions: Vec<JumpRecordAction>) -> Self {
        Self {
            kind,
            label: ByteCompiler::DUMMY_LABEL,
            actions,
        }
    }

    /// Performs the [`JumpRecordAction`]s.
    pub(crate) fn perform_actions(
        mut self,
        start_address: Address,
        compiler: &mut ByteCompiler<'_>,
    ) {
        while let Some(action) = self.actions.pop() {
            match action {
                JumpRecordAction::Transfer { index } => {
                    self.label = compiler.jump();
                    compiler.jump_info[index as usize].jumps.push(self);

                    // Don't continue actions, let the delegate jump control info handle it!
                    return;
                }
                JumpRecordAction::PopEnvironments { count } => {
                    for _ in 0..count {
                        compiler.bytecode.emit_pop_environment();
                    }
                }
                JumpRecordAction::HandleFinally {
                    index: value,
                    finally_throw_flag,
                    finally_throw_index,
                } => {
                    // Note: +1 because 0 is reserved for the fallthrough entry of the
                    // jump table emitted in `pop_try_with_finally_control_info`.
                    let index = value as i32 + 1;
                    compiler
                        .bytecode
                        .emit_store_false(finally_throw_flag.into());
                    compiler.emit_store_integer_with_index(index, finally_throw_index.into());
                }
                JumpRecordAction::CloseIterator { r#async } => {
                    compiler.iterator_close(r#async);
                }
            }
        }

        // If there are no actions left, finalize the jump record.
        match self.kind {
            JumpRecordKind::Break => compiler.patch_jump(self.label),
            JumpRecordKind::Continue => compiler.patch_jump_with_target(self.label, start_address),
            JumpRecordKind::Return {
                return_value_on_stack,
            } => {
                if return_value_on_stack {
                    let value = compiler.register_allocator.alloc();
                    compiler.pop_into_register(&value);
                    compiler.bytecode.emit_set_accumulator(value.variable());
                    compiler.register_allocator.dealloc(value);
                }

                match (compiler.is_async(), compiler.is_generator()) {
                    // Taken from:
                    //  - 27.6.3.2 AsyncGeneratorStart ( generator, generatorBody ): https://tc39.es/ecma262/#sec-asyncgeneratorstart
                    //
                    // Note: If we are returning we have to close the async generator function.
                    (true, true) => compiler.bytecode.emit_async_generator_close(),

                    // Taken from:
                    //  - 27.7.5.2 AsyncBlockStart ( promiseCapability, asyncBody, asyncContext ): <https://tc39.es/ecma262/#sec-asyncblockstart>
                    //
                    // Note: If there is promise capability resolve or reject it based on pending exception.
                    (true, false) => {
                        let has_exception = compiler.register_allocator.alloc();
                        let exception = compiler.register_allocator.alloc();

                        compiler
                            .bytecode
                            .emit_maybe_exception(has_exception.variable(), exception.variable());

                        // Pushes `undefined` to the stack, which acts as the
                        // `this` value of the call.
                        compiler.push_from_register(&CallFrame::undefined_register());

                        compiler.if_else_with_dealloc(
                            has_exception,
                            |compiler| {
                                // has_exception == true, so we need to call `reject`
                                // with the current exception.

                                compiler.push_from_register(
                                    &CallFrame::promise_capability_reject_register(),
                                );
                                compiler.push_from_register(&exception);
                                compiler.register_allocator.dealloc(exception);
                                compiler.bytecode.emit_call(1u8.into());
                            },
                            |compiler| {
                                // has_exception == false, call `resolve` normally.

                                compiler.push_from_register(
                                    &CallFrame::promise_capability_resolve_register(),
                                );

                                {
                                    let value = compiler.register_allocator.alloc();
                                    compiler
                                        .bytecode
                                        .emit_set_register_from_accumulator(value.variable());
                                    compiler.push_from_register(&value);
                                    compiler.register_allocator.dealloc(value);
                                }
                                compiler.bytecode.emit_call(1u8.into());
                            },
                        );

                        // Finally, set the accumulator value to the promise from the
                        // promise capability
                        compiler.bytecode.emit_set_accumulator(
                            (CallFrame::PROMISE_CAPABILITY_PROMISE_REGISTER_INDEX as u32).into(),
                        );
                    }
                    (false, false) => {
                        // TODO: We can omit checking for return, when constructing for functions,
                        // that cannot be constructed, like arrow functions.
                        compiler.bytecode.emit_check_return();
                    }
                    (false, true) => {}
                }

                compiler.bytecode.emit_return();
            }
        }
    }
}

/// Boa's `ByteCompiler` jump information tracking struct.
#[derive(Debug)]
pub(crate) struct JumpControlInfo {
    label: Option<Sym>,
    start_address: Address,
    pub(crate) flags: JumpControlInfoFlags,
    pub(crate) jumps: Vec<JumpRecord>,
    current_open_environments_count: u32,
    pub(crate) finally_throw: Option<(u32, u32)>,
}

bitflags! {
    /// A bitflag that contains the type flags and relevant booleans for `JumpControlInfo`.
    #[derive(Default, Debug, Clone, Copy)]
    pub(crate) struct JumpControlInfoFlags: u8 {
        const LOOP = 0b0000_0001;
        const SWITCH = 0b0000_0010;

        /// A try statement with a finally block.
        ///
        /// We emit special instructions to handle [`JumpRecord`]s in [`ByteCompiler::pop_try_with_finally_control_info()`].
        const TRY_WITH_FINALLY = 0b0000_0100;

        /// Are we in the finally block of the try statement?
        const IN_FINALLY = 0b0000_1000;

        const LABELLED = 0b0001_0000;
        const ITERATOR_LOOP = 0b0010_0000;
        const FOR_AWAIT_OF_LOOP = 0b0100_0000;

        /// Is the statement compiled with use_expr set to true.
        ///
        /// This bitflag is inherited if the previous [`JumpControlInfo`].
        const USE_EXPR = 0b1000_0000;
    }
}

/// ---- `JumpControlInfo` Creation Methods ----
impl JumpControlInfo {
    fn new(current_open_environments_count: u32) -> Self {
        Self {
            label: None,
            start_address: ByteCompiler::DUMMY_ADDRESS,
            flags: JumpControlInfoFlags::default(),
            jumps: Vec::new(),
            current_open_environments_count,
            finally_throw: None,
        }
    }

    pub(crate) const fn with_label(mut self, label: Option<Sym>) -> Self {
        self.label = label;
        self
    }

    pub(crate) const fn with_start_address(mut self, address: Address) -> Self {
        self.start_address = address;
        self
    }

    pub(crate) fn with_loop_flag(mut self, value: bool) -> Self {
        self.flags.set(JumpControlInfoFlags::LOOP, value);
        self
    }

    pub(crate) fn with_switch_flag(mut self, value: bool) -> Self {
        self.flags.set(JumpControlInfoFlags::SWITCH, value);
        self
    }

    pub(crate) fn with_try_with_finally_flag(mut self, flag: &Register, index: &Register) -> Self {
        self.finally_throw = Some((flag.index(), index.index()));
        self
    }

    pub(crate) fn with_labelled_block_flag(mut self, value: bool) -> Self {
        self.flags.set(JumpControlInfoFlags::LABELLED, value);
        self
    }

    pub(crate) fn with_iterator_loop(mut self, value: bool) -> Self {
        self.flags.set(JumpControlInfoFlags::ITERATOR_LOOP, value);
        self
    }

    pub(crate) fn with_for_await_of_loop(mut self, value: bool) -> Self {
        self.flags
            .set(JumpControlInfoFlags::FOR_AWAIT_OF_LOOP, value);
        self
    }
}

/// ---- `JumpControlInfo` const fn methods ----
impl JumpControlInfo {
    pub(crate) const fn label(&self) -> Option<Sym> {
        self.label
    }

    pub(crate) const fn start_address(&self) -> Address {
        self.start_address
    }

    pub(crate) const fn is_loop(&self) -> bool {
        self.flags.contains(JumpControlInfoFlags::LOOP)
    }

    pub(crate) const fn is_switch(&self) -> bool {
        self.flags.contains(JumpControlInfoFlags::SWITCH)
    }

    pub(crate) const fn is_try_with_finally_block(&self) -> bool {
        self.finally_throw.is_some()
    }

    pub(crate) const fn is_labelled(&self) -> bool {
        self.flags.contains(JumpControlInfoFlags::LABELLED)
    }

    pub(crate) const fn in_finally(&self) -> bool {
        self.flags.contains(JumpControlInfoFlags::IN_FINALLY)
    }

    pub(crate) const fn use_expr(&self) -> bool {
        self.flags.contains(JumpControlInfoFlags::USE_EXPR)
    }

    pub(crate) const fn iterator_loop(&self) -> bool {
        self.flags.contains(JumpControlInfoFlags::ITERATOR_LOOP)
    }

    pub(crate) const fn for_await_of_loop(&self) -> bool {
        self.flags.contains(JumpControlInfoFlags::FOR_AWAIT_OF_LOOP)
    }
}

/// ---- `JumpControlInfo` interaction methods ----
impl JumpControlInfo {
    /// Sets the `label` field of `JumpControlInfo`.
    pub(crate) fn set_label(&mut self, label: Option<Sym>) {
        assert!(self.label.is_none());
        self.label = label;
    }

    /// Sets the `start_address` field of `JumpControlInfo`.
    pub(crate) fn set_start_address(&mut self, start_address: Address) {
        self.start_address = start_address;
    }
}

// `JumpControlInfo` related methods that are implemented on `ByteCompiler`.
impl ByteCompiler<'_> {
    /// Pushes a generic `JumpControlInfo` onto `ByteCompiler`
    ///
    /// Default `JumpControlInfoKind` is `JumpControlInfoKind::Loop`
    pub(crate) fn push_empty_loop_jump_control(&mut self, use_expr: bool) {
        let new_info =
            JumpControlInfo::new(self.current_open_environments_count).with_loop_flag(true);
        self.push_control_info(new_info, use_expr);
    }

    pub(crate) fn current_jump_control_mut(&mut self) -> Option<&mut JumpControlInfo> {
        self.jump_info.last_mut()
    }

    pub(crate) fn push_control_info(&mut self, mut info: JumpControlInfo, use_expr: bool) {
        info.flags.set(JumpControlInfoFlags::USE_EXPR, use_expr);

        if let Some(last) = self.jump_info.last() {
            // Inherits the `JumpControlInfoFlags::USE_EXPR` flag.
            info.flags |= last.flags & JumpControlInfoFlags::USE_EXPR;
        }

        self.jump_info.push(info);
    }

    /// Pushes an exception [`Handler`].
    ///
    /// Must be patched with [`Self::patch_handler()`].
    #[must_use]
    pub(crate) fn push_handler(&mut self) -> u32 {
        let handler_index = self.handlers.len() as u32;
        let start_address = self.next_opcode_location();

        let environment_count = self.current_open_environments_count;
        self.handlers.push(Handler {
            start: start_address,
            end: Self::DUMMY_ADDRESS,
            environment_count,
        });

        handler_index
    }

    pub(crate) fn patch_handler(&mut self, handler_index: u32) {
        let handler_index = handler_index as usize;
        let handler_address = self.next_opcode_location();

        assert_eq!(
            self.handlers[handler_index].end,
            Self::DUMMY_ADDRESS,
            "handler already set"
        );
        assert!(
            handler_address >= self.handlers[handler_index].start,
            "handler end is before that start"
        );

        self.handlers[handler_index].end = handler_address;
    }

    /// Does the jump control info have the `use_expr` flag set to true.
    ///
    /// See [`JumpControlInfoFlags`].
    pub(crate) fn jump_control_info_has_use_expr(&self) -> bool {
        if let Some(last) = self.jump_info.last() {
            return last.use_expr();
        }

        false
    }

    // ---- Labelled Statement JumpControlInfo methods ---- //

    /// Pushes a `LabelledStatement`'s `JumpControlInfo` onto the `jump_info` stack.
    pub(crate) fn push_labelled_control_info(
        &mut self,
        label: Sym,
        start_address: Address,
        use_expr: bool,
    ) {
        let new_info = JumpControlInfo::new(self.current_open_environments_count)
            .with_labelled_block_flag(true)
            .with_label(Some(label))
            .with_start_address(start_address);

        self.push_control_info(new_info, use_expr);
    }

    /// Pops and handles the info for a label's `JumpControlInfo`
    ///
    /// # Panic
    ///  - Will panic if `jump_info` stack is empty.
    ///  - Will panic if popped `JumpControlInfo` is not for a `LabelledStatement`.
    pub(crate) fn pop_labelled_control_info(&mut self) {
        assert!(!self.jump_info.is_empty());
        let info = self.jump_info.pop().expect("no jump information found");

        assert!(info.is_labelled());
        assert!(info.label().is_some());

        let start_address = info.start_address();
        for jump_record in info.jumps {
            jump_record.perform_actions(start_address, self);
        }
    }
    // ---- `IterationStatement`'s `JumpControlInfo` methods ---- //

    /// Pushes an `WhileStatement`, `ForStatement` or `DoWhileStatement`'s `JumpControlInfo` on to the `jump_info` stack.
    pub(crate) fn push_loop_control_info(
        &mut self,
        label: Option<Sym>,
        start_address: Address,
        use_expr: bool,
    ) {
        let new_info = JumpControlInfo::new(self.current_open_environments_count)
            .with_loop_flag(true)
            .with_label(label)
            .with_start_address(start_address);

        self.push_control_info(new_info, use_expr);
    }

    /// Pushes a `ForInOfStatement`'s `JumpControlInfo` on to the `jump_info` stack.
    pub(crate) fn push_loop_control_info_for_of_in_loop(
        &mut self,
        label: Option<Sym>,
        start_address: Address,
        use_expr: bool,
    ) {
        let new_info = JumpControlInfo::new(self.current_open_environments_count)
            .with_loop_flag(true)
            .with_label(label)
            .with_start_address(start_address)
            .with_iterator_loop(true);

        self.push_control_info(new_info, use_expr);
    }

    pub(crate) fn push_loop_control_info_for_await_of_loop(
        &mut self,
        label: Option<Sym>,
        start_address: Address,
        use_expr: bool,
    ) {
        let new_info = JumpControlInfo::new(self.current_open_environments_count)
            .with_loop_flag(true)
            .with_label(label)
            .with_start_address(start_address)
            .with_iterator_loop(true)
            .with_for_await_of_loop(true);

        self.push_control_info(new_info, use_expr);
    }

    /// Pops and handles the info for a loop control block's `JumpControlInfo`
    ///
    /// # Panic
    ///  - Will panic if `jump_info` stack is empty.
    ///  - Will panic if popped `JumpControlInfo` is not for a loop block.
    pub(crate) fn pop_loop_control_info(&mut self) {
        assert!(!self.jump_info.is_empty());
        let info = self.jump_info.pop().expect("no jump information found");

        assert!(info.is_loop());

        let start_address = info.start_address();
        for jump_record in info.jumps {
            jump_record.perform_actions(start_address, self);
        }
    }

    // ---- `SwitchStatement` `JumpControlInfo` methods ---- //

    /// Pushes a `SwitchStatement`'s `JumpControlInfo` on to the `jump_info` stack.
    pub(crate) fn push_switch_control_info(
        &mut self,
        label: Option<Sym>,
        start_address: Address,
        use_expr: bool,
    ) {
        let new_info = JumpControlInfo::new(self.current_open_environments_count)
            .with_switch_flag(true)
            .with_label(label)
            .with_start_address(start_address);

        self.push_control_info(new_info, use_expr);
    }

    /// Pops and handles the info for a switch block's `JumpControlInfo`
    ///
    /// # Panic
    ///  - Will panic if `jump_info` stack is empty.
    ///  - Will panic if popped `JumpControlInfo` is not for a switch block.
    pub(crate) fn pop_switch_control_info(&mut self) {
        assert!(!self.jump_info.is_empty());
        let info = self.jump_info.pop().expect("no jump information found");

        assert!(info.is_switch());

        let start_address = info.start_address();
        for jump_record in info.jumps {
            jump_record.perform_actions(start_address, self);
        }
    }

    // ---- `TryStatement`'s `JumpControlInfo` methods ---- //

    /// Pushes a `TryStatement`'s `JumpControlInfo` onto the `jump_info` stack.
    pub(crate) fn push_try_with_finally_control_info(
        &mut self,
        flag: &Register,
        index: &Register,
        use_expr: bool,
    ) {
        let new_info = JumpControlInfo::new(self.current_open_environments_count)
            .with_try_with_finally_flag(flag, index);

        self.push_control_info(new_info, use_expr);
    }

    /// Pops and handles the info for a try statement with a finally block.
    ///
    /// # Panic
    ///  - Will panic if popped `JumpControlInfo` is not for a try block.
    pub(crate) fn pop_try_with_finally_control_info(&mut self, finally_start: Address) {
        assert!(!self.jump_info.is_empty());
        let info = self.jump_info.pop().expect("no jump information found");

        assert!(info.is_try_with_finally_block());

        if info.jumps.is_empty() {
            return;
        }

        let (_, finally_throw_index) = info.finally_throw.expect("try with finally");

        for JumpRecord { label, .. } in &info.jumps {
            self.patch_jump_with_target(*label, finally_start);
        }

        // The jump table holds `info.jumps.len() + 1` entries. Entry 0 is the
        // fallthrough target, taken when no `break`, `continue`, or `return`
        // inside the protected region selected a jump record (the index
        // register keeps its initial value of `0`). Entries `1..=N` correspond
        // to the registered jump records and are selected by `HandleFinally`.
        // NOTE: +4 to jump past the index operand.
        let jump_table_index = self.next_opcode_location() + size_of::<u32>() as u32;
        self.bytecode.emit_jump_table(
            finally_throw_index,
            thin_vec![Self::DUMMY_ADDRESS; info.jumps.len() + 1],
        );

        // Skip the jump-record handlers when falling through.
        let fallthrough = self.jump();

        let mut patch_jumps = vec![Self::DUMMY_ADDRESS; info.jumps.len() + 1];
        // Handle breaks/continue/returns in a finally block
        for i in 0..info.jumps.len() {
            patch_jumps[i + 1] = self.next_opcode_location();

            let jump_record = info.jumps[i].clone();
            jump_record.perform_actions(Self::DUMMY_ADDRESS, self);
        }

        self.patch_jump(fallthrough);
        patch_jumps[0] = self.next_opcode_location();

        self.bytecode
            .patch_jump_table(jump_table_index, &patch_jumps);
    }

    pub(crate) fn jump_info_open_environment_count(&self, index: usize) -> u32 {
        let current = &self.jump_info[index];
        if let Some(next) = self.jump_info.get(index + 1) {
            return next.current_open_environments_count - current.current_open_environments_count;
        }

        self.current_open_environments_count - current.current_open_environments_count
    }
}
