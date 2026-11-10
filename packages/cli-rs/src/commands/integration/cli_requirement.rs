//! `foundation/integrations/cli-requirement.mjs`: which `@astryxdesign/cli`
//! peer range a package needs for the features it uses.

use super::semver;
use crate::json::{Map, Value};
use std::cmp::Ordering;

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

fn wild(p: &str) -> bool {
    p == "x" || p == "X" || p == "*"
}

fn part_ok(p: &str) -> bool {
    wild(p) || (!p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

/// `lowerVersion`: a (partial) version as MAJOR.MINOR.PATCH, wildcards as 0.
fn lower_version(text: &str) -> Option<String> {
    let t = text.trim();
    let t = t.strip_prefix('v').unwrap_or(t);
    let core_end = t.find(|c| c == '-' || c == '+').unwrap_or(t.len());
    let (core, rest) = t.split_at(core_end);
    let tag_ok = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-');
    if !rest.is_empty() {
        let (pre, build) = if let Some(r) = rest.strip_prefix('-') {
            match r.find('+') {
                Some(i) => (Some(&r[..i]), Some(&r[i + 1..])),
                None => (Some(r), None),
            }
        } else {
            (None, rest.strip_prefix('+'))
        };
        if pre.map(|p| !tag_ok(p)).unwrap_or(false) || build.map(|b| !tag_ok(b)).unwrap_or(false) {
            return None;
        }
    }
    let parts: Vec<&str> = core.split('.').collect();
    if parts.is_empty() || parts.len() > 3 || !parts.iter().all(|p| part_ok(p)) {
        return None;
    }
    let mut out = Vec::new();
    for i in 0..3 {
        out.push(match parts.get(i) {
            None => "0".to_string(),
            Some(p) if wild(p) => "0".to_string(),
            Some(p) => p.to_string(),
        });
    }
    Some(out.join("."))
}

fn lowest_of_set(set: &str) -> Option<String> {
    if set.is_empty() || set == "*" || set == "x" || set == "X" {
        return None;
    }
    let words: Vec<&str> = set.split_whitespace().collect();
    if words.len() == 3 && words[1] == "-" {
        return lower_version(words[0]);
    }
    let mut lowest: Option<String> = None;
    for comparator in set.split(|c: char| c.is_whitespace()).filter(|s| !s.is_empty()) {
        let (op, rest) = ["<=", ">=", "<", ">", "=", "^", "~"]
            .iter()
            .find_map(|op| comparator.strip_prefix(op).map(|r| (*op, r)))
            .unwrap_or(("", comparator));
        if rest.is_empty() {
            return None;
        }
        if op == "<" || op == "<=" {
            continue;
        }
        let v = lower_version(rest)?;
        if lowest.as_ref().map(|l| semver::compare(&v, l) == Ordering::Greater).unwrap_or(true) {
            lowest = Some(v);
        }
    }
    lowest
}

/// `lowestAdmitted(range)`.
pub fn lowest_admitted(range: &str) -> Option<String> {
    let mut lowest: Option<String> = None;
    for alt in range.split("||") {
        let low = lowest_of_set(alt.trim())?;
        if lowest.as_ref().map(|l| semver::compare(&low, l) == Ordering::Less).unwrap_or(true) {
            lowest = Some(low);
        }
    }
    lowest
}

/// `cliRangeProblem(pkg, feature, loss, floor)`.
pub fn cli_range_problem(pkg: &Value, feature: &str, loss: &str, floor: &str) -> Option<String> {
    let range = pkg.get("peerDependencies").and_then(|p| p.get(CLI_PACKAGE));
    let fix = format!("\"{CLI_PACKAGE}\": \">={floor}\" in peerDependencies (optional in peerDependenciesMeta, if the CLI is not required)");
    let Some(Value::String(range)) = range else {
        return Some(format!("The package {feature} but declares no {CLI_PACKAGE} peer. A stable CLI before {floor} {loss}. Declare {fix}."));
    };
    let lowest = lowest_admitted(range);
    if lowest.as_ref().map(|l| semver::compare(l, floor) == Ordering::Less).unwrap_or(true) {
        return Some(format!(
            "The package {feature}, but its {CLI_PACKAGE} peer range \"{range}\" admits a stable CLI before {floor}, which {loss}. Declare {fix}."
        ));
    }
    None
}

pub fn docs_tree_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(pkg, "ships a namespace doc or a placed guide", "does not read the docs tree, and can hide every doc topic the package ships", NAMESPACE_DOCS_CLI)
}

pub fn themes_cli_problem(pkg: &Value) -> Option<String> {
    cli_range_problem(pkg, "ships a theme", "cannot read typed theme descriptors, and can drop the package's themes and hide its doc topics", THEMES_CLI)
}

/// `withCliPeer(pkg, floor)`.
pub fn with_cli_peer(pkg: &Value, floor: &str) -> Value {
    let mut out = pkg.as_object().cloned().unwrap_or_default();
    let mut peers = match out.get("peerDependencies") {
        Some(Value::Object(m)) => m.clone(),
        _ => Map::new(),
    };
    peers.insert(CLI_PACKAGE.into(), Value::String(format!(">={floor}")));
    out.insert("peerDependencies".into(), Value::Object(peers));
    let meta = match out.get("peerDependenciesMeta") {
        Some(Value::Object(m)) => m.clone(),
        _ => Map::new(),
    };
    let has = meta.get(CLI_PACKAGE).map(|v| !matches!(v, Value::Null | Value::Bool(false))).unwrap_or(false);
    let meta = if has {
        meta
    } else {
        let mut m = meta;
        let mut o = Map::new();
        o.insert("optional".into(), Value::Bool(true));
        m.insert(CLI_PACKAGE.into(), Value::Object(o));
        m
    };
    out.insert("peerDependenciesMeta".into(), Value::Object(meta));
    Value::Object(out)
}
