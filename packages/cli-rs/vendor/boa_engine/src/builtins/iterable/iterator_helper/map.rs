use std::cell::Cell;

use boa_gc::{Finalize, Trace};

use crate::{
    JsValue,
    builtins::iterable::IteratorRecord,
    native_function::{CoroutineBranch, CoroutineState, NativeCoroutine},
    object::JsFunction,
};

/// [`Iterator.prototype.map(mapper)`][spec]
///
/// Maps all values of the underlying iterator with `mapper`.
///
/// [spec]: https://tc39.es/ecma262/#sec-iterator.prototype.map
#[derive(Trace, Finalize, Default)]
#[boa_gc(unsafe_no_drop)]
pub(crate) enum Map {
    #[default]
    Completed,
    Yielding {
        iterated: IteratorRecord,
        mapper: JsFunction,
        counter: u64,
    },
}

impl Map {
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
                match st {
                    Self::Completed => CoroutineState::Break(Ok(())),
                    Self::Yielding {
                        mut iterated,
                        mapper,
                        counter,
                    } => {
                        // vi. IfAbruptCloseIterator(completion, iterated).
                        iterated.if_abrupt_close_iterator(completion, context)?;

                        // i. Let value be ? IteratorStepValue(iterated).
                        // ii. If value is done, return ReturnCompletion(undefined).
                        let Some(value) = iterated.step_value(context).branch()? else {
                            return CoroutineState::Break(Ok(()));
                        };

                        // iii. Let mapped be Completion(Call(mapper, undefined, « value, 𝔽(counter) »)).
                        // iv. IfAbruptCloseIterator(mapped, iterated).
                        let value = if_abrupt_close_iterator!(
                            mapper.call(&JsValue::undefined(), &[value, counter.into()], context,),
                            iterated,
                            context
                        );

                        // vii. Set counter to counter + 1.
                        state.set(Self::Yielding {
                            iterated,
                            mapper,
                            counter: counter + 1,
                        });

                        // v. Let completion be Completion(Yield(mapped)).
                        CoroutineState::Continue(value)
                    }
                }
            },
            Cell::new(Self::Yielding {
                iterated,
                mapper,
                counter: 0,
            }),
        )
    }
}
