use boa_interner::{Interner, Sym, ToInternedString};
use core::ops::ControlFlow;

use crate::Statement;
use crate::visitor::{VisitWith, Visitor, VisitorMut};

/// The `break` statement terminates the current loop, switch, or label statement and transfers
/// program control to the statement following the terminated statement.
///
/// The break statement includes an optional label that allows the program to break out of a
/// labeled statement. The break statement needs to be nested within the referenced label. The
/// labeled statement can be any block statement; it does not have to be preceded by a loop
/// statement.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-BreakStatement
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/break
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Break {
    label: Option<Sym>,
}

impl Break {
    /// Creates a `Break` AST node.
    #[must_use]
    pub const fn new(label: Option<Sym>) -> Self {
        Self { label }
    }

    /// Gets the label of the break statement, if any.
    #[must_use]
    pub const fn label(&self) -> Option<Sym> {
        self.label
    }
}

impl ToInternedString for Break {
    fn to_interned_string(&self, interner: &Interner) -> String {
        self.label.map_or_else(
            || "break".to_owned(),
            |label| format!("break {}", interner.resolve_expect(label)),
        )
    }
}

impl From<Break> for Statement {
    fn from(break_smt: Break) -> Self {
        Self::Break(break_smt)
    }
}

impl VisitWith for Break {
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
