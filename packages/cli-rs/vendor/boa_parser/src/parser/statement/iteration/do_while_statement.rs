//! Do-while statement parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/do...while
//! [spec]: https://tc39.es/ecma262/#sec-do-while-statement

use crate::{
    Error,
    lexer::{Token, TokenKind},
    parser::{
        AllowAwait, AllowReturn, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::Expression, statement::Statement,
    },
    source::ReadChar,
};
use boa_ast::{Keyword, Punctuator, Spanned, statement::DoWhileLoop};
use boa_interner::Interner;

/// Do...while statement parsing
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/do...while
/// [spec]: https://tc39.es/ecma262/#sec-do-while-statement
#[derive(Debug, Clone, Copy)]
pub(in crate::parser::statement) struct DoWhileStatement {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    allow_return: AllowReturn,
}

impl DoWhileStatement {
    /// Creates a new `DoWhileStatement` parser.
    pub(in crate::parser::statement) fn new<Y, A, R>(
        allow_yield: Y,
        allow_await: A,
        allow_return: R,
    ) -> Self
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

impl<R> TokenParser<R> for DoWhileStatement
where
    R: ReadChar,
{
    type Output = DoWhileLoop;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect((Keyword::Do, false), "do while statement", interner)?;

        let position = cursor.peek(0, interner).or_abrupt()?.span().start();

        let body = Statement::new(self.allow_yield, self.allow_await, self.allow_return)
            .parse(cursor, interner)?;

        // Early Error: It is a Syntax Error if IsLabelledFunction(Statement) is true.
        if body.is_labelled_function() {
            return Err(Error::wrong_labelled_function_declaration(position));
        }

        let next_token = cursor.peek(0, interner).or_abrupt()?;
        match next_token.kind() {
            TokenKind::Keyword((Keyword::While, true)) => {
                return Err(Error::general(
                    "Keyword must not contain escaped characters",
                    next_token.span().start(),
                ));
            }
            TokenKind::Keyword((Keyword::While, false)) => {}
            _ => {
                return Err(Error::expected(
                    ["while".to_owned()],
                    next_token.to_string(interner),
                    next_token.span(),
                    "do while statement",
                ));
            }
        }

        cursor.expect((Keyword::While, false), "do while statement", interner)?;

        cursor.expect(Punctuator::OpenParen, "do while statement", interner)?;

        let cond =
            Expression::new(true, self.allow_yield, self.allow_await).parse(cursor, interner)?;

        cursor.expect(Punctuator::CloseParen, "do while statement", interner)?;

        // Here, we only care to read the next token if it's a semicolon. If it's not, we
        // automatically "enter" or assume a semicolon, since we have just read the `)` token:
        // https://tc39.es/ecma262/#sec-automatic-semicolon-insertion
        if cursor.peek(0, interner)?.map(Token::kind)
            == Some(&TokenKind::Punctuator(Punctuator::Semicolon))
        {
            cursor.advance(interner);
        }

        Ok(DoWhileLoop::new(body, cond))
    }
}
