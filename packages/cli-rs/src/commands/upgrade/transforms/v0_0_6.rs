//! v0.0.6 transforms.

use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

pub fn migrate_badge_children_to_label(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("JSXElement") {
        let opening = j.ast.child(p.node, "openingElement").unwrap();
        if j.name_of(j.ast.child(opening, "name")).as_deref() != Some("XDSBadge") {
            continue;
        }
        let children = j.ast.list(p.node, "children");
        if children.is_empty() {
            continue;
        }
        if j.ast.list(opening, "attributes").iter().any(|a| j.jsx_attr_name(*a).as_deref() == Some("label")) {
            continue;
        }
        let meaningful: Vec<usize> = children
            .iter()
            .copied()
            .filter(|c| !(j.ast.is(*c, "JSXText") && crate::commands::upgrade::recast::lines::js_trim(j.ast.str_of(*c, "value").unwrap_or("")).is_empty()))
            .collect();
        if meaningful.len() != 1 {
            continue;
        }
        let child = meaningful[0];
        let label = if j.ast.is(child, "JSXText") {
            let text = crate::commands::upgrade::recast::lines::js_trim(j.ast.str_of(child, "value").unwrap_or("")).to_string();
            if text.is_empty() {
                continue;
            }
            if !text.is_empty() && text.chars().all(|c| c.is_ascii_digit()) {
                let n: f64 = text.parse::<f64>().unwrap_or(0.0);
                let lit = j.numeric_literal(n);
                j.jsx_expression_container(lit)
            } else {
                j.string_literal(&text)
            }
        } else if j.ast.is(child, "JSXExpressionContainer") {
            let e = j.ast.child(child, "expression").unwrap();
            if j.ast.is(e, "StringLiteral") {
                let v = j.ast.str_of(e, "value").unwrap_or("").to_string();
                j.string_literal(&v)
            } else {
                j.jsx_expression_container(e)
            }
        } else {
            continue;
        };
        let attr = j.jsx_attribute("label", Some(label));
        let mut attrs = j.ast.list(opening, "attributes");
        attrs.push(attr);
        j.ast.set_list(opening, "attributes", attrs);
        j.ast.set(p.node, "children", V::Arr(vec![]));
        j.ast.set(opening, "selfClosing", V::Bool(true));
        j.ast.set(p.node, "closingElement", V::Null);
        changed = true;
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

pub fn migrate_collapse_to_collapsible(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let sidenav = ["isCollapsible", "isCollapsed", "onCollapsedChange", "defaultIsCollapsed", "hasCollapseButton"];
    for p in j.find("JSXOpeningElement") {
        if j.name_of(j.ast.child(p.node, "name")).as_deref() != Some("XDSSideNav") {
            continue;
        }
        let attrs = j.ast.list(p.node, "attributes");
        if !attrs.iter().any(|a| j.ast.is(*a, "JSXAttribute") && j.jsx_attr_name(*a).as_deref() == Some("isCollapsible")) {
            continue;
        }
        // insertion-ordered object keyed by prop name
        let mut props: Vec<(String, usize)> = Vec::new();
        let mut keep = Vec::new();
        for a in attrs.iter().copied() {
            if !j.ast.is(a, "JSXAttribute") {
                keep.push(a);
                continue;
            }
            let name = j.jsx_attr_name(a).unwrap_or_default();
            if !sidenav.contains(&name.as_str()) {
                keep.push(a);
                continue;
            }
            if name == "isCollapsible" {
                continue;
            }
            let value = j.ast.child(a, "value");
            if name == "hasCollapseButton" {
                if let Some(v) = value {
                    if j.ast.is(v, "JSXExpressionContainer") {
                        let e = j.ast.child(v, "expression").unwrap();
                        if matches!(j.ast.get(e, "value"), V::Bool(false)) {
                            let k = j.identifier("hasButton");
                            let b = j.boolean_literal(false);
                            let op = j.b("ObjectProperty", vec![("key", V::Node(k)), ("value", V::Node(b))]);
                            set_prop(&mut props, "hasButton", op);
                        }
                    }
                }
                continue;
            }
            let val = match value {
                Some(v) if j.ast.is(v, "JSXExpressionContainer") => j.ast.child(v, "expression").unwrap(),
                Some(v) => v,
                None => j.boolean_literal(true),
            };
            let k = j.identifier(&name);
            let op = j.b("ObjectProperty", vec![("key", V::Node(k)), ("value", V::Node(val))]);
            set_prop(&mut props, &name, op);
        }
        let mut attrs = keep;
        if props.is_empty() {
            attrs.push(j.jsx_attribute("collapsible", None));
        } else {
            let obj = j.b("ObjectExpression", vec![("properties", V::Arr(props.iter().map(|(_, n)| V::Node(*n)).collect()))]);
            let c = j.jsx_expression_container(obj);
            attrs.push(j.jsx_attribute("collapsible", Some(c)));
        }
        j.ast.set_list(p.node, "attributes", attrs);
        changed = true;
    }
    for p in j.find("JSXOpeningElement") {
        if j.name_of(j.ast.child(p.node, "name")).as_deref() != Some("XDSAppShell") {
            continue;
        }
        let attrs = j.ast.list(p.node, "attributes");
        let kept: Vec<usize> = attrs
            .iter()
            .copied()
            .filter(|a| !(j.ast.is(*a, "JSXAttribute") && ["isSideNavCollapsed", "onSideNavCollapsedChange", "defaultIsSideNavCollapsed"].contains(&j.jsx_attr_name(*a).unwrap_or_default().as_str())))
            .collect();
        if kept.len() != attrs.len() {
            j.ast.set_list(p.node, "attributes", kept);
            changed = true;
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

fn set_prop(props: &mut Vec<(String, usize)>, k: &str, v: usize) {
    if let Some(e) = props.iter_mut().find(|(kk, _)| kk == k) {
        e.1 = v;
    } else {
        props.push((k.to_string(), v));
    }
}

const RADIUS_TOKENS: &[(&str, &str)] = &[
    ("--radius-inner", "--radius-0"),
    ("--radius-content", "--radius-1"),
    ("--radius-element", "--radius-2"),
    ("--radius-container", "--radius-3"),
    ("--radius-page", "--radius-4"),
];

pub fn migrate_radius_tokens(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let changed = j.replace_string_tokens(RADIUS_TOKENS);
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

const SHADOW_TOKENS: &[(&str, &str)] = &[
    ("--elevation-input-hover-success", "--inset-shadow-border-positive"),
    ("--elevation-input-hover-warning", "--inset-shadow-border-warning"),
    ("--elevation-input-hover-error", "--inset-shadow-border-negative"),
    ("--elevation-input-hover", "--inset-shadow-border-hover"),
    ("--elevation-base", "--shadow-base"),
    ("--elevation-menu", "--shadow-menu"),
    ("--elevation-hover", "--shadow-hover"),
    ("--elevation-dialog", "--shadow-dialog"),
    ("--shadow-1", "--shadow-base"),
    ("--shadow-2", "--shadow-menu"),
    ("--shadow-3", "--shadow-hover"),
    ("--shadow-4", "--shadow-dialog"),
];

pub fn migrate_shadow_tokens(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = j.replace_string_tokens(SHADOW_TOKENS);
    let idmap = [("elevationDefaults", "shadowDefaults"), ("elevationVars", "shadowVars"), ("elevationRaw", "shadowRaw"), ("ElevationVarName", "ShadowVarName")];
    for p in j.find("Identifier") {
        let n = j.ast.name(p.node).unwrap_or("").to_string();
        if let Some((_, new)) = idmap.iter().find(|(o, _)| *o == n) {
            j.set_name(p.node, new);
            changed = true;
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn migrate_skeleton_radius(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let map = |s: &str| match s {
        "inner" => Some(0.0),
        "content" => Some(1.0),
        "element" => Some(2.0),
        "container" => Some(3.0),
        _ => None,
    };
    for p in j.find("JSXOpeningElement") {
        if j.name_of(j.ast.child(p.node, "name")).as_deref() != Some("XDSSkeleton") {
            continue;
        }
        for a in j.ast.list(p.node, "attributes") {
            if j.jsx_attr_name(a).as_deref() != Some("radius") {
                continue;
            }
            if let Some(v) = j.ast.child(a, "value") {
                if matches!(j.ast.ty(v), "StringLiteral" | "Literal") {
                    if let Some(p) = j.ast.str_of(v, "value").filter(|x| map(x).is_none()).and_then(super::jsproto::proto) {
                        return Err(p.builder_error("value", "number", "NumericLiteral"));
                    }
                    if let Some(n) = j.ast.str_of(v, "value").and_then(map) {
                        let lit = j.numeric_literal(n);
                        let c = j.jsx_expression_container(lit);
                        j.ast.set_node(a, "value", c);
                        changed = true;
                    }
                }
            }
            if let Some(v) = j.ast.child(a, "value") {
                if j.ast.is(v, "JSXExpressionContainer") {
                    let e = j.ast.child(v, "expression").unwrap();
                    if matches!(j.ast.ty(e), "StringLiteral" | "Literal") {
                        if let Some(p) = j.ast.str_of(e, "value").filter(|x| map(x).is_none()).and_then(super::jsproto::proto) {
                            return Err(p.builder_error("value", "number", "NumericLiteral"));
                        }
                        if let Some(n) = j.ast.str_of(e, "value").and_then(map) {
                            let lit = j.numeric_literal(n);
                            let c = j.jsx_expression_container(lit);
                            j.ast.set_node(a, "value", c);
                            changed = true;
                        }
                    }
                }
            }
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

const TOKEN_NAMES: &[(&str, &str)] = &[
    ("--color-educational-deemphasized", "--color-info-muted"),
    ("--color-divider-high-contrast", "--color-border-strong"),
    ("--color-focus-outline-success", "--color-ring-focus-success"),
    ("--color-focus-outline-warning", "--color-ring-focus-warning"),
    ("--color-negative-deemphasized", "--color-error-muted"),
    ("--color-positive-deemphasized", "--color-success-muted"),
    ("--color-warning-deemphasized", "--color-warning-muted"),
    ("--color-accent-deemphasized", "--color-accent-muted"),
    ("--color-focus-outline-error", "--color-ring-focus-error"),
    ("--color-divider-emphasized", "--color-border-emphasized"),
    ("--color-disabled-overlay", "--color-overlay-disabled"),
    ("--color-shadow-elevation", "--color-shadow"),
    ("--color-text-placeholder", "--color-text-secondary"),
    ("--color-pressed-overlay", "--color-overlay-pressed"),
    ("--color-focus-outline", "--color-ring-focus"),
    ("--color-hover-overlay", "--color-overlay-hover"),
    ("--color-icon-on-media", "--color-icon-on-dark-media"),
    ("--color-icon-tertiary", "--color-icon-secondary"),
    ("--color-text-on-media", "--color-text-on-dark-media"),
    ("--color-deemphasized", "--color-muted"),
    ("--color-accent-text", "--color-text-link"),
    ("--color-educational", "--color-info"),
    ("--color-negative", "--color-error"),
    ("--color-positive", "--color-success"),
    ("--color-divider", "--color-border"),
    ("--color-glimmer", "--color-skeleton"),
    ("--insetshadow-border-positive", "--inset-shadow-border-positive"),
    ("--insetshadow-border-negative", "--inset-shadow-border-negative"),
    ("--insetshadow-border-warning", "--inset-shadow-border-warning"),
    ("--insetshadow-border-accent", "--inset-shadow-border-accent"),
    ("--insetshadow-border-hover", "--inset-shadow-border-hover"),
    ("--easing-standard", "--ease-standard"),
];

pub fn migrate_token_names(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let changed = j.replace_string_tokens(TOKEN_NAMES);
    Ok(if changed { Some(j.to_source(None)) } else { None })
}
