//! A value that can be `null` in JavaScript, but not `undefined`.

use crate::value::{TryFromJs, TryIntoJs};
use boa_engine::{Context, JsResult, JsValue};

#[cfg(test)]
mod tests;

/// A value that can be `null` in JavaScript, but not `undefined`.
///
/// This is used to distinguish between values in JavaScript that can be
/// `null` (i.e. [`Nullable<T>`]) vs. those of which that can be `undefined`
/// (i.e. [`Option<T>`]).
///
/// [`Nullable<T>`] tries to be close in API surface to the standard
/// [`Option<T>`], though with a much smaller API scope, and can be
/// transformed into and from [`Option<T>`] for free.
///
/// ## Why a new type?
/// There are in the standard 2 different values that are "null coalescing":
/// 1. `undefined`, which is its own type (`typeof void 0 == "undefined"`),
/// 2. `null`, which is different from `undefined` (`undefined !== null`) but
///    is of type object (`typeof null === "object"`) for legacy reasons.
///
/// [`Option<T>`] sets up the first case, so we needed to add a new type for
/// the second case.
///
/// ## Would it be bad to use `Option::<T>::None` as both undefined _or_ null?
/// Many values in the standard can be `null` but not `undefined`, or the other
/// way around. Coalescing these two into `Option::None` means that any
/// conversions using boa's traits (such as `TryFromJs`) would result in
/// indistinguishable values. The only way to respect the standard in this case
/// would be to get `JsValue` and manually verify it's not undefined/null, then
/// do the conversion. This new type makes this process much simpler.
///
/// It also means that there is an asymmetry between `JsValue` to [`Option<T>`]
/// then [`Option<T>`] back to `JsValue`, leading to unintuitive errors. Having
/// a type [`Nullable<T>`] that acts like [`Option<T>`] but (de-)serialize to
/// `null` clarifies all usage.
///
/// ## How can I do `EitherNullOrUndefined<T>`?
/// The best way is to use `Nullable<Option<T>>` and convert into [`Option<T>`]
/// using [`Nullable::flatten()`]. Please note that the reverse
/// (`Nullable<Option<T>>`) results in the same deserializing behaviour but
/// does not implement `flatten()`.
///
/// Please note that JavaScript cannot make a distinction between [`Option<T>`] and
/// `Option<Option<T>>`. This cannot be resolved using this type, as it suffers
/// from the same limitation. There is no way to distinguish between `Null` and
/// `NonNull(Null)`. `Nullable<Nullable<T>>` does not provide additional
/// information.
///
/// # Examples
/// ```
/// # use boa_engine::{Context, JsValue};
/// # use boa_engine::value::Nullable;
/// # let context = &mut Context::default();
/// let maybe_10: Nullable<u8> = JsValue::new(10).try_js_into(context).unwrap();
/// assert_eq!(maybe_10, Nullable::NonNull(10u8));
///
/// let maybe_not: Nullable<u8> = JsValue::null().try_js_into(context).unwrap();
/// assert_eq!(maybe_not, Nullable::Null);
/// ```
///
/// ```
/// # use boa_engine::{Context, JsResult, JsValue};
/// # use boa_engine::value::Nullable;
/// # let context = &mut Context::default();
/// let mut v: JsResult<Nullable<Option<u8>>> =
///     JsValue::undefined().try_js_into(context);
/// assert_eq!(v, Ok(Nullable::NonNull(None)));
///
/// v = JsValue::null().try_js_into(context);
/// assert_eq!(v, Ok(Nullable::Null));
///
/// v = JsValue::from(42).try_js_into(context);
/// assert_eq!(v, Ok(Nullable::NonNull(Some(42))));
/// assert_eq!(v.unwrap().flatten(), Some(42));
/// ```
#[derive(Debug, Copy, Clone, PartialOrd, PartialEq, Hash, Ord, Eq)]
pub enum Nullable<T> {
    /// The value was not defined in JavaScript.
    Null,

    /// The value was defined in JavaScript.
    NonNull(T),
}

impl<T> Nullable<T> {
    /// Returns `true` if this value is `Nullable::Null`.
    pub const fn is_null(&self) -> bool {
        matches!(self, Nullable::Null)
    }

    /// Returns `true` if this value is `Nullable::NotNull`.
    pub const fn is_not_null(&self) -> bool {
        matches!(self, Nullable::NonNull(_))
    }

    /// Returns an iterator over the possibly contained value.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::value::Nullable;
    /// let x = Nullable::NonNull(4);
    /// assert_eq!(x.iter().next(), Some(&4));
    ///
    /// let x: Nullable<u32> = Nullable::Null;
    /// assert_eq!(x.iter().next(), None);
    /// ```
    #[inline]
    pub fn iter(&self) -> Iter<'_, T> {
        self.into_iter()
    }

    /// Converts from `&Nullable<T>` to `Nullable<&T>`.
    ///
    /// # Examples
    /// ```
    /// # use boa_engine::value::Nullable;
    /// let text: Nullable<String> = Nullable::NonNull("Hello, world!".to_string());
    ///
    /// // First, cast `Nullable<String>` to `Nullable<&String>` with `as_ref`,
    /// // then consume *that* with `map`, leaving `text` on the stack.
    /// let text_length: Nullable<usize> = text.as_ref().map(|s| s.len());
    /// println!("still can print text: {text:?}");
    /// ```
    #[inline]
    pub const fn as_ref(&self) -> Nullable<&T> {
        match self {
            Nullable::Null => Nullable::Null,
            Nullable::NonNull(t) => Nullable::NonNull(t),
        }
    }

    /// Maps a [`Nullable<T>`] to [`Nullable<U>`] by applying a function to a contained
    /// value.
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::value::Nullable;
    /// let maybe_some_string = Nullable::NonNull(String::from("Hello, World!"));
    /// // `Nullable::map` takes self *by value*, consuming `maybe_some_string`
    /// let maybe_some_len = maybe_some_string.map(|s| s.len());
    /// assert_eq!(maybe_some_len, Nullable::NonNull(13));
    ///
    /// let x: Nullable<&str> = Nullable::Null;
    /// assert_eq!(x.map(|s| s.len()), Nullable::Null);
    /// ```
    #[inline]
    pub fn map<U, F>(self, f: F) -> Nullable<U>
    where
        F: FnOnce(T) -> U,
    {
        match self {
            Nullable::NonNull(x) => Nullable::NonNull(f(x)),
            Nullable::Null => Nullable::Null,
        }
    }

    /// Returns the contained [`Nullable::NonNull`] value or a default.
    ///
    /// Consumes the `self` argument then, if [`Nullable::NonNull`], returns the contained
    /// value, otherwise if [`Nullable::Null`], returns the [default value] for that
    /// type.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::value::Nullable;
    /// let x: Nullable<u32> = Nullable::Null;
    /// let y: Nullable<u32> = Nullable::NonNull(12);
    ///
    /// assert_eq!(x.unwrap_or_default(), 0);
    /// assert_eq!(y.unwrap_or_default(), 12);
    /// ```
    ///
    /// [default value]: Default::default
    /// [`parse`]: str::parse
    #[inline]
    pub fn unwrap_or_default(self) -> T
    where
        T: Default,
    {
        match self {
            Nullable::NonNull(x) => x,
            Nullable::Null => T::default(),
        }
    }
}

impl<'a, T> IntoIterator for &'a Nullable<T> {
    type Item = &'a T;
    type IntoIter = Iter<'a, T>;

    #[inline]
    fn into_iter(self) -> Iter<'a, T> {
        Iter(match self {
            Nullable::Null => None,
            Nullable::NonNull(v) => Some(v),
        })
    }
}

impl<T> IntoIterator for Nullable<T> {
    type Item = T;
    type IntoIter = IntoIter<T>;

    /// Returns a consuming iterator over the possibly contained value.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::value::Nullable;
    /// let x = Nullable::NonNull("string");
    /// let v: Vec<&str> = x.into_iter().collect();
    /// assert_eq!(v, ["string"]);
    ///
    /// let x = Nullable::Null;
    /// let v: Vec<&str> = x.into_iter().collect();
    /// assert!(v.is_empty());
    /// ```
    #[inline]
    fn into_iter(self) -> IntoIter<T> {
        IntoIter(self.into())
    }
}

impl<T: TryFromJs> TryFromJs for Nullable<T> {
    fn try_from_js(value: &JsValue, context: &mut Context) -> JsResult<Self> {
        if value.is_null() {
            Ok(Nullable::Null)
        } else {
            T::try_from_js(value, context).map(Nullable::NonNull)
        }
    }
}

impl<T: TryIntoJs> TryIntoJs for Nullable<T> {
    fn try_into_js(&self, context: &mut Context) -> JsResult<JsValue> {
        match self {
            Nullable::Null => Ok(JsValue::null()),
            Nullable::NonNull(t) => t.try_into_js(context),
        }
    }
}

impl<T> From<Nullable<T>> for Option<T> {
    #[inline]
    fn from(value: Nullable<T>) -> Self {
        match value {
            Nullable::Null => None,
            Nullable::NonNull(t) => Some(t),
        }
    }
}

impl<T> From<Option<T>> for Nullable<T> {
    #[inline]
    fn from(value: Option<T>) -> Self {
        match value {
            None => Nullable::Null,
            Some(t) => Nullable::NonNull(t),
        }
    }
}

/// An iterator over a [`Nullable`] value reference.
#[derive(Debug)]
pub struct Iter<'a, A>(Option<&'a A>);

impl<'a, T: 'a> Iterator for Iter<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.take()
    }
}

impl<'a, T: 'a> DoubleEndedIterator for Iter<'a, T> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.0.take()
    }
}

impl<A> ExactSizeIterator for Iter<'_, A> {
    #[inline]
    fn len(&self) -> usize {
        usize::from(self.0.is_some())
    }
}

/// An owning iterator over a [`Nullable`] value.
#[derive(Debug)]
pub struct IntoIter<A>(Option<A>);

impl<A> Iterator for IntoIter<A> {
    type Item = A;
    fn next(&mut self) -> Option<Self::Item> {
        self.0.take()
    }
}

impl<A> DoubleEndedIterator for IntoIter<A> {
    fn next_back(&mut self) -> Option<A> {
        self.0.take()
    }
}

impl<A> ExactSizeIterator for IntoIter<A> {
    #[inline]
    fn len(&self) -> usize {
        usize::from(self.0.is_some())
    }
}

impl<T> Nullable<Option<T>> {
    /// Converts from `Nullable<Option<T>>` to [`Option<T>`].
    #[inline]
    pub fn flatten(self) -> Option<T> {
        match self {
            Nullable::Null | Nullable::NonNull(None) => None,
            Nullable::NonNull(Some(t)) => Some(t),
        }
    }
}
