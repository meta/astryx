/// A update operator is one that takes a single operand/argument and performs an operation.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-UpdateExpression
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators#increment_and_decrement
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpdateOp {
    /// The increment operator increments (adds one to) its operand and returns a value.
    ///
    /// Syntax: `x++`
    ///
    /// This operator increments and returns the value after incrementing.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-postfix-increment-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Increment
    IncrementPost,

    /// The increment operator increments (adds one to) its operand and returns a value.
    ///
    /// Syntax: `++x`
    ///
    /// This operator increments and returns the value before incrementing.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-prefix-increment-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Increment
    IncrementPre,

    /// The decrement operator decrements (subtracts one from) its operand and returns a value.
    ///
    /// Syntax: `x--`
    ///
    /// This operator decrements and returns the value before decrementing.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-postfix-decrement-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Decrement
    DecrementPost,

    /// The decrement operator decrements (subtracts one from) its operand and returns a value.
    ///
    /// Syntax: `--x`
    ///
    /// This operator decrements the operand and returns the value after decrementing.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-prefix-decrement-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Decrement
    DecrementPre,
}

impl UpdateOp {
    /// Retrieves the operation as a static string.
    const fn as_str(self) -> &'static str {
        match self {
            Self::IncrementPost | Self::IncrementPre => "++",
            Self::DecrementPost | Self::DecrementPre => "--",
        }
    }
}

impl std::fmt::Display for UpdateOp {
    #[inline]
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
