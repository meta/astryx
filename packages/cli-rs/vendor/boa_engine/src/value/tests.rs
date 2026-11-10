use boa_macros::js_str;
use indoc::indoc;

use super::*;
use crate::object::internal_methods::InternalMethodPropertyContext;
use crate::{TestAction, js_string, run_test_actions};

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

#[test]
fn string_to_value() {
    let s = String::from("Hello");
    let v = JsValue::new(js_string!(s));
    assert!(v.is_string());
    assert!(!v.is_null());
}

#[test]
fn undefined() {
    let u = JsValue::undefined();
    assert_eq!(u.get_type(), Type::Undefined);
    assert_eq!(u.display().to_string(), "undefined");
}

#[test]
fn get_set_field() {
    run_test_actions([TestAction::assert_context(|ctx| {
        let obj = &JsObject::with_object_proto(ctx.intrinsics());
        // Create string and convert it to a Value
        let s = JsValue::new(js_str!("bar"));
        obj.set(js_str!("foo"), s, false, ctx).unwrap();
        obj.get(js_str!("foo"), ctx).unwrap() == JsValue::new(js_str!("bar"))
    })]);
}

#[test]
fn integer_is_true() {
    assert!(JsValue::new(1).to_boolean());
    assert!(!JsValue::new(0).to_boolean());
    assert!(JsValue::new(-1).to_boolean());
}

#[test]
fn number_is_true() {
    assert!(JsValue::new(1.0).to_boolean());
    assert!(JsValue::new(0.1).to_boolean());
    assert!(!JsValue::new(0.0).to_boolean());
    assert!(!JsValue::new(-0.0).to_boolean());
    assert!(JsValue::new(-1.0).to_boolean());
    assert!(!JsValue::nan().to_boolean());
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness
#[test]
fn abstract_equality_comparison() {
    run_test_actions([
        TestAction::assert("undefined == undefined"),
        TestAction::assert("null == null"),
        TestAction::assert("true == true"),
        TestAction::assert("false == false"),
        TestAction::assert("'foo' == 'foo'"),
        TestAction::assert("0 == 0"),
        TestAction::assert("+0 == -0"),
        TestAction::assert("+0 == 0"),
        TestAction::assert("-0 == 0"),
        TestAction::assert("0 == false"),
        TestAction::assert("-0 == -false"),
        TestAction::assert("-0 == -null"),
        TestAction::assert("-1 == -true"),
        TestAction::assert("'' == false"),
        TestAction::assert("'' == 0"),
        TestAction::assert("'17' == 17"),
        TestAction::assert("[1,2] == '1,2'"),
        TestAction::assert("new String('foo') == 'foo'"),
        TestAction::assert("null == undefined"),
        TestAction::assert("undefined == null"),
        TestAction::assert("null != false"),
        TestAction::assert("[] == ![]"),
        TestAction::assert("a = { foo: 'bar' }; b = { foo: 'bar'}; a != b"),
        TestAction::assert("new String('foo') != new String('foo')"),
        TestAction::assert("0 != null"),
        TestAction::assert("0 == '-0'"),
        TestAction::assert("0 == '+0'"),
        TestAction::assert("'+0' == 0"),
        TestAction::assert("'-0' == 0"),
        TestAction::assert("0 != NaN"),
        TestAction::assert("'foo' != NaN"),
        TestAction::assert("NaN != NaN"),
        TestAction::assert("Number.POSITIVE_INFINITY === Number.POSITIVE_INFINITY"),
        TestAction::assert("Number.NEGATIVE_INFINITY === Number.NEGATIVE_INFINITY"),
    ]);
}

/// Helper function to get the hash of a `Value`.
fn hash_value(value: &JsValue) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

#[allow(clippy::redundant_clone)]
#[test]
fn hash_undefined() {
    let value1 = JsValue::undefined();
    let value_clone = value1.clone();
    assert_eq!(value1, value_clone);

    let value2 = JsValue::undefined();
    assert_eq!(value1, value2);

    assert_eq!(hash_value(&value1), hash_value(&value_clone));
    assert_eq!(hash_value(&value2), hash_value(&value_clone));
}

#[test]
fn hash_rational() {
    let value1 = JsValue::new(1.0);
    let value2 = JsValue::new(1.0);
    assert_eq!(value1, value2);
    assert_eq!(hash_value(&value1), hash_value(&value2));

    let nan = JsValue::nan();
    assert_eq!(nan, nan);
    assert_eq!(hash_value(&nan), hash_value(&nan));
    assert_ne!(hash_value(&nan), hash_value(&JsValue::new(1.0)));
}

#[test]
fn hash_object() {
    let object1 = JsValue::new(JsObject::with_null_proto());
    assert_eq!(object1, object1);
    assert_eq!(object1, object1.clone());

    let object2 = JsValue::new(JsObject::with_null_proto());
    assert_ne!(object1, object2);

    assert_eq!(hash_value(&object1), hash_value(&object1.clone()));
    assert_ne!(hash_value(&object1), hash_value(&object2));
}

#[test]
fn get_types() {
    run_test_actions([
        TestAction::assert_with_op("undefined", |value, _| value.get_type() == Type::Undefined),
        TestAction::assert_with_op("1", |value, _| value.get_type() == Type::Number),
        TestAction::assert_with_op("1.5", |value, _| value.get_type() == Type::Number),
        TestAction::assert_with_op("BigInt(\"123442424242424424242424242\")", |value, _| {
            value.get_type() == Type::BigInt
        }),
        TestAction::assert_with_op("true", |value, _| value.get_type() == Type::Boolean),
        TestAction::assert_with_op("false", |value, _| value.get_type() == Type::Boolean),
        TestAction::assert_with_op("function foo() {console.log(\"foo\");}", |value, _| {
            value.get_type() == Type::Undefined
        }),
        TestAction::assert_with_op("null", |value, _| value.get_type() == Type::Null),
        TestAction::assert_with_op("var x = {arg: \"hi\", foo: \"hello\"}; x", |value, _| {
            value.get_type() == Type::Object
        }),
        TestAction::assert_with_op("\"Hi\"", |value, _| value.get_type() == Type::String),
        TestAction::assert_with_op("Symbol()", |value, _| value.get_type() == Type::Symbol),
    ]);
}

#[test]
fn float_display() {
    let f64_to_str = |f| JsValue::new(f).display().to_string();

    assert_eq!(f64_to_str(f64::NAN), "NaN");
    assert_eq!(f64_to_str(0.0), "0");
    assert_eq!(f64_to_str(f64::INFINITY), "Infinity");
    assert_eq!(f64_to_str(f64::NEG_INFINITY), "-Infinity");
    assert_eq!(f64_to_str(90.12), "90.12");
    assert_eq!(
        f64_to_str(111_111_111_111_111_111_111.0),
        "111111111111111110000"
    );
    assert_eq!(
        f64_to_str(1_111_111_111_111_111_111_111.0),
        "1.1111111111111111e+21"
    );

    assert_eq!(f64_to_str(-90.12), "-90.12");

    assert_eq!(
        f64_to_str(-111_111_111_111_111_111_111.0),
        "-111111111111111110000"
    );
    assert_eq!(
        f64_to_str(-1_111_111_111_111_111_111_111.0),
        "-1.1111111111111111e+21"
    );

    assert_eq!(f64_to_str(0.000_000_1), "1e-7");
    assert_eq!(f64_to_str(0.000_001), "0.000001");
    assert_eq!(f64_to_str(0.000_000_2), "2e-7");
    assert_eq!(f64_to_str(-0.000_000_1), "-1e-7");

    assert_eq!(f64_to_str(3e50), "3e+50");
}

#[test]
fn string_length_is_not_enumerable() {
    run_test_actions([TestAction::assert_context(|context| {
        let object = JsValue::new(js_string!("foo")).to_object(context).unwrap();
        let length_desc = object
            .__get_own_property__(
                &PropertyKey::from(js_string!("length")),
                &mut InternalMethodPropertyContext::new(context),
            )
            .unwrap()
            .unwrap();
        !length_desc.expect_enumerable()
    })]);
}

#[test]
fn string_length_is_in_utf16_codeunits() {
    run_test_actions([TestAction::assert_context(|context| {
        // 😀 is one Unicode code point, but 2 UTF-16 code units
        let object = JsValue::new(js_string!("😀")).to_object(context).unwrap();

        let length_desc = object
            .__get_own_property__(
                &PropertyKey::from(js_string!("length")),
                &mut InternalMethodPropertyContext::new(context),
            )
            .unwrap()
            .unwrap();
        length_desc
            .expect_value()
            .to_integer_or_infinity(context)
            .unwrap()
            == IntegerOrInfinity::Integer(2)
    })]);
}

#[test]
fn add_number_and_number() {
    run_test_actions([TestAction::assert_eq("1 + 2", 3)]);
}

#[test]
fn add_number_and_string() {
    run_test_actions([TestAction::assert_eq(
        "1 + \" + 2 = 3\"",
        js_str!("1 + 2 = 3"),
    )]);
}

#[test]
fn add_string_and_string() {
    run_test_actions([TestAction::assert_eq(
        "\"Hello\" + \", world\"",
        js_str!("Hello, world"),
    )]);
}

#[test]
fn add_number_object_and_number() {
    run_test_actions([TestAction::assert_eq("new Number(10) + 6", 16)]);
}

#[test]
fn add_number_object_and_string_object() {
    run_test_actions([TestAction::assert_eq(
        "new Number(10) + new String(\"0\")",
        js_str!("100"),
    )]);
}

#[test]
fn sub_number_and_number() {
    run_test_actions([TestAction::assert_eq("1 - 999", -998)]);
}

#[test]
fn sub_number_object_and_number_object() {
    run_test_actions([TestAction::assert_eq(
        "new Number(1) - new Number(999)",
        -998,
    )]);
}

#[test]
fn sub_string_and_number_object() {
    run_test_actions([TestAction::assert_eq("'Hello' - new Number(999)", f64::NAN)]);
}

#[test]
fn div_by_zero() {
    run_test_actions([TestAction::assert_eq("1 / 0", f64::INFINITY)]);
}

#[test]
fn rem_by_zero() {
    run_test_actions([TestAction::assert_eq("1 % 0", f64::NAN)]);
}

#[test]
fn bitand_integer_and_integer() {
    run_test_actions([TestAction::assert_eq("0xFFFF & 0xFF", 255)]);
}

#[test]
fn bitand_integer_and_rational() {
    run_test_actions([TestAction::assert_eq("0xFFFF & 255.5", 255)]);
}

#[test]
fn bitand_rational_and_rational() {
    run_test_actions([TestAction::assert_eq("255.772 & 255.5", 255)]);
}

#[test]
#[allow(clippy::float_cmp)]
fn pow_number_and_number() {
    run_test_actions([TestAction::assert_eq("3 ** 3", 27.0)]);
}

#[test]
fn pow_number_and_string() {
    run_test_actions([TestAction::assert_eq("3 ** 'Hello'", f64::NAN)]);
}

#[test]
fn assign_pow_number_and_string() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r"
            let a = 3;
            a **= 'Hello'
            a
        "},
        f64::NAN,
    )]);
}

#[test]
fn display_string() {
    let s = String::from("Hello");
    let v = JsValue::new(js_string!(s));
    assert_eq!(v.display().to_string(), "\"Hello\"");
}

#[test]
fn display_array_string() {
    run_test_actions([TestAction::assert_with_op("[\"Hello\"]", |v, _| {
        v.display().to_string() == "[ \"Hello\" ]"
    })]);
}

#[test]
fn display_boolean_object() {
    run_test_actions([TestAction::assert_with_op(
        indoc! {r#"
            let bool = new Boolean(0);
            bool
        "#},
        |v, _| v.display().to_string() == "Boolean { false }",
    )]);
}

#[test]
fn display_number_object() {
    run_test_actions([TestAction::assert_with_op(
        indoc! {r#"
            let num = new Number(3.14);
            num
        "#},
        |v, _| v.display().to_string() == "Number { 3.14 }",
    )]);
}

#[test]
fn display_negative_zero_object() {
    run_test_actions([TestAction::assert_with_op(
        indoc! {r#"
            let num = new Number(-0);
            num
        "#},
        |v, _| v.display().to_string() == "Number { -0 }",
    )]);
}

#[test]
fn debug_object() {
    // We don't care about the contents of the debug display (it is *debug* after all). In the
    // commit that this test was added, this would cause a stack overflow, so executing
    // `Debug::fmt` is the assertion.
    //
    // However, we want to make sure that no data is being left in the internal hashset, so
    // executing the formatting twice should result in the same output.
    run_test_actions([TestAction::assert_with_op(
        "new Array([new Date()])",
        |v, _| format!("{v:?}") == format!("{v:?}"),
    )]);
}

#[test]
fn display_object() {
    const DISPLAY: &str = indoc! {r#"
        {
            a: "a"
        }"#
    };
    run_test_actions([TestAction::assert_with_op("({a: 'a'})", |v, _| {
        v.display().to_string() == DISPLAY
    })]);
}

/// Ensure indentation is always 4 and that the property key is not right-align with
/// the brackets.
#[test]
fn display_object_indent() {
    const DISPLAY: &str = indoc! {r#"
        {
            a: "a",
            hello: "world"
        }"#
    };
    run_test_actions([TestAction::assert_with_op(
        "({a: 'a', hello: 'world'})",
        |v, _| v.display().to_string() == DISPLAY,
    )]);
}

#[test]
fn to_integer_or_infinity() {
    run_test_actions([TestAction::inspect_context(|ctx| {
        assert_eq!(
            JsValue::undefined().to_integer_or_infinity(ctx).unwrap(),
            IntegerOrInfinity::Integer(0)
        );
        assert_eq!(
            JsValue::nan().to_integer_or_infinity(ctx).unwrap(),
            IntegerOrInfinity::Integer(0)
        );
        assert_eq!(
            JsValue::new(0.0).to_integer_or_infinity(ctx).unwrap(),
            IntegerOrInfinity::Integer(0)
        );
        assert_eq!(
            JsValue::new(-0.0).to_integer_or_infinity(ctx).unwrap(),
            IntegerOrInfinity::Integer(0)
        );
        assert_eq!(
            JsValue::new(f64::INFINITY)
                .to_integer_or_infinity(ctx)
                .unwrap(),
            IntegerOrInfinity::PositiveInfinity
        );
        assert_eq!(
            JsValue::new(f64::NEG_INFINITY)
                .to_integer_or_infinity(ctx)
                .unwrap(),
            IntegerOrInfinity::NegativeInfinity
        );
        assert_eq!(
            JsValue::new(10).to_integer_or_infinity(ctx).unwrap(),
            IntegerOrInfinity::Integer(10)
        );
        assert_eq!(
            JsValue::new(11.0).to_integer_or_infinity(ctx).unwrap(),
            IntegerOrInfinity::Integer(11)
        );
        assert_eq!(
            JsValue::new(js_str!("12"))
                .to_integer_or_infinity(ctx)
                .unwrap(),
            IntegerOrInfinity::Integer(12)
        );
        assert_eq!(
            JsValue::new(true).to_integer_or_infinity(ctx).unwrap(),
            IntegerOrInfinity::Integer(1)
        );
    })]);
}

#[test]
fn test_accessors() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let arr = [];
                let a = { get b() { return "c" }, set b(value) { arr = arr.concat([value]) }} ;
                a.b = "a";
            "#}),
        TestAction::assert_eq("a.b", js_str!("c")),
        TestAction::assert_eq("arr[0]", js_str!("a")),
    ]);
}

#[test]
fn to_primitive() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let a = {};
                a[Symbol.toPrimitive] = function() {
                    return 42;
                };
                let primitive = a + 0;
            "#}),
        TestAction::assert_eq("primitive", 42),
    ]);
}

#[test]
fn object_to_property_key() {
    let source = r#"
        let obj = {};

        let to_primitive_42 = {
            [Symbol.toPrimitive]() {
                return 42;
            }
        };
        obj[to_primitive_42] = 1;

        let to_primitive_true = {
            [Symbol.toPrimitive]() {
                return true;
            }
        };
        obj[to_primitive_true] = 2;

        let to_primitive_str = {
            [Symbol.toPrimitive]() {
                return "str1";
            }
        };
        obj[to_primitive_str] = 3;

        let mysymbol = Symbol("test");
        let to_primitive_symbol = {
            [Symbol.toPrimitive]() {
                return mysymbol;
            }
        };
        obj[to_primitive_symbol] = 4;

        let to_str = {
            toString: function() {
                return "str2";
            }
        };
        obj[to_str] = 5;
    "#;
    run_test_actions([
        TestAction::run(source),
        TestAction::assert_eq("obj[42]", 1),
        TestAction::assert_eq("obj[true]", 2),
        TestAction::assert_eq("obj['str1']", 3),
        TestAction::assert_eq("obj[mysymbol]", 4),
        TestAction::assert_eq("obj['str2']", 5),
    ]);
}

#[test]
fn to_index() {
    run_test_actions([TestAction::inspect_context(|ctx| {
        assert_eq!(JsValue::undefined().to_index(ctx).unwrap(), 0);
        assert!(JsValue::new(-1).to_index(ctx).is_err());
    })]);
}

#[test]
fn to_length() {
    run_test_actions([TestAction::inspect_context(|ctx| {
        assert_eq!(JsValue::new(f64::NAN).to_length(ctx).unwrap(), 0);
        assert_eq!(JsValue::new(f64::NEG_INFINITY).to_length(ctx).unwrap(), 0);
        assert_eq!(
            JsValue::new(f64::INFINITY).to_length(ctx).unwrap(),
            Number::MAX_SAFE_INTEGER as u64
        );
        assert_eq!(JsValue::new(0.0).to_length(ctx).unwrap(), 0);
        assert_eq!(JsValue::new(-0.0).to_length(ctx).unwrap(), 0);
        assert_eq!(JsValue::new(20.9).to_length(ctx).unwrap(), 20);
        assert_eq!(JsValue::new(-20.9).to_length(ctx).unwrap(), 0);
        assert_eq!(
            JsValue::new(100_000_000_000.0).to_length(ctx).unwrap(),
            100_000_000_000
        );
        assert_eq!(
            JsValue::new(4_010_101_101.0).to_length(ctx).unwrap(),
            4_010_101_101
        );
    })]);
}

#[test]
fn to_int32() {
    run_test_actions([TestAction::inspect_context(|ctx| {
        macro_rules! check_to_int32 {
            ($from:expr => $to:expr) => {
                assert_eq!(JsValue::new($from).to_i32(ctx).unwrap(), $to);
            };
        }

        check_to_int32!(f64::NAN => 0);
        check_to_int32!(f64::NEG_INFINITY => 0);
        check_to_int32!(f64::INFINITY => 0);
        check_to_int32!(0 => 0);
        check_to_int32!(-0.0 => 0);

        check_to_int32!(20.9 => 20);
        check_to_int32!(-20.9 => -20);

        check_to_int32!(Number::MIN_VALUE => 0);
        check_to_int32!(-Number::MIN_VALUE => 0);
        check_to_int32!(0.1 => 0);
        check_to_int32!(-0.1 => 0);
        check_to_int32!(1 => 1);
        check_to_int32!(1.1 => 1);
        check_to_int32!(-1 => -1);
        check_to_int32!(0.6 => 0);
        check_to_int32!(1.6 => 1);
        check_to_int32!(-0.6 => 0);
        check_to_int32!(-1.6 => -1);

        check_to_int32!(2_147_483_647.0 => 2_147_483_647);
        check_to_int32!(2_147_483_648.0 => -2_147_483_648);
        check_to_int32!(2_147_483_649.0 => -2_147_483_647);

        check_to_int32!(4_294_967_295.0 => -1);
        check_to_int32!(4_294_967_296.0 => 0);
        check_to_int32!(4_294_967_297.0 => 1);

        check_to_int32!(-2_147_483_647.0 => -2_147_483_647);
        check_to_int32!(-2_147_483_648.0 => -2_147_483_648);
        check_to_int32!(-2_147_483_649.0 => 2_147_483_647);

        check_to_int32!(-4_294_967_295.0 => 1);
        check_to_int32!(-4_294_967_296.0 => 0);
        check_to_int32!(-4_294_967_297.0 => -1);

        check_to_int32!(2_147_483_648.25 => -2_147_483_648);
        check_to_int32!(2_147_483_648.5 => -2_147_483_648);
        check_to_int32!(2_147_483_648.75 => -2_147_483_648);
        check_to_int32!(4_294_967_295.25 => -1);
        check_to_int32!(4_294_967_295.5 => -1);
        check_to_int32!(4_294_967_295.75 => -1);
        check_to_int32!(3_000_000_000.25 => -1_294_967_296);
        check_to_int32!(3_000_000_000.5 => -1_294_967_296);
        check_to_int32!(3_000_000_000.75 => -1_294_967_296);

        check_to_int32!(-2_147_483_648.25 => -2_147_483_648);
        check_to_int32!(-2_147_483_648.5 => -2_147_483_648);
        check_to_int32!(-2_147_483_648.75 => -2_147_483_648);
        check_to_int32!(-4_294_967_295.25 => 1);
        check_to_int32!(-4_294_967_295.5 => 1);
        check_to_int32!(-4_294_967_295.75 => 1);
        check_to_int32!(-3_000_000_000.25 => 1_294_967_296);
        check_to_int32!(-3_000_000_000.5 => 1_294_967_296);
        check_to_int32!(-3_000_000_000.75 => 1_294_967_296);

        let base = 18_446_744_073_709_552_000.0; // approx. 2^64
        check_to_int32!(base + 0.0 => 0);
        check_to_int32!(base + 1117.0 => 0);
        check_to_int32!(base + 2234.0 => 4096);
        check_to_int32!(base + 3351.0 => 4096);
        check_to_int32!(base + 4468.0 => 4096);
        check_to_int32!(base + 5585.0 => 4096);
        check_to_int32!(base + 6702.0 => 8192);
        check_to_int32!(base + 7819.0 => 8192);
        check_to_int32!(base + 8936.0 => 8192);
        check_to_int32!(base + 10053.0 => 8192);
        check_to_int32!(base + 11170.0 => 12288);
        check_to_int32!(base + 12287.0 => 12288);
        check_to_int32!(base + 13404.0 => 12288);
        check_to_int32!(base + 14521.0 => 16384);
        check_to_int32!(base + 15638.0 => 16384);
        check_to_int32!(base + 16755.0 => 16384);
        check_to_int32!(base + 17872.0 => 16384);
        check_to_int32!(base + 18989.0 => 20480);
        check_to_int32!(base + 20106.0 => 20480);
        check_to_int32!(base + 21223.0 => 20480);
        check_to_int32!(base + 22340.0 => 20480);
        check_to_int32!(base + 23457.0 => 24576);
        check_to_int32!(base + 24574.0 => 24576);
        check_to_int32!(base + 25691.0 => 24576);
        check_to_int32!(base + 26808.0 => 28672);
        check_to_int32!(base + 27925.0 => 28672);
        check_to_int32!(base + 29042.0 => 28672);
        check_to_int32!(base + 30159.0 => 28672);
        check_to_int32!(base + 31276.0 => 32768);

        // bignum is the highest number with bit 31 set.
        let bignum = f64::from_bits(0x452f_ffff_ffff_ffff);
        check_to_int32!(bignum => -2_147_483_648);
        check_to_int32!(-bignum => -2_147_483_648);
        check_to_int32!(2.0 * bignum => 0);
        check_to_int32!(-(2.0 * bignum) => 0);
        check_to_int32!(bignum - 2_147_483_648.0 => 0);
        check_to_int32!(-(bignum - 2_147_483_648.0) => 0);

        // max_fraction is largest number below 1.
        let max_fraction = 1.0f64.next_down();
        check_to_int32!(max_fraction => 0);
        check_to_int32!(-max_fraction => 0);
    })]);
}

#[test]
fn to_string() {
    run_test_actions([TestAction::inspect_context(|ctx| {
        assert_eq!(&JsValue::null().to_string(ctx).unwrap(), "null");
        assert_eq!(&JsValue::undefined().to_string(ctx).unwrap(), "undefined");
        assert_eq!(&JsValue::new(55).to_string(ctx).unwrap(), "55");
        assert_eq!(&JsValue::new(55.0).to_string(ctx).unwrap(), "55");
        assert_eq!(
            JsValue::new(js_str!("hello")).to_string(ctx).unwrap(),
            js_str!("hello")
        );
    })]);
}

#[test]
fn to_bigint() {
    run_test_actions([TestAction::inspect_context(|ctx| {
        assert!(JsValue::null().to_bigint(ctx).is_err());
        assert!(JsValue::undefined().to_bigint(ctx).is_err());
        assert!(JsValue::new(55).to_bigint(ctx).is_err());
        assert!(JsValue::new(10.0).to_bigint(ctx).is_err());
        assert!(JsValue::new(js_str!("100")).to_bigint(ctx).is_ok());
    })]);
}

#[test]
fn pad_end() {
    run_test_actions([
        TestAction::assert_eq("'abc'.padEnd(10, false)", js_string!("abcfalsefa")),
        TestAction::assert_eq("'abc'.padEnd(10, true)", js_string!("abctruetru")),
        TestAction::assert_eq("'abc'.padEnd(10, null)", js_string!("abcnullnul")),
        TestAction::assert_eq("'abc'.padEnd(10, 0)", js_string!("abc0000000")),
        TestAction::assert_eq("'abc'.padEnd(10, -0)", js_string!("abc0000000")),
        TestAction::assert_eq("'abc'.padEnd(10, NaN)", js_string!("abcNaNNaNN")),
    ]);
}

/// Test cyclic conversions that previously caused stack overflows
/// Relevant mitigation for these are in `JsObject::ordinary_to_primitive` and
/// `JsObject::to_json`
mod cyclic_conversions {
    use crate::JsNativeErrorKind;

    use super::*;

    #[test]
    fn to_json_cyclic() {
        run_test_actions([TestAction::assert_native_error(
            indoc! {r#"
                let a = [];
                a[0] = a;
                JSON.stringify(a)
            "#},
            JsNativeErrorKind::Type,
            "cyclic object value",
        )]);
    }

    #[test]
    fn to_json_noncyclic() {
        run_test_actions([TestAction::assert_eq(
            indoc! {r#"
                let b = [];
                let a = [b, b];
                JSON.stringify(a)
            "#},
            js_str!("[[],[]]"),
        )]);
    }

    // These tests don't throw errors. Instead we mirror Chrome / Firefox behavior for these
    // conversions

    #[test]
    fn to_string_cyclic() {
        run_test_actions([TestAction::assert_eq(
            indoc! {r#"
                let a = [];
                a[0] = a;
                a.toString()
            "#},
            js_string!(),
        )]);
    }

    #[test]
    fn to_number_cyclic() {
        run_test_actions([TestAction::assert_eq(
            indoc! {r#"
                let a = [];
                a[0] = a;
                +a
            "#},
            0.0,
        )]);
    }

    #[test]
    fn to_boolean_cyclic() {
        // this already worked before the mitigation, but we don't want to cause a regression
        run_test_actions([TestAction::assert(indoc! {r#"
                let a = [];
                a[0] = a;
                !!a
            "#})]);
    }

    #[test]
    fn to_bigint_cyclic() {
        run_test_actions([TestAction::assert_eq(
            indoc! {r#"
                let a = [];
                a[0] = a;
                BigInt(a)
            "#},
            JsBigInt::new(0),
        )]);
    }

    #[test]
    fn to_u32_cyclic() {
        run_test_actions([TestAction::assert_eq(
            indoc! {r#"
                    let a = [];
                    a[0] = a;
                    a | 0
                "#},
            0.0,
        )]);
    }
}

mod abstract_relational_comparison {
    #![allow(clippy::bool_assert_comparison)]

    use super::*;

    #[test]
    fn number_less_than_number() {
        run_test_actions([
            TestAction::assert("1 < 2"),
            TestAction::assert("!(2 < 2)"),
            TestAction::assert("!(3 < 2)"),
            TestAction::assert("2 < 2.5"),
            TestAction::assert("!(2.5 < 2)"),
        ]);
    }

    #[test]
    fn string_less_than_number() {
        run_test_actions([
            TestAction::assert("'1' < 2"),
            TestAction::assert("!('2' < 2)"),
            TestAction::assert("!('3' < 2)"),
            TestAction::assert("'2' < 2.5"),
            TestAction::assert("!('2.5' < 2.5)"),
        ]);
    }

    #[test]
    fn number_less_than_string() {
        run_test_actions([
            TestAction::assert("1 < '2'"),
            TestAction::assert("!(2 < '2')"),
            TestAction::assert("!(3 < '2')"),
            TestAction::assert("2 < '2.5'"),
            TestAction::assert("!(2.5 < '2')"),
        ]);
    }

    #[test]
    fn number_object_less_than_number() {
        run_test_actions([
            TestAction::assert("new Number(1) < 2"),
            TestAction::assert("!(new Number(2) < 2)"),
            TestAction::assert("!(new Number(3) < 2)"),
            TestAction::assert("new Number(2) < 2.5"),
            TestAction::assert("!(new Number(2.5) < 2)"),
        ]);
    }

    #[test]
    fn number_object_less_than_number_object() {
        run_test_actions([
            TestAction::assert("new Number(1) < new Number(2)"),
            TestAction::assert("!(new Number(2) < new Number(2))"),
            TestAction::assert("!(new Number(3) < new Number(2))"),
            TestAction::assert("new Number(2) < new Number(2.5)"),
            TestAction::assert("!(new Number(2.5) < new Number(2))"),
        ]);
    }

    #[test]
    fn string_less_than_string() {
        run_test_actions([
            TestAction::assert("!('hello' < 'hello')"),
            TestAction::assert("'hell' < 'hello'"),
            TestAction::assert("'hello, world' < 'world'"),
            TestAction::assert("'aa' < 'ab'"),
        ]);
    }

    #[test]
    fn string_object_less_than_string() {
        run_test_actions([
            TestAction::assert("!(new String('hello') < 'hello')"),
            TestAction::assert("new String('hell') < 'hello'"),
            TestAction::assert("new String('hello, world') < 'world'"),
            TestAction::assert("new String('aa') < 'ab'"),
        ]);
    }

    #[test]
    fn string_object_less_than_string_object() {
        run_test_actions([
            TestAction::assert("!(new String('hello') < new String('hello'))"),
            TestAction::assert("new String('hell') < new String('hello')"),
            TestAction::assert("new String('hello, world') < new String('world')"),
            TestAction::assert("new String('aa') < new String('ab')"),
        ]);
    }

    #[test]
    fn bigint_less_than_number() {
        run_test_actions([
            TestAction::assert("1n < 10"),
            TestAction::assert("!(10n < 10)"),
            TestAction::assert("!(100n < 10)"),
            TestAction::assert("10n < 10.9"),
        ]);
    }

    #[test]
    fn number_less_than_bigint() {
        run_test_actions([
            TestAction::assert("!(10 < 1n)"),
            TestAction::assert("!(1 < 1n)"),
            TestAction::assert("!(-1 < -1n)"),
            TestAction::assert("-1.9 < -1n"),
        ]);
    }

    #[test]
    fn negative_infinity_less_than_bigint() {
        run_test_actions([
            TestAction::assert("-Infinity < -10000000000n"),
            TestAction::assert("-Infinity < (-1n << 100n)"),
        ]);
    }

    #[test]
    fn bigint_less_than_infinity() {
        run_test_actions([
            TestAction::assert("!(1000n < NaN)"),
            TestAction::assert("!((1n << 100n) < NaN)"),
        ]);
    }

    #[test]
    fn nan_less_than_bigint() {
        run_test_actions([
            TestAction::assert("!(NaN < -10000000000n)"),
            TestAction::assert("!(NaN < (-1n << 100n))"),
        ]);
    }

    #[test]
    fn bigint_less_than_nan() {
        run_test_actions([
            TestAction::assert("1000n < Infinity"),
            TestAction::assert("(1n << 100n) < Infinity"),
        ]);
    }

    #[test]
    fn bigint_less_than_string() {
        run_test_actions([
            TestAction::assert("!(1000n < '1000')"),
            TestAction::assert("1000n < '2000'"),
            TestAction::assert("!(1n < '-1')"),
            TestAction::assert("!(2n < '-1')"),
            TestAction::assert("!(-100n < 'InvalidBigInt')"),
        ]);
    }

    #[test]
    fn string_less_than_bigint() {
        run_test_actions([
            TestAction::assert("!('1000' < 1000n)"),
            TestAction::assert("!('2000' < 1000n)"),
            TestAction::assert("'500' < 1000n"),
            TestAction::assert("'-1' < 1n"),
            TestAction::assert("'-1' < 2n"),
            TestAction::assert("!('InvalidBigInt' < -100n)"),
        ]);
    }

    // -------------------------------------------

    #[test]
    fn number_less_than_or_equal_number() {
        run_test_actions([
            TestAction::assert("1 <= 2"),
            TestAction::assert("2 <= 2"),
            TestAction::assert("!(3 <= 2)"),
            TestAction::assert("2 <= 2.5"),
            TestAction::assert("!(2.5 <= 2)"),
        ]);
    }

    #[test]
    fn string_less_than_or_equal_number() {
        run_test_actions([
            TestAction::assert("'1' <= 2"),
            TestAction::assert("'2' <= 2"),
            TestAction::assert("!('3' <= 2)"),
            TestAction::assert("'2' <= 2.5"),
            TestAction::assert("!('2.5' <= 2)"),
        ]);
    }

    #[test]
    fn number_less_than_or_equal_string() {
        run_test_actions([
            TestAction::assert("1 <= '2'"),
            TestAction::assert("2 <= '2'"),
            TestAction::assert("!(3 <= '2')"),
            TestAction::assert("2 <= '2.5'"),
            TestAction::assert("!(2.5 <= '2')"),
        ]);
    }

    #[test]
    fn number_object_less_than_or_equal_number() {
        run_test_actions([
            TestAction::assert("new Number(1) <= '2'"),
            TestAction::assert("new Number(2) <= '2'"),
            TestAction::assert("!(new Number(3) <= '2')"),
            TestAction::assert("new Number(2) <= '2.5'"),
            TestAction::assert("!(new Number(2.5) <= '2')"),
        ]);
    }

    #[test]
    fn number_object_less_than_number_or_equal_object() {
        run_test_actions([
            TestAction::assert("new Number(1) <= new Number(2)"),
            TestAction::assert("new Number(2) <= new Number(2)"),
            TestAction::assert("!(new Number(3) <= new Number(2))"),
            TestAction::assert("new Number(2) <= new Number(2.5)"),
            TestAction::assert("!(new Number(2.5) <= new Number(2))"),
        ]);
    }

    #[test]
    fn string_less_than_or_equal_string() {
        run_test_actions([
            TestAction::assert("'hello' <= 'hello'"),
            TestAction::assert("'hell' <= 'hello'"),
            TestAction::assert("'hello, world' <= 'world'"),
            TestAction::assert("'aa' <= 'ab'"),
        ]);
    }

    #[test]
    fn string_object_less_than_or_equal_string() {
        run_test_actions([
            TestAction::assert("new String('hello') <= 'hello'"),
            TestAction::assert("new String('hell') <= 'hello'"),
            TestAction::assert("new String('hello, world') <= 'world'"),
            TestAction::assert("new String('aa') <= 'ab'"),
        ]);
    }

    #[test]
    fn string_object_less_than_string_or_equal_object() {
        run_test_actions([
            TestAction::assert("new String('hello') <= new String('hello')"),
            TestAction::assert("new String('hell') <= new String('hello')"),
            TestAction::assert("new String('hello, world') <= new String('world')"),
            TestAction::assert("new String('aa') <= new String('ab')"),
        ]);
    }

    #[test]
    fn bigint_less_than_or_equal_number() {
        run_test_actions([
            TestAction::assert("1n <= 10"),
            TestAction::assert("10n <= 10"),
            TestAction::assert("!(100n <= 10)"),
            TestAction::assert("10n <= 10.9"),
        ]);
    }

    #[test]
    fn number_less_than_or_equal_bigint() {
        run_test_actions([
            TestAction::assert("!(10 <= 1n)"),
            TestAction::assert("1 <= 1n"),
            TestAction::assert("-1 <= -1n"),
            TestAction::assert("-1.9 <= -1n"),
        ]);
    }

    #[test]
    fn negative_infinity_less_than_or_equal_bigint() {
        run_test_actions([
            TestAction::assert("-Infinity <= -10000000000n"),
            TestAction::assert("-Infinity <= (-1n << 100n)"),
        ]);
    }

    #[test]
    fn bigint_less_than_or_equal_infinity() {
        run_test_actions([
            TestAction::assert("!(1000n <= NaN)"),
            TestAction::assert("!((1n << 100n) <= NaN)"),
        ]);
    }

    #[test]
    fn nan_less_than_or_equal_bigint() {
        run_test_actions([
            TestAction::assert("!(NaN <= -10000000000n)"),
            TestAction::assert("!(NaN <= (-1n << 100n))"),
        ]);
    }

    #[test]
    fn bigint_less_than_or_equal_nan() {
        run_test_actions([
            TestAction::assert("1000n <= Infinity"),
            TestAction::assert("(1n << 100n) <= Infinity"),
        ]);
    }

    #[test]
    fn bigint_less_than_or_equal_string() {
        run_test_actions([
            TestAction::assert("1000n <= '1000'"),
            TestAction::assert("1000n <= '2000'"),
            TestAction::assert("!(1n <= '-1')"),
            TestAction::assert("!(2n <= '-1')"),
            TestAction::assert("!(-100n <= 'InvalidBigInt')"),
        ]);
    }

    #[test]
    fn string_less_than_or_equal_bigint() {
        run_test_actions([
            TestAction::assert("'1000' <= 1000n"),
            TestAction::assert("!('2000' <= 1000n)"),
            TestAction::assert("'500' <= 1000n"),
            TestAction::assert("'-1' <= 1n"),
            TestAction::assert("'-1' <= 2n"),
            TestAction::assert("!('InvalidBigInt' <= -100n)"),
        ]);
    }

    // -------------------------------------------

    #[test]
    fn number_greater_than_number() {
        run_test_actions([
            TestAction::assert("!(1 > 2)"),
            TestAction::assert("!(2 > 2)"),
            TestAction::assert("3 > 2"),
            TestAction::assert("!(2 > 2.5)"),
            TestAction::assert("2.5 > 2"),
        ]);
    }

    #[test]
    fn string_greater_than_number() {
        run_test_actions([
            TestAction::assert("!('1' > 2)"),
            TestAction::assert("!('2' > 2)"),
            TestAction::assert("'3' > 2"),
            TestAction::assert("!('2' > 2.5)"),
            TestAction::assert("'2.5' > 2"),
        ]);
    }

    #[test]
    fn number_less_greater_string() {
        run_test_actions([
            TestAction::assert("!(1 > '2')"),
            TestAction::assert("!(2 > '2')"),
            TestAction::assert("3 > '2'"),
            TestAction::assert("!(2 > '2.5')"),
            TestAction::assert("2.5 > '2'"),
        ]);
    }

    #[test]
    fn number_object_greater_than_number() {
        run_test_actions([
            TestAction::assert("!(new Number(1) > '2')"),
            TestAction::assert("!(new Number(2) > '2')"),
            TestAction::assert("new Number(3) > '2'"),
            TestAction::assert("!(new Number(2) > '2.5')"),
            TestAction::assert("new Number(2.5) > '2'"),
        ]);
    }

    #[test]
    fn number_object_greater_than_number_object() {
        run_test_actions([
            TestAction::assert("!(new Number(1) > new Number(2))"),
            TestAction::assert("!(new Number(2) > new Number(2))"),
            TestAction::assert("3 > new Number(2)"),
            TestAction::assert("!(new Number(2) > new Number(2.5))"),
            TestAction::assert("new Number(2.5) > new Number(2)"),
        ]);
    }

    #[test]
    fn string_greater_than_string() {
        run_test_actions([
            TestAction::assert("!('hello' > 'hello')"),
            TestAction::assert("!('hell' > 'hello')"),
            TestAction::assert("!('hello, world' > 'world')"),
            TestAction::assert("!('aa' > 'ab')"),
            TestAction::assert("'ab' > 'aa'"),
        ]);
    }

    #[test]
    fn string_object_greater_than_string() {
        run_test_actions([
            TestAction::assert("!(new String('hello') > 'hello')"),
            TestAction::assert("!(new String('hell') > 'hello')"),
            TestAction::assert("!(new String('hello, world') > 'world')"),
            TestAction::assert("!(new String('aa') > 'ab')"),
            TestAction::assert("new String('ab') > 'aa'"),
        ]);
    }

    #[test]
    fn string_object_greater_than_string_object() {
        run_test_actions([
            TestAction::assert("!(new String('hello') > new String('hello'))"),
            TestAction::assert("!(new String('hell') > new String('hello'))"),
            TestAction::assert("!(new String('hello, world') > new String('world'))"),
            TestAction::assert("!(new String('aa') > new String('ab'))"),
            TestAction::assert("new String('ab') > new String('aa')"),
        ]);
    }

    #[test]
    fn bigint_greater_than_number() {
        run_test_actions([
            TestAction::assert("!(1n > 10)"),
            TestAction::assert("!(10n > 10)"),
            TestAction::assert("100n > 10"),
            TestAction::assert("!(10n > 10.9)"),
        ]);
    }

    #[test]
    fn number_greater_than_bigint() {
        run_test_actions([
            TestAction::assert("10 > 1n"),
            TestAction::assert("!(1 > 1n)"),
            TestAction::assert("!(-1 > -1n)"),
            TestAction::assert("!(-1.9 > -1n)"),
        ]);
    }

    #[test]
    fn negative_infinity_greater_than_bigint() {
        run_test_actions([
            TestAction::assert("!(-Infinity > -10000000000n)"),
            TestAction::assert("!(-Infinity > (-1n << 100n))"),
        ]);
    }

    #[test]
    fn bigint_greater_than_infinity() {
        run_test_actions([
            TestAction::assert("!(1000n > NaN)"),
            TestAction::assert("!((1n << 100n) > NaN)"),
        ]);
    }

    #[test]
    fn nan_greater_than_bigint() {
        run_test_actions([
            TestAction::assert("!(NaN > -10000000000n)"),
            TestAction::assert("!(NaN > (-1n << 100n))"),
        ]);
    }

    #[test]
    fn bigint_greater_than_nan() {
        run_test_actions([
            TestAction::assert("!(1000n > Infinity)"),
            TestAction::assert("!((1n << 100n) > Infinity)"),
        ]);
    }

    #[test]
    fn bigint_greater_than_string() {
        run_test_actions([
            TestAction::assert("!(1000n > '1000')"),
            TestAction::assert("!(1000n > '2000')"),
            TestAction::assert("1n > '-1'"),
            TestAction::assert("2n > '-1'"),
            TestAction::assert("!(-100n > 'InvalidBigInt')"),
        ]);
    }

    #[test]
    fn string_greater_than_bigint() {
        run_test_actions([
            TestAction::assert("!('1000' > 1000n)"),
            TestAction::assert("'2000' > 1000n"),
            TestAction::assert("!('500' > 1000n)"),
            TestAction::assert("!('-1' > 1n)"),
            TestAction::assert("!('-1' > 2n)"),
            TestAction::assert("!('InvalidBigInt' > -100n)"),
        ]);
    }

    // ----------------------------------------------

    #[test]
    fn number_greater_than_or_equal_number() {
        run_test_actions([
            TestAction::assert("!(1 >= 2)"),
            TestAction::assert("2 >= 2"),
            TestAction::assert("3 >= 2"),
            TestAction::assert("!(2 >= 2.5)"),
            TestAction::assert("2.5 >= 2"),
        ]);
    }

    #[test]
    fn string_greater_than_or_equal_number() {
        run_test_actions([
            TestAction::assert("!('1' >= 2)"),
            TestAction::assert("'2' >= 2"),
            TestAction::assert("'3' >= 2"),
            TestAction::assert("!('2' >= 2.5)"),
            TestAction::assert("'2.5' >= 2"),
        ]);
    }

    #[test]
    fn number_less_greater_or_equal_string() {
        run_test_actions([
            TestAction::assert("!(1 >= '2')"),
            TestAction::assert("2 >= '2'"),
            TestAction::assert("3 >= '2'"),
            TestAction::assert("!(2 >= '2.5')"),
            TestAction::assert("2.5 >= '2'"),
        ]);
    }

    #[test]
    fn number_object_greater_than_or_equal_number() {
        run_test_actions([
            TestAction::assert("!(new Number(1) >= '2')"),
            TestAction::assert("new Number(2) >= '2'"),
            TestAction::assert("new Number(3) >= '2'"),
            TestAction::assert("!(new Number(2) >= '2.5')"),
            TestAction::assert("new Number(2.5) >= '2'"),
        ]);
    }

    #[test]
    fn number_object_greater_than_or_equal_number_object() {
        run_test_actions([
            TestAction::assert("!(new Number(1) >= new Number(2))"),
            TestAction::assert("new Number(2) >= new Number(2)"),
            TestAction::assert("new Number(3) >= new Number(2)"),
            TestAction::assert("!(new Number(2) >= new Number(2.5))"),
            TestAction::assert("new Number(2.5) >= new Number(2)"),
        ]);
    }

    #[test]
    fn string_greater_than_or_equal_string() {
        run_test_actions([
            TestAction::assert("'hello' >= 'hello'"),
            TestAction::assert("!('hell' >= 'hello')"),
            TestAction::assert("!('hello, world' >= 'world')"),
            TestAction::assert("!('aa' >= 'ab')"),
            TestAction::assert("'ab' >= 'aa'"),
        ]);
    }

    #[test]
    fn string_object_greater_or_equal_than_string() {
        run_test_actions([
            TestAction::assert("new String('hello') >= 'hello'"),
            TestAction::assert("!(new String('hell') >= 'hello')"),
            TestAction::assert("!(new String('hello, world') >= 'world')"),
            TestAction::assert("!(new String('aa') >= 'ab')"),
            TestAction::assert("new String('ab') >= 'aa'"),
        ]);
    }

    #[test]
    fn string_object_greater_than_or_equal_string_object() {
        run_test_actions([
            TestAction::assert("new String('hello') >= new String('hello')"),
            TestAction::assert("!(new String('hell') >= new String('hello'))"),
            TestAction::assert("!(new String('hello, world') >= new String('world'))"),
            TestAction::assert("!(new String('aa') >= new String('ab'))"),
            TestAction::assert("new String('ab') >= new String('aa')"),
        ]);
    }

    #[test]
    fn bigint_greater_than_or_equal_number() {
        run_test_actions([
            TestAction::assert("!(1n >= 10)"),
            TestAction::assert("10n >= 10"),
            TestAction::assert("100n >= 10"),
            TestAction::assert("!(10n >= 10.9)"),
        ]);
    }

    #[test]
    fn number_greater_than_or_equal_bigint() {
        run_test_actions([
            TestAction::assert("10 >= 1n"),
            TestAction::assert("1 >= 1n"),
            TestAction::assert("-1 >= -1n"),
            TestAction::assert("!(-1.9 >= -1n)"),
        ]);
    }

    #[test]
    fn negative_infinity_greater_or_equal_than_bigint() {
        run_test_actions([
            TestAction::assert("!(-Infinity >= -10000000000n)"),
            TestAction::assert("!(-Infinity >= (-1n << 100n))"),
        ]);
    }

    #[test]
    fn bigint_greater_than_or_equal_infinity() {
        run_test_actions([
            TestAction::assert("!(1000n >= NaN)"),
            TestAction::assert("!((1n << 100n) >= NaN)"),
        ]);
    }

    #[test]
    fn nan_greater_than_or_equal_bigint() {
        run_test_actions([
            TestAction::assert("!(NaN >= -10000000000n)"),
            TestAction::assert("!(NaN >= (-1n << 100n))"),
        ]);
    }

    #[test]
    fn bigint_greater_than_or_equal_nan() {
        run_test_actions([
            TestAction::assert("!(1000n >= Infinity)"),
            TestAction::assert("!((1n << 100n) >= Infinity)"),
        ]);
    }

    #[test]
    fn bigint_greater_than_or_equal_string() {
        run_test_actions([
            TestAction::assert("1000n >= '1000'"),
            TestAction::assert("!(1000n >= '2000')"),
            TestAction::assert("1n >= '-1'"),
            TestAction::assert("2n >= '-1'"),
            TestAction::assert("!(-100n >= 'InvalidBigInt')"),
        ]);
    }

    #[test]
    fn string_greater_than_or_equal_bigint() {
        run_test_actions([
            TestAction::assert("'1000' >= 1000n"),
            TestAction::assert("'2000' >= 1000n"),
            TestAction::assert("!('500' >= 1000n)"),
            TestAction::assert("!('-1' >= 1n)"),
            TestAction::assert("!('-1' >= 2n)"),
            TestAction::assert("!('InvalidBigInt' >= -100n)"),
        ]);
    }
}

mod js_value_macro {
    use crate::value::TryIntoJs;
    use crate::{JsValue, TestAction, js_string, run_test_actions};
    use boa_engine::{Context, JsResult, js_value};
    use boa_string::JsString;
    use std::ops::Neg;

    #[test]
    fn primitive_values() {
        run_test_actions([
            TestAction::assert_eq("true", js_value!(true)),
            TestAction::assert_eq("false", js_value!(false)),
            TestAction::assert_eq("1", js_value!(1)),
            TestAction::assert_eq("0xFFFF_FFFF", js_value!(4_294_967_295u32)),
            TestAction::assert_eq("1.5", js_value!(1.5)),
            TestAction::assert_eq("Infinity", js_value!(f32::INFINITY)),
            TestAction::assert_eq("-Infinity", js_value!(f32::INFINITY.neg())),
        ]);
    }

    #[test]
    fn arrays() {
        run_test_actions([
            TestAction::assert_with_op("[1, 2, 3]", |value, context| {
                let v = js_value!([1, 2, 3], context);
                value.deep_strict_equals(&v, context).unwrap()
            }),
            TestAction::assert_with_op("[1, [2], 3]", |value, context| {
                value
                    .deep_strict_equals(&js_value!([1, [2], 3], context), context)
                    .unwrap()
            }),
            TestAction::assert_with_op("[1, [2], [], [[false]], 3]", |value, context| {
                value
                    .deep_strict_equals(&js_value!([1, [2], [], [[false]], 3], context), context)
                    .unwrap()
            }),
        ]);
    }

    #[test]
    fn objects() {
        run_test_actions([TestAction::assert_with_op(
            r#"({ "hello": 1, "world": null })"#,
            |value, context| {
                value
                    .deep_strict_equals(&js_value!({ "hello": 1, "world": () }, context), context)
                    .unwrap()
            },
        )]);
    }

    #[test]
    fn vars() {
        run_test_actions([TestAction::assert_with_op(
            r#"({ "hello": 1, "world": null })"#,
            |value, context| {
                let hello = JsValue::from(1);
                let world = JsValue::null();

                value
                    .deep_strict_equals(
                        &js_value!({ "hello": hello, "world": world }, context),
                        context,
                    )
                    .expect("No error should happen.")
            },
        )]);
    }

    #[test]
    fn complex() {
        run_test_actions([TestAction::assert_with_op(
            r#"({ "hello": [{ "foo": [1, []] }], "world": { "bar": false } })"#,
            |value, context| {
                let bar = false;
                let other = js_value!({
                    "hello": [{ "foo": [1, []] }],
                    // Allow comments
                    "world": { "bar": bar },
                }, context);

                value
                    .deep_strict_equals(&other, context)
                    .expect("No error should happen here.")
            },
        )]);
    }

    #[test]
    fn context() {
        run_test_actions([TestAction::assert_with_op(
            r#"({ "hello": [{ "foo": [1, []] }], "world": { "bar": false } })"#,
            |value, ctx| {
                let bar = JsValue::from(false);
                let other = js_value!({
                    "hello": [{ "foo": [1, []] }],
                    // Allow comments
                    "world": { "bar": bar },
                }, ctx);

                value
                    .deep_strict_equals(&other, ctx)
                    .expect("No error should happen here.")
            },
        )]);
    }

    #[test]
    fn into_jsvalue() {
        struct Test {
            field_1: JsString,
            field_2: u32,
        }

        impl TryIntoJs for Test {
            fn try_into_js(&self, context: &mut Context) -> JsResult<JsValue> {
                Ok(js_value!({
                    "fOne": self.field_1.clone(),
                    "field2": self.field_2
                }, context))
            }
        }

        let t = Test {
            field_1: js_string!("Hello"),
            field_2: 42,
        };
        let context = &mut Context::default();
        let o = t
            .try_into_js(context)
            .expect("Failed to convert value to js.");

        assert_eq!(
            format!("{}", o.display()),
            "{\n    fOne: \"Hello\",\n    field2: 42\n}"
        );
    }
}
