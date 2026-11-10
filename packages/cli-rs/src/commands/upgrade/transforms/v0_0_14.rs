//! v0.0.14 transforms.

use super::common::*;
use super::v0_0_2::opening_ident;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::jsre;
use crate::commands::upgrade::recast::lines::js_trim;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

fn action_rename(s: &str) -> Option<&'static str> {
    match s {
        "onPressedChangeAction" => Some("pressedChangeAction"),
        "onScrollToTopAction" => Some("scrollToTopAction"),
        "onChangeAction" => Some("changeAction"),
        "onClickAction" => Some("clickAction"),
        _ => None,
    }
}

/// `PROP_RENAMES[name]`, with the plain-object prototype lookup.
fn action_rename_js(s: &str) -> Option<String> {
    action_rename(s).map(|x| x.to_string()).or_else(|| super::jsproto::proto(s).map(|p| p.string()))
}

pub fn rename_action_props(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("JSXAttribute") {
        let n = j.ast.child(p.node, "name").unwrap();
        if !j.ast.is(n, "JSXIdentifier") {
            continue;
        }
        if let Some(new) = j.ast.name(n).and_then(action_rename_js) {
            j.set_name(n, &new);
            changed = true;
        }
    }
    let mut renamed: Vec<(String, String)> = Vec::new();
    let mut set_r = |r: &mut Vec<(String, String)>, k: String, v: String| {
        if let Some(e) = r.iter_mut().find(|e| e.0 == k) {
            e.1 = v;
        } else {
            r.push((k, v));
        }
    };
    for p in j.find("ObjectPattern") {
        for prop in j.ast.list(p.node, "properties") {
            if !j.ast.is(prop, "ObjectProperty") {
                continue;
            }
            let key = j.ast.child(prop, "key").unwrap();
            if !j.ast.is(key, "Identifier") {
                continue;
            }
            let kname = j.ast.name(key).unwrap_or("").to_string();
            let new = match action_rename_js(&kname) {
                Some(n) => n,
                None => continue,
            };
            let new = new.as_str();
            let value = j.ast.child(prop, "value").unwrap();
            let v_is_same = j.ast.is(value, "Identifier") && j.ast.name(value) == Some(kname.as_str());
            if v_is_same {
                j.set_name(key, new);
                j.set_name(value, new);
                set_r(&mut renamed, kname.clone(), new.to_string());
            } else {
                j.set_name(key, new);
            }
            changed = true;
        }
    }
    for p in j.find("ObjectProperty") {
        if j.ast.is(p.parent().unwrap(), "ObjectPattern") {
            continue;
        }
        let key = j.ast.child(p.node, "key").unwrap();
        if j.ast.is(key, "Identifier") {
            if let Some(new) = j.ast.name(key).and_then(action_rename_js) {
                j.set_name(key, &new);
                if j.ast.flag(p.node, "shorthand") {
                    let v = j.ast.child(p.node, "value").unwrap();
                    if j.ast.is(v, "Identifier") && j.ast.name(v) != Some(new.as_str()) {
                        j.set_name(v, &new);
                    }
                }
                changed = true;
            }
        }
    }
    for p in j.find("TSPropertySignature") {
        let key = j.ast.child(p.node, "key").unwrap();
        if j.ast.is(key, "Identifier") {
            if let Some(new) = j.ast.name(key).and_then(action_rename_js) {
                j.set_name(key, &new);
                changed = true;
            }
        }
    }
    if !renamed.is_empty() {
        for p in j.find("Identifier") {
            let n = j.ast.name(p.node).unwrap_or("").to_string();
            let new = match renamed.iter().find(|e| e.0 == n) {
                Some(e) => e.1.clone(),
                None => continue,
            };
            let parent = p.parent().unwrap();
            let pt = j.ast.ty(parent);
            if pt == "ObjectProperty" || pt == "ImportSpecifier" {
                continue;
            }
            if pt == "JSXAttribute" && p.key() == Some("name") {
                continue;
            }
            if pt == "Property" && p.key() == Some("key") {
                continue;
            }
            j.set_name(p.node, &new);
            changed = true;
        }
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

fn set_muted(j: &mut J, n: usize) -> bool {
    if matches!(j.ast.ty(n), "StringLiteral" | "Literal") && j.ast.str_of(n, "value") == Some("wash") {
        j.ast.set(n, "value", V::s("muted"));
        if j.ast.get(n, "raw").as_bool() {
            j.ast.set(n, "raw", V::Undef);
        }
        return true;
    }
    false
}

pub fn rename_section_wash(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        match opening_ident(&j, p.node) {
            Some(n) if n == "XDSSection" || n == "XDSToolbar" => {}
            _ => continue,
        }
        for a in j.ast.list(p.node, "attributes") {
            if !j.ast.is(a, "JSXAttribute") || j.jsx_attr_name(a).as_deref() != Some("variant") {
                continue;
            }
            if let Some(v) = j.ast.child(a, "value") {
                if set_muted(&mut j, v) {
                    changed = true;
                }
                if j.ast.is(v, "JSXExpressionContainer") {
                    if let Some(e) = j.ast.child(v, "expression") {
                        if set_muted(&mut j, e) {
                            changed = true;
                        }
                    }
                }
            }
        }
    }
    let imports_target = j.find("ImportSpecifier").iter().any(|p| matches!(j.name_of(j.ast.child(p.node, "imported")).as_deref(), Some("XDSSection") | Some("XDSToolbar")));
    if imports_target {
        for p in j.find("ObjectProperty") {
            if j.name_of(j.ast.child(p.node, "key")).as_deref() != Some("variant") {
                continue;
            }
            let value = j.ast.child(p.node, "value").unwrap();
            if set_muted(&mut j, value) {
                changed = true;
            }
            if j.ast.is(value, "ObjectExpression") {
                let opt = j.ast.list(value, "properties").into_iter().find(|pp| j.ast.child(*pp, "key").is_some() && j.name_of(j.ast.child(*pp, "key")).as_deref() == Some("options"));
                if let Some(op) = opt {
                    let ov = j.ast.child(op, "value").unwrap();
                    if j.ast.is(ov, "ArrayExpression") {
                        for el in j.ast.list(ov, "elements") {
                            if set_muted(&mut j, el) {
                                changed = true;
                            }
                        }
                    }
                }
            }
        }
        for p in j.find("JSXText") {
            let v = j.ast.str_of(p.node, "value").unwrap_or("").to_string();
            if js_trim(&v) == "wash" {
                j.ast.set(p.node, "value", V::s(&v.replacen("wash", "muted", 1)));
                if let Some(raw) = j.ast.str_of(p.node, "raw").map(|s| s.to_string()) {
                    if !raw.is_empty() {
                        j.ast.set(p.node, "raw", V::s(&raw.replacen("wash", "muted", 1)));
                    }
                }
                changed = true;
            }
        }
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

pub fn rename_static_value(j: &mut J, node: Option<usize>, renames: &[(&str, &str)]) -> bool {
    let n = match node {
        Some(n) => n,
        None => return false,
    };
    match j.ast.ty(n) {
        "TSAsExpression" | "TSSatisfiesExpression" | "TypeCastExpression" | "ParenthesizedExpression" => {
            let e = j.ast.child(n, "expression");
            return rename_static_value(j, e, renames);
        }
        "ConditionalExpression" => {
            let c = j.ast.child(n, "consequent");
            let a = j.ast.child(n, "alternate");
            let cc = rename_static_value(j, c, renames);
            let ac = rename_static_value(j, a, renames);
            return cc || ac;
        }
        "StringLiteral" | "Literal" => {}
        _ => return false,
    }
    let v = match j.ast.str_of(n, "value") {
        Some(v) => v.to_string(),
        None => return false,
    };
    let rep = match renames.iter().find(|(o, _)| *o == v) {
        Some((_, r)) => *r,
        None => return false,
    };
    j.ast.set(n, "value", V::s(rep));
    if j.ast.get(n, "raw").as_bool() {
        j.ast.set(n, "raw", V::Undef);
    }
    true
}

pub fn core_import(s: &str) -> bool {
    jsre::test(r"^@(astryxdesign|xds)\/core(?:\/|$)", "", s)
}

pub fn strip_xds(s: &str) -> String {
    s.strip_prefix("XDS").unwrap_or(s).to_string()
}

pub fn attr_value_expr(j: &J, attr: usize) -> Option<usize> {
    let v = j.ast.child(attr, "value")?;
    if j.ast.is(v, "JSXExpressionContainer") {
        j.ast.child(v, "expression")
    } else {
        Some(v)
    }
}

pub fn rename_status_variants(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let comps: &[(&str, &[&str])] = &[
        ("StatusDot", &["variant"]),
        ("AvatarStatusDot", &["variant"]),
        ("Icon", &["color"]),
        ("SVGIcon", &["color"]),
        ("ProgressBar", &["variant"]),
        ("Badge", &["variant"]),
    ];
    let o = PropOptions { matches_import: &core_import, components: comps, normalize: &strip_xds };
    transform_prop(&mut j, &o, &mut |j, _op, attr, comp, _local| {
        let value = attr_value_expr(j, attr);
        let renames: &[(&str, &str)] = if comp == "Badge" { &[("positive", "success"), ("negative", "error")] } else { &[("positive", "success"), ("negative", "error"), ("info", "accent")] };
        if rename_static_value(j, value, renames) {
            changed = true;
        }
    });
    Ok(if changed { Some(j.to_source_single()) } else { None })
}
