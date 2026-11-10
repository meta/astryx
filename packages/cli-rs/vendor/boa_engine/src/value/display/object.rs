use std::collections::HashSet;
use std::fmt::{self, Display, Write};

use crate::{
    JsObject, JsString, JsValue, js_string,
    property::{DescriptorKind, PropertyKey},
};

fn print_obj_value_internals(
    f: &mut fmt::Formatter<'_>,
    obj: &JsObject,
    indent: usize,
    encounters: &mut HashSet<usize>,
) -> fmt::Result {
    let object = obj.borrow();
    write!(f, "{:>indent$}__proto__: ", "")?;
    if let Some(object) = object.prototype() {
        log_object_to_internal(
            f,
            &object.clone().into(),
            encounters,
            indent.wrapping_add(4),
            true,
        )?;
    } else {
        write!(f, "{}", JsValue::null().display())?;
    }
    f.write_char(',')?;
    f.write_char('\n')
}

fn print_obj_value_props(
    f: &mut fmt::Formatter<'_>,
    obj: &JsObject,
    indent: usize,
    encounters: &mut HashSet<usize>,
    print_internals: bool,
) -> fmt::Result {
    let mut keys: Vec<_> = obj
        .borrow()
        .properties()
        .index_property_keys()
        .map(PropertyKey::from)
        .collect();
    keys.extend(obj.borrow().properties().shape.keys());

    let mut first = true;
    for key in keys {
        if first {
            first = false;
        } else {
            f.write_char(',')?;
            f.write_char('\n')?;
        }
        let val = obj
            .borrow()
            .properties()
            .get(&key)
            .expect("There should be a value");

        write!(f, "{:>width$}{}: ", "", key, width = indent)?;
        if val.is_data_descriptor() {
            let v = val.expect_value();
            log_object_to_internal(f, v, encounters, indent.wrapping_add(4), print_internals)?;
        } else {
            let display = match (val.set().is_some(), val.get().is_some()) {
                (true, true) => "Getter & Setter",
                (true, false) => "Setter",
                (false, true) => "Getter",
                _ => "No Getter/Setter",
            };
            write!(f, "{display}")?;
        }
    }
    f.write_char('\n')?;
    Ok(())
}

pub(super) fn log_object_to_internal(
    f: &mut fmt::Formatter<'_>,
    data: &JsValue,
    encounters: &mut HashSet<usize>,
    indent: usize,
    print_internals: bool,
) -> fmt::Result {
    if let Some(v) = data.as_object() {
        // The in-memory address of the current object
        let addr = std::ptr::from_ref(v.as_ref()).addr();

        // We need not continue if this object has already been
        // printed up the current chain
        if encounters.contains(&addr) {
            return f.write_str("[Cycle]");
        }

        // Mark the current object as encountered
        encounters.insert(addr);

        if v.is::<crate::builtins::Array>() {
            encounters.remove(&addr);
            return super::array::log_array_to(f, &v, print_internals, false);
        }

        if v.is::<crate::builtins::typed_array::TypedArray>() {
            encounters.remove(&addr);
            return super::typed_array::log_typed_array(f, &v, true, print_internals);
        }

        let constructor_name = get_constructor_name_of(&v);
        if let Some(name) = constructor_name {
            write!(f, "{} ", name.to_std_string_lossy())?;
        }
        f.write_str("{\n")?;

        if print_internals {
            print_obj_value_internals(f, &v, indent, encounters)?;
        }
        print_obj_value_props(f, &v, indent, encounters, print_internals)?;
        write!(f, "{:>indent$}}}", "", indent = indent.saturating_sub(4))?;

        // If the current object is referenced in a different branch,
        // it will not cause an infinite printing loop, so it is safe to be printed again
        encounters.remove(&addr);
        Ok(())
    } else {
        // Every other type of data is printed with the display method
        super::value::log_value_to(f, data, print_internals, false)
    }
}

/// The constructor can be retrieved as `Object.getPrototypeOf(obj).constructor`.
///
/// Returns `None` if the constructor is `Object` as plain objects don't need a name.
fn get_constructor_name_of(obj: &JsObject) -> Option<JsString> {
    let prototype = obj.prototype()?;

    // To neglect out plain object
    // `Object.getPrototypeOf(Object.prototype)` => null.
    // For user created `Object.create(Object.create(null))`,
    // we also don't need to display its name.
    prototype.prototype()?;

    let constructor_property = prototype
        .borrow()
        .properties()
        .get(&PropertyKey::from(js_string!("constructor")))?;
    let constructor = constructor_property.value()?;

    let name = constructor
        .as_object()?
        .borrow()
        .properties()
        .get(&PropertyKey::from(js_string!("name")))?
        .value()?
        .as_string()?;

    Some(name)
}

pub(super) fn log_plain_object_compact(
    f: &mut fmt::Formatter<'_>,
    obj: &JsObject,
    depth: u32,
    print_internals: bool,
    encounters: &mut HashSet<usize>,
) -> fmt::Result {
    let addr = std::ptr::from_ref(obj.as_ref()).addr();
    if encounters.contains(&addr) {
        return f.write_str("[Circular *]");
    }
    encounters.insert(addr);

    let mut keys: Vec<_> = obj
        .borrow()
        .properties()
        .index_property_keys()
        .map(PropertyKey::from)
        .collect();
    keys.extend(obj.borrow().properties().shape.keys());

    if keys.is_empty() {
        encounters.remove(&addr);
        return f.write_str("{}");
    }

    f.write_str("{ ")?;
    let mut first = true;
    for key in &keys {
        if first {
            first = false;
        } else {
            f.write_str(", ")?;
        }
        write!(f, "{key}: ")?;

        if let Some(val) = obj.borrow().properties().get(key) {
            match val.kind() {
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
                        _ => "[No Getter/Setter]",
                    };
                    f.write_str(display)?;
                }
                DescriptorKind::Generic => {
                    f.write_str("undefined")?;
                }
            }
        }
    }
    f.write_str(" }")?;

    encounters.remove(&addr);
    Ok(())
}

impl JsValue {
    /// A helper function for specifically printing object values
    #[must_use]
    pub fn display_obj(&self, print_internals: bool) -> String {
        struct DisplayObj<'a>(&'a JsValue, bool);
        impl Display for DisplayObj<'_> {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                log_object_to_internal(f, self.0, &mut HashSet::new(), 4, self.1)
            }
        }

        DisplayObj(self, print_internals).to_string()
    }
}
