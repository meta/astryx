//! Expression parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators
//! [spec]: https://tc39.es/ecma262/#sec-ecmascript-language-expressions

mod assignment;
mod fpl_or_exp;
mod identifiers;
mod left_hand_side;
mod primary;
mod unary;
mod update;

pub(in crate::parser) mod await_expr;

#[cfg(test)]
mod tests;

use crate::{
    Error,
    lexer::{InputElement, TokenKind},
    parser::{
        AllowAwait, AllowIn, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::assignment::ExponentiationExpression,
    },
    source::ReadChar,
};
use boa_ast::{
    self as ast, Keyword, Position, Punctuator, Spanned,
    expression::{
        Identifier,
        operator::{
            Binary, BinaryInPrivate,
            binary::{BinaryOp, LogicalOp},
        },
    },
    function::PrivateName,
};
use boa_interner::{Interner, Sym};

pub(super) use self::{assignment::AssignmentExpression, primary::Initializer};
pub(in crate::parser) use {
    fpl_or_exp::FormalParameterListOrExpression,
    identifiers::{BindingIdentifier, LabelIdentifier},
    left_hand_side::LeftHandSideExpression,
    primary::object_initializer::{
        AsyncGeneratorMethod, AsyncMethod, GeneratorMethod, PropertyName,
    },
};

/// Generates an expression parser for a number of expressions whose production rules are of the following pattern.
///
/// ```text
/// <TargetExpression>[allowed_identifiers]
///     => <InnerExpression>[?allowed_identifiers]
///     => <TargetExpression>[?allowed_identifiers] <op1> <InnerExpression>[?allowed_identifiers]
///     => <TargetExpression>[?allowed_identifiers] <op2> <InnerExpression>[?allowed_identifiers]
///     ...
/// ```
///
/// This macro has 2 mandatory identifiers:
///  - The `$name` identifier is the name of the `TargetExpression` struct that the parser will be implemented for.
///  - The `$lower` identifier is the name of the `InnerExpression` struct according to the pattern above.
///
/// A list of punctuators (operands between the `TargetExpression` and `InnerExpression`) are passed as the third parameter.
///
/// The fifth parameter is an `Option<InputElement>` which sets the goal symbol to set before parsing (or None to leave it as is).
macro_rules! expression {
    ($name:ident, $lower:ident, [$( $op:path ),*], [$( $low_param:ident ),*], $goal:expr ) => {
        impl<R> TokenParser<R> for $name
        where
            R: ReadChar
        {
            type Output = FormalParameterListOrExpression;

            fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner)-> ParseResult<Self::Output> {

                if $goal.is_some() {
                    cursor.set_goal($goal.unwrap());
                }

                let lhs = $lower::new($( self.$low_param ),*).parse(cursor, interner)?;
                let FormalParameterListOrExpression::Expression(mut lhs) = lhs else {
                    return Ok(lhs);
                };

                while let Some(tok) = cursor.peek(0, interner)? {
                    match *tok.kind() {
                        TokenKind::Punctuator(op) if $( op == $op )||* => {
                            cursor.advance(interner);
                            lhs = Binary::new(
                                op.as_binary_op().expect("Could not get binary operation."),
                                lhs,
                                $lower::new($( self.$low_param ),*).parse(cursor, interner)?.try_into_expression()?
                            ).into();
                        }
                        _ => break
                    }
                }

                Ok(lhs.into())
            }
        }
    };
}

/// Expression parsing.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators
/// [spec]: https://tc39.es/ecma262/#prod-Expression
#[derive(Debug, Clone, Copy)]
pub(super) struct Expression {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl Expression {
    /// Creates a new `Expression` parser.
    pub(super) fn new<I, Y, A>(allow_in: I, allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for Expression
where
    R: ReadChar,
{
    type Output = ast::Expression;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let mut lhs = AssignmentExpression::new(self.allow_in, self.allow_yield, self.allow_await)
            .parse(cursor, interner)?;
        while let Some(tok) = cursor.peek(0, interner)? {
            match *tok.kind() {
                TokenKind::Punctuator(Punctuator::Comma) => {
                    if cursor.peek(1, interner).or_abrupt()?.kind()
                        == &TokenKind::Punctuator(Punctuator::CloseParen)
                    {
                        return Ok(lhs);
                    }

                    if cursor.peek(1, interner).or_abrupt()?.kind()
                        == &TokenKind::Punctuator(Punctuator::Spread)
                    {
                        return Ok(lhs);
                    }

                    cursor.advance(interner);

                    lhs = Binary::new(
                        Punctuator::Comma
                            .as_binary_op()
                            .expect("Could not get binary operation."),
                        lhs,
                        AssignmentExpression::new(
                            self.allow_in,
                            self.allow_yield,
                            self.allow_await,
                        )
                        .parse(cursor, interner)?,
                    )
                    .into();
                }
                _ => break,
            }
        }

        Ok(lhs)
    }
}

/// Parses a logical expression expression.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_Operators
/// [spec]: https://tc39.es/ecma262/#prod-ShortCircuitExpression
#[derive(Debug, Clone, Copy)]
struct ShortCircuitExpression {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    previous: PreviousExpr,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum PreviousExpr {
    None,
    Logical,
    Coalesce,
}

impl ShortCircuitExpression {
    /// Creates a new `ShortCircuitExpression` parser.
    pub(super) fn new<I, Y, A>(allow_in: I, allow_yield: Y, allow_await: A) -> Self
    where
        I: Into<AllowIn>,
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_in: allow_in.into(),
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            previous: PreviousExpr::None,
        }
    }

    fn with_previous<I, Y, A>(
        allow_in: I,
        allow_yield: Y,
        allow_await: A,
        previous: PreviousExpr,
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
            previous,
        }
    }
}

impl<R> TokenParser<R> for ShortCircuitExpression
where
    R: ReadChar,
{
    type Output = FormalParameterListOrExpression;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let current_node =
            BitwiseORExpression::new(self.allow_in, self.allow_yield, self.allow_await)
                .parse(cursor, interner)?;
        let FormalParameterListOrExpression::Expression(mut current_node) = current_node else {
            return Ok(current_node);
        };

        let mut previous = self.previous;

        while let Some(tok) = cursor.peek(0, interner)? {
            match tok.kind() {
                TokenKind::Punctuator(Punctuator::BoolAnd) => {
                    if previous == PreviousExpr::Coalesce {
                        return Err(Error::expected(
                            ["??".to_owned()],
                            tok.to_string(interner),
                            tok.span(),
                            "logical expression (cannot use '??' without parentheses within '||' or '&&')",
                        ));
                    }
                    cursor.advance(interner);
                    previous = PreviousExpr::Logical;
                    let rhs =
                        BitwiseORExpression::new(self.allow_in, self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?
                            .try_into_expression()?;

                    current_node =
                        Binary::new(BinaryOp::Logical(LogicalOp::And), current_node, rhs).into();
                }
                TokenKind::Punctuator(Punctuator::BoolOr) => {
                    if previous == PreviousExpr::Coalesce {
                        return Err(Error::expected(
                            ["??".to_owned()],
                            tok.to_string(interner),
                            tok.span(),
                            "logical expression (cannot use '??' without parentheses within '||' or '&&')",
                        ));
                    }
                    cursor.advance(interner);
                    previous = PreviousExpr::Logical;
                    let rhs = Self::with_previous(
                        self.allow_in,
                        self.allow_yield,
                        self.allow_await,
                        PreviousExpr::Logical,
                    )
                    .parse(cursor, interner)?
                    .try_into_expression()?;
                    current_node =
                        Binary::new(BinaryOp::Logical(LogicalOp::Or), current_node, rhs).into();
                }
                TokenKind::Punctuator(Punctuator::Coalesce) => {
                    if previous == PreviousExpr::Logical {
                        return Err(Error::expected(
                            ["&&".to_owned(), "||".to_owned()],
                            tok.to_string(interner),
                            tok.span(),
                            "cannot use '??' unparenthesized within '||' or '&&'",
                        ));
                    }
                    cursor.advance(interner);
                    previous = PreviousExpr::Coalesce;
                    let rhs =
                        BitwiseORExpression::new(self.allow_in, self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?
                            .try_into_expression()?;
                    current_node =
                        Binary::new(BinaryOp::Logical(LogicalOp::Coalesce), current_node, rhs)
                            .into();
                }
                _ => break,
            }
        }
        Ok(current_node.into())
    }
}

/// Parses a bitwise `OR` expression.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Bitwise_OR
/// [spec]: https://tc39.es/ecma262/#prod-BitwiseORExpression
#[derive(Debug, Clone, Copy)]
struct BitwiseORExpression {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl BitwiseORExpression {
    /// Creates a new `BitwiseORExpression` parser.
    pub(super) fn new<I, Y, A>(allow_in: I, allow_yield: Y, allow_await: A) -> Self
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

expression!(
    BitwiseORExpression,
    BitwiseXORExpression,
    [Punctuator::Or],
    [allow_in, allow_yield, allow_await],
    None::<InputElement>
);

/// Parses a bitwise `XOR` expression.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Bitwise_XOR
/// [spec]: https://tc39.es/ecma262/#prod-BitwiseXORExpression
#[derive(Debug, Clone, Copy)]
struct BitwiseXORExpression {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl BitwiseXORExpression {
    /// Creates a new `BitwiseXORExpression` parser.
    pub(super) fn new<I, Y, A>(allow_in: I, allow_yield: Y, allow_await: A) -> Self
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

expression!(
    BitwiseXORExpression,
    BitwiseANDExpression,
    [Punctuator::Xor],
    [allow_in, allow_yield, allow_await],
    None::<InputElement>
);

/// Parses a bitwise `AND` expression.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Bitwise_AND
/// [spec]: https://tc39.es/ecma262/#prod-BitwiseANDExpression
#[derive(Debug, Clone, Copy)]
struct BitwiseANDExpression {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl BitwiseANDExpression {
    /// Creates a new `BitwiseANDExpression` parser.
    pub(super) fn new<I, Y, A>(allow_in: I, allow_yield: Y, allow_await: A) -> Self
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

expression!(
    BitwiseANDExpression,
    EqualityExpression,
    [Punctuator::And],
    [allow_in, allow_yield, allow_await],
    None::<InputElement>
);

/// Parses an equality expression.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators#Equality_operators
/// [spec]: https://tc39.es/ecma262/#sec-equality-operators
#[derive(Debug, Clone, Copy)]
struct EqualityExpression {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl EqualityExpression {
    /// Creates a new `EqualityExpression` parser.
    pub(super) fn new<I, Y, A>(allow_in: I, allow_yield: Y, allow_await: A) -> Self
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

expression!(
    EqualityExpression,
    RelationalExpression,
    [
        Punctuator::Eq,
        Punctuator::NotEq,
        Punctuator::StrictEq,
        Punctuator::StrictNotEq
    ],
    [allow_in, allow_yield, allow_await],
    None::<InputElement>
);

/// Parses a relational expression.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators#Relational_operators
/// [spec]: https://tc39.es/ecma262/#sec-relational-operators
#[derive(Debug, Clone, Copy)]
struct RelationalExpression {
    allow_in: AllowIn,
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl RelationalExpression {
    /// Creates a new `RelationalExpression` parser.
    pub(super) fn new<I, Y, A>(allow_in: I, allow_yield: Y, allow_await: A) -> Self
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

impl<R> TokenParser<R> for RelationalExpression
where
    R: ReadChar,
{
    type Output = FormalParameterListOrExpression;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        if self.allow_in.0 {
            let token = cursor.peek(0, interner).or_abrupt()?;
            if let TokenKind::PrivateIdentifier(identifier) = token.kind() {
                let identifier = *identifier;
                let identifier_span = token.span();
                let token = cursor.peek(1, interner).or_abrupt()?;
                match token.kind() {
                    TokenKind::Keyword((Keyword::In, true)) => {
                        return Err(Error::general(
                            "Keyword must not contain escaped characters",
                            token.span().start(),
                        ));
                    }
                    TokenKind::Keyword((Keyword::In, false)) => {
                        cursor.advance(interner);
                        cursor.advance(interner);

                        let rhs = ShiftExpression::new(self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?
                            .try_into_expression()?;

                        return Ok(BinaryInPrivate::new(
                            PrivateName::new(identifier, identifier_span),
                            rhs,
                        )
                        .into());
                    }
                    _ => {}
                }
            }
        }

        let lhs =
            ShiftExpression::new(self.allow_yield, self.allow_await).parse(cursor, interner)?;
        let FormalParameterListOrExpression::Expression(mut lhs) = lhs else {
            return Ok(lhs);
        };

        while let Some(tok) = cursor.peek(0, interner)? {
            match *tok.kind() {
                TokenKind::Punctuator(op)
                    if op == Punctuator::LessThan
                        || op == Punctuator::GreaterThan
                        || op == Punctuator::LessThanOrEq
                        || op == Punctuator::GreaterThanOrEq =>
                {
                    cursor.advance(interner);
                    lhs = Binary::new(
                        op.as_binary_op().expect("Could not get binary operation."),
                        lhs,
                        ShiftExpression::new(self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?
                            .try_into_expression()?,
                    )
                    .into();
                }
                TokenKind::Keyword((Keyword::InstanceOf | Keyword::In, true)) => {
                    return Err(Error::general(
                        "Keyword must not contain escaped characters",
                        tok.span().start(),
                    ));
                }
                TokenKind::Keyword((op, false))
                    if op == Keyword::InstanceOf
                        || (op == Keyword::In && self.allow_in == AllowIn(true)) =>
                {
                    cursor.advance(interner);
                    lhs = Binary::new(
                        op.as_binary_op().expect("Could not get binary operation."),
                        lhs,
                        ShiftExpression::new(self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?
                            .try_into_expression()?,
                    )
                    .into();
                }
                _ => break,
            }
        }

        Ok(lhs.into())
    }
}

/// Parses a bitwise shift expression.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Bitwise_shift_operators
/// [spec]: https://tc39.es/ecma262/#sec-bitwise-shift-operators
#[derive(Debug, Clone, Copy)]
struct ShiftExpression {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl ShiftExpression {
    /// Creates a new `ShiftExpression` parser.
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

expression!(
    ShiftExpression,
    AdditiveExpression,
    [
        Punctuator::LeftSh,
        Punctuator::RightSh,
        Punctuator::URightSh
    ],
    [allow_yield, allow_await],
    None::<InputElement>
);

/// Parses an additive expression.
///
/// This can be either an addition or a subtraction.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators
/// [spec]: https://tc39.es/ecma262/#sec-additive-operators
#[derive(Debug, Clone, Copy)]
struct AdditiveExpression {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl AdditiveExpression {
    /// Creates a new `AdditiveExpression` parser.
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

expression!(
    AdditiveExpression,
    MultiplicativeExpression,
    [Punctuator::Add, Punctuator::Sub],
    [allow_yield, allow_await],
    None::<InputElement>
);

/// Parses a multiplicative expression.
///
/// This can be either a multiplication, division or a modulo (remainder) expression.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Division
/// [spec]: https://tc39.es/ecma262/#sec-multiplicative-operators
#[derive(Debug, Clone, Copy)]
struct MultiplicativeExpression {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl MultiplicativeExpression {
    /// Creates a new `MultiplicativeExpression` parser.
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

expression!(
    MultiplicativeExpression,
    ExponentiationExpression,
    [Punctuator::Mul, Punctuator::Div, Punctuator::Mod],
    [allow_yield, allow_await],
    Some(InputElement::Div)
);

/// Returns an error if `arguments` or `eval` are used as identifier in strict mode.
fn check_strict_arguments_or_eval(ident: Identifier, position: Position) -> ParseResult<()> {
    match ident.sym() {
        Sym::ARGUMENTS => Err(Error::general(
            "unexpected identifier `arguments` in strict mode",
            position,
        )),
        Sym::EVAL => Err(Error::general(
            "unexpected identifier `eval` in strict mode",
            position,
        )),
        _ => Ok(()),
    }
}
