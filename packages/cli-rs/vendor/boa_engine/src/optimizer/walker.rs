use super::PassAction;
use boa_ast::{
    Expression,
    visitor::{VisitWith, VisitorMut},
};
use std::{convert::Infallible, ops::ControlFlow};

/// The utility structure that traverses the AST.
pub(crate) struct Walker<F>
where
    F: FnMut(&mut Expression) -> PassAction<Expression>,
{
    /// The function to be applied to the node.
    f: F,

    /// Did a change happen while traversing.
    changed: bool,
}

impl<F> Walker<F>
where
    F: FnMut(&mut Expression) -> PassAction<Expression>,
{
    pub(crate) const fn new(f: F) -> Self {
        Self { f, changed: false }
    }

    pub(crate) const fn changed(&self) -> bool {
        self.changed
    }

    /// Walk the AST in postorder.
    pub(crate) fn walk_expression_postorder(&mut self, expr: &mut Expression) {
        let _ = self.visit_expression_mut(expr);
    }
}

impl<'ast, F> VisitorMut<'ast> for Walker<F>
where
    F: FnMut(&mut Expression) -> PassAction<Expression>,
{
    type BreakTy = Infallible;

    /// Visits the tree in postorder.
    fn visit_expression_mut(&mut self, expr: &'ast mut Expression) -> ControlFlow<Self::BreakTy> {
        expr.visit_with_mut(self)?;

        match (self.f)(expr) {
            PassAction::Keep => {}
            PassAction::Modified => self.changed = true,
            PassAction::Replace(new) => {
                *expr = new;
                self.changed = true;
            }
        }

        ControlFlow::Continue(())
    }
}
