//! TEMP: stand-ins for pieces other lanes own. Replace each with the owner's
//! version when it lands:
//! - component_count: component lane's discoverComponents
//! - fallback_topics / load_project: discovery's Project.load + docs catalog
//! - find_core_dir: discovery's findCoreDir
//! - ignored_here: discovery's file-protection resolver
//! - is_outside_project: shell's runChoice(cwd).inProject

use crate::commands::init::agent_docs::IntegrationDocs;
use crate::commands::swizzle::jspath as p;

pub fn component_count(core_dir: &str) -> Option<usize> {
    let g = crate::discovery::component_discovery::discover_components(std::path::Path::new(core_dir));
    Some(g.values().map(|v| v.len()).sum())
}

pub fn fallback_topics() -> Vec<String> {
    let docs = crate::cli::env::cli_root().join("assets").join("docs");
    let mut v: Vec<String> = p::readdir(&docs.to_string_lossy())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| f.strip_suffix(".doc.mjs").map(String::from))
        .filter(|n| n.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
        .collect();
    v.extend(cli_root_namespace_names());
    v.sort();
    v
}

/// `cliRootNamespaceNames()` (doc-compiler/tree.mjs).
pub fn cli_root_namespace_names() -> Vec<String> {
    let dir = crate::cli::env::cli_root().join("assets").join("docs").join("tree");
    let dir = dir.to_string_lossy().into_owned();
    let file_re = regress::Regex::new(r"^[\w-]+\.doc\.mjs$").unwrap();
    let ns = regress::Regex::new(r#"["']?type["']?\s*:\s*["']namespace["']"#).unwrap();
    let pl = regress::Regex::new(r#"["']?placement["']?\s*:"#).unwrap();
    let nm = regress::Regex::new(r#"["']?name["']?\s*:\s*["']([\w-]+)["']"#).unwrap();
    let mut names = Vec::new();
    for f in p::readdir(&dir).unwrap_or_default() {
        if file_re.find(&f).is_none() {
            continue;
        }
        let Some(text) = p::read_to_string(&p::join2(&dir, &f)) else { continue };
        if ns.find(&text).is_none() || pl.find(&text).is_some() {
            continue;
        }
        if let Some(m) = nm.find(&text) {
            names.push(text[m.group(1).unwrap()].to_string());
        }
    }
    names.sort();
    names
}

pub struct ProjectInfo {
    pub topics: Vec<String>,
    pub agent_docs: Vec<IntegrationDocs>,
}

/// `Project.load(targetDir)` as the agent-docs block reads it: the topics,
/// and each integration's agent-doc lines (doc tokens rendered).
pub fn load_project(target: &str) -> Result<ProjectInfo, String> {
    let project = crate::discovery::project::Project::load(target)?;
    let label = |r: &crate::discovery::integrations::Record| -> Result<String, String> {
        let v = r.get("name").and_then(|x| x.as_str()).or_else(|| r.get("__spec").and_then(|x| x.as_str())).unwrap_or("");
        validate_integration_label(v)
    };
    if let Some(r) = project.loaded_integrations.iter().find(|r| present(r.get("__loadError"))) {
        let l = label(r)?;
        return Err(format!("Cannot render agent docs because integration {l} failed to load: {}", crate::cli::format::js_string(&r["__loadError"])));
    }
    if let Some(r) = project.loaded_integrations.iter().find(|r| present(r.get("__agentDocsError"))) {
        let l = label(r)?;
        return Err(format!("Cannot render agent docs because integration {l} has invalid agentDocs: {}", crate::cli::format::js_string(&r["__agentDocsError"])));
    }
    let pm = crate::discovery::package_manager::doc_package_manager(Some(target));
    let mut agent_docs = Vec::new();
    for r in &project.loaded_integrations {
        let append: Vec<String> = r
            .get("agentDocs")
            .and_then(|a| a.get("append"))
            .and_then(|a| a.as_array())
            .map(|a| a.iter().map(|l| crate::discovery::doc_compiler::doc_syntax::render_command_tokens(&crate::cli::format::js_string(l), "astryx", &pm, None)).collect())
            .unwrap_or_default();
        if append.is_empty() {
            continue;
        }
        agent_docs.push(IntegrationDocs { package: label(r)?, append });
    }
    Ok(ProjectInfo { topics: fallback_topics(), agent_docs })
}

/// `validateIntegrationLabel`.
fn validate_integration_label(v: &str) -> Result<String, String> {
    let bad = || Err("Integration package name is not safe to render in agent docs.".to_string());
    if v.is_empty() || v != crate::commands::init::agent_docs::js_trim(v) {
        return bad();
    }
    for c in v.chars() {
        let cp = c as u32;
        if cp <= 0x1f || (0x7f..=0x9f).contains(&cp) || cp == 0x2028 || cp == 0x2029 {
            return bad();
        }
    }
    if v.contains("ASTRYX:START") || v.contains("ASTRYX:END") || v.contains("XDS:START") || v.contains("XDS:END") || v.contains('`') {
        return bad();
    }
    Ok(v.to_string())
}

pub fn find_core_dir(start: &str) -> Option<String> {
    crate::discovery::paths::find_core_dir(start)
}

/// Whether the folder's ignore files exclude `rel` (outside a repository),
/// read with the working-tree ignore reader; None when one cannot be read.
pub fn ignored_here(target: &str, rel: &str) -> Option<bool> {
    let resolver = crate::discovery::file_protection::FileProtectionResolver::new(target, &[]).ok()?;
    let found = resolver.classify(&p::join2(target, rel)).ok()?;
    Some(found.iter().any(|f| f.reason == "ignored"))
}

/// True when `cwd` is outside any project.
pub fn is_outside_project(cwd: &str) -> bool {
    crate::discovery::release::is_outside_project(cwd)
}

/// Not null and not the JS `undefined` marker.
pub fn present(v: Option<&crate::json::Value>) -> bool {
    match v {
        None | Some(crate::json::Value::Null) => false,
        Some(crate::json::Value::Object(m)) => !(m.len() == 1 && m.get("__js").and_then(|x| x.as_str()) == Some("undefined")),
        _ => true,
    }
}
