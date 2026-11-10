use crate::parser::tests::check_script_parser;
use boa_ast::{
    Declaration, LinearPosition, LinearSpan, Span, StatementList,
    expression::Identifier,
    function::{AsyncFunctionDeclaration, FormalParameterList, FunctionBody},
};
use boa_interner::{Interner, Sym};
use boa_macros::utf16;

const EMPTY_LINEAR_SPAN: LinearSpan =
    LinearSpan::new(LinearPosition::new(0), LinearPosition::new(0));

/// Async function declaration parsing.
#[test]
fn async_function_declaration() {
    let interner = &mut Interner::default();
    check_script_parser(
        "async function hello() {}",
        vec![
            Declaration::AsyncFunctionDeclaration(AsyncFunctionDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("hello", utf16!("hello")),
                    Span::new((1, 16), (1, 21)),
                ),
                FormalParameterList::default(),
                FunctionBody::new(StatementList::default(), Span::new((1, 24), (1, 26))),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );
}

/// Async function declaration parsing with keywords.
#[test]
fn async_function_declaration_keywords() {
    let interner = &mut Interner::default();
    check_script_parser(
        "async function yield() {}",
        vec![
            Declaration::AsyncFunctionDeclaration(AsyncFunctionDeclaration::new(
                Identifier::new(Sym::YIELD, Span::new((1, 16), (1, 21))),
                FormalParameterList::default(),
                FunctionBody::new(StatementList::default(), Span::new((1, 24), (1, 26))),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    check_script_parser(
        "async function await() {}",
        vec![
            Declaration::AsyncFunctionDeclaration(AsyncFunctionDeclaration::new(
                Identifier::new(Sym::AWAIT, Span::new((1, 16), (1, 21))),
                FormalParameterList::default(),
                FunctionBody::new(StatementList::default(), Span::new((1, 24), (1, 26))),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );
}
