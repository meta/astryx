//! v0.7.0 `migrate-deprecated-theme-surface`: static theme keys in JS/TS and
//! target classes in CSS.

use super::lhelp::*;
use super::v0_6_0_css::{extname_lower, map_scope_params, migrate_astryx_theme_selectors, v06_data};
use crate::commands::upgrade::css::postcss::{self, Kind};
use crate::commands::upgrade::css::selector::{SType, Sel, SelError};
use crate::commands::upgrade::css::{css_parse_error, selector};
use crate::commands::upgrade::jsc::*;
use crate::commands::upgrade::jsre;
use crate::commands::upgrade::recast::V;
use crate::commands::upgrade::transforms::common::{imported_components, resolve_imported_component, ImportedComponents, PropOptions};
use serde_json::Value;

pub const DEPRECATED_THEME_TARGETS: &[(&str, &str)] = &[
    ("base-table", "table"),
    ("checkbox", "checkbox-indicator"),
    ("codeblock", "code-block"),
    ("codeblock-copy-button", "code-block-copy-button"),
    ("codeblock-header", "code-block-header"),
    ("codeblock-title", "code-block-title"),
    ("date-input-clear-icon", "input-clear-icon"),
    ("date-range-input-clear-icon", "input-clear-icon"),
    ("hovercard", "hover-card"),
    ("multi-selector-clear-icon", "input-clear-icon"),
    ("navicon", "nav-icon"),
    ("popover-surface", "popover"),
    ("progressbar", "progress-bar"),
    ("progressbar-fill", "progress-bar-fill"),
    ("progressbar-mark", "progress-bar-mark"),
    ("progressbar-track", "progress-bar-track"),
    ("radio", "radio-indicator"),
    ("radio-dot", "radio-indicator-dot"),
    ("selector-clear-icon", "input-clear-icon"),
    ("statusdot", "status-dot"),
    ("textarea", "text-area"),
];

pub const SCOPED_CLEAR_ICON_OWNERS: &[(&str, &str)] = &[("date-input-clear-icon", "date-input"), ("date-range-input-clear-icon", "date-range-input"), ("multi-selector-clear-icon", "multi-selector"), ("selector-clear-icon", "selector")];

fn deprecated(k: &str) -> Option<&'static str> {
    DEPRECATED_THEME_TARGETS.iter().find(|e| e.0 == k).map(|e| e.1)
}
fn owner_of(k: &str) -> Option<&'static str> {
    SCOPED_CLEAR_ICON_OWNERS.iter().find(|e| e.0 == k).map(|e| e.1)
}

const TODO_PREFIX: &str = " TODO(astryx upgrade): merge deprecated theme target ";
const SCOPE_TODO_PREFIX: &str = " TODO(astryx upgrade): ";

fn known_selector_target(t: &str) -> bool {
    let d = v06_data();
    d.targets.contains_key(t) || d.dynamic.contains_key(t)
}

fn known_bare_token(t: &str) -> bool {
    v06_data().targets.values().any(|m| m.contains_key(t))
}

fn target_emitted_bare_class(target: &str, token: &str) -> bool {
    let d = v06_data();
    if d.targets.get(target).and_then(|m| m.get(token)).map(|v| !v.is_null()).unwrap_or(false) {
        return true;
    }
    d.dynamic.get(target).map(|rules| rules.iter().any(|r| if r.token == "class-value" { true } else { r.prefix.as_deref().map(|p| token.starts_with(p) && token[p.len()..].as_bytes().first().map(|c| c.is_ascii_digit()).unwrap_or(false)).unwrap_or(false) })).unwrap_or(false)
}

fn compound_targets_for_pseudo(s: &Sel, pseudo: usize) -> Vec<String> {
    let parent = match s.n[pseudo].parent {
        Some(p) if s.ty(p) == SType::Selector => p,
        _ => return vec![],
    };
    let kids = s.kids(parent);
    let index = kids.iter().position(|&k| k == pseudo).map(|i| i as i64).unwrap_or(-1);
    let mut compound = vec![];
    let mut c = index - 1;
    while c >= 0 {
        let n = kids[c as usize];
        if s.ty(n) == SType::Combinator {
            break;
        }
        compound.push(n);
        c -= 1;
    }
    let mut c = index + 1;
    while (c as usize) < kids.len() {
        let n = kids[c as usize];
        if s.ty(n) == SType::Combinator {
            break;
        }
        compound.push(n);
        c += 1;
    }
    let mut targets: Vec<String> = vec![];
    for n in compound {
        if s.ty(n) != SType::Class || !s.val(n).starts_with("astryx-") {
            continue;
        }
        let t = s.val(n)["astryx-".len()..].to_string();
        if known_selector_target(&t) && !targets.contains(&t) {
            targets.push(t);
        }
    }
    targets
}

fn owner_scope(s: &mut Sel, owner: &str) -> usize {
    let c = s.class_name(&format!("astryx-{}", owner));
    let comb = s.combinator(" ");
    let u = s.universal("*");
    let sel = s.selector(vec![c, comb, u]);
    s.pseudo(":where", vec![sel])
}

fn finish_selector_migration(s: &mut Sel, selector: usize) {
    s.walk_type(selector, SType::Pseudo, &mut |s, pseudo| {
        if s.val(pseudo) != ":is" || s.n[pseudo].nodes.is_none() {
            return;
        }
        let targets = compound_targets_for_pseudo(s, pseudo);
        if targets.is_empty() {
            return;
        }
        let has_attr = s.kids(pseudo).iter().any(|&arm| s.ty(arm) == SType::Selector && s.kids(arm).iter().any(|&n| s.ty(n) == SType::Attribute));
        if !has_attr {
            return;
        }
        for arm in s.kids(pseudo) {
            let ak = s.kids(arm);
            if s.ty(arm) != SType::Selector || ak.len() != 1 {
                continue;
            }
            let only = ak[0];
            if s.ty(only) != SType::Class || s.val(only).starts_with("astryx-") || !targets.iter().any(|t| target_emitted_bare_class(t, s.val(only))) {
                continue;
            }
            s.remove(arm);
        }
    });
    s.walk_type(selector, SType::Class, &mut |s, class| {
        if !s.val(class).starts_with("astryx-") {
            return;
        }
        let old = s.val(class)["astryx-".len()..].to_string();
        // Plain-object lookups: inherited Object.prototype members count.
        let new = match crate::commands::upgrade::transforms::jsproto::lookup(DEPRECATED_THEME_TARGETS, &old) {
            Some(n) => n.string(),
            None => return,
        };
        s.set_class_value(class, &format!("astryx-{}", new));
        if let Some(owner) = crate::commands::upgrade::transforms::jsproto::lookup(SCOPED_CLEAR_ICON_OWNERS, &old).map(|h| h.string()) {
            let sc = owner_scope(s, &owner);
            let parent = s.n[class].parent.unwrap();
            s.insert_after(parent, class, sc);
        }
    });
}

fn unclassified_bare_classes(text: &str) -> Vec<String> {
    let mut found: Vec<String> = vec![];
    if let Ok(mut s) = selector::parse(text) {
        let root = s.root;
        s.walk(root, &mut |s, node| {
            if s.ty(node) != SType::Selector {
                return true;
            }
            let mut compounds: Vec<Vec<usize>> = vec![vec![]];
            for c in s.kids(node) {
                if s.ty(c) == SType::Combinator {
                    compounds.push(vec![]);
                } else {
                    compounds.last_mut().unwrap().push(c);
                }
            }
            for comp in compounds {
                let has_target = comp.iter().any(|&c| s.ty(c) == SType::Class && s.val(c).starts_with("astryx-") && known_selector_target(&s.val(c)["astryx-".len()..]));
                if !has_target {
                    continue;
                }
                for &c in &comp {
                    if s.ty(c) == SType::Class && !s.val(c).starts_with("astryx-") && known_bare_token(s.val(c)) {
                        let v = s.val(c).to_string();
                        if !found.contains(&v) {
                            found.push(v);
                        }
                    }
                }
            }
            true
        });
    }
    found.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    found
}

fn finish_selector_text(text: &str) -> Result<String, SelError> {
    let mut s = selector::parse(text)?;
    let root = s.root;
    s.each(root, &mut |s, sel| {
        finish_selector_migration(s, sel);
        true
    });
    Ok(s.to_string(s.root))
}

fn sel_err_at_rule(css: &postcss::Css, rule: usize, e: &SelError) -> CodemodError {
    css_parse_error(css.error_inside(rule, &e.message, e.index))
}

fn migrate_css(source: &str, from: &str) -> Result<String, CodemodError> {
    let mut original = postcss::parse(source, Some(from)).map_err(css_parse_error)?;
    let mut err: Option<CodemodError> = None;
    original.walk_kind(Kind::Rule, &mut |c, rule| {
        if err.is_some() {
            return;
        }
        if let Err(e) = selector::parse(&c.nodes[rule].selector) {
            err = Some(sel_err_at_rule(c, rule, &e));
        }
    });
    if let Some(e) = err {
        return Err(e);
    }
    original.walk_at_rules("scope", &mut |c, at| {
        if err.is_some() {
            return;
        }
        let n = &c.nodes[at];
        let offset = format!("@{}", n.name).encode_utf16().count() + n.raws.after_name.as_deref().unwrap_or("").encode_utf16().count();
        let params = n.params.clone();
        let r: Result<String, SelError> = map_scope_params(&params, &mut |g, start| match selector::parse(g) {
            Ok(_) => Ok(g.to_string()),
            Err(e) => Err(SelError { message: e.message, index: Some(offset + start) }),
        });
        if let Err(e) = r {
            err = Some(sel_err_at_rule(c, at, &e));
        }
    });
    if let Some(e) = err {
        return Err(e);
    }
    let migrated = migrate_astryx_theme_selectors(source, from, v06_data())?;
    let mut root = postcss::parse(&migrated, Some(from)).map_err(css_parse_error)?;
    let mut existing: Vec<String> = vec![];
    root.walk_kind(Kind::Comment, &mut |c, id| existing.push(postcss::js_trim(&c.nodes[id].text).to_string()));
    root.walk_kind(Kind::Rule, &mut |c, rule| {
        if err.is_some() {
            return;
        }
        let text = match finish_selector_text(&c.nodes[rule].selector) {
            Ok(t) => t,
            Err(e) => {
                err = Some(sel_err_at_rule(c, rule, &e));
                return;
            }
        };
        c.nodes[rule].selector = text.clone();
        let tokens = unclassified_bare_classes(&text);
        if tokens.is_empty() {
            return;
        }
        let list = tokens.iter().map(|t| format!(".{}", t)).collect::<Vec<_>>().join(", ");
        let msg = format!("{}Astryx 0.7 no longer emits bare prop/state classes, and {} had no known 0.6 meaning on this target. Replace it with the target's data-* attribute or remove it.", SCOPE_TODO_PREFIX, list);
        let msg = postcss::js_trim(&msg).to_string();
        if existing.contains(&msg) {
            return;
        }
        let cm = c.new_comment(&msg);
        c.insert_before(rule, cm);
        existing.push(msg);
    });
    if let Some(e) = err {
        return Err(e);
    }
    root.walk_at_rules("scope", &mut |c, at| {
        if err.is_some() {
            return;
        }
        let params = c.nodes[at].params.clone();
        match map_scope_params(&params, &mut |g, _| finish_selector_text(g)) {
            Ok(p) => c.nodes[at].params = p,
            Err(e) => err = Some(CodemodError::msg(e.message)),
        }
    });
    if let Some(e) = err {
        return Err(e);
    }
    Ok(root.to_string())
}

// ---------------------------------------------------------------- JS/TS

fn static_property_name(j: &J, prop: usize) -> Option<String> {
    let key = j.ast.child(prop, "key")?;
    if !j.ast.flag(prop, "computed") && j.ast.is(key, "Identifier") {
        return j.ast.name(key).map(|s| s.to_string());
    }
    if matches!(j.ast.ty(key), "StringLiteral" | "Literal") {
        if let V::Str(s) = j.ast.get(key, "value") {
            return Some(s.to_string());
        }
    }
    None
}

const THEME_TYPE_NAMES: &[&str] = &["DefineThemeInput", "DefinedTheme", "ResolvedDefinedTheme"];

fn is_wrapper(t: &str) -> bool {
    matches!(t, "TSAsExpression" | "TSSatisfiesExpression" | "TSNonNullExpression" | "TSTypeAssertion" | "TypeCastExpression" | "ParenthesizedExpression")
}

struct Bindings {
    define_theme: ImportedComponents,
    theme_types: Vec<String>,
    namespaces: Vec<String>,
    described: Option<Vec<String>>,
    file_path: String,
}

fn described_theme_export_name(file_path: &str) -> Option<String> {
    let (dir, base) = match file_path.rfind('/') {
        Some(i) => (&file_path[..i], &file_path[i + 1..]),
        None => (".", file_path),
    };
    let dir = if dir.is_empty() { "/" } else { dir };
    let stem = match base.rfind('.') {
        Some(i) if i > 0 => &base[..i],
        _ => base,
    };
    let doc = if dir == "/" { format!("/{}.doc.mjs", stem) } else if dir == "." { format!("{}.doc.mjs", stem) } else { format!("{}/{}.doc.mjs", dir, stem) };
    if !std::path::Path::new(&doc).exists() {
        return None;
    }
    let label = format!("Theme descriptor {}", doc);
    match crate::commands::theme::descriptor::read_static_descriptor_value(&doc, &label, "ThemeDoc", false) {
        Ok(v) if v.get("type").and_then(|t| t.as_str()) == Some("theme") => Some(stem.to_string()),
        _ => None,
    }
}

fn local_names_exported_as(j: &J, export_name: &str) -> Vec<String> {
    let mut locals: Vec<String> = vec![];
    for ep in j.find("ExportNamedDeclaration") {
        let n = ep.node;
        if j.ast.str_of(n, "exportKind") == Some("type") || j.ast.child(n, "source").is_some() {
            continue;
        }
        if let Some(d) = j.ast.child(n, "declaration") {
            for decl in j.ast.list(d, "declarations") {
                if j.ast.child(decl, "id").and_then(|i| j.ast.str_of(i, "name")) == Some(export_name) && !locals.iter().any(|l| l == export_name) {
                    locals.push(export_name.to_string());
                }
            }
        }
        for spec in j.ast.list(n, "specifiers") {
            let name_of = |k: &str| j.ast.child(spec, k).and_then(|x| j.ast.str_of(x, "name").or_else(|| j.ast.str_of(x, "value"))).map(|s| s.to_string());
            let exported = name_of("exported");
            let local = name_of("local");
            if j.ast.str_of(spec, "exportKind") != Some("type") && exported.as_deref() == Some(export_name) {
                if let Some(l) = local {
                    if !locals.contains(&l) {
                        locals.push(l);
                    }
                }
            }
        }
    }
    locals
}

impl Bindings {
    fn described_locals(&mut self, j: &J) -> &Vec<String> {
        if self.described.is_none() {
            let v = match described_theme_export_name(&self.file_path) {
                Some(name) => local_names_exported_as(j, &name),
                None => vec![],
            };
            self.described = Some(v);
        }
        self.described.as_ref().unwrap()
    }
}

fn names_binding(j: &J, name: Option<usize>, locals: &[String], namespaces: &[String]) -> bool {
    let name = match name {
        Some(n) => n,
        None => return false,
    };
    if j.ast.is(name, "Identifier") {
        return locals.iter().any(|l| Some(l.as_str()) == j.ast.name(name));
    }
    let object = j.ast.child(name, "object").or_else(|| j.ast.child(name, "left"));
    let property = j.ast.child(name, "property").or_else(|| j.ast.child(name, "right"));
    match (object, property) {
        (Some(o), Some(p)) => j.ast.is(o, "Identifier") && namespaces.iter().any(|n| Some(n.as_str()) == j.ast.name(o)) && j.ast.is(p, "Identifier") && THEME_TYPE_NAMES.contains(&j.ast.name(p).unwrap_or("")),
        _ => false,
    }
}

fn statement_declares(j: &J, st: usize, name: &str) -> bool {
    let node = if matches!(j.ast.ty(st), "ExportNamedDeclaration" | "ExportDefaultDeclaration") { j.ast.child(st, "declaration") } else { Some(st) };
    let node = match node {
        Some(n) => n,
        None => return false,
    };
    if let Some(id) = j.ast.child(node, "id") {
        if j.ast.is(id, "Identifier") && j.ast.name(id) == Some(name) {
            return true;
        }
    }
    j.ast.list(node, "declarations").iter().any(|&d| j.ast.child(d, "id").map(|i| j.ast.is(i, "Identifier") && j.ast.name(i) == Some(name)).unwrap_or(false))
}

fn is_module_type_binding(j: &J, p: &NPath, name: &str) -> bool {
    if let Some(sc) = j.lookup_scope(p, name) {
        if !j.ast.is(sc, "Program") {
            return false;
        }
    }
    let mut cur = Some(p.clone());
    while let Some(c) = cur {
        let node = c.node;
        if j.ast.is(node, "Program") {
            return true;
        }
        if let Some(tp) = j.ast.child(node, "typeParameters") {
            for param in j.ast.list(tp, "params") {
                let pname = match j.ast.get(param, "name") {
                    V::Str(s) => Some(s.to_string()),
                    V::Node(n) => j.ast.name(*n).map(|s| s.to_string()),
                    _ => None,
                };
                if pname.as_deref() == Some(name) {
                    return false;
                }
            }
        }
        let statements = if j.ast.is(node, "SwitchCase") {
            j.ast.list(node, "consequent")
        } else if !j.ast.is(node, "ClassBody") && matches!(j.ast.get(node, "body"), V::Arr(_)) {
            j.ast.list(node, "body")
        } else {
            vec![]
        };
        if statements.iter().any(|&s| statement_declares(j, s, name)) {
            return false;
        }
        cur = c.parent_path();
    }
    false
}

fn is_astryx_theme_type(j: &J, type_node: Option<usize>, use_path: &NPath, b: &Bindings) -> bool {
    let node = match type_node {
        Some(t) => j.ast.child(t, "typeAnnotation").unwrap_or(t),
        None => return false,
    };
    if !j.ast.is(node, "TSTypeReference") {
        return false;
    }
    let tn = j.ast.child(node, "typeName");
    if !names_binding(j, tn, &b.theme_types, &b.namespaces) {
        return false;
    }
    let tn = tn.unwrap();
    let root = if j.ast.is(tn, "Identifier") { tn } else { j.ast.child(tn, "left").unwrap() };
    is_module_type_binding(j, use_path, j.ast.name(root).unwrap_or(""))
}

fn is_direct_theme_object(j: &J, node: usize) -> bool {
    let props = j.ast.list(node, "properties");
    let name = props.iter().copied().find(|&p| static_property_name(j, p).as_deref() == Some("name"));
    let ok = name.and_then(|n| j.ast.child(n, "value")).map(|v| matches!(j.ast.ty(v), "StringLiteral" | "Literal") && matches!(j.ast.get(v, "value"), V::Str(_))).unwrap_or(false);
    if !ok {
        return false;
    }
    let comps = props.iter().copied().find(|&p| static_property_name(j, p).as_deref() == Some("components"));
    let map = comps.and_then(|c| j.ast.child(c, "value"));
    match map {
        Some(m) if j.ast.is(m, "Identifier") => true,
        Some(m) if j.ast.is(m, "ObjectExpression") => j.ast.list(m, "properties").iter().all(|&e| j.ast.is(e, "SpreadElement") || j.ast.child(e, "value").map(|v| j.ast.is(v, "ObjectExpression")).unwrap_or(false)),
        _ => false,
    }
}

fn skip_wrappers(j: &J, p: Option<NPath>) -> Option<NPath> {
    let mut parent = p;
    while let Some(pp) = &parent {
        if !is_wrapper(j.ast.ty(pp.node)) {
            break;
        }
        parent = pp.parent_path();
    }
    parent
}

fn is_described_theme_binding(j: &J, op: &NPath, b: &mut Bindings) -> bool {
    let parent = match skip_wrappers(j, op.parent_path()) {
        Some(p) => p,
        None => return false,
    };
    let decl = parent.node;
    if !j.ast.is(decl, "VariableDeclarator") {
        return false;
    }
    let id = match j.ast.child(decl, "id") {
        Some(i) if j.ast.is(i, "Identifier") => i,
        _ => return false,
    };
    let declaration = parent.parent_path();
    let container_path = declaration.as_ref().and_then(|d| d.parent_path());
    let container = container_path.as_ref().map(|c| j.ast.ty(c.node));
    let top = container == Some("Program") || (container == Some("ExportNamedDeclaration") && container_path.as_ref().and_then(|c| c.parent_path()).map(|g| j.ast.is(g.node, "Program")).unwrap_or(false));
    let name = j.ast.name(id).unwrap_or("").to_string();
    top && b.described_locals(j).contains(&name)
}

fn is_theme_root(j: &J, op: &NPath, b: &mut Bindings, o: &PropOptions) -> bool {
    let mut child = op.clone();
    let mut parent = op.parent_path();
    while let Some(pp) = parent.clone() {
        if !is_wrapper(j.ast.ty(pp.node)) {
            break;
        }
        if is_astryx_theme_type(j, j.ast.child(pp.node, "typeAnnotation"), &pp, b) {
            return true;
        }
        child = pp.clone();
        parent = pp.parent_path();
    }
    if let Some(pp) = &parent {
        let node = pp.node;
        if j.ast.is(node, "CallExpression") && j.ast.list(node, "arguments").first() == Some(&child.node) {
            let callee = j.ast.child(node, "callee").unwrap();
            if resolve_imported_component(j, callee, pp, &b.define_theme, o).is_some() {
                return true;
            }
        }
        if j.ast.is(node, "VariableDeclarator") {
            let ta = j.ast.child(node, "id").and_then(|i| j.ast.child(i, "typeAnnotation"));
            if is_astryx_theme_type(j, ta, pp, b) {
                return true;
            }
        }
    }
    is_direct_theme_object(j, op.node) && is_described_theme_binding(j, op, b)
}

fn has_theme_context(j: &J, owner: Option<NPath>, b: &mut Bindings, o: &PropOptions) -> bool {
    let mut current = owner;
    while let Some(c) = current {
        if j.ast.is(c.node, "ObjectExpression") && is_theme_root(j, &c, b, o) {
            return true;
        }
        let parent = skip_wrappers(j, c.parent_path());
        let ty = parent.as_ref().map(|p| j.ast.ty(p.node));
        match ty {
            Some("ObjectProperty") | Some("Property") => current = parent.unwrap().parent_path(),
            Some("ArrayExpression") => current = parent,
            _ => return false,
        }
    }
    false
}

fn components_variable_feeds_theme(j: &J, op: &NPath, b: &mut Bindings, o: &PropOptions) -> bool {
    let parent = match op.parent() {
        Some(p) => p,
        None => return false,
    };
    if !j.ast.is(parent, "VariableDeclarator") {
        return false;
    }
    match j.ast.child(parent, "id") {
        Some(i) if j.ast.is(i, "Identifier") && j.ast.name(i) == Some("components") => {}
        _ => return false,
    }
    let binding_scope = j.lookup_scope(op, "components");
    for pp in j.find("ObjectProperty") {
        if !j.ast.is(pp.node, "ObjectProperty") {
            continue;
        }
        if static_property_name(j, pp.node).as_deref() != Some("components") {
            continue;
        }
        match j.ast.child(pp.node, "value") {
            Some(v) if j.ast.is(v, "Identifier") && j.ast.name(v) == Some("components") => {}
            _ => continue,
        }
        if binding_scope.is_some() && j.lookup_scope(&pp, "components") != binding_scope {
            continue;
        }
        if has_theme_context(j, pp.parent_path(), b, o) {
            return true;
        }
    }
    false
}

fn is_components_map(j: &J, op: &NPath, b: &mut Bindings, o: &PropOptions) -> bool {
    let parent = skip_wrappers(j, op.parent_path());
    if let Some(pp) = &parent {
        if matches!(j.ast.ty(pp.node), "ObjectProperty" | "Property") && static_property_name(j, pp.node).as_deref() == Some("components") {
            return has_theme_context(j, pp.parent_path(), b, o);
        }
    }
    components_variable_feeds_theme(j, op, b, o)
}

fn migrate_static_theme_keys(source: &str, path: &str) -> TResult {
    let mut j = parse_file(source, path)?;
    let mi = |s: &str| jsre::test("^@astryxdesign\\/", "u", s);
    let norm = |s: &str| s.to_string();
    let comps: &[(&str, &[&str])] = &[("defineTheme", &[])];
    let o = PropOptions { matches_import: &mi, components: comps, normalize: &norm };
    let mut b = Bindings { define_theme: imported_components(&j, &o), theme_types: vec![], namespaces: vec![], described: None, file_path: path.to_string() };
    for ip in j.find("ImportDeclaration") {
        match source_value(&j, ip.node) {
            Some(s) if mi(&s) => {}
            _ => continue,
        }
        for s in j.ast.list(ip.node, "specifiers") {
            let local = match local_name(&j, s) {
                Some(l) if !l.is_empty() => l,
                _ => continue,
            };
            if j.ast.is(s, "ImportNamespaceSpecifier") {
                if !b.namespaces.contains(&local) {
                    b.namespaces.push(local);
                }
            } else if j.ast.is(s, "ImportSpecifier") {
                let imported = j.ast.child(s, "imported").and_then(|i| j.ast.name(i).or_else(|| j.ast.str_of(i, "value"))).unwrap_or("");
                if THEME_TYPE_NAMES.contains(&imported) && !b.theme_types.contains(&local) {
                    b.theme_types.push(local);
                }
            }
        }
    }
    let mut changed = false;
    for op in j.find("ObjectExpression") {
        if !is_components_map(&j, &op, &mut b, &o) {
            continue;
        }
        let props = j.ast.list(op.node, "properties");
        let mut static_keys: Vec<String> = props.iter().filter_map(|&p| static_property_name(&j, p)).filter(|s| !s.is_empty()).collect();
        for p in props {
            if !matches!(j.ast.ty(p), "ObjectProperty" | "Property") {
                continue;
            }
            let old = match static_property_name(&j, p) {
                Some(o) if !o.is_empty() => o,
                _ => continue,
            };
            if let Some(crate::commands::upgrade::transforms::jsproto::Hit::Proto(pr)) = crate::commands::upgrade::transforms::jsproto::lookup(DEPRECATED_THEME_TARGETS, &old) {
                return Err(pr.builder_error("value", "string", "StringLiteral"));
            }
            let new = match deprecated(&old) {
                Some(n) => n,
                None => continue,
            };
            if static_keys.iter().any(|k| k == new) {
                let msg = format!("{}`{}` into `{}`; both keys are present. ", TODO_PREFIX, old, new);
                let cs = comments_of(&j, p);
                if cs.as_ref().map(|c| c.iter().any(|&x| j.ast.str_of(x, "value") == Some(msg.as_str()))).unwrap_or(false) {
                    continue;
                }
                let mut cs = cs.unwrap_or_default();
                let c = comment(&mut j, true, &msg, true, false);
                cs.push(c);
                set_comments(&mut j, p, cs);
                changed = true;
                continue;
            }
            let k = j.string_literal(new);
            j.ast.set_node(p, "key", k);
            j.ast.set(p, "computed", V::Bool(false));
            j.ast.set(p, "shorthand", V::Bool(false));
            if let Some(owner) = owner_of(&old) {
                let msg = format!("{}`{}` became `input-clear-icon`, which styles the clear icon of every input. To keep these styles on one component, move them to CSS under `.astryx-input-clear-icon:where(.astryx-{} *)`. ", SCOPE_TODO_PREFIX, old, owner);
                let mut cs = comments_of(&j, p).unwrap_or_default();
                let c = comment(&mut j, true, &msg, true, false);
                cs.push(c);
                set_comments(&mut j, p, cs);
            }
            static_keys.retain(|k| *k != old);
            if !static_keys.iter().any(|k| k == new) {
                static_keys.push(new.to_string());
            }
            changed = true;
        }
    }
    done(&j, changed)
}

pub fn migrate_deprecated_theme_surface(source: &str, path: &str, _o: &Value) -> TResult {
    if extname_lower(path) == ".css" {
        let r = migrate_css(source, path)?;
        return Ok(if r == source { None } else { Some(r) });
    }
    migrate_static_theme_keys(source, path)
}
