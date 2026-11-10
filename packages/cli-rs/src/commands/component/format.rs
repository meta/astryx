//! Port of `clients/cli/lib/component-format.mjs`: render component docs as
//! the terminal text views (full, compact, brief, props, brief-all).

use super::jsv::{arr, at, has_key, has_len, or_str, s, str_or_empty, tpl, truthy};
use crate::json::Value;
use crate::text::{js_len, js_slice};

fn target_key(target: &Value) -> String {
    let cn = tpl(target.get("className"));
    cn.strip_prefix("astryx-").map(String::from).unwrap_or(cn)
}

/// `data-${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`.
fn data_attr_for_name(name: &str) -> String {
    let chars: Vec<char> = name.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        out.push(c);
        if (c.is_ascii_lowercase() || c.is_ascii_digit()) && i + 1 < chars.len() && chars[i + 1].is_ascii_uppercase() {
            out.push('-');
            out.push(chars[i + 1]);
            i += 2;
            continue;
        }
        i += 1;
    }
    format!("data-{}", out.to_lowercase())
}

fn str_list(v: Option<&Value>) -> Vec<String> {
    arr(v).iter().map(|x| tpl(Some(x))).collect()
}

fn target_data_attributes(target: &Value) -> Vec<String> {
    let mut out: Vec<String> = str_list(target.get("visualProps")).iter().map(|n| data_attr_for_name(n)).collect();
    out.extend(str_list(target.get("states")).iter().map(|n| data_attr_for_name(n)));
    out
}

/// `mdCell(value)`: `String(value ?? '')` with `|` escaped.
pub fn md_cell(v: Option<&Value>) -> String {
    str_or_empty(v).replace('|', "\\|")
}

fn format_props_table(props: Option<&Value>) -> String {
    let list = match props {
        Some(Value::Array(a)) if !a.is_empty() => a,
        _ => return String::new(),
    };
    let mut lines = vec!["| Prop | Type | Default | Description |".to_string(), "|------|------|---------|-------------|".to_string()];
    for p in list {
        let def = if truthy(p.get("default")) { format!("`{}`", md_cell(p.get("default"))) } else { "-".into() };
        let req = if truthy(p.get("required")) { " **(required)**" } else { "" };
        let stab = if s(p.get("stability")) == Some("experimental") { " **(experimental)**" } else { "" };
        lines.push(format!(
            "| `{}` | `{}` | {def} | {}{req}{stab} |",
            md_cell(p.get("name")),
            md_cell(p.get("type")),
            md_cell(p.get("description"))
        ));
    }
    lines.join("\n")
}

/// `formatAccessibility(accessibility, heading)`.
pub fn format_accessibility(acc: Option<&Value>, heading: &str) -> Vec<String> {
    let items = match acc {
        Some(Value::Array(a)) if !a.is_empty() => a,
        _ => return Vec::new(),
    };
    let mut out = vec![format!("{heading} Accessibility\n")];
    for item in items {
        out.push(format!("- **{}:** {}", tpl(item.get("name")), tpl(item.get("description"))));
    }
    out.push(String::new());
    out
}

fn format_sub_component(comp: &Value, run: &str) -> Vec<String> {
    let mut out = vec![format!("### {}\n", tpl(comp.get("name")))];
    if truthy(comp.get("description")) {
        out.push(format!("{}\n", tpl(comp.get("description"))));
    }
    out.extend(format_accessibility(at(comp, &["usage", "accessibility"]), "####"));
    let table = format_props_table(comp.get("props"));
    if !table.is_empty() {
        out.push(format!("{table}\n"));
    } else {
        out.push(format!("See `{run} component {}` for props and usage.\n", tpl(comp.get("name"))));
    }
    out
}

fn split_union(t: &str) -> Vec<String> {
    t.replace(['\'', '"'], "").split('|').map(|v| v.trim().to_string()).collect()
}

fn target_variants(target: &Value, docs: &Value) -> Vec<String> {
    if !has_len(target.get("visualProps")) {
        return Vec::new();
    }
    let vps = str_list(target.get("visualProps"));
    if vps.iter().any(|v| v == "variant") {
        let props = if truthy(docs.get("props")) {
            docs.get("props")
        } else {
            at(docs, &["components"]).and_then(|c| c.get(0)).and_then(|c| c.get("props"))
        };
        let variant = arr(props).iter().find(|p| s(p.get("name")) == Some("variant"));
        if let Some(vp) = variant {
            let t = tpl(vp.get("type"));
            if t.contains('|') {
                return split_union(&t).into_iter().filter(|v| !v.is_empty()).collect();
            }
        }
    }
    vps
}

fn component_icon_slots(slots: &[Value]) -> String {
    let mut lines = vec![
        "**Component icon slots** - set in `defineTheme({componentIcons})` to a shared icon name, `null`, a partial `{icon, variant, size}` request, or a function of the slot state.\n".to_string(),
        "| Slot | State | Fallback | Role | `null` |".to_string(),
        "|------|-------|----------|------|--------|".to_string(),
    ];
    for slot in slots {
        let state = if has_len(slot.get("state")) {
            arr(slot.get("state"))
                .iter()
                .map(|f| format!("`{}: {}` {}", md_cell(f.get("name")), md_cell(f.get("type")), md_cell(f.get("description"))))
                .collect::<Vec<_>>()
                .join("<br>")
        } else {
            "none".into()
        };
        lines.push(format!(
            "| `{}` | {state} | {} | {} | {} |",
            md_cell(slot.get("slot")),
            md_cell(slot.get("fallback")),
            md_cell(slot.get("description")),
            md_cell(slot.get("whenNull"))
        ));
    }
    lines.join("\n") + "\n"
}

fn theme_variants<'a>(theme: Option<&'a Value>, key: &str) -> Vec<String> {
    let v = theme.and_then(|t| t.get("variants")).and_then(|v| v.get(key));
    if truthy(v) { str_list(v) } else { Vec::new() }
}

fn targets_table(docs: &Value, theme: Option<&Value>) -> String {
    let targets = arr(at(docs, &["theming", "targets"]));
    if targets.is_empty() {
        return String::new();
    }
    let mut lines = vec![
        "| Component class | Preferred data attributes | Props | States |".to_string(),
        "|-----------------|---------------------------|-------|--------|".to_string(),
    ];
    for t in targets {
        let core = target_variants(t, docs);
        let states = str_list(t.get("states"));
        let tv = theme_variants(theme, &target_key(t));
        let mut parts = core;
        parts.extend(tv.iter().map(|v| format!("{v}*")));
        let variants = if parts.is_empty() { "-".into() } else { parts.join(", ") };
        let states_s = if states.is_empty() { "-".into() } else { states.join(", ") };
        let attrs = target_data_attributes(t);
        let attrs_s = if attrs.is_empty() { "-".into() } else { attrs.iter().map(|a| format!("`{a}`")).collect::<Vec<_>>().join(", ") };
        lines.push(format!("| `{}` | {attrs_s} | {variants} | {states_s} |", tpl(t.get("className"))));
    }
    lines.join("\n")
}

fn push_examples(sections: &mut Vec<String>, examples: &[Value], heading: &str) {
    for ex in examples {
        if truthy(ex.get("label")) {
            sections.push(format!("{heading} {}\n", tpl(ex.get("label"))));
        }
        sections.push(format!("```tsx\n{}\n```\n", tpl(ex.get("code"))));
    }
}

fn push_best_practices(sections: &mut Vec<String>, docs: &Value) {
    let bps = at(docs, &["usage", "bestPractices"]);
    if has_len(bps) {
        sections.push("## Best Practices\n".into());
        for bp in arr(bps) {
            let badge = if truthy(bp.get("guidance")) { "**Do:**" } else { "**Don't:**" };
            sections.push(format!("- {badge} {}", tpl(bp.get("description"))));
        }
        sections.push(String::new());
    }
}

/// `formatFull(docs, {themeData, importHint})`.
pub fn format_full(docs: &Value, theme: Option<&Value>, import_hint: Option<&str>, run: &str) -> String {
    let mut sections: Vec<String> = Vec::new();
    sections.push(format!("# {}\n", tpl(docs.get("name"))));
    let desc = or_str(&[at(docs, &["usage", "description"]), docs.get("description")]);
    sections.push(format!("{desc}\n"));
    if let Some(hint) = import_hint.filter(|h| !h.is_empty()) {
        sections.push(format!("**Import:** `import {{{}}} from '{hint}';`\n", tpl(docs.get("name"))));
    }
    let anatomy = at(docs, &["usage", "anatomy"]);
    if has_len(anatomy) {
        sections.push("## Anatomy\n".into());
        sections.push("| Element | Required | Description |".into());
        sections.push("|---------|----------|-------------|".into());
        for el in arr(anatomy) {
            let req = if truthy(el.get("required")) { "Yes" } else { "No" };
            sections.push(format!("| {} | {req} | {} |", md_cell(el.get("name")), md_cell(el.get("description"))));
        }
        sections.push(String::new());
    }
    push_best_practices(&mut sections, docs);
    sections.extend(format_accessibility(at(docs, &["usage", "accessibility"]), "##"));
    if has_key(docs, "props") {
        sections.push("## Props\n".into());
        sections.push(format_props_table(docs.get("props")) + "\n");
    }
    if has_key(docs, "components") {
        sections.push("## Components\n".into());
        for comp in arr(docs.get("components")) {
            sections.extend(format_sub_component(comp, run));
            if has_len(comp.get("examples")) {
                push_examples(&mut sections, arr(comp.get("examples")), "####");
            }
        }
    }
    if has_len(docs.get("examples")) {
        sections.push("## Examples\n".into());
        push_examples(&mut sections, arr(docs.get("examples")), "###");
    }
    if truthy(docs.get("theming")) {
        let theming = docs.get("theming").unwrap();
        sections.push("## Theming\n".into());
        let targets = arr(theming.get("targets"));
        if !targets.is_empty() {
            sections.push(targets_table(docs, theme) + "\n");
            if let Some(t) = theme.filter(|t| truthy(t.get("variants"))) {
                let has = targets.iter().any(|tg| has_len(t.get("variants").and_then(|v| v.get(target_key(tg).as_str()))));
                if has {
                    let name = if truthy(t.get("name")) { tpl(t.get("name")) } else { "active".into() };
                    sections.push(format!("_\\* = custom variant from {name} theme_\n"));
                }
            }
            let mut ex = vec!["Override in defineTheme:\n```ts\ncomponents: {".to_string()];
            let root = &targets[0];
            ex.push(format!("  '{}': {{", target_key(root)));
            ex.push("    base: { /* CSS properties */ },".into());
            if has_len(root.get("visualProps")) {
                ex.push(format!("    '{}:value': {{ /* variant-specific */ }},", tpl(root.get("visualProps").unwrap().get(0))));
            }
            if has_len(root.get("states")) {
                ex.push(format!("    '{}': {{ /* state-specific */ }},", tpl(root.get("states").unwrap().get(0))));
            }
            ex.push("  },".into());
            if targets.len() > 1 {
                let sub = &targets[1];
                ex.push(format!("  '{}': {{", target_key(sub)));
                ex.push("    base: { /* CSS properties */ },".into());
                if has_len(sub.get("states")) {
                    ex.push(format!("    '{}': {{ /* state-specific */ }},", tpl(sub.get("states").unwrap().get(0))));
                }
                ex.push("  },".into());
            }
            ex.push("}\n```\n".into());
            sections.push(ex.join("\n"));
        }
        if has_len(theming.get("componentIcons")) {
            sections.push(component_icon_slots(arr(theming.get("componentIcons"))));
        }
        if truthy(theming.get("componentKey")) {
            sections.push(format!("Component key: `{}`\n", tpl(theming.get("componentKey"))));
        }
        if has_len(theming.get("vars")) {
            let public: Vec<&Value> = arr(theming.get("vars")).iter().filter(|v| !truthy(v.get("private")) && !truthy(v.get("derived"))).collect();
            if !public.is_empty() {
                sections.push("**Themeable CSS variables** - additional properties that can be overridden in `defineTheme` component overrides.\n".into());
                let mut vl = vec!["| CSS Variable | Default | Description |".to_string(), "|-------------|---------|-------------|".to_string()];
                for v in public {
                    vl.push(format!("| `{}` | `{}` | {} |", md_cell(v.get("name")), md_cell(v.get("default")), md_cell(v.get("description"))));
                }
                sections.push(vl.join("\n") + "\n");
            }
            if has_len(theming.get("derived")) {
                let canonical = arr(theming.get("targets"));
                let vars_key = if !canonical.is_empty() {
                    target_key(&canonical[0])
                } else if truthy(theming.get("componentKey")) {
                    tpl(theming.get("componentKey"))
                } else {
                    String::new()
                };
                let derived = arr(theming.get("derived"));
                let a = derived
                    .iter()
                    .filter(|d| has_len(d.get("vars")))
                    .map(|d| format!("      {}: '...',", tpl(d.get("property"))))
                    .collect::<Vec<_>>()
                    .join("\n");
                let b = derived
                    .iter()
                    .filter(|d| s(d.get("expand")) == Some("container"))
                    .map(|d| format!("      {}: '...',  // expands to container layout tokens", tpl(d.get("property"))))
                    .collect::<Vec<_>>()
                    .join("\n");
                let all = [a, b].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join("\n");
                if !all.is_empty() {
                    sections.push(format!(
                        "Some properties are set via standard CSS in component overrides:\n```ts\ncomponents: {{\n  {vars_key}: {{\n    base: {{\n{all}\n    }},\n  }},\n}}\n```\n"
                    ));
                }
            }
        }
    }
    sections.join("\n")
}

fn display_name(name: &str) -> &str {
    name.strip_prefix("XDS").unwrap_or(name)
}

/// `formatCompact(docs, componentName, importHint)`.
pub fn format_compact(docs: &Value, component_name: &str, import_hint: Option<&str>, run: &str) -> String {
    let dn = display_name(component_name);
    let mut sections: Vec<String> = Vec::new();
    sections.push(format!("# {}\n", tpl(docs.get("name"))));
    let desc = or_str(&[at(docs, &["usage", "description"]), docs.get("description")]);
    sections.push(format!("{desc}\n"));
    let anatomy = at(docs, &["usage", "anatomy"]);
    if has_len(anatomy) {
        let parts: Vec<String> = arr(anatomy)
            .iter()
            .map(|el| format!("{}{}", tpl(el.get("name")), if truthy(el.get("required")) { "" } else { " (optional)" }))
            .collect();
        sections.push(format!("Anatomy: {}\n", parts.join(", ")));
    }
    if let Some(hint) = import_hint.filter(|h| !h.is_empty()) {
        sections.push("## Import\n".into());
        sections.push(format!("```tsx\nimport {{ {dn} }} from '{hint}';\n```\n"));
    }
    push_best_practices(&mut sections, docs);
    sections.extend(format_accessibility(at(docs, &["usage", "accessibility"]), "##"));
    if has_key(docs, "props") {
        sections.push("## Props\n".into());
        sections.push(format_props_table(docs.get("props")) + "\n");
    }
    if has_key(docs, "components") {
        for comp in arr(docs.get("components")) {
            sections.extend(format_sub_component(comp, run));
        }
    }
    let examples: Vec<Value> = arr(docs.get("examples")).iter().take(3).cloned().collect();
    if !examples.is_empty() {
        sections.push("## Usage\n".into());
        push_examples(&mut sections, &examples, "###");
    }
    let derived = at(docs, &["theming", "derived"]);
    if has_len(derived) {
        sections.push("## Derived Theme Properties\n".into());
        sections.push("Standard CSS properties that also set internal vars:\n".into());
        let mut pl = vec!["| CSS Property | Sets |".to_string(), "|-------------|------|".to_string()];
        for d in arr(derived) {
            let target = if s(d.get("expand")) == Some("container") {
                "container layout tokens".to_string()
            } else {
                arr(d.get("vars")).iter().map(|v| format!("`{}`", md_cell(Some(v)))).collect::<Vec<_>>().join(", ")
            };
            pl.push(format!("| `{}` | {target} |", md_cell(d.get("property"))));
        }
        sections.push(pl.join("\n") + "\n");
    }
    let icons = at(docs, &["theming", "componentIcons"]);
    if has_len(icons) {
        sections.push("## Component Icon Slots\n".into());
        sections.push(component_icon_slots(arr(icons)));
    }
    sections.join("\n")
}

const SIGNATURE_UNION_MAX_MEMBERS: usize = 8;

/// `formatBrief(docs, componentName, importHint, {themeData})`.
pub fn format_brief(docs: &Value, component_name: &str, import_hint: Option<&str>, theme: Option<&Value>) -> String {
    let dn = display_name(component_name);
    let mut props: Vec<Value> = Vec::new();
    let mut description = or_str(&[at(docs, &["usage", "description"]), docs.get("description")]);
    let mut examples: Vec<Value> = arr(docs.get("examples")).to_vec();
    let mut examples_truthy = truthy(docs.get("examples"));
    if has_key(docs, "props") {
        props = arr(docs.get("props")).to_vec();
    } else if has_key(docs, "components") {
        if let Some(entry) = arr(docs.get("components")).iter().find(|c| s(c.get("name")) == Some(dn)) {
            props = arr(entry.get("props")).to_vec();
            description = str_or_empty(entry.get("description"));
            if truthy(entry.get("examples")) {
                examples = arr(entry.get("examples")).to_vec();
                examples_truthy = true;
            }
        }
    }
    let _ = examples_truthy;
    let mut sig_props: Vec<String> = Vec::new();
    let mut other: Vec<String> = Vec::new();
    for prop in &props {
        let ty = tpl(prop.get("type"));
        let name = tpl(prop.get("name"));
        let values = if ty.contains('|') && !ty.contains("ReactNode") { Some(split_union(&ty)) } else { None };
        match values {
            Some(v) if v.len() <= SIGNATURE_UNION_MAX_MEMBERS => sig_props.push(format!("{name}: {}", v.join("|"))),
            _ => {
                if truthy(prop.get("required")) {
                    other.insert(0, format!("{name}: {}", ty.split('|').next().unwrap_or("").trim()));
                } else {
                    other.push(name);
                }
            }
        }
    }
    let mut output: Vec<String> = Vec::new();
    let sig = if sig_props.is_empty() { dn.to_string() } else { format!("{dn}({})", sig_props.join(", ")) };
    output.push(match import_hint.filter(|h| !h.is_empty()) {
        Some(h) => format!("{sig}  <- from '{h}'"),
        None => sig,
    });
    if !description.is_empty() {
        let short = if js_len(&description) > 80 { js_slice(&description, 0, 77) + "..." } else { description.clone() };
        output.push(format!("  {short}"));
    }
    let theming = docs.get("theming");
    let vars = theming.and_then(|t| t.get("vars"));
    if has_len(vars) {
        let names = arr(vars)
            .iter()
            .filter(|v| !truthy(v.get("derived")) && !truthy(v.get("private")))
            .map(|v| format!("{} ({})", tpl(v.get("name")), tpl(v.get("default"))))
            .collect::<Vec<_>>()
            .join(", ");
        if !names.is_empty() {
            output.push(format!("  Vars: {names}"));
        }
    }
    let derived = theming.and_then(|t| t.get("derived"));
    if has_len(derived) {
        let names = arr(derived)
            .iter()
            .map(|d| {
                if s(d.get("expand")) == Some("container") {
                    format!("{} -> container tokens", tpl(d.get("property")))
                } else {
                    format!("{} -> {}", tpl(d.get("property")), str_list(d.get("vars")).join(", "))
                }
            })
            .collect::<Vec<_>>()
            .join("; ");
        output.push(format!("  Derived: {names}"));
    }
    let icons = theming.and_then(|t| t.get("componentIcons"));
    if has_len(icons) {
        let slots = arr(icons)
            .iter()
            .map(|slot| {
                if has_len(slot.get("state")) {
                    format!(
                        "{} {{{}}}",
                        tpl(slot.get("slot")),
                        arr(slot.get("state")).iter().map(|f| format!("{}: {}", tpl(f.get("name")), tpl(f.get("type")))).collect::<Vec<_>>().join(", ")
                    )
                } else {
                    tpl(slot.get("slot"))
                }
            })
            .collect::<Vec<_>>()
            .join("; ");
        output.push(format!("  Icon slots: {slots}"));
    }
    let targets = theming.and_then(|t| t.get("targets"));
    if has_len(targets) {
        let parts = arr(targets)
            .iter()
            .map(|t| {
                let mut p = vec![tpl(t.get("className"))];
                let attrs = target_data_attributes(t);
                if !attrs.is_empty() {
                    p.push(format!("preferred attrs: {}", attrs.join(", ")));
                }
                if has_len(t.get("visualProps")) {
                    p.push(format!("variants: {}", str_list(t.get("visualProps")).join(", ")));
                }
                if has_len(t.get("states")) {
                    p.push(format!("states: {}", str_list(t.get("states")).join(", ")));
                }
                let tv = theme.and_then(|th| th.get("variants")).and_then(|v| v.get(target_key(t).as_str()));
                if has_len(tv) {
                    p.push(format!("theme: {}", str_list(tv).iter().map(|v| format!("{v}*")).collect::<Vec<_>>().join(", ")));
                }
                p.join(" ")
            })
            .collect::<Vec<_>>()
            .join(" | ");
        output.push(format!("  Targets: {parts}"));
    }
    if !other.is_empty() {
        output.push(format!("  {}", other.join(", ")));
    }
    if !examples.is_empty() {
        let code = tpl(examples[0].get("code"));
        let line = code
            .split('\n')
            .find(|l| l.trim().starts_with("<XDS"))
            .unwrap_or_else(|| code.split('\n').next().unwrap_or(""));
        output.push(format!("  {}", line.trim()));
    }
    output.join("\n") + "\n"
}

/// `formatProps(docs, componentName)`.
pub fn format_props(docs: &Value, component_name: &str) -> String {
    if has_key(docs, "props") {
        return format!("## Props\n\n{}\n", format_props_table(docs.get("props")));
    }
    if has_key(docs, "components") {
        let mut sections = Vec::new();
        for comp in arr(docs.get("components")) {
            sections.push(format!("### {} Props\n", tpl(comp.get("name"))));
            sections.push(format_props_table(comp.get("props")) + "\n");
        }
        return sections.join("\n");
    }
    format!("No props documentation found for {component_name}.\n")
}
