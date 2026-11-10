//! Port of `foundation/discovery/integration-doc-files.mjs`: every doc file
//! a package's readers serve, and the docs no reader serves.

use super::doc_read::{overlay_path, OVERLAY_LANGUAGES};
use super::integrations::{self as integ, Record};
use super::nodepath as np;
use crate::json::Value;

/// One served doc file (`{path, root}`).
#[derive(Debug, Clone, PartialEq)]
pub struct DocFile {
    pub path: String,
    /// `components` | `templates` | `docs` | `docs-overlay` | `themes` | `icon-sets`.
    pub root: String,
}

/// `integrationDocFiles(integration)` result.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct DocFiles {
    pub files: Vec<DocFile>,
    /// `{path, reason}`.
    pub unread: Vec<(String, String)>,
    pub fixtures: usize,
}

impl DocFiles {
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "files": self.files.iter().map(|f| serde_json::json!({"path": f.path, "root": f.root})).collect::<Vec<_>>(),
            "unread": self.unread.iter().map(|(p, r)| serde_json::json!({"path": p, "reason": r})).collect::<Vec<_>>(),
            "fixtures": self.fixtures,
        })
    }
}

fn root_ok(root: &str) -> bool {
    super::validate_contributions::root_problem(root).is_none()
}

/// `integrationDocFiles(integration)`.
pub fn integration_doc_files(integration: &Record) -> DocFiles {
    let get = |k: &str| integ::s(integration, k).filter(|v| !v.is_empty()).map(String::from);
    let (components, templates, docs, themes, icon_sets) = (get("components"), get("templates"), get("docs"), get("themes"), get("iconSets"));
    let name = integ::s(integration, "name").map(String::from).unwrap_or_else(|| "the package".into());
    let mut read: Vec<(String, String, Vec<String>)> = Vec::new();
    let mut unread: Vec<(String, String)> = Vec::new();
    let mut take = |root: &Option<String>, label: &str, files: &dyn Fn(&str) -> Result<Vec<(String, Vec<String>)>, String>| {
        let Some(r) = root.as_ref().filter(|r| root_ok(r)) else { return };
        match files(r) {
            Ok(list) => {
                for (kind, l) in list {
                    read.push((kind, r.clone(), l));
                }
            }
            Err(e) => unread.push((r.clone(), format!("the {label} root does not load, so no doc in it was checked: {e}"))),
        }
    };
    take(&components, "components", &|r| {
        let li = super::component_discovery::LoadedIntegration {
            name: integ::s(integration, "name").unwrap_or("").into(),
            version: integ::s(integration, "version").map(String::from),
            components: Some(r.into()),
            issues_url: integ::s(integration, "issuesUrl").map(String::from),
            package_dir: integ::s(integration, "__packageDir").map(|d| d.into()),
            package_exports: integration.get("__packageExports").cloned(),
            provider_id: integ::s(integration, "providerId").map(String::from),
            autolinked: integ::has(integration, "__autolinked"),
            load_error: integ::has(integration, "__loadError"),
        };
        let list = super::component_discovery::discover_integration_components(&li, true)
            .into_iter()
            .map(|c| c.doc_path.to_string_lossy().into_owned())
            .collect();
        Ok(vec![("components".into(), list)])
    });
    take(&templates, "templates", &|_| {
        let (t, _) = crate::commands::template::integration::for_one(integration);
        Ok(vec![("templates".into(), t.into_iter().map(|t| t.doc_path).collect())])
    });
    take(&docs, "docs", &|_| {
        let found = super::docs_discovery::discover_integration_docs(integration);
        let mut with_overlays: Vec<String> = found.records.iter().map(|r| r.path.clone()).collect();
        with_overlays.extend(found.guides.iter().filter_map(|g| g.get("ref").and_then(|r| r.get("topicFile")).and_then(|f| f.as_str()).map(String::from)));
        let prefix = format!("{}/", integ::s(integration, "name").map(String::from).unwrap_or_else(|| "undefined".into()));
        let namespaces: Vec<String> = found
            .namespaces
            .iter()
            .map(|e| {
                let src = e.get("source").and_then(|s| s.as_str()).unwrap_or("");
                let rel = src.strip_prefix(&prefix).unwrap_or(src);
                np::join(&rel.split('/').collect::<Vec<_>>())
            })
            .collect();
        let overlays: Vec<String> = with_overlays
            .iter()
            .flat_map(|f| OVERLAY_LANGUAGES.iter().map(move |l| overlay_path(f, l)))
            .filter(|o| np::exists(o))
            .collect();
        let mut all = with_overlays.clone();
        all.extend(namespaces);
        Ok(vec![("docs".into(), all), ("docs-overlay".into(), overlays)])
    });
    take(&themes, "themes", &|r| {
        let t = crate::commands::theme::discovery::discover_directory(r, &name, false)?;
        Ok(vec![("themes".into(), t.into_iter().map(|t| t.doc_path).collect())])
    });
    take(&icon_sets, "iconSets", &|r| {
        let (sets, _) = super::icon_set_discovery::discover_icon_set_directory(r, &name);
        Ok(vec![("icon-sets".into(), sets.into_iter().map(|s| s.doc_path).collect())])
    });
    // owners: file -> (root kind, dir); Map order is first insertion.
    let mut owners: Vec<(String, (String, String))> = Vec::new();
    fn own(table: &mut Vec<(String, (String, String))>, root: &str, dir: &str, file: &str) {
        match table.iter_mut().find(|(f, _)| f == file) {
            None => table.push((file.into(), (root.into(), dir.into()))),
            Some(slot) => {
                if dir.encode_utf16().count() > slot.1 .1.encode_utf16().count() {
                    slot.1 = (root.into(), dir.into());
                }
            }
        }
    }
    for (root, dir, files) in &read {
        for f in files {
            own(&mut owners, root, dir, f);
        }
    }
    let readable: Vec<&String> = read.iter().map(|r| &r.1).collect();
    let mut shipped: Vec<(String, (String, String))> = Vec::new();
    for (kind, dir) in [("components", &components), ("templates", &templates), ("docs", &docs), ("themes", &themes), ("icon-sets", &icon_sets)] {
        let Some(d) = dir.as_ref().filter(|d| readable.contains(d)) else { continue };
        for file in doc_files_under(d) {
            let overlay = OVERLAY_LANGUAGES.iter().any(|l| file.ends_with(&format!(".doc.{l}.mjs")));
            if overlay && kind != "docs" {
                continue;
            }
            own(&mut shipped, if overlay { "docs-overlay" } else { kind }, d, &file);
        }
    }
    let mut fixtures = 0;
    for (file, (root, dir)) in shipped {
        if owners.iter().any(|(f, _)| *f == file) {
            continue;
        }
        let rel = np::relative(&dir, &file);
        if root != "templates" && root != "themes" && root != "icon-sets" && rel.split('/').any(|p| p == "__tests__") {
            fixtures += 1;
        } else {
            owners.push((file, (root, dir)));
        }
    }
    let mut files: Vec<DocFile> = owners.into_iter().map(|(f, (root, _))| DocFile { path: f, root }).collect();
    files.sort_by(|a, b| super::jsort::locale_compare(&a.path, &b.path));
    DocFiles { files, unread, fixtures }
}

fn doc_files_under(dir: &str) -> Vec<String> {
    let mut found = Vec::new();
    fn walk(d: &str, found: &mut Vec<String>) {
        let Some(entries) = np::read_dir(d) else { return };
        for e in entries {
            if e.name == "node_modules" || e.name == ".git" {
                continue;
            }
            let full = np::join2(d, &e.name);
            if e.is_dir {
                walk(&full, found);
                continue;
            }
            if e.is_symlink {
                if !np::is_file(&full) {
                    continue;
                }
            } else if !e.is_file {
                continue;
            }
            let doc = [".doc.ts", ".doc.mjs", ".doc.js"].iter().any(|s| e.name.ends_with(s));
            if doc || OVERLAY_LANGUAGES.iter().any(|l| e.name.ends_with(&format!(".doc.{l}.mjs"))) {
                found.push(full);
            }
        }
    }
    walk(dir, &mut found);
    found
}
