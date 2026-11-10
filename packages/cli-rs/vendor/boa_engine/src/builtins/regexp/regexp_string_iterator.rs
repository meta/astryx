//! This module implements the global `RegExp String Iterator` object.
//!
//! A `RegExp` String Iterator is an object, that represents a specific iteration over some
//! specific String instance object, matching against some specific `RegExp` instance object.
//! There is not a named constructor for `RegExp` String Iterator objects. Instead, `RegExp`
//! String Iterator objects are created by calling certain methods of `RegExp` instance objects.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-regexp-string-iterator-objects

use crate::{
    Context, JsData, JsResult, JsString, JsValue,
    builtins::{BuiltInBuilder, IntrinsicObject, iterable::create_iter_result_object, regexp},
    context::intrinsics::Intrinsics,
    error::JsNativeError,
    js_string,
    object::JsObject,
    property::Attribute,
    realm::Realm,
    symbol::JsSymbol,
};
use boa_gc::{Finalize, Trace};
use regexp::{RegExp, advance_string_index};

/// The `RegExp String Iterator` object.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-regexp-string-iterator-objects
#[derive(Debug, Clone, Finalize, Trace, JsData)]
pub(crate) struct RegExpStringIterator {
    matcher: JsObject,
    string: JsString,
    global: bool,
    unicode: bool,
    completed: bool,
}

impl IntrinsicObject for RegExpStringIterator {
    fn init(realm: &Realm) {
        BuiltInBuilder::with_intrinsic::<Self>(realm)
            .prototype(realm.intrinsics().constructors().iterator().prototype())
            .static_method(Self::next, js_string!("next"), 0)
            .static_property(
                JsSymbol::to_string_tag(),
                js_string!("RegExp String Iterator"),
                Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().iterator_prototypes().regexp_string()
    }
}

// TODO: See todos in create_regexp_string_iterator and next.
impl RegExpStringIterator {
    fn new(matcher: JsObject, string: JsString, global: bool, unicode: bool) -> Self {
        Self {
            matcher,
            string,
            global,
            unicode,
            completed: false,
        }
    }

    /// `22.2.7.1 CreateRegExpStringIterator ( R, S, global, fullUnicode )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-createregexpstringiterator
    pub(crate) fn create_regexp_string_iterator(
        matcher: JsObject,
        string: JsString,
        global: bool,
        unicode: bool,
        context: &mut Context,
    ) -> JsValue {
        // TODO: Implement this with closures and generators.
        //       For now all values of the closure are stored in RegExpStringIterator and the actual closure execution is in `.next()`.

        // 1. Assert: Type(S) is String.
        // 2. Assert: Type(global) is Boolean.
        // 3. Assert: Type(fullUnicode) is Boolean.

        // 4. Let closure be a new Abstract Closure with no parameters that captures R, S, global,
        //    and fullUnicode and performs the following steps when called:

        // 5. Return ! CreateIteratorFromClosure(closure, "%RegExpStringIteratorPrototype%", %RegExpStringIteratorPrototype%).

        let regexp_string_iterator = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            context
                .intrinsics()
                .objects()
                .iterator_prototypes()
                .regexp_string(),
            Self::new(matcher, string, global, unicode),
        );

        regexp_string_iterator.into()
    }

    /// `%RegExpStringIteratorPrototype%.next ( )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%regexpstringiteratorprototype%.next
    pub(crate) fn next(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let mut iterator = object
            .as_ref()
            .and_then(JsObject::downcast_mut::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("`this` is not a RegExpStringIterator")
            })?;
        if iterator.completed {
            return Ok(create_iter_result_object(
                JsValue::undefined(),
                true,
                context,
            ));
        }

        // TODO: This is the code that should be created as a closure in create_regexp_string_iterator.

        // i. Let match be ? RegExpExec(R, S).
        let m = RegExp::abstract_exec(&iterator.matcher, iterator.string.clone(), context)?;

        if let Some(m) = m {
            // iii. If global is false, then
            if !iterator.global {
                // 1. Perform ? Yield(match).
                // 2. Return undefined.
                iterator.completed = true;
                return Ok(create_iter_result_object(m.into(), false, context));
            }

            // iv. Let matchStr be ? ToString(? Get(match, "0")).
            let m_str = m.get(0, context)?.to_string(context)?;

            // v. If matchStr is the empty String, then
            if m_str.is_empty() {
                // 1. Let thisIndex be ℝ(? ToLength(? Get(R, "lastIndex"))).
                let this_index = iterator
                    .matcher
                    .get(js_string!("lastIndex"), context)?
                    .to_length(context)?;

                // 2. Let nextIndex be ! AdvanceStringIndex(S, thisIndex, fullUnicode).
                let next_index =
                    advance_string_index(&iterator.string, this_index, iterator.unicode);

                // 3. Perform ? Set(R, "lastIndex", 𝔽(nextIndex), true).
                iterator
                    .matcher
                    .set(js_string!("lastIndex"), next_index, true, context)?;
            }

            // vi. Perform ? Yield(match).
            Ok(create_iter_result_object(m.into(), false, context))
        } else {
            // ii. If match is null, return undefined.
            iterator.completed = true;
            Ok(create_iter_result_object(
                JsValue::undefined(),
                true,
                context,
            ))
        }
    }
}
