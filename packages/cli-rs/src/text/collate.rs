//! `String#localeCompare` (ICU root collation, as Node's default locale
//! compares) and the plain UTF-16 code-unit order of `<` and `Array#sort`.

use icu_collator::options::CollatorOptions;
use icu_collator::{Collator, CollatorBorrowed};
use std::cmp::Ordering;
use std::sync::OnceLock;

fn collator() -> &'static CollatorBorrowed<'static> {
    static C: OnceLock<CollatorBorrowed<'static>> = OnceLock::new();
    C.get_or_init(|| {
        Collator::try_new(Default::default(), CollatorOptions::default())
            .expect("root collator")
    })
}

/// `a.localeCompare(b)` with no locale argument.
pub fn locale_compare(a: &str, b: &str) -> Ordering {
    collator().compare(a, b)
}

/// JS `a < b` order: UTF-16 code units.
pub fn code_unit_cmp(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn case_order() {
        assert_eq!(locale_compare("a", "B"), Ordering::Less);
        assert_eq!(locale_compare("AppShell", "Avatar"), Ordering::Less);
        assert_eq!(code_unit_cmp("B", "a"), Ordering::Less);
    }
}
