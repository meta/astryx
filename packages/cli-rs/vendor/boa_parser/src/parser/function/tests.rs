use crate::parser::tests::{check_invalid_script, check_script_parser};
use boa_ast::{
    Declaration, Span, Statement, StatementList, StatementListItem,
    declaration::{LexicalDeclaration, Variable},
    expression::{
        Identifier,
        operator::{Binary, binary::ArithmeticOp},
    },
    function::{
        ArrowFunction, FormalParameter, FormalParameterList, FormalParameterListFlags,
        FunctionBody, FunctionDeclaration,
    },
    statement::Return,
};
use boa_interner::Interner;
use boa_macros::utf16;

const PSEUDO_LINEAR_POS: boa_ast::LinearPosition = boa_ast::LinearPosition::new(0);
const EMPTY_LINEAR_SPAN: boa_ast::LinearSpan =
    boa_ast::LinearSpan::new(PSEUDO_LINEAR_POS, PSEUDO_LINEAR_POS);

/// Checks basic function declaration parsing.
#[test]
fn check_basic() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((1, 14), (1, 15)),
            ),
            None,
        ),
        false,
    ));
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 1);

    check_script_parser(
        "function foo(a) { return a; }",
        vec![
            Declaration::FunctionDeclaration(FunctionDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("foo", utf16!("foo")),
                    Span::new((1, 10), (1, 13)),
                ),
                params,
                FunctionBody::new(
                    StatementList::new(
                        [StatementListItem::Statement(
                            Statement::Return(Return::new(Some(
                                Identifier::new(
                                    interner.get_or_intern_static("a", utf16!("a")),
                                    Span::new((1, 26), (1, 27)),
                                )
                                .into(),
                            )))
                            .into(),
                        )],
                        PSEUDO_LINEAR_POS,
                        false,
                    ),
                    Span::new((1, 17), (1, 30)),
                ),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );
}

/// Checks if duplicate parameter names are allowed with strict mode off.
#[test]
fn check_duplicates_strict_off() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(vec![
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 14), (1, 15)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 17), (1, 18)),
                ),
                None,
            ),
            false,
        ),
    ]);
    assert_eq!(
        params.flags(),
        FormalParameterListFlags::default().union(FormalParameterListFlags::HAS_DUPLICATES)
    );
    assert_eq!(params.length(), 2);
    check_script_parser(
        "function foo(a, a) { return a; }",
        vec![
            Declaration::FunctionDeclaration(FunctionDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("foo", utf16!("foo")),
                    Span::new((1, 10), (1, 13)),
                ),
                params,
                FunctionBody::new(
                    StatementList::new(
                        [StatementListItem::Statement(
                            Statement::Return(Return::new(Some(
                                Identifier::new(
                                    interner.get_or_intern_static("a", utf16!("a")),
                                    Span::new((1, 29), (1, 30)),
                                )
                                .into(),
                            )))
                            .into(),
                        )],
                        PSEUDO_LINEAR_POS,
                        false,
                    ),
                    Span::new((1, 20), (1, 33)),
                ),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );
}

/// Checks if duplicate parameter names are an error with strict mode on.
#[test]
fn check_duplicates_strict_on() {
    check_invalid_script("'use strict'; function foo(a, a) {}");
}

/// Checks basic function declaration parsing with automatic semicolon insertion.
#[test]
fn check_basic_semicolon_insertion() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((1, 14), (1, 15)),
            ),
            None,
        ),
        false,
    ));
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 1);

    check_script_parser(
        "function foo(a) { return a }",
        vec![
            Declaration::FunctionDeclaration(FunctionDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("foo", utf16!("foo")),
                    Span::new((1, 10), (1, 13)),
                ),
                params,
                FunctionBody::new(
                    StatementList::new(
                        [StatementListItem::Statement(
                            Statement::Return(Return::new(Some(
                                Identifier::new(
                                    interner.get_or_intern_static("a", utf16!("a")),
                                    Span::new((1, 26), (1, 27)),
                                )
                                .into(),
                            )))
                            .into(),
                        )],
                        PSEUDO_LINEAR_POS,
                        false,
                    ),
                    Span::new((1, 17), (1, 29)),
                ),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );
}

/// Checks functions with empty returns.
#[test]
fn check_empty_return() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((1, 14), (1, 15)),
            ),
            None,
        ),
        false,
    ));
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 1);
    check_script_parser(
        "function foo(a) { return; }",
        vec![
            Declaration::FunctionDeclaration(FunctionDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("foo", utf16!("foo")),
                    Span::new((1, 10), (1, 13)),
                ),
                params,
                FunctionBody::new(
                    StatementList::new(
                        [StatementListItem::Statement(
                            Statement::Return(Return::new(None)).into(),
                        )],
                        PSEUDO_LINEAR_POS,
                        false,
                    ),
                    Span::new((1, 17), (1, 28)),
                ),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );
}

/// Checks functions with empty returns without semicolon
#[test]
fn check_empty_return_semicolon_insertion() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((1, 14), (1, 15)),
            ),
            None,
        ),
        false,
    ));
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 1);
    check_script_parser(
        "function foo(a) { return }",
        vec![
            Declaration::FunctionDeclaration(FunctionDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("foo", utf16!("foo")),
                    Span::new((1, 10), (1, 13)),
                ),
                params,
                FunctionBody::new(
                    StatementList::new(
                        [StatementListItem::Statement(
                            Statement::Return(Return::new(None)).into(),
                        )],
                        PSEUDO_LINEAR_POS,
                        false,
                    ),
                    Span::new((1, 17), (1, 27)),
                ),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );
}

/// Checks rest operator parsing.
#[test]
fn check_rest_operator() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(vec![
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 14), (1, 15)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 20), (1, 21)),
                ),
                None,
            ),
            true,
        ),
    ]);
    assert_eq!(
        params.flags(),
        FormalParameterListFlags::empty().union(FormalParameterListFlags::HAS_REST_PARAMETER)
    );
    assert_eq!(params.length(), 1);
    check_script_parser(
        "function foo(a, ...b) {}",
        vec![
            Declaration::FunctionDeclaration(FunctionDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("foo", utf16!("foo")),
                    Span::new((1, 10), (1, 13)),
                ),
                params,
                FunctionBody::new(StatementList::default(), Span::new((1, 23), (1, 25))),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );
}

/// Checks an arrow function with only a rest parameter.
#[test]
fn check_arrow_only_rest() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((1, 5), (1, 6)),
            ),
            None,
        ),
        true,
    ));
    assert_eq!(
        params.flags(),
        FormalParameterListFlags::empty().union(FormalParameterListFlags::HAS_REST_PARAMETER)
    );
    assert_eq!(params.length(), 0);
    check_script_parser(
        "(...a) => {}",
        vec![
            Statement::Expression(
                ArrowFunction::new(
                    None,
                    params,
                    FunctionBody::new(StatementList::default(), Span::new((1, 11), (1, 13))),
                    EMPTY_LINEAR_SPAN,
                    Span::new((1, 1), (1, 13)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

/// Checks an arrow function with a rest parameter.
#[test]
fn check_arrow_rest() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(vec![
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 2), (1, 3)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("c", utf16!("c")),
                    Span::new((1, 11), (1, 12)),
                ),
                None,
            ),
            true,
        ),
    ]);
    assert_eq!(
        params.flags(),
        FormalParameterListFlags::empty().union(FormalParameterListFlags::HAS_REST_PARAMETER)
    );
    assert_eq!(params.length(), 2);
    check_script_parser(
        "(a, b, ...c) => {}",
        vec![
            Statement::Expression(
                ArrowFunction::new(
                    None,
                    params,
                    FunctionBody::new(StatementList::default(), Span::new((1, 17), (1, 19))),
                    EMPTY_LINEAR_SPAN,
                    Span::new((1, 1), (1, 19)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

/// Checks an arrow function with expression return.
#[test]
fn check_arrow() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(vec![
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 2), (1, 3)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                ),
                None,
            ),
            false,
        ),
    ]);
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 2);
    check_script_parser(
        "(a, b) => { return a + b; }",
        vec![
            Statement::Expression(
                ArrowFunction::new(
                    None,
                    params,
                    FunctionBody::new(
                        StatementList::new(
                            [StatementListItem::Statement(
                                Statement::Return(Return::new(Some(
                                    Binary::new(
                                        ArithmeticOp::Add.into(),
                                        Identifier::new(
                                            interner.get_or_intern_static("a", utf16!("a")),
                                            Span::new((1, 20), (1, 21)),
                                        )
                                        .into(),
                                        Identifier::new(
                                            interner.get_or_intern_static("b", utf16!("b")),
                                            Span::new((1, 24), (1, 25)),
                                        )
                                        .into(),
                                    )
                                    .into(),
                                )))
                                .into(),
                            )],
                            PSEUDO_LINEAR_POS,
                            false,
                        ),
                        Span::new((1, 11), (1, 28)),
                    ),
                    EMPTY_LINEAR_SPAN,
                    Span::new((1, 1), (1, 28)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

/// Checks an arrow function with expression return and automatic semicolon insertion
#[test]
fn check_arrow_semicolon_insertion() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(vec![
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 2), (1, 3)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                ),
                None,
            ),
            false,
        ),
    ]);
    check_script_parser(
        "(a, b) => { return a + b }",
        vec![
            Statement::Expression(
                ArrowFunction::new(
                    None,
                    params,
                    FunctionBody::new(
                        StatementList::new(
                            [StatementListItem::Statement(
                                Statement::Return(Return::new(Some(
                                    Binary::new(
                                        ArithmeticOp::Add.into(),
                                        Identifier::new(
                                            interner.get_or_intern_static("a", utf16!("a")),
                                            Span::new((1, 20), (1, 21)),
                                        )
                                        .into(),
                                        Identifier::new(
                                            interner.get_or_intern_static("b", utf16!("b")),
                                            Span::new((1, 24), (1, 25)),
                                        )
                                        .into(),
                                    )
                                    .into(),
                                )))
                                .into(),
                            )],
                            PSEUDO_LINEAR_POS,
                            false,
                        ),
                        Span::new((1, 11), (1, 27)),
                    ),
                    EMPTY_LINEAR_SPAN,
                    Span::new((1, 1), (1, 27)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

/// Checks arrow function with empty return
#[test]
fn check_arrow_empty_return() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(vec![
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 2), (1, 3)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                ),
                None,
            ),
            false,
        ),
    ]);
    check_script_parser(
        "(a, b) => { return; }",
        vec![
            Statement::Expression(
                ArrowFunction::new(
                    None,
                    params,
                    FunctionBody::new(
                        StatementList::new(
                            [StatementListItem::Statement(
                                Statement::Return(Return::new(None)).into(),
                            )],
                            PSEUDO_LINEAR_POS,
                            false,
                        ),
                        Span::new((1, 11), (1, 22)),
                    ),
                    EMPTY_LINEAR_SPAN,
                    Span::new((1, 1), (1, 22)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

/// Checks an arrow function with empty return, with automatic semicolon insertion.
#[test]
fn check_arrow_empty_return_semicolon_insertion() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(vec![
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 2), (1, 3)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 5), (1, 6)),
                ),
                None,
            ),
            false,
        ),
    ]);
    check_script_parser(
        "(a, b) => { return }",
        vec![
            Statement::Expression(
                ArrowFunction::new(
                    None,
                    params,
                    FunctionBody::new(
                        StatementList::new(
                            [StatementListItem::Statement(
                                Statement::Return(Return::new(None)).into(),
                            )],
                            PSEUDO_LINEAR_POS,
                            false,
                        ),
                        Span::new((1, 11), (1, 21)),
                    ),
                    EMPTY_LINEAR_SPAN,
                    Span::new((1, 1), (1, 21)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_arrow_assignment() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((1, 12), (1, 13)),
            ),
            None,
        ),
        false,
    ));
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 1);
    check_script_parser(
        "let foo = (a) => { return a };",
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("foo", utf16!("foo")),
                        Span::new((1, 5), (1, 8)),
                    ),
                    Some(
                        ArrowFunction::new(
                            Some(Identifier::new(
                                interner.get_or_intern_static("foo", utf16!("foo")),
                                Span::new((1, 5), (1, 8)),
                            )),
                            params,
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Return(Return::new(Some(
                                            Identifier::new(
                                                interner.get_or_intern_static("a", utf16!("a")),
                                                Span::new((1, 27), (1, 28)),
                                            )
                                            .into(),
                                        )))
                                        .into(),
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 18), (1, 30)),
                            ),
                            EMPTY_LINEAR_SPAN,
                            Span::new((1, 11), (1, 30)),
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
}

#[test]
fn check_arrow_assignment_nobrackets() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((1, 12), (1, 13)),
            ),
            None,
        ),
        false,
    ));
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 1);
    check_script_parser(
        "let foo = (a) => a;",
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("foo", utf16!("foo")),
                        Span::new((1, 5), (1, 8)),
                    ),
                    Some(
                        ArrowFunction::new(
                            Some(Identifier::new(
                                interner.get_or_intern_static("foo", utf16!("foo")),
                                Span::new((1, 5), (1, 8)),
                            )),
                            params,
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Return(Return::new(Some(
                                            Identifier::new(
                                                interner.get_or_intern_static("a", utf16!("a")),
                                                Span::new((1, 18), (1, 19)),
                                            )
                                            .into(),
                                        )))
                                        .into(),
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 18), (1, 19)),
                            ),
                            EMPTY_LINEAR_SPAN,
                            Span::new((1, 11), (1, 19)),
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
}

#[test]
fn check_arrow_assignment_noparenthesis() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((1, 11), (1, 12)),
            ),
            None,
        ),
        false,
    ));
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 1);
    check_script_parser(
        "let foo = a => { return a };",
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("foo", utf16!("foo")),
                        Span::new((1, 5), (1, 8)),
                    ),
                    Some(
                        ArrowFunction::new(
                            Some(Identifier::new(
                                interner.get_or_intern_static("foo", utf16!("foo")),
                                Span::new((1, 5), (1, 8)),
                            )),
                            params,
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Return(Return::new(Some(
                                            Identifier::new(
                                                interner.get_or_intern_static("a", utf16!("a")),
                                                Span::new((1, 25), (1, 26)),
                                            )
                                            .into(),
                                        )))
                                        .into(),
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 16), (1, 28)),
                            ),
                            EMPTY_LINEAR_SPAN,
                            Span::new((1, 11), (1, 28)),
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
}

#[test]
fn check_arrow_assignment_noparenthesis_nobrackets() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((1, 11), (1, 12)),
            ),
            None,
        ),
        false,
    ));
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 1);
    check_script_parser(
        "let foo = a => a;",
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("foo", utf16!("foo")),
                        Span::new((1, 5), (1, 8)),
                    ),
                    Some(
                        ArrowFunction::new(
                            Some(Identifier::new(
                                interner.get_or_intern_static("foo", utf16!("foo")),
                                Span::new((1, 5), (1, 8)),
                            )),
                            params,
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Return(Return::new(Some(
                                            Identifier::new(
                                                interner.get_or_intern_static("a", utf16!("a")),
                                                Span::new((1, 16), (1, 17)),
                                            )
                                            .into(),
                                        )))
                                        .into(),
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 16), (1, 17)),
                            ),
                            EMPTY_LINEAR_SPAN,
                            Span::new((1, 11), (1, 17)),
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
}

#[test]
fn check_arrow_assignment_2arg() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(vec![
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 12), (1, 13)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 15), (1, 16)),
                ),
                None,
            ),
            false,
        ),
    ]);
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 2);
    check_script_parser(
        "let foo = (a, b) => { return a };",
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("foo", utf16!("foo")),
                        Span::new((1, 5), (1, 8)),
                    ),
                    Some(
                        ArrowFunction::new(
                            Some(Identifier::new(
                                interner.get_or_intern_static("foo", utf16!("foo")),
                                Span::new((1, 5), (1, 8)),
                            )),
                            params,
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Return(Return::new(Some(
                                            Identifier::new(
                                                interner.get_or_intern_static("a", utf16!("a")),
                                                Span::new((1, 30), (1, 31)),
                                            )
                                            .into(),
                                        )))
                                        .into(),
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 21), (1, 33)),
                            ),
                            EMPTY_LINEAR_SPAN,
                            Span::new((1, 11), (1, 33)),
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
}

#[test]
fn check_arrow_assignment_2arg_nobrackets() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(vec![
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 12), (1, 13)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 15), (1, 16)),
                ),
                None,
            ),
            false,
        ),
    ]);
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 2);
    check_script_parser(
        "let foo = (a, b) => a;",
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("foo", utf16!("foo")),
                        Span::new((1, 5), (1, 8)),
                    ),
                    Some(
                        ArrowFunction::new(
                            Some(Identifier::new(
                                interner.get_or_intern_static("foo", utf16!("foo")),
                                Span::new((1, 5), (1, 8)),
                            )),
                            params,
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Return(Return::new(Some(
                                            Identifier::new(
                                                interner.get_or_intern_static("a", utf16!("a")),
                                                Span::new((1, 21), (1, 22)),
                                            )
                                            .into(),
                                        )))
                                        .into(),
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 21), (1, 22)),
                            ),
                            EMPTY_LINEAR_SPAN,
                            Span::new((1, 11), (1, 22)),
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
}

#[test]
fn check_arrow_assignment_3arg() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(vec![
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 12), (1, 13)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 15), (1, 16)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("c", utf16!("c")),
                    Span::new((1, 18), (1, 19)),
                ),
                None,
            ),
            false,
        ),
    ]);
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 3);
    check_script_parser(
        "let foo = (a, b, c) => { return a };",
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("foo", utf16!("foo")),
                        Span::new((1, 5), (1, 8)),
                    ),
                    Some(
                        ArrowFunction::new(
                            Some(Identifier::new(
                                interner.get_or_intern_static("foo", utf16!("foo")),
                                Span::new((1, 5), (1, 8)),
                            )),
                            params,
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Return(Return::new(Some(
                                            Identifier::new(
                                                interner.get_or_intern_static("a", utf16!("a")),
                                                Span::new((1, 33), (1, 34)),
                                            )
                                            .into(),
                                        )))
                                        .into(),
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 24), (1, 36)),
                            ),
                            EMPTY_LINEAR_SPAN,
                            Span::new((1, 11), (1, 36)),
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
}

#[test]
fn check_arrow_assignment_3arg_nobrackets() {
    let interner = &mut Interner::default();
    let params = FormalParameterList::from(vec![
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 12), (1, 13)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("b", utf16!("b")),
                    Span::new((1, 15), (1, 16)),
                ),
                None,
            ),
            false,
        ),
        FormalParameter::new(
            Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("c", utf16!("c")),
                    Span::new((1, 18), (1, 19)),
                ),
                None,
            ),
            false,
        ),
    ]);
    assert_eq!(params.flags(), FormalParameterListFlags::default());
    assert_eq!(params.length(), 3);
    check_script_parser(
        "let foo = (a, b, c) => a;",
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("foo", utf16!("foo")),
                        Span::new((1, 5), (1, 8)),
                    ),
                    Some(
                        ArrowFunction::new(
                            Some(Identifier::new(
                                interner.get_or_intern_static("foo", utf16!("foo")),
                                Span::new((1, 5), (1, 8)),
                            )),
                            params,
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Return(Return::new(Some(
                                            Identifier::new(
                                                interner.get_or_intern_static("a", utf16!("a")),
                                                Span::new((1, 24), (1, 25)),
                                            )
                                            .into(),
                                        )))
                                        .into(),
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 24), (1, 25)),
                            ),
                            EMPTY_LINEAR_SPAN,
                            Span::new((1, 11), (1, 25)),
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
}
