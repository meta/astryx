//! `Date.parse` as V8 parses a string: the ES5 date-time format first, then
//! its legacy (Safari-compatible) grammar. Port of V8's `DateParser`
//! (dateparser.h, dateparser-inl.h, dateparser.cc). A time with no zone is
//! local time; the clone reads it as UTC, as the suite pins `TZ=UTC`.

const NONE: i64 = i64::MAX;
const MAX_SIGNIFICANT_DIGITS: usize = 9;

#[derive(Clone, Copy, PartialEq, Debug)]
enum Kw {
    Invalid,
    MonthName,
    TimeZoneName,
    TimeSeparator,
    AmPm,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Tok {
    End,
    Invalid,
    Number { n: i64, len: usize },
    Symbol(char),
    WhiteSpace,
    Unknown,
    Keyword { kind: Kw, value: i64, len: usize },
}

impl Tok {
    fn is_number(&self) -> bool {
        matches!(self, Tok::Number { .. })
    }
    fn number(&self) -> i64 {
        match self {
            Tok::Number { n, .. } => *n,
            _ => 0,
        }
    }
    fn is_fixed(&self, l: usize) -> bool {
        matches!(self, Tok::Number { len, .. } if *len == l)
    }
    fn is_symbol(&self, c: char) -> bool {
        *self == Tok::Symbol(c)
    }
    fn is_sign(&self) -> bool {
        self.is_symbol('+') || self.is_symbol('-')
    }
    fn sign(&self) -> i64 {
        if self.is_symbol('-') {
            -1
        } else {
            1
        }
    }
    fn is_keyword_type(&self, k: Kw) -> bool {
        matches!(self, Tok::Keyword { kind, .. } if *kind == k)
    }
    fn is_keyword_z(&self) -> bool {
        matches!(self, Tok::Keyword { kind: Kw::TimeZoneName, value: 0, len: 1 })
    }
}

const KEYWORDS: &[([u32; 3], Kw, i64)] = &[
    ([b'j' as u32, b'a' as u32, b'n' as u32], Kw::MonthName, 1),
    ([b'f' as u32, b'e' as u32, b'b' as u32], Kw::MonthName, 2),
    ([b'm' as u32, b'a' as u32, b'r' as u32], Kw::MonthName, 3),
    ([b'a' as u32, b'p' as u32, b'r' as u32], Kw::MonthName, 4),
    ([b'm' as u32, b'a' as u32, b'y' as u32], Kw::MonthName, 5),
    ([b'j' as u32, b'u' as u32, b'n' as u32], Kw::MonthName, 6),
    ([b'j' as u32, b'u' as u32, b'l' as u32], Kw::MonthName, 7),
    ([b'a' as u32, b'u' as u32, b'g' as u32], Kw::MonthName, 8),
    ([b's' as u32, b'e' as u32, b'p' as u32], Kw::MonthName, 9),
    ([b'o' as u32, b'c' as u32, b't' as u32], Kw::MonthName, 10),
    ([b'n' as u32, b'o' as u32, b'v' as u32], Kw::MonthName, 11),
    ([b'd' as u32, b'e' as u32, b'c' as u32], Kw::MonthName, 12),
    ([b'a' as u32, b'm' as u32, 0], Kw::AmPm, 0),
    ([b'p' as u32, b'm' as u32, 0], Kw::AmPm, 12),
    ([b'u' as u32, b't' as u32, 0], Kw::TimeZoneName, 0),
    ([b'u' as u32, b't' as u32, b'c' as u32], Kw::TimeZoneName, 0),
    ([b'z' as u32, 0, 0], Kw::TimeZoneName, 0),
    ([b'g' as u32, b'm' as u32, b't' as u32], Kw::TimeZoneName, 0),
    ([b'c' as u32, b'd' as u32, b't' as u32], Kw::TimeZoneName, -5),
    ([b'c' as u32, b's' as u32, b't' as u32], Kw::TimeZoneName, -6),
    ([b'e' as u32, b'd' as u32, b't' as u32], Kw::TimeZoneName, -4),
    ([b'e' as u32, b's' as u32, b't' as u32], Kw::TimeZoneName, -5),
    ([b'm' as u32, b'd' as u32, b't' as u32], Kw::TimeZoneName, -6),
    ([b'm' as u32, b's' as u32, b't' as u32], Kw::TimeZoneName, -7),
    ([b'p' as u32, b'd' as u32, b't' as u32], Kw::TimeZoneName, -7),
    ([b'p' as u32, b's' as u32, b't' as u32], Kw::TimeZoneName, -8),
    ([b't' as u32, 0, 0], Kw::TimeSeparator, 0),
];

fn lookup(pre: &[u32; 3], len: usize) -> (Kw, i64) {
    for (word, kind, value) in KEYWORDS {
        if word == pre && (len <= 3 || *kind == Kw::MonthName) {
            return (*kind, *value);
        }
    }
    (Kw::Invalid, 0)
}

/// JS white space and line terminators.
fn is_ws(c: u32) -> bool {
    matches!(c, 0x09 | 0x0A | 0x0B | 0x0C | 0x0D | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
}

struct Scanner {
    s: Vec<u32>,
    pos: usize,
    next: Tok,
}

impl Scanner {
    fn new(text: &str) -> Scanner {
        let mut sc = Scanner { s: text.encode_utf16().map(u32::from).collect(), pos: 0, next: Tok::End };
        sc.next = sc.scan();
        sc
    }
    fn ch(&self) -> u32 {
        self.s.get(self.pos).copied().unwrap_or(0)
    }
    fn at_end(&self) -> bool {
        self.pos >= self.s.len()
    }
    fn is_digit(&self) -> bool {
        !self.at_end() && (b'0' as u32..=b'9' as u32).contains(&self.ch())
    }
    fn alpha_or_above(&self) -> bool {
        !self.at_end() && self.ch() >= b'A' as u32
    }
    fn scan(&mut self) -> Tok {
        let pre = self.pos;
        if self.at_end() {
            return Tok::End;
        }
        if self.is_digit() {
            let mut n: i64 = 0;
            let mut i = 0;
            while self.ch() == b'0' as u32 {
                self.pos += 1;
            }
            while self.is_digit() {
                if i < MAX_SIGNIFICANT_DIGITS {
                    n = n * 10 + (self.ch() - b'0' as u32) as i64;
                }
                i += 1;
                self.pos += 1;
            }
            return Tok::Number { n, len: self.pos - pre };
        }
        for c in [':', '-', '+', '.', ')'] {
            if self.ch() == c as u32 {
                self.pos += 1;
                return Tok::Symbol(c);
            }
        }
        if self.alpha_or_above() && !is_ws(self.ch()) {
            let mut buf = [0u32; 3];
            let mut len = 0;
            while self.alpha_or_above() && !is_ws(self.ch()) {
                if len < 3 {
                    buf[len] = self.ch() | 0x20;
                }
                len += 1;
                self.pos += 1;
            }
            let (kind, value) = lookup(&buf, len);
            return Tok::Keyword { kind, value, len };
        }
        if !self.at_end() && is_ws(self.ch()) {
            while !self.at_end() && is_ws(self.ch()) {
                self.pos += 1;
            }
            return Tok::WhiteSpace;
        }
        if self.ch() == b'(' as u32 {
            let mut balance = 0;
            loop {
                if self.ch() == b')' as u32 {
                    balance -= 1;
                } else if self.ch() == b'(' as u32 {
                    balance += 1;
                }
                self.pos += 1;
                if !(balance > 0 && !self.at_end() && self.ch() != 0) {
                    break;
                }
            }
            return Tok::Unknown;
        }
        self.pos += 1;
        Tok::Unknown
    }
    fn peek(&self) -> Tok {
        self.next
    }
    fn next(&mut self) -> Tok {
        let t = self.next;
        self.next = self.scan();
        t
    }
    fn skip_symbol(&mut self, c: char) -> bool {
        if self.next.is_symbol(c) {
            self.next();
            true
        } else {
            false
        }
    }
}

fn between(x: i64, lo: i64, hi: i64) -> bool {
    lo <= x && x <= hi
}
fn is_month(x: i64) -> bool {
    between(x, 1, 12)
}
fn is_day(x: i64) -> bool {
    between(x, 1, 31)
}
fn is_minute(x: i64) -> bool {
    between(x, 0, 59)
}
fn is_hour(x: i64) -> bool {
    between(x, 0, 23)
}

#[derive(Default)]
struct Day {
    comp: Vec<i64>,
    named_month: Option<i64>,
    iso: bool,
}

impl Day {
    fn add(&mut self, n: i64) -> bool {
        if self.comp.len() == 3 {
            return false;
        }
        self.comp.push(n);
        true
    }
    fn write(&mut self) -> Option<(i64, i64, i64)> {
        if self.comp.is_empty() {
            return None;
        }
        while self.comp.len() < 3 {
            self.comp.push(1);
        }
        let c = &self.comp;
        let (mut year, month, day);
        match self.named_month {
            None => {
                if self.iso || !is_day(c[0]) {
                    (year, month, day) = (c[0], c[1], c[2]);
                } else {
                    (month, day, year) = (c[0], c[1], c[2]);
                }
            }
            Some(m) => {
                month = m;
                if !is_day(c[0]) {
                    (year, day) = (c[0], c[1]);
                } else {
                    (day, year) = (c[0], c[1]);
                }
            }
        }
        if !self.iso {
            if between(year, 0, 49) {
                year += 2000;
            } else if between(year, 50, 99) {
                year += 1900;
            }
        }
        if !between(year, -(1 << 30), (1 << 30) - 1) || !is_month(month) || !is_day(day) {
            return None;
        }
        Some((year, month - 1, day))
    }
}

#[derive(Default)]
struct Time {
    comp: Vec<i64>,
    hour_offset: Option<i64>,
}

impl Time {
    fn is_empty(&self) -> bool {
        self.comp.is_empty()
    }
    fn is_expecting(&self, n: i64) -> bool {
        let i = self.comp.len();
        (i == 1 && is_minute(n)) || (i == 2 && is_minute(n)) || (i == 3 && between(n, 0, 999))
    }
    fn add(&mut self, n: i64) -> bool {
        if self.comp.len() < 4 {
            self.comp.push(n);
            true
        } else {
            false
        }
    }
    fn add_final(&mut self, n: i64) -> bool {
        if !self.add(n) {
            return false;
        }
        while self.comp.len() < 4 {
            self.comp.push(0);
        }
        true
    }
    fn write(&mut self) -> Option<(i64, i64, i64, i64)> {
        while self.comp.len() < 4 {
            self.comp.push(0);
        }
        let (mut h, m, s, ms) = (self.comp[0], self.comp[1], self.comp[2], self.comp[3]);
        if let Some(off) = self.hour_offset {
            if !between(h, 0, 12) {
                return None;
            }
            h %= 12;
            h += off;
        }
        if !(is_hour(h) && is_minute(m) && is_minute(s) && between(ms, 0, 999)) && (h != 24 || m != 0 || s != 0 || ms != 0) {
            return None;
        }
        Some((h, m, s, ms))
    }
}

struct Zone {
    sign: i64,
    hour: i64,
    minute: i64,
}

impl Zone {
    fn new() -> Zone {
        Zone { sign: NONE, hour: NONE, minute: NONE }
    }
    fn set(&mut self, offset_hours: i64) {
        self.sign = if offset_hours < 0 { -1 } else { 1 };
        self.hour = offset_hours * self.sign;
        self.minute = 0;
    }
    fn set_sign(&mut self, s: i64) {
        self.sign = if s < 0 { -1 } else { 1 };
    }
    fn is_expecting(&self, n: i64) -> bool {
        self.hour != NONE && self.minute == NONE && is_minute(n)
    }
    fn is_utc(&self) -> bool {
        self.hour == 0 && self.minute == 0
    }
    fn is_empty(&self) -> bool {
        self.hour == NONE
    }
    /// The UTC offset in seconds; `Some(None)` when there is no zone.
    fn write(&mut self) -> Option<Option<i64>> {
        if self.sign == NONE {
            return Some(None);
        }
        if self.hour == NONE {
            self.hour = 0;
        }
        if self.minute == NONE {
            self.minute = 0;
        }
        let total = (self.hour as u32 as u64) * 3600 + (self.minute as u32 as u64) * 60;
        if total > (1 << 30) - 1 {
            return None;
        }
        Some(Some(if self.sign < 0 { -(total as i64) } else { total as i64 }))
    }
}

fn read_milliseconds(t: Tok) -> i64 {
    let Tok::Number { n, len } = t else { return 0 };
    let mut number = n;
    let mut length = len;
    if length == 1 {
        number *= 100;
    } else if length == 2 {
        number *= 10;
    } else if length > 3 {
        if length > MAX_SIGNIFICANT_DIGITS {
            length = MAX_SIGNIFICANT_DIGITS;
        }
        let mut factor = 1;
        while length > 3 {
            factor *= 10;
            length -= 1;
        }
        number /= factor;
    }
    number
}

/// `ParseES5DateTime`: the token the legacy grammar continues from.
fn parse_es5(sc: &mut Scanner, day: &mut Day, time: &mut Time, tz: &mut Zone) -> Tok {
    if sc.peek().is_sign() {
        let sign_token = sc.next();
        if !sc.peek().is_fixed(6) {
            return sign_token;
        }
        let sign = sign_token.sign();
        let year = sc.next().number();
        if sign < 0 && year == 0 {
            return sign_token;
        }
        day.add(sign * year);
    } else if sc.peek().is_fixed(4) {
        let y = sc.next().number();
        day.add(y);
    } else {
        return sc.next();
    }
    if sc.skip_symbol('-') {
        if !sc.peek().is_fixed(2) || !is_month(sc.peek().number()) {
            return sc.next();
        }
        let m = sc.next().number();
        day.add(m);
        if sc.skip_symbol('-') {
            if !sc.peek().is_fixed(2) || !is_day(sc.peek().number()) {
                return sc.next();
            }
            let d = sc.next().number();
            day.add(d);
        }
    }
    if !sc.peek().is_keyword_type(Kw::TimeSeparator) {
        if sc.peek() != Tok::End {
            return sc.next();
        }
    } else {
        sc.next();
        if !sc.peek().is_fixed(2) || !between(sc.peek().number(), 0, 24) {
            return Tok::Invalid;
        }
        let hour_is_24 = sc.peek().number() == 24;
        let h = sc.next().number();
        time.add(h);
        if !sc.skip_symbol(':') {
            return Tok::Invalid;
        }
        if !sc.peek().is_fixed(2) || !is_minute(sc.peek().number()) || (hour_is_24 && sc.peek().number() > 0) {
            return Tok::Invalid;
        }
        let m = sc.next().number();
        time.add(m);
        if sc.skip_symbol(':') {
            if !sc.peek().is_fixed(2) || !is_minute(sc.peek().number()) || (hour_is_24 && sc.peek().number() > 0) {
                return Tok::Invalid;
            }
            let s = sc.next().number();
            time.add(s);
            if sc.skip_symbol('.') {
                if !sc.peek().is_number() || (hour_is_24 && sc.peek().number() > 0) {
                    return Tok::Invalid;
                }
                let ms = read_milliseconds(sc.next());
                time.add(ms);
            }
        }
        if sc.peek().is_keyword_z() {
            sc.next();
            tz.set(0);
        } else if sc.peek().is_sign() {
            let s = sc.next().sign();
            tz.set_sign(s);
            if sc.peek().is_fixed(4) {
                let hm = sc.next().number();
                let (h, m) = (hm / 100, hm % 100);
                if !is_hour(h) || !is_minute(m) {
                    return Tok::Invalid;
                }
                tz.hour = h;
                tz.minute = m;
            } else {
                if !sc.peek().is_fixed(2) || !is_hour(sc.peek().number()) {
                    return Tok::Invalid;
                }
                tz.hour = sc.next().number();
                if !sc.skip_symbol(':') {
                    return Tok::Invalid;
                }
                if !sc.peek().is_fixed(2) || !is_minute(sc.peek().number()) {
                    return Tok::Invalid;
                }
                tz.minute = sc.next().number();
            }
        }
        if sc.peek() != Tok::End {
            return Tok::Invalid;
        }
    }
    if tz.is_empty() && time.is_empty() {
        tz.set(0);
    }
    day.iso = true;
    Tok::End
}

fn days_from_civil(y: i64, m0: i64, d: i64) -> i64 {
    let (y, m) = (if m0 < 2 { y - 1 } else { y }, m0 + 1);
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// `Date.parse(text)`: milliseconds since the epoch, or `None` for NaN.
pub fn date_parse(text: &str) -> Option<f64> {
    let mut sc = Scanner::new(text);
    let (mut day, mut time, mut tz) = (Day::default(), Time::default(), Zone::new());
    let first = parse_es5(&mut sc, &mut day, &mut time, &mut tz);
    if first == Tok::Invalid {
        return None;
    }
    let mut has_read_number = !day.comp.is_empty();
    let mut token = first;
    while token != Tok::End {
        match token {
            Tok::Number { n, .. } => {
                has_read_number = true;
                if sc.skip_symbol(':') {
                    if sc.skip_symbol(':') {
                        if !time.is_empty() {
                            return None;
                        }
                        time.add(n);
                        time.add(0);
                    } else {
                        if !time.add(n) {
                            return None;
                        }
                        if sc.peek().is_symbol('.') {
                            sc.next();
                        }
                    }
                } else if sc.skip_symbol('.') && time.is_expecting(n) {
                    time.add(n);
                    if !sc.peek().is_number() {
                        return None;
                    }
                    let ms = read_milliseconds(sc.next());
                    if ms < 0 {
                        return None;
                    }
                    time.add_final(ms);
                } else if tz.is_expecting(n) {
                    tz.minute = n;
                } else if time.is_expecting(n) {
                    time.add_final(n);
                    let p = sc.peek();
                    if p != Tok::End && p != Tok::WhiteSpace && !p.is_keyword_z() && !p.is_sign() {
                        return None;
                    }
                } else {
                    if !day.add(n) {
                        return None;
                    }
                    sc.skip_symbol('-');
                }
            }
            Tok::Keyword { kind, value, .. } => {
                if kind == Kw::AmPm && !time.is_empty() {
                    time.hour_offset = Some(value);
                } else if kind == Kw::MonthName {
                    day.named_month = Some(value);
                    sc.skip_symbol('-');
                } else if kind == Kw::TimeZoneName && has_read_number {
                    tz.set(value);
                } else {
                    if has_read_number {
                        return None;
                    }
                    if sc.peek().is_number() {
                        return None;
                    }
                }
            }
            t if t.is_sign() && (tz.is_utc() || !time.is_empty()) => {
                tz.set_sign(t.sign());
                let (mut n, mut length) = (0, 0);
                if sc.peek().is_number() {
                    let num = sc.next();
                    if let Tok::Number { n: v, len } = num {
                        n = v;
                        length = len;
                    }
                }
                has_read_number = true;
                if sc.peek().is_symbol(':') {
                    tz.hour = n;
                    tz.minute = NONE;
                } else if length == 1 || length == 2 {
                    tz.hour = n;
                    tz.minute = 0;
                } else if length == 3 || length == 4 {
                    tz.hour = n / 100;
                    tz.minute = n % 100;
                } else {
                    return None;
                }
            }
            t if (t.is_sign() || t.is_symbol(')')) && has_read_number => return None,
            _ => {}
        }
        token = sc.next();
    }
    let (y, m, d) = day.write()?;
    let (h, mi, s, ms) = time.write()?;
    let offset = tz.write()?;
    let days = days_from_civil(y, m, d) as f64;
    let date = days * 86_400_000.0 + ((h * 60 + mi) * 60 + s) as f64 * 1000.0 + ms as f64;
    const MAX: f64 = 8.64e15;
    let date = match offset {
        None => {
            if !(-(MAX + 864e6)..=MAX + 864e6).contains(&date) {
                return None;
            }
            date
        }
        Some(o) => {
            let d = date - o as f64 * 1000.0;
            if !(-MAX..=MAX).contains(&d) {
                return None;
            }
            d
        }
    };
    if date.abs() > MAX {
        return None;
    }
    Some(date.trunc() + 0.0)
}

#[cfg(test)]
mod tests {
    use super::date_parse;
    fn ms(y: i64, mo: i64, d: i64, h: i64, mi: i64, s: i64) -> f64 {
        (super::days_from_civil(y, mo - 1, d) * 86_400_000 + ((h * 60 + mi) * 60 + s) * 1000) as f64
    }
    #[test]
    fn v8_formats() {
        assert_eq!(date_parse("2024-01-02"), Some(ms(2024, 1, 2, 0, 0, 0)));
        assert_eq!(date_parse("2024-01-02T10:00:00Z"), Some(ms(2024, 1, 2, 10, 0, 0)));
        assert_eq!(date_parse("2024-01-02T10:00:00.5+01:00"), Some(ms(2024, 1, 2, 9, 0, 0) + 500.0));
        assert_eq!(date_parse("2024-01-02 10:00"), Some(ms(2024, 1, 2, 10, 0, 0)));
        assert_eq!(date_parse("Tue, 02 Jan 2024 10:00:00 GMT"), Some(ms(2024, 1, 2, 10, 0, 0)));
        assert_eq!(date_parse("Jan 5"), Some(ms(2001, 1, 5, 0, 0, 0)));
        assert_eq!(date_parse("2024/03/04"), Some(ms(2024, 3, 4, 0, 0, 0)));
        assert_eq!(date_parse("3/4/24 1:05 pm"), Some(ms(2024, 3, 4, 13, 5, 0)));
        assert_eq!(date_parse("Mon Jan 01 2024 00:00:00 GMT-0800 (Pacific Standard Time)"), Some(ms(2024, 1, 1, 8, 0, 0)));
        assert_eq!(date_parse("2024-13-01"), None);
        assert_eq!(date_parse("nope"), None);
        assert_eq!(date_parse(""), None);
        assert_eq!(date_parse("2024-01-02T25:00"), None);
    }
}
