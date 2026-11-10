use super::*;

#[test]
fn context() {
    let result: ParseResult<String> = ParseResult::Err(Error::expected(
        ["testing".to_owned()],
        "nottesting",
        Span::new(Position::new(1, 1), Position::new(1, 1)),
        "before",
    ));

    assert_eq!(result.context(), Some("before"));

    let result = result.set_context("after");

    assert_eq!(result.context(), Some("after"));

    let error = result.unwrap_err();
    if let Error::Expected {
        expected,
        found,
        span,
        context,
    } = error
    {
        assert_eq!(expected.as_ref(), &["testing".to_owned()]);
        assert_eq!(found, "nottesting".into());
        assert_eq!(span, Span::new(Position::new(1, 1), Position::new(1, 1)));
        assert_eq!(context, "after");
    } else {
        unreachable!();
    }

    let err = Error::AbruptEnd;
    assert!(err.context().is_none());
    let err = err.set_context("ignored");
    assert!(err.context().is_none());
}

#[test]
fn from_lex_error() {
    let lex_err = LexError::syntax("testing", Position::new(1, 1));
    let parse_err: Error = lex_err.into();

    assert!(matches!(parse_err, Error::Lex { .. }));

    let lex_err = LexError::syntax("testing", Position::new(1, 1));
    let parse_err = Error::lex(lex_err);

    assert!(matches!(parse_err, Error::Lex { .. }));
}

#[test]
fn misplaced_function_declaration() {
    let err = Error::misplaced_function_declaration(Position::new(1, 1), false);
    if let Error::General { message, position } = err {
        assert_eq!(
            message.as_ref(),
            "functions can only be declared at the top level or inside a block."
        );
        assert_eq!(position, Position::new(1, 1));
    } else {
        unreachable!()
    }

    let err = Error::misplaced_function_declaration(Position::new(1, 1), true);
    if let Error::General { message, position } = err {
        assert_eq!(
            message.as_ref(),
            "in strict mode code, functions can only be declared at the top level or inside a block."
        );
        assert_eq!(position, Position::new(1, 1));
    } else {
        unreachable!()
    }
}

#[test]
fn wrong_labelled_function_declaration() {
    let err = Error::wrong_labelled_function_declaration(Position::new(1, 1));
    if let Error::General { message, position } = err {
        assert_eq!(
            message.as_ref(),
            "labelled functions can only be declared at the top level or inside a block"
        );
        assert_eq!(position, Position::new(1, 1));
    } else {
        unreachable!()
    }
}

#[test]
fn display() {
    let err = Error::expected(
        ["testing".to_owned()],
        "nottesting",
        Span::new(Position::new(1, 1), Position::new(1, 1)),
        "context",
    );
    assert_eq!(
        err.to_string(),
        "expected token 'testing', got 'nottesting' in context at line 1, col 1"
    );

    let err = Error::expected(
        ["testing".to_owned(), "more".to_owned()],
        "nottesting",
        Span::new(Position::new(1, 1), Position::new(1, 3)),
        "context",
    );
    assert_eq!(
        err.to_string(),
        "expected one of 'testing' or 'more', got 'nottesting' in context at line 1, col 1"
    );

    let err = Error::expected(
        ["testing".to_owned(), "more".to_owned(), "tokens".to_owned()],
        "nottesting",
        Span::new(Position::new(1, 1), Position::new(1, 3)),
        "context",
    );
    assert_eq!(
        err.to_string(),
        "expected one of 'testing', 'more' or 'tokens', got 'nottesting' in context at line 1, col 1"
    );

    let err = Error::expected(
        [
            "testing".to_owned(),
            "more".to_owned(),
            "tokens".to_owned(),
            "extra".to_owned(),
        ],
        "nottesting",
        Span::new(Position::new(1, 1), Position::new(1, 3)),
        "context",
    );
    assert_eq!(
        err.to_string(),
        "expected one of 'testing', 'more', 'tokens' or 'extra', got 'nottesting' in context at line 1, col 1"
    );

    let err = Error::unexpected(
        "nottesting",
        Span::new(Position::new(1, 1), Position::new(1, 3)),
        "error message",
    );
    assert_eq!(
        err.to_string(),
        "unexpected token 'nottesting', error message at line 1, col 1"
    );

    let err = Error::general("this is a general error message", Position::new(1, 1));
    assert_eq!(
        err.to_string(),
        "this is a general error message at line 1, col 1"
    );

    let err = Error::AbruptEnd;
    assert_eq!(err.to_string(), "abrupt end");

    let lex_err = LexError::syntax("testing", Position::new(1, 1));
    let err = Error::lex(lex_err);

    assert_eq!(err.to_string(), "testing at line 1, col 1");
}
