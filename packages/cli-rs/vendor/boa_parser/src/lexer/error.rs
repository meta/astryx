//! This module contains the errors used by the lexer.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard

use boa_ast::Position;
use std::{error, fmt, io};

/// An error that occurred during the lexing.
#[derive(Debug)]
pub enum Error {
    /// An IO error is raised to indicate an issue when the lexer is reading data that isn't
    /// related to the sourcecode itself.
    IO(io::Error),

    /// Indicates a parsing error due to the presence, or lack of, one or more characters.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-syntaxerror
    Syntax(Box<str>, Position),
}

impl From<io::Error> for Error {
    #[inline]
    fn from(err: io::Error) -> Self {
        Self::IO(err)
    }
}

impl Error {
    /// Creates a new syntax error.
    #[inline]
    pub(crate) fn syntax<M, P>(err: M, pos: P) -> Self
    where
        M: Into<Box<str>>,
        P: Into<Position>,
    {
        Self::Syntax(err.into(), pos.into())
    }

    /// Creates an "unexpected" syntax error (found X, with message).
    #[inline]
    pub(crate) fn unexpected<F, M, P>(found: F, message: M, pos: P) -> Self
    where
        F: fmt::Display,
        M: Into<Box<str>>,
        P: Into<Position>,
    {
        Self::Syntax(
            format!("unexpected {found}, {}", message.into().as_ref()).into(),
            pos.into(),
        )
    }
}

impl fmt::Display for Error {
    #[inline]
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::IO(e) => e.fmt(f),
            Self::Syntax(e, pos) => write!(
                f,
                "{e} at line {}, col {}",
                pos.line_number(),
                pos.column_number()
            ),
        }
    }
}

impl error::Error for Error {
    #[inline]
    fn source(&self) -> Option<&(dyn error::Error + 'static)> {
        match self {
            Self::IO(err) => Some(err),
            Self::Syntax(_, _) => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{error::Error as _, io};

    #[test]
    fn syntax() {
        let err = Error::syntax("testing", Position::new(1, 1));
        if let Error::Syntax(err, pos) = err {
            assert_eq!(err.as_ref(), "testing");
            assert_eq!(pos, Position::new(1, 1));
        } else {
            unreachable!()
        }

        let err = Error::syntax("testing", Position::new(1, 1));
        assert_eq!(err.to_string(), "testing at line 1, col 1");
        assert!(err.source().is_none());
    }

    #[test]
    fn io() {
        let custom_error = io::Error::other("I/O error");
        let err = custom_error.into();
        if let Error::IO(err) = err {
            assert_eq!(err.to_string(), "I/O error");
        } else {
            unreachable!()
        }

        let custom_error = io::Error::other("I/O error");
        let err: Error = custom_error.into();
        assert_eq!(err.to_string(), "I/O error");
        err.source().map_or_else(
            || unreachable!(),
            |io_err| {
                assert_eq!(io_err.to_string(), "I/O error");
            },
        );
    }
}
