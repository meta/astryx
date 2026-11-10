//! Port of `packages/cli/foundation/text`: edit distance, component name
//! search and suggestion order, plus the JS string comparisons they rely on.

pub mod collate;
pub mod levenshtein;
pub mod string_utils;
pub mod suggest_order;

pub use collate::{code_unit_cmp, locale_compare};
pub use levenshtein::{levenshtein_distance, levenshtein_within};

/// A string as UTF-16 code units, the unit JS indexes strings by.
pub fn utf16(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

/// JS `String#length`.
pub fn js_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// JS `String#slice(start, end)` with non-negative bounds, in code units.
pub fn js_slice(s: &str, start: usize, end: usize) -> String {
    let units: Vec<u16> = s.encode_utf16().collect();
    let end = end.min(units.len());
    let start = start.min(end);
    String::from_utf16_lossy(&units[start..end])
}

/// JS `String#toLowerCase` for the cases that matter here. Rust's
/// `to_lowercase` follows the same Unicode default case mapping, apart from
/// final sigma, which JS also applies.
pub fn js_lower(s: &str) -> String {
    s.to_lowercase()
}
