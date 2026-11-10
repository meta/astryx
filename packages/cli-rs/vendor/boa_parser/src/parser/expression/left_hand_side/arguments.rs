//! Argument parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Glossary/Argument
//! [spec]: https://tc39.es/ecma262/#prod-Arguments

use crate::{
    Error,
    lexer::{InputElement, TokenKind},
    parser::{
        AllowAwait, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::AssignmentExpression,
    },
    source::ReadChar,
};
use boa_ast::{Expression, Punctuator, Span, Spanned, expression::Spread};
use boa_interner::Interner;

/// Parses a list of arguments.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Glossary/Argument
/// [spec]: https://tc39.es/ecma262/#prod-Arguments
#[derive(Debug, Clone, Copy)]
pub(in crate::parser::expression) struct Arguments {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl Arguments {
    /// Creates a new `Arguments` parser.
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

impl<R> TokenParser<R> for Arguments
where
    R: ReadChar,
{
    type Output = (Box<[Expression]>, Span);

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let start = cursor
            .expect(Punctuator::OpenParen, "arguments", interner)?
            .span()
            .start();

        let mut args = Vec::new();
        let end = loop {
            cursor.set_goal(InputElement::RegExp);
            let next_token = cursor.peek(0, interner).or_abrupt()?;

            match next_token.kind() {
                TokenKind::Punctuator(Punctuator::CloseParen) => {
                    let end = next_token.span().end();
                    cursor.advance(interner);
                    break end;
                }
                TokenKind::Punctuator(Punctuator::Comma) => {
                    let next_token = cursor.next(interner)?.expect(", token vanished"); // Consume the token.

                    if args.is_empty() {
                        return Err(Error::expected(
                            [String::from("expression")],
                            next_token.to_string(interner),
                            next_token.span(),
                            "call",
                        ));
                    }

                    if let Some(next) = cursor.next_if(Punctuator::CloseParen, interner)? {
                        break next.span().end();
                    }
                }
                _ => {
                    if !args.is_empty() {
                        return Err(Error::expected(
                            [",".to_owned(), ")".to_owned()],
                            next_token.to_string(interner),
                            next_token.span(),
                            "argument list",
                        ));
                    }
                }
            }

            if let Some(spread_token) = cursor.next_if(Punctuator::Spread, interner)? {
                let target = AssignmentExpression::new(true, self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?;
                let target_span_end = target.span().end();

                args.push(
                    Spread::new(
                        target,
                        Span::new(spread_token.span().start(), target_span_end),
                    )
                    .into(),
                );
            } else {
                args.push(
                    AssignmentExpression::new(true, self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?,
                );
            }
        };
        cursor.set_goal(InputElement::Div);
        Ok((args.into_boxed_slice(), Span::new(start, end)))
    }
}
