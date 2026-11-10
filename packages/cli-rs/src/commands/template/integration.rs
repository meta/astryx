//! Integration-provided templates, the template issue pass, and the
//! integration-issue nudge. Port of discoverIntegrationTemplatesForOne and
//! friends in foundation/discovery/template-adapter.mjs and
//! foundation/integrations/integration-warnings.mjs.

use super::discovery::{find_doc_files_any, matched_suffix, Template, TemplateError};
use super::fsutil;
use crate::cli::command::{Invocation, Out};
use crate::discovery::integrations::{self as integ, Record};
use crate::discovery::project::Project;
use crate::json::Value;
use std::path::Path;

fn defined(v: Option<&Value>) -> Option<Value> {
    match v {
        None | Some(Value::Null) => None,
        Some(v) if crate::discovery::docmod::is_undefined(Some(v)) => None,
        Some(v) => Some(v.clone()),
    }
}

fn str_of(doc: &Value, k: &str) -> Option<String> {
    defined(doc.get(k)).and_then(|v| v.as_str().map(String::from))
}

fn truthy_str(doc: &Value, k: &str) -> Option<String> {
    str_of(doc, k).filter(|s| !s.is_empty())
}

/// `loadIntegrationDoc(file, label)`.
fn load_integration_doc(file: &str, label: &str) -> Result<Option<Value>, String> {
    use crate::discovery::doc_read::{read_doc_view, ReadDocOptions};
    let mut o = ReadDocOptions::new("templates");
    o.exports = Some(vec!["default".into()]);
    o.label = Some(label.to_string());
    o.strict = true;
    o.value_parsed = true;
    read_doc_view(file, &o)
}

/// `declaredReplacement(docPath, id)`.
fn declared_replacement(doc_path: &str, id: &str) -> Option<String> {
    if let Ok(Some(doc)) = load_integration_doc(doc_path, &format!("Template \"{id}\"")) {
        return str_of(&doc, "replaces");
    }
    if let Ok(ns) = crate::discovery::docmod::import_doc_module(doc_path) {
        if let Some(raw) = ns.get("default") {
            if raw.is_object() && !crate::discovery::docmod::is_undefined(Some(raw)) {
                return raw.get("replaces").and_then(|v| v.as_str()).map(String::from);
            }
        }
    }
    let text = std::fs::read_to_string(doc_path).ok()?;
    let re = regress::Regex::with_flags(r#"\breplaces\s*:\s*['"]([^'"\n]+)['"]"#, "u").ok()?;
    re.find(&text).map(|m| text[m.group(1).unwrap()].to_string())
}

fn missing_source_fix(doc_path: &str, source_path: &str) -> String {
    let source = fsutil::basename(source_path);
    let stem = &source[..source.len() - ".tsx".len()];
    let dir = fsutil::dirname(source_path);
    let other = [".jsx", ".js", ".ts", ".mjs"].iter().map(|e| format!("{stem}{e}")).find(|f| Path::new(&fsutil::join(&dir, f)).exists());
    match other {
        Some(o) => format!("Found {o}, but a template source must be a .tsx file. Fix: rename {o} to {source}."),
        None => format!(
            "Fix: add {source} beside {}, with the template as its default export.",
            fsutil::basename(doc_path)
        ),
    }
}

fn err(pkg: &str, template: &str, message: String) -> TemplateError {
    TemplateError { package: pkg.into(), template: Some(template.into()), message, ..Default::default() }
}

fn invalid_replacement(pkg: &str, autolinked: bool, id: &str, target: String, why: &str) -> TemplateError {
    TemplateError {
        package: pkg.into(),
        template: Some(id.into()),
        message: format!("Template \"{id}\" replaces \"{target}\", but it cannot be used: {why}."),
        code: Some("invalid_template_replacement".into()),
        severity: Some("error".into()),
        replacement_target: Some(target),
        autolinked,
    }
}

/// `discoverIntegrationTemplatesForOne(integration)`.
pub fn for_one(r: &Record) -> (Vec<Template>, Vec<TemplateError>) {
    let mut templates = Vec::new();
    let mut errors = Vec::new();
    let pkg = integ::s(r, "name").or(integ::s(r, "__spec")).unwrap_or("integration").to_string();
    let autolinked = r.get("__autolinked").and_then(|v| v.as_bool()).unwrap_or(false);
    let Some(root) = integ::s(r, "templates").map(String::from) else { return (templates, errors) };
    if !Path::new(&root).exists() {
        return (templates, errors);
    }
    for doc_path in find_doc_files_any(&root) {
        let Some(suffix) = matched_suffix(&doc_path) else { continue };
        let rel = fsutil::relative(&root, &doc_path);
        let id = rel[..rel.len() - suffix.len()].to_string();
        let source_path = format!("{}.tsx", &doc_path[..doc_path.len() - suffix.len()]);
        if !Path::new(&source_path).exists() {
            errors.push(err(
                &pkg,
                &id,
                format!(
                    "Template \"{id}\" is missing its same-stem source file {}. {}",
                    fsutil::basename(&source_path),
                    missing_source_fix(&doc_path, &source_path)
                ),
            ));
            if let Some(d) = declared_replacement(&doc_path, &id) {
                errors.push(invalid_replacement(
                    &pkg,
                    autolinked,
                    &id,
                    d,
                    &format!("it is missing its same-stem source file {}", fsutil::basename(&source_path)),
                ));
            }
            continue;
        }
        let doc = match load_integration_doc(&doc_path, &format!("Template \"{id}\"")) {
            Ok(d) => d,
            Err(m) => {
                errors.push(err(&pkg, &id, m));
                if let Some(d) = declared_replacement(&doc_path, &id) {
                    errors.push(invalid_replacement(&pkg, autolinked, &id, d, "its metadata does not load"));
                }
                continue;
            }
        };
        let doc = doc.unwrap_or(Value::Null);
        let kind = str_of(&doc, "type").unwrap_or_default();
        if kind != "page" && kind != "block" {
            errors.push(err(
                &pkg,
                &id,
                format!("Template \"{id}\" is missing a \"type\" of \"page\" or \"block\". Stamp the default export with type: 'page' or type: 'block'."),
            ));
            if let Some(d) = str_of(&doc, "replaces").or_else(|| declared_replacement(&doc_path, &id)) {
                errors.push(invalid_replacement(&pkg, autolinked, &id, d, "it has no \"type\""));
            }
            continue;
        }
        let block = kind == "block";
        let arr = |k: &str| defined(doc.get(k)).or(Some(Value::Array(vec![])));
        templates.push(Template {
            kind: kind.clone(),
            dir_name: id.clone(),
            name: truthy_str(&doc, "name").unwrap_or_else(|| id.clone()),
            display_name: str_of(&doc, "displayName"),
            description: truthy_str(&doc, "description").unwrap_or_default(),
            keywords: defined(doc.get("keywords"))
                .and_then(|v| v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()))
                .unwrap_or_default(),
            category: truthy_str(&doc, "category").unwrap_or_default(),
            is_ready: defined(doc.get("isReady")).and_then(|v| v.as_bool()).unwrap_or(true),
            scaffold: Some(defined(doc.get("scaffold")).and_then(|v| v.as_bool()).unwrap_or(false)),
            aspect_ratio: if block { defined(doc.get("aspectRatio")) } else { None },
            example_for: if block { str_of(&doc, "exampleFor") } else { None },
            also_example_for: if block { arr("alsoExampleFor") } else { None },
            also_showcase_for: if block { arr("alsoShowcaseFor") } else { None },
            is_showcase: if block { Some(defined(doc.get("isShowcase")).and_then(|v| v.as_bool()).unwrap_or(false)) } else { None },
            components_used: defined(doc.get("componentsUsed")),
            icons: defined(doc.get("icons")),
            file_path: source_path,
            doc_path: doc_path.clone(),
            package: Some(pkg.clone()),
            autolinked,
            replaces: str_of(&doc, "replaces"),
            ..Default::default()
        });
    }
    // reportSamePackageReplacements
    let mut by_target: indexmap::IndexMap<String, Vec<String>> = indexmap::IndexMap::new();
    for t in &templates {
        if let Some(r) = &t.replaces {
            by_target.entry(r.clone()).or_default().push(t.dir_name.clone());
        }
    }
    for (target, ids) in by_target {
        if ids.len() < 2 {
            continue;
        }
        let message = format!(
            "{pkg} declares {} templates as replacements for Core template \"{target}\" ({}). One package must declare at most one replacement for a Core target.",
            ids.len(),
            ids.join(", ")
        );
        for id in &ids {
            errors.push(TemplateError {
                package: pkg.clone(),
                template: Some(id.clone()),
                message: message.clone(),
                code: Some("ambiguous_template_replacement".into()),
                severity: Some("error".into()),
                replacement_target: Some(target.clone()),
                autolinked,
            });
        }
    }
    (templates, errors)
}

/// `discoverIntegrationTemplates(cwd)`.
pub fn discover_integration_templates(cwd: &str) -> (Vec<Template>, Vec<TemplateError>) {
    let project = match Project::load(cwd) {
        Ok(p) => p,
        Err(m) => {
            return (Vec::new(), vec![TemplateError { package: "astryx.config".into(), message: m, ..Default::default() }]);
        }
    };
    let mut ts = Vec::new();
    let mut es = Vec::new();
    for r in project.contributing() {
        let (t, e) = for_one(r);
        ts.extend(t);
        es.extend(e);
    }
    (ts, es)
}

/// An external package's block doc (template loader, unchecked).
pub fn load_template_doc_lenient(doc_path: &str) -> Option<Value> {
    use crate::discovery::doc_read::{read_doc_view, ReadDocOptions};
    let mut o = ReadDocOptions::new("templates");
    o.loader = crate::discovery::docmod::Loader::Template;
    read_doc_view(doc_path, &o).ok().flatten()
}

/// The template issue pass `Project::issues` runs (Project.templates()).
pub fn template_issue_pass(project: &Project) -> Vec<(String, String, String, String)> {
    let cli_root = crate::cli::env::cli_root();
    let mut templates: Vec<Template> = super::discovery::discover_core(&cli_root);
    let mut out = Vec::new();
    let mut replacement_errors = Vec::new();
    for r in project.contributing() {
        let pkg = Project::package_label(r);
        let (ts, es) = for_one(r);
        for e in es {
            out.push((
                pkg.clone(),
                e.code.clone().unwrap_or_else(|| "invalid_template".into()),
                e.severity.clone().unwrap_or_else(|| "error".into()),
                e.message.clone(),
            ));
            if e.replacement_target.is_some() {
                replacement_errors.push(e);
            }
        }
        templates.extend(ts);
    }
    let (_, errors) = super::discovery::apply_replacements_with_errors(templates, replacement_errors);
    for e in errors {
        out.push((e.package.clone(), e.code.clone().unwrap_or_default(), e.severity.clone().unwrap_or_default(), e.message.clone()));
    }
    out
}

/// Fill `Project::issues`' template pass.
pub fn register() {
    let _ = crate::discovery::project::TEMPLATE_ISSUES.set(template_issue_pass);
}

/// `warnOnIntegrationIssues(project, {json})` after `Project.load(cwd)`.
pub fn warn_on_integration_issues(inv: &Invocation, out: &mut Out) {
    if inv.json() {
        return;
    }
    register();
    let Ok(project) = Project::load(&fsutil::path_str(&inv.cwd)) else { return };
    crate::discovery::integration_warnings::warn_on_integration_issues(&project, false, out);
}
