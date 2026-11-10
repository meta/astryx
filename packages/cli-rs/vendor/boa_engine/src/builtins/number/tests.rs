use boa_macros::js_str;

use crate::{
    JsNativeErrorKind, TestAction, builtins::Number, run_test_actions, value::AbstractRelation,
};

#[test]
fn integer_number_primitive_to_number_object() {
    run_test_actions([TestAction::assert_eq("(100).toString()", js_str!("100"))]);
}

#[test]
fn call_number() {
    run_test_actions([
        TestAction::assert_eq("Number()", 0),
        TestAction::assert_eq("Number(1)", 1),
        TestAction::assert_eq("Number(2.1)", 2.1),
        TestAction::assert_eq("Number('3.2')", 3.2),
        TestAction::assert_eq("Number(true)", 1),
        TestAction::assert_eq("Number(false)", 0),
        TestAction::assert_eq("Number('I am not a number')", f64::NAN),
        TestAction::assert_eq("Number('2.34e+2')", 234),
    ]);
}

#[test]
fn to_exponential() {
    run_test_actions([
        TestAction::assert_eq("Number().toExponential()", js_str!("0e+0")),
        TestAction::assert_eq("Number(5).toExponential()", js_str!("5e+0")),
        TestAction::assert_eq("Number(1.234).toExponential()", js_str!("1.234e+0")),
        TestAction::assert_eq("Number(1234).toExponential()", js_str!("1.234e+3")),
        TestAction::assert_eq(
            "Number('I am also not a number').toExponential()",
            js_str!("NaN"),
        ),
        TestAction::assert_eq("Number('1.23e+2').toExponential()", js_str!("1.23e+2")),
    ]);
}

#[test]
fn to_fixed() {
    run_test_actions([
        TestAction::assert_eq("Number().toFixed()", js_str!("0")),
        TestAction::assert_eq("Number('3.456e+4').toFixed()", js_str!("34560")),
        TestAction::assert_eq("Number('3.456e-4').toFixed()", js_str!("0")),
        TestAction::assert_eq("Number(5).toFixed()", js_str!("5")),
        TestAction::assert_eq("Number('I am also not a number').toFixed()", js_str!("NaN")),
        TestAction::assert_eq("(1.35).toFixed(1)", js_str!("1.4")),
        // Test cases from https://source.chromium.org/chromium/chromium/src/+/main:v8/test/mjsunit/number-tostring-func.js;l=157-240;drc=aa3518a0f37245ebe8f062dce97ee492e2a41652
        TestAction::assert_eq("(NaN).toFixed(2)", js_str!("NaN")),
        TestAction::assert_eq("(1/0).toFixed(2)", js_str!("Infinity")),
        TestAction::assert_eq("(-1/0).toFixed(2)", js_str!("-Infinity")),
        TestAction::assert_eq(
            "(1111111111111111111111).toFixed(8)",
            js_str!("1.1111111111111111e+21"),
        ),
        TestAction::assert_eq("(0.1).toFixed(1)", js_str!("0.1")),
        TestAction::assert_eq("(0.1).toFixed(2)", js_str!("0.10")),
        TestAction::assert_eq("(0.1).toFixed(3)", js_str!("0.100")),
        TestAction::assert_eq("(0.01).toFixed(2)", js_str!("0.01")),
        TestAction::assert_eq("(0.01).toFixed(3)", js_str!("0.010")),
        TestAction::assert_eq("(0.01).toFixed(4)", js_str!("0.0100")),
        TestAction::assert_eq("(0.001).toFixed(2)", js_str!("0.00")),
        TestAction::assert_eq("(0.001).toFixed(3)", js_str!("0.001")),
        TestAction::assert_eq("(0.001).toFixed(4)", js_str!("0.0010")),
        TestAction::assert_eq("(1).toFixed(4)", js_str!("1.0000")),
        TestAction::assert_eq("(1).toFixed(1)", js_str!("1.0")),
        TestAction::assert_eq("(1).toFixed(0)", js_str!("1")),
        TestAction::assert_eq("(12).toFixed(0)", js_str!("12")),
        TestAction::assert_eq("(1.1).toFixed(0)", js_str!("1")),
        TestAction::assert_eq("(12.1).toFixed(0)", js_str!("12")),
        TestAction::assert_eq("(1.12).toFixed(0)", js_str!("1")),
        TestAction::assert_eq("(12.12).toFixed(0)", js_str!("12")),
        TestAction::assert_eq("(0.0000006).toFixed(7)", js_str!("0.0000006")),
        TestAction::assert_eq("(0.00000006).toFixed(8)", js_str!("0.00000006")),
        TestAction::assert_eq("(0.00000006).toFixed(9)", js_str!("0.000000060")),
        TestAction::assert_eq("(0.00000006).toFixed(10)", js_str!("0.0000000600")),
        TestAction::assert_eq("(0).toFixed(0)", js_str!("0")),
        TestAction::assert_eq("(0).toFixed(1)", js_str!("0.0")),
        TestAction::assert_eq("(0).toFixed(2)", js_str!("0.00")),
        TestAction::assert_eq(
            "(-1111111111111111111111).toFixed(8)",
            js_str!("-1.1111111111111111e+21"),
        ),
        TestAction::assert_eq("(-0.1).toFixed(1)", js_str!("-0.1")),
        TestAction::assert_eq("(-0.1).toFixed(2)", js_str!("-0.10")),
        TestAction::assert_eq("(-0.1).toFixed(3)", js_str!("-0.100")),
        TestAction::assert_eq("(-0.01).toFixed(2)", js_str!("-0.01")),
        TestAction::assert_eq("(-0.01).toFixed(3)", js_str!("-0.010")),
        TestAction::assert_eq("(-0.01).toFixed(4)", js_str!("-0.0100")),
        TestAction::assert_eq("(-0.001).toFixed(2)", js_str!("-0.00")),
        TestAction::assert_eq("(-0.001).toFixed(3)", js_str!("-0.001")),
        TestAction::assert_eq("(-0.001).toFixed(4)", js_str!("-0.0010")),
        TestAction::assert_eq("(-1).toFixed(4)", js_str!("-1.0000")),
        TestAction::assert_eq("(-1).toFixed(1)", js_str!("-1.0")),
        TestAction::assert_eq("(-1).toFixed(0)", js_str!("-1")),
        TestAction::assert_eq("(-1.1).toFixed(0)", js_str!("-1")),
        TestAction::assert_eq("(-12.1).toFixed(0)", js_str!("-12")),
        TestAction::assert_eq("(-1.12).toFixed(0)", js_str!("-1")),
        TestAction::assert_eq("(-12.12).toFixed(0)", js_str!("-12")),
        TestAction::assert_eq("(-0.0000006).toFixed(7)", js_str!("-0.0000006")),
        TestAction::assert_eq("(-0.00000006).toFixed(8)", js_str!("-0.00000006")),
        TestAction::assert_eq("(-0.00000006).toFixed(9)", js_str!("-0.000000060")),
        TestAction::assert_eq("(-0.00000006).toFixed(10)", js_str!("-0.0000000600")),
        TestAction::assert_eq("(-0).toFixed(0)", js_str!("0")),
        TestAction::assert_eq("(-0).toFixed(1)", js_str!("0.0")),
        TestAction::assert_eq("(-0).toFixed(2)", js_str!("0.00")),
        TestAction::assert_eq("(0.00001).toFixed(5)", js_str!("0.00001")),
        TestAction::assert_eq(
            "(0.0000000000000000001).toFixed(20)",
            js_str!("0.00000000000000000010"),
        ),
        TestAction::assert_eq("(0.00001).toFixed(17)", js_str!("0.00001000000000000")),
        TestAction::assert_eq("(1).toFixed(17)", js_str!("1.00000000000000000")),
        TestAction::assert_eq(
            "(100000000000000128).toFixed(1)",
            js_str!("100000000000000128.0"),
        ),
        TestAction::assert_eq(
            "(10000000000000128).toFixed(2)",
            js_str!("10000000000000128.00"),
        ),
        TestAction::assert_eq(
            "(10000000000000128).toFixed(20)",
            js_str!("10000000000000128.00000000000000000000"),
        ),
        TestAction::assert_eq("(-42).toFixed(3)", js_str!("-42.000")),
        TestAction::assert_eq(
            "(-0.0000000000000000001).toFixed(20)",
            js_str!("-0.00000000000000000010"),
        ),
        TestAction::assert_eq(
            "(0.123123123123123).toFixed(20)",
            js_str!("0.12312312312312299889"),
        ),
        TestAction::assert_eq(
            "(-1000000000000000128).toFixed()",
            js_str!("-1000000000000000128"),
        ),
        TestAction::assert_eq("(0).toFixed()", js_str!("0")),
        TestAction::assert_eq(
            "(1000000000000000128).toFixed()",
            js_str!("1000000000000000128"),
        ),
        TestAction::assert_eq("(1000).toFixed()", js_str!("1000")),
        TestAction::assert_eq("(0.00001).toFixed()", js_str!("0")),
        // Test that we round up even when the last digit generated is even.
        // dtoa does not do this in its original form.
        TestAction::assert_eq("(0.5).toFixed(0)", js_str!("1")),
        TestAction::assert_eq("(-0.5).toFixed(0)", js_str!("-1")),
        TestAction::assert_eq("(1.25).toFixed(1)", js_str!("1.3")),
        // This is bizarre, but Spidermonkey and KJS behave the same.
        TestAction::assert_eq("(234.2040).toFixed(4)", js_str!("234.2040")),
        TestAction::assert_eq("(234.2040506).toFixed(4)", js_str!("234.2041")),
    ]);
}

// https://github.com/boa-dev/boa/issues/2609
#[test]
fn issue_2609() {
    run_test_actions([
        TestAction::assert_eq("(1.25).toFixed(1)", js_str!("1.3")),
        TestAction::assert_eq("(1.35).toFixed(1)", js_str!("1.4")),
    ]);
}

#[test]
fn to_locale_string() {
    run_test_actions([
        TestAction::assert_eq("Number().toLocaleString()", js_str!("0")),
        TestAction::assert_eq("Number(5).toLocaleString()", js_str!("5")),
        TestAction::assert_eq("Number(-25).toLocaleString()", js_str!("-25")),
        TestAction::assert_eq("NaN.toLocaleString()", js_str!("NaN")),
        TestAction::assert_eq("Infinity.toLocaleString()", js_str!("Infinity")),
        TestAction::assert_eq("(-Infinity).toLocaleString()", js_str!("-Infinity")),
    ]);
}

#[test]
#[cfg(feature = "intl")]
fn to_locale_string_intl() {
    run_test_actions([
        TestAction::assert_eq("(345600).toLocaleString('en-US')", js_str!("345,600")),
        TestAction::assert_eq("(1234.5).toLocaleString('de-DE')", js_str!("1.234,5")),
        TestAction::assert_eq(
            "(1000).toLocaleString('en-US', { useGrouping: false })",
            js_str!("1000"),
        ),
        TestAction::assert_eq(
            "(12.3).toLocaleString('en-US', { minimumFractionDigits: 2 })",
            js_str!("12.30"),
        ),
    ]);
}

#[test]
fn to_precision() {
    const ERROR: &str = "precision must be an integer at least 1 and no greater than 100";
    run_test_actions([
        TestAction::assert_eq("(1/0).toPrecision(3)", js_str!("Infinity")),
        TestAction::assert_eq("Number().toPrecision()", js_str!("0")),
        TestAction::assert_eq("Number().toPrecision(undefined)", js_str!("0")),
        TestAction::assert_eq("(123456789).toPrecision(1)", js_str!("1e+8")),
        TestAction::assert_eq("(123456789).toPrecision(4)", js_str!("1.235e+8")),
        TestAction::assert_eq("(123456789).toPrecision(9)", js_str!("123456789")),
        TestAction::assert_eq("(-123456789).toPrecision(4)", js_str!("-1.235e+8")),
        TestAction::assert_eq(
            "(123456789).toPrecision(50)",
            js_str!("123456789.00000000000000000000000000000000000000000"),
        ),
        TestAction::assert_eq("(0.1).toPrecision(4)", js_str!("0.1000")),
        TestAction::assert_eq(
            "(1/3).toPrecision(60)",
            js_str!("0.333333333333333314829616256247390992939472198486328125000000"),
        ),
        TestAction::assert_native_error("(1).toPrecision(101)", JsNativeErrorKind::Range, ERROR),
        TestAction::assert_native_error("(1).toPrecision(0)", JsNativeErrorKind::Range, ERROR),
        TestAction::assert_native_error("(1).toPrecision(-2000)", JsNativeErrorKind::Range, ERROR),
        TestAction::assert_native_error("(1).toPrecision('%')", JsNativeErrorKind::Range, ERROR),
    ]);
}

#[test]
fn to_string() {
    run_test_actions([
        TestAction::assert_eq("Number(NaN).toString()", js_str!("NaN")),
        TestAction::assert_eq("Number(1/0).toString()", js_str!("Infinity")),
        TestAction::assert_eq("Number(-1/0).toString()", js_str!("-Infinity")),
        TestAction::assert_eq("Number(0).toString()", js_str!("0")),
        TestAction::assert_eq("Number(9).toString()", js_str!("9")),
        TestAction::assert_eq("Number(90).toString()", js_str!("90")),
        TestAction::assert_eq("Number(90.12).toString()", js_str!("90.12")),
        TestAction::assert_eq("Number(0.1).toString()", js_str!("0.1")),
        TestAction::assert_eq("Number(0.01).toString()", js_str!("0.01")),
        TestAction::assert_eq("Number(0.0123).toString()", js_str!("0.0123")),
        TestAction::assert_eq("Number(0.00001).toString()", js_str!("0.00001")),
        TestAction::assert_eq("Number(0.000001).toString()", js_str!("0.000001")),
        TestAction::assert_eq("Number(NaN).toString(16)", js_str!("NaN")),
        TestAction::assert_eq("Number(1/0).toString(16)", js_str!("Infinity")),
        TestAction::assert_eq("Number(-1/0).toString(16)", js_str!("-Infinity")),
        TestAction::assert_eq("Number(0).toString(16)", js_str!("0")),
        TestAction::assert_eq("Number(9).toString(16)", js_str!("9")),
        TestAction::assert_eq("Number(90).toString(16)", js_str!("5a")),
        TestAction::assert_eq("Number(90.12).toString(16)", js_str!("5a.1eb851eb852")),
        TestAction::assert_eq("Number(0.1).toString(16)", js_str!("0.1999999999999a")),
        TestAction::assert_eq("Number(0.01).toString(16)", js_str!("0.028f5c28f5c28f6")),
        TestAction::assert_eq("Number(0.0123).toString(16)", js_str!("0.032617c1bda511a")),
        TestAction::assert_eq(
            "Number(111111111111111111111).toString(16)",
            js_str!("605f9f6dd18bc8000"),
        ),
        TestAction::assert_eq(
            "Number(1111111111111111111111).toString(16)",
            js_str!("3c3bc3a4a2f75c0000"),
        ),
        TestAction::assert_eq(
            "Number(11111111111111111111111).toString(16)",
            js_str!("25a55a46e5da9a00000"),
        ),
        TestAction::assert_eq(
            "Number(0.00001).toString(16)",
            js_str!("0.0000a7c5ac471b4788"),
        ),
        TestAction::assert_eq(
            "Number(0.000001).toString(16)",
            js_str!("0.000010c6f7a0b5ed8d"),
        ),
        TestAction::assert_eq(
            "Number(0.0000001).toString(16)",
            js_str!("0.000001ad7f29abcaf48"),
        ),
        TestAction::assert_eq(
            "Number(0.00000012).toString(16)",
            js_str!("0.000002036565348d256"),
        ),
        TestAction::assert_eq(
            "Number(0.000000123).toString(16)",
            js_str!("0.0000021047ee22aa466"),
        ),
        TestAction::assert_eq(
            "Number(0.00000001).toString(16)",
            js_str!("0.0000002af31dc4611874"),
        ),
        TestAction::assert_eq(
            "Number(0.000000012).toString(16)",
            js_str!("0.000000338a23b87483be"),
        ),
        TestAction::assert_eq(
            "Number(0.0000000123).toString(16)",
            js_str!("0.00000034d3fe36aaa0a2"),
        ),
        TestAction::assert_eq("Number(-0).toString(16)", js_str!("0")),
        TestAction::assert_eq("Number(-9).toString(16)", js_str!("-9")),
        //
        TestAction::assert_eq("Number(-90).toString(16)", js_str!("-5a")),
        TestAction::assert_eq("Number(-90.12).toString(16)", js_str!("-5a.1eb851eb852")),
        TestAction::assert_eq("Number(-0.1).toString(16)", js_str!("-0.1999999999999a")),
        TestAction::assert_eq("Number(-0.01).toString(16)", js_str!("-0.028f5c28f5c28f6")),
        TestAction::assert_eq(
            "Number(-0.0123).toString(16)",
            js_str!("-0.032617c1bda511a"),
        ),
        TestAction::assert_eq(
            "Number(-111111111111111111111).toString(16)",
            js_str!("-605f9f6dd18bc8000"),
        ),
        TestAction::assert_eq(
            "Number(-1111111111111111111111).toString(16)",
            js_str!("-3c3bc3a4a2f75c0000"),
        ),
        TestAction::assert_eq(
            "Number(-11111111111111111111111).toString(16)",
            js_str!("-25a55a46e5da9a00000"),
        ),
        TestAction::assert_eq(
            "Number(-0.00001).toString(16)",
            js_str!("-0.0000a7c5ac471b4788"),
        ),
        TestAction::assert_eq(
            "Number(-0.000001).toString(16)",
            js_str!("-0.000010c6f7a0b5ed8d"),
        ),
        TestAction::assert_eq(
            "Number(-0.0000001).toString(16)",
            js_str!("-0.000001ad7f29abcaf48"),
        ),
        TestAction::assert_eq(
            "Number(-0.00000012).toString(16)",
            js_str!("-0.000002036565348d256"),
        ),
        TestAction::assert_eq(
            "Number(-0.000000123).toString(16)",
            js_str!("-0.0000021047ee22aa466"),
        ),
        TestAction::assert_eq(
            "Number(-0.00000001).toString(16)",
            js_str!("-0.0000002af31dc4611874"),
        ),
        TestAction::assert_eq(
            "Number(-0.000000012).toString(16)",
            js_str!("-0.000000338a23b87483be"),
        ),
        TestAction::assert_eq(
            "Number(-0.0000000123).toString(16)",
            js_str!("-0.00000034d3fe36aaa0a2"),
        ),
    ]);
}

#[test]
fn num_to_string_exponential() {
    run_test_actions([
        TestAction::assert_eq("(0).toString()", js_str!("0")),
        TestAction::assert_eq("(-0).toString()", js_str!("0")),
        TestAction::assert_eq(
            "(111111111111111111111).toString()",
            js_str!("111111111111111110000"),
        ),
        TestAction::assert_eq(
            "(1111111111111111111111).toString()",
            js_str!("1.1111111111111111e+21"),
        ),
        TestAction::assert_eq(
            "(11111111111111111111111).toString()",
            js_str!("1.1111111111111111e+22"),
        ),
        TestAction::assert_eq("(0.0000001).toString()", js_str!("1e-7")),
        TestAction::assert_eq("(0.00000012).toString()", js_str!("1.2e-7")),
        TestAction::assert_eq("(0.000000123).toString()", js_str!("1.23e-7")),
        TestAction::assert_eq("(0.00000001).toString()", js_str!("1e-8")),
        TestAction::assert_eq("(0.000000012).toString()", js_str!("1.2e-8")),
        TestAction::assert_eq("(0.0000000123).toString()", js_str!("1.23e-8")),
    ]);
}

#[test]
fn value_of() {
    // TODO: In addition to parsing numbers from strings, parse them bare As of October 2019
    // the parser does not understand scientific e.g., Xe+Y or -Xe-Y notation.
    run_test_actions([
        TestAction::assert_eq("Number().valueOf()", 0),
        TestAction::assert_eq("Number('123').valueOf()", 123),
        TestAction::assert_eq("Number(1.234).valueOf()", 1.234),
        TestAction::assert_eq("Number('1.2e+4').valueOf()", 12_000),
        TestAction::assert_eq("Number('-1.2e+4').valueOf()", -12_000),
    ]);
}

#[test]
fn equal() {
    assert!(Number::equal(0.0, 0.0));
    assert!(Number::equal(-0.0, 0.0));
    assert!(Number::equal(0.0, -0.0));
    assert!(!Number::equal(f64::NAN, -0.0));
    assert!(!Number::equal(0.0, f64::NAN));

    assert!(Number::equal(1.0, 1.0));
}

#[test]
fn same_value() {
    assert!(Number::same_value(0.0, 0.0));
    assert!(!Number::same_value(-0.0, 0.0));
    assert!(!Number::same_value(0.0, -0.0));
    assert!(!Number::same_value(f64::NAN, -0.0));
    assert!(!Number::same_value(0.0, f64::NAN));
    assert!(Number::equal(1.0, 1.0));
}

#[test]
fn less_than() {
    assert_eq!(
        Number::less_than(f64::NAN, 0.0),
        AbstractRelation::Undefined
    );
    assert_eq!(
        Number::less_than(0.0, f64::NAN),
        AbstractRelation::Undefined
    );
    assert_eq!(
        Number::less_than(f64::NEG_INFINITY, 0.0),
        AbstractRelation::True
    );
    assert_eq!(
        Number::less_than(0.0, f64::NEG_INFINITY),
        AbstractRelation::False
    );
    assert_eq!(
        Number::less_than(f64::INFINITY, 0.0),
        AbstractRelation::False
    );
    assert_eq!(
        Number::less_than(0.0, f64::INFINITY),
        AbstractRelation::True
    );
}

#[test]
fn same_value_zero() {
    assert!(Number::same_value_zero(0.0, 0.0));
    assert!(Number::same_value_zero(-0.0, 0.0));
    assert!(Number::same_value_zero(0.0, -0.0));
    assert!(!Number::same_value_zero(f64::NAN, -0.0));
    assert!(!Number::same_value_zero(0.0, f64::NAN));
    assert!(Number::equal(1.0, 1.0));
}

#[test]
fn from_bigint() {
    run_test_actions([
        TestAction::assert_eq("Number(0n)", 0),
        TestAction::assert_eq("Number(100000n)", 100_000),
        TestAction::assert_eq("Number(100000n)", 100_000),
        TestAction::assert_eq("Number(1n << 1240n)", f64::INFINITY),
    ]);
}

#[test]
fn number_constants() {
    run_test_actions([
        TestAction::assert_eq("Number.EPSILON", f64::EPSILON),
        TestAction::assert_eq("Number.MAX_SAFE_INTEGER", Number::MAX_SAFE_INTEGER),
        TestAction::assert_eq("Number.MIN_SAFE_INTEGER", Number::MIN_SAFE_INTEGER),
        TestAction::assert_eq("Number.MAX_VALUE", f64::MAX),
        TestAction::assert_eq("Number.MIN_VALUE", Number::MIN_VALUE),
        TestAction::assert_eq("Number.POSITIVE_INFINITY", f64::INFINITY),
        TestAction::assert_eq("Number.NEGATIVE_INFINITY", -f64::INFINITY),
    ]);
}

#[test]
fn parse_int() {
    run_test_actions([
        TestAction::assert_eq("parseInt('6')", 6),
        TestAction::assert_eq("parseInt('-9')", -9),
        TestAction::assert_eq("parseInt(100)", 100),
        TestAction::assert_eq("parseInt(100.5)", 100),
        TestAction::assert_eq("parseInt('0xA')", 10),
        // This test demonstrates that this version of parseInt treats strings starting with 0 to be parsed with
        // a radix 10 if no radix is specified. Some alternative implementations default to a radix of 8.
        TestAction::assert_eq("parseInt('018')", 18),
        TestAction::assert_eq("parseInt('hello')", f64::NAN),
        TestAction::assert_eq("parseInt(undefined)", f64::NAN),
        // Shows that no arguments to parseInt is treated the same as if undefined was
        // passed as the first argument.
        TestAction::assert_eq("parseInt()", f64::NAN),
        // Shows that extra arguments to parseInt are ignored.
        TestAction::assert_eq("parseInt('100', 10, 10)", 100),
    ]);
}

#[test]
fn parse_int_varying_radix() {
    let base_str = "1000";
    let tests = (2..36).flat_map(|radix| {
        let expected = i32::from_str_radix(base_str, radix).unwrap();
        [
            TestAction::assert_eq(format!("parseInt('{base_str}', {radix} )"), expected),
            TestAction::assert_eq(format!("parseInt('-{base_str}', {radix} )"), -expected),
        ]
    });

    run_test_actions(tests);
}

#[test]
fn parse_float() {
    run_test_actions([
        TestAction::assert_eq("parseFloat('6.5')", 6.5),
        TestAction::assert_eq("parseFloat(10)", 10),
        TestAction::assert_eq("parseFloat('8')", 8),
        TestAction::assert_eq("parseFloat(17.5)", 17.5),
        TestAction::assert_eq("parseFloat('-99.7')", -99.7),
        TestAction::assert_eq("parseFloat('hello')", f64::NAN),
        TestAction::assert_eq("parseFloat(undefined)", f64::NAN),
        // No arguments to parseFloat is treated the same as passing undefined as the first argument.
        TestAction::assert_eq("parseFloat()", f64::NAN),
        // Shows that the parseFloat function ignores extra arguments.
        TestAction::assert_eq("parseFloat('100.5', 10)", 100.5),
    ]);
}

#[test]
fn global_is_finite() {
    run_test_actions([
        TestAction::assert("!isFinite(Infinity)"),
        TestAction::assert("!isFinite(NaN)"),
        TestAction::assert("!isFinite(-Infinity)"),
        TestAction::assert("isFinite(0)"),
        TestAction::assert("isFinite(2e64)"),
        TestAction::assert("isFinite(910)"),
        TestAction::assert("isFinite(null)"),
        TestAction::assert("isFinite('0')"),
        TestAction::assert("!isFinite()"),
    ]);
}

#[test]
fn global_is_nan() {
    run_test_actions([
        TestAction::assert("isNaN(NaN)"),
        TestAction::assert("isNaN('NaN')"),
        TestAction::assert("isNaN(undefined)"),
        TestAction::assert("isNaN({})"),
        TestAction::assert("!isNaN(true)"),
        TestAction::assert("!isNaN(null)"),
        TestAction::assert("!isNaN(37)"),
        TestAction::assert("!isNaN('37')"),
        TestAction::assert("!isNaN('37.37')"),
        TestAction::assert("isNaN('37,5')"),
        TestAction::assert("isNaN('123ABC')"),
        // Incorrect due to ToNumber implementation inconsistencies.
        // TestAction::assert("isNaN('')"),
        // TestAction::assert("isNaN(' ')"),
        TestAction::assert("isNaN('blabla')"),
    ]);
}

#[test]
fn number_is_finite() {
    run_test_actions([
        TestAction::assert("!Number.isFinite(Infinity)"),
        TestAction::assert("!Number.isFinite(NaN)"),
        TestAction::assert("!Number.isFinite(-Infinity)"),
        TestAction::assert("Number.isFinite(0)"),
        TestAction::assert("Number.isFinite(2e64)"),
        TestAction::assert("Number.isFinite(910)"),
        TestAction::assert("!Number.isFinite(null)"),
        TestAction::assert("!Number.isFinite('0')"),
        TestAction::assert("!Number.isFinite()"),
        TestAction::assert("!Number.isFinite({})"),
        TestAction::assert("Number.isFinite(Number(5))"),
        TestAction::assert("!Number.isFinite(new Number(5))"),
        TestAction::assert("!Number.isFinite(new Number(5))"),
        TestAction::assert("!Number.isFinite(BigInt(5))"),
    ]);
}

#[test]
fn number_is_integer() {
    run_test_actions([
        TestAction::assert("Number.isInteger(0)"),
        TestAction::assert("Number.isInteger(1)"),
        TestAction::assert("Number.isInteger(-100000)"),
        TestAction::assert("Number.isInteger(99999999999999999999999)"),
        TestAction::assert("!Number.isInteger(0.1)"),
        TestAction::assert("!Number.isInteger(Math.PI)"),
        TestAction::assert("!Number.isInteger(NaN)"),
        TestAction::assert("!Number.isInteger(Infinity)"),
        TestAction::assert("!Number.isInteger(-Infinity)"),
        TestAction::assert("!Number.isInteger('10')"),
        TestAction::assert("!Number.isInteger(true)"),
        TestAction::assert("!Number.isInteger(false)"),
        TestAction::assert("!Number.isInteger([1])"),
        TestAction::assert("Number.isInteger(5.0)"),
        TestAction::assert("!Number.isInteger(5.000000000000001)"),
        TestAction::assert("Number.isInteger(5.0000000000000001)"),
        TestAction::assert("!Number.isInteger(Number(5.000000000000001))"),
        TestAction::assert("Number.isInteger(Number(5.0000000000000001))"),
        TestAction::assert("!Number.isInteger()"),
        TestAction::assert("!Number.isInteger(new Number(5))"),
    ]);
}

#[test]
fn number_is_nan() {
    run_test_actions([
        TestAction::assert("Number.isNaN(NaN)"),
        TestAction::assert("Number.isNaN(Number.NaN)"),
        TestAction::assert("Number.isNaN(0 / 0)"),
        TestAction::assert("!Number.isNaN(undefined)"),
        TestAction::assert("!Number.isNaN({})"),
        TestAction::assert("!Number.isNaN(true)"),
        TestAction::assert("!Number.isNaN(null)"),
        TestAction::assert("!Number.isNaN(37)"),
        TestAction::assert("!Number.isNaN('37')"),
        TestAction::assert("!Number.isNaN('37.37')"),
        TestAction::assert("!Number.isNaN('37,5')"),
        TestAction::assert("!Number.isNaN('123ABC')"),
        // Incorrect due to ToNumber implementation inconsistencies.
        //TestAction::assert("!Number.isNaN('')"),
        //TestAction::assert("!Number.isNaN(' ')"),
        TestAction::assert("!Number.isNaN('blabla')"),
        TestAction::assert("!Number.isNaN(Number(5))"),
        TestAction::assert("Number.isNaN(Number(NaN))"),
        TestAction::assert("!Number.isNaN(BigInt(5))"),
        TestAction::assert("!Number.isNaN(new Number(5))"),
        TestAction::assert("!Number.isNaN(new Number(NaN))"),
    ]);
}

#[test]
fn number_is_safe_integer() {
    run_test_actions([
        TestAction::assert("Number.isSafeInteger(3)"),
        TestAction::assert("!Number.isSafeInteger(Math.pow(2, 53))"),
        TestAction::assert("Number.isSafeInteger(Math.pow(2, 53) - 1)"),
        TestAction::assert("!Number.isSafeInteger(NaN)"),
        TestAction::assert("!Number.isSafeInteger(Infinity)"),
        TestAction::assert("!Number.isSafeInteger('3')"),
        TestAction::assert("!Number.isSafeInteger(3.1)"),
        TestAction::assert("Number.isSafeInteger(3.0)"),
        TestAction::assert("!Number.isSafeInteger(new Number(5))"),
    ]);
}

// https://github.com/boa-dev/boa/issues/2717
#[test]
fn issue_2717() {
    run_test_actions([
        TestAction::assert_eq(
            "(0.1600057092765239).toString(36)",
            js_str!("0.5rd85dm1ixq"),
        ),
        TestAction::assert_eq(
            "(0.23046743672210102).toString(36)",
            js_str!("0.8aoosla2phj"),
        ),
    ]);
}

#[test]
fn to_precision_edge_cases() {
    run_test_actions([
        TestAction::assert_eq("(NaN).toPrecision(3)", js_str!("NaN")),
        TestAction::assert_eq("(Infinity).toPrecision(3)", js_str!("Infinity")),
        TestAction::assert_eq("(-Infinity).toPrecision(3)", js_str!("-Infinity")),
        TestAction::assert_eq("(-0).toPrecision(5)", js_str!("0.0000")),
        // Carry-over rounding tests
        TestAction::assert_eq("(9.95).toPrecision(2)", js_str!("9.9")),
        TestAction::assert_eq("(99.95).toPrecision(3)", js_str!("100")),
        TestAction::assert_eq("(999.95).toPrecision(4)", js_str!("1000")),
        TestAction::assert_eq("(9.5).toPrecision(1)", js_str!("1e+1")),
        TestAction::assert_eq("(123.456).toPrecision(5)", js_str!("123.46")),
        TestAction::assert_eq("(0.00456).toPrecision(3)", js_str!("0.00456")),
        TestAction::assert_eq("(0.0000001).toPrecision(2)", js_str!("1.0e-7")),
        TestAction::assert_eq("(0.000000123).toPrecision(3)", js_str!("1.23e-7")),
        TestAction::assert_eq("(123456789).toPrecision(3)", js_str!("1.23e+8")),
        TestAction::assert_eq("(0.1 + 0.2).toPrecision(1)", js_str!("0.3")),
        TestAction::assert_eq("(123).toPrecision(3)", js_str!("123")),
        TestAction::assert_eq("(123).toPrecision(4)", js_str!("123.0")),
        TestAction::assert_eq("(0).toPrecision(1)", js_str!("0")),
        TestAction::assert_eq("(1).toPrecision(1)", js_str!("1")),
        TestAction::assert_eq("(9).toPrecision(1)", js_str!("9")),
    ]);
}
