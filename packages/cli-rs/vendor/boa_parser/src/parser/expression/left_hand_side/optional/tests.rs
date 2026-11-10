use crate::parser::tests::{check_invalid_script, check_script_parser};

use boa_ast::{
    Span, Statement,
    expression::{
        Identifier, Optional, OptionalOperation, OptionalOperationKind,
        access::PropertyAccessField, literal::Literal,
    },
};
use boa_interner::Interner;
use boa_macros::utf16;

#[test]
fn simple() {
    let interner = &mut Interner::default();

    check_script_parser(
        r#"5?.name"#,
        vec![
            Statement::Expression(
                Optional::new(
                    Literal::new(5, Span::new((1, 1), (1, 2))).into(),
                    vec![OptionalOperation::new(
                        OptionalOperationKind::SimplePropertyAccess {
                            field: Identifier::new(
                                interner.get_or_intern_static("name", utf16!("name")),
                                Span::new((1, 4), (1, 8)),
                            )
                            .into(),
                        },
                        true,
                        Span::new((1, 2), (1, 8)),
                    )]
                    .into(),
                    Span::new((1, 1), (1, 8)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

#[test]
fn complex_chain() {
    let interner = &mut Interner::default();

    check_script_parser(
        r#"a?.b(true)?.["c"]"#,
        vec![
            Statement::Expression(
                Optional::new(
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 1), (1, 2)),
                    )
                    .into(),
                    vec![
                        OptionalOperation::new(
                            OptionalOperationKind::SimplePropertyAccess {
                                field: Identifier::new(
                                    interner.get_or_intern_static("b", utf16!("b")),
                                    Span::new((1, 4), (1, 5)),
                                )
                                .into(),
                            },
                            true,
                            Span::new((1, 2), (1, 5)),
                        ),
                        OptionalOperation::new(
                            OptionalOperationKind::Call {
                                args: vec![Literal::new(true, Span::new((1, 6), (1, 10))).into()]
                                    .into(),
                            },
                            false,
                            Span::new((1, 5), (1, 11)),
                        ),
                        OptionalOperation::new(
                            OptionalOperationKind::SimplePropertyAccess {
                                field: PropertyAccessField::Expr(Box::new(
                                    Literal::new(
                                        interner.get_or_intern_static("c", utf16!("c")),
                                        Span::new((1, 14), (1, 17)),
                                    )
                                    .into(),
                                )),
                            },
                            true,
                            Span::new((1, 11), (1, 18)),
                        ),
                    ]
                    .into(),
                    Span::new((1, 1), (1, 18)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

#[test]
fn reject_templates() {
    check_invalid_script("console.log?.`Hello`");
    check_invalid_script("console?.log`Hello`");
    check_invalid_script(
        r#"
const a = console?.log
`Hello`"#,
    );
}

#[test]
fn private_identifier_early_error() {
    check_invalid_script("this?.#a");
    check_invalid_script("this.#a");
    check_invalid_script("this?.a?.#a");
    check_invalid_script("this.a.#a");
}
