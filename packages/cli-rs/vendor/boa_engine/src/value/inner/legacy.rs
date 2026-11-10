//! This `[JsValue]` inner type is an opaque enum implementing the same
//! interface as the `NanBoxedValue` type, but using an enum instead of
//! a 64-bits float.

#[cfg(feature = "annex-b")]
use crate::builtins::is_html_dda::IsHTMLDDA;
use crate::{JsBigInt, JsObject, JsSymbol, value::Type};
use boa_engine::JsVariant;
use boa_gc::{Finalize, Trace, custom_trace};
use boa_string::JsString;

#[derive(Clone, Debug)]
pub(crate) enum EnumBasedValue {
    Undefined,
    Null,
    Boolean(bool),
    Integer32(i32),
    Float64(f64),
    BigInt(JsBigInt),
    Object(JsObject),
    Symbol(JsSymbol),
    String(JsString),
}

impl Finalize for EnumBasedValue {
    fn finalize(&self) {
        if let Some(o) = self.as_object() {
            o.finalize();
        }
    }
}

#[allow(unsafe_op_in_unsafe_fn)]
unsafe impl Trace for EnumBasedValue {
    custom_trace! {this, mark, {
        if let Some(o) = this.as_object() {
            mark(&o);
        }
    }}
}

impl EnumBasedValue {
    /// Returns a `InnerValue` from a Null.
    #[must_use]
    #[inline]
    pub(crate) const fn null() -> Self {
        Self::Null
    }

    /// Returns a `InnerValue` from an undefined.
    #[must_use]
    #[inline]
    pub(crate) const fn undefined() -> Self {
        Self::Undefined
    }

    /// Returns a `InnerValue` from a 64-bits float. If the float is `NaN`,
    /// it will be reduced to a canonical `NaN` representation.
    #[must_use]
    #[inline]
    pub(crate) const fn float64(value: f64) -> Self {
        Self::Float64(value)
    }

    /// Returns a `InnerValue` from a 32-bits integer.
    #[must_use]
    #[inline]
    pub(crate) const fn integer32(value: i32) -> Self {
        Self::Integer32(value)
    }

    /// Returns a `InnerValue` from a boolean.
    #[must_use]
    #[inline]
    pub(crate) const fn boolean(value: bool) -> Self {
        Self::Boolean(value)
    }

    /// Returns a `InnerValue` from a boxed `[JsBigInt]`.
    #[must_use]
    #[inline]
    pub(crate) fn bigint(value: JsBigInt) -> Self {
        Self::BigInt(value)
    }

    /// Returns a `InnerValue` from a boxed `[JsObject]`.
    #[must_use]
    #[inline]
    pub(crate) fn object(value: JsObject) -> Self {
        Self::Object(value)
    }

    /// Returns a `InnerValue` from a boxed `[JsSymbol]`.
    #[must_use]
    #[inline]
    pub(crate) fn symbol(value: JsSymbol) -> Self {
        Self::Symbol(value)
    }

    /// Returns a `InnerValue` from a boxed `[JsString]`.
    #[must_use]
    #[inline]
    pub(crate) fn string(value: JsString) -> Self {
        Self::String(value)
    }

    /// Returns true if a value is undefined.
    #[must_use]
    #[inline]
    pub(crate) const fn is_undefined(&self) -> bool {
        matches!(self, Self::Undefined)
    }

    /// Returns true if a value is null.
    #[must_use]
    #[inline]
    pub(crate) const fn is_null(&self) -> bool {
        matches!(self, Self::Null)
    }

    /// Returns true if a value is null or undefined.
    #[must_use]
    #[inline]
    pub(crate) const fn is_null_or_undefined(&self) -> bool {
        matches!(self, Self::Null | Self::Undefined)
    }

    /// Returns true if a value is a boolean.
    #[must_use]
    #[inline]
    pub(crate) const fn is_bool(&self) -> bool {
        matches!(self, Self::Boolean(_))
    }

    /// Returns true if a value is a 64-bits float.
    #[must_use]
    #[inline]
    pub(crate) const fn is_float64(&self) -> bool {
        matches!(self, Self::Float64(_))
    }

    /// Returns true if a value is negative zero (`-0`).
    #[must_use]
    #[inline]
    pub(crate) const fn is_negative_zero(&self) -> bool {
        matches!(self, Self::Float64(value) if value.to_bits() == (-0f64).to_bits())
    }

    /// Returns true if a value is a 32-bits integer.
    #[must_use]
    #[inline]
    pub(crate) const fn is_integer32(&self) -> bool {
        matches!(self, Self::Integer32(_))
    }

    /// Returns true if a value is a `[JsBigInt]`. A `NaN` will not match here.
    #[must_use]
    #[inline]
    pub(crate) const fn is_bigint(&self) -> bool {
        matches!(self, Self::BigInt(_))
    }

    /// Returns true if a value is a boxed Object.
    #[must_use]
    #[inline]
    pub(crate) const fn is_object(&self) -> bool {
        matches!(self, Self::Object(_))
    }

    /// Returns true if a value is a boxed Symbol.
    #[must_use]
    #[inline]
    pub(crate) const fn is_symbol(&self) -> bool {
        matches!(self, Self::Symbol(_))
    }

    /// Returns true if a value is a boxed String.
    #[must_use]
    #[inline]
    pub(crate) const fn is_string(&self) -> bool {
        matches!(self, Self::String(_))
    }

    /// Returns the [`Type`] of this value without cloning the inner value.
    #[must_use]
    #[inline]
    pub(crate) const fn get_type(&self) -> Type {
        match self {
            Self::Float64(_) | Self::Integer32(_) => Type::Number,
            Self::String(_) => Type::String,
            Self::Boolean(_) => Type::Boolean,
            Self::Symbol(_) => Type::Symbol,
            Self::Null => Type::Null,
            Self::Undefined => Type::Undefined,
            Self::BigInt(_) => Type::BigInt,
            Self::Object(_) => Type::Object,
        }
    }

    /// Returns the value as an f64 if it is a float.
    #[must_use]
    #[inline]
    pub(crate) const fn as_float64(&self) -> Option<f64> {
        match self {
            Self::Float64(value) => Some(*value),
            _ => None,
        }
    }

    /// Returns the value as an i32 if it is an integer.
    #[must_use]
    #[inline]
    pub(crate) const fn as_integer32(&self) -> Option<i32> {
        match self {
            Self::Integer32(value) => Some(*value),
            _ => None,
        }
    }

    /// Returns the value as a boolean if it is a boolean.
    #[must_use]
    #[inline]
    pub(crate) const fn as_bool(&self) -> Option<bool> {
        match self {
            Self::Boolean(value) => Some(*value),
            _ => None,
        }
    }

    /// Returns the value as a boxed `[JsBigInt]`.
    #[must_use]
    #[inline]
    pub(crate) fn as_bigint(&self) -> Option<JsBigInt> {
        match self {
            Self::BigInt(value) => Some(value.clone()),
            _ => None,
        }
    }

    /// Returns the value as a boxed `[JsObject]`.
    #[must_use]
    #[inline]
    pub(crate) fn as_object(&self) -> Option<JsObject> {
        match self {
            Self::Object(value) => Some(value.clone()),
            _ => None,
        }
    }

    /// Returns the value as a boxed `[JsSymbol]`.
    #[must_use]
    #[inline]
    pub(crate) fn as_symbol(&self) -> Option<JsSymbol> {
        match self {
            Self::Symbol(value) => Some(value.clone()),
            _ => None,
        }
    }

    /// Returns the value as a boxed `[JsString]`.
    #[must_use]
    #[inline]
    pub(crate) fn as_string(&self) -> Option<JsString> {
        match self {
            Self::String(value) => Some(value.clone()),
            _ => None,
        }
    }

    /// Converts the value to a boolean without cloning pointer types.
    #[must_use]
    #[inline]
    pub(crate) fn to_boolean(&self) -> bool {
        match self {
            Self::Symbol(_) => true,
            // Objects are truthy, unless they have [[IsHTMLDDA]] (Annex B §B.3.6.1).
            #[cfg(feature = "annex-b")]
            Self::Object(obj) if obj.is::<IsHTMLDDA>() => false,
            Self::Object(_) => true,
            Self::Null | Self::Undefined => false,
            Self::Integer32(n) => *n != 0,
            Self::Boolean(v) => *v,
            Self::String(s) => !s.is_empty(),
            Self::BigInt(n) => !n.is_zero(),
            Self::Float64(n) => *n != 0.0 && !n.is_nan(),
        }
    }

    /// Returns the `[JsVariant]` of this inner value.
    #[must_use]
    #[inline]
    pub(crate) fn as_variant(&self) -> JsVariant {
        match self {
            Self::Undefined => JsVariant::Undefined,
            Self::Null => JsVariant::Null,
            Self::Boolean(v) => JsVariant::Boolean(*v),
            Self::Integer32(v) => JsVariant::Integer32(*v),
            Self::Float64(v) => JsVariant::Float64(*v),
            Self::BigInt(v) => JsVariant::BigInt(v.clone()),
            Self::Object(v) => JsVariant::Object(v.clone()),
            Self::Symbol(v) => JsVariant::Symbol(v.clone()),
            Self::String(v) => JsVariant::String(v.clone()),
        }
    }
}
