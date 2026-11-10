// Reexports `std::time` for all other platforms. This could cause panics on
// platforms that don't support `Instant::now()`.
pub(crate) use std::time;
