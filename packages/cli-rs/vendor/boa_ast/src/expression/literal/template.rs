//! Template literal Expression.

use crate::{
    Span, Spanned,
    expression::Expression,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, Sym, ToInternedString};
use core::{fmt::Write as _, ops::ControlFlow};

/// Template literals are string literals allowing embedded expressions.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals
/// [spec]: https://tc39.es/ecma262/#sec-template-literals
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug, PartialEq)]
pub struct TemplateLiteral {
    elements: Box<[TemplateElement]>,
    span: Span,
}

/// Manual implementation, because string and expression in the element list must always appear in order.
#[cfg(feature = "arbitrary")]
impl<'a> arbitrary::Arbitrary<'a> for TemplateLiteral {
    fn arbitrary(u: &mut arbitrary::Unstructured<'a>) -> arbitrary::Result<Self> {
        let len = u.arbitrary_len::<Box<[TemplateElement]>>()?;

        let mut elements = Vec::with_capacity(len);
        for i in 0..len {
            if i & 1 == 0 {
                elements.push(TemplateElement::String(
                    <Sym as arbitrary::Arbitrary>::arbitrary(u)?,
                ));
            } else {
                elements.push(TemplateElement::Expr(Expression::arbitrary(u)?));
            }
        }

        Ok(Self::new(elements.into_boxed_slice(), Span::arbitrary(u)?))
    }
}

impl From<TemplateLiteral> for Expression {
    #[inline]
    fn from(tem: TemplateLiteral) -> Self {
        Self::TemplateLiteral(tem)
    }
}

impl TemplateLiteral {
    /// Creates a new `TemplateLiteral` from a list of [`TemplateElement`]s.
    #[inline]
    #[must_use]
    pub fn new(elements: Box<[TemplateElement]>, span: Span) -> Self {
        Self { elements, span }
    }

    /// Gets the element list of this `TemplateLiteral`.
    #[must_use]
    pub const fn elements(&self) -> &[TemplateElement] {
        &self.elements
    }
}

impl Spanned for TemplateLiteral {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl ToInternedString for TemplateLiteral {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        let mut buf = "`".to_owned();

        for elt in &self.elements {
            match elt {
                TemplateElement::String(s) => {
                    let _ = write!(buf, "{}", interner.resolve_expect(*s));
                }
                TemplateElement::Expr(n) => {
                    let _ = write!(buf, "${{{}}}", n.to_interned_string(interner));
                }
            }
        }
        buf.push('`');

        buf
    }
}

impl VisitWith for TemplateLiteral {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        for element in &*self.elements {
            visitor.visit_template_element(element)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        for element in &mut *self.elements {
            visitor.visit_template_element_mut(element)?;
        }
        ControlFlow::Continue(())
    }
}

/// An element found within a [`TemplateLiteral`].
///
/// The [spec] doesn't define an element akin to `TemplateElement`. However, the AST defines this
/// node as the equivalent of the components found in a template literal.
///
/// [spec]: https://tc39.es/ecma262/#sec-template-literals
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub enum TemplateElement {
    /// A simple string.
    String(Sym),
    /// An expression that is evaluated and replaced by its string representation.
    Expr(Expression),
}

impl VisitWith for TemplateElement {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::String(sym) => visitor.visit_sym(sym),
            Self::Expr(expr) => visitor.visit_expression(expr),
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::String(sym) => visitor.visit_sym_mut(sym),
            Self::Expr(expr) => visitor.visit_expression_mut(expr),
        }
    }
}
