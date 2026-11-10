//! Boa's implementation of ECMAScript's global `Math` object.
//!
//! `Math` is a built-in object that has properties and methods for mathematical constants and functions. It’s not a function object.
//!
//! `Math` works with the `Number` type. It doesn't work with `BigInt`.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-math-object
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math

use crate::{
    Context, JsArgs, JsResult, JsString, JsValue, builtins::BuiltInObject,
    context::intrinsics::Intrinsics, js_string, object::JsObject, property::Attribute,
    realm::Realm, string::StaticJsStrings, symbol::JsSymbol,
};

use super::{BuiltInBuilder, IntrinsicObject};

#[cfg(test)]
mod tests;

/// Javascript `Math` object.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct Math;

impl IntrinsicObject for Math {
    fn init(realm: &Realm) {
        let attribute = Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::PERMANENT;
        let builder = BuiltInBuilder::with_intrinsic::<Self>(realm)
            .static_property(js_string!("E"), std::f64::consts::E, attribute)
            .static_property(js_string!("LN10"), std::f64::consts::LN_10, attribute)
            .static_property(js_string!("LN2"), std::f64::consts::LN_2, attribute)
            .static_property(js_string!("LOG10E"), std::f64::consts::LOG10_E, attribute)
            .static_property(js_string!("LOG2E"), std::f64::consts::LOG2_E, attribute)
            .static_property(js_string!("PI"), std::f64::consts::PI, attribute)
            .static_property(
                js_string!("SQRT1_2"),
                std::f64::consts::FRAC_1_SQRT_2,
                attribute,
            )
            .static_property(js_string!("SQRT2"), std::f64::consts::SQRT_2, attribute)
            .static_method(Self::abs, js_string!("abs"), 1)
            .static_method(Self::acos, js_string!("acos"), 1)
            .static_method(Self::acosh, js_string!("acosh"), 1)
            .static_method(Self::asin, js_string!("asin"), 1)
            .static_method(Self::asinh, js_string!("asinh"), 1)
            .static_method(Self::atan, js_string!("atan"), 1)
            .static_method(Self::atanh, js_string!("atanh"), 1)
            .static_method(Self::atan2, js_string!("atan2"), 2)
            .static_method(Self::cbrt, js_string!("cbrt"), 1)
            .static_method(Self::ceil, js_string!("ceil"), 1)
            .static_method(Self::clz32, js_string!("clz32"), 1)
            .static_method(Self::cos, js_string!("cos"), 1)
            .static_method(Self::cosh, js_string!("cosh"), 1)
            .static_method(Self::exp, js_string!("exp"), 1)
            .static_method(Self::expm1, js_string!("expm1"), 1)
            .static_method(Self::floor, js_string!("floor"), 1)
            .static_method(Self::fround, js_string!("fround"), 1)
            .static_method(Self::hypot, js_string!("hypot"), 2)
            .static_method(Self::imul, js_string!("imul"), 2)
            .static_method(Self::log, js_string!("log"), 1)
            .static_method(Self::log1p, js_string!("log1p"), 1)
            .static_method(Self::log10, js_string!("log10"), 1)
            .static_method(Self::log2, js_string!("log2"), 1)
            .static_method(Self::max, js_string!("max"), 2)
            .static_method(Self::min, js_string!("min"), 2)
            .static_method(Self::pow, js_string!("pow"), 2)
            .static_method(Self::random, js_string!("random"), 0)
            .static_method(Self::round, js_string!("round"), 1)
            .static_method(Self::sign, js_string!("sign"), 1)
            .static_method(Self::sin, js_string!("sin"), 1)
            .static_method(Self::sinh, js_string!("sinh"), 1)
            .static_method(Self::sqrt, js_string!("sqrt"), 1)
            .static_method(Self::tan, js_string!("tan"), 1)
            .static_method(Self::tanh, js_string!("tanh"), 1)
            .static_method(Self::trunc, js_string!("trunc"), 1)
            .static_property(
                JsSymbol::to_string_tag(),
                Self::NAME,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            );

        #[cfg(feature = "float16")]
        let builder = builder.static_method(Self::f16round, js_string!("f16round"), 1);

        #[cfg(feature = "xsum")]
        let builder = builder.static_method(Self::sum_precise, js_string!("sumPrecise"), 1);

        builder.build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().math()
    }
}

impl BuiltInObject for Math {
    const NAME: JsString = StaticJsStrings::MATH;
}

impl Math {
    /// Get the absolute value of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.abs
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/abs
    pub(crate) fn abs(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 3. If n is -0𝔽, return +0𝔽.
            // 2. If n is NaN, return NaN.
            // 4. If n is -∞𝔽, return +∞𝔽.
            // 5. If n < +0𝔽, return -n.
            // 6. Return n.
            .abs()
            .into())
    }

    /// Get the arccos of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.acos
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/acos
    pub(crate) fn acos(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n > 1𝔽, or n < -1𝔽, return NaN.
            // 3. If n is 1𝔽, return +0𝔽.
            // 4. Return an implementation-approximated value representing the result of the inverse cosine of ℝ(n).
            .acos()
            .into())
    }

    /// Get the hyperbolic arccos of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.acosh
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/acosh
    pub(crate) fn acosh(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1/√f64::EPSILON, as established by the Boost math library.
        const ACOSH_LARGE_INPUT_THRESHOLD: f64 = 67_108_864.0;

        // 1. Let n be ? ToNumber(x).
        let n = args.get_or_undefined(0).to_number(context)?;
        if n.is_finite() && n > ACOSH_LARGE_INPUT_THRESHOLD {
            return Ok((n.ln() + std::f64::consts::LN_2).into());
        }

        // 4. If n < 1𝔽, return NaN.
        // 2. If n is NaN or n is +∞𝔽, return n.
        // 3. If n is 1𝔽, return +0𝔽.
        // 5. Return an implementation-approximated value representing the result of the inverse hyperbolic cosine of ℝ(n).
        Ok(n.acosh().into())
    }

    /// Get the arcsine of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.asin
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/asin
    pub(crate) fn asin(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, or n is -0𝔽, return n.
            // 3. If n > 1𝔽 or n < -1𝔽, return NaN.
            // 4. Return an implementation-approximated value representing the result of the inverse sine of ℝ(n).
            .asin()
            .into())
    }

    /// Get the hyperbolic arcsine of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.asinh
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/asinh
    pub(crate) fn asinh(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1/√f64::EPSILON, as established by the Boost math library.
        const ASINH_LARGE_INPUT_THRESHOLD: f64 = 67_108_864.0;

        // 1. Let n be ? ToNumber(x).
        let n = args.get_or_undefined(0).to_number(context)?;
        if n.is_finite() && n.abs() > ASINH_LARGE_INPUT_THRESHOLD {
            return Ok((n.signum()
                * (n.abs().ln() + std::f64::consts::LN_2 + 0.25 * n.recip() * n.recip()))
            .into());
        }

        // 2. If n is NaN, n is +0𝔽, n is -0𝔽, n is +∞𝔽, or n is -∞𝔽, return n.
        // 3. Return an implementation-approximated value representing the result of the inverse hyperbolic sine of ℝ(n).
        Ok(n.asinh().into())
    }

    /// Get the arctangent of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.atan
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/atan
    pub(crate) fn atan(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, or n is -0𝔽, return n.
            // 3. If n is +∞𝔽, return an implementation-approximated value representing π / 2.
            // 4. If n is -∞𝔽, return an implementation-approximated value representing -π / 2.
            // 5. Return an implementation-approximated value representing the result of the inverse tangent of ℝ(n).
            .atan()
            .into())
    }

    /// Get the hyperbolic arctangent of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.atanh
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/atanh
    pub(crate) fn atanh(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, or n is -0𝔽, return n.
            // 3. If n > 1𝔽 or n < -1𝔽, return NaN.
            // 4. If n is 1𝔽, return +∞𝔽.
            // 5. If n is -1𝔽, return -∞𝔽.
            // 6. Return an implementation-approximated value representing the result of the inverse hyperbolic tangent of ℝ(n).
            .atanh()
            .into())
    }

    /// Get the four quadrant arctangent of the quotient y / x.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.atan2
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/atan2
    pub(crate) fn atan2(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let ny be ? ToNumber(y).
        let y = args.get_or_undefined(0).to_number(context)?;

        // 2. Let nx be ? ToNumber(x).
        let x = args.get_or_undefined(1).to_number(context)?;

        // 4. If ny is +∞𝔽, then
        // a. If nx is +∞𝔽, return an implementation-approximated value representing π / 4.
        // b. If nx is -∞𝔽, return an implementation-approximated value representing 3π / 4.
        // c. Return an implementation-approximated value representing π / 2.
        // 5. If ny is -∞𝔽, then
        // a. If nx is +∞𝔽, return an implementation-approximated value representing -π / 4.
        // b. If nx is -∞𝔽, return an implementation-approximated value representing -3π / 4.
        // c. Return an implementation-approximated value representing -π / 2.
        // 6. If ny is +0𝔽, then
        // a. If nx > +0𝔽 or nx is +0𝔽, return +0𝔽.
        // b. Return an implementation-approximated value representing π.
        // 7. If ny is -0𝔽, then
        // a. If nx > +0𝔽 or nx is +0𝔽, return -0𝔽.
        // b. Return an implementation-approximated value representing -π.
        // 8. Assert: ny is finite and is neither +0𝔽 nor -0𝔽.
        // 9. If ny > +0𝔽, then
        // a. If nx is +∞𝔽, return +0𝔽.
        // b. If nx is -∞𝔽, return an implementation-approximated value representing π.
        // c. If nx is +0𝔽 or nx is -0𝔽, return an implementation-approximated value representing π / 2.
        // 10. If ny < +0𝔽, then
        // a. If nx is +∞𝔽, return -0𝔽.
        // b. If nx is -∞𝔽, return an implementation-approximated value representing -π.
        // c. If nx is +0𝔽 or nx is -0𝔽, return an implementation-approximated value representing -π / 2.
        // 11. Assert: nx is finite and is neither +0𝔽 nor -0𝔽.
        // 12. Return an implementation-approximated value representing the result of the inverse tangent of the quotient ℝ(ny) / ℝ(nx).
        Ok(y.atan2(x).into())
    }

    /// Get the cubic root of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.cbrt
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/cbrt
    pub(crate) fn cbrt(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, n is -0𝔽, n is +∞𝔽, or n is -∞𝔽, return n.
            // 3. Return an implementation-approximated value representing the result of the cube root of ℝ(n).
            .cbrt()
            .into())
    }

    /// Get lowest integer above a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.ceil
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/ceil
    pub(crate) fn ceil(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, n is -0𝔽, n is +∞𝔽, or n is -∞𝔽, return n.
            // 3. If n < +0𝔽 and n > -1𝔽, return -0𝔽.
            // 4. If n is an integral Number, return n.
            // 5. Return the smallest (closest to -∞) integral Number value that is not less than n.
            .ceil()
            .into())
    }

    /// Get the number of leading zeros in the 32 bit representation of a number
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.clz32
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32
    pub(crate) fn clz32(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToUint32(x).
            .to_u32(context)?
            // 2. Let p be the number of leading zero bits in the unsigned 32-bit binary representation of n.
            // 3. Return 𝔽(p).
            .leading_zeros()
            .into())
    }

    /// Get the cosine of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.cos
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/cos
    pub(crate) fn cos(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +∞𝔽, or n is -∞𝔽, return NaN.
            // 3. If n is +0𝔽 or n is -0𝔽, return 1𝔽.
            // 4. Return an implementation-approximated value representing the result of the cosine of ℝ(n).
            .cos()
            .into())
    }

    /// Get the hyperbolic cosine of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.cosh
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/cosh
    pub(crate) fn cosh(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, return NaN.
            // 3. If n is +∞𝔽 or n is -∞𝔽, return +∞𝔽.
            // 4. If n is +0𝔽 or n is -0𝔽, return 1𝔽.
            // 5. Return an implementation-approximated value representing the result of the hyperbolic cosine of ℝ(n).
            .cosh()
            .into())
    }

    /// Get the power to raise the natural logarithm to get the number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.exp
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/exp
    pub(crate) fn exp(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN or n is +∞𝔽, return n.
            // 3. If n is +0𝔽 or n is -0𝔽, return 1𝔽.
            // 4. If n is -∞𝔽, return +0𝔽.
            // 5. Return an implementation-approximated value representing the result of the exponential function of ℝ(n).
            .exp()
            .into())
    }

    /// The `Math.expm1()` function returns e^x - 1, where x is the argument, and e the base of
    /// the natural logarithms. The result is computed in a way that is accurate even when the
    /// value of x is close 0
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.expm1
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/expm1
    pub(crate) fn expm1(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, n is -0𝔽, or n is +∞𝔽, return n.
            // 3. If n is -∞𝔽, return -1𝔽.
            // 4. Return an implementation-approximated value representing the result of subtracting 1 from the exponential function of ℝ(n).
            .exp_m1()
            .into())
    }

    /// Get the highest integer below a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.floor
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/floor
    pub(crate) fn floor(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, n is -0𝔽, n is +∞𝔽, or n is -∞𝔽, return n.
            // 3. If n < 1𝔽 and n > +0𝔽, return +0𝔽.
            // 4. If n is an integral Number, return n.
            // 5. Return the greatest (closest to +∞) integral Number value that is not greater than n.
            .floor()
            .into())
    }

    /// The `Math.f16round()` static method returns the nearest 16-bit half precision
    /// float representation of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.round
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/f16round
    #[allow(clippy::float_cmp)]
    #[cfg(feature = "float16")]
    pub(crate) fn f16round(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let num = args
            .get_or_undefined(0)
            //1. Let n be ? ToNumber(x).
            .to_number(context)?;

        // 2. If n is NaN, return NaN.
        // 3. If n is one of +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return n.
        // 4. Let n16 be the result of converting n to IEEE 754-2019 binary16 format using roundTiesToEven mode.
        // 5. Let n64 be the result of converting n16 to IEEE 754-2019 binary64 format.
        // 6. Return the ECMAScript Number value corresponding to n64.
        Ok(float16::f16::from_f64(num).to_f64().into())
    }

    /// Get the nearest 32-bit single precision float representation of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.fround
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround
    pub(crate) fn fround(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let n be ? ToNumber(x).
        let x = args.get_or_undefined(0).to_number(context)?;

        // 2. If n is NaN, return NaN.
        // 3. If n is one of +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return n.
        // 4. Let n32 be the result of converting n to a value in IEEE 754-2019 binary32 format using roundTiesToEven mode.
        // 5. Let n64 be the result of converting n32 to a value in IEEE 754-2019 binary64 format.
        // 6. Return the ECMAScript Number value corresponding to n64.
        Ok(f64::from(x as f32).into())
    }

    /// Get an approximation of the square root of the sum of squares of all arguments.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.hypot
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/hypot
    pub(crate) fn hypot(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let coerced be a new empty List.
        // 2. For each element arg of args, do
        // a. Let n be ? ToNumber(arg).
        // b. Append n to coerced.
        // 3. For each element number of coerced, do
        // 5. For each element number of coerced, do
        let mut result = 0f64;
        for arg in args {
            let num = arg.to_number(context)?;
            // a. If number is +∞𝔽 or number is -∞𝔽, return +∞𝔽.
            // 4. Let onlyZero be true.
            // a. If number is NaN, return NaN.
            // b. If number is neither +0𝔽 nor -0𝔽, set onlyZero to false.
            // 6. If onlyZero is true, return +0𝔽.
            // 7. Return an implementation-approximated value representing the square root of the sum of squares of the mathematical values of the elements of coerced.
            result = result.hypot(num);
        }

        Ok(result.into())
    }

    /// Get the result of the C-like 32-bit multiplication of the two parameters.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.imul
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul
    pub(crate) fn imul(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let a be ℝ(? ToUint32(x)).
        let x = args.get_or_undefined(0).to_u32(context)?;

        // 2. Let b be ℝ(? ToUint32(y)).
        let y = args.get_or_undefined(1).to_u32(context)?;

        // 3. Let product be (a × b) modulo 2^32.
        // 4. If product ≥ 2^31, return 𝔽(product - 2^32); otherwise return 𝔽(product).
        Ok((x.wrapping_mul(y) as i32).into())
    }

    /// Get the natural logarithm of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.log
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/log
    pub(crate) fn log(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN or n is +∞𝔽, return n.
            // 3. If n is 1𝔽, return +0𝔽.
            // 4. If n is +0𝔽 or n is -0𝔽, return -∞𝔽.
            // 5. If n < +0𝔽, return NaN.
            // 6. Return an implementation-approximated value representing the result of the natural logarithm of ℝ(n).
            .ln()
            .into())
    }

    /// Get approximation to the natural logarithm of 1 + x.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.log1p
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/log1p
    pub(crate) fn log1p(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, n is -0𝔽, or n is +∞𝔽, return n.
            // 3. If n is -1𝔽, return -∞𝔽.
            // 4. If n < -1𝔽, return NaN.
            // 5. Return an implementation-approximated value representing the result of the natural logarithm of 1 + ℝ(n).
            .ln_1p()
            .into())
    }

    /// Get the base 10 logarithm of the number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.log10
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/log10
    pub(crate) fn log10(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN or n is +∞𝔽, return n.
            // 3. If n is 1𝔽, return +0𝔽.
            // 4. If n is +0𝔽 or n is -0𝔽, return -∞𝔽.
            // 5. If n < +0𝔽, return NaN.
            // 6. Return an implementation-approximated value representing the result of the base 10 logarithm of ℝ(n).
            .log10()
            .into())
    }

    /// Get the base 2 logarithm of the number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.log2
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/log2
    pub(crate) fn log2(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN or n is +∞𝔽, return n.
            // 3. If n is 1𝔽, return +0𝔽.
            // 4. If n is +0𝔽 or n is -0𝔽, return -∞𝔽.
            // 5. If n < +0𝔽, return NaN.
            // 6. Return an implementation-approximated value representing the result of the base 2 logarithm of ℝ(n).
            .log2()
            .into())
    }

    /// Get the maximum of several numbers.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.max
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/max
    pub(crate) fn max(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let coerced be a new empty List.
        // 2. For each element arg of args, do
        // b. Append n to coerced.
        // 3. Let highest be -∞𝔽.
        let mut highest = f64::NEG_INFINITY;

        // 4. For each element number of coerced, do
        for arg in args {
            // a. Let n be ? ToNumber(arg).
            let num = arg.to_number(context)?;

            highest = if highest.is_nan() {
                continue;
            } else if num.is_nan() {
                // a. If number is NaN, return NaN.
                f64::NAN
            } else {
                match (highest, num) {
                    // b. When x and y are +0𝔽 -0𝔽, return +0𝔽.
                    (x, y) if x == 0f64 && y == 0f64 && x.signum() != y.signum() => 0f64,
                    // c. Otherwise, return the maximum value.
                    (x, y) => x.max(y),
                }
            };
        }
        // 5. Return highest.
        Ok(highest.into())
    }

    /// Get the minimum of several numbers.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.min
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/min
    pub(crate) fn min(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let coerced be a new empty List.
        // 2. For each element arg of args, do
        // b. Append n to coerced.
        // 3. Let lowest be +∞𝔽.
        let mut lowest = f64::INFINITY;

        // 4. For each element number of coerced, do
        for arg in args {
            // a. Let n be ? ToNumber(arg).
            let num = arg.to_number(context)?;

            lowest = if lowest.is_nan() {
                continue;
            } else if num.is_nan() {
                // a. If number is NaN, return NaN.
                f64::NAN
            } else {
                match (lowest, num) {
                    // b. When x and y are +0𝔽 -0𝔽, return -0𝔽.
                    (x, y) if x == 0f64 && y == 0f64 && x.signum() != y.signum() => -0f64,
                    // c. Otherwise, return the minimum value.
                    (x, y) => x.min(y),
                }
            };
        }
        // 5. Return lowest.
        Ok(lowest.into())
    }

    /// Raise a number to a power.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.pow
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/pow
    #[allow(clippy::float_cmp)]
    pub(crate) fn pow(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Set base to ? ToNumber(base).
        let x = args.get_or_undefined(0).to_number(context)?;

        // 2. Set exponent to ? ToNumber(exponent).
        let y = args.get_or_undefined(1).to_number(context)?;

        // 3. Return Number::exponentiate(base, exponent).

        // https://github.com/rust-lang/rust/issues/60468

        // https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-exponentiate
        // 6.1.6.1.3 Number::exponentiate ( base, exponent )
        //  1. If exponent is NaN, return NaN.
        if y.is_nan() {
            return Ok(f64::NAN.into());
        }

        // 9. If exponent is +∞𝔽, then
        //   a. If abs(ℝ(base)) > 1, return +∞𝔽.
        //   b. If abs(ℝ(base)) = 1, return NaN.
        //   c. If abs(ℝ(base)) < 1, return +0𝔽.
        // 10. If exponent is -∞𝔽, then
        //   a. If abs(ℝ(base)) > 1, return +0𝔽.
        //   b. If abs(ℝ(base)) = 1, return NaN.
        //   c. If abs(ℝ(base)) < 1, return +∞𝔽.
        if f64::abs(x) == 1f64 && y.is_infinite() {
            return Ok(f64::NAN.into());
        }

        Ok(x.powf(y).into())
    }

    /// Generate a random floating-point number between `0` and `1`.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.random
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn random(_: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // NOTE: Each Math.random function created for distinct realms must produce a distinct sequence of values from successive calls.
        Ok(rand::random::<f64>().into())
    }

    /// Round a number to the nearest integer.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.round
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round
    #[allow(clippy::float_cmp)]
    pub(crate) fn round(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let num = args
            .get_or_undefined(0)
            //1. Let n be ? ToNumber(x).
            .to_number(context)?;

        //2. If n is NaN, +∞𝔽, -∞𝔽, or an integral Number, return n.
        //3. If n < 0.5𝔽 and n > +0𝔽, return +0𝔽.
        //4. If n < +0𝔽 and n ≥ -0.5𝔽, return -0𝔽.
        //5. Return the integral Number closest to n, preferring the Number closer to +∞ in the case of a tie.

        if num.fract() == -0.5 {
            Ok(num.ceil().into())
        } else {
            Ok(num.round().into())
        }
    }

    /// Get the sign of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.sign
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/sign
    pub(crate) fn sign(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let n be ? ToNumber(x).
        let n = args.get_or_undefined(0).to_number(context)?;

        // 2. If n is NaN, n is +0𝔽, or n is -0𝔽, return n.
        if n == 0f64 {
            return Ok(n.into());
        }
        // 3. If n < +0𝔽, return -1𝔽.
        // 4. Return 1𝔽.
        Ok(n.signum().into())
    }

    /// Get the sine of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.sin
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/sin
    pub(crate) fn sin(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, or n is -0𝔽, return n.
            // 3. If n is +∞𝔽 or n is -∞𝔽, return NaN.
            // 4. Return an implementation-approximated value representing the result of the sine of ℝ(n).
            .sin()
            .into())
    }

    /// Get the hyperbolic sine of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.sinh
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/sinh
    pub(crate) fn sinh(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, n is -0𝔽, n is +∞𝔽, or n is -∞𝔽, return n.
            // 3. Return an implementation-approximated value representing the result of the hyperbolic sine of ℝ(n).
            .sinh()
            .into())
    }

    /// Get the square root of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.sqrt
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/sqrt
    pub(crate) fn sqrt(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, n is -0𝔽, or n is +∞𝔽, return n.
            // 3. If n < +0𝔽, return NaN.
            // 4. Return an implementation-approximated value representing the result of the square root of ℝ(n).
            .sqrt()
            .into())
    }

    /// Get the tangent of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.tan
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/tan
    pub(crate) fn tan(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, or n is -0𝔽, return n.
            // 3. If n is +∞𝔽, or n is -∞𝔽, return NaN.
            // 4. Return an implementation-approximated value representing the result of the tangent of ℝ(n).
            .tan()
            .into())
    }

    /// Get the hyperbolic tangent of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.tanh
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/tanh
    pub(crate) fn tanh(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, or n is -0𝔽, return n.
            // 3. If n is +∞𝔽, return 1𝔽.
            // 4. If n is -∞𝔽, return -1𝔽.
            // 5. Return an implementation-approximated value representing the result of the hyperbolic tangent of ℝ(n).
            .tanh()
            .into())
    }

    /// Get the integer part of a number.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.trunc
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc
    pub(crate) fn trunc(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(args
            .get_or_undefined(0)
            // 1. Let n be ? ToNumber(x).
            .to_number(context)?
            // 2. If n is NaN, n is +0𝔽, n is -0𝔽, n is +∞𝔽, or n is -∞𝔽, return n.
            // 3. If n < 1𝔽 and n > +0𝔽, return +0𝔽.
            // 4. If n < +0𝔽 and n > -1𝔽, return -0𝔽.
            // 5. Return the integral Number nearest n in the direction of +0𝔽.
            .trunc()
            .into())
    }

    /// Sum each value in an iterable
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-math.sumprecise
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/sumPrecise
    #[cfg(feature = "xsum")]
    pub(crate) fn sum_precise(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        const ITERATION_MAX: u64 = 2u64.pow(53) - 1;
        use xsum::{Xsum, XsumLarge, XsumSmall, XsumVariant, constants::XSUM_THRESHOLD};

        use crate::{builtins::iterable::IteratorHint, js_error};

        let items = args.get_or_undefined(0);
        // NOTE (nekevss): inline `RequireObjectCoercible`
        // 1. Perform ? RequireObjectCoercible(items).
        // RequireObjectCoercible, 1. If argument is either undefined or null, throw a TypeError exception.
        // RequireObjectCoercible, 2. Return argument.
        if items.is_null_or_undefined() {
            return Err(js_error!(TypeError: "value must be object coercible."));
        }

        // 2. Let iteratorRecord be ? GetIterator(items, sync).
        let mut iterator_record = items.get_iterator(IteratorHint::Sync, context)?;
        // 3. Let state be minus-zero.
        // 4. Let sum be 0.
        let length = if iterator_record.iterator().is_array() {
            iterator_record
                .iterator()
                .length_of_array_like(context)
                .ok()
        } else {
            None
        };
        let mut sum = if let Some(length) = length {
            if length <= XSUM_THRESHOLD as u64 {
                XsumVariant::Small(XsumSmall::new())
            } else {
                XsumVariant::Large(XsumLarge::new())
            }
        } else {
            XsumVariant::Small(XsumSmall::new())
        };
        // 5. Let count be 0.
        let mut count = 0;
        // 6. Let next be not-started.
        // 7. Repeat, while next is not done,
        // a. Set next to ? IteratorStepValue(iteratorRecord).
        while let Some(next) = iterator_record.step_value(context)? {
            // b. If next is not done, then
            // i. If count ≥ 2**53 - 1, then
            if count >= ITERATION_MAX {
                // 1. NOTE: This step is not expected to be reached in practice and is
                // included only so that implementations may rely on inputs being
                // "reasonably sized" without violating this specification.
                // 2. Let error be ThrowCompletion(a newly created RangeError object).
                let err = Err(js_error!(RangeError: "Summation exceeded maximum iterations"));
                // 3. Return ? IteratorClose(iteratorRecord, error).
                return iterator_record.close(err, context);
            }
            // ii. If next is not a Number, then
            let Some(number) = next.as_number() else {
                // 1. Let error be ThrowCompletion(a newly created TypeError object).
                let err = Err(js_error!(TypeError: "sumPrecise can only be called on a number."));
                // 2. Return ? IteratorClose(iteratorRecord, error).
                return iterator_record.close(err, context);
            };
            // iii. Let n be next.
            // iv. If state is not not-a-number, then
            // 1. If n is NaN, then
            // a. Set state to not-a-number.
            // 2. Else if n is +∞𝔽, then
            // a. If state is minus-infinity, set state to not-a-number.
            // b. Else, set state to plus-infinity.
            // 3. Else if n is -∞𝔽, then
            // a. If state is plus-infinity, set state to not-a-number.
            // b. Else, set state to minus-infinity.
            // 4. Else if n is not -0𝔽 and state is either minus-zero or finite, then
            // a. Set state to finite.
            // b. Set sum to sum + ℝ(n).
            sum.add(number);
            // v. Set count to count + 1.
            count += 1;
        }
        // 8. If state is not-a-number, return NaN.
        // 9. If state is plus-infinity, return +∞𝔽.
        // 10. If state is minus-infinity, return -∞𝔽.
        // 11. If state is minus-zero, return -0𝔽.
        // 12. Return 𝔽(sum).
        Ok(sum.sum().into())
    }
}
