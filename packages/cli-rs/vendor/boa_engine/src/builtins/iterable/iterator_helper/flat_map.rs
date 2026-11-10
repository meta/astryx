use std::cell::Cell;

use boa_gc::{Finalize, Trace};

use crate::{
    JsValue,
    builtins::iterable::{IteratorRecord, get_iterator_flattenable},
    native_function::{CoroutineBranch, CoroutineState, NativeCoroutine},
    object::JsFunction,
    vm::CompletionRecord,
};

/// [`Iterator.prototype.flatMap(mapper)`][spec]
///
/// Maps all values of the underlying iterator with `mapper`, flattening
/// inner iterable values into a single stream of values.
///
/// [spec]: https://tc39.es/ecma262/#sec-iterator.prototype.flatmap
#[derive(Trace, Finalize, Default)]
#[boa_gc(unsafe_no_drop)]
pub(crate) enum FlatMap {
    #[default]
    Completed,
    Mapping {
        iterated: IteratorRecord,
        mapper: JsFunction,
        counter: u64,
    },
    Yielding {
        iterated: IteratorRecord,
        inner_iterator: IteratorRecord,
        mapper: JsFunction,
        counter: u64,
    },
}

impl FlatMap {
    #[allow(
        clippy::new_ret_no_self,
        reason = "slightly cleaner to have this be a `new` method"
    )]
    pub(crate) fn new(iterated: IteratorRecord, mapper: JsFunction) -> NativeCoroutine {
        // 6. Let closure be a new Abstract Closure with no parameters that captures
        //    iterated and mapper and performs the following steps when called:
        NativeCoroutine::from_copy_closure_with_captures(
            // a. Let counter be 0.
            // b. Repeat,
            |completion, state, context| {
                let st = state.take();

                // Handle abrupt resumption first to avoid cloning the initial
                // completion too much.
                'guard: {
                    match &st {
                        Self::Mapping { iterated, .. } => {
                            iterated.if_abrupt_close_iterator(completion, context)?;
                        }
                        // b. If completion is an abrupt completion, then
                        Self::Yielding {
                            iterated,
                            inner_iterator,
                            ..
                        } => {
                            let completion = match completion {
                                CompletionRecord::Normal(_) => break 'guard,
                                CompletionRecord::Return(val) => Ok(val),
                                CompletionRecord::Throw(err) => Err(err),
                            };

                            // i. Let backupCompletion be Completion(IteratorClose(innerIterator, completion)).
                            // ii. IfAbruptCloseIterator(backupCompletion, iterated).
                            if_abrupt_close_iterator!(
                                inner_iterator.close(completion.clone(), context),
                                iterated,
                                context
                            );

                            // iii. Return ? IteratorClose(iterated, completion).
                            return CoroutineState::Break(
                                iterated.close(completion, context).map(|_| ()),
                            );
                        }
                        Self::Completed => {}
                    }
                }

                state.set(st);

                loop {
                    let st = state.take();
                    match st {
                        Self::Completed => return CoroutineState::Break(Ok(())),
                        Self::Mapping {
                            mut iterated,
                            mapper,
                            counter,
                        } => {
                            let Some(value) = iterated.step_value(context).branch()? else {
                                return CoroutineState::Break(Ok(()));
                            };

                            let mapped_value = if_abrupt_close_iterator!(
                                mapper.call(
                                    &JsValue::undefined(),
                                    &[value, counter.into()],
                                    context
                                ),
                                iterated,
                                context
                            );

                            let inner_iterator = if_abrupt_close_iterator!(
                                get_iterator_flattenable(&mapped_value, false, context),
                                iterated,
                                context
                            );

                            state.set(Self::Yielding {
                                iterated,
                                inner_iterator,
                                mapper,
                                counter,
                            });
                        }
                        // viii. Repeat, while innerAlive is true,
                        Self::Yielding {
                            iterated,
                            mut inner_iterator,
                            mapper,
                            counter,
                        } => {
                            // 1. Let innerValue be Completion(IteratorStepValue(innerIterator)).
                            // 2. IfAbruptCloseIterator(innerValue, iterated).
                            match if_abrupt_close_iterator!(
                                inner_iterator.step_value(context),
                                iterated,
                                context
                            ) {
                                Some(inner_value) => {
                                    state.set(Self::Yielding {
                                        iterated,
                                        inner_iterator,
                                        mapper,
                                        counter,
                                    });
                                    return CoroutineState::Continue(inner_value);
                                }
                                // 3. If innerValue is done, then
                                None => {
                                    // a. Set innerAlive to false.
                                    state.set(Self::Mapping {
                                        iterated,
                                        mapper,
                                        // ix. Set counter to counter + 1.
                                        counter: counter + 1,
                                    });
                                }
                            }
                        }
                    }
                }
            },
            Cell::new(Self::Mapping {
                iterated,
                mapper,
                counter: 0,
            }),
        )
    }
}
