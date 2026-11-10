//! v0.1.0 transforms.

use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::jsre;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

fn rewrite_import_specifier(spec: &str) -> String {
    if !spec.starts_with("@xds/") {
        return spec.to_string();
    }
    let mut next = jsre::replace(r"^@xds\/theme-daily(\/|$)", "", spec, "@astryxdesign/theme-neutral$1");
    if next == spec {
        next = jsre::replace(r"^@xds\/", "", spec, "@astryxdesign/");
    }
    jsre::replace(r"^@astryxdesign\/core\/xds\.css$", "", &next, "@astryxdesign/core/astryx.css")
}

pub fn migrate_xds_css_surfaces(source: &str, _path: &str, _o: &Value) -> TResult {
    let mut next = jsre::replace(r"\.xds-", "g", source, ".astryx-");
    next = jsre::replace(r"\[data-xds-", "g", &next, "[data-astryx-");
    next = jsre::replace_fn(r"@layer\b[^{;]*", "g", &next, |g| {
        jsre::replace_fn(r"\bxds-(?:theme|base)\b", "g", g[0].unwrap(), |h| match h[0].unwrap() {
            "xds-theme" => "astryx-theme".into(),
            "xds-base" => "astryx-base".into(),
            o => o.to_string(),
        })
    });
    next = jsre::replace_fn(r#"@import\s+(?:url\(\s*)?(['"])(@xds\/[^'"]+)\1"#, "g", &next, |g| {
        let m = g[0].unwrap();
        let spec = g[2].unwrap();
        let n = rewrite_import_specifier(spec);
        if n == spec {
            m.to_string()
        } else {
            m.replacen(spec, &n, 1)
        }
    });
    Ok(if next == source { None } else { Some(next) })
}

const PACKAGE_RENAMES: &[(&str, &str)] = &[
    ("@xds/build", "@astryxdesign/build"),
    ("@xds/cli", "@astryxdesign/cli"),
    ("@xds/core", "@astryxdesign/core"),
    ("@xds/lab", "@astryxdesign/lab"),
    ("@xds/theme-butter", "@astryxdesign/theme-butter"),
    ("@xds/theme-chocolate", "@astryxdesign/theme-chocolate"),
    ("@xds/theme-daily", "@astryxdesign/theme-neutral"),
    ("@xds/theme-gothic", "@astryxdesign/theme-gothic"),
    ("@xds/theme-matcha", "@astryxdesign/theme-matcha"),
    ("@xds/theme-neutral", "@astryxdesign/theme-neutral"),
    ("@xds/theme-stone", "@astryxdesign/theme-stone"),
    ("@xds/theme-y2k", "@astryxdesign/theme-y2k"),
];

fn rename_package(v: &str) -> String {
    for (from, to) in PACKAGE_RENAMES {
        if v == *from {
            return to.to_string();
        }
        if v.starts_with(&format!("{}/", from)) {
            return format!("{}{}", to, &v[from.len()..]);
        }
    }
    v.to_string()
}

pub fn migrate_xds_declare_module(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("TSModuleDeclaration") {
        let id = match j.ast.child(p.node, "id") {
            Some(i) => i,
            None => continue,
        };
        if !matches!(j.ast.ty(id), "StringLiteral" | "Literal") {
            continue;
        }
        let v = match j.ast.str_of(id, "value") {
            Some(v) => v.to_string(),
            None => continue,
        };
        let n = rename_package(&v);
        if n != v {
            j.ast.set(id, "value", V::s(&n));
            changed = true;
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

fn rewrite_literal(j: &mut J, node: Option<usize>) -> bool {
    let n = match node {
        Some(n) => n,
        None => return false,
    };
    let v = match j.ast.str_of(n, "value") {
        Some(v) => v.to_string(),
        None => return false,
    };
    let next = rename_package(&v);
    if next == v {
        return false;
    }
    j.ast.set(n, "value", V::s(&next));
    true
}

fn is_mock_callee(j: &J, c: usize) -> bool {
    if j.ast.is(c, "MemberExpression") && !j.ast.flag(c, "computed") {
        let o = j.ast.child(c, "object").unwrap();
        let p = j.ast.child(c, "property").unwrap();
        if j.ast.is(o, "Identifier") && matches!(j.ast.name(o), Some("vi") | Some("jest")) && j.ast.is(p, "Identifier") && matches!(j.ast.name(p), Some("mock") | Some("doMock")) {
            return true;
        }
    }
    j.ast.is(c, "Identifier") && j.ast.name(c) == Some("mock")
}

/// Every node under `root` (all fields, `comments` excluded), pre-order.
fn all_nodes(j: &J, root: usize) -> Vec<usize> {
    let start = NPath { node: root, parents: vec![] };
    let mut out = Vec::new();
    j.walk(&start, &mut |p| out.push(p.node));
    out
}

pub fn migrate_xds_module_specifiers(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("ImportDeclaration") {
        let src = j.ast.child(p.node, "source");
        let sv = src.and_then(|s| j.ast.str_of(s, "value")).map(|s| s.to_string());
        if let Some(sv) = &sv {
            if sv == "@xds/theme-daily" || sv.starts_with("@xds/theme-daily/") {
                let specs = j.ast.list(p.node, "specifiers");
                let mut out = Vec::new();
                let mut c = false;
                for s in specs {
                    if j.ast.is(s, "ImportSpecifier") && j.name_of(j.ast.child(s, "imported")).as_deref() == Some("defaultTheme") {
                        let local = j.name_of(j.ast.child(s, "local")).unwrap_or_default();
                        let ns = j.import_specifier("neutralTheme", Some(&local));
                        out.push(ns);
                        c = true;
                    } else {
                        out.push(s);
                    }
                }
                j.ast.set_list(p.node, "specifiers", out);
                changed = c || changed;
            }
        }
        changed = rewrite_literal(&mut j, src) || changed;
    }
    for ty in ["ExportNamedDeclaration", "ExportAllDeclaration"] {
        for p in j.find(ty) {
            let src = j.ast.child(p.node, "source");
            changed = rewrite_literal(&mut j, src) || changed;
        }
    }
    for p in j.find("CallExpression") {
        let callee = j.ast.child(p.node, "callee").unwrap();
        let ok = j.ast.is(callee, "Import") || (j.ast.is(callee, "Identifier") && j.ast.name(callee) == Some("require")) || is_mock_callee(&j, callee);
        if ok {
            if let Some(arg) = j.ast.list(p.node, "arguments").first().copied() {
                if matches!(j.ast.ty(arg), "StringLiteral" | "Literal") {
                    changed = rewrite_literal(&mut j, Some(arg)) || changed;
                }
            }
        }
    }
    for n in all_nodes(&j, j.root) {
        if j.ast.is(n, "TSImportType") {
            if let Some(a) = j.ast.child(n, "argument") {
                changed = rewrite_literal(&mut j, Some(a)) || changed;
            }
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

fn alias_name(n: &str) -> String {
    n.replacen("XDS", "Astryx", 1)
}

fn bare_name(n: &str) -> Option<String> {
    if n.starts_with("useXDS") && n.len() > 6 {
        return Some(format!("use{}", &n[6..]));
    }
    if n.starts_with("XDS") && n.encode_utf16().count() > 3 {
        let c = n[3..].chars().next().unwrap();
        let up: String = c.to_uppercase().collect();
        let low: String = c.to_lowercase().collect();
        if up == c.to_string() && low != c.to_string() {
            return Some(n[3..].to_string());
        }
    }
    None
}

fn is_xds_core(s: &str) -> bool {
    jsre::test(r"^@xds\/core(\/.*)?$", "", s)
}

fn is_jsx_element_name(j: &J, p: &NPath) -> bool {
    let parent = match p.parent() {
        Some(x) => x,
        None => return false,
    };
    match j.ast.ty(parent) {
        "JSXOpeningElement" | "JSXClosingElement" => j.ast.child(parent, "name") == Some(p.node),
        "JSXMemberExpression" => j.ast.child(parent, "object") == Some(p.node) || j.ast.child(parent, "property") == Some(p.node),
        _ => false,
    }
}

pub fn drop_xds_prefix_imports(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let mut renames: Vec<(String, String)> = Vec::new();
    let set_r = |r: &mut Vec<(String, String)>, k: &str, v: &str| {
        if let Some(e) = r.iter_mut().find(|e| e.0 == k) {
            e.1 = v.to_string();
        } else {
            r.push((k.to_string(), v.to_string()));
        }
    };
    let mut existing: std::collections::HashSet<String> = Default::default();
    for p in j.find("ImportDeclaration") {
        for s in j.ast.list(p.node, "specifiers") {
            if let Some(n) = j.name_of(j.ast.child(s, "local")) {
                if !n.is_empty() {
                    existing.insert(n);
                }
            }
        }
    }
    let collect = |j: &J, n: usize, ex: &mut std::collections::HashSet<String>| match j.ast.ty(n) {
        "FunctionDeclaration" | "ClassDeclaration" | "TSTypeAliasDeclaration" | "TSInterfaceDeclaration" => {
            if let Some(id) = j.ast.child(n, "id") {
                if let Some(nm) = j.ast.name(id) {
                    ex.insert(nm.to_string());
                }
            }
        }
        "VariableDeclaration" => {
            for d in j.ast.list(n, "declarations") {
                if let Some(id) = j.ast.child(d, "id") {
                    if j.ast.is(id, "Identifier") {
                        ex.insert(j.ast.name(id).unwrap_or("").to_string());
                    }
                }
            }
        }
        _ => {}
    };
    for p in j.find("Program") {
        for st in j.ast.list(p.node, "body") {
            collect(&j, st, &mut existing);
            if matches!(j.ast.ty(st), "ExportNamedDeclaration" | "ExportDefaultDeclaration") {
                if let Some(d) = j.ast.child(st, "declaration") {
                    collect(&j, d, &mut existing);
                }
            }
        }
    }
    for p in j.find("ImportDeclaration") {
        let sv = j.ast.child(p.node, "source").and_then(|s| j.ast.str_of(s, "value")).map(|s| s.to_string());
        if !sv.map(|s| is_xds_core(&s)).unwrap_or(false) {
            continue;
        }
        let specs = j.ast.list(p.node, "specifiers");
        let mut out = Vec::new();
        for s in specs {
            if !j.ast.is(s, "ImportSpecifier") {
                out.push(s);
                continue;
            }
            let imported = j.name_of(j.ast.child(s, "imported")).unwrap_or_default();
            let bare = match bare_name(&imported) {
                Some(b) => b,
                None => {
                    out.push(s);
                    continue;
                }
            };
            let local = j.name_of(j.ast.child(s, "local")).unwrap_or_default();
            changed = true;
            if local != imported {
                out.push(j.import_specifier(&bare, Some(&local)));
                continue;
            }
            if bare != imported && existing.contains(&bare) {
                let alias = alias_name(&imported);
                set_r(&mut renames, &imported, &alias);
                existing.insert(alias.clone());
                out.push(j.import_specifier(&bare, Some(&alias)));
                continue;
            }
            set_r(&mut renames, &imported, &bare);
            existing.insert(bare.clone());
            out.push(j.import_specifier(&bare, Some(&bare)));
        }
        j.ast.set_list(p.node, "specifiers", out);
    }
    for p in j.find("ExportNamedDeclaration") {
        let src = match j.ast.child(p.node, "source") {
            Some(s) => s,
            None => continue,
        };
        if !j.ast.str_of(src, "value").map(is_xds_core).unwrap_or(false) {
            continue;
        }
        for s in j.ast.list(p.node, "specifiers") {
            if !j.ast.is(s, "ExportSpecifier") {
                continue;
            }
            let local = j.ast.child(s, "local").unwrap();
            let ln = j.ast.name(local).unwrap_or("").to_string();
            let bare = match bare_name(&ln) {
                Some(b) => b,
                None => continue,
            };
            j.set_name(local, &bare);
            let ex = j.ast.child(s, "exported").unwrap();
            if j.ast.name(ex) == Some(ln.as_str()) {
                j.set_name(ex, &bare);
            }
            changed = true;
        }
    }
    let mut seen = std::collections::HashSet::new();
    for p in j.find("CallExpression") {
        let callee = j.ast.child(p.node, "callee").unwrap();
        if !is_mock_callee(&j, callee) {
            continue;
        }
        let args = j.ast.list(p.node, "arguments");
        let first = args.first().copied();
        let v = first.filter(|a| matches!(j.ast.ty(*a), "StringLiteral" | "Literal")).and_then(|a| j.ast.str_of(a, "value")).map(|s| s.to_string());
        if !v.map(|s| is_xds_core(&s)).unwrap_or(false) {
            continue;
        }
        for a in args.into_iter().skip(1) {
            for n in all_nodes(&j, a) {
                if !seen.insert(n) {
                    continue;
                }
                if matches!(j.ast.ty(n), "ObjectProperty" | "Property") && !j.ast.flag(n, "computed") {
                    if let Some(k) = j.ast.child(n, "key") {
                        if j.ast.is(k, "Identifier") {
                            let kn = j.ast.name(k).unwrap_or("").to_string();
                            if let Some(b) = bare_name(&kn) {
                                if b != kn {
                                    j.set_name(k, &b);
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if renames.is_empty() {
        return Ok(if changed { Some(j.to_source(None)) } else { None });
    }
    for p in j.find("Identifier") {
        let n = j.ast.name(p.node).unwrap_or("").to_string();
        let new = match renames.iter().find(|e| e.0 == n) {
            Some(e) => e.1.clone(),
            None => continue,
        };
        let parent = p.parent().unwrap();
        let pt = j.ast.ty(parent);
        if matches!(pt, "ObjectProperty" | "Property") && j.ast.child(parent, "key") == Some(p.node) && !j.ast.flag(parent, "computed") {
            continue;
        }
        if pt == "MemberExpression" && j.ast.child(parent, "property") == Some(p.node) && !j.ast.flag(parent, "computed") {
            continue;
        }
        if pt == "ImportSpecifier" || is_jsx_element_name(&j, &p) {
            continue;
        }
        j.set_name(p.node, &new);
        changed = true;
    }
    for n in all_nodes(&j, j.root) {
        if j.ast.is(n, "TSTypeReference") {
            if let Some(tn) = j.ast.child(n, "typeName") {
                if j.ast.is(tn, "Identifier") {
                    let nm = j.ast.name(tn).unwrap_or("").to_string();
                    if let Some(e) = renames.iter().find(|e| e.0 == nm) {
                        if e.1 != nm {
                            let v = e.1.clone();
                            j.set_name(tn, &v);
                            changed = true;
                        }
                    }
                }
            }
        }
    }
    if !changed {
        return Ok(None);
    }
    let emitted = j.to_source(None);
    // Second pass: rename JSX element names by text spans of a fresh parse.
    let j2 = parse_with(&emitted, j.mode)?;
    let mut edits: Vec<(usize, usize, String)> = Vec::new();
    for p in j2.find("JSXIdentifier") {
        let nm = j2.ast.name(p.node).unwrap_or("").to_string();
        let new = match renames.iter().find(|e| e.0 == nm) {
            Some(e) if e.1 != nm => e.1.clone(),
            _ => continue,
        };
        if !is_jsx_element_name(&j2, &p) {
            continue;
        }
        let node = j2.ast.node(p.node);
        if let (Some(s), Some(e)) = (node.start, node.end) {
            edits.push((s as usize, e as usize, new));
        }
    }
    if edits.is_empty() {
        return Ok(Some(emitted));
    }
    edits.sort_by(|a, b| b.0.cmp(&a.0));
    let mut out: Vec<u16> = emitted.encode_utf16().collect();
    for (s, e, name) in edits {
        let s = s.min(out.len());
        let e = e.min(out.len()).max(s);
        let mut v: Vec<u16> = out[..s].to_vec();
        v.extend(name.encode_utf16());
        v.extend_from_slice(&out[e..]);
        out = v;
    }
    Ok(Some(String::from_utf16_lossy(&out)))
}
