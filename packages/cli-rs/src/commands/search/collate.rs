//! `String#localeCompare` with ICU root collation, as Node's default locale
//! sorts.

use std::cmp::Ordering;

thread_local! {
    static COLLATOR: icu_collator::CollatorBorrowed<'static> =
        icu_collator::Collator::try_new(Default::default(), Default::default()).expect("root collator");
}

pub fn compare(a: &str, b: &str) -> Ordering {
    if a == b {
        return Ordering::Equal;
    }
    COLLATOR.with(|c| c.compare(a, b))
}
