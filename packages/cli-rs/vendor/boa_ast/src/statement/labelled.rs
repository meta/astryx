use crate::{
    Statement,
    function::FunctionDeclaration,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, Sym, ToIndentedString, ToInternedString};
use core::ops::ControlFlow;

/// The set of Parse Nodes that can be preceded by a label, as defined by the [spec].
///
/// Semantically, a [`Labelled`] statement should only wrap [`Statement`] nodes. However,
/// old ECMAScript implementations supported [labelled function declarations][label-fn] as an extension
/// of the grammar. In the ECMAScript 2015 spec, the production of `LabelledStatement` was
/// modified to include labelled [`FunctionDeclaration`]s as a valid node.
///
/// [spec]: https://tc39.es/ecma262/#prod-LabelledItem
/// [label-fn]: https://tc39.es/ecma262/#sec-labelled-function-declarations
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
#[allow(clippy::large_enum_variant)]
pub enum LabelledItem {
    /// A labelled [`FunctionDeclaration`].
    FunctionDeclaration(FunctionDeclaration),

    /// A labelled [`Statement`].
    Statement(Statement),
}

impl LabelledItem {
    pub(crate) fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        match self {
            Self::FunctionDeclaration(f) => f.to_indented_string(interner, indentation),
            Self::Statement(stmt) => stmt.to_indented_string(interner, indentation),
        }
    }
}

impl ToInternedString for LabelledItem {
    fn to_interned_string(&self, interner: &Interner) -> String {
        self.to_indented_string(interner, 0)
    }
}

impl From<FunctionDeclaration> for LabelledItem {
    fn from(f: FunctionDeclaration) -> Self {
        Self::FunctionDeclaration(f)
    }
}

impl From<Statement> for LabelledItem {
    fn from(stmt: Statement) -> Self {
        Self::Statement(stmt)
    }
}

impl VisitWith for LabelledItem {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::FunctionDeclaration(f) => visitor.visit_function_declaration(f),
            Self::Statement(s) => visitor.visit_statement(s),
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::FunctionDeclaration(f) => visitor.visit_function_declaration_mut(f),
            Self::Statement(s) => visitor.visit_statement_mut(s),
        }
    }
}

/// Labelled statement nodes, as defined by the [spec].
///
/// The method [`Labelled::item`] doesn't return a [`Statement`] for compatibility reasons.
/// See [`LabelledItem`] for more information.
///
/// [spec]: https://tc39.es/ecma262/#sec-labelled-statements
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Labelled {
    item: Box<LabelledItem>,
    label: Sym,
}

impl Labelled {
    /// Creates a new `Labelled` statement.
    #[inline]
    #[must_use]
    pub fn new(item: LabelledItem, label: Sym) -> Self {
        Self {
            item: Box::new(item),
            label,
        }
    }

    /// Gets the labelled item.
    #[inline]
    #[must_use]
    pub const fn item(&self) -> &LabelledItem {
        &self.item
    }

    /// Gets the label name.
    #[inline]
    #[must_use]
    pub const fn label(&self) -> Sym {
        self.label
    }

    pub(crate) fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        format!(
            "{}: {}",
            interner.resolve_expect(self.label),
            self.item.to_indented_string(interner, indentation)
        )
    }
}

impl ToInternedString for Labelled {
    fn to_interned_string(&self, interner: &Interner) -> String {
        self.to_indented_string(interner, 0)
    }
}

impl From<Labelled> for Statement {
    fn from(labelled: Labelled) -> Self {
        Self::Labelled(labelled)
    }
}

impl VisitWith for Labelled {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_labelled_item(&self.item)?;
        visitor.visit_sym(&self.label)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_labelled_item_mut(&mut self.item)?;
        visitor.visit_sym_mut(&mut self.label)
    }
}
