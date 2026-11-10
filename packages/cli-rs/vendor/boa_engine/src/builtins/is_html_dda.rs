//! Implementation of the `[[IsHTMLDDA]]` internal slot.
//!
//! Objects with this internal slot have special behavior:
//! - `typeof` returns `"undefined"`
//! - `ToBoolean` returns `false`
//! - Abstract equality with `null` or `undefined` returns `true`
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-IsHTMLDDA-internal-slot

use boa_gc::{Finalize, Trace};

use crate::{
    JsResult, JsValue,
    object::{
        JsData, JsObject,
        internal_methods::{
            CallValue, InternalMethodCallContext, InternalObjectMethods, ORDINARY_INTERNAL_METHODS,
        },
    },
};

/// Marker struct for objects with the `[[IsHTMLDDA]]` internal slot.
///
/// This is used by the `$262.IsHTMLDDA` test harness object and models the
/// legacy `document.all` behavior per ECMAScript Annex B §B.3.6.
///
/// The object is callable — when called, it returns `undefined`.
#[derive(Debug, Clone, Copy, Trace, Finalize)]
#[boa_gc(empty_trace)]
pub struct IsHTMLDDA;

impl JsData for IsHTMLDDA {
    fn internal_methods(&self) -> &'static InternalObjectMethods {
        static IS_HTML_DDA_INTERNAL_METHODS: InternalObjectMethods = InternalObjectMethods {
            __call__: is_html_dda_call,
            ..ORDINARY_INTERNAL_METHODS
        };
        &IS_HTML_DDA_INTERNAL_METHODS
    }
}

/// The `[[Call]]` internal method for `IsHTMLDDA` objects.
///
/// When called, simply returns `undefined`.
#[allow(clippy::unnecessary_wraps)]
fn is_html_dda_call(
    _obj: &JsObject,
    argument_count: usize,
    context: &mut InternalMethodCallContext<'_>,
) -> JsResult<CallValue> {
    // Pop the arguments, function, and this from the stack.
    let _args = context
        .vm
        .stack
        .calling_convention_pop_arguments(argument_count);
    let _func = context.vm.stack.pop();
    let _this = context.vm.stack.pop();

    // Push undefined as the return value.
    context.vm.stack.push(JsValue::undefined());

    Ok(CallValue::Complete)
}
