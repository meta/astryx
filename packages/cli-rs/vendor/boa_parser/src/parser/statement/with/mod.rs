//! With statement parsing.

use crate::{
    Error,
    parser::{
        AllowAwait, AllowReturn, AllowYield, ParseResult, TokenParser, cursor::Cursor,
        expression::Expression, statement::Statement,
    },
    source::ReadChar,
};
use boa_ast::{Keyword, Punctuator, Spanned, statement::With};
use boa_interner::Interner;

/// With statement parsing.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/with
/// [spec]: https://tc39.es/ecma262/#prod-WithStatement
#[derive(Debug, Clone, Copy)]
pub(in crate::parser::statement) struct WithStatement {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    allow_return: AllowReturn,
}

impl WithStatement {
    /// Creates a new `WithStatement` parser.
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

impl<R> TokenParser<R> for WithStatement
where
    R: ReadChar,
{
    type Output = With;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let position = cursor
            .expect((Keyword::With, false), "with statement", interner)?
            .span()
            .start();

        // It is a Syntax Error if the source text matched by this production is contained in strict mode code.
        if cursor.strict() {
            return Err(Error::general(
                "with statement not allowed in strict mode",
                position,
            ));
        }

        cursor.expect(Punctuator::OpenParen, "with statement", interner)?;
        let expression =
            Expression::new(true, self.allow_yield, self.allow_await).parse(cursor, interner)?;
        let position = cursor
            .expect(Punctuator::CloseParen, "with statement", interner)?
            .span()
            .end();
        let statement = Statement::new(self.allow_yield, self.allow_await, self.allow_return)
            .parse(cursor, interner)?;

        // It is a Syntax Error if IsLabelledFunction(Statement) is true.
        if statement.is_labelled_function() {
            return Err(Error::wrong_labelled_function_declaration(position));
        }

        Ok(With::new(expression, statement))
    }
}
