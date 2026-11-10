use crate::{JsNativeErrorKind, TestAction, run_test_actions};

#[test]
fn weakset_add_and_has() {
    run_test_actions([
        TestAction::run("var ws = new WeakSet(); var obj = {}; ws.add(obj);"),
        TestAction::assert("ws.has(obj)"),
    ]);
}

#[test]
fn weakset_add_chaining() {
    run_test_actions([
        TestAction::run("var ws = new WeakSet(); var obj = {};"),
        TestAction::assert("ws.add(obj) === ws"),
    ]);
}

#[test]
fn weakset_delete_behavior() {
    run_test_actions([
        TestAction::run("var ws = new WeakSet(); var obj = {}; ws.add(obj);"),
        TestAction::assert("ws.delete(obj) === true"),
        TestAction::assert("ws.delete(obj) === false"),
        TestAction::assert("ws.has(obj) === false"),
    ]);
}

#[test]
fn weakset_add_primitive_rejection() {
    run_test_actions([
        TestAction::run("var ws = new WeakSet();"),
        TestAction::assert_native_error(
            "ws.add(1);",
            JsNativeErrorKind::Type,
            "WeakSet.add: expected target argument of type `object`, got target of type `number`",
        ),
        TestAction::assert_native_error(
            "ws.add('x');",
            JsNativeErrorKind::Type,
            "WeakSet.add: expected target argument of type `object`, got target of type `string`",
        ),
        TestAction::assert_native_error(
            "ws.add(true);",
            JsNativeErrorKind::Type,
            "WeakSet.add: expected target argument of type `object`, got target of type `boolean`",
        ),
        TestAction::assert_native_error(
            "ws.add(null);",
            JsNativeErrorKind::Type,
            "WeakSet.add: expected target argument of type `object`, got target of type `object`",
        ),
        TestAction::assert_native_error(
            "ws.add(undefined);",
            JsNativeErrorKind::Type,
            "WeakSet.add: expected target argument of type `object`, got target of type `undefined`",
        ),
        TestAction::assert_native_error(
            "ws.add(Symbol('id'));",
            JsNativeErrorKind::Type,
            "WeakSet.add: expected target argument of type `object`, got target of type `symbol`",
        ),
    ]);
}

#[test]
fn weakset_has_primitive_returns_false() {
    run_test_actions([
        TestAction::run("var ws = new WeakSet();"),
        TestAction::assert("ws.has(1) === false"),
        TestAction::assert("ws.has('x') === false"),
        TestAction::assert("ws.has(null) === false"),
    ]);
}

#[test]
fn weakset_delete_primitive_returns_false() {
    run_test_actions([
        TestAction::run("var ws = new WeakSet();"),
        TestAction::assert("ws.delete(1) === false"),
        TestAction::assert("ws.delete('x') === false"),
        TestAction::assert("ws.delete(null) === false"),
    ]);
}

#[test]
fn weakset_add_duplicate() {
    run_test_actions([
        TestAction::run("var ws = new WeakSet(); var obj = {}; ws.add(obj);"),
        TestAction::assert("ws.has(obj) === true"),
        TestAction::run("ws.add(obj);"),
        TestAction::assert("ws.has(obj) === true"),
    ]);
}
