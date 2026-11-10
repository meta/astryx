//! Async Generator Expression Parser
//!
//! Implements `TokenParser` for `AsyncGeneratorExpression` and outputs
//! an `AsyncGeneratorExpr` ast node
//!
//!  More information:
//!  - [ECMAScript specification][spec]
//!
//! [spec]: https://tc39.es/ecma262/#prod-AsyncGeneratorExpression
#[cfg(test)]
mod tests;

use crate::{
    Error,
    lexer::{Error as LexError, TokenKind},
    parser::{
        Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::BindingIdentifier,
        function::{FormalParameters, FunctionBody},
        name_in_lexically_declared_names,
    },
    source::ReadChar,
};
use boa_ast::{
    Keyword, Punctuator, Span, Spanned,
    function::AsyncGeneratorExpression as AsyncGeneratorExpressionNode,
    operations::{ContainsSymbol, bound_names, contains, lexically_declared_names},
};
use boa_interner::{Interner, Sym};

/// Async Generator Expression Parsing
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-AsyncGeneratorExpression
#[derive(Debug, Clone, Copy)]
pub(super) struct AsyncGeneratorExpression {}

impl AsyncGeneratorExpression {
    /// Creates a new `AsyncGeneratorExpression` parser.
    pub(in crate::parser) fn new() -> Self {
        Self {}
    }
}

impl<R> TokenParser<R> for AsyncGeneratorExpression
where
    R: ReadChar,
{
    //The below needs to be implemented in ast::node
    type Output = AsyncGeneratorExpressionNode;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let token = cursor.expect(
            (Keyword::Async, false),
            "async function expression",
            interner,
        )?;
        let start_linear_span = token.linear_span();
        let function_span_start = token.span().start();

        cursor.peek_expect_no_lineterminator(0, "async generator expression", interner)?;
        cursor.expect(
            (Keyword::Function, false),
            "async generator expression",
            interner,
        )?;
        cursor.expect(
            TokenKind::Punctuator(Punctuator::Mul),
            "async generator expression",
            interner,
        )?;

        let token = cursor.peek(0, interner).or_abrupt()?;
        let (name, name_span) = match token.kind() {
            TokenKind::IdentifierName(_)
            | TokenKind::Keyword((
                Keyword::Yield | Keyword::Await | Keyword::Async | Keyword::Of,
                _,
            )) => {
                let span = token.span();
                let name = BindingIdentifier::new(true, true).parse(cursor, interner)?;

                (Some(name), span)
            }
            _ => (None, token.span()),
        };

        let params_start_position = cursor
            .expect(
                Punctuator::OpenParen,
                "async generator expression",
                interner,
            )?
            .span()
            .end();

        let params = FormalParameters::new(true, true).parse(cursor, interner)?;

        // It is a Syntax Error if FormalParameters Contains YieldExpression is true.
        if contains(&params, ContainsSymbol::YieldExpression) {
            return Err(Error::lex(LexError::Syntax(
                "yield expression not allowed in async generator expression parameters".into(),
                params_start_position,
            )));
        }

        // It is a Syntax Error if FormalParameters Contains AwaitExpression is true.
        if contains(&params, ContainsSymbol::AwaitExpression) {
            return Err(Error::lex(LexError::Syntax(
                "await expression not allowed in async generator expression parameters".into(),
                params_start_position,
            )));
        }

        cursor.expect(
            Punctuator::CloseParen,
            "async generator expression",
            interner,
        )?;

        let body =
            FunctionBody::new(true, true, "async generator expression").parse(cursor, interner)?;

        // Early Error: If the source code matching FormalParameters is strict mode code,
        // the Early Error rules for UniqueFormalParameters : FormalParameters are applied.
        if (cursor.strict() || body.strict()) && params.has_duplicates() {
            return Err(Error::lex(LexError::Syntax(
                "Duplicate parameter name not allowed in this context".into(),
                params_start_position,
            )));
        }

        // Early Error: It is a Syntax Error if FunctionBodyContainsUseStrict of GeneratorBody is true
        // and IsSimpleParameterList of FormalParameters is false.
        if body.strict() && !params.is_simple() {
            return Err(Error::lex(LexError::Syntax(
                "Illegal 'use strict' directive in function with non-simple parameter list".into(),
                params_start_position,
            )));
        }

        // Early Error: If BindingIdentifier is present and the source code matching BindingIdentifier is strict mode code,
        // it is a Syntax Error if the StringValue of BindingIdentifier is "eval" or "arguments".
        if let Some(name) = name
            && (cursor.strict() || body.strict())
            && [Sym::EVAL, Sym::ARGUMENTS].contains(&name.sym())
        {
            return Err(Error::lex(LexError::Syntax(
                "unexpected identifier 'eval' or 'arguments' in strict mode".into(),
                name_span.start(),
            )));
        }

        // Catch early error for BindingIdentifier, because strictness of the functions body is also
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

        let span = start_linear_span.union(body.linear_pos_end());

        let function_span_end = body.span().end();
        let function = AsyncGeneratorExpressionNode::new(
            name,
            params,
            body,
            span,
            name.is_some(),
            Span::new(function_span_start, function_span_end),
        );

        if contains(&function, ContainsSymbol::Super) {
            return Err(Error::lex(LexError::Syntax(
                "invalid super usage".into(),
                params_start_position,
            )));
        }

        Ok(function)
    }
}
