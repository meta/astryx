//! This module implements the global `AggregateError` object.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-aggregate-error
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError

use crate::{
    Context, JsArgs, JsExpect, JsResult, JsString, JsValue,
    builtins::{
        Array, BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        iterable::IteratorHint,
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::{JsObject, internal_methods::get_prototype_from_constructor},
    property::{Attribute, PropertyDescriptorBuilder},
    realm::Realm,
    string::StaticJsStrings,
};

use super::{Error, ErrorKind};

#[derive(Debug, Clone, Copy)]
pub(crate) struct AggregateError;

impl IntrinsicObject for AggregateError {
    fn init(realm: &Realm) {
        let attribute = Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE;
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .prototype(realm.intrinsics().constructors().error().constructor())
            .inherits(Some(realm.intrinsics().constructors().error().prototype()))
            .property(js_string!("name"), Self::NAME, attribute)
            .property(js_string!("message"), js_string!(), attribute)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for AggregateError {
    const NAME: JsString = StaticJsStrings::AGGREGATE_ERROR;
}

impl BuiltInConstructor for AggregateError {
    const CONSTRUCTOR_ARGUMENTS: usize = 2;
    const PROTOTYPE_STORAGE_SLOTS: usize = 2;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::aggregate_error;

    /// [`AggregateError ( errors, message [ , options ] )`][spec]
    ///
    /// Creates a new aggregate error object.
    ///
    /// [spec]: AggregateError ( errors, message [ , options ] )
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, let newTarget be the active function object; else let newTarget be NewTarget.
        let new_target = &if new_target.is_undefined() {
            context
                .active_function_object()
                .unwrap_or_else(|| {
                    context
                        .intrinsics()
                        .constructors()
                        .aggregate_error()
                        .constructor()
                })
                .into()
        } else {
            new_target.clone()
        };
        // 2. Let O be ? OrdinaryCreateFromConstructor(newTarget, "%AggregateError.prototype%", « [[ErrorData]] »).
        let prototype = get_prototype_from_constructor(
            new_target,
            StandardConstructors::aggregate_error,
            context,
        )?;
        let o = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            Error::with_caller_position(ErrorKind::Aggregate, context),
        )
        .upcast();

        // 3. If message is not undefined, then
        let message = args.get_or_undefined(1);
        if !message.is_undefined() {
            // a. Let msg be ? ToString(message).
            let msg = message.to_string(context)?;

            // b. Perform CreateNonEnumerableDataPropertyOrThrow(O, "message", msg).
            o.create_non_enumerable_data_property_or_throw(js_string!("message"), msg, context);
        }

        // 4. Perform ? InstallErrorCause(O, options).
        Error::install_error_cause(&o, args.get_or_undefined(2), context)?;

        // 5. Let errorsList be ? IteratorToList(? GetIterator(errors, sync)).
        let errors = args.get_or_undefined(0);
        let errors_list = errors
            .get_iterator(IteratorHint::Sync, context)?
            .into_list(context)?;

        // 6. Perform ! DefinePropertyOrThrow(O, "errors",
        //    PropertyDescriptor {
        //      [[Configurable]]: true,
        //      [[Enumerable]]: false,
        //      [[Writable]]: true,
        //      [[Value]]: CreateArrayFromList(errorsList)
        //    }).
        o.define_property_or_throw(
            js_string!("errors"),
            PropertyDescriptorBuilder::new()
                .configurable(true)
                .enumerable(false)
                .writable(true)
                .value(Array::create_array_from_list(errors_list, context))
                .build(),
            context,
        )
        .js_expect("should not fail according to spec")?;

        // 5. Return O.
        Ok(o.into())
    }
}
