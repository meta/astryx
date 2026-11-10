//! v0.7.2, v0.7.5 and v0.7.8 transforms.

use super::lhelp::*;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::jsre;
use crate::commands::upgrade::recast::{Quote, V};
use crate::commands::upgrade::transforms::common::PropOptions;
use serde_json::Value;

const CORE_IMPORT_RE: &str = "^@(astryxdesign|xds)\\/core(?:\\/|$)";

fn unwrap(j: &J, n: Option<usize>) -> Option<usize> {
    let mut cur = n;
    while let Some(c) = cur {
        if matches!(j.ast.ty(c), "TSAsExpression" | "TSSatisfiesExpression" | "TSTypeAssertion" | "TSNonNullExpression" | "TypeCastExpression" | "ParenthesizedExpression") {
            cur = j.ast.child(c, "expression");
        } else {
            break;
        }
    }
    cur
}

fn attribute_value(j: &J, a: usize) -> Option<usize> {
    match j.ast.child(a, "value") {
        Some(v) if j.ast.is(v, "JSXExpressionContainer") => j.ast.child(v, "expression"),
        v => v,
    }
}

fn str_lit_value(j: &J, n: Option<usize>) -> Option<String> {
    let v = unwrap(j, n)?;
    if matches!(j.ast.ty(v), "StringLiteral" | "Literal") {
        if let V::Str(s) = j.ast.get(v, "value") {
            return Some(s.to_string());
        }
    }
    None
}

fn add_comment(j: &mut J, node: usize, text: &str) -> bool {
    let mut cs = comments_of(j, node).unwrap_or_default();
    if cs.iter().any(|&c| j.ast.str_of(c, "value") == Some(text)) {
        set_comments(j, node, cs);
        return false;
    }
    let c = comment(j, true, text, true, false);
    cs.push(c);
    set_comments(j, node, cs);
    true
}

const EDGE_DYNAMIC: &str = " TODO(astryx upgrade): edgeCompensation is deprecated. Replace edgeCompensation=\"inline\" with edge=\"outset\" by hand; this value is computed. ";
const EDGE_BOTH: &str = " TODO(astryx upgrade): edgeCompensation is deprecated. edge is also set here, but it may be undefined, and then edgeCompensation still applies. Make edge default to \"outset\" where edgeCompensation is \"inline\", then remove edgeCompensation. ";
const EDGE_SPREAD: &str = " TODO(astryx upgrade): edgeCompensation is deprecated, but this List also spreads props that may set edge, so it was left unchanged. Replace edgeCompensation=\"inline\" with edge=\"outset\" by hand, after checking which edge the spread passes. ";

pub fn migrate_list_edge_compensation(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let mi = |s: &str| jsre::test(CORE_IMPORT_RE, "", s);
    let norm = |s: &str| s.to_string();
    let comps: &[(&str, &[&str])] = &[("List", &["edgeCompensation"])];
    let o = PropOptions { matches_import: &mi, components: comps, normalize: &norm };
    transform_prop_paths(&mut j, &o, &mut |j, op, prop, _, _| {
        let attrs = j.ast.list(op.node, "attributes");
        if let Some(ei) = attrs.iter().position(|&a| attr_name(j, a).as_deref() == Some("edge")) {
            let proven = str_lit_value(j, attribute_value(j, attrs[ei])).is_some() && !attrs[ei + 1..].iter().any(|&a| j.ast.is(a, "JSXSpreadAttribute"));
            if proven {
                let kept: Vec<usize> = attrs.into_iter().filter(|&a| a != prop).collect();
                j.ast.set_list(op.node, "attributes", kept);
                changed = true;
            } else {
                changed = add_comment(j, prop, EDGE_BOTH) || changed;
            }
            return;
        }
        if attrs.iter().any(|&a| j.ast.is(a, "JSXSpreadAttribute")) {
            changed = add_comment(j, prop, EDGE_SPREAD) || changed;
            return;
        }
        if str_lit_value(j, attribute_value(j, prop)).as_deref() == Some("inline") {
            let n = j.ast.child(prop, "name").unwrap();
            j.set_name(n, "edge");
            let s = j.string_literal("outset");
            j.ast.set_node(prop, "value", s);
            changed = true;
        } else {
            changed = add_comment(j, prop, EDGE_DYNAMIC) || changed;
        }
    });
    done(&j, changed)
}

const CB_UNPROVEN: &str = " TODO(astryx upgrade): tokenizer is deprecated. Pass language={createCodeLanguage({name, identifiers, tokenize})} instead, with this function as tokenize; the language here is computed, missing, or plaintext, so it was left unchanged. ";
const CB_VALUE: &str = " TODO(astryx upgrade): tokenizer is deprecated. Pass language={createCodeLanguage({name, identifiers, tokenize})} instead; this tokenizer value is computed (not a function, a name, or a call-free property), so it was left unchanged. ";
const CB_SPREAD: &str = " TODO(astryx upgrade): tokenizer is deprecated, but this CodeBlock also spreads props that may set language or tokenizer, so it was left unchanged. Pass language={createCodeLanguage({name, identifiers, tokenize})} by hand. ";
const CODEBLOCK_SOURCE: &str = "@astryxdesign/core/CodeBlock";

fn static_string(j: &J, n: Option<usize>) -> Option<String> {
    if let Some(s) = str_lit_value(j, n) {
        return Some(s);
    }
    let v = unwrap(j, n)?;
    if j.ast.is(v, "TemplateLiteral") && j.ast.list(v, "expressions").is_empty() && j.ast.list(v, "quasis").len() == 1 {
        let q = j.ast.list(v, "quasis")[0];
        return j.ast.get(q, "value").obj_get("cooked").as_str().map(|s| s.to_string());
    }
    None
}

fn is_call_free_chain(j: &J, n: Option<usize>) -> bool {
    let v = match unwrap(j, n) {
        Some(v) => v,
        None => return false,
    };
    match j.ast.ty(v) {
        "Identifier" | "ThisExpression" => true,
        "MemberExpression" => {
            let key = j.ast.child(v, "property").unwrap();
            let literal_key = !j.ast.flag(v, "computed") || matches!(j.ast.ty(key), "StringLiteral" | "NumericLiteral" | "Literal");
            literal_key && !matches!(j.ast.get(v, "optional"), V::Bool(true)) && is_call_free_chain(j, j.ast.child(v, "object"))
        }
        _ => false,
    }
}

fn free_name(j: &J, preferred: &str) -> String {
    let used: Vec<String> = j.find("Identifier").into_iter().filter_map(|p| j.ast.name(p.node).map(|s| s.to_string())).collect();
    if !used.iter().any(|u| u == preferred) {
        return preferred.to_string();
    }
    let mut n = 2;
    while used.iter().any(|u| *u == format!("{}{}", preferred, n)) {
        n += 1;
    }
    format!("{}{}", preferred, n)
}

fn ensure_create_import(j: &mut J) -> String {
    let mut local = None;
    for ip in j.find("ImportDeclaration") {
        match source_value(j, ip.node) {
            Some(s) if jsre::test(CORE_IMPORT_RE, "", &s) => {}
            _ => continue,
        }
        for s in j.ast.list(ip.node, "specifiers") {
            if j.ast.is(s, "ImportSpecifier") && imported_name(j, s).as_deref() == Some("createCodeLanguage") {
                local = Some(local_name(j, s).unwrap_or("createCodeLanguage".into()));
            }
        }
    }
    if let Some(l) = local {
        return l;
    }
    let name = free_name(j, "createCodeLanguage");
    let i = j.identifier("createCodeLanguage");
    let l = if name == "createCodeLanguage" { V::Null } else { V::Node(j.identifier(&name)) };
    let spec = j.b("ImportSpecifier", vec![("imported", V::Node(i)), ("local", l)]);
    let existing: Vec<NPath> = j
        .find("ImportDeclaration")
        .into_iter()
        .filter(|p| source_value(j, p.node).as_deref() == Some(CODEBLOCK_SOURCE) && j.ast.str_of(p.node, "importKind") != Some("type") && !j.ast.list(p.node, "specifiers").iter().any(|&s| j.ast.is(s, "ImportNamespaceSpecifier")))
        .collect();
    if let Some(e) = existing.first() {
        let mut specs = j.ast.list(e.node, "specifiers");
        specs.push(spec);
        j.ast.set_list(e.node, "specifiers", specs);
    } else {
        let src = j.string_literal(CODEBLOCK_SOURCE);
        let decl = j.b("ImportDeclaration", vec![("specifiers", V::Arr(vec![V::Node(spec)])), ("source", V::Node(src))]);
        let imports = j.find("ImportDeclaration");
        if let Some(last) = imports.last() {
            j.insert_after(last, vec![decl]);
        } else {
            let prog = j.program();
            let mut body = j.ast.list(prog, "body");
            body.insert(0, decl);
            j.ast.set_list(prog, "body", body);
        }
    }
    name
}

pub fn migrate_codeblock_tokenizer(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let mi = |s: &str| jsre::test(CORE_IMPORT_RE, "", s);
    let norm = |s: &str| s.to_string();
    let comps: &[(&str, &[&str])] = &[("CodeBlock", &["tokenizer"])];
    let o = PropOptions { matches_import: &mi, components: comps, normalize: &norm };
    // (opening, prop, language attribute, language, tokenize, is function)
    let mut rewrites: Vec<(usize, usize, usize, String, usize, bool)> = vec![];
    transform_prop_paths(&mut j, &o, &mut |j, op, prop, _, _| {
        let attrs = j.ast.list(op.node, "attributes");
        if attrs.iter().any(|&a| j.ast.is(a, "JSXSpreadAttribute")) {
            changed = add_comment(j, prop, CB_SPREAD) || changed;
            return;
        }
        let la = attrs.iter().copied().find(|&a| attr_name(j, a).as_deref() == Some("language"));
        let language = la.and_then(|a| static_string(j, attribute_value(j, a)));
        let tokenize = attribute_value(j, prop);
        let tn = unwrap(j, tokenize);
        let is_fn = tn.map(|t| matches!(j.ast.ty(t), "ArrowFunctionExpression" | "FunctionExpression")).unwrap_or(false);
        let guardable = is_call_free_chain(j, tn);
        let language = match language {
            Some(l) if !l.is_empty() && l != "plaintext" => l,
            _ => {
                changed = add_comment(j, prop, CB_UNPROVEN) || changed;
                return;
            }
        };
        if !(is_fn || guardable) {
            changed = add_comment(j, prop, CB_VALUE) || changed;
            return;
        }
        rewrites.push((op.node, prop, la.unwrap(), language, tokenize.unwrap(), is_fn));
    });
    for (opening, prop, la, language, tokenize, is_fn) in rewrites {
        let create = ensure_create_import(&mut j);
        let callee = j.identifier(&create);
        let k1 = j.identifier("name");
        let v1 = j.string_literal(&language);
        let p1 = obj_prop(&mut j, k1, v1);
        let k2 = j.identifier("identifiers");
        let s2 = j.string_literal(&language);
        let v2 = j.b("ArrayExpression", vec![("elements", V::Arr(vec![V::Node(s2)]))]);
        let p2 = obj_prop(&mut j, k2, v2);
        let k3 = j.identifier("tokenize");
        let p3 = obj_prop(&mut j, k3, tokenize);
        let obj = obj_expr(&mut j, vec![p1, p2, p3]);
        let call = j.b("CallExpression", vec![("callee", V::Node(callee)), ("arguments", V::Arr(vec![V::Node(obj)]))]);
        let inner = if is_fn {
            call
        } else {
            let alt = j.string_literal(&language);
            j.b("ConditionalExpression", vec![("test", V::Node(tokenize)), ("consequent", V::Node(call)), ("alternate", V::Node(alt))])
        };
        let c = j.jsx_expression_container(inner);
        j.ast.set_node(la, "value", c);
        let kept: Vec<usize> = j.ast.list(opening, "attributes").into_iter().filter(|&a| a != prop).collect();
        j.ast.set_list(opening, "attributes", kept);
        changed = true;
    }
    done(&j, changed)
}

const TODO_PREFIX: &str = " TODO(astryx upgrade): experimental.presentation was removed in favor of presentation. ";

fn move_todo(reason: &str) -> String {
    format!("{}Move the value to presentation; the codemod left this one unchanged because {}. ", TODO_PREFIX, reason)
}

fn entry_key_name(j: &J, e: usize) -> Option<String> {
    if !matches!(j.ast.ty(e), "ObjectProperty" | "Property") || j.ast.flag(e, "computed") {
        return None;
    }
    let k = j.ast.child(e, "key")?;
    match j.ast.ty(k) {
        "Identifier" => j.ast.name(k).map(|s| s.to_string()),
        "StringLiteral" | "Literal" => j.ast.str_of(k, "value").map(|s| s.to_string()),
        _ => None,
    }
}

pub fn promote_tokenizer_presentation(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let mi = |s: &str| jsre::test(CORE_IMPORT_RE, "", s);
    let norm = |s: &str| s.to_string();
    let comps: &[(&str, &[&str])] = &[("Tokenizer", &["experimental"])];
    let o = PropOptions { matches_import: &mi, components: comps, normalize: &norm };
    transform_prop_paths(&mut j, &o, &mut |j, op, prop, _, _| {
        let attrs = j.ast.list(op.node, "attributes");
        let value = match j.ast.child(prop, "value") {
            Some(v) if j.ast.is(v, "JSXExpressionContainer") => unwrap(j, j.ast.child(v, "expression")),
            _ => None,
        };
        let is_obj = value.map(|v| j.ast.is(v, "ObjectExpression")).unwrap_or(false);
        let entries = if is_obj { j.ast.list(value.unwrap(), "properties") } else { vec![] };
        let pres: Vec<usize> = entries.iter().copied().filter(|&e| entry_key_name(j, e).as_deref() == Some("presentation")).collect();
        let unproven = entries.iter().any(|&e| entry_key_name(j, e).is_none());
        if is_obj && pres.is_empty() && !unproven {
            return;
        }
        let has_pres = attrs.iter().any(|&a| attr_name(j, a).as_deref() == Some("presentation"));
        let has_spread = attrs.iter().any(|&a| j.ast.is(a, "JSXSpreadAttribute"));
        let todo = if !is_obj {
            Some(move_todo("the value is not a literal object"))
        } else if unproven {
            Some(move_todo("the object has a spread or a computed key"))
        } else if has_pres {
            Some(format!("{}presentation is already set; remove experimental.presentation. ", TODO_PREFIX))
        } else if pres.len() > 1 {
            Some(move_todo("the object sets presentation more than once"))
        } else if has_spread {
            Some(move_todo("a spread may also set presentation"))
        } else {
            None
        };
        if let Some(t) = todo {
            changed = add_comment(j, prop, &t) || changed;
            return;
        }
        let entry = pres[0];
        let ev = j.ast.child(entry, "value").unwrap();
        let av = match str_lit_value(j, Some(ev)) {
            Some(s) => j.string_literal(&s),
            None => j.jsx_expression_container(ev),
        };
        let presentation = j.jsx_attribute("presentation", Some(av));
        let rest: Vec<usize> = entries.into_iter().filter(|&e| e != entry).collect();
        let empty = rest.is_empty();
        j.ast.set_list(value.unwrap(), "properties", rest);
        let mut attrs = attrs;
        let idx = attrs.iter().position(|&a| a == prop).unwrap();
        if empty {
            attrs[idx] = presentation;
        } else {
            attrs.insert(idx + 1, presentation);
        }
        j.ast.set_list(op.node, "attributes", attrs);
        changed = true;
    });
    Ok(if changed { Some(j.to_source(Some(Quote::Auto))) } else { None })
}
