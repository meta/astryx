use crate::{JsNativeErrorKind, JsValue, TestAction, run_test_actions};
use boa_macros::js_str;
use indoc::indoc;

#[test]
fn function_declaration_returns_undefined() {
    run_test_actions([TestAction::assert_eq(
        "function abc() {}",
        JsValue::undefined(),
    )]);
}

#[test]
fn empty_function_returns_undefined() {
    run_test_actions([TestAction::assert_eq(
        "(function () {}) ()",
        JsValue::undefined(),
    )]);
}

#[test]
fn implicit_return_does_not_leak_last_evaluated_expression() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let seen;

            function g(inner) {
                seen = inner;
            }

            function f() {}

            5;
            let outer = g(f());
            seen;
        "#},
        JsValue::undefined(),
    )]);
}

#[test]
fn implicit_constructor_return_uses_constructed_object() {
    run_test_actions([TestAction::assert(indoc! {r#"
        let seen;

        function g(inner) {
            seen = inner;
        }

        function f() {}

        ({});
        let outer = g(new f());
        Object.getPrototypeOf(seen) === f.prototype;
    "#})]);
}

#[test]
fn implicit_return_does_not_leak_from_previous_eval() {
    run_test_actions([
        TestAction::run("function f() {}"),
        TestAction::run("let seen; function g(inner) { seen = inner; }"),
        TestAction::run("5;"),
        TestAction::run("let outer = g(f());"),
        TestAction::assert_eq("seen", JsValue::undefined()),
    ]);
}

#[test]
fn implicit_return_does_not_leak_completion_value_from_same_eval() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            eval(`
                function f() {}
                globalThis.seen = "initial";
                function g(inner) { globalThis.seen = inner; }
                5;
                let outer = g(f());
            `);
        "#}),
        TestAction::assert_eq("globalThis.seen", JsValue::undefined()),
    ]);
}

#[test]
fn implicit_constructor_return_does_not_leak_completion_value_from_same_eval() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            eval(`
                function f() {}
                globalThis.prototype_matches = false;
                function g(inner) {
                    globalThis.prototype_matches = Object.getPrototypeOf(inner) === f.prototype;
                }
                ({});
                let outer = g(new f());
            `);
        "#}),
        TestAction::assert("globalThis.prototype_matches"),
    ]);
}

/// Regression test for issue #4485.
/// Checks that generator resumption via `g.next(f())` is not affected
/// by resetting the accumulator in `push_frame`.
#[test]
fn generator_resumption_not_affected_by_return_value_reset() {
    run_test_actions([TestAction::assert(indoc! {r#"
        let seen;

        function* gen() {
            seen = yield 1;
        }

        function f() {}

        5;
        var g = gen();
        g.next();
        g.next(f());
        seen === undefined;
    "#})]);
}

/// Regression test for issue #4485.
/// Checks that generator resumption via `g.next(new f())` receives
/// the constructed object, not a stale caller expression.
#[test]
fn generator_resumption_with_constructor_not_affected_by_return_value_reset() {
    run_test_actions([TestAction::assert(indoc! {r#"
        let seen;

        function* gen() {
            seen = yield 1;
        }

        function f() {}

        ({});
        var g = gen();
        g.next();
        g.next(new f());
        Object.getPrototypeOf(seen) === f.prototype;
    "#})]);
}

#[test]
fn property_accessor_member_expression_dot_notation_on_function() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            function asd () {};
            asd.name;
        "#},
        js_str!("asd"),
    )]);
}

#[test]
fn property_accessor_member_expression_bracket_notation_on_function() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            function asd () {};
            asd['name'];
        "#},
        js_str!("asd"),
    )]);
}

#[test]
fn early_return() {
    run_test_actions([
        TestAction::assert(indoc! {r#"
                function early_return() {
                    if (true) {
                        return true;
                    }
                    return false;
                }
                early_return()
            "#}),
        TestAction::assert_eq(
            indoc! {r#"
                function nested_fnct() {
                    return "nested";
                }
                function outer_fnct() {
                    nested_fnct();
                    return "outer";
                }
                outer_fnct()
            "#},
            js_str!("outer"),
        ),
    ]);
}

#[test]
fn should_set_this_value() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                function Foo() {
                    this.a = "a";
                    this.b = "b";
                }

                var bar = new Foo();
            "#}),
        TestAction::assert_eq("bar.a", js_str!("a")),
        TestAction::assert_eq("bar.b", js_str!("b")),
    ]);
}

#[test]
fn should_type_error_when_new_is_not_constructor() {
    run_test_actions([TestAction::assert_native_error(
        "new ''()",
        JsNativeErrorKind::Type,
        "not a constructor",
    )]);
}

#[test]
fn new_instance_should_point_to_prototype() {
    // A new instance should point to a prototype object created with the constructor function
    run_test_actions([
        TestAction::run(indoc! {r#"
                function Foo() {}
                var bar = new Foo();
            "#}),
        TestAction::assert("Object.getPrototypeOf(bar) == Foo.prototype "),
    ]);
}

#[test]
fn calling_function_with_unspecified_arguments() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            function test(a, b) {
                return b;
            }

            test(10)
        "#},
        JsValue::undefined(),
    )]);
}

#[test]
fn not_a_function() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let a = {};
                let b = true;
            "#}),
        TestAction::assert_native_error("a()", JsNativeErrorKind::Type, "not a callable function"),
        TestAction::assert_native_error(
            "a.a()",
            JsNativeErrorKind::Type,
            "not a callable function",
        ),
        TestAction::assert_native_error("b()", JsNativeErrorKind::Type, "not a callable function"),
    ]);
}

#[test]
fn strict_mode_dup_func_parameters() {
    // Checks that a function cannot contain duplicate parameter
    // names in strict mode code as per https://tc39.es/ecma262/#sec-function-definitions-static-semantics-early-errors.
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            'use strict';
            function f(a, b, b) {}
        "#},
        JsNativeErrorKind::Syntax,
        "Duplicate parameter name not allowed in this context at line 2, col 12",
    )]);
}

#[test]
fn duplicate_function_name() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            function f () {}
            function f () {return 12;}
            f()
        "#},
        12,
    )]);
}

#[test]
fn eval_out_of_scope() {
    run_test_actions([
        TestAction::run(indoc! {
        r#"
            function f() {
                var x = null;
                return (function() {
                    return eval("x");
                })();
            }
        "#
        }),
        TestAction::assert_eq("f()", JsValue::null()),
    ]);
}

/// Regression test for issue #4531.
/// `Function` constructor with nested function containing lexical bindings
/// captured by a closure should not panic with "must be declarative environment".
#[test]
fn function_constructor_nested_lexical_binding() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            var code = "\
                function f() {\
                    const a = 42;\
                    return () => { return a; };\
                }\
                return f()();\
            ";
            Function(code)();
        "#},
        42,
    )]);
}
