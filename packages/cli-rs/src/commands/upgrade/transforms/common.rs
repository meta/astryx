//! Shared helpers ported from `transform-prop.mjs`.

use crate::commands::upgrade::jsc::*;
use std::collections::HashMap;

pub struct ImportedComponents {
    /// local name → (component, props)
    pub direct: Vec<(String, String, Vec<String>)>,
    pub namespaces: Vec<String>,
}

pub struct PropOptions<'a> {
    pub matches_import: &'a dyn Fn(&str) -> bool,
    pub components: &'a [(&'a str, &'a [&'a str])],
    pub normalize: &'a dyn Fn(&str) -> String,
}

fn props_for<'a>(o: &PropOptions<'a>, comp: &str) -> Option<Vec<String>> {
    o.components.iter().find(|(c, _)| *c == comp).map(|(_, p)| p.iter().map(|s| s.to_string()).collect())
}

pub fn imported_components(j: &J, o: &PropOptions) -> ImportedComponents {
    let mut direct: Vec<(String, String, Vec<String>)> = Vec::new();
    let mut namespaces: Vec<String> = Vec::new();
    let mut set_direct = |k: String, c: String, p: Vec<String>| {
        if let Some(e) = direct.iter_mut().find(|e| e.0 == k) {
            e.1 = c;
            e.2 = p;
        } else {
            direct.push((k, c, p));
        }
    };
    for ip in j.find("ImportDeclaration") {
        let src = j.ast.child(ip.node, "source").and_then(|s| j.ast.str_of(s, "value").map(|x| x.to_string()));
        let src = match src {
            Some(s) => s,
            None => continue,
        };
        if j.ast.str_of(ip.node, "importKind") == Some("type") || !(o.matches_import)(&src) {
            continue;
        }
        let subpath = (o.normalize)(src.rsplit('/').next().unwrap_or(""));
        let subpath_props = props_for(o, &subpath);
        for s in j.ast.list(ip.node, "specifiers") {
            if j.ast.str_of(s, "importKind") == Some("type") {
                continue;
            }
            match j.ast.ty(s) {
                "ImportSpecifier" => {
                    let imported = j.ast.child(s, "imported");
                    let iname = imported.and_then(|i| j.ast.name(i).map(|x| x.to_string()).or_else(|| j.ast.str_of(i, "value").map(|x| x.to_string())));
                    let iname = match iname {
                        Some(n) => n,
                        None => continue,
                    };
                    let comp = (o.normalize)(&iname);
                    let props = match props_for(o, &comp) {
                        Some(p) => p,
                        None => continue,
                    };
                    let local = j.name_of(j.ast.child(s, "local")).unwrap_or(iname.clone());
                    set_direct(local, comp, props);
                }
                "ImportDefaultSpecifier" if subpath_props.is_some() => {
                    let local = j.name_of(j.ast.child(s, "local")).unwrap_or_default();
                    set_direct(local, subpath.clone(), subpath_props.clone().unwrap());
                }
                "ImportNamespaceSpecifier" => {
                    let local = j.name_of(j.ast.child(s, "local")).unwrap_or_default();
                    if !namespaces.contains(&local) {
                        namespaces.push(local);
                    }
                }
                _ => {}
            }
        }
    }
    ImportedComponents { direct, namespaces }
}

/// (component, props, localName) for a JSX name that resolves to an import.
pub fn resolve_imported_component(j: &J, name_node: usize, scope_path: &NPath, imports: &ImportedComponents, o: &PropOptions) -> Option<(String, Vec<String>, String)> {
    let ty = j.ast.ty(name_node);
    let (local, binding) = if ty == "JSXIdentifier" || ty == "Identifier" {
        let l = j.ast.name(name_node)?.to_string();
        let b = imports.direct.iter().find(|e| e.0 == l).map(|e| (e.1.clone(), e.2.clone()));
        (l, b)
    } else if ty == "JSXMemberExpression" || (ty == "MemberExpression" && !j.ast.flag(name_node, "computed")) {
        let obj = j.ast.child(name_node, "object")?;
        let prop = j.ast.child(name_node, "property")?;
        let ok_ty = |t: &str| t == "JSXIdentifier" || t == "Identifier";
        if !(ok_ty(j.ast.ty(obj)) && ok_ty(j.ast.ty(prop))) {
            return None;
        }
        let on = j.ast.name(obj)?.to_string();
        if !imports.namespaces.contains(&on) {
            return None;
        }
        let comp = (o.normalize)(j.ast.name(prop).unwrap_or(""));
        let b = props_for(o, &comp).map(|p| (comp, p));
        (on, b)
    } else {
        return None;
    };
    let (c, p) = binding?;
    if !j.is_module_binding(scope_path, &local) {
        return None;
    }
    Some((c, p, local))
}

/// `transformProp`: visit each matching attribute of each resolved JSX usage.
pub fn transform_prop(j: &mut J, o: &PropOptions, visit: &mut dyn FnMut(&mut J, usize, usize, &str, &str)) {
    let imports = imported_components(j, o);
    if imports.direct.is_empty() && imports.namespaces.is_empty() {
        return;
    }
    for jp in j.find("JSXOpeningElement") {
        let name = j.ast.child(jp.node, "name").unwrap();
        let (comp, props, local) = match resolve_imported_component(j, name, &jp, &imports, o) {
            Some(r) => r,
            None => continue,
        };
        let mut index = 0;
        loop {
            let attrs = j.ast.list(jp.node, "attributes");
            if index >= attrs.len() {
                break;
            }
            let a = attrs[index];
            index += 1;
            if !j.ast.is(a, "JSXAttribute") {
                continue;
            }
            let an = j.ast.child(a, "name");
            let ok = an.map(|n| j.ast.is(n, "JSXIdentifier") && props.iter().any(|p| Some(p.as_str()) == j.ast.name(n))).unwrap_or(false);
            if !ok {
                continue;
            }
            visit(j, jp.node, a, &comp, &local);
        }
    }
}

#[allow(dead_code)]
pub fn _unused(_m: HashMap<String, String>) {}
