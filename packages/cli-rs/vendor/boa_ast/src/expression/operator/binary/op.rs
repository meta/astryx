//! This module implements various structure for logic handling.

use std::fmt::{Display, Formatter, Result};

/// This represents a binary operation between two values.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinaryOp {
    /// Numeric operation.
    ///
    /// see: [`NumOp`](enum.NumOp.html)
    Arithmetic(ArithmeticOp),

    /// Bitwise operation.
    ///
    /// see: [`BitOp`](enum.BitOp.html).
    Bitwise(BitwiseOp),

    /// Comparative operation.
    ///
    /// see: [`CompOp`](enum.CompOp.html).
    Relational(RelationalOp),

    /// Logical operation.
    ///
    /// see: [`LogOp`](enum.LogOp.html).
    Logical(LogicalOp),

    /// Comma operation.
    Comma,
}

impl From<ArithmeticOp> for BinaryOp {
    #[inline]
    fn from(op: ArithmeticOp) -> Self {
        Self::Arithmetic(op)
    }
}

impl From<BitwiseOp> for BinaryOp {
    #[inline]
    fn from(op: BitwiseOp) -> Self {
        Self::Bitwise(op)
    }
}

impl From<RelationalOp> for BinaryOp {
    #[inline]
    fn from(op: RelationalOp) -> Self {
        Self::Relational(op)
    }
}

impl From<LogicalOp> for BinaryOp {
    #[inline]
    fn from(op: LogicalOp) -> Self {
        Self::Logical(op)
    }
}

impl BinaryOp {
    /// Retrieves the operation as a static string.
    const fn as_str(self) -> &'static str {
        match self {
            Self::Arithmetic(ref op) => op.as_str(),
            Self::Bitwise(ref op) => op.as_str(),
            Self::Relational(ref op) => op.as_str(),
            Self::Logical(ref op) => op.as_str(),
            Self::Comma => ",",
        }
    }
}

impl Display for BinaryOp {
    #[inline]
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        write!(f, "{}", self.as_str())
    }
}

/// Arithmetic operators take numerical values (either literals or variables)
/// as their operands and return a single numerical value.
///
/// More information:
///  - [MDN documentation][mdn]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_Operators#Arithmetic
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArithmeticOp {
    /// The addition operator produces the sum of numeric operands or string concatenation.
    ///
    /// Syntax: `x + y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec].
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-addition-operator-plus
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Addition
    Add,

    /// The subtraction operator subtracts the two operands, producing their difference.
    ///
    /// Syntax: `x - y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec].
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-subtraction-operator-minus
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Subtraction
    Sub,

    /// The division operator produces the quotient of its operands where the left operand
    /// is the dividend and the right operand is the divisor.
    ///
    /// Syntax: `x / y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-MultiplicativeOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Division
    Div,

    /// The multiplication operator produces the product of the operands.
    ///
    /// Syntax: `x * y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-MultiplicativeExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Multiplication
    Mul,

    /// The exponentiation operator returns the result of raising the first operand to
    /// the power of the second operand.
    ///
    /// Syntax: `x ** y`
    ///
    /// The exponentiation operator is right-associative. a ** b ** c is equal to a ** (b ** c).
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-exp-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Exponentiation
    Exp,

    /// The remainder operator returns the remainder left over when one operand is divided by a second operand.
    ///
    /// Syntax: `x % y`
    ///
    /// The remainder operator always takes the sign of the dividend.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-MultiplicativeOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Remainder
    Mod,
}

impl ArithmeticOp {
    /// Retrieves the operation as a static string.
    const fn as_str(self) -> &'static str {
        match self {
            Self::Add => "+",
            Self::Sub => "-",
            Self::Div => "/",
            Self::Mul => "*",
            Self::Exp => "**",
            Self::Mod => "%",
        }
    }
}

impl Display for ArithmeticOp {
    #[inline]
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        write!(f, "{}", self.as_str())
    }
}

/// A bitwise operator is an operator used to perform bitwise operations
/// on bit patterns or binary numerals that involve the manipulation of individual bits.
///
/// More information:
///  - [MDN documentation][mdn]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_Operators#Bitwise
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BitwiseOp {
    /// Performs the AND operation on each pair of bits. a AND b yields 1 only if both a and b are 1.
    ///
    /// Syntax: `x & y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-BitwiseANDExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Bitwise_AND
    And,

    /// Performs the OR operation on each pair of bits. a OR b yields 1 if either a or b is 1.
    ///
    /// Syntax: `x | y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-BitwiseORExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Bitwise_OR
    Or,

    /// Performs the XOR operation on each pair of bits. a XOR b yields 1 if a and b are different.
    ///
    /// Syntax: `x ^ y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-BitwiseXORExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Bitwise_XOR
    Xor,

    /// This operator shifts the first operand the specified number of bits to the left.
    ///
    /// Syntax: `x << y`
    ///
    /// Excess bits shifted off to the left are discarded. Zero bits are shifted in from the right.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-left-shift-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Left_shift
    Shl,

    /// This operator shifts the first operand the specified number of bits to the right.
    ///
    /// Syntax: `x >> y`
    ///
    /// Excess bits shifted off to the right are discarded. Copies of the leftmost bit
    /// are shifted in from the left. Since the new leftmost bit has the same value as
    /// the previous leftmost bit, the sign bit (the leftmost bit) does not change.
    /// Hence the name "sign-propagating".
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-signed-right-shift-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Right_shift
    Shr,

    /// This operator shifts the first operand the specified number of bits to the right.
    ///
    /// Syntax: `x >>> y`
    ///
    /// Excess bits shifted off to the right are discarded. Zero bits are shifted in
    /// from the left. The sign bit becomes 0, so the result is always non-negative.
    /// Unlike the other bitwise operators, zero-fill right shift returns an unsigned 32-bit integer.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-unsigned-right-shift-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Unsigned_right_shift
    UShr,
}

impl BitwiseOp {
    /// Retrieves the operation as a static string.
    const fn as_str(self) -> &'static str {
        match self {
            Self::And => "&",
            Self::Or => "|",
            Self::Xor => "^",
            Self::Shl => "<<",
            Self::Shr => ">>",
            Self::UShr => ">>>",
        }
    }
}

impl Display for BitwiseOp {
    #[inline]
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        write!(f, "{}", self.as_str())
    }
}

/// A relational operator compares its operands and returns a logical value based on whether the relation is true.
///
/// The operands can be numerical, string, logical, or object values. Strings are compared based on standard
/// lexicographical ordering, using Unicode values. In most cases, if the two operands are not of the same type,
/// JavaScript attempts to convert them to an appropriate type for the comparison. This behavior generally results in
/// comparing the operands numerically. The sole exceptions to type conversion within comparisons involve the `===` and `!==`
/// operators, which perform strict equality and inequality comparisons. These operators do not attempt to convert the operands
/// to compatible types before checking equality.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: tc39.es/ecma262/#sec-testing-and-comparison-operations
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_Operators#Comparison
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RelationalOp {
    /// The equality operator converts the operands if they are not of the same type, then applies
    /// strict comparison.
    ///
    /// Syntax: `y == y`
    ///
    /// If both operands are objects, then JavaScript compares internal references which are equal
    /// when operands refer to the same object in memory.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-abstract-equality-comparison
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators#Equality
    Equal,

    /// The inequality operator returns `true` if the operands are not equal.
    ///
    /// Syntax: `x != y`
    ///
    /// If the two operands are not of the same type, JavaScript attempts to convert the operands
    /// to an appropriate type for the comparison. If both operands are objects, then JavaScript
    /// compares internal references which are not equal when operands refer to different objects
    /// in memory.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-EqualityExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators#Inequality
    NotEqual,

    /// The identity operator returns `true` if the operands are strictly equal **with no type
    /// conversion**.
    ///
    /// Syntax: `x === y`
    ///
    /// Returns `true` if the operands are equal and of the same type.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-strict-equality-comparison
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators#Identity
    StrictEqual,

    /// The non-identity operator returns `true` if the operands **are not equal and/or not of the
    /// same type**.
    ///
    /// Syntax: `x !== y`
    ///
    /// Returns `true` if the operands are of the same type but not equal, or are of different type.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-EqualityExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators#Nonidentity>
    StrictNotEqual,

    /// The greater than operator returns `true` if the left operand is greater than the right
    /// operand.
    ///
    /// Syntax: `x > y`
    ///
    /// Returns `true` if the left operand is greater than the right operand.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-RelationalExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators#Greater_than_operator
    GreaterThan,

    /// The greater than or equal operator returns `true` if the left operand is greater than or
    /// equal to the right operand.
    ///
    /// Syntax: `x >= y`
    ///
    /// Returns `true` if the left operand is greater than the right operand.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-RelationalExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators#Greater_than_operator
    GreaterThanOrEqual,

    /// The less than operator returns `true` if the left operand is less than the right operand.
    ///
    /// Syntax: `x < y`
    ///
    /// Returns `true` if the left operand is less than the right operand.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-RelationalExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators#Less_than_operator
    LessThan,

    /// The less than or equal operator returns `true` if the left operand is less than or equal to
    /// the right operand.
    ///
    /// Syntax: `x <= y`
    ///
    /// Returns `true` if the left operand is less than or equal to the right operand.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-RelationalExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators#Less_than_or_equal_operator
    LessThanOrEqual,

    /// The `in` operator returns `true` if the specified property is in the specified object or
    /// its prototype chain.
    ///
    /// Syntax: `prop in object`
    ///
    /// Returns `true` the specified property is in the specified object or its prototype chain.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-RelationalExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/in
    In,

    /// The `instanceof` operator returns `true` if the specified object is an instance of the
    /// right hand side object.
    ///
    /// Syntax: `obj instanceof Object`
    ///
    /// Returns `true` the `prototype` property of the right hand side constructor appears anywhere
    /// in the prototype chain of the object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-RelationalExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/instanceof
    InstanceOf,
}

impl RelationalOp {
    /// Retrieves the operation as a static string.
    const fn as_str(self) -> &'static str {
        match self {
            Self::Equal => "==",
            Self::NotEqual => "!=",
            Self::StrictEqual => "===",
            Self::StrictNotEqual => "!==",
            Self::GreaterThan => ">",
            Self::GreaterThanOrEqual => ">=",
            Self::LessThan => "<",
            Self::LessThanOrEqual => "<=",
            Self::In => "in",
            Self::InstanceOf => "instanceof",
        }
    }
}

impl Display for RelationalOp {
    #[inline]
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        write!(f, "{}", self.as_str())
    }
}

/// Logical operators are typically used with Boolean (logical) values; when they are, they return a Boolean value.
///
/// However, the `&&` and `||` operators actually return the value of one of the specified operands,
/// so if these operators are used with non-Boolean values, they may return a non-Boolean value.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-binary-logical-operators
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_Operators#Logical
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogicalOp {
    /// The logical AND operator returns the value of the first operand if it can be coerced into `false`;
    /// otherwise, it returns the second operand.
    ///
    /// Syntax: `x && y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-LogicalANDExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_Operators#Logical_AND
    And,

    /// The logical OR operator returns the value the first operand if it can be coerced into `true`;
    /// otherwise, it returns the second operand.
    ///
    /// Syntax: `x || y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-LogicalORExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_Operators#Logical_OR
    Or,

    /// The nullish coalescing operator is a logical operator that returns the second operand
    /// when its first operand is null or undefined, and otherwise returns its first operand.
    ///
    /// Syntax: `x ?? y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-CoalesceExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator
    Coalesce,
}

impl LogicalOp {
    /// Retrieves the operation as a static string.
    const fn as_str(self) -> &'static str {
        match self {
            Self::And => "&&",
            Self::Or => "||",
            Self::Coalesce => "??",
        }
    }
}

impl Display for LogicalOp {
    #[inline]
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        write!(f, "{}", self.as_str())
    }
}
