//! `this` ECMAScript expression.

use crate::{
    Span, Spanned,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, ToInternedString};
use core::ops::ControlFlow;

use super::Expression;

/// ECMAScript's `this` expression AST node.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct This {
    span: Span,
}

impl This {
    /// Creates a new This AST Expression.
    #[inline]
    #[must_use]
    pub const fn new(span: Span) -> Self {
        Self { span }
    }
}

impl Spanned for This {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl From<This> for Expression {
    #[inline]
    fn from(value: This) -> Self {
        Expression::This(value)
    }
}

impl ToInternedString for This {
    #[inline]
    fn to_interned_string(&self, _interner: &Interner) -> String {
        String::from("this")
    }
}

impl VisitWith for This {
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
