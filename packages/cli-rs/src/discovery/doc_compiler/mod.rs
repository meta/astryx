//! The rendering half of the doc compiler (foundation/doc-compiler): command
//! tokens, links between docs, the docs tree, lowering and linking a topic,
//! and the lenses reads take of it.
//!
//! Owner: the docs lane (agreed with discovery, which owns the rest of
//! `src/discovery/`).

pub mod doc_syntax;
pub mod links;
pub mod tree;
pub mod compile;
