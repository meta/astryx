//! Unary expression nodes.
//!
//! A unary expression comprises any operation applied to a single expression. Some examples include:
//!
//! - The [`delete`][del] operator.
//! - The [bitwise NOT][not] operator (`~`).
//!
//! The full list of valid unary operators is defined in [`UnaryOp`].
//!
//! [del]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/delete
//! [not]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_NOT
mod op;

use crate::{
    Span, Spanned,
    expression::Expression,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, ToInternedString};
use core::ops::ControlFlow;

pub use op::*;

/// A unary expression is an operation with only one operand.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-UnaryExpression
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_Operators#Unary_operators
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Unary {
    op: UnaryOp,
    target: Box<Expression>,
    span: Span,
}

impl Unary {
    /// Creates a new `UnaryOp` AST Expression.
    #[inline]
    #[must_use]
    pub fn new(op: UnaryOp, target: Expression, span: Span) -> Self {
        Self {
            op,
            target: Box::new(target),
            span,
        }
    }

    /// Gets the unary operation of the Expression.
    #[inline]
    #[must_use]
    pub const fn op(&self) -> UnaryOp {
        self.op
    }

    /// Gets the target of this unary operator.
    #[inline]
    #[must_use]
    pub fn target(&self) -> &Expression {
        self.target.as_ref()
    }

    /// Gets the target of this unary operator.
    #[inline]
    #[must_use]
    pub fn target_mut(&mut self) -> &mut Expression {
        self.target.as_mut()
    }
}

impl Spanned for Unary {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl ToInternedString for Unary {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        format!("{} {}", self.op, self.target.to_interned_string(interner))
    }
}

impl From<Unary> for Expression {
    #[inline]
    fn from(op: Unary) -> Self {
        Self::Unary(op)
    }
}

impl VisitWith for Unary {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_expression(&self.target)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_expression_mut(&mut self.target)
    }
}
