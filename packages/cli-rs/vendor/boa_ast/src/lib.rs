//! Boa's **`boa_ast`** crate implements an ECMAScript abstract syntax tree.
//!
//! # Crate Overview
//! **`boa_ast`** contains representations of [**Parse Nodes**][grammar] as defined by the ECMAScript
//! spec. Some `Parse Node`s are not represented by Boa's AST, because a lot of grammar productions
//! are only used to throw [**Early Errors**][early], and don't influence the evaluation of the AST
//! itself.
//!
//! Boa's AST is mainly split in three main components: [`Declaration`]s, [`Expression`]s and
//! [`Statement`]s, with [`StatementList`] being the primordial Parse Node that combines
//! all of them to create a proper AST.
//!
//! [grammar]: https://tc39.es/ecma262/#sec-syntactic-grammar
//! [early]: https://tc39.es/ecma262/#sec-static-semantic-rules
#![doc = include_str!("../ABOUT.md")]
#![doc(
    html_logo_url = "https://raw.githubusercontent.com/boa-dev/boa/main/assets/logo_black.svg",
    html_favicon_url = "https://raw.githubusercontent.com/boa-dev/boa/main/assets/logo_black.svg"
)]
#![cfg_attr(not(test), forbid(clippy::unwrap_used))]
#![allow(
    clippy::module_name_repetitions,
    clippy::too_many_lines,
    clippy::option_if_let_else
)]

mod module_item_list;
mod position;
mod punctuator;
mod source;
mod source_text;
mod statement_list;

pub mod declaration;
pub mod expression;
pub mod function;
pub mod keyword;
pub mod operations;
pub mod pattern;
pub mod property;
pub mod scope;
pub mod scope_analyzer;
pub mod statement;
pub mod visitor;

use boa_interner::{Interner, Sym, ToIndentedString, ToInternedString};
use boa_string::{JsStr, JsString};
use expression::Identifier;

pub use self::{
    declaration::Declaration,
    expression::Expression,
    keyword::Keyword,
    module_item_list::{ModuleItem, ModuleItemList},
    position::{
        LinearPosition, LinearSpan, LinearSpanIgnoreEq, Position, PositionGroup, Span, Spanned,
    },
    punctuator::Punctuator,
    source::{Module, Script},
    source_text::SourceText,
    statement::Statement,
    statement_list::{StatementList, StatementListItem},
};

/// Utility to join multiple Nodes into a single string.
fn join_nodes<N>(interner: &Interner, nodes: &[N]) -> String
where
    N: ToInternedString,
{
    let mut first = true;
    let mut buf = String::new();
    for e in nodes {
        if first {
            first = false;
        } else {
            buf.push_str(", ");
        }
        buf.push_str(&e.to_interned_string(interner));
    }
    buf
}

/// Displays the body of a block or statement list.
///
/// This includes the curly braces at the start and end. This will not indent the first brace,
/// but will indent the last brace.
fn block_to_string(body: &StatementList, interner: &Interner, indentation: usize) -> String {
    if body.statements().is_empty() {
        "{}".to_owned()
    } else {
        format!(
            "{{\n{}{}}}",
            body.to_indented_string(interner, indentation + 1),
            "    ".repeat(indentation)
        )
    }
}

/// Utility trait that adds a `UTF-16` escaped representation to every [`[u16]`][slice].
trait ToStringEscaped {
    /// Decodes `self` as an `UTF-16` encoded string, escaping any unpaired surrogates by its
    /// codepoint value.
    fn to_string_escaped(&self) -> String;
}

impl ToStringEscaped for [u16] {
    fn to_string_escaped(&self) -> String {
        char::decode_utf16(self.iter().copied())
            .map(|r| match r {
                Ok(c) => String::from(c),
                Err(e) => format!("\\u{:04X}", e.unpaired_surrogate()),
            })
            .collect()
    }
}

pub(crate) trait ToJsString {
    fn to_js_string(&self, interner: &Interner) -> JsString;
}

impl ToJsString for Sym {
    #[allow(clippy::cast_possible_truncation)]
    fn to_js_string(&self, interner: &Interner) -> JsString {
        let utf16 = interner.resolve_expect(*self).utf16();
        if interner.is_latin1(*self) {
            let bytes: Vec<u8> = utf16.iter().map(|&c| c as u8).collect();
            JsString::from(JsStr::latin1(&bytes))
        } else {
            JsString::from(utf16)
        }
    }
}

impl ToJsString for Identifier {
    fn to_js_string(&self, interner: &Interner) -> JsString {
        self.sym().to_js_string(interner)
    }
}
