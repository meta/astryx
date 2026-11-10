use crate::parser::tests::check_script_parser;
use boa_ast::{
    Declaration, Expression, Span, Statement, StatementList, StatementListItem,
    declaration::{LexicalDeclaration, Variable, VariableList},
    expression::{
        Call, Identifier, NewTarget,
        access::{PropertyAccess, SimplePropertyAccess},
        literal::Literal,
    },
    function::{
        ClassDeclaration, ClassElement, ClassFieldDefinition, ClassMethodDefinition,
        FormalParameterList, FunctionBody, FunctionExpression,
    },
    property::MethodDefinitionKind,
};
use boa_interner::Interner;
use boa_macros::utf16;
use indoc::indoc;

#[test]
fn check_async_ordinary_method() {
    let interner = &mut Interner::default();

    let elements = vec![ClassElement::MethodDefinition(ClassMethodDefinition::new(
        boa_ast::function::ClassElementName::PropertyName(
            Identifier::new(
                interner.get_or_intern_static("async", utf16!("async")),
                Span::new((2, 5), (2, 10)),
            )
            .into(),
        ),
        FormalParameterList::default(),
        FunctionBody::new(StatementList::default(), Span::new((2, 13), (2, 16))),
        MethodDefinitionKind::Ordinary,
        false,
        boa_ast::LinearPosition::default(),
    ))];

    check_script_parser(
        indoc! {r#"
            class A {
                async() { }
            }
        "#},
        [Declaration::ClassDeclaration(
            ClassDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("A", utf16!("A")),
                    Span::new((1, 7), (1, 8)),
                ),
                None,
                None,
                elements.into(),
            )
            .into(),
        )
        .into()],
        interner,
    );
}

#[test]
fn check_async_field_initialization() {
    let interner = &mut Interner::default();

    let elements = vec![ClassElement::FieldDefinition(ClassFieldDefinition::new(
        Identifier::new(
            interner.get_or_intern_static("async", utf16!("async")),
            Span::new((2, 5), (2, 10)),
        )
        .into(),
        Some(Literal::new(1, Span::new((3, 7), (3, 8))).into()),
    ))];

    check_script_parser(
        indoc! {"
            class A {
                async
                = 1
            }
        "},
        [
            Declaration::ClassDeclaration(Box::new(ClassDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("A", utf16!("A")),
                    Span::new((1, 7), (1, 8)),
                ),
                None,
                None,
                elements.into(),
            )))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_async_field() {
    let interner = &mut Interner::default();

    let elements = vec![ClassElement::FieldDefinition(ClassFieldDefinition::new(
        Identifier::new(
            interner.get_or_intern_static("async", utf16!("async")),
            Span::new((2, 5), (2, 10)),
        )
        .into(),
        None,
    ))];

    check_script_parser(
        indoc! {r#"
            class A {
                async
            }
        "#},
        [
            Declaration::ClassDeclaration(Box::new(ClassDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("A", utf16!("A")),
                    Span::new((1, 7), (1, 8)),
                ),
                None,
                None,
                elements.into(),
            )))
            .into(),
        ],
        interner,
    );
}

#[test]
fn check_new_target_with_property_access() {
    let interner = &mut Interner::default();

    let new_target = Expression::PropertyAccess(
        SimplePropertyAccess::new(
            NewTarget::new(Span::new((3, 21), (3, 31))).into(),
            Identifier::new(
                interner.get_or_intern_static("name", utf16!("name")),
                Span::new((3, 32), (3, 36)),
            ),
        )
        .into(),
    );

    let console = Call::new(
        PropertyAccess::Simple(SimplePropertyAccess::new(
            Identifier::new(
                interner.get_or_intern_static("console", utf16!("console")),
                Span::new((3, 9), (3, 16)),
            )
            .into(),
            Identifier::new(
                interner.get_or_intern_static("log", utf16!("log")),
                Span::new((3, 17), (3, 20)),
            ),
        ))
        .into(),
        [new_target].into(),
        Span::new((3, 20), (3, 37)),
    )
    .into();

    let constructor = FunctionExpression::new(
        Some(Identifier::new(
            interner.get_or_intern_static("A", utf16!("A")),
            Span::new((1, 7), (1, 8)),
        )),
        FormalParameterList::default(),
        FunctionBody::new(
            StatementList::new(
                [Statement::Expression(console).into()],
                boa_ast::LinearPosition::new(0),
                false,
            ),
            Span::new((2, 19), (4, 6)),
        ),
        None,
        false,
        Span::new((2, 5), (4, 6)),
    );

    let class = ClassDeclaration::new(
        Identifier::new(interner.get("A").unwrap(), Span::new((1, 7), (1, 8))),
        None,
        Some(constructor),
        Box::default(),
    );

    let instantiation = Expression::New(
        Call::new(
            Identifier::new(interner.get("A").unwrap(), Span::new((6, 15), (6, 16))).into(),
            Box::default(),
            Span::new((6, 11), (6, 18)),
        )
        .into(),
    );

    let const_decl = LexicalDeclaration::Const(
        VariableList::new(
            [Variable::from_identifier(
                Identifier::new(
                    interner.get_or_intern_static("a", utf16!("a")),
                    Span::new((6, 7), (6, 8)),
                ),
                Some(instantiation),
            )]
            .into(),
        )
        .unwrap(),
    );

    let script = [
        StatementListItem::Declaration(Declaration::ClassDeclaration(class.into()).into()),
        StatementListItem::Declaration(Declaration::Lexical(const_decl).into()),
    ];

    check_script_parser(
        indoc! {r#"
            class A {
                constructor() {
                    console.log(new.target.name);
                }
            }
            const a = new A();
        "#},
        script,
        interner,
    );
}

#[test]
fn check_non_reserved_keyword_as_identifier() {
    let interner = &mut Interner::default();

    check_script_parser(
        indoc! {r#"
            class of {}
        "#},
        [Declaration::ClassDeclaration(
            ClassDeclaration::new(
                Identifier::new(
                    interner.get_or_intern_static("of", utf16!("of")),
                    Span::new((1, 7), (1, 9)),
                ),
                None,
                None,
                vec![].into(),
            )
            .into(),
        )
        .into()],
        interner,
    );
}
