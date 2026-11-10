use crate::{
    Error,
    lexer::TokenKind,
    parser::{
        AllowYield, OrAbrupt, ParseResult, TokenParser,
        cursor::Cursor,
        expression::LabelIdentifier,
        statement::{AllowAwait, AllowReturn, Statement, declaration::FunctionDeclaration},
    },
    source::ReadChar,
};
use boa_ast::{self as ast, Keyword, Punctuator, Spanned};
use boa_interner::Interner;

/// Labelled Statement Parsing
///
/// More information
/// - [MDN documentation][mdn]
/// - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/label
/// [spec]: https://tc39.es/ecma262/#sec-labelled-statements
#[derive(Debug, Clone, Copy)]
pub(super) struct LabelledStatement {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    allow_return: AllowReturn,
}

impl LabelledStatement {
    pub(super) fn new<Y, A, R>(allow_yield: Y, allow_await: A, allow_return: R) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
        R: Into<AllowReturn>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            allow_return: allow_return.into(),
        }
    }
}

impl<R> TokenParser<R> for LabelledStatement
where
    R: ReadChar,
{
    type Output = ast::statement::Labelled;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let label = LabelIdentifier::new(self.allow_yield, self.allow_await)
            .parse(cursor, interner)?
            .sym();

        cursor.expect(Punctuator::Colon, "Labelled Statement", interner)?;

        let strict = cursor.strict();
        let next_token = cursor.peek(0, interner).or_abrupt()?;

        let labelled_item = match next_token.kind() {
            // Early Error: It is a Syntax Error if any strict mode source code matches this rule.
            // https://tc39.es/ecma262/#sec-labelled-statements-static-semantics-early-errors
            // https://tc39.es/ecma262/#sec-labelled-function-declarations
            TokenKind::Keyword((Keyword::Function, _))
                if cfg!(not(feature = "annex-b")) || strict =>
            {
                return Err(Error::misplaced_function_declaration(
                    next_token.span().start(),
                    strict,
                ));
            }
            TokenKind::Keyword((Keyword::Function, _)) => {
                FunctionDeclaration::new(self.allow_yield, self.allow_await, false)
                    .parse(cursor, interner)?
                    .into()
            }
            _ => Statement::new(self.allow_yield, self.allow_await, self.allow_return)
                .parse(cursor, interner)?
                .into(),
        };

        Ok(ast::statement::Labelled::new(labelled_item, label))
    }
}
