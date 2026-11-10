//! v0.0.7 – v0.0.10 transforms.

use crate::commands::upgrade::jsc::*;
use super::v0_0_2::{opening_ident, rename_attr_on};
use serde_json::Value;

pub fn rename_banner_variant(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = rename_attr_on(&mut j, "XDSBanner", "variant", "container");
    for p in j.find("Identifier") {
        if j.ast.name(p.node) == Some("XDSBannerVariant") {
            j.set_name(p.node, "XDSBannerContainer");
            changed = true;
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

const TOKEN_RENAMES: &[(&str, &str)] = &[
    ("--color-secondary", "--color-neutral"),
    ("--color-info-muted", "--color-background-purple"),
    ("--color-info", "--color-icon-purple"),
    ("--color-ring-focus-success", "--color-success"),
    ("--color-ring-focus-warning", "--color-warning"),
    ("--color-ring-focus-error", "--color-error"),
    ("--color-ring-focus", "--color-accent"),
    ("--color-border-strong", "--color-border-emphasized"),
    ("--color-text-link", "--color-text-accent"),
    ("--color-text-on-dark-media", "--color-on-dark"),
    ("--color-icon-on-dark-media", "--color-on-dark"),
    ("--color-wash", "--color-background-body"),
    ("--color-surface", "--color-background-surface"),
    ("--color-card", "--color-background-card"),
    ("--color-popover", "--color-background-popover"),
    ("--color-muted", "--color-background-muted"),
    ("--color-hover-tint", "--color-tint-hover"),
    ("--color-blue-background", "--color-background-blue"),
    ("--color-blue-border", "--color-border-blue"),
    ("--color-blue-icon", "--color-icon-blue"),
    ("--color-blue-text", "--color-text-blue"),
    ("--color-cyan-background", "--color-background-cyan"),
    ("--color-cyan-border", "--color-border-cyan"),
    ("--color-cyan-icon", "--color-icon-cyan"),
    ("--color-cyan-text", "--color-text-cyan"),
    ("--color-gray-background", "--color-background-gray"),
    ("--color-gray-border", "--color-border-gray"),
    ("--color-gray-icon", "--color-icon-gray"),
    ("--color-gray-text", "--color-text-gray"),
    ("--color-green-background", "--color-background-green"),
    ("--color-green-border", "--color-border-green"),
    ("--color-green-icon", "--color-icon-green"),
    ("--color-green-text", "--color-text-green"),
    ("--color-orange-background", "--color-background-orange"),
    ("--color-orange-border", "--color-border-orange"),
    ("--color-orange-icon", "--color-icon-orange"),
    ("--color-orange-text", "--color-text-orange"),
    ("--color-pink-background", "--color-background-pink"),
    ("--color-pink-border", "--color-border-pink"),
    ("--color-pink-icon", "--color-icon-pink"),
    ("--color-pink-text", "--color-text-pink"),
    ("--color-purple-background", "--color-background-purple"),
    ("--color-purple-border", "--color-border-purple"),
    ("--color-purple-icon", "--color-icon-purple"),
    ("--color-purple-text", "--color-text-purple"),
    ("--color-red-background", "--color-background-red"),
    ("--color-red-border", "--color-border-red"),
    ("--color-red-icon", "--color-icon-red"),
    ("--color-red-text", "--color-text-red"),
    ("--color-teal-background", "--color-background-teal"),
    ("--color-teal-border", "--color-border-teal"),
    ("--color-teal-icon", "--color-icon-teal"),
    ("--color-teal-text", "--color-text-teal"),
    ("--color-yellow-background", "--color-background-yellow"),
    ("--color-yellow-border", "--color-border-yellow"),
    ("--color-yellow-icon", "--color-icon-yellow"),
    ("--color-yellow-text", "--color-text-yellow"),
    ("--size-sm", "--size-element-sm"),
    ("--size-md", "--size-element-md"),
    ("--size-lg", "--size-element-lg"),
    ("--radius-0", "--radius-none"),
    ("--radius-1", "--radius-inner"),
    ("--radius-2", "--radius-element"),
    ("--radius-3", "--radius-container"),
    ("--radius-4", "--radius-container"),
    ("--radius-rounded", "--radius-full"),
    ("--shadow-base", "--shadow-low"),
    ("--shadow-menu", "--shadow-low"),
    ("--shadow-hover", "--shadow-med"),
    ("--shadow-dialog", "--shadow-high"),
    ("--inset-shadow-border-hover", "--shadow-inset-hover"),
    ("--inset-shadow-border-accent", "--shadow-inset-selected"),
    ("--inset-shadow-border-positive", "--shadow-inset-success"),
    ("--inset-shadow-border-warning", "--shadow-inset-warning"),
    ("--inset-shadow-border-negative", "--shadow-inset-error"),
    ("--font-body", "--font-family-body"),
    ("--font-code", "--font-family-code"),
    ("--font-heading", "--font-family-heading"),
    ("--text-4xs", "--font-size-4xs"),
    ("--text-3xs", "--font-size-3xs"),
    ("--text-2xs", "--font-size-2xs"),
    ("--text-xsm", "--font-size-xs"),
    ("--text-sm", "--font-size-sm"),
    ("--text-base", "--font-size-base"),
    ("--text-lg", "--font-size-lg"),
    ("--text-xl", "--font-size-xl"),
    ("--text-2xl", "--font-size-2xl"),
    ("--text-3xl", "--font-size-3xl"),
    ("--text-4xl", "--font-size-4xl"),
    ("--text-5xl", "--font-size-5xl"),
    ("--leading-base", "--text-body-leading"),
    ("--leading-snug", "--text-label-leading"),
    ("--leading-normal", "--text-large-leading"),
    ("--leading-tight", "--text-heading-1-leading"),
    ("--leading-relaxed", "--text-supporting-leading"),
    ("--heading-1-size", "--text-heading-1-size"),
    ("--heading-1-weight", "--text-heading-1-weight"),
    ("--heading-1-leading", "--text-heading-1-leading"),
    ("--heading-2-size", "--text-heading-2-size"),
    ("--heading-2-weight", "--text-heading-2-weight"),
    ("--heading-2-leading", "--text-heading-2-leading"),
    ("--heading-3-size", "--text-heading-3-size"),
    ("--heading-3-weight", "--text-heading-3-weight"),
    ("--heading-3-leading", "--text-heading-3-leading"),
    ("--heading-4-size", "--text-heading-4-size"),
    ("--heading-4-weight", "--text-heading-4-weight"),
    ("--heading-4-leading", "--text-heading-4-leading"),
    ("--heading-5-size", "--text-heading-5-size"),
    ("--heading-5-weight", "--text-heading-5-weight"),
    ("--heading-5-leading", "--text-heading-5-leading"),
    ("--heading-6-size", "--text-heading-6-size"),
    ("--heading-6-weight", "--text-heading-6-weight"),
    ("--heading-6-leading", "--text-heading-6-leading"),
];

pub fn migrate_token_renames(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = j.replace_string_tokens(TOKEN_RENAMES);
    let idmap = [("lineHeightVars", "typeScaleVars"), ("lineHeightDefaults", "typeScaleDefaults"), ("lineHeightRaw", "typeScaleDefaults")];
    for p in j.find("ImportSpecifier") {
        let imported = j.ast.child(p.node, "imported").unwrap();
        let old = j.ast.name(imported).unwrap_or("").to_string();
        let new = match idmap.iter().find(|(o, _)| *o == old) {
            Some((_, n)) => *n,
            None => continue,
        };
        let decl = p.parent().unwrap();
        let siblings = j.ast.list(decl, "specifiers");
        let exists = siblings.iter().any(|s| *s != p.node && j.ast.is(*s, "ImportSpecifier") && j.name_of(j.ast.child(*s, "imported")).as_deref() == Some(new));
        if exists {
            if siblings.contains(&p.node) {
                let rest: Vec<usize> = siblings.into_iter().filter(|s| *s != p.node).collect();
                j.ast.set_list(decl, "specifiers", rest);
                changed = true;
            }
        } else {
            j.set_name(imported, new);
            if let Some(local) = j.ast.child(p.node, "local") {
                if j.ast.name(local) == Some(old.as_str()) {
                    j.set_name(local, new);
                }
            }
            changed = true;
        }
    }
    for p in j.find("Identifier") {
        let n = j.ast.name(p.node).unwrap_or("").to_string();
        let new = match idmap.iter().find(|(o, _)| *o == n) {
            Some((_, x)) => *x,
            None => continue,
        };
        if p.parent().map(|pp| j.ast.is(pp, "ImportSpecifier")).unwrap_or(false) {
            continue;
        }
        j.set_name(p.node, new);
        changed = true;
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn rename_endslot(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("JSXAttribute") {
        let n = j.ast.child(p.node, "name").unwrap();
        if j.ast.name(n) == Some("endSlot") {
            j.set_name(n, "endContent");
            changed = true;
        }
    }
    for p in j.find("Identifier") {
        if j.ast.name(p.node) != Some("endSlot") {
            continue;
        }
        let parent = p.parent().unwrap();
        let is_key = matches!(j.ast.ty(parent), "Property" | "ObjectProperty") && j.ast.child(parent, "key") == Some(p.node);
        if is_key {
            j.set_name(p.node, "endContent");
            if j.ast.flag(parent, "shorthand") {
                if let Some(v) = j.ast.child(parent, "value") {
                    if j.ast.is(v, "Identifier") && j.ast.name(v) == Some("endSlot") {
                        j.set_name(v, "endContent");
                    }
                }
            }
            changed = true;
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}

pub fn remove_size_props(source: &str, path: &str, _o: &Value) -> TResult {
    let mut j = parse_file(source, path)?;
    let mut changed = false;
    for p in j.find("JSXOpeningElement") {
        match opening_ident(&j, p.node) {
            Some(n) if n == "XDSStatusDot" || n == "XDSProgressBar" => {}
            _ => continue,
        }
        let mut attrs = j.ast.list(p.node, "attributes");
        if let Some(i) = attrs.iter().position(|a| j.jsx_attr_name(*a).as_deref() == Some("size")) {
            attrs.remove(i);
            j.ast.set_list(p.node, "attributes", attrs);
            changed = true;
        }
    }
    for p in j.find("ImportDeclaration") {
        let specs = j.ast.list(p.node, "specifiers");
        let keep: Vec<usize> = specs
            .iter()
            .copied()
            .filter(|s| {
                let name = j.name_of(j.ast.child(*s, "imported")).filter(|n| !n.is_empty()).or_else(|| j.name_of(j.ast.child(*s, "local")));
                !matches!(name.as_deref(), Some("XDSStatusDotSize") | Some("XDSProgressBarSize"))
            })
            .collect();
        if keep.len() != specs.len() {
            j.ast.set_list(p.node, "specifiers", keep.clone());
            if keep.is_empty() {
                j.remove(&p);
            }
            changed = true;
        }
    }
    Ok(if changed { Some(j.to_source(None)) } else { None })
}
