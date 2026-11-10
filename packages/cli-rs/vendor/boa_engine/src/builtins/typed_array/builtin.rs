use std::{
    cmp::{self, min},
    sync::atomic::Ordering,
};

use num_traits::Zero;

use super::{
    ContentType, TypedArray, TypedArrayKind, TypedArrayMarker, object::typed_array_set_element,
};
use crate::{
    Context, JsArgs, JsExpect, JsNativeError, JsObject, JsResult, JsString, JsSymbol, JsValue,
    builtins::{
        Array, BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        array::{ArrayIterator, Direction, find_via_predicate},
        array_buffer::{
            ArrayBuffer, BufferObject,
            utils::{SliceRefMut, memcpy, memmove},
        },
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::internal_methods::get_prototype_from_constructor,
    property::{Attribute, PropertyNameKind},
    realm::Realm,
    string::StaticJsStrings,
    value::IntegerOrInfinity,
};
use crate::{builtins::array_buffer::utils::memmove_naive, value::JsVariant};

/// The JavaScript `%TypedArray%` object.
///
/// <https://tc39.es/ecma262/#sec-%typedarray%-intrinsic-object>
#[derive(Debug, Clone, Copy)]
pub(crate) struct BuiltinTypedArray;

impl IntrinsicObject for BuiltinTypedArray {
    fn init(realm: &Realm) {
        let get_species = BuiltInBuilder::callable(realm, Self::get_species)
            .name(js_string!("get [Symbol.species]"))
            .build();

        let get_buffer = BuiltInBuilder::callable(realm, Self::buffer)
            .name(js_string!("get buffer"))
            .build();

        let get_byte_length = BuiltInBuilder::callable(realm, Self::byte_length)
            .name(js_string!("get byteLength"))
            .build();

        let get_byte_offset = BuiltInBuilder::callable(realm, Self::byte_offset)
            .name(js_string!("get byteOffset"))
            .build();

        let get_length = BuiltInBuilder::callable(realm, Self::length)
            .name(js_string!("get length"))
            .build();

        let get_to_string_tag = BuiltInBuilder::callable(realm, Self::to_string_tag)
            .name(js_string!("get [Symbol.toStringTag]"))
            .build();

        let values_function = BuiltInBuilder::callable(realm, Self::values)
            .name(js_string!("values"))
            .length(0)
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_accessor(
                JsSymbol::species(),
                Some(get_species),
                None,
                Attribute::CONFIGURABLE,
            )
            .property(
                JsSymbol::iterator(),
                values_function.clone(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("buffer"),
                Some(get_buffer),
                None,
                Attribute::CONFIGURABLE | Attribute::NON_ENUMERABLE,
            )
            .accessor(
                js_string!("byteLength"),
                Some(get_byte_length),
                None,
                Attribute::CONFIGURABLE | Attribute::NON_ENUMERABLE,
            )
            .accessor(
                js_string!("byteOffset"),
                Some(get_byte_offset),
                None,
                Attribute::CONFIGURABLE | Attribute::NON_ENUMERABLE,
            )
            .accessor(
                StaticJsStrings::LENGTH,
                Some(get_length),
                None,
                Attribute::CONFIGURABLE | Attribute::NON_ENUMERABLE,
            )
            .accessor(
                JsSymbol::to_string_tag(),
                Some(get_to_string_tag),
                None,
                Attribute::CONFIGURABLE | Attribute::NON_ENUMERABLE,
            )
            .static_method(Self::from, js_string!("from"), 1)
            .static_method(Self::of, js_string!("of"), 0)
            .method(Self::at, js_string!("at"), 1)
            .method(Self::copy_within, js_string!("copyWithin"), 2)
            .method(Self::entries, js_string!("entries"), 0)
            .method(Self::every, js_string!("every"), 1)
            .method(Self::fill, js_string!("fill"), 1)
            .method(Self::filter, js_string!("filter"), 1)
            .method(Self::find, js_string!("find"), 1)
            .method(Self::find_index, js_string!("findIndex"), 1)
            .method(Self::find_last, js_string!("findLast"), 1)
            .method(Self::find_last_index, js_string!("findLastIndex"), 1)
            .method(Self::for_each, js_string!("forEach"), 1)
            .method(Self::includes, js_string!("includes"), 1)
            .method(Self::index_of, js_string!("indexOf"), 1)
            .method(Self::join, js_string!("join"), 1)
            .method(Self::keys, js_string!("keys"), 0)
            .method(Self::last_index_of, js_string!("lastIndexOf"), 1)
            .method(Self::map, js_string!("map"), 1)
            .method(Self::reduce, js_string!("reduce"), 1)
            .method(Self::reduceright, js_string!("reduceRight"), 1)
            .method(Self::reverse, js_string!("reverse"), 0)
            .method(Self::set, js_string!("set"), 1)
            .method(Self::slice, js_string!("slice"), 2)
            .method(Self::some, js_string!("some"), 1)
            .method(Self::sort, js_string!("sort"), 1)
            .method(Self::subarray, js_string!("subarray"), 2)
            .method(Self::to_locale_string, js_string!("toLocaleString"), 0)
            .method(Self::to_reversed, js_string!("toReversed"), 0)
            .method(Self::to_sorted, js_string!("toSorted"), 1)
            .method(Self::with, js_string!("with"), 2)
            // 23.2.3.29 %TypedArray%.prototype.toString ( )
            // The initial value of the %TypedArray%.prototype.toString data property is the same
            // built-in function object as the Array.prototype.toString method defined in 23.1.3.30.
            .property(
                js_string!("toString"),
                realm.intrinsics().objects().array_prototype_to_string(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("values"),
                values_function,
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for BuiltinTypedArray {
    const NAME: JsString = StaticJsStrings::TYPED_ARRAY;
}

impl BuiltInConstructor for BuiltinTypedArray {
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 42;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 4;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::typed_array;

    /// `%TypedArray% ( )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%
    fn constructor(_: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Throw a TypeError exception.
        Err(JsNativeError::typ()
            .with_message("the TypedArray constructor should never be called directly")
            .into())
    }
}

impl BuiltinTypedArray {
    /// `%TypedArray%.from ( source [ , mapfn [ , thisArg ] ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.from
    fn from(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let C be the this value.
        // 2. If IsConstructor(C) is false, throw a TypeError exception.
        let constructor = match this.as_object() {
            Some(obj) if obj.is_constructor() => obj,
            _ => {
                return Err(JsNativeError::typ()
                    .with_message("TypedArray.from called on non-constructable value")
                    .into());
            }
        };

        let mapping = match args.get(1).map(JsValue::variant) {
            // 3. If mapfn is undefined, let mapping be false.
            None | Some(JsVariant::Undefined) => None,
            // 4. Else,
            // b. Let mapping be true.
            Some(JsVariant::Object(obj)) if obj.is_callable() => Some(obj),
            // a. If IsCallable(mapfn) is false, throw a TypeError exception.
            _ => {
                return Err(JsNativeError::typ()
                    .with_message("TypedArray.from called with non-callable mapfn")
                    .into());
            }
        };

        // 5. Let usingIterator be ? GetMethod(source, @@iterator).
        let source = args.get_or_undefined(0);
        let using_iterator = source.get_method(JsSymbol::iterator(), context)?;

        let this_arg = args.get_or_undefined(2);

        // 6. If usingIterator is not undefined, then
        if let Some(using_iterator) = using_iterator {
            // a. Let values be ? IterableToList(source, usingIterator).
            let values = source
                .get_iterator_from_method(&using_iterator, context)?
                .into_list(context)?;

            // b. Let len be the number of elements in values.
            // c. Let targetObj be ? TypedArrayCreate(C, « 𝔽(len) »).
            let target_obj = Self::create(&constructor, &[values.len().into()], context)?.upcast();

            // d. Let k be 0.
            // e. Repeat, while k < len,
            for (k, k_value) in values.iter().enumerate() {
                // i. Let Pk be ! ToString(𝔽(k)).
                // ii. Let kValue be the first element of values and remove that element from values.
                // iii. If mapping is true, then
                let mapped_value = if let Some(map_fn) = &mapping {
                    // 1. Let mappedValue be ? Call(mapfn, thisArg, « kValue, 𝔽(k) »).
                    map_fn.call(this_arg, &[k_value.clone(), k.into()], context)?
                }
                // iv. Else, let mappedValue be kValue.
                else {
                    k_value.clone()
                };

                // v. Perform ? Set(targetObj, Pk, mappedValue, true).
                target_obj.set(k, mapped_value, true, context)?;
            }

            // f. Assert: values is now an empty List.
            // g. Return targetObj.
            return Ok(target_obj.into());
        }

        // 7. NOTE: source is not an Iterable so assume it is already an array-like object.
        // 8. Let arrayLike be ! ToObject(source).
        let array_like = source
            .to_object(context)
            .js_expect("ToObject cannot fail here")?;

        // 9. Let len be ? LengthOfArrayLike(arrayLike).
        let len = array_like.length_of_array_like(context)?;

        // 10. Let targetObj be ? TypedArrayCreate(C, « 𝔽(len) »).
        let target_obj = Self::create(&constructor, &[len.into()], context)?.upcast();

        // 11. Let k be 0.
        // 12. Repeat, while k < len,
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kValue be ? Get(arrayLike, Pk).
            let k_value = array_like.get(k, context)?;

            // c. If mapping is true, then
            let mapped_value = if let Some(map_fn) = &mapping {
                // i. Let mappedValue be ? Call(mapfn, thisArg, « kValue, 𝔽(k) »).
                map_fn.call(this_arg, &[k_value, k.into()], context)?
            }
            // d. Else, let mappedValue be kValue.
            else {
                k_value
            };

            // e. Perform ? Set(targetObj, Pk, mappedValue, true).
            target_obj.set(k, mapped_value, true, context)?;
        }

        // 13. Return targetObj.
        Ok(target_obj.into())
    }

    /// [`TypedArrayCreateSameType ( exemplar, argumentList )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-typedarray-create-same-type
    fn from_kind_and_length(
        kind: TypedArrayKind,
        length: u64,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        let constructor =
            kind.standard_constructor()(context.intrinsics().constructors()).constructor();

        Self::create(&constructor, &[length.into()], context).map(JsObject::upcast)
    }

    /// `%TypedArray%.of ( ...items )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.of
    fn of(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let len be the number of elements in items.

        // 2. Let C be the this value.
        // 3. If IsConstructor(C) is false, throw a TypeError exception.
        let constructor = match this.as_object() {
            Some(obj) if obj.is_constructor() => obj,
            _ => {
                return Err(JsNativeError::typ()
                    .with_message("TypedArray.of called on non-constructable value")
                    .into());
            }
        };

        // 4. Let newObj be ? TypedArrayCreate(C, « 𝔽(len) »).
        let new_obj = Self::create(&constructor, &[args.len().into()], context)?.upcast();

        // 5. Let k be 0.
        // 6. Repeat, while k < len,
        for (k, k_value) in args.iter().enumerate() {
            // a. Let kValue be items[k].
            // b. Let Pk be ! ToString(𝔽(k)).
            // c. Perform ? Set(newObj, Pk, kValue, true).
            new_obj.set(k, k_value.clone(), true, context)?;
        }

        // 7. Return newObj.
        Ok(new_obj.into())
    }

    /// `get %TypedArray% [ @@species ]`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-%typedarray%-@@species
    #[allow(clippy::unnecessary_wraps)]
    pub(super) fn get_species(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Return the this value.
        Ok(this.clone())
    }

    /// `%TypedArray%.prototype.at ( index )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.at
    pub(crate) fn at(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (o, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = o.borrow().data().array_length(buf_len) as i64;

        // 4. Let relativeIndex be ? ToIntegerOrInfinity(index).
        let relative_index = args.get_or_undefined(0).to_integer_or_infinity(context)?;

        let k = match relative_index {
            // Note: Early undefined return on infinity.
            IntegerOrInfinity::PositiveInfinity | IntegerOrInfinity::NegativeInfinity => {
                return Ok(JsValue::undefined());
            }
            // 5. If relativeIndex ≥ 0, then
            // a. Let k be relativeIndex.
            IntegerOrInfinity::Integer(i) if i >= 0 => i,
            // 6. Else,
            // a. Let k be len + relativeIndex.
            IntegerOrInfinity::Integer(i) => len + i,
        };

        // 7. If k < 0 or k ≥ len, return undefined.
        if k < 0 || k >= len {
            return Ok(JsValue::undefined());
        }

        // 8. Return ! Get(O, ! ToString(𝔽(k))).
        Ok(o.upcast()
            .get(k, context)
            .js_expect("Get cannot fail here")?)
    }

    /// `get %TypedArray%.prototype.buffer`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-%typedarray%.prototype.buffer
    pub(crate) fn buffer(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Perform ? RequireInternalSlot(O, [[TypedArrayName]]).
        // 3. Assert: O has a [[ViewedArrayBuffer]] internal slot.
        let object = this.as_object();
        let ta = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<TypedArray>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("`this` is not a typed array object")
            })?;

        // 4. Let buffer be O.[[ViewedArrayBuffer]].
        // 5. Return buffer.
        Ok(ta.viewed_array_buffer().clone().into())
    }

    /// `get %TypedArray%.prototype.byteLength`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-%typedarray%.prototype.bytelength
    pub(crate) fn byte_length(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Perform ? RequireInternalSlot(O, [[TypedArrayName]]).
        // 3. Assert: O has a [[ViewedArrayBuffer]] internal slot.
        let object = this.as_object();
        let ta = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<TypedArray>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("`this` is not a typed array object")
            })?;

        // 4. Let taRecord be MakeTypedArrayWithBufferWitnessRecord(O, seq-cst).
        let buf_len = ta
            .viewed_array_buffer()
            .as_buffer()
            .bytes(Ordering::SeqCst)
            .map(|s| s.len())
            .unwrap_or_default();

        // 5. Let size be TypedArrayByteLength(taRecord).
        // 6. Return 𝔽(size).
        Ok(ta.byte_length(buf_len).into())
    }

    /// `get %TypedArray%.prototype.byteOffset`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-%typedarray%.prototype.byteoffset
    pub(crate) fn byte_offset(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Perform ? RequireInternalSlot(O, [[TypedArrayName]]).
        // 3. Assert: O has a [[ViewedArrayBuffer]] internal slot.
        let object = this.as_object();
        let ta = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<TypedArray>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("Value is not a typed array object")
            })?;

        // 4. Let taRecord be MakeTypedArrayWithBufferWitnessRecord(O, seq-cst).
        // 5. If IsTypedArrayOutOfBounds(taRecord) is true, return +0𝔽.
        if ta
            .viewed_array_buffer()
            .as_buffer()
            .bytes(Ordering::SeqCst)
            .as_ref()
            .is_none_or(|s| ta.is_out_of_bounds(s.len()))
        {
            return Ok(0.into());
        }

        // 6. Let offset be O.[[ByteOffset]].
        // 7. Return 𝔽(offset).
        Ok(ta.byte_offset().into())
    }

    /// `%TypedArray%.prototype.copyWithin ( target, start [ , end ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.copywithin
    pub(crate) fn copy_within(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 4. Let relativeTarget be ? ToIntegerOrInfinity(target).
        // 5. If relativeTarget is -∞, let to be 0.
        // 6. Else if relativeTarget < 0, let to be max(len + relativeTarget, 0).
        // 7. Else, let to be min(relativeTarget, len).
        let to = Array::get_relative_start(context, args.get_or_undefined(0), len)?;

        // 8. Let relativeStart be ? ToIntegerOrInfinity(start).
        // 9. If relativeStart is -∞, let from be 0.
        // 10. Else if relativeStart < 0, let from be max(len + relativeStart, 0).
        // 11. Else, let from be min(relativeStart, len).
        let from = Array::get_relative_start(context, args.get_or_undefined(1), len)?;

        // 12. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToIntegerOrInfinity(end).
        // 13. If relativeEnd is -∞, let final be 0.
        // 14. Else if relativeEnd < 0, let final be max(len + relativeEnd, 0).
        // 15. Else, let final be min(relativeEnd, len).
        let final_ = Array::get_relative_end(context, args.get_or_undefined(2), len)?;

        // 16. Let count be min(final - from, len - to).
        let count = match (final_.checked_sub(from), len.checked_sub(to)) {
            (Some(lhs), Some(rhs)) => min(lhs, rhs),
            _ => 0,
        };

        // 17. If count > 0, then
        if count > 0 {
            let ta = ta.borrow();
            let ta = ta.data();

            // a. NOTE: The copying must be performed in a manner that preserves the bit-level encoding of the source data.
            // b. Let buffer be O.[[ViewedArrayBuffer]].
            // c. Set taRecord to MakeTypedArrayWithBufferWitnessRecord(O, seq-cst).
            // d. If IsTypedArrayOutOfBounds(taRecord) is true, throw a TypeError exception.
            let buffer_obj = ta.viewed_array_buffer();
            let mut buffer = buffer_obj.as_buffer_mut();
            let Some(mut buf) = buffer
                .bytes(Ordering::SeqCst)
                .filter(|s| !ta.is_out_of_bounds(s.len()))
            else {
                return Err(JsNativeError::typ()
                    .with_message("typed array is outside the bounds of its inner buffer")
                    .into());
            };

            // e. Set len to TypedArrayLength(taRecord).
            let len = ta.array_length(buf.len());

            // f. Let elementSize be TypedArrayElementSize(O).
            let element_size = ta.kind().element_size();

            // g. Let byteOffset be O.[[ByteOffset]].
            let byte_offset = ta.byte_offset();

            // h. Let bufferByteLimit be (len × elementSize) + byteOffset.
            let buffer_byte_limit = ((len * element_size) + byte_offset) as usize;

            // i. Let toByteIndex be (targetIndex × elementSize) + byteOffset.
            let to_byte_index = (to * element_size + byte_offset) as usize;

            // j. Let fromByteIndex be (startIndex × elementSize) + byteOffset.
            let from_byte_index = (from * element_size + byte_offset) as usize;

            // k. Let countBytes be count × elementSize.
            let mut count_bytes = (count * element_size) as usize;

            // Readjust considering the buffer_byte_limit. A resize could
            // have readjusted the buffer size, which could put `count_bytes`
            // outside the allowed range.
            if to_byte_index >= buffer_byte_limit || from_byte_index >= buffer_byte_limit {
                return Ok(this.clone());
            }

            count_bytes = min(
                count_bytes,
                min(
                    buffer_byte_limit - to_byte_index,
                    buffer_byte_limit - from_byte_index,
                ),
            );

            // l. If fromByteIndex < toByteIndex and toByteIndex < fromByteIndex + countBytes, then
            //     i. Let direction be -1.
            //     ii. Set fromByteIndex to fromByteIndex + countBytes - 1.
            //     iii. Set toByteIndex to toByteIndex + countBytes - 1.
            // m. Else,
            //     i. Let direction be 1.
            // n. Repeat, while countBytes > 0,
            //     i. If fromByteIndex < bufferByteLimit and toByteIndex < bufferByteLimit, then
            //         1. Let value be GetValueFromBuffer(buffer, fromByteIndex, uint8, true, unordered).
            //         2. Perform SetValueInBuffer(buffer, toByteIndex, uint8, value, true, unordered).
            //         3. Set fromByteIndex to fromByteIndex + direction.
            //         4. Set toByteIndex to toByteIndex + direction.
            //         5. Set countBytes to countBytes - 1.
            //     ii. Else,
            //         1. Set countBytes to 0.

            #[cfg(debug_assertions)]
            {
                assert!(buf.subslice_mut(from_byte_index..).len() >= count_bytes);
                assert!(buf.subslice_mut(to_byte_index..).len() >= count_bytes);
            }

            // SAFETY: All previous checks are made to ensure this memmove is always in-bounds,
            // making this operation safe.
            unsafe {
                memmove(buf.as_ptr(), from_byte_index, to_byte_index, count_bytes);
            }
        }

        // 18. Return O.
        Ok(this.clone())
    }

    /// `%TypedArray%.prototype.entries ( )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.entries
    pub(crate) fn entries(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Perform ? ValidateTypedArray(O, seq-cst).
        let (ta, _) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Return CreateArrayIterator(O, key+value).
        Ok(ArrayIterator::create_array_iterator(
            ta.upcast(),
            PropertyNameKind::KeyAndValue,
            context,
        ))
    }

    /// `%TypedArray%.prototype.every ( callbackfn [ , thisArg ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.every
    pub(crate) fn every(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback_fn = match args.get_or_undefined(0).as_object() {
            Some(obj) if obj.is_callable() => obj,
            _ => {
                return Err(JsNativeError::typ()
                    .with_message(
                        "TypedArray.prototype.every called with non-callable callback function",
                    )
                    .into());
            }
        };

        // 5. Let k be 0.
        // 6. Repeat, while k < len,
        let ta = ta.upcast();
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kValue be ! Get(O, Pk).
            let k_value = ta.get(k, context)?;

            // c. Let testResult be ! ToBoolean(? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »)).
            let test_result = callback_fn
                .call(
                    args.get_or_undefined(1),
                    &[k_value, k.into(), this.clone()],
                    context,
                )?
                .to_boolean();

            // d. If testResult is false, return false.
            if !test_result {
                return Ok(false.into());
            }
        }

        // 7. Return true.
        Ok(true.into())
    }

    /// `%TypedArray%.prototype.fill ( value [ , start [ , end ] ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.fill
    pub(crate) fn fill(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        let value: JsValue = if ta.borrow().data().kind().content_type() == ContentType::BigInt {
            // 4. If O.[[ContentType]] is BigInt, set value to ? ToBigInt(value).
            args.get_or_undefined(0).to_bigint(context)?.into()
        } else {
            // 5. Otherwise, set value to ? ToNumber(value).
            args.get_or_undefined(0).to_number(context)?.into()
        };

        // 6. Let relativeStart be ? ToIntegerOrInfinity(start).
        // 7. If relativeStart = -∞, let startIndex be 0.
        // 8. Else if relativeStart < 0, let startIndex be max(len + relativeStart, 0).
        // 9. Else, let startIndex be min(relativeStart, len).
        let start_index = Array::get_relative_start(context, args.get_or_undefined(1), len)?;

        // 10. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToIntegerOrInfinity(end).
        // 11. If relativeEnd = -∞, let endIndex be 0.
        // 12. Else if relativeEnd < 0, let endIndex be max(len + relativeEnd, 0).
        // 13. Else, let endIndex be min(relativeEnd, len).
        let end_index = Array::get_relative_end(context, args.get_or_undefined(2), len)?;

        // 14. Set taRecord to MakeTypedArrayWithBufferWitnessRecord(O, seq-cst).
        // 15. If IsTypedArrayOutOfBounds(taRecord) is true, throw a TypeError exception.
        let len = {
            let ta = ta.borrow();

            let Some(buf_len) = ta
                .data()
                .viewed_array_buffer()
                .as_buffer()
                .bytes(Ordering::SeqCst)
                .filter(|b| !ta.data().is_out_of_bounds(b.len()))
                .map(|b| b.len())
            else {
                return Err(JsNativeError::typ()
                    .with_message("typed array is outside the bounds of its inner buffer")
                    .into());
            };

            // 16. Set len to TypedArrayLength(taRecord).
            ta.data().array_length(buf_len)
        };

        // 17. Set endIndex to min(endIndex, len).
        let end_index = min(end_index, len);

        // 18. Let k be startIndex.
        // 19. Repeat, while k < endIndex,

        let ta = ta.upcast();
        for k in start_index..end_index {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Perform ! Set(O, Pk, value, true).
            ta.set(k, value.clone(), true, context)
                .js_expect("Set cannot fail here")?;

            // c. Set k to k + 1.
        }

        // 20. Return O.
        Ok(this.clone())
    }

    /// `%TypedArray%.prototype.filter ( callbackfn [ , thisArg ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.filter
    pub(crate) fn filter(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);
        let typed_array_kind = ta.borrow().data().kind();

        // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback_fn =
            match args.get_or_undefined(0).as_object() {
                Some(obj) if obj.is_callable() => obj,
                _ => return Err(JsNativeError::typ()
                    .with_message(
                        "TypedArray.prototype.filter called with non-callable callback function",
                    )
                    .into()),
            };

        // 5. Let kept be a new empty List.
        let mut kept = Vec::new();

        // 6. Let k be 0.
        // 7. Let captured be 0.
        let mut captured = 0;

        // 8. Repeat, while k < len,
        let ta = ta.upcast();
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kValue be ! Get(O, Pk).
            let k_value = ta.get(k, context).js_expect("Get cannot fail here")?;

            // c. Let selected be ! ToBoolean(? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »)).#
            let selected = callback_fn
                .call(
                    args.get_or_undefined(1),
                    &[k_value.clone(), k.into(), this.clone()],
                    context,
                )?
                .to_boolean();

            // d. If selected is true, then
            if selected {
                // i. Append kValue to the end of kept.
                kept.push(k_value);

                // ii. Set captured to captured + 1.
                captured += 1;
            }
        }

        // 9. Let A be ? TypedArraySpeciesCreate(O, « 𝔽(captured) »).
        let a = Self::species_create(&ta, typed_array_kind, &[captured.into()], context)?.upcast();

        // 10. Let n be 0.
        // 11. For each element e of kept, do
        for (n, e) in kept.iter().enumerate() {
            // a. Perform ! Set(A, ! ToString(𝔽(n)), e, true).
            a.set(n, e.clone(), true, context)
                .js_expect("Set cannot fail here")?;
            // b. Set n to n + 1.
        }

        // 12. Return A.
        Ok(a.into())
    }

    /// `%TypedArray%.prototype.find ( predicate [ , thisArg ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.find
    pub(crate) fn find(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        let predicate = args.get_or_undefined(0);
        let this_arg = args.get_or_undefined(1);

        // 4. Let findRec be ? FindViaPredicate(O, len, ascending, predicate, thisArg).
        let (_, value) = find_via_predicate(
            &ta.upcast(),
            len,
            Direction::Ascending,
            predicate,
            this_arg,
            context,
            "TypedArray.prototype.find",
        )?;

        // 5. Return findRec.[[Value]].
        Ok(value)
    }

    /// `%TypedArray%.prototype.findIndex ( predicate [ , thisArg ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.findindex
    pub(crate) fn find_index(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        let predicate = args.get_or_undefined(0);
        let this_arg = args.get_or_undefined(1);

        // 4. Let findRec be ? FindViaPredicate(O, len, ascending, predicate, thisArg).
        let (index, _) = find_via_predicate(
            &ta.upcast(),
            len,
            Direction::Ascending,
            predicate,
            this_arg,
            context,
            "TypedArray.prototype.findIndex",
        )?;

        // 5. Return findRec.[[Index]].
        Ok(index)
    }

    /// `%TypedArray%.prototype.findLast ( predicate [ , thisArg ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.findlast
    pub(crate) fn find_last(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        let predicate = args.get_or_undefined(0);
        let this_arg = args.get_or_undefined(1);

        // 4. Let findRec be ? FindViaPredicate(O, len, descending, predicate, thisArg).
        let (_, value) = find_via_predicate(
            &ta.upcast(),
            len,
            Direction::Descending,
            predicate,
            this_arg,
            context,
            "TypedArray.prototype.findLast",
        )?;

        // 5. Return findRec.[[Value]].
        Ok(value)
    }

    /// `%TypedArray%.prototype.findLastIndex ( predicate [ , thisArg ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.findlastindex
    pub(crate) fn find_last_index(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        let predicate = args.get_or_undefined(0);
        let this_arg = args.get_or_undefined(1);

        // 4. Let findRec be ? FindViaPredicate(O, len, descending, predicate, thisArg).
        let (index, _) = find_via_predicate(
            &ta.upcast(),
            len,
            Direction::Descending,
            predicate,
            this_arg,
            context,
            "TypedArray.prototype.findLastIndex",
        )?;

        // 5. Return findRec.[[Index]].
        Ok(index)
    }

    /// `%TypedArray%.prototype.forEach ( callbackfn [ , thisArg ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.foreach
    pub(crate) fn for_each(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback_fn =
            match args.get_or_undefined(0).as_object() {
                Some(obj) if obj.is_callable() => obj,
                _ => return Err(JsNativeError::typ()
                    .with_message(
                        "TypedArray.prototype.foreach called with non-callable callback function",
                    )
                    .into()),
            };

        // 5. Let k be 0.
        // 6. Repeat, while k < len,
        let ta = ta.upcast();
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kValue be ! Get(O, Pk).
            let k_value = ta.get(k, context).js_expect("Get cannot fail here")?;

            // c. Perform ? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »).
            callback_fn.call(
                args.get_or_undefined(1),
                &[k_value, k.into(), this.clone()],
                context,
            )?;
        }

        // 7. Return undefined.
        Ok(JsValue::undefined())
    }

    /// `%TypedArray%.prototype.includes ( searchElement [ , fromIndex ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.includes
    pub(crate) fn includes(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 4. If len is 0, return false.
        if len == 0 {
            return Ok(false.into());
        }

        // 5. Let n be ? ToIntegerOrInfinity(fromIndex).
        // 6. Assert: If fromIndex is undefined, then n is 0.
        let n = args.get_or_undefined(1).to_integer_or_infinity(context)?;

        let n = match n {
            // 7. If n is +∞, return false.
            IntegerOrInfinity::PositiveInfinity => return Ok(false.into()),
            // 8. Else if n is -∞, set n to 0.
            IntegerOrInfinity::NegativeInfinity => 0,
            IntegerOrInfinity::Integer(i) => i,
        };

        // 9. If n ≥ 0, then
        let k = if n >= 0 {
            // a. Let k be n.
            n as u64
        } else {
            // 10. Else,
            // a. Let k be len + n.
            // b. If k < 0, set k to 0.
            len.saturating_add_signed(n)
        };

        // 11. Repeat, while k < len,
        let ta = ta.upcast();
        for k in k..len {
            // a. Let elementK be ! Get(O, ! ToString(𝔽(k))).
            let element_k = ta.get(k, context).js_expect("Get cannot fail here")?;

            // b. If SameValueZero(searchElement, elementK) is true, return true.
            if JsValue::same_value_zero(args.get_or_undefined(0), &element_k) {
                return Ok(true.into());
            }

            // c. Set k to k + 1.
        }

        // 12. Return false.
        Ok(false.into())
    }

    /// `%TypedArray%.prototype.indexOf ( searchElement [ , fromIndex ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.indexof
    pub(crate) fn index_of(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 4. If len is 0, return -1𝔽.
        if len == 0 {
            return Ok((-1).into());
        }

        // 5. Let n be ? ToIntegerOrInfinity(fromIndex).
        // 6. Assert: If fromIndex is undefined, then n is 0.
        let n = args.get_or_undefined(1).to_integer_or_infinity(context)?;

        let n = match n {
            // 7. If n is +∞, return -1𝔽.
            IntegerOrInfinity::PositiveInfinity => return Ok((-1).into()),
            // 8. Else if n is -∞, set n to 0.
            IntegerOrInfinity::NegativeInfinity => 0,
            IntegerOrInfinity::Integer(i) => i,
        };

        // 9. If n ≥ 0, then
        let k = if n >= 0 {
            // a. Let k be n.
            n as u64
        // 10. Else,
        } else {
            // a. Let k be len + n.
            // b. If k < 0, set k to 0.
            len.saturating_add_signed(n)
        };

        // 11. Repeat, while k < len,
        let ta = ta.upcast();
        for k in k..len {
            // a. Let kPresent be ! HasProperty(O, ! ToString(𝔽(k))).
            // b. If kPresent is true, then
            // b.i. Let elementK be ! Get(O, ! ToString(𝔽(k))).
            //   ii. Let same be IsStrictlyEqual(searchElement, elementK).
            //   iii. If same is true, return 𝔽(k).
            if let Some(element_k) = ta.try_get(k, context).js_expect("Get cannot fail here")?
                && args.get_or_undefined(0).strict_equals(&element_k)
            {
                return Ok(k.into());
            }

            // c. Set k to k + 1.
        }

        // 12. Return -1𝔽.
        Ok((-1).into())
    }

    /// `%TypedArray%.prototype.join ( separator )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.join
    pub(crate) fn join(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 4. If separator is undefined, let sep be the single-element String ",".
        let separator = args.get_or_undefined(0);
        let sep = if separator.is_undefined() {
            js_string!(",")
        // 5. Else, let sep be ? ToString(separator).
        } else {
            separator.to_string(context)?
        };

        // 6. Let R be the empty String.
        let mut r = Vec::with_capacity(len as usize);

        // 7. Let k be 0.
        // 8. Repeat, while k < len,
        let ta = ta.upcast();
        for k in 0..len {
            // a. If k > 0, set R to the string-concatenation of R and sep.
            if k > 0 {
                r.extend(sep.iter());
            }

            // b. Let element be ! Get(O, ! ToString(𝔽(k))).
            let element = ta.get(k, context).js_expect("Get cannot fail here")?;

            // c. If element is undefined, let next be the empty String; otherwise, let next be ! ToString(element).
            // d. Set R to the string-concatenation of R and next.
            if !element.is_undefined() {
                r.extend(element.to_string(context)?.iter());
            }
        }

        // 9. Return R.
        Ok(js_string!(&r[..]).into())
    }

    /// `%TypedArray%.prototype.keys ( )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.keys
    pub(crate) fn keys(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, _) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Return CreateArrayIterator(O, key).
        Ok(ArrayIterator::create_array_iterator(
            ta.upcast(),
            PropertyNameKind::Key,
            context,
        ))
    }

    /// `%TypedArray%.prototype.lastIndexOf ( searchElement [ , fromIndex ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.lastindexof
    pub(crate) fn last_index_of(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 4. If len is 0, return -1𝔽.
        if len == 0 {
            return Ok((-1).into());
        }

        // 5. If fromIndex is present, let n be ? ToIntegerOrInfinity(fromIndex); else let n be len - 1.
        let k = match args.get(1) {
            None => len,
            Some(n) => {
                let n = n.to_integer_or_infinity(context)?;
                match n {
                    // 6. If n is -∞, return -1𝔽.
                    IntegerOrInfinity::NegativeInfinity => return Ok((-1).into()),
                    // 7. If n ≥ 0, then
                    // a. Let k be min(n, len - 1).
                    IntegerOrInfinity::Integer(i) if i >= 0 => min(i as u64 + 1, len),
                    IntegerOrInfinity::PositiveInfinity => len,
                    // 8. Else,
                    // a. Let k be len + n.
                    IntegerOrInfinity::Integer(i) => len.saturating_add_signed(i + 1),
                }
            }
        };

        // 9. Repeat, while k ≥ 0,
        let ta = ta.upcast();
        for k in (0..k).rev() {
            // a. Let kPresent be ! HasProperty(O, ! ToString(𝔽(k))).
            // b. If kPresent is true, then
            // b.i. Let elementK be ! Get(O, ! ToString(𝔽(k))).
            //   ii. Let same be IsStrictlyEqual(searchElement, elementK).
            //   iii. If same is true, return 𝔽(k).
            if let Some(element_k) = ta.try_get(k, context).js_expect("Get cannot fail here")?
                && args.get_or_undefined(0).strict_equals(&element_k)
            {
                return Ok(k.into());
            }

            // c. Set k to k - 1.
        }

        // 10. Return -1𝔽.
        Ok((-1).into())
    }

    /// `get %TypedArray%.prototype.length`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-%typedarray%.prototype.length
    pub(crate) fn length(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Perform ? RequireInternalSlot(O, [[TypedArrayName]]).
        // 3. Assert: O has [[ViewedArrayBuffer]] and [[ArrayLength]] internal slots.
        let object = this.as_object();
        let ta = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<TypedArray>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("`this` is not a typed array object")
            })?;

        // 4. Let taRecord be MakeTypedArrayWithBufferWitnessRecord(O, seq-cst).
        // 5. If IsTypedArrayOutOfBounds(taRecord) is true, return +0𝔽.
        let buf = ta.viewed_array_buffer().as_buffer();
        let Some(buf) = buf
            .bytes(Ordering::SeqCst)
            .filter(|s| !ta.is_out_of_bounds(s.len()))
        else {
            return Ok(0.into());
        };

        // 6. Let length be TypedArrayLength(taRecord).
        // 7. Return 𝔽(length).
        Ok(ta.array_length(buf.len()).into())
    }

    /// `%TypedArray%.prototype.map ( callbackfn [ , thisArg ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.map
    pub(crate) fn map(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        let typed_array_kind = ta.borrow().data().kind();

        // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback_fn = match args.get_or_undefined(0).as_object() {
            Some(obj) if obj.is_callable() => obj,
            _ => {
                return Err(JsNativeError::typ()
                    .with_message(
                        "TypedArray.prototype.map called with non-callable callback function",
                    )
                    .into());
            }
        };

        let ta = ta.upcast();

        // 5. Let A be ? TypedArraySpeciesCreate(O, « 𝔽(len) »).
        let a = Self::species_create(&ta, typed_array_kind, &[len.into()], context)?.upcast();

        // 6. Let k be 0.
        // 7. Repeat, while k < len,
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kValue be ! Get(O, Pk).
            let k_value = ta.get(k, context).js_expect("Get cannot fail here")?;

            // c. Let mappedValue be ? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »).
            let mapped_value = callback_fn.call(
                args.get_or_undefined(1),
                &[k_value, k.into(), this.clone()],
                context,
            )?;

            // d. Perform ? Set(A, Pk, mappedValue, true).
            a.set(k, mapped_value, true, context)?;
        }

        // 8. Return A.
        Ok(a.into())
    }

    /// `%TypedArray%.prototype.reduce ( callbackfn [ , initialValue ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.reduce
    pub(crate) fn reduce(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback_fn =
            match args.get_or_undefined(0).as_object() {
                Some(obj) if obj.is_callable() => obj,
                _ => return Err(JsNativeError::typ()
                    .with_message(
                        "TypedArray.prototype.reduce called with non-callable callback function",
                    )
                    .into()),
            };

        // 5. If len = 0 and initialValue is not present, throw a TypeError exception.
        if len == 0 && args.get(1).is_none() {
            return Err(JsNativeError::typ()
                .with_message("Typed array length is 0 and initial value is not present")
                .into());
        }

        let ta = ta.upcast();

        // 6. Let k be 0.
        let mut k = 0;

        // 7. Let accumulator be undefined.
        // 8. If initialValue is present, then
        let mut accumulator = if let Some(initial_value) = args.get(1) {
            // a. Set accumulator to initialValue.
            initial_value.clone()
        // 9. Else,
        } else {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Set accumulator to ! Get(O, Pk).
            // c. Set k to k + 1.
            k += 1;
            ta.get(0, context).js_expect("Get cannot fail here")?
        };

        // 10. Repeat, while k < len,
        for k in k..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kValue be ! Get(O, Pk).
            let k_value = ta.get(k, context).js_expect("Get cannot fail here")?;

            // c. Set accumulator to ? Call(callbackfn, undefined, « accumulator, kValue, 𝔽(k), O »).
            accumulator = callback_fn.call(
                &JsValue::undefined(),
                &[accumulator, k_value, k.into(), this.clone()],
                context,
            )?;

            // d. Set k to k + 1.
        }

        // 11. Return accumulator.
        Ok(accumulator)
    }

    /// `%TypedArray%.prototype.reduceRight ( callbackfn [ , initialValue ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.reduceright
    pub(crate) fn reduceright(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback_fn = match args.get_or_undefined(0).as_object() {
            Some(obj) if obj.is_callable() => obj,
            _ => return Err(JsNativeError::typ()
                .with_message(
                    "TypedArray.prototype.reduceright called with non-callable callback function",
                )
                .into()),
        };

        // 5. If len = 0 and initialValue is not present, throw a TypeError exception.
        if len == 0 && args.get(1).is_none() {
            return Err(JsNativeError::typ()
                .with_message("Typed array length is 0 and initial value is not present")
                .into());
        }

        let ta = ta.upcast();

        // 6. Let k be len - 1.
        // 7. Let accumulator be undefined.
        // 8. If initialValue is present, then
        let (mut accumulator, k) = if let Some(initial_value) = args.get(1) {
            // a. Set accumulator to initialValue.
            (initial_value.clone(), len)
        // 9. Else,
        } else {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Set accumulator to ! Get(O, Pk).
            let accumulator = ta.get(len - 1, context).js_expect("Get cannot fail here")?;

            // c. Set k to k - 1.
            (accumulator, len - 1)
        };

        // 10. Repeat, while k ≥ 0,
        for k in (0..k).rev() {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kValue be ! Get(O, Pk).
            let k_value = ta.get(k, context).js_expect("Get cannot fail here")?;

            // c. Set accumulator to ? Call(callbackfn, undefined, « accumulator, kValue, 𝔽(k), O »).
            accumulator = callback_fn.call(
                &JsValue::undefined(),
                &[accumulator, k_value, k.into(), this.clone()],
                context,
            )?;

            // d. Set k to k - 1.
        }

        // 11. Return accumulator.
        Ok(accumulator)
    }

    /// `%TypedArray%.prototype.reverse ( )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.reverse
    #[allow(clippy::float_cmp)]
    pub(crate) fn reverse(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        let ta = ta.upcast();

        // 4. Let middle be floor(len / 2).
        let middle = len / 2;

        // 5. Let lower be 0.
        let mut lower = 0;
        // 6. Repeat, while lower ≠ middle,
        while lower != middle {
            // a. Let upper be len - lower - 1.
            let upper = len - lower - 1;

            // b. Let upperP be ! ToString(𝔽(upper)).
            // c. Let lowerP be ! ToString(𝔽(lower)).
            // d. Let lowerValue be ! Get(O, lowerP).
            let lower_value = ta.get(lower, context).js_expect("Get cannot fail here")?;
            // e. Let upperValue be ! Get(O, upperP).
            let upper_value = ta.get(upper, context).js_expect("Get cannot fail here")?;

            // f. Perform ! Set(O, lowerP, upperValue, true).
            ta.set(lower, upper_value, true, context)
                .js_expect("Set cannot fail here")?;
            // g. Perform ! Set(O, upperP, lowerValue, true).
            ta.set(upper, lower_value, true, context)
                .js_expect("Set cannot fail here")?;

            // h. Set lower to lower + 1.
            lower += 1;
        }

        // 7. Return O.
        Ok(this.clone())
    }

    /// [`%TypedArray%.prototype.toReversed ( )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.toreversed
    pub(crate) fn to_reversed(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);
        let kind = ta.borrow().data().kind();

        // 4. Let A be ? TypedArrayCreateSameType(O, « 𝔽(length) »).
        let new_array = Self::from_kind_and_length(kind, len, context)?;

        // 5. Let k be 0.
        // 6. Repeat, while k < length,
        let ta = ta.upcast();
        for k in 0..len {
            // a. Let from be ! ToString(𝔽(length - k - 1)).
            // b. Let Pk be ! ToString(𝔽(k)).
            // c. Let fromValue be ! Get(O, from).
            let value = ta
                .get(len - k - 1, context)
                .js_expect("cannot fail per the spec")?;
            // d. Perform ! Set(A, Pk, fromValue, true).
            new_array
                .set(k, value, true, context)
                .js_expect("cannot fail per the spec")?;
            // e. Set k to k + 1.
        }

        // 7. Return A.
        Ok(new_array.into())
    }

    /// `%TypedArray%.prototype.set ( source [ , offset ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.set
    pub(crate) fn set(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let target be the this value.
        // 2. Perform ? RequireInternalSlot(target, [[TypedArrayName]]).
        // 3. Assert: target has a [[ViewedArrayBuffer]] internal slot.
        let target = this
            .as_object()
            .and_then(|o| o.clone().downcast::<TypedArray>().ok())
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("TypedArray.set must be called on typed array object")
            })?;

        // 4. Let targetOffset be ? ToIntegerOrInfinity(offset).
        let target_offset = args.get_or_undefined(1).to_integer_or_infinity(context)?;

        // 5. If targetOffset < 0, throw a RangeError exception.
        let target_offset = match target_offset {
            IntegerOrInfinity::Integer(i) if i < 0 => {
                return Err(JsNativeError::range()
                    .with_message("TypedArray.set called with negative offset")
                    .into());
            }
            IntegerOrInfinity::NegativeInfinity => {
                return Err(JsNativeError::range()
                    .with_message("TypedArray.set called with negative offset")
                    .into());
            }
            IntegerOrInfinity::PositiveInfinity => U64OrPositiveInfinity::PositiveInfinity,
            IntegerOrInfinity::Integer(i) => U64OrPositiveInfinity::U64(i as u64),
        };

        // 6. If source is an Object that has a [[TypedArrayName]] internal slot, then
        let source = args.get_or_undefined(0);
        if let Some(source) = source
            .as_object()
            .and_then(|o| o.clone().downcast::<TypedArray>().ok())
        {
            // a. Perform ? SetTypedArrayFromTypedArray(target, targetOffset, source).
            Self::set_typed_array_from_typed_array(&target, &target_offset, &source, context)?;
        }
        // 7. Else,
        else {
            // a. Perform ? SetTypedArrayFromArrayLike(target, targetOffset, source).
            Self::set_typed_array_from_array_like(&target, &target_offset, source, context)?;
        }

        // 8. Return undefined.
        Ok(JsValue::undefined())
    }

    /// `3.2.3.24.1 SetTypedArrayFromTypedArray ( target, targetOffset, source )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-settypedarrayfromtypedarray
    fn set_typed_array_from_typed_array(
        target: &JsObject<TypedArray>,
        target_offset: &U64OrPositiveInfinity,
        source: &JsObject<TypedArray>,
        context: &mut Context,
    ) -> JsResult<()> {
        // 1. Let targetBuffer be target.[[ViewedArrayBuffer]].
        // 2. Let targetRecord be MakeTypedArrayWithBufferWitnessRecord(target, seq-cst).
        // 3. If IsTypedArrayOutOfBounds(targetRecord) is true, throw a TypeError exception.
        let target_array = target.borrow();
        let target_buf_obj = target_array.data().viewed_array_buffer().clone();
        let Some(target_buf_len) = target_buf_obj
            .as_buffer()
            .bytes(Ordering::SeqCst)
            .filter(|s| !target_array.data().is_out_of_bounds(s.len()))
            .map(|s| s.len())
        else {
            return Err(JsNativeError::typ()
                .with_message("typed array is outside the bounds of its inner buffer")
                .into());
        };

        // 4. Let targetLength be TypedArrayLength(targetRecord).
        let target_length = target_array.data().array_length(target_buf_len);

        // 5. Let srcBuffer be source.[[ViewedArrayBuffer]].
        // 6. Let srcRecord be MakeTypedArrayWithBufferWitnessRecord(source, seq-cst).
        // 7. If IsTypedArrayOutOfBounds(srcRecord) is true, throw a TypeError exception.
        let src_array = source.borrow();
        let mut src_buf_obj = src_array.data().viewed_array_buffer().clone();
        let Some(mut src_buf_len) = src_buf_obj
            .as_buffer()
            .bytes(Ordering::SeqCst)
            .filter(|s| !src_array.data().is_out_of_bounds(s.len()))
            .map(|s| s.len())
        else {
            return Err(JsNativeError::typ()
                .with_message("typed array is outside the bounds of its inner buffer")
                .into());
        };

        // 8. Let srcLength be TypedArrayLength(srcRecord).
        let src_length = src_array.data().array_length(src_buf_len);

        // 9. Let targetType be TypedArrayElementType(target).
        let target_type = target_array.data().kind();

        // 10. Let targetElementSize be TypedArrayElementSize(target).
        let target_element_size = target_type.element_size();

        // 11. Let targetByteOffset be target.[[ByteOffset]].
        let target_byte_offset = target_array.data().byte_offset();

        // 12. Let srcType be TypedArrayElementType(source).
        let src_type = src_array.data().kind();

        // 13. Let srcElementSize be TypedArrayElementSize(source).
        let src_element_size = src_type.element_size();

        // 14. Let srcByteOffset be source.[[ByteOffset]].
        let src_byte_offset = src_array.data().byte_offset();

        // a. Let srcByteLength be source.[[ByteLength]].
        let src_byte_length = src_array.data().byte_length(src_buf_len);

        drop(target_array);
        drop(src_array);

        // 15. If targetOffset = +∞, throw a RangeError exception.
        let U64OrPositiveInfinity::U64(target_offset) = target_offset else {
            return Err(JsNativeError::range()
                .with_message("Target offset cannot be Infinity")
                .into());
        };

        // 16. If srcLength + targetOffset > targetLength, throw a RangeError exception.
        if src_length + target_offset > target_length {
            return Err(JsNativeError::range()
                .with_message("Source typed array and target offset longer than target typed array")
                .into());
        }

        // 17. If target.[[ContentType]] is not source.[[ContentType]], throw a TypeError exception.
        if target_type.content_type() != src_type.content_type() {
            return Err(JsNativeError::typ()
                .with_message(
                    "Source typed array and target typed array have different content types",
                )
                .into());
        }

        // 18. If IsSharedArrayBuffer(srcBuffer) is true, IsSharedArrayBuffer(targetBuffer) is true,
        //     and srcBuffer.[[ArrayBufferData]] is targetBuffer.[[ArrayBufferData]], let
        //     sameSharedArrayBuffer be true; otherwise, let sameSharedArrayBuffer be false.
        // 19. If SameValue(srcBuffer, targetBuffer) is true or sameSharedArrayBuffer is true, then
        let src_byte_index = if BufferObject::equals(&src_buf_obj, &target_buf_obj) {
            // a. Let srcByteLength be source.[[ByteLength]].
            let src_byte_offset = src_byte_offset as usize;
            let src_byte_length = src_byte_length as usize;

            let s = {
                let slice = src_buf_obj.as_buffer();
                let slice = slice
                    .bytes_with_len(src_buf_len)
                    .js_expect("Already checked for detached buffer")?;

                // b. Set srcBuffer to ? CloneArrayBuffer(srcBuffer, srcByteOffset, srcByteLength, %ArrayBuffer%).
                // c. NOTE: %ArrayBuffer% is used to clone srcBuffer because is it known to not have any observable side-effects.
                let subslice = slice.subslice(src_byte_offset..src_byte_offset + src_byte_length);
                src_buf_len = subslice.len();

                subslice.clone(context)?
            };

            src_buf_obj = BufferObject::Buffer(s);

            // d. Let srcByteIndex be 0.
            0
        }
        // 20. Else,
        else {
            // a. Let srcByteIndex be srcByteOffset.
            src_byte_offset
        };

        // 22. Let targetByteIndex be targetOffset × targetElementSize + targetByteOffset.
        let target_byte_index = target_offset * target_element_size + target_byte_offset;

        let src_buffer = src_buf_obj.as_buffer();
        let src_buffer = src_buffer
            .bytes_with_len(src_buf_len)
            .js_expect("Already checked for detached buffer")?;

        let mut target_buffer = target_buf_obj.as_buffer_mut();
        let mut target_buffer = target_buffer
            .bytes_with_len(target_buf_len)
            .js_expect("Already checked for detached buffer")?;

        // 24. If srcType is the same as targetType, then
        if src_type == target_type {
            let src_byte_index = src_byte_index as usize;
            let target_byte_index = target_byte_index as usize;
            let byte_count = (target_element_size * src_length) as usize;

            // a. NOTE: If srcType and targetType are the same, the transfer must be performed in a manner that preserves the bit-level encoding of the source data.
            // b. Repeat, while targetByteIndex < limit,
            // i. Let value be GetValueFromBuffer(srcBuffer, srcByteIndex, Uint8, true, Unordered).
            // ii. Perform SetValueInBuffer(targetBuffer, targetByteIndex, Uint8, value, true, Unordered).
            // iii. Set srcByteIndex to srcByteIndex + 1.
            // iv. Set targetByteIndex to targetByteIndex + 1.
            let src = src_buffer.subslice(src_byte_index..);
            let mut target = target_buffer.subslice_mut(target_byte_index..);

            #[cfg(debug_assertions)]
            {
                assert!(src.len() >= byte_count);
                assert!(target.len() >= byte_count);
            }

            // SAFETY: We already asserted that the indices are in bounds.
            unsafe {
                memcpy(src.as_ptr(), target.as_ptr(), byte_count);
            }
        }
        // 25. Else,
        else {
            // 23. Let limit be targetByteIndex + targetElementSize × srcLength.
            let limit = (target_byte_index + target_element_size * src_length) as usize;

            let mut src_byte_index = src_byte_index as usize;
            let mut target_byte_index = target_byte_index as usize;

            // a. Repeat, while targetByteIndex < limit,
            while target_byte_index < limit {
                // i. Let value be GetValueFromBuffer(srcBuffer, srcByteIndex, srcType, true, Unordered).

                let value = unsafe {
                    src_buffer
                        .subslice(src_byte_index..)
                        .get_value(src_type, Ordering::Relaxed)
                };

                let value = JsValue::from(value);

                let value = target_type
                    .get_element(&value, context)
                    .js_expect("value can only be f64 or BigInt")?;

                // ii. Perform SetValueInBuffer(targetBuffer, targetByteIndex, targetType, value, true, Unordered).
                // SAFETY: previous checks preserve the validity  of the indices.
                unsafe {
                    target_buffer
                        .subslice_mut(target_byte_index..)
                        .set_value(value, Ordering::Relaxed);
                }

                // iii. Set srcByteIndex to srcByteIndex + srcElementSize.
                src_byte_index += src_element_size as usize;

                // iv. Set targetByteIndex to targetByteIndex + targetElementSize.
                target_byte_index += target_element_size as usize;
            }
        }

        Ok(())
    }

    /// `SetTypedArrayFromArrayLike ( target, targetOffset, source )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-settypedarrayfromarraylike
    fn set_typed_array_from_array_like(
        target: &JsObject<TypedArray>,
        target_offset: &U64OrPositiveInfinity,
        source: &JsValue,
        context: &mut Context,
    ) -> JsResult<()> {
        // 3. Let targetLength be TypedArrayLength(targetRecord).
        let target_length = {
            let target = target.borrow();
            let target = target.data();

            // 1. Let targetRecord be MakeTypedArrayWithBufferWitnessRecord(target, seq-cst).
            // 2. If IsTypedArrayOutOfBounds(targetRecord) is true, throw a TypeError exception.
            let Some(buf_len) = target
                .viewed_array_buffer()
                .as_buffer()
                .bytes(Ordering::SeqCst)
                .filter(|s| !target.is_out_of_bounds(s.len()))
                .map(|s| s.len())
            else {
                return Err(JsNativeError::typ()
                    .with_message("typed array is outside the bounds of its inner buffer")
                    .into());
            };

            // 3. Let targetLength be target.[[ArrayLength]].
            target.array_length(buf_len)
        };

        // 4. Let src be ? ToObject(source).
        let src = source.to_object(context)?;

        // 5. Let srcLength be ? LengthOfArrayLike(src).
        let src_length = src.length_of_array_like(context)?;

        // 6. If targetOffset = +∞, throw a RangeError exception.
        let target_offset = match target_offset {
            U64OrPositiveInfinity::U64(target_offset) => target_offset,
            U64OrPositiveInfinity::PositiveInfinity => {
                return Err(JsNativeError::range()
                    .with_message("Target offset cannot be positive infinity")
                    .into());
            }
        };

        // 7. If srcLength + targetOffset > targetLength, throw a RangeError exception.
        if src_length + target_offset > target_length {
            return Err(JsNativeError::range()
                .with_message("Source object and target offset longer than target typed array")
                .into());
        }

        // 8. Let k be 0.
        // 9. Repeat, while k < srcLength,
        let target = target.clone().upcast();
        for k in 0..src_length {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let value be ? Get(src, Pk).
            let value = src.get(k, context)?;

            // c. Let targetIndex be 𝔽(targetOffset + k).
            let target_index = target_offset + k;

            // d. Perform ? IntegerIndexedElementSet(target, targetIndex, value).
            typed_array_set_element(&target, target_index as f64, &value, &mut context.into())?;

            // e. Set k to k + 1.
        }

        // 10. Return unused.
        Ok(())
    }

    /// `%TypedArray%.prototype.slice ( start, end )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.slice
    pub(crate) fn slice(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (src, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        let src_borrow = src.borrow();

        // 3. Let srcArrayLength be TypedArrayLength(taRecord).
        let src_len = src_borrow.data().array_length(buf_len);

        // e. Let srcType be TypedArrayElementType(O).
        let src_type = src_borrow.data().kind();

        drop(src_borrow);

        // 4. Let relativeStart be ? ToIntegerOrInfinity(start).
        // 5. If relativeStart = -∞, let startIndex be 0.
        // 6. Else if relativeStart < 0, let startIndex be max(srcArrayLength + relativeStart, 0).
        // 7. Else, let startIndex be min(relativeStart, srcArrayLength).
        let start_index = Array::get_relative_start(context, args.get_or_undefined(0), src_len)?;

        // 8. If end is undefined, let relativeEnd be srcArrayLength; else let relativeEnd be ? ToIntegerOrInfinity(end).
        // 9. If relativeEnd = -∞, let endIndex be 0.
        // 10. Else if relativeEnd < 0, let endIndex be max(srcArrayLength + relativeEnd, 0).
        // 11. Else, let endIndex be min(relativeEnd, srcArrayLength).
        let end_index = Array::get_relative_end(context, args.get_or_undefined(1), src_len)?;

        // 12. Let countBytes be max(endIndex - startIndex, 0).
        let count = end_index.saturating_sub(start_index);

        // 13. Let A be ? TypedArraySpeciesCreate(O, « 𝔽(countBytes) »).
        let target =
            Self::species_create(&src.clone().upcast(), src_type, &[count.into()], context)?;

        // 14. If countBytes > 0, then
        if count == 0 {
            // 15. Return A.
            return Ok(target.upcast().into());
        }

        let src_borrow = src.borrow();
        let target_borrow = target.borrow();

        // a. Set taRecord to MakeTypedArrayWithBufferWitnessRecord(O, seq-cst).
        // b. If IsTypedArrayOutOfBounds(taRecord) is true, throw a TypeError exception.
        let src_buf_borrow = src_borrow.data().viewed_array_buffer().as_buffer();
        let Some(src_buf) = src_buf_borrow
            .bytes(Ordering::SeqCst)
            .filter(|s| !src_borrow.data().is_out_of_bounds(s.len()))
        else {
            return Err(JsNativeError::typ()
                .with_message("typed array is outside the bounds of its inner buffer")
                .into());
        };

        let src_buf_len = src_buf.len();

        // c. Set endIndex to min(endIndex, TypedArrayLength(taRecord)).
        let end_index = min(end_index, src_borrow.data().array_length(src_buf_len));

        // d. Set countBytes to maxlen(endIndex - startIndex, 0).
        let count = end_index.saturating_sub(start_index) as usize;

        // The inner buffer may have resized between getting the indices and getting the buffer
        // itself. Check that the count is not zero again before proceeding.
        if count == 0 {
            drop(target_borrow);
            return Ok(target.upcast().into());
        }

        // f. Let targetType be TypedArrayElementType(A).
        let target_type = target_borrow.data().kind();

        if src_type != target_type {
            // h. Else,
            drop(src_buf_borrow);
            drop((src_borrow, target_borrow));

            // i. Let n be 0.
            // ii. Let k be startIndex.
            // iii. Repeat, while k < endIndex,
            let src = src.upcast();
            let target = target.upcast();
            for (n, k) in (start_index..end_index).enumerate() {
                // 1. Let Pk be ! ToString(𝔽(k)).
                // 2. Let kValue be ! Get(O, Pk).
                let k_value = src.get(k, context).js_expect("Get cannot fail here")?;

                // 3. Perform ! Set(A, ! ToString(𝔽(n)), kValue, true).
                target
                    .set(n, k_value, true, context)
                    .js_expect("Set cannot fail here")?;

                // 4. Set k to k + 1.
                // 5. Set n to n + 1.
            }

            // 15. Return A.
            return Ok(target.into());
        }

        // g. If srcType is targetType, then
        {
            let byte_count = count * src_type.element_size() as usize;

            // i. NOTE: The transfer must be performed in a manner that preserves the bit-level encoding of the source data.
            // ii. Let srcBuffer be O.[[ViewedArrayBuffer]].
            // iii. Let targetBuffer be A.[[ViewedArrayBuffer]].

            // iv. Let elementSize be TypedArrayElementSize(O).
            let element_size = src_type.element_size();

            // v. Let srcByteOffset be O.[[ByteOffset]].
            let src_byte_offset = src_borrow.data().byte_offset();

            // vi. Let srcByteIndex be (startIndex × elementSize) + srcByteOffset.
            let src_byte_index = (start_index * element_size + src_byte_offset) as usize;

            // vii. Let targetByteIndex be A.[[ByteOffset]].
            let target_byte_index = target_borrow.data().byte_offset() as usize;

            // viii. Let endByteIndex be targetByteIndex + (countBytes × elementSize).
            // Not needed by the impl.

            // ix. Repeat, while targetByteIndex < endByteIndex,
            //     1. Let value be GetValueFromBuffer(srcBuffer, srcByteIndex, uint8, true, unordered).
            //     2. Perform SetValueInBuffer(targetBuffer, targetByteIndex, uint8, value, true, unordered).
            //     3. Set srcByteIndex to srcByteIndex + 1.
            //     4. Set targetByteIndex to targetByteIndex + 1.
            if BufferObject::equals(
                src_borrow.data().viewed_array_buffer(),
                target_borrow.data().viewed_array_buffer(),
            ) {
                // cannot borrow the target mutably (overlapping bytes), but we can move the data instead.
                drop(src_buf_borrow);

                let mut src_buf_borrow = src_borrow.data().viewed_array_buffer().as_buffer_mut();
                let mut src_buf = src_buf_borrow
                    .bytes_with_len(src_buf_len)
                    .js_expect("already checked that the buffer is not detached")?;

                #[cfg(debug_assertions)]
                {
                    assert!(src_buf.subslice_mut(src_byte_index..).len() >= byte_count);
                    assert!(src_buf.subslice_mut(target_byte_index..).len() >= byte_count);
                }

                // SAFETY: All previous checks put the copied bytes at least within the bounds of `src_buf`.
                unsafe {
                    memmove_naive(
                        src_buf.as_ptr(),
                        src_byte_index,
                        target_byte_index,
                        byte_count,
                    );
                }
            } else {
                let mut target_buf = target_borrow.data().viewed_array_buffer().as_buffer_mut();
                let mut target_buf = target_buf
                    .bytes(Ordering::SeqCst)
                    .js_expect("newly created array cannot be detached")?;

                #[cfg(debug_assertions)]
                {
                    assert!(src_buf.subslice(src_byte_index..).len() >= byte_count);
                    assert!(target_buf.subslice_mut(target_byte_index..).len() >= byte_count);
                }

                // SAFETY: All previous checks put the indices at least within the bounds of `src_buffer`.
                // Also, `target_buffer` is precisely allocated to fit all sliced elements from
                // `src_buffer`, making this operation safe.
                unsafe {
                    memcpy(
                        src_buf.as_ptr().add(src_byte_index),
                        target_buf.as_ptr().add(target_byte_index),
                        byte_count,
                    );
                }
            }
        }

        drop(target_borrow);
        // 15. Return A.
        Ok(target.upcast().into())
    }

    /// `%TypedArray%.prototype.some ( callbackfn [ , thisArg ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.some
    pub(crate) fn some(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback_fn = match args.get_or_undefined(0).as_object() {
            Some(obj) if obj.is_callable() => obj,
            _ => {
                return Err(JsNativeError::typ()
                    .with_message(
                        "TypedArray.prototype.some called with non-callable callback function",
                    )
                    .into());
            }
        };

        // 5. Let k be 0.
        // 6. Repeat, while k < len,
        let ta = ta.upcast();
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kValue be ! Get(O, Pk).
            let k_value = ta.get(k, context).js_expect("Get cannot fail here")?;

            // c. Let testResult be ! ToBoolean(? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »)).
            // d. If testResult is true, return true.
            if callback_fn
                .call(
                    args.get_or_undefined(1),
                    &[k_value, k.into(), this.clone()],
                    context,
                )?
                .to_boolean()
            {
                return Ok(true.into());
            }
        }

        // 7. Return false.
        Ok(false.into())
    }

    /// `%TypedArray%.prototype.sort ( comparefn )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.sort
    pub(crate) fn sort(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If comparefn is not undefined and IsCallable(comparefn) is false, throw a TypeError exception.
        let compare_fn = match args.first().map(JsValue::variant) {
            None | Some(JsVariant::Undefined) => None,
            Some(JsVariant::Object(obj)) if obj.is_callable() => Some(obj),
            _ => {
                return Err(JsNativeError::typ()
                    .with_message("TypedArray.sort called with non-callable comparefn")
                    .into());
            }
        };

        // 2. Let obj be the this value.
        // 3. Let taRecord be ? ValidateTypedArray(obj, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 4. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 5. NOTE: The following closure performs a numeric comparison rather than the string comparison used in 23.1.3.30.
        // 6. Let SortCompare be a new Abstract Closure with parameters (x, y) that captures comparefn and performs the following steps when called:
        let sort_compare =
            |x: &JsValue, y: &JsValue, context: &mut Context| -> JsResult<cmp::Ordering> {
                // a. Return ? CompareTypedArrayElements(x, y, comparefn).
                compare_typed_array_elements(x, y, compare_fn.as_ref(), context)
            };

        let ta = ta.upcast();
        // 7. Let sortedList be ? SortIndexedProperties(obj, len, SortCompare, read-through-holes).
        let sorted = Array::sort_indexed_properties(&ta, len, sort_compare, false, context)?;

        // 8. Let j be 0.
        // 9. Repeat, while j < len,
        for (j, item) in sorted.into_iter().enumerate() {
            // a. Perform ! Set(obj, ! ToString(𝔽(j)), sortedList[j], true).
            ta.set(j, item, true, context)
                .js_expect("cannot fail per spec")?;

            // b. Set j to j + 1.
        }

        // 10. Return obj.
        Ok(ta.into())
    }

    /// [`%TypedArray%.prototype.toSorted ( comparefn )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.tosorted
    pub(crate) fn to_sorted(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If comparefn is not undefined and IsCallable(comparefn) is false, throw a TypeError exception.
        let compare_fn = match args.first().map(JsValue::variant) {
            None | Some(JsVariant::Undefined) => None,
            Some(JsVariant::Object(obj)) if obj.is_callable() => Some(obj),
            _ => {
                return Err(JsNativeError::typ()
                    .with_message("TypedArray.sort called with non-callable comparefn")
                    .into());
            }
        };

        // 2. Let O be the this value.
        // 3. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 4. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);

        // 5. Let A be ? TypedArrayCreateSameType(O, « 𝔽(len) »).
        let new_array = Self::from_kind_and_length(ta.borrow().data().kind(), len, context)?;

        // 6. NOTE: The following closure performs a numeric comparison rather than the string comparison used in 23.1.3.34.
        // 7. Let SortCompare be a new Abstract Closure with parameters (x, y) that captures comparefn and performs the following steps when called:
        let sort_compare =
            |x: &JsValue, y: &JsValue, context: &mut Context| -> JsResult<cmp::Ordering> {
                // a. Return ? CompareTypedArrayElements(x, y, comparefn).
                compare_typed_array_elements(x, y, compare_fn.as_ref(), context)
            };

        let ta = ta.upcast();

        // 8. Let sortedList be ? SortIndexedProperties(O, len, SortCompare, read-through-holes).
        let sorted = Array::sort_indexed_properties(&ta, len, sort_compare, false, context)?;

        //  9. Let j be 0.
        //  10. Repeat, while j < len;
        for (j, item) in sorted.into_iter().enumerate() {
            // a. Perform ! Set(A, ! ToString(𝔽(j)), sortedList[j], true).
            new_array
                .set(j, item, true, context)
                .js_expect("cannot fail per spec")?;

            // b. Set j to j + 1.
        }
        // 11. Return A.
        Ok(new_array.into())
    }

    /// `%TypedArray%.prototype.subarray ( begin, end )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.subarray
    pub(crate) fn subarray(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Perform ? RequireInternalSlot(O, [[TypedArrayName]]).
        // 3. Assert: O has a [[ViewedArrayBuffer]] internal slot.
        let src = this
            .as_object()
            .and_then(|o| o.clone().downcast::<TypedArray>().ok())
            .ok_or_else(|| {
                JsNativeError::typ().with_message("Value is not a typed array object")
            })?;

        let src_borrow = src.borrow();

        // 4. Let buffer be O.[[ViewedArrayBuffer]].
        let buffer = src_borrow.data().viewed_array_buffer().clone();

        // 5. Let srcRecord be MakeTypedArrayWithBufferWitnessRecord(O, seq-cst).
        // 6. If IsTypedArrayOutOfBounds(srcRecord) is true, then
        //     a. Let srcLength be 0.
        // 7. Else,
        //     a. Let srcLength be TypedArrayLength(srcRecord).
        let src_len = if let Some(buf) = buffer.as_buffer().bytes(Ordering::SeqCst)
            && !src_borrow.data().is_out_of_bounds(buf.len())
        {
            src_borrow.data().array_length(buf.len())
        } else {
            0
        };

        let kind = src_borrow.data().kind();

        // 12. Let elementSize be TypedArrayElementSize(O).
        let element_size = kind.element_size();

        // 13. Let srcByteOffset be O.[[ByteOffset]].
        let src_byte_offset = src_borrow.data().byte_offset();

        let is_auto_length = src_borrow.data().is_auto_length();

        drop(src_borrow);

        // 8. Let relativeStart be ? ToIntegerOrInfinity(start).
        // 9. If relativeStart = -∞, let startIndex be 0.
        // 10. Else if relativeStart < 0, let startIndex be max(srcLength + relativeStart, 0).
        // 11. Else, let startIndex be min(relativeStart, srcLength).
        let start_index = Array::get_relative_start(context, args.get_or_undefined(0), src_len)?;

        // 14. Let beginByteOffset be srcByteOffset + (startIndex × elementSize).
        let begin_byte_offset = src_byte_offset + (start_index * element_size);

        let end = args.get_or_undefined(1);

        // 15. If O.[[ArrayLength]] is auto and end is undefined, then
        if is_auto_length && end.is_undefined() {
            // a. Let argumentsList be « buffer, 𝔽(beginByteOffset) ».

            // 17. Return ? TypedArraySpeciesCreate(O, argumentsList).
            Ok(Self::species_create(
                &src.upcast(),
                kind,
                &[buffer.into(), begin_byte_offset.into()],
                context,
            )?
            .upcast()
            .into())
        } else {
            // 16. Else,
            //     a. If end is undefined, let relativeEnd be srcLength; else let relativeEnd be ? ToIntegerOrInfinity(end).
            //     b. If relativeEnd = -∞, let endIndex be 0.
            //     c. Else if relativeEnd < 0, let endIndex be max(srcLength + relativeEnd, 0).
            //     d. Else, let endIndex be min(relativeEnd, srcLength).
            let end_index = Array::get_relative_end(context, end, src_len)?;

            //     e. Let newLength be max(endIndex - startIndex, 0).
            let new_len = end_index.saturating_sub(start_index);

            //     f. Let argumentsList be « buffer, 𝔽(beginByteOffset), 𝔽(newLength) ».
            Ok(Self::species_create(
                &src.upcast(),
                kind,
                &[buffer.into(), begin_byte_offset.into(), new_len.into()],
                context,
            )?
            .upcast()
            .into())
        }
    }

    /// `%TypedArray%.prototype.toLocaleString ( [ reserved1 [ , reserved2 ] ] )`
    /// `Array.prototype.toLocaleString ( [ locales [ , options ] ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [ECMA-402 reference][spec-402]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.tolocalestring
    /// [spec-402]: https://402.ecma-international.org/10.0/#sup-array.prototype.tolocalestring
    pub(crate) fn to_locale_string(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // This is a distinct method that implements the same algorithm as Array.prototype.toLocaleString as defined in
        // 23.1.3.32 except that TypedArrayLength is called in place of performing a [[Get]] of "length".

        let array = this.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message("Value is not a typed array object")
        })?;

        let (len, is_fixed_len) = {
            let o = array.downcast_ref::<TypedArray>().ok_or_else(|| {
                JsNativeError::typ().with_message("Value is not a typed array object")
            })?;
            let buf = o.viewed_array_buffer().as_buffer();
            let Some((buf_len, is_fixed_len)) = buf
                .bytes(Ordering::SeqCst)
                .filter(|s| !o.is_out_of_bounds(s.len()))
                .map(|s| (s.len(), buf.is_fixed_len()))
            else {
                return Err(JsNativeError::typ()
                    .with_message("typed array is outside the bounds of its inner buffer")
                    .into());
            };

            (o.array_length(buf_len), is_fixed_len)
        };

        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

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

        let mut r = Vec::with_capacity((len + len.saturating_sub(1)) as usize);

        for k in 0..len {
            if k > 0 {
                r.extend(separator.iter());
            }

            let next_element = array.get(k, context)?;

            // Mirrors the behaviour of `join`, but the compiler
            // could unswitch the loop using `is_fixed_len`.
            if is_fixed_len || !next_element.is_undefined() {
                let s = next_element
                    .invoke(
                        js_string!("toLocaleString"),
                        &[locales.clone(), options.clone()],
                        context,
                    )?
                    .to_string(context)?;

                r.extend(s.iter());
            }
        }

        Ok(js_string!(&r[..]).into())
    }

    /// `%TypedArray%.prototype.values ( )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.values
    pub(crate) fn values(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Perform ? ValidateTypedArray(O, seq-cst).
        let (ta, _) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Return CreateArrayIterator(O, value).
        Ok(ArrayIterator::create_array_iterator(
            ta.upcast(),
            PropertyNameKind::Value,
            context,
        ))
    }

    /// [`%TypedArray%.prototype.with ( index, value )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%typedarray%.prototype.with
    pub(crate) fn with(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Let taRecord be ? ValidateTypedArray(O, seq-cst).
        let (ta, buf_len) = TypedArray::validate(this, Ordering::SeqCst)?;

        // 3. Let len be TypedArrayLength(taRecord).
        let len = ta.borrow().data().array_length(buf_len);
        let kind = ta.borrow().data().kind();

        // 4. Let relativeIndex be ? ToIntegerOrInfinity(index).
        // triggers any conversion errors before throwing range errors.
        let relative_index = args.get_or_undefined(0).to_integer_or_infinity(context)?;

        let value = args.get_or_undefined(1);

        // 7. If O.[[ContentType]] is bigint, let numericValue be ? ToBigInt(value).
        let numeric_value: JsValue = if kind.content_type() == ContentType::BigInt {
            value.to_bigint(context)?.into()
        } else {
            // 8. Else, let numericValue be ? ToNumber(value).
            value.to_number(context)?.into()
        };

        // 9. If IsValidIntegerIndex(O, 𝔽(actualIndex)) is false, throw a RangeError exception.
        let IntegerOrInfinity::Integer(relative_index) = relative_index else {
            return Err(JsNativeError::range()
                .with_message("invalid integer index for TypedArray operation")
                .into());
        };
        let actual_index = (|| {
            let rel = u64::try_from(relative_index)
                .ok()
                .or_else(|| len.checked_add_signed(relative_index))?;

            let inner = ta.borrow();
            let buf = inner.data().viewed_array_buffer().as_buffer();
            let s = buf.bytes(Ordering::Relaxed)?;
            inner.data().validate_index_u64(rel, s.len())
        })()
        .ok_or_else(|| {
            JsNativeError::range().with_message("invalid integer index for TypedArray operation")
        })?;

        // 10. Let A be ? TypedArrayCreateSameType(O, « 𝔽(len) »).
        let new_array = Self::from_kind_and_length(kind, len, context)?;

        // 11. Let k be 0.
        // 12. Repeat, while k < len,
        let ta = ta.upcast();
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            let value = if k == actual_index {
                // b. If k is actualIndex, let fromValue be numericValue.
                numeric_value.clone()
            } else {
                // c. Else, let fromValue be ! Get(O, Pk).
                ta.get(k, context).js_expect("cannot fail per the spec")?
            };
            // d. Perform ! Set(A, Pk, fromValue, true).
            new_array
                .set(k, value, true, context)
                .js_expect("cannot fail per the spec")?;

            // e. Set k to k + 1.
        }

        // 13. Return A.
        Ok(new_array.into())
    }

    /// `get %TypedArray%.prototype [ @@toStringTag ]`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-%typedarray%.prototype-@@tostringtag
    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn to_string_tag(
        this: &JsValue,
        _: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. If Type(O) is not Object, return undefined.
        // 3. If O does not have a [[TypedArrayName]] internal slot, return undefined.
        // 4. Let name be O.[[TypedArrayName]].
        // 5. Assert: Type(name) is String.
        // 6. Return name.
        Ok(this
            .as_object()
            .and_then(|obj| {
                obj.downcast_ref::<TypedArray>()
                    .map(|o| o.kind().js_name().into())
            })
            .unwrap_or_default())
    }

    /// `TypedArraySpeciesCreate ( exemplar, argumentList )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#typedarray-species-create
    fn species_create(
        exemplar: &JsObject,
        kind: TypedArrayKind,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsObject<TypedArray>> {
        // 1. Let defaultConstructor be the intrinsic object listed in column one of Table 73 for exemplar.[[TypedArrayName]].
        let default_constructor = kind.standard_constructor();

        // 2. Let constructor be ? SpeciesConstructor(exemplar, defaultConstructor).
        let constructor = exemplar.species_constructor(default_constructor, context)?;

        // 3. Let result be ? TypedArrayCreate(constructor, argumentList).
        let result = Self::create(&constructor, args, context)?;

        // 4. Assert: result has [[TypedArrayName]] and [[ContentType]] internal slots.
        // 5. If result.[[ContentType]] ≠ exemplar.[[ContentType]], throw a TypeError exception.
        if result.borrow().data().kind().content_type() != kind.content_type() {
            return Err(JsNativeError::typ()
                .with_message("New typed array has different context type than exemplar")
                .into());
        }

        // 6. Return result.
        Ok(result)
    }

    /// [`TypedArrayCreateFromConstructor ( constructor, argumentList )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-typedarraycreatefromconstructor
    fn create(
        constructor: &JsObject,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsObject<TypedArray>> {
        // 1. Let newTypedArray be ? Construct(constructor, argumentList).
        let new_typed_array = constructor.construct(args, Some(constructor), context)?;

        // 2. Let taRecord be ? ValidateTypedArray(newTypedArray, seq-cst).
        let (new_ta, buf_len) =
            TypedArray::validate(&JsValue::new(new_typed_array), Ordering::SeqCst)?;

        // 3. If the number of elements in argumentList is 1 and argumentList[0] is a Number, then
        if args.len() == 1
            && let Some(number) = args[0].as_number()
        {
            let new_ta = new_ta.borrow();
            // a. If IsTypedArrayOutOfBounds(taRecord) is true, throw a TypeError exception.
            if new_ta.data().is_out_of_bounds(buf_len) {
                return Err(JsNativeError::typ()
                    .with_message("new typed array outside of the bounds of its inner buffer")
                    .into());
            }

            // b. Let length be TypedArrayLength(taRecord).
            // c. If length < ℝ(argumentList[0]), throw a TypeError exception.
            if (new_ta.data().array_length(buf_len) as f64) < number {
                return Err(JsNativeError::typ()
                    .with_message("new typed array length is smaller than expected")
                    .into());
            }
        }

        // 4. Return newTypedArray.
        Ok(new_ta)
    }

    /// [`AllocateTypedArrayBuffer ( O, length )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-allocatetypedarraybuffer
    fn allocate_buffer<T: TypedArrayMarker>(
        length: u64,
        context: &mut Context,
    ) -> JsResult<TypedArray> {
        // 1. Assert: O.[[ViewedArrayBuffer]] is undefined.

        // 2. Let constructorName be the String value of O.[[TypedArrayName]].
        // 3. Let elementSize be the Element Size value specified in Table 73 for constructorName.
        let element_size = T::ERASED.element_size();

        // 4. Let byteLength be elementSize × length.
        let byte_length = element_size * length;

        // 5. Let data be ? AllocateArrayBuffer(%ArrayBuffer%, byteLength).
        let data = ArrayBuffer::allocate(
            &context
                .intrinsics()
                .constructors()
                .array_buffer()
                .constructor()
                .into(),
            byte_length,
            None,
            context,
        )?;

        // 10. Return O.
        Ok(TypedArray::new(
            // 6. Set O.[[ViewedArrayBuffer]] to data.
            BufferObject::Buffer(data),
            T::ERASED,
            // 8. Set O.[[ByteOffset]] to 0.
            0,
            // 7. Set O.[[ByteLength]] to byteLength.
            Some(byte_length),
            // 9. Set O.[[ArrayLength]] to length.
            Some(length),
        ))
    }

    /// <https://tc39.es/ecma262/#sec-initializetypedarrayfromlist>
    pub(crate) fn initialize_from_list<T: TypedArrayMarker>(
        proto: JsObject,
        values: Vec<JsValue>,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        // 1. Let len be the number of elements in values.
        let len = values.len() as u64;
        // 2. Perform ? AllocateTypedArrayBuffer(O, len).
        let buf = Self::allocate_buffer::<T>(len, context)?;
        let obj = JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), proto, buf)
            .upcast();

        // 3. Let k be 0.
        // 4. Repeat, while k < len,
        for (k, k_value) in values.into_iter().enumerate() {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kValue be the first element of values and remove that element from values.
            // c. Perform ? Set(O, Pk, kValue, true).
            obj.set(k, k_value, true, context)?;
            // d. Set k to k + 1.
        }

        // 5. Assert: values is now an empty List.
        // It no longer exists.
        Ok(obj)
    }

    /// `AllocateTypedArray ( constructorName, newTarget, defaultProto [ , length ] )`
    ///
    /// It is used to validate and create an instance of a `TypedArray` constructor. If the `length`
    /// argument is passed, an `ArrayBuffer` of that length is also allocated and associated with the
    /// new `TypedArray` instance. `AllocateTypedArray` provides common semantics that is used by
    /// `TypedArray`.
    ///
    /// For more information, check the [spec][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-allocatetypedarray
    pub(super) fn allocate<T: TypedArrayMarker>(
        new_target: &JsValue,
        length: u64,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        // 1. Let proto be ? GetPrototypeFromConstructor(newTarget, defaultProto).
        let proto = get_prototype_from_constructor(new_target, T::STANDARD_CONSTRUCTOR, context)?;

        // 3. Assert: obj.[[ViewedArrayBuffer]] is undefined.
        // 4. Set obj.[[TypedArrayName]] to constructorName.
        // 5. If constructorName is "BigInt64Array" or "BigUint64Array", set obj.[[ContentType]] to BigInt.
        // 6. Otherwise, set obj.[[ContentType]] to Number.
        // 7. If length is not present, then
        // a. Set obj.[[ByteLength]] to 0.
        // b. Set obj.[[ByteOffset]] to 0.
        // c. Set obj.[[ArrayLength]] to 0.

        // 8. Else,
        // a. Perform ? AllocateTypedArrayBuffer(obj, length).
        let indexed = Self::allocate_buffer::<T>(length, context)?;

        // 2. Let obj be ! IntegerIndexedObjectCreate(proto).
        let obj =
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), proto, indexed)
                .upcast();

        // 9. Return obj.
        Ok(obj)
    }

    /// `InitializeTypedArrayFromTypedArray ( O, srcArray )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-initializetypedarrayfromtypedarray
    pub(super) fn initialize_from_typed_array<T: TypedArrayMarker>(
        proto: JsObject,
        src_array: &JsObject<TypedArray>,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        let src_array = src_array.borrow();
        let src_array = src_array.data();

        // 1. Let srcData be srcArray.[[ViewedArrayBuffer]].
        let src_data = src_array.viewed_array_buffer();
        let src_data = src_data.as_buffer();

        // 2. Let elementType be TypedArrayElementType(O).
        let element_type = T::ERASED;
        // 3. Let elementSize be TypedArrayElementSize(O).
        let element_size = element_type.element_size();

        // 4. Let srcType be TypedArrayElementType(srcArray).
        let src_type = src_array.kind();
        // 5. Let srcElementSize be TypedArrayElementSize(srcArray).
        let src_element_size = src_type.element_size();
        // 6. Let srcByteOffset be srcArray.[[ByteOffset]].
        let src_byte_offset = src_array.byte_offset();

        // 7. Let srcRecord be MakeTypedArrayWithBufferWitnessRecord(srcArray, seq-cst).
        // 8. If IsTypedArrayOutOfBounds(srcRecord) is true, throw a TypeError exception.
        let Some(src_data) = src_data
            .bytes(Ordering::SeqCst)
            .filter(|buf| !src_array.is_out_of_bounds(buf.len()))
        else {
            return Err(JsNativeError::typ()
                .with_message("Cannot initialize typed array from invalid buffer")
                .into());
        };

        // 9. Let elementLength be TypedArrayLength(srcRecord).
        let element_length = src_array.array_length(src_data.len());
        // 10. Let byteLength be elementSize × elementLength.
        let byte_length = element_size * element_length;

        // 11. If elementType is srcType, then

        let new_buffer = if element_type == src_type {
            let start = src_byte_offset as usize;
            let count = byte_length as usize;
            // a. Let data be ? CloneArrayBuffer(srcData, srcByteOffset, byteLength).
            src_data.subslice(start..start + count).clone(context)?
        } else {
            // 12. Else,
            //     a. Let data be ? AllocateArrayBuffer(%ArrayBuffer%, byteLength).
            let data_obj = ArrayBuffer::allocate(
                &context
                    .realm()
                    .intrinsics()
                    .constructors()
                    .array_buffer()
                    .constructor()
                    .into(),
                byte_length,
                None,
                context,
            )?;
            {
                let mut data = data_obj.borrow_mut();
                let mut data = SliceRefMut::Slice(
                    data.data_mut()
                        .bytes_mut()
                        .js_expect("a new buffer cannot be detached")?,
                );

                // b. If srcArray.[[ContentType]] is not O.[[ContentType]], throw a TypeError exception.
                if src_type.content_type() != element_type.content_type() {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot initialize typed array from different content type")
                        .into());
                }

                let src_element_size = src_element_size as usize;
                let target_element_size = element_size as usize;

                // c. Let srcByteIndex be srcByteOffset.
                let mut src_byte_index = src_byte_offset as usize;

                // d. Let targetByteIndex be 0.
                let mut target_byte_index = 0;

                // e. Let count be elementLength.
                let mut count = element_length;

                // f. Repeat, while count > 0,
                while count > 0 {
                    // i. Let value be GetValueFromBuffer(srcData, srcByteIndex, srcType, true, unordered).
                    // SAFETY: All integer indexed objects are always in-bounds and properly
                    // aligned to their underlying buffer.
                    let value = unsafe {
                        src_data
                            .subslice(src_byte_index..)
                            .get_value(src_type, Ordering::Relaxed)
                    };

                    let value = value.cast(element_type);

                    // ii. Perform SetValueInBuffer(data, targetByteIndex, elementType, value, true, unordered).
                    // SAFETY: The newly created buffer has at least `element_size * element_length`
                    // bytes available, which makes `target_byte_index` always in-bounds.
                    unsafe {
                        data.subslice_mut(target_byte_index..)
                            .set_value(value, Ordering::Relaxed);
                    }

                    // iii. Set srcByteIndex to srcByteIndex + srcElementSize.
                    src_byte_index += src_element_size;

                    // iv. Set targetByteIndex to targetByteIndex + elementSize.
                    target_byte_index += target_element_size;

                    // v. Set count to count - 1.
                    count -= 1;
                }
            }

            data_obj
        };

        // 13. Set O.[[ViewedArrayBuffer]] to data.
        // 14. Set O.[[ByteLength]] to byteLength.
        // 15. Set O.[[ByteOffset]] to 0.
        // 16. Set O.[[ArrayLength]] to elementLength.
        let obj = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            proto,
            TypedArray::new(
                BufferObject::Buffer(new_buffer),
                element_type,
                0,
                Some(byte_length),
                Some(element_length),
            ),
        )
        .upcast();

        // 17. Return unused.
        Ok(obj)
    }

    /// [`InitializeTypedArrayFromArrayBuffer ( O, buffer, byteOffset, length )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-initializetypedarrayfromarraybuffer
    pub(super) fn initialize_from_array_buffer<T: TypedArrayMarker>(
        proto: JsObject,
        buffer: BufferObject,
        byte_offset: &JsValue,
        length: &JsValue,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        // 1. Let elementSize be TypedArrayElementSize(O).
        let element_size = T::ERASED.element_size();

        // 2. Let offset be ? ToIndex(byteOffset).
        let offset = byte_offset.to_index(context)?;

        // 3. If offset modulo elementSize ≠ 0, throw a RangeError exception.
        if offset % element_size != 0 {
            return Err(JsNativeError::range()
                .with_message("byte offset of typed array must be aligned")
                .into());
        }

        // 4. Let bufferIsFixedLength be IsFixedLengthArrayBuffer(buffer).
        let is_fixed_length = buffer.as_buffer().is_fixed_len();

        // 5. If length is not undefined, then
        let new_length = if length.is_undefined() {
            None
        } else {
            // a. Let newLength be ? ToIndex(length).
            Some(length.to_index(context)?)
        };

        let buffer_byte_length = {
            let buffer = buffer.as_buffer();

            // 6. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
            let Some(data) = buffer.bytes(Ordering::SeqCst) else {
                return Err(JsNativeError::typ()
                    .with_message("cannot construct typed array from detached buffer")
                    .into());
            };

            // 7. Let bufferByteLength be ArrayBufferByteLength(buffer, seq-cst).
            data.len() as u64
        };

        let (byte_length, array_length) = if let Some(new_length) = new_length {
            // 9. Else,
            //    b. Else,
            //       i. Let newByteLength be newLength × elementSize.
            let new_byte_length = new_length * element_size;

            //       ii. If offset + newByteLength > bufferByteLength, throw a RangeError exception.
            if offset + new_byte_length > buffer_byte_length {
                return Err(JsNativeError::range()
                    .with_message(
                        "cannot create a typed array spanning a byte range outside of its buffer",
                    )
                    .into());
            }

            //    c. Set O.[[ByteLength]] to newByteLength.
            //    d. Set O.[[ArrayLength]] to newByteLength / elementSize.
            (Some(new_byte_length), Some(new_length))
        } else if !is_fixed_length {
            // 8. If length is undefined and bufferIsFixedLength is false, then
            //    a. If offset > bufferByteLength, throw a RangeError exception.
            if offset > buffer_byte_length {
                return Err(JsNativeError::range()
                    .with_message("TypedArray offset outside of buffer length")
                    .into());
            }

            //    b. Set O.[[ByteLength]] to auto.
            //    c. Set O.[[ArrayLength]] to auto.
            (None, None)
        } else {
            // a. If length is undefined, then
            //    i. If bufferByteLength modulo elementSize ≠ 0, throw a RangeError exception.
            if buffer_byte_length % element_size != 0 {
                return Err(JsNativeError::range()
                    .with_message("cannot construct a typed array with an unaligned buffer")
                    .into());
            }

            //    ii. Let newByteLength be bufferByteLength - offset.
            //    iii. If newByteLength < 0, throw a RangeError exception.
            let Some(new_byte_length) = buffer_byte_length.checked_sub(offset) else {
                return Err(JsNativeError::range()
                    .with_message("offset of typed array exceeds buffer size")
                    .into());
            };

            // c. Set O.[[ByteLength]] to newByteLength.
            // d. Set O.[[ArrayLength]] to newByteLength / elementSize.
            (Some(new_byte_length), Some(new_byte_length / element_size))
        };

        // 10. Set O.[[ViewedArrayBuffer]] to buffer.
        // 11. Set O.[[ByteOffset]] to offset.
        // 12. Return unused.
        Ok(JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            proto,
            TypedArray::new(buffer, T::ERASED, offset, byte_length, array_length),
        )
        .upcast())
    }

    /// `InitializeTypedArrayFromArrayLike ( O, arrayLike )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-initializetypedarrayfromarraylike
    pub(super) fn initialize_from_array_like<T: TypedArrayMarker>(
        proto: JsObject,
        array_like: &JsObject,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        // 1. Let len be ? LengthOfArrayLike(arrayLike).
        let len = array_like.length_of_array_like(context)?;

        // 2. Perform ? AllocateTypedArrayBuffer(O, len).
        let buf = Self::allocate_buffer::<T>(len, context)?;
        let obj = JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), proto, buf)
            .upcast();

        // 3. Let k be 0.
        // 4. Repeat, while k < len,
        for k in 0..len {
            // a. Let Pk be ! ToString(𝔽(k)).
            // b. Let kValue be ? Get(arrayLike, Pk).
            let k_value = array_like.get(k, context)?;

            // c. Perform ? Set(O, Pk, kValue, true).
            obj.set(k, k_value, true, context)?;
        }

        Ok(obj)
    }
}

#[derive(Debug)]
enum U64OrPositiveInfinity {
    U64(u64),
    PositiveInfinity,
}

/// `CompareTypedArrayElements ( x, y, comparefn )`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-comparetypedarrayelements
fn compare_typed_array_elements(
    x: &JsValue,
    y: &JsValue,
    compare_fn: Option<&JsObject>,
    context: &mut Context,
) -> JsResult<cmp::Ordering> {
    // 1. Assert: x is a Number and y is a Number, or x is a BigInt and y is a BigInt.

    // 2. If comparefn is not undefined, then
    if let Some(compare_fn) = compare_fn {
        // a. Let v be ? ToNumber(? Call(comparefn, undefined, « x, y »)).
        let v = compare_fn
            .call(&JsValue::undefined(), &[x.clone(), y.clone()], context)?
            .to_number(context)?;

        // b. If v is NaN, return +0𝔽.
        if v.is_nan() {
            return Ok(cmp::Ordering::Equal);
        }

        // c. Return v.
        if v.is_sign_positive() {
            return Ok(cmp::Ordering::Greater);
        }
        return Ok(cmp::Ordering::Less);
    }

    match (x.variant(), y.variant()) {
        (JsVariant::BigInt(x), JsVariant::BigInt(y)) => {
            // Note: Other steps are not relevant for BigInts.
            // 6. If x < y, return -1𝔽.
            // 7. If x > y, return 1𝔽.
            // 10. Return +0𝔽.
            Ok(x.cmp(&y))
        }
        (JsVariant::Integer32(x), JsVariant::Integer32(y)) => {
            // Note: Other steps are not relevant for integers.
            // 6. If x < y, return -1𝔽.
            // 7. If x > y, return 1𝔽.
            // 10. Return +0𝔽.
            Ok(x.cmp(&y))
        }
        (JsVariant::Float64(x), JsVariant::Float64(y)) => {
            // 3. If x and y are both NaN, return +0𝔽.
            if x.is_nan() && y.is_nan() {
                return Ok(cmp::Ordering::Equal);
            }

            // 4. If x is NaN, return 1𝔽.
            if x.is_nan() {
                return Ok(cmp::Ordering::Greater);
            }

            // 5. If y is NaN, return -1𝔽.
            if y.is_nan() {
                return Ok(cmp::Ordering::Less);
            }

            // 6. If x < y, return -1𝔽.
            if x < y {
                return Ok(cmp::Ordering::Less);
            }

            // 7. If x > y, return 1𝔽.
            if x > y {
                return Ok(cmp::Ordering::Greater);
            }

            // 8. If x is -0𝔽 and y is +0𝔽, return -1𝔽.
            if x.is_sign_negative() && x.is_zero() && y.is_sign_positive() && y.is_zero() {
                return Ok(cmp::Ordering::Less);
            }

            // 9. If x is +0𝔽 and y is -0𝔽, return 1𝔽.
            if x.is_sign_positive() && x.is_zero() && y.is_sign_negative() && y.is_zero() {
                return Ok(cmp::Ordering::Greater);
            }

            // 10. Return +0𝔽.
            Ok(cmp::Ordering::Equal)
        }
        _ => unreachable!("x and y must be both Numbers or BigInts"),
    }
}

/// Abstract operation `IsValidIntegerIndex ( O, index )`.
///
/// Returns `true` if the index is valid, or `false` otherwise.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-isvalidintegerindex
pub(crate) fn is_valid_integer_index(obj: &JsObject, index: f64) -> JsResult<bool> {
    let inner = obj.downcast_ref::<TypedArray>().js_expect(
        "integer indexed exotic method should only be callable from TypedArray objects",
    )?;

    let buf = inner.viewed_array_buffer();
    let buf = buf.as_buffer();

    // 1. If IsDetachedBuffer(O.[[ViewedArrayBuffer]]) is true, return false.
    // 4. Let taRecord be MakeTypedArrayWithBufferWitnessRecord(O, unordered).
    // 5. NOTE: Bounds checking is not a synchronizing operation when O's backing buffer is a growable SharedArrayBuffer.
    let Some(buf_len) = buf.bytes(Ordering::Relaxed).map(|s| s.len()) else {
        return Ok(false);
    };

    Ok(inner.validate_index(index, buf_len).is_some())
}
