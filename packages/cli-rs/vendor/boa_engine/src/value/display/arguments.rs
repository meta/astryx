use crate::builtins::function::arguments::MappedArguments;
use crate::property::DescriptorKind;
use crate::value::display::value;
use crate::{JsObject, JsValue, js_string};
use std::collections::HashSet;
use std::fmt::{self, Write};

const MAX_ARGUMENTS_TO_LOG: u32 = 100;

/// Formats an Arguments object for display.
///
/// Always uses multiline output: (unless `print_children` is false or length is 0)
/// ```text
/// [Arguments] {
///   0: "first",
///   1: 42
/// }
/// ```
pub(super) fn log_arguments_to(
    f: &mut fmt::Formatter<'_>,
    x: &JsObject,
    print_internals: bool,
    print_children: bool,
) -> fmt::Result {
    let reported_len = x
        .borrow()
        .properties()
        .get(&js_string!("length").into())
        .and_then(|d| d.value().cloned())
        .and_then(|v| v.as_number())
        .map_or(0u32, |n| n.max(0.0) as u32);

    let len = reported_len.min(MAX_ARGUMENTS_TO_LOG);

    if !print_children {
        return write!(f, "Arguments({reported_len})");
    }

    if reported_len == 0 {
        return f.write_str("[Arguments] {}");
    }

    f.write_str("[Arguments] {\n")?;
    for i in 0..len {
        // For MappedArguments, prefer the live value from the environment parameter map.
        // Named parameters are backed by environment bindings, not the stored property value,
        // so reading properties().get(...).value() can return a stale initial value.
        let mapped_value = x.downcast_ref::<MappedArguments>().and_then(|m| m.get(i));

        write!(f, "  {i}: ")?;

        if let Some(v) = mapped_value {
            write!(
                f,
                "{}",
                CompactValue {
                    value: &v,
                    print_internals
                }
            )?;
        } else {
            let borrow = x.borrow();
            if let Some(d) = borrow.properties().get(&i.into()) {
                match d.kind() {
                    DescriptorKind::Data { value, .. } => {
                        if let Some(v) = value {
                            write!(
                                f,
                                "{}",
                                CompactValue {
                                    value: v,
                                    print_internals
                                }
                            )?;
                        } else {
                            f.write_str("undefined")?;
                        }
                    }
                    DescriptorKind::Accessor { get, set } => {
                        let label = match (get.is_some(), set.is_some()) {
                            (true, true) => "[Getter/Setter]",
                            (true, false) => "[Getter]",
                            (false, true) => "[Setter]",
                            _ => "[No Getter/Setter]",
                        };
                        f.write_str(label)?;
                    }
                    DescriptorKind::Generic => f.write_str("undefined")?,
                }
            } else {
                f.write_str("<empty>")?;
            }
        }

        if i + 1 < len {
            f.write_char(',')?;
        }
        f.write_char('\n')?;
    }
    f.write_str("}")
}

struct CompactValue<'a> {
    value: &'a JsValue,
    print_internals: bool,
}

impl fmt::Display for CompactValue<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        value::log_value_compact(f, self.value, 0, self.print_internals, &mut HashSet::new())
    }
}
