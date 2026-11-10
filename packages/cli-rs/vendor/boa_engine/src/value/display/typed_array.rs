use std::fmt;
use std::sync::atomic::Ordering;

use crate::{JsObject, JsValue, builtins::typed_array::TypedArray};

/// Formats a `TypedArray` object for display, e.g. `Uint8Array(3) [ 1, 2, 3 ]`.
///
/// If `show_elements` is `false`, only the type name and length are printed (e.g. `Uint8Array(3)`).
pub(super) fn log_typed_array(
    f: &mut fmt::Formatter<'_>,
    obj: &JsObject,
    show_elements: bool,
    print_internals: bool,
) -> fmt::Result {
    let inner = obj
        .downcast_ref::<TypedArray>()
        .expect("must be a TypedArray object");
    let kind = inner.kind();
    let type_name = kind.js_name().to_std_string_lossy();

    let viewed_buf = inner.viewed_array_buffer();
    let buf_ref = viewed_buf.as_buffer();
    let Some(buf_bytes) = buf_ref.bytes(Ordering::Relaxed) else {
        if show_elements {
            return write!(f, "{type_name}(0) []");
        }
        return write!(f, "{type_name}(0)");
    };
    let buf_len = buf_bytes.len();
    if inner.is_out_of_bounds(buf_len) {
        if show_elements {
            return write!(f, "{type_name}(0) []");
        }
        return write!(f, "{type_name}(0)");
    }

    let length = inner.array_length(buf_len);

    if !show_elements {
        return write!(f, "{type_name}({length})");
    }

    if length == 0 {
        return write!(f, "{type_name}(0) []");
    }

    write!(f, "{type_name}({length}) [ ")?;

    let offset = inner.byte_offset() as usize;
    let elem_size = kind.element_size() as usize;

    for i in 0..length as usize {
        if i > 0 {
            f.write_str(", ")?;
        }
        let byte_index = offset + i * elem_size;
        // SAFETY: `array_length` verified all indices are within bounds.
        // TypedArray invariants guarantee the buffer is correctly aligned at `byte_offset`.
        let element = unsafe {
            buf_bytes
                .subslice(byte_index..)
                .get_value(kind, Ordering::Relaxed)
        };
        let value: JsValue = element.into();
        super::value::log_value_to(f, &value, print_internals, false)?;
    }

    f.write_str(" ]")
}
