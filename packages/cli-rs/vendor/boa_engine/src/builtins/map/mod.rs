//! Boa's implementation of ECMAScript's global `Map` object.
//!
//! The ECMAScript `Map` class is a global object that is used in the construction of maps; which
//! are high-level, key-value stores.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-map-objects
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map

use crate::{
    Context, JsArgs, JsResult, JsString, JsValue,
    builtins::{BuiltInObject, iterable::IteratorHint, map::ordered_map::MapLock},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    error::JsNativeError,
    js_error, js_string,
    object::{JsFunction, JsObject, internal_methods::get_prototype_from_constructor},
    property::{Attribute, PropertyNameKind},
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
};

use super::{
    BuiltInBuilder, BuiltInConstructor, IntrinsicObject, canonicalize_keyed_collection_key,
    iterable::if_abrupt_close_iterator,
};

mod map_iterator;
pub(crate) use map_iterator::MapIterator;

pub mod ordered_map;
use ordered_map::OrderedMap;

#[cfg(test)]
mod tests;

#[derive(Debug, Clone)]
pub(crate) struct Map;

impl IntrinsicObject for Map {
    fn init(realm: &Realm) {
        let get_species = BuiltInBuilder::callable(realm, Self::get_species)
            .name(js_string!("get [Symbol.species]"))
            .build();

        let get_size = BuiltInBuilder::callable(realm, Self::get_size)
            .name(js_string!("get size"))
            .build();

        let entries_function = BuiltInBuilder::callable(realm, Self::entries)
            .name(js_string!("entries"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_method(Self::group_by, js_string!("groupBy"), 2)
            .static_accessor(
                JsSymbol::species(),
                Some(get_species),
                None,
                Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("entries"),
                entries_function.clone(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                JsSymbol::iterator(),
                entries_function,
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                JsSymbol::to_string_tag(),
                Self::NAME,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .method(Self::clear, js_string!("clear"), 0)
            .method(Self::delete, js_string!("delete"), 1)
            .method(Self::for_each, js_string!("forEach"), 1)
            .method(Self::get, js_string!("get"), 1)
            .method(Self::has, js_string!("has"), 1)
            .method(Self::keys, js_string!("keys"), 0)
            .method(Self::set, js_string!("set"), 2)
            .method(Self::values, js_string!("values"), 0)
            .method(Self::get_or_insert, js_string!("getOrInsert"), 2)
            .method(
                Self::get_or_insert_computed,
                js_string!("getOrInsertComputed"),
                2,
            )
            .accessor(
                js_string!("size"),
                Some(get_size),
                None,
                Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for Map {
    const NAME: JsString = StaticJsStrings::MAP;
}

impl BuiltInConstructor for Map {
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 15;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 3;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::map;

    /// `Map ( [ iterable ] )`
    ///
    /// Constructor for `Map` objects.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-map-iterable
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/Map
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(js_error!(
                TypeError: "cannot call `Map` constructor without new"
            ));
        }

        // 2. Let map be ? OrdinaryCreateFromConstructor(NewTarget, "%Map.prototype%", « [[MapData]] »).
        // 3. Set map.[[MapData]] to a new empty List.
        let prototype =
            get_prototype_from_constructor(new_target, StandardConstructors::map, context)?;
        let map = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            <OrderedMap<JsValue>>::new(),
        )
        .upcast();

        // 4. If iterable is either undefined or null, return map.
        let iterable = match args.get_or_undefined(0) {
            val if !val.is_null_or_undefined() => val,
            _ => return Ok(map.into()),
        };

        // 5. Let adder be ? Get(map, "set").
        // 6. If IsCallable(adder) is false, throw a TypeError exception.
        let adder = map
            .get(js_string!("set"), context)?
            .as_function()
            .ok_or_else(
                || js_error!(TypeError: "constructor `Map` cannot use non-callable adder"),
            )?;

        // 7. Return ? AddEntriesFromIterable(map, iterable, adder).
        add_entries_from_iterable(&map, iterable, &adder, context)
    }
}

impl Map {
    /// `get Map [ @@species ]`
    ///
    /// The `Map [ @@species ]` accessor property returns the Map constructor.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-map-@@species
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/@@species
    #[allow(clippy::unnecessary_wraps)]
    fn get_species(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Return the this value.
        Ok(this.clone())
    }

    /// `Map.prototype.entries()`
    ///
    /// Returns a new Iterator object that contains the [key, value] pairs for each element in the Map object in insertion order.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-map.prototype.entries
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries
    pub(crate) fn entries(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        let this = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(
                    TypeError: "method `Map.prototype.entries` called on incompatible receiver"
                )
            })?;

        // 2. Return ? CreateMapIterator(M, key+value).
        Ok(MapIterator::create_map_iterator(
            this,
            PropertyNameKind::KeyAndValue,
            context,
        ))
    }

    /// `Map.prototype.keys()`
    ///
    /// Returns a new Iterator object that contains the keys for each element in the Map object in insertion order.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-map.prototype.keys
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys
    pub(crate) fn keys(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        let this = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| js_error!(TypeError: "method `Map.prototype.keys` called on incompatible receiver"))?;

        // 2. Return ? CreateMapIterator(M, key).
        Ok(MapIterator::create_map_iterator(
            this,
            PropertyNameKind::Key,
            context,
        ))
    }

    /// `Map.prototype.set( key, value )`
    ///
    /// Inserts a new entry in the Map object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-map.prototype.set
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/set
    pub(crate) fn set(this: &JsValue, args: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let value = args.get_or_undefined(1);

        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[MapData]]).
        let map = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(TypeError: "method `Map.prototype.set` called on incompatible receiver")
            })?;

        // 3. Set key to CanonicalizeKeyedCollectionKey(key).
        let key = canonicalize_keyed_collection_key(args.get_or_undefined(0).clone());

        // 4. For each Record { [[Key]], [[Value]] } p of entries, do
        //    a. If p.[[Key]] is not empty and SameValueZero(p.[[Key]], key) is true, then
        //       i. Set p.[[Value]] to value.
        // 5. Let p be the Record { [[Key]]: key, [[Value]]: value }.
        // 6. Append p to M.[[MapData]].
        map.borrow_mut().data_mut().insert(key, value.clone());

        // 7. Return M.
        Ok(this.clone())
    }

    /// `get Map.prototype.size`
    ///
    /// Obtains the size of the map, filtering empty keys to ensure it updates
    /// while iterating.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-map.prototype.size
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/size
    pub(crate) fn get_size(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[MapData]]).
        // 3. Let entries be the List that is M.[[MapData]].
        // 4. Let count be 0.
        // 5. For each Record { [[Key]], [[Value]] } p of entries, do
        // a. If p.[[Key]] is not empty, set count to count + 1.
        // 6. Return 𝔽(count).
        Ok(this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(TypeError: "method `Map.prototype.set` called on incompatible receiver")
            })?
            .borrow()
            .data()
            .len()
            .into())
    }

    /// `Map.prototype.delete( key )`
    ///
    /// Removes the element associated with the key, if it exists.
    /// Returns true if there was an element, and false otherwise.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-map.prototype.delete
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/delete
    pub(crate) fn delete(this: &JsValue, args: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[MapData]]).
        let map = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(TypeError: "method `Map.prototype.delete` called on incompatible receiver")
            })?;

        // 3. Set key to CanonicalizeKeyedCollectionKey(key).
        let key = canonicalize_keyed_collection_key(args.get_or_undefined(0).clone());

        // 4. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
        //    a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, then
        //       i. Set p.[[Key]] to empty.
        //       ii. Set p.[[Value]] to empty.
        //       iii. Return true.
        // 5. Return false.
        Ok(map.borrow_mut().data_mut().remove(&key).is_some().into())
    }

    /// `Map.prototype.get( key )`
    ///
    /// Returns the value associated with the key, or undefined if there is none.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-map.prototype.get
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/get
    pub(crate) fn get(this: &JsValue, args: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[MapData]]).
        let map = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(TypeError: "method `Map.prototype.get` called on incompatible receiver")
            })?;

        // 3. Set key to CanonicalizeKeyedCollectionKey(key).
        let key = canonicalize_keyed_collection_key(args.get_or_undefined(0).clone());

        // 4. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
        //    a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, return p.[[Value]].
        // 5. Return undefined.
        Ok(map.borrow().data().get(&key).cloned().unwrap_or_default())
    }

    /// `Map.prototype.clear( )`
    ///
    /// Removes all entries from the map.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-map.prototype.clear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/clear
    pub(crate) fn clear(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[MapData]]).
        let map = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(
                    TypeError: "method `Map.prototype.clear` called on incompatible receiver"
                )
            })?;

        // 3. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
        //    a. Set p.[[Key]] to empty.
        //    b. Set p.[[Value]] to empty.
        map.borrow_mut().data_mut().clear();

        // 4. Return undefined.
        Ok(JsValue::undefined())
    }

    /// `Map.prototype.has( key )`
    ///
    /// Checks if the map contains an entry with the given key.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-map.prototype.has
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/has
    pub(crate) fn has(this: &JsValue, args: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[MapData]]).
        let map = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(
                    TypeError: "method `Map.prototype.has` called on incompatible receiver"
                )
            })?;

        // 3. Set key to CanonicalizeKeyedCollectionKey(key).
        let key = canonicalize_keyed_collection_key(args.get_or_undefined(0).clone());

        // 4. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
        //    a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, return true.
        // 5. Return false.
        Ok(map.borrow().data().contains_key(&key).into())
    }

    /// `Map.prototype.forEach( callbackFn [ , thisArg ] )`
    ///
    /// Executes the provided callback function for each key-value pair in the map.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-map.prototype.foreach
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/forEach
    pub(crate) fn for_each(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[MapData]]).
        let map = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(
                    TypeError: "method `Map.prototype.forEach` called on incompatible receiver"
                )
            })?;

        // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let Some(callback) = args.get_or_undefined(0).as_callable() else {
            return Err(crate::v8_messages::callback_not_function(args.get_or_undefined(0)).into());
        };

        let this_arg = args.get_or_undefined(1);

        // NOTE:
        //
        // forEach does not directly mutate the object on which it is called but
        // the object may be mutated by the calls to callbackfn. Each entry of a
        // map's [[MapData]] is only visited once. New keys added after the call
        // to forEach begins are visited. A key will be revisited if it is deleted
        // after it has been visited and then re-added before the forEach call completes.
        // Keys that are deleted after the call to forEach begins and before being visited
        // are not visited unless the key is added again before the forEach call completes.
        let _lock = MapLock::new(&map);

        // 4. Let entries be the List that is M.[[MapData]].
        // 5. For each Record { [[Key]], [[Value]] } e of entries, do
        let mut index = 0;
        loop {
            let arguments = {
                let map = map.borrow();
                let map = map.data();
                if index < map.full_len() {
                    map.get_index(index)
                        .map(|(k, v)| [v.clone(), k.clone(), this.clone()])
                } else {
                    // 6. Return undefined.
                    return Ok(JsValue::undefined());
                }
            };

            // a. If e.[[Key]] is not empty, then
            if let Some(arguments) = arguments {
                // i. Perform ? Call(callbackfn, thisArg, « e.[[Value]], e.[[Key]], M »).
                callback.call(this_arg, &arguments, context)?;
            }

            index += 1;
        }
    }

    /// Call `f` for each `(key, value)` in the `Map`.
    ///
    /// Can not be used in [`Self::for_each`] because in that case will be
    /// incorrect order for next steps of the algo:
    /// ```txt
    /// 2. Perform ? RequireInternalSlot(M, [[MapData]]).
    /// 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
    /// ```
    pub(crate) fn for_each_native<F>(this: &JsValue, mut f: F) -> JsResult<()>
    where
        F: FnMut(JsValue, JsValue) -> JsResult<()>,
    {
        // See `Self::for_each` for comments on the algo.

        let map = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(
                    TypeError: "method `Map.prototype.forEach` called on incompatible receiver"
                )
            })?;

        let _lock = MapLock::new(&map);

        let mut index = 0;
        loop {
            let (k, v) = {
                let map = map.borrow();
                let map = map.data();
                if index >= map.full_len() {
                    return Ok(());
                }

                let Some((k, v)) = map.get_index(index) else {
                    continue;
                };

                (k.clone(), v.clone())
            };

            f(k, v)?;
            index += 1;
        }
    }

    /// `Map.prototype.values()`
    ///
    /// Returns a new Iterator object that contains the values for each element in the Map object in insertion order.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-map.prototype.values
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/values
    pub(crate) fn values(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Return ? CreateMapIterator(M, value).
        let this = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(
                    TypeError: "method `Map.prototype.values` called on incompatible receiver"
                )
            })?;

        Ok(MapIterator::create_map_iterator(
            this,
            PropertyNameKind::Value,
            context,
        ))
    }

    /// `Map.prototype.getOrInsert(key, value)`
    ///
    /// Given a key and a value, the getOrInsert method will return the existing value if it exists.
    /// Otherwise insert the provided default value and return that value.
    ///
    /// More information:
    ///  - [Upsert proposal reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-upsert/#sec-map.prototype.getOrInsert
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/getOrInsert
    pub(crate) fn get_or_insert(
        this: &JsValue,
        args: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        let value = args.get_or_undefined(1);

        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[MapData]]).
        let map = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(
                    TypeError: "method `Map.prototype.getOrInsert` called on incompatible receiver"
                )
            })?;

        // 3. Set key to CanonicalizeKeyedCollectionKey(key).
        let key = canonicalize_keyed_collection_key(args.get_or_undefined(0).clone());

        // 4. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
        if let Some(existing) = map.borrow().data().get(&key) {
            // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, return p.[[Value]].
            return Ok(existing.clone());
        }

        // 5. Let p be the Record { [[Key]]: key, [[Value]]: value }.
        // 6. Append p to M.[[MapData]].
        map.borrow_mut().data_mut().insert(key, value.clone());

        // 7. Return value.
        Ok(value.clone())
    }

    /// `Map.prototype.getOrInsertComputed(key, callback)`
    ///
    /// If the key exists in the Map, returns the existing value.
    /// Otherwise computes a new value by calling `callback` with the key,
    /// inserts it into the Map, and returns it.
    ///
    /// More information:
    ///  - [Upsert proposal reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-upsert/#sec-map.prototype.getOrInsertComputed
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/getOrInsertComputed
    pub(crate) fn get_or_insert_computed(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[MapData]]).
        let map = this
            .as_object()
            .and_then(|o| o.downcast::<OrderedMap<JsValue>>().ok())
            .ok_or_else(|| {
                js_error!(
                    TypeError: "method `Map.prototype.getOrInsertComputed` called on incompatible receiver"
                )
            })?;

        // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let Some(callback_fn) = args.get_or_undefined(1).as_callable() else {
            return Err(js_error!(
                TypeError: "method `Map.prototype.getOrInsertComputed` called with non-callable callback function"
            ));
        };

        // 4. Set key to CanonicalizeKeyedCollectionKey(key).
        let key = canonicalize_keyed_collection_key(args.get_or_undefined(0).clone());

        // 5. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
        if let Some(existing) = map.borrow().data().get(&key) {
            // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, return p.[[Value]].
            return Ok(existing.clone());
        }

        // 6. Let value be ? Call(callback, undefined, « key »).
        // 7. NOTE: The Map may have been modified during execution of callback.
        let value = callback_fn.call(&JsValue::undefined(), std::slice::from_ref(&key), context)?;

        // 8. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
        //    a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, then
        //       i. Set p.[[Value]] to value.
        //       ii. Return value.
        // 9. Let p be the Record { [[Key]]: key, [[Value]]: value }.
        // 10. Append p to M.[[MapData]].
        // [`OrderedMap::insert`] handles both cases
        map.borrow_mut()
            .data_mut()
            .insert(key.clone(), value.clone());
        // 11. Return value.
        Ok(value)
    }

    /// [`Map.groupBy ( items, callbackfn )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-map.groupby
    pub(crate) fn group_by(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        use std::hash::BuildHasherDefault;

        use indexmap::IndexMap;
        use rustc_hash::FxHasher;

        use crate::builtins::{Array, Number, iterable::if_abrupt_close_iterator};

        let items = args.get_or_undefined(0);
        let callback = args.get_or_undefined(1);
        // 1. Let groups be ? GroupBy(items, callbackfn, zero).

        // `GroupBy`
        // https://tc39.es/ecma262/#sec-groupby
        // inlined to change the key type.

        // 1. Perform ? RequireObjectCoercible(items).
        items.require_object_coercible()?;

        // 2. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback = callback.as_callable().ok_or_else(|| {
            js_error!(
                TypeError:
                    "method `Map.prototype.groupBy` called with non-callable callback function"
            )
        })?;

        // 3. Let groups be a new empty List.
        let mut groups: IndexMap<JsValue, Vec<JsValue>, BuildHasherDefault<FxHasher>> =
            IndexMap::default();

        // 4. Let iteratorRecord be ? GetIterator(items, sync).
        let mut iterator = items.get_iterator(IteratorHint::Sync, context)?;

        // 5. Let k be 0.
        let mut k = 0u64;

        // 6. Repeat,
        loop {
            // a. If k ≥ 2^53 - 1, then
            if k >= Number::MAX_SAFE_INTEGER as u64 {
                // i. Let error be ThrowCompletion(a newly created TypeError object).
                let error = JsNativeError::typ()
                    .with_message("exceeded maximum safe integer")
                    .into();

                // ii. Return ? IteratorClose(iteratorRecord, error).
                return iterator.close(Err(error), context);
            }

            // b. Let next be ? IteratorStepValue(iteratorRecord).
            let Some(next) = iterator.step_value(context)? else {
                // c. If next is false, then
                // i. Return groups.
                break;
            };

            // d. Let value be next.
            let value = next;

            // e. Let key be Completion(Call(callbackfn, undefined, « value, 𝔽(k) »)).
            let key = callback.call(&JsValue::undefined(), &[value.clone(), k.into()], context);

            // f. IfAbruptCloseIterator(key, iteratorRecord).
            let key = if_abrupt_close_iterator!(key, iterator, context);

            // h. Else,
            //     i. Assert: keyCoercion is collection.
            //     ii. Set key to CanonicalizeKeyedCollectionKey(key).
            let key = canonicalize_keyed_collection_key(key);

            // i. Perform AddValueToKeyedGroup(groups, key, value).
            groups.entry(key).or_default().push(value);

            // j. Set k to k + 1.
            k += 1;
        }

        // 2. Let map be ! Construct(%Map%).
        let mut map: OrderedMap<JsValue> = OrderedMap::new();

        // 3. For each Record { [[Key]], [[Elements]] } g of groups, do
        for (key, elements) in groups {
            // a. Let elements be CreateArrayFromList(g.[[Elements]]).
            let elements = Array::create_array_from_list(elements, context);

            // b. Let entry be the Record { [[Key]]: g.[[Key]], [[Value]]: elements }.
            // c. Append entry to map.[[MapData]].
            map.insert(key, elements.into());
        }

        let proto = context.intrinsics().constructors().map().prototype();

        // 4. Return map.
        Ok(
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), proto, map)
                .into(),
        )
    }
}

/// `AddEntriesFromIterable`
///
/// Allows adding entries to a map from any object that has a `@@Iterator` field.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-add-entries-from-iterable
pub(crate) fn add_entries_from_iterable(
    target: &JsObject,
    iterable: &JsValue,
    adder: &JsFunction,
    context: &mut Context,
) -> JsResult<JsValue> {
    // 1. Let iteratorRecord be ? GetIterator(iterable, sync).
    let mut iterator_record = iterable.get_iterator(IteratorHint::Sync, context)?;

    // 2. Repeat,
    //     a. Let next be ? IteratorStepValue(iteratorRecord).
    //     b. If next is done, return target.
    while let Some(next) = iterator_record.step_value(context)? {
        let Some(next) = next.as_object() else {
            //     c. If next is not an Object, then
            //         i. Let error be ThrowCompletion(a newly created TypeError object).
            //         ii. Return ? IteratorClose(iteratorRecord, error).
            let err = Err(JsNativeError::typ()
                .with_message("cannot get key and value from primitive item of `iterable`")
                .into());

            // ii. Return ? IteratorClose(iteratorRecord, error).
            return iterator_record.close(err, context);
        };

        //     d. Let k be Completion(Get(next, "0")).
        //     e. IfAbruptCloseIterator(k, iteratorRecord).
        let key = if_abrupt_close_iterator!(next.get(0, context), iterator_record, context);

        //     f. Let v be Completion(Get(next, "1")).
        //     g. IfAbruptCloseIterator(v, iteratorRecord).
        let value = if_abrupt_close_iterator!(next.get(1, context), iterator_record, context);

        //     h. Let status be Completion(Call(adder, target, « k, v »)).
        //     i. IfAbruptCloseIterator(status, iteratorRecord).
        let status = adder.call(&target.clone().into(), &[key, value], context);
        if_abrupt_close_iterator!(status, iterator_record, context);
    }

    Ok(target.clone().into())
}
