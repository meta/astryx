//! `foundation/env/semver.mjs` pieces the integration writers use.

/// `isValidSemver`: `^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$`.
pub fn is_valid(v: &str) -> bool {
    let (core, rest) = match v.find(|c| c == '-' || c == '+') {
        Some(i) => (&v[..i], &v[i..]),
        None => (v, ""),
    };
    let parts: Vec<&str> = core.split('.').collect();
    if parts.len() != 3 || !parts.iter().all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit())) {
        return false;
    }
    let ok = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-');
    if rest.is_empty() {
        return true;
    }
    if let Some(r) = rest.strip_prefix('-') {
        return match r.find('+') {
            Some(i) => ok(&r[..i]) && ok(&r[i + 1..]),
            None => ok(r),
        };
    }
    if let Some(r) = rest.strip_prefix('+') {
        return ok(r);
    }
    false
}

/// `semverCompare(a, b)` for well-formed input (prerelease stripped).
pub fn compare(a: &str, b: &str) -> std::cmp::Ordering {
    let pa: Vec<f64> = a.split('-').next().unwrap_or("").split('.').map(|x| x.parse::<f64>().unwrap_or(f64::NAN)).collect();
    let pb: Vec<f64> = b.split('-').next().unwrap_or("").split('.').map(|x| x.parse::<f64>().unwrap_or(f64::NAN)).collect();
    for i in 0..pa.len().max(pb.len()) {
        let na = pa.get(i).copied().unwrap_or(0.0);
        let nb = pb.get(i).copied().unwrap_or(0.0);
        if na.is_nan() || nb.is_nan() {
            return a.cmp(b);
        }
        if na != nb {
            return na.partial_cmp(&nb).unwrap();
        }
    }
    std::cmp::Ordering::Equal
}
