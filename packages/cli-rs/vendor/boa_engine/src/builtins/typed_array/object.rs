//! This module implements the `TypedArray` exotic object.

use std::sync::atomic::Ordering;

use crate::{
    Context, JsExpect, JsNativeError, JsResult, JsString, JsValue,
    builtins::array_buffer::{BufferObject, BufferRef},
    object::{
        JsData, JsObject,
        internal_methods::{
            InternalMethodPropertyContext, InternalObjectMethods, ORDINARY_INTERNAL_METHODS,
            ordinary_define_own_property, ordinary_delete, ordinary_get, ordinary_get_own_property,
            ordinary_has_property, ordinary_prevent_extensions, ordinary_set, ordinary_try_get,
        },
    },
    property::{PropertyDescriptor, PropertyKey},
};
use boa_gc::{Finalize, Trace};
use boa_macros::js_str;

use super::{TypedArrayKind, is_valid_integer_index};

/// A `TypedArray` object is an exotic object that performs special handling of integer
/// index property keys.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-typedarray-exotic-objects
#[derive(Debug, Clone, Trace, Finalize)]
pub struct TypedArray {
    viewed_array_buffer: BufferObject,
    kind: TypedArrayKind,
    byte_offset: u64,
    byte_length: Option<u64>,
    array_length: Option<u64>,
}

impl JsData for TypedArray {
    fn internal_methods(&self) -> &'static InternalObjectMethods {
        static METHODS: InternalObjectMethods = InternalObjectMethods {
            __get_own_property__: typed_array_exotic_get_own_property,
            __has_property__: typed_array_exotic_has_property,
            __define_own_property__: typed_array_exotic_define_own_property,
            __try_get__: typed_array_exotic_try_get,
            __get__: typed_array_exotic_get,
            __set__: typed_array_exotic_set,
            __delete__: typed_array_exotic_delete,
            __own_property_keys__: typed_array_exotic_own_property_keys,
            __prevent_extensions__: typed_array_exotic_prevent_extensions,
            ..ORDINARY_INTERNAL_METHODS
        };

        &METHODS
    }
}

impl TypedArray {
    pub(crate) const fn new(
        viewed_array_buffer: BufferObject,
        kind: TypedArrayKind,
        byte_offset: u64,
        byte_length: Option<u64>,
        array_length: Option<u64>,
    ) -> Self {
        Self {
            viewed_array_buffer,
            kind,
            byte_offset,
            byte_length,
            array_length,
        }
    }

    /// Returns `true` if the typed array has an automatic array length.
    pub(crate) fn is_auto_length(&self) -> bool {
        self.array_length.is_none()
    }

    /// Abstract operation [`IsTypedArrayOutOfBounds ( taRecord )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/sec-istypedarrayoutofbounds
    pub(crate) fn is_out_of_bounds(&self, buf_byte_len: usize) -> bool {
        // Checks when allocating the buffer ensure the length fits inside an `u64`.
        let buf_byte_len = buf_byte_len as u64;

        // 1. Let O be taRecord.[[Object]].
        // 2. Let bufferByteLength be taRecord.[[CachedBufferByteLength]].
        // 3. Assert: IsDetachedBuffer(O.[[ViewedArrayBuffer]]) is true if and only if bufferByteLength is detached.
        // 4. If bufferByteLength is detached, return true.
        // Handled by the caller

        // 5. Let byteOffsetStart be O.[[ByteOffset]].
        let byte_start = self.byte_offset;

        // 6. If O.[[ArrayLength]] is auto, then
        //     a. Let byteOffsetEnd be bufferByteLength.
        let byte_end = self.array_length.map_or(buf_byte_len, |arr_len| {
            // 7. Else,
            //     a. Let elementSize be TypedArrayElementSize(O).
            let element_size = self.kind.element_size();

            //     b. Let byteOffsetEnd be byteOffsetStart + O.[[ArrayLength]] × elementSize.
            byte_start + arr_len * element_size
        });

        // 8. If byteOffsetStart > bufferByteLength or byteOffsetEnd > bufferByteLength, return true.
        // 9. NOTE: 0-length TypedArrays are not considered out-of-bounds.
        // 10. Return false.
        byte_start > buf_byte_len || byte_end > buf_byte_len
    }

    /// Get the `TypedArray` object's byte offset.
    #[must_use]
    pub const fn byte_offset(&self) -> u64 {
        self.byte_offset
    }

    /// Get the `TypedArray` object's typed array kind.
    #[must_use]
    pub const fn kind(&self) -> TypedArrayKind {
        self.kind
    }

    /// Get a reference to the `TypedArray` object's viewed array buffer.
    #[must_use]
    pub(crate) const fn viewed_array_buffer(&self) -> &BufferObject {
        &self.viewed_array_buffer
    }

    /// [`TypedArrayByteLength ( taRecord )`][spec].
    ///
    /// Get the `TypedArray` object's byte length.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-typedarraybytelength
    #[must_use]
    pub fn byte_length(&self, buf_byte_len: usize) -> u64 {
        // 1. If IsTypedArrayOutOfBounds(taRecord) is true, return 0.
        if self.is_out_of_bounds(buf_byte_len) {
            return 0;
        }

        // 2. Let length be TypedArrayLength(taRecord).
        let length = self.array_length(buf_byte_len);
        // 3. If length = 0, return 0.
        if length == 0 {
            return 0;
        }

        // 4. Let O be taRecord.[[Object]].

        // 5. If O.[[ByteLength]] is not auto, return O.[[ByteLength]].
        if let Some(byte_length) = self.byte_length {
            return byte_length;
        }

        // 6. Let elementSize be TypedArrayElementSize(O).
        let elem_size = self.kind.element_size();

        // 7. Return length × elementSize.
        // Should not overflow thanks to the checks at creation time.
        length * elem_size
    }

    /// [`TypedArrayLength ( taRecord )`][spec].
    ///
    /// Get the `TypedArray` object's array length.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-typedarraylength
    #[must_use]
    pub fn array_length(&self, buf_byte_len: usize) -> u64 {
        // 1. Assert: IsTypedArrayOutOfBounds(taRecord) is false.
        debug_assert!(!self.is_out_of_bounds(buf_byte_len));
        let buf_byte_len = buf_byte_len as u64;

        // 2. Let O be taRecord.[[Object]].

        // 3. If O.[[ArrayLength]] is not auto, return O.[[ArrayLength]].
        if let Some(array_length) = self.array_length {
            return array_length;
        }
        // 4. Assert: IsFixedLengthArrayBuffer(O.[[ViewedArrayBuffer]]) is false.

        // 5. Let byteOffset be O.[[ByteOffset]].
        let byte_offset = self.byte_offset;
        // 6. Let elementSize be TypedArrayElementSize(O).
        let elem_size = self.kind.element_size();

        // 7. Let byteLength be taRecord.[[CachedBufferByteLength]].
        // 8. Assert: byteLength is not detached.
        // 9. Return floor((byteLength - byteOffset) / elementSize).
        (buf_byte_len - byte_offset) / elem_size
    }

    /// Abstract operation [`ValidateTypedArray ( O, order )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/sec-validatetypedarray
    pub(crate) fn validate(this: &JsValue, order: Ordering) -> JsResult<(JsObject<Self>, usize)> {
        // 1. Perform ? RequireInternalSlot(O, [[TypedArrayName]]).
        let obj = this
            .as_object()
            .and_then(|o| o.clone().downcast::<Self>().ok())
            .ok_or_else(|| {
                JsNativeError::typ().with_message("`this` is not a typed array object")
            })?;

        let len = {
            let array = obj.borrow();
            let buffer = array.data().viewed_array_buffer().as_buffer();
            // 2. Assert: O has a [[ViewedArrayBuffer]] internal slot.
            // 3. Let taRecord be MakeTypedArrayWithBufferWitnessRecord(O, order).
            // 4. If IsTypedArrayOutOfBounds(taRecord) is true, throw a TypeError exception.
            let Some(buf) = buffer
                .bytes(order)
                .filter(|buf| !array.data().is_out_of_bounds(buf.len()))
            else {
                return Err(JsNativeError::typ()
                    .with_message("typed array is outside the bounds of its inner buffer")
                    .into());
            };
            buf.len()
        };

        // 5. Return taRecord.
        Ok((obj, len))
    }

    /// Validates `index` to be in bounds for the inner buffer of this `TypedArray`.
    ///
    /// Note: if this is only used for bounds checking, it is recommended to use
    /// the `Ordering::Relaxed` ordering to get the buffer slice.
    pub(crate) fn validate_index(&self, index: f64, buf_len: usize) -> Option<u64> {
        // 2. If IsIntegralNumber(index) is false, return false.
        if index.is_nan() || index.is_infinite() || index.fract() != 0.0 {
            return None;
        }

        // 3. If index is -0𝔽, return false.
        if index == 0.0 && index.is_sign_negative() {
            return None;
        }

        // 6. If IsTypedArrayOutOfBounds(taRecord) is true, return false.
        if self.is_out_of_bounds(buf_len) {
            return None;
        }

        // 7. Let length be TypedArrayLength(taRecord).
        let length = self.array_length(buf_len);

        // 8. If ℝ(index) < 0 or ℝ(index) ≥ length, return false.
        if index < 0.0 || index >= length as f64 {
            return None;
        }

        // 9. Return true.
        Some(index as u64)
    }

    /// Validates a `u64` index to be in bounds for the inner buffer of this `TypedArray`.
    ///
    /// This is an optimized variant of [`validate_index`](Self::validate_index) for cases where
    /// the index is already known to be a non-negative integer (`u64`), skipping the redundant
    /// checks for `NaN`, infinity, fractional values, and negative zero.
    pub(crate) fn validate_index_u64(&self, index: u64, buf_len: usize) -> Option<u64> {
        // 1. If IsTypedArrayOutOfBounds(taRecord) is true, return false.
        if self.is_out_of_bounds(buf_len) {
            return None;
        }

        // 2. Let length be TypedArrayLength(taRecord).
        let length = self.array_length(buf_len);

        // 3. If index ≥ length, return false.
        if index >= length {
            return None;
        }

        // 4. Return true.
        Some(index)
    }

    /// Abstract operation `IsTypedArrayFixedLength ( O )`.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-istypedarrayfixedlength
    fn is_fixed_length(&self) -> bool {
        // 1. If O.[[ArrayLength]] is auto, return false.
        if self.is_auto_length() {
            return false;
        }

        // 2. Let buffer be O.[[ViewedArrayBuffer]].
        match self.viewed_array_buffer().as_buffer() {
            // 3. If IsFixedLengthArrayBuffer(buffer) is false and IsSharedArrayBuffer(buffer) is false, return false.
            BufferRef::Buffer(buf) => buf.is_fixed_len(),
            BufferRef::SharedBuffer(_) => true,
        }
    }
}

// Integer-Indexed Exotic Objects [[PreventExtensions]] ( O )
// https://tc39.es/ecma262/#sec-integer-indexed-exotic-objects-preventextensions
//
// 1. If IsTypedArrayFixedLength(O) is false, return false.
// 2. Return OrdinaryPreventExtensions(O).
pub(crate) fn typed_array_exotic_prevent_extensions(
    obj: &JsObject,
    context: &mut Context,
) -> JsResult<bool> {
    let is_fixed_length = {
        let ta = obj
            .downcast_ref::<TypedArray>()
            .js_expect("must be a TypedArray")?;

        ta.is_fixed_length()
    }; // Note: this block ensures that the borrow of obj is dropped
    // so it may be re-borrowed in step 3

    // 1. If IsTypedArrayFixedLength(O) is false, return false.
    if !is_fixed_length {
        return Ok(false);
    }

    // 2. Return OrdinaryPreventExtensions(O).
    ordinary_prevent_extensions(obj, context)
}

/// `CanonicalNumericIndexString ( argument )`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-canonicalnumericindexstring
fn canonical_numeric_index_string(argument: &JsString) -> Option<f64> {
    // 1. If argument is "-0", return -0𝔽.
    if argument == &js_str!("-0") {
        return Some(-0.0);
    }

    // 2. Let n be ! ToNumber(argument).
    let n = argument.to_number();

    // 3. If ! ToString(n) is argument, return n.
    if &JsString::from(n) == argument {
        return Some(n);
    }

    // 4. Return undefined.
    None
}

/// `[[GetOwnProperty]]` internal method for `TypedArray` exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-typedarray-getownproperty
pub(crate) fn typed_array_exotic_get_own_property(
    obj: &JsObject,
    key: &PropertyKey,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<Option<PropertyDescriptor>> {
    let p = match key {
        PropertyKey::String(key) => {
            // 1.a. Let numericIndex be CanonicalNumericIndexString(P).
            canonical_numeric_index_string(key)
        }
        PropertyKey::Index(index) => Some(index.get().into()),
        PropertyKey::Symbol(_) => None,
    };

    // 1. If P is a String, then
    // 1.b. If numericIndex is not undefined, then
    if let Some(numeric_index) = p {
        // i. Let value be IntegerIndexedElementGet(O, numericIndex).
        let value = typed_array_get_element(obj, numeric_index)?;

        // ii. If value is undefined, return undefined.
        // iii. Return the PropertyDescriptor { [[Value]]: value, [[Writable]]: true, [[Enumerable]]: true, [[Configurable]]: true }.
        return Ok(value.map(|v| {
            PropertyDescriptor::builder()
                .value(v)
                .writable(true)
                .enumerable(true)
                .configurable(true)
                .build()
        }));
    }

    // 2. Return OrdinaryGetOwnProperty(O, P).
    ordinary_get_own_property(obj, key, context)
}

/// `[[HasProperty]]` internal method for `TypedArray` exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-typedarray-hasproperty
pub(crate) fn typed_array_exotic_has_property(
    obj: &JsObject,
    key: &PropertyKey,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    let p = match key {
        PropertyKey::String(key) => {
            // 1.a. Let numericIndex be CanonicalNumericIndexString(P).
            canonical_numeric_index_string(key)
        }
        PropertyKey::Index(index) => Some(index.get().into()),
        PropertyKey::Symbol(_) => None,
    };

    // 1. If P is a String, then
    // 1.b. If numericIndex is not undefined, return IsValidIntegerIndex(O, numericIndex).
    if let Some(numeric_index) = p {
        return is_valid_integer_index(obj, numeric_index);
    }

    // 2. Return ? OrdinaryHasProperty(O, P).
    ordinary_has_property(obj, key, context)
}

/// `[[DefineOwnProperty]]` internal method for `TypedArray` exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-typedarray-defineownproperty
pub(crate) fn typed_array_exotic_define_own_property(
    obj: &JsObject,
    key: &PropertyKey,
    desc: PropertyDescriptor,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    let p = match key {
        PropertyKey::String(key) => {
            // 1.a. Let numericIndex be CanonicalNumericIndexString(P).
            canonical_numeric_index_string(key)
        }
        PropertyKey::Index(index) => Some(index.get().into()),
        PropertyKey::Symbol(_) => None,
    };

    // 1. If P is a String, then
    // 1.b. If numericIndex is not undefined, then
    if let Some(numeric_index) = p {
        // i. If IsValidIntegerIndex(O, numericIndex) is false, return false.
        if !is_valid_integer_index(obj, numeric_index)? {
            return Ok(false);
        }

        // ii. If Desc has a [[Configurable]] field and Desc.[[Configurable]] is false, return false.
        if desc.configurable() == Some(false) {
            return Ok(false);
        }

        // iii. If Desc has an [[Enumerable]] field and Desc.[[Enumerable]] is false, return false.
        if desc.enumerable() == Some(false) {
            return Ok(false);
        }

        // iv. If IsAccessorDescriptor(Desc) is true, return false.
        if desc.is_accessor_descriptor() {
            return Ok(false);
        }

        // v. If Desc has a [[Writable]] field and Desc.[[Writable]] is false, return false.
        if desc.writable() == Some(false) {
            return Ok(false);
        }

        // vi. If Desc has a [[Value]] field, perform ? IntegerIndexedElementSet(O, numericIndex, Desc.[[Value]]).
        if let Some(value) = desc.value() {
            typed_array_set_element(obj, numeric_index, value, context)?;
        }

        // vii. Return true.
        return Ok(true);
    }

    // 2. Return ! OrdinaryDefineOwnProperty(O, P, Desc).
    ordinary_define_own_property(obj, key, desc, context)
}

/// Internal optimization method for `TypedArray` exotic objects.
///
/// This method combines the internal methods `[[HasProperty]]` and `[[Get]]`.
///
/// More information:
///  - [ECMAScript reference HasProperty][spec0]
///  - [ECMAScript reference Get][spec1]
///
/// [spec0]: https://tc39.es/ecma262/#sec-typedarray-hasproperty
/// [spec1]: https://tc39.es/ecma262/#sec-typedarray-get
pub(crate) fn typed_array_exotic_try_get(
    obj: &JsObject,
    key: &PropertyKey,
    receiver: JsValue,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<Option<JsValue>> {
    let p = match key {
        PropertyKey::String(key) => {
            // 1.a. Let numericIndex be CanonicalNumericIndexString(P).
            canonical_numeric_index_string(key)
        }
        PropertyKey::Index(index) => Some(index.get().into()),
        PropertyKey::Symbol(_) => None,
    };

    // 1. If P is a String, then
    // 1.b. If numericIndex is not undefined, then
    if let Some(numeric_index) = p {
        // i. Return IntegerIndexedElementGet(O, numericIndex).
        return typed_array_get_element(obj, numeric_index);
    }

    // 2. Return ? OrdinaryGet(O, P, Receiver).
    ordinary_try_get(obj, key, receiver, context)
}

/// Internal method `[[Get]]` for `TypedArray` exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-typedarray-get
pub(crate) fn typed_array_exotic_get(
    obj: &JsObject,
    key: &PropertyKey,
    receiver: JsValue,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<JsValue> {
    let p = match key {
        PropertyKey::String(key) => {
            // 1.a. Let numericIndex be CanonicalNumericIndexString(P).
            canonical_numeric_index_string(key)
        }
        PropertyKey::Index(index) => Some(index.get().into()),
        PropertyKey::Symbol(_) => None,
    };

    // 1. If P is a String, then
    // 1.b. If numericIndex is not undefined, then
    if let Some(numeric_index) = p {
        // i. Return IntegerIndexedElementGet(O, numericIndex).
        return Ok(typed_array_get_element(obj, numeric_index)?.unwrap_or_default());
    }

    // 2. Return ? OrdinaryGet(O, P, Receiver).
    ordinary_get(obj, key, receiver, context)
}

/// Internal method `[[Set]]` for `TypedArray` exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-typedarray-set
pub(crate) fn typed_array_exotic_set(
    obj: &JsObject,
    key: PropertyKey,
    value: JsValue,
    receiver: JsValue,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    let p = match &key {
        PropertyKey::String(key) => {
            // 1.a. Let numericIndex be CanonicalNumericIndexString(P).
            canonical_numeric_index_string(key)
        }
        PropertyKey::Index(index) => Some(index.get().into()),
        PropertyKey::Symbol(_) => None,
    };

    // 1. If P is a String, then
    // 1.b. If numericIndex is not undefined, then
    if let Some(numeric_index) = p {
        // i. If SameValue(O, Receiver) is true, then
        if JsValue::same_value(&obj.clone().into(), &receiver) {
            // 1. Perform ? IntegerIndexedElementSet(O, numericIndex, V).
            typed_array_set_element(obj, numeric_index, &value, context)?;

            // 2. Return true.
            return Ok(true);
        }

        // ii. If IsValidIntegerIndex(O, numericIndex) is false, return true.
        if !is_valid_integer_index(obj, numeric_index)? {
            return Ok(true);
        }
    }

    // 2. Return ? OrdinarySet(O, P, V, Receiver).
    ordinary_set(obj, key, value, receiver, context)
}

/// Internal method `[[Delete]]` for `TypedArray` exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-typedarray-delete
pub(crate) fn typed_array_exotic_delete(
    obj: &JsObject,
    key: &PropertyKey,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    let p = match &key {
        PropertyKey::String(key) => {
            // 1.a. Let numericIndex be CanonicalNumericIndexString(P).
            canonical_numeric_index_string(key)
        }
        PropertyKey::Index(index) => Some(index.get().into()),
        PropertyKey::Symbol(_) => None,
    };

    // 1. If P is a String, then
    // 1.b. If numericIndex is not undefined, then
    if let Some(numeric_index) = p {
        // i. If IsValidIntegerIndex(O, numericIndex) is false, return true; else return false.
        return Ok(!is_valid_integer_index(obj, numeric_index)?);
    }

    // 2. Return ! OrdinaryDelete(O, P).
    ordinary_delete(obj, key, context)
}

/// Internal method `[[OwnPropertyKeys]]` for `TypedArray` exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-typedarray-ownpropertykeys
#[allow(clippy::unnecessary_wraps)]
pub(crate) fn typed_array_exotic_own_property_keys(
    obj: &JsObject,
    _context: &mut Context,
) -> JsResult<Vec<PropertyKey>> {
    let inner = obj
        .downcast_ref::<TypedArray>()
        .js_expect("TypedArray exotic method should only be callable from TypedArray objects")?;

    // 1. Let taRecord be MakeTypedArrayWithBufferWitnessRecord(O, seq-cst).
    // 2. Let keys be a new empty List.
    // 3. If IsTypedArrayOutOfBounds(taRecord) is false, then
    let mut keys = match inner
        .viewed_array_buffer
        .as_buffer()
        .bytes(Ordering::SeqCst)
    {
        Some(buf) if !inner.is_out_of_bounds(buf.len()) => {
            // a. Let length be TypedArrayLength(taRecord).
            let length = inner.array_length(buf.len());

            // b. For each integer i such that 0 ≤ i < length, in ascending order, do
            //    i. Append ! ToString(𝔽(i)) to keys.
            (0..length).map(PropertyKey::from).collect()
        }
        _ => Vec::new(),
    };
    drop(inner);

    // 4. For each own property key P of O such that P is a String and P is not an integer index, in ascending chronological order of property creation, do
    //     a. Append P to keys.
    // 5. For each own property key P of O such that P is a Symbol, in ascending chronological order of property creation, do
    //     a. Append P to keys.
    keys.extend(obj.borrow().properties.shape.keys());

    // 6. Return keys.
    Ok(keys)
}

/// Abstract operation `TypedArrayGetElement ( O, index )`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/sec-typedarraygetelement
fn typed_array_get_element(obj: &JsObject, index: f64) -> JsResult<Option<JsValue>> {
    let inner = obj
        .downcast_ref::<TypedArray>()
        .js_expect("typed_array_get_element should only be called on TypedArray objects")?;
    let buffer = inner.viewed_array_buffer();
    let buffer = buffer.as_buffer();

    // 1. If IsValidIntegerIndex(O, index) is false, return undefined.
    let Some(buffer) = buffer.bytes(Ordering::Relaxed) else {
        return Ok(None);
    };

    let Some(index) = inner.validate_index(index, buffer.len()) else {
        return Ok(None);
    };

    // 2. Let offset be O.[[ByteOffset]].
    let offset = inner.byte_offset();

    // 3. Let elementSize be TypedArrayElementSize(O).
    let size = inner.kind.element_size();

    // 4. Let byteIndexInBuffer be (ℝ(index) × elementSize) + offset.
    let byte_index = ((index * size) + offset) as usize;

    // 5. Let elementType be TypedArrayElementType(O).
    let elem_type = inner.kind();

    // 6. Return GetValueFromBuffer(O.[[ViewedArrayBuffer]], byteIndexInBuffer, elementType, true, unordered).
    // SAFETY: The TypedArray object guarantees that the buffer is aligned.
    // The call to `is_valid_integer_index` guarantees that the index is in-bounds.
    let value = unsafe {
        buffer
            .subslice(byte_index..)
            .get_value(elem_type, Ordering::Relaxed)
    };

    Ok(Some(value.into()))
}

/// Abstract operation `TypedArraySetElement ( O, index, value )`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-typedarraysetelement
pub(crate) fn typed_array_set_element(
    obj: &JsObject,
    index: f64,
    value: &JsValue,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<()> {
    let obj = obj
        .clone()
        .downcast::<TypedArray>()
        .ok()
        .js_expect("function can only be called for typed array objects")?;
    // b. Let arrayTypeName be the String value of O.[[TypedArrayName]].
    // e. Let elementType be the Element Type value in Table 73 for arrayTypeName.
    let elem_type = obj.borrow().data().kind();

    // 1. If O.[[ContentType]] is BigInt, let numValue be ? ToBigInt(value).
    // 2. Otherwise, let numValue be ? ToNumber(value).
    let value = elem_type.get_element(value, context)?;

    // 3. If IsValidIntegerIndex(O, index) is true, then
    let array = obj.borrow();
    let mut buffer = array.data().viewed_array_buffer().as_buffer_mut();
    let Some(mut buffer) = buffer.bytes(Ordering::Relaxed) else {
        return Ok(());
    };
    let Some(index) = array.data().validate_index(index, buffer.len()) else {
        return Ok(());
    };

    //     a. Let offset be O.[[ByteOffset]].
    let offset = array.data().byte_offset();

    //     b. Let elementSize be TypedArrayElementSize(O).
    let size = elem_type.element_size();

    //     c. Let byteIndexInBuffer be (ℝ(index) × elementSize) + offset.
    let byte_index = ((index * size) + offset) as usize;

    //     e. Perform SetValueInBuffer(O.[[ViewedArrayBuffer]], byteIndexInBuffer, elementType, numValue, true, unordered).
    // SAFETY: The TypedArray object guarantees that the buffer is aligned.
    // The call to `validate_index` guarantees that the index is in-bounds.
    unsafe {
        buffer
            .subslice_mut(byte_index..)
            .set_value(value, Ordering::Relaxed);
    }

    // 4. Return unused.
    Ok(())
}
