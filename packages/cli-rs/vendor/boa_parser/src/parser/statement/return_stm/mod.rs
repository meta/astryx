use crate::{
    lexer::{Token, TokenKind},
    parser::{
        AllowAwait, AllowYield, ParseResult, TokenParser,
        cursor::{Cursor, SemicolonResult},
        expression::Expression,
    },
    source::ReadChar,
};
use boa_ast::{Keyword, Punctuator, statement::Return};
use boa_interner::Interner;

/// Return statement parsing
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/return
/// [spec]: https://tc39.es/ecma262/#prod-ReturnStatement
#[derive(Debug, Clone, Copy)]
pub(super) struct ReturnStatement {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl ReturnStatement {
    /// Creates a new `ReturnStatement` parser.
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

impl<R> TokenParser<R> for ReturnStatement
where
    R: ReadChar,
{
    type Output = Return;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect((Keyword::Return, false), "return statement", interner)?;

        if let SemicolonResult::Found(tok) = cursor.peek_semicolon(interner)? {
            if tok.map(Token::kind) == Some(&TokenKind::Punctuator(Punctuator::Semicolon)) {
                cursor.advance(interner);
            }

            return Ok(Return::new(None));
        }

        let expr =
            Expression::new(true, self.allow_yield, self.allow_await).parse(cursor, interner)?;

        cursor.expect_semicolon("return statement", interner)?;

        Ok(Return::new(Some(expr)))
    }
}
