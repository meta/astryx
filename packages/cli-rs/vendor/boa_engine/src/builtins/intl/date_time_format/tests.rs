use indoc::indoc;

use crate::{TestAction, run_test_actions};

// Intl.DateTimeFormat tests

#[cfg(feature = "intl_bundled")]
#[test]
fn dtf_basic() {
    run_test_actions([
        TestAction::run(indoc! {"
            // Setup date
            const date = new Date(Date.UTC(2020, 11, 20, 3, 23, 16, 738));

            let formatter = new Intl.DateTimeFormat('en-US');
            let result = formatter.format(date);
        "}),
        TestAction::assert_eq("result === '12/20/20'", true),
    ]);
    run_test_actions([
        TestAction::run(indoc! {"
            // Setup date
            const date = new Date(Date.UTC(2020, 11, 20, 3, 23, 16, 738));

            let formatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'full' });
            let result = formatter.format(date);
        "}),
        TestAction::assert_eq("result === 'Sunday, December 20, 2020'", true),
    ]);
    run_test_actions([
        TestAction::run(indoc! {"
            // Setup date
            const date = new Date(Date.UTC(2020, 11, 20, 3, 23, 16, 738));

            let formatter = new Intl.DateTimeFormat('en-GB');
            let result = formatter.format(date);
        "}),
        TestAction::assert_eq("result === '20/12/2020'", true),
    ]);
    run_test_actions([
        TestAction::run(indoc! {"
            // Setup date
            const date = new Date(Date.UTC(2020, 11, 20, 3, 23, 16, 738));

            let formatter = new Intl.DateTimeFormat('en-GB', {
                dateStyle: 'full',
                timeStyle: 'long',
            });
            let result = formatter.format(date);
        "}),
        TestAction::assert_eq("result === 'Sunday, 20 December 2020 at 03:23:16'", true),
    ]);
    run_test_actions([
        TestAction::run(indoc! {"
            // Setup date
            const date = new Date(Date.UTC(2020, 11, 20, 3, 23, 16, 738));

            let formatter = new Intl.DateTimeFormat('en-GB', {
                dateStyle: 'full',
                timeStyle: 'long',
                timeZone: 'Australia/Sydney',
            });
            let result = formatter.format(date);
        "}),
        TestAction::assert_eq("result === 'Sunday, 20 December 2020 at 14:23:16'", true),
    ]);
}

#[cfg(feature = "intl_bundled")]
#[test]
fn date_to_locale_string() {
    run_test_actions([
        TestAction::run(indoc! {"
            // Setup date
            const date = new Date(Date.UTC(2021, 3, 12, 6, 7));

            let result = date.toLocaleString('en-US', { dateStyle: 'short' });
        "}),
        TestAction::assert_eq("result === '4/12/21'", true),
    ]);
    run_test_actions([
        TestAction::run(indoc! {"
            // Setup date
            const date = new Date(Date.UTC(2021, 3, 12, 6, 7));

            let result = date.toLocaleString('en-US', { timeStyle: 'short' });
        "}),
        TestAction::assert_eq("result === '6:07\u{202f}AM'", true),
    ]);
}

#[cfg(feature = "intl_bundled")]
#[test]
fn dtf_ctor_observable_behavior() {
    run_test_actions([
        TestAction::run(indoc! {"
            const expected = [];

            const proxyConstructor = new Proxy(Intl.DateTimeFormat, {
              get(target, prop) {
                if (prop === 'prototype') {
                  expected.push('prototype-access');
                }
                return target[prop];
              }
            });

            try {
              new proxyConstructor('en', { timeZone: 'Invalid/Zone' });
            } catch (e) {
              expected.push('error-thrown');
            }
        "}),
        TestAction::assert_eq("expected.length === 2", true),
        TestAction::assert_eq("expected[0] === 'prototype-access'", true),
        TestAction::assert_eq("expected[1] === 'error-thrown'", true),
    ]);
}
