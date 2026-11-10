//! This module contains the [`js_string`][crate::js_string] macro and the
//! [`js_str`][crate::js_str] macro.
//!
//! The [`js_string`][crate::js_string] macro is used when you need to create a new [`JsString`],
//! and the [`js_str`][crate::js_str] macro is used for const conversions of string literals to [`JsStr`].

#[doc(inline)]
pub use boa_string::*;

/// Utility macro to create a [`JsString`].
///
/// # Examples
///
/// You can call the macro without arguments to create an empty `JsString`:
///
/// ```
/// use boa_engine::js_string;
///
/// let empty_str = js_string!();
/// assert!(empty_str.is_empty());
/// ```
///
///
/// You can create a `JsString` from a string literal, which completely skips the runtime
/// conversion from [`&str`] to <code>[&\[u16\]][slice]</code>:
///
/// ```
/// # use boa_engine::js_string;
/// let hw = js_string!("Hello, world!");
/// assert_eq!(&hw, "Hello, world!");
/// ```
///
/// Any `&[u16]` slice is a valid `JsString`, including unpaired surrogates:
///
/// ```
/// # use boa_engine::js_string;
/// let array = js_string!(&[0xD8AFu16, 0x00A0, 0xD8FF, 0x00F0]);
/// ```
///
/// You can also pass it any number of `&[u16]` as arguments to create a new `JsString` with
/// the concatenation of every slice:
///
/// ```
/// # use boa_engine::{js_string, js_str, JsStr};
/// const NAME: JsStr<'_> = js_str!("human! ");
/// let greeting = js_string!("Hello, ");
/// let msg = js_string!(&greeting, NAME, js_str!("Nice to meet you!"));
///
/// assert_eq!(&msg, "Hello, human! Nice to meet you!");
/// ```
#[macro_export]
#[allow(clippy::module_name_repetitions)]
macro_rules! js_string {
    () => {
        $crate::string::JsString::default()
    };
    ($s:literal) => {const {
        const LITERAL: $crate::string::StaticString = $crate::string::StaticString::new($crate::js_str!($s));
        $crate::string::JsString::from_static(&LITERAL)
    }};
    ($s:expr) => {
        $crate::string::JsString::from($s)
    };
    ( $x:expr, $y:expr ) => {
        $crate::string::JsString::concat($crate::string::JsStr::from($x), $crate::string::JsStr::from($y))
    };
    ( $( $s:expr ),+ ) => {
        $crate::string::JsString::concat_array(&[ $( $crate::string::JsStr::from($s) ),+ ])
    };
}

#[allow(clippy::redundant_clone)]
#[cfg(test)]
mod tests {
    use std::hash::{BuildHasher, BuildHasherDefault, Hash};

    use crate::{JsStr, string::StaticJsStrings};

    use super::JsString;
    use boa_macros::{js_str, utf16};
    use rustc_hash::FxHasher;

    fn hash_value<T: Hash>(value: &T) -> u64 {
        BuildHasherDefault::<FxHasher>::default().hash_one(value)
    }

    #[test]
    fn empty() {
        let s = js_string!();
        assert_eq!(&s, utf16!(""));
    }

    #[test]
    fn refcount() {
        let x = js_string!("Hello world");
        assert_eq!(x.refcount(), None);

        let x = js_string!("你好");
        assert_eq!(x.refcount(), None);

        let x = js_string!("Hello world".to_string());
        assert_eq!(x.refcount(), Some(1));

        {
            let y = x.clone();
            assert_eq!(x.refcount(), Some(2));
            assert_eq!(y.refcount(), Some(2));

            {
                let z = y.clone();
                assert_eq!(x.refcount(), Some(3));
                assert_eq!(y.refcount(), Some(3));
                assert_eq!(z.refcount(), Some(3));
            }

            assert_eq!(x.refcount(), Some(2));
            assert_eq!(y.refcount(), Some(2));
        }

        assert_eq!(x.refcount(), Some(1));
    }

    #[test]
    fn static_refcount() {
        let x = js_string!();
        assert_eq!(x.refcount(), None);

        {
            let y = x.clone();
            assert_eq!(x.refcount(), None);
            assert_eq!(y.refcount(), None);
        };

        assert_eq!(x.refcount(), None);
    }

    #[test]
    fn as_str() {
        const HELLO: &[u16] = utf16!("Hello");
        let x = js_string!(HELLO);

        assert_eq!(&x, HELLO);
    }

    #[test]
    fn hash() {
        const HELLOWORLD: JsStr<'_> = js_str!("Hello World!");
        let x = js_string!(HELLOWORLD);

        assert_eq!(x.as_str(), HELLOWORLD);

        assert!(HELLOWORLD.is_latin1());
        assert!(x.as_str().is_latin1());

        let s_hash = hash_value(&HELLOWORLD);
        let x_hash = hash_value(&x);

        assert_eq!(s_hash, x_hash);
    }

    #[test]
    fn concat() {
        const Y: &[u16] = utf16!(", ");
        const W: &[u16] = utf16!("!");

        let x = js_string!("hello");
        let z = js_string!("world");

        let xy = js_string!(&x, &JsString::from(Y));
        assert_eq!(&xy, utf16!("hello, "));
        assert_eq!(xy.refcount(), Some(1));

        let xyz = js_string!(&xy, &z);
        assert_eq!(&xyz, utf16!("hello, world"));
        assert_eq!(xyz.refcount(), Some(1));

        let xyzw = js_string!(&xyz, &JsString::from(W));
        assert_eq!(&xyzw, utf16!("hello, world!"));
        assert_eq!(xyzw.refcount(), Some(1));
    }

    #[test]
    fn trim_start_non_ascii_to_ascii() {
        let s = "\u{2029}abc";
        let x = js_string!(s);

        let y = js_string!(x.trim_start());

        assert_eq!(&y, s.trim_start());
    }

    #[test]
    fn conversion_to_known_static_js_string() {
        const JS_STR_U8: &JsStr<'_> = &js_str!("length");
        const JS_STR_U16: &JsStr<'_> = &JsStr::utf16(utf16!("length"));

        assert!(JS_STR_U8.is_latin1());
        assert!(!JS_STR_U16.is_latin1());

        assert_eq!(JS_STR_U8, JS_STR_U8);
        assert_eq!(JS_STR_U16, JS_STR_U16);

        assert_eq!(JS_STR_U8, JS_STR_U16);
        assert_eq!(JS_STR_U16, JS_STR_U8);

        assert_eq!(hash_value(JS_STR_U8), hash_value(JS_STR_U16));

        let string = StaticJsStrings::get_string(JS_STR_U8);

        assert!(string.is_some());
        assert!(string.unwrap().as_str().is_latin1());

        let string = StaticJsStrings::get_string(JS_STR_U16);

        assert!(string.is_some());
        assert!(string.unwrap().as_str().is_latin1());
    }
}
