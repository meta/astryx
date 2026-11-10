use crate::parser::tests::check_script_parser;
use boa_ast::{
    Declaration, Span, Statement, StatementList, StatementListItem,
    declaration::{LexicalDeclaration, Variable},
    expression::{Identifier, literal::Literal},
    function::{AsyncGeneratorExpression, FormalParameterList, FunctionBody},
    statement::Return,
};
use boa_interner::Interner;
use boa_macros::utf16;
use indoc::indoc;

const PSEUDO_LINEAR_POS: boa_ast::LinearPosition = boa_ast::LinearPosition::new(0);
const EMPTY_LINEAR_SPAN: boa_ast::LinearSpan =
    boa_ast::LinearSpan::new(PSEUDO_LINEAR_POS, PSEUDO_LINEAR_POS);

///checks async generator expression parsing

#[test]
fn check_async_generator_expr() {
    let interner = &mut Interner::default();
    let add = interner.get_or_intern_static("add", utf16!("add"));
    check_script_parser(
        indoc! {"
            const add = async function*(){
                return 1;
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(add, Span::new((1, 7), (1, 10))),
                    Some(
                        AsyncGeneratorExpression::new(
                            Some(Identifier::new(add, Span::new((1, 7), (1, 10)))),
                            FormalParameterList::default(),
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Return(Return::new(Some(
                                            Literal::new(1, Span::new((2, 12), (2, 13))).into(),
                                        )))
                                        .into(),
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 30), (3, 2)),
                            ),
                            EMPTY_LINEAR_SPAN,
                            false,
                            Span::new((1, 13), (3, 2)),
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
fn check_nested_async_generator_expr() {
    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    let b = interner.get_or_intern_static("b", utf16!("b"));
    check_script_parser(
        indoc! {"
            const a = async function*() {
                const b = async function*() {
                    return 1;
                };
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(a, Span::new((1, 7), (1, 8))),
                    Some(
                        AsyncGeneratorExpression::new(
                            Some(Identifier::new(a, Span::new((1, 7), (1, 8)))),
                            FormalParameterList::default(),
                            FunctionBody::new(
                                StatementList::new(
                                    [Declaration::Lexical(LexicalDeclaration::Const(
                                        vec![Variable::from_identifier(
                                            Identifier::new(b, Span::new((2, 11), (2, 12))),
                                            Some(
                                                AsyncGeneratorExpression::new(
                                                    Some(Identifier::new(
                                                        b,
                                                        Span::new((2, 11), (2, 12)),
                                                    )),
                                                    FormalParameterList::default(),
                                                    FunctionBody::new(
                                                        StatementList::new(
                                                            [StatementListItem::Statement(
                                                                Statement::Return(Return::new(
                                                                    Some(
                                                                        Literal::new(
                                                                            1,
                                                                            Span::new(
                                                                                (3, 16),
                                                                                (3, 17),
                                                                            ),
                                                                        )
                                                                        .into(),
                                                                    ),
                                                                ))
                                                                .into(),
                                                            )],
                                                            PSEUDO_LINEAR_POS,
                                                            false,
                                                        ),
                                                        Span::new((2, 33), (4, 6)),
                                                    ),
                                                    EMPTY_LINEAR_SPAN,
                                                    false,
                                                    Span::new((2, 15), (4, 6)),
                                                )
                                                .into(),
                                            ),
                                        )]
                                        .try_into()
                                        .unwrap(),
                                    ))
                                    .into()],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 29), (5, 2)),
                            ),
                            EMPTY_LINEAR_SPAN,
                            false,
                            Span::new((1, 11), (5, 2)),
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
