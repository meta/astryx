use crate::{
    expression::Expression,
    statement::Statement,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, ToIndentedString, ToInternedString};
use core::ops::ControlFlow;

/// The `while` statement creates a loop that executes a specified statement as long as the
/// test condition evaluates to `true`.
///
/// The condition is evaluated before executing the statement.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-grammar-notation-WhileStatement
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/while
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct WhileLoop {
    condition: Expression,
    body: Box<Statement>,
}

impl WhileLoop {
    /// Creates a `WhileLoop` AST node.
    #[inline]
    #[must_use]
    pub fn new(condition: Expression, body: Statement) -> Self {
        Self {
            condition,
            body: body.into(),
        }
    }

    /// Gets the condition of the while loop.
    #[inline]
    #[must_use]
    pub const fn condition(&self) -> &Expression {
        &self.condition
    }

    /// Gets the body of the while loop.
    #[inline]
    #[must_use]
    pub const fn body(&self) -> &Statement {
        &self.body
    }
}

impl ToIndentedString for WhileLoop {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        format!(
            "while ({}) {}",
            self.condition().to_interned_string(interner),
            self.body().to_indented_string(interner, indentation)
        )
    }
}

impl From<WhileLoop> for Statement {
    #[inline]
    fn from(while_loop: WhileLoop) -> Self {
        Self::WhileLoop(while_loop)
    }
}

impl VisitWith for WhileLoop {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_expression(&self.condition)?;
        visitor.visit_statement(&self.body)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_expression_mut(&mut self.condition)?;
        visitor.visit_statement_mut(&mut self.body)
    }
}
