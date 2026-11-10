//! Port of `foundation/integrations/cli-requirement.mjs` and
//! `cli-peer-version.mjs`: the CLI release an integration's peer range
//! admits, and the problems a too-wide range causes.

use super::integrations::{self as integ, Record};
use super::nodepath as np;
use super::semver::{satisfies_range, semver_compare};
use crate::json::{Map, Value};

pub const CLI_PACKAGE: &str = "@astryxdesign/cli";
pub const NAMESPACE_DOCS_CLI: &str = "0.6.4";
pub const TEMPLATE_REPLACES_CLI: &str = "0.6.4";
pub const KEYWORDS_CLI: &str = "0.6.6";
pub const COMPONENT_REPLACES_CLI: &str = "0.6.7";
pub const THEMES_CLI: &str = "0.6.4";
pub const SECTION_IDS_CLI: &str = "0.6.4";
pub const STABILITY_CLI: &str = "0.7.4";
pub const TEMPLATE_ICONS_CLI: &str = "0.7.4";
pub const SECTION_POSITION_CLI: &str = "0.7.4";
pub const DOC_TOKENS_CLI: &str = "0.7.4";
pub const CONFIG_ICON_SET_CLI: &str = "0.7.4";

fn lower_version(text: &str) -> Option<String> {
    let re = regress::Regex::new(r"^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$").unwrap();
    let t = text.trim_matches(super::paths::js_ws);
    let m = re.find(t)?;
    let parts: Vec<String> = (1..=3)
        .map(|i| match m.group(i) {
            None => "0".to_string(),
            Some(g) => {
                let p = &t[g];
                if p == "x" || p == "X" || p == "*" { "0".into() } else { p.to_string() }
            }
        })
        .collect();
    Some(parts.join("."))
}

fn lowest_of_set(set: &str) -> Option<String> {
    if set.is_empty() || set == "*" || set == "x" || set == "X" {
        return None;
    }
    let hy = regress::Regex::new(r"^(\S+)\s+-\s+\S+$").unwrap();
    if let Some(m) = hy.find(set) {
        return lower_version(&set[m.group(1).unwrap()]);
    }
    let mut lowest: Option<String> = None;
    for comparator in set.split(super::paths::js_ws) {
        let (op, rest) = [">=", "<=", ">", "<", "=", "^", "~"]
            .iter()
            .find_map(|o| comparator.strip_prefix(o).map(|r| (*o, r)))
            .unwrap_or(("", comparator));
        if rest.is_empty() {
            return None;
        }
        if op == "<" || op == "<=" {
            continue;
        }
        let v = lower_version(rest)?;
        if lowest.as_ref().map(|l| semver_compare(&v, l) > 0.0).unwrap_or(true) {
            lowest = Some(v);
        }
    }
    lowest
}

/// `lowestAdmitted(range)`.
pub fn lowest_admitted(range: &str) -> Option<String> {
    let mut lowest: Option<String> = None;
    for alt in range.split("||") {
        let low = lowest_of_set(alt.trim_matches(super::paths::js_ws))?;
        if lowest.as_ref().map(|l| semver_compare(&low, l) < 0.0).unwrap_or(true) {
            lowest = Some(low);
        }
    }
    lowest
}

fn peer_range(pkg: &Value) -> Option<String> {
    pkg.get("peerDependencies")?.get(CLI_PACKAGE)?.as_str().map(String::from)
}

/// `cliRangeProblem(pkg, feature, loss, floor)`.
pub fn cli_range_problem(pkg: &Value, feature: &str, loss: &str, floor: &str) -> Option<String> {
    let fix = format!("\"{CLI_PACKAGE}\": \">={floor}\" in peerDependencies (optional in peerDependenciesMeta, if the CLI is not required)");
    let Some(range) = peer_range(pkg) else {
        return Some(format!("The package {feature} but declares no {CLI_PACKAGE} peer. A stable CLI before {floor} {loss}. Declare {fix}."));
    };
    match lowest_admitted(&range) {
        Some(l) if semver_compare(&l, floor) >= 0.0 => None,
        _ => Some(format!(
            "The package {feature}, but its {CLI_PACKAGE} peer range \"{range}\" admits a stable CLI before {floor}, which {loss}. Declare {fix}."
        )),
    }
}

pub fn docs_tree_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(pkg, "ships a namespace doc or a placed guide", "does not read the docs tree, and can hide every doc topic the package ships", NAMESPACE_DOCS_CLI)
}
pub fn replaces_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(pkg, "has a template that sets `replaces`", "rejects the field, drops that template, and hides the package's doc topics", TEMPLATE_REPLACES_CLI)
}
pub fn component_replaces_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(
        pkg,
        "has a component that sets `replaces`",
        "ignores the field and keeps the component under its own name, and a later CLI applies the replacement only for a package whose range starts at that release",
        COMPONENT_REPLACES_CLI,
    )
}
pub fn section_ids_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(pkg, "has a doc section that sets `id`", "rejects the field, and can hide every doc topic the package ships", SECTION_IDS_CLI)
}
pub fn section_position_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(pkg, "has a doc section that sets `before` or `after`", "rejects the fields, and can hide every doc topic the package ships", SECTION_POSITION_CLI)
}
pub fn doc_tokens_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(
        pkg,
        "writes doc tokens (`{@command …}`, `{@pm …}` or `{@pm-only …}`) in its docs",
        "prints each token as written, so readers see raw tokens instead of commands",
        DOC_TOKENS_CLI,
    )
}
pub fn themes_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(pkg, "ships a theme", "cannot read typed theme descriptors, and can drop the package's themes and hide its doc topics", THEMES_CLI)
}
pub fn keywords_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(
        pkg,
        "has a template that sets `keywords`",
        "rejects the field and drops that template, and one before 0.6.4 also hides the package's doc topics",
        KEYWORDS_CLI,
    )
}
pub fn stability_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(
        pkg,
        "has a template or namespace doc that sets `stability`",
        "rejects the field and drops that descriptor, and for a namespace doc hides the package's doc topics",
        STABILITY_CLI,
    )
}
pub fn template_icons_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(pkg, "has a template that declares `icons`", "rejects the field and drops that template", TEMPLATE_ICONS_CLI)
}

/// `withCliPeer(pkg, floor)`.
pub fn with_cli_peer(pkg: &Value, floor: &str) -> Value {
    let mut m = pkg.as_object().cloned().unwrap_or_default();
    let meta = pkg.get("peerDependenciesMeta").filter(|v| !v.is_null()).cloned().unwrap_or_else(|| Value::Object(Map::new()));
    let mut peers = pkg.get("peerDependencies").and_then(|v| v.as_object()).cloned().unwrap_or_default();
    peers.insert(CLI_PACKAGE.into(), Value::String(format!(">={floor}")));
    m.insert("peerDependencies".into(), Value::Object(peers));
    let new_meta = if super::paths::js_truthy(meta.get(CLI_PACKAGE)) {
        meta
    } else {
        let mut mm = meta.as_object().cloned().unwrap_or_default();
        mm.insert(CLI_PACKAGE.into(), serde_json::json!({"optional": true}));
        Value::Object(mm)
    };
    m.insert("peerDependenciesMeta".into(), new_meta);
    Value::Object(m)
}

/// `withDocsTreeCli(pkg)`.
pub fn with_docs_tree_cli(pkg: &Value) -> Value {
    with_cli_peer(pkg, NAMESPACE_DOCS_CLI)
}

/// `projectIconSetCliWarning(pkg)`.
pub fn project_icon_set_cli_warning(pkg: &Value) -> Option<String> {
    let field = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
        .into_iter()
        .find(|f| pkg.get(*f).and_then(|d| d.get(CLI_PACKAGE)).map(|v| v.is_string()).unwrap_or(false))?;
    let range = pkg[field][CLI_PACKAGE].as_str().unwrap().to_string();
    if range.contains(':') {
        return None;
    }
    if let Some(l) = lowest_admitted(&range) {
        if semver_compare(&l, CONFIG_ICON_SET_CLI) >= 0.0 {
            return None;
        }
    }
    Some(format!(
        "The project's {CLI_PACKAGE} range \"{range}\" ({field}) admits a release before {CONFIG_ICON_SET_CLI}, which refuses an astryx.config that sets `experimental.iconSet` (\"Unrecognized key\"), so commands that load the project configuration, such as `doctor` and `discover`, fail there. Require \"{CLI_PACKAGE}\": \">={CONFIG_ICON_SET_CLI}\"."
    ))
}

/// `cliPeerVersionProblem(integration, version, cwd, {own, from})`.
pub fn cli_peer_version_problem(integration: &Record, version: Option<&str>, cwd: &str, own: bool, from: Option<&str>) -> Option<String> {
    let ver = version.map(String::from).unwrap_or_else(super::release::cli_version);
    let dir = integ::s(integration, "__packageDir")?;
    let pkg = np::read_json(&np::join2(dir, "package.json"))?;
    let range = peer_range(&pkg)?;
    if satisfies_range(&ver, &range) {
        return None;
    }
    let name = integ::s(integration, "name").or_else(|| pkg.get("name").and_then(|v| v.as_str())).unwrap_or("(integration)").to_string();
    if let Some(lowest) = lowest_admitted(&range) {
        if semver_compare(&ver, &lowest) < 0.0 {
            let verb = match super::package_manager::detect_package_manager(Some(cwd)).as_str() {
                "pnpm" => "pnpm add",
                "yarn" => "yarn add",
                "bun" => "bun add",
                _ => "npm install",
            };
            let install = format!("{verb}{} @astryxdesign/core@latest {CLI_PACKAGE}@latest", if own { " -D" } else { "" });
            let opts = super::package_manager::InvocationOptions { installed: true, release: None };
            let upgrade = format!("{} upgrade --from {} --apply", super::package_manager::get_cli_invocation_with(Some(cwd), &opts), from.unwrap_or(&ver));
            return Some(format!(
                "{name} needs {CLI_PACKAGE} {range}, but this CLI is {ver}, so some of what it ships may not load. Upgrade Core and the CLI together: `{install}`, then `{upgrade}`."
            ));
        }
    }
    if own {
        return Some(format!(
            "{name} declares {CLI_PACKAGE} {range}, but this CLI is {ver}, outside that range. Test the package with this CLI, and if it works, widen the {CLI_PACKAGE} range in its peerDependencies."
        ));
    }
    Some(format!(
        "{name} supports {CLI_PACKAGE} {range}, but this CLI is {ver}, outside that range, so some of what it ships may not work as its author tested. Look for a release of {name} that supports {ver}."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lowest() {
        assert_eq!(lowest_admitted(">=0.7.4 <1").as_deref(), Some("0.7.4"));
        assert_eq!(lowest_admitted("^0.6.0 || ^0.7.0").as_deref(), Some("0.6.0"));
        assert_eq!(lowest_admitted("*"), None);
        assert_eq!(lowest_admitted("0.x").as_deref(), Some("0.0.0"));
    }
}
