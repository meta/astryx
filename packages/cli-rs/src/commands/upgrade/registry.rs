//! The Core codemod registry (`registry.mjs`), read from the generated
//! `registry.json`, with each entry bound to its native transform.

use super::transforms::{self, ProjectFn, TransformFn};
use crate::discovery::semver::semver_compare;
use serde_json::Value;
use std::sync::OnceLock;

#[derive(Clone)]
pub enum Kind {
    Code(TransformFn),
    Config(TransformFn),
    Project(ProjectFn),
    /// No native port yet: running it fails the codemod.
    Missing,
    /// An integration's codemod module: its default export's `transform`
    /// runs in the JS engine.
    Js(std::path::PathBuf),
}

#[derive(Clone)]
pub struct Entry {
    pub name: String,
    /// `core` for Core's codemods, else the integration package.
    pub package: String,
    pub title: String,
    pub description: Option<String>,
    pub pr: Option<String>,
    pub codemod_type: Option<String>,
    pub file_extensions: Option<Vec<String>>,
    pub optional: bool,
    pub kind: Kind,
}

#[derive(Clone)]
pub struct VersionManifest {
    pub version: String,
    pub transforms: Vec<Entry>,
}

pub struct Registry {
    pub latest: String,
    pub versions: Vec<VersionManifest>,
}

pub fn registry() -> &'static Registry {
    static R: OnceLock<Registry> = OnceLock::new();
    R.get_or_init(|| {
        let v: Value = serde_json::from_str(include_str!("registry.json")).expect("registry.json");
        let latest = v["latest"].as_str().unwrap_or("").to_string();
        let mut versions = Vec::new();
        for m in v["versions"].as_array().unwrap() {
            let version = m["version"].as_str().unwrap().to_string();
            let mut ts = Vec::new();
            for t in m["transforms"].as_array().unwrap() {
                let name = t["name"].as_str().unwrap().to_string();
                let codemod_type = t["codemodType"].as_str().map(|s| s.to_string());
                let key = format!("v{}/{}", version, name);
                let kind = match codemod_type.as_deref() {
                    Some("project") => transforms::get_project(&key).map(Kind::Project).unwrap_or(Kind::Missing),
                    Some("config") => transforms::get(&key).map(Kind::Config).unwrap_or(Kind::Missing),
                    _ => transforms::get(&key).map(Kind::Code).unwrap_or(Kind::Missing),
                };
                ts.push(Entry {
                    name,
                    package: "core".into(),
                    title: t["title"].as_str().unwrap_or("").to_string(),
                    description: t["description"].as_str().map(|s| s.to_string()),
                    pr: t["pr"].as_str().map(|s| s.to_string()),
                    codemod_type,
                    file_extensions: t["fileExtensions"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()),
                    optional: t["optional"].as_bool().unwrap_or(false),
                    kind,
                });
            }
            versions.push(VersionManifest { version, transforms: ts });
        }
        versions.sort_by(|a, b| semver_compare(&a.version, &b.version).partial_cmp(&0.0).unwrap());
        Registry { latest, versions }
    })
}

/// `getTransformsBetween(from, to)`: exclusive of `from`, inclusive of `to`.
pub fn transforms_between(from: &str, to: &str) -> Vec<VersionManifest> {
    registry().versions.iter().filter(|m| semver_compare(&m.version, from) > 0.0 && semver_compare(&m.version, to) <= 0.0).cloned().collect()
}
