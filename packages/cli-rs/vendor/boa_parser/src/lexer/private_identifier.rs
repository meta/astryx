//! Boa's lexing for ECMAScript private identifiers (#foo, #myvar, etc.).

use crate::lexer::{Cursor, Error, Token, TokenKind, Tokenizer, identifier::Identifier};
use crate::source::ReadChar;
use boa_ast::PositionGroup;
use boa_interner::Interner;

/// Private Identifier lexing.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-PrivateIdentifier
#[derive(Debug, Clone, Copy)]
pub(super) struct PrivateIdentifier;

impl PrivateIdentifier {
    /// Creates a new private identifier lexer.
    pub(super) const fn new() -> Self {
        Self
    }
}

impl<R> Tokenizer<R> for PrivateIdentifier {
    fn lex(
        &mut self,
        cursor: &mut Cursor<R>,
        start_pos: PositionGroup,
        interner: &mut Interner,
    ) -> Result<Token, Error>
    where
        R: ReadChar,
    {
        let Some(next_ch) = cursor.next_char()? else {
            return Err(Error::syntax(
                "Abrupt end: Expecting private identifier",
                start_pos,
            ));
        };

        let Ok(c) = char::try_from(next_ch) else {
            return Err(Error::syntax(
                format!(
                    "unexpected utf-8 char '\\u{next_ch}' at line {}, column {}",
                    start_pos.line_number(),
                    start_pos.column_number()
                ),
                start_pos,
            ));
        };

        match c {
            '\\' if cursor.peek_char()? == Some(0x0075 /* u */) => {
                let (name, _) = Identifier::take_identifier_name(cursor, start_pos, c)?;
                Ok(Token::new_by_position_group(
                    TokenKind::PrivateIdentifier(interner.get_or_intern(name.as_str())),
                    start_pos,
                    cursor.pos_group(),
                ))
            }
            _ if Identifier::is_identifier_start(c as u32) => {
                let (name, _) = Identifier::take_identifier_name(cursor, start_pos, c)?;
                Ok(Token::new_by_position_group(
                    TokenKind::PrivateIdentifier(interner.get_or_intern(name.as_str())),
                    start_pos,
                    cursor.pos_group(),
                ))
            }
            _ => Err(Error::syntax(
                "Abrupt end: Expecting private identifier",
                start_pos,
            )),
        }
    }
}
