use crate::{TestAction, run_test_actions};
use indoc::indoc;

/// Test the correct type is returned from call and construct
#[test]
fn construct_and_call() {
    run_test_actions([
        TestAction::assert_with_op("new Boolean(1)", |val, _| val.is_object()),
        TestAction::assert_with_op("Boolean(0)", |val, _| val.is_boolean()),
    ]);
}

#[test]
fn constructor_gives_true_instance() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var trueVal = new Boolean(true);
                var trueNum = new Boolean(1);
                var trueString = new Boolean("true");
                var trueBool = new Boolean(trueVal);
            "#}),
        // Values should all be objects
        TestAction::assert_with_op("trueVal", |val, _| val.is_object()),
        TestAction::assert_with_op("trueNum", |val, _| val.is_object()),
        TestAction::assert_with_op("trueString", |val, _| val.is_object()),
        TestAction::assert_with_op("trueBool", |val, _| val.is_object()),
        // Values should all be truthy
        TestAction::assert("trueVal.valueOf()"),
        TestAction::assert("trueNum.valueOf()"),
        TestAction::assert("trueString.valueOf()"),
        TestAction::assert("trueBool.valueOf()"),
    ]);
}

#[test]
fn instances_have_correct_proto_set() {
    run_test_actions([TestAction::assert(
        "Object.getPrototypeOf(new Boolean(true)) === Boolean.prototype",
    )]);
}
