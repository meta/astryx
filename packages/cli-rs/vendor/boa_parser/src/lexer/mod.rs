//! Boa's lexical analyzer(Lexer) for ECMAScript source code.
//!
//! The Lexer splits its input source code into a sequence of input elements called tokens,
//! represented by the [Token] structure. It also removes
//! whitespace and comments and attaches them to the next token.
//!
//! This is tightly coupled with the parser due to the javascript goal-symbol requirements
//! as documented by the spec.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-ecmascript-language-lexical-grammar

pub mod error;
pub mod regex;
pub mod token;

mod comment;
mod cursor;
mod identifier;
mod number;
mod operator;
mod private_identifier;
mod spread;
mod string;
mod template;

#[cfg(test)]
mod tests;

use self::{
    comment::{HashbangComment, MultiLineComment, SingleLineComment},
    cursor::Cursor,
    identifier::Identifier,
    number::NumberLiteral,
    operator::Operator,
    private_identifier::PrivateIdentifier,
    regex::RegexLiteral,
    spread::SpreadLiteral,
    string::StringLiteral,
    template::TemplateLiteral,
};
use crate::source::{ReadChar, UTF8Input};
use boa_ast::{PositionGroup, Punctuator};
use boa_interner::Interner;

pub use self::{
    error::Error,
    token::{Token, TokenKind},
};

trait Tokenizer<R> {
    /// Lexes the next token.
    fn lex(
        &mut self,
        cursor: &mut Cursor<R>,
        start_pos: PositionGroup,
        interner: &mut Interner,
    ) -> Result<Token, Error>
    where
        R: ReadChar;
}

/// Lexer or tokenizer for the Boa JavaScript Engine.
#[derive(Debug)]
pub struct Lexer<R> {
    cursor: Cursor<R>,
    goal_symbol: InputElement,
}

impl<R> Lexer<R> {
    /// Sets the goal symbol for the lexer.
    pub(crate) fn set_goal(&mut self, elm: InputElement) {
        self.goal_symbol = elm;
    }

    /// Gets the goal symbol the lexer is currently using.
    pub(crate) const fn get_goal(&self) -> InputElement {
        self.goal_symbol
    }

    /// Returns if strict mode is currently active.
    pub(super) const fn strict(&self) -> bool {
        self.cursor.strict()
    }

    /// Sets the current strict mode.
    pub(super) fn set_strict(&mut self, strict: bool) {
        self.cursor.set_strict(strict);
    }

    /// Returns if module mode is currently active.
    pub(super) const fn module(&self) -> bool {
        self.cursor.module()
    }

    /// Signals that the goal symbol is a module
    pub(super) fn set_module(&mut self, module: bool) {
        self.cursor.set_module(module);
    }

    /// Creates a new lexer.
    pub fn new(reader: R) -> Self
    where
        R: ReadChar,
    {
        Self {
            cursor: Cursor::new(reader),
            goal_symbol: InputElement::default(),
        }
    }

    /// Handles lexing of a token starting '/' with the '/' already being consumed.
    /// This could be a divide symbol or the start of a regex.
    ///
    /// If `init_with_eq` is `true`, assume that '/=' has already been consumed.
    ///
    /// A '/' symbol can always be a comment but if as tested above it is not then
    /// that means it could be multiple different tokens depending on the input token.
    ///
    /// As per <https://tc39.es/ecma262/#sec-ecmascript-language-lexical-grammar>
    pub(crate) fn lex_slash_token(
        &mut self,
        start: PositionGroup,
        interner: &mut Interner,
        init_with_eq: bool,
    ) -> Result<Token, Error>
    where
        R: ReadChar,
    {
        if let Some(c) = self.cursor.peek_char()? {
            match (c, init_with_eq) {
                // /
                (0x002F, false) => {
                    self.cursor.next_char()?.expect("/ token vanished"); // Consume the '/'
                    SingleLineComment.lex(&mut self.cursor, start, interner)
                }
                // *
                (0x002A, false) => {
                    self.cursor.next_char()?.expect("* token vanished"); // Consume the '*'
                    MultiLineComment.lex(&mut self.cursor, start, interner)
                }
                (ch, init_with_eq) => {
                    match self.get_goal() {
                        InputElement::Div | InputElement::TemplateTail => {
                            // Only div punctuator allowed, regex not.

                            // =
                            if init_with_eq || ch == 0x003D {
                                // if `=` is not consumed, consume it
                                if !init_with_eq {
                                    // Indicates this is an AssignDiv.
                                    // Consume the '='
                                    self.cursor.next_char()?.expect("= token vanished");
                                }
                                Ok(Token::new_by_position_group(
                                    Punctuator::AssignDiv.into(),
                                    start,
                                    self.cursor.pos_group(),
                                ))
                            } else {
                                Ok(Token::new_by_position_group(
                                    Punctuator::Div.into(),
                                    start,
                                    self.cursor.pos_group(),
                                ))
                            }
                        }
                        InputElement::RegExp | InputElement::HashbangOrRegExp => {
                            // Can be a regular expression.
                            RegexLiteral::new(init_with_eq).lex(&mut self.cursor, start, interner)
                        }
                    }
                }
            }
        } else {
            Ok(Token::new_by_position_group(
                Punctuator::Div.into(),
                start,
                self.cursor.pos_group(),
            ))
        }
    }

    /// Skips an HTML close comment (`-->`) if the `annex-b` feature is enabled.
    pub(crate) fn skip_html_close(&mut self, interner: &mut Interner) -> Result<(), Error>
    where
        R: ReadChar,
    {
        if cfg!(not(feature = "annex-b")) || self.module() {
            return Ok(());
        }

        while self.cursor.peek_char()?.is_some_and(is_whitespace) {
            let _next = self.cursor.next_char();
        }

        // -->
        if self.cursor.peek_n(3)?[..3] == [Some(0x2D), Some(0x2D), Some(0x3E)] {
            let _next = self.cursor.next_char();
            let _next = self.cursor.next_char();
            let _next = self.cursor.next_char();

            let start = self.cursor.pos_group();
            SingleLineComment.lex(&mut self.cursor, start, interner)?;
        }

        Ok(())
    }

    /// Retrieves the next token from the lexer.
    ///
    /// # Errors
    ///
    /// Will return `Err` on invalid tokens and invalid reads of the bytes being lexed.
    // We intentionally don't implement Iterator trait as Result<Option> is cleaner to handle.
    pub(crate) fn next_no_skip(&mut self, interner: &mut Interner) -> Result<Option<Token>, Error>
    where
        R: ReadChar,
    {
        let mut start = self.cursor.pos_group();
        let Some(mut next_ch) = self.cursor.next_char()? else {
            return Ok(None);
        };

        // If the goal symbol is HashbangOrRegExp, then we need to check if the next token is a hashbang comment.
        // Since the goal symbol is only valid for the first token, we need to change it to RegExp after the first token.
        if self.get_goal() == InputElement::HashbangOrRegExp {
            self.set_goal(InputElement::RegExp);
            if next_ch == 0x23 && self.cursor.peek_char()? == Some(0x21) {
                let _token = HashbangComment.lex(&mut self.cursor, start, interner);
                return self.next(interner);
            }
        }

        // Ignore whitespace
        if is_whitespace(next_ch) {
            loop {
                start = self.cursor.pos_group();
                let Some(next) = self.cursor.next_char()? else {
                    return Ok(None);
                };
                if !is_whitespace(next) {
                    next_ch = next;
                    break;
                }
            }
        }

        if let Ok(c) = char::try_from(next_ch) {
            let token = match c {
                '\r' | '\n' | '\u{2028}' | '\u{2029}' => Ok(Token::new_by_position_group(
                    TokenKind::LineTerminator,
                    start,
                    self.cursor.pos_group(),
                )),
                '"' | '\'' => StringLiteral::new(c).lex(&mut self.cursor, start, interner),
                '`' => TemplateLiteral.lex(&mut self.cursor, start, interner),
                ';' => Ok(Token::new_by_position_group(
                    Punctuator::Semicolon.into(),
                    start,
                    self.cursor.pos_group(),
                )),
                ':' => Ok(Token::new_by_position_group(
                    Punctuator::Colon.into(),
                    start,
                    self.cursor.pos_group(),
                )),
                '.' => {
                    if self
                        .cursor
                        .peek_char()?
                        .as_ref()
                        .is_some_and(|c| (0x30..=0x39/* 0..=9 */).contains(c))
                    {
                        NumberLiteral::new(b'.').lex(&mut self.cursor, start, interner)
                    } else {
                        SpreadLiteral::new().lex(&mut self.cursor, start, interner)
                    }
                }
                '(' => Ok(Token::new_by_position_group(
                    Punctuator::OpenParen.into(),
                    start,
                    self.cursor.pos_group(),
                )),
                ')' => Ok(Token::new_by_position_group(
                    Punctuator::CloseParen.into(),
                    start,
                    self.cursor.pos_group(),
                )),
                ',' => Ok(Token::new_by_position_group(
                    Punctuator::Comma.into(),
                    start,
                    self.cursor.pos_group(),
                )),
                '{' => Ok(Token::new_by_position_group(
                    Punctuator::OpenBlock.into(),
                    start,
                    self.cursor.pos_group(),
                )),
                '}' => Ok(Token::new_by_position_group(
                    Punctuator::CloseBlock.into(),
                    start,
                    self.cursor.pos_group(),
                )),
                '[' => Ok(Token::new_by_position_group(
                    Punctuator::OpenBracket.into(),
                    start,
                    self.cursor.pos_group(),
                )),
                ']' => Ok(Token::new_by_position_group(
                    Punctuator::CloseBracket.into(),
                    start,
                    self.cursor.pos_group(),
                )),
                '#' => PrivateIdentifier::new().lex(&mut self.cursor, start, interner),
                '/' => self.lex_slash_token(start, interner, false),
                #[cfg(feature = "annex-b")]
                // <!--
                '<' if !self.module()
                    && self.cursor.peek_n(3)?[..3] == [Some(0x21), Some(0x2D), Some(0x2D)] =>
                {
                    let _next = self.cursor.next_char();
                    let _next = self.cursor.next_char();
                    let _next = self.cursor.next_char();
                    let start = self.cursor.pos_group();
                    SingleLineComment.lex(&mut self.cursor, start, interner)
                }
                #[allow(clippy::cast_possible_truncation)]
                '=' | '*' | '+' | '-' | '%' | '|' | '&' | '^' | '<' | '>' | '!' | '~' | '?' => {
                    Operator::new(next_ch as u8).lex(&mut self.cursor, start, interner)
                }
                '\\' if self.cursor.peek_char()? == Some(0x0075 /* u */) => {
                    Identifier::new(c).lex(&mut self.cursor, start, interner)
                }
                _ if Identifier::is_identifier_start(c as u32) => {
                    Identifier::new(c).lex(&mut self.cursor, start, interner)
                }
                #[allow(clippy::cast_possible_truncation)]
                _ if c.is_ascii_digit() => {
                    NumberLiteral::new(next_ch as u8).lex(&mut self.cursor, start, interner)
                }
                _ => {
                    let details = format!("unexpected '{c}'");
                    Err(Error::syntax(details, start.position()))
                }
            }?;

            Ok(Some(token))
        } else {
            Err(Error::syntax(
                format!(
                    "unexpected utf-8 char '\\u{next_ch}' at line {}, column {}",
                    start.line_number(),
                    start.column_number()
                ),
                start.position(),
            ))
        }
    }

    /// Retrieves the next token from the lexer, skipping comments.
    ///
    /// # Errors
    ///
    /// Will return `Err` on invalid tokens and invalid reads of the bytes being lexed.
    // We intentionally don't implement Iterator trait as Result<Option> is cleaner to handle.
    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self, interner: &mut Interner) -> Result<Option<Token>, Error>
    where
        R: ReadChar,
    {
        loop {
            let Some(next) = self.next_no_skip(interner)? else {
                return Ok(None);
            };

            if next.kind() != &TokenKind::Comment {
                return Ok(Some(next));
            }
        }
    }

    /// Performs the lexing of a template literal.
    pub(crate) fn lex_template(
        &mut self,
        start: PositionGroup,
        interner: &mut Interner,
    ) -> Result<Token, Error>
    where
        R: ReadChar,
    {
        TemplateLiteral.lex(&mut self.cursor, start, interner)
    }

    pub(super) fn take_source(&mut self) -> boa_ast::SourceText {
        self.cursor.take_source()
    }
}

impl<'a> From<&'a [u8]> for Lexer<UTF8Input<&'a [u8]>> {
    fn from(input: &'a [u8]) -> Self {
        Self::new(UTF8Input::new(input))
    }
}

/// ECMAScript goal symbols.
///
/// <https://tc39.es/ecma262/#sec-ecmascript-language-lexical-grammar>
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) enum InputElement {
    Div,
    #[default]
    RegExp,
    TemplateTail,
    HashbangOrRegExp,
}

/// Checks if a character is whitespace as per ECMAScript standards.
///
/// The Rust `char::is_whitespace` function and the ECMAScript standard use different sets of
/// characters as whitespaces:
///  * Rust uses `\p{White_Space}`,
///  * ECMAScript standard uses `\{Space_Separator}` + `\u{0009}`, `\u{000B}`, `\u{000C}`, `\u{FEFF}`
///
/// [More information](https://tc39.es/ecma262/#table-32)
const fn is_whitespace(ch: u32) -> bool {
    matches!(
        ch,
        0x0020 | 0x0009 | 0x000B | 0x000C | 0x00A0 | 0xFEFF |
            // Unicode Space_Separator category (minus \u{0020} and \u{00A0} which are already stated above)
            0x1680 | 0x2000..=0x200A | 0x202F | 0x205F | 0x3000
    )
}
