//! `JSON.parse` and `JSON.stringify` details the integration writer needs:
//! V8's parse error messages, JS object key order, and a string `space`.

use crate::json::{self, Map, Value};

/// `JSON.parse(text)` with V8's error message on failure. Objects keep JS
/// key order (array-index keys first).
pub fn parse(text: &str) -> Result<Value, String> {
    let u: Vec<u16> = text.encode_utf16().collect();
    let mut p = P { s: &u, i: 0 };
    p.ws();
    let v = p.value()?;
    p.ws();
    if p.i < u.len() {
        return Err(p.at("Unexpected non-whitespace character after JSON"));
    }
    Ok(v)
}

struct P<'a> {
    s: &'a [u16],
    i: usize,
}

impl<'a> P<'a> {
    fn ws(&mut self) {
        while self.i < self.s.len() && matches!(self.s[self.i], 0x20 | 0x09 | 0x0A | 0x0D) {
            self.i += 1;
        }
    }

    fn at(&self, msg: &str) -> String {
        let mut line = 1;
        let mut col = 1;
        for &c in &self.s[..self.i.min(self.s.len())] {
            if c == 0x0A {
                line += 1;
                col = 1;
            } else {
                col += 1;
            }
        }
        format!("{msg} in JSON at position {} (line {line} column {col})", self.i)
    }

    fn unexpected(&self) -> String {
        if self.i >= self.s.len() {
            return "Unexpected end of JSON input".into();
        }
        let tok = String::from_utf16_lossy(&self.s[self.i..self.i + 1]);
        let len = self.s.len();
        if len <= 20 {
            return format!("Unexpected token '{tok}', \"{}\" is not valid JSON", String::from_utf16_lossy(self.s));
        }
        let start = self.i.saturating_sub(10);
        let end = (self.i + 10).min(len);
        let ctx = String::from_utf16_lossy(&self.s[start..end]);
        let pre = if start > 0 { "..." } else { "" };
        let post = if end < len { "..." } else { "" };
        format!("Unexpected token '{tok}', {pre}\"{ctx}\"{post} is not valid JSON")
    }

    fn peek(&self) -> Option<u16> {
        self.s.get(self.i).copied()
    }

    fn value(&mut self) -> Result<Value, String> {
        match self.peek() {
            None => Err("Unexpected end of JSON input".into()),
            Some(0x7B) => self.object(),
            Some(0x5B) => self.array(),
            Some(0x22) => Ok(Value::String(self.string()?)),
            Some(c) if c == 0x2D || (0x30..=0x39).contains(&c) => self.number(),
            Some(_) => {
                for (word, v) in [("true", Value::Bool(true)), ("false", Value::Bool(false)), ("null", Value::Null)] {
                    let w: Vec<u16> = word.encode_utf16().collect();
                    if self.s[self.i] == w[0] {
                        for &wc in &w {
                            if self.peek() != Some(wc) {
                                return Err(self.unexpected());
                            }
                            self.i += 1;
                        }
                        return Ok(v);
                    }
                }
                Err(self.unexpected())
            }
        }
    }

    fn object(&mut self) -> Result<Value, String> {
        self.i += 1;
        let mut m = Map::new();
        self.ws();
        if self.peek() == Some(0x7D) {
            self.i += 1;
            return Ok(Value::Object(m));
        }
        if self.peek() != Some(0x22) {
            if self.i >= self.s.len() {
                return Err(self.at("Expected property name or '}'"));
            }
            return Err(self.at("Expected property name or '}'"));
        }
        loop {
            let k = self.string()?;
            self.ws();
            if self.peek() != Some(0x3A) {
                return Err(self.at("Expected ':' after property name"));
            }
            self.i += 1;
            self.ws();
            let v = self.value()?;
            m.insert(k, v);
            self.ws();
            match self.peek() {
                Some(0x2C) => {
                    self.i += 1;
                    self.ws();
                    if self.peek() != Some(0x22) {
                        return Err(self.at("Expected double-quoted property name"));
                    }
                }
                Some(0x7D) => {
                    self.i += 1;
                    return Ok(Value::Object(json::js_key_order(m)));
                }
                _ => return Err(self.at("Expected ',' or '}' after property value")),
            }
        }
    }

    fn array(&mut self) -> Result<Value, String> {
        self.i += 1;
        let mut v = Vec::new();
        self.ws();
        if self.peek() == Some(0x5D) {
            self.i += 1;
            return Ok(Value::Array(v));
        }
        loop {
            self.ws();
            v.push(self.value()?);
            self.ws();
            match self.peek() {
                Some(0x2C) => self.i += 1,
                Some(0x5D) => {
                    self.i += 1;
                    return Ok(Value::Array(v));
                }
                _ => return Err(self.at("Expected ',' or ']' after array element")),
            }
        }
    }

    fn string(&mut self) -> Result<String, String> {
        self.i += 1;
        let mut out: Vec<u16> = Vec::new();
        loop {
            let Some(c) = self.peek() else {
                return Err(self.at("Unterminated string"));
            };
            match c {
                0x22 => {
                    self.i += 1;
                    return Ok(String::from_utf16_lossy(&out));
                }
                0x5C => {
                    self.i += 1;
                    let Some(e) = self.peek() else {
                        return Err(self.at("Unterminated string"));
                    };
                    let ch = match e {
                        0x22 => 0x22,
                        0x5C => 0x5C,
                        0x2F => 0x2F,
                        0x62 => 0x08,
                        0x66 => 0x0C,
                        0x6E => 0x0A,
                        0x72 => 0x0D,
                        0x74 => 0x09,
                        0x75 => {
                            let mut n: u16 = 0;
                            for k in 1..=4 {
                                let d = self.s.get(self.i + k).copied();
                                let dv = d.and_then(|d| char::from_u32(d as u32)).and_then(|d| d.to_digit(16));
                                match dv {
                                    Some(x) => n = n * 16 + x as u16,
                                    None => {
                                        self.i += k;
                                        return Err(self.at("Bad Unicode escape"));
                                    }
                                }
                            }
                            self.i += 4;
                            n
                        }
                        _ => return Err(self.at("Bad escaped character")),
                    };
                    out.push(ch);
                    self.i += 1;
                }
                c if c < 0x20 => return Err(self.at("Bad control character in string literal")),
                c => {
                    out.push(c);
                    self.i += 1;
                }
            }
        }
    }

    fn number(&mut self) -> Result<Value, String> {
        let start = self.i;
        if self.peek() == Some(0x2D) {
            self.i += 1;
            if !matches!(self.peek(), Some(0x30..=0x39)) {
                return Err(self.at("No number after minus sign"));
            }
        }
        if self.peek() == Some(0x30) {
            self.i += 1;
            if matches!(self.peek(), Some(0x30..=0x39)) {
                return Err(self.at("Unexpected number"));
            }
        } else {
            while matches!(self.peek(), Some(0x30..=0x39)) {
                self.i += 1;
            }
        }
        if self.peek() == Some(0x2E) {
            self.i += 1;
            if !matches!(self.peek(), Some(0x30..=0x39)) {
                return Err(self.at("Unterminated fractional number"));
            }
            while matches!(self.peek(), Some(0x30..=0x39)) {
                self.i += 1;
            }
        }
        if matches!(self.peek(), Some(0x65 | 0x45)) {
            self.i += 1;
            if matches!(self.peek(), Some(0x2B | 0x2D)) {
                self.i += 1;
            }
            if !matches!(self.peek(), Some(0x30..=0x39)) {
                return Err(self.at("Exponent part is missing a number"));
            }
            while matches!(self.peek(), Some(0x30..=0x39)) {
                self.i += 1;
            }
        }
        let text = String::from_utf16_lossy(&self.s[start..self.i]);
        let f: f64 = text.parse().unwrap_or(0.0);
        if f.fract() == 0.0 && f.abs() < 9.007_199_254_740_992e15 {
            return Ok(Value::Number((f as i64).into()));
        }
        Ok(json::num(f))
    }
}

/// `JSON.stringify(value, null, space)` with a string `space`.
pub fn stringify_gap(v: &Value, gap: &str) -> String {
    let gap: String = gap.encode_utf16().take(10).collect::<Vec<u16>>().iter().map(|c| char::from_u32(*c as u32).unwrap_or(' ')).collect();
    let mut out = String::new();
    write(&mut out, v, &gap, 0);
    out
}

fn nl(out: &mut String, gap: &str, depth: usize) {
    out.push('\n');
    for _ in 0..depth {
        out.push_str(gap);
    }
}

fn write(out: &mut String, v: &Value, gap: &str, depth: usize) {
    match v {
        Value::Array(items) => {
            if items.is_empty() {
                out.push_str("[]");
                return;
            }
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                if !gap.is_empty() {
                    nl(out, gap, depth + 1);
                }
                write(out, item, gap, depth + 1);
            }
            if !gap.is_empty() {
                nl(out, gap, depth);
            }
            out.push(']');
        }
        Value::Object(map) => {
            if map.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push('{');
            for (i, (k, item)) in map.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                if !gap.is_empty() {
                    nl(out, gap, depth + 1);
                }
                json::quote(out, k);
                out.push(':');
                if !gap.is_empty() {
                    out.push(' ');
                }
                write(out, item, gap, depth + 1);
            }
            if !gap.is_empty() {
                nl(out, gap, depth);
            }
            out.push('}');
        }
        other => out.push_str(&json::stringify(other, 0)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn v8_messages() {
        assert_eq!(parse("").unwrap_err(), "Unexpected end of JSON input");
        assert_eq!(parse("{\"a\":}").unwrap_err(), "Unexpected token '}', \"{\"a\":}\" is not valid JSON");
        assert_eq!(parse("{\"a\":1,}").unwrap_err(), "Expected double-quoted property name in JSON at position 7 (line 1 column 8)");
        assert_eq!(parse("\n\n {\"a\": [1,\n 2 3]}").unwrap_err(), "Expected ',' or ']' after array element in JSON at position 16 (line 4 column 4)");
        assert_eq!(parse("{\"aaaaaaaaaaaaaaaaaaa\": t}").unwrap_err(), "Unexpected token '}', ...\"aaaaaa\": t}\" is not valid JSON");
        assert_eq!(parse("{\"x\": } aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").unwrap_err(), "Unexpected token '}', \"{\"x\": } aaaaaaaa\"... is not valid JSON");
        assert_eq!(parse("{\"a\":01}").unwrap_err(), "Unexpected number in JSON at position 6 (line 1 column 7)");
    }
}
