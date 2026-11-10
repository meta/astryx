//! Async arrow function parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions
//! [spec]: https://tc39.es/ecma262/#sec-async-arrow-function-definitions

use super::arrow_function::ExpressionBody;
use crate::{
    error::{Error, ErrorContext, ParseResult},
    lexer::{Error as LexError, TokenKind},
    parser::{
        AllowIn, AllowYield, Cursor, OrAbrupt, TokenParser,
        expression::BindingIdentifier,
        function::{FormalParameters, FunctionBody},
        name_in_lexically_declared_names,
    },
    source::ReadChar,
};
use ast::{
    Keyword,
    operations::{ContainsSymbol, bound_names, contains, lexically_declared_names},
};
use boa_ast::{
    self as ast, Punctuator, Span, Spanned, StatementList,
    declaration::Variable,
    function::{FormalParameter, FormalParameterList},
    statement::Return,
};
use boa_interner::Interner;

/// Async arrow function parsing.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions
/// [spec]: https://tc39.es/ecma262/#prod-AsyncArrowFunction
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct AsyncArrowFunction {
    allow_in: AllowIn,
    allow_yield: AllowYield,
}

impl AsyncArrowFunction {
    /// Creates a new `AsyncArrowFunction` parser.
    pub(in crate::parser) fn new<I, Y>(allow_in: I, allow_yield: Y) -> Self
    where
        I: Into<AllowIn>,
        Y: Into<AllowYield>,
    {
        Self {
            allow_in: allow_in.into(),
            allow_yield: allow_yield.into(),
        }
    }
}

impl<R> TokenParser<R> for AsyncArrowFunction
where
    R: ReadChar,
{
    type Output = ast::function::AsyncArrowFunction;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let async_token =
            cursor.expect((Keyword::Async, false), "async arrow function", interner)?;
        let start_linear_span = async_token.linear_span();
        let async_token_span = async_token.span();
        cursor.peek_expect_no_lineterminator(0, "async arrow function", interner)?;

        let next_token = cursor.peek(0, interner).or_abrupt()?;
        let (params, params_start_position) =
            if next_token.kind() == &TokenKind::Punctuator(Punctuator::OpenParen) {
                let params_start_position = cursor
                    .expect(Punctuator::OpenParen, "async arrow function", interner)?
                    .span()
                    .end();

                let params = FormalParameters::new(false, true).parse(cursor, interner)?;
                cursor.expect(Punctuator::CloseParen, "async arrow function", interner)?;
                (params, params_start_position)
            } else {
                let params_start_position = next_token.span().start();
                let param = BindingIdentifier::new(self.allow_yield, true)
                    .parse(cursor, interner)
                    .set_context("async arrow function")?;
                (
                    FormalParameterList::from(FormalParameter::new(
                        Variable::from_identifier(param, None),
                        false,
                    )),
                    params_start_position,
                )
            };

        cursor.peek_expect_no_lineterminator(0, "async arrow function", interner)?;
        cursor.expect(Punctuator::Arrow, "async arrow function", interner)?;

        let body = AsyncConciseBody::new(self.allow_in).parse(cursor, interner)?;

        // Early Error: ArrowFormalParameters are UniqueFormalParameters.
        if params.has_duplicates() {
            return Err(Error::lex(LexError::Syntax(
                "Duplicate parameter name not allowed in this context".into(),
                params_start_position,
            )));
        }

        // Early Error: It is a Syntax Error if CoverCallExpressionAndAsyncArrowHead Contains YieldExpression is true.
        if contains(&params, ContainsSymbol::YieldExpression) {
            return Err(Error::lex(LexError::Syntax(
                "Yield expression not allowed in this context".into(),
                params_start_position,
            )));
        }

        // Early Error: It is a Syntax Error if CoverCallExpressionAndAsyncArrowHead Contains AwaitExpression is true.
        if contains(&params, ContainsSymbol::AwaitExpression) {
            return Err(Error::lex(LexError::Syntax(
                "Await expression not allowed in this context".into(),
                params_start_position,
            )));
        }

        // Early Error: It is a Syntax Error if AsyncConciseBodyContainsUseStrict of AsyncConciseBody is true and
        // IsSimpleParameterList of CoverCallExpressionAndAsyncArrowHead is false.
        if body.strict() && !params.is_simple() {
            return Err(Error::lex(LexError::Syntax(
                "Illegal 'use strict' directive in function with non-simple parameter list".into(),
                params_start_position,
            )));
        }

        // Early Error: It is a Syntax Error if any element of the BoundNames of CoverCallExpressionAndAsyncArrowHead
        // also occurs in the LexicallyDeclaredNames of AsyncConciseBody.
        name_in_lexically_declared_names(
            &bound_names(&params),
            &lexically_declared_names(&body),
            params_start_position,
            interner,
        )?;

        let linear_pos_end = body.linear_pos_end();
        let linear_span = start_linear_span.union(linear_pos_end);

        let body_span_end = body.span().end();
        Ok(ast::function::AsyncArrowFunction::new(
            None,
            params,
            body,
            linear_span,
            Span::new(async_token_span.start(), body_span_end),
        ))
    }
}

/// <https://tc39.es/ecma262/#prod-AsyncConciseBody>
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct AsyncConciseBody {
    allow_in: AllowIn,
}

impl AsyncConciseBody {
    /// Creates a new `AsyncConciseBody` parser.
    pub(in crate::parser) fn new<I>(allow_in: I) -> Self
    where
        I: Into<AllowIn>,
    {
        Self {
            allow_in: allow_in.into(),
        }
    }
}

impl<R> TokenParser<R> for AsyncConciseBody
where
    R: ReadChar,
{
    type Output = ast::function::FunctionBody;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let body = if let TokenKind::Punctuator(Punctuator::OpenBlock) =
            cursor.peek(0, interner).or_abrupt()?.kind()
        {
            FunctionBody::new(false, true, "async arrow function").parse(cursor, interner)?
        } else {
            let expression = ExpressionBody::new(self.allow_in, true).parse(cursor, interner)?;
            let span = expression.span();
            ast::function::FunctionBody::new(
                StatementList::new(
                    [ast::Statement::Return(Return::new(expression.into())).into()],
                    cursor.linear_pos(),
                    false,
                ),
                span,
            )
        };

        Ok(body)
    }
}
