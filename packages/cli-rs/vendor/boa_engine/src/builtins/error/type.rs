//! This module implements the global `TypeError` object.
//!
//! The `TypeError` object represents an error when an operation could not be performed,
//! typically (but not exclusively) when a value is not of the expected type.
//!
//! A `TypeError` may be thrown when:
//!  - an operand or argument passed to a function is incompatible with the type expected by that operator or function.
//!  - when attempting to modify a value that cannot be changed.
//!  - when attempting to use a value in an inappropriate way.
//!
//! More information:
//!  - [MDN documentation][mdn]
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard-typeerror
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypeError

use crate::{
    Context, JsResult, JsString, JsValue, NativeFunction,
    builtins::{BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    error::JsNativeError,
    js_string,
    native_function::NativeFunctionObject,
    object::JsObject,
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
};

use super::{Error, ErrorKind};

/// JavaScript `TypeError` implementation.
#[derive(Debug, Clone, Copy)]
pub(crate) struct TypeError;

impl IntrinsicObject for TypeError {
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

impl BuiltInObject for TypeError {
    const NAME: JsString = StaticJsStrings::TYPE_ERROR;
}

impl BuiltInConstructor for TypeError {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 2;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::type_error;

    /// Create a new error object.
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        Error::native_error_constructor(
            new_target,
            args,
            context,
            ErrorKind::Type,
            StandardConstructors::type_error,
        )
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ThrowTypeError;

impl IntrinsicObject for ThrowTypeError {
    fn init(realm: &Realm) {
        let obj = BuiltInBuilder::with_intrinsic::<Self>(realm)
            .prototype(realm.intrinsics().constructors().function().prototype())
            .static_property(StaticJsStrings::LENGTH, 0, Attribute::empty())
            .static_property(js_string!("name"), js_string!(), Attribute::empty())
            .build();

        {
            let mut obj = obj
                .downcast_mut::<NativeFunctionObject>()
                .expect("`%ThrowTypeError%` must be a function");
            obj.f = NativeFunction::from_fn_ptr(|_, _, _| {
                Err(JsNativeError::typ()
                    .with_message(
                        "'caller', 'callee', and 'arguments' properties may not be accessed on strict mode \
                        functions or the arguments objects for calls to them",
                    )
                    .into())
            });
            obj.name = js_string!();
            obj.constructor = None;
            obj.realm = Some(realm.clone());
        }

        obj.borrow_mut().extensible = false;
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().throw_type_error().into()
    }
}
