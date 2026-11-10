//! Boa's implementation of ECMAScript's Property Descriptor.
//!
//! The Property Descriptor type is used to explain the manipulation and reification of `Object`
//! property attributes. Values of the Property Descriptor type are Records. Each field's name is
//! an attribute name and its value is a corresponding attribute value as specified in
//! [6.1.7.1][section]. In addition, any field may be present or absent. The schema name used
//! within this specification to tag literal descriptions of Property Descriptor records is
//! `PropertyDescriptor`.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-property-descriptor-specification-type
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
//! [section]: https://tc39.es/ecma262/#sec-property-attributes

mod attribute;
mod nonmaxu32;

use crate::{
    JsString, JsSymbol, JsValue, js_string, object::shape::slot::SlotAttributes, string::JsStr,
};
use boa_gc::{Finalize, Trace};
use std::{fmt, iter::FusedIterator};

pub use {attribute::Attribute, nonmaxu32::NonMaxU32};

/// This represents an ECMAScript Property AKA The Property Descriptor.
///
/// Property descriptors present in objects come in three main flavors:
///  - data descriptors
///  - accessor descriptors
///  - generic descriptor
///
/// A data Property Descriptor is one that includes any fields named either
/// \[\[Value\]\] or \[\[Writable\]\].
///
/// An accessor Property Descriptor is one that includes any fields named either
/// \[\[Get\]\] or \[\[Set\]\].
///
/// A generic Property Descriptor is a Property Descriptor value that is neither
/// a data Property Descriptor nor an accessor Property Descriptor.
///
/// More information:
/// - [MDN documentation][mdn]
/// - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-property-descriptor-specification-type
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
#[derive(Default, Debug, Clone, Trace, Finalize)]
pub struct PropertyDescriptor {
    enumerable: Option<bool>,
    configurable: Option<bool>,
    kind: DescriptorKind,
}

/// `DescriptorKind` represents the different kinds of property descriptors.
#[derive(Debug, Default, Clone, Trace, Finalize)]
pub enum DescriptorKind {
    /// A data property descriptor.
    Data {
        /// The value of the property.
        value: Option<JsValue>,

        /// Whether the property is writable.
        writable: Option<bool>,
    },

    /// An accessor property descriptor.
    Accessor {
        /// The getter of the property.
        get: Option<JsValue>,

        /// The setter of the property.
        set: Option<JsValue>,
    },

    /// A generic property descriptor.
    #[default]
    Generic,
}

impl PropertyDescriptor {
    /// An accessor property descriptor is one that includes any fields named either `[[Get]]` or `[[Set]]`.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-isaccessordescriptor
    #[inline]
    #[must_use]
    pub const fn is_accessor_descriptor(&self) -> bool {
        matches!(self.kind, DescriptorKind::Accessor { .. })
    }

    /// A data property descriptor is one that includes any fields named either `[[Value]]` or `[[Writable]]`.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-isdatadescriptor
    #[inline]
    #[must_use]
    pub const fn is_data_descriptor(&self) -> bool {
        matches!(self.kind, DescriptorKind::Data { .. })
    }

    /// A generic property descriptor is one that is neither a data descriptor nor an accessor descriptor.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-isgenericdescriptor
    #[inline]
    #[must_use]
    pub const fn is_generic_descriptor(&self) -> bool {
        matches!(self.kind, DescriptorKind::Generic)
    }

    /// Returns if the property descriptor is empty.
    #[inline]
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.is_generic_descriptor() && self.enumerable.is_none() && self.configurable.is_none()
    }

    /// Returns if the property descriptor is enumerable.
    /// Returns `None` if the `enumerable` field is not set.
    #[inline]
    #[must_use]
    pub const fn enumerable(&self) -> Option<bool> {
        self.enumerable
    }

    /// Returns if the property descriptor is configurable.
    /// Returns `None` if the `configurable` field is not set.
    #[inline]
    #[must_use]
    pub const fn configurable(&self) -> Option<bool> {
        self.configurable
    }

    /// Returns if the property descriptor is writable.
    /// Returns `None` if the `writable` field is not set or the property descriptor is not a data descriptor.
    #[inline]
    #[must_use]
    pub const fn writable(&self) -> Option<bool> {
        match self.kind {
            DescriptorKind::Data { writable, .. } => writable,
            _ => None,
        }
    }

    /// Returns the value of the property descriptor.
    /// Returns `None` if the value is not set or the property descriptor is not a data descriptor.
    #[inline]
    #[must_use]
    pub const fn value(&self) -> Option<&JsValue> {
        match &self.kind {
            DescriptorKind::Data { value, .. } => value.as_ref(),
            _ => None,
        }
    }

    /// Returns the getter of the property descriptor.
    /// Returns `None` if the getter is not set or the property descriptor is not an accessor descriptor.
    #[inline]
    #[must_use]
    pub const fn get(&self) -> Option<&JsValue> {
        match &self.kind {
            DescriptorKind::Accessor { get, .. } => get.as_ref(),
            _ => None,
        }
    }

    /// Returns the setter of the property descriptor.
    /// Returns `None` if the setter is not set or the property descriptor is not an accessor descriptor.
    #[inline]
    #[must_use]
    pub const fn set(&self) -> Option<&JsValue> {
        match &self.kind {
            DescriptorKind::Accessor { set, .. } => set.as_ref(),
            _ => None,
        }
    }

    /// Returns if the property descriptor is enumerable.
    ///
    /// # Panics
    ///
    /// Panics if the `enumerable` field is not set.
    #[inline]
    #[must_use]
    pub fn expect_enumerable(&self) -> bool {
        self.enumerable
            .expect("[[enumerable]] field not in property descriptor")
    }

    /// Returns if the property descriptor is configurable.
    ///
    /// # Panics
    ///
    /// Panics if the `configurable` field is not set.
    #[inline]
    #[must_use]
    pub fn expect_configurable(&self) -> bool {
        self.configurable
            .expect("[[configurable]] field not in property descriptor")
    }

    /// Returns if the property descriptor is writable.
    ///
    /// # Panics
    ///
    /// Panics if the `writable` field is not set.
    #[inline]
    #[must_use]
    pub fn expect_writable(&self) -> bool {
        self.writable()
            .expect("[[writable]] field not in property descriptor")
    }

    /// Returns the value of the property descriptor.
    ///
    /// # Panics
    ///
    /// Panics if the `value` field is not set.
    #[inline]
    #[must_use]
    pub fn expect_value(&self) -> &JsValue {
        self.value()
            .expect("[[value]] field not in property descriptor")
    }

    /// Returns the getter of the property descriptor.
    ///
    /// # Panics
    ///
    /// Panics if the `getter` field is not set.
    #[inline]
    #[must_use]
    pub fn expect_get(&self) -> &JsValue {
        self.get()
            .expect("[[get]] field not in property descriptor")
    }

    /// Returns the setter of the property descriptor.
    ///
    /// # Panics
    ///
    /// Panics if the `setter` field is not set.
    #[inline]
    #[must_use]
    pub fn expect_set(&self) -> &JsValue {
        self.set()
            .expect("[[set]] field not in property descriptor")
    }

    /// Returns the kind of the property descriptor.
    #[inline]
    #[must_use]
    pub const fn kind(&self) -> &DescriptorKind {
        &self.kind
    }

    /// Creates a new [`PropertyDescriptorBuilder`].
    #[inline]
    #[must_use]
    pub fn builder() -> PropertyDescriptorBuilder {
        PropertyDescriptorBuilder::new()
    }

    /// Creates an accessor property descriptor with default values.
    #[inline]
    #[must_use]
    pub fn into_accessor_defaulted(mut self) -> Self {
        match &mut self.kind {
            DescriptorKind::Accessor { set, get } => {
                if set.is_none() {
                    *set = Some(JsValue::undefined());
                }
                if get.is_none() {
                    *get = Some(JsValue::undefined());
                }
            }
            _ => {
                self.kind = DescriptorKind::Accessor {
                    get: Some(JsValue::undefined()),
                    set: Some(JsValue::undefined()),
                };
            }
        }
        self.configurable = self.configurable.or(Some(false));
        self.enumerable = self.enumerable.or(Some(false));
        self
    }

    /// Creates a data property descriptor with default values.
    #[must_use]
    pub fn into_data_defaulted(mut self) -> Self {
        match &mut self.kind {
            DescriptorKind::Data { value, writable } => {
                if value.is_none() {
                    *value = Some(JsValue::undefined());
                }
                if writable.is_none() {
                    *writable = Some(false);
                }
            }
            _ => {
                self.kind = DescriptorKind::Data {
                    value: Some(JsValue::undefined()),
                    writable: Some(false),
                };
            }
        }
        self.configurable = self.configurable.or(Some(false));
        self.enumerable = self.enumerable.or(Some(false));
        self
    }

    /// Creates an generic property descriptor with default values.
    #[inline]
    #[must_use]
    pub fn complete_property_descriptor(self) -> Self {
        PropertyDescriptorBuilder { inner: self }
            .complete_with_defaults()
            .build()
    }

    /// Fills the fields of the `PropertyDescriptor` that are not set
    /// with fields from the given `PropertyDescriptor`.
    ///
    /// # Panics
    ///
    /// Panics if the given `PropertyDescriptor` is not compatible with this one.
    #[inline]
    pub fn fill_with(&mut self, mut desc: Self) {
        match (&mut self.kind, &mut desc.kind) {
            (
                DescriptorKind::Data { value, writable },
                DescriptorKind::Data {
                    value: desc_value,
                    writable: desc_writable,
                },
            ) => {
                if desc_value.is_some() {
                    std::mem::swap(value, desc_value);
                }
                if desc_writable.is_some() {
                    std::mem::swap(writable, desc_writable);
                }
            }
            (
                DescriptorKind::Accessor { get, set },
                DescriptorKind::Accessor {
                    get: desc_get,
                    set: desc_set,
                },
            ) => {
                if desc_get.is_some() {
                    std::mem::swap(get, desc_get);
                }
                if desc_set.is_some() {
                    std::mem::swap(set, desc_set);
                }
            }
            (_, DescriptorKind::Generic) => {}
            _ => panic!("Tried to fill a descriptor with an incompatible descriptor"),
        }

        if let Some(enumerable) = desc.enumerable {
            self.enumerable = Some(enumerable);
        }
        if let Some(configurable) = desc.configurable {
            self.configurable = Some(configurable);
        }
    }

    pub(crate) fn to_slot_attributes(&self) -> SlotAttributes {
        let mut attributes = SlotAttributes::empty();
        attributes.set(SlotAttributes::CONFIGURABLE, self.expect_configurable());
        attributes.set(SlotAttributes::ENUMERABLE, self.expect_enumerable());
        if self.is_data_descriptor() {
            attributes.set(SlotAttributes::WRITABLE, self.expect_writable());
        } else {
            attributes.set(SlotAttributes::GET, self.get().is_some());
            attributes.set(SlotAttributes::SET, self.set().is_some());
        }
        attributes
    }
}

/// A builder for [`PropertyDescriptor`].
#[derive(Default, Debug, Clone)]
pub struct PropertyDescriptorBuilder {
    inner: PropertyDescriptor,
}

impl PropertyDescriptorBuilder {
    /// Creates a new [`PropertyDescriptorBuilder`].
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the `value` field of the property descriptor.
    #[must_use]
    pub fn value<V: Into<JsValue>>(mut self, value: V) -> Self {
        match self.inner.kind {
            DescriptorKind::Data {
                value: ref mut v, ..
            } => *v = Some(value.into()),
            // TODO: maybe panic when trying to convert accessor to data?
            _ => {
                self.inner.kind = DescriptorKind::Data {
                    value: Some(value.into()),
                    writable: None,
                }
            }
        }
        self
    }

    /// Sets the `writable` field of the property descriptor.
    #[must_use]
    pub fn writable(mut self, writable: bool) -> Self {
        match self.inner.kind {
            DescriptorKind::Data {
                writable: ref mut w,
                ..
            } => *w = Some(writable),
            // TODO: maybe panic when trying to convert accessor to data?
            _ => {
                self.inner.kind = DescriptorKind::Data {
                    value: None,
                    writable: Some(writable),
                }
            }
        }
        self
    }

    /// Sets the `get` field of the property descriptor.
    #[must_use]
    pub fn get<V: Into<JsValue>>(mut self, get: V) -> Self {
        match self.inner.kind {
            DescriptorKind::Accessor { get: ref mut g, .. } => *g = Some(get.into()),
            // TODO: maybe panic when trying to convert data to accessor?
            _ => {
                self.inner.kind = DescriptorKind::Accessor {
                    get: Some(get.into()),
                    set: None,
                }
            }
        }
        self
    }

    /// Sets the `set` field of the property descriptor.
    #[must_use]
    pub fn set<V: Into<JsValue>>(mut self, set: V) -> Self {
        match self.inner.kind {
            DescriptorKind::Accessor { set: ref mut s, .. } => *s = Some(set.into()),
            // TODO: maybe panic when trying to convert data to accessor?
            _ => {
                self.inner.kind = DescriptorKind::Accessor {
                    set: Some(set.into()),
                    get: None,
                }
            }
        }
        self
    }

    /// Optionally sets the `enumerable` field of the property descriptor.
    #[must_use]
    pub const fn maybe_enumerable(mut self, enumerable: Option<bool>) -> Self {
        if let Some(enumerable) = enumerable {
            self = self.enumerable(enumerable);
        }
        self
    }

    /// Optionally sets the `configurable` field of the property descriptor.
    #[must_use]
    pub const fn maybe_configurable(mut self, configurable: Option<bool>) -> Self {
        if let Some(configurable) = configurable {
            self = self.configurable(configurable);
        }
        self
    }

    /// Optionally sets the `value` field of the property descriptor.
    #[must_use]
    pub fn maybe_value<V: Into<JsValue>>(mut self, value: Option<V>) -> Self {
        if let Some(value) = value {
            self = self.value(value);
        }
        self
    }

    /// Optionally sets the `writable` field of the property descriptor.
    #[must_use]
    pub fn maybe_writable(mut self, writable: Option<bool>) -> Self {
        if let Some(writable) = writable {
            self = self.writable(writable);
        }
        self
    }

    /// Optionally sets the `get` field of the property descriptor.
    #[must_use]
    pub fn maybe_get<V: Into<JsValue>>(mut self, get: Option<V>) -> Self {
        if let Some(get) = get {
            self = self.get(get);
        }
        self
    }

    /// Optionally sets the `set` field of the property descriptor.
    #[must_use]
    pub fn maybe_set<V: Into<JsValue>>(mut self, set: Option<V>) -> Self {
        if let Some(set) = set {
            self = self.set(set);
        }
        self
    }

    /// Sets the `enumerable` field of the property descriptor.
    #[must_use]
    pub const fn enumerable(mut self, enumerable: bool) -> Self {
        self.inner.enumerable = Some(enumerable);
        self
    }

    /// Sets the `configurable` field of the property descriptor.
    #[must_use]
    pub const fn configurable(mut self, configurable: bool) -> Self {
        self.inner.configurable = Some(configurable);
        self
    }

    /// Fill any missing fields in the property descriptor.
    #[must_use]
    pub fn complete_with_defaults(mut self) -> Self {
        match self.inner.kind {
            DescriptorKind::Generic => {
                self.inner.kind = DescriptorKind::Data {
                    value: Some(JsValue::undefined()),
                    writable: Some(false),
                }
            }
            DescriptorKind::Data {
                ref mut value,
                ref mut writable,
            } => {
                if value.is_none() {
                    *value = Some(JsValue::undefined());
                }
                if writable.is_none() {
                    *writable = Some(false);
                }
            }
            DescriptorKind::Accessor {
                ref mut set,
                ref mut get,
            } => {
                if set.is_none() {
                    *set = Some(JsValue::undefined());
                }
                if get.is_none() {
                    *get = Some(JsValue::undefined());
                }
            }
        }
        if self.inner.configurable.is_none() {
            self.inner.configurable = Some(false);
        }
        if self.inner.enumerable.is_none() {
            self.inner.enumerable = Some(false);
        }
        self
    }

    /// Returns a reference to the currently built [`PropertyDescriptor`].
    #[must_use]
    pub const fn inner(&self) -> &PropertyDescriptor {
        &self.inner
    }

    /// Consumes the builder and returns the [`PropertyDescriptor`].
    #[must_use]
    #[allow(clippy::missing_const_for_fn)]
    pub fn build(self) -> PropertyDescriptor {
        self.inner
    }
}

impl From<PropertyDescriptorBuilder> for PropertyDescriptor {
    fn from(builder: PropertyDescriptorBuilder) -> Self {
        builder.build()
    }
}

/// This abstracts away the need for `IsPropertyKey` by transforming the `PropertyKey`
/// values into an enum with both valid types: String and Symbol
///
/// More information:
/// - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ispropertykey
#[derive(Finalize, PartialEq, Debug, Clone, Eq, Hash)]
pub enum PropertyKey {
    /// A string property key.
    String(JsString),

    /// A symbol property key.
    Symbol(JsSymbol),

    /// A numeric property key.
    Index(NonMaxU32),
}

/// Utility function for parsing [`PropertyKey`].
fn parse_u32_index<I, T>(mut input: I) -> Option<NonMaxU32>
where
    I: Iterator<Item = T> + ExactSizeIterator + FusedIterator,
    T: Into<u16>,
{
    // min: 0             --> 1  char
    // max: 4_294_967_296 --> 10 chars
    //
    // Max char range: [1, 10] inclusive.
    const MAX_CHAR_COUNT: usize = 10;

    const CHAR_ZERO: u16 = b'0' as u16;
    const CHAR_NINE: u16 = b'9' as u16;

    // Eliminate any string if it's greater than the max char count.
    let len = input.len();
    if len > MAX_CHAR_COUNT {
        return None;
    }

    // Helper function, for converting character to digit [0, 9].
    let to_digit = |c: u16| -> Option<u32> {
        if matches!(c, CHAR_ZERO..=CHAR_NINE) {
            Some(u32::from(c - CHAR_ZERO))
        } else {
            None
        }
    };

    let byte = input.next()?.into();
    if byte == CHAR_ZERO {
        if len == 1 {
            // SAFETY: `0` is not `u32::MAX`.
            return unsafe { Some(NonMaxU32::new_unchecked(0)) };
        }

        // String "012345" is not a valid index.
        return None;
    }

    let mut result = to_digit(byte)?;

    // If the len is equal to max chars, then we need to do checked operations,
    // in case of overflows. If less use unchecked versions.
    if len == MAX_CHAR_COUNT {
        for c in input {
            result = result.checked_mul(10)?.checked_add(to_digit(c.into())?)?;
        }

        NonMaxU32::new(result)
    } else {
        for c in input {
            result = result * 10 + to_digit(c.into())?;
        }

        // SAFETY: `result` cannot be `u32::MAX`,
        //         because the length of the input is smaller than `MAX_CHAR_COUNT`.
        unsafe { Some(NonMaxU32::new_unchecked(result)) }
    }
}

impl From<JsStr<'_>> for PropertyKey {
    #[inline]
    fn from(string: JsStr<'_>) -> Self {
        parse_u32_index(string.iter()).map_or_else(|| Self::String(string.into()), Self::Index)
    }
}

impl From<JsString> for PropertyKey {
    #[inline]
    fn from(string: JsString) -> Self {
        parse_u32_index(string.as_str().iter()).map_or(Self::String(string), Self::Index)
    }
}

impl From<JsSymbol> for PropertyKey {
    #[inline]
    fn from(symbol: JsSymbol) -> Self {
        Self::Symbol(symbol)
    }
}

impl fmt::Display for PropertyKey {
    #[inline]
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::String(string) => string.to_std_string_escaped().fmt(f),
            Self::Symbol(symbol) => symbol.descriptive_string().to_std_string_escaped().fmt(f),
            Self::Index(index) => index.get().fmt(f),
        }
    }
}

impl From<&PropertyKey> for JsValue {
    #[inline]
    fn from(property_key: &PropertyKey) -> Self {
        match property_key {
            PropertyKey::String(string) => string.clone().into(),
            PropertyKey::Symbol(symbol) => symbol.clone().into(),
            PropertyKey::Index(index) => {
                i32::try_from(index.get()).map_or_else(|_| Self::new(index.get()), Self::new)
            }
        }
    }
}

impl From<PropertyKey> for JsValue {
    #[inline]
    fn from(property_key: PropertyKey) -> Self {
        match property_key {
            PropertyKey::String(ref string) => string.clone().into(),
            PropertyKey::Symbol(ref symbol) => symbol.clone().into(),
            PropertyKey::Index(index) => js_string!(index.get()).into(),
        }
    }
}

impl From<u8> for PropertyKey {
    fn from(value: u8) -> Self {
        // SAFETY: `u8` can never be `u32::MAX`.
        unsafe { Self::Index(NonMaxU32::new_unchecked(value.into())) }
    }
}

impl From<u16> for PropertyKey {
    fn from(value: u16) -> Self {
        // SAFETY: `u16` can never be `u32::MAX`.
        unsafe { Self::Index(NonMaxU32::new_unchecked(value.into())) }
    }
}

impl From<u32> for PropertyKey {
    fn from(value: u32) -> Self {
        NonMaxU32::new(value).map_or_else(|| Self::String(value.into()), Self::Index)
    }
}

impl From<usize> for PropertyKey {
    fn from(value: usize) -> Self {
        u32::try_from(value)
            .ok()
            .and_then(NonMaxU32::new)
            .map_or_else(|| Self::String(value.into()), Self::Index)
    }
}

impl From<i64> for PropertyKey {
    fn from(value: i64) -> Self {
        u32::try_from(value)
            .ok()
            .and_then(NonMaxU32::new)
            .map_or_else(|| Self::String(value.into()), Self::Index)
    }
}

impl From<u64> for PropertyKey {
    fn from(value: u64) -> Self {
        u32::try_from(value)
            .ok()
            .and_then(NonMaxU32::new)
            .map_or_else(|| Self::String(value.into()), Self::Index)
    }
}

impl From<isize> for PropertyKey {
    fn from(value: isize) -> Self {
        u32::try_from(value)
            .ok()
            .and_then(NonMaxU32::new)
            .map_or_else(|| Self::String(value.into()), Self::Index)
    }
}

impl From<i32> for PropertyKey {
    fn from(value: i32) -> Self {
        if !value.is_negative() {
            // Safety: A positive i32 value fits in 31 bits, so it can never be u32::MAX.
            return Self::Index(unsafe { NonMaxU32::new_unchecked(value as u32) });
        }
        Self::String(value.into())
    }
}

impl From<f64> for PropertyKey {
    fn from(value: f64) -> Self {
        use num_traits::cast::FromPrimitive;

        u32::from_f64(value)
            .and_then(NonMaxU32::new)
            .map_or_else(|| Self::String(value.into()), Self::Index)
    }
}

impl PartialEq<[u16]> for PropertyKey {
    fn eq(&self, other: &[u16]) -> bool {
        match self {
            Self::String(string) => string == other,
            _ => false,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum PropertyNameKind {
    Key,
    Value,
    KeyAndValue,
}
