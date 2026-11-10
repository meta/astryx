//! Boa's implementation of ECMAScript's URI Handling Functions.
//!
//! Uniform Resource Identifiers, or URIs, are Strings that identify resources (e.g. web pages or
//! files) and transport protocols by which to access them (e.g. HTTP or FTP) on the Internet. The
//! ECMAScript language itself does not provide any support for using URIs except for functions
//! that encode and decode URIs as described in 19.2.6.2, 19.2.6.3, 19.2.6.4 and 19.2.6.5
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-uri-handling-functions

mod consts;

use boa_gc::{Finalize, Trace};

use self::consts::{
    is_uri_reserved_or_number_sign, is_uri_reserved_or_uri_unescaped_or_number_sign,
    is_uri_unescaped,
};

use super::{BuiltInBuilder, BuiltInObject, IntrinsicObject};
use crate::{
    Context, JsArgs, JsExpect, JsNativeError, JsResult, JsString, JsValue,
    context::intrinsics::Intrinsics,
    js_string,
    object::{JsFunction, JsObject},
    realm::Realm,
    string::{CodePoint, StaticJsStrings},
};

/// Intrinsics for the [`URI Handling Functions`][spec].
///
/// [spec]: https://tc39.es/ecma262/multipage/global-object.html#sec-uri-handling-functions
#[derive(Debug, Trace, Finalize)]
pub struct UriFunctions {
    /// %decodeURI%
    decode_uri: JsFunction,

    /// %decodeURI%
    decode_uri_component: JsFunction,

    /// %encodeURI%
    encode_uri: JsFunction,

    /// %encodeURIcomponent%
    encode_uri_component: JsFunction,
}

impl Default for UriFunctions {
    fn default() -> Self {
        Self {
            decode_uri: JsFunction::empty_intrinsic_function(false),
            decode_uri_component: JsFunction::empty_intrinsic_function(false),
            encode_uri: JsFunction::empty_intrinsic_function(false),
            encode_uri_component: JsFunction::empty_intrinsic_function(false),
        }
    }
}

impl UriFunctions {
    pub(crate) fn decode_uri(&self) -> JsFunction {
        self.decode_uri.clone()
    }

    pub(crate) fn decode_uri_component(&self) -> JsFunction {
        self.decode_uri_component.clone()
    }

    pub(crate) fn encode_uri(&self) -> JsFunction {
        self.encode_uri.clone()
    }

    pub(crate) fn encode_uri_component(&self) -> JsFunction {
        self.encode_uri_component.clone()
    }
}

/// URI Handling Functions
#[derive(Debug, Clone, Copy)]
pub(crate) struct DecodeUri;

impl IntrinsicObject for DecodeUri {
    fn init(realm: &Realm) {
        BuiltInBuilder::callable_with_intrinsic::<Self>(realm, decode_uri)
            .name(Self::NAME)
            .length(1)
            .build();
    }
    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().uri_functions().decode_uri().into()
    }
}

impl BuiltInObject for DecodeUri {
    const NAME: JsString = StaticJsStrings::DECODE_URI;
}

pub(crate) struct DecodeUriComponent;

impl IntrinsicObject for DecodeUriComponent {
    fn init(realm: &Realm) {
        BuiltInBuilder::callable_with_intrinsic::<Self>(realm, decode_uri_component)
            .name(Self::NAME)
            .length(1)
            .build();
    }
    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics
            .objects()
            .uri_functions()
            .decode_uri_component()
            .into()
    }
}

impl BuiltInObject for DecodeUriComponent {
    const NAME: JsString = StaticJsStrings::DECODE_URI_COMPONENT;
}

pub(crate) struct EncodeUri;

impl IntrinsicObject for EncodeUri {
    fn init(realm: &Realm) {
        BuiltInBuilder::callable_with_intrinsic::<Self>(realm, encode_uri)
            .name(Self::NAME)
            .length(1)
            .build();
    }
    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().uri_functions().encode_uri().into()
    }
}

impl BuiltInObject for EncodeUri {
    const NAME: JsString = StaticJsStrings::ENCODE_URI;
}
pub(crate) struct EncodeUriComponent;

impl IntrinsicObject for EncodeUriComponent {
    fn init(realm: &Realm) {
        BuiltInBuilder::callable_with_intrinsic::<Self>(realm, encode_uri_component)
            .name(Self::NAME)
            .length(1)
            .build();
    }
    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics
            .objects()
            .uri_functions()
            .encode_uri_component()
            .into()
    }
}

impl BuiltInObject for EncodeUriComponent {
    const NAME: JsString = StaticJsStrings::ENCODE_URI_COMPONENT;
}

/// Builtin JavaScript `decodeURI ( encodedURI )` function.
///
/// This function computes a new version of a URI in which each escape sequence and UTF-8
/// encoding of the sort that might be introduced by the `encodeURI` function is replaced with
/// the UTF-16 encoding of the code points that it represents. Escape sequences that could not
/// have been introduced by `encodeURI` are not replaced.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-decodeuri-encodeduri
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/decodeURI
pub(crate) fn decode_uri(
    _: &JsValue,
    args: &[JsValue],
    context: &mut Context,
) -> JsResult<JsValue> {
    let encoded_uri = args.get_or_undefined(0);

    // 1. Let uriString be ? ToString(encodedURI).
    let uri_string = encoded_uri.to_string(context)?;

    // 2. Let reservedURISet be a String containing one instance of each code unit valid in uriReserved plus "#".
    let reserved_uri_set = is_uri_reserved_or_number_sign;

    // 3. Return ? Decode(uriString, reservedURISet).
    Ok(JsValue::from(decode(&uri_string, reserved_uri_set)?))
}
/// Builtin JavaScript `decodeURIComponent ( encodedURIComponent )` function.
///
/// This function computes a new version of a URI in which each escape sequence and UTF-8
/// encoding of the sort that might be introduced by the `encodeURIComponent` function is
/// replaced with the UTF-16 encoding of the code points that it represents.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-decodeuricomponent-encodeduricomponent
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/decodeURIComponent
pub(crate) fn decode_uri_component(
    _: &JsValue,
    args: &[JsValue],
    context: &mut Context,
) -> JsResult<JsValue> {
    let encoded_uri_component = args.get_or_undefined(0);

    // 1. Let componentString be ? ToString(encodedURIComponent).
    let component_string = encoded_uri_component.to_string(context)?;

    // 2. Let reservedURIComponentSet be the empty String.
    let reserved_uri_component_set = |_: u16| false;

    // 3. Return ? Decode(componentString, reservedURIComponentSet).
    Ok(JsValue::from(decode(
        &component_string,
        reserved_uri_component_set,
    )?))
}

/// Builtin JavaScript `encodeURI ( uri )` function.
///
/// This function computes a new version of a UTF-16 encoded (6.1.4) URI in which each instance
/// of certain code points is replaced by one, two, three, or four escape sequences
/// representing the UTF-8 encoding of the code points.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-encodeuri-uri
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI
pub(crate) fn encode_uri(
    _: &JsValue,
    args: &[JsValue],
    context: &mut Context,
) -> JsResult<JsValue> {
    let uri = args.get_or_undefined(0);

    // 1. Let uriString be ? ToString(uri).
    let uri_string = uri.to_string(context)?;

    // 2. Let unescapedURISet be a String containing one instance of each code unit valid in uriReserved and uriUnescaped plus "#".
    let unescaped_uri_set = is_uri_reserved_or_uri_unescaped_or_number_sign;

    // 3. Return ? Encode(uriString, unescapedURISet).
    Ok(JsValue::from(encode(&uri_string, unescaped_uri_set)?))
}

/// Builtin JavaScript `encodeURIComponent ( uriComponent )` function.
///
/// This function computes a new version of a UTF-16 encoded (6.1.4) URI in which each instance
/// of certain code points is replaced by one, two, three, or four escape sequences
/// representing the UTF-8 encoding of the code point.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-encodeuricomponent-uricomponent
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
pub(crate) fn encode_uri_component(
    _: &JsValue,
    args: &[JsValue],
    context: &mut Context,
) -> JsResult<JsValue> {
    let uri_component = args.get_or_undefined(0);

    // 1. Let componentString be ? ToString(uriComponent).
    let component_string = uri_component.to_string(context)?;

    // 2. Let unescapedURIComponentSet be a String containing one instance of each code unit valid in uriUnescaped.
    let unescaped_uri_component_set = is_uri_unescaped;

    // 3. Return ? Encode(componentString, unescapedURIComponentSet).
    Ok(JsValue::from(encode(
        &component_string,
        unescaped_uri_component_set,
    )?))
}

/// The `Encode ( string, unescapedSet )` abstract operation
///
/// The abstract operation Encode takes arguments `string` (a String) and `unescapedSet` (a String)
/// and returns either a normal completion containing a String or a throw completion. It performs
/// URI encoding and escaping.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-encode
fn encode<F>(string: &JsString, unescaped_set: F) -> JsResult<JsString>
where
    F: Fn(u16) -> bool,
{
    // 1. Let strLen be the length of string.
    let str_len = string.len();

    // 2. Let R be the empty String.
    let mut r = Vec::with_capacity(str_len);

    // 3. Let k be 0.
    let mut k = 0;
    // 4. Repeat,
    loop {
        // a. If k = strLen, return R.
        if k == str_len {
            return Ok(js_string!(&r[..]));
        }

        // b. Let C be the code unit at index k within string.
        let c = string.code_unit_at(k).js_expect("Bounds were verified")?;

        // c. If C is in unescapedSet, then
        if unescaped_set(c) {
            // i. Set k to k + 1.
            k += 1;

            // ii. Set R to the string-concatenation of R and C.
            r.push(c);
        } else {
            // d. Else,
            // i. Let cp be CodePointAt(string, k).
            let cp = string.code_point_at(k);

            // ii. If cp.[[IsUnpairedSurrogate]] is true, throw a URIError exception.
            let CodePoint::Unicode(ch) = cp else {
                return Err(JsNativeError::uri()
                    .with_message("trying to encode an invalid string")
                    .into());
            };

            // iii. Set k to k + cp.[[CodeUnitCount]].
            k += cp.code_unit_count();

            // iv. Let Octets be the List of octets resulting by applying the UTF-8 transformation
            //     to cp.[[CodePoint]].
            let mut buff = [0_u8; 4]; // Will never be more than 4 bytes

            let octets = ch.encode_utf8(&mut buff);

            // v. For each element octet of Octets, do
            for octet in octets.bytes() {
                // 1. Set R to the string-concatenation of:
                //    R
                //    "%"
                //    the String representation of octet, formatted as a two-digit uppercase
                //    hexadecimal number, padded to the left with a zero if necessary
                r.extend(format!("%{octet:0>2X}").encode_utf16());
            }
        }
    }
}

/// The `Decode ( string, reservedSet )` abstract operation.
///
/// The abstract operation Decode takes arguments `string` (a String) and `reservedSet` (a String)
/// and returns either a normal completion containing a String or a throw completion. It performs
/// URI unescaping and decoding.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-decode
#[allow(clippy::many_single_char_names)]
fn decode<F>(string: &JsString, reserved_set: F) -> JsResult<JsString>
where
    F: Fn(u16) -> bool,
{
    // 1. Let strLen be the length of string.
    let str_len = string.len();
    // 2. Let R be the empty String.
    let mut r = Vec::with_capacity(str_len);

    let mut octets = Vec::with_capacity(4);

    // 3. Let k be 0.
    let mut k = 0;
    // 4. Repeat,
    loop {
        // a. If k = strLen, return R.
        // b. Let C be the code unit at index k within string.
        let Some(c) = string.code_unit_at(k) else {
            return Ok(js_string!(&r[..]));
        };

        // c. If C is not the code unit 0x0025 (PERCENT SIGN), then
        #[allow(clippy::if_not_else)]
        let s = if c != 0x0025_u16 {
            // i. Let S be the String value containing only the code unit C.
            Vec::from([c])
        } else {
            // d. Else,
            // i. Let start be k.
            let start = k;

            // ii. If k + 2 ≥ strLen, throw a URIError exception.
            if k + 2 >= str_len {
                return Err(JsNativeError::uri()
                    .with_message("URI malformed")
                    .into());
            }

            // iii. If the code units at index (k + 1) and (k + 2) within string do not represent
            // hexadecimal digits, throw a URIError exception.
            // iv. Let B be the 8-bit value represented by the two hexadecimal digits at index (k + 1) and (k + 2).

            // SAFETY: the indices have been verified as valid already.
            let (high, low) = unsafe {
                (
                    string.code_unit_at(k + 1).unwrap_unchecked(),
                    string.code_unit_at(k + 2).unwrap_unchecked(),
                )
            };
            let b = decode_hex_byte(high, low).ok_or_else(|| {
                JsNativeError::uri().with_message("invalid hexadecimal digit found")
            })?;

            // v. Set k to k + 2.
            k += 2;

            // vi. Let n be the number of leading 1 bits in B.
            let n = b.leading_ones() as usize;

            // vii. If n = 0, then
            if n == 0 {
                // 1. Let C be the code unit whose value is B.
                let c = u16::from(b);

                // 2. If C is not in reservedSet, then
                if !reserved_set(c) {
                    // a. Let S be the String value containing only the code unit C.
                    Vec::from([c])
                } else {
                    // 3. Else,
                    // a. Let S be the substring of string from start to k + 1.
                    string.get_expect(start..=k).to_vec()
                }
            } else {
                // viii. Else,
                // 1. If n = 1 or n > 4, throw a URIError exception.
                if n == 1 || n > 4 {
                    return Err(JsNativeError::uri()
                        .with_message("invalid escaped character found")
                        .into());
                }

                // 2. If k + (3 × (n - 1)) ≥ strLen, throw a URIError exception.
                if k + (3 * (n - 1)) >= str_len {
                    return Err(JsNativeError::uri()
                        .with_message("non-terminated escape character found")
                        .into());
                }

                // 3. Let Octets be « B ».
                octets.push(b);

                // 4. Let j be 1.
                // 5. Repeat, while j < n,
                for _j in 1..n {
                    // a. Set k to k + 1.
                    k += 1;

                    // b. If the code unit at index k within string is not the code unit 0x0025 (PERCENT SIGN), throw a URIError exception.
                    if string.code_unit_at(k) != Some(0x0025) {
                        return Err(JsNativeError::uri()
                            .with_message("escape characters must be preceded with a % sign")
                            .into());
                    }

                    // c. If the code units at index (k + 1) and (k + 2) within string do not represent hexadecimal digits, throw a URIError exception.
                    // d. Let B be the 8-bit value represented by the two hexadecimal digits at index (k + 1) and (k + 2).
                    // SAFETY: the indices have been verified as valid already.
                    let (high, low) = unsafe {
                        (
                            string.code_unit_at(k + 1).unwrap_unchecked(),
                            string.code_unit_at(k + 2).unwrap_unchecked(),
                        )
                    };
                    let b = decode_hex_byte(high, low).ok_or_else(|| {
                        JsNativeError::uri().with_message("invalid hexadecimal digit found")
                    })?;

                    // e. Set k to k + 2.
                    k += 2;

                    // f. Append B to Octets.
                    octets.push(b);

                    // g. Set j to j + 1.
                }

                // 6. Assert: The length of Octets is n.
                assert_eq!(octets.len(), n);

                // 7. If Octets does not contain a valid UTF-8 encoding of a Unicode code point, throw a URIError exception.
                match std::str::from_utf8(&octets) {
                    Err(_) => {
                        return Err(JsNativeError::uri()
                            .with_message("invalid UTF-8 encoding found")
                            .into());
                    }
                    Ok(v) => {
                        // 8. Let V be the code point obtained by applying the UTF-8 transformation to Octets, that is, from a List of octets into a 21-bit value.

                        // 9. Let S be UTF16EncodeCodePoint(V).
                        // utf16_encode_codepoint(v)
                        let s = v.encode_utf16().collect::<Vec<_>>();
                        octets.clear();
                        s
                    }
                }
            }
        };

        // e. Set R to the string-concatenation of R and S.
        r.extend_from_slice(&s);

        // f. Set k to k + 1.
        k += 1;
    }
}

/// Decodes a byte from two unicode code units.
fn decode_hex_byte(high: u16, low: u16) -> Option<u8> {
    match (
        char::from_u32(u32::from(high)),
        char::from_u32(u32::from(low)),
    ) {
        (Some(high), Some(low)) => match (high.to_digit(16), low.to_digit(16)) {
            (Some(high), Some(low)) => Some(((high as u8) << 4) + low as u8),
            _ => None,
        },
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::JsNativeErrorKind;

    /// Checks that the `decode_byte()` function works as expected.
    #[test]
    fn decode_byte() {
        // Sunny day tests
        assert_eq!(
            decode_hex_byte(u16::from(b'2'), u16::from(b'0')).unwrap(),
            0x20
        );
        assert_eq!(
            decode_hex_byte(u16::from(b'2'), u16::from(b'A')).unwrap(),
            0x2A
        );
        assert_eq!(
            decode_hex_byte(u16::from(b'3'), u16::from(b'C')).unwrap(),
            0x3C
        );
        assert_eq!(
            decode_hex_byte(u16::from(b'4'), u16::from(b'0')).unwrap(),
            0x40
        );
        assert_eq!(
            decode_hex_byte(u16::from(b'7'), u16::from(b'E')).unwrap(),
            0x7E
        );
        assert_eq!(
            decode_hex_byte(u16::from(b'0'), u16::from(b'0')).unwrap(),
            0x00
        );

        // Rainy day tests
        assert!(decode_hex_byte(u16::from(b'-'), u16::from(b'0')).is_none());
        assert!(decode_hex_byte(u16::from(b'f'), u16::from(b'~')).is_none());
        assert!(decode_hex_byte(u16::from(b'A'), 0_u16).is_none());
        assert!(decode_hex_byte(u16::from(b'%'), u16::from(b'&')).is_none());

        assert!(decode_hex_byte(0xFACD_u16, u16::from(b'-')).is_none());
        assert!(decode_hex_byte(u16::from(b'-'), 0xA0FD_u16).is_none());
    }

    #[test]
    fn decode_uri_reports_uri_error_on_incomplete_sequence() {
        // "%E7%9A%8" is an incomplete 3-byte UTF-8 sequence and must error with Uri kind
        let s = js_string!("%E7%9A%8");
        let err = decode(&s, |_| false).expect_err("should error on incomplete escape");
        let native = err.as_native().expect("error should be native");
        assert!(matches!(native.kind(), JsNativeErrorKind::Uri));
    }

    #[test]
    fn decode_preserves_non_bmp_characters() {
        let s = js_string!("\u{1F600}");
        let decoded = decode(&s, |_| false).expect("decode should succeed");
        assert_eq!(decoded, s);
    }

    #[test]
    fn decode_preserves_non_bmp_characters_for_decode_uri_set() {
        let s = js_string!("\u{1F600}");
        let decoded = decode(&s, is_uri_reserved_or_number_sign).expect("decode should succeed");
        assert_eq!(decoded, s);
    }
}
