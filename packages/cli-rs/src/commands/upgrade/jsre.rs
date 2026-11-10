//! JavaScript regular expressions (via `regress`) with `String#replace`,
//! `test` and `match` semantics.

use std::cell::RefCell;
use std::collections::HashMap;

thread_local! {
    static CACHE: RefCell<HashMap<(String, String), std::rc::Rc<regress::Regex>>> = RefCell::new(HashMap::new());
}

pub fn re(pattern: &str, flags: &str) -> std::rc::Rc<regress::Regex> {
    let f: String = flags.chars().filter(|c| *c != 'g' && *c != 'y').collect();
    CACHE.with(|c| {
        let key = (pattern.to_string(), f.clone());
        if let Some(r) = c.borrow().get(&key) {
            return r.clone();
        }
        let r = std::rc::Rc::new(regress::Regex::with_flags(pattern, f.as_str()).unwrap_or_else(|e| panic!("bad regex {}: {}", pattern, e)));
        c.borrow_mut().insert(key, r.clone());
        r
    })
}

pub fn test(pattern: &str, flags: &str, s: &str) -> bool {
    re(pattern, flags).find(s).is_some()
}

/// Groups of the first match: index 0 is the whole match.
pub fn captures(pattern: &str, flags: &str, s: &str) -> Option<Vec<Option<String>>> {
    let r = re(pattern, flags);
    let m = r.find(s)?;
    Some(m.groups().map(|g| g.map(|rg| s[rg].to_string())).collect())
}

/// All matches (global), each as its groups.
pub fn captures_all(pattern: &str, flags: &str, s: &str) -> Vec<Vec<Option<String>>> {
    let r = re(pattern, flags);
    r.find_iter(s).map(|m| m.groups().map(|g| g.map(|rg| s[rg].to_string())).collect()).collect()
}

/// `s.replace(re, fn)`; `global` replaces every match.
pub fn replace_fn(pattern: &str, flags: &str, s: &str, mut f: impl FnMut(&[Option<&str>]) -> String) -> String {
    let r = re(pattern, flags);
    let global = flags.contains('g');
    let mut out = String::new();
    let mut last = 0;
    for m in r.find_iter(s) {
        let range = m.range();
        let groups: Vec<Option<&str>> = m.groups().map(|g| g.map(|rg| &s[rg])).collect();
        out.push_str(&s[last..range.start]);
        out.push_str(&f(&groups));
        last = range.end;
        if !global {
            break;
        }
    }
    out.push_str(&s[last..]);
    out
}

/// `s.replace(re, replacement)` with `$1`/`$&` patterns.
pub fn replace(pattern: &str, flags: &str, s: &str, replacement: &str) -> String {
    replace_fn(pattern, flags, s, |g| expand(replacement, g))
}

fn expand(rep: &str, g: &[Option<&str>]) -> String {
    let b = rep.as_bytes();
    let mut out = String::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'$' && i + 1 < b.len() {
            let c = b[i + 1];
            if c == b'$' {
                out.push('$');
                i += 2;
                continue;
            }
            if c == b'&' {
                out.push_str(g[0].unwrap_or(""));
                i += 2;
                continue;
            }
            if c.is_ascii_digit() {
                let mut n = (c - b'0') as usize;
                let mut len = 2;
                if i + 2 < b.len() && b[i + 2].is_ascii_digit() {
                    let n2 = n * 10 + (b[i + 2] - b'0') as usize;
                    if n2 < g.len() {
                        n = n2;
                        len = 3;
                    }
                }
                if n > 0 && n < g.len() {
                    out.push_str(g[n].unwrap_or(""));
                    i += len;
                    continue;
                }
            }
        }
        let ch = rep[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// Escape a string for a RegExp source (`s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`).
pub fn escape(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        if ".*+?^${}()|[]\\".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}
