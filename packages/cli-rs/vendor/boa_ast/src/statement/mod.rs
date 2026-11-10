//! The [`Statement`] Parse Node, as defined by the [spec].
//!
//! ECMAScript [statements] are mainly composed of control flow operations, such as [`If`],
//! [`WhileLoop`], and [`Break`]. However, it also contains statements such as [`VarDeclaration`],
//! [`Block`] or [`Expression`] which are not strictly used for control flow.
//!
//! [spec]: https://tc39.es/ecma262/#prod-Statement
//! [statements]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements

mod block;
mod r#if;
mod labelled;
mod r#return;
mod switch;
mod throw;
mod r#try;
mod with;

pub mod iteration;

pub use self::{
    block::Block,
    r#if::If,
    iteration::{Break, Continue, DoWhileLoop, ForInLoop, ForLoop, ForOfLoop, WhileLoop},
    labelled::{Labelled, LabelledItem},
    r#return::Return,
    switch::{Case, Switch},
    throw::Throw,
    r#try::{Catch, ErrorHandler, Finally, Try},
    with::With,
};
use core::ops::ControlFlow;

use crate::visitor::{VisitWith, Visitor, VisitorMut};
use boa_interner::{Interner, ToIndentedString, ToInternedString};

use super::{declaration::VarDeclaration, expression::Expression};

/// The `Statement` Parse Node.
///
/// See the [module level documentation][self] for more information.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub enum Statement {
    /// See [`Block`].
    Block(Block),

    /// See [`VarDeclaration`]
    Var(VarDeclaration),

    /// An empty statement.
    ///
    /// Empty statements do nothing, just return undefined.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-EmptyStatement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/Empty
    Empty,

    /// See [`Expression`].
    Expression(Expression),

    /// See [`If`].
    If(If),

    /// See [`DoWhileLoop`].
    DoWhileLoop(DoWhileLoop),

    /// See [`WhileLoop`].
    WhileLoop(WhileLoop),

    /// See [`ForLoop`].
    ForLoop(ForLoop),

    /// See [`ForInLoop`].
    ForInLoop(ForInLoop),

    /// See [`ForOfLoop`].
    ForOfLoop(ForOfLoop),

    /// See[`Switch`].
    Switch(Switch),

    /// See [`Continue`].
    Continue(Continue),

    /// See [`Break`].
    Break(Break),

    /// See [`Return`].
    Return(Return),

    /// See [`Labelled`].
    Labelled(Labelled),

    /// See [`Throw`].
    Throw(Throw),

    /// See [`Try`].
    Try(Try),

    /// See [`With`].
    With(With),

    /// A `debugger` statement.
    ///
    /// The debugger statement invokes any available debugging functionality.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-debugger-statement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/debugger
    Debugger,
}

impl Statement {
    /// Implements the display formatting with indentation.
    ///
    /// This will not prefix the value with any indentation. If you want to prefix this with proper
    /// indents, use [`to_indented_string()`](Self::to_indented_string).
    pub(super) fn to_no_indent_string(&self, interner: &Interner, indentation: usize) -> String {
        let mut s = match self {
            Self::Block(block) => return block.to_indented_string(interner, indentation),
            Self::Var(var) => var.to_interned_string(interner),
            Self::Empty => return ";".to_owned(),
            Self::Expression(expr) => expr.to_indented_string(interner, indentation),
            Self::If(if_smt) => return if_smt.to_indented_string(interner, indentation),
            Self::DoWhileLoop(do_while) => do_while.to_indented_string(interner, indentation),
            Self::WhileLoop(while_loop) => {
                return while_loop.to_indented_string(interner, indentation);
            }
            Self::ForLoop(for_loop) => return for_loop.to_indented_string(interner, indentation),
            Self::ForInLoop(for_in) => return for_in.to_indented_string(interner, indentation),
            Self::ForOfLoop(for_of) => return for_of.to_indented_string(interner, indentation),
            Self::Switch(switch) => return switch.to_indented_string(interner, indentation),
            Self::Continue(cont) => cont.to_interned_string(interner),
            Self::Break(break_smt) => break_smt.to_interned_string(interner),
            Self::Return(ret) => ret.to_interned_string(interner),
            Self::Labelled(labelled) => return labelled.to_interned_string(interner),
            Self::Throw(throw) => throw.to_interned_string(interner),
            Self::Try(try_catch) => return try_catch.to_indented_string(interner, indentation),
            Self::With(with) => return with.to_interned_string(interner),
            Self::Debugger => "debugger".to_owned(),
        };
        s.push(';');
        s
    }

    /// Abstract operation [`IsLabelledFunction`][spec].
    ///
    /// This recursively checks if this `Statement` is a labelled function, since adding
    /// several labels in a function should not change the return value of the abstract operation:
    ///
    /// ```Javascript
    /// l1: l2: l3: l4: function f(){ }
    /// ```
    ///
    /// This should return `true` for that snippet.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-islabelledfunction
    #[inline]
    #[must_use]
    pub fn is_labelled_function(&self) -> bool {
        match self {
            Self::Labelled(stmt) => match stmt.item() {
                LabelledItem::FunctionDeclaration(_) => true,
                LabelledItem::Statement(stmt) => stmt.is_labelled_function(),
            },
            _ => false,
        }
    }
}

impl ToIndentedString for Statement {
    /// Creates a string of the value of the node with the given indentation. For example, an
    /// indent level of 2 would produce this:
    ///
    /// ```js
    ///         function hello() {
    ///             console.log("hello");
    ///         }
    ///         hello();
    ///         a = 2;
    /// ```
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        let mut buf = match *self {
            Self::Block(_) => String::new(),
            _ => "    ".repeat(indentation),
        };

        buf.push_str(&self.to_no_indent_string(interner, indentation));

        buf
    }
}

impl VisitWith for Statement {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::Block(b) => visitor.visit_block(b),
            Self::Var(v) => visitor.visit_var_declaration(v),
            Self::Empty | Self::Debugger => {
                // do nothing; there is nothing to visit here
                ControlFlow::Continue(())
            }
            Self::Expression(e) => visitor.visit_expression(e),
            Self::If(i) => visitor.visit_if(i),
            Self::DoWhileLoop(dw) => visitor.visit_do_while_loop(dw),
            Self::WhileLoop(w) => visitor.visit_while_loop(w),
            Self::ForLoop(f) => visitor.visit_for_loop(f),
            Self::ForInLoop(fi) => visitor.visit_for_in_loop(fi),
            Self::ForOfLoop(fo) => visitor.visit_for_of_loop(fo),
            Self::Switch(s) => visitor.visit_switch(s),
            Self::Continue(c) => visitor.visit_continue(c),
            Self::Break(b) => visitor.visit_break(b),
            Self::Return(r) => visitor.visit_return(r),
            Self::Labelled(l) => visitor.visit_labelled(l),
            Self::Throw(th) => visitor.visit_throw(th),
            Self::Try(tr) => visitor.visit_try(tr),
            Self::With(with) => visitor.visit_with(with),
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::Block(b) => visitor.visit_block_mut(b),
            Self::Var(v) => visitor.visit_var_declaration_mut(v),
            Self::Empty | Self::Debugger => {
                // do nothing; there is nothing to visit here
                ControlFlow::Continue(())
            }
            Self::Expression(e) => visitor.visit_expression_mut(e),
            Self::If(i) => visitor.visit_if_mut(i),
            Self::DoWhileLoop(dw) => visitor.visit_do_while_loop_mut(dw),
            Self::WhileLoop(w) => visitor.visit_while_loop_mut(w),
            Self::ForLoop(f) => visitor.visit_for_loop_mut(f),
            Self::ForInLoop(fi) => visitor.visit_for_in_loop_mut(fi),
            Self::ForOfLoop(fo) => visitor.visit_for_of_loop_mut(fo),
            Self::Switch(s) => visitor.visit_switch_mut(s),
            Self::Continue(c) => visitor.visit_continue_mut(c),
            Self::Break(b) => visitor.visit_break_mut(b),
            Self::Return(r) => visitor.visit_return_mut(r),
            Self::Labelled(l) => visitor.visit_labelled_mut(l),
            Self::Throw(th) => visitor.visit_throw_mut(th),
            Self::Try(tr) => visitor.visit_try_mut(tr),
            Self::With(with) => visitor.visit_with_mut(with),
        }
    }
}
