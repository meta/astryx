//! `target.new` ECMAScript expression.

use crate::{
    Span, Spanned,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, ToInternedString};
use core::ops::ControlFlow;

use super::Expression;

/// ECMAScript's `NewTarget` expression AST node.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NewTarget {
    span: Span,
}

impl NewTarget {
    /// Creates a new [`NewTarget`] AST Expression.
    #[inline]
    #[must_use]
    pub const fn new(span: Span) -> Self {
        Self { span }
    }
}

impl Spanned for NewTarget {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl From<NewTarget> for Expression {
    #[inline]
    fn from(value: NewTarget) -> Self {
        Expression::NewTarget(value)
    }
}

impl ToInternedString for NewTarget {
    #[inline]
    fn to_interned_string(&self, _interner: &Interner) -> String {
        String::from("new.target")
    }
}

impl VisitWith for NewTarget {
    fn visit_with<'a, V>(&'a self, _visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, _visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        ControlFlow::Continue(())
    }
}
