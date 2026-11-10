//! `JSON.parse` with V8's exact error messages (V8 12.4 `json-parser.cc`).
//!
//! The CLI surfaces `JSON.parse` failures verbatim (`Could not parse palette
//! config: ...`), so the message, position, line and column must match.
//! Positions count UTF-16 code units, as V8 does.

use crate::json::{self, Map, Value};

#[derive(Clone, Copy, PartialEq, Debug)]
enum Tok {
    String,
    Number,
    LBrace,
    RBrace,
    LBrack,
    RBrack,
    True,
    False,
    Null,
    Ws,
    Colon,
    Comma,
    Illegal,
    Eos,
}

fn tok_for(c: u16) -> Tok {
    match c {
        0x22 => Tok::String,
        0x30..=0x39 | 0x2d => Tok::Number,
        0x7b => Tok::LBrace,
        0x7d => Tok::RBrace,
        0x5b => Tok::LBrack,
        0x5d => Tok::RBrack,
        0x74 => Tok::True,
        0x66 => Tok::False,
        0x6e => Tok::Null,
        0x20 | 0x09 | 0x0d | 0x0a => Tok::Ws,
        0x3a => Tok::Colon,
        0x2c => Tok::Comma,
        _ => Tok::Illegal,
    }
}

enum Msg {
    UnterminatedString,
    ExpectedPropNameOrRBrace,
    ExpectedCommaOrRBrack,
    ExpectedCommaOrRBrace,
    ExpectedDoubleQuotedPropertyName,
    ExponentPartMissingNumber,
    ExpectedColonAfterPropertyName,
    UnterminatedFractionalNumber,
    UnexpectedNonWhiteSpaceCharacter,
    BadEscapedCharacter,
    BadControlCharacter,
    BadUnicodeEscape,
    NoNumberAfterMinusSign,
}

impl Msg {
    fn text(&self) -> &'static str {
        match self {
            Msg::UnterminatedString => "Unterminated string in JSON at position",
            Msg::ExpectedPropNameOrRBrace => "Expected property name or '}' in JSON at position",
            Msg::ExpectedCommaOrRBrack => "Expected ',' or ']' after array element in JSON at position",
            Msg::ExpectedCommaOrRBrace => "Expected ',' or '}' after property value in JSON at position",
            Msg::ExpectedDoubleQuotedPropertyName => "Expected double-quoted property name in JSON at position",
            Msg::ExponentPartMissingNumber => "Exponent part is missing a number in JSON at position",
            Msg::ExpectedColonAfterPropertyName => "Expected ':' after property name in JSON at position",
            Msg::UnterminatedFractionalNumber => "Unterminated fractional number in JSON at position",
            Msg::UnexpectedNonWhiteSpaceCharacter => "Unexpected non-whitespace character after JSON at position",
            Msg::BadEscapedCharacter => "Bad escaped character in JSON at position",
            Msg::BadControlCharacter => "Bad control character in string literal in JSON at position",
            Msg::BadUnicodeEscape => "Bad Unicode escape in JSON at position",
            Msg::NoNumberAfterMinusSign => "No number after minus sign in JSON at position",
        }
    }
}

struct P<'a> {
    s: &'a [u16],
    cur: usize,
    next: Tok,
}

type R<T> = Result<T, String>;

impl<'a> P<'a> {
    fn at_end(&self) -> bool {
        self.cur >= self.s.len()
    }

    fn current(&self) -> Option<u16> {
        self.s.get(self.cur).copied()
    }

    fn next_char(&mut self) -> Option<u16> {
        self.cur += 1;
        self.current()
    }

    fn skip_ws(&mut self) {
        let mut next = Tok::Eos;
        while let Some(c) = self.current() {
            let t = tok_for(c);
            if t != Tok::Ws {
                next = t;
                break;
            }
            self.cur += 1;
        }
        self.next = next;
    }

    fn line_col(&self) -> (usize, usize) {
        let mut line = 1;
        let mut last = 0;
        let mut i = 0;
        let end = self.cur.min(self.s.len());
        while i < end {
            if self.s[i] == 0x0d && i + 1 < end && self.s[i + 1] == 0x0a {
                i += 1;
            }
            if self.s[i] == 0x0d || self.s[i] == 0x0a {
                line += 1;
                last = i + 1;
            }
            i += 1;
        }
        (line, 1 + i - last)
    }

    fn positioned(&self, m: &str) -> String {
        let (l, c) = self.line_col();
        format!("{m} {} (line {l} column {c})", self.cur)
    }

    fn err_msg(&self, m: Msg) -> String {
        self.positioned(m.text())
    }

    fn src_string(&self, a: usize, b: usize) -> String {
        String::from_utf16_lossy(&self.s[a..b.min(self.s.len())])
    }

    fn is_special(&self) -> bool {
        let whole = String::from_utf16_lossy(self.s);
        matches!(whole.as_str(), "[object Object]" | "undefined" | "Infinity" | "NaN")
    }

    fn err_token(&self, t: Tok) -> String {
        match t {
            Tok::Eos => "Unexpected end of JSON input".into(),
            Tok::Number => self.positioned("Unexpected number in JSON at position"),
            Tok::String => self.positioned("Unexpected string in JSON at position"),
            _ => {
                if self.is_special() {
                    return format!("\"{}\" is not valid JSON", self.src_string(0, self.s.len()));
                }
                let ch = self.current().map(|c| String::from_utf16_lossy(&[c])).unwrap_or_default();
                let len = self.s.len();
                let pos = self.cur;
                const K: usize = 10;
                if len > 2 * K {
                    if pos < K {
                        format!("Unexpected token '{ch}', \"{}\"... is not valid JSON", self.src_string(0, pos + K))
                    } else if pos < len - K {
                        format!("Unexpected token '{ch}', ...\"{}\"... is not valid JSON", self.src_string(pos - K, pos + K))
                    } else {
                        format!("Unexpected token '{ch}', ...\"{}\" is not valid JSON", self.src_string(pos - K, len))
                    }
                } else {
                    format!("Unexpected token '{ch}', \"{}\" is not valid JSON", self.src_string(0, len))
                }
            }
        }
    }

    fn unexpected_char(&self) -> String {
        match self.current() {
            None => self.err_token(Tok::Eos),
            Some(c) => self.err_token(if c <= 0xff { tok_for(c) } else { Tok::Illegal }),
        }
    }

    fn expect(&mut self, t: Tok, m: Msg) -> R<()> {
        self.skip_ws();
        if self.next == t {
            self.cur += 1;
            Ok(())
        } else {
            Err(self.err_msg(m))
        }
    }

    fn check(&mut self, t: Tok) -> bool {
        self.skip_ws();
        if self.next != t {
            return false;
        }
        self.cur += 1;
        true
    }

    fn scan_literal(&mut self, lit: &str) -> R<()> {
        let bytes: Vec<u16> = lit.encode_utf16().collect();
        let remaining = self.s.len() - self.cur;
        if remaining >= bytes.len() && self.s[self.cur + 1..self.cur + bytes.len()] == bytes[1..] {
            self.cur += bytes.len();
            return Ok(());
        }
        self.cur += 1;
        for i in 0..(bytes.len() - 1).min(remaining - 1) {
            if bytes[1 + i] != self.s[self.cur] {
                return Err(self.unexpected_char());
            }
            self.cur += 1;
        }
        Err(self.err_token(Tok::Eos))
    }

    fn hex(c: Option<u16>) -> Option<u32> {
        let c = c?;
        char::from_u32(c as u32)?.to_digit(16)
    }

    /// Scan a string body; the cursor is past the opening quote.
    fn scan_string(&mut self) -> R<String> {
        let mut units: Vec<u16> = Vec::new();
        loop {
            let c = match self.current() {
                None => return Err(self.err_msg(Msg::UnterminatedString)),
                Some(c) => c,
            };
            if c == 0x22 {
                self.cur += 1;
                return Ok(String::from_utf16_lossy(&units));
            }
            if c == 0x5c {
                let e = self.next_char();
                let e = match e {
                    Some(e) if e <= 0xff => e,
                    _ => return Err(self.unexpected_char()),
                };
                match e {
                    0x22 | 0x5c | 0x2f => units.push(e),
                    0x62 => units.push(0x08),
                    0x66 => units.push(0x0c),
                    0x6e => units.push(0x0a),
                    0x72 => units.push(0x0d),
                    0x74 => units.push(0x09),
                    0x75 => {
                        let mut v = 0u32;
                        for _ in 0..4 {
                            match Self::hex(self.next_char()) {
                                Some(d) => v = v * 16 + d,
                                None => return Err(self.err_msg(Msg::BadUnicodeEscape)),
                            }
                        }
                        units.push(v as u16);
                    }
                    _ => return Err(self.err_msg(Msg::BadEscapedCharacter)),
                }
                self.cur += 1;
                continue;
            }
            if c < 0x20 {
                return Err(self.err_msg(Msg::BadControlCharacter));
            }
            units.push(c);
            self.cur += 1;
        }
    }

    fn is_digit(c: Option<u16>) -> bool {
        matches!(c, Some(0x30..=0x39))
    }

    fn is_number_part(c: Option<u16>) -> bool {
        matches!(c, Some(0x30..=0x39 | 0x2e | 0x65 | 0x45 | 0x2d | 0x2b))
    }

    fn parse_number(&mut self) -> R<f64> {
        let start = self.cur;
        let mut c = self.current();
        let mut sign = 1.0;
        if c == Some(0x2d) {
            sign = -1.0;
            c = self.next_char();
        }
        if c == Some(0x30) {
            c = self.next_char();
            if Self::is_number_part(c) {
                if Self::is_digit(c) {
                    return Err(self.err_token(Tok::Number));
                }
            } else if sign > 0.0 {
                return Ok(0.0);
            }
        } else {
            let digits_start = self.cur;
            while Self::is_digit(self.current()) {
                self.cur += 1;
            }
            if digits_start == self.cur {
                return Err(self.err_msg(Msg::NoNumberAfterMinusSign));
            }
        }
        if self.current() == Some(0x2e) {
            let c = self.next_char();
            if !Self::is_digit(c) {
                return Err(self.err_msg(Msg::UnterminatedFractionalNumber));
            }
            while Self::is_digit(self.current()) {
                self.cur += 1;
            }
        }
        if matches!(self.current(), Some(0x65 | 0x45)) {
            let mut c = self.next_char();
            if matches!(c, Some(0x2d | 0x2b)) {
                c = self.next_char();
            }
            if !Self::is_digit(c) {
                return Err(self.err_msg(Msg::ExponentPartMissingNumber));
            }
            while Self::is_digit(self.current()) {
                self.cur += 1;
            }
        }
        let text = self.src_string(start, self.cur);
        Ok(text.parse::<f64>().unwrap_or(f64::NAN))
    }

    fn value(&mut self, depth: usize) -> R<Value> {
        self.skip_ws();
        match self.next {
            Tok::String => {
                self.cur += 1;
                Ok(Value::String(self.scan_string()?))
            }
            Tok::Number => Ok(number_value(self.parse_number()?)),
            Tok::LBrace => {
                self.cur += 1;
                let mut map = Map::new();
                if self.check(Tok::RBrace) {
                    return Ok(Value::Object(map));
                }
                self.expect(Tok::String, Msg::ExpectedPropNameOrRBrace)?;
                let mut key = self.scan_string()?;
                self.expect(Tok::Colon, Msg::ExpectedColonAfterPropertyName)?;
                loop {
                    let v = self.value(depth + 1)?;
                    map.insert(key, v);
                    if self.check(Tok::Comma) {
                        self.expect(Tok::String, Msg::ExpectedDoubleQuotedPropertyName)?;
                        key = self.scan_string()?;
                        self.expect(Tok::Colon, Msg::ExpectedColonAfterPropertyName)?;
                        continue;
                    }
                    self.expect(Tok::RBrace, Msg::ExpectedCommaOrRBrace)?;
                    return Ok(Value::Object(json::js_key_order(map)));
                }
            }
            Tok::LBrack => {
                self.cur += 1;
                let mut items = Vec::new();
                if self.check(Tok::RBrack) {
                    return Ok(Value::Array(items));
                }
                loop {
                    items.push(self.value(depth + 1)?);
                    if self.check(Tok::Comma) {
                        continue;
                    }
                    self.expect(Tok::RBrack, Msg::ExpectedCommaOrRBrack)?;
                    return Ok(Value::Array(items));
                }
            }
            Tok::True => self.scan_literal("true").map(|_| Value::Bool(true)),
            Tok::False => self.scan_literal("false").map(|_| Value::Bool(false)),
            Tok::Null => self.scan_literal("null").map(|_| Value::Null),
            _ => Err(self.unexpected_char()),
        }
    }
}

fn number_value(n: f64) -> Value {
    if n.fract() == 0.0 && n.abs() < 9007199254740992.0 && !(n == 0.0 && n.is_sign_negative()) {
        Value::from(n as i64)
    } else {
        json::num(n)
    }
}

/// `JSON.parse(text)`: the value, or V8's `SyntaxError` message.
pub fn parse(text: &str) -> Result<Value, String> {
    let units: Vec<u16> = text.encode_utf16().collect();
    let mut p = P { s: &units, cur: 0, next: Tok::Eos };
    let v = p.value(0)?;
    if !p.check(Tok::Eos) {
        return Err(p.err_msg(Msg::UnexpectedNonWhiteSpaceCharacter));
    }
    let _ = p.at_end();
    Ok(v)
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn v8_messages() {
        assert_eq!(parse("{bad").unwrap_err(), "Expected property name or '}' in JSON at position 1 (line 1 column 2)");
        assert_eq!(parse("").unwrap_err(), "Unexpected end of JSON input");
        assert_eq!(parse("{\"a\":1}x").unwrap_err(), "Unexpected non-whitespace character after JSON at position 7 (line 1 column 8)");
        assert_eq!(parse("abc").unwrap_err(), "Unexpected token 'a', \"abc\" is not valid JSON");
        assert_eq!(parse("[1,]").unwrap_err(), "Unexpected token ']', \"[1,]\" is not valid JSON");
    }
}
