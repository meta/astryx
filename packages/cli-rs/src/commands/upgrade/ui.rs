//! Output for the upgrade run: the API logger (`api/logger.mjs`) and the
//! codemod terminal log (`term-log.mjs`), both silenced in JSON mode.

use crate::cli::command::Out;

pub struct Ui<'a> {
    pub out: &'a mut Out,
    pub silent: bool,
}

pub fn to_ascii(msg: &str) -> String {
    let mut s = String::with_capacity(msg.len());
    let mut chars = msg.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\u{2014}' | '\u{2013}' => s.push('-'),
            '\u{2192}' => s.push_str("->"),
            '\u{2713}' => s.push_str("[ok]"),
            '\u{2717}' => s.push_str("!!"),
            '\u{26a0}' => {
                if chars.peek() == Some(&'\u{fe0f}') {
                    chars.next();
                }
                s.push('!')
            }
            '\u{2022}' => s.push('-'),
            '\u{2026}' => s.push_str("..."),
            '\u{2018}' | '\u{2019}' => s.push('\''),
            '\u{201c}' | '\u{201d}' => s.push('"'),
            '\u{a0}' => s.push(' '),
            o => s.push(o),
        }
    }
    s
}

impl<'a> Ui<'a> {
    /// `logger.log`
    pub fn log(&mut self, s: &str) {
        if !self.silent {
            self.out.log(s);
        }
    }
    /// `logger.warn` / `logger.error`
    pub fn warn(&mut self, s: &str) {
        if !self.silent {
            self.out.eprintln(s);
        }
    }
    pub fn error(&mut self, s: &str) {
        self.warn(s)
    }
}

/// The term log a codemod run writes with (`p.log`, or a silent one).
pub struct TermLog {
    pub silent: bool,
}

impl TermLog {
    pub fn info(&self, out: &mut Out, s: &str) {
        if !self.silent {
            out.log(&to_ascii(s));
        }
    }
    pub fn success(&self, out: &mut Out, s: &str) {
        if !self.silent {
            out.log(&format!("[ok] {}", to_ascii(s)));
        }
    }
    pub fn warn(&self, out: &mut Out, s: &str) {
        if !self.silent {
            out.log(&format!("! {}", to_ascii(s)));
        }
    }
    pub fn error(&self, out: &mut Out, s: &str) {
        if !self.silent {
            out.log(&format!("!! {}", to_ascii(s)));
        }
    }
    pub fn blank(&self, out: &mut Out) {
        if !self.silent {
            out.log("");
        }
    }
}
