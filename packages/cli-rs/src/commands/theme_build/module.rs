//! The generated JS module, its declarations and the `.variants.d.ts`
//! augmentations (build.mjs `generateBuiltModule`, `generateBuiltTypes`,
//! `generateVariantDeclarationsAsync`).

use super::build_impl::{as_obj, err, is_fn, is_undef, stringify2, to_identifier, truthy, ApiError};
use super::coredocs::{self, ValueClass};
use super::validate::{component_layers, value_pairs};
use crate::json::{Map, Value};
use indexmap::IndexMap;

fn indent_after_first(s: &str) -> String {
    s.split('\n').enumerate().map(|(i, l)| if i == 0 { l.to_string() } else { format!("  {l}") }).collect::<Vec<_>>().join("\n")
}

fn nullish(v: Option<&Value>) -> bool {
    v.is_none() || is_undef(v) || matches!(v, Some(Value::Null))
}

/// `serializeField(field, value, includeEmpty)`.
fn serialize_field(field: &str, value: Option<&Value>, include_empty: bool) -> String {
    if nullish(value) {
        return String::new();
    }
    let v = value.unwrap();
    let empty = match v {
        Value::Object(m) if !m.contains_key("__js") => m.is_empty(),
        Value::Array(a) => a.is_empty(),
        Value::String(s) => s.is_empty(),
        _ => true,
    };
    if !include_empty && empty {
        return String::new();
    }
    format!("  {field}: {},\n", indent_after_first(&stringify2(v)))
}

fn component_icons(theme: &Value) -> Option<&Value> {
    let a = theme.get("__componentIcons");
    if !nullish(a) {
        return a;
    }
    theme.get("componentIcons")
}

fn has_function_entry(v: Option<&Value>) -> bool {
    as_obj(v).map(|m| m.values().any(is_fn)).unwrap_or(false)
}

/// The built module, without icon registries.
pub fn built_module(theme: &Value, cli_invocation: &str) -> Result<String, ApiError> {
    let name = match theme.get("name") {
        Some(Value::String(s)) => s.clone(),
        Some(v) => crate::cli::format::js_string(v),
        None => String::new(),
    };
    let binding = format!("{}Theme", to_identifier(&name));
    let slot_values = component_icons(theme);
    if has_function_entry(slot_values) {
        return Err(err(
            format!("Theme \"{name}\" has componentIcons slot functions that the build cannot carry. Import the slot functions from their own module into the theme file."),
            "ERR_THEME_INVALID",
        ));
    }
    let mut tokens = Map::new();
    if let Some(Value::Object(t)) = theme.get("tokens") {
        for (k, v) in t {
            let r = match v {
                Value::Array(a) => {
                    let s = |x: Option<&Value>| match x {
                        None => "undefined".to_string(),
                        Some(v) if is_undef(Some(v)) => "undefined".to_string(),
                        Some(v) => crate::cli::format::js_string(v),
                    };
                    Value::String(format!("light-dark({}, {})", s(a.first()), s(a.get(1))))
                }
                other => other.clone(),
            };
            tokens.insert(k.clone(), r);
        }
    }
    let tokens_str = indent_after_first(&stringify2(&Value::Object(tokens)));
    let mut fields = String::new();
    if !is_undef(theme.get("__localTokenLineage")) {
        let local = theme.get("localTokens").filter(|v| !nullish(Some(v))).cloned().unwrap_or(Value::Object(Map::new()));
        let owners = theme.get("__localTokenOwners").filter(|v| !nullish(Some(v))).cloned().unwrap_or(Value::Object(Map::new()));
        fields.push_str(&format!("  localTokens: {},\n", indent_after_first(&stringify2(&local))));
        fields.push_str(&format!("  __localTokenOwners: {},\n", indent_after_first(&stringify2(&owners))));
        let lineage = crate::js::to_json_data(theme.get("__localTokenLineage").unwrap())
            .map(|v| crate::json::stringify(&v, 0))
            .unwrap_or_else(|| "undefined".into());
        fields.push_str(&format!("  __localTokenLineage: {lineage},\n"));
    }
    fields.push_str(&serialize_field("components", theme.get("components"), false));
    fields.push_str(&serialize_field("__onDark", theme.get("__onDark"), false));
    fields.push_str(&serialize_field("__onLight", theme.get("__onLight"), false));
    fields.push_str(&serialize_field("__adaptations", theme.get("__adaptations"), false));
    let axes = if nullish(theme.get("__axes")) { Value::Object(Map::new()) } else { theme["__axes"].clone() };
    fields.push_str(&serialize_field("__axes", Some(&axes), true));
    fields.push_str(&serialize_field("iconVariants", theme.get("iconVariants"), true));
    let entry_variants = theme.get("__iconEntryVariants").filter(|v| truthy(Some(v))).map(|v| match as_obj(Some(v)) {
        Some(m) => Value::Object(m.iter().map(|(k, l)| (k.clone(), if nullish(Some(l)) { Value::Array(vec![]) } else { l.clone() })).collect()),
        None => v.clone(),
    });
    fields.push_str(&serialize_field("__iconEntryVariants", entry_variants.as_ref(), false));
    fields.push_str(&serialize_field("componentIcons", slot_values, true));
    Ok(format!(
        "/**\n * {name} theme \u{2014} built by `{cli_invocation} theme build`\n * Import the CSS file alongside this module:\n *\n *   import {{ {binding} }} from './{name}';\n *   import './{name}.css';\n */\nexport const {binding} = {{\n  name: '{name}',\n  __built: true,\n  tokens: {tokens_str},\n{fields}\n}};\n"
    ))
}

/// `tsStringLiteral`.
pub fn ts_string_literal(v: &str) -> String {
    let mut q = String::new();
    crate::json::quote(&mut q, v);
    let inner = &q[1..q.len() - 1];
    format!("'{}'", inner.replace("\\\"", "\"").replace('\'', "\\'"))
}

fn icon_variant_names(theme: &Value) -> Option<Vec<String>> {
    let Some(Value::Array(a)) = theme.get("iconVariants") else { return None };
    let mut out: Vec<String> = Vec::new();
    for v in a {
        let s = crate::cli::format::js_string(v);
        if !out.contains(&s) {
            out.push(s);
        }
    }
    Some(out)
}

/// `generateBuiltTypes` without an icon registry.
pub fn built_types(theme: &Value, variants_file: Option<&str>) -> String {
    let name = theme.get("name").and_then(|v| v.as_str()).unwrap_or_default();
    let binding = format!("{}Theme", to_identifier(name));
    let variants = variants_file.map(|f| format!("/// <reference path=\"./{f}\" />\n")).unwrap_or_default();
    let ty = match icon_variant_names(theme) {
        None => "DefinedTheme".to_string(),
        Some(names) => {
            let v = if names.is_empty() { "never".to_string() } else { names.iter().map(|n| ts_string_literal(n)).collect::<Vec<_>>().join(" | ") };
            format!("DefinedTheme & {{ __iconVariant?(variant: {v}): void }}")
        }
    };
    format!("{variants}import type {{ DefinedTheme }} from '@astryxdesign/core/theme';\nexport declare const {binding}: {ty};\n")
}

/// `generateVariantDeclarationsAsync`: the `.variants.d.ts` body, or `None`.
pub fn variant_declarations(theme: &Value, cli_root: &str) -> Option<String> {
    let layers = component_layers(theme);
    let icon_names = match icon_variant_names(theme) {
        Some(n) if coredocs::has_augmentable_interface(cli_root, "Icon", "IconVariantMap", false) => n,
        _ => vec![],
    };
    if layers.is_empty() && icon_names.is_empty() {
        return None;
    }
    let mut custom: IndexMap<String, IndexMap<String, Vec<String>>> = IndexMap::new();
    for (_, components) in &layers {
        for (component, rules) in components {
            let keys: Vec<String> = match rules {
                Value::Object(m) => m.keys().cloned().collect(),
                _ => vec![],
            };
            for key in keys {
                for (prop, value, _) in value_pairs(&key) {
                    if coredocs::classify(cli_root, component, &prop, &value) != ValueClass::Enrollment {
                        continue;
                    }
                    let set = custom.entry(component.clone()).or_default().entry(prop).or_default();
                    if !set.contains(&value) {
                        set.push(value);
                    }
                }
            }
        }
    }
    let has_custom = custom.values().any(|p| p.values().any(|v| !v.is_empty()));
    if !has_custom && icon_names.is_empty() {
        return None;
    }
    let mut sections: Vec<String> = vec!["// Generated by astryx theme build".into(), "export {};".into(), String::new()];
    for (component, props) in &custom {
        for (prop, values) in props {
            if values.is_empty() {
                continue;
            }
            let Some((module, iface)) = coredocs::augmentation_target(cli_root, component, prop) else { continue };
            sections.push(format!("declare module '@astryxdesign/core/{module}' {{"));
            sections.push(format!("  interface {iface} {{"));
            for v in values {
                sections.push(format!("    '{v}': true;"));
            }
            sections.push("  }".into());
            sections.push("}".into());
            sections.push(String::new());
        }
    }
    if !icon_names.is_empty() {
        sections.push("declare module '@astryxdesign/core/Icon' {".into());
        sections.push("  interface IconVariantMap {".into());
        for n in &icon_names {
            sections.push(format!("    {}: true;", ts_string_literal(n)));
        }
        sections.push("  }".into());
        sections.push("}".into());
        sections.push(String::new());
    }
    if !sections.iter().any(|l| l.starts_with("declare module")) {
        return None;
    }
    Some(sections.join("\n"))
}
