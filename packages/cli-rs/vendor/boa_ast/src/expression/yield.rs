use boa_interner::{Interner, ToInternedString};
use core::ops::ControlFlow;

use crate::{
    Span, Spanned,
    visitor::{VisitWith, Visitor, VisitorMut},
};

use super::Expression;

/// The `yield` keyword is used to pause and resume a generator function
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-YieldExpression
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/yield
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Yield {
    target: Option<Box<Expression>>,
    delegate: bool,
    span: Span,
}

impl Yield {
    /// Creates a [`Yield`] AST Expression.
    #[inline]
    #[must_use]
    pub fn new(expr: Option<Expression>, delegate: bool, span: Span) -> Self {
        Self {
            target: expr.map(Box::new),
            delegate,
            span,
        }
    }

    /// Gets the target expression of this `Yield` statement.
    #[inline]
    pub fn target(&self) -> Option<&Expression> {
        self.target.as_ref().map(Box::as_ref)
    }

    /// Returns `true` if this `Yield` statement delegates to another generator or iterable object.
    #[inline]
    #[must_use]
    pub const fn delegate(&self) -> bool {
        self.delegate
    }
}

impl Spanned for Yield {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl From<Yield> for Expression {
    #[inline]
    fn from(r#yield: Yield) -> Self {
        Self::Yield(r#yield)
    }
}

impl ToInternedString for Yield {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        let y = if self.delegate { "yield*" } else { "yield" };
        if let Some(ex) = self.target() {
            format!("{y} {}", ex.to_interned_string(interner))
        } else {
            y.to_owned()
        }
    }
}

impl VisitWith for Yield {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        if let Some(expr) = &self.target {
            visitor.visit_expression(expr)
        } else {
            ControlFlow::Continue(())
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        if let Some(expr) = &mut self.target {
            visitor.visit_expression_mut(expr)
        } else {
            ControlFlow::Continue(())
        }
    }
}
