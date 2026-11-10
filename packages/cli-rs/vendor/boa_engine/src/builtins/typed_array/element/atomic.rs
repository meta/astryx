use std::{convert::identity, sync::atomic::Ordering};

use portable_atomic::{
    AtomicI8, AtomicI16, AtomicI32, AtomicI64, AtomicU8, AtomicU16, AtomicU32, AtomicU64,
};

/// An atomic type that supports atomic operations.
pub(crate) trait Atomic {
    /// The "plain" type of the atomic e.g. `AtomicU8::Plain == u8`
    type Plain;

    /// Loads the value of this atomic.
    fn load(&self, order: Ordering) -> Self::Plain;

    /// Stores `value` on this atomic.
    fn store(&self, val: Self::Plain, order: Ordering);

    /// Computes the `+` operation between `self` and `value`, storing the result
    /// on `self` and returning the old value. This operation wraps on overflow.
    fn add(&self, val: Self::Plain, order: Ordering) -> Self::Plain;

    /// Computes the `&` operation between `self` and `value`, storing the result
    /// on `self` and returning the old value.
    fn bit_and(&self, val: Self::Plain, order: Ordering) -> Self::Plain;

    /// Compares the current value of `self` with `expected`, storing `replacement`
    /// if they're equal and returning its old value in all cases.
    fn compare_exchange(
        &self,
        expected: Self::Plain,
        replacement: Self::Plain,
        order: Ordering,
    ) -> Self::Plain;

    /// Swaps `self` with `value`, returning the old value of `self`.
    fn swap(&self, val: Self::Plain, order: Ordering) -> Self::Plain;

    /// Computes the `|` operation between `self` and `value`, storing the result
    /// on `self` and returning the old value.
    fn bit_or(&self, val: Self::Plain, order: Ordering) -> Self::Plain;

    /// Computes the `-` operation between `self` and `value`, storing the result
    /// on `self` and returning the old value. This operation wraps on overflow.
    fn sub(&self, val: Self::Plain, order: Ordering) -> Self::Plain;

    /// Computes the `^` operation between `self` and `value`, storing the result
    /// on `self` and returning the old value.
    fn bit_xor(&self, val: Self::Plain, order: Ordering) -> Self::Plain;

    /// Checks if this atomic does not use any locks to support atomic operations.
    fn is_lock_free() -> bool;
}

macro_rules! atomic {
    ( $atomic:ty, $plain:ty ) => {
        impl Atomic for $atomic {
            type Plain = $plain;

            fn load(&self, order: Ordering) -> Self::Plain {
                <$atomic>::load(self, order)
            }

            fn store(&self, val: Self::Plain, order: Ordering) {
                <$atomic>::store(self, val, order);
            }

            fn add(&self, val: Self::Plain, order: Ordering) -> Self::Plain {
                <$atomic>::fetch_add(self, val, order)
            }

            fn bit_and(&self, val: Self::Plain, order: Ordering) -> Self::Plain {
                <$atomic>::fetch_and(self, val, order)
            }

            fn compare_exchange(
                &self,
                expected: Self::Plain,
                replacement: Self::Plain,
                order: Ordering,
            ) -> Self::Plain {
                <$atomic>::compare_exchange(self, expected, replacement, order, order)
                    .map_or_else(identity, identity)
            }

            fn swap(&self, val: Self::Plain, order: Ordering) -> Self::Plain {
                <$atomic>::swap(self, val, order)
            }

            fn bit_or(&self, val: Self::Plain, order: Ordering) -> Self::Plain {
                <$atomic>::fetch_or(self, val, order)
            }

            fn sub(&self, val: Self::Plain, order: Ordering) -> Self::Plain {
                <$atomic>::fetch_sub(self, val, order)
            }

            fn bit_xor(&self, val: Self::Plain, order: Ordering) -> Self::Plain {
                <$atomic>::fetch_xor(self, val, order)
            }

            fn is_lock_free() -> bool {
                <$atomic>::is_lock_free()
            }
        }
    };
}

atomic!(AtomicU8, u8);
atomic!(AtomicI8, i8);
atomic!(AtomicU16, u16);
atomic!(AtomicI16, i16);
atomic!(AtomicU32, u32);
atomic!(AtomicI32, i32);
atomic!(AtomicU64, u64);
atomic!(AtomicI64, i64);
