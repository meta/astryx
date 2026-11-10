use std::{cell::Cell, collections::VecDeque};

use boa_gc::{Finalize, Trace};

use crate::{
    JsObject,
    builtins::iterable::IteratorRecord,
    js_error,
    native_function::{CoroutineBranch, CoroutineState, NativeCoroutine},
    object::JsFunction,
};

use super::super::get_iterator_direct;

#[derive(Trace, Finalize)]
#[boa_gc(unsafe_no_drop)]
pub(crate) struct IterableRecord {
    pub(crate) iterable: JsObject,
    pub(crate) open_method: JsFunction,
}

/// [`Iterator.concat ( ...items )`][spec]
///
/// Concatenate a list of iterators.
///
/// [spec]: https://tc39.es/ecma262/#sec-iterator.concat
#[derive(Trace, Finalize, Default)]
#[boa_gc(unsafe_no_drop)]
pub(crate) enum Concat {
    #[default]
    Completed,
    OpeningNextIterable {
        iterables: VecDeque<IterableRecord>,
    },
    Yielding {
        iterables: VecDeque<IterableRecord>,
        current: IteratorRecord,
    },
}

impl Concat {
    #[allow(
        clippy::new_ret_no_self,
        reason = "slightly cleaner to have this be a `new` method"
    )]
    pub(crate) fn new(iterables: VecDeque<IterableRecord>) -> NativeCoroutine {
        // 3. Let closure be a new Abstract Closure with no parameters that captures
        //    iterables and performs the following steps when called:
        NativeCoroutine::from_copy_closure_with_captures(
            // a. For each Record iterable of iterables, do
            |completion, state, context| {
                let st = state.take();
                match &st {
                    Self::Yielding { current, .. } => {
                        // b. If completion is an abrupt completion, then
                        //        i. Return ? IteratorClose(iteratorRecord, completion).
                        current.if_abrupt_close_iterator(completion, context)?;
                    }
                    Self::OpeningNextIterable { .. } => {
                        completion.branch()?;
                    }
                    Self::Completed => {}
                }
                state.set(st);

                loop {
                    let st = state.take();

                    match st {
                        Self::Completed => return CoroutineState::Break(Ok(())),
                        Self::OpeningNextIterable { mut iterables } => {
                            // a. For each Record iterable of iterables, do
                            let Some(IterableRecord {
                                iterable,
                                open_method,
                            }) = iterables.pop_front()
                            else {
                                return CoroutineState::Break(Ok(()));
                            };

                            // i. Let iter be ? Call(iterable.[[OpenMethod]], iterable.[[Iterable]]).
                            let iter = open_method.call(&iterable.into(), &[], context).branch()?;
                            let Some(iter) = iter.as_object() else {
                                // ii. If iter is not an Object, throw a TypeError exception.
                                return CoroutineState::Break(Err(
                                    js_error!(TypeError: "Iterator.concat: open method of iterable did not return an object"),
                                ));
                            };
                            // iii. Let iteratorRecord be ? GetIteratorDirect(iter).
                            let iter = get_iterator_direct(&iter, context).branch()?;
                            state.set(Self::Yielding {
                                iterables,
                                current: iter,
                            });
                        }
                        // iv. Let innerAlive be true.
                        // v. Repeat, while innerAlive is true,
                        //        1. Let innerValue be ? IteratorStepValue(iteratorRecord).
                        Self::Yielding {
                            iterables,
                            mut current,
                        } => match current.step_value(context).branch()? {
                            // 3. Else,
                            Some(value) => {
                                state.set(Self::Yielding { iterables, current });
                                // a. Let completion be Completion(Yield(innerValue)).
                                return CoroutineState::Continue(value);
                            }
                            // 2. If innerValue is done, then
                            //    a. Set innerAlive to false.
                            None => state.set(Self::OpeningNextIterable { iterables }),
                        },
                    }
                }
            },
            Cell::new(Self::OpeningNextIterable { iterables }),
        )
    }
}
