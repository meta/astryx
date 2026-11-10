//! Object initializer parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer
//! [spec]: https://tc39.es/ecma262/#sec-object-initializer

#[cfg(test)]
mod tests;

use crate::{
    Error,
    lexer::{
        Error as LexError, InputElement, TokenKind,
        token::{ContainsEscapeSequence, Numeric},
    },
    parser::{
        AllowAwait, AllowIn, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::{AssignmentExpression, identifiers::IdentifierReference},
        function::{FormalParameter, FormalParameters, FunctionBody, UniqueFormalParameters},
        name_in_lexically_declared_names,
    },
    source::ReadChar,
};
use boa_ast::{
    Expression, Keyword, Punctuator, Span, Spanned,
    expression::{
        Identifier,
        literal::{
            self, Literal, ObjectMethodDefinition, PropertyDefinition as PropertyDefinitionNode,
        },
    },
    function::{
        ClassElementName as ClassElementNameNode, FormalParameterList,
        FunctionBody as FunctionBodyAst, PrivateName,
    },
    operations::{
        ContainsSymbol, bound_names, contains, has_direct_super_new, lexically_declared_names,
    },
    property::{MethodDefinitionKind, PropertyName as PropertyNameNode},
};
use boa_interner::{Interner, Sym};

/// Parses an object literal.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer
/// [spec]: https://tc39.es/ecma262/#prod-ObjectLiteral
#[derive(Debug, Clone, Copy)]
pub(super) struct ObjectLiteral {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl ObjectLiteral {
    /// Creates a new `ObjectLiteral` parser.
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

impl<R> TokenParser<R> for ObjectLiteral
where
    R: ReadChar,
{
    type Output = literal::ObjectLiteral;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let open_block_token = cursor.expect(Punctuator::OpenBlock, "object parsing", interner)?;
        cursor.set_goal(InputElement::RegExp);

        let mut elements = Vec::new();

        let mut has_proto = false;
        let mut duplicate_proto_position = None;

        let end = loop {
            if let Some(token) = cursor.next_if(Punctuator::CloseBlock, interner)? {
                break token.span().end();
            }

            let position = cursor.peek(0, interner).or_abrupt()?.span().start();

            let property = PropertyDefinition::new(self.allow_yield, self.allow_await)
                .parse(cursor, interner)?;

            if let PropertyDefinitionNode::Property(PropertyNameNode::Literal(ident), _) = property
                && ident.sym() == Sym::__PROTO__
            {
                if has_proto && duplicate_proto_position.is_none() {
                    duplicate_proto_position = Some(position);
                } else {
                    has_proto = true;
                }
            }

            elements.push(property);

            if let Some(token) = cursor.next_if(Punctuator::CloseBlock, interner)? {
                break token.span().end();
            }

            if cursor.next_if(Punctuator::Comma, interner)?.is_none() {
                let next_token = cursor.next(interner).or_abrupt()?;
                return Err(Error::expected(
                    [",".to_owned(), "}".to_owned()],
                    next_token.to_string(interner),
                    next_token.span(),
                    "object literal",
                ));
            }
        };

        if let Some(position) = duplicate_proto_position
            && !cursor.json_parse()
            && cursor
                .peek(0, interner)?
                .is_none_or(|token| token.kind() != &TokenKind::Punctuator(Punctuator::Assign))
        {
            return Err(Error::general(
                "Duplicate __proto__ fields are not allowed in object literals.",
                position,
            ));
        }

        let start = open_block_token.span().start();
        Ok(literal::ObjectLiteral::new(elements, Span::new(start, end)))
    }
}

/// Parses a property definition.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-PropertyDefinition
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct PropertyDefinition {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl PropertyDefinition {
    /// Creates a new `PropertyDefinition` parser.
    pub(in crate::parser) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for PropertyDefinition
where
    R: ReadChar,
{
    type Output = PropertyDefinitionNode;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        match cursor.peek(1, interner).or_abrupt()?.kind() {
            TokenKind::Punctuator(Punctuator::CloseBlock | Punctuator::Comma) => {
                let ident = IdentifierReference::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?;
                return Ok(PropertyDefinitionNode::IdentifierReference(ident));
            }
            TokenKind::Punctuator(Punctuator::Assign) => {
                return CoverInitializedName::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner);
            }
            _ => {}
        }

        //  ... AssignmentExpression[+In, ?Yield, ?Await]
        if cursor.next_if(Punctuator::Spread, interner)?.is_some() {
            let node = AssignmentExpression::new(true, self.allow_yield, self.allow_await)
                .parse(cursor, interner)?;
            return Ok(PropertyDefinitionNode::SpreadObject(node));
        }

        //Async [AsyncMethod, AsyncGeneratorMethod] object methods
        let is_keyword = !matches!(
            cursor.peek(1, interner).or_abrupt()?.kind(),
            TokenKind::Punctuator(Punctuator::OpenParen | Punctuator::Colon)
        );

        let token = cursor.peek(0, interner).or_abrupt()?;
        let start_linear_pos = token.linear_span().start();

        match token.kind() {
            TokenKind::Keyword((Keyword::Async, true)) if is_keyword => {
                return Err(Error::general(
                    "Keyword must not contain escaped characters",
                    token.span().start(),
                ));
            }
            TokenKind::Keyword((Keyword::Async, false)) if is_keyword => {
                cursor.advance(interner);
                cursor.peek_expect_no_lineterminator(0, "Async object methods", interner)?;

                let token = cursor.peek(0, interner).or_abrupt()?;
                let position = token.span().start();

                if token.kind() == &TokenKind::Punctuator(Punctuator::Mul) {
                    let (class_element_name, params, body) =
                        AsyncGeneratorMethod::new(self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?;

                    let ClassElementNameNode::PropertyName(property_name) = class_element_name
                    else {
                        return Err(Error::general(
                            "private identifiers not allowed in object literal",
                            position,
                        ));
                    };

                    // Early Error: It is a Syntax Error if HasDirectSuper of MethodDefinition is true.
                    if has_direct_super_new(&params, &body) {
                        return Err(Error::lex(LexError::Syntax(
                            "invalid super call usage".into(),
                            position,
                        )));
                    }

                    return Ok(PropertyDefinitionNode::MethodDefinition(
                        ObjectMethodDefinition::new(
                            property_name,
                            params,
                            body,
                            MethodDefinitionKind::AsyncGenerator,
                            start_linear_pos,
                        ),
                    ));
                }
                let (class_element_name, params, body) =
                    AsyncMethod::new(self.allow_yield, self.allow_await).parse(cursor, interner)?;

                let ClassElementNameNode::PropertyName(property_name) = class_element_name else {
                    return Err(Error::general(
                        "private identifiers not allowed in object literal",
                        position,
                    ));
                };

                // Early Error: It is a Syntax Error if HasDirectSuper of MethodDefinition is true.
                if has_direct_super_new(&params, &body) {
                    return Err(Error::lex(LexError::Syntax(
                        "invalid super call usage".into(),
                        position,
                    )));
                }

                return Ok(PropertyDefinitionNode::MethodDefinition(
                    ObjectMethodDefinition::new(
                        property_name,
                        params,
                        body,
                        MethodDefinitionKind::Async,
                        start_linear_pos,
                    ),
                ));
            }
            _ => {}
        }

        let token = cursor.peek(0, interner).or_abrupt()?;
        let start_linear_pos = token.linear_span().start();

        if token.kind() == &TokenKind::Punctuator(Punctuator::Mul) {
            let position = cursor.peek(0, interner).or_abrupt()?.span().start();
            let (class_element_name, params, body) =
                GeneratorMethod::new(self.allow_yield, self.allow_await).parse(cursor, interner)?;

            let ClassElementNameNode::PropertyName(property_name) = class_element_name else {
                return Err(Error::general(
                    "private identifier not allowed in object literal",
                    position,
                ));
            };

            // Early Error: It is a Syntax Error if HasDirectSuper of MethodDefinition is true.
            if has_direct_super_new(&params, &body) {
                return Err(Error::lex(LexError::Syntax(
                    "invalid super call usage".into(),
                    position,
                )));
            }

            return Ok(PropertyDefinitionNode::MethodDefinition(
                ObjectMethodDefinition::new(
                    property_name,
                    params,
                    body,
                    MethodDefinitionKind::Generator,
                    start_linear_pos,
                ),
            ));
        }

        let set_or_get_escaped_position = match token.kind() {
            TokenKind::IdentifierName((Sym::GET | Sym::SET, ContainsEscapeSequence(true))) => {
                Some(token.span().start())
            }
            _ => None,
        };

        let mut property_name =
            PropertyName::new(self.allow_yield, self.allow_await).parse(cursor, interner)?;

        //  PropertyName[?Yield, ?Await] : AssignmentExpression[+In, ?Yield, ?Await]
        if cursor.next_if(Punctuator::Colon, interner)?.is_some() {
            let mut value = AssignmentExpression::new(true, self.allow_yield, self.allow_await)
                .parse(cursor, interner)?;

            if let Some(name) = property_name.literal()
                && name != Sym::__PROTO__
            {
                value.set_anonymous_function_definition_name(&name);
            }

            return Ok(PropertyDefinitionNode::Property(property_name, value));
        }

        let ordinary_method = cursor.peek(0, interner).or_abrupt()?.kind()
            == &TokenKind::Punctuator(Punctuator::OpenParen);

        match property_name {
            // MethodDefinition[?Yield, ?Await] -> get ClassElementName[?Yield, ?Await] ( ) { FunctionBody[~Yield, ~Await] }
            PropertyNameNode::Literal(str) if str == Sym::GET && !ordinary_method => {
                if let Some(position) = set_or_get_escaped_position {
                    return Err(Error::general(
                        "Keyword must not contain escaped characters",
                        position,
                    ));
                }

                let position = cursor.peek(0, interner).or_abrupt()?.span().start();

                property_name = PropertyName::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?;

                cursor.expect(
                    TokenKind::Punctuator(Punctuator::OpenParen),
                    "get method definition",
                    interner,
                )?;
                cursor.expect(
                    TokenKind::Punctuator(Punctuator::CloseParen),
                    "get method definition",
                    interner,
                )?;

                let body = FunctionBody::new(false, false, "get method definition")
                    .parse(cursor, interner)?;

                // Early Error: It is a Syntax Error if HasDirectSuper of MethodDefinition is true.
                if has_direct_super_new(&FormalParameterList::default(), &body) {
                    return Err(Error::lex(LexError::Syntax(
                        "invalid super call usage".into(),
                        position,
                    )));
                }

                Ok(PropertyDefinitionNode::MethodDefinition(
                    ObjectMethodDefinition::new(
                        property_name,
                        FormalParameterList::default(),
                        body,
                        MethodDefinitionKind::Get,
                        start_linear_pos,
                    ),
                ))
            }
            // MethodDefinition[?Yield, ?Await] -> set ClassElementName[?Yield, ?Await] ( PropertySetParameterList ) { FunctionBody[~Yield, ~Await] }
            PropertyNameNode::Literal(str) if str == Sym::SET && !ordinary_method => {
                if let Some(position) = set_or_get_escaped_position {
                    return Err(Error::general(
                        "Keyword must not contain escaped characters",
                        position,
                    ));
                }

                property_name = PropertyName::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?;

                let params_start_position = cursor
                    .expect(
                        TokenKind::Punctuator(Punctuator::OpenParen),
                        "set method definition",
                        interner,
                    )?
                    .span()
                    .end();
                let params: FormalParameterList = FormalParameter::new(false, false)
                    .parse(cursor, interner)?
                    .into();
                cursor.expect(
                    TokenKind::Punctuator(Punctuator::CloseParen),
                    "set method definition",
                    interner,
                )?;

                let body = FunctionBody::new(false, false, "set method definition")
                    .parse(cursor, interner)?;

                // Catch early error for BindingIdentifier.
                if body.strict() && contains(&params, ContainsSymbol::EvalOrArguments) {
                    return Err(Error::lex(LexError::Syntax(
                        "unexpected identifier 'eval' or 'arguments' in strict mode".into(),
                        params_start_position,
                    )));
                }

                // It is a Syntax Error if FunctionBodyContainsUseStrict of FunctionBody is true
                // and IsSimpleParameterList of PropertySetParameterList is false.
                // https://tc39.es/ecma262/#sec-method-definitions-static-semantics-early-errors
                if body.strict() && !params.is_simple() {
                    return Err(Error::lex(LexError::Syntax(
                        "Illegal 'use strict' directive in function with non-simple parameter list"
                            .into(),
                        params_start_position,
                    )));
                }

                // It is a Syntax Error if any element of the BoundNames of PropertySetParameterList also
                // occurs in the LexicallyDeclaredNames of FunctionBody.
                // https://tc39.es/ecma262/#sec-method-definitions-static-semantics-early-errors
                name_in_lexically_declared_names(
                    &bound_names(&params),
                    &lexically_declared_names(&body),
                    params_start_position,
                    interner,
                )?;

                // Early Error: It is a Syntax Error if HasDirectSuper of MethodDefinition is true.
                if has_direct_super_new(&params, &body) {
                    return Err(Error::lex(LexError::Syntax(
                        "invalid super call usage".into(),
                        params_start_position,
                    )));
                }

                Ok(PropertyDefinitionNode::MethodDefinition(
                    ObjectMethodDefinition::new(
                        property_name,
                        params,
                        body,
                        MethodDefinitionKind::Set,
                        start_linear_pos,
                    ),
                ))
            }
            // MethodDefinition[?Yield, ?Await] -> ClassElementName[?Yield, ?Await] ( UniqueFormalParameters[~Yield, ~Await] ) { FunctionBody[~Yield, ~Await] }
            _ => {
                let params_start_position = cursor
                    .expect(
                        TokenKind::Punctuator(Punctuator::OpenParen),
                        "method definition",
                        interner,
                    )?
                    .span()
                    .end();
                let params = FormalParameters::new(false, false).parse(cursor, interner)?;
                cursor.expect(
                    TokenKind::Punctuator(Punctuator::CloseParen),
                    "method definition",
                    interner,
                )?;

                // Early Error: UniqueFormalParameters : FormalParameters
                if params.has_duplicates() {
                    return Err(Error::lex(LexError::Syntax(
                        "Duplicate parameter name not allowed in this context".into(),
                        params_start_position,
                    )));
                }

                let body =
                    FunctionBody::new(false, false, "method definition").parse(cursor, interner)?;

                // Early Error: It is a Syntax Error if FunctionBodyContainsUseStrict of FunctionBody is true
                // and IsSimpleParameterList of UniqueFormalParameters is false.
                if body.strict() && !params.is_simple() {
                    return Err(Error::lex(LexError::Syntax(
                        "Illegal 'use strict' directive in function with non-simple parameter list"
                            .into(),
                        params_start_position,
                    )));
                }

                // It is a Syntax Error if any element of the BoundNames of FormalParameters also occurs in the
                // LexicallyDeclaredNames of FunctionBody.
                name_in_lexically_declared_names(
                    &bound_names(&params),
                    &lexically_declared_names(&body),
                    params_start_position,
                    interner,
                )?;

                // Early Error: It is a Syntax Error if HasDirectSuper of MethodDefinition is true.
                if has_direct_super_new(&params, &body) {
                    return Err(Error::lex(LexError::Syntax(
                        "invalid super call usage".into(),
                        params_start_position,
                    )));
                }

                Ok(PropertyDefinitionNode::MethodDefinition(
                    ObjectMethodDefinition::new(
                        property_name,
                        params,
                        body,
                        MethodDefinitionKind::Ordinary,
                        start_linear_pos,
                    ),
                ))
            }
        }
    }
}

/// Parses a property name.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-PropertyName
#[derive(Debug, Clone)]
pub(in crate::parser) struct PropertyName {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl PropertyName {
    /// Creates a new `PropertyName` parser.
    pub(in crate::parser) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for PropertyName
where
    R: ReadChar,
{
    type Output = PropertyNameNode;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let token = cursor.peek(0, interner).or_abrupt()?;
        let name: PropertyNameNode = match token.kind() {
            TokenKind::Punctuator(Punctuator::OpenBracket) => {
                cursor.advance(interner);
                let node = AssignmentExpression::new(true, self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?;
                cursor.expect(Punctuator::CloseBracket, "expected token ']'", interner)?;
                return Ok(node.into());
            }
            TokenKind::IdentifierName((name, _)) | TokenKind::StringLiteral((name, _)) => {
                Identifier::new(*name, token.span()).into()
            }
            TokenKind::NumericLiteral(num) => match num {
                Numeric::Rational(num) => {
                    Expression::Literal(Literal::new(*num, token.span())).into()
                }
                Numeric::Integer(num) => {
                    Expression::Literal(Literal::new(*num, token.span())).into()
                }
                Numeric::BigInt(num) => {
                    Expression::Literal(Literal::new(num.clone(), token.span())).into()
                }
            },
            TokenKind::Keyword((word, _)) => {
                let (utf8, utf16) = word.as_str();
                let sym = interner.get_or_intern_static(utf8, utf16);
                Identifier::new(sym, token.span()).into()
            }
            TokenKind::NullLiteral(_) => Identifier::new(Sym::NULL, token.span()).into(),
            TokenKind::BooleanLiteral((bool, _)) => match bool {
                true => Identifier::new(Sym::TRUE, token.span()).into(),
                false => Identifier::new(Sym::FALSE, token.span()).into(),
            },
            _ => {
                return Err(Error::expected(
                    vec!["property name".to_owned()],
                    token.to_string(interner),
                    token.span(),
                    "property name",
                ));
            }
        };
        cursor.advance(interner);
        Ok(name)
    }
}

/// `ClassElementName` can be either a property name or a private identifier.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ClassElementName
#[derive(Debug, Clone)]
pub(in crate::parser) struct ClassElementName {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl ClassElementName {
    /// Creates a new `ClassElementName` parser.
    pub(in crate::parser) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for ClassElementName
where
    R: ReadChar,
{
    type Output = ClassElementNameNode;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let token = cursor.peek(0, interner).or_abrupt()?;
        match token.kind() {
            TokenKind::PrivateIdentifier(ident) => {
                let ident = *ident;
                let span = token.span();
                cursor.advance(interner);
                Ok(ClassElementNameNode::PrivateName(PrivateName::new(
                    ident, span,
                )))
            }
            _ => Ok(ClassElementNameNode::PropertyName(
                PropertyName::new(self.allow_yield, self.allow_await).parse(cursor, interner)?,
            )),
        }
    }
}

/// Initializer parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-Initializer
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct Initializer {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl Initializer {
    /// Creates a new `Initializer` parser.
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

impl<R> TokenParser<R> for Initializer
where
    R: ReadChar,
{
    type Output = Expression;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect(Punctuator::Assign, "initializer", interner)?;
        AssignmentExpression::new(self.allow_in, self.allow_yield, self.allow_await)
            .parse(cursor, interner)
    }
}

/// `GeneratorMethod` parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-GeneratorMethod
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct GeneratorMethod {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl GeneratorMethod {
    /// Creates a new `GeneratorMethod` parser.
    pub(in crate::parser) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for GeneratorMethod
where
    R: ReadChar,
{
    type Output = (ClassElementNameNode, FormalParameterList, FunctionBodyAst);

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect(Punctuator::Mul, "generator method definition", interner)?;

        let class_element_name =
            ClassElementName::new(self.allow_yield, self.allow_await).parse(cursor, interner)?;

        let params_start_position = cursor.peek(0, interner).or_abrupt()?.span().start();

        let params = UniqueFormalParameters::new(true, false).parse(cursor, interner)?;

        // It is a Syntax Error if UniqueFormalParameters Contains YieldExpression is true.
        if contains(&params, ContainsSymbol::YieldExpression) {
            return Err(Error::lex(LexError::Syntax(
                "yield expression not allowed in generator method definition parameters".into(),
                params_start_position,
            )));
        }

        let body = FunctionBody::new(true, false, "generator method definition")
            .parse(cursor, interner)?;

        let body_start = body.span().start();

        // Early Error: It is a Syntax Error if FunctionBodyContainsUseStrict of FunctionBody is true
        // and IsSimpleParameterList of UniqueFormalParameters is false.
        if body.strict() && !params.is_simple() {
            return Err(Error::lex(LexError::Syntax(
                "Illegal 'use strict' directive in function with non-simple parameter list".into(),
                body_start,
            )));
        }

        // Early Error: It is a Syntax Error if any element of the BoundNames of UniqueFormalParameters also
        // occurs in the LexicallyDeclaredNames of GeneratorBody.
        name_in_lexically_declared_names(
            &bound_names(&params),
            &lexically_declared_names(&body),
            params_start_position,
            interner,
        )?;

        // Early Error: It is a Syntax Error if HasDirectSuper of AsyncMethod is true.
        if has_direct_super_new(&params, &body) {
            return Err(Error::lex(LexError::Syntax(
                "invalid super call usage".into(),
                body_start,
            )));
        }

        Ok((class_element_name, params, body))
    }
}

/// `AsyncGeneratorMethod` parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-AsyncGeneratorMethod
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct AsyncGeneratorMethod {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl AsyncGeneratorMethod {
    /// Creates a new `AsyncGeneratorMethod` parser.
    pub(in crate::parser) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for AsyncGeneratorMethod
where
    R: ReadChar,
{
    type Output = (ClassElementNameNode, FormalParameterList, FunctionBodyAst);

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect(
            Punctuator::Mul,
            "async generator method definition",
            interner,
        )?;

        let name =
            ClassElementName::new(self.allow_yield, self.allow_await).parse(cursor, interner)?;

        let params_start_position = cursor.peek(0, interner).or_abrupt()?.span().start();

        let params = UniqueFormalParameters::new(true, true).parse(cursor, interner)?;

        // Early Error: It is a Syntax Error if UniqueFormalParameters Contains YieldExpression is true.
        if contains(&params, ContainsSymbol::YieldExpression) {
            return Err(Error::lex(LexError::Syntax(
                "yield expression not allowed in async generator method definition parameters"
                    .into(),
                params_start_position,
            )));
        }

        // Early Error: It is a Syntax Error if UniqueFormalParameters Contains AwaitExpression is true.
        if contains(&params, ContainsSymbol::AwaitExpression) {
            return Err(Error::lex(LexError::Syntax(
                "await expression not allowed in async generator method definition parameters"
                    .into(),
                params_start_position,
            )));
        }

        let body = FunctionBody::new(true, true, "async generator method definition")
            .parse(cursor, interner)?;

        let body_start = body.span().start();

        // Early Error: It is a Syntax Error if FunctionBodyContainsUseStrict of FunctionBody is true
        // and IsSimpleParameterList of UniqueFormalParameters is false.
        if body.strict() && !params.is_simple() {
            return Err(Error::lex(LexError::Syntax(
                "Illegal 'use strict' directive in function with non-simple parameter list".into(),
                body_start,
            )));
        }

        // Early Error: It is a Syntax Error if any element of the BoundNames of UniqueFormalParameters
        // also occurs in the LexicallyDeclaredNames of AsyncGeneratorBody.
        name_in_lexically_declared_names(
            &bound_names(&params),
            &lexically_declared_names(&body),
            params_start_position,
            interner,
        )?;

        // Early Error: It is a Syntax Error if HasDirectSuper of AsyncMethod is true.
        if has_direct_super_new(&params, &body) {
            return Err(Error::lex(LexError::Syntax(
                "invalid super call usage".into(),
                body_start,
            )));
        }

        Ok((name, params, body))
    }
}

/// `AsyncMethod` parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-AsyncMethod
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct AsyncMethod {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl AsyncMethod {
    /// Creates a new `AsyncMethod` parser.
    pub(in crate::parser) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for AsyncMethod
where
    R: ReadChar,
{
    type Output = (ClassElementNameNode, FormalParameterList, FunctionBodyAst);

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let class_element_name =
            ClassElementName::new(self.allow_yield, self.allow_await).parse(cursor, interner)?;

        let params_start_position = cursor.peek(0, interner).or_abrupt()?.span().start();

        let params = UniqueFormalParameters::new(false, true).parse(cursor, interner)?;

        let body =
            FunctionBody::new(true, true, "async method definition").parse(cursor, interner)?;

        let body_start = body.span().start();

        // Early Error: It is a Syntax Error if FunctionBodyContainsUseStrict of AsyncFunctionBody
        // is true and IsSimpleParameterList of UniqueFormalParameters is false.
        if body.strict() && !params.is_simple() {
            return Err(Error::lex(LexError::Syntax(
                "Illegal 'use strict' directive in function with non-simple parameter list".into(),
                body_start,
            )));
        }

        // Early Error: It is a Syntax Error if any element of the BoundNames of UniqueFormalParameters
        // also occurs in the LexicallyDeclaredNames of AsyncFunctionBody.
        name_in_lexically_declared_names(
            &bound_names(&params),
            &lexically_declared_names(&body),
            params_start_position,
            interner,
        )?;

        // Early Error: It is a Syntax Error if HasDirectSuper of AsyncMethod is true.
        if has_direct_super_new(&params, &body) {
            return Err(Error::lex(LexError::Syntax(
                "invalid super call usage".into(),
                body_start,
            )));
        }

        Ok((class_element_name, params, body))
    }
}

/// `CoverInitializedName` parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-CoverInitializedName
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct CoverInitializedName {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl CoverInitializedName {
    /// Creates a new `CoverInitializedName` parser.
    pub(in crate::parser) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for CoverInitializedName
where
    R: ReadChar,
{
    type Output = PropertyDefinitionNode;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let ident =
            IdentifierReference::new(self.allow_yield, self.allow_await).parse(cursor, interner)?;

        cursor.expect(Punctuator::Assign, "CoverInitializedName", interner)?;

        let expr = AssignmentExpression::new(true, self.allow_yield, self.allow_await)
            .parse(cursor, interner)?;

        Ok(PropertyDefinitionNode::CoverInitializedName(ident, expr))
    }
}
