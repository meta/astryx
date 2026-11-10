//! v0.6.4 transforms.

use crate::commands::upgrade::transforms::common::PropOptions;
use super::lhelp::*;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::jsre;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

fn map_value(component: &str, v: &str) -> Option<&'static str> {
    match v {
        "touch" => Some("adaptive-native"),
        "always" => Some("native"),
        "never" => Some(if component == "TimeInput" { "text-input" } else { "adaptive-bottom-sheet" }),
        _ => None,
    }
}

fn collect_static_leaves(j: &J, node: Option<usize>, leaves: &mut Vec<usize>) -> bool {
    let n = match node {
        Some(n) => n,
        None => return false,
    };
    match j.ast.ty(n) {
        "TSAsExpression" | "TSSatisfiesExpression" | "TypeCastExpression" | "ParenthesizedExpression" => collect_static_leaves(j, j.ast.child(n, "expression"), leaves),
        "ConditionalExpression" => collect_static_leaves(j, j.ast.child(n, "consequent"), leaves) && collect_static_leaves(j, j.ast.child(n, "alternate"), leaves),
        "StringLiteral" | "Literal" if matches!(j.ast.get(n, "value"), V::Str(_)) => {
            leaves.push(n);
            true
        }
        _ => false,
    }
}

fn map_static_value(j: &mut J, node: Option<usize>, component: &str) -> bool {
    let mut leaves = vec![];
    if !collect_static_leaves(j, node, &mut leaves) {
        return false;
    }
    if leaves.iter().any(|&l| map_value(component, j.ast.str_of(l, "value").unwrap_or("")).is_none()) {
        return false;
    }
    for l in leaves {
        let nv = map_value(component, j.ast.str_of(l, "value").unwrap_or("")).unwrap();
        j.ast.set(l, "value", V::s(nv));
        if matches!(j.ast.get(l, "raw"), V::Str(s) if !s.is_empty()) {
            j.ast.set(l, "raw", V::Undef);
        }
    }
    true
}

pub fn migrate_native_picker(source: &str, path: &str, _o: &Value) -> TResult {
    if !source.contains("nativePicker") {
        return Ok(None);
    }
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let comps: &[(&str, &[&str])] = &[("DateInput", &["nativePicker"]), ("DateTimeInput", &["nativePicker"]), ("TimeInput", &["nativePicker"])];
    let matches_import = |s: &str| jsre::test("^@(astryxdesign|xds)\\/core(?:\\/|$)", "", s);
    let norm = |s: &str| s.to_string();
    let o = PropOptions { matches_import: &matches_import, components: comps, normalize: &norm };
    transform_prop_paths(&mut j, &o, &mut |j, op, prop, comp, _| {
        let opening = op.node;
        let attrs = j.ast.list(opening, "attributes");
        if attrs.iter().any(|&a| attr_name(j, a).as_deref() == Some("presentation")) {
            let kept: Vec<usize> = attrs.into_iter().filter(|&a| a != prop).collect();
            j.ast.set_list(opening, "attributes", kept);
            changed = true;
            return;
        }
        let value = j.ast.child(prop, "value");
        let value = match value {
            Some(v) if j.ast.is(v, "JSXExpressionContainer") => j.ast.child(v, "expression"),
            v => v,
        };
        if !map_static_value(j, value, comp) {
            return;
        }
        let n = j.ast.child(prop, "name").unwrap();
        j.set_name(n, "presentation");
        changed = true;
    });
    done(&j, changed)
}
