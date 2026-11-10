//! Types and functions for applying JavaScript Convert rules to [`JsValue`] when
//! converting. See <https://262.ecma-international.org/5.1/#sec-9> (Section 9) for
//! conversion rules of JavaScript types.
//!
//! Some conversions are not specified in the spec (e.g. integer conversions),
//! and we apply rules that make sense (e.g. converting to Number and rounding
//! if necessary).

use boa_engine::JsNativeError;
use boa_gc::{Finalize, Trace};

use crate::value::TryFromJs;
use crate::{Context, JsData, JsResult, JsString, JsValue};

/// A wrapper type that allows converting a `JsValue` to a specific type.
/// This is useful when you want to convert a `JsValue` to a Rust type.
///
/// # Example
/// Convert a string to number.
/// ```
/// # use boa_engine::{Context, js_string, JsValue};
/// # use boa_engine::value::{Convert, TryFromJs};
/// # let mut context = Context::default();
/// let value = JsValue::from(js_string!("42"));
/// let Convert(converted): Convert<i32> =
///     Convert::try_from_js(&value, &mut context).unwrap();
///
/// assert_eq!(converted, 42);
/// ```
///
/// Convert a number to a bool.
/// ```
/// # use boa_engine::{Context, js_string, JsValue};
/// # use boa_engine::value::{Convert, TryFromJs};
/// # let mut context = Context::default();
/// let Convert(conv0): Convert<bool> =
///     Convert::try_from_js(&JsValue::new(0), &mut context).unwrap();
/// let Convert(conv5): Convert<bool> =
///     Convert::try_from_js(&JsValue::new(5), &mut context).unwrap();
/// let Convert(conv_nan): Convert<bool> =
///     Convert::try_from_js(&JsValue::new(f64::NAN), &mut context).unwrap();
///
/// assert_eq!(conv0, false);
/// assert_eq!(conv5, true);
/// assert_eq!(conv_nan, false);
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Trace, Finalize, JsData)]
pub struct Convert<T: TryFromJs>(pub T);

impl<T: TryFromJs> From<T> for Convert<T> {
    fn from(value: T) -> Self {
        Self(value)
    }
}

impl<T: TryFromJs> AsRef<T> for Convert<T> {
    fn as_ref(&self) -> &T {
        &self.0
    }
}

macro_rules! decl_convert_to_int {
    ($($ty:ty),*) => {
        $(
            impl TryFromJs for Convert<$ty> {
                fn try_from_js(value: &JsValue, context: &mut Context) -> JsResult<Self> {
                    value.to_numeric_number(context).and_then(|num| {
                        if num.is_finite() {
                            if num >= f64::from(<$ty>::MAX) {
                                Err(JsNativeError::typ()
                                    .with_message("cannot convert value to integer, it is too large")
                                    .into())
                            } else if num <= f64::from(<$ty>::MIN) {
                                Err(JsNativeError::typ()
                                    .with_message("cannot convert value to integer, it is too small")
                                    .into())
                                // Only round if it differs from the next integer by an epsilon
                            } else if num.abs().fract() >= (1.0 - f64::EPSILON) {
                                Ok(Convert(num.round() as $ty))
                            } else {
                                Ok(Convert(num as $ty))
                            }
                        } else if num.is_nan() {
                            Err(JsNativeError::typ()
                                .with_message("cannot convert NaN to integer")
                                .into())
                        } else if num.is_infinite() {
                            Err(JsNativeError::typ()
                                .with_message("cannot convert Infinity to integer")
                                .into())
                        } else {
                            Err(JsNativeError::typ()
                                .with_message("cannot convert non-finite number to integer")
                                .into())
                        }
                    })
                }
            }
        )*
    };
}

decl_convert_to_int!(i8, i16, i32, u8, u16, u32);

macro_rules! decl_convert_to_float {
    ($($ty:ty),*) => {
        $(
            impl TryFromJs for Convert<$ty> {
                fn try_from_js(value: &JsValue, context: &mut Context) -> JsResult<Self> {
                    value.to_numeric_number(context).and_then(|num| Ok(Convert(<$ty>::try_from(num).map_err(|_| {
                        JsNativeError::typ()
                            .with_message("cannot convert value to float")
                    })?)))
                }
            }
        )*
    };
}

decl_convert_to_float!(f64);

impl TryFromJs for Convert<String> {
    fn try_from_js(value: &JsValue, context: &mut Context) -> JsResult<Self> {
        value
            .to_string(context)
            .and_then(|s| s.to_std_string().map_err(|_| JsNativeError::typ().into()))
            .map(Convert)
    }
}

impl TryFromJs for Convert<JsString> {
    fn try_from_js(value: &JsValue, context: &mut Context) -> JsResult<Self> {
        value.to_string(context).map(Convert)
    }
}

impl TryFromJs for Convert<bool> {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        Ok(Self(value.to_boolean()))
    }
}
