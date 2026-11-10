use crate::{
    Context, JsValue, TestAction, builtins::promise::PromiseState, object::JsPromise,
    run_test_actions,
};
use boa_macros::js_str;
use indoc::indoc;

#[track_caller]
fn assert_promise_iter_value(
    promise: &JsValue,
    target: &JsValue,
    done: bool,
    context: &mut Context,
) {
    let promise = JsPromise::from_object(promise.as_object().unwrap().clone()).unwrap();
    let PromiseState::Fulfilled(v) = promise.state() else {
        panic!("promise was not fulfilled");
    };
    let o = v.as_object().unwrap();
    let value = o.get(js_str!("value"), context).unwrap();
    let d = o
        .get(js_str!("done"), context)
        .unwrap()
        .as_boolean()
        .unwrap();
    assert_eq!(&value, target);
    assert_eq!(d, done);
}

#[test]
fn return_on_then_infinite_loop() {
    // Checks that calling `return` inside `then` only enters an infinite loop without
    // crashing the engine.
    run_test_actions([
        TestAction::run(indoc! {r#"
            async function* f() {}
            const g = f();
            let count = 0;
            Object.defineProperty(Object.prototype, "then", {
                get: function() {
                    if (count < 100) {
                        count++;
                        g.return();
                    }
                    return;
                },
            });
            g.return();
        "#}),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert_eq("count", 100),
    ]);
}

#[test]
fn return_on_then_single() {
    // Checks that calling `return` inside `then` once runs without panicking.
    run_test_actions([
        TestAction::run(indoc! {r#"
            async function* f() {}
            const g = f();
            let first = true;
            Object.defineProperty(Object.prototype, "then", {
                get: function() {
                    if (first) {
                        first = false;
                        g.return();
                    }
                    return;
                },
            });
            let ret = g.return()
        "#}),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert_eq("first", false),
        TestAction::assert_with_op("ret", |ret, context| {
            assert_promise_iter_value(&ret, &JsValue::undefined(), true, context);
            true
        }),
    ]);
}

#[test]
fn return_on_then_queue() {
    // Checks that calling `return` inside `then` doesn't mess with the request queue.
    run_test_actions([
        TestAction::run(indoc! {r#"
            async function* f() {
                yield 1;
                yield 2;
            }
            const g = f();
            let count = 0;
            Object.defineProperty(Object.prototype, "then", {
                get: function() {
                    if (count < 2) {
                        count++;
                        g.return();
                    }
                    return;
                },
            });
            let first = g.next();
            let second = g.next();
            let ret = g.return();
        "#}),
        TestAction::inspect_context(|ctx| ctx.run_jobs().unwrap()),
        TestAction::assert_with_op("first", |first, context| {
            assert_promise_iter_value(&first, &JsValue::from(1), false, context);
            true
        }),
        TestAction::assert_with_op("second", |second, context| {
            assert_promise_iter_value(&second, &JsValue::from(2), false, context);
            true
        }),
        TestAction::assert_with_op("ret", |ret, context| {
            assert_promise_iter_value(&ret, &JsValue::undefined(), true, context);
            true
        }),
        TestAction::assert_eq("count", JsValue::from(2)),
    ]);
}
