use crate::parser::tests::{check_invalid_script, check_script_parser};
use boa_ast::{Span, Statement, expression::literal::Literal, statement::Throw};
use boa_interner::Interner;
use boa_macros::utf16;

#[test]
fn check_throw_parsing() {
    let interner = &mut Interner::default();
    check_script_parser(
        "throw 'error';",
        vec![
            Statement::Throw(Throw::new(
                Literal::new(
                    interner.get_or_intern_static("error", utf16!("error")),
                    Span::new((1, 7), (1, 14)),
                )
                .into(),
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_throw_syntax_error() {
    check_invalid_script("throw async () => {} - 1;");
}
