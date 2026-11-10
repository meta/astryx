use crate::parser::tests::{check_invalid_script, check_script_parser};
use boa_ast::{
    Declaration, Span, StatementList,
    declaration::{LexicalDeclaration, Variable},
    expression::{
        Identifier,
        literal::{Literal, ObjectLiteral, ObjectMethodDefinition, PropertyDefinition},
    },
    function::{FormalParameter, FormalParameterList, FormalParameterListFlags, FunctionBody},
    property::MethodDefinitionKind,
};
use boa_interner::{Interner, Sym};
use boa_macros::utf16;
use indoc::indoc;

const PSEUDO_LINEAR_POS: boa_ast::LinearPosition = boa_ast::LinearPosition::new(0);

/// Checks object literal parsing.
#[test]
fn check_object_literal() {
    let interner = &mut Interner::default();

    let object_properties = vec![
        PropertyDefinition::Property(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((2, 5), (2, 6)),
            )
            .into(),
            Literal::new(true, Span::new((2, 8), (2, 12))).into(),
        ),
        PropertyDefinition::Property(
            Identifier::new(
                interner.get_or_intern_static("b", utf16!("b")),
                Span::new((3, 5), (3, 6)),
            )
            .into(),
            Literal::new(false, Span::new((3, 8), (3, 13))).into(),
        ),
    ];

    check_script_parser(
        indoc! {"
            const x = {
                a: true,
                b: false,
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (4, 2))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

/// Tests short function syntax.
#[test]
fn check_object_short_function() {
    let interner = &mut Interner::default();

    let object_properties = vec![
        PropertyDefinition::Property(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((2, 5), (2, 6)),
            )
            .into(),
            Literal::new(true, Span::new((2, 8), (2, 12))).into(),
        ),
        PropertyDefinition::MethodDefinition(ObjectMethodDefinition::new(
            Identifier::new(
                interner.get_or_intern_static("b", utf16!("b")),
                Span::new((3, 5), (3, 6)),
            )
            .into(),
            FormalParameterList::default(),
            FunctionBody::new(StatementList::default(), Span::new((3, 9), (3, 11))),
            MethodDefinitionKind::Ordinary,
            PSEUDO_LINEAR_POS,
        )),
    ];

    check_script_parser(
        indoc! {"
            const x = {
                a: true,
                b() {},
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (4, 2))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

/// Testing short function syntax with arguments.
#[test]
fn check_object_short_function_arguments() {
    let interner = &mut Interner::default();

    let parameters = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(
            Identifier::new(
                interner.get_or_intern_static("test", utf16!("test")),
                Span::new((3, 7), (3, 11)),
            ),
            None,
        ),
        false,
    ));

    assert_eq!(parameters.flags(), FormalParameterListFlags::default());
    assert_eq!(parameters.length(), 1);

    let object_properties = vec![
        PropertyDefinition::Property(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((2, 5), (2, 6)),
            )
            .into(),
            Literal::new(true, Span::new((2, 8), (2, 12))).into(),
        ),
        PropertyDefinition::MethodDefinition(ObjectMethodDefinition::new(
            Identifier::new(
                interner.get_or_intern_static("b", utf16!("b")),
                Span::new((3, 5), (3, 6)),
            )
            .into(),
            parameters,
            FunctionBody::new(StatementList::default(), Span::new((3, 13), (3, 15))),
            MethodDefinitionKind::Ordinary,
            PSEUDO_LINEAR_POS,
        )),
    ];

    check_script_parser(
        indoc! {"
            const x = {
                a: true,
                b(test) {}
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (4, 2))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_object_getter() {
    let interner = &mut Interner::default();

    let object_properties = vec![
        PropertyDefinition::Property(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((2, 5), (2, 6)),
            )
            .into(),
            Literal::new(true, Span::new((2, 8), (2, 12))).into(),
        ),
        PropertyDefinition::MethodDefinition(ObjectMethodDefinition::new(
            Identifier::new(
                interner.get_or_intern_static("b", utf16!("b")),
                Span::new((3, 9), (3, 10)),
            )
            .into(),
            FormalParameterList::default(),
            FunctionBody::new(StatementList::default(), Span::new((3, 13), (3, 15))),
            MethodDefinitionKind::Get,
            PSEUDO_LINEAR_POS,
        )),
    ];

    check_script_parser(
        indoc! {"
            const x = {
                a: true,
                get b() {}
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (4, 2))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_object_setter() {
    let interner = &mut Interner::default();

    let params = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(
            Identifier::new(
                interner.get_or_intern_static("test", utf16!("test")),
                Span::new((3, 11), (3, 15)),
            ),
            None,
        ),
        false,
    ));

    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 1);

    let object_properties = vec![
        PropertyDefinition::Property(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((2, 5), (2, 6)),
            )
            .into(),
            Literal::new(true, Span::new((2, 8), (2, 12))).into(),
        ),
        PropertyDefinition::MethodDefinition(ObjectMethodDefinition::new(
            Identifier::new(
                interner.get_or_intern_static("b", utf16!("b")),
                Span::new((3, 9), (3, 10)),
            )
            .into(),
            params,
            FunctionBody::new(StatementList::default(), Span::new((3, 17), (3, 19))),
            MethodDefinitionKind::Set,
            PSEUDO_LINEAR_POS,
        )),
    ];

    check_script_parser(
        indoc! {"
            const x = {
                a: true,
                set b(test) {}
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (4, 2))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_object_short_function_get() {
    let interner = &mut Interner::default();

    let object_properties = vec![PropertyDefinition::MethodDefinition(
        ObjectMethodDefinition::new(
            Identifier::new(Sym::GET, Span::new((2, 5), (2, 8))).into(),
            FormalParameterList::default(),
            FunctionBody::new(StatementList::default(), Span::new((2, 11), (2, 13))),
            MethodDefinitionKind::Ordinary,
            PSEUDO_LINEAR_POS,
        ),
    )];

    check_script_parser(
        indoc! {"
            const x = {
                get() {}
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (3, 2))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_object_short_function_set() {
    let interner = &mut Interner::default();

    let object_properties = vec![PropertyDefinition::MethodDefinition(
        ObjectMethodDefinition::new(
            Identifier::new(Sym::SET, Span::new((2, 5), (2, 8))).into(),
            FormalParameterList::default(),
            FunctionBody::new(StatementList::default(), Span::new((2, 11), (2, 13))),
            MethodDefinitionKind::Ordinary,
            PSEUDO_LINEAR_POS,
        ),
    )];

    check_script_parser(
        indoc! {"
            const x = {
                set() {}
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (3, 2))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_object_shorthand_property_names() {
    let interner = &mut Interner::default();

    let object_properties = vec![PropertyDefinition::IdentifierReference(Identifier::new(
        interner.get_or_intern_static("a", utf16!("a")),
        Span::new((2, 13), (2, 14)),
    ))];

    check_script_parser(
        indoc! {"
            const a = true;
            const x = { a };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(Literal::new(true, Span::new((1, 11), (1, 15))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((2, 7), (2, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((2, 11), (2, 16))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_object_shorthand_multiple_properties() {
    let interner = &mut Interner::default();

    let object_properties = vec![
        PropertyDefinition::IdentifierReference(Identifier::new(
            interner.get_or_intern_static("a", utf16!("a")),
            Span::new((3, 13), (3, 14)),
        )),
        PropertyDefinition::IdentifierReference(Identifier::new(
            interner.get_or_intern_static("b", utf16!("b")),
            Span::new((3, 16), (3, 17)),
        )),
    ];

    check_script_parser(
        indoc! {"
            const a = true;
            const b = false;
            const x = { a, b, };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(Literal::new(true, Span::new((1, 11), (1, 15))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("b", utf16!("b")),
                        Span::new((2, 7), (2, 8)),
                    ),
                    Some(Literal::new(false, Span::new((2, 11), (2, 16))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((3, 7), (3, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((3, 11), (3, 20))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_object_spread() {
    let interner = &mut Interner::default();

    let object_properties = vec![
        PropertyDefinition::Property(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((1, 13), (1, 14)),
            )
            .into(),
            Literal::new(1, Span::new((1, 16), (1, 17))).into(),
        ),
        PropertyDefinition::SpreadObject(
            Identifier::new(
                interner.get_or_intern_static("b", utf16!("b")),
                Span::new((1, 22), (1, 23)),
            )
            .into(),
        ),
    ];

    check_script_parser(
        "const x = { a: 1, ...b };",
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (1, 25))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_async_method() {
    let interner = &mut Interner::default();

    let object_properties = vec![PropertyDefinition::MethodDefinition(
        ObjectMethodDefinition::new(
            Identifier::new(
                interner.get_or_intern_static("dive", utf16!("dive")),
                Span::new((2, 11), (2, 15)),
            )
            .into(),
            FormalParameterList::default(),
            FunctionBody::new(StatementList::default(), Span::new((2, 18), (2, 20))),
            MethodDefinitionKind::Async,
            PSEUDO_LINEAR_POS,
        ),
    )];

    check_script_parser(
        indoc! {"
            const x = {
                async dive() {}
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (3, 2))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_async_generator_method() {
    let interner = &mut Interner::default();

    let object_properties = vec![PropertyDefinition::MethodDefinition(
        ObjectMethodDefinition::new(
            Identifier::new(
                interner.get_or_intern_static("vroom", utf16!("vroom")),
                Span::new((2, 12), (2, 17)),
            )
            .into(),
            FormalParameterList::default(),
            FunctionBody::new(StatementList::default(), Span::new((2, 20), (2, 22))),
            MethodDefinitionKind::AsyncGenerator,
            PSEUDO_LINEAR_POS,
        ),
    )];

    check_script_parser(
        indoc! {"
            const x = {
                async* vroom() {}
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (3, 2))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_async_method_lineterminator() {
    check_invalid_script(
        "const x = {
            async
            dive(){}
        };
        ",
    );
}

#[test]
fn check_async_gen_method_lineterminator() {
    check_invalid_script(
        "const x = {
            async
            * vroom() {}
        };
        ",
    );
}

#[test]
fn check_async_ordinary_method() {
    let interner = &mut Interner::default();

    let object_properties = vec![PropertyDefinition::MethodDefinition(
        ObjectMethodDefinition::new(
            Identifier::new(
                interner.get_or_intern_static("async", utf16!("async")),
                Span::new((2, 5), (2, 10)),
            )
            .into(),
            FormalParameterList::default(),
            FunctionBody::new(StatementList::default(), Span::new((2, 13), (2, 15))),
            MethodDefinitionKind::Ordinary,
            PSEUDO_LINEAR_POS,
        ),
    )];

    check_script_parser(
        indoc! {r#"
            const x = {
                async() {}
            };
        "#},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (3, 2))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_async_property() {
    let interner = &mut Interner::default();

    let object_properties = vec![PropertyDefinition::Property(
        Identifier::new(
            interner.get_or_intern_static("async", utf16!("async")),
            Span::new((2, 5), (2, 10)),
        )
        .into(),
        Literal::new(true, Span::new((2, 12), (2, 16))).into(),
    )];

    check_script_parser(
        indoc! {"
            const x = {
                async: true
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 7), (1, 8)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 11), (3, 2))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}
