//! Boa's wrappers for native Rust functions to be compatible with ECMAScript calls.
//!
//! [`NativeFunction`] is the main type of this module, providing APIs to create native callables
//! from native Rust functions and closures.

use std::cell::RefCell;

use boa_gc::{Finalize, Gc, Trace, custom_trace};
use boa_string::JsString;

use crate::job::NativeAsyncJob;
use crate::object::internal_methods::InternalMethodCallContext;
use crate::value::JsVariant;
use crate::{
    Context, JsNativeError, JsObject, JsResult, JsValue,
    builtins::{OrdinaryObject, function::ConstructorKind},
    context::intrinsics::StandardConstructors,
    object::{
        FunctionObjectBuilder, JsData, JsFunction, JsPromise,
        internal_methods::{
            CallValue, InternalObjectMethods, ORDINARY_INTERNAL_METHODS,
            get_prototype_from_constructor,
        },
    },
    realm::Realm,
};

mod continuation;

pub(crate) use continuation::{CoroutineBranch, CoroutineState, NativeCoroutine};

/// The required signature for all native built-in function pointers.
///
/// # Arguments
///
/// - The first argument represents the `this` variable of every ECMAScript function.
///
/// - The second argument represents the list of all arguments passed to the function.
///
/// - The last argument is the engine [`Context`].
pub type NativeFunctionPointer = fn(&JsValue, &[JsValue], &mut Context) -> JsResult<JsValue>;

trait TraceableClosure: Trace {
    fn call(&self, this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue>;
}

#[derive(Trace, Finalize)]
struct Closure<F, T>
where
    F: Fn(&JsValue, &[JsValue], &T, &mut Context) -> JsResult<JsValue>,
    T: Trace,
{
    // SAFETY: `NativeFunction`'s safe API ensures only `Copy` closures are stored; its unsafe API,
    // on the other hand, explains the invariants to hold in order for this to be safe, shifting
    // the responsibility to the caller.
    #[unsafe_ignore_trace]
    f: F,
    captures: T,
}

impl<F, T> TraceableClosure for Closure<F, T>
where
    F: Fn(&JsValue, &[JsValue], &T, &mut Context) -> JsResult<JsValue>,
    T: Trace,
{
    fn call(&self, this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        (self.f)(this, args, &self.captures, context)
    }
}

#[derive(Clone, Debug, Finalize)]
/// The data of an object containing a `NativeFunction`.
pub struct NativeFunctionObject {
    /// The rust function.
    pub(crate) f: NativeFunction,

    /// JavaScript name of the function.
    pub(crate) name: JsString,

    /// The kind of the function constructor if it is a constructor.
    pub(crate) constructor: Option<ConstructorKind>,

    /// The [`Realm`] in which the function is defined, or `None` if the realm is uninitialized.
    pub(crate) realm: Option<Realm>,
}

// SAFETY: this traces all fields that need to be traced by the GC.
unsafe impl Trace for NativeFunctionObject {
    custom_trace!(this, mark, {
        mark(&this.f);
        mark(&this.realm);
    });
}

impl JsData for NativeFunctionObject {
    fn internal_methods(&self) -> &'static InternalObjectMethods {
        static FUNCTION: InternalObjectMethods = InternalObjectMethods {
            __call__: native_function_call,
            ..ORDINARY_INTERNAL_METHODS
        };

        static CONSTRUCTOR: InternalObjectMethods = InternalObjectMethods {
            __call__: native_function_call,
            __construct__: native_function_construct,
            ..ORDINARY_INTERNAL_METHODS
        };

        if self.constructor.is_some() {
            &CONSTRUCTOR
        } else {
            &FUNCTION
        }
    }
}

/// A callable Rust function that can be invoked by the engine.
///
/// `NativeFunction` functions are divided in two:
/// - Function pointers a.k.a common functions (see [`NativeFunctionPointer`]).
/// - Closure functions that can capture the current environment.
///
/// # Caveats
///
/// By limitations of the Rust language, the garbage collector currently cannot inspect closures
/// in order to trace their captured variables. This means that only [`Copy`] closures are 100% safe
/// to use. All other closures can also be stored in a `NativeFunction`, albeit by using an `unsafe`
/// API, but note that passing closures implicitly capturing traceable types could cause
/// **Undefined Behaviour**.
#[derive(Clone, Finalize)]
pub struct NativeFunction {
    inner: Inner,
}

#[derive(Clone)]
enum Inner {
    PointerFn(NativeFunctionPointer),
    Closure(Gc<dyn TraceableClosure>),
}

// Manual implementation because deriving `Trace` triggers the `single_use_lifetimes` lint.
// SAFETY: Only closures can contain `Trace` captures, so this implementation is safe.
unsafe impl Trace for NativeFunction {
    custom_trace!(this, mark, {
        if let Inner::Closure(c) = &this.inner {
            mark(c);
        }
    });
}

impl std::fmt::Debug for NativeFunction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NativeFunction").finish_non_exhaustive()
    }
}

impl NativeFunction {
    /// Creates a `NativeFunction` from a function pointer.
    #[inline]
    pub fn from_fn_ptr(function: NativeFunctionPointer) -> Self {
        Self {
            inner: Inner::PointerFn(function),
        }
    }

    /// Creates a `NativeFunction` from a function returning a [`Future`]-like.
    ///
    /// The returned `NativeFunction` will return an ECMAScript `Promise` that will be fulfilled
    /// or rejected when the returned `Future` completes.
    ///
    /// If you only need to convert a `Future`-like into a [`JsPromise`], see
    /// [`JsPromise::from_async_fn`].
    ///
    /// # Examples
    ///
    /// ```
    /// # use std::cell::RefCell;
    /// # use boa_engine::{
    /// #   JsValue,
    /// #   Context,
    /// #   JsResult,
    /// #   NativeFunction,
    /// #   JsArgs,
    /// # };
    /// async fn test(
    ///     _this: &JsValue,
    ///     args: &[JsValue],
    ///     context: &RefCell<&mut Context>,
    /// ) -> JsResult<JsValue> {
    ///     let arg = args.get_or_undefined(0).clone();
    ///     std::future::ready(()).await;
    ///     let value = arg.to_u32(&mut context.borrow_mut())?;
    ///     Ok(JsValue::from(value * 2))
    /// }
    /// NativeFunction::from_async_fn(test);
    /// ```
    pub fn from_async_fn<F>(f: F) -> Self
    where
        F: AsyncFn(&JsValue, &[JsValue], &RefCell<&mut Context>) -> JsResult<JsValue> + 'static,
        F: Copy,
    {
        Self::from_copy_closure(move |this, args, context| {
            let (promise, resolvers) = JsPromise::new_pending(context);
            let this = this.clone();
            let args = args.to_vec();

            context.enqueue_job(
                NativeAsyncJob::new(async move |context| {
                    let result = f(&this, &args, context).await;

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

            Ok(promise.into())
        })
    }

    /// Creates a `NativeFunction` from a `Copy` closure.
    pub fn from_copy_closure<F>(closure: F) -> Self
    where
        F: Fn(&JsValue, &[JsValue], &mut Context) -> JsResult<JsValue> + Copy + 'static,
    {
        // SAFETY: The `Copy` bound ensures there are no traceable types inside the closure.
        unsafe { Self::from_closure(closure) }
    }

    /// Creates a `NativeFunction` from a `Copy` closure and a list of traceable captures.
    pub fn from_copy_closure_with_captures<F, T>(closure: F, captures: T) -> Self
    where
        F: Fn(&JsValue, &[JsValue], &T, &mut Context) -> JsResult<JsValue> + Copy + 'static,
        T: Trace + 'static,
    {
        // SAFETY: The `Copy` bound ensures there are no traceable types inside the closure.
        unsafe { Self::from_closure_with_captures(closure, captures) }
    }

    /// Creates a new `NativeFunction` from a closure.
    ///
    /// # Safety
    ///
    /// Passing a closure that contains a captured variable that needs to be traced by the garbage
    /// collector could cause an use after free, memory corruption or other kinds of **Undefined
    /// Behaviour**. See <https://github.com/Manishearth/rust-gc/issues/50> for a technical explanation
    /// on why that is the case.
    pub unsafe fn from_closure<F>(closure: F) -> Self
    where
        F: Fn(&JsValue, &[JsValue], &mut Context) -> JsResult<JsValue> + 'static,
    {
        // SAFETY: The caller must ensure the invariants of the closure hold.
        unsafe {
            Self::from_closure_with_captures(
                move |this, args, (), context| closure(this, args, context),
                (),
            )
        }
    }

    /// Create a new `NativeFunction` from a closure and a list of traceable captures.
    ///
    /// # Safety
    ///
    /// Passing a closure that contains a captured variable that needs to be traced by the garbage
    /// collector could cause an use after free, memory corruption or other kinds of **Undefined
    /// Behaviour**. See <https://github.com/Manishearth/rust-gc/issues/50> for a technical explanation
    /// on why that is the case.
    pub unsafe fn from_closure_with_captures<F, T>(closure: F, captures: T) -> Self
    where
        F: Fn(&JsValue, &[JsValue], &T, &mut Context) -> JsResult<JsValue> + 'static,
        T: Trace + 'static,
    {
        // Hopefully, this unsafe operation will be replaced by the `CoerceUnsized` API in the
        // future: https://github.com/rust-lang/rust/issues/18598
        let ptr = Gc::into_raw(Gc::new(Closure {
            f: closure,
            captures,
        }));
        // SAFETY: The pointer returned by `into_raw` is only used to coerce to a trait object,
        // meaning this is safe.
        unsafe {
            Self {
                inner: Inner::Closure(Gc::from_raw(ptr)),
            }
        }
    }

    /// Calls this `NativeFunction`, forwarding the arguments to the corresponding function.
    #[inline]
    pub fn call(
        &self,
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        match self.inner {
            Inner::PointerFn(f) => f(this, args, context),
            Inner::Closure(ref c) => c.call(this, args, context),
        }
    }

    /// Converts this `NativeFunction` into a `JsFunction` without setting its name or length.
    ///
    /// Useful to create functions that will only be used once, such as callbacks.
    #[must_use]
    pub fn to_js_function(self, realm: &Realm) -> JsFunction {
        FunctionObjectBuilder::new(realm, self).build()
    }
}

/// Call this object.
///
/// # Panics
///
/// Panics if the object is currently mutably borrowed.
// <https://tc39.es/ecma262/#sec-built-in-function-objects-call-thisargument-argumentslist>
pub(crate) fn native_function_call(
    obj: &JsObject,
    argument_count: usize,
    context: &mut InternalMethodCallContext<'_>,
) -> JsResult<CallValue> {
    let args = context
        .vm
        .stack
        .calling_convention_pop_arguments(argument_count);
    let _func = context.vm.stack.pop();
    let this = context.vm.stack.pop();

    // We technically don't need this since native functions don't push any new frames to the
    // vm, but we'll eventually have to combine the native stack with the vm stack.
    context.check_runtime_limits()?;
    let this_function_object = obj.clone();

    let NativeFunctionObject {
        f: function,
        name,
        constructor,
        realm,
    } = obj
        .downcast_ref::<NativeFunctionObject>()
        .expect("the object should be a native function object")
        .clone();

    let pc = context.vm.frame().pc;
    let native_source_info = context.native_source_info();
    context
        .vm
        .shadow_stack
        .push_native(pc, name, native_source_info);

    let mut realm = realm.unwrap_or_else(|| context.realm().clone());

    context.swap_realm(&mut realm);
    context.vm.native_active_function = Some(this_function_object);

    let result = if constructor.is_some() {
        function.call(&JsValue::undefined(), &args, context)
    } else {
        function.call(&this, &args, context)
    }
    .map_err(|err| err.inject_realm(context.realm().clone()));

    context.vm.native_active_function = None;
    context.swap_realm(&mut realm);

    context.vm.shadow_stack.pop();

    context.vm.stack.push(result?);

    Ok(CallValue::Complete)
}

/// Construct an instance of this object with the specified arguments.
///
/// # Panics
///
/// Panics if the object is currently mutably borrowed.
// <https://tc39.es/ecma262/#sec-built-in-function-objects-construct-argumentslist-newtarget>
fn native_function_construct(
    obj: &JsObject,
    argument_count: usize,
    context: &mut InternalMethodCallContext<'_>,
) -> JsResult<CallValue> {
    // We technically don't need this since native functions don't push any new frames to the
    // vm, but we'll eventually have to combine the native stack with the vm stack.
    context.check_runtime_limits()?;
    let this_function_object = obj.clone();

    let NativeFunctionObject {
        f: function,
        name,
        constructor,
        realm,
    } = obj
        .downcast_ref::<NativeFunctionObject>()
        .expect("the object should be a native function object")
        .clone();

    let pc = context.vm.frame().pc;
    let native_source_info = context.native_source_info();
    context
        .vm
        .shadow_stack
        .push_native(pc, name, native_source_info);

    let mut realm = realm.unwrap_or_else(|| context.realm().clone());

    context.swap_realm(&mut realm);
    context.vm.native_active_function = Some(this_function_object);

    let new_target = context.vm.stack.pop();
    let args = context
        .vm
        .stack
        .calling_convention_pop_arguments(argument_count);
    let _func = context.vm.stack.pop();
    let _this = context.vm.stack.pop();

    let result = function
        .call(&new_target, &args, context)
        .map_err(|err| err.inject_realm(context.realm().clone()))
        .and_then(|v| match v.variant() {
            JsVariant::Object(o) => Ok(o.clone()),
            val => {
                if constructor.expect("must be a constructor").is_base() || val.is_undefined() {
                    let prototype = get_prototype_from_constructor(
                        &new_target,
                        StandardConstructors::object,
                        context,
                    )?;
                    Ok(JsObject::from_proto_and_data_with_shared_shape(
                        context.root_shape(),
                        prototype,
                        OrdinaryObject,
                    )
                    .upcast())
                } else {
                    Err(JsNativeError::typ()
                        .with_message("derived constructor can only return an Object or undefined")
                        .into())
                }
            }
        });

    context.vm.native_active_function = None;
    context.swap_realm(&mut realm);

    context.vm.shadow_stack.pop();

    context.vm.stack.push(result?);

    Ok(CallValue::Complete)
}
