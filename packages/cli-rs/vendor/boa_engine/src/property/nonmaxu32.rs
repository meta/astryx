/// An integer that is not `u32::MAX`.
#[derive(PartialEq, Debug, Clone, Copy, Eq, Hash)]
pub struct NonMaxU32 {
    inner: u32,
}

impl NonMaxU32 {
    /// Creates a non-max `u32`.
    ///
    /// # Safety
    ///
    /// The caller must ensure that the given value is not `u32::MAX`.
    #[must_use]
    pub const unsafe fn new_unchecked(inner: u32) -> Self {
        debug_assert!(inner != u32::MAX);

        Self { inner }
    }

    /// Creates a non-max `u32` if the given value is not `u32::MAX`.
    #[must_use]
    pub const fn new(inner: u32) -> Option<Self> {
        if inner == u32::MAX {
            return None;
        }

        // SAFETY: We checked that `inner` is not `u32::MAX`.
        unsafe { Some(Self::new_unchecked(inner)) }
    }

    /// Returns the value as a primitive type.
    #[must_use]
    pub const fn get(&self) -> u32 {
        self.inner
    }
}
