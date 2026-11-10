//! Boa's **`boa_engine`** crate implements ECMAScript's standard library of builtin objects
//! and an ECMAScript context, bytecompiler, and virtual machine for code execution.
//!
//! # Example usage
//!
//! You can find multiple examples of the usage of Boa in the [`boa_examples`][examples] crate. In
//! order to use Boa in your project, you will need to add the `boa_engine` crate to your
//! `Cargo.toml` file. You will need to use a [`Source`] structure to handle the JavaScript code
//! to execute, and a [`Context`] structure to execute the code:
//!
//! ```
//! use boa_engine::{Context, Source};
//!
//! let js_code = r#"
//!     let two = 1 + 1;
//!     let definitely_not_four = two + "2";
//!
//!     definitely_not_four
//! "#;
//!
//! // Instantiate the execution context
//! let mut context = Context::default();
//!
//! // Parse the source code
//! match context.eval(Source::from_bytes(js_code)) {
//!     Ok(res) => {
//!         println!(
//!             "{}",
//!             res.to_string(&mut context).unwrap().to_std_string_escaped()
//!         );
//!     }
//!     Err(e) => {
//!         // Pretty print the error
//!         eprintln!("Uncaught {e}");
//!         # panic!("There was an error in boa_engine's introduction example.");
//!     }
//! };
//! ```
//!
//! # Crate Features
//!
//!  - **serde** - Enables serialization and deserialization of the AST (Abstract Syntax Tree).
//!  - **profiler** - Enables profiling with measureme (this is mostly internal).
//!  - **intl** - Enables `boa`'s [ECMA-402 Internationalization API][ecma-402] (`Intl` object)
//!
//! [ecma-402]: https://tc39.es/ecma402
//! [examples]: https://github.com/boa-dev/boa/tree/main/examples
#![doc = include_str!("../ABOUT.md")]
#![doc(
    html_logo_url = "https://raw.githubusercontent.com/boa-dev/boa/main/assets/logo_black.svg",
    html_favicon_url = "https://raw.githubusercontent.com/boa-dev/boa/main/assets/logo_black.svg"
)]
#![cfg_attr(test, allow(clippy::needless_raw_string_hashes))] // Makes strings a bit more copy-pastable
#![cfg_attr(not(test), forbid(clippy::unwrap_used))]
#![allow(
    // Currently throws a false positive regarding dependencies that are only used in benchmarks.
    unused_crate_dependencies,
    clippy::module_name_repetitions,
    clippy::redundant_pub_crate,
    clippy::too_many_lines,
    clippy::cognitive_complexity,
    clippy::missing_errors_doc,
    clippy::let_unit_value,
    clippy::option_if_let_else,

    // It may be worth to look if we can fix the issues highlighted by these lints.
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss,
    clippy::cast_possible_wrap,

    // Add temporarily - Needs addressing
    clippy::missing_panics_doc,
)]

extern crate self as boa_engine;
#[cfg(not(target_has_atomic = "ptr"))]
compile_error!("Boa requires a lock free `AtomicUsize` in order to work properly.");

pub use boa_ast as ast;
pub use boa_gc as gc;
pub use boa_interner as interner;
pub use boa_parser as parser;

pub mod bigint;
pub mod builtins;
pub mod bytecompiler;
pub mod class;
pub mod context;
pub mod environments;
pub mod error;
pub mod interop;
pub mod job;
pub mod module;
pub mod native_function;
pub mod object;
/// ECMAScript Abstract Syntax Tree (AST) optimizer.
pub mod optimizer;
pub mod property;
pub mod realm;
pub mod script;
pub mod string;
pub mod symbol;
pub mod value;
pub mod vm;

mod host_defined;
pub(crate) mod v8_messages;
mod sys;

mod spanned_source_text;
use spanned_source_text::SourceText;
pub use spanned_source_text::SpannedSourceText;

#[cfg(test)]
mod tests;

/// A convenience module that re-exports the most commonly-used Boa APIs
pub mod prelude {
    pub use crate::{
        bigint::JsBigInt,
        context::Context,
        error::{EngineError, JsError, JsNativeError, JsNativeErrorKind, RuntimeLimitError},
        host_defined::HostDefined,
        interop::{IntoJsFunctionCopied, UnsafeIntoJsFunction},
        module::{IntoJsModule, Module},
        native_function::NativeFunction,
        object::{JsData, JsObject, NativeObject},
        script::Script,
        string::{JsStr, JsString},
        symbol::JsSymbol,
        value::{JsValue, JsVariant, js_object, js_value},
    };
    pub use boa_gc::{Finalize, Trace};
    pub use boa_macros::{JsData, js_str};
    pub use boa_parser::Source;
}

#[doc(inline)]
pub use boa_macros::{boa_class, boa_module, embed_module_inner as __embed_module_inner};

use crate::error::PanicError;
use std::result::Result as StdResult;

// Export things to root level
#[doc(inline)]
pub use prelude::*;

#[doc(inline)]
pub use boa_parser::Source;

/// The result of a Javascript expression is represented like this so it can succeed (`Ok`) or fail (`Err`)
pub type JsResult<T> = StdResult<T, JsError>;

/// Create a [`JsResult`] from a Rust value. This trait is used to
/// convert Rust types to JS types, including [`JsResult`] of
/// Rust values and [`JsValue`]s.
///
/// This trait is implemented for any that can be converted into a [`JsValue`].
pub trait TryIntoJsResult {
    /// Try to convert a Rust value into a `JsResult<JsValue>`.
    ///
    /// # Errors
    /// Any parsing errors that may occur during the conversion, or any
    /// error that happened during the call to a function.
    fn try_into_js_result(self, context: &mut Context) -> JsResult<JsValue>;
}

mod try_into_js_result_impls;

/// A utility trait to make working with function arguments easier.
pub trait JsArgs {
    /// Utility function to `get` a parameter from a `[JsValue]` or default to
    /// `JsValue::undefined()` if `get` returns `None`.
    ///
    /// Call this if you are thinking of calling something similar to
    /// `args.get(n).cloned().unwrap_or_default()` or
    /// `args.get(n).unwrap_or(&undefined)`.
    ///
    /// This returns a reference for efficiency, in case you only need to call methods of `JsValue`.
    fn get_or_undefined(&self, index: usize) -> &JsValue;
}

impl JsArgs for [JsValue] {
    fn get_or_undefined(&self, index: usize) -> &JsValue {
        const UNDEFINED: &JsValue = &JsValue::undefined();
        self.get(index).unwrap_or(UNDEFINED)
    }
}

/// Utility trait to "expect" a `JsResult`, but returning a `PanicError` instead of panicking.
#[allow(dead_code)]
pub(crate) trait JsExpect<V> {
    /// "expects" a `JsResult`, wrapping the error with a `PanicError`.
    fn js_expect<S: Into<Box<str>>>(self, msg: S) -> StdResult<V, PanicError>;
}

impl<V> JsExpect<V> for JsResult<V> {
    fn js_expect<S: Into<Box<str>>>(self, msg: S) -> StdResult<V, PanicError> {
        self.map_err(|err| PanicError::new(msg).with_source(err))
    }
}

impl<V> JsExpect<V> for Option<V> {
    fn js_expect<S: Into<Box<str>>>(self, msg: S) -> StdResult<V, PanicError> {
        self.ok_or_else(|| PanicError::new(msg))
    }
}

#[cfg(test)]
use std::{borrow::Cow, pin::Pin};

#[cfg(test)]
type PinBoxFuture<'a> = Pin<Box<dyn Future<Output = ()> + 'a>>;

/// A test action executed in a test function.
#[cfg(test)]
struct TestAction(Inner);

#[cfg(test)]
enum Inner {
    RunHarness,
    Run {
        source: Cow<'static, str>,
    },
    InspectContext {
        op: fn(&mut Context),
    },
    InspectContextAsync {
        op: Box<dyn for<'a> FnOnce(&'a mut Context) -> PinBoxFuture<'a>>,
    },
    Assert {
        source: Cow<'static, str>,
    },
    AssertEq {
        source: Cow<'static, str>,
        expected: JsValue,
    },
    AssertWithOp {
        source: Cow<'static, str>,
        op: fn(JsValue, &mut Context) -> bool,
    },
    AssertOpaqueError {
        source: Cow<'static, str>,
        expected: JsValue,
    },
    AssertNativeError {
        source: Cow<'static, str>,
        kind: JsNativeErrorKind,
        message: &'static str,
    },
    AssertContext {
        op: fn(&mut Context) -> bool,
    },
    AssertEngineError {
        source: Cow<'static, str>,
        error: EngineError,
    },
}

#[cfg(test)]
impl TestAction {
    /// Evaluates some utility functions used in tests.
    const fn run_harness() -> Self {
        Self(Inner::RunHarness)
    }

    /// Runs `source`, panicking if the execution throws.
    fn run(source: impl Into<Cow<'static, str>>) -> Self {
        Self(Inner::Run {
            source: source.into(),
        })
    }

    /// Executes `op` with the currently active context.
    ///
    /// Useful to make custom assertions that must be done from Rust code.
    fn inspect_context(op: fn(&mut Context)) -> Self {
        Self(Inner::InspectContext { op })
    }

    /// Executes `op` with the currently active context in an async environment.
    pub(crate) fn inspect_context_async(op: impl AsyncFnOnce(&mut Context) + 'static) -> Self {
        Self(Inner::InspectContextAsync {
            op: Box::new(move |ctx| Box::pin(op(ctx))),
        })
    }

    /// Asserts that evaluating `source` returns the `true` value.
    fn assert(source: impl Into<Cow<'static, str>>) -> Self {
        Self(Inner::Assert {
            source: source.into(),
        })
    }

    /// Asserts that the script returns `expected` when evaluating `source`.
    fn assert_eq(source: impl Into<Cow<'static, str>>, expected: impl Into<JsValue>) -> Self {
        Self(Inner::AssertEq {
            source: source.into(),
            expected: expected.into(),
        })
    }

    /// Asserts that calling `op` with the value obtained from evaluating `source` returns `true`.
    ///
    /// Useful to check properties of the obtained value that cannot be checked from JS code.
    fn assert_with_op(
        source: impl Into<Cow<'static, str>>,
        op: fn(JsValue, &mut Context) -> bool,
    ) -> Self {
        Self(Inner::AssertWithOp {
            source: source.into(),
            op,
        })
    }

    /// Asserts that evaluating `source` throws the opaque error `value`.
    fn assert_opaque_error(
        source: impl Into<Cow<'static, str>>,
        value: impl Into<JsValue>,
    ) -> Self {
        Self(Inner::AssertOpaqueError {
            source: source.into(),
            expected: value.into(),
        })
    }

    /// Asserts that evaluating `source` throws a native error of `kind` and `message`.
    fn assert_native_error(
        source: impl Into<Cow<'static, str>>,
        kind: JsNativeErrorKind,
        message: &'static str,
    ) -> Self {
        Self(Inner::AssertNativeError {
            source: source.into(),
            kind,
            message,
        })
    }

    /// Asserts that evaluating `source` throws a runtime limit error.
    fn assert_runtime_limit_error(
        source: impl Into<Cow<'static, str>>,
        error: RuntimeLimitError,
    ) -> Self {
        Self(Inner::AssertEngineError {
            source: source.into(),
            error: error.into(),
        })
    }

    /// Asserts that calling `op` with the currently executing context returns `true`.
    fn assert_context(op: fn(&mut Context) -> bool) -> Self {
        Self(Inner::AssertContext { op })
    }
}

/// Executes a list of test actions on a new, default context.
#[cfg(test)]
#[track_caller]
fn run_test_actions(actions: impl IntoIterator<Item = TestAction>) {
    let mut context = Context::builder();
    if cfg!(miri) {
        // Do not use OS APIs when running with Miri to avoid escaping the
        // isolated sandbox.

        use std::rc::Rc;

        use crate::{context::time::FixedClock, module::IdleModuleLoader};

        context = context
            .clock(Rc::new(FixedClock::from_millis(65535)))
            .module_loader(Rc::new(IdleModuleLoader));
    }
    run_test_actions_with(actions, &mut context.build().unwrap());
}

/// Executes a list of test actions on the provided context.
#[cfg(test)]
#[track_caller]
fn run_test_actions_with(actions: impl IntoIterator<Item = TestAction>, context: &mut Context) {
    #[track_caller]
    fn forward_val(context: &mut Context, source: &str) -> JsResult<JsValue> {
        context.eval(Source::from_bytes(source))
    }

    #[track_caller]
    fn fmt_test(source: &str, test: usize) -> String {
        format!(
            "\n\nTest case {test}: \n```\n{}\n```",
            textwrap::indent(source, "    ")
        )
    }

    // Some unwrapping patterns look weird because they're replaceable
    // by simpler patterns like `unwrap_or_else` or `unwrap_err
    let mut i = 1;
    for action in actions.into_iter().map(|a| a.0) {
        match action {
            Inner::RunHarness => {
                // add utility functions for testing
                // TODO: extract to a file
                forward_val(
                    context,
                    r#"
                        function equals(a, b) {
                            if (Array.isArray(a) && Array.isArray(b)) {
                                return arrayEquals(a, b);
                            }
                            return a === b;
                        }
                        function arrayEquals(a, b) {
                            return Array.isArray(a) &&
                                Array.isArray(b) &&
                                a.length === b.length &&
                                a.every((val, index) => equals(val, b[index]));
                        }
                    "#,
                )
                .expect("failed to evaluate test harness");
            }
            Inner::Run { source } => {
                if let Err(e) = forward_val(context, &source) {
                    panic!("{}\nUncaught {e}", fmt_test(&source, i));
                }
            }
            Inner::InspectContext { op } => {
                op(context);
            }
            Inner::InspectContextAsync { op } => futures_lite::future::block_on(op(context)),
            Inner::Assert { source } => {
                let val = match forward_val(context, &source) {
                    Err(e) => panic!("{}\nUncaught {e}", fmt_test(&source, i)),
                    Ok(v) => v,
                };
                let Some(val) = val.as_boolean() else {
                    panic!(
                        "{}\nTried to assert with the non-boolean value `{}`",
                        fmt_test(&source, i),
                        val.display()
                    )
                };
                assert!(val, "{}", fmt_test(&source, i));
                i += 1;
            }
            Inner::AssertEq { source, expected } => {
                let val = match forward_val(context, &source) {
                    Err(e) => panic!("{}\nUncaught {e}", fmt_test(&source, i)),
                    Ok(v) => v,
                };
                assert_eq!(val, expected, "{}", fmt_test(&source, i));
                i += 1;
            }
            Inner::AssertWithOp { source, op } => {
                let val = match forward_val(context, &source) {
                    Err(e) => panic!("{}\nUncaught {e}", fmt_test(&source, i)),
                    Ok(v) => v,
                };
                assert!(op(val, context), "{}", fmt_test(&source, i));
                i += 1;
            }
            Inner::AssertOpaqueError { source, expected } => {
                let err = match forward_val(context, &source) {
                    Ok(v) => panic!(
                        "{}\nExpected error, got value `{}`",
                        fmt_test(&source, i),
                        v.display()
                    ),
                    Err(e) => e,
                };
                let Some(err) = err.as_opaque() else {
                    panic!(
                        "{}\nExpected opaque error, got native error `{}`",
                        fmt_test(&source, i),
                        err
                    )
                };

                assert_eq!(err, &expected, "{}", fmt_test(&source, i));
                i += 1;
            }
            Inner::AssertNativeError {
                source,
                kind,
                message,
            } => {
                let err = match forward_val(context, &source) {
                    Ok(v) => panic!(
                        "{}\nExpected error, got value `{}`",
                        fmt_test(&source, i),
                        v.display()
                    ),
                    Err(e) => e,
                };
                let native = match err.try_native(context) {
                    Ok(err) => err,
                    Err(e) => panic!(
                        "{}\nCouldn't obtain a native error: {e}",
                        fmt_test(&source, i)
                    ),
                };

                assert_eq!(native.kind(), &kind, "{}", fmt_test(&source, i));
                assert_eq!(native.message(), message, "{}", fmt_test(&source, i));
                i += 1;
            }
            Inner::AssertEngineError { source, error } => {
                let err = match forward_val(context, &source) {
                    Ok(v) => panic!(
                        "{}\nExpected error, got value `{}`",
                        fmt_test(&source, i),
                        v.display()
                    ),
                    Err(e) => e,
                };

                let Some(err) = err.as_engine() else {
                    panic!(
                        "{}\nExpected a native error, got {err}",
                        fmt_test(&source, i)
                    )
                };

                assert_eq!(*err, error);
                i += 1;
            }
            Inner::AssertContext { op } => {
                assert!(op(context), "Test case {i}");
                i += 1;
            }
        }
    }
}
