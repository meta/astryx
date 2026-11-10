//! This module implements the `MapIterator` object.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-map-iterator-objects

use super::ordered_map::OrderedMap;
use crate::{
    Context, JsData, JsResult,
    builtins::{
        Array, BuiltInBuilder, IntrinsicObject, JsValue, iterable::create_iter_result_object,
    },
    context::intrinsics::Intrinsics,
    error::JsNativeError,
    js_string,
    object::JsObject,
    property::{Attribute, PropertyNameKind},
    realm::Realm,
    symbol::JsSymbol,
};
use boa_gc::{Finalize, Trace};

#[derive(Debug, Trace)]
struct MapIteratorLock(JsObject<OrderedMap<JsValue>>);

impl MapIteratorLock {
    fn new(js_object: JsObject<OrderedMap<JsValue>>) -> Self {
        js_object.borrow_mut().data_mut().lock();
        Self(js_object)
    }
}

impl Finalize for MapIteratorLock {
    fn finalize(&self) {
        self.0.borrow_mut().data_mut().unlock();
    }
}

/// The Map Iterator object represents an iteration over a map. It implements the iterator protocol.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-map-iterator-objects
#[derive(Debug, Finalize, Trace, JsData)]
pub(crate) struct MapIterator {
    iterated_map: Option<MapIteratorLock>,
    next_index: usize,
    #[unsafe_ignore_trace]
    iteration_kind: PropertyNameKind,
}

impl IntrinsicObject for MapIterator {
    fn init(realm: &Realm) {
        BuiltInBuilder::with_intrinsic::<Self>(realm)
            .prototype(realm.intrinsics().constructors().iterator().prototype())
            .static_method(Self::next, js_string!("next"), 0)
            .static_property(
                JsSymbol::to_string_tag(),
                js_string!("Map Iterator"),
                Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().iterator_prototypes().map()
    }
}

impl MapIterator {
    /// Abstract operation `CreateMapIterator( map, kind )`
    ///
    /// Creates a new iterator over the given map.
    ///
    /// More information:
    ///  - [ECMA reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-createmapiterator
    pub(crate) fn create_map_iterator(
        map: JsObject<OrderedMap<JsValue>>,
        kind: PropertyNameKind,
        context: &mut Context,
    ) -> JsValue {
        let iter = Self {
            iterated_map: Some(MapIteratorLock::new(map)),
            next_index: 0,
            iteration_kind: kind,
        };
        let map_iterator = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            context.intrinsics().objects().iterator_prototypes().map(),
            iter,
        );
        map_iterator.into()
    }

    /// %MapIteratorPrototype%.next( )
    ///
    /// Advances the iterator and gets the next result in the map.
    ///
    /// More information:
    ///  - [ECMA reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-%mapiteratorprototype%.next
    pub(crate) fn next(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let mut map_iterator = object
            .as_ref()
            .and_then(JsObject::downcast_mut::<Self>)
            .ok_or_else(|| JsNativeError::typ().with_message("`this` is not a MapIterator"))?;

        let item_kind = map_iterator.iteration_kind;

        if let Some(obj) = map_iterator.iterated_map.take() {
            let e = {
                let mut entries = obj.0.borrow_mut();
                let entries = entries.data_mut();
                let len = entries.full_len();
                loop {
                    let element = entries
                        .get_index(map_iterator.next_index)
                        .map(|(v, k)| (v.clone(), k.clone()));
                    map_iterator.next_index += 1;
                    if element.is_some() || map_iterator.next_index >= len {
                        break element;
                    }
                }
            };
            if let Some((key, value)) = e {
                let item = match item_kind {
                    PropertyNameKind::Key => Ok(create_iter_result_object(key, false, context)),
                    PropertyNameKind::Value => Ok(create_iter_result_object(value, false, context)),
                    PropertyNameKind::KeyAndValue => {
                        let result = Array::create_array_from_list([key, value], context);
                        Ok(create_iter_result_object(result.into(), false, context))
                    }
                };
                map_iterator.iterated_map = Some(obj);
                return item;
            }
        }

        Ok(create_iter_result_object(
            JsValue::undefined(),
            true,
            context,
        ))
    }
}
