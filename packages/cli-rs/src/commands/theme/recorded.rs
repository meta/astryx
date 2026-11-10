//! `resolveRecordedTheme(cwd, requestedSlug)`: the theme the app's generated
//! module records, with its built artifact loaded. Port of the matching part
//! of api/theme/_adapter.mjs and importThemeArtifact (module-loader.mjs).

use super::state;
use crate::commands::template::fsutil;
use crate::js::{ImportOptions, JsError, Namespace};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct RecordedTheme {
    pub configured: bool,
    pub slug: Option<String>,
    pub owner: Option<String>,
    /// The loaded artifact's namespace.
    pub module: Option<Namespace>,
    pub specifier: String,
    pub problem: Option<String>,
}

enum Artifact {
    Loaded(Namespace),
    Missing,
    Problem(String),
}

/// `importThemeArtifact(specifier, cwd)`. Err = an unexpected load failure
/// (the JS rethrows it).
// TEMP: stylesheet imports inside the artifact graph are not stubbed (the JS
// loader maps them to empty virtual modules); built theme packages import none.
fn import_artifact(specifier: &str, cwd: &str) -> Result<Option<Namespace>, JsError> {
    let target = if specifier.starts_with('.') || specifier.starts_with('/') {
        fsutil::resolve(cwd, specifier)
    } else {
        let from = Path::new(cwd).join("package.json");
        match crate::js::resolve::resolve(specifier, &from, crate::js::resolve::Mode::Jiti) {
            Ok(crate::js::resolve::Resolved::File(p)) => fsutil::path_str(&p),
            Ok(_) => return Ok(None),
            Err(e) if ["ERR_MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED", "MODULE_NOT_FOUND"].contains(&e.code) => {
                return Ok(None)
            }
            Err(e) => {
                return Err(JsError {
                    name: "Error".into(),
                    message: e.message,
                    code: Some(e.code.into()),
                    file: from,
                })
            }
        }
    };
    if !Path::new(&target).exists() {
        return Ok(None);
    }
    let jiti = crate::js::JitiOptions {
        force: true,
        extensions: Some([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"].iter().map(|e| e.to_string()).collect()),
        ..Default::default()
    };
    crate::js::import_module_jiti(Path::new(&target), &ImportOptions { jsx: true, fresh: true }, &jiti).map(Some)
}

fn try_artifact(specifier: &str, cwd: &str) -> Result<Artifact, JsError> {
    match import_artifact(specifier, cwd) {
        Ok(Some(ns)) => Ok(Artifact::Loaded(ns)),
        Ok(None) => Ok(Artifact::Missing),
        Err(e) => {
            let malformed = e.name == "ParseError"
                || e.name == "SyntaxError"
                || e.message.starts_with("ParseError:")
                || e.message.starts_with("SyntaxError:");
            if !malformed {
                return Err(e);
            }
            let first = e.message.split('\n').next().unwrap_or("").trim().to_string();
            let detail = if first.is_empty() { e.name.clone() } else { first };
            Ok(Artifact::Problem(format!("could not load the recorded theme artifact \"{specifier}\": {detail}")))
        }
    }
}

fn result(slug: &str, owner: &str, a: Artifact, specifier: String) -> RecordedTheme {
    let (module, problem) = match a {
        Artifact::Loaded(ns) => (Some(ns), None),
        Artifact::Missing => (None, None),
        Artifact::Problem(p) => (None, Some(p)),
    };
    RecordedTheme { configured: true, slug: Some(slug.into()), owner: Some(owner.into()), module, specifier, problem }
}

fn unconfigured() -> RecordedTheme {
    RecordedTheme {
        configured: false,
        slug: None,
        owner: None,
        module: None,
        specifier: "generated theme record".into(),
        problem: None,
    }
}

/// `resolveRecordedTheme(cwd, requestedSlug)`. Err = an unexpected artifact
/// load failure.
pub fn resolve_recorded_theme(cli_root: &Path, cwd: &str, requested: Option<&str>) -> Result<RecordedTheme, JsError> {
    let Ok(st) = state::read(cwd) else { return Ok(unconfigured()) };
    if !st.configured {
        return Ok(unconfigured());
    }
    let Some(slug) = requested.map(String::from).or_else(|| st.default_slug.clone()) else {
        return Ok(RecordedTheme {
            configured: true,
            slug: None,
            owner: None,
            module: None,
            specifier: "generated theme record".into(),
            problem: Some("the generated theme record has no default theme".into()),
        });
    };
    let Some(owner) = st.themes.get(&slug).cloned() else {
        return Ok(RecordedTheme {
            configured: true,
            specifier: format!("generated theme record ({slug})"),
            problem: Some(format!("theme \"{slug}\" is not present in the generated theme record")),
            slug: Some(slug),
            owner: None,
            module: None,
        });
    };
    let dir = st.project_dir.clone();
    if state::is_local_owner(&owner) {
        let spec = fsutil::join(&fsutil::join(&fsutil::join(&dir, &owner), &slug), &format!("{slug}.js"));
        let a = try_artifact(&spec, &dir)?;
        return Ok(result(&slug, &owner, a, spec));
    }
    let per = format!("{owner}/themes/{slug}");
    match try_artifact(&per, &dir)? {
        Artifact::Missing => {}
        a => return Ok(result(&slug, &owner, a, per)),
    }
    // How many themes the owner provides decides whether the package root may
    // stand for this one.
    let mut count: Option<usize> = None;
    if let Ok(list) = crate::discovery::integrations::load_integrations(&[owner.clone()], &dir, false) {
        if let Some(r) = list.iter().find(|r| crate::discovery::integrations::s(r, "name") == Some(owner.as_str())) {
            if !crate::discovery::integrations::has(r, "__loadError") {
                if let Ok(ts) = super::discovery::discover_integration_themes(r) {
                    count = Some(ts.len());
                }
            }
        }
    }
    if count.is_none() {
        let available = super::discovery::available(cli_root, &dir, true);
        count = Some(available.iter().filter(|t| t.import_package() == owner).count());
    }
    let count = count.unwrap_or(0);
    if count > 1 {
        return Ok(RecordedTheme {
            configured: true,
            problem: Some(format!(
                "theme \"{slug}\" is recorded from multi-theme package {owner}, but {per} does not resolve. Refusing to load {owner}/built or the package root because either could be a different theme"
            )),
            slug: Some(slug),
            owner: Some(owner),
            module: None,
            specifier: per,
        });
    }
    if count == 1 {
        for spec in [format!("{owner}/built"), owner.clone()] {
            match try_artifact(&spec, &dir)? {
                Artifact::Missing => {}
                a => return Ok(result(&slug, &owner, a, spec)),
            }
        }
    }
    Ok(RecordedTheme { configured: true, slug: Some(slug), owner: Some(owner), module: None, specifier: per, problem: None })
}
