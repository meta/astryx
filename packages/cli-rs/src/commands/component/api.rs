//! Port of `api/component/` (`component.mjs`, `_adapter.mjs`, `list/`,
//! `detail/`): resolve component selectors across Core and integrations and
//! answer with one typed `{type, package, data}` response.

use super::deps::{self, LoadedIntegration, ReadOpts};
use super::jsv::{s, truthy};
use crate::cli::command::Suggestion;
use crate::discovery::component_discovery::{
    self as cd, discover_components, discover_external_components_grouped, discover_valid_integration_components,
    doc_stem, family_member, find_component_readme, find_component_source, find_external_component_doc,
    find_integration_component, integration_member_entry, is_integration_member, recorded_doc_name,
    resolve_import_path, resolve_integration_import_path, ImportOwner, NameHold, CORE_PACKAGE,
};
use crate::discovery::component_replacement::{resolve_component_replacements, ActiveReplacement, ComponentReplacements};
use crate::json::{Map, Value};
use crate::text::levenshtein_distance;
use crate::text::locale_compare;
use crate::text::string_utils::search_components;
use crate::text::suggest_order::{rank_component_suggestions, synonym_matches};
use std::path::{Path, PathBuf};

pub const COMPONENT_BATCH_SELECTOR_LIMIT: usize = 100;
const NEAR_FIRST: f64 = 10.0;

/// An API failure: `AstryxError(message, suggestions, code)`, plus the
/// candidates of an ambiguity.
#[derive(Debug, Clone)]
pub struct ApiError {
    pub message: String,
    pub suggestions: Option<Vec<Suggestion>>,
    pub code: String,
    pub candidates: Option<Vec<Value>>,
}

impl ApiError {
    pub fn new(message: impl Into<String>, suggestions: Option<Vec<Suggestion>>, code: &str) -> Self {
        ApiError { message: message.into(), suggestions, code: code.into(), candidates: None }
    }
}

/// A typed response `{type, package?, data}`.
#[derive(Debug, Clone)]
pub struct Response {
    pub kind: String,
    pub package: Option<String>,
    pub data: Value,
}

impl Response {
    pub fn new(kind: &str, package: Option<&str>, data: Value) -> Self {
        Response { kind: kind.into(), package: package.map(String::from), data }
    }
    /// `{type, package?, data}` as JSON, in that key order.
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("type".into(), Value::String(self.kind.clone()));
        if let Some(p) = &self.package {
            m.insert("package".into(), Value::String(p.clone()));
        }
        m.insert("data".into(), self.data.clone());
        Value::Object(m)
    }
}

/// Options for one `component(name, options)` call.
#[derive(Debug, Clone, Default)]
pub struct Options {
    pub cwd: PathBuf,
    pub cli_root: PathBuf,
    pub list: bool,
    pub category: Option<String>,
    pub package: Option<String>,
    pub props: bool,
    pub source: bool,
    pub showcase: bool,
    pub blocks: bool,
    pub detail: Option<String>,
    pub lang: Option<String>,
    pub zh: bool,
    pub dense: bool,
}

/// What was named: nothing, one selector, or an explicit list.
#[derive(Debug, Clone)]
pub enum Name {
    None,
    One(String),
    Many(Vec<String>),
}

// ── Owners ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Owner {
    pub package: String,
    pub doc_path: Option<PathBuf>,
    pub source_path: Option<PathBuf>,
    pub issues_url: Option<String>,
    pub integration: Option<LoadedIntegration>,
    pub hold: NameHold,
}

/// `resolveOwners(coreDir, dirName, loadedIntegrations)`.
pub fn resolve_owners(core_dir: &Path, dir_name: &str, integrations: &[LoadedIntegration]) -> Vec<Owner> {
    let mut owners = Vec::new();
    if let Some(doc) = find_component_readme(core_dir, dir_name) {
        owners.push(Owner {
            package: CORE_PACKAGE.into(),
            doc_path: Some(doc),
            source_path: find_component_source(core_dir, dir_name),
            issues_url: None,
            integration: None,
            hold: NameHold::Core,
        });
    }
    for i in integrations {
        let Some(found) = find_integration_component(i, dir_name) else { continue };
        owners.push(Owner {
            package: i.name.clone(),
            doc_path: Some(found.doc_path),
            source_path: found.source_path,
            issues_url: i.issues_url.clone(),
            integration: Some(i.clone()),
            hold: found.hold,
        });
    }
    owners
}

/// A legacy `pkg.astryx.docs` package.
#[derive(Debug, Clone)]
pub struct ExternalPackage {
    pub name: String,
    pub category: String,
    pub docs_dir: PathBuf,
}

/// `discoverExternalPackages(cwd)`.
pub fn discover_external_packages(cwd: &Path) -> Vec<ExternalPackage> {
    crate::discovery::paths::discover_external_packages(&cwd.to_string_lossy())
        .into_iter()
        .map(|e| ExternalPackage { name: e.name, category: e.category, docs_dir: PathBuf::from(e.docs_dir) })
        .collect()
}

enum Scope {
    Core(Owner),
    Integration(Owner),
    Legacy(ExternalPackage),
}

fn classify_scope(scope: &str, owners: &[Owner], integrations: &[LoadedIntegration], cwd: &Path, name: &str) -> Result<Scope, ApiError> {
    let missing = || ApiError::new(format!("No component \"{name}\" in package \"{scope}\""), None, "ERR_UNKNOWN_COMPONENT");
    if scope == CORE_PACKAGE {
        return owners.iter().find(|o| o.package == CORE_PACKAGE).cloned().map(Scope::Core).ok_or_else(missing);
    }
    if integrations.iter().any(|i| i.name == scope) {
        return owners.iter().find(|o| o.package == scope).cloned().map(Scope::Integration).ok_or_else(missing);
    }
    discover_external_packages(cwd)
        .into_iter()
        .find(|e| e.name == scope)
        .map(Scope::Legacy)
        .ok_or_else(|| ApiError::new(format!("External package \"{scope}\" not found"), None, "ERR_UNKNOWN_PACKAGE"))
}

fn ambiguity(owners: &[Owner], dir_name: &str) -> ApiError {
    let mut e = ApiError::new(
        format!("Component \"{dir_name}\" is provided by multiple packages. Re-run with --package <pkg> to choose one."),
        Some(owners.iter().map(|o| Suggestion::new(o.package.clone(), "provides this component")).collect()),
        "ERR_AMBIGUOUS_COMPONENT",
    );
    e.candidates = Some(
        owners
            .iter()
            .map(|o| {
                let mut m = Map::new();
                m.insert("package".into(), Value::String(o.package.clone()));
                m.insert("component".into(), Value::String(dir_name.into()));
                m.insert("kind".into(), Value::String("component".into()));
                m.insert("installed".into(), Value::Bool(true));
                Value::Object(m)
            })
            .collect(),
    );
    e
}

fn resolve_legacy_external_doc(ext: &ExternalPackage, dir_name: &str) -> Option<PathBuf> {
    find_external_component_doc(&ext.docs_dir, dir_name).filter(|p| p.to_string_lossy().ends_with(".doc.mjs"))
}

/// `legacyExternalDocuments(cwd, dirName)`.
pub fn legacy_external_documents(cwd: &Path, dir_name: &str) -> bool {
    discover_external_packages(cwd).iter().any(|e| resolve_legacy_external_doc(e, dir_name).is_some())
}

/// `legacyExternalKeeps(cwd, dirName, owners)`: owners given as
/// `(hold, docPath)`.
pub fn legacy_external_keeps(cwd: &Path, dir_name: &str, owners: &[(NameHold, Option<PathBuf>)]) -> bool {
    !owners.is_empty()
        && owners.iter().all(|(hold, doc)| {
            *hold == NameHold::Doc && doc.as_ref().is_some_and(|d| doc_stem(d).to_lowercase() != dir_name.to_lowercase())
        })
        && legacy_external_documents(cwd, dir_name)
}

// ── Doc loading and shaping ────────────────────────────────────────────

/// `loadComponentDoc(docPath, {zh, dense, lang})` from the adapter.
pub fn load_component_doc(doc_path: &Path, zh: bool, dense: bool, lang: Option<&str>) -> Result<Value, ApiError> {
    deps::read_doc_view(doc_path, &ReadOpts { root: "components", lang: deps::locale_of(zh, dense, lang), strict: true })
        .map_err(|m| ApiError::new(format!("Cannot load component metadata: {m}"), None, "ERR_INVALID_DOC"))
}

/// `loadDocs(path, {zh, lang})` (native loader, not strict).
pub fn load_docs(doc_path: &Path, zh: bool, lang: Option<&str>) -> Result<Value, String> {
    deps::read_doc_view(doc_path, &ReadOpts { root: "components", lang: deps::locale_of(zh, false, lang), strict: false })
}

fn obj(v: &Value) -> Map<String, Value> {
    v.as_object().cloned().unwrap_or_default()
}

/// `extractProps(docs)`.
pub fn extract_props(docs: &Value) -> Value {
    if let Some(p) = docs.get("props").filter(|p| truthy(Some(p))) {
        return p.clone();
    }
    match docs.get("components").filter(|c| truthy(Some(c))) {
        Some(Value::Array(cs)) => Value::Array(
            cs.iter()
                .flat_map(|c| match c.get("props").filter(|p| truthy(Some(p))) {
                    Some(Value::Array(a)) => a.clone(),
                    Some(other) => vec![other.clone()],
                    None => vec![],
                })
                .collect(),
        ),
        _ => Value::Array(vec![]),
    }
}

fn import_owner_of(owner: &Owner) -> ImportOwner {
    ImportOwner {
        exports_map: owner.integration.as_ref().and_then(|i| i.package_exports.clone()),
        package_dir: owner.integration.as_ref().and_then(|i| i.package_dir.clone()),
        doc_path: owner.doc_path.clone(),
        package_name: owner.package.clone(),
    }
}

/// `withOwnership(docs, owner, componentName, coreDir)`.
pub fn with_ownership(docs: &Value, owner: &Owner, component_name: &str, core_dir: &Path) -> Value {
    let authored = docs.get("import").and_then(|v| v.as_str());
    let import_spec = if owner.package == CORE_PACKAGE {
        match docs.get("import") {
            Some(v) if !v.is_null() => v.clone(),
            _ => Value::String(resolve_import_path(core_dir, component_name)),
        }
    } else {
        Value::String(resolve_integration_import_path(&import_owner_of(owner), component_name, authored))
    };
    let mut m = obj(docs);
    m.insert("package".into(), Value::String(owner.package.clone()));
    m.insert("import".into(), import_spec);
    m.insert("sourceAvailable".into(), Value::Bool(owner.source_path.is_some()));
    Value::Object(m)
}

fn bare_owner(package: &str, source_path: Option<PathBuf>) -> Owner {
    Owner { package: package.into(), doc_path: None, source_path, issues_url: None, integration: None, hold: NameHold::File }
}

fn component_detail(docs: &Value, owner: &Owner, name: &str, core_dir: &Path) -> Response {
    Response::new("component.detail", Some(&owner.package), with_ownership(docs, owner, name, core_dir))
}

fn component_detail_props(docs: &Value, package: &str) -> Response {
    Response::new("component.detail.props", Some(package), extract_props(docs))
}

fn component_detail_source(dir_name: &str, source_path: Option<&Path>, name: &str, not_found_in: Option<&str>, owner_package: &str) -> Result<Response, ApiError> {
    let Some(p) = source_path else {
        let suffix = not_found_in.map(|p| format!(" in package \"{p}\"")).unwrap_or_default();
        return Err(ApiError::new(format!("Source for \"{name}\" not found{suffix}"), None, "ERR_NO_SOURCE"));
    };
    let source = crate::discovery::nodepath::read_text(&p.to_string_lossy()).unwrap_or_default();
    let mut m = Map::new();
    m.insert("component".into(), Value::String(dir_name.into()));
    m.insert("source".into(), Value::String(source));
    Ok(Response::new("component.detail.source", Some(owner_package), Value::Object(m)))
}

fn component_detail_showcase(dir_name: &str, cwd: &Path, name: &str, package_scope: Option<&str>, resolve: bool, owner_package: &str) -> Result<Response, ApiError> {
    let found = if resolve { super::templates::find_showcase(dir_name, cwd, package_scope) } else { None };
    let Some((file, aspect)) = found else {
        let suffix = package_scope.map(|p| format!(" in package \"{p}\"")).unwrap_or_default();
        return Err(ApiError::new(format!("No showcase found for \"{name}\"{suffix}"), None, "ERR_NO_SHOWCASE"));
    };
    let text = crate::discovery::nodepath::read_text(&file.to_string_lossy()).unwrap_or_default();
    let mut m = Map::new();
    m.insert("component".into(), Value::String(dir_name.into()));
    m.insert("aspectRatio".into(), aspect);
    m.insert("source".into(), Value::String(super::templates::replace_demo_content(&text)));
    Ok(Response::new("component.detail.showcase", Some(owner_package), Value::Object(m)))
}

fn component_detail_blocks(dir_name: &str, cwd: &Path, owner_package: &str) -> Response {
    super::templates::component_detail_blocks(dir_name, cwd, owner_package)
}

/// `scopeSubComponent(docs, dirName, coreDir)`: `(scoped, matching member)`.
pub fn scope_sub_component(docs: &Value, dir_name: &str, core_dir: &Path) -> Option<(Value, Value)> {
    let requested = format!("XDS{dir_name}");
    let doc_name = docs.get("name").filter(|n| truthy(Some(n))).map(|n| crate::cli::format::js_string(n));
    let is_parent = doc_name.as_ref().is_some_and(|n| n.to_lowercase() != dir_name.to_lowercase());
    if !is_parent {
        return None;
    }
    let comps = docs.get("components").filter(|c| truthy(Some(c)))?.as_array()?;
    let m = comps.iter().find(|c| {
        let n = s(c.get("name"));
        n == Some(requested.as_str()) || n == Some(dir_name)
    })?;
    let mut scoped = Map::new();
    scoped.insert("name".into(), Value::String(dir_name.into()));
    if let Some(d) = m.get("description") {
        scoped.insert("description".into(), d.clone());
    }
    if let Some(p) = m.get("props") {
        scoped.insert("props".into(), p.clone());
    }
    scoped.insert("components".into(), Value::Array(vec![m.clone()]));
    scoped.insert("parentDoc".into(), docs.get("name").cloned().unwrap_or(Value::Null));
    scoped.insert("import".into(), Value::String(resolve_import_path(core_dir, dir_name)));
    if let Some(u) = docs.get("usage").filter(|u| truthy(Some(u))) {
        scoped.insert("usage".into(), u.clone());
    }
    if let Some(t) = docs.get("theming").filter(|t| truthy(Some(t))) {
        scoped.insert("theming".into(), t.clone());
    }
    Some((Value::Object(scoped), m.clone()))
}

/// `scopeIntegrationMember(docs, owner, dirName)`.
pub fn scope_integration_member(docs: &Value, owner: &Owner, dir_name: &str) -> Result<Value, ApiError> {
    if !is_integration_member(dir_name, owner.doc_path.as_deref()) {
        return Ok(docs.clone());
    }
    let doc_path = owner.doc_path.clone().unwrap();
    let Some(entry) = integration_member_entry(docs, dir_name, &doc_path) else {
        return Err(ApiError::new(
            format!("No component named \"{dir_name}\": its family doc changed after this process loaded it."),
            None,
            "ERR_UNKNOWN_COMPONENT",
        ));
    };
    let mut scoped = Map::new();
    scoped.insert("name".into(), Value::String(dir_name.into()));
    if let Some(d) = entry.get("description") {
        scoped.insert("description".into(), d.clone());
    }
    if let Some(p) = entry.get("props") {
        scoped.insert("props".into(), p.clone());
    }
    scoped.insert("components".into(), Value::Array(vec![entry.clone()]));
    let parent = match &owner.integration {
        Some(i) => Value::String(recorded_doc_name(i, &doc_path)),
        None if s(docs.get("name")) == Some(dir_name) => Value::String(doc_stem(&doc_path)),
        None => docs.get("name").cloned().unwrap_or(Value::Null),
    };
    scoped.insert("parentDoc".into(), parent);
    if let Some(u) = docs.get("usage").filter(|u| truthy(Some(u))) {
        scoped.insert("usage".into(), u.clone());
    }
    if let Some(t) = docs.get("theming").filter(|t| truthy(Some(t))) {
        scoped.insert("theming".into(), t.clone());
    }
    if let Some(i) = docs.get("import").filter(|i| truthy(Some(i))) {
        scoped.insert("import".into(), i.clone());
    }
    Ok(Value::Object(scoped))
}

fn search_cards(cli_root: &Path) -> Value {
    std::fs::read_to_string(cli_root.join("api/search/_cards.json"))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(Value::Object(Map::new()))
}

struct Resolved {
    readme: PathBuf,
    name: String,
    owner_package: String,
    source_path: Option<PathBuf>,
}

fn doc_view_for_search(p: &Path) -> Option<Value> {
    deps::read_docs_export(p)
}

fn resolve_unscoped_doc(dir_name: &str, core_dir: &Path, cwd: &Path, name: &str, cli_root: &Path) -> Result<Resolved, ApiError> {
    let mut readme = find_component_readme(core_dir, dir_name);
    let mut resolved_name = dir_name.to_string();
    let mut owner_package = CORE_PACKAGE.to_string();
    let mut source_path = if readme.is_some() { find_component_source(core_dir, dir_name) } else { None };
    if readme.is_none() {
        for ext in discover_external_packages(cwd) {
            if let Some(p) = find_external_component_doc(&ext.docs_dir, dir_name) {
                readme = Some(p);
                owner_package = ext.name.clone();
                source_path = None;
                break;
            }
        }
    }
    if readme.is_none() {
        let all: Vec<String> = discover_components(core_dir).into_values().flatten().collect();
        let results = search_components(dir_name, core_dir, &all, &doc_view_for_search);
        if results.is_empty() {
            return Err(ApiError::new(format!("No component named \"{name}\""), None, "ERR_UNKNOWN_COMPONENT"));
        }
        let top = results[0].score;
        let tied: Vec<_> = results.iter().filter(|r| r.score == top).collect();
        let second = if results.len() > tied.len() { results[tied.len()].score } else { 0.0 };
        if top >= 90.0 && tied.len() == 1 && top - second >= 20.0 {
            resolved_name = tied[0].name.clone();
            readme = find_component_readme(core_dir, &resolved_name);
            owner_package = CORE_PACKAGE.into();
            source_path = find_component_source(core_dir, &resolved_name);
        } else {
            let threshold = (top - 20.0).max(1.0);
            let count = results.iter().filter(|r| r.score >= threshold).take(5).count().max(results.len().min(2));
            let synonyms = synonym_matches(dir_name, &search_cards(cli_root));
            let candidates: Vec<_> = rank_component_suggestions(dir_name, &results, &all, &synonyms).into_iter().take(count).collect();
            let typed = dir_name.to_lowercase();
            let first = candidates.first().map(|c| c.score).unwrap_or(0.0);
            let near: Vec<Suggestion> = candidates
                .iter()
                .enumerate()
                .filter(|(i, c)| *i < 2 || c.score >= first - NEAR_FIRST || levenshtein_distance(&c.name.to_lowercase(), &typed) <= 2)
                .map(|(_, c)| Suggestion::new(c.name.clone(), c.reason.clone()))
                .collect();
            return Err(ApiError::new(format!("No component named \"{name}\""), Some(near), "ERR_UNKNOWN_COMPONENT"));
        }
    }
    let readme = readme.filter(|r| r.to_string_lossy().ends_with(".doc.mjs")).ok_or_else(|| {
        ApiError::new(format!("No .doc.mjs found for \"{resolved_name}\". The component needs a typed doc file."), None, "ERR_NO_DOC")
    })?;
    Ok(Resolved { readme, name: resolved_name, owner_package, source_path })
}

// ── Selectors and batches ──────────────────────────────────────────────

struct Target {
    name: String,
    package: Option<String>,
    version: Option<String>,
}

struct Split {
    scoped: bool,
    name: String,
    version: Option<String>,
    item: Option<String>,
}

fn split_selector(selector: &str) -> Split {
    let scoped = selector.starts_with('@');
    let first = selector.find('/');
    let split = if scoped {
        match first {
            None => None,
            Some(f) => selector[f + 1..].find('/').map(|i| f + 1 + i),
        }
    } else {
        first
    };
    let (head, rest) = match split {
        Some(i) if i > 0 => (&selector[..i], Some(&selector[i + 1..]).filter(|r| !r.is_empty())),
        _ => (selector, None),
    };
    let at = head.get(1..).and_then(|h| h.find('@')).map(|i| i + 1);
    let (name, version) = match at {
        Some(a) => (head[..a].to_string(), Some(head[a + 1..].to_string()).filter(|v| !v.is_empty())),
        None => (head.to_string(), None),
    };
    Split { scoped, name, version, item: rest.map(String::from) }
}

fn parse_component_selector(value: &str, scope: Option<&str>) -> Result<Target, ApiError> {
    if value.is_empty() {
        return Err(ApiError::new(format!("Invalid component selector \"{value}\""), None, "ERR_INVALID_ARGUMENT"));
    }
    let t = split_selector(value);
    let package_shaped = t.scoped || t.item.is_some() || t.version.is_some();
    if !package_shaped {
        return Ok(Target { name: t.name, package: scope.map(String::from), version: None });
    }
    let Some(item) = t.item else {
        return Err(ApiError::new(format!("Component selector \"{value}\" names a package but no component"), None, "ERR_INVALID_ARGUMENT"));
    };
    if let Some(sc) = scope {
        if sc != t.name {
            return Err(ApiError::new(format!("Component selector \"{value}\" conflicts with --package \"{sc}\""), None, "ERR_INVALID_ARGUMENT"));
        }
    }
    Ok(Target { name: item, package: Some(t.name), version: t.version })
}

fn installed_version(core_dir: &Path, integrations: &[LoadedIntegration], package: &str) -> Option<String> {
    if package == CORE_PACKAGE {
        return crate::discovery::nodepath::read_text(&core_dir.join("package.json").to_string_lossy())
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .and_then(|v| v.get("version").and_then(|x| x.as_str()).map(String::from));
    }
    integrations.iter().find(|i| i.name == package).and_then(|i| i.version.clone())
}

fn require_installed_version(t: &Target, core_dir: &Path, integrations: &[LoadedIntegration]) -> Result<(), ApiError> {
    let Some(v) = &t.version else { return Ok(()) };
    let pkg = t.package.clone().unwrap_or_default();
    if installed_version(core_dir, integrations, &pkg).as_deref() == Some(v.as_str()) {
        return Ok(());
    }
    let exact = format!("{pkg}@{v}");
    Err(ApiError::new(
        format!("Package \"{exact}\" is not installed"),
        Some(vec![Suggestion::new(format!("astryx discover {exact}"), "look up this package version")]),
        "ERR_UNKNOWN_PACKAGE",
    ))
}

fn batch_failure(selector: &str, err: ApiError) -> Value {
    let mut m = Map::new();
    m.insert("selector".into(), Value::String(selector.into()));
    if let Some(c) = err.candidates {
        m.insert("status".into(), Value::String("ambiguous".into()));
        m.insert("code".into(), Value::String(err.code));
        m.insert("error".into(), Value::String(err.message));
        m.insert("candidates".into(), Value::Array(c));
        return Value::Object(m);
    }
    let not_found = matches!(err.code.as_str(), "ERR_UNKNOWN_COMPONENT" | "ERR_UNKNOWN_PACKAGE" | "ERR_NOT_FOUND");
    m.insert("status".into(), Value::String(if not_found { "not_found" } else { "error" }.into()));
    m.insert("code".into(), Value::String(err.code));
    m.insert("error".into(), Value::String(err.message));
    if let Some(sg) = err.suggestions {
        m.insert("suggestions".into(), Value::Array(sg.iter().map(|x| x.to_json()).collect()));
    }
    Value::Object(m)
}

fn component_batch(selectors: &[String], opts: &Options, core_dir: &Path) -> Response {
    let integrations = deps::load_integrations_safely(&opts.cwd);
    let mut results = Vec::new();
    for sel in selectors {
        let r = (|| -> Result<Response, ApiError> {
            let t = parse_component_selector(sel, opts.package.as_deref())?;
            require_installed_version(&t, core_dir, &integrations)?;
            // A batch passes only the detail options on: never list or category.
            let mut o = opts.clone();
            o.package = t.package.clone();
            o.list = false;
            o.category = None;
            component(&Name::One(t.name.clone()), &o)
        })();
        match r {
            Ok(res) => {
                let mut m = Map::new();
                m.insert("selector".into(), Value::String(sel.clone()));
                m.insert("status".into(), Value::String("found".into()));
                m.insert("result".into(), res.to_json());
                results.push(Value::Object(m));
            }
            Err(e) => results.push(batch_failure(sel, e)),
        }
    }
    let mut data = Map::new();
    data.insert("count".into(), Value::from(results.len()));
    data.insert("results".into(), Value::Array(results));
    Response::new("component.batch", None, Value::Object(data))
}

// ── Entry ───────────────────────────────────────────────────────────────

/// `component(name, options)`: the read, with doc links resolved.
pub fn component(name: &Name, opts: &Options) -> Result<Response, ApiError> {
    let r = component_read(name, opts)?;
    Ok(super::links::link_component_response(r, &opts.cwd))
}

fn component_read(name: &Name, opts: &Options) -> Result<Response, ApiError> {
    let is_list = matches!(name, Name::None) || (!matches!(name, Name::Many(_)) && (opts.list || opts.category.is_some()));
    let detail = opts.detail.clone().unwrap_or_else(|| if is_list { "brief".into() } else { "full".into() });
    if !["full", "compact", "brief"].contains(&detail.as_str()) {
        return Err(ApiError::new(format!("Invalid detail \"{detail}\". Valid levels: full, compact, brief"), None, "ERR_INVALID_DETAIL"));
    }
    if let Some(l) = &opts.lang {
        if !["en", "zh", "dense"].contains(&l.as_str()) {
            return Err(ApiError::new(format!("Invalid lang \"{l}\". Valid values: en, zh, dense"), None, "ERR_INVALID_LANG"));
        }
    }
    if let Name::Many(list) = name {
        if list.len() > COMPONENT_BATCH_SELECTOR_LIMIT {
            return Err(ApiError::new(
                format!("Component batch accepts at most {COMPONENT_BATCH_SELECTOR_LIMIT} selectors; received {}", list.len()),
                None,
                "ERR_INVALID_ARGUMENT",
            ));
        }
    }
    let core_dir = deps::require_core_dir(&opts.cwd).map_err(|e| ApiError::new(e.message, None, &e.code))?;
    let mut o = opts.clone();
    o.detail = Some(detail.clone());
    if let Name::Many(list) = name {
        return Ok(component_batch(list, &o, &core_dir));
    }
    let one = match name {
        Name::One(n) if !n.is_empty() => Some(n.clone()),
        _ => None,
    };
    if opts.category.as_deref().is_some_and(|c| !c.is_empty()) || opts.list || one.is_none() {
        return super::list::component_list(&core_dir, &o);
    }
    let mut name = one.unwrap();
    let target = parse_component_selector(&name, opts.package.as_deref())?;
    if target.version.is_some() {
        let ints = deps::load_integrations_safely(&opts.cwd);
        require_installed_version(&target, &core_dir, &ints)?;
    }
    if target.name != name || target.package != opts.package {
        let mut o2 = o.clone();
        o2.package = target.package.clone();
        return component_read(&Name::One(target.name), &o2);
    }
    name = target.name;
    single(&name, &o, &core_dir)
}

fn single(name: &str, opts: &Options, core_dir: &Path) -> Result<Response, ApiError> {
    let cwd = &opts.cwd;
    let dir_name = name.strip_prefix("XDS").unwrap_or(name).to_string();
    let (zh, dense, lang) = (opts.zh, opts.dense, opts.lang.as_deref());
    let integrations = deps::load_integrations_safely(cwd);
    // Owner lookup lists Core's `src` first; Node's `readdirSync` throws
    // there when the folder is missing.
    crate::discovery::component_discovery::try_discover_components(core_dir)
        .map_err(|m| ApiError::new(m, None, "ERR_UNKNOWN"))?;
    let owners = resolve_owners(core_dir, &dir_name, &integrations);
    let list_cmd = crate::cli::env::format_cli_command_at(cwd, "component --list");
    let replacements = || -> ComponentReplacements {
        if integrations.is_empty() {
            ComponentReplacements::default()
        } else {
            resolve_component_replacements(Some(core_dir), &integrations, &list_cmd)
        }
    };

    if let Some(scope) = opts.package.clone() {
        if scope != CORE_PACKAGE && !owners.iter().any(|o| o.package == scope) {
            let reps = replacements();
            if let Some(rep) = reps.for_target(&dir_name) {
                if rep.package == scope {
                    let mut o2 = opts.clone();
                    o2.package = Some(scope.clone());
                    return component_read(&Name::One(rep.name.clone()), &o2);
                }
            }
        }
        match classify_scope(&scope, &owners, &integrations, cwd, name)? {
            Scope::Core(owner) | Scope::Integration(owner) if true => {
                let is_core = owner.package == CORE_PACKAGE && scope == CORE_PACKAGE;
                if opts.source {
                    return component_detail_source(&dir_name, owner.source_path.as_deref(), name, if is_core { None } else { Some(&scope) }, &owner.package);
                }
                if opts.showcase {
                    return if is_core {
                        component_detail_showcase(&dir_name, cwd, name, None, true, &owner.package)
                    } else {
                        component_detail_showcase(&dir_name, cwd, name, None, false, &owner.package)
                    };
                }
                if opts.blocks {
                    return Ok(component_detail_blocks(&dir_name, cwd, &owner.package));
                }
                let loaded = load_component_doc(owner.doc_path.as_deref().unwrap(), zh, dense, lang)?;
                if is_core {
                    if let Some((scoped, member)) = scope_sub_component(&loaded, &dir_name, core_dir) {
                        if opts.props {
                            let mut m = Map::new();
                            m.insert("props".into(), member.get("props").cloned().unwrap_or(Value::Null));
                            return Ok(component_detail_props(&Value::Object(m), &owner.package));
                        }
                        return Ok(component_detail(&scoped, &owner, &dir_name, core_dir));
                    }
                }
                let docs = if is_core { loaded } else { scope_integration_member(&loaded, &owner, &dir_name)? };
                if opts.props {
                    return Ok(component_detail_props(&docs, &owner.package));
                }
                return Ok(component_detail(&docs, &owner, &dir_name, core_dir));
            }
            Scope::Legacy(ext) => {
                if opts.showcase {
                    return component_detail_showcase(&dir_name, cwd, name, Some(&scope), true, &scope);
                }
                if let Some(doc) = resolve_legacy_external_doc(&ext, &dir_name) {
                    if opts.source {
                        return component_detail_source(&dir_name, None, name, Some(&scope), &ext.name);
                    }
                    if opts.blocks {
                        return Ok(component_detail_blocks(&dir_name, cwd, &ext.name));
                    }
                    let docs = load_component_doc(&doc, zh, dense, lang)?;
                    if opts.props {
                        return Ok(component_detail_props(&docs, &ext.name));
                    }
                    return Ok(component_detail(&docs, &bare_owner(&ext.name, None), &dir_name, core_dir));
                }
                return Err(ApiError::new(format!("No component \"{name}\" in package \"{scope}\""), None, "ERR_UNKNOWN_COMPONENT"));
            }
            _ => unreachable!(),
        }
    }

    let reps = replacements();
    if let Some(rep) = reps.for_target(&dir_name).cloned() {
        let ActiveReplacement { name: rname, package, .. } = rep;
        let mut o2 = opts.clone();
        o2.package = Some(package);
        return component_read(&Name::One(rname), &o2);
    }

    let ruled = cd::unscoped_component_owners(&owners, |o| o.hold);
    let mut valid = Vec::new();
    for o in &ruled {
        if o.package == CORE_PACKAGE {
            valid.push(o.clone());
            continue;
        }
        if o.doc_path.as_deref().is_some_and(|d| load_component_doc(d, false, false, None).is_ok()) {
            valid.push(o.clone());
        }
    }
    let loadable = if valid.is_empty() { ruled } else { valid };
    let holds: Vec<(NameHold, Option<PathBuf>)> = loadable.iter().map(|o| (o.hold, o.doc_path.clone())).collect();
    let effective = if legacy_external_keeps(cwd, &dir_name, &holds) { Vec::new() } else { loadable };
    if effective.len() > 1 {
        return Err(ambiguity(&effective, &dir_name));
    }
    if effective.len() == 1 && effective[0].package != CORE_PACKAGE {
        let owner = &effective[0];
        if opts.source {
            return component_detail_source(&dir_name, owner.source_path.as_deref(), name, None, &owner.package);
        }
        if opts.showcase {
            return component_detail_showcase(&dir_name, cwd, name, None, false, &owner.package);
        }
        let loaded = load_component_doc(owner.doc_path.as_deref().unwrap(), zh, dense, lang)?;
        let docs = scope_integration_member(&loaded, owner, &dir_name)?;
        if opts.props {
            return Ok(component_detail_props(&docs, &owner.package));
        }
        return Ok(component_detail(&docs, owner, &dir_name, core_dir));
    }
    if opts.source {
        return component_detail_source(&dir_name, find_component_source(core_dir, &dir_name).as_deref(), name, None, CORE_PACKAGE);
    }
    if opts.showcase {
        return component_detail_showcase(&dir_name, cwd, name, None, true, CORE_PACKAGE);
    }
    let resolved = resolve_unscoped_doc(&dir_name, core_dir, cwd, name, &opts.cli_root)?;
    let docs = load_component_doc(&resolved.readme, zh, dense, lang)?;
    if opts.blocks {
        return Ok(component_detail_blocks(&dir_name, cwd, &resolved.owner_package));
    }
    let owner = bare_owner(&resolved.owner_package, resolved.source_path.clone());
    if let Some((scoped, member)) = scope_sub_component(&docs, &dir_name, core_dir) {
        if opts.props {
            let mut m = Map::new();
            m.insert("props".into(), member.get("props").cloned().unwrap_or(Value::Null));
            return Ok(component_detail_props(&Value::Object(m), &resolved.owner_package));
        }
        return Ok(component_detail(&scoped, &owner, &dir_name, core_dir));
    }
    if opts.props {
        return Ok(component_detail_props(&docs, &resolved.owner_package));
    }
    Ok(component_detail(&docs, &owner, &resolved.name, core_dir))
}

// Shared with list.rs.
pub(crate) fn sort_by_locale(v: &mut [Value]) {
    v.sort_by(|a, b| locale_compare(s(a.get("name")).unwrap_or(""), s(b.get("name")).unwrap_or("")));
}

pub(crate) fn family_member_of<'a>(docs: &'a Value, name: &str) -> Option<&'a Value> {
    family_member(docs, name)
}

pub(crate) fn valid_integration_components(i: &LoadedIntegration) -> Vec<cd::IntegrationRecord> {
    discover_valid_integration_components(i, true).components
}

pub(crate) fn external_grouped(dir: &Path) -> cd::ComponentGroups {
    discover_external_components_grouped(dir)
}
