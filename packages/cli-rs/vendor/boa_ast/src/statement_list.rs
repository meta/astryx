//! Statement list node.

use super::Declaration;
use crate::{
    LinearPosition,
    statement::Statement,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, ToIndentedString};
use core::ops::ControlFlow;
use std::ops::Deref;

/// An item inside a [`StatementList`] Parse Node, as defined by the [spec].
///
/// Items in a `StatementList` can be either [`Declaration`]s (functions, classes, let/const declarations)
/// or [`Statement`]s (if, while, var statement).
///
/// [spec]: https://tc39.es/ecma262/#prod-StatementListItem
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub enum StatementListItem {
    /// See [`Statement`].
    Statement(Box<Statement>),
    /// See [`Declaration`].
    Declaration(Box<Declaration>),
}

impl ToIndentedString for StatementListItem {
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
        let mut buf = "    ".repeat(indentation);

        match self {
            Self::Statement(stmt) => {
                buf.push_str(&stmt.to_no_indent_string(interner, indentation));
            }
            Self::Declaration(decl) => {
                buf.push_str(&decl.to_indented_string(interner, indentation));
            }
        }

        buf
    }
}

impl From<Statement> for StatementListItem {
    #[inline]
    fn from(stmt: Statement) -> Self {
        Self::Statement(Box::new(stmt))
    }
}

impl From<Declaration> for StatementListItem {
    #[inline]
    fn from(decl: Declaration) -> Self {
        Self::Declaration(Box::new(decl))
    }
}

impl VisitWith for StatementListItem {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::Statement(statement) => visitor.visit_statement(statement),
            Self::Declaration(declaration) => visitor.visit_declaration(declaration),
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::Statement(statement) => visitor.visit_statement_mut(statement),
            Self::Declaration(declaration) => visitor.visit_declaration_mut(declaration),
        }
    }
}

/// List of statements.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-StatementList
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug, Default)]
pub struct StatementList {
    pub(crate) statements: Box<[StatementListItem]>,
    linear_pos_end: LinearPosition,
    strict: bool,
}

impl PartialEq for StatementList {
    fn eq(&self, other: &Self) -> bool {
        self.statements == other.statements && self.strict == other.strict
    }
}

impl StatementList {
    /// Creates a new `StatementList` AST node.
    #[must_use]
    pub fn new<S>(statements: S, linear_pos_end: LinearPosition, strict: bool) -> Self
    where
        S: Into<Box<[StatementListItem]>>,
    {
        Self {
            statements: statements.into(),
            linear_pos_end,
            strict,
        }
    }

    /// Gets the list of statements.
    #[inline]
    #[must_use]
    pub const fn statements(&self) -> &[StatementListItem] {
        &self.statements
    }

    /// Get the strict mode.
    #[inline]
    #[must_use]
    pub const fn strict(&self) -> bool {
        self.strict
    }

    /// Get end of linear position in source code.
    #[inline]
    #[must_use]
    pub const fn linear_pos_end(&self) -> LinearPosition {
        self.linear_pos_end
    }
}

impl From<(Box<[StatementListItem]>, LinearPosition)> for StatementList {
    #[inline]
    fn from(value: (Box<[StatementListItem]>, LinearPosition)) -> Self {
        Self {
            statements: value.0,
            linear_pos_end: value.1,
            strict: false,
        }
    }
}

impl From<(Vec<StatementListItem>, LinearPosition)> for StatementList {
    #[inline]
    fn from(value: (Vec<StatementListItem>, LinearPosition)) -> Self {
        Self {
            statements: value.0.into(),
            linear_pos_end: value.1,
            strict: false,
        }
    }
}

impl Deref for StatementList {
    type Target = [StatementListItem];

    fn deref(&self) -> &Self::Target {
        &self.statements
    }
}

impl ToIndentedString for StatementList {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        let mut buf = String::new();
        // Print statements
        for item in &*self.statements {
            // We rely on the node to add the correct indent.
            buf.push_str(&item.to_indented_string(interner, indentation));

            buf.push('\n');
        }
        buf
    }
}

impl VisitWith for StatementList {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        for statement in &*self.statements {
            visitor.visit_statement_list_item(statement)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        for statement in &mut *self.statements {
            visitor.visit_statement_list_item_mut(statement)?;
        }
        ControlFlow::Continue(())
    }
}

#[cfg(feature = "arbitrary")]
impl<'a> arbitrary::Arbitrary<'a> for StatementList {
    fn arbitrary(u: &mut arbitrary::Unstructured<'a>) -> arbitrary::Result<Self> {
        Ok(Self {
            statements: u.arbitrary()?,
            linear_pos_end: LinearPosition::default(),
            strict: false, // disable strictness; this is *not* in source data
        })
    }
}
