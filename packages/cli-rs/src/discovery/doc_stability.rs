//! Ports of `foundation/discovery/doc-stability.mjs` (`olderCliNotes`),
//! `template-icon-notes.mjs` (`templateIconNotes`, with `iconsNotImported`
//! from `template-icons.mjs`) and `template-conflict-release.mjs`.

use super::cli_requirement::{stability_cli_problem, template_icons_cli_problem, STABILITY_CLI, TEMPLATE_ICONS_CLI};
use super::docs_discovery::{discover_integration_docs, load_topic_module};
use super::integrations::{self as integ, Record};
use super::nodepath as np;
use crate::json::Value;

/// One older-CLI note (`{file, kind, field, message}`).
#[derive(Debug, Clone, PartialEq)]
pub struct OlderCliNote {
    pub file: String,
    pub kind: &'static str,
    pub field: &'static str,
    pub message: String,
}

impl OlderCliNote {
    pub fn to_json(&self) -> Value {
        serde_json::json!({"file": self.file, "kind": self.kind, "field": self.field, "message": self.message})
    }
}

/// `olderCliNotes(loaded, pkg, packageDir)`.
pub fn older_cli_notes(loaded: &Record, pkg: &Value, package_dir: &str) -> Vec<OlderCliNote> {
    let stability = stability_cli_problem(pkg).is_some();
    let icons = template_icons_cli_problem(pkg).is_some();
    if !stability && !icons {
        return vec![];
    }
    let mut found: Vec<(String, &'static str, &'static str)> = Vec::new();
    if stability {
        if let Some(docs) = integ::s(loaded, "docs").filter(|d| !d.is_empty()) {
            let disc = discover_integration_docs(loaded);
            let name_len = super::paths::js_string(loaded.get("name")).encode_utf16().count();
            for ns in disc.namespaces {
                if super::docmod::is_nullish(ns.get("doc").and_then(|d| d.get("stability"))) {
                    continue;
                }
                let src: Vec<u16> = super::paths::js_string(ns.get("source")).encode_utf16().collect();
                let in_root = String::from_utf16_lossy(&src[(name_len + 1).min(src.len())..]);
                found.push((np::join2(docs, &in_root), "namespace", "stability"));
            }
        }
    }
    if integ::has(loaded, "templates") && integ::s(loaded, "templates") != Some("") {
        let (templates, _) = crate::commands::template::integration::for_one(loaded);
        for t in templates {
            if t.doc_path.is_empty() {
                continue;
            }
            let doc = load_topic_module(&t.doc_path).ok();
            let has = |k: &str| doc.as_ref().map(|d| !super::docmod::is_nullish(d.get(k))).unwrap_or(false);
            if stability && has("stability") {
                found.push((t.doc_path.clone(), "template", "stability"));
            }
            if icons && has("icons") {
                found.push((t.doc_path.clone(), "template", "icons"));
            }
        }
    }
    found
        .into_iter()
        .map(|(file, kind, field)| {
            let relative = np::relative(package_dir, &file);
            let floor = if field == "icons" { TEMPLATE_ICONS_CLI } else { STABILITY_CLI };
            let what = if field == "icons" { "declares `icons`" } else { "sets `stability`" };
            let hide = if kind == "namespace" { " and hide the package's doc topics" } else { "" };
            OlderCliNote {
                message: format!(
                    "{relative} {what}: CLIs before {floor} drop this descriptor{hide}, and the package's @astryxdesign/cli peer range admits them. Declare \"@astryxdesign/cli\": \">={floor}\" in peerDependencies (optional in peerDependenciesMeta), or remove `{field}`."
                ),
                file: relative,
                kind,
                field,
            }
        })
        .collect()
}

/// `TEMPLATE_ICON_NOT_IMPORTED`.
pub const TEMPLATE_ICON_NOT_IMPORTED: &str = "template_icon_not_imported";

/// `iconsNotImported(source, declared)`: None when the source does not parse.
pub fn icons_not_imported(source: &str, declared: &crate::json::Map<String, Value>) -> Option<Vec<String>> {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::{ImportDeclarationSpecifier, Statement};
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, source, SourceType::tsx()).parse();
    if ret.diagnostics.has_errors() {
        return None;
    }
    let mut keys: Vec<String> = Vec::new();
    for stmt in &ret.program.body {
        match stmt {
            Statement::ImportDeclaration(d) => {
                for s in d.specifiers.iter().flatten() {
                    keys.push(match s {
                        ImportDeclarationSpecifier::ImportSpecifier(x) => x.imported.name().to_string(),
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(x) => x.local.name.to_string(),
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(x) => x.local.name.to_string(),
                    });
                }
            }
            Statement::ExportFromDeclaration(d) => {
                for s in &d.specifiers {
                    keys.push(s.local.name().to_string());
                    keys.push(s.exported.name().to_string());
                }
            }
            _ => {}
        }
    }
    Some(declared.keys().filter(|k| !keys.contains(k)).cloned().collect())
}

/// `templateIconNotes(loaded, packageDir)`: `(code, message)`.
pub fn template_icon_notes(loaded: &Record, package_dir: &str) -> Vec<(String, String)> {
    if !integ::has(loaded, "templates") || integ::s(loaded, "templates") == Some("") {
        return vec![];
    }
    let (templates, _) = crate::commands::template::integration::for_one(loaded);
    let mut notes = Vec::new();
    for t in templates {
        if t.doc_path.is_empty() || t.file_path.is_empty() {
            continue;
        }
        let Ok(doc) = load_topic_module(&t.doc_path) else { continue };
        let Some(Value::Object(declared)) = doc.get("icons").filter(|v| !super::docmod::is_nullish(Some(v))) else { continue };
        let Some(source) = np::read_text(&t.file_path) else { continue };
        for key in icons_not_imported(&source, declared).unwrap_or_default() {
            notes.push((
                TEMPLATE_ICON_NOT_IMPORTED.to_string(),
                format!(
                    "{} declares icon \"{key}\" in `icons`, which {} does not import, so it never maps to a project's icon set. Name a named import by the name it imports and a default import by its local name, or remove \"{key}\" from `icons`.",
                    np::relative(package_dir, &t.doc_path),
                    np::relative(package_dir, &t.file_path)
                ),
            ));
        }
    }
    notes
}

/// `expandedTemplateConflictSchemaActive(version, projection)`: the
/// projection is `warning-only` in this release, so this is false unless a
/// caller passes `expanded`.
pub fn expanded_template_conflict_schema_active(version: Option<&str>, projection: Option<&str>) -> bool {
    let v = version.map(String::from).unwrap_or_else(super::release::cli_version);
    projection.unwrap_or("warning-only") == "expanded" && super::semver::semver_compare(&v, "0.7.0") >= 0.0
}
