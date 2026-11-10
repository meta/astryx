//! A Rust API wrapper for Boa's `Generator` Builtin ECMAScript Object
use crate::{
    Context, JsNativeError, JsResult, JsValue, builtins::generator::Generator, object::JsObject,
    value::TryFromJs,
};

use boa_gc::{Finalize, Trace};
use std::ops::Deref;

/// `JsGenerator` provides a wrapper for Boa's implementation of the ECMAScript `Generator` builtin object
#[derive(Debug, Clone, Trace, Finalize)]
pub struct JsGenerator {
    inner: JsObject,
}

impl JsGenerator {
    /// Creates a `JsGenerator` from a generator `JsObject`
    #[inline]
    pub fn from_object(object: JsObject) -> JsResult<Self> {
        if object.is::<Generator>() {
            Ok(Self { inner: object })
        } else {
            Err(JsNativeError::typ()
                .with_message("object is not a Generator")
                .into())
        }
    }

    /// Calls `Generator.prototype.next()`
    ///
    /// This method returns an object with the properties `done` and `value`
    pub fn next<T>(&self, value: T, context: &mut Context) -> JsResult<JsValue>
    where
        T: Into<JsValue>,
    {
        Generator::next(&self.inner.clone().into(), &[value.into()], context)
    }

    /// Calls `Generator.prototype.return()`
    ///
    /// This method returns the given value and finishes the generator
    pub fn r#return<T>(&self, value: T, context: &mut Context) -> JsResult<JsValue>
    where
        T: Into<JsValue>,
    {
        Generator::r#return(&self.inner.clone().into(), &[value.into()], context)
    }

    /// Calls `Generator.prototype.throw()`
    ///
    /// This method resumes the execution of a generator by throwing an error and returning an
    /// an object with the properties `done` and `value`
    pub fn throw<T>(&self, value: T, context: &mut Context) -> JsResult<JsValue>
    where
        T: Into<JsValue>,
    {
        Generator::throw(&self.inner.clone().into(), &[value.into()], context)
    }
}

impl From<JsGenerator> for JsObject {
    #[inline]
    fn from(o: JsGenerator) -> Self {
        o.inner.clone()
    }
}

impl From<JsGenerator> for JsValue {
    #[inline]
    fn from(o: JsGenerator) -> Self {
        o.inner.clone().into()
    }
}

impl Deref for JsGenerator {
    type Target = JsObject;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsGenerator {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object() {
            Self::from_object(o.clone())
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not a Generator object")
                .into())
        }
    }
}
