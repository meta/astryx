//! Port of `clients/cli/lib/hook-format.mjs`.

use crate::commands::component::format::{format_accessibility, md_cell};
use crate::commands::component::jsv::{arr, at, has_len, s, tpl, truthy};
use crate::json::Value;
use crate::text::{js_len, js_slice};

fn top_params(docs: &Value) -> Vec<&Value> {
    arr(docs.get("params")).iter().filter(|p| !tpl(p.get("name")).contains('.')).collect()
}

fn build_signature(docs: &Value) -> String {
    let params = top_params(docs)
        .iter()
        .map(|p| format!("{}{}: {}", tpl(p.get("name")), if truthy(p.get("required")) { "" } else { "?" }, tpl(p.get("type"))))
        .collect::<Vec<_>>()
        .join(", ");
    let returns = arr(docs.get("returns"));
    let ret = if returns.is_empty() {
        "void".to_string()
    } else if returns.len() == 1 && s(returns[0].get("name")) == Some("value") {
        tpl(returns[0].get("type"))
    } else {
        format!("{{ {} }}", returns.iter().map(|r| tpl(r.get("name"))).collect::<Vec<_>>().join(", "))
    };
    format!("{}({params}): {ret}", tpl(docs.get("name")))
}

fn params_table(params: Option<&Value>) -> String {
    let list = arr(params);
    if list.is_empty() {
        return String::new();
    }
    let mut lines = vec!["| Param | Type | Default | Description |".to_string(), "|-------|------|---------|-------------|".to_string()];
    for p in list {
        let def = if truthy(p.get("default")) { format!("`{}`", md_cell(p.get("default"))) } else { "-".into() };
        let req = if truthy(p.get("required")) { " **(required)**" } else { "" };
        lines.push(format!("| `{}` | `{}` | {def} | {}{req} |", md_cell(p.get("name")), md_cell(p.get("type")), md_cell(p.get("description"))));
    }
    lines.join("\n")
}

fn returns_table(returns: Option<&Value>) -> String {
    let list = arr(returns);
    if list.is_empty() {
        return String::new();
    }
    let mut lines = vec!["| Field | Type | Description |".to_string(), "|-------|------|-------------|".to_string()];
    for r in list {
        lines.push(format!("| `{}` | `{}` | {} |", md_cell(r.get("name")), md_cell(r.get("type")), md_cell(r.get("description"))));
    }
    lines.join("\n")
}

fn desc_of(docs: &Value) -> String {
    let d = at(docs, &["usage", "description"]);
    if truthy(d) { tpl(d) } else { String::new() }
}

fn push_common(sections: &mut Vec<String>, docs: &Value) {
    let bps = at(docs, &["usage", "bestPractices"]);
    if has_len(bps) {
        sections.push("## Best Practices\n".into());
        for bp in arr(bps) {
            let badge = if truthy(bp.get("guidance")) { "**Do:**" } else { "**Don't:**" };
            sections.push(format!("- {badge} {}", tpl(bp.get("description"))));
        }
        sections.push(String::new());
    }
    sections.extend(format_accessibility(at(docs, &["usage", "accessibility"]), "##"));
    if has_len(docs.get("params")) {
        sections.push("## Parameters\n".into());
        sections.push(params_table(docs.get("params")) + "\n");
    }
    if has_len(docs.get("returns")) {
        sections.push("## Returns\n".into());
        sections.push(returns_table(docs.get("returns")) + "\n");
    }
}

/// `formatHookFull(docs)`.
pub fn format_hook_full(docs: &Value) -> String {
    let mut sections = vec![format!("# {}\n", tpl(docs.get("name")))];
    let desc = desc_of(docs);
    if !desc.is_empty() {
        sections.push(format!("{desc}\n"));
    }
    push_common(&mut sections, docs);
    sections.join("\n")
}

/// `formatHookCompact(docs, importPath)`.
pub fn format_hook_compact(docs: &Value, import_path: Option<&str>) -> String {
    let mut sections = vec![format!("# {}\n", tpl(docs.get("name")))];
    let desc = desc_of(docs);
    if !desc.is_empty() {
        sections.push(format!("{desc}\n"));
    }
    let imp = match import_path.filter(|i| !i.is_empty()) {
        Some(i) => Some(i.to_string()),
        None => docs.get("importPath").filter(|v| truthy(Some(v))).map(|v| tpl(Some(v))),
    };
    if let Some(imp) = imp {
        sections.push("## Import\n".into());
        sections.push(format!("```tsx\nimport {{ {} }} from '{imp}';\n```\n", tpl(docs.get("name"))));
    }
    push_common(&mut sections, docs);
    let mut related = Vec::new();
    if has_len(docs.get("relatedComponents")) {
        related.push(format!("Components: {}", join_values(docs.get("relatedComponents"))));
    }
    if has_len(docs.get("relatedHooks")) {
        related.push(format!("Hooks: {}", join_values(docs.get("relatedHooks"))));
    }
    if !related.is_empty() {
        sections.push("## Related\n".into());
        sections.extend(related);
        sections.push(String::new());
    }
    sections.join("\n")
}

/// `arr.join(', ')`.
pub fn join_values(v: Option<&Value>) -> String {
    arr(v).iter().map(|x| if x.is_null() { String::new() } else { tpl(Some(x)) }).collect::<Vec<_>>().join(", ")
}

/// `formatHookBrief(docs)`.
pub fn format_hook_brief(docs: &Value) -> String {
    let mut output = Vec::new();
    let sig = build_signature(docs);
    let imp = docs.get("importPath").filter(|v| truthy(Some(v)));
    output.push(match imp {
        Some(i) => format!("{sig}  <- from '{}'", tpl(Some(i))),
        None => sig,
    });
    let desc = desc_of(docs);
    if !desc.is_empty() {
        let short = if js_len(&desc) > 80 { js_slice(&desc, 0, 77) + "..." } else { desc };
        output.push(format!("  {short}"));
    }
    if has_len(docs.get("relatedComponents")) {
        output.push(format!("  Related: {}", join_values(docs.get("relatedComponents"))));
    }
    let names: Vec<String> = top_params(docs)
        .iter()
        .map(|p| {
            if truthy(p.get("required")) {
                format!("{}: {}", tpl(p.get("name")), tpl(p.get("type")).split('|').next().unwrap_or("").trim())
            } else {
                tpl(p.get("name"))
            }
        })
        .collect();
    if !names.is_empty() {
        output.push(format!("  {}", names.join(", ")));
    }
    output.join("\n") + "\n"
}

/// `formatHookParams({params, name})`.
pub fn format_hook_params(params: &Value, name: &str) -> String {
    if has_len(Some(params)) {
        return format!("## Parameters\n\n{}\n", params_table(Some(params)));
    }
    format!("No parameters documentation found for {name}.\n")
}
