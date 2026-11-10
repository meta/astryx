pub(crate) mod yield_stm;

use crate::{
    Context, JsExpect, JsObject, JsResult,
    builtins::{
        async_generator::{AsyncGenerator as NativeAsyncGenerator, AsyncGeneratorState},
        generator::{Generator as NativeGenerator, GeneratorContext, GeneratorState},
    },
    error::PanicError,
    object::PROTOTYPE,
    vm::{CompletionRecord, opcode::Operation},
};
use std::{collections::VecDeque, ops::ControlFlow};

pub(crate) use yield_stm::*;

/// `Generator` implements the Opcode Operation for `Opcode::Generator`
///
/// Operation:
///  - Creates the Generator object and yields.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Generator;

impl Generator {
    #[inline(always)]
    pub(super) fn operation((): (), context: &mut Context) -> ControlFlow<CompletionRecord> {
        let Some(this_function_object) = context.vm.stack.get_function(context.vm.frame()) else {
            return context.handle_error(
                PanicError::new("active function should be set to the generator").into(),
            );
        };

        let proto = this_function_object
            .get(PROTOTYPE, context)
            .ok()
            .and_then(|v| v.as_object())
            .unwrap_or_else(|| context.intrinsics().objects().generator());

        let generator = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            proto,
            NativeGenerator {
                state: GeneratorState::Completed,
            },
        );

        let gen_ctx = GeneratorContext::from_current(context, None);

        generator.borrow_mut().data_mut().state =
            GeneratorState::SuspendedStart { context: gen_ctx };

        context.vm.set_return_value(generator.upcast().into());
        context.handle_yield()
    }
}

impl Operation for Generator {
    const NAME: &'static str = "Generator";
    const INSTRUCTION: &'static str = "INST - Generator";
    const COST: u8 = 4;
}

/// `AsyncGenerator` implements the Opcode Operation for `Opcode::AsyncGenerator`
///
/// Operation:
///  - Creates the AsyncGenerator object and yields.
#[derive(Debug, Clone, Copy)]
pub(crate) struct AsyncGenerator;

impl AsyncGenerator {
    #[inline(always)]
    pub(super) fn operation((): (), context: &mut Context) -> ControlFlow<CompletionRecord> {
        let Some(this_function_object) = context.vm.stack.get_function(context.vm.frame()) else {
            return context.handle_error(
                PanicError::new("active function should be set to the generator").into(),
            );
        };

        let proto = this_function_object
            .get(PROTOTYPE, context)
            .ok()
            .and_then(|v| v.as_object())
            .unwrap_or_else(|| context.intrinsics().objects().async_generator());

        let generator = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            proto,
            NativeAsyncGenerator {
                state: AsyncGeneratorState::SuspendedStart,
                context: None,
                queue: VecDeque::new(),
            },
        );

        let gen_ctx = GeneratorContext::from_current(context, Some(generator.clone().upcast()));
        generator.borrow_mut().data_mut().context = Some(gen_ctx);

        context.vm.set_return_value(generator.upcast().into());
        context.handle_yield()
    }
}

impl Operation for AsyncGenerator {
    const NAME: &'static str = "AsyncGenerator";
    const INSTRUCTION: &'static str = "INST - AsyncGenerator";
    const COST: u8 = 4;
}

/// `AsyncGeneratorClose` implements the Opcode Operation for `Opcode::AsyncGeneratorClose`
///
/// Operation:
///  - Close an async generator function.
#[derive(Debug, Clone, Copy)]
pub(crate) struct AsyncGeneratorClose;

impl AsyncGeneratorClose {
    #[inline(always)]
    pub(super) fn operation((): (), context: &mut Context) -> JsResult<()> {
        // Step 3.e-g in [AsyncGeneratorStart](https://tc39.es/ecma262/#sec-asyncgeneratorstart)
        let generator = context
            .vm
            .async_generator_object()
            .js_expect("There should be a object")?
            .downcast::<NativeAsyncGenerator>()
            .ok()
            .js_expect("must be async generator")?;

        let mut r#gen = generator.borrow_mut();

        // e. Assert: If we return here, the async generator either threw an exception or performed either an implicit or explicit return.
        // f. Remove acGenContext from the execution context stack and restore the execution context that is at the top of the execution context stack as the running execution context.

        // g. Set acGenerator.[[AsyncGeneratorState]] to draining-queue.
        r#gen.data_mut().state = AsyncGeneratorState::DrainingQueue;

        // h. If result is a normal completion, set result to NormalCompletion(undefined).
        // i. If result is a return completion, set result to NormalCompletion(result.[[Value]]).
        let return_value = context.vm.take_return_value();

        let result = context
            .vm
            .pending_exception
            .take()
            .map_or(Ok(return_value), Err);

        drop(r#gen);

        // j. Perform AsyncGeneratorCompleteStep(acGenerator, result, true).
        NativeAsyncGenerator::complete_step(&generator, result, true, None, context)?;
        // k. Perform AsyncGeneratorDrainQueue(acGenerator).
        NativeAsyncGenerator::drain_queue(&generator, context)?;

        // l. Return undefined.
        Ok(())
    }
}

impl Operation for AsyncGeneratorClose {
    const NAME: &'static str = "AsyncGeneratorClose";
    const INSTRUCTION: &'static str = "INST - AsyncGeneratorClose";
    const COST: u8 = 8;
}
