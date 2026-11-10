//! Path safety for swizzle and init: discovery's port of fs/path-safety.

pub use crate::discovery::path_safety::PathSafetyError;

pub fn assert_within(target: &str, root: &str, allow_absolute: bool, label: &str) -> Result<String, PathSafetyError> {
    crate::discovery::path_safety::assert_within(target, root, allow_absolute, label)
}

pub fn sanitize_name(name: &str, label: &str) -> Result<(), PathSafetyError> {
    crate::discovery::path_safety::sanitize_name(name, label).map(|_| ())
}
