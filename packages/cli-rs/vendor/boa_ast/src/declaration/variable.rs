//! Variable related declarations.

use super::Declaration;
use crate::{
    Statement,
    expression::{Expression, Identifier},
    join_nodes,
    pattern::Pattern,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, ToInternedString};
use core::{convert::TryFrom, fmt::Write as _, ops::ControlFlow};

/// A [`var`][var] statement, also called [`VariableStatement`][varstmt] in the spec.
///
/// The scope of a variable declared with `var` is its current execution context, which is either
/// the enclosing function or, for variables declared outside any function, global. If you
/// re-declare a ECMAScript variable, it will not lose its value.
///
/// Although a bit confusing, `VarDeclaration`s are not considered [`Declaration`]s by the spec.
/// This is partly because it has very different semantics from `let` and `const` declarations, but
/// also because a `var` statement can be labelled just like any other [`Statement`]:
///
/// ```javascript
/// label: var a = 5;
/// a;
/// ```
///
/// returns `5` as the value of the statement list, while:
///
/// ```javascript
/// label: let a = 5;
/// a;
/// ```
/// throws a `SyntaxError`.
///
/// `var` declarations, wherever they occur, are processed before any code is executed. This is
/// called <code>[hoisting]</code>.
///
/// [var]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/var
/// [varstmt]: https://tc39.es/ecma262/#prod-VariableStatement
/// [hoisting]: https://developer.mozilla.org/en-US/docs/Glossary/Hoisting
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct VarDeclaration(pub VariableList);

impl From<VarDeclaration> for Statement {
    fn from(var: VarDeclaration) -> Self {
        Self::Var(var)
    }
}

impl ToInternedString for VarDeclaration {
    fn to_interned_string(&self, interner: &Interner) -> String {
        format!("var {}", self.0.to_interned_string(interner))
    }
}

impl VisitWith for VarDeclaration {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_variable_list(&self.0)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_variable_list_mut(&mut self.0)
    }
}

/// A **[lexical declaration]** defines variables that are scoped to the lexical environment of
/// the variable declaration.
///
/// [lexical declaration]: https://tc39.es/ecma262/#sec-let-and-const-declarations
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub enum LexicalDeclaration {
    /// A <code>[const]</code> variable creates a constant whose scope can be either global or local
    /// to the block in which it is declared.
    ///
    /// An initializer for a constant is required. You must specify its value in the same statement
    /// in which it's declared. (This makes sense, given that it can't be changed later)
    ///
    /// [const]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const
    Const(VariableList),

    /// A <code>[let]</code> variable is limited to a scope of a block statement, or expression on
    /// which it is used, unlike the `var` keyword, which defines a variable globally, or locally to
    /// an entire function regardless of block scope.
    ///
    /// Just like const, `let` does not create properties of the window object when declared
    /// globally (in the top-most scope).
    ///
    /// If a let declaration does not have an initializer, the variable is assigned the value `undefined`.
    ///
    /// [let]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let
    Let(VariableList),

    /// A <code>[using]</code> declaration creates a block-scoped resource that is automatically
    /// disposed when control exits the block.
    ///
    /// [using]: https://tc39.es/proposal-explicit-resource-management/
    Using(VariableList),

    /// An <code>[await using]</code> declaration creates a block-scoped resource that is automatically
    /// disposed asynchronously when control exits the block.
    ///
    /// [await using]: https://tc39.es/proposal-explicit-resource-management/
    AwaitUsing(VariableList),
}

impl LexicalDeclaration {
    /// Gets the inner variable list of the `LexicalDeclaration`
    #[must_use]
    pub const fn variable_list(&self) -> &VariableList {
        match self {
            Self::Const(list) | Self::Let(list) | Self::Using(list) | Self::AwaitUsing(list) => {
                list
            }
        }
    }

    /// Returns `true` if the declaration is a `const` declaration.
    #[must_use]
    pub const fn is_const(&self) -> bool {
        matches!(self, Self::Const(_))
    }
}

impl From<LexicalDeclaration> for Declaration {
    fn from(lex: LexicalDeclaration) -> Self {
        Self::Lexical(lex)
    }
}

impl ToInternedString for LexicalDeclaration {
    fn to_interned_string(&self, interner: &Interner) -> String {
        format!(
            "{} {}",
            match &self {
                Self::Let(_) => "let",
                Self::Const(_) => "const",
                Self::Using(_) => "using",
                Self::AwaitUsing(_) => "await using",
            },
            self.variable_list().to_interned_string(interner)
        )
    }
}

impl VisitWith for LexicalDeclaration {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::Const(vars) | Self::Let(vars) | Self::Using(vars) | Self::AwaitUsing(vars) => {
                visitor.visit_variable_list(vars)
            }
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::Const(vars) | Self::Let(vars) | Self::Using(vars) | Self::AwaitUsing(vars) => {
                visitor.visit_variable_list_mut(vars)
            }
        }
    }
}

/// List of variables in a variable declaration.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct VariableList {
    list: Box<[Variable]>,
}

impl VariableList {
    /// Creates a variable list if the provided list of [`Variable`] is not empty.
    #[must_use]
    pub fn new(list: Box<[Variable]>) -> Option<Self> {
        if list.is_empty() {
            return None;
        }

        Some(Self { list })
    }
}

impl AsRef<[Variable]> for VariableList {
    fn as_ref(&self) -> &[Variable] {
        &self.list
    }
}

impl ToInternedString for VariableList {
    fn to_interned_string(&self, interner: &Interner) -> String {
        join_nodes(interner, self.list.as_ref())
    }
}

impl VisitWith for VariableList {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        for variable in &*self.list {
            visitor.visit_variable(variable)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        for variable in &mut *self.list {
            visitor.visit_variable_mut(variable)?;
        }
        ControlFlow::Continue(())
    }
}

/// The error returned by the [`VariableList::try_from`] function.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TryFromVariableListError(());

impl std::fmt::Display for TryFromVariableListError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        "provided list of variables cannot be empty".fmt(f)
    }
}

impl TryFrom<Box<[Variable]>> for VariableList {
    type Error = TryFromVariableListError;

    fn try_from(value: Box<[Variable]>) -> Result<Self, Self::Error> {
        Self::new(value).ok_or(TryFromVariableListError(()))
    }
}

impl TryFrom<Vec<Variable>> for VariableList {
    type Error = TryFromVariableListError;

    fn try_from(value: Vec<Variable>) -> Result<Self, Self::Error> {
        Self::try_from(value.into_boxed_slice())
    }
}

/// Variable represents a variable declaration of some kind.
///
/// For `let` and `const` declarations this type represents a [`LexicalBinding`][spec1]
///
/// For `var` declarations this type represents a [`VariableDeclaration`][spec2]
///
/// More information:
///  - [ECMAScript reference: 14.3 Declarations and the Variable Statement][spec3]
///
/// [spec1]: https://tc39.es/ecma262/#prod-LexicalBinding
/// [spec2]: https://tc39.es/ecma262/#prod-VariableDeclaration
/// [spec3]:  https://tc39.es/ecma262/#sec-declarations-and-the-variable-statement
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Variable {
    binding: Binding,
    init: Option<Expression>,
}

impl ToInternedString for Variable {
    fn to_interned_string(&self, interner: &Interner) -> String {
        let mut buf = self.binding.to_interned_string(interner);

        if let Some(ref init) = self.init {
            let _ = write!(buf, " = {}", init.to_interned_string(interner));
        }
        buf
    }
}

impl Variable {
    /// Creates a new variable declaration from a `BindingIdentifier`.
    #[inline]
    #[must_use]
    pub const fn from_identifier(ident: Identifier, init: Option<Expression>) -> Self {
        Self {
            binding: Binding::Identifier(ident),
            init,
        }
    }

    /// Creates a new variable declaration from a `Pattern`.
    #[inline]
    #[must_use]
    pub const fn from_pattern(pattern: Pattern, init: Option<Expression>) -> Self {
        Self {
            binding: Binding::Pattern(pattern),
            init,
        }
    }
    /// Gets the variable declaration binding.
    #[must_use]
    pub const fn binding(&self) -> &Binding {
        &self.binding
    }

    /// Gets the initialization expression for the variable declaration, if any.
    #[inline]
    #[must_use]
    pub const fn init(&self) -> Option<&Expression> {
        self.init.as_ref()
    }
}

impl VisitWith for Variable {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_binding(&self.binding)?;
        if let Some(init) = &self.init {
            visitor.visit_expression(init)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_binding_mut(&mut self.binding)?;
        if let Some(init) = &mut self.init {
            visitor.visit_expression_mut(init)?;
        }
        ControlFlow::Continue(())
    }
}

/// Binding represents either an individual binding or a binding pattern.
///
/// More information:
///  - [ECMAScript reference: 14.3 Declarations and the Variable Statement][spec]
///
/// [spec]:  https://tc39.es/ecma262/#sec-declarations-and-the-variable-statement
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub enum Binding {
    /// A single identifier binding.
    Identifier(Identifier),
    /// A pattern binding.
    Pattern(Pattern),
}

impl From<Identifier> for Binding {
    fn from(id: Identifier) -> Self {
        Self::Identifier(id)
    }
}

impl From<Pattern> for Binding {
    fn from(pat: Pattern) -> Self {
        Self::Pattern(pat)
    }
}

impl ToInternedString for Binding {
    fn to_interned_string(&self, interner: &Interner) -> String {
        match self {
            Self::Identifier(id) => id.to_interned_string(interner),
            Self::Pattern(pattern) => pattern.to_interned_string(interner),
        }
    }
}

impl VisitWith for Binding {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::Identifier(id) => visitor.visit_identifier(id),
            Self::Pattern(pattern) => visitor.visit_pattern(pattern),
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::Identifier(id) => visitor.visit_identifier_mut(id),
            Self::Pattern(pattern) => visitor.visit_pattern_mut(pattern),
        }
    }
}
