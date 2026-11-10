//! The JavaScript semantics build's scoring depends on: regular expressions
//! (through `regress`, the JS regex engine), `String#split` with a regex,
//! `Math.round`, `Math.log`/`Math.exp` (fdlibm, as V8), UTF-16 lengths and
//! slices, and `String#localeCompare`.

use std::cmp::Ordering;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

pub use regress::Regex;

/// A compiled regex, cached by pattern and flags (flags never include `g`;
/// global behavior is the caller's loop).
pub fn re(pattern: &str, flags: &str) -> &'static Regex {
    static CACHE: OnceLock<Mutex<HashMap<(String, String), &'static Regex>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut map = cache.lock().unwrap();
    let key = (pattern.to_string(), flags.to_string());
    if let Some(r) = map.get(&key) {
        return r;
    }
    let r: &'static Regex = Box::leak(Box::new(
        Regex::with_flags(pattern, flags).unwrap_or_else(|e| panic!("bad regex {pattern}: {e}")),
    ));
    map.insert(key, r);
    r
}

/// `s.split(regex)` for a regex with no capture groups that never matches
/// the empty string.
pub fn split(s: &str, r: &Regex) -> Vec<String> {
    let mut out = Vec::new();
    let mut last = 0;
    for m in r.find_iter(s) {
        if m.end() == m.start() {
            continue;
        }
        out.push(s[last..m.start()].to_string());
        last = m.end();
    }
    out.push(s[last..].to_string());
    out
}

/// The first piece of `s.split(regex)`.
pub fn split_first(s: &str, r: &Regex) -> String {
    match r.find_iter(s).find(|m| m.end() > m.start()) {
        Some(m) => s[..m.start()].to_string(),
        None => s.to_string(),
    }
}

/// `s.search(regex)` as a byte offset (callers slice with the same unit).
pub fn search(s: &str, r: &Regex) -> Option<usize> {
    r.find(s).map(|m| m.start())
}

/// `r.test(s)`.
pub fn test(s: &str, r: &Regex) -> bool {
    r.find(s).is_some()
}

/// `String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []` on an
/// already-lowercased string: maximal runs of ASCII lowercase letters and digits.
pub fn alnum_runs(lower: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for c in lower.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            cur.push(c);
        } else if !cur.is_empty() {
            out.push(std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// `String#toLowerCase`.
pub fn lower(s: &str) -> String {
    s.to_lowercase()
}

/// `Math.round`.
pub fn round(x: f64) -> f64 {
    if !x.is_finite() {
        return x;
    }
    let f = x.floor();
    let r = if x - f >= 0.5 { f + 1.0 } else { f };
    if r == 0.0 && (x < 0.0 || (x == 0.0 && x.is_sign_negative())) {
        -0.0
    } else {
        r
    }
}

/// `Math.log`, bit-exact with the reference Node.
pub fn ln(x: f64) -> f64 {
    crate::js::jsmath::log(x)
}

/// `Math.exp`.
pub fn exp(x: f64) -> f64 {
    crate::js::jsmath::exp(x)
}

/// `Math.sqrt`.
pub fn sqrt(x: f64) -> f64 {
    x.sqrt()
}

/// UTF-16 length.
pub fn len16(s: &str) -> usize {
    s.encode_utf16().count()
}

/// `s.slice(a, b)` in UTF-16 code units (lone surrogates become U+FFFD).
pub fn slice16(s: &str, a: usize, b: usize) -> String {
    let u: Vec<u16> = s.encode_utf16().collect();
    let b = b.min(u.len());
    let a = a.min(b);
    String::from_utf16_lossy(&u[a..b])
}

/// `a < b` on UTF-16 code units, as an ordering.
pub fn cmp16(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

/// `a.localeCompare(b)` (ICU root collation).
pub fn locale_compare(a: &str, b: &str) -> Ordering {
    let simple = |s: &str| s.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-');
    // For lowercase letters, digits and hyphens, root collation orders by
    // primary weight, and those weights follow ASCII order.
    if simple(a) && simple(b) {
        return a.cmp(b);
    }
    collator().compare(a, b)
}

fn collator() -> &'static icu_collator::CollatorBorrowed<'static> {
    static C: OnceLock<icu_collator::CollatorBorrowed<'static>> = OnceLock::new();
    C.get_or_init(|| {
        icu_collator::Collator::try_new(Default::default(), Default::default())
            .expect("root collator")
    })
}

/// `x - y` as a sort key, as a JS comparator reads it (NaN counts as equal).
pub fn num_cmp(d: f64) -> Ordering {
    if d < 0.0 {
        Ordering::Less
    } else if d > 0.0 {
        Ordering::Greater
    } else {
        Ordering::Equal
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rounding() {
        assert_eq!(round(0.49999999999999994), 0.0);
        assert_eq!(round(2.5), 3.0);
        assert_eq!(round(-2.5), -2.0);
    }
    #[test]
    fn splits() {
        let r = re(r"[^a-z0-9\s-]+|\s(?:and|or)\s", "");
        assert_eq!(split("a, b and c", r), vec!["a", " b", "c"]);
    }
    #[test]
    fn collate() {
        assert_eq!(locale_compare("a", "B"), Ordering::Less);
        assert_eq!(locale_compare("dash-b", "dash"), Ordering::Greater);
    }
}
