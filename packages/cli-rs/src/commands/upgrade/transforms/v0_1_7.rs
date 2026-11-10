//! v0.1.7 and v0.2.1 transforms.

use super::v0_0_2::opening_ident;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::jsre;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

fn locals_importing(j: &J, sources: &[&str], name: &str) -> Vec<String> {
    let mut out = Vec::new();
    for p in j.find("ImportDeclaration") {
        let sv = j.ast.child(p.node, "source").and_then(|s| j.ast.str_of(s, "value")).unwrap_or("").to_string();
        if !sources.contains(&sv.as_str()) {
            continue;
        }
        for s in j.ast.list(p.node, "specifiers") {
            if j.ast.is(s, "ImportSpecifier") && j.name_of(j.ast.child(s, "imported")).as_deref() == Some(name) {
                let l = j.name_of(j.ast.child(s, "local")).unwrap_or_default();
                if !out.contains(&l) {
                    out.push(l);
                }
            }
        }
    }
    out
}

const TODO: &str = " TODO(astryx): tableProps is deprecated — merge these into direct props manually ";

fn prop_key_name(j: &J, prop: usize) -> Option<String> {
    if !matches!(j.ast.ty(prop), "ObjectProperty" | "Property") {
        return None;
    }
    if j.ast.flag(prop, "method") {
        return None;
    }
    if let Some(k) = j.ast.str_of(prop, "kind") {
        if k != "init" {
            return None;
        }
    }
    if j.ast.flag(prop, "computed") {
        return None;
    }
    let key = j.ast.child(prop, "key")?;
    if j.ast.is(key, "Identifier") {
        return j.ast.name(key).map(|s| s.to_string());
    }
    if matches!(j.ast.ty(key), "StringLiteral" | "Literal") {
        return j.ast.str_of(key, "value").map(|s| s.to_string());
    }
    None
}

pub fn migrate_table_tableprops(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let locals = locals_importing(&j, &["@astryxdesign/core", "@astryxdesign/core/Table", "@xds/core", "@xds/core/Table"], "Table");
    if locals.is_empty() {
        return Ok(None);
    }
    let attach_todo = |j: &mut J, attr: usize, changed: &mut bool| {
        let mut list = match j.ast.get(attr, "comments") {
            V::Arr(a) => a.clone(),
            _ => vec![],
        };
        if list.iter().any(|c| c.as_node().and_then(|c| j.ast.str_of(c, "value")) == Some(TODO)) {
            j.ast.set(attr, "comments", V::Arr(list));
            return;
        }
        let c = j.b("CommentBlock", vec![("value", V::s(TODO)), ("leading", V::Bool(false)), ("trailing", V::Bool(true))]);
        list.push(V::Node(c));
        j.ast.set(attr, "comments", V::Arr(list));
        *changed = true;
    };
    for p in j.find("JSXOpeningElement") {
        match opening_ident(&j, p.node) {
            Some(n) if locals.contains(&n) => {}
            _ => continue,
        }
        let mut attrs = j.ast.list(p.node, "attributes");
        let tp = match attrs.iter().copied().find(|a| j.ast.is(*a, "JSXAttribute") && j.jsx_attr_name(*a).as_deref() == Some("tableProps")) {
            Some(t) => t,
            None => continue,
        };
        let value = j.ast.child(tp, "value");
        let obj = value.filter(|v| j.ast.is(*v, "JSXExpressionContainer")).and_then(|v| j.ast.child(v, "expression")).filter(|e| j.ast.is(*e, "ObjectExpression"));
        let obj = match obj {
            Some(o) => o,
            None => {
                attach_todo(&mut j, tp, &mut changed);
                continue;
            }
        };
        let props = j.ast.list(obj, "properties");
        if !props.iter().all(|pr| prop_key_name(&j, *pr).is_some()) {
            attach_todo(&mut j, tp, &mut changed);
            continue;
        }
        let mut lifted: Vec<(String, usize)> = Vec::new();
        let mut kept = Vec::new();
        for pr in props {
            let k = prop_key_name(&j, pr).unwrap();
            let sib = attrs.iter().any(|a| j.ast.is(*a, "JSXAttribute") && j.jsx_attr_name(*a).as_deref() == Some(k.as_str()));
            let lif = lifted.iter().any(|(n, _)| *n == k);
            if !jsre::test(r"^[a-zA-Z_][a-zA-Z0-9_-]*$", "", &k) || sib || lif {
                kept.push(pr);
                continue;
            }
            let v = j.ast.child(pr, "value").unwrap();
            let av = if j.ast.is(v, "StringLiteral") || (j.ast.is(v, "Literal") && j.ast.str_of(v, "value").is_some()) {
                let s = j.ast.str_of(v, "value").unwrap_or("").to_string();
                j.string_literal(&s)
            } else {
                j.jsx_expression_container(v)
            };
            let a = j.jsx_attribute(&k, Some(av));
            lifted.push((k, a));
        }
        let idx = attrs.iter().position(|a| *a == tp).unwrap();
        let lifted_nodes: Vec<usize> = lifted.iter().map(|(_, a)| *a).collect();
        if kept.is_empty() {
            attrs.splice(idx..idx + 1, lifted_nodes);
            j.ast.set_list(p.node, "attributes", attrs);
            changed = true;
        } else {
            let any = !lifted_nodes.is_empty();
            attrs.splice(idx..idx, lifted_nodes);
            j.ast.set_list(p.node, "attributes", attrs);
            j.ast.set_list(obj, "properties", kept);
            attach_todo(&mut j, tp, &mut changed);
            if any {
                changed = true;
            }
        }
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

const RENDER_TYPES: &[&str] = &["TableRenderProps", "HeaderRowRenderProps", "HeaderCellRenderProps", "BodyRowRenderProps", "BodyCellRenderProps", "ScrollWrapperRenderProps"];

fn type_name_of(j: &J, ta: Option<usize>) -> Option<String> {
    let ta = ta?;
    let t = j.ast.child(ta, "typeAnnotation").unwrap_or(ta);
    if j.ast.is(t, "TSTypeReference") {
        let tn = j.ast.child(t, "typeName")?;
        if j.ast.is(tn, "Identifier") {
            return j.ast.name(tn).map(|s| s.to_string());
        }
    }
    None
}

pub fn rename_table_renderprops_styles(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut bindings: Vec<String> = Vec::new();
    let mut fns = j.find("Function");
    fns.extend(j.find("FunctionDeclaration"));
    fns.extend(j.find("FunctionExpression"));
    fns.extend(j.find("ArrowFunctionExpression"));
    for f in fns {
        for prm in j.ast.list(f.node, "params") {
            if j.ast.is(prm, "Identifier") {
                if let Some(t) = type_name_of(&j, j.ast.child(prm, "typeAnnotation")) {
                    if RENDER_TYPES.contains(&t.as_str()) {
                        let n = j.ast.name(prm).unwrap_or("").to_string();
                        if !bindings.contains(&n) {
                            bindings.push(n);
                        }
                    }
                }
            }
        }
    }
    for p in j.find("VariableDeclarator") {
        if let Some(id) = j.ast.child(p.node, "id") {
            if j.ast.is(id, "Identifier") {
                if let Some(t) = type_name_of(&j, j.ast.child(id, "typeAnnotation")) {
                    if RENDER_TYPES.contains(&t.as_str()) {
                        let n = j.ast.name(id).unwrap_or("").to_string();
                        if !bindings.contains(&n) {
                            bindings.push(n);
                        }
                    }
                }
            }
        }
    }
    let shaped = |j: &J, o: usize| -> bool {
        if !j.ast.is(o, "ObjectExpression") {
            return false;
        }
        let props = j.ast.list(o, "properties");
        let keys: Vec<String> = props
            .iter()
            .filter_map(|pr| {
                if !matches!(j.ast.ty(*pr), "ObjectProperty" | "Property") {
                    return None;
                }
                let k = j.ast.child(*pr, "key")?;
                j.ast.name(k).map(|s| s.to_string()).or_else(|| j.ast.str_of(k, "value").map(|s| s.to_string()))
            })
            .filter(|s| !s.is_empty())
            .collect();
        if keys.iter().any(|k| k == "htmlProps") && keys.iter().any(|k| k == "styles") {
            return true;
        }
        let spreads = props.iter().any(|pr| {
            matches!(j.ast.ty(*pr), "SpreadElement" | "ExperimentalSpreadProperty")
                && j.ast.child(*pr, "argument").map(|a| j.ast.is(a, "Identifier") && bindings.iter().any(|b| Some(b.as_str()) == j.ast.name(a))).unwrap_or(false)
        });
        spreads && keys.iter().any(|k| k == "styles")
    };
    let rename_styles = |j: &mut J| -> bool {
        let mut t = false;
        for p in j.find("ObjectExpression") {
            if !shaped(j, p.node) {
                continue;
            }
            for pr in j.ast.list(p.node, "properties") {
                if matches!(j.ast.ty(pr), "ObjectProperty" | "Property") && !j.ast.flag(pr, "computed") {
                    if let Some(k) = j.ast.child(pr, "key") {
                        if j.ast.is(k, "Identifier") && j.ast.name(k) == Some("styles") {
                            j.set_name(k, "xstyle");
                            t = true;
                        }
                    }
                }
            }
        }
        t
    };
    if bindings.is_empty() {
        let touched = rename_styles(&mut j);
        return Ok(if touched { Some(j.to_source_single()) } else { None });
    }
    let mut changed = false;
    for p in j.find("MemberExpression") {
        if j.ast.flag(p.node, "computed") {
            continue;
        }
        let prop = match j.ast.child(p.node, "property") {
            Some(x) => x,
            None => continue,
        };
        if !j.ast.is(prop, "Identifier") || j.ast.name(prop) != Some("styles") {
            continue;
        }
        let obj = j.ast.child(p.node, "object");
        if !obj.map(|o| j.ast.is(o, "Identifier") && bindings.iter().any(|b| Some(b.as_str()) == j.ast.name(o))).unwrap_or(false) {
            continue;
        }
        j.set_name(prop, "xstyle");
        changed = true;
    }
    if rename_styles(&mut j) {
        changed = true;
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

pub fn migrate_dialog_position(source: &str, path: &str, _o: &Value) -> TResult {
    let mut print_throws = false;
    let mut j = parse_file(source, path)?;
    let locals = locals_importing(&j, &["@astryxdesign/core", "@astryxdesign/core/Dialog", "@xds/core", "@xds/core/Dialog"], "Dialog");
    if locals.is_empty() {
        return Ok(None);
    }
    let mut changed = false;
    let key_name = |j: &J, k: Option<usize>| -> Option<String> {
        let k = k?;
        match j.ast.ty(k) {
            "Identifier" => j.ast.name(k).map(|s| s.to_string()),
            "Literal" | "StringLiteral" => j.ast.str_of(k, "value").map(|s| s.to_string()),
            _ => None,
        }
    };
    for p in j.find("JSXOpeningElement") {
        match opening_ident(&j, p.node) {
            Some(n) if locals.contains(&n) => {}
            _ => continue,
        }
        for a in j.ast.list(p.node, "attributes") {
            if !j.ast.is(a, "JSXAttribute") || j.jsx_attr_name(a).as_deref() != Some("position") {
                continue;
            }
            let v = match j.ast.child(a, "value") {
                Some(v) if j.ast.is(v, "JSXExpressionContainer") => v,
                _ => continue,
            };
            let obj = match j.ast.child(v, "expression") {
                Some(o) if j.ast.is(o, "ObjectExpression") => o,
                _ => continue,
            };
            let props: Vec<usize> = j.ast.list(obj, "properties").into_iter().filter(|pr| matches!(j.ast.ty(*pr), "Property" | "ObjectProperty")).collect();
            let mut present: Vec<String> = props.iter().filter_map(|pr| key_name(&j, j.ast.child(*pr, "key"))).filter(|s| !s.is_empty()).collect();
            for pr in props {
                if j.ast.flag(pr, "computed") {
                    continue;
                }
                let phys = match key_name(&j, j.ast.child(pr, "key")) {
                    Some(k) if !k.is_empty() => k,
                    _ => continue,
                };
                let logical = match super::jsproto::lookup(&[("left", "start"), ("right", "end")], &phys) {
                    Some(h) => h,
                    None => continue,
                };
                let key = j.ast.child(pr, "key").unwrap();
                match logical {
                    super::jsproto::Hit::Own(logical) => {
                        if present.iter().any(|k| k == logical) {
                            continue;
                        }
                        if j.ast.is(key, "Identifier") {
                            j.set_name(key, logical);
                        } else {
                            j.ast.set(key, "value", V::s(logical));
                        }
                        present.retain(|k| *k != phys);
                        present.push(logical.to_string());
                    }
                    super::jsproto::Hit::Proto(p) => {
                        // An inherited Object.prototype member: written as is.
                        let text = p.string();
                        if j.ast.is(key, "Identifier") {
                            j.set_name(key, &text);
                        } else if j.ast.is(key, "Literal") {
                            j.ast.set(key, "value", V::s(&text));
                            j.ast.set(key, "raw", V::s(&text));
                        } else {
                            print_throws = true;
                        }
                        present.retain(|k| *k != phys);
                        present.push("\u{0}".to_string());
                    }
                }
                changed = true;
            }
        }
    }
    if changed && print_throws {
        return Err(CodemodError::msg("undefined does not match type string".to_string()));
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}
