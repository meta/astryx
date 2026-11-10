//! Primary expression parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators#Primary_expressions
//! [spec]: https://tc39.es/ecma262/#prod-PrimaryExpression

#[cfg(test)]
mod tests;

mod array_initializer;
mod async_function_expression;
mod async_generator_expression;
mod class_expression;
mod function_expression;
mod generator_expression;
mod template;

pub(in crate::parser) mod object_initializer;

use self::{
    array_initializer::ArrayLiteral, async_function_expression::AsyncFunctionExpression,
    async_generator_expression::AsyncGeneratorExpression, class_expression::ClassExpression,
    function_expression::FunctionExpression, generator_expression::GeneratorExpression,
    object_initializer::ObjectLiteral,
};
use crate::{
    Error,
    lexer::{
        InputElement, Token, TokenKind,
        token::{ContainsEscapeSequence, Numeric},
    },
    parser::{
        AllowAwait, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::{
            BindingIdentifier, Expression, FormalParameterListOrExpression,
            identifiers::IdentifierReference, primary::template::TemplateLiteral,
        },
        statement::{ArrayBindingPattern, ObjectBindingPattern},
    },
    source::ReadChar,
};
use ast::expression::RegExpLiteral as AstRegExp;
use boa_ast::{
    self as ast, Keyword, Punctuator, Span, Spanned,
    declaration::Variable,
    expression::{
        Identifier, Parenthesized, This,
        literal::{self, Literal, LiteralKind, TemplateElement},
        operator::{assign::AssignTarget, binary::BinaryOp},
    },
    function::{FormalParameter, FormalParameterList},
    operations::{ContainsSymbol, contains},
    pattern::{ArrayPattern, ObjectPattern, Pattern},
};
use boa_interner::{Interner, Sym};

pub(in crate::parser) use object_initializer::Initializer;

/// Parses a primary expression.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_Operators#Primary_expressions
/// [spec]: https://tc39.es/ecma262/#prod-PrimaryExpression
#[derive(Debug, Clone, Copy)]
pub(super) struct PrimaryExpression {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl PrimaryExpression {
    /// Creates a new `PrimaryExpression` parser.
    pub(super) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
        }
    }
}

impl<R> TokenParser<R> for PrimaryExpression
where
    R: ReadChar,
{
    type Output = FormalParameterListOrExpression;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        // TODO: tok currently consumes the token instead of peeking, so the token
        // isn't passed and consumed by parsers according to spec (EX: GeneratorExpression)
        let tok = cursor.peek(0, interner).or_abrupt()?;
        let tok_position = tok.span().start();

        match tok.kind() {
            TokenKind::Keyword((Keyword::This, true))
            | TokenKind::BooleanLiteral((_, ContainsEscapeSequence(true)))
            | TokenKind::NullLiteral(ContainsEscapeSequence(true)) => Err(Error::general(
                "Keyword must not contain escaped characters",
                tok_position,
            )),
            TokenKind::Keyword((Keyword::This, false)) => {
                let span = tok.span();
                cursor.advance(interner);
                Ok(This::new(span).into())
            }
            TokenKind::Keyword((Keyword::Function, _)) => {
                let next_token = cursor.peek(1, interner).or_abrupt()?;
                if next_token.kind() == &TokenKind::Punctuator(Punctuator::Mul) {
                    GeneratorExpression::new()
                        .parse(cursor, interner)
                        .map(Into::into)
                } else {
                    FunctionExpression::new()
                        .parse(cursor, interner)
                        .map(Into::into)
                }
            }
            TokenKind::Keyword((Keyword::Class, _)) => {
                ClassExpression::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)
                    .map(Into::into)
            }
            TokenKind::Keyword((Keyword::Async, contain_escaped_char)) => {
                let contain_escaped_char = *contain_escaped_char;
                let skip_n = if cursor.peek_is_line_terminator(0, interner).or_abrupt()? {
                    2
                } else {
                    1
                };
                let is_line_terminator = cursor
                    .peek_is_line_terminator(skip_n, interner)?
                    .unwrap_or(true);

                match cursor.peek(1, interner)?.map(Token::kind) {
                    Some(TokenKind::Keyword((Keyword::Function, _)))
                        if !is_line_terminator && !contain_escaped_char =>
                    {
                        match cursor.peek(2, interner)?.map(Token::kind) {
                            Some(TokenKind::Punctuator(Punctuator::Mul)) => {
                                AsyncGeneratorExpression::new()
                                    .parse(cursor, interner)
                                    .map(Into::into)
                            }
                            _ => AsyncFunctionExpression::new()
                                .parse(cursor, interner)
                                .map(Into::into),
                        }
                    }
                    _ => IdentifierReference::new(self.allow_yield, self.allow_await)
                        .parse(cursor, interner)
                        .map(Into::into),
                }
            }
            TokenKind::Punctuator(Punctuator::OpenParen) => {
                let expr = CoverParenthesizedExpressionAndArrowParameterList::new(
                    self.allow_yield,
                    self.allow_await,
                )
                .parse(cursor, interner)?;
                Ok(expr)
            }
            TokenKind::Punctuator(Punctuator::OpenBracket) => {
                ArrayLiteral::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)
                    .map(Into::into)
            }
            TokenKind::Punctuator(Punctuator::OpenBlock) => {
                ObjectLiteral::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)
                    .map(Into::into)
            }
            TokenKind::BooleanLiteral((boolean, _)) => {
                let node = Literal::with_linear_span(*boolean, tok.span(), tok.linear_span());
                cursor.advance(interner);
                Ok(node.into())
            }
            TokenKind::NullLiteral(_) => {
                let node =
                    Literal::with_linear_span(LiteralKind::Null, tok.span(), tok.linear_span());
                cursor.advance(interner);
                Ok(node.into())
            }
            TokenKind::IdentifierName(_)
            | TokenKind::Keyword((
                Keyword::Let | Keyword::Yield | Keyword::Await | Keyword::Of,
                _,
            )) => IdentifierReference::new(self.allow_yield, self.allow_await)
                .parse(cursor, interner)
                .map(Into::into),
            TokenKind::StringLiteral((lit, _)) => {
                let node = Literal::with_linear_span(*lit, tok.span(), tok.linear_span());
                cursor.advance(interner);
                Ok(node.into())
            }
            TokenKind::TemplateNoSubstitution(template_string) => {
                let Some(cooked) = template_string.cooked() else {
                    return Err(Error::general(
                        "invalid escape in template literal",
                        tok.span().start(),
                    ));
                };
                let temp = literal::TemplateLiteral::new(
                    Box::new([TemplateElement::String(cooked)]),
                    tok.span(),
                );
                cursor.advance(interner);
                Ok(temp.into())
            }
            TokenKind::NumericLiteral(Numeric::Integer(num)) => {
                let node = Literal::with_linear_span(*num, tok.span(), tok.linear_span());
                cursor.advance(interner);
                Ok(node.into())
            }
            TokenKind::NumericLiteral(Numeric::Rational(num)) => {
                let node = Literal::with_linear_span(*num, tok.span(), tok.linear_span());
                cursor.advance(interner);
                Ok(node.into())
            }
            TokenKind::NumericLiteral(Numeric::BigInt(num)) => {
                let node = Literal::with_linear_span(num.clone(), tok.span(), tok.linear_span());
                cursor.advance(interner);
                Ok(node.into())
            }
            TokenKind::RegularExpressionLiteral(body, flags) => {
                let node = AstRegExp::new(*body, *flags, tok.span()).into();
                cursor.advance(interner);
                Ok(node)
            }
            TokenKind::Punctuator(div @ (Punctuator::Div | Punctuator::AssignDiv)) => {
                let init_with_eq = div == &Punctuator::AssignDiv;

                let start_pos_group = tok.start_group();
                cursor.advance(interner);
                let tok = cursor.lex_regex(start_pos_group, interner, init_with_eq)?;

                if let TokenKind::RegularExpressionLiteral(body, flags) = *tok.kind() {
                    Ok(AstRegExp::new(body, flags, tok.span()).into())
                } else {
                    // A regex was expected and nothing else.
                    Err(Error::unexpected(
                        tok.to_string(interner),
                        tok.span(),
                        "regular expression literal",
                    ))
                }
            }
            TokenKind::TemplateMiddle(template_string) => {
                let Some(cooked) = template_string.cooked() else {
                    return Err(Error::general(
                        "invalid escape in template literal",
                        tok.span().start(),
                    ));
                };
                let parser = TemplateLiteral::new(
                    self.allow_yield,
                    self.allow_await,
                    tok.start_group(),
                    cooked,
                );
                cursor.advance(interner);
                parser.parse(cursor, interner).map(Into::into)
            }
            _ => Err(Error::unexpected(
                tok.to_string(interner),
                tok.span(),
                "primary expression",
            )),
        }
    }
}

/// Parses a `CoverParenthesizedExpressionAndArrowParameterList` expression.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-CoverParenthesizedExpressionAndArrowParameterList
#[derive(Debug, Clone, Copy)]
pub(super) struct CoverParenthesizedExpressionAndArrowParameterList {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl CoverParenthesizedExpressionAndArrowParameterList {
    /// Creates a new `CoverParenthesizedExpressionAndArrowParameterList` parser.
    pub(super) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
        }
    }
}

impl<R> TokenParser<R> for CoverParenthesizedExpressionAndArrowParameterList
where
    R: ReadChar,
{
    type Output = FormalParameterListOrExpression;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        #[derive(Debug)]
        enum InnerExpression {
            Expression(ast::Expression),
            SpreadObject(ObjectPattern),
            SpreadArray(ArrayPattern),
            SpreadBinding(Identifier),
        }
        let span_start = cursor
            .expect(
                Punctuator::OpenParen,
                "parenthesis expression or arrow function",
                interner,
            )?
            .span();

        cursor.set_goal(InputElement::RegExp);

        let mut expressions = Vec::new();
        let mut tailing_comma = None;

        let next = cursor.peek(0, interner).or_abrupt()?;
        let span = match next.kind() {
            TokenKind::Punctuator(Punctuator::CloseParen) => {
                let span = next.span();
                cursor.advance(interner);
                span
            }
            TokenKind::Punctuator(Punctuator::Spread) => {
                cursor.advance(interner);
                let next = cursor.peek(0, interner).or_abrupt()?;
                match next.kind() {
                    TokenKind::Punctuator(Punctuator::OpenBlock) => {
                        let bindings =
                            ObjectBindingPattern::new(self.allow_yield, self.allow_await)
                                .parse(cursor, interner)?;
                        expressions.push(InnerExpression::SpreadObject(bindings));
                    }
                    TokenKind::Punctuator(Punctuator::OpenBracket) => {
                        let bindings = ArrayBindingPattern::new(self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?;
                        expressions.push(InnerExpression::SpreadArray(bindings));
                    }
                    _ => {
                        let binding = BindingIdentifier::new(self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?;
                        expressions.push(InnerExpression::SpreadBinding(binding));
                    }
                }

                cursor
                    .expect(
                        Punctuator::CloseParen,
                        "CoverParenthesizedExpressionAndArrowParameterList",
                        interner,
                    )?
                    .span()
            }
            _ => {
                let expression = Expression::new(true, self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?;
                expressions.push(InnerExpression::Expression(expression));

                let next = cursor.peek(0, interner).or_abrupt()?;
                match next.kind() {
                    TokenKind::Punctuator(Punctuator::CloseParen) => {
                        let span = next.span();
                        cursor.advance(interner);
                        span
                    }
                    TokenKind::Punctuator(Punctuator::Comma) => {
                        cursor.advance(interner);
                        let next = cursor.peek(0, interner).or_abrupt()?;
                        match next.kind() {
                            TokenKind::Punctuator(Punctuator::CloseParen) => {
                                let span = next.span();
                                tailing_comma = Some(next.span());
                                cursor.advance(interner);
                                span
                            }
                            TokenKind::Punctuator(Punctuator::Spread) => {
                                cursor.advance(interner);
                                let next = cursor.peek(0, interner).or_abrupt()?;
                                match next.kind() {
                                    TokenKind::Punctuator(Punctuator::OpenBlock) => {
                                        let bindings = ObjectBindingPattern::new(
                                            self.allow_yield,
                                            self.allow_await,
                                        )
                                        .parse(cursor, interner)?;
                                        expressions.push(InnerExpression::SpreadObject(bindings));
                                    }
                                    TokenKind::Punctuator(Punctuator::OpenBracket) => {
                                        let bindings = ArrayBindingPattern::new(
                                            self.allow_yield,
                                            self.allow_await,
                                        )
                                        .parse(cursor, interner)?;
                                        expressions.push(InnerExpression::SpreadArray(bindings));
                                    }
                                    _ => {
                                        let binding = BindingIdentifier::new(
                                            self.allow_yield,
                                            self.allow_await,
                                        )
                                        .parse(cursor, interner)?;
                                        expressions.push(InnerExpression::SpreadBinding(binding));
                                    }
                                }

                                cursor
                                    .expect(
                                        Punctuator::CloseParen,
                                        "CoverParenthesizedExpressionAndArrowParameterList",
                                        interner,
                                    )?
                                    .span()
                            }
                            _ => {
                                return Err(Error::expected(
                                    vec![")".to_owned(), "...".to_owned()],
                                    next.kind().to_string(interner),
                                    next.span(),
                                    "CoverParenthesizedExpressionAndArrowParameterList",
                                ));
                            }
                        }
                    }
                    _ => {
                        return Err(Error::expected(
                            vec![")".to_owned(), ",".to_owned()],
                            next.kind().to_string(interner),
                            next.span(),
                            "CoverParenthesizedExpressionAndArrowParameterList",
                        ));
                    }
                }
            }
        };

        let is_arrow = if cursor.peek(0, interner)?.map(Token::kind)
            == Some(&TokenKind::Punctuator(Punctuator::Arrow))
        {
            !cursor.peek_is_line_terminator(0, interner).or_abrupt()?
        } else {
            false
        };

        // If the next token is not an arrow, we know that we must parse a parenthesized expression.
        if !is_arrow {
            if let Some(span) = tailing_comma {
                return Err(Error::unexpected(
                    Punctuator::Comma,
                    span,
                    "trailing comma in parenthesized expression",
                ));
            }
            if expressions.is_empty() {
                return Err(Error::unexpected(
                    Punctuator::CloseParen,
                    span,
                    "empty parenthesized expression",
                ));
            }
            if expressions.len() != 1 {
                return Err(Error::unexpected(
                    Punctuator::CloseParen,
                    span,
                    "multiple expressions in parenthesized expression",
                ));
            }
            if matches!(expressions[0], InnerExpression::Expression(_)) {
                // Move the expression out (cloning a large one is costly).
                let Some(InnerExpression::Expression(expression)) = expressions.pop() else {
                    unreachable!("checked above");
                };
                return Ok(ast::Expression::Parenthesized(Parenthesized::new(
                    expression,
                    Span::new(span_start.start(), span.end()),
                ))
                .into());
            }
            return Err(Error::unexpected(
                Punctuator::CloseParen,
                span,
                "parenthesized expression with spread expressions",
            ));
        }

        // We know that we must parse an arrow function.
        // We parse the expressions in to a parameter list.

        let mut parameters = Vec::new();

        for expression in expressions {
            match expression {
                InnerExpression::Expression(node) => {
                    expression_to_formal_parameters(
                        &node,
                        &mut parameters,
                        cursor.strict(),
                        span_start,
                    )?;
                }
                InnerExpression::SpreadObject(pattern) => {
                    let declaration = Variable::from_pattern(pattern.into(), None);
                    let parameter = FormalParameter::new(declaration, true);
                    parameters.push(parameter);
                }
                InnerExpression::SpreadArray(pattern) => {
                    let declaration = Variable::from_pattern(pattern.into(), None);
                    let parameter = FormalParameter::new(declaration, true);
                    parameters.push(parameter);
                }
                InnerExpression::SpreadBinding(ident) => {
                    let declaration = Variable::from_identifier(ident, None);
                    let parameter = FormalParameter::new(declaration, true);
                    parameters.push(parameter);
                }
            }
        }

        let parameters = FormalParameterList::from(parameters);

        if let Some(span) = tailing_comma
            && parameters.has_rest_parameter()
        {
            return Err(Error::general(
                "rest parameter must be last formal parameter",
                span.start(),
            ));
        }

        if contains(&parameters, ContainsSymbol::YieldExpression) {
            return Err(Error::general(
                "yield expression is not allowed in formal parameter list of arrow function",
                span_start.start(),
            ));
        }

        Ok(FormalParameterListOrExpression::FormalParameterList {
            fpl: parameters,
            span_start: span.start(),
        })
    }
}

/// Convert an expression to a formal parameter and append it to the given parameter list.
fn expression_to_formal_parameters(
    node: &ast::Expression,
    parameters: &mut Vec<FormalParameter>,
    strict: bool,
    span: Span,
) -> ParseResult<()> {
    match node {
        ast::Expression::Identifier(identifier) if strict && *identifier == Sym::EVAL => {
            return Err(Error::general(
                "parameter name 'eval' not allowed in strict mode",
                span.start(),
            ));
        }
        ast::Expression::Identifier(identifier) if strict && *identifier == Sym::ARGUMENTS => {
            return Err(Error::general(
                "parameter name 'arguments' not allowed in strict mode",
                span.start(),
            ));
        }
        ast::Expression::Identifier(identifier) => {
            parameters.push(FormalParameter::new(
                Variable::from_identifier(*identifier, None),
                false,
            ));
        }
        ast::Expression::Binary(bin_op) if bin_op.op() == BinaryOp::Comma => {
            expression_to_formal_parameters(bin_op.lhs(), parameters, strict, span)?;
            expression_to_formal_parameters(bin_op.rhs(), parameters, strict, span)?;
        }
        ast::Expression::Assign(assign) => match assign.lhs() {
            AssignTarget::Identifier(ident) => {
                parameters.push(FormalParameter::new(
                    Variable::from_identifier(*ident, Some(assign.rhs().clone())),
                    false,
                ));
            }
            AssignTarget::Pattern(pattern) => match pattern {
                Pattern::Object(pattern) => {
                    parameters.push(FormalParameter::new(
                        Variable::from_pattern(pattern.clone().into(), Some(assign.rhs().clone())),
                        false,
                    ));
                }
                Pattern::Array(pattern) => {
                    parameters.push(FormalParameter::new(
                        Variable::from_pattern(pattern.clone().into(), Some(assign.rhs().clone())),
                        false,
                    ));
                }
            },
            AssignTarget::Access(_) => {
                return Err(Error::general(
                    "invalid initialization expression in formal parameter list",
                    span.start(),
                ));
            }
        },
        ast::Expression::ObjectLiteral(object) => {
            let pattern = object.to_pattern(strict).ok_or_else(|| {
                Error::general(
                    "invalid object binding pattern in formal parameter list",
                    span.start(),
                )
            })?;

            parameters.push(FormalParameter::new(
                Variable::from_pattern(pattern.into(), None),
                false,
            ));
        }
        ast::Expression::ArrayLiteral(array) => {
            let pattern = array.to_pattern(strict).ok_or_else(|| {
                Error::general(
                    "invalid array binding pattern in formal parameter list",
                    span.start(),
                )
            })?;

            parameters.push(FormalParameter::new(
                Variable::from_pattern(pattern.into(), None),
                false,
            ));
        }
        _ => {
            return Err(Error::unexpected(
                ")".to_string(),
                span,
                "parenthesized expression with non-binding expression",
            ));
        }
    }
    Ok(())
}
