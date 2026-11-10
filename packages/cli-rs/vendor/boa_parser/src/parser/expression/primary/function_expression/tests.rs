use crate::parser::tests::check_script_parser;
use boa_ast::{
    Declaration, Span, Statement, StatementList, StatementListItem,
    declaration::{LexicalDeclaration, Variable},
    expression::{Identifier, literal::Literal},
    function::{FormalParameterList, FunctionBody, FunctionExpression},
    statement::Return,
};
use boa_interner::Interner;
use boa_macros::utf16;
use indoc::indoc;

const PSEUDO_LINEAR_POS: boa_ast::LinearPosition = boa_ast::LinearPosition::new(0);

/// Checks async expression parsing.
#[test]
fn check_function_expression() {
    let interner = &mut Interner::default();
    let add = interner.get_or_intern_static("add", utf16!("add"));
    check_script_parser(
        indoc! {"
            const add = function() {
                return 1;
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(add, Span::new((1, 7), (1, 10))),
                    Some(
                        FunctionExpression::new(
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
                                Span::new((1, 24), (3, 2)),
                            ),
                            None,
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
fn check_nested_function_expression() {
    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    let b = interner.get_or_intern_static("b", utf16!("b"));
    check_script_parser(
        indoc! {"
            const a = function() {
                const b = function() {
                    return 1;
                };
            };
        "},
        vec![
            Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new(a, Span::new((1, 7), (1, 8))),
                    Some(
                        FunctionExpression::new(
                            Some(Identifier::new(a, Span::new((1, 7), (1, 8)))),
                            FormalParameterList::default(),
                            FunctionBody::new(
                                StatementList::new(
                                    [Declaration::Lexical(LexicalDeclaration::Const(
                                        vec![Variable::from_identifier(
                                            Identifier::new(b, Span::new((2, 11), (2, 12))),
                                            Some(
                                                FunctionExpression::new(
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
                                                        Span::new((2, 26), (4, 6)),
                                                    ),
                                                    None,
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
                                Span::new((1, 22), (5, 2)),
                            ),
                            None,
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

#[test]
fn check_function_non_reserved_keyword() {
    macro_rules! genast {
        (
            $keyword:literal,
            $interner:expr,
            function: $function_span:expr,
            name: $name_span:expr,
            body: $body_span:expr,
            literal: $literal_span:expr
        ) => {
            vec![Declaration::Lexical(LexicalDeclaration::Const(
                vec![Variable::from_identifier(
                    Identifier::new($interner.get_or_intern_static("add", utf16!("add")), Span::new((1, 7), (1, 10))),
                    Some(
                        FunctionExpression::new(
                            Some(Identifier::new($interner.get_or_intern_static($keyword, utf16!($keyword)), $name_span)),
                            FormalParameterList::default(),
                            FunctionBody::new(
                                StatementList::new(
                                    [StatementListItem::Statement(
                                        Statement::Return(
                                            Return::new(
                                                Some(Literal::new(1, $literal_span).into())
                                            )
                                        ).into()
                                    )],
                                    PSEUDO_LINEAR_POS,
                                    false,
                                ),
                                $body_span,
                            ),
                            None,
                            true,
                            $function_span,
                        )
                        .into(),
                    ),
                )]
                .try_into().unwrap(),
            ))
            .into()]
        };
    }

    let interner = &mut Interner::default();
    let ast = genast!(
        "as",
        interner,
        function: Span::new((1, 13), (1, 40)),
        name: Span::new((1, 22), (1, 24)),
        body: Span::new((1, 27), (1, 40)),
        literal: Span::new((1, 36), (1, 37))
    );
    check_script_parser("const add = function as() { return 1; };", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "async",
        interner,
        function: Span::new((1, 13), (1, 43)),
        name: Span::new((1, 22), (1, 27)),
        body: Span::new((1, 30), (1, 43)),
        literal: Span::new((1, 39), (1, 40))
    );
    check_script_parser("const add = function async() { return 1; };", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "from",
        interner,
        function: Span::new((1, 13), (1, 42)),
        name: Span::new((1, 22), (1, 26)),
        body: Span::new((1, 29), (1, 42)),
        literal: Span::new((1, 38), (1, 39))
    );
    check_script_parser("const add = function from() { return 1; };", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "get",
        interner,
        function: Span::new((1, 13), (1, 41)),
        name: Span::new((1, 22), (1, 25)),
        body: Span::new((1, 28), (1, 41)),
        literal: Span::new((1, 37), (1, 38))
    );
    check_script_parser("const add = function get() { return 1; };", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "meta",
        interner,
        function: Span::new((1, 13), (1, 42)),
        name: Span::new((1, 22), (1, 26)),
        body: Span::new((1, 29), (1, 42)),
        literal: Span::new((1, 38), (1, 39))
    );
    check_script_parser("const add = function meta() { return 1; };", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "of",
        interner,
        function: Span::new((1, 13), (1, 40)),
        name: Span::new((1, 22), (1, 24)),
        body: Span::new((1, 27), (1, 40)),
        literal: Span::new((1, 36), (1, 37))
    );
    check_script_parser("const add = function of() { return 1; };", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "set",
        interner,
        function: Span::new((1, 13), (1, 41)),
        name: Span::new((1, 22), (1, 25)),
        body: Span::new((1, 28), (1, 41)),
        literal: Span::new((1, 37), (1, 38))
    );
    check_script_parser("const add = function set() { return 1; };", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "target",
        interner,
        function: Span::new((1, 13), (1, 44)),
        name: Span::new((1, 22), (1, 28)),
        body: Span::new((1, 31), (1, 44)),
        literal: Span::new((1, 40), (1, 41))
    );
    check_script_parser(
        "const add = function target() { return 1; };",
        ast,
        interner,
    );
}
