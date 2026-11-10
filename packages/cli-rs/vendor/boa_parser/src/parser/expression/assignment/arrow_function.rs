//! Arrow function parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions
//! [spec]: https://tc39.es/ecma262/#sec-arrow-function-definitions

use super::AssignmentExpression;
use crate::{
    error::{Error, ErrorContext, ParseResult},
    lexer::{Error as LexError, TokenKind},
    parser::{
        AllowAwait, AllowIn, AllowYield, Cursor, OrAbrupt, TokenParser,
        expression::BindingIdentifier,
        function::{FormalParameters, FunctionBody},
        name_in_lexically_declared_names,
    },
    source::ReadChar,
};
use ast::operations::{bound_names, lexically_declared_names};
use boa_ast::{
    self as ast, Expression, Punctuator, Span, Spanned, StatementList,
    declaration::Variable,
    function::{FormalParameter, FormalParameterList},
    operations::{ContainsSymbol, contains},
    statement::Return,
};
use boa_interner::Interner;

/// Arrow function parsing.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions
/// [spec]: https://tc39.es/ecma262/#prod-ArrowFunction
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct ArrowFunction {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl ArrowFunction {
    /// Creates a new `ArrowFunction` parser.
    pub(in crate::parser) fn new<I, Y, A>(allow_in: I, allow_yield: Y, allow_await: A) -> Self
    where
        I: Into<AllowIn>,
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_in: allow_in.into(),
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
        }
    }
}

impl<R> TokenParser<R> for ArrowFunction
where
    R: ReadChar,
{
    type Output = ast::function::ArrowFunction;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let next_token = cursor.peek(0, interner).or_abrupt()?;
        let start_linear_span = next_token.linear_span();

        let (params, params_start_position) =
            if next_token.kind() == &TokenKind::Punctuator(Punctuator::OpenParen) {
                // CoverParenthesizedExpressionAndArrowParameterList
                let params_start_position = cursor
                    .expect(Punctuator::OpenParen, "arrow function", interner)?
                    .span()
                    .start();

                let params = FormalParameters::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?;
                cursor.expect(Punctuator::CloseParen, "arrow function", interner)?;
                (params, params_start_position)
            } else {
                let params_start_position = next_token.span().start();
                let param = BindingIdentifier::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)
                    .set_context("arrow function")?;
                (
                    FormalParameterList::from(FormalParameter::new(
                        Variable::from_identifier(param, None),
                        false,
                    )),
                    params_start_position,
                )
            };

        // Early Error: ArrowFormalParameters are UniqueFormalParameters.
        if params.has_duplicates() {
            return Err(Error::lex(LexError::Syntax(
                "Duplicate parameter name not allowed in this context".into(),
                params_start_position,
            )));
        }

        // Early Error: It is a Syntax Error if ArrowParameters Contains YieldExpression is true.
        if contains(&params, ContainsSymbol::YieldExpression) {
            return Err(Error::lex(LexError::Syntax(
                "Yield expression not allowed in this context".into(),
                params_start_position,
            )));
        }

        // Early Error: It is a Syntax Error if ArrowParameters Contains AwaitExpression is true.
        if contains(&params, ContainsSymbol::AwaitExpression) {
            return Err(Error::lex(LexError::Syntax(
                "Await expression not allowed in this context".into(),
                params_start_position,
            )));
        }

        cursor.peek_expect_no_lineterminator(0, "arrow function", interner)?;

        cursor.expect(
            TokenKind::Punctuator(Punctuator::Arrow),
            "arrow function",
            interner,
        )?;
        let arrow = cursor.arrow();
        cursor.set_arrow(true);
        let body = ConciseBody::new(self.allow_in).parse(cursor, interner)?;
        cursor.set_arrow(arrow);

        // Early Error: It is a Syntax Error if ConciseBodyContainsUseStrict of ConciseBody is true
        // and IsSimpleParameterList of ArrowParameters is false.
        if body.strict() && !params.is_simple() {
            return Err(Error::lex(LexError::Syntax(
                "Illegal 'use strict' directive in function with non-simple parameter list".into(),
                params_start_position,
            )));
        }

        // It is a Syntax Error if any element of the BoundNames of ArrowParameters
        // also occurs in the LexicallyDeclaredNames of ConciseBody.
        // https://tc39.es/ecma262/#sec-arrow-function-definitions-static-semantics-early-errors
        name_in_lexically_declared_names(
            &bound_names(&params),
            &lexically_declared_names(&body),
            params_start_position,
            interner,
        )?;

        let linear_pos_end = body.linear_pos_end();
        let linear_span = start_linear_span.union(linear_pos_end);

        let body_span_end = body.span().end();
        Ok(ast::function::ArrowFunction::new(
            None,
            params,
            body,
            linear_span,
            Span::new(params_start_position, body_span_end),
        ))
    }
}

/// <https://tc39.es/ecma262/#prod-ConciseBody>
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct ConciseBody {
    allow_in: AllowIn,
}

impl ConciseBody {
    /// Creates a new `ConciseBody` parser.
    pub(in crate::parser) fn new<I>(allow_in: I) -> Self
    where
        I: Into<AllowIn>,
    {
        Self {
            allow_in: allow_in.into(),
        }
    }
}

impl<R> TokenParser<R> for ConciseBody
where
    R: ReadChar,
{
    type Output = ast::function::FunctionBody;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let stmts = if let TokenKind::Punctuator(Punctuator::OpenBlock) =
            cursor.peek(0, interner).or_abrupt()?.kind()
        {
            FunctionBody::new(false, false, "arrow function").parse(cursor, interner)?
        } else {
            let expression = ExpressionBody::new(self.allow_in, false).parse(cursor, interner)?;
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

        Ok(stmts)
    }
}

/// <https://tc39.es/ecma262/#prod-ExpressionBody>
#[derive(Debug, Clone, Copy)]
pub(super) struct ExpressionBody {
    allow_in: AllowIn,
    allow_await: AllowAwait,
}

impl ExpressionBody {
    /// Creates a new `ExpressionBody` parser.
    pub(super) fn new<I, A>(allow_in: I, allow_await: A) -> Self
    where
        I: Into<AllowIn>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_in: allow_in.into(),
            allow_await: allow_await.into(),
        }
    }
}

impl<R> TokenParser<R> for ExpressionBody
where
    R: ReadChar,
{
    type Output = Expression;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        AssignmentExpression::new(self.allow_in, false, self.allow_await).parse(cursor, interner)
    }
}
