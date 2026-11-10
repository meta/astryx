//! Array initializer parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array
//! [spec]: https://tc39.es/ecma262/#sec-array-initializer

#[cfg(test)]
mod tests;

use crate::{
    Error,
    lexer::{InputElement, TokenKind},
    parser::{
        AllowAwait, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::AssignmentExpression,
    },
    source::ReadChar,
};
use boa_ast::{
    Punctuator, Span, Spanned,
    expression::{Spread, literal},
};
use boa_interner::Interner;

/// Parses an array literal.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array
/// [spec]: https://tc39.es/ecma262/#prod-ArrayLiteral
#[derive(Debug, Clone, Copy)]
pub(super) struct ArrayLiteral {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl ArrayLiteral {
    /// Creates a new `ArrayLiteral` parser.
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

impl<R> TokenParser<R> for ArrayLiteral
where
    R: ReadChar,
{
    type Output = literal::ArrayLiteral;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let open_bracket_token = cursor.expect(
            TokenKind::Punctuator(Punctuator::OpenBracket),
            "array parsing",
            interner,
        )?;
        cursor.set_goal(InputElement::RegExp);

        let mut elements = Vec::new();
        let mut has_trailing_comma_spread = false;
        let mut next_comma = false;
        let mut last_spread = false;

        let end = loop {
            let token = cursor.peek(0, interner).or_abrupt()?;
            match token.kind() {
                TokenKind::Punctuator(Punctuator::CloseBracket) => {
                    let end = token.span().end();
                    cursor.advance(interner);
                    break end;
                }
                TokenKind::Punctuator(Punctuator::Comma) if next_comma => {
                    cursor.advance(interner);

                    if last_spread {
                        let token = cursor.peek(0, interner).or_abrupt()?;
                        if token.kind() == &TokenKind::Punctuator(Punctuator::CloseBracket) {
                            has_trailing_comma_spread = true;
                        }
                    }

                    next_comma = false;
                }
                TokenKind::Punctuator(Punctuator::Comma) => {
                    cursor.advance(interner);
                    elements.push(None);
                }
                TokenKind::Punctuator(Punctuator::Spread) if next_comma => {
                    return Err(Error::unexpected(
                        token.to_string(interner),
                        token.span(),
                        "expected comma or end of array",
                    ));
                }
                TokenKind::Punctuator(Punctuator::Spread) => {
                    let spread_token_span_start = token.span().start();

                    cursor.advance(interner);
                    let target =
                        AssignmentExpression::new(true, self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?;
                    let target_span_end = target.span().end();

                    elements.push(Some(
                        Spread::new(target, Span::new(spread_token_span_start, target_span_end))
                            .into(),
                    ));
                    next_comma = true;
                    last_spread = true;
                }
                _ if next_comma => {
                    return Err(Error::unexpected(
                        token.to_string(interner),
                        token.span(),
                        "expected comma or end of array",
                    ));
                }
                _ => {
                    let expr = AssignmentExpression::new(true, self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?;
                    elements.push(Some(expr));
                    next_comma = true;
                    last_spread = false;
                }
            }
        };

        if last_spread && elements.last() == Some(&None) {
            has_trailing_comma_spread = true;
        }

        let start = open_bracket_token.span().start();
        Ok(literal::ArrayLiteral::new(
            elements,
            has_trailing_comma_spread,
            Span::new(start, end),
        ))
    }
}
