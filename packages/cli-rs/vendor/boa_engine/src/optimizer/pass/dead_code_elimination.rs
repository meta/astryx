use crate::optimizer::PassAction;
use boa_ast::{
    Expression,
    expression::literal::LiteralKind,
    statement::{If, Statement},
    visitor::{VisitWith, Visitor},
};
use core::ops::ControlFlow;

#[derive(Debug, Default)]
struct ContainsHoistedDeclarationsVisitor {
    found: bool,
}

impl<'ast> Visitor<'ast> for ContainsHoistedDeclarationsVisitor {
    type BreakTy = ();

    fn visit_var_declaration(
        &mut self,
        _: &'ast boa_ast::declaration::VarDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        self.found = true;
        ControlFlow::Break(())
    }

    fn visit_function_declaration(
        &mut self,
        _: &'ast boa_ast::function::FunctionDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        self.found = true;
        ControlFlow::Break(())
    }

    fn visit_generator_declaration(
        &mut self,
        _: &'ast boa_ast::function::GeneratorDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        self.found = true;
        ControlFlow::Break(())
    }

    fn visit_async_function_declaration(
        &mut self,
        _: &'ast boa_ast::function::AsyncFunctionDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        self.found = true;
        ControlFlow::Break(())
    }

    fn visit_async_generator_declaration(
        &mut self,
        _: &'ast boa_ast::function::AsyncGeneratorDeclaration,
    ) -> ControlFlow<Self::BreakTy> {
        self.found = true;
        ControlFlow::Break(())
    }
}

#[derive(Debug, Default)]
pub(crate) struct DeadCodeElimination;

impl DeadCodeElimination {
    fn as_literal_bool(expr: &Expression) -> Option<bool> {
        if let Expression::Literal(lit) = expr
            && let LiteralKind::Bool(v) = lit.kind()
        {
            return Some(*v);
        }
        None
    }

    fn contains_hoisted_declarations(stmt: &Statement) -> bool {
        let mut visitor = ContainsHoistedDeclarationsVisitor { found: false };
        let _ = stmt.visit_with(&mut visitor);
        visitor.found
    }

    pub(crate) fn try_eliminate_if(if_stmt: &If) -> PassAction<Statement> {
        let Some(cond_value) = Self::as_literal_bool(if_stmt.cond()) else {
            return PassAction::Keep;
        };

        if cond_value {
            if let Some(alt) = if_stmt.else_node()
                && Self::contains_hoisted_declarations(alt)
            {
                return PassAction::Keep;
            }
            PassAction::Replace(if_stmt.body().clone())
        } else {
            if Self::contains_hoisted_declarations(if_stmt.body()) {
                return PassAction::Keep;
            }
            match if_stmt.else_node() {
                Some(alt) => PassAction::Replace(alt.clone()),
                None => PassAction::Replace(Statement::Empty),
            }
        }
    }

    pub(crate) fn try_eliminate_while(
        while_loop: &boa_ast::statement::iteration::WhileLoop,
    ) -> PassAction<Statement> {
        let Some(cond_value) = Self::as_literal_bool(while_loop.condition()) else {
            return PassAction::Keep;
        };

        if !cond_value {
            if Self::contains_hoisted_declarations(while_loop.body()) {
                return PassAction::Keep;
            }
            return PassAction::Replace(Statement::Empty);
        }

        PassAction::Keep
    }

    pub(crate) fn try_eliminate_for(
        for_loop: &boa_ast::statement::iteration::ForLoop,
    ) -> PassAction<Statement> {
        let Some(condition) = for_loop.condition() else {
            return PassAction::Keep;
        };

        let Some(cond_value) = Self::as_literal_bool(condition) else {
            return PassAction::Keep;
        };

        if !cond_value {
            if Self::contains_hoisted_declarations(for_loop.body()) {
                return PassAction::Keep;
            }

            // If there's an initializer, it might have side-effects (e.g., `for (let i = doAuth();;)`).
            // Removing the loop entirely could bypass those side effects. The safest action is to keep the loop.
            if for_loop.init().is_some() {
                return PassAction::Keep;
            }

            return PassAction::Replace(Statement::Empty);
        }

        PassAction::Keep
    }
}
