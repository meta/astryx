use crate::parser::tests::check_script_parser;
use boa_ast::{
    Span, Statement,
    expression::literal::Literal,
    statement::{Block, If},
};
use boa_interner::Interner;

const PSEUDO_LINEAR_POS: boa_ast::LinearPosition = boa_ast::LinearPosition::new(0);

#[test]
fn if_without_else_block() {
    check_script_parser(
        "if (true) {}",
        vec![
            Statement::If(If::new(
                Literal::new(true, Span::new((1, 5), (1, 9))).into(),
                Block::from((Vec::new(), PSEUDO_LINEAR_POS)).into(),
                None,
            ))
            .into(),
        ],
        &mut Interner::default(),
    );
}

#[test]
fn if_without_else_block_with_trailing_newline() {
    check_script_parser(
        "if (true) {}\n",
        vec![
            Statement::If(If::new(
                Literal::new(true, Span::new((1, 5), (1, 9))).into(),
                Block::from((Vec::new(), PSEUDO_LINEAR_POS)).into(),
                None,
            ))
            .into(),
        ],
        &mut Interner::default(),
    );
}
