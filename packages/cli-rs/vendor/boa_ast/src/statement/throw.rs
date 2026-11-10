use crate::{
    Expression,
    statement::Statement,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, ToInternedString};
use core::ops::ControlFlow;

/// The `throw` statement throws a user-defined exception.
///
/// Syntax: `throw expression;`
///
/// Execution of the current function will stop (the statements after throw won't be executed),
/// and control will be passed to the first catch block in the call stack. If no catch block
/// exists among caller functions, the program will terminate.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-ThrowStatement
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/throw
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Throw {
    target: Expression,
}

impl Throw {
    /// Gets the target expression of this `Throw` statement.
    #[must_use]
    pub const fn target(&self) -> &Expression {
        &self.target
    }

    /// Creates a `Throw` AST node.
    #[must_use]
    pub const fn new(target: Expression) -> Self {
        Self { target }
    }
}

impl ToInternedString for Throw {
    fn to_interned_string(&self, interner: &Interner) -> String {
        format!("throw {}", self.target.to_interned_string(interner))
    }
}

impl From<Throw> for Statement {
    fn from(trw: Throw) -> Self {
        Self::Throw(trw)
    }
}

impl VisitWith for Throw {
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
