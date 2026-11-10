//! `integrationAdd(kind, name, options)` (`api/integration/add-contribution.mjs`
//! and `add-theme.mjs`): generate one contribution into an integration
//! package.

use super::add_helpers::*;
use super::cli_requirement;
use super::jsjson;
use super::manifest_load::load_manifest_value;
use super::manifest_writer::{add_agent_doc_source, patch_root_source};
use crate::json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Default, Clone, Debug)]
pub struct AddOptions {
    pub cwd: PathBuf,
    pub dry_run: Option<bool>,
    pub template_type: Option<String>,
    pub replaces: Option<String>,
    pub extends: Option<String>,
    pub parent: Option<String>,
    pub to: Option<String>,
    pub from: Option<String>,
}

const KINDS: [&str; 6] = ["component", "doc", "template", "codemod", "agent-doc", "theme"];

fn allowed(kind: &str) -> &'static [&'static str] {
    match kind {
        "component" => &["cwd", "dryRun"],
        "doc" => &["cwd", "dryRun", "replaces", "extends", "parent"],
        "template" => &["cwd", "dryRun", "templateType"],
        "codemod" => &["cwd", "dryRun", "to"],
        "agent-doc" => &["cwd", "dryRun"],
        _ => &["cwd", "dryRun", "from"],
    }
}

/// Load the current manifest's object, or `{}` when there is none.
fn load_current(pkg: &Package) -> R<Value> {
    if !pkg.manifest_exists {
        return Ok(Value::Object(Map::new()));
    }
    load_manifest_value(&pkg.manifest_file)
}

fn manifest_str(m: &Value, key: &str) -> Option<String> {
    // A root that is set but not a string: the JS schema rejects it on load.
    m.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

/// What `patchIntegrationRoot` can throw.
#[derive(Debug)]
pub enum RootError {
    Conflict(String),
    Other(AddError),
}

impl From<AddError> for RootError {
    fn from(e: AddError) -> Self {
        RootError::Other(e)
    }
}

/// `patchIntegrationRoot(packageDir, kind, rootPath, {dryRun, createIfMissing})`.
/// Verification after the write is the caller's job.
pub fn patch_integration_root(package_dir: &Path, kind: &str, root_path: &str, dry_run: bool, create_if_missing: bool) -> Result<(String, bool), RootError> {
    patch_integration_root_verified(package_dir, kind, root_path, dry_run, create_if_missing, None)
}

/// A manifest whose default export reads back after writing, as `verify`
/// sees it: the contribution under `kind` is visible.
pub type Verify<'v> = &'v dyn Fn() -> Result<(), String>;

/// `patchIntegrationRoot(packageDir, kind, rootPath, {dryRun, createIfMissing, verify})`.
pub fn patch_integration_root_verified(
    package_dir: &Path,
    kind: &str,
    root_path: &str,
    dry_run: bool,
    create_if_missing: bool,
    verify: Option<Verify>,
) -> Result<(String, bool), RootError> {
    let keys: Vec<&str> = kind.split('.').collect();
    let ident_ok = |k: &str| {
        let mut ch = k.chars();
        matches!(ch.next(), Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$') && ch.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
    };
    if !keys.iter().all(|k| ident_ok(k)) {
        return Err(AddError::plain(format!("Invalid integration root key \"{kind}\".")).into());
    }
    assert_within(root_path, package_dir, &format!("{kind} root"), false).map_err(|e| AddError::new(e.message, &e.code))?;
    let existing = find_local_manifest(package_dir)?;
    let manifest_exists = existing.is_some();
    if !manifest_exists && !create_if_missing {
        return Err(AddError::plain("No astryx.integration.{ts,mjs,js} file found.").into());
    }
    let manifest_file = existing.unwrap_or_else(|| package_dir.join("astryx.integration.mjs"));
    let mut writable = manifest_file.clone();
    if manifest_exists && fs::symlink_metadata(&manifest_file).map(|m| m.file_type().is_symlink()).unwrap_or(false) {
        let real = fs::canonicalize(&manifest_file).map_err(|e| AddError::plain(e.to_string()))?;
        writable = assert_within(&path_str(&real), package_dir, "integration manifest symlink target", true).map_err(|e| AddError::new(e.message, &e.code))?;
    }
    let manifest = if manifest_exists { load_manifest_value(&manifest_file)? } else { Value::Object(Map::new()) };
    let mut current = Some(&manifest);
    for k in &keys {
        current = current.and_then(|c| c.as_object()).and_then(|o| o.get(*k));
    }
    if let Some(cur) = current {
        if cur.as_str() != Some(root_path) {
            let shown = match cur {
                Value::String(s) => s.clone(),
                other => crate::cli::format::js_string(other),
            };
            return Err(RootError::Conflict(format!(
                "Integration manifest already declares {kind}: \"{shown}\"; refusing to replace it with \"{root_path}\"."
            )));
        }
        if !dry_run {
            if let Some(v) = verify {
                v().map_err(AddError::plain)?;
            }
        }
        return Ok((root_path.to_string(), false));
    }
    let source = if manifest_exists {
        fs::read_to_string(&manifest_file).map_err(|e| AddError::plain(e.to_string()))?
    } else {
        "export default {};\n".to_string()
    };
    let next = patch_root_source(&source, &basename(&manifest_file), kind, root_path).map_err(AddError::plain)?;
    if !dry_run {
        let res = if manifest_exists {
            fs::write(&writable, &next)
        } else {
            fs::OpenOptions::new().write(true).create_new(true).open(&manifest_file).and_then(|mut f| {
                use std::io::Write;
                f.write_all(next.as_bytes())
            })
        };
        res.map_err(|e| AddError::plain(e.to_string()))?;
        if let Some(v) = verify {
            if let Err(m) = v() {
                if manifest_exists {
                    if fs::read_to_string(&writable).ok().as_deref() == Some(next.as_str()) {
                        let _ = fs::write(&writable, &source);
                    }
                } else if fs::read_to_string(&manifest_file).ok().as_deref() == Some(next.as_str()) {
                    let _ = fs::remove_file(&manifest_file);
                }
                return Err(AddError::plain(format!("Post-write verification failed: {m}")).into());
            }
        }
    }
    Ok((root_path.to_string(), true))
}

fn root_err(e: RootError) -> AddError {
    match e {
        RootError::Conflict(m) => AddError::new(m, "ERR_INTEGRATION_ROOT_CONFLICT"),
        RootError::Other(e) => e,
    }
}

fn refuse_existing(pkg_dir: &Path, file: &Path) -> R<()> {
    if file.exists() {
        return Err(AddError::new(format!("Refusing to overwrite existing file {}.", relative(pkg_dir, file)), "ERR_FILE_EXISTS"));
    }
    Ok(())
}

fn root_within(root_path: &str, pkg_dir: &Path, label: &str) -> R<PathBuf> {
    assert_within(root_path, pkg_dir, label, false).map_err(|e| AddError::new(e.message, "ERR_PATH_TRAVERSAL"))
}

fn push_pkg_update(plans: &mut Vec<WritePlan>, file: &Path, upd: Option<PackageJsonUpdate>) {
    if let Some(u) = upd {
        plans.push(WritePlan { path: file.to_path_buf(), contents: u.contents.into_bytes(), create_only: false, expected_original: Some(u.expected_original) });
    }
}

/// The shared tail of every root-based kind: write, declare the root, and
/// build the receipt.
/// The `verify` step of a root-based kind: the manifest reads back with the
/// root declared and the contribution is visible under it.
pub fn verify_contribution(pkg_dir: &Path, manifest_file: &Path, owner: &str, label: &str, root_key: &str, missing: &str, kind: &str, name: &str, version: Option<&str>) -> Result<(), String> {
    let m = super::manifest_load::load_manifest_labeled(manifest_file, label).map_err(|e| e.message)?;
    let declared = m.get(root_key).filter(|v| crate::discovery::paths::js_truthy(Some(v))).map(crate::cli::format::js_string);
    let Some(declared): Option<String> = declared else { return Err(missing.to_string()) };
    let abs = assert_within(&declared, pkg_dir, &format!("{root_key} root"), false).map_err(|e| e.message)?;
    let mut record = crate::discovery::integrations::Record::new();
    record.insert("name".into(), Value::String(owner.to_string()));
    record.insert(root_key.into(), Value::String(path_str(&abs)));
    crate::discovery::contribution_inventory::assert_contribution_visible(&record, kind, name, version)
}

#[allow(clippy::too_many_arguments)]
fn finish(kind: &str, name: &str, pkg: &Package, plans: Vec<WritePlan>, root_key: &str, root_path: &str, root_created: bool, dry_run: bool, version: Option<&str>) -> R<Value> {
    let mut files: Vec<String> = plans.iter().map(|p| relative(&pkg.dir, &p.path)).collect();
    let manifest_path = relative(&pkg.dir, &pkg.manifest_file);
    let mut receipt_root = (root_path.to_string(), root_created);
    if !dry_run {
        let rb = apply_writes(&plans).map_err(|e| {
            if e.code.is_some() {
                e
            } else {
                AddError::new(format!("Failed to write {kind} contribution: {}", e.message), "ERR_WRITE_FAILED")
            }
        })?;
        let missing = format!("{root_key} root not visible after writing.");
        let verify = || verify_contribution(&pkg.dir, &pkg.manifest_file, &pkg.owner, "verify", root_key, &missing, kind, name, version);
        match patch_integration_root_verified(&pkg.dir, root_key, root_path, false, true, Some(&verify)) {
            Ok(r) => receipt_root = r,
            Err(e) => {
                rb.run();
                return Err(match e {
                    RootError::Conflict(m) => AddError::new(m, "ERR_INTEGRATION_ROOT_CONFLICT"),
                    RootError::Other(e) if e.code.is_some() => e,
                    RootError::Other(e) => AddError::new(format!("Failed to write {kind} contribution: {}", e.message), "ERR_WRITE_FAILED"),
                });
            }
        }
    }
    if receipt_root.1 && !files.contains(&manifest_path) {
        files.push(manifest_path.clone());
    }
    Ok(receipt(kind, name, Some(receipt_root), &manifest_path, &files, dry_run))
}

fn component_name_ok(name: &str) -> bool {
    let b = name.as_bytes();
    !b.is_empty() && b[0].is_ascii_uppercase() && b.iter().all(|c| c.is_ascii_alphanumeric())
}

fn topic_ok(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// `findIntegrationComponentDoc({name: owner, components: root, __packageDir}, name)`.
fn find_component_doc(pkg_owner: &str, pkg_dir: &Path, root: &Path, name: &str) -> Option<PathBuf> {
    let integration = crate::discovery::component_discovery::LoadedIntegration {
        name: pkg_owner.to_string(),
        components: Some(root.to_path_buf()),
        package_dir: Some(pkg_dir.to_path_buf()),
        ..Default::default()
    };
    crate::discovery::component_discovery::find_integration_component_doc(&integration, name)
}

fn add_component(name: &str, o: &AddOptions) -> R<Value> {
    let dry = o.dry_run.unwrap_or(false);
    if !component_name_ok(name) {
        return Err(AddError::new(
            format!("Invalid component name \"{name}\": use PascalCase starting with an uppercase letter (e.g. MyWidget)."),
            "ERR_INVALID_ARGUMENT",
        ));
    }
    sanitize_name(name, "component name").map_err(|e| AddError::new(e.message, "ERR_INVALID_ARGUMENT"))?;
    let pkg = resolve_package(&o.cwd)?;
    let manifest = load_current(&pkg)?;
    let declared = manifest_str(&manifest, "components");
    let root_path = declared.clone().unwrap_or_else(|| "./components".into());
    let root = root_within(&root_path, &pkg.dir, "components root")?;
    patch_integration_root(&pkg.dir, "components", &root_path, true, true).map_err(root_err)?;
    let doc_file = within(&format!("{name}.doc.mjs"), &root, "component doc")?;
    let source_file = within(&format!("{name}.tsx"), &root, "component source")?;
    refuse_existing(&pkg.dir, &doc_file)?;
    refuse_existing(&pkg.dir, &source_file)?;
    {
        if let Some(existing) = find_component_doc(&pkg.owner, &pkg.dir, &root, name) {
            return Err(AddError::new(
                format!("Refusing to add component \"{name}\": {} already defines it.", relative(&pkg.dir, &existing)),
                "ERR_FILE_EXISTS",
            ));
        }
    }
    let source_path = relative(&pkg.dir, &source_file);
    let extless = strip_ts_ext(&source_path);
    let import_spec = format!("{}/{}", pkg.owner, extless);
    let mut q = String::new();
    crate::json::quote(&mut q, &import_spec);
    let doc = format!(
        "/** @type {{import('@astryxdesign/cli/authoring').ComponentDoc}} */\nexport default {{\n  type: 'component',\n  name: '{name}',\n  displayName: '{name}',\n  import: {q},\n  usage: {{description: '{name} component.'}},\n  props: [],\n}};\n"
    );
    let src = format!("export function {name}() {{\n  return <div>{name}</div>;\n}}\n");
    let mut plans = vec![WritePlan::create(doc_file, doc), WritePlan::create(source_file, src)];
    let upd = package_json_update(&pkg.file, &root_path, &basename(&pkg.manifest_file), &[ExportEntry { subpath: extless.clone(), target: source_path.clone() }], false, &[])?;
    push_pkg_update(&mut plans, &pkg.file, upd);
    finish("component", name, &pkg, plans, "components", &root_path, declared.is_none(), dry, None)
}

fn strip_ts_ext(p: &str) -> String {
    if let Some(s) = p.strip_suffix(".tsx") {
        return s.to_string();
    }
    if let Some(s) = p.strip_suffix(".ts") {
        return s.to_string();
    }
    p.to_string()
}

fn is_namespace_name(s: &str) -> bool {
    !s.is_empty() && s.split('-').all(|p| !p.is_empty() && p.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
}

fn add_doc(name: &str, o: &AddOptions) -> R<Value> {
    let dry = o.dry_run.unwrap_or(false);
    let bad = |m: String| AddError::new(m, "ERR_INVALID_ARGUMENT");
    if !topic_ok(name) {
        return Err(bad(format!("Invalid topic name \"{name}\": use letters, digits, _ and - only.")));
    }
    if o.replaces.is_some() && o.extends.is_some() {
        return Err(bad("A topic either replaces another or extends it, not both.".into()));
    }
    if o.parent.is_some() && (o.replaces.is_some() || o.extends.is_some()) {
        return Err(bad("A guide placed in a namespace has its own route: it cannot also replace or extend a topic.".into()));
    }
    if let Some(p) = &o.parent {
        if !is_namespace_name(p) {
            return Err(bad("--parent must name a namespace in lowercase letters and digits joined by single hyphens, such as \"acme\".".into()));
        }
    }
    for (opt, v) in [("--replaces", &o.replaces), ("--extends", &o.extends)] {
        if let Some(v) = v {
            if !topic_ok(v) {
                return Err(bad(format!("{opt} must name a topic using letters, digits, _ and - only.")));
            }
        }
    }
    let pkg = resolve_package(&o.cwd)?;
    let manifest = load_current(&pkg)?;
    let declared = manifest_str(&manifest, "docs");
    let root_path = declared.clone().unwrap_or_else(|| "./docs".into());
    let root = root_within(&root_path, &pkg.dir, "docs root")?;
    patch_integration_root(&pkg.dir, "docs", &root_path, true, true).map_err(root_err)?;
    let doc_file = within(&format!("{name}.doc.mjs"), &root, "doc topic file")?;
    refuse_existing(&pkg.dir, &doc_file)?;
    let title = kebab_to_title(name);
    let namespace_file = match &o.parent {
        None => None,
        Some(p) => Some(within(&format!("{p}.doc.mjs"), &root, "namespace doc file")?),
    };
    let mut parent_slot = "guides".to_string();
    let mut write_namespace = false;
    if let (Some(parent), Some(nsf)) = (&o.parent, &namespace_file) {
        match find_namespace(&pkg.owner, &root, parent) {
            Some((src, slots)) => {
                let takes: Vec<String> = slots;
                let slot = if takes.iter().any(|s| s == "guides") {
                    Some("guides".to_string())
                } else if takes.len() == 1 {
                    Some(takes[0].clone())
                } else {
                    None
                };
                match slot {
                    Some(s) => parent_slot = s,
                    None => {
                        return Err(bad(if takes.is_empty() {
                            format!("Namespace \"{parent}\" ({src}) has no slot that takes a guide. Add one, such as guides: {{title: 'Guides', accepts: {{kinds: ['generic']}}}}.")
                        } else {
                            format!(
                                "Namespace \"{parent}\" ({src}) has more than one slot that takes a guide ({}). Write the guide yourself, and name its slot in its placement.",
                                takes.join(", ")
                            )
                        }));
                    }
                }
            }
            None if nsf.exists() => {
                return Err(AddError::new(
                    format!(
                        "{} exists but does not load as the namespace \"{parent}\". Fix or rename that file, or pass another --parent.",
                        relative(&pkg.dir, nsf)
                    ),
                    "ERR_FILE_EXISTS",
                ))
            }
            None => write_namespace = true,
        }
    }
    let relationship = if let Some(r) = &o.replaces {
        format!("\n  replaces: '{r}',")
    } else if let Some(e) = &o.extends {
        format!("\n  extends: '{e}',")
    } else if let Some(p) = &o.parent {
        format!("\n  placement: {{parent: 'namespace:{p}', slot: '{parent_slot}'}},")
    } else {
        String::new()
    };
    let doc = format!(
        "/** @type {{import('@astryxdesign/cli/authoring').ReferenceDoc}} */\nexport default {{\n  type: 'generic',\n  name: '{name}',\n  title: '{title}',\n  description: '{title} documentation.',{relationship}\n  sections: [\n    {{\n      title: 'Overview',\n      content: [\n        {{ type: 'prose', text: '{title} documentation.' }},\n      ],\n    }},\n  ],\n}};\n"
    );
    let mut plans = vec![WritePlan::create(doc_file, doc)];
    if let (Some(nsf), true, Some(parent)) = (&namespace_file, write_namespace, &o.parent) {
        let nt = kebab_to_title(parent);
        plans.push(WritePlan::create(
            nsf.clone(),
            format!(
                "/** @type {{import('@astryxdesign/cli/authoring').NamespaceDoc}} */\nexport default {{\n  type: 'namespace',\n  name: '{parent}',\n  title: '{nt}',\n  summary: 'Guides for {nt}.',\n  slots: {{\n    guides: {{title: 'Guides', accepts: {{kinds: ['generic']}}}},\n  }},\n}};\n"
            ),
        ));
    }
    let mut upd = package_json_update(&pkg.file, &root_path, &basename(&pkg.manifest_file), &[], false, &[])?;
    if o.parent.is_some() {
        let (expected, text) = match &upd {
            Some(u) => (u.expected_original.clone(), u.contents.clone()),
            None => {
                let b = fs::read(&pkg.file).map_err(|e| AddError::plain(e.to_string()))?;
                let t = String::from_utf8_lossy(&b).to_string();
                (b, t)
            }
        };
        let current = jsjson::parse(&text).map_err(AddError::plain)?;
        if cli_requirement::docs_tree_cli_problem(&current).is_some() {
            let next = cli_requirement::with_cli_peer(&current, cli_requirement::NAMESPACE_DOCS_CLI);
            let mut contents = crate::json::stringify(&next, 2);
            if text.ends_with('\n') {
                contents.push('\n');
            }
            upd = Some(PackageJsonUpdate { contents, expected_original: expected });
        }
    }
    push_pkg_update(&mut plans, &pkg.file, upd);
    finish("doc", name, &pkg, plans, "docs", &root_path, declared.is_none(), dry, None)
}

/// The namespace `name` among `discoverIntegrationDocs({name: owner, docs: root})`:
/// its source, and the slots that take a guide (accept kind `generic`).
fn find_namespace(owner: &str, root: &Path, name: &str) -> Option<(String, Vec<String>)> {
    let mut integration = crate::discovery::integrations::Record::new();
    integration.insert("name".into(), Value::String(owner.to_string()));
    integration.insert("docs".into(), Value::String(root.to_string_lossy().into_owned()));
    let docs = crate::discovery::docs_discovery::discover_integration_docs(&integration);
    let ns = docs.namespaces.into_iter().find(|ns| ns.get("doc").and_then(|d| d.get("name")).and_then(|n| n.as_str()) == Some(name))?;
    let mut slots = Vec::new();
    if let Some(Value::Object(m)) = ns.get("doc").and_then(|d| d.get("slots")) {
        for (k, s) in m {
            let kinds = s.get("accepts").and_then(|a| a.get("kinds")).and_then(|k| k.as_array());
            if kinds.map(|k| k.iter().any(|x| x.as_str() == Some("generic"))).unwrap_or(false) {
                slots.push(k.clone());
            }
        }
    }
    Some((ns.get("source").and_then(|v| v.as_str()).unwrap_or("").to_string(), slots))
}

fn kebab_to_pascal(slug: &str) -> String {
    let mut out = String::new();
    let mut up = true;
    for c in slug.chars() {
        if c == '-' {
            up = true;
            continue;
        }
        if up && (c.is_ascii_lowercase() || c.is_ascii_digit()) {
            out.push(c.to_ascii_uppercase());
            up = false;
        } else {
            if up {
                // A separator followed by a character the JS regex does not
                // capture keeps the hyphen.
                out.push('-');
            }
            out.push(c);
            up = false;
        }
    }
    out
}

fn add_template(name: &str, o: &AddOptions) -> R<Value> {
    let dry = o.dry_run.unwrap_or(false);
    let ttype = o.template_type.clone().unwrap_or_else(|| "page".into());
    if !is_kebab(name) {
        return Err(AddError::new(format!("Invalid template name \"{name}\": use lowercase kebab-case starting with a letter."), "ERR_INVALID_ARGUMENT"));
    }
    if ttype != "page" && ttype != "block" {
        return Err(AddError::new(format!("Invalid template type \"{ttype}\": must be \"page\" or \"block\"."), "ERR_INVALID_ARGUMENT"));
    }
    let pkg = resolve_package(&o.cwd)?;
    let manifest = load_current(&pkg)?;
    let declared = manifest_str(&manifest, "templates");
    let root_path = declared.clone().unwrap_or_else(|| "./templates".into());
    let root = root_within(&root_path, &pkg.dir, "templates root")?;
    patch_integration_root(&pkg.dir, "templates", &root_path, true, true).map_err(root_err)?;
    let spec_file = within(&format!("{name}.doc.mjs"), &root, "template descriptor")?;
    let source_file = within(&format!("{name}.tsx"), &root, "template source")?;
    refuse_existing(&pkg.dir, &spec_file)?;
    refuse_existing(&pkg.dir, &source_file)?;
    let pascal = kebab_to_pascal(name);
    let source_path = relative(&pkg.dir, &source_file);
    let extless = strip_ts_ext(&source_path);
    let block = if ttype == "block" { "\n  aspectRatio: 1," } else { "" };
    let title = kebab_to_title(name);
    let spec = format!(
        "/** @type {{import('@astryxdesign/cli/authoring').IntegrationTemplateDoc}} */\nexport default {{\n  type: '{ttype}',\n  name: '{name}',\n  displayName: '{title}',\n  description: '{title} template.',{block}\n}};\n"
    );
    let src = format!("export default function {pascal}() {{\n  return <div>{title}</div>;\n}}\n");
    let mut plans = vec![WritePlan::create(spec_file, spec), WritePlan::create(source_file, src)];
    let upd = package_json_update(&pkg.file, &root_path, &basename(&pkg.manifest_file), &[ExportEntry { subpath: extless, target: source_path }], false, &[])?;
    push_pkg_update(&mut plans, &pkg.file, upd);
    finish("template", name, &pkg, plans, "templates", &root_path, declared.is_none(), dry, None)
}

/// `isValidSemver`: an exact MAJOR.MINOR.PATCH with optional prerelease and
/// build metadata.
pub fn is_valid_semver(v: &str) -> bool {
    crate::commands::integration::semver::is_valid(v)
}

fn add_codemod(name: &str, o: &AddOptions) -> R<Value> {
    let dry = o.dry_run.unwrap_or(false);
    let to = o.to.clone().unwrap_or_default();
    if to.is_empty() || !is_valid_semver(&to) {
        return Err(AddError::new(
            format!("--to is required and must be an exact semver version (e.g. 1.0.0). Received: \"{to}\""),
            "ERR_INVALID_ARGUMENT",
        ));
    }
    if !is_kebab(name) {
        return Err(AddError::new(format!("Invalid codemod id \"{name}\": use lowercase kebab-case starting with a letter."), "ERR_INVALID_ARGUMENT"));
    }
    let pkg = resolve_package(&o.cwd)?;
    let manifest = load_current(&pkg)?;
    let declared = manifest_str(&manifest, "codemods");
    let root_path = declared.clone().unwrap_or_else(|| "./codemods".into());
    let root = root_within(&root_path, &pkg.dir, "codemods root")?;
    patch_integration_root(&pkg.dir, "codemods", &root_path, true, true).map_err(root_err)?;
    let version_dir = within(&to, &root, "codemod version dir")?;
    let file = within(&format!("{name}.mjs"), &version_dir, "codemod file")?;
    refuse_existing(&pkg.dir, &file)?;
    let title = kebab_to_title(name);
    let contents = format!(
        "export default {{\n  type: 'code',\n  title: '{title}',\n  transform(file, api) {{\n    // Replace this with your transform logic.\n    return file.source;\n  }},\n}};\n"
    );
    let mut plans = vec![WritePlan::create(file, contents)];
    let upd = package_json_update(&pkg.file, &root_path, &basename(&pkg.manifest_file), &[], false, &[])?;
    push_pkg_update(&mut plans, &pkg.file, upd);
    finish("codemod", name, &pkg, plans, "codemods", &root_path, declared.is_none(), dry, Some(&to))
}

fn add_agent_doc(line: &str, o: &AddOptions) -> R<Value> {
    let dry = o.dry_run.unwrap_or(false);
    super::agent_docs::check_append(&[line.to_string()], "agentDocs").map_err(|m| AddError::new(m, "ERR_INVALID_ARGUMENT"))?;
    let pkg = resolve_package(&o.cwd)?;
    let manifest_path = relative(&pkg.dir, &pkg.manifest_file);
    let mut current: Vec<String> = Vec::new();
    if pkg.manifest_exists {
        let m = load_manifest_value(&pkg.manifest_file).map_err(|e| AddError::new(format!("Cannot update agentDocs: {}", e.message), "ERR_INVALID_ARGUMENT"))?;
        if let Some(ad) = m.get("agentDocs") {
            super::agent_docs::check_field(ad, &format!("Integration manifest {} field \"agentDocs\"", basename(&pkg.manifest_file)))
                .map_err(|e| AddError::new(format!("Cannot update agentDocs: {e}"), "ERR_INVALID_ARGUMENT"))?;
            if let Some(Value::Array(a)) = ad.get("append") {
                current = a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect();
            }
        }
    }
    if current.iter().any(|l| l == line) {
        let mut r = receipt("agent-doc", line, None, &manifest_path, &[], dry);
        r["data"]["written"] = Value::Bool(false);
        return Ok(r);
    }
    let mut next_append = current.clone();
    next_append.push(line.to_string());
    super::agent_docs::check_append(&next_append, "agentDocs").map_err(|m| AddError::new(format!("Cannot add agent-doc line: {m}"), "ERR_INVALID_ARGUMENT"))?;
    let source = if pkg.manifest_exists {
        fs::read_to_string(&pkg.manifest_file).map_err(|e| AddError::plain(e.to_string()))?
    } else {
        "export default {};\n".to_string()
    };
    let next = add_agent_doc_source(&source, &basename(&pkg.manifest_file), line, current.len()).map_err(|m| AddError::new(m, "ERR_WRITE_FAILED"))?;
    let mut plans = vec![WritePlan {
        path: pkg.manifest_file.clone(),
        contents: next.into_bytes(),
        create_only: !pkg.manifest_exists,
        expected_original: if pkg.manifest_exists { Some(source.into_bytes()) } else { None },
    }];
    let upd = package_json_files_update(&pkg.file, &[manifest_path.clone()], &[], false, &[])?;
    push_pkg_update(&mut plans, &pkg.file, upd);
    let files: Vec<String> = plans.iter().map(|p| relative(&pkg.dir, &p.path)).collect();
    if dry {
        return Ok(receipt("agent-doc", line, None, &manifest_path, &files, true));
    }
    apply_writes(&plans)?;
    Ok(receipt("agent-doc", line, None, &manifest_path, &files, false))
}

/// `integrationAdd(kind, name, options)`.
pub fn integration_add(kind: &str, name: &str, o: &AddOptions) -> R<Value> {
    if !KINDS.contains(&kind) {
        return Err(AddError::new(
            format!("Unknown contribution kind \"{kind}\". Choose component, doc, template, codemod, agent-doc, or theme."),
            "ERR_INVALID_ARGUMENT",
        ));
    }
    let present: [(&str, bool); 8] = [
        ("cwd", true),
        ("dryRun", o.dry_run.is_some()),
        ("templateType", o.template_type.is_some()),
        ("replaces", o.replaces.is_some()),
        ("extends", o.extends.is_some()),
        ("parent", o.parent.is_some()),
        ("to", o.to.is_some()),
        ("from", o.from.is_some()),
    ];
    for (k, set) in present {
        if set && !allowed(kind).contains(&k) {
            return Err(AddError::new(format!("Option \"{k}\" does not apply to integration kind \"{kind}\"."), "ERR_INVALID_ARGUMENT"));
        }
    }
    match kind {
        "component" => add_component(name, o),
        "doc" => add_doc(name, o),
        "template" => add_template(name, o),
        "codemod" => add_codemod(name, o),
        "agent-doc" => add_agent_doc(name, o),
        _ => super::add_theme::add_theme(name, o),
    }
}
