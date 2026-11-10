//! v0.6.0 transforms (the CSS selector migration lives in `v0_6_0_css.rs`).

use super::lhelp::*;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

pub fn move_ime_helper_import(source: &str, path: &str, _o: &Value) -> TResult {
    if !source.contains("isImeKeyEvent") {
        return Ok(None);
    }
    let mut j = parse_file(source, path)?;
    let mut moved: Vec<(String, Vec<String>)> = vec![];
    let mut emptied = vec![];
    let mut changed = false;
    for ip in j.find("ImportDeclaration") {
        let target = match source_value(&j, ip.node).as_deref() {
            Some("@astryxdesign/core/hooks") => "@astryxdesign/core/utils",
            Some("@xds/core/hooks") => "@xds/core/utils",
            _ => continue,
        };
        let mut retained = vec![];
        let mut moved_here = false;
        for s in j.ast.list(ip.node, "specifiers") {
            if j.ast.is(s, "ImportSpecifier") && imported_name(&j, s).as_deref() == Some("isImeKeyEvent") {
                let l = local_name(&j, s).unwrap_or("isImeKeyEvent".into());
                match moved.iter_mut().find(|e| e.0 == target) {
                    Some(e) => e.1.push(l),
                    None => moved.push((target.to_string(), vec![l])),
                }
                moved_here = true;
                changed = true;
            } else {
                retained.push(s);
            }
        }
        let empty = retained.is_empty();
        j.ast.set_list(ip.node, "specifiers", retained);
        if moved_here && empty {
            emptied.push(ip);
        }
    }
    if !changed {
        return Ok(None);
    }
    for p in emptied {
        j.remove(&p);
    }
    for (target, locals) in moved {
        let mut existing = None;
        for ip in j.find("ImportDeclaration") {
            if source_value(&j, ip.node).as_deref() != Some(target.as_str()) || existing.is_some() {
                continue;
            }
            let has_ns = j.ast.list(ip.node, "specifiers").iter().any(|&s| j.ast.is(s, "ImportNamespaceSpecifier"));
            if j.ast.str_of(ip.node, "importKind") != Some("type") && !has_ns {
                existing = Some(ip.node);
            }
        }
        let mut uniq: Vec<String> = vec![];
        for l in locals {
            if !uniq.contains(&l) {
                uniq.push(l);
            }
        }
        let mut specs = vec![];
        for l in &uniq {
            let i = j.identifier("isImeKeyEvent");
            let local = if l == "isImeKeyEvent" { V::Null } else { V::Node(j.identifier(l)) };
            specs.push((j.b("ImportSpecifier", vec![("imported", V::Node(i)), ("local", local)]), l.clone()));
        }
        if let Some(ex) = existing {
            let cur = j.ast.list(ex, "specifiers");
            let present: Vec<Option<String>> = cur.iter().filter(|&&s| j.ast.is(s, "ImportSpecifier")).map(|&s| local_name(&j, s).or_else(|| imported_name(&j, s))).collect();
            let mut next = cur.clone();
            for (s, l) in specs {
                if !present.iter().any(|p| p.as_deref() == Some(l.as_str())) {
                    next.push(s);
                }
            }
            j.ast.set_list(ex, "specifiers", next);
        } else {
            let src = j.string_literal(&target);
            let d = j.b("ImportDeclaration", vec![("specifiers", V::Arr(specs.into_iter().map(|(s, _)| V::Node(s)).collect())), ("source", V::Node(src))]);
            let prog = j.program();
            let mut body = j.ast.list(prog, "body");
            body.insert(0, d);
            j.ast.set_list(prog, "body", body);
        }
    }
    Ok(Some(j.to_source_single()))
}

pub fn static_property_name(j: &J, prop: usize) -> Option<String> {
    if j.ast.flag(prop, "computed") {
        return None;
    }
    let key = j.ast.child(prop, "key")?;
    match j.ast.ty(key) {
        "Identifier" => j.ast.name(key).map(|s| s.to_string()),
        "StringLiteral" | "Literal" => match j.ast.get(key, "value") {
            V::Str(s) => Some(s.to_string()),
            V::Num(n) => Some(format!("\u{0}num:{}", n)),
            _ => None,
        },
        _ => None,
    }
}

/// `path.scope.lookup(name) ?? path.scope` at an import (Program scope).
fn import_scope(j: &J, p: &NPath, name: &str) -> usize {
    j.lookup_scope(p, name).unwrap_or(j.program())
}

const FOCUS_SOURCES: &[&str] = &["@astryxdesign/core", "@astryxdesign/core/hooks", "@xds/core", "@xds/core/hooks"];

pub fn remove_focus_isrtl_option(source: &str, path: &str, _o: &Value) -> TResult {
    if !source.contains("isRtl") {
        return Ok(None);
    }
    let mut j = parse_file(source, path)?;
    let mut bindings: Vec<(String, usize)> = vec![];
    for ip in j.find("ImportDeclaration") {
        match source_value(&j, ip.node) {
            Some(s) if FOCUS_SOURCES.contains(&s.as_str()) => {}
            _ => continue,
        }
        for s in j.ast.list(ip.node, "specifiers") {
            if j.ast.is(s, "ImportSpecifier") && matches!(imported_name(&j, s).as_deref(), Some("useGridFocus") | Some("useListFocus")) {
                let l = local_name(&j, s).or_else(|| imported_name(&j, s)).unwrap();
                let sc = import_scope(&j, &ip, &l);
                match bindings.iter_mut().find(|e| e.0 == l) {
                    Some(e) => e.1 = sc,
                    None => bindings.push((l, sc)),
                }
            }
        }
    }
    if bindings.is_empty() {
        return Ok(None);
    }
    let mut changed = false;
    for p in j.find("CallExpression") {
        let callee = j.ast.child(p.node, "callee").unwrap();
        if j.ast.ty(callee) != "Identifier" {
            continue;
        }
        let cn = j.ast.name(callee).unwrap_or("").to_string();
        let sc = match bindings.iter().find(|e| e.0 == cn) {
            Some(e) => e.1,
            None => continue,
        };
        if j.lookup_scope(&p, &cn) != Some(sc) {
            continue;
        }
        let opts = match j.ast.list(p.node, "arguments").first().copied() {
            Some(o) if j.ast.is(o, "ObjectExpression") => o,
            _ => continue,
        };
        let props = j.ast.list(opts, "properties");
        let kept: Vec<usize> = props.iter().copied().filter(|&pr| static_property_name(&j, pr).as_deref() != Some("isRtl")).collect();
        changed = changed || kept.len() != props.len();
        j.ast.set_list(opts, "properties", kept);
    }
    done(&j, changed)
}

const RESIZABLE_SOURCES: &[&str] = &["@astryxdesign/core", "@astryxdesign/core/Resizable", "@xds/core", "@xds/core/Resizable"];
const RESIZE_RENAMES: &[(&str, &str)] = &[("minSizePx", "minSize"), ("maxSizePx", "maxSize")];
const MANUAL_MIGRATION_COMMENT: &str = " TODO(astryx upgrade): This useResizable configuration contains a spread or computed property. Rename minSizePx/maxSizePx to minSize/maxSize manually without changing property precedence. ";

pub fn unwrap_ts(j: &J, n: Option<usize>) -> Option<usize> {
    let mut cur = n;
    while let Some(c) = cur {
        if matches!(j.ast.ty(c), "TSAsExpression" | "TSSatisfiesExpression" | "TSTypeAssertion" | "TSNonNullExpression" | "ParenthesizedExpression") {
            cur = j.ast.child(c, "expression");
        } else {
            break;
        }
    }
    cur
}

fn rename_key(j: &mut J, prop: usize, next: &str) {
    if j.ast.flag(prop, "shorthand") {
        j.ast.set(prop, "shorthand", V::Bool(false));
    }
    let key = j.ast.child(prop, "key").unwrap();
    if j.ast.is(key, "Identifier") {
        let k = j.identifier(next);
        j.ast.set_node(prop, "key", k);
    } else {
        j.ast.set(key, "value", V::s(next));
    }
}

fn migrate_resize_object(j: &mut J, obj: usize) -> bool {
    let props = j.ast.list(obj, "properties");
    let first_old = props.iter().copied().find(|&p| static_property_name(j, p).map(|n| RESIZE_RENAMES.iter().any(|e| e.0 == n)).unwrap_or(false));
    let has_dynamic = props.iter().any(|&p| matches!(j.ast.get(p, "computed"), V::Bool(true)) || matches!(j.ast.ty(p), "SpreadElement" | "ExperimentalSpreadProperty"));
    if let (Some(f), true) = (first_old, has_dynamic) {
        let mut cs = comments_of(j, f).unwrap_or_default();
        let present = cs.iter().any(|&c| j.ast.str_of(c, "value") == Some(MANUAL_MIGRATION_COMMENT));
        if !present {
            let c = comment(j, true, MANUAL_MIGRATION_COMMENT, true, false);
            cs.push(c);
        }
        set_comments(j, f, cs);
        return !present;
    }
    let mut changed = false;
    for (old, new) in RESIZE_RENAMES {
        let props = j.ast.list(obj, "properties");
        let has_new = props.iter().any(|&p| static_property_name(j, p).as_deref() == Some(*new));
        let mut next = vec![];
        for p in props {
            if static_property_name(j, p).as_deref() != Some(*old) {
                next.push(p);
                continue;
            }
            changed = true;
            if !has_new {
                rename_key(j, p, new);
                next.push(p);
            }
        }
        j.ast.set_list(obj, "properties", next);
    }
    changed
}

pub fn rename_resizable_pixel_bounds(source: &str, path: &str, _o: &Value) -> TResult {
    if !source.contains("minSizePx") && !source.contains("maxSizePx") {
        return Ok(None);
    }
    let mut j = parse_file(source, path)?;
    let mut bindings: Vec<(String, usize)> = vec![];
    let mut namespaces: Vec<(String, usize)> = vec![];
    let upsert = |v: &mut Vec<(String, usize)>, k: String, s: usize| match v.iter_mut().find(|e| e.0 == k) {
        Some(e) => e.1 = s,
        None => v.push((k, s)),
    };
    for ip in j.find("ImportDeclaration") {
        match source_value(&j, ip.node) {
            Some(s) if RESIZABLE_SOURCES.contains(&s.as_str()) => {}
            _ => continue,
        }
        for s in j.ast.list(ip.node, "specifiers") {
            if j.ast.is(s, "ImportSpecifier") && imported_name(&j, s).as_deref() == Some("useResizable") {
                let l = local_name(&j, s).unwrap_or("useResizable".into());
                let sc = import_scope(&j, &ip, &l);
                upsert(&mut bindings, l, sc);
            } else if j.ast.is(s, "ImportNamespaceSpecifier") {
                let l = local_name(&j, s).unwrap_or_default();
                let sc = import_scope(&j, &ip, &l);
                upsert(&mut namespaces, l, sc);
            }
        }
    }
    if bindings.is_empty() && namespaces.is_empty() {
        return Ok(None);
    }
    let mut changed = false;
    for p in j.find("CallExpression") {
        let callee = j.ast.child(p.node, "callee").unwrap();
        let ok = if j.ast.ty(callee) == "Identifier" {
            let cn = j.ast.name(callee).unwrap_or("");
            bindings.iter().find(|e| e.0 == cn).map(|e| j.lookup_scope(&p, cn) == Some(e.1)).unwrap_or(false)
        } else if j.ast.ty(callee) == "MemberExpression" && !j.ast.flag(callee, "computed") {
            let o = j.ast.child(callee, "object").unwrap();
            let pr = j.ast.child(callee, "property").unwrap();
            j.ast.ty(o) == "Identifier" && j.ast.ty(pr) == "Identifier" && j.ast.name(pr) == Some("useResizable") && {
                let on = j.ast.name(o).unwrap_or("");
                namespaces.iter().find(|e| e.0 == on).map(|e| j.lookup_scope(&p, on) == Some(e.1)).unwrap_or(false)
            }
        } else {
            false
        };
        if !ok {
            continue;
        }
        let first = j.ast.list(p.node, "arguments").first().copied();
        let config = match unwrap_ts(&j, first) {
            Some(c) if j.ast.is(c, "ObjectExpression") => c,
            _ => continue,
        };
        changed = migrate_resize_object(&mut j, config) || changed;
        let regions = j.ast.list(config, "properties").into_iter().find(|&pr| static_property_name(&j, pr).as_deref() == Some("regions"));
        let regions = match regions {
            Some(r) if j.ast.has(r, "value") => r,
            _ => continue,
        };
        let ro = match unwrap_ts(&j, j.ast.child(regions, "value")) {
            Some(r) if j.ast.is(r, "ObjectExpression") => r,
            _ => continue,
        };
        for region in j.ast.list(ro, "properties") {
            let rc = if j.ast.has(region, "value") { unwrap_ts(&j, j.ast.child(region, "value")) } else { None };
            if let Some(rc) = rc {
                if j.ast.is(rc, "ObjectExpression") {
                    changed = migrate_resize_object(&mut j, rc) || changed;
                }
            }
        }
    }
    done(&j, changed)
}
