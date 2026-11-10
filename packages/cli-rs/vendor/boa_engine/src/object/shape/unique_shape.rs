use std::{cell::RefCell, fmt::Debug};

use boa_gc::{Finalize, Gc, GcRefCell, Trace, WeakGc};

use crate::property::PropertyKey;

use super::{
    ChangeTransition, ChangeTransitionAction, JsPrototype, Shape, Slot,
    property_table::PropertyTableInner, shared_shape::TransitionKey,
};

/// The internal representation of [`UniqueShape`].
#[derive(Default, Debug, Trace, Finalize)]
struct Inner {
    /// The property table that maps a [`PropertyKey`] to a slot in the objects storage.
    //
    // SAFETY: This is safe because nothing in this field needs tracing.
    #[unsafe_ignore_trace]
    property_table: RefCell<PropertyTableInner>,

    /// The prototype of the shape.
    prototype: GcRefCell<JsPrototype>,
}

/// Represents a [`Shape`] that is not shared with any other object.
///
/// This is useful for objects that are inherently unique like,
/// the builtin object.
///
/// Cloning this does a shallow clone.
#[derive(Default, Debug, Clone, Trace, Finalize)]
pub(crate) struct UniqueShape {
    inner: Gc<Inner>,
}

impl UniqueShape {
    /// Create a new [`UniqueShape`].
    pub(crate) fn new(prototype: JsPrototype, property_table: PropertyTableInner) -> Self {
        Self {
            inner: Gc::new(Inner {
                property_table: RefCell::new(property_table),
                prototype: GcRefCell::new(prototype),
            }),
        }
    }

    pub(crate) fn override_internal(
        &self,
        property_table: PropertyTableInner,
        prototype: JsPrototype,
    ) {
        *self.inner.property_table.borrow_mut() = property_table;
        *self.inner.prototype.borrow_mut() = prototype;
    }

    /// Get the prototype of the [`UniqueShape`].
    pub(crate) fn prototype(&self) -> JsPrototype {
        self.inner.prototype.borrow().clone()
    }

    /// Get the property table of the [`UniqueShape`].
    fn property_table(&self) -> &RefCell<PropertyTableInner> {
        &self.inner.property_table
    }

    /// Inserts a new property into the [`UniqueShape`].
    pub(crate) fn insert_property_transition(&self, key: TransitionKey) -> Self {
        let mut property_table = self.property_table().borrow_mut();
        property_table.insert(key.property_key, key.attributes);
        self.clone()
    }

    /// Remove a property from the [`UniqueShape`].
    ///
    /// This will cause the current shape to be invalidated, and a new [`UniqueShape`] will be returned.
    pub(crate) fn remove_property_transition(&self, key: &PropertyKey) -> Self {
        let mut property_table = self.property_table().borrow_mut();
        let Some((index, _attributes)) = property_table.map.remove(key) else {
            return self.clone();
        };

        let index = index as usize;

        // shift elements
        property_table.keys.remove(index);

        // The property that was deleted was not the last property added.
        // Therefore we need to create a new unique shape,
        // to invalidate any pointers to this shape i.e inline caches.
        let mut property_table = std::mem::take(&mut *property_table);

        // If it is not the last property that was deleted,
        // then update all the property slots that are after it.
        if index != property_table.keys.len() {
            // Get the previous value before the value at index,
            //
            // NOTE: calling wrapping_sub when usize index is 0 will wrap into usize::MAX
            //       which will return None, avoiding unneeded checks.
            let mut previous_slot = property_table.keys.get(index.wrapping_sub(1)).map(|x| x.1);

            // Update all slot positions
            for (index, (key, slot)) in property_table.keys.iter_mut().enumerate().skip(index) {
                *slot = Slot::from_previous(previous_slot, slot.attributes);

                let Some((map_index, map_slot)) = property_table.map.get_mut(key) else {
                    unreachable!("There should already be a property")
                };
                *map_index = index as u32;
                *map_slot = *slot;

                previous_slot = Some(*slot);
            }
        }

        let prototype = self.inner.prototype.borrow_mut().take();
        Self::new(prototype, property_table)
    }

    /// Does a property lookup on the [`UniqueShape`] returning the [`Slot`] where it's
    /// located or [`None`] otherwise.
    pub(crate) fn lookup(&self, key: &PropertyKey) -> Option<Slot> {
        let property_table = self.property_table().borrow();
        if let Some((_, slot)) = property_table.map.get(key) {
            return Some(*slot);
        }

        None
    }

    /// Change the attributes of a property from the [`UniqueShape`].
    ///
    /// This will cause the current shape to be invalidated, and a new [`UniqueShape`] will be returned.
    ///
    /// NOTE: This assumes that the property had already been inserted.
    pub(crate) fn change_attributes_transition(
        &self,
        key: &TransitionKey,
    ) -> ChangeTransition<Shape> {
        let mut property_table = self.property_table().borrow_mut();
        let Some((index, slot)) = property_table.map.get_mut(&key.property_key) else {
            unreachable!("Attribute change can only happen on existing property")
        };

        let index = *index as usize;

        // If property does not change type, there is no need to shift.
        if slot.attributes.width_match(key.attributes) {
            slot.attributes = key.attributes;
            property_table.keys[index].1.attributes = key.attributes;
            // TODO: invalidate the pointer.
            return ChangeTransition {
                shape: self.clone().into(),
                action: ChangeTransitionAction::Nothing,
            };
        }
        slot.attributes = key.attributes;

        let mut previous_slot = *slot;

        property_table.keys[index].1.attributes = key.attributes;

        let action = if key.attributes.is_accessor_descriptor() {
            // Data --> Accessor
            ChangeTransitionAction::Insert
        } else {
            // Accessor --> Data
            ChangeTransitionAction::Remove
        };

        // The property that was deleted was not the last property added.
        // Therefore we need to create a new unique shape,
        // to invalidate any pointers to this shape i.e inline caches.
        let mut property_table = std::mem::take(&mut *property_table);

        // Update all slot positions, after the target property.
        //
        // Example: Change 2nd one from accessor to data
        //
        // | Idx: 0, DATA  | Idx: 1, ACCESSOR | Idx: 3, DATA |
        //                         \----- target
        //
        // Change attributes of target (given trough arguments).
        //
        // | Idx: 0, DATA  | Idx: 1, DATA | Idx: 3, DATA |
        //                         \----- target
        //
        // The target becomes the previous pointer and next is target_index + 1,
        // continue until we reach the end.
        //
        // | Idx: 0, DATA  | Idx: 1, DATA | Idx: 3, DATA |
        //           previous ----/               \-------- next
        //
        // When next is out of range we quit, everything has been set.
        //
        // | Idx: 0, DATA  | Idx: 1, DATA | Idx: 2, DATA |    EMPTY   |
        //                          previous ----/              \-------- next
        //
        let next = index + 1;
        for (key, slot) in property_table.keys.iter_mut().skip(next) {
            *slot = Slot::from_previous(Some(previous_slot), slot.attributes);

            let Some((_, map_slot)) = property_table.map.get_mut(key) else {
                unreachable!("There should already be a property")
            };
            *map_slot = *slot;

            previous_slot = *slot;
        }

        let prototype = self.inner.prototype.borrow_mut().take();
        let shape = Self::new(prototype, property_table);

        ChangeTransition {
            shape: shape.into(),
            action,
        }
    }

    /// Change the prototype of the [`UniqueShape`].
    ///
    /// This will cause the current shape to be invalidated, and a new [`UniqueShape`] will be returned.
    pub(crate) fn change_prototype_transition(&self, prototype: JsPrototype) -> Self {
        let mut property_table = self.inner.property_table.borrow_mut();

        // We need to create a new unique shape,
        // to invalidate any pointers to this shape i.e inline caches.
        let property_table = std::mem::take(&mut *property_table);
        Self::new(prototype, property_table)
    }

    /// Gets all keys first strings then symbols in creation order.
    pub(crate) fn keys(&self) -> Vec<PropertyKey> {
        self.property_table().borrow().keys()
    }

    /// Return location in memory of the [`UniqueShape`].
    pub(crate) fn to_addr_usize(&self) -> usize {
        let ptr: *const _ = self.inner.as_ref();
        ptr as usize
    }
}

/// Represents a weak reference to [`UniqueShape`].
#[derive(Debug, Clone, Trace, Finalize, PartialEq)]
pub(crate) struct WeakUniqueShape {
    inner: WeakGc<Inner>,
}

impl WeakUniqueShape {
    /// Upgrade returns a [`UniqueShape`] pointer for the internal value if the pointer is still live,
    /// or [`None`] if the value was already garbage collected.
    #[inline]
    #[must_use]
    pub(crate) fn upgrade(&self) -> Option<UniqueShape> {
        Some(UniqueShape {
            inner: self.inner.upgrade()?,
        })
    }
}

impl From<&UniqueShape> for WeakUniqueShape {
    fn from(value: &UniqueShape) -> Self {
        WeakUniqueShape {
            inner: WeakGc::new(&value.inner),
        }
    }
}
