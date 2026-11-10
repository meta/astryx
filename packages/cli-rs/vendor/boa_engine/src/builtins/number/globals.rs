use crate::{
    Context, JsArgs, JsResult, JsStr, JsString, JsValue,
    builtins::{BuiltInBuilder, BuiltInObject, IntrinsicObject},
    context::intrinsics::Intrinsics,
    object::JsObject,
    realm::Realm,
    string::StaticJsStrings,
};

use boa_macros::js_str;
use boa_string::JsStrVariant;

/// Builtin javascript 'isFinite(number)' function.
///
/// Converts the argument to a number, throwing a type error if the conversion is invalid.
///
/// If the number is `NaN`, `+∞`, or `-∞`, `false` is returned.
///
/// Otherwise true is returned.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-isfinite-number
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/isFinite
fn is_finite(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    if let Some(value) = args.first() {
        let number = value.to_number(context)?;
        Ok(number.is_finite().into())
    } else {
        Ok(false.into())
    }
}

pub(crate) struct IsFinite;

impl IntrinsicObject for IsFinite {
    fn init(realm: &Realm) {
        BuiltInBuilder::callable_with_intrinsic::<Self>(realm, is_finite)
            .name(Self::NAME)
            .length(1)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().is_finite().into()
    }
}

impl BuiltInObject for IsFinite {
    const NAME: JsString = StaticJsStrings::IS_FINITE;
}

/// Builtin javascript 'isNaN(number)' function.
///
/// Converts the argument to a number, throwing a type error if the conversion is invalid.
///
/// If the number is `NaN`, `true` is returned.
///
/// Otherwise false is returned.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-isnan-number
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/isNaN
pub(crate) fn is_nan(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    if let Some(value) = args.first() {
        let number = value.to_number(context)?;
        Ok(number.is_nan().into())
    } else {
        Ok(true.into())
    }
}

pub(crate) struct IsNaN;

impl IntrinsicObject for IsNaN {
    fn init(realm: &Realm) {
        BuiltInBuilder::callable_with_intrinsic::<Self>(realm, is_nan)
            .name(Self::NAME)
            .length(1)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().is_nan().into()
    }
}

impl BuiltInObject for IsNaN {
    const NAME: JsString = StaticJsStrings::IS_NAN;
}

fn from_js_str_radix(src: JsStr<'_>, radix: u8) -> Option<f64> {
    /// Determines if a string of text of that length of that radix could be guaranteed to be
    /// stored in the given type T.
    /// Note that if the radix is known to the compiler, it is just the check of digits.len that
    /// is done at runtime.
    fn can_not_overflow(radix: u8, digits_len: usize) -> bool {
        usize::from(radix) <= 16 && digits_len <= size_of::<u64>() * 2
    }

    const fn to_digit(input: u8, radix: u8) -> Option<u8> {
        // If not a digit, a number greater than radix will be created.
        let mut digit = input.wrapping_sub(b'0');
        if radix > 10 {
            debug_assert!(radix <= 36, "to_digit: radix is too high (maximum 36)");
            if digit < 10 {
                return Some(digit);
            }
            // Force the 6th bit to be set to ensure ascii is lower case.
            digit = (input | 0b10_0000).wrapping_sub(b'a').saturating_add(10);
        }
        // FIXME: once then_some is const fn, use it here
        if digit < radix { Some(digit) } else { None }
    }

    let src = src
        .iter()
        .map(|x| u8::try_from(x).expect("should be ascii string"));

    let result = if can_not_overflow(radix, src.len()) {
        let mut result = 0;
        for c in src {
            result = result * u64::from(radix) + u64::from(to_digit(c, radix)?);
        }
        result as f64
    } else {
        let mut result = 0f64;
        for c in src {
            result = result * f64::from(radix) + f64::from(to_digit(c, radix)?);
        }
        result
    };

    Some(result)
}

/// Builtin javascript 'parseInt(str, radix)' function.
///
/// Parses the given string as an integer using the given radix as a base.
///
/// An argument of type Number (i.e. Integer or Rational) is also accepted in place of string.
///
/// The radix must be an integer in the range [2, 36] inclusive.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-parseint-string-radix
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/parseInt
pub(crate) fn parse_int(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    let (Some(string), radix) = (args.first(), args.get_or_undefined(1)) else {
        // Not enough arguments to parseInt.
        return Ok(JsValue::nan());
    };

    // OPTIMIZATION: We can skip the round-trip when the value is already a number.
    if let Some(int) = string.as_i32()
        && radix.is_null_or_undefined()
    {
        return Ok(JsValue::new(int));
    }

    // 1. Let inputString be ? ToString(string).
    let input_string = string.to_string(context)?;

    // 2. Let S be ! TrimString(inputString, start).
    let mut s = input_string.trim_start();

    // 3. Let sign be 1.
    // 4. If S is not empty and the first code unit of S is the code unit 0x002D (HYPHEN-MINUS),
    //    set sign to -1.
    let sign = if !s.is_empty() && s.starts_with(js_str!("-")) {
        -1
    } else {
        1
    };

    // 5. If S is not empty and the first code unit of S is the code unit 0x002B (PLUS SIGN) or
    //    the code unit 0x002D (HYPHEN-MINUS), remove the first code unit from S.
    if !s.is_empty() && (s.starts_with(js_str!("+")) || s.starts_with(js_str!("-"))) {
        s = s.get(1..).expect("already checked that it's not empty");
    }

    // 6. Let R be ℝ(? ToInt32(radix)).
    let r = radix.to_i32(context)?;

    // 7. Let stripPrefix be true.
    let mut strip_prefix = true;

    // 8. If R ≠ 0, then
    #[allow(clippy::if_not_else)]
    let mut r = if r != 0 {
        //     a. If R < 2 or R > 36, return NaN.
        if !(2..=36).contains(&r) {
            return Ok(JsValue::nan());
        }

        //     b. If R ≠ 16, set stripPrefix to false.
        if r != 16 {
            strip_prefix = false;
        }
        r as u8
    } else {
        // 9. Else,
        //     a. Set R to 10.
        10
    };

    // 10. If stripPrefix is true, then
    //     a. If the length of S is at least 2 and the first two code units of S are either "0x" or "0X", then
    //         i. Remove the first two code units from S.
    //         ii. Set R to 16.
    if strip_prefix
        && s.len() >= 2
        && (s.starts_with(js_str!("0x")) || s.starts_with(js_str!("0X")))
    {
        s = s
            .get(2..)
            .expect("already checked that it contains at least two chars");

        r = 16;
    }

    // 11. If S contains a code unit that is not a radix-R digit, let end be the index within S of the
    //     first such code unit; otherwise, let end be the length of S.
    let end = char::decode_utf16(s.iter())
        .position(|code| !code.is_ok_and(|c| c.is_digit(u32::from(r))))
        .unwrap_or(s.len());

    // 12. Let Z be the substring of S from 0 to end.
    let z = s.get(..end).expect("should be in range");

    // 13. If Z is empty, return NaN.
    if z.is_empty() {
        return Ok(JsValue::nan());
    }

    // 14. Let mathInt be the integer value that is represented by Z in radix-R notation, using the
    //     letters A-Z and a-z for digits with values 10 through 35. (However, if R is 10 and Z contains
    //     more than 20 significant digits, every significant digit after the 20th may be replaced by a
    //     0 digit, at the option of the implementation; and if R is not 2, 4, 8, 10, 16, or 32, then
    //     mathInt may be an implementation-approximated value representing the integer value that is
    //     represented by Z in radix-R notation.)
    let math_int = from_js_str_radix(z.as_str(), r).expect("Already checked");

    // 15. If mathInt = 0, then
    //     a. If sign = -1, return -0𝔽.
    //     b. Return +0𝔽.
    if math_int == 0_f64 {
        if sign == -1 {
            return Ok(JsValue::new(-0_f64));
        }

        return Ok(JsValue::new(0));
    }

    // 16. Return 𝔽(sign × mathInt).
    Ok(JsValue::new(f64::from(sign) * math_int))
}

pub(crate) struct ParseInt;

impl IntrinsicObject for ParseInt {
    fn init(realm: &Realm) {
        BuiltInBuilder::callable_with_intrinsic::<Self>(realm, parse_int)
            .name(Self::NAME)
            .length(2)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().parse_int().into()
    }
}

impl BuiltInObject for ParseInt {
    const NAME: JsString = StaticJsStrings::PARSE_INT;
}

/// Builtin javascript 'parseFloat(str)' function.
///
/// Parses the given string as a floating point value.
///
/// An argument of type Number (i.e. Integer or Rational) is also accepted in place of string.
///
/// To improve performance an Integer type Number is returned in place of a Rational if the given
/// string can be parsed and stored as an Integer.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-parsefloat-string
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/parseFloat
pub(crate) fn parse_float(
    _: &JsValue,
    args: &[JsValue],
    context: &mut Context,
) -> JsResult<JsValue> {
    let Some(string) = args.first() else {
        return Ok(JsValue::nan());
    };

    // OPTIMIZATION: We can skip the round-trip when the value is already a number.
    if string.is_number() {
        // Special case for negative zero - it should become positive zero
        if string.is_negative_zero() {
            return Ok(JsValue::new(0));
        }

        return Ok(string.clone());
    }

    // 1. Let inputString be ? ToString(string).
    let input_string = string.to_string(context)?;

    // 2. Let trimmedString be ! TrimString(inputString, start).
    let trimmed_string = input_string.trim_start();

    // 3. Let trimmed be StringToCodePoints(trimmedString).
    // 4. Let trimmedPrefix be the longest prefix of trimmed that satisfies the syntax of a StrDecimalLiteral, which might be trimmed itself. If there is no such prefix, return NaN.
    // 5. Let parsedNumber be ParseText(trimmedPrefix, StrDecimalLiteral).
    // 6. Assert: parsedNumber is a Parse Node.
    // 7. Return the StringNumericValue of parsedNumber.
    let (positive, prefix) = match trimmed_string
        .code_unit_at(0)
        .and_then(|c| char::from_u32(u32::from(c)))
    {
        Some('+') => (
            true,
            trimmed_string
                .get(1..)
                .unwrap_or(StaticJsStrings::EMPTY_STRING),
        ),
        Some('-') => (
            false,
            trimmed_string
                .get(1..)
                .unwrap_or(StaticJsStrings::EMPTY_STRING),
        ),
        _ => (true, trimmed_string.clone()),
    };

    if prefix.starts_with(js_str!("Infinity")) {
        if positive {
            return Ok(JsValue::positive_infinity());
        }
        return Ok(JsValue::negative_infinity());
    } else if let Some('I' | 'i') = prefix
        .code_unit_at(0)
        .and_then(|c| char::from_u32(u32::from(c)))
    {
        return Ok(JsValue::nan());
    }

    let value = match trimmed_string.variant() {
        JsStrVariant::Latin1(s) => fast_float2::parse_partial::<f64, _>(s),
        JsStrVariant::Utf16(s) => {
            // TODO: Explore adding direct UTF-16 parsing support to fast_float2.
            let s = String::from_utf16_lossy(s);
            fast_float2::parse_partial::<f64, _>(s.as_bytes())
        }
    };

    Ok(value.map_or_else(
        |_| JsValue::nan(),
        |(f, len)| {
            if len > 0 {
                JsValue::new(f)
            } else {
                JsValue::nan()
            }
        },
    ))
}

pub(crate) struct ParseFloat;

impl IntrinsicObject for ParseFloat {
    fn init(realm: &Realm) {
        BuiltInBuilder::callable_with_intrinsic::<Self>(realm, parse_float)
            .name(Self::NAME)
            .length(1)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().parse_float().into()
    }
}

impl BuiltInObject for ParseFloat {
    const NAME: JsString = StaticJsStrings::PARSE_FLOAT;
}
