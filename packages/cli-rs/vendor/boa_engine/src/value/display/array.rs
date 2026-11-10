use std::collections::HashSet;
use std::fmt;

use crate::{JsObject, JsValue, js_string, property::DescriptorKind};

pub(super) fn log_array_to(
    f: &mut fmt::Formatter<'_>,
    x: &JsObject,
    print_internals: bool,
    print_children: bool,
) -> fmt::Result {
    let len = x
        .borrow()
        .properties()
        .get(&js_string!("length").into())
        .expect("array object must have 'length' property")
        .value()
        .and_then(JsValue::as_number)
        .map(|n| n.max(0.0) as u32)
        .unwrap_or_default();

    if print_children {
        // Cap the number of elements we iterate over to avoid hangs on very large/sparse arrays.
        const MAX_ELEMENTS_TO_PRINT: u32 = 1000;
        let elems_to_print = len.min(MAX_ELEMENTS_TO_PRINT);

        if elems_to_print == 0 {
            return f.write_str("[]");
        }

        f.write_str("[ ")?;
        let mut first = true;

        for i in 0..elems_to_print {
            if first {
                first = false;
            } else {
                f.write_str(", ")?;
            }

            if let Some(desc) = x.borrow().properties().get(&i.into()) {
                match desc.kind() {
                    DescriptorKind::Data { value, .. } => {
                        if let Some(value) = value {
                            super::value::log_value_to(f, value, print_internals, false)?;
                        } else {
                            f.write_str("undefined")?;
                        }
                    }
                    DescriptorKind::Accessor { get, set } => {
                        let display = match (get.is_some(), set.is_some()) {
                            (true, true) => "[Getter/Setter]",
                            (true, false) => "[Getter]",
                            (false, true) => "[Setter]",
                            _ => "<empty>",
                        };
                        f.write_str(display)?;
                    }
                    DescriptorKind::Generic => {
                        unreachable!("found generic descriptor in array")
                    }
                }
            } else {
                f.write_str("<empty>")?;
            }
        }

        if len > elems_to_print {
            if !first {
                f.write_str(", ")?;
            }
            write!(f, "... {} more items", len - elems_to_print)?;
        }
        write!(f, " ]")
    } else {
        write!(f, "Array({len})")
    }
}

pub(super) fn log_array_compact(
    f: &mut fmt::Formatter<'_>,
    x: &JsObject,
    depth: u32,
    print_internals: bool,
    encounters: &mut HashSet<usize>,
) -> fmt::Result {
    let len = x
        .borrow()
        .properties()
        .get(&js_string!("length").into())
        .expect("array object must have 'length' property")
        .value()
        .and_then(JsValue::as_number)
        .map(|n| n.max(0.0) as u32)
        .unwrap_or_default();

    if len == 0 {
        return f.write_str("[]");
    }

    f.write_str("[ ")?;
    let mut first = true;
    for i in 0..len {
        if first {
            first = false;
        } else {
            f.write_str(", ")?;
        }
        if let Some(desc) = x.borrow().properties().get(&i.into()) {
            match desc.kind() {
                DescriptorKind::Data { value, .. } => {
                    if let Some(value) = value {
                        super::value::log_value_compact(
                            f,
                            value,
                            depth + 1,
                            print_internals,
                            encounters,
                        )?;
                    } else {
                        f.write_str("undefined")?;
                    }
                }
                DescriptorKind::Accessor { get, set } => {
                    let display = match (get.is_some(), set.is_some()) {
                        (true, true) => "[Getter/Setter]",
                        (true, false) => "[Getter]",
                        (false, true) => "[Setter]",
                        _ => "<empty>",
                    };
                    f.write_str(display)?;
                }
                DescriptorKind::Generic => {
                    unreachable!("found generic descriptor in array")
                }
            }
        } else {
            f.write_str("<empty>")?;
        }
    }
    f.write_str(" ]")
}
