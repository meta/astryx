use std::cell::Cell;

use boa_gc::{Finalize, Trace};

use crate::{
    JsValue,
    builtins::iterable::IteratorRecord,
    native_function::{CoroutineBranch, CoroutineState, NativeCoroutine},
    object::JsFunction,
};

/// [`Iterator.prototype.filter(predicate)`][spec]
///
/// Yields only values that satisfy `predicate(value, counter) == true`.
///
/// [spec]: https://tc39.es/ecma262/#sec-iterator.prototype.filter
#[derive(Trace, Finalize, Default)]
#[boa_gc(unsafe_no_drop)]
pub(crate) enum Filter {
    #[default]
    Completed,
    Yielding {
        iterated: IteratorRecord,
        predicate: JsFunction,
        counter: u64,
    },
}

impl Filter {
    #[allow(
        clippy::new_ret_no_self,
        reason = "slightly cleaner to have this be a `new` method"
    )]
    pub(crate) fn new(iterated: IteratorRecord, predicate: JsFunction) -> NativeCoroutine {
        // 6. Let closure be a new Abstract Closure with no parameters that captures
        //    iterated and predicate and performs the following steps when called:
        NativeCoroutine::from_copy_closure_with_captures(
            // a. Let counter be 0.
            // b. Repeat,
            |completion, state, context| {
                let st = state.take();

                match &st {
                    Self::Completed => {}
                    Self::Yielding { iterated, .. } => {
                        // 2. IfAbruptCloseIterator(completion, iterated).
                        iterated.if_abrupt_close_iterator(completion, context)?;
                    }
                }

                state.set(st);
                loop {
                    let st = state.take();
                    match st {
                        Self::Completed => {
                            return CoroutineState::Break(Ok(()));
                        }
                        Self::Yielding {
                            mut iterated,
                            predicate,
                            counter,
                        } => {
                            // i. Let value be ? IteratorStepValue(iterated).
                            // ii. If value is done, return ReturnCompletion(undefined).
                            let Some(value) = iterated.step_value(context).branch()? else {
                                return CoroutineState::Break(Ok(()));
                            };

                            // iii. Let selected be Completion(Call(predicate, undefined, « value, 𝔽(counter) »)).
                            let selected = match predicate.call(
                                &JsValue::undefined(),
                                &[value.clone(), counter.into()],
                                context,
                            ) {
                                Ok(val) => val,
                                Err(err) => {
                                    // iv. IfAbruptCloseIterator(selected, iterated).
                                    return iterated.close(Err(err), context).branch();
                                }
                            };

                            state.set(Self::Yielding {
                                iterated,
                                predicate,
                                // vi. Set counter to counter + 1.
                                counter: counter + 1,
                            });

                            // v. If ToBoolean(selected) is true, then
                            if selected.to_boolean() {
                                // 1. Let completion be Completion(Yield(value)).
                                return CoroutineState::Continue(value);
                            }
                        }
                    }
                }
            },
            Cell::new(Self::Yielding {
                iterated,
                predicate,
                counter: 0,
            }),
        )
    }
}
