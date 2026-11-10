use crate::{TestAction, run_test_actions};
use indoc::indoc;

#[test]
fn promise() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                    let count = 0;
                    const promise = new Promise((resolve, reject) => {
                        count += 1;
                        resolve(undefined);
                    }).then((_) => (count += 1));
                    count += 1;
                "#}),
        TestAction::assert_eq("count", 2),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert_eq("count", 3),
    ]);
}

#[test]
fn promise_all_resolves_values() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            var values = [];
            var p = Promise.all([Promise.resolve(1), Promise.resolve(2)]);
            p.then(v => { values = v; });
        "#}),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert_eq("values.length", 2),
        TestAction::assert_eq("values[0]", 1),
        TestAction::assert_eq("values[1]", 2),
    ]);
}

#[test]
fn promise_all_rejects() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            var err = null;
            var p = Promise.all([Promise.resolve(1), Promise.reject(2)]);
            p.catch(e => { err = e; });
        "#}),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert_eq("err", 2),
    ]);
}

#[test]
fn promise_any_resolves_first_success() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            var val = null;
            var p = Promise.any([Promise.reject(1), Promise.resolve(2)]);
            p.then(v => { val = v; });
        "#}),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert_eq("val", 2),
    ]);
}

#[test]
fn promise_all_settled_resolves_results() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            var values = [];
            Promise.allSettled([
                Promise.resolve(1),
                Promise.reject(2)
            ]).then(results => {
                values = [
                    results[0].status,
                    results[0].value,
                    results[1].status,
                    results[1].reason
                ];
            });
        "#}),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert_eq("values[0]", crate::js_string!("fulfilled")),
        TestAction::assert_eq("values[1]", 1),
        TestAction::assert_eq("values[2]", crate::js_string!("rejected")),
        TestAction::assert_eq("values[3]", 2),
    ]);
}

#[test]
fn promise_race_resolves_first() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            var val = null;
            Promise.race([
                Promise.resolve(10),
                Promise.resolve(20)
            ]).then(v => { val = v; });
        "#}),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert_eq("val", 10),
    ]);
}
