use boa_gc::{Finalize, Trace, WeakGc};

use crate::{
    Context, JsArgs, JsNativeError, JsResult, JsString, JsValue,
    builtins::{BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::{ErasedVTableObject, JsObject, internal_methods::get_prototype_from_constructor},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
};

/// Boa's implementation of ECMAScript's `WeakRef` builtin object.
///
/// The `WeakRef` is a way to refer to a target object without rooting the target and thus preserving it in garbage
/// collection. A `WeakRef` will allow the user to dereference the target as long as the target object has not been
/// collected by the garbage collector.
///
/// More Information:
///  - [ECMAScript Reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-weak-ref-objects
#[derive(Debug, Clone, Trace, Finalize)]
pub(crate) struct WeakRef;

impl IntrinsicObject for WeakRef {
    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }

    fn init(realm: &Realm) {
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .property(
                JsSymbol::to_string_tag(),
                js_string!("WeakRef"),
                Attribute::CONFIGURABLE,
            )
            .method(Self::deref, js_string!("deref"), 0)
            .build();
    }
}

impl BuiltInObject for WeakRef {
    const NAME: JsString = StaticJsStrings::WEAK_REF;

    const ATTRIBUTE: Attribute = Attribute::WRITABLE.union(Attribute::CONFIGURABLE);
}

impl BuiltInConstructor for WeakRef {
    /// The amount of arguments the `WeakRef` constructor takes.
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 2;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::weak_ref;

    /// Constructor [`WeakRef ( target )`][cons]
    ///
    /// [cons]: https://tc39.es/ecma262/#sec-weak-ref-target
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message("WeakRef: cannot call constructor without `new`")
                .into());
        }

        // 2. If target is not an Object, throw a TypeError exception.
        let target = args.first().and_then(JsValue::as_object).ok_or_else(|| {
            JsNativeError::typ().with_message(format!(
                "WeakRef: expected target argument of type `object`, got target of type `{}`",
                args.get_or_undefined(0).type_of()
            ))
        })?;

        // 3. Let weakRef be ? OrdinaryCreateFromConstructor(NewTarget, "%WeakRef.prototype%", « [[WeakRefTarget]] »).
        // 5. Set weakRef.[[WeakRefTarget]] to target.
        let prototype =
            get_prototype_from_constructor(new_target, StandardConstructors::weak_ref, context)?;
        let weak_ref = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            WeakGc::new(target.inner()),
        );

        // 4. Perform AddToKeptObjects(target).
        context.kept_alive.push(target.clone());

        // 6. Return weakRef.
        Ok(weak_ref.into())
    }
}

impl WeakRef {
    /// Method [`WeakRef.prototype.deref ( )`][spec].
    ///
    /// If the referenced object hasn't been collected, this method promotes a `WeakRef` into a
    /// proper [`JsObject`], or returns `undefined` otherwise.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-weak-ref.prototype.deref
    pub(crate) fn deref(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let weakRef be the this value.
        // 2. Perform ? RequireInternalSlot(weakRef, [[WeakRefTarget]]).
        let object = this.as_object();
        let weak_ref = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<WeakGc<ErasedVTableObject>>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "WeakRef.prototype.deref: expected `this` to be a `WeakRef` object",
                )
            })?;

        // 3. Return WeakRefDeref(weakRef).

        // `WeakRefDeref`
        // https://tc39.es/ecma262/multipage/managing-memory.html#sec-weakrefderef
        // 1. Let target be weakRef.[[WeakRefTarget]].
        // 2. If target is not empty, then
        if let Some(object) = weak_ref.upgrade() {
            let object = JsObject::from(object);

            // a. Perform AddToKeptObjects(target).
            context.kept_alive.push(object.clone());

            // b. Return target.
            Ok(object.into())
        } else {
            // 3. Return undefined.
            Ok(JsValue::undefined())
        }
    }
}

#[cfg(test)]
mod tests {
    use indoc::indoc;

    use crate::{JsNativeErrorKind, JsValue, TestAction, run_test_actions};

    #[test]
    fn weak_ref_collected() {
        run_test_actions([
            TestAction::assert_with_op(
                indoc! {r#"
                    var ptr;
                    {
                        let obj = {a: 5, b: 6};
                        ptr = new WeakRef(obj);
                    }
                    ptr.deref()
                "#},
                |v, _| v.is_object(),
            ),
            TestAction::inspect_context(|context| {
                context.clear_kept_objects();
                boa_gc::force_collect();
            }),
            TestAction::assert_eq("ptr.deref()", JsValue::undefined()),
        ]);
    }

    #[test]
    fn weak_ref_no_new() {
        run_test_actions([TestAction::assert_native_error(
            "WeakRef({})",
            JsNativeErrorKind::Type,
            "WeakRef: cannot call constructor without `new`",
        )]);
    }

    #[test]
    fn weak_ref_primitive_target_rejection() {
        run_test_actions([
            TestAction::assert_native_error(
                "new WeakRef(42)",
                JsNativeErrorKind::Type,
                "WeakRef: expected target argument of type `object`, got target of type `number`",
            ),
            TestAction::assert_native_error(
                "new WeakRef('str')",
                JsNativeErrorKind::Type,
                "WeakRef: expected target argument of type `object`, got target of type `string`",
            ),
            TestAction::assert_native_error(
                "new WeakRef(true)",
                JsNativeErrorKind::Type,
                "WeakRef: expected target argument of type `object`, got target of type `boolean`",
            ),
            TestAction::assert_native_error(
                "new WeakRef(null)",
                JsNativeErrorKind::Type,
                "WeakRef: expected target argument of type `object`, got target of type `object`",
            ),
            TestAction::assert_native_error(
                "new WeakRef(undefined)",
                JsNativeErrorKind::Type,
                "WeakRef: expected target argument of type `object`, got target of type `undefined`",
            ),
            TestAction::assert_native_error(
                "new WeakRef(Symbol())",
                JsNativeErrorKind::Type,
                "WeakRef: expected target argument of type `object`, got target of type `symbol`",
            ),
        ]);
    }

    #[test]
    fn weak_ref_deref_behavior() {
        run_test_actions([
            TestAction::run(indoc! {r#"
                var obj = { x: 1 };
                var ref = new WeakRef(obj);
            "#}),
            TestAction::assert("ref.deref() === obj"),
            TestAction::assert("ref.deref() === ref.deref()"),
        ]);
    }

    #[test]
    fn weak_ref_deref_invalid_this() {
        run_test_actions([TestAction::assert_native_error(
            "WeakRef.prototype.deref.call({})",
            JsNativeErrorKind::Type,
            "WeakRef.prototype.deref: expected `this` to be a `WeakRef` object",
        )]);
    }

    #[test]
    fn weak_ref_length() {
        run_test_actions([
            TestAction::assert_eq("WeakRef.length", 1),
            TestAction::assert_eq("WeakRef.prototype.deref.length", 0),
        ]);
    }
}
