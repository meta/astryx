//! Array declaration Expression.

use crate::expression::Expression;
use crate::expression::operator::assign::{AssignOp, AssignTarget};
use crate::pattern::{ArrayPattern, ArrayPatternElement, Pattern};
use crate::visitor::{VisitWith, Visitor, VisitorMut};
use crate::{Span, Spanned};
use boa_interner::{Interner, Sym, ToInternedString};
use core::ops::ControlFlow;

/// An array is an ordered collection of data (either primitive or object depending upon the
/// language).
///
/// Arrays are used to store multiple values in a single variable.
/// This is compared to a variable that can store only one value.
///
/// Each item in an array has a number attached to it, called a numeric index, that allows you
/// to access it. In JavaScript, arrays start at index zero and can be manipulated with various
/// methods.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-ArrayLiteral
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct ArrayLiteral {
    arr: Box<[Option<Expression>]>,
    has_trailing_comma_spread: bool,
    span: Span,
}

impl ArrayLiteral {
    /// Creates a new array literal.
    pub fn new<A>(array: A, has_trailing_comma_spread: bool, span: Span) -> Self
    where
        A: Into<Box<[Option<Expression>]>>,
    {
        Self {
            arr: array.into(),
            has_trailing_comma_spread,
            span,
        }
    }

    /// Indicates if a spread operator in the array literal has a trailing comma.
    /// This is a syntax error in some cases.
    #[must_use]
    pub const fn has_trailing_comma_spread(&self) -> bool {
        self.has_trailing_comma_spread
    }

    /// Converts this `ArrayLiteral` into an [`ArrayPattern`].
    #[must_use]
    pub fn to_pattern(&self, strict: bool) -> Option<ArrayPattern> {
        if self.has_trailing_comma_spread() {
            return None;
        }

        let mut bindings = Vec::new();
        for (i, expr) in self.arr.iter().enumerate() {
            let Some(expr) = expr else {
                bindings.push(ArrayPatternElement::Elision);
                continue;
            };
            match expr {
                Expression::Identifier(ident) => {
                    if strict && *ident == Sym::ARGUMENTS {
                        return None;
                    }

                    bindings.push(ArrayPatternElement::SingleName {
                        ident: *ident,
                        default_init: None,
                    });
                }
                Expression::Spread(spread) => {
                    match spread.target() {
                        Expression::Identifier(ident) => {
                            bindings.push(ArrayPatternElement::SingleNameRest { ident: *ident });
                        }
                        Expression::PropertyAccess(access) => {
                            bindings.push(ArrayPatternElement::PropertyAccessRest {
                                access: access.clone(),
                            });
                        }
                        Expression::ArrayLiteral(array) => {
                            let pattern = array.to_pattern(strict)?.into();
                            bindings.push(ArrayPatternElement::PatternRest { pattern });
                        }
                        Expression::ObjectLiteral(object) => {
                            let pattern = object.to_pattern(strict)?.into();
                            bindings.push(ArrayPatternElement::PatternRest { pattern });
                        }
                        _ => return None,
                    }
                    if i + 1 != self.arr.len() {
                        return None;
                    }
                }
                Expression::Assign(assign) => {
                    if assign.op() != AssignOp::Assign {
                        return None;
                    }
                    match assign.lhs() {
                        AssignTarget::Identifier(ident) => {
                            let mut init = assign.rhs().clone();
                            init.set_anonymous_function_definition_name(ident);
                            bindings.push(ArrayPatternElement::SingleName {
                                ident: *ident,
                                default_init: Some(init),
                            });
                        }
                        AssignTarget::Access(access) => {
                            bindings.push(ArrayPatternElement::PropertyAccess {
                                access: access.clone(),
                                default_init: Some(assign.rhs().clone()),
                            });
                        }
                        AssignTarget::Pattern(pattern) => match pattern {
                            Pattern::Object(pattern) => {
                                bindings.push(ArrayPatternElement::Pattern {
                                    pattern: Pattern::Object(pattern.clone()),
                                    default_init: Some(assign.rhs().clone()),
                                });
                            }
                            Pattern::Array(pattern) => {
                                bindings.push(ArrayPatternElement::Pattern {
                                    pattern: Pattern::Array(pattern.clone()),
                                    default_init: Some(assign.rhs().clone()),
                                });
                            }
                        },
                    }
                }
                Expression::ArrayLiteral(array) => {
                    let pattern = array.to_pattern(strict)?.into();
                    bindings.push(ArrayPatternElement::Pattern {
                        pattern,
                        default_init: None,
                    });
                }
                Expression::ObjectLiteral(object) => {
                    let pattern = object.to_pattern(strict)?.into();
                    bindings.push(ArrayPatternElement::Pattern {
                        pattern,
                        default_init: None,
                    });
                }
                Expression::PropertyAccess(access) => {
                    bindings.push(ArrayPatternElement::PropertyAccess {
                        access: access.clone(),
                        default_init: None,
                    });
                }
                _ => return None,
            }
        }
        Some(ArrayPattern::new(bindings.into(), self.span))
    }
}

impl Spanned for ArrayLiteral {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl AsRef<[Option<Expression>]> for ArrayLiteral {
    #[inline]
    fn as_ref(&self) -> &[Option<Expression>] {
        &self.arr
    }
}

impl AsMut<[Option<Expression>]> for ArrayLiteral {
    #[inline]
    fn as_mut(&mut self) -> &mut [Option<Expression>] {
        &mut self.arr
    }
}

impl ToInternedString for ArrayLiteral {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        let mut buf = String::from("[");
        let mut elements = self.arr.iter().peekable();

        while let Some(element) = elements.next() {
            if let Some(e) = element {
                buf.push_str(&e.to_interned_string(interner));
                if elements.peek().is_some() {
                    buf.push_str(", ");
                }
            } else if elements.peek().is_some() {
                buf.push_str(", ");
            } else {
                buf.push(',');
            }
        }
        buf.push(']');
        buf
    }
}

impl From<ArrayLiteral> for Expression {
    #[inline]
    fn from(arr: ArrayLiteral) -> Self {
        Self::ArrayLiteral(arr)
    }
}

impl VisitWith for ArrayLiteral {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        for expr in self.arr.iter().flatten() {
            visitor.visit_expression(expr)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        for expr in self.arr.iter_mut().flatten() {
            visitor.visit_expression_mut(expr)?;
        }
        ControlFlow::Continue(())
    }
}
