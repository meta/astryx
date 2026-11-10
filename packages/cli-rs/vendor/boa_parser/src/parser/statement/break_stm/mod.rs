//! Break expression parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/break
//! [spec]: https://tc39.es/ecma262/#sec-break-statement

#[cfg(test)]
mod tests;

use crate::{
    lexer::{Token, TokenKind},
    parser::{
        AllowAwait, AllowYield, ParseResult, TokenParser,
        cursor::{Cursor, SemicolonResult},
        expression::LabelIdentifier,
    },
    source::ReadChar,
};
use boa_ast::{Keyword, Punctuator, statement::Break};
use boa_interner::Interner;

/// Break statement parsing
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/break
/// [spec]: https://tc39.es/ecma262/#prod-BreakStatement
#[derive(Debug, Clone, Copy)]
pub(super) struct BreakStatement {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl BreakStatement {
    /// Creates a new `BreakStatement` parser.
    pub(super) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
        }
    }
}

impl<R> TokenParser<R> for BreakStatement
where
    R: ReadChar,
{
    type Output = Break;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect((Keyword::Break, false), "break statement", interner)?;

        let label = if let SemicolonResult::Found(tok) = cursor.peek_semicolon(interner)? {
            if tok.map(Token::kind) == Some(&TokenKind::Punctuator(Punctuator::Semicolon)) {
                cursor.advance(interner);
            }

            None
        } else {
            let label = LabelIdentifier::new(self.allow_yield, self.allow_await)
                .parse(cursor, interner)?
                .sym();
            cursor.expect_semicolon("break statement", interner)?;

            Some(label)
        };

        Ok(Break::new(label))
    }
}
