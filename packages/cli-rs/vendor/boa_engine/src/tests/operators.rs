use crate::{JsNativeErrorKind, JsValue, TestAction, run_test_actions};
use boa_macros::js_str;
use indoc::indoc;

#[test]
fn property_accessor_member_expression_dot_notation_on_string_literal() {
    run_test_actions([TestAction::assert_eq(
        "typeof 'asd'.matchAll",
        js_str!("function"),
    )]);
}

#[test]
fn property_accessor_member_expression_bracket_notation_on_string_literal() {
    run_test_actions([TestAction::assert_eq(
        "typeof 'asd'['matchAll']",
        js_str!("function"),
    )]);
}

#[test]
fn short_circuit_evaluation() {
    run_test_actions([
        // OR operation
        TestAction::assert("true || true"),
        TestAction::assert("true || false"),
        TestAction::assert("false || true"),
        TestAction::assert("!(false || false)"),
        // short circuiting OR.
        TestAction::assert_eq(
            indoc! {r#"
                function add_one_a(counter) {
                    counter.value += 1;
                    return true;
                }
                let counter_a = { value: 0 };
                add_one_a(counter_a) || add_one_a(counter_a);
                counter_a.value
            "#},
            1,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                function add_one_b(counter) {
                    counter.value += 1;
                    return false;
                }
                let counter_b = { value: 0 };
                add_one_b(counter_b) || add_one_b(counter_b);
                counter_b.value
            "#},
            2,
        ),
        // AND operation
        TestAction::assert("true && true"),
        TestAction::assert("!(true && false)"),
        TestAction::assert("!(false && true)"),
        TestAction::assert("!(false && false)"),
        // short circuiting AND
        TestAction::assert_eq(
            indoc! {r#"
                function add_one_c(counter) {
                    counter.value += 1;
                    return true;
                }
                let counter_c = { value: 0 };
                add_one_c(counter_c) && add_one_c(counter_c);
                counter_c.value
            "#},
            2,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                function add_one_d(counter) {
                    counter.value += 1;
                    return false;
                }
                let counter_d = { value: 0 };
                add_one_d(counter_d) && add_one_d(counter_d);
                counter_d.value
            "#},
            1,
        ),
    ]);
}

#[test]
fn tilde_operator() {
    run_test_actions([
        // float
        TestAction::assert_eq("~(-1.2)", 0),
        // numeric
        TestAction::assert_eq("~1789", -1790),
        // nan
        TestAction::assert_eq("~NaN", -1),
        // object
        TestAction::assert_eq("~{}", -1),
        // boolean true
        TestAction::assert_eq("~true", -2),
        // boolean false
        TestAction::assert_eq("~false", -1),
    ]);
}

#[test]
fn assign_operator_precedence() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 1;
            a = a + 1;
            a
        "#},
        2,
    )]);
}

#[test]
fn unary_pre() {
    run_test_actions([
        TestAction::assert_eq("{ let a = 5; ++a; a }", 6),
        TestAction::assert_eq("{ let b = 5; --b; b }", 4),
        TestAction::assert_eq("{ const c = { a: 5 }; ++c.a; c['a'] }", 6),
        TestAction::assert_eq("{ const d = { a: 5 }; --d['a']; d.a }", 4),
        TestAction::assert_eq("{ let e = 5; ++e }", 6),
        TestAction::assert_eq("{ let f = 5; --f }", 4),
        TestAction::assert_eq("{ let g = 2147483647; ++g }", 2_147_483_648_i64),
        TestAction::assert_eq("{ let h = -2147483648; --h }", -2_147_483_649_i64),
        TestAction::assert_eq(
            indoc! {r#"
                let i = {[Symbol.toPrimitive]() { return 123; }};
                ++i
            "#},
            124,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                let j = {[Symbol.toPrimitive]() { return 123; }};
                ++j
            "#},
            124,
        ),
    ]);
}

#[test]
fn invalid_unary_access() {
    run_test_actions([
        TestAction::assert_native_error(
            "++[]",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 1",
        ),
        TestAction::assert_native_error(
            "[]++",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 3",
        ),
        TestAction::assert_native_error(
            "--[]",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 1",
        ),
        TestAction::assert_native_error(
            "[]--",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 3",
        ),
    ]);
}

#[test]
fn unary_operations_on_this() {
    // https://tc39.es/ecma262/#sec-assignment-operators-static-semantics-early-errors
    run_test_actions([
        TestAction::assert_native_error(
            "++this",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 1",
        ),
        TestAction::assert_native_error(
            "--this",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 1",
        ),
        TestAction::assert_native_error(
            "this++",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 5",
        ),
        TestAction::assert_native_error(
            "this--",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 5",
        ),
    ]);
}

#[test]
fn typeofs() {
    run_test_actions([
        TestAction::assert_eq("typeof String()", js_str!("string")),
        TestAction::assert_eq("typeof 5", js_str!("number")),
        TestAction::assert_eq("typeof 0.5", js_str!("number")),
        TestAction::assert_eq("typeof undefined", js_str!("undefined")),
        TestAction::assert_eq("typeof true", js_str!("boolean")),
        TestAction::assert_eq("typeof null", js_str!("object")),
        TestAction::assert_eq("typeof {}", js_str!("object")),
        TestAction::assert_eq("typeof Symbol()", js_str!("symbol")),
        TestAction::assert_eq("typeof function(){}", js_str!("function")),
    ]);
}

#[test]
fn typeof_edge_cases() {
    run_test_actions([
        TestAction::assert_eq("typeof notDeclared", js_str!("undefined")),
        TestAction::assert_eq(
            indoc! {r#"
                function f() {
                    return typeof x;
                    var x = 1;
                }
                f();
            "#},
            js_str!("undefined"),
        ),
        TestAction::assert_native_error(
            indoc! {r#"
                function f() {
                    return typeof x;
                    let x = 1;
                }
                f();
            "#},
            JsNativeErrorKind::Reference,
            "access of uninitialized binding",
        ),
        TestAction::assert_native_error(
            indoc! {r#"
                function f() {
                    return typeof x;
                    const x = 1;
                }
                f();
            "#},
            JsNativeErrorKind::Reference,
            "access of uninitialized binding",
        ),
    ]);
}

#[test]
fn unary_post() {
    run_test_actions([
        TestAction::assert_eq("{ let a = 5; a++; a }", 6),
        TestAction::assert_eq("{ let b = 5; b--; b }", 4),
        TestAction::assert_eq("{ const c = { a: 5 }; c.a++; c['a'] }", 6),
        TestAction::assert_eq("{ const d = { a: 5 }; d['a']--; d.a }", 4),
        TestAction::assert_eq("{ let e = 5; e++ }", 5),
        TestAction::assert_eq("{ let f = 5; f-- }", 5),
        TestAction::assert_eq("{ let g = 2147483647; g++; g }", 2_147_483_648_i64),
        TestAction::assert_eq("{ let h = -2147483648; h--; h }", -2_147_483_649_i64),
        TestAction::assert_eq(
            indoc! {r#"
                let i = {[Symbol.toPrimitive]() { return 123; }};
                i++
            "#},
            123,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                let j = {[Symbol.toPrimitive]() { return 123; }};
                j--
            "#},
            123,
        ),
    ]);
}

#[test]
fn unary_void() {
    run_test_actions([
        TestAction::assert_eq("{ const a = 0; void a }", JsValue::undefined()),
        TestAction::assert_eq(
            indoc! {r#"
                let a = 0;
                const test = () => a = 42;
                const b = void test() + '';
                a + b
            "#},
            js_str!("42undefined"),
        ),
    ]);
}

#[test]
fn unary_delete() {
    run_test_actions([
        TestAction::assert("{ var a = 5; !(delete a) && a === 5 }"),
        TestAction::assert("{ const a = { b: 5 }; delete a.b && a.b === undefined }"),
        TestAction::assert("{ const a = { b: 5 }; delete a.c && a.b === 5 }"),
        TestAction::assert("{ const a = { b: 5 }; delete a['b'] && a.b === undefined }"),
        TestAction::assert("{ const a = { b: 5 }; !(delete a) }"),
        TestAction::assert("delete []"),
        TestAction::assert("delete function(){}"),
        TestAction::assert("delete delete delete 1"),
    ]);
}

#[test]
fn delete_optional_chaining() {
    run_test_actions([
        // Basic: delete o?.prop actually removes the property descriptor.
        TestAction::assert(indoc! {r#"
            var o = { a: 1 };
            delete o?.a === true
                && Object.getOwnPropertyDescriptor(o, "a") === undefined
        "#}),
        // Chain: delete o?.a.b removes nested property descriptor, keeps sibling.
        TestAction::assert(indoc! {r#"
            var o = { a: { b: 1, c: 2 } };
            delete o?.a.b === true
                && Object.getOwnPropertyDescriptor(o.a, "b") === undefined
                && o.a.c === 2
        "#}),
        // Multiple optional: delete o?.a?.b
        TestAction::assert(indoc! {r#"
            var o = { a: { b: 1 } };
            delete o?.a?.b === true
                && Object.getOwnPropertyDescriptor(o.a, "b") === undefined
        "#}),
        // Null base short-circuits to true without error.
        TestAction::assert("delete null?.a === true"),
        // Undefined base short-circuits to true without error.
        TestAction::assert("delete undefined?.a === true"),
        // Null in the middle with ?. short-circuits to true.
        TestAction::assert(indoc! {r#"
            var o = { a: null };
            delete o?.a?.b === true
        "#}),
        // Computed property: delete o?.["key"]
        TestAction::assert(indoc! {r#"
            var o = { x: 1 };
            delete o?.["x"] === true
                && Object.getOwnPropertyDescriptor(o, "x") === undefined
        "#}),
        // Computed property in chain: delete o?.a["b"]
        TestAction::assert(indoc! {r#"
            var o = { a: { b: 1 } };
            delete o?.a["b"] === true
                && Object.getOwnPropertyDescriptor(o.a, "b") === undefined
        "#}),
        // Non-existent property returns true.
        TestAction::assert(indoc! {r#"
            var o = { a: 1 };
            delete o?.nonExistent === true
                && Object.getOwnPropertyDescriptor(o, "a") !== undefined
        "#}),
        // Delete from function return value.
        TestAction::assert(indoc! {r#"
            function f() { return { x: 1 }; }
            delete f()?.x === true
        "#}),
        // Deeply nested optional chain.
        TestAction::assert(indoc! {r#"
            var o = { a: { b: { c: { d: 1 } } } };
            delete o?.a?.b?.c?.d === true
                && Object.getOwnPropertyDescriptor(o.a.b.c, "d") === undefined
        "#}),
    ]);
}

#[test]
fn comma_operator() {
    run_test_actions([
        TestAction::assert_eq(
            indoc! {r#"
                var a, b;
                b = 10;
                a = (b++, b);
                a
            "#},
            11,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                var a, b;
                b = 10;
                a = (b += 5, b /= 3, b - 3);
                a
            "#},
            2,
        ),
    ]);
}

#[test]
fn assignment_to_non_assignable() {
    // Relates to the behaviour described at
    // https://tc39.es/ecma262/#sec-assignment-operators-static-semantics-early-errors
    // Tests all assignment operators as per [spec] and [mdn]
    //
    // [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_Operators#Assignment
    // [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator

    run_test_actions(
        [
            "3 -= 5", "3 *= 5", "3 /= 5", "3 %= 5", "3 &= 5", "3 ^= 5", "3 |= 5", "3 += 5", "3 = 5",
        ]
        .into_iter()
        .map(|src| {
            TestAction::assert_native_error(
                src,
                JsNativeErrorKind::Syntax,
                "Invalid left-hand side in assignment at line 1, col 3",
            )
        }),
    );
}

#[test]
fn assignment_to_non_assignable_ctd() {
    run_test_actions(
        [
            "(()=>{})() -= 5",
            "(()=>{})() *= 5",
            "(()=>{})() /= 5",
            "(()=>{})() %= 5",
            "(()=>{})() &= 5",
            "(()=>{})() ^= 5",
            "(()=>{})() |= 5",
            "(()=>{})() += 5",
            "(()=>{})() = 5",
        ]
        .into_iter()
        .map(|src| {
            TestAction::assert_native_error(
                src,
                JsNativeErrorKind::Syntax,
                "Invalid left-hand side in assignment at line 1, col 12",
            )
        }),
    );
}

#[test]
fn multicharacter_assignment_to_non_assignable() {
    // Relates to the behaviour described at
    // https://tc39.es/ecma262/#sec-assignment-operators-static-semantics-early-errors
    run_test_actions(["3 **= 5", "3 <<= 5", "3 >>= 5"].into_iter().map(|src| {
        TestAction::assert_native_error(
            src,
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 3",
        )
    }));
}

#[test]
fn multicharacter_assignment_to_non_assignable_ctd() {
    run_test_actions(
        ["(()=>{})() **= 5", "(()=>{})() <<= 5", "(()=>{})() >>= 5"]
            .into_iter()
            .map(|src| {
                TestAction::assert_native_error(
                    src,
                    JsNativeErrorKind::Syntax,
                    "Invalid left-hand side in assignment at line 1, col 12",
                )
            }),
    );
}

#[test]
fn multicharacter_bitwise_assignment_to_non_assignable() {
    run_test_actions(
        ["3 >>>= 5", "3 &&= 5", "3 ||= 5", "3 ??= 5"]
            .into_iter()
            .map(|src| {
                TestAction::assert_native_error(
                    src,
                    JsNativeErrorKind::Syntax,
                    "Invalid left-hand side in assignment at line 1, col 3",
                )
            }),
    );
}

#[test]
fn multicharacter_bitwise_assignment_to_non_assignable_ctd() {
    run_test_actions(
        [
            "(()=>{})() >>>= 5",
            "(()=>{})() &&= 5",
            "(()=>{})() ||= 5",
            "(()=>{})() ??= 5",
        ]
        .into_iter()
        .map(|src| {
            TestAction::assert_native_error(
                src,
                JsNativeErrorKind::Syntax,
                "Invalid left-hand side in assignment at line 1, col 12",
            )
        }),
    );
}

#[test]
fn assign_to_array_decl() {
    run_test_actions([
        TestAction::assert_native_error(
            "[1] = [2]",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 5",
        ),
        TestAction::assert_native_error(
            "[3, 5] = [7, 8]",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 8",
        ),
        TestAction::assert_native_error(
            "[6, 8] = [2]",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 8",
        ),
        TestAction::assert_native_error(
            "[6] = [2, 9]",
            JsNativeErrorKind::Syntax,
            "Invalid left-hand side in assignment at line 1, col 5",
        ),
    ]);
}

#[test]
fn assign_to_object_decl() {
    run_test_actions([TestAction::assert_native_error(
        "{a: 3} = {a: 5};",
        JsNativeErrorKind::Syntax,
        "unexpected token '=', primary expression at line 1, col 8",
    )]);
}

#[test]
fn assignmentoperator_lhs_not_defined() {
    run_test_actions([TestAction::assert_native_error(
        "a += 5",
        JsNativeErrorKind::Reference,
        "a is not defined",
    )]);
}

#[test]
fn assignmentoperator_rhs_throws_error() {
    run_test_actions([TestAction::assert_native_error(
        "let a; a += b",
        JsNativeErrorKind::Reference,
        "b is not defined",
    )]);
}

#[test]
fn instanceofoperator_rhs_not_object() {
    run_test_actions([TestAction::assert_native_error(
        "let s = new String(); s instanceof 1",
        JsNativeErrorKind::Type,
        "right-hand side of 'instanceof' should be an object, got `number`",
    )]);
}

#[test]
fn instanceofoperator_rhs_not_callable() {
    run_test_actions([TestAction::assert_native_error(
        "let s = new String(); s instanceof {}",
        JsNativeErrorKind::Type,
        "right-hand side of 'instanceof' is not callable",
    )]);
}

#[test]
fn logical_nullish_assignment() {
    run_test_actions([
        TestAction::assert_eq("{ let a = undefined; a ??= 10; a }", 10),
        TestAction::assert_eq("{ let a = 20; a ??= 10; a }", 20),
    ]);
}

#[test]
fn logical_assignment() {
    run_test_actions([
        TestAction::assert("{ let a = false; a &&= 10; !a }"),
        TestAction::assert_eq("{ let a = 20; a &&= 10; a }", 10),
        TestAction::assert_eq("{ let a = null; a ||= 10; a }", 10),
        TestAction::assert_eq("{ let a = 20; a ||= 10; a }", 20),
    ]);
}

#[test]
fn conditional_op() {
    run_test_actions([TestAction::assert_eq("1 === 2 ? 'a' : 'b'", js_str!("b"))]);
}

#[test]
fn delete_variable_in_strict() {
    // Checks as per https://tc39.es/ecma262/#sec-delete-operator-static-semantics-early-errors
    // that delete on a variable name is an error in strict mode code.
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            'use strict';
            let x = 10;
            delete x;
        "#},
        JsNativeErrorKind::Syntax,
        "cannot delete variables in strict mode at line 3, col 1",
    )]);
}

#[test]
fn delete_non_configurable() {
    run_test_actions([TestAction::assert_native_error(
        "'use strict'; delete Boolean.prototype",
        JsNativeErrorKind::Type,
        "Cannot delete property",
    )]);
}

#[test]
fn delete_non_configurable_in_function() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            function t() {
                'use strict';
                delete Boolean.prototype;
            }
            t()
        "#},
        JsNativeErrorKind::Type,
        "Cannot delete property",
    )]);
}

#[test]
fn delete_after_strict_function() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            function t() {
                'use strict';
            }
            t()
            delete Boolean.prototype;
        "#},
        false,
    )]);
}

#[test]
fn delete_in_function_global_strict() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            'use strict'
            function a(){
                delete Boolean.prototype;
            }
            a();
        "#},
        JsNativeErrorKind::Type,
        "Cannot delete property",
    )]);
}

#[test]
fn delete_in_function_in_strict_function() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            function a(){
                return delete Boolean.prototype;
            }
            function b(){
                'use strict';
                return a();
            }
            b();
        "#},
        false,
    )]);
}

#[test]
fn delete_in_strict_function_returned() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            function a() {
                'use strict';
                return function () {
                    delete Boolean.prototype;
                }
            }
            a()();
        "#},
        JsNativeErrorKind::Type,
        "Cannot delete property",
    )]);
}

#[test]
fn ops_at_the_end() {
    let msg = "abrupt end";

    let mut actions = vec![TestAction::assert_eq("var a, b=3; a = b ++", 3)];

    let abrupt_op_sources = [
        // there was a bug with different behavior with and without space at the end;
        // so few lines are almost the same except for ending space
        "var a, b=3; a = b **",
        "var a, b=3; a = b ** ",
        "var a, b=3; a = b *",
        "var a, b=3; a = b * ",
        "var a, b=3; a /= b *",
        "var a, b=3; a /= b * ",
        "var a, b=3; a = b /",
        "var a, b=3; a = b / ",
        "var a, b=3; a = b +",
        "var a, b=3; a = b -",
        "var a, b=3; a = b ||",
        "var a, b=3; a = b || ",
        "var a, b=3; a = b ==",
        "var a, b=3; a = b ===",
    ];

    for source in abrupt_op_sources {
        actions.push(TestAction::assert_native_error(
            source,
            JsNativeErrorKind::Syntax,
            msg,
        ));
    }

    actions.push(TestAction::assert_eq("var a, b=3; a = b --", 3));

    run_test_actions(actions);
}

#[test]
fn regex_slash_eq() {
    run_test_actions([
        TestAction::assert_eq("+/=/", JsValue::nan()),
        TestAction::assert_eq("var a = 5; /=/; a", 5),
        TestAction::assert_eq("x = () => /=/;\n\"a=b\".match(x())[0]", js_str!("=")),
    ]);
}

mod in_operator {
    use super::*;

    #[test]
    fn property_in_object() {
        run_test_actions([TestAction::assert("'a' in {a: 'x'}")]);
    }

    #[test]
    fn property_in_property_chain() {
        run_test_actions([TestAction::assert("'toString' in {}")]);
    }

    #[test]
    fn property_not_in_object() {
        run_test_actions([TestAction::assert("!('b' in {a: 'a'})")]);
    }

    #[test]
    fn number_in_array() {
        // Note: this is valid because the LHS is converted to a prop key with ToPropertyKey
        // and arrays are just fancy objects like {'0': 'a'}
        run_test_actions([TestAction::assert("0 in ['a']")]);
    }

    #[test]
    fn symbol_in_object() {
        run_test_actions([TestAction::assert(indoc! {r#"
                var sym = Symbol('hi');
                sym in { [sym]: 'hello' }
            "#})]);
    }

    #[test]
    fn should_type_error_when_rhs_not_object() {
        run_test_actions([TestAction::assert_native_error(
            "'fail' in undefined",
            JsNativeErrorKind::Type,
            "right-hand side of 'in' should be an object, got `undefined`",
        )]);
    }
}

/// `NaN` comparison, both via numeric literals (fast path) and
/// via `Number` object properties (slow path through `abstract_relation`).
///
#[test]
fn nan_comparisons() {
    run_test_actions([
        TestAction::assert("!(NaN == NaN)"),
        TestAction::assert("NaN != NaN"),
        TestAction::assert("!(NaN === NaN)"),
        TestAction::assert("NaN !== NaN"),
        TestAction::assert("!(NaN < 1)"),
        TestAction::assert("!(NaN > 1)"),
        TestAction::assert("!(NaN <= 1)"),
        TestAction::assert("!(NaN >= 1)"),
        TestAction::assert("!(1 < NaN)"),
        TestAction::assert("!(1 > NaN)"),
        TestAction::assert("!(1 <= NaN)"),
        TestAction::assert("!(1 >= NaN)"),
        TestAction::assert("!(NaN < NaN)"),
        TestAction::assert("!(NaN > NaN)"),
        TestAction::assert("!(NaN <= NaN)"),
        TestAction::assert("!(NaN >= NaN)"),
        TestAction::assert("!(NaN < Infinity)"),
        TestAction::assert("!(NaN > -Infinity)"),
        TestAction::assert("!(NaN < -Infinity)"),
        TestAction::assert("!(NaN > Infinity)"),
        TestAction::assert("!(new Number(NaN) < 1)"),
        TestAction::assert("!(new Number(NaN) > 1)"),
        TestAction::assert("!(new Number(NaN) <= 1)"),
        TestAction::assert("!(new Number(NaN) >= 1)"),
        TestAction::assert("!(1 < new Number(NaN))"),
        TestAction::assert("!(1 > new Number(NaN))"),
        TestAction::assert("!(1 <= new Number(NaN))"),
        TestAction::assert("!(1 >= new Number(NaN))"),
        TestAction::assert("Number.isNaN(NaN)"),
        TestAction::assert("Number.isNaN(0/0)"),
        TestAction::assert("!Number.isNaN(undefined)"),
        TestAction::assert("!Number.isNaN('NaN')"),
    ]);
}

#[test]
fn bigint_mixed_type_operations() {
    const MIXED_MSG: &str = "cannot mix BigInt and other types, use explicit conversions";
    run_test_actions([
        TestAction::assert_native_error("1n + 1", JsNativeErrorKind::Type, MIXED_MSG),
        TestAction::assert_native_error("1n - 1", JsNativeErrorKind::Type, MIXED_MSG),
        TestAction::assert_native_error("1n * 2", JsNativeErrorKind::Type, MIXED_MSG),
        TestAction::assert_native_error("4n / 2", JsNativeErrorKind::Type, MIXED_MSG),
        TestAction::assert_native_error("5n % 2", JsNativeErrorKind::Type, MIXED_MSG),
        TestAction::assert_native_error("2n ** 3", JsNativeErrorKind::Type, MIXED_MSG),
        TestAction::assert_native_error("1 + 1n", JsNativeErrorKind::Type, MIXED_MSG),
        TestAction::assert_eq("'hello' + 1n", js_str!("hello1")),
        TestAction::assert_eq("1n + 'hello'", js_str!("1hello")),
        TestAction::assert_native_error(
            indoc! {r#"
                let numObj = { valueOf() { return 42; }, toString() { return "42"; } };
                1n + numObj
            "#},
            JsNativeErrorKind::Type,
            MIXED_MSG,
        ),
        TestAction::assert("1n < 2"),
        TestAction::assert("!(1n > 2)"),
        TestAction::assert("1n <= 1"),
        TestAction::assert("2n >= 2"),
        TestAction::assert("(2n + 3n) === 5n"),
        TestAction::assert("(10n - 4n) === 6n"),
        TestAction::assert("(3n * 4n) === 12n"),
        TestAction::assert("(10n / 3n) === 3n"),
        TestAction::assert("(10n % 3n) === 1n"),
        TestAction::assert("(2n ** 10n) === 1024n"),
    ]);
}

#[test]
fn ushr_bigint_type_error() {
    run_test_actions([
        TestAction::assert_native_error(
            "1n >>> 0n",
            JsNativeErrorKind::Type,
            "BigInts have no unsigned right shift, use >> instead",
        ),
        TestAction::assert_native_error(
            "255n >>> 4n",
            JsNativeErrorKind::Type,
            "BigInts have no unsigned right shift, use >> instead",
        ),
        TestAction::assert("(8n >> 2n) === 2n"),
        TestAction::assert("(-1n >> 63n) === -1n"),
        TestAction::assert("(1n << 4n) === 16n"),
    ]);
}

#[test]
fn instanceof_custom_has_instance() {
    run_test_actions([
        TestAction::assert(indoc! {r#"
            class AlwaysTrue {
                static [Symbol.hasInstance](_instance) {
                    return true;
                }
            }
            ({} instanceof AlwaysTrue)
        "#}),
        TestAction::assert(indoc! {r#"
            class AlwaysFalse {
                static [Symbol.hasInstance](_instance) {
                    return false;
                }
            }
            let obj = new AlwaysFalse();
            !(obj instanceof AlwaysFalse)
        "#}),
        TestAction::assert(indoc! {r#"
            const EvenNumber = {
                [Symbol.hasInstance](value) {
                    return typeof value === 'number' && value % 2 === 0;
                }
            };
            (2 instanceof EvenNumber) && !(3 instanceof EvenNumber)
        "#}),
        TestAction::assert_native_error(
            indoc! {r#"
                class Throws {
                    static [Symbol.hasInstance](_instance) {
                        throw new TypeError("hasInstance threw");
                    }
                }
                ({} instanceof Throws)
            "#},
            JsNativeErrorKind::Type,
            "hasInstance threw",
        ),
        TestAction::assert_native_error(
            "let s = new String(); s instanceof {}",
            JsNativeErrorKind::Type,
            "right-hand side of 'instanceof' is not callable",
        ),
        TestAction::assert_native_error(
            "42 instanceof 'not-a-constructor'",
            JsNativeErrorKind::Type,
            "right-hand side of 'instanceof' should be an object, got `string`",
        ),
        TestAction::assert(indoc! {r#"
            const Truthy = {
                [Symbol.hasInstance]() { return 1; }
            };
            ({} instanceof Truthy)
        "#}),
        TestAction::assert(indoc! {r#"
            const Falsy = {
                [Symbol.hasInstance]() { return 0; }
            };
            !({} instanceof Falsy)
        "#}),
    ]);
}
