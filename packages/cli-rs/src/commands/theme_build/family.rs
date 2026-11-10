//! `api/theme/build/family.mjs`: order a selected theme family and factor its
//! members' CSS into one keyed stylesheet.

use crate::json::Value;
use std::collections::{HashMap, HashSet};

const THEME_SCOPE_TO: &str = "[data-astryx-theme]";

#[derive(Clone, Debug, Default)]
pub struct CssPlan {
    pub base: String,
    pub prose: Vec<String>,
    pub component: Vec<String>,
    pub adaptation: String,
    pub adaptation_prose: String,
    pub on_media: String,
    pub color_scheme: String,
}

pub struct FMember<'a> {
    pub name: String,
    pub css: &'a CssPlan,
}

fn q(s: &str) -> String {
    crate::json::stringify(&Value::String(s.to_string()), 0)
}

fn theme_selector(name: &str) -> String {
    format!("[data-astryx-theme={}]", q(name))
}

fn family_scope_selector(names: &[String]) -> String {
    format!(":where({})", names.iter().map(|n| theme_selector(n)).collect::<Vec<_>>().join(", "))
}

fn lower3_is_url(c: &[char], i: usize) -> bool {
    let start = i.saturating_sub(3);
    c[start..i].iter().collect::<String>().to_lowercase() == "url"
}

fn rule_bounds(rule: &[char]) -> Result<(usize, usize), String> {
    let mut open: Option<usize> = None;
    let mut depth = 0i64;
    let mut paren = 0i64;
    let mut url_depth = 0i64;
    let mut quote: Option<char> = None;
    let mut escaped = false;
    let mut comment = false;
    let mut i = 0;
    while i < rule.len() {
        let c = rule[i];
        if comment {
            if c == '*' && rule.get(i + 1) == Some(&'/') {
                comment = false;
                i += 1;
            }
        } else if escaped {
            escaped = false;
        } else if c == '\\' {
            escaped = true;
        } else if let Some(qc) = quote {
            if c == qc {
                quote = None;
            }
        } else if c == '"' || c == '\'' {
            quote = Some(c);
        } else if url_depth == 0 && c == '/' && rule.get(i + 1) == Some(&'*') {
            comment = true;
            i += 1;
        } else if c == '(' {
            paren += 1;
            if lower3_is_url(rule, i) {
                url_depth = paren;
            }
        } else if c == ')' && paren > 0 {
            if url_depth == paren {
                url_depth = 0;
            }
            paren -= 1;
        } else if c == '{' && paren == 0 {
            if open.is_none() {
                open = Some(i);
            }
            depth += 1;
        } else if c == '}' && paren == 0 && open.is_some() {
            depth -= 1;
            if depth == 0 {
                return Ok((open.unwrap(), i));
            }
        }
        i += 1;
    }
    Err("Theme compiler emitted a malformed rule.".into())
}

fn js_trim(s: &str) -> String {
    s.trim_matches(crate::cli::format::js_ws).to_string()
}

#[derive(Clone)]
struct DeclEntry {
    key: String,
    declaration: String,
    selector: String,
}

fn declaration_entries(rule: &str) -> Result<Vec<DeclEntry>, String> {
    let chars: Vec<char> = rule.chars().collect();
    let (open, close) = rule_bounds(&chars)?;
    let selector = js_trim(&chars[..open].iter().collect::<String>());
    let body: Vec<char> = chars[open + 1..close].to_vec();
    let mut decls: Vec<String> = Vec::new();
    let (mut start, mut quote, mut escaped, mut comment) = (0usize, None::<char>, false, false);
    let (mut paren, mut url_depth, mut braces, mut brackets) = (0i64, 0i64, 0i64, 0i64);
    let mut i = 0;
    while i < body.len() {
        let c = body[i];
        if comment {
            if c == '*' && body.get(i + 1) == Some(&'/') {
                comment = false;
                i += 1;
            }
        } else if escaped {
            escaped = false;
        } else if c == '\\' {
            escaped = true;
        } else if let Some(qc) = quote {
            if c == qc {
                quote = None;
            }
        } else if c == '"' || c == '\'' {
            quote = Some(c);
        } else if url_depth == 0 && c == '/' && body.get(i + 1) == Some(&'*') {
            comment = true;
            i += 1;
        } else if c == '(' {
            paren += 1;
            if lower3_is_url(&body, i) {
                url_depth = paren;
            }
        } else if c == ')' && paren > 0 {
            if url_depth == paren {
                url_depth = 0;
            }
            paren -= 1;
        } else if c == '[' && url_depth == 0 {
            brackets += 1;
        } else if c == ']' && url_depth == 0 && brackets > 0 {
            brackets -= 1;
        } else if c == '{' && paren == 0 {
            braces += 1;
        } else if c == '}' && paren == 0 && braces > 0 {
            braces -= 1;
        } else if c == ';' && paren == 0 && braces == 0 && brackets == 0 {
            let d = js_trim(&body[start..=i].iter().collect::<String>());
            if !d.is_empty() {
                decls.push(d);
            }
            start = i + 1;
        }
        i += 1;
    }
    if !js_trim(&body[start..].iter().collect::<String>()).is_empty() {
        return Err("Theme compiler emitted an unterminated declaration.".into());
    }
    let mut counts: HashMap<String, usize> = HashMap::new();
    Ok(decls
        .into_iter()
        .map(|d| {
            let prop = js_trim(&d[..d.find(':').unwrap_or(d.len())]);
            let n = counts.entry(prop.clone()).or_insert(0);
            let key = format!("{prop}\0{n}");
            *n += 1;
            DeclEntry { key, declaration: d, selector: selector.clone() }
        })
        .collect())
}

#[derive(Clone)]
struct RuleEntry {
    key: String,
    rule: String,
}

fn rule_entries(rules: &[String]) -> Result<Vec<RuleEntry>, String> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    rules
        .iter()
        .map(|r| {
            let chars: Vec<char> = r.chars().collect();
            let (open, _) = rule_bounds(&chars)?;
            let selector = js_trim(&chars[..open].iter().collect::<String>());
            let n = counts.entry(selector.clone()).or_insert(0);
            let key = format!("{selector}\0{n}");
            *n += 1;
            Ok(RuleEntry { key, rule: r.clone() })
        })
        .collect()
}

fn ordered_keys(seqs: &[Vec<String>]) -> Option<Vec<String>> {
    let mut rank: HashMap<String, usize> = HashMap::new();
    let mut order: Vec<String> = Vec::new();
    let mut edges: HashMap<String, Vec<String>> = HashMap::new();
    let mut indeg: HashMap<String, usize> = HashMap::new();
    for seq in seqs {
        for k in seq {
            if !rank.contains_key(k) {
                rank.insert(k.clone(), order.len());
                order.push(k.clone());
            }
            edges.entry(k.clone()).or_default();
            indeg.entry(k.clone()).or_insert(0);
        }
        for w in seq.windows(2) {
            let e = edges.get_mut(&w[0]).unwrap();
            if !e.contains(&w[1]) {
                e.push(w[1].clone());
                *indeg.get_mut(&w[1]).unwrap() += 1;
            }
        }
    }
    let mut ready: Vec<String> = order.iter().filter(|k| indeg[*k] == 0).cloned().collect();
    let mut out = Vec::new();
    while !ready.is_empty() {
        ready.sort_by(|a, b| rank[a].cmp(&rank[b]).then_with(|| crate::discovery::jsort::cmp_utf16(a, b)));
        let k = ready.remove(0);
        out.push(k.clone());
        for after in edges[&k].clone() {
            let d = indeg.get_mut(&after).unwrap();
            *d -= 1;
            if *d == 0 {
                ready.push(after);
            }
        }
    }
    (out.len() == rank.len()).then_some(out)
}

struct Item {
    names: Vec<String>,
    selector: String,
    declaration: String,
}

fn render_declarations(items: &[Item]) -> Vec<String> {
    let mut blocks: Vec<(String, Vec<String>, String, Vec<String>)> = Vec::new();
    for it in items {
        let scope = format!("{}\0{}", it.names.join("\0"), it.selector);
        match blocks.last_mut() {
            Some(b) if b.0 == scope => b.3.push(it.declaration.clone()),
            _ => blocks.push((scope, it.names.clone(), it.selector.clone(), vec![it.declaration.clone()])),
        }
    }
    blocks
        .into_iter()
        .map(|(_, names, selector, decls)| {
            let d = decls.iter().map(|v| format!("    {v}")).collect::<Vec<_>>().join("\n");
            format!("@scope ({}) to ({THEME_SCOPE_TO}) {{\n  {selector} {{\n{d}\n  }}\n}}", family_scope_selector(&names))
        })
        .collect()
}

fn complete_member_rules(members: &[FMember], field: &str) -> Vec<String> {
    members
        .iter()
        .filter_map(|m| {
            let list = if field == "prose" { &m.css.prose } else { &m.css.component };
            (!list.is_empty()).then(|| {
                format!("@scope ({}) to ({THEME_SCOPE_TO}) {{\n{}\n}}", family_scope_selector(&[m.name.clone()]), list.join("\n\n"))
            })
        })
        .collect()
}

fn factor_rules(members: &[FMember], field: &str) -> Result<Vec<String>, String> {
    let mut seqs: Vec<Vec<RuleEntry>> = Vec::new();
    for m in members {
        seqs.push(rule_entries(if field == "prose" { &m.css.prose } else { &m.css.component })?);
    }
    let maps: Vec<HashMap<String, RuleEntry>> = seqs.iter().map(|s| s.iter().map(|e| (e.key.clone(), e.clone())).collect()).collect();
    let Some(rule_order) = ordered_keys(&seqs.iter().map(|s| s.iter().map(|e| e.key.clone()).collect()).collect::<Vec<_>>()) else {
        return Ok(complete_member_rules(members, field));
    };
    let mut items: Vec<Item> = Vec::new();
    for rk in rule_order {
        let mut decls: Vec<Vec<DeclEntry>> = Vec::new();
        for map in &maps {
            decls.push(match map.get(&rk) {
                Some(r) => declaration_entries(&r.rule)?,
                None => vec![],
            });
        }
        let dmaps: Vec<HashMap<String, DeclEntry>> = decls.iter().map(|s| s.iter().map(|e| (e.key.clone(), e.clone())).collect()).collect();
        let Some(dorder) = ordered_keys(&decls.iter().map(|s| s.iter().map(|e| e.key.clone()).collect()).collect::<Vec<_>>()) else {
            return Ok(complete_member_rules(members, field));
        };
        for dk in dorder {
            let mut groups: Vec<Item> = Vec::new();
            for (i, m) in members.iter().enumerate() {
                let Some(e) = dmaps[i].get(&dk) else { continue };
                match groups.iter_mut().find(|g| g.declaration == e.declaration) {
                    Some(g) => g.names.push(m.name.clone()),
                    None => groups.push(Item { names: vec![m.name.clone()], selector: e.selector.clone(), declaration: e.declaration.clone() }),
                }
            }
            items.extend(groups);
        }
    }
    Ok(render_declarations(&items))
}

fn replace_scope_syntax(css: &str, search: &str, replacement: &str) -> String {
    let chars: Vec<char> = css.chars().collect();
    let search_c: Vec<char> = search.chars().collect();
    let mut out = String::new();
    let (mut quote, mut escaped, mut comment) = (None::<char>, false, false);
    let mut last_code: Option<char> = None;
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if comment {
            out.push(c);
            if c == '*' && chars.get(i + 1) == Some(&'/') {
                out.push('/');
                comment = false;
                i += 1;
            }
            i += 1;
            continue;
        }
        if let Some(qc) = quote {
            out.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == qc {
                quote = None;
            }
            i += 1;
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'*') {
            out.push_str("/*");
            comment = true;
            i += 2;
            continue;
        }
        if c == '"' || c == '\'' {
            out.push(c);
            quote = Some(c);
            i += 1;
            continue;
        }
        if matches!(last_code, None | Some('{') | Some('}')) && chars[i..].starts_with(&search_c) {
            out.push_str(replacement);
            last_code = Some(')');
            i += search_c.len();
            continue;
        }
        out.push(c);
        if !crate::cli::format::js_ws(c) {
            last_code = Some(c);
        }
        i += 1;
    }
    out
}

fn factor_sections(members: &[FMember], field: &str) -> Vec<String> {
    let mut groups: Vec<(String, Vec<String>)> = Vec::new();
    for m in members {
        let raw = match field {
            "adaptationProse" => &m.css.adaptation_prose,
            "adaptation" => &m.css.adaptation,
            _ => &m.css.on_media,
        };
        let css = replace_scope_syntax(raw, &format!("@scope ({})", theme_selector(&m.name)), "@scope (__ASTRYX_FAMILY_SCOPE__)");
        if css.is_empty() {
            continue;
        }
        match groups.iter_mut().find(|g| g.0 == css) {
            Some(g) => g.1.push(m.name.clone()),
            None => groups.push((css, vec![m.name.clone()])),
        }
    }
    groups
        .into_iter()
        .map(|(css, names)| replace_scope_syntax(&css, "@scope (__ASTRYX_FAMILY_SCOPE__)", &format!("@scope ({})", family_scope_selector(&names))))
        .collect()
}

fn color_scheme_sections(members: &[FMember]) -> (Vec<String>, Vec<String>) {
    let mut groups: Vec<(String, Vec<String>)> = Vec::new();
    for m in members {
        let css = &m.css.color_scheme;
        if css.is_empty() {
            continue;
        }
        match groups.iter_mut().find(|g| &g.0 == css) {
            Some(g) => g.1.push(m.name.clone()),
            None => groups.push((css.clone(), vec![m.name.clone()])),
        }
    }
    let (mut base, mut themed) = (Vec::new(), Vec::new());
    for (css, names) in groups {
        let ids = family_scope_selector(&names);
        let top = format!("{ids}:not(:where([data-astryx-theme] [data-astryx-theme]))");
        let active = |sel: &str| format!("{sel}{ids},\n{sel}:where(:not([data-astryx-theme])):has({top})");
        base.push(format!("@scope ({ids}) to ({THEME_SCOPE_TO}) {{\n  :where(:scope:not([data-theme]):not(html[data-theme] *)) {{ color-scheme: light dark; }}\n  :where(:scope:not([data-theme]):is(html[data-theme=\"light\"] *)) {{ color-scheme: light; }}\n  :where(:scope:not([data-theme]):is(html[data-theme=\"dark\"] *)) {{ color-scheme: dark; }}\n}}"));
        let t = css
            .replacen(":root", &active(":root"), 1)
            .replacen("html[data-theme=\"light\"]", &active("html[data-theme=\"light\"]"), 1)
            .replacen("html[data-theme=\"dark\"]", &active("html[data-theme=\"dark\"]"), 1);
        themed.push(t);
    }
    (base, themed)
}

/// `generateFamilyCSS(members)`.
pub fn generate_family_css(members: &[FMember]) -> Result<String, String> {
    let root = &members[0];
    for m in members {
        if m.css.base != root.css.base {
            return Err("Theme-independent base CSS changed between family members.".into());
        }
    }
    let mut prose = factor_rules(members, "prose")?;
    prose.extend(factor_sections(members, "adaptationProse"));
    let (scheme_base, scheme_themed) = color_scheme_sections(members);
    let mut themed: Vec<String> = scheme_themed;
    themed.extend(factor_rules(members, "component")?);
    themed.extend(factor_sections(members, "adaptation"));
    themed.extend(factor_sections(members, "onMedia"));
    let themed: Vec<String> = themed.into_iter().filter(|s| !s.is_empty()).collect();
    let mut parts = Vec::new();
    if !prose.is_empty() {
        parts.push(format!("@layer reset {{\n{}\n}}", prose.join("\n\n")));
    }
    let mut base: Vec<String> = Vec::new();
    if !root.css.base.is_empty() {
        base.push(root.css.base.clone());
    }
    base.extend(scheme_base.into_iter().filter(|s| !s.is_empty()));
    if !base.is_empty() {
        parts.push(format!("@layer astryx-base {{\n{}\n}}", base.join("\n\n")));
    }
    if !themed.is_empty() {
        parts.push(format!("@layer astryx-theme {{\n{}\n}}", themed.join("\n\n")));
    }
    Ok(format!("@layer reset, astryx-base, astryx-theme;\n\n{}\n", parts.join("\n\n")))
}

#[allow(dead_code)]
fn unused(_: HashSet<String>) {}
