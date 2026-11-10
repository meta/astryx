//! Tests for the scope analysis of the AST.

#![allow(unused_crate_dependencies)]

use boa_ast::{
    Declaration, Expression, LinearPosition, LinearSpan, Script, Span, Statement, StatementList,
    StatementListItem,
    declaration::{LexicalDeclaration, Variable},
    expression::Identifier,
    function::{FormalParameter, FormalParameterList, FunctionBody, FunctionDeclaration},
    scope::Scope,
    statement::Block,
};
use boa_interner::Interner;
use boa_string::JsString;

#[test]
fn empty_script_is_ok() {
    let scope = &Scope::new_global();
    let mut script = Script::default();
    let ok = script.analyze_scope(scope, &Interner::new()).is_ok();
    assert!(ok);
    assert_eq!(scope.num_bindings(), 0);
}

#[test]
fn script_global_let() {
    let scope = Scope::new_global();
    let mut interner = Interner::new();
    let a = interner.get_or_intern("a");
    let mut script = Script::new(StatementList::new(
        [Declaration::Lexical(LexicalDeclaration::Let(
            vec![Variable::from_identifier(
                Identifier::new(a, Span::new((1, 1), (1, 1))),
                None,
            )]
            .try_into()
            .unwrap(),
        ))
        .into()],
        LinearPosition::default(),
        false,
    ));
    let ok = script.analyze_scope(&scope, &interner).is_ok();
    assert!(ok);
    assert_eq!(scope.num_bindings(), 1);
    let a = scope.get_binding_reference(&JsString::from("a")).unwrap();
    assert!(!a.is_global_object());
    assert!(a.is_lexical());
    assert!(!a.local());
}

#[test]
fn script_global_const() {
    let scope = Scope::new_global();
    let mut interner = Interner::new();
    let a = interner.get_or_intern("a");
    let mut script = Script::new(StatementList::new(
        [Declaration::Lexical(LexicalDeclaration::Const(
            vec![Variable::from_identifier(
                Identifier::new(a, Span::new((1, 1), (1, 1))),
                None,
            )]
            .try_into()
            .unwrap(),
        ))
        .into()],
        LinearPosition::default(),
        false,
    ));
    let ok = script.analyze_scope(&scope, &interner).is_ok();
    assert!(ok);
    assert_eq!(scope.num_bindings(), 1);
    let a = scope.get_binding_reference(&JsString::from("a")).unwrap();
    assert!(!a.is_global_object());
    assert!(a.is_lexical());
    assert!(!a.local());
}

#[test]
fn script_block_let() {
    let scope = Scope::new_global();
    let mut interner = Interner::new();
    let a = interner.get_or_intern("a");
    let mut script = Script::new(StatementList::new(
        [Statement::Block(Block::from((
            vec![
                Declaration::Lexical(LexicalDeclaration::Let(
                    vec![Variable::from_identifier(
                        Identifier::new(a, Span::new((1, 1), (1, 1))),
                        None,
                    )]
                    .try_into()
                    .unwrap(),
                ))
                .into(),
            ],
            LinearPosition::default(),
        )))
        .into()],
        LinearPosition::default(),
        false,
    ));
    let ok = script.analyze_scope(&scope, &interner).is_ok();
    assert!(ok);
    assert_eq!(scope.num_bindings(), 0);
    let StatementListItem::Statement(statement) = script.statements().first().unwrap() else {
        panic!("Expected a block statement");
    };
    let Statement::Block(block) = statement.as_ref() else {
        panic!("Expected a block statement");
    };
    let scope = block.scope().unwrap();
    assert_eq!(scope.num_bindings(), 1);
    let a = scope.get_binding_reference(&JsString::from("a")).unwrap();
    assert!(!a.is_global_object());
    assert!(a.is_lexical());
    assert!(a.local());
}

#[test]
fn script_function_mapped_arguments_not_accessed() {
    let scope = Scope::new_global();
    let mut interner = Interner::new();
    let f = interner.get_or_intern("f");
    let a = interner.get_or_intern("a");
    let mut script = Script::new(StatementList::new(
        [Declaration::FunctionDeclaration(FunctionDeclaration::new(
            Identifier::new(f, Span::new((1, 1), (1, 1))),
            FormalParameterList::from_parameters(vec![FormalParameter::new(
                Variable::from_identifier(Identifier::new(a, Span::new((1, 1), (1, 1))), None),
                false,
            )]),
            FunctionBody::new(
                StatementList::new(
                    [Declaration::Lexical(LexicalDeclaration::Let(
                        vec![Variable::from_identifier(
                            Identifier::new(a, Span::new((1, 1), (1, 1))),
                            None,
                        )]
                        .try_into()
                        .unwrap(),
                    ))
                    .into()],
                    LinearPosition::default(),
                    false,
                ),
                Span::new((1, 1), (1, 1)),
            ),
            LinearSpan::default(),
        ))
        .into()],
        LinearPosition::default(),
        false,
    ));
    let ok = script.analyze_scope(&scope, &interner).is_ok();
    assert!(ok);
    assert_eq!(scope.num_bindings(), 0);

    let StatementListItem::Declaration(declaration) = script.statements().first().unwrap() else {
        panic!("Expected a block statement");
    };
    let Declaration::FunctionDeclaration(f) = declaration.as_ref() else {
        panic!("Expected a block statement");
    };

    assert_eq!(f.scopes().function_scope().num_bindings(), 2);
    assert_eq!(f.scopes().parameters_eval_scope(), None);
    assert_eq!(f.scopes().parameters_scope(), None);
    assert_eq!(f.scopes().lexical_scope().unwrap().num_bindings(), 1);
    let arguments = f
        .scopes()
        .function_scope()
        .get_binding_reference(&JsString::from("arguments"))
        .unwrap();
    assert!(!f.scopes().arguments_object_accessed());
    assert!(!arguments.is_global_object());
    assert!(arguments.is_lexical());
    assert!(arguments.local());
    let a = f
        .scopes()
        .function_scope()
        .get_binding_reference(&JsString::from("a"))
        .unwrap();
    assert!(!a.is_global_object());
    assert!(a.is_lexical());
    assert!(a.local());
    let a = f
        .scopes()
        .lexical_scope()
        .unwrap()
        .get_binding_reference(&JsString::from("a"))
        .unwrap();
    assert!(!a.is_global_object());
    assert!(a.is_lexical());
    assert!(a.local());
}

#[test]
fn script_function_mapped_arguments_accessed() {
    let scope = Scope::new_global();
    let mut interner = Interner::new();
    let f = interner.get_or_intern("f");
    let a = interner.get_or_intern("a");
    let arguments = interner.get_or_intern("arguments");
    let mut script = Script::new(StatementList::new(
        [Declaration::FunctionDeclaration(FunctionDeclaration::new(
            Identifier::new(f, Span::new((1, 1), (1, 1))),
            FormalParameterList::from_parameters(vec![FormalParameter::new(
                Variable::from_identifier(Identifier::new(a, Span::new((1, 1), (1, 1))), None),
                false,
            )]),
            FunctionBody::new(
                StatementList::new(
                    [
                        Declaration::Lexical(LexicalDeclaration::Let(
                            vec![Variable::from_identifier(
                                Identifier::new(a, Span::new((1, 1), (1, 1))),
                                None,
                            )]
                            .try_into()
                            .unwrap(),
                        ))
                        .into(),
                        Statement::Expression(Expression::Identifier(Identifier::new(
                            arguments,
                            Span::new((1, 1), (1, 1)),
                        )))
                        .into(),
                    ],
                    LinearPosition::default(),
                    false,
                ),
                Span::new((1, 1), (1, 1)),
            ),
            LinearSpan::default(),
        ))
        .into()],
        LinearPosition::default(),
        false,
    ));
    let ok = script.analyze_scope(&scope, &interner).is_ok();
    assert!(ok);
    assert_eq!(scope.num_bindings(), 0);
    let StatementListItem::Declaration(declaration) = script.statements().first().unwrap() else {
        panic!("Expected a block statement");
    };
    let Declaration::FunctionDeclaration(f) = declaration.as_ref() else {
        panic!("Expected a block statement");
    };
    assert!(f.scopes().arguments_object_accessed());
    assert_eq!(f.scopes().function_scope().num_bindings(), 2);
    assert_eq!(f.scopes().parameters_eval_scope(), None);
    assert_eq!(f.scopes().parameters_scope(), None);
    assert_eq!(f.scopes().lexical_scope().unwrap().num_bindings(), 1);
    let arguments = f
        .scopes()
        .function_scope()
        .get_binding_reference(&JsString::from("arguments"))
        .unwrap();
    assert!(!arguments.is_global_object());
    assert!(arguments.is_lexical());
    assert!(arguments.local());
    let a = f
        .scopes()
        .function_scope()
        .get_binding_reference(&JsString::from("a"))
        .unwrap();
    assert!(!a.is_global_object());
    assert!(a.is_lexical());
    assert!(!a.local());
    let a = f
        .scopes()
        .lexical_scope()
        .unwrap()
        .get_binding_reference(&JsString::from("a"))
        .unwrap();
    assert!(!a.is_global_object());
    assert!(a.is_lexical());
    assert!(a.local());
}

#[test]
fn multiple_scopes_with_same_parent_have_distinct_ids() {
    let global = Scope::new_global();
    let child1 = Scope::new(global.clone(), false);
    let child2 = Scope::new(global.clone(), false);
    let child3 = Scope::new(child1.clone(), false);
    let child4 = Scope::new(child1.clone(), false);

    // Check uniqueness by inserting in a set and asserting that there are
    // 5 elements numbered from 0 to 4.
    let mut ids = [global, child1, child2, child3, child4]
        .into_iter()
        .map(|scope| scope.unique_id())
        .collect::<Vec<u32>>();
    ids.sort_unstable();

    assert_eq!(ids, vec![0, 1, 2, 3, 4]);
}

#[test]
fn can_correlate_binding_to_scope() {
    // GIVEN
    let global = Scope::new_global();
    let child1 = Scope::new(global.clone(), false);
    let child2 = Scope::new(child1.clone(), false);
    let _unused = child1.create_mutable_binding("x".into(), false);

    // WHEN
    let binding = child2.get_identifier_reference("x".into());

    // THEN
    assert_eq!(binding.locator().unique_scope_id(), child1.unique_id());
}
