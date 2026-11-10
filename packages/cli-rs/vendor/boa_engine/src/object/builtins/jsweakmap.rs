//! A Rust API wrapper for the `WeakMap` Builtin ECMAScript Object
use std::ops::Deref;

use boa_gc::{Finalize, Trace};

use crate::{
    Context, JsResult, JsValue,
    builtins::weak_map::{NativeWeakMap, WeakMap},
    error::JsNativeError,
    object::JsObject,
    value::TryFromJs,
};

/// `JsWeakMap` provides a wrapper for Boa's implementation of the ECMAScript `WeakMap` object.
#[derive(Debug, Clone, Trace, Finalize)]
pub struct JsWeakMap {
    inner: JsObject,
}

impl JsWeakMap {
    /// Creates a new empty `WeakMap`.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/WeakMap
    #[inline]
    pub fn new(context: &mut Context) -> Self {
        Self {
            inner: JsObject::from_proto_and_data_with_shared_shape(
                context.root_shape(),
                context.intrinsics().constructors().weak_map().prototype(),
                NativeWeakMap::new(),
            )
            .upcast(),
        }
    }

    /// Returns the value associated with the specified key in the `WeakMap`,
    /// or `undefined` if the key is not present.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/get
    #[inline]
    pub fn get(&self, key: &JsObject, context: &mut Context) -> JsResult<JsValue> {
        WeakMap::get(&self.inner.clone().into(), &[key.clone().into()], context)
    }

    /// Inserts a key-value pair into the `WeakMap`.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/set
    #[inline]
    pub fn set(&self, key: &JsObject, value: JsValue, context: &mut Context) -> JsResult<JsValue> {
        WeakMap::set(
            &self.inner.clone().into(),
            &[key.clone().into(), value],
            context,
        )
    }

    /// Returns `true` if the specified key exists in the `WeakMap`.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/has
    #[inline]
    pub fn has(&self, key: &JsObject, context: &mut Context) -> JsResult<bool> {
        WeakMap::has(&self.inner.clone().into(), &[key.clone().into()], context)
            .map(|v| v.as_boolean().unwrap_or(false))
    }

    /// Removes the element associated with the specified key.
    /// Returns `true` if the element existed, `false` otherwise.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/delete
    #[inline]
    pub fn delete(&self, key: &JsObject, context: &mut Context) -> JsResult<bool> {
        WeakMap::delete(&self.inner.clone().into(), &[key.clone().into()], context)
            .map(|v| v.as_boolean().unwrap_or(false))
    }

    /// Returns the value associated with the key if it exists; otherwise inserts
    /// the provided default value and returns it.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/getOrInsert
    #[inline]
    pub fn get_or_insert(
        &self,
        key: &JsObject,
        default: JsValue,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        WeakMap::get_or_insert(
            &self.inner.clone().into(),
            &[key.clone().into(), default],
            context,
        )
    }

    /// Returns the value associated with the key if it exists; otherwise calls
    /// the provided callback with the key, inserts the result, and returns it.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/getOrInsertComputed
    #[inline]
    pub fn get_or_insert_computed(
        &self,
        key: &JsObject,
        callback: JsValue,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        WeakMap::get_or_insert_computed(
            &self.inner.clone().into(),
            &[key.clone().into(), callback],
            context,
        )
    }

    /// Creates a `JsWeakMap` from a `JsObject`, or returns the original object as `Err`
    /// if it is not a `WeakMap`.
    #[inline]
    pub fn from_object(object: JsObject) -> Result<Self, JsObject> {
        if object.downcast_ref::<NativeWeakMap>().is_some() {
            Ok(Self { inner: object })
        } else {
            Err(object)
        }
    }
}

impl From<JsWeakMap> for JsObject {
    #[inline]
    fn from(o: JsWeakMap) -> Self {
        o.inner.clone()
    }
}

impl From<JsWeakMap> for JsValue {
    #[inline]
    fn from(o: JsWeakMap) -> Self {
        o.inner.clone().into()
    }
}

impl Deref for JsWeakMap {
    type Target = JsObject;
    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsWeakMap {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object()
            && let Ok(weak_map) = Self::from_object(o.clone())
        {
            Ok(weak_map)
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not a WeakMap object")
                .into())
        }
    }
}
