//! Identifiers parsing.
//!
//! More information:
//!  - [ECMAScript specification][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-identifiers

use crate::{
    Error,
    lexer::TokenKind,
    parser::{AllowAwait, AllowYield, OrAbrupt, ParseResult, TokenParser, cursor::Cursor},
    source::ReadChar,
};
use boa_ast::Spanned;
use boa_ast::expression::Identifier as AstIdentifier;
use boa_interner::{Interner, Sym};

/// Identifier reference parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-IdentifierReference
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct IdentifierReference {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl IdentifierReference {
    /// Creates a new `IdentifierReference` parser.
    #[inline]
    pub(in crate::parser) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for IdentifierReference
where
    R: ReadChar,
{
    type Output = AstIdentifier;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let span = cursor.peek(0, interner).or_abrupt()?.span();
        let ident = Identifier.parse(cursor, interner)?;
        match ident.sym() {
            Sym::YIELD if self.allow_yield.0 => Err(Error::unexpected(
                "yield",
                span,
                "keyword `yield` not allowed in this context",
            )),
            Sym::AWAIT if self.allow_await.0 => Err(Error::unexpected(
                "await",
                span,
                "keyword `await` not allowed in this context",
            )),
            _ => Ok(ident),
        }
    }
}

/// Binding identifier parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-BindingIdentifier
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct BindingIdentifier {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl BindingIdentifier {
    /// Creates a new `BindingIdentifier` parser.
    #[inline]
    pub(in crate::parser) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for BindingIdentifier
where
    R: ReadChar,
{
    type Output = AstIdentifier;

    /// Strict mode parsing as per <https://tc39.es/ecma262/#sec-identifiers-static-semantics-early-errors>.
    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let span = cursor.peek(0, interner).or_abrupt()?.span();
        let ident = Identifier.parse(cursor, interner)?;
        match ident.sym() {
            Sym::ARGUMENTS | Sym::EVAL if cursor.strict() => {
                let name = interner
                    .resolve_expect(ident.sym())
                    .utf8()
                    .expect("keyword must be utf-8");
                Err(Error::general(
                    format!("binding identifier `{name}` not allowed in strict mode"),
                    span.start(),
                ))
            }
            Sym::YIELD if self.allow_yield.0 => Err(Error::general(
                "keyword `yield` not allowed in this context",
                span.start(),
            )),
            Sym::AWAIT if self.allow_await.0 => Err(Error::general(
                "keyword `await` not allowed in this context",
                span.start(),
            )),
            _ => Ok(ident),
        }
    }
}

/// Label identifier parsing.
///
/// This seems to be the same as an `IdentifierReference`.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-LabelIdentifier
pub(in crate::parser) type LabelIdentifier = IdentifierReference;

/// Identifier parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-Identifier
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct Identifier;

impl<R> TokenParser<R> for Identifier
where
    R: ReadChar,
{
    type Output = AstIdentifier;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let tok = cursor.next(interner).or_abrupt()?;

        let ident = match tok.kind() {
            TokenKind::IdentifierName((ident, _)) => *ident,
            TokenKind::Keyword((kw, _)) => kw.to_sym(),
            _ => {
                return Err(Error::expected(
                    ["identifier".to_owned()],
                    tok.to_string(interner),
                    tok.span(),
                    "identifier parsing",
                ));
            }
        };

        if cursor.strict() && ident.is_strict_reserved_identifier() {
            return Err(Error::unexpected(
                interner
                    .resolve_expect(ident)
                    .utf8()
                    .expect("keyword must always be utf-8"),
                tok.span(),
                "strict reserved word cannot be an identifier",
            ));
        }

        if cursor.module() && ident == Sym::AWAIT {
            return Err(Error::unexpected(
                "await",
                tok.span(),
                "`await` cannot be used as an identifier in a module",
            ));
        }

        if ident.is_reserved_identifier() {
            return Err(Error::unexpected(
                interner
                    .resolve_expect(ident)
                    .utf8()
                    .expect("keyword must always be utf-8"),
                tok.span(),
                "reserved word cannot be an identifier",
            ));
        }

        Ok(AstIdentifier::new(ident, tok.span()))
    }
}
