use crate::{TestAction, run_test_actions};

#[test]
fn pdt_year_of_week_basic() {
    run_test_actions([
        TestAction::run(
            "let pdt = new Temporal.PlainDateTime(1976, 11, 18, 15, 23, 30, 123, 456, 789, 'iso8601')",
        ),
        TestAction::assert_eq("pdt.yearOfWeek", 1976),
    ]);
}
