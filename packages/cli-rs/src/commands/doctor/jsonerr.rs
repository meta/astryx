//! V8's `JSON.parse` error messages (Node 22), for text that does not parse.
//! TEMP: replace with the shared JSON reader once one owns this wording.

struct P<'a> {
    s: &'a [u16],
    src: &'a str,
    i: usize,
}

enum Fail {
    /// A message template with a position.
    At(&'static str, usize),
    /// An unexpected token at a position (no override message).
    Token(usize),
}

const MAX_CONTEXT: usize = 10;

impl P<'_> {
    fn ws(&mut self) {
        while self.i < self.s.len() && matches!(self.s[self.i], 0x20 | 0x09 | 0x0a | 0x0d) {
            self.i += 1;
        }
    }
    fn peek(&self) -> Option<u16> {
        self.s.get(self.i).copied()
    }
    fn value(&mut self) -> Result<(), Fail> {
        self.ws();
        let Some(c) = self.peek() else { return Err(Fail::Token(self.i)) };
        match c {
            0x7b => self.object(),
            0x5b => self.array(),
            0x22 => self.string(),
            0x2d | 0x30..=0x39 => self.number(),
            0x74 => self.literal("true"),
            0x66 => self.literal("false"),
            0x6e => self.literal("null"),
            _ => Err(Fail::Token(self.i)),
        }
    }
    fn literal(&mut self, word: &str) -> Result<(), Fail> {
        for w in word.encode_utf16() {
            if self.peek() != Some(w) {
                return Err(Fail::Token(self.i));
            }
            self.i += 1;
        }
        Ok(())
    }
    fn expect(&mut self, c: u16, msg: &'static str) -> Result<(), Fail> {
        self.ws();
        if self.peek() == Some(c) {
            self.i += 1;
            Ok(())
        } else {
            Err(Fail::At(msg, self.i))
        }
    }
    fn object(&mut self) -> Result<(), Fail> {
        self.i += 1;
        self.ws();
        if self.peek() == Some(0x7d) {
            self.i += 1;
            return Ok(());
        }
        if self.peek() != Some(0x22) {
            return Err(Fail::At("Expected property name or '}'", self.i));
        }
        loop {
            self.string()?;
            self.expect(0x3a, "Expected ':' after property name")?;
            self.value()?;
            self.ws();
            match self.peek() {
                Some(0x2c) => {
                    self.i += 1;
                    self.ws();
                    if self.peek() != Some(0x22) {
                        return Err(Fail::At("Expected double-quoted property name", self.i));
                    }
                }
                Some(0x7d) => {
                    self.i += 1;
                    return Ok(());
                }
                _ => return Err(Fail::At("Expected ',' or '}' after property value", self.i)),
            }
        }
    }
    fn array(&mut self) -> Result<(), Fail> {
        self.i += 1;
        self.ws();
        if self.peek() == Some(0x5d) {
            self.i += 1;
            return Ok(());
        }
        loop {
            self.value()?;
            self.ws();
            match self.peek() {
                Some(0x2c) => self.i += 1,
                Some(0x5d) => {
                    self.i += 1;
                    return Ok(());
                }
                _ => return Err(Fail::At("Expected ',' or ']' after array element", self.i)),
            }
        }
    }
    fn string(&mut self) -> Result<(), Fail> {
        self.i += 1;
        loop {
            let Some(c) = self.peek() else { return Err(Fail::At("Unterminated string", self.i)) };
            match c {
                0x22 => {
                    self.i += 1;
                    return Ok(());
                }
                0x5c => {
                    self.i += 1;
                    match self.peek() {
                        Some(0x22 | 0x5c | 0x2f | 0x62 | 0x66 | 0x6e | 0x72 | 0x74) => self.i += 1,
                        Some(0x75) => {
                            self.i += 1;
                            for _ in 0..4 {
                                match self.peek() {
                                    Some(h) if (h as u8 as u16 == h) && (h as u8).is_ascii_hexdigit() => self.i += 1,
                                    _ => return Err(Fail::At("Bad Unicode escape", self.i)),
                                }
                            }
                        }
                        None => return Err(Fail::At("Unterminated string", self.i)),
                        _ => return Err(Fail::At("Bad escaped character", self.i)),
                    }
                }
                c if c < 0x20 => return Err(Fail::At("Bad control character in string literal", self.i)),
                _ => self.i += 1,
            }
        }
    }
    fn digits(&mut self) -> usize {
        let start = self.i;
        while matches!(self.peek(), Some(0x30..=0x39)) {
            self.i += 1;
        }
        self.i - start
    }
    fn number(&mut self) -> Result<(), Fail> {
        if self.peek() == Some(0x2d) {
            self.i += 1;
            if !matches!(self.peek(), Some(0x30..=0x39)) {
                return Err(Fail::At("No number after minus sign", self.i));
            }
        }
        if self.peek() == Some(0x30) {
            self.i += 1;
            if matches!(self.peek(), Some(0x30..=0x39)) {
                return Err(Fail::Token(self.i));
            }
        } else {
            self.digits();
        }
        if self.peek() == Some(0x2e) {
            self.i += 1;
            if self.digits() == 0 {
                return Err(Fail::At("Unterminated fractional number", self.i));
            }
        }
        if matches!(self.peek(), Some(0x65 | 0x45)) {
            self.i += 1;
            if matches!(self.peek(), Some(0x2b | 0x2d)) {
                self.i += 1;
            }
            if self.digits() == 0 {
                return Err(Fail::At("Exponent part is missing a number", self.i));
            }
        }
        Ok(())
    }
}

fn line_col(s: &[u16], pos: usize) -> (usize, usize) {
    let mut line = 1;
    let mut col = 1;
    for &c in &s[..pos.min(s.len())] {
        if c == 0x0a {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}

fn at(s: &[u16], msg: &str, pos: usize) -> String {
    let (l, c) = line_col(s, pos);
    let tail = if msg.ends_with("after JSON") { "" } else { " in JSON" };
    format!("{msg}{tail} at position {pos} (line {l} column {c})")
}

/// The message `JSON.parse(text)` throws, or None when it parses.
pub fn json_parse_error(text: &str) -> Option<String> {
    let s: Vec<u16> = text.encode_utf16().collect();
    let mut p = P { s: &s, src: text, i: 0 };
    let r = p.value().and_then(|_| {
        p.ws();
        if p.i < s.len() {
            Err(Fail::At("Unexpected non-whitespace character after JSON", p.i))
        } else {
            Ok(())
        }
    });
    let _ = p.src;
    match r {
        Ok(()) => None,
        Err(Fail::At(msg, pos)) => Some(at(&s, msg, pos)),
        Err(Fail::Token(pos)) => {
            let Some(&c) = s.get(pos) else { return Some("Unexpected end of JSON input".into()) };
            if c == 0x22 {
                return Some(at(&s, "Unexpected string", pos));
            }
            if c == 0x2d || (0x30..=0x39).contains(&c) {
                return Some(at(&s, "Unexpected number", pos));
            }
            let ch = String::from_utf16_lossy(&[c]);
            if ["undefined", "NaN", "Infinity", "[object Object]"].contains(&text) {
                return Some(format!("\"{text}\" is not valid JSON"));
            }
            let len = s.len();
            let sub = |a: usize, b: usize| String::from_utf16_lossy(&s[a..b.min(len)]);
            Some(if len < MAX_CONTEXT * 2 + 1 {
                format!("Unexpected token '{ch}', \"{text}\" is not valid JSON")
            } else if pos < MAX_CONTEXT {
                format!("Unexpected token '{ch}', \"{}\"... is not valid JSON", sub(0, pos + MAX_CONTEXT))
            } else if pos < len - MAX_CONTEXT {
                format!("Unexpected token '{ch}', ...\"{}\"... is not valid JSON", sub(pos - MAX_CONTEXT, pos + MAX_CONTEXT))
            } else {
                format!("Unexpected token '{ch}', ...\"{}\" is not valid JSON", sub(pos - MAX_CONTEXT, len))
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::json_parse_error;
    #[test]
    fn v8_messages() {
        assert_eq!(json_parse_error("{\"name\": \"@acme/x\",").as_deref(), Some("Expected double-quoted property name in JSON at position 19 (line 1 column 20)"));
        assert_eq!(json_parse_error("").as_deref(), Some("Unexpected end of JSON input"));
        assert_eq!(json_parse_error("{").as_deref(), Some("Expected property name or '}' in JSON at position 1 (line 1 column 2)"));
        assert_eq!(json_parse_error("{\"a\" 1}").as_deref(), Some("Expected ':' after property name in JSON at position 5 (line 1 column 6)"));
        assert_eq!(json_parse_error("{\"a\":1 \"b\"}").as_deref(), Some("Expected ',' or '}' after property value in JSON at position 7 (line 1 column 8)"));
        assert_eq!(json_parse_error("[1,]").as_deref(), Some("Unexpected token ']', \"[1,]\" is not valid JSON"));
        assert_eq!(json_parse_error("[1 2]").as_deref(), Some("Expected ',' or ']' after array element in JSON at position 3 (line 1 column 4)"));
        assert_eq!(json_parse_error("tru").as_deref(), Some("Unexpected end of JSON input"));
        assert_eq!(json_parse_error("01").as_deref(), Some("Unexpected number in JSON at position 1 (line 1 column 2)"));
        assert_eq!(json_parse_error("-x").as_deref(), Some("No number after minus sign in JSON at position 1 (line 1 column 2)"));
        assert_eq!(json_parse_error("1.").as_deref(), Some("Unterminated fractional number in JSON at position 2 (line 1 column 3)"));
        assert_eq!(json_parse_error("1e").as_deref(), Some("Exponent part is missing a number in JSON at position 2 (line 1 column 3)"));
        assert_eq!(json_parse_error("\"abc").as_deref(), Some("Unterminated string in JSON at position 4 (line 1 column 5)"));
        assert_eq!(json_parse_error("\"a\\x\"").as_deref(), Some("Bad escaped character in JSON at position 3 (line 1 column 4)"));
        assert_eq!(json_parse_error("{\"a\":1}x").as_deref(), Some("Unexpected non-whitespace character after JSON at position 7 (line 1 column 8)"));
        assert_eq!(json_parse_error("{a:1}").as_deref(), Some("Expected property name or '}' in JSON at position 1 (line 1 column 2)"));
        assert_eq!(json_parse_error("undefined").as_deref(), Some("\"undefined\" is not valid JSON"));
        assert_eq!(json_parse_error("{\"name\": \"verylongvalue\", oops}").as_deref(), Some("Expected double-quoted property name in JSON at position 26 (line 1 column 27)"));
        assert_eq!(json_parse_error("xyz{\"aaaaaaaaaaaaaaaaaaaaaaa\":1}").as_deref(), Some("Unexpected token 'x', \"xyz{\"aaaaa\"... is not valid JSON"));
        assert_eq!(json_parse_error("{\"aaaaaaaaaaaaaaaaaaaaaaaaa\":1}  ,").as_deref(), Some("Unexpected non-whitespace character after JSON at position 33 (line 1 column 34)"));
        assert_eq!(json_parse_error("\"\u{1}\"").as_deref(), Some("Bad control character in string literal in JSON at position 1 (line 1 column 2)"));
        assert_eq!(json_parse_error("{\"a\":\n tx}").as_deref(), Some("Unexpected token 'x', \"{\"a\":\n tx}\" is not valid JSON"));
    }
}
