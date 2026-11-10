use super::{FormalParameterList, FunctionBody};
use crate::{
    Declaration, LinearSpan, LinearSpanIgnoreEq, Span, Spanned, block_to_string,
    expression::{Expression, Identifier},
    join_nodes,
    operations::{ContainsSymbol, contains},
    scope::{FunctionScopes, Scope},
    scope_analyzer::{
        analyze_binding_escapes, collect_bindings, optimize_scope_indices_function_constructor,
    },
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, ToIndentedString};
use core::{fmt::Write as _, ops::ControlFlow};

/// A function declaration.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-FunctionDeclaration
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct FunctionDeclaration {
    name: Identifier,
    pub(crate) parameters: FormalParameterList,
    pub(crate) body: FunctionBody,
    pub(crate) contains_direct_eval: bool,

    #[cfg_attr(feature = "serde", serde(skip))]
    pub(crate) scopes: FunctionScopes,
    linear_span: LinearSpanIgnoreEq,
}

impl FunctionDeclaration {
    /// Creates a new function declaration.
    #[inline]
    #[must_use]
    pub fn new(
        name: Identifier,
        parameters: FormalParameterList,
        body: FunctionBody,
        linear_span: LinearSpan,
    ) -> Self {
        let contains_direct_eval = contains(&parameters, ContainsSymbol::DirectEval)
            || contains(&body, ContainsSymbol::DirectEval);
        Self {
            name,
            parameters,
            body,
            contains_direct_eval,
            scopes: FunctionScopes::default(),
            linear_span: linear_span.into(),
        }
    }

    /// Gets the name of the function declaration.
    #[inline]
    #[must_use]
    pub const fn name(&self) -> Identifier {
        self.name
    }

    /// Gets the list of parameters of the function declaration.
    #[inline]
    #[must_use]
    pub const fn parameters(&self) -> &FormalParameterList {
        &self.parameters
    }

    /// Gets the body of the function declaration.
    #[inline]
    #[must_use]
    pub const fn body(&self) -> &FunctionBody {
        &self.body
    }

    /// Gets the scopes of the function declaration.
    #[inline]
    #[must_use]
    pub const fn scopes(&self) -> &FunctionScopes {
        &self.scopes
    }

    /// Gets linear span of the function declaration.
    #[inline]
    #[must_use]
    pub const fn linear_span(&self) -> LinearSpan {
        self.linear_span.0
    }

    /// Returns `true` if the function declaration contains a direct call to `eval`.
    #[inline]
    #[must_use]
    pub const fn contains_direct_eval(&self) -> bool {
        self.contains_direct_eval
    }
}

impl ToIndentedString for FunctionDeclaration {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        format!(
            "function {}({}) {}",
            interner.resolve_expect(self.name.sym()),
            join_nodes(interner, self.parameters.as_ref()),
            block_to_string(&self.body.statements, interner, indentation)
        )
    }
}

impl VisitWith for FunctionDeclaration {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_identifier(&self.name)?;
        visitor.visit_formal_parameter_list(&self.parameters)?;
        visitor.visit_function_body(&self.body)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_identifier_mut(&mut self.name)?;
        visitor.visit_formal_parameter_list_mut(&mut self.parameters)?;
        visitor.visit_function_body_mut(&mut self.body)
    }
}

impl From<FunctionDeclaration> for Declaration {
    #[inline]
    fn from(f: FunctionDeclaration) -> Self {
        Self::FunctionDeclaration(f)
    }
}

/// A function expression.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-FunctionExpression
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug)]
pub struct FunctionExpression {
    pub(crate) name: Option<Identifier>,
    pub(crate) parameters: FormalParameterList,
    pub(crate) body: FunctionBody,
    pub(crate) has_binding_identifier: bool,
    pub(crate) contains_direct_eval: bool,

    #[cfg_attr(feature = "serde", serde(skip))]
    pub(crate) name_scope: Option<Scope>,

    #[cfg_attr(feature = "serde", serde(skip))]
    pub(crate) scopes: FunctionScopes,

    span: Span,

    linear_span: Option<LinearSpan>,
}

impl PartialEq for FunctionExpression {
    fn eq(&self, other: &Self) -> bool {
        // all fields except for `linear_span`
        self.name == other.name
            && self.parameters == other.parameters
            && self.body == other.body
            && self.has_binding_identifier == other.has_binding_identifier
            && self.contains_direct_eval == other.contains_direct_eval
            && self.name_scope == other.name_scope
            && self.scopes == other.scopes
            && self.span == other.span
    }
}

impl Spanned for FunctionExpression {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl FunctionExpression {
    /// Creates a new function expression.
    #[inline]
    #[must_use]
    pub fn new(
        name: Option<Identifier>,
        parameters: FormalParameterList,
        body: FunctionBody,
        linear_span: Option<LinearSpan>,
        has_binding_identifier: bool,
        span: Span,
    ) -> Self {
        let contains_direct_eval = contains(&parameters, ContainsSymbol::DirectEval)
            || contains(&body, ContainsSymbol::DirectEval);
        Self {
            name,
            parameters,
            body,
            has_binding_identifier,
            name_scope: None,
            contains_direct_eval,
            scopes: FunctionScopes::default(),
            #[allow(clippy::redundant_closure_for_method_calls)]
            linear_span,
            span,
        }
    }

    /// Gets the name of the function expression.
    #[inline]
    #[must_use]
    pub const fn name(&self) -> Option<Identifier> {
        self.name
    }

    /// Gets the list of parameters of the function expression.
    #[inline]
    #[must_use]
    pub const fn parameters(&self) -> &FormalParameterList {
        &self.parameters
    }

    /// Gets the body of the function expression.
    #[inline]
    #[must_use]
    pub const fn body(&self) -> &FunctionBody {
        &self.body
    }

    /// Returns whether the function expression has a binding identifier.
    #[inline]
    #[must_use]
    pub const fn has_binding_identifier(&self) -> bool {
        self.has_binding_identifier
    }

    /// Gets the name scope of the function expression.
    #[inline]
    #[must_use]
    pub const fn name_scope(&self) -> Option<&Scope> {
        self.name_scope.as_ref()
    }

    /// Gets the scopes of the function expression.
    #[inline]
    #[must_use]
    pub const fn scopes(&self) -> &FunctionScopes {
        &self.scopes
    }

    /// Gets linear span of the function declaration.
    #[inline]
    #[must_use]
    pub const fn linear_span(&self) -> Option<LinearSpan> {
        self.linear_span
    }

    /// Returns `true` if the function expression contains a direct call to `eval`.
    #[inline]
    #[must_use]
    pub const fn contains_direct_eval(&self) -> bool {
        self.contains_direct_eval
    }

    /// Analyze the scope of the function expression.
    ///
    /// # Errors
    /// Any scope or binding errors that happened during the analysis.
    pub fn analyze_scope(
        &mut self,
        strict: bool,
        scope: &Scope,
        interner: &Interner,
    ) -> Result<(), &'static str> {
        collect_bindings(self, strict, false, scope, interner)?;
        analyze_binding_escapes(self, false, scope.clone(), interner)?;
        optimize_scope_indices_function_constructor(self, scope);
        Ok(())
    }
}

impl ToIndentedString for FunctionExpression {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        let mut buf = "function".to_owned();
        if self.has_binding_identifier
            && let Some(name) = self.name
        {
            let _ = write!(buf, " {}", interner.resolve_expect(name.sym()));
        }
        let _ = write!(
            buf,
            "({}) {}",
            join_nodes(interner, self.parameters.as_ref()),
            block_to_string(&self.body.statements, interner, indentation)
        );

        buf
    }
}

impl From<FunctionExpression> for Expression {
    #[inline]
    fn from(expr: FunctionExpression) -> Self {
        Self::FunctionExpression(expr)
    }
}

impl VisitWith for FunctionExpression {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        if let Some(ident) = &self.name {
            visitor.visit_identifier(ident)?;
        }
        visitor.visit_formal_parameter_list(&self.parameters)?;
        visitor.visit_function_body(&self.body)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        if let Some(ident) = &mut self.name {
            visitor.visit_identifier_mut(ident)?;
        }
        visitor.visit_formal_parameter_list_mut(&mut self.parameters)?;
        visitor.visit_function_body_mut(&mut self.body)
    }
}
