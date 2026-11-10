//! A Rust API wrapper for Boa's `Map` Builtin ECMAScript Object
use crate::{
    Context, JsResult, JsValue,
    builtins::{
        Map,
        iterable::IteratorHint,
        map::{add_entries_from_iterable, ordered_map::OrderedMap},
    },
    error::JsNativeError,
    js_string,
    object::{JsFunction, JsMapIterator, JsObject},
    value::TryFromJs,
};

use boa_gc::{Finalize, Trace};
use std::ops::Deref;

/// `JsMap` provides a wrapper for Boa's implementation of the ECMAScript `Map` object.
///
/// # Examples
///
/// Create a `JsMap` and set a new entry
/// ```
/// # use boa_engine::{
/// #  object::builtins::JsMap,
/// #  Context, JsValue, JsResult, js_string
/// # };
/// # fn main() -> JsResult<()> {
/// // Create default `Context`
/// let context = &mut Context::default();
///
/// // Create a new empty `JsMap`.
/// let map = JsMap::new(context);
///
/// // Set key-value pairs for the `JsMap`.
/// map.set(js_string!("Key-1"), js_string!("Value-1"), context)?;
/// map.set(js_string!("Key-2"), 10, context)?;
///
/// assert_eq!(map.get_size(context)?, 2.into());
/// # Ok(())
/// # }
/// ```
///
/// Create a `JsMap` from a `JsArray`
/// ```
/// # use boa_engine::{
/// #    object::builtins::{JsArray, JsMap},
/// #    Context, JsValue, JsResult, js_string
/// # };
/// # fn main() -> JsResult<()> {
/// // Create a default `Context`
/// let context = &mut Context::default();
///
/// // Create an array of two `[key, value]` pairs
/// let js_array = JsArray::new(context)?;
///
/// // Create a `[key, value]` pair of JsValues
/// let vec_one: Vec<JsValue> = vec![
///     js_string!("first-key").into(),
///     js_string!("first-value").into()
/// ];
///
/// // We create an push our `[key, value]` pair onto our array as a `JsArray`
/// js_array.push(JsArray::from_iter(vec_one, context), context)?;
///
/// // Create a `JsMap` from the `JsArray` using it's iterable property.
/// let js_iterable_map = JsMap::from_js_iterable(&js_array.into(), context)?;
///
/// assert_eq!(
///     js_iterable_map.get(js_string!("first-key"), context)?,
///     js_string!("first-value").into()
/// );
///
/// # Ok(())
/// }
/// ```
#[derive(Debug, Clone, Trace, Finalize)]
pub struct JsMap {
    inner: JsObject,
}

impl JsMap {
    /// Creates a new empty [`JsMap`] object.
    ///
    /// # Example
    /// ```
    /// # use boa_engine::{
    /// #    object::builtins::JsMap,
    /// #    Context, JsValue,
    /// # };
    /// # // Create a new context.
    /// # let context = &mut Context::default();
    /// // Create a new empty `JsMap`.
    /// let map = JsMap::new(context);
    /// ```
    #[inline]
    pub fn new(context: &mut Context) -> Self {
        let map = Self::create_map(context);
        Self { inner: map }
    }

    /// Create a new [`JsMap`] object from a [`JsObject`] that has an `@@Iterator` field.
    ///
    /// # Examples
    /// ```
    /// # use boa_engine::{
    /// #    object::builtins::{JsArray, JsMap},
    /// #    Context, JsResult, JsValue, js_string
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # // Create a default `Context`
    /// # let context = &mut Context::default();
    /// // Create an array of two `[key, value]` pairs
    /// let js_array = JsArray::new(context)?;
    ///
    /// // Create a `[key, value]` pair of JsValues and add it to the `JsArray` as a `JsArray`
    /// let vec_one: Vec<JsValue> = vec![js_string!("first-key").into(), js_string!("first-value").into()];
    /// js_array.push(JsArray::from_iter(vec_one, context), context)?;
    ///
    /// // Create a `JsMap` from the `JsArray` using it's iterable property.
    /// let js_iterable_map = JsMap::from_js_iterable(&js_array.into(), context)?;
    ///
    /// # Ok(())
    /// # }
    /// ```
    pub fn from_js_iterable(iterable: &JsValue, context: &mut Context) -> JsResult<Self> {
        // Create a new map object.
        let map = Self::create_map(context);

        // Let adder be Get(map, "set") per spec. This action should not fail with default map.
        let adder = map
            .get(js_string!("set"), context)?
            .as_function()
            .ok_or_else(|| {
                JsNativeError::typ().with_message("property `set` on new `Map` must be callable")
            })?;

        let _completion_record = add_entries_from_iterable(&map, iterable, &adder, context)?;

        Ok(Self { inner: map })
    }

    /// Creates a [`JsMap`] from a valid [`JsObject`], or returns a `TypeError` if the provided object is not a [`JsMap`]
    ///
    /// # Examples
    ///
    /// ### Valid Example - returns a `JsMap` object
    /// ```
    /// # use boa_engine::{
    /// #    builtins::map::ordered_map::OrderedMap,
    /// #    object::{builtins::JsMap, JsObject},
    /// #    Context, JsValue, JsResult,
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # let context = &mut Context::default();
    /// // `some_object` can be any JavaScript `Map` object.
    /// let some_object = JsObject::from_proto_and_data(
    ///     context.intrinsics().constructors().map().prototype(),
    ///     OrderedMap::<JsValue>::new(),
    /// );
    ///
    /// // Create `JsMap` object with incoming object.
    /// let js_map = JsMap::from_object(some_object)?;
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// ### Invalid Example - returns a `TypeError` with the message "object is not a Map"
    /// ```
    /// # use boa_engine::{
    /// #    object::{JsObject, builtins::{JsArray, JsMap}},
    /// #    Context, JsResult, JsValue,
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # let context = &mut Context::default();
    /// let some_object = JsArray::new(context)?;
    ///
    /// // `some_object` is an Array object, not a map object
    /// assert!(JsMap::from_object(some_object.into()).is_err());
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    pub fn from_object(object: JsObject) -> JsResult<Self> {
        if object.is::<OrderedMap<JsValue>>() {
            Ok(Self { inner: object })
        } else {
            Err(JsNativeError::typ()
                .with_message("object is not a Map")
                .into())
        }
    }

    // Utility function to generate the default `Map` object.
    fn create_map(context: &mut Context) -> JsObject {
        // Get default Map prototype
        let prototype = context.intrinsics().constructors().map().prototype();

        // Create a default map object with [[MapData]] as a new empty list
        JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            <OrderedMap<JsValue>>::new(),
        )
        .upcast()
    }

    /// Returns a new [`JsMapIterator`] object that yields the `[key, value]` pairs within the [`JsMap`] in insertion order.
    #[inline]
    pub fn entries(&self, context: &mut Context) -> JsResult<JsMapIterator> {
        let iterator_record = Map::entries(&self.inner.clone().into(), &[], context)?
            .get_iterator(IteratorHint::Sync, context)?;
        let map_iterator_object = iterator_record.iterator();
        JsMapIterator::from_object(map_iterator_object.clone())
    }

    /// Returns a new [`JsMapIterator`] object that yields the `key` for each element within the [`JsMap`] in insertion order.
    #[inline]
    pub fn keys(&self, context: &mut Context) -> JsResult<JsMapIterator> {
        let iterator_record = Map::keys(&self.inner.clone().into(), &[], context)?
            .get_iterator(IteratorHint::Sync, context)?;
        let map_iterator_object = iterator_record.iterator();
        JsMapIterator::from_object(map_iterator_object.clone())
    }

    /// Inserts a new entry into the [`JsMap`] object
    ///
    /// # Example
    ///
    /// ```
    /// # use boa_engine::{
    /// #    object::builtins::JsMap,
    /// #    Context, JsValue, JsResult, js_string
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # let context = &mut Context::default();
    /// let js_map = JsMap::new(context);
    ///
    /// js_map.set(js_string!("foo"), js_string!("bar"), context)?;
    /// js_map.set(2, 4, context)?;
    ///
    /// assert_eq!(
    ///     js_map.get(js_string!("foo"), context)?,
    ///     js_string!("bar").into()
    /// );
    /// assert_eq!(js_map.get(2, context)?, 4.into());
    /// # Ok(())
    /// # }
    /// ```
    pub fn set<K, V>(&self, key: K, value: V, context: &mut Context) -> JsResult<JsValue>
    where
        K: Into<JsValue>,
        V: Into<JsValue>,
    {
        Map::set(
            &self.inner.clone().into(),
            &[key.into(), value.into()],
            context,
        )
    }

    /// Gets the size of the [`JsMap`] object.
    ///
    /// # Example
    ///
    /// ```
    /// # use boa_engine::{
    /// #    object::builtins::JsMap,
    /// #    Context, JsValue, JsResult, js_string
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # let context = &mut Context::default();
    /// let js_map = JsMap::new(context);
    ///
    /// js_map.set(js_string!("foo"), js_string!("bar"), context)?;
    ///
    /// let map_size = js_map.get_size(context)?;
    ///
    /// assert_eq!(map_size, 1.into());
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    pub fn get_size(&self, context: &mut Context) -> JsResult<JsValue> {
        Map::get_size(&self.inner.clone().into(), &[], context)
    }

    /// Removes element from [`JsMap`] with a matching `key` value.
    ///
    /// # Example
    ///
    /// ```
    /// # use boa_engine::{
    /// #    object::builtins::JsMap,
    /// #    Context, JsValue, JsResult, js_string
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # let context = &mut Context::default();
    /// let js_map = JsMap::new(context);
    /// js_map.set(js_string!("foo"), js_string!("bar"), context)?;
    /// js_map.set(js_string!("hello"), js_string!("world"), context)?;
    ///
    /// js_map.delete(js_string!("foo"), context)?;
    ///
    /// assert_eq!(js_map.get_size(context)?, 1.into());
    /// assert_eq!(
    ///     js_map.get(js_string!("foo"), context)?,
    ///     JsValue::undefined()
    /// );
    /// # Ok(())
    /// # }
    /// ```
    pub fn delete<T>(&self, key: T, context: &mut Context) -> JsResult<JsValue>
    where
        T: Into<JsValue>,
    {
        Map::delete(&self.inner.clone().into(), &[key.into()], context)
    }

    /// Gets the value associated with the specified key within the [`JsMap`], or `undefined` if the key does not exist.
    ///
    /// # Example
    ///
    /// ```
    /// # use boa_engine::{
    /// #    object::builtins::JsMap,
    /// #    Context, JsValue, JsResult, js_string
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # let context = &mut Context::default();
    /// let js_map = JsMap::new(context);
    /// js_map.set(js_string!("foo"), js_string!("bar"), context)?;
    ///
    /// let retrieved_value = js_map.get(js_string!("foo"), context)?;
    ///
    /// assert_eq!(retrieved_value, js_string!("bar").into());
    /// # Ok(())
    /// # }
    /// ```
    pub fn get<T>(&self, key: T, context: &mut Context) -> JsResult<JsValue>
    where
        T: Into<JsValue>,
    {
        Map::get(&self.inner.clone().into(), &[key.into()], context)
    }

    /// Removes all entries from the [`JsMap`].
    ///
    /// # Example
    ///
    /// ```
    /// # use boa_engine::{
    /// #    object::builtins::JsMap,
    /// #    Context, JsValue, JsResult, js_string
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # let context = &mut Context::default();
    /// let js_map = JsMap::new(context);
    /// js_map.set(js_string!("foo"), js_string!("bar"), context)?;
    /// js_map.set(js_string!("hello"), js_string!("world"), context)?;
    ///
    /// js_map.clear(context)?;
    ///
    /// assert_eq!(js_map.get_size(context)?, 0.into());
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    pub fn clear(&self, context: &mut Context) -> JsResult<JsValue> {
        Map::clear(&self.inner.clone().into(), &[], context)
    }

    /// Checks if [`JsMap`] has an entry with the provided `key` value.
    ///
    /// # Example
    ///
    /// ```
    /// # use boa_engine::{
    /// #    object::builtins::JsMap,
    /// #    Context, JsValue, JsResult, js_string
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # let context = &mut Context::default();
    /// let js_map = JsMap::new(context);
    /// js_map.set(js_string!("foo"), js_string!("bar"), context)?;
    ///
    /// let has_key = js_map.has(js_string!("foo"), context)?;
    ///
    /// assert_eq!(has_key, true.into());
    /// # Ok(())
    /// # }
    /// ```
    pub fn has<T>(&self, key: T, context: &mut Context) -> JsResult<JsValue>
    where
        T: Into<JsValue>,
    {
        Map::has(&self.inner.clone().into(), &[key.into()], context)
    }

    /// Executes the provided callback function for each key-value pair within the [`JsMap`].
    #[inline]
    pub fn for_each(
        &self,
        callback: JsFunction,
        this_arg: JsValue,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        Map::for_each(
            &self.inner.clone().into(),
            &[callback.into(), this_arg],
            context,
        )
    }

    /// Executes the provided callback function for each key-value pair within the [`JsMap`].
    #[inline]
    pub fn for_each_native<F>(&self, f: F) -> JsResult<()>
    where
        F: FnMut(JsValue, JsValue) -> JsResult<()>,
    {
        let this = self.inner.clone().into();
        Map::for_each_native(&this, f)
    }

    /// Returns a new [`JsMapIterator`] object that yields the `value` for each element within the [`JsMap`] in insertion order.
    #[inline]
    pub fn values(&self, context: &mut Context) -> JsResult<JsMapIterator> {
        let iterator_record = Map::values(&self.inner.clone().into(), &[], context)?
            .get_iterator(IteratorHint::Sync, context)?;
        let map_iterator_object = iterator_record.iterator();
        JsMapIterator::from_object(map_iterator_object.clone())
    }
}

impl From<JsMap> for JsObject {
    #[inline]
    fn from(o: JsMap) -> Self {
        o.inner.clone()
    }
}

impl From<JsMap> for JsValue {
    #[inline]
    fn from(o: JsMap) -> Self {
        o.inner.clone().into()
    }
}

impl Deref for JsMap {
    type Target = JsObject;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsMap {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object() {
            Self::from_object(o.clone())
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not a Map object")
                .into())
        }
    }
}
