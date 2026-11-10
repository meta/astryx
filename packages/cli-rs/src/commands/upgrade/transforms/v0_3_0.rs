//! v0.3.0 transforms.

use super::lhelp::*;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::jsre;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

const AUTHORING_SOURCES: &[&str] = &[
    "@astryxdesign/cli/config",
    "@astryxdesign/cli/doc",
    "@astryxdesign/cli/integration",
    "@astryxdesign/cli/template",
    "@astryxdesign/cli/codemod",
    "@astryxdesign/core/authoring",
    "@astryxdesign/core/config",
];
const AUTHORING_TARGET: &str = "@astryxdesign/cli/authoring";

fn rewrite_source(j: &mut J, node: Option<usize>) -> bool {
    let n = match node {
        Some(n) => n,
        None => return false,
    };
    match j.ast.str_of(n, "value") {
        Some(v) if AUTHORING_SOURCES.contains(&v) => {}
        _ => return false,
    }
    j.ast.set(n, "value", V::s(AUTHORING_TARGET));
    true
}

pub fn migrate_authoring_imports(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for ty in ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"] {
        for p in j.find(ty) {
            let s = j.ast.child(p.node, "source");
            changed = rewrite_source(&mut j, s) || changed;
        }
    }
    for p in j.find("CallExpression") {
        let callee = match j.ast.child(p.node, "callee") {
            Some(c) => c,
            None => continue,
        };
        let is_import = j.ast.is(callee, "Import");
        let is_require = j.ast.is(callee, "Identifier") && j.ast.name(callee) == Some("require");
        if !is_import && !is_require {
            continue;
        }
        if let Some(arg) = j.ast.list(p.node, "arguments").first().copied() {
            if matches!(j.ast.ty(arg), "StringLiteral" | "Literal") {
                changed = rewrite_source(&mut j, Some(arg)) || changed;
            }
        }
    }
    let root = NPath { node: j.root, parents: vec![] };
    let mut imports = Vec::new();
    j.walk(&root, &mut |p| {
        if j.ast.is(p.node, "TSImportType") {
            if let Some(a) = j.ast.child(p.node, "argument") {
                imports.push(a);
            }
        }
    });
    for a in imports {
        changed = rewrite_source(&mut j, Some(a)) || changed;
    }
    done(&j, changed)
}

fn factory_stamp(name: &str) -> Option<Option<&'static str>> {
    Some(match name {
        "createConfig" | "createIntegration" => None,
        "createComponentDoc" => Some("component"),
        "createFunctionDoc" => Some("function"),
        "createDoc" => Some("generic"),
        "createPageTemplate" => Some("page"),
        "createBlockTemplate" => Some("block"),
        "createCodemod" => Some("code"),
        "createConfigCodemod" => Some("config"),
        _ => return None,
    })
}

fn type_prop(j: &mut J, kind: &str) -> usize {
    let k = j.identifier("type");
    let v = j.string_literal(kind);
    obj_prop(j, k, v)
}

fn stamp_object_type(j: &mut J, obj: usize, kind: &str) {
    let existing = j.ast.list(obj, "properties").into_iter().find(|&p| {
        if !matches!(j.ast.ty(p), "ObjectProperty" | "Property") || j.ast.flag(p, "computed") {
            return false;
        }
        let key = match j.ast.child(p, "key") {
            Some(k) => k,
            None => return false,
        };
        match j.ast.ty(key) {
            "Identifier" | "JSXIdentifier" => j.ast.name(key) == Some("type"),
            "StringLiteral" | "Literal" | "JSXText" => j.ast.str_of(key, "value") == Some("type"),
            _ => false,
        }
    });
    if let Some(e) = existing {
        let v = j.string_literal(kind);
        j.ast.set_node(e, "value", v);
        j.ast.set(e, "shorthand", V::Bool(false));
        let k = j.identifier("type");
        j.ast.set_node(e, "key", k);
    } else {
        let p = type_prop(j, kind);
        let mut props = j.ast.list(obj, "properties");
        props.push(p);
        j.ast.set_list(obj, "properties", props);
    }
}

pub fn unwrap_authoring_factories(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let mut local_to_factory: Vec<(String, String)> = Vec::new();
    for ip in j.find("ImportDeclaration") {
        match source_value(&j, ip.node) {
            Some(s) if AUTHORING_SOURCES.contains(&s.as_str()) => {}
            _ => continue,
        }
        for s in j.ast.list(ip.node, "specifiers") {
            if !j.ast.is(s, "ImportSpecifier") {
                continue;
            }
            if let Some(i) = imported_name(&j, s) {
                if factory_stamp(&i).is_some() {
                    let l = local_name(&j, s).unwrap_or(i.clone());
                    if let Some(e) = local_to_factory.iter_mut().find(|e| e.0 == l) {
                        e.1 = i;
                    } else {
                        local_to_factory.push((l, i));
                    }
                }
            }
        }
    }
    if local_to_factory.is_empty() {
        return Ok(None);
    }
    for p in j.find("CallExpression") {
        let callee = match j.ast.child(p.node, "callee") {
            Some(c) => c,
            None => continue,
        };
        if j.ast.ty(callee) != "Identifier" {
            continue;
        }
        let cname = j.ast.name(callee).unwrap_or("").to_string();
        let canonical = match local_to_factory.iter().find(|e| e.0 == cname) {
            Some(e) => e.1.clone(),
            None => continue,
        };
        let kind = factory_stamp(&canonical).unwrap();
        let arg = j.ast.list(p.node, "arguments").first().copied();
        let replacement = match (arg, kind) {
            (None, None) => obj_expr(&mut j, vec![]),
            (None, Some(k)) => {
                let tp = type_prop(&mut j, k);
                obj_expr(&mut j, vec![tp])
            }
            (Some(a), None) => a,
            (Some(a), Some(k)) if j.ast.is(a, "ObjectExpression") => {
                stamp_object_type(&mut j, a, k);
                a
            }
            (Some(a), Some(k)) => {
                let sp = j.b("SpreadElement", vec![("argument", V::Node(a))]);
                let tp = type_prop(&mut j, k);
                obj_expr(&mut j, vec![sp, tp])
            }
        };
        j.replace(&p, replacement);
        changed = true;
    }
    for ip in j.find("ImportDeclaration") {
        match source_value(&j, ip.node) {
            Some(s) if AUTHORING_SOURCES.contains(&s.as_str()) => {}
            _ => continue,
        }
        let specs = j.ast.list(ip.node, "specifiers");
        let kept: Vec<usize> = specs.iter().copied().filter(|&s| !(j.ast.is(s, "ImportSpecifier") && imported_name(&j, s).map(|i| factory_stamp(&i).is_some()).unwrap_or(false))).collect();
        if kept.len() == specs.len() {
            continue;
        }
        changed = true;
        if kept.is_empty() {
            j.remove(&ip);
        } else {
            j.ast.set_list(ip.node, "specifiers", kept);
        }
    }
    done(&j, changed)
}

/// JavaScript `Number(string)`.
pub fn js_number(s: &str) -> f64 {
    let t = crate::commands::upgrade::recast::lines::js_trim(s);
    if t.is_empty() {
        return 0.0;
    }
    let lower = t.to_ascii_lowercase();
    for (pre, radix) in [("0x", 16), ("0o", 8), ("0b", 2)] {
        if let Some(rest) = lower.strip_prefix(pre) {
            return if !rest.is_empty() && rest.chars().all(|c| c.is_digit(radix)) { u128::from_str_radix(rest, radix).map(|v| v as f64).unwrap_or(f64::NAN) } else { f64::NAN };
        }
    }
    match t {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    if t.chars().all(|c| c.is_ascii_digit() || matches!(c, '.' | 'e' | 'E' | '+' | '-')) {
        t.parse::<f64>().unwrap_or(f64::NAN)
    } else {
        f64::NAN
    }
}

const GRID_SOURCES: &[&str] = &["@astryxdesign/core", "@astryxdesign/core/Grid", "@xds/core", "@xds/core/Grid"];

pub fn migrate_grid_minchildwidth(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let locals: Vec<String> = import_locals(&j, GRID_SOURCES, &|i| i == "Grid").into_iter().map(|e| e.0).collect();
    if locals.is_empty() {
        return Ok(None);
    }
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        match jsx_ident_name(&j, p.node) {
            Some(n) if locals.contains(&n) => {}
            _ => continue,
        }
        let min_attr = match find_attr(&j, p.node, "minChildWidth") {
            Some(a) => a,
            None => continue,
        };
        let columns_attr = find_attr(&j, p.node, "columns");
        let mv = j.ast.child(min_attr, "value");
        let min_expr = match mv.map(|v| j.ast.ty(v)) {
            Some("StringLiteral") | Some("Literal") => {
                let v = mv.unwrap();
                let n = match j.ast.get(v, "value") {
                    V::Str(s) => js_number(s),
                    V::Num(n) => *n,
                    V::Bool(b) => *b as i32 as f64,
                    _ => f64::NAN,
                };
                j.literal_num(n)
            }
            Some("JSXExpressionContainer") => j.ast.child(mv.unwrap(), "expression").unwrap(),
            _ => continue,
        };
        let mut attrs = j.ast.list(p.node, "attributes");
        let idx = attrs.iter().position(|a| *a == min_attr).unwrap();
        if let Some(ca) = columns_attr {
            let cv = match j.ast.child(ca, "value") {
                Some(v) if j.ast.is(v, "JSXExpressionContainer") => v,
                _ => continue,
            };
            let ce = j.ast.child(cv, "expression");
            let num = ce.and_then(|e| if matches!(j.ast.ty(e), "NumericLiteral" | "Literal") { j.ast.get(e, "value").as_num() } else { None });
            let num = match num {
                Some(n) => n,
                None => continue,
            };
            let k1 = j.identifier("minWidth");
            let p1 = prop_init(&mut j, k1, min_expr);
            let k2 = j.identifier("max");
            let v2 = j.literal_num(num);
            let p2 = prop_init(&mut j, k2, v2);
            let k3 = j.identifier("repeat");
            let v3 = j.literal_str("fit");
            let p3 = prop_init(&mut j, k3, v3);
            let obj = obj_expr(&mut j, vec![p1, p2, p3]);
            let c = j.jsx_expression_container(obj);
            j.ast.set_node(ca, "value", c);
            attrs.remove(idx);
            j.ast.set_list(p.node, "attributes", attrs);
            changed = true;
            continue;
        }
        let k1 = j.identifier("minWidth");
        let p1 = prop_init(&mut j, k1, min_expr);
        let k3 = j.identifier("repeat");
        let v3 = j.literal_str("fit");
        let p3 = prop_init(&mut j, k3, v3);
        let obj = obj_expr(&mut j, vec![p1, p3]);
        let c = j.jsx_expression_container(obj);
        let rep = j.jsx_attribute("columns", Some(c));
        attrs[idx] = rep;
        j.ast.set_list(p.node, "attributes", attrs);
        changed = true;
    }
    done(&j, changed)
}

pub fn migrate_lab_codeblock_imports(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for ip in j.find("ImportDeclaration") {
        if source_value(&j, ip.node).as_deref() != Some("@astryxdesign/lab") {
            continue;
        }
        let mut cb = vec![];
        let mut rest = vec![];
        for s in j.ast.list(ip.node, "specifiers") {
            if j.ast.is(s, "ImportSpecifier") && matches!(imported_name(&j, s).as_deref(), Some("CodeBlock") | Some("CodeBlockProps")) {
                cb.push(s);
            } else {
                rest.push(s);
            }
        }
        if cb.is_empty() {
            continue;
        }
        let empty = rest.is_empty();
        j.ast.set_list(ip.node, "specifiers", rest);
        let decl = j.import_declaration(cb, "@astryxdesign/core/CodeBlock");
        j.insert_before(&ip, vec![decl]);
        if empty {
            j.remove(&ip);
        }
        changed = true;
    }
    done(&j, changed)
}

const NAV_SOURCES: &[&str] = &["@astryxdesign/core", "@astryxdesign/core/NavMenu", "@xds/core", "@xds/core/NavMenu"];

pub fn migrate_navmenuitem(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let mut renames: Vec<(String, String)> = vec![];
    for ip in j.find("ImportDeclaration") {
        match source_value(&j, ip.node) {
            Some(s) if NAV_SOURCES.contains(&s.as_str()) => {}
            _ => continue,
        }
        for s in j.ast.list(ip.node, "specifiers") {
            if !j.ast.is(s, "ImportSpecifier") {
                continue;
            }
            let i = imported_name(&j, s).unwrap_or_default();
            if i == "NavMenuItem" || i == "NavMenuItemProps" {
                let old = local_name(&j, s).unwrap_or(i.clone());
                let next = if i == "NavMenuItem" { "NavHeadingMenuItem" } else { "NavHeadingMenuItemProps" };
                let imp = j.ast.child(s, "imported").unwrap();
                j.set_name(imp, next);
                let l = j.identifier(next);
                j.ast.set_node(s, "local", l);
                if let Some(e) = renames.iter_mut().find(|e| e.0 == old) {
                    e.1 = next.to_string();
                } else {
                    renames.push((old, next.to_string()));
                }
                changed = true;
            }
        }
    }
    for (old, next) in &renames {
        for p in j.find("JSXIdentifier") {
            if j.ast.name(p.node) == Some(old.as_str()) {
                let n = j.jsx_identifier(next);
                j.replace(&p, n);
            }
        }
        for p in j.find("Identifier") {
            if j.ast.name(p.node) == Some(old.as_str()) {
                let n = j.identifier(next);
                j.replace(&p, n);
            }
        }
    }
    done(&j, changed)
}

const TRANSITION_REMOVED: &[&str] = &["transitionDefaults", "transitionRaw", "transitionVars", "TransitionVarName"];
const THEME_SOURCES: &[&str] = &["@astryxdesign/core", "@astryxdesign/core/theme", "@astryxdesign/core/theme/tokens.stylex", "@xds/core", "@xds/core/theme", "@xds/core/theme/tokens.stylex"];

pub fn remove_theme_transition_token_imports(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for ip in j.find("ImportDeclaration") {
        match source_value(&j, ip.node) {
            Some(s) if THEME_SOURCES.contains(&s.as_str()) => {}
            _ => continue,
        }
        let specs = j.ast.list(ip.node, "specifiers");
        let kept: Vec<usize> = specs.iter().copied().filter(|&s| !(j.ast.is(s, "ImportSpecifier") && imported_name(&j, s).map(|i| TRANSITION_REMOVED.contains(&i.as_str())).unwrap_or(false))).collect();
        let n = kept.len();
        j.ast.set_list(ip.node, "specifiers", kept);
        if n != specs.len() {
            changed = true;
            if n == 0 {
                j.remove(&ip);
            }
        }
    }
    done(&j, changed)
}

const DOCTYPE_RENAMES: &[(&str, &str)] = &[
    ("PropDoc", "ComponentPropDoc"),
    ("ExampleDoc", "ComponentExampleDoc"),
    ("AnatomyElement", "ComponentAnatomyElement"),
    ("BestPractice", "ComponentBestPractice"),
    ("PlaygroundConfig", "ComponentPlaygroundConfig"),
    ("ThemingTarget", "ComponentThemingTarget"),
    ("ComponentVar", "ComponentThemingVar"),
    ("DerivedVar", "ComponentThemingDerivedVar"),
    ("ElementDescriptor", "ComponentSlotElement"),
    ("GroupDoc", "ComponentGroupDoc"),
    ("TranslationDoc", "ComponentTranslationDoc"),
    ("ContentBlock", "ReferenceContentBlock"),
    ("TokenPreviewType", "ReferenceTokenPreviewType"),
    ("BaseDoc", "ComponentBaseDoc"),
];
const DOCTYPE_SOURCES: &[&str] = &[
    "@astryxdesign/cli/authoring",
    "@astryxdesign/cli/doc",
    "@astryxdesign/cli/template",
    "@astryxdesign/cli/integration",
    "@astryxdesign/cli/codemod",
    "@astryxdesign/core",
    "@astryxdesign/core/authoring",
];
const JSDOC_SOURCE: &str = "@astryxdesign/(?:cli/(?:authoring|doc|template|integration|codemod)|core(?:/authoring)?)";

fn doctype_rename(n: &str) -> Option<&'static str> {
    DOCTYPE_RENAMES.iter().find(|e| e.0 == n).map(|e| e.1)
}

pub fn rename_authoring_doctypes(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let mut renamed: Vec<(String, String)> = vec![];
    let mut decls = vec![];
    for ip in j.find("ImportDeclaration") {
        if source_value(&j, ip.node).map(|s| DOCTYPE_SOURCES.contains(&s.as_str())).unwrap_or(false) {
            decls.push(ip.node);
        }
    }
    for ep in j.find("ExportNamedDeclaration") {
        if source_value(&j, ep.node).map(|s| DOCTYPE_SOURCES.contains(&s.as_str())).unwrap_or(false) {
            decls.push(ep.node);
        }
    }
    for d in decls {
        for s in j.ast.list(d, "specifiers") {
            match j.ast.ty(s) {
                "ImportSpecifier" => {
                    let old = match imported_name(&j, s) {
                        Some(o) => o,
                        None => continue,
                    };
                    let next = match doctype_rename(&old) {
                        Some(n) => n,
                        None => continue,
                    };
                    let imp = j.ast.child(s, "imported").unwrap();
                    j.set_name(imp, next);
                    if let Some(l) = j.ast.child(s, "local") {
                        if j.ast.name(l) == Some(old.as_str()) {
                            j.set_name(l, next);
                            if let Some(e) = renamed.iter_mut().find(|e| e.0 == old) {
                                e.1 = next.to_string();
                            } else {
                                renamed.push((old.clone(), next.to_string()));
                            }
                        }
                    }
                    changed = true;
                }
                "ExportSpecifier" => {
                    let l = match j.ast.child(s, "local") {
                        Some(l) => l,
                        None => continue,
                    };
                    let old = match j.ast.name(l) {
                        Some(o) => o.to_string(),
                        None => continue,
                    };
                    let next = match doctype_rename(&old) {
                        Some(n) => n,
                        None => continue,
                    };
                    j.set_name(l, next);
                    if let Some(e) = j.ast.child(s, "exported") {
                        if j.ast.name(e) == Some(old.as_str()) {
                            j.set_name(e, next);
                        }
                    }
                    changed = true;
                }
                _ => {}
            }
        }
    }
    if !renamed.is_empty() {
        for p in j.find("Identifier") {
            let name = j.ast.name(p.node).unwrap_or("").to_string();
            let next = match renamed.iter().find(|e| e.0 == name) {
                Some(e) => e.1.clone(),
                None => continue,
            };
            let parent = p.parent().unwrap();
            let pt = j.ast.ty(parent);
            let is_key = |k: &str| j.ast.child(parent, k) == Some(p.node);
            if pt == "ImportSpecifier"
                || pt == "ExportSpecifier"
                || (pt == "MemberExpression" && is_key("property") && !j.ast.flag(parent, "computed"))
                || (pt == "TSQualifiedName" && is_key("right"))
                || ((pt == "ObjectProperty" || pt == "Property") && is_key("key") && !j.ast.flag(parent, "computed"))
                || (pt == "TSPropertySignature" && is_key("key"))
            {
                continue;
            }
            j.set_name(p.node, &next);
            changed = true;
        }
    }
    let mut out = if changed { j.to_source_single() } else { source.to_string() };
    let before = out.clone();
    for (old, new) in DOCTYPE_RENAMES {
        let re = format!("(import\\(['\"]{}['\"]\\)\\.){}\\b", JSDOC_SOURCE, old);
        out = jsre::replace_fn(&re, "g", &out, |g| format!("{}{}", g[1].unwrap_or(""), new));
    }
    if out != before {
        changed = true;
    }
    Ok(if changed { Some(out) } else { None })
}

const RADIO_SOURCES: &[&str] = &[
    "@astryxdesign/core",
    "@astryxdesign/core/DropdownMenu",
    "@astryxdesign/core/ContextMenu",
    "@astryxdesign/core/Breadcrumbs",
    "@xds/core",
    "@xds/core/DropdownMenu",
    "@xds/core/ContextMenu",
    "@xds/core/Breadcrumbs",
];

pub fn rename_radiogroup_arialabel(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let locals: Vec<String> = import_locals(&j, RADIO_SOURCES, &|i| matches!(i, "DropdownMenuRadioGroup" | "ContextMenuRadioGroup" | "BreadcrumbMenuRadioGroup")).into_iter().map(|e| e.0).collect();
    if locals.is_empty() {
        return Ok(None);
    }
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        match jsx_ident_name(&j, p.node) {
            Some(n) if locals.contains(&n) => {}
            _ => continue,
        }
        for a in j.ast.list(p.node, "attributes") {
            if !j.ast.is(a, "JSXAttribute") {
                continue;
            }
            let n = j.ast.child(a, "name").unwrap();
            if j.ast.is(n, "JSXIdentifier") && j.ast.name(n) == Some("aria-label") {
                j.set_name(n, "label");
                changed = true;
            }
        }
    }
    done(&j, changed)
}

const TOPNAV_SOURCES: &[&str] = &["@astryxdesign/core", "@astryxdesign/core/TopNav", "@xds/core", "@xds/core/TopNav"];

pub fn rename_topnavheading_href(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let locals: Vec<String> = import_locals(&j, TOPNAV_SOURCES, &|i| i == "TopNavHeading").into_iter().map(|e| e.0).collect();
    if locals.is_empty() {
        return Ok(None);
    }
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        match jsx_ident_name(&j, p.node) {
            Some(n) if locals.contains(&n) => {}
            _ => continue,
        }
        for a in j.ast.list(p.node, "attributes") {
            if attr_name(&j, a).as_deref() != Some("href") {
                continue;
            }
            if find_attr(&j, p.node, "headingHref").is_some() {
                continue;
            }
            let n = j.ast.child(a, "name").unwrap();
            j.set_name(n, "headingHref");
            changed = true;
        }
    }
    done(&j, changed)
}
