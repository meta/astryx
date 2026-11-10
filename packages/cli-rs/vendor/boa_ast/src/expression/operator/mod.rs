//! Operator expression nodes.
//!
//! An [operator][op] expression is an expression that takes an operator (such as `+`, `typeof`, `+=`)
//! and one or more expressions and returns an expression as a result.
//! An operator expression can be any of the following:
//!
//! - A [`Unary`] expression.
//! - A [`Update`] expression.
//! - A [`Assign`] expression.
//! - A [`Binary`] expression.
//! - A [`Conditional`] expression.
//!
//! [op]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators

mod conditional;

pub mod assign;
pub mod binary;
pub mod unary;
pub mod update;

pub use self::{
    assign::Assign,
    binary::{Binary, BinaryInPrivate},
    conditional::Conditional,
    unary::Unary,
    update::Update,
};
