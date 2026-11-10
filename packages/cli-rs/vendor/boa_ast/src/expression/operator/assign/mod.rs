#![allow(clippy::doc_link_with_quotes)]

//! Assignment expression nodes, as defined by the [spec].
//!
//! An [assignment operator][mdn] assigns a value to its left operand based on the value of its right
//! operand. Almost any [`LeftHandSideExpression`][lhs] Parse Node can be the target of a simple
//! assignment expression (`=`). However, the compound assignment operations such as `%=` or `??=`
//! only allow ["simple"][simple] left hand side expressions as an assignment target.
//!
//! [spec]: https://tc39.es/ecma262/#prod-AssignmentExpression
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators
//! [lhs]: https://tc39.es/ecma262/#prod-LeftHandSideExpression
//! [simple]: https://tc39.es/ecma262/#sec-static-semantics-assignmenttargettype

mod op;

use core::ops::ControlFlow;
pub use op::*;

use boa_interner::{Interner, Sym, ToInternedString};

use crate::{
    Span, Spanned,
    expression::{Expression, access::PropertyAccess, identifier::Identifier},
    pattern::Pattern,
    visitor::{VisitWith, Visitor, VisitorMut},
};

/// An assignment operator expression.
///
/// See the [module level documentation][self] for more information.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Assign {
    op: AssignOp,
    lhs: Box<AssignTarget>,
    rhs: Box<Expression>,
}

impl Assign {
    /// Creates an `Assign` AST Expression.
    #[inline]
    #[must_use]
    pub fn new(op: AssignOp, lhs: AssignTarget, rhs: Expression) -> Self {
        Self {
            op,
            lhs: Box::new(lhs),
            rhs: Box::new(rhs),
        }
    }

    /// Gets the operator of the assignment operation.
    #[inline]
    #[must_use]
    pub const fn op(&self) -> AssignOp {
        self.op
    }

    /// Gets the left hand side of the assignment operation.
    #[inline]
    #[must_use]
    pub const fn lhs(&self) -> &AssignTarget {
        &self.lhs
    }

    /// Gets the right hand side of the assignment operation.
    #[inline]
    #[must_use]
    pub const fn rhs(&self) -> &Expression {
        &self.rhs
    }
}

impl Spanned for Assign {
    #[inline]
    fn span(&self) -> Span {
        Span::new(self.lhs.span().start(), self.rhs.span().end())
    }
}

impl ToInternedString for Assign {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        format!(
            "{} {} {}",
            self.lhs.to_interned_string(interner),
            self.op,
            self.rhs.to_interned_string(interner)
        )
    }
}

impl From<Assign> for Expression {
    #[inline]
    fn from(op: Assign) -> Self {
        Self::Assign(op)
    }
}

impl VisitWith for Assign {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_assign_target(&self.lhs)?;
        visitor.visit_expression(&self.rhs)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_assign_target_mut(&mut self.lhs)?;
        visitor.visit_expression_mut(&mut self.rhs)
    }
}

/// The valid left-hand-side expressions of an assignment operator. Also called
/// [`LeftHandSideExpression`][spec] in the spec.
///
/// [spec]: hhttps://tc39.es/ecma262/#prod-LeftHandSideExpression
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub enum AssignTarget {
    /// A simple identifier, such as `a`.
    Identifier(Identifier),
    /// A property access, such as `a.prop`.
    Access(PropertyAccess),
    /// A pattern assignment, such as `{a, b, ...c}`.
    Pattern(Pattern),
}

impl AssignTarget {
    /// Converts the left-hand-side Expression of an assignment expression into an [`AssignTarget`].
    /// Returns `None` if the given Expression is an invalid left-hand-side for a assignment expression.
    #[must_use]
    pub fn from_expression(expression: &Expression, strict: bool) -> Option<Self> {
        match expression {
            Expression::ObjectLiteral(object) => {
                let pattern = object.to_pattern(strict)?;
                Some(Self::Pattern(pattern.into()))
            }
            Expression::ArrayLiteral(array) => {
                let pattern = array.to_pattern(strict)?;
                Some(Self::Pattern(pattern.into()))
            }
            e => Self::from_expression_simple(e, strict),
        }
    }

    /// Converts the left-hand-side Expression of an assignment expression into an [`AssignTarget`].
    /// Returns `None` if the given Expression is an invalid left-hand-side for a assignment expression.
    ///
    /// The `AssignmentTargetType` of the expression must be `simple`.
    #[must_use]
    pub fn from_expression_simple(expression: &Expression, strict: bool) -> Option<Self> {
        match expression {
            Expression::Identifier(id)
                if strict && (id.sym() == Sym::EVAL || id.sym() == Sym::ARGUMENTS) =>
            {
                None
            }
            Expression::Identifier(id) => Some(Self::Identifier(*id)),
            Expression::PropertyAccess(access) => Some(Self::Access(access.clone())),
            Expression::Parenthesized(p) => Self::from_expression_simple(p.expression(), strict),
            _ => None,
        }
    }
}

impl Spanned for AssignTarget {
    #[inline]
    fn span(&self) -> Span {
        match self {
            AssignTarget::Identifier(identifier) => identifier.span(),
            AssignTarget::Access(property_access) => property_access.span(),
            AssignTarget::Pattern(pattern) => pattern.span(),
        }
    }
}

impl ToInternedString for AssignTarget {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        match self {
            Self::Identifier(id) => id.to_interned_string(interner),
            Self::Access(access) => access.to_interned_string(interner),
            Self::Pattern(pattern) => pattern.to_interned_string(interner),
        }
    }
}

impl From<Identifier> for AssignTarget {
    #[inline]
    fn from(target: Identifier) -> Self {
        Self::Identifier(target)
    }
}

impl VisitWith for AssignTarget {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::Identifier(id) => visitor.visit_identifier(id),
            Self::Access(pa) => visitor.visit_property_access(pa),
            Self::Pattern(pat) => visitor.visit_pattern(pat),
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::Identifier(id) => visitor.visit_identifier_mut(id),
            Self::Access(pa) => visitor.visit_property_access_mut(pa),
            Self::Pattern(pat) => visitor.visit_pattern_mut(pat),
        }
    }
}
