//! Boa's implementation of ECMAScript's global `Boolean` object.
//!
//! The `Boolean` object is an object wrapper for a boolean value.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-boolean-object
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean

#[cfg(test)]
mod tests;

use crate::{
    Context, JsResult, JsString, JsValue,
    builtins::BuiltInObject,
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    error::JsNativeError,
    js_string,
    object::{JsObject, internal_methods::get_prototype_from_constructor},
    realm::Realm,
    string::StaticJsStrings,
};

use super::{BuiltInBuilder, BuiltInConstructor, IntrinsicObject};

/// Boolean implementation.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Boolean;

impl IntrinsicObject for Boolean {
    fn init(realm: &Realm) {
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .method(Self::to_string, js_string!("toString"), 0)
            .method(Self::value_of, js_string!("valueOf"), 0)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for Boolean {
    const NAME: JsString = StaticJsStrings::BOOLEAN;
}

impl BuiltInConstructor for Boolean {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 2;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::boolean;

    /// `[[Construct]]` Create a new boolean object
    ///
    /// `[[Call]]` Creates a new boolean primitive
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // Get the argument, if any
        let data = args.first().is_some_and(JsValue::to_boolean);
        if new_target.is_undefined() {
            return Ok(JsValue::new(data));
        }
        let prototype =
            get_prototype_from_constructor(new_target, StandardConstructors::boolean, context)?;
        let boolean =
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), prototype, data);

        Ok(boolean.into())
    }
}

impl Boolean {
    /// An Utility function used to get the internal `[[BooleanData]]`.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-thisbooleanvalue
    fn this_boolean_value(value: &JsValue) -> JsResult<bool> {
        value
            .as_boolean()
            .or_else(|| {
                value
                    .as_object()
                    .and_then(|obj| obj.downcast_ref::<bool>().as_deref().copied())
            })
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("'this' is not a boolean")
                    .into()
            })
    }

    /// The `toString()` method returns a string representing the specified `Boolean` object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-boolean-object
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean/toString
    #[allow(clippy::wrong_self_convention)]
    pub(crate) fn to_string(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let boolean = Self::this_boolean_value(this)?;
        Ok(JsValue::new(if boolean {
            js_string!("true")
        } else {
            js_string!("false")
        }))
    }

    /// The `valueOf()` method returns the primitive value of a `Boolean` object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-boolean.prototype.valueof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean/valueOf
    pub(crate) fn value_of(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Ok(JsValue::new(Self::this_boolean_value(this)?))
    }
}
