//! Boa's implementation of the ECMAScript `Iterator` constructor.
//!
//! The `Iterator` constructor is designed to be subclassed. It may be used as the
//! value of an extends clause of a class definition.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-iterator-constructor

use std::collections::VecDeque;

use crate::{
    Context, JsArgs, JsData, JsResult, JsString, JsValue,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        iterable::iterator_helper::{self, IterableRecord},
        object::OrdinaryObject,
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    error::JsNativeError,
    js_error, js_string,
    object::{JsFunction, JsObject, PROTOTYPE, internal_methods::get_prototype_from_constructor},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
};
use boa_gc::{Finalize, Trace};

use super::{iterator_helper::IteratorHelper, wrap_for_valid_iterator::WrapForValidIterator};

/// The `Iterator` constructor.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-iterator-constructor
#[derive(Debug, Clone, Trace, Finalize, JsData)]
pub(crate) struct IteratorConstructor;

impl IntrinsicObject for IteratorConstructor {
    fn init(realm: &Realm) {
        let iterator_prototype = realm.intrinsics().constructors().iterator().prototype();
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .inherits(Some(iterator_prototype.clone()))
            // Static methods
            .static_method(Self::from, js_string!("from"), 1)
            .static_method(Self::concat, js_string!("concat"), 0)
            .static_property(PROTOTYPE, iterator_prototype, Attribute::empty())
            .build_without_prototype();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.constructors().iterator().constructor()
    }
}

impl BuiltInObject for IteratorConstructor {
    const NAME: JsString = StaticJsStrings::ITERATOR;
}

impl BuiltInConstructor for IteratorConstructor {
    const PROTOTYPE_STORAGE_SLOTS: usize = 0;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 3;
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::iterator;

    /// `Iterator ( )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-iterator
    fn constructor(
        new_target: &JsValue,
        _args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined or the active function object, throw a TypeError exception.
        if new_target.is_undefined()
            || new_target
                == &context
                    .active_function_object()
                    .unwrap_or_else(|| context.intrinsics().constructors().iterator().constructor())
                    .into()
        {
            return Err(JsNativeError::typ()
                .with_message(if new_target.is_undefined() {
                    "Iterator constructor requires 'new'"
                } else {
                    "Abstract class Iterator not directly constructable"
                })
                .into());
        }

        // 2. Return ? OrdinaryCreateFromConstructor(NewTarget, "%Iterator.prototype%").
        let prototype =
            get_prototype_from_constructor(new_target, StandardConstructors::iterator, context)?;

        // Create an ordinary object (Iterator instances have no internal data slots).
        Ok(JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            OrdinaryObject,
        )
        .upcast()
        .into())
    }
}

impl IteratorConstructor {
    /// `Iterator.from ( O )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-iterator.from
    fn from(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let o = args.get_or_undefined(0);

        // 1. Let iteratorRecord be ? GetIteratorFlattenable(O, iterate-strings).
        let iterator_record = super::get_iterator_flattenable(o, true, context)?;

        // 2. Let hasInstance be ? OrdinaryHasInstance(%Iterator%, iteratorRecord.[[Iterator]]).
        let iterator_constructor = context.intrinsics().constructors().iterator().constructor();
        let has_instance = JsValue::ordinary_has_instance(
            &iterator_constructor.clone().into(),
            &iterator_record.iterator().clone().into(),
            context,
        )?;

        // 3. If hasInstance is true, then
        if has_instance {
            // a. Return iteratorRecord.[[Iterator]].
            return Ok(iterator_record.iterator().clone().into());
        }

        // 4. Let wrapper be OrdinaryObjectCreate(%WrapForValidIteratorPrototype%, « [[Iterated]] »).
        // 5. Set wrapper.[[Iterated]] to iteratorRecord.
        // 6. Return wrapper.
        let wrapper = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            context
                .intrinsics()
                .objects()
                .iterator_prototypes()
                .wrap_for_valid_iterator(),
            WrapForValidIterator {
                iterated: iterator_record,
            },
        );

        Ok(wrapper.into())
    }

    /// `Iterator.concat ( ...items )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-iterator.concat
    fn concat(_this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let iterables be a new empty List.
        let mut iterables = VecDeque::with_capacity(args.len());

        // 2. For each element item of items, do
        for item in args {
            // a. If item is not an Object, throw a TypeError exception.
            let Some(item) = item.as_object() else {
                return Err(js_error!(TypeError: "Iterator.concat requires iterable objects"));
            };

            // b. Let method be ? GetMethod(item, %Symbol.iterator%).
            // c. If method is undefined, throw a TypeError exception.
            let method = item.get_method(JsSymbol::iterator(), context)?.ok_or_else(
                || js_error!(TypeError: "Iterator.concat requires objects with @@iterator"),
            )?;

            // d. Append the Record { [[OpenMethod]]: method, [[Iterable]]: item } to iterables.
            iterables.push_back(IterableRecord {
                iterable: item,
                open_method: JsFunction::from_object_unchecked(method),
            });
        }

        // 3. Let closure be a new Abstract Closure with no parameters that captures iterables
        //    and performs the following steps when called:
        //    (implemented via IteratorHelperOp::Concat in execute_next)
        // 4-5. Let result be CreateIteratorFromClosure(closure, "Iterator Helper", ...)
        //      with [[UnderlyingIterators]] set to a new empty List.
        let helper = IteratorHelper::create(iterator_helper::Concat::new(iterables), context);

        // 6. Return result.
        Ok(helper.into())
    }
}
