//! v0.4.0 transforms.

use super::lhelp::*;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

const TABLE_SOURCES: &[&str] = &["@astryxdesign/core", "@astryxdesign/core/Table", "@xds/core", "@xds/core/Table"];

fn prop_key_string(j: &J, prop: usize) -> Option<String> {
    let k = j.ast.child(prop, "key")?;
    if let Some(n) = j.ast.str_of(k, "name") {
        return Some(n.to_string());
    }
    match j.ast.get(k, "value") {
        V::Str(s) if !s.is_empty() => Some(s.to_string()),
        V::Num(n) if *n != 0.0 && !n.is_nan() => Some(crate::json::js_number_to_string(*n)),
        V::Bool(true) => Some("true".into()),
        _ => None,
    }
}

pub fn migrate_table_rowexpansion(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut state_local: Option<String> = None;
    let mut plugin_local: Option<String> = None;
    let mut import_paths: Vec<usize> = vec![];
    for ip in j.find("ImportDeclaration") {
        match source_value(&j, ip.node) {
            Some(s) if TABLE_SOURCES.contains(&s.as_str()) => {}
            _ => continue,
        }
        for s in j.ast.list(ip.node, "specifiers") {
            if !j.ast.is(s, "ImportSpecifier") {
                continue;
            }
            let i = imported_name(&j, s).unwrap_or_default();
            if i == "useTableRowExpansionState" {
                state_local = Some(local_name(&j, s).unwrap_or(i.clone()));
                import_paths.push(ip.node);
            }
            if i == "useTableRowExpansion" {
                plugin_local = Some(local_name(&j, s).unwrap_or(i.clone()));
            }
        }
    }
    let state_local = match state_local {
        Some(s) => s,
        None => return Ok(None),
    };
    let mut changed = false;
    for p in j.find("CallExpression") {
        if callee_name(&j, p.node).as_deref() != Some(state_local.as_str()) {
            continue;
        }
        let arg = match j.ast.list(p.node, "arguments").first().copied() {
            Some(a) if j.ast.is(a, "ObjectExpression") => a,
            _ => continue,
        };
        let mut next = vec![];
        for prop in j.ast.list(arg, "properties") {
            let key = prop_key_string(&j, prop);
            let val = j.ast.child(prop, "value");
            let rename = |j: &mut J, name: &str| {
                let k = j.identifier(name);
                let v = val.unwrap();
                prop_init(j, k, v)
            };
            match key.as_deref() {
                Some("baseData") => next.push(rename(&mut j, "data")),
                Some("getChildren") => {}
                Some("getRowKey") => next.push(rename(&mut j, "idKey")),
                Some("getIsItemExpandable") => next.push(rename(&mut j, "isItemExpandable")),
                Some("expandedKeys") | Some("setExpandedKeys") => {}
                _ => next.push(prop),
            }
        }
        let k = j.identifier("childrenKey");
        let v = j.literal_str("children");
        let ck = prop_init(&mut j, k, v);
        let at = next.len().min(1);
        next.insert(at, ck);
        j.ast.set_list(arg, "properties", next);
        let c = j.identifier("useTableTreeState");
        j.ast.set_node(p.node, "callee", c);
        changed = true;

        let declarator = p.parent().unwrap();
        if j.ast.is(declarator, "VariableDeclarator") {
            let id = j.ast.child(declarator, "id").unwrap();
            if j.ast.is(id, "ObjectPattern") {
                for pp in j.ast.list(id, "properties") {
                    if !matches!(j.ast.ty(pp), "ObjectProperty" | "Property") {
                        continue;
                    }
                    match key_name(&j, pp).as_deref() {
                        Some("data") => {
                            let k = j.identifier("visibleData");
                            j.ast.set_node(pp, "key", k);
                            if j.ast.flag(pp, "shorthand") {
                                j.ast.set(pp, "shorthand", V::Bool(false));
                                let v = j.identifier("data");
                                j.ast.set_node(pp, "value", v);
                            }
                        }
                        Some("expansionConfig") => {
                            let k = j.identifier("treeConfig");
                            j.ast.set_node(pp, "key", k);
                            if j.ast.child(pp, "value").map(|v| j.ast.is(v, "Identifier")).unwrap_or(false) {
                                let v = j.identifier("treeConfig");
                                j.ast.set_node(pp, "value", v);
                                j.ast.set(pp, "shorthand", V::Bool(true));
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        let stmt = p.parent_path().and_then(|pp| pp.parent());
        if let Some(stmt) = stmt {
            if comments_of(&j, stmt).is_none() {
                let a = comment(&mut j, false, " astryx-migration: verify tree expansion state. useTableTreeState", true, false);
                let b = comment(&mut j, false, " is uncontrolled by default; pass defaultExpandedIds, or", true, false);
                let c = comment(&mut j, false, " expandedIds + onExpandedIdsChange for the old controlled set.", true, false);
                set_comments(&mut j, stmt, vec![a, b, c]);
            }
        }
    }
    if let Some(pl) = &plugin_local {
        for p in j.find("CallExpression") {
            if callee_name(&j, p.node).as_deref() != Some(pl.as_str()) {
                continue;
            }
            let mut args = j.ast.list(p.node, "arguments");
            if let Some(&a) = args.first() {
                if j.ast.is(a, "Identifier") && j.ast.name(a) == Some("expansionConfig") {
                    args[0] = j.identifier("treeConfig");
                    j.ast.set_list(p.node, "arguments", args);
                }
            }
            let c = j.identifier("useTableTreeData");
            j.ast.set_node(p.node, "callee", c);
            changed = true;
        }
    }
    if !changed {
        return Ok(None);
    }
    for ip in import_paths {
        let mut specs: Vec<usize> = j.ast.list(ip, "specifiers").into_iter().filter(|&s| !(j.ast.is(s, "ImportSpecifier") && matches!(imported_name(&j, s).as_deref(), Some("useTableRowExpansionState") | Some("useTableRowExpansion")))).collect();
        let existing: Vec<Option<String>> = specs.iter().map(|&s| imported_name(&j, s)).collect();
        for n in ["useTableTreeState", "useTableTreeData"] {
            if !existing.iter().any(|e| e.as_deref() == Some(n)) {
                let i = j.identifier(n);
                specs.push(j.b("ImportSpecifier", vec![("imported", V::Node(i)), ("local", V::Null)]));
            }
        }
        j.ast.set_list(ip, "specifiers", specs);
    }
    Ok(Some(j.to_source_single()))
}

const OLD_TARGET: &str = "dropdown-menu-radio-dot";
const NEW_TARGET: &str = "radio-indicator-dot";
const OLD_CLASS: &str = "astryx-dropdown-menu-radio-dot";
const NEW_CLASS: &str = "astryx-radio-indicator-dot";
const RADIO_TODO: &str = " TODO(astryx upgrade): `dropdown-menu-radio-dot` became `radio-indicator-dot`, which styles EVERY radio dot, not just the ones in a menu. If this rule was meant to be menu-only, scope it under the containing `dropdown-menu-radio` target instead of this one. ";

fn rename_in(v: &str) -> Option<String> {
    if v == OLD_TARGET {
        return Some(NEW_TARGET.into());
    }
    if v.contains(OLD_CLASS) {
        return Some(v.replace(OLD_CLASS, NEW_CLASS));
    }
    None
}

fn attach_todo(j: &mut J, p: &NPath) {
    let parent = p.parent();
    let host = match parent {
        Some(pa) if matches!(j.ast.ty(pa), "ObjectProperty" | "Property") => pa,
        _ => p.node,
    };
    let mut cs = comments_of(j, host).unwrap_or_default();
    if cs.iter().any(|&c| j.ast.str_of(c, "value") == Some(RADIO_TODO)) {
        set_comments(j, host, cs);
        return;
    }
    let c = comment(j, true, RADIO_TODO, true, false);
    cs.push(c);
    set_comments(j, host, cs);
}

pub fn rename_dropdown_menu_radio_dot(source: &str, path: &str, _o: &Value) -> TResult {
    if !source.contains(OLD_TARGET) {
        return Ok(None);
    }
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("StringLiteral") {
        let v = match j.ast.str_of(p.node, "value") {
            Some(v) => v.to_string(),
            None => continue,
        };
        if let Some(r) = rename_in(&v) {
            j.ast.set(p.node, "value", V::s(&r));
            attach_todo(&mut j, &p);
            changed = true;
        }
    }
    for p in j.find("Literal") {
        let v = match j.ast.get(p.node, "value") {
            V::Str(s) => s.to_string(),
            _ => continue,
        };
        if let Some(r) = rename_in(&v) {
            j.ast.set(p.node, "value", V::s(&r));
            if let V::Str(raw) = j.ast.get(p.node, "raw").clone() {
                j.ast.set(p.node, "raw", V::s(&raw.replace(OLD_TARGET, NEW_TARGET)));
            }
            attach_todo(&mut j, &p);
            changed = true;
        }
    }
    for p in j.find("TemplateElement") {
        let val = j.ast.get(p.node, "value").clone();
        let cooked = match val.obj_get("cooked") {
            V::Str(s) => s.to_string(),
            _ => continue,
        };
        if let Some(r) = rename_in(&cooked) {
            let raw = val.obj_get("raw").as_str().unwrap_or("").replace(OLD_CLASS, NEW_CLASS).replace(OLD_TARGET, NEW_TARGET);
            j.ast.set(p.node, "value", V::Obj(vec![("raw", V::s(&raw)), ("cooked", V::s(&r))]));
            changed = true;
        }
    }
    done(&j, changed)
}

const DIVIDER_RENAMES: &[(&str, &str)] = &[("DropdownMenuDivider", "DropdownMenuDividerData"), ("ContextMenuDivider", "ContextMenuDividerData"), ("BreadcrumbMenuDivider", "BreadcrumbMenuDividerData")];

fn divider_used_as_value(j: &J, name: &str) -> bool {
    for p in j.find("Identifier") {
        if j.ast.name(p.node) != Some(name) {
            continue;
        }
        if j.ast.is(p.node, "JSXIdentifier") {
            return true;
        }
        let parent = p.parent().unwrap();
        match j.ast.ty(parent) {
            "ImportSpecifier" | "ImportDefaultSpecifier" | "TSTypeReference" | "TSQualifiedName" | "TSTypeAliasDeclaration" | "TSInterfaceDeclaration" | "TSExpressionWithTypeArguments" => {}
            "ExportSpecifier" => {
                if j.ast.str_of(parent, "exportKind") != Some("type") {
                    return true;
                }
            }
            _ => return true,
        }
    }
    false
}

pub fn rename_menu_divider_data_types(source: &str, path: &str, _o: &Value) -> TResult {
    if !DIVIDER_RENAMES.iter().any(|(k, _)| source.contains(k)) {
        return Ok(None);
    }
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for ip in j.find("ImportDeclaration") {
        let src = match j.ast.child(ip.node, "source").map(|s| j.ast.get(s, "value").clone()) {
            Some(V::Str(s)) => s.to_string(),
            Some(V::Num(n)) => crate::json::js_number_to_string(n),
            Some(V::Bool(b)) => b.to_string(),
            _ => String::new(),
        };
        if !src.starts_with("@astryxdesign/core") {
            continue;
        }
        let decl_type = j.ast.str_of(ip.node, "importKind") == Some("type");
        for s in j.ast.list(ip.node, "specifiers") {
            if !j.ast.is(s, "ImportSpecifier") {
                continue;
            }
            let i = imported_name(&j, s).unwrap_or_default();
            let renamed = match crate::commands::upgrade::transforms::jsproto::lookup(DIVIDER_RENAMES, &i) {
                Some(h) => h.string(),
                None => continue,
            };
            let renamed = renamed.as_str();
            let local = local_name(&j, s).unwrap_or(i.clone());
            let aliased = local != i;
            let type_only = decl_type || j.ast.str_of(s, "importKind") == Some("type");
            if !type_only && divider_used_as_value(&j, &local) {
                continue;
            }
            let imp = j.ast.child(s, "imported").unwrap();
            j.set_name(imp, renamed);
            changed = true;
            if aliased {
                continue;
            }
            let l = j.ast.child(s, "local").unwrap();
            j.set_name(l, renamed);
            for r in j.find("TSTypeReference") {
                if let Some(tn) = j.ast.child(r.node, "typeName") {
                    if j.ast.is(tn, "Identifier") && j.ast.name(tn) == Some(local.as_str()) {
                        j.set_name(tn, renamed);
                    }
                }
            }
        }
    }
    done(&j, changed)
}
