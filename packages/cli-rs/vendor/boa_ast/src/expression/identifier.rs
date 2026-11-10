//! Local identifier Expression.

use crate::{
    Span, Spanned, ToStringEscaped,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, Sym, ToInternedString};
use core::ops::ControlFlow;

use super::Expression;

/// List of reserved keywords exclusive to strict mode.
pub const RESERVED_IDENTIFIERS_STRICT: [Sym; 9] = [
    Sym::IMPLEMENTS,
    Sym::INTERFACE,
    Sym::LET,
    Sym::PACKAGE,
    Sym::PRIVATE,
    Sym::PROTECTED,
    Sym::PUBLIC,
    Sym::STATIC,
    Sym::YIELD,
];

/// An `identifier` is a sequence of characters in the code that identifies a variable,
/// function, or property.
///
/// In ECMAScript, identifiers are case-sensitive and can contain Unicode letters, $, _, and
/// digits (0-9), but may not start with a digit.
///
/// An identifier differs from a string in that a string is data, while an identifier is part
/// of the code. In JavaScript, there is no way to convert identifiers to strings, but
/// sometimes it is possible to parse strings into identifiers.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-Identifier
/// [mdn]: https://developer.mozilla.org/en-US/docs/Glossary/Identifier
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Identifier {
    ident: Sym,
    span: Span,
}

impl PartialEq<Sym> for Identifier {
    #[inline]
    fn eq(&self, other: &Sym) -> bool {
        self.ident == *other
    }
}

impl PartialEq<Identifier> for Sym {
    #[inline]
    fn eq(&self, other: &Identifier) -> bool {
        *self == other.ident
    }
}

impl Identifier {
    /// Creates a new identifier AST Expression.
    #[inline]
    #[must_use]
    pub const fn new(ident: Sym, span: Span) -> Self {
        Self { ident, span }
    }

    /// Retrieves the identifier's string symbol in the interner.
    #[inline]
    #[must_use]
    pub const fn sym(self) -> Sym {
        self.ident
    }

    /// Retrieves the identifier's string symbol in the interner.
    #[inline]
    #[must_use]
    pub const fn sym_ref(&self) -> &Sym {
        &self.ident
    }

    /// Retrieves the identifier's string symbol in the interner.
    #[inline]
    #[must_use]
    pub const fn sym_mut(&mut self) -> &mut Sym {
        &mut self.ident
    }
}

impl Spanned for Identifier {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl ToInternedString for Identifier {
    #[inline]
    fn to_interned_string(&self, interner: &Interner) -> String {
        interner.resolve_expect(self.ident).join(
            String::from,
            ToStringEscaped::to_string_escaped,
            true,
        )
    }
}

impl From<Identifier> for Expression {
    #[inline]
    fn from(local: Identifier) -> Self {
        Self::Identifier(local)
    }
}

impl VisitWith for Identifier {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_sym(&self.ident)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_sym_mut(&mut self.ident)
    }
}
