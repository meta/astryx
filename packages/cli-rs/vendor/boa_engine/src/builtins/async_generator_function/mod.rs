//! Boa's implementation of ECMAScript's `AsyncGeneratorFunction` object.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-asyncgeneratorfunction-objects

use crate::{
    Context, JsResult, JsString,
    builtins::{BuiltInObject, function::BuiltInFunctionObject},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    object::{JsObject, PROTOTYPE},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
    value::JsValue,
};

use super::{BuiltInBuilder, BuiltInConstructor, IntrinsicObject};

/// The internal representation of an `AsyncGeneratorFunction` object.
#[derive(Debug, Clone, Copy)]
pub struct AsyncGeneratorFunction;

impl IntrinsicObject for AsyncGeneratorFunction {
    fn init(realm: &Realm) {
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .inherits(Some(
                realm.intrinsics().constructors().function().prototype(),
            ))
            .constructor_attributes(Attribute::CONFIGURABLE)
            .property(
                PROTOTYPE,
                realm.intrinsics().objects().async_generator(),
                Attribute::CONFIGURABLE,
            )
            .property(
                JsSymbol::to_string_tag(),
                Self::NAME,
                Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for AsyncGeneratorFunction {
    const NAME: JsString = StaticJsStrings::ASYNC_GENERATOR_FUNCTION;
}

impl BuiltInConstructor for AsyncGeneratorFunction {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 2;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::async_generator_function;

    /// `AsyncGeneratorFunction ( p1, p2, … , pn, body )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-asyncgeneratorfunction
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let active_function = context.active_function_object().unwrap_or_else(|| {
            context
                .intrinsics()
                .constructors()
                .generator_function()
                .constructor()
        });
        BuiltInFunctionObject::create_dynamic_function(
            active_function,
            new_target,
            args,
            true,
            true,
            context,
        )
        .map(Into::into)
    }
}
