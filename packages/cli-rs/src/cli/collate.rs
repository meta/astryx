//! `String#localeCompare` for the short ASCII names the shell sorts
//! (command names, flags). TEMP: an ICU-root approximation for ASCII:
//! punctuation, then digits, then letters case-insensitively; lowercase
//! first on a tie.

use std::cmp::Ordering;

fn primary(c: char) -> (u8, u32) {
    if c.is_ascii_digit() {
        (1, c as u32)
    } else if c.is_ascii_alphabetic() {
        (2, c.to_ascii_lowercase() as u32)
    } else if c.is_ascii() {
        (0, c as u32)
    } else {
        (3, c as u32)
    }
}

pub fn locale_compare(a: &str, b: &str) -> Ordering {
    let pa: Vec<(u8, u32)> = a.chars().map(primary).collect();
    let pb: Vec<(u8, u32)> = b.chars().map(primary).collect();
    match pa.cmp(&pb) {
        Ordering::Equal => {}
        o => return o,
    }
    // Tertiary: lowercase before uppercase.
    let ta: Vec<bool> = a.chars().map(|c| c.is_ascii_uppercase()).collect();
    let tb: Vec<bool> = b.chars().map(|c| c.is_ascii_uppercase()).collect();
    ta.cmp(&tb)
}
