//! `String#localeCompare` for the names the shell sorts (command names,
//! flags): the shared ICU root collation.

pub use crate::text::collate::locale_compare;

#[cfg(test)]
mod tests {
    use super::*;
    use std::cmp::Ordering;
    #[test]
    fn icu_root_order() {
        // ICU root puts `_` before `-`, unlike code-unit order.
        assert_eq!(locale_compare("a_b", "a-b"), Ordering::Less);
        assert_eq!(locale_compare("aB", "Ab"), Ordering::Less);
        assert_eq!(locale_compare("é", "f"), Ordering::Less);
    }
}
