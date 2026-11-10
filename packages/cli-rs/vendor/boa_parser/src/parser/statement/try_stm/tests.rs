use crate::parser::tests::{check_invalid_script, check_script_parser};
use boa_ast::{
    Span, Statement, StatementListItem,
    declaration::{VarDeclaration, Variable},
    expression::{Identifier, literal::Literal},
    pattern::{ArrayPattern, ArrayPatternElement, ObjectPattern, ObjectPatternElement, Pattern},
    statement::{Block, Catch, ErrorHandler, Finally, Try},
};
use boa_interner::Interner;
use boa_macros::utf16;

const PSEUDO_LINEAR_POS: boa_ast::LinearPosition = boa_ast::LinearPosition::new(0);

#[test]
fn check_inline_with_empty_try_catch() {
    let interner = &mut Interner::default();
    check_script_parser(
        "try { } catch(e) {}",
        vec![
            Statement::Try(Try::new(
                Block::default(),
                ErrorHandler::Catch(Catch::new(
                    Some(
                        Identifier::new(
                            interner.get_or_intern_static("e", utf16!("e")),
                            Span::new((1, 15), (1, 16)),
                        )
                        .into(),
                    ),
                    Block::default(),
                )),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_inline_with_var_decl_inside_try() {
    let interner = &mut Interner::default();
    check_script_parser(
        "try { var x = 1; } catch(e) {}",
        vec![
            Statement::Try(Try::new(
                (
                    vec![
                        Statement::Var(VarDeclaration(
                            vec![Variable::from_identifier(
                                Identifier::new(
                                    interner.get_or_intern_static("x", utf16!("x")),
                                    Span::new((1, 11), (1, 12)),
                                ),
                                Some(Literal::new(1, Span::new((1, 15), (1, 16))).into()),
                            )]
                            .try_into()
                            .unwrap(),
                        ))
                        .into(),
                    ],
                    PSEUDO_LINEAR_POS,
                )
                    .into(),
                ErrorHandler::Catch(Catch::new(
                    Some(
                        Identifier::new(
                            interner.get_or_intern_static("e", utf16!("e")),
                            Span::new((1, 26), (1, 27)),
                        )
                        .into(),
                    ),
                    Block::default(),
                )),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_inline_with_var_decl_inside_catch() {
    let interner = &mut Interner::default();
    check_script_parser(
        "try { var x = 1; } catch(e) { var x = 1; }",
        vec![
            Statement::Try(Try::new(
                (
                    vec![
                        Statement::Var(VarDeclaration(
                            vec![Variable::from_identifier(
                                Identifier::new(
                                    interner.get_or_intern_static("x", utf16!("x")),
                                    Span::new((1, 11), (1, 12)),
                                ),
                                Some(Literal::new(1, Span::new((1, 15), (1, 16))).into()),
                            )]
                            .try_into()
                            .unwrap(),
                        ))
                        .into(),
                    ],
                    PSEUDO_LINEAR_POS,
                )
                    .into(),
                ErrorHandler::Catch(Catch::new(
                    Some(
                        Identifier::new(
                            interner.get_or_intern_static("e", utf16!("e")),
                            Span::new((1, 26), (1, 27)),
                        )
                        .into(),
                    ),
                    (
                        vec![
                            Statement::Var(VarDeclaration(
                                vec![Variable::from_identifier(
                                    Identifier::new(
                                        interner.get_or_intern_static("x", utf16!("x")),
                                        Span::new((1, 35), (1, 36)),
                                    ),
                                    Some(Literal::new(1, Span::new((1, 39), (1, 40))).into()),
                                )]
                                .try_into()
                                .unwrap(),
                            ))
                            .into(),
                        ],
                        PSEUDO_LINEAR_POS,
                    )
                        .into(),
                )),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_inline_with_empty_try_catch_finally() {
    let interner = &mut Interner::default();
    check_script_parser(
        "try {} catch(e) {} finally {}",
        vec![
            Statement::Try(Try::new(
                Block::default(),
                ErrorHandler::Full(
                    Catch::new(
                        Some(
                            Identifier::new(
                                interner.get_or_intern_static("e", utf16!("e")),
                                Span::new((1, 14), (1, 15)),
                            )
                            .into(),
                        ),
                        Block::default(),
                    ),
                    Finally::from(Block::default()),
                ),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_inline_with_empty_try_finally() {
    check_script_parser(
        "try {} finally {}",
        vec![
            Statement::Try(Try::new(
                Block::default(),
                ErrorHandler::Finally(Finally::from(Block::default())),
            ))
            .into(),
        ],
        &mut Interner::default(),
    );
}

#[test]
fn check_inline_with_empty_try_var_decl_in_finally() {
    let interner = &mut Interner::default();
    check_script_parser(
        "try {} finally { var x = 1; }",
        vec![
            Statement::Try(Try::new(
                Block::default(),
                ErrorHandler::Finally(Finally::from(Block::from((
                    vec![StatementListItem::Statement(
                        Statement::Var(VarDeclaration(
                            vec![Variable::from_identifier(
                                Identifier::new(
                                    interner.get_or_intern_static("x", utf16!("x")),
                                    Span::new((1, 22), (1, 23)),
                                ),
                                Some(Literal::new(1, Span::new((1, 26), (1, 27))).into()),
                            )]
                            .try_into()
                            .unwrap(),
                        ))
                        .into(),
                    )],
                    PSEUDO_LINEAR_POS,
                )))),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_inline_empty_try_paramless_catch() {
    let interner = &mut Interner::default();
    check_script_parser(
        "try {} catch { var x = 1; }",
        vec![
            Statement::Try(Try::new(
                Block::default(),
                ErrorHandler::Catch(Catch::new(
                    None,
                    (
                        vec![
                            Statement::Var(VarDeclaration(
                                vec![Variable::from_identifier(
                                    Identifier::new(
                                        interner.get_or_intern_static("x", utf16!("x")),
                                        Span::new((1, 20), (1, 21)),
                                    ),
                                    Some(Literal::new(1, Span::new((1, 24), (1, 25))).into()),
                                )]
                                .try_into()
                                .unwrap(),
                            ))
                            .into(),
                        ],
                        PSEUDO_LINEAR_POS,
                    )
                        .into(),
                )),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_inline_with_binding_pattern_object() {
    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    check_script_parser(
        "try {} catch ({ a, b: c }) {}",
        vec![
            Statement::Try(Try::new(
                Block::default(),
                ErrorHandler::Catch(Catch::new(
                    Some(
                        Pattern::from(ObjectPattern::new(
                            vec![
                                ObjectPatternElement::SingleName {
                                    ident: Identifier::new(a, Span::new((1, 17), (1, 18))),
                                    name: Identifier::new(a, Span::new((1, 17), (1, 18))).into(),
                                    default_init: None,
                                },
                                ObjectPatternElement::SingleName {
                                    ident: Identifier::new(
                                        interner.get_or_intern_static("c", utf16!("c")),
                                        Span::new((1, 23), (1, 24)),
                                    ),
                                    name: Identifier::new(
                                        interner.get_or_intern_static("b", utf16!("b")),
                                        Span::new((1, 20), (1, 21)),
                                    )
                                    .into(),
                                    default_init: None,
                                },
                            ]
                            .into(),
                            Span::new((1, 15), (1, 26)),
                        ))
                        .into(),
                    ),
                    Block::default(),
                )),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_inline_with_binding_pattern_array() {
    let interner = &mut Interner::default();
    check_script_parser(
        "try {} catch ([a, b]) {}",
        vec![
            Statement::Try(Try::new(
                Block::from((vec![], PSEUDO_LINEAR_POS)),
                ErrorHandler::Catch(Catch::new(
                    Some(
                        Pattern::from(ArrayPattern::new(
                            vec![
                                ArrayPatternElement::SingleName {
                                    ident: Identifier::new(
                                        interner.get_or_intern_static("a", utf16!("a")),
                                        Span::new((1, 16), (1, 17)),
                                    ),
                                    default_init: None,
                                },
                                ArrayPatternElement::SingleName {
                                    ident: Identifier::new(
                                        interner.get_or_intern_static("b", utf16!("b")),
                                        Span::new((1, 19), (1, 20)),
                                    ),
                                    default_init: None,
                                },
                            ]
                            .into(),
                            Span::new((1, 15), (1, 21)),
                        ))
                        .into(),
                    ),
                    Block::default(),
                )),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_catch_with_var_redeclaration() {
    let interner = &mut Interner::default();
    check_script_parser(
        "try {} catch(e) { var e = 'oh' }",
        vec![
            Statement::Try(Try::new(
                Block::from((vec![], PSEUDO_LINEAR_POS)),
                ErrorHandler::Catch(Catch::new(
                    Some(
                        Identifier::new(
                            interner.get_or_intern_static("e", utf16!("e")),
                            Span::new((1, 14), (1, 15)),
                        )
                        .into(),
                    ),
                    (
                        vec![
                            Statement::Var(VarDeclaration(
                                vec![Variable::from_identifier(
                                    Identifier::new(
                                        interner.get_or_intern_static("e", utf16!("e")),
                                        Span::new((1, 23), (1, 24)),
                                    ),
                                    Some(
                                        Literal::new(
                                            interner.get_or_intern_static("oh", utf16!("oh")),
                                            Span::new((1, 27), (1, 31)),
                                        )
                                        .into(),
                                    ),
                                )]
                                .try_into()
                                .unwrap(),
                            ))
                            .into(),
                        ],
                        PSEUDO_LINEAR_POS,
                    )
                        .into(),
                )),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_inline_invalid_catch() {
    check_invalid_script("try {} catch");
}

#[test]
fn check_inline_invalid_catch_without_closing_paren() {
    check_invalid_script("try {} catch(e {}");
}

#[test]
fn check_inline_invalid_catch_parameter() {
    check_invalid_script("try {} catch(1) {}");
}

#[test]
fn check_invalid_try_no_catch_finally() {
    check_invalid_script("try {} let a = 10;");
}

#[test]
fn check_invalid_catch_with_empty_paren() {
    check_invalid_script("try {} catch() {}");
}

#[test]
fn check_invalid_catch_with_duplicate_params() {
    check_invalid_script("try {} catch({ a, b: a }) {}");
}

#[test]
fn check_invalid_catch_with_lexical_redeclaration() {
    check_invalid_script("try {} catch(e) { let e = 'oh' }");
}
