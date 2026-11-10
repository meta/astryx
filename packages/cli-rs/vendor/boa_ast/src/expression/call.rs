use crate::visitor::{VisitWith, Visitor, VisitorMut};
use crate::{Span, Spanned, join_nodes};
use boa_interner::{Interner, ToInternedString};
use core::ops::ControlFlow;

use super::Expression;

/// Calling the function actually performs the specified actions with the indicated parameters.
///
/// Defining a function does not execute it. Defining it simply names the function and
/// specifies what to do when the function is called. Functions must be in scope when they are
/// called, but the function declaration can be hoisted. The scope of a function is the
/// function in which it is declared (or the entire program, if it is declared at the top
/// level).
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-CallExpression
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions#Calling_functions
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Call {
    function: Box<Expression>,
    args: Box<[Expression]>,
    span: Span,
}

impl Call {
    /// Creates a new `Call` AST Expression.
    #[inline]
    #[must_use]
    pub fn new(function: Expression, args: Box<[Expression]>, span: Span) -> Self {
        Self {
            function: Box::new(function),
            args,
            span,
        }
    }

    /// Gets the target function of this call expression.
    #[inline]
    #[must_use]
    pub const fn function(&self) -> &Expression {
        &self.function
    }

    /// Retrieves the arguments passed to the function.
    #[inline]
    #[must_use]
    pub const fn args(&self) -> &[Expression] {
        &self.args
    }
}

impl Spanned for Call {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl ToInternedString for Call {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        format!(
            "{}({})",
            self.function.to_interned_string(interner),
            join_nodes(interner, &self.args)
        )
    }
}

impl From<Call> for Expression {
    #[inline]
    fn from(call: Call) -> Self {
        Self::Call(call)
    }
}

impl VisitWith for Call {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_expression(&self.function)?;
        for expr in &*self.args {
            visitor.visit_expression(expr)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_expression_mut(&mut self.function)?;
        for expr in &mut *self.args {
            visitor.visit_expression_mut(expr)?;
        }
        ControlFlow::Continue(())
    }
}

/// The `super` keyword is used to access and call functions on an object's parent.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-SuperCall
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/super
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct SuperCall {
    args: Box<[Expression]>,
    span: Span,
}

impl SuperCall {
    /// Creates a new `SuperCall` AST node.
    pub fn new<A>(args: A, span: Span) -> Self
    where
        A: Into<Box<[Expression]>>,
    {
        Self {
            args: args.into(),
            span,
        }
    }

    /// Retrieves the arguments of the super call.
    #[must_use]
    pub const fn arguments(&self) -> &[Expression] {
        &self.args
    }
}

impl Spanned for SuperCall {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl ToInternedString for SuperCall {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        format!("super({})", join_nodes(interner, &self.args))
    }
}

impl From<SuperCall> for Expression {
    #[inline]
    fn from(call: SuperCall) -> Self {
        Self::SuperCall(call)
    }
}

impl VisitWith for SuperCall {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        for expr in &*self.args {
            visitor.visit_expression(expr)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        for expr in &mut *self.args {
            visitor.visit_expression_mut(expr)?;
        }
        ControlFlow::Continue(())
    }
}

/// The phase of a dynamic import call.
///
/// Determines how the imported module is handled:
/// - `Evaluation` (default): `import(specifier)` — loads, links, and evaluates the module.
/// - `Defer`: `import.defer(specifier)` — deferred evaluation of the module.
/// - `Source`: `import.source(specifier)` — source phase import.
///
/// More information:
///  - [import-defer proposal][defer]
///  - [source-phase-imports proposal][source]
///
/// [defer]: https://github.com/tc39/proposal-defer-import-eval
/// [source]: https://github.com/tc39/proposal-source-phase-imports
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum ImportPhase {
    /// `import(specifier)` — standard dynamic import.
    #[default]
    Evaluation,
    /// `import.defer(specifier)` — deferred import evaluation.
    Defer,
    /// `import.source(specifier)` — source phase import.
    Source,
}

/// The `import()` syntax, commonly called dynamic import, is a function-like expression that allows
/// loading an ECMAScript module asynchronously and dynamically into a potentially non-module
/// environment.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-ImportCall
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct ImportCall {
    specifier: Box<Expression>,
    options: Option<Box<Expression>>,
    phase: ImportPhase,
    span: Span,
}

impl ImportCall {
    /// Creates a new `ImportCall` AST node.
    #[inline]
    #[must_use]
    pub fn new<S>(specifier: S, options: Option<Expression>, phase: ImportPhase, span: Span) -> Self
    where
        S: Into<Expression>,
    {
        Self {
            specifier: Box::new(specifier.into()),
            options: options.map(Box::new),
            phase,
            span,
        }
    }

    /// Retrieves the specifier (first argument) of the import call.
    #[inline]
    #[must_use]
    pub const fn specifier(&self) -> &Expression {
        &self.specifier
    }

    /// Retrieves the options (second argument) of the import call, if present.
    ///
    /// This is used for import attributes:
    /// ```js
    /// import("foo.json", { with: { type: "json" } })
    /// ```
    #[inline]
    #[must_use]
    pub fn options(&self) -> Option<&Expression> {
        self.options.as_deref()
    }

    /// Returns the phase of this import call.
    #[inline]
    #[must_use]
    pub const fn phase(&self) -> ImportPhase {
        self.phase
    }

    /// Gets the module specifier of the import call.
    ///
    /// This is an alias for [`Self::specifier`] for backwards compatibility.
    #[inline]
    #[must_use]
    #[deprecated(since = "0.21.0", note = "use `specifier` instead")]
    pub const fn argument(&self) -> &Expression {
        &self.specifier
    }
}

impl Spanned for ImportCall {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl ToInternedString for ImportCall {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        let phase_str = match self.phase {
            ImportPhase::Evaluation => "",
            ImportPhase::Defer => ".defer",
            ImportPhase::Source => ".source",
        };
        if let Some(options) = &self.options {
            format!(
                "import{}({}, {})",
                phase_str,
                self.specifier.to_interned_string(interner),
                options.to_interned_string(interner)
            )
        } else {
            format!(
                "import{}({})",
                phase_str,
                self.specifier.to_interned_string(interner)
            )
        }
    }
}

impl From<ImportCall> for Expression {
    #[inline]
    fn from(call: ImportCall) -> Self {
        Self::ImportCall(call)
    }
}

impl VisitWith for ImportCall {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_expression(&self.specifier)?;
        if let Some(options) = &self.options {
            visitor.visit_expression(options)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_expression_mut(&mut self.specifier)?;
        if let Some(options) = &mut self.options {
            visitor.visit_expression_mut(options)?;
        }
        ControlFlow::Continue(())
    }
}
