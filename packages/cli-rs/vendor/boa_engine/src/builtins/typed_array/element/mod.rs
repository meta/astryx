#![deny(unsafe_op_in_unsafe_fn)]
#![allow(clippy::cast_ptr_alignment)] // Invariants are checked by the caller.

mod atomic;

pub(crate) use self::atomic::Atomic;

use std::ops::{BitOr, BitXor};
use std::sync::atomic::Ordering;
use std::{convert::identity, ops::BitAnd};

use bytemuck::{AnyBitPattern, NoUninit};
use num_traits::{WrappingAdd, WrappingSub};
use portable_atomic::{
    AtomicI8, AtomicI16, AtomicI32, AtomicI64, AtomicU8, AtomicU16, AtomicU32, AtomicU64,
};

use crate::{
    Context, JsResult, JsValue,
    builtins::{
        array_buffer::utils::{SliceRef, SliceRefMut},
        typed_array::TypedArrayElement,
    },
    value::Numeric,
};

/// A reference to an element inside an array buffer.
#[derive(Debug, Copy, Clone)]
pub(crate) enum ElementRef<'a, E: Element> {
    Atomic(&'a E::Atomic),
    Plain(&'a E),
}

impl<E: Element> ElementRef<'_, E> {
    /// Loads the value of this reference.
    pub(crate) fn load(&self, order: Ordering) -> E {
        match self {
            ElementRef::Atomic(num) => E::from_plain(num.load(order)),
            ElementRef::Plain(num) => **num,
        }
    }
}

/// A mutable reference to an element inside an array buffer.
pub(crate) enum ElementRefMut<'a, E: Element> {
    Atomic(&'a E::Atomic),
    Plain(&'a mut E),
}

impl<E: Element> ElementRefMut<'_, E> {
    /// Stores `value` on this mutable reference.
    pub(crate) fn store(&mut self, value: E, order: Ordering) {
        match self {
            ElementRefMut::Atomic(num) => num.store(value.to_plain(), order),
            ElementRefMut::Plain(num) => **num = value,
        }
    }
}

impl<E: Element> ElementRefMut<'_, E>
where
    E::Atomic: Atomic<Plain = E>,
{
    /// Computes the `+` operation between `self` and `value`, storing the result
    /// on `self` and returning the old value. This operation wraps on overflow.
    pub(crate) fn add(&mut self, value: E, order: Ordering) -> E
    where
        E: WrappingAdd,
    {
        match self {
            ElementRefMut::Atomic(num) => num.add(value, order),
            ElementRefMut::Plain(num) => {
                let new = num.wrapping_add(&value);
                std::mem::replace(num, new)
            }
        }
    }

    /// Computes the `&` operation between `self` and `value`, storing the result
    /// on `self` and returning the old value.
    pub(crate) fn bit_and(&mut self, value: E, order: Ordering) -> E
    where
        E: BitAnd<Output = E>,
    {
        match self {
            ElementRefMut::Atomic(num) => num.bit_and(value, order),
            ElementRefMut::Plain(num) => {
                let new = **num & value;
                std::mem::replace(num, new)
            }
        }
    }

    /// Compares the current value of `self` with `expected`, exchanging it with `replacement`
    /// if they're equal and returning its old value in all cases.
    pub(crate) fn compare_exchange(&mut self, expected: E, replacement: E, order: Ordering) -> E
    where
        E: Eq,
    {
        match self {
            ElementRefMut::Atomic(num) => num.compare_exchange(expected, replacement, order),
            ElementRefMut::Plain(num) => {
                let old = **num;
                if old == expected {
                    **num = replacement;
                }
                old
            }
        }
    }

    /// Swaps `self` with `value`, returning the old value of `self`.
    pub(crate) fn swap(&mut self, value: E, order: Ordering) -> E {
        match self {
            ElementRefMut::Atomic(num) => num.swap(value, order),
            ElementRefMut::Plain(num) => std::mem::replace(num, value),
        }
    }

    /// Computes the `|` operation between `self` and `value`, storing the result
    /// on `self` and returning the old value.
    pub(crate) fn bit_or(&mut self, value: E, order: Ordering) -> E
    where
        E: BitOr<Output = E>,
    {
        match self {
            ElementRefMut::Atomic(num) => num.bit_or(value, order),
            ElementRefMut::Plain(num) => {
                let new = **num | value;
                std::mem::replace(num, new)
            }
        }
    }

    /// Computes the `-` operation between `self` and `value`, storing the result
    /// on `self` and returning the old value. This operation wraps on overflow.
    pub(crate) fn sub(&mut self, value: E, order: Ordering) -> E
    where
        E: WrappingSub,
    {
        match self {
            ElementRefMut::Atomic(num) => num.sub(value, order),
            ElementRefMut::Plain(num) => {
                let new = num.wrapping_sub(&value);
                std::mem::replace(num, new)
            }
        }
    }

    /// Computes the `^` operation between `self` and `value`, storing the result
    /// on `self` and returning the old value.
    pub(crate) fn bit_xor(&mut self, value: E, order: Ordering) -> E
    where
        E: BitXor<Output = E>,
    {
        match self {
            ElementRefMut::Atomic(num) => num.bit_xor(value, order),
            ElementRefMut::Plain(num) => {
                let new = **num ^ value;
                std::mem::replace(num, new)
            }
        }
    }
}

/// An `u8` that clamps instead of overflowing when converting from a `JsValue`.
#[derive(Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd, Hash, AnyBitPattern, NoUninit)]
#[repr(transparent)]
pub(crate) struct ClampedU8(pub(crate) u8);

impl ClampedU8 {
    /// Converts this `ClampedU8` to its big endian representation.
    pub(crate) fn to_be(self) -> Self {
        Self(self.0.to_be())
    }

    /// Converts this `ClampedU8` to its little endian representation.
    pub(crate) fn to_le(self) -> Self {
        Self(self.0.to_le())
    }
}

impl From<ClampedU8> for Numeric {
    fn from(value: ClampedU8) -> Self {
        Numeric::Number(value.0.into())
    }
}

/// A 16-bit float implementing missing traits from the inner `f16`,
/// used for [`Float16Array`][super::Float16Array].
#[cfg(feature = "float16")]
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
#[repr(transparent)]
pub(crate) struct Float16(pub(crate) float16::f16);

#[cfg(feature = "float16")]
impl From<Float16> for Numeric {
    fn from(value: Float16) -> Self {
        Numeric::Number(value.0.into())
    }
}

#[cfg(feature = "float16")]
impl std::hash::Hash for Float16 {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        state.write(self.0.to_le_bytes().as_ref());
    }
}

#[cfg(feature = "float16")]
unsafe impl bytemuck::Zeroable for Float16 {}

#[cfg(feature = "float16")]
unsafe impl bytemuck::Pod for Float16 {}

/// A native element that can be inside a `TypedArray`.
pub(crate) trait Element:
    Sized + Into<TypedArrayElement> + NoUninit + AnyBitPattern
{
    /// The atomic type used for shared array buffers.
    type Atomic: Atomic;

    /// Converts a `JsValue` into the native element `Self`.
    fn from_js_value(value: &JsValue, context: &mut Context) -> JsResult<Self>;

    /// Converts from the plain type of an atomic to `Self`.
    fn from_plain(bytes: <Self::Atomic as Atomic>::Plain) -> Self;

    /// Converts from `Self` to the plain type of an atomic.
    fn to_plain(self) -> <Self::Atomic as Atomic>::Plain;

    /// Gets the little endian representation of `Self`.
    fn to_little_endian(self) -> Self;

    /// Gets the big endian representation of `Self`.
    fn to_big_endian(self) -> Self;

    /// Reads `Self` from the `buffer`.
    ///
    /// This will always read values in the native endianness of the target architecture.
    ///
    /// # Safety
    ///
    /// - `buffer` must be aligned to the native alignment of `Self`.
    /// - `buffer` must contain enough bytes to read `std::sizeof::<Self>` bytes.
    unsafe fn read(buffer: SliceRef<'_>) -> ElementRef<'_, Self>;

    /// Writes the bytes of this element into `buffer`.
    ///
    /// This will always write values in the native endianness of the target architecture.
    ///
    /// # Safety
    ///
    /// - `buffer` must be aligned to the native alignment of `Self`.
    /// - `buffer` must contain enough bytes to store `std::sizeof::<Self>` bytes.
    unsafe fn read_mut(buffer: SliceRefMut<'_>) -> ElementRefMut<'_, Self>;
}

macro_rules! element {
    ( $element:ty, $atomic:ty, from_js: $from_js:path $(,)?) => {
        element!(
            $element,
            $atomic,
            from_js: $from_js,
            from_plain: identity,
            to_plain: identity,
            to_be: |this: $element| this.to_be(),
            to_le: |this: $element| this.to_le()
        );
    };
    (
        $element:ty,
        $atomic:ty,
        from_js: $from_js:expr,
        from_plain: $from_plain:expr,
        to_plain: $to_plain:expr,
        to_be: $to_be:expr,
        to_le: $to_le:expr $(,)?
    ) => {
        #[allow(clippy::redundant_closure_call)]
        #[allow(clippy::undocumented_unsafe_blocks)] // Invariants are checked by the caller.
        impl Element for $element {
            type Atomic = $atomic;

            fn from_js_value(value: &JsValue, context: &mut Context) -> JsResult<Self> {
                $from_js(value, context)
            }

            fn from_plain(plain: <Self::Atomic as Atomic>::Plain) -> Self {
                $from_plain(plain)
            }

            fn to_plain(self) -> <Self::Atomic as Atomic>::Plain {
                $to_plain(self)
            }

            fn to_big_endian(self) -> Self {
                $to_be(self)
            }

            fn to_little_endian(self) -> Self {
                $to_le(self)
            }

            unsafe fn read(buffer: SliceRef<'_>) -> ElementRef<'_, Self> {
                #[cfg(debug_assertions)]
                {
                    assert!(buffer.len() >= std::mem::size_of::<Self>());
                    assert!(buffer.addr() % std::mem::align_of::<Self>() == 0);
                }

                match buffer {
                    SliceRef::Slice(buffer) => unsafe {
                        ElementRef::Plain(&*buffer.as_ptr().cast())
                    },
                    SliceRef::AtomicSlice(buffer) => unsafe {
                        ElementRef::Atomic(&*buffer.as_ptr().cast::<Self::Atomic>())
                    },
                }
            }

            unsafe fn read_mut(buffer: SliceRefMut<'_>) -> ElementRefMut<'_, Self> {
                #[cfg(debug_assertions)]
                {
                    assert!(buffer.len() >= std::mem::size_of::<Self>());
                    assert!(buffer.addr() % std::mem::align_of::<Self>() == 0);
                }

                match buffer {
                    SliceRefMut::Slice(buffer) => unsafe {
                        ElementRefMut::Plain(&mut *buffer.as_mut_ptr().cast())
                    },
                    SliceRefMut::AtomicSlice(buffer) => unsafe {
                        ElementRefMut::Atomic(&*buffer.as_ptr().cast::<Self::Atomic>())
                    },
                }
            }
        }
    };
}

element!(u8, AtomicU8, from_js: JsValue::to_uint8);
element!(i8, AtomicI8, from_js: JsValue::to_int8);
element!(u16, AtomicU16, from_js: JsValue::to_uint16);
element!(i16, AtomicI16, from_js: JsValue::to_int16);
element!(u32, AtomicU32, from_js: JsValue::to_u32);
element!(i32, AtomicI32, from_js: JsValue::to_i32);
element!(u64, AtomicU64, from_js: JsValue::to_big_uint64);
element!(i64, AtomicI64, from_js: JsValue::to_big_int64);

element!(
    ClampedU8,
    AtomicU8,
    from_js: |value: &JsValue, context| value.to_uint8_clamp(context).map(ClampedU8),
    from_plain: ClampedU8,
    to_plain: |c: ClampedU8| c.0,
    to_be: |this: ClampedU8| this.to_be(),
    to_le: |this: ClampedU8| this.to_le(),
);

#[cfg(feature = "float16")]
element!(
    Float16,
    AtomicU16,
    from_js: |value: &JsValue, context| value.to_f16(context).map(Float16),
    from_plain: |a: u16| Float16(float16::f16::from_bits(a)),
    to_plain: |f: Float16| f.0.to_bits(),
    to_be: |this: Float16| Float16(float16::f16::from_bits(this.0.to_bits().to_be())),
    to_le: |this: Float16| Float16(float16::f16::from_bits(this.0.to_bits().to_le())),
);

element!(
    f32,
    AtomicU32,
    from_js: |value: &JsValue, context| value.to_number(context).map(|f| f as f32),
    from_plain: f32::from_bits,
    to_plain: |f: f32| f.to_bits(),
    to_be: |this: f32| f32::from_bits(this.to_bits().to_be()),
    to_le: |this: f32| f32::from_bits(this.to_bits().to_le()),
);

element!(
    f64,
    AtomicU64,
    from_js: |value: &JsValue, context| value.to_number(context),
    from_plain: f64::from_bits,
    to_plain: |f: f64| f.to_bits(),
    to_be: |this: f64| f64::from_bits(this.to_bits().to_be()),
    to_le: |this: f64| f64::from_bits(this.to_bits().to_le()),
);
