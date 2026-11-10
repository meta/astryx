use super::{FormalParameterList, FunctionBody};
use crate::{
    Declaration, LinearSpan, LinearSpanIgnoreEq, Span, Spanned, block_to_string,
    expression::{Expression, Identifier},
    join_nodes,
    operations::{ContainsSymbol, contains},
    scope::{FunctionScopes, Scope},
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, ToIndentedString};
use core::{fmt::Write as _, ops::ControlFlow};

/// A generator declaration.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-GeneratorDeclaration
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct GeneratorDeclaration {
    name: Identifier,
    pub(crate) parameters: FormalParameterList,
    pub(crate) body: FunctionBody,
    pub(crate) contains_direct_eval: bool,

    #[cfg_attr(feature = "serde", serde(skip))]
    pub(crate) scopes: FunctionScopes,
    linear_span: LinearSpanIgnoreEq,
}

impl GeneratorDeclaration {
    /// Creates a new generator declaration.
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

    /// Gets the name of the generator declaration.
    #[inline]
    #[must_use]
    pub const fn name(&self) -> Identifier {
        self.name
    }

    /// Gets the list of parameters of the generator declaration.
    #[inline]
    #[must_use]
    pub const fn parameters(&self) -> &FormalParameterList {
        &self.parameters
    }

    /// Gets the body of the generator declaration.
    #[inline]
    #[must_use]
    pub const fn body(&self) -> &FunctionBody {
        &self.body
    }

    /// Returns the scopes of the generator declaration.
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

    /// Returns `true` if the generator declaration contains a direct call to `eval`.
    #[inline]
    #[must_use]
    pub const fn contains_direct_eval(&self) -> bool {
        self.contains_direct_eval
    }
}

impl ToIndentedString for GeneratorDeclaration {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        format!(
            "function* {}({}) {}",
            interner.resolve_expect(self.name.sym()),
            join_nodes(interner, self.parameters.as_ref()),
            block_to_string(&self.body.statements, interner, indentation)
        )
    }
}

impl VisitWith for GeneratorDeclaration {
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

impl From<GeneratorDeclaration> for Declaration {
    #[inline]
    fn from(f: GeneratorDeclaration) -> Self {
        Self::GeneratorDeclaration(f)
    }
}

/// A generator expression.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-GeneratorExpression
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct GeneratorExpression {
    pub(crate) name: Option<Identifier>,
    pub(crate) parameters: FormalParameterList,
    pub(crate) body: FunctionBody,
    pub(crate) has_binding_identifier: bool,
    pub(crate) contains_direct_eval: bool,

    #[cfg_attr(feature = "serde", serde(skip))]
    pub(crate) name_scope: Option<Scope>,

    #[cfg_attr(feature = "serde", serde(skip))]
    pub(crate) scopes: FunctionScopes,
    linear_span: LinearSpanIgnoreEq,

    span: Span,
}

impl GeneratorExpression {
    /// Creates a new generator expression.
    #[inline]
    #[must_use]
    pub fn new(
        name: Option<Identifier>,
        parameters: FormalParameterList,
        body: FunctionBody,
        linear_span: LinearSpan,
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
            linear_span: linear_span.into(),
            span,
        }
    }

    /// Gets the name of the generator expression.
    #[inline]
    #[must_use]
    pub const fn name(&self) -> Option<Identifier> {
        self.name
    }

    /// Gets the list of parameters of the generator expression.
    #[inline]
    #[must_use]
    pub const fn parameters(&self) -> &FormalParameterList {
        &self.parameters
    }

    /// Gets the body of the generator expression.
    #[inline]
    #[must_use]
    pub const fn body(&self) -> &FunctionBody {
        &self.body
    }

    /// Returns whether the generator expression has a binding identifier.
    #[inline]
    #[must_use]
    pub const fn has_binding_identifier(&self) -> bool {
        self.has_binding_identifier
    }

    /// Gets the name scope of the generator expression.
    #[inline]
    #[must_use]
    pub const fn name_scope(&self) -> Option<&Scope> {
        self.name_scope.as_ref()
    }

    /// Gets the scopes of the generator expression.
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

    /// Returns `true` if the generator expression contains a direct call to `eval`.
    #[inline]
    #[must_use]
    pub const fn contains_direct_eval(&self) -> bool {
        self.contains_direct_eval
    }
}

impl Spanned for GeneratorExpression {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl ToIndentedString for GeneratorExpression {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        let mut buf = "function*".to_owned();
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

impl From<GeneratorExpression> for Expression {
    #[inline]
    fn from(expr: GeneratorExpression) -> Self {
        Self::GeneratorExpression(expr)
    }
}

impl VisitWith for GeneratorExpression {
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
