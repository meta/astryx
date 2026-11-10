//! v0.0.15 transforms.

use super::v0_0_2::opening_ident;
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::jsre;
use crate::commands::upgrade::recast::lines::js_trim;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

fn is_ws_text(j: &J, n: usize) -> bool {
    j.ast.is(n, "JSXText") && js_trim(j.ast.str_of(n, "value").unwrap_or("")).is_empty()
}
fn is_empty_expr(j: &J, n: usize) -> bool {
    j.ast.is(n, "JSXExpressionContainer") && j.ast.child(n, "expression").map(|e| j.ast.is(e, "JSXEmptyExpression")).unwrap_or(false)
}
fn meaningful(j: &J, el: usize) -> Vec<usize> {
    j.ast.list(el, "children").into_iter().filter(|c| !is_ws_text(j, *c) && !is_empty_expr(j, *c)).collect()
}
fn get_attr(j: &J, opening: usize, name: &str) -> Option<usize> {
    j.ast.list(opening, "attributes").into_iter().find(|a| j.ast.is(*a, "JSXAttribute") && j.ast.child(*a, "name").and_then(|n| j.ast.name(n)) == Some(name))
}

fn fragment(j: &mut J, children: Vec<usize>) -> usize {
    let o = j.b("JSXOpeningFragment", vec![]);
    let c = j.b("JSXClosingFragment", vec![]);
    j.b("JSXFragment", vec![("openingFragment", V::Node(o)), ("closingFragment", V::Node(c)), ("children", V::Arr(children.into_iter().map(V::Node).collect()))])
}

fn make_self_closing_with(j: &mut J, el: usize, opening: usize, attr: usize) {
    let mut attrs = j.ast.list(opening, "attributes");
    attrs.push(attr);
    j.ast.set_list(opening, "attributes", attrs);
    j.ast.set(opening, "selfClosing", V::Bool(true));
    j.ast.set(el, "children", V::Arr(vec![]));
    j.ast.set(el, "closingElement", V::Null);
}

pub fn migrate_item_children_to_endcontent(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("JSXElement") {
        let opening = j.ast.child(p.node, "openingElement").unwrap();
        match opening_ident(&j, opening) {
            Some(n) if ["XDSDropdownMenuItem", "XDSContextMenuItem", "XDSSelectorOption"].contains(&n.as_str()) => {}
            _ => continue,
        }
        let end = get_attr(&j, opening, "endContent");
        if let Some(ch) = get_attr(&j, opening, "children") {
            if end.is_some() {
                continue;
            }
            let n = j.ast.child(ch, "name").unwrap();
            j.set_name(n, "endContent");
            changed = true;
            continue;
        }
        if end.is_some() {
            continue;
        }
        let kids = meaningful(&j, p.node);
        let value = if kids.is_empty() {
            None
        } else if kids.len() == 1 && j.ast.is(kids[0], "JSXText") {
            let t = js_trim(j.ast.str_of(kids[0], "value").unwrap_or("")).to_string();
            if t.is_empty() {
                None
            } else {
                Some(j.string_literal(&t))
            }
        } else if kids.len() == 1 && j.ast.is(kids[0], "JSXExpressionContainer") {
            let e = j.ast.child(kids[0], "expression").unwrap();
            Some(j.jsx_expression_container(e))
        } else if kids.len() == 1 && matches!(j.ast.ty(kids[0]), "JSXElement" | "JSXFragment") {
            Some(j.jsx_expression_container(kids[0]))
        } else {
            let f = fragment(&mut j, kids.clone());
            Some(j.jsx_expression_container(f))
        };
        let value = match value {
            Some(v) => v,
            None => continue,
        };
        let a = j.jsx_attribute("endContent", Some(value));
        make_self_closing_with(&mut j, p.node, opening, a);
        changed = true;
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn migrate_selector_children(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let comps = ["XDSSelector", "XDSMultiSelector"];
    let mut local_names: Vec<(String, String)> = Vec::new();
    let mut ns: Vec<String> = Vec::new();
    for p in j.find("ImportDeclaration") {
        let src = match j.ast.child(p.node, "source").and_then(|s| j.ast.str_of(s, "value")).map(|s| s.to_string()) {
            Some(s) => s,
            None => continue,
        };
        if !["@xds/core", "@xds/core/Selector", "@xds/core/MultiSelector"].contains(&src.as_str()) {
            continue;
        }
        for s in j.ast.list(p.node, "specifiers") {
            if j.ast.is(s, "ImportSpecifier") {
                let imp = j.ast.child(s, "imported").unwrap();
                let local = j.ast.child(s, "local");
                if j.ast.is(imp, "Identifier") && local.map(|l| j.ast.is(l, "Identifier")).unwrap_or(false) {
                    let iname = j.ast.name(imp).unwrap_or("").to_string();
                    let can = match src.as_str() {
                        "@xds/core" => comps.contains(&iname.as_str()),
                        "@xds/core/Selector" => iname == "XDSSelector",
                        _ => iname == "XDSMultiSelector",
                    };
                    if can {
                        let l = j.ast.name(local.unwrap()).unwrap_or("").to_string();
                        if let Some(e) = local_names.iter_mut().find(|e| e.0 == l) {
                            e.1 = iname;
                        } else {
                            local_names.push((l, iname));
                        }
                    }
                }
            }
            if j.ast.is(s, "ImportNamespaceSpecifier") {
                let l = j.ast.child(s, "local").unwrap();
                if j.ast.is(l, "Identifier") {
                    let n = j.ast.name(l).unwrap_or("").to_string();
                    if !ns.contains(&n) {
                        ns.push(n);
                    }
                }
            }
        }
    }
    if local_names.is_empty() && ns.is_empty() {
        return Ok(None);
    }
    let mut changed = false;
    for p in j.find("JSXElement") {
        let opening = j.ast.child(p.node, "openingElement").unwrap();
        let name = j.ast.child(opening, "name").unwrap();
        let comp = if j.ast.is(name, "JSXIdentifier") {
            local_names.iter().find(|e| Some(e.0.as_str()) == j.ast.name(name)).map(|e| e.1.clone())
        } else if j.ast.is(name, "JSXMemberExpression") {
            let o = j.ast.child(name, "object").unwrap();
            let pr = j.ast.child(name, "property").unwrap();
            if j.ast.is(o, "JSXIdentifier") && j.ast.is(pr, "JSXIdentifier") && ns.iter().any(|n| Some(n.as_str()) == j.ast.name(o)) && comps.contains(&j.ast.name(pr).unwrap_or("")) {
                j.ast.name(pr).map(|s| s.to_string())
            } else {
                None
            }
        } else {
            None
        };
        if comp.is_none() {
            continue;
        }
        if get_attr(&j, opening, "renderOption").is_some() {
            continue;
        }
        if let Some(ch) = get_attr(&j, opening, "children") {
            let n = j.ast.child(ch, "name").unwrap();
            j.set_name(n, "renderOption");
            changed = true;
            continue;
        }
        let kids = meaningful(&j, p.node);
        if kids.len() != 1 {
            continue;
        }
        let child = kids[0];
        if !j.ast.is(child, "JSXExpressionContainer") {
            continue;
        }
        let e = j.ast.child(child, "expression").unwrap();
        if !matches!(j.ast.ty(e), "ArrowFunctionExpression" | "FunctionExpression" | "Identifier" | "MemberExpression") {
            continue;
        }
        let a = j.jsx_attribute("renderOption", Some(child));
        make_self_closing_with(&mut j, p.node, opening, a);
        changed = true;
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

const DATE_IDS: &[(&str, &str)] = &[
    ("XDSDateTimePicker", "XDSDateTimeInput"),
    ("XDSDateRangePicker", "XDSDateRangeInput"),
    ("XDSDateTimePickerProps", "XDSDateTimeInputProps"),
    ("XDSDateRangePickerProps", "XDSDateRangeInputProps"),
    ("XDSDateTimePickerSize", "XDSDateTimeInputSize"),
    ("XDSDateRangePickerSize", "XDSDateRangeInputSize"),
    ("XDSDateTimePickerHourFormat", "XDSDateTimeInputHourFormat"),
    ("XDSDateTimePickerStatus", "XDSDateTimeInputStatus"),
    ("XDSDateTimePickerStatusType", "XDSDateTimeInputStatusType"),
    ("XDSDateRangePickerStatus", "XDSDateRangeInputStatus"),
    ("XDSDateRangePickerStatusType", "XDSDateRangeInputStatusType"),
];

pub fn rename_date_picker(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let paths = [("@xds/core/DateTimePicker", "@xds/core/DateTimeInput"), ("@xds/core/DateRangePicker", "@xds/core/DateRangeInput")];
    for ty in ["ImportDeclaration", "ExportNamedDeclaration"] {
        for p in j.find(ty) {
            if let Some(src) = j.ast.child(p.node, "source") {
                let v = j.ast.str_of(src, "value").unwrap_or("").to_string();
                if let Some((_, r)) = paths.iter().find(|(o, _)| *o == v) {
                    j.ast.set(src, "value", V::s(r));
                    changed = true;
                }
            }
        }
    }
    for ty in ["Identifier", "JSXIdentifier"] {
        for p in j.find(ty) {
            let n = j.ast.name(p.node).unwrap_or("").to_string();
            if let Some((_, r)) = DATE_IDS.iter().find(|(o, _)| *o == n) {
                j.set_name(p.node, r);
                changed = true;
            }
        }
    }
    for p in j.find("StringLiteral") {
        let v = j.ast.str_of(p.node, "value").unwrap_or("").to_string();
        if let Some((_, r)) = DATE_IDS.iter().find(|(o, _)| *o == v) {
            j.ast.set(p.node, "value", V::s(r));
            changed = true;
        }
    }
    for p in j.find("Literal") {
        if let Some(v) = j.ast.str_of(p.node, "value").map(|s| s.to_string()) {
            if let Some((_, r)) = DATE_IDS.iter().find(|(o, _)| *o == v) {
                j.ast.set(p.node, "value", V::s(r));
                if j.ast.get(p.node, "raw").as_bool() {
                    j.ast.set(p.node, "raw", V::Undef);
                }
                changed = true;
            }
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn rename_imperative_ref(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let comps = ["XDSCalendar", "XDSChatComposerInput", "XDSPowerSearch", "XDSTokenizer", "XDSChartStreamGL"];
    for p in j.find("JSXOpeningElement") {
        let cn = match opening_ident(&j, p.node) {
            Some(n) => n,
            None => continue,
        };
        for a in j.ast.list(p.node, "attributes") {
            if !j.ast.is(a, "JSXAttribute") {
                continue;
            }
            let n = j.ast.child(a, "name").unwrap();
            if !j.ast.is(n, "JSXIdentifier") {
                continue;
            }
            let an = j.ast.name(n).unwrap_or("").to_string();
            if comps.contains(&cn.as_str()) && an == "ref" {
                j.set_name(n, "handleRef");
                changed = true;
            }
            if cn == "XDSSideNavCollapseButton" && an == "sideNavRef" {
                j.set_name(n, "handleRef");
                changed = true;
            }
        }
    }
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

fn rename_on_idents(j: &mut J, comps: &[&str], old: &str, new: &str) -> bool {
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        match opening_ident(j, p.node) {
            Some(n) if comps.contains(&n.as_str()) => {}
            _ => continue,
        }
        for a in j.ast.list(p.node, "attributes") {
            if j.jsx_attr_name(a).as_deref() == Some(old) {
                let n = j.ast.child(a, "name").unwrap();
                j.set_name(n, new);
                changed = true;
            }
        }
    }
    changed
}

pub fn rename_is_streaming(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let changed = rename_on_idents(&mut j, &["XDSChatComposer", "XDSChatSendButton"], "isStreaming", "isStopShown");
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

pub fn rename_stack_element(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let changed = rename_on_idents(&mut j, &["XDSStack", "XDSHStack", "XDSVStack", "XDSStackItem"], "element", "as");
    Ok(if changed { Some(j.to_source_single()) } else { None })
}

fn sattr(name: &str, value: &str) -> Option<String> {
    Some(format!("[data-{}=\"{}\"]", name, value))
}

fn value_to_attr(component: &str, value: &str) -> Option<String> {
    if let Some(m) = jsre::captures(r"^level-(\d+)$", "", value) {
        return sattr("level", m[1].as_deref().unwrap());
    }
    if let Some(m) = jsre::captures(r"^gap-(\d+(?:-\d+)?)$", "", value) {
        return sattr("gap", &m[1].as_deref().unwrap().replacen('-', ".", 1));
    }
    if let Some(m) = jsre::captures(r"^(?:columns|cols)-(\d+)$", "", value) {
        return sattr("columns", m[1].as_deref().unwrap());
    }
    let color = ["primary", "secondary", "disabled", "placeholder", "active", "accent", "success", "warning", "error", "info", "neutral", "red", "orange", "yellow", "green", "teal", "cyan", "blue", "purple", "pink", "gray"];
    let state = ["active", "checked", "disabled", "expanded", "focused", "hidden", "indeterminate", "invalid", "open", "pressed", "selected", "today", "visible"];
    let status = ["info", "neutral", "success", "warning", "error"];
    let size = ["xs", "sm", "md", "lg", "xl", "small", "medium", "large"];
    let text = ["body", "large", "label", "code", "supporting", "display-1", "display-2", "display-3"];
    let orient = ["horizontal", "vertical"];
    let v = value;
    match component {
        "xds-button" => {
            if size.contains(&v) {
                return sattr("size", v);
            }
            sattr("variant", v)
        }
        "xds-badge" | "xds-statusdot" | "xds-avatar-status-dot" | "xds-card" | "xds-clickable-card" => sattr("variant", v),
        "xds-app-shell" | "xds-app-shell-header" | "xds-app-shell-sidenav" => {
            if ["wash", "surface", "section", "elevated"].contains(&v) {
                sattr("variant", v)
            } else {
                None
            }
        }
        "xds-section" => {
            if ["section", "transparent", "muted"].contains(&v) {
                sattr("variant", v)
            } else {
                None
            }
        }
        "xds-heading" | "xds-text" => {
            if text.contains(&v) {
                return sattr("type", v);
            }
            if color.contains(&v) {
                return sattr("color", v);
            }
            None
        }
        "xds-link" => {
            if color.contains(&v) {
                sattr("color", v)
            } else {
                None
            }
        }
        "xds-icon" => {
            if size.contains(&v) {
                return sattr("size", v);
            }
            if color.contains(&v) {
                return sattr("color", v);
            }
            None
        }
        "xds-divider" => {
            if ["subtle", "strong"].contains(&v) {
                return sattr("variant", v);
            }
            if orient.contains(&v) {
                return sattr("orientation", v);
            }
            None
        }
        "xds-stack" => {
            if orient.contains(&v) {
                return sattr("direction", v);
            }
            if v == "wrap" || v == "nowrap" {
                return sattr("wrap", v);
            }
            None
        }
        "xds-grid" => {
            if ["start", "center", "end", "stretch"].contains(&v) {
                sattr("align", v)
            } else {
                None
            }
        }
        "xds-banner" | "xds-banner-icon" | "xds-banner-content" => {
            if status.contains(&v) {
                return sattr("status", v);
            }
            if ["card", "inline"].contains(&v) {
                return sattr("container", v);
            }
            None
        }
        "xds-spinner" => {
            if size.contains(&v) {
                return sattr("size", v);
            }
            if ["default", "onMedia", "subtle"].contains(&v) {
                return sattr("shade", v);
            }
            None
        }
        "xds-progressbar" | "xds-progressbar-fill" => {
            if status.contains(&v) || v == "accent" {
                sattr("variant", v)
            } else {
                None
            }
        }
        _ => {
            if state.contains(&v) {
                sattr(v, v)
            } else {
                None
            }
        }
    }
}

pub fn migrate_theme_selectors_str(source: &str) -> String {
    jsre::replace_fn(r"\.((?:xds-[a-z0-9-]+))(\.(?:-?[_a-zA-Z][_a-zA-Z0-9-]*))+", "g", source, |g| {
        let full = g[0].unwrap();
        let component = g[1].unwrap();
        let chain = &full[component.len() + 1..];
        let mut attrs = String::new();
        for value in chain.split('.').filter(|s| !s.is_empty()) {
            if value.starts_with("xds-") {
                return full.to_string();
            }
            match value_to_attr(component, value) {
                Some(a) => attrs.push_str(&a),
                None => return full.to_string(),
            }
        }
        format!(".{}{}", component, attrs)
    })
}

pub fn migrate_theme_selectors(source: &str, _path: &str, _o: &Value) -> TResult {
    let r = migrate_theme_selectors_str(source);
    Ok(if r == source { None } else { Some(r) })
}
