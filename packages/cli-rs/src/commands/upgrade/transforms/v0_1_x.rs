//! v0.1.2 – v0.2.0 transforms.

use super::common::*;
use super::v0_0_14::{attr_value_expr, rename_static_value, strip_xds};
use super::v0_0_2::opening_ident;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

fn rename_str(j: &mut J, n: Option<usize>, old: &str, new: &str) -> bool {
    let n = match n {
        Some(n) => n,
        None => return false,
    };
    if matches!(j.ast.ty(n), "StringLiteral" | "Literal") && j.ast.str_of(n, "value") == Some(old) {
        j.ast.set(n, "value", V::s(new));
        if j.ast.get(n, "raw").as_bool() {
            j.ast.set(n, "raw", V::s(&format!("'{}'", new)));
        }
        return true;
    }
    false
}

fn rename_in_expr(j: &mut J, n: Option<usize>, old: &str, new: &str) -> bool {
    let n = match n {
        Some(n) => n,
        None => return false,
    };
    let mut changed = false;
    match j.ast.ty(n) {
        "StringLiteral" | "Literal" => changed = rename_str(j, Some(n), old, new) || changed,
        "ConditionalExpression" => {
            let (c, a) = (j.ast.child(n, "consequent"), j.ast.child(n, "alternate"));
            changed = rename_in_expr(j, c, old, new) || changed;
            changed = rename_in_expr(j, a, old, new) || changed;
        }
        "LogicalExpression" => {
            let (l, r) = (j.ast.child(n, "left"), j.ast.child(n, "right"));
            changed = rename_in_expr(j, l, old, new) || changed;
            changed = rename_in_expr(j, r, old, new) || changed;
        }
        "TSAsExpression" => {
            let e = j.ast.child(n, "expression");
            changed = rename_in_expr(j, e, old, new) || changed;
        }
        _ => {}
    }
    changed
}

fn rename_prop_value(source: &str, path: &str, comps: &[&str], prop: &str, old: &str, new: &str) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        match opening_ident(&j, p.node) {
            Some(n) if comps.contains(&n.as_str()) => {}
            _ => continue,
        }
        for a in j.ast.list(p.node, "attributes") {
            if !j.ast.is(a, "JSXAttribute") || j.ast.child(a, "name").and_then(|n| j.ast.name(n)) != Some(prop) {
                continue;
            }
            let v = match j.ast.child(a, "value") {
                Some(v) => v,
                None => continue,
            };
            if matches!(j.ast.ty(v), "StringLiteral" | "Literal") {
                if rename_str(&mut j, Some(v), old, new) {
                    changed = true;
                }
            } else if j.ast.is(v, "JSXExpressionContainer") {
                let e = j.ast.child(v, "expression");
                if rename_in_expr(&mut j, e, old, new) {
                    changed = true;
                }
            }
        }
    }
    let imports = j.find("ImportSpecifier").iter().any(|p| j.name_of(j.ast.child(p.node, "imported")).map(|n| comps.contains(&n.as_str())).unwrap_or(false));
    if imports {
        let props: Vec<NPath> = j.find("ObjectProperty").into_iter().filter(|p| j.name_of(j.ast.child(p.node, "key")).as_deref() == Some(prop)).collect();
        for p in &props {
            let v = j.ast.child(p.node, "value");
            if rename_in_expr(&mut j, v, old, new) {
                changed = true;
            }
        }
        let props: Vec<NPath> = j.find("ObjectProperty").into_iter().filter(|p| j.name_of(j.ast.child(p.node, "key")).as_deref() == Some(prop)).collect();
        for p in props {
            let v = match j.ast.child(p.node, "value") {
                Some(v) if j.ast.is(v, "ObjectExpression") => v,
                _ => continue,
            };
            let opt = j.ast.list(v, "properties").into_iter().find(|pp| {
                j.ast.child(*pp, "key").map(|k| j.ast.name(k) == Some("options") || j.ast.str_of(k, "value") == Some("options")).unwrap_or(false)
            });
            if let Some(op) = opt {
                let ov = j.ast.child(op, "value").unwrap();
                if j.ast.is(ov, "ArrayExpression") {
                    for el in j.ast.list(ov, "elements") {
                        if rename_str(&mut j, Some(el), old, new) {
                            changed = true;
                        }
                    }
                }
            }
        }
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

pub fn rename_text_color_active(source: &str, path: &str, _o: &Value) -> TResult {
    rename_prop_value(source, path, &["Text", "Heading", "Link", "Timestamp"], "color", "active", "accent")
}

pub fn rename_switch_label_spacing(source: &str, path: &str, _o: &Value) -> TResult {
    rename_prop_value(source, path, &["Switch"], "labelSpacing", "default", "hug")
}

pub fn rename_avatar_size_scale(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let sources = ["@astryxdesign/core", "@astryxdesign/core/Avatar", "@astryxdesign/core/AvatarGroup", "@xds/core", "@xds/core/Avatar", "@xds/core/AvatarGroup"];
    let matches = |s: &str| sources.contains(&s);
    let comps: &[(&str, &[&str])] = &[("Avatar", &["size"]), ("AvatarGroup", &["size"])];
    let o = PropOptions { matches_import: &matches, components: comps, normalize: &strip_xds };
    let renames: &[(&str, &str)] = &[("tiny", "xsm"), ("xsmall", "sm"), ("small", "md"), ("medium", "lg"), ("large", "xl")];
    transform_prop(&mut j, &o, &mut |j, _op, attr, _c, _l| {
        let v = attr_value_expr(j, attr);
        if rename_static_value(j, v, renames) {
            changed = true;
        }
    });
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

pub fn remove_tablist_orientation(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let sources = ["@astryxdesign/core", "@astryxdesign/core/TabList", "@xds/core", "@xds/core/TabList"];
    let mut locals: Vec<String> = Vec::new();
    for p in j.find("ImportDeclaration") {
        let sv = j.ast.child(p.node, "source").and_then(|s| j.ast.str_of(s, "value")).unwrap_or("").to_string();
        if !sources.contains(&sv.as_str()) {
            continue;
        }
        for s in j.ast.list(p.node, "specifiers") {
            if j.ast.is(s, "ImportSpecifier") && j.name_of(j.ast.child(s, "imported")).as_deref() == Some("TabList") {
                locals.push(j.name_of(j.ast.child(s, "local")).unwrap_or_default());
            }
        }
    }
    if locals.is_empty() {
        return Ok(None);
    }
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        match opening_ident(&j, p.node) {
            Some(n) if locals.contains(&n) => {}
            _ => continue,
        }
        let attrs = j.ast.list(p.node, "attributes");
        let kept: Vec<usize> = attrs.iter().copied().filter(|a| !(j.ast.is(*a, "JSXAttribute") && j.jsx_attr_name(*a).as_deref() == Some("orientation"))).collect();
        let n = kept.len();
        j.ast.set_list(p.node, "attributes", kept);
        if n != attrs.len() {
            changed = true;
        }
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}
