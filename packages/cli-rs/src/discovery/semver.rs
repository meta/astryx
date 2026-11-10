//! Port of `foundation/env/semver.mjs`: the small semver subset the CLI uses.

use std::cmp::Ordering;

/// `isValidSemver`.
pub fn is_valid_semver(v: &str) -> bool {
    let re = regress::Regex::new(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$").unwrap();
    re.find(v).is_some()
}

/// JS `Number(string)`.
pub fn js_number(s: &str) -> f64 {
    let t = s.trim_matches(super::paths::js_ws);
    if t.is_empty() {
        return 0.0;
    }
    if let Some(h) = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")) {
        return i64::from_str_radix(h, 16).map(|v| v as f64).unwrap_or(f64::NAN);
    }
    if let Some(b) = t.strip_prefix("0b").or_else(|| t.strip_prefix("0B")) {
        return i64::from_str_radix(b, 2).map(|v| v as f64).unwrap_or(f64::NAN);
    }
    if let Some(o) = t.strip_prefix("0o").or_else(|| t.strip_prefix("0O")) {
        return i64::from_str_radix(o, 8).map(|v| v as f64).unwrap_or(f64::NAN);
    }
    match t {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    let ok = t.chars().all(|c| c.is_ascii_digit() || matches!(c, '.' | 'e' | 'E' | '+' | '-'));
    if !ok || t.contains("inf") {
        return f64::NAN;
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

/// JS `parseInt(s, 10)`.
pub fn js_parse_int(s: &str) -> f64 {
    let t = s.trim_start_matches(super::paths::js_ws);
    let (neg, rest) = match t.as_bytes().first() {
        Some(b'-') => (true, &t[1..]),
        Some(b'+') => (false, &t[1..]),
        _ => (false, t),
    };
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return f64::NAN;
    }
    let v = digits.parse::<f64>().unwrap_or(f64::NAN);
    if neg {
        -v
    } else {
        v
    }
}

/// `semverCompare(a, b)`, as a number's sign.
pub fn semver_compare(a: &str, b: &str) -> f64 {
    let pa: Vec<f64> = a.split('-').next().unwrap().split('.').map(js_number).collect();
    let pb: Vec<f64> = b.split('-').next().unwrap().split('.').map(js_number).collect();
    for i in 0..pa.len().max(pb.len()) {
        let na = *pa.get(i).unwrap_or(&0.0);
        let nb = *pb.get(i).unwrap_or(&0.0);
        if na.is_nan() || nb.is_nan() {
            // localeCompare; ASCII version strings order as code units do
            // except for case and punctuation weights, which ICU orders
            // differently. Approximated by a case-insensitive compare first.
            return match crate::discovery::jsort::locale_compare(a, b) {
                Ordering::Less => -1.0,
                Ordering::Equal => 0.0,
                Ordering::Greater => 1.0,
            };
        }
        if na != nb {
            return na - nb;
        }
    }
    0.0
}

/// `semverGte`.
pub fn semver_gte(a: &str, b: &str) -> bool {
    semver_compare(a, b) >= 0.0
}
/// `semverGt`.
pub fn semver_gt(a: &str, b: &str) -> bool {
    semver_compare(a, b) > 0.0
}

struct Parts {
    major: f64,
    minor: f64,
    patch: f64,
    count: usize,
}

fn parse_version_parts(value: &str) -> Parts {
    let t = value.trim_matches(super::paths::js_ws);
    let t = t.trim_start_matches(['v', '=']);
    let core = t.split(['-', '+']).next().unwrap();
    let nums: Vec<f64> = core.split('.').map(js_parse_int).collect();
    let fin = |i: usize| nums.get(i).copied().filter(|n| n.is_finite()).unwrap_or(0.0);
    Parts {
        major: fin(0),
        minor: fin(1),
        patch: fin(2),
        count: nums.iter().filter(|n| n.is_finite()).count(),
    }
}

fn n(f: f64) -> String {
    crate::json::js_number_to_string(f)
}

fn satisfies_comparator(version: &str, token: &str) -> bool {
    let tok = token.trim_matches(super::paths::js_ws);
    let (op, rest) = ["^", "~", ">=", "<=", ">", "<", "="]
        .iter()
        .find_map(|o| tok.strip_prefix(o).map(|r| (*o, r)))
        .unwrap_or(("=", tok));
    let target = rest.trim_matches(super::paths::js_ws);
    if target.is_empty() || target == "*" || target.to_lowercase() == "x" {
        return true;
    }
    let t = parse_version_parts(target);
    if t.count == 0 {
        return true;
    }
    let cmp = semver_compare(version, &format!("{}.{}.{}", n(t.major), n(t.minor), n(t.patch)));
    let below = |upper: String| cmp >= 0.0 && semver_compare(version, &upper) < 0.0;
    match op {
        ">=" => cmp >= 0.0,
        ">" => cmp > 0.0,
        "<=" => cmp <= 0.0,
        "<" => cmp < 0.0,
        "^" => {
            if t.major > 0.0 || t.count == 1 {
                below(format!("{}.0.0", n(t.major + 1.0)))
            } else if t.minor > 0.0 || t.count == 2 {
                below(format!("0.{}.0", n(t.minor + 1.0)))
            } else {
                below(format!("0.0.{}", n(t.patch + 1.0)))
            }
        }
        "~" => below(if t.count >= 2 {
            format!("{}.{}.0", n(t.major), n(t.minor + 1.0))
        } else {
            format!("{}.0.0", n(t.major + 1.0))
        }),
        _ => {
            if t.count >= 3 {
                cmp == 0.0
            } else {
                below(if t.count == 2 {
                    format!("{}.{}.0", n(t.major), n(t.minor + 1.0))
                } else {
                    format!("{}.0.0", n(t.major + 1.0))
                })
            }
        }
    }
}

/// `satisfiesRange(version, range)`.
pub fn satisfies_range(version: &str, range: &str) -> bool {
    if !is_valid_semver(version) {
        return true;
    }
    let r = range.trim_matches(super::paths::js_ws);
    let rl = r.to_lowercase();
    if r.is_empty() || r == "*" || rl == "x" || rl == "latest" {
        return true;
    }
    let hy = regress::Regex::new(r"^(\S+)\s+-\s+(\S+)$").unwrap();
    r.split("||").any(|union| {
        let u = union.trim_matches(super::paths::js_ws);
        let normalized = match hy.find(u) {
            Some(m) => {
                let low = &u[m.group(1).unwrap()];
                let high = &u[m.group(2).unwrap()];
                let h = parse_version_parts(high);
                if h.count == 0 {
                    format!(">={low}")
                } else if h.count >= 3 {
                    format!(">={low} <={high}")
                } else {
                    let next = if h.count == 2 {
                        format!("{}.{}.0", n(h.major), n(h.minor + 1.0))
                    } else {
                        format!("{}.0.0", n(h.major + 1.0))
                    };
                    format!(">={low} <{next}")
                }
            }
            None => u.to_string(),
        };
        let tokens: Vec<&str> = normalized.split(super::paths::js_ws).filter(|s| !s.is_empty()).collect();
        tokens.is_empty() || tokens.iter().all(|t| satisfies_comparator(version, t))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ranges() {
        assert!(satisfies_range("0.7.12", "^0.7.0"));
        assert!(!satisfies_range("0.8.0", "^0.7.0"));
        assert!(satisfies_range("1.5.0", "1.0.0 - 2"));
        assert!(satisfies_range("1.2.3", "workspace:*"));
        assert!(semver_compare("0.10.0", "0.9.9") > 0.0);
        assert!(is_valid_semver("1.2.3-rc.1+b"));
    }
}
