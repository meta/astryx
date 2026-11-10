//! Port of `foundation/discovery/component-replacement.mjs`: which
//! integration component replaces which Core component, and what Doctor
//! reports about the declarations.

use crate::discovery::component_discovery::{
    discover_components, discover_valid_integration_components, IntegrationRecord, LoadedIntegration,
};
use crate::json::Value;
use indexmap::IndexMap;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

pub const CLI_PACKAGE: &str = "@astryxdesign/cli";
pub const COMPONENT_REPLACES_CLI: &str = "0.6.7";

/// The replacement that answers to a Core name.
#[derive(Debug, Clone)]
pub struct ActiveReplacement {
    pub target: String,
    pub name: String,
    pub package: String,
    pub doc_path: PathBuf,
    pub source_path: Option<PathBuf>,
    pub issues_url: Option<String>,
    pub integration: LoadedIntegration,
}

/// One Doctor finding.
#[derive(Debug, Clone)]
pub struct Finding {
    pub package: String,
    pub component: String,
    pub code: String,
    pub severity: String,
    pub message: String,
    pub opted_in: bool,
}

/// `resolveComponentReplacements(...)` result.
#[derive(Debug, Clone, Default)]
pub struct ComponentReplacements {
    pub active: Vec<ActiveReplacement>,
    pub findings: Vec<Finding>,
}

impl ComponentReplacements {
    /// `forTarget(name)`.
    pub fn for_target(&self, name: &str) -> Option<&ActiveReplacement> {
        self.active.iter().find(|a| a.target == name)
    }
}

// TEMP: replace with the discovery lane's integrations/cli-requirement port.
fn lower_version(text: &str) -> Option<String> {
    let t = text.trim();
    let t = t.strip_prefix('v').unwrap_or(t);
    let core_end = t.find(['-', '+']).unwrap_or(t.len());
    let (core, rest) = t.split_at(core_end);
    let valid_tail = |s: &str| !s.is_empty() && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-');
    if !rest.is_empty() {
        let mut r = rest;
        if let Some(x) = r.strip_prefix('-') {
            let (pre, plus) = match x.find('+') {
                Some(i) => (&x[..i], Some(&x[i + 1..])),
                None => (x, None),
            };
            if !valid_tail(pre) {
                return None;
            }
            if let Some(p) = plus {
                if !valid_tail(p) || p.contains('-') && false {
                    return None;
                }
            }
            r = "";
        } else if let Some(p) = r.strip_prefix('+') {
            if !valid_tail(p) {
                return None;
            }
            r = "";
        }
        if !r.is_empty() {
            return None;
        }
    }
    let parts: Vec<&str> = core.split('.').collect();
    if parts.is_empty() || parts.len() > 3 {
        return None;
    }
    let mut out = Vec::new();
    for p in &parts {
        let ok = !p.is_empty() && (p.bytes().all(|c| c.is_ascii_digit()) || matches!(*p, "x" | "X" | "*"));
        if !ok {
            return None;
        }
        out.push(if matches!(*p, "x" | "X" | "*") { "0".to_string() } else { p.to_string() });
    }
    while out.len() < 3 {
        out.push("0".into());
    }
    Some(out.join("."))
}

fn semver_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let pa: Vec<f64> = a.split('.').map(|x| x.parse().unwrap_or(0.0)).collect();
    let pb: Vec<f64> = b.split('.').map(|x| x.parse().unwrap_or(0.0)).collect();
    for i in 0..3 {
        let (x, y) = (pa.get(i).copied().unwrap_or(0.0), pb.get(i).copied().unwrap_or(0.0));
        if x != y {
            return x.partial_cmp(&y).unwrap();
        }
    }
    std::cmp::Ordering::Equal
}

fn lowest_of_set(set: &str) -> Option<String> {
    if set.is_empty() || set == "*" || set == "x" || set == "X" {
        return None;
    }
    let ws: Vec<&str> = set.split_whitespace().collect();
    if ws.len() == 3 && ws[1] == "-" {
        return lower_version(ws[0]);
    }
    let mut lowest: Option<String> = None;
    for comp in set.split_whitespace() {
        let rest = comp;
        let (op, v) = [">=", "<=", ">", "<", "=", "^", "~"]
            .iter()
            .find_map(|o| comp.strip_prefix(o).filter(|r| !r.is_empty()).map(|r| (Some(*o), r)))
            .unwrap_or((None, rest));
        if v.is_empty() {
            return None;
        }
        if op == Some("<") || op == Some("<=") {
            continue;
        }
        let version = lower_version(v)?;
        if lowest.as_ref().map_or(true, |l| semver_cmp(&version, l).is_gt()) {
            lowest = Some(version);
        }
    }
    lowest
}

fn lowest_admitted(range: &str) -> Option<String> {
    let mut lowest: Option<String> = None;
    for alt in range.split("||") {
        let low = lowest_of_set(alt.trim())?;
        if lowest.as_ref().map_or(true, |l| semver_cmp(&low, l).is_lt()) {
            lowest = Some(low);
        }
    }
    lowest
}

/// `componentReplacementsEnabled(pkg)`: the package's CLI peer range starts
/// at or after the release that applies replacements.
pub fn component_replacements_enabled(pkg: &Value) -> bool {
    let Some(range) = pkg.get("peerDependencies").and_then(|p| p.get(CLI_PACKAGE)).and_then(|r| r.as_str()) else {
        return false;
    };
    match lowest_admitted(range) {
        Some(l) => !semver_cmp(&l, COMPONENT_REPLACES_CLI).is_lt(),
        None => false,
    }
}

fn package_json_of(i: &LoadedIntegration) -> Value {
    i.package_dir
        .as_ref()
        .and_then(|d| std::fs::read_to_string(d.join("package.json")).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(Value::Object(Default::default()))
}

fn inactive_tail(name: &str, target: &str) -> String {
    let until = if name == target {
        format!("Until then the bare name \"{name}\" stays ambiguous between Core and this package; select either one with --package.")
    } else {
        format!("Until then \"{name}\" keeps its own name and \"{target}\" stays Core.")
    };
    format!(
        "This CLI applies the replacement only when the package declares \"{CLI_PACKAGE}\": \">={COMPONENT_REPLACES_CLI}\" in peerDependencies (optional in peerDependenciesMeta). {until}"
    )
}

#[derive(Clone)]
struct Declaration {
    rec: IntegrationRecord,
    replaces: Value,
    integration: LoadedIntegration,
    autolinked: bool,
    opted_in: bool,
}

fn js_json(v: &Value) -> String {
    crate::json::stringify(v, 0)
}

/// `resolveComponentReplacements(coreDir, loadedIntegrations)`. `run` spells
/// `formatCliCommand('component --list')`.
pub fn resolve_component_replacements(core_dir: Option<&Path>, integrations: &[LoadedIntegration], component_list_cmd: &str) -> ComponentReplacements {
    let mut result = ComponentReplacements::default();
    let mut declares = false;
    for i in integrations {
        if declares || i.components.is_none() || i.load_error {
            continue;
        }
        let v = discover_valid_integration_components(i, false);
        declares = v.components.iter().any(|r| r.replaces.is_some());
    }
    if !declares {
        return result;
    }
    let mut decls: Vec<Declaration> = Vec::new();
    let mut natives: Vec<(String, String)> = Vec::new();
    for i in integrations {
        if i.load_error || i.components.is_none() {
            continue;
        }
        let comps = discover_valid_integration_components(i, true).components;
        let mut opted: Option<bool> = None;
        for r in comps {
            let Some(rep) = r.replaces.clone() else {
                natives.push((r.name.clone(), r.package.clone()));
                continue;
            };
            let o = *opted.get_or_insert_with(|| component_replacements_enabled(&package_json_of(i)));
            decls.push(Declaration { rec: r, replaces: rep, integration: i.clone(), autolinked: i.autolinked, opted_in: o });
        }
    }
    if decls.is_empty() {
        return result;
    }
    let core_names: Vec<String> = core_dir.map(|d| discover_components(d).into_values().flatten().collect()).unwrap_or_default();
    let core_by_key: HashMap<String, String> = core_names.iter().map(|n| (n.to_lowercase(), n.clone())).collect();
    let core_set: HashSet<&String> = core_names.iter().collect();
    let findings = &mut result.findings;
    let report = |findings: &mut Vec<Finding>, d: &Declaration, code: &str, message: String| {
        findings.push(Finding {
            package: d.rec.package.clone(),
            component: d.rec.name.clone(),
            code: code.into(),
            severity: if d.opted_in { "error".into() } else { "warning".into() },
            message,
            opted_in: d.opted_in,
        });
    };
    let mut valid_by_target: IndexMap<String, Vec<Declaration>> = IndexMap::new();
    let mut invalid_targets: HashSet<String> = HashSet::new();
    let mut failed_by_target: IndexMap<String, Vec<Declaration>> = IndexMap::new();
    for d in &decls {
        let name = d.rec.name.clone();
        let shown = match &d.replaces {
            Value::String(s) => s.clone(),
            other => crate::cli::format::js_string(other),
        };
        if !d.opted_in {
            findings.push(Finding {
                package: d.rec.package.clone(),
                component: name.clone(),
                code: "inactive_component_replacement".into(),
                severity: "warning".into(),
                message: format!("Component \"{name}\" sets `replaces: {}`. {}", js_json(&Value::String(shown.clone())), inactive_tail(&name, &shown)),
                opted_in: false,
            });
        }
        let rep = match &d.replaces {
            Value::String(s) if !s.trim().is_empty() => s.clone(),
            other => {
                report(
                    findings,
                    d,
                    "invalid_component_replacement",
                    format!(
                        "Component \"{name}\" sets `replaces` to {}. Set it to the exact name of one Core component, such as \"SideNav\".",
                        js_json(other)
                    ),
                );
                continue;
            }
        };
        if !core_set.contains(&rep) {
            let diff = core_by_key.get(&rep.to_lowercase()).cloned();
            let msg = match &diff {
                Some(dc) => format!("Component \"{name}\" replaces \"{rep}\", which is not a Core component name. Core names it \"{dc}\"."),
                None => format!(
                    "Component \"{name}\" replaces \"{rep}\", which is not a Core component. Run `{component_list_cmd}` for Core component names."
                ),
            };
            report(findings, d, "missing_component_replacement_target", msg);
            if d.opted_in {
                failed_by_target.entry(diff.unwrap_or(rep)).or_default().push(d.clone());
            }
            continue;
        }
        if core_set.contains(&name) && name != rep {
            report(
                findings,
                d,
                "invalid_component_replacement",
                format!("Component \"{name}\" replaces \"{rep}\", but its own name is the Core component \"{name}\". Rename it, or replace \"{name}\" instead."),
            );
            if d.opted_in {
                failed_by_target.entry(rep).or_default().push(d.clone());
            }
            continue;
        }
        valid_by_target.entry(rep).or_default().push(d.clone());
    }
    let targets: Vec<String> = valid_by_target.keys().cloned().collect();
    for target in targets {
        let valid = valid_by_target[&target].clone();
        let mut by_pkg: IndexMap<String, Vec<Declaration>> = IndexMap::new();
        for d in valid {
            by_pkg.entry(d.rec.package.clone()).or_default().push(d);
        }
        for (pkg, group) in by_pkg {
            if group.len() < 2 {
                continue;
            }
            let names = group.iter().map(|d| format!("\"{}\"", d.rec.name)).collect::<Vec<_>>().join(", ");
            for d in &group {
                report(
                    findings,
                    d,
                    "ambiguous_component_replacement",
                    format!(
                        "{pkg} declares {} components as replacements for Core component \"{target}\" ({names}). One package declares at most one replacement for a Core component.",
                        group.len()
                    ),
                );
            }
            if group[0].opted_in {
                failed_by_target.entry(target.clone()).or_default().extend(group.iter().cloned());
            }
            let kept: Vec<Declaration> = valid_by_target[&target].iter().filter(|d| d.rec.package != pkg).cloned().collect();
            valid_by_target.insert(target.clone(), kept);
        }
    }
    let contenders_for = |t: &str| -> Vec<Declaration> {
        valid_by_target.get(t).map(|v| v.iter().filter(|d| d.opted_in).cloned().collect()).unwrap_or_default()
    };
    for (target, failed) in &failed_by_target {
        let valid = contenders_for(target);
        let explicit = valid.iter().any(|d| !d.autolinked) || failed.iter().any(|d| !d.autolinked);
        if failed.iter().any(|d| !explicit || !d.autolinked) {
            invalid_targets.insert(target.clone());
        }
    }
    for target in &core_names {
        let valid = contenders_for(target);
        if valid.is_empty() || invalid_targets.contains(target) {
            continue;
        }
        let explicit = valid.iter().any(|d| !d.autolinked);
        let contenders: Vec<&Declaration> = if explicit { valid.iter().filter(|d| !d.autolinked).collect() } else { valid.iter().collect() };
        let winner = contenders[contenders.len() - 1].clone();
        if valid.len() > 1 {
            let packages = valid.iter().map(|d| d.rec.package.clone()).collect::<Vec<_>>().join(", ");
            let reason = if explicit && valid.iter().any(|d| d.autolinked) {
                format!("{} is explicitly configured, so it wins over autolinked integrations.", winner.rec.package)
            } else if explicit {
                format!("{} is configured later, so it wins.", winner.rec.package)
            } else {
                format!(
                    "{} is listed later in package.json dependencies, so it wins. Add the intended package to astryx.config integrations to make precedence explicit.",
                    winner.rec.package
                )
            };
            findings.push(Finding {
                package: winner.rec.package.clone(),
                component: winner.rec.name.clone(),
                code: "ambiguous_component_replacement".into(),
                severity: "warning".into(),
                message: format!("Core component \"{target}\" is replaced by {packages}. {reason}"),
                opted_in: true,
            });
        }
        result.active.push(ActiveReplacement {
            target: target.clone(),
            name: winner.rec.name.clone(),
            package: winner.rec.package.clone(),
            doc_path: winner.rec.doc_path.clone(),
            source_path: winner.rec.source_path.clone(),
            issues_url: winner.rec.issues_url.clone(),
            integration: winner.integration.clone(),
        });
        for (nname, npkg) in &natives {
            if *npkg == winner.rec.package || nname != target {
                continue;
            }
            findings.push(Finding {
                package: npkg.clone(),
                component: nname.clone(),
                code: "shadowed_component_name".into(),
                severity: "warning".into(),
                message: format!(
                    "Component \"{nname}\" from {npkg} is shadowed by \"{}\" from {}, which replaces Core \"{target}\". Select it with --package {npkg}.",
                    winner.rec.name, winner.rec.package
                ),
                opted_in: true,
            });
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ranges() {
        assert_eq!(lowest_admitted(">=0.6.7").as_deref(), Some("0.6.7"));
        assert_eq!(lowest_admitted("^0.7.0 || >=0.6.0").as_deref(), Some("0.6.0"));
        assert_eq!(lowest_admitted("*"), None);
        assert_eq!(lowest_admitted("1.2.3 - 2"), Some("1.2.3".into()));
    }
}
