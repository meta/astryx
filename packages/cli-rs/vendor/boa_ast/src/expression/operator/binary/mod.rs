//! Binary expression nodes.
//!
//! A Binary expression comprises any operation between two expressions (excluding assignments),
//! such as:
//! - [Logic operations][logic] (`||`, `&&`).
//! - [Relational math][relat] (`==`, `<`).
//! - [Bit manipulation][bit] (`^`, `|`).
//! - [Arithmetic][arith] (`+`, `%`).
//! - The [comma operator][comma] (`,`)
//!
//! [logic]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators#binary_logical_operators
//! [relat]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators#relational_operators
//! [bit]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators#binary_bitwise_operators
//! [arith]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators#arithmetic_operators
//! [comma]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comma_Operator

mod op;

use crate::{
    Span, Spanned,
    expression::Expression,
    function::PrivateName,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, ToInternedString};
use core::ops::ControlFlow;

pub use op::*;

/// Binary operations require two operands, one before the operator and one after the operator.
///
/// See the [module level documentation][self] for more information.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Binary {
    op: BinaryOp,
    lhs: Box<Expression>,
    rhs: Box<Expression>,
}

impl Binary {
    /// Creates a `BinOp` AST Expression.
    #[inline]
    #[must_use]
    pub fn new(op: BinaryOp, lhs: Expression, rhs: Expression) -> Self {
        Self {
            op,
            lhs: Box::new(lhs),
            rhs: Box::new(rhs),
        }
    }

    /// Gets the binary operation of the Expression.
    #[inline]
    #[must_use]
    pub const fn op(&self) -> BinaryOp {
        self.op
    }

    /// Gets the left hand side of the binary operation.
    #[inline]
    #[must_use]
    pub const fn lhs(&self) -> &Expression {
        &self.lhs
    }

    /// Gets the right hand side of the binary operation.
    #[inline]
    #[must_use]
    pub const fn rhs(&self) -> &Expression {
        &self.rhs
    }

    /// Gets the left hand side of the binary operation.
    #[inline]
    #[must_use]
    pub fn lhs_mut(&mut self) -> &mut Expression {
        &mut self.lhs
    }

    /// Gets the right hand side of the binary operation.
    #[inline]
    #[must_use]
    pub fn rhs_mut(&mut self) -> &mut Expression {
        &mut self.rhs
    }
}

impl Spanned for Binary {
    #[inline]
    fn span(&self) -> Span {
        Span::new(self.lhs.span().start(), self.rhs.span().end())
    }
}

impl ToInternedString for Binary {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        format!(
            "{} {} {}",
            self.lhs.to_interned_string(interner),
            self.op,
            self.rhs.to_interned_string(interner)
        )
    }
}

impl From<Binary> for Expression {
    #[inline]
    fn from(op: Binary) -> Self {
        Self::Binary(op)
    }
}

impl VisitWith for Binary {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_expression(&self.lhs)?;
        visitor.visit_expression(&self.rhs)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_expression_mut(&mut self.lhs)?;
        visitor.visit_expression_mut(&mut self.rhs)
    }
}

/// Binary [relational][relat] `In` expression with a private name on the left hand side.
///
/// Because the left hand side must be a private name, this is a separate type from [`Binary`].
///
/// [relat]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators#relational_operators
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct BinaryInPrivate {
    lhs: PrivateName,
    rhs: Box<Expression>,
}

impl BinaryInPrivate {
    /// Creates a `BinaryInPrivate` AST Expression.
    #[inline]
    #[must_use]
    pub fn new(lhs: PrivateName, rhs: Expression) -> Self {
        Self {
            lhs,
            rhs: Box::new(rhs),
        }
    }

    /// Gets the left hand side of the binary operation.
    #[inline]
    #[must_use]
    pub const fn lhs(&self) -> &PrivateName {
        &self.lhs
    }

    /// Gets the right hand side of the binary operation.
    #[inline]
    #[must_use]
    pub const fn rhs(&self) -> &Expression {
        &self.rhs
    }
}

impl Spanned for BinaryInPrivate {
    #[inline]
    fn span(&self) -> Span {
        Span::new(self.lhs.span().start(), self.rhs.span().end())
    }
}

impl ToInternedString for BinaryInPrivate {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        format!(
            "#{} in {}",
            interner.resolve_expect(self.lhs.description()),
            self.rhs.to_interned_string(interner)
        )
    }
}

impl From<BinaryInPrivate> for Expression {
    #[inline]
    fn from(op: BinaryInPrivate) -> Self {
        Self::BinaryInPrivate(op)
    }
}

impl VisitWith for BinaryInPrivate {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_private_name(&self.lhs)?;
        visitor.visit_expression(&self.rhs)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_private_name_mut(&mut self.lhs)?;
        visitor.visit_expression_mut(&mut self.rhs)
    }
}
