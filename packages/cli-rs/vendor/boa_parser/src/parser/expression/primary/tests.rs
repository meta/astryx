use crate::parser::tests::{check_invalid_script, check_script_parser};
use boa_ast::{
    Expression, Span, Statement,
    expression::{
        Identifier, Parenthesized,
        literal::{ArrayLiteral, Literal},
        operator::{
            Assign,
            assign::{AssignOp, AssignTarget},
        },
    },
    pattern::{ArrayPattern, ArrayPatternElement, ObjectPattern, ObjectPatternElement},
};
use boa_interner::{Interner, Sym};
use boa_macros::utf16;

#[test]
fn check_string() {
    // Check empty string
    check_script_parser(
        "\"\"",
        vec![
            Statement::Expression(
                Literal::new(Sym::EMPTY_STRING, Span::new((1, 1), (1, 3))).into(),
            )
            .into(),
        ],
        &mut Interner::default(),
    );

    // Check non-empty string
    let interner = &mut Interner::default();
    check_script_parser(
        "\"hello\"",
        vec![
            Statement::Expression(
                Literal::new(
                    interner.get_or_intern_static("hello", utf16!("hello")),
                    Span::new((1, 1), (1, 8)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_destructuring_assignment_object_assignment_operator() {
    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    check_script_parser(
        "({ a: a = 0 } = 0);",
        vec![
            Statement::Expression(
                Parenthesized::new(
                    Expression::Assign(Assign::new(
                        AssignOp::Assign,
                        AssignTarget::Pattern(
                            ObjectPattern::new(
                                vec![ObjectPatternElement::SingleName {
                                    name: Identifier::new(a, Span::new((1, 4), (1, 5))).into(),
                                    ident: Identifier::new(a, Span::new((1, 7), (1, 8))),
                                    default_init: Some(
                                        Literal::new(0, Span::new((1, 11), (1, 12))).into(),
                                    ),
                                }]
                                .into(),
                                Span::new((1, 2), (1, 14)),
                            )
                            .into(),
                        ),
                        Literal::new(0, Span::new((1, 17), (1, 18))).into(),
                    )),
                    Span::new((1, 1), (1, 19)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_destructuring_assignment_object_invalid_assignment_operators() {
    check_invalid_script("({ a: a &&= 0 } = 0);");
    check_invalid_script("({ a: a ||= 0 } = 0);");
    check_invalid_script("({ a: a ??= 0 } = 0);");
    check_invalid_script("({ a: a *= 0 } = 0);");
    check_invalid_script("({ a: a /= 0 } = 0);");
    check_invalid_script("({ a: a %= 0 } = 0);");
    check_invalid_script("({ a: a += 0 } = 0);");
    check_invalid_script("({ a: a -= 0 } = 0);");
    check_invalid_script("({ a: a <<= 0 } = 0);");
    check_invalid_script("({ a: a >>= 0 } = 0);");
    check_invalid_script("({ a: a >>>= 0 } = 0);");
    check_invalid_script("({ a: a &= 0 } = 0);");
    check_invalid_script("({ a: a ^= 0 } = 0);");
    check_invalid_script("({ a: a |= 0 } = 0);");
    check_invalid_script("({ a: a **= 0 } = 0);");
}

#[test]
fn check_destructuring_assignment_array_assignment_operator() {
    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    check_script_parser(
        "([ a = 0 ] = []);",
        vec![
            Statement::Expression(
                Parenthesized::new(
                    Expression::Assign(Assign::new(
                        AssignOp::Assign,
                        AssignTarget::Pattern(
                            ArrayPattern::new(
                                vec![ArrayPatternElement::SingleName {
                                    ident: Identifier::new(a, Span::new((1, 4), (1, 5))),
                                    default_init: Some(
                                        Literal::new(0, Span::new((1, 8), (1, 9))).into(),
                                    ),
                                }]
                                .into(),
                                Span::new((1, 2), (1, 11)),
                            )
                            .into(),
                        ),
                        ArrayLiteral::new([], false, Span::new((1, 14), (1, 16))).into(),
                    )),
                    Span::new((1, 1), (1, 17)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_destructuring_assignment_array_invalid_assignment_operators() {
    check_invalid_script("([ a &&= 0 ] = []);");
    check_invalid_script("([ a ||= 0 ] = []);");
    check_invalid_script("([ a ??= 0 ] = []);");
    check_invalid_script("([ a *= 0 ] = []);");
    check_invalid_script("([ a /= 0 ] = []);");
    check_invalid_script("([ a %= 0 ] = []);");
    check_invalid_script("([ a += 0 ] = []);");
    check_invalid_script("([ a -= 0 ] = []);");
    check_invalid_script("([ a <<= 0 ] = []);");
    check_invalid_script("([ a >>= 0 ] = []);");
    check_invalid_script("([ a >>>= 0 ] = []);");
    check_invalid_script("([ a &= 0 ] = []);");
    check_invalid_script("([ a ^= 0 ] = []);");
    check_invalid_script("([ a |= 0 ] = []);");
    check_invalid_script("([ a **= 0 ] = []);");
}
