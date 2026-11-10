//! The text formatter kit (`clients/cli/formatters/index.mjs`): blocks that
//! a command joins with `emit` (via `Out::emit`).

pub const ARROW: &str = "->";
pub const BULLET: &str = "-";
pub const ERR: &str = "!!";
pub const WARN: &str = "!";
pub const WRAP_WIDTH: usize = 120;
const INLINE_LEAD_MAX: usize = 32;

/// One rendered block of text.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Block(pub String);

impl std::fmt::Display for Block {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl Block {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Join blocks as `emit` does: drop empty ones, separate with a blank line.
pub fn join_blocks(blocks: &[Block]) -> String {
    blocks.iter().map(|b| b.0.as_str()).filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n\n")
}

fn is_wide(c: char) -> bool {
    let u = c as u32;
    matches!(u,
        0x1100..=0x115f | 0x2e80..=0x303e | 0x3041..=0x33ff | 0x3400..=0x4dbf |
        0x4e00..=0x9fff | 0xa000..=0xa4cf | 0xac00..=0xd7a3 | 0xf900..=0xfaff |
        0xfe30..=0xfe4f | 0xff00..=0xff60 | 0xffe0..=0xffe6)
}

/// Columns a string takes in a terminal (CJK counts two).
pub fn display_width(s: &str) -> usize {
    s.chars().map(|c| if is_wide(c) { 2 } else { 1 }).sum()
}

/// `String#length`: UTF-16 code units.
pub fn js_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// `String#padEnd(width)` with spaces, in UTF-16 code units.
pub fn pad_end(s: &str, width: usize) -> String {
    let len = js_len(s);
    if len >= width {
        s.to_string()
    } else {
        format!("{s}{}", " ".repeat(width - len))
    }
}

/// `String#padStart(width)` with spaces, in UTF-16 code units.
pub fn pad_start(s: &str, width: usize) -> String {
    let len = js_len(s);
    if len >= width {
        s.to_string()
    } else {
        format!("{}{s}", " ".repeat(width - len))
    }
}

fn truncate_to_width(line: &str, width: usize) -> String {
    if display_width(line) <= width {
        return line.to_string();
    }
    let mut out = String::new();
    let mut used = 0;
    for ch in line.chars() {
        let w = if is_wide(ch) { 2 } else { 1 };
        if used + w > width.saturating_sub(3) {
            break;
        }
        out.push(ch);
        used += w;
    }
    format!("{}...", out.trim_end_matches(js_ws))
}

/// JS `\s` / `String#trim` whitespace.
pub fn js_ws(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

/// The ASCII normalization every text block gets.
pub fn to_ascii(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\u{2014}' | '\u{2013}' => out.push('-'),
            '\u{2018}' | '\u{2019}' => out.push('\''),
            '\u{201C}' | '\u{201D}' => out.push('"'),
            '\u{2026}' => out.push_str("..."),
            '\u{2192}' => out.push_str("->"),
            '\u{2190}' => out.push_str("<-"),
            '\u{a0}' => out.push(' '),
            c => out.push(c),
        }
    }
    out
}

/// `wrapText(input, {width, indent})`.
pub fn wrap_text(input: &str, width: usize, indent: &str) -> String {
    input.split('\n').map(|l| wrap_line(l, width, indent)).collect::<Vec<_>>().join("\n")
}

fn wrap_line(line: &str, width: usize, indent: &str) -> String {
    if display_width(line) <= width {
        return line.to_string();
    }
    let lead_len: usize = line.chars().take_while(|c| js_ws(*c)).map(|c| c.len_utf8()).sum();
    let lead = &line[..lead_len];
    let mut tokens: Vec<(String, String)> = Vec::new();
    let mut gap = String::new();
    let mut word = String::new();
    for ch in line[lead_len..].chars() {
        if ch == ' ' {
            if !word.is_empty() {
                tokens.push((std::mem::take(&mut word), std::mem::take(&mut gap)));
            }
            gap = " ".into();
        } else if is_wide(ch) {
            if !word.is_empty() {
                tokens.push((std::mem::take(&mut word), std::mem::take(&mut gap)));
            }
            tokens.push((ch.to_string(), std::mem::take(&mut gap)));
        } else {
            word.push(ch);
        }
    }
    if !word.is_empty() {
        tokens.push((word, gap));
    }
    let mut out: Vec<String> = Vec::new();
    let mut current = lead.to_string();
    for (i, (token, before)) in tokens.iter().enumerate() {
        let joined = if i == 0 { format!("{current}{token}") } else { format!("{current}{before}{token}") };
        if i > 0 && display_width(&joined) > width && !current.trim_matches(js_ws).is_empty() {
            out.push(current);
            current = format!("{indent}{token}");
        } else {
            current = joined;
        }
    }
    out.push(current);
    out.join("\n")
}

/// `section(heading, subtitle?)`.
pub fn section(heading: &str, subtitle: Option<&str>) -> Block {
    match subtitle {
        Some(s) if !s.is_empty() => Block(to_ascii(&format!("{heading}\n{s}"))),
        _ => Block(to_ascii(heading)),
    }
}

/// `text(content)`.
pub fn text(content: &str) -> Block {
    Block(to_ascii(content))
}

/// `code(source)`: verbatim.
pub fn code(source: &str) -> Block {
    Block(source.to_string())
}

/// `list(items)`: each item may span lines (pass it with `\n`).
pub fn list<S: AsRef<str>>(items: &[S]) -> Block {
    let hang = " ".repeat(BULLET.len() + 1);
    let rendered: Vec<String> = items
        .iter()
        .map(|item| {
            let mut lines = item.as_ref().split('\n');
            let head = lines.next().unwrap_or("");
            let mut v = vec![format!("{BULLET} {head}")];
            v.extend(lines.map(|l| format!("{hang}{l}")));
            v.join("\n")
        })
        .collect();
    let multiline = rendered.iter().any(|r| r.contains('\n'));
    Block(to_ascii(&rendered.join(if multiline { "\n\n" } else { "\n" })))
}

/// A value in a record: what `String(v)` / `v.join(', ')` gives.
#[derive(Debug, Clone, PartialEq)]
pub enum Field {
    Empty,
    Str(String),
    List(Vec<String>),
}

impl Field {
    fn is_empty(&self) -> bool {
        match self {
            Field::Empty => true,
            Field::Str(s) => s.is_empty(),
            Field::List(v) => v.is_empty(),
        }
    }
    fn render(&self) -> String {
        match self {
            Field::Empty => String::new(),
            Field::Str(s) => s.clone(),
            Field::List(v) => v.join(", "),
        }
    }
    /// A field from a JSON value as JS `String(v)` renders it
    /// (null/undefined/""/[] are empty).
    pub fn from_json(v: &crate::json::Value) -> Field {
        use crate::json::Value;
        match v {
            Value::Null => Field::Empty,
            Value::Array(a) => Field::List(a.iter().map(js_string).collect()),
            other => Field::Str(js_string(other)),
        }
    }
}

impl From<&str> for Field {
    fn from(s: &str) -> Self {
        Field::Str(s.to_string())
    }
}
impl From<String> for Field {
    fn from(s: String) -> Self {
        Field::Str(s)
    }
}
impl From<Option<String>> for Field {
    fn from(s: Option<String>) -> Self {
        s.map(Field::Str).unwrap_or(Field::Empty)
    }
}
impl From<Vec<String>> for Field {
    fn from(v: Vec<String>) -> Self {
        Field::List(v)
    }
}

/// JS `String(v)` for a JSON value.
pub fn js_string(v: &crate::json::Value) -> String {
    use crate::json::Value;
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => crate::json::js_number_to_string(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => s.clone(),
        Value::Array(a) => a.iter().map(|x| if x.is_null() { String::new() } else { js_string(x) }).collect::<Vec<_>>().join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

/// Ordered key/value pairs for `record`.
pub type Fields = Vec<(String, Field)>;

/// `record(obj)` with the keys in the given order; empty values are skipped.
pub fn record(fields: &[(String, Field)]) -> Block {
    record_labeled(fields, &[])
}

/// `record(obj, {labels})`.
pub fn record_labeled(fields: &[(String, Field)], labels: &[(&str, &str)]) -> Block {
    let label = |k: &str| -> String { labels.iter().find(|(a, _)| *a == k).map(|(_, b)| b.to_string()).unwrap_or_else(|| k.to_string()) };
    let keep: Vec<&(String, Field)> = fields.iter().filter(|(_, v)| !v.is_empty()).collect();
    let key_width = keep.iter().map(|(k, _)| js_len(&label(k))).max().unwrap_or(0);
    let lines: Vec<String> = keep.iter().map(|(k, v)| format!("{}{}", pad_end(&format!("{}:", label(k)), key_width + 2), v.render())).collect();
    Block(to_ascii(&lines.join("\n")))
}

/// `record(jsonObject, {fields?})`: render a JSON object's keys (or the
/// listed ones) in order.
pub fn record_json(obj: &crate::json::Value, fields: Option<&[&str]>) -> Block {
    record(&json_fields(obj, fields))
}

/// The `(key, Field)` pairs of a JSON object.
pub fn json_fields(obj: &crate::json::Value, fields: Option<&[&str]>) -> Fields {
    let empty = crate::json::Map::new();
    let map = obj.as_object().unwrap_or(&empty);
    let keys: Vec<String> = match fields {
        Some(f) => f.iter().map(|s| s.to_string()).collect(),
        None => map.keys().cloned().collect(),
    };
    keys.into_iter()
        .map(|k| {
            let v = map.get(&k).map(Field::from_json).unwrap_or(Field::Empty);
            (k, v)
        })
        .collect()
}

/// `records(items)` (block layout): records separated by a blank line.
pub fn records(items: &[Fields]) -> Block {
    let blocks: Vec<String> = items.iter().map(|o| record(o).0).filter(|s| !s.is_empty()).collect();
    Block(blocks.join("\n\n"))
}

/// Options for [`records_inline`].
#[derive(Default)]
pub struct InlineOpts<'a> {
    /// Truncate each line to the wrap width instead of wrapping.
    pub truncate: bool,
    /// Which rows size the lead column (default all).
    pub sizes_column: Option<&'a dyn Fn(usize) -> bool>,
}

/// `records(items, {layout: 'inline'})`: the first field padded to a
/// column, the rest joined with ` - `. Every item lists the same keys.
pub fn records_inline(items: &[Fields], opts: &InlineOpts) -> Block {
    if items.is_empty() || items[0].is_empty() {
        // Commander-free JS: `lead == null` gives an empty block.
        if items.first().map(|f| f.is_empty()).unwrap_or(true) {
            return Block(String::new());
        }
    }
    let leads: Vec<String> = items.iter().map(|o| o.first().map(|(_, v)| if v.is_empty() { String::new() } else { v.render() }).unwrap_or_default()).collect();
    let mut column = 0;
    for (i, l) in leads.iter().enumerate() {
        let sized = opts.sizes_column.map(|f| f(i)).unwrap_or(true);
        if sized {
            column = column.max(display_width(l));
        }
    }
    let column = column.min(INLINE_LEAD_MAX);
    let indent = " ".repeat(column + 2);
    let lines: Vec<String> = items
        .iter()
        .enumerate()
        .map(|(i, o)| {
            let tail = to_ascii(&o.iter().skip(1).filter(|(_, v)| !v.is_empty()).map(|(_, v)| v.render()).collect::<Vec<_>>().join(" - "));
            if tail.is_empty() {
                return to_ascii(&leads[i]);
            }
            let head = to_ascii(&format!("{}  ", pad_end(&leads[i], column)));
            if opts.truncate {
                return truncate_to_width(&format!("{head}{tail}"), WRAP_WIDTH);
            }
            let w = 20usize.max(WRAP_WIDTH.saturating_sub(display_width(&head)));
            let wrapped = wrap_text(&tail, w, "");
            let mut parts = wrapped.split('\n');
            let first = parts.next().unwrap_or("");
            let mut v = vec![format!("{head}{first}")];
            v.extend(parts.map(|l| format!("{indent}{l}")));
            v.join("\n")
        })
        .collect();
    Block(lines.join("\n"))
}

/// `formatDeprecation({replacement, description})`.
pub fn format_deprecation(replacement: &str, description: &str) -> String {
    format!("use {replacement}: {description}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_aligns_keys() {
        let b = record(&[("a".into(), "1".into()), ("long".into(), "2".into()), ("e".into(), Field::Empty)]);
        assert_eq!(b.0, "a:    1\nlong: 2");
    }

    #[test]
    fn emit_joins() {
        assert_eq!(join_blocks(&[text("a"), Block::default(), text("b")]), "a\n\nb");
    }
}
