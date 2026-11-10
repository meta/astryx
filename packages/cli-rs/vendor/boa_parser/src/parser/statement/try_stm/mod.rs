mod catch;
mod finally;

#[cfg(test)]
mod tests;

use self::{catch::Catch, finally::Finally};
use super::block::Block;
use crate::{
    Error,
    lexer::TokenKind,
    parser::{AllowAwait, AllowReturn, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser},
    source::ReadChar,
};
use boa_ast::{
    Keyword, Spanned,
    statement::{ErrorHandler, Try},
};
use boa_interner::Interner;

/// Try...catch statement parsing
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch
/// [spec]: https://tc39.es/ecma262/#sec-try-statement
#[derive(Debug, Clone, Copy)]
pub(super) struct TryStatement {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    allow_return: AllowReturn,
}

impl TryStatement {
    /// Creates a new `TryStatement` parser.
    pub(super) fn new<Y, A, R>(allow_yield: Y, allow_await: A, allow_return: R) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
        R: Into<AllowReturn>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            allow_return: allow_return.into(),
        }
    }
}

impl<R> TokenParser<R> for TryStatement
where
    R: ReadChar,
{
    type Output = Try;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        // TRY
        cursor.expect((Keyword::Try, false), "try statement", interner)?;

        let try_clause = Block::new(self.allow_yield, self.allow_await, self.allow_return)
            .parse(cursor, interner)?;

        let next_token = cursor.peek(0, interner).or_abrupt()?;
        match next_token.kind() {
            TokenKind::Keyword((Keyword::Catch | Keyword::Finally, true)) => {
                return Err(Error::general(
                    "Keyword must not contain escaped characters",
                    next_token.span().start(),
                ));
            }
            TokenKind::Keyword((Keyword::Catch | Keyword::Finally, false)) => {}
            _ => {
                return Err(Error::expected(
                    ["catch".to_owned(), "finally".to_owned()],
                    next_token.to_string(interner),
                    next_token.span(),
                    "try statement",
                ));
            }
        }

        let catch = if next_token.kind() == &TokenKind::Keyword((Keyword::Catch, false)) {
            Some(
                Catch::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)?,
            )
        } else {
            None
        };

        let next_token = cursor.peek(0, interner)?;
        let finally = if let Some(token) = next_token {
            match token.kind() {
                TokenKind::Keyword((Keyword::Finally, true)) => {
                    return Err(Error::general(
                        "Keyword must not contain escaped characters",
                        token.span().start(),
                    ));
                }
                TokenKind::Keyword((Keyword::Finally, false)) => Some(
                    Finally::new(self.allow_yield, self.allow_await, self.allow_return)
                        .parse(cursor, interner)?,
                ),
                _ => None,
            }
        } else {
            None
        };

        let handler = match (catch, finally) {
            (Some(catch), None) => ErrorHandler::Catch(catch),
            (None, Some(finally)) => ErrorHandler::Finally(finally),
            (Some(catch), Some(finally)) => ErrorHandler::Full(catch, finally),
            (None, None) => unreachable!(),
        };

        Ok(Try::new(try_clause, handler))
    }
}
