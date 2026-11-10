//! Update expression parsing.
//!
//! More information:
//!  - [ECMAScript specification][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-update-expressions

use crate::{
    Error,
    lexer::{Error as LexError, TokenKind},
    parser::{
        AllowAwait, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::{
            FormalParameterListOrExpression, check_strict_arguments_or_eval,
            left_hand_side::LeftHandSideExpression, unary::UnaryExpression,
        },
    },
    source::ReadChar,
};
use boa_ast::{
    Expression, Position, Punctuator, Span, Spanned,
    expression::operator::{
        Update,
        update::{UpdateOp, UpdateTarget},
    },
};
use boa_interner::Interner;

/// Parses an update expression.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-UpdateExpression
#[derive(Debug, Clone, Copy)]
pub(super) struct UpdateExpression {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl UpdateExpression {
    /// Creates a new `UpdateExpression` parser.
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

/// Check if the assignment target type is simple and return the target as an `UpdateTarget`.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-static-semantics-assignmenttargettype
fn as_simple(
    expr: &Expression,
    position: Position,
    strict: bool,
) -> ParseResult<Option<UpdateTarget>> {
    match expr {
        Expression::Identifier(ident) => {
            if strict {
                check_strict_arguments_or_eval(*ident, position)?;
            }
            Ok(Some(UpdateTarget::Identifier(*ident)))
        }
        Expression::PropertyAccess(access) => {
            Ok(Some(UpdateTarget::PropertyAccess(access.clone())))
        }
        Expression::Parenthesized(p) => as_simple(p.expression(), position, strict),
        _ => Ok(None),
    }
}

impl<R> TokenParser<R> for UpdateExpression
where
    R: ReadChar,
{
    type Output = FormalParameterListOrExpression;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let tok = cursor.peek(0, interner).or_abrupt()?;
        let position = tok.span().start();
        match tok.kind() {
            TokenKind::Punctuator(Punctuator::Inc) => {
                cursor
                    .next(interner)?
                    .expect("Punctuator::Inc token disappeared");

                let target = UnaryExpression::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?
                    .try_into_expression()?;
                let target_span_end = target.span().end();

                // https://tc39.es/ecma262/#sec-update-expressions-static-semantics-early-errors
                return (as_simple(&target, position, cursor.strict())?).map_or_else(
                    || {
                        Err(Error::lex(LexError::Syntax(
                            "Invalid left-hand side in assignment".into(),
                            position,
                        )))
                    },
                    |target| {
                        Ok(Update::new(
                            UpdateOp::IncrementPre,
                            target,
                            Span::new(position, target_span_end),
                        )
                        .into())
                    },
                );
            }
            TokenKind::Punctuator(Punctuator::Dec) => {
                cursor
                    .next(interner)?
                    .expect("Punctuator::Dec token disappeared");

                let target = UnaryExpression::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?
                    .try_into_expression()?;
                let target_span_end = target.span().end();

                // https://tc39.es/ecma262/#sec-update-expressions-static-semantics-early-errors
                return (as_simple(&target, position, cursor.strict())?).map_or_else(
                    || {
                        Err(Error::lex(LexError::Syntax(
                            "Invalid left-hand side in assignment".into(),
                            position,
                        )))
                    },
                    |target| {
                        Ok(Update::new(
                            UpdateOp::DecrementPre,
                            target,
                            Span::new(position, target_span_end),
                        )
                        .into())
                    },
                );
            }
            _ => {}
        }

        let lhs = LeftHandSideExpression::new(self.allow_yield, self.allow_await)
            .parse(cursor, interner)?;
        let FormalParameterListOrExpression::Expression(lhs) = lhs else {
            return Ok(lhs);
        };
        let lhs_span_start = lhs.span().start();

        if cursor.peek_is_line_terminator(0, interner)?.unwrap_or(true) {
            return Ok(lhs.into());
        }

        if let Some(tok) = cursor.peek(0, interner)? {
            let token_start = tok.span().start();
            let token_end = tok.span().end();
            match tok.kind() {
                TokenKind::Punctuator(Punctuator::Inc) => {
                    cursor
                        .next(interner)?
                        .expect("Punctuator::Inc token disappeared");

                    // https://tc39.es/ecma262/#sec-update-expressions-static-semantics-early-errors
                    return (as_simple(&lhs, position, cursor.strict())?).map_or_else(
                        || {
                            Err(Error::lex(LexError::Syntax(
                                "Invalid left-hand side in assignment".into(),
                                token_start,
                            )))
                        },
                        |target| {
                            Ok(Update::new(
                                UpdateOp::IncrementPost,
                                target,
                                Span::new(lhs_span_start, token_end),
                            )
                            .into())
                        },
                    );
                }
                TokenKind::Punctuator(Punctuator::Dec) => {
                    cursor
                        .next(interner)?
                        .expect("Punctuator::Dec token disappeared");

                    // https://tc39.es/ecma262/#sec-update-expressions-static-semantics-early-errors
                    return (as_simple(&lhs, position, cursor.strict())?).map_or_else(
                        || {
                            Err(Error::lex(LexError::Syntax(
                                "Invalid left-hand side in assignment".into(),
                                token_start,
                            )))
                        },
                        |target| {
                            Ok(Update::new(
                                UpdateOp::DecrementPost,
                                target,
                                Span::new(lhs_span_start, token_end),
                            )
                            .into())
                        },
                    );
                }
                _ => {}
            }
        }

        Ok(lhs.into())
    }
}
