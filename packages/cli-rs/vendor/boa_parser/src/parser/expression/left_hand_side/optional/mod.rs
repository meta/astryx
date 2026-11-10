#[cfg(test)]
mod tests;

use crate::{
    Error,
    lexer::{Token, TokenKind},
    parser::{
        AllowAwait, AllowYield, OrAbrupt, ParseResult, TokenParser, cursor::Cursor,
        expression::Expression, expression::left_hand_side::arguments::Arguments,
    },
    source::ReadChar,
};
use ast::function::PrivateName;
use boa_ast::{
    self as ast, Punctuator, Span, Spanned,
    expression::{
        Identifier, Optional, OptionalOperation, OptionalOperationKind, access::PropertyAccessField,
    },
};
use boa_interner::{Interner, Sym};

/// Parses an optional expression.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining
/// [spec]: https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#prod-OptionalExpression
#[derive(Debug, Clone)]
pub(in crate::parser) struct OptionalExpression {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    target: ast::Expression,
}

impl OptionalExpression {
    /// Creates a new `OptionalExpression` parser.
    pub(in crate::parser) fn new<Y, A>(
        allow_yield: Y,
        allow_await: A,
        target: ast::Expression,
    ) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            target,
        }
    }
}

impl<R> TokenParser<R> for OptionalExpression
where
    R: ReadChar,
{
    type Output = Optional;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        fn parse_const_access(
            token: &Token,
            interner: &Interner,
        ) -> ParseResult<(OptionalOperationKind, Span)> {
            let item = match token.kind() {
                TokenKind::IdentifierName((name, _)) => {
                    OptionalOperationKind::SimplePropertyAccess {
                        field: Identifier::new(*name, token.span()).into(),
                    }
                }
                TokenKind::Keyword((kw, _)) => OptionalOperationKind::SimplePropertyAccess {
                    field: Identifier::new(kw.to_sym(), token.span()).into(),
                },
                TokenKind::BooleanLiteral((true, _)) => {
                    OptionalOperationKind::SimplePropertyAccess {
                        field: Identifier::new(Sym::TRUE, token.span()).into(),
                    }
                }
                TokenKind::BooleanLiteral((false, _)) => {
                    OptionalOperationKind::SimplePropertyAccess {
                        field: Identifier::new(Sym::FALSE, token.span()).into(),
                    }
                }
                TokenKind::NullLiteral(_) => OptionalOperationKind::SimplePropertyAccess {
                    field: Identifier::new(Sym::NULL, token.span()).into(),
                },
                TokenKind::PrivateIdentifier(name) => {
                    OptionalOperationKind::PrivatePropertyAccess {
                        field: PrivateName::new(*name, token.span()),
                    }
                }
                _ => {
                    return Err(Error::expected(
                        ["identifier".to_owned()],
                        token.to_string(interner),
                        token.span(),
                        "optional chain",
                    ));
                }
            };
            Ok((item, token.span()))
        }

        let mut items = Vec::new();

        while let Some(token) = cursor.peek(0, interner)? {
            let token_span = token.span();
            let shorted = match token.kind() {
                TokenKind::Punctuator(Punctuator::Optional) => {
                    cursor.advance(interner);
                    true
                }
                TokenKind::Punctuator(Punctuator::OpenParen | Punctuator::OpenBracket) => false,
                TokenKind::Punctuator(Punctuator::Dot) => {
                    cursor.advance(interner);
                    let field = cursor.next(interner).or_abrupt()?;

                    let (item, item_span) = parse_const_access(&field, interner)?;
                    items.push(OptionalOperation::new(
                        item,
                        false,
                        Span::new(token_span.start(), item_span.end()),
                    ));
                    continue;
                }
                TokenKind::TemplateMiddle(_) | TokenKind::TemplateNoSubstitution(_) => {
                    return Err(Error::general(
                        "Invalid tagged template on optional chain",
                        token.span().start(),
                    ));
                }
                _ => break,
            };

            let token = cursor.peek(0, interner).or_abrupt()?;
            let (item, item_span) = match token.kind() {
                TokenKind::Punctuator(Punctuator::OpenParen) => {
                    let (args, args_span) = Arguments::new(self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?;
                    (OptionalOperationKind::Call { args }, args_span)
                }
                TokenKind::Punctuator(Punctuator::OpenBracket) => {
                    cursor
                        .next(interner)?
                        .expect("open bracket punctuator token disappeared"); // We move the parser forward.
                    let idx = Expression::new(true, self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?;
                    let end = cursor
                        .expect(Punctuator::CloseBracket, "optional chain", interner)?
                        .span()
                        .end();
                    (
                        OptionalOperationKind::SimplePropertyAccess {
                            field: PropertyAccessField::Expr(Box::new(idx)),
                        },
                        Span::new(token_span.start(), end),
                    )
                }
                TokenKind::TemplateMiddle(_) | TokenKind::TemplateNoSubstitution(_) => {
                    return Err(Error::general(
                        "Invalid tagged template on optional chain",
                        token_span.start(),
                    ));
                }
                _ => {
                    let token = cursor.next(interner)?.expect("token disappeared");
                    let (item, item_span) = parse_const_access(&token, interner)?;
                    (item, Span::new(token_span.start(), item_span.end()))
                }
            };

            items.push(OptionalOperation::new(item, shorted, item_span));
        }

        let end = items
            .last()
            .expect("There should be at least one item in the optional AST expression")
            .span()
            .end();

        let target_span_start = self.target.span().start();
        Ok(Optional::new(
            self.target,
            items.into(),
            Span::new(target_span_start, end),
        ))
    }
}
