//! Theme validations before and after CSS generation (build.mjs component
//! override warnings, heading types, adaptation enrollment;
//! `foundation/config/theme-private-vars.mjs`).

use super::build_impl::{as_obj, is_undef, truthy};
use super::coredocs::{self, ValueClass};
use crate::json::{Map, Value};

/// `adaptationRuleValues(themeDef)` (build.mjs).
pub fn adaptation_rule_values(theme: &Value) -> Vec<Value> {
    if let Some(Value::Array(rules)) = theme.get("__adaptationRules") {
        return rules.clone();
    }
    let rules = theme
        .get("adaptations")
        .and_then(|a| a.get("rules"))
        .filter(|r| !is_undef(Some(r)) && !r.is_null())
        .or_else(|| theme.get("__adaptations").and_then(|a| a.get("rules")));
    match rules {
        Some(Value::Array(list)) => list.iter().filter_map(|r| r.get("value").cloned()).filter(|v| truthy(Some(v))).collect(),
        _ => vec![],
    }
}

/// `getThemeComponentLayers`.
pub fn component_layers(theme: &Value) -> Vec<(&'static str, Map<String, Value>)> {
    let mut layers = Vec::new();
    let mut add = |name: &'static str, surface: Option<&Value>| {
        if let Some(c) = as_obj(surface.and_then(|s| s.get("components"))) {
            if !c.is_empty() {
                layers.push((name, c.clone()));
            }
        }
    };
    let pick = |a: &str, b: &str| -> Option<Value> {
        let x = theme.get(a).filter(|v| !is_undef(Some(v)) && !v.is_null());
        x.or_else(|| theme.get(b)).cloned()
    };
    add("base", Some(theme));
    let on_dark = pick("__onDark", "onDark");
    add("onDark", on_dark.as_ref());
    let on_light = pick("__onLight", "onLight");
    add("onLight", on_light.as_ref());
    layers
}

fn similar(component: &str, known: &[String]) -> Vec<String> {
    let c: Vec<char> = component.chars().collect();
    known
        .iter()
        .filter(|k| {
            if k.contains(component) || component.contains(k.as_str()) {
                return true;
            }
            let kc: Vec<char> = k.chars().collect();
            if (kc.len() as i64 - c.len() as i64).abs() <= 2 {
                let (longer, shorter) = if kc.len() >= c.len() { (&kc, &c) } else { (&c, &kc) };
                let mut diff = 0usize;
                let mut j = 0usize;
                let mut i = 0usize;
                while i < longer.len() && diff <= 2 {
                    if shorter.get(j) != Some(&longer[i]) {
                        diff += 1;
                    } else {
                        j += 1;
                    }
                    i += 1;
                }
                diff += shorter.len().saturating_sub(j);
                return diff <= 2;
            }
            false
        })
        .take(3)
        .cloned()
        .collect()
}

/// `validateComponentOverrides(themeDef)`.
pub fn component_override_warnings(theme: &Value, cli_root: &str) -> Vec<String> {
    let Some(known) = coredocs::known_components(cli_root) else { return vec![] };
    let mut layers: Vec<Map<String, Value>> = component_layers(theme).into_iter().map(|l| l.1).collect();
    for v in adaptation_rule_values(theme) {
        if let Some(c) = as_obj(v.get("components")) {
            if !c.is_empty() {
                layers.push(c.clone());
            }
        }
    }
    let keys: Vec<String> = known.keys().cloned().collect();
    let mut warnings: Vec<String> = Vec::new();
    let mut push = |w: String| {
        if !warnings.contains(&w) {
            warnings.push(w);
        }
    };
    for components in layers {
        for (component, rules) in components {
            let Some(props) = known.get(&component) else {
                let s = similar(&component, &keys);
                let hint = if s.is_empty() { String::new() } else { format!(" Did you mean: {}?", s.join(", ")) };
                push(format!("Unknown component \"{component}\".{hint}"));
                continue;
            };
            let rule_keys: Vec<String> = match &rules {
                Value::Object(m) => m.keys().cloned().collect(),
                Value::String(s) => (0..s.encode_utf16().count()).map(|i| i.to_string()).collect(),
                Value::Array(a) => (0..a.len()).map(|i| i.to_string()).collect(),
                _ => vec![],
            };
            for key in rule_keys {
                if key == "base" {
                    continue;
                }
                for pair in key.split('+') {
                    let prop = pair.split(':').next().unwrap_or("");
                    if !prop.is_empty() && !props.iter().any(|p| p == prop) {
                        let hint = if props.is_empty() {
                            " This component has no variant props or states.".to_string()
                        } else {
                            format!(" Known props/states: {}", props.join(", "))
                        };
                        push(format!("Unknown prop \"{prop}\" on component \"{component}\".{hint}"));
                    }
                }
            }
        }
    }
    warnings
}

fn plain(v: Option<&Value>) -> Option<&Map<String, Value>> {
    as_obj(v)
}

/// `validatePrivateVars(themeDef)`.
pub fn private_vars(theme: &Value) -> Vec<String> {
    let mut errors: Vec<String> = Vec::new();
    let mut push = |e: String| {
        if !errors.contains(&e) {
            errors.push(e);
        }
    };
    let rules = {
        let r = theme.get("adaptations").and_then(|a| a.get("rules")).filter(|r| !is_undef(Some(r)) && !r.is_null()).or_else(|| theme.get("__adaptations").and_then(|a| a.get("rules")));
        match r {
            Some(Value::Array(list)) => list.iter().filter_map(|x| x.get("value").cloned()).filter(|v| truthy(Some(v))).collect::<Vec<_>>(),
            _ => match theme.get("__adaptationRules") {
                Some(Value::Array(a)) => a.clone(),
                _ => vec![],
            },
        }
    };
    let pick = |a: &str, b: &str| -> Option<Value> {
        let x = theme.get(a).filter(|v| !is_undef(Some(v)) && !v.is_null());
        x.or_else(|| theme.get(b)).cloned()
    };
    let mut surfaces: Vec<(String, Value)> = vec![("theme".into(), theme.clone())];
    if let Some(v) = pick("onDark", "__onDark") {
        surfaces.push(("onDark".into(), v));
    }
    if let Some(v) = pick("onLight", "__onLight") {
        surfaces.push(("onLight".into(), v));
    }
    for (i, v) in rules.into_iter().enumerate() {
        surfaces.push((format!("adaptation rule {}", i + 1), v));
    }
    for (name, value) in surfaces {
        let Some(obj) = plain(Some(&value)) else { continue };
        for field in ["tokens", "localTokens"] {
            let values = if field == "tokens" {
                if obj.contains_key("__built") {
                    None
                } else if obj.contains_key("__inputTokens") {
                    obj.get("__inputTokens")
                } else {
                    obj.get("tokens")
                }
            } else {
                obj.get(field)
            };
            let Some(values) = plain(values) else { continue };
            for k in values.keys() {
                if k.starts_with("--_") {
                    push(format!(
                        "{name} {field} sets private var \"{k}\". Private vars (--_*) are internal; use a public token or standard CSS property instead."
                    ));
                }
            }
        }
        let Some(components) = plain(obj.get("components")) else { continue };
        for (component, rules) in components {
            let Some(rules) = plain(Some(rules)) else { continue };
            for (key, styles) in rules {
                fn visit(value: &Value, path: &mut Vec<String>, f: &mut dyn FnMut(&str, &[String])) {
                    let Some(m) = as_obj(Some(value)) else { return };
                    for (prop, nested) in m {
                        if prop.starts_with("--_") {
                            f(prop, path);
                        }
                        path.push(prop.clone());
                        visit(nested, path, f);
                        path.pop();
                    }
                }
                let mut path = Vec::new();
                visit(styles, &mut path, &mut |prop, path| {
                    let mut parts = vec![name.clone(), key.clone()];
                    parts.extend(path.iter().cloned());
                    push(format!(
                        "Component \"{component}\" ({}) sets private var \"{prop}\". Private vars (--_*) are internal; use standard CSS properties (e.g. borderRadius, padding) instead. The pipeline expands them automatically.",
                        parts.join(" ")
                    ));
                });
            }
        }
    }
    errors
}

const BUILTIN_HEADING_TYPES: [&str; 3] = ["display-1", "display-2", "display-3"];

/// `customHeadingTypes`.
pub fn custom_heading_types(theme: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for (_, components) in component_layers(theme) {
        let Some(Value::Object(heading)) = components.get("heading") else { continue };
        for key in heading.keys() {
            for pair in key.split('+') {
                let Some(colon) = pair.find(':') else { continue };
                if &pair[..colon] != "type" {
                    continue;
                }
                let value = &pair[colon + 1..];
                if !value.is_empty() && !BUILTIN_HEADING_TYPES.contains(&value) && !out.iter().any(|v| v == value) {
                    out.push(value.to_string());
                }
            }
        }
    }
    out
}

fn has_usable_declaration(styles: &Value) -> bool {
    let Some(m) = as_obj(Some(styles)) else { return false };
    for (prop, value) in m {
        if prop.starts_with(':') {
            if has_usable_declaration(value) {
                return true;
            }
            continue;
        }
        let ok = match value {
            Value::Null => false,
            Value::Object(o) if o.contains_key("__js") => {
                // undefined, functions (typeof 'function' is not 'object').
                o.get("__js").and_then(|k| k.as_str()) == Some("function")
            }
            Value::Object(_) | Value::Array(_) => false,
            v => !crate::cli::format::js_string(v).trim_matches(crate::cli::format::js_ws).is_empty(),
        };
        if ok {
            return true;
        }
    }
    false
}

/// `validateCustomHeadingTypes`.
pub fn custom_heading_types_errors(theme: &Value) -> Vec<String> {
    let layers = component_layers(theme);
    let mut errors = Vec::new();
    for t in custom_heading_types(theme) {
        let has = layers.iter().any(|(_, c)| {
            let Some(Value::Object(h)) = c.get("heading") else { return false };
            matches!(h.get(&format!("type:{t}")), Some(v @ Value::Object(_)) if as_obj(Some(v)).is_some() && has_usable_declaration(v))
        });
        if !has {
            errors.push(format!(
                "Custom Heading type \"{t}\" needs a non-empty standalone components.heading[\"type:{t}\"], onDark.components.heading[\"type:{t}\"], or onLight.components.heading[\"type:{t}\"] rule."
            ));
        }
    }
    errors
}

/// `validateHeadingTypeAugmentationSupport`.
pub fn heading_augmentation_support(theme: &Value, cli_root: &str) -> Vec<String> {
    if custom_heading_types(theme).is_empty() {
        return vec![];
    }
    if !coredocs::has_augmentable_interface(cli_root, "Heading", "HeadingTypeMap", false) {
        return vec!["Custom Heading types require an installed @astryxdesign/core that exports HeadingTypeMap from the public Heading subpath. Upgrade Core before building this theme.".into()];
    }
    vec![]
}

/// `headingTypesWithoutEmittedRule`.
pub fn heading_types_without_rule(types: &[String], css: &str) -> Vec<String> {
    let mut missing = Vec::new();
    for t in types {
        let selector = format!(".astryx-heading[data-type=\"{t}\"]");
        let mut emitted = false;
        let mut from = 0;
        while let Some(i) = css[from..].find(&selector) {
            let at = from + i;
            if css.as_bytes().get(at + selector.len()) != Some(&b'[') {
                emitted = true;
                break;
            }
            from = at + 1;
        }
        if !emitted {
            missing.push(t.clone());
        }
    }
    missing
}

/// `componentValuePairs(key)`: `(prop, value, pair)`.
pub fn value_pairs(key: &str) -> Vec<(String, String, String)> {
    if key == "base" {
        return vec![];
    }
    key.split('+')
        .filter_map(|pair| pair.find(':').map(|c| (pair[..c].to_string(), pair[c + 1..].to_string(), pair.to_string())))
        .collect()
}

/// `validateAdaptationEnrollment(resolvedTheme)`.
pub fn adaptation_enrollment_errors(theme: &Value, cli_root: &str) -> Vec<String> {
    let mut entries: Vec<(String, Value)> = Vec::new();
    for v in adaptation_rule_values(theme) {
        if let Some(Value::Object(m)) = v.get("components") {
            for (k, r) in m {
                entries.push((k.clone(), r.clone()));
            }
        }
    }
    if entries.is_empty() {
        return vec![];
    }
    let mut root: Vec<String> = Vec::new();
    if let Some(Value::Object(c)) = theme.get("components") {
        for (component, rules) in c {
            if let Value::Object(r) = rules {
                for key in r.keys() {
                    for (_, _, pair) in value_pairs(key) {
                        root.push(format!("{component}:{pair}"));
                    }
                }
            }
        }
    }
    let mut errors: Vec<String> = Vec::new();
    for (component, rules) in entries {
        let Value::Object(r) = rules else { continue };
        for key in r.keys() {
            for (prop, value, pair) in value_pairs(key) {
                if root.contains(&format!("{component}:{pair}")) {
                    continue;
                }
                if coredocs::classify(cli_root, &component, &prop, &value) != ValueClass::Enrollment {
                    continue;
                }
                let e = format!(
                    "Adaptation rule enrolls the custom value \"{component}.{prop}:{value}\". A value that is valid only because a theme enrolls it generates unconditional type augmentation, so it must be declared on the root theme first; a rule may then restyle it under a condition."
                );
                if !errors.contains(&e) {
                    errors.push(e);
                }
            }
        }
    }
    errors
}
