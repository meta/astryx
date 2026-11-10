//! URI handling function constants
//!
//! This module contains a few constants used to handle decoding and encoding for URI handling
//! functions. They make it easier and more performant to compare different ranges and code points.

use std::ops::RangeInclusive;

/// A range containing all the lowercase `uriAlpha` code points.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-uriAlpha
const URI_ALPHA_LOWER: RangeInclusive<u16> = b'a' as u16..=b'z' as u16;

/// A range containing all the uppercase `uriAlpha` code points.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-uriAlpha
const URI_ALPHA_UPPER: RangeInclusive<u16> = b'A' as u16..=b'Z' as u16;

/// A range containing all the `DecimalDigit` code points.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-DecimalDigit
const DECIMAL_DIGIT: RangeInclusive<u16> = b'0' as u16..=b'9' as u16;

/// An array containing all the `uriMark` code points.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-uriMark
const URI_MARK: [u16; 9] = [
    b'-' as u16,
    b'_' as u16,
    b'.' as u16,
    b'!' as u16,
    b'~' as u16,
    b'*' as u16,
    b'\'' as u16,
    b'(' as u16,
    b')' as u16,
];

/// An array containing all the `uriReserved` code points.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-uriReserved
const URI_RESERVED: [u16; 10] = [
    b';' as u16,
    b'/' as u16,
    b'?' as u16,
    b':' as u16,
    b'@' as u16,
    b'&' as u16,
    b'=' as u16,
    b'+' as u16,
    b'$' as u16,
    b',' as u16,
];

/// The number sign (`#`) symbol as a UTF-16 code potint.
const NUMBER_SIGN: u16 = b'#' as u16;

/// Constant with all the unescaped URI characters.
///
/// Contains `uriAlpha`, `DecimalDigit` and `uriMark`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-uriUnescaped
pub(super) fn is_uri_unescaped(code_point: u16) -> bool {
    URI_ALPHA_LOWER.contains(&code_point)
        || URI_ALPHA_UPPER.contains(&code_point)
        || DECIMAL_DIGIT.contains(&code_point)
        || URI_MARK.contains(&code_point)
}

/// Constant with all the reserved URI characters, plus the number sign symbol (`#`).
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-uriReserved
pub(super) fn is_uri_reserved_or_number_sign(code_point: u16) -> bool {
    code_point == NUMBER_SIGN || URI_RESERVED.contains(&code_point)
}

/// Constant with all the reserved and unescaped URI characters, plus the number sign symbol (`#`).
///
/// More information:
///  - [`uriReserved` in ECMAScript spec][uri_reserved]
///  - [`uriUnescaped` in ECMAScript spec][uri_unescaped]
///
/// [uri_reserved]: https://tc39.es/ecma262/#prod-uriReserved
/// [uri_unescaped]: https://tc39.es/ecma262/#prod-uriUnescaped
pub(super) fn is_uri_reserved_or_uri_unescaped_or_number_sign(code_point: u16) -> bool {
    code_point == NUMBER_SIGN || is_uri_unescaped(code_point) || URI_RESERVED.contains(&code_point)
}
