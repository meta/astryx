//! A Rust API wrapper for Boa's `Function` Builtin ECMAScript Object
use crate::js_string;
use crate::{
    Context, JsNativeError, JsResult, JsValue, NativeFunction, TryIntoJsResult,
    builtins::function::ConstructorKind, native_function::NativeFunctionObject, object::JsObject,
    value::TryFromJs,
};
use boa_gc::{Finalize, Trace};
use std::marker::PhantomData;
use std::ops::Deref;

/// A trait for converting a tuple of Rust values into a vector of `JsValue`,
/// to be used as arguments for a JavaScript function.
pub trait TryIntoJsArguments {
    /// Convert a tuple of Rust values into a vector of `JsValue`.
    /// This is automatically implemented for tuples that implement
    /// `TryIntoJsResult`.
    fn into_js_args(self, cx: &mut Context) -> JsResult<Vec<JsValue>>;
}

macro_rules! impl_try_into_js_args {
    ($($n: ident: $t: ident),*) => {
        impl<$($t),*> TryIntoJsArguments for ($($t,)*) where $($t: TryIntoJsResult),* {
            fn into_js_args(self, cx: &mut Context) -> JsResult<Vec<JsValue>> {
                let ($($n,)*) = self;
                Ok(vec![$($n.try_into_js_result(cx)?),*])
            }
        }
    };
}

impl_try_into_js_args!(a: A);
impl_try_into_js_args!(a: A, b: B);
impl_try_into_js_args!(a: A, b: B, c: C);
impl_try_into_js_args!(a: A, b: B, c: C, d: D);
impl_try_into_js_args!(a: A, b: B, c: C, d: D, e: E);

/// A JavaScript `Function` rust object, typed. This adds types to
/// a JavaScript exported function, allowing for type checking and
/// type conversion in Rust. Those types must convert to a [`JsValue`]
/// but will not be verified at runtime (since JavaScript doesn't
/// actually have strong typing).
///
/// To create this type, use the [`JsFunction::typed`] method.
#[derive(Debug, Clone, Trace, Finalize)]
pub struct TypedJsFunction<A: TryIntoJsArguments, R: TryFromJs> {
    inner: JsFunction,
    _args: PhantomData<A>,
    _ret: PhantomData<R>,
}

impl<A: TryIntoJsArguments, R: TryFromJs> TypedJsFunction<A, R> {
    /// Transforms this typed function back into a regular `JsFunction`.
    #[must_use]
    pub fn into_inner(self) -> JsFunction {
        self.inner.clone()
    }

    /// Get the inner `JsFunction` without consuming this object.
    #[must_use]
    pub fn as_js_function(&self) -> &JsFunction {
        &self.inner
    }

    /// Call the function with the given arguments.
    #[inline]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub fn call(&self, context: &mut Context, args: A) -> JsResult<R> {
        self.call_with_this(&JsValue::undefined(), context, args)
    }

    /// Call the function with the given argument and `this`.
    #[inline]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub fn call_with_this(&self, this: &JsValue, context: &mut Context, args: A) -> JsResult<R> {
        let arguments = args.into_js_args(context)?;
        let result = self.inner.call(this, &arguments, context)?;
        R::try_from_js(&result, context)
    }
}

impl<A: TryIntoJsArguments, R: TryFromJs> TryFromJs for TypedJsFunction<A, R> {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object() {
            JsFunction::from_object(o.clone())
                .ok_or_else(|| {
                    JsNativeError::typ()
                        .with_message("object is not a function")
                        .into()
                })
                .map(JsFunction::typed)
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not a Function object")
                .into())
        }
    }
}

impl<A: TryIntoJsArguments, R: TryFromJs> From<TypedJsFunction<A, R>> for JsValue {
    #[inline]
    fn from(o: TypedJsFunction<A, R>) -> Self {
        o.into_inner().into()
    }
}

impl<A: TryIntoJsArguments, R: TryFromJs> From<TypedJsFunction<A, R>> for JsFunction {
    fn from(value: TypedJsFunction<A, R>) -> Self {
        value.inner.clone()
    }
}

/// JavaScript `Function` rust object.
#[derive(Debug, Clone, Trace, Finalize)]
pub struct JsFunction {
    inner: JsObject,
}

impl JsFunction {
    /// Creates a new `JsFunction` from an object, without checking if the object is callable.
    pub(crate) fn from_object_unchecked(object: JsObject) -> Self {
        Self { inner: object }
    }

    /// Creates a new, empty intrinsic function object with only its function internal methods set.
    ///
    /// Mainly used to initialize objects before a [`Context`] is available to do so.
    ///
    /// [`Context`]: crate::Context
    pub(crate) fn empty_intrinsic_function(constructor: bool) -> Self {
        Self {
            inner: JsObject::from_proto_and_data(
                None,
                NativeFunctionObject {
                    f: NativeFunction::from_fn_ptr(|_, _, _| Ok(JsValue::undefined())),
                    name: js_string!(),
                    constructor: constructor.then_some(ConstructorKind::Base),
                    realm: None,
                },
            ),
        }
    }

    /// Creates a [`JsFunction`] from a [`JsObject`], or returns `None` if the object is not a function.
    ///
    /// This does not clone the fields of the function, it only does a shallow clone of the object.
    #[inline]
    #[must_use]
    pub fn from_object(object: JsObject) -> Option<Self> {
        object
            .is_callable()
            .then(|| Self::from_object_unchecked(object))
    }

    /// Creates a `TypedJsFunction` from a `JsFunction`.
    #[inline]
    #[must_use]
    pub fn typed<A: TryIntoJsArguments, R: TryFromJs>(self) -> TypedJsFunction<A, R> {
        TypedJsFunction {
            inner: self,
            _args: PhantomData,
            _ret: PhantomData,
        }
    }
}

impl From<JsFunction> for JsObject {
    #[inline]
    fn from(o: JsFunction) -> Self {
        o.inner.clone()
    }
}

impl From<JsFunction> for JsValue {
    #[inline]
    fn from(o: JsFunction) -> Self {
        o.inner.clone().into()
    }
}

impl Deref for JsFunction {
    type Target = JsObject;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsFunction {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object() {
            Self::from_object(o.clone()).ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("object is not a function")
                    .into()
            })
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not a Function object")
                .into())
        }
    }
}
