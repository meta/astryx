//! Boa's implementation of ECMAScript's `WeakSet` builtin object.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-weakset-objects
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet

use crate::{
    Context, JsArgs, JsResult, JsString, JsValue,
    builtins::{BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_error, js_string,
    object::{ErasedVTableObject, JsObject, internal_methods::get_prototype_from_constructor},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
};
use boa_gc::{Finalize, Trace};

use super::iterable::IteratorHint;

pub(crate) type NativeWeakSet = boa_gc::WeakMap<ErasedVTableObject, ()>;

#[derive(Debug, Trace, Finalize)]
pub(crate) struct WeakSet;

impl IntrinsicObject for WeakSet {
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
            .method(Self::add, js_string!("add"), 1)
            .method(Self::delete, js_string!("delete"), 1)
            .method(Self::has, js_string!("has"), 1)
            .build();
    }
}

impl BuiltInObject for WeakSet {
    const NAME: JsString = StaticJsStrings::WEAK_SET;

    const ATTRIBUTE: Attribute = Attribute::WRITABLE.union(Attribute::CONFIGURABLE);
}

impl BuiltInConstructor for WeakSet {
    /// The amount of arguments the `WeakSet` constructor takes.
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 4;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::weak_set;

    /// `WeakSet ( [ iterable ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-weakset-iterable
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet/WeakSet
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(js_error!(TypeError: "WeakSet: cannot call constructor without `new`"));
        }

        // 2. Let set be ? OrdinaryCreateFromConstructor(NewTarget, "%WeakSet.prototype%", « [[WeakSetData]] »).
        // 3. Set set.[[WeakSetData]] to a new empty List.
        let prototype =
            get_prototype_from_constructor(new_target, StandardConstructors::weak_set, context)?;
        let weak_set = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            NativeWeakSet::new(),
        )
        .upcast();

        // 4. If iterable is either undefined or null, return set.
        let iterable = args.get_or_undefined(0);
        if iterable.is_null_or_undefined() {
            return Ok(weak_set.into());
        }

        // 5. Let adder be ? Get(set, "add").
        let adder = weak_set.get(js_string!("add"), context)?;

        // 6. If IsCallable(adder) is false, throw a TypeError exception.
        let adder = adder
            .as_callable()
            .ok_or_else(|| js_error!(TypeError: "WeakSet: 'add' is not a function"))?;

        // 7. Let iteratorRecord be ? GetIterator(iterable, sync).
        let mut iterator_record = iterable.clone().get_iterator(IteratorHint::Sync, context)?;

        // 8. Repeat,
        //     a. Let next be ? IteratorStepValue(iteratorRecord).
        while let Some(next) = iterator_record.step_value(context)? {
            //     c. Let status be Completion(Call(adder, set, « next »)).
            if let Err(status) = adder.call(&weak_set.clone().into(), &[next], context) {
                //     d. IfAbruptCloseIterator(status, iteratorRecord).
                return iterator_record.close(Err(status), context);
            }
        }

        //     b. If next is done, return set.
        Ok(weak_set.into())
    }
}

impl WeakSet {
    /// `WeakSet.prototype.add( value )`
    ///
    /// The `add()` method appends a new object to the end of a `WeakSet` object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-weakset.prototype.add
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet/add
    pub(crate) fn add(
        this: &JsValue,
        args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let S be the this value.
        // 2. Perform ? RequireInternalSlot(S, [[WeakSetData]]).
        let object = this.as_object();
        let mut set = object
            .as_ref()
            .and_then(JsObject::downcast_mut::<NativeWeakSet>)
            .ok_or_else(|| {
                js_error!(TypeError:
                    "WeakSet.prototype.add: expected 'this' to be a WeakSet object")
            })?;

        // 3. If Type(value) is not Object, throw a TypeError exception.
        let value = args.get_or_undefined(0);
        let Some(value) = value.as_object() else {
            return Err(js_error!(TypeError: "Invalid value used in weak set"));
        };

        // 4. Let entries be the List that is S.[[WeakSetData]].
        // 5. For each element e of entries, do
        if set.contains_key(value.inner()) {
            // a. If e is not empty and SameValue(e, value) is true, then
            // i. Return S.
            return Ok(this.clone());
        }

        // 6. Append value as the last element of entries.
        set.insert(value.inner(), ());

        // 7. Return S.
        Ok(this.clone())
    }

    /// `WeakSet.prototype.delete( value )`
    ///
    /// The `delete()` method removes the specified element from a `WeakSet` object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-weakset.prototype.delete
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet/delete
    pub(crate) fn delete(
        this: &JsValue,
        args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let S be the this value.
        // 2. Perform ? RequireInternalSlot(S, [[WeakSetData]]).
        let object = this.as_object();
        let mut set = object
            .as_ref()
            .and_then(JsObject::downcast_mut::<NativeWeakSet>)
            .ok_or_else(|| {
                js_error!(TypeError:
                    "WeakSet.prototype.delete: expected 'this' to be a WeakSet object",
                )
            })?;

        // 3. If Type(value) is not Object, return false.
        let value = args.get_or_undefined(0);
        let Some(value) = value.as_object() else {
            return Ok(false.into());
        };

        // 4. Let entries be the List that is S.[[WeakSetData]].
        // 5. For each element e of entries, do
        // a. If e is not empty and SameValue(e, value) is true, then
        // i. Replace the element of entries whose value is e with an element whose value is empty.
        // ii. Return true.
        // 6. Return false.
        Ok(set.remove(value.inner()).into())
    }

    /// `WeakSet.prototype.has( value )`
    ///
    /// The `has()` method returns a boolean indicating whether an object exists in a `WeakSet` or not.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-weakset.prototype.has
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet/has
    pub(crate) fn has(
        this: &JsValue,
        args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let S be the this value.
        // 2. Perform ? RequireInternalSlot(S, [[WeakSetData]]).
        let object = this.as_object();
        let set = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<NativeWeakSet>)
            .ok_or_else(|| {
                js_error!(TypeError:
                    "WeakSet.prototype.has: expected 'this' to be a WeakSet object")
            })?;

        // 3. Let entries be the List that is S.[[WeakSetData]].
        // 4. If Type(value) is not Object, return false.
        let value = args.get_or_undefined(0);
        let Some(value) = value.as_object() else {
            return Ok(false.into());
        };

        // 5. For each element e of entries, do
        // a. If e is not empty and SameValue(e, value) is true, return true.
        // 6. Return false.
        Ok(set.contains_key(value.inner()).into())
    }
}

#[cfg(test)]
mod tests;
