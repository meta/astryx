//! Boa's implementation of ECMAScript's global `AsyncFunction` object.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-async-function-objects
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncFunction

use crate::{
    Context, JsResult, JsString, JsValue,
    builtins::{BuiltInObject, function::BuiltInFunctionObject},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
};

use super::{BuiltInBuilder, BuiltInConstructor, IntrinsicObject};

/// The internal representation of an `AsyncFunction` object.
#[derive(Debug, Clone, Copy)]
pub struct AsyncFunction;

impl IntrinsicObject for AsyncFunction {
    fn init(realm: &Realm) {
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .prototype(realm.intrinsics().constructors().function().constructor())
            .inherits(Some(
                realm.intrinsics().constructors().function().prototype(),
            ))
            .property(
                JsSymbol::to_string_tag(),
                Self::NAME,
                Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> crate::object::JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for AsyncFunction {
    const NAME: JsString = StaticJsStrings::ASYNC_FUNCTION;
}

impl BuiltInConstructor for AsyncFunction {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 1;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::async_function;

    /// `AsyncFunction ( p1, p2, … , pn, body )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-async-function-constructor-arguments
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let active_function = context.active_function_object().unwrap_or_else(|| {
            context
                .intrinsics()
                .constructors()
                .async_function()
                .constructor()
        });
        BuiltInFunctionObject::create_dynamic_function(
            active_function,
            new_target,
            args,
            true,
            false,
            context,
        )
        .map(Into::into)
    }
}
