//! Error-related types and conversions.

#[cfg(test)]
mod tests;

use crate::{
    Context, JsResult, JsString, JsValue,
    builtins::{
        Array,
        error::{Error, ErrorKind},
    },
    js_string,
    object::JsObject,
    property::PropertyDescriptor,
    realm::Realm,
    vm::{
        NativeSourceInfo,
        shadow_stack::{Backtrace, ErrorStack, ShadowEntry},
    },
};
use boa_gc::{Finalize, Trace, custom_trace};
use std::{borrow::Cow, error, fmt};
use thiserror::Error;

/// Create an error object from a value or string literal. Optionally the
/// first argument of the macro can be a type of error (such as `TypeError`,
/// `RangeError` or `InternalError`).
///
/// Can be used with an expression that converts into `JsValue` or a format
/// string with arguments.
///
/// # Native Errors
///
/// The only native error that is not buildable using this macro is
/// `AggregateError`, which requires multiple error objects available at
/// construction.
///
/// [`InternalError`][mdn] is non-standard and unsupported in Boa.
///
/// All other native error types can be created from the macro using their
/// JavaScript name followed by a colon, like:
///
/// ```ignore
/// js_error!(TypeError: "hello world");
/// ```
///
/// # Examples
///
/// ```
/// # use boa_engine::{js_str, Context, JsValue};
/// use boa_engine::js_error;
/// let context = &mut Context::default();
///
/// let error = js_error!("error!");
/// assert!(error.as_opaque().is_some());
/// assert_eq!(
///     error.as_opaque().unwrap().to_string(context).unwrap(),
///     "error!"
/// );
///
/// let error = js_error!("error: {}", 5);
/// assert_eq!(
///     error.as_opaque().unwrap().to_string(context).unwrap(),
///     "error: 5"
/// );
///
/// // Non-string literals must be used as an expression.
/// let error = js_error!({ true });
/// assert_eq!(error.as_opaque().unwrap(), &JsValue::from(true));
/// ```
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/InternalError
#[macro_export]
macro_rules! js_error {
    (Error: $value: literal) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::error().with_message($value)
        )
    };
    (Error: $value: literal $(, $args: expr)* $(,)?) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::error()
                .with_message(format!($value $(, $args)*))
        )
    };

    (TypeError: $value: literal) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::typ().with_message($value)
        )
    };
    (TypeError: $value: literal $(, $args: expr)* $(,)?) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::typ()
                .with_message(format!($value $(, $args)*))
        )
    };

    (SyntaxError: $value: literal) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::syntax().with_message($value)
        )
    };
    (SyntaxError: $value: literal $(, $args: expr)* $(,)?) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::syntax().with_message(format!($value $(, $args)*))
        )
    };

    (RangeError: $value: literal) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::range().with_message($value)
        )
    };
    (RangeError: $value: literal $(, $args: expr)* $(,)?) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::range().with_message(format!($value $(, $args)*))
        )
    };

    (EvalError: $value: literal) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::eval().with_message($value)
        )
    };
    (EvalError: $value: literal $(, $args: expr)* $(,)?) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::eval().with_message(format!($value $(, $args)*))
        )
    };

    (ReferenceError: $value: literal) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::reference().with_message($value)
        )
    };
    (ReferenceError: $value: literal $(, $args: expr)* $(,)?) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::reference().with_message(format!($value $(, $args)*))
        )
    };

    (URIError: $value: literal) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::uri().with_message($value)
        )
    };
    (URIError: $value: literal $(, $args: expr)* $(,)?) => {
        $crate::JsError::from_native(
            $crate::JsNativeError::uri().with_message(format!($value $(, $args)*))
        )
    };

    ($value: literal) => {
        $crate::JsError::from_opaque($crate::JsValue::from(
            $crate::js_string!($value)
        ))
    };
    ($value: expr) => {
        $crate::JsError::from_opaque(
            $crate::JsValue::from($value)
        )
    };
    ($value: literal $(, $args: expr)* $(,)?) => {
        $crate::JsError::from_opaque($crate::JsValue::from(
            $crate::JsString::from(format!($value $(, $args)*))
        ))
    };
}

/// The error type returned by all operations related
/// to the execution of Javascript code.
///
/// This is essentially an enum that can store either [`JsNativeError`]s (for ideal
/// native errors)  or opaque [`JsValue`]s, since Javascript allows throwing any valid
/// `JsValue`.
///
/// The implementation doesn't provide a [`From`] conversion
/// for `JsValue`. This is with the intent of encouraging the usage of proper
/// `JsNativeError`s instead of plain `JsValue`s. However, if you
/// do need a proper opaque error, you can construct one using the
/// [`JsError::from_opaque`] method.
///
/// # Examples
///
/// ```rust
/// # use boa_engine::{JsError, JsNativeError, JsNativeErrorKind, JsValue, js_string};
/// let cause = JsError::from_opaque(js_string!("error!").into());
///
/// assert!(cause.as_opaque().is_some());
/// assert_eq!(
///     cause.as_opaque().unwrap(),
///     &JsValue::from(js_string!("error!"))
/// );
///
/// let native_error: JsError = JsNativeError::typ()
///     .with_message("invalid type!")
///     .with_cause(cause)
///     .into();
///
/// let native = native_error.as_native().unwrap();
/// let kind = native.kind();
/// assert!(matches!(kind, JsNativeErrorKind::Type));
/// ```
#[derive(Debug, Clone, Trace, Finalize)]
#[boa_gc(unsafe_no_drop)]
pub struct JsError {
    inner: Repr,
    pub(crate) backtrace: Option<Backtrace>,
}

impl Eq for JsError {}
impl PartialEq for JsError {
    /// The backtrace information is ignored.
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        // NOTE: We want to ignore stack trace, since that is
        //       meta-information about the error.
        self.inner == other.inner
    }
}

/// Internal representation of a [`JsError`].
///
/// `JsError` is represented by an opaque enum because it restricts
/// matching against `JsError` without calling `try_native` first.
/// This allows us to provide a safe API for `Error` objects that extracts
/// their info as a native `Rust` type ([`JsNativeError`]).
///
/// This should never be used outside of this module. If that's not the case,
/// you should add methods to either `JsError` or `JsNativeError` to
/// represent that special use case.
#[derive(Debug, Clone, PartialEq, Eq, Trace, Finalize)]
#[boa_gc(unsafe_no_drop)]
enum Repr {
    Opaque(JsValue),
    Native(Box<JsNativeError>),
    Engine(EngineError),
}

impl error::Error for JsError {
    fn source(&self) -> Option<&(dyn error::Error + 'static)> {
        match &self.inner {
            Repr::Native(err) => err.source(),
            Repr::Opaque(_) => None,
            Repr::Engine(err) => err.source(),
        }
    }
}

/// The error type returned by the [`JsError::try_native`] method.
#[derive(Debug, Clone, Error)]
pub enum TryNativeError {
    /// A property of the error object has an invalid type.
    #[error("invalid type of property `{0}`")]
    InvalidPropertyType(&'static str),

    /// The message of the error object could not be decoded.
    #[error("property `message` cannot contain unpaired surrogates")]
    InvalidMessageEncoding,

    /// The constructor property of the error object was invalid.
    #[error("invalid `constructor` property of Error object")]
    InvalidConstructor,

    /// A property of the error object is not accessible.
    #[error("could not access property `{property}`")]
    InaccessibleProperty {
        /// The name of the property that could not be accessed.
        property: &'static str,

        /// The source error.
        source: JsError,
    },

    /// An inner error of an aggregate error is not accessible.
    #[error("could not get element `{index}` of property `errors`")]
    InvalidErrorsIndex {
        /// The index of the error that could not be accessed.
        index: u64,

        /// The source error.
        source: JsError,
    },

    /// The error value is not an error object.
    #[error("opaque error of type `{:?}` is not an Error object", .0.get_type())]
    NotAnErrorObject(JsValue),

    /// The original realm of the error object was inaccessible.
    #[error("could not access realm of Error object")]
    InaccessibleRealm {
        /// The source error.
        source: JsError,
    },
    /// The error was an engine error.
    #[error("could not convert engine error into a native error")]
    EngineError {
        /// The source error.
        source: EngineError,
    },
}

/// Runtime limit related errors.
#[derive(Debug, Copy, Clone, Eq, PartialEq, Ord, PartialOrd, Error, Trace, Finalize)]
#[boa_gc(empty_trace)]
pub enum RuntimeLimitError {
    /// Error for reaching the iteration loops limit.
    #[error("reached the maximum number of iteration loops on this execution")]
    LoopIteration,
    /// Error for reaching the maximum amount of recursive calls.
    #[error("reached the maximum number of recursive calls on this execution")]
    Recursion,
    /// Error for reaching the maximum stack size
    #[error("reached the maximum stack size on this execution")]
    StackSize,
}

/// Internal panic error.
#[derive(Debug, Clone, Error, Eq, PartialEq, Trace, Finalize)]
#[boa_gc(unsafe_no_drop)]
#[error("{message}")]
#[must_use]
pub struct PanicError {
    /// The original panic message providing context about what went wrong.
    message: Box<str>,
    /// The source error of this panic, if applicable.
    source: Option<Box<JsError>>,
}

impl PanicError {
    /// Creates a `PanicError` error from a panic message.
    pub fn new<S: Into<Box<str>>>(message: S) -> Self {
        PanicError {
            message: message.into(),
            source: None,
        }
    }

    /// Sets the source error of this `PanicError`.
    pub fn with_source<E: Into<JsError>>(mut self, source: E) -> Self {
        self.source = Some(Box::new(source.into()));
        self
    }

    /// Gets the message of this `PanicError`.
    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }
}

impl From<PanicError> for JsError {
    fn from(err: PanicError) -> Self {
        EngineError::from(err).into()
    }
}

/// Engine error that cannot be caught from within ECMAScript code.
#[derive(Debug, Clone, Error, Eq, PartialEq, Trace, Finalize)]
#[boa_gc(unsafe_no_drop)]
#[allow(variant_size_differences)]
pub enum EngineError {
    /// Error thrown when no instructions remain. Only used in a fuzzing context.
    #[cfg(feature = "fuzz")]
    #[error("NoInstructionsRemainError: instruction budget was exhausted")]
    NoInstructionsRemain,

    /// Error thrown when a runtime limit is exceeded.
    #[error("RuntimeLimitError: {0}")]
    RuntimeLimit(#[from] RuntimeLimitError),

    /// Error thrown when an internal panic condition is encountered.
    #[error("EnginePanic: {0}")]
    Panic(#[from] PanicError),
}

impl EngineError {
    /// Converts this error into its thread-safe, erased version.
    ///
    /// Even though this operation is lossy, converting into an `ErasedEngineError`
    /// is useful since it implements `Send` and `Sync`, making it compatible with
    /// error reporting frameworks such as `anyhow`, `eyre` or `miette`.
    fn into_erased(self, context: &mut Context) -> ErasedEngineError {
        match self {
            #[cfg(feature = "fuzz")]
            EngineError::NoInstructionsRemain => ErasedEngineError::NoInstructionsRemain,
            EngineError::RuntimeLimit(err) => ErasedEngineError::RuntimeLimit(err),
            EngineError::Panic(err) => ErasedEngineError::Panic(ErasedPanicError {
                message: err.message,
                source: err.source.map(|err| Box::new(err.into_erased(context))),
            }),
        }
    }
}

impl JsError {
    /// Creates a new `JsError` from a native error `err`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{JsError, JsNativeError};
    /// let error = JsError::from_native(JsNativeError::syntax());
    ///
    /// assert!(error.as_native().is_some());
    /// ```
    #[must_use]
    pub fn from_native(err: JsNativeError) -> Self {
        Self {
            inner: Repr::Native(Box::new(err)),
            backtrace: None,
        }
    }

    /// Creates a new `JsError` from a Rust standard error `err`.
    /// This will create a new `JsNativeError` with the message of the standard error.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::JsError;
    /// let error = std::io::Error::new(std::io::ErrorKind::Other, "oh no!");
    /// let js_error: JsError = JsError::from_rust(error);
    ///
    /// assert_eq!(js_error.as_native().unwrap().message(), "oh no!");
    /// assert!(js_error.as_native().unwrap().cause().is_none());
    /// ```
    #[must_use]
    pub fn from_rust(err: impl error::Error) -> Self {
        let mut native_err = JsNativeError::error().with_message(err.to_string());
        if let Some(source) = err.source() {
            native_err = native_err.with_cause(Self::from_rust(source));
        }

        Self::from_native(native_err)
    }

    /// Creates a new `JsError` from an opaque error `value`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::JsError;
    /// let error = JsError::from_opaque(5.0f64.into());
    ///
    /// assert!(error.as_opaque().is_some());
    /// ```
    #[must_use]
    pub fn from_opaque(value: JsValue) -> Self {
        // Recover the backtrace from the Error object if present,
        // so it survives the JsError → JsValue → JsError round-trip.
        let backtrace = value.as_object().and_then(|obj| {
            let error = obj.downcast_ref::<Error>()?;
            error.stack.0.backtrace().cloned()
        });
        Self {
            inner: Repr::Opaque(value),
            backtrace,
        }
    }

    /// Converts the error to an opaque `JsValue` error
    ///
    /// Unwraps the inner `JsValue` if the error is already an opaque error.
    ///
    /// # Errors
    ///
    /// Returns the original error if `self` was an engine error.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{Context, JsError, JsNativeError};
    /// # use boa_engine::builtins::error::Error;
    /// # use boa_engine::error::{EngineError, RuntimeLimitError};
    /// let context = &mut Context::default();
    /// let error: JsError =
    ///     JsNativeError::eval().with_message("invalid script").into();
    /// let error_val = error.into_opaque(context).unwrap();
    ///
    /// assert!(error_val.as_object().unwrap().is::<Error>());
    ///
    /// let error: JsError =
    ///     EngineError::RuntimeLimit(RuntimeLimitError::Recursion).into();
    ///
    /// assert!(error.into_opaque(context).is_err());
    /// ```
    pub fn into_opaque(self, context: &mut Context) -> JsResult<JsValue> {
        match self.inner {
            Repr::Native(e) => {
                let obj = e.into_opaque(context);
                // Store the backtrace in the Error object so it survives the
                // JsError → JsValue → JsError round-trip through promise
                // rejection.
                if let Some(backtrace) = self.backtrace
                    && let Some(mut error) = obj.downcast_mut::<Error>()
                {
                    error.stack = IgnoreEq(ErrorStack::Backtrace(backtrace));
                }
                Ok(obj.into())
            }
            Repr::Opaque(v) => {
                // Store the backtrace in the Error object for opaque errors
                // too (e.g. explicit `throw new Error(...)`).
                if let Some(backtrace) = self.backtrace
                    && let Some(obj) = v.as_object()
                    && let Some(mut error) = obj.downcast_mut::<Error>()
                    && !error.stack.0.is_backtrace()
                {
                    error.stack = IgnoreEq(ErrorStack::Backtrace(backtrace));
                }
                Ok(v.clone())
            }
            Repr::Engine(_) => Err(self),
        }
    }

    /// Unwraps the inner error if this contains a native error.
    /// Otherwise, inspects the opaque error and tries to extract the
    /// necessary information to construct a native error similar to the provided
    /// opaque error. If the conversion fails, returns a [`TryNativeError`]
    /// with the cause of the failure.
    ///
    /// # Note 1
    ///
    /// This method won't try to make any conversions between JS types.
    /// In other words, for this conversion to succeed:
    /// - `message` **MUST** be a `JsString` value.
    /// - `errors` (in the case of `AggregateError`s) **MUST** be an `Array` object.
    ///
    /// # Note 2
    ///
    /// This operation should be considered a lossy conversion, since it
    /// won't store any additional properties of the opaque
    /// error, other than `message`, `cause` and `errors` (in the case of
    /// `AggregateError`s). If you cannot afford a lossy conversion, clone
    /// the object before calling [`from_opaque`][JsError::from_opaque]
    /// to preserve its original properties.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{Context, JsError, JsNativeError, JsNativeErrorKind};
    /// let context = &mut Context::default();
    ///
    /// // create a new, opaque Error object
    /// let error: JsError = JsNativeError::typ().with_message("type error!").into();
    /// let error_val = error.into_opaque(context).unwrap();
    ///
    /// // then, try to recover the original
    /// let error = JsError::from_opaque(error_val).try_native(context).unwrap();
    ///
    /// assert!(matches!(error.kind(), JsNativeErrorKind::Type));
    /// assert_eq!(error.message(), "type error!");
    /// ```
    pub fn try_native(&self, context: &mut Context) -> Result<JsNativeError, TryNativeError> {
        match &self.inner {
            Repr::Engine(e) => Err(TryNativeError::EngineError { source: e.clone() }),
            Repr::Native(e) => Ok(e.as_ref().clone()),
            Repr::Opaque(val) => {
                let obj = val
                    .as_object()
                    .ok_or_else(|| TryNativeError::NotAnErrorObject(val.clone()))?;
                let error_data: Error = obj
                    .downcast_ref::<Error>()
                    .ok_or_else(|| TryNativeError::NotAnErrorObject(val.clone()))?
                    .clone();

                let try_get_property = |key: JsString, name, context: &mut Context| {
                    obj.try_get(key, context)
                        .map_err(|e| TryNativeError::InaccessibleProperty {
                            property: name,
                            source: e,
                        })
                };

                let message = if let Some(msg) =
                    try_get_property(js_string!("message"), "message", context)?
                {
                    Cow::Owned(
                        msg.as_string()
                            .as_ref()
                            .map(JsString::to_std_string)
                            .transpose()
                            .map_err(|_| TryNativeError::InvalidMessageEncoding)?
                            .ok_or(TryNativeError::InvalidPropertyType("message"))?,
                    )
                } else {
                    Cow::Borrowed("")
                };

                let cause = try_get_property(js_string!("cause"), "cause", context)?;

                let location = error_data.stack.clone();
                let kind = match error_data.tag {
                    ErrorKind::Error => JsNativeErrorKind::Error,
                    ErrorKind::Eval => JsNativeErrorKind::Eval,
                    ErrorKind::Type => JsNativeErrorKind::Type,
                    ErrorKind::Range => JsNativeErrorKind::Range,
                    ErrorKind::Reference => JsNativeErrorKind::Reference,
                    ErrorKind::Syntax => JsNativeErrorKind::Syntax,
                    ErrorKind::Uri => JsNativeErrorKind::Uri,
                    ErrorKind::Aggregate => {
                        let errors = obj.get(js_string!("errors"), context).map_err(|e| {
                            TryNativeError::InaccessibleProperty {
                                property: "errors",
                                source: e,
                            }
                        })?;
                        let mut error_list = Vec::new();
                        match errors.as_object() {
                            Some(errors) if errors.is_array() => {
                                let length = errors.length_of_array_like(context).map_err(|e| {
                                    TryNativeError::InaccessibleProperty {
                                        property: "errors.length",
                                        source: e,
                                    }
                                })?;
                                error_list.reserve(length as usize);
                                for i in 0..length {
                                    error_list.push(Self::from_opaque(
                                        errors.get(i, context).map_err(|e| {
                                            TryNativeError::InvalidErrorsIndex {
                                                index: i,
                                                source: e,
                                            }
                                        })?,
                                    ));
                                }
                            }
                            _ => return Err(TryNativeError::InvalidPropertyType("errors")),
                        }

                        JsNativeErrorKind::Aggregate(error_list)
                    }
                };

                let realm = try_get_property(js_string!("constructor"), "constructor", context)?
                    .as_ref()
                    .and_then(JsValue::as_constructor)
                    .ok_or(TryNativeError::InvalidConstructor)?
                    .get_function_realm(context)
                    .map_err(|err| TryNativeError::InaccessibleRealm { source: err })?;

                Ok(JsNativeError {
                    kind,
                    message,
                    cause: cause.map(|v| Box::new(Self::from_opaque(v))),
                    realm: Some(realm),
                    stack: location,
                })
            }
        }
    }

    /// Gets the inner [`JsValue`] if the error is an opaque error,
    /// or `None` otherwise.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{JsError, JsNativeError};
    /// let error: JsError = JsNativeError::reference()
    ///     .with_message("variable not found!")
    ///     .into();
    ///
    /// assert!(error.as_opaque().is_none());
    ///
    /// let error = JsError::from_opaque(256u32.into());
    ///
    /// assert!(error.as_opaque().is_some());
    /// ```
    #[must_use]
    pub const fn as_opaque(&self) -> Option<&JsValue> {
        match self.inner {
            Repr::Native(_) | Repr::Engine(_) => None,
            Repr::Opaque(ref v) => Some(v),
        }
    }

    /// Gets the inner [`JsNativeError`] if the error is a native
    /// error, or `None` otherwise.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{JsError, JsNativeError, JsValue};
    /// let error: JsError =
    ///     JsNativeError::error().with_message("Unknown error").into();
    ///
    /// assert!(error.as_native().is_some());
    ///
    /// let error = JsError::from_opaque(JsValue::undefined());
    ///
    /// assert!(error.as_native().is_none());
    /// ```
    #[must_use]
    pub const fn as_native(&self) -> Option<&JsNativeError> {
        match &self.inner {
            Repr::Native(e) => Some(e),
            Repr::Opaque(_) | Repr::Engine(_) => None,
        }
    }

    /// Gets the inner [`JsNativeError`] if the error is a native
    /// error, or `None` otherwise.
    #[must_use]
    pub const fn as_native_mut(&mut self) -> Option<&mut JsNativeError> {
        match &mut self.inner {
            Repr::Native(e) => Some(e),
            Repr::Opaque(_) | Repr::Engine(_) => None,
        }
    }

    /// Gets the inner [`EngineError`] if the error is an engine
    #[must_use]
    pub const fn as_engine(&self) -> Option<&EngineError> {
        match &self.inner {
            Repr::Opaque(_) | Repr::Native(_) => None,
            Repr::Engine(err) => Some(err),
        }
    }

    /// Converts this error into its thread-safe, erased version.
    ///
    /// Even though this operation is lossy, converting into a `JsErasedError`
    /// is useful since it implements `Send` and `Sync`, making it compatible with
    /// error reporting frameworks such as `anyhow`, `eyre` or `miette`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{js_string, Context, JsError, JsNativeError, JsSymbol, JsValue};
    /// # use std::error::Error;
    /// let context = &mut Context::default();
    /// let cause = JsError::from_opaque(JsSymbol::new(Some(js_string!("error!"))).unwrap().into());
    ///
    /// let native_error: JsError = JsNativeError::typ()
    ///     .with_message("invalid type!")
    ///     .with_cause(cause)
    ///     .into();
    ///
    /// let erased_error = native_error.into_erased(context);
    ///
    /// assert_eq!(erased_error.to_string(), "TypeError: invalid type!");
    ///
    /// let send_sync_error: Box<dyn Error + Send + Sync> = Box::new(erased_error);
    ///
    /// assert_eq!(
    ///     send_sync_error.source().unwrap().to_string(),
    ///     "Symbol(error!)"
    /// );
    /// ```
    pub fn into_erased(self, context: &mut Context) -> JsErasedError {
        let native = match self.try_native(context) {
            Ok(native) => native,
            Err(TryNativeError::EngineError { source }) => {
                return JsErasedError {
                    inner: ErasedRepr::Engine(source.into_erased(context)),
                };
            }
            Err(_) => {
                return JsErasedError {
                    inner: ErasedRepr::Opaque(Cow::Owned(self.to_string())),
                };
            }
        };

        let JsNativeError {
            kind,
            message,
            cause,
            ..
        } = native;

        let cause = cause.map(|err| Box::new(err.into_erased(context)));

        let kind = match kind {
            JsNativeErrorKind::Aggregate(errors) => JsErasedNativeErrorKind::Aggregate(
                errors
                    .into_iter()
                    .map(|err| err.into_erased(context))
                    .collect(),
            ),
            JsNativeErrorKind::Error => JsErasedNativeErrorKind::Error,
            JsNativeErrorKind::Eval => JsErasedNativeErrorKind::Eval,
            JsNativeErrorKind::Range => JsErasedNativeErrorKind::Range,
            JsNativeErrorKind::Reference => JsErasedNativeErrorKind::Reference,
            JsNativeErrorKind::Syntax => JsErasedNativeErrorKind::Syntax,
            JsNativeErrorKind::Type => JsErasedNativeErrorKind::Type,
            JsNativeErrorKind::Uri => JsErasedNativeErrorKind::Uri,
        };

        JsErasedError {
            inner: ErasedRepr::Native(JsErasedNativeError {
                kind,
                message,
                cause,
            }),
        }
    }

    /// Injects a realm on the `realm` field of a native error.
    ///
    /// This is a no-op if the error is not native or if the `realm` field of the error is already
    /// set.
    pub(crate) fn inject_realm(mut self, realm: Realm) -> Self {
        match &mut self.inner {
            Repr::Native(err) if err.realm.is_none() => {
                err.realm = Some(realm);
            }
            _ => {}
        }
        self
    }

    /// Is the [`JsError`] catchable in JavaScript.
    #[inline]
    pub(crate) const fn is_catchable(&self) -> bool {
        self.as_engine().is_none()
    }
}

impl From<boa_parser::Error> for JsError {
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    fn from(err: boa_parser::Error) -> Self {
        Self::from(JsNativeError::from(err))
    }
}

impl From<JsNativeError> for JsError {
    fn from(error: JsNativeError) -> Self {
        Self {
            inner: Repr::Native(Box::new(error)),
            backtrace: None,
        }
    }
}

impl From<EngineError> for JsError {
    fn from(value: EngineError) -> Self {
        Self {
            inner: Repr::Engine(value),
            backtrace: None,
        }
    }
}

impl From<RuntimeLimitError> for JsError {
    fn from(value: RuntimeLimitError) -> Self {
        EngineError::from(value).into()
    }
}

impl fmt::Display for JsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.inner {
            Repr::Native(e) => e.fmt(f)?,
            Repr::Engine(e) => e.fmt(f)?,
            Repr::Opaque(v) => v.display().fmt(f)?,
        }

        if let Some(shadow_stack) = &self.backtrace {
            for entry in shadow_stack.iter().rev() {
                write!(f, "\n    at {}", entry.display(true))?;
            }
        }
        Ok(())
    }
}

/// Helper struct that ignores equality operator.
#[derive(Debug, Clone, Finalize)]
pub(crate) struct IgnoreEq<T>(pub(crate) T);

impl<T> Eq for IgnoreEq<T> {}

impl<T> PartialEq for IgnoreEq<T> {
    #[inline]
    fn eq(&self, _: &Self) -> bool {
        true
    }
}

impl<T> std::hash::Hash for IgnoreEq<T> {
    fn hash<H: std::hash::Hasher>(&self, _state: &mut H) {}
}

impl<T> From<T> for IgnoreEq<T> {
    #[inline]
    fn from(value: T) -> Self {
        Self(value)
    }
}

/// Native representation of an ideal `Error` object from Javascript.
///
/// This representation is more space efficient than its [`JsObject`] equivalent,
/// since it doesn't need to create a whole new `JsObject` to be instantiated.
/// Prefer using this over [`JsError`] when you don't need to throw
/// plain [`JsValue`]s as errors, or when you need to inspect the error type
/// of a `JsError`.
///
/// # Examples
///
/// ```rust
/// # use boa_engine::{JsNativeError, JsNativeErrorKind};
/// let native_error = JsNativeError::uri().with_message("cannot decode uri");
///
/// match native_error.kind() {
///     JsNativeErrorKind::Uri => { /* handle URI error*/ }
///     _ => unreachable!(),
/// }
///
/// assert_eq!(native_error.message(), "cannot decode uri");
/// ```
#[derive(Clone, Finalize, Error, PartialEq, Eq)]
pub struct JsNativeError {
    /// The kind of native error (e.g. `TypeError`, `SyntaxError`, etc.)
    kind: JsNativeErrorKind,
    message: Cow<'static, str>,
    #[source]
    cause: Option<Box<JsError>>,
    realm: Option<Realm>,
    pub(crate) stack: IgnoreEq<ErrorStack>,
}

impl fmt::Display for JsNativeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.kind)?;

        let message = self.message.trim();
        if !message.is_empty() {
            write!(f, ": {message}")?;
        }

        if let Some(entry) = self.stack.0.position() {
            write!(f, "{}", entry.display(false))?;
        }

        Ok(())
    }
}

// SAFETY: just mirroring the default derive to allow destructuring.
unsafe impl Trace for JsNativeError {
    custom_trace!(this, mark, {
        mark(&this.kind);
        mark(&this.cause);
        mark(&this.realm);
    });
}

impl fmt::Debug for JsNativeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("JsNativeError")
            .field("kind", &self.kind)
            .field("message", &self.message)
            .field("cause", &self.cause)
            .finish_non_exhaustive()
    }
}

impl JsNativeError {
    /// Returns the kind of this native error.
    #[must_use]
    #[inline]
    pub const fn kind(&self) -> &JsNativeErrorKind {
        &self.kind
    }

    /// Creates a new `JsNativeError` from its `kind`, `message` and (optionally) its `cause`.
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    const fn new(
        kind: JsNativeErrorKind,
        message: Cow<'static, str>,
        cause: Option<Box<JsError>>,
    ) -> Self {
        if let Some(cause) = &cause
            && cause.as_engine().is_some()
        {
            panic!("engine errors cannot be used as the cause of another error");
        }
        Self {
            kind,
            message,
            cause,
            realm: None,
            stack: IgnoreEq(ErrorStack::Position(ShadowEntry::Native {
                function_name: None,
                source_info: NativeSourceInfo::caller(),
            })),
        }
    }

    /// Creates a new `JsNativeError` of kind `AggregateError` from a list of [`JsError`]s, with
    /// empty `message` and undefined `cause`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{JsNativeError, JsNativeErrorKind};
    /// let inner_errors = vec![
    ///     JsNativeError::typ().into(),
    ///     JsNativeError::syntax().into()
    /// ];
    /// let error = JsNativeError::aggregate(inner_errors);
    ///
    /// assert!(matches!(
    ///     error.kind(),
    ///     JsNativeErrorKind::Aggregate(errors) if errors.len() == 2
    /// ));
    /// ```
    #[must_use]
    #[inline]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub const fn aggregate(errors: Vec<JsError>) -> Self {
        Self::new(
            JsNativeErrorKind::Aggregate(errors),
            Cow::Borrowed(""),
            None,
        )
    }

    /// Check if it's a [`JsNativeErrorKind::Aggregate`].
    #[must_use]
    #[inline]
    pub const fn is_aggregate(&self) -> bool {
        matches!(self.kind, JsNativeErrorKind::Aggregate(_))
    }

    /// Creates a new `JsNativeError` of kind `Error`, with empty `message` and undefined `cause`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{JsNativeError, JsNativeErrorKind};
    /// let error = JsNativeError::error();
    ///
    /// assert!(matches!(error.kind(), JsNativeErrorKind::Error));
    /// ```
    #[must_use]
    #[inline]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub const fn error() -> Self {
        Self::new(JsNativeErrorKind::Error, Cow::Borrowed(""), None)
    }

    /// Check if it's a [`JsNativeErrorKind::Error`].
    #[must_use]
    #[inline]
    pub const fn is_error(&self) -> bool {
        matches!(self.kind, JsNativeErrorKind::Error)
    }

    /// Creates a new `JsNativeError` of kind `EvalError`, with empty `message` and undefined `cause`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{JsNativeError, JsNativeErrorKind};
    /// let error = JsNativeError::eval();
    ///
    /// assert!(matches!(error.kind(), JsNativeErrorKind::Eval));
    /// ```
    #[must_use]
    #[inline]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub const fn eval() -> Self {
        Self::new(JsNativeErrorKind::Eval, Cow::Borrowed(""), None)
    }

    /// Check if it's a [`JsNativeErrorKind::Eval`].
    #[must_use]
    #[inline]
    pub const fn is_eval(&self) -> bool {
        matches!(self.kind, JsNativeErrorKind::Eval)
    }

    /// Creates a new `JsNativeError` of kind `RangeError`, with empty `message` and undefined `cause`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{JsNativeError, JsNativeErrorKind};
    /// let error = JsNativeError::range();
    ///
    /// assert!(matches!(error.kind(), JsNativeErrorKind::Range));
    /// ```
    #[must_use]
    #[inline]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub const fn range() -> Self {
        Self::new(JsNativeErrorKind::Range, Cow::Borrowed(""), None)
    }

    /// Check if it's a [`JsNativeErrorKind::Range`].
    #[must_use]
    #[inline]
    pub const fn is_range(&self) -> bool {
        matches!(self.kind, JsNativeErrorKind::Range)
    }

    /// Creates a new `JsNativeError` of kind `ReferenceError`, with empty `message` and undefined `cause`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{JsNativeError, JsNativeErrorKind};
    /// let error = JsNativeError::reference();
    ///
    /// assert!(matches!(error.kind(), JsNativeErrorKind::Reference));
    /// ```
    #[must_use]
    #[inline]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub const fn reference() -> Self {
        Self::new(JsNativeErrorKind::Reference, Cow::Borrowed(""), None)
    }

    /// Check if it's a [`JsNativeErrorKind::Reference`].
    #[must_use]
    #[inline]
    pub const fn is_reference(&self) -> bool {
        matches!(self.kind, JsNativeErrorKind::Reference)
    }

    /// Creates a new `JsNativeError` of kind `SyntaxError`, with empty `message` and undefined `cause`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{JsNativeError, JsNativeErrorKind};
    /// let error = JsNativeError::syntax();
    ///
    /// assert!(matches!(error.kind(), JsNativeErrorKind::Syntax));
    /// ```
    #[must_use]
    #[inline]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub const fn syntax() -> Self {
        Self::new(JsNativeErrorKind::Syntax, Cow::Borrowed(""), None)
    }

    /// Check if it's a [`JsNativeErrorKind::Syntax`].
    #[must_use]
    #[inline]
    pub const fn is_syntax(&self) -> bool {
        matches!(self.kind, JsNativeErrorKind::Syntax)
    }

    /// Creates a new `JsNativeError` of kind `TypeError`, with empty `message` and undefined `cause`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{JsNativeError, JsNativeErrorKind};
    /// let error = JsNativeError::typ();
    ///
    /// assert!(matches!(error.kind(), JsNativeErrorKind::Type));
    /// ```
    #[must_use]
    #[inline]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub const fn typ() -> Self {
        Self::new(JsNativeErrorKind::Type, Cow::Borrowed(""), None)
    }

    /// Check if it's a [`JsNativeErrorKind::Type`].
    #[must_use]
    #[inline]
    pub const fn is_type(&self) -> bool {
        matches!(self.kind, JsNativeErrorKind::Type)
    }

    /// Creates a new `JsNativeError` of kind `UriError`, with empty `message` and undefined `cause`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{JsNativeError, JsNativeErrorKind};
    /// let error = JsNativeError::uri();
    ///
    /// assert!(matches!(error.kind(), JsNativeErrorKind::Uri));
    /// ```
    #[must_use]
    #[inline]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub const fn uri() -> Self {
        Self::new(JsNativeErrorKind::Uri, Cow::Borrowed(""), None)
    }

    /// Check if it's a [`JsNativeErrorKind::Uri`].
    #[must_use]
    #[inline]
    pub const fn is_uri(&self) -> bool {
        matches!(self.kind, JsNativeErrorKind::Uri)
    }

    /// Sets the message of this error.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::JsNativeError;
    /// let error = JsNativeError::range().with_message("number too large");
    ///
    /// assert_eq!(error.message(), "number too large");
    /// ```
    #[must_use]
    #[inline]
    pub fn with_message<S>(mut self, message: S) -> Self
    where
        S: Into<Cow<'static, str>>,
    {
        self.message = message.into();
        self
    }

    /// Sets the cause of this error.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::JsNativeError;
    /// let cause = JsNativeError::syntax();
    /// let error = JsNativeError::error().with_cause(cause);
    ///
    /// assert!(error.cause().unwrap().as_native().is_some());
    /// ```
    ///
    /// # Panics
    ///
    /// Panics if `cause` is an uncatchable error (i.e. an engine error).
    #[must_use]
    #[inline]
    pub fn with_cause<V>(mut self, cause: V) -> Self
    where
        V: Into<JsError>,
    {
        let err = cause.into();
        assert!(
            err.is_catchable(),
            "uncatchable errors cannot be used as the cause of another error",
        );

        self.cause = Some(Box::new(err));
        self
    }

    /// Gets the `message` of this error.
    ///
    /// This is equivalent to the [`NativeError.prototype.message`][spec]
    /// property.
    ///
    /// [spec]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/message
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::JsNativeError;
    /// let error = JsNativeError::range().with_message("number too large");
    ///
    /// assert_eq!(error.message(), "number too large");
    /// ```
    #[must_use]
    #[inline]
    pub fn message(&self) -> &str {
        &self.message
    }

    /// Gets the `cause` of this error.
    ///
    /// This is equivalent to the [`NativeError.prototype.cause`][spec]
    /// property.
    ///
    /// [spec]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::JsNativeError;
    /// let cause = JsNativeError::syntax();
    /// let error = JsNativeError::error().with_cause(cause);
    ///
    /// assert!(error.cause().unwrap().as_native().is_some());
    /// ```
    #[must_use]
    #[inline]
    pub fn cause(&self) -> Option<&JsError> {
        self.cause.as_deref()
    }

    /// Converts this native error to its opaque representation as a [`JsObject`].
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use boa_engine::{Context, JsError, JsNativeError, js_string};
    /// # use boa_engine::builtins::error::Error;
    /// let context = &mut Context::default();
    ///
    /// let error = JsNativeError::error().with_message("error!");
    /// let error_obj = error.into_opaque(context);
    ///
    /// assert!(error_obj.is::<Error>());
    /// assert_eq!(
    ///     error_obj.get(js_string!("message"), context).unwrap(),
    ///     js_string!("error!").into()
    /// )
    /// ```
    #[inline]
    pub fn into_opaque(self, context: &mut Context) -> JsObject {
        let Self {
            kind,
            message,
            cause,
            realm,
            stack,
        } = self;
        let constructors = realm.as_ref().map_or_else(
            || context.intrinsics().constructors(),
            |realm| realm.intrinsics().constructors(),
        );
        let (prototype, tag) = match kind {
            JsNativeErrorKind::Aggregate(_) => (
                constructors.aggregate_error().prototype(),
                ErrorKind::Aggregate,
            ),
            JsNativeErrorKind::Error => (constructors.error().prototype(), ErrorKind::Error),
            JsNativeErrorKind::Eval => (constructors.eval_error().prototype(), ErrorKind::Eval),
            JsNativeErrorKind::Range => (constructors.range_error().prototype(), ErrorKind::Range),
            JsNativeErrorKind::Reference => (
                constructors.reference_error().prototype(),
                ErrorKind::Reference,
            ),
            JsNativeErrorKind::Syntax => {
                (constructors.syntax_error().prototype(), ErrorKind::Syntax)
            }
            JsNativeErrorKind::Type => (constructors.type_error().prototype(), ErrorKind::Type),
            JsNativeErrorKind::Uri => (constructors.uri_error().prototype(), ErrorKind::Uri),
        };

        let o = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            Error::with_stack(tag, stack.0.clone()),
        )
        .upcast();

        o.create_non_enumerable_data_property_or_throw(
            js_string!("message"),
            js_string!(message.as_ref()),
            context,
        );

        if let Some(cause) = cause {
            o.create_non_enumerable_data_property_or_throw(
                js_string!("cause"),
                cause
                    .into_opaque(context)
                    .expect("engine errors cannot be the cause of another error"),
                context,
            );
        }

        if let JsNativeErrorKind::Aggregate(errors) = kind {
            let errors = errors
                .into_iter()
                .map(|e| {
                    e.into_opaque(context)
                        .expect("engine errors cannot be the cause of another error")
                })
                .collect::<Vec<_>>();
            let errors = Array::create_array_from_list(errors, context);
            o.define_property_or_throw(
                js_string!("errors"),
                PropertyDescriptor::builder()
                    .configurable(true)
                    .enumerable(false)
                    .writable(true)
                    .value(errors),
                context,
            )
            .expect("The spec guarantees this succeeds for a newly created object ");
        }
        o
    }

    /// Sets the realm of this error.
    pub(crate) fn with_realm(mut self, realm: Realm) -> Self {
        self.realm = Some(realm);
        self
    }
}

impl From<boa_parser::Error> for JsNativeError {
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    fn from(err: boa_parser::Error) -> Self {
        Self::syntax().with_message(err.to_string())
    }
}

/// The list of possible error types a [`JsNativeError`] can be.
///
/// More information:
/// - [ECMAScript reference][spec]
/// - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#sec-error-objects
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
#[derive(Debug, Clone, Finalize, PartialEq, Eq)]
#[non_exhaustive]
pub enum JsNativeErrorKind {
    /// A collection of errors wrapped in a single error.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-aggregate-error-objects
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError
    Aggregate(Vec<JsError>),
    /// A generic error. Commonly used as the base for custom exceptions.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-error-constructor
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
    Error,
    /// An error related to the global function [`eval()`][eval].
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-evalerror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/EvalError
    /// [eval]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval
    Eval,
    /// An error thrown when a value is outside its valid range.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-rangeerror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RangeError
    Range,
    /// An error representing an invalid de-reference of a variable.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-referenceerror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ReferenceError
    Reference,
    /// An error representing an invalid syntax in the Javascript language.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-syntaxerror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SyntaxError
    Syntax,
    /// An error thrown when a variable or argument is not of a valid type.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-typeerror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypeError
    Type,
    /// An error thrown when the [`encodeURI()`][e_uri] and [`decodeURI()`][d_uri] functions receive
    /// invalid parameters.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-urierror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/URIError
    /// [e_uri]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI
    /// [d_uri]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/decodeURI
    Uri,
}

// SAFETY: just mirroring the default derive to allow destructuring.
unsafe impl Trace for JsNativeErrorKind {
    custom_trace!(
        this,
        mark,
        match &this {
            Self::Aggregate(errors) => mark(errors),
            Self::Error
            | Self::Eval
            | Self::Range
            | Self::Reference
            | Self::Syntax
            | Self::Type
            | Self::Uri => {}
        }
    );
}

impl PartialEq<ErrorKind> for JsNativeErrorKind {
    fn eq(&self, other: &ErrorKind) -> bool {
        matches!(
            (self, other),
            (Self::Aggregate(_), ErrorKind::Aggregate)
                | (Self::Error, ErrorKind::Error)
                | (Self::Eval, ErrorKind::Eval)
                | (Self::Range, ErrorKind::Range)
                | (Self::Reference, ErrorKind::Reference)
                | (Self::Syntax, ErrorKind::Syntax)
                | (Self::Type, ErrorKind::Type)
                | (Self::Uri, ErrorKind::Uri)
        )
    }
}

impl fmt::Display for JsNativeErrorKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Aggregate(_) => "AggregateError",
            Self::Error => "Error",
            Self::Eval => "EvalError",
            Self::Range => "RangeError",
            Self::Reference => "ReferenceError",
            Self::Syntax => "SyntaxError",
            Self::Type => "TypeError",
            Self::Uri => "UriError",
        }
        .fmt(f)
    }
}

/// Erased version of [`PanicError`].
///
/// This is mainly useful to convert a `PanicError` into an `ErasedPanicError` that also
/// implements `Send + Sync`, which makes it compatible with error reporting tools
/// such as `anyhow`, `eyre` or `miette`.
///
/// Generally, the conversion from `PanicError` to `ErasedPanicError` is unidirectional,
/// since any `JsError` that is a [`JsValue`] is converted to its string representation
/// instead. This will lose information if that value was an object, a symbol or a big int.
#[derive(Debug, Clone, Error, Eq, PartialEq, Trace, Finalize)]
#[error("{message}")]
#[must_use]
pub struct ErasedPanicError {
    message: Box<str>,
    source: Option<Box<JsErasedError>>,
}

impl ErasedPanicError {
    /// Gets the message of this `ErasedPanicError`.
    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }
}

/// Erased version of [`EngineError`].
///
/// This is mainly useful to convert an `EngineError` into an `ErasedEngineError` that also
/// implements `Send + Sync`, which makes it compatible with error reporting tools
/// such as `anyhow`, `eyre` or `miette`.
///
/// Generally, the conversion from `EngineError` to `ErasedEngineError` is unidirectional,
/// since any `JsError` that is a [`JsValue`] is converted to its string representation
/// instead. This will lose information if that value was an object, a symbol or a big int.
#[derive(Debug, Clone, Error, Eq, PartialEq, Trace, Finalize)]
#[allow(variant_size_differences)]
pub enum ErasedEngineError {
    /// Error thrown when no instructions remain. Only used in a fuzzing context.
    #[cfg(feature = "fuzz")]
    #[error("NoInstructionsRemainError: instruction budget was exhausted")]
    NoInstructionsRemain,

    /// Error thrown when a runtime limit is exceeded.
    #[error("RuntimeLimitError: {0}")]
    RuntimeLimit(#[from] RuntimeLimitError),

    /// Error thrown when an internal panic condition is encountered.
    #[error("EnginePanic: {0}")]
    Panic(#[from] ErasedPanicError),
}

/// Erased version of [`JsError`].
///
/// This is mainly useful to convert a `JsError` into an `Error` that also
/// implements `Send + Sync`, which makes it compatible with error reporting tools
/// such as `anyhow`, `eyre` or `miette`.
///
/// Generally, the conversion from `JsError` to `JsErasedError` is unidirectional,
/// since any `JsError` that is a [`JsValue`] is converted to its string representation
/// instead. This will lose information if that value was an object, a symbol or a big int.
#[derive(Debug, Clone, Trace, Finalize, PartialEq, Eq)]
pub struct JsErasedError {
    inner: ErasedRepr,
}

#[derive(Debug, Clone, Trace, Finalize, PartialEq, Eq)]
enum ErasedRepr {
    Native(JsErasedNativeError),
    Opaque(Cow<'static, str>),
    Engine(ErasedEngineError),
}

impl fmt::Display for JsErasedError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.inner {
            ErasedRepr::Native(e) => e.fmt(f),
            ErasedRepr::Opaque(v) => v.fmt(f),
            ErasedRepr::Engine(e) => e.fmt(f),
        }
    }
}

impl error::Error for JsErasedError {
    fn source(&self) -> Option<&(dyn error::Error + 'static)> {
        match &self.inner {
            ErasedRepr::Native(err) => err.source(),
            ErasedRepr::Opaque(_) => None,
            ErasedRepr::Engine(err) => err.source(),
        }
    }
}

impl JsErasedError {
    /// Gets the inner [`str`] if the error is an opaque error,
    /// or `None` otherwise.
    #[must_use]
    pub fn as_opaque(&self) -> Option<&str> {
        match &self.inner {
            ErasedRepr::Native(_) | ErasedRepr::Engine(_) => None,
            ErasedRepr::Opaque(v) => Some(v),
        }
    }

    /// Gets the inner [`JsErasedNativeError`] if the error is a native
    /// error, or `None` otherwise.
    #[must_use]
    pub const fn as_native(&self) -> Option<&JsErasedNativeError> {
        match &self.inner {
            ErasedRepr::Native(e) => Some(e),
            ErasedRepr::Opaque(_) | ErasedRepr::Engine(_) => None,
        }
    }

    /// Gets the inner [`ErasedEngineError`] if the error is an engine
    /// error, or `None` otherwise.
    #[must_use]
    pub const fn as_engine(&self) -> Option<&ErasedEngineError> {
        match &self.inner {
            ErasedRepr::Engine(e) => Some(e),
            ErasedRepr::Opaque(_) | ErasedRepr::Native(_) => None,
        }
    }
}

/// Erased version of [`JsNativeError`].
#[derive(Debug, Clone, Trace, Finalize, Error, PartialEq, Eq)]
pub struct JsErasedNativeError {
    /// The kind of native error (e.g. `TypeError`, `SyntaxError`, etc.)
    pub kind: JsErasedNativeErrorKind,
    message: Cow<'static, str>,
    #[source]
    cause: Option<Box<JsErasedError>>,
}

impl fmt::Display for JsErasedNativeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.kind)?;

        let message = self.message.trim();
        if !message.is_empty() {
            write!(f, ": {message}")?;
        }

        Ok(())
    }
}

/// Erased version of [`JsNativeErrorKind`]
#[derive(Debug, Clone, Trace, Finalize, PartialEq, Eq)]
#[non_exhaustive]
pub enum JsErasedNativeErrorKind {
    /// A collection of errors wrapped in a single error.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-aggregate-error-objects
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError
    Aggregate(Vec<JsErasedError>),
    /// A generic error. Commonly used as the base for custom exceptions.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-error-constructor
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
    Error,
    /// An error related to the global function [`eval()`][eval].
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-evalerror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/EvalError
    /// [eval]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval
    Eval,
    /// An error thrown when a value is outside its valid range.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-rangeerror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RangeError
    Range,
    /// An error representing an invalid de-reference of a variable.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-referenceerror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ReferenceError
    Reference,
    /// An error representing an invalid syntax in the Javascript language.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-syntaxerror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SyntaxError
    Syntax,
    /// An error thrown when a variable or argument is not of a valid type.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-typeerror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypeError
    Type,
    /// An error thrown when the [`encodeURI()`][e_uri] and [`decodeURI()`][d_uri] functions receive
    /// invalid parameters.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-urierror
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/URIError
    /// [e_uri]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI
    /// [d_uri]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/decodeURI
    Uri,

    /// Error thrown when a runtime limit is exceeded.
    RuntimeLimit,
}

impl fmt::Display for JsErasedNativeErrorKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self {
            Self::Aggregate(errors) => {
                return write!(f, "AggregateError(error count: {})", errors.len());
            }
            Self::Error => "Error",
            Self::Eval => "EvalError",
            Self::Range => "RangeError",
            Self::Reference => "ReferenceError",
            Self::Syntax => "SyntaxError",
            Self::Type => "TypeError",
            Self::Uri => "UriError",
            Self::RuntimeLimit => "RuntimeLimit",
        }
        .fmt(f)
    }
}
