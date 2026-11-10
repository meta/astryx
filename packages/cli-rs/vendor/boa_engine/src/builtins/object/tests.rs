use crate::{JsNativeErrorKind, JsValue, TestAction, run_test_actions};
use boa_macros::js_str;
use indoc::indoc;

#[test]
fn object_create_length() {
    run_test_actions([TestAction::assert_eq("Object.create.length", 2)]);
}

#[test]
fn object_create_with_regular_object() {
    run_test_actions([TestAction::assert_eq("Object.create({ a: 5 }).a", 5)]);
}

#[test]
fn object_create_with_undefined() {
    run_test_actions([TestAction::assert_native_error(
        "Object.create()",
        JsNativeErrorKind::Type,
        "Object.create: expected 'proto' to be an Object or null, got `undefined`",
    )]);
}

#[test]
fn object_create_with_number() {
    run_test_actions([TestAction::assert_native_error(
        "Object.create(5)",
        JsNativeErrorKind::Type,
        "Object.create: expected 'proto' to be an Object or null, got `number`",
    )]);
}

#[test]
fn object_create_with_function() {
    run_test_actions([TestAction::assert(indoc! {r#"
            const x = function (){};
            const bar = Object.create(x);
            bar.__proto__ === x
        "#})]);
}

#[test]
fn object_is() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var foo = { a: 1};
                var bar = { a: 1};
            "#}),
        TestAction::assert("Object.is('foo', 'foo')"),
        TestAction::assert("!Object.is('foo', 'bar')"),
        TestAction::assert("!Object.is([], [])"),
        TestAction::assert("Object.is(foo, foo)"),
        TestAction::assert("!Object.is(foo, bar)"),
        TestAction::assert("Object.is(null, null)"),
        TestAction::assert("!Object.is(0, -0)"),
        TestAction::assert("Object.is(-0, -0)"),
        TestAction::assert("Object.is(NaN, 0/0)"),
        TestAction::assert("Object.is()"),
        TestAction::assert("Object.is(undefined)"),
    ]);
}

#[test]
fn object_has_own_property() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let symA = Symbol('a');
            let symB = Symbol('b');

            let x = {
                undefinedProp: undefined,
                nullProp: null,
                someProp: 1,
                [symA]: 2,
                100: 3,
            };
        "#}),
        TestAction::assert("!x.hasOwnProperty('hasOwnProperty')"),
        TestAction::assert("x.hasOwnProperty('undefinedProp')"),
        TestAction::assert("x.hasOwnProperty('nullProp')"),
        TestAction::assert("x.hasOwnProperty('someProp')"),
        TestAction::assert("!x.hasOwnProperty(symB)"),
        TestAction::assert("x.hasOwnProperty(symA)"),
        TestAction::assert("!x.hasOwnProperty(1000)"),
        TestAction::assert("x.hasOwnProperty(100)"),
    ]);
}

#[test]
fn object_has_own() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let symA = Symbol('a');
            let symB = Symbol('b');

            let x = {
                undefinedProp: undefined,
                nullProp: null,
                someProp: 1,
                [symA]: 2,
                100: 3,
            };
        "#}),
        TestAction::assert("!Object.hasOwn(x, 'hasOwnProperty')"),
        TestAction::assert("Object.hasOwn(x, 'undefinedProp')"),
        TestAction::assert("Object.hasOwn(x, 'nullProp')"),
        TestAction::assert("Object.hasOwn(x, 'someProp')"),
        TestAction::assert("!Object.hasOwn(x, symB)"),
        TestAction::assert("Object.hasOwn(x, symA)"),
        TestAction::assert("!Object.hasOwn(x, 1000)"),
        TestAction::assert("Object.hasOwn(x, 100)"),
    ]);
}

#[test]
fn object_property_is_enumerable() {
    run_test_actions([
        TestAction::run("let x = { enumerableProp: 'yes' };"),
        TestAction::assert("x.propertyIsEnumerable('enumerableProp')"),
        TestAction::assert("!x.propertyIsEnumerable('hasOwnProperty')"),
        TestAction::assert("!x.propertyIsEnumerable('not_here')"),
        TestAction::assert("!x.propertyIsEnumerable()"),
    ]);
}

#[test]
fn object_to_string() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                Array.prototype.toString = Object.prototype.toString;
                Function.prototype.toString = Object.prototype.toString;
                Error.prototype.toString = Object.prototype.toString;
                Boolean.prototype.toString = Object.prototype.toString;
                Number.prototype.toString = Object.prototype.toString;
                String.prototype.toString = Object.prototype.toString;
                Date.prototype.toString = Object.prototype.toString;
                RegExp.prototype.toString = Object.prototype.toString;
            "#}),
        TestAction::assert_eq(
            "Object.prototype.toString.call(undefined)",
            js_str!("[object Undefined]"),
        ),
        TestAction::assert_eq(
            "Object.prototype.toString.call(null)",
            js_str!("[object Null]"),
        ),
        TestAction::assert_eq("[].toString()", js_str!("[object Array]")),
        TestAction::assert_eq("(() => {}).toString()", js_str!("[object Function]")),
        TestAction::assert_eq("(new Error('')).toString()", js_str!("[object Error]")),
        TestAction::assert_eq("Boolean().toString()", js_str!("[object Boolean]")),
        TestAction::assert_eq("Number(42).toString()", js_str!("[object Number]")),
        TestAction::assert_eq("String('boa').toString()", js_str!("[object String]")),
        TestAction::assert_eq("(new Date()).toString()", js_str!("[object Date]")),
        TestAction::assert_eq("/boa/.toString()", js_str!("[object RegExp]")),
        TestAction::assert_eq("({}).toString()", js_str!("[object Object]")),
    ]);
}

#[test]
fn define_symbol_property() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let obj = {};
                let sym = Symbol("key");
                Object.defineProperty(obj, sym, { value: "val" });
            "#}),
        TestAction::assert_eq("obj[sym]", js_str!("val")),
    ]);
}

#[test]
fn get_own_property_descriptor_1_arg_returns_undefined() {
    run_test_actions([TestAction::assert_eq(
        "Object.getOwnPropertyDescriptor({a: 2})",
        JsValue::undefined(),
    )]);
}

#[test]
fn get_own_property_descriptor() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let obj = {a: 2};
                let prop = Object.getOwnPropertyDescriptor(obj, "a");
            "#}),
        TestAction::assert("prop.enumerable"),
        TestAction::assert("prop.writable"),
        TestAction::assert("prop.configurable"),
        TestAction::assert_eq("prop.value", 2),
    ]);
}

#[test]
fn get_own_property_descriptors() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let obj = {a: 1, b: 2};
                let props = Object.getOwnPropertyDescriptors(obj);
            "#}),
        TestAction::assert("props.a.enumerable"),
        TestAction::assert("props.a.writable"),
        TestAction::assert("props.a.configurable"),
        TestAction::assert_eq("props.a.value", 1),
        TestAction::assert("props.b.enumerable"),
        TestAction::assert("props.b.writable"),
        TestAction::assert("props.b.configurable"),
        TestAction::assert_eq("props.b.value", 2),
    ]);
}

#[test]
fn object_define_properties() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                const obj = {};

                Object.defineProperties(obj, {
                    p: {
                        value: 42,
                        writable: true
                    }
                });

                const prop = Object.getOwnPropertyDescriptor(obj, 'p');
            "#}),
        TestAction::assert("!prop.enumerable"),
        TestAction::assert("prop.writable"),
        TestAction::assert("!prop.configurable"),
        TestAction::assert_eq("prop.value", 42),
    ]);
}

#[test]
fn object_is_prototype_of() {
    run_test_actions([TestAction::assert(
        "Object.prototype.isPrototypeOf(String.prototype)",
    )]);
}

#[test]
fn object_get_own_property_names_invalid_args() {
    const ERROR: &str = "cannot convert 'null' or 'undefined' to object";

    run_test_actions([
        TestAction::assert_native_error(
            "Object.getOwnPropertyNames()",
            JsNativeErrorKind::Type,
            ERROR,
        ),
        TestAction::assert_native_error(
            "Object.getOwnPropertyNames(null)",
            JsNativeErrorKind::Type,
            ERROR,
        ),
        TestAction::assert_native_error(
            "Object.getOwnPropertyNames(undefined)",
            JsNativeErrorKind::Type,
            ERROR,
        ),
    ]);
}

#[test]
fn object_get_own_property_names() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertyNames(0),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertyNames(false),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertyNames(Symbol("a")),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertyNames({}),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertyNames(NaN),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertyNames([1, 2, 3]),
                    ["0", "1", "2", "length"]
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertyNames({
                        "a": 1,
                        "b": 2,
                        [ Symbol("c") ]: 3,
                        [ Symbol("d") ]: 4,
                    }),
                    ["a", "b"]
                )
            "#}),
    ]);
}

#[test]
fn object_get_own_property_symbols_invalid_args() {
    const ERROR: &str = "cannot convert 'null' or 'undefined' to object";

    run_test_actions([
        TestAction::assert_native_error(
            "Object.getOwnPropertySymbols()",
            JsNativeErrorKind::Type,
            ERROR,
        ),
        TestAction::assert_native_error(
            "Object.getOwnPropertySymbols(null)",
            JsNativeErrorKind::Type,
            ERROR,
        ),
        TestAction::assert_native_error(
            "Object.getOwnPropertySymbols(undefined)",
            JsNativeErrorKind::Type,
            ERROR,
        ),
    ]);
}

#[test]
fn object_get_own_property_symbols() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertySymbols(0),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertySymbols(false),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertySymbols(Symbol("a")),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertySymbols({}),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertySymbols(NaN),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Object.getOwnPropertySymbols([1, 2, 3]),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                let c = Symbol("c");
                let d = Symbol("d");
                arrayEquals(
                    Object.getOwnPropertySymbols({
                        "a": 1,
                        "b": 2,
                        [ c ]: 3,
                        [ d ]: 4,
                    }),
                    [c, d]
                )
            "#}),
    ]);
}

#[test]
fn object_from_entries_invalid_args() {
    const ERROR: &str = "cannot convert null or undefined to Object";

    run_test_actions([
        TestAction::assert_native_error("Object.fromEntries()", JsNativeErrorKind::Type, ERROR),
        TestAction::assert_native_error("Object.fromEntries(null)", JsNativeErrorKind::Type, ERROR),
        TestAction::assert_native_error(
            "Object.fromEntries(undefined)",
            JsNativeErrorKind::Type,
            ERROR,
        ),
    ]);
}

#[test]
fn object_from_entries() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let sym = Symbol("sym");
                let map = Object.fromEntries([
                    ["long key", 1],
                    ["short", 2],
                    [sym, 3],
                    [5, 4],
                ]);
            "#}),
        TestAction::assert_eq("map['long key']", 1),
        TestAction::assert_eq("map.short", 2),
        TestAction::assert_eq("map[sym]", 3),
        TestAction::assert_eq("map[5]", 4),
    ]);
}

#[test]
fn object_prototype_proto_accessor_properties() {
    run_test_actions([
        TestAction::run(
            "let desc = Object.getOwnPropertyDescriptor(Object.prototype, '__proto__');",
        ),
        TestAction::assert_eq("desc.get.length", 0),
        TestAction::assert_eq("desc.set.length", 1),
        TestAction::assert_eq("desc.get.name", js_str!("get __proto__")),
        TestAction::assert_eq("desc.set.name", js_str!("set __proto__")),
    ]);
}
