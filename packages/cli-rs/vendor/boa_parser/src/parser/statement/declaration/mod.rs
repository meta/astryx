//! Declaration parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements#Declarations
//! [spec]: https://tc39.es/ecma262/#sec-declarations-and-the-variable-statement

mod export;
mod hoistable;
mod import;
mod lexical;
#[cfg(test)]
mod tests;

pub(in crate::parser) use self::{
    export::ExportDeclaration,
    hoistable::{
        ClassDeclaration, FunctionDeclaration, HoistableDeclaration, class_decl::ClassTail,
    },
    import::ImportDeclaration,
    lexical::{LexicalDeclaration, allowed_token_after_let},
};
use crate::{
    Error,
    lexer::TokenKind,
    parser::{AllowAwait, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser},
    source::ReadChar,
};
use boa_ast::{self as ast, Keyword, Punctuator, Spanned, declaration::ImportAttribute};
use boa_interner::{Interner, Sym};

/// Parses a declaration.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-Declaration
#[derive(Debug, Clone, Copy)]
pub(super) struct Declaration {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl Declaration {
    /// Creates a new declaration parser.
    #[inline]
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

impl<R> TokenParser<R> for Declaration
where
    R: ReadChar,
{
    type Output = ast::Declaration;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let tok = cursor.peek(0, interner).or_abrupt()?;
        let tok_kind = tok.kind().clone();
        let tok_span = tok.span();
        let tok_str = tok.to_string(interner);

        match tok_kind {
            TokenKind::Keyword((Keyword::Function | Keyword::Async | Keyword::Class, _)) => {
                HoistableDeclaration::new(self.allow_yield, self.allow_await, false)
                    .parse(cursor, interner)
            }
            TokenKind::Keyword((Keyword::Const | Keyword::Let | Keyword::Using, _)) => {
                LexicalDeclaration::new(true, self.allow_yield, self.allow_await, false)
                    .parse(cursor, interner)
                    .map(Into::into)
            }
            TokenKind::Keyword((Keyword::Await, false)) => {
                // Check if this is `await using`
                // Per spec, there must be [no LineTerminator here] between `await` and `using`
                if let Some(next_tok) = cursor.peek_no_skip_line_term(1, interner)?
                    && next_tok.kind() != &TokenKind::LineTerminator
                    && matches!(next_tok.kind(), TokenKind::Keyword((Keyword::Using, false)))
                {
                    return LexicalDeclaration::new(
                        true,
                        self.allow_yield,
                        self.allow_await,
                        false,
                    )
                    .parse(cursor, interner)
                    .map(Into::into);
                }
                Err(Error::expected(
                    [
                        Keyword::Function.to_string(),
                        Keyword::Async.to_string(),
                        Keyword::Class.to_string(),
                        Keyword::Const.to_string(),
                        Keyword::Let.to_string(),
                        Keyword::Using.to_string(),
                    ],
                    tok_str,
                    tok_span,
                    "export declaration",
                ))
            }
            _ => Err(Error::expected(
                [
                    Keyword::Function.to_string(),
                    Keyword::Async.to_string(),
                    Keyword::Class.to_string(),
                    Keyword::Const.to_string(),
                    Keyword::Let.to_string(),
                    Keyword::Using.to_string(),
                ],
                tok_str,
                tok_span,
                "export declaration",
            )),
        }
    }
}

/// Parses a `from` clause.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-FromClause
#[derive(Debug, Clone, Copy)]
struct FromClause {
    context: &'static str,
}

impl FromClause {
    /// Creates a new `from` clause parser
    #[inline]
    const fn new(context: &'static str) -> Self {
        Self { context }
    }
}

impl<R> TokenParser<R> for FromClause
where
    R: ReadChar,
{
    type Output = ast::declaration::ModuleSpecifier;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect(TokenKind::identifier(Sym::FROM), self.context, interner)?;

        let tok = cursor.next(interner).or_abrupt()?;

        let TokenKind::StringLiteral((from, _)) = tok.kind() else {
            return Err(Error::expected(
                ["string literal".to_owned()],
                tok.to_string(interner),
                tok.span(),
                self.context,
            ));
        };

        Ok((*from).into())
    }
}

/// Parses an optional `with` clause for import attributes.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-imports
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct WithClause {
    context: &'static str,
}

impl WithClause {
    /// Creates a new `with` clause parser.
    #[inline]
    pub(in crate::parser) const fn new(context: &'static str) -> Self {
        Self { context }
    }
}

impl<R> TokenParser<R> for WithClause
where
    R: ReadChar,
{
    type Output = Box<[ImportAttribute]>;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let Some(tok) = cursor.peek(0, interner)? else {
            return Ok(Box::default());
        };

        if !matches!(tok.kind(), TokenKind::Keyword((Keyword::With, _))) {
            return Ok(Box::default());
        }

        let Some(next_tok) = cursor.peek(1, interner)? else {
            return Ok(Box::default());
        };

        if next_tok.kind() != &TokenKind::Punctuator(Punctuator::OpenBlock) {
            return Ok(Box::default());
        }

        cursor.advance(interner);

        cursor.expect(Punctuator::OpenBlock, self.context, interner)?;

        let mut attributes = Vec::new();

        loop {
            let tok = cursor.peek(0, interner).or_abrupt()?;

            if tok.kind() == &TokenKind::Punctuator(Punctuator::CloseBlock) {
                break;
            }

            let key_tok = cursor.next(interner).or_abrupt()?;
            let key = match key_tok.kind() {
                TokenKind::IdentifierName((name, _)) | TokenKind::StringLiteral((name, _)) => *name,
                TokenKind::Keyword((kw, _)) => kw.to_sym(),
                _ => {
                    return Err(Error::expected(
                        ["identifier".to_owned(), "string literal".to_owned()],
                        key_tok.to_string(interner),
                        key_tok.span(),
                        self.context,
                    ));
                }
            };

            cursor.expect(Punctuator::Colon, self.context, interner)?;

            let value_tok = cursor.next(interner).or_abrupt()?;
            let TokenKind::StringLiteral((value, _)) = value_tok.kind() else {
                return Err(Error::expected(
                    ["string literal".to_owned()],
                    value_tok.to_string(interner),
                    value_tok.span(),
                    self.context,
                ));
            };

            if attributes
                .iter()
                .any(|attr: &ImportAttribute| attr.key() == key)
            {
                return Err(Error::general(
                    "duplicate attribute key in import attributes",
                    key_tok.span().start(),
                ));
            }

            attributes.push(ImportAttribute::new(key, *value));

            let tok = cursor.peek(0, interner).or_abrupt()?;
            if tok.kind() == &TokenKind::Punctuator(Punctuator::Comma) {
                cursor.advance(interner);
            } else if tok.kind() != &TokenKind::Punctuator(Punctuator::CloseBlock) {
                return Err(Error::expected(
                    [",".to_owned(), "}".to_owned()],
                    tok.to_string(interner),
                    tok.span(),
                    self.context,
                ));
            }
        }

        cursor.expect(Punctuator::CloseBlock, self.context, interner)?;

        Ok(attributes.into_boxed_slice())
    }
}
