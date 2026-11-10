//! The [`Declaration`] Parse Node, as defined by the [spec].
//!
//! ECMAScript declarations include:
//! - [Lexical][lex] declarations (`let`, `const`).
//! - [Function][fun] declarations (`function`, `async function`).
//! - [Class][class] declarations.
//!
//! See [*Difference between statements and declarations*][diff] for an explanation on why `Declaration`s
//! and `Statement`s are distinct nodes.
//!
//! [spec]: https://tc39.es/ecma262/#prod-Declaration
//! [lex]: https://tc39.es/ecma262/#prod-LexicalDeclaration
//! [fun]: https://tc39.es/ecma262/#prod-HoistableDeclaration
//! [class]: https://tc39.es/ecma262/#prod-ClassDeclaration
//! [diff]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements#difference_between_statements_and_declarations

use super::function::{
    AsyncFunctionDeclaration, AsyncGeneratorDeclaration, FunctionDeclaration, GeneratorDeclaration,
};
use crate::{
    function::ClassDeclaration,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, Sym, ToIndentedString, ToInternedString};
use core::ops::ControlFlow;

mod export;
mod import;
mod variable;

pub use export::*;
pub use import::*;
pub use variable::*;

/// The `Declaration` Parse Node.
///
/// See the [module level documentation][self] for more information.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub enum Declaration {
    /// See [`FunctionDeclaration`]
    FunctionDeclaration(FunctionDeclaration),

    /// See [`GeneratorDeclaration`]
    GeneratorDeclaration(GeneratorDeclaration),

    /// See [`AsyncFunctionDeclaration`]
    AsyncFunctionDeclaration(AsyncFunctionDeclaration),

    /// See [`AsyncGeneratorDeclaration`]
    AsyncGeneratorDeclaration(AsyncGeneratorDeclaration),

    /// See [`ClassDeclaration`]
    ClassDeclaration(Box<ClassDeclaration>),

    /// See [`LexicalDeclaration`]
    Lexical(LexicalDeclaration),
}

impl ToIndentedString for Declaration {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        match self {
            Self::FunctionDeclaration(f) => f.to_indented_string(interner, indentation),
            Self::GeneratorDeclaration(g) => g.to_indented_string(interner, indentation),
            Self::AsyncFunctionDeclaration(af) => af.to_indented_string(interner, indentation),
            Self::AsyncGeneratorDeclaration(ag) => ag.to_indented_string(interner, indentation),
            Self::ClassDeclaration(c) => c.to_indented_string(interner, indentation),
            Self::Lexical(l) => {
                let mut s = l.to_interned_string(interner);
                s.push(';');
                s
            }
        }
    }
}

impl VisitWith for Declaration {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::FunctionDeclaration(f) => visitor.visit_function_declaration(f),
            Self::GeneratorDeclaration(g) => visitor.visit_generator_declaration(g),
            Self::AsyncFunctionDeclaration(af) => visitor.visit_async_function_declaration(af),
            Self::AsyncGeneratorDeclaration(ag) => visitor.visit_async_generator_declaration(ag),
            Self::ClassDeclaration(c) => visitor.visit_class_declaration(c),
            Self::Lexical(ld) => visitor.visit_lexical_declaration(ld),
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::FunctionDeclaration(f) => visitor.visit_function_declaration_mut(f),
            Self::GeneratorDeclaration(g) => visitor.visit_generator_declaration_mut(g),
            Self::AsyncFunctionDeclaration(af) => visitor.visit_async_function_declaration_mut(af),
            Self::AsyncGeneratorDeclaration(ag) => {
                visitor.visit_async_generator_declaration_mut(ag)
            }
            Self::ClassDeclaration(c) => visitor.visit_class_declaration_mut(c),
            Self::Lexical(ld) => visitor.visit_lexical_declaration_mut(ld),
        }
    }
}

/// Module specifier.
///
/// This is equivalent to the [`ModuleSpecifier`] production.
///
/// [`FromClause`]: https://tc39.es/ecma262/#prod-ModuleSpecifier
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, Copy, PartialEq, Eq)]
pub struct ModuleSpecifier {
    module: Sym,
}

impl ModuleSpecifier {
    /// Creates a `ModuleSpecifier` from a `Sym`.
    #[must_use]
    pub const fn new(module: Sym) -> Self {
        Self { module }
    }

    /// Gets the inner `Sym` of the module specifier.
    #[inline]
    #[must_use]
    pub const fn sym(self) -> Sym {
        self.module
    }
}

impl From<Sym> for ModuleSpecifier {
    #[inline]
    fn from(module: Sym) -> Self {
        Self::new(module)
    }
}

impl VisitWith for ModuleSpecifier {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_sym(&self.module)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_sym_mut(&mut self.module)
    }
}

/// An import attribute entry in an [`ImportDeclaration`].
///
/// This is a key-value pair, where the key is an identifier or string literal,
/// and the value is a string literal.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-imports
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, Copy, PartialEq, Eq)]
pub struct ImportAttribute {
    key: Sym,
    value: Sym,
}

impl ImportAttribute {
    /// Creates a new `ImportAttribute`.
    #[inline]
    #[must_use]
    pub const fn new(key: Sym, value: Sym) -> Self {
        Self { key, value }
    }

    /// Gets the attribute key.
    #[inline]
    #[must_use]
    pub const fn key(self) -> Sym {
        self.key
    }

    /// Gets the attribute value.
    #[inline]
    #[must_use]
    pub const fn value(self) -> Sym {
        self.value
    }
}

impl VisitWith for ImportAttribute {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_sym(&self.key)?;
        visitor.visit_sym(&self.value)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_sym_mut(&mut self.key)?;
        visitor.visit_sym_mut(&mut self.value)
    }
}
