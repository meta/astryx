//! Boa's implementation of ECMAScript's global `Array` object.
//!
//! The ECMAScript `Array` class is a global object that is used in the construction of arrays; which are high-level, list-like objects.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-array-objects
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array

use boa_gc::{Finalize, Trace};
use thin_vec::ThinVec;

use crate::{
    Context, JsArgs, JsExpect, JsResult, JsString,
    builtins::{BuiltInObject, Number, iterable::if_abrupt_close_iterator},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    error::JsNativeError,
    js_string,
    object::{
        CONSTRUCTOR, IndexedProperties, JsData, JsObject,
        internal_methods::{
            InternalMethodPropertyContext, InternalObjectMethods, ORDINARY_INTERNAL_METHODS,
            get_prototype_from_constructor, ordinary_define_own_property,
            ordinary_get_own_property,
        },
    },
    property::{Attribute, PropertyDescriptor, PropertyKey, PropertyNameKind},
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
    value::{IntegerOrInfinity, JsValue},
};
use std::cmp::{Ordering, min};

use super::{BuiltInBuilder, BuiltInConstructor, IntrinsicObject};

mod array_iterator;
use crate::value::JsVariant;
pub(crate) use array_iterator::ArrayIterator;

#[cfg(feature = "experimental")]
mod from_async;

#[cfg(test)]
mod tests;

/// Direction for `find_via_predicate`
#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) enum Direction {
    Ascending,
    Descending,
}

/// JavaScript `Array` built-in implementation.
#[derive(Debug, Clone, Copy, Trace, Finalize)]
#[boa_gc(empty_trace)]
pub(crate) struct Array;

/// Definitions of the internal object methods for array exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-array-exotic-objects
pub(crate) static ARRAY_EXOTIC_INTERNAL_METHODS: InternalObjectMethods = InternalObjectMethods {
    __define_own_property__: array_exotic_define_own_property,
    ..ORDINARY_INTERNAL_METHODS
};

impl JsData for Array {
    fn internal_methods(&self) -> &'static InternalObjectMethods {
        &ARRAY_EXOTIC_INTERNAL_METHODS
    }
}

impl IntrinsicObject for Array {
    fn init(realm: &Realm) {
        let symbol_iterator = JsSymbol::iterator();
        let symbol_unscopables = JsSymbol::unscopables();

        let get_species = BuiltInBuilder::callable(realm, Self::get_species)
            .name(js_string!("get [Symbol.species]"))
            .build();

        let values_function = BuiltInBuilder::callable_with_object(
            realm,
            realm.intrinsics().objects().array_prototype_values().into(),
            Self::values,
        )
        .name(js_string!("values"))
        .build();

        let to_string_function = BuiltInBuilder::callable_with_object(
            realm,
            realm
                .intrinsics()
                .objects()
                .array_prototype_to_string()
                .into(),
            Self::to_string,
        )
        .name(js_string!("toString"))
        .build();

        let unscopables_object = Self::unscopables_object();

        let builder = BuiltInBuilder::from_standard_constructor::<Self>(realm)
            // Static Methods
            .static_method(Self::from, js_string!("from"), 1)
            .static_method(Self::is_array, js_string!("isArray"), 1)
            .static_method(Self::of, js_string!("of"), 0)
            .static_accessor(
                JsSymbol::species(),
                Some(get_species),
                None,
                Attribute::CONFIGURABLE,
            )
            .property(
                StaticJsStrings::LENGTH,
                0,
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::PERMANENT,
            )
            .method(Self::at, js_string!("at"), 1)
            .method(Self::concat, js_string!("concat"), 1)
            .method(Self::copy_within, js_string!("copyWithin"), 2)
            .method(Self::entries, js_string!("entries"), 0)
            .method(Self::every, js_string!("every"), 1)
            .method(Self::fill, js_string!("fill"), 1)
            .method(Self::filter, js_string!("filter"), 1)
            .method(Self::find, js_string!("find"), 1)
            .method(Self::find_index, js_string!("findIndex"), 1)
            .method(Self::find_last, js_string!("findLast"), 1)
            .method(Self::find_last_index, js_string!("findLastIndex"), 1)
            .method(Self::flat, js_string!("flat"), 0)
            .method(Self::flat_map, js_string!("flatMap"), 1)
            .method(Self::for_each, js_string!("forEach"), 1)
            .method(Self::includes_value, js_string!("includes"), 1)
            .method(Self::index_of, js_string!("indexOf"), 1)
            .method(Self::join, js_string!("join"), 1)
            .method(Self::keys, js_string!("keys"), 0)
            .method(Self::last_index_of, js_string!("lastIndexOf"), 1)
            .method(Self::map, js_string!("map"), 1)
            .method(Self::pop, js_string!("pop"), 0)
            .method(Self::push, js_string!("push"), 1)
            .method(Self::reduce, js_string!("reduce"), 1)
            .method(Self::reduce_right, js_string!("reduceRight"), 1)
            .method(Self::reverse, js_string!("reverse"), 0)
            .method(Self::shift, js_string!("shift"), 0)
            .method(Self::slice, js_string!("slice"), 2)
            .method(Self::some, js_string!("some"), 1)
            .method(Self::sort, js_string!("sort"), 1)
            .method(Self::splice, js_string!("splice"), 2)
            .method(Self::to_locale_string, js_string!("toLocaleString"), 0)
            .method(Self::to_reversed, js_string!("toReversed"), 0)
            .method(Self::to_sorted, js_string!("toSorted"), 1)
            .method(Self::to_spliced, js_string!("toSpliced"), 2)
            .method(Self::unshift, js_string!("unshift"), 1)
            .method(Self::with, js_string!("with"), 2)
            .property(
                js_string!("toString"),
                to_string_function,
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("values"),
                values_function.clone(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                symbol_iterator,
                values_function,
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                symbol_unscopables,
                unscopables_object,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            );

        #[cfg(feature = "experimental")]
        let builder = builder.static_method(Self::from_async, js_string!("fromAsync"), 1);

        builder.build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for Array {
    const NAME: JsString = StaticJsStrings::ARRAY;
}

impl BuiltInConstructor for Array {
    const PROTOTYPE_STORAGE_SLOTS: usize = 41;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 6;

    const CONSTRUCTOR_ARGUMENTS: usize = 1;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::array;

    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // If NewTarget is undefined, let newTarget be the active function object; else let newTarget be NewTarget.
        let new_target = &if new_target.is_undefined() {
            context
                .active_function_object()
                .unwrap_or_else(|| context.intrinsics().constructors().array().constructor())
                .into()
        } else {
            new_target.clone()
        };

        // 2. Let proto be ? GetPrototypeFromConstructor(newTarget, "%Array.prototype%").
        let prototype =
            get_prototype_from_constructor(new_target, StandardConstructors::array, context)?;

        // 3. Let numberOfArgs be the number of elements in values.
        let number_of_args = args.len();

        // 4. If numberOfArgs = 0, then
        if number_of_args == 0 {
            // 4.a. Return ! ArrayCreate(0, proto).
            Ok(Self::array_create(0, Some(prototype), context)?.into())
        // 5. Else if numberOfArgs = 1, then
        } else if number_of_args == 1 {
            // a. Let len be values[0].
            let len = &args[0];
            // b. Let array be ! ArrayCreate(0, proto).
            let array = Self::array_create(0, Some(prototype), context)?;
            // c. If Type(len) is not Number, then
            #[allow(clippy::if_not_else)]
            let int_len = if !len.is_number() {
                // i. Perform ! CreateDataPropertyOrThrow(array, "0", len).
                array
                    .create_data_property_or_throw(0, len.clone(), context)
                    .js_expect("this CreateDataPropertyOrThrow call must not fail")?;
                // ii. Let intLen be 1𝔽.
                1
            // d. Else,
            } else {
                // i. Let intLen be ! ToUint32(len).
                let int_len = len
                    .to_u32(context)
                    .js_expect("this ToUint32 call must not fail")?;
                // ii. If SameValueZero(intLen, len) is false, throw a RangeError exception.
                if !JsValue::same_value_zero(&int_len.into(), len) {
                    return Err(JsNativeError::range()
                        .with_message("Invalid array length")
                        .into());
                }
                int_len
            };
            // e. Perform ! Set(array, "length", intLen, true).
            array
                .set(StaticJsStrings::LENGTH, int_len, true, context)
                .js_expect("this Set call must not fail")?;
            // f. Return array.
            Ok(array.into())
        // 6. Else,
        } else {
            // 6.a. Assert: numberOfArgs ≥ 2.
            debug_assert!(number_of_args >= 2);

            // b. Let array be ? ArrayCreate(numberOfArgs, proto).
            let array = Self::array_create(number_of_args as u64, Some(prototype), context)?;

            // c. Let k be 0.
            // d. Repeat, while k < numberOfArgs,
            //    i. Let Pk be ! ToString(𝔽(k)).
            //    ii. Let itemK be values[k].
            //    iii. Perform ! CreateDataPropertyOrThrow(array, Pk, itemK).
            //    iv. Set k to k + 1.
            array
                .borrow_mut()
                .properties_mut()
                .override_indexed_properties(args.iter().cloned().collect());

            // e. Assert: The mathematical value of array's "length" property is numberOfArgs.
            // f. Return array.
            Ok(array.into())
        }
    }
}

impl Array {
    /// Optimized helper function, that sets the length of the array.
    fn set_length(o: &JsObject, len: u64, context: &mut Context) -> JsResult<()> {
        if o.is_array() && len < (2u64.pow(32) - 1) {
            let mut borrowed_object = o.borrow_mut();
            if borrowed_object.properties().shape.to_addr_usize()
                == context
                    .intrinsics()
                    .templates()
                    .array()
                    .shape()
                    .to_addr_usize()
            {
                // NOTE: The "length" property is the first element.
                borrowed_object.properties_mut().storage[0] = JsValue::new(len);
                return Ok(());
            }
        }

        o.set(StaticJsStrings::LENGTH, len, true, context)?;
        Ok(())
    }

    /// Utility for constructing `Array` objects.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-arraycreate
    pub(crate) fn array_create(
        length: u64,
        prototype: Option<JsObject>,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        // 1. If length > 2^32 - 1, throw a RangeError exception.
        if length > 2u64.pow(32) - 1 {
            return Err(JsNativeError::range()
                .with_message("array exceeded max size")
                .into());
        }

        // Fast path:
        if prototype.is_none() {
            return Ok(context
                .intrinsics()
                .templates()
                .array()
                .create(Array, vec![JsValue::new(length)]));
        }

        // 7. Return A.
        // 2. If proto is not present, set proto to %Array.prototype%.
        // 3. Let A be ! MakeBasicObject(« [[Prototype]], [[Extensible]] »).
        // 4. Set A.[[Prototype]] to proto.
        // 5. Set A.[[DefineOwnProperty]] as specified in 10.4.2.1.
        let prototype =
            prototype.unwrap_or_else(|| context.intrinsics().constructors().array().prototype());

        // Fast path:
        if context
            .intrinsics()
            .templates()
            .array()
            .has_prototype(&prototype)
        {
            return Ok(context
                .intrinsics()
                .templates()
                .array()
                .create(Array, vec![JsValue::new(length)]));
        }

        let array =
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), prototype, Array)
                .upcast();

        // 6. Perform ! OrdinaryDefineOwnProperty(A, "length", PropertyDescriptor { [[Value]]: 𝔽(length), [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: false }).
        ordinary_define_own_property(
            &array,
            &StaticJsStrings::LENGTH.into(),
            PropertyDescriptor::builder()
                .value(length)
                .writable(true)
                .enumerable(false)
                .configurable(false)
                .build(),
            &mut InternalMethodPropertyContext::new(context),
        )?;

        Ok(array)
    }

    /// Utility for constructing `Array` objects from an iterator of `JsValue`s.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-createarrayfromlist
    pub(crate) fn create_array_from_list<I>(elements: I, context: &Context) -> JsObject
    where
        I: IntoIterator<Item = JsValue>,
    {
        // 1. Assert: elements is a List whose elements are all ECMAScript language values.
        // 2. Let array be ! ArrayCreate(0).
        // 3. Let n be 0.
        // 4. For each element e of elements, do
        //     a. Perform ! CreateDataPropertyOrThrow(array, ! ToString(𝔽(n)), e).
        //     b. Set n to n + 1.
        // 5. Return array.
        // NOTE: This deviates from the spec, but it should have the same behaviour.
        let elements: ThinVec<_> = elements.into_iter().collect();
        let length = elements.len();

        context
            .intrinsics()
            .templates()
            .array()
            .create_with_indexed_properties(
                Array,
                vec![JsValue::new(length)],
                IndexedProperties::from_dense_js_value(elements),
            )
    }

    /// Utility function for concatenating array objects.
    ///
    /// Returns a Boolean valued property that if `true` indicates that
    /// an object should be flattened to its array elements
    /// by `Array.prototype.concat`.
    fn is_concat_spreadable(o: &JsValue, context: &mut Context) -> JsResult<bool> {
        // 1. If Type(O) is not Object, return false.
        let Some(o) = o.as_object() else {
            return Ok(false);
        };

        // 2. Let spreadable be ? Get(O, @@isConcatSpreadable).
        let spreadable = o.get(JsSymbol::is_concat_spreadable(), context)?;

        // 3. If spreadable is not undefined, return ! ToBoolean(spreadable).
        if !spreadable.is_undefined() {
            return Ok(spreadable.to_boolean());
        }

        // 4. Return ? IsArray(O).
        o.is_array_abstract()
    }

    /// `get Array [ @@species ]`
    ///
    /// The `Array [ @@species ]` accessor property returns the Array constructor.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-array-@@species
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/@@species
    #[allow(clippy::unnecessary_wraps)]
    fn get_species(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Return the this value.
        Ok(this.clone())
    }

    /// Utility function used to specify the creation of a new Array object using a constructor
    /// function that is derived from `original_array`.
    ///
    /// see: <https://tc39.es/ecma262/#sec-arrayspeciescreate>
    pub(crate) fn array_species_create(
        original_array: &JsObject,
        length: u64,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        // 1. Let isArray be ? IsArray(originalArray).
        // 2. If isArray is false, return ? ArrayCreate(length).
        if !original_array.is_array_abstract()? {
            return Self::array_create(length, None, context);
        }
        // 3. Let C be ? Get(originalArray, "constructor").
        let c = original_array.get(CONSTRUCTOR, context)?;

        // 4. If IsConstructor(C) is true, then
        if let Some(c) = c.as_constructor() {
            // a. Let thisRealm be the current Realm Record.
            let this_realm = context.realm().clone();
            // b. Let realmC be ? GetFunctionRealm(C).
            let realm_c = c.get_function_realm(context)?;

            // c. If thisRealm and realmC are not the same Realm Record, then
            if this_realm != realm_c
                && c == realm_c.intrinsics().constructors().array().constructor()
            {
                // i. If SameValue(C, realmC.[[Intrinsics]].[[%Array%]]) is true, set C to undefined.
                // Note: fast path to step 6.
                return Self::array_create(length, None, context);
            }
        }

        // 5. If Type(C) is Object, then
        let c = if let Some(c) = c.as_object() {
            // 5.a. Set C to ? Get(C, @@species).
            let c = c.get(JsSymbol::species(), context)?;
            // 5.b. If C is null, set C to undefined.
            if c.is_null_or_undefined() {
                JsValue::undefined()
            } else {
                c
            }
        } else {
            c
        };

        // 6. If C is undefined, return ? ArrayCreate(length).
        if c.is_undefined() {
            return Self::array_create(length, None, context);
        }

        if let Some(c) = c.as_constructor() {
            // 8. Return ? Construct(C, « 𝔽(length) »).
            return c.construct(&[JsValue::new(length)], Some(&c), context);
        }

        // 7. If IsConstructor(C) is false, throw a TypeError exception.
        Err(JsNativeError::typ()
            .with_message("Symbol.species must be a constructor")
            .into())
    }

    /// `Array.from(arrayLike)`
    ///
    /// The `Array.from()` static method creates a new,
    /// shallow-copied Array instance from an array-like or iterable object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.from
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from
    pub(crate) fn from(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let items = args.get_or_undefined(0);
        let mapfn = args.get_or_undefined(1);
        let this_arg = args.get_or_undefined(2);

        // 2. If mapfn is undefined, let mapping be false
        // 3. Else,
        //     a. If IsCallable(mapfn) is false, throw a TypeError exception.
        //     b. Let mapping be true.
        let mapping = match mapfn.variant() {
            JsVariant::Undefined => None,
            JsVariant::Object(o) if o.is_callable() => Some(o),
            _ => {
                return Err(crate::v8_messages::callback_not_function(mapfn).into());
            }
        };

        // 4. Let usingIterator be ? GetMethod(items, @@iterator).
        let using_iterator = items.get_method(JsSymbol::iterator(), context)?;

        let Some(using_iterator) = using_iterator else {
            // 6. NOTE: items is not an Iterable so assume it is an array-like object.
            // 7. Let arrayLike be ! ToObject(items).
            let array_like = items
                .to_object(context)
                .js_expect("should not fail according to spec")?;

            // 8. Let len be ? LengthOfArrayLike(arrayLike).
            let len = array_like.length_of_array_like(context)?;

            // 9. If IsConstructor(C) is true, then
            //     a. Let A be ? Construct(C, « 𝔽(len) »).
            // 10. Else,
            //     a. Let A be ? ArrayCreate(len).
            let a = match this.as_constructor() {
                Some(constructor) => constructor.construct(&[len.into()], None, context)?,
                _ => Self::array_create(len, None, context)?,
            };

            // 11. Let k be 0.
            // 12. Repeat, while k < len,
            //     ...
            //     f. Set k to k + 1.
            for k in 0..len {
                // a. Let Pk be ! ToString(𝔽(k)).
                // b. Let kValue be ? Get(arrayLike, Pk).
                let k_value = array_like.get(k, context)?;

                let mapped_value = if let Some(ref mapfn) = mapping {
                    // c. If mapping is true, then
                    //     i. Let mappedValue be ? Call(mapfn, thisArg, « kValue, 𝔽(k) »).
                    mapfn.call(this_arg, &[k_value, k.into()], context)?
                } else {
                    // d. Else, let mappedValue be kValue.
                    k_value
                };

                // e. Perform ? CreateDataPropertyOrThrow(A, Pk, mappedValue).
                a.create_data_property_or_throw(k, mapped_value, context)?;
            }

            // 13. Perform ? Set(A, "length", 𝔽(len), true).
            a.set(StaticJsStrings::LENGTH, len, true, context)?;

            // 14. Return A.
            return Ok(a.into());
        };

        // 5. If usingIterator is not undefined, then

        // a. If IsConstructor(C) is true, then
        //     i. Let A be ? Construct(C).
        // b. Else,
        //     i. Let A be ? ArrayCreate(0en).
        let a = match this.as_constructor() {
            Some(constructor) => constructor.construct(&[], None, context)?,
            _ => Self::array_create(0, None, context)?,
        };

        // c. Let iteratorRecord be ? GetIteratorFromMethod(items, usingIterator).
        let mut iterator_record = items.get_iterator_from_method(&using_iterator, context)?;

        // d. Let k be 0.
        // e. Repeat,
        //     i. If k ≥ 2^53 - 1 (MAX_SAFE_INTEGER), then
        //     ...
        //     ix. Set k to k + 1.
        for k in 0..9_007_199_254_740_991_u64 {
            // iii. Let next be ? IteratorStepValue(iteratorRecord).
            let Some(next) = iterator_record.step_value(context)? else {
                // iv. If next is done, then
                //     1. Perform ? Set(A, "length", 𝔽(k), true).
                a.set(StaticJsStrings::LENGTH, k, true, context)?;
                //     2. Return A.
                return Ok(a.into());
            };

            // v. If mapping is true, then
            let mapped_value = if let Some(ref mapfn) = mapping {
                // 1. Let mappedValue be Completion(Call(mapper, thisArg, « next, 𝔽(k) »)).
                let mapped_value = mapfn.call(this_arg, &[next, k.into()], context);

                // 2. IfAbruptCloseIterator(mappedValue, iteratorRecord).
                if_abrupt_close_iterator!(mapped_value, iterator_record, context)
            } else {
                // vi. Else,
                //     1. Let mappedValue be next.
                next
            };

            // vii. Let defineStatus be Completion(CreateDataPropertyOrThrow(A, Pk, mappedValue)).
            let define_status = a.create_data_property_or_throw(k, mapped_value, context);

            // viii. IfAbruptCloseIterator(defineStatus, iteratorRecord).
            if_abrupt_close_iterator!(define_status, iterator_record, context);
        }

        // NOTE: The loop above has to return before it reaches iteration limit,
        // which is why it's safe to have this as the fallback return
        //
        // 1. Let error be ThrowCompletion(a newly created TypeError object).
        let error = Err(JsNativeError::typ()
            .with_message("Invalid array length")
            .into());

        // 2. Return ? IteratorClose(iteratorRecord, error).
        iterator_record.close(error, context)
    }

    /// `Array.isArray( arg )`
    ///
    /// The isArray function takes one argument arg, and returns the Boolean value true
    /// if the argument is an object whose class internal property is "Array"; otherwise it returns false.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.isarray
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/isArray
    pub(crate) fn is_array(
        _: &JsValue,
        args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Return ? IsArray(arg).
        args.get_or_undefined(0).is_array().map(Into::into)
    }

    /// `Array.of(...items)`
    ///
    /// The Array.of method creates a new Array instance from a variable number of arguments,
    /// regardless of the number or type of arguments.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.of
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/of
    pub(crate) fn of(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let len be the number of elements in items.
        // 2. Let lenNumber be 𝔽(len).
        let len = args.len();

        // 3. Let C be the this value.
        // 4. If IsConstructor(C) is true, then
        //     a. Let A be ? Construct(C, « lenNumber »).
        // 5. Else,
        //     a. Let A be ? ArrayCreate(len).
        let a = match this.as_constructor() {
            Some(constructor) => constructor.construct(&[len.into()], None, context)?,
            _ => Self::array_create(len as u64, None, context)?,
        };

        // 6. Let k be 0.
        // 7. Repeat, while k < len,
        for (k, value) in args.iter().enumerate() {
            // a. Let kValue be items[k].
            // b. Let Pk be ! ToString(𝔽(k)).
            // c. Perform ? CreateDataPropertyOrThrow(A, Pk, kValue).
            a.create_data_property_or_throw(k, value.clone(), context)?;
            // d. Set k to k + 1.
        }

        // 8. Perform ? Set(A, "length", lenNumber, true).
        Self::set_length(&a, len as u64, context)?;

        // 9. Return A.
        Ok(a.into())
    }

    ///'Array.prototype.at(index)'
    ///
    /// The `at()` method takes an integer value and returns the item at that
    /// index, allowing for positive and negative integers. Negative integers
    /// count back from the last item in the array.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.at
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/at
    pub(crate) fn at(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        //1. let O be ? ToObject(this value)
        let obj = this.to_object(context)?;
        //2. let len be ? LengthOfArrayLike(O)
        let len = obj.length_of_array_like(context)? as i64;
        //3. let relativeIndex be ? ToIntegerOrInfinity(index)
        let relative_index = args.get_or_undefined(0).to_integer_or_infinity(context)?;
        let k = match relative_index {
            //4. if relativeIndex >= 0, then let k be relativeIndex
            //check if positive and if below length of array
            IntegerOrInfinity::Integer(i) if i >= 0 && i < len => i,
            //5. Else, let k be len + relativeIndex
            //integer should be negative, so abs() and check if less than or equal to length of array
            IntegerOrInfinity::Integer(i) if i < 0 && i.abs() <= len => len + i,
            //handle most likely impossible case of
            //IntegerOrInfinity::NegativeInfinity || IntegerOrInfinity::PositiveInfinity
            //by returning undefined
            _ => return Ok(JsValue::undefined()),
        };
        //6. if k < 0  or k >= len,
        //handled by the above match guards
        //7. Return ? Get(O, !ToString(𝔽(k)))
        obj.get(k, context)
    }

    /// `Array.prototype.concat(...arguments)`
    ///
    /// When the concat method is called with zero or more arguments, it returns an
    /// array containing the array elements of the object followed by the array
    /// elements of each argument in order.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.concat
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/concat
    pub(crate) fn concat(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let obj = this.to_object(context)?;
        // 2. Let A be ? ArraySpeciesCreate(O, 0).
        let arr = Self::array_species_create(&obj, 0, context)?;
        // 3. Let n be 0.
        let mut n = 0;
        // 4. Prepend O to items.
        // 5. For each element E of items, do
        for item in std::iter::once(&JsValue::new(obj)).chain(args.iter()) {
            // a. Let spreadable be ? IsConcatSpreadable(E).
            let spreadable = Self::is_concat_spreadable(item, context)?;
            // b. If spreadable is true, then
            if spreadable {
                // item is guaranteed to be an object since is_concat_spreadable checks it,
                // so we can call `.unwrap()`
                let item = item.as_object().js_expect("guaranteed to be an object")?;
                // i. Let k be 0.
                // ii. Let len be ? LengthOfArrayLike(E).
                let len = item.length_of_array_like(context)?;
                // iii. If n + len > 2^53 - 1, throw a TypeError exception.
                if n + len > Number::MAX_SAFE_INTEGER as u64 {
                    return Err(JsNativeError::typ()
                        .with_message(
                            "length + number of arguments exceeds the max safe integer limit",
                        )
                        .into());
                }
                // iv. Repeat, while k < len,
                for k in 0..len {
                    // 1. Let P be ! ToString(𝔽(k)).
                    // 2. Let exists be ? HasProperty(E, P).
                    // 3. If exists is true, then
                    // 3.a. Let subElement be ? Get(E, P).
                    if let Some(sub_element) = item.try_get(k, context)? {
                        // b. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), subElement).
                        arr.create_data_property_or_throw(n, sub_element, context)?;
                    }
                    // 4. Set n to n + 1.
                    n += 1;
                    // 5. Set k to k + 1.
                }
            }
            // c. Else,
            else {
                // i. NOTE: E is added as a single item rather than spread.
                // ii. If n ≥ 2^53 - 1, throw a TypeError exception.
                if n >= Number::MAX_SAFE_INTEGER as u64 {
                    return Err(JsNativeError::typ()
                        .with_message("length exceeds the max safe integer limit")
                        .into());
                }
                // iii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), E).
                arr.create_data_property_or_throw(n, item.clone(), context)?;
                // iv. Set n to n + 1.
                n += 1;
            }
        }
        // 6. Perform ? Set(A, "length", 𝔽(n), true).
        Self::set_length(&arr, n, context)?;

        // 7. Return A.
        Ok(JsValue::new(arr))
    }

    /// `Array.prototype.push( ...items )`
    ///
    /// The arguments are appended to the end of the array, in the order in which
    /// they appear. The new length of the array is returned as the result of the
    /// call.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.push
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/push
    pub(crate) fn push(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;
        // 2. Let len be ? LengthOfArrayLike(O).
        let mut len = o.length_of_array_like(context)?;
        // 3. Let argCount be the number of elements in items.
        let arg_count = args.len() as u64;
        // 4. If len + argCount > 2^53 - 1, throw a TypeError exception.
        if len + arg_count > 2u64.pow(53) - 1 {
            return Err(JsNativeError::typ()
                .with_message(
                    "the length + the number of arguments exceed the maximum safe integer limit",
                )
                .into());
        }
        // 5. For each element E of items, do
        for element in args.iter().cloned() {
            // a. Perform ? Set(O, ! ToString(𝔽(len)), E, true).
            o.set(len, element, true, context)?;
            // b. Set len to len + 1.
            len += 1;
        }
        // 6. Perform ? Set(O, "length", 𝔽(len), true).
        Self::set_length(&o, len, context)?;

        // 7. Return 𝔽(len).
        Ok(len.into())
    }

    /// `Array.prototype.pop()`
    ///
    /// The last element of the array is removed from the array and returned.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.pop
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/pop
    pub(crate) fn pop(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;
        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;
        // 3. If len = 0, then
        if len == 0 {
            // a. Perform ? Set(O, "length", +0𝔽, true).
            Self::set_length(&o, 0, context)?;

            // b. Return undefined.
            Ok(JsValue::undefined())
        // 4. Else,
        } else {
            // a. Assert: len > 0.
            // b. Let newLen be 𝔽(len - 1).
            let new_len = len - 1;
            // c. Let index be ! ToString(newLen).
            let index = new_len;
            // d. Let element be ? Get(O, index).
            let element = o.get(index, context)?;
            // e. Perform ? DeletePropertyOrThrow(O, index).
            o.delete_property_or_throw(index, context)?;
            // f. Perform ? Set(O, "length", newLen, true).
            Self::set_length(&o, new_len, context)?;
            // g. Return element.
            Ok(element)
        }
    }

    /// `Array.prototype.forEach( callbackFn [ , thisArg ] )`
    ///
    /// This method executes the provided callback function for each element in the array.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.foreach
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach
    pub(crate) fn for_each(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;
        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;
        // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback = args.get_or_undefined(0).as_callable().ok_or_else(|| {
            crate::v8_messages::callback_not_function(args.get_or_undefined(0))
        })?;
        // 4. Let k be 0.
        // 5. Repeat, while k < len,
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            let pk = k;
            // b. Let kPresent be ? HasProperty(O, Pk).
            // c. If kPresent is true, then
            // c.i. Let kValue be ? Get(O, Pk).
            if let Some(k_value) = o.try_get(pk, context)? {
                // ii. Perform ? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »).
                let this_arg = args.get_or_undefined(1);
                callback.call(this_arg, &[k_value, k.into(), o.clone().into()], context)?;
            }
            // d. Set k to k + 1.
        }
        // 6. Return undefined.
        Ok(JsValue::undefined())
    }

    /// `Array.prototype.join( separator )`
    ///
    /// The elements of the array are converted to Strings, and these Strings are
    /// then concatenated, separated by occurrences of the separator. If no
    /// separator is provided, a single comma is used as the separator.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.join
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/join
    pub(crate) fn join(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;
        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;
        // 3. If separator is undefined, let sep be the single-element String ",".
        // 4. Else, let sep be ? ToString(separator).
        let separator = args.get_or_undefined(0);
        let separator = if separator.is_undefined() {
            js_string!(",")
        } else {
            separator.to_string(context)?
        };

        // 5. Let R be the empty String.
        let mut r = Vec::with_capacity(len as usize + len.saturating_sub(1) as usize);
        // 6. Let k be 0.
        // 7. Repeat, while k < len,
        for k in 0..len {
            // a. If k > 0, set R to the string-concatenation of R and sep.
            if k > 0 {
                r.push(separator.clone());
            }
            // b. Let element be ? Get(O, ! ToString(𝔽(k))).
            let element = o.get(k, context)?;
            // c. If element is undefined, null or the array itself, let next be the empty String; otherwise, let next be ? ToString(element).
            let next = if element.is_null_or_undefined() || &element == this {
                js_string!()
            } else {
                element.to_string(context)?
            };
            // d. Set R to the string-concatenation of R and next.
            r.push(next.clone());
            // e. Set k to k + 1.
        }
        // 8. Return R.
        Ok(js_string!(&r[..]).into())
    }

    /// `Array.prototype.toString( separator )`
    ///
    /// The toString function is intentionally generic; it does not require that
    /// its this value be an Array object. Therefore it can be transferred to
    /// other kinds of objects for use as a method.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toString
    #[allow(clippy::wrong_self_convention)]
    pub(crate) fn to_string(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let array be ? ToObject(this value).
        let array = this.to_object(context)?;
        // 2. Let func be ? Get(array, "join").
        let func = array.get(js_string!("join"), context)?;
        // 3. If IsCallable(func) is false, set func to the intrinsic function %Object.prototype.toString%.
        // 4. Return ? Call(func, array).
        if let Some(func) = func.as_callable() {
            func.call(&array.into(), &[], context)
        } else {
            crate::builtins::object::OrdinaryObject::to_string(&array.into(), &[], context)
        }
    }

    /// `Array.prototype.reverse()`
    ///
    /// The elements of the array are rearranged so as to reverse their order.
    /// The object is returned as the result of the call.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.reverse
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reverse
    #[allow(clippy::else_if_without_else)]
    pub(crate) fn reverse(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;
        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;
        // 3. Let middle be floor(len / 2).
        let middle = len / 2;
        // 4. Let lower be 0.
        let mut lower = 0;
        // 5. Repeat, while lower ≠ middle,
        while lower != middle {
            // a. Let upper be len - lower - 1.
            let upper = len - lower - 1;
            // Skipped: b. Let upperP be ! ToString(𝔽(upper)).
            // Skipped: c. Let lowerP be ! ToString(𝔽(lower)).
            // d. Let lowerExists be ? HasProperty(O, lowerP).
            // e. If lowerExists is true, then
            // e.i. Let lowerValue be ? Get(O, lowerP).
            let lower_value = o.try_get(lower, context)?;
            // f. Let upperExists be ? HasProperty(O, upperP).
            // g. If upperExists is true, then
            // g.i. Let upperValue be ? Get(O, upperP).
            let upper_value = o.try_get(upper, context)?;
            match (lower_value, upper_value) {
                // h. If lowerExists is true and upperExists is true, then
                (Some(lower_value), Some(upper_value)) => {
                    // i. Perform ? Set(O, lowerP, upperValue, true).
                    o.set(lower, upper_value, true, context)?;
                    // ii. Perform ? Set(O, upperP, lowerValue, true).
                    o.set(upper, lower_value, true, context)?;
                }
                // i. Else if lowerExists is false and upperExists is true, then
                (None, Some(upper_value)) => {
                    // i. Perform ? Set(O, lowerP, upperValue, true).
                    o.set(lower, upper_value, true, context)?;
                    // ii. Perform ? DeletePropertyOrThrow(O, upperP).
                    o.delete_property_or_throw(upper, context)?;
                }
                // j. Else if lowerExists is true and upperExists is false, then
                (Some(lower_value), None) => {
                    // i. Perform ? DeletePropertyOrThrow(O, lowerP).
                    o.delete_property_or_throw(lower, context)?;
                    // ii. Perform ? Set(O, upperP, lowerValue, true).
                    o.set(upper, lower_value, true, context)?;
                }
                // k. Else,
                (None, None) => {
                    // i. Assert: lowerExists and upperExists are both false.
                    // ii. No action is required.
                }
            }

            // l. Set lower to lower + 1.
            lower += 1;
        }
        // 6. Return O.
        Ok(o.into())
    }

    /// [`Array.prototype.toReversed()`][spec]
    ///
    /// Reverses this array, returning the result into a copy of the array.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.toreversed
    pub(crate) fn to_reversed(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        // 3. Let A be ? ArrayCreate(len).
        let a = Array::array_create(len, None, context)?;

        // 4. Let k be 0.
        // 5. Repeat, while k < len,
        for i in 0..len {
            // a. Let from be ! ToString(𝔽(len - k - 1)).
            let from = len - i - 1;

            // b. Let Pk be ! ToString(𝔽(k)).
            // c. Let fromValue be ? Get(O, from).
            let from_value = o.get(from, context)?;

            // d. Perform ! CreateDataPropertyOrThrow(A, Pk, fromValue).
            a.create_data_property_or_throw(i, from_value, context)
                .js_expect("cannot fail per the spec")?;

            // e. Set k to k + 1.
        }

        // 6. Return A.
        Ok(a.into())
    }

    /// `Array.prototype.shift()`
    ///
    /// The first element of the array is removed from the array and returned.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.shift
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/shift
    pub(crate) fn shift(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;
        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;
        // 3. If len = 0, then
        if len == 0 {
            // a. Perform ? Set(O, "length", +0𝔽, true).
            Self::set_length(&o, 0, context)?;

            // b. Return undefined.
            return Ok(JsValue::undefined());
        }

        // Small optimization for arrays using dense properties
        // TODO: this optimization could be generalized to many other objects with
        // slot-based dense property maps.
        if o.is_array() {
            let mut o_borrow = o.borrow_mut();
            if let IndexedProperties::DenseI32(dense) =
                &mut o_borrow.properties_mut().indexed_properties
                && len <= dense.len() as u64
            {
                let v = dense.remove(0);
                drop(o_borrow);
                Self::set_length(&o, len - 1, context)?;
                return Ok(v.into());
            }
            if let IndexedProperties::DenseF64(dense) =
                &mut o_borrow.properties_mut().indexed_properties
                && len <= dense.len() as u64
            {
                let v = dense.remove(0);
                drop(o_borrow);
                Self::set_length(&o, len - 1, context)?;
                return Ok(v.into());
            }
            if let Some(dense) = o_borrow.properties_mut().dense_indexed_properties_mut()
                && len <= dense.len() as u64
            {
                let v = dense.remove(0);
                drop(o_borrow);
                Self::set_length(&o, len - 1, context)?;
                return Ok(v);
            }
        }

        // 4. Let first be ? Get(O, "0").
        let first = o.get(0, context)?;
        // 5. Let k be 1.
        // 6. Repeat, while k < len,
        for k in 1..len {
            // a. Let from be ! ToString(𝔽(k)).
            let from = k;
            // b. Let to be ! ToString(𝔽(k - 1)).
            let to = k - 1;
            // c. Let fromPresent be ? HasProperty(O, from).
            // d. If fromPresent is true, then
            // d.i. Let fromVal be ? Get(O, from).
            if let Some(from_val) = o.try_get(from, context)? {
                // ii. Perform ? Set(O, to, fromVal, true).
                o.set(to, from_val, true, context)?;
            // e. Else,
            } else {
                // i. Assert: fromPresent is false.
                // ii. Perform ? DeletePropertyOrThrow(O, to).
                o.delete_property_or_throw(to, context)?;
            }
            // f. Set k to k + 1.
        }
        // 7. Perform ? DeletePropertyOrThrow(O, ! ToString(𝔽(len - 1))).
        o.delete_property_or_throw(len - 1, context)?;
        // 8. Perform ? Set(O, "length", 𝔽(len - 1), true).
        Self::set_length(&o, len - 1, context)?;
        // 9. Return first.
        Ok(first)
    }

    /// `Array.prototype.unshift( ...items )`
    ///
    /// The arguments are prepended to the start of the array, such that their order
    /// within the array is the same as the order in which they appear in the
    /// argument list.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.unshift
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/unshift
    pub(crate) fn unshift(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;
        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;
        // 3. Let argCount be the number of elements in items.
        let arg_count = args.len() as u64;
        // 4. If argCount > 0, then
        if arg_count > 0 {
            // a. If len + argCount > 2^53 - 1, throw a TypeError exception.
            if len + arg_count > 2u64.pow(53) - 1 {
                return Err(JsNativeError::typ()
                    .with_message("length + number of arguments exceeds the max safe integer limit")
                    .into());
            }
            // b. Let k be len.
            let mut k = len;
            // c. Repeat, while k > 0,
            while k > 0 {
                // i. Let from be ! ToString(𝔽(k - 1)).
                let from = k - 1;
                // ii. Let to be ! ToString(𝔽(k + argCount - 1)).
                let to = k + arg_count - 1;
                // iii. Let fromPresent be ? HasProperty(O, from).
                // iv. If fromPresent is true, then
                // iv.1. Let fromValue be ? Get(O, from).
                if let Some(from_value) = o.try_get(from, context)? {
                    // 2. Perform ? Set(O, to, fromValue, true).
                    o.set(to, from_value, true, context)?;
                // v. Else,
                } else {
                    // 1. Assert: fromPresent is false.
                    // 2. Perform ? DeletePropertyOrThrow(O, to).
                    o.delete_property_or_throw(to, context)?;
                }
                // vi. Set k to k - 1.
                k -= 1;
            }
            // d. Let j be +0𝔽.
            // e. For each element E of items, do
            for (j, e) in args.iter().enumerate() {
                // i. Perform ? Set(O, ! ToString(j), E, true).
                o.set(j, e.clone(), true, context)?;
                // ii. Set j to j + 1𝔽.
            }
        }
        // 5. Perform ? Set(O, "length", 𝔽(len + argCount), true).
        Self::set_length(&o, len + arg_count, context)?;

        // 6. Return 𝔽(len + argCount).
        Ok((len + arg_count).into())
    }

    /// `Array.prototype.every( callback, [ thisArg ] )`
    ///
    /// The every method executes the provided callback function once for each
    /// element present in the array until it finds the one where callback returns
    /// a falsy value. It returns `false` if it finds such element, otherwise it
    /// returns `true`.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.every
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/every
    pub(crate) fn every(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;
        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;
        // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback = args.get_or_undefined(0).as_callable().ok_or_else(|| {
            crate::v8_messages::callback_not_function(args.get_or_undefined(0))
        })?;

        let this_arg = args.get_or_undefined(1);

        // 4. Let k be 0.
        // 5. Repeat, while k < len,
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kPresent be ? HasProperty(O, Pk).
            // c. If kPresent is true, then
            // c.i. Let kValue be ? Get(O, Pk).
            if let Some(k_value) = o.try_get(k, context)? {
                // ii. Let testResult be ! ToBoolean(? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »)).
                let test_result = callback
                    .call(this_arg, &[k_value, k.into(), o.clone().into()], context)?
                    .to_boolean();
                // iii. If testResult is false, return false.
                if !test_result {
                    return Ok(JsValue::new(false));
                }
            }
            // d. Set k to k + 1.
        }
        // 6. Return true.
        Ok(JsValue::new(true))
    }

    /// `Array.prototype.map( callback, [ thisArg ] )`
    ///
    /// For each element in the array the callback function is called, and a new
    /// array is constructed from the return values of these calls.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.map
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map
    pub(crate) fn map(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;
        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;
        // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback = args.get_or_undefined(0).as_callable().ok_or_else(|| {
            crate::v8_messages::callback_not_function(args.get_or_undefined(0))
        })?;

        // 4. Let A be ? ArraySpeciesCreate(O, len).
        let a = Self::array_species_create(&o, len, context)?;

        let this_arg = args.get_or_undefined(1);

        // 5. Let k be 0.
        // 6. Repeat, while k < len,
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let k_present be ? HasProperty(O, Pk).
            // c. If k_present is true, then
            // c.i. Let kValue be ? Get(O, Pk).
            if let Some(k_value) = o.try_get(k, context)? {
                // ii. Let mappedValue be ? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »).
                let mapped_value =
                    callback.call(this_arg, &[k_value, k.into(), o.clone().into()], context)?;
                // iii. Perform ? CreateDataPropertyOrThrow(A, Pk, mappedValue).
                a.create_data_property_or_throw(k, mapped_value, context)?;
            }
            // d. Set k to k + 1.
        }
        // 7. Return A.
        Ok(a.into())
    }

    /// `Array.prototype.indexOf( searchElement[, fromIndex ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.indexof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/indexOf
    pub(crate) fn index_of(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)? as i64;

        // 3. If len is 0, return -1𝔽.
        if len == 0 {
            return Ok(JsValue::new(-1));
        }

        // 4. Let n be ? ToIntegerOrInfinity(fromIndex).
        let n = args
            .get(1)
            .cloned()
            .unwrap_or_default()
            .to_integer_or_infinity(context)?;
        // 5. Assert: If fromIndex is undefined, then n is 0.
        let n = match n {
            // 6. If n is +∞, return -1𝔽.
            IntegerOrInfinity::PositiveInfinity => return Ok(JsValue::new(-1)),
            // 7. Else if n is -∞, set n to 0.
            IntegerOrInfinity::NegativeInfinity => 0,
            IntegerOrInfinity::Integer(value) => value,
        };

        // 8. If n ≥ 0, then
        let mut k;
        if n >= 0 {
            // a. Let k be n.
            k = n;
        // 9. Else,
        } else {
            // a. Let k be len + n.
            k = len + n;
            // b. If k < 0, set k to 0.
            if k < 0 {
                k = 0;
            }
        }

        let search_element = args.get_or_undefined(0);

        // 10. Repeat, while k < len,
        while k < len {
            // a. Let kPresent be ? HasProperty(O, ! ToString(𝔽(k))).
            // b. If kPresent is true, then
            // b.i. Let elementK be ? Get(O, ! ToString(𝔽(k))).
            if let Some(element_k) = o.try_get(k, context)? {
                // ii. Let same be IsStrictlyEqual(searchElement, elementK).
                // iii. If same is true, return 𝔽(k).
                if search_element.strict_equals(&element_k) {
                    return Ok(JsValue::new(k));
                }
            }
            // c. Set k to k + 1.
            k += 1;
        }
        // 11. Return -1𝔽.
        Ok(JsValue::new(-1))
    }

    /// `Array.prototype.lastIndexOf( searchElement[, fromIndex ] )`
    ///
    ///
    /// `lastIndexOf` compares searchElement to the elements of the array in descending order
    /// using the Strict Equality Comparison algorithm, and if found at one or more indices,
    /// returns the largest such index; otherwise, -1 is returned.
    ///
    /// The optional second argument fromIndex defaults to the array's length minus one
    /// (i.e. the whole array is searched). If it is greater than or equal to the length of the array,
    /// the whole array will be searched. If it is negative, it is used as the offset from the end
    /// of the array to compute fromIndex. If the computed index is less than 0, -1 is returned.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.lastindexof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/lastIndexOf
    pub(crate) fn last_index_of(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)? as i64;

        // 3. If len is 0, return -1𝔽.
        if len == 0 {
            return Ok(JsValue::new(-1));
        }

        // 4. If fromIndex is present, let n be ? ToIntegerOrInfinity(fromIndex); else let n be len - 1.
        let n = if let Some(from_index) = args.get(1) {
            from_index.to_integer_or_infinity(context)?
        } else {
            IntegerOrInfinity::Integer(len - 1)
        };

        let mut k = match n {
            // 5. If n is -∞, return -1𝔽.
            IntegerOrInfinity::NegativeInfinity => return Ok(JsValue::new(-1)),
            // 6. If n ≥ 0, then
            //     a. Let k be min(n, len - 1).
            IntegerOrInfinity::Integer(n) if n >= 0 => min(n, len - 1),
            IntegerOrInfinity::PositiveInfinity => len - 1,
            // 7. Else,
            //     a. Let k be len + n.
            IntegerOrInfinity::Integer(n) => len + n,
        };

        let search_element = args.get_or_undefined(0);

        // 8. Repeat, while k ≥ 0,
        while k >= 0 {
            // a. Let kPresent be ? HasProperty(O, ! ToString(𝔽(k))).
            // b. If kPresent is true, then
            // b.i. Let elementK be ? Get(O, ! ToString(𝔽(k))).
            if let Some(element_k) = o.try_get(k, context)? {
                // ii. Let same be IsStrictlyEqual(searchElement, elementK).
                // iii. If same is true, return 𝔽(k).
                if JsValue::strict_equals(search_element, &element_k) {
                    return Ok(JsValue::new(k));
                }
            }
            // c. Set k to k - 1.
            k -= 1;
        }
        // 9. Return -1𝔽.
        Ok(JsValue::new(-1))
    }

    /// `Array.prototype.find( callback, [thisArg] )`
    ///
    /// The find method executes the callback function once for each index of the array
    /// until the callback returns a truthy value. If so, find immediately returns the value
    /// of that element. Otherwise, find returns undefined.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.find
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
    pub(crate) fn find(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        let predicate = args.get_or_undefined(0);
        let this_arg = args.get_or_undefined(1);

        // 3. Let findRec be ? FindViaPredicate(O, len, ascending, predicate, thisArg).
        let (_, value) = find_via_predicate(
            &o,
            len,
            Direction::Ascending,
            predicate,
            this_arg,
            context,
            "Array.prototype.find",
        )?;

        // 4. Return findRec.[[Value]].
        Ok(value)
    }

    /// `Array.prototype.findIndex( predicate [ , thisArg ] )`
    ///
    /// This method executes the provided predicate function for each element of the array.
    /// If the predicate function returns `true` for an element, this method returns the index of the element.
    /// If all elements return `false`, the value `-1` is returned.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.findindex
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex
    pub(crate) fn find_index(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        let predicate = args.get_or_undefined(0);
        let this_arg = args.get_or_undefined(1);

        // 3. Let findRec be ? FindViaPredicate(O, len, ascending, predicate, thisArg).
        let (index, _) = find_via_predicate(
            &o,
            len,
            Direction::Ascending,
            predicate,
            this_arg,
            context,
            "Array.prototype.findIndex",
        )?;

        // 4. Return findRec.[[Index]].
        Ok(index)
    }

    /// `Array.prototype.findLast( predicate, [thisArg] )`
    ///
    /// findLast calls predicate once for each element of the array, in descending order,
    /// until it finds one where predicate returns true. If such an element is found, findLast
    /// immediately returns that element value. Otherwise, findLast returns undefined.
    ///
    /// More information:
    ///  - [ECMAScript proposal][spec]
    ///
    /// [spec]: https://tc39.es/proposal-array-find-from-last/#sec-array.prototype.findlast
    pub(crate) fn find_last(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        let predicate = args.get_or_undefined(0);
        let this_arg = args.get_or_undefined(1);

        // 3. Let findRec be ? FindViaPredicate(O, len, descending, predicate, thisArg).
        let (_, value) = find_via_predicate(
            &o,
            len,
            Direction::Descending,
            predicate,
            this_arg,
            context,
            "Array.prototype.findLast",
        )?;

        // 4. Return findRec.[[Value]].
        Ok(value)
    }

    /// `Array.prototype.findLastIndex( predicate [ , thisArg ] )`
    ///
    /// `findLastIndex` calls predicate once for each element of the array, in descending order,
    /// until it finds one where predicate returns true. If such an element is found, `findLastIndex`
    /// immediately returns the index of that element value. Otherwise, `findLastIndex` returns -1.
    ///
    /// More information:
    ///  - [ECMAScript proposal][spec]
    ///
    /// [spec]: https://tc39.es/proposal-array-find-from-last/#sec-array.prototype.findlastindex
    pub(crate) fn find_last_index(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        let predicate = args.get_or_undefined(0);
        let this_arg = args.get_or_undefined(1);

        // 3. Let findRec be ? FindViaPredicate(O, len, descending, predicate, thisArg).
        let (index, _) = find_via_predicate(
            &o,
            len,
            Direction::Descending,
            predicate,
            this_arg,
            context,
            "Array.prototype.findLastIndex",
        )?;

        // 4. Return findRec.[[Index]].
        Ok(index)
    }

    /// `Array.prototype.flat( [depth] )`
    ///
    /// This method creates a new array with all sub-array elements concatenated into it
    /// recursively up to the specified depth.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.flat
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat
    pub(crate) fn flat(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ToObject(this value)
        let o = this.to_object(context)?;

        // 2. Let sourceLen be LengthOfArrayLike(O)
        let source_len = o.length_of_array_like(context)?;

        // 3. Let depthNum be 1
        // 4. If depth is not undefined, then set depthNum to IntegerOrInfinity(depth)
        let depth = args.get_or_undefined(0);
        let depth_num = if depth.is_undefined() {
            1
        } else {
            // a. Set depthNum to ? ToIntegerOrInfinity(depth).
            // b. If depthNum < 0, set depthNum to 0.
            match depth.to_integer_or_infinity(context)? {
                IntegerOrInfinity::Integer(value) if value >= 0 => value as u64,
                IntegerOrInfinity::PositiveInfinity => u64::MAX,
                _ => 0,
            }
        };

        // 5. Let A be ArraySpeciesCreate(O, 0)
        let a = Self::array_species_create(&o, 0, context)?;

        // 6. Perform ? FlattenIntoArray(A, O, sourceLen, 0, depthNum)
        Self::flatten_into_array(
            &a,
            &o,
            source_len,
            0,
            depth_num,
            None,
            &JsValue::undefined(),
            context,
        )?;

        Ok(a.into())
    }

    /// `Array.prototype.flatMap( callback, [ thisArg ] )`
    ///
    /// This method returns a new array formed by applying a given callback function to
    /// each element of the array, and then flattening the result by one level. It is
    /// identical to a `map()` followed by a `flat()` of depth 1, but slightly more
    /// efficient than calling those two methods separately.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.flatMap
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap
    pub(crate) fn flat_map(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ToObject(this value)
        let o = this.to_object(context)?;

        // 2. Let sourceLen be LengthOfArrayLike(O)
        let source_len = o.length_of_array_like(context)?;

        // 3. If ! IsCallable(mapperFunction) is false, throw a TypeError exception.
        let mapper_function = args.get_or_undefined(0).as_callable().ok_or_else(|| {
            crate::v8_messages::callback_not_function(args.get_or_undefined(0))
        })?;

        // 4. Let A be ? ArraySpeciesCreate(O, 0).
        let a = Self::array_species_create(&o, 0, context)?;

        // 5. Perform ? FlattenIntoArray(A, O, sourceLen, 0, 1, mapperFunction, thisArg).
        Self::flatten_into_array(
            &a,
            &o,
            source_len,
            0,
            1,
            Some(&mapper_function),
            args.get_or_undefined(1),
            context,
        )?;

        // 6. Return A
        Ok(a.into())
    }

    /// Abstract method `FlattenIntoArray`.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-flattenintoarray
    #[allow(clippy::too_many_arguments)]
    fn flatten_into_array(
        target: &JsObject,
        source: &JsObject,
        source_len: u64,
        start: u64,
        depth: u64,
        mapper_function: Option<&JsObject>,
        this_arg: &JsValue,
        context: &mut Context,
    ) -> JsResult<u64> {
        // 1. Assert target is Object
        // 2. Assert source is Object

        // 3. Assert if mapper_function is present, then:
        // - IsCallable(mapper_function) is true
        // - thisArg is present
        // - depth is 1

        // 4. Let targetIndex be start
        let mut target_index = start;

        // 5. Let sourceIndex be 0
        let mut source_index = 0;

        // 6. Repeat, while R(sourceIndex) < sourceLen
        while source_index < source_len {
            // a. Let P be ToString(sourceIndex)
            let p = source_index;

            // b. Let exists be ? HasProperty(source, P).
            // c. If exists is true, then
            // c.i. Let element be Get(source, P)
            if let Some(mut element) = source.try_get(p, context)? {
                // ii. If mapperFunction is present, then
                if let Some(mapper_function) = mapper_function {
                    // 1. Set element to ? Call(mapperFunction, thisArg, <<element, sourceIndex, source>>)
                    element = mapper_function.call(
                        this_arg,
                        &[element, source_index.into(), source.clone().into()],
                        context,
                    )?;
                }

                // iii. Let shouldFlatten be false
                // iv. If depth > 0, then
                let should_flatten = if depth > 0 {
                    // 1. Set shouldFlatten to ? IsArray(element).
                    element.is_array()?
                } else {
                    false
                };

                // v. If shouldFlatten is true
                if should_flatten {
                    // For `should_flatten` to be true, element must be an object.
                    let element = element.as_object().js_expect("must be an object")?;

                    // 1. If depth is +Infinity let newDepth be +Infinity
                    let new_depth = if depth == u64::MAX {
                        u64::MAX
                    // 2. Else, let newDepth be depth - 1
                    } else {
                        depth - 1
                    };

                    // 3. Let elementLen be ? LengthOfArrayLike(element)
                    let element_len = element.length_of_array_like(context)?;

                    // 4. Set targetIndex to ? FlattenIntoArray(target, element, elementLen, targetIndex, newDepth)
                    target_index = Self::flatten_into_array(
                        target,
                        &element,
                        element_len,
                        target_index,
                        new_depth,
                        None,
                        &JsValue::undefined(),
                        context,
                    )?;

                // vi. Else
                } else {
                    // 1. If targetIndex >= 2^53 - 1, throw a TypeError exception
                    if target_index >= Number::MAX_SAFE_INTEGER as u64 {
                        return Err(JsNativeError::typ()
                            .with_message("Target index exceeded max safe integer value")
                            .into());
                    }

                    // 2. Perform ? CreateDataPropertyOrThrow(target, targetIndex, element)
                    target.create_data_property_or_throw(target_index, element, context)?;

                    // 3. Set targetIndex to targetIndex + 1
                    target_index += 1;
                }
            }
            // d. Set sourceIndex to sourceIndex + 1
            source_index += 1;
        }

        // 7. Return targetIndex
        Ok(target_index)
    }

    /// `Array.prototype.fill( value[, start[, end]] )`
    ///
    /// The method fills (modifies) all the elements of an array from start index (default 0)
    /// to an end index (default array length) with a static value. It returns the modified array.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.fill
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/fill
    pub(crate) fn fill(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        // 3. Let relativeStart be ? ToIntegerOrInfinity(start).
        // 4. If relativeStart is -∞, let k be 0.
        // 5. Else if relativeStart < 0, let k be max(len + relativeStart, 0).
        // 6. Else, let k be min(relativeStart, len).
        let mut k = Self::get_relative_start(context, args.get_or_undefined(1), len)?;

        // 7. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToIntegerOrInfinity(end).
        // 8. If relativeEnd is -∞, let final be 0.
        // 9. Else if relativeEnd < 0, let final be max(len + relativeEnd, 0).
        // 10. Else, let final be min(relativeEnd, len).
        let final_ = Self::get_relative_end(context, args.get_or_undefined(2), len)?;

        let value = args.get_or_undefined(0);

        // 11. Repeat, while k < final,
        while k < final_ {
            // a. Let Pk be ! ToString(𝔽(k)).
            let pk = k;
            // b. Perform ? Set(O, Pk, value, true).
            o.set(pk, value.clone(), true, context)?;
            // c. Set k to k + 1.
            k += 1;
        }
        // 12. Return O.
        Ok(o.into())
    }

    /// `Array.prototype.includes( valueToFind [, fromIndex] )`
    ///
    /// Determines whether an array includes a certain value among its entries, returning `true` or `false` as appropriate.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.includes
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes
    pub(crate) fn includes_value(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)? as i64;

        // 3. If len is 0, return false.
        if len == 0 {
            return Ok(JsValue::new(false));
        }

        // 4. Let n be ? ToIntegerOrInfinity(fromIndex).
        let n = args
            .get(1)
            .cloned()
            .unwrap_or_default()
            .to_integer_or_infinity(context)?;
        // 5. Assert: If fromIndex is undefined, then n is 0.
        // 6. If n is +∞, return false.
        // 7. Else if n is -∞, set n to 0.
        let n = match n {
            IntegerOrInfinity::PositiveInfinity => return Ok(JsValue::new(false)),
            IntegerOrInfinity::NegativeInfinity => 0,
            IntegerOrInfinity::Integer(value) => value,
        };

        // 8. If n ≥ 0, then
        let mut k;
        if n >= 0 {
            // a. Let k be n.
            k = n;
        // 9. Else,
        } else {
            // a. Let k be len + n.
            k = len + n;
            // b. If k < 0, set k to 0.
            if k < 0 {
                k = 0;
            }
        }

        let search_element = args.get_or_undefined(0);

        // 10. Repeat, while k < len,
        while k < len {
            // a. Let elementK be ? Get(O, ! ToString(𝔽(k))).
            let element_k = o.get(k, context)?;
            // b. If SameValueZero(searchElement, elementK) is true, return true.
            if JsValue::same_value_zero(search_element, &element_k) {
                return Ok(JsValue::new(true));
            }
            // c. Set k to k + 1.
            k += 1;
        }
        // 11. Return false.
        Ok(JsValue::new(false))
    }

    /// `Array.prototype.slice( [begin[, end]] )`
    ///
    /// The slice method takes two arguments, start and end, and returns an array containing the
    /// elements of the array from element start up to, but not including, element end (or through the
    /// end of the array if end is undefined). If start is negative, it is treated as length + start
    /// where length is the length of the array. If end is negative, it is treated as length + end where
    /// length is the length of the array.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.slice
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice
    pub(crate) fn slice(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        // 3. Let relativeStart be ? ToIntegerOrInfinity(start).
        // 4. If relativeStart is -∞, let k be 0.
        // 5. Else if relativeStart < 0, let k be max(len + relativeStart, 0).
        // 6. Else, let k be min(relativeStart, len).
        let mut k = Self::get_relative_start(context, args.get_or_undefined(0), len)?;

        // 7. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToIntegerOrInfinity(end).
        // 8. If relativeEnd is -∞, let final be 0.
        // 9. Else if relativeEnd < 0, let final be max(len + relativeEnd, 0).
        // 10. Else, let final be min(relativeEnd, len).
        let final_ = Self::get_relative_end(context, args.get_or_undefined(1), len)?;

        // 11. Let count be max(final - k, 0).
        let count = final_.saturating_sub(k);

        // 12. Let A be ? ArraySpeciesCreate(O, count).
        let a = Self::array_species_create(&o, count, context)?;

        // 13. Let n be 0.
        let mut n: u64 = 0;
        // 14. Repeat, while k < final,
        while k < final_ {
            // a. Let Pk be ! ToString(𝔽(k)).
            let pk = k;
            // b. Let kPresent be ? HasProperty(O, Pk).
            // c. If kPresent is true, then
            // c.i. Let kValue be ? Get(O, Pk).
            if let Some(k_value) = o.try_get(pk, context)? {
                // ii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), kValue).
                a.create_data_property_or_throw(n, k_value, context)?;
            }
            // d. Set k to k + 1.
            k += 1;
            // e. Set n to n + 1.
            n += 1;
        }

        // 15. Perform ? Set(A, "length", 𝔽(n), true).
        Self::set_length(&a, n, context)?;

        // 16. Return A.
        Ok(a.into())
    }

    /// [`Array.prototype.toLocaleString ( [ locales [ , options ] ] )`][spec].
    ///
    /// Returns a string representing the elements of the array. The elements are converted to
    /// strings using their `toLocaleString` methods and these strings are separated by a
    /// locale-specific string (such as a comma ",").
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sup-array.prototype.tolocalestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toLocaleString
    pub(crate) fn to_locale_string(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let array be ? ToObject(this value).
        let array = this.to_object(context)?;
        // 2. Let len be ? ToLength(? Get(array, "length")).
        let len = array.length_of_array_like(context)?;

        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 3. Let separator be the implementation-defined list-separator String value appropriate for the host environment's current locale (such as ", ").
        let separator = {
            #[cfg(feature = "intl")]
            {
                use crate::builtins::intl::locale::default_locale;
                use icu_list::{
                    ListFormatter, ListFormatterPreferences, options::ListFormatterOptions,
                };

                let locale = default_locale(context.intl_provider().locale_canonicalizer()?);
                let preferences = ListFormatterPreferences::from(&locale);
                let formatter = ListFormatter::try_new_unit_with_buffer_provider(
                    context.intl_provider().erased_provider(),
                    preferences,
                    ListFormatterOptions::default(),
                )
                .map_err(|e| JsNativeError::typ().with_message(e.to_string()))?;

                // Ask ICU for the list pattern literal by formatting two empty elements.
                // For many locales this yields ", ", but it may differ.
                js_string!(
                    formatter.format_to_string(std::iter::once("").chain(std::iter::once("")))
                )
            }

            #[cfg(not(feature = "intl"))]
            {
                js_string!(", ")
            }
        };

        // 4. Let R be the empty String.
        let mut r = Vec::with_capacity(len as usize + len.saturating_sub(1) as usize);

        // 5. Let k be 0.
        // 6. Repeat, while k < len,
        for k in 0..len {
            // a. If k > 0, then
            if k > 0 {
                // i. Set R to the string-concatenation of R and separator.
                r.extend(separator.iter());
            }

            // b. Let nextElement be ? Get(array, ! ToString(k)).
            let next = array.get(k, context)?;

            // c. If nextElement is not undefined or null, then
            if !next.is_null_or_undefined() {
                // i. Let S be ? ToString(? Invoke(nextElement, "toLocaleString", « locales, options »)).
                let s = next
                    .invoke(
                        js_string!("toLocaleString"),
                        &[locales.clone(), options.clone()],
                        context,
                    )?
                    .to_string(context)?;

                // ii. Set R to the string-concatenation of R and S.
                r.extend(s.iter());
            }
            //     d. Increase k by 1.
        }
        // 7. Return R.
        Ok(js_string!(&r[..]).into())
    }

    /// Gets the delete count of a splice operation.
    fn get_delete_count(
        len: u64,
        actual_start: u64,
        start: Option<&JsValue>,
        delete_count: Option<&JsValue>,
        context: &mut Context,
    ) -> JsResult<u64> {
        // 8. If start is not present, then
        let actual_delete_count = if start.is_none() {
            // a. Let actualDeleteCount be 0.
            0
        }
        // 10. Else,
        else if let Some(delete_count) = delete_count {
            // a. Let dc be ? ToIntegerOrInfinity(deleteCount).
            let dc = delete_count.to_integer_or_infinity(context)?;

            // b. Let actualDeleteCount be the result of clamping dc between 0 and len - actualStart.
            let max = len - actual_start;
            match dc {
                IntegerOrInfinity::Integer(i) => u64::try_from(i)
                    .unwrap_or_default()
                    .clamp(0, len - actual_start),
                IntegerOrInfinity::PositiveInfinity => max,
                IntegerOrInfinity::NegativeInfinity => 0,
            }
        }
        // 9. Else if deleteCount is not present, then
        else {
            // a. Let actualDeleteCount be len - actualStart.
            len - actual_start
        };

        Ok(actual_delete_count)
    }

    /// `Array.prototype.splice ( start, [deleteCount[, ...items]] )`
    ///
    /// Splices an array by following
    /// The deleteCount elements of the array starting at integer index start are replaced by the elements of items.
    /// An Array object containing the deleted elements (if any) is returned.
    pub(crate) fn splice(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let start = args.first();
        let delete_count = args.get(1);
        let items = args.get(2..).unwrap_or_default();

        Self::splice_internal(this, start, delete_count, items, context)
    }

    pub(crate) fn splice_internal(
        this: &JsValue,
        start: Option<&JsValue>,
        delete_count: Option<&JsValue>,
        items: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;
        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        // 3. Let relativeStart be ? ToIntegerOrInfinity(start).
        // 4. If relativeStart = -∞, let actualStart be 0.
        // 5. Else if relativeStart < 0, let actualStart be max(len + relativeStart, 0).
        // 6. Else, let actualStart be min(relativeStart, len).
        let actual_start =
            Self::get_relative_start(context, start.unwrap_or(&JsValue::undefined()), len)?;

        // 7. Let itemCount be the number of elements in items.
        let item_count = items.len() as u64;

        let actual_delete_count =
            Self::get_delete_count(len, actual_start, start, delete_count, context)?;

        // If len + itemCount - actualDeleteCount > 2**53 - 1, throw a TypeError exception.
        if len + item_count - actual_delete_count > Number::MAX_SAFE_INTEGER as u64 {
            return Err(JsNativeError::typ()
                .with_message("Target splice exceeded max safe integer value")
                .into());
        }

        // 12. Let A be ? ArraySpeciesCreate(O, actualDeleteCount).
        let arr = Self::array_species_create(&o, actual_delete_count, context)?;

        // 13. Let k be 0.
        // 14. Repeat, while k < actualDeleteCount,
        for k in 0..actual_delete_count {
            // a. Let from be ! ToString(𝔽(actualStart + k)).
            // b. If ? HasProperty(O, from) is true, then
            // b.i. Let fromValue be ? Get(O, from).
            if let Some(from_value) = o.try_get(actual_start + k, context)? {
                // ii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(k)), fromValue).
                arr.create_data_property_or_throw(k, from_value, context)?;
            }
            // c. Set k to k + 1.
        }

        // 15. Perform ? Set(A, "length", 𝔽(actualDeleteCount), true).
        Self::set_length(&arr, actual_delete_count, context)?;

        let item_count = items.len() as u64;

        match item_count.cmp(&actual_delete_count) {
            Ordering::Equal => {}
            // 16. If itemCount < actualDeleteCount, then
            Ordering::Less => {
                // a. Set k to actualStart.
                // b. Repeat, while k < (len - actualDeleteCount),
                for k in actual_start..(len - actual_delete_count) {
                    // i. Let from be ! ToString(𝔽(k + actualDeleteCount)).
                    let from = k + actual_delete_count;

                    // ii. Let to be ! ToString(𝔽(k + itemCount)).
                    let to = k + item_count;

                    // iii. If ? HasProperty(O, from) is true, then
                    // iii.1. Let fromValue be ? Get(O, from).
                    if let Some(from_value) = o.try_get(from, context)? {
                        // 2. Perform ? Set(O, to, fromValue, true).
                        o.set(to, from_value, true, context)?;
                    } else {
                        // iv. Else,
                        //     1. Perform ? DeletePropertyOrThrow(O, to).
                        o.delete_property_or_throw(to, context)?;
                    }
                    // v. Set k to k + 1.
                }

                // c. Set k to len.
                // d. Repeat, while k > (len - actualDeleteCount + itemCount),
                for k in ((len - actual_delete_count + item_count)..len).rev() {
                    // i. Perform ? DeletePropertyOrThrow(O, ! ToString(𝔽(k - 1))).
                    o.delete_property_or_throw(k, context)?;

                    // ii. Set k to k - 1.
                }
            }
            // 17. Else if itemCount > actualDeleteCount, then
            Ordering::Greater => {
                // a. Set k to (len - actualDeleteCount).
                // b. Repeat, while k > actualStart,
                for k in (actual_start..len - actual_delete_count).rev() {
                    // i. Let from be ! ToString(𝔽(k + actualDeleteCount - 1)).
                    let from = k + actual_delete_count;

                    // ii. Let to be ! ToString(𝔽(k + itemCount - 1)).
                    let to = k + item_count;

                    // iii. If ? HasProperty(O, from) is true, then
                    // iii.1. Let fromValue be ? Get(O, from).
                    if let Some(from_value) = o.try_get(from, context)? {
                        // 2. Perform ? Set(O, to, fromValue, true).
                        o.set(to, from_value, true, context)?;
                    }
                    // iv. Else,
                    else {
                        // 1. Perform ? DeletePropertyOrThrow(O, to).
                        o.delete_property_or_throw(to, context)?;
                    }
                    // v. Set k to k - 1.
                }
            }
        }

        // 18. Set k to actualStart.
        // 19. For each element E of items, do
        for (i, item) in items.iter().enumerate() {
            //     a. Perform ? Set(O, ! ToString(𝔽(k)), E, true).
            //     b. Set k to k + 1.
            o.set(actual_start + i as u64, item.clone(), true, context)?;
        }

        // 20. Perform ? Set(O, "length", 𝔽(len - actualDeleteCount + itemCount), true).
        Self::set_length(&o, len - actual_delete_count + item_count, context)?;

        // 21. Return A.
        Ok(JsValue::from(arr))
    }

    /// [`Array.prototype.toSpliced ( start, skipCount, ...items )`][spec]
    ///
    /// Splices the target array, returning the result as a new array.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.tospliced
    fn to_spliced(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        let start = args.first();
        let skip_count = args.get(1);
        let items = args.get(2..).unwrap_or_default();

        // 3. Let relativeStart be ? ToIntegerOrInfinity(start).
        // 4. If relativeStart is -∞, let actualStart be 0.
        // 5. Else if relativeStart < 0, let actualStart be max(len + relativeStart, 0).
        // 6. Else, let actualStart be min(relativeStart, len).
        let actual_start =
            Self::get_relative_start(context, start.unwrap_or(&JsValue::undefined()), len)?;

        // 7. Let insertCount be the number of elements in items.
        let insert_count = items.len() as u64;

        let actual_skip_count =
            Self::get_delete_count(len, actual_start, start, skip_count, context)?;

        // 11. Let newLen be len + insertCount - actualSkipCount.
        let new_len = len + insert_count - actual_skip_count;

        // 12. If newLen > 2**53 - 1, throw a TypeError exception.
        if new_len > Number::MAX_SAFE_INTEGER as u64 {
            return Err(JsNativeError::typ()
                .with_message("Target splice exceeded max safe integer value")
                .into());
        }

        // 13. Let A be ? ArrayCreate(newLen).
        let arr = Array::array_create(new_len, None, context)?;

        // 14. Let i be 0.
        let mut i = 0;
        // 16. Repeat, while i < actualStart,
        while i < actual_start {
            //     a. Let Pi be ! ToString(𝔽(i)).
            //     b. Let iValue be ? Get(O, Pi).
            let value = o.get(i, context)?;

            //     c. Perform ! CreateDataPropertyOrThrow(A, Pi, iValue).
            arr.create_data_property_or_throw(i, value, context)
                .js_expect("cannot fail for a newly created array")?;

            //     d. Set i to i + 1.
            i += 1;
        }

        // 17. For each element E of items, do
        for item in items.iter().cloned() {
            //     a. Let Pi be ! ToString(𝔽(i)).
            //     b. Perform ! CreateDataPropertyOrThrow(A, Pi, E).
            arr.create_data_property_or_throw(i, item, context)
                .js_expect("cannot fail for a newly created array")?;

            //     c. Set i to i + 1.
            i += 1;
        }

        // 15. Let r be actualStart + actualSkipCount.
        let mut r = actual_start + actual_skip_count;

        // 18. Repeat, while i < newLen,
        while i < new_len {
            //     a. Let Pi be ! ToString(𝔽(i)).
            //     b. Let from be ! ToString(𝔽(r)).
            //     c. Let fromValue be ? Get(O, from).
            let from_value = o.get(r, context)?;

            //     d. Perform ! CreateDataPropertyOrThrow(A, Pi, fromValue).
            arr.create_data_property_or_throw(i, from_value, context)
                .js_expect("cannot fail for a newly created array")?;

            //     e. Set i to i + 1.
            i += 1;
            //     f. Set r to r + 1.
            r += 1;
        }

        // 19. Return A.
        Ok(arr.into())
    }

    /// `Array.prototype.filter( callback, [ thisArg ] )`
    ///
    /// For each element in the array the callback function is called, and a new
    /// array is constructed for every value whose callback returned a truthy value.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.filter
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
    pub(crate) fn filter(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let length = o.length_of_array_like(context)?;

        // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback = args.get_or_undefined(0).as_callable().ok_or_else(|| {
            crate::v8_messages::callback_not_function(args.get_or_undefined(0))
        })?;
        let this_arg = args.get_or_undefined(1);

        // 4. Let A be ? ArraySpeciesCreate(O, 0).
        let a = Self::array_species_create(&o, 0, context)?;

        // 5. Let k be 0.
        // 6. Let to be 0.
        let mut to = 0u32;
        // 7. Repeat, while k < len,
        for idx in 0..length {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kPresent be ? HasProperty(O, Pk).
            // c. If kPresent is true, then
            // c.i. Let kValue be ? Get(O, Pk).
            if let Some(element) = o.try_get(idx, context)? {
                let args = [element.clone(), JsValue::new(idx), JsValue::new(o.clone())];

                // ii. Let selected be ! ToBoolean(? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »)).
                let selected = callback.call(this_arg, &args, context)?.to_boolean();

                // iii. If selected is true, then
                if selected {
                    // 1. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(to)), kValue).
                    a.create_data_property_or_throw(to, element, context)?;
                    // 2. Set to to to + 1.
                    to += 1;
                }
            }
        }

        // 8. Return A.
        Ok(a.into())
    }

    /// Array.prototype.some ( callbackfn [ , thisArg ] )
    ///
    /// The some method tests whether at least one element in the array passes
    /// the test implemented by the provided callback function. It returns a Boolean value,
    /// true if the callback function returns a truthy value for at least one element
    /// in the array. Otherwise, false.
    ///
    /// Caution: Calling this method on an empty array returns false for any condition!
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.some
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/some
    pub(crate) fn some(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;
        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;
        // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback = args.get_or_undefined(0).as_callable().ok_or_else(|| {
            crate::v8_messages::callback_not_function(args.get_or_undefined(0))
        })?;

        // 4. Let k be 0.
        // 5. Repeat, while k < len,
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kPresent be ? HasProperty(O, Pk).
            // c. If kPresent is true, then
            // c.i. Let kValue be ? Get(O, Pk).
            if let Some(k_value) = o.try_get(k, context)? {
                // ii. Let testResult be ! ToBoolean(? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »)).
                let this_arg = args.get_or_undefined(1);
                let test_result = callback
                    .call(this_arg, &[k_value, k.into(), o.clone().into()], context)?
                    .to_boolean();
                // iii. If testResult is true, return true.
                if test_result {
                    return Ok(JsValue::new(true));
                }
            }
            // d. Set k to k + 1.
        }
        // 6. Return false.
        Ok(JsValue::new(false))
    }

    /// [`SortIndexedProperties ( obj, len, SortCompare, holes )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-sortindexedproperties
    pub(crate) fn sort_indexed_properties<F>(
        obj: &JsObject,
        len: u64,
        sort_compare: F,
        skip_holes: bool,
        context: &mut Context,
    ) -> JsResult<Vec<JsValue>>
    where
        F: Fn(&JsValue, &JsValue, &mut Context) -> JsResult<Ordering>,
    {
        // 1. Let items be a new empty List.
        // doesn't matter if it clamps since it's just a best-effort optimization
        let mut items = Vec::with_capacity(len as usize);

        // 2. Let k be 0.
        // 3. Repeat, while k < len,
        for i in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. If holes is skip-holes, then
            let read = if skip_holes {
                // i. Let kRead be ? HasProperty(obj, Pk).
                obj.has_property(i, context)?
            }
            // c. Else,
            else {
                // i. Assert: holes is read-through-holes.
                // ii. Let kRead be true.
                true
            };

            // d. If kRead is true, then
            if read {
                // i. Let kValue be ? Get(obj, Pk).
                // ii. Append kValue to items.
                items.push(obj.get(i, context)?);
            }
            // e. Set k to k + 1.
        }
        // 4. Sort items using an implementation-defined sequence of calls to SortCompare. If any such call returns an abrupt completion, stop before performing any further calls to SortCompare and return that Completion Record.
        let mut sort_err = Ok(());
        items.sort_by(|x, y| {
            if sort_err.is_ok() {
                sort_compare(x, y, context).unwrap_or_else(|err| {
                    sort_err = Err(err);
                    Ordering::Equal
                })
            } else {
                Ordering::Equal
            }
        });
        sort_err?;

        // 5. Return items.
        Ok(items)
    }

    /// Array.prototype.sort ( comparefn )
    ///
    /// The sort method sorts the elements of an array in place and returns the sorted array.
    /// The default sort order is ascending, built upon converting the elements into strings,
    /// then comparing their sequences of UTF-16 code units values.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.sort
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
    pub(crate) fn sort(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If comparefn is not undefined and IsCallable(comparefn) is false, throw a TypeError exception.
        let comparefn = match args.get_or_undefined(0).variant() {
            JsVariant::Object(obj) if obj.is_callable() => Some(obj),
            JsVariant::Undefined => None,
            _ => {
                return Err(JsNativeError::typ()
                    .with_message("The comparison function must be either a function or undefined")
                    .into());
            }
        };

        // 2. Let obj be ? ToObject(this value).
        let obj = this.to_object(context)?;

        // 3. Let len be ? LengthOfArrayLike(obj).
        let len = obj.length_of_array_like(context)?;

        // 4. Let SortCompare be a new Abstract Closure with parameters (x, y) that captures comparefn and performs the following steps when called:
        let sort_compare =
            |x: &JsValue, y: &JsValue, context: &mut Context| -> JsResult<Ordering> {
                // a. Return ? CompareArrayElements(x, y, comparefn).
                compare_array_elements(x, y, comparefn.as_ref(), context)
            };

        // 5. Let sortedList be ? SortIndexedProperties(obj, len, SortCompare, skip-holes).
        let sorted = Self::sort_indexed_properties(&obj, len, sort_compare, true, context)?;

        let sorted_len = sorted.len() as u64;

        // 6. Let itemCount be the number of elements in sortedList.
        // 7. Let j be 0.
        // 8. Repeat, while j < itemCount,
        for (j, item) in sorted.into_iter().enumerate() {
            // a. Perform ? Set(obj, ! ToString(𝔽(j)), sortedList[j], true).
            obj.set(j, item, true, context)?;

            // b. Set j to j + 1.
        }

        // 9. NOTE: The call to SortIndexedProperties in step 5 uses skip-holes. The remaining indices
        //    are deleted to preserve the number of holes that were detected and excluded from the sort.
        // 10. Repeat, while j < len,
        for j in sorted_len..len {
            // a. Perform ? DeletePropertyOrThrow(obj, ! ToString(𝔽(j))).
            obj.delete_property_or_throw(j, context)?;

            // b. Set j to j + 1.
        }

        // 11. Return obj.
        Ok(obj.into())
    }

    /// [`Array.prototype.toSorted ( comparefn )`][spec]
    ///
    /// Orders the target array, returning the result in a new array.
    ///
    /// [spec]: https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.tosorted
    pub(crate) fn to_sorted(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If comparefn is not undefined and IsCallable(comparefn) is false, throw a TypeError exception.
        let comparefn = match args.get_or_undefined(0).variant() {
            JsVariant::Object(obj) if obj.is_callable() => Some(obj),
            JsVariant::Undefined => None,
            _ => {
                return Err(JsNativeError::typ()
                    .with_message("The comparison function must be either a function or undefined")
                    .into());
            }
        };

        // 2. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 3. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        // 4. Let A be ? ArrayCreate(len).
        let arr = Array::array_create(len, None, context)?;

        // 5. Let SortCompare be a new Abstract Closure with parameters (x, y) that captures comparefn and performs the following steps when called:
        let sort_compare =
            |x: &JsValue, y: &JsValue, context: &mut Context| -> JsResult<Ordering> {
                // a. Return ? CompareArrayElements(x, y, comparefn).
                compare_array_elements(x, y, comparefn.as_ref(), context)
            };

        // 6. Let sortedList be ? SortIndexedProperties(O, len, SortCompare, read-through-holes).
        let sorted = Self::sort_indexed_properties(&o, len, sort_compare, false, context)?;

        // 7. Let j be 0.
        // 8. Repeat, while j < len,
        for (i, item) in sorted.into_iter().enumerate() {
            //     a. Perform ! CreateDataPropertyOrThrow(A, ! ToString(𝔽(j)), sortedList[j]).
            arr.create_data_property_or_throw(i, item, context)
                .js_expect("cannot fail for a newly created array")?;

            //     b. Set j to j + 1.
        }

        // 9. Return A.
        Ok(arr.into())
    }

    /// `Array.prototype.reduce( callbackFn [ , initialValue ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.reduce
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce
    pub(crate) fn reduce(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback = args.get_or_undefined(0).as_callable().ok_or_else(|| {
            crate::v8_messages::callback_not_function(args.get_or_undefined(0))
        })?;

        // 4. If len = 0 and initialValue is not present, throw a TypeError exception.
        if len == 0 && args.get(1).is_none() {
            return Err(JsNativeError::typ()
                .with_message(
                    "Reduce of empty array with no initial value",
                )
                .into());
        }

        // 5. Let k be 0.
        let mut k = 0;
        // 6. Let accumulator be undefined.
        let mut accumulator = JsValue::undefined();

        // 7. If initialValue is present, then
        if let Some(initial_value) = args.get(1) {
            // a. Set accumulator to initialValue.
            accumulator = initial_value.clone();
        // 8. Else,
        } else {
            // a. Let kPresent be false.
            let mut k_present = false;
            // b. Repeat, while kPresent is false and k < len,
            while !k_present && k < len {
                // i. Let Pk be ! ToString(𝔽(k)).
                let pk = k;
                // ii. Set kPresent to ? HasProperty(O, Pk).
                // iii. If kPresent is true, then
                // iii.1. Set accumulator to ? Get(O, Pk).
                if let Some(v) = o.try_get(pk, context)? {
                    accumulator = v;
                    k_present = true;
                } else {
                    k_present = false;
                }
                // iv. Set k to k + 1.
                k += 1;
            }
            // c. If kPresent is false, throw a TypeError exception.
            if !k_present {
                return Err(JsNativeError::typ().with_message(
                    "Reduce of empty array with no initial value",
                ).into());
            }
        }

        // 9. Repeat, while k < len,
        while k < len {
            // a. Let Pk be ! ToString(𝔽(k)).
            let pk = k;
            // b. Let kPresent be ? HasProperty(O, Pk).
            // c. If kPresent is true, then
            // c.i. Let kValue be ? Get(O, Pk).
            if let Some(k_value) = o.try_get(pk, context)? {
                // ii. Set accumulator to ? Call(callbackfn, undefined, « accumulator, kValue, 𝔽(k), O »).
                accumulator = callback.call(
                    &JsValue::undefined(),
                    &[accumulator, k_value, k.into(), o.clone().into()],
                    context,
                )?;
            }
            // d. Set k to k + 1.
            k += 1;
        }

        // 10. Return accumulator.
        Ok(accumulator)
    }

    /// `Array.prototype.reduceRight( callbackFn [ , initialValue ] )`
    ///
    /// The reduceRight method traverses right to left starting from the last defined value in the array,
    /// accumulating a value using a given callback function. It returns the accumulated value.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.reduceright
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduceRight
    pub(crate) fn reduce_right(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback = args.get_or_undefined(0).as_callable().ok_or_else(|| {
            crate::v8_messages::callback_not_function(args.get_or_undefined(0))
        })?;

        // 4. If len is 0 and initialValue is not present, throw a TypeError exception.
        if len == 0 && args.get(1).is_none() {
            return Err(JsNativeError::typ().with_message(
                "Reduce of empty array with no initial value",
            ).into());
        }

        // 5. Let k be len - 1.
        let mut k = len as i64 - 1;
        // 6. Let accumulator be undefined.
        let mut accumulator = JsValue::undefined();
        // 7. If initialValue is present, then
        if let Some(initial_value) = args.get(1) {
            // a. Set accumulator to initialValue.
            accumulator = initial_value.clone();
        // 8. Else,
        } else {
            // a. Let kPresent be false.
            let mut k_present = false;
            // b. Repeat, while kPresent is false and k ≥ 0,
            while !k_present && k >= 0 {
                // i. Let Pk be ! ToString(𝔽(k)).
                let pk = k;
                // ii. Set kPresent to ? HasProperty(O, Pk).
                // iii. If kPresent is true, then
                // iii.1. Set accumulator to ? Get(O, Pk).
                if let Some(v) = o.try_get(pk, context)? {
                    k_present = true;
                    accumulator = v;
                } else {
                    k_present = false;
                }
                // iv. Set k to k - 1.
                k -= 1;
            }
            // c. If kPresent is false, throw a TypeError exception.
            if !k_present {
                return Err(JsNativeError::typ().with_message(
                    "Reduce of empty array with no initial value",
                ).into());
            }
        }

        // 9. Repeat, while k ≥ 0,
        while k >= 0 {
            // a. Let Pk be ! ToString(𝔽(k)).
            let pk = k;
            // b. Let kPresent be ? HasProperty(O, Pk).
            // c. If kPresent is true, then
            // c.i. Let kValue be ? Get(O, Pk).
            if let Some(k_value) = o.try_get(pk, context)? {
                // ii. Set accumulator to ? Call(callbackfn, undefined, « accumulator, kValue, 𝔽(k), O »).
                accumulator = callback.call(
                    &JsValue::undefined(),
                    &[accumulator.clone(), k_value, k.into(), o.clone().into()],
                    context,
                )?;
            }
            // d. Set k to k - 1.
            k -= 1;
        }

        // 10. Return accumulator.
        Ok(accumulator)
    }

    /// `Array.prototype.copyWithin ( target, start [ , end ] )`
    ///
    /// The `copyWithin()` method shallow copies part of an array to another location
    /// in the same array and returns it without modifying its length.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.copywithin
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/copyWithin
    pub(crate) fn copy_within(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        // 3. Let relativeTarget be ? ToIntegerOrInfinity(target).
        // 4. If relativeTarget is -∞, let to be 0.
        // 5. Else if relativeTarget < 0, let to be max(len + relativeTarget, 0).
        // 6. Else, let to be min(relativeTarget, len).
        let mut to = Self::get_relative_start(context, args.get_or_undefined(0), len)? as i64;

        // 7. Let relativeStart be ? ToIntegerOrInfinity(start).
        // 8. If relativeStart is -∞, let from be 0.
        // 9. Else if relativeStart < 0, let from be max(len + relativeStart, 0).
        // 10. Else, let from be min(relativeStart, len).
        let mut from = Self::get_relative_start(context, args.get_or_undefined(1), len)? as i64;

        // 11. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToIntegerOrInfinity(end).
        // 12. If relativeEnd is -∞, let final be 0.
        // 13. Else if relativeEnd < 0, let final be max(len + relativeEnd, 0).
        // 14. Else, let final be min(relativeEnd, len).
        let final_ = Self::get_relative_end(context, args.get_or_undefined(2), len)? as i64;

        // 15. Let count be min(final - from, len - to).
        let mut count = min(final_ - from, len as i64 - to);

        // 16. If from < to and to < from + count, then
        let direction = if from < to && to < from + count {
            // b. Set from to from + count - 1.
            from = from + count - 1;
            // c. Set to to to + count - 1.
            to = to + count - 1;

            // a. Let direction be -1.
            -1
        // 17. Else,
        } else {
            // a. Let direction be 1.
            1
        };

        // 18. Repeat, while count > 0,
        while count > 0 {
            // a. Let fromKey be ! ToString(𝔽(from)).
            let from_key = from;

            // b. Let toKey be ! ToString(𝔽(to)).
            let to_key = to;

            // c. Let fromPresent be ? HasProperty(O, fromKey).
            // d. If fromPresent is true, then
            // d.i. Let fromVal be ? Get(O, fromKey).
            if let Some(from_val) = o.try_get(from_key, context)? {
                // ii. Perform ? Set(O, toKey, fromVal, true).
                o.set(to_key, from_val, true, context)?;
            // e. Else,
            } else {
                // i. Assert: fromPresent is false.
                // ii. Perform ? DeletePropertyOrThrow(O, toKey).
                o.delete_property_or_throw(to_key, context)?;
            }
            // f. Set from to from + direction.
            from += direction;
            // g. Set to to to + direction.
            to += direction;
            // h. Set count to count - 1.
            count -= 1;
        }
        // 19. Return O.
        Ok(o.into())
    }

    /// `Array.prototype.values( )`
    ///
    /// The values method returns an iterable that iterates over the values in the array.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.values
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/values
    pub(crate) fn values(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Return CreateArrayIterator(O, value).
        Ok(ArrayIterator::create_array_iterator(
            o,
            PropertyNameKind::Value,
            context,
        ))
    }

    /// `Array.prototype.keys( )`
    ///
    /// The keys method returns an iterable that iterates over the indexes in the array.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.keys
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/values
    pub(crate) fn keys(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Return CreateArrayIterator(O, key).
        Ok(ArrayIterator::create_array_iterator(
            o,
            PropertyNameKind::Key,
            context,
        ))
    }

    /// `Array.prototype.entries( )`
    ///
    /// The entries method returns an iterable that iterates over the key-value pairs in the array.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.entries
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/values
    pub(crate) fn entries(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Return CreateArrayIterator(O, key+value).
        Ok(ArrayIterator::create_array_iterator(
            o,
            PropertyNameKind::KeyAndValue,
            context,
        ))
    }

    /// [`Array.prototype.with ( index, value )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype.with
    pub(crate) fn with(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let len be ? LengthOfArrayLike(O).
        let len = o.length_of_array_like(context)?;

        // 3. Let relativeIndex be ? ToIntegerOrInfinity(index).
        let IntegerOrInfinity::Integer(relative_index) =
            args.get_or_undefined(0).to_integer_or_infinity(context)?
        else {
            return Err(JsNativeError::range()
                .with_message("invalid integer index for TypedArray operation")
                .into());
        };

        let value = args.get_or_undefined(1);

        // 4. If relativeIndex ≥ 0, let actualIndex be relativeIndex.
        let actual_index = u64::try_from(relative_index) // should succeed if `relative_index >= 0`
            .ok()
            // 5. Else, let actualIndex be len + relativeIndex.
            .or_else(|| len.checked_add_signed(relative_index))
            .filter(|&rel| rel < len)
            .ok_or_else(|| {
                // 6. If actualIndex ≥ len or actualIndex < 0, throw a RangeError exception.
                JsNativeError::range()
                    .with_message("invalid integer index for TypedArray operation")
            })?;

        // 7. Let A be ? ArrayCreate(len).
        let new_array = Array::array_create(len, None, context)?;

        // 8. Let k be 0.
        // 9. Repeat, while k < len,
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            let from_value = if k == actual_index {
                // b. If k is actualIndex, let fromValue be value.
                value.clone()
            } else {
                // c. Else, let fromValue be ? Get(O, Pk).
                o.get(k, context)?
            };

            // d. Perform ! CreateDataPropertyOrThrow(A, Pk, fromValue).
            new_array
                .create_data_property_or_throw(k, from_value, context)
                .js_expect("cannot fail for a newly created array")?;

            // e. Set k to k + 1.
        }

        // 10. Return A.
        Ok(new_array.into())
    }

    /// Represents the algorithm to calculate `relativeStart` (or `k`) in array functions.
    pub(super) fn get_relative_start(
        context: &mut Context,
        arg: &JsValue,
        len: u64,
    ) -> JsResult<u64> {
        // 1. Let relativeStart be ? ToIntegerOrInfinity(start).
        let relative_start = arg.to_integer_or_infinity(context)?;
        let start = match relative_start {
            // 2. If relativeStart is -∞, let k be 0.
            IntegerOrInfinity::NegativeInfinity => 0,
            // 3. Else if relativeStart < 0, let k be max(len + relativeStart, 0).
            IntegerOrInfinity::Integer(i) if i < 0 => len.checked_add_signed(i).unwrap_or(0),
            // 4. Else, let k be min(relativeStart, len).
            IntegerOrInfinity::Integer(i) => min(i as u64, len),

            // Special case - positive infinity. `len` is always smaller than +inf, thus from (4)
            IntegerOrInfinity::PositiveInfinity => len,
        };

        Ok(start)
    }

    /// Represents the algorithm to calculate `relativeEnd` (or `final`) in array functions.
    pub(super) fn get_relative_end(
        context: &mut Context,
        value: &JsValue,
        len: u64,
    ) -> JsResult<u64> {
        // 1. If end is undefined, let relativeEnd be len [and return it]
        if value.is_undefined() {
            Ok(len)
        } else {
            // 1. cont, else let relativeEnd be ? ToIntegerOrInfinity(end).
            let relative_end = value.to_integer_or_infinity(context)?;
            let end = match relative_end {
                // 2. If relativeEnd is -∞, let final be 0.
                IntegerOrInfinity::NegativeInfinity => 0,
                // 3. Else if relativeEnd < 0, let final be max(len + relativeEnd, 0).
                IntegerOrInfinity::Integer(i) if i < 0 => len.checked_add_signed(i).unwrap_or(0),
                // 4. Else, let final be min(relativeEnd, len).
                // Both `as` casts are safe as both variables are non-negative
                IntegerOrInfinity::Integer(i) => min(i as u64, len),

                // Special case - positive infinity. `len` is always smaller than +inf, thus from (4)
                IntegerOrInfinity::PositiveInfinity => len,
            };

            Ok(end)
        }
    }

    /// `Array.prototype [ @@unscopables ]`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-array.prototype-@@unscopables
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/@@unscopables
    pub(crate) fn unscopables_object() -> JsObject {
        // 1. Let unscopableList be OrdinaryObjectCreate(null).
        let unscopable_list = JsObject::with_null_proto();
        let true_prop = PropertyDescriptor::builder()
            .value(true)
            .writable(true)
            .enumerable(true)
            .configurable(true);
        {
            let mut obj = unscopable_list.borrow_mut();
            // 2. Perform ! CreateDataPropertyOrThrow(unscopableList, "at", true).
            obj.insert(js_string!("at"), true_prop.clone());
            // 3. Perform ! CreateDataPropertyOrThrow(unscopableList, "copyWithin", true).
            obj.insert(js_string!("copyWithin"), true_prop.clone());
            // 4. Perform ! CreateDataPropertyOrThrow(unscopableList, "entries", true).
            obj.insert(js_string!("entries"), true_prop.clone());
            // 5. Perform ! CreateDataPropertyOrThrow(unscopableList, "fill", true).
            obj.insert(js_string!("fill"), true_prop.clone());
            // 6. Perform ! CreateDataPropertyOrThrow(unscopableList, "find", true).
            obj.insert(js_string!("find"), true_prop.clone());
            // 7. Perform ! CreateDataPropertyOrThrow(unscopableList, "findIndex", true).
            obj.insert(js_string!("findIndex"), true_prop.clone());
            // 8. Perform ! CreateDataPropertyOrThrow(unscopableList, "findLast", true).
            obj.insert(js_string!("findLast"), true_prop.clone());
            // 9. Perform ! CreateDataPropertyOrThrow(unscopableList, "findLastIndex", true).
            obj.insert(js_string!("findLastIndex"), true_prop.clone());
            // 10. Perform ! CreateDataPropertyOrThrow(unscopableList, "flat", true).
            obj.insert(js_string!("flat"), true_prop.clone());
            // 11. Perform ! CreateDataPropertyOrThrow(unscopableList, "flatMap", true).
            obj.insert(js_string!("flatMap"), true_prop.clone());
            // 12. Perform ! CreateDataPropertyOrThrow(unscopableList, "includes", true).
            obj.insert(js_string!("includes"), true_prop.clone());
            // 13. Perform ! CreateDataPropertyOrThrow(unscopableList, "keys", true).
            obj.insert(js_string!("keys"), true_prop.clone());
            // 14. Perform ! CreateDataPropertyOrThrow(unscopableList, "toReversed", true).
            obj.insert(js_string!("toReversed"), true_prop.clone());
            // 15. Perform ! CreateDataPropertyOrThrow(unscopableList, "toSorted", true).
            obj.insert(js_string!("toSorted"), true_prop.clone());
            // 16. Perform ! CreateDataPropertyOrThrow(unscopableList, "toSpliced", true).
            obj.insert(js_string!("toSpliced"), true_prop.clone());
            // 17. Perform ! CreateDataPropertyOrThrow(unscopableList, "values", true).
            obj.insert(js_string!("values"), true_prop);
        }

        // 13. Return unscopableList.
        unscopable_list
    }
}

/// [`CompareArrayElements ( x, y, comparefn )`][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-comparearrayelements
fn compare_array_elements(
    x: &JsValue,
    y: &JsValue,
    comparefn: Option<&JsObject>,
    context: &mut Context,
) -> JsResult<Ordering> {
    match (x.is_undefined(), y.is_undefined()) {
        // 1. If x and y are both undefined, return +0𝔽.
        (true, true) => return Ok(Ordering::Equal),
        // 2. If x is undefined, return 1𝔽.
        (true, false) => return Ok(Ordering::Greater),
        // 3. If y is undefined, return -1𝔽.
        (false, true) => return Ok(Ordering::Less),
        _ => {}
    }

    // 4. If comparefn is not undefined, then
    if let Some(cmp) = comparefn {
        let args = [x.clone(), y.clone()];
        //     a. Let v be ? ToNumber(? Call(comparefn, undefined, « x, y »)).
        let v = cmp
            .call(&JsValue::undefined(), &args, context)?
            .to_number(context)?;
        //     b. If v is NaN, return +0𝔽.
        //     c. Return v.
        return Ok(v.partial_cmp(&0.0).unwrap_or(Ordering::Equal));
    }

    // 5. Let xString be ? ToString(x).
    let x_str = x.to_string(context)?;

    // 6. Let yString be ? ToString(y).
    let y_str = y.to_string(context)?;

    // 7. Let xSmaller be ! IsLessThan(xString, yString, true).
    // 8. If xSmaller is true, return -1𝔽.
    // 9. Let ySmaller be ! IsLessThan(yString, xString, true).
    // 10. If ySmaller is true, return 1𝔽.
    // 11. Return +0𝔽.
    // NOTE: skipped IsLessThan because it just makes a lexicographic comparison
    // when x and y are strings
    Ok(x_str.cmp(&y_str))
}

/// `FindViaPredicate ( O, len, direction, predicate, thisArg )`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-findviapredicate
pub(crate) fn find_via_predicate(
    o: &JsObject,
    len: u64,
    direction: Direction,
    predicate: &JsValue,
    this_arg: &JsValue,
    context: &mut Context,
    caller_name: &str,
) -> JsResult<(JsValue, JsValue)> {
    // 1. If IsCallable(predicate) is false, throw a TypeError exception.
    let predicate = predicate.as_callable().ok_or_else(|| {
        crate::v8_messages::callback_not_function(predicate)
    })?;

    let indices = match direction {
        // 2. If direction is ascending, then
        // a. Let indices be a List of the integers in the interval from 0 (inclusive) to len (exclusive), in ascending order.
        Direction::Ascending => itertools::Either::Left(0..len),
        // 3. Else,
        // a. Let indices be a List of the integers in the interval from 0 (inclusive) to len (exclusive), in descending order.
        Direction::Descending => itertools::Either::Right((0..len).rev()),
    };

    // 4. For each integer k of indices, do
    for k in indices {
        // a. Let Pk be ! ToString(𝔽(k)).
        let pk = k;

        // b. NOTE: If O is a TypedArray, the following invocation of Get will return a normal completion.
        // c. Let kValue be ? Get(O, Pk).
        let k_value = o.get(pk, context)?;

        // d. Let testResult be ? Call(predicate, thisArg, « kValue, 𝔽(k), O »).
        let test_result = predicate
            .call(
                this_arg,
                &[k_value.clone(), k.into(), o.clone().into()],
                context,
            )?
            .to_boolean();

        if test_result {
            // e. If ToBoolean(testResult) is true, return the Record { [[Index]]: 𝔽(k), [[Value]]: kValue }.
            return Ok((JsValue::new(k), k_value));
        }
    }

    // 5. Return the Record { [[Index]]: -1𝔽, [[Value]]: undefined }
    Ok((JsValue::new(-1), JsValue::undefined()))
}

/// Define an own property for an array exotic object.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-array-exotic-objects-defineownproperty-p-desc
fn array_exotic_define_own_property(
    obj: &JsObject,
    key: &PropertyKey,
    desc: PropertyDescriptor,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    // 1. Assert: IsPropertyKey(P) is true.
    match key {
        // 2. If P is "length", then
        PropertyKey::String(s) if s == &StaticJsStrings::LENGTH => {
            // a. Return ? ArraySetLength(A, Desc).

            array_set_length(obj, desc, context)
        }
        // 3. Else if P is an array index, then
        PropertyKey::Index(index) => {
            let index = index.get();
            let new_len = index + 1;

            // Optimization: If the shape of the object is the array template shape,
            // we know the position of the "length" property.
            if u64::from(new_len) < (2u64.pow(32) - 1) {
                let borrowed_object = obj.borrow();
                if borrowed_object.properties().shape.to_addr_usize()
                    == context
                        .intrinsics()
                        .templates()
                        .array()
                        .shape()
                        .to_addr_usize()
                {
                    let old_len = borrowed_object.properties().storage[0].clone();
                    drop(borrowed_object);
                    let old_len = old_len.to_u32(context)?;
                    if new_len >= old_len {
                        if ordinary_define_own_property(obj, key, desc, context)? {
                            let mut borrowed_object = obj.borrow_mut();
                            borrowed_object.properties_mut().storage[0] = JsValue::new(new_len);
                            return Ok(true);
                        }
                        return Ok(false);
                    }
                }
            }

            // a. Let oldLenDesc be OrdinaryGetOwnProperty(A, "length").
            let old_len_desc =
                ordinary_get_own_property(obj, &StaticJsStrings::LENGTH.into(), context)?
                    .expect("the property descriptor must exist");

            // b. Assert: ! IsDataDescriptor(oldLenDesc) is true.
            debug_assert!(old_len_desc.is_data_descriptor());

            // c. Assert: oldLenDesc.[[Configurable]] is false.
            debug_assert!(!old_len_desc.expect_configurable());

            // d. Let oldLen be oldLenDesc.[[Value]].
            // e. Assert: oldLen is a non-negative integral Number.
            // f. Let index be ! ToUint32(P).
            let old_len = old_len_desc
                .expect_value()
                .to_u32(context)
                .js_expect("this ToUint32 call must not fail")?;

            // g. If index ≥ oldLen and oldLenDesc.[[Writable]] is false, return false.
            if index >= old_len && !old_len_desc.expect_writable() {
                return Ok(false);
            }

            // h. Let succeeded be ! OrdinaryDefineOwnProperty(A, P, Desc).
            if ordinary_define_own_property(obj, key, desc, context)? {
                // j. If index ≥ oldLen, then
                if index >= old_len {
                    // i. Set oldLenDesc.[[Value]] to index + 1𝔽.
                    let old_len_desc = PropertyDescriptor::builder()
                        .value(new_len)
                        .maybe_writable(old_len_desc.writable())
                        .maybe_enumerable(old_len_desc.enumerable())
                        .maybe_configurable(old_len_desc.configurable());

                    // ii. Set succeeded to OrdinaryDefineOwnProperty(A, "length", oldLenDesc).
                    let succeeded = ordinary_define_own_property(
                        obj,
                        &StaticJsStrings::LENGTH.into(),
                        old_len_desc.into(),
                        context,
                    )?;

                    // iii. Assert: succeeded is true.
                    debug_assert!(succeeded);
                }

                // k. Return true.
                Ok(true)
            } else {
                // i. If succeeded is false, return false.
                Ok(false)
            }
        }
        // 4. Return OrdinaryDefineOwnProperty(A, P, Desc).
        _ => ordinary_define_own_property(obj, key, desc, context),
    }
}

/// Abstract operation `ArraySetLength ( A, Desc )`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-arraysetlength
fn array_set_length(
    obj: &JsObject,
    desc: PropertyDescriptor,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    // 1. If Desc.[[Value]] is absent, then
    let Some(new_len_val) = desc.value() else {
        // a. Return OrdinaryDefineOwnProperty(A, "length", Desc).
        return ordinary_define_own_property(obj, &StaticJsStrings::LENGTH.into(), desc, context);
    };

    // 3. Let newLen be ? ToUint32(Desc.[[Value]]).
    let new_len = new_len_val.to_u32(context)?;

    // 4. Let numberLen be ? ToNumber(Desc.[[Value]]).
    let number_len = new_len_val.to_number(context)?;

    // 5. If SameValueZero(newLen, numberLen) is false, throw a RangeError exception.
    #[allow(clippy::float_cmp)]
    if f64::from(new_len) != number_len {
        return Err(JsNativeError::range()
            .with_message("bad length for array")
            .into());
    }

    // 2. Let newLenDesc be a copy of Desc.
    // 6. Set newLenDesc.[[Value]] to newLen.
    let mut new_len_desc = PropertyDescriptor::builder()
        .value(new_len)
        .maybe_writable(desc.writable())
        .maybe_enumerable(desc.enumerable())
        .maybe_configurable(desc.configurable());

    // 7. Let oldLenDesc be OrdinaryGetOwnProperty(A, "length").
    let old_len_desc = ordinary_get_own_property(obj, &StaticJsStrings::LENGTH.into(), context)?
        .expect("the property descriptor must exist");

    // 8. Assert: ! IsDataDescriptor(oldLenDesc) is true.
    debug_assert!(old_len_desc.is_data_descriptor());

    // 9. Assert: oldLenDesc.[[Configurable]] is false.
    debug_assert!(!old_len_desc.expect_configurable());

    // 10. Let oldLen be oldLenDesc.[[Value]].
    let old_len = old_len_desc.expect_value();

    // 11. If newLen ≥ oldLen, then
    if new_len >= old_len.to_u32(context)? {
        // a. Return OrdinaryDefineOwnProperty(A, "length", newLenDesc).
        return ordinary_define_own_property(
            obj,
            &StaticJsStrings::LENGTH.into(),
            new_len_desc.build(),
            context,
        );
    }

    // 12. If oldLenDesc.[[Writable]] is false, return false.
    if !old_len_desc.expect_writable() {
        return Ok(false);
    }

    // 13. If newLenDesc.[[Writable]] is absent or has the value true, let newWritable be true.
    let new_writable = if new_len_desc.inner().writable().unwrap_or(true) {
        true
    }
    // 14. Else,
    else {
        // a. NOTE: Setting the [[Writable]] attribute to false is deferred in case any
        // elements cannot be deleted.
        // c. Set newLenDesc.[[Writable]] to true.
        new_len_desc = new_len_desc.writable(true);

        // b. Let newWritable be false.
        false
    };

    // 15. Let succeeded be ! OrdinaryDefineOwnProperty(A, "length", newLenDesc).
    // 16. If succeeded is false, return false.
    if !ordinary_define_own_property(
        obj,
        &StaticJsStrings::LENGTH.into(),
        new_len_desc.clone().build(),
        context,
    )
    .js_expect("this OrdinaryDefineOwnProperty call must not fail")?
    {
        return Ok(false);
    }

    // 17. For each own property key P of A that is an array index, whose numeric value is
    // greater than or equal to newLen, in descending numeric index order, do
    let ordered_keys = {
        let mut keys: Vec<_> = obj
            .borrow()
            .properties
            .index_property_keys()
            .filter(|idx| new_len <= *idx && *idx < u32::MAX)
            .collect();
        keys.sort_unstable_by(|x, y| y.cmp(x));
        keys
    };

    for index in ordered_keys {
        // a. Let deleteSucceeded be ! A.[[Delete]](P).
        // b. If deleteSucceeded is false, then
        if !obj.__delete__(&index.into(), context)? {
            // i. Set newLenDesc.[[Value]] to ! ToUint32(P) + 1𝔽.
            new_len_desc = new_len_desc.value(index + 1);

            // ii. If newWritable is false, set newLenDesc.[[Writable]] to false.
            if !new_writable {
                new_len_desc = new_len_desc.writable(false);
            }

            // iii. Perform ! OrdinaryDefineOwnProperty(A, "length", newLenDesc).
            ordinary_define_own_property(
                obj,
                &StaticJsStrings::LENGTH.into(),
                new_len_desc.build(),
                context,
            )
            .js_expect("this OrdinaryDefineOwnProperty call must not fail")?;

            // iv. Return false.
            return Ok(false);
        }
    }

    // 18. If newWritable is false, then
    if !new_writable {
        // a. Set succeeded to ! OrdinaryDefineOwnProperty(A, "length",
        // PropertyDescriptor { [[Writable]]: false }).
        let succeeded = ordinary_define_own_property(
            obj,
            &StaticJsStrings::LENGTH.into(),
            PropertyDescriptor::builder().writable(false).build(),
            context,
        )
        .js_expect("this OrdinaryDefineOwnProperty call must not fail")?;

        // b. Assert: succeeded is true.
        debug_assert!(succeeded);
    }

    // 19. Return true.
    Ok(true)
}
