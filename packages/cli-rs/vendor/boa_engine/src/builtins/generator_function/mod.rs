//! Boa's implementation of ECMAScript's global `GeneratorFunction` object.
//!
//! The `GeneratorFunction` constructor creates a new generator function object.
//! In ECMAScript, every generator function is actually a `GeneratorFunction` object.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-generatorfunction-objects
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/GeneratorFunction

use crate::{
    Context, JsResult, JsString,
    builtins::{BuiltInObject, function::BuiltInFunctionObject},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    object::PROTOTYPE,
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
    value::JsValue,
};

use super::{BuiltInBuilder, BuiltInConstructor, IntrinsicObject};

/// The internal representation of a `Generator` object.
#[derive(Debug, Clone, Copy)]
pub struct GeneratorFunction;

impl IntrinsicObject for GeneratorFunction {
    fn init(realm: &Realm) {
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .inherits(Some(
                realm.intrinsics().constructors().function().prototype(),
            ))
            .constructor_attributes(Attribute::CONFIGURABLE)
            .property(
                PROTOTYPE,
                realm.intrinsics().objects().generator(),
                Attribute::CONFIGURABLE,
            )
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

impl BuiltInObject for GeneratorFunction {
    const NAME: JsString = StaticJsStrings::GENERATOR_FUNCTION;
}

impl BuiltInConstructor for GeneratorFunction {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 2;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::generator_function;

    /// `GeneratorFunction ( p1, p2, … , pn, body )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-generatorfunction
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
            false,
            true,
            context,
        )
        .map(Into::into)
    }
}
