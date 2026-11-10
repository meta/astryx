//! A Rust API wrapper for the `Set` Builtin ECMAScript Object
use std::ops::Deref;

use boa_gc::{Finalize, Trace};

use crate::{
    Context, JsResult, JsValue,
    builtins::{
        Set, canonicalize_keyed_collection_key, iterable::IteratorHint,
        set::ordered_set::OrderedSet,
    },
    error::JsNativeError,
    object::{JsFunction, JsObject, JsSetIterator},
    value::TryFromJs,
};

/// `JsSet` provides a wrapper for Boa's implementation of the ECMAScript `Set` object.
#[derive(Debug, Clone, Trace, Finalize)]
pub struct JsSet {
    inner: JsObject<OrderedSet>,
}

impl JsSet {
    /// Create a new empty set.
    ///
    /// Doesn't matches JavaScript `new Set()` as it doesn't takes an iterator
    /// similar to Rust initialization.
    #[inline]
    pub fn new(context: &mut Context) -> Self {
        Self {
            inner: JsObject::from_proto_and_data_with_shared_shape(
                context.root_shape(),
                context.intrinsics().constructors().set().prototype(),
                OrderedSet::new(),
            ),
        }
    }

    /// Returns the size of the `Set` as an integer.
    ///
    /// Same as JavaScript's `set.size`.
    #[inline]
    #[must_use]
    pub fn size(&self) -> usize {
        self.inner.borrow().data().len()
    }

    /// Appends value to the Set object.
    /// Returns the Set object with added value.
    ///
    /// Same as JavaScript's `set.add(value)`.
    pub fn add<T>(&self, value: T, context: &mut Context) -> JsResult<JsValue>
    where
        T: Into<JsValue>,
    {
        self.add_items(&[value.into()], context)
    }

    /// Adds slice as a single element.
    /// Returns the Set object with added slice.
    ///
    /// Same as JavaScript's `set.add(["one", "two", "three"])`
    #[inline]
    pub fn add_items(&self, items: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Set::add(&self.inner.clone().into(), items, context)
    }

    /// Removes all elements from the Set object.
    ///
    /// Same as JavaScript's `set.clear()`.
    #[inline]
    pub fn clear(&self) {
        self.inner.borrow_mut().data_mut().clear();
    }

    /// Removes the element associated to the value.
    /// Returns a boolean asserting whether an element was
    /// successfully removed or not.
    ///
    /// Same as JavaScript's `set.delete(value)`.
    pub fn delete<T>(&self, value: T) -> bool
    where
        T: Into<JsValue>,
    {
        self.borrow_mut()
            .data_mut()
            .delete(&canonicalize_keyed_collection_key(value.into()))
    }

    /// Returns a boolean asserting whether an element is present
    /// with the given value in the Set object or not.
    ///
    /// Same as JavaScript's `set.has(value)`.
    #[must_use]
    pub fn has<T>(&self, value: T) -> bool
    where
        T: Into<JsValue>,
    {
        self.borrow()
            .data()
            .contains(&canonicalize_keyed_collection_key(value.into()))
    }

    /// Returns a new iterator object that yields the values
    /// for each element in the Set object in insertion order.
    ///
    /// Same as JavaScript's `set.values()`.
    #[inline]
    pub fn values(&self, context: &mut Context) -> JsResult<JsSetIterator> {
        let iterator_object = Set::values(&self.inner.clone().into(), &[JsValue::null()], context)?
            .get_iterator(IteratorHint::Sync, context)?;

        JsSetIterator::from_object(iterator_object.iterator().clone())
    }

    /// Alias for `Set.prototype.values()`
    /// Returns a new iterator object that yields the values
    /// for each element in the Set object in insertion order.
    ///
    /// Same as JavaScript's `set.keys()`.
    #[inline]
    pub fn keys(&self, context: &mut Context) -> JsResult<JsSetIterator> {
        let iterator_object = Set::values(&self.inner.clone().into(), &[JsValue::null()], context)?
            .get_iterator(IteratorHint::Sync, context)?;

        JsSetIterator::from_object(iterator_object.iterator().clone())
    }

    /// Calls callbackFn once for each value present in the Set object,
    /// in insertion order.
    /// Returns `Undefined`.
    ///
    /// Same as JavaScript's `set.forEach(values)`.
    #[inline]
    pub fn for_each(
        &self,
        callback: JsFunction,
        this_arg: JsValue,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        Set::for_each(
            &self.inner.clone().into(),
            &[callback.into(), this_arg],
            context,
        )
    }

    /// Executes the provided callback function for each key-value pair within the [`JsSet`].
    #[inline]
    pub fn for_each_native<F>(&self, f: F) -> JsResult<()>
    where
        F: FnMut(JsValue) -> JsResult<()>,
    {
        let this = self.inner.clone().into();
        Set::for_each_native(&this, f)
    }

    /// Utility: Creates `JsSet` from `JsObject`, otherwise returns the original object as an `Err`.
    #[inline]
    pub fn from_object(object: JsObject) -> Result<Self, JsObject> {
        object.downcast::<OrderedSet>().map(|o| Self { inner: o })
    }

    /// Utility: Creates a `JsSet` from a `<IntoIterator<Item = JsValue>` convertible object.
    pub fn from_iter<I>(elements: I, context: &mut Context) -> Self
    where
        I: IntoIterator<Item = JsValue>,
    {
        let elements = elements.into_iter();

        // Create empty Set
        let mut set = OrderedSet::with_capacity(elements.size_hint().0);

        // For each element e of elements, do
        for elem in elements {
            let elem = canonicalize_keyed_collection_key(elem);
            set.add(elem);
        }

        Self {
            inner: JsObject::from_proto_and_data_with_shared_shape(
                context.root_shape(),
                context.intrinsics().constructors().set().prototype(),
                set,
            ),
        }
    }
}

impl From<JsObject<OrderedSet>> for JsSet {
    fn from(value: JsObject<OrderedSet>) -> Self {
        Self { inner: value }
    }
}

impl From<JsSet> for JsObject {
    #[inline]
    fn from(o: JsSet) -> Self {
        o.inner.clone().upcast()
    }
}

impl From<JsSet> for JsValue {
    #[inline]
    fn from(o: JsSet) -> Self {
        o.inner.clone().into()
    }
}

impl Deref for JsSet {
    type Target = JsObject<OrderedSet>;
    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsSet {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object()
            && let Ok(set) = Self::from_object(o.clone())
        {
            Ok(set)
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not a Set object")
                .into())
        }
    }
}
