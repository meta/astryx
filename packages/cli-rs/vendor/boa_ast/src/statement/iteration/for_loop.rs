use crate::operations::{ContainsSymbol, contains};
use crate::scope::Scope;
use crate::visitor::{VisitWith, Visitor, VisitorMut};
use crate::{
    Expression,
    declaration::{LexicalDeclaration, VarDeclaration},
    statement::Statement,
};
use boa_interner::{Interner, ToIndentedString, ToInternedString};
use core::{fmt::Write as _, ops::ControlFlow};

/// The `for` statement creates a loop that consists of three optional expressions.
///
/// A [`for`][mdn] loop repeats until a specified condition evaluates to `false`.
/// The JavaScript for loop is similar to the Java and C for loop.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ForDeclaration
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct ForLoop {
    #[cfg_attr(feature = "serde", serde(flatten))]
    pub(crate) inner: Box<InnerForLoop>,
}

impl ForLoop {
    /// Creates a new for loop AST node.
    #[inline]
    #[must_use]
    pub fn new(
        init: Option<ForLoopInitializer>,
        condition: Option<Expression>,
        final_expr: Option<Expression>,
        body: Statement,
    ) -> Self {
        Self {
            inner: Box::new(InnerForLoop::new(init, condition, final_expr, body)),
        }
    }

    /// Gets the initialization node.
    #[inline]
    #[must_use]
    pub const fn init(&self) -> Option<&ForLoopInitializer> {
        self.inner.init()
    }

    /// Gets the loop condition node.
    #[inline]
    #[must_use]
    pub const fn condition(&self) -> Option<&Expression> {
        self.inner.condition()
    }

    /// Gets the final expression node.
    #[inline]
    #[must_use]
    pub const fn final_expr(&self) -> Option<&Expression> {
        self.inner.final_expr()
    }

    /// Gets the body of the for loop.
    #[inline]
    #[must_use]
    pub const fn body(&self) -> &Statement {
        self.inner.body()
    }
}

impl ToIndentedString for ForLoop {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        let mut buf = String::from("for (");
        if let Some(init) = self.init() {
            buf.push_str(&init.to_interned_string(interner));
        }
        buf.push_str("; ");
        if let Some(condition) = self.condition() {
            buf.push_str(&condition.to_interned_string(interner));
        }
        buf.push_str("; ");
        if let Some(final_expr) = self.final_expr() {
            buf.push_str(&final_expr.to_interned_string(interner));
        }
        let _ = write!(
            buf,
            ") {}",
            self.inner.body().to_indented_string(interner, indentation)
        );

        buf
    }
}

impl From<ForLoop> for Statement {
    #[inline]
    fn from(for_loop: ForLoop) -> Self {
        Self::ForLoop(for_loop)
    }
}

impl VisitWith for ForLoop {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        if let Some(fli) = &self.inner.init {
            visitor.visit_for_loop_initializer(fli)?;
        }
        if let Some(expr) = &self.inner.condition {
            visitor.visit_expression(expr)?;
        }
        if let Some(expr) = &self.inner.final_expr {
            visitor.visit_expression(expr)?;
        }
        visitor.visit_statement(&self.inner.body)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        if let Some(fli) = &mut self.inner.init {
            visitor.visit_for_loop_initializer_mut(fli)?;
        }
        if let Some(expr) = &mut self.inner.condition {
            visitor.visit_expression_mut(expr)?;
        }
        if let Some(expr) = &mut self.inner.final_expr {
            visitor.visit_expression_mut(expr)?;
        }
        visitor.visit_statement_mut(&mut self.inner.body)
    }
}

/// Inner structure to avoid multiple indirections in the heap.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct InnerForLoop {
    pub(crate) init: Option<ForLoopInitializer>,
    pub(crate) condition: Option<Expression>,
    pub(crate) final_expr: Option<Expression>,
    pub(crate) body: Statement,
    pub(crate) contains_direct_eval: bool,
}

impl InnerForLoop {
    /// Creates a new inner for loop.
    #[inline]
    fn new(
        init: Option<ForLoopInitializer>,
        condition: Option<Expression>,
        final_expr: Option<Expression>,
        body: Statement,
    ) -> Self {
        let mut contains_direct_eval = contains(&body, ContainsSymbol::DirectEval);
        if let Some(init) = &init {
            contains_direct_eval |= contains(init, ContainsSymbol::DirectEval);
        }
        if let Some(condition) = &condition {
            contains_direct_eval |= contains(condition, ContainsSymbol::DirectEval);
        }
        if let Some(final_expr) = &final_expr {
            contains_direct_eval |= contains(final_expr, ContainsSymbol::DirectEval);
        }
        Self {
            init,
            condition,
            final_expr,
            body,
            contains_direct_eval,
        }
    }

    /// Gets the initialization node.
    #[inline]
    const fn init(&self) -> Option<&ForLoopInitializer> {
        self.init.as_ref()
    }

    /// Gets the loop condition node.
    #[inline]
    const fn condition(&self) -> Option<&Expression> {
        self.condition.as_ref()
    }

    /// Gets the final expression node.
    #[inline]
    const fn final_expr(&self) -> Option<&Expression> {
        self.final_expr.as_ref()
    }

    /// Gets the body of the for loop.
    #[inline]
    const fn body(&self) -> &Statement {
        &self.body
    }
}

/// A [`ForLoop`] initializer, as defined by the [spec].
///
/// A `ForLoop` initializer differs a lot from an
/// [`IterableLoopInitializer`][super::IterableLoopInitializer], since it can contain any arbitrary
/// expression instead of only accessors and patterns. Additionally, it can also contain many variable
/// declarations instead of only one.
///
/// [spec]: https://tc39.es/ecma262/#prod-ForStatement
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub enum ForLoopInitializer {
    /// An expression initializer.
    Expression(Expression),
    /// A var declaration initializer.
    Var(VarDeclaration),
    /// A lexical declaration initializer.
    Lexical(ForLoopInitializerLexical),
}

/// A lexical declaration initializer for a `ForLoop`.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct ForLoopInitializerLexical {
    pub(crate) declaration: LexicalDeclaration,

    #[cfg_attr(feature = "serde", serde(skip))]
    pub(crate) scope: Scope,
}

impl ForLoopInitializerLexical {
    /// Creates a new lexical declaration initializer.
    #[inline]
    #[must_use]
    pub fn new(declaration: LexicalDeclaration, scope: Scope) -> Self {
        Self { declaration, scope }
    }

    /// Returns the declaration of the lexical initializer.
    #[inline]
    #[must_use]
    pub const fn declaration(&self) -> &LexicalDeclaration {
        &self.declaration
    }

    /// Returns the scope of the lexical initializer.
    #[inline]
    #[must_use]
    pub const fn scope(&self) -> &Scope {
        &self.scope
    }
}

impl ToInternedString for ForLoopInitializer {
    fn to_interned_string(&self, interner: &Interner) -> String {
        match self {
            Self::Var(var) => var.to_interned_string(interner),
            Self::Lexical(lex) => lex.declaration.to_interned_string(interner),
            Self::Expression(expr) => expr.to_interned_string(interner),
        }
    }
}

impl From<Expression> for ForLoopInitializer {
    #[inline]
    fn from(expr: Expression) -> Self {
        Self::Expression(expr)
    }
}

impl From<LexicalDeclaration> for ForLoopInitializer {
    #[inline]
    fn from(list: LexicalDeclaration) -> Self {
        Self::Lexical(ForLoopInitializerLexical {
            declaration: list,
            scope: Scope::default(),
        })
    }
}

impl From<VarDeclaration> for ForLoopInitializer {
    #[inline]
    fn from(list: VarDeclaration) -> Self {
        Self::Var(list)
    }
}

impl VisitWith for ForLoopInitializer {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::Expression(expr) => visitor.visit_expression(expr),
            Self::Var(vd) => visitor.visit_var_declaration(vd),
            Self::Lexical(ld) => visitor.visit_lexical_declaration(&ld.declaration),
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::Expression(expr) => visitor.visit_expression_mut(expr),
            Self::Var(vd) => visitor.visit_var_declaration_mut(vd),
            Self::Lexical(ld) => visitor.visit_lexical_declaration_mut(&mut ld.declaration),
        }
    }
}
