use indoc::indoc;

use crate::{TestAction, run_test_actions};

#[test]
fn iterator_close_in_continue_before_jobs() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
            var actual = [];

            var iter = {
                [Symbol.iterator]() {
                    return this;
                },
                next() {
                    actual.push("call next");
                    return {
                        done: false,
                    };
                },
                get return() {
                    actual.push("get return");
                    return function () {
                        actual.push("return call");
                        return {
                            done: true
                        }
                    }
                }
            };

            Promise.resolve(0)
                .then(() => actual.push("tick 1"))
                .then(() => actual.push("tick 2"));

            void async function f() {
                actual.push("async fn start");
                let count = 0;
                loop: while (count === 0) {
                    count++;
                    for (_ of iter) {
                        continue loop;
                    }
                }
                actual.push("async fn end");
            }();
        "#}),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert(indoc! {r#"
            arrayEquals(
                actual,
                [
                    "async fn start",
                    "call next",
                    "get return",
                    "return call",
                    "async fn end",
                    "tick 1",
                    "tick 2",
                ]
            )
            "#}),
    ]);
}

#[test]
fn async_iterator_close_in_continue_is_awaited() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
            var actual = [];

            var asyncIter = {
                [Symbol.asyncIterator]() {
                    return this;
                },
                next() {
                    actual.push("async call next");
                    return {
                        done: false,
                    };
                },
                get return() {
                    actual.push("get async return");
                    return function () {
                        actual.push("async return call");
                        return {
                            done: true
                        };
                    }
                }
            };

            Promise.resolve(0)
                .then(() => actual.push("tick 1"))
                .then(() => actual.push("tick 2"))
                .then(() => actual.push("tick 3"));

            void async function f() {
                actual.push("async fn start");
                let count = 0;
                loop: while (count === 0) {
                    count++;
                    for await (__ of asyncIter) {
                        continue loop;
                    }
                }
                actual.push("async fn end");
            }();
        "#}),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert(indoc! {r#"
            arrayEquals(
                actual,
                [
                    "async fn start",
                    "async call next",
                    "tick 1",
                    "get async return",
                    "async return call",
                    "tick 2",
                    "async fn end",
                    "tick 3"
                ]
            )
        "#}),
    ]);
}

#[test]
fn mixed_iterators_close_in_continue() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
            var actual = [];

            var iter = {
                [Symbol.iterator]() {
                    return this;
                },
                next() {
                    actual.push("call next");
                    return {
                        done: false,
                    };
                },
                get return() {
                    actual.push("get return");
                    return function () {
                        actual.push("return call");
                        return {
                            done: true
                        }
                    }
                }
            };

            var asyncIter = {
                [Symbol.asyncIterator]() {
                    return this;
                },
                next() {
                    actual.push("async call next");
                    return {
                        done: false,
                    };
                },
                get return() {
                    actual.push("get async return");
                    return function () {
                        actual.push("async return call");
                        return {
                            done: true
                        };
                    }
                }
            };

            Promise.resolve(0)
                .then(() => actual.push("tick 1"))
                .then(() => actual.push("tick 2"))
                .then(() => actual.push("tick 3"));

            void async function f() {
                actual.push("async fn start");
                let count = 0;
                loop: while (count === 0) {
                    count++;
                    for (_ of iter) {
                        for await (__ of asyncIter) {
                            continue loop;
                        }
                    }
                }
                actual.push("async fn end");
            }();
        "#}),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert(indoc! {r#"
            arrayEquals(
                actual,
                [
                    "async fn start",
                    "call next",
                    "async call next",
                    "tick 1",
                    "get async return",
                    "async return call",
                    "tick 2",
                    "get return",
                    "return call",
                    "async fn end",
                    "tick 3",
                ]
            )
        "#}),
    ]);
}
