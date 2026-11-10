use std::cell::Cell;

use boa_gc::{Finalize, Trace};

use crate::{
    JsValue,
    builtins::iterable::IteratorRecord,
    native_function::{CoroutineBranch, CoroutineState, NativeCoroutine},
};

/// [`Iterator.prototype.take(limit)`][spec]
///
/// Takes `limit` values from the underlying iterator, and drops the rest.
///
/// [spec]: https://tc39.es/ecma262/#sec-iterator.prototype.take
#[derive(Trace, Finalize, Default)]
#[boa_gc(unsafe_no_drop)]
pub(crate) enum Take {
    #[default]
    Completed,
    Yielding {
        remaining: Option<u64>,
        iterated: IteratorRecord,
    },
}

impl Take {
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
            // b. Repeat,
            |completion, state, context| {
                let st = state.take();

                let (mut iterated, remaining) = match st {
                    Self::Completed => return CoroutineState::Break(Ok(())),
                    Self::Yielding {
                        remaining: None,
                        iterated,
                    } => {
                        // vi. IfAbruptCloseIterator(completion, iterated).
                        iterated.if_abrupt_close_iterator(completion, context)?;

                        (iterated, None)
                    }
                    Self::Yielding {
                        remaining: Some(remaining),
                        iterated,
                    } => {
                        // vi. IfAbruptCloseIterator(completion, iterated).
                        iterated.if_abrupt_close_iterator(completion, context)?;

                        // i. If remaining = 0, then
                        //        1. Return ? IteratorClose(iterated, ReturnCompletion(undefined)).
                        // ii. If remaining ≠ +∞, then
                        //         1. Set remaining to remaining - 1.
                        let Some(remaining) = remaining.checked_sub(1) else {
                            iterated.close(Ok(JsValue::undefined()), context).branch()?;
                            return CoroutineState::Break(Ok(()));
                        };

                        (iterated, Some(remaining))
                    }
                };

                // iii. Let value be ? IteratorStepValue(iterated).
                match iterated.step_value(context).branch()? {
                    Some(value) => {
                        state.set(Self::Yielding {
                            remaining,
                            iterated,
                        });

                        // v. Let completion be Completion(Yield(value)).
                        CoroutineState::Continue(value)
                    }
                    // iv. If value is done, return ReturnCompletion(undefined).
                    None => CoroutineState::Break(Ok(())),
                }
            },
            Cell::new(Self::Yielding {
                iterated,
                remaining: limit,
            }),
        )
    }
}
