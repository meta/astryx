//! A Rust API wrapper for the `WeakSet` Builtin ECMAScript Object
use std::ops::Deref;

use boa_gc::{Finalize, Trace};

use crate::{
    Context, JsResult, JsValue,
    builtins::weak_set::{NativeWeakSet, WeakSet},
    error::JsNativeError,
    object::JsObject,
    value::TryFromJs,
};

/// `JsWeakSet` provides a wrapper for Boa's implementation of the ECMAScript `WeakSet` object.
#[derive(Debug, Clone, Trace, Finalize)]
pub struct JsWeakSet {
    inner: JsObject,
}

impl JsWeakSet {
    /// Creates a new empty `WeakSet`.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet/WeakSet
    #[inline]
    pub fn new(context: &mut Context) -> Self {
        Self {
            inner: JsObject::from_proto_and_data_with_shared_shape(
                context.root_shape(),
                context.intrinsics().constructors().weak_set().prototype(),
                NativeWeakSet::new(),
            )
            .upcast(),
        }
    }

    /// Adds the given object to the `WeakSet`.
    /// Returns the `JsWeakSet` itself.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet/add
    #[inline]
    pub fn add(&self, value: &JsObject, context: &mut Context) -> JsResult<Self> {
        WeakSet::add(&self.inner.clone().into(), &[value.clone().into()], context)?;
        Ok(self.clone())
    }

    /// Removes the given object from the `WeakSet`.
    /// Returns `true` if the element existed, `false` otherwise.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet/delete
    #[inline]
    pub fn delete(&self, value: &JsObject, context: &mut Context) -> JsResult<bool> {
        WeakSet::delete(&self.inner.clone().into(), &[value.clone().into()], context)
            .map(|v| v.as_boolean().unwrap_or(false))
    }

    /// Returns `true` if the given object exists in the `WeakSet`.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet/has
    #[inline]
    pub fn has(&self, value: &JsObject, context: &mut Context) -> JsResult<bool> {
        WeakSet::has(&self.inner.clone().into(), &[value.clone().into()], context)
            .map(|v| v.as_boolean().unwrap_or(false))
    }

    /// Creates a `JsWeakSet` from a `JsObject`, or returns the original object as `Err`
    /// if it is not a `WeakSet`.
    #[inline]
    pub fn from_object(object: JsObject) -> Result<Self, JsObject> {
        if object.downcast_ref::<NativeWeakSet>().is_some() {
            Ok(Self { inner: object })
        } else {
            Err(object)
        }
    }
}

impl From<JsWeakSet> for JsObject {
    #[inline]
    fn from(o: JsWeakSet) -> Self {
        o.inner.clone()
    }
}

impl From<JsWeakSet> for JsValue {
    #[inline]
    fn from(o: JsWeakSet) -> Self {
        o.inner.clone().into()
    }
}

impl Deref for JsWeakSet {
    type Target = JsObject;
    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsWeakSet {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object()
            && let Ok(weak_set) = Self::from_object(o.clone())
        {
            Ok(weak_set)
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not a WeakSet object")
                .into())
        }
    }
}
