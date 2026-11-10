use crate::parser::tests::check_script_parser;
use boa_ast::{
    Declaration, LinearPosition, LinearSpan, Span, StatementList,
    expression::Identifier,
    function::{FormalParameterList, FunctionBody, GeneratorDeclaration},
};
use boa_interner::Interner;
use boa_macros::utf16;

#[test]
fn generator_function_declaration() {
    let interner = &mut Interner::default();
    check_script_parser(
        "function* gen() {}",
        vec![
            Declaration::GeneratorDeclaration(GeneratorDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("gen", utf16!("gen")),
                    Span::new((1, 11), (1, 14)),
                ),
                FormalParameterList::default(),
                FunctionBody::new(StatementList::default(), Span::new((1, 17), (1, 19))),
                LinearSpan::new(LinearPosition::default(), LinearPosition::default()),
            ))
            .into(),
        ],
        interner,
    );
}
