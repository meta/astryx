use indoc::indoc;

use crate::{TestAction, run_test_actions};

#[test]
#[allow(clippy::redundant_closure_for_method_calls)]
fn issue_2658() {
    run_test_actions([
        TestAction::run(indoc! {
            r#"
                    let result1;
                    let result2;
                    async function* agf(a) {
                        for await (m of a) {
                            yield m;
                        }
                    }
                    iterTwo = {
                        [Symbol.asyncIterator]() {
                            return this;
                        },
                        next() {
                            return {
                                value: 5,
                                done: false,
                            };
                        }
                    };
                    const genTwo = agf(iterTwo);
                    genTwo.next().then(v => { result1 = v; });
                    genTwo.next().then(v => { result2 = v; });
                "#
        }),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert("!result1.done"),
        TestAction::assert_eq("result1.value", 5),
        TestAction::assert("!result2.done"),
        TestAction::assert_eq("result2.value", 5),
    ]);
}
