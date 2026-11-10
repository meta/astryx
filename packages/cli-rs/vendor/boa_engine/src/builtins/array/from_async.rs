use boa_gc::{Finalize, Trace};

use super::Array;
use crate::builtins::AsyncFromSyncIterator;
use crate::builtins::iterable::IteratorRecord;
use crate::builtins::promise::ResolvingFunctions;
use crate::error::PanicError;
use crate::native_function::{CoroutineBranch, CoroutineState, NativeCoroutine};
use crate::object::{JsFunction, JsPromise};
use crate::vm::CompletionRecord;
use crate::{
    Context, JsArgs, JsError, JsExpect, JsNativeError, JsObject, JsResult, JsSymbol, JsValue,
    js_string,
};
use std::cell::Cell;

impl Array {
    /// [`Array.fromAsync ( asyncItems [ , mapfn [ , thisArg ] ] )`][spec]
    ///
    /// The `Array.fromAsync()` static method creates a new,
    /// shallow-copied Array instance from a list or iterator of Promise-like values.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/proposal-array-from-async/#sec-array.fromAsync
    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn from_async(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let C be the this value.
        // 2. Let promiseCapability be ! NewPromiseCapability(%Promise%).
        let (promise, resolvers) = JsPromise::new_pending(context);

        let async_items = args.get_or_undefined(0);
        let mapfn = args.get_or_undefined(1);
        let this_arg = args.get_or_undefined(2).clone();

        // 3. Let fromAsyncClosure be a new Abstract Closure with no parameters that captures C, mapfn, and thisArg and
        //    performs the following steps when called:
        // 4. Perform AsyncFunctionStart(promiseCapability, fromAsyncClosure).
        // NOTE: We avoid putting more state onto the coroutines by preprocessing all we can before allocating
        //       the coroutines.
        let result: JsResult<()> = (|| {
            // a. If mapfn is undefined, let mapping be false.
            let mapfn = if mapfn.is_undefined() {
                None
            } else {
                // b. Else,
                //     i. If IsCallable(mapfn) is false, throw a TypeError exception.
                let Some(callable) = mapfn.as_callable() else {
                    return Err(JsNativeError::typ()
                        .with_message("Array.fromAsync: mapping function must be callable")
                        .into());
                };
                //     ii. Let mapping be true.
                Some(JsFunction::from_object_unchecked(callable))
            };

            // c. Let usingAsyncIterator be ? GetMethod(asyncItems, @@asyncIterator).
            // d. If usingAsyncIterator is undefined, then
            //     i. Let usingSyncIterator be ? GetMethod(asyncItems, @@iterator).
            // e. Let iteratorRecord be undefined.
            // f. If usingAsyncIterator is not undefined, then
            let iterator_record = if let Some(method) =
                async_items.get_method(JsSymbol::async_iterator(), context)?
            {
                // i. Set iteratorRecord to ? GetIterator(asyncItems, async, usingAsyncIterator).
                async_items.get_iterator_from_method(&method, context)?
            }
            // g. Else if usingSyncIterator is not undefined, then
            else if let Some(method) = async_items.get_method(JsSymbol::iterator(), context)? {
                // i. Set iteratorRecord to ? CreateAsyncFromSyncIterator(GetIterator(asyncItems, sync, usingSyncIterator)).
                AsyncFromSyncIterator::create(
                    async_items.get_iterator_from_method(&method, context)?,
                    context,
                )
            }
            // i. Else,
            else {
                // i. NOTE: asyncItems is neither an AsyncIterable nor an Iterable so assume it is an array-like object.
                // ii. Let arrayLike be ! ToObject(asyncItems).
                let array_like = async_items.to_object(context)?;

                // iii. Let len be ? LengthOfArrayLike(arrayLike).
                let len = array_like.length_of_array_like(context)?;
                // iv. If IsConstructor(C) is true, then
                let a = if let Some(c) = this.as_constructor() {
                    // 1. Let A be ? Construct(C, « 𝔽(len) »).
                    c.construct(&[len.into()], None, context)?
                }
                // v. Else,
                else {
                    // 1. Let A be ? ArrayCreate(len).
                    Array::array_create(len, None, context)?
                };

                let coroutine_state = (
                    GlobalState {
                        mapfn,
                        this_arg,
                        resolvers: resolvers.clone(),
                    },
                    Cell::new(Some(ArrayLikeStateMachine::LoopStart {
                        array_like,
                        a,
                        len,
                        // iii. Let k be 0.
                        k: 0,
                    })),
                );

                // Try to run the coroutine once to see if it finishes early.
                // This avoids allocating a new coroutine that will immediately finish.
                // Spec continues on `from_array_like`...
                return match from_array_like(
                    CompletionRecord::Normal(JsValue::undefined()),
                    &coroutine_state,
                    context,
                ) {
                    CoroutineState::Continue(value) => {
                        // Coroutine yielded. We need to allocate it for a future execution.
                        JsPromise::resolve(value, context)?.await_native(
                            NativeCoroutine::from_copy_closure_with_captures(
                                from_array_like,
                                coroutine_state,
                            ),
                            context,
                        );
                        Ok(())
                    }
                    CoroutineState::Break(Err(err)) => Err(err),
                    CoroutineState::Break(Ok(())) => Ok(()),
                };
            };

            // h. If iteratorRecord is not undefined, then

            // i. If IsConstructor(C) is true, then
            let a = if let Some(c) = this.as_constructor() {
                // 1. Let A be ? Construct(C).
                c.construct(&[], None, context)?
            }
            // ii. Else,
            else {
                // 1. Let A be ! ArrayCreate(0).
                Array::array_create(0, None, context)?
            };

            let coroutine_state = (
                GlobalState {
                    mapfn,
                    this_arg,
                    resolvers: resolvers.clone(),
                },
                Cell::new(Some(AsyncIteratorStateMachine::LoopStart {
                    // vi. Let k be 0.
                    k: 0,
                    a,
                    iterator_record,
                })),
            );

            // Try to run the coroutine once to see if it finishes early.
            // This avoids allocating a new coroutine that will immediately finish.
            // Spec continues on `from_async_iterator`...
            match from_async_iterator(
                CompletionRecord::Normal(JsValue::undefined()),
                &coroutine_state,
                context,
            ) {
                CoroutineState::Continue(value) => {
                    JsPromise::resolve(value, context)?.await_native(
                        NativeCoroutine::from_copy_closure_with_captures(
                            from_async_iterator,
                            coroutine_state,
                        ),
                        context,
                    );
                    Ok(())
                }
                CoroutineState::Break(Err(err)) => Err(err),
                CoroutineState::Break(Ok(())) => Ok(()),
            }
        })();

        // AsyncFunctionStart ( promiseCapability, asyncFunctionBody )
        // https://tc39.es/ecma262/#sec-async-functions-abstract-operations-async-function-start
        // ->
        // AsyncBlockStart ( promiseCapability, asyncBody, asyncContext )
        // https://tc39.es/ecma262/#sec-asyncblockstart

        // i. Assert: result is a throw completion.
        if let Err(err) = result {
            // ii. Perform ! Call(promiseCapability.[[Reject]], undefined, « result.[[Value]] »).
            resolvers
                .reject
                .call(&JsValue::undefined(), &[err.into_opaque(context)?], context)
                .js_expect("resolving functions cannot fail")?;
        }

        // 5. Return promiseCapability.[[Promise]].
        Ok(promise.into())
    }
}

#[derive(Trace, Finalize)]
struct GlobalState {
    mapfn: Option<JsFunction>,
    this_arg: JsValue,
    resolvers: ResolvingFunctions,
}

#[derive(Trace, Finalize)]
#[boa_gc(unsafe_no_drop)]
enum AsyncIteratorStateMachine {
    LoopStart {
        a: JsObject,
        k: u64,
        iterator_record: IteratorRecord,
    },
    LoopContinue {
        a: JsObject,
        k: u64,
        iterator_record: IteratorRecord,
    },
    LoopEnd {
        a: JsObject,
        k: u64,
        iterator_record: IteratorRecord,
        mapped_value: Option<JsResult<JsValue>>,
    },
    AsyncIteratorCloseStart {
        err: JsError,
        iterator: JsObject,
    },
    AsyncIteratorCloseEnd {
        err: JsError,
    },
}

/// Part of [`Array.fromAsync ( asyncItems [ , mapfn [ , thisArg ] ] )`](https://tc39.es/proposal-array-from-async/#sec-array.fromAsync).
fn from_async_iterator(
    mut result: CompletionRecord,
    (global_state, state_machine): &(GlobalState, Cell<Option<AsyncIteratorStateMachine>>),
    context: &mut Context,
) -> CoroutineState {
    let result = (|| {
        let Some(mut sm) = state_machine.take() else {
            return CoroutineState::Break(Ok(()));
        };

        // iv. Repeat,
        loop {
            match sm {
                AsyncIteratorStateMachine::LoopStart {
                    a,
                    k,
                    iterator_record,
                } => {
                    // Inverted conditional makes for a simpler code.
                    if k < 2u64.pow(53) - 1 {
                        // 2. Let Pk be ! ToString(𝔽(k)).
                        // 3. Let nextResult be ? Call(iteratorRecord.[[NextMethod]], iteratorRecord.[[Iterator]]).
                        let next_result = iterator_record
                            .next_method()
                            .call(&iterator_record.iterator().clone().into(), &[], context)
                            .branch()?;

                        state_machine.set(Some(AsyncIteratorStateMachine::LoopContinue {
                            a,
                            k,
                            iterator_record,
                        }));

                        // 4. Set nextResult to ? Await(nextResult).
                        return CoroutineState::Continue(next_result);
                    }

                    // 1. If k ≥ 2**53 - 1, then

                    // a. Let error be ThrowCompletion(a newly created TypeError object).
                    // b. Return ? AsyncIteratorClose(iteratorRecord, error).
                    sm = AsyncIteratorStateMachine::AsyncIteratorCloseStart {
                        err: JsNativeError::typ()
                            .with_message(
                                "Array.fromAsync: \
                                            reached the maximum number of elements in an array \
                                            (2^53 - 1)",
                            )
                            .into(),
                        iterator: iterator_record.iterator().clone(),
                    };
                }
                AsyncIteratorStateMachine::LoopContinue {
                    a,
                    k,
                    mut iterator_record,
                } => {
                    // `result` is `Await(nextResult)`.
                    let result = std::mem::replace(
                        &mut result,
                        CompletionRecord::Normal(JsValue::undefined()),
                    );

                    // 5. If nextResult is not an Object, throw a TypeError exception.
                    // Implicit on the call to `update_result`.
                    iterator_record
                        .update_result(result.branch()?, context)
                        .branch()?;

                    // 6. Let done be ? IteratorComplete(nextResult).
                    // 7. If done is true,
                    if iterator_record.done() {
                        // a. Perform ? Set(A, "length", 𝔽(k), true).
                        a.set(js_string!("length"), k, true, context).branch()?;

                        // b. Return Completion Record { [[Type]]: return, [[Value]]: A, [[Target]]: empty }.
                        // AsyncFunctionStart ( promiseCapability, asyncFunctionBody )
                        // https://tc39.es/ecma262/#sec-async-functions-abstract-operations-async-function-start
                        // ->
                        // AsyncBlockStart ( promiseCapability, asyncBody, asyncContext )
                        // https://tc39.es/ecma262/#sec-asyncblockstart

                        // g. Else if result is a return completion, then
                        //        i. Perform ! Call(promiseCapability.[[Resolve]], undefined, « result.[[Value]] »).
                        global_state
                            .resolvers
                            .resolve
                            .call(&JsValue::undefined(), &[a.into()], context)
                            .js_expect("resolving functions cannot fail")
                            .branch()?;

                        return CoroutineState::Break(Ok(()));
                    }

                    // 8. Let nextValue be ? IteratorValue(nextResult).
                    let next_value = iterator_record.value(context).branch()?;
                    // 9. If mapping is true, then
                    if let Some(mapfn) = &global_state.mapfn {
                        // a. Let mappedValue be Call(mapfn, thisArg, « nextValue, 𝔽(k) »).
                        // b. IfAbruptCloseAsyncIterator(mappedValue, iteratorRecord).
                        // https://tc39.es/proposal-array-from-async/#sec-ifabruptcloseasynciterator
                        let mapped_value = match mapfn.call(
                            &global_state.this_arg,
                            &[next_value, k.into()],
                            context,
                        ) {
                            // 1. If value is an abrupt completion, then
                            Err(err) => {
                                // a. Perform ? AsyncIteratorClose(iteratorRecord, value).
                                // b. Return value.
                                sm = AsyncIteratorStateMachine::AsyncIteratorCloseStart {
                                    err,
                                    iterator: iterator_record.iterator().clone(),
                                };
                                continue;
                            }
                            // 2. Else if value is a Completion Record, set value to value.[[Value]].
                            Ok(value) => value,
                        };
                        state_machine.set(Some(AsyncIteratorStateMachine::LoopEnd {
                            a,
                            k,
                            iterator_record,
                            mapped_value: None,
                        }));
                        // c. Set mappedValue to Await(mappedValue).
                        return CoroutineState::Continue(mapped_value);
                    }

                    sm = AsyncIteratorStateMachine::LoopEnd {
                        a,
                        k,
                        iterator_record,
                        // 10. Else, let mappedValue be nextValue.
                        mapped_value: Some(Ok(next_value)),
                    }
                }
                AsyncIteratorStateMachine::LoopEnd {
                    a,
                    k,
                    iterator_record,
                    mapped_value,
                } => {
                    // Either awaited `mappedValue` or directly set `mappedValue` to `nextValue`.
                    let result = match std::mem::replace(
                        &mut result,
                        CompletionRecord::Normal(JsValue::undefined()),
                    ) {
                        CompletionRecord::Normal(val) => Ok(val),
                        CompletionRecord::Throw(err) => Err(err),
                        CompletionRecord::Return(_) => {
                            // TODO: this seems to be correct, but maybe we can
                            // cleanup this code to also handle return completions
                            return CoroutineState::Break(Err(PanicError::new(
                                "from_async_iterator cannot resume with a return completion",
                            )
                            .into()));
                        }
                    };

                    // d. IfAbruptCloseAsyncIterator(mappedValue, iteratorRecord).
                    // https://tc39.es/proposal-array-from-async/#sec-ifabruptcloseasynciterator
                    let mapped_value = match mapped_value.unwrap_or(result) {
                        // 1. If value is an abrupt completion, then
                        Err(err) => {
                            // a. Perform ? AsyncIteratorClose(iteratorRecord, value).
                            // b. Return value.
                            sm = AsyncIteratorStateMachine::AsyncIteratorCloseStart {
                                err,
                                iterator: iterator_record.iterator().clone(),
                            };
                            continue;
                        }
                        // 2. Else if value is a Completion Record, set value to value.[[Value]].
                        Ok(value) => value,
                    };

                    // 11. Let defineStatus be CreateDataPropertyOrThrow(A, Pk, mappedValue).
                    sm = if let Err(err) = a.create_data_property_or_throw(k, mapped_value, context)
                    {
                        // 12. If defineStatus is an abrupt completion, return ? AsyncIteratorClose(iteratorRecord, defineStatus).
                        AsyncIteratorStateMachine::AsyncIteratorCloseStart {
                            err,
                            iterator: iterator_record.iterator().clone(),
                        }
                    } else {
                        AsyncIteratorStateMachine::LoopStart {
                            a,
                            // 13. Set k to k + 1.
                            k: k + 1,
                            iterator_record,
                        }
                    };
                }
                // AsyncIteratorClose ( iteratorRecord, completion )
                // https://tc39.es/ecma262/#sec-asynciteratorclose
                // Simplified for only error completions.
                AsyncIteratorStateMachine::AsyncIteratorCloseStart { err, iterator } => {
                    // 1. Assert: iteratorRecord.[[Iterator]] is an Object.
                    // 2. Let iterator be iteratorRecord.[[Iterator]].
                    // 3. Let innerResult be Completion(GetMethod(iterator, "return")).
                    // 4. If innerResult is a normal completion, then
                    //     a. Let return be innerResult.[[Value]].
                    //     b. If return is undefined, return ? completion.
                    //     c. Set innerResult to Completion(Call(return, iterator)).
                    //     d. If innerResult is a normal completion, set innerResult to Completion(Await(innerResult.[[Value]])).
                    // 5. If completion is a throw completion, return ? completion.
                    let Ok(Some(ret)) = iterator.get_method(js_string!("return"), context) else {
                        return CoroutineState::Break(Err(err));
                    };

                    let Ok(value) = ret.call(&iterator.into(), &[], context) else {
                        return CoroutineState::Break(Err(err));
                    };

                    state_machine.set(Some(AsyncIteratorStateMachine::AsyncIteratorCloseEnd {
                        err,
                    }));
                    return CoroutineState::Continue(value);
                }
                AsyncIteratorStateMachine::AsyncIteratorCloseEnd { err } => {
                    // Awaited `innerResult.[[Value]]`.
                    // Only need to return the original error.
                    return CoroutineState::Break(Err(err));
                }
            }
        }
    })();

    // AsyncFunctionStart ( promiseCapability, asyncFunctionBody )
    // https://tc39.es/ecma262/#sec-async-functions-abstract-operations-async-function-start
    // ->
    // AsyncBlockStart ( promiseCapability, asyncBody, asyncContext )
    // https://tc39.es/ecma262/#sec-asyncblockstart
    match result {
        // i. Assert: result is a throw completion.
        CoroutineState::Break(Err(err)) => {
            // ii. Perform ! Call(promiseCapability.[[Reject]], undefined, « result.[[Value]] »).
            global_state
                .resolvers
                .reject
                .call(
                    &JsValue::undefined(),
                    &[err.into_opaque(context).branch()?],
                    context,
                )
                .js_expect("resolving functions cannot fail")
                .branch()?;
            CoroutineState::Break(Ok(()))
        }
        result => result,
    }
}

#[derive(Trace, Finalize)]
#[boa_gc(unsafe_no_drop)]
#[allow(clippy::enum_variant_names)]
enum ArrayLikeStateMachine {
    LoopStart {
        array_like: JsObject,
        a: JsObject,
        len: u64,
        k: u64,
    },
    LoopContinue {
        array_like: JsObject,
        a: JsObject,
        len: u64,
        k: u64,
    },
    LoopEnd {
        array_like: JsObject,
        a: JsObject,
        len: u64,
        k: u64,
        mapped_value: Option<JsValue>,
    },
}

/// Part of [`Array.fromAsync ( asyncItems [ , mapfn [ , thisArg ] ] )`](https://tc39.es/proposal-array-from-async/#sec-array.fromAsync).
fn from_array_like(
    mut result: CompletionRecord,
    (global_state, state_machine): &(GlobalState, Cell<Option<ArrayLikeStateMachine>>),
    context: &mut Context,
) -> CoroutineState {
    let result = (|| {
        let Some(mut sm) = state_machine.take() else {
            return CoroutineState::Break(Ok(()));
        };

        loop {
            match sm {
                ArrayLikeStateMachine::LoopStart {
                    array_like,
                    a,
                    len,
                    k,
                } => {
                    // vii. Repeat, while k < len,
                    if k >= len {
                        // viii. Perform ? Set(A, "length", 𝔽(len), true).
                        a.set(js_string!("length"), len, true, context).branch()?;

                        // ix. Return Completion Record { [[Type]]: return, [[Value]]: A, [[Target]]: empty }.

                        // AsyncFunctionStart ( promiseCapability, asyncFunctionBody )
                        // https://tc39.es/ecma262/#sec-async-functions-abstract-operations-async-function-start
                        // ->
                        // AsyncBlockStart ( promiseCapability, asyncBody, asyncContext )
                        // https://tc39.es/ecma262/#sec-asyncblockstart

                        // g. Else if result is a return completion, then
                        //        i. Perform ! Call(promiseCapability.[[Resolve]], undefined, « result.[[Value]] »).
                        global_state
                            .resolvers
                            .resolve
                            .call(&JsValue::undefined(), &[a.into()], context)
                            .js_expect("resolving functions cannot fail")
                            .branch()?;

                        return CoroutineState::Break(Ok(()));
                    }

                    // 1. Let Pk be ! ToString(𝔽(k)).
                    // 2. Let kValue be ? Get(arrayLike, Pk).
                    let k_value = array_like.get(k, context).branch()?;
                    state_machine.set(Some(ArrayLikeStateMachine::LoopContinue {
                        array_like,
                        a,
                        len,
                        k,
                    }));

                    // 3. Set kValue to ? Await(kValue).
                    return CoroutineState::Continue(k_value);
                }
                ArrayLikeStateMachine::LoopContinue {
                    array_like,
                    a,
                    len,
                    k,
                } => {
                    // Awaited kValue
                    let k_value = std::mem::replace(
                        &mut result,
                        CompletionRecord::Normal(JsValue::undefined()),
                    )
                    .branch()?;

                    // 4. If mapping is true, then
                    if let Some(mapfn) = &global_state.mapfn {
                        // a. Let mappedValue be ? Call(mapfn, thisArg, « kValue, 𝔽(k) »).
                        let mapped_value = mapfn
                            .call(&global_state.this_arg, &[k_value, k.into()], context)
                            .branch()?;
                        state_machine.set(Some(ArrayLikeStateMachine::LoopEnd {
                            array_like,
                            a,
                            len,
                            k,
                            mapped_value: None,
                        }));

                        // b. Set mappedValue to ? Await(mappedValue).
                        return CoroutineState::Continue(mapped_value);
                    }
                    // 5. Else, let mappedValue be kValue.
                    sm = ArrayLikeStateMachine::LoopEnd {
                        array_like,
                        a,
                        len,
                        k,
                        mapped_value: Some(k_value),
                    }
                }
                ArrayLikeStateMachine::LoopEnd {
                    array_like,
                    a,
                    len,
                    k,
                    mapped_value,
                } => {
                    // Either awaited `mappedValue` or directly set this from `kValue`.
                    let result = std::mem::replace(
                        &mut result,
                        CompletionRecord::Normal(JsValue::undefined()),
                    )
                    .branch()?;
                    let mapped_value = mapped_value.unwrap_or(result);

                    // 6. Perform ? CreateDataPropertyOrThrow(A, Pk, mappedValue).
                    a.create_data_property_or_throw(k, mapped_value, context)
                        .branch()?;

                    // 7. Set k to k + 1.
                    sm = ArrayLikeStateMachine::LoopStart {
                        array_like,
                        a,
                        len,
                        k: k + 1,
                    }
                }
            }
        }
    })();

    // AsyncFunctionStart ( promiseCapability, asyncFunctionBody )
    // https://tc39.es/ecma262/#sec-async-functions-abstract-operations-async-function-start
    // ->
    // AsyncBlockStart ( promiseCapability, asyncBody, asyncContext )
    // https://tc39.es/ecma262/#sec-asyncblockstart
    match result {
        // i. Assert: result is a throw completion.
        CoroutineState::Break(Err(err)) => {
            // ii. Perform ! Call(promiseCapability.[[Reject]], undefined, « result.[[Value]] »).
            global_state
                .resolvers
                .reject
                .call(
                    &JsValue::undefined(),
                    &[err.into_opaque(context).branch()?],
                    context,
                )
                .js_expect("resolving functions cannot fail")
                .branch()?;
            CoroutineState::Break(Ok(()))
        }
        result => result,
    }
}
