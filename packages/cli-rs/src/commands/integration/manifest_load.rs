//! Integration manifests as `integration add` and its callers read them
//! (`loadManifestObject`), through discovery's `loadManifest`.

use super::add_helpers::{AddError, R};
use crate::json::Value;
use std::path::Path;

/// `loadManifestObject(file, label)`: import the manifest with the real
/// module loader and return its default export, checked against the root
/// keys' schema.
pub fn load_manifest_value(file: &Path) -> R<Value> {
    let label = format!("Integration manifest {}", super::add_helpers::basename(file));
    load_manifest_labeled(file, &label)
}

pub fn load_manifest_labeled(file: &Path, label: &str) -> R<Value> {
    crate::discovery::docmod::with_fresh_imports(|| crate::discovery::integrations::load_manifest(&file.to_string_lossy(), label))
        .map(|m| Value::Object(m.manifest))
        .map_err(AddError::plain)
}

/// A module's default export through the real loader, or None.
pub fn load_default(file: &Path) -> Option<Value> {
    let ns = crate::js::import_module(file, &crate::js::ImportOptions { jsx: false, fresh: true }).ok()?;
    ns.get("default").cloned()
}
