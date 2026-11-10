//! Conversions from JavaScript values into Rust values, and the other way around.

use super::{JsBigInt, JsObject, JsString, JsSymbol, JsValue};
use crate::NativeObject;
use crate::value::inner::InnerValue;
use crate::{js_string, string::JsStr};

mod either;
pub(super) mod nullable;
mod serde_json;
pub(super) mod try_from_js;
pub(super) mod try_into_js;

pub(super) mod convert;

impl From<JsStr<'_>> for JsValue {
    fn from(value: JsStr<'_>) -> Self {
        Self::from_inner(InnerValue::string(value.into()))
    }
}

impl From<JsString> for JsValue {
    fn from(value: JsString) -> Self {
        Self::from_inner(InnerValue::string(value))
    }
}

impl From<char> for JsValue {
    #[inline]
    fn from(value: char) -> Self {
        let mut buf: [u16; 2] = [0; 2];

        let out = value.encode_utf16(&mut buf);

        Self::from(js_string!(&*out))
    }
}

impl From<JsSymbol> for JsValue {
    #[inline]
    fn from(value: JsSymbol) -> Self {
        Self::from_inner(InnerValue::symbol(value))
    }
}

impl From<f32> for JsValue {
    #[inline]
    fn from(value: f32) -> Self {
        Self::rational(f64::from(value))
    }
}

impl From<f64> for JsValue {
    #[inline]
    fn from(value: f64) -> Self {
        Self::rational(value)
    }
}

macro_rules! impl_from_integer {
    ( $( $type_:ty ),* ) => {
        $(
            impl From<$type_> for JsValue {
                #[inline]
                #[allow(clippy::cast_lossless)]
                fn from(value: $type_) -> Self {

                    i32::try_from(value)
                        .map_or_else(
                            |_| Self::rational(value as f64),
                            |value| Self::from_inner(InnerValue::integer32(value)),
                        )
                }
            }
        )*
    };
}

impl_from_integer!(u8, i8, u16, i16, u32, i32, u64, i64, usize, isize);

impl From<JsBigInt> for JsValue {
    #[inline]
    fn from(value: JsBigInt) -> Self {
        Self::from_inner(InnerValue::bigint(value))
    }
}

impl From<bool> for JsValue {
    #[inline]
    fn from(value: bool) -> Self {
        Self::from_inner(InnerValue::boolean(value))
    }
}

impl<T: NativeObject> From<JsObject<T>> for JsValue {
    #[inline]
    fn from(object: JsObject<T>) -> Self {
        Self::from_inner(InnerValue::object(object.upcast()))
    }
}

impl From<()> for JsValue {
    #[inline]
    #[allow(clippy::pedantic)] // didn't want to increase our MSRV for just a lint.
    fn from((): ()) -> Self {
        Self::null()
    }
}

/// Converts an `Option<T>` into a `JsValue`.
///
/// It will convert the `None` variant to `JsValue::undefined()`, and the `Some()` variant into a
/// `JsValue` using the `Into` trait.
pub(crate) trait IntoOrUndefined {
    /// Converts an `Option<T>` into a `JsValue`.
    fn into_or_undefined(self) -> JsValue;
}

impl<T> IntoOrUndefined for Option<T>
where
    T: Into<JsValue>,
{
    #[inline]
    fn into_or_undefined(self) -> JsValue {
        match self {
            Some(value) => value.into(),
            None => JsValue::undefined(),
        }
    }
}
