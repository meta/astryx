//! For statement parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for
//! [spec]: https://tc39.es/ecma262/#sec-for-statement

use crate::{
    Error,
    lexer::{Error as LexError, TokenKind},
    parser::{
        AllowAwait, AllowReturn, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::{AssignmentExpression, Expression},
        statement::{
            Statement,
            declaration::{LexicalDeclaration, allowed_token_after_let},
            variable::VariableDeclarationList,
        },
    },
    source::ReadChar,
};
use ast::{
    declaration::Binding,
    operations::{bound_names, var_declared_names},
};
use boa_ast::{
    self as ast, Keyword, Position, Punctuator, Spanned,
    statement::{
        ForInLoop, ForLoop, ForOfLoop,
        iteration::{ForLoopInitializer, IterableLoopInitializer},
    },
};
use boa_interner::{Interner, Sym};
use rustc_hash::FxHashSet;

/// For statement parsing
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for
/// [spec]: https://tc39.es/ecma262/#sec-for-statement
#[derive(Debug, Clone, Copy)]
pub(in crate::parser::statement) struct ForStatement {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    allow_return: AllowReturn,
}

impl ForStatement {
    /// Creates a new `ForStatement` parser.
    pub(in crate::parser::statement) fn new<Y, A, R>(
        allow_yield: Y,
        allow_await: A,
        allow_return: R,
    ) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
        R: Into<AllowReturn>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            allow_return: allow_return.into(),
        }
    }
}

impl<R> TokenParser<R> for ForStatement
where
    R: ReadChar,
{
    type Output = ast::Statement;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect((Keyword::For, false), "for statement", interner)?;

        let mut r#await = false;

        let next = cursor.next(interner).or_abrupt()?;
        let init_position = match next.kind() {
            TokenKind::Punctuator(Punctuator::OpenParen) => next.span().end(),
            TokenKind::Keyword((Keyword::Await, _)) if !self.allow_await.0 => {
                return Err(Error::unexpected(
                    next.to_string(interner),
                    next.span(),
                    "for await...of is only valid in async functions or async generators",
                ));
            }
            TokenKind::Keyword((Keyword::Await, _)) => {
                r#await = true;
                cursor
                    .expect(Punctuator::OpenParen, "for await...of", interner)?
                    .span()
                    .end()
            }
            _ => {
                return Err(Error::unexpected(
                    next.to_string(interner),
                    next.span(),
                    "for statement",
                ));
            }
        };

        let mut init_is_async_of = false;
        let init = match cursor.peek(0, interner).or_abrupt()?.kind().clone() {
            TokenKind::Keyword((Keyword::Var, _)) => {
                cursor.advance(interner);
                Some(
                    VariableDeclarationList::new(false, self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?
                        .into(),
                )
            }
            TokenKind::Keyword((Keyword::Let, false))
                if allowed_token_after_let(cursor.peek(1, interner)?) =>
            {
                Some(
                    LexicalDeclaration::new(false, self.allow_yield, self.allow_await, true)
                        .parse(cursor, interner)?
                        .into(),
                )
            }
            TokenKind::Keyword((Keyword::Const, _)) => Some(
                LexicalDeclaration::new(false, self.allow_yield, self.allow_await, true)
                    .parse(cursor, interner)?
                    .into(),
            ),
            TokenKind::Keyword((Keyword::Async, false)) if !r#await => {
                if matches!(
                    cursor.peek(1, interner).or_abrupt()?.kind(),
                    TokenKind::Keyword((Keyword::Of, false))
                ) {
                    init_is_async_of = true;
                }

                Some(
                    Expression::new(false, self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?
                        .into(),
                )
            }
            TokenKind::Punctuator(Punctuator::Semicolon) => None,
            _ => Some(
                Expression::new(false, self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?
                    .into(),
            ),
        };

        let token = cursor.peek(0, interner).or_abrupt()?;
        let position = token.span().start();
        let init = match (init, token.kind()) {
            (Some(_), TokenKind::Keyword((Keyword::In | Keyword::Of, true))) => {
                return Err(Error::general(
                    "Keyword must not contain escaped characters",
                    position,
                ));
            }
            (Some(_), TokenKind::Keyword((Keyword::In, false))) if r#await => {
                return Err(Error::general(
                    "`await` can only be used in a `for await .. of` loop",
                    position,
                ));
            }
            (Some(init), TokenKind::Keyword((kw @ (Keyword::In | Keyword::Of), false))) => {
                if kw == &Keyword::Of
                    && let ForLoopInitializer::Expression(ast::Expression::Identifier(ident)) = init
                    && ident.sym() == Sym::LET
                {
                    return Err(Error::general(
                        "'let' cannot be used as the iterable in a for-of loop",
                        position,
                    ));
                }

                if init_is_async_of
                    && let ForLoopInitializer::Expression(ast::Expression::Identifier(ident)) = init
                    && ident.sym() == Sym::ASYNC
                {
                    return Err(Error::lex(LexError::Syntax(
                        "invalid left-hand side expression 'async' of a for-of loop".into(),
                        init_position,
                    )));
                }

                let in_loop = kw == &Keyword::In;
                let init = initializer_to_iterable_loop_initializer(
                    init,
                    position,
                    cursor.strict(),
                    in_loop,
                )?;

                cursor.advance(interner);
                let expr = if in_loop {
                    Expression::new(true, self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?
                } else {
                    AssignmentExpression::new(true, self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?
                };

                cursor.expect(Punctuator::CloseParen, "for in/of statement", interner)?;

                let position = cursor.peek(0, interner).or_abrupt()?.span().start();

                let body = Statement::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)?;

                // Early Error: It is a Syntax Error if IsLabelledFunction(Statement) is true.
                if body.is_labelled_function() {
                    return Err(Error::wrong_labelled_function_declaration(position));
                }

                // Checks are only applicable to lexical bindings.
                if matches!(
                    &init,
                    IterableLoopInitializer::Const(_) | IterableLoopInitializer::Let(_)
                ) {
                    // It is a Syntax Error if the BoundNames of ForDeclaration contains "let".
                    // It is a Syntax Error if any element of the BoundNames of ForDeclaration also occurs in the VarDeclaredNames of Statement.
                    // It is a Syntax Error if the BoundNames of ForDeclaration contains any duplicate entries.
                    let vars = var_declared_names(&body);
                    let mut names = FxHashSet::default();
                    for name in bound_names(&init) {
                        if name == Sym::LET {
                            return Err(Error::general(
                                "Cannot use 'let' as a lexically bound name",
                                position,
                            ));
                        }
                        if vars.contains(&name) {
                            return Err(Error::general(
                                "For loop initializer declared in loop body",
                                position,
                            ));
                        }
                        if !names.insert(name) {
                            return Err(Error::general(
                                "For loop initializer cannot contain duplicate identifiers",
                                position,
                            ));
                        }
                    }
                }
                return Ok(if in_loop {
                    ForInLoop::new(init, expr, body).into()
                } else {
                    ForOfLoop::new(init, expr, body, r#await).into()
                });
            }
            (init, _) => init,
        };

        if let Some(ForLoopInitializer::Lexical(initializer)) = &init
            && let ast::declaration::LexicalDeclaration::Const(list) = initializer.declaration()
        {
            for decl in list.as_ref() {
                if decl.init().is_none() {
                    return Err(Error::general(
                        "Expected initializer for const declaration",
                        position,
                    ));
                }
            }
        }

        cursor.expect(Punctuator::Semicolon, "for statement", interner)?;

        let cond = if cursor.next_if(Punctuator::Semicolon, interner)?.is_some() {
            None
        } else {
            let step = Expression::new(true, self.allow_yield, self.allow_await)
                .parse(cursor, interner)?;
            cursor.expect(Punctuator::Semicolon, "for statement", interner)?;
            Some(step)
        };

        let step = if cursor.next_if(Punctuator::CloseParen, interner)?.is_some() {
            None
        } else {
            let step = Expression::new(true, self.allow_yield, self.allow_await)
                .parse(cursor, interner)?;
            cursor.expect(
                TokenKind::Punctuator(Punctuator::CloseParen),
                "for statement",
                interner,
            )?;
            Some(step)
        };

        let position = cursor.peek(0, interner).or_abrupt()?.span().start();

        let body = Statement::new(self.allow_yield, self.allow_await, self.allow_return)
            .parse(cursor, interner)?;

        // Early Error: It is a Syntax Error if IsLabelledFunction(Statement) is true.
        if body.is_labelled_function() {
            return Err(Error::wrong_labelled_function_declaration(position));
        }

        // Early Error: It is a Syntax Error if any element of the BoundNames of
        // LexicalDeclaration also occurs in the VarDeclaredNames of Statement.
        // Note: only applies to lexical bindings.
        if let Some(ForLoopInitializer::Lexical(initializer)) = &init {
            let vars = var_declared_names(&body);
            for name in bound_names(initializer.declaration()) {
                if vars.contains(&name) {
                    return Err(Error::general(
                        "For loop initializer declared in loop body",
                        position,
                    ));
                }
            }
        }

        Ok(ForLoop::new(init, cond, step, body).into())
    }
}

fn initializer_to_iterable_loop_initializer(
    initializer: ForLoopInitializer,
    position: Position,
    strict: bool,
    in_loop: bool,
) -> ParseResult<IterableLoopInitializer> {
    let loop_type = if in_loop { "for-in" } else { "for-of" };
    match initializer {
        ForLoopInitializer::Expression(mut expr) => {
            while let ast::Expression::Parenthesized(p) = expr {
                expr = p.expression().clone();
            }
            match expr {
                ast::Expression::Identifier(ident)
                    if strict && [Sym::EVAL, Sym::ARGUMENTS].contains(&ident.sym()) =>
                {
                    Err(Error::lex(LexError::Syntax(
                        "cannot use `eval` or `arguments` as iterable loop variable in strict code"
                            .into(),
                        position,
                    )))
                }
                ast::Expression::Identifier(ident) => {
                    Ok(IterableLoopInitializer::Identifier(ident))
                }
                ast::Expression::ArrayLiteral(array) => array
                    .to_pattern(strict)
                    .ok_or_else(|| {
                        Error::general(
                            "invalid array destructuring pattern in iterable loop initializer",
                            position,
                        )
                    })
                    .map(|arr| IterableLoopInitializer::Pattern(arr.into())),
                ast::Expression::ObjectLiteral(object) => object
                    .to_pattern(strict)
                    .ok_or_else(|| {
                        Error::general(
                            "invalid object destructuring pattern in iterable loop initializer",
                            position,
                        )
                    })
                    .map(|obj| IterableLoopInitializer::Pattern(obj.into())),
                ast::Expression::PropertyAccess(access) => {
                    Ok(IterableLoopInitializer::Access(access))
                }
                _ => Err(Error::lex(LexError::Syntax(
                    "invalid variable for iterable loop".into(),
                    position,
                ))),
            }
        }
        ForLoopInitializer::Lexical(initializer) => {
            match initializer.declaration().variable_list().as_ref() {
                [decl] => {
                    if decl.init().is_some() {
                        return Err(Error::lex(LexError::Syntax(
                        format!("a lexical declaration in the head of a {loop_type} loop can't have an initializer")
                            .into(),
                        position,
                    )));
                    }
                    Ok(match initializer.declaration() {
                        ast::declaration::LexicalDeclaration::Const(_) => {
                            IterableLoopInitializer::Const(decl.binding().clone())
                        }
                        ast::declaration::LexicalDeclaration::Let(_)
                        | ast::declaration::LexicalDeclaration::Using(_)
                        | ast::declaration::LexicalDeclaration::AwaitUsing(_) => {
                            IterableLoopInitializer::Let(decl.binding().clone())
                        }
                    })
                }
                _ => Err(Error::lex(LexError::Syntax(
                    format!("only one variable can be declared in the head of a {loop_type} loop")
                        .into(),
                    position,
                ))),
            }
        }
        ForLoopInitializer::Var(decl) => match decl.0.as_ref() {
            [declaration] => {
                // https://tc39.es/ecma262/#sec-initializers-in-forin-statement-heads
                let is_pattern = matches!(declaration.binding(), Binding::Pattern(_));
                if declaration.init().is_some()
                    && (cfg!(not(feature = "annex-b")) || strict || !in_loop || is_pattern)
                {
                    return Err(Error::lex(LexError::Syntax(
                        format!(
                            "{}a {} declaration in the head of a {loop_type} loop \
                            cannot have an initializer",
                            if strict { "in strict mode, " } else { "" },
                            if is_pattern {
                                "binding pattern"
                            } else {
                                "binding declaration"
                            }
                        )
                        .into(),
                        position,
                    )));
                }
                Ok(IterableLoopInitializer::Var(declaration.clone()))
            }
            _ => Err(Error::lex(LexError::Syntax(
                format!("only one variable can be declared in the head of a {loop_type} loop")
                    .into(),
                position,
            ))),
        },
    }
}
