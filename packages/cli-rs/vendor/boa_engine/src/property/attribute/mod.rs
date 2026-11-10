//! This module implements the `Attribute` struct which contains the attributes for property descriptors.

use bitflags::bitflags;

#[cfg(test)]
mod tests;

bitflags! {
    /// This struct contains the property flags as described in the ECMAScript specification.
    ///
    /// It contains the following flags:
    ///  - `[[Writable]]` (`WRITABLE`) - If `false`, attempts by ECMAScript code to change the property's
    /// `[[Value]]` attribute using `[[Set]]` will not succeed.
    ///  - `[[Enumerable]]` (`ENUMERABLE`) - If the property will be enumerated by a for-in enumeration.
    ///  - `[[Configurable]]` (`CONFIGURABLE`) - If `false`, attempts to delete the property,
    /// change the property to be an `accessor property`, or change its attributes (other than `[[Value]]`,
    /// or changing `[[Writable]]` to `false`) will fail.
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
    pub struct Attribute: u8 {
        /// The `Writable` attribute decides whether the value associated with the property can be changed or not, from its initial value.
        const WRITABLE = 0b0000_0001;

        /// If the property can be enumerated by a `for-in` loop.
        const ENUMERABLE = 0b0000_0010;

        /// If the property descriptor can be changed later.
        const CONFIGURABLE = 0b0000_0100;

        /// The property is not writable.
        const READONLY = 0b0000_0000;

        /// The property can not be enumerated in a `for-in` loop.
        const NON_ENUMERABLE = 0b0000_0000;

        /// The property descriptor cannot be changed.
        const PERMANENT = 0b0000_0000;
    }
}

impl Attribute {
    /// Clear all flags.
    #[inline]
    pub fn clear(&mut self) {
        *self.0.bits_mut() = 0;
    }

    /// Sets the `writable` flag.
    #[inline]
    pub fn set_writable(&mut self, value: bool) {
        if value {
            *self |= Self::WRITABLE;
        } else {
            *self |= *self & !Self::WRITABLE;
        }
    }

    /// Gets the `writable` flag.
    #[inline]
    #[must_use]
    pub const fn writable(self) -> bool {
        self.contains(Self::WRITABLE)
    }

    /// Sets the `enumerable` flag.
    #[inline]
    pub fn set_enumerable(&mut self, value: bool) {
        if value {
            *self |= Self::ENUMERABLE;
        } else {
            *self |= *self & !Self::ENUMERABLE;
        }
    }

    /// Gets the `enumerable` flag.
    #[inline]
    #[must_use]
    pub const fn enumerable(self) -> bool {
        self.contains(Self::ENUMERABLE)
    }

    /// Sets the `configurable` flag.
    #[inline]
    pub fn set_configurable(&mut self, value: bool) {
        if value {
            *self |= Self::CONFIGURABLE;
        } else {
            *self |= *self & !Self::CONFIGURABLE;
        }
    }

    /// Gets the `configurable` flag.
    #[inline]
    #[must_use]
    pub const fn configurable(self) -> bool {
        self.contains(Self::CONFIGURABLE)
    }
}

impl Default for Attribute {
    /// Returns the default flags according to the [ECMAScript specification][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#table-default-attribute-values
    fn default() -> Self {
        Self::READONLY | Self::NON_ENUMERABLE | Self::PERMANENT
    }
}
