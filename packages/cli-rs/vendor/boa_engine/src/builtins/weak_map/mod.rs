//! Boa's implementation of ECMAScript's `WeakMap` builtin object.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-weakmap-objects
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap

use crate::{
    Context, JsArgs, JsResult, JsString, JsValue,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        map::add_entries_from_iterable,
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_error, js_string,
    object::{ErasedVTableObject, JsObject, internal_methods::get_prototype_from_constructor},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
};
use boa_gc::{Finalize, Trace};

pub(crate) type NativeWeakMap = boa_gc::WeakMap<ErasedVTableObject, JsValue>;

#[derive(Debug, Trace, Finalize)]
pub(crate) struct WeakMap;

#[cfg(test)]
mod tests;

impl IntrinsicObject for WeakMap {
    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }

    fn init(realm: &Realm) {
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .property(
                JsSymbol::to_string_tag(),
                Self::NAME,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .method(Self::delete, js_string!("delete"), 1)
            .method(Self::get, js_string!("get"), 1)
            .method(Self::has, js_string!("has"), 1)
            .method(Self::set, js_string!("set"), 2)
            .method(Self::get_or_insert, js_string!("getOrInsert"), 2)
            .method(
                Self::get_or_insert_computed,
                js_string!("getOrInsertComputed"),
                2,
            )
            .build();
    }
}

impl BuiltInObject for WeakMap {
    const NAME: JsString = StaticJsStrings::WEAK_MAP;

    const ATTRIBUTE: Attribute = Attribute::WRITABLE.union(Attribute::CONFIGURABLE);
}

impl BuiltInConstructor for WeakMap {
    /// The amount of arguments the `WeakMap` constructor takes.
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 7;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::weak_map;

    /// `WeakMap ( [ iterable ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-weakmap-iterable
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/WeakMap
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(js_error!(TypeError: "WeakMap: cannot call constructor without `new`"));
        }

        // 2. Let map be ? OrdinaryCreateFromConstructor(NewTarget, "%WeakMap.prototype%", « [[WeakMapData]] »).
        // 3. Set map.[[WeakMapData]] to a new empty List.
        let prototype =
            get_prototype_from_constructor(new_target, StandardConstructors::weak_map, context)?;
        let map = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            NativeWeakMap::new(),
        )
        .upcast();

        // 4. If iterable is either undefined or null, return map.
        let iterable = args.get_or_undefined(0);
        if iterable.is_null_or_undefined() {
            return Ok(map.into());
        }

        // 5. Let adder be ? Get(map, "set").
        // 6. If IsCallable(adder) is false, throw a TypeError exception.
        let adder = map
            .get(js_string!("set"), context)?
            .as_function()
            .ok_or_else(|| js_error!(TypeError: "WeakMap: 'add' is not a function"))?;

        // 7. Return ? AddEntriesFromIterable(map, iterable, adder).
        add_entries_from_iterable(&map, iterable, &adder, context)
    }
}

impl WeakMap {
    /// `WeakMap.prototype.delete ( key )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-weakmap.prototype.delete
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/delete
    pub(crate) fn delete(
        this: &JsValue,
        args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[WeakMapData]]).
        let object = this.as_object();
        let mut map = object
            .as_ref()
            .and_then(JsObject::downcast_mut::<NativeWeakMap>)
            .ok_or_else(|| {
                js_error!(TypeError:
                    "WeakMap.prototype.delete: expected 'this' to be a WeakMap object",
                )
            })?;

        // 3. Let entries be M.[[WeakMapData]].
        // 4. If key is not an Object, return false.
        let Some(key) = args.get_or_undefined(0).as_object() else {
            return Ok(false.into());
        };

        // 5. For each Record { [[Key]], [[Value]] } p of entries, do
        // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, then
        // i. Set p.[[Key]] to empty.
        // ii. Set p.[[Value]] to empty.
        // iii. Return true.
        // 6. Return false.
        Ok(map.remove(key.inner()).into())
    }

    /// `WeakMap.prototype.get ( key )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-weakmap.prototype.get
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/get
    pub(crate) fn get(
        this: &JsValue,
        args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[WeakMapData]]).
        let object = this.as_object();
        let map = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<NativeWeakMap>)
            .ok_or_else(|| {
                js_error!(TypeError:
                    "WeakMap.prototype.get: expected 'this' to be a WeakMap object")
            })?;

        // 3. Let entries be M.[[WeakMapData]].
        // 4. If key is not an Object, return undefined.
        let Some(key) = args.get_or_undefined(0).as_object() else {
            return Ok(JsValue::undefined());
        };

        // 5. For each Record { [[Key]], [[Value]] } p of entries, do
        // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, return p.[[Value]].
        // 6. Return undefined.
        if let Some(entry) = map.get(key.inner())
            && let Some(val) = entry.value()
        {
            Ok(val.clone())
        } else {
            Ok(JsValue::undefined())
        }
    }

    /// `WeakMap.prototype.has ( key )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-weakmap.prototype.has
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/has
    pub(crate) fn has(
        this: &JsValue,
        args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[WeakMapData]]).
        let object = this.as_object();
        let map = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<NativeWeakMap>)
            .ok_or_else(|| {
                js_error!(TypeError:
                    "WeakMap.prototype.has: expected 'this' to be a WeakMap object")
            })?;

        // 3. Let entries be M.[[WeakMapData]].
        // 4. If key is not an Object, return false.
        let Some(key) = args.get_or_undefined(0).as_object() else {
            return Ok(false.into());
        };

        // 5. For each Record { [[Key]], [[Value]] } p of entries, do
        // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, return true.
        // 6. Return false.
        Ok(map.contains_key(key.inner()).into())
    }

    /// `WeakMap.prototype.set ( key, value )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-weakmap.prototype.set
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/set
    pub(crate) fn set(
        this: &JsValue,
        args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[WeakMapData]]).
        let object = this.as_object();
        let mut map = object
            .as_ref()
            .and_then(JsObject::downcast_mut::<NativeWeakMap>)
            .ok_or_else(|| {
                js_error!(TypeError:
                    "WeakMap.prototype.set: expected 'this' to be a WeakMap object")
            })?;

        // 3. Let entries be M.[[WeakMapData]].
        // 4. If key is not an Object, throw a TypeError exception.
        let key = args.get_or_undefined(0);
        let Some(key) = key.as_object() else {
            return Err(js_error!(TypeError: "Invalid value used as weak map key"));
        };

        // 5. For each Record { [[Key]], [[Value]] } p of entries, do
        // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, then
        // i. Set p.[[Value]] to value.
        // ii. Return M.
        // 6. Let p be the Record { [[Key]]: key, [[Value]]: value }.
        // 7. Append p to entries.
        map.insert(key.inner(), args.get_or_undefined(1).clone());

        // 8. Return M.
        Ok(this.clone())
    }

    /// `WeakMap.prototype.getOrInsert ( key, value )`
    ///
    /// Given a key and a value, returns the existing value if it exists; otherwise inserts the
    /// provided default value and returns that value.
    ///
    /// More information:
    ///  - [Upsert proposal reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-upsert/#sec-weakmap.prototype.getOrInsert
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/getOrInsert
    pub(crate) fn get_or_insert(
        this: &JsValue,
        args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[WeakMapData]]).
        let object = this.as_object();
        let map = object
            .and_then(|obj| obj.clone().downcast::<NativeWeakMap>().ok())
            .ok_or_else(|| {
                js_error!(TypeError:
                    "WeakMap.prototype.getOrInsert: expected 'this' to be a WeakMap object",
                )
            })?;

        // 3. If CanBeHeldWeakly(key) is false, throw a TypeError exception.
        // TODO: Implement proper CanBeHeldWeakly once available. For now, only
        //       objects are accepted as keys; symbols should be allowed in the
        //       future according to the proposal.
        let key_val = args.get_or_undefined(0);
        let Some(key) = key_val.as_object() else {
            return Err(js_error!(TypeError:
                "WeakMap.getOrInsert: expected target argument of type `object`, got target of type `{}`",
                key_val.type_of()
            ));
        };

        // 4. For each Record { [[Key]], [[Value]] } p of M.[[WeakMapData]]
        if let Some(existing) = map.borrow().data().get(key.inner())
            && let Some(value) = existing.value()
        {
            // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, return p.[[Value]].
            return Ok(value.clone());
        }

        // 5-6. Insert the new record with provided value and return it.
        let value = args.get_or_undefined(1).clone();
        map.borrow_mut()
            .data_mut()
            .insert(key.inner(), value.clone());
        Ok(value)
    }

    /// `WeakMap.prototype.getOrInsertComputed ( key, callback )`
    ///
    /// If the key exists, returns the existing value. Otherwise computes a new value by calling
    /// `callback` with the key, inserts it into the `WeakMap`, and returns it.
    ///
    /// More information:
    ///  - [Upsert proposal reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-upsert/#sec-weakmap.prototype.getOrInsertComputed
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/getOrInsertComputed
    pub(crate) fn get_or_insert_computed(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let M be the this value.
        // 2. Perform ? RequireInternalSlot(M, [[WeakMapData]]).
        let object = this.as_object();
        let map = object
            .and_then(|obj| obj.clone().downcast::<NativeWeakMap>().ok())
            .ok_or_else(|| {
                js_error!(TypeError:
                    "WeakMap.prototype.getOrInsertComputed: expected 'this' to be a WeakMap object",
                )
            })?;

        // 3. If CanBeHeldWeakly(key) is false, throw a TypeError exception.
        // TODO: Implement proper CanBeHeldWeakly once available. For now, only
        //       objects are accepted as keys; symbols should be allowed in the
        //       future according to the proposal.
        let key_value = args.get_or_undefined(0).clone();
        let Some(key_obj) = key_value.as_object() else {
            return Err(js_error!(TypeError:
                "WeakMap.getOrInsertComputed: expected target argument of type `object`, got target of type `{}`",
                key_value.type_of()
            ));
        };

        // 4. If IsCallable(callback) is false, throw a TypeError exception.
        let Some(callback_fn) = args.get_or_undefined(1).as_callable() else {
            return Err(js_error!(TypeError:
                "Method WeakMap.prototype.getOrInsertComputed called with non-callable callback function"
            ));
        };

        // 5. For each Record { [[Key]], [[Value]] } p of M.[[WeakMapData]]
        if let Some(existing) = map.borrow().data().get(key_obj.inner())
            && let Some(value) = existing.value()
        {
            // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, return p.[[Value]].
            return Ok(value.clone());
        }

        // 6. Let value be ? Call(callback, undefined, « key »).
        // 7. NOTE: The WeakMap may have been modified during execution of callback.
        let value = callback_fn.call(
            &JsValue::undefined(),
            std::slice::from_ref(&key_value),
            context,
        )?;

        // 8-10. Insert or update the entry and return value.
        map.borrow_mut()
            .data_mut()
            .insert(key_obj.inner(), value.clone());
        Ok(value)
    }
}
