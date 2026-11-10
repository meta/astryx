use boa_macros::js_str;

use crate::{JsValue, TestAction, run_test_actions};

// Temporal Object tests.

#[test]
fn temporal_object() {
    // Temporal Builtin tests.
    run_test_actions([
        TestAction::assert_eq(
            "Object.prototype.toString.call(Temporal)",
            js_str!("[object Temporal]"),
        ),
        TestAction::assert_eq("String(Temporal)", js_str!("[object Temporal]")),
        TestAction::assert_eq("Object.keys(Temporal).length === 0", true),
    ]);
}

#[test]
fn now_object() {
    // Now Builtin tests.
    run_test_actions([
        TestAction::assert_eq("Object.isExtensible(Temporal.Now)", true),
        TestAction::assert_eq(
            "Object.prototype.toString.call(Temporal.Now)",
            js_str!("[object Temporal.Now]"),
        ),
        TestAction::assert_eq(
            "Object.getPrototypeOf(Temporal.Now) === Object.prototype",
            true,
        ),
        TestAction::assert_eq("Temporal.Now.prototype", JsValue::undefined()),
    ]);
}

// Date Equations
