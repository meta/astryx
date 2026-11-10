use std::cell::Cell;

use boa_gc::{Finalize, Trace};

use crate::{
    builtins::iterable::IteratorRecord,
    native_function::{CoroutineBranch, CoroutineState, NativeCoroutine},
};

/// [`Iterator.prototype.drop(limit)`][spec]
///
/// Drops `limit` values from the underlying iterator, then yields the rest.
///
/// [spec]: https://tc39.es/ecma262/#sec-iterator.prototype.drop
#[derive(Trace, Finalize, Default)]
#[boa_gc(unsafe_no_drop)]
pub(crate) enum Drop {
    #[default]
    Completed,
    Dropping {
        limit: Option<u64>,
        iterated: IteratorRecord,
    },
    Yielding {
        iterated: IteratorRecord,
    },
}

impl Drop {
    #[allow(
        clippy::new_ret_no_self,
        reason = "slightly cleaner to have this be a `new` method"
    )]
    pub(crate) fn new(iterated: IteratorRecord, limit: Option<u64>) -> NativeCoroutine {
        // 10. Let closure be a new Abstract Closure with no parameters that
        //     captures iterated and integerLimit and performs the following steps
        //     when called:
        NativeCoroutine::from_copy_closure_with_captures(
            // a. Let remaining be integerLimit.
            // c. Repeat,
            |completion, state, context| {
                let st = state.take();

                match &st {
                    Self::Completed => {}
                    Self::Dropping { iterated, .. } | Self::Yielding { iterated } => {
                        // iv. IfAbruptCloseIterator(completion, iterated).
                        iterated.if_abrupt_close_iterator(completion, context)?;
                    }
                }

                state.set(st);

                loop {
                    let st = state.take();
                    match st {
                        Self::Completed => return CoroutineState::Break(Ok(())),
                        Self::Dropping {
                            limit: None,
                            mut iterated,
                        } => {
                            // ii. Let next be ? IteratorStep(iterated).
                            // iii. If next is done, return ReturnCompletion(undefined).
                            while !iterated.step(context).branch()? {}
                            return CoroutineState::Break(Ok(()));
                        }
                        Self::Dropping {
                            limit: Some(mut limit),
                            mut iterated,
                        } => {
                            // b. Repeat, while remaining > 0,
                            // i. If remaining ≠ +∞, then
                            //    1. Set remaining to remaining - 1.
                            while let Some(next) = limit.checked_sub(1) {
                                limit = next;

                                // ii. Let next be ? IteratorStep(iterated).
                                // iii. If next is done, return ReturnCompletion(undefined).
                                if iterated.step(context).branch()? {
                                    return CoroutineState::Break(Ok(()));
                                }
                            }

                            state.set(Self::Yielding { iterated });
                        }
                        Self::Yielding { mut iterated } => {
                            // i. Let value be ? IteratorStepValue(iterated).
                            return match iterated.step_value(context).branch()? {
                                Some(value) => {
                                    state.set(Self::Yielding { iterated });
                                    // iii. Let completion be Completion(Yield(value)).
                                    CoroutineState::Continue(value)
                                }
                                // ii. If value is done, return ReturnCompletion(undefined).
                                None => CoroutineState::Break(Ok(())),
                            };
                        }
                    }
                }
            },
            Cell::new(Self::Dropping { limit, iterated }),
        )
    }
}
