//! Port of `foundation/text/levenshtein.mjs`. Works on UTF-16 code units, as
//! the JS indexes strings.

/// `levenshteinDistance(a, b)`: full distance, or 999 when the lengths differ
/// by more than five.
pub fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a: Vec<u16> = a.encode_utf16().collect();
    let b: Vec<u16> = b.encode_utf16().collect();
    let (m, n) = (a.len(), b.len());
    if m.abs_diff(n) > 5 {
        return 999;
    }
    let mut prev: Vec<usize> = (0..=n).collect();
    let mut cur = vec![0usize; n + 1];
    for i in 1..=m {
        cur[0] = i;
        for j in 1..=n {
            cur[j] = if a[i - 1] == b[j - 1] {
                prev[j - 1]
            } else {
                1 + prev[j].min(cur[j - 1]).min(prev[j - 1])
            };
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[n]
}

/// `levenshteinDistance(a, b, max, {swaps})`: the distance, capped at max + 1.
pub fn levenshtein_within(a: &str, b: &str, max: usize, swaps: bool) -> usize {
    let a: Vec<u16> = a.encode_utf16().collect();
    let b: Vec<u16> = b.encode_utf16().collect();
    let over = max + 1;
    if a.len().abs_diff(b.len()) > max {
        return over;
    }
    let mut before = vec![over; b.len() + 1];
    let mut previous = vec![over; b.len() + 1];
    let mut current = vec![over; b.len() + 1];
    for j in 0..=b.len().min(max) {
        previous[j] = j;
    }
    for i in 1..=a.len() {
        current.iter_mut().for_each(|v| *v = over);
        let from = 1usize.max(i.saturating_sub(max));
        let to = b.len().min(i + max);
        if i <= max {
            current[0] = i;
        }
        let mut row_min = current[0];
        for j in from..=to {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            let mut value = (previous[j - 1] + cost)
                .min(previous[j] + 1)
                .min(current[j - 1] + 1)
                .min(over);
            if swaps && i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                value = value.min(before[j - 2] + 1);
            }
            current[j] = value;
            if value < row_min {
                row_min = value;
            }
        }
        if row_min >= over {
            return over;
        }
        let t = before;
        before = previous;
        previous = current;
        current = t;
    }
    previous[b.len()].min(over)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn distances() {
        assert_eq!(levenshtein_distance("buton", "button"), 1);
        assert_eq!(levenshtein_distance("a", "abcdefgh"), 999);
        assert_eq!(levenshtein_within("abcd", "abdc", 2, true), 1);
        assert_eq!(levenshtein_within("abcd", "abdc", 2, false), 2);
    }
}
