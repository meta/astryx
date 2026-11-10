//! The docs checks: `authoring-docs`, `cli-docs`, `docs-tree`,
//! `docs-progressive-disclosure` (port of the audits in `api/doctor/doctor.mjs`,
//! `foundation/discovery/{authoring-self-docs,cli-self-docs}.mjs`).
//!
//! The CLI's own docs are read from the embedded module data and the docs
//! lane's tree model, both built from the CLI package.
//! TEMP: section sizes are not measured yet (they need the doc compiler's
//! rendered sections); the CLI's own docs all fit, and a contributed doc
//! larger than one read is not reported. Contributed docs join the tree once
//! discovery's integration docs reader lands.

use super::checks::Ctx;
use super::env::fmt0;
use super::{Check, Status};
use crate::discovery::nodepath as np;
use crate::json::Value;

const AUTHORING_SELF_DOCS: &[&str] = &[
    "integration/integration.doc.mjs",
    "config/config.doc.mjs",
    "debug/debug.doc.mjs",
    "gap-report/gap-report.doc.mjs",
    "discover/discover.doc.mjs",
    "codemod/codemod.doc.mjs",
    "identity/identity.doc.mjs",
    "doctypes/base/graph-fields.doc.mjs",
    "doctypes/component/component.doc.mjs",
    "doctypes/hook/hook.doc.mjs",
    "doctypes/function/function.doc.mjs",
    "doctypes/command/command.doc.mjs",
    "doctypes/enum/enum.doc.mjs",
    "doctypes/namespace/namespace.doc.mjs",
    "doctypes/reference/reference.doc.mjs",
    "doctypes/schema/schema.doc.mjs",
    "doctypes/template/template.doc.mjs",
    "doctypes/template/integration-template.doc.mjs",
    "doctypes/theme/theme.doc.mjs",
    "doctypes/icon-set/icon-set.doc.mjs",
    "doctypes/icon-set/icon-set-data.doc.mjs",
    "doctypes/icon-definition/icon-definition.doc.mjs",
];

const CLI_SELF_DOC_DIRS: &[&str] = &["clients/cli/commands", "api", "authoring", "foundation"];

fn walk_docs(dir: &str, root: &str, skip_dot: bool, out: &mut Vec<String>) {
    let Some(entries) = crate::commands::doctor::support::read_dir_sorted(dir) else { return };
    for e in entries {
        if e.name == "node_modules" || e.name.starts_with("__") || (skip_dot && e.name.starts_with('.')) {
            continue;
        }
        let full = np::join2(dir, &e.name);
        if e.is_dir {
            walk_docs(&full, root, skip_dot, out);
        } else if e.name.ends_with(".doc.mjs") {
            out.push(np::relative(root, &full));
        }
    }
}

/// `readDocView(file, {root: 'self-docs', loader: 'native'})`, as far as the
/// audits read it: the `doc`, `docs` or `default` export.
fn self_doc(file: &str) -> Result<Value, String> {
    let ns = crate::discovery::docmod::import_native_module(file).map_err(|e| e.message)?;
    for k in ["doc", "docs", "default"] {
        if let Some(v) = ns.get(k) {
            if v.is_object() {
                return Ok(v.clone());
            }
        }
    }
    Ok(Value::Null)
}

fn str_field<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(|x| x.as_str())
}

fn experimental(v: &Value) -> bool {
    str_field(v, "stability") == Some("experimental")
}

fn kilobytes(bytes: usize) -> String {
    format!("{} KB", bytes.div_ceil(1024))
}

fn join_problems(p: &[String]) -> String {
    if p.len() == 1 {
        p[0].clone()
    } else {
        format!("{} problems: {}", p.len(), p.join("; "))
    }
}

fn check_authoring_docs() -> Check {
    let id = "authoring-docs";
    let label = "Authoring docs";
    let root = np::join2(&super::env::cli_root(), "authoring");
    let mut found = Vec::new();
    walk_docs(&root, &root, false, &mut found);
    crate::discovery::jsort::sort_strings(&mut found);
    let field_ref = fmt0("docs authoring/field-reference");
    let mut problems: Vec<String> =
        found.iter().filter(|s| !AUTHORING_SELF_DOCS.contains(&s.as_str())).map(|s| format!("{s} is not in `{field_ref}`")).collect();
    let mut sections = 0;
    for source in AUTHORING_SELF_DOCS {
        match self_doc(&np::join2(&root, source)) {
            Ok(doc) if str_field(&doc, "name").is_some() && str_field(&doc, "description").is_some() => {
                if !experimental(&doc) {
                    sections += 1;
                }
            }
            Ok(_) => problems.push(format!("{source} failed to load: exports no doc with a name and a description")),
            Err(e) => problems.push(format!("{source} failed to load: {e}")),
        }
    }
    if !problems.is_empty() {
        return Check::new(id, label, Status::Fail, join_problems(&problems))
            .fix("List every authoring self-doc in AUTHORING_SELF_DOCS, fix the one that fails to load, and split a section that is too large.");
    }
    Check::new(id, label, Status::Pass, format!("All {sections} authoring schemas are readable in `{field_ref}`."))
}

fn check_cli_docs() -> Check {
    let id = "cli-docs";
    let label = "CLI docs";
    let root = super::env::cli_root();
    let mut sources = Vec::new();
    for d in CLI_SELF_DOC_DIRS {
        let dir = np::join2(&root, d);
        if np::exists(&dir) {
            walk_docs(&dir, &root, true, &mut sources);
        }
    }
    crate::discovery::jsort::sort_strings(&mut sources);
    let listed: Vec<String> = AUTHORING_SELF_DOCS.iter().map(|s| format!("authoring/{s}")).collect();
    let field_ref = fmt0("docs authoring/field-reference");
    let docs_cmd = fmt0("docs");
    let (mut docs, mut tree, mut authoring) = (0usize, 0usize, 0usize);
    let (mut x_docs, mut x_tree, mut x_auth) = (0usize, 0usize, 0usize);
    let mut missing = Vec::new();
    let mut unknown = Vec::new();
    let mut misfiled = Vec::new();
    let mut failed = Vec::new();
    for source in &sources {
        let doc = match self_doc(&np::join2(&root, source)) {
            Ok(d) => d,
            Err(e) => {
                failed.push(format!("{source} failed to load: {e}"));
                continue;
            }
        };
        if !matches!(str_field(&doc, "type"), Some("command" | "function" | "schema" | "enum")) {
            continue;
        }
        if str_field(&doc, "name").map(|n| n.is_empty()).unwrap_or(true) {
            failed.push(format!("{source} failed to load: exports no doc with a name"));
            continue;
        }
        docs += 1;
        let in_authoring = listed.contains(source);
        if experimental(&doc) {
            x_docs += 1;
            if in_authoring {
                x_auth += 1;
            }
        }
        let ns = str_field(&doc, "namespace").unwrap_or("");
        if ns.is_empty() {
            missing.push(format!("{source} has no namespace, so no `{docs_cmd}` topic reads it"));
            continue;
        }
        match ns {
            "authoring" => {
                if in_authoring {
                    authoring += 1;
                } else {
                    misfiled.push(format!("{source} has namespace \"authoring\", but `{field_ref}` does not list it"));
                }
            }
            "cli/commands" | "cli/api" => {
                if in_authoring {
                    misfiled.push(format!("{source} is read in `{field_ref}`, but its namespace is \"{ns}\""));
                } else {
                    tree += 1;
                    if experimental(&doc) {
                        x_tree += 1;
                    }
                }
            }
            other => unknown.push(format!("{source} has namespace \"{other}\", which no `{docs_cmd}` topic reads")),
        }
    }
    let problems: Vec<String> = missing.into_iter().chain(unknown).chain(misfiled).chain(failed).collect();
    if !problems.is_empty() {
        return Check::new(id, label, Status::Fail, join_problems(&problems)).fix("Set `namespace` on each CLI doc to the one that reads it: cli/commands for a command, cli/api for an API function or the output schema, error codes, and response types, and authoring for a file an author writes (and list it in AUTHORING_SELF_DOCS).");
    }
    Check::new(
        id,
        label,
        Status::Pass,
        format!(
            "All {} CLI docs are readable: {} in the `{}` tree and {} in `{field_ref}`.",
            docs - x_docs,
            tree - x_tree,
            fmt0("docs cli"),
            authoring - x_auth
        ),
    )
}

struct TreeCounts {
    docs: usize,
    sections: usize,
    roots: usize,
    topics: usize,
}

fn tree_counts() -> TreeCounts {
    let model = crate::commands::docs::api::Docs::load("npm");
    let nodes = &model.tree.nodes;
    let experimental_node = |n: &crate::commands::docs::api::Node| {
        let mut cur = Some(n);
        while let Some(c) = cur {
            if c.experimental() {
                return true;
            }
            cur = c.parent().and_then(|p| model.tree.get(p));
        }
        false
    };
    let counted: Vec<&crate::commands::docs::api::Node> = nodes.iter().filter(|n| !experimental_node(n)).collect();
    let sections = counted.iter().filter(|n| n.kind() == "namespace").count();
    let placed = nodes.iter().filter(|n| n.kind() == "generic" && n.flat_topic().is_none());
    let guides = placed.filter(|n| !experimental_node(n)).count();
    TreeCounts { docs: counted.len() - sections, sections, roots: model.tree.roots().len(), topics: model.topics.len() + guides }
}

/// What the project's integrations add to the docs tree and catalog.
/// TEMP: counted from discovery's integration docs reader until the docs
/// tree takes contributed docs (a topic that extends or replaces another
/// adds nothing).
fn contributed(ctx: &Ctx, counts: &mut TreeCounts) {
    for i in ctx.p.integrations.as_deref().unwrap_or(&[]) {
        let Some(r) = i.as_object() else { continue };
        if !super::util::nullish(r.get("__loadError")) || !super::util::nullish(r.get("__providerConflict")) {
            continue;
        }
        if r.get("docs").and_then(|v| v.as_str()).is_none() {
            continue;
        }
        let d = crate::discovery::docs_discovery::discover_integration_docs(r);
        let new_topics = d.records.iter().filter(|t| t.replaces.is_none() && t.extends_topic.is_none()).count();
        counts.docs += new_topics + d.guides.len();
        counts.sections += d.namespaces.len();
        counts.topics += new_topics + d.guides.len();
    }
}

pub fn run(ctx: &Ctx) -> Vec<Check> {
    let mut counts = tree_counts();
    contributed(ctx, &mut counts);
    let tree = Check::new(
        "docs-tree",
        "Docs tree",
        Status::Pass,
        format!("The docs tree has {} docs in {} sections ({} at the top), each at one route.", counts.docs, counts.sections, counts.roots),
    );
    let mut problems: Vec<String> = Vec::new();
    if let Some(e) = &ctx.p.docs_catalog_error {
        problems.push(format!("The docs catalog could not be built: {e}"));
    }
    for issue in &ctx.p.docs_catalog_issues {
        problems.push(format!(
            "{}: {}",
            issue.get("package").and_then(|v| v.as_str()).unwrap_or("a contributed doc"),
            issue.get("message").map(crate::cli::format::js_string).unwrap_or_default()
        ));
    }
    let budget = kilobytes(32 * 1024);
    let progressive = if problems.is_empty() {
        Check::new(
            "docs-progressive-disclosure",
            "Documentation navigation and size",
            Status::Pass,
            format!("{} topics: every section index and section fits in one {budget} read.", counts.topics),
        )
    } else {
        Check::new("docs-progressive-disclosure", "Documentation navigation and size", Status::Warn, join_problems(&problems))
            .fix("Fix the doc each problem names; split a section that is too large into smaller ones, each with its own key.")
    };
    vec![check_authoring_docs(), check_cli_docs(), tree, progressive]
}
