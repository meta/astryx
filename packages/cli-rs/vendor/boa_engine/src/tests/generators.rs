use crate::{JsValue, TestAction, run_test_actions};
use boa_macros::js_str;
use indoc::indoc;

#[test]
fn basic_yield() {
    // Checks that yield produces the correct value with done: false,
    // and that exhausting the generator returns undefined with done: true.
    run_test_actions([
        TestAction::run(indoc! {r#"
            function* gen() {
                yield 1;
                yield 2;
                yield 3;
            }
            const g = gen();
            let r1 = g.next();
            let r2 = g.next();
            let r3 = g.next();
            let r4 = g.next();
        "#}),
        TestAction::assert_eq("r1.value", 1),
        TestAction::assert_eq("r1.done", false),
        TestAction::assert_eq("r2.value", 2),
        TestAction::assert_eq("r2.done", false),
        TestAction::assert_eq("r3.value", 3),
        TestAction::assert_eq("r3.done", false),
        TestAction::assert_eq("r4.value", JsValue::undefined()),
        TestAction::assert_eq("r4.done", true),
    ]);
}

#[test]
fn explicit_return() {
    // Checks that `return <value>` inside a generator produces {value, done: true}
    // and that subsequent .next() calls return {undefined, true}.
    run_test_actions([
        TestAction::run(indoc! {r#"
            function* gen() {
                yield 1;
                return 42;
            }
            const g = gen();
            let r1 = g.next();
            let r2 = g.next();
            let r3 = g.next();
        "#}),
        TestAction::assert_eq("r1.value", 1),
        TestAction::assert_eq("r1.done", false),
        TestAction::assert_eq("r2.value", 42),
        TestAction::assert_eq("r2.done", true),
        TestAction::assert_eq("r3.value", JsValue::undefined()),
        TestAction::assert_eq("r3.done", true),
    ]);
}

#[test]
fn next_with_value() {
    // Checks that the argument to .next(value) becomes the result of the
    // yield expression inside the generator.
    run_test_actions([
        TestAction::run(indoc! {r#"
            function* gen() {
                let a = yield 1;
                let b = yield a + 10;
                return a + b;
            }
            const g = gen();
            let r1 = g.next();
            let r2 = g.next(5);
            let r3 = g.next(20);
        "#}),
        TestAction::assert_eq("r1.value", 1),
        TestAction::assert_eq("r1.done", false),
        TestAction::assert_eq("r2.value", 15),
        TestAction::assert_eq("r2.done", false),
        TestAction::assert_eq("r3.value", 25),
        TestAction::assert_eq("r3.done", true),
    ]);
}

#[test]
fn return_method() {
    // Checks that calling .return(value) terminates the generator early
    // and produces {value, done: true}.
    run_test_actions([
        TestAction::run(indoc! {r#"
            function* gen() {
                yield 1;
                yield 2;
                yield 3;
            }
            const g = gen();
            let r1 = g.next();
            let r2 = g.return(99);
            let r3 = g.next();
        "#}),
        TestAction::assert_eq("r1.value", 1),
        TestAction::assert_eq("r1.done", false),
        TestAction::assert_eq("r2.value", 99),
        TestAction::assert_eq("r2.done", true),
        TestAction::assert_eq("r3.value", JsValue::undefined()),
        TestAction::assert_eq("r3.done", true),
    ]);
}

#[test]
fn throw_method_uncaught() {
    // Checks that calling .throw(error) propagates the error to the caller
    // when the generator doesn't catch it, and marks the generator as completed.
    run_test_actions([
        TestAction::run(indoc! {r#"
            function* gen() {
                yield 1;
                yield 2;
            }
            const g = gen();
            let r1 = g.next();
            let threw = false;
            try {
                g.throw(new Error("boom"));
            } catch (e) {
                threw = true;
                var errMsg = e.message;
            }
            let r2 = g.next();
        "#}),
        TestAction::assert_eq("r1.value", 1),
        TestAction::assert_eq("r1.done", false),
        TestAction::assert_eq("threw", true),
        TestAction::assert_eq("errMsg", js_str!("boom")),
        TestAction::assert_eq("r2.value", JsValue::undefined()),
        TestAction::assert_eq("r2.done", true),
    ]);
}

#[test]
fn throw_method_caught() {
    // Checks that .throw(error) can be caught inside the generator via try/catch,
    // allowing the generator to continue yielding.
    run_test_actions([
        TestAction::run(indoc! {r#"
            function* gen() {
                let result;
                try {
                    result = yield 1;
                } catch (e) {
                    result = "caught: " + e.message;
                }
                yield result;
                return "done";
            }
            const g = gen();
            let r1 = g.next();
            let r2 = g.throw(new Error("oops"));
            let r3 = g.next();
        "#}),
        TestAction::assert_eq("r1.value", 1),
        TestAction::assert_eq("r1.done", false),
        TestAction::assert_eq("r2.value", js_str!("caught: oops")),
        TestAction::assert_eq("r2.done", false),
        TestAction::assert_eq("r3.value", js_str!("done")),
        TestAction::assert_eq("r3.done", true),
    ]);
}

#[test]
fn exhausted_generator() {
    // Checks that calling .next() on an already-completed generator
    // always returns {value: undefined, done: true}.
    run_test_actions([
        TestAction::run(indoc! {r#"
            function* gen() {
                yield 1;
            }
            const g = gen();
            g.next();
            g.next();
            let r1 = g.next();
            let r2 = g.next();
            let r3 = g.next();
        "#}),
        TestAction::assert_eq("r1.value", JsValue::undefined()),
        TestAction::assert_eq("r1.done", true),
        TestAction::assert_eq("r2.value", JsValue::undefined()),
        TestAction::assert_eq("r2.done", true),
        TestAction::assert_eq("r3.value", JsValue::undefined()),
        TestAction::assert_eq("r3.done", true),
    ]);
}

#[test]
fn return_before_start() {
    // Checks that calling .return() on a generator that hasn't started
    // completes it immediately without executing any body code.
    run_test_actions([
        TestAction::run(indoc! {r#"
            let bodyRan = false;
            function* gen() {
                bodyRan = true;
                yield 1;
            }
            const g = gen();
            let r1 = g.return(42);
            let r2 = g.next();
        "#}),
        TestAction::assert_eq("bodyRan", false),
        TestAction::assert_eq("r1.value", 42),
        TestAction::assert_eq("r1.done", true),
        TestAction::assert_eq("r2.value", JsValue::undefined()),
        TestAction::assert_eq("r2.done", true),
    ]);
}

#[test]
fn throw_before_start() {
    // Checks that calling .throw() on a generator that hasn't started
    // completes it immediately and propagates the error without executing any body code.
    run_test_actions([
        TestAction::run(indoc! {r#"
            let bodyRan = false;
            function* gen() {
                bodyRan = true;
                yield 1;
            }
            const g = gen();
            let threw = false;
            try {
                g.throw(new Error("early"));
            } catch (e) {
                threw = true;
                var errMsg = e.message;
            }
            let r1 = g.next();
        "#}),
        TestAction::assert_eq("bodyRan", false),
        TestAction::assert_eq("threw", true),
        TestAction::assert_eq("errMsg", js_str!("early")),
        TestAction::assert_eq("r1.value", JsValue::undefined()),
        TestAction::assert_eq("r1.done", true),
    ]);
}
