use crate::{
    Error,
    lexer::TokenKind,
    parser::{
        AllowAwait, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser, expression::Expression,
    },
    source::ReadChar,
};
use boa_ast::{Keyword, Punctuator, Spanned, Statement};
use boa_interner::Interner;

/// Expression statement parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ExpressionStatement
#[derive(Debug, Clone, Copy)]
pub(in crate::parser::statement) struct ExpressionStatement {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl ExpressionStatement {
    /// Creates a new `ExpressionStatement` parser.
    pub(in crate::parser::statement) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for ExpressionStatement
where
    R: ReadChar,
{
    type Output = Statement;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let next_token = cursor.peek(0, interner).or_abrupt()?;
        match next_token.kind() {
            TokenKind::Keyword((Keyword::Function | Keyword::Class, true)) => {
                return Err(Error::general(
                    "Keyword must not contain escaped characters",
                    next_token.span().start(),
                ));
            }
            TokenKind::Keyword((Keyword::Function | Keyword::Class, false)) => {
                return Err(Error::general(
                    "expected statement",
                    next_token.span().start(),
                ));
            }
            TokenKind::Keyword((Keyword::Async, false)) => {
                let skip_n = if cursor.peek_is_line_terminator(0, interner).or_abrupt()? {
                    2
                } else {
                    1
                };
                let is_line_terminator = cursor
                    .peek_is_line_terminator(skip_n, interner)?
                    .unwrap_or(true);

                if !is_line_terminator {
                    let next_token = cursor.peek(1, interner).or_abrupt()?;
                    match next_token.kind() {
                        TokenKind::Keyword((Keyword::Function, true)) => {
                            return Err(Error::general(
                                "Keyword must not contain escaped characters",
                                next_token.span().start(),
                            ));
                        }
                        TokenKind::Keyword((Keyword::Function, false)) => {
                            return Err(Error::general(
                                "expected statement",
                                next_token.span().start(),
                            ));
                        }
                        _ => {}
                    }
                }
            }
            TokenKind::Keyword((Keyword::Let, false)) => {
                let next_token = cursor.peek(1, interner).or_abrupt()?;
                if next_token.kind() == &TokenKind::Punctuator(Punctuator::OpenBracket) {
                    return Err(Error::general(
                        "expected statement",
                        next_token.span().start(),
                    ));
                }
            }
            _ => {}
        }

        let expr =
            Expression::new(true, self.allow_yield, self.allow_await).parse(cursor, interner)?;

        cursor.expect_semicolon("expression statement", interner)?;

        Ok(expr.into())
    }
}
