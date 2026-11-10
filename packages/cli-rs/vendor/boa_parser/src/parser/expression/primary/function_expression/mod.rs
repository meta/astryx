//! Function expression parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/function
//! [spec]: https://tc39.es/ecma262/#prod-FunctionExpression

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
    function::FunctionExpression as FunctionExpressionNode,
    operations::{ContainsSymbol, bound_names, contains, lexically_declared_names},
};
use boa_interner::{Interner, Sym};

/// Function expression parsing.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/function
/// [spec]: https://tc39.es/ecma262/#prod-FunctionExpression
#[derive(Debug, Clone, Copy)]
pub(super) struct FunctionExpression {}

impl FunctionExpression {
    /// Creates a new `FunctionExpression` parser.
    pub(in crate::parser) fn new() -> Self {
        Self {}
    }
}

impl<R> TokenParser<R> for FunctionExpression
where
    R: ReadChar,
{
    type Output = FunctionExpressionNode;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let token = cursor.expect((Keyword::Function, false), "generator expression", interner)?;
        let start_linear_span = token.linear_span();
        let function_token_span_start = token.span().start();

        let token = cursor.peek(0, interner).or_abrupt()?;

        let (name, name_span) = match token.kind() {
            TokenKind::IdentifierName(_)
            | TokenKind::Keyword((
                Keyword::Yield | Keyword::Await | Keyword::Async | Keyword::Of,
                _,
            )) => {
                let span = token.span();
                let name = BindingIdentifier::new(false, false).parse(cursor, interner)?;

                (Some(name), span)
            }
            _ => (None, token.span()),
        };

        let params_start_position = cursor
            .expect(Punctuator::OpenParen, "function expression", interner)?
            .span()
            .end();

        let params = FormalParameters::new(false, false).parse(cursor, interner)?;

        cursor.expect(Punctuator::CloseParen, "function expression", interner)?;

        let body =
            FunctionBody::new(false, false, "function expression").parse(cursor, interner)?;

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
        // https://tc39.es/ecma262/#sec-function-definitions-static-semantics-early-errors
        name_in_lexically_declared_names(
            &bound_names(&params),
            &lexically_declared_names(&body),
            params_start_position,
            interner,
        )?;

        let span = Some(start_linear_span.union(body.linear_pos_end()));

        let body_span_end = body.span().end();
        let function = FunctionExpressionNode::new(
            name,
            params,
            body,
            span,
            name.is_some(),
            Span::new(function_token_span_start, body_span_end),
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
