//! `template --skeleton`: structural tags with spatial annotations.
//! Port of api/template/skeleton/skeleton.mjs.

use regress::Regex;

const STRUCTURAL: &[&str] = &[
    "AppShell", "Layout", "LayoutHeader", "LayoutContent", "LayoutPanel", "LayoutFooter", "Card", "Section", "Grid",
    "GridSpan", "List", "Table", "TabList", "Toolbar", "SideNav", "TopNav", "Dialog", "FormLayout", "Center",
];

const SPATIAL_PROPS: &[&str] = &[
    "padding", "contentPadding", "gap", "rowGap", "columnGap", "columns", "hasDivider", "defaultHasDividers", "variant",
    "density", "role", "height", "width", "maxWidth",
];

fn re(p: &str) -> Regex {
    Regex::new(p).expect("regex")
}

fn re_s(p: &str) -> Regex {
    Regex::with_flags(p, "s").expect("regex")
}

/// The first match's group texts (group 0 included).
fn exec(r: &Regex, s: &str) -> Option<Vec<Option<String>>> {
    let m = r.find(s)?;
    Some(m.groups().map(|g| g.map(|rg| s[rg].to_string())).collect())
}

fn extract_spatial_attrs(tag: &str) -> Vec<String> {
    let v: Vec<char> = tag.chars().collect();
    let mut attrs = Vec::new();
    for name in SPATIAL_PROPS {
        let eq = re(&format!(r"\b{name}\s*=\s*"));
        if let Some(m) = eq.find(tag) {
            // Byte offsets -> char offsets.
            let start = tag[..m.start()].chars().count();
            let mut i = tag[..m.end()].chars().count();
            let first = v.get(i).copied();
            if first == Some('"') || first == Some('\'') {
                let q = first.unwrap();
                i += 1;
                while i < v.len() && v[i] != q {
                    if v[i] == '\\' {
                        i += 1;
                    }
                    i += 1;
                }
                if i < v.len() {
                    i += 1;
                }
            } else if first == Some('{') {
                let mut depth = 0i32;
                while i < v.len() {
                    if v[i] == '{' {
                        depth += 1;
                    } else if v[i] == '}' {
                        depth -= 1;
                        if depth == 0 {
                            i += 1;
                            break;
                        }
                    }
                    i += 1;
                }
            } else {
                while i < v.len() && !(super::source::js_space(v[i]) || v[i] == '/' || v[i] == '>') {
                    i += 1;
                }
            }
            let i = i.min(v.len());
            let s: String = v[start..i].iter().collect();
            attrs.push(s.trim_matches(super::source::js_space).to_string());
            continue;
        }
        if re(&format!(r"\b{name}(?=[\s/>])")).find(tag).is_some() {
            attrs.push(name.to_string());
        }
    }
    attrs
}

pub fn extract_skeleton(source: &str) -> String {
    let lines: Vec<&str> = source.split('\n').collect();
    let mut out: Vec<String> = Vec::new();
    let mut depth = 0usize;
    let mut capturing = false;
    let mut in_default = false;
    const MAX_LINES: usize = 35;
    let mut stack: Vec<String> = Vec::new();
    let export_default = re(r"^export\s+default\s+function");
    let ret = re(r"^return\s*\(");
    let open = re(r"^<((XDS)?([A-Z]\w+))");
    let close = re(r"^<\/(XDS)?([A-Z]\w+)>");
    let slot = re(r"^(header|content|footer|start|end|sideNav|topNav)\s*=\s*\{");
    let pp = re(r#"padding[^:]*:\s*['"]?([^'"},)]+)"#);
    let mw = re(r"maxWidth:\s*(\d+)");
    let gp = re(r"gap:\s*(\d+)");
    let mg = re(r#"margin:\s*['"]([^'"]+)['"]"#);
    let mi = re(r#"marginInline:\s*['"]([^'"]+)['"]"#);
    let pad = |d: usize| "  ".repeat(d);

    for i in 0..lines.len() {
        let t = lines[i].trim_matches(super::source::js_space);
        if export_default.find(t).is_some() {
            in_default = true;
            continue;
        }
        if in_default && ret.find(t).is_some() {
            capturing = true;
            continue;
        }
        if !capturing {
            continue;
        }
        if out.len() >= MAX_LINES {
            if !out.last().map_or(false, |l| l.contains("...")) {
                out.push(format!("{}...", pad(depth)));
            }
            continue;
        }
        if let Some(g) = exec(&open, t) {
            if !t.starts_with("</") {
                let tag_name = g[1].clone().unwrap_or_default();
                let comp = g[3].clone().unwrap_or_default();
                let mut tag_text = String::new();
                for line in lines.iter().take((i + 12).min(lines.len())).skip(i) {
                    tag_text.push(' ');
                    tag_text.push_str(line);
                    if line.contains('>') {
                        break;
                    }
                }
                let props = extract_spatial_attrs(&tag_text);
                let has = !props.is_empty();
                let prop_str = if has { format!(" {}", props.join(" ")) } else { String::new() };
                let is_stack = comp == "VStack" || comp == "HStack";
                let self_closing = re_s(&format!("<{tag_name}[^>]*/>")).find(&tag_text).is_some();
                if is_stack && !has {
                    continue;
                }
                if self_closing {
                    out.push(format!("{}<{comp}{prop_str} />", pad(depth)));
                } else if STRUCTURAL.contains(&comp.as_str()) || (is_stack && has) {
                    out.push(format!("{}<{comp}{prop_str}>", pad(depth)));
                    stack.push(comp);
                    depth += 1;
                } else {
                    out.push(format!("{}<{comp}{prop_str} />", pad(depth)));
                }
                continue;
            }
        }
        if let Some(g) = exec(&close, t) {
            let comp = g[2].clone().unwrap_or_default();
            if stack.last() == Some(&comp) {
                stack.pop();
                depth = depth.saturating_sub(1);
                out.push(format!("{}</{comp}>", pad(depth)));
            }
            continue;
        }
        if let Some(g) = exec(&slot, t) {
            out.push(format!("{}/* {}: */", pad(depth), g[1].clone().unwrap_or_default()));
            continue;
        }
        if t.starts_with("<div") && (t.contains("padding") || t.contains("maxWidth") || t.contains("gap:")) {
            let div_text = lines[i..(i + 5).min(lines.len())].join(" ");
            let mut sp: Vec<String> = Vec::new();
            if let Some(g) = exec(&pp, &div_text) {
                sp.push(format!("padding: {}", g[1].clone().unwrap_or_default().trim_matches(super::source::js_space)));
            }
            if let Some(g) = exec(&mw, &div_text) {
                sp.push(format!("maxWidth: {}", g[1].clone().unwrap_or_default()));
            }
            if let Some(g) = exec(&gp, &div_text) {
                sp.push(format!("gap: {}", g[1].clone().unwrap_or_default()));
            }
            if let Some(g) = exec(&mg, &div_text) {
                sp.push(format!("margin: {}", g[1].clone().unwrap_or_default()));
            }
            if let Some(g) = exec(&mi, &div_text) {
                sp.push(format!("marginInline: {}", g[1].clone().unwrap_or_default()));
            }
            if !sp.is_empty() {
                out.push(format!("{}/* div: {} */", pad(depth), sp.join(", ")));
            }
        }
    }
    out.into_iter().filter(|l| !l.trim_matches(super::source::js_space).is_empty()).collect::<Vec<_>>().join("\n")
}
