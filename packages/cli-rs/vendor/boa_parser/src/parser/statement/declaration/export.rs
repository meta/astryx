//! Export declaration parsing
//!
//! This parses `export` declarations.
//!
//! More information:
//! - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-exports
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export

use crate::{
    lexer::{TokenKind, token::ContainsEscapeSequence},
    parser::{
        Error, OrAbrupt, ParseResult, TokenParser,
        cursor::Cursor,
        expression::AssignmentExpression,
        statement::{declaration::ClassDeclaration, variable::VariableStatement},
    },
    source::ReadChar,
};
use boa_ast::{
    Keyword, Punctuator, Spanned,
    declaration::{ExportDeclaration as AstExportDeclaration, ReExportKind},
};
use boa_interner::{Interner, Sym};

use super::{
    Declaration, FromClause, FunctionDeclaration, WithClause,
    hoistable::{AsyncFunctionDeclaration, AsyncGeneratorDeclaration, GeneratorDeclaration},
};

/// Parses an export declaration.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ExportDeclaration
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct ExportDeclaration;

impl<R> TokenParser<R> for ExportDeclaration
where
    R: ReadChar,
{
    type Output = AstExportDeclaration;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect((Keyword::Export, false), "export declaration", interner)?;

        let tok = cursor.peek(0, interner).or_abrupt()?;
        let span = tok.span();

        let export_clause: Self::Output = match tok.kind() {
            TokenKind::Punctuator(Punctuator::Mul) => {
                cursor.advance(interner);

                let next = cursor.peek(0, interner).or_abrupt()?;

                let (kind, specifier) = match next.kind() {
                    TokenKind::IdentifierName((Sym::AS, _)) => {
                        cursor.advance(interner);
                        let tok = cursor.next(interner).or_abrupt()?;

                        let alias = match tok.kind() {
                            TokenKind::StringLiteral((export_name, _))
                            | TokenKind::IdentifierName((export_name, _)) => *export_name,
                            TokenKind::Keyword((kw, _)) => kw.to_sym(),
                            _ => {
                                return Err(Error::expected(
                                    ["identifier name".to_owned(), "string literal".to_owned()],
                                    tok.to_string(interner),
                                    tok.span(),
                                    "export declaration",
                                ));
                            }
                        };

                        let specifier =
                            FromClause::new("export declaration").parse(cursor, interner)?;

                        (ReExportKind::Namespaced { name: Some(alias) }, specifier)
                    }
                    TokenKind::IdentifierName((Sym::FROM, _)) => {
                        let specifier =
                            FromClause::new("export declaration").parse(cursor, interner)?;

                        (ReExportKind::Namespaced { name: None }, specifier)
                    }
                    _ => {
                        return Err(Error::expected(
                            ["as".to_owned(), "from".to_owned()],
                            next.to_string(interner),
                            next.span(),
                            "export declaration",
                        ));
                    }
                };

                let attributes = WithClause::new("export declaration").parse(cursor, interner)?;
                cursor.expect_semicolon("star re-export", interner)?;

                AstExportDeclaration::ReExport {
                    kind,
                    specifier,
                    attributes,
                }
            }
            TokenKind::Punctuator(Punctuator::OpenBlock) => {
                let names = NamedExports.parse(cursor, interner)?;

                let next = cursor.peek(0, interner).or_abrupt()?;

                if matches!(
                    next.kind(),
                    TokenKind::IdentifierName((Sym::FROM, ContainsEscapeSequence(false)))
                ) {
                    let specifier =
                        FromClause::new("export declaration").parse(cursor, interner)?;
                    let attributes =
                        WithClause::new("export declaration").parse(cursor, interner)?;

                    cursor.expect_semicolon("named re-exports", interner)?;

                    AstExportDeclaration::ReExport {
                        kind: ReExportKind::Named { names },
                        specifier,
                        attributes,
                    }
                } else {
                    cursor.expect_semicolon("named exports", interner)?;

                    for specifier in &*names {
                        let name = specifier.private_name();

                        if specifier.string_literal() {
                            let name = interner.resolve_expect(name);
                            return Err(Error::general(
                                format!(
                                    "local referenced binding `{name}` cannot be a string literal",
                                ),
                                span.start(),
                            ));
                        }

                        if name == Sym::AWAIT
                            || name.is_reserved_identifier()
                            || name.is_strict_reserved_identifier()
                        {
                            let name = interner.resolve_expect(name);
                            return Err(Error::general(
                                format!(
                                    "local referenced binding `{name}` cannot be a reserved word",
                                ),
                                span.start(),
                            ));
                        }
                    }

                    AstExportDeclaration::List(names)
                }
            }
            TokenKind::Keyword((Keyword::Var, false)) => VariableStatement::new(false, true)
                .parse(cursor, interner)
                .map(AstExportDeclaration::VarStatement)?,
            TokenKind::Keyword((Keyword::Default, false)) => {
                cursor.advance(interner);

                let tok = cursor.peek(0, interner).or_abrupt()?;

                match tok.kind() {
                    TokenKind::Keyword((Keyword::Function, false)) => {
                        let next_token = cursor.peek(1, interner).or_abrupt()?;
                        if next_token.kind() == &TokenKind::Punctuator(Punctuator::Mul) {
                            AstExportDeclaration::DefaultGeneratorDeclaration(
                                GeneratorDeclaration::new(false, true, true)
                                    .parse(cursor, interner)?,
                            )
                        } else {
                            AstExportDeclaration::DefaultFunctionDeclaration(
                                FunctionDeclaration::new(false, true, true)
                                    .parse(cursor, interner)?,
                            )
                        }
                    }
                    TokenKind::Keyword((Keyword::Async, false)) => {
                        let next_token = cursor.peek(2, interner).or_abrupt()?;
                        if next_token.kind() == &TokenKind::Punctuator(Punctuator::Mul) {
                            AstExportDeclaration::DefaultAsyncGeneratorDeclaration(
                                AsyncGeneratorDeclaration::new(false, true, true)
                                    .parse(cursor, interner)?,
                            )
                        } else {
                            AstExportDeclaration::DefaultAsyncFunctionDeclaration(
                                AsyncFunctionDeclaration::new(false, true, true)
                                    .parse(cursor, interner)?,
                            )
                        }
                    }
                    TokenKind::Keyword((Keyword::Class, false)) => {
                        AstExportDeclaration::DefaultClassDeclaration(
                            ClassDeclaration::new(false, true, true)
                                .parse(cursor, interner)?
                                .into(),
                        )
                    }
                    _ => {
                        let expr =
                            AssignmentExpression::new(true, false, true).parse(cursor, interner)?;

                        cursor.expect_semicolon("default expression export", interner)?;

                        AstExportDeclaration::DefaultAssignmentExpression(expr)
                    }
                }
            }
            _ => AstExportDeclaration::Declaration(
                Declaration::new(false, true).parse(cursor, interner)?,
            ),
        };

        Ok(export_clause)
    }
}

/// Parses a named export list.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-NamedExports
#[derive(Debug, Clone, Copy)]
struct NamedExports;

impl<R> TokenParser<R> for NamedExports
where
    R: ReadChar,
{
    type Output = Box<[boa_ast::declaration::ExportSpecifier]>;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect(Punctuator::OpenBlock, "export declaration", interner)?;

        let mut list = Vec::new();

        loop {
            let tok = cursor.peek(0, interner).or_abrupt()?;
            match tok.kind() {
                TokenKind::Punctuator(Punctuator::CloseBlock) => {
                    cursor.advance(interner);
                    break;
                }
                TokenKind::Punctuator(Punctuator::Comma) => {
                    if list.is_empty() {
                        return Err(Error::expected(
                            [
                                Punctuator::CloseBlock.to_string(),
                                "string literal".to_owned(),
                                "identifier".to_owned(),
                            ],
                            tok.to_string(interner),
                            tok.span(),
                            "export declaration",
                        ));
                    }
                    cursor.advance(interner);
                }
                TokenKind::StringLiteral(_)
                | TokenKind::IdentifierName(_)
                | TokenKind::Keyword(_) => {
                    list.push(ExportSpecifier.parse(cursor, interner)?);
                }
                _ => {
                    return Err(Error::expected(
                        [
                            Punctuator::CloseBlock.to_string(),
                            Punctuator::Comma.to_string(),
                        ],
                        tok.to_string(interner),
                        tok.span(),
                        "export declaration",
                    ));
                }
            }
        }

        Ok(list.into_boxed_slice())
    }
}

/// Parses a module export name.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ModuleExportName
#[derive(Debug, Clone, Copy)]
pub(super) struct ModuleExportName;

impl<R> TokenParser<R> for ModuleExportName
where
    R: ReadChar,
{
    type Output = (Sym, bool);

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let tok = cursor.next(interner).or_abrupt()?;

        match tok.kind() {
            TokenKind::StringLiteral((ident, _)) => {
                if interner.resolve_expect(*ident).utf8().is_none() {
                    return Err(Error::general(
                        "import specifiers don't allow unpaired surrogates",
                        tok.span().end(),
                    ));
                }
                Ok((*ident, true))
            }
            TokenKind::IdentifierName((ident, _)) => Ok((*ident, false)),
            TokenKind::Keyword((kw, _)) => Ok((kw.to_sym(), false)),
            TokenKind::BooleanLiteral((b, _)) => {
                Ok((if *b { Sym::TRUE } else { Sym::FALSE }, false))
            }
            TokenKind::NullLiteral(_) => Ok((Sym::NULL, false)),
            _ => Err(Error::expected(
                ["identifier".to_owned(), "string literal".to_owned()],
                tok.to_string(interner),
                tok.span(),
                "export specifier parsing",
            )),
        }
    }
}

/// Parses an export specifier.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ExportSpecifier
#[derive(Debug, Clone, Copy)]
struct ExportSpecifier;

impl<R> TokenParser<R> for ExportSpecifier
where
    R: ReadChar,
{
    type Output = boa_ast::declaration::ExportSpecifier;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let (inner_name, string_literal) = ModuleExportName.parse(cursor, interner)?;

        if cursor
            .next_if(TokenKind::identifier(Sym::AS), interner)?
            .is_some()
        {
            let (export_name, _) = ModuleExportName.parse(cursor, interner)?;
            Ok(boa_ast::declaration::ExportSpecifier::new(
                export_name,
                inner_name,
                string_literal,
            ))
        } else {
            Ok(boa_ast::declaration::ExportSpecifier::new(
                inner_name,
                inner_name,
                string_literal,
            ))
        }
    }
}
