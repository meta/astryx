/// A unary operator is one that takes a single operand/argument and performs an operation.
///
/// A unary operation is an operation with only one operand. This operand comes either
/// before or after the operator. Unary operators are more efficient than standard JavaScript
/// function calls.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-UnaryExpression
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_Operators#Unary
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UnaryOp {
    /// The unary negation operator precedes its operand and negates it.
    ///
    /// Syntax: `-x`
    ///
    /// Converts non-numbers data types to numbers like unary plus,
    /// however, it performs an additional operation, negation.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-unary-minus-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Unary_negation
    Minus,

    /// The unary plus operator attempts to convert the operand into a number, if it isn't already.
    ///
    /// Syntax: `+x`
    ///
    /// Although unary negation (`-`) also can convert non-numbers, unary plus is the fastest and preferred
    /// way of converting something into a number, because it does not perform any other operations on the number.
    /// It can convert `string` representations of integers and floats, as well as the non-string values `true`, `false`, and `null`.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-unary-plus-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Arithmetic_Operators#Unary_plus
    Plus,

    /// Returns `false` if its single operand can be converted to `true`; otherwise, returns `true`.
    ///
    /// Syntax: `!x`
    ///
    /// Boolean values simply get inverted: `!true === false` and `!false === true`.
    /// Non-boolean values get converted to boolean values first, then are negated.
    /// This means that it is possible to use a couple of NOT operators in series to explicitly
    /// force the conversion of any value to the corresponding boolean primitive.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-logical-not-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_Operators#Logical_NOT
    Not,

    /// Performs the NOT operator on each bit.
    ///
    /// Syntax: `~x`
    ///
    /// NOT `a` yields the inverted value (or one's complement) of `a`.
    /// Bitwise `NOT`ing any number x yields -(x + 1). For example, ~-5 yields 4.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-bitwise-not-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Bitwise_NOT
    Tilde,

    /// The `typeof` operator returns a string indicating the type of the unevaluated operand.
    ///
    /// Syntax: `typeof x` or `typeof(x)`
    ///
    /// The `typeof` is a JavaScript keyword that will return the type of a variable when you call it.
    /// You can use this to validate function parameters or check if variables are defined.
    /// There are other uses as well.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-typeof-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
    TypeOf,

    /// The JavaScript `delete` operator removes a property from an object.
    ///
    /// Syntax: `delete x`
    ///
    /// Unlike what common belief suggests, the delete operator has nothing to do with
    /// directly freeing memory. Memory management is done indirectly via breaking references.
    /// If no more references to the same property are held, it is eventually released automatically.
    ///
    /// The `delete` operator returns `true` for all cases except when the property is an
    /// [own](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwnProperty)
    /// [non-configurable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cant_delete)
    /// property, in which case, `false` is returned in non-strict mode.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-delete-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/delete
    Delete,

    /// The `void` operator evaluates the given `expression` and then returns `undefined`.
    ///
    /// Syntax: `void x`
    ///
    /// This operator allows evaluating expressions that produce a value into places where an
    /// expression that evaluates to `undefined` is desired.
    /// The `void` operator is often used merely to obtain the `undefined` primitive value, usually using `void(0)`
    /// (which is equivalent to `void 0`). In these cases, the global variable undefined can be used.
    ///
    /// When using an [immediately-invoked function expression](https://developer.mozilla.org/en-US/docs/Glossary/IIFE),
    /// `void` can be used to force the function keyword to be treated as an expression instead of a declaration.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-void-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/void
    Void,
}

impl UnaryOp {
    /// Retrieves the operation as a static string.
    const fn as_str(self) -> &'static str {
        match self {
            Self::Plus => "+",
            Self::Minus => "-",
            Self::Not => "!",
            Self::Tilde => "~",
            Self::Delete => "delete",
            Self::TypeOf => "typeof",
            Self::Void => "void",
        }
    }
}

impl std::fmt::Display for UnaryOp {
    #[inline]
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
