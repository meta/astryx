//! v0.0.2 transforms.

use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::recast::V;
use serde_json::Value;

/// Rename attribute `old` → `new` on `<Name …>` openings (`find(JSXOpeningElement, {name: {name}})`).
pub fn rename_attr_on(j: &mut J, component: &str, old: &str, new: &str) -> bool {
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        if j.name_of(j.ast.child(p.node, "name")).as_deref() != Some(component) {
            continue;
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

/// Opening element name when it is a plain JSXIdentifier.
pub fn opening_ident(j: &J, opening: usize) -> Option<String> {
    let n = j.ast.child(opening, "name")?;
    if j.ast.is(n, "JSXIdentifier") {
        j.ast.name(n).map(|s| s.to_string())
    } else {
        None
    }
}

pub fn rename_is_shown_to_is_open(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for comp in ["XDSDialog", "XDSPopover"] {
        changed |= rename_attr_on(&mut j, comp, "isShown", "isOpen");
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn rename_selector_items_to_options(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let changed = rename_attr_on(&mut j, "XDSSelector", "items", "options");
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn rename_banner_end_button(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let changed = rename_attr_on(&mut j, "XDSBanner", "endButton", "endContent");
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn unify_uncontrolled(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for (c, o, n) in [
        ("XDSAppShell", "initialIsSideNavCollapsed", "defaultIsSideNavCollapsed"),
        ("XDSCollapsible", "initialIsOpen", "defaultIsOpen"),
        ("XDSBanner", "initialIsExpanded", "defaultIsExpanded"),
    ] {
        changed |= rename_attr_on(&mut j, c, o, n);
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn unify_visibility(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for (c, o) in [
        ("XDSDialog", "onHide"),
        ("XDSDialogHeader", "onHide"),
        ("XDSMobileNav", "onClose"),
        ("XDSDropdownMenu", "onMenuToggle"),
        ("XDSPopover", "onToggle"),
        ("XDSCollapsibleGroup", "onToggle"),
    ] {
        changed |= rename_attr_on(&mut j, c, o, "onOpenChange");
    }
    for comp in ["XDSHoverCard", "XDSTooltip"] {
        for p in j.find("JSXOpeningElement") {
            if j.name_of(j.ast.child(p.node, "name")).as_deref() != Some(comp) {
                continue;
            }
            let attrs = j.ast.list(p.node, "attributes");
            let show = attrs.iter().copied().find(|a| j.jsx_attr_name(*a).as_deref() == Some("onShow"));
            let hide = attrs.iter().copied().find(|a| j.jsx_attr_name(*a).as_deref() == Some("onHide"));
            match (show, hide) {
                (Some(s), Some(_)) => {
                    let c = j.b(
                        "CommentBlock",
                        vec![
                            ("value", V::s(" TODO: Merge onShow and onHide into a single onOpenChange={(isOpen) => { ... }} prop ")),
                            ("leading", V::Bool(false)),
                            ("trailing", V::Bool(true)),
                        ],
                    );
                    let mut list = match j.ast.get(s, "comments") {
                        V::Arr(a) => a.clone(),
                        _ => vec![],
                    };
                    list.push(V::Node(c));
                    j.ast.set(s, "comments", V::Arr(list));
                    changed = true;
                }
                (Some(s), None) => {
                    let n = j.ast.child(s, "name").unwrap();
                    j.set_name(n, "onOpenChange");
                    changed = true;
                }
                (None, Some(h)) => {
                    let n = j.ast.child(h, "name").unwrap();
                    j.set_name(n, "onOpenChange");
                    changed = true;
                }
                _ => {}
            }
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn rename_form_tooltip_start_icon(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let comps = ["XDSField", "XDSFieldLabel", "XDSNumberInput", "XDSCheckboxInput", "XDSSwitch", "XDSDateInput", "XDSTimeInput"];
    for p in j.find("JSXOpeningElement") {
        match opening_ident(&j, p.node) {
            Some(n) if comps.contains(&n.as_str()) => {}
            _ => continue,
        }
        for a in j.ast.list(p.node, "attributes") {
            let new = match j.jsx_attr_name(a).as_deref() {
                Some("tooltip") => "labelTooltip",
                Some("startIcon") => "labelIcon",
                _ => continue,
            };
            let n = j.ast.child(a, "name").unwrap();
            j.set_name(n, new);
            changed = true;
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

/// Rename imported specifiers per `map` (local too when it matched).
pub fn rename_import_specifiers(j: &mut J, map: &[(&str, &str)]) -> bool {
    let mut changed = false;
    for p in j.find("ImportSpecifier") {
        let imported = match j.ast.child(p.node, "imported") {
            Some(i) => i,
            None => continue,
        };
        if !j.ast.is(imported, "Identifier") {
            continue;
        }
        let old = j.ast.name(imported).unwrap_or("").to_string();
        if let Some((_, new)) = map.iter().find(|(o, _)| *o == old) {
            j.set_name(imported, new);
            if let Some(local) = j.ast.child(p.node, "local") {
                if j.ast.name(local) == Some(old.as_str()) {
                    j.set_name(local, new);
                }
            }
            changed = true;
        }
    }
    changed
}

fn rename_jsx_identifiers(j: &mut J, old: &str, new: &str) -> bool {
    let mut changed = false;
    for p in j.find("JSXIdentifier") {
        if j.ast.name(p.node) == Some(old) {
            j.set_name(p.node, new);
            changed = true;
        }
    }
    changed
}

pub fn rename_topnav_title(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        match opening_ident(&j, p.node) {
            Some(n) if ["XDSTopNav", "XDSTopNavTitle", "XDSTopNavHeading"].contains(&n.as_str()) => {}
            _ => continue,
        }
        for a in j.ast.list(p.node, "attributes") {
            if j.jsx_attr_name(a).as_deref() == Some("title") {
                let n = j.ast.child(a, "name").unwrap();
                j.set_name(n, "heading");
                changed = true;
            }
        }
    }
    changed |= rename_jsx_identifiers(&mut j, "XDSTopNavTitle", "XDSTopNavHeading");
    changed |= rename_import_specifiers(&mut j, &[("XDSTopNavTitle", "XDSTopNavHeading"), ("XDSTopNavTitleProps", "XDSTopNavHeadingProps")]);
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn rename_sidenav_header(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let renames = [
        ("title", "heading"),
        ("titleHref", "headingHref"),
        ("supertitle", "superheading"),
        ("supertitleHref", "superheadingHref"),
        ("subtitle", "subheading"),
        ("subtitleHref", "subheadingHref"),
    ];
    for p in j.find("JSXOpeningElement") {
        match opening_ident(&j, p.node) {
            Some(n) if ["XDSSideNavHeader", "XDSSideNavHeading"].contains(&n.as_str()) => {}
            _ => continue,
        }
        for a in j.ast.list(p.node, "attributes") {
            if let Some(name) = j.jsx_attr_name(a) {
                if let Some((_, new)) = renames.iter().find(|(o, _)| *o == name) {
                    let n = j.ast.child(a, "name").unwrap();
                    j.set_name(n, new);
                    changed = true;
                }
            }
        }
    }
    changed |= rename_jsx_identifiers(&mut j, "XDSSideNavHeader", "XDSSideNavHeading");
    changed |= rename_import_specifiers(&mut j, &[("XDSSideNavHeader", "XDSSideNavHeading"), ("XDSSideNavHeaderProps", "XDSSideNavHeadingProps")]);
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn migrate_use_xds_icon(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("CallExpression") {
        if let Some(c) = j.ast.child(p.node, "callee") {
            if j.ast.is(c, "Identifier") && j.ast.name(c) == Some("useXDSIcon") {
                j.set_name(c, "getIcon");
                changed = true;
            }
        }
    }
    for p in j.find("ImportSpecifier") {
        let imported = j.ast.child(p.node, "imported").unwrap();
        if j.ast.is(imported, "Identifier") && j.ast.name(imported) == Some("useXDSIcon") {
            let local = j.ast.child(p.node, "local");
            let old_local = j.name_of(local);
            j.set_name(imported, "getIcon");
            if old_local.as_deref() == Some("useXDSIcon") {
                j.set_name(local.unwrap(), "getIcon");
            }
            changed = true;
        }
    }
    for p in j.find("ImportDeclaration") {
        if !matches!(j.ast.get(p.node, "specifiers"), V::Arr(_)) {
            continue;
        }
        let specs = j.ast.list(p.node, "specifiers");
        let filtered: Vec<usize> = specs
            .iter()
            .copied()
            .filter(|s| {
                let drop = j.ast.is(*s, "ImportSpecifier")
                    && j.ast.child(*s, "imported").map(|i| j.ast.is(i, "Identifier") && j.ast.name(i) == Some("IconRegistryContext")).unwrap_or(false);
                if drop {
                    changed = true;
                }
                !drop
            })
            .collect();
        if filtered.is_empty() {
            j.remove(&p);
        } else if filtered.len() != specs.len() {
            j.ast.set_list(p.node, "specifiers", filtered);
        }
    }
    for p in j.find("ImportDeclaration") {
        let src = j.ast.child(p.node, "source").unwrap();
        if let Some(s) = j.ast.str_of(src, "value").map(|s| s.to_string()) {
            if s.contains("IconRegistry") && !s.contains("globalIconRegistry") {
                let new = if let Some(prefix) = s.strip_suffix("IconRegistry") { format!("{}globalIconRegistry", prefix) } else { s.clone() };
                j.ast.set(src, "value", V::s(&new));
                changed = true;
            }
        }
    }
    for p in j.find("JSXElement") {
        let opening = j.ast.child(p.node, "openingElement").unwrap();
        let name = j.ast.child(opening, "name").unwrap();
        if j.ast.is(name, "JSXMemberExpression") {
            let obj = j.ast.child(name, "object").unwrap();
            let prop = j.ast.child(name, "property").unwrap();
            if j.ast.is(obj, "JSXIdentifier") && j.ast.name(obj) == Some("IconRegistryContext") && j.ast.is(prop, "JSXIdentifier") && j.ast.name(prop) == Some("Provider") {
                let children = j.ast.list(p.node, "children");
                if children.len() == 1 {
                    j.replace(&p, children[0]);
                } else {
                    let o = j.b("JSXOpeningFragment", vec![]);
                    let c = j.b("JSXClosingFragment", vec![]);
                    let f = j.b("JSXFragment", vec![("openingFragment", V::Node(o)), ("closingFragment", V::Node(c)), ("children", V::Arr(children.into_iter().map(V::Node).collect()))]);
                    j.replace(&p, f);
                }
                changed = true;
            }
        }
    }
    for p in j.find("VariableDeclarator") {
        if let Some(init) = j.ast.child(p.node, "init") {
            if j.ast.is(init, "Identifier") && j.ast.name(init) == Some("IconRegistryContext") {
                if let Some(pp) = p.parent_path() {
                    j.remove(&pp);
                }
                changed = true;
            }
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

fn gap_token(s: &str) -> Option<f64> {
    Some(match s {
        "space0" => 0.0,
        "space0.5" => 0.5,
        "space1" => 1.0,
        "space1.5" => 1.5,
        "space2" => 2.0,
        "space3" => 3.0,
        "space4" => 4.0,
        "space5" => 5.0,
        "space6" => 6.0,
        "space7" => 7.0,
        "space8" => 8.0,
        "space9" => 9.0,
        "space10" => 10.0,
        "space11" => 11.0,
        "space12" => 12.0,
        _ => return None,
    })
}

pub fn migrate_gap_to_numeric(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let layout = ["XDSStack", "XDSHStack", "XDSVStack", "XDSGrid", "XDSGridSpan", "XDSStackItem"];
    for p in j.find("JSXOpeningElement") {
        match opening_ident(&j, p.node) {
            Some(n) if layout.contains(&n.as_str()) => {}
            _ => continue,
        }
        for a in j.ast.list(p.node, "attributes") {
            let name = match j.jsx_attr_name(a) {
                Some(n) => n,
                None => continue,
            };
            if !["gap", "rowGap", "columnGap"].contains(&name.as_str()) {
                continue;
            }
            let value = match j.ast.child(a, "value") {
                Some(v) => v,
                None => continue,
            };
            if matches!(j.ast.ty(value), "Literal" | "StringLiteral") {
                if let Some(n) = j.ast.str_of(value, "value").and_then(gap_token) {
                    let lit = j.literal_num(n);
                    let c = j.jsx_expression_container(lit);
                    j.ast.set_node(a, "value", c);
                    changed = true;
                }
                continue;
            }
            if j.ast.is(value, "JSXExpressionContainer") {
                let e = j.ast.child(value, "expression").unwrap();
                if matches!(j.ast.ty(e), "Literal" | "StringLiteral") {
                    if let Some(n) = j.ast.str_of(e, "value").and_then(gap_token) {
                        let lit = j.literal_num(n);
                        j.ast.set_node(value, "expression", lit);
                        changed = true;
                    }
                }
            }
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn migrate_is_full_bleed(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for comp in ["XDSCard", "XDSSection", "XDSLayout", "XDSLayoutContent", "XDSLayoutHeader", "XDSLayoutFooter", "XDSLayoutPanel"] {
        for p in j.find("JSXOpeningElement") {
            if j.name_of(j.ast.child(p.node, "name")).as_deref() != Some(comp) {
                continue;
            }
            let mut attrs = j.ast.list(p.node, "attributes");
            let idx = match attrs.iter().position(|a| j.jsx_attr_name(*a).as_deref() == Some("isFullBleed")) {
                Some(i) => i,
                None => continue,
            };
            let attr = attrs[idx];
            let value = j.ast.child(attr, "value");
            let add_padding = |j: &mut J, attrs: &mut Vec<usize>| {
                if !attrs.iter().any(|a| j.jsx_attr_name(*a).as_deref() == Some("padding")) {
                    let lit = j.literal_num(0.0);
                    let c = j.jsx_expression_container(lit);
                    let at = j.jsx_attribute("padding", Some(c));
                    attrs.push(at);
                }
            };
            match value {
                None => {
                    attrs.remove(idx);
                    add_padding(&mut j, &mut attrs);
                    j.ast.set_list(p.node, "attributes", attrs);
                    changed = true;
                }
                Some(v) if j.ast.is(v, "JSXExpressionContainer") => {
                    let e = j.ast.child(v, "expression").unwrap();
                    if matches!(j.ast.ty(e), "Literal" | "BooleanLiteral") {
                        match j.ast.get(e, "value") {
                            V::Bool(true) => {
                                attrs.remove(idx);
                                add_padding(&mut j, &mut attrs);
                                j.ast.set_list(p.node, "attributes", attrs);
                                changed = true;
                            }
                            V::Bool(false) => {
                                attrs.remove(idx);
                                j.ast.set_list(p.node, "attributes", attrs);
                                changed = true;
                            }
                            _ => {}
                        }
                    }
                }
                _ => {}
            }
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn migrate_badge_dot(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    let is_str = |j: &J, v: usize| matches!(j.ast.ty(v), "Literal" | "StringLiteral");
    for p in j.find("JSXElement") {
        let opening = j.ast.child(p.node, "openingElement").unwrap();
        if opening_ident(&j, opening).as_deref() != Some("XDSBadge") {
            continue;
        }
        let attrs = j.ast.list(opening, "attributes");
        let ident_attr = |j: &J, a: usize, name: &str| {
            j.ast.is(a, "JSXAttribute") && j.ast.child(a, "name").map(|n| j.ast.is(n, "JSXIdentifier") && j.ast.name(n) == Some(name)).unwrap_or(false)
        };
        let has_dot = attrs.iter().any(|a| {
            ident_attr(&j, *a, "shape") && j.ast.child(*a, "value").map(|v| is_str(&j, v) && j.ast.str_of(v, "value") == Some("dot")).unwrap_or(false)
        });
        if !has_dot || attrs.iter().any(|a| ident_attr(&j, *a, "icon")) {
            continue;
        }
        let variant = attrs.iter().copied().find(|a| j.jsx_attr_name(*a).as_deref() == Some("variant"));
        let mut new_variant: Option<String> = Some("neutral".into());
        if let Some(va) = variant {
            if let Some(v) = j.ast.child(va, "value") {
                if is_str(&j, v) {
                    let old = j.ast.get(v, "value").clone();
                    new_variant = Some(match old.as_str() {
                        Some("success") => "positive".into(),
                        Some("error") => "negative".into(),
                        Some("warning") => "warning".into(),
                        Some("info") => "info".into(),
                        Some("neutral") => "neutral".into(),
                        Some(o) => o.to_string(),
                        None => super::super::recast::print_nodes::v_to_string(&old),
                    });
                } else if j.ast.is(v, "JSXExpressionContainer") {
                    new_variant = None;
                }
            }
        }
        let mut new_attrs = Vec::new();
        if let Some(nv) = &new_variant {
            let s = j.string_literal(nv);
            new_attrs.push(j.jsx_attribute("variant", Some(s)));
        } else if let Some(va) = variant {
            new_attrs.push(va);
        }
        for a in attrs {
            if j.ast.is(a, "JSXSpreadAttribute") {
                new_attrs.push(a);
                continue;
            }
            let n = j.jsx_attr_name(a);
            if n.as_deref() == Some("variant") || n.as_deref() == Some("shape") {
                continue;
            }
            new_attrs.push(a);
        }
        let name = j.jsx_identifier("XDSStatusDot");
        let op = j.b("JSXOpeningElement", vec![("name", V::Node(name)), ("attributes", V::Arr(new_attrs.into_iter().map(V::Node).collect())), ("selfClosing", V::Bool(true))]);
        let el = j.b("JSXElement", vec![("openingElement", V::Node(op)), ("closingElement", V::Null), ("children", V::Arr(vec![]))]);
        j.replace(&p, el);
        changed = true;
    }
    if !changed {
        return Ok(None);
    }
    let badge_imports: Vec<NPath> = j
        .find("ImportDeclaration")
        .into_iter()
        .filter(|p| {
            let s = j.ast.child(p.node, "source").and_then(|s| j.ast.str_of(s, "value").map(|x| x.to_string()));
            matches!(s.as_deref(), Some(s) if s == "@xds/core" || s == "@xds/core/Badge" || s.ends_with("/Badge"))
        })
        .collect();
    let remaining = j.find("JSXIdentifier").into_iter().filter(|p| j.ast.name(p.node) == Some("XDSBadge")).count();
    let has_sd = j.find("ImportSpecifier").iter().any(|p| j.name_of(j.ast.child(p.node, "imported")).as_deref() == Some("XDSStatusDot"))
        || j.find("ImportDefaultSpecifier").iter().any(|p| j.name_of(j.ast.child(p.node, "local")).as_deref() == Some("XDSStatusDot"));
    if !has_sd {
        let id = j.identifier("XDSStatusDot");
        let spec = j.b("ImportSpecifier", vec![("imported", V::Node(id)), ("local", V::Null)]);
        let src = j.string_literal("@xds/core/StatusDot");
        let imp = j.b("ImportDeclaration", vec![("specifiers", V::Arr(vec![V::Node(spec)])), ("source", V::Node(src))]);
        let xds: Vec<NPath> = j
            .find("ImportDeclaration")
            .into_iter()
            .filter(|p| j.ast.child(p.node, "source").and_then(|s| j.ast.str_of(s, "value")).map(|s| s.contains("@xds/core")).unwrap_or(false))
            .collect();
        if let Some(last) = xds.last() {
            j.insert_after(last, vec![imp]);
        } else {
            let all = j.find("ImportDeclaration");
            if let Some(last) = all.last() {
                j.insert_after(last, vec![imp]);
            } else {
                let prog = j.program();
                let mut body = j.ast.list(prog, "body");
                body.insert(0, imp);
                j.ast.set_list(prog, "body", body);
            }
        }
    }
    if remaining == 0 {
        for p in badge_imports {
            if !matches!(j.ast.get(p.node, "specifiers"), V::Arr(_)) {
                continue;
            }
            let specs = j.ast.list(p.node, "specifiers");
            let filtered: Vec<usize> = specs
                .iter()
                .copied()
                .filter(|s| {
                    if j.ast.is(*s, "ImportSpecifier") && j.ast.child(*s, "imported").map(|i| j.ast.is(i, "Identifier") && j.ast.name(i) == Some("XDSBadge")).unwrap_or(false) {
                        return false;
                    }
                    if j.ast.is(*s, "ImportDefaultSpecifier") && j.name_of(j.ast.child(*s, "local")).as_deref() == Some("XDSBadge") {
                        return false;
                    }
                    true
                })
                .collect();
            if filtered.is_empty() {
                j.remove(&p);
            } else if filtered.len() != specs.len() {
                j.ast.set_list(p.node, "specifiers", filtered);
            }
        }
    }
    Ok(Some(j.to_source(None)))
}
