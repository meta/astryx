use boa_macros::js_str;

use crate::{JsBigInt, JsNativeErrorKind, TestAction, run_test_actions};

#[test]
fn equality() {
    run_test_actions([
        TestAction::assert("0n == 0n"),
        TestAction::assert("!(1n == 0n)"),
        TestAction::assert(
            "1000000000000000000000000000000000n == 1000000000000000000000000000000000n",
        ),
        TestAction::assert("0n == ''"),
        TestAction::assert("100n == '100'"),
        TestAction::assert("!(100n == '100.5')"),
        TestAction::assert("10000000000000000n == '10000000000000000'"),
        TestAction::assert("'' == 0n"),
        TestAction::assert("'100' == 100n"),
        TestAction::assert("!('100.5' == 100n)"),
        TestAction::assert("'10000000000000000' == 10000000000000000n"),
        TestAction::assert("0n == 0"),
        TestAction::assert("0n == 0.0"),
        TestAction::assert("100n == 100"),
        TestAction::assert("100n == 100.0"),
        TestAction::assert("!(100n == '100.5')"),
        TestAction::assert("!(100n == '1005')"),
        TestAction::assert("10000000000000000n == 10000000000000000"),
        TestAction::assert("0 == 0n"),
        TestAction::assert("0.0 == 0n"),
        TestAction::assert("100 == 100n"),
        TestAction::assert("100.0 == 100n"),
        TestAction::assert("!(100.5 == 100n)"),
        TestAction::assert("!(1005 == 100n)"),
        TestAction::assert("10000000000000000 == 10000000000000000n"),
    ]);
}

#[test]
fn bigint_function_conversion_from_integer() {
    run_test_actions([
        TestAction::assert_eq("BigInt(1000)", JsBigInt::from(1000)),
        TestAction::assert_eq(
            "BigInt(20000000000000000)",
            JsBigInt::from_string("20000000000000000").unwrap(),
        ),
        TestAction::assert_eq(
            "BigInt(1000000000000000000000000000000000)",
            JsBigInt::from_string("999999999999999945575230987042816").unwrap(),
        ),
    ]);
}

#[test]
fn bigint_function_conversion_from_rational() {
    run_test_actions([
        TestAction::assert_eq("BigInt(0.0)", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt(1.0)", JsBigInt::from(1)),
        TestAction::assert_eq("BigInt(10000.0)", JsBigInt::from(10_000)),
    ]);
}

#[test]
fn bigint_function_throws() {
    run_test_actions([
        TestAction::assert_native_error(
            "BigInt(0.1)",
            JsNativeErrorKind::Range,
            "cannot convert 0.1 to a BigInt",
        ),
        TestAction::assert_native_error(
            "BigInt(null)",
            JsNativeErrorKind::Type,
            "cannot convert null to a BigInt",
        ),
        TestAction::assert_native_error(
            "BigInt(undefined)",
            JsNativeErrorKind::Type,
            "cannot convert undefined to a BigInt",
        ),
    ]);
}

#[test]
fn bigint_function_conversion_from_string() {
    run_test_actions([
        TestAction::assert_eq("BigInt('')", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt('   ')", JsBigInt::from(0)),
        TestAction::assert_eq(
            "BigInt('200000000000000000')",
            JsBigInt::from_string("200000000000000000").unwrap(),
        ),
        TestAction::assert_eq(
            "BigInt('1000000000000000000000000000000000')",
            JsBigInt::from_string("1000000000000000000000000000000000").unwrap(),
        ),
        TestAction::assert_eq("BigInt('0b1111')", JsBigInt::from(15)),
        TestAction::assert_eq("BigInt('0o70')", JsBigInt::from(56)),
        TestAction::assert_eq("BigInt('0xFF')", JsBigInt::from(255)),
    ]);
}

#[test]
fn operations() {
    run_test_actions([
        TestAction::assert_eq("10000n + 1000n", JsBigInt::from(11_000)),
        TestAction::assert_eq("10000n - 1000n", JsBigInt::from(9_000)),
        TestAction::assert_eq(
            "123456789n * 102030n",
            JsBigInt::from_string("12596296181670").unwrap(),
        ),
        TestAction::assert_eq("15000n / 50n", JsBigInt::from(300)),
        TestAction::assert_eq("15001n / 50n", JsBigInt::from(300)),
        TestAction::assert_native_error(
            "1n/0n",
            JsNativeErrorKind::Range,
            "BigInt division by zero",
        ),
        TestAction::assert_eq("15007n % 10n", JsBigInt::from(7)),
        TestAction::assert_native_error(
            "1n % 0n",
            JsNativeErrorKind::Range,
            "BigInt division by zero",
        ),
        TestAction::assert_eq(
            "100n ** 10n",
            JsBigInt::from_string("100000000000000000000").unwrap(),
        ),
        TestAction::assert_native_error(
            "10n ** (-10n)",
            JsNativeErrorKind::Range,
            "BigInt negative exponent",
        ),
        TestAction::assert_eq("8n << 2n", JsBigInt::from(32)),
        TestAction::assert_native_error(
            "1000n << 1000000000000000n",
            JsNativeErrorKind::Range,
            "Maximum BigInt size exceeded",
        ),
        TestAction::assert_eq("8n >> 2n", JsBigInt::from(2)),
        TestAction::assert_eq("1000n >> 1000000000000000n", JsBigInt::zero()),
        TestAction::assert_eq("(-1000n) >> 1000000000000000n", JsBigInt::from(-1)),
        TestAction::assert_eq("0n >> 1000000000000000n", JsBigInt::zero()),
        // shift_left with large negative amount (equivalent to large right-shift)
        TestAction::assert_eq("1000n << (-1000000000000000n)", JsBigInt::zero()),
        TestAction::assert_eq("(-1000n) << (-1000000000000000n)", JsBigInt::from(-1)),
        TestAction::assert_eq("0n << (-1000000000000000n)", JsBigInt::zero()),
    ]);
}

#[test]
fn to_string() {
    run_test_actions([
        TestAction::assert_eq("1000n.toString()", js_str!("1000")),
        TestAction::assert_eq("1000n.toString(2)", js_str!("1111101000")),
        TestAction::assert_eq("255n.toString(16)", js_str!("ff")),
        TestAction::assert_eq("1000n.toString(36)", js_str!("rs")),
    ]);
}

#[test]
fn to_string_invalid_radix() {
    run_test_actions([
        TestAction::assert_native_error(
            "10n.toString(null)",
            JsNativeErrorKind::Range,
            "radix must be an integer at least 2 and no greater than 36",
        ),
        TestAction::assert_native_error(
            "10n.toString(-1)",
            JsNativeErrorKind::Range,
            "radix must be an integer at least 2 and no greater than 36",
        ),
        TestAction::assert_native_error(
            "10n.toString(37)",
            JsNativeErrorKind::Range,
            "radix must be an integer at least 2 and no greater than 36",
        ),
    ]);
}

#[test]
fn as_int_n() {
    run_test_actions([
        TestAction::assert_eq("BigInt.asIntN(0, 1n)", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt.asIntN(1, 1n)", JsBigInt::from(-1)),
        TestAction::assert_eq("BigInt.asIntN(3, 10n)", JsBigInt::from(2)),
        TestAction::assert_eq("BigInt.asIntN({}, 1n)", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt.asIntN(2, 0n)", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt.asIntN(2, -0n)", JsBigInt::from(0)),
        TestAction::assert_eq(
            "BigInt.asIntN(2, -123456789012345678901n)",
            JsBigInt::from(-1),
        ),
        TestAction::assert_eq(
            "BigInt.asIntN(2, -123456789012345678900n)",
            JsBigInt::from(0),
        ),
        TestAction::assert_eq(
            "BigInt.asIntN(2, 123456789012345678900n)",
            JsBigInt::from(0),
        ),
        TestAction::assert_eq(
            "BigInt.asIntN(2, 123456789012345678901n)",
            JsBigInt::from(1),
        ),
        TestAction::assert_eq(
            "BigInt.asIntN(200, 0xcffffffffffffffffffffffffffffffffffffffffffffffffffn)",
            JsBigInt::from(-1),
        ),
        TestAction::assert_eq(
            "BigInt.asIntN(201, 0xcffffffffffffffffffffffffffffffffffffffffffffffffffn)",
            JsBigInt::from_string("1606938044258990275541962092341162602522202993782792835301375")
                .unwrap(),
        ),
        TestAction::assert_eq(
            "BigInt.asIntN(200, 0xc89e081df68b65fedb32cffea660e55df9605650a603ad5fc54n)",
            JsBigInt::from_string("-741470203160010616172516490008037905920749803227695190508460")
                .unwrap(),
        ),
        TestAction::assert_eq(
            "BigInt.asIntN(201, 0xc89e081df68b65fedb32cffea660e55df9605650a603ad5fc54n)",
            JsBigInt::from_string("865467841098979659369445602333124696601453190555097644792916")
                .unwrap(),
        ),
    ]);
}

#[test]
fn as_int_n_errors() {
    run_test_actions([
        TestAction::assert_native_error(
            "BigInt.asIntN(-1, 0n)",
            JsNativeErrorKind::Range,
            "Index must be between 0 and  2^53 - 1",
        ),
        TestAction::assert_native_error(
            "BigInt.asIntN(-2.5, 0n)",
            JsNativeErrorKind::Range,
            "Index must be between 0 and  2^53 - 1",
        ),
        TestAction::assert_native_error(
            "BigInt.asIntN(9007199254740992, 0n)",
            JsNativeErrorKind::Range,
            "Index must be between 0 and  2^53 - 1",
        ),
        TestAction::assert_native_error(
            "BigInt.asIntN(0n, 0n)",
            JsNativeErrorKind::Type,
            "argument must not be a bigint",
        ),
    ]);
}

#[test]
fn as_uint_n() {
    run_test_actions([
        TestAction::assert_eq("BigInt.asUintN(0, -2n)", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt.asUintN(0, -1n)", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt.asUintN(0, 0n)", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt.asUintN(0, 1n)", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt.asUintN(0, 2n)", JsBigInt::from(0)),
        //
        TestAction::assert_eq("BigInt.asUintN(1, -3n)", JsBigInt::from(1)),
        TestAction::assert_eq("BigInt.asUintN(1, -2n)", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt.asUintN(1, -1n)", JsBigInt::from(1)),
        TestAction::assert_eq("BigInt.asUintN(1, 0n)", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt.asUintN(1, 1n)", JsBigInt::from(1)),
        TestAction::assert_eq("BigInt.asUintN(1, 2n)", JsBigInt::from(0)),
        TestAction::assert_eq("BigInt.asUintN(1, 3n)", JsBigInt::from(1)),
        //
        TestAction::assert_eq(
            "BigInt.asUintN(1, -123456789012345678901n)",
            JsBigInt::from(1),
        ),
        TestAction::assert_eq(
            "BigInt.asUintN(1, -123456789012345678900n)",
            JsBigInt::from(0),
        ),
        TestAction::assert_eq(
            "BigInt.asUintN(1, 123456789012345678900n)",
            JsBigInt::from(0),
        ),
        TestAction::assert_eq(
            "BigInt.asUintN(1, 123456789012345678901n)",
            JsBigInt::from(1),
        ),
        //
        TestAction::assert_eq(
            "BigInt.asUintN(200, 0xbffffffffffffffffffffffffffffffffffffffffffffffffffn)",
            JsBigInt::from_string("1606938044258990275541962092341162602522202993782792835301375")
                .unwrap(),
        ),
        TestAction::assert_eq(
            "BigInt.asUintN(201, 0xbffffffffffffffffffffffffffffffffffffffffffffffffffn)",
            JsBigInt::from_string("3213876088517980551083924184682325205044405987565585670602751")
                .unwrap(),
        ),
    ]);
}

#[test]
fn as_uint_n_errors() {
    run_test_actions([
        TestAction::assert_native_error(
            "BigInt.asUintN(-1, 0n)",
            JsNativeErrorKind::Range,
            "Index must be between 0 and  2^53 - 1",
        ),
        TestAction::assert_native_error(
            "BigInt.asUintN(-2.5, 0n)",
            JsNativeErrorKind::Range,
            "Index must be between 0 and  2^53 - 1",
        ),
        TestAction::assert_native_error(
            "BigInt.asUintN(9007199254740992, 0n)",
            JsNativeErrorKind::Range,
            "Index must be between 0 and  2^53 - 1",
        ),
        TestAction::assert_native_error(
            "BigInt.asUintN(0n, 0n)",
            JsNativeErrorKind::Type,
            "argument must not be a bigint",
        ),
    ]);
}
