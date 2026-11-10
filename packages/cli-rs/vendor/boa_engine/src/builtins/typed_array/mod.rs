//! Boa's implementation of ECMAScript's global `TypedArray` objects.
//!
//! A `TypedArray` object describes an array-like view of an underlying binary data buffer.
//! There is no global property named `TypedArray`, nor is there a directly visible `TypedArray` constructor.
//! Instead, there are a number of different global properties,
//! whose values are typed array constructors for specific element types.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-typedarray-objects
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray

use crate::{
    Context, JsArgs, JsResult, JsString,
    builtins::{BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    error::JsNativeError,
    js_string,
    object::{JsObject, internal_methods::get_prototype_from_constructor},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
    value::{JsValue, Numeric},
};
use boa_gc::{Finalize, Trace};

mod builtin;
mod element;
mod object;

pub(crate) use builtin::{BuiltinTypedArray, is_valid_integer_index};
#[cfg(feature = "float16")]
pub(crate) use element::Float16;
pub(crate) use element::{Atomic, ClampedU8, Element};
pub use object::TypedArray;

pub(crate) trait TypedArrayMarker {
    type Element: Element;
    const ERASED: TypedArrayKind;
}

impl<T: TypedArrayMarker> IntrinsicObject for T {
    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }

    fn init(realm: &Realm) {
        let get_species = BuiltInBuilder::callable(realm, BuiltinTypedArray::get_species)
            .name(js_string!("get [Symbol.species]"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .prototype(
                realm
                    .intrinsics()
                    .constructors()
                    .typed_array()
                    .constructor(),
            )
            .inherits(Some(
                realm.intrinsics().constructors().typed_array().prototype(),
            ))
            .static_accessor(
                JsSymbol::species(),
                Some(get_species),
                None,
                Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("BYTES_PER_ELEMENT"),
                size_of::<T::Element>(),
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::PERMANENT,
            )
            .static_property(
                js_string!("BYTES_PER_ELEMENT"),
                size_of::<T::Element>(),
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::PERMANENT,
            )
            .build();
    }
}

impl<T: TypedArrayMarker> BuiltInObject for T {
    const NAME: JsString = <Self as TypedArrayMarker>::ERASED.js_name();
    const ATTRIBUTE: Attribute = Attribute::WRITABLE
        .union(Attribute::NON_ENUMERABLE)
        .union(Attribute::CONFIGURABLE);
}

impl<T: TypedArrayMarker> BuiltInConstructor for T {
    const CONSTRUCTOR_ARGUMENTS: usize = 3;
    const PROTOTYPE_STORAGE_SLOTS: usize = 1;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 3;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        <Self as TypedArrayMarker>::ERASED.standard_constructor();

    /// `23.2.5.1 TypedArray ( ...args )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-typedarray
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message(format!(
                    "new target was undefined when constructing an {}",
                    T::ERASED.name()
                ))
                .into());
        }

        // 2. Let constructorName be the String value of the Constructor Name value specified in Table 72 for this TypedArray constructor.
        // 3. Let proto be "%TypedArray.prototype%".

        // 4. Let numberOfArgs be the number of elements in args.
        let number_of_args = args.len();

        // 5. If numberOfArgs = 0, then
        if number_of_args == 0 {
            // a. Return ? AllocateTypedArray(constructorName, NewTarget, proto, 0).
            return Ok(BuiltinTypedArray::allocate::<T>(new_target, 0, context)?.into());
        }
        // 6. Else,

        // a. Let firstArgument be args[0].
        let first_argument = &args[0];

        // b. If Type(firstArgument) is Object, then
        let Some(first_argument) = first_argument.as_object() else {
            // c. Else,
            // i. Assert: firstArgument is not an Object.
            // Ensured by the let-else

            // ii. Let elementLength be ? ToIndex(firstArgument).
            let element_length = first_argument.to_index(context)?;

            // iii. Return ? AllocateTypedArray(constructorName, NewTarget, proto, elementLength).
            return BuiltinTypedArray::allocate::<T>(new_target, element_length, context)
                .map(JsValue::from);
        };

        let first_argument = first_argument.clone();

        // i. Let O be ? AllocateTypedArray(constructorName, NewTarget, proto).
        let proto = get_prototype_from_constructor(new_target, T::STANDARD_CONSTRUCTOR, context)?;

        // ii. If firstArgument has a [[TypedArrayName]] internal slot, then
        let first_argument = match first_argument.downcast::<TypedArray>() {
            Ok(arr) => {
                // 1. Perform ? InitializeTypedArrayFromTypedArray(O, firstArgument).

                // v. Return O.
                return BuiltinTypedArray::initialize_from_typed_array::<T>(proto, &arr, context)
                    .map(JsValue::from);
            }
            Err(obj) => obj,
        };

        // iii. Else if firstArgument has an [[ArrayBufferData]] internal slot, then
        let first_argument = match first_argument.into_buffer_object() {
            Ok(buf) => {
                // 1. If numberOfArgs > 1, let byteOffset be args[1]; else let byteOffset be undefined.
                let byte_offset = args.get_or_undefined(1);

                // 2. If numberOfArgs > 2, let length be args[2]; else let length be undefined.
                let length = args.get_or_undefined(2);

                // 3. Perform ? InitializeTypedArrayFromArrayBuffer(O, firstArgument, byteOffset, length).

                // v. Return O.
                return BuiltinTypedArray::initialize_from_array_buffer::<T>(
                    proto,
                    buf,
                    byte_offset,
                    length,
                    context,
                )
                .map(JsValue::from);
            }
            Err(obj) => obj,
        };

        // iv. Else,

        // 1. Assert: Type(firstArgument) is Object and firstArgument does not have
        // either a [[TypedArrayName]] or an [[ArrayBufferData]] internal slot.

        // 2. Let usingIterator be ? GetMethod(firstArgument, @@iterator).
        let using_iterator = first_argument.get_method(JsSymbol::iterator(), context)?;

        // 3. If usingIterator is not undefined, then
        if let Some(using_iterator) = using_iterator {
            // a. Let values be ? IteratorToList(? GetIteratorFromMethod(firstArgument, usingIterator)).
            let values = JsValue::from(first_argument.clone())
                .get_iterator_from_method(&using_iterator, context)?
                .into_list(context)?;

            // b. Perform ? InitializeTypedArrayFromList(O, values).
            BuiltinTypedArray::initialize_from_list::<T>(proto, values, context)
        } else {
            // 4. Else,

            // a. NOTE: firstArgument is not an Iterable so assume it is already an array-like object.
            // b. Perform ? InitializeTypedArrayFromArrayLike(O, firstArgument).
            BuiltinTypedArray::initialize_from_array_like::<T>(proto, &first_argument, context)
        }
        .map(JsValue::from)

        // v. Return O.
    }
}

/// JavaScript `Int8Array` built-in implementation.
#[derive(Debug, Copy, Clone)]
pub struct Int8Array;

impl TypedArrayMarker for Int8Array {
    type Element = i8;

    const ERASED: TypedArrayKind = TypedArrayKind::Int8;
}

/// JavaScript `Uint8Array` built-in implementation.
#[derive(Debug, Copy, Clone)]
pub struct Uint8Array;

impl TypedArrayMarker for Uint8Array {
    type Element = u8;

    const ERASED: TypedArrayKind = TypedArrayKind::Uint8;
}

/// JavaScript `Uint8ClampedArray` built-in implementation.
#[derive(Debug, Copy, Clone)]
pub struct Uint8ClampedArray;

impl TypedArrayMarker for Uint8ClampedArray {
    type Element = ClampedU8;

    const ERASED: TypedArrayKind = TypedArrayKind::Uint8Clamped;
}

/// JavaScript `Int16Array` built-in implementation.
#[derive(Debug, Copy, Clone)]
pub struct Int16Array;

impl TypedArrayMarker for Int16Array {
    type Element = i16;

    const ERASED: TypedArrayKind = TypedArrayKind::Int16;
}

/// JavaScript `Uint16Array` built-in implementation.
#[derive(Debug, Copy, Clone)]
pub struct Uint16Array;

impl TypedArrayMarker for Uint16Array {
    type Element = u16;

    const ERASED: TypedArrayKind = TypedArrayKind::Uint16;
}

/// JavaScript `Int32Array` built-in implementation.
#[derive(Debug, Copy, Clone)]
pub struct Int32Array;

impl TypedArrayMarker for Int32Array {
    type Element = i32;

    const ERASED: TypedArrayKind = TypedArrayKind::Int32;
}

/// JavaScript `Uint32Array` built-in implementation.
#[derive(Debug, Copy, Clone)]
pub struct Uint32Array;

impl TypedArrayMarker for Uint32Array {
    type Element = u32;

    const ERASED: TypedArrayKind = TypedArrayKind::Uint32;
}

/// JavaScript `BigInt64Array` built-in implementation.
#[derive(Debug, Copy, Clone)]
pub struct BigInt64Array;

impl TypedArrayMarker for BigInt64Array {
    type Element = i64;

    const ERASED: TypedArrayKind = TypedArrayKind::BigInt64;
}

/// JavaScript `BigUint64Array` built-in implementation.
#[derive(Debug, Copy, Clone)]
pub struct BigUint64Array;

impl TypedArrayMarker for BigUint64Array {
    type Element = u64;

    const ERASED: TypedArrayKind = TypedArrayKind::BigUint64;
}

/// JavaScript `Float32Array` built-in implementation.
#[derive(Debug, Copy, Clone)]
#[cfg(feature = "float16")]
pub struct Float16Array;

#[cfg(feature = "float16")]
impl TypedArrayMarker for Float16Array {
    type Element = Float16;

    const ERASED: TypedArrayKind = TypedArrayKind::Float16;
}

/// JavaScript `Float32Array` built-in implementation.
#[derive(Debug, Copy, Clone)]
pub struct Float32Array;

impl TypedArrayMarker for Float32Array {
    type Element = f32;

    const ERASED: TypedArrayKind = TypedArrayKind::Float32;
}

/// JavaScript `Float64Array` built-in implementation.
#[derive(Debug, Copy, Clone)]
pub struct Float64Array;

impl TypedArrayMarker for Float64Array {
    type Element = f64;

    const ERASED: TypedArrayKind = TypedArrayKind::Float64;
}

/// Type of the array content.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum ContentType {
    Number,
    BigInt,
}

/// List of all typed array kinds.
#[derive(Debug, Copy, Clone, Eq, PartialEq, Trace, Finalize)]
#[boa_gc(empty_trace)]
pub enum TypedArrayKind {
    /// 8-bit signed integers.
    Int8,
    /// 8-bit unsigned integers.
    Uint8,
    /// 8-bit unsigned integers clamped to 0–255.
    Uint8Clamped,
    /// 16-bit signed integers.
    Int16,
    /// 16-bit unsigned integers.
    Uint16,
    /// 32-bit signed integers.
    Int32,
    /// 32-bit unsigned integers.
    Uint32,
    /// 64-bit signed integers in the platform byte order.
    BigInt64,
    /// 64-bit unsigned integers in the platform byte order.
    BigUint64,
    /// 16-bit floating point numbers in the platform byte order.
    #[cfg(feature = "float16")]
    Float16,
    /// 32-bit floating point numbers in the platform byte order.
    Float32,
    /// 64-bit floating point numbers in the platform byte order.
    Float64,
}

impl TypedArrayKind {
    /// Gets the name of this `TypedArrayKind` as a `JsString`.
    pub(crate) const fn js_name(self) -> JsString {
        match self {
            TypedArrayKind::Int8 => StaticJsStrings::INT8_ARRAY,
            TypedArrayKind::Uint8 => StaticJsStrings::UINT8_ARRAY,
            TypedArrayKind::Uint8Clamped => StaticJsStrings::UINT8_CLAMPED_ARRAY,
            TypedArrayKind::Int16 => StaticJsStrings::INT16_ARRAY,
            TypedArrayKind::Uint16 => StaticJsStrings::UINT16_ARRAY,
            TypedArrayKind::Int32 => StaticJsStrings::INT32_ARRAY,
            TypedArrayKind::Uint32 => StaticJsStrings::UINT32_ARRAY,
            TypedArrayKind::BigInt64 => StaticJsStrings::BIG_INT64_ARRAY,
            TypedArrayKind::BigUint64 => StaticJsStrings::BIG_UINT64_ARRAY,
            #[cfg(feature = "float16")]
            TypedArrayKind::Float16 => StaticJsStrings::FLOAT16_ARRAY,
            TypedArrayKind::Float32 => StaticJsStrings::FLOAT32_ARRAY,
            TypedArrayKind::Float64 => StaticJsStrings::FLOAT64_ARRAY,
        }
    }

    /// Gets the name of this `TypedArrayKind` as a `str`
    pub(crate) const fn name(self) -> &'static str {
        match self {
            TypedArrayKind::Int8 => "Int8",
            TypedArrayKind::Uint8 => "Uint8",
            TypedArrayKind::Uint8Clamped => "Uint8Clamped",
            TypedArrayKind::Int16 => "Int16",
            TypedArrayKind::Uint16 => "Uint16",
            TypedArrayKind::Int32 => "Int32",
            TypedArrayKind::Uint32 => "Uint32",
            TypedArrayKind::BigInt64 => "BigInt64",
            TypedArrayKind::BigUint64 => "BigUint64",
            #[cfg(feature = "float16")]
            TypedArrayKind::Float16 => "Float16",
            TypedArrayKind::Float32 => "Float32",
            TypedArrayKind::Float64 => "Float64",
        }
    }

    /// Gets the standard constructor accessor of this `TypedArrayKind`.
    pub(crate) const fn standard_constructor(
        self,
    ) -> fn(&StandardConstructors) -> &StandardConstructor {
        match self {
            TypedArrayKind::Int8 => StandardConstructors::typed_int8_array,
            TypedArrayKind::Uint8 => StandardConstructors::typed_uint8_array,
            TypedArrayKind::Uint8Clamped => StandardConstructors::typed_uint8clamped_array,
            TypedArrayKind::Int16 => StandardConstructors::typed_int16_array,
            TypedArrayKind::Uint16 => StandardConstructors::typed_uint16_array,
            TypedArrayKind::Int32 => StandardConstructors::typed_int32_array,
            TypedArrayKind::Uint32 => StandardConstructors::typed_uint32_array,
            TypedArrayKind::BigInt64 => StandardConstructors::typed_bigint64_array,
            TypedArrayKind::BigUint64 => StandardConstructors::typed_biguint64_array,
            #[cfg(feature = "float16")]
            TypedArrayKind::Float16 => StandardConstructors::typed_float16_array,
            TypedArrayKind::Float32 => StandardConstructors::typed_float32_array,
            TypedArrayKind::Float64 => StandardConstructors::typed_float64_array,
        }
    }

    /// Returns `true` if this kind of typed array supports `Atomics` operations
    ///
    /// Equivalent to `IsUnclampedIntegerElementType(type) is true || IsBigIntElementType(type) is true`.
    pub(crate) fn supports_atomic_ops(self) -> bool {
        match self {
            TypedArrayKind::Int8
            | TypedArrayKind::Uint8
            | TypedArrayKind::Int16
            | TypedArrayKind::Uint16
            | TypedArrayKind::Int32
            | TypedArrayKind::Uint32
            | TypedArrayKind::BigInt64
            | TypedArrayKind::BigUint64 => true,
            // `f32` and `f64` support atomic operations on certain platforms, but it's not common and
            // could require polyfilling the operations using CAS.
            // `u8` clamps to the limits, which atomic operations don't support since
            // they always overflow.
            TypedArrayKind::Uint8Clamped | TypedArrayKind::Float32 | TypedArrayKind::Float64 => {
                false
            }
            #[cfg(feature = "float16")]
            TypedArrayKind::Float16 => false,
        }
    }

    /// Gets the size of the type of element of this `TypedArrayKind`.
    pub(crate) const fn element_size(self) -> u64 {
        match self {
            TypedArrayKind::Int8 | TypedArrayKind::Uint8 | TypedArrayKind::Uint8Clamped => {
                size_of::<u8>() as u64
            }
            TypedArrayKind::Int16 | TypedArrayKind::Uint16 => size_of::<u16>() as u64,
            #[cfg(feature = "float16")]
            TypedArrayKind::Float16 => size_of::<u16>() as u64,
            TypedArrayKind::Int32 | TypedArrayKind::Uint32 | TypedArrayKind::Float32 => {
                size_of::<u32>() as u64
            }
            TypedArrayKind::BigInt64 | TypedArrayKind::BigUint64 | TypedArrayKind::Float64 => {
                size_of::<u64>() as u64
            }
        }
    }

    /// Returns the content type of this `TypedArrayKind`.
    pub(crate) const fn content_type(self) -> ContentType {
        match self {
            TypedArrayKind::BigInt64 | TypedArrayKind::BigUint64 => ContentType::BigInt,
            TypedArrayKind::Int8
            | TypedArrayKind::Uint8
            | TypedArrayKind::Uint8Clamped
            | TypedArrayKind::Int16
            | TypedArrayKind::Uint16
            | TypedArrayKind::Int32
            | TypedArrayKind::Uint32
            | TypedArrayKind::Float32
            | TypedArrayKind::Float64 => ContentType::Number,
            #[cfg(feature = "float16")]
            TypedArrayKind::Float16 => ContentType::Number,
        }
    }

    /// Convert `value` into the typed array element corresponding to this `TypedArrayKind`.
    pub(crate) fn get_element(
        self,
        value: &JsValue,
        context: &mut Context,
    ) -> JsResult<TypedArrayElement> {
        match self {
            TypedArrayKind::Int8 => value.to_int8(context).map(TypedArrayElement::Int8),
            TypedArrayKind::Uint8 => value.to_uint8(context).map(TypedArrayElement::Uint8),
            TypedArrayKind::Uint8Clamped => value
                .to_uint8_clamp(context)
                .map(|u| TypedArrayElement::Uint8Clamped(ClampedU8(u))),
            TypedArrayKind::Int16 => value.to_int16(context).map(TypedArrayElement::Int16),
            TypedArrayKind::Uint16 => value.to_uint16(context).map(TypedArrayElement::Uint16),
            TypedArrayKind::Int32 => value.to_i32(context).map(TypedArrayElement::Int32),
            TypedArrayKind::Uint32 => value.to_u32(context).map(TypedArrayElement::Uint32),
            TypedArrayKind::BigInt64 => {
                value.to_big_int64(context).map(TypedArrayElement::BigInt64)
            }
            TypedArrayKind::BigUint64 => value
                .to_big_uint64(context)
                .map(TypedArrayElement::BigUint64),
            #[cfg(feature = "float16")]
            TypedArrayKind::Float16 => value
                .to_f16(context)
                .map(|f| TypedArrayElement::Float16(Float16(f))),
            TypedArrayKind::Float32 => value
                .to_number(context)
                .map(|f| TypedArrayElement::Float32(f as f32)),
            TypedArrayKind::Float64 => value.to_number(context).map(TypedArrayElement::Float64),
        }
    }

    /// Convert `value` into the typed array element corresponding to this `TypedArrayKind`,
    /// assuming the `ContentType` of this kind is `Number`.
    pub(crate) fn to_element_f64(self, value: f64) -> TypedArrayElement {
        match self {
            TypedArrayKind::Int8 => TypedArrayElement::Int8(value as i8),
            TypedArrayKind::Uint8 => TypedArrayElement::Uint8(value as u8),
            TypedArrayKind::Uint8Clamped => {
                TypedArrayElement::Uint8Clamped(ClampedU8(value.clamp(0.0, 255.0).round() as u8))
            }
            TypedArrayKind::Int16 => TypedArrayElement::Int16(value as i16),
            TypedArrayKind::Uint16 => TypedArrayElement::Uint16(value as u16),
            TypedArrayKind::Int32 => TypedArrayElement::Int32(value as i32),
            TypedArrayKind::Uint32 => TypedArrayElement::Uint32(value as u32),
            #[cfg(feature = "float16")]
            TypedArrayKind::Float16 => {
                TypedArrayElement::Float16(Float16(float16::f16::from_f64(value)))
            }
            TypedArrayKind::Float32 => TypedArrayElement::Float32(value as f32),
            TypedArrayKind::Float64 => TypedArrayElement::Float64(value),
            TypedArrayKind::BigInt64 | TypedArrayKind::BigUint64 => {
                panic!("cannot convert f64 to BigInt typed array element")
            }
        }
    }

    /// Convert `value` into the typed array element corresponding to this `TypedArrayKind`,
    /// assuming the `ContentType` of this kind is `BigInt`.
    pub(crate) fn to_element_i64(self, value: i64) -> TypedArrayElement {
        match self {
            TypedArrayKind::BigInt64 => TypedArrayElement::BigInt64(value),
            TypedArrayKind::BigUint64 => TypedArrayElement::BigUint64(value as u64),
            _ => panic!("cannot convert i64 to Number typed array element"),
        }
    }
}

/// An element of a certain `TypedArray` kind.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum TypedArrayElement {
    Int8(i8),
    Uint8(u8),
    Uint8Clamped(ClampedU8),
    Int16(i16),
    Uint16(u16),
    Int32(i32),
    Uint32(u32),
    BigInt64(i64),
    BigUint64(u64),
    #[cfg(feature = "float16")]
    Float16(Float16),
    Float32(f32),
    Float64(f64),
}

impl TypedArrayElement {
    /// Converts the element into its extended bytes representation as an `u64`.
    ///
    /// This is guaranteed to never fail, since all numeric types supported by JS are less than
    /// 8 bytes long.
    pub(crate) fn to_bits(self) -> u64 {
        #[allow(clippy::cast_lossless)]
        match self {
            TypedArrayElement::Int8(num) => num as u64,
            TypedArrayElement::Uint8(num) => num as u64,
            TypedArrayElement::Uint8Clamped(num) => num.0 as u64,
            TypedArrayElement::Int16(num) => num as u64,
            TypedArrayElement::Uint16(num) => num as u64,
            TypedArrayElement::Int32(num) => num as u64,
            TypedArrayElement::Uint32(num) => num as u64,
            TypedArrayElement::BigInt64(num) => num as u64,
            TypedArrayElement::BigUint64(num) => num,
            #[cfg(feature = "float16")]
            TypedArrayElement::Float16(num) => num.0.to_bits() as u64,
            TypedArrayElement::Float32(num) => num.to_bits() as u64,
            TypedArrayElement::Float64(num) => num.to_bits(),
        }
    }

    /// Gets the `f64` representation of this `TypedArrayElement`.
    ///
    /// # Panics
    ///
    /// Panics if the `ContentType` of `self` is not `Number`.
    pub(crate) fn as_f64(self) -> f64 {
        match self {
            TypedArrayElement::Int8(v) => v.into(),
            TypedArrayElement::Uint8(v) => v.into(),
            TypedArrayElement::Uint8Clamped(v) => v.0.into(),
            TypedArrayElement::Int16(v) => v.into(),
            TypedArrayElement::Uint16(v) => v.into(),
            TypedArrayElement::Int32(v) => v.into(),
            TypedArrayElement::Uint32(v) => v.into(),
            #[cfg(feature = "float16")]
            TypedArrayElement::Float16(v) => v.0.to_f64(),
            TypedArrayElement::Float32(v) => v.into(),
            TypedArrayElement::Float64(v) => v,
            TypedArrayElement::BigInt64(_) | TypedArrayElement::BigUint64(_) => {
                panic!("cannot convert BigInt typed array element to f64")
            }
        }
    }

    /// Gets the `i64` representation of this `TypedArrayElement`.
    ///
    /// # Panics
    ///
    /// Panics if the `ContentType` of `self` is not `BigInt`.
    pub(crate) fn as_i64(self) -> i64 {
        match self {
            TypedArrayElement::BigInt64(v) => v,
            TypedArrayElement::BigUint64(v) => v as i64,
            _ => panic!("cannot convert Number typed array element to i64"),
        }
    }

    /// Casts this `TypedArrayElement` into another `TypedArrayKind`.
    ///
    /// # Panics
    ///
    /// Panics if the `ContentType` of `self` and `target` don't match.
    pub(crate) fn cast(self, target: TypedArrayKind) -> Self {
        match target.content_type() {
            ContentType::Number => target.to_element_f64(self.as_f64()),
            ContentType::BigInt => target.to_element_i64(self.as_i64()),
        }
    }
}

impl From<i8> for TypedArrayElement {
    fn from(value: i8) -> Self {
        Self::Int8(value)
    }
}

impl From<u8> for TypedArrayElement {
    fn from(value: u8) -> Self {
        Self::Uint8(value)
    }
}

impl From<ClampedU8> for TypedArrayElement {
    fn from(value: ClampedU8) -> Self {
        Self::Uint8Clamped(value)
    }
}

impl From<i16> for TypedArrayElement {
    fn from(value: i16) -> Self {
        Self::Int16(value)
    }
}

impl From<u16> for TypedArrayElement {
    fn from(value: u16) -> Self {
        Self::Uint16(value)
    }
}

impl From<i32> for TypedArrayElement {
    fn from(value: i32) -> Self {
        Self::Int32(value)
    }
}

impl From<u32> for TypedArrayElement {
    fn from(value: u32) -> Self {
        Self::Uint32(value)
    }
}

impl From<i64> for TypedArrayElement {
    fn from(value: i64) -> Self {
        Self::BigInt64(value)
    }
}

impl From<u64> for TypedArrayElement {
    fn from(value: u64) -> Self {
        Self::BigUint64(value)
    }
}

#[cfg(feature = "float16")]
impl From<Float16> for TypedArrayElement {
    fn from(value: Float16) -> Self {
        Self::Float16(value)
    }
}

impl From<f32> for TypedArrayElement {
    fn from(value: f32) -> Self {
        Self::Float32(value)
    }
}

impl From<f64> for TypedArrayElement {
    fn from(value: f64) -> Self {
        Self::Float64(value)
    }
}

impl From<TypedArrayElement> for JsValue {
    fn from(value: TypedArrayElement) -> Self {
        match value {
            TypedArrayElement::Int8(value) => Numeric::from(value),
            TypedArrayElement::Uint8(value) => Numeric::from(value),
            TypedArrayElement::Uint8Clamped(value) => Numeric::from(value),
            TypedArrayElement::Int16(value) => Numeric::from(value),
            TypedArrayElement::Uint16(value) => Numeric::from(value),
            TypedArrayElement::Int32(value) => Numeric::from(value),
            TypedArrayElement::Uint32(value) => Numeric::from(value),
            TypedArrayElement::BigInt64(value) => Numeric::from(value),
            TypedArrayElement::BigUint64(value) => Numeric::from(value),
            #[cfg(feature = "float16")]
            TypedArrayElement::Float16(value) => Numeric::from(value),
            TypedArrayElement::Float32(value) => Numeric::from(value),
            TypedArrayElement::Float64(value) => Numeric::from(value),
        }
        .into()
    }
}

#[cfg(test)]
mod tests;
