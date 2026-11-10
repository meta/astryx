//! v0.5.0 transforms.

use super::lhelp::*;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

fn imports_core_banner(j: &J) -> bool {
    let mut found = false;
    for ip in j.find("ImportDeclaration") {
        match source_value(j, ip.node) {
            Some(s) if s.starts_with("@astryxdesign/core") => {}
            _ => continue,
        }
        for s in j.ast.list(ip.node, "specifiers") {
            let t = j.ast.ty(s);
            if (t == "ImportSpecifier" && imported_name(j, s).as_deref() == Some("Banner")) || (local_name(j, s).as_deref() == Some("Banner") && (t == "ImportDefaultSpecifier" || t == "ImportSpecifier")) {
                found = true;
            }
        }
    }
    found
}

fn collapsible_with_default(j: &mut J, e: usize) -> usize {
    let k = j.identifier("defaultIsOpen");
    let p = obj_prop(j, k, e);
    let o = obj_expr(j, vec![p]);
    let c = j.jsx_expression_container(o);
    j.jsx_attribute("collapsible", Some(c))
}

pub fn banner_collapsible_content(source: &str, path: &str, _o: &Value) -> TResult {
    if !source.contains("defaultIsExpanded") {
        return Ok(None);
    }
    let mut j = parse_file(source, path)?;
    if !imports_core_banner(&j) {
        return Ok(None);
    }
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        if jsx_ident_name(&j, p.node).as_deref() != Some("Banner") {
            continue;
        }
        let mut attrs = j.ast.list(p.node, "attributes");
        let idx = match attrs.iter().position(|&a| attr_name(&j, a).as_deref() == Some("defaultIsExpanded")) {
            Some(i) => i,
            None => continue,
        };
        if attrs.iter().any(|&a| attr_name(&j, a).as_deref() == Some("collapsible")) || attrs.iter().any(|&a| j.ast.is(a, "JSXSpreadAttribute")) {
            continue;
        }
        let value = j.ast.child(attrs[idx], "value");
        match value {
            None => {
                let t = j.boolean_literal(true);
                attrs[idx] = collapsible_with_default(&mut j, t);
            }
            Some(v) if j.ast.is(v, "JSXExpressionContainer") => {
                let e = j.ast.child(v, "expression").unwrap();
                let is_bool = j.ast.is(e, "BooleanLiteral") || (j.ast.is(e, "Literal") && matches!(j.ast.get(e, "value"), V::Bool(_)));
                if is_bool && matches!(j.ast.get(e, "value"), V::Bool(false)) {
                    attrs.remove(idx);
                } else if is_bool {
                    let t = j.boolean_literal(true);
                    attrs[idx] = collapsible_with_default(&mut j, t);
                } else {
                    attrs[idx] = collapsible_with_default(&mut j, e);
                }
            }
            _ => continue,
        }
        j.ast.set_list(p.node, "attributes", attrs);
        changed = true;
    }
    done(&j, changed)
}
