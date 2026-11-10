use crate::parser::tests::check_script_parser;
use boa_ast::{
    Declaration, Span, StatementList,
    expression::Identifier,
    function::{FormalParameterList, FunctionBody, FunctionDeclaration},
};
use boa_interner::Interner;
use boa_macros::utf16;

const PSEUDO_LINEAR_POS: boa_ast::LinearPosition = boa_ast::LinearPosition::new(0);
const EMPTY_LINEAR_SPAN: boa_ast::LinearSpan =
    boa_ast::LinearSpan::new(PSEUDO_LINEAR_POS, PSEUDO_LINEAR_POS);

/// Function declaration parsing.
#[test]
fn function_declaration() {
    let interner = &mut Interner::default();
    check_script_parser(
        "function hello() {}",
        vec![
            Declaration::FunctionDeclaration(FunctionDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("hello", utf16!("hello")),
                    Span::new((1, 10), (1, 15)),
                ),
                FormalParameterList::default(),
                FunctionBody::new(StatementList::default(), Span::new((1, 18), (1, 20))),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );
}

/// Function declaration parsing with keywords.
#[test]
fn function_declaration_keywords() {
    macro_rules! genast {
        ($keyword:literal, $interner:expr, $name_span:expr, $body_span:expr) => {
            vec![
                Declaration::FunctionDeclaration(FunctionDeclaration::new(
                    Identifier::new(
                        $interner
                            .get_or_intern_static($keyword, utf16!($keyword))
                            .into(),
                        $name_span,
                    ),
                    FormalParameterList::default(),
                    FunctionBody::new(StatementList::default(), $body_span),
                    EMPTY_LINEAR_SPAN,
                ))
                .into(),
            ]
        };
    }

    let interner = &mut Interner::default();
    let ast = genast!(
        "yield",
        interner,
        Span::new((1, 10), (1, 15)),
        Span::new((1, 18), (1, 20))
    );
    check_script_parser("function yield() {}", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "await",
        interner,
        Span::new((1, 10), (1, 15)),
        Span::new((1, 18), (1, 20))
    );
    check_script_parser("function await() {}", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "as",
        interner,
        Span::new((1, 10), (1, 12)),
        Span::new((1, 15), (1, 17))
    );
    check_script_parser("function as() {}", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "async",
        interner,
        Span::new((1, 10), (1, 15)),
        Span::new((1, 18), (1, 20))
    );
    check_script_parser("function async() {}", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "from",
        interner,
        Span::new((1, 10), (1, 14)),
        Span::new((1, 17), (1, 19))
    );
    check_script_parser("function from() {}", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "get",
        interner,
        Span::new((1, 10), (1, 13)),
        Span::new((1, 16), (1, 18))
    );
    check_script_parser("function get() {}", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "meta",
        interner,
        Span::new((1, 10), (1, 14)),
        Span::new((1, 17), (1, 19))
    );
    check_script_parser("function meta() {}", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "of",
        interner,
        Span::new((1, 10), (1, 12)),
        Span::new((1, 15), (1, 17))
    );
    check_script_parser("function of() {}", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "set",
        interner,
        Span::new((1, 10), (1, 13)),
        Span::new((1, 16), (1, 18))
    );
    check_script_parser("function set() {}", ast, interner);

    let interner = &mut Interner::default();
    let ast = genast!(
        "target",
        interner,
        Span::new((1, 10), (1, 16)),
        Span::new((1, 19), (1, 21))
    );
    check_script_parser("function target() {}", ast, interner);
}
