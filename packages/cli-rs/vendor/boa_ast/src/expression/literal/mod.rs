//! This module contains all literal expressions, which represents the primitive values in ECMAScript.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-primary-expression-literals
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types#Literals

mod array;
mod object;
mod template;

pub use array::ArrayLiteral;
use core::ops::ControlFlow;
pub use object::{ObjectLiteral, ObjectMethodDefinition, PropertyDefinition};
pub use template::{TemplateElement, TemplateLiteral};

use crate::{
    LinearSpan, LinearSpanIgnoreEq, Span, Spanned,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, Sym, ToInternedString};
use num_bigint::BigInt;

use super::Expression;

/// Literals represent values in ECMAScript.
///
/// These are fixed values **not variables** that you literally provide in your script.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-primary-expression-literals
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types#Literals
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Debug, Clone, PartialEq)]
pub struct Literal {
    kind: LiteralKind,
    span: Span,
    linear_span: LinearSpanIgnoreEq,
}

impl Literal {
    /// Create a new [`Literal`].
    #[inline]
    #[must_use]
    pub fn new<T: Into<LiteralKind>>(kind: T, span: Span) -> Self {
        Self {
            kind: kind.into(),
            span,
            linear_span: LinearSpanIgnoreEq(LinearSpan::default()),
        }
    }

    /// Create a new [`Literal`] with a [`LinearSpan`] for source text tracking.
    #[inline]
    #[must_use]
    pub fn with_linear_span<T: Into<LiteralKind>>(
        kind: T,
        span: Span,
        linear_span: LinearSpan,
    ) -> Self {
        Self {
            kind: kind.into(),
            span,
            linear_span: LinearSpanIgnoreEq(linear_span),
        }
    }

    /// Get reference to the [`LiteralKind`] of [`Literal`].
    #[inline]
    #[must_use]
    pub const fn kind(&self) -> &LiteralKind {
        &self.kind
    }

    /// Get mutable reference to the [`LiteralKind`] of [`Literal`].
    #[inline]
    #[must_use]
    pub const fn kind_mut(&mut self) -> &mut LiteralKind {
        &mut self.kind
    }

    /// Get the [`LinearSpan`] of this literal in the source text.
    #[inline]
    #[must_use]
    pub const fn linear_span(&self) -> LinearSpan {
        self.linear_span.0
    }

    /// Get position of the node.
    #[inline]
    #[must_use]
    pub const fn as_string(&self) -> Option<Sym> {
        if let LiteralKind::String(sym) = self.kind() {
            return Some(*sym);
        }
        None
    }

    /// Check if [`Literal`] is a [`LiteralKind::Undefined`].
    #[inline]
    #[must_use]
    pub const fn is_undefined(&self) -> bool {
        matches!(self.kind(), LiteralKind::Undefined)
    }
}

impl Spanned for Literal {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl From<Literal> for Expression {
    #[inline]
    fn from(lit: Literal) -> Self {
        Self::Literal(lit)
    }
}

impl ToInternedString for Literal {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        self.kind().to_interned_string(interner)
    }
}

impl VisitWith for Literal {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        if let LiteralKind::String(sym) = &self.kind {
            visitor.visit_sym(sym)
        } else {
            ControlFlow::Continue(())
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        if let LiteralKind::String(sym) = &mut self.kind {
            visitor.visit_sym_mut(sym)
        } else {
            ControlFlow::Continue(())
        }
    }
}

/// Literals represent values in ECMAScript.
///
/// These are fixed values **not variables** that you literally provide in your script.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-primary-expression-literals
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types#Literals
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug, PartialEq)]
pub enum LiteralKind {
    /// A string literal is zero or more characters enclosed in double (`"`) or single (`'`) quotation marks.
    ///
    /// A string must be delimited by quotation marks of the same type (that is, either both single quotation marks, or both double quotation marks).
    /// You can call any of the String object's methods on a string literal value.
    /// ECMAScript automatically converts the string literal to a temporary String object,
    /// calls the method, then discards the temporary String object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-terms-and-definitions-string-value
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types#String_literals
    String(Sym),

    /// A floating-point number literal.
    ///
    /// The exponent part is an "`e`" or "`E`" followed by an integer, which can be signed (preceded by "`+`" or "`-`").
    /// A floating-point literal must have at least one digit, and either a decimal point or "`e`" (or "`E`").
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-terms-and-definitions-number-value
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types#Floating-point_literals
    Num(f64),

    /// Integer types can be expressed in decimal (base 10), hexadecimal (base 16), octal (base 8) and binary (base 2).
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-terms-and-definitions-number-value
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types#Numeric_literals
    Int(i32),

    /// `BigInt` provides a way to represent whole numbers larger than the largest number ECMAScript
    /// can reliably represent with the `Number` primitive.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-terms-and-definitions-bigint-value
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types#Numeric_literals
    BigInt(Box<BigInt>),

    /// The Boolean type has two literal values: `true` and `false`.
    ///
    /// The Boolean object is a wrapper around the primitive Boolean data type.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-terms-and-definitions-boolean-value
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types#Boolean_literals
    Bool(bool),

    /// In JavaScript, `null` is marked as one of the primitive values, cause it's behaviour is seemingly primitive.
    ///
    /// In computer science, a null value represents a reference that points,
    /// generally intentionally, to a nonexistent or invalid object or address.
    /// The meaning of a null reference varies among language implementations.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-null-value
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Glossary/null
    Null,

    /// This represents the JavaScript `undefined` value, it does not reference the `undefined` global variable,
    /// it will directly evaluate to `undefined`.
    ///
    /// NOTE: This is used for optimizations.
    Undefined,
}

/// Manual implementation, because `Undefined` is never constructed during parsing.
#[cfg(feature = "arbitrary")]
impl<'a> arbitrary::Arbitrary<'a> for LiteralKind {
    fn arbitrary(u: &mut arbitrary::Unstructured<'a>) -> arbitrary::Result<Self> {
        let c = <u8 as arbitrary::Arbitrary<'a>>::arbitrary(u)? % 6;
        match c {
            0 => Ok(Self::String(<Sym as arbitrary::Arbitrary>::arbitrary(u)?)),
            1 => Ok(Self::Num(<f64 as arbitrary::Arbitrary>::arbitrary(u)?)),
            2 => Ok(Self::Int(<i32 as arbitrary::Arbitrary>::arbitrary(u)?)),
            3 => Ok(Self::BigInt(Box::new(
                <BigInt as arbitrary::Arbitrary>::arbitrary(u)?,
            ))),
            4 => Ok(Self::Bool(<bool as arbitrary::Arbitrary>::arbitrary(u)?)),
            5 => Ok(Self::Null),
            _ => unreachable!(),
        }
    }
}

impl From<Sym> for LiteralKind {
    #[inline]
    fn from(string: Sym) -> Self {
        Self::String(string)
    }
}

impl From<f64> for LiteralKind {
    #[inline]
    fn from(num: f64) -> Self {
        Self::Num(num)
    }
}

impl From<i32> for LiteralKind {
    #[inline]
    fn from(i: i32) -> Self {
        Self::Int(i)
    }
}

impl From<BigInt> for LiteralKind {
    #[inline]
    fn from(i: BigInt) -> Self {
        Self::BigInt(Box::new(i))
    }
}

impl From<Box<BigInt>> for LiteralKind {
    #[inline]
    fn from(i: Box<BigInt>) -> Self {
        Self::BigInt(i)
    }
}

impl From<bool> for LiteralKind {
    #[inline]
    fn from(b: bool) -> Self {
        Self::Bool(b)
    }
}

impl ToInternedString for LiteralKind {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        match *self {
            Self::String(st) => {
                format!("\"{}\"", interner.resolve_expect(st))
            }
            Self::Num(num) => num.to_string(),
            Self::Int(num) => num.to_string(),
            Self::BigInt(ref num) => format!("{num}n"),
            Self::Bool(v) => v.to_string(),
            Self::Null => "null".to_owned(),
            Self::Undefined => "undefined".to_owned(),
        }
    }
}
