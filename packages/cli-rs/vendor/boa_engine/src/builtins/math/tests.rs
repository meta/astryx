use crate::{TestAction, run_test_actions};

#[test]
fn abs() {
    run_test_actions([
        TestAction::assert_eq("Math.abs(3 - 5)", 2.0),
        TestAction::assert_eq("Math.abs(1.23456 - 7.89012)", 6.655_559_999_999_999_5),
    ]);
}

#[test]
fn acos() {
    run_test_actions([
        TestAction::assert_eq("Math.acos(8 / 10)", 0.643_501_108_793_284_3),
        TestAction::assert_eq("Math.acos(5 / 3)", f64::NAN),
        TestAction::assert_eq("Math.acos(1)", 0.0),
        TestAction::assert_eq("Math.acos(2)", f64::NAN),
    ]);
}

#[test]
fn acosh() {
    run_test_actions([
        TestAction::assert_with_op("Math.acosh(2)", |v, _| {
            float_cmp::approx_eq!(f64, v.as_number().unwrap(), 1.316_957_896_924_816_6)
        }),
        TestAction::assert_eq("Math.acosh(-1)", f64::NAN),
        TestAction::assert_eq("Math.acosh(0.5)", f64::NAN),
        TestAction::assert_eq("Math.acosh(1e308)", 709.889_355_822_726_f64),
        TestAction::assert_eq("Math.acosh(Number.MAX_VALUE)", 710.475_860_073_943_9_f64),
    ]);
}

#[test]
fn asin() {
    run_test_actions([
        TestAction::assert_eq("Math.asin(6 / 10)", 0.643_501_108_793_284_4),
        TestAction::assert_eq("Math.asin(5 / 3)", f64::NAN),
    ]);
}

#[test]
fn asinh() {
    run_test_actions([
        TestAction::assert_eq("Math.asinh(1)", 0.881_373_587_019_543),
        TestAction::assert_eq("Math.asinh(0)", 0.0),
        TestAction::assert_eq("Math.asinh(1e308)", 709.889_355_822_726_f64),
        TestAction::assert_eq("Math.asinh(-1e308)", -709.889_355_822_726_f64),
        TestAction::assert_eq("Math.asinh(Number.MAX_VALUE)", 710.475_860_073_943_9_f64),
    ]);
}

#[test]
fn atan() {
    run_test_actions([
        TestAction::assert_eq("Math.atan(1)", std::f64::consts::FRAC_PI_4),
        TestAction::assert_eq("Math.atan(0)", 0.0),
        TestAction::assert_eq("Math.atan(-0)", -0.0),
    ]);
}

#[test]
fn atan2() {
    run_test_actions([
        TestAction::assert_eq("Math.atan2(90, 15)", 1.405_647_649_380_269_9),
        TestAction::assert_eq("Math.atan2(15, 90)", 0.165_148_677_414_626_83),
    ]);
}

#[test]
fn cbrt() {
    run_test_actions([
        TestAction::assert_eq("Math.cbrt(64)", 4.0),
        TestAction::assert_eq("Math.cbrt(-1)", -1.0),
        TestAction::assert_eq("Math.cbrt(1)", 1.0),
    ]);
}

#[test]
fn ceil() {
    run_test_actions([
        TestAction::assert_eq("Math.ceil(1.95)", 2.0),
        TestAction::assert_eq("Math.ceil(4)", 4.0),
        TestAction::assert_eq("Math.ceil(-7.004)", -7.0),
    ]);
}

#[test]
fn clz32() {
    run_test_actions([
        TestAction::assert_eq("Math.clz32()", 32),
        TestAction::assert_eq("Math.clz32({})", 32),
        TestAction::assert_eq("Math.clz32(-173)", 0),
        TestAction::assert_eq("Math.clz32('1')", 31),
        TestAction::assert_eq("Math.clz32(2147483647)", 1),
        TestAction::assert_eq("Math.clz32(Infinity)", 32),
        TestAction::assert_eq("Math.clz32(true)", 31),
        TestAction::assert_eq("Math.clz32(0)", 32),
    ]);
}

#[test]
fn cos() {
    run_test_actions([
        TestAction::assert_eq("Math.cos(0)", 1.0),
        TestAction::assert_eq("Math.cos(1)", 0.540_302_305_868_139_8),
    ]);
}

#[test]
fn cosh() {
    run_test_actions([
        TestAction::assert_eq("Math.cosh(0)", 1.0),
        TestAction::assert_eq("Math.cosh(1)", 1.543_080_634_815_243_7),
        TestAction::assert_eq("Math.cosh(-1)", 1.543_080_634_815_243_7),
    ]);
}

#[test]
fn exp() {
    run_test_actions([
        TestAction::assert_eq("Math.exp(0)", 1.0),
        TestAction::assert_eq("Math.exp(-1)", 0.367_879_441_171_442_33),
        TestAction::assert_eq("Math.exp(2)", 7.389_056_098_930_65),
    ]);
}

#[test]
fn expm1() {
    run_test_actions([
        TestAction::assert_eq("Math.expm1()", f64::NAN),
        TestAction::assert_eq("Math.expm1({})", f64::NAN),
        TestAction::assert_with_op("Math.expm1(1)", |v, _| {
            float_cmp::approx_eq!(f64, v.as_number().unwrap(), 1.718_281_828_459_045)
        }),
        TestAction::assert_with_op("Math.expm1(-1)", |v, _| {
            float_cmp::approx_eq!(f64, v.as_number().unwrap(), -0.632_120_558_828_557_7)
        }),
        TestAction::assert_with_op("Math.expm1(0)", |v, _| {
            float_cmp::approx_eq!(f64, v.as_number().unwrap(), 0.0)
        }),
        TestAction::assert_with_op("Math.expm1(2)", |v, _| {
            float_cmp::approx_eq!(f64, v.as_number().unwrap(), 6.389_056_098_930_65)
        }),
    ]);
}

#[test]
fn floor() {
    run_test_actions([
        TestAction::assert_eq("Math.floor(1.95)", 1.0),
        TestAction::assert_eq("Math.floor(-3.01)", -4.0),
        TestAction::assert_eq("Math.floor(3.01)", 3.0),
    ]);
}

#[test]
fn fround() {
    run_test_actions([
        TestAction::assert_eq("Math.fround(NaN)", f64::NAN),
        TestAction::assert_eq("Math.fround(Infinity)", f64::INFINITY),
        TestAction::assert_eq("Math.fround(5)", 5.0),
        TestAction::assert_eq("Math.fround(5.5)", 5.5),
        TestAction::assert_eq("Math.fround(5.05)", 5.050_000_190_734_863),
        TestAction::assert_eq("Math.fround(-5.05)", -5.050_000_190_734_863),
        TestAction::assert_eq("Math.fround()", f64::NAN),
    ]);
}

#[test]
fn hypot() {
    run_test_actions([
        TestAction::assert_eq("Math.hypot()", 0.0),
        TestAction::assert_eq("Math.hypot(3, 4)", 5.0),
        TestAction::assert_eq("Math.hypot(5, 12)", 13.0),
        TestAction::assert_eq("Math.hypot(3, 4, -5)", 7.071_067_811_865_475_5),
        TestAction::assert_eq("Math.hypot(4, [5], 6)", 8.774_964_387_392_123),
        TestAction::assert_eq("Math.hypot(3, -Infinity)", f64::INFINITY),
        TestAction::assert_eq("Math.hypot(12)", 12.0),
    ]);
}

#[test]
fn imul() {
    run_test_actions([
        TestAction::assert_eq("Math.imul(3, 4)", 12),
        TestAction::assert_eq("Math.imul(-5, 12)", -60),
        TestAction::assert_eq("Math.imul(0xffffffff, 5)", -5),
        TestAction::assert_eq("Math.imul(0xfffffffe, 5)", -10),
        TestAction::assert_eq("Math.imul(12)", 0),
        TestAction::assert_eq("Math.imul()", 0),
    ]);
}

#[test]
fn log() {
    run_test_actions([
        TestAction::assert_eq("Math.log(1)", 0.0),
        TestAction::assert_eq("Math.log(10)", std::f64::consts::LN_10),
        TestAction::assert_eq("Math.log(-1)", f64::NAN),
    ]);
}

#[test]
fn log1p() {
    run_test_actions([
        TestAction::assert_eq("Math.log1p(1)", std::f64::consts::LN_2),
        TestAction::assert_eq("Math.log1p(0)", 0.0),
        TestAction::assert_eq("Math.log1p(-0.9999999999999999)", -36.736_800_569_677_1),
        TestAction::assert_eq("Math.log1p(-1)", f64::NEG_INFINITY),
        TestAction::assert_eq("Math.log1p(-1.000000000000001)", f64::NAN),
        TestAction::assert_eq("Math.log1p(-2)", f64::NAN),
        TestAction::assert_eq("Math.log1p()", f64::NAN),
    ]);
}

#[test]
fn log10() {
    run_test_actions([
        TestAction::assert_eq("Math.log10(2)", std::f64::consts::LOG10_2),
        TestAction::assert_eq("Math.log10(1)", 0.0),
        TestAction::assert_eq("Math.log10(-2)", f64::NAN),
    ]);
}

#[test]
fn log2() {
    run_test_actions([
        TestAction::assert_eq("Math.log2(3)", 1.584_962_500_721_156),
        TestAction::assert_eq("Math.log2(1)", 0.0),
        TestAction::assert_eq("Math.log2(-2)", f64::NAN),
    ]);
}

#[test]
fn max() {
    run_test_actions([
        TestAction::assert_eq("Math.max(10, 20)", 20.0),
        TestAction::assert_eq("Math.max(-10, -20)", -10.0),
        TestAction::assert_eq("Math.max(-10, 20)", 20.0),
    ]);
}

#[test]
fn min() {
    run_test_actions([
        TestAction::assert_eq("Math.min(10, 20)", 10.0),
        TestAction::assert_eq("Math.min(-10, -20)", -20.0),
        TestAction::assert_eq("Math.min(-10, 20)", -10.0),
    ]);
}

#[test]
fn pow() {
    run_test_actions([
        TestAction::assert_eq("Math.pow(2, 10)", 1_024.0),
        TestAction::assert_eq("Math.pow(-7, 2)", 49.0),
        TestAction::assert_eq("Math.pow(4, 0.5)", 2.0),
        TestAction::assert_eq("Math.pow(7, -2)", 0.020_408_163_265_306_12),
        TestAction::assert_eq("Math.pow(1, NaN)", f64::NAN),
        TestAction::assert_eq("Math.pow(1, Infinity)", f64::NAN),
        TestAction::assert_eq("Math.pow(1, -Infinity)", f64::NAN),
        TestAction::assert_eq("Math.pow(-1, Infinity)", f64::NAN),
        TestAction::assert_eq("Math.pow(-1, -Infinity)", f64::NAN),
    ]);
}

#[test]
fn round() {
    run_test_actions([
        TestAction::assert_eq("Math.round(20.5)", 21.0),
        TestAction::assert_eq("Math.round(-20.3)", -20.0),
    ]);
}

#[test]
fn sign() {
    run_test_actions([
        TestAction::assert_eq("Math.sign(3)", 1.0),
        TestAction::assert_eq("Math.sign(-3)", -1.0),
        TestAction::assert_eq("Math.sign(0)", 0.0),
    ]);
}

#[test]
fn sin() {
    run_test_actions([
        TestAction::assert_eq("Math.sin(0)", 0.0),
        TestAction::assert_eq("Math.sin(1)", 0.841_470_984_807_896_5),
    ]);
}

#[test]
fn sinh() {
    run_test_actions([
        TestAction::assert_eq("Math.sinh(0)", 0.0),
        TestAction::assert_eq("Math.sinh(1)", 1.175_201_193_643_801_4),
    ]);
}

#[test]
fn sqrt() {
    run_test_actions([
        TestAction::assert_eq("Math.sqrt(0)", 0.0),
        TestAction::assert_eq("Math.sqrt(2)", std::f64::consts::SQRT_2),
        TestAction::assert_eq("Math.sqrt(9)", 3.0),
    ]);
}

#[test]
fn tan() {
    run_test_actions([TestAction::assert_with_op("Math.tan(1.1)", |v, _| {
        float_cmp::approx_eq!(f64, v.as_number().unwrap(), 1.964_759_657_248_652_5)
    })]);
}

#[test]
fn tanh() {
    run_test_actions([
        TestAction::assert_eq("Math.tanh(1)", 0.761_594_155_955_764_9),
        TestAction::assert_eq("Math.tanh(0)", 0.0),
    ]);
}

#[test]
fn trunc() {
    run_test_actions([
        TestAction::assert_eq("Math.trunc(13.37)", 13.0),
        TestAction::assert_eq("Math.trunc(0.123)", 0.0),
    ]);
}
