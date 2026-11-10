//! Port of `foundation/integrations/integration-warnings.mjs`: the stderr
//! warnings everyday commands print when a loaded integration has issues.
//! Owner: the `doctor` lane.

use super::project::Project;
use crate::cli::command::Out;

/// `warnOnIntegrationIssues(project, {json})` for a loaded project: one
/// `Warning:` line per package with issues, and each provider conflict.
pub fn warn_on_integration_issues(project: &Project, json: bool, out: &mut Out) {
    if json {
        return;
    }
    super::validate_contributions::register();
    let mut counts: Vec<(String, usize)> = Vec::new();
    for issue in project.issues() {
        if issue.code == "duplicate_provider" {
            out.eprintln(&format!("Warning: {}", issue.message));
            continue;
        }
        match counts.iter_mut().find(|(p, _)| *p == issue.package) {
            Some(e) => e.1 += 1,
            None => counts.push((issue.package.clone(), 1)),
        }
    }
    let command = super::package_manager::format_cli_command("doctor", None);
    for (pkg, n) in counts {
        out.eprintln(&format!("Warning: {pkg} has {n} integration issue(s). Run: {command}"));
    }
}

/// `warnOnIntegrationIssues(integrations, {json})` for a list of loaded
/// integration records (no project).
pub fn warn_on_integrations(integrations: &[super::integrations::Record], json: bool, out: &mut Out) {
    if json {
        return;
    }
    let mut counts: Vec<(String, usize)> = Vec::new();
    for r in integrations {
        if let Some(c) = r.get("__providerConflict").filter(|v| v.is_object() && v.get("__js").is_none()) {
            out.eprintln(&format!("Warning: {}", super::paths::js_string(c.get("message"))));
            continue;
        }
        let issues = super::validate_contributions::validate_loaded(r);
        if issues.is_empty() {
            continue;
        }
        let pkg = r.get("name").and_then(|v| v.as_str()).or(r.get("__spec").and_then(|v| v.as_str())).unwrap_or("(integration)").to_string();
        match counts.iter_mut().find(|(p, _)| *p == pkg) {
            Some(e) => e.1 = issues.len(),
            None => counts.push((pkg, issues.len())),
        }
    }
    for (pkg, n) in counts {
        let command = super::package_manager::format_cli_command(&format!("doctor integration validate {pkg}"), None);
        out.eprintln(&format!("Warning: {pkg} has {n} integration issue(s). Run: {command}"));
    }
}
