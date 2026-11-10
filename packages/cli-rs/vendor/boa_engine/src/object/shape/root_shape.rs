use boa_macros::{Finalize, Trace};

use super::SharedShape;

/// This is a wrapper around [`SharedShape`] that ensures it's root shape.
///
/// Represent the root shape that [`SharedShape`] transitions start from.
#[derive(Debug, Clone, Trace, Finalize)]
pub struct RootShape {
    shape: SharedShape,
}

impl Default for RootShape {
    #[inline]
    fn default() -> Self {
        Self {
            shape: SharedShape::root(),
        }
    }
}

impl RootShape {
    /// Gets the inner [`SharedShape`].
    #[must_use]
    pub const fn shape(&self) -> &SharedShape {
        &self.shape
    }
}
