use crate::{TestAction, run_test_actions};
use boa_macros::js_str;
use indoc::indoc;

#[test]
fn error_to_string() {
    run_test_actions([
        TestAction::assert_eq("(new Error('1')).toString()", js_str!("Error: 1")),
        TestAction::assert_eq("(new RangeError('2')).toString()", js_str!("RangeError: 2")),
        TestAction::assert_eq(
            "(new ReferenceError('3')).toString()",
            js_str!("ReferenceError: 3"),
        ),
        TestAction::assert_eq(
            "(new SyntaxError('4')).toString()",
            js_str!("SyntaxError: 4"),
        ),
        TestAction::assert_eq("(new TypeError('5')).toString()", js_str!("TypeError: 5")),
        TestAction::assert_eq("(new EvalError('6')).toString()", js_str!("EvalError: 6")),
        TestAction::assert_eq("(new URIError('7')).toString()", js_str!("URIError: 7")),
        // no message
        TestAction::assert_eq("(new Error()).toString()", js_str!("Error")),
        TestAction::assert_eq("(new RangeError()).toString()", js_str!("RangeError")),
        TestAction::assert_eq(
            "(new ReferenceError()).toString()",
            js_str!("ReferenceError"),
        ),
        TestAction::assert_eq("(new SyntaxError()).toString()", js_str!("SyntaxError")),
        TestAction::assert_eq("(new TypeError()).toString()", js_str!("TypeError")),
        TestAction::assert_eq("(new EvalError()).toString()", js_str!("EvalError")),
        TestAction::assert_eq("(new URIError()).toString()", js_str!("URIError")),
        // no name
        TestAction::assert_eq(
            indoc! {r#"
                let message = new Error('message');
                message.name = '';
                message.toString()
            "#},
            js_str!("message"),
        ),
    ]);
}

#[test]
fn error_names() {
    run_test_actions([
        TestAction::assert_eq("Error.name", js_str!("Error")),
        TestAction::assert_eq("EvalError.name", js_str!("EvalError")),
        TestAction::assert_eq("RangeError.name", js_str!("RangeError")),
        TestAction::assert_eq("ReferenceError.name", js_str!("ReferenceError")),
        TestAction::assert_eq("SyntaxError.name", js_str!("SyntaxError")),
        TestAction::assert_eq("URIError.name", js_str!("URIError")),
        TestAction::assert_eq("TypeError.name", js_str!("TypeError")),
        TestAction::assert_eq("AggregateError.name", js_str!("AggregateError")),
    ]);
}

#[test]
fn error_lengths() {
    run_test_actions([
        TestAction::assert_eq("Error.length", 1),
        TestAction::assert_eq("EvalError.length", 1),
        TestAction::assert_eq("RangeError.length", 1),
        TestAction::assert_eq("ReferenceError.length", 1),
        TestAction::assert_eq("SyntaxError.length", 1),
        TestAction::assert_eq("URIError.length", 1),
        TestAction::assert_eq("TypeError.length", 1),
        TestAction::assert_eq("AggregateError.length", 2),
    ]);
}
