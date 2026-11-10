use crate::{JsNativeErrorKind, JsValue, TestAction, run_test_actions};
use boa_macros::js_str;
use indoc::indoc;

#[test]
fn object_spread() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var b = {x: -1, z: -3}
                var a = {x: 1, y: 2, ...b};
            "#}),
        TestAction::assert_eq("a.x", -1),
        TestAction::assert_eq("a.y", 2),
        TestAction::assert_eq("a.z", -3),
    ]);
}

#[test]
fn spread_with_arguments() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                const a = [1, "test", 3, 4];
                function foo(...a) {
                    return arguments;
                }

                var result = foo(...a);
            "#}),
        TestAction::assert_eq("result[0]", 1),
        TestAction::assert_eq("result[1]", js_str!("test")),
        TestAction::assert_eq("result[2]", 3),
        TestAction::assert_eq("result[3]", 4),
    ]);
}

#[test]
fn array_rest_with_arguments() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                var b = [4, 5, 6]
                var a = [1, 2, 3, ...b];
            "#}),
        TestAction::assert("arrayEquals(a, [ 1, 2, 3, 4, 5, 6 ])"),
    ]);
}

#[test]
fn spread_shallow_clone() {
    run_test_actions([TestAction::assert(indoc! {r#"
            var a = { x: {} };
            var aClone = { ...a };

            a.x === aClone.x
        "#})]);
}

#[test]
fn spread_merge() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var a = { x: 1, y: 2 };
                var b = { x: -1, z: -3, ...a };
            "#}),
        TestAction::assert_eq("b.x", 1),
        TestAction::assert_eq("b.y", 2),
        TestAction::assert_eq("b.z", -3),
    ]);
}

#[test]
fn spread_overriding_properties() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var a = { x: 0, y: 0 };
                var aWithOverrides = { ...a, ...{ x: 1, y: 2 } };
            "#}),
        TestAction::assert_eq("aWithOverrides.x", 1),
        TestAction::assert_eq("aWithOverrides.y", 2),
    ]);
}

#[test]
fn spread_getters_in_initializer() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
                var a = { x: 42 };
                var aWithXGetter = { ...a, get x() { throw new Error('not thrown yet') } };
            "#},
        JsValue::undefined(),
    )]);
}

#[test]
fn spread_getters_in_object() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            var a = { x: 42 };
            var aWithXGetter = { ...a, ... { get x() { throw new Error('not thrown yet') } } };
        "#},
        JsNativeErrorKind::Error,
        "not thrown yet",
    )]);
}

#[test]
fn spread_setters() {
    run_test_actions([TestAction::assert_eq(
        "var z = { set x(nexX) { throw new Error() }, ... { x: 1 } }",
        JsValue::undefined(),
    )]);
}

#[test]
fn spread_null_and_undefined_ignored() {
    run_test_actions([
        TestAction::run("var a = { ...null, ...undefined };"),
        TestAction::assert("!(undefined in a)"),
        TestAction::assert("!(null in a)"),
    ]);
}

#[test]
fn spread_with_new() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            function F(m) {
                this.m = m;
            }
            function f(...args) {
                return new F(...args);
            }
            f('message').m;
        "#},
        js_str!("message"),
    )]);
}

#[test]
fn spread_with_call() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            function f(m) {
                return m;
            }
            function g(...args) {
                return f(...args);
            }
            g('message');
        "#},
        js_str!("message"),
    )]);
}
