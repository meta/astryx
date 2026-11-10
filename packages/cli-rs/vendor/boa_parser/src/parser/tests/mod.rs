//! Tests for the parser.

mod format;

use std::convert::TryInto;

use crate::{Parser, Source};
use boa_ast::{
    Expression, LinearPosition, LinearSpan, Module, ModuleItem, ModuleItemList, Script, Span,
    Statement, StatementList, StatementListItem,
    declaration::{Declaration, LexicalDeclaration, VarDeclaration, Variable},
    expression::{
        Call, Identifier, New, Parenthesized,
        access::SimplePropertyAccess,
        literal::{Literal, ObjectLiteral, PropertyDefinition},
        operator::{
            Assign, Binary, Update,
            assign::AssignOp,
            binary::{ArithmeticOp, BinaryOp, LogicalOp, RelationalOp},
            update::{UpdateOp, UpdateTarget},
        },
    },
    function::{
        ArrowFunction, FormalParameter, FormalParameterList, FormalParameterListFlags,
        FunctionBody, FunctionDeclaration,
    },
    scope::Scope,
    statement::{Block, If, Return, With},
};
use boa_interner::Interner;
use boa_macros::utf16;
use indoc::indoc;

const PSEUDO_LINEAR_POS: LinearPosition = LinearPosition::new(0);
const EMPTY_LINEAR_SPAN: LinearSpan = LinearSpan::new(PSEUDO_LINEAR_POS, PSEUDO_LINEAR_POS);

/// Checks that the given JavaScript string gives the expected expression.
#[track_caller]
pub(super) fn check_script_parser<L>(js: &str, expr: L, interner: &mut Interner)
where
    L: Into<Box<[StatementListItem]>>,
{
    let mut script = Script::new(StatementList::from((expr.into(), PSEUDO_LINEAR_POS)));
    let scope = Scope::new_global();
    script
        .analyze_scope(&scope, interner)
        .expect("failed to analyze script");
    assert_eq!(
        Parser::new(Source::from_bytes(js))
            .parse_script(&Scope::new_global(), interner)
            .expect("failed to parse"),
        script,
    );
}

/// Checks that the given JavaScript string gives the expected expression.
#[track_caller]
pub(super) fn check_module_parser<L>(js: &str, expr: L, interner: &mut Interner)
where
    L: Into<Box<[ModuleItem]>>,
{
    let mut module = Module::new(ModuleItemList::from(expr.into()));
    let scope = Scope::new_global();
    module
        .analyze_scope(&scope, interner)
        .expect("failed to analyze");
    assert_eq!(
        Parser::new(Source::from_bytes(js))
            .parse_module(&Scope::new_global(), interner)
            .expect("failed to parse"),
        module,
    );
}

/// Checks that the given javascript string creates a parse error.
#[track_caller]
pub(super) fn check_invalid_script(js: &str) {
    assert!(
        Parser::new(Source::from_bytes(js))
            .parse_script(&Scope::new_global(), &mut Interner::default())
            .is_err()
    );
}

/// Should be parsed as `new Class().method()` instead of `new (Class().method())`
#[test]
fn check_construct_call_precedence() {
    let interner = &mut Interner::default();
    check_script_parser(
        "new Date().getTime()",
        vec![
            Statement::Expression(
                Call::new(
                    Expression::PropertyAccess(
                        SimplePropertyAccess::new(
                            New::from(Call::new(
                                Identifier::new(
                                    interner.get_or_intern_static("Date", utf16!("Date")),
                                    Span::new((1, 5), (1, 9)),
                                )
                                .into(),
                                Box::default(),
                                Span::new((1, 1), (1, 11)),
                            ))
                            .into(),
                            Identifier::new(
                                interner.get_or_intern_static("getTime", utf16!("getTime")),
                                Span::new((1, 12), (1, 19)),
                            ),
                        )
                        .into(),
                    ),
                    Box::default(),
                    Span::new((1, 19), (1, 21)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

#[test]
fn assign_operator_precedence() {
    let interner = &mut Interner::default();
    check_script_parser(
        "a = a + 1",
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Assign,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((1, 1), (1, 2)),
                )
                .into(),
                Binary::new(
                    ArithmeticOp::Add.into(),
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 5), (1, 6)),
                    )
                    .into(),
                    Literal::new(1, Span::new((1, 9), (1, 10))).into(),
                )
                .into(),
            )))
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
    check_script_parser(
        indoc! {"
            var a = hello();
            a++;

            function hello() { return 10 }
        "},
        vec![
            Statement::Var(VarDeclaration(
                vec![Variable::from_identifier(
                    Identifier::new(a, Span::new((1, 5), (1, 6))),
                    Some(
                        Call::new(
                            Identifier::new(hello, Span::new((1, 9), (1, 14))).into(),
                            Box::default(),
                            Span::new((1, 14), (1, 16)),
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
                    UpdateTarget::Identifier(Identifier::new(a, Span::new((2, 1), (2, 2)))),
                    Span::new((2, 1), (2, 4)),
                )
                .into(),
            )
            .into(),
            Declaration::FunctionDeclaration(FunctionDeclaration::new(
                Identifier::new(hello, Span::new((4, 10), (4, 15))),
                FormalParameterList::default(),
                FunctionBody::new(
                    StatementList::new(
                        [Statement::Return(Return::new(Some(
                            Literal::new(10, Span::new((4, 27), (4, 29))).into(),
                        )))
                        .into()],
                        PSEUDO_LINEAR_POS,
                        false,
                    ),
                    Span::new((4, 18), (4, 31)),
                ),
                EMPTY_LINEAR_SPAN,
            ))
            .into(),
        ],
        interner,
    );

    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    check_script_parser(
        indoc! {"
            a = 10;
            a++;

            var a;
        "},
        vec![
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Assign,
                Identifier::new(a, Span::new((1, 1), (1, 2))).into(),
                Literal::new(10, Span::new((1, 5), (1, 7))).into(),
            )))
            .into(),
            Statement::Expression(
                Update::new(
                    UpdateOp::IncrementPost,
                    UpdateTarget::Identifier(Identifier::new(a, Span::new((2, 1), (2, 2)))),
                    Span::new((2, 1), (2, 4)),
                )
                .into(),
            )
            .into(),
            Statement::Var(VarDeclaration(
                vec![Variable::from_identifier(
                    Identifier::new(a, Span::new((4, 5), (4, 6))),
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

#[test]
fn ambiguous_regex_divide_expression() {
    let s = "1 / a === 1 / b";

    let interner = &mut Interner::default();
    check_script_parser(
        s,
        vec![
            Statement::Expression(Expression::from(Binary::new(
                RelationalOp::StrictEqual.into(),
                Binary::new(
                    ArithmeticOp::Div.into(),
                    Literal::new(1, Span::new((1, 1), (1, 2))).into(),
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 5), (1, 6)),
                    )
                    .into(),
                )
                .into(),
                Binary::new(
                    ArithmeticOp::Div.into(),
                    Literal::new(1, Span::new((1, 11), (1, 12))).into(),
                    Identifier::new(
                        interner.get_or_intern_static("b", utf16!("b")),
                        Span::new((1, 15), (1, 16)),
                    )
                    .into(),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );
}

#[test]
fn two_divisions_in_expression() {
    let s = "a !== 0 || 1 / a === 1 / b;";

    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    check_script_parser(
        s,
        vec![
            Statement::Expression(Expression::from(Binary::new(
                LogicalOp::Or.into(),
                Binary::new(
                    RelationalOp::StrictNotEqual.into(),
                    Identifier::new(a, Span::new((1, 1), (1, 2))).into(),
                    Literal::new(0, Span::new((1, 7), (1, 8))).into(),
                )
                .into(),
                Binary::new(
                    RelationalOp::StrictEqual.into(),
                    Binary::new(
                        ArithmeticOp::Div.into(),
                        Literal::new(1, Span::new((1, 12), (1, 13))).into(),
                        Identifier::new(a, Span::new((1, 16), (1, 17))).into(),
                    )
                    .into(),
                    Binary::new(
                        ArithmeticOp::Div.into(),
                        Literal::new(1, Span::new((1, 22), (1, 23))).into(),
                        Identifier::new(
                            interner.get_or_intern_static("b", utf16!("b")),
                            Span::new((1, 26), (1, 27)),
                        )
                        .into(),
                    )
                    .into(),
                )
                .into(),
            )))
            .into(),
        ],
        interner,
    );
}

#[test]
fn comment_semi_colon_insertion() {
    let s = indoc! {"
        let a = 10 // Comment
        let b = 20;
    "};

    let interner = &mut Interner::default();
    check_script_parser(
        s,
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 5), (1, 6)),
                    ),
                    Some(Literal::new(10, Span::new((1, 9), (1, 11))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("b", utf16!("b")),
                        Span::new((2, 5), (2, 6)),
                    ),
                    Some(Literal::new(20, Span::new((2, 9), (2, 11))).into()),
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
fn multiline_comment_semi_colon_insertion() {
    let s = indoc! {"
        let a = 10 /* Test
        Multiline
        Comment
        */ let b = 20;
    "};

    let interner = &mut Interner::default();
    check_script_parser(
        s,
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 5), (1, 6)),
                    ),
                    Some(Literal::new(10, Span::new((1, 9), (1, 11))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("b", utf16!("b")),
                        Span::new((4, 8), (4, 9)),
                    ),
                    Some(Literal::new(20, Span::new((4, 12), (4, 14))).into()),
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
fn multiline_comment_no_lineterminator() {
    let s = indoc! {"
        let a = 10; /* Test comment */ let b = 20;
    "};

    let interner = &mut Interner::default();
    check_script_parser(
        s,
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 5), (1, 6)),
                    ),
                    Some(Literal::new(10, Span::new((1, 9), (1, 11))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("b", utf16!("b")),
                        Span::new((1, 36), (1, 37)),
                    ),
                    Some(Literal::new(20, Span::new((1, 40), (1, 42))).into()),
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
fn assignment_line_terminator() {
    let s = indoc! {"
        let a = 3;

        a =
        5;
    "};

    let interner = &mut Interner::default();
    check_script_parser(
        s,
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("a", utf16!("a")),
                        Span::new((1, 5), (1, 6)),
                    ),
                    Some(Literal::new(3, Span::new((1, 9), (1, 10))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Assign,
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((3, 1), (3, 2)),
                )
                .into(),
                Literal::new(5, Span::new((4, 1), (4, 2))).into(),
            )))
            .into(),
        ],
        interner,
    );
}

#[test]
fn assignment_multiline_terminator() {
    let s = indoc! {"
        let a = 3;


        a =


        5;
    "};

    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    check_script_parser(
        s,
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(a, Span::new((1, 5), (1, 6))),
                    Some(Literal::new(3, Span::new((1, 9), (1, 10))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Statement::Expression(Expression::from(Assign::new(
                AssignOp::Assign,
                Identifier::new(a, Span::new((4, 1), (4, 2))).into(),
                Literal::new(5, Span::new((7, 1), (7, 2))).into(),
            )))
            .into(),
        ],
        interner,
    );
}

#[test]
fn bracketed_expr() {
    let s = "(b)";

    let interner = &mut Interner::default();
    check_script_parser(
        s,
        vec![
            Statement::Expression(
                Parenthesized::new(
                    Identifier::new(
                        interner.get_or_intern_static("b", utf16!("b")),
                        Span::new((1, 2), (1, 3)),
                    )
                    .into(),
                    Span::new((1, 1), (1, 4)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

#[test]
fn increment_in_comma_op() {
    let s = "(b++, b)";

    let interner = &mut Interner::default();
    let b = interner.get_or_intern_static("b", utf16!("b"));
    check_script_parser(
        s,
        vec![
            Statement::Expression(
                Parenthesized::new(
                    Binary::new(
                        BinaryOp::Comma,
                        Update::new(
                            UpdateOp::IncrementPost,
                            UpdateTarget::Identifier(Identifier::new(b, Span::new((1, 2), (1, 3)))),
                            Span::new((1, 2), (1, 5)),
                        )
                        .into(),
                        Identifier::new(b, Span::new((1, 7), (1, 8))).into(),
                    )
                    .into(),
                    Span::new((1, 1), (1, 9)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

#[test]
fn spread_in_object() {
    let s = indoc! {"
        let x = {
            a: 1,
            ...b,
        }
    "};

    let interner = &mut Interner::default();

    let object_properties = vec![
        PropertyDefinition::Property(
            Identifier::new(
                interner.get_or_intern_static("a", utf16!("a")),
                Span::new((2, 5), (2, 6)),
            )
            .into(),
            Literal::new(1, Span::new((2, 8), (2, 9))).into(),
        ),
        PropertyDefinition::SpreadObject(
            Identifier::new(
                interner.get_or_intern_static("b", utf16!("b")),
                Span::new((3, 8), (3, 9)),
            )
            .into(),
        ),
    ];

    check_script_parser(
        s,
        vec![
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(
                        interner.get_or_intern_static("x", utf16!("x")),
                        Span::new((1, 5), (1, 6)),
                    ),
                    Some(ObjectLiteral::new(object_properties, Span::new((1, 9), (4, 2))).into()),
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
fn spread_in_arrow_function() {
    let s = indoc! {r#"
        (...b) => {
            b
        }
    "#};

    let interner = &mut Interner::default();
    let b = interner.get_or_intern_static("b", utf16!("b"));
    let params = FormalParameterList::from(FormalParameter::new(
        Variable::from_identifier(Identifier::new(b, Span::new((1, 5), (1, 6))), None),
        true,
    ));
    assert_eq!(params.flags(), FormalParameterListFlags::HAS_REST_PARAMETER);
    assert_eq!(params.length(), 0);
    check_script_parser(
        s,
        vec![
            Statement::Expression(
                ArrowFunction::new(
                    None,
                    params,
                    FunctionBody::new(
                        StatementList::new(
                            [Statement::Expression(
                                Identifier::new(b, Span::new((2, 5), (2, 6))).into(),
                            )
                            .into()],
                            PSEUDO_LINEAR_POS,
                            false,
                        ),
                        Span::new((1, 11), (3, 2)),
                    ),
                    EMPTY_LINEAR_SPAN,
                    Span::new((1, 1), (3, 2)),
                )
                .into(),
            )
            .into(),
        ],
        interner,
    );
}

#[test]
fn empty_statement() {
    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    check_script_parser(
        indoc! {"
            ;;var a = 10;
            if(a) ;
        "},
        vec![
            Statement::Empty.into(),
            Statement::Empty.into(),
            Statement::Var(VarDeclaration(
                vec![Variable::from_identifier(
                    Identifier::new(a, Span::new((1, 7), (1, 8))),
                    Some(Literal::new(10, Span::new((1, 11), (1, 13))).into()),
                )]
                .try_into()
                .unwrap(),
            ))
            .into(),
            Statement::If(If::new(
                Identifier::new(a, Span::new((2, 4), (2, 5))).into(),
                Statement::Empty,
                None,
            ))
            .into(),
        ],
        interner,
    );
}

#[test]
fn empty_statement_ends_directive_prologues() {
    let interner = &mut Interner::default();
    let a = interner.get_or_intern_static("a", utf16!("a"));
    let use_strict = interner.get_or_intern_static("use strict", utf16!("use strict"));
    let public = interner.get_or_intern_static("public", utf16!("public"));
    check_script_parser(
        indoc! {r#"
            "a";
            ;
            "use strict";
            let public = 5;
        "#},
        vec![
            Statement::Expression(Literal::new(a, Span::new((1, 1), (1, 4))).into()).into(),
            Statement::Empty.into(),
            Statement::Expression(Literal::new(use_strict, Span::new((3, 1), (3, 13))).into())
                .into(),
            Declaration::Lexical(LexicalDeclaration::Let(
                vec![Variable::from_identifier(
                    Identifier::new(public, Span::new((4, 5), (4, 11))),
                    Some(Literal::new(5, Span::new((4, 14), (4, 15))).into()),
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
fn hashbang_use_strict_no_with() {
    check_script_parser(
        r#"#!\"use strict"
        "#,
        vec![],
        &mut Interner::default(),
    );
}

#[test]
fn hashbang_use_strict_with_with_statement() {
    check_script_parser(
        indoc! {r#"
            #!\"use strict"
            with({}) {}
        "#},
        vec![
            Statement::With(With::new(
                ObjectLiteral::new([], Span::new((2, 6), (2, 8))).into(),
                Block::from(StatementList::new([], LinearPosition::new(27), false)).into(),
            ))
            .into(),
        ],
        &mut Interner::default(),
    );
}

#[test]
fn hashbang_comment() {
    check_script_parser(r"#!Comment Here", vec![], &mut Interner::default());
}

#[test]
fn deny_unicode_escape_in_false_expression() {
    check_invalid_script(r"let x = f\u{61}lse;");
}

#[test]
fn deny_unicode_escape_in_true_expression() {
    check_invalid_script(r"let x = tru\u{65};");
}

#[test]
fn deny_unicode_escape_in_null_expression() {
    check_invalid_script(r"let x = n\u{75}ll;");
}

#[test]
fn stress_test_operations() {
    let src = ("1 * 2 + /* comment why not */ 3 / 4 % 5 + ".repeat(1_000)
        + "1; // end of line\n\n")
        .repeat(1_000);

    assert!(
        Parser::new(Source::from_bytes(&src))
            .parse_script(&Scope::new_global(), &mut Interner::default())
            .is_ok()
    );
}

#[test]
fn debugger_statement() {
    check_script_parser(
        "debugger;",
        vec![Statement::Debugger.into()],
        &mut Interner::default(),
    );

    check_script_parser(
        "debugger",
        vec![Statement::Debugger.into()],
        &mut Interner::default(),
    );

    check_invalid_script("!debugger");

    check_invalid_script("let x = debugger;");

    check_invalid_script("debugger + debugger");
}

#[test]
fn invalid_arrow_function() {
    check_invalid_script(r#"(!()=>"#);
    check_invalid_script(r#"!()=>{}"#);
}
