//! v0.1.3: migrate `layout.components` to `experimental.xle.components`.

use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::recast::types::is_literal;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

const MANUAL: &str = "migrate layout.components to experimental.xle.components manually";

fn err(m: String) -> CodemodError {
    CodemodError::msg(m)
}

fn is_ident(t: &str) -> bool {
    t == "Identifier" || t == "JSXIdentifier"
}

fn resolve_config_object(j: &J, d: Option<usize>) -> Option<usize> {
    let d = d?;
    if j.ast.is(d, "ObjectExpression") {
        return Some(d);
    }
    if matches!(j.ast.ty(d), "CallExpression" | "OptionalCallExpression") {
        let args = j.ast.list(d, "arguments");
        if !args.is_empty() && j.ast.is(args[0], "ObjectExpression") {
            return Some(args[0]);
        }
    }
    None
}

fn has_other_reference(j: &J, name: &str, allowed: &[usize]) -> bool {
    j.find("Identifier").iter().any(|p| {
        if j.ast.name(p.node) != Some(name) {
            return false;
        }
        if allowed.contains(&p.node) {
            return false;
        }
        if let Some(parent) = p.parent() {
            let pt = j.ast.ty(parent);
            if matches!(pt, "MemberExpression" | "OptionalMemberExpression" | "JSXMemberExpression") && j.ast.child(parent, "property") == Some(p.node) && !j.ast.flag(parent, "computed") {
                return false;
            }
            if matches!(pt, "ObjectProperty" | "Property") && j.ast.child(parent, "key") == Some(p.node) && !j.ast.flag(parent, "computed") && !j.ast.flag(parent, "shorthand") {
                return false;
            }
        }
        true
    })
}

fn find_top_level_const_init(j: &J, exported: usize) -> Option<usize> {
    let name = j.ast.name(exported).unwrap_or("").to_string();
    for st in j.ast.list(j.program(), "body") {
        if !j.ast.is(st, "VariableDeclaration") || j.ast.str_of(st, "kind") != Some("const") {
            continue;
        }
        for d in j.ast.list(st, "declarations") {
            if !j.ast.is(d, "VariableDeclarator") {
                continue;
            }
            let id = match j.ast.child(d, "id") {
                Some(i) => i,
                None => continue,
            };
            if is_ident(j.ast.ty(id)) && j.ast.name(id) == Some(name.as_str()) {
                return if has_other_reference(j, &name, &[id, exported]) { None } else { j.ast.child(d, "init") };
            }
        }
    }
    None
}

fn find_object_property(j: &J, obj: usize, name: &str) -> Option<usize> {
    j.ast.list(obj, "properties").into_iter().find(|p| {
        if !matches!(j.ast.ty(*p), "ObjectProperty" | "Property") || j.ast.flag(*p, "computed") {
            return false;
        }
        let key = match j.ast.child(*p, "key") {
            Some(k) => k,
            None => return false,
        };
        let kt = j.ast.ty(key);
        if is_ident(kt) {
            return j.ast.name(key) == Some(name);
        }
        if is_literal(kt) {
            return j.ast.str_of(key, "value") == Some(name);
        }
        false
    })
}

fn clone_key(j: &mut J, key: usize) -> usize {
    let kt = j.ast.ty(key);
    if is_ident(kt) {
        let n = j.ast.name(key).unwrap_or("").to_string();
        return j.identifier(&n);
    }
    if kt == "StringLiteral" {
        let v = j.ast.str_of(key, "value").unwrap_or("").to_string();
        return j.string_literal(&v);
    }
    if is_literal(kt) {
        let v = j.ast.get(key, "value").clone();
        return j.b("Literal", vec![("value", v)]);
    }
    key
}

fn obj(j: &mut J, props: Vec<usize>) -> usize {
    j.b("ObjectExpression", vec![("properties", V::Arr(props.into_iter().map(V::Node).collect()))])
}

fn oprop(j: &mut J, key: usize, value: usize) -> usize {
    j.b("ObjectProperty", vec![("key", V::Node(key)), ("value", V::Node(value))])
}

pub fn migrate_layout_components(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let defaults = j.find("ExportDefaultDeclaration");
    if defaults.is_empty() {
        return Err(err(format!("could not statically analyze astryx config (no default export); {}", MANUAL)));
    }
    let decl = j.ast.child(defaults[0].node, "declaration");
    let target = match decl {
        Some(d) if is_ident(j.ast.ty(d)) => find_top_level_const_init(&j, d),
        other => other,
    };
    let config = resolve_config_object(&j, target).ok_or_else(|| err(format!("could not statically analyze astryx config; {}", MANUAL)))?;
    let layout = match find_object_property(&j, config, "layout") {
        Some(l) => l,
        None => return Ok(None),
    };
    let lv = j.ast.child(layout, "value").unwrap();
    if !j.ast.is(lv, "ObjectExpression") {
        return Err(err(format!("astryx config `layout` is not an object literal; {}", MANUAL)));
    }
    let comps = match find_object_property(&j, lv, "components") {
        Some(c) => c,
        None => return Ok(None),
    };
    let cv = j.ast.child(comps, "value").unwrap();
    if !j.ast.is(cv, "ObjectExpression") {
        return Err(err(format!("astryx config `layout.components` is not an object literal; {}", MANUAL)));
    }
    if j.ast.list(lv, "properties").iter().any(|p| *p != comps) {
        return Err(err(format!("astryx config `layout` has keys other than `components`; {}", MANUAL)));
    }
    let mut new_props = Vec::new();
    for prop in j.ast.list(cv, "properties") {
        if !matches!(j.ast.ty(prop), "ObjectProperty" | "Property") || j.ast.flag(prop, "computed") {
            return Err(err(format!("astryx config `layout.components` has a non-literal entry; {}", MANUAL)));
        }
        let value = j.ast.child(prop, "value").unwrap();
        let key = j.ast.child(prop, "key").unwrap();
        if j.ast.is(value, "StringLiteral") || (is_literal(j.ast.ty(value)) && j.ast.str_of(value, "value").is_some()) {
            let k = clone_key(&mut j, key);
            let s = j.ast.str_of(value, "value").unwrap_or("").to_string();
            let lit = if j.ast.is(value, "StringLiteral") { j.string_literal(&s) } else { j.literal_str(&s) };
            let from = j.identifier("from");
            let fp = oprop(&mut j, from, lit);
            let o = obj(&mut j, vec![fp]);
            new_props.push(oprop(&mut j, k, o));
            continue;
        }
        if j.ast.is(value, "ObjectExpression") {
            let k = clone_key(&mut j, key);
            new_props.push(oprop(&mut j, k, value));
            continue;
        }
        return Err(err(format!("astryx config `layout.components` entry is neither a string nor an object literal and cannot be safely migrated; {}", MANUAL)));
    }
    let migrated = obj(&mut j, new_props);
    let build_xle = |j: &mut J| {
        let c = j.identifier("components");
        let cp = oprop(j, c, migrated);
        obj(j, vec![cp])
    };
    if let Some(exp) = find_object_property(&j, config, "experimental") {
        let ev = j.ast.child(exp, "value").unwrap();
        if !j.ast.is(ev, "ObjectExpression") {
            return Err(err(format!("astryx config `experimental` is not an object literal; {}", MANUAL)));
        }
        if find_object_property(&j, ev, "xle").is_some() {
            return Err(err(format!("astryx config already defines `experimental.xle`; {}", MANUAL)));
        }
        let x = j.identifier("xle");
        let xo = build_xle(&mut j);
        let xp = oprop(&mut j, x, xo);
        let mut props = j.ast.list(ev, "properties");
        props.push(xp);
        j.ast.set_list(ev, "properties", props);
    } else {
        let x = j.identifier("xle");
        let xo = build_xle(&mut j);
        let xp = oprop(&mut j, x, xo);
        let e = j.identifier("experimental");
        let eo = obj(&mut j, vec![xp]);
        let ep = oprop(&mut j, e, eo);
        let mut props = j.ast.list(config, "properties");
        props.push(ep);
        j.ast.set_list(config, "properties", props);
    }
    let props: Vec<usize> = j.ast.list(config, "properties").into_iter().filter(|p| *p != layout).collect();
    j.ast.set_list(config, "properties", props);
    Ok(Some(j.to_source(None)))
}
