//! Block statement parsing tests.

use crate::parser::tests::check_script_parser;
use boa_ast::{
    Declaration, Expression, Span, Statement, StatementList, StatementListItem,
    declaration::{VarDeclaration, Variable},
    expression::{
        Call, Identifier,
        literal::Literal,
        operator::{
            Assign, Update,
            assign::AssignOp,
            update::{UpdateOp, UpdateTarget},
        },
    },
    function::{FormalParameterList, FunctionBody, FunctionDeclaration},
    statement::{Block, Return},
};
use boa_interner::Interner;
use boa_macros::utf16;
use indoc::indoc;

const PSEUDO_LINEAR_POS: boa_ast::LinearPosition = boa_ast::LinearPosition::new(0);
const EMPTY_LINEAR_SPAN: boa_ast::LinearSpan =
    boa_ast::LinearSpan::new(PSEUDO_LINEAR_POS, PSEUDO_LINEAR_POS);

/// Helper function to check a block.
#[track_caller]
fn check_block<B>(js: &str, block: B, interner: &mut Interner)
where
    B: Into<Box<[StatementListItem]>>,
{
    check_script_parser(
        js,
        vec![Statement::Block(Block::from((block.into(), PSEUDO_LINEAR_POS))).into()],
        interner,
    );
}

#[test]
fn empty() {
    check_block("{}", vec![], &mut Interner::default());
}

#[test]
fn non_empty() {
    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    check_block(
        indoc! {"
            {
                var a = 10;
                a++;
            }
        "},
        vec![
            Statement::Var(VarDeclaration(
                vec![Variable::from_identifier(
                    Identifier::new(a, Span::new((2, 9), (2, 10))),
                    Some(Literal::new(10, Span::new((2, 13), (2, 15))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Statement::Expression(
                Update::new(
                    UpdateOp::IncrementPost,
                    UpdateTarget::Identifier(Identifier::new(a, Span::new((3, 5), (3, 6)))),
                    Span::new((3, 5), (3, 8)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    let hello = interner.get_or_intern_static("hello", utf16!("hello"));
    let a = interner.get_or_intern_static("a", utf16!("a"));
    check_block(
        indoc! {"
            {
                function hello() {
                    return 10
                }

                var a = hello();
                a++;
            }
        "},
        vec![
            Declaration::FunctionDeclaration(FunctionDeclaration::new(
                Identifier::new(hello, Span::new((2, 14), (2, 19))),
                FormalParameterList::default(),
                FunctionBody::new(
                    StatementList::new(
                        [StatementListItem::Statement(
                            Statement::Return(Return::new(Some(
                                Literal::new(10, Span::new((3, 16), (3, 18))).into(),
                            )))
                            .into(),
                        )],
                        PSEUDO_LINEAR_POS,
                        false,
                    ),
                    Span::new((2, 22), (4, 6)),
                ),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
            Statement::Var(VarDeclaration(
                vec![Variable::from_identifier(
                    Identifier::new(a, Span::new((6, 9), (6, 10))),
                    Some(
                        Call::new(
                            Identifier::new(hello, Span::new((6, 13), (6, 18))).into(),
                            Box::default(),
                            Span::new((6, 18), (6, 20)),
                        )
                        .into(),
                    ),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Statement::Expression(
                Update::new(
                    UpdateOp::IncrementPost,
                    UpdateTarget::Identifier(Identifier::new(a, Span::new((7, 5), (7, 6)))),
                    Span::new((7, 5), (7, 8)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

#[test]
fn hoisting() {
    let interner = &mut Interner::default();
    let hello = interner.get_or_intern_static("hello", utf16!("hello"));
    let a = interner.get_or_intern_static("a", utf16!("a"));
    check_block(
        indoc! {"
            {
                var a = hello();
                a++;

                function hello() { return 10 }
            }
        "},
        vec![
            Statement::Var(VarDeclaration(
                vec![Variable::from_identifier(
                    Identifier::new(a, Span::new((2, 9), (2, 10))),
                    Some(
                        Call::new(
                            Identifier::new(hello, Span::new((2, 13), (2, 18))).into(),
                            Box::default(),
                            Span::new((2, 18), (2, 20)),
                        )
                        .into(),
                    ),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Statement::Expression(
                Update::new(
                    UpdateOp::IncrementPost,
                    UpdateTarget::Identifier(Identifier::new(a, Span::new((3, 5), (3, 6)))),
                    Span::new((3, 5), (3, 8)),
                )
                .into(),
            )
            .into(),
            Declaration::FunctionDeclaration(FunctionDeclaration::new(
                Identifier::new(hello, Span::new((5, 14), (5, 19))),
                FormalParameterList::default(),
                FunctionBody::new(
                    StatementList::new(
                        [StatementListItem::Statement(
                            Statement::Return(Return::new(Some(
                                Literal::new(10, Span::new((5, 31), (5, 33))).into(),
                            )))
                            .into(),
                        )],
                        PSEUDO_LINEAR_POS,
                        false,
                    ),
                    Span::new((5, 22), (5, 35)),
                ),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    check_block(
        indoc! {"
            {
                a = 10;
                a++;

                var a;
            }
        "},
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Assign,
                Identifier::new(a, Span::new((2, 5), (2, 6))).into(),
                Literal::new(10, Span::new((2, 9), (2, 11))).into(),
            )))
            .into(),
            Statement::Expression(
                Update::new(
                    UpdateOp::IncrementPost,
                    UpdateTarget::Identifier(Identifier::new(a, Span::new((3, 5), (3, 6)))),
                    Span::new((3, 5), (3, 8)),
                )
                .into(),
            )
            .into(),
            Statement::Var(VarDeclaration(
                vec![Variable::from_identifier(
                    Identifier::new(a, Span::new((5, 9), (5, 10))),
                    None,
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
        ],
        interner,
    );
}
