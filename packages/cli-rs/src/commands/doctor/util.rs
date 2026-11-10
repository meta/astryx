//! Small JS-semantics helpers doctor needs.
//! (Regex and JS-value helpers with no shared equivalent; collation is
//! discovery's.)


pub use crate::discovery::jsort::locale_compare;

/// A JS regular expression (regress), compiled once per call site.
#[macro_export]
macro_rules! doctor_re {
    ($pat:expr) => {{
        static RE: std::sync::OnceLock<regress::Regex> = std::sync::OnceLock::new();
        RE.get_or_init(|| regress::Regex::new($pat).expect("regex"))
    }};
    ($pat:expr, $flags:expr) => {{
        static RE: std::sync::OnceLock<regress::Regex> = std::sync::OnceLock::new();
        RE.get_or_init(|| regress::Regex::with_flags($pat, $flags).expect("regex"))
    }};
}

/// `re.test(s)`.
pub fn test(re: &regress::Regex, s: &str) -> bool {
    re.find(s).is_some()
}

/// Group `i` of a match as a str.
pub fn group<'t>(m: &regress::Match, text: &'t str, i: usize) -> Option<&'t str> {
    m.group(i).map(|r| &text[r])
}

/// `String(message).split('\n')[0].slice(0, n)` in UTF-16 units.
pub fn first_line(message: &str, n: usize) -> String {
    let line = message.split('\n').next().unwrap_or("");
    slice16(line, n)
}

/// `s.slice(0, n)` in UTF-16 code units.
pub fn slice16(s: &str, n: usize) -> String {
    let units: Vec<u16> = s.encode_utf16().take(n).collect();
    String::from_utf16_lossy(&units)
}

/// The 1-based line of a byte offset.
pub fn line_at(text: &str, at: usize) -> usize {
    text.as_bytes()[..at.min(text.len())].iter().filter(|&&b| b == b'\n').count() + 1
}

pub fn plural(count: usize, word: &str) -> String {
    format!("{count} {word}{}", if count == 1 { "" } else { "s" })
}

/// Regex helpers regress lacks: `s.replace(re, lit)` (first, or every match
/// with `g`), and `s.split(re)`.
pub trait JsRe {
    fn replace_all(&self, text: &str, with: &str) -> String;
    fn replace(&self, text: &str, with: &str) -> String;
    fn split<'t>(&self, text: &'t str) -> Vec<&'t str>;
}

impl JsRe for regress::Regex {
    fn replace_all(&self, text: &str, with: &str) -> String {
        let mut out = String::new();
        let mut last = 0;
        for m in self.find_iter(text) {
            out.push_str(&text[last..m.start()]);
            out.push_str(with);
            last = m.end();
        }
        out.push_str(&text[last..]);
        out
    }
    fn replace(&self, text: &str, with: &str) -> String {
        match self.find(text) {
            Some(m) => format!("{}{}{}", &text[..m.start()], with, &text[m.end()..]),
            None => text.to_string(),
        }
    }
    fn split<'t>(&self, text: &'t str) -> Vec<&'t str> {
        let mut out = Vec::new();
        let mut last = 0;
        for m in self.find_iter(text) {
            if m.end() == m.start() {
                continue;
            }
            out.push(&text[last..m.start()]);
            last = m.end();
        }
        out.push(&text[last..]);
        out
    }
}

/// `new Date(ms).toISOString()`.
pub fn iso_string(ms: f64) -> String {
    let ms = ms.floor() as i64;
    let days = ms.div_euclid(86_400_000);
    let rem = ms.rem_euclid(86_400_000);
    // Civil from days (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        y,
        m,
        d,
        rem / 3_600_000,
        rem / 60_000 % 60,
        rem / 1000 % 60,
        rem % 1000
    )
}

/// `undefined` or `null`, including the loader's `{"__js": "undefined"}`.
pub fn nullish(v: Option<&crate::json::Value>) -> bool {
    match v {
        None | Some(crate::json::Value::Null) => true,
        Some(crate::json::Value::Object(m)) => m.len() == 1 && m.get("__js").and_then(|x| x.as_str()) == Some("undefined"),
        _ => false,
    }
}

/// JS truthiness, with the loader's `undefined` marker falsy.
pub fn truthy(v: Option<&crate::json::Value>) -> bool {
    !nullish(v) && crate::discovery::paths::js_truthy(v)
}
