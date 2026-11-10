#[cfg(test)]
mod tests;

use crate::{
    parser::{
        AllowAwait, AllowDefault, AllowYield, Cursor, ParseResult, TokenParser,
        statement::declaration::hoistable::{CallableDeclaration, parse_callable_declaration},
    },
    source::ReadChar,
};
use boa_ast::{Keyword, function::AsyncFunctionDeclaration as AsyncFunctionDeclarationNode};
use boa_interner::Interner;

/// Async Function declaration parsing.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function
/// [spec]: https://tc39.es/ecma262/#prod-AsyncFunctionDeclaration
#[derive(Debug, Clone, Copy)]
pub(in crate::parser) struct AsyncFunctionDeclaration {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    is_default: AllowDefault,
}

impl AsyncFunctionDeclaration {
    /// Creates a new `AsyncFunctionDeclaration` parser.
    pub(in crate::parser) fn new<Y, A, D>(allow_yield: Y, allow_await: A, is_default: D) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
        D: Into<AllowDefault>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            is_default: is_default.into(),
        }
    }
}

impl CallableDeclaration for AsyncFunctionDeclaration {
    fn error_context(&self) -> &'static str {
        "async function declaration"
    }
    fn is_default(&self) -> bool {
        self.is_default.0
    }
    fn name_allow_yield(&self) -> bool {
        self.allow_yield.0
    }
    fn name_allow_await(&self) -> bool {
        self.allow_await.0
    }
    fn parameters_allow_yield(&self) -> bool {
        false
    }
    fn parameters_allow_await(&self) -> bool {
        true
    }
    fn body_allow_yield(&self) -> bool {
        false
    }
    fn body_allow_await(&self) -> bool {
        true
    }
    fn parameters_await_is_early_error(&self) -> bool {
        true
    }
}

impl<R> TokenParser<R> for AsyncFunctionDeclaration
where
    R: ReadChar,
{
    type Output = AsyncFunctionDeclarationNode;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let async_token = cursor.expect(
            (Keyword::Async, false),
            "async function declaration",
            interner,
        )?;
        let start_linear_span = async_token.linear_span();

        cursor.peek_expect_no_lineterminator(0, "async function declaration", interner)?;
        cursor.expect(
            (Keyword::Function, false),
            "async function declaration",
            interner,
        )?;

        let result = parse_callable_declaration(&self, cursor, interner)?;
        let span = start_linear_span.union(result.2.linear_pos_end());

        Ok(AsyncFunctionDeclarationNode::new(
            result.0, result.1, result.2, span,
        ))
    }
}
