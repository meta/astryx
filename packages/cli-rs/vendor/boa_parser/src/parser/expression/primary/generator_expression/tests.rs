use crate::parser::tests::check_script_parser;
use boa_ast::{
    Declaration, Expression, Span, Statement, StatementList, StatementListItem,
    declaration::{LexicalDeclaration, Variable},
    expression::{Identifier, Yield, literal::Literal},
    function::{FormalParameterList, FunctionBody, GeneratorExpression},
};
use boa_interner::Interner;
use boa_macros::utf16;
use indoc::indoc;

const PSEUDO_LINEAR_POS: boa_ast::LinearPosition = boa_ast::LinearPosition::new(0);
const EMPTY_LINEAR_SPAN: boa_ast::LinearSpan =
    boa_ast::LinearSpan::new(PSEUDO_LINEAR_POS, PSEUDO_LINEAR_POS);

#[test]
fn check_generator_function_expression() {
    let interner = &mut Interner::default();
    let r#gen = interner.get_or_intern_static("gen", utf16!("gen"));
    check_script_parser(
        indoc! {"
            const gen = function*() {
                yield 1;
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(r#gen, Span::new((1, 7), (1, 10))),
                    Some(
                        GeneratorExpression::new(
                            Some(Identifier::new(r#gen, Span::new((1, 7), (1, 10)))),
                            FormalParameterList::default(),
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Expression(Expression::from(Yield::new(
                                            Some(
                                                Literal::new(1, Span::new((2, 11), (2, 12))).into(),
                                            ),
                                            false,
                                            Span::new((2, 5), (2, 12)),
                                        )))
                                        .into(),
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 25), (3, 2)),
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
fn check_generator_function_delegate_yield_expression() {
    let interner = &mut Interner::default();
    let r#gen = interner.get_or_intern_static("gen", utf16!("gen"));
    check_script_parser(
        indoc! {"
            const gen = function*() {
                yield* 1;
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(r#gen, Span::new((1, 7), (1, 10))),
                    Some(
                        GeneratorExpression::new(
                            Some(Identifier::new(r#gen, Span::new((1, 7), (1, 10)))),
                            FormalParameterList::default(),
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Expression(Expression::from(Yield::new(
                                            Some(
                                                Literal::new(1, Span::new((2, 12), (2, 13))).into(),
                                            ),
                                            true,
                                            Span::new((2, 5), (2, 13)),
                                        )))
                                        .into(),
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                Span::new((1, 25), (3, 2)),
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
