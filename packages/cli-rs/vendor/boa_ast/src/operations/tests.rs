use boa_interner::Interner;

use crate::{
    Position, Span, Statement,
    expression::{Call, Identifier, NewTarget, This},
    operations::{ContainsSymbol, contains},
    statement::With,
};

fn empty_span() -> Span {
    Span::new(Position::new(1, 1), Position::new(1, 1))
}

#[test]
fn check_contains_this_in_with_statement_expression() {
    let node = With::new(This::new(empty_span()).into(), Statement::Empty);
    assert!(contains(&node, ContainsSymbol::This));
}

#[test]
fn check_contains_new_target_in_with_statement_expression() {
    let node = With::new(NewTarget::new(empty_span()).into(), Statement::Empty);
    assert!(contains(&node, ContainsSymbol::NewTarget));
}

#[test]
fn check_contains_new_target_in_call_function_position() {
    let node = Call::new(
        NewTarget::new(empty_span()).into(),
        Box::default(),
        empty_span(),
    );
    assert!(contains(&node, ContainsSymbol::NewTarget));
}

#[test]
fn check_contains_this_in_call_argument_position() {
    let mut interner = Interner::new();
    let function_name = Identifier::new(interner.get_or_intern("func"), Span::new((1, 1), (1, 5)));
    let node = Call::new(
        function_name.into(),
        vec![This::new(empty_span()).into()].into_boxed_slice(),
        empty_span(),
    );

    assert!(contains(&node, ContainsSymbol::This));
}

#[test]
fn check_contains_new_target_in_call_argument_position() {
    let mut interner = Interner::new();
    let function_name = Identifier::new(interner.get_or_intern("func"), Span::new((1, 1), (1, 5)));
    let node = Call::new(
        function_name.into(),
        vec![NewTarget::new(empty_span()).into()].into_boxed_slice(),
        empty_span(),
    );

    assert!(contains(&node, ContainsSymbol::NewTarget));
}
