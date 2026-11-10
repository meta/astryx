//! Port of `foundation/discovery/icon-definition-discovery.mjs`: Astryx's
//! icon definitions (the CLI's own `assets/icons/definitions`) and a set's own
//! `definitions` folder, each file read statically.

use super::nodepath as np;
use crate::json::Value;

/// One discovered definition: the parsed doc, its file, its package.
#[derive(Debug, Clone)]
pub struct DiscoveredIconDefinition {
    pub doc: Value,
    pub file: String,
    pub package: String,
}

impl DiscoveredIconDefinition {
    pub fn name(&self) -> &str {
        self.doc.get("name").and_then(|v| v.as_str()).unwrap_or("")
    }
    pub fn words(&self) -> Vec<String> {
        self.doc
            .get("words")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            .unwrap_or_default()
    }
    pub fn built_in(&self) -> bool {
        self.doc.get("builtIn").and_then(|v| v.as_bool()) == Some(true)
    }
    pub fn description(&self) -> &str {
        self.doc.get("description").and_then(|v| v.as_str()).unwrap_or("")
    }
}

#[derive(Debug, Clone, Default)]
pub struct DefinitionsRead {
    pub definitions: Vec<DiscoveredIconDefinition>,
    /// (file, message)
    pub errors: Vec<(String, String)>,
}

pub const ASTRYX_DEFINITIONS_PACKAGE: &str = "@astryxdesign/cli";

/// `readDefinitionsDir(dir, owner)`.
pub fn read_definitions_dir(dir: &str, owner: &str) -> DefinitionsRead {
    let mut out = DefinitionsRead::default();
    let Some(mut entries) = np::list_dir_entries(dir) else { return out };
    entries.sort_by(|a, b| super::jsort::locale_compare(&a.name, &b.name));
    for e in entries {
        if !e.name.ends_with(".doc.mjs") {
            continue;
        }
        let file = np::join2(dir, &e.name);
        let label = format!("Icon definition {} in {owner}", e.name);
        let read = (|| -> Result<Value, String> {
            if !e.is_file {
                return Err(format!("{label} must be a regular file."));
            }
            let raw = read_definition_value(&file, &label)?;
            let doc = super::doctypes::parse_icon_definition(&raw, &label)?;
            let stem = &e.name[..e.name.len() - ".doc.mjs".len()];
            let name = doc.get("name").and_then(|v| v.as_str()).unwrap_or("");
            if name != stem {
                return Err(format!(
                    "{label} names \"{name}\"; a definition file is named after its definition ({name}.doc.mjs)."
                ));
            }
            Ok(doc)
        })();
        match read {
            Ok(doc) => out.definitions.push(DiscoveredIconDefinition { doc, file, package: owner.to_string() }),
            Err(m) => out.errors.push((file, m)),
        }
    }
    out
}

/// The static value of one definition file. The CLI's own definitions come
/// from the embedded modules; anything else is read from its source.
fn read_definition_value(file: &str, label: &str) -> Result<Value, String> {
    if super::docmod::cli_relative(file).is_some() {
        if let Some(Ok(ns)) = super::docmod::embedded(file) {
            if let Some(d) = ns.get("default") {
                return Ok(d.clone());
            }
        }
    }
    crate::commands::theme::descriptor::read_static_descriptor_value(file, label, "IconDefinitionDoc", true)
}

thread_local! {
    static ASTRYX: std::cell::OnceCell<DefinitionsRead> = const { std::cell::OnceCell::new() };
}

/// `astryxIconDefinitions()`.
pub fn astryx_icon_definitions() -> DefinitionsRead {
    ASTRYX.with(|c| {
        c.get_or_init(|| {
            let dir = crate::cli::env::cli_root().join("assets/icons/definitions");
            read_definitions_dir(&dir.to_string_lossy(), ASTRYX_DEFINITIONS_PACKAGE)
        })
        .clone()
    })
}

/// `astryxDefinitionsByName()`: (name, doc) in file order.
pub fn astryx_definitions_by_name() -> Vec<(String, Value)> {
    astryx_icon_definitions().definitions.into_iter().map(|d| (d.name().to_string(), d.doc)).collect()
}
