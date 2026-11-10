//! Small JS-exact helpers discover needs; most delegate to their owners.

use std::cmp::Ordering;

/// `isValidSemver` (owner: discovery).
pub fn is_valid_semver(s: &str) -> bool {
    crate::discovery::semver::is_valid_semver(s)
}

/// `semverCompare(a, b)` (owner: discovery).
pub fn semver_compare(a: &str, b: &str) -> f64 {
    crate::discovery::semver::semver_compare(a, b)
}

fn ord_num(o: Ordering) -> f64 {
    match o {
        Ordering::Less => -1.0,
        Ordering::Equal => 0.0,
        Ordering::Greater => 1.0,
    }
}

thread_local! {
    static NUMERIC: icu_collator::CollatorBorrowed<'static> = {
        let mut prefs = icu_collator::CollatorPreferences::default();
        prefs.numeric_ordering = Some(icu_collator::preferences::CollationNumericOrdering::True);
        icu_collator::Collator::try_new(prefs, Default::default()).unwrap()
    };
}

/// `a.localeCompare(b)` (owner: text).
pub fn locale_compare(a: &str, b: &str) -> Ordering {
    crate::text::collate::locale_compare(a, b)
}

/// `a.localeCompare(b, 'en', {numeric: true})`.
pub fn locale_compare_numeric(a: &str, b: &str) -> Ordering {
    NUMERIC.with(|c| c.compare(a, b))
}

/// `levenshteinDistance(a, b)` (owner: text).
pub fn levenshtein(a: &str, b: &str) -> usize {
    crate::text::levenshtein::levenshtein_distance(a, b)
}

/// JS `toLowerCase` (close enough: Unicode lowercase mapping).
pub fn lower(s: &str) -> String {
    s.to_lowercase()
}

/// `s.slice(0, n)` in UTF-16 code units.
pub fn slice16(s: &str, n: usize) -> String {
    let u: Vec<u16> = s.encode_utf16().take(n).collect();
    String::from_utf16_lossy(&u)
}

/// `s.length` in UTF-16 code units.
pub fn len16(s: &str) -> usize {
    s.encode_utf16().count()
}

/// A stable sort by a JS-style comparator returning a number.
pub fn js_sort_by<T>(v: &mut [T], mut f: impl FnMut(&T, &T) -> f64) {
    v.sort_by(|a, b| {
        let n = f(a, b);
        if n < 0.0 {
            Ordering::Less
        } else if n > 0.0 {
            Ordering::Greater
        } else {
            Ordering::Equal
        }
    });
}

pub fn ord_to_num(o: Ordering) -> f64 {
    ord_num(o)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn semver() {
        assert!(is_valid_semver("0.7.12"));
        assert!(is_valid_semver("1.0.0-canary.3+x"));
        assert!(!is_valid_semver("^1.0.0"));
        assert!(!is_valid_semver("1.0"));
        assert!(semver_compare("0.7.12", "0.7.2") > 0.0);
    }
    #[test]
    fn collate() {
        assert_eq!(locale_compare("a", "B"), Ordering::Less);
        assert_eq!(locale_compare_numeric("1.10.0", "1.9.0"), Ordering::Greater);
        assert_eq!(levenshtein("kitten", "sitting"), 3);
    }
}
