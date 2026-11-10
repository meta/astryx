//! Boa's lexing for ECMAScript comments.

use crate::lexer::{Cursor, Error, Token, TokenKind, Tokenizer};
use crate::source::ReadChar;
use boa_ast::PositionGroup;
use boa_interner::Interner;

/// Lexes a single line comment.
///
/// Assumes that the initial '//' is already consumed.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-comments
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar
pub(super) struct SingleLineComment;

impl<R> Tokenizer<R> for SingleLineComment {
    fn lex(
        &mut self,
        cursor: &mut Cursor<R>,
        start_pos: PositionGroup,
        _interner: &mut Interner,
    ) -> Result<Token, Error>
    where
        R: ReadChar,
    {
        // Skip either to the end of the line or to the end of the input
        while let Some(ch) = cursor.peek_char()? {
            let tried_ch = char::try_from(ch);
            match tried_ch {
                Ok(c) if c == '\r' || c == '\n' || c == '\u{2028}' || c == '\u{2029}' => break,
                _ => {}
            }
            cursor.next_char().expect("Comment character vanished");
        }
        Ok(Token::new_by_position_group(
            TokenKind::Comment,
            start_pos,
            cursor.pos_group(),
        ))
    }
}

/// Lexes a block (multi-line) comment.
///
/// Assumes that the initial '/*' is already consumed.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-comments
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar
pub(super) struct MultiLineComment;

impl<R> Tokenizer<R> for MultiLineComment {
    fn lex(
        &mut self,
        cursor: &mut Cursor<R>,
        start_pos: PositionGroup,
        _interner: &mut Interner,
    ) -> Result<Token, Error>
    where
        R: ReadChar,
    {
        let mut new_line = false;
        while let Some(ch) = cursor.next_char()? {
            let tried_ch = char::try_from(ch);
            match tried_ch {
                Ok(c) if c == '*' && cursor.next_if(0x2F /* / */)? => {
                    return Ok(Token::new_by_position_group(
                        if new_line {
                            TokenKind::LineTerminator
                        } else {
                            TokenKind::Comment
                        },
                        start_pos,
                        cursor.pos_group(),
                    ));
                }
                Ok(c) if c == '\r' || c == '\n' || c == '\u{2028}' || c == '\u{2029}' => {
                    new_line = true;
                }
                _ => {}
            }
        }

        Err(Error::syntax(
            "unterminated multiline comment",
            cursor.pos(),
        ))
    }
}

/// Lexes a first line Hashbang comment
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ecmascript-language-lexical-grammar
pub(super) struct HashbangComment;

impl<R> Tokenizer<R> for HashbangComment {
    fn lex(
        &mut self,
        cursor: &mut Cursor<R>,
        start_pos: PositionGroup,
        _interner: &mut Interner,
    ) -> Result<Token, Error>
    where
        R: ReadChar,
    {
        while let Some(ch) = cursor.next_char()? {
            let tried_ch = char::try_from(ch);
            match tried_ch {
                Ok(c) if c == '\r' || c == '\n' || c == '\u{2028}' || c == '\u{2029}' => break,
                _ => {}
            }
        }

        Ok(Token::new_by_position_group(
            TokenKind::Comment,
            start_pos,
            cursor.pos_group(),
        ))
    }
}
