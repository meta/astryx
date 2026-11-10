//! Member expression parsing.
//!
//! More information:
//!  - [ECMAScript specification][spec]
//!
//! [spec]: https://tc39.es/ecma262/#prod-MemberExpression

use super::arguments::Arguments;
use crate::{
    Error,
    lexer::{InputElement, TokenKind, token::ContainsEscapeSequence},
    parser::{
        AllowAwait, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::{
            Expression, FormalParameterListOrExpression,
            left_hand_side::template::TaggedTemplateLiteral, primary::PrimaryExpression,
        },
    },
    source::ReadChar,
};
use ast::function::PrivateName;
use boa_ast::{
    self as ast, Keyword, Punctuator, Span, Spanned,
    expression::{
        Call, Identifier, ImportMeta, New, NewTarget,
        access::{PrivatePropertyAccess, SimplePropertyAccess, SuperPropertyAccess},
    },
};
use boa_interner::{Interner, Sym};

/// Parses a member expression.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-MemberExpression
#[derive(Debug, Clone, Copy)]
pub(super) struct MemberExpression {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl MemberExpression {
    /// Creates a new `MemberExpression` parser.
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

impl<R> TokenParser<R> for MemberExpression
where
    R: ReadChar,
{
    type Output = FormalParameterListOrExpression;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.set_goal(InputElement::RegExp);

        let token = cursor.peek(0, interner).or_abrupt()?;
        let position = token.span().start();
        let lhs: FormalParameterListOrExpression = match token.kind() {
            TokenKind::Keyword((Keyword::New | Keyword::Super | Keyword::Import, true)) => {
                return Err(Error::general(
                    "keyword must not contain escaped characters",
                    token.span().start(),
                ));
            }
            TokenKind::Keyword((Keyword::Import, false)) => {
                let import_span = token.span();
                cursor.advance(interner);

                cursor.expect(
                    TokenKind::Punctuator(Punctuator::Dot),
                    "import.meta",
                    interner,
                )?;

                let token = cursor.next(interner).or_abrupt()?;

                match token.kind() {
                    TokenKind::IdentifierName((Sym::META, ContainsEscapeSequence(ces))) => {
                        if *ces {
                            return Err(Error::general(
                                "`import.meta` cannot contain escaped characters",
                                token.span().start(),
                            ));
                        }
                    }
                    _ => {
                        return Err(Error::expected(
                            ["property `meta`".into()],
                            token.to_string(interner),
                            token.span(),
                            "import.meta",
                        ));
                    }
                }

                if !cursor.module() {
                    return Err(Error::general(
                        "invalid `import.meta` expression outside a module",
                        position,
                    ));
                }

                ImportMeta::new(Span::new(import_span.start(), token.span().end())).into()
            }
            TokenKind::Keyword((Keyword::New, false)) => {
                let new_token_span = token.span();
                cursor.advance(interner);

                if cursor.next_if(Punctuator::Dot, interner)?.is_some() {
                    let token = cursor.next(interner).or_abrupt()?;
                    match token.kind() {
                        TokenKind::IdentifierName((Sym::TARGET, ContainsEscapeSequence(true))) => {
                            return Err(Error::general(
                                "'new.target' must not contain escaped characters",
                                token.span().start(),
                            ));
                        }
                        TokenKind::IdentifierName((Sym::TARGET, ContainsEscapeSequence(false))) => {
                            NewTarget::new(Span::new(new_token_span.start(), token.span().end()))
                                .into()
                        }
                        _ => {
                            return Err(Error::general(
                                "unexpected private identifier",
                                token.span().start(),
                            ));
                        }
                    }
                } else {
                    let lhs_inner = self.parse(cursor, interner)?.try_into_expression()?;
                    let (args, args_span) = match cursor.peek(0, interner)? {
                        Some(next)
                            if next.kind() == &TokenKind::Punctuator(Punctuator::OpenParen) =>
                        {
                            Arguments::new(self.allow_yield, self.allow_await)
                                .parse(cursor, interner)?
                        }
                        _ => (Box::default(), lhs_inner.span()),
                    };
                    let call_node = Call::new(
                        lhs_inner,
                        args,
                        Span::new(new_token_span.start(), args_span.end()),
                    );

                    New::from(call_node).into()
                }
            }
            TokenKind::Keyword((Keyword::Super, _)) => {
                let super_token_span = token.span();
                cursor.advance(interner);
                let token = cursor.next(interner).or_abrupt()?;
                match token.kind() {
                    TokenKind::Punctuator(Punctuator::Dot) => {
                        let token = cursor.next(interner).or_abrupt()?;
                        let field = match token.kind() {
                            TokenKind::IdentifierName((name, _)) => SuperPropertyAccess::new(
                                Identifier::new(*name, token.span()).into(),
                                Span::new(super_token_span.start(), token.span().end()),
                            ),
                            TokenKind::Keyword((kw, _)) => SuperPropertyAccess::new(
                                Identifier::new(kw.to_sym(), token.span()).into(),
                                Span::new(super_token_span.start(), token.span().end()),
                            ),
                            TokenKind::BooleanLiteral((true, _)) => SuperPropertyAccess::new(
                                Identifier::new(Sym::TRUE, token.span()).into(),
                                Span::new(super_token_span.start(), token.span().end()),
                            ),
                            TokenKind::BooleanLiteral((false, _)) => SuperPropertyAccess::new(
                                Identifier::new(Sym::FALSE, token.span()).into(),
                                Span::new(super_token_span.start(), token.span().end()),
                            ),
                            TokenKind::NullLiteral(_) => SuperPropertyAccess::new(
                                Identifier::new(Sym::NULL, token.span()).into(),
                                Span::new(super_token_span.start(), token.span().end()),
                            ),
                            TokenKind::PrivateIdentifier(_) => {
                                return Err(Error::general(
                                    "unexpected private identifier",
                                    token.span().start(),
                                ));
                            }
                            _ => {
                                return Err(Error::unexpected(
                                    token.to_string(interner),
                                    token.span(),
                                    "expected super property",
                                ));
                            }
                        };
                        ast::Expression::PropertyAccess(field.into()).into()
                    }
                    TokenKind::Punctuator(Punctuator::OpenBracket) => {
                        let expr = Expression::new(true, self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?;
                        let token_span = cursor
                            .expect(Punctuator::CloseBracket, "super property", interner)?
                            .span();

                        ast::Expression::PropertyAccess(
                            SuperPropertyAccess::new(
                                expr.into(),
                                Span::new(super_token_span.start(), token_span.end()),
                            )
                            .into(),
                        )
                        .into()
                    }
                    _ => {
                        return Err(Error::unexpected(
                            token.to_string(interner),
                            token.span(),
                            "expected super property",
                        ));
                    }
                }
            }
            _ => PrimaryExpression::new(self.allow_yield, self.allow_await)
                .parse(cursor, interner)?,
        };

        let FormalParameterListOrExpression::Expression(mut lhs) = lhs else {
            return Ok(lhs);
        };

        cursor.set_goal(InputElement::TemplateTail);

        while let Some(tok) = cursor.peek(0, interner)? {
            match tok.kind() {
                TokenKind::Punctuator(Punctuator::Dot) => {
                    cursor
                        .next(interner)?
                        .expect("dot punctuator token disappeared"); // We move the parser forward.

                    let token = cursor.next(interner).or_abrupt()?;

                    let lhs_span = lhs.span();
                    let access = match token.kind() {
                        TokenKind::IdentifierName((name, _)) => {
                            SimplePropertyAccess::new(lhs, Identifier::new(*name, token.span()))
                                .into()
                        }
                        TokenKind::Keyword((kw, _)) => SimplePropertyAccess::new(
                            lhs,
                            Identifier::new(kw.to_sym(), token.span()),
                        )
                        .into(),
                        TokenKind::BooleanLiteral((true, _)) => {
                            SimplePropertyAccess::new(lhs, Identifier::new(Sym::TRUE, token.span()))
                                .into()
                        }
                        TokenKind::BooleanLiteral((false, _)) => SimplePropertyAccess::new(
                            lhs,
                            Identifier::new(Sym::FALSE, token.span()),
                        )
                        .into(),
                        TokenKind::NullLiteral(_) => {
                            SimplePropertyAccess::new(lhs, Identifier::new(Sym::NULL, token.span()))
                                .into()
                        }
                        TokenKind::PrivateIdentifier(name) => PrivatePropertyAccess::new(
                            lhs,
                            PrivateName::new(*name, token.span()),
                            Span::new(lhs_span.start(), token.span().end()),
                        )
                        .into(),
                        _ => {
                            return Err(Error::expected(
                                ["identifier".to_owned()],
                                token.to_string(interner),
                                token.span(),
                                "member expression",
                            ));
                        }
                    };

                    lhs = ast::Expression::PropertyAccess(access);
                }
                TokenKind::Punctuator(Punctuator::OpenBracket) => {
                    cursor
                        .next(interner)?
                        .expect("open bracket punctuator token disappeared"); // We move the parser forward.
                    let idx = Expression::new(true, self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?;
                    cursor.expect(Punctuator::CloseBracket, "member expression", interner)?;
                    lhs =
                        ast::Expression::PropertyAccess(SimplePropertyAccess::new(lhs, idx).into());
                }
                TokenKind::TemplateNoSubstitution { .. } | TokenKind::TemplateMiddle { .. } => {
                    lhs = TaggedTemplateLiteral::new(
                        self.allow_yield,
                        self.allow_await,
                        tok.start_group(),
                        lhs,
                    )
                    .parse(cursor, interner)?
                    .into();
                }
                _ => break,
            }
        }

        Ok(lhs.into())
    }
}
