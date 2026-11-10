use crate::{JsNativeErrorKind, TestAction, run_test_actions};

#[test]
fn property_bag_null_option_value() {
    run_test_actions([TestAction::assert_native_error(
        "Temporal.PlainDate.from({ year: 1976, month: 11, day: 18}, null)",
        JsNativeErrorKind::Type,
        "GetOptionsObject: provided options is not an object",
    )]);
}

#[test]
fn pd_null_option_value() {
    run_test_actions([TestAction::assert_native_error(
        "Temporal.PlainDate.from(new Temporal.PlainDate(1976, 11, 18), null)",
        JsNativeErrorKind::Type,
        "GetOptionsObject: provided options is not an object",
    )]);
}

#[test]
fn pdt_null_option_value() {
    run_test_actions([TestAction::assert_native_error(
        "Temporal.PlainDate.from(new Temporal.PlainDateTime(1976, 11, 18), null)",
        JsNativeErrorKind::Type,
        "GetOptionsObject: provided options is not an object",
    )]);
}

#[test]
fn zdt_null_option_value() {
    run_test_actions([TestAction::assert_native_error(
        "Temporal.PlainDate.from(new Temporal.ZonedDateTime(0n, 'UTC'), null)",
        JsNativeErrorKind::Type,
        "GetOptionsObject: provided options is not an object",
    )]);
}

#[test]
fn string_null_option_value() {
    run_test_actions([TestAction::assert_native_error(
        "Temporal.PlainDate.from('1976-11-18Z', null)",
        JsNativeErrorKind::Range,
        "RangeError: Unexpected character found after parsing was completed.",
    )]);
}
