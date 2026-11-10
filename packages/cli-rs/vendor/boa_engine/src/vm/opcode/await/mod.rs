use super::RegisterOperand;
use crate::{
    Context, JsArgs, JsExpect, JsResult, JsValue,
    builtins::{
        Promise, async_generator::AsyncGenerator, generator::GeneratorContext,
        promise::PromiseCapability,
    },
    error::PanicError,
    js_string,
    native_function::NativeFunction,
    object::FunctionObjectBuilder,
    vm::{CompletionRecord, GeneratorResumeKind, opcode::Operation},
};
use boa_gc::Gc;
use std::{cell::Cell, ops::ControlFlow};

/// `Await` implements the Opcode Operation for `Opcode::Await`
///
/// Operation:
///  - Stops the current Async function and schedules it to resume later.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Await;

impl Await {
    #[inline(always)]
    pub(super) fn operation(
        value: RegisterOperand,
        context: &mut Context,
    ) -> ControlFlow<CompletionRecord> {
        let value = context.vm.get_register(value.into());

        // 2. Let promise be ? PromiseResolve(%Promise%, value).
        let promise = match Promise::promise_resolve(
            &context.intrinsics().constructors().promise().constructor(),
            value.clone(),
            context,
        ) {
            Ok(promise) => match promise.downcast::<Promise>().ok() {
                Some(v) => v,
                None => {
                    return context.handle_error(
                        PanicError::new("%Promise% constructor must return a `Promise` object")
                            .into(),
                    );
                }
            },
            Err(err) => return context.handle_error(err),
        };

        let return_value = context
            .vm
            .get_promise_capability()
            .ok()
            .map(|cap| JsValue::from(cap.promise))
            .unwrap_or_default();

        let r#gen = GeneratorContext::from_current(context, None);

        let captures = Gc::new(Cell::new(Some(r#gen)));

        // 3. Let fulfilledClosure be a new Abstract Closure with parameters (value) that captures asyncContext and performs the following steps when called:
        // 4. Let onFulfilled be CreateBuiltinFunction(fulfilledClosure, 1, "", « »).
        let on_fulfilled = FunctionObjectBuilder::new(
            context.realm(),
            NativeFunction::from_copy_closure_with_captures(
                |_this, args, captures, context| {
                    // a. Let prevContext be the running execution context.
                    // b. Suspend prevContext.
                    // c. Push asyncContext onto the execution context stack; asyncContext is now the running execution context.
                    // d. Resume the suspended evaluation of asyncContext using NormalCompletion(value) as the result of the operation that suspended it.
                    let mut r#gen = captures.take().js_expect("should only run once")?;

                    // NOTE: We need to get the object before resuming, since it could clear the stack.
                    let async_generator = r#gen.async_generator_object()?;

                    r#gen.resume(
                        Some(args.get_or_undefined(0).clone()),
                        GeneratorResumeKind::Normal,
                        context,
                    );

                    if let Some(async_generator) = async_generator {
                        async_generator
                            .downcast_mut::<AsyncGenerator>()
                            .js_expect("must be async generator")?
                            .context = Some(r#gen);
                    }

                    // e. Assert: When we reach this step, asyncContext has already been removed from the execution context stack and prevContext is the currently running execution context.
                    // f. Return undefined.
                    Ok(JsValue::undefined())
                },
                captures.clone(),
            ),
        )
        .name(js_string!())
        .length(1)
        .build();

        // 5. Let rejectedClosure be a new Abstract Closure with parameters (reason) that captures asyncContext and performs the following steps when called:
        // 6. Let onRejected be CreateBuiltinFunction(rejectedClosure, 1, "", « »).
        let on_rejected = FunctionObjectBuilder::new(
            context.realm(),
            NativeFunction::from_copy_closure_with_captures(
                |_this, args, captures, context| {
                    // a. Let prevContext be the running execution context.
                    // b. Suspend prevContext.
                    // c. Push asyncContext onto the execution context stack; asyncContext is now the running execution context.
                    // d. Resume the suspended evaluation of asyncContext using ThrowCompletion(reason) as the result of the operation that suspended it.
                    // e. Assert: When we reach this step, asyncContext has already been removed from the execution context stack and prevContext is the currently running execution context.
                    // f. Return undefined.
                    let mut r#gen = captures.take().js_expect("should only run once")?;

                    // NOTE: We need to get the object before resuming, since it could clear the stack.
                    let async_generator = r#gen.async_generator_object()?;

                    r#gen.resume(
                        Some(args.get_or_undefined(0).clone()),
                        GeneratorResumeKind::Throw,
                        context,
                    );

                    if let Some(async_generator) = async_generator {
                        async_generator
                            .downcast_mut::<AsyncGenerator>()
                            .js_expect("must be async generator")?
                            .context = Some(r#gen);
                    }

                    Ok(JsValue::undefined())
                },
                captures,
            ),
        )
        .name(js_string!())
        .length(1)
        .build();

        // 7. Perform PerformPromiseThen(promise, onFulfilled, onRejected).
        Promise::perform_promise_then(
            &promise,
            Some(on_fulfilled),
            Some(on_rejected),
            None,
            context,
        );

        context.vm.set_return_value(return_value);
        context.handle_yield()
    }
}

impl Operation for Await {
    const NAME: &'static str = "Await";
    const INSTRUCTION: &'static str = "INST - Await";
    const COST: u8 = 5;
}

/// `CreatePromiseCapability` implements the Opcode Operation for `Opcode::CreatePromiseCapability`
///
/// Operation:
///  - Create a promise capacity for an async function.
#[derive(Debug, Clone, Copy)]
pub(crate) struct CreatePromiseCapability;

impl CreatePromiseCapability {
    #[inline(always)]
    pub(super) fn operation((): (), context: &mut Context) -> JsResult<()> {
        let promise_capability = PromiseCapability::new(
            &context.intrinsics().constructors().promise().constructor(),
            context,
        )
        .js_expect("cannot fail per spec")?;

        context.vm.set_promise_capability(promise_capability)
    }
}

impl Operation for CreatePromiseCapability {
    const NAME: &'static str = "CreatePromiseCapability";
    const INSTRUCTION: &'static str = "INST - CreatePromiseCapability";
    const COST: u8 = 8;
}
