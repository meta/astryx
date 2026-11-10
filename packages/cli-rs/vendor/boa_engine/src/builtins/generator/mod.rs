//! Boa's implementation of ECMAScript's global `Generator` object.
//!
//! A Generator is an instance of a generator function and conforms to both the Iterator and Iterable interfaces.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-generator-objects
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator

use crate::{
    Context, JsArgs, JsData, JsError, JsExpect, JsResult, JsString,
    builtins::iterable::create_iter_result_object,
    context::intrinsics::Intrinsics,
    error::JsNativeError,
    error::PanicError,
    js_string,
    object::{CONSTRUCTOR, JsObject},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
    value::JsValue,
    vm::{CallFrame, CallFrameFlags, CompletionRecord, GeneratorResumeKind, Stack},
};
use boa_gc::{Finalize, Trace, custom_trace};

use super::{BuiltInBuilder, IntrinsicObject};

/// Indicates the state of a generator.
#[derive(Debug, Finalize)]
pub(crate) enum GeneratorState {
    SuspendedStart {
        /// The `[[GeneratorContext]]` internal slot.
        context: GeneratorContext,
    },
    SuspendedYield {
        /// The `[[GeneratorContext]]` internal slot.
        context: GeneratorContext,
    },
    Executing,
    Completed,
}

// Need to manually implement, since `Trace` adds a `Drop` impl which disallows destructuring.
unsafe impl Trace for GeneratorState {
    custom_trace!(this, mark, {
        match &this {
            Self::SuspendedStart { context } | Self::SuspendedYield { context } => mark(context),
            Self::Executing | Self::Completed => {}
        }
    });
}

/// Holds all information that a generator needs to continue it's execution.
///
/// All of the fields must be changed with those that are currently present in the
/// context/vm before the generator execution starts/resumes and after it has ended/yielded.
#[derive(Debug, Trace, Finalize)]
pub(crate) struct GeneratorContext {
    pub(crate) stack: Stack,
    pub(crate) call_frame: Option<CallFrame>,
}

impl GeneratorContext {
    /// Creates a new `GeneratorContext` from the current `Context` state.
    pub(crate) fn from_current(context: &mut Context, async_generator: Option<JsObject>) -> Self {
        let mut frame = context.vm.frame().clone();
        frame.environments = context.vm.frame().environments.clone();
        frame.realm = context.realm().clone();

        // Split the stack at fp. The split-off portion starts at what was fp,
        // so adjust rp and fp to be relative to the new base.
        let mut stack = context.vm.stack.split_off_frame(&frame);
        frame.rp -= frame.fp;
        frame.fp = 0;

        // NOTE: Since we get a pre-built call frame with stack, and we reuse them.
        //       So we don't need to push the registers in subsequent calls.
        frame.flags |= CallFrameFlags::REGISTERS_ALREADY_PUSHED;

        if let Some(async_generator) = async_generator {
            stack.set_register(
                &frame,
                CallFrame::ASYNC_GENERATOR_OBJECT_REGISTER_INDEX,
                async_generator.into(),
            );
        }

        Self {
            call_frame: Some(frame),
            stack,
        }
    }

    /// Resumes execution with `GeneratorContext` as the current execution context.
    pub(crate) fn resume(
        &mut self,
        value: Option<JsValue>,
        resume_kind: GeneratorResumeKind,
        context: &mut Context,
    ) -> CompletionRecord {
        std::mem::swap(&mut context.vm.stack, &mut self.stack);
        let Some(frame) = self.call_frame.take() else {
            return CompletionRecord::Throw(PanicError::new("should have a call frame").into());
        };
        let fp = frame.fp;
        let rp = frame.rp;
        context.vm.push_frame(frame);

        let frame = context.vm.frame_mut();
        frame.fp = fp;
        frame.rp = rp;
        frame.set_exit_early(true);

        if let Some(value) = value {
            context.vm.stack.push(value);
        }
        context.vm.stack.push(resume_kind);

        let result = context.run();

        std::mem::swap(&mut context.vm.stack, &mut self.stack);
        self.call_frame = context.vm.pop_frame();
        assert!(self.call_frame.is_some());
        result
    }

    /// Returns the async generator object, if the function that this [`GeneratorContext`] is from an async generator, [`None`] otherwise.
    pub(crate) fn async_generator_object(&self) -> JsResult<Option<JsObject>> {
        let Some(frame) = self.call_frame.as_ref() else {
            return Ok(None);
        };

        if !frame.code_block().is_async_generator() {
            return Ok(None);
        }

        let val = self
            .stack
            .get_register(frame, CallFrame::ASYNC_GENERATOR_OBJECT_REGISTER_INDEX)
            .js_expect("registers must have an async generator object")?;

        Ok(val.as_object())
    }
}

/// The internal representation of a `Generator` object.
#[derive(Debug, Finalize, Trace, JsData)]
pub struct Generator {
    /// The `[[GeneratorState]]` internal slot.
    pub(crate) state: GeneratorState,
}

impl IntrinsicObject for Generator {
    fn init(realm: &Realm) {
        BuiltInBuilder::with_intrinsic::<Self>(realm)
            .prototype(realm.intrinsics().constructors().iterator().prototype())
            .static_method(Self::next, js_string!("next"), 1)
            .static_method(Self::r#return, js_string!("return"), 1)
            .static_method(Self::throw, js_string!("throw"), 1)
            .static_property(
                JsSymbol::to_string_tag(),
                Self::NAME,
                Attribute::CONFIGURABLE,
            )
            .static_property(
                CONSTRUCTOR,
                realm
                    .intrinsics()
                    .constructors()
                    .generator_function()
                    .prototype(),
                Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().generator()
    }
}

impl Generator {
    const NAME: JsString = StaticJsStrings::GENERATOR;

    /// `Generator.prototype.next ( value )`
    ///
    /// The `next()` method returns an object with two properties done and value.
    /// You can also provide a parameter to the next method to send a value to the generator.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-generator.prototype.next
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator/next
    pub(crate) fn next(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Return ? GeneratorResume(this value, value, empty).
        Self::generator_resume(this, args.get_or_undefined(0).clone(), context)
    }

    /// `Generator.prototype.return ( value )`
    ///
    /// The `return()` method returns the given value and finishes the generator.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-generator.prototype.return
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator/return
    pub(crate) fn r#return(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let g be the this value.
        // 2. Let C be Completion { [[Type]]: return, [[Value]]: value, [[Target]]: empty }.
        // 3. Return ? GeneratorResumeAbrupt(g, C, empty).
        Self::generator_resume_abrupt(this, Ok(args.get_or_undefined(0).clone()), context)
    }

    /// `Generator.prototype.throw ( exception )`
    ///
    /// The `throw()` method resumes the execution of a generator by throwing an error into it
    /// and returns an object with two properties done and value.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-generator.prototype.throw
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator/throw
    pub(crate) fn throw(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let g be the this value.
        // 2. Let C be ThrowCompletion(exception).
        // 3. Return ? GeneratorResumeAbrupt(g, C, empty).
        Self::generator_resume_abrupt(
            this,
            Err(JsError::from_opaque(args.get_or_undefined(0).clone())),
            context,
        )
    }

    /// `27.5.3.3 GeneratorResume ( generator, value, generatorBrand )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-generatorresume
    pub(crate) fn generator_resume(
        r#gen: &JsValue,
        value: JsValue,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let state be ? GeneratorValidate(generator, generatorBrand).
        let Some(generator_obj) = r#gen.as_object() else {
            return Err(JsNativeError::typ()
                .with_message("Generator method called on non generator")
                .into());
        };
        let mut r#gen = generator_obj.downcast_mut::<Self>().ok_or_else(|| {
            JsNativeError::typ().with_message("generator resumed on non generator object")
        })?;

        // 4. Let genContext be generator.[[GeneratorContext]].
        // 5. Let methodContext be the running execution context.
        // 6. Suspend methodContext.
        // 7. Set generator.[[GeneratorState]] to executing.
        let (mut generator_context, first_execution) =
            match std::mem::replace(&mut r#gen.state, GeneratorState::Executing) {
                GeneratorState::Executing => {
                    return Err(JsNativeError::typ()
                        .with_message("Generator should not be executing")
                        .into());
                }
                // 2. If state is completed, return CreateIterResultObject(undefined, true).
                GeneratorState::Completed => {
                    r#gen.state = GeneratorState::Completed;
                    return Ok(create_iter_result_object(
                        JsValue::undefined(),
                        true,
                        context,
                    ));
                }
                // 3. Assert: state is either suspendedStart or suspendedYield.
                GeneratorState::SuspendedStart { context } => (context, true),
                GeneratorState::SuspendedYield { context } => (context, false),
            };

        drop(r#gen);

        let record = generator_context.resume(
            (!first_execution).then_some(value),
            GeneratorResumeKind::Normal,
            context,
        );

        let mut r#gen = generator_obj
            .downcast_mut::<Self>()
            .js_expect("already checked this object type")?;

        // 8. Push genContext onto the execution context stack; genContext is now the running execution context.
        // 9. Resume the suspended evaluation of genContext using NormalCompletion(value) as the result of the operation that suspended it. Let result be the value returned by the resumed computation.
        // 10. Assert: When we return here, genContext has already been removed from the execution context stack and methodContext is the currently running execution context.
        // 11. Return Completion(result).
        match record {
            CompletionRecord::Normal(value) => {
                r#gen.state = GeneratorState::SuspendedYield {
                    context: generator_context,
                };
                Ok(value)
            }
            CompletionRecord::Return(value) => {
                r#gen.state = GeneratorState::Completed;
                Ok(create_iter_result_object(value, true, context))
            }
            CompletionRecord::Throw(err) => {
                r#gen.state = GeneratorState::Completed;
                Err(err)
            }
        }
    }

    /// `27.5.3.4 GeneratorResumeAbrupt ( generator, abruptCompletion, generatorBrand )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-generatorresumeabrupt
    pub(crate) fn generator_resume_abrupt(
        r#gen: &JsValue,
        abrupt_completion: JsResult<JsValue>,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let state be ? GeneratorValidate(generator, generatorBrand).
        let Some(generator_obj) = r#gen.as_object() else {
            return Err(JsNativeError::typ()
                .with_message("Generator method called on non generator")
                .into());
        };
        let mut r#gen = generator_obj.downcast_mut::<Self>().ok_or_else(|| {
            JsNativeError::typ().with_message("generator resumed on non generator object")
        })?;

        // 4. Assert: state is suspendedYield.
        // 5. Let genContext be generator.[[GeneratorContext]].
        // 6. Let methodContext be the running execution context.
        // 7. Suspend methodContext.
        // 8. Set generator.[[GeneratorState]] to executing.
        let mut generator_context =
            match std::mem::replace(&mut r#gen.state, GeneratorState::Executing) {
                GeneratorState::Executing => {
                    return Err(JsNativeError::typ()
                        .with_message("Generator should not be executing")
                        .into());
                }
                // 2. If state is suspendedStart, then
                // 3. If state is completed, then
                GeneratorState::SuspendedStart { .. } | GeneratorState::Completed => {
                    // a. Set generator.[[GeneratorState]] to completed.
                    r#gen.state = GeneratorState::Completed;

                    // b. Once a generator enters the completed state it never leaves it and its
                    // associated execution context is never resumed. Any execution state associated
                    // with generator can be discarded at this point.

                    // a. If abruptCompletion.[[Type]] is return, then
                    if let Ok(value) = abrupt_completion {
                        // i. Return CreateIterResultObject(abruptCompletion.[[Value]], true).
                        let value = create_iter_result_object(value, true, context);
                        return Ok(value);
                    }

                    // b. Return Completion(abruptCompletion).
                    return abrupt_completion;
                }
                GeneratorState::SuspendedYield { context } => context,
            };

        // 9. Push genContext onto the execution context stack; genContext is now the running execution context.
        // 10. Resume the suspended evaluation of genContext using abruptCompletion as the result of the operation that suspended it. Let result be the completion record returned by the resumed computation.
        // 11. Assert: When we return here, genContext has already been removed from the execution context stack and methodContext is the currently running execution context.
        // 12. Return Completion(result).
        drop(r#gen);

        let (value, resume_kind) = match abrupt_completion {
            Ok(value) => (value, GeneratorResumeKind::Return),
            Err(err) => (err.into_opaque(context)?, GeneratorResumeKind::Throw),
        };

        let record = generator_context.resume(Some(value), resume_kind, context);

        let mut r#gen = generator_obj.downcast_mut::<Self>().ok_or_else(|| {
            JsNativeError::typ().with_message("generator resumed on non generator object")
        })?;

        match record {
            CompletionRecord::Normal(value) => {
                r#gen.state = GeneratorState::SuspendedYield {
                    context: generator_context,
                };
                Ok(value)
            }
            CompletionRecord::Return(value) => {
                r#gen.state = GeneratorState::Completed;
                Ok(create_iter_result_object(value, true, context))
            }
            CompletionRecord::Throw(err) => {
                r#gen.state = GeneratorState::Completed;
                Err(err)
            }
        }
    }
}
