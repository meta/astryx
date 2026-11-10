//! Theme discovery: bundled themes (embedded), local themes and integration
//! themes. Port of foundation/discovery/theme-discovery.mjs (the parts the
//! theme commands read).

use crate::commands::template::fsutil;
use crate::json::Value;
use std::sync::OnceLock;

pub const BUNDLED_THEME_PACKAGE: &str = "@astryxdesign/cli";
pub const LOCAL_THEME_ROOT: &str = "./src/themes";

#[derive(Debug, Clone, Default)]
pub struct Theme {
    pub slug: String,
    pub display_name: String,
    pub description: String,
    pub maintained: bool,
    pub entry: String,
    pub export_name: String,
    pub files: Vec<String>,
    pub package: String,
    /// "bundled" | "local" | "package"
    pub source: String,
    pub source_dir: String,
    pub bundled: bool,
    pub doc_path: String,
    pub import_package: Option<String>,
    pub package_dir: Option<String>,
}

impl Theme {
    /// `themeImportPackage`.
    pub fn import_package(&self) -> &str {
        self.import_package.as_deref().unwrap_or(&self.package)
    }
    pub fn origin_reason(&self) -> String {
        match self.source.as_str() {
            "bundled" => "bundled theme".into(),
            "local" => "local theme".into(),
            _ => format!("provided by {}", self.package),
        }
    }
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

/// `discoverBundledThemes`.
pub fn bundled(cli_root: &std::path::Path) -> Vec<Theme> {
    static E: OnceLock<Vec<Value>> = OnceLock::new();
    let list = E.get_or_init(|| serde_json::from_str(include_str!("embedded_themes.json")).unwrap_or_default());
    let dir = fsutil::path_str(&cli_root.join("assets").join("templates").join("themes"));
    list.iter()
        .map(|v| Theme {
            slug: s(v, "slug"),
            display_name: s(v, "displayName"),
            description: s(v, "description"),
            maintained: v.get("maintained").and_then(|x| x.as_bool()).unwrap_or(false),
            entry: s(v, "entry"),
            export_name: s(v, "exportName"),
            files: v
                .get("files")
                .and_then(|f| f.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                .unwrap_or_default(),
            package: s(v, "package"),
            source: "bundled".into(),
            source_dir: fsutil::join(&dir, &s(v, "sourceDir")),
            bundled: true,
            doc_path: fsutil::join(&dir, &s(v, "docPath")),
            import_package: Some(s(v, "importPackage")),
            package_dir: None,
        })
        .collect()
}

fn ignored(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules" || name == "CVS" || name == "npm-debug.log" || name.ends_with(".orig")
}

/// (files, symlinks), sorted POSIX paths relative to `folder`.
fn list_theme_folder(folder: &str) -> (Vec<String>, Vec<String>) {
    let (mut files, mut links) = (Vec::new(), Vec::new());
    fn walk(root: &str, dir: &str, files: &mut Vec<String>, links: &mut Vec<String>) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        let mut ents: Vec<_> = rd.filter_map(|e| e.ok()).collect();
        ents.sort_by_key(|e| e.file_name());
        for e in ents {
            let name = e.file_name().to_string_lossy().into_owned();
            if ignored(&name) {
                continue;
            }
            let full = fsutil::join(dir, &name);
            let rel = fsutil::relative(root, &full);
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_symlink() {
                links.push(rel);
            } else if ft.is_dir() {
                walk(root, &full, files, links);
            } else if ft.is_file() {
                files.push(rel);
            }
        }
    }
    walk(folder, folder, &mut files, &mut links);
    files.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    links.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    (files, links)
}

fn theme_source_re(name: &str) -> bool {
    // /^[$A-Z_a-z][$\w]*Theme\.(?:mjs|js|mts|ts|tsx|jsx)$/u
    let Some(dot) = name.rfind('.') else { return false };
    let (stem, ext) = (&name[..dot], &name[dot + 1..]);
    ["mjs", "js", "mts", "ts", "tsx", "jsx"].contains(&ext) && stem.ends_with("Theme") && is_ident(stem)
}

fn is_ident(s: &str) -> bool {
    let mut c = s.chars();
    matches!(c.next(), Some(x) if x.is_ascii_alphabetic() || x == '_' || x == '$')
        && c.all(|x| x.is_ascii_alphanumeric() || x == '_' || x == '$')
}

fn evidence(files: &[String], links: &[String]) -> Option<String> {
    let mut all: Vec<String> = files.iter().chain(links.iter()).cloned().collect();
    all.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    all.into_iter().find(|f| {
        let n = fsutil::basename(f);
        n.ends_with(".doc.mjs") || theme_source_re(&n)
    })
}

const MODULE_EXTS: &[&str] = super::graph::THEME_MODULE_EXTENSIONS;

fn quoted(v: &[String]) -> String {
    v.iter().map(|f| format!("\"{f}\"")).collect::<Vec<_>>().join(", ")
}

/// `discoverThemeDirectory(themeRoot, owner, {allowUnmigrated})` for a
/// non-bundled root.
pub fn discover_directory(root: &str, owner: &str, allow_unmigrated: bool) -> Result<Vec<Theme>, String> {
    if !std::path::Path::new(root).is_dir() {
        return Err(format!("Declared themes root does not exist on disk: {root}"));
    }
    if std::path::Path::new(&fsutil::join(root, "manifest.json")).exists() {
        return Err(format!("Theme root for {owner} contains manifest.json, the theme catalog Astryx 0.6 wrote; each theme now carries a strongly typed same-stem .doc.mjs descriptor instead. To convert it, run `astryx upgrade --from 0.6.3 --path . --apply` in the package, or add each theme's descriptor and delete manifest.json."));
    }
    let entries: Vec<(String, std::fs::FileType)> = {
        let mut v: Vec<_> = std::fs::read_dir(root)
            .map(|rd| rd.filter_map(|e| e.ok()).filter_map(|e| Some((e.file_name().to_string_lossy().into_owned(), e.file_type().ok()?))).collect())
            .unwrap_or_default();
        v.sort_by(|a: &(String, std::fs::FileType), b| a.0.cmp(&b.0));
        v.into_iter().filter(|(n, _)| !ignored(n)).collect()
    };
    if let Some((n, _)) = entries.iter().find(|(n, t)| t.is_file() && n.ends_with(".doc.mjs")) {
        return Err(format!("Theme descriptor \"{n}\" for {owner} must be inside a lower-kebab theme directory."));
    }
    if let Some((n, _)) = entries.iter().find(|(_, t)| t.is_symlink()) {
        return Err(format!("Theme root for {owner} contains symlink \"{n}\"; theme directories must stay inside the declared root."));
    }
    let mut dirs: Vec<String> = entries.iter().filter(|(_, t)| t.is_dir()).map(|(n, _)| n.clone()).collect();
    dirs.sort_by(|a, b| crate::text::locale_compare(a, b));
    let mut themes = Vec::new();
    let mut slugs = std::collections::HashSet::new();
    for slug in dirs {
        let source_dir = fsutil::join(root, &slug);
        let (files, links) = list_theme_folder(&source_dir);
        let Some(ev) = evidence(&files, &links) else { continue };
        if !super::state::is_slug(&slug) {
            return Err(format!("Theme root for {owner} has invalid directory \"{slug}\"; use lowercase kebab-case starting with a letter."));
        }
        if !slugs.insert(slug.to_lowercase()) {
            return Err(format!("Theme root for {owner} declares duplicate slug \"{slug}\"."));
        }
        let theme = format!("Theme \"{slug}\" for {owner}");
        if let Some(l) = links.first() {
            return Err(format!("{theme} contains symlink \"{l}\"; theme files must be regular files inside the theme directory."));
        }
        let descriptors: Vec<String> = files.iter().filter(|f| f.ends_with(".doc.mjs")).cloned().collect();
        let docs: Vec<String> = descriptors.iter().filter(|f| !f.contains('/')).cloned().collect();
        if allow_unmigrated && descriptors.is_empty() && unmigrated_copy(&source_dir).is_some() {
            continue;
        }
        if docs.len() != 1 {
            let detail = if docs.len() > 1 {
                format!(": {}", quoted(&docs))
            } else if ev.contains('/') {
                format!("; \"{ev}\" is in a subfolder")
            } else {
                format!(" beside \"{ev}\"")
            };
            let theme_doc = crate::cli::env::format_cli_command_at(std::path::Path::new(&source_dir), "docs authoring theme-doc");
            let fix = if docs.len() > 1 {
                "Fix: keep the one descriptor that shares its stem with the theme's source and delete the rest.".to_string()
            } else if ev.contains('/') {
                format!("Fix: move \"{ev}\" up into {slug}/, beside where its descriptor goes.")
            } else if theme_source_re(&ev) {
                let stem = &ev[..ev.rfind('.').unwrap()];
                format!("Fix: add {stem}.doc.mjs beside it with type: 'theme' and name: '{slug}'; `{theme_doc}` lists its fields.")
            } else {
                format!("Fix: add a descriptor that shares its stem with the theme's source, with type: 'theme' and name: '{slug}'; `{theme_doc}` lists its fields.")
            };
            return Err(format!("{theme} must contain exactly one same-stem .doc.mjs descriptor; found {}{detail}. {fix}", docs.len()));
        }
        if let Some(n) = descriptors.iter().find(|f| f.contains('/')) {
            return Err(format!("{theme} contains more than one .doc.mjs descriptor: \"{}\" and \"{n}\".", docs[0]));
        }
        let doc_path = fsutil::join(&source_dir, &docs[0]);
        let label = format!("Theme descriptor {} for {owner}", docs[0]);
        let export_name = docs[0][..docs[0].len() - ".doc.mjs".len()].to_string();
        if !is_ident(&export_name) {
            return Err(format!("{label} has stem \"{export_name}\", which is not a valid runtime export name."));
        }
        let sources: Vec<String> = MODULE_EXTS.iter().map(|e| format!("{export_name}{e}")).filter(|f| files.contains(f)).collect();
        if sources.len() != 1 {
            let fix = if sources.len() > 1 {
                super::graph::built_theme_source_fix(&source_dir, &sources, &docs[0], &export_name)
                    .unwrap_or_else(|| "Fix: keep one of them; the theme's source is a single module.".to_string())
            } else {
                format!("Fix: add {export_name}.ts beside {}, exporting `{export_name}` from defineTheme.", docs[0])
            };
            return Err(format!(
                "{theme} must contain exactly one same-stem source for {}; found {}{}. {fix}",
                docs[0],
                sources.len(),
                if sources.len() > 1 { format!(": {}", quoted(&sources)) } else { String::new() }
            ));
        }
        let doc = super::descriptor::read_static_descriptor_value(&doc_path, &label, "ThemeDoc", false)?;
        let name = doc.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if name != slug {
            return Err(format!("{label} names \"{name}\" but its directory is \"{slug}\"."));
        }
        let entry = sources[0].clone();
        let entry_path = fsutil::join(&source_dir, &entry);
        let allowed: std::collections::HashSet<String> =
            files.iter().map(|f| fsutil::join(&source_dir, f)).filter(|f| *f != doc_path).collect();
        let graph = super::graph::Graph { theme_dir: &source_dir, allowed: &allowed };
        let checked = graph
            .validate(&entry_path, owner, &entry, &doc_path, &mut Default::default())
            .and_then(|()| graph.exports_name(&entry_path, &export_name, &mut Default::default()));
        match checked {
            Ok(true) => {}
            Ok(false) => {
                return Err(super::graph::built_module_descriptor_message(&label, &source_dir, &entry, &export_name, &docs[0], &slug, &files)
                    .unwrap_or_else(|| format!("Theme \"{slug}\" for {owner} entry \"{entry}\" does not export \"{export_name}\".")))
            }
            Err(super::graph::GraphError::Reference(m) | super::graph::GraphError::Export(m)) => return Err(m),
            Err(super::graph::GraphError::Parse(m)) => {
                return Err(format!("Theme \"{slug}\" for {owner} entry \"{entry}\" could not be parsed: {m}"))
            }
        }
        let rest: Vec<String> = files.iter().filter(|f| **f != entry && **f != docs[0]).cloned().collect();
        let mut copied = vec![entry.clone(), docs[0].clone()];
        copied.extend(rest);
        themes.push(Theme {
            slug: slug.clone(),
            display_name: doc.get("displayName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            description: doc.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            maintained: doc.get("maintained").and_then(|v| v.as_bool()).unwrap_or(false),
            entry,
            export_name,
            files: copied,
            package: owner.to_string(),
            source: "package".into(),
            source_dir,
            bundled: false,
            doc_path,
            import_package: None,
            package_dir: None,
        });
    }
    Ok(themes)
}

/// `unmigratedThemeCopy(folder)`: (slug, sourceDir, entry, descriptor).
fn unmigrated_copy(folder: &str) -> Option<(String, String, String, String)> {
    let slug = fsutil::basename(folder);
    if !super::state::is_slug(&slug) {
        return None;
    }
    let (files, links) = list_theme_folder(folder);
    if !links.is_empty() || files.iter().any(|f| f.ends_with(".doc.mjs")) {
        return None;
    }
    let sources: Vec<&String> = files.iter().filter(|f| !f.contains('/') && theme_source_re(f)).collect();
    if sources.len() != 1 {
        return None;
    }
    let entry = sources[0].clone();
    let export_name = entry[..entry.rfind('.').unwrap()].to_string();
    Some((slug, folder.to_string(), entry, format!("{export_name}.doc.mjs")))
}

/// `discoverLocalThemes(projectDir)`.
pub fn local(project_dir: &str) -> Result<Vec<Theme>, String> {
    let root = fsutil::resolve(project_dir, LOCAL_THEME_ROOT);
    if !std::path::Path::new(&root).is_dir() {
        return Ok(Vec::new());
    }
    Ok(discover_directory(&root, LOCAL_THEME_ROOT, true)?
        .into_iter()
        .map(|mut t| {
            t.package = LOCAL_THEME_ROOT.into();
            t.package_dir = Some(project_dir.to_string());
            t.source = "local".into();
            t
        })
        .collect())
}

/// Installed integration themes (`discoverIntegrationThemes` per loaded
/// integration); a broken contribution is skipped.
pub fn integration(project: &crate::discovery::project::Project) -> Vec<Theme> {
    let mut out = Vec::new();
    for r in project.contributing() {
        let Some(root) = crate::discovery::integrations::s(r, "themes").map(String::from) else { continue };
        let name = crate::discovery::integrations::s(r, "name").unwrap_or("").to_string();
        if let Ok(ts) = discover_directory(&root, &name, false) {
            for mut t in ts {
                t.package_dir = crate::discovery::integrations::s(r, "__packageDir").map(String::from);
                t.source = "package".into();
                out.push(t);
            }
        }
    }
    out
}

/// `availableThemeState(cwd, {includeLocal})`: Project.themes, or the bundled
/// themes when the project cannot load.
pub fn available(cli_root: &std::path::Path, cwd: &str, include_local: bool) -> Vec<Theme> {
    let mut themes = bundled(cli_root);
    let Ok(project) = crate::discovery::project::Project::load(cwd) else { return themes };
    if include_local {
        let project_dir = crate::discovery::paths::find_package_root(cwd).unwrap_or_else(|| cwd.to_string());
        themes.extend(local(&project_dir).unwrap_or_default());
    }
    themes.extend(integration(&project));
    themes
}

/// `discoverUnmigratedThemeCopies(projectDir)`: (slug, path, source, descriptor)
/// relative to the project.
pub fn unmigrated_copies(project_dir: &str) -> Vec<(String, String, String, String)> {
    let root = fsutil::resolve(project_dir, LOCAL_THEME_ROOT);
    if !std::path::Path::new(&root).is_dir() {
        return Vec::new();
    }
    let mut v: Vec<(String, String, String, String)> = std::fs::read_dir(&root)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|n| !ignored(n))
                .filter_map(|n| unmigrated_copy(&fsutil::join(&root, &n)))
                .collect()
        })
        .unwrap_or_default();
    v.sort_by(|a, b| crate::text::locale_compare(&a.0, &b.0));
    v.into_iter()
        .map(|(slug, dir, entry, desc)| {
            (slug, fsutil::relative(project_dir, &dir), fsutil::relative(project_dir, &fsutil::join(&dir, &entry)), fsutil::relative(project_dir, &fsutil::join(&dir, &desc)))
        })
        .collect()
}

/// `discoverIntegrationThemes(integration)`: the themes one loaded
/// integration contributes (none without a `themes` root).
pub fn discover_integration_themes(r: &crate::discovery::integrations::Record) -> Result<Vec<Theme>, String> {
    let Some(root) = crate::discovery::integrations::s(r, "themes").map(String::from) else { return Ok(Vec::new()) };
    let name = crate::discovery::integrations::s(r, "name").unwrap_or("").to_string();
    Ok(discover_directory(&root, &name, false)?
        .into_iter()
        .map(|mut t| {
            t.package_dir = crate::discovery::integrations::s(r, "__packageDir").map(String::from);
            t.source = "package".into();
            t
        })
        .collect())
}

/// `isThemeFolder(folder)`.
pub fn is_theme_folder(folder: &str) -> bool {
    if ignored(&fsutil::basename(folder)) {
        return false;
    }
    let (files, links) = list_theme_folder(folder);
    evidence(&files, &links).is_some()
}

/// `listThemeFiles(folder)`.
pub fn list_theme_files(folder: &str) -> Vec<String> {
    list_theme_folder(folder).0
}
