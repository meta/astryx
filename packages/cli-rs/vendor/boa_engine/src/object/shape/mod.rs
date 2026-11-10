//! Implements object shapes.

pub(crate) mod property_table;
mod root_shape;
pub(crate) mod shared_shape;
pub(crate) mod slot;
pub(crate) mod unique_shape;

pub use root_shape::RootShape;
pub use shared_shape::SharedShape;
pub(crate) use unique_shape::UniqueShape;

use std::fmt::Debug;

use boa_gc::{Finalize, Trace};

use crate::property::PropertyKey;

use self::{
    shared_shape::{TransitionKey, WeakSharedShape},
    slot::Slot,
    unique_shape::WeakUniqueShape,
};

use super::JsPrototype;

/// Action to be performed after a property attribute change
//
// Example: of { get/set x() { ... }, y: ... } into { x: ..., y: ... }
//
//                 0       1       2
//    Storage: | get x | set x |   y   |
//
// We delete at position of x which is index 0 (it spans two elements) + 1:
//
//                 0      1
//    Storage: |   x  |   y   |
pub(crate) enum ChangeTransitionAction {
    /// Do nothing to storage.
    Nothing,

    /// Remove element at (index + 1) from storage.
    Remove,

    /// Insert element at (index + 1) into storage.
    Insert,
}

/// The result of a change property attribute transition.
pub(crate) struct ChangeTransition<T> {
    /// The shape after transition.
    pub(crate) shape: T,

    /// The needed action to be performed after transition to the object storage.
    pub(crate) action: ChangeTransitionAction,
}

/// The internal representation of [`Shape`].
#[derive(Debug, Trace, Finalize, Clone)]
enum Inner {
    Unique(UniqueShape),
    Shared(SharedShape),
}

/// Represents the shape of an object.
#[derive(Debug, Trace, Finalize, Clone)]
pub struct Shape {
    inner: Inner,
}

impl Default for Shape {
    #[inline]
    fn default() -> Self {
        UniqueShape::default().into()
    }
}

impl Shape {
    /// The max transition count of a [`SharedShape`] from the root node,
    /// before the shape will be converted into a [`UniqueShape`]
    ///
    /// NOTE: This only applies to [`SharedShape`].
    const TRANSITION_COUNT_MAX: u16 = 1024;

    /// Returns `true` if it's a shared shape, `false` otherwise.
    #[inline]
    #[must_use]
    pub const fn is_shared(&self) -> bool {
        matches!(self.inner, Inner::Shared(_))
    }

    /// Returns `true` if it's a unique shape, `false` otherwise.
    #[inline]
    #[must_use]
    pub const fn is_unique(&self) -> bool {
        matches!(self.inner, Inner::Unique(_))
    }

    pub(crate) const fn as_unique(&self) -> Option<&UniqueShape> {
        if let Inner::Unique(shape) = &self.inner {
            return Some(shape);
        }
        None
    }

    /// Create an insert property transitions returning the new transitioned [`Shape`].
    ///
    /// NOTE: This assumes that there is no property with the given key!
    pub(crate) fn insert_property_transition(&self, key: TransitionKey) -> Self {
        match &self.inner {
            Inner::Shared(shape) => {
                let shape = shape.insert_property_transition(key);
                if shape.transition_count() >= Self::TRANSITION_COUNT_MAX {
                    return shape.to_unique().into();
                }
                shape.into()
            }
            Inner::Unique(shape) => shape.insert_property_transition(key).into(),
        }
    }

    /// Create a change attribute property transitions returning [`ChangeTransition`] containing the new [`Shape`]
    /// and actions to be performed
    ///
    /// NOTE: This assumes that there already is a property with the given key!
    pub(crate) fn change_attributes_transition(
        &self,
        key: TransitionKey,
    ) -> ChangeTransition<Self> {
        match &self.inner {
            Inner::Shared(shape) => {
                let change_transition = shape.change_attributes_transition(key);
                let shape =
                    if change_transition.shape.transition_count() >= Self::TRANSITION_COUNT_MAX {
                        change_transition.shape.to_unique().into()
                    } else {
                        change_transition.shape.into()
                    };
                ChangeTransition {
                    shape,
                    action: change_transition.action,
                }
            }
            Inner::Unique(shape) => shape.change_attributes_transition(&key),
        }
    }

    /// Remove a property property from the [`Shape`] returning the new transitioned [`Shape`].
    ///
    /// NOTE: This assumes that there already is a property with the given key!
    pub(crate) fn remove_property_transition(&self, key: &PropertyKey) -> Self {
        match &self.inner {
            Inner::Shared(shape) => {
                let shape = shape.remove_property_transition(key);
                if shape.transition_count() >= Self::TRANSITION_COUNT_MAX {
                    return shape.to_unique().into();
                }
                shape.into()
            }
            Inner::Unique(shape) => shape.remove_property_transition(key).into(),
        }
    }

    /// Create a prototype transitions returning the new transitioned [`Shape`].
    pub(crate) fn change_prototype_transition(&self, prototype: JsPrototype) -> Self {
        match &self.inner {
            Inner::Shared(shape) => {
                let shape = shape.change_prototype_transition(prototype);
                if shape.transition_count() >= Self::TRANSITION_COUNT_MAX {
                    return shape.to_unique().into();
                }
                shape.into()
            }
            Inner::Unique(shape) => shape.change_prototype_transition(prototype).into(),
        }
    }

    /// Get the [`JsPrototype`] of the [`Shape`].
    #[must_use]
    pub fn prototype(&self) -> JsPrototype {
        match &self.inner {
            Inner::Shared(shape) => shape.prototype(),
            Inner::Unique(shape) => shape.prototype(),
        }
    }

    /// Lookup a property in the shape
    #[inline]
    pub(crate) fn lookup(&self, key: &PropertyKey) -> Option<Slot> {
        match &self.inner {
            Inner::Shared(shape) => shape.lookup(key),
            Inner::Unique(shape) => shape.lookup(key),
        }
    }

    /// Returns the keys of the [`Shape`], in insertion order.
    #[inline]
    #[must_use]
    pub fn keys(&self) -> Vec<PropertyKey> {
        match &self.inner {
            Inner::Shared(shape) => shape.keys(),
            Inner::Unique(shape) => shape.keys(),
        }
    }

    /// Return location in memory of the [`Shape`].
    #[inline]
    #[must_use]
    pub fn to_addr_usize(&self) -> usize {
        match &self.inner {
            Inner::Shared(shape) => shape.to_addr_usize(),
            Inner::Unique(shape) => shape.to_addr_usize(),
        }
    }
}

impl From<UniqueShape> for Shape {
    fn from(shape: UniqueShape) -> Self {
        Self {
            inner: Inner::Unique(shape),
        }
    }
}

impl From<SharedShape> for Shape {
    fn from(shape: SharedShape) -> Self {
        Self {
            inner: Inner::Shared(shape),
        }
    }
}

/// Represents a weak reaference to an object's [`Shape`].
#[derive(Debug, Trace, Finalize, Clone, PartialEq)]
pub(crate) enum WeakShape {
    Unique(WeakUniqueShape),
    Shared(WeakSharedShape),
}

impl WeakShape {
    /// Return location in memory of the [`Shape`].
    ///
    /// Returns `0` if the shape has been freed.
    #[inline]
    #[must_use]
    pub(crate) fn to_addr_usize(&self) -> usize {
        self.upgrade().as_ref().map_or(0, Shape::to_addr_usize)
    }

    /// Return location in memory of the [`Shape`].
    ///
    /// Returns `0` if the shape has been freed.
    #[inline]
    #[must_use]
    pub(crate) fn upgrade(&self) -> Option<Shape> {
        match self {
            WeakShape::Shared(shape) => Some(shape.upgrade()?.into()),
            WeakShape::Unique(shape) => Some(shape.upgrade()?.into()),
        }
    }
}

impl From<&Shape> for WeakShape {
    fn from(value: &Shape) -> Self {
        match &value.inner {
            Inner::Shared(shape) => WeakShape::Shared(shape.into()),
            Inner::Unique(shape) => WeakShape::Unique(shape.into()),
        }
    }
}
