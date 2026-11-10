//! Hoistable declaration parsing.
//!
//! More information:
//!  - [ECMAScript specification][spec]
//!
//! [spec]: https://tc39.es/ecma262/#prod-HoistableDeclaration

#[cfg(test)]
mod tests;

mod async_function_decl;
mod async_generator_decl;
mod function_decl;
mod generator_decl;

pub(crate) mod class_decl;

use crate::{
    Error,
    lexer::TokenKind,
    parser::{
        AllowAwait, AllowDefault, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::BindingIdentifier,
        function::{FormalParameters, FunctionBody},
        name_in_lexically_declared_names,
        statement::LexError,
    },
    source::ReadChar,
};
use boa_ast::{
    self as ast, Declaration, Keyword, Punctuator, Spanned,
    expression::Identifier,
    function::FormalParameterList,
    operations::{ContainsSymbol, bound_names, contains, lexically_declared_names},
};
use boa_interner::{Interner, Sym};

pub(in crate::parser) use self::{
    async_function_decl::AsyncFunctionDeclaration, async_generator_decl::AsyncGeneratorDeclaration,
    class_decl::ClassDeclaration, function_decl::FunctionDeclaration,
    generator_decl::GeneratorDeclaration,
};

/// Hoistable declaration parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-FunctionDeclaration
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct HoistableDeclaration {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    is_default: AllowDefault,
}

impl HoistableDeclaration {
    /// Creates a new `HoistableDeclaration` parser.
    pub(in crate::parser) fn new<Y, A, D>(allow_yield: Y, allow_await: A, is_default: D) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
        D: Into<AllowDefault>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            is_default: is_default.into(),
        }
    }
}

impl<R> TokenParser<R> for HoistableDeclaration
where
    R: ReadChar,
{
    type Output = Declaration;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let tok = cursor.peek(0, interner).or_abrupt()?;

        match tok.kind() {
            TokenKind::Keyword((Keyword::Function | Keyword::Async | Keyword::Class, true)) => {
                Err(Error::general(
                    "Keyword must not contain escaped characters",
                    tok.span().start(),
                ))
            }
            TokenKind::Keyword((Keyword::Function, false)) => {
                let next_token = cursor.peek(1, interner).or_abrupt()?;
                if next_token.kind() == &TokenKind::Punctuator(Punctuator::Mul) {
                    GeneratorDeclaration::new(self.allow_yield, self.allow_await, self.is_default)
                        .parse(cursor, interner)
                        .map(Declaration::from)
                } else {
                    FunctionDeclaration::new(self.allow_yield, self.allow_await, self.is_default)
                        .parse(cursor, interner)
                        .map(Declaration::from)
                }
            }
            TokenKind::Keyword((Keyword::Async, false)) => {
                let next_token = cursor.peek(2, interner).or_abrupt()?;
                if next_token.kind() == &TokenKind::Punctuator(Punctuator::Mul) {
                    AsyncGeneratorDeclaration::new(
                        self.allow_yield,
                        self.allow_await,
                        self.is_default,
                    )
                    .parse(cursor, interner)
                    .map(Declaration::from)
                } else {
                    AsyncFunctionDeclaration::new(self.allow_yield, self.allow_await, false)
                        .parse(cursor, interner)
                        .map(Declaration::from)
                }
            }
            TokenKind::Keyword((Keyword::Class, false)) => {
                ClassDeclaration::new(self.allow_yield, self.allow_await, false)
                    .parse(cursor, interner)
                    .map(Declaration::from)
            }
            _ => Err(Error::expected(
                [
                    Keyword::Function.to_string(),
                    Keyword::Async.to_string(),
                    Keyword::Class.to_string(),
                ],
                tok.to_string(interner),
                tok.span(),
                "declaration",
            )),
        }
    }
}

trait CallableDeclaration {
    fn error_context(&self) -> &'static str;
    fn is_default(&self) -> bool;
    fn name_allow_yield(&self) -> bool;
    fn name_allow_await(&self) -> bool;
    fn parameters_allow_yield(&self) -> bool;
    fn parameters_allow_await(&self) -> bool;
    fn body_allow_yield(&self) -> bool;
    fn body_allow_await(&self) -> bool;
    fn parameters_yield_is_early_error(&self) -> bool {
        false
    }
    fn parameters_await_is_early_error(&self) -> bool {
        false
    }
}

// This is a helper function to not duplicate code in the individual callable declaration parsers.
fn parse_callable_declaration<R: ReadChar, C: CallableDeclaration>(
    c: &C,
    cursor: &mut Cursor<R>,
    interner: &mut Interner,
) -> ParseResult<(Identifier, FormalParameterList, ast::function::FunctionBody)> {
    let token = cursor.peek(0, interner).or_abrupt()?;
    let name_span = token.span();
    let name = match token.kind() {
        TokenKind::Punctuator(Punctuator::OpenParen) => {
            if !c.is_default() {
                return Err(Error::unexpected(
                    token.to_string(interner),
                    token.span(),
                    c.error_context(),
                ));
            }
            Identifier::new(Sym::DEFAULT, name_span)
        }
        _ => BindingIdentifier::new(c.name_allow_yield(), c.name_allow_await())
            .parse(cursor, interner)?,
    };

    let params_start_position = cursor
        .expect(Punctuator::OpenParen, c.error_context(), interner)?
        .span()
        .end();

    let params = FormalParameters::new(c.parameters_allow_yield(), c.parameters_allow_await())
        .parse(cursor, interner)?;

    cursor.expect(Punctuator::CloseParen, c.error_context(), interner)?;

    let body = FunctionBody::new(
        c.body_allow_yield(),
        c.body_allow_await(),
        c.error_context(),
    )
    .parse(cursor, interner)?;

    // If the source text matched by FormalParameters is strict mode code,
    // the Early Error rules for UniqueFormalParameters : FormalParameters are applied.
    if (cursor.strict() || body.strict()) && params.has_duplicates() {
        return Err(Error::lex(LexError::Syntax(
            "Duplicate parameter name not allowed in this context".into(),
            params_start_position,
        )));
    }

    // It is a Syntax Error if FunctionBodyContainsUseStrict of FunctionBody is true
    // and IsSimpleParameterList of FormalParameters is false.
    if body.strict() && !params.is_simple() {
        return Err(Error::lex(LexError::Syntax(
            "Illegal 'use strict' directive in function with non-simple parameter list".into(),
            params_start_position,
        )));
    }

    // Early Error: If BindingIdentifier is present and the source code matching BindingIdentifier is strict mode code,
    // it is a Syntax Error if the StringValue of BindingIdentifier is "eval" or "arguments".
    if (cursor.strict() || body.strict()) && [Sym::EVAL, Sym::ARGUMENTS].contains(&name.sym()) {
        return Err(Error::lex(LexError::Syntax(
            "unexpected identifier 'eval' or 'arguments' in strict mode".into(),
            name_span.start(),
        )));
    }

    // Early Error for BindingIdentifier, because the strictness of the functions body is also
    // relevant for the function parameters.
    if body.strict() && contains(&params, ContainsSymbol::EvalOrArguments) {
        return Err(Error::lex(LexError::Syntax(
            "unexpected identifier 'eval' or 'arguments' in strict mode".into(),
            params_start_position,
        )));
    }

    // It is a Syntax Error if any element of the BoundNames of FormalParameters
    // also occurs in the LexicallyDeclaredNames of FunctionBody.
    name_in_lexically_declared_names(
        &bound_names(&params),
        &lexically_declared_names(&body),
        params_start_position,
        interner,
    )?;

    // It is a Syntax Error if FormalParameters Contains SuperProperty is true.
    // It is a Syntax Error if FunctionBody Contains SuperProperty is true.
    // It is a Syntax Error if FormalParameters Contains SuperCall is true.
    // It is a Syntax Error if FunctionBody Contains SuperCall is true.
    if contains(&body, ContainsSymbol::Super) || contains(&params, ContainsSymbol::Super) {
        return Err(Error::lex(LexError::Syntax(
            "invalid super usage".into(),
            params_start_position,
        )));
    }

    if c.parameters_yield_is_early_error() {
        // It is a Syntax Error if FormalParameters Contains YieldExpression is true.
        if contains(&params, ContainsSymbol::YieldExpression) {
            return Err(Error::lex(LexError::Syntax(
                "invalid yield usage in generator function parameters".into(),
                params_start_position,
            )));
        }
    }

    if c.parameters_await_is_early_error() {
        // It is a Syntax Error if FormalParameters Contains AwaitExpression is true.
        if contains(&params, ContainsSymbol::AwaitExpression) {
            return Err(Error::lex(LexError::Syntax(
                "invalid await usage in generator function parameters".into(),
                params_start_position,
            )));
        }
    }

    Ok((name, params, body))
}
