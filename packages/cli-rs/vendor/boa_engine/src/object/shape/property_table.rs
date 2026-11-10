use crate::{
    object::shape::slot::{Slot, SlotAttributes},
    property::PropertyKey,
};
use rustc_hash::{FxBuildHasher, FxHashMap};
use std::{cell::RefCell, rc::Rc};

/// The internal representation of [`PropertyTable`].
#[derive(Default, Debug, Clone)]
pub(crate) struct PropertyTableInner {
    pub(crate) map: FxHashMap<PropertyKey, (u32, Slot)>,
    pub(crate) keys: Vec<(PropertyKey, Slot)>,
}

impl PropertyTableInner {
    /// Returns a new table with a given minimum capacity.
    pub(crate) fn with_capacity(capacity: usize) -> Self {
        Self {
            map: FxHashMap::with_capacity_and_hasher(capacity, FxBuildHasher),
            keys: Vec::with_capacity(capacity),
        }
    }

    /// Returns all the keys, in insertion order.
    pub(crate) fn keys(&self) -> Vec<PropertyKey> {
        self.keys_cloned_n(self.keys.len() as u32)
    }

    /// Returns `n` cloned keys, in insertion order.
    pub(crate) fn keys_cloned_n(&self, n: u32) -> Vec<PropertyKey> {
        let n = n as usize;

        self.keys
            .iter()
            .take(n)
            .map(|(key, _)| key)
            .filter(|key| matches!(key, PropertyKey::String(_)))
            .chain(
                self.keys
                    .iter()
                    .take(n)
                    .map(|(key, _)| key)
                    .filter(|key| matches!(key, PropertyKey::Symbol(_))),
            )
            .cloned()
            .collect()
    }

    /// Returns a new table with `n` cloned properties.
    pub(crate) fn clone_count(&self, n: u32) -> Self {
        let n = n as usize;

        let mut keys = Vec::with_capacity(n);
        let mut map = FxHashMap::default();

        for (index, (key, slot)) in self.keys.iter().take(n).enumerate() {
            keys.push((key.clone(), *slot));
            map.insert(key.clone(), (index as u32, *slot));
        }

        Self { map, keys }
    }

    /// Insert a property entry into the table.
    pub(crate) fn insert(&mut self, key: PropertyKey, attributes: SlotAttributes) {
        let slot = Slot::from_previous(self.keys.last().map(|x| x.1), attributes);
        let index = self.keys.len() as u32;
        self.keys.push((key.clone(), slot));
        let value = self.map.insert(key, (index, slot));
        debug_assert!(value.is_none());
    }
}

/// Represents an ordered property table, that maps [`PropertyTable`] to [`Slot`].
///
/// This is shared between [`crate::object::shape::SharedShape`].
#[derive(Default, Debug, Clone)]
pub(crate) struct PropertyTable {
    pub(super) inner: Rc<RefCell<PropertyTableInner>>,
}

impl PropertyTable {
    /// Creates a new `PropertyTable` with the specified capacity.
    pub(crate) fn with_capacity(capacity: usize) -> Self {
        Self {
            inner: Rc::new(RefCell::new(PropertyTableInner::with_capacity(capacity))),
        }
    }

    /// Returns the inner representation of a [`PropertyTable`].
    pub(super) fn inner(&self) -> &RefCell<PropertyTableInner> {
        &self.inner
    }

    /// Add a property to the [`PropertyTable`] or deep clone it,
    /// if there already is a property or the property has attributes that are not the same.
    pub(crate) fn add_property_deep_clone_if_needed(
        &self,
        key: PropertyKey,
        attributes: SlotAttributes,
        property_count: u32,
    ) -> Self {
        {
            let mut inner = self.inner.borrow_mut();
            if (property_count as usize) == inner.keys.len() && !inner.map.contains_key(&key) {
                inner.insert(key, attributes);
                return self.clone();
            }
        }

        // property is already present need to make deep clone of property table.
        let this = self.deep_clone(property_count);
        {
            let mut inner = this.inner.borrow_mut();
            inner.insert(key, attributes);
        }
        this
    }

    /// Deep clone the [`PropertyTable`] in insertion order with the first n properties.
    pub(crate) fn deep_clone(&self, n: u32) -> Self {
        Self {
            inner: Rc::new(RefCell::new(self.inner.borrow().clone_count(n))),
        }
    }

    /// Deep clone the [`PropertyTable`].
    pub(crate) fn deep_clone_all(&self) -> Self {
        Self {
            inner: Rc::new(RefCell::new((*self.inner.borrow()).clone())),
        }
    }

    /// Change the attributes of a property.
    pub(crate) fn set_attributes_at_index(
        &self,
        key: &PropertyKey,
        property_attributes: SlotAttributes,
    ) {
        let mut inner = self.inner.borrow_mut();
        let Some((index, slot)) = inner.map.get_mut(key) else {
            unreachable!("There should already be a property!")
        };
        slot.attributes = property_attributes;
        let index = *index as usize;

        inner.keys[index].1.attributes = property_attributes;
    }

    /// Get a property from the [`PropertyTable`].
    ///
    /// Panics:
    ///
    /// If it is not in the [`PropertyTable`].
    pub(crate) fn get_expect(&self, key: &PropertyKey) -> Slot {
        let inner = self.inner.borrow();
        let Some((_, slot)) = inner.map.get(key) else {
            unreachable!("There should already be a property!")
        };
        *slot
    }
}
