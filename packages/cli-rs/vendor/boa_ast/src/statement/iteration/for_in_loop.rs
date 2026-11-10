use crate::operations::{ContainsSymbol, contains};
use crate::scope::Scope;
use crate::visitor::{VisitWith, Visitor, VisitorMut};
use crate::{
    expression::Expression,
    statement::{Statement, iteration::IterableLoopInitializer},
};
use boa_interner::{Interner, ToIndentedString, ToInternedString};
use core::ops::ControlFlow;

/// A `for...in` loop statement, as defined by the [spec].
///
/// [`for...in`][forin] statements loop over all enumerable string properties of an object, including
/// inherited properties.
///
/// [forin]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in
/// [spec]: https://tc39.es/ecma262/#prod-ForInOfStatement
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct ForInLoop {
    pub(crate) initializer: IterableLoopInitializer,
    pub(crate) target: Expression,
    pub(crate) body: Box<Statement>,
    pub(crate) target_contains_direct_eval: bool,
    pub(crate) contains_direct_eval: bool,

    #[cfg_attr(feature = "serde", serde(skip))]
    pub(crate) target_scope: Option<Scope>,

    #[cfg_attr(feature = "serde", serde(skip))]
    pub(crate) scope: Option<Scope>,
}

impl ForInLoop {
    /// Creates a new `ForInLoop`.
    #[inline]
    #[must_use]
    pub fn new(initializer: IterableLoopInitializer, target: Expression, body: Statement) -> Self {
        let target_contains_direct_eval = contains(&target, ContainsSymbol::DirectEval);
        let contains_direct_eval = contains(&initializer, ContainsSymbol::DirectEval)
            || contains(&body, ContainsSymbol::DirectEval);
        Self {
            initializer,
            target,
            body: body.into(),
            target_contains_direct_eval,
            contains_direct_eval,
            target_scope: None,
            scope: None,
        }
    }

    /// Gets the initializer of the for...in loop.
    #[inline]
    #[must_use]
    pub const fn initializer(&self) -> &IterableLoopInitializer {
        &self.initializer
    }

    /// Gets the target object of the for...in loop.
    #[inline]
    #[must_use]
    pub const fn target(&self) -> &Expression {
        &self.target
    }

    /// Gets the body of the for...in loop.
    #[inline]
    #[must_use]
    pub const fn body(&self) -> &Statement {
        &self.body
    }

    /// Returns the target scope of the for...in loop.
    #[inline]
    #[must_use]
    pub const fn target_scope(&self) -> Option<&Scope> {
        self.target_scope.as_ref()
    }

    /// Returns the scope of the for...in loop.
    #[inline]
    #[must_use]
    pub const fn scope(&self) -> Option<&Scope> {
        self.scope.as_ref()
    }
}

impl ToIndentedString for ForInLoop {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        let mut buf = format!(
            "for ({} in {}) ",
            self.initializer.to_interned_string(interner),
            self.target.to_interned_string(interner)
        );
        buf.push_str(&self.body().to_indented_string(interner, indentation));

        buf
    }
}

impl From<ForInLoop> for Statement {
    #[inline]
    fn from(for_in: ForInLoop) -> Self {
        Self::ForInLoop(for_in)
    }
}

impl VisitWith for ForInLoop {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_iterable_loop_initializer(&self.initializer)?;
        visitor.visit_expression(&self.target)?;
        visitor.visit_statement(&self.body)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_iterable_loop_initializer_mut(&mut self.initializer)?;
        visitor.visit_expression_mut(&mut self.target)?;
        visitor.visit_statement_mut(&mut self.body)
    }
}
