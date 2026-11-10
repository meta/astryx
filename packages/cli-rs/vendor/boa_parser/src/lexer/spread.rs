//! Boa's lexing for ECMAScript spread (...) literals.

use crate::lexer::{Cursor, Error, Token, Tokenizer};
use crate::source::ReadChar;
use boa_ast::{PositionGroup, Punctuator};
use boa_interner::Interner;

/// Spread literal lexing.
///
/// Note: expects for the initializer `'` or `"` to already be consumed from the cursor.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-SpreadElement
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax
#[derive(Debug, Clone, Copy)]
pub(super) struct SpreadLiteral;

impl SpreadLiteral {
    /// Creates a new string literal lexer.
    pub(super) const fn new() -> Self {
        Self
    }
}

impl<R> Tokenizer<R> for SpreadLiteral {
    fn lex(
        &mut self,
        cursor: &mut Cursor<R>,
        start_pos: PositionGroup,
        _interner: &mut Interner,
    ) -> Result<Token, Error>
    where
        R: ReadChar,
    {
        // . or ...
        if cursor.next_if(0x2E /* . */)? {
            if cursor.next_if(0x2E /* . */)? {
                Ok(Token::new_by_position_group(
                    Punctuator::Spread.into(),
                    start_pos,
                    cursor.pos_group(),
                ))
            } else {
                Err(Error::syntax(
                    "Expecting Token '.' as part of spread",
                    cursor.pos(),
                ))
            }
        } else {
            Ok(Token::new_by_position_group(
                Punctuator::Dot.into(),
                start_pos,
                cursor.pos_group(),
            ))
        }
    }
}
