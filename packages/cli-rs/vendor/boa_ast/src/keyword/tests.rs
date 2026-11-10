#![allow(clippy::cognitive_complexity)]

use super::*;

/// Gets a list of all the keywords.
fn all_keywords() -> impl Iterator<Item = Keyword> {
    [
        Keyword::Await,
        Keyword::Async,
        Keyword::Break,
        Keyword::Case,
        Keyword::Catch,
        Keyword::Class,
        Keyword::Continue,
        Keyword::Const,
        Keyword::Debugger,
        Keyword::Default,
        Keyword::Delete,
        Keyword::Do,
        Keyword::Else,
        Keyword::Enum,
        Keyword::Export,
        Keyword::Extends,
        Keyword::Finally,
        Keyword::For,
        Keyword::Function,
        Keyword::If,
        Keyword::In,
        Keyword::InstanceOf,
        Keyword::Import,
        Keyword::Let,
        Keyword::New,
        Keyword::Of,
        Keyword::Return,
        Keyword::Super,
        Keyword::Switch,
        Keyword::This,
        Keyword::Throw,
        Keyword::Try,
        Keyword::TypeOf,
        Keyword::Var,
        Keyword::Void,
        Keyword::While,
        Keyword::With,
        Keyword::Yield,
    ]
    .into_iter()
}

#[test]
fn as_binary_op() {
    for k in all_keywords() {
        match k.as_binary_op() {
            Some(BinaryOp::Relational(RelationalOp::InstanceOf)) => {
                assert_eq!(k, Keyword::InstanceOf);
            }
            Some(BinaryOp::Relational(RelationalOp::In)) => assert_eq!(k, Keyword::In),
            None => {
                assert_ne!(k, Keyword::InstanceOf);
                assert_ne!(k, Keyword::In);
            }
            _ => unreachable!("unknown binary operator for keyword {k:?} found"),
        }
    }
}

#[test]
fn as_str() {
    for k in all_keywords() {
        match k.as_str() {
            ("await", utf16) => {
                assert_eq!(k, Keyword::Await);
                assert_eq!(utf16, utf16!("await"));
            }
            ("async", utf16) => {
                assert_eq!(k, Keyword::Async);
                assert_eq!(utf16, utf16!("async"));
            }
            ("break", utf16) => {
                assert_eq!(k, Keyword::Break);
                assert_eq!(utf16, utf16!("break"));
            }
            ("case", utf16) => {
                assert_eq!(k, Keyword::Case);
                assert_eq!(utf16, utf16!("case"));
            }
            ("catch", utf16) => {
                assert_eq!(k, Keyword::Catch);
                assert_eq!(utf16, utf16!("catch"));
            }
            ("class", utf16) => {
                assert_eq!(k, Keyword::Class);
                assert_eq!(utf16, utf16!("class"));
            }
            ("continue", utf16) => {
                assert_eq!(k, Keyword::Continue);
                assert_eq!(utf16, utf16!("continue"));
            }
            ("const", utf16) => {
                assert_eq!(k, Keyword::Const);
                assert_eq!(utf16, utf16!("const"));
            }
            ("debugger", utf16) => {
                assert_eq!(k, Keyword::Debugger);
                assert_eq!(utf16, utf16!("debugger"));
            }
            ("default", utf16) => {
                assert_eq!(k, Keyword::Default);
                assert_eq!(utf16, utf16!("default"));
            }
            ("delete", utf16) => {
                assert_eq!(k, Keyword::Delete);
                assert_eq!(utf16, utf16!("delete"));
            }
            ("do", utf16) => {
                assert_eq!(k, Keyword::Do);
                assert_eq!(utf16, utf16!("do"));
            }
            ("else", utf16) => {
                assert_eq!(k, Keyword::Else);
                assert_eq!(utf16, utf16!("else"));
            }
            ("enum", utf16) => {
                assert_eq!(k, Keyword::Enum);
                assert_eq!(utf16, utf16!("enum"));
            }
            ("extends", utf16) => {
                assert_eq!(k, Keyword::Extends);
                assert_eq!(utf16, utf16!("extends"));
            }
            ("export", utf16) => {
                assert_eq!(k, Keyword::Export);
                assert_eq!(utf16, utf16!("export"));
            }
            ("finally", utf16) => {
                assert_eq!(k, Keyword::Finally);
                assert_eq!(utf16, utf16!("finally"));
            }
            ("for", utf16) => {
                assert_eq!(k, Keyword::For);
                assert_eq!(utf16, utf16!("for"));
            }
            ("function", utf16) => {
                assert_eq!(k, Keyword::Function);
                assert_eq!(utf16, utf16!("function"));
            }
            ("if", utf16) => {
                assert_eq!(k, Keyword::If);
                assert_eq!(utf16, utf16!("if"));
            }
            ("in", utf16) => {
                assert_eq!(k, Keyword::In);
                assert_eq!(utf16, utf16!("in"));
            }
            ("instanceof", utf16) => {
                assert_eq!(k, Keyword::InstanceOf);
                assert_eq!(utf16, utf16!("instanceof"));
            }
            ("import", utf16) => {
                assert_eq!(k, Keyword::Import);
                assert_eq!(utf16, utf16!("import"));
            }
            ("let", utf16) => {
                assert_eq!(k, Keyword::Let);
                assert_eq!(utf16, utf16!("let"));
            }
            ("new", utf16) => {
                assert_eq!(k, Keyword::New);
                assert_eq!(utf16, utf16!("new"));
            }
            ("of", utf16) => {
                assert_eq!(k, Keyword::Of);
                assert_eq!(utf16, utf16!("of"));
            }
            ("return", utf16) => {
                assert_eq!(k, Keyword::Return);
                assert_eq!(utf16, utf16!("return"));
            }
            ("super", utf16) => {
                assert_eq!(k, Keyword::Super);
                assert_eq!(utf16, utf16!("super"));
            }
            ("switch", utf16) => {
                assert_eq!(k, Keyword::Switch);
                assert_eq!(utf16, utf16!("switch"));
            }
            ("this", utf16) => {
                assert_eq!(k, Keyword::This);
                assert_eq!(utf16, utf16!("this"));
            }
            ("throw", utf16) => {
                assert_eq!(k, Keyword::Throw);
                assert_eq!(utf16, utf16!("throw"));
            }
            ("try", utf16) => {
                assert_eq!(k, Keyword::Try);
                assert_eq!(utf16, utf16!("try"));
            }
            ("typeof", utf16) => {
                assert_eq!(k, Keyword::TypeOf);
                assert_eq!(utf16, utf16!("typeof"));
            }
            ("var", utf16) => {
                assert_eq!(k, Keyword::Var);
                assert_eq!(utf16, utf16!("var"));
            }
            ("void", utf16) => {
                assert_eq!(k, Keyword::Void);
                assert_eq!(utf16, utf16!("void"));
            }
            ("while", utf16) => {
                assert_eq!(k, Keyword::While);
                assert_eq!(utf16, utf16!("while"));
            }
            ("with", utf16) => {
                assert_eq!(k, Keyword::With);
                assert_eq!(utf16, utf16!("with"));
            }
            ("yield", utf16) => {
                assert_eq!(k, Keyword::Yield);
                assert_eq!(utf16, utf16!("yield"));
            }
            (_, _) => unreachable!("unknown keyword {k:?} found"),
        }
    }
}

#[test]
fn to_sym() {
    for k in all_keywords() {
        match k.to_sym() {
            Sym::AWAIT => assert_eq!(k, Keyword::Await),
            Sym::ASYNC => assert_eq!(k, Keyword::Async),
            Sym::BREAK => assert_eq!(k, Keyword::Break),
            Sym::CASE => assert_eq!(k, Keyword::Case),
            Sym::CATCH => assert_eq!(k, Keyword::Catch),
            Sym::CLASS => assert_eq!(k, Keyword::Class),
            Sym::CONTINUE => assert_eq!(k, Keyword::Continue),
            Sym::CONST => assert_eq!(k, Keyword::Const),
            Sym::DEBUGGER => assert_eq!(k, Keyword::Debugger),
            Sym::DEFAULT => assert_eq!(k, Keyword::Default),
            Sym::DELETE => assert_eq!(k, Keyword::Delete),
            Sym::DO => assert_eq!(k, Keyword::Do),
            Sym::ELSE => assert_eq!(k, Keyword::Else),
            Sym::ENUM => assert_eq!(k, Keyword::Enum),
            Sym::EXPORT => assert_eq!(k, Keyword::Export),
            Sym::EXTENDS => assert_eq!(k, Keyword::Extends),
            Sym::FINALLY => assert_eq!(k, Keyword::Finally),
            Sym::FOR => assert_eq!(k, Keyword::For),
            Sym::FUNCTION => assert_eq!(k, Keyword::Function),
            Sym::IF => assert_eq!(k, Keyword::If),
            Sym::IN => assert_eq!(k, Keyword::In),
            Sym::INSTANCEOF => assert_eq!(k, Keyword::InstanceOf),
            Sym::IMPORT => assert_eq!(k, Keyword::Import),
            Sym::LET => assert_eq!(k, Keyword::Let),
            Sym::NEW => assert_eq!(k, Keyword::New),
            Sym::OF => assert_eq!(k, Keyword::Of),
            Sym::RETURN => assert_eq!(k, Keyword::Return),
            Sym::SUPER => assert_eq!(k, Keyword::Super),
            Sym::SWITCH => assert_eq!(k, Keyword::Switch),
            Sym::THIS => assert_eq!(k, Keyword::This),
            Sym::THROW => assert_eq!(k, Keyword::Throw),
            Sym::TRY => assert_eq!(k, Keyword::Try),
            Sym::TYPEOF => assert_eq!(k, Keyword::TypeOf),
            Sym::VAR => assert_eq!(k, Keyword::Var),
            Sym::VOID => assert_eq!(k, Keyword::Void),
            Sym::WHILE => assert_eq!(k, Keyword::While),
            Sym::WITH => assert_eq!(k, Keyword::With),
            Sym::YIELD => assert_eq!(k, Keyword::Yield),
            _ => unreachable!("unknown keyword {k:?} found"),
        }
    }
}

#[test]
fn try_into_binary_op() {
    for k in all_keywords() {
        match k {
            Keyword::InstanceOf | Keyword::In => assert!(BinaryOp::try_from(k).is_ok()),
            Keyword::Await
            | Keyword::Async
            | Keyword::Break
            | Keyword::Case
            | Keyword::Catch
            | Keyword::Class
            | Keyword::Continue
            | Keyword::Const
            | Keyword::Debugger
            | Keyword::Default
            | Keyword::Delete
            | Keyword::Do
            | Keyword::Else
            | Keyword::Enum
            | Keyword::Export
            | Keyword::Extends
            | Keyword::Finally
            | Keyword::For
            | Keyword::Function
            | Keyword::If
            | Keyword::Import
            | Keyword::Let
            | Keyword::New
            | Keyword::Of
            | Keyword::Return
            | Keyword::Super
            | Keyword::Switch
            | Keyword::This
            | Keyword::Throw
            | Keyword::Try
            | Keyword::TypeOf
            | Keyword::Using
            | Keyword::Var
            | Keyword::Void
            | Keyword::While
            | Keyword::With
            | Keyword::Yield => assert!(BinaryOp::try_from(k).is_err()),
        }
    }
}

#[test]
fn from_str() {
    for k in all_keywords() {
        let str = k.as_str().0;
        assert_eq!(str.parse::<Keyword>().unwrap(), k);
    }

    for invalid in ["", "testing", "invalid keyword"] {
        let result = invalid.parse::<Keyword>();
        let error = result.unwrap_err();

        assert_eq!(error.to_string(), "invalid token");
    }
}
