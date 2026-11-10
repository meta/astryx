use super::Expression;
use crate::{
    Span, Spanned,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, ToInternedString};
use core::ops::ControlFlow;

/// A parenthesized expression.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-grouping-operator
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Grouping
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Parenthesized {
    pub(crate) expression: Box<Expression>,
    span: Span,
}

impl Parenthesized {
    /// Creates a parenthesized expression.
    #[inline]
    #[must_use]
    pub fn new(expression: Expression, span: Span) -> Self {
        Self {
            expression: Box::new(expression),
            span,
        }
    }

    /// Gets the expression of this parenthesized expression.
    #[inline]
    #[must_use]
    pub const fn expression(&self) -> &Expression {
        &self.expression
    }
}

impl Spanned for Parenthesized {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl From<Parenthesized> for Expression {
    fn from(p: Parenthesized) -> Self {
        Self::Parenthesized(p)
    }
}

impl ToInternedString for Parenthesized {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        format!("({})", self.expression.to_interned_string(interner))
    }
}

impl VisitWith for Parenthesized {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_expression(&self.expression)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_expression_mut(&mut self.expression)
    }
}
