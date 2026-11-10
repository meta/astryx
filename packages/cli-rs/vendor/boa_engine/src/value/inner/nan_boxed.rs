//! A NaN-boxed inner value for JavaScript values.
//!
//! This [`JsValue`] is a float using `NaN` values to represent an inner
//! JavaScript value.
//!
//! # Assumptions
//!
//! This implementation makes exactly two architecture assumptions. Everything
//! else is independent of the arch where it's run.
//!
//! The first assumption is easy to verify: JavaScript numbers must be 64 bits
//! IEEE-754, which is guaranteed by Rust and JavaScript implementations.
//!
//! The second assumption is that pointers are 48 bits maximum. This is a bit
//! more complex to verify, but it is a safe assumption for all current
//! architectures. The only exception is RISC-V and Intel processors that
//! enable 5-level paging extensions.
//!
//! This is clarified here: <https://en.m.wikipedia.org/wiki/64-bit_computing>:
//!
//! > not all 64-bit instruction sets support full 64-bit virtual memory
//! > addresses; x86-64 and AArch64 for example, support only 48 bits of
//! > virtual address, with the remaining 16 bits of the virtual address
//! > required to be all zeros (000...) or all ones (111...), and several
//! > 64-bit instruction sets support fewer than 64 bits of physical
//! > memory address.
//!
//! ALL 32 bits architectures are compatible, of course, as their pointers
//! are 32 bits.
//!
//! Wasm with MEMORY64 (which is very rare) follows the pointer structure
//! of its host architecture.
//! For more info, see
//! <https://spidermonkey.dev/blog/2025/01/15/is-memory64-actually-worth-using.html>
//!
//! This leaves RISC-V and processes that enable 5-level paging extensions
//! on Intel (<https://en.m.wikipedia.org/wiki/Intel_5-level_paging>).
//!
//! We could feature gate on RISC-V, but it's not worth it. The only
//! RISC-V processors that support 64-bit are the ones that support 64-bit
//! virtual memory addresses. So it's a safe assumption.
//!
//! There is no way to feature gate on 5-level paging as it's a software
//! trigger.
//!
//! There is a software assertion in the code that will panic if the pointer
//! uses more than 48 bits.
//!
//! # Design
//!
//! This [`JsValue`] inner type is a NaN-boxed value, which is a 64-bits value
//! that can represent any JavaScript value. If the integer is a non-NaN value,
//! it will be stored as a 64-bits float. If it is a `f64::NAN` value, it will
//! be stored as a quiet `NaN` value. Subnormal numbers are regular float.
//!
//! For any other type of values, the value will be stored as a 51-bits non-zero
//! integer.
//!
//! In short, the memory layout of a NaN-boxed value is as follows:
//!
//! | Type of           | Bit Layout | Comment |
//! |-------------------|------------|---------|
//! | `+Infinity`       | `7FF0:0000:0000:0000`    | |
//! | `-Infinity`       | `FFF0:0000:0000:0000`    | |
//! | `NAN` (quiet)     | `7FF8:0000:0000:0000`    | |
//! | `Integer32`       | `7FF9:0000:IIII:IIII`    | 32-bits integer. |
//! | `False`           | `7FFA:0000:0000:0000`    | |
//! | `True`            | `7FFA:0000:0000:0001`    | |
//! | `Null`            | `7FFB:0000:0000:0000`    | |
//! | `Undefined`       | `7FFB:0000:0000:0001`    | |
//! | `Object`          | `7FFC:PPPP:PPPP:PPPP`    | 48-bits pointer. Assumes non-null pointer. |
//! | `String`          | `7FFD:PPPP:PPPP:PPPP`    | 48-bits pointer. Assumes non-null pointer. |
//! | `Symbol`          | `7FFE:PPPP:PPPP:PPPP`    | 48-bits pointer. Assumes non-null pointer. |
//! | `BigInt`          | `7FFF:PPPP:PPPP:PPPP`    | 48-bits pointer. Assumes non-null pointer. |
//! | `Float64`         | Any other values.        | |
//!
//! Another way to visualize this is by looking at the bit layout of a NaN-boxed
//! value:
//! ```text
//!                           ....--<| The type of inner value is represented by this.
//!                           |..|   | 11?? - Pointer, where ?? is the subtype of pointer:
//!                           |..|   |        b00 - Object, b01 - String,
//!                           |..|   |        b10 - Symbol, b11 - BigInt.
//!                           |..|   | 10?? - Non-pointer, where ?? is the subtype:
//!                           |..|   |        b01 - Integer32, b10 - Boolean,
//!                           |..|   |        b11 - Other
//!                           vvvv
//! bit index: 63   59   55   51   47   43   39   35   31 .. 3  0
//!            0000 0000 0000 0000 0000 0000 0000 0000 0000 .. 0000
//! +Inf       0111 1111 1111 0000 0000 0000 0000 0000 0000 .. 0000
//! -Inf       1111 1111 1111 0000 0000 0000 0000 0000 0000 .. 0000
//! NaN (q)    0111 1111 1111 1000 0000 0000 0000 0000 0000 .. 0000
//! Integer32  0111 1111 1111 1001 0000 0000 0000 0000 IIII .. IIII
//! False      0111 1111 1111 1010 0000 0000 0000 0000 0000 .. 0000
//! True       0111 1111 1111 1010 0000 0000 0000 0000 0000 .. 0001
//! Null       0111 1111 1111 1011 0000 0000 0000 0000 0000 .. 0000
//! Undefined  0111 1111 1111 1011 0000 0000 0000 0000 0000 .. 0001
//! Object     0111 1111 1111 1100 PPPP PPPP PPPP PPPP PPPP .. PPPP
//! String     0111 1111 1111 1101 PPPP PPPP PPPP PPPP PPPP .. PPPP
//! Symbol     0111 1111 1111 1110 PPPP PPPP PPPP PPPP PPPP .. PPPP
//! BigInt     0111 1111 1111 1111 PPPP PPPP PPPP PPPP PPPP .. PPPP
//! Float64    Any other value.
//! ```
//!
//! The pointers are assumed to never be NULL, and as such no clash
//! with regular NAN should happen.
#![allow(clippy::inline_always)]

#[cfg(feature = "annex-b")]
use crate::builtins::is_html_dda::IsHTMLDDA;
use crate::{
    JsBigInt, JsObject, JsSymbol, JsVariant, bigint::RawBigInt, object::ErasedVTableObject,
    symbol::RawJsSymbol, value::Type,
};
use boa_gc::{Finalize, GcBox, Trace, custom_trace};
use boa_string::JsString;
use core::fmt;
use static_assertions::const_assert;
use std::{
    mem::{self, ManuallyDrop},
    ptr::{self, NonNull},
};

const _NAN_BOX_COMPAT_CHECK: () = const {
    // We can only NaN-box pointers that are 32 or 64 bits.
    assert!(
        size_of::<usize>() == size_of::<u64>() || size_of::<usize>() == size_of::<u32>(),
        "this platform is not compatible with a nan-boxed `JsValueInner`\n\
        enable the `jsvalue-enum` feature to use the enum-based `JsValueInner`"
    );

    // We cannot NaN-box pointers that are not 4-bytes aligned.
    assert!(
        align_of::<*mut ()>() >= 4,
        "this platform is not compatible with a nan-boxed `JsValueInner`\n\
        enable the `jsvalue-enum` feature to use the enum-based `JsValueInner`"
    );
};

/// Internal module for bit masks and constants.
///
/// All bit magic is done here.
mod bits {
    use std::ptr::NonNull;

    /// The mask for the bits that indicate if the value is a NaN-value.
    const MASK_NAN: u64 = 0x7FF0_0000_0000_0000;

    /// The mask for the bits that indicate the kind of the value.
    pub(super) const MASK_KIND: u64 = MASK_NAN | 0xF_0000_0000_0000;

    // The tag bits for the different kinds of values.
    const TAG_INF: u64 = 0x0_0000_0000_0000;
    const TAG_NAN: u64 = 0x8_0000_0000_0000;
    const TAG_INT32: u64 = 0x9_0000_0000_0000;
    const TAG_BOOLEAN: u64 = 0xA_0000_0000_0000;
    const TAG_OTHER: u64 = 0xB_0000_0000_0000;
    const TAG_OBJECT: u64 = 0xC_0000_0000_0000;
    const TAG_STRING: u64 = 0xD_0000_0000_0000;
    const TAG_SYMBOL: u64 = 0xE_0000_0000_0000;
    const TAG_BIGINT: u64 = 0xF_0000_0000_0000;

    // The masks for the different kinds of tag bits.
    pub(super) const MASK_INT32: u64 = MASK_NAN | TAG_INT32;
    pub(super) const MASK_BOOLEAN: u64 = MASK_NAN | TAG_BOOLEAN;
    pub(super) const MASK_OTHER: u64 = MASK_NAN | TAG_OTHER;
    pub(super) const MASK_OBJECT: u64 = MASK_NAN | TAG_OBJECT;
    pub(super) const MASK_STRING: u64 = MASK_NAN | TAG_STRING;
    pub(super) const MASK_SYMBOL: u64 = MASK_NAN | TAG_SYMBOL;
    pub(super) const MASK_BIGINT: u64 = MASK_NAN | TAG_BIGINT;

    // The masks for the different kinds of values.
    const MASK_INT32_VALUE: u64 = 0xFFFF_FFFF;
    const MASK_POINTER_VALUE: u64 = 0x0000_FFFF_FFFF_FFFF;
    const MASK_BOOLEAN_VALUE: u64 = 1;

    /// The constant null value.
    pub(super) const VALUE_NULL: u64 = MASK_OTHER;

    /// The constant undefined value.
    pub(super) const VALUE_UNDEFINED: u64 = MASK_OTHER | 1;

    /// The constant false value.
    pub(super) const VALUE_FALSE: u64 = MASK_BOOLEAN;

    /// The constant true value.
    pub(super) const VALUE_TRUE: u64 = MASK_BOOLEAN | 1;

    // The constant `-0` value.
    pub(super) const VALUE_NEGATIVE_ZERO: u64 = (-0f64).to_bits();

    /// Checks that a value is a valid boolean (either true or false).
    #[inline(always)]
    pub(super) const fn is_bool(value: u64) -> bool {
        value & MASK_KIND == MASK_BOOLEAN
    }

    /// Checks that a value is a valid float, not a tagged nan boxed value.
    #[inline(always)]
    pub(super) const fn is_float(value: u64) -> bool {
        (value & MASK_NAN != MASK_NAN)
            || (value & MASK_KIND) == (MASK_NAN | TAG_INF)
            || (value & MASK_KIND) == (MASK_NAN | TAG_NAN)
    }

    /// Checks that a value is a negative zero (`-0`).
    #[inline(always)]
    pub(super) const fn is_negative_zero(value: u64) -> bool {
        value == VALUE_NEGATIVE_ZERO
    }

    /// Checks that a value is a valid integer32.
    #[inline(always)]
    pub(super) const fn is_integer32(value: u64) -> bool {
        value & MASK_KIND == MASK_INT32
    }

    /// Checks that a value is a valid `BigInt`.
    #[inline(always)]
    pub(super) const fn is_bigint(value: u64) -> bool {
        value & MASK_KIND == MASK_BIGINT
    }

    /// Checks that a value is a valid Object.
    #[inline(always)]
    pub(super) const fn is_object(value: u64) -> bool {
        value & MASK_KIND == MASK_OBJECT
    }

    /// Checks that a value is a valid Symbol.
    #[inline(always)]
    pub(super) const fn is_symbol(value: u64) -> bool {
        value & MASK_KIND == MASK_SYMBOL
    }

    /// Checks that a value is a valid String.
    #[inline(always)]
    pub(super) const fn is_string(value: u64) -> bool {
        value & MASK_KIND == MASK_STRING
    }

    /// Returns a tagged u64 of a 64-bits float.
    #[inline(always)]
    pub(super) const fn tag_f64(value: f64) -> u64 {
        if value.is_nan() {
            // Reduce any NAN to a canonical NAN representation.
            f64::NAN.to_bits()
        } else {
            value.to_bits()
        }
    }

    /// Returns a tagged u64 of a 32-bits integer.
    #[inline(always)]
    pub(super) const fn tag_i32(value: i32) -> u64 {
        value as u64 & MASK_INT32_VALUE | MASK_INT32
    }

    /// Returns a i32-bits from a tagged integer.
    #[inline(always)]
    pub(super) const fn untag_i32(value: u64) -> i32 {
        value as i32
    }

    /// Returns a tagged u64 of a boolean.
    #[inline(always)]
    pub(super) const fn tag_bool(value: bool) -> u64 {
        value as u64 | MASK_BOOLEAN
    }

    /// Returns a boolean from a tagged value.
    #[inline(always)]
    pub(super) const fn untag_bool(value: u64) -> bool {
        value & MASK_BOOLEAN_VALUE != 0
    }

    #[inline(always)]
    pub(super) fn tag_pointer<T>(ptr: NonNull<T>, type_mask: u64) -> u64 {
        // Mark this as `cold` since on well-behaved platforms
        // this will never be called.
        #[cold]
        #[inline(never)]
        fn unsupported_platform() {
            panic!(
                "this platform is not compatible with a nan-boxed `JsValueInner`\n\
                enable the `jsvalue-enum` feature to use the enum-based `JsValueInner`"
            )
        }

        let value = ptr.addr().get() as u64;
        let value_masked: u64 = value & MASK_POINTER_VALUE;

        // Assert alignment and location of the pointer.
        // TODO: we may want to have nan-boxing be the default only on
        // certain platforms, and make it an unsafe operation
        // to manually enable the implementation.
        if value_masked != value {
            unsupported_platform();
        }

        value_masked | type_mask
    }

    /// Returns the pointer address of the inner value.
    #[inline(always)]
    pub(super) const fn untag_pointer(value: u64) -> usize {
        (value & MASK_POINTER_VALUE) as usize
    }
}

// Verify that all const values and masks are nan.
const_assert!(f64::from_bits(bits::VALUE_UNDEFINED).is_nan());
const_assert!(f64::from_bits(bits::VALUE_NULL).is_nan());
const_assert!(f64::from_bits(bits::VALUE_FALSE).is_nan());
const_assert!(f64::from_bits(bits::VALUE_TRUE).is_nan());
const_assert!(f64::from_bits(bits::MASK_INT32).is_nan());
const_assert!(f64::from_bits(bits::MASK_BOOLEAN).is_nan());
const_assert!(f64::from_bits(bits::MASK_OTHER).is_nan());
const_assert!(f64::from_bits(bits::MASK_OBJECT).is_nan());
const_assert!(f64::from_bits(bits::MASK_STRING).is_nan());
const_assert!(f64::from_bits(bits::MASK_SYMBOL).is_nan());
const_assert!(f64::from_bits(bits::MASK_BIGINT).is_nan());

/// A NaN-boxed [`JsValue`]'s inner.
pub(crate) struct NanBoxedValue {
    #[cfg(target_pointer_width = "32")]
    half: u32,
    ptr: *mut (),
}

impl fmt::Debug for NanBoxedValue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.as_variant() {
            JsVariant::Undefined => f.debug_tuple("Undefined").finish(),
            JsVariant::Null => f.debug_tuple("Null").finish(),
            JsVariant::Boolean(b) => f.debug_tuple("Boolean").field(&b).finish(),
            JsVariant::Float64(n) => f.debug_tuple("Float64").field(&n).finish(),
            JsVariant::Integer32(n) => f.debug_tuple("Integer32").field(&n).finish(),
            JsVariant::BigInt(n) => f.debug_tuple("BigInt").field(&n).finish(),
            JsVariant::Object(n) => f.debug_tuple("Object").field(&n).finish(),
            JsVariant::Symbol(n) => f.debug_tuple("Symbol").field(&n).finish(),
            JsVariant::String(n) => f.debug_tuple("String").field(&n).finish(),
        }
    }
}

impl Finalize for NanBoxedValue {
    fn finalize(&self) {
        if let Some(o) = self.as_object() {
            o.finalize();
        }
    }
}

#[allow(unsafe_op_in_unsafe_fn)]
unsafe impl Trace for NanBoxedValue {
    custom_trace! {this, mark, {
        if let Some(o) = this.as_object() {
            mark(&o);
        }
    }}
}

impl Clone for NanBoxedValue {
    #[inline(always)]
    fn clone(&self) -> Self {
        // This way of inlining ensures the compiler
        // knows it can convert the match into a
        // jump table.
        match self.value() & bits::MASK_KIND {
            bits::MASK_OBJECT => unsafe {
                mem::forget((*self.as_object_unchecked()).clone());
            },
            bits::MASK_STRING => unsafe {
                mem::forget((*self.as_string_unchecked()).clone());
            },
            bits::MASK_SYMBOL => unsafe {
                mem::forget((*self.as_symbol_unchecked()).clone());
            },
            bits::MASK_BIGINT => unsafe {
                mem::forget((*self.as_bigint_unchecked()).clone());
            },
            _ => {
                // Rest of the variants don't need additional handling.
            }
        }

        Self {
            #[cfg(target_pointer_width = "32")]
            half: self.half,
            ptr: self.ptr,
        }
    }
}

impl NanBoxedValue {
    /// Creates a new `NanBoxedValue` from an u64 value without checking the validity
    /// of the value.
    #[must_use]
    #[inline(always)]
    const fn from_inner_unchecked(inner: u64) -> Self {
        Self {
            #[cfg(target_pointer_width = "32")]
            half: (inner >> 32) as u32,
            ptr: ptr::without_provenance_mut(inner as usize),
        }
    }

    /// Creates a new `NanBoxedValue` from a pointer to an object-like and the tagged address of that
    /// pointer.
    ///
    /// This preserves the provenance of the original pointer.
    fn from_object_like<T>(ptr: NonNull<T>, addr: u64) -> Self {
        Self {
            #[cfg(target_pointer_width = "32")]
            half: (addr >> 32) as u32,
            ptr: ptr.cast::<()>().as_ptr().with_addr(addr as usize),
        }
    }

    /// Returns the value contained within this structure as a `u64`.
    #[must_use]
    #[inline(always)]
    fn value(&self) -> u64 {
        let value = self.ptr.addr() as u64;

        #[cfg(target_pointer_width = "32")]
        let value = ((self.half as u64) << 32) | value;

        value
    }

    /// Returns a `InnerValue` from a Null.
    #[must_use]
    #[inline(always)]
    pub(crate) const fn null() -> Self {
        Self::from_inner_unchecked(bits::VALUE_NULL)
    }

    /// Returns a `InnerValue` from an undefined.
    #[must_use]
    #[inline(always)]
    pub(crate) const fn undefined() -> Self {
        Self::from_inner_unchecked(bits::VALUE_UNDEFINED)
    }

    /// Returns a `InnerValue` from a 64-bits float. If the float is `NaN`,
    /// it will be reduced to a canonical `NaN` representation.
    #[must_use]
    #[inline(always)]
    pub(crate) const fn float64(value: f64) -> Self {
        Self::from_inner_unchecked(bits::tag_f64(value))
    }

    /// Returns a `InnerValue` from a 32-bits integer.
    #[must_use]
    #[inline(always)]
    pub(crate) const fn integer32(value: i32) -> Self {
        Self::from_inner_unchecked(bits::tag_i32(value))
    }

    /// Returns a `InnerValue` from a boolean.
    #[must_use]
    #[inline(always)]
    pub(crate) const fn boolean(value: bool) -> Self {
        Self::from_inner_unchecked(bits::tag_bool(value))
    }

    /// Returns a `InnerValue` from a boxed [`JsBigInt`].
    #[must_use]
    #[inline(always)]
    pub(crate) fn bigint(value: JsBigInt) -> Self {
        let ptr = value.into_raw();
        let addr = bits::tag_pointer(ptr, bits::MASK_BIGINT);
        Self::from_object_like(ptr, addr)
    }

    /// Returns a `InnerValue` from a boxed [`JsObject`].
    #[must_use]
    #[inline(always)]
    pub(crate) fn object(value: JsObject) -> Self {
        let ptr = value.into_raw();
        let addr = bits::tag_pointer(ptr, bits::MASK_OBJECT);
        Self::from_object_like(ptr, addr)
    }

    /// Returns a `InnerValue` from a boxed [`JsSymbol`].
    #[must_use]
    #[inline(always)]
    pub(crate) fn symbol(value: JsSymbol) -> Self {
        let ptr = value.into_raw();
        let addr = bits::tag_pointer(ptr, bits::MASK_SYMBOL);
        Self::from_object_like(ptr, addr)
    }

    /// Returns a `InnerValue` from a boxed [`JsString`].
    #[must_use]
    #[inline(always)]
    pub(crate) fn string(value: JsString) -> Self {
        let ptr = value.into_raw();
        let addr = bits::tag_pointer(ptr, bits::MASK_STRING);
        Self::from_object_like(ptr, addr)
    }

    /// Returns true if a value is undefined.
    #[must_use]
    #[inline(always)]
    pub(crate) fn is_undefined(&self) -> bool {
        self.value() == bits::VALUE_UNDEFINED
    }

    /// Returns true if a value is null.
    #[must_use]
    #[inline(always)]
    pub(crate) fn is_null(&self) -> bool {
        self.value() == bits::VALUE_NULL
    }

    /// Returns true if a value is null or undefined.
    #[must_use]
    #[inline(always)]
    pub(crate) fn is_null_or_undefined(&self) -> bool {
        self.value() & bits::MASK_KIND == bits::MASK_OTHER
    }

    /// Returns true if a value is a boolean.
    #[must_use]
    #[inline(always)]
    pub(crate) fn is_bool(&self) -> bool {
        bits::is_bool(self.value())
    }

    /// Returns true if a value is a 64-bits float.
    #[must_use]
    #[inline(always)]
    pub(crate) fn is_float64(&self) -> bool {
        bits::is_float(self.value())
    }

    /// Returns true if a value is negative zero (`-0.0`).
    #[must_use]
    #[inline(always)]
    pub(crate) fn is_negative_zero(&self) -> bool {
        bits::is_negative_zero(self.value())
    }

    /// Returns true if a value is a 32-bits integer.
    #[must_use]
    #[inline(always)]
    pub(crate) fn is_integer32(&self) -> bool {
        bits::is_integer32(self.value())
    }

    /// Returns true if a value is a [`JsBigInt`]. A `NaN` will not match here.
    #[must_use]
    #[inline(always)]
    pub(crate) fn is_bigint(&self) -> bool {
        bits::is_bigint(self.value())
    }

    /// Returns true if a value is a boxed Object.
    #[must_use]
    #[inline(always)]
    pub(crate) fn is_object(&self) -> bool {
        bits::is_object(self.value())
    }

    /// Returns true if a value is a boxed Symbol.
    #[must_use]
    #[inline(always)]
    pub(crate) fn is_symbol(&self) -> bool {
        bits::is_symbol(self.value())
    }

    /// Returns true if a value is a boxed String.
    #[must_use]
    #[inline(always)]
    pub(crate) fn is_string(&self) -> bool {
        bits::is_string(self.value())
    }

    /// Returns the [`Type`] of this value using only the tag bits,
    /// without extracting or cloning the inner value.
    #[must_use]
    #[inline(always)]
    pub(crate) fn get_type(&self) -> Type {
        match self.value() & bits::MASK_KIND {
            bits::MASK_OBJECT => Type::Object,
            bits::MASK_STRING => Type::String,
            bits::MASK_SYMBOL => Type::Symbol,
            bits::MASK_BIGINT => Type::BigInt,
            bits::MASK_BOOLEAN => Type::Boolean,
            bits::MASK_OTHER => match self.value() {
                bits::VALUE_NULL => Type::Null,
                _ => Type::Undefined,
            },
            // Same arm as below.
            // bits::MASK_INT32 => Type::Number,
            _ => Type::Number, // Float64
        }
    }

    /// Returns the value as a f64 if it is a float.
    #[must_use]
    #[inline(always)]
    pub(crate) fn as_float64(&self) -> Option<f64> {
        if self.is_float64() {
            Some(f64::from_bits(self.value()))
        } else {
            None
        }
    }

    /// Returns the value as an i32 if it is an integer.
    #[must_use]
    #[inline(always)]
    pub(crate) fn as_integer32(&self) -> Option<i32> {
        if self.is_integer32() {
            Some(bits::untag_i32(self.value()))
        } else {
            None
        }
    }

    /// Returns the value as a boolean if it is a boolean.
    #[must_use]
    #[inline(always)]
    pub(crate) fn as_bool(&self) -> Option<bool> {
        match self.value() {
            bits::VALUE_FALSE => Some(false),
            bits::VALUE_TRUE => Some(true),
            _ => None,
        }
    }

    /// Returns the value as a boxed [`JsBigInt`].
    #[must_use]
    #[inline(always)]
    pub(crate) fn as_bigint(&self) -> Option<JsBigInt> {
        if self.is_bigint() {
            // SAFETY: the inner address must hold a valid, non-null JsBigInt.
            unsafe { Some((*self.as_bigint_unchecked()).clone()) }
        } else {
            None
        }
    }

    /// Returns the value as a [`JsBigInt`] without checking the inner tag.
    ///
    /// # Safety
    ///
    /// The inner value must be a valid `JsBigInt`.
    #[must_use]
    #[inline(always)]
    unsafe fn as_bigint_unchecked(&self) -> ManuallyDrop<JsBigInt> {
        let addr = bits::untag_pointer(self.value());
        // SAFETY: This is guaranteed by the caller.
        unsafe {
            ManuallyDrop::new(JsBigInt::from_raw(
                self.ptr.with_addr(addr).cast::<RawBigInt>().cast_const(),
            ))
        }
    }

    /// Returns the value as a boxed [`JsObject`].
    #[must_use]
    #[inline(always)]
    pub(crate) fn as_object(&self) -> Option<JsObject> {
        if self.is_object() {
            // SAFETY: the inner address must hold a valid, non-null JsObject.
            unsafe { Some((*self.as_object_unchecked()).clone()) }
        } else {
            None
        }
    }

    /// Returns the value as a boxed [`JsObject`] without checking the inner tag.
    ///
    /// # Safety
    ///
    /// The inner value must be a valid `JsObject`.
    #[must_use]
    #[inline(always)]
    unsafe fn as_object_unchecked(&self) -> ManuallyDrop<JsObject> {
        let addr = bits::untag_pointer(self.value());
        // SAFETY: This is guaranteed by the caller.
        unsafe {
            ManuallyDrop::new(JsObject::from_raw(NonNull::new_unchecked(
                self.ptr.with_addr(addr).cast::<GcBox<ErasedVTableObject>>(),
            )))
        }
    }

    /// Returns the value as a [`JsSymbol`].
    #[must_use]
    #[inline(always)]
    pub(crate) fn as_symbol(&self) -> Option<JsSymbol> {
        if self.is_symbol() {
            // SAFETY: the inner address must hold a valid, non-null JsSymbol.
            unsafe { Some((*self.as_symbol_unchecked()).clone()) }
        } else {
            None
        }
    }

    /// Returns the value as a [`JsSymbol`] without checking the inner tag.
    ///
    /// # Safety
    ///
    /// The inner value must be a valid `JsSymbol`.
    #[must_use]
    #[inline(always)]
    unsafe fn as_symbol_unchecked(&self) -> ManuallyDrop<JsSymbol> {
        let addr = bits::untag_pointer(self.value());
        // SAFETY: This is guaranteed by the caller.
        unsafe {
            ManuallyDrop::new(JsSymbol::from_raw(NonNull::new_unchecked(
                self.ptr.with_addr(addr).cast::<RawJsSymbol>(),
            )))
        }
    }

    /// Returns the value as a boxed [`JsString`].
    #[must_use]
    #[inline(always)]
    pub(crate) fn as_string(&self) -> Option<JsString> {
        if self.is_string() {
            // SAFETY: the inner address must hold a valid, non-null JsString.
            unsafe { Some((*self.as_string_unchecked()).clone()) }
        } else {
            None
        }
    }

    /// Returns the value as a [`JsString`] without checking the inner tag.
    ///
    /// # Safety
    ///
    /// The inner value must be a valid `JsString`.
    #[must_use]
    #[inline(always)]
    unsafe fn as_string_unchecked(&self) -> ManuallyDrop<JsString> {
        let addr = bits::untag_pointer(self.value());
        // SAFETY: the inner address must hold a valid, non-null JsString.
        unsafe {
            ManuallyDrop::new(JsString::from_raw(NonNull::new_unchecked(
                self.ptr.with_addr(addr).cast(),
            )))
        }
    }

    /// Converts the value to a boolean without cloning pointer types.
    ///
    /// Objects and Symbols are always truthy. For `String` and `BigInt`,
    /// the pointer is temporarily reconstructed via [`ManuallyDrop`] to
    /// call `is_empty()` / `is_zero()` without touching the refcount.
    #[must_use]
    #[inline(always)]
    pub(crate) fn to_boolean(&self) -> bool {
        match self.value() & bits::MASK_KIND {
            // Symbols are always truthy.
            bits::MASK_SYMBOL => true,
            // Objects are truthy, unless they have [[IsHTMLDDA]] (Annex B §B.3.6.1).
            bits::MASK_OBJECT => {
                #[cfg(feature = "annex-b")]
                {
                    // SAFETY: tag confirmed this is an Object.
                    if unsafe { self.as_object_unchecked().is::<IsHTMLDDA>() } {
                        return false;
                    }
                }
                true
            }
            // Null and Undefined are always falsy.
            bits::MASK_OTHER => false,
            bits::MASK_INT32 => bits::untag_i32(self.value()) != 0,
            bits::MASK_BOOLEAN => bits::untag_bool(self.value()),
            bits::MASK_STRING => {
                // SAFETY: tag confirmed this is a String.
                unsafe { !self.as_string_unchecked().is_empty() }
            }
            bits::MASK_BIGINT => {
                // SAFETY: tag confirmed this is a BigInt.
                unsafe { !self.as_bigint_unchecked().is_zero() }
            }
            // Float64: falsy if 0.0, -0.0, or NaN.
            _ => {
                let f = f64::from_bits(self.value());
                f != 0.0 && !f.is_nan()
            }
        }
    }

    /// Returns the [`JsVariant`] of this inner value.
    #[must_use]
    #[inline(always)]
    pub(crate) fn as_variant(&self) -> JsVariant {
        match self.value() & bits::MASK_KIND {
            bits::MASK_OBJECT => {
                JsVariant::Object(unsafe { (*self.as_object_unchecked()).clone() })
            }
            bits::MASK_STRING => {
                JsVariant::String(unsafe { (*self.as_string_unchecked()).clone() })
            }
            bits::MASK_SYMBOL => {
                JsVariant::Symbol(unsafe { (*self.as_symbol_unchecked()).clone() })
            }
            bits::MASK_BIGINT => {
                JsVariant::BigInt(unsafe { (*self.as_bigint_unchecked()).clone() })
            }
            bits::MASK_INT32 => JsVariant::Integer32(bits::untag_i32(self.value())),
            bits::MASK_BOOLEAN => JsVariant::Boolean(bits::untag_bool(self.value())),
            bits::MASK_OTHER => match self.value() {
                bits::VALUE_NULL => JsVariant::Null,
                _ => JsVariant::Undefined,
            },
            _ => JsVariant::Float64(f64::from_bits(self.value())),
        }
    }
}

impl Drop for NanBoxedValue {
    #[inline(always)]
    fn drop(&mut self) {
        match self.value() & bits::MASK_KIND {
            bits::MASK_OBJECT => {
                unsafe { ManuallyDrop::into_inner(self.as_object_unchecked()) };
            }
            bits::MASK_STRING => {
                unsafe { ManuallyDrop::into_inner(self.as_string_unchecked()) };
            }
            bits::MASK_SYMBOL => {
                unsafe { ManuallyDrop::into_inner(self.as_symbol_unchecked()) };
            }
            bits::MASK_BIGINT => {
                unsafe { ManuallyDrop::into_inner(self.as_bigint_unchecked()) };
            }
            _ => {}
        }
    }
}

#[cfg(test)]
macro_rules! assert_type {
    (@@is $value: ident, $u: literal, $n: literal, $b: literal, $i: literal, $f: literal, $bi: literal, $s: literal, $o: literal, $sy: literal) => {
        assert_eq!($u  != 0, $value.is_undefined());
        assert_eq!($n  != 0, $value.is_null());
        assert_eq!($b  != 0, $value.is_bool());
        assert_eq!($i  != 0, $value.is_integer32());
        assert_eq!($f  != 0, $value.is_float64());
        assert_eq!($bi != 0, $value.is_bigint());
        assert_eq!($s  != 0, $value.is_string());
        assert_eq!($o  != 0, $value.is_object());
        assert_eq!($sy != 0, $value.is_symbol());
    };
    (@@as $value: ident, $u: literal, $n: literal, $b: literal, $i: literal, $f: literal, $bi: literal, $s: literal, $o: literal, $sy: literal) => {
        if $b  == 0 { assert_eq!($value.as_bool(), None); }
        if $i  == 0 { assert_eq!($value.as_integer32(), None); }
        if $f  == 0 { assert_eq!($value.as_float64(), None); }
        if $bi == 0 { assert_eq!($value.as_bigint(), None); }
        if $s  == 0 { assert_eq!($value.as_string(), None); }
        if $o  == 0 { assert_eq!($value.as_object(), None); }
        if $sy == 0 { assert_eq!($value.as_symbol(), None); }
    };
    ($value: ident is undefined) => {
        assert_type!(@@is $value, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        assert_eq!($value.as_variant(), JsVariant::Undefined);
    };
    ($value: ident is null) => {
        assert_type!(@@is $value, 0, 1, 0, 0, 0, 0, 0, 0, 0);
        assert_eq!($value.as_variant(), JsVariant::Null);
    };
    ($value: ident is bool($scalar: ident)) => {
        assert_type!(@@is $value, 0, 0, 1, 0, 0, 0, 0, 0, 0);
        assert_type!(@@as $value, 0, 0, 1, 0, 0, 0, 0, 0, 0);
        assert_eq!(Some($scalar), $value.as_bool());
        assert_eq!($value.as_variant(), JsVariant::Boolean($scalar));
    };
    ($value: ident is integer($scalar: ident)) => {
        assert_type!(@@is $value, 0, 0, 0, 1, 0, 0, 0, 0, 0);
        assert_type!(@@as $value, 0, 0, 0, 1, 0, 0, 0, 0, 0);
        assert_eq!(Some($scalar), $value.as_integer32());
        assert_eq!($value.as_variant(), JsVariant::Integer32($scalar));
    };
    ($value: ident is float($scalar: ident)) => {
        assert_type!(@@is $value, 0, 0, 0, 0, 1, 0, 0, 0, 0);
        assert_type!(@@as $value, 0, 0, 0, 0, 1, 0, 0, 0, 0);
        assert_eq!(Some($scalar), $value.as_float64());
        // Verify parity.
        assert_eq!(Some(1.0 / $scalar), $value.as_float64().map(|f| 1.0 / f));
        assert_eq!($value.as_variant(), JsVariant::Float64($scalar));

        // Verify that the clone is still the same.
        let new_value = $value.clone();

        assert_eq!(Some($scalar), new_value.as_float64());
        assert_eq!($value.as_float64(), new_value.as_float64());
        // Verify parity.
        assert_eq!(Some(1.0 / $scalar), new_value.as_float64().map(|f| 1.0 / f));
        assert_eq!(new_value.as_variant(), JsVariant::Float64($scalar));

        let JsVariant::Float64(new_scalar) = new_value.as_variant() else {
            panic!("Expected Float64, got {:?}", new_value.as_variant());
        };
        assert_eq!(Some(new_scalar), new_value.as_float64());
        assert_eq!($value.as_float64(), new_value.as_float64());
        // Verify parity.
        assert_eq!(Some(1.0 / new_scalar), new_value.as_float64().map(|f| 1.0 / f));
        assert_eq!(new_value.as_variant(), JsVariant::Float64(new_scalar));
    };
    ($value: ident is nan) => {
        assert_type!(@@is $value, 0, 0, 0, 0, 1, 0, 0, 0, 0);
        assert_type!(@@as $value, 0, 0, 0, 0, 1, 0, 0, 0, 0);
        assert!($value.as_float64().unwrap().is_nan());
        assert!(matches!($value.as_variant(), JsVariant::Float64(f) if f.is_nan()));
    };
    ($value: ident is bigint($scalar: ident)) => {
        assert_type!(@@is $value, 0, 0, 0, 0, 0, 1, 0, 0, 0);
        assert_type!(@@as $value, 0, 0, 0, 0, 0, 1, 0, 0, 0);
        assert_eq!(Some(&$scalar), $value.as_bigint().as_ref());
        assert_eq!($value.as_variant(), JsVariant::BigInt($scalar));
    };
    ($value: ident is object($scalar: ident)) => {
        assert_type!(@@is $value, 0, 0, 0, 0, 0, 0, 0, 1, 0);
        assert_type!(@@as $value, 0, 0, 0, 0, 0, 0, 0, 1, 0);
        assert_eq!(Some(&$scalar), $value.as_object().as_ref());
        assert_eq!($value.as_variant(), JsVariant::Object($scalar));
    };
    ($value: ident is symbol($scalar: ident)) => {
        assert_type!(@@is $value, 0, 0, 0, 0, 0, 0, 0, 0, 1);
        assert_type!(@@as $value, 0, 0, 0, 0, 0, 0, 0, 0, 1);
        assert_eq!(Some(&$scalar), $value.as_symbol().as_ref());
        assert_eq!($value.as_variant(), JsVariant::Symbol($scalar));
    };
    ($value: ident is string($scalar: ident)) => {
        assert_type!(@@is $value, 0, 0, 0, 0, 0, 0, 1, 0, 0);
        assert_type!(@@as $value, 0, 0, 0, 0, 0, 0, 1, 0, 0);
        assert_eq!(Some(&$scalar), $value.as_string().as_ref());
        assert_eq!($value.as_variant(), JsVariant::String($scalar));
    };
}

#[test]
fn null() {
    let v = NanBoxedValue::null();
    assert_type!(v is null);
}

#[test]
fn undefined() {
    let v = NanBoxedValue::undefined();
    assert_type!(v is undefined);
}

#[test]
fn boolean() {
    let v = NanBoxedValue::boolean(true);
    assert_type!(v is bool(true));

    let v = NanBoxedValue::boolean(false);
    assert_type!(v is bool(false));
}

#[test]
fn integer() {
    fn assert_integer(i: i32) {
        let v = NanBoxedValue::integer32(i);
        assert_type!(v is integer(i));
    }

    assert_integer(0);
    assert_integer(1);
    assert_integer(-1);
    assert_integer(42);
    assert_integer(-42);
    assert_integer(i32::MAX);
    assert_integer(i32::MIN);
    assert_integer(i32::MAX - 1);
    assert_integer(i32::MIN + 1);
}

#[test]
#[allow(clippy::float_cmp)]
fn float() {
    fn assert_float(f: f64) {
        let v = NanBoxedValue::float64(f);
        assert_type!(v is float(f));
    }

    assert_float(0.0);
    assert_float(-0.0);
    assert_float(0.1 + 0.2);
    assert_float(-42.123);
    assert_float(f64::INFINITY);
    assert_float(f64::NEG_INFINITY);

    // Some edge cases around zeroes.
    let neg_zero = NanBoxedValue::float64(-0.0);
    assert!(neg_zero.as_float64().unwrap().is_sign_negative());
    assert_eq!(0.0f64, neg_zero.as_float64().unwrap());

    let pos_zero = NanBoxedValue::float64(0.0);
    assert!(!pos_zero.as_float64().unwrap().is_sign_negative());
    assert_eq!(0.0f64, pos_zero.as_float64().unwrap());

    assert_eq!(pos_zero.as_float64(), neg_zero.as_float64());

    let nan = NanBoxedValue::float64(f64::NAN);
    assert_type!(nan is nan);
}

#[test]
fn bigint() {
    let bigint = JsBigInt::from(42);
    let v = NanBoxedValue::bigint(bigint.clone());
    assert_type!(v is bigint(bigint));
}

#[test]
fn object() {
    let object = JsObject::with_null_proto();
    let v = NanBoxedValue::object(object.clone());
    assert_type!(v is object(object));
}

#[test]
fn string() {
    let str = crate::js_string!("Hello World");
    let v = NanBoxedValue::string(str.clone());
    assert_type!(v is string(str));
}

#[test]
fn symbol() {
    let sym = JsSymbol::new(Some(JsString::from("Hello World"))).unwrap();
    let v = NanBoxedValue::symbol(sym.clone());
    assert_type!(v is symbol(sym));

    let sym = JsSymbol::new(None).unwrap();
    let v = NanBoxedValue::symbol(sym.clone());
    assert_type!(v is symbol(sym));
}
