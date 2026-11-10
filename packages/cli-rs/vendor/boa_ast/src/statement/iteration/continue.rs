use crate::statement::Statement;
use crate::visitor::{VisitWith, Visitor, VisitorMut};
use boa_interner::{Interner, Sym, ToInternedString};
use core::ops::ControlFlow;

/// The `continue` statement terminates execution of the statements in the current iteration of
/// the current or labeled loop, and continues execution of the loop with the next iteration.
///
/// The continue statement can include an optional label that allows the program to jump to the
/// next iteration of a labeled loop statement instead of the current loop. In this case, the
/// continue statement needs to be nested within this labeled statement.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-ContinueStatement
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/continue
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Continue {
    label: Option<Sym>,
}

impl Continue {
    /// Creates a `Continue` AST node.
    #[must_use]
    pub const fn new(label: Option<Sym>) -> Self {
        Self { label }
    }

    /// Gets the label of this `Continue` statement.
    #[must_use]
    pub const fn label(&self) -> Option<Sym> {
        self.label
    }
}

impl ToInternedString for Continue {
    fn to_interned_string(&self, interner: &Interner) -> String {
        self.label.map_or_else(
            || "continue".to_owned(),
            |label| format!("continue {}", interner.resolve_expect(label)),
        )
    }
}

impl From<Continue> for Statement {
    fn from(cont: Continue) -> Self {
        Self::Continue(cont)
    }
}

impl VisitWith for Continue {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        if let Some(sym) = &self.label {
            visitor.visit_sym(sym)
        } else {
            ControlFlow::Continue(())
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        if let Some(sym) = &mut self.label {
            visitor.visit_sym_mut(sym)
        } else {
            ControlFlow::Continue(())
        }
    }
}
