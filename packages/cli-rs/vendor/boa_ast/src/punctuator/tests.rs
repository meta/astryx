#![allow(clippy::cognitive_complexity)]

use super::*;

/// Gets an iterator over all the existing punctuators.
fn all_punctuators() -> impl Iterator<Item = Punctuator> {
    [
        Punctuator::Add,
        Punctuator::And,
        Punctuator::Arrow,
        Punctuator::Assign,
        Punctuator::AssignAdd,
        Punctuator::AssignAnd,
        Punctuator::AssignBoolAnd,
        Punctuator::AssignBoolOr,
        Punctuator::AssignCoalesce,
        Punctuator::AssignDiv,
        Punctuator::AssignLeftSh,
        Punctuator::AssignMod,
        Punctuator::AssignMul,
        Punctuator::AssignOr,
        Punctuator::AssignPow,
        Punctuator::AssignRightSh,
        Punctuator::AssignSub,
        Punctuator::AssignURightSh,
        Punctuator::AssignXor,
        Punctuator::BoolAnd,
        Punctuator::BoolOr,
        Punctuator::CloseBlock,
        Punctuator::CloseBracket,
        Punctuator::CloseParen,
        Punctuator::Coalesce,
        Punctuator::Colon,
        Punctuator::Comma,
        Punctuator::Dec,
        Punctuator::Div,
        Punctuator::Dot,
        Punctuator::Eq,
        Punctuator::GreaterThan,
        Punctuator::GreaterThanOrEq,
        Punctuator::Inc,
        Punctuator::LeftSh,
        Punctuator::LessThan,
        Punctuator::LessThanOrEq,
        Punctuator::Mod,
        Punctuator::Mul,
        Punctuator::Neg,
        Punctuator::Not,
        Punctuator::NotEq,
        Punctuator::OpenBlock,
        Punctuator::OpenBracket,
        Punctuator::OpenParen,
        Punctuator::Optional,
        Punctuator::Or,
        Punctuator::Exp,
        Punctuator::Question,
        Punctuator::RightSh,
        Punctuator::Semicolon,
        Punctuator::Spread,
        Punctuator::StrictEq,
        Punctuator::StrictNotEq,
        Punctuator::Sub,
        Punctuator::URightSh,
        Punctuator::Xor,
    ]
    .into_iter()
}

#[test]
fn as_assign_op() {
    for p in all_punctuators() {
        match p.as_assign_op() {
            Some(AssignOp::Assign) => assert_eq!(p, Punctuator::Assign),
            Some(AssignOp::Add) => assert_eq!(p, Punctuator::AssignAdd),
            Some(AssignOp::And) => assert_eq!(p, Punctuator::AssignAnd),
            Some(AssignOp::BoolAnd) => assert_eq!(p, Punctuator::AssignBoolAnd),
            Some(AssignOp::BoolOr) => assert_eq!(p, Punctuator::AssignBoolOr),
            Some(AssignOp::Coalesce) => assert_eq!(p, Punctuator::AssignCoalesce),
            Some(AssignOp::Div) => assert_eq!(p, Punctuator::AssignDiv),
            Some(AssignOp::Shl) => assert_eq!(p, Punctuator::AssignLeftSh),
            Some(AssignOp::Mod) => assert_eq!(p, Punctuator::AssignMod),
            Some(AssignOp::Mul) => assert_eq!(p, Punctuator::AssignMul),
            Some(AssignOp::Or) => assert_eq!(p, Punctuator::AssignOr),
            Some(AssignOp::Exp) => assert_eq!(p, Punctuator::AssignPow),
            Some(AssignOp::Shr) => assert_eq!(p, Punctuator::AssignRightSh),
            Some(AssignOp::Sub) => assert_eq!(p, Punctuator::AssignSub),
            Some(AssignOp::Ushr) => assert_eq!(p, Punctuator::AssignURightSh),
            Some(AssignOp::Xor) => assert_eq!(p, Punctuator::AssignXor),
            None => assert!(
                ![
                    Punctuator::Assign,
                    Punctuator::AssignAdd,
                    Punctuator::AssignAnd,
                    Punctuator::AssignBoolAnd,
                    Punctuator::AssignBoolOr,
                    Punctuator::AssignCoalesce,
                    Punctuator::AssignDiv,
                    Punctuator::AssignLeftSh,
                    Punctuator::AssignMod,
                    Punctuator::AssignMul,
                    Punctuator::AssignOr,
                    Punctuator::AssignPow,
                    Punctuator::AssignRightSh,
                    Punctuator::AssignSub,
                    Punctuator::AssignURightSh,
                    Punctuator::AssignXor,
                ]
                .contains(&p)
            ),
        }
    }
}

#[test]
fn as_binary_op() {
    for p in all_punctuators() {
        match p.as_binary_op() {
            Some(BinaryOp::Arithmetic(ArithmeticOp::Add)) => assert_eq!(p, Punctuator::Add),
            Some(BinaryOp::Arithmetic(ArithmeticOp::Sub)) => assert_eq!(p, Punctuator::Sub),
            Some(BinaryOp::Arithmetic(ArithmeticOp::Mul)) => assert_eq!(p, Punctuator::Mul),
            Some(BinaryOp::Arithmetic(ArithmeticOp::Div)) => assert_eq!(p, Punctuator::Div),
            Some(BinaryOp::Arithmetic(ArithmeticOp::Mod)) => assert_eq!(p, Punctuator::Mod),
            Some(BinaryOp::Bitwise(BitwiseOp::And)) => assert_eq!(p, Punctuator::And),
            Some(BinaryOp::Bitwise(BitwiseOp::Or)) => assert_eq!(p, Punctuator::Or),
            Some(BinaryOp::Bitwise(BitwiseOp::Xor)) => assert_eq!(p, Punctuator::Xor),
            Some(BinaryOp::Logical(LogicalOp::And)) => assert_eq!(p, Punctuator::BoolAnd),
            Some(BinaryOp::Logical(LogicalOp::Or)) => assert_eq!(p, Punctuator::BoolOr),
            Some(BinaryOp::Logical(LogicalOp::Coalesce)) => assert_eq!(p, Punctuator::Coalesce),
            Some(BinaryOp::Relational(RelationalOp::Equal)) => assert_eq!(p, Punctuator::Eq),
            Some(BinaryOp::Relational(RelationalOp::NotEqual)) => assert_eq!(p, Punctuator::NotEq),
            Some(BinaryOp::Relational(RelationalOp::StrictEqual)) => {
                assert_eq!(p, Punctuator::StrictEq);
            }
            Some(BinaryOp::Relational(RelationalOp::StrictNotEqual)) => {
                assert_eq!(p, Punctuator::StrictNotEq);
            }
            Some(BinaryOp::Relational(RelationalOp::LessThan)) => {
                assert_eq!(p, Punctuator::LessThan);
            }
            Some(BinaryOp::Relational(RelationalOp::GreaterThan)) => {
                assert_eq!(p, Punctuator::GreaterThan);
            }
            Some(BinaryOp::Relational(RelationalOp::GreaterThanOrEqual)) => {
                assert_eq!(p, Punctuator::GreaterThanOrEq);
            }
            Some(BinaryOp::Relational(RelationalOp::LessThanOrEqual)) => {
                assert_eq!(p, Punctuator::LessThanOrEq);
            }
            Some(BinaryOp::Bitwise(BitwiseOp::Shl)) => assert_eq!(p, Punctuator::LeftSh),
            Some(BinaryOp::Bitwise(BitwiseOp::Shr)) => assert_eq!(p, Punctuator::RightSh),
            Some(BinaryOp::Bitwise(BitwiseOp::UShr)) => assert_eq!(p, Punctuator::URightSh),
            Some(BinaryOp::Comma) => assert_eq!(p, Punctuator::Comma),
            Some(BinaryOp::Arithmetic(ArithmeticOp::Exp)) => {
                assert_eq!(p, Punctuator::Exp);
            }
            None => assert!(
                ![
                    Punctuator::Add,
                    Punctuator::Sub,
                    Punctuator::Mul,
                    Punctuator::Div,
                    Punctuator::Mod,
                    Punctuator::And,
                    Punctuator::Or,
                    Punctuator::Xor,
                    Punctuator::BoolAnd,
                    Punctuator::BoolOr,
                    Punctuator::Coalesce,
                    Punctuator::Eq,
                    Punctuator::NotEq,
                    Punctuator::StrictEq,
                    Punctuator::StrictNotEq,
                    Punctuator::LessThan,
                    Punctuator::GreaterThan,
                    Punctuator::GreaterThanOrEq,
                    Punctuator::LessThanOrEq,
                    Punctuator::LeftSh,
                    Punctuator::RightSh,
                    Punctuator::URightSh,
                    Punctuator::Comma
                ]
                .contains(&p)
            ),
            Some(BinaryOp::Relational(RelationalOp::In | RelationalOp::InstanceOf)) => {
                unreachable!()
            }
        }
    }
}

#[test]
fn as_str() {
    for p in all_punctuators() {
        match p.as_str() {
            "+" => assert_eq!(p, Punctuator::Add),
            "&" => assert_eq!(p, Punctuator::And),
            "=>" => assert_eq!(p, Punctuator::Arrow),
            "=" => assert_eq!(p, Punctuator::Assign),
            "+=" => assert_eq!(p, Punctuator::AssignAdd),
            "&=" => assert_eq!(p, Punctuator::AssignAnd),
            "&&=" => assert_eq!(p, Punctuator::AssignBoolAnd),
            "||=" => assert_eq!(p, Punctuator::AssignBoolOr),
            "??=" => assert_eq!(p, Punctuator::AssignCoalesce),
            "/=" => assert_eq!(p, Punctuator::AssignDiv),
            "<<=" => assert_eq!(p, Punctuator::AssignLeftSh),
            "%=" => assert_eq!(p, Punctuator::AssignMod),
            "*=" => assert_eq!(p, Punctuator::AssignMul),
            "|=" => assert_eq!(p, Punctuator::AssignOr),
            "**=" => assert_eq!(p, Punctuator::AssignPow),
            ">>=" => assert_eq!(p, Punctuator::AssignRightSh),
            "-=" => assert_eq!(p, Punctuator::AssignSub),
            ">>>=" => assert_eq!(p, Punctuator::AssignURightSh),
            "^=" => assert_eq!(p, Punctuator::AssignXor),
            "&&" => assert_eq!(p, Punctuator::BoolAnd),
            "||" => assert_eq!(p, Punctuator::BoolOr),
            "??" => assert_eq!(p, Punctuator::Coalesce),
            "}" => assert_eq!(p, Punctuator::CloseBlock),
            "]" => assert_eq!(p, Punctuator::CloseBracket),
            ")" => assert_eq!(p, Punctuator::CloseParen),
            ":" => assert_eq!(p, Punctuator::Colon),
            "," => assert_eq!(p, Punctuator::Comma),
            "--" => assert_eq!(p, Punctuator::Dec),
            "/" => assert_eq!(p, Punctuator::Div),
            "." => assert_eq!(p, Punctuator::Dot),
            "==" => assert_eq!(p, Punctuator::Eq),
            ">" => assert_eq!(p, Punctuator::GreaterThan),
            ">=" => assert_eq!(p, Punctuator::GreaterThanOrEq),
            "++" => assert_eq!(p, Punctuator::Inc),
            "<<" => assert_eq!(p, Punctuator::LeftSh),
            "<" => assert_eq!(p, Punctuator::LessThan),
            "<=" => assert_eq!(p, Punctuator::LessThanOrEq),
            "%" => assert_eq!(p, Punctuator::Mod),
            "*" => assert_eq!(p, Punctuator::Mul),
            "~" => assert_eq!(p, Punctuator::Neg),
            "!" => assert_eq!(p, Punctuator::Not),
            "!=" => assert_eq!(p, Punctuator::NotEq),
            "{" => assert_eq!(p, Punctuator::OpenBlock),
            "[" => assert_eq!(p, Punctuator::OpenBracket),
            "(" => assert_eq!(p, Punctuator::OpenParen),
            "?." => assert_eq!(p, Punctuator::Optional),
            "|" => assert_eq!(p, Punctuator::Or),
            "**" => assert_eq!(p, Punctuator::Exp),
            "?" => assert_eq!(p, Punctuator::Question),
            ">>" => assert_eq!(p, Punctuator::RightSh),
            ";" => assert_eq!(p, Punctuator::Semicolon),
            "..." => assert_eq!(p, Punctuator::Spread),
            "===" => assert_eq!(p, Punctuator::StrictEq),
            "!==" => assert_eq!(p, Punctuator::StrictNotEq),
            "-" => assert_eq!(p, Punctuator::Sub),
            ">>>" => assert_eq!(p, Punctuator::URightSh),
            "^" => assert_eq!(p, Punctuator::Xor),
            _ => unreachable!("unknown punctuator {p:?} found"),
        }
    }
}

#[test]
fn try_into_assign_op() {
    for p in all_punctuators() {
        if p.as_assign_op().is_some() {
            assert!(TryInto::<AssignOp>::try_into(p).is_ok());
        } else {
            assert!(TryInto::<AssignOp>::try_into(p).is_err());
        }
    }
}

#[test]
fn try_into_binary_op() {
    for p in all_punctuators() {
        if p.as_binary_op().is_some() {
            assert!(TryInto::<BinaryOp>::try_into(p).is_ok());
        } else {
            assert!(TryInto::<BinaryOp>::try_into(p).is_err());
        }
    }
}

#[test]
fn display() {
    for p in all_punctuators() {
        assert_eq!(p.as_str(), p.to_string());
    }
}

#[test]
fn into_box() {
    for p in all_punctuators() {
        assert_eq!(p.as_str(), Box::<str>::from(p).as_ref());
    }
}
