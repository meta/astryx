//! Boa's implementation of ECMAScript's global `Promise` object.

#[cfg(test)]
mod tests;

use super::{
    BuiltInBuilder, BuiltInConstructor, IntrinsicObject,
    iterable::{IteratorHint, IteratorRecord},
};
#[cfg(feature = "experimental")]
use crate::object::internal_methods::InternalMethodPropertyContext;
#[cfg(feature = "experimental")]
use crate::property::PropertyKey;
use crate::{
    Context, JsArgs, JsError, JsExpect, JsResult, JsString,
    builtins::{Array, BuiltInObject},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    error::JsNativeError,
    job::{JobCallback, PromiseJob},
    js_string,
    native_function::NativeFunction,
    object::{
        CONSTRUCTOR, FunctionObjectBuilder, JsFunction, JsObject,
        internal_methods::get_prototype_from_constructor,
    },
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
    value::JsValue,
};
use boa_gc::{Finalize, Gc, GcRefCell, Trace, custom_trace};
use boa_macros::JsData;
#[cfg(feature = "experimental")]
use std::cell::RefCell;
use std::{cell::Cell, rc::Rc};

// ==================== Public API ====================

/// The current state of a [`Promise`].
#[derive(Debug, Clone, Finalize, PartialEq, Eq)]
pub enum PromiseState {
    /// The promise hasn't been resolved.
    Pending,
    /// The promise was fulfilled with a success value.
    Fulfilled(JsValue),
    /// The promise was rejected with a failure reason.
    Rejected(JsValue),
}

unsafe impl Trace for PromiseState {
    custom_trace!(this, mark, {
        match this {
            Self::Fulfilled(v) | Self::Rejected(v) => mark(v),
            Self::Pending => {}
        }
    });
}

impl PromiseState {
    /// Gets the inner `JsValue` of a fulfilled promise state, or returns `None` if
    /// the state is not `Fulfilled`.
    #[must_use]
    pub const fn as_fulfilled(&self) -> Option<&JsValue> {
        match self {
            Self::Fulfilled(v) => Some(v),
            _ => None,
        }
    }

    /// Gets the inner `JsValue` of a rejected promise state, or returns `None` if
    /// the state is not `Rejected`.
    #[must_use]
    pub const fn as_rejected(&self) -> Option<&JsValue> {
        match self {
            Self::Rejected(v) => Some(v),
            _ => None,
        }
    }
}

/// The internal representation of a `Promise` object.
#[derive(Debug, Trace, Finalize, JsData)]
pub struct Promise {
    state: PromiseState,
    fulfill_reactions: Vec<ReactionRecord>,
    reject_reactions: Vec<ReactionRecord>,
    handled: bool,
}

/// The operation type of the [`HostPromiseRejectionTracker`][fn] abstract operation.
///
/// # Note
///
/// Per the spec:
///
/// > If operation is "handle", an implementation should not hold a reference to promise in a way
/// > that would interfere with garbage collection. An implementation may hold a reference to promise
/// > if operation is "reject", since it is expected that rejections will be rare and not on hot code paths.
///
/// [fn]: https://tc39.es/ecma262/#sec-host-promise-rejection-tracker
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperationType {
    /// A promise was rejected without any handlers.
    Reject,
    /// A handler was added to a rejected promise for the first time.
    Handle,
}

/// Functions used to resolve a pending promise.
///
/// This is equivalent to the parameters `resolveFunc` and `rejectFunc` of the executor passed to
/// the [`Promise()`] constructor.
///
/// Both functions are always associated with the promise from which they were created. This
/// means that by simply calling `resolve.call(this, &[values], context)` or
/// `reject.call(this, &[error], context)`, the state of the original promise will be updated with
/// the resolution value.
///
/// [`Promise()`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/Promise
#[derive(Debug, Clone, Finalize)]
pub struct ResolvingFunctions {
    /// The `resolveFunc` parameter of the executor passed to `Promise()`.
    pub resolve: JsFunction,
    /// The `rejectFunc` parameter of the executor passed to `Promise()`.
    pub reject: JsFunction,
}

// Manually implementing `Trace` to allow destructuring.
unsafe impl Trace for ResolvingFunctions {
    custom_trace!(this, mark, {
        mark(&this.resolve);
        mark(&this.reject);
    });
}

// ==================== Private API ====================

/// `IfAbruptRejectPromise ( value, capability )`
///
/// `IfAbruptRejectPromise` is a shorthand for a sequence of algorithm steps that use a `PromiseCapability` Record.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ifabruptrejectpromise
macro_rules! if_abrupt_reject_promise {
    ($value:expr, $capability:expr, $context: expr) => {
        match $value {
            // 1. If value is an abrupt completion, then
            Err(err) => {
                let err = err.into_opaque($context)?;
                // a. Perform ? Call(capability.[[Reject]], undefined, « value.[[Value]] »).
                $capability
                    .reject()
                    .call(&JsValue::undefined(), &[err], $context)?;

                // b. Return capability.[[Promise]].
                return Ok($capability.promise().clone().into());
            }
            // 2. Else if value is a Completion Record, set value to value.[[Value]].
            Ok(value) => value,
        }
    };
}

pub(crate) use if_abrupt_reject_promise;

/// The internal `PromiseCapability` data type.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-promisecapability-records
#[derive(Debug, Clone, Finalize)]
pub(crate) struct PromiseCapability {
    /// The `[[Promise]]` field.
    pub(crate) promise: JsObject,

    /// The resolving functions,
    pub(crate) functions: ResolvingFunctions,
}

// SAFETY: manually implementing `Trace` to allow destructuring.
unsafe impl Trace for PromiseCapability {
    custom_trace!(this, mark, {
        mark(&this.promise);
        mark(&this.functions);
    });
}

/// The internal `PromiseReaction` data type.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-promisereaction-records
#[derive(Debug, Trace, Finalize)]
pub(crate) struct ReactionRecord {
    /// The `[[Capability]]` field.
    promise_capability: Option<PromiseCapability>,

    /// The `[[Type]]` field.
    #[unsafe_ignore_trace]
    reaction_type: ReactionType,

    /// The `[[Handler]]` field.
    handler: Option<JobCallback>,
}

/// The `[[Type]]` field values of a `PromiseReaction` record.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-promisereaction-records
#[derive(Debug, Clone, Copy)]
enum ReactionType {
    Fulfill,
    Reject,
}

impl PromiseCapability {
    /// `NewPromiseCapability ( C )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-newpromisecapability
    pub(crate) fn new(c: &JsObject, context: &mut Context) -> JsResult<Self> {
        #[derive(Debug, Clone, Trace, Finalize)]
        struct RejectResolve {
            reject: JsValue,
            resolve: JsValue,
        }

        // 1. If IsConstructor(C) is false, throw a TypeError exception.
        if !c.is_constructor() {
            return Err(JsNativeError::typ()
                .with_message("PromiseCapability: expected constructor")
                .into());
        }

        // 2. NOTE: C is assumed to be a constructor function that supports the parameter conventions of the Promise constructor (see 27.2.3.1).
        // 3. Let promiseCapability be the PromiseCapability Record { [[Promise]]: undefined, [[Resolve]]: undefined, [[Reject]]: undefined }.
        let promise_capability = Gc::new(GcRefCell::new(RejectResolve {
            reject: JsValue::undefined(),
            resolve: JsValue::undefined(),
        }));

        // 4. Let executorClosure be a new Abstract Closure with parameters (resolve, reject) that captures promiseCapability and performs the following steps when called:
        // 5. Let executor be CreateBuiltinFunction(executorClosure, 2, "", « »).
        let executor = FunctionObjectBuilder::new(
            context.realm(),
            NativeFunction::from_copy_closure_with_captures(
                |_this, args: &[JsValue], captures, _| {
                    let mut promise_capability = captures.borrow_mut();
                    // a. If promiseCapability.[[Resolve]] is not undefined, throw a TypeError exception.
                    if !promise_capability.resolve.is_undefined() {
                        return Err(JsNativeError::typ()
                            .with_message("promiseCapability.[[Resolve]] is not undefined")
                            .into());
                    }

                    // b. If promiseCapability.[[Reject]] is not undefined, throw a TypeError exception.
                    if !promise_capability.reject.is_undefined() {
                        return Err(JsNativeError::typ()
                            .with_message("promiseCapability.[[Reject]] is not undefined")
                            .into());
                    }

                    let resolve = args.get_or_undefined(0);
                    let reject = args.get_or_undefined(1);

                    // c. Set promiseCapability.[[Resolve]] to resolve.
                    promise_capability.resolve = resolve.clone();

                    // d. Set promiseCapability.[[Reject]] to reject.
                    promise_capability.reject = reject.clone();

                    // e. Return undefined.
                    Ok(JsValue::undefined())
                },
                promise_capability.clone(),
            ),
        )
        .name("")
        .length(2)
        .build()
        .into();

        // 6. Let promise be ? Construct(C, « executor »).
        let promise = c.construct(&[executor], None, context)?;

        let promise_capability = promise_capability.borrow();

        let resolve = promise_capability.resolve.clone();
        let reject = promise_capability.reject.clone();

        // 7. If IsCallable(promiseCapability.[[Resolve]]) is false, throw a TypeError exception.
        let resolve = resolve
            .as_object()
            .and_then(JsFunction::from_object)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("promiseCapability.[[Resolve]] is not callable")
            })?;

        // 8. If IsCallable(promiseCapability.[[Reject]]) is false, throw a TypeError exception.
        let reject = reject
            .as_object()
            .and_then(JsFunction::from_object)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("promiseCapability.[[Reject]] is not callable")
            })?;

        // 9. Set promiseCapability.[[Promise]] to promise.
        // 10. Return promiseCapability.
        Ok(Self {
            promise,
            functions: ResolvingFunctions { resolve, reject },
        })
    }

    /// Returns the promise object.
    pub(crate) const fn promise(&self) -> &JsObject {
        &self.promise
    }

    /// Returns the resolve function.
    pub(crate) const fn resolve(&self) -> &JsFunction {
        &self.functions.resolve
    }

    /// Returns the reject function.
    pub(crate) const fn reject(&self) -> &JsFunction {
        &self.functions.reject
    }
}

impl IntrinsicObject for Promise {
    fn init(realm: &Realm) {
        let get_species = BuiltInBuilder::callable(realm, Self::get_species)
            .name(js_string!("get [Symbol.species]"))
            .build();

        let builder = BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_method(Self::all, js_string!("all"), 1)
            .static_method(Self::all_settled, js_string!("allSettled"), 1)
            .static_method(Self::any, js_string!("any"), 1)
            .static_method(Self::race, js_string!("race"), 1)
            .static_method(Self::reject, js_string!("reject"), 1)
            .static_method(Self::resolve, js_string!("resolve"), 1)
            .static_method(Self::r#try, js_string!("try"), 1)
            .static_method(Self::with_resolvers, js_string!("withResolvers"), 0)
            .static_accessor(
                JsSymbol::species(),
                Some(get_species),
                None,
                Attribute::CONFIGURABLE,
            )
            .method(Self::then, js_string!("then"), 2)
            .method(Self::catch, js_string!("catch"), 1)
            .method(Self::finally, js_string!("finally"), 1)
            // <https://tc39.es/ecma262/#sec-promise.prototype-@@tostringtag>
            .property(
                JsSymbol::to_string_tag(),
                Self::NAME,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            );

        #[cfg(feature = "experimental")]
        let builder = builder
            .static_method(Self::all_keyed, js_string!("allKeyed"), 1)
            .static_method(Self::all_settled_keyed, js_string!("allSettledKeyed"), 1);

        builder.build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for Promise {
    const NAME: JsString = StaticJsStrings::PROMISE;
}

impl BuiltInConstructor for Promise {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 4;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 12;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::promise;

    /// `Promise ( executor )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise-executor
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message("Promise NewTarget cannot be undefined")
                .into());
        }

        // 2. If IsCallable(executor) is false, throw a TypeError exception.
        let executor = args
            .get_or_undefined(0)
            .as_callable()
            .ok_or_else(|| JsNativeError::typ().with_message("Promise executor is not callable"))?;

        // 3. Let promise be ? OrdinaryCreateFromConstructor(NewTarget, "%Promise.prototype%", « [[PromiseState]], [[PromiseResult]], [[PromiseFulfillReactions]], [[PromiseRejectReactions]], [[PromiseIsHandled]] »).
        let promise =
            get_prototype_from_constructor(new_target, StandardConstructors::promise, context)?;

        let promise = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            promise,
            // 4. Set promise.[[PromiseState]] to pending.
            // 5. Set promise.[[PromiseFulfillReactions]] to a new empty List.
            // 6. Set promise.[[PromiseRejectReactions]] to a new empty List.
            // 7. Set promise.[[PromiseIsHandled]] to false.
            Self::new(),
        );

        // 8. Let resolvingFunctions be CreateResolvingFunctions(promise).
        let resolving_functions = Self::create_resolving_functions(&promise, context);

        // 9. Let completion Completion(Call(executor, undefined, « resolvingFunctions.[[Resolve]], resolvingFunctions.[[Reject]] »)be ).
        let completion = executor.call(
            &JsValue::undefined(),
            &[
                resolving_functions.resolve.clone().into(),
                resolving_functions.reject.clone().into(),
            ],
            context,
        );

        // 10. If completion is an abrupt completion, then
        if let Err(e) = completion {
            let e = e.into_opaque(context)?;
            // a. Perform ? Call(resolvingFunctions.[[Reject]], undefined, « completion.[[Value]] »).
            resolving_functions
                .reject
                .call(&JsValue::undefined(), &[e], context)?;
        }

        // 11. Return promise.
        Ok(promise.into())
    }
}

impl Promise {
    /// Creates a new, pending `Promise`.
    pub(crate) fn new() -> Self {
        Self {
            state: PromiseState::Pending,
            fulfill_reactions: Vec::default(),
            reject_reactions: Vec::default(),
            handled: false,
        }
    }

    /// Gets the current state of the promise.
    pub(crate) const fn state(&self) -> &PromiseState {
        &self.state
    }

    /// [`Promise.try ( callbackfn, ...args )`][spec]
    ///
    /// Calls the given function and returns a new promise that is resolved if the function
    /// completes normally and rejected if it throws.
    ///
    /// [spec]: https://tc39.es/proposal-promise-try/#sec-promise.try
    pub(crate) fn r#try(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let callback = args.get_or_undefined(0);
        let callback_args = args.get(1..).unwrap_or(&[]);

        // 1. Let C be the this value.
        // 2. If C is not an Object, throw a TypeError exception.
        let c = this.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message("Promise.try() called on a non-object")
        })?;

        // 3. Let promiseCapability be ? NewPromiseCapability(C).
        let promise_capability = PromiseCapability::new(&c, context)?;

        // 4. Let status be Completion(Call(callbackfn, undefined, args)).
        let status = callback.call(&JsValue::undefined(), callback_args, context);

        match status {
            // 5. If status is an abrupt completion, then
            Err(err) => {
                let value = err.into_opaque(context)?;

                // a. Perform ? Call(promiseCapability.[[Reject]], undefined, « status.[[Value]] »).
                promise_capability.functions.reject.call(
                    &JsValue::undefined(),
                    &[value],
                    context,
                )?;
            }
            // 6. Else,
            Ok(value) => {
                // a. Perform ? Call(promiseCapability.[[Resolve]], undefined, « status.[[Value]] »).
                promise_capability.functions.resolve.call(
                    &JsValue::undefined(),
                    &[value],
                    context,
                )?;
            }
        }

        // 7. Return promiseCapability.[[Promise]].
        Ok(promise_capability.promise.clone().into())
    }

    /// [`Promise.withResolvers ( )`][spec]
    ///
    /// Creates a new promise that is pending, and returns that promise plus the resolve and reject
    /// functions associated with it.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise.withResolvers
    pub(crate) fn with_resolvers(
        this: &JsValue,
        _args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let C be the this value.

        use super::OrdinaryObject;
        let c = this.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message("Promise.withResolvers() called on a non-object")
        })?;

        // 2. Let promiseCapability be ? NewPromiseCapability(C).
        let PromiseCapability {
            promise,
            functions: ResolvingFunctions { resolve, reject },
        } = PromiseCapability::new(&c, context)?;

        // 3. Let obj be OrdinaryObjectCreate(%Object.prototype%).
        // 4. Perform ! CreateDataPropertyOrThrow(obj, "promise", promiseCapability.[[Promise]]).
        // 5. Perform ! CreateDataPropertyOrThrow(obj, "resolve", promiseCapability.[[Resolve]]).
        // 6. Perform ! CreateDataPropertyOrThrow(obj, "reject", promiseCapability.[[Reject]]).
        let obj = context.intrinsics().templates().with_resolvers().create(
            OrdinaryObject,
            vec![promise.into(), resolve.into(), reject.into()],
        );

        // 7. Return obj.
        Ok(obj.into())
    }

    /// `Promise.all ( iterable )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise.all
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
    pub(crate) fn all(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let C be the this value.
        let c = this.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message("Promise.all() called on a non-object")
        })?;

        // 2. Let promiseCapability be ? NewPromiseCapability(C).
        let promise_capability = PromiseCapability::new(&c, context)?;

        // 3. Let promiseResolve be Completion(GetPromiseResolve(C)).
        let promise_resolve = Self::get_promise_resolve(&c, context);

        // 4. IfAbruptRejectPromise(promiseResolve, promiseCapability).
        let promise_resolve =
            if_abrupt_reject_promise!(promise_resolve, promise_capability, context);

        // 5. Let iteratorRecord be Completion(GetIterator(iterable, sync)).
        let iterator_record = args
            .get_or_undefined(0)
            .get_iterator(IteratorHint::Sync, context);

        // 6. IfAbruptRejectPromise(iteratorRecord, promiseCapability).
        let mut iterator_record =
            if_abrupt_reject_promise!(iterator_record, promise_capability, context);

        // 7. Let result be Completion(PerformPromiseAll(iteratorRecord, C, promiseCapability, promiseResolve)).
        let mut result = Self::perform_promise_all(
            &mut iterator_record,
            &c,
            &promise_capability,
            &promise_resolve,
            context,
        )
        .map(JsValue::from);

        // 8. If result is an abrupt completion, then
        if result.is_err() {
            // a. If iteratorRecord.[[Done]] is false, set result to Completion(IteratorClose(iteratorRecord, result)).
            if !iterator_record.done() {
                result = iterator_record.close(result, context);
            }

            // b. IfAbruptRejectPromise(result, promiseCapability).
            let result = if_abrupt_reject_promise!(result, promise_capability, context);

            return Ok(result);
        }

        // 9. Return ? result.
        result
    }

    /// `PerformPromiseAll ( iteratorRecord, constructor, resultCapability, promiseResolve )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-performpromiseall
    pub(crate) fn perform_promise_all(
        iterator_record: &mut IteratorRecord,
        constructor: &JsObject,
        result_capability: &PromiseCapability,
        promise_resolve: &JsObject,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        #[derive(Debug, Trace, Finalize)]
        struct ResolveElementCaptures {
            #[unsafe_ignore_trace]
            already_called: Rc<Cell<bool>>,
            index: usize,
            values: Gc<GcRefCell<Vec<JsValue>>>,
            capability_resolve: JsFunction,
            #[unsafe_ignore_trace]
            remaining_elements_count: Rc<Cell<i32>>,
        }

        // 1. Let values be a new empty List.
        let values = Gc::new(GcRefCell::new(Vec::new()));

        // 2. Let remainingElementsCount be the Record { [[Value]]: 1 }.
        let remaining_elements_count = Rc::new(Cell::new(1));

        // 3. Let index be 0.
        let mut index = 0;

        // 4. Repeat,
        while let Some(next) = iterator_record.step_value(context)? {
            // c. Append undefined to values.
            values.borrow_mut().push(JsValue::undefined());

            // d. Let nextPromise be ? Call(promiseResolve, constructor, « next »).
            let next_promise =
                promise_resolve.call(&constructor.clone().into(), &[next], context)?;

            // e. Let steps be the algorithm steps defined in Promise.all Resolve Element Functions.
            // f. Let length be the number of non-optional parameters of the function definition in Promise.all Resolve Element Functions.
            // g. Let onFulfilled be CreateBuiltinFunction(steps, length, "", « [[AlreadyCalled]], [[Index]], [[Values]], [[Capability]], [[RemainingElements]] »).
            // h. Set onFulfilled.[[AlreadyCalled]] to false.
            // i. Set onFulfilled.[[Index]] to index.
            // j. Set onFulfilled.[[Values]] to values.
            // k. Set onFulfilled.[[Capability]] to resultCapability.
            // l. Set onFulfilled.[[RemainingElements]] to remainingElementsCount.
            let on_fulfilled = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_copy_closure_with_captures(
                    |_, args, captures, context| {
                        // https://tc39.es/ecma262/#sec-promise.all-resolve-element-functions

                        // 1. Let F be the active function object.
                        // 2. If F.[[AlreadyCalled]] is true, return undefined.
                        if captures.already_called.get() {
                            return Ok(JsValue::undefined());
                        }

                        // 3. Set F.[[AlreadyCalled]] to true.
                        captures.already_called.set(true);

                        // 4. Let index be F.[[Index]].
                        // 5. Let values be F.[[Values]].
                        // 6. Let promiseCapability be F.[[Capability]].
                        // 7. Let remainingElementsCount be F.[[RemainingElements]].

                        // 8. Set values[index] to x.
                        captures.values.borrow_mut()[captures.index] =
                            args.get_or_undefined(0).clone();

                        // 9. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
                        captures
                            .remaining_elements_count
                            .set(captures.remaining_elements_count.get() - 1);

                        // 10. If remainingElementsCount.[[Value]] is 0, then
                        if captures.remaining_elements_count.get() == 0 {
                            // a. Let valuesArray be CreateArrayFromList(values).
                            let values_array = Array::create_array_from_list(
                                captures.values.borrow().as_slice().iter().cloned(),
                                context,
                            );

                            // b. Return ? Call(promiseCapability.[[Resolve]], undefined, « valuesArray »).
                            return captures.capability_resolve.call(
                                &JsValue::undefined(),
                                &[values_array.into()],
                                context,
                            );
                        }

                        // 11. Return undefined.
                        Ok(JsValue::undefined())
                    },
                    ResolveElementCaptures {
                        already_called: Rc::new(Cell::new(false)),
                        index,
                        values: values.clone(),
                        capability_resolve: result_capability.functions.resolve.clone(),
                        remaining_elements_count: remaining_elements_count.clone(),
                    },
                ),
            )
            .name("")
            .length(1)
            .constructor(false)
            .build();

            // m. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] + 1.
            remaining_elements_count.set(remaining_elements_count.get() + 1);

            // n. Perform ? Invoke(nextPromise, "then", « onFulfilled, resultCapability.[[Reject]] »).
            next_promise.invoke(
                js_string!("then"),
                &[
                    on_fulfilled.into(),
                    result_capability.functions.reject.clone().into(),
                ],
                context,
            )?;

            // o. Set index to index + 1.
            index += 1;
        }

        // b. If next is done, then
        //     i. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
        remaining_elements_count.set(remaining_elements_count.get() - 1);

        //     ii. If remainingElementsCount.[[Value]] = 0, then
        if remaining_elements_count.get() == 0 {
            // 1. Let valuesArray be CreateArrayFromList(values).
            let values_array =
                Array::create_array_from_list(values.borrow().iter().cloned(), context);

            // 2. Perform ? Call(resultCapability.[[Resolve]], undefined, « valuesArray »).
            result_capability.functions.resolve.call(
                &JsValue::undefined(),
                &[values_array.into()],
                context,
            )?;
        }

        //     iii. Return resultCapability.[[Promise]].
        Ok(result_capability.promise.clone())
    }

    /// `Promise.allSettled ( iterable )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise.allsettled
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled
    pub(crate) fn all_settled(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let C be the this value.
        let c = this.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message("Promise.allSettled() called on a non-object")
        })?;

        // 2. Let promiseCapability be ? NewPromiseCapability(C).
        let promise_capability = PromiseCapability::new(&c, context)?;

        // 3. Let promiseResolve be Completion(GetPromiseResolve(C)).
        let promise_resolve = Self::get_promise_resolve(&c, context);

        // 4. IfAbruptRejectPromise(promiseResolve, promiseCapability).
        let promise_resolve =
            if_abrupt_reject_promise!(promise_resolve, promise_capability, context);

        // 5. Let iteratorRecord be Completion(GetIterator(iterable, sync)).
        let iterator_record = args
            .get_or_undefined(0)
            .get_iterator(IteratorHint::Sync, context);

        // 6. IfAbruptRejectPromise(iteratorRecord, promiseCapability).
        let mut iterator_record =
            if_abrupt_reject_promise!(iterator_record, promise_capability, context);

        // 7. Let result be Completion(PerformPromiseAllSettled(iteratorRecord, C, promiseCapability, promiseResolve)).
        let mut result = Self::perform_promise_all_settled(
            &mut iterator_record,
            &c,
            &promise_capability,
            &promise_resolve,
            context,
        )
        .map(JsValue::from);

        // 8. If result is an abrupt completion, then
        if result.is_err() {
            // a. If iteratorRecord.[[Done]] is false, set result to Completion(IteratorClose(iteratorRecord, result)).
            if !iterator_record.done() {
                result = iterator_record.close(result, context);
            }

            // b. IfAbruptRejectPromise(result, promiseCapability).
            let result = if_abrupt_reject_promise!(result, promise_capability, context);

            return Ok(result);
        }

        // 9. Return ? result.
        result
    }

    /// `PerformPromiseAllSettled ( iteratorRecord, constructor, resultCapability, promiseResolve )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-performpromiseallsettled
    pub(crate) fn perform_promise_all_settled(
        iterator_record: &mut IteratorRecord,
        constructor: &JsObject,
        result_capability: &PromiseCapability,
        promise_resolve: &JsObject,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        #[derive(Debug, Trace, Finalize)]
        struct ResolveRejectElementCaptures {
            #[unsafe_ignore_trace]
            already_called: Rc<Cell<bool>>,
            index: usize,
            values: Gc<GcRefCell<Vec<JsValue>>>,
            capability: JsFunction,
            #[unsafe_ignore_trace]
            remaining_elements: Rc<Cell<i32>>,
        }

        // 1. Let values be a new empty List.
        let values = Gc::new(GcRefCell::new(Vec::new()));

        // 2. Let remainingElementsCount be the Record { [[Value]]: 1 }.
        let remaining_elements_count = Rc::new(Cell::new(1));

        // 3. Let index be 0.
        let mut index = 0;

        // 4. Repeat,
        while let Some(next) = iterator_record.step_value(context)? {
            // c. Append undefined to values.
            values.borrow_mut().push(JsValue::undefined());

            // d. Let nextPromise be ? Call(promiseResolve, constructor, « next »).
            let next_promise =
                promise_resolve.call(&constructor.clone().into(), &[next], context)?;

            // h. Let alreadyCalled be the Record { [[Value]]: false }.
            let already_called = Rc::new(Cell::new(false));

            // e. Let stepsFulfilled be the algorithm steps defined in Promise.allSettled Resolve Element Functions.
            // f. Let lengthFulfilled be the number of non-optional parameters of the function definition in Promise.allSettled Resolve Element Functions.
            // g. Let onFulfilled be CreateBuiltinFunction(stepsFulfilled, lengthFulfilled, "", « [[AlreadyCalled]], [[Index]], [[Values]], [[Capability]], [[RemainingElements]] »).
            // i. Set onFulfilled.[[AlreadyCalled]] to alreadyCalled.
            // j. Set onFulfilled.[[Index]] to index.
            // k. Set onFulfilled.[[Values]] to values.
            // l. Set onFulfilled.[[Capability]] to resultCapability.
            // m. Set onFulfilled.[[RemainingElements]] to remainingElementsCount.
            let on_fulfilled = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_copy_closure_with_captures(
                    |_, args, captures, context| {
                        // https://tc39.es/ecma262/#sec-promise.allsettled-resolve-element-functions

                        // 1. Let F be the active function object.
                        // 2. Let alreadyCalled be F.[[AlreadyCalled]].

                        // 3. If alreadyCalled.[[Value]] is true, return undefined.
                        if captures.already_called.get() {
                            return Ok(JsValue::undefined());
                        }

                        // 4. Set alreadyCalled.[[Value]] to true.
                        captures.already_called.set(true);

                        // 5. Let index be F.[[Index]].
                        // 6. Let values be F.[[Values]].
                        // 7. Let promiseCapability be F.[[Capability]].
                        // 8. Let remainingElementsCount be F.[[RemainingElements]].

                        // 9. Let obj be OrdinaryObjectCreate(%Object.prototype%).
                        let obj = JsObject::with_object_proto(context.intrinsics());

                        // 10. Perform ! CreateDataPropertyOrThrow(obj, "status", "fulfilled").
                        obj.create_data_property_or_throw(
                            js_string!("status"),
                            js_string!("fulfilled"),
                            context,
                        )
                        .js_expect("cannot fail per spec")?;

                        // 11. Perform ! CreateDataPropertyOrThrow(obj, "value", x).
                        obj.create_data_property_or_throw(
                            js_string!("value"),
                            args.get_or_undefined(0).clone(),
                            context,
                        )
                        .js_expect("cannot fail per spec")?;

                        // 12. Set values[index] to obj.
                        captures.values.borrow_mut()[captures.index] = obj.into();

                        // 13. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
                        captures
                            .remaining_elements
                            .set(captures.remaining_elements.get() - 1);

                        // 14. If remainingElementsCount.[[Value]] is 0, then
                        if captures.remaining_elements.get() == 0 {
                            // a. Let valuesArray be CreateArrayFromList(values).
                            let values_array = Array::create_array_from_list(
                                captures.values.borrow().as_slice().iter().cloned(),
                                context,
                            );

                            // b. Return ? Call(promiseCapability.[[Resolve]], undefined, « valuesArray »).
                            return captures.capability.call(
                                &JsValue::undefined(),
                                &[values_array.into()],
                                context,
                            );
                        }

                        // 15. Return undefined.
                        Ok(JsValue::undefined())
                    },
                    ResolveRejectElementCaptures {
                        already_called: already_called.clone(),
                        index,
                        values: values.clone(),
                        capability: result_capability.functions.resolve.clone(),
                        remaining_elements: remaining_elements_count.clone(),
                    },
                ),
            )
            .name("")
            .length(1)
            .constructor(false)
            .build();

            // n. Let stepsRejected be the algorithm steps defined in Promise.allSettled Reject Element Functions.
            // o. Let lengthRejected be the number of non-optional parameters of the function definition in Promise.allSettled Reject Element Functions.
            // p. Let onRejected be CreateBuiltinFunction(stepsRejected, lengthRejected, "", « [[AlreadyCalled]], [[Index]], [[Values]], [[Capability]], [[RemainingElements]] »).
            // q. Set onRejected.[[AlreadyCalled]] to alreadyCalled.
            // r. Set onRejected.[[Index]] to index.
            // s. Set onRejected.[[Values]] to values.
            // t. Set onRejected.[[Capability]] to resultCapability.
            // u. Set onRejected.[[RemainingElements]] to remainingElementsCount.
            let on_rejected = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_copy_closure_with_captures(
                    |_, args, captures, context| {
                        // https://tc39.es/ecma262/#sec-promise.allsettled-reject-element-functions

                        // 1. Let F be the active function object.
                        // 2. Let alreadyCalled be F.[[AlreadyCalled]].

                        // 3. If alreadyCalled.[[Value]] is true, return undefined.
                        if captures.already_called.get() {
                            return Ok(JsValue::undefined());
                        }

                        // 4. Set alreadyCalled.[[Value]] to true.
                        captures.already_called.set(true);

                        // 5. Let index be F.[[Index]].
                        // 6. Let values be F.[[Values]].
                        // 7. Let promiseCapability be F.[[Capability]].
                        // 8. Let remainingElementsCount be F.[[RemainingElements]].

                        // 9. Let obj be OrdinaryObjectCreate(%Object.prototype%).
                        let obj = JsObject::with_object_proto(context.intrinsics());

                        // 10. Perform ! CreateDataPropertyOrThrow(obj, "status", "rejected").
                        obj.create_data_property_or_throw(
                            js_string!("status"),
                            js_string!("rejected"),
                            context,
                        )
                        .js_expect("cannot fail per spec")?;

                        // 11. Perform ! CreateDataPropertyOrThrow(obj, "reason", x).
                        obj.create_data_property_or_throw(
                            js_string!("reason"),
                            args.get_or_undefined(0).clone(),
                            context,
                        )
                        .js_expect("cannot fail per spec")?;

                        // 12. Set values[index] to obj.
                        captures.values.borrow_mut()[captures.index] = obj.into();

                        // 13. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
                        captures
                            .remaining_elements
                            .set(captures.remaining_elements.get() - 1);

                        // 14. If remainingElementsCount.[[Value]] is 0, then
                        if captures.remaining_elements.get() == 0 {
                            // a. Let valuesArray be CreateArrayFromList(values).
                            let values_array = Array::create_array_from_list(
                                captures.values.borrow().as_slice().iter().cloned(),
                                context,
                            );

                            // b. Return ? Call(promiseCapability.[[Resolve]], undefined, « valuesArray »).
                            return captures.capability.call(
                                &JsValue::undefined(),
                                &[values_array.into()],
                                context,
                            );
                        }

                        // 15. Return undefined.
                        Ok(JsValue::undefined())
                    },
                    ResolveRejectElementCaptures {
                        already_called,
                        index,
                        values: values.clone(),
                        capability: result_capability.functions.resolve.clone(),
                        remaining_elements: remaining_elements_count.clone(),
                    },
                ),
            )
            .name("")
            .length(1)
            .constructor(false)
            .build();

            // v. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] + 1.
            remaining_elements_count.set(remaining_elements_count.get() + 1);

            // w. Perform ? Invoke(nextPromise, "then", « onFulfilled, onRejected »).
            next_promise.invoke(
                js_string!("then"),
                &[on_fulfilled.into(), on_rejected.into()],
                context,
            )?;

            // x. Set index to index + 1.
            index += 1;
        }

        // b. If next is done, then
        //     i. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
        remaining_elements_count.set(remaining_elements_count.get() - 1);

        //     ii. If remainingElementsCount.[[Value]] = 0, then
        if remaining_elements_count.get() == 0 {
            // 1. Let valuesArray be CreateArrayFromList(values).
            let values_array =
                Array::create_array_from_list(values.borrow().as_slice().iter().cloned(), context);

            // 2. Perform ? Call(resultCapability.[[Resolve]], undefined, « valuesArray »).
            result_capability.functions.resolve.call(
                &JsValue::undefined(),
                &[values_array.into()],
                context,
            )?;
        }

        //     iii. Return resultCapability.[[Promise]].
        Ok(result_capability.promise.clone())
    }

    /// `Promise.allKeyed ( promises )`
    ///
    /// More information:
    ///  - [TC39 proposal spec][spec]
    ///
    /// [spec]: https://tc39.es/proposal-await-dictionary/#sec-promise.allkeyed
    #[cfg(feature = "experimental")]
    pub(crate) fn all_keyed(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        Self::keyed_common(this, args, context, KeyedVariant::All, "allKeyed")
    }

    /// `Promise.allSettledKeyed ( promises )`
    ///
    /// More information:
    ///  - [TC39 proposal spec][spec]
    ///
    /// [spec]: https://tc39.es/proposal-await-dictionary/#sec-promise.allsettledkeyed
    #[cfg(feature = "experimental")]
    pub(crate) fn all_settled_keyed(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        Self::keyed_common(
            this,
            args,
            context,
            KeyedVariant::AllSettled,
            "allSettledKeyed",
        )
    }

    /// Shared entry-point logic for `Promise.allKeyed` and `Promise.allSettledKeyed`.
    #[cfg(feature = "experimental")]
    fn keyed_common(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
        variant: KeyedVariant,
        name: &str,
    ) -> JsResult<JsValue> {
        // 1. Let C be the this value.
        let c = this.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message(format!("Promise.{name}() called on a non-object"))
        })?;

        // 2. Let promiseCapability be ? NewPromiseCapability(C).
        let promise_capability = PromiseCapability::new(&c, context)?;

        // 3. Let promiseResolve be Completion(GetPromiseResolve(C)).
        let promise_resolve = Self::get_promise_resolve(&c, context);

        // 4. IfAbruptRejectPromise(promiseResolve, promiseCapability).
        let promise_resolve =
            if_abrupt_reject_promise!(promise_resolve, promise_capability, context);

        // 5. If promises is not an Object, then
        let promises = args.get_or_undefined(0);
        let Some(promises_obj) = promises.as_object() else {
            // a. Let error be a newly created TypeError object.
            let error = JsNativeError::typ()
                .with_message(format!("Promise.{name}() expects an object argument"))
                .into_opaque(context);
            // b. Perform ? Call(promiseCapability.[[Reject]], undefined, « error »).
            promise_capability.functions.reject.call(
                &JsValue::undefined(),
                &[error.into()],
                context,
            )?;
            // c. Return promiseCapability.[[Promise]].
            return Ok(promise_capability.promise.clone().into());
        };

        // 6. Let result be Completion(PerformPromiseAllKeyed(variant, promises, C, promiseCapability, promiseResolve)).
        let result = Self::perform_promise_all_keyed(
            variant,
            &promises_obj,
            &c,
            &promise_capability,
            &promise_resolve,
            context,
        );

        // 7. IfAbruptRejectPromise(result, promiseCapability).
        let _result = if_abrupt_reject_promise!(result, promise_capability, context);

        // 8. Return promiseCapability.[[Promise]].
        Ok(promise_capability.promise.clone().into())
    }

    /// `PerformPromiseAllKeyed ( variant, promises, constructor, resultCapability, promiseResolve )`
    ///
    /// More information:
    ///  - [TC39 proposal spec][spec]
    ///
    /// [spec]: https://tc39.es/proposal-await-dictionary/#sec-performpromiseallkeyed
    #[cfg(feature = "experimental")]
    fn perform_promise_all_keyed(
        variant: KeyedVariant,
        promises: &JsObject,
        constructor: &JsObject,
        result_capability: &PromiseCapability,
        promise_resolve: &JsObject,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        #[derive(Debug, Trace, Finalize)]
        struct KeyedResolveCaptures {
            #[unsafe_ignore_trace]
            already_called: Rc<Cell<bool>>,
            index: usize,
            #[unsafe_ignore_trace]
            variant: KeyedVariant,
            #[unsafe_ignore_trace]
            keys: Rc<RefCell<Vec<PropertyKey>>>,
            values: Gc<GcRefCell<Vec<JsValue>>>,
            capability: JsFunction,
            #[unsafe_ignore_trace]
            remaining_elements: Rc<Cell<i32>>,
        }

        // 1. Let allKeys be ? promises.[[OwnPropertyKeys]]().
        let all_keys = promises.own_property_keys(context)?;

        // 2. Let keys be a new empty List.
        let keys = Rc::new(RefCell::new(Vec::new()));

        // 3. Let values be a new empty List.
        let values = Gc::new(GcRefCell::new(Vec::new()));

        // 4. Let remainingElementsCount be the Record { [[Value]]: 1 }.
        let remaining_elements_count = Rc::new(Cell::new(1));

        // 5. Let index be 0.
        let mut index = 0;

        // 6. For each element key of allKeys, do
        for key in all_keys {
            // a. Let desc be ? promises.[[GetOwnProperty]](key).
            let desc = promises
                .__get_own_property__(&key, &mut InternalMethodPropertyContext::new(context))?;

            // b. If desc is not undefined and desc.[[Enumerable]] is true, then
            if let Some(desc) = desc
                && desc.expect_enumerable()
            {
                // i. Let value be ? Get(promises, key).
                let value = promises.get(key.clone(), context)?;

                // ii. Append key to keys.
                keys.borrow_mut().push(key);

                // iii. Append undefined to values.
                values.borrow_mut().push(JsValue::undefined());

                // iv. Let nextPromise be ? Call(promiseResolve, constructor, « value »).
                let next_promise =
                    promise_resolve.call(&JsValue::from(constructor.clone()), &[value], context)?;

                // v. Let alreadyCalled be the Record { [[Value]]: false }.
                let already_called = Rc::new(Cell::new(false));

                // vi. Let onFulfilled be a new Abstract Closure...
                let on_fulfilled = FunctionObjectBuilder::new(
                    context.realm(),
                    NativeFunction::from_copy_closure_with_captures(
                        |_, args, captures, context| {
                            // 1. If alreadyCalled.[[Value]] is true, return undefined.
                            if captures.already_called.get() {
                                return Ok(JsValue::undefined());
                            }

                            // 2. Set alreadyCalled.[[Value]] to true.
                            captures.already_called.set(true);

                            let x = args.get_or_undefined(0).clone();

                            // 3. If variant is all, then
                            if captures.variant == KeyedVariant::All {
                                // a. Set values[index] to x.
                                captures.values.borrow_mut()[captures.index] = x;
                            } else {
                                // 4. Else (variant is all-settled)
                                // a. Let obj be OrdinaryObjectCreate(%Object.prototype%).
                                let obj = JsObject::with_object_proto(context.intrinsics());
                                // b. Perform ! CreateDataPropertyOrThrow(obj, "status", "fulfilled").
                                obj.create_data_property_or_throw(
                                    js_string!("status"),
                                    js_string!("fulfilled"),
                                    context,
                                )
                                .js_expect("cannot fail per spec")?;
                                // c. Perform ! CreateDataPropertyOrThrow(obj, "value", x).
                                obj.create_data_property_or_throw(js_string!("value"), x, context)
                                    .js_expect("cannot fail per spec")?;
                                // d. Set values[index] to obj.
                                captures.values.borrow_mut()[captures.index] = obj.into();
                            }

                            // 5. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
                            captures
                                .remaining_elements
                                .set(captures.remaining_elements.get() - 1);

                            // 6. If remainingElementsCount.[[Value]] = 0, then
                            if captures.remaining_elements.get() == 0 {
                                // a. Let result be CreateKeyedPromiseCombinatorResultObject(keys, values).
                                let result = create_keyed_result_object(
                                    &captures.keys.borrow(),
                                    &captures.values.borrow(),
                                    context,
                                );
                                // b. Return ? Call(resultCapability.[[Resolve]], undefined, « result »).
                                return captures.capability.call(
                                    &JsValue::undefined(),
                                    &[result.into()],
                                    context,
                                );
                            }

                            // 7. Return undefined.
                            Ok(JsValue::undefined())
                        },
                        KeyedResolveCaptures {
                            already_called: already_called.clone(),
                            index,
                            variant,
                            keys: keys.clone(),
                            values: values.clone(),
                            capability: result_capability.functions.resolve.clone(),
                            remaining_elements: remaining_elements_count.clone(),
                        },
                    ),
                )
                .name("")
                .length(1)
                .constructor(false)
                .build();

                // vii-viii. Build onRejected
                let on_rejected = if variant == KeyedVariant::All {
                    // If variant is all, let onRejected be resultCapability.[[Reject]].
                    result_capability.functions.reject.clone().into()
                } else {
                    // Else (variant is all-settled), let onRejected be a new Abstract Closure...
                    let on_rejected_fn = FunctionObjectBuilder::new(
                        context.realm(),
                        NativeFunction::from_copy_closure_with_captures(
                            |_, args, captures, context| {
                                // 1. If alreadyCalled.[[Value]] is true, return undefined.
                                if captures.already_called.get() {
                                    return Ok(JsValue::undefined());
                                }

                                // 2. Set alreadyCalled.[[Value]] to true.
                                captures.already_called.set(true);

                                let x = args.get_or_undefined(0).clone();

                                // 3. Let obj be OrdinaryObjectCreate(%Object.prototype%).
                                let obj = JsObject::with_object_proto(context.intrinsics());
                                // 4. Perform ! CreateDataPropertyOrThrow(obj, "status", "rejected").
                                obj.create_data_property_or_throw(
                                    js_string!("status"),
                                    js_string!("rejected"),
                                    context,
                                )
                                .js_expect("cannot fail per spec")?;
                                // 5. Perform ! CreateDataPropertyOrThrow(obj, "reason", x).
                                obj.create_data_property_or_throw(js_string!("reason"), x, context)
                                    .js_expect("cannot fail per spec")?;
                                // 6. Set values[index] to obj.
                                captures.values.borrow_mut()[captures.index] = obj.into();

                                // 7. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
                                captures
                                    .remaining_elements
                                    .set(captures.remaining_elements.get() - 1);

                                // 8. If remainingElementsCount.[[Value]] = 0, then
                                if captures.remaining_elements.get() == 0 {
                                    let result = create_keyed_result_object(
                                        &captures.keys.borrow(),
                                        &captures.values.borrow(),
                                        context,
                                    );
                                    return captures.capability.call(
                                        &JsValue::undefined(),
                                        &[result.into()],
                                        context,
                                    );
                                }

                                // 9. Return undefined.
                                Ok(JsValue::undefined())
                            },
                            KeyedResolveCaptures {
                                already_called,
                                index,
                                variant,
                                keys: keys.clone(),
                                values: values.clone(),
                                capability: result_capability.functions.resolve.clone(),
                                remaining_elements: remaining_elements_count.clone(),
                            },
                        ),
                    )
                    .name("")
                    .length(1)
                    .constructor(false)
                    .build();

                    on_rejected_fn.into()
                };

                // ix. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] + 1.
                remaining_elements_count.set(remaining_elements_count.get() + 1);

                // x. Perform ? Invoke(nextPromise, "then", « onFulfilled, onRejected »).
                next_promise.invoke(
                    js_string!("then"),
                    &[on_fulfilled.into(), on_rejected],
                    context,
                )?;

                // xi. Set index to index + 1.
                index += 1;
            }
        }

        // 7. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
        remaining_elements_count.set(remaining_elements_count.get() - 1);

        // 8. If remainingElementsCount.[[Value]] = 0, then
        if remaining_elements_count.get() == 0 {
            // a. Let result be CreateKeyedPromiseCombinatorResultObject(keys, values).
            let result = create_keyed_result_object(&keys.borrow(), &values.borrow(), context);
            // b. Perform ? Call(resultCapability.[[Resolve]], undefined, « result »).
            result_capability.functions.resolve.call(
                &JsValue::undefined(),
                &[result.into()],
                context,
            )?;
        }

        // 9. Return resultCapability.[[Promise]].
        Ok(result_capability.promise.clone().into())
    }

    /// `Promise.any ( iterable )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise.any
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any
    pub(crate) fn any(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let C be the this value.
        let c = this.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message("Promise.any() called on a non-object")
        })?;

        // 2. Let promiseCapability be ? NewPromiseCapability(C).
        let promise_capability = PromiseCapability::new(&c, context)?;

        // 3. Let promiseResolve be Completion(GetPromiseResolve(C)).
        let promise_resolve = Self::get_promise_resolve(&c, context);

        // 4. IfAbruptRejectPromise(promiseResolve, promiseCapability).
        let promise_resolve =
            if_abrupt_reject_promise!(promise_resolve, promise_capability, context);

        // 5. Let iteratorRecord be Completion(GetIterator(iterable, sync)).
        let iterator_record = args
            .get_or_undefined(0)
            .get_iterator(IteratorHint::Sync, context);

        // 6. IfAbruptRejectPromise(iteratorRecord, promiseCapability).
        let mut iterator_record =
            if_abrupt_reject_promise!(iterator_record, promise_capability, context);

        // 7. Let result be Completion(PerformPromiseAny(iteratorRecord, C, promiseCapability, promiseResolve)).
        let mut result = Self::perform_promise_any(
            &mut iterator_record,
            &c,
            &promise_capability,
            &promise_resolve,
            context,
        )
        .map(JsValue::from);

        // 8. If result is an abrupt completion, then
        if result.is_err() {
            // a. If iteratorRecord.[[Done]] is false, set result to Completion(IteratorClose(iteratorRecord, result)).
            if !iterator_record.done() {
                result = iterator_record.close(result, context);
            }

            // b. IfAbruptRejectPromise(result, promiseCapability).
            let result = if_abrupt_reject_promise!(result, promise_capability, context);

            return Ok(result);
        }

        // 9. Return ? result.
        result
    }

    /// `PerformPromiseAny ( iteratorRecord, constructor, resultCapability, promiseResolve )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-performpromiseany
    pub(crate) fn perform_promise_any(
        iterator_record: &mut IteratorRecord,
        constructor: &JsObject,
        result_capability: &PromiseCapability,
        promise_resolve: &JsObject,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        #[derive(Debug, Trace, Finalize)]
        struct RejectElementCaptures {
            #[unsafe_ignore_trace]
            already_called: Rc<Cell<bool>>,
            index: usize,
            errors: Gc<GcRefCell<Vec<JsValue>>>,
            capability_reject: JsFunction,
            #[unsafe_ignore_trace]
            remaining_elements_count: Rc<Cell<i32>>,
        }

        // 1. Let errors be a new empty List.
        let errors = Gc::new(GcRefCell::new(Vec::new()));

        // 2. Let remainingElementsCount be the Record { [[Value]]: 1 }.
        let remaining_elements_count = Rc::new(Cell::new(1));

        // 3. Let index be 0.
        let mut index = 0;

        // 4. Repeat,
        //     a. Let next be ? IteratorStepValue(iteratorRecord).
        while let Some(next) = iterator_record.step_value(context)? {
            // c. Append undefined to errors.
            errors.borrow_mut().push(JsValue::undefined());

            // d. Let nextPromise be ? Call(promiseResolve, constructor, « next »).
            let next_promise =
                promise_resolve.call(&constructor.clone().into(), &[next], context)?;

            // e. Let stepsRejected be the algorithm steps defined in Promise.any Reject Element Functions.
            // f. Let lengthRejected be the number of non-optional parameters of the function definition in Promise.any Reject Element Functions.
            // g. Let onRejected be CreateBuiltinFunction(stepsRejected, lengthRejected, "", « [[AlreadyCalled]], [[Index]], [[Errors]], [[Capability]], [[RemainingElements]] »).
            // h. Set onRejected.[[AlreadyCalled]] to false.
            // i. Set onRejected.[[Index]] to index.
            // j. Set onRejected.[[Errors]] to errors.
            // k. Set onRejected.[[Capability]] to resultCapability.
            // l. Set onRejected.[[RemainingElements]] to remainingElementsCount.
            let on_rejected = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_copy_closure_with_captures(
                    |_, args, captures, context| {
                        // https://tc39.es/ecma262/#sec-promise.any-reject-element-functions

                        // 1. Let F be the active function object.

                        // 2. If F.[[AlreadyCalled]] is true, return undefined.
                        if captures.already_called.get() {
                            return Ok(JsValue::undefined());
                        }

                        // 3. Set F.[[AlreadyCalled]] to true.
                        captures.already_called.set(true);

                        // 4. Let index be F.[[Index]].
                        // 5. Let errors be F.[[Errors]].
                        // 6. Let promiseCapability be F.[[Capability]].
                        // 7. Let remainingElementsCount be F.[[RemainingElements]].

                        // 8. Set errors[index] to x.
                        captures.errors.borrow_mut()[captures.index] =
                            args.get_or_undefined(0).clone();

                        // 9. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
                        captures
                            .remaining_elements_count
                            .set(captures.remaining_elements_count.get() - 1);

                        // 10. If remainingElementsCount.[[Value]] is 0, then
                        if captures.remaining_elements_count.get() == 0 {
                            // a. Let error be a newly created AggregateError object.
                            // b. Perform ! DefinePropertyOrThrow(error, "errors", PropertyDescriptor { [[Configurable]]: true, [[Enumerable]]: false, [[Writable]]: true, [[Value]]: CreateArrayFromList(errors) }).
                            let error = JsNativeError::aggregate(
                                captures
                                    .errors
                                    .borrow()
                                    .iter()
                                    .cloned()
                                    .map(JsError::from_opaque)
                                    .collect(),
                            )
                            .with_message("no promise in Promise.any was fulfilled.");

                            // c. Return ? Call(promiseCapability.[[Reject]], undefined, « error »).
                            return captures.capability_reject.call(
                                &JsValue::undefined(),
                                &[error.into_opaque(context).into()],
                                context,
                            );
                        }

                        // 11. Return undefined.
                        Ok(JsValue::undefined())
                    },
                    RejectElementCaptures {
                        already_called: Rc::new(Cell::new(false)),
                        index,
                        errors: errors.clone(),
                        capability_reject: result_capability.functions.reject.clone(),
                        remaining_elements_count: remaining_elements_count.clone(),
                    },
                ),
            )
            .name("")
            .length(1)
            .constructor(false)
            .build();

            // m. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] + 1.
            remaining_elements_count.set(remaining_elements_count.get() + 1);

            // n. Perform ? Invoke(nextPromise, "then", « resultCapability.[[Resolve]], onRejected »).
            next_promise.invoke(
                js_string!("then"),
                &[
                    result_capability.functions.resolve.clone().into(),
                    on_rejected.into(),
                ],
                context,
            )?;

            // o. Set index to index + 1.
            index += 1;
        }

        //     b. If next is done, then
        //         i. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
        remaining_elements_count.set(remaining_elements_count.get() - 1);
        //         ii. If remainingElementsCount.[[Value]] = 0, then
        if remaining_elements_count.get() == 0 {
            // 1. Let error be a newly created AggregateError object.
            let error = JsNativeError::aggregate(
                errors
                    .borrow()
                    .iter()
                    .cloned()
                    .map(JsError::from_opaque)
                    .collect(),
            )
            .with_message("no promise in Promise.any was fulfilled.");

            // 2. Perform ! DefinePropertyOrThrow(error, "errors", PropertyDescriptor { [[Configurable]]: true, [[Enumerable]]: false, [[Writable]]: true, [[Value]]: CreateArrayFromList(errors) }).
            // 3. Return ThrowCompletion(error).
            return Err(error.into());
        }

        //         iii. Return resultCapability.[[Promise]].
        Ok(result_capability.promise.clone())
    }

    /// `Promise.race ( iterable )`
    ///
    /// The `race` function returns a new promise which is settled in the same way as the first
    /// passed promise to settle. It resolves all elements of the passed `iterable` to promises.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise.race
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race
    pub(crate) fn race(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let iterable = args.get_or_undefined(0);

        // 1. Let C be the this value.
        let c = this.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message("Promise.race() called on a non-object")
        })?;

        // 2. Let promiseCapability be ? NewPromiseCapability(C).
        let promise_capability = PromiseCapability::new(&c, context)?;

        // 3. Let promiseResolve be Completion(GetPromiseResolve(C)).
        let promise_resolve = Self::get_promise_resolve(&c, context);

        // 4. IfAbruptRejectPromise(promiseResolve, promiseCapability).
        let promise_resolve =
            if_abrupt_reject_promise!(promise_resolve, promise_capability, context);

        // 5. Let iteratorRecord be Completion(GetIterator(iterable, sync)).
        let iterator_record = iterable.get_iterator(IteratorHint::Sync, context);

        // 6. IfAbruptRejectPromise(iteratorRecord, promiseCapability).
        let mut iterator_record =
            if_abrupt_reject_promise!(iterator_record, promise_capability, context);

        // 7. Let result be Completion(PerformPromiseRace(iteratorRecord, C, promiseCapability, promiseResolve)).
        let mut result = Self::perform_promise_race(
            &mut iterator_record,
            &c,
            &promise_capability,
            &promise_resolve,
            context,
        )
        .map(JsValue::from);

        // 8. If result is an abrupt completion, then
        if result.is_err() {
            // a. If iteratorRecord.[[Done]] is false, set result to Completion(IteratorClose(iteratorRecord, result)).
            if !iterator_record.done() {
                result = iterator_record.close(result, context);
            }

            // b. IfAbruptRejectPromise(result, promiseCapability).
            let result = if_abrupt_reject_promise!(result, promise_capability, context);

            Ok(result)
        } else {
            // 9. Return ? result.
            result
        }
    }

    /// `PerformPromiseRace ( iteratorRecord, constructor, resultCapability, promiseResolve )`
    ///
    /// The abstract operation `PerformPromiseRace` takes arguments `iteratorRecord`, `constructor`
    /// (a constructor), `resultCapability` (a [`PromiseCapability`] Record), and `promiseResolve`
    /// (a function object) and returns either a normal completion containing an ECMAScript
    /// language value or a throw completion.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-performpromiserace
    pub(crate) fn perform_promise_race(
        iterator_record: &mut IteratorRecord,
        constructor: &JsObject,
        result_capability: &PromiseCapability,
        promise_resolve: &JsObject,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        let constructor = constructor.clone().into();

        // 1. Repeat,
        //     a. Let next be ? IteratorStepValue(iteratorRecord).
        while let Some(next) = iterator_record.step_value(context)? {
            // c. Let nextPromise be ? Call(promiseResolve, constructor, « next »).
            let next_promise = promise_resolve.call(&constructor, &[next], context)?;
            // d. Perform ? Invoke(nextPromise, "then", « resultCapability.[[Resolve]], resultCapability.[[Reject]] »).
            next_promise.invoke(
                js_string!("then"),
                &[
                    result_capability.functions.resolve.clone().into(),
                    result_capability.functions.reject.clone().into(),
                ],
                context,
            )?;
        }

        //     b. If next is done, then
        //         i. Return resultCapability.[[Promise]].
        Ok(result_capability.promise.clone())
    }

    /// `Promise.reject ( r )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise.reject
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/reject
    pub(crate) fn reject(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let r = args.get_or_undefined(0).clone();

        // 1. Let C be the this value.
        let c = this.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message("Promise.reject() called on a non-object")
        })?;

        Self::promise_reject(&c, JsError::from_opaque(r), context).map(JsValue::from)
    }

    /// Utility function to create a rejected promise.
    pub(crate) fn promise_reject(
        c: &JsObject,
        e: JsError,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        let e = e.into_opaque(context)?;

        // 2. Let promiseCapability be ? NewPromiseCapability(C).
        let promise_capability = PromiseCapability::new(c, context)?;

        // 3. Perform ? Call(promiseCapability.[[Reject]], undefined, « r »).
        promise_capability
            .functions
            .reject
            .call(&JsValue::undefined(), &[e], context)?;

        // 4. Return promiseCapability.[[Promise]].
        Ok(promise_capability.promise.clone())
    }

    /// `Promise.resolve ( x )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise.resolve
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/resolve
    pub(crate) fn resolve(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let x = args.get_or_undefined(0);

        // 1. Let C be the this value.
        // 2. If Type(C) is not Object, throw a TypeError exception.
        let c = this.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message("Promise.resolve() called on a non-object")
        })?;

        // 3. Return ? PromiseResolve(C, x).
        Self::promise_resolve(&c, x.clone(), context).map(JsValue::from)
    }

    /// `PromiseResolve ( C, x )`
    ///
    /// The abstract operation `PromiseResolve` takes arguments `C` (a constructor) and `x` (an
    /// ECMAScript language value) and returns either a normal completion containing an ECMAScript
    /// language value or a throw completion. It returns a new promise resolved with `x`.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise-resolve
    pub(crate) fn promise_resolve(
        c: &JsObject,
        x: JsValue,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        // 1. If IsPromise(x) is true, then
        if let Some(x) = x.as_promise_object() {
            let x = x.upcast();
            // a. Let xConstructor be ? Get(x, "constructor").
            let x_constructor = x.get(CONSTRUCTOR, context)?;
            // b. If SameValue(xConstructor, C) is true, return x.
            if x_constructor
                .as_object()
                .is_some_and(|o| JsObject::equals(&o, c))
            {
                return Ok(x);
            }
        }

        // 2. Let promiseCapability be ? NewPromiseCapability(C).
        let promise_capability = PromiseCapability::new(&c.clone(), context)?;

        // 3. Perform ? Call(promiseCapability.[[Resolve]], undefined, « x »).
        promise_capability
            .functions
            .resolve
            .call(&JsValue::undefined(), &[x], context)?;

        // 4. Return promiseCapability.[[Promise]].
        Ok(promise_capability.promise.clone())
    }

    /// `get Promise [ @@species ]`
    ///
    /// The `Promise [ @@species ]` accessor property returns the Promise constructor.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-promise-@@species
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/@@species
    #[allow(clippy::unnecessary_wraps)]
    fn get_species(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Return the this value.
        Ok(this.clone())
    }

    /// `Promise.prototype.catch ( onRejected )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise.prototype.catch
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/catch
    pub(crate) fn catch(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let on_rejected = args.get_or_undefined(0);

        // 1. Let promise be the this value.
        let promise = this;
        // 2. Return ? Invoke(promise, "then", « undefined, onRejected »).
        promise.invoke(
            js_string!("then"),
            &[JsValue::undefined(), on_rejected.clone()],
            context,
        )
    }

    /// `Promise.prototype.finally ( onFinally )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise.prototype.finally
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/finally
    pub(crate) fn finally(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let promise be the this value.
        let promise = this;

        // 2. If Type(promise) is not Object, throw a TypeError exception.
        let Some(promise) = promise.as_object() else {
            return Err(JsNativeError::typ()
                .with_message("finally called with a non-object promise")
                .into());
        };

        // 3. Let C be ? SpeciesConstructor(promise, %Promise%).
        let c = promise.species_constructor(StandardConstructors::promise, context)?;

        // 4. Assert: IsConstructor(C) is true.
        debug_assert!(c.is_constructor());

        let on_finally = args.get_or_undefined(0);

        let Some(on_finally) = on_finally.as_object().and_then(JsFunction::from_object) else {
            // 5. If IsCallable(onFinally) is false, then
            //    a. Let thenFinally be onFinally.
            //    b. Let catchFinally be onFinally.
            // 7. Return ? Invoke(promise, "then", « thenFinally, catchFinally »).
            let then = promise.get(js_string!("then"), context)?;
            return then.call(this, &[on_finally.clone(), on_finally.clone()], context);
        };

        let (then_finally, catch_finally) =
            Self::then_catch_finally_closures(c, on_finally, context);

        // 7. Return ? Invoke(promise, "then", « thenFinally, catchFinally »).
        let then = promise.get(js_string!("then"), context)?;
        then.call(this, &[then_finally.into(), catch_finally.into()], context)
    }

    pub(crate) fn then_catch_finally_closures(
        c: JsObject,
        on_finally: JsFunction,
        context: &mut Context,
    ) -> (JsFunction, JsFunction) {
        /// Capture object for the `thenFinallyClosure` abstract closure.
        #[derive(Debug, Trace, Finalize)]
        struct FinallyCaptures {
            on_finally: JsFunction,
            c: JsObject,
        }

        // a. Let thenFinallyClosure be a new Abstract Closure with parameters (value) that captures onFinally and C and performs the following steps when called:
        let then_finally_closure = FunctionObjectBuilder::new(
            context.realm(),
            NativeFunction::from_copy_closure_with_captures(
                |_this, args, captures, context| {
                    /// Capture object for the abstract `returnValue` closure.
                    #[derive(Debug, Trace, Finalize)]
                    struct ReturnValueCaptures {
                        value: JsValue,
                    }

                    let value = args.get_or_undefined(0);

                    // i. Let result be ? Call(onFinally, undefined).
                    let result = captures
                        .on_finally
                        .call(&JsValue::undefined(), &[], context)?;

                    // ii. Let promise be ? PromiseResolve(C, result).
                    let promise = Self::promise_resolve(&captures.c, result, context)?;

                    // iii. Let returnValue be a new Abstract Closure with no parameters that captures value and performs the following steps when called:
                    let return_value = FunctionObjectBuilder::new(
                        context.realm(),
                        NativeFunction::from_copy_closure_with_captures(
                            |_this, _args, captures, _context| {
                                // 1. Return value.
                                Ok(captures.value.clone())
                            },
                            ReturnValueCaptures {
                                value: value.clone(),
                            },
                        ),
                    );

                    // iv. Let valueThunk be CreateBuiltinFunction(returnValue, 0, "", « »).
                    let value_thunk = return_value.length(0).name("").build();

                    // v. Return ? Invoke(promise, "then", « valueThunk »).
                    promise.invoke(js_string!("then"), &[value_thunk.into()], context)
                },
                FinallyCaptures {
                    on_finally: on_finally.clone(),
                    c: c.clone(),
                },
            ),
        );

        // b. Let thenFinally be CreateBuiltinFunction(thenFinallyClosure, 1, "", « »).
        let then_finally = then_finally_closure.length(1).name("").build();

        // c. Let catchFinallyClosure be a new Abstract Closure with parameters (reason) that captures onFinally and C and performs the following steps when called:
        let catch_finally_closure = FunctionObjectBuilder::new(
            context.realm(),
            NativeFunction::from_copy_closure_with_captures(
                |_this, args, captures, context| {
                    /// Capture object for the abstract `throwReason` closure.
                    #[derive(Debug, Trace, Finalize)]
                    struct ThrowReasonCaptures {
                        reason: JsValue,
                    }

                    let reason = args.get_or_undefined(0);

                    // i. Let result be ? Call(onFinally, undefined).
                    let result = captures
                        .on_finally
                        .call(&JsValue::undefined(), &[], context)?;

                    // ii. Let promise be ? PromiseResolve(C, result).
                    let promise = Self::promise_resolve(&captures.c, result, context)?;

                    // iii. Let throwReason be a new Abstract Closure with no parameters that captures reason and performs the following steps when called:
                    let throw_reason = FunctionObjectBuilder::new(
                        context.realm(),
                        NativeFunction::from_copy_closure_with_captures(
                            |_this, _args, captures, _context| {
                                // 1. Return ThrowCompletion(reason).
                                Err(JsError::from_opaque(captures.reason.clone()))
                            },
                            ThrowReasonCaptures {
                                reason: reason.clone(),
                            },
                        ),
                    );

                    // iv. Let thrower be CreateBuiltinFunction(throwReason, 0, "", « »).
                    let thrower = throw_reason.length(0).name("").build();

                    // v. Return ? Invoke(promise, "then", « thrower »).
                    promise.invoke(js_string!("then"), &[thrower.into()], context)
                },
                FinallyCaptures { on_finally, c },
            ),
        );

        // d. Let catchFinally be CreateBuiltinFunction(catchFinallyClosure, 1, "", « »).
        let catch_finally = catch_finally_closure.length(1).name("").build();

        (then_finally, catch_finally)
    }

    /// `Promise.prototype.then ( onFulfilled, onRejected )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-promise.prototype.then
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then
    pub(crate) fn then(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let promise be the this value.
        let promise = this;

        // 2. If IsPromise(promise) is false, throw a TypeError exception.
        let promise = promise.as_promise_object().ok_or_else(|| {
            JsNativeError::typ().with_message("Promise.prototype.then: this is not a promise")
        })?;

        let on_fulfilled = args
            .get_or_undefined(0)
            .as_object()
            .and_then(JsFunction::from_object);
        let on_rejected = args
            .get_or_undefined(1)
            .as_object()
            .and_then(JsFunction::from_object);

        // continues in `Promise::inner_then`
        Self::inner_then(&promise, on_fulfilled, on_rejected, context).map(JsValue::from)
    }

    /// Schedules callback functions for the eventual completion of `promise` — either fulfillment
    /// or rejection.
    pub(crate) fn inner_then(
        promise: &JsObject<Promise>,
        on_fulfilled: Option<JsFunction>,
        on_rejected: Option<JsFunction>,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        // 3. Let C be ? SpeciesConstructor(promise, %Promise%).
        let c = promise
            .clone()
            .upcast()
            .species_constructor(StandardConstructors::promise, context)?;

        // 4. Let resultCapability be ? NewPromiseCapability(C).
        let result_capability = PromiseCapability::new(&c, context)?;
        let result_promise = result_capability.promise.clone();

        // 5. Return PerformPromiseThen(promise, onFulfilled, onRejected, resultCapability).
        Self::perform_promise_then(
            promise,
            on_fulfilled,
            on_rejected,
            Some(result_capability),
            context,
        );

        Ok(result_promise)
    }

    /// `PerformPromiseThen ( promise, onFulfilled, onRejected [ , resultCapability ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-performpromisethen
    pub(crate) fn perform_promise_then(
        promise: &JsObject<Promise>,
        on_fulfilled: Option<JsFunction>,
        on_rejected: Option<JsFunction>,
        result_capability: Option<PromiseCapability>,
        context: &mut Context,
    ) {
        // 1. Assert: IsPromise(promise) is true.

        // 2. If resultCapability is not present, then
        //   a. Set resultCapability to undefined.

        // 3. If IsCallable(onFulfilled) is false, then
        //   a. Let onFulfilledJobCallback be empty.
        // Argument already asserts this.
        let on_fulfilled_job_callback = on_fulfilled
            // 4. Else,
            //   a. Let onFulfilledJobCallback be HostMakeJobCallback(onFulfilled).
            .map(|f| context.host_hooks().make_job_callback(f, context));

        // 5. If IsCallable(onRejected) is false, then
        //   a. Let onRejectedJobCallback be empty.
        // Argument already asserts this.
        let on_rejected_job_callback = on_rejected
            // 6. Else,
            //   a. Let onRejectedJobCallback be HostMakeJobCallback(onRejected).
            .map(|f| context.host_hooks().make_job_callback(f, context));

        // 7. Let fulfillReaction be the PromiseReaction { [[Capability]]: resultCapability, [[Type]]: Fulfill, [[Handler]]: onFulfilledJobCallback }.
        let fulfill_reaction = ReactionRecord {
            promise_capability: result_capability.clone(),
            reaction_type: ReactionType::Fulfill,
            handler: on_fulfilled_job_callback,
        };

        // 8. Let rejectReaction be the PromiseReaction { [[Capability]]: resultCapability, [[Type]]: Reject, [[Handler]]: onRejectedJobCallback }.
        let reject_reaction = ReactionRecord {
            promise_capability: result_capability,
            reaction_type: ReactionType::Reject,
            handler: on_rejected_job_callback,
        };

        let (state, handled) = {
            let promise = promise.borrow_mut();
            let promise = promise.data();
            (promise.state.clone(), promise.handled)
        };

        match state {
            // 9. If promise.[[PromiseState]] is pending, then
            PromiseState::Pending => {
                let mut promise = promise.borrow_mut();
                let promise = promise.data_mut();
                //   a. Append fulfillReaction as the last element of the List that is promise.[[PromiseFulfillReactions]].
                promise.fulfill_reactions.push(fulfill_reaction);

                //   b. Append rejectReaction as the last element of the List that is promise.[[PromiseRejectReactions]].
                promise.reject_reactions.push(reject_reaction);
            }

            // 10. Else if promise.[[PromiseState]] is fulfilled, then
            //   a. Let value be promise.[[PromiseResult]].
            PromiseState::Fulfilled(ref value) => {
                //   b. Let fulfillJob be NewPromiseReactionJob(fulfillReaction, value).
                let fulfill_job =
                    new_promise_reaction_job(fulfill_reaction, value.clone(), context);

                //   c. Perform HostEnqueuePromiseJob(fulfillJob.[[Job]], fulfillJob.[[Realm]]).
                context
                    .job_executor()
                    .enqueue_job(fulfill_job.into(), context);
            }

            // 11. Else,
            //   a. Assert: The value of promise.[[PromiseState]] is rejected.
            //   b. Let reason be promise.[[PromiseResult]].
            PromiseState::Rejected(ref reason) => {
                //   c. If promise.[[PromiseIsHandled]] is false, perform HostPromiseRejectionTracker(promise, "handle").
                if !handled {
                    context.host_hooks().promise_rejection_tracker(
                        promise,
                        OperationType::Handle,
                        context,
                    );
                }

                //   d. Let rejectJob be NewPromiseReactionJob(rejectReaction, reason).
                let reject_job = new_promise_reaction_job(reject_reaction, reason.clone(), context);

                //   e. Perform HostEnqueuePromiseJob(rejectJob.[[Job]], rejectJob.[[Realm]]).
                context
                    .job_executor()
                    .enqueue_job(reject_job.into(), context);
            }
        }

        // 12. Set promise.[[PromiseIsHandled]] to true.
        promise.borrow_mut().data_mut().handled = true;

        // 13. If resultCapability is undefined, then
        //   a. Return undefined.
        // 14. Else,
        //   a. Return resultCapability.[[Promise]].
        // skipped because we can already access the promise from `result_capability`
    }

    /// `GetPromiseResolve ( promiseConstructor )`
    ///
    /// The abstract operation `GetPromiseResolve` takes argument `promiseConstructor` (a
    /// constructor) and returns either a normal completion containing a function object or a throw
    /// completion.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-getpromiseresolve
    pub(crate) fn get_promise_resolve(
        promise_constructor: &JsObject,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        // 1. Let promiseResolve be ? Get(promiseConstructor, "resolve").
        let promise_resolve = promise_constructor.get(js_string!("resolve"), context)?;

        // 2. If IsCallable(promiseResolve) is false, throw a TypeError exception.
        promise_resolve.as_callable().ok_or_else(|| {
            JsNativeError::typ()
                .with_message("retrieving a non-callable promise resolver")
                .into()
        })
    }

    /// `CreateResolvingFunctions ( promise )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-createresolvingfunctions
    pub(crate) fn create_resolving_functions(
        promise: &JsObject<Promise>,
        context: &mut Context,
    ) -> ResolvingFunctions {
        /// `TriggerPromiseReactions ( reactions, argument )`
        ///
        /// The abstract operation `TriggerPromiseReactions` takes arguments `reactions` (a `List` of
        /// `PromiseReaction` Records) and `argument` and returns unused. It enqueues a new `Job` for
        /// each record in `reactions`. Each such `Job` processes the `[[Type]]` and `[[Handler]]` of
        /// the `PromiseReaction` Record, and if the `[[Handler]]` is not `empty`, calls it passing the
        /// given argument. If the `[[Handler]]` is `empty`, the behaviour is determined by the
        /// `[[Type]]`.
        ///
        /// More information:
        ///  - [ECMAScript reference][spec]
        ///
        /// [spec]: https://tc39.es/ecma262/#sec-triggerpromisereactions
        fn trigger_promise_reactions(
            reactions: Vec<ReactionRecord>,
            argument: &JsValue,
            context: &mut Context,
        ) {
            // 1. For each element reaction of reactions, do
            for reaction in reactions {
                // a. Let job be NewPromiseReactionJob(reaction, argument).
                let job = new_promise_reaction_job(reaction, argument.clone(), context);

                // b. Perform HostEnqueuePromiseJob(job.[[Job]], job.[[Realm]]).
                context.job_executor().enqueue_job(job.into(), context);
            }
            // 2. Return unused.
        }

        /// `FulfillPromise ( promise, value )`
        ///
        /// The abstract operation `FulfillPromise` takes arguments `promise` and `value` and returns
        /// `unused`.
        ///
        /// More information:
        ///  - [ECMAScript reference][spec]
        ///
        /// [spec]: https://tc39.es/ecma262/#sec-fulfillpromise
        ///
        /// # Panics
        ///
        /// Panics if `Promise` is not pending.
        fn fulfill_promise(promise: &JsObject<Promise>, value: JsValue, context: &mut Context) {
            let mut promise = promise.borrow_mut();
            let promise = promise.data_mut();

            // 1. Assert: The value of promise.[[PromiseState]] is pending.
            assert!(
                matches!(promise.state, PromiseState::Pending),
                "promise was not pending"
            );

            // reordering these statements does not affect the semantics

            // 2. Let reactions be promise.[[PromiseFulfillReactions]].
            // 4. Set promise.[[PromiseFulfillReactions]] to undefined.
            let reactions = std::mem::take(&mut promise.fulfill_reactions);

            // 5. Set promise.[[PromiseRejectReactions]] to undefined.
            promise.reject_reactions.clear();

            // 7. Perform TriggerPromiseReactions(reactions, value).
            trigger_promise_reactions(reactions, &value, context);

            // 3. Set promise.[[PromiseResult]] to value.
            // 6. Set promise.[[PromiseState]] to fulfilled.
            promise.state = PromiseState::Fulfilled(value);

            // 8. Return unused.
        }

        /// `RejectPromise ( promise, reason )`
        ///
        /// The abstract operation `RejectPromise` takes arguments `promise` and `reason` and returns
        /// `unused`.
        ///
        /// More information:
        ///  - [ECMAScript reference][spec]
        ///
        /// [spec]: https://tc39.es/ecma262/#sec-rejectpromise
        ///
        /// # Panics
        ///
        /// Panics if `Promise` is not pending.
        fn reject_promise(promise: &JsObject<Promise>, reason: JsValue, context: &mut Context) {
            let handled = {
                let mut promise = promise.borrow_mut();
                let promise = promise.data_mut();

                // 1. Assert: The value of promise.[[PromiseState]] is pending.
                assert!(
                    matches!(promise.state, PromiseState::Pending),
                    "Expected promise.[[PromiseState]] to be pending"
                );

                // reordering these statements does not affect the semantics

                // 2. Let reactions be promise.[[PromiseRejectReactions]].
                // 5. Set promise.[[PromiseRejectReactions]] to undefined.
                let reactions = std::mem::take(&mut promise.reject_reactions);

                // 4. Set promise.[[PromiseFulfillReactions]] to undefined.
                promise.fulfill_reactions.clear();

                // 8. Perform TriggerPromiseReactions(reactions, reason).
                trigger_promise_reactions(reactions, &reason, context);

                // 3. Set promise.[[PromiseResult]] to reason.
                // 6. Set promise.[[PromiseState]] to rejected.
                promise.state = PromiseState::Rejected(reason);

                promise.handled
            };

            // 7. If promise.[[PromiseIsHandled]] is false, perform HostPromiseRejectionTracker(promise, "reject").
            if !handled {
                context.host_hooks().promise_rejection_tracker(
                    promise,
                    OperationType::Reject,
                    context,
                );
            }

            // 9. Return unused.
        }

        // 1. Let alreadyResolved be the Record { [[Value]]: false }.
        // 5. Set resolve.[[Promise]] to promise.
        // 6. Set resolve.[[AlreadyResolved]] to alreadyResolved.
        let promise = Gc::new(Cell::new(Some(promise.clone())));

        // 2. Let stepsResolve be the algorithm steps defined in Promise Resolve Functions.
        // 3. Let lengthResolve be the number of non-optional parameters of the function definition in Promise Resolve Functions.
        // 4. Let resolve be CreateBuiltinFunction(stepsResolve, lengthResolve, "", « [[Promise]], [[AlreadyResolved]] »).
        let resolve = FunctionObjectBuilder::new(
            context.realm(),
            NativeFunction::from_copy_closure_with_captures(
                |_this, args, captures, context| {
                    // https://tc39.es/ecma262/#sec-promise-resolve-functions

                    // 1. Let F be the active function object.
                    // 2. Assert: F has a [[Promise]] internal slot whose value is an Object.
                    // 3. Let promise be F.[[Promise]].
                    // 4. Let alreadyResolved be F.[[AlreadyResolved]].
                    // 5. If alreadyResolved.[[Value]] is true, return undefined.
                    // 6. Set alreadyResolved.[[Value]] to true.
                    let Some(promise) = captures.take() else {
                        return Ok(JsValue::undefined());
                    };

                    let resolution = args.get_or_undefined(0);

                    // 7. If SameValue(resolution, promise) is true, then
                    if JsValue::same_value(resolution, &promise.clone().into()) {
                        //   a. Let selfResolutionError be a newly created TypeError object.
                        let self_resolution_error = JsNativeError::typ()
                            .with_message("SameValue(resolution, promise) is true")
                            .into_opaque(context);

                        //   b. Perform RejectPromise(promise, selfResolutionError).
                        reject_promise(&promise, self_resolution_error.into(), context);

                        //   c. Return undefined.
                        return Ok(JsValue::undefined());
                    }

                    let Some(then) = resolution.as_object() else {
                        // 8. If Type(resolution) is not Object, then
                        //   a. Perform FulfillPromise(promise, resolution).
                        fulfill_promise(&promise, resolution.clone(), context);

                        //   b. Return undefined.
                        return Ok(JsValue::undefined());
                    };

                    // 9. Let then be Completion(Get(resolution, "then")).
                    let then_action = match then.get(js_string!("then"), context) {
                        // 10. If then is an abrupt completion, then
                        Err(e) => {
                            //   a. Perform RejectPromise(promise, then.[[Value]]).
                            reject_promise(&promise, e.into_opaque(context)?, context);

                            //   b. Return undefined.
                            return Ok(JsValue::undefined());
                        }
                        // 11. Let thenAction be then.[[Value]].
                        Ok(then) => then,
                    };

                    // 12. If IsCallable(thenAction) is false, then
                    let Some(then_action) =
                        then_action.as_object().and_then(JsFunction::from_object)
                    else {
                        // a. Perform FulfillPromise(promise, resolution).
                        fulfill_promise(&promise, resolution.clone(), context);

                        //   b. Return undefined.
                        return Ok(JsValue::undefined());
                    };

                    // 13. Let thenJobCallback be HostMakeJobCallback(thenAction).
                    let then_job_callback =
                        context.host_hooks().make_job_callback(then_action, context);

                    // 14. Let job be NewPromiseResolveThenableJob(promise, resolution, thenJobCallback).
                    let job = new_promise_resolve_thenable_job(
                        promise.clone(),
                        resolution.clone(),
                        then_job_callback,
                        context,
                    );

                    // 15. Perform HostEnqueuePromiseJob(job.[[Job]], job.[[Realm]]).
                    context.job_executor().enqueue_job(job.into(), context);

                    // 16. Return undefined.
                    Ok(JsValue::undefined())
                },
                promise.clone(),
            ),
        )
        .name("")
        .length(1)
        .constructor(false)
        .build();

        // 10. Set reject.[[Promise]] to promise.
        // 11. Set reject.[[AlreadyResolved]] to alreadyResolved.
        // 7. Let stepsReject be the algorithm steps defined in Promise Reject Functions.
        // 8. Let lengthReject be the number of non-optional parameters of the function definition in Promise Reject Functions.
        // 9. Let reject be CreateBuiltinFunction(stepsReject, lengthReject, "", « [[Promise]], [[AlreadyResolved]] »).
        let reject = FunctionObjectBuilder::new(
            context.realm(),
            NativeFunction::from_copy_closure_with_captures(
                |_this, args, captures, context| {
                    // https://tc39.es/ecma262/#sec-promise-reject-functions

                    // 1. Let F be the active function object.
                    // 2. Assert: F has a [[Promise]] internal slot whose value is an Object.
                    // 3. Let promise be F.[[Promise]].
                    // 4. Let alreadyResolved be F.[[AlreadyResolved]].
                    // 5. If alreadyResolved.[[Value]] is true, return undefined.
                    // 6. Set alreadyResolved.[[Value]] to true.
                    let Some(promise) = captures.take() else {
                        return Ok(JsValue::undefined());
                    };

                    // 7. Perform RejectPromise(promise, reason).
                    reject_promise(&promise, args.get_or_undefined(0).clone(), context);

                    // 8. Return undefined.
                    Ok(JsValue::undefined())
                },
                promise,
            ),
        )
        .name("")
        .length(1)
        .constructor(false)
        .build();

        // 12. Return the Record { [[Resolve]]: resolve, [[Reject]]: reject }.
        ResolvingFunctions { resolve, reject }
    }
}

/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-newpromisereactionjob
fn new_promise_reaction_job(
    mut reaction: ReactionRecord,
    argument: JsValue,
    context: &mut Context,
) -> PromiseJob {
    // Inverting order since `job` captures `reaction` by value.

    // 2. Let handlerRealm be null.
    // 3. If reaction.[[Handler]] is not empty, then
    //   a. Let getHandlerRealmResult be Completion(GetFunctionRealm(reaction.[[Handler]].[[Callback]])).
    //   b. If getHandlerRealmResult is a normal completion, set handlerRealm to getHandlerRealmResult.[[Value]].
    //   c. Else, set handlerRealm to the current Realm Record.
    //   d. NOTE: handlerRealm is never null unless the handler is undefined. When the handler is a
    // revoked Proxy and no ECMAScript code runs, handlerRealm is used to create error objects.
    let realm = reaction
        .handler
        .as_ref()
        .and_then(|handler| handler.callback().get_function_realm(context).ok())
        .unwrap_or_else(|| context.realm().clone());

    // 1. Let job be a new Job Abstract Closure with no parameters that captures reaction and argument and performs the following steps when called:
    let job = move |context: &mut Context| {
        //   a. Let promiseCapability be reaction.[[Capability]].
        let promise_capability = reaction.promise_capability.take();
        //   b. Let type be reaction.[[Type]].
        let reaction_type = reaction.reaction_type;
        //   c. Let handler be reaction.[[Handler]].
        let handler = reaction.handler.take();

        let handler_result = match handler {
            // d. If handler is empty, then
            None => match reaction_type {
                // i. If type is Fulfill, let handlerResult be NormalCompletion(argument).
                ReactionType::Fulfill => Ok(argument.clone()),
                // ii. Else,
                //   1. Assert: type is Reject.
                ReactionType::Reject => {
                    // 2. Let handlerResult be ThrowCompletion(argument).
                    Err(argument.clone())
                }
            },
            //   e. Else, let handlerResult be Completion(HostCallJobCallback(handler, undefined, « argument »)).
            Some(handler) => match context.host_hooks().call_job_callback(
                &handler,
                &JsValue::undefined(),
                std::slice::from_ref(&argument),
                context,
            ) {
                Ok(v) => Ok(v),
                Err(e) => Err(e.into_opaque(context)?),
            },
        };

        match promise_capability {
            None => {
                // f. If promiseCapability is undefined, then
                //    i. Assert: handlerResult is not an abrupt completion.
                assert!(
                    handler_result.is_ok(),
                    "Assertion: <handlerResult is not an abrupt completion> failed"
                );

                // ii. Return empty.
                Ok(JsValue::undefined())
            }
            Some(promise_capability_record) => {
                // g. Assert: promiseCapability is a PromiseCapability Record.
                let PromiseCapability {
                    promise: _,
                    functions: ResolvingFunctions { resolve, reject },
                } = &promise_capability_record;

                match handler_result {
                    // h. If handlerResult is an abrupt completion, then
                    Err(value) => {
                        // i. Return ? Call(promiseCapability.[[Reject]], undefined, « handlerResult.[[Value]] »).
                        reject.call(&JsValue::undefined(), &[value], context)
                    }

                    // i. Else,
                    Ok(value) => {
                        // i. Return ? Call(promiseCapability.[[Resolve]], undefined, « handlerResult.[[Value]] »).
                        resolve.call(&JsValue::undefined(), &[value], context)
                    }
                }
            }
        }
    };

    // 4. Return the Record { [[Job]]: job, [[Realm]]: handlerRealm }.
    PromiseJob::with_realm(job, realm)
}

/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-newpromiseresolvethenablejob
fn new_promise_resolve_thenable_job(
    promise_to_resolve: JsObject<Promise>,
    thenable: JsValue,
    then: JobCallback,
    context: &mut Context,
) -> PromiseJob {
    // Inverting order since `job` captures variables by value.

    // 2. Let getThenRealmResult be Completion(GetFunctionRealm(then.[[Callback]])).
    // 3. If getThenRealmResult is a normal completion, let thenRealm be getThenRealmResult.[[Value]].
    // 4. Else, let thenRealm be the current Realm Record.
    // 5. NOTE: thenRealm is never null. When then.[[Callback]] is a revoked Proxy and no code runs, thenRealm is used to create error objects.
    let realm = then
        .callback()
        .get_function_realm(context)
        .unwrap_or_else(|_| context.realm().clone());

    // 1. Let job be a new Job Abstract Closure with no parameters that captures promiseToResolve, thenable, and then and performs the following steps when called:
    let job = move |context: &mut Context| {
        //    a. Let resolvingFunctions be CreateResolvingFunctions(promiseToResolve).
        let resolving_functions = Promise::create_resolving_functions(&promise_to_resolve, context);

        //    b. Let thenCallResult be Completion(HostCallJobCallback(then, thenable, « resolvingFunctions.[[Resolve]], resolvingFunctions.[[Reject]] »)).
        let then_call_result = context.host_hooks().call_job_callback(
            &then,
            &thenable,
            &[
                resolving_functions.resolve.clone().into(),
                resolving_functions.reject.clone().into(),
            ],
            context,
        );

        //    c. If thenCallResult is an abrupt completion, then
        if let Err(value) = then_call_result {
            let value = value.into_opaque(context)?;
            //    i. Return ? Call(resolvingFunctions.[[Reject]], undefined, « thenCallResult.[[Value]] »).
            return resolving_functions
                .reject
                .call(&JsValue::undefined(), &[value], context);
        }

        //    d. Return ? thenCallResult.
        then_call_result
    };

    // 6. Return the Record { [[Job]]: job, [[Realm]]: thenRealm }.
    PromiseJob::with_realm(job, realm)
}

#[cfg(feature = "experimental")]
/// Variant for the `PerformPromiseAllKeyed` algorithm.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KeyedVariant {
    /// `Promise.allKeyed` — resolves when all promises resolve.
    All,
    /// `Promise.allSettledKeyed` — resolves when all promises settle.
    AllSettled,
}

#[cfg(feature = "experimental")]
/// `CreateKeyedPromiseCombinatorResultObject ( keys, values )`
///
/// Creates a null-prototype object with data properties mapping keys to values.
///
/// More information:
///  - [TC39 proposal spec][spec]
///
/// [spec]: https://tc39.es/proposal-await-dictionary/#sec-createkeyedpromisecombinatorresultobject
fn create_keyed_result_object(
    keys: &[PropertyKey],
    values: &[JsValue],
    context: &mut Context,
) -> JsObject {
    // 1. Assert: The number of elements in keys is the same as the number of elements in values.
    debug_assert_eq!(keys.len(), values.len());

    // 2. Let obj be OrdinaryObjectCreate(null).
    let obj = JsObject::with_null_proto();

    // 3. For each integer i such that 0 ≤ i < the number of elements in keys, in ascending order, do
    for (key, value) in keys.iter().zip(values.iter()) {
        // a. Perform ! CreateDataPropertyOrThrow(obj, keys[i], values[i]).
        obj.create_data_property_or_throw(key.clone(), value.clone(), context)
            .expect("cannot fail per spec");
    }

    // 4. Return obj.
    obj
}
