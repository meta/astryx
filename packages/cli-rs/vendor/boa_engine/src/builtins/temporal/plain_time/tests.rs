use indoc::indoc;

use crate::{JsNativeErrorKind, TestAction, run_test_actions};

#[test]
fn with_overflow_reject_throws_on_negative_components() {
    // Temporal Builtin tests.
    run_test_actions([
        TestAction::run(indoc! {"
            let plain = new Temporal.PlainTime();
            let options = {overflow: 'reject'};
        "}),
        TestAction::assert_native_error(
            "plain.with({hour: -1}, options)",
            JsNativeErrorKind::Range,
            "time value 'hour' not in 0..23: -1",
        ),
        TestAction::assert_native_error(
            "plain.with({minute: -1}, options)",
            JsNativeErrorKind::Range,
            "time value 'minute' not in 0..59: -1",
        ),
        TestAction::assert_native_error(
            "plain.with({second: -1}, options)",
            JsNativeErrorKind::Range,
            "time value 'second' not in 0..59: -1",
        ),
        TestAction::assert_native_error(
            "plain.with({millisecond: -1}, options)",
            JsNativeErrorKind::Range,
            "time value 'millisecond' not in 0..999: -1",
        ),
        TestAction::assert_native_error(
            "plain.with({microsecond: -1}, options)",
            JsNativeErrorKind::Range,
            "time value 'microsecond' not in 0..999: -1",
        ),
        TestAction::assert_native_error(
            "plain.with({nanosecond: -1}, options)",
            JsNativeErrorKind::Range,
            "time value 'nanosecond' not in 0..999: -1",
        ),
    ]);
}
