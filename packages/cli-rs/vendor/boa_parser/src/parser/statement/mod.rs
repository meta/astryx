//! Statement and declaration parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements
//! [spec]: https://tc39.es/ecma262/#sec-ecmascript-language-statements-and-declarations

mod block;
mod break_stm;
mod continue_stm;
mod declaration;
mod expression;
mod if_stm;
mod iteration;
mod labelled_stm;
mod return_stm;
mod switch;
mod throw;
mod try_stm;
mod variable;
mod with;

use self::{
    block::BlockStatement,
    break_stm::BreakStatement,
    continue_stm::ContinueStatement,
    declaration::{Declaration, ExportDeclaration, ImportDeclaration, allowed_token_after_let},
    expression::ExpressionStatement,
    if_stm::IfStatement,
    iteration::{DoWhileStatement, ForStatement, WhileStatement},
    labelled_stm::LabelledStatement,
    return_stm::ReturnStatement,
    switch::SwitchStatement,
    throw::ThrowStatement,
    try_stm::TryStatement,
    variable::VariableStatement,
    with::WithStatement,
};
use crate::{
    Error,
    lexer::{Error as LexError, InputElement, Token, TokenKind, token::EscapeSequence},
    parser::{
        AllowAwait, AllowReturn, AllowYield, Cursor, OrAbrupt, ParseResult, TokenParser,
        expression::{BindingIdentifier, Initializer, PropertyName},
    },
    source::ReadChar,
};
use ast::{
    Position,
    operations::{all_private_identifiers_valid, check_labels, contains_invalid_object_literal},
};
use boa_ast::{
    self as ast, Keyword, Punctuator, Span, Spanned,
    pattern::{ArrayPattern, ArrayPatternElement, ObjectPattern, ObjectPatternElement},
};
use boa_interner::Interner;
use boa_macros::utf16;

pub(in crate::parser) use declaration::ClassTail;

/// Statement parsing.
///
/// This can be one of the following:
///
///  - `BlockStatement`
///  - `VariableStatement`
///  - `EmptyStatement`
///  - `ExpressionStatement`
///  - `IfStatement`
///  - `BreakableStatement`
///  - `ContinueStatement`
///  - `BreakStatement`
///  - `ReturnStatement`
///  - `WithStatement`
///  - `LabelledStatement`
///  - `ThrowStatement`
///  - `SwitchStatement`
///  - `TryStatement`
///  - `DebuggerStatement`
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements
/// [spec]: https://tc39.es/ecma262/#prod-Statement
#[derive(Debug, Clone, Copy)]
pub(super) struct Statement {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    allow_return: AllowReturn,
}

impl Statement {
    /// Creates a new `Statement` parser.
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

impl<R> TokenParser<R> for Statement
where
    R: ReadChar,
{
    type Output = ast::Statement;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        // TODO: add BreakableStatement and divide Whiles, fors and so on to another place.
        let tok = cursor.peek(0, interner).or_abrupt()?;

        match tok.kind() {
            TokenKind::Keyword((Keyword::With, _)) => {
                WithStatement::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)
                    .map(ast::Statement::from)
            }
            TokenKind::Keyword((Keyword::If, _)) => {
                IfStatement::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)
                    .map(ast::Statement::from)
            }
            TokenKind::Keyword((Keyword::Var, _)) => {
                VariableStatement::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)
                    .map(ast::Statement::from)
            }
            TokenKind::Keyword((Keyword::While, _)) => {
                WhileStatement::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)
                    .map(ast::Statement::from)
            }
            TokenKind::Keyword((Keyword::Do, _)) => {
                DoWhileStatement::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)
                    .map(ast::Statement::from)
            }
            TokenKind::Keyword((Keyword::For, _)) => {
                ForStatement::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)
            }
            TokenKind::Keyword((Keyword::Return, _)) => {
                if self.allow_return.0 {
                    ReturnStatement::new(self.allow_yield, self.allow_await)
                        .parse(cursor, interner)
                        .map(ast::Statement::from)
                } else {
                    Err(Error::unexpected(
                        tok.to_string(interner),
                        tok.span(),
                        "statement",
                    ))
                }
            }
            TokenKind::Keyword((Keyword::Break, _)) => {
                BreakStatement::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)
                    .map(ast::Statement::from)
            }
            TokenKind::Keyword((Keyword::Continue, _)) => {
                ContinueStatement::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)
                    .map(ast::Statement::from)
            }
            TokenKind::Keyword((Keyword::Try, _)) => {
                TryStatement::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)
                    .map(ast::Statement::from)
            }
            TokenKind::Keyword((Keyword::Throw, _)) => {
                ThrowStatement::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)
                    .map(ast::Statement::from)
            }
            TokenKind::Keyword((Keyword::Switch, _)) => {
                SwitchStatement::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)
                    .map(ast::Statement::from)
            }
            TokenKind::Punctuator(Punctuator::OpenBlock) => {
                BlockStatement::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)
                    .map(ast::Statement::from)
            }
            TokenKind::Punctuator(Punctuator::Semicolon) => {
                // parse the EmptyStatement
                cursor.advance(interner);
                Ok(ast::Statement::Empty)
            }
            TokenKind::IdentifierName(_)
            | TokenKind::Keyword((Keyword::Await | Keyword::Yield, _)) => {
                // Labelled Statement check
                cursor.set_goal(InputElement::Div);
                let tok = cursor.peek(1, interner)?;

                if let Some(tok) = tok
                    && matches!(tok.kind(), TokenKind::Punctuator(Punctuator::Colon))
                {
                    return LabelledStatement::new(
                        self.allow_yield,
                        self.allow_await,
                        self.allow_return,
                    )
                    .parse(cursor, interner)
                    .map(ast::Statement::from);
                }

                ExpressionStatement::new(self.allow_yield, self.allow_await).parse(cursor, interner)
            }
            TokenKind::Keyword((Keyword::Debugger, _)) => {
                cursor.advance(interner);
                cursor.expect_semicolon("debugger statement", interner)?;
                Ok(ast::Statement::Debugger)
            }
            _ => {
                ExpressionStatement::new(self.allow_yield, self.allow_await).parse(cursor, interner)
            }
        }
    }
}

/// Reads a list of statements.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-StatementList
#[derive(Debug, Clone, Copy)]
pub(super) struct StatementList {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    allow_return: AllowReturn,
    break_nodes: &'static [TokenKind],
    directive_prologues: bool,
    strict: bool,
}

impl StatementList {
    /// Creates a new `StatementList` parser.
    pub(super) fn new<Y, A, R>(
        allow_yield: Y,
        allow_await: A,
        allow_return: R,
        break_nodes: &'static [TokenKind],
        directive_prologues: bool,
        strict: bool,
    ) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
        R: Into<AllowReturn>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            allow_return: allow_return.into(),
            break_nodes,
            directive_prologues,
            strict,
        }
    }
}

impl<R> TokenParser<R> for StatementList
where
    R: ReadChar,
{
    type Output = (ast::StatementList, Option<Position>);

    /// The function parses a `node::StatementList` using the `StatementList`'s
    /// `break_nodes` to know when to terminate.
    ///
    /// Returns a `ParseError::AbruptEnd` if end of stream is reached before a
    /// break token.
    ///
    /// Returns a `ParseError::unexpected` if an unexpected token is found.
    ///
    /// Note that the last token which causes the parse to finish is not
    /// consumed.
    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let mut items = Vec::new();

        let global_strict = cursor.strict();
        let mut directive_prologues = self.directive_prologues;
        let mut strict = self.strict;
        let mut directives_stack = Vec::new();
        let mut linear_pos_end = cursor.linear_pos();
        let mut end_position = None;

        loop {
            let peek_token = cursor.peek(0, interner)?;
            if let Some(peek_token) = peek_token {
                linear_pos_end = peek_token.linear_span().end();
                end_position = Some(peek_token.span().end());
            }

            match peek_token {
                Some(token) if self.break_nodes.contains(token.kind()) => break,
                Some(token) if directive_prologues => {
                    if let TokenKind::StringLiteral((_, escape)) = token.kind() {
                        directives_stack.push((token.span().start(), *escape));
                    }
                }
                None => break,
                _ => {}
            }

            let item =
                StatementListItem::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)?;

            if directive_prologues {
                if let ast::StatementListItem::Statement(statement) = &item {
                    if let ast::Statement::Expression(ast::Expression::Literal(lit)) =
                        statement.as_ref()
                    {
                        if let Some(string) = lit.as_string() {
                            if strict {
                                // TODO: should store directives in some place
                            } else if interner.resolve_expect(string).join(
                                |s| s == "use strict",
                                |g| g == utf16!("use strict"),
                                true,
                            ) && directives_stack.last().expect("token should exist").1
                                == EscapeSequence::empty()
                            {
                                cursor.set_strict(true);
                                strict = true;

                                directives_stack.pop();

                                for (position, escape) in std::mem::take(&mut directives_stack) {
                                    if escape.contains(EscapeSequence::LEGACY_OCTAL) {
                                        return Err(Error::general(
                                            "legacy octal escape sequences are not allowed in strict mode",
                                            position,
                                        ));
                                    }

                                    if escape.contains(EscapeSequence::NON_OCTAL_DECIMAL) {
                                        return Err(Error::general(
                                            "decimal escape sequences are not allowed in strict mode",
                                            position,
                                        ));
                                    }
                                }
                            }
                        } else {
                            directive_prologues = false;
                            directives_stack.clear();
                        }
                    } else {
                        directive_prologues = false;
                        directives_stack.clear();
                    }
                } else {
                    directive_prologues = false;
                    directives_stack.clear();
                }
            }

            items.push(item);
        }

        cursor.set_strict(global_strict);

        Ok((
            ast::StatementList::new(items, linear_pos_end, strict),
            end_position,
        ))
    }
}

/// Statement list item parsing
///
/// A statement list item can either be an statement or a declaration.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements
/// [spec]: https://tc39.es/ecma262/#prod-StatementListItem
#[derive(Debug, Clone, Copy)]
struct StatementListItem {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    allow_return: AllowReturn,
}

impl StatementListItem {
    /// Creates a new `StatementListItem` parser.
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

impl<R> TokenParser<R> for StatementListItem
where
    R: ReadChar,
{
    type Output = ast::StatementListItem;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let tok = cursor.peek(0, interner).or_abrupt()?;

        match tok.kind().clone() {
            TokenKind::Keyword((
                Keyword::Function | Keyword::Class | Keyword::Const | Keyword::Using,
                _,
            )) => Declaration::new(self.allow_yield, self.allow_await)
                .parse(cursor, interner)
                .map(ast::StatementListItem::from),
            TokenKind::Keyword((Keyword::Let, false))
                if allowed_token_after_let(cursor.peek(1, interner)?) =>
            {
                Declaration::new(self.allow_yield, self.allow_await)
                    .parse(cursor, interner)
                    .map(ast::StatementListItem::from)
            }
            TokenKind::Keyword((Keyword::Await, false)) => {
                // Check if this is `await using`
                // Per spec, there must be [no LineTerminator here] between `await` and `using`
                if let Some(next_tok) = cursor.peek_no_skip_line_term(1, interner)?
                    && next_tok.kind() != &TokenKind::LineTerminator
                    && matches!(next_tok.kind(), TokenKind::Keyword((Keyword::Using, false)))
                {
                    return Declaration::new(self.allow_yield, self.allow_await)
                        .parse(cursor, interner)
                        .map(ast::StatementListItem::from);
                }
                // Otherwise, parse as a statement (await expression)
                Statement::new(self.allow_yield, self.allow_await, self.allow_return)
                    .parse(cursor, interner)
                    .map(ast::StatementListItem::from)
            }
            TokenKind::Keyword((Keyword::Async, false)) => {
                let skip_n = if cursor.peek_is_line_terminator(0, interner).or_abrupt()? {
                    2
                } else {
                    1
                };
                let is_line_terminator = cursor
                    .peek_is_line_terminator(skip_n, interner)?
                    .unwrap_or(true);

                match cursor.peek(1, interner)?.map(Token::kind) {
                    Some(TokenKind::Keyword((Keyword::Function, _))) if !is_line_terminator => {
                        Declaration::new(self.allow_yield, self.allow_await)
                            .parse(cursor, interner)
                            .map(ast::StatementListItem::from)
                    }
                    _ => Statement::new(self.allow_yield, self.allow_await, self.allow_return)
                        .parse(cursor, interner)
                        .map(ast::StatementListItem::from),
                }
            }
            _ => Statement::new(self.allow_yield, self.allow_await, self.allow_return)
                .parse(cursor, interner)
                .map(ast::StatementListItem::from),
        }
    }
}

/// `ObjectBindingPattern` pattern parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ObjectBindingPattern
#[derive(Debug, Clone, Copy)]
pub(super) struct ObjectBindingPattern {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl ObjectBindingPattern {
    /// Creates a new `ObjectBindingPattern` parser.
    pub(super) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
        }
    }
}

impl<R> TokenParser<R> for ObjectBindingPattern
where
    R: ReadChar,
{
    type Output = ObjectPattern;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let start = cursor
            .expect(
                TokenKind::Punctuator(Punctuator::OpenBlock),
                "object binding pattern",
                interner,
            )?
            .span()
            .start();

        let mut patterns = Vec::new();

        loop {
            let next_token_is_colon = *cursor.peek(1, interner).or_abrupt()?.kind()
                == TokenKind::Punctuator(Punctuator::Colon);
            let token = cursor.peek(0, interner).or_abrupt()?;
            match token.kind() {
                TokenKind::Punctuator(Punctuator::CloseBlock) => {
                    let end = cursor
                        .expect(
                            TokenKind::Punctuator(Punctuator::CloseBlock),
                            "object binding pattern",
                            interner,
                        )?
                        .span()
                        .end();
                    return Ok(ObjectPattern::new(
                        patterns.into_boxed_slice(),
                        Span::new(start, end),
                    ));
                }
                TokenKind::Punctuator(Punctuator::Spread) => {
                    cursor.expect(
                        TokenKind::Punctuator(Punctuator::Spread),
                        "object binding pattern",
                        interner,
                    )?;
                    let ident = BindingIdentifier::new(self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?;
                    patterns.push(ObjectPatternElement::RestProperty { ident });

                    let end = cursor
                        .expect(
                            TokenKind::Punctuator(Punctuator::CloseBlock),
                            "object binding pattern",
                            interner,
                        )?
                        .span()
                        .end();
                    return Ok(ObjectPattern::new(
                        patterns.into_boxed_slice(),
                        Span::new(start, end),
                    ));
                }
                _ => {
                    let is_property_name = match token.kind() {
                        TokenKind::Punctuator(Punctuator::OpenBracket)
                        | TokenKind::StringLiteral(_)
                        | TokenKind::NumericLiteral(_) => true,
                        TokenKind::IdentifierName(_)
                        | TokenKind::Keyword(_)
                        | TokenKind::BooleanLiteral(_)
                        | TokenKind::NullLiteral(_)
                            if next_token_is_colon =>
                        {
                            true
                        }
                        _ => false,
                    };

                    if is_property_name {
                        let property_name = PropertyName::new(self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?;
                        cursor.expect(
                            TokenKind::Punctuator(Punctuator::Colon),
                            "object binding pattern",
                            interner,
                        )?;
                        if let Some(peek_token) = cursor.peek(0, interner)? {
                            match peek_token.kind() {
                                TokenKind::Punctuator(Punctuator::OpenBlock) => {
                                    let bindings = Self::new(self.allow_yield, self.allow_await)
                                        .parse(cursor, interner)?;

                                    if let Some(peek_token) = cursor.peek(0, interner)? {
                                        match peek_token.kind() {
                                            TokenKind::Punctuator(Punctuator::Assign) => {
                                                let init = Initializer::new(
                                                    true,
                                                    self.allow_yield,
                                                    self.allow_await,
                                                )
                                                .parse(cursor, interner)?;
                                                patterns.push(ObjectPatternElement::Pattern {
                                                    name: property_name,
                                                    pattern: bindings.into(),
                                                    default_init: Some(init),
                                                });
                                            }
                                            _ => {
                                                patterns.push(ObjectPatternElement::Pattern {
                                                    name: property_name,
                                                    pattern: bindings.into(),
                                                    default_init: None,
                                                });
                                            }
                                        }
                                    }
                                }
                                TokenKind::Punctuator(Punctuator::OpenBracket) => {
                                    let bindings = ArrayBindingPattern::new(
                                        self.allow_yield,
                                        self.allow_await,
                                    )
                                    .parse(cursor, interner)?;

                                    if let Some(peek_token) = cursor.peek(0, interner)? {
                                        match peek_token.kind() {
                                            TokenKind::Punctuator(Punctuator::Assign) => {
                                                let init = Initializer::new(
                                                    true,
                                                    self.allow_yield,
                                                    self.allow_await,
                                                )
                                                .parse(cursor, interner)?;
                                                patterns.push(ObjectPatternElement::Pattern {
                                                    name: property_name,
                                                    pattern: bindings.into(),
                                                    default_init: Some(init),
                                                });
                                            }
                                            _ => {
                                                patterns.push(ObjectPatternElement::Pattern {
                                                    name: property_name,
                                                    pattern: bindings.into(),
                                                    default_init: None,
                                                });
                                            }
                                        }
                                    }
                                }
                                _ => {
                                    // TODO: Currently parses only BindingIdentifier.
                                    //       Should parse https://tc39.es/ecma262/#prod-PropertyName
                                    let ident =
                                        BindingIdentifier::new(self.allow_yield, self.allow_await)
                                            .parse(cursor, interner)?;

                                    if let Some(peek_token) = cursor.peek(0, interner)? {
                                        match peek_token.kind() {
                                            TokenKind::Punctuator(Punctuator::Assign) => {
                                                let mut init = Initializer::new(
                                                    true,
                                                    self.allow_yield,
                                                    self.allow_await,
                                                )
                                                .parse(cursor, interner)?;
                                                init.set_anonymous_function_definition_name(&ident);
                                                patterns.push(ObjectPatternElement::SingleName {
                                                    ident,
                                                    name: property_name,
                                                    default_init: Some(init),
                                                });
                                            }
                                            _ => {
                                                patterns.push(ObjectPatternElement::SingleName {
                                                    ident,
                                                    name: property_name,
                                                    default_init: None,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        let name = BindingIdentifier::new(self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?;
                        match cursor.peek(0, interner)?.map(Token::kind) {
                            Some(TokenKind::Punctuator(Punctuator::Assign)) => {
                                let mut init =
                                    Initializer::new(true, self.allow_yield, self.allow_await)
                                        .parse(cursor, interner)?;
                                init.set_anonymous_function_definition_name(&name);
                                patterns.push(ObjectPatternElement::SingleName {
                                    ident: name,
                                    name: name.into(),
                                    default_init: Some(init),
                                });
                            }
                            _ => {
                                patterns.push(ObjectPatternElement::SingleName {
                                    ident: name,
                                    name: name.into(),
                                    default_init: None,
                                });
                            }
                        }
                    }
                }
            }

            if let Some(peek_token) = cursor.peek(0, interner)?
                && peek_token.kind() == &TokenKind::Punctuator(Punctuator::Comma)
            {
                cursor.expect(
                    TokenKind::Punctuator(Punctuator::Comma),
                    "object binding pattern",
                    interner,
                )?;
            }
        }
    }
}

/// `ArrayBindingPattern` pattern parsing.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ArrayBindingPattern
#[derive(Debug, Clone, Copy)]
pub(super) struct ArrayBindingPattern {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
}

impl ArrayBindingPattern {
    /// Creates a new `ArrayBindingPattern` parser.
    pub(super) fn new<Y, A>(allow_yield: Y, allow_await: A) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
        }
    }
}

impl<R> TokenParser<R> for ArrayBindingPattern
where
    R: ReadChar,
{
    type Output = ArrayPattern;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let start = cursor
            .expect(
                TokenKind::Punctuator(Punctuator::OpenBracket),
                "array binding pattern",
                interner,
            )?
            .span()
            .start();

        let mut patterns = Vec::new();
        let mut last_elision_or_first = true;

        loop {
            match cursor.peek(0, interner).or_abrupt()?.kind() {
                TokenKind::Punctuator(Punctuator::CloseBracket) => {
                    let end = cursor
                        .expect(
                            TokenKind::Punctuator(Punctuator::CloseBracket),
                            "array binding pattern",
                            interner,
                        )?
                        .span()
                        .end();
                    return Ok(ArrayPattern::new(
                        patterns.into_boxed_slice(),
                        Span::new(start, end),
                    ));
                }
                TokenKind::Punctuator(Punctuator::Comma) => {
                    cursor.expect(
                        TokenKind::Punctuator(Punctuator::Comma),
                        "array binding pattern",
                        interner,
                    )?;
                    if last_elision_or_first {
                        patterns.push(ArrayPatternElement::Elision);
                    } else {
                        last_elision_or_first = true;
                    }
                    continue;
                }
                TokenKind::Punctuator(Punctuator::Spread) => {
                    cursor.expect(
                        TokenKind::Punctuator(Punctuator::Spread),
                        "array binding pattern",
                        interner,
                    )?;

                    match cursor.peek(0, interner).or_abrupt()?.kind() {
                        TokenKind::Punctuator(Punctuator::OpenBlock) => {
                            let bindings =
                                ObjectBindingPattern::new(self.allow_yield, self.allow_await)
                                    .parse(cursor, interner)?;
                            patterns.push(ArrayPatternElement::PatternRest {
                                pattern: bindings.into(),
                            });
                        }
                        TokenKind::Punctuator(Punctuator::OpenBracket) => {
                            let bindings = Self::new(self.allow_yield, self.allow_await)
                                .parse(cursor, interner)?;
                            patterns.push(ArrayPatternElement::PatternRest {
                                pattern: bindings.into(),
                            });
                        }
                        _ => {
                            let rest_property_name =
                                BindingIdentifier::new(self.allow_yield, self.allow_await)
                                    .parse(cursor, interner)?;
                            patterns.push(ArrayPatternElement::SingleNameRest {
                                ident: rest_property_name,
                            });
                        }
                    }

                    let end = cursor
                        .expect(
                            TokenKind::Punctuator(Punctuator::CloseBracket),
                            "array binding pattern",
                            interner,
                        )?
                        .span()
                        .end();

                    return Ok(ArrayPattern::new(
                        patterns.into_boxed_slice(),
                        Span::new(start, end),
                    ));
                }
                TokenKind::Punctuator(Punctuator::OpenBlock) => {
                    last_elision_or_first = false;

                    let bindings = ObjectBindingPattern::new(self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?;

                    match cursor.peek(0, interner).or_abrupt()?.kind() {
                        TokenKind::Punctuator(Punctuator::Assign) => {
                            let default_init =
                                Initializer::new(true, self.allow_yield, self.allow_await)
                                    .parse(cursor, interner)?;
                            patterns.push(ArrayPatternElement::Pattern {
                                pattern: bindings.into(),
                                default_init: Some(default_init),
                            });
                        }
                        _ => {
                            patterns.push(ArrayPatternElement::Pattern {
                                pattern: bindings.into(),
                                default_init: None,
                            });
                        }
                    }
                }
                TokenKind::Punctuator(Punctuator::OpenBracket) => {
                    last_elision_or_first = false;

                    let bindings =
                        Self::new(self.allow_yield, self.allow_await).parse(cursor, interner)?;

                    match cursor.peek(0, interner).or_abrupt()?.kind() {
                        TokenKind::Punctuator(Punctuator::Assign) => {
                            let default_init =
                                Initializer::new(true, self.allow_yield, self.allow_await)
                                    .parse(cursor, interner)?;
                            patterns.push(ArrayPatternElement::Pattern {
                                pattern: bindings.into(),
                                default_init: Some(default_init),
                            });
                        }
                        _ => {
                            patterns.push(ArrayPatternElement::Pattern {
                                pattern: bindings.into(),
                                default_init: None,
                            });
                        }
                    }
                }
                _ => {
                    last_elision_or_first = false;

                    let ident = BindingIdentifier::new(self.allow_yield, self.allow_await)
                        .parse(cursor, interner)?;
                    match cursor.peek(0, interner).or_abrupt()?.kind() {
                        TokenKind::Punctuator(Punctuator::Assign) => {
                            let mut init =
                                Initializer::new(true, self.allow_yield, self.allow_await)
                                    .parse(cursor, interner)?;
                            init.set_anonymous_function_definition_name(&ident);
                            patterns.push(ArrayPatternElement::SingleName {
                                ident,
                                default_init: Some(init),
                            });
                        }
                        _ => {
                            patterns.push(ArrayPatternElement::SingleName {
                                ident,
                                default_init: None,
                            });
                        }
                    }
                }
            }

            if let Some(peek_token) = cursor.peek(0, interner)?
                && peek_token.kind() == &TokenKind::Punctuator(Punctuator::Comma)
            {
                cursor.expect(
                    TokenKind::Punctuator(Punctuator::Comma),
                    "array binding pattern",
                    interner,
                )?;
                if last_elision_or_first {
                    patterns.push(ArrayPatternElement::Elision);
                } else {
                    last_elision_or_first = true;
                }
            }
        }
    }
}

/// Parses a module body
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ModuleBody
#[derive(Debug, Clone, Copy)]
pub(super) struct ModuleItemList;

impl<R> TokenParser<R> for ModuleItemList
where
    R: ReadChar,
{
    type Output = boa_ast::ModuleItemList;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let mut list = Vec::new();
        while cursor.peek(0, interner)?.is_some() {
            let item = ModuleItem.parse(cursor, interner)?;

            if let Err(error) = check_labels(&item) {
                return Err(Error::lex(LexError::Syntax(
                    error.message(interner).into(),
                    Position::new(1, 1),
                )));
            }

            if contains_invalid_object_literal(&item) {
                return Err(Error::lex(LexError::Syntax(
                    "invalid object literal in module item list".into(),
                    Position::new(1, 1),
                )));
            }

            list.push(item);
        }

        let list = list.into();

        // It is a Syntax Error if AllPrivateIdentifiersValid of ModuleItemList with argument « » is false.
        if !all_private_identifiers_valid(&list, Vec::new()) {
            return Err(Error::general(
                "invalid private identifier usage",
                Position::new(1, 1),
            ));
        }

        Ok(list)
    }
}

/// Parses a module item.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-ModuleItem
struct ModuleItem;

impl<R> TokenParser<R> for ModuleItem
where
    R: ReadChar,
{
    type Output = boa_ast::ModuleItem;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let tok = cursor.peek(0, interner).or_abrupt()?;

        match tok.kind() {
            TokenKind::Keyword((Keyword::Export, false)) => ExportDeclaration
                .parse(cursor, interner)
                .map(Box::new)
                .map(Self::Output::ExportDeclaration),
            TokenKind::Keyword((Keyword::Import, false)) => {
                if ImportDeclaration::test(cursor, interner)? {
                    ImportDeclaration
                        .parse(cursor, interner)
                        .map(Self::Output::ImportDeclaration)
                } else {
                    StatementListItem::new(false, true, false)
                        .parse(cursor, interner)
                        .map(Self::Output::StatementListItem)
                }
            }
            _ => StatementListItem::new(false, true, false)
                .parse(cursor, interner)
                .map(Self::Output::StatementListItem),
        }
    }
}
