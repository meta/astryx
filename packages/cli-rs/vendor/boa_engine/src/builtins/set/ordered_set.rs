//! Implements a set type that preserves insertion order.

use crate::{JsData, JsValue, builtins::map::ordered_map::MapKey, object::JsObject};
use boa_gc::{Finalize, Trace, custom_trace};
use indexmap::IndexSet;
use std::fmt::Debug;

/// A type wrapping `indexmap::IndexSet`
#[derive(Default, Clone, Finalize, JsData)]
pub struct OrderedSet {
    inner: IndexSet<MapKey>,
    lock: u32,
    empty_count: usize,
}

unsafe impl Trace for OrderedSet {
    custom_trace!(this, mark, {
        for v in &this.inner {
            if let MapKey::Key(v) = v {
                mark(v);
            }
        }
    });
}

impl Debug for OrderedSet {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> Result<(), std::fmt::Error> {
        self.inner.fmt(formatter)
    }
}

impl OrderedSet {
    /// Creates a new empty `OrderedSet`.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Creates a new empty `OrderedSet` with the specified capacity.
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            inner: IndexSet::with_capacity(capacity),
            lock: 0,
            empty_count: 0,
        }
    }

    /// Return the number of elements in the set, including empty elements.
    ///
    /// Computes in **O(1)** time.
    #[must_use]
    pub fn full_len(&self) -> usize {
        self.inner.len()
    }

    /// Return the number of elements in the set.
    ///
    /// Computes in **O(1)** time.
    #[must_use]
    pub fn len(&self) -> usize {
        self.inner.len() - self.empty_count
    }

    /// Returns true if the set contains no elements.
    ///
    /// Computes in **O(1)** time.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.inner.len() == 0
    }

    /// Insert a value pair in the set.
    ///
    /// If an equivalent value already exists in the set, returns `false` leaving
    /// original value in the set and without altering its insertion order.
    ///
    /// If no equivalent value existed in the set, returns `true` and inserts
    /// the new value at the end of the set.
    ///
    /// Computes in **O(1)** time (amortized average).
    pub fn add(&mut self, value: JsValue) -> bool {
        self.inner.insert(MapKey::Key(value))
    }

    /// Delete the `value` from the set and return true if successful
    ///
    /// Return `false` if `value` is not in set.
    ///
    /// Computes in **O(n)** time (average).
    pub fn delete(&mut self, value: &JsValue) -> bool {
        if self.lock == 0 {
            self.inner.shift_remove(value)
        } else if self.inner.contains(value) {
            self.inner.insert(MapKey::Empty(self.empty_count));
            self.empty_count += 1;
            self.inner.swap_remove(value)
        } else {
            false
        }
    }

    /// Removes all elements in the set, while preserving its capacity.
    #[inline]
    pub fn clear(&mut self) {
        self.inner.clear();
        self.inner.shrink_to_fit();
        self.empty_count = 0;
    }

    /// Checks if a given value is present in the set
    ///
    /// Return `true` if `value` is present in set, false otherwise.
    ///
    /// Computes in **O(n)** time (average).
    #[must_use]
    pub fn contains(&self, value: &JsValue) -> bool {
        self.inner.contains(value)
    }

    /// Get a key-value pair by index
    /// Valid indices are 0 <= `index` < `self.len()`
    /// Computes in O(1) time.
    #[must_use]
    pub fn get_index(&self, index: usize) -> Option<&JsValue> {
        if let MapKey::Key(value) = self.inner.get_index(index)? {
            Some(value)
        } else {
            None
        }
    }

    /// Return an iterator over the values of the set, in their order
    pub fn iter(&self) -> impl Iterator<Item = &JsValue> {
        self.inner.iter().filter_map(|v| {
            if let MapKey::Key(v) = v {
                Some(v)
            } else {
                None
            }
        })
    }

    /// Increases the lock counter and returns a lock object that will decrement the counter when dropped.
    ///
    /// This allows objects to be removed from the set during iteration without affecting the indexes until the iteration has completed.
    pub(crate) fn lock(&mut self) {
        self.lock += 1;
    }

    /// Decreases the lock counter and, if 0, removes all empty entries.
    pub(crate) fn unlock(&mut self) {
        self.lock -= 1;
        if self.lock == 0 {
            self.inner.retain(|k| matches!(k, MapKey::Key(_)));
            self.empty_count = 0;
        }
    }
}

pub(crate) struct SetLock<'a>(&'a JsObject<OrderedSet>);

impl<'a> SetLock<'a> {
    pub(crate) fn new(js_object: &'a JsObject<OrderedSet>) -> Self {
        js_object.borrow_mut().data_mut().lock();
        Self(js_object)
    }
}

impl Drop for SetLock<'_> {
    fn drop(&mut self) {
        self.0.borrow_mut().data_mut().unlock();
    }
}
