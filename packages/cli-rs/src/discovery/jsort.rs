//! JavaScript ordering: `Array#sort()` default order (UTF-16 code units) and
//! `String#localeCompare` (ICU root collation, as Node's full-ICU build).

use std::cmp::Ordering;

/// Compare as JS `<` compares strings: by UTF-16 code units.
pub fn cmp_utf16(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

/// `array.sort()` on strings (stable, UTF-16 order).
pub fn sort_strings(v: &mut [String]) {
    v.sort_by(|a, b| cmp_utf16(a, b));
}

thread_local! {
    static COLLATOR: icu_collator::CollatorBorrowed<'static> =
        icu_collator::Collator::try_new(Default::default(), Default::default())
            .expect("root collator");
}

/// `a.localeCompare(b)` with the default (root) locale and options.
pub fn locale_compare(a: &str, b: &str) -> Ordering {
    COLLATOR.with(|c| c.compare(a, b))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn orders() {
        assert_eq!(locale_compare("a", "B"), Ordering::Less);
        assert_eq!(locale_compare("Button", "button"), Ordering::Greater);
        assert_eq!(cmp_utf16("B", "a"), Ordering::Less);
        assert_eq!(cmp_utf16("\u{ff61}", "\u{1f600}"), Ordering::Greater);
    }
}
