//! A Rust API wrapper for Boa's promise Builtin ECMAScript Object

use super::{JsArray, JsFunction};
use crate::value::TryIntoJs;
use crate::{
    Context, JsArgs, JsError, JsExpect, JsNativeError, JsResult, JsValue, NativeFunction,
    builtins::{
        Promise,
        promise::{PromiseState, ResolvingFunctions},
    },
    job::NativeAsyncJob,
    object::JsObject,
    value::TryFromJs,
};
use boa_gc::{Finalize, Gc, GcRefCell, Trace};
use std::cell::RefCell;
use std::{future::Future, pin::Pin, task};

/// An ECMAScript [promise] object.
///
/// Known as the concurrency primitive of ECMAScript, this is the main struct used to manipulate,
/// chain and inspect `Promises` from Rust code.
///
/// # Examples
///
/// ```
/// # use boa_engine::{
/// #     builtins::promise::PromiseState,
/// #     js_string,
/// #     object::{builtins::JsPromise, FunctionObjectBuilder},
/// #     property::Attribute,
/// #     Context, JsArgs, JsError, JsValue, NativeFunction,
/// # };
/// # use std::error::Error;
/// # fn main() -> Result<(), Box<dyn Error>> {
/// let context = &mut Context::default();
///
/// context.register_global_property(
///     js_string!("finally"),
///     false,
///     Attribute::all(),
/// );
///
/// let promise = JsPromise::new(
///     |resolvers, context| {
///         let result = js_string!("hello world!").into();
///         resolvers.resolve.call(
///             &JsValue::undefined(),
///             &[result],
///             context,
///         )?;
///         Ok(JsValue::undefined())
///     },
///     context,
/// )?;
///
/// let promise = promise
///     .then(
///         Some(
///             NativeFunction::from_fn_ptr(|_, args, _| {
///                 Err(JsError::from_opaque(args.get_or_undefined(0).clone())
///                     .into())
///             })
///             .to_js_function(context.realm()),
///         ),
///         None,
///         context,
///     )?
///     .catch(
///         NativeFunction::from_fn_ptr(|_, args, _| {
///             Ok(args.get_or_undefined(0).clone())
///         })
///         .to_js_function(context.realm()),
///         context,
///     )?
///     .finally(
///         NativeFunction::from_fn_ptr(|_, _, context| {
///             context.global_object().clone().set(
///                 js_string!("finally"),
///                 JsValue::from(true),
///                 true,
///                 context,
///             )?;
///             Ok(JsValue::undefined())
///         })
///         .to_js_function(context.realm()),
///         context,
///     )?;
///
/// context.run_jobs();
///
/// assert_eq!(
///     promise.state(),
///     PromiseState::Fulfilled(js_string!("hello world!").into())
/// );
///
/// assert_eq!(
///     context
///         .global_object()
///         .clone()
///         .get(js_string!("finally"), context)?,
///     JsValue::from(true)
/// );
///
/// # Ok(())
/// # }
/// ```
///
/// [promise]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
#[derive(Debug, Clone, Trace, Finalize)]
pub struct JsPromise {
    inner: JsObject<Promise>,
}

impl JsPromise {
    /// Creates a new promise object from an executor function.
    ///
    /// It is equivalent to calling the [`Promise()`] constructor, which makes it share the same
    /// execution semantics as the constructor:
    /// - The executor function `executor` is called synchronously just after the promise is created.
    /// - The executor return value is ignored.
    /// - Any error thrown within the execution of `executor` will call the `reject` function
    ///   of the newly created promise, unless either `resolve` or `reject` were already called
    ///   beforehand.
    ///
    /// `executor` receives as an argument the [`ResolvingFunctions`] needed to settle the promise,
    /// which can be done by either calling the `resolve` function or the `reject` function.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #    object::builtins::JsPromise,
    /// #    builtins::promise::PromiseState,
    /// #    Context, JsValue, js_string
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let promise = JsPromise::new(
    ///     |resolvers, context| {
    ///         let result = js_string!("hello world").into();
    ///         resolvers.resolve.call(
    ///             &JsValue::undefined(),
    ///             &[result],
    ///             context,
    ///         )?;
    ///         Ok(JsValue::undefined())
    ///     },
    ///     context,
    /// )?;
    ///
    /// context.run_jobs();
    ///
    /// assert_eq!(
    ///     promise.state(),
    ///     PromiseState::Fulfilled(js_string!("hello world").into())
    /// );
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// [`Promise()`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/Promise
    pub fn new<F>(executor: F, context: &mut Context) -> JsResult<Self>
    where
        F: FnOnce(&ResolvingFunctions, &mut Context) -> JsResult<JsValue>,
    {
        let promise = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            context.intrinsics().constructors().promise().prototype(),
            Promise::new(),
        );
        let resolvers = Promise::create_resolving_functions(&promise, context);

        if let Err(e) = executor(&resolvers, context) {
            let e = e.into_opaque(context)?;
            resolvers
                .reject
                .call(&JsValue::undefined(), &[e], context)
                .js_expect("default `reject` function cannot throw")?;
        }

        Ok(Self { inner: promise })
    }

    /// Creates a new pending promise and returns it and its associated `ResolvingFunctions`.
    ///
    /// This can be useful when you want to manually settle a promise from Rust code, instead of
    /// running an `executor` function that automatically settles the promise on creation
    /// (see [`JsPromise::new`]).
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #    object::builtins::JsPromise,
    /// #    builtins::promise::PromiseState,
    /// #    Context, JsValue
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let (promise, resolvers) = JsPromise::new_pending(context);
    ///
    /// assert_eq!(promise.state(), PromiseState::Pending);
    ///
    /// resolvers
    ///     .reject
    ///     .call(&JsValue::undefined(), &[5.into()], context)?;
    ///
    /// assert_eq!(promise.state(), PromiseState::Rejected(5.into()));
    ///
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    pub fn new_pending(context: &mut Context) -> (Self, ResolvingFunctions) {
        let promise = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            context.intrinsics().constructors().promise().prototype(),
            Promise::new(),
        );
        let resolvers = Promise::create_resolving_functions(&promise, context);

        (promise.into(), resolvers)
    }

    /// Wraps an existing object with the `JsPromise` interface, returning `Err` if the object
    /// is not a valid promise.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #    object::builtins::JsPromise,
    /// #    builtins::promise::PromiseState,
    /// #    Context, JsObject, JsValue, Source
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let promise = context.eval(Source::from_bytes(
    ///     "new Promise((resolve, reject) => resolve())",
    /// ))?;
    /// let promise = promise.as_object().unwrap();
    ///
    /// let promise = JsPromise::from_object(promise)?;
    ///
    /// assert_eq!(
    ///     promise.state(),
    ///     PromiseState::Fulfilled(JsValue::undefined())
    /// );
    ///
    /// assert!(JsPromise::from_object(JsObject::with_null_proto()).is_err());
    ///
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    pub fn from_object(object: JsObject) -> JsResult<Self> {
        let Ok(inner) = object.downcast::<Promise>() else {
            return Err(JsNativeError::typ()
                .with_message("`object` is not a Promise")
                .into());
        };
        Ok(Self { inner })
    }

    /// Creates a new `JsPromise` from a [`Future`]-like.
    ///
    /// If you want to convert a Rust async function into an ECMAScript async function, see
    /// [`NativeFunction::from_async_fn`][async_fn].
    ///
    /// # Examples
    ///
    /// ```
    /// use std::error::Error;
    /// # use std::cell::RefCell;
    /// # use boa_engine::{
    /// #    object::builtins::JsPromise,
    /// #    builtins::promise::PromiseState,
    /// #    Context, JsResult, JsValue
    /// # };
    /// async fn f(_: &RefCell<&mut Context>) -> JsResult<JsValue> {
    ///     Ok(JsValue::null())
    /// }
    /// let context = &mut Context::default();
    ///
    /// let promise = JsPromise::from_async_fn(f, context);
    ///
    /// context.run_jobs();
    ///
    /// assert_eq!(promise.state(), PromiseState::Fulfilled(JsValue::null()));
    /// ```
    ///
    /// [async_fn]: crate::native_function::NativeFunction::from_async_fn
    pub fn from_async_fn<F>(f: F, context: &mut Context) -> Self
    where
        F: AsyncFnOnce(&RefCell<&mut Context>) -> JsResult<JsValue> + 'static,
    {
        let (promise, resolvers) = Self::new_pending(context);

        context.enqueue_job(
            NativeAsyncJob::new(async move |context| {
                let result = f(context).await;

                let context = &mut context.borrow_mut();
                match result {
                    Ok(v) => resolvers.resolve.call(&JsValue::undefined(), &[v], context),
                    Err(e) => {
                        let e = e.into_opaque(context)?;
                        resolvers.reject.call(&JsValue::undefined(), &[e], context)
                    }
                }
            })
            .into(),
        );

        promise
    }

    /// Creates a new `JsPromise` from a `Result<T, JsError>`, where `T` is the fulfilled value of
    /// the promise, and `JsError` is the rejection reason. This is a simpler way to create a
    /// promise that is either fulfilled or rejected based on the result of a computation.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #    object::builtins::JsPromise,
    /// #    builtins::promise::PromiseState,
    /// #    Context, JsResult, JsString, js_string, js_error
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// fn do_thing(success: bool) -> JsResult<JsString> {
    ///     success
    ///         .then(|| js_string!("resolved!"))
    ///         .ok_or(js_error!("rejected!"))
    /// }
    ///
    /// let promise = JsPromise::from_result(do_thing(true), context)?;
    /// assert_eq!(
    ///     promise.state(),
    ///     PromiseState::Fulfilled(js_string!("resolved!").into())
    /// );
    ///
    /// let promise = JsPromise::from_result(do_thing(false), context)?;
    /// assert_eq!(
    ///     promise.state(),
    ///     PromiseState::Rejected(js_string!("rejected!").into())
    /// );
    /// # Ok(())
    /// # }
    /// ```
    pub fn from_result<V: Into<JsValue>, E: Into<JsError>>(
        value: Result<V, E>,
        context: &mut Context,
    ) -> JsResult<Self> {
        match value {
            Ok(v) => Self::resolve(v, context),
            Err(e) => Self::reject(e, context),
        }
    }

    /// Resolves a `JsValue` into a `JsPromise`.
    ///
    /// Equivalent to the [`Promise.resolve()`] static method.
    ///
    /// This function is mainly used to wrap a plain `JsValue` into a fulfilled promise, but it can
    /// also flatten nested layers of [thenables], which essentially converts them into native
    /// promises.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #    object::builtins::JsPromise,
    /// #    builtins::promise::PromiseState,
    /// #    Context, js_string
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let promise = JsPromise::resolve(js_string!("resolved!"), context)?;
    ///
    /// assert_eq!(
    ///     promise.state(),
    ///     PromiseState::Fulfilled(js_string!("resolved!").into())
    /// );
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// [`Promise.resolve()`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/resolve
    /// [thenables]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise#thenables
    pub fn resolve<V: Into<JsValue>>(value: V, context: &mut Context) -> JsResult<Self> {
        Promise::promise_resolve(
            &context.intrinsics().constructors().promise().constructor(),
            value.into(),
            context,
        )
        .and_then(Self::from_object)
        .js_expect("default resolve functions cannot throw and must return a promise")
        .map_err(Into::into)
    }

    /// Creates a `JsPromise` that is rejected with the reason `error`.
    ///
    /// Equivalent to the [`Promise.reject`] static method.
    ///
    /// `JsPromise::reject` is pretty similar to [`JsPromise::resolve`], with the difference that
    /// it always wraps `error` into a rejected promise, even if `error` is a promise or a [thenable].
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #    object::builtins::JsPromise,
    /// #    builtins::promise::PromiseState,
    /// #    Context, js_string, JsError
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let promise = JsPromise::reject(
    ///     JsError::from_opaque(js_string!("oops!").into()),
    ///     context,
    /// )?;
    ///
    /// assert_eq!(
    ///     promise.state(),
    ///     PromiseState::Rejected(js_string!("oops!").into())
    /// );
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// [`Promise.reject`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/reject
    /// [thenable]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise#thenables
    pub fn reject<E: Into<JsError>>(error: E, context: &mut Context) -> JsResult<Self> {
        let error = error.into();
        assert!(
            error.is_catchable(),
            "cannot create a reject function from an uncatchable error"
        );

        Promise::promise_reject(
            &context.intrinsics().constructors().promise().constructor(),
            error,
            context,
        )
        .and_then(Self::from_object)
        .js_expect("default resolve functions cannot throw and must return a promise")
        .map_err(Into::into)
    }

    /// Gets the current state of the promise.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #    object::builtins::JsPromise,
    /// #    builtins::promise::PromiseState,
    /// #    Context
    /// # };
    /// let context = &mut Context::default();
    ///
    /// let promise = JsPromise::new_pending(context).0;
    ///
    /// assert_eq!(promise.state(), PromiseState::Pending);
    /// ```
    #[inline]
    #[must_use]
    pub fn state(&self) -> PromiseState {
        self.inner.borrow().data().state().clone()
    }

    /// Schedules callback functions to run when the promise settles.
    ///
    /// Equivalent to the [`Promise.prototype.then`] method.
    ///
    /// The return value is a promise that is always pending on return, regardless of the current
    /// state of the original promise. Two handlers can be provided as callbacks to be executed when
    /// the original promise settles:
    ///
    /// - If the original promise is fulfilled, `on_fulfilled` is called with the fulfillment value
    ///   of the original promise.
    /// - If the original promise is rejected, `on_rejected` is called with the rejection reason
    ///   of the original promise.
    ///
    /// The return value of the handlers can be used to mutate the state of the created promise. If
    /// the callback:
    ///
    /// - returns a value: the created promise gets fulfilled with the returned value.
    /// - doesn't return: the created promise gets fulfilled with undefined.
    /// - throws: the created promise gets rejected with the thrown error as its value.
    /// - returns a fulfilled promise: the created promise gets fulfilled with that promise's value as its value.
    /// - returns a rejected promise: the created promise gets rejected with that promise's value as its value.
    /// - returns another pending promise: the created promise remains pending but becomes settled with that
    ///   promise's value as its value immediately after that promise becomes settled.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #     builtins::promise::PromiseState,
    /// #     js_string,
    /// #     object::{builtins::JsPromise, FunctionObjectBuilder},
    /// #     Context, JsArgs, JsError, JsValue, NativeFunction,
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let promise = JsPromise::new(
    ///     |resolvers, context| {
    ///         resolvers.resolve.call(
    ///             &JsValue::undefined(),
    ///             &[255.255.into()],
    ///             context,
    ///         )?;
    ///         Ok(JsValue::undefined())
    ///     },
    ///     context,
    /// )?
    /// .then(
    ///     Some(
    ///         NativeFunction::from_fn_ptr(|_, args, context| {
    ///             args.get_or_undefined(0)
    ///                 .to_string(context)
    ///                 .map(JsValue::from)
    ///         })
    ///         .to_js_function(context.realm()),
    ///     ),
    ///     None,
    ///     context,
    /// )?;
    ///
    /// context.run_jobs();
    ///
    /// assert_eq!(
    ///     promise.state(),
    ///     PromiseState::Fulfilled(js_string!("255.255").into())
    /// );
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// [`Promise.prototype.then`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then
    #[inline]
    #[allow(clippy::return_self_not_must_use)] // Could just be used to add handlers on an existing promise
    pub fn then(
        &self,
        on_fulfilled: Option<JsFunction>,
        on_rejected: Option<JsFunction>,
        context: &mut Context,
    ) -> JsResult<Self> {
        Promise::inner_then(self, on_fulfilled, on_rejected, context)
            .and_then(Self::from_object)
            .js_expect("`inner_then` cannot fail for native `JsPromise`")
            .map_err(Into::into)
    }

    /// Schedules a callback to run when the promise is rejected.
    ///
    /// Equivalent to the [`Promise.prototype.catch`] method.
    ///
    /// This is essentially a shortcut for calling [`promise.then(None, Some(function))`][then], which
    /// only handles the error case and leaves the fulfilled case untouched.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #     js_string,
    /// #     builtins::promise::PromiseState,
    /// #     object::{builtins::JsPromise, FunctionObjectBuilder},
    /// #     Context, JsArgs, JsNativeError, JsValue, NativeFunction,
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let promise = JsPromise::new(
    ///     |resolvers, context| {
    ///         let error = JsNativeError::typ().with_message("thrown");
    ///         let error = error.into_opaque(context);
    ///         resolvers.reject.call(
    ///             &JsValue::undefined(),
    ///             &[error.into()],
    ///             context,
    ///         )?;
    ///         Ok(JsValue::undefined())
    ///     },
    ///     context,
    /// )?
    /// .catch(
    ///     NativeFunction::from_fn_ptr(|_, args, context| {
    ///         args.get_or_undefined(0)
    ///             .to_string(context)
    ///             .map(JsValue::from)
    ///     })
    ///     .to_js_function(context.realm()),
    ///     context,
    /// )?;
    ///
    /// context.run_jobs();
    ///
    /// assert_eq!(
    ///     promise.state(),
    ///     PromiseState::Fulfilled(js_string!("TypeError: thrown").into())
    /// );
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// [`Promise.prototype.catch`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/catch
    /// [then]: JsPromise::then
    #[inline]
    #[allow(clippy::return_self_not_must_use)] // Could just be used to add a handler on an existing promise
    pub fn catch(&self, on_rejected: JsFunction, context: &mut Context) -> JsResult<Self> {
        self.then(None, Some(on_rejected), context)
    }

    /// Schedules a callback to run when the promise is rejected.
    ///
    /// Equivalent to the [`Promise.prototype.finally()`] method.
    ///
    /// While this could be seen as a shortcut for calling [`promise.then(Some(function), Some(function))`][then],
    /// it has slightly different semantics than `then`:
    /// - `on_finally` doesn't receive any argument, unlike `on_fulfilled` and `on_rejected`.
    /// - `finally()` is transparent; a call like `Promise.resolve("first").finally(() => "second")`
    ///   returns a promise fulfilled with the value `"first"`, which would return `"second"` if `finally`
    ///   was a shortcut of `then`.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #     object::{builtins::JsPromise, FunctionObjectBuilder},
    /// #     property::Attribute,
    /// #     Context, JsNativeError, JsValue, NativeFunction, js_string
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// context.register_global_property(
    ///     js_string!("finally"),
    ///     false,
    ///     Attribute::all(),
    /// )?;
    ///
    /// let promise = JsPromise::new(
    ///     |resolvers, context| {
    ///         let error = JsNativeError::typ().with_message("thrown");
    ///         let error = error.into_opaque(context);
    ///         resolvers.reject.call(
    ///             &JsValue::undefined(),
    ///             &[error.into()],
    ///             context,
    ///         )?;
    ///         Ok(JsValue::undefined())
    ///     },
    ///     context,
    /// )?
    /// .finally(
    ///     NativeFunction::from_fn_ptr(|_, _, context| {
    ///         context.global_object().clone().set(
    ///             js_string!("finally"),
    ///             JsValue::from(true),
    ///             true,
    ///             context,
    ///         )?;
    ///         Ok(JsValue::undefined())
    ///     })
    ///     .to_js_function(context.realm()),
    ///     context,
    /// )?;
    ///
    /// context.run_jobs();
    ///
    /// assert_eq!(
    ///     context
    ///         .global_object()
    ///         .clone()
    ///         .get(js_string!("finally"), context)?,
    ///     JsValue::from(true)
    /// );
    ///
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// [`Promise.prototype.finally()`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/finally
    /// [then]: JsPromise::then
    #[inline]
    #[allow(clippy::return_self_not_must_use)] // Could just be used to add a handler on an existing promise
    pub fn finally(&self, on_finally: JsFunction, context: &mut Context) -> JsResult<Self> {
        let (then, catch) = Promise::then_catch_finally_closures(
            context.intrinsics().constructors().promise().constructor(),
            on_finally,
            context,
        );
        Promise::inner_then(self, Some(then), Some(catch), context)
            .and_then(Self::from_object)
            .js_expect("`inner_then` cannot fail for native `JsPromise`")
            .map_err(Into::into)
    }

    /// Waits for a list of promises to settle with fulfilled values, rejecting the aggregate promise
    /// when any of the inner promises is rejected.
    ///
    /// Equivalent to the [`Promise.all`] static method.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #     js_string,
    /// #     object::builtins::{JsArray, JsPromise},
    /// #     Context, JsNativeError, JsValue,
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let promise1 = JsPromise::all(
    ///     [
    ///         JsPromise::resolve(0, context)?,
    ///         JsPromise::resolve(2, context)?,
    ///         JsPromise::resolve(4, context)?,
    ///     ],
    ///     context,
    /// )?;
    ///
    /// let promise2 = JsPromise::all(
    ///     [
    ///         JsPromise::resolve(1, context)?,
    ///         JsPromise::reject(JsNativeError::typ(), context)?,
    ///         JsPromise::resolve(3, context)?,
    ///     ],
    ///     context,
    /// )?;
    ///
    /// context.run_jobs();
    ///
    /// let array = promise1
    ///     .state()
    ///     .as_fulfilled()
    ///     .and_then(JsValue::as_object)
    ///     .unwrap()
    ///     .clone();
    /// let array = JsArray::from_object(array)?;
    /// assert_eq!(array.at(0, context)?, 0.into());
    /// assert_eq!(array.at(1, context)?, 2.into());
    /// assert_eq!(array.at(2, context)?, 4.into());
    ///
    /// let error = promise2.state().as_rejected().unwrap().clone();
    /// assert_eq!(error.to_string(context)?, js_string!("TypeError"));
    ///
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// [`Promise.all`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
    pub fn all<I>(promises: I, context: &mut Context) -> JsResult<Self>
    where
        I: IntoIterator<Item = Self>,
    {
        let promises = JsArray::from_iter(promises.into_iter().map(JsValue::from), context);

        let c = &context
            .intrinsics()
            .constructors()
            .promise()
            .constructor()
            .into();

        let value = Promise::all(c, &[promises.into()], context)
            .js_expect("Promise.all cannot fail with the default `%Promise%` constructor")?;

        let object = value
            .as_object()
            .js_expect("`Promise.all` always returns an object on success")?;

        Self::from_object(object.clone())
            .js_expect("`Promise::all` with the default `%Promise%` constructor always returns a native `JsPromise`").map_err(Into::into)
    }

    /// Waits for a list of promises to settle, fulfilling with an array of the outcomes of every
    /// promise.
    ///
    /// Equivalent to the [`Promise.allSettled`] static method.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #     js_string,
    /// #     object::builtins::{JsArray, JsPromise},
    /// #     Context, JsNativeError, JsValue,
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let promise = JsPromise::all_settled(
    ///     [
    ///         JsPromise::resolve(1, context)?,
    ///         JsPromise::reject(JsNativeError::typ(), context)?,
    ///         JsPromise::resolve(3, context)?,
    ///     ],
    ///     context,
    /// )?;
    ///
    /// context.run_jobs();
    ///
    /// let array = promise
    ///     .state()
    ///     .as_fulfilled()
    ///     .and_then(JsValue::as_object)
    ///     .unwrap()
    ///     .clone();
    /// let array = JsArray::from_object(array)?;
    ///
    /// let a = array.at(0, context)?.as_object().unwrap().clone();
    /// assert_eq!(
    ///     a.get(js_string!("status"), context)?,
    ///     js_string!("fulfilled").into()
    /// );
    /// assert_eq!(a.get(js_string!("value"), context)?, 1.into());
    ///
    /// let b = array.at(1, context)?.as_object().unwrap().clone();
    /// assert_eq!(
    ///     b.get(js_string!("status"), context)?,
    ///     js_string!("rejected").into()
    /// );
    /// assert_eq!(
    ///     b.get(js_string!("reason"), context)?.to_string(context)?,
    ///     js_string!("TypeError")
    /// );
    ///
    /// let c = array.at(2, context)?.as_object().unwrap().clone();
    /// assert_eq!(
    ///     c.get(js_string!("status"), context)?,
    ///     js_string!("fulfilled").into()
    /// );
    /// assert_eq!(c.get(js_string!("value"), context)?, 3.into());
    ///
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// [`Promise.allSettled`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled
    pub fn all_settled<I>(promises: I, context: &mut Context) -> JsResult<Self>
    where
        I: IntoIterator<Item = Self>,
    {
        let promises = JsArray::from_iter(promises.into_iter().map(JsValue::from), context);

        let c = &context
            .intrinsics()
            .constructors()
            .promise()
            .constructor()
            .into();

        let value = Promise::all_settled(c, &[promises.into()], context).js_expect(
            "`Promise.all_settled` cannot fail with the default `%Promise%` constructor",
        )?;

        let object = value
            .as_object()
            .js_expect("`Promise.all_settled` always returns an object on success")?;

        Self::from_object(object.clone())
            .js_expect("`Promise::all_settled` with the default `%Promise%` constructor always returns a native `JsPromise`").map_err(Into::into)
    }

    /// Returns the first promise that fulfills from a list of promises.
    ///
    /// Equivalent to the [`Promise.any`] static method.
    ///
    /// If after settling all promises in `promises` there isn't a fulfilled promise, the returned
    /// promise will be rejected with an `AggregatorError` containing the rejection values of every
    /// promise; this includes the case where `promises` is an empty iterator.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #     builtins::promise::PromiseState,
    /// #     js_string,
    /// #     object::builtins::JsPromise,
    /// #     Context, JsNativeError,
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let promise = JsPromise::any(
    ///     [
    ///         JsPromise::reject(JsNativeError::syntax(), context)?,
    ///         JsPromise::reject(JsNativeError::typ(), context)?,
    ///         JsPromise::resolve(js_string!("fulfilled"), context)?,
    ///         JsPromise::reject(JsNativeError::range(), context)?,
    ///     ],
    ///     context,
    /// )?;
    ///
    /// context.run_jobs();
    ///
    /// assert_eq!(
    ///     promise.state(),
    ///     PromiseState::Fulfilled(js_string!("fulfilled").into())
    /// );
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// [`Promise.any`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any
    pub fn any<I>(promises: I, context: &mut Context) -> JsResult<Self>
    where
        I: IntoIterator<Item = Self>,
    {
        let promises = JsArray::from_iter(promises.into_iter().map(JsValue::from), context);

        let c = &context
            .intrinsics()
            .constructors()
            .promise()
            .constructor()
            .into();

        let value = Promise::any(c, &[promises.into()], context)
            .js_expect("`Promise.any` cannot fail with the default `%Promise%` constructor")?;

        let object = value
            .as_object()
            .js_expect("`Promise.any` always returns an object on success")?;

        Self::from_object(object.clone())
            .js_expect("`Promise::any` with the default `%Promise%` constructor always returns a native `JsPromise`").map_err(Into::into)
    }

    /// Returns the first promise that settles from a list of promises.
    ///
    /// Equivalent to the [`Promise.race`] static method.
    ///
    /// If the provided iterator is empty, the returned promise will remain on the pending state
    /// forever.
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #     builtins::promise::PromiseState,
    /// #     js_string,
    /// #     object::builtins::JsPromise,
    /// #     Context, JsValue,
    /// # };
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let (a, resolvers_a) = JsPromise::new_pending(context);
    /// let (b, resolvers_b) = JsPromise::new_pending(context);
    /// let (c, resolvers_c) = JsPromise::new_pending(context);
    ///
    /// let promise = JsPromise::race([a, b, c], context)?;
    ///
    /// resolvers_b
    ///     .reject
    ///     .call(&JsValue::undefined(), &[], context)?;
    /// resolvers_a
    ///     .resolve
    ///     .call(&JsValue::undefined(), &[5.into()], context)?;
    /// resolvers_c.reject.call(
    ///     &JsValue::undefined(),
    ///     &[js_string!("c error").into()],
    ///     context,
    /// )?;
    ///
    /// context.run_jobs();
    ///
    /// assert_eq!(
    ///     promise.state(),
    ///     PromiseState::Rejected(JsValue::undefined())
    /// );
    ///
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// [`Promise.race`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race
    pub fn race<I>(promises: I, context: &mut Context) -> JsResult<Self>
    where
        I: IntoIterator<Item = Self>,
    {
        let promises = JsArray::from_iter(promises.into_iter().map(JsValue::from), context);

        let c = &context
            .intrinsics()
            .constructors()
            .promise()
            .constructor()
            .into();

        let value = Promise::race(c, &[promises.into()], context)
            .js_expect("`Promise.race` cannot fail with the default `%Promise%` constructor")?;

        let object = value
            .as_object()
            .js_expect("`Promise.race` always returns an object on success")?;

        Self::from_object(object.clone())
            .js_expect("`Promise::race` with the default `%Promise%` constructor always returns a native `JsPromise`").map_err(Into::into)
    }

    /// Creates a `JsFuture` from this `JsPromise`.
    ///
    /// The returned `JsFuture` implements [`Future`], which means it can be `await`ed within Rust's
    /// async contexts (async functions and async blocks).
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::error::Error;
    /// # use boa_engine::{
    /// #     builtins::promise::PromiseState,
    /// #     object::builtins::JsPromise,
    /// #     Context, JsValue, JsError
    /// # };
    /// # use futures_lite::future;
    /// # fn main() -> Result<(), Box<dyn Error>> {
    /// let context = &mut Context::default();
    ///
    /// let (promise, resolvers) = JsPromise::new_pending(context);
    /// let promise_future = promise.into_js_future(context)?;
    ///
    /// let future1 = async move { promise_future.await };
    ///
    /// let future2 = async move {
    ///     resolvers
    ///         .resolve
    ///         .call(&JsValue::undefined(), &[10.into()], context)?;
    ///     context.run_jobs();
    ///     Ok::<(), JsError>(())
    /// };
    ///
    /// let (result1, result2) = future::block_on(future::zip(future1, future2));
    ///
    /// assert_eq!(result1, Ok(JsValue::from(10)));
    /// assert_eq!(result2, Ok(()));
    ///
    /// # Ok(())
    /// # }
    /// ```
    pub fn into_js_future(self, context: &mut Context) -> JsResult<JsFuture> {
        // Mostly based from:
        // https://docs.rs/wasm-bindgen-futures/0.4.37/src/wasm_bindgen_futures/lib.rs.html#109-168

        fn finish(state: &GcRefCell<Inner>, val: JsResult<JsValue>) {
            let task = {
                let mut state = state.borrow_mut();

                // The engine ensures both `resolve` and `reject` are called only once,
                // and only one of them.
                debug_assert!(state.result.is_none());

                // Store the received value into the state shared by the resolving functions
                // and the `JsFuture` itself. This will be accessed when the executor polls
                // the `JsFuture` again.
                state.result = Some(val);
                state.task.take()
            };

            // `task` could be `None` if the `JsPromise` was already fulfilled before polling
            // the `JsFuture`.
            if let Some(task) = task {
                task.wake();
            }
        }

        let state = Gc::new(GcRefCell::new(Inner {
            result: None,
            task: None,
        }));

        let resolve = {
            let state = state.clone();

            NativeFunction::from_copy_closure_with_captures(
                move |_, args, state, _| {
                    finish(state, Ok(args.get_or_undefined(0).clone()));
                    Ok(JsValue::undefined())
                },
                state,
            )
        };

        let reject = {
            let state = state.clone();

            NativeFunction::from_copy_closure_with_captures(
                move |_, args, state, _| {
                    let err = JsError::from_opaque(args.get_or_undefined(0).clone());
                    finish(state, Err(err));
                    Ok(JsValue::undefined())
                },
                state,
            )
        };

        drop(self.then(
            Some(resolve.to_js_function(context.realm())),
            Some(reject.to_js_function(context.realm())),
            context,
        )?);

        Ok(JsFuture { inner: state })
    }

    /// Run jobs until this promise is resolved or rejected. This could
    /// result in an infinite loop if the promise is never resolved or
    /// rejected (e.g. with a [`boa_engine::job::JobExecutor`] that does
    /// not prioritize properly). If you need more control over how
    /// the promise handles timing out, consider using
    /// [`Context::run_jobs`] directly.
    ///
    /// Returns [`Result::Ok`] if the promise resolved, or [`Result::Err`]
    /// if the promise was rejected. If the promise was already resolved,
    /// [`Context::run_jobs`] is guaranteed to not be executed.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{Context, JsArgs, JsValue, NativeFunction};
    /// # use boa_engine::object::builtins::{JsFunction, JsPromise};
    /// # fn main() -> Result<(), Box<dyn std::error::Error>> {
    /// let context = &mut Context::default();
    ///
    /// let p1 = JsPromise::new(
    ///     |fns, context| {
    ///         fns.resolve
    ///             .call(&JsValue::undefined(), &[JsValue::new(1)], context)
    ///     },
    ///     context,
    /// )?;
    /// let p2 = p1.then(
    ///     Some(
    ///         NativeFunction::from_fn_ptr(|_, args, context| {
    ///             assert_eq!(*args.get_or_undefined(0), JsValue::new(1));
    ///             Ok(JsValue::new(2))
    ///         })
    ///         .to_js_function(context.realm()),
    ///     ),
    ///     None,
    ///     context,
    /// )?;
    ///
    /// assert_eq!(p2.await_blocking(context), Ok(JsValue::new(2)));
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// This will not panic as `run_jobs()` is not executed.
    /// ```
    /// # use boa_engine::{Context, JsValue, NativeFunction};
    /// # use boa_engine::object::builtins::JsPromise;
    ///
    /// # fn main() -> Result<(), Box<dyn std::error::Error>> {
    /// let context = &mut Context::default();
    /// let p1 = JsPromise::new(
    ///     |fns, context| fns.resolve.call(&JsValue::undefined(), &[], context),
    ///     context,
    /// )?
    /// .then(
    ///     Some(
    ///         NativeFunction::from_fn_ptr(|_, _, _| {
    ///             panic!("This will not happen.");
    ///         })
    ///         .to_js_function(context.realm()),
    ///     ),
    ///     None,
    ///     context,
    /// )?;
    /// let p2 = JsPromise::resolve(1, context)?;
    ///
    /// assert_eq!(p2.await_blocking(context), Ok(JsValue::new(1)));
    /// // Uncommenting the following line would panic.
    /// // context.run_jobs();
    /// # Ok(())
    /// # }
    /// ```
    pub fn await_blocking(&self, context: &mut Context) -> Result<JsValue, JsError> {
        loop {
            match self.state() {
                PromiseState::Pending => {
                    context.run_jobs()?;
                }
                PromiseState::Fulfilled(f) => break Ok(f),
                PromiseState::Rejected(r) => break Err(JsError::from_opaque(r)),
            }
        }
    }

    #[cfg(feature = "experimental")]
    pub(crate) fn await_native(
        &self,
        continuation: crate::native_function::NativeCoroutine,
        context: &mut Context,
    ) {
        use crate::{
            builtins::{async_generator::AsyncGenerator, generator::GeneratorContext},
            js_string,
            object::FunctionObjectBuilder,
            vm::CompletionRecord,
        };
        use std::cell::Cell;
        use std::ops::ControlFlow;

        // Clone the stack since we split it.
        let stack = context.vm.stack.clone();
        let gen_ctx = GeneratorContext::from_current(context, None);
        context.vm.stack = stack;

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

                    let continuation = &captures.0;
                    let mut r#gen = captures.1.take().js_expect("should only run once")?;

                    // NOTE: We need to get the object before resuming, since it could clear the stack.
                    let async_generator = r#gen.async_generator_object()?;

                    std::mem::swap(&mut context.vm.stack, &mut r#gen.stack);
                    let frame = r#gen
                        .call_frame
                        .take()
                        .js_expect("should have a call frame")?;
                    let fp = frame.fp;
                    let rp = frame.rp;
                    context.vm.push_frame(frame);
                    context.vm.frame_mut().fp = fp;
                    context.vm.frame_mut().rp = rp;

                    match continuation.call(
                        CompletionRecord::Normal(args.get_or_undefined(0).clone()),
                        context,
                    ) {
                        ControlFlow::Continue(value) => JsPromise::resolve(value, context)?
                            .await_native(continuation.clone(), context),
                        ControlFlow::Break(Err(err)) => return Err(err),
                        ControlFlow::Break(Ok(())) => {}
                    }

                    std::mem::swap(&mut context.vm.stack, &mut r#gen.stack);
                    r#gen.call_frame = context.vm.pop_frame();
                    assert!(r#gen.call_frame.is_some());

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
                (continuation.clone(), Cell::new(Some(gen_ctx))),
            ),
        )
        .name(js_string!())
        .length(1)
        .build();

        let stack = context.vm.stack.clone();
        let gen_ctx = GeneratorContext::from_current(context, None);
        context.vm.stack = stack;

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

                    let continuation = &captures.0;
                    let mut r#gen = captures.1.take().js_expect("should only run once")?;

                    // NOTE: We need to get the object before resuming, since it could clear the stack.
                    let async_generator = r#gen.async_generator_object()?;

                    std::mem::swap(&mut context.vm.stack, &mut r#gen.stack);
                    let frame = r#gen
                        .call_frame
                        .take()
                        .js_expect("should have a call frame")?;
                    let fp = frame.fp;
                    let rp = frame.rp;
                    context.vm.push_frame(frame);
                    context.vm.frame_mut().fp = fp;
                    context.vm.frame_mut().rp = rp;

                    match continuation.call(
                        CompletionRecord::Throw(JsError::from_opaque(
                            args.get_or_undefined(0).clone(),
                        )),
                        context,
                    ) {
                        ControlFlow::Continue(value) => JsPromise::resolve(value, context)?
                            .await_native(continuation.clone(), context),
                        ControlFlow::Break(Err(err)) => return Err(err),
                        ControlFlow::Break(Ok(())) => {}
                    }

                    std::mem::swap(&mut context.vm.stack, &mut r#gen.stack);
                    r#gen.call_frame = context.vm.pop_frame();
                    assert!(r#gen.call_frame.is_some());

                    if let Some(async_generator) = async_generator {
                        async_generator
                            .downcast_mut::<AsyncGenerator>()
                            .js_expect("must be async generator")?
                            .context = Some(r#gen);
                    }

                    Ok(JsValue::undefined())
                },
                (continuation, Cell::new(Some(gen_ctx))),
            ),
        )
        .name(js_string!())
        .length(1)
        .build();

        // 7. Perform PerformPromiseThen(promise, onFulfilled, onRejected).
        Promise::perform_promise_then(
            &self.inner,
            Some(on_fulfilled),
            Some(on_rejected),
            None,
            context,
        );
    }
}

impl From<JsObject<Promise>> for JsPromise {
    fn from(value: JsObject<Promise>) -> Self {
        Self { inner: value }
    }
}

impl From<JsPromise> for JsObject {
    #[inline]
    fn from(o: JsPromise) -> Self {
        o.inner.clone().upcast()
    }
}

impl From<JsPromise> for JsValue {
    #[inline]
    fn from(o: JsPromise) -> Self {
        o.inner.clone().into()
    }
}

impl std::ops::Deref for JsPromise {
    type Target = JsObject<Promise>;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsPromise {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object() {
            Self::from_object(o.clone())
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not a Promise object")
                .into())
        }
    }
}

impl TryIntoJs for JsPromise {
    fn try_into_js(&self, _: &mut Context) -> JsResult<JsValue> {
        Ok(self.clone().into())
    }
}

/// A Rust's `Future` that becomes ready when a `JsPromise` fulfills.
///
/// This type allows `await`ing `JsPromise`s inside Rust's async contexts, which makes interfacing
/// between promises and futures a bit easier.
///
/// The only way to construct an instance of `JsFuture` is by calling [`JsPromise::into_js_future`].
pub struct JsFuture {
    inner: Gc<GcRefCell<Inner>>,
}

impl std::fmt::Debug for JsFuture {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("JsFuture").finish_non_exhaustive()
    }
}

#[derive(Trace, Finalize)]
struct Inner {
    result: Option<JsResult<JsValue>>,
    #[unsafe_ignore_trace]
    task: Option<task::Waker>,
}

// Taken from:
// https://docs.rs/wasm-bindgen-futures/0.4.37/src/wasm_bindgen_futures/lib.rs.html#171-187
impl Future for JsFuture {
    type Output = JsResult<JsValue>;

    fn poll(self: Pin<&mut Self>, cx: &mut task::Context<'_>) -> task::Poll<Self::Output> {
        let mut inner = self.inner.borrow_mut();

        if let Some(result) = inner.result.take() {
            return task::Poll::Ready(result);
        }

        inner.task = Some(cx.waker().clone());
        task::Poll::Pending
    }
}
