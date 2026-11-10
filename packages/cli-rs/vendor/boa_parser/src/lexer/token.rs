//! Boa's implementation of all ECMAScript [Token]s.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-tokens

use crate::lexer::template::TemplateString;
use bitflags::bitflags;
use boa_ast::{Keyword, LinearSpan, PositionGroup, Punctuator, Span, Spanned};
use boa_interner::{Interner, Sym};
use num_bigint::BigInt;

/// This represents the smallest individual words, phrases, or characters that JavaScript can understand.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-tokens
#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    /// The token kind, which contains the actual data of the token.
    kind: TokenKind,
    /// The token position in the original source code.
    span: Span,
    /// The token linear position in the original source code.
    linear_span: LinearSpan,
}

impl Token {
    /// Create a new detailed token from the token data, line number, column number, and linear position
    #[inline]
    #[must_use]
    pub const fn new(kind: TokenKind, span: Span, linear_span: LinearSpan) -> Self {
        Self {
            kind,
            span,
            linear_span,
        }
    }

    /// Create a new detailed token from the token data, line number and column number
    #[inline]
    #[must_use]
    pub fn new_by_position_group(
        kind: TokenKind,
        start: PositionGroup,
        end: PositionGroup,
    ) -> Self {
        Self::new(
            kind,
            Span::new(start.position(), end.position()),
            LinearSpan::new(start.linear_position(), end.linear_position()),
        )
    }

    /// Gets the kind of the token.
    #[inline]
    #[must_use]
    pub const fn kind(&self) -> &TokenKind {
        &self.kind
    }

    /// Gets the starting position group of the token.
    #[inline]
    #[must_use]
    pub const fn start_group(&self) -> PositionGroup {
        PositionGroup::new(self.span.start(), self.linear_span.start())
    }

    /// Gets the token span in the original source code.
    #[inline]
    #[must_use]
    pub const fn linear_span(&self) -> LinearSpan {
        self.linear_span
    }

    /// Converts the token to a `String`.
    #[inline]
    pub(crate) fn to_string(&self, interner: &Interner) -> String {
        self.kind.to_string(interner)
    }
}

impl Spanned for Token {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

/// Represents the type different types of numeric literals.
#[derive(Clone, PartialEq, Debug)]
pub enum Numeric {
    /// A floating point number.
    Rational(f64),

    /// An integer.
    Integer(i32),

    /// A `BigInt`.
    BigInt(Box<BigInt>),
}

impl From<f64> for Numeric {
    #[inline]
    fn from(n: f64) -> Self {
        Self::Rational(n)
    }
}

impl From<i32> for Numeric {
    #[inline]
    fn from(n: i32) -> Self {
        Self::Integer(n)
    }
}

impl From<BigInt> for Numeric {
    #[inline]
    fn from(n: BigInt) -> Self {
        Self::BigInt(Box::new(n))
    }
}

/// Represents the type of Token and the data it has inside.
#[derive(Clone, PartialEq, Debug)]
pub enum TokenKind {
    /// A boolean literal, which is either `true` or `false`.
    BooleanLiteral((bool, ContainsEscapeSequence)),

    /// The end of the file.
    EOF,

    /// An [**identifier name**][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-IdentifierName
    IdentifierName((Sym, ContainsEscapeSequence)),

    /// A [**private identifier**][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-PrivateIdentifier
    PrivateIdentifier(Sym),

    /// A keyword and a flag if the keyword contains unicode escaped chars.
    ///
    /// For more information, see [`Keyword`].
    Keyword((Keyword, bool)),

    /// The [`null` literal][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-NullLiteral
    NullLiteral(ContainsEscapeSequence),

    /// A numeric literal.
    NumericLiteral(Numeric),

    /// A piece of punctuation
    Punctuator(Punctuator),

    /// A [**string literal**][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-StringLiteral
    StringLiteral((Sym, EscapeSequence)),

    /// A part of a template literal without substitution.
    TemplateNoSubstitution(TemplateString),

    /// The part of a template literal between substitutions
    TemplateMiddle(TemplateString),

    /// A regular expression, consisting of body and flags.
    RegularExpressionLiteral(Sym, Sym),

    /// Indicates a [**line terminator (`\n`)**][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-LineTerminator
    LineTerminator,

    /// Indicates a comment, the content isn't stored.
    Comment,
}

impl From<bool> for TokenKind {
    #[inline]
    fn from(oth: bool) -> Self {
        Self::BooleanLiteral((oth, ContainsEscapeSequence(false)))
    }
}

impl From<(Keyword, bool)> for TokenKind {
    #[inline]
    fn from(kw: (Keyword, bool)) -> Self {
        Self::Keyword(kw)
    }
}

impl From<Punctuator> for TokenKind {
    #[inline]
    fn from(punc: Punctuator) -> Self {
        Self::Punctuator(punc)
    }
}

impl From<Numeric> for TokenKind {
    #[inline]
    fn from(num: Numeric) -> Self {
        Self::NumericLiteral(num)
    }
}

impl TokenKind {
    /// Creates a `BooleanLiteral` token kind.
    #[inline]
    #[must_use]
    pub const fn boolean_literal(lit: bool) -> Self {
        Self::BooleanLiteral((lit, ContainsEscapeSequence(false)))
    }

    /// Creates an `EOF` token kind.
    #[inline]
    #[must_use]
    pub const fn eof() -> Self {
        Self::EOF
    }

    /// Creates an `Identifier` token type.
    #[inline]
    #[must_use]
    pub const fn identifier(ident: Sym) -> Self {
        Self::IdentifierName((ident, ContainsEscapeSequence(false)))
    }

    /// Creates a `NumericLiteral` token kind.
    #[must_use]
    pub fn numeric_literal<L>(lit: L) -> Self
    where
        L: Into<Numeric>,
    {
        Self::NumericLiteral(lit.into())
    }

    /// Creates a `Punctuator` token type.
    #[inline]
    #[must_use]
    pub const fn punctuator(punc: Punctuator) -> Self {
        Self::Punctuator(punc)
    }

    /// Creates a `StringLiteral` token type.
    #[inline]
    #[must_use]
    pub const fn string_literal(lit: Sym, escape_sequence: EscapeSequence) -> Self {
        Self::StringLiteral((lit, escape_sequence))
    }

    /// Creates a `TemplateMiddle` token type.
    #[inline]
    #[must_use]
    pub const fn template_middle(template_string: TemplateString) -> Self {
        Self::TemplateMiddle(template_string)
    }

    /// Creates a `TemplateNoSubstitution` token type.
    #[inline]
    #[must_use]
    pub const fn template_no_substitution(template_string: TemplateString) -> Self {
        Self::TemplateNoSubstitution(template_string)
    }

    /// Creates a `RegularExpressionLiteral` token kind.
    #[inline]
    #[must_use]
    pub const fn regular_expression_literal(body: Sym, flags: Sym) -> Self {
        Self::RegularExpressionLiteral(body, flags)
    }

    /// Creates a `LineTerminator` token kind.
    #[inline]
    #[must_use]
    pub const fn line_terminator() -> Self {
        Self::LineTerminator
    }

    /// Creates a 'Comment' token kind.
    #[inline]
    #[must_use]
    pub const fn comment() -> Self {
        Self::Comment
    }

    /// Implements the `ToString` functionality for the `TokenKind`.
    #[must_use]
    pub fn to_string(&self, interner: &Interner) -> String {
        match *self {
            Self::BooleanLiteral((val, _)) => val.to_string(),
            Self::EOF => "end of file".to_owned(),
            Self::IdentifierName((ident, _)) => interner.resolve_expect(ident).to_string(),
            Self::PrivateIdentifier(ident) => format!("#{}", interner.resolve_expect(ident)),
            Self::Keyword((word, _)) => word.to_string(),
            Self::NullLiteral(_) => "null".to_owned(),
            Self::NumericLiteral(Numeric::Rational(num)) => num.to_string(),
            Self::NumericLiteral(Numeric::Integer(num)) => num.to_string(),
            Self::NumericLiteral(Numeric::BigInt(ref num)) => format!("{num}n"),
            Self::Punctuator(punc) => punc.to_string(),
            Self::StringLiteral((lit, _)) => interner.resolve_expect(lit).to_string(),
            Self::TemplateNoSubstitution(ts) | Self::TemplateMiddle(ts) => {
                interner.resolve_expect(ts.raw()).to_string()
            }
            Self::RegularExpressionLiteral(body, flags) => {
                format!(
                    "/{}/{}",
                    interner.resolve_expect(body),
                    interner.resolve_expect(flags),
                )
            }
            Self::LineTerminator => "line terminator".to_owned(),
            Self::Comment => "comment".to_owned(),
        }
    }
}

bitflags! {
    /// Indicates the set of escape sequences a string contains.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub struct EscapeSequence: u8 {
        /// A legacy escape sequence starting with `0` - `7`.
        ///
        /// More information:
        ///  - [ECMAScript reference][spec]
        ///
        /// [spec]: https://tc39.es/ecma262/#prod-LegacyOctalEscapeSequence
        const LEGACY_OCTAL = 0b0000_0001;

        /// A octal escape sequence starting with `8` - `9`.
        ///
        /// More information:
        ///  - [ECMAScript reference][spec]
        ///
        /// [spec]: https://tc39.es/ecma262/#prod-NonOctalDecimalEscapeSequence
        const NON_OCTAL_DECIMAL = 0b0000_0010;

        /// A generic escape sequence, either single (`\t`), unicode (`\u1238`)
        /// or a line continuation (`\<LF>`)
        ///
        /// More information:
        /// - [ECMAScript reference][spec]
        ///
        /// [spec]: https://tc39.es/ecma262/#prod-LineContinuation
        const OTHER = 0b0000_0100;
    }

}

/// Indicates if an identifier contains an escape sequence.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ContainsEscapeSequence(pub bool);
