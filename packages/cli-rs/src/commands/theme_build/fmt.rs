//! `Number#toFixed`.

/// `x.toFixed(digits)` for finite `x` below 1e21 in magnitude.
pub fn to_fixed(x: f64, digits: usize) -> String {
    if !x.is_finite() || x.abs() >= 1e21 {
        return crate::json::js_number_to_string(x);
    }
    let neg = x < 0.0;
    // The exact decimal value of the double; ties round up, as the spec's
    // "pick the larger n" does.
    let exact = format!("{:.1100}", x.abs());
    let (int_part, frac_part) = exact.split_once('.').unwrap();
    let mut d: Vec<u8> = int_part.bytes().chain(frac_part.bytes().take(digits)).map(|b| b - b'0').collect();
    let next = frac_part.as_bytes().get(digits).map(|b| b - b'0').unwrap_or(0);
    if next >= 5 {
        let mut i = d.len();
        loop {
            if i == 0 {
                d.insert(0, 1);
                break;
            }
            i -= 1;
            if d[i] == 9 {
                d[i] = 0;
            } else {
                d[i] += 1;
                break;
            }
        }
    }
    let int_len = d.len() - digits;
    let mut s: String = d[..int_len].iter().map(|v| (v + b'0') as char).collect();
    if digits > 0 {
        s.push('.');
        s.extend(d[int_len..].iter().map(|v| (v + b'0') as char));
    }
    if neg {
        format!("-{s}")
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn rounds_like_js() {
        assert_eq!(super::to_fixed(0.25, 1), "0.3");
        assert_eq!(super::to_fixed(1.9453125, 1), "1.9");
        assert_eq!(super::to_fixed(0.05, 1), "0.1");
        assert_eq!(super::to_fixed(9.96, 1), "10.0");
    }
}
