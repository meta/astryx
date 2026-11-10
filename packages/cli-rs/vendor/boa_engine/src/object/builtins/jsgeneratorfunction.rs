//! A Rust API wrapper for Boa's `GeneratorFunction` Builtin ECMAScript Object
use crate::{
    Context, JsNativeError, JsResult, JsValue,
    builtins::function::OrdinaryFunction,
    object::{JsObject, builtins::JsGenerator},
    value::TryFromJs,
};
use boa_gc::{Finalize, Trace};
use std::ops::Deref;

/// `JsGeneratorFunction` provides a wrapper for Boa's implementation of the ECMAScript `GeneratorFunction` builtin object.
#[derive(Debug, Clone, Trace, Finalize)]
pub struct JsGeneratorFunction {
    inner: JsObject,
}

impl JsGeneratorFunction {
    /// Creates a `JsGeneratorFunction` from a generator function `JsObject`.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/GeneratorFunction
    #[inline]
    pub fn from_object(object: JsObject) -> JsResult<Self> {
        if object
            .downcast_ref::<OrdinaryFunction>()
            .is_some_and(|f| f.code.is_generator() && !f.code.is_async())
        {
            Ok(Self { inner: object })
        } else {
            Err(JsNativeError::typ()
                .with_message("object is not a GeneratorFunction")
                .into())
        }
    }

    /// Calls the generator function and returns a new `JsGenerator` object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/GeneratorFunction
    pub fn call(
        &self,
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsGenerator> {
        let value = self.inner.call(this, args, context)?;
        let obj = value
            .as_object()
            .ok_or_else(|| {
                JsNativeError::typ().with_message("generator function did not return an object")
            })?
            .clone();
        JsGenerator::from_object(obj)
    }
}

impl From<JsGeneratorFunction> for JsObject {
    #[inline]
    fn from(o: JsGeneratorFunction) -> Self {
        o.inner.clone()
    }
}

impl From<JsGeneratorFunction> for JsValue {
    #[inline]
    fn from(o: JsGeneratorFunction) -> Self {
        o.inner.clone().into()
    }
}

impl Deref for JsGeneratorFunction {
    type Target = JsObject;
    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsGeneratorFunction {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object() {
            Self::from_object(o.clone())
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not a GeneratorFunction object")
                .into())
        }
    }
}
