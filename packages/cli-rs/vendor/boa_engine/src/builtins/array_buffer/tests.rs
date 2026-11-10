use crate::object::JsArrayBuffer;
use crate::{TestAction, run_test_actions};

#[test]
fn create_byte_data_block() {
    run_test_actions([TestAction::inspect_context(|context| {
        // Sunny day
        assert!(super::create_byte_data_block(100, None, context).is_ok());

        // Rainy day
        assert!(super::create_byte_data_block(u64::MAX, None, context).is_err());
    })]);
}

#[test]
fn create_shared_byte_data_block() {
    run_test_actions([TestAction::inspect_context(|context| {
        // Sunny day
        assert!(super::shared::create_shared_byte_data_block(100, context).is_ok());

        // Rainy day
        assert!(super::shared::create_shared_byte_data_block(u64::MAX, context).is_err());
    })]);
}

#[test]
fn resize() {
    run_test_actions([TestAction::inspect_context(|context| {
        let data_block = super::create_byte_data_block(100, None, context).unwrap();
        let js_arr = JsArrayBuffer::from_byte_block(data_block, context)
            .unwrap()
            .with_max_byte_length(100);
        let mut arr = js_arr.borrow_mut();

        // Sunny day
        assert_eq!(arr.data_mut().resize(50), Ok(()));

        // Rainy day
        assert!(arr.data_mut().resize(u64::MAX).is_err());
    })]);
}

#[test]
fn get_values() {
    run_test_actions([
        TestAction::run(
            r#"
            var buffer = new ArrayBuffer(12);
            var sample = new DataView(buffer, 0);

            sample.setUint8(0, 127);
            sample.setUint8(1, 255);
            sample.setUint8(2, 255);
            sample.setUint8(3, 255);
            sample.setUint8(4, 128);
            sample.setUint8(5, 0);
            sample.setUint8(6, 0);
            sample.setUint8(7, 0);
            sample.setUint8(8, 1);
            sample.setUint8(9, 0);
            sample.setUint8(10, 0);
            sample.setUint8(11, 0);
        "#,
        ),
        TestAction::assert("sample.getUint32(0, false) == 2147483647"),
        TestAction::assert("sample.getUint32(1, false) == 4294967168"),
        TestAction::assert("sample.getUint32(2, false) == 4294934528"),
        TestAction::assert("sample.getUint32(3, false) == 4286578688"),
        TestAction::assert("sample.getUint32(4, false) == 2147483648"),
        TestAction::assert("sample.getUint32(5, false) == 1"),
        TestAction::assert("sample.getUint32(6, false) == 256"),
        TestAction::assert("sample.getUint32(7, false) == 65536"),
        TestAction::assert("sample.getUint32(8, false) == 16777216"),
        TestAction::assert("sample.getUint32(0, true) == 4294967167"),
        TestAction::assert("sample.getUint32(1, true) == 2164260863"),
        TestAction::assert("sample.getUint32(2, true) == 8454143"),
        TestAction::assert("sample.getUint32(3, true) == 33023"),
        TestAction::assert("sample.getUint32(4, true) == 128"),
        TestAction::assert("sample.getUint32(5, true) == 16777216"),
        TestAction::assert("sample.getUint32(6, true) == 65536"),
        TestAction::assert("sample.getUint32(7, true) == 256"),
        TestAction::assert("sample.getUint32(8, true) == 1"),
    ]);
}

#[test]
fn sort() {
    run_test_actions([
        TestAction::run(
            r#"
            // This cmp function is needed as the harness does not support TypedArray comparison.
            function cmp(a, b) {
                return a.length === b.length && a.every((v, i) => v === b[i]);
            }

            var TypedArrayCtor = [
                Int8Array,
                Uint8Array,
                Int16Array,
                Uint16Array,
                Int32Array,
                Uint32Array,
                Float32Array,
                Float64Array,
            ];

            var descending = TypedArrayCtor.map((ctor) => new ctor([4, 3, 2, 1]).sort());
            var mixed = TypedArrayCtor.map((ctor) => new ctor([3, 4, 1, 2]).sort());
            var repeating = TypedArrayCtor.map((ctor) => new ctor([0, 1, 1, 2, 3, 3, 4]).sort());
        "#,
        ),
        // Descending
        TestAction::assert("cmp(descending[0], [1, 2, 3, 4])"),
        TestAction::assert("cmp(descending[1], [1, 2, 3, 4])"),
        TestAction::assert("cmp(descending[2], [1, 2, 3, 4])"),
        TestAction::assert("cmp(descending[3], [1, 2, 3, 4])"),
        TestAction::assert("cmp(descending[4], [1, 2, 3, 4])"),
        TestAction::assert("cmp(descending[5], [1, 2, 3, 4])"),
        TestAction::assert("cmp(descending[6], [1, 2, 3, 4])"),
        TestAction::assert("cmp(descending[7], [1, 2, 3, 4])"),
        // Mixed
        TestAction::assert("cmp(mixed[0], [1, 2, 3, 4])"),
        TestAction::assert("cmp(mixed[1], [1, 2, 3, 4])"),
        TestAction::assert("cmp(mixed[2], [1, 2, 3, 4])"),
        TestAction::assert("cmp(mixed[3], [1, 2, 3, 4])"),
        TestAction::assert("cmp(mixed[4], [1, 2, 3, 4])"),
        TestAction::assert("cmp(mixed[5], [1, 2, 3, 4])"),
        TestAction::assert("cmp(mixed[6], [1, 2, 3, 4])"),
        TestAction::assert("cmp(mixed[7], [1, 2, 3, 4])"),
        // Repeating
        TestAction::assert("cmp(repeating[0], [0, 1, 1, 2, 3, 3, 4])"),
        TestAction::assert("cmp(repeating[1], [0, 1, 1, 2, 3, 3, 4])"),
        TestAction::assert("cmp(repeating[2], [0, 1, 1, 2, 3, 3, 4])"),
        TestAction::assert("cmp(repeating[3], [0, 1, 1, 2, 3, 3, 4])"),
        TestAction::assert("cmp(repeating[4], [0, 1, 1, 2, 3, 3, 4])"),
        TestAction::assert("cmp(repeating[5], [0, 1, 1, 2, 3, 3, 4])"),
        TestAction::assert("cmp(repeating[6], [0, 1, 1, 2, 3, 3, 4])"),
        TestAction::assert("cmp(repeating[7], [0, 1, 1, 2, 3, 3, 4])"),
    ]);
}

#[test]
fn sort_negative_zero() {
    run_test_actions([
        TestAction::run(
            r#"
            // This cmp function is needed as the harness does not support TypedArray comparison.
            function cmp(a, b) {
                return a.length === b.length && a.every((v, i) => v === b[i]);
            }

            var TypedArrayCtor = [Float32Array, Float64Array];
            var negativeZero = TypedArrayCtor.map((ctor) => new ctor([1, 0, -0, 2]).sort());
            var infinities = TypedArrayCtor.map((ctor) => new ctor([3, 4, Infinity, -Infinity, 1, 2]).sort());
        "#,
        ),
        TestAction::assert("cmp(negativeZero[0], [-0, 0, 1, 2])"),
        TestAction::assert("cmp(negativeZero[1], [-0, 0, 1, 2])"),
        TestAction::assert("cmp(infinities[0], [-Infinity, 1, 2, 3, 4, Infinity])"),
        TestAction::assert("cmp(infinities[1], [-Infinity, 1, 2, 3, 4, Infinity])"),
    ]);
}

/// Tests `SharedArrayBuffer.prototype.slice` which triggers `copy_shared_to_shared`
/// (the `batched_atomic_copy_forward` path).
#[test]
fn shared_array_buffer_slice() {
    run_test_actions([
        TestAction::run(
            r#"
            var sab = new SharedArrayBuffer(16);
            var view = new Uint8Array(sab);
            for (var i = 0; i < 16; i++) view[i] = i + 1;
            var sliced = sab.slice(0);
            var result = new Uint8Array(sliced);
        "#,
        ),
        // Verify all 16 bytes copied correctly (exercises u64 batch + head/tail)
        TestAction::assert("result[0] === 1"),
        TestAction::assert("result[7] === 8"),
        TestAction::assert("result[15] === 16"),
        TestAction::assert("result.length === 16"),
    ]);
}

/// Tests `SharedArrayBuffer.prototype.slice` with a partial range and odd sizes
/// to exercise alignment edge cases in the batched copy.
#[test]
fn shared_array_buffer_slice_partial() {
    run_test_actions([
        TestAction::run(
            r#"
            var sab = new SharedArrayBuffer(20);
            var view = new Uint8Array(sab);
            for (var i = 0; i < 20; i++) view[i] = i * 3;

            // Slice with odd offset and size to hit unaligned head/tail
            var sliced = sab.slice(3, 14);
            var result = new Uint8Array(sliced);
        "#,
        ),
        TestAction::assert("result.length === 11"),
        TestAction::assert("result[0] === 9"),
        TestAction::assert("result[10] === 39"),
    ]);
}

/// Tests TypedArray.set from a SharedArrayBuffer-backed array to a regular
/// ArrayBuffer-backed array, triggering `batched_copy_atomic_to_bytes`.
#[test]
fn shared_to_regular_typed_array_set() {
    run_test_actions([
        TestAction::run(
            r#"
            var sab = new SharedArrayBuffer(16);
            var src = new Uint8Array(sab);
            for (var i = 0; i < 16; i++) src[i] = 100 + i;

            var ab = new ArrayBuffer(16);
            var dest = new Uint8Array(ab);
            dest.set(src);
        "#,
        ),
        TestAction::assert("dest[0] === 100"),
        TestAction::assert("dest[7] === 107"),
        TestAction::assert("dest[15] === 115"),
    ]);
}

/// Tests TypedArray.set from a regular ArrayBuffer-backed array to a
/// SharedArrayBuffer-backed array, triggering `batched_copy_bytes_to_atomic`.
#[test]
fn regular_to_shared_typed_array_set() {
    run_test_actions([
        TestAction::run(
            r#"
            var ab = new ArrayBuffer(16);
            var src = new Uint8Array(ab);
            for (var i = 0; i < 16; i++) src[i] = 200 + i;

            var sab = new SharedArrayBuffer(16);
            var dest = new Uint8Array(sab);
            dest.set(src);
        "#,
        ),
        TestAction::assert("dest[0] === 200"),
        TestAction::assert("dest[7] === 207"),
        TestAction::assert("dest[15] === 215"),
    ]);
}

/// Tests forward `copyWithin` on a SharedArrayBuffer-backed typed array,
/// triggering `copy_shared_to_shared` via `memmove`.
#[test]
fn shared_typed_array_copy_within() {
    run_test_actions([
        TestAction::run(
            r#"
            var sab = new SharedArrayBuffer(16);
            var arr = new Uint8Array(sab);
            for (var i = 0; i < 16; i++) arr[i] = i + 1;

            // Forward copy: copies bytes 4..12 to offset 0
            arr.copyWithin(0, 4, 12);
        "#,
        ),
        TestAction::assert("arr[0] === 5"),
        TestAction::assert("arr[7] === 12"),
        TestAction::assert("arr[8] === 9"),
    ]);
}

/// Tests backward `copyWithin` on a SharedArrayBuffer-backed typed array,
/// triggering `copy_shared_to_shared_backwards` when source and dest overlap.
#[test]
fn shared_typed_array_copy_within_backward() {
    run_test_actions([
        TestAction::run(
            r#"
            var sab = new SharedArrayBuffer(16);
            var arr = new Uint8Array(sab);
            for (var i = 0; i < 16; i++) arr[i] = i + 1;

            // Backward copy: copies bytes 0..8 to offset 4 (overlapping)
            arr.copyWithin(4, 0, 8);
        "#,
        ),
        TestAction::assert("arr[0] === 1"),
        TestAction::assert("arr[3] === 4"),
        TestAction::assert("arr[4] === 1"),
        TestAction::assert("arr[11] === 8"),
        TestAction::assert("arr[12] === 13"),
    ]);
}

/// Tests zero-length slice to exercise the `count == 0` early return.
#[test]
fn shared_array_buffer_slice_empty() {
    run_test_actions([
        TestAction::run(
            r#"
            var sab = new SharedArrayBuffer(16);
            var view = new Uint8Array(sab);
            for (var i = 0; i < 16; i++) view[i] = i + 1;
            var sliced = sab.slice(5, 5);
            var result = new Uint8Array(sliced);
        "#,
        ),
        TestAction::assert("result.length === 0"),
    ]);
}
