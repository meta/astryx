//! File protection: a thin adapter over the discovery lane's port of
//! `foundation/fs/file-protection.mjs`.

use crate::discovery::file_protection::FileProtectionResolver;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq)]
pub struct Protection {
    /// Path relative to the root, with `/`.
    pub file: String,
    pub reason: String,
    pub declaration: String,
    pub command: Option<String>,
}

pub struct Resolver {
    inner: FileProtectionResolver,
}

#[derive(Debug, Clone)]
pub struct ProtectionSourceError {
    pub message: String,
}

impl Resolver {
    pub fn new(root: &Path, overrides: HashMap<PathBuf, Option<String>>) -> Result<Resolver, ProtectionSourceError> {
        let ov: Vec<(String, Option<String>)> = overrides.into_iter().map(|(k, v)| (k.to_string_lossy().into_owned(), v)).collect();
        FileProtectionResolver::new(&root.to_string_lossy(), &ov).map(|inner| Resolver { inner }).map_err(|e| ProtectionSourceError { message: e.message })
    }

    pub fn classify(&self, file: &Path) -> Vec<Protection> {
        match self.inner.classify(&file.to_string_lossy()) {
            Ok(list) => list.into_iter().map(|p| Protection { file: p.file, reason: p.reason.to_string(), declaration: p.declaration, command: p.command }).collect(),
            Err(_) => Vec::new(),
        }
    }
}
