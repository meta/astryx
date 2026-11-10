//! This module implements lexing for number literals (123, 787) used in ECMAScript.

use crate::lexer::{Cursor, Error, Token, TokenKind, Tokenizer, token::Numeric};
use crate::source::ReadChar;
use boa_ast::PositionGroup;
use boa_interner::Interner;
use num_bigint::BigInt;
use num_traits::{ToPrimitive, Zero};
use std::str;

/// Number literal lexing.
///
/// Assumes the digit is consumed by the cursor (stored in init).
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-literals-numeric-literals
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type
#[derive(Debug, Clone, Copy)]
pub(super) struct NumberLiteral {
    init: u8,
}

impl NumberLiteral {
    /// Creates a new string literal lexer.
    pub(super) const fn new(init: u8) -> Self {
        Self { init }
    }
}

/// This is a helper structure
///
/// This structure helps with identifying what numerical type it is and what base is it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NumericKind {
    Rational,
    Integer(u32),
    BigInt(u32),
}

impl NumericKind {
    /// Get the base of the number kind.
    const fn base(self) -> u32 {
        match self {
            Self::Rational => 10,
            Self::Integer(base) | Self::BigInt(base) => base,
        }
    }

    /// Converts `self` to `BigInt` kind.
    fn to_bigint(self) -> Self {
        match self {
            Self::Rational => unreachable!("can not convert rational number to BigInt"),
            Self::Integer(base) | Self::BigInt(base) => Self::BigInt(base),
        }
    }
}

fn take_signed_integer<R>(
    buf: &mut Vec<u8>,
    cursor: &mut Cursor<R>,
    kind: NumericKind,
) -> Result<(), Error>
where
    R: ReadChar,
{
    // The next part must be SignedInteger.
    // This is optionally a '+' or '-' followed by 1 or more DecimalDigits.
    match cursor.next_char()? {
        Some(0x2B /* + */) => {
            buf.push(b'+');
            if !cursor.next_is_ascii_pred(&|ch| ch.is_digit(kind.base()))? {
                // A digit must follow the + or - symbol.
                return Err(Error::syntax("No digit found after + symbol", cursor.pos()));
            }
        }
        Some(0x2D /* - */) => {
            buf.push(b'-');
            if !cursor.next_is_ascii_pred(&|ch| ch.is_digit(kind.base()))? {
                // A digit must follow the + or - symbol.
                return Err(Error::syntax("No digit found after - symbol", cursor.pos()));
            }
        }
        Some(c) => {
            if let Some(ch) = char::from_u32(c) {
                if ch.is_ascii() && ch.is_digit(kind.base()) {
                    #[allow(clippy::cast_possible_truncation)]
                    buf.push(c as u8);
                } else {
                    return Err(Error::syntax(
                        "When lexing exponential value found unexpected char",
                        cursor.pos(),
                    ));
                }
            } else {
                return Err(Error::syntax(
                    "When lexing exponential value found unexpected char",
                    cursor.pos(),
                ));
            }
        }
        None => {
            return Err(Error::syntax(
                "Abrupt end: No exponential value found",
                cursor.pos(),
            ));
        }
    }

    // Consume the decimal digits.
    take_integer(buf, cursor, kind, true)?;

    Ok(())
}

fn take_integer<R>(
    buf: &mut Vec<u8>,
    cursor: &mut Cursor<R>,
    kind: NumericKind,
    separator_allowed: bool,
) -> Result<(), Error>
where
    R: ReadChar,
{
    let mut prev_is_underscore = false;
    let mut pos = cursor.pos();
    while cursor.next_is_ascii_pred(&|c| c.is_digit(kind.base()) || c == '_')? {
        pos = cursor.pos();
        match cursor.next_char()? {
            Some(0x5F /* _ */) if separator_allowed => {
                if prev_is_underscore {
                    return Err(Error::syntax(
                        "only one underscore is allowed as numeric separator",
                        cursor.pos(),
                    ));
                }
                prev_is_underscore = true;
            }
            Some(0x5F /* _ */) if !separator_allowed => {
                return Err(Error::syntax("separator is not allowed", pos));
            }
            Some(c) if char::from_u32(c).is_some_and(|ch| ch.is_digit(kind.base())) => {
                prev_is_underscore = false;
                #[allow(clippy::cast_possible_truncation)]
                buf.push(c as u8);
            }
            _ => (),
        }
    }
    if prev_is_underscore {
        return Err(Error::syntax(
            "underscores are not allowed at the end of numeric literals",
            pos,
        ));
    }
    Ok(())
}

/// Utility function for checking the `NumericLiteral` is not followed by an `IdentifierStart` or `DecimalDigit` character.
///
/// More information:
///  - [ECMAScript Specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-literals-numeric-literals
fn check_after_numeric_literal<R>(cursor: &mut Cursor<R>) -> Result<(), Error>
where
    R: ReadChar,
{
    if cursor.next_is_ascii_pred(&|ch| ch.is_ascii_alphanumeric() || ch == '$' || ch == '_')? {
        Err(Error::syntax(
            "a numeric literal must not be followed by an alphanumeric, $ or _ characters",
            cursor.pos(),
        ))
    } else {
        Ok(())
    }
}

impl<R> Tokenizer<R> for NumberLiteral {
    fn lex(
        &mut self,
        cursor: &mut Cursor<R>,
        start_pos: PositionGroup,
        _interner: &mut Interner,
    ) -> Result<Token, Error>
    where
        R: ReadChar,
    {
        let mut buf = vec![self.init];

        // Default assume the number is a base 10 integer.
        let mut kind = NumericKind::Integer(10);

        let c = cursor.peek_char();
        let mut legacy_octal = false;

        if self.init == b'0' {
            if let Some(ch) = c? {
                match ch {
                    // x | X
                    0x0078 | 0x0058 => {
                        // Remove the initial '0' from buffer.
                        cursor.next_char()?.expect("x or X character vanished");
                        buf.pop();

                        // HexIntegerLiteral
                        kind = NumericKind::Integer(16);

                        // Checks if the next char after '0x' is a digit of that base. if not return an error.
                        if !cursor.next_is_ascii_pred(&|ch| ch.is_ascii_hexdigit())? {
                            return Err(Error::syntax(
                                "expected hexadecimal digit after number base prefix",
                                cursor.pos(),
                            ));
                        }
                    }
                    // o | O
                    0x006F | 0x004F => {
                        // Remove the initial '0' from buffer.
                        cursor.next_char()?.expect("o or O character vanished");
                        buf.pop();

                        // OctalIntegerLiteral
                        kind = NumericKind::Integer(8);

                        // Checks if the next char after '0o' is a digit of that base. if not return an error.
                        if !cursor.next_is_ascii_pred(&|ch| ch.is_digit(8))? {
                            return Err(Error::syntax(
                                "expected octal digit after number base prefix",
                                cursor.pos(),
                            ));
                        }
                    }
                    // b | B
                    0x0062 | 0x0042 => {
                        // Remove the initial '0' from buffer.
                        cursor.next_char()?.expect("b or B character vanished");
                        buf.pop();

                        // BinaryIntegerLiteral
                        kind = NumericKind::Integer(2);

                        // Checks if the next char after '0b' is a digit of that base. if not return an error.
                        if !cursor.next_is_ascii_pred(&|ch| ch.is_digit(2))? {
                            return Err(Error::syntax(
                                "expected binary digit after number base prefix",
                                cursor.pos(),
                            ));
                        }
                    }
                    // n
                    0x006E => {
                        cursor.next_char()?.expect("n character vanished");

                        // DecimalBigIntegerLiteral '0n'
                        return Ok(Token::new_by_position_group(
                            TokenKind::NumericLiteral(Numeric::BigInt(BigInt::zero().into())),
                            start_pos,
                            cursor.pos_group(),
                        ));
                    }
                    byte => {
                        legacy_octal = true;
                        if let Some(ch) = char::from_u32(byte) {
                            if ch.is_digit(8) {
                                // LegacyOctalIntegerLiteral, or a number with leading 0s.
                                if cursor.strict() {
                                    // LegacyOctalIntegerLiteral is forbidden with strict mode true.
                                    return Err(Error::syntax(
                                        "implicit octal literals are not allowed in strict mode",
                                        start_pos,
                                    ));
                                }

                                // Remove the initial '0' from buffer.
                                buf.pop();

                                #[allow(clippy::cast_possible_truncation)]
                                buf.push(cursor.next_char()?.expect("'0' character vanished") as u8);

                                take_integer(&mut buf, cursor, NumericKind::Integer(8), false)?;

                                if !cursor
                                    .next_is_ascii_pred(&|c| c.is_ascii_digit() || c == '_')?
                                {
                                    // LegacyOctalIntegerLiteral
                                    kind = NumericKind::Integer(8);
                                }
                            } else if ch.is_ascii_digit() {
                                // Indicates a numerical digit comes after then 0 but it isn't an octal digit
                                // so therefore this must be a number with an unneeded leading 0. This is
                                // forbidden in strict mode.
                                if cursor.strict() {
                                    return Err(Error::syntax(
                                        "leading 0's are not allowed in strict mode",
                                        start_pos,
                                    ));
                                }
                            }
                        } // Else indicates that the symbol is a non-number.
                    }
                }
            } else {
                // DecimalLiteral lexing.
                // Indicates that the number is just a single 0.
                return Ok(Token::new_by_position_group(
                    TokenKind::NumericLiteral(Numeric::Integer(0)),
                    start_pos,
                    cursor.pos_group(),
                ));
            }
        }

        let next = if self.init == b'.' {
            Some(0x002E /* . */)
        } else {
            // Consume digits and separators until a non-digit non-separator
            // character is encountered or all the characters are consumed.
            take_integer(&mut buf, cursor, kind, !legacy_octal)?;
            cursor.peek_char()?
        };

        // The non-digit character could be:
        // 'n' To indicate a BigIntLiteralSuffix.
        // '.' To indicate a decimal separator.
        // 'e' | 'E' To indicate an ExponentPart.
        match next {
            Some(0x006E /* n */) => {
                // DecimalBigIntegerLiteral
                // Lexing finished.
                // Consume the n
                if legacy_octal {
                    return Err(Error::syntax(
                        "'n' suffix not allowed in octal representation",
                        cursor.pos(),
                    ));
                }
                cursor.next_char()?.expect("n character vanished");

                kind = kind.to_bigint();
            }
            Some(0x002E /* . */) => {
                if kind.base() == 10 {
                    // Only base 10 numbers can have a decimal separator.
                    // Number literal lexing finished if a . is found for a number in a different base.
                    if self.init != b'.' {
                        cursor.next_char()?.expect("'.' token vanished");
                        buf.push(b'.'); // Consume the .
                    }
                    kind = NumericKind::Rational;

                    if cursor.peek_char()? == Some(0x005F /* _ */) {
                        return Err(Error::syntax(
                            "numeric separator not allowed after '.'",
                            cursor.pos(),
                        ));
                    }

                    // Consume digits and separators until a non-digit non-separator
                    // character is encountered or all the characters are consumed.
                    take_integer(&mut buf, cursor, kind, true)?;

                    // The non-digit character at this point must be an 'e' or 'E' to indicate an Exponent Part.
                    // Another '.' or 'n' is not allowed.
                    if let Some(0x0065 /*e */ | 0x0045 /* E */) = cursor.peek_char()? {
                        // Consume the ExponentIndicator.
                        cursor.next_char()?.expect("e or E token vanished");

                        buf.push(b'E');

                        take_signed_integer(&mut buf, cursor, kind)?;
                    } else {
                        // Finished lexing.
                    }
                }
            }
            Some(0x0065 /*e */ | 0x0045 /* E */) => {
                kind = NumericKind::Rational;
                cursor.next_char()?.expect("e or E character vanished"); // Consume the ExponentIndicator.
                buf.push(b'E');
                take_signed_integer(&mut buf, cursor, kind)?;
            }
            Some(_) | None => {
                // Indicates lexing finished.
            }
        }

        check_after_numeric_literal(cursor)?;

        let num_str = unsafe { str::from_utf8_unchecked(buf.as_slice()) };
        let num = match kind {
            NumericKind::BigInt(base) => {
                Numeric::BigInt(
                    BigInt::parse_bytes(num_str.as_bytes(), base).expect("Could not convert to BigInt").into()
                    )
            }
            // casting precisely to check if the float doesn't lose info on truncation
            #[allow(clippy::cast_possible_truncation)]
            NumericKind::Rational /* base: 10 */ => {
                let val: f64 = fast_float2::parse(num_str).expect("Failed to parse float after checks");
                let int_val = val as i32;

                // The truncated float should be identically to the non-truncated float for the conversion to be loss-less,
                // any other different and the number must be stored as a rational.
                #[allow(clippy::float_cmp)]
                if f64::from(int_val) == val {
                    // For performance reasons we attempt to store values as integers if possible.
                    Numeric::Integer(int_val)
                } else {
                    Numeric::Rational(val)
                }
            },
            NumericKind::Integer(base) => {
                i32::from_str_radix(num_str, base).map_or_else(|_| {
                    let num = BigInt::parse_bytes(num_str.as_bytes(), base).expect("Failed to parse integer after checks");
                    Numeric::Rational(num.to_f64().unwrap_or(f64::INFINITY))
                }, Numeric::Integer)
            }
        };

        Ok(Token::new_by_position_group(
            TokenKind::NumericLiteral(num),
            start_pos,
            cursor.pos_group(),
        ))
    }
}
