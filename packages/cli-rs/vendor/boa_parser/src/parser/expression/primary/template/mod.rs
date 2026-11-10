//! Template literal parsing.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript specification][spec]
//!
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals
//! [spec]: https://tc39.es/ecma262/#sec-template-literals

use crate::{
    Error,
    lexer::TokenKind,
    parser::{AllowAwait, AllowYield, Cursor, ParseResult, TokenParser, expression::Expression},
    source::ReadChar,
};
use boa_ast::{
    PositionGroup, Punctuator, Span, Spanned,
    expression::literal::{self, TemplateElement},
};
use boa_interner::{Interner, Sym};

/// Parses a template literal.
///
/// More information:
///  - [MDN documentation][mdn]
///  - [ECMAScript specification][spec]
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals
/// [spec]: https://tc39.es/ecma262/#prod-TemplateLiteral
#[derive(Debug, Clone)]
pub(super) struct TemplateLiteral {
    allow_yield: AllowYield,
    allow_await: AllowAwait,
    start: PositionGroup,
    first: Sym,
}

impl TemplateLiteral {
    /// Creates a new `TemplateLiteral` parser.
    pub(super) fn new<Y, A>(
        allow_yield: Y,
        allow_await: A,
        start: PositionGroup,
        first: Sym,
    ) -> Self
    where
        Y: Into<AllowYield>,
        A: Into<AllowAwait>,
    {
        Self {
            allow_yield: allow_yield.into(),
            allow_await: allow_await.into(),
            start,
            first,
        }
    }
}

impl<R> TokenParser<R> for TemplateLiteral
where
    R: ReadChar,
{
    type Output = literal::TemplateLiteral;

    fn parse(self, cursor: &mut Cursor<R>, interner: &mut Interner) -> ParseResult<Self::Output> {
        let mut elements = vec![
            TemplateElement::String(self.first),
            TemplateElement::Expr(
                Expression::new(true, self.allow_yield, self.allow_await)
                    .parse(cursor, interner)?,
            ),
        ];
        cursor.expect(
            TokenKind::Punctuator(Punctuator::CloseBlock),
            "template literal",
            interner,
        )?;

        loop {
            let token = cursor.lex_template(self.start, interner)?;
            match token.kind() {
                TokenKind::TemplateMiddle(template_string) => {
                    let Some(cooked) = template_string.cooked() else {
                        return Err(Error::general(
                            "invalid escape in template literal",
                            self.start,
                        ));
                    };
                    elements.push(TemplateElement::String(cooked));
                    elements.push(TemplateElement::Expr(
                        Expression::new(true, self.allow_yield, self.allow_await)
                            .parse(cursor, interner)?,
                    ));
                    cursor.expect(
                        TokenKind::Punctuator(Punctuator::CloseBlock),
                        "template literal",
                        interner,
                    )?;
                }
                TokenKind::TemplateNoSubstitution(template_string) => {
                    let Some(cooked) = template_string.cooked() else {
                        return Err(Error::general(
                            "invalid escape in template literal",
                            self.start,
                        ));
                    };
                    elements.push(TemplateElement::String(cooked));
                    return Ok(literal::TemplateLiteral::new(
                        elements.into(),
                        Span::new(self.start.position(), token.span().end()),
                    ));
                }
                _ => return Err(Error::general("cannot parse template literal", self.start)),
            }
        }
    }
}
