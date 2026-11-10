use boa_macros::js_str;
use indoc::indoc;
mod loops;

use crate::{JsNativeErrorKind, TestAction, run_test_actions};

#[test]
fn test_invalid_break() {
    run_test_actions([TestAction::assert_native_error(
        "break;",
        JsNativeErrorKind::Syntax,
        "illegal break statement at line 1, col 1",
    )]);
}

#[test]
fn test_invalid_continue_target() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            while (false) {
                continue nonexistent;
            }
        "#},
        JsNativeErrorKind::Syntax,
        "undefined continue target: nonexistent at line 1, col 1",
    )]);
}

#[test]
fn test_invalid_continue() {
    run_test_actions([TestAction::assert_native_error(
        "continue;",
        JsNativeErrorKind::Syntax,
        "illegal continue statement at line 1, col 1",
    )]);
}

#[test]
fn test_labelled_block() {
    run_test_actions([TestAction::assert(indoc! {r#"
            let result = true;
            {
                let x = 2;
                L: {
                    let x = 3;
                    result &&= (x === 3);
                    break L;
                    result &&= (false);
                }
                result &&= (x === 2);
            }
            result;
        "#})]);
}

#[test]
fn simple_try() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            try {
                a = 20;
            } catch {
                a = 30;
            }

            a;
        "#},
        20,
    )]);
}

#[test]
fn finally() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            try {
                a = 20;
            } finally {
                a = 30;
            }

            a;
        "#},
        30,
    )]);
}

#[test]
fn catch_finally() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            try {
                a = 20;
            } catch {
                a = 40;
            } finally {
                a = 30;
            }

            a;
        "#},
        30,
    )]);
}

#[test]
fn catch() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            try {
                throw "error";
            } catch {
                a = 20;
            }

            a;
        "#},
        20,
    )]);
}

#[test]
fn catch_binding() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            try {
                throw 20;
            } catch(err) {
                a = err;
            }

            a;
        "#},
        20,
    )]);
}

#[test]
fn catch_binding_pattern_object() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            try {
                throw {
                    n: 30,
                };
            } catch ({ n }) {
                a = n;
            }

            a;
        "#},
        30,
    )]);
}

#[test]
fn catch_binding_pattern_array() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            try {
                throw [20, 30];
            } catch ([, n]) {
                a = n;
            }

            a;
        "#},
        30,
    )]);
}

#[test]
fn catch_binding_finally() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            try {
                throw 20;
            } catch(err) {
                a = err;
            } finally {
                a = 30;
            }

            a;
        "#},
        30,
    )]);
}

#[test]
fn finally_fallthrough_with_untaken_return() {
    run_test_actions([
        TestAction::assert_eq(
            indoc! {r#"
                function g(x) {
                    try {
                        if (x) return -1;
                    } catch (e) {} finally {}
                    return 42;
                }
                g(0);
            "#},
            42,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                function g(x) {
                    try {
                        if (x) return -1;
                    } catch (e) {} finally {}
                    return 42;
                }
                g(1);
            "#},
            -1,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                function h(x) {
                    try {
                        if (x) return -1;
                    } finally {}
                    return 42;
                }
                h(0);
            "#},
            42,
        ),
    ]);
}

#[test]
fn finally_with_loop_break() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            try {
              30;
            }
            catch {
            } finally {
              while(true) {
                break;
              }
            }
        "#},
        30,
    )]);
}

#[test]
fn single_case_switch() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            switch (a) {
                case 10:
                    a = 20;
                    break;
            }

            a;
        "#},
        20,
    )]);
}

#[test]
fn no_cases_switch() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            switch (a) {
            }

            a;
        "#},
        10,
    )]);
}

#[test]
fn no_true_case_switch() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            switch (a) {
                case 5:
                    a = 15;
                    break;
            }

            a;
        "#},
        10,
    )]);
}

#[test]
fn two_case_switch() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            switch (a) {
                case 5:
                    a = 15;
                    break;
                case 10:
                    a = 20;
                    break;
            }

            a;
        "#},
        20,
    )]);
}

#[test]
fn two_case_no_break_switch() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            let b = 10;

            switch (a) {
                case 10:
                    a = 150;
                case 20:
                    b = 150;
                    break;
            }

            a + b;
        "#},
        300,
    )]);
}

#[test]
fn three_case_partial_fallthrough() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            let b = 10;

            switch (a) {
                case 10:
                    a = 150;
                case 20:
                    b = 150;
                    break;
                case 15:
                    b = 1000;
                    break;
            }

            a + b;
        "#},
        300,
    )]);
}

#[test]
fn default_taken_switch() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;

            switch (a) {
                case 5:
                    a = 150;
                    break;
                default:
                    a = 70;
            }

            a;
        "#},
        70,
    )]);
}

#[test]
fn default_not_taken_switch() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 5;

            switch (a) {
                case 5:
                    a = 150;
                    break;
                default:
                    a = 70;
            }

            a;
        "#},
        150,
    )]);
}

#[test]
fn string_switch() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = "hello";

            switch (a) {
                case "hello":
                    a = "world";
                    break;
                default:
                    a = "hi";
            }

            a;
        "#},
        js_str!("world"),
    )]);
}

#[test]
fn bigger_switch_example() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                function f(a) {
                    let b;

                    switch (a) {
                        case 0:
                            b = "Mon";
                            break;
                        case 1:
                            b = "Tue";
                            break;
                        case 2:
                            b = "Wed";
                            break;
                        case 3:
                            b = "Thurs";
                            break;
                        case 4:
                            b = "Fri";
                            break;
                        case 5:
                            b = "Sat";
                            break;
                        case 6:
                            b = "Sun";
                            break;
                    }
                    return b;
                }
            "#}),
        TestAction::assert_eq("f(0)", js_str!("Mon")),
        TestAction::assert_eq("f(1)", js_str!("Tue")),
        TestAction::assert_eq("f(2)", js_str!("Wed")),
        TestAction::assert_eq("f(3)", js_str!("Thurs")),
        TestAction::assert_eq("f(4)", js_str!("Fri")),
        TestAction::assert_eq("f(5)", js_str!("Sat")),
        TestAction::assert_eq("f(6)", js_str!("Sun")),
    ]);
}

#[test]
fn break_labelled_if_statement() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let result = "";
            bar: if(true) {
                result = "foo";
                break bar;
                result = 'this will not be executed';
            }
            result
        "#},
        js_str!("foo"),
    )]);
}

#[test]
fn break_labelled_try_statement() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let result = ""
            one: try {
                result = "foo";
                break one;
                result = "did not break"
            } catch (err) {
                console.log(err)
            }
            result
        "#},
        js_str!("foo"),
    )]);
}
