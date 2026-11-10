//! v0.0.12 transforms.

use super::v0_0_2::opening_ident;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::recast::lines::js_trim;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

fn insert_after_in_body(j: &mut J, target: usize, new: usize) {
    let prog = j.program();
    let mut body = j.ast.list(prog, "body");
    if let Some(i) = body.iter().position(|n| *n == target) {
        body.insert(i + 1, new);
    } else {
        let last = body.iter().rposition(|n| j.ast.is(*n, "ImportDeclaration")).map(|i| i as isize).unwrap_or(-1);
        body.insert((last + 1) as usize, new);
    }
    j.ast.set_list(prog, "body", body);
}

fn icon_button_import(j: &mut J) -> usize {
    let id = j.identifier("XDSIconButton");
    let spec = j.b("ImportSpecifier", vec![("imported", V::Node(id)), ("local", V::Null)]);
    let src = j.string_literal("@xds/core/IconButton");
    j.b("ImportDeclaration", vec![("specifiers", V::Arr(vec![V::Node(spec)])), ("source", V::Node(src))])
}

fn icon_button_spec(j: &mut J) -> usize {
    let id = j.identifier("XDSIconButton");
    j.b("ImportSpecifier", vec![("imported", V::Node(id)), ("local", V::Null)])
}

pub fn add_is_icon_only(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let mut needs_import = false;
    let has_attr = |j: &J, attrs: &[usize], n: &str| attrs.iter().any(|a| j.jsx_attr_name(*a).as_deref() == Some(n));
    for p in j.find("JSXOpeningElement") {
        if opening_ident(&j, p.node).as_deref() != Some("XDSButton") {
            continue;
        }
        let attrs = j.ast.list(p.node, "attributes");
        if !has_attr(&j, &attrs, "icon") || has_attr(&j, &attrs, "children") || has_attr(&j, &attrs, "isIconOnly") {
            continue;
        }
        let parent = p.parent().unwrap();
        let has_children = j.ast.is(parent, "JSXElement")
            && j.ast.list(parent, "children").iter().any(|c| if j.ast.is(*c, "JSXText") { !js_trim(j.ast.str_of(*c, "value").unwrap_or("")).is_empty() } else { true });
        if has_children {
            continue;
        }
        let name = j.ast.child(p.node, "name").unwrap();
        j.set_name(name, "XDSIconButton");
        let kept: Vec<usize> = attrs.into_iter().filter(|a| j.jsx_attr_name(*a).as_deref() != Some("endContent")).collect();
        j.ast.set_list(p.node, "attributes", kept);
        if j.ast.is(parent, "JSXElement") {
            if let Some(c) = j.ast.child(parent, "closingElement") {
                let cn = j.ast.child(c, "name").unwrap();
                j.set_name(cn, "XDSIconButton");
            }
        }
        needs_import = true;
        changed = true;
    }
    for p in j.find("JSXElement") {
        let opening = j.ast.child(p.node, "openingElement").unwrap();
        if opening_ident(&j, opening).as_deref() != Some("XDSButton") {
            continue;
        }
        let attrs = j.ast.list(opening, "attributes");
        if !has_attr(&j, &attrs, "icon") {
            continue;
        }
        let label = match attrs.iter().copied().find(|a| j.jsx_attr_name(*a).as_deref() == Some("label")) {
            Some(l) => l,
            None => continue,
        };
        let lv = match j.ast.child(label, "value") {
            Some(v) => v,
            None => continue,
        };
        let label_value = if matches!(j.ast.ty(lv), "StringLiteral" | "Literal") { j.ast.str_of(lv, "value").map(|s| s.to_string()) } else { None };
        let label_value = match label_value {
            Some(s) if !s.is_empty() => s,
            _ => continue,
        };
        let children = j.ast.list(p.node, "children");
        if children.len() != 1 {
            continue;
        }
        let child = children[0];
        let mut clear = false;
        if j.ast.is(child, "JSXText") && js_trim(j.ast.str_of(child, "value").unwrap_or("")) == label_value {
            clear = true;
        }
        if j.ast.is(child, "JSXExpressionContainer") {
            let e = j.ast.child(child, "expression").unwrap();
            if matches!(j.ast.ty(e), "StringLiteral" | "Literal") && j.ast.str_of(e, "value") == Some(label_value.as_str()) {
                clear = true;
            }
        }
        if clear {
            j.ast.set(p.node, "children", V::Arr(vec![]));
            j.ast.set(p.node, "closingElement", V::Null);
            j.ast.set(opening, "selfClosing", V::Bool(true));
            changed = true;
        }
    }
    for p in j.find("JSXOpeningElement") {
        match opening_ident(&j, p.node) {
            Some(n) if n == "XDSDropdownMenu" || n == "XDSMoreMenu" => {}
            _ => continue,
        }
        let attrs = j.ast.list(p.node, "attributes");
        let button = attrs.iter().copied().find(|a| {
            j.jsx_attr_name(*a).as_deref() == Some("button")
                && j.ast.child(*a, "value").map(|v| j.ast.is(v, "JSXExpressionContainer") && j.ast.child(v, "expression").map(|e| j.ast.is(e, "ObjectExpression")).unwrap_or(false)).unwrap_or(false)
        });
        let button = match button {
            Some(b) => b,
            None => continue,
        };
        let obj = j.ast.child(j.ast.child(button, "value").unwrap(), "expression").unwrap();
        let props = j.ast.list(obj, "properties");
        let has_key = |n: &str| props.iter().any(|p| matches!(j.ast.ty(*p), "Property" | "ObjectProperty") && j.name_of(j.ast.child(*p, "key")).as_deref() == Some(n));
        if has_key("icon") && !has_key("children") && !has_key("isIconOnly") {
            let k = j.identifier("isIconOnly");
            let v = j.literal_bool(true);
            let prop = j.b("Property", vec![("kind", V::s("init")), ("key", V::Node(k)), ("value", V::Node(v))]);
            let mut props = props.clone();
            props.push(prop);
            j.ast.set_list(obj, "properties", props);
            changed = true;
        }
    }
    if !changed {
        return Ok(None);
    }
    let mut remaining = j.find("JSXIdentifier").iter().any(|p| j.ast.name(p.node) == Some("XDSButton"));
    for p in j.find("Identifier") {
        if j.ast.name(p.node) != Some("XDSButton") {
            continue;
        }
        let pt = j.ast.ty(p.parent().unwrap());
        if matches!(pt, "JSXOpeningElement" | "JSXClosingElement" | "ImportSpecifier") {
            continue;
        }
        remaining = true;
    }
    if needs_import {
        let mut already = j.find("ImportDeclaration").iter().any(|p| j.ast.list(p.node, "specifiers").iter().any(|s| j.ast.is(*s, "ImportSpecifier") && j.name_of(j.ast.child(*s, "imported")).as_deref() == Some("XDSIconButton")));
        if !already {
            if !remaining {
                for p in j.find("ImportDeclaration") {
                    if already {
                        break;
                    }
                    let src = j.ast.child(p.node, "source").unwrap();
                    if j.ast.str_of(src, "value") != Some("@xds/core/Button") {
                        continue;
                    }
                    let mut specs = j.ast.list(p.node, "specifiers");
                    let idx = match specs.iter().position(|s| j.ast.is(*s, "ImportSpecifier") && j.name_of(j.ast.child(*s, "imported")).as_deref() == Some("XDSButton")) {
                        Some(i) => i,
                        None => continue,
                    };
                    specs.remove(idx);
                    if specs.is_empty() {
                        specs.push(icon_button_spec(&mut j));
                        j.ast.set_list(p.node, "specifiers", specs);
                        let s = j.string_literal("@xds/core/IconButton");
                        j.ast.set_node(p.node, "source", s);
                    } else {
                        j.ast.set_list(p.node, "specifiers", specs);
                        let imp = icon_button_import(&mut j);
                        insert_after_in_body(&mut j, p.node, imp);
                    }
                    already = true;
                }
            }
            if !already {
                for p in j.find("ImportDeclaration") {
                    if already {
                        break;
                    }
                    let src = j.ast.child(p.node, "source").unwrap();
                    if j.ast.str_of(src, "value") == Some("@xds/core") {
                        let mut specs = j.ast.list(p.node, "specifiers");
                        specs.push(icon_button_spec(&mut j));
                        j.ast.set_list(p.node, "specifiers", specs);
                        already = true;
                    }
                }
            }
            if !already {
                let imp = icon_button_import(&mut j);
                let xds: Vec<NPath> = j.find("ImportDeclaration").into_iter().filter(|p| j.ast.child(p.node, "source").and_then(|s| j.ast.str_of(s, "value")).map(|s| s.starts_with("@xds/")).unwrap_or(false)).collect();
                // `.at(-1)` is a Collection, so `targetPath.node` is undefined
                // and the import always lands after the last import.
                if !xds.is_empty() {
                    insert_after_in_body(&mut j, usize::MAX, imp);
                } else {
                    let all = j.find("ImportDeclaration");
                    if !all.is_empty() {
                        insert_after_in_body(&mut j, usize::MAX, imp);
                    } else {
                        let prog = j.program();
                        let mut body = j.ast.list(prog, "body");
                        body.insert(0, imp);
                        j.ast.set_list(prog, "body", body);
                    }
                }
            }
        }
    }
    Ok(Some(j.to_source_single()))
}
