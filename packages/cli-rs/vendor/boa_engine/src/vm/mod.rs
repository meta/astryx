//! Boa's ECMAScript Virtual Machine
//!
//! The Virtual Machine (VM) handles generating instructions, then executing them.
//! This module will provide an instruction set for the AST to use, various traits,
//! plus an interpreter to execute those instructions

use crate::{
    Context, JsError, JsExpect, JsNativeError, JsObject, JsResult, JsString, JsValue, Module,
    builtins::promise::{PromiseCapability, ResolvingFunctions},
    environments::EnvironmentStack,
    error::RuntimeLimitError,
    object::JsFunction,
    realm::Realm,
    script::Script,
    vm::opcode::{OPCODE_HANDLERS, OPCODE_HANDLERS_BUDGET},
    vm::shadow_stack::ErrorStack,
};
use boa_gc::{Finalize, Gc, Trace, custom_trace};
use shadow_stack::ShadowStack;
use std::{future::Future, ops::ControlFlow, path::Path, pin::Pin, task};

#[cfg(feature = "trace")]
use crate::sys::time::Instant;

#[allow(unused_imports)]
pub(crate) use opcode::{Instruction, InstructionIterator, Opcode};

pub(crate) use {
    call_frame::CallFrameFlags,
    code_block::{
        CodeBlockFlags, Constant, Handler, create_function_object, create_function_object_fast,
    },
    completion_record::CompletionRecord,
    inline_cache::InlineCache,
};

pub use runtime_limits::RuntimeLimits;
pub use {
    call_frame::{CallFrame, GeneratorResumeKind},
    code_block::CodeBlock,
    source_info::{NativeSourceInfo, SourcePath},
};

pub(crate) use code_block::GlobalFunctionBinding;

mod call_frame;
mod code_block;
mod completion_record;
mod inline_cache;
mod runtime_limits;

pub(crate) mod opcode;
pub(crate) mod shadow_stack;
pub(crate) mod source_info;

#[cfg(feature = "flowgraph")]
pub mod flowgraph;

#[cfg(test)]
mod tests;

/// Virtual Machine.
#[derive(Debug)]
pub struct Vm {
    /// The call frame stack.
    ///
    /// The current frame is always the last element. A dummy frame is always
    /// present at position 0 so the stack is never empty.
    pub(crate) frames: Vec<CallFrame>,

    pub(crate) stack: Stack,

    pub(crate) return_value: JsValue,

    /// When an error is thrown, the pending exception is set.
    ///
    /// If we throw an empty exception ([`None`]), this means that `return()` was called on a generator,
    /// propagating though the exception handlers and executing the finally code (if any).
    ///
    /// See [`ReThrow`](crate::vm::Opcode::ReThrow) and [`ReThrow`](crate::vm::Opcode::Exception) opcodes.
    ///
    /// This eliminates the conversion between [`crate::JsNativeError`] and [`crate::JsValue`] if not needed.
    pub(crate) pending_exception: Option<JsError>,
    pub(crate) runtime_limits: RuntimeLimits,

    /// This is used to assign a native (rust) function as the active function,
    /// because we don't push a frame for them.
    pub(crate) native_active_function: Option<JsObject>,

    /// Number of nested host calls that re-enter the VM via `Context::run()`.
    ///
    /// This is incremented by high-level host entry points such as
    /// [`JsObject::call`](crate::object::JsObject::call) and
    /// [`JsObject::construct`](crate::object::JsObject::construct).
    pub(crate) host_call_depth: usize,

    pub(crate) shadow_stack: ShadowStack,

    #[cfg(feature = "trace")]
    pub(crate) trace: bool,
    #[cfg(feature = "trace")]
    pub(crate) current_frame: Option<*const CallFrame>,
}

/// The stack holds the [`JsValue`]s for the calling convention and registers.
///
/// The stack is persistent across frames.
/// It's addressing is relative to the frame pointer (`fp`) in each [`CallFrame`].
///
/// The stack stores the following elements:
/// - The function prologue
///   - The `this` value of the function
///   - The function object itself
/// - The arguments of the function
/// - The register file for the frame
/// - Some manually pushed values like the return value of a function.
///
/// ```text
///  Stack: | this | func | arg1 | ... | argN | reg0 | reg1 | ... | regK |
///           ▲                                  ▲
///           └─ fp                              └─ rp
/// ```
#[derive(Clone, Debug, Trace, Finalize)]
pub(crate) struct Stack {
    stack: Vec<JsValue>,
}

impl Stack {
    /// Creates a new stack with the given capacity.
    fn new(capacity: usize) -> Self {
        Self {
            stack: Vec::with_capacity(capacity),
        }
    }

    /// Get a register value by index, relative to the given frame's `rp`.
    pub(crate) fn get_register(&self, frame: &CallFrame, index: usize) -> Option<&JsValue> {
        self.stack.get(frame.rp as usize + index)
    }

    /// Set a register value by index, relative to the given frame's `rp`.
    pub(crate) fn set_register(&mut self, frame: &CallFrame, index: usize, value: JsValue) {
        self.stack[frame.rp as usize + index] = value;
    }

    /// Truncate the stack to the given frame.
    pub(crate) fn truncate_to_frame(&mut self, frame: &CallFrame) {
        self.stack.truncate(frame.frame_pointer());
    }

    /// Split the stack at the given frame.
    pub(crate) fn split_off_frame(&mut self, frame: &CallFrame) -> Self {
        let frame_pointer = frame.frame_pointer();
        Self {
            stack: self.stack.split_off(frame_pointer),
        }
    }

    /// Get the `this` value of the given frame.
    pub(crate) fn get_this(&self, frame: &CallFrame) -> JsValue {
        self.stack[frame.this_index()].clone()
    }

    /// Set the `this` value of the given frame.
    pub(crate) fn set_this(&mut self, frame: &CallFrame, this: JsValue) {
        self.stack[frame.this_index()] = this;
    }

    /// Get the function object of the given frame.
    pub(crate) fn get_function(&self, frame: &CallFrame) -> Option<JsObject> {
        if let Some(object) = self.stack[frame.function_index()].as_object() {
            return Some(object.clone());
        }
        None
    }

    /// Get the function arguments of the given frame.
    pub(crate) fn get_arguments(&self, frame: &CallFrame) -> &[JsValue] {
        &self.stack[frame.arguments_range()]
    }

    /// Get a single function argument of the given frame by index.
    pub(crate) fn get_argument(&self, frame: &CallFrame, index: usize) -> Option<&JsValue> {
        self.get_arguments(frame).get(index)
    }

    /// Get the rest arguments of the given frame.
    pub(crate) fn pop_rest_arguments(&mut self, frame: &CallFrame) -> Option<Vec<JsValue>> {
        let argument_count = frame.argument_count as usize;
        let param_count = frame.code_block().parameter_length as usize;
        if argument_count < param_count {
            return None;
        }
        let args_start = frame.fp as usize + CallFrame::FUNCTION_PROLOGUE as usize;
        let args_end = args_start + argument_count;
        let rest_count = argument_count - param_count + 1;

        Some(
            self.stack
                .drain((args_end - rest_count)..args_end)
                .collect(),
        )
    }

    /// Push a value on the stack.
    pub(crate) fn push<T>(&mut self, value: T)
    where
        T: Into<JsValue>,
    {
        self.stack.push(value.into());
    }

    /// Pop a value off the stack.
    ///
    /// # Panics
    ///
    /// If there is nothing to pop, then this will panic.
    #[track_caller]
    pub(crate) fn pop(&mut self) -> JsValue {
        self.stack.pop().expect("stack was empty")
    }

    /// Pop the function arguments according to the calling convention.
    /// This will pop the last `argument_count` values from the stack.
    pub(crate) fn calling_convention_pop_arguments(
        &mut self,
        argument_count: usize,
    ) -> Vec<JsValue> {
        let index = self.stack.len() - argument_count;
        self.stack.split_off(index)
    }

    /// Push the function arguments according to the calling convention.
    /// This will push the given values onto the stack.
    pub(crate) fn calling_convention_push_arguments(&mut self, values: &[JsValue]) {
        self.stack.extend_from_slice(values);
    }

    /// Get the function object at the top of the stack according to the calling convention.
    #[track_caller]
    pub(crate) fn calling_convention_get_function(&self, argument_count: usize) -> &JsValue {
        let index = self.stack.len() - 1 - argument_count;
        self.stack
            .get(index)
            .expect("invalid calling convention function index")
    }

    /// Set the function object value at the top of the stack according to the calling convention.
    #[track_caller]
    pub(crate) fn calling_convention_set_function(
        &mut self,
        argument_count: usize,
        function: JsValue,
    ) {
        let index = self.stack.len() - 1 - argument_count;
        self.stack[index] = function;
    }

    /// Set the `this` value at the top of the stack according to the calling convention.
    #[track_caller]
    pub(crate) fn calling_convention_set_this(&mut self, argument_count: usize, function: JsValue) {
        let index = self.stack.len() - 2 - argument_count;
        self.stack[index] = function;
    }

    /// Insert the function arguments at the top of the stack according to the calling convention.
    /// This will insert the given values at the position of the function arguments.
    pub(crate) fn calling_convention_insert_arguments(
        &mut self,
        existing_argument_count: usize,
        arguments: &[JsValue],
    ) {
        let index = self.stack.len() - existing_argument_count;
        self.stack.splice(index..index, arguments.iter().cloned());
    }

    #[cfg(feature = "trace")]
    const MAX_VALUE_LEN: usize = 18;
    #[cfg(feature = "trace")]
    const MAX_STACK_WIDTH: usize = 68;

    #[cfg(feature = "trace")]
    fn raw_value(value: &JsValue) -> String {
        match value {
            v if v.is_callable() => "func".to_string(),
            v if v.is_object() => "obj".to_string(),
            v if v.is_undefined() => "und".to_string(),
            v if v.is_null() => "null".to_string(),
            v => v.display().to_string(),
        }
    }

    #[cfg(feature = "trace")]
    fn truncate_display(val: &str) -> String {
        if val.len() <= Self::MAX_VALUE_LEN {
            return val.to_string();
        }
        let mut end = Self::MAX_VALUE_LEN - 2;
        while !val.is_char_boundary(end) && end > 0 {
            end -= 1;
        }
        format!("{}..", &val[..end])
    }

    #[cfg(feature = "trace")]
    fn display_trace(&self, frame: &CallFrame, frame_count: usize) -> String {
        let total = self.stack.len();
        if total == 0 {
            return "[ <empty> ]".to_string();
        }

        let mut groups: Vec<(String, usize, Option<usize>)> = Vec::new();
        let mut force_truncate = false;

        // Lazily group values to avoid eagerly evaluating `raw_value` for the entire stack.
        for (idx, v) in self.stack.iter().enumerate().rev() {
            let is_frame = frame.frame_pointer() == idx;
            let raw = Self::raw_value(v);

            if !is_frame
                && let Some(last) = groups.last_mut()
                && last.0 == raw
                && last.2.is_none()
            {
                last.1 += 1;
            } else {
                let marker = if is_frame { Some(frame_count) } else { None };
                groups.push((raw, 1, marker));

                // If groups is large enough to mathematically guarantee overflowing the display width,
                // we can stop evaluating to save instruction budget / time.
                if groups.len() > Self::MAX_STACK_WIDTH / 2 {
                    force_truncate = true;
                    break;
                }
            }
        }

        let mut string = String::from("[ ");
        let mut truncated = force_truncate;
        let suffix = format!(".. ({total} total) ]");

        for (i, (val, count, marker)) in groups.iter().enumerate() {
            let display_val = Self::truncate_display(val);
            let part = if *count > 1 {
                format!("{display_val} (x{count})")
            } else {
                display_val
            };

            let separator = if let Some(fc) = marker {
                format!(" |{fc}|")
            } else if i + 1 < groups.len() {
                ",".to_string()
            } else {
                String::new()
            };

            let addition = format!("{part}{separator} ");
            if string.len() + addition.len() + suffix.len() > Self::MAX_STACK_WIDTH {
                truncated = true;
                break;
            }
            string.push_str(&addition);
        }

        if truncated {
            string.push_str(&suffix);
        } else {
            string.push(']');
        }
        string
    }
}

/// Active runnable in the current vm context.
#[derive(Debug, Clone, Finalize)]
pub enum ActiveRunnable {
    /// A [**Script Record**](https://tc39.es/ecma262/#sec-script-records)
    Script(Script),
    /// A [**Source Text Module Record**](https://tc39.es/ecma262/#sec-source-text-module-records).
    Module(Module),
}

unsafe impl Trace for ActiveRunnable {
    custom_trace!(this, mark, {
        match this {
            Self::Script(script) => mark(script),
            Self::Module(module) => mark(module),
        }
    });
}

impl ActiveRunnable {
    /// Gets the path of the runnable, if it has one.
    #[must_use]
    pub fn path(&self) -> Option<&Path> {
        match self {
            Self::Script(script) => script.path(),
            Self::Module(module) => module.path(),
        }
    }
}

impl Vm {
    /// Creates a new virtual machine.
    pub(crate) fn new(realm: Realm) -> Self {
        let mut frames = Vec::with_capacity(16);
        frames.push(CallFrame::new(
            Gc::new(CodeBlock::new(JsString::default(), 0, true)),
            None,
            EnvironmentStack::new(),
            realm,
        ));
        Self {
            frames,
            stack: Stack::new(1024),
            return_value: JsValue::undefined(),
            pending_exception: None,
            runtime_limits: RuntimeLimits::default(),
            native_active_function: None,
            host_call_depth: 0,
            shadow_stack: ShadowStack::default(),
            #[cfg(feature = "trace")]
            trace: false,
            #[cfg(feature = "trace")]
            current_frame: None,
        }
    }

    #[track_caller]
    #[inline]
    pub(crate) fn set_register(&mut self, index: usize, value: JsValue) {
        let rp = self.frame().rp as usize;
        debug_assert!(
            rp + index < self.stack.stack.len(),
            "register index out of bounds: rp {rp}, index {index}, stack len {}",
            self.stack.stack.len()
        );
        // SAFETY: Register indices are determined by the bytecode compiler and are
        // guaranteed to be within the register bounds for well-formed bytecode. The
        // debug_assert above catches any compiler bugs during development.
        unsafe {
            *self.stack.stack.get_unchecked_mut(rp + index) = value;
        }
    }

    #[track_caller]
    #[inline]
    pub(crate) fn get_register(&self, index: usize) -> &JsValue {
        let rp = self.frame().rp as usize;
        debug_assert!(
            rp + index < self.stack.stack.len(),
            "register index out of bounds: rp {rp}, index {index}, stack len {}",
            self.stack.stack.len()
        );
        // SAFETY: Register indices are determined by the bytecode compiler and are
        // guaranteed to be within the register bounds for well-formed bytecode. The
        // debug_assert above catches any compiler bugs during development.
        unsafe { self.stack.stack.get_unchecked(rp + index) }
    }

    /// Takes the value from a register, replacing it with `undefined`.
    ///
    /// Use this instead of `get_register().clone()` when the register value is
    /// consumed and won't be read again, to avoid unnecessary Gc refcount increments.
    #[track_caller]
    #[inline]
    pub(crate) fn take_register(&mut self, index: usize) -> JsValue {
        let rp = self.frame().rp as usize;
        debug_assert!(
            rp + index < self.stack.stack.len(),
            "register index out of bounds: rp {rp}, index {index}, stack len {}",
            self.stack.stack.len()
        );
        // SAFETY: Register indices are determined by the bytecode compiler and are
        // guaranteed to be within the register bounds for well-formed bytecode. The
        // debug_assert above catches any compiler bugs during development.
        unsafe { std::mem::take(self.stack.stack.get_unchecked_mut(rp + index)) }
    }

    /// Set the promise capability for the current frame.
    #[track_caller]
    pub(crate) fn set_promise_capability(
        &mut self,
        promise_capability: PromiseCapability,
    ) -> JsResult<()> {
        #[cfg(debug_assertions)]
        {
            if !self.frame().code_block().is_async() {
                return Err(crate::error::PanicError::new(
                    "only async functions and modules with a top-level-await \
                    can have a promise capability",
                )
                .into());
            }
        }

        let rp = self.frame().rp as usize;
        self.stack.stack[rp + CallFrame::PROMISE_CAPABILITY_PROMISE_REGISTER_INDEX] =
            promise_capability.promise.into();
        self.stack.stack[rp + CallFrame::PROMISE_CAPABILITY_RESOLVE_REGISTER_INDEX] =
            promise_capability.functions.resolve.into();
        self.stack.stack[rp + CallFrame::PROMISE_CAPABILITY_REJECT_REGISTER_INDEX] =
            promise_capability.functions.reject.into();

        Ok(())
    }

    /// Get the promise capability for the current frame.
    #[track_caller]
    pub(crate) fn get_promise_capability(&self) -> JsResult<PromiseCapability> {
        #[cfg(debug_assertions)]
        if !self.frame().code_block().is_async() {
            return Err(crate::error::PanicError::new(
                "cannot get promise capability from non-async code",
            )
            .into());
        }

        let rp = self.frame().rp as usize;
        let promise = self
            .stack
            .stack
            .get(rp + CallFrame::PROMISE_CAPABILITY_PROMISE_REGISTER_INDEX)
            .and_then(JsValue::as_object)
            .js_expect("registers must have a promise capability")?;
        let resolve = self
            .stack
            .stack
            .get(rp + CallFrame::PROMISE_CAPABILITY_RESOLVE_REGISTER_INDEX)
            .and_then(JsValue::as_object)
            .and_then(JsFunction::from_object)
            .js_expect("registers must have a resolve function")?;
        let reject = self
            .stack
            .stack
            .get(rp + CallFrame::PROMISE_CAPABILITY_REJECT_REGISTER_INDEX)
            .and_then(JsValue::as_object)
            .and_then(JsFunction::from_object)
            .js_expect("registers must have a reject function")?;

        Ok(PromiseCapability {
            promise,
            functions: ResolvingFunctions { resolve, reject },
        })
    }

    /// Get the async generator object for the current frame.
    #[track_caller]
    pub(crate) fn async_generator_object(&self) -> Option<JsObject> {
        if !self.frame().code_block().is_async_generator() {
            return None;
        }

        let rp = self.frame().rp as usize;
        self.stack
            .stack
            .get(rp + CallFrame::ASYNC_GENERATOR_OBJECT_REGISTER_INDEX)
            .expect("registers must have an async generator object")
            .as_object()
    }

    /// Retrieves the VM frame.
    ///
    /// NOTE: When you need a `&CallFrame` alongside a mutable borrow of another
    /// `Vm` field (e.g. `stack`), use `self.vm.frames.last().expect("frame must exist")` instead
    /// so that the borrow checker can split the borrows.
    #[track_caller]
    #[inline]
    pub(crate) fn frame(&self) -> &CallFrame {
        // SAFETY: `frames` always contains at least the dummy frame.
        unsafe { self.frames.last().unwrap_unchecked() }
    }

    /// Retrieves the VM frame mutably.
    ///
    /// NOTE: When you need a `&mut CallFrame` alongside a mutable borrow of another
    /// `Vm` field (e.g. `stack`), use `self.vm.frames.last_mut().expect("frame must exist")` instead
    /// so that the borrow checker can split the borrows.
    #[track_caller]
    #[inline]
    pub(crate) fn frame_mut(&mut self) -> &mut CallFrame {
        // SAFETY: `frames` always contains at least the dummy frame.
        unsafe { self.frames.last_mut().unwrap_unchecked() }
    }

    pub(crate) fn push_frame(&mut self, mut frame: CallFrame) {
        // Each function call starts with an implicit `undefined` return value.
        self.return_value = JsValue::undefined();

        // NOTE: We need to check if we already pushed the registers,
        //       since generator-like functions push the same call
        //       frame with pre-built stack and registers (fp and rp already set).
        if !frame.registers_already_pushed() {
            let current_stack_length = self.stack.stack.len() as u32;
            frame.fp = current_stack_length - frame.argument_count - CallFrame::FUNCTION_PROLOGUE;

            let register_count = frame.code_block.register_count as usize;
            frame.rp = self.stack.stack.len() as u32;
            self.stack.stack.resize(
                self.stack.stack.len() + register_count,
                JsValue::undefined(),
            );
        }

        // Keep carrying the last active runnable in case the current callframe
        // yields.
        if frame.active_runnable.is_none() {
            let current = self.frame();
            frame.active_runnable.clone_from(&current.active_runnable);
        }

        let current_pc = self.frame().pc;
        self.shadow_stack
            .push_bytecode(current_pc, frame.code_block().source_info.clone());

        self.frames.push(frame);
    }

    pub(crate) fn push_frame_with_stack(
        &mut self,
        frame: CallFrame,
        this: JsValue,
        function: JsValue,
    ) {
        self.stack.push(this);
        self.stack.push(function);

        self.push_frame(frame);
    }

    pub(crate) fn pop_frame(&mut self) -> Option<CallFrame> {
        // Don't pop the dummy frame (index 0).
        if self.frames.len() <= 1 {
            return None;
        }
        self.shadow_stack.pop();
        self.frames.pop()
    }

    /// Handles an exception thrown at position `pc`.
    ///
    /// Returns `true` if the exception was handled, `false` otherwise.
    #[inline]
    pub(crate) fn handle_exception_at(&mut self, pc: u32) -> bool {
        let frame = self.frame_mut();
        let Some((_, handler)) = frame.code_block().find_handler(pc) else {
            return false;
        };

        let catch_address = handler.handler();
        let environment_sp = frame.env_fp + handler.environment_count;

        // Go to handler location.
        frame.pc = u32::from(catch_address);

        self.frame_mut()
            .environments
            .truncate(environment_sp as usize);

        true
    }

    pub(crate) fn get_return_value(&self) -> JsValue {
        self.return_value.clone()
    }

    pub(crate) fn set_return_value(&mut self, value: JsValue) {
        self.return_value = value;
    }

    pub(crate) fn take_return_value(&mut self) -> JsValue {
        std::mem::take(&mut self.return_value)
    }
}

#[allow(clippy::print_stdout)]
#[cfg(feature = "trace")]
impl Context {
    const COLUMN_WIDTH: usize = 26;
    const TIME_COLUMN_WIDTH: usize = Self::COLUMN_WIDTH / 2;
    const OPCODE_COLUMN_WIDTH: usize = Self::COLUMN_WIDTH;
    const OPERAND_COLUMN_WIDTH: usize = Self::COLUMN_WIDTH;
    const NUMBER_OF_COLUMNS: usize = 4;

    pub(crate) fn trace_call_frame(&self) {
        let frame = self.vm.frame();
        let msg = if self.vm.frames.is_empty() {
            " VM Start ".to_string()
        } else {
            format!(
                " Call Frame '{}'{} ",
                frame.code_block().name().to_std_string_escaped(),
                if frame.code_block().name().is_empty() {
                    format!(" [anon#{}]", frame.code_block().debug_id)
                } else {
                    String::new()
                }
            )
        };

        // Only print a functions compiled output if it has not been printed already
        if !frame.code_block.traced.get() {
            println!("{}", frame.code_block);
            frame.code_block.traced.set(true);
        }
        println!(
            "{msg:-^width$}",
            width = Self::COLUMN_WIDTH * Self::NUMBER_OF_COLUMNS - 10
        );
        println!(
            "{:<TIME_COLUMN_WIDTH$} {:<OPCODE_COLUMN_WIDTH$} {:<OPERAND_COLUMN_WIDTH$} Stack\n",
            "Time",
            "Opcode",
            "Operands",
            TIME_COLUMN_WIDTH = Self::TIME_COLUMN_WIDTH,
            OPCODE_COLUMN_WIDTH = Self::OPCODE_COLUMN_WIDTH,
            OPERAND_COLUMN_WIDTH = Self::OPERAND_COLUMN_WIDTH,
        );
    }

    fn trace_execute_instruction<F>(
        &mut self,
        f: F,
        opcode: Opcode,
    ) -> ControlFlow<CompletionRecord>
    where
        F: FnOnce(&mut Context, Opcode) -> ControlFlow<CompletionRecord>,
    {
        if self.vm.current_frame != Some(self.vm.frame()) {
            println!();
            self.trace_call_frame();
            self.vm.current_frame = Some(self.vm.frame());
        }
        let frame = self.vm.frame();
        let (instruction, _) = frame
            .code_block
            .bytecode
            .next_instruction(frame.pc as usize);
        let operands = self
            .vm
            .frame()
            .code_block()
            .instruction_operands(&instruction);

        let instant = Instant::now();
        let result = self.execute_instruction(f, opcode);
        let duration = instant.elapsed();

        let stack = self
            .vm
            .stack
            .display_trace(self.vm.frame(), self.vm.frames.len() - 1);

        println!(
            "{:<TIME_COLUMN_WIDTH$} {:<OPCODE_COLUMN_WIDTH$} {operands:<OPERAND_COLUMN_WIDTH$} {stack}",
            format!("{}μs", duration.as_micros()),
            opcode.as_str().to_string(),
            TIME_COLUMN_WIDTH = Self::TIME_COLUMN_WIDTH,
            OPCODE_COLUMN_WIDTH = Self::OPCODE_COLUMN_WIDTH,
            OPERAND_COLUMN_WIDTH = Self::OPERAND_COLUMN_WIDTH,
        );

        result
    }
}

impl Context {
    fn execute_instruction<F>(&mut self, f: F, opcode: Opcode) -> ControlFlow<CompletionRecord>
    where
        F: FnOnce(&mut Context, Opcode) -> ControlFlow<CompletionRecord>,
    {
        f(self, opcode)
    }

    fn execute_one<F>(&mut self, f: F, opcode: Opcode) -> ControlFlow<CompletionRecord>
    where
        F: FnOnce(&mut Context, Opcode) -> ControlFlow<CompletionRecord>,
    {
        #[cfg(feature = "fuzz")]
        {
            use crate::error::EngineError;
            if self.instructions_remaining == 0 {
                return ControlFlow::Break(CompletionRecord::Throw(
                    EngineError::NoInstructionsRemain.into(),
                ));
            }
            self.instructions_remaining -= 1;
        }

        #[cfg(feature = "trace")]
        if self.vm.trace || self.vm.frame().code_block.traceable() {
            self.trace_execute_instruction(f, opcode)
        } else {
            self.execute_instruction(f, opcode)
        }

        #[cfg(not(feature = "trace"))]
        self.execute_instruction(f, opcode)
    }

    fn handle_error(&mut self, mut err: JsError) -> ControlFlow<CompletionRecord> {
        // Capture the backtrace early, before any exception handler check,
        // so that errors caught by internal handlers (e.g. async module
        // evaluation) still carry source position information.
        if err.backtrace.is_none() {
            err.backtrace = Some(
                self.vm
                    .shadow_stack
                    .take(self.vm.runtime_limits.backtrace_limit(), self.vm.frame().pc),
            );
        }

        // If we hit the execution step limit, bubble up the error to the
        // (Rust) caller instead of trying to handle as an exception.
        if !err.is_catchable() {
            let mut frame = None;
            let mut env_fp = self.vm.frame().environments.len();
            loop {
                if self.vm.frame().exit_early() {
                    break;
                }

                env_fp = self.vm.frame().env_fp as usize;

                let Some(f) = self.vm.pop_frame() else {
                    break;
                };
                frame = Some(f);
            }
            self.vm.frame_mut().environments.truncate(env_fp);
            if let Some(frame) = frame {
                self.vm.stack.truncate_to_frame(&frame);
            }
            return ControlFlow::Break(CompletionRecord::Throw(err));
        }

        if let Some(native) = err.as_native_mut()
            && let ErrorStack::Position(position) = &mut native.stack.0
        {
            let backtrace = self.vm.shadow_stack.take_and_push(
                self.vm.runtime_limits.backtrace_limit(),
                self.vm.frame().pc,
                position.clone(),
            );
            native.stack.0 = ErrorStack::Backtrace(backtrace);
        }

        // Note: -1 because we increment after fetching the opcode.
        let pc = self.vm.frame().pc.saturating_sub(1);
        if self.vm.handle_exception_at(pc) {
            self.vm.pending_exception = Some(err);
            return ControlFlow::Continue(());
        }

        // Inject realm before crossing the function boundary
        let err = err.inject_realm(self.realm().clone());

        self.vm.pending_exception = Some(err);
        self.handle_throw()
    }

    fn handle_return(&mut self) -> ControlFlow<CompletionRecord> {
        let exit_early = self.vm.frame().exit_early();
        let frame = self.vm.frames.last().expect("frame must exist");
        self.vm.stack.truncate_to_frame(frame);

        let result = self.vm.take_return_value();
        if exit_early {
            return ControlFlow::Break(CompletionRecord::Return(result));
        }

        self.vm.stack.push(result);
        self.vm.pop_frame().expect("frame must exist");
        ControlFlow::Continue(())
    }

    fn handle_yield(&mut self) -> ControlFlow<CompletionRecord> {
        let result = self.vm.take_return_value();
        if self.vm.frame().exit_early() {
            return ControlFlow::Break(CompletionRecord::Normal(result));
        }

        self.vm.stack.push(result);
        self.vm.pop_frame().expect("frame must exist");
        ControlFlow::Continue(())
    }

    fn handle_throw(&mut self) -> ControlFlow<CompletionRecord> {
        if self
            .vm
            .pending_exception
            .as_ref()
            .is_some_and(|err| err.backtrace.is_none())
        {
            let pc = self.vm.frames.last().expect("frame must exist").pc;
            let limit = self.vm.runtime_limits.backtrace_limit();
            let backtrace = self.vm.shadow_stack.take(limit, pc);
            self.vm
                .pending_exception
                .as_mut()
                .expect("pending exception must exist")
                .backtrace = Some(backtrace);
        }

        let mut env_fp = self.vm.frame().env_fp;
        if self.vm.frame().exit_early() {
            self.vm.frame_mut().environments.truncate(env_fp as usize);
            let frame = self.vm.frames.last().expect("frame must exist");
            self.vm.stack.truncate_to_frame(frame);
            return ControlFlow::Break(CompletionRecord::Throw(
                self.vm
                    .pending_exception
                    .take()
                    .expect("Err must exist for a CompletionType::Throw"),
            ));
        }

        let mut frame = self.vm.pop_frame().expect("frame must exist");

        loop {
            env_fp = self.vm.frame().env_fp;
            let pc = self.vm.frame().pc;
            let exit_early = self.vm.frame().exit_early();

            if self.vm.handle_exception_at(pc) {
                return ControlFlow::Continue(());
            }

            if exit_early {
                return ControlFlow::Break(CompletionRecord::Throw(
                    self.vm
                        .pending_exception
                        .take()
                        .expect("Err must exist for a CompletionType::Throw"),
                ));
            }

            let Some(f) = self.vm.pop_frame() else {
                break;
            };
            frame = f;
        }
        self.vm.frame_mut().environments.truncate(env_fp as usize);
        self.vm.stack.truncate_to_frame(&frame);
        ControlFlow::Continue(())
    }

    /// Runs the current frame to completion, yielding to the caller each time `budget`
    /// "clock cycles" have passed.
    #[allow(clippy::future_not_send)]
    pub(crate) async fn run_async_with_budget(&mut self, budget: u32) -> CompletionRecord {
        let mut runtime_budget: u32 = budget;

        while let Some(byte) = self
            .vm
            .frame()
            .code_block
            .bytecode
            .bytes
            .get(self.vm.frame().pc as usize)
        {
            let opcode = Opcode::decode(*byte);

            match self.execute_one(
                |context, opcode| {
                    let frame = context.vm.frame();
                    let pc = frame.pc as usize;

                    OPCODE_HANDLERS_BUDGET[opcode as usize](context, pc, &mut runtime_budget)
                },
                opcode,
            ) {
                ControlFlow::Continue(()) => {}
                ControlFlow::Break(value) => return value,
            }

            if runtime_budget == 0 {
                runtime_budget = budget;
                yield_now().await;
            }
        }

        CompletionRecord::Throw(JsError::from_native(JsNativeError::error()))
    }

    pub(crate) fn run(&mut self) -> CompletionRecord {
        while let Some(byte) = self
            .vm
            .frame()
            .code_block
            .bytecode
            .bytes
            .get(self.vm.frame().pc as usize)
        {
            let opcode = Opcode::decode(*byte);

            match self.execute_one(
                |context, opcode| {
                    let frame = context.vm.frame();
                    let pc = frame.pc as usize;

                    OPCODE_HANDLERS[opcode as usize](context, pc)
                },
                opcode,
            ) {
                ControlFlow::Continue(()) => {}
                ControlFlow::Break(value) => return value,
            }
        }

        CompletionRecord::Throw(JsError::from_native(JsNativeError::error()))
    }

    /// Checks if we haven't exceeded the defined runtime limits.
    pub(crate) fn check_runtime_limits(&self) -> JsResult<()> {
        // Must throw if the number of recursive calls exceeds the defined limit.
        //
        // `host_call_depth` accounts for nested host calls that re-enter the VM by invoking
        // `Context::run()` recursively (for example, accessor calls).
        // Subtract 1 to exclude the dummy frame at index 0.
        let recursion_depth = (self.vm.frames.len() - 1).saturating_add(self.vm.host_call_depth);
        if self.vm.runtime_limits.recursion_limit() <= recursion_depth {
            return Err(crate::JsNativeError::range()
                .with_message("Maximum call stack size exceeded")
                .into());
        }
        // Must throw if the stack size exceeds the defined maximum length.
        if self.vm.runtime_limits.stack_size_limit() <= self.vm.stack.stack.len() {
            return Err(crate::JsNativeError::range()
                .with_message("Maximum call stack size exceeded")
                .into());
        }

        Ok(())
    }
}

/// Yields once to the executor.
fn yield_now() -> impl Future<Output = ()> {
    struct YieldNow(bool);

    impl Future for YieldNow {
        type Output = ();

        fn poll(mut self: Pin<&mut Self>, cx: &mut task::Context<'_>) -> task::Poll<Self::Output> {
            if self.0 {
                task::Poll::Ready(())
            } else {
                self.0 = true;
                cx.waker().wake_by_ref();
                task::Poll::Pending
            }
        }
    }

    YieldNow(false)
}
