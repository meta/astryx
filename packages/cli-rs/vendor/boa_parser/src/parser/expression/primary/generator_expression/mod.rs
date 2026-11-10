//! Generator expression parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/function*
//! [spec]: https://tc39.es/ecma262/#prod-GeneratorExpression

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
    function::GeneratorExpression as GeneratorExpressionNode,
    operations::{ContainsSymbol, bound_names, contains, lexically_declared_names},
};
use boa_interner::{Interner, Sym};

/// Generator expression parsing.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/function*
/// [spec]: https://tc39.es/ecma262/#prod-GeneratorExpression
#[derive(Debug, Clone, Copy)]
pub(super) struct GeneratorExpression {}

impl GeneratorExpression {
    /// Creates a new `GeneratorExpression` parser.
    pub(in crate::parser) fn new() -> Self {
        Self {}
    }
}

impl<R> TokenParser<R> for GeneratorExpression
where
    R: ReadChar,
{
    type Output = GeneratorExpressionNode;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let token = cursor.expect((Keyword::Function, false), "generator expression", interner)?;
        let start_linear_span = token.linear_span();
        let function_span_start = token.span().start();

        cursor.expect(
            TokenKind::Punctuator(Punctuator::Mul),
            "generator expression",
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
                let name = BindingIdentifier::new(true, false).parse(cursor, interner)?;

                (Some(name), span)
            }
            _ => (None, token.span()),
        };

        let params_start_position = cursor
            .expect(Punctuator::OpenParen, "generator expression", interner)?
            .span()
            .end();

        let params = FormalParameters::new(true, false).parse(cursor, interner)?;

        cursor.expect(Punctuator::CloseParen, "generator expression", interner)?;

        let body =
            FunctionBody::new(true, false, "generator expression").parse(cursor, interner)?;

        // If the source text matched by FormalParameters is strict mode code,
        // the Early Error rules for UniqueFormalParameters : FormalParameters are applied.
        // https://tc39.es/ecma262/#sec-generator-function-definitions-static-semantics-early-errors
        if (cursor.strict() || body.strict()) && params.has_duplicates() {
            return Err(Error::lex(LexError::Syntax(
                "Duplicate parameter name not allowed in this context".into(),
                params_start_position,
            )));
        }

        // It is a Syntax Error if FunctionBodyContainsUseStrict of GeneratorBody is true
        // and IsSimpleParameterList of FormalParameters is false.
        // https://tc39.es/ecma262/#sec-generator-function-definitions-static-semantics-early-errors
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
        // also occurs in the LexicallyDeclaredNames of GeneratorBody.
        // https://tc39.es/ecma262/#sec-generator-function-definitions-static-semantics-early-errors
        name_in_lexically_declared_names(
            &bound_names(&params),
            &lexically_declared_names(&body),
            params_start_position,
            interner,
        )?;

        // It is a Syntax Error if FormalParameters Contains YieldExpression is true.
        // https://tc39.es/ecma262/#sec-generator-function-definitions-static-semantics-early-errors
        if contains(&params, ContainsSymbol::YieldExpression) {
            return Err(Error::lex(LexError::Syntax(
                "generator expression cannot contain yield expression in parameters".into(),
                params_start_position,
            )));
        }

        let span = start_linear_span.union(body.linear_pos_end());

        let function_span_end = body.span().end();
        let function = GeneratorExpressionNode::new(
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
