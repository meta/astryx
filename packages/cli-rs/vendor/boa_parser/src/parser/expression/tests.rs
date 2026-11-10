use crate::parser::tests::{check_invalid_script, check_script_parser};
use boa_ast::{
    Declaration, Expression, LinearPosition, LinearSpan, Span, Statement, StatementList,
    declaration::{LexicalDeclaration, Variable},
    expression::{
        Call, Identifier, Parenthesized, RegExpLiteral,
        literal::Literal,
        operator::{
            Assign, Binary,
            assign::AssignOp,
            binary::{ArithmeticOp, BitwiseOp, LogicalOp, RelationalOp},
        },
    },
    function::{AsyncArrowFunction, FormalParameter, FormalParameterList, FunctionBody},
};
use boa_interner::{Interner, Sym};
use boa_macros::utf16;

/// Checks numeric operations
#[test]
fn check_numeric_operations() {
    let interner = &mut Interner::default();
    check_script_parser(
        "a + b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Add.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a+1",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Add.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Literal::new(1, Span::new((1, 3), (1, 4))).into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a - b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Sub.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a-1",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Sub.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Literal::new(1, Span::new((1, 3), (1, 4))).into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a / b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Div.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a/2",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Div.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Literal::new(2, Span::new((1, 3), (1, 4))).into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "let myRegex = /=/;",
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("myRegex", utf16!("myRegex")),
                        Span::new((1, 5), (1, 12)),
                    ),
                    Some(
                        RegExpLiteral::new(
                            interner.get_or_intern_static("=", utf16!("=")),
                            Sym::EMPTY_STRING,
                            Span::new((1, 15), (1, 18)),
                        )
                        .into(),
                    ),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "fn(/=/);",
        vec![
            Statement::Expression(
                Call::new(
                    Identifier::new(
                        interner.get_or_intern_static("fn", utf16!("fn")),
                        Span::new((1, 1), (1, 3)),
                    )
                    .into(),
                    vec![
                        RegExpLiteral::new(
                            interner.get_or_intern_static("=", utf16!("=")),
                            Sym::EMPTY_STRING,
                            Span::new((1, 4), (1, 7)),
                        )
                        .into(),
                    ]
                    .into(),
                    Span::new((1, 3), (1, 8)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "fn(a / b);",
        vec![
            Statement::Expression(
                Call::new(
                    Identifier::new(
                        interner.get_or_intern_static("fn", utf16!("fn")),
                        Span::new((1, 1), (1, 3)),
                    )
                    .into(),
                    vec![Expression::from(Binary::new(
                        ArithmeticOp::Div.into(),
                        Identifier::new(
                            interner.get_or_intern_static("a", utf16!("a")),
                            Span::new((1, 4), (1, 5)),
                        )
                        .into(),
                        Identifier::new(
                            interner.get_or_intern_static("b", utf16!("b")),
                            Span::new((1, 8), (1, 9)),
                        )
                        .into(),
                    ))]
                    .into(),
                    Span::new((1, 3), (1, 10)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "fn(a) / b;",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Div.into(),
                Call::new(
                    Identifier::new(
                        interner.get_or_intern_static("fn", utf16!("fn")),
                        Span::new((1, 1), (1, 3)),
                    )
                    .into(),
                    vec![
                        Identifier::new(
                            interner.get_or_intern_static("a", utf16!("a")),
                            Span::new((1, 4), (1, 5)),
                        )
                        .into(),
                    ]
                    .into(),
                    Span::new((1, 3), (1, 6)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 9), (1, 10)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a * b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Mul.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a*2",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Mul.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Literal::new(2, Span::new((1, 3), (1, 4))).into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a ** b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Exp.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a**2",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Exp.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Literal::new(2, Span::new((1, 4), (1, 5))).into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a % b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Mod.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a%2",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Mod.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Literal::new(2, Span::new((1, 3), (1, 4))).into(),
            )))
            .into(),
        ],
        interner,
    );
}

// Checks complex numeric operations.
#[test]
fn check_complex_numeric_operations() {
    let interner = &mut Interner::default();
    check_script_parser(
        "a + d*(b-3)+1",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                ArithmeticOp::Add.into(),
                Binary::new(
                    ArithmeticOp::Add.into(),
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 1), (1, 2)),
                    )
                    .into(),
                    Binary::new(
                        ArithmeticOp::Mul.into(),
                        Identifier::new(
                            interner.get_or_intern_static("d", utf16!("d")),
                            Span::new((1, 5), (1, 6)),
                        )
                        .into(),
                        Parenthesized::new(
                            Binary::new(
                                ArithmeticOp::Sub.into(),
                                Identifier::new(
                                    interner.get_or_intern_static("b", utf16!("b")),
                                    Span::new((1, 8), (1, 9)),
                                )
                                .into(),
                                Literal::new(3, Span::new((1, 10), (1, 11))).into(),
                            )
                            .into(),
                            Span::new((1, 7), (1, 12)),
                        )
                        .into(),
                    )
                    .into(),
                )
                .into(),
                Literal::new(1, Span::new((1, 13), (1, 14))).into(),
            )))
            .into(),
        ],
        interner,
    );
}

/// Checks bitwise operations.
#[test]
fn check_bitwise_operations() {
    let interner = &mut Interner::default();
    check_script_parser(
        "a & b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                BitwiseOp::And.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a&b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                BitwiseOp::And.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 3), (1, 4)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a | b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                BitwiseOp::Or.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a|b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                BitwiseOp::Or.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 3), (1, 4)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a ^ b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                BitwiseOp::Xor.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a^b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                BitwiseOp::Xor.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 3), (1, 4)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a << b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                BitwiseOp::Shl.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a<<b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                BitwiseOp::Shl.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 4), (1, 5)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a >> b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                BitwiseOp::Shr.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a>>b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                BitwiseOp::Shr.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 4), (1, 5)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );
}

/// Checks assignment operations.
#[test]
fn check_assign_operations() {
    let interner = &mut Interner::default();
    check_script_parser(
        "a += b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Add,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a -= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Sub,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a *= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Mul,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a **= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Exp,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 7), (1, 8)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a /= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Div,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a %= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Mod,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a &= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::And,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a |= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Or,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a ^= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Xor,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a <<= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Shl,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 7), (1, 8)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a >>= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Shr,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 7), (1, 8)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a >>>= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Ushr,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 8), (1, 9)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a %= 10 / 2",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Mod,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Binary::new(
                    ArithmeticOp::Div.into(),
                    Literal::new(10, Span::new((1, 6), (1, 8))).into(),
                    Literal::new(2, Span::new((1, 11), (1, 12))).into(),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a ??= b",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Coalesce,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 7), (1, 8)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_relational_operations() {
    let interner = &mut Interner::default();
    check_script_parser(
        "a < b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                RelationalOp::LessThan.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a > b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                RelationalOp::GreaterThan.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a <= b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                RelationalOp::LessThanOrEqual.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a >= b",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                RelationalOp::GreaterThanOrEqual.into(),
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "p in o",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                RelationalOp::In.into(),
                Identifier::new(
                    interner.get_or_intern_static("p", utf16!("p")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("o", utf16!("o")),
                    Span::new((1, 6), (1, 7)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_logical_expressions() {
    let interner = &mut Interner::default();
    check_script_parser(
        "a && b || c && d || e",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                LogicalOp::Or.into(),
                Binary::new(
                    LogicalOp::And.into(),
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 1), (1, 2)),
                    )
                    .into(),
                    Identifier::new(
                        interner.get_or_intern_static("b", utf16!("b")),
                        Span::new((1, 6), (1, 7)),
                    )
                    .into(),
                )
                .into(),
                Binary::new(
                    LogicalOp::Or.into(),
                    Binary::new(
                        LogicalOp::And.into(),
                        Identifier::new(
                            interner.get_or_intern_static("c", utf16!("c")),
                            Span::new((1, 11), (1, 12)),
                        )
                        .into(),
                        Identifier::new(
                            interner.get_or_intern_static("d", utf16!("d")),
                            Span::new((1, 16), (1, 17)),
                        )
                        .into(),
                    )
                    .into(),
                    Identifier::new(
                        interner.get_or_intern_static("e", utf16!("e")),
                        Span::new((1, 21), (1, 22)),
                    )
                    .into(),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "a ?? b ?? c",
        vec![
            Statement::Expression(Expression::from(Binary::new(
                LogicalOp::Coalesce.into(),
                Binary::new(
                    LogicalOp::Coalesce.into(),
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 1), (1, 2)),
                    )
                    .into(),
                    Identifier::new(
                        interner.get_or_intern_static("b", utf16!("b")),
                        Span::new((1, 6), (1, 7)),
                    )
                    .into(),
                )
                .into(),
                Identifier::new(
                    interner.get_or_intern_static("c", utf16!("c")),
                    Span::new((1, 11), (1, 12)),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );

    check_invalid_script("a ?? b && c");
    check_invalid_script("a && b ?? c");
    check_invalid_script("a ?? b || c");
    check_invalid_script("a || b ?? c");
}

#[test]
fn parse_async_arrow_function_named_of() {
    let interner = &mut Interner::default();
    check_script_parser(
        "async of => {}",
        vec![
            Statement::Expression(
                AsyncArrowFunction::new(
                    None,
                    FormalParameterList::from_parameters(vec![FormalParameter::new(
                        Variable::from_identifier(
                            Identifier::new(
                                interner.get_or_intern_static("of", utf16!("of")),
                                Span::new((1, 7), (1, 9)),
                            ),
                            None,
                        ),
                        false,
                    )]),
                    FunctionBody::new(StatementList::default(), Span::new((1, 13), (1, 15))),
                    LinearSpan::new(LinearPosition::default(), LinearPosition::default()),
                    Span::new((1, 1), (1, 15)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

macro_rules! check_non_reserved_identifier {
    ($keyword:literal) => {{
        let interner = &mut Interner::default();
        let input = format!("({})", $keyword);

        #[allow(clippy::cast_possible_truncation)]
        let input_end = input.len() as u32 + 1;

        check_script_parser(
            input.as_str(),
            vec![
                Statement::Expression(
                    Parenthesized::new(
                        Identifier::new(
                            interner.get_or_intern_static($keyword, utf16!($keyword)),
                            Span::new((1, 2), (1, input_end - 1)),
                        )
                        .into(),
                        Span::new((1, 1), (1, input_end)),
                    )
                    .into(),
                )
                .into(),
            ],
            interner,
        );
    }};
}

#[test]
fn check_non_reserved_identifiers() {
    // https://tc39.es/ecma262/#sec-keywords-and-reserved-words
    // Those that are always allowed as identifiers, but also appear as
    // keywords within certain syntactic productions, at places where
    // Identifier is not allowed: as, async, from, get, meta, of, set,
    // and target.

    check_non_reserved_identifier!("as");
    check_non_reserved_identifier!("async");
    check_non_reserved_identifier!("from");
    check_non_reserved_identifier!("get");
    check_non_reserved_identifier!("meta");
    check_non_reserved_identifier!("of");
    check_non_reserved_identifier!("set");
    check_non_reserved_identifier!("target");
}
