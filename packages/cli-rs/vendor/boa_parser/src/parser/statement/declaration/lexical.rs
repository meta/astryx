//! Lexical declaration parsing.
//!
//! This parses `let`, `const`, `using`, and `await using` declarations.
//!
//! More information:
//!  - [ECMAScript specification][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-let-and-const-declarations

use crate::{
    Error,
    lexer::{Error as LexError, Token, TokenKind},
    parser::{
        AllowAwait, AllowIn, AllowYield, OrAbrupt, ParseResult, TokenParser,
        cursor::{Cursor, SemicolonResult},
        expression::Initializer,
        statement::{ArrayBindingPattern, BindingIdentifier, ObjectBindingPattern},
    },
    source::ReadChar,
};
use ast::operations::bound_names;
use boa_ast::{self as ast, Keyword, Punctuator, Spanned, declaration::Variable};
use boa_interner::{Interner, Sym};
use rustc_hash::FxHashSet;

/// The type of lexical declaration being parsed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DeclarationType {
    Let,
    Const,
    Using,
    AwaitUsing,
}

/// Parses a lexical declaration.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-LexicalDeclaration
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct LexicalDeclaration {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    loop_init: bool,
}

impl LexicalDeclaration {
    /// Creates a new `LexicalDeclaration` parser.
    pub(in crate::parser) fn new<I, Y, A>(
        allow_in: I,
        allow_yield: Y,
        allow_await: A,
        loop_init: bool,
    ) -> Self
    where
        I: Into<AllowIn>,
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_in: allow_in.into(),
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            loop_init,
        }
    }
}

impl<R> TokenParser<R> for LexicalDeclaration
where
    R: ReadChar,
{
    type Output = ast::declaration::LexicalDeclaration;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let tok = cursor.next(interner).or_abrupt()?;

        let lexical_declaration = match tok.kind() {
            TokenKind::Keyword((Keyword::Const | Keyword::Let | Keyword::Using, true)) => {
                return Err(Error::general(
                    "Keyword must not contain escaped characters",
                    tok.span().start(),
                ));
            }
            TokenKind::Keyword((Keyword::Const, false)) => BindingList::new(
                self.allow_in,
                self.allow_yield,
                self.allow_await,
                DeclarationType::Const,
                self.loop_init,
            )
            .parse(cursor, interner)?,
            TokenKind::Keyword((Keyword::Let, false)) => BindingList::new(
                self.allow_in,
                self.allow_yield,
                self.allow_await,
                DeclarationType::Let,
                self.loop_init,
            )
            .parse(cursor, interner)?,
            TokenKind::Keyword((Keyword::Using, false)) => BindingList::new(
                self.allow_in,
                self.allow_yield,
                self.allow_await,
                DeclarationType::Using,
                self.loop_init,
            )
            .parse(cursor, interner)?,
            TokenKind::Keyword((Keyword::Await, false)) => {
                // Per spec: <https://arai-a.github.io/ecma262-compare/snapshot.html?pr=3000#prod-LexicalDeclaration>
                // `await using` is only valid when [+Await] is true
                if !self.allow_await.0 {
                    return Err(Error::general(
                        "Unexpected token 'await'",
                        tok.span().start(),
                    ));
                }

                // Per spec: <https://arai-a.github.io/ecma262-compare/snapshot.html?pr=3000#prod-AwaitUsingDeclarationHead>
                // There must be [no LineTerminator here] between `await` and `using`
                let next_tok = cursor.peek_no_skip_line_term(0, interner).or_abrupt()?;

                // Check if next token is a line terminator
                if next_tok.kind() == &TokenKind::LineTerminator {
                    return Err(Error::general(
                        "Unexpected token 'await'",
                        tok.span().start(),
                    ));
                }

                // Check if this is `await using`
                if matches!(next_tok.kind(), TokenKind::Keyword((Keyword::Using, false))) {
                    cursor.advance(interner); // consume 'using'
                    BindingList::new(
                        self.allow_in,
                        self.allow_yield,
                        self.allow_await,
                        DeclarationType::AwaitUsing,
                        self.loop_init,
                    )
                    .parse(cursor, interner)?
                } else {
                    return Err(Error::general(
                        "Unexpected token 'await'",
                        tok.span().start(),
                    ));
                }
            }
            _ => unreachable!("unknown token found: {:?}", tok),
        };

        if !self.loop_init {
            cursor.expect_semicolon("lexical declaration", interner)?;
        }

        // It is a Syntax Error if the BoundNames of BindingList contains "let".
        // It is a Syntax Error if the BoundNames of BindingList contains any duplicate entries.
        let bound_names = bound_names(&lexical_declaration);
        let mut names = FxHashSet::default();
        for name in bound_names {
            if name == Sym::LET {
                return Err(Error::general(
                    "'let' is disallowed as a lexically bound name",
                    tok.span().start(),
                ));
            }
            if !names.insert(name) {
                return Err(Error::general(
                    "lexical name declared multiple times",
                    tok.span().start(),
                ));
            }
        }

        Ok(lexical_declaration)
    }
}

/// Check if the given token is valid after the `let` keyword of a lexical declaration.
pub(crate) fn allowed_token_after_let(token: Option<&Token>) -> bool {
    matches!(
        token.map(Token::kind),
        Some(
            TokenKind::IdentifierName(_)
                | TokenKind::Keyword((
                    Keyword::Await | Keyword::Yield | Keyword::Let | Keyword::Async | Keyword::Of,
                    _
                ))
                | TokenKind::Punctuator(Punctuator::OpenBlock | Punctuator::OpenBracket),
        )
    )
}

/// Parses a binding list.
///
/// It will return an error if a `const` or `using` declaration is being parsed and there is no
/// initializer.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-BindingList
#[derive(Debug, Clone, Copy)]
struct BindingList {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    declaration_type: DeclarationType,
    loop_init: bool,
}

impl BindingList {
    /// Creates a new `BindingList` parser.
    fn new<I, Y, A>(
        allow_in: I,
        allow_yield: Y,
        allow_await: A,
        declaration_type: DeclarationType,
        loop_init: bool,
    ) -> Self
    where
        I: Into<AllowIn>,
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_in: allow_in.into(),
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            declaration_type,
            loop_init,
        }
    }
}

impl<R> TokenParser<R> for BindingList
where
    R: ReadChar,
{
    type Output = ast::declaration::LexicalDeclaration;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        // Create vectors to store the variable declarations
        let mut decls = Vec::new();
        let requires_initializer = matches!(
            self.declaration_type,
            DeclarationType::Const | DeclarationType::Using | DeclarationType::AwaitUsing
        );

        loop {
            let decl = LexicalBinding::new(
                self.allow_in,
                self.allow_yield,
                self.allow_await,
                self.declaration_type,
            )
            .parse(cursor, interner)?;

            if requires_initializer {
                let init_is_some = decl.init().is_some();

                if init_is_some || self.loop_init {
                    decls.push(decl);
                } else {
                    let next = cursor.next(interner).or_abrupt()?;
                    let decl_name = match self.declaration_type {
                        DeclarationType::Const => "const",
                        DeclarationType::Using => "using",
                        DeclarationType::AwaitUsing => "await using",
                        DeclarationType::Let => unreachable!(),
                    };
                    return Err(Error::general(
                        format!("Expected initializer for {decl_name} declaration"),
                        next.span().start(),
                    ));
                }
            } else {
                decls.push(decl);
            }

            match cursor.peek_semicolon(interner)? {
                SemicolonResult::Found(_) => break,
                SemicolonResult::NotFound(tk)
                    if tk.kind() == &TokenKind::Keyword((Keyword::Of, true))
                        || tk.kind() == &TokenKind::Keyword((Keyword::In, true)) =>
                {
                    return Err(Error::general(
                        "Keyword must not contain escaped characters",
                        tk.span().start(),
                    ));
                }
                SemicolonResult::NotFound(tk)
                    if tk.kind() == &TokenKind::Keyword((Keyword::Of, false))
                        || tk.kind() == &TokenKind::Keyword((Keyword::In, false)) =>
                {
                    break;
                }
                SemicolonResult::NotFound(tk)
                    if tk.kind() == &TokenKind::Punctuator(Punctuator::Comma) =>
                {
                    // We discard the comma
                    cursor.advance(interner);
                }
                SemicolonResult::NotFound(_) if self.loop_init => break,
                SemicolonResult::NotFound(_) => {
                    let next = cursor.next(interner).or_abrupt()?;
                    return Err(Error::expected(
                        [";".to_owned(), "line terminator".to_owned()],
                        next.to_string(interner),
                        next.span(),
                        "lexical declaration binding list",
                    ));
                }
            }
        }

        let decls = decls
            .try_into()
            .expect("`LexicalBinding` must return at least one variable");

        Ok(match self.declaration_type {
            DeclarationType::Const => ast::declaration::LexicalDeclaration::Const(decls),
            DeclarationType::Let => ast::declaration::LexicalDeclaration::Let(decls),
            DeclarationType::Using => ast::declaration::LexicalDeclaration::Using(decls),
            DeclarationType::AwaitUsing => ast::declaration::LexicalDeclaration::AwaitUsing(decls),
        })
    }
}

/// Lexical binding parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-LexicalBinding
struct LexicalBinding {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    declaration_type: DeclarationType,
}

impl LexicalBinding {
    /// Creates a new `BindingList` parser.
    fn new<I, Y, A>(
        allow_in: I,
        allow_yield: Y,
        allow_await: A,
        declaration_type: DeclarationType,
    ) -> Self
    where
        I: Into<AllowIn>,
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_in: allow_in.into(),
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            declaration_type,
        }
    }
}

impl<R> TokenParser<R> for LexicalBinding
where
    R: ReadChar,
{
    type Output = Variable;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let peek_token = cursor.peek(0, interner).or_abrupt()?;
        let position = peek_token.span().start();

        match peek_token.kind() {
            TokenKind::Punctuator(Punctuator::OpenBlock) => {
                // Per spec: https://tc39.es/proposal-explicit-resource-management/
                // The grammar uses ~Pattern parameter which means destructuring is NOT allowed
                // for `using` and `await using` declarations
                if matches!(
                    self.declaration_type,
                    DeclarationType::Using | DeclarationType::AwaitUsing
                ) {
                    return Err(Error::general(
                        "destructuring patterns are not allowed in using declarations",
                        position,
                    ));
                }

                let bindings = ObjectBindingPattern::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?;

                let init = if cursor
                    .peek(0, interner)?
                    .as_ref()
                    .is_some_and(|t| *t.kind() == TokenKind::Punctuator(Punctuator::Assign))
                {
                    Some(
                        Initializer::new(self.allow_in, self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?,
                    )
                } else {
                    None
                };

                let declaration = bindings.into();

                if bound_names(&declaration).contains(&Sym::LET) {
                    return Err(Error::lex(LexError::Syntax(
                        "'let' is disallowed as a lexically bound name".into(),
                        position,
                    )));
                }

                Ok(Variable::from_pattern(declaration, init))
            }
            TokenKind::Punctuator(Punctuator::OpenBracket) => {
                // Per spec: https://tc39.es/proposal-explicit-resource-management/
                // The grammar uses ~Pattern parameter which means destructuring is NOT allowed
                // for `using` and `await using` declarations
                if matches!(
                    self.declaration_type,
                    DeclarationType::Using | DeclarationType::AwaitUsing
                ) {
                    return Err(Error::general(
                        "destructuring patterns are not allowed in using declarations",
                        position,
                    ));
                }

                let bindings = ArrayBindingPattern::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?;

                let init = if cursor
                    .peek(0, interner)?
                    .as_ref()
                    .is_some_and(|t| *t.kind() == TokenKind::Punctuator(Punctuator::Assign))
                {
                    Some(
                        Initializer::new(self.allow_in, self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?,
                    )
                } else {
                    None
                };

                let declaration = bindings.into();

                if bound_names(&declaration).contains(&Sym::LET) {
                    return Err(Error::lex(LexError::Syntax(
                        "'let' is disallowed as a lexically bound name".into(),
                        position,
                    )));
                }

                Ok(Variable::from_pattern(declaration, init))
            }
            _ => {
                let ident = BindingIdentifier::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?;

                if ident == Sym::LET {
                    return Err(Error::lex(LexError::Syntax(
                        "'let' is disallowed as a lexically bound name".into(),
                        position,
                    )));
                }

                let init = if cursor
                    .peek(0, interner)?
                    .as_ref()
                    .is_some_and(|t| *t.kind() == TokenKind::Punctuator(Punctuator::Assign))
                {
                    let mut init =
                        Initializer::new(self.allow_in, self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?;
                    init.set_anonymous_function_definition_name(&ident);
                    Some(init)
                } else {
                    None
                };
                Ok(Variable::from_identifier(ident, init))
            }
        }
    }
}
