//! Error handling statements

use crate::operations::{ContainsSymbol, contains};
use crate::scope::Scope;
use crate::visitor::{VisitWith, Visitor, VisitorMut};
use crate::{
    declaration::Binding,
    statement::{Block, Statement},
};
use boa_interner::{Interner, ToIndentedString, ToInternedString};
use core::{fmt::Write as _, ops::ControlFlow};

/// The `try...catch` statement marks a block of statements to try and specifies a response
/// should an exception be thrown.
///
/// The `try` statement consists of a `try`-block, which contains one or more statements. `{}`
/// must always be used, even for single statements. At least one `catch`-block, or a
/// `finally`-block, must be present.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-TryStatement
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Try {
    block: Block,
    handler: ErrorHandler,
}

/// The type of error handler in a [`Try`] statement.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub enum ErrorHandler {
    /// A [`Catch`] error handler.
    Catch(Catch),
    /// A [`Finally`] error handler.
    Finally(Finally),
    /// A [`Catch`] and [`Finally`] error handler.
    Full(Catch, Finally),
}

impl Try {
    /// Creates a new `Try` AST node.
    #[inline]
    #[must_use]
    pub const fn new(block: Block, handler: ErrorHandler) -> Self {
        Self { block, handler }
    }

    /// Gets the `try` block.
    #[inline]
    #[must_use]
    pub const fn block(&self) -> &Block {
        &self.block
    }

    /// Gets the `catch` block, if any.
    #[inline]
    #[must_use]
    pub const fn catch(&self) -> Option<&Catch> {
        match &self.handler {
            ErrorHandler::Catch(c) | ErrorHandler::Full(c, _) => Some(c),
            ErrorHandler::Finally(_) => None,
        }
    }

    /// Gets the `finally` block, if any.
    #[inline]
    #[must_use]
    pub const fn finally(&self) -> Option<&Finally> {
        match &self.handler {
            ErrorHandler::Finally(f) | ErrorHandler::Full(_, f) => Some(f),
            ErrorHandler::Catch(_) => None,
        }
    }
}

impl ToIndentedString for Try {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        let mut buf = format!(
            "{}try {}",
            "    ".repeat(indentation),
            self.block.to_indented_string(interner, indentation)
        );

        if let Some(catch) = self.catch() {
            buf.push_str(&catch.to_indented_string(interner, indentation));
        }

        if let Some(finally) = self.finally() {
            buf.push_str(&finally.to_indented_string(interner, indentation));
        }
        buf
    }
}

impl From<Try> for Statement {
    #[inline]
    fn from(try_catch: Try) -> Self {
        Self::Try(try_catch)
    }
}

impl VisitWith for Try {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_block(&self.block)?;
        if let Some(catch) = &self.catch() {
            visitor.visit_catch(catch)?;
        }
        if let Some(finally) = &self.finally() {
            visitor.visit_finally(finally)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_block_mut(&mut self.block)?;
        match &mut self.handler {
            ErrorHandler::Catch(c) => visitor.visit_catch_mut(c)?,
            ErrorHandler::Finally(f) => visitor.visit_finally_mut(f)?,
            ErrorHandler::Full(c, f) => {
                visitor.visit_catch_mut(c)?;
                visitor.visit_finally_mut(f)?;
            }
        }
        ControlFlow::Continue(())
    }
}

/// Catch block.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Catch {
    pub(crate) parameter: Option<Binding>,
    pub(crate) block: Block,
    pub(crate) contains_direct_eval: bool,

    #[cfg_attr(feature = "serde", serde(skip))]
    pub(crate) scope: Scope,
}

impl Catch {
    /// Creates a new catch block.
    #[inline]
    #[must_use]
    pub fn new(parameter: Option<Binding>, block: Block) -> Self {
        let mut contains_direct_eval = contains(&block, ContainsSymbol::DirectEval);
        if let Some(param) = &parameter {
            contains_direct_eval |= contains(param, ContainsSymbol::DirectEval);
        }
        Self {
            parameter,
            block,
            contains_direct_eval,
            scope: Scope::default(),
        }
    }

    /// Gets the parameter of the catch block.
    #[inline]
    #[must_use]
    pub const fn parameter(&self) -> Option<&Binding> {
        self.parameter.as_ref()
    }

    /// Retrieves the catch execution block.
    #[inline]
    #[must_use]
    pub const fn block(&self) -> &Block {
        &self.block
    }

    /// Returns the scope of the catch block.
    #[inline]
    #[must_use]
    pub const fn scope(&self) -> &Scope {
        &self.scope
    }
}

impl ToIndentedString for Catch {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        let mut buf = " catch".to_owned();
        if let Some(param) = &self.parameter {
            let _ = write!(buf, "({})", param.to_interned_string(interner));
        }
        let _ = write!(
            buf,
            " {}",
            self.block.to_indented_string(interner, indentation)
        );

        buf
    }
}

impl VisitWith for Catch {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        if let Some(binding) = &self.parameter {
            visitor.visit_binding(binding)?;
        }
        visitor.visit_block(&self.block)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        if let Some(binding) = &mut self.parameter {
            visitor.visit_binding_mut(binding)?;
        }
        visitor.visit_block_mut(&mut self.block)
    }
}

/// Finally block.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct Finally {
    block: Block,
}

impl Finally {
    /// Gets the finally block.
    #[inline]
    #[must_use]
    pub const fn block(&self) -> &Block {
        &self.block
    }
}

impl ToIndentedString for Finally {
    fn to_indented_string(&self, interner: &Interner, indentation: usize) -> String {
        format!(
            " finally {}",
            self.block.to_indented_string(interner, indentation)
        )
    }
}

impl From<Block> for Finally {
    #[inline]
    fn from(block: Block) -> Self {
        Self { block }
    }
}

impl VisitWith for Finally {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_block(&self.block)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_block_mut(&mut self.block)
    }
}
