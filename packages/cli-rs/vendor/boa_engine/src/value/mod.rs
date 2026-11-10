//! Boa's ECMAScript Value implementation.
//!
//! Javascript values, utility methods and conversion between Javascript values and Rust values.

use num_bigint::BigInt;
use num_integer::Integer;
use num_traits::{ToPrimitive, Zero};
use std::{ops::Sub, sync::LazyLock};

use boa_gc::{Finalize, Trace};
#[doc(inline)]
pub use boa_macros::TryFromJs;
pub use boa_macros::TryIntoJs;
#[doc(inline)]
pub use conversions::convert::Convert;
#[doc(inline)]
pub use conversions::nullable::Nullable;

pub(crate) use self::conversions::IntoOrUndefined;
#[doc(inline)]
pub use self::{
    conversions::try_from_js::TryFromJs, conversions::try_into_js::TryIntoJs,
    display::ValueDisplay, integer::IntegerOrInfinity, operations::*, r#type::Type,
    variant::JsVariant,
};
use crate::builtins::RegExp;
use crate::object::{JsFunction, JsPromise, JsRegExp};
use crate::{
    Context, JsBigInt, JsResult, JsString,
    builtins::{
        Number, Promise,
        number::{f64_to_int32, f64_to_uint32},
    },
    error::JsNativeError,
    js_string,
    object::JsObject,
    property::{PropertyDescriptor, PropertyKey},
    symbol::JsSymbol,
};

mod conversions;
pub(crate) mod display;
mod equality;
mod hash;
mod inner;
mod integer;
mod operations;
mod r#type;
mod variant;

#[cfg(test)]
mod tests;

static TWO_E_64: LazyLock<BigInt> = LazyLock::new(|| {
    const TWO_E_64: u128 = 2u128.pow(64);
    BigInt::from(TWO_E_64)
});

static TWO_E_63: LazyLock<BigInt> = LazyLock::new(|| {
    const TWO_E_63: u128 = 2u128.pow(63);
    BigInt::from(TWO_E_63)
});

/// The `js_value!` macro creates a `JsValue` instance based on a JSON-like DSL.
///
/// ```
/// # use boa_engine::{js_string, js_value, Context, JsValue};
/// # let context = &mut Context::default();
/// assert_eq!(js_value!( 1 ), JsValue::from(1));
/// assert_eq!(js_value!( false ), JsValue::from(false));
/// // Objects and arrays cannot be compared with simple equality.
/// // To create arrays and objects, the context needs to be passed in.
/// assert_eq!(js_value!([ 1, 2, 3 ], context).display().to_string(), "[ 1, 2, 3 ]");
/// assert_eq!(
///   js_value!({
///     // Comments are allowed inside.
///     "key": (js_string!("value"))
///   }, context).display().to_string(),
///   "{\n    key: \"value\"\n}",
/// );
/// ```
pub use boa_macros::js_object;

/// Create a `JsObject` object from a simpler DSL that resembles JSON.
///
/// ```
/// # use boa_engine::{js_string, js_object, Context, JsValue};
/// # let context = &mut Context::default();
/// let value = js_object!({
///   // Comments are allowed inside. String literals will always be transformed to `JsString`.
///   "key": "value",
///   // Identifiers will be used as keys, like in JavaScript.
///   alsoKey: 1,
///   // Expressions surrounded by brackets will be expressed, like in JavaScript.
///   // Note that in this case, the unit value is represented by `null`.
///   [1 + 2]: (),
/// }, context);
///
/// assert_eq!(
///     JsValue::from(value).display().to_string(),
///     "{\n    3: null,\n    key: \"value\",\n    alsoKey: 1\n}"
/// );
/// ```
pub use boa_macros::js_value;

/// A generic JavaScript value. This can be any ECMAScript language valid value.
///
/// This is a wrapper around the actual value, which is stored in an opaque type.
/// This allows for internal changes to the value without affecting the public API.
///
/// ```
/// # use boa_engine::{js_string, Context, JsValue};
/// let mut context = Context::default();
/// let value = JsValue::new(3);
/// assert_eq!(value.to_string(&mut context), Ok(js_string!("3")));
/// ```
#[derive(Finalize, Debug, Clone, Trace)]
pub struct JsValue(inner::InnerValue);

impl JsValue {
    /// Create a new [`JsValue`] from an inner value.
    #[inline]
    const fn from_inner(inner: inner::InnerValue) -> Self {
        Self(inner)
    }

    /// Create a new [`JsValue`].
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// let integer = JsValue::new(42);
    /// assert_eq!(integer.as_number(), Some(42.0));
    ///
    /// let float = JsValue::new(3.14);
    /// assert_eq!(float.as_number(), Some(3.14));
    ///
    /// let boolean = JsValue::new(true);
    /// assert_eq!(boolean.as_boolean(), Some(true));
    /// ```
    #[inline]
    #[must_use]
    pub fn new<T>(value: T) -> Self
    where
        T: Into<Self>,
    {
        value.into()
    }

    /// Return the variant of this value.
    ///
    /// This can be used to match on the underlying type of the value.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, value::JsVariant};
    ///
    /// let value = JsValue::new(42);
    /// match value.variant() {
    ///     JsVariant::Integer32(n) => assert_eq!(n, 42),
    ///     _ => unreachable!(),
    /// }
    ///
    /// let value = JsValue::undefined();
    /// assert!(matches!(value.variant(), JsVariant::Undefined));
    /// ```
    #[inline]
    #[must_use]
    pub fn variant(&self) -> JsVariant {
        self.0.as_variant()
    }

    /// Creates a new `undefined` value.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// let value = JsValue::undefined();
    /// assert!(value.is_undefined());
    /// assert!(value.is_null_or_undefined());
    /// assert_eq!(value.display().to_string(), "undefined");
    /// ```
    #[inline]
    #[must_use]
    pub const fn undefined() -> Self {
        Self::from_inner(inner::InnerValue::undefined())
    }

    /// Creates a new `null` value.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// let value = JsValue::null();
    /// assert!(value.is_null());
    /// assert!(value.is_null_or_undefined());
    /// assert_eq!(value.display().to_string(), "null");
    /// ```
    #[inline]
    #[must_use]
    pub const fn null() -> Self {
        Self::from_inner(inner::InnerValue::null())
    }

    /// Creates a new number with `NaN` value.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// let value = JsValue::nan();
    /// assert!(value.is_number());
    /// // NaN is not equal to itself.
    /// assert!(value.as_number().unwrap().is_nan());
    /// assert_eq!(value.display().to_string(), "NaN");
    /// ```
    #[inline]
    #[must_use]
    pub const fn nan() -> Self {
        Self::from_inner(inner::InnerValue::float64(f64::NAN))
    }

    /// Creates a new number with `Infinity` value.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// let value = JsValue::positive_infinity();
    /// assert!(value.is_number());
    /// assert_eq!(value.as_number(), Some(f64::INFINITY));
    /// assert_eq!(value.display().to_string(), "Infinity");
    /// ```
    #[inline]
    #[must_use]
    pub const fn positive_infinity() -> Self {
        Self::from_inner(inner::InnerValue::float64(f64::INFINITY))
    }

    /// Creates a new number with `-Infinity` value.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// let value = JsValue::negative_infinity();
    /// assert!(value.is_number());
    /// assert_eq!(value.as_number(), Some(f64::NEG_INFINITY));
    /// assert_eq!(value.display().to_string(), "-Infinity");
    /// ```
    #[inline]
    #[must_use]
    pub const fn negative_infinity() -> Self {
        Self::from_inner(inner::InnerValue::float64(f64::NEG_INFINITY))
    }

    /// Creates a new number from a float.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// let value = JsValue::rational(3.14);
    /// assert!(value.is_number());
    /// assert_eq!(value.as_number(), Some(3.14));
    ///
    /// // Can also represent special float values.
    /// let neg_zero = JsValue::rational(-0.0);
    /// assert!(neg_zero.is_number());
    /// ```
    // #[inline]
    #[must_use]
    pub fn rational(rational: f64) -> Self {
        Self::from_inner(inner::InnerValue::float64(rational))
    }

    /// Returns true if the value is an object.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, object::JsObject};
    ///
    /// let obj = JsValue::new(JsObject::with_null_proto());
    /// assert!(obj.is_object());
    ///
    /// let number = JsValue::new(42);
    /// assert!(!number.is_object());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_object(&self) -> bool {
        self.0.is_object()
    }

    /// Returns the object if the value is object, otherwise `None`.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, object::JsObject};
    ///
    /// let obj = JsValue::new(JsObject::with_null_proto());
    /// assert!(obj.as_object().is_some());
    ///
    /// let number = JsValue::new(42);
    /// assert!(number.as_object().is_none());
    /// ```
    #[inline]
    #[must_use]
    pub fn as_object(&self) -> Option<JsObject> {
        self.0.as_object()
    }

    /// Consumes the value and return the inner object if it was an object.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, object::JsObject};
    ///
    /// let obj = JsValue::new(JsObject::with_null_proto());
    /// let inner = obj.into_object();
    /// assert!(inner.is_some());
    ///
    /// let number = JsValue::new(42);
    /// assert!(number.into_object().is_none());
    /// ```
    #[inline]
    #[must_use]
    pub fn into_object(self) -> Option<JsObject> {
        self.0.as_object()
    }

    /// It determines if the value is a callable function with a `[[Call]]` internal method.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-iscallable
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{Context, JsValue, NativeFunction};
    ///
    /// let context = &mut Context::default();
    /// let native_fn = NativeFunction::from_copy_closure(|_, _, _| Ok(JsValue::undefined()));
    /// let js_value = JsValue::from(native_fn.to_js_function(context.realm()));
    /// assert!(js_value.is_callable());
    ///
    /// let number = JsValue::new(42);
    /// assert!(!number.is_callable());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_callable(&self) -> bool {
        self.as_object().as_ref().is_some_and(JsObject::is_callable)
    }

    /// Returns the callable value if the value is callable, otherwise `None`.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{Context, JsValue, NativeFunction};
    ///
    /// let context = &mut Context::default();
    /// let native_fn = NativeFunction::from_copy_closure(|_, _, _| Ok(JsValue::undefined()));
    /// let js_value = JsValue::from(native_fn.to_js_function(context.realm()));
    /// assert!(js_value.as_callable().is_some());
    ///
    /// let number = JsValue::new(42);
    /// assert!(number.as_callable().is_none());
    /// ```
    #[inline]
    #[must_use]
    pub fn as_callable(&self) -> Option<JsObject> {
        self.as_object().filter(JsObject::is_callable)
    }

    /// Returns a [`JsFunction`] if the value is callable, otherwise `None`.
    /// This is equivalent to `JsFunction::from_object(value.as_callable()?)`.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{Context, JsValue, NativeFunction};
    ///
    /// let context = &mut Context::default();
    /// let native_fn = NativeFunction::from_copy_closure(|_, _, _| Ok(JsValue::undefined()));
    /// let js_value = JsValue::from(native_fn.to_js_function(context.realm()));
    /// assert!(js_value.as_function().is_some());
    ///
    /// let number = JsValue::new(42);
    /// assert!(number.as_function().is_none());
    /// ```
    #[inline]
    #[must_use]
    pub fn as_function(&self) -> Option<JsFunction> {
        self.as_callable().and_then(JsFunction::from_object)
    }

    /// Returns true if the value is a constructor object.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{Context, JsValue, Source};
    ///
    /// let mut context = Context::default();
    /// // Classes and regular functions are constructors.
    /// let class = context.eval(Source::from_bytes(b"(class {})")).unwrap();
    /// assert!(class.is_constructor());
    ///
    /// // Arrow functions are not constructors.
    /// let arrow = context.eval(Source::from_bytes(b"(() => {})")).unwrap();
    /// assert!(!arrow.is_constructor());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_constructor(&self) -> bool {
        self.as_object()
            .as_ref()
            .is_some_and(JsObject::is_constructor)
    }

    /// Returns the constructor if the value is a constructor, otherwise `None`.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{Context, JsValue, Source};
    ///
    /// let mut context = Context::default();
    /// let class = context.eval(Source::from_bytes(b"(class {})")).unwrap();
    /// assert!(class.as_constructor().is_some());
    ///
    /// let number = JsValue::new(42);
    /// assert!(number.as_constructor().is_none());
    /// ```
    #[inline]
    #[must_use]
    pub fn as_constructor(&self) -> Option<JsObject> {
        self.as_object().filter(JsObject::is_constructor)
    }

    /// Returns true if the value is a promise object.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{Context, JsValue, object::builtins::JsPromise};
    ///
    /// let context = &mut Context::default();
    /// let (promise, _) = JsPromise::new_pending(context);
    /// let js_value = JsValue::from(promise);
    /// assert!(js_value.is_promise());
    ///
    /// let number = JsValue::new(42);
    /// assert!(!number.is_promise());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_promise(&self) -> bool {
        self.as_object().is_some_and(|obj| obj.is::<Promise>())
    }

    /// Returns the value as an object if the value is a promise, otherwise `None`.
    #[inline]
    #[must_use]
    pub(crate) fn as_promise_object(&self) -> Option<JsObject<Promise>> {
        self.as_object()
            .and_then(|obj| obj.downcast::<Promise>().ok())
    }

    /// Returns the value as a promise if the value is a promise, otherwise `None`.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{Context, JsValue, object::builtins::JsPromise};
    ///
    /// let context = &mut Context::default();
    /// let (promise, _) = JsPromise::new_pending(context);
    /// let js_value = JsValue::from(promise);
    /// assert!(js_value.as_promise().is_some());
    ///
    /// let number = JsValue::new(42);
    /// assert!(number.as_promise().is_none());
    /// ```
    #[inline]
    #[must_use]
    pub fn as_promise(&self) -> Option<JsPromise> {
        self.as_promise_object().map(JsPromise::from)
    }

    /// Returns true if the value is a regular expression object.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{Context, JsValue, js_string, object::builtins::JsRegExp};
    ///
    /// let context = &mut Context::default();
    /// let regexp = JsRegExp::new(js_string!("abc"), js_string!("g"), context).unwrap();
    /// let js_value = JsValue::from(regexp);
    /// assert!(js_value.is_regexp());
    ///
    /// let string = JsValue::new(js_string!("abc"));
    /// assert!(!string.is_regexp());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_regexp(&self) -> bool {
        self.as_object().is_some_and(|obj| obj.is::<RegExp>())
    }

    /// Returns the value as a regular expression if the value is a regexp, otherwise `None`.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{Context, JsValue, js_string, object::builtins::JsRegExp};
    ///
    /// let context = &mut Context::default();
    /// let regexp = JsRegExp::new(js_string!("abc"), js_string!("g"), context).unwrap();
    /// let js_value = JsValue::from(regexp);
    /// assert!(js_value.as_regexp().is_some());
    ///
    /// let number = JsValue::new(42);
    /// assert!(number.as_regexp().is_none());
    /// ```
    #[inline]
    #[must_use]
    pub fn as_regexp(&self) -> Option<JsRegExp> {
        self.as_object()
            .filter(|obj| obj.is::<RegExp>())
            .and_then(|o| JsRegExp::from_object(o).ok())
    }

    /// Returns true if the value is a symbol.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, JsSymbol};
    ///
    /// let sym = JsValue::new(JsSymbol::new(None).unwrap());
    /// assert!(sym.is_symbol());
    ///
    /// let string = JsValue::new(boa_engine::js_string!("hello"));
    /// assert!(!string.is_symbol());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_symbol(&self) -> bool {
        self.0.is_symbol()
    }

    /// Returns the symbol if the value is a symbol, otherwise `None`.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, JsSymbol};
    ///
    /// let sym = JsValue::new(JsSymbol::new(None).unwrap());
    /// assert!(sym.as_symbol().is_some());
    ///
    /// let number = JsValue::new(42);
    /// assert!(number.as_symbol().is_none());
    /// ```
    #[inline]
    #[must_use]
    pub fn as_symbol(&self) -> Option<JsSymbol> {
        self.0.as_symbol()
    }

    /// Returns true if the value is undefined.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// assert!(JsValue::undefined().is_undefined());
    /// assert!(!JsValue::null().is_undefined());
    /// assert!(!JsValue::new(0).is_undefined());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_undefined(&self) -> bool {
        self.0.is_undefined()
    }

    /// Returns true if the value is null.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// assert!(JsValue::null().is_null());
    /// assert!(!JsValue::undefined().is_null());
    /// assert!(!JsValue::new(0).is_null());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_null(&self) -> bool {
        self.0.is_null()
    }

    /// Returns true if the value is null or undefined.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// assert!(JsValue::null().is_null_or_undefined());
    /// assert!(JsValue::undefined().is_null_or_undefined());
    /// assert!(!JsValue::new(0).is_null_or_undefined());
    /// assert!(!JsValue::new(false).is_null_or_undefined());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_null_or_undefined(&self) -> bool {
        self.0.is_null_or_undefined()
    }

    /// Returns the number if the value is a finite integral Number value, otherwise `None`.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-isintegralnumber
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// // Integers are returned directly.
    /// assert_eq!(JsValue::new(42).as_i32(), Some(42));
    ///
    /// // Floats that are whole numbers also succeed.
    /// assert_eq!(JsValue::new(5.0).as_i32(), Some(5));
    ///
    /// // Non-integral floats return None.
    /// assert_eq!(JsValue::new(3.14).as_i32(), None);
    ///
    /// // Non-number types return None.
    /// assert_eq!(JsValue::new(true).as_i32(), None);
    /// ```
    #[inline]
    #[must_use]
    #[allow(clippy::float_cmp)]
    pub fn as_i32(&self) -> Option<i32> {
        if let Some(integer) = self.0.as_integer32() {
            return Some(integer);
        }

        if let Some(rational) = self.0.as_float64() {
            let int_val = rational as i32;
            // Use bitwise comparison to handle -0.0 correctly
            if rational.to_bits() == f64::from(int_val).to_bits() {
                return Some(int_val);
            }
        }
        None
    }

    /// Returns true if the value is a number.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// assert!(JsValue::new(42).is_number());
    /// assert!(JsValue::new(3.14).is_number());
    /// assert!(JsValue::nan().is_number());
    ///
    /// assert!(!JsValue::new(true).is_number());
    /// assert!(!JsValue::undefined().is_number());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_number(&self) -> bool {
        self.0.is_integer32() || self.0.is_float64()
    }

    /// Returns true if the value is a negative zero (`-0`).
    #[inline]
    #[must_use]
    pub(crate) fn is_negative_zero(&self) -> bool {
        self.0.is_negative_zero()
    }

    /// Returns the number if the value is a number, otherwise `None`.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// assert_eq!(JsValue::new(42).as_number(), Some(42.0));
    /// assert_eq!(JsValue::new(3.14).as_number(), Some(3.14));
    ///
    /// // Non-number types return None.
    /// assert_eq!(JsValue::null().as_number(), None);
    /// assert_eq!(JsValue::new(true).as_number(), None);
    /// ```
    #[inline]
    #[must_use]
    pub fn as_number(&self) -> Option<f64> {
        match self.variant() {
            JsVariant::Integer32(i) => Some(f64::from(i)),
            JsVariant::Float64(f) => Some(f),
            _ => None,
        }
    }

    /// Returns true if the value is a string.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, js_string};
    ///
    /// let s = JsValue::new(js_string!("hello"));
    /// assert!(s.is_string());
    ///
    /// let number = JsValue::new(42);
    /// assert!(!number.is_string());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_string(&self) -> bool {
        self.0.is_string()
    }

    /// Returns the string if the value is a string, otherwise `None`.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, js_string};
    ///
    /// let s = JsValue::new(js_string!("hello"));
    /// assert_eq!(s.as_string().map(|s| s == js_string!("hello")), Some(true));
    ///
    /// let number = JsValue::new(42);
    /// assert!(number.as_string().is_none());
    /// ```
    #[inline]
    #[must_use]
    pub fn as_string(&self) -> Option<JsString> {
        self.0.as_string()
    }

    /// Returns true if the value is a boolean.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// assert!(JsValue::new(true).is_boolean());
    /// assert!(JsValue::new(false).is_boolean());
    ///
    /// assert!(!JsValue::new(1).is_boolean());
    /// assert!(!JsValue::null().is_boolean());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_boolean(&self) -> bool {
        self.0.is_bool()
    }

    /// Returns the boolean if the value is a boolean, otherwise `None`.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// assert_eq!(JsValue::new(true).as_boolean(), Some(true));
    /// assert_eq!(JsValue::new(false).as_boolean(), Some(false));
    ///
    /// // Non-boolean types return None, even "truthy" or "falsy" ones.
    /// assert_eq!(JsValue::new(1).as_boolean(), None);
    /// assert_eq!(JsValue::new(0).as_boolean(), None);
    /// ```
    #[inline]
    #[must_use]
    pub fn as_boolean(&self) -> Option<bool> {
        self.0.as_bool()
    }

    /// Returns true if the value is a bigint.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, JsBigInt};
    ///
    /// let big = JsValue::new(JsBigInt::from(42));
    /// assert!(big.is_bigint());
    ///
    /// // Regular numbers are not bigints.
    /// let number = JsValue::new(42);
    /// assert!(!number.is_bigint());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_bigint(&self) -> bool {
        self.0.is_bigint()
    }

    /// Returns a `BigInt` if the value is a `BigInt` primitive.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, JsBigInt};
    ///
    /// let big = JsValue::new(JsBigInt::from(100));
    /// assert!(big.as_bigint().is_some());
    ///
    /// let number = JsValue::new(100);
    /// assert!(number.as_bigint().is_none());
    /// ```
    #[inline]
    #[must_use]
    pub fn as_bigint(&self) -> Option<JsBigInt> {
        self.0.as_bigint()
    }

    /// Converts the value to a `bool` type.
    ///
    /// More information:
    ///  - [ECMAScript][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-toboolean
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, js_string};
    ///
    /// // Numbers: 0 and NaN are false, everything else is true.
    /// assert!(!JsValue::new(0).to_boolean());
    /// assert!(!JsValue::nan().to_boolean());
    /// assert!(JsValue::new(1).to_boolean());
    /// assert!(JsValue::new(-1).to_boolean());
    ///
    /// // Strings: empty string is false, non-empty is true.
    /// assert!(!JsValue::new(js_string!("")).to_boolean());
    /// assert!(JsValue::new(js_string!("hello")).to_boolean());
    ///
    /// // null and undefined are always false.
    /// assert!(!JsValue::null().to_boolean());
    /// assert!(!JsValue::undefined().to_boolean());
    ///
    /// // Booleans pass through.
    /// assert!(JsValue::new(true).to_boolean());
    /// assert!(!JsValue::new(false).to_boolean());
    /// ```
    #[must_use]
    #[inline]
    pub fn to_boolean(&self) -> bool {
        self.0.to_boolean()
    }

    /// The abstract operation `ToPrimitive` takes an input argument and an optional argument
    /// `PreferredType`.
    ///
    /// <https://tc39.es/ecma262/#sec-toprimitive>
    #[inline]
    pub fn to_primitive(
        &self,
        context: &mut Context,
        preferred_type: PreferredType,
    ) -> JsResult<Self> {
        // 1. Assert: input is an ECMAScript language value. (always a value not need to check)
        // 2. If Type(input) is Object, then
        if let Some(o) = self.as_object() {
            return o.to_primitive(context, preferred_type);
        }

        // 3. Return input.
        Ok(self.clone())
    }

    /// `7.1.13 ToBigInt ( argument )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-tobigint
    pub fn to_bigint(&self, context: &mut Context) -> JsResult<JsBigInt> {
        match self.variant() {
            JsVariant::Null => Err(JsNativeError::typ()
                .with_message("cannot convert null to a BigInt")
                .into()),
            JsVariant::Undefined => Err(JsNativeError::typ()
                .with_message("cannot convert undefined to a BigInt")
                .into()),
            JsVariant::String(string) => JsBigInt::from_js_string(&string).map_or_else(
                || {
                    Err(JsNativeError::syntax()
                        .with_message(format!(
                            "cannot convert string '{}' to bigint primitive",
                            string.to_std_string_escaped()
                        ))
                        .into())
                },
                Ok,
            ),
            JsVariant::Boolean(true) => Ok(JsBigInt::one()),
            JsVariant::Boolean(false) => Ok(JsBigInt::zero()),
            JsVariant::Integer32(_) | JsVariant::Float64(_) => Err(JsNativeError::typ()
                .with_message("cannot convert Number to a BigInt")
                .into()),
            JsVariant::BigInt(b) => Ok(b),
            JsVariant::Object(o) => o
                .to_primitive(context, PreferredType::Number)?
                .to_bigint(context),
            JsVariant::Symbol(_) => Err(JsNativeError::typ()
                .with_message("cannot convert Symbol to a BigInt")
                .into()),
        }
    }

    /// Returns an object that implements `Display`.
    ///
    /// By default, the internals are not shown, but they can be toggled
    /// with [`ValueDisplay::internals`] method.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// let value = JsValue::new(3);
    ///
    /// println!("{}", value.display());
    /// ```
    #[must_use]
    #[inline]
    pub const fn display(&self) -> ValueDisplay<'_> {
        ValueDisplay {
            value: self,
            internals: false,
        }
    }

    /// Converts the value to a string.
    ///
    /// This function is equivalent to `String(value)` in JavaScript.
    pub fn to_string(&self, context: &mut Context) -> JsResult<JsString> {
        match self.variant() {
            JsVariant::Null => Ok(js_string!("null")),
            JsVariant::Undefined => Ok(js_string!("undefined")),
            JsVariant::Boolean(true) => Ok(js_string!("true")),
            JsVariant::Boolean(false) => Ok(js_string!("false")),
            JsVariant::Float64(rational) => Ok(JsString::from(rational)),
            JsVariant::Integer32(integer) => Ok(JsString::from(integer)),
            JsVariant::String(string) => Ok(string),
            JsVariant::Symbol(_) => Err(JsNativeError::typ()
                .with_message("Cannot convert a Symbol value to a string")
                .into()),
            JsVariant::BigInt(bigint) => Ok(bigint.to_string().into()),
            JsVariant::Object(o) => o
                .to_primitive(context, PreferredType::String)?
                .to_string(context),
        }
    }

    /// Converts the value to an Object.
    ///
    /// This function is equivalent to `Object(value)` in JavaScript.
    ///
    /// See: <https://tc39.es/ecma262/#sec-toobject>
    pub fn to_object(&self, context: &mut Context) -> JsResult<JsObject> {
        match self.variant() {
            JsVariant::Undefined | JsVariant::Null => Err(JsNativeError::typ()
                .with_message(crate::v8_messages::TO_OBJECT)
                .into()),
            JsVariant::Boolean(boolean) => Ok(context
                .intrinsics()
                .templates()
                .boolean()
                .create(boolean, Vec::default())),
            JsVariant::Integer32(integer) => Ok(context
                .intrinsics()
                .templates()
                .number()
                .create(f64::from(integer), Vec::default())),
            JsVariant::Float64(rational) => Ok(context
                .intrinsics()
                .templates()
                .number()
                .create(rational, Vec::default())),
            JsVariant::String(string) => {
                let len = string.len();
                Ok(context
                    .intrinsics()
                    .templates()
                    .string()
                    .create(string, vec![len.into()]))
            }
            JsVariant::Symbol(symbol) => Ok(context
                .intrinsics()
                .templates()
                .symbol()
                .create(symbol, Vec::default())),
            JsVariant::BigInt(bigint) => Ok(context
                .intrinsics()
                .templates()
                .bigint()
                .create(bigint, Vec::default())),
            JsVariant::Object(jsobject) => Ok(jsobject),
        }
    }

    pub(crate) fn base_class(&self, context: &Context) -> JsResult<JsObject> {
        let constructors = context.intrinsics().constructors();
        match self.variant() {
            JsVariant::Undefined | JsVariant::Null => Err(JsNativeError::typ()
                .with_message(crate::v8_messages::TO_OBJECT)
                .into()),
            JsVariant::Boolean(_) => Ok(constructors.boolean().prototype()),
            JsVariant::Integer32(_) | JsVariant::Float64(_) => {
                Ok(constructors.number().prototype())
            }
            JsVariant::String(_) => Ok(constructors.string().prototype()),
            JsVariant::Symbol(_) => Ok(constructors.symbol().prototype()),
            JsVariant::BigInt(_) => Ok(constructors.bigint().prototype()),
            JsVariant::Object(object) => Ok(object.clone()),
        }
    }

    /// Converts the value to a `PropertyKey`, that can be used as a key for properties.
    ///
    /// See <https://tc39.es/ecma262/#sec-topropertykey>
    pub fn to_property_key(&self, context: &mut Context) -> JsResult<PropertyKey> {
        match self.variant() {
            // fast path
            //
            // The compiler will surely make this a jump table, but in case it
            // doesn't, we put the "expected" property key types first
            // (integer, string, symbol), then the rest of the variants.
            JsVariant::Integer32(integer) => Ok(integer.into()),
            JsVariant::String(string) => Ok(string.into()),
            JsVariant::Symbol(symbol) => Ok(symbol.into()),

            // We also inline the call to `to_string`, removing the
            // double match against `self.variant()`.
            JsVariant::Float64(float) => Ok(JsString::from(float).into()),
            JsVariant::Undefined => Ok(js_string!("undefined").into()),
            JsVariant::Null => Ok(js_string!("null").into()),
            JsVariant::Boolean(true) => Ok(js_string!("true").into()),
            JsVariant::Boolean(false) => Ok(js_string!("false").into()),
            JsVariant::BigInt(bigint) => Ok(JsString::from(bigint.to_string()).into()),

            // slow path
            // Cannot infinitely recurse since it is guaranteed that `to_primitive` returns a non-object
            // value or errors.
            JsVariant::Object(o) => o
                .to_primitive(context, PreferredType::String)?
                .to_property_key(context),
        }
    }

    /// It returns value converted to a numeric value of type `Number` or `BigInt`.
    ///
    /// See: <https://tc39.es/ecma262/#sec-tonumeric>
    pub fn to_numeric(&self, context: &mut Context) -> JsResult<Numeric> {
        // 1. Let primValue be ? ToPrimitive(value, number).
        let primitive = self.to_primitive(context, PreferredType::Number)?;

        // 2. If primValue is a BigInt, return primValue.
        if let Some(bigint) = primitive.as_bigint() {
            return Ok(bigint.into());
        }

        // 3. Return ? ToNumber(primValue).
        Ok(primitive.to_number(context)?.into())
    }

    /// Converts a value to an integral 32-bit unsigned integer.
    ///
    /// This function is equivalent to `value | 0` in JavaScript
    ///
    /// See: <https://tc39.es/ecma262/#sec-touint32>
    pub fn to_u32(&self, context: &mut Context) -> JsResult<u32> {
        // This is the fast path, if the value is Integer we can just return it.
        if let Some(number) = self.0.as_integer32()
            && let Ok(number) = u32::try_from(number)
        {
            return Ok(number);
        }
        let number = self.to_number(context)?;

        Ok(f64_to_uint32(number))
    }

    /// Converts a value to an integral 32-bit signed integer.
    ///
    /// See: <https://tc39.es/ecma262/#sec-toint32>
    pub fn to_i32(&self, context: &mut Context) -> JsResult<i32> {
        // This is the fast path, if the value is Integer we can just return it.
        if let Some(number) = self.0.as_integer32() {
            return Ok(number);
        }
        let number = self.to_number(context)?;

        Ok(f64_to_int32(number))
    }

    /// `7.1.10 ToInt8 ( argument )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-toint8
    pub fn to_int8(&self, context: &mut Context) -> JsResult<i8> {
        // 1. Let number be ? ToNumber(argument).
        let number = self.to_number(context)?;

        // 2. If number is NaN, +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return +0𝔽.
        if number.is_nan() || number.is_zero() || number.is_infinite() {
            return Ok(0);
        }

        // 3. Let int be the mathematical value whose sign is the sign of number and whose magnitude is floor(abs(ℝ(number))).
        let int = number.abs().floor().copysign(number) as i64;

        // 4. Let int8bit be int modulo 2^8.
        let int_8_bit = int % 2i64.pow(8);

        // 5. If int8bit ≥ 2^7, return 𝔽(int8bit - 2^8); otherwise return 𝔽(int8bit).
        if int_8_bit >= 2i64.pow(7) {
            Ok((int_8_bit - 2i64.pow(8)) as i8)
        } else {
            Ok(int_8_bit as i8)
        }
    }

    /// `7.1.11 ToUint8 ( argument )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-touint8
    pub fn to_uint8(&self, context: &mut Context) -> JsResult<u8> {
        // 1. Let number be ? ToNumber(argument).
        let number = self.to_number(context)?;

        // 2. If number is NaN, +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return +0𝔽.
        if number.is_nan() || number.is_zero() || number.is_infinite() {
            return Ok(0);
        }

        // 3. Let int be the mathematical value whose sign is the sign of number and whose magnitude is floor(abs(ℝ(number))).
        let int = number.abs().floor().copysign(number) as i64;

        // 4. Let int8bit be int modulo 2^8.
        let int_8_bit = int % 2i64.pow(8);

        // 5. Return 𝔽(int8bit).
        Ok(int_8_bit as u8)
    }

    /// `7.1.12 ToUint8Clamp ( argument )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-touint8clamp
    pub fn to_uint8_clamp(&self, context: &mut Context) -> JsResult<u8> {
        // 1. Let number be ? ToNumber(argument).
        let number = self.to_number(context)?;

        // 2. If number is NaN, return +0𝔽.
        if number.is_nan() {
            return Ok(0);
        }

        // 3. If ℝ(number) ≤ 0, return +0𝔽.
        if number <= 0.0 {
            return Ok(0);
        }

        // 4. If ℝ(number) ≥ 255, return 255𝔽.
        if number >= 255.0 {
            return Ok(255);
        }

        // 5. Let f be floor(ℝ(number)).
        let f = number.floor();

        // 6. If f + 0.5 < ℝ(number), return 𝔽(f + 1).
        if f + 0.5 < number {
            return Ok(f as u8 + 1);
        }

        // 7. If ℝ(number) < f + 0.5, return 𝔽(f).
        if number < f + 0.5 {
            return Ok(f as u8);
        }

        // 8. If f is odd, return 𝔽(f + 1).
        if !(f as u8).is_multiple_of(2) {
            return Ok(f as u8 + 1);
        }

        // 9. Return 𝔽(f).
        Ok(f as u8)
    }

    /// `7.1.8 ToInt16 ( argument )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-toint16
    pub fn to_int16(&self, context: &mut Context) -> JsResult<i16> {
        // 1. Let number be ? ToNumber(argument).
        let number = self.to_number(context)?;

        // 2. If number is NaN, +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return +0𝔽.
        if number.is_nan() || number.is_zero() || number.is_infinite() {
            return Ok(0);
        }

        // 3. Let int be the mathematical value whose sign is the sign of number and whose magnitude is floor(abs(ℝ(number))).
        let int = number.abs().floor().copysign(number) as i64;

        // 4. Let int16bit be int modulo 2^16.
        let int_16_bit = int % 2i64.pow(16);

        // 5. If int16bit ≥ 2^15, return 𝔽(int16bit - 2^16); otherwise return 𝔽(int16bit).
        if int_16_bit >= 2i64.pow(15) {
            Ok((int_16_bit - 2i64.pow(16)) as i16)
        } else {
            Ok(int_16_bit as i16)
        }
    }

    /// `7.1.9 ToUint16 ( argument )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-touint16
    pub fn to_uint16(&self, context: &mut Context) -> JsResult<u16> {
        // 1. Let number be ? ToNumber(argument).
        let number = self.to_number(context)?;

        // 2. If number is NaN, +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return +0𝔽.
        if number.is_nan() || number.is_zero() || number.is_infinite() {
            return Ok(0);
        }

        // 3. Let int be the mathematical value whose sign is the sign of number and whose magnitude is floor(abs(ℝ(number))).
        let int = number.abs().floor().copysign(number) as i64;

        // 4. Let int16bit be int modulo 2^16.
        let int_16_bit = int % 2i64.pow(16);

        // 5. Return 𝔽(int16bit).
        Ok(int_16_bit as u16)
    }

    /// `7.1.15 ToBigInt64 ( argument )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-tobigint64
    pub fn to_big_int64(&self, context: &mut Context) -> JsResult<i64> {
        // 1. Let n be ? ToBigInt(argument).
        let n = self.to_bigint(context)?;

        // 2. Let int64bit be ℝ(n) modulo 2^64.
        let int64_bit = n.as_inner().mod_floor(&TWO_E_64);

        // 3. If int64bit ≥ 2^63, return ℤ(int64bit - 2^64); otherwise return ℤ(int64bit).
        let value = if int64_bit >= *TWO_E_63 {
            int64_bit.sub(&*TWO_E_64)
        } else {
            int64_bit
        };

        Ok(value
            .to_i64()
            .expect("should be within the range of `i64` by the mod operation"))
    }

    /// `7.1.16 ToBigUint64 ( argument )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-tobiguint64
    pub fn to_big_uint64(&self, context: &mut Context) -> JsResult<u64> {
        // 1. Let n be ? ToBigInt(argument).
        let n = self.to_bigint(context)?;

        // 2. Let int64bit be ℝ(n) modulo 2^64.
        // 3. Return ℤ(int64bit).
        Ok(n.as_inner()
            .mod_floor(&TWO_E_64)
            .to_u64()
            .expect("should be within the range of `u64` by the mod operation"))
    }

    /// Converts a value to a non-negative integer if it is a valid integer index value.
    ///
    /// See: <https://tc39.es/ecma262/#sec-toindex>
    pub fn to_index(&self, context: &mut Context) -> JsResult<u64> {
        // 1. If value is undefined, then
        if self.is_undefined() {
            // a. Return 0.
            return Ok(0);
        }

        // 2. Else,
        // a. Let integer be ? ToIntegerOrInfinity(value).
        let integer = self.to_integer_or_infinity(context)?;

        // b. Let clamped be ! ToLength(𝔽(integer)).
        let clamped = integer.clamp_finite(0, Number::MAX_SAFE_INTEGER as i64);

        // c. If ! SameValue(𝔽(integer), clamped) is false, throw a RangeError exception.
        if integer != clamped {
            return Err(JsNativeError::range()
                .with_message("Index must be between 0 and  2^53 - 1")
                .into());
        }

        // d. Assert: 0 ≤ integer ≤ 2^53 - 1.
        debug_assert!(0 <= clamped && clamped <= Number::MAX_SAFE_INTEGER as i64);

        // e. Return integer.
        Ok(clamped as u64)
    }

    /// Converts argument to an integer suitable for use as the length of an array-like object.
    ///
    /// See: <https://tc39.es/ecma262/#sec-tolength>
    pub fn to_length(&self, context: &mut Context) -> JsResult<u64> {
        // 1. Let len be ? ToInteger(argument).
        // 2. If len ≤ +0, return +0.
        // 3. Return min(len, 2^53 - 1).
        Ok(self
            .to_integer_or_infinity(context)?
            .clamp_finite(0, Number::MAX_SAFE_INTEGER as i64) as u64)
    }

    /// Abstract operation `ToIntegerOrInfinity ( argument )`
    ///
    /// This method converts a `Value` to an integer representing its `Number` value with
    /// fractional part truncated, or to +∞ or -∞ when that `Number` value is infinite.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-tointegerorinfinity
    pub fn to_integer_or_infinity(&self, context: &mut Context) -> JsResult<IntegerOrInfinity> {
        // 1. Let number be ? ToNumber(argument).
        let number = self.to_number(context)?;

        // Continues on `IntegerOrInfinity::from::<f64>`
        Ok(IntegerOrInfinity::from(number))
    }

    /// Converts a value to a double precision floating point.
    ///
    /// This function is equivalent to the unary `+` operator (`+value`) in JavaScript
    ///
    /// See: <https://tc39.es/ecma262/#sec-tonumber>
    pub fn to_number(&self, context: &mut Context) -> JsResult<f64> {
        match self.variant() {
            JsVariant::Null => Ok(0.0),
            JsVariant::Undefined => Ok(f64::NAN),
            JsVariant::Boolean(b) => Ok(if b { 1.0 } else { 0.0 }),
            JsVariant::String(string) => Ok(string.to_number()),
            JsVariant::Float64(number) => Ok(number),
            JsVariant::Integer32(integer) => Ok(f64::from(integer)),
            JsVariant::Symbol(_) => Err(JsNativeError::typ()
                .with_message("argument must not be a symbol")
                .into()),
            JsVariant::BigInt(_) => Err(JsNativeError::typ()
                .with_message("argument must not be a bigint")
                .into()),
            JsVariant::Object(_) => {
                let primitive = self.to_primitive(context, PreferredType::Number)?;
                primitive.to_number(context)
            }
        }
    }

    /// Converts a value to a 16-bit floating point.
    #[cfg(feature = "float16")]
    pub fn to_f16(&self, context: &mut Context) -> JsResult<float16::f16> {
        self.to_number(context).map(float16::f16::from_f64)
    }

    /// Converts a value to a 32 bit floating point.
    pub fn to_f32(&self, context: &mut Context) -> JsResult<f32> {
        self.to_number(context).map(|n| n as f32)
    }

    /// This is a more specialized version of `to_numeric`, including `BigInt`.
    ///
    /// This function is equivalent to `Number(value)` in JavaScript
    ///
    /// See: <https://tc39.es/ecma262/#sec-tonumeric>
    pub fn to_numeric_number(&self, context: &mut Context) -> JsResult<f64> {
        let primitive = self.to_primitive(context, PreferredType::Number)?;
        if let Some(bigint) = primitive.as_bigint() {
            return Ok(bigint.to_f64());
        }
        primitive.to_number(context)
    }

    /// Check if the `Value` can be converted to an `Object`
    ///
    /// The abstract operation `RequireObjectCoercible` takes argument argument.
    /// It throws an error if argument is a value that cannot be converted to an Object using `ToObject`.
    /// It is defined by [Table 15][table]
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [table]: https://tc39.es/ecma262/#table-14
    /// [spec]: https://tc39.es/ecma262/#sec-requireobjectcoercible
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::JsValue;
    ///
    /// // Most values are object-coercible.
    /// assert!(JsValue::new(42).require_object_coercible().is_ok());
    /// assert!(JsValue::new(true).require_object_coercible().is_ok());
    ///
    /// // null and undefined are not.
    /// assert!(JsValue::null().require_object_coercible().is_err());
    /// assert!(JsValue::undefined().require_object_coercible().is_err());
    /// ```
    #[inline]
    pub fn require_object_coercible(&self) -> JsResult<&Self> {
        if self.is_null_or_undefined() {
            Err(JsNativeError::typ()
                .with_message("cannot convert null or undefined to Object")
                .into())
        } else {
            Ok(self)
        }
    }

    /// The abstract operation `ToPropertyDescriptor`.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-topropertydescriptor
    #[inline]
    pub fn to_property_descriptor(&self, context: &mut Context) -> JsResult<PropertyDescriptor> {
        // 1. If Type(Obj) is not Object, throw a TypeError exception.
        self.as_object()
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("Cannot construct a property descriptor from a non-object")
                    .into()
            })
            .and_then(|obj| obj.to_property_descriptor(context))
    }

    /// `typeof` operator. Returns a string representing the type of the
    /// given ECMA Value.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-typeof-operator
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, js_string, JsSymbol};
    ///
    /// assert_eq!(JsValue::undefined().type_of(), "undefined");
    /// assert_eq!(JsValue::null().type_of(), "object");
    /// assert_eq!(JsValue::new(true).type_of(), "boolean");
    /// assert_eq!(JsValue::new(42).type_of(), "number");
    /// assert_eq!(JsValue::new(js_string!("hi")).type_of(), "string");
    /// assert_eq!(JsValue::new(JsSymbol::new(None).unwrap()).type_of(), "symbol");
    /// ```
    #[must_use]
    pub fn type_of(&self) -> &'static str {
        self.variant().type_of()
    }

    /// Same as [`JsValue::type_of`], but returning a [`JsString`] instead.
    ///
    /// # Examples
    ///
    /// ```
    /// use boa_engine::{JsValue, js_string};
    ///
    /// assert_eq!(JsValue::new(42).js_type_of(), js_string!("number"));
    /// assert_eq!(JsValue::new(true).js_type_of(), js_string!("boolean"));
    /// assert_eq!(JsValue::undefined().js_type_of(), js_string!("undefined"));
    /// ```
    #[must_use]
    pub fn js_type_of(&self) -> JsString {
        self.variant().js_type_of()
    }

    /// Maps a `JsValue` into `Option<T>` where T is the result of an
    /// operation on a defined value. If the value is `JsValue::undefined`,
    /// then `JsValue::map` will return None.
    ///
    /// # Example
    ///
    /// ```
    /// use boa_engine::{Context, JsValue};
    ///
    /// let mut context = Context::default();
    ///
    /// let defined_value = JsValue::from(5);
    /// let undefined = JsValue::undefined();
    ///
    /// let defined_result = defined_value
    ///     .map(|v| v.add(&JsValue::from(5), &mut context))
    ///     .transpose()
    ///     .unwrap();
    /// let undefined_result = undefined
    ///     .map(|v| v.add(&JsValue::from(5), &mut context))
    ///     .transpose()
    ///     .unwrap();
    ///
    /// assert_eq!(defined_result, Some(JsValue::from(10u8)));
    /// assert_eq!(undefined_result, None);
    /// ```
    #[inline]
    #[must_use]
    pub fn map<T, F>(&self, f: F) -> Option<T>
    where
        F: FnOnce(&JsValue) -> T,
    {
        if self.is_undefined() {
            return None;
        }
        Some(f(self))
    }

    /// Maps a `JsValue` into `T` where T is the result of an
    /// operation on a defined value. If the value is `JsValue::undefined`,
    /// then `JsValue::map` will return the provided default value.
    ///
    /// # Example
    ///
    /// ```
    /// use boa_engine::{Context, JsValue};
    ///
    /// let mut context = Context::default();
    ///
    /// let defined_value = JsValue::from(5);
    /// let undefined = JsValue::undefined();
    ///
    /// let defined_result = defined_value
    ///     .map_or(Ok(JsValue::new(true)), |v| {
    ///         v.add(&JsValue::from(5), &mut context)
    ///     })
    ///     .unwrap();
    /// let undefined_result = undefined
    ///     .map_or(Ok(JsValue::new(true)), |v| {
    ///         v.add(&JsValue::from(5), &mut context)
    ///     })
    ///     .unwrap();
    ///
    /// assert_eq!(defined_result, JsValue::new(10));
    /// assert_eq!(undefined_result, JsValue::new(true));
    /// ```
    #[inline]
    #[must_use]
    pub fn map_or<T, F>(&self, default: T, f: F) -> T
    where
        F: FnOnce(&JsValue) -> T,
    {
        if self.is_undefined() {
            return default;
        }
        f(self)
    }

    /// Abstract operation `IsArray ( argument )`
    ///
    /// Check if a value is an array.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-isarray
    pub(crate) fn is_array(&self) -> JsResult<bool> {
        // Note: The spec specifies this function for JsValue.
        // The main part of the function is implemented for JsObject.

        // 1. If Type(argument) is not Object, return false.
        self.as_object()
            .as_ref()
            .map_or(Ok(false), JsObject::is_array_abstract)
    }
}

impl Default for JsValue {
    fn default() -> Self {
        Self::undefined()
    }
}

/// The preferred type to convert an object to a primitive `Value`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PreferredType {
    /// Prefer to convert to a `String` primitive.
    String,

    /// Prefer to convert to a `Number` primitive.
    Number,

    /// Do not prefer a type to convert to.
    Default,
}

/// Numeric value which can be of two types `Number`, `BigInt`.
#[derive(Debug, Clone, PartialEq, PartialOrd)]
pub enum Numeric {
    /// Double precision floating point number.
    Number(f64),
    /// `BigInt` an integer of arbitrary size.
    BigInt(JsBigInt),
}

impl From<f64> for Numeric {
    #[inline]
    fn from(value: f64) -> Self {
        Self::Number(value)
    }
}

impl From<f32> for Numeric {
    #[inline]
    fn from(value: f32) -> Self {
        Self::Number(value.into())
    }
}

impl From<i64> for Numeric {
    #[inline]
    fn from(value: i64) -> Self {
        Self::BigInt(value.into())
    }
}

impl From<i32> for Numeric {
    #[inline]
    fn from(value: i32) -> Self {
        Self::Number(value.into())
    }
}

impl From<i16> for Numeric {
    #[inline]
    fn from(value: i16) -> Self {
        Self::Number(value.into())
    }
}

impl From<i8> for Numeric {
    #[inline]
    fn from(value: i8) -> Self {
        Self::Number(value.into())
    }
}

impl From<u64> for Numeric {
    #[inline]
    fn from(value: u64) -> Self {
        Self::BigInt(value.into())
    }
}

impl From<u32> for Numeric {
    #[inline]
    fn from(value: u32) -> Self {
        Self::Number(value.into())
    }
}

impl From<u16> for Numeric {
    #[inline]
    fn from(value: u16) -> Self {
        Self::Number(value.into())
    }
}

impl From<u8> for Numeric {
    #[inline]
    fn from(value: u8) -> Self {
        Self::Number(value.into())
    }
}

impl From<JsBigInt> for Numeric {
    #[inline]
    fn from(value: JsBigInt) -> Self {
        Self::BigInt(value)
    }
}

impl From<Numeric> for JsValue {
    fn from(value: Numeric) -> Self {
        match value {
            Numeric::Number(number) => Self::new(number),
            Numeric::BigInt(bigint) => Self::new(bigint),
        }
    }
}
