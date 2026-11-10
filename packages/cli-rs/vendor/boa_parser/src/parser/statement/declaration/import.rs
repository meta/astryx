//! Import declaration parsing
//!
//! This parses `import` declarations.
//!
//! More information:
//! - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-imports
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import

use crate::{
    lexer::TokenKind,
    parser::{
        Error, OrAbrupt, ParseResult, TokenParser,
        cursor::Cursor,
        statement::{
            BindingIdentifier,
            declaration::{FromClause, WithClause},
        },
    },
    source::ReadChar,
};
use boa_ast::{
    Keyword, Punctuator, Spanned,
    declaration::{
        ImportAttribute, ImportDeclaration as AstImportDeclaration, ImportKind,
        ImportSpecifier as AstImportSpecifier, ModuleSpecifier,
    },
    expression::Identifier,
};
use boa_interner::{Interner, Sym};

/// Parses an import declaration.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ImportDeclaration
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct ImportDeclaration;

impl ImportDeclaration {
    /// Tests if the next node is an `ImportDeclaration`.
    pub(in crate::parser) fn test<R: ReadChar>(
        cursor: &mut Cursor<R>,
        interner: &mut Interner,
    ) -> ParseResult<bool> {
        if let Some(token) = cursor.peek(0, interner)?
            && let TokenKind::Keyword((Keyword::Import, escaped)) = token.kind()
        {
            if *escaped {
                return Err(Error::general(
                    "keyword `import` must not contain escaped characters",
                    token.span().start(),
                ));
            }

            if let Some(token) = cursor.peek(1, interner)? {
                match token.kind() {
                    TokenKind::StringLiteral(_)
                    | TokenKind::Punctuator(Punctuator::OpenBlock | Punctuator::Mul)
                    | TokenKind::IdentifierName(_)
                    | TokenKind::Keyword(_) => return Ok(true),
                    _ => {}
                }
            }
        }

        Ok(false)
    }
}

impl<R> TokenParser<R> for ImportDeclaration
where
    R: ReadChar,
{
    type Output = AstImportDeclaration;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect((Keyword::Import, false), "import declaration", interner)?;

        let tok = cursor.peek(0, interner).or_abrupt()?;

        let import_clause = match tok.kind() {
            TokenKind::StringLiteral((module_identifier, _)) => {
                let module_identifier = *module_identifier;

                cursor.advance(interner);

                let attributes = WithClause::new("import declaration").parse(cursor, interner)?;

                cursor.expect_semicolon("import declaration", interner)?;

                return Ok(AstImportDeclaration::new(
                    None,
                    ImportKind::DefaultOrUnnamed,
                    ModuleSpecifier::new(module_identifier),
                    attributes,
                ));
            }
            TokenKind::Punctuator(Punctuator::OpenBlock) => {
                let list = NamedImports.parse(cursor, interner)?;
                ImportClause::ImportList(None, list)
            }
            TokenKind::Punctuator(Punctuator::Mul) => {
                let alias = NameSpaceImport.parse(cursor, interner)?;
                ImportClause::Namespace(None, alias)
            }
            TokenKind::IdentifierName(_)
            | TokenKind::Keyword((Keyword::Await | Keyword::Yield, _)) => {
                let imported_binding = ImportedBinding.parse(cursor, interner)?;

                let tok = cursor.peek(0, interner).or_abrupt()?;

                match tok.kind() {
                    TokenKind::Punctuator(Punctuator::Comma) => {
                        cursor.advance(interner);
                        let tok = cursor.peek(0, interner).or_abrupt()?;

                        match tok.kind() {
                            TokenKind::Punctuator(Punctuator::OpenBlock) => {
                                let list = NamedImports.parse(cursor, interner)?;
                                ImportClause::ImportList(Some(imported_binding), list)
                            }
                            TokenKind::Punctuator(Punctuator::Mul) => {
                                let alias = NameSpaceImport.parse(cursor, interner)?;
                                ImportClause::Namespace(Some(imported_binding), alias)
                            }
                            _ => {
                                return Err(Error::expected(
                                    [
                                        Punctuator::OpenBlock.to_string(),
                                        Punctuator::Mul.to_string(),
                                    ],
                                    tok.to_string(interner),
                                    tok.span(),
                                    "import declaration",
                                ));
                            }
                        }
                    }
                    _ => ImportClause::ImportList(Some(imported_binding), Box::default()),
                }
            }
            _ => {
                return Err(Error::expected(
                    [
                        Punctuator::OpenBlock.to_string(),
                        Punctuator::Mul.to_string(),
                        "identifier".to_owned(),
                        "string literal".to_owned(),
                    ],
                    tok.to_string(interner),
                    tok.span(),
                    "import declaration",
                ));
            }
        };

        let module_identifier = FromClause::new("import declaration").parse(cursor, interner)?;
        let attributes = WithClause::new("import declaration").parse(cursor, interner)?;

        cursor.expect_semicolon("import declaration", interner)?;

        Ok(import_clause.with_specifier_and_attributes(module_identifier, attributes))
    }
}

/// Parses an imported binding
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ImportedBinding
#[derive(Debug, Clone, Copy)]
struct ImportedBinding;

impl<R> TokenParser<R> for ImportedBinding
where
    R: ReadChar,
{
    type Output = Identifier;

    #[inline]
    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        BindingIdentifier::new(false, true).parse(cursor, interner)
    }
}

/// Parses a named import list.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-NamedImports
#[derive(Debug, Clone, Copy)]
struct NamedImports;

impl<R> TokenParser<R> for NamedImports
where
    R: ReadChar,
{
    type Output = Box<[AstImportSpecifier]>;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect(Punctuator::OpenBlock, "import declaration", interner)?;

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
                            "import declaration",
                        ));
                    }
                    cursor.advance(interner);
                }
                TokenKind::StringLiteral(_)
                | TokenKind::IdentifierName(_)
                | TokenKind::Keyword(_) => {
                    list.push(ImportSpecifier.parse(cursor, interner)?);
                }
                _ => {
                    return Err(Error::expected(
                        [
                            Punctuator::CloseBlock.to_string(),
                            Punctuator::Comma.to_string(),
                        ],
                        tok.to_string(interner),
                        tok.span(),
                        "import declaration",
                    ));
                }
            }
        }

        Ok(list.into_boxed_slice())
    }
}

/// Parses an import clause.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ImportClause
#[derive(Debug, Clone)]
enum ImportClause {
    Namespace(Option<Identifier>, Identifier),
    ImportList(Option<Identifier>, Box<[AstImportSpecifier]>),
}

impl ImportClause {
    #[inline]
    fn with_specifier_and_attributes(
        self,
        specifier: ModuleSpecifier,
        attributes: Box<[ImportAttribute]>,
    ) -> AstImportDeclaration {
        match self {
            Self::Namespace(default, binding) => AstImportDeclaration::new(
                default,
                ImportKind::Namespaced { binding },
                specifier,
                attributes,
            ),
            Self::ImportList(default, names) => {
                if names.is_empty() {
                    AstImportDeclaration::new(
                        default,
                        ImportKind::DefaultOrUnnamed,
                        specifier,
                        attributes,
                    )
                } else {
                    AstImportDeclaration::new(
                        default,
                        ImportKind::Named { names },
                        specifier,
                        attributes,
                    )
                }
            }
        }
    }
}

/// Parses an import specifier.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ImportSpecifier
#[derive(Debug, Clone, Copy)]
struct ImportSpecifier;

impl<R> TokenParser<R> for ImportSpecifier
where
    R: ReadChar,
{
    type Output = AstImportSpecifier;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let tok = cursor.peek(0, interner).or_abrupt()?;

        match tok.kind() {
            TokenKind::StringLiteral((name, _)) => {
                let name = *name;
                if interner.resolve_expect(name).utf8().is_none() {
                    return Err(Error::general(
                        "import specifiers don't allow unpaired surrogates",
                        tok.span().end(),
                    ));
                }

                cursor.advance(interner);

                cursor.expect(
                    TokenKind::identifier(Sym::AS),
                    "import declaration",
                    interner,
                )?;

                let binding = ImportedBinding.parse(cursor, interner)?;

                Ok(AstImportSpecifier::new(binding, name))
            }
            TokenKind::Keyword((kw, _)) => {
                let export_name = kw.to_sym();

                cursor.advance(interner);

                cursor.expect(
                    TokenKind::identifier(Sym::AS),
                    "import declaration",
                    interner,
                )?;

                let binding = ImportedBinding.parse(cursor, interner)?;

                Ok(AstImportSpecifier::new(binding, export_name))
            }
            TokenKind::IdentifierName((name, _)) => {
                let name = *name;

                if let Some(token) = cursor.peek(1, interner)?
                    && token.kind() == &TokenKind::identifier(Sym::AS)
                {
                    // export name
                    cursor.advance(interner);

                    // `as`
                    cursor.advance(interner);

                    let binding = ImportedBinding.parse(cursor, interner)?;
                    return Ok(AstImportSpecifier::new(binding, name));
                }

                let name = ImportedBinding.parse(cursor, interner)?;

                Ok(AstImportSpecifier::new(name, name.sym()))
            }
            _ => Err(Error::expected(
                ["string literal".to_owned(), "identifier".to_owned()],
                tok.to_string(interner),
                tok.span(),
                "import declaration",
            )),
        }
    }
}

/// Parses a namespace import
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-NameSpaceImport
#[derive(Debug, Clone, Copy)]
struct NameSpaceImport;

impl<R> TokenParser<R> for NameSpaceImport
where
    R: ReadChar,
{
    type Output = Identifier;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect(Punctuator::Mul, "import declaration", interner)?;
        cursor.expect(
            TokenKind::identifier(Sym::AS),
            "import declaration",
            interner,
        )?;

        ImportedBinding.parse(cursor, interner)
    }
}
