/// An assignment operator assigns a value to its left operand based on the value of its right operand.
///
/// The simple assignment operator is equal (`=`), which assigns the value of its right operand to its
/// left operand. That is, `x = y` assigns the value of `y to x`.
///
/// There are also compound assignment operators that are shorthand for the operations
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_Operators#Assignment
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AssignOp {
    /// The assignment operator assigns the value of the right operand to the left operand.
    ///
    /// Syntax: `x = y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment
    Assign,

    /// The addition assignment operator adds the value of the right operand to a variable and assigns the result to the variable.
    ///
    /// Syntax: `x += y`
    ///
    /// The types of the two operands determine the behavior of the addition assignment operator. Addition or concatenation is possible.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators#Addition_assignment
    Add,

    /// The subtraction assignment operator subtracts the value of the right operand from a variable and assigns the result to the variable.
    ///
    /// Syntax: `x -= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators#Subtraction_assignment
    Sub,

    /// The multiplication assignment operator multiplies a variable by the value of the right operand and assigns the result to the variable.
    ///
    /// Syntax: `x *= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators#Multiplication_assignment
    Mul,

    /// The division assignment operator divides a variable by the value of the right operand and assigns the result to the variable.
    ///
    /// Syntax: `x /= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators#Division_assignment
    Div,

    /// The remainder assignment operator divides a variable by the value of the right operand and assigns the remainder to the variable.
    ///
    /// Syntax: `x %= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators#Remainder_assignment
    Mod,

    /// The exponentiation assignment operator raises the value of a variable to the power of the right operand.
    ///
    /// Syntax: `x ** y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators#Exponentiation_assignment
    Exp,

    /// The bitwise AND assignment operator uses the binary representation of both operands, does a bitwise AND operation on
    /// them and assigns the result to the variable.
    ///
    /// Syntax: `x &= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators#Bitwise_AND_assignment
    And,

    /// The bitwise OR assignment operator uses the binary representation of both operands, does a bitwise OR operation on
    /// them and assigns the result to the variable.
    ///
    /// Syntax: `x |= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators#Bitwise_OR_assignment
    Or,

    /// The bitwise XOR assignment operator uses the binary representation of both operands, does a bitwise XOR operation on
    /// them and assigns the result to the variable.
    ///
    /// Syntax: `x ^= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators#Bitwise_XOR_assignment
    Xor,

    /// The left shift assignment operator moves the specified amount of bits to the left and assigns the result to the variable.
    ///
    /// Syntax: `x <<= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators#Left_shift_assignment
    Shl,

    /// The right shift assignment operator moves the specified amount of bits to the right and assigns the result to the variable.
    ///
    /// Syntax: `x >>= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators#Right_shift_assignment
    Shr,

    /// The unsigned right shift assignment operator moves the specified amount of bits to the right and assigns the result to the variable.
    ///
    /// Syntax: `x >>>= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentOperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Unsigned_right_shift_assignment
    Ushr,

    /// The logical and assignment operator only assigns if the target variable is truthy.
    ///
    /// Syntax: `x &&= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_AND_assignment
    BoolAnd,

    /// The logical or assignment operator only assigns if the target variable is falsy.
    ///
    /// Syntax: `x ||= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_OR_assignment
    BoolOr,

    /// The logical nullish assignment operator only assigns if the target variable is nullish (null or undefined).
    ///
    /// Syntax: `x ??= y`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AssignmentExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_nullish_assignment
    Coalesce,
}

impl AssignOp {
    /// Retrieves the operation as a static string.
    const fn as_str(self) -> &'static str {
        match self {
            Self::Assign => "=",
            Self::Add => "+=",
            Self::Sub => "-=",
            Self::Mul => "*=",
            Self::Exp => "**=",
            Self::Div => "/=",
            Self::Mod => "%=",
            Self::And => "&=",
            Self::Or => "|=",
            Self::Xor => "^=",
            Self::Shl => "<<=",
            Self::Shr => ">>=",
            Self::Ushr => ">>>=",
            Self::BoolAnd => "&&=",
            Self::BoolOr => "||=",
            Self::Coalesce => "??=",
        }
    }
}

impl std::fmt::Display for AssignOp {
    #[inline]
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
