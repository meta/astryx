mod forward_transition;
pub(crate) mod template;

#[cfg(test)]
mod tests;

use std::{collections::hash_map::RandomState, hash::Hash};

use bitflags::bitflags;
use boa_gc::{Finalize, Gc, Trace, WeakGc, empty_trace};
use indexmap::IndexMap;

use crate::{JsObject, object::JsPrototype, property::PropertyKey};

use self::forward_transition::ForwardTransition;

use super::{
    ChangeTransition, ChangeTransitionAction, Slot, UniqueShape, property_table::PropertyTable,
    slot::SlotAttributes,
};

/// Represent a [`SharedShape`] property transition.
#[derive(Debug, Finalize, Clone, PartialEq, Eq, Hash)]
pub(crate) struct TransitionKey {
    pub(crate) property_key: PropertyKey,
    pub(crate) attributes: SlotAttributes,
}

// SAFETY: Non of the member of this struct are garbage collected,
//         so this should be fine.
unsafe impl Trace for TransitionKey {
    empty_trace!();
}

const INSERT_PROPERTY_TRANSITION_TYPE: u8 = 0b0000_0000;
const CONFIGURE_PROPERTY_TRANSITION_TYPE: u8 = 0b0000_0001;
const PROTOTYPE_TRANSITION_TYPE: u8 = 0b0000_0010;

// Reserved for future use!
#[allow(unused)]
const RESERVED_TRANSITION_TYPE: u8 = 0b0000_0011;

bitflags! {
    /// Flags of a shape.
    #[derive(Default, Debug, Clone, Copy, PartialEq, Eq, Finalize)]
    pub struct ShapeFlags: u8 {
        /// Represents the transition type of a [`SharedShape`].
        const TRANSITION_TYPE = 0b0000_0011;
    }
}

impl ShapeFlags {
    // NOTE: Remove type bits and set the new ones.
    fn insert_property_transition_from(previous: Self) -> Self {
        previous.difference(Self::TRANSITION_TYPE)
            | Self::from_bits_retain(INSERT_PROPERTY_TRANSITION_TYPE)
    }
    fn configure_property_transition_from(previous: Self) -> Self {
        previous.difference(Self::TRANSITION_TYPE)
            | Self::from_bits_retain(CONFIGURE_PROPERTY_TRANSITION_TYPE)
    }
    fn prototype_transition_from(previous: Self) -> Self {
        previous.difference(Self::TRANSITION_TYPE)
            | Self::from_bits_retain(PROTOTYPE_TRANSITION_TYPE)
    }

    const fn is_insert_transition_type(self) -> bool {
        self.intersection(Self::TRANSITION_TYPE).bits() == INSERT_PROPERTY_TRANSITION_TYPE
    }
    const fn is_prototype_transition_type(self) -> bool {
        self.intersection(Self::TRANSITION_TYPE).bits() == PROTOTYPE_TRANSITION_TYPE
    }
}

// SAFETY: Non of the member of this struct are garbage collected,
//         so this should be fine.
unsafe impl Trace for ShapeFlags {
    empty_trace!();
}

/// The internal representation of a [`SharedShape`].
#[derive(Debug, Trace, Finalize)]
struct Inner {
    /// See [`ForwardTransition`].
    forward_transitions: ForwardTransition,

    /// The count of how many properties this [`SharedShape`] holds.
    property_count: u32,

    /// Instance prototype `__proto__`.
    prototype: JsPrototype,

    // SAFETY: This is safe because nothing in [`PropertyTable`]
    //         needs tracing
    #[unsafe_ignore_trace]
    property_table: PropertyTable,

    /// The previous shape in the transition chain.
    ///
    /// [`None`] if it is the root shape.
    previous: Option<SharedShape>,

    /// How many transitions have happened from the root node.
    transition_count: u16,

    /// Flags about the shape.
    flags: ShapeFlags,
}

/// Represents a shared object shape.
#[derive(Debug, Trace, Finalize, Clone)]
pub struct SharedShape {
    inner: Gc<Inner>,
}

impl SharedShape {
    fn property_table(&self) -> &PropertyTable {
        &self.inner.property_table
    }
    /// Return the property count that this shape owns in the [`PropertyTable`].
    fn property_count(&self) -> u32 {
        self.inner.property_count
    }
    /// Return the index to the property in the [`PropertyTable`].
    fn property_index(&self) -> u32 {
        self.inner.property_count.saturating_sub(1)
    }
    /// Getter for the transition count field.
    #[must_use]
    pub fn transition_count(&self) -> u16 {
        self.inner.transition_count
    }
    /// Getter for the previous field.
    #[must_use]
    pub fn previous(&self) -> Option<&Self> {
        self.inner.previous.as_ref()
    }
    /// Get the prototype of the shape.
    #[must_use]
    pub fn prototype(&self) -> JsPrototype {
        self.inner.prototype.clone()
    }
    /// Get the property this [`SharedShape`] refers to.
    pub(crate) fn property(&self) -> (PropertyKey, Slot) {
        let inner = self.property_table().inner().borrow();
        let (key, slot) = inner
            .keys
            .get(self.property_index() as usize)
            .expect("There should be a property");
        (key.clone(), *slot)
    }
    /// Get the flags of the shape.
    fn flags(&self) -> ShapeFlags {
        self.inner.flags
    }
    /// Getter for the [`ForwardTransition`] field.
    fn forward_transitions(&self) -> &ForwardTransition {
        &self.inner.forward_transitions
    }
    /// Check if the shape has the given prototype.
    #[must_use]
    pub fn has_prototype(&self, prototype: &JsObject) -> bool {
        self.inner.prototype.as_ref() == Some(prototype)
    }

    /// Create a new [`SharedShape`].
    fn new(inner: Inner) -> Self {
        Self {
            inner: Gc::new(inner),
        }
    }

    /// Create a root [`SharedShape`].
    #[must_use]
    pub(crate) fn root() -> Self {
        Self::new(Inner {
            forward_transitions: ForwardTransition::default(),
            prototype: None,
            property_count: 0,
            // Most of the time the root shape initiates with between 1-4 properties.
            property_table: PropertyTable::with_capacity(4),
            previous: None,
            flags: ShapeFlags::default(),
            transition_count: 0,
        })
    }

    /// Create a [`SharedShape`] change prototype transition.
    pub(crate) fn change_prototype_transition(&self, prototype: JsPrototype) -> Self {
        if let Some(shape) = self.forward_transitions().get_prototype(&prototype) {
            if let Some(inner) = shape.upgrade() {
                return Self { inner };
            }

            self.forward_transitions().prune_prototype_transitions();
        }
        let new_inner_shape = Inner {
            forward_transitions: ForwardTransition::default(),
            prototype: prototype.clone(),
            property_table: self.property_table().clone(),
            property_count: self.property_count(),
            previous: Some(self.clone()),
            transition_count: self.transition_count() + 1,
            flags: ShapeFlags::prototype_transition_from(self.flags()),
        };
        let new_shape = Self::new(new_inner_shape);

        self.forward_transitions()
            .insert_prototype(prototype, &new_shape.inner);

        new_shape
    }

    /// Create a [`SharedShape`] insert property transition.
    pub(crate) fn insert_property_transition(&self, key: TransitionKey) -> Self {
        // Check if we have already created such a transition, if so use it!
        if let Some(shape) = self.forward_transitions().get_property(&key) {
            if let Some(inner) = shape.upgrade() {
                return Self { inner };
            }

            self.forward_transitions().prune_property_transitions();
        }

        let property_table = self.property_table().add_property_deep_clone_if_needed(
            key.property_key.clone(),
            key.attributes,
            self.property_count(),
        );
        let new_inner_shape = Inner {
            prototype: self.prototype(),
            forward_transitions: ForwardTransition::default(),
            property_table,
            property_count: self.property_count() + 1,
            previous: Some(self.clone()),
            transition_count: self.transition_count() + 1,
            flags: ShapeFlags::insert_property_transition_from(self.flags()),
        };
        let new_shape = Self::new(new_inner_shape);

        self.forward_transitions()
            .insert_property(key, &new_shape.inner);

        new_shape
    }

    /// Create a [`SharedShape`] change prototype transition, returning [`ChangeTransition`].
    pub(crate) fn change_attributes_transition(
        &self,
        key: TransitionKey,
    ) -> ChangeTransition<Self> {
        let slot = self.property_table().get_expect(&key.property_key);

        // Check if we have already created such a transition, if so use it!
        if let Some(shape) = self.forward_transitions().get_property(&key) {
            if let Some(inner) = shape.upgrade() {
                let action = if slot.attributes.width_match(key.attributes) {
                    ChangeTransitionAction::Nothing
                } else if slot.attributes.is_accessor_descriptor() {
                    // Accessor property --> Data property
                    ChangeTransitionAction::Remove
                } else {
                    // Data property --> Accessor property
                    ChangeTransitionAction::Insert
                };

                return ChangeTransition {
                    shape: Self { inner },
                    action,
                };
            }

            self.forward_transitions().prune_property_transitions();
        }

        // The attribute change transitions, didn't change from accessor to data property or vice-versa.
        if slot.attributes.width_match(key.attributes) {
            let property_table = self.property_table().deep_clone_all();
            property_table.set_attributes_at_index(&key.property_key, key.attributes);
            let inner_shape = Inner {
                forward_transitions: ForwardTransition::default(),
                prototype: self.prototype(),
                property_table,
                property_count: self.property_count(),
                previous: Some(self.clone()),
                transition_count: self.transition_count() + 1,
                flags: ShapeFlags::configure_property_transition_from(self.flags()),
            };
            let shape = Self::new(inner_shape);

            self.forward_transitions()
                .insert_property(key, &shape.inner);

            return ChangeTransition {
                shape,
                action: ChangeTransitionAction::Nothing,
            };
        }

        // Rollback before the property has added.
        let (mut base, prototype, transitions) = self.rollback_before(&key.property_key);

        // Apply prototype transition, if it was found.
        if let Some(prototype) = prototype {
            base = base.change_prototype_transition(prototype);
        }

        // Apply this property.
        base = base.insert_property_transition(key);

        // Apply previous properties.
        for (property_key, attributes) in transitions.into_iter().rev() {
            let transition = TransitionKey {
                property_key,
                attributes,
            };
            base = base.insert_property_transition(transition);
        }

        // Determine action to be performed on the storage.
        let action = if slot.attributes.is_accessor_descriptor() {
            // Accessor property --> Data property
            ChangeTransitionAction::Remove
        } else {
            // Data property --> Accessor property
            ChangeTransitionAction::Insert
        };

        ChangeTransition {
            shape: base,
            action,
        }
    }

    /// Rollback to shape before the insertion of the [`PropertyKey`] that is provided.
    ///
    /// This returns the shape before the insertion, if it sees a prototype transition it will return the latest one,
    /// ignoring any others, [`None`] otherwise. It also will return the property transitions ordered from
    /// latest to oldest that it sees.
    ///
    /// NOTE: In the transitions it does not include the property that we are rolling back.
    ///
    /// NOTE: The prototype transitions if it sees a property insert and then later an attribute change it will condense
    /// into one property insert transition with the new attribute in the change attribute transition,
    /// in the same place that the property was inserted initially.
    //
    // For example with the following chain:
    //
    //        INSERT(x)             INSERT(y)                INSERT(z)
    // { }  ------------>  { x }  ------------>  { x, y }  ------------>  { x, y, z }
    //
    // Then we call rollback on `y`:
    //
    //        INSERT(x)             INSERT(y)                INSERT(z)
    // { }  ------------>  { x }  ------------>  { x, y }  ------------>  { x, y, z }
    //                       ^
    //                       \--- base (with array of transitions to be performed: INSERT(z),
    //                                                 and protortype: None )
    fn rollback_before(
        &self,
        key: &PropertyKey,
    ) -> (
        Self,
        Option<JsPrototype>,
        IndexMap<PropertyKey, SlotAttributes>,
    ) {
        let mut prototype = None;
        let mut transitions: IndexMap<PropertyKey, SlotAttributes, RandomState> =
            IndexMap::default();

        let mut current = Some(self);
        let base = loop {
            let Some(current_shape) = current else {
                unreachable!("The chain should have insert transition type!")
            };

            // We only take the latest prototype change it, if it exists.
            if current_shape.flags().is_prototype_transition_type() {
                if prototype.is_none() {
                    prototype = Some(current_shape.prototype().clone());
                }

                // Skip when it is a prototype transition.
                current = current_shape.previous();
                continue;
            }

            let (current_property_key, slot) = current_shape.property();

            if current_shape.flags().is_insert_transition_type() && &current_property_key == key {
                let base = if let Some(base) = current_shape.previous() {
                    base.clone()
                } else {
                    // It's the root, because it doesn't have previous.
                    current_shape.clone()
                };
                break base;
            }

            // Do not add property that we are trying to delete.
            // this can happen if a configure was called after inserting it into the shape
            if &current_property_key != key {
                // Only take the latest changes to a property. To try to build a smaller tree.
                transitions
                    .entry(current_property_key)
                    .or_insert(slot.attributes);
            }

            current = current_shape.previous();
        };

        (base, prototype, transitions)
    }

    /// Remove a property from [`SharedShape`], returning the new [`SharedShape`].
    pub(crate) fn remove_property_transition(&self, key: &PropertyKey) -> Self {
        let (mut base, prototype, transitions) = self.rollback_before(key);

        // Apply prototype transition, if it was found.
        if let Some(prototype) = prototype {
            base = base.change_prototype_transition(prototype);
        }

        for (property_key, attributes) in transitions.into_iter().rev() {
            let transition = TransitionKey {
                property_key,
                attributes,
            };
            base = base.insert_property_transition(transition);
        }

        base
    }

    /// Do a property lookup, returns [`None`] if property not found.
    pub(crate) fn lookup(&self, key: &PropertyKey) -> Option<Slot> {
        let property_count = self.property_count();
        if property_count == 0 {
            return None;
        }

        let property_table_inner = self.property_table().inner().borrow();
        // Check if we are trying to access properties that belong to another shape.
        if let Some((property_table_index, slot)) = property_table_inner.map.get(key)
            && *property_table_index < self.property_count()
        {
            return Some(*slot);
        }
        None
    }

    /// Gets all keys first strings then symbols in creation order.
    pub(crate) fn keys(&self) -> Vec<PropertyKey> {
        let property_table = self.property_table().inner().borrow();
        property_table.keys_cloned_n(self.property_count())
    }

    /// Returns a new [`UniqueShape`] with the properties of the [`SharedShape`].
    pub(crate) fn to_unique(&self) -> UniqueShape {
        UniqueShape::new(
            self.prototype(),
            self.property_table()
                .inner()
                .borrow()
                .clone_count(self.property_count()),
        )
    }

    /// Return location in memory of the [`SharedShape`].
    pub(crate) fn to_addr_usize(&self) -> usize {
        let ptr: *const _ = self.inner.as_ref();
        ptr as usize
    }
}

/// Represents a weak reference to [`SharedShape`].
#[derive(Debug, Trace, Finalize, Clone, PartialEq)]
pub(crate) struct WeakSharedShape {
    inner: WeakGc<Inner>,
}

impl WeakSharedShape {
    /// Upgrade returns a [`SharedShape`] pointer for the internal value if the pointer is still live,
    /// or [`None`] if the value was already garbage collected.
    #[inline]
    #[must_use]
    pub(crate) fn upgrade(&self) -> Option<SharedShape> {
        Some(SharedShape {
            inner: self.inner.upgrade()?,
        })
    }
}

impl From<&SharedShape> for WeakSharedShape {
    fn from(value: &SharedShape) -> Self {
        WeakSharedShape {
            inner: WeakGc::new(&value.inner),
        }
    }
}
