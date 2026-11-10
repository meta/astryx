//! The `docs` command's text view (clients/cli/commands/docs.mjs).

use crate::cli::format::{code, display_width, js_len, pad_end, records_inline, section, text, wrap_text, Block, Field, Fields, InlineOpts, WRAP_WIDTH};
use crate::json::Value;

fn s(v: &Value) -> &str {
    v.as_str().unwrap_or("")
}

fn arr(v: &Value) -> &[Value] {
    v.as_array().map(|a| a.as_slice()).unwrap_or(&[])
}

// ─── prefixCliCommands ──────────────────────────────────────────────────────

fn is_js_ws(c: char) -> bool {
    crate::cli::format::js_ws(c)
}

/// `/`astryx(?=[\s`])/g` -> `` `stem ``.
fn prefix_inline(line: &str, stem: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = line;
    while let Some(i) = rest.find("`astryx") {
        let after = &rest[i + 7..];
        out.push_str(&rest[..i]);
        match after.chars().next() {
            Some(c) if is_js_ws(c) || c == '`' => {
                out.push('`');
                out.push_str(stem);
            }
            _ => out.push_str("`astryx"),
        }
        rest = after;
    }
    out.push_str(rest);
    out
}

/// `/(^\s*(?:\$\s+)?|(?:&&|\|\||;|\|)\s*)astryx(?=\s|$)/g` -> `$1stem`.
fn prefix_shell(line: &str, stem: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let n = chars.len();
    let word: Vec<char> = "astryx".chars().collect();
    let at_word = |i: usize| -> bool { i + 6 <= n && chars[i..i + 6] == word[..] && (i + 6 == n || is_js_ws(chars[i + 6])) };
    let mut out = String::new();
    let mut i = 0;
    // The line-start alternative: only at index 0.
    {
        let mut j = 0;
        while j < n && is_js_ws(chars[j]) {
            j += 1;
        }
        let mut k = j;
        // Optional `$` then at least one space; the regex backtracks, so
        // try with the `$` part first, then without.
        let mut matched = None;
        if k < n && chars[k] == '$' {
            let mut m = k + 1;
            if m < n && is_js_ws(chars[m]) {
                while m < n && is_js_ws(chars[m]) {
                    m += 1;
                }
                if at_word(m) {
                    matched = Some(m);
                }
            }
        }
        if matched.is_none() {
            // \s* greedy can backtrack, but a non-space must follow it.
            k = j;
            if at_word(k) {
                matched = Some(k);
            }
        }
        if let Some(m) = matched {
            out.extend(&chars[..m]);
            out.push_str(stem);
            i = m + 6;
        }
    }
    while i < n {
        // Find an operator at i: `&&`, `||`, `;`, `|`.
        let op_len = if i + 1 < n && chars[i] == '&' && chars[i + 1] == '&' {
            2
        } else if i + 1 < n && chars[i] == '|' && chars[i + 1] == '|' {
            2
        } else if chars[i] == ';' || chars[i] == '|' {
            1
        } else {
            0
        };
        if op_len > 0 {
            let mut m = i + op_len;
            while m < n && is_js_ws(chars[m]) {
                m += 1;
            }
            if at_word(m) {
                out.extend(&chars[i..m]);
                out.push_str(stem);
                i = m + 6;
                continue;
            }
            // `||` failing may still match as `|` then `|`... the regex tries
            // `&&`, `||`, `;`, `|` at this index; `|` alone needs `astryx`
            // right after optional spaces, which `||` already covered.
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

const SHELL_FENCES: &[&str] = &["", "bash", "sh", "shell", "zsh", "console"];
const PROSE_FENCES: &[&str] = &["text", "txt", "markdown", "md"];

fn prefix_line(line: &str, stem: &str, lang: Option<&str>) -> String {
    match lang {
        None => prefix_inline(line, stem),
        Some(l) if SHELL_FENCES.contains(&l) => prefix_shell(line, stem),
        Some(l) if PROSE_FENCES.contains(&l) => prefix_shell(&prefix_inline(line, stem), stem),
        Some(_) => line.to_string(),
    }
}

/// `/^\s*(`{3,}|~{3,})\s*([\w-]*)/` -> (marker, lang).
fn fence_marker(line: &str) -> Option<(String, String)> {
    let t = line.trim_start_matches(is_js_ws);
    let c = t.chars().next()?;
    if c != '`' && c != '~' {
        return None;
    }
    let count = t.chars().take_while(|&x| x == c).count();
    if count < 3 {
        return None;
    }
    let marker: String = std::iter::repeat(c).take(count).collect();
    let rest = t[count..].trim_start_matches(is_js_ws);
    let lang: String = rest.chars().take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '-').collect();
    Some((marker, lang))
}

/// `prefixCliCommands(text, stem, lang)`.
pub fn prefix_cli_commands(input: &str, stem: &str, lang: Option<&str>) -> String {
    if stem == "astryx" {
        return input.to_string();
    }
    let block_lang = lang.map(|l| l.to_lowercase());
    let mut fence: Option<(String, String)> = None;
    input
        .split('\n')
        .map(|line| {
            if let Some(bl) = &block_lang {
                return prefix_line(line, stem, Some(bl));
            }
            if let Some((marker, l)) = fence_marker(line) {
                match &fence {
                    None => fence = Some((marker, l.to_lowercase())),
                    Some((m, _)) if marker.starts_with(m.as_str()) => fence = None,
                    _ => {}
                }
                return line.to_string();
            }
            prefix_line(line, stem, fence.as_ref().map(|f| f.1.as_str()))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

// ─── Formatting ────────────────────────────────────────────────────────────

pub struct Ctx {
    /// The invocation stem (`pnpm exec astryx`).
    pub run: String,
}

impl Ctx {
    /// `formatCliCommand(command)`.
    pub fn format_cli_command(&self, command: &str) -> String {
        let t = command.trim_start_matches(is_js_ws);
        let sub = if t.starts_with("astryx") && t[6..].chars().next().map(|c| !(c.is_alphanumeric() || c == '_')).unwrap_or(true) {
            &t[6..]
        } else {
            t
        };
        let sub = sub.trim_start_matches(is_js_ws).trim_end_matches(is_js_ws);
        if sub.is_empty() {
            self.run.clone()
        } else {
            format!("{} {}", self.run, sub)
        }
    }
    fn shown(&self, v: &str) -> String {
        prefix_cli_commands(v, &self.run, None)
    }
}

fn table_cell(cell: &str) -> String {
    cell.replace('|', "\\|")
}

fn format_table(headers: &[String], rows: &[Vec<String>]) -> String {
    let head: Vec<String> = headers.iter().map(|h| table_cell(h)).collect();
    let cells: Vec<Vec<String>> = rows.iter().map(|r| r.iter().map(|c| table_cell(c)).collect()).collect();
    let widths: Vec<usize> = head
        .iter()
        .enumerate()
        .map(|(i, h)| cells.iter().map(|r| r.get(i).map(|c| js_len(c)).unwrap_or(0)).fold(js_len(h), usize::max))
        .collect();
    let sep = widths.iter().map(|w| "-".repeat(*w)).collect::<Vec<_>>().join(" | ");
    let top = head.iter().enumerate().map(|(i, h)| pad_end(h, widths[i])).collect::<Vec<_>>().join(" | ");
    let body = cells
        .iter()
        .map(|r| r.iter().enumerate().map(|(i, c)| pad_end(c, widths.get(i).copied().unwrap_or(0))).collect::<Vec<_>>().join(" | "))
        .collect::<Vec<_>>()
        .join("\n");
    format!("{top}\n{sep}\n{body}")
}

/// A JSON value as `String(cell ?? '')`.
fn cell_str(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        other => crate::cli::format::js_string(other),
    }
}

/// `formatBlock(block, detail)`.
pub fn format_block(ctx: &Ctx, block: &Value, detail: &str) -> Option<String> {
    let stem = &ctx.run;
    match s(&block["type"]) {
        "prose" => Some(ctx.shown(&cell_str(&block["text"]))),
        "heading" => {
            let level = block["level"].as_u64().filter(|l| *l > 0).unwrap_or(3) as usize;
            Some(format!("{} {}", "#".repeat(level), ctx.shown(&cell_str(&block["text"]))))
        }
        "code" => {
            if detail == "compact" || detail == "brief" {
                return None;
            }
            let label = match block.get("label") {
                Some(Value::String(l)) if !l.is_empty() => {
                    let trimmed = strip_colon_ws_end(l);
                    format!("{trimmed}:\n")
                }
                _ => String::new(),
            };
            let lang = cell_str(&block["lang"]);
            let lang_shown = match &block["lang"] {
                Value::Null => "undefined".to_string(),
                v => crate::cli::format::js_string(v),
            };
            let body = prefix_cli_commands(&cell_str(&block["code"]), stem, if block["lang"].is_null() { None } else { Some(&lang) });
            Some(format!("{label}```{lang_shown}\n{body}\n```"))
        }
        "table" => {
            let shown_cell = |c: &Value| -> String {
                let c = cell_str(c);
                if c.starts_with("astryx") && c[6..].chars().next().map(is_js_ws).unwrap_or(true) {
                    format!("{stem}{}", &c[6..])
                } else {
                    ctx.shown(&c)
                }
            };
            let rows: Vec<Vec<String>> = arr(&block["rows"]).iter().map(|r| arr(r).iter().map(shown_cell).collect()).collect();
            if detail == "brief" {
                return Some(rows.iter().map(|r| r.iter().take(2).map(|c| table_cell(c)).collect::<Vec<_>>().join("=")).collect::<Vec<_>>().join(" | "));
            }
            if detail == "compact" {
                return Some(rows.iter().map(|r| r.iter().filter(|c| !c.trim_matches(is_js_ws).is_empty()).cloned().collect::<Vec<_>>().join(" = ")).collect::<Vec<_>>().join("\n"));
            }
            let headers: Vec<String> = arr(&block["headers"]).iter().map(cell_str).collect();
            Some(format_table(&headers, &rows))
        }
        "list" => {
            let style = s(&block["style"]);
            Some(
                arr(&block["items"])
                    .iter()
                    .enumerate()
                    .map(|(i, item)| {
                        let p = match style {
                            "ordered" => format!("{}. ", i + 1),
                            "dont" => "x ".into(),
                            "do" => "+ ".into(),
                            _ => "- ".into(),
                        };
                        format!("{p}{}", ctx.shown(&cell_str(item)))
                    })
                    .collect::<Vec<_>>()
                    .join("\n"),
            )
        }
        _ => None,
    }
}

/// `label.replace(/:\s*$/, '')`.
fn strip_colon_ws_end(l: &str) -> String {
    let t = l.trim_end_matches(is_js_ws);
    if let Some(stripped) = t.strip_suffix(':') {
        // The regex matches the first `:` whose rest is all whitespace.
        stripped.to_string()
    } else {
        l.to_string()
    }
}

fn format_section(ctx: &Ctx, title: &str, content: &[Value], detail: &str) -> String {
    let blocks: Vec<String> = content.iter().filter_map(|b| format_block(ctx, b, detail)).filter(|s| !s.is_empty()).collect();
    if detail == "brief" {
        let first = blocks.first().map(|b| b.split('\n').next().unwrap_or("").to_string()).unwrap_or_default();
        return format!("{title}: {first}");
    }
    let heading = if detail == "compact" { format!("[{title}]") } else { format!("## {title}") };
    format!("{heading}\n\n{}", blocks.join("\n\n"))
}

fn titled_with_package(title: &str, pkg: &str) -> String {
    let label = format!("({pkg})");
    if title.ends_with(&label) {
        title.to_string()
    } else {
        format!("{title} {label}")
    }
}

fn format_reference_full(ctx: &Ctx, data: &Value, owner: &str, detail: &str) -> String {
    let sections: Vec<String> = arr(&data["sections"])
        .iter()
        .map(|sec| {
            let title = s(&sec["title"]);
            let pkg = s(&sec["package"]);
            let title = if sec.get("package").map(|p| p.as_str() == Some(owner)).unwrap_or(false) { title.to_string() } else { titled_with_package(title, pkg) };
            format_section(ctx, &title, arr(&sec["content"]), detail)
        })
        .collect();
    let title = cell_str(&data["title"]);
    let description = js_str_or_undefined(&data["description"]);
    if detail == "brief" {
        return format!("{title}: {description}\n{}", sections.join("\n"));
    }
    let header = if detail == "compact" { format!("# {title}\n{description}") } else { format!("# {title}\n\n{description}") };
    format!("{header}\n\n{}", sections.join("\n\n"))
}

fn js_str_or_undefined(v: &Value) -> String {
    match v {
        Value::Null => "undefined".into(),
        other => crate::cli::format::js_string(other),
    }
}

fn tree_heading(title: &str, level: i64) -> String {
    format!("{} {}", "#".repeat(level.clamp(1, 6) as usize), title)
}

fn format_tree_blocks(ctx: &Ctx, blocks: &[Value], detail: &str, offset: i64) -> Vec<String> {
    let mut out = Vec::new();
    for b in blocks {
        let v = if s(&b["type"]) == "heading" {
            let level = b["level"].as_i64().filter(|l| *l != 0).unwrap_or(3);
            Some(tree_heading(&cell_str(&b["text"]), level + offset))
        } else {
            format_block(ctx, b, detail)
        };
        if let Some(v) = v {
            if !v.is_empty() {
                out.push(v);
            }
        }
    }
    out
}

fn format_tree_section(ctx: &Ctx, sec: &Value, detail: &str, level: i64) -> String {
    let heading = tree_heading(s(&sec["title"]), level);
    let blocks = format_tree_blocks(ctx, arr(&sec["content"]), detail, level - 2);
    if blocks.is_empty() {
        heading
    } else {
        format!("{heading}\n\n{}", blocks.join("\n\n"))
    }
}

fn below_root(route: &str, root: &str) -> String {
    let p = format!("{root}/");
    if route.starts_with(&p) {
        route[root.len() + 1..].to_string()
    } else {
        route.to_string()
    }
}

fn docs_below(count: u64) -> String {
    format!("{count} {} below", if count == 1 { "doc" } else { "docs" })
}

fn starts_experimental(summary: &str) -> bool {
    // /^experimental\b/iu
    let lower: String = summary.chars().take(13).collect::<String>().to_lowercase();
    if !lower.starts_with("experimental") {
        return false;
    }
    match summary.chars().nth(12) {
        None => true,
        Some(c) => !(c.is_alphanumeric() || c == '_'),
    }
}

struct ChildRow {
    name: String,
    summary: String,
    experimental: bool,
}

fn child_row(ctx: &Ctx, child: &Value, owner: &str) -> ChildRow {
    let kind = s(&child["kind"]);
    let title = s(&child["title"]);
    let name = s(&child["name"]);
    let summary = cell_str(&child["summary"]);
    let adds = kind != "namespace" && kind != "generic" && title != name;
    let experimental = s(&child["stability"]) == "experimental";
    let marked = if experimental && !starts_experimental(&summary) { "[experimental] " } else { "" };
    let body = if adds { format!("{title}: {summary}") } else { summary };
    ChildRow {
        name: if s(&child["package"]) == owner { name.to_string() } else { format!("{name} ({})", s(&child["package"])) },
        summary: prefix_cli_commands(&format!("{marked}{body}"), &ctx.run, None),
        experimental,
    }
}

fn tree_rows(ctx: &Ctx, children: &[Value], root: &str, owner: &str, out: &mut Vec<Fields>) {
    for child in children {
        let route = s(&child["route"]);
        let name = if s(&child["package"]) == owner { below_root(route, root) } else { format!("{} ({})", below_root(route, root), s(&child["package"])) };
        let row = child_row(ctx, child, owner);
        let summary = match child["childCount"].as_u64().filter(|c| *c > 0) {
            Some(c) => format!("{} ({})", row.summary, docs_below(c)),
            None => row.summary,
        };
        out.push(vec![("name".into(), Field::Str(name)), ("summary".into(), Field::Str(summary))]);
        for slot in arr(&child["slots"]) {
            tree_rows(ctx, arr(&slot["children"]), root, owner, out);
        }
    }
}

fn format_tree_child(ctx: &Ctx, child: &Value, detail: &str, level: i64, root: &str, owner: &str) -> String {
    let route = s(&child["route"]);
    let place = if s(&child["package"]) == owner { below_root(route, root) } else { format!("{}, {}", below_root(route, root), s(&child["package"])) };
    let mut parts = vec![format!("{} ({place})", tree_heading(s(&child["title"]), level))];
    let kind = s(&child["kind"]);
    let summary = cell_str(&child["summary"]);
    if !summary.is_empty() && (kind == "namespace" || kind == "generic") {
        parts.push(prefix_cli_commands(&summary, &ctx.run, None));
    }
    let content = format_tree_blocks(ctx, arr(&child["content"]), detail, level - 2);
    if !content.is_empty() {
        parts.push(content.join("\n\n"));
    }
    for sec in arr(&child["sections"]) {
        parts.push(format_tree_section(ctx, sec, detail, level + 1));
    }
    if let Some(c) = child["childCount"].as_u64().filter(|c| *c > 0) {
        parts.push(format!("{}: {} docs {route} --depth 1", docs_below(c), ctx.run));
    }
    for slot in arr(&child["slots"]) {
        for each in arr(&slot["children"]) {
            parts.push(format_tree_child(ctx, each, detail, level + 1, root, owner));
        }
    }
    parts.join("\n\n")
}

fn link_lines(ctx: &Ctx, links: &Value) -> Vec<String> {
    if links.is_null() {
        return vec![];
    }
    let mut out = vec![format!("Up: {}", ctx.format_cli_command(s(&links["up"])))];
    if let Some(p) = links["previous"].as_str() {
        out.push(format!("Previous: {}", ctx.format_cli_command(p)));
    }
    if let Some(n) = links["next"].as_str() {
        out.push(format!("Next: {}", ctx.format_cli_command(n)));
    }
    for (i, r) in arr(&links["related"]).iter().enumerate() {
        out.push(format!("{}{}", if i == 0 { "Related: " } else { "         " }, ctx.format_cli_command(s(r))));
    }
    out
}

fn record_package(pkg: &str) -> Block {
    crate::cli::format::record(&[("package".to_string(), Field::Str(pkg.to_string()))])
}

fn replaced_line(data: &Value) -> Vec<Block> {
    match (data["replaces"].as_str(), data["replacedPackage"].as_str()) {
        (Some(r), Some(p)) => vec![text(&format!("replaces {p}'s {r}"))],
        _ => vec![],
    }
}

fn inline(items: &[Fields]) -> Block {
    records_inline(items, &InlineOpts::default())
}

pub fn emit_index(ctx: &Ctx, index: &Value, owner: &str) -> Vec<Block> {
    let desc = cell_str(&index["description"]);
    let wrapped = wrap_text(&desc, WRAP_WIDTH, "");
    let mut blocks = vec![
        section(s(&index["title"]), if desc.is_empty() { None } else { Some(&wrapped) }),
        record_package(owner),
    ];
    blocks.extend(replaced_line(index));
    let rows: Vec<Fields> = arr(&index["sections"])
        .iter()
        .map(|sec| {
            let summary = prefix_cli_commands(&cell_str(&sec["summary"]), &ctx.run, None);
            let title = if s(&sec["package"]) == owner { s(&sec["title"]).to_string() } else { titled_with_package(s(&sec["title"]), s(&sec["package"])) };
            vec![("id".into(), Field::from_json(&sec["id"])), ("title".into(), Field::Str(title)), ("summary".into(), Field::Str(summary))]
        })
        .collect();
    blocks.push(inline(&rows));
    let name = cell_str(&index["name"]);
    let mut lines = vec![format!("Read one section: {} docs {name} <section>", ctx.run), format!("Read everything:  {} docs {name} --full", ctx.run)];
    lines.extend(link_lines(ctx, &index["links"]));
    blocks.push(text(&lines.join("\n")));
    blocks
}

pub fn emit_detail(ctx: &Ctx, data: &Value, owner: &str, detail: &str) -> Vec<Block> {
    let mut blocks = vec![record_package(owner)];
    blocks.extend(replaced_line(data));
    blocks.push(code(&format_reference_full(ctx, data, owner, detail)));
    blocks.push(text(&link_lines(ctx, &data["links"]).join("\n")));
    blocks
}

pub fn emit_section(ctx: &Ctx, data: &Value, pkg: &str, detail: &str) -> Vec<Block> {
    vec![
        record_package(pkg),
        code(&format_section(ctx, s(&data["title"]), arr(&data["content"]), detail)),
        text(&link_lines(ctx, &data["links"]).join("\n")),
    ]
}

fn all_routes(children: &[Value], out: &mut Vec<String>) {
    for c in children {
        out.push(s(&c["route"]).to_string());
        for slot in arr(&c["slots"]) {
            all_routes(arr(&slot["children"]), out);
        }
    }
}

pub fn emit_node(ctx: &Ctx, node: &Value, detail: &str) -> Vec<Block> {
    let pkg = s(&node["package"]);
    if s(&node["kind"]) == "namespace" {
        let title = s(&node["title"]);
        let mut blocks = vec![section(title, Some(&wrap_text(&prefix_cli_commands(&cell_str(&node["summary"]), &ctx.run, None), WRAP_WIDTH, ""))), record_package(pkg)];
        let content = arr(&node["content"]);
        if !content.is_empty() {
            let parts: Vec<String> = content
                .iter()
                .filter_map(|b| {
                    if s(&b["type"]) == "prose" {
                        Some(wrap_text(&format_block(ctx, b, detail).unwrap_or_default(), WRAP_WIDTH, ""))
                    } else {
                        format_block(ctx, b, detail)
                    }
                })
                .filter(|x| !x.is_empty())
                .collect();
            blocks.push(text(&parts.join("\n\n")));
        }
        let slots = arr(&node["slots"]);
        for slot in slots {
            if !(slots.len() == 1 && s(&slot["title"]) == title) {
                blocks.push(section(s(&slot["title"]), None));
            }
            let children = arr(&slot["children"]);
            let rows: Vec<ChildRow> = children.iter().map(|c| child_row(ctx, c, pkg)).collect();
            let all_exp = children.iter().all(|c| s(&c["stability"]) == "experimental");
            let fields: Vec<Fields> = rows.iter().map(|r| vec![("name".into(), Field::Str(r.name.clone())), ("summary".into(), Field::Str(r.summary.clone()))]).collect();
            let sizes = |i: usize| -> bool { !rows[i].experimental || all_exp };
            blocks.push(records_inline(&fields, &InlineOpts { truncate: false, sizes_column: Some(&sizes) }));
        }
        let route = s(&node["route"]);
        let below = slots.iter().all(|slot| arr(&slot["children"]).iter().all(|c| s(&c["route"]).starts_with(&format!("{route}/"))));
        let mut lines = vec![if below { format!("Open one: {} docs {route}/<name>", ctx.run) } else { format!("Open one: {} docs <name>", ctx.run) }];
        lines.extend(link_lines(ctx, &node["links"]));
        blocks.push(text(&lines.join("\n")));
        return blocks;
    }
    vec![
        record_package(pkg),
        code(&format_section(ctx, s(&node["title"]), arr(&node["content"]), detail)),
        text(&link_lines(ctx, &node["links"]).join("\n")),
    ]
}

pub fn emit_tree(ctx: &Ctx, node: &Value, detail: &str, child_detail: &str) -> Vec<Block> {
    if s(&node["kind"]) != "namespace" {
        return emit_node(ctx, node, detail);
    }
    let route = s(&node["route"]);
    let pkg = s(&node["package"]);
    let title = s(&node["title"]);
    let slots = arr(&node["slots"]);
    let mut routes = Vec::new();
    for slot in slots {
        all_routes(arr(&slot["children"]), &mut routes);
    }
    let all_below = routes.iter().all(|r| r.starts_with(&format!("{route}/")));
    let root = if all_below { route } else { "" };
    let mut blocks = vec![section(title, Some(&wrap_text(&prefix_cli_commands(&cell_str(&node["summary"]), &ctx.run, None), WRAP_WIDTH, ""))), record_package(pkg)];
    let content = arr(&node["content"]);
    if !content.is_empty() {
        blocks.push(text(&content.iter().filter_map(|b| format_block(ctx, b, detail)).filter(|x| !x.is_empty()).collect::<Vec<_>>().join("\n\n")));
    }
    if let Some(c) = node["childCount"].as_u64().filter(|c| *c > 0) {
        blocks.push(text(&format!("{}. Read them: {} docs {route} --depth 1", docs_below(c), ctx.run)));
    }
    for slot in slots {
        if !(slots.len() == 1 && s(&slot["title"]) == title) {
            blocks.push(section(s(&slot["title"]), None));
        }
        if child_detail == "brief" {
            let mut rows = Vec::new();
            tree_rows(ctx, arr(&slot["children"]), root, pkg, &mut rows);
            blocks.push(inline(&rows));
        } else {
            blocks.push(code(&arr(&slot["children"]).iter().map(|c| format_tree_child(ctx, c, child_detail, 2, root, pkg)).collect::<Vec<_>>().join("\n\n")));
        }
    }
    let mut lines = Vec::new();
    if !slots.is_empty() {
        lines.push(if all_below { format!("Open one: {} docs {route}/<name>", ctx.run) } else { format!("Open one: {} docs <name>", ctx.run) });
    }
    lines.extend(link_lines(ctx, &node["links"]));
    blocks.push(text(&lines.join("\n")));
    blocks
}

fn flatten_namespaces(rows: &[Value], out: &mut Vec<Fields>) {
    for row in rows {
        let desc = cell_str(&row["description"]);
        let desc = if s(&row["stability"]) == "experimental" && !starts_experimental(&desc) { format!("[experimental] {desc}") } else { desc };
        out.push(vec![
            ("topic".into(), Field::from_json(&row["topic"])),
            ("description".into(), Field::Str(desc)),
            ("package".into(), Field::from_json(&row["package"])),
        ]);
        flatten_namespaces(arr(&row["children"]), out);
    }
}

pub fn emit_list(ctx: &Ctx, result: &Value) -> Vec<Block> {
    let mut namespaces = Vec::new();
    flatten_namespaces(arr(&result["meta"]["namespaces"]), &mut namespaces);
    let topics: Vec<Fields> = arr(&result["data"])
        .iter()
        .map(|t| vec![("topic".into(), Field::from_json(&t["topic"])), ("description".into(), Field::from_json(&t["description"])), ("package".into(), Field::from_json(&t["package"]))])
        .collect();
    let mut blocks = Vec::new();
    if !namespaces.is_empty() {
        blocks.push(section("Docs tree", None));
        blocks.push(inline(&namespaces));
    }
    blocks.push(section("Topics", None));
    blocks.push(inline(&topics));
    let run = &ctx.run;
    blocks.push(text(
        &[
            format!("Usage: {run} docs <topic>                  list a topic's sections"),
            format!("       {run} docs <topic> <section>        read one section"),
            format!("       {run} docs <topic> --full           read the whole topic"),
            format!("       {run} docs cli/api                  go down the docs tree one level at a time"),
            format!("       {run} docs cli --depth all          every doc below cli, one line each"),
            "With --json, a topic returns its whole doc; add --index for its section list.".to_string(),
        ]
        .join("\n"),
    ));
    let not_loaded = arr(&result["meta"]["notLoaded"]);
    if !not_loaded.is_empty() {
        blocks.push(section("Not loaded", None));
        let rows: Vec<Fields> = not_loaded.iter().map(|r| vec![("package".into(), Field::from_json(&r["package"])), ("message".into(), Field::from_json(&r["message"]))]).collect();
        blocks.push(inline(&rows));
        blocks.push(text(&format!("Run `{run} doctor integration docs` in that package to see every problem.")));
    }
    blocks
}

#[allow(dead_code)]
fn _unused() -> usize {
    display_width("")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prefixes() {
        let st = "pnpm exec astryx";
        assert_eq!(prefix_cli_commands("run `astryx docs` now", st, None), "run `pnpm exec astryx docs` now");
        assert_eq!(prefix_cli_commands("$ astryx init && astryx docs", st, Some("bash")), "$ pnpm exec astryx init && pnpm exec astryx docs");
        assert_eq!(prefix_cli_commands("```bash\nastryx x\n```\nastryx y", st, None), "```bash\npnpm exec astryx x\n```\nastryx y");
        assert_eq!(prefix_cli_commands("echo astryx", st, Some("sh")), "echo astryx");
    }
}
