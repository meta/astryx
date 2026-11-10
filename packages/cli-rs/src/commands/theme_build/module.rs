//! The generated JS module, its declarations and the `.variants.d.ts`
//! augmentations (build.mjs `generateBuiltModule`, `generateBuiltTypes`,
//! `generateVariantDeclarationsAsync`).

use super::build_impl::{as_obj, err, is_fn, is_undef, stringify2, to_identifier, truthy, ApiError};
use super::coredocs::{self, ValueClass};
use super::icon_imports::IconImports;
use super::validate::{component_layers, value_pairs};
use crate::json::{self, Map, Value};
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

fn import_statement(path: &str, imported: &str, local: &str, specifier: Option<&str>) -> String {
    let q = |v: &str| json::stringify(&Value::String(v.to_string()), 0);
    let source = match specifier {
        Some(sp) => q(sp),
        None if path.contains(['\'', '\\', '\r', '\n']) => q(path),
        None => format!("'{path}'"),
    };
    let ident = {
        let mut c = imported.chars();
        matches!(c.next(), Some(f) if f == '$' || f == '_' || f.is_alphabetic())
            && c.all(|x| x == '$' || x == '_' || x == '\u{200c}' || x == '\u{200d}' || x.is_alphanumeric())
    };
    let imp = if ident { imported.to_string() } else { q(imported) };
    let binding = if imported == "default" {
        local.to_string()
    } else if imported == "*" {
        format!("* as {local}")
    } else {
        format!("{{ {imp}{} }}", if imported == local { String::new() } else { format!(" as {local}") })
    };
    format!("import {binding} from {source};\n")
}

fn icon_nodes_expression(entries: &str, entries_name: &str, nodes_name: &str) -> String {
    format!(
        "(() => {{\n  const {entries_name} = {entries};\n  const {nodes_name} = {{}};\n  for (const name in {entries_name}) {{\n    const entry = {entries_name}[name];\n    {nodes_name}[name] = typeof entry === 'function' ? entry({{size: 'md'}}) : entry;\n  }}\n  return {nodes_name};\n}})()"
    )
}

fn merge_function(name: &str) -> String {
    format!("function {name}(base, own) {{\n  const merged = {{...base}};\n  for (const slot in own) {{\n    if (own[slot] !== undefined) merged[slot] = own[slot];\n  }}\n  return merged;\n}}\n")
}

fn view_expression(values: &str, view: &str) -> String {
    format!(
        "(() => {{\n  const {view} = {{}};\n  for (const slot in {values}) {{\n    const value = {values}[slot];\n    if (value !== undefined && typeof value !== 'function') {view}[slot] = value;\n  }}\n  return {view};\n}})()"
    )
}

/// A theme's icon entries: `__icons` when it holds functions, else `icons`.
pub fn icon_entries(theme: Option<&Value>) -> Option<&Value> {
    let t = theme?;
    let a = t.get("__icons");
    if !nullish(a) {
        return a;
    }
    t.get("icons")
}

pub fn has_function_entries(v: Option<&Value>) -> bool {
    has_function_entry(v)
}

pub fn slot_values(theme: Option<&Value>) -> Option<&Value> {
    component_icons(theme?)
}

/// `generateBuiltModule`'s `moduleOptions` (family members set them).
#[derive(Default)]
pub struct ModuleOpts {
    pub theme_binding: Option<String>,
    pub icons_expression: Option<String>,
    pub indicators_expression: Option<String>,
    pub artifact_base: Option<String>,
    pub hide_icons_export: bool,
}

/// `generateBuiltModule` for a standalone build.
pub fn built_module(
    theme: &Value,
    cli_invocation: &str,
    icon_info: Option<&IconImports>,
    icons_specifier: Option<&str>,
    component_icon_info: Option<&IconImports>,
) -> Result<String, ApiError> {
    built_module_with(theme, cli_invocation, icon_info, icons_specifier, component_icon_info, &ModuleOpts::default())
}

pub fn built_module_with(
    theme: &Value,
    cli_invocation: &str,
    icon_info: Option<&IconImports>,
    icons_specifier: Option<&str>,
    component_icon_info: Option<&IconImports>,
    mo: &ModuleOpts,
) -> Result<String, ApiError> {
    let name = match theme.get("name") {
        Some(Value::String(s)) => s.clone(),
        Some(v) => crate::cli::format::js_string(v),
        None => String::new(),
    };
    let binding = mo.theme_binding.clone().unwrap_or_else(|| format!("{}Theme", to_identifier(&name)));
    let artifact = mo.artifact_base.clone().unwrap_or_else(|| name.clone());
    let mut icon_import = String::new();
    if let Some(info) = icon_info {
        for (path, imported, local) in &info.imports {
            let override_ = icons_specifier.is_some()
                && Some(path) == info.icons_specifier_import_path.as_ref()
                && Some(local) == info.icons_specifier_local_name.as_ref();
            icon_import.push_str(&import_statement(path, imported, local, if override_ { icons_specifier } else { None }));
        }
    }
    let icon_decl = match icon_info {
        Some(i) if i.expression != i.export_name => format!("const {} = {};\n", i.export_name, i.expression),
        _ => String::new(),
    };
    let icons_expr = mo.icons_expression.clone().or_else(|| icon_info.map(|i| i.export_name.clone()));
    let icon_nodes = match &icons_expr {
        Some(_) if has_function_entry(icon_entries(Some(theme))) => Some(format!("{binding}IconNodes")),
        _ => None,
    };
    let icon_nodes_decl = match (&icon_nodes, &icons_expr) {
        (Some(n), Some(e)) => format!("const {n} = {};\n", icon_nodes_expression(e, &format!("{binding}IconEntries"), n)),
        _ => String::new(),
    };
    let icons_field = match (&icon_nodes, &icons_expr) {
        (Some(n), Some(e)) => format!("  icons: {n},\n  __icons: {e},"),
        (None, Some(e)) => format!("  icons: {e},"),
        _ => String::new(),
    };
    let indicators_field = mo.indicators_expression.as_ref().map(|e| format!("\n  indicators: {e},")).unwrap_or_default();
    let re_export = match icon_info.filter(|_| !mo.hide_icons_export) {
        Some(i) => match &icon_nodes {
            Some(n) => format!("\nexport {{ {n} as {} }};\n", i.export_name),
            None => format!("\nexport {{ {} }};\n", i.export_name),
        },
        None => String::new(),
    };
    let slot_values = component_icons(theme);
    let carries = has_function_entry(slot_values);
    if carries && component_icon_info.is_none() {
        return Err(err(
            format!("Theme \"{name}\" has componentIcons slot functions that the build cannot carry. Import the slot functions from their own module into the theme file."),
            "ERR_THEME_INVALID",
        ));
    }
    let values_name = format!("{binding}ComponentIconValues");
    let mut prelude = String::new();
    if let (true, Some(ci)) = (carries, component_icon_info) {
        for (path, imported, local) in &ci.imports {
            prelude.push_str(&import_statement(path, imported, local, None));
        }
        if let Some(m) = &ci.merge_name {
            prelude.push_str(&merge_function(m));
        }
        prelude.push_str(&format!("const {values_name} = {};\n", ci.expression));
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
    if carries {
        fields.push_str(&format!(
            "  componentIcons: {},\n  __componentIcons: {values_name},\n",
            indent_after_first(&view_expression(&values_name, &format!("{binding}ComponentIconView")))
        ));
    } else {
        fields.push_str(&serialize_field("componentIcons", slot_values, true));
    }
    Ok(format!(
        "{icon_import}{prelude}{icon_decl}{icon_nodes_decl}/**\n * {name} theme \u{2014} built by `{cli_invocation} theme build`\n * Import the CSS file alongside this module:\n *\n *   import {{ {binding} }} from './{artifact}';\n *   import './{artifact}.css';\n */\nexport const {binding} = {{\n  name: '{name}',\n  __built: true,\n  tokens: {tokens_str},\n{fields}{icons_field}{indicators_field}\n}};\n{re_export}"
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
pub fn built_types(theme: &Value, icon_info: Option<&IconImports>, variants_file: Option<&str>) -> String {
    built_types_with(theme, icon_info, variants_file, None, true, true)
}

pub fn built_types_with(theme: &Value, icon_info: Option<&IconImports>, variants_file: Option<&str>, theme_binding: Option<&str>, include_icon_export: bool, include_theme_import: bool) -> String {
    let name = theme.get("name").and_then(|v| v.as_str()).unwrap_or_default();
    let binding = theme_binding.map(String::from).unwrap_or_else(|| format!("{}Theme", to_identifier(name)));
    let icon_info = icon_info.filter(|_| include_icon_export);
    let variants = variants_file.map(|f| format!("/// <reference path=\"./{f}\" />\n")).unwrap_or_default();
    let ty = match icon_variant_names(theme) {
        None => "DefinedTheme".to_string(),
        Some(names) => {
            let v = if names.is_empty() { "never".to_string() } else { names.iter().map(|n| ts_string_literal(n)).collect::<Vec<_>>().join(" | ") };
            format!("DefinedTheme & {{ __iconVariant?(variant: {v}): void }}")
        }
    };
    let icon_type = icon_info
        .map(|i| format!("import type {{ IconRegistry }} from '@astryxdesign/core/Icon';\nexport declare const {}: IconRegistry;\n", i.export_name))
        .unwrap_or_default();
    let theme_import = if include_theme_import { "import type { DefinedTheme } from '@astryxdesign/core/theme';\n" } else { "" };
    format!("{variants}{theme_import}{icon_type}export declare const {binding}: {ty};\n")
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
