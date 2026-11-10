#[cfg(test)]
mod tests;

use crate::{
    Error,
    lexer::TokenKind,
    parser::{
        AllowAwait, AllowReturn, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::Expression, statement::StatementList,
    },
    source::ReadChar,
};
use ast::operations::{lexically_declared_names_legacy, var_declared_names};
use boa_ast::{self as ast, Keyword, Punctuator, Spanned, statement, statement::Switch};
use boa_interner::Interner;
use rustc_hash::FxHashMap;

/// The possible `TokenKind` which indicate the end of a case statement.
const CASE_BREAK_TOKENS: [TokenKind; 3] = [
    TokenKind::Punctuator(Punctuator::CloseBlock),
    TokenKind::Keyword((Keyword::Case, false)),
    TokenKind::Keyword((Keyword::Default, false)),
];

/// Switch statement parsing.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/switch
/// [spec]: https://tc39.es/ecma262/#prod-SwitchStatement
#[derive(Debug, Clone, Copy)]
pub(super) struct SwitchStatement {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    allow_return: AllowReturn,
}

impl SwitchStatement {
    /// Creates a new `SwitchStatement` parser.
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

impl<R> TokenParser<R> for SwitchStatement
where
    R: ReadChar,
{
    type Output = Switch;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect((Keyword::Switch, false), "switch statement", interner)?;
        cursor.expect(Punctuator::OpenParen, "switch statement", interner)?;

        let condition =
            Expression::new(true, self.allow_yield, self.allow_await).parse(cursor, interner)?;

        cursor.expect(Punctuator::CloseParen, "switch statement", interner)?;

        let position = cursor.peek(0, interner).or_abrupt()?.span().start();

        let cases = CaseBlock::new(self.allow_yield, self.allow_await, self.allow_return)
            .parse(cursor, interner)?;

        let switch = Switch::new(condition, cases);

        // It is a Syntax Error if the LexicallyDeclaredNames of CaseBlock contains any duplicate
        // entries, unless the source text matched by this production is not strict mode code and the
        // duplicate entries are only bound by FunctionDeclarations.
        let mut lexical_names = FxHashMap::default();
        for (name, is_fn) in lexically_declared_names_legacy(&switch) {
            if let Some(is_fn_previous) = lexical_names.insert(name, is_fn) {
                match (cursor.strict(), is_fn, is_fn_previous) {
                    (false, true, true) => {}
                    _ => {
                        return Err(Error::general(
                            "lexical name declared multiple times",
                            position,
                        ));
                    }
                }
            }
        }

        // It is a Syntax Error if any element of the LexicallyDeclaredNames of CaseBlock also occurs
        // in the VarDeclaredNames of CaseBlock.
        for name in var_declared_names(&switch) {
            if lexical_names.contains_key(&name) {
                return Err(Error::general(
                    "lexical name declared in var declared names",
                    position,
                ));
            }
        }

        Ok(switch)
    }
}

/// Switch case block parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-CaseBlock
#[derive(Debug, Clone, Copy)]
struct CaseBlock {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    allow_return: AllowReturn,
}

impl CaseBlock {
    /// Creates a new `CaseBlock` parser.
    fn new<Y, A, R>(allow_yield: Y, allow_await: A, allow_return: R) -> Self
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

impl<R> TokenParser<R> for CaseBlock
where
    R: ReadChar,
{
    type Output = Box<[statement::Case]>;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        cursor.expect(Punctuator::OpenBlock, "switch case block", interner)?;

        let mut cases = Vec::new();
        let mut has_default_case = false;

        loop {
            let token = cursor.next(interner).or_abrupt()?;
            match token.kind() {
                TokenKind::Keyword((Keyword::Case | Keyword::Default, true)) => {
                    return Err(Error::general(
                        "Keyword must not contain escaped characters",
                        token.span().start(),
                    ));
                }
                TokenKind::Keyword((Keyword::Case, false)) => {
                    // Case statement.
                    let cond = Expression::new(true, self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?;

                    cursor.expect(Punctuator::Colon, "switch case block", interner)?;

                    let (statement_list, _) = StatementList::new(
                        self.allow_yield,
                        self.allow_await,
                        self.allow_return,
                        &CASE_BREAK_TOKENS,
                        false,
                        false,
                    )
                    .parse(cursor, interner)?;

                    cases.push(statement::Case::new(cond, statement_list));
                }
                TokenKind::Keyword((Keyword::Default, false)) => {
                    if has_default_case {
                        // If default has already been defined then it cannot be defined again and to do so is an error.
                        return Err(Error::unexpected(
                            token.to_string(interner),
                            token.span(),
                            "more than one switch default",
                        ));
                    }

                    cursor.expect(Punctuator::Colon, "switch default block", interner)?;

                    let (statement_list, _) = StatementList::new(
                        self.allow_yield,
                        self.allow_await,
                        self.allow_return,
                        &CASE_BREAK_TOKENS,
                        false,
                        false,
                    )
                    .parse(cursor, interner)?;

                    cases.push(statement::Case::default(statement_list));

                    has_default_case = true;
                }
                TokenKind::Punctuator(Punctuator::CloseBlock) => break,
                _ => {
                    return Err(Error::expected(
                        ["case".to_owned(), "default".to_owned(), "}".to_owned()],
                        token.to_string(interner),
                        token.span(),
                        "switch case block",
                    ));
                }
            }
        }

        Ok(cases.into_boxed_slice())
    }
}
