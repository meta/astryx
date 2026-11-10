use boa_gc::{Finalize, Trace, empty_trace};

use crate::JsString;

/// Private runtime environment.
#[derive(Clone, Debug, Finalize)]
pub(crate) struct PrivateEnvironment {
    /// The unique identifier of the private names.
    id: usize,

    /// The `[[Description]]` internal slot of the private names.
    descriptions: Vec<JsString>,
}

// Safety: PrivateEnvironment does not contain any objects that need to be traced.
unsafe impl Trace for PrivateEnvironment {
    empty_trace!();
}

impl PrivateEnvironment {
    /// Creates a new `PrivateEnvironment`.
    pub(crate) fn new(id: usize, descriptions: Vec<JsString>) -> Self {
        Self { id, descriptions }
    }

    /// Gets the id of this private environment.
    pub(crate) const fn id(&self) -> usize {
        self.id
    }

    /// Gets the descriptions of this private environment.
    pub(crate) fn descriptions(&self) -> &[JsString] {
        &self.descriptions
    }
}
