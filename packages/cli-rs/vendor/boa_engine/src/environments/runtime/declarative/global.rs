use crate::JsValue;
use boa_gc::{Finalize, GcRefCell, Trace};

#[derive(Debug, Trace, Finalize)]
pub(crate) struct GlobalEnvironment {
    bindings: GcRefCell<Vec<Option<JsValue>>>,
}

impl GlobalEnvironment {
    /// Creates a new `GlobalEnvironment`.
    pub(crate) fn new() -> Self {
        Self {
            bindings: GcRefCell::new(Vec::new()),
        }
    }

    /// Gets the binding value from the environment by it's index.
    ///
    /// # Panics
    ///
    /// Panics if the binding value is out of range or not initialized.
    #[track_caller]
    pub(crate) fn get(&self, index: u32) -> Option<JsValue> {
        self.bindings.borrow()[index as usize].clone()
    }

    /// Sets the binding value from the environment by index.
    ///
    /// # Panics
    ///
    /// Panics if the binding value is out of range.
    #[track_caller]
    pub(crate) fn set(&self, index: u32, value: JsValue) {
        self.bindings.borrow_mut()[index as usize] = Some(value);
    }

    /// Gets the bindings of this poisonable environment.
    pub(crate) const fn bindings(&self) -> &GcRefCell<Vec<Option<JsValue>>> {
        &self.bindings
    }
}
