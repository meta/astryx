use crate::{JsNativeErrorKind, TestAction, run_test_actions};

#[test]
fn uint8array_constructor_length() {
    run_test_actions([
        TestAction::run("let a = new Uint8Array(4);"),
        TestAction::assert_eq("a.length", 4),
        TestAction::assert_eq("a.byteLength", 4),
    ]);
}

#[test]
fn uint8array_constructor_from_array() {
    run_test_actions([
        TestAction::run("let a = new Uint8Array([1, 2, 3]);"),
        TestAction::assert_eq("a.length", 3),
        TestAction::assert_eq("a[1]", 2),
    ]);
}

#[test]
fn uint8array_constructor_from_array_buffer() {
    run_test_actions([
        TestAction::run("let buffer = new ArrayBuffer(4); let a = new Uint8Array(buffer);"),
        TestAction::assert_eq("a.length", 4),
    ]);
}

#[test]
fn uint8array_read_write_semantics() {
    run_test_actions([
        TestAction::run("let a = new Uint8Array(2); a[0] = 42;"),
        TestAction::assert_eq("a[0]", 42),
    ]);
}

#[test]
fn uint8array_out_of_bounds_behavior() {
    run_test_actions([
        TestAction::run("let a = new Uint8Array(2);"),
        TestAction::assert("a[10] === undefined"),
        TestAction::run("a[10] = 5;"),
        TestAction::assert_eq("a.length", 2),
    ]);
}

#[test]
fn uint8array_numeric_coercion() {
    run_test_actions([
        TestAction::run("let a = new Uint8Array(1); a[0] = 256;"),
        TestAction::assert_eq("a[0]", 0),
        TestAction::run("a[0] = -1;"),
        TestAction::assert_eq("a[0]", 255),
    ]);
}

#[test]
fn float32array_storage() {
    run_test_actions([
        TestAction::run("let f = new Float32Array(1); f[0] = 1.5;"),
        TestAction::assert_eq("f[0]", 1.5),
    ]);
}

#[test]
fn float32array_nan_behavior() {
    run_test_actions([
        TestAction::run("let f = new Float32Array(1); f[0] = 'hello';"),
        TestAction::assert("Number.isNaN(f[0])"),
    ]);
}

#[test]
fn float32_precision_behavior() {
    run_test_actions([
        TestAction::run("let f = new Float32Array(1); f[0] = 1.337;"),
        TestAction::assert("Math.fround(1.337) === f[0]"),
    ]);
}

#[test]
fn typedarray_prototype_set() {
    run_test_actions([
        TestAction::run("let a = new Uint8Array(4); a.set([1, 2], 1);"),
        TestAction::assert_eq("a[1]", 1),
        TestAction::assert_eq("a[2]", 2),
    ]);
}

#[test]
fn typedarray_prototype_fill() {
    run_test_actions([
        TestAction::run("let a = new Uint8Array(3); a.fill(7);"),
        TestAction::assert_eq("a[2]", 7),
    ]);
}

#[test]
fn typedarray_prototype_subarray_shared_memory() {
    run_test_actions([
        TestAction::run(
            "
        let a = new Uint8Array([1, 2, 3, 4]);
        let b = a.subarray(1, 3);
        b[0] = 99;
        ",
        ),
        TestAction::assert_eq("a[1]", 99),
        TestAction::assert_eq("b[0]", 99),
    ]);
}

#[test]
fn typedarray_conversion_number() {
    run_test_actions([
        TestAction::run("let a = new Int8Array([1, -1, 127]);"),
        TestAction::run("let b = new Float64Array(a);"),
        TestAction::assert_eq("b.length", 3),
        TestAction::assert_eq("b[0]", 1),
        TestAction::assert_eq("b[1]", -1),
        TestAction::assert_eq("b[2]", 127),
    ]);
}

#[test]
fn typedarray_conversion_bigint() {
    run_test_actions([
        TestAction::run("let a = new BigInt64Array([1n, -1n]);"),
        TestAction::run("let b = new BigUint64Array(a);"),
        TestAction::assert_eq("b.length", 2),
        TestAction::assert("b[0] === 1n"),
        TestAction::assert("b[1] === 0xffffffffffffffffn"),
    ]);
}

#[test]
fn typedarray_conversion_clamped() {
    run_test_actions([
        TestAction::run("let a = new Float64Array([255.5, 256.1, -0.5]);"),
        TestAction::run("let b = new Uint8ClampedArray(a);"),
        TestAction::assert_eq("b[0]", 255),
        TestAction::assert_eq("b[1]", 255),
        TestAction::assert_eq("b[2]", 0),
    ]);
}

#[test]
fn typedarray_conversion_mismatch_throws() {
    run_test_actions([
        TestAction::run("let a = new Int8Array([1]);"),
        TestAction::assert_native_error(
            "new BigInt64Array(a)",
            JsNativeErrorKind::Type,
            "Cannot initialize typed array from different content type",
        ),
        TestAction::run("let b = new BigInt64Array([1n]);"),
        TestAction::assert_native_error(
            "new Int8Array(b)",
            JsNativeErrorKind::Type,
            "Cannot initialize typed array from different content type",
        ),
    ]);
}

#[test]
fn typedarray_exotic_prevent_extensions() {
    // ref: https://github.com/tc39/test262/blob/main/test/staging/built-ins/Object/preventExtensions/preventExtensions-variable-length-typed-arrays.js
    run_test_actions([
        TestAction::run("const gsab = new SharedArrayBuffer(4, { maxByteLength: 8 });"),
        TestAction::run("const fixedLength = new Uint8Array(gsab, 0, 4);"),
        TestAction::run("const fixedLengthWithOffset = new Uint8Array(gsab, 2, 2);"),
        TestAction::run("Object.preventExtensions(fixedLength);"),
        TestAction::run("Object.preventExtensions(fixedLengthWithOffset);"),
        TestAction::assert("!Object.isExtensible(fixedLength)"),
        TestAction::assert("!Object.isExtensible(fixedLengthWithOffset)"),
        TestAction::run("const rab = new ArrayBuffer(4);"),
        TestAction::run("const fixedLength1 = new Uint8Array(rab, 0, 4);"),
        TestAction::run("const fixedLengthWithOffset1 = new Uint8Array(rab, 2, 2);"),
        TestAction::run("Object.preventExtensions(fixedLength1);"),
        TestAction::run("Object.preventExtensions(fixedLengthWithOffset1);"),
        TestAction::assert("!Object.isExtensible(fixedLength1)"),
        TestAction::assert("!Object.isExtensible(fixedLengthWithOffset1)"),
    ]);
}
