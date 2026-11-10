//! Interop module containing traits and types to ease integration between Boa
//! and Rust.

/// Internal module only.
pub(crate) mod private {
    /// A sealed trait to prevent users from implementing the `IntoJsModuleFunction`
    /// and `IntoJsFunctionUnsafe` traits to their own types.
    pub trait IntoJsFunctionSealed<A, R> {}
}

/// A trait to convert a type into a JS function.
/// This trait does not require the implementing type to be `Copy`, which
/// can lead to undefined behaviour if it contains Garbage Collected objects.
///
/// This trait is implemented for functions with various signatures.
///
/// For example:
/// ```
/// # use boa_engine::{UnsafeIntoJsFunction, Context, JsValue, NativeFunction};
/// # let mut context = Context::default();
/// let f = |a: i32, b: i32| a + b;
/// let f = unsafe { f.into_js_function_unsafe(&mut context) };
/// let result = f
///     .call(
///         &JsValue::undefined(),
///         &[JsValue::from(1), JsValue::from(2)],
///         &mut context,
///     )
///     .unwrap();
/// assert_eq!(result, JsValue::new(3));
/// ```
///
/// Since the `IntoJsFunctionUnsafe` trait is implemented for `FnMut`, you can
/// also use closures directly:
/// ```
/// # use boa_engine::{UnsafeIntoJsFunction, Context, JsValue, NativeFunction};
/// # use std::cell::RefCell;
/// # use std::rc::Rc;
/// # let mut context = Context::default();
/// let mut x = Rc::new(RefCell::new(0));
/// // Because NativeFunction takes ownership of the closure,
/// // the compiler cannot be certain it won't outlive `x`, so
/// // we need to create a `Rc<RefCell>` and share it.
/// let f = unsafe {
///     let x = x.clone();
///     move |a: i32| *x.borrow_mut() += a
/// };
/// let f = unsafe { f.into_js_function_unsafe(&mut context) };
/// f.call(&JsValue::undefined(), &[JsValue::from(1)], &mut context)
///     .unwrap();
/// f.call(&JsValue::undefined(), &[JsValue::from(4)], &mut context)
///     .unwrap();
/// assert_eq!(*x.borrow(), 5);
/// ```
pub trait UnsafeIntoJsFunction<Args, Ret>: private::IntoJsFunctionSealed<Args, Ret> {
    /// Converts the type into a JS function.
    ///
    /// # Safety
    /// This function is unsafe to ensure the callee knows the risks of using this trait.
    /// The implementing type must not contain any garbage collected objects.
    unsafe fn into_js_function_unsafe(self, context: &mut Context) -> NativeFunction;
}

/// The safe equivalent of the [`UnsafeIntoJsFunction`] trait.
/// This can only be used on closures that have the `Copy` trait.
///
/// Since this function is implemented for `Fn(...)` closures, we can use
/// it directly when defining a function:
/// ```
/// # use boa_engine::{IntoJsFunctionCopied, Context, JsValue, NativeFunction};
/// # let mut context = Context::default();
/// let f = |a: i32, b: i32| a + b;
/// let f = f.into_js_function_copied(&mut context);
/// let result = f
///     .call(
///         &JsValue::undefined(),
///         &[JsValue::from(1), JsValue::from(2)],
///         &mut context,
///     )
///     .unwrap();
/// assert_eq!(result, JsValue::new(3));
/// ```
pub trait IntoJsFunctionCopied<Args, Ret>: private::IntoJsFunctionSealed<Args, Ret> + Copy {
    /// Converts the type into a JS function.
    fn into_js_function_copied(self, context: &mut Context) -> NativeFunction;
}

mod into_js_arguments;
use crate::{Context, NativeFunction};
pub use into_js_arguments::*;

// Implement `IntoJsFunction` for functions with a various list of
// arguments.
mod into_js_function_impls;
