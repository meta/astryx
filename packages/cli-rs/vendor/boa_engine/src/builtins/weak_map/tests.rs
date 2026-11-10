use crate::{JsNativeErrorKind, TestAction, run_test_actions};
use boa_macros::js_str;

#[test]
fn get_or_insert_inserts_on_miss() {
    run_test_actions([
        TestAction::run("let wm = new WeakMap(); let k = {};"),
        TestAction::assert_eq("wm.getOrInsert(k, 42)", 42),
        TestAction::assert("wm.has(k)"),
        TestAction::assert_eq("wm.get(k)", 42),
    ]);
}

#[test]
fn get_or_insert_returns_existing_on_hit() {
    run_test_actions([
        TestAction::run("let k = {}; let wm = new WeakMap([[k, 99]]);"),
        TestAction::assert_eq("wm.getOrInsert(k, 123)", 99),
        TestAction::assert_eq("wm.get(k)", 99), // unchanged
    ]);
}

#[test]
fn get_or_insert_computed_requires_callable() {
    run_test_actions([TestAction::assert_native_error(
        "new WeakMap().getOrInsertComputed({}, undefined)",
        JsNativeErrorKind::Type,
        "Method WeakMap.prototype.getOrInsertComputed called with non-callable callback function",
    )]);
}

#[test]
fn get_or_insert_requires_object_key() {
    run_test_actions([TestAction::assert_native_error(
        "new WeakMap().getOrInsert('x', 1)",
        JsNativeErrorKind::Type,
        "WeakMap.getOrInsert: expected target argument of type `object`, got target of type `string`",
    )]);
}

#[test]
fn get_or_insert_computed_requires_object_key() {
    run_test_actions([TestAction::assert_native_error(
        "new WeakMap().getOrInsertComputed('x', () => 1)",
        JsNativeErrorKind::Type,
        "WeakMap.getOrInsertComputed: expected target argument of type `object`, got target of type `string`",
    )]);
}

#[test]
fn get_or_insert_computed_not_called_on_hit() {
    run_test_actions([
        TestAction::run("const k = {}; const wm = new WeakMap([[k, 7]]); let calls = 0;"),
        TestAction::assert_eq(
            "wm.getOrInsertComputed(k, (key) => { calls++; return 1; })",
            7,
        ),
        TestAction::assert_eq("calls", 0),
        TestAction::assert_eq("wm.get(k)", 7),
    ]);
}

#[test]
fn get_or_insert_computed_this_is_undefined_and_key_forwarded() {
    run_test_actions([
        TestAction::run(
            r#"
            const wm = new WeakMap();
            const k = {};
            let seenThis, seenKey;
            const v = wm.getOrInsertComputed(k, function(x) { 'use strict'; seenThis = this; seenKey = x; return 'ok'; });
        "#,
        ),
        // `this` inside callback is undefined
        TestAction::assert("seenThis === undefined"),
        // key argument is forwarded as the same object
        TestAction::assert("seenKey === k"),
        TestAction::assert_eq("v", js_str!("ok")),
        TestAction::assert("wm.has(k)"),
        TestAction::assert_eq("wm.get(k)", js_str!("ok")),
    ]);
}

#[test]
fn get_or_insert_computed_overwrites_race() {
    run_test_actions([
        TestAction::run(
            r#"
            const wm = new WeakMap();
            const k = {};
            const v = wm.getOrInsertComputed(k, function(x) { wm.set(k, 'other'); return 'computed'; });
        "#,
        ),
        TestAction::assert_eq("v", js_str!("computed")),
        TestAction::assert_eq("wm.get(k)", js_str!("computed")),
    ]);
}

#[test]
fn get_or_insert_this_not_weakmap() {
    run_test_actions([TestAction::assert_native_error(
        "WeakMap.prototype.getOrInsert.call({}, {}, 1)",
        JsNativeErrorKind::Type,
        "WeakMap.prototype.getOrInsert: expected 'this' to be a WeakMap object",
    )]);
}

#[test]
fn get_or_insert_computed_this_not_weakmap() {
    run_test_actions([TestAction::assert_native_error(
        "WeakMap.prototype.getOrInsertComputed.call({}, {}, x => x)",
        JsNativeErrorKind::Type,
        "WeakMap.prototype.getOrInsertComputed: expected 'this' to be a WeakMap object",
    )]);
}

#[test]
fn weakmap_set_and_get() {
    run_test_actions([
        TestAction::run(
            r#"
            const wm = new WeakMap();
            const obj = {};
            wm.set(obj, 42);
        "#,
        ),
        TestAction::assert_eq("wm.get(obj)", 42),
    ]);
}

#[test]
fn weakmap_overwrite_value() {
    run_test_actions([
        TestAction::run(
            r#"
            const wm = new WeakMap();
            const obj = {};
            wm.set(obj, 1);
            wm.set(obj, 2);
        "#,
        ),
        TestAction::assert_eq("wm.get(obj)", 2),
    ]);
}

#[test]
fn weakmap_has() {
    run_test_actions([
        TestAction::run(
            r#"
            const wm = new WeakMap();
            const obj = {};
            wm.set(obj, 10);
        "#,
        ),
        TestAction::assert("wm.has(obj)"),
    ]);
}

#[test]
fn weakmap_delete() {
    run_test_actions([
        TestAction::run(
            r#"
            const wm = new WeakMap();
            const obj = {};
            wm.set(obj, 1);
        "#,
        ),
        TestAction::assert("wm.delete(obj)"),
    ]);
}

#[test]
fn weakmap_delete_twice() {
    run_test_actions([
        TestAction::run(
            r#"
            const wm = new WeakMap();
            const obj = {};
            wm.set(obj, 1);
            wm.delete(obj);
        "#,
        ),
        TestAction::assert("!wm.delete(obj)"),
    ]);
}

#[test]
fn weakmap_get_missing_key() {
    run_test_actions([
        TestAction::run(
            r#"
            const wm = new WeakMap();
            const result = wm.get({});
        "#,
        ),
        TestAction::assert("result === undefined"),
    ]);
}

#[test]
fn weakmap_multiple_keys() {
    run_test_actions([
        TestAction::run(
            r#"
            const wm = new WeakMap();
            const a = {};
            const b = {};
            wm.set(a, 1);
            wm.set(b, 2);
        "#,
        ),
        TestAction::assert_eq("wm.get(a) + wm.get(b)", 3),
    ]);
}

#[test]
fn weakmap_set_returns_this() {
    run_test_actions([
        TestAction::run(
            r#"
            const wm = new WeakMap();
            const obj = {};
        "#,
        ),
        TestAction::assert("wm.set(obj, 1) === wm"),
    ]);
}

#[test]
fn weakmap_set_rejects_number() {
    run_test_actions([
        TestAction::run("const wm = new WeakMap();"),
        TestAction::assert_native_error(
            "wm.set(42, 'value')",
            JsNativeErrorKind::Type,
            "WeakMap.set: expected target argument of type `object`, got target of type `number`",
        ),
    ]);
}

#[test]
fn weakmap_set_rejects_string() {
    run_test_actions([
        TestAction::run("const wm = new WeakMap();"),
        TestAction::assert_native_error(
            "wm.set('string', 'value')",
            JsNativeErrorKind::Type,
            "WeakMap.set: expected target argument of type `object`, got target of type `string`",
        ),
    ]);
}

#[test]
fn weakmap_set_rejects_boolean() {
    run_test_actions([
        TestAction::run("const wm = new WeakMap();"),
        TestAction::assert_native_error(
            "wm.set(true, 'value')",
            JsNativeErrorKind::Type,
            "WeakMap.set: expected target argument of type `object`, got target of type `boolean`",
        ),
    ]);
}

#[test]
fn weakmap_set_rejects_null() {
    run_test_actions([
        TestAction::run("const wm = new WeakMap();"),
        TestAction::assert_native_error(
            "wm.set(null, 'value')",
            JsNativeErrorKind::Type,
            "WeakMap.set: expected target argument of type `object`, got target of type `object`",
        ),
    ]);
}

#[test]
fn weakmap_set_rejects_undefined() {
    run_test_actions([
        TestAction::run("const wm = new WeakMap();"),
        TestAction::assert_native_error(
            "wm.set(undefined, 'value')",
            JsNativeErrorKind::Type,
            "WeakMap.set: expected target argument of type `object`, got target of type `undefined`",
        ),
    ]);
}

#[test]
fn weakmap_set_rejects_symbol() {
    run_test_actions([
        TestAction::run("const wm = new WeakMap();"),
        TestAction::assert_native_error(
            "wm.set(Symbol('sim'), 'value')",
            JsNativeErrorKind::Type,
            "WeakMap.set: expected target argument of type `object`, got target of type `symbol`",
        ),
    ]);
}
