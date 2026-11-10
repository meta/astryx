//! A Rust API wrapper for Boa's `AsyncGenerator` Builtin ECMAScript Object
use super::JsPromise;
use crate::{
    Context, JsNativeError, JsResult, JsValue,
    builtins::{async_generator::AsyncGenerator, promise::PromiseCapability},
    js_error,
    object::JsObject,
    value::TryFromJs,
};
use boa_gc::{Finalize, Trace};
use std::ops::Deref;

/// `JsAsyncGenerator` provides a wrapper for Boa's implementation of the ECMAScript `AsyncGenerator` builtin object.
#[derive(Debug, Clone, Trace, Finalize)]
#[boa_gc(unsafe_no_drop)]
pub struct JsAsyncGenerator {
    inner: JsObject<AsyncGenerator>,
}

impl JsAsyncGenerator {
    /// Creates a `JsAsyncGenerator` from an async generator `JsObject`.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator
    #[inline]
    pub fn from_object(object: JsObject) -> JsResult<Self> {
        object
            .downcast::<AsyncGenerator>()
            .map(|inner| Self { inner })
            .map_err(|_| js_error!(TypeError: "object is not an AsyncGenerator object"))
    }

    /// Calls `AsyncGenerator.prototype.next()`.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator/next
    pub fn next<T>(&self, value: T, context: &mut Context) -> JsResult<JsPromise>
    where
        T: Into<JsValue>,
    {
        let (typed_promise, functions) = JsPromise::new_pending(context);
        let capability = PromiseCapability {
            functions,
            promise: JsObject::clone(&typed_promise).clone().upcast(),
        };
        AsyncGenerator::inner_next(&self.inner, capability, value.into(), context)?;

        Ok(typed_promise)
    }

    /// Calls `AsyncGenerator.prototype.return()`.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator/return
    pub fn r#return<T>(&self, value: T, context: &mut Context) -> JsResult<JsPromise>
    where
        T: Into<JsValue>,
    {
        let (typed_promise, functions) = JsPromise::new_pending(context);
        let capability = PromiseCapability {
            functions,
            promise: JsObject::clone(&typed_promise).upcast(),
        };
        AsyncGenerator::inner_return(&self.inner, capability, value.into(), context)?;
        Ok(typed_promise)
    }

    /// Calls `AsyncGenerator.prototype.throw()`.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator/throw
    pub fn throw<T>(&self, value: T, context: &mut Context) -> JsResult<JsPromise>
    where
        T: Into<JsValue>,
    {
        let (typed_promise, functions) = JsPromise::new_pending(context);
        let capability = PromiseCapability {
            functions,
            promise: JsObject::clone(&typed_promise).clone().upcast(),
        };
        AsyncGenerator::inner_throw(&self.inner, capability, value.into(), context)?;
        Ok(typed_promise)
    }
}

impl From<JsAsyncGenerator> for JsObject {
    #[inline]
    fn from(o: JsAsyncGenerator) -> Self {
        o.inner.upcast()
    }
}

impl From<JsAsyncGenerator> for JsValue {
    #[inline]
    fn from(o: JsAsyncGenerator) -> Self {
        o.inner.clone().into()
    }
}

impl Deref for JsAsyncGenerator {
    type Target = JsObject<AsyncGenerator>;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsAsyncGenerator {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object() {
            Self::from_object(o.clone())
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not an AsyncGenerator object")
                .into())
        }
    }
}
