//! The `Keyword` AST node, which represents reserved words of the ECMAScript language.
//!
//! The [specification][spec] defines keywords as tokens that match an `IdentifierName`, but also
//! have special meaning in ECMAScript. In ECMAScript, you cannot use these reserved words as variables,
//! labels, or function names.
//!
//! The [MDN documentation][mdn] contains a more extensive explanation about keywords.
//!
//! [spec]: https://tc39.es/ecma262/#sec-keywords-and-reserved-words
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#Keywords

use crate::expression::operator::binary::{BinaryOp, RelationalOp};
use boa_interner::Sym;
use boa_macros::utf16;
use std::{convert::TryFrom, error, fmt, str::FromStr};

#[cfg(test)]
mod tests;

/// List of keywords recognized by the JavaScript grammar.
///
/// See the [module-level documentation][self] for more details.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Keyword {
    /// The `await` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AwaitExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await
    Await,

    /// The `async` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-AsyncMethod
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function
    Async,

    /// The `break` keyword.
    ///
    /// More information:
    ///  - [break `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-BreakStatement
    /// [node]: ../node/enum.Node.html#variant.Break
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/break
    Break,

    /// The `case` keyword.
    ///
    /// More information:
    ///  - [switch `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-CaseClause
    /// [node]: ../node/enum.Node.html#variant.Switch
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/switch
    Case,

    /// The `catch` keyword.
    ///
    /// More information:
    ///  - [try `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-Catch
    /// [node]: ../node/enum.Node.html#variant.Try
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch
    Catch,

    /// The `class` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-ClassDeclaration
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/class
    Class,

    /// The `continue` keyword.
    ///
    /// More information:
    ///  - [continue `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-ContinueStatement
    /// [node]: ../node/enum.Node.html#variant.Continue
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/continue
    Continue,

    /// The `const` keyword.
    ///
    /// More information:
    ///  - [const `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-let-and-const-declarations
    /// [node]: ../node/enum.Node.html#variant.ConstDecl
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const
    Const,

    /// The `debugger` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-debugger-statement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/debugger
    Debugger,

    /// The `default` keyword.
    ///
    /// More information:
    ///  - [switch `Node` documentation][node]
    ///  - [ECMAScript reference default clause][spec-clause]
    ///  - [ECMAScript reference default export][spec-export]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.Switch
    /// [spec-clause]: https://tc39.es/ecma262/#prod-DefaultClause
    /// [spec-export]: https://tc39.es/ecma262/#prod-ImportedDefaultBinding
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/default
    Default,

    /// The `delete` keyword.
    ///
    /// More information:
    ///  - [delete `UnaryOp` documentation][unary]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-delete-operator
    /// [unary]: ../op/enum.UnaryOp.html#variant.Delete
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/delete
    Delete,

    /// The `do` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-do-while-statement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/do...while
    Do,

    /// The `else` keyword.
    ///
    /// More information:
    ///  - [if `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.If
    /// [spec]: https://tc39.es/ecma262/#prod-IfStatement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/if...else
    Else,

    /// The `enum` keyword.
    ///
    /// Future reserved keyword.
    Enum,

    /// The `export` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-exports
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export
    Export,

    /// The `extends` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-ClassHeritage
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/extends
    Extends,

    /// The `finally` keyword.
    ///
    /// More information:
    ///  - [try `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.Try
    /// [spec]: https://tc39.es/ecma262/#prod-Finally
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch
    Finally,

    /// The `for` keyword.
    ///
    /// More information:
    ///  - [for loop `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.ForLoop
    /// [spec]: https://tc39.es/ecma262/#prod-ForDeclaration
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for
    For,

    /// The `function` keyword.
    ///
    /// More information:
    ///  - [function `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.FunctionDecl
    /// [spec]: https://tc39.es/ecma262/#sec-terms-and-definitions-function
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function
    Function,

    /// The `if` keyword.
    ///
    /// More information:
    ///  - [if `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.If
    /// [spec]: https://tc39.es/ecma262/#prod-IfStatement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/if...else
    If,

    /// The `in` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-RelationalExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/in
    In,

    /// The `instanceof` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-instanceofoperator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/instanceof
    InstanceOf,

    /// The `import` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-imports
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
    Import,

    /// The `let` keyword.
    ///
    /// More information:
    ///  - [let `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.LetDecl
    /// [spec]: https://tc39.es/ecma262/#sec-let-and-const-declarations
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let
    Let,

    /// The `new` keyword.
    ///
    /// More information:
    ///  - [new `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.New
    /// [spec]: https://tc39.es/ecma262/#prod-NewExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/new
    New,

    /// The `of` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-for-in-and-for-of-statements
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...of
    Of,

    /// The `return` keyword
    ///
    /// More information:
    ///  - [return `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.Return
    /// [spec]: https://tc39.es/ecma262/#prod-ReturnStatement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/return
    Return,

    /// The `super` keyword
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-super-keyword
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/super
    Super,

    /// The `switch` keyword.
    ///
    /// More information:
    ///  - [switch `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.Switch
    /// [spec]: https://tc39.es/ecma262/#prod-SwitchStatement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/switch
    Switch,

    /// The `this` keyword.
    ///
    /// More information:
    ///  - [this `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.This
    /// [spec]: https://tc39.es/ecma262/#sec-this-keyword
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this
    This,

    /// The `throw` keyword.
    ///
    /// More information:
    ///  - [throw `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.Throw
    /// [spec]: https://tc39.es/ecma262/#sec-throw-statement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/throw
    Throw,

    /// The `try` keyword.
    ///
    /// More information:
    ///  - [try `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.Try
    /// [spec]: https://tc39.es/ecma262/#prod-TryStatement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch
    Try,

    /// The `typeof` keyword.
    ///
    /// More information:
    ///  - [typeof `UnaryOp` documentation][unary]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [unary]: ../op/enum.UnaryOp.html#variant.TypeOf
    /// [spec]: https://tc39.es/ecma262/#sec-typeof-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
    TypeOf,

    /// The `var` keyword.
    ///
    /// More information:
    ///  - [var `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.VarDecl
    /// [spec]: https://tc39.es/ecma262/#prod-VariableStatement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/var
    Var,

    /// The `void` keyword.
    ///
    /// More information:
    ///  - [void `UnaryOp` documentation][unary]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [unary]: ../op/enum.UnaryOp.html#variant.Void
    /// [spec]: https://tc39.es/ecma262/#sec-void-operator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/void
    Void,

    /// The `while` keyword.
    ///
    /// More information:
    ///  - [while `Node` documentation][node]
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [node]: ../node/enum.Node.html#variant.While
    /// [spec]: https://tc39.es/ecma262/#prod-grammar-notation-WhileStatement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/while
    While,

    /// The `with` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-WithStatement
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/with
    With,

    /// The 'yield' keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-YieldExpression
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/yield
    Yield,

    /// The `using` keyword.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-explicit-resource-management/
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/using
    Using,
}

impl Keyword {
    /// Gets the keyword as a binary operation, if this keyword is the `in` or the `instanceof`
    /// keywords.
    #[must_use]
    pub const fn as_binary_op(self) -> Option<BinaryOp> {
        match self {
            Self::In => Some(BinaryOp::Relational(RelationalOp::In)),
            Self::InstanceOf => Some(BinaryOp::Relational(RelationalOp::InstanceOf)),
            _ => None,
        }
    }

    /// Gets the keyword as a tuple of strings.
    #[must_use]
    pub const fn as_str(self) -> (&'static str, &'static [u16]) {
        match self {
            Self::Await => ("await", utf16!("await")),
            Self::Async => ("async", utf16!("async")),
            Self::Break => ("break", utf16!("break")),
            Self::Case => ("case", utf16!("case")),
            Self::Catch => ("catch", utf16!("catch")),
            Self::Class => ("class", utf16!("class")),
            Self::Continue => ("continue", utf16!("continue")),
            Self::Const => ("const", utf16!("const")),
            Self::Debugger => ("debugger", utf16!("debugger")),
            Self::Default => ("default", utf16!("default")),
            Self::Delete => ("delete", utf16!("delete")),
            Self::Do => ("do", utf16!("do")),
            Self::Else => ("else", utf16!("else")),
            Self::Enum => ("enum", utf16!("enum")),
            Self::Extends => ("extends", utf16!("extends")),
            Self::Export => ("export", utf16!("export")),
            Self::Finally => ("finally", utf16!("finally")),
            Self::For => ("for", utf16!("for")),
            Self::Function => ("function", utf16!("function")),
            Self::If => ("if", utf16!("if")),
            Self::In => ("in", utf16!("in")),
            Self::InstanceOf => ("instanceof", utf16!("instanceof")),
            Self::Import => ("import", utf16!("import")),
            Self::Let => ("let", utf16!("let")),
            Self::New => ("new", utf16!("new")),
            Self::Of => ("of", utf16!("of")),
            Self::Return => ("return", utf16!("return")),
            Self::Super => ("super", utf16!("super")),
            Self::Switch => ("switch", utf16!("switch")),
            Self::This => ("this", utf16!("this")),
            Self::Throw => ("throw", utf16!("throw")),
            Self::Try => ("try", utf16!("try")),
            Self::TypeOf => ("typeof", utf16!("typeof")),
            Self::Var => ("var", utf16!("var")),
            Self::Void => ("void", utf16!("void")),
            Self::While => ("while", utf16!("while")),
            Self::With => ("with", utf16!("with")),
            Self::Yield => ("yield", utf16!("yield")),
            Self::Using => ("using", utf16!("using")),
        }
    }

    /// Converts the keyword to a symbol in the given interner.
    #[must_use]
    pub const fn to_sym(self) -> Sym {
        match self {
            Self::Await => Sym::AWAIT,
            Self::Async => Sym::ASYNC,
            Self::Break => Sym::BREAK,
            Self::Case => Sym::CASE,
            Self::Catch => Sym::CATCH,
            Self::Class => Sym::CLASS,
            Self::Continue => Sym::CONTINUE,
            Self::Const => Sym::CONST,
            Self::Debugger => Sym::DEBUGGER,
            Self::Default => Sym::DEFAULT,
            Self::Delete => Sym::DELETE,
            Self::Do => Sym::DO,
            Self::Else => Sym::ELSE,
            Self::Enum => Sym::ENUM,
            Self::Export => Sym::EXPORT,
            Self::Extends => Sym::EXTENDS,
            Self::Finally => Sym::FINALLY,
            Self::For => Sym::FOR,
            Self::Function => Sym::FUNCTION,
            Self::If => Sym::IF,
            Self::In => Sym::IN,
            Self::InstanceOf => Sym::INSTANCEOF,
            Self::Import => Sym::IMPORT,
            Self::Let => Sym::LET,
            Self::New => Sym::NEW,
            Self::Of => Sym::OF,
            Self::Return => Sym::RETURN,
            Self::Super => Sym::SUPER,
            Self::Switch => Sym::SWITCH,
            Self::This => Sym::THIS,
            Self::Throw => Sym::THROW,
            Self::Try => Sym::TRY,
            Self::TypeOf => Sym::TYPEOF,
            Self::Var => Sym::VAR,
            Self::Void => Sym::VOID,
            Self::While => Sym::WHILE,
            Self::With => Sym::WITH,
            Self::Yield => Sym::YIELD,
            Self::Using => Sym::USING,
        }
    }
}

impl TryFrom<Keyword> for BinaryOp {
    type Error = KeywordToBinaryOpError;

    fn try_from(value: Keyword) -> Result<Self, Self::Error> {
        value.as_binary_op().ok_or(KeywordToBinaryOpError)
    }
}

/// Error returned when a [`Keyword`] cannot be converted into a [`BinaryOp`].
#[derive(Debug, Clone, Copy)]
pub struct KeywordToBinaryOpError;

impl fmt::Display for KeywordToBinaryOpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "keyword is not a binary operator")
    }
}

impl error::Error for KeywordToBinaryOpError {}

/// The error type which is returned from parsing a [`str`] into a [`Keyword`].
#[derive(Debug, Clone, Copy)]
pub struct KeywordError;
impl fmt::Display for KeywordError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid token")
    }
}

// This is important for other errors to wrap this one.
impl error::Error for KeywordError {}

impl FromStr for Keyword {
    type Err = KeywordError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "await" => Ok(Self::Await),
            "async" => Ok(Self::Async),
            "break" => Ok(Self::Break),
            "case" => Ok(Self::Case),
            "catch" => Ok(Self::Catch),
            "class" => Ok(Self::Class),
            "continue" => Ok(Self::Continue),
            "const" => Ok(Self::Const),
            "debugger" => Ok(Self::Debugger),
            "default" => Ok(Self::Default),
            "delete" => Ok(Self::Delete),
            "do" => Ok(Self::Do),
            "else" => Ok(Self::Else),
            "enum" => Ok(Self::Enum),
            "extends" => Ok(Self::Extends),
            "export" => Ok(Self::Export),
            "finally" => Ok(Self::Finally),
            "for" => Ok(Self::For),
            "function" => Ok(Self::Function),
            "if" => Ok(Self::If),
            "in" => Ok(Self::In),
            "instanceof" => Ok(Self::InstanceOf),
            "import" => Ok(Self::Import),
            "let" => Ok(Self::Let),
            "new" => Ok(Self::New),
            "of" => Ok(Self::Of),
            "return" => Ok(Self::Return),
            "super" => Ok(Self::Super),
            "switch" => Ok(Self::Switch),
            "this" => Ok(Self::This),
            "throw" => Ok(Self::Throw),
            "try" => Ok(Self::Try),
            "typeof" => Ok(Self::TypeOf),
            "var" => Ok(Self::Var),
            "void" => Ok(Self::Void),
            "while" => Ok(Self::While),
            "with" => Ok(Self::With),
            "yield" => Ok(Self::Yield),
            "using" => Ok(Self::Using),
            _ => Err(KeywordError),
        }
    }
}

impl fmt::Display for Keyword {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.as_str().0, f)
    }
}
