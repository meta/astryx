use std::ops::Deref;

use boa_gc::{Finalize, Trace};

use crate::{
    builtins::finalization_registry::FinalizationRegistry, object::JsObjectType, realm::Realm,
    value::TryFromJs, Context, JsNativeError, JsObject, JsResult, JsValue,
};

/// `JsFinalizationRegistry` provides a wrapper for Boa's implementation of the ECMAScript
/// [`FinalizationRegistry`] object.
///
/// [`FinalizationRegistry`]: https://tc39.es/ecma262/#sec-finalization-registry-objects
#[derive(Debug, Clone, Trace, Finalize)]
pub struct JsFinalizationRegistry {
    inner: JsObject,
}

impl JsFinalizationRegistry {
    /// Creates a [`JsFinalizationRegistry`] from a [`JsObject`], erroring if the object is not
    /// of the required kind.
    #[inline]
    pub fn from_object(object: JsObject) -> JsResult<Self> {
        if object.is::<FinalizationRegistry>() {
            Ok(Self { inner: object })
        } else {
            Err(JsNativeError::typ()
                .with_message("object is not a TypedArray")
                .into())
        }
    }

    /// Gets the `[[Realm]]` slot of this [`FinalizationRegistry`].
    pub fn realm(&self) -> Realm {
        self.downcast_ref::<FinalizationRegistry>()
            .expect("must be a `FinalizationRegistry")
            .realm
            .clone()
    }

    /// Returns `true` if this finalization registry has unreachable cells.
    pub(crate) fn needs_cleanup(&self) -> bool {
        self.downcast_ref::<FinalizationRegistry>()
            .expect("must be a `FinalizationRegistry")
            .needs_cleanup
            .get()
    }

    /// Clears the `needs_cleanup` flag from the registry.
    pub(crate) fn clear_needs_cleanup(&self) {
        self.downcast_ref::<FinalizationRegistry>()
            .expect("must be a `FinalizationRegistry")
            .needs_cleanup
            .set(false)
    }

    /// Abstract operation [`CleanupFinalizationRegistry ( finalizationRegistry )`][spec].
    ///
    /// Cleans up all the cells of the finalization registry that are determined to be
    /// unreachable by the garbage collector.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-cleanup-finalization-registry
    pub fn cleanup(&self, context: &mut Context) -> JsResult<()> {
        FinalizationRegistry::cleanup(&self, context)
    }

    /// Creates a new [`JsFinalizationRegistry`] from an object, without checking if the object is
    /// a finalization registry.
    pub(crate) fn from_object_unchecked(object: JsObject) -> Self {
        Self { inner: object }
    }
}

impl From<JsFinalizationRegistry> for JsObject {
    #[inline]
    fn from(o: JsFinalizationRegistry) -> Self {
        o.inner.clone()
    }
}

impl From<JsFinalizationRegistry> for JsValue {
    #[inline]
    fn from(o: JsFinalizationRegistry) -> Self {
        o.inner.clone().into()
    }
}

impl Deref for JsFinalizationRegistry {
    type Target = JsObject;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl JsObjectType for JsFinalizationRegistry {}

impl TryFromJs for JsFinalizationRegistry {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        match value {
            JsValue::Object(o) => Self::from_object(o.clone()),
            _ => Err(JsNativeError::typ()
                .with_message("value is not a FinalizationRegistry object")
                .into()),
        }
    }
}
