//! Port of `foundation/integrations/contribution-inventory.mjs`: what an
//! integration package contributes (identities and the files behind them),
//! and the source-only candidate scans.
//!
//! Template and theme identities come from the template and theme commands'
//! discovery, icon sets from `icon_set_discovery`, codemods from the upgrade
//! command's integration discovery.

use super::docmod;
use super::integrations::{self as integ, Record};
use super::nodepath as np;
use crate::json::Value;

/// The identities one package contributes (`collectIdentities` result).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Identities {
    /// `{slug, exportName}`, by slug.
    pub themes: Vec<Value>,
    pub components: Vec<String>,
    /// `{id, type, name, replaces?}`, by id.
    pub templates: Vec<Value>,
    /// `{version, id}`.
    pub codemods: Vec<Value>,
    pub docs: Vec<String>,
    pub agent_docs_append: Vec<String>,
    /// Present only when the package declares `experimental.iconSets`.
    pub icon_sets: Option<Vec<String>>,
}

impl Identities {
    /// The JSON shape the JS returns.
    pub fn to_json(&self) -> Value {
        let mut m = crate::json::Map::new();
        m.insert("themes".into(), Value::Array(self.themes.clone()));
        m.insert("components".into(), serde_json::json!(self.components));
        m.insert("templates".into(), Value::Array(self.templates.clone()));
        m.insert("codemods".into(), Value::Array(self.codemods.clone()));
        m.insert("docs".into(), serde_json::json!(self.docs));
        m.insert("agentDocsAppend".into(), serde_json::json!(self.agent_docs_append));
        if let Some(i) = &self.icon_sets {
            m.insert("iconSets".into(), serde_json::json!(i));
        }
        Value::Object(m)
    }
}

/// An identity error (`{kind, message}`).
#[derive(Debug, Clone, PartialEq)]
pub struct IdentityError {
    pub kind: &'static str,
    pub message: String,
}


fn is_folder(p: &str) -> bool {
    np::is_dir(p)
}

fn root(r: &Record, k: &str) -> Option<String> {
    integ::s(r, k).filter(|v| !v.is_empty()).map(String::from)
}

/// `collectIdentities(loaded)`.
pub fn collect_identities(loaded: &Record) -> (Identities, Vec<IdentityError>) {
    let mut ids = Identities::default();
    let mut errors = Vec::new();
    if let Some(Value::Array(a)) = loaded.get("agentDocs").and_then(|d| d.get("append")) {
        ids.agent_docs_append = a.iter().map(|v| super::paths::js_string(Some(v))).collect();
    }
    let icon_root = root(loaded, "iconSets");
    if icon_root.is_some() {
        ids.icon_sets = Some(vec![]);
    }
    if let Some(r) = &icon_root {
        if np::exists(r) {
            let (sets, errs) = super::icon_set_discovery::discover_icon_set_directory(r, integ::s(loaded, "name").unwrap_or(""));
            let mut names: Vec<String> = sets.into_iter().map(|s| s.name).collect();
            super::jsort::sort_strings(&mut names);
            ids.icon_sets = Some(names);
            errors.extend(errs.into_iter().map(|(_, m)| IdentityError { kind: "iconSets", message: m }));
        }
    }
    if root(loaded, "themes").map(|r| is_folder(&r)).unwrap_or(false) {
        match crate::commands::theme::discovery::discover_integration_themes(loaded) {
            Ok(themes) => {
                let mut t: Vec<(String, String)> = themes.into_iter().map(|t| (t.slug, t.export_name)).collect();
                t.sort_by(|a, b| super::jsort::locale_compare(&a.0, &b.0));
                ids.themes = t.into_iter().map(|(slug, e)| serde_json::json!({"slug": slug, "exportName": e})).collect();
            }
            Err(e) => errors.push(IdentityError { kind: "themes", message: e }),
        }
    }
    if let Some(croot) = root(loaded, "components").filter(|r| is_folder(r)) {
        let li = super::component_discovery::LoadedIntegration {
            name: integ::s(loaded, "name").unwrap_or("").into(),
            version: integ::s(loaded, "version").map(String::from),
            components: Some(croot.clone().into()),
            issues_url: integ::s(loaded, "issuesUrl").map(String::from),
            package_dir: integ::s(loaded, "__packageDir").map(|d| d.into()),
            package_exports: loaded.get("__packageExports").cloned(),
            provider_id: integ::s(loaded, "providerId").map(String::from),
            autolinked: integ::has(loaded, "__autolinked"),
            load_error: integ::has(loaded, "__loadError"),
        };
        let records = super::component_discovery::discover_integration_components(&li, true);
        let mut loads: Vec<(String, bool)> = Vec::new();
        for rec in records {
            let doc = rec.doc_path.to_string_lossy().into_owned();
            let first = !loads.iter().any(|(d, _)| *d == doc);
            if first {
                let ok = match super::doc_read::load_component_doc(&doc, None, None) {
                    Ok(_) => true,
                    Err(e) => {
                        errors.push(IdentityError { kind: "components", message: format!("{}: {e}", np::relative(&croot, &doc)) });
                        false
                    }
                };
                loads.push((doc.clone(), ok));
            }
            if loads.iter().find(|(d, _)| *d == doc).map(|x| x.1).unwrap_or(false) {
                ids.components.push(rec.name);
            }
        }
        ids.components.sort_by(|a, b| super::jsort::cmp_utf16(a, b));
    }
    if root(loaded, "templates").map(|r| is_folder(&r)).unwrap_or(false) {
        let (templates, terrs) = crate::commands::template::integration::for_one(loaded);
        for e in terrs {
            errors.push(IdentityError { kind: "templates", message: e.message });
        }
        let mut t: Vec<_> = templates
            .into_iter()
            .map(|t| {
                let mut m = crate::json::Map::new();
                m.insert("id".into(), Value::String(t.dir_name.clone()));
                m.insert("type".into(), Value::String(t.kind.clone()));
                m.insert("name".into(), Value::String(t.name.clone()));
                if let Some(r) = &t.replaces {
                    m.insert("replaces".into(), Value::String(r.clone()));
                }
                (t.dir_name, Value::Object(m))
            })
            .collect();
        t.sort_by(|a, b| super::jsort::locale_compare(&a.0, &b.0));
        ids.templates = t.into_iter().map(|x| x.1).collect();
    }
    if root(loaded, "codemods").map(|r| is_folder(&r)).unwrap_or(false) {
        let (v, e) = crate::commands::upgrade::integration_discovery::codemod_identities(loaded);
        ids.codemods = v;
        errors.extend(e.into_iter().map(|message| IdentityError { kind: "codemods", message }));
    }
    if root(loaded, "docs").map(|r| is_folder(&r)).unwrap_or(false) {
        let found = super::docs_discovery::discover_integration_docs(loaded);
        for e in found.errors {
            errors.push(IdentityError { kind: "docs", message: e });
        }
        let mut names: Vec<String> = found.records.iter().map(|r| r.name.clone()).collect();
        names.extend(found.guides.iter().map(|g| super::paths::js_string(g.get("name"))));
        names.sort_by(|a, b| super::jsort::cmp_utf16(a, b));
        ids.docs = names;
    }
    (ids, errors)
}

/// `compareIdentities(local, packed)`: `(code, severity, message)`.
pub fn compare_identities(local: &Identities, packed: &Identities) -> Vec<(String, String, String)> {
    let mut issues = Vec::new();
    let mut kind = |name: &str, l: Vec<(String, Value)>, p: Vec<(String, Value)>| {
        // Map: a later item of one key wins.
        let dedupe = |v: Vec<(String, Value)>| {
            let mut out: Vec<(String, Value)> = Vec::new();
            for (k, x) in v {
                match out.iter_mut().find(|(o, _)| *o == k) {
                    Some(slot) => slot.1 = x,
                    None => out.push((k, x)),
                }
            }
            out
        };
        let l = dedupe(l);
        let p = dedupe(p);
        for (k, item) in &l {
            match p.iter().find(|(pk, _)| pk == k) {
                None => issues.push((
                    "identity_not_packed".into(),
                    "error".into(),
                    format!("{name} \"{k}\" is discoverable locally but missing from the packed tarball."),
                )),
                Some((_, pi)) if pi != item => issues.push((
                    "identity_mismatch".into(),
                    "error".into(),
                    format!("{name} \"{k}\" resolves differently from the packed tarball."),
                )),
                _ => {}
            }
        }
        for (k, _) in &p {
            if !l.iter().any(|(lk, _)| lk == k) {
                issues.push(("packed_identity_unexpected".into(), "error".into(), format!("{name} \"{k}\" exists only in the packed tarball.")));
            }
        }
    };
    let by = |v: &[Value], k: &str| v.iter().map(|x| (super::paths::js_string(x.get(k)), x.clone())).collect::<Vec<_>>();
    let strs = |v: &[String]| v.iter().map(|x| (x.clone(), Value::String(x.clone()))).collect::<Vec<_>>();
    kind("Theme", by(&local.themes, "slug"), by(&packed.themes, "slug"));
    kind("Component", strs(&local.components), strs(&packed.components));
    kind("Template", by(&local.templates, "id"), by(&packed.templates, "id"));
    let cm = |v: &[Value]| {
        v.iter()
            .map(|x| (format!("{}/{}", super::paths::js_string(x.get("version")), super::paths::js_string(x.get("id"))), x.clone()))
            .collect::<Vec<_>>()
    };
    kind("Codemod", cm(&local.codemods), cm(&packed.codemods));
    kind("Doc topic", strs(&local.docs), strs(&packed.docs));
    kind(
        "Icon set",
        strs(local.icon_sets.as_deref().unwrap_or(&[])),
        strs(packed.icon_sets.as_deref().unwrap_or(&[])),
    );
    if local.agent_docs_append != packed.agent_docs_append {
        issues.push((
            "agent_docs_mismatch".into(),
            "error".into(),
            "agentDocs.append lines differ between local and packed manifests.".into(),
        ));
    }
    issues
}

// ── File inventory ──────────────────────────────────────────────────────────

const SKIP_DIRS: [&str; 4] = ["node_modules", ".git", "__tests__", "__fixtures__"];

fn walk_dir(dir: &str, filter: &dyn Fn(&str) -> bool) -> Vec<String> {
    if dir.is_empty() || !np::is_dir(dir) {
        return vec![];
    }
    let mut out = Vec::new();
    for e in np::list_dir_entries(dir).unwrap_or_default() {
        if SKIP_DIRS.contains(&e.name.as_str()) {
            continue;
        }
        let full = np::join2(dir, &e.name);
        if e.is_dir {
            out.extend(walk_dir(&full, filter));
        } else if filter(&e.name) {
            out.push(full);
        }
    }
    super::jsort::sort_strings(&mut out);
    out
}

fn rel(pkg: &str, f: &str) -> String {
    np::relative(pkg, f)
}

fn ends_any(name: &str, exts: &[&str]) -> bool {
    exts.iter().any(|e| name.ends_with(e))
}

fn strip_suffix_re(f: &str, suffixes: &[&str]) -> String {
    for s in suffixes {
        if let Some(x) = f.strip_suffix(s) {
            return x.to_string();
        }
    }
    f.to_string()
}

const DOC_SUFFIXES: [&str; 3] = [".doc.ts", ".doc.mjs", ".doc.js"];
const TEMPLATE_SUFFIXES: [&str; 6] = [".template.ts", ".template.mjs", ".template.js", ".doc.ts", ".doc.mjs", ".doc.js"];

/// Files a root of `kind` contributes, relative to the package (the
/// enumerators). Themes and icon sets go through the owning lanes' hooks.
pub fn enumerate_files(kind: &str, root: &str, pkg: &str) -> Vec<String> {
    match kind {
        "components" => {
            let mut files = Vec::new();
            for doc in walk_dir(root, &|n| ends_any(n, &DOC_SUFFIXES)) {
                files.push(rel(pkg, &doc));
                let source = format!("{}.tsx", strip_suffix_re(&doc, &DOC_SUFFIXES));
                if np::exists(&source) {
                    files.push(rel(pkg, &source));
                }
            }
            files
        }
        "templates" => {
            let mut files = Vec::new();
            for t in walk_dir(root, &|n| ends_any(n, &TEMPLATE_SUFFIXES)) {
                files.push(rel(pkg, &t));
                let source = format!("{}.tsx", strip_suffix_re(&t, &TEMPLATE_SUFFIXES));
                if np::exists(&source) {
                    files.push(rel(pkg, &source));
                }
            }
            files
        }
        "codemods" => walk_dir(root, &|n| {
            ends_any(n, &[".ts", ".mjs", ".js"])
                && !["test", "spec", "fixture"].iter().any(|t| ends_any(n, &[&format!(".{t}.ts"), &format!(".{t}.mjs"), &format!(".{t}.js")]))
        })
        .into_iter()
        .map(|f| rel(pkg, &f))
        .collect(),
        "docs" => walk_dir(root, &|n| ends_any(n, &DOC_SUFFIXES)).into_iter().map(|f| rel(pkg, &f)).collect(),
        "themes" => {
            let mut files = Vec::new();
            for e in np::read_dir(root).unwrap_or_default() {
                let full = np::join2(root, &e.name);
                if e.is_dir && crate::commands::theme::discovery::is_theme_folder(&full) {
                    files.extend(crate::commands::theme::discovery::list_theme_files(&full).into_iter().map(|f| np::join2(&full, &f)));
                }
            }
            super::jsort::sort_strings(&mut files);
            files.into_iter().map(|f| rel(pkg, &f)).collect()
        }
        "iconSets" => {
            let mut files: Vec<String> = Vec::new();
            for set in super::icon_set_discovery::discover_icon_set_directory(root, "(local)").0 {
                files.push(set.doc_path.clone());
                files.push(set.data_path.clone());
                files.extend(set.definitions.iter().map(|d| d.file.clone()));
                files.extend(set.notices.iter().map(|n| np::join2(&set.dir, n)));
                if let Some(g) = set.data.get("generated").and_then(|v| v.as_str()) {
                    let generated = np::join2(pkg, g);
                    if np::exists(&generated) {
                        files.push(generated);
                    }
                    if let Some(t) = generated_types_path(g) {
                        let tp = np::join2(pkg, &t);
                        if np::exists(&tp) {
                            files.push(tp);
                        }
                    }
                }
            }
            let mut uniq: Vec<String> = Vec::new();
            for f in files {
                if !uniq.contains(&f) {
                    uniq.push(f);
                }
            }
            super::jsort::sort_strings(&mut uniq);
            uniq.into_iter().map(|f| rel(pkg, &f)).collect()
        }
        _ => vec![],
    }
}

/// `generatedTypesPath(generated)` (icon-set-paths.mjs).
pub fn generated_types_path(g: &str) -> Option<String> {
    for e in [".ts", ".tsx", ".mts", ".mtsx"] {
        if g.ends_with(e) {
            return None;
        }
    }
    if let Some(s) = g.strip_suffix(".mjs") {
        return Some(format!("{s}.d.mts"));
    }
    if let Some(s) = g.strip_suffix(".cjs") {
        return Some(format!("{s}.d.cts"));
    }
    for e in [".jsx", ".js"] {
        if let Some(s) = g.strip_suffix(e) {
            return Some(format!("{s}.d.ts"));
        }
    }
    Some(g.to_string())
}

const ROOT_KINDS: [&str; 6] = ["themes", "components", "templates", "codemods", "docs", "iconSets"];

/// `contributionFiles(loaded, pkgDir)`.
pub fn contribution_files(loaded: &Record, pkg: &str) -> Vec<String> {
    let mut files: Vec<String> = Vec::new();
    for k in ROOT_KINDS {
        let Some(r) = root(loaded, k).filter(|r| is_folder(r)) else { continue };
        for f in enumerate_files(k, &r, pkg) {
            if !files.contains(&f) {
                files.push(f);
            }
        }
    }
    super::jsort::sort_strings(&mut files);
    files
}

/// `computeRequiredFiles(loaded)`: `(manifest, roots[(kind, path, files)], allFiles)`.
pub fn compute_required_files(loaded: &Record) -> (String, Vec<(String, String, Vec<String>)>, Vec<String>) {
    let pkg = integ::s(loaded, "__packageDir").unwrap_or("").to_string();
    let manifest = rel(&pkg, integ::s(loaded, "__manifestFile").unwrap_or(""));
    let mut roots = Vec::new();
    let mut all = vec![manifest.clone()];
    for k in ROOT_KINDS {
        let Some(r) = root(loaded, k) else { continue };
        let files = enumerate_files(k, &r, &pkg);
        all.extend(files.iter().cloned());
        roots.push((k.to_string(), rel(&pkg, &r), files));
    }
    let mut seen = Vec::new();
    for f in all {
        if !seen.contains(&f) {
            seen.push(f);
        }
    }
    (manifest, roots, seen)
}

/// `findSourceOnlyCandidates(componentsRoot, registeredNames)`.
pub fn find_source_only_candidates(components_root: &str, registered: &[String]) -> Vec<String> {
    if components_root.is_empty() || !np::exists(components_root) {
        return vec![];
    }
    let re = regress::Regex::with_flags(r"^([A-Z][A-Za-z0-9]+)\.tsx$", "u").unwrap();
    let mut out = Vec::new();
    for e in np::list_dir_entries(components_root).unwrap_or_default() {
        if !e.is_file && !e.is_symlink {
            continue;
        }
        if let Some(m) = re.find(&e.name) {
            let n = e.name[m.group(1).unwrap()].to_string();
            if !registered.contains(&n) {
                out.push(n);
            }
        }
    }
    super::jsort::sort_strings(&mut out);
    out
}

/// `findTemplateSourceOnlyCandidates(templatesRoot)`.
pub fn find_template_source_only_candidates(templates_root: &str) -> Vec<String> {
    if templates_root.is_empty() || !np::exists(templates_root) {
        return vec![];
    }
    let not_template = regress::Regex::with_flags(r"\.(?:test|spec|stories)$", "u").unwrap();
    let mut out = Vec::new();
    for e in np::list_dir_entries(templates_root).unwrap_or_default() {
        if !e.is_file && !e.is_symlink {
            continue;
        }
        let Some(stem) = e.name.strip_suffix(".tsx").filter(|s| !s.is_empty()) else { continue };
        if not_template.find(stem).is_some() {
            continue;
        }
        let paired = TEMPLATE_SUFFIXES.iter().any(|s| np::exists(&np::join2(templates_root, &format!("{stem}{s}"))));
        if !paired {
            out.push(e.name.clone());
        }
    }
    super::jsort::sort_strings(&mut out);
    out
}

#[allow(dead_code)]
fn _uses(_: &docmod::Loader) {}

/// `assertContributionVisible(loaded, kind, name, {version})`: Err carries
/// the JS error message.
pub fn assert_contribution_visible(loaded: &Record, kind: &str, name: &str, version: Option<&str>) -> Result<(), String> {
    if kind == "icon-set" {
        let (sets, errors) = match root(loaded, "iconSets") {
            Some(r) => super::icon_set_discovery::discover_icon_set_directory(&r, integ::s(loaded, "name").unwrap_or("")),
            None => (vec![], vec![]),
        };
        if let Some((_, m)) = errors.iter().find(|(n, _)| n == name) {
            return Err(m.clone());
        }
        if !sets.iter().any(|s| s.name == name) {
            return Err(format!("icon-set contribution \"{name}\" was not visible after writing."));
        }
        return Ok(());
    }
    let (ids, errors) = collect_identities(loaded);
    let error_kind = match kind {
        "theme" => "themes",
        "component" => "components",
        "template" => "templates",
        "codemod" => "codemods",
        "doc" => "docs",
        _ => "agentDocs",
    };
    if let Some(e) = errors.iter().find(|e| e.kind == error_kind) {
        return Err(e.message.clone());
    }
    let s = |v: &Value, k: &str| v.get(k).and_then(|x| x.as_str()).map(String::from);
    let visible = match kind {
        "theme" => ids.themes.iter().any(|t| s(t, "slug").as_deref() == Some(name)),
        "component" => ids.components.iter().any(|c| c == name),
        "template" => ids.templates.iter().any(|t| s(t, "id").as_deref() == Some(name)),
        "codemod" => ids.codemods.iter().any(|c| s(c, "id").as_deref() == Some(name) && s(c, "version").as_deref() == version),
        "doc" => ids.docs.iter().any(|d| d == name),
        _ => ids.agent_docs_append.iter().any(|l| l == name),
    };
    if !visible {
        let q = version.map(|v| format!(" under version {v}")).unwrap_or_default();
        return Err(format!("{kind} contribution \"{name}\" was not visible{q} after writing."));
    }
    Ok(())
}
