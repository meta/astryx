use std::fmt::Debug;

use boa_gc::{Finalize, Gc, GcRefCell, Trace, WeakGc};
use rustc_hash::FxHashMap;

use crate::object::JsPrototype;

use super::{Inner as SharedShapeInner, TransitionKey};

/// Maps transition key type to a [`SharedShapeInner`] transition.
#[derive(Debug, Trace, Finalize)]
struct TransitionMap<T: Debug + Trace + Finalize> {
    map: FxHashMap<T, WeakGc<SharedShapeInner>>,

    /// This counts the number of insertions after a prune operation.
    insertion_count_since_prune: u8,
}

impl<T: Debug + Trace + Finalize> Default for TransitionMap<T> {
    fn default() -> Self {
        Self {
            map: FxHashMap::default(),
            insertion_count_since_prune: 0,
        }
    }
}

impl<T: Debug + Trace + Finalize> TransitionMap<T> {
    fn get_and_increment_count(&mut self) -> u8 {
        let result = self.insertion_count_since_prune;

        // NOTE(HalidOdat): This is done so it overflows to 0, on every 256 insertion
        // operations. Fulfills the prune condition every 256 insertions.
        self.insertion_count_since_prune = self.insertion_count_since_prune.wrapping_add(1);

        result
    }
}

/// The internal representation of [`ForwardTransition`].
#[derive(Default, Debug, Trace, Finalize)]
struct Inner {
    properties: Option<Box<TransitionMap<TransitionKey>>>,
    prototypes: Option<Box<TransitionMap<JsPrototype>>>,
}

/// Holds a forward reference to a previously created transition.
///
/// The reference is weak, therefore it can be garbage collected, if it's not in use.
#[derive(Default, Debug, Trace, Finalize)]
pub(super) struct ForwardTransition {
    inner: GcRefCell<Inner>,
}

impl ForwardTransition {
    /// Insert a property transition.
    pub(super) fn insert_property(&self, key: TransitionKey, value: &Gc<SharedShapeInner>) {
        let mut this = self.inner.borrow_mut();
        let properties = this.properties.get_or_insert_with(Box::default);

        if properties.get_and_increment_count() == u8::MAX {
            properties.map.retain(|_, v| v.is_upgradable());
        }

        properties.map.insert(key, WeakGc::new(value));
    }

    /// Insert a prototype transition.
    pub(super) fn insert_prototype(&self, key: JsPrototype, value: &Gc<SharedShapeInner>) {
        let mut this = self.inner.borrow_mut();
        let prototypes = this.prototypes.get_or_insert_with(Box::default);

        if prototypes.get_and_increment_count() == u8::MAX {
            prototypes.map.retain(|_, v| v.is_upgradable());
        }

        prototypes.map.insert(key, WeakGc::new(value));
    }

    /// Get a property transition, return [`None`] otherwise.
    pub(super) fn get_property(&self, key: &TransitionKey) -> Option<WeakGc<SharedShapeInner>> {
        let this = self.inner.borrow();
        let transitions = this.properties.as_ref()?;
        transitions.map.get(key).cloned()
    }

    /// Get a prototype transition, return [`None`] otherwise.
    pub(super) fn get_prototype(&self, key: &JsPrototype) -> Option<WeakGc<SharedShapeInner>> {
        let this = self.inner.borrow();
        let transitions = this.prototypes.as_ref()?;
        transitions.map.get(key).cloned()
    }

    /// Prunes the [`WeakGc`]s that have been garbage collected.
    pub(super) fn prune_property_transitions(&self) {
        let mut this = self.inner.borrow_mut();
        let Some(transitions) = this.properties.as_deref_mut() else {
            return;
        };

        transitions.insertion_count_since_prune = 0;
        transitions.map.retain(|_, v| v.is_upgradable());
    }

    /// Prunes the [`WeakGc`]s that have been garbage collected.
    pub(super) fn prune_prototype_transitions(&self) {
        let mut this = self.inner.borrow_mut();
        let Some(transitions) = this.prototypes.as_deref_mut() else {
            return;
        };

        transitions.insertion_count_since_prune = 0;
        transitions.map.retain(|_, v| v.is_upgradable());
    }

    #[cfg(test)]
    pub(crate) fn property_transitions_count(&self) -> (usize, u8) {
        let this = self.inner.borrow();
        this.properties.as_ref().map_or((0, 0), |transitions| {
            (
                transitions.map.len(),
                transitions.insertion_count_since_prune,
            )
        })
    }

    #[cfg(test)]
    pub(crate) fn prototype_transitions_count(&self) -> (usize, u8) {
        let this = self.inner.borrow();
        this.prototypes.as_ref().map_or((0, 0), |transitions| {
            (
                transitions.map.len(),
                transitions.insertion_count_since_prune,
            )
        })
    }
}
