//! Exponentiation operator parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Exponentiation
//! [spec]: https://tc39.es/ecma262/#sec-exp-operator

use crate::{
    lexer::TokenKind,
    parser::{
        AllowAwait, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::{
            FormalParameterListOrExpression, unary::UnaryExpression, update::UpdateExpression,
        },
    },
    source::ReadChar,
};
use boa_ast::{
    Keyword, Punctuator,
    expression::operator::{Binary, binary::ArithmeticOp},
};
use boa_interner::Interner;

/// Parses an exponentiation expression.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Exponentiation
/// [spec]: https://tc39.es/ecma262/#prod-ExponentiationExpression
#[derive(Debug, Clone, Copy)]
pub(in crate::parser::expression) struct ExponentiationExpression {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl ExponentiationExpression {
    /// Creates a new `ExponentiationExpression` parser.
    pub(in crate::parser::expression) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for ExponentiationExpression
where
    R: ReadChar,
{
    type Output = FormalParameterListOrExpression;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let next = cursor.peek(0, interner).or_abrupt()?;
        match next.kind() {
            TokenKind::Keyword((Keyword::Delete | Keyword::Void | Keyword::TypeOf, _))
            | TokenKind::Punctuator(
                Punctuator::Add | Punctuator::Sub | Punctuator::Not | Punctuator::Neg,
            ) => {
                return UnaryExpression::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner);
            }
            TokenKind::Keyword((Keyword::Await, _)) if self.allow_await.0 => {
                return UnaryExpression::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner);
            }
            _ => {}
        }

        let lhs =
            UpdateExpression::new(self.allow_yield, self.allow_await).parse(cursor, interner)?;
        let FormalParameterListOrExpression::Expression(lhs) = lhs else {
            return Ok(lhs);
        };

        if let Some(tok) = cursor.peek(0, interner)?
            && tok.kind() == &TokenKind::Punctuator(Punctuator::Exp)
        {
            cursor.advance(interner);
            return Ok(Binary::new(
                ArithmeticOp::Exp.into(),
                lhs,
                self.parse(cursor, interner)?.try_into_expression()?,
            )
            .into());
        }
        Ok(lhs.into())
    }
}
