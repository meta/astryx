use boa_engine::value::TryFromJs;
use boa_engine::{Context, JsNativeError, JsObject, JsResult, JsValue, NativeObject};
use boa_gc::{GcRef, GcRefMut};
use std::ops::Deref;

/// Create a Rust value from a JS argument. This trait is used to
/// convert arguments from JS to Rust types. It allows support
/// for optional arguments or rest arguments.
pub trait TryFromJsArgument<'a>: Sized {
    /// Try to convert a JS argument into a Rust value, returning the
    /// value and the rest of the arguments to be parsed.
    ///
    /// # Errors
    /// Any parsing errors that may occur during the conversion.
    fn try_from_js_argument(
        this: &'a JsValue,
        rest: &'a [JsValue],
        context: &mut Context,
    ) -> JsResult<(Self, &'a [JsValue])>;
}

impl<'a, T: TryFromJs> TryFromJsArgument<'a> for T {
    fn try_from_js_argument(
        _: &'a JsValue,
        rest: &'a [JsValue],
        context: &mut Context,
    ) -> JsResult<(Self, &'a [JsValue])> {
        match rest.split_first() {
            Some((first, rest)) => Ok((first.try_js_into(context)?, rest)),
            None => T::try_from_js(&JsValue::undefined(), context).map(|v| (v, rest)),
        }
    }
}

/// An argument that would be ignored in a JS function. This is equivalent of typing
/// `()` in Rust functions argument, but more explicit.
#[derive(Debug, Clone, Copy)]
pub struct Ignore;

impl<'a> TryFromJsArgument<'a> for Ignore {
    fn try_from_js_argument(
        _this: &'a JsValue,
        rest: &'a [JsValue],
        _: &mut Context,
    ) -> JsResult<(Self, &'a [JsValue])> {
        Ok((Ignore, &rest[1..]))
    }
}

/// An argument that when used in a JS function will empty the list
/// of JS arguments as `JsValue`s. This can be used for having the
/// rest of the arguments in a function. It should be the last
/// argument of your function, before the `Context` argument if any.
///
/// For example,
/// ```
/// # use boa_engine::{Context, JsValue, IntoJsFunctionCopied};
/// # use boa_engine::interop::JsRest;
/// # let mut context = Context::default();
/// let sums = (|args: JsRest, context: &mut Context| -> i32 {
///     args.iter()
///         .map(|i| i.try_js_into::<i32>(context).unwrap())
///         .sum::<i32>()
/// })
/// .into_js_function_copied(&mut context);
///
/// let result = sums
///     .call(
///         &JsValue::undefined(),
///         &[JsValue::from(1), JsValue::from(2), JsValue::from(3)],
///         &mut context,
///     )
///     .unwrap();
/// assert_eq!(result, JsValue::new(6));
/// ```
#[derive(Debug, Clone)]
pub struct JsRest<'a>(pub &'a [JsValue]);

#[allow(unused)]
impl<'a> JsRest<'a> {
    /// Consumes the `JsRest` and returns the inner list of `JsValue`.
    #[must_use]
    pub fn into_inner(self) -> &'a [JsValue] {
        self.0
    }

    /// Transforms the `JsRest` into a `Vec<JsValue>`.
    #[must_use]
    pub fn to_vec(self) -> Vec<JsValue> {
        self.0.to_vec()
    }

    /// Returns an iterator over the inner list of `JsValue`.
    pub fn iter(&self) -> impl Iterator<Item = &JsValue> {
        self.0.iter()
    }

    /// Returns the length of the inner list of `JsValue`.
    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns `true` if the inner list of `JsValue` is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<'a> From<&'a [JsValue]> for JsRest<'a> {
    fn from(values: &'a [JsValue]) -> Self {
        Self(values)
    }
}

impl<'a> IntoIterator for JsRest<'a> {
    type Item = &'a JsValue;
    type IntoIter = std::slice::Iter<'a, JsValue>;

    fn into_iter(self) -> Self::IntoIter {
        self.into_inner().iter()
    }
}

/// An argument that when used in a JS function will capture all
/// the arguments that can be converted to `T`. The first argument
/// that cannot be converted to `T` will stop the conversion.
///
/// For example,
/// ```
/// # use boa_engine::{Context, JsValue, IntoJsFunctionCopied};
/// # use boa_engine::interop::JsAll;
/// # let mut context = Context::default();
/// let sums = (|args: JsAll<i32>, context: &mut Context| -> i32 {
///     args.iter().sum()
/// })
/// .into_js_function_copied(&mut context);
///
/// let result = sums
///     .call(
///         &JsValue::undefined(),
///         &[
///             JsValue::from(1),
///             JsValue::from(2),
///             JsValue::from(3),
///             JsValue::from(true),
///             JsValue::from(4),
///         ],
///         &mut context,
///     )
///     .unwrap();
/// assert_eq!(result, JsValue::new(6));
/// ```
#[derive(Debug, Clone)]
pub struct JsAll<T: TryFromJs>(pub Vec<T>);

impl<T: TryFromJs> JsAll<T> {
    /// Consumes the `JsAll` and returns the inner list of `T`.
    #[must_use]
    pub fn into_inner(self) -> Vec<T> {
        self.0
    }

    /// Returns an iterator over the inner list of `T`.
    pub fn iter(&self) -> impl Iterator<Item = &T> {
        self.0.iter()
    }

    /// Returns a mutable iterator over the inner list of `T`.
    pub fn iter_mut(&mut self) -> impl Iterator<Item = &mut T> {
        self.0.iter_mut()
    }

    /// Returns the length of the inner list of `T`.
    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns `true` if the inner list of `T` is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<'a, T: TryFromJs> TryFromJsArgument<'a> for JsAll<T> {
    fn try_from_js_argument(
        _this: &'a JsValue,
        mut rest: &'a [JsValue],
        context: &mut Context,
    ) -> JsResult<(Self, &'a [JsValue])> {
        let mut values = Vec::new();

        while !rest.is_empty() {
            match rest[0].try_js_into(context) {
                Ok(value) => {
                    values.push(value);
                    rest = &rest[1..];
                }
                Err(_) => break,
            }
        }
        Ok((JsAll(values), rest))
    }
}

/// Captures the `this` value in a JS function. Although this can be
/// specified multiple times as argument, it will always be filled
/// with clone of the same value.
#[derive(Debug, Clone)]
pub struct JsThis<T: TryFromJs>(pub T);

impl<'a, T: TryFromJs> TryFromJsArgument<'a> for JsThis<T> {
    fn try_from_js_argument(
        this: &'a JsValue,
        rest: &'a [JsValue],
        context: &mut Context,
    ) -> JsResult<(Self, &'a [JsValue])> {
        Ok((JsThis(this.try_js_into(context)?), rest))
    }
}

impl<T: TryFromJs> Deref for JsThis<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// Captures a class instance from the `this` value in a JS function. The class
/// will be a non-mutable reference of Rust type `T`, if it is an instance of `T`.
///
/// To have more flexibility on the parsing of the `this` value, you can use the
/// [`JsThis`] capture instead.
#[derive(Debug, Clone)]
pub struct JsClass<T: NativeObject> {
    inner: JsObject<T>,
}

impl<T: NativeObject> JsClass<T> {
    /// Returns the inner object directly.
    #[must_use]
    pub fn inner(&self) -> JsObject<T> {
        self.inner.clone()
    }

    /// Borrow a reference to the class instance of type `T`.
    ///
    /// # Panics
    ///
    /// Panics if the object is currently borrowed.
    ///
    /// This does not panic if the type is wrong, as the type is checked
    /// during the construction of the `JsClass` instance.
    #[must_use]
    pub fn borrow(&self) -> GcRef<'_, T> {
        GcRef::map(self.inner.borrow(), |obj| obj.data())
    }

    /// Borrow a mutable reference to the class instance of type `T`.
    ///
    /// # Panics
    ///
    /// Panics if the object is currently mutably borrowed.
    #[must_use]
    pub fn borrow_mut(&self) -> GcRefMut<'_, T> {
        GcRefMut::map(self.inner.borrow_mut(), |obj| obj.data_mut())
    }
}

impl<T: NativeObject + Clone> JsClass<T> {
    /// Clones the inner class instance.
    ///
    /// # Panics
    ///
    /// Panics if the inner object is currently borrowed mutably.
    #[must_use]
    pub fn clone_inner(&self) -> T {
        self.inner.borrow().data().clone()
    }
}

impl<'a, T: NativeObject + 'static> TryFromJsArgument<'a> for JsClass<T> {
    fn try_from_js_argument(
        this: &'a JsValue,
        rest: &'a [JsValue],
        _context: &mut Context,
    ) -> JsResult<(Self, &'a [JsValue])> {
        let inner = this
            .as_object()
            .and_then(|o| o.clone().downcast::<T>().ok())
            .ok_or_else(|| JsNativeError::typ().with_message("invalid this for class method"))?;

        Ok((JsClass { inner }, rest))
    }
}

/// Captures a [`ContextData`] data from the [`Context`] as a JS function argument,
/// based on its type.
///
/// The host defined type must implement [`Clone`], otherwise the borrow
/// checker would not be able to ensure the safety of the context while
/// making the function call. Because of this, it is recommended to use
/// types that are cheap to clone.
///
/// For example,
/// ```
/// # use boa_engine::{Context, Finalize, JsData, JsValue, Trace, IntoJsFunctionCopied};
/// # use boa_engine::interop::ContextData;
///
/// #[derive(Clone, Debug, Finalize, JsData, Trace)]
/// struct CustomHostDefinedStruct {
///     #[unsafe_ignore_trace]
///     pub counter: usize,
/// }
/// let mut context = Context::default();
/// context.insert_data(CustomHostDefinedStruct { counter: 123 });
/// let f = (|ContextData(host): ContextData<CustomHostDefinedStruct>| host.counter + 1)
///     .into_js_function_copied(&mut context);
///
/// assert_eq!(
///     f.call(&JsValue::undefined(), &[], &mut context),
///     Ok(JsValue::new(124))
/// );
/// ```
#[derive(Debug, Clone)]
pub struct ContextData<T: Clone>(pub T);

impl<'a, T: NativeObject + Clone> TryFromJsArgument<'a> for ContextData<T> {
    fn try_from_js_argument(
        _this: &'a JsValue,
        rest: &'a [JsValue],
        context: &mut Context,
    ) -> JsResult<(Self, &'a [JsValue])> {
        match context.get_data::<T>() {
            Some(value) => Ok((ContextData(value.clone()), rest)),
            None => Err(JsNativeError::typ()
                .with_message("Context data not found")
                .into()),
        }
    }
}
