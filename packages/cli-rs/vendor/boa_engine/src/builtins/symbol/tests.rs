use crate::{JsValue, TestAction, run_test_actions};
use boa_macros::js_str;
use indoc::indoc;

#[test]
fn call_symbol_and_check_return_type() {
    run_test_actions([TestAction::assert_with_op("Symbol()", |val, _| {
        val.is_symbol()
    })]);
}

#[test]
fn print_symbol_expect_description() {
    run_test_actions([TestAction::assert_eq(
        "String(Symbol('Hello'))",
        js_str!("Symbol(Hello)"),
    )]);
}

#[test]
fn symbol_access() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var x = {};
                var sym1 = Symbol("Hello");
                var sym2 = Symbol("Hello");
                x[sym1] = 10;
                x[sym2] = 20;
            "#}),
        TestAction::assert_eq("x[sym1]", 10),
        TestAction::assert_eq("x[sym2]", 20),
        TestAction::assert_eq("x['Symbol(Hello)']", JsValue::undefined()),
    ]);
}

#[test]
fn symbol_for_and_key_for() {
    use crate::Context;
    use std::thread;
    run_test_actions([
        TestAction::run(indoc! {r#"
                var s1 = Symbol.for("shared");
                var s2 = Symbol.for("shared");
            "#}),
        // Symbol.for with the same key returns the same symbol
        TestAction::assert("s1 === s2"),
        // Symbol.keyFor returns the key for a globally registered symbol
        TestAction::assert_eq("Symbol.keyFor(s1)", js_str!("shared")),
        // Symbol.keyFor returns undefined for a non-registered symbol
        TestAction::assert_eq("Symbol.keyFor(Symbol('local'))", JsValue::undefined()),
    ]);

    // Test that globally registered symbols are preserved across threads

    let handle = thread::spawn(|| {
        let mut context = Context::default();
        let result = context.eval(crate::Source::from_bytes(r#"Symbol.for("cross_thread")"#));
        result
            .unwrap()
            .as_symbol()
            .expect("should be a symbol")
            .clone()
    });

    let sym_from_thread = handle.join().expect("thread panicked");

    let mut context = Context::default();
    let result = context.eval(crate::Source::from_bytes(r#"Symbol.for("cross_thread")"#));
    let sym_from_main = result
        .unwrap()
        .as_symbol()
        .expect("should be a symbol")
        .clone();

    assert_eq!(
        sym_from_thread, sym_from_main,
        "Symbol.for should return the same symbol across different threads"
    );
}

#[test]
fn symbol_description_getter() {
    run_test_actions([
        TestAction::assert_eq("Symbol('desc').description", js_str!("desc")),
        TestAction::assert_eq("Symbol().description", JsValue::undefined()),
        TestAction::assert_eq("Symbol('').description", js_str!("")),
    ]);
}

#[test]
fn symbol_value_of() {
    run_test_actions([
        TestAction::run("var sym = Symbol('vo');"),
        TestAction::assert("Object(sym).valueOf() === sym"),
    ]);
}

#[test]
fn symbol_to_string() {
    run_test_actions([
        TestAction::assert_eq("Symbol('abc').toString()", js_str!("Symbol(abc)")),
        TestAction::assert_eq("Symbol().toString()", js_str!("Symbol()")),
    ]);
}

#[test]
fn symbol_to_primitive() {
    run_test_actions([
        TestAction::run("var sym = Symbol('prim');"),
        TestAction::assert("sym[Symbol.toPrimitive]('default') === sym"),
    ]);
}

#[test]
fn new_symbol_throws() {
    run_test_actions([TestAction::assert_native_error(
        "new Symbol()",
        crate::JsNativeErrorKind::Type,
        "Symbol is not a constructor",
    )]);
}

#[test]
fn well_known_symbols_exist() {
    run_test_actions([
        TestAction::assert_eq("typeof Symbol.iterator", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.asyncIterator", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.hasInstance", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.isConcatSpreadable", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.match", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.matchAll", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.replace", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.search", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.species", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.split", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.toPrimitive", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.toStringTag", js_str!("symbol")),
        TestAction::assert_eq("typeof Symbol.unscopables", js_str!("symbol")),
    ]);
}
