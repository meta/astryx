//! The data discover works on: catalog packages, source states, installed
//! packages, and the facts it reads from the environment.

use crate::json::{Map, Value};
use serde_json::json;

pub const OFFICIAL_SOURCE_NAME: &str = "Astryx";
pub const OFFICIAL_SOURCE_FROM: &str = "@astryxdesign/cli";

pub const DISCOVER_KINDS: [&str; 7] =
    ["component", "template", "doc", "theme", "codemod", "agent-doc", "icon-set"];
pub const STABLE_KINDS: [&str; 6] = ["component", "template", "doc", "theme", "codemod", "agent-doc"];

pub const KIND_FIELDS: [(&str, &str); 7] = [
    ("component", "components"),
    ("template", "templates"),
    ("doc", "docs"),
    ("theme", "themes"),
    ("codemod", "codemods"),
    ("agent-doc", "agentDocs"),
    ("icon-set", "iconSets"),
];

pub fn field_of(kind: &str) -> Option<&'static str> {
    KIND_FIELDS.iter().find(|(k, _)| *k == kind).map(|(_, f)| *f)
}

#[derive(Debug, Clone)]
pub struct Version {
    pub version: String,
    pub published_at: Option<String>,
    pub prerelease: bool,
    pub status: String,
}

impl Version {
    pub fn to_json(&self) -> Value {
        json!({
            "version": self.version,
            "publishedAt": self.published_at,
            "prerelease": self.prerelease,
            "status": self.status,
        })
    }
}

#[derive(Debug, Clone, Default)]
pub struct Contribution {
    pub kind: String,
    pub name: String,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub icon_count: Option<f64>,
    pub definitions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default)]
pub struct CatalogPackage {
    pub package: String,
    pub integration: String,
    pub aliases: Vec<String>,
    pub description: Option<String>,
    pub latest: Option<String>,
    pub versions: Vec<Version>,
    pub contributions: Vec<Contribution>,
    /// The source's name, once merged into a catalog result.
    pub source: String,
    pub official: bool,
    /// Official list only: what its add command pins.
    pub pin: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SourceState {
    pub name: String,
    pub from: String,
    pub status: &'static str,
    pub generated_at: Option<String>,
    pub complete: Option<bool>,
    pub saved_at: Option<String>,
    pub error: Option<String>,
}

impl SourceState {
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("name".into(), self.name.clone().into());
        m.insert("from".into(), self.from.clone().into());
        m.insert("status".into(), self.status.into());
        // Key order follows each JS object literal.
        match self.status {
            "failed" => {
                if let Some(e) = &self.error {
                    m.insert("error".into(), e.clone().into());
                }
            }
            _ => {
                if let Some(g) = &self.generated_at {
                    m.insert("generatedAt".into(), g.clone().into());
                }
                if let Some(c) = self.complete {
                    m.insert("complete".into(), c.into());
                }
                if let Some(s) = &self.saved_at {
                    m.insert("savedAt".into(), s.clone().into());
                }
                if let Some(e) = &self.error {
                    m.insert("error".into(), e.clone().into());
                }
            }
        }
        Value::Object(m)
    }
}

#[derive(Debug, Clone, Default)]
pub struct CatalogResult {
    pub sources: Vec<SourceState>,
    pub packages: Vec<CatalogPackage>,
}

#[derive(Debug, Clone)]
pub struct IconSetSummary {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub license: String,
    pub icon_count: f64,
    pub default: Option<Value>,
    pub definitions: Vec<String>,
}

/// An installed integration (or a declared official package) with its items.
#[derive(Debug, Clone, Default)]
pub struct InstalledPackage {
    pub name: String,
    pub category: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub display_name: Option<String>,
    pub docs_dir: Option<std::path::PathBuf>,
    /// Item lists by entry field (`components` always meaningful).
    pub components: Vec<String>,
    pub lists: Vec<(String, Vec<String>)>,
    pub icon_set_details: Vec<IconSetSummary>,
    pub withdrawn_icon_sets: Vec<(String, String)>,
    pub latest: Option<String>,
    pub declared_official: bool,
}

impl InstalledPackage {
    pub fn list(&self, field: &str) -> Option<&Vec<String>> {
        if field == "components" {
            return Some(&self.components);
        }
        self.lists.iter().find(|(f, _)| f == field).map(|(_, v)| v)
    }
}

/// `toEntry(pkg)`.
pub fn to_entry(pkg: &InstalledPackage) -> Map<String, Value> {
    let mut e = Map::new();
    e.insert("name".into(), pkg.name.clone().into());
    e.insert("package".into(), pkg.name.clone().into());
    e.insert("category".into(), pkg.category.clone().into());
    e.insert("components".into(), strs(&pkg.components));
    opt(&mut e, "version", &pkg.version);
    opt(&mut e, "description", &pkg.description);
    opt(&mut e, "displayName", &pkg.display_name);
    for (_, field) in KIND_FIELDS.iter().skip(1) {
        if let Some(v) = pkg.list(field) {
            if !v.is_empty() {
                e.insert((*field).into(), strs(v));
            }
        }
    }
    if let Some(l) = &pkg.latest {
        if !l.is_empty() {
            e.insert("latest".into(), l.clone().into());
        }
    }
    e
}

pub fn strs(v: &[String]) -> Value {
    Value::Array(v.iter().map(|s| Value::String(s.clone())).collect())
}

pub fn opt(m: &mut Map<String, Value>, k: &str, v: &Option<String>) {
    if let Some(s) = v {
        m.insert(k.into(), s.clone().into());
    }
}

/// A discover error: message, suggestions (name, reason), code.
#[derive(Debug, Clone)]
pub struct DiscoverError {
    pub message: String,
    pub suggestions: Vec<(String, String)>,
    pub code: &'static str,
}

impl DiscoverError {
    pub fn new(message: impl Into<String>, suggestions: Vec<(String, String)>, code: &'static str) -> Self {
        DiscoverError { message: message.into(), suggestions, code }
    }
}

pub type DResult<T> = Result<T, DiscoverError>;
