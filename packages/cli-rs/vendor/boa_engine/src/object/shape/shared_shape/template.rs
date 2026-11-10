use boa_gc::{Finalize, Trace};
use thin_vec::ThinVec;

use crate::{
    JsValue,
    object::{
        IndexedProperties, JsObject, NativeObject, Object, ObjectData, PropertyMap,
        shape::slot::SlotAttributes,
    },
    property::{Attribute, PropertyKey},
};

use super::{SharedShape, TransitionKey};

/// Represent a template of an objects properties and prototype.
/// This is used to construct as many objects  as needed from a predefined [`SharedShape`].
#[derive(Debug, Clone, Trace, Finalize)]
pub(crate) struct ObjectTemplate {
    shape: SharedShape,
}

impl ObjectTemplate {
    /// Create a new [`ObjectTemplate`]
    pub(crate) fn new(shape: &SharedShape) -> Self {
        Self {
            shape: shape.clone(),
        }
    }

    /// Create and [`ObjectTemplate`] with a prototype.
    pub(crate) fn with_prototype(shape: &SharedShape, prototype: JsObject) -> Self {
        let shape = shape.change_prototype_transition(Some(prototype));
        Self { shape }
    }

    /// Check if the shape has a specific, prototype.
    pub(crate) fn has_prototype(&self, prototype: &JsObject) -> bool {
        self.shape.has_prototype(prototype)
    }

    /// Set the prototype of the [`ObjectTemplate`].
    ///
    /// This assumes that the prototype has not been set yet.
    pub(crate) fn set_prototype(&mut self, prototype: JsObject) -> &mut Self {
        self.shape = self.shape.change_prototype_transition(Some(prototype));
        self
    }

    /// Returns the inner shape of the [`ObjectTemplate`].
    pub(crate) const fn shape(&self) -> &SharedShape {
        &self.shape
    }

    /// Add a data property to the [`ObjectTemplate`].
    ///
    /// This assumes that the property with the given key was not previously set
    /// and that it's a string or symbol.
    pub(crate) fn property(&mut self, key: PropertyKey, attributes: Attribute) -> &mut Self {
        debug_assert!(!matches!(&key, PropertyKey::Index(_)));

        let attributes = SlotAttributes::from_bits_truncate(attributes.bits());
        self.shape = self.shape.insert_property_transition(TransitionKey {
            property_key: key,
            attributes,
        });
        self
    }

    /// Add a accessor property to the [`ObjectTemplate`].
    ///
    /// This assumes that the property with the given key was not previously set
    /// and that it's a string or symbol.
    pub(crate) fn accessor(
        &mut self,
        key: PropertyKey,
        get: bool,
        set: bool,
        attributes: Attribute,
    ) -> &mut Self {
        // TODO: We don't support indexed keys.
        debug_assert!(!matches!(&key, PropertyKey::Index(_)));

        let attributes = {
            let mut result = SlotAttributes::empty();
            result.set(
                SlotAttributes::CONFIGURABLE,
                attributes.contains(Attribute::CONFIGURABLE),
            );
            result.set(
                SlotAttributes::ENUMERABLE,
                attributes.contains(Attribute::ENUMERABLE),
            );

            result.set(SlotAttributes::GET, get);
            result.set(SlotAttributes::SET, set);

            result
        };

        self.shape = self.shape.insert_property_transition(TransitionKey {
            property_key: key,
            attributes,
        });
        self
    }

    /// Create an object from the [`ObjectTemplate`]
    ///
    /// The storage must match the properties provided.
    pub(crate) fn create<T: NativeObject>(&self, data: T, storage: Vec<JsValue>) -> JsObject {
        let internal_methods = data.internal_methods();

        let mut object = Object {
            data: ObjectData::new(data),
            extensible: true,
            properties: PropertyMap::new(self.shape.clone().into(), IndexedProperties::default()),
            private_elements: ThinVec::new(),
        };

        object.properties.storage = storage;

        JsObject::from_object_and_vtable(object, internal_methods)
    }

    /// Create an object from the [`ObjectTemplate`]
    ///
    /// The storage must match the properties provided. It does not apply to
    /// the indexed properties.
    pub(crate) fn create_with_indexed_properties<T: NativeObject>(
        &self,
        data: T,
        storage: Vec<JsValue>,
        indexed_properties: IndexedProperties,
    ) -> JsObject {
        let internal_methods = data.internal_methods();
        let mut object = Object {
            data: ObjectData::new(data),
            extensible: true,
            properties: PropertyMap::new(self.shape.clone().into(), indexed_properties),
            private_elements: ThinVec::new(),
        };

        object.properties.storage = storage;

        JsObject::from_object_and_vtable(object, internal_methods)
    }
}
