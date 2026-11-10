use std::collections::HashSet;
use std::fmt;

use crate::{JsObject, JsValue, builtins::map::ordered_map::OrderedMap};

pub(super) fn log_map_to(
    f: &mut fmt::Formatter<'_>,
    v: &JsObject,
    print_internals: bool,
    print_children: bool,
) -> fmt::Result {
    let map = v
        .downcast_ref::<OrderedMap<JsValue>>()
        .expect("object must be a map");
    let size = map.len();

    if size == 0 {
        return f.write_str("Map(0)");
    }

    if !print_children {
        return write!(f, "Map({size})");
    }

    f.write_str("Map { ")?;
    let mut first = true;
    for (key, value) in map.iter() {
        if !first {
            f.write_str(", ")?;
        }
        first = false;
        super::value::log_value_to(f, key, print_internals, false)?;
        f.write_str(" \u{2192} ")?;
        super::value::log_value_to(f, value, print_internals, false)?;
    }
    f.write_str(" }")
}

pub(super) fn log_map_compact(
    f: &mut fmt::Formatter<'_>,
    v: &JsObject,
    depth: u32,
    print_internals: bool,
    encounters: &mut HashSet<usize>,
) -> fmt::Result {
    let map = v
        .downcast_ref::<OrderedMap<JsValue>>()
        .expect("object must be a map");
    let size = map.len();

    if size == 0 {
        return f.write_str("Map(0)");
    }

    if depth >= super::value::COMPACT_DEPTH_LIMIT {
        return write!(f, "Map({size})");
    }

    f.write_str("Map { ")?;
    let mut first = true;
    for (key, value) in map.iter() {
        if !first {
            f.write_str(", ")?;
        }
        first = false;
        super::value::log_value_compact(f, key, depth + 1, print_internals, encounters)?;
        f.write_str(" \u{2192} ")?;
        super::value::log_value_compact(f, value, depth + 1, print_internals, encounters)?;
    }
    f.write_str(" }")
}
