// ! Tests for array initializer parsing.

use crate::parser::tests::check_script_parser;
use boa_ast::{
    Span, Statement,
    expression::literal::{ArrayLiteral, Literal},
};
use boa_interner::{Interner, Sym};
use boa_macros::utf16;

/// Checks an empty array.
#[test]
fn check_empty() {
    check_script_parser(
        "[]",
        vec![
            Statement::Expression(
                ArrayLiteral::new(vec![], false, Span::new((1, 1), (1, 3))).into(),
            )
            .into(),
        ],
        &mut Interner::default(),
    );
}

/// Checks an array with empty slot.
#[test]
fn check_empty_slot() {
    check_script_parser(
        "[,]",
        vec![
            Statement::Expression(
                ArrayLiteral::new(vec![None], false, Span::new((1, 1), (1, 4))).into(),
            )
            .into(),
        ],
        &mut Interner::default(),
    );
}

/// Checks a numeric array.
#[test]
fn check_numeric_array() {
    check_script_parser(
        "[1, 2, 3]",
        vec![
            Statement::Expression(
                ArrayLiteral::new(
                    vec![
                        Some(Literal::new(1, Span::new((1, 2), (1, 3))).into()),
                        Some(Literal::new(2, Span::new((1, 5), (1, 6))).into()),
                        Some(Literal::new(3, Span::new((1, 8), (1, 9))).into()),
                    ],
                    false,
                    Span::new((1, 1), (1, 10)),
                )
                .into(),
            )
            .into(),
        ],
        &mut Interner::default(),
    );
}

// Checks a numeric array with trailing comma
#[test]
fn check_numeric_array_trailing() {
    check_script_parser(
        "[1, 2, 3,]",
        vec![
            Statement::Expression(
                ArrayLiteral::new(
                    vec![
                        Some(Literal::new(1, Span::new((1, 2), (1, 3))).into()),
                        Some(Literal::new(2, Span::new((1, 5), (1, 6))).into()),
                        Some(Literal::new(3, Span::new((1, 8), (1, 9))).into()),
                    ],
                    false,
                    Span::new((1, 1), (1, 11)),
                )
                .into(),
            )
            .into(),
        ],
        &mut Interner::default(),
    );
}

/// Checks a numeric array with an elision.
#[test]
fn check_numeric_array_elision() {
    check_script_parser(
        "[1, 2, , 3]",
        vec![
            Statement::Expression(
                ArrayLiteral::new(
                    vec![
                        Some(Literal::new(1, Span::new((1, 2), (1, 3))).into()),
                        Some(Literal::new(2, Span::new((1, 5), (1, 6))).into()),
                        None,
                        Some(Literal::new(3, Span::new((1, 10), (1, 11))).into()),
                    ],
                    false,
                    Span::new((1, 1), (1, 12)),
                )
                .into(),
            )
            .into(),
        ],
        &mut Interner::default(),
    );
}

/// Checks a numeric array with repeated elisions.
#[test]
fn check_numeric_array_repeated_elision() {
    check_script_parser(
        "[1, 2, ,, 3]",
        vec![
            Statement::Expression(
                ArrayLiteral::new(
                    vec![
                        Some(Literal::new(1, Span::new((1, 2), (1, 3))).into()),
                        Some(Literal::new(2, Span::new((1, 5), (1, 6))).into()),
                        None,
                        None,
                        Some(Literal::new(3, Span::new((1, 11), (1, 12))).into()),
                    ],
                    false,
                    Span::new((1, 1), (1, 13)),
                )
                .into(),
            )
            .into(),
        ],
        &mut Interner::default(),
    );
}

/// Checks a combined array.
#[test]
fn check_combined() {
    let interner = &mut Interner::default();
    check_script_parser(
        r#"[1, "a", 2]"#,
        vec![
            Statement::Expression(
                ArrayLiteral::new(
                    vec![
                        Some(Literal::new(1, Span::new((1, 2), (1, 3))).into()),
                        Some(
                            Literal::new(
                                interner.get_or_intern_static("a", utf16!("a")),
                                Span::new((1, 5), (1, 8)),
                            )
                            .into(),
                        ),
                        Some(Literal::new(2, Span::new((1, 10), (1, 11))).into()),
                    ],
                    false,
                    Span::new((1, 1), (1, 12)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

/// Checks a combined array with an empty string
#[test]
fn check_combined_empty_str() {
    check_script_parser(
        r#"[1, "", 2]"#,
        vec![
            Statement::Expression(
                ArrayLiteral::new(
                    vec![
                        Some(Literal::new(1, Span::new((1, 2), (1, 3))).into()),
                        Some(Literal::new(Sym::EMPTY_STRING, Span::new((1, 5), (1, 7))).into()),
                        Some(Literal::new(2, Span::new((1, 9), (1, 10))).into()),
                    ],
                    false,
                    Span::new((1, 1), (1, 11)),
                )
                .into(),
            )
            .into(),
        ],
        &mut Interner::default(),
    );
}

#[test]
fn check_elision_start_end() {
    check_script_parser(
        "[, 1 , , ]",
        vec![
            Statement::Expression(
                ArrayLiteral::new(
                    vec![
                        None,
                        Some(Literal::new(1, Span::new((1, 4), (1, 5))).into()),
                        None,
                    ],
                    false,
                    Span::new((1, 1), (1, 11)),
                )
                .into(),
            )
            .into(),
        ],
        &mut Interner::default(),
    );
}
