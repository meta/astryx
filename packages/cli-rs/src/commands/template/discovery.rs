//! Template discovery across Core, external packages and integrations.
//! Port of foundation/discovery/template-adapter.mjs (discovery side).

use super::fsutil;
use crate::json::Value;
use std::path::Path;
use std::sync::OnceLock;

pub const CORE_PACKAGE: &str = "@astryxdesign/core";

#[derive(Debug, Clone, Default)]
pub struct Template {
    pub kind: String, // "page" | "block"
    pub dir_name: String,
    pub name: String,
    pub display_name: Option<String>,
    pub description: String,
    pub keywords: Vec<String>,
    pub category: String,
    pub is_ready: bool,
    pub scaffold: Option<bool>,
    pub aspect_ratio: Option<Value>,
    pub example_for: Option<String>,
    pub also_example_for: Option<Value>,
    pub also_showcase_for: Option<Value>,
    pub components_used: Option<Value>,
    pub icons: Option<Value>,
    pub is_showcase: Option<bool>,
    pub file_path: String,
    pub doc_path: String,
    pub package: Option<String>,
    pub autolinked: bool,
    pub replaces: Option<String>,
    pub replacement_rejected: bool,
    pub replacement_target: Option<String>,
}

/// A template discovery or replacement error.
#[derive(Debug, Clone, Default)]
pub struct TemplateError {
    pub package: String,
    pub template: Option<String>,
    pub message: String,
    pub code: Option<String>,
    pub severity: Option<String>,
    pub replacement_target: Option<String>,
    pub autolinked: bool,
}

impl Template {
    pub fn pkg(&self) -> &str {
        self.package.as_deref().unwrap_or(CORE_PACKAGE)
    }
    pub fn lookup_ids(&self) -> Vec<&str> {
        match &self.replaces {
            Some(r) if r != &self.dir_name => vec![self.dir_name.as_str(), r.as_str()],
            _ => vec![self.dir_name.as_str()],
        }
    }
}

fn embedded() -> &'static serde_json::Map<String, Value> {
    static E: OnceLock<serde_json::Map<String, Value>> = OnceLock::new();
    E.get_or_init(|| {
        let s = include_str!("embedded_templates.json");
        match serde_json::from_str::<Value>(s) {
            Ok(Value::Object(m)) => m,
            _ => serde_json::Map::new(),
        }
    })
}

fn templates_dir(cli_root: &Path) -> String {
    fsutil::path_str(&cli_root.join("assets").join("templates"))
}

/// A CLI-owned template doc's view, by absolute path.
fn core_doc(cli_root: &Path, doc_path: &str) -> Option<Value> {
    let rel = fsutil::relative(&templates_dir(cli_root), doc_path);
    match embedded().get(&rel) {
        Some(Value::Null) | None => None,
        Some(v) => Some(v.clone()),
    }
}

fn s(doc: &Option<Value>, k: &str) -> Option<String> {
    doc.as_ref().and_then(|d| d.get(k)).and_then(|v| v.as_str()).map(|s| s.to_string())
}
/// `doc?.k || fallback` for strings.
fn s_or(doc: &Option<Value>, k: &str, fallback: &str) -> String {
    match s(doc, k) {
        Some(v) if !v.is_empty() => v,
        _ => fallback.to_string(),
    }
}
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map_or(false, |f| f != 0.0 && !f.is_nan()),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
fn get(doc: &Option<Value>, k: &str) -> Option<Value> {
    doc.as_ref().and_then(|d| d.get(k)).filter(|v| !v.is_null()).cloned()
}
fn b_or(doc: &Option<Value>, k: &str, d: bool) -> bool {
    match get(doc, k) {
        Some(Value::Bool(b)) => b,
        Some(v) => truthy(&v),
        None => d,
    }
}
fn strs(v: Option<Value>) -> Vec<String> {
    match v {
        Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect(),
        _ => Vec::new(),
    }
}

/// Directory entries in `fs.readdirSync` order (byte order), with whether each
/// is a real directory (a symlink is not, as with `Dirent#isDirectory`).
pub fn read_dir_sorted(dir: &str) -> Vec<(String, bool)> {
    let mut out: Vec<(String, bool)> = match std::fs::read_dir(dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .map(|e| {
                let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
                (e.file_name().to_string_lossy().into_owned(), is_dir)
            })
            .collect(),
        Err(_) => Vec::new(),
    };
    out.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));
    out
}

const ALL_SUFFIXES: &[&str] = &[".template.ts", ".template.mjs", ".template.js", ".doc.ts", ".doc.mjs", ".doc.js"];

pub fn matched_suffix(file: &str) -> Option<&'static str> {
    ALL_SUFFIXES.iter().find(|s| file.ends_with(*s)).copied()
}

fn is_template_suffix_re(name: &str) -> bool {
    // /\.(template|doc)\.(ts|mjs|js)$/
    ALL_SUFFIXES.iter().any(|s| name.ends_with(s))
}

pub fn find_doc_files_any(dir: &str) -> Vec<String> {
    find_doc_files(dir)
}

fn find_doc_files(dir: &str) -> Vec<String> {
    let mut out = Vec::new();
    if !Path::new(dir).exists() {
        return out;
    }
    for (name, is_dir) in read_dir_sorted(dir) {
        let full = fsutil::join(dir, &name);
        if is_dir {
            out.extend(find_doc_files(&full));
        } else if is_template_suffix_re(&name) {
            out.push(full);
        }
    }
    out
}

pub fn discover_pages(cli_root: &Path) -> Vec<Template> {
    let pages = fsutil::join(&templates_dir(cli_root), "pages");
    let mut out = Vec::new();
    for (name, is_dir) in read_dir_sorted(&pages) {
        if !is_dir {
            continue;
        }
        let dir_path = fsutil::join(&pages, &name);
        let doc_path = ALL_SUFFIXES
            .iter()
            .map(|s| fsutil::join(&dir_path, &format!("template{s}")))
            .find(|c| Path::new(c).exists())
            .unwrap_or_else(|| fsutil::join(&dir_path, "template.doc.mjs"));
        let doc = if Path::new(&doc_path).exists() { core_doc(cli_root, &doc_path) } else { None };
        out.push(Template {
            kind: "page".into(),
            dir_name: name.clone(),
            name: s_or(&doc, "name", &name),
            description: s_or(&doc, "description", ""),
            category: s_or(&doc, "category", ""),
            keywords: strs(get(&doc, "keywords")),
            is_ready: b_or(&doc, "isReady", true),
            scaffold: Some(b_or(&doc, "scaffold", false)),
            icons: get(&doc, "icons").filter(truthy),
            file_path: fsutil::join(&dir_path, "page.tsx"),
            doc_path,
            ..Default::default()
        });
    }
    out
}

fn block_from(doc: &Option<Value>, basename: &str, tsx: String, doc_path: String, rel: String, package: Option<String>) -> Template {
    Template {
        kind: "block".into(),
        dir_name: basename.to_string(),
        name: s_or(doc, "name", basename),
        description: s_or(doc, "description", ""),
        keywords: strs(get(doc, "keywords")),
        is_ready: b_or(doc, "isReady", true),
        aspect_ratio: Some(get(doc, "aspectRatio").unwrap_or(Value::from(1))),
        components_used: Some(get(doc, "componentsUsed").unwrap_or(Value::Array(vec![]))),
        icons: get(doc, "icons").filter(truthy),
        is_showcase: Some(b_or(doc, "isShowcase", false)),
        example_for: s(doc, "exampleFor"),
        file_path: tsx,
        doc_path,
        category: rel,
        package,
        ..Default::default()
    }
}

pub fn discover_blocks(cli_root: &Path) -> Vec<Template> {
    let blocks_dir = fsutil::join(&templates_dir(cli_root), "blocks");
    let mut out = Vec::new();
    for doc_path in find_doc_files(&blocks_dir) {
        let Some(suffix) = matched_suffix(&doc_path) else { continue };
        let base = fsutil::basename(&doc_path);
        let basename = base[..base.len() - suffix.len()].to_string();
        let tsx = fsutil::join(&fsutil::dirname(&doc_path), &format!("{basename}.tsx"));
        if !Path::new(&tsx).exists() {
            continue;
        }
        let doc = core_doc(cli_root, &doc_path);
        let rel = fsutil::relative(&blocks_dir, &fsutil::dirname(&doc_path));
        out.push(block_from(&doc, &basename, tsx, doc_path, rel, None));
    }
    out
}

/// `discoverExternalPackages`: packages with `astryx.docs` in the nearest
/// `node_modules` (real directories only, as `Dirent#isDirectory`).
// TEMP: replace with src/discovery paths::discover_external_packages when it lands.
pub fn external_packages(cwd: &str) -> Vec<(String, Option<String>)> {
    let mut dir = cwd.to_string();
    let mut nm = None;
    for _ in 0..5 {
        let c = fsutil::join(&dir, "node_modules");
        if Path::new(&c).exists() {
            nm = Some(c);
            break;
        }
        let p = fsutil::dirname(&dir);
        if p == dir {
            break;
        }
        dir = p;
    }
    let mut out = Vec::new();
    fn scan(d: &str, out: &mut Vec<(String, Option<String>)>) {
        if !Path::new(d).exists() {
            return;
        }
        for (name, is_dir) in read_dir_sorted(d) {
            if !is_dir || name.starts_with('.') {
                continue;
            }
            let full = fsutil::join(d, &name);
            if name.starts_with('@') {
                scan(&full, out);
                continue;
            }
            let pj = fsutil::join(&full, "package.json");
            let Ok(text) = std::fs::read_to_string(&pj) else { continue };
            let Ok(pkg) = serde_json::from_str::<Value>(&text) else { continue };
            let pname = pkg.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if pname == CORE_PACKAGE {
                continue;
            }
            let ax = pkg.get("astryx");
            if ax.and_then(|a| a.get("docs")).map_or(false, truthy) {
                let blocks = ax
                    .and_then(|a| a.get("blocks"))
                    .filter(|v| truthy(v))
                    .and_then(|v| v.as_str())
                    .map(|b| fsutil::resolve(&full, b));
                out.push((pname, blocks));
            }
        }
    }
    if let Some(nm) = nm {
        scan(&nm, &mut out);
    }
    out
}

pub fn discover_external_blocks(cwd: &str) -> Vec<Template> {
    let mut out = Vec::new();
    for (pkg, blocks_dir) in external_packages(cwd) {
        let Some(bd) = blocks_dir else { continue };
        if !Path::new(&bd).exists() {
            continue;
        }
        for doc_path in find_doc_files(&bd) {
            let Some(suffix) = matched_suffix(&doc_path) else { continue };
            let base = fsutil::basename(&doc_path);
            let basename = base[..base.len() - suffix.len()].to_string();
            let tsx = fsutil::join(&fsutil::dirname(&doc_path), &format!("{basename}.tsx"));
            if !Path::new(&tsx).exists() {
                continue;
            }
            let doc = super::integration::load_template_doc_lenient(&doc_path);
            let rel = fsutil::relative(&bd, &fsutil::dirname(&doc_path));
            out.push(block_from(&doc, &basename, tsx, doc_path, rel, Some(pkg.clone())));
        }
    }
    out
}

pub fn discover_core(cli_root: &Path) -> Vec<Template> {
    let mut v = discover_pages(cli_root);
    v.extend(discover_blocks(cli_root));
    v
}

fn all_sources(cli_root: &Path, cwd: &str) -> (Vec<Template>, Vec<TemplateError>) {
    let mut v = discover_core(cli_root);
    v.extend(discover_external_blocks(cwd));
    let (t, e) = super::integration::discover_integration_templates(cwd);
    v.extend(t);
    (v, e)
}

pub fn locale_compare(a: &str, b: &str) -> std::cmp::Ordering {
    crate::text::locale_compare(a, b)
}

fn sort_by_name(v: &mut [Template]) {
    v.sort_by(|a, b| locale_compare(&a.name, &b.name));
}

pub fn discover_all_unresolved(cli_root: &Path, cwd: &str) -> Vec<Template> {
    let mut v = all_sources(cli_root, cwd).0;
    sort_by_name(&mut v);
    v
}

pub fn discover_all_resolved(cli_root: &Path, cwd: &str) -> Vec<Template> {
    // Read-only operations (search, build) ask for this more than once.
    let key = format!("templates\0{}\0{cwd}", cli_root.display());
    crate::discovery::listing_cache::once_per_listing(&key, || read_all_resolved(cli_root, cwd)).as_ref().clone()
}

fn read_all_resolved(cli_root: &Path, cwd: &str) -> Vec<Template> {
    let (v, errors) = all_sources(cli_root, cwd);
    let decl: Vec<TemplateError> = errors.into_iter().filter(|e| e.replacement_target.is_some()).collect();
    apply_replacements_with_errors(v, decl).0
}

pub fn discover_all(cli_root: &Path, cwd: &str) -> Vec<Template> {
    effective(discover_all_resolved(cli_root, cwd))
}

/// `effectiveTemplateDiscovery`.
pub fn effective(templates: Vec<Template>) -> Vec<Template> {
    use std::collections::HashSet;
    let active: HashSet<String> =
        templates.iter().filter_map(|t| t.replaces.as_ref().map(|r| format!("{}:{}", t.kind, r))).collect();
    let core: HashSet<String> =
        templates.iter().filter(|t| t.pkg() == CORE_PACKAGE).map(|t| format!("{}:{}", t.kind, t.dir_name)).collect();
    templates
        .into_iter()
        .filter(|t| {
            let key = format!("{}:{}", t.kind, t.dir_name);
            if t.replacement_rejected && t.replacement_target.as_deref() == Some(t.dir_name.as_str()) && core.contains(&key) {
                return false;
            }
            !active.contains(&key) || t.replaces.is_some()
        })
        .collect()
}

/// `applyTemplateReplacements` without the errors.
pub fn apply_replacements(templates: Vec<Template>) -> Vec<Template> {
    apply_replacements_with_errors(templates, Vec::new()).0
}

/// `applyTemplateReplacements(templates, declarationErrors)`.
pub fn apply_replacements_with_errors(templates: Vec<Template>, declaration_errors: Vec<TemplateError>) -> (Vec<Template>, Vec<TemplateError>) {
    use indexmap::IndexMap;
    let mut core_by_id: IndexMap<String, Vec<usize>> = IndexMap::new();
    let mut by_target: IndexMap<String, Vec<usize>> = IndexMap::new();
    for (i, t) in templates.iter().enumerate() {
        if t.pkg() == CORE_PACKAGE {
            core_by_id.entry(t.dir_name.clone()).or_default().push(i);
        }
        if let Some(r) = &t.replaces {
            by_target.entry(r.clone()).or_default().push(i);
        }
    }
    let mut errors: Vec<TemplateError> = declaration_errors
        .into_iter()
        .map(|mut e| {
            e.code.get_or_insert_with(|| "invalid_template_replacement".into());
            e.severity.get_or_insert_with(|| "error".into());
            e
        })
        .collect();
    fn push(errors: &mut Vec<TemplateError>, e: TemplateError) {
        if errors.iter().any(|x| x.code == e.code && x.package == e.package && x.template == e.template && x.message == e.message) {
            return;
        }
        errors.push(e);
    }
    let mut active = std::collections::HashSet::new();
    let mut replaced = std::collections::HashSet::new();
    for (target, reps) in &by_target {
        let target_errors: Vec<TemplateError> =
            errors.iter().filter(|e| e.replacement_target.as_deref() == Some(target.as_str())).cloned().collect();
        let explicit = reps.iter().any(|&i| !templates[i].autolinked) || target_errors.iter().any(|e| !e.autolinked);
        let contenders: Vec<usize> =
            if explicit { reps.iter().copied().filter(|&i| !templates[i].autolinked).collect() } else { reps.clone() };
        let mut invalid = target_errors
            .iter()
            .any(|e| e.severity.as_deref() == Some("error") && (!explicit || !e.autolinked));
        let mut by_pkg: IndexMap<String, Vec<usize>> = IndexMap::new();
        for &i in reps {
            by_pkg.entry(templates[i].pkg().to_string()).or_default().push(i);
        }
        for (pkg, decls) in &by_pkg {
            if decls.len() < 2 {
                continue;
            }
            if !explicit || !templates[decls[0]].autolinked {
                invalid = true;
            }
            let message = format!(
                "{pkg} declares {} templates as replacements for Core template \"{target}\" ({}). One package must declare at most one replacement for a Core target.",
                decls.len(),
                decls.iter().map(|&i| templates[i].dir_name.clone()).collect::<Vec<_>>().join(", ")
            );
            for &d in decls {
                push(&mut errors, TemplateError {
                    code: Some("ambiguous_template_replacement".into()),
                    severity: Some("error".into()),
                    package: pkg.clone(),
                    template: Some(templates[d].dir_name.clone()),
                    replacement_target: Some(target.clone()),
                    autolinked: templates[d].autolinked,
                    message: message.clone(),
                });
            }
        }
        let core = core_by_id.get(target).cloned().unwrap_or_default();
        let mut matched: std::collections::HashMap<usize, usize> = Default::default();
        for &i in reps {
            let t = &templates[i];
            let affects = !explicit || !t.autolinked;
            if core.is_empty() {
                if affects {
                    invalid = true;
                }
                push(&mut errors, TemplateError {
                    code: Some("missing_template_replacement_target".into()),
                    severity: Some("error".into()),
                    package: t.pkg().to_string(),
                    template: Some(t.dir_name.clone()),
                    replacement_target: Some(target.clone()),
                    autolinked: t.autolinked,
                    message: format!("Template \"{}\" replaces \"{target}\", which is not a Core template id.", t.dir_name),
                });
                continue;
            }
            let same: Vec<usize> = core.iter().copied().filter(|&c| templates[c].kind == t.kind).collect();
            if same.len() != 1 {
                if affects {
                    invalid = true;
                }
                let kinds = core.iter().map(|&c| templates[c].kind.clone()).collect::<Vec<_>>().join(", ");
                push(&mut errors, TemplateError {
                    code: Some("invalid_template_replacement".into()),
                    severity: Some("error".into()),
                    package: t.pkg().to_string(),
                    template: Some(t.dir_name.clone()),
                    replacement_target: Some(target.clone()),
                    autolinked: t.autolinked,
                    message: format!(
                        "Template \"{}\" is a {} template, but Core template \"{target}\" is {}. A replacement must have the same type.",
                        t.dir_name,
                        t.kind,
                        if kinds.is_empty() { "not available".to_string() } else { kinds }
                    ),
                });
                continue;
            }
            matched.insert(i, same[0]);
        }
        let valid: Vec<usize> = contenders.iter().copied().filter(|i| matched.contains_key(i)).collect();
        if invalid || valid.is_empty() {
            continue;
        }
        let r = *valid.last().unwrap();
        let valid_reps: Vec<usize> = reps.iter().copied().filter(|i| matched.contains_key(i)).collect();
        if valid_reps.len() > 1 {
            let lost = explicit && valid_reps.iter().any(|&c| templates[c].autolinked);
            let all_auto = valid_reps.iter().all(|&c| templates[c].autolinked);
            let pkgs = valid_reps.iter().map(|&c| templates[c].pkg().to_string()).collect::<Vec<_>>().join(", ");
            let winner = templates[r].pkg().to_string();
            let message = if lost {
                format!("Core template \"{target}\" is replaced by {pkgs}. {winner} is explicitly configured, so it wins over autolinked integrations.")
            } else if all_auto {
                format!("Core template \"{target}\" is replaced by autolinked dependencies {pkgs}. {winner} is listed later in package.json dependencies, so it wins. Add the intended package to astryx.config integrations to make precedence explicit.")
            } else {
                format!("Core template \"{target}\" is replaced by {pkgs}. {winner} is configured later, so it wins.")
            };
            push(&mut errors, TemplateError {
                code: Some("ambiguous_template_replacement".into()),
                severity: Some("warning".into()),
                package: winner,
                template: Some(templates[r].dir_name.clone()),
                replacement_target: Some(target.clone()),
                autolinked: templates[r].autolinked,
                message,
            });
        }
        active.insert(r);
        replaced.insert(matched[&r]);
    }
    let mut out: Vec<Template> = Vec::new();
    for (i, t) in templates.into_iter().enumerate() {
        if replaced.contains(&i) {
            continue;
        }
        if t.replaces.is_some() && !active.contains(&i) {
            let mut f = t;
            f.replacement_rejected = true;
            f.replacement_target = f.replaces.take();
            out.push(f);
            continue;
        }
        out.push(t);
    }
    sort_by_name(&mut out);
    (out, errors)
}

#[cfg(test)]
mod embedded_tests {
    use super::*;

    /// The embedded docs cover exactly the template docs the CLI ships. Run
    /// `node scripts/gen-template-docs.mjs` when this fails.
    #[test]
    fn embedded_template_docs_are_current() {
        let root = crate::cli::env::cli_root();
        let dir = templates_dir(&root);
        let mut on_disk: Vec<String> = find_doc_files(&dir).iter().map(|f| fsutil::relative(&dir, f)).collect();
        on_disk.sort();
        let mut keys: Vec<String> = embedded().keys().cloned().collect();
        keys.sort();
        assert_eq!(on_disk, keys, "embedded_templates.json is stale: run node scripts/gen-template-docs.mjs");
    }

    #[test]
    fn embedded_bundled_themes_are_current() {
        let root = crate::cli::env::cli_root();
        let themes_dir = root.join("assets").join("templates").join("themes");
        let mut dirs: Vec<String> = read_dir_sorted(&fsutil::path_str(&themes_dir)).into_iter().filter(|(_, d)| *d).map(|(n, _)| n).collect();
        dirs.sort();
        let mut slugs: Vec<String> = crate::commands::theme::discovery::bundled(&root).into_iter().map(|t| t.slug).collect();
        slugs.sort();
        assert_eq!(dirs, slugs, "embedded_themes.json is stale: run node scripts/gen-template-docs.mjs");
    }
}
