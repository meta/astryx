//! v0.0.13 transforms.

use super::v0_0_2::opening_ident;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::jsre;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

fn icon_rename(s: &str) -> Option<&'static str> {
    match s {
        "checkCircle" => Some("success"),
        "xCircle" => Some("error"),
        _ => None,
    }
}

fn is_str_lit_ty(t: &str) -> bool {
    t == "StringLiteral" || t == "Literal"
}

thread_local! {
    /// A Babel StringLiteral now holds an inherited `Object.prototype`
    /// function: recast's printer throws on it.
    static PRINT_THROWS: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

fn rename_string_literal(j: &mut J, n: usize) -> bool {
    if !is_str_lit_ty(j.ast.ty(n)) {
        return false;
    }
    if let Some(p) = j.ast.str_of(n, "value").filter(|v| icon_rename(v).is_none()).and_then(super::jsproto::proto) {
        let text = p.string();
        if j.ast.is(n, "Literal") {
            // Printed as `value + ""` (the raw no longer matches the value).
            j.ast.set(n, "value", V::s(&text));
            j.ast.set(n, "raw", V::s(&text));
        } else {
            PRINT_THROWS.with(|c| c.set(true));
        }
        return true;
    }
    let new = match j.ast.str_of(n, "value").and_then(icon_rename) {
        Some(x) => x,
        None => return false,
    };
    j.ast.set(n, "value", V::s(new));
    if j.ast.get(n, "raw").as_bool() {
        j.ast.set(n, "raw", V::s(&format!("'{}'", new)));
    }
    true
}

fn rename_in_expression(j: &mut J, n: Option<usize>) -> bool {
    let n = match n {
        Some(n) => n,
        None => return false,
    };
    let mut changed = false;
    match j.ast.ty(n) {
        "StringLiteral" | "Literal" => changed = rename_string_literal(j, n),
        "ConditionalExpression" => {
            let c = j.ast.child(n, "consequent");
            let a = j.ast.child(n, "alternate");
            changed = rename_in_expression(j, c) || changed;
            changed = rename_in_expression(j, a) || changed;
        }
        "LogicalExpression" => {
            let l = j.ast.child(n, "left");
            let r = j.ast.child(n, "right");
            changed = rename_in_expression(j, l) || changed;
            changed = rename_in_expression(j, r) || changed;
        }
        _ => {}
    }
    changed
}

const ICON_PROPS: &[&str] = &["icon", "name", "selectedIcon"];

pub fn icon_name_deprecations(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    PRINT_THROWS.with(|c| c.set(false));
    let mut changed = false;
    for p in j.find("JSXAttribute") {
        let name = j.name_of(j.ast.child(p.node, "name"));
        if !name.map(|n| ICON_PROPS.contains(&n.as_str())).unwrap_or(false) {
            continue;
        }
        let value = j.ast.child(p.node, "value");
        if let Some(v) = value {
            if is_str_lit_ty(j.ast.ty(v)) {
                if rename_string_literal(&mut j, v) {
                    changed = true;
                }
            } else if j.ast.is(v, "JSXExpressionContainer") {
                let e = j.ast.child(v, "expression");
                if rename_in_expression(&mut j, e) {
                    changed = true;
                }
            }
        }
    }
    if source.contains("XDSIconRegistry") || source.contains("iconRegistry") || source.contains("IconRegistry") {
        for p in j.find("ObjectProperty") {
            let key = match j.ast.child(p.node, "key") {
                Some(k) => k,
                None => continue,
            };
            let key_name = match j.ast.ty(key) {
                "Identifier" => j.ast.name(key).map(|s| s.to_string()),
                "StringLiteral" | "Literal" => j.ast.str_of(key, "value").map(|s| s.to_string()),
                _ => None,
            };
            if let Some(p) = key_name.as_deref().filter(|v| icon_rename(v).is_none()).and_then(super::jsproto::proto) {
                return Err(p.builder_error("name", "string", "Identifier"));
            }
            if let Some(new) = key_name.as_deref().and_then(icon_rename) {
                let id = j.identifier(new);
                j.ast.set_node(p.node, "key", id);
                changed = true;
            }
        }
    }
    for p in j.find("ObjectProperty") {
        let key = j.ast.child(p.node, "key");
        let key_name = key.and_then(|k| if j.ast.is(k, "Identifier") { j.ast.name(k).map(|s| s.to_string()) } else { j.ast.str_of(k, "value").map(|s| s.to_string()) });
        if !key_name.map(|n| ICON_PROPS.contains(&n.as_str())).unwrap_or(false) {
            continue;
        }
        if let Some(v) = j.ast.child(p.node, "value") {
            if is_str_lit_ty(j.ast.ty(v)) {
                if let Some(p) = j.ast.str_of(v, "value").filter(|x| icon_rename(x).is_none()).and_then(super::jsproto::proto) {
                    return Err(p.builder_error("value", "string", "StringLiteral"));
                }
                if let Some(new) = j.ast.str_of(v, "value").and_then(icon_rename) {
                    let s = j.string_literal(new);
                    j.ast.set_node(p.node, "value", s);
                    changed = true;
                }
            }
        }
    }
    if changed && PRINT_THROWS.with(|c| c.get()) {
        return Err(CodemodError::msg("undefined does not match type string".to_string()));
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

const ATTACH_RENAMES: &[(&str, &str)] = &[("XDSChatComposerAttachments", "XDSChatComposerDrawer"), ("XDSChatComposerAttachmentsProps", "XDSChatComposerDrawerProps")];

pub fn rename_attachments_to_drawer(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("ImportSpecifier") {
        let imported = j.name_of(j.ast.child(p.node, "imported")).unwrap_or_default();
        if let Some(super::jsproto::Hit::Proto(pr)) = super::jsproto::lookup(ATTACH_RENAMES, &imported) {
            return Err(pr.builder_error("name", "string", "Identifier"));
        }
        let new = match ATTACH_RENAMES.iter().find(|(o, _)| *o == imported) {
            Some((_, n)) => *n,
            None => continue,
        };
        let local = j.name_of(j.ast.child(p.node, "local")).unwrap_or_default();
        let id = j.identifier(new);
        j.ast.set_node(p.node, "imported", id);
        if local == imported {
            let l = j.identifier(new);
            j.ast.set_node(p.node, "local", l);
        }
        changed = true;
    }
    for (old, new) in ATTACH_RENAMES {
        if old.ends_with("Props") {
            continue;
        }
        for p in j.find("JSXIdentifier") {
            if j.ast.name(p.node) != Some(*old) {
                continue;
            }
            let pt = j.ast.ty(p.parent().unwrap());
            if pt == "JSXOpeningElement" || pt == "JSXClosingElement" {
                j.set_name(p.node, new);
                changed = true;
            }
        }
    }
    for p in j.find("JSXOpeningElement") {
        if opening_ident(&j, p.node).as_deref() != Some("XDSChatComposer") {
            continue;
        }
        for a in j.ast.list(p.node, "attributes") {
            if j.jsx_attr_name(a).as_deref() == Some("attachments") {
                let id = j.jsx_identifier("drawer");
                j.ast.set_node(a, "name", id);
                changed = true;
            }
        }
    }
    for p in j.find("TSTypeReference") {
        let tn = j.ast.child(p.node, "typeName").unwrap();
        if j.ast.is(tn, "Identifier") {
            let n = j.ast.name(tn).unwrap_or("").to_string();
            if let Some(hit) = super::jsproto::lookup(ATTACH_RENAMES, &n) {
                j.set_name(tn, &hit.string());
                changed = true;
            }
        }
    }
    for p in j.find("Identifier") {
        if j.ast.name(p.node) != Some("XDSChatComposerAttachments") {
            continue;
        }
        let pt = j.ast.ty(p.parent().unwrap());
        if matches!(pt, "ImportSpecifier" | "JSXOpeningElement" | "JSXClosingElement") {
            continue;
        }
        j.set_name(p.node, "XDSChatComposerDrawer");
        changed = true;
    }
    for p in j.find("Identifier") {
        if j.ast.name(p.node) != Some("XDSChatComposerAttachmentsProps") {
            continue;
        }
        if j.ast.is(p.parent().unwrap(), "ImportSpecifier") {
            continue;
        }
        j.set_name(p.node, "XDSChatComposerDrawerProps");
        changed = true;
    }
    let (oc, nc) = ("xds-chat-composer-attachments", "xds-chat-composer-drawer");
    let pat = jsre::escape(oc);
    for p in j.find("StringLiteral") {
        let v = j.ast.str_of(p.node, "value").unwrap_or("").to_string();
        if v.contains(oc) {
            j.ast.set(p.node, "value", V::s(&jsre::replace(&pat, "g", &v, nc)));
            changed = true;
        }
    }
    for p in j.find("TemplateLiteral") {
        for q in j.ast.list(p.node, "quasis") {
            let val = j.ast.get(q, "value").clone();
            let raw = val.obj_get("raw").as_str().unwrap_or("").to_string();
            if raw.contains(oc) {
                let cooked = val.obj_get("cooked").as_str().unwrap_or("").to_string();
                let nv = V::Obj(vec![("raw", V::s(&jsre::replace(&pat, "g", &raw, nc))), ("cooked", V::s(&jsre::replace(&pat, "g", &cooked, nc)))]);
                j.ast.set(q, "value", nv);
                changed = true;
            }
        }
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

/// DENSITY_TO_SIZE lookup: Some(Some(size)), Some(None) for `default`, None when unmapped.
fn density(s: &str) -> Option<Option<&'static str>> {
    match s {
        "compact" => Some(Some("sm")),
        "default" => Some(None),
        _ => None,
    }
}

pub fn toolbar_density_to_size(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        if opening_ident(&j, p.node).as_deref() != Some("XDSToolbar") {
            continue;
        }
        let mut attrs = j.ast.list(p.node, "attributes");
        let idx = match attrs.iter().position(|a| j.jsx_attr_name(*a).as_deref() == Some("density")) {
            Some(i) => i,
            None => continue,
        };
        let value = j.ast.child(attrs[idx], "value");
        if let Some(v) = value.filter(|v| is_str_lit_ty(j.ast.ty(*v))) {
            let dv = j.ast.get(v, "value").clone();
            if let Some(p) = dv.as_str().filter(|x| density(x).is_none()).and_then(super::jsproto::proto) {
                return Err(p.builder_error("value", "string", "StringLiteral"));
            }
            let size = match dv.as_str().and_then(density) {
                Some(s) => s,
                None => continue,
            };
            match size {
                None => {
                    attrs.remove(idx);
                }
                Some(sz) => {
                    let s = j.string_literal(sz);
                    attrs[idx] = j.jsx_attribute("size", Some(s));
                }
            }
            j.ast.set_list(p.node, "attributes", attrs);
            changed = true;
            continue;
        }
        if let Some(v) = value.filter(|v| j.ast.is(*v, "JSXExpressionContainer")) {
            let expr = j.ast.child(v, "expression").unwrap();
            if j.ast.is(expr, "JSXEmptyExpression") {
                continue;
            }
            let compact = j.string_literal("compact");
            let bin = j.b("BinaryExpression", vec![("operator", V::s("===")), ("left", V::Node(expr)), ("right", V::Node(compact))]);
            let sm = j.string_literal("sm");
            let md = j.string_literal("md");
            let cond = j.b("ConditionalExpression", vec![("test", V::Node(bin)), ("consequent", V::Node(sm)), ("alternate", V::Node(md))]);
            let c = j.jsx_expression_container(cond);
            attrs[idx] = j.jsx_attribute("size", Some(c));
            j.ast.set_list(p.node, "attributes", attrs);
            changed = true;
        }
    }
    let imports_toolbar = j.find("ImportSpecifier").iter().any(|p| j.name_of(j.ast.child(p.node, "imported")).as_deref() == Some("XDSToolbar"));
    if imports_toolbar {
        for p in j.find("ObjectProperty") {
            if j.name_of(j.ast.child(p.node, "key")).as_deref() != Some("density") {
                continue;
            }
            let value = j.ast.child(p.node, "value").unwrap();
            if is_str_lit_ty(j.ast.ty(value)) {
                if let Some(p) = j.ast.str_of(value, "value").filter(|x| density(x).is_none()).and_then(super::jsproto::proto) {
                    return Err(p.builder_error("value", "string", "StringLiteral"));
                }
                let size = match j.ast.str_of(value, "value").and_then(density) {
                    Some(s) => s,
                    None => continue,
                };
                match size {
                    None => {
                        let parent = p.parent().unwrap();
                        if j.ast.is(parent, "ObjectExpression") {
                            let props = j.ast.list(parent, "properties");
                            if props.contains(&p.node) {
                                j.ast.set_list(parent, "properties", props.into_iter().filter(|x| *x != p.node).collect());
                                changed = true;
                            }
                        }
                    }
                    Some(sz) => {
                        let k = j.identifier("size");
                        let s = j.string_literal(sz);
                        j.ast.set_node(p.node, "key", k);
                        j.ast.set_node(p.node, "value", s);
                        changed = true;
                    }
                }
                continue;
            }
            if j.ast.is(value, "ObjectExpression") {
                let k = j.identifier("size");
                j.ast.set_node(p.node, "key", k);
                let opt = j.ast.list(value, "properties").into_iter().find(|pp| j.name_of(j.ast.child(*pp, "key")).as_deref() == Some("options"));
                if let Some(op) = opt {
                    if j.ast.child(op, "value").map(|v| j.ast.is(v, "ArrayExpression")).unwrap_or(false) {
                        let a = j.string_literal("sm");
                        let b = j.string_literal("md");
                        let c = j.string_literal("lg");
                        let arr = j.b("ArrayExpression", vec![("elements", V::Arr(vec![V::Node(a), V::Node(b), V::Node(c)]))]);
                        j.ast.set_node(op, "value", arr);
                    }
                }
                changed = true;
            }
        }
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}
