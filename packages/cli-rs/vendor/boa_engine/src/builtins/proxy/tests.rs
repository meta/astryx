use crate::{JsNativeErrorKind, TestAction, run_test_actions};
use indoc::indoc;

#[test]
fn proxy_cannot_report_non_configurable_as_configurable() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const target = {};
            Object.defineProperty(target, 'foo', { value: 1, configurable: false });

            const proxy = new Proxy(target, {
              getOwnPropertyDescriptor() {
                return { value: 1, configurable: true };
              }
            });

            Object.getOwnPropertyDescriptor(proxy, 'foo');
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap returned unexpected property",
    )]);
}

#[test]
fn proxy_cannot_hide_non_configurable_property() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const target = {};
            Object.defineProperty(target, 'foo', { value: 1, configurable: false });

            const proxy = new Proxy(target, {
              has() { return false; }
            });

            'foo' in proxy;
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap returned unexpected property",
    )]);
}

#[test]
fn proxy_cannot_report_extensible_as_non_extensible() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const proxy = new Proxy({}, {
              isExtensible() { return false; }
            });

            Object.isExtensible(proxy);
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap returned unexpected extensible value",
    )]);
}

#[test]
fn proxy_cannot_report_non_extensible_as_extensible() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const target = Object.preventExtensions({});

            const proxy = new Proxy(target, {
              isExtensible() { return true; }
            });

            Object.isExtensible(proxy);
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap returned unexpected extensible value",
    )]);
}

#[test]
fn proxy_ownkeys_must_include_non_configurable_keys() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const target = {};
            Object.defineProperty(target, 'foo', { value: 1, configurable: false });

            const proxy = new Proxy(target, {
              ownKeys() { return []; }
            });

            Object.keys(proxy);
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap failed to return all non-configurable property keys",
    )]);
}

#[test]
fn proxy_ownkeys_cannot_report_duplicate_keys() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const proxy = new Proxy({}, {
              ownKeys() { return ['a','a']; }
            });

            Object.keys(proxy);
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap result contains duplicate string property keys",
    )]);
}

#[test]
fn proxy_defineproperty_respects_target_invariants() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const target = Object.preventExtensions({});

            const proxy = new Proxy(target, {
              defineProperty() { return true; }
            });

            Object.defineProperty(proxy, 'foo', { value: 1 });
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap failed to set property",
    )]);
}

#[test]
fn proxy_getprototypeof_invariant() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const target = Object.preventExtensions({});

            const proxy = new Proxy(target, {
              getPrototypeOf() { return Array.prototype; }
            });

            Object.getPrototypeOf(proxy);
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap returned unexpected prototype",
    )]);
}

#[test]
fn proxy_setprototypeof_invariant() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const target = Object.preventExtensions({});

            const proxy = new Proxy(target, {
              setPrototypeOf() { return true; }
            });

            Object.setPrototypeOf(proxy, Array.prototype);
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap failed to set prototype",
    )]);
}

#[test]
fn proxy_preventextensions_invariant() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const proxy = new Proxy({}, {
              preventExtensions() { return true; }
            });

            Object.preventExtensions(proxy);
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap failed to set extensible",
    )]);
}

#[test]
fn proxy_ownkeys_symbol_invariant() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const sym = Symbol("a");

            const target = {};
            Object.defineProperty(target, sym, {
              value: 1,
              configurable: false
            });

            const proxy = new Proxy(target, {
              ownKeys() { return []; }
            });

            Reflect.ownKeys(proxy);
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap failed to return all non-configurable property keys",
    )]);
}

#[test]
fn proxy_ownkeys_non_extensible_invariant() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            const target = Object.preventExtensions({ a: 1 });

            const proxy = new Proxy(target, {
              ownKeys() { return []; }
            });

            Object.keys(proxy);
        "#},
        JsNativeErrorKind::Type,
        "Proxy trap failed to return all configurable property keys",
    )]);
}
