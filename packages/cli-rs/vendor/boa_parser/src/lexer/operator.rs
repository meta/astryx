//! Boa's lexing for ECMAScript operators (+, - etc.).

use crate::lexer::{Cursor, Error, Token, TokenKind, Tokenizer};
use crate::source::ReadChar;
use boa_ast::{PositionGroup, Punctuator};
use boa_interner::Interner;

const CHAR_ASSIGN: u32 = '=' as u32;

/// `vop` tests the next token to see if we're on an assign operation of just a plain binary operation.
///
/// If the next value is not an assignment operation it will pattern match  the provided values and return the corresponding token.
macro_rules! vop {
    ($cursor:ident, $assign_op:expr, $op:expr) => ({
        match $cursor.peek_char()? {
            None => $op,
            Some(CHAR_ASSIGN) => {
                $cursor.next_char()?.expect("= token vanished");
                $assign_op
            }
            Some(_) => $op,
        }
    });
    ($cursor:ident, $assign_op:expr, $op:expr, {$($case:pat => $block:expr), +}) => ({
        match $cursor.peek_char()? {
            None => $op,
            Some(CHAR_ASSIGN) => {
                $cursor.next_char()?.expect("= token vanished");
                $assign_op
            },
            $($case => {
                $cursor.next_char()?.expect("Token vanished");
                $block
            })+,
            Some(_) => $op,
        }
    });
}

/// The `op` macro handles binary operations or assignment operations and converts them into tokens.
macro_rules! op {
    ($cursor:ident, $start_pos:expr, $assign_op:expr, $op:expr) => ({
        Token::new_by_position_group(
            vop!($cursor, $assign_op, $op).into(),
            $start_pos, $cursor.pos_group(),
        )
    });
    ($cursor:ident, $start_pos:expr, $assign_op:expr, $op:expr, {$($case:pat => $block:expr),+}) => ({
        let punc: Punctuator = vop!($cursor, $assign_op, $op, {$($case => $block),+});
        Token::new_by_position_group(
            punc.into(),
            $start_pos, $cursor.pos_group(),
        )
    });
}

#[derive(Debug, Clone, Copy)]
pub(super) struct Operator {
    init: u8,
}

/// Operator lexing.
///
/// Assumes that the cursor has already consumed the operator starting symbol (stored in init).
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-ecmascript-language-expressions
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators
impl Operator {
    /// Creates a new operator lexer.
    pub(super) const fn new(init: u8) -> Self {
        Self { init }
    }
}

impl<R> Tokenizer<R> for Operator {
    fn lex(
        &mut self,
        cursor: &mut Cursor<R>,
        start_pos: PositionGroup,
        _interner: &mut Interner,
    ) -> Result<Token, Error>
    where
        R: ReadChar,
    {
        Ok(match self.init {
            b'*' => op!(cursor, start_pos, Punctuator::AssignMul, Punctuator::Mul, {
                Some(0x2A /* * */) => vop!(cursor, Punctuator::AssignPow, Punctuator::Exp)
            }),
            b'+' => op!(cursor, start_pos, Punctuator::AssignAdd, Punctuator::Add, {
                Some(0x2B /* + */) => Punctuator::Inc
            }),
            b'-' => op!(cursor, start_pos, Punctuator::AssignSub, Punctuator::Sub, {
                Some(0x2D /* - */) => Punctuator::Dec
            }),
            b'%' => op!(cursor, start_pos, Punctuator::AssignMod, Punctuator::Mod),
            b'|' => op!(cursor, start_pos, Punctuator::AssignOr, Punctuator::Or, {
                Some(0x7C /* | */) => vop!(cursor, Punctuator::AssignBoolOr, Punctuator::BoolOr)
            }),
            b'&' => op!(cursor, start_pos, Punctuator::AssignAnd, Punctuator::And, {
                Some(0x26 /* & */) => vop!(cursor, Punctuator::AssignBoolAnd, Punctuator::BoolAnd)
            }),
            b'?' => {
                let (first, second) = (cursor.peek_char()?, cursor.peek_n(2)?[1]);
                match first {
                    Some(0x3F /* ? */) => {
                        cursor.next_char()?.expect("? vanished");
                        op!(
                            cursor,
                            start_pos,
                            Punctuator::AssignCoalesce,
                            Punctuator::Coalesce
                        )
                    }
                    Some(0x2E /* . */) if !matches!(second, Some(second) if (0x30..=0x39 /* 0..=9 */).contains(&second)) =>
                    {
                        cursor.next_char()?.expect(". vanished");
                        Token::new_by_position_group(
                            TokenKind::Punctuator(Punctuator::Optional),
                            start_pos,
                            cursor.pos_group(),
                        )
                    }
                    _ => Token::new_by_position_group(
                        TokenKind::Punctuator(Punctuator::Question),
                        start_pos,
                        cursor.pos_group(),
                    ),
                }
            }
            b'^' => op!(cursor, start_pos, Punctuator::AssignXor, Punctuator::Xor),
            b'=' => op!(cursor, start_pos, if cursor.next_if(0x3D /* = */)? {
                Punctuator::StrictEq
            } else {
                Punctuator::Eq
            }, Punctuator::Assign, {
                Some(0x3E /* > */) => {
                    Punctuator::Arrow
                }
            }),
            b'<' => {
                op!(cursor, start_pos, Punctuator::LessThanOrEq, Punctuator::LessThan, {
                    Some(0x3C /* < */) => vop!(cursor, Punctuator::AssignLeftSh, Punctuator::LeftSh)
                })
            }
            b'>' => {
                op!(cursor, start_pos, Punctuator::GreaterThanOrEq, Punctuator::GreaterThan, {
                    Some(0x3E /* > */) => vop!(cursor, Punctuator::AssignRightSh, Punctuator::RightSh, {
                        Some(0x3E /* > */) => vop!(cursor, Punctuator::AssignURightSh, Punctuator::URightSh)
                    })
                })
            }
            b'!' => op!(
                cursor,
                start_pos,
                vop!(cursor, Punctuator::StrictNotEq, Punctuator::NotEq),
                Punctuator::Not
            ),
            b'~' => {
                Token::new_by_position_group(Punctuator::Neg.into(), start_pos, cursor.pos_group())
            }
            op => {
                return Err(Error::unexpected(
                    char::from(op),
                    "expected valid operator",
                    start_pos.position(),
                ));
            }
        })
    }
}
