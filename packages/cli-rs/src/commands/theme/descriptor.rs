//! Port of `readStaticDescriptorValue` (foundation/discovery/theme-discovery.mjs):
//! the static value a typed descriptor default-exports, read from its source
//! without executing it. Theme and icon-set descriptors and icon definitions
//! share this reader.
//!
//! The JS reader parses with Babel; this one parses with oxc. The messages
//! are the JS ones, except the parser's own text after "could not be parsed:".

use crate::json::{Map, Value};
use oxc::allocator::Allocator;
use oxc::ast::ast::{Expression, ExportDefaultDeclarationKind, ObjectPropertyKind, PropertyKey, PropertyKind, Statement};
use oxc::ast::CommentKind;
use oxc::parser::Parser;
use oxc::span::{GetSpan, SourceType};

/// `readStaticDescriptorValue(docPath, label, typeName, {data})`. `Err` is the
/// exact message the JS reader throws.
pub fn read_static_descriptor_value(doc_path: &str, label: &str, type_name: &str, data: bool) -> Result<Value, String> {
    let source = std::fs::read_to_string(doc_path).map_err(|e| {
        format!("ENOENT: no such file or directory, open '{doc_path}'{}", if e.kind() == std::io::ErrorKind::NotFound { "" } else { "" })
    })?;
    read_descriptor_source(&source, label, type_name, data)
}

fn unparen<'a, 'b>(mut e: &'b Expression<'a>) -> &'b Expression<'a> {
    while let Expression::ParenthesizedExpression(p) = e {
        e = &p.expression;
    }
    e
}

pub fn read_descriptor_source(source: &str, label: &str, type_name: &str, data: bool) -> Result<Value, String> {
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, source, SourceType::mjs()).parse();
    if !ret.diagnostics.is_empty() {
        let msg = ret.diagnostics.first().map(|e| e.message.to_string()).unwrap_or_else(|| "Unexpected token".into());
        return Err(format!("{label} could not be parsed: {msg}"));
    }
    let program = &ret.program;
    let mut defaults = Vec::new();
    let mut unsupported = false;
    for st in &program.body {
        match st {
            Statement::ExportDefaultDeclaration(d) => defaults.push(d),
            Statement::EmptyStatement(_) => {}
            _ => unsupported = true,
        }
    }
    if unsupported || !program.directives.is_empty() {
        return Err(format!("{label} must contain only its static default-exported {type_name} object."));
    }
    let object = if defaults.len() == 1 {
        match &defaults[0].declaration {
            ExportDefaultDeclarationKind::FunctionDeclaration(_)
            | ExportDefaultDeclarationKind::ClassDeclaration(_)
            | ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => None,
            other => match unparen(other.to_expression()) {
                Expression::ObjectExpression(o) => Some(o),
                _ => None,
            },
        }
    } else {
        None
    };
    let Some(object) = object else {
        return Err(format!("{label} must default-export one static {type_name} object."));
    };
    if !declares_doc_type(source, program, defaults[0], type_name) {
        return Err(format!("{label} must declare its public {type_name} type from @astryxdesign/cli/authoring."));
    }
    static_object(object, label, data)
}

fn static_object(object: &oxc::ast::ast::ObjectExpression, label: &str, data: bool) -> Result<Value, String> {
    let mut value = Map::new();
    for prop in &object.properties {
        let ObjectPropertyKind::ObjectProperty(p) = prop else {
            return Err(format!("{label} must contain only static object properties."));
        };
        if p.computed || p.method || p.kind != PropertyKind::Init {
            return Err(format!("{label} must contain only static object properties."));
        }
        let key = match &p.key {
            PropertyKey::StaticIdentifier(id) => id.name.to_string(),
            PropertyKey::StringLiteral(s) => s.value.as_str().unwrap_or("\u{fffd}").to_string(),
            _ => return Err(format!("{label} has an invalid property name.")),
        };
        if value.contains_key(&key) {
            return Err(format!("{label} declares \"{key}\" more than once."));
        }
        let v = if data { static_data_value(unparen(&p.value), label)? } else { static_theme_value(unparen(&p.value), label)? };
        value.insert(key, v);
    }
    Ok(Value::Object(value))
}

fn static_theme_value(e: &Expression, label: &str) -> Result<Value, String> {
    match e {
        Expression::StringLiteral(s) => Ok(Value::String(s.value.as_str().unwrap_or("\u{fffd}").to_string())),
        Expression::BooleanLiteral(b) => Ok(Value::Bool(b.value)),
        _ => Err(format!("{label} must use static string and boolean values in its default export.")),
    }
}

fn static_data_value(e: &Expression, label: &str) -> Result<Value, String> {
    match e {
        Expression::StringLiteral(s) => Ok(Value::String(s.value.as_str().unwrap_or("\u{fffd}").to_string())),
        Expression::BooleanLiteral(b) => Ok(Value::Bool(b.value)),
        Expression::ArrayExpression(a) => {
            let mut out = Vec::new();
            for el in &a.elements {
                match el.as_expression() {
                    Some(x) => out.push(static_data_value(unparen(x), label)?),
                    None => {
                        return Err(format!(
                            "{label} must use static strings, booleans, arrays, and objects in its default export."
                        ))
                    }
                }
            }
            Ok(Value::Array(out))
        }
        Expression::ObjectExpression(o) => static_object(o, label, true),
        _ => Err(format!("{label} must use static strings, booleans, arrays, and objects in its default export.")),
    }
}

struct Cmt {
    start: u32,
    end: u32,
    /// The text between the delimiters.
    value: String,
    jsdoc: bool,
}

fn comments_of(source: &str, program: &oxc::ast::ast::Program) -> Vec<Cmt> {
    program
        .comments
        .iter()
        .map(|c| {
            let text = &source[c.span.start as usize..c.span.end as usize];
            let block = matches!(c.kind, CommentKind::SingleLineBlock | CommentKind::MultiLineBlock);
            let value = if block {
                text.strip_prefix("/*").and_then(|t| t.strip_suffix("*/")).unwrap_or(text).to_string()
            } else {
                text.strip_prefix("//").unwrap_or(text).to_string()
            };
            Cmt { start: c.span.start, end: c.span.end, jsdoc: block && value.starts_with('*'), value }
        })
        .collect()
}

/// The end of the last token before `start`: skip whitespace and comments
/// backwards.
fn prev_token_end(source: &str, comments: &[Cmt], start: u32) -> u32 {
    let bytes = source.as_bytes();
    let mut i = start as usize;
    loop {
        if i == 0 {
            return 0;
        }
        if let Some(c) = comments.iter().find(|c| c.end as usize == i) {
            i = c.start as usize;
            continue;
        }
        let ch = source[..i].chars().next_back().unwrap();
        if ch.is_whitespace() || ch == '\u{feff}' {
            i -= ch.len_utf8();
            continue;
        }
        let _ = bytes;
        return i as u32;
    }
}

fn declares_doc_type(source: &str, program: &oxc::ast::ast::Program, export_default: &oxc::ast::ast::ExportDefaultDeclaration, type_name: &str) -> bool {
    let comments = comments_of(source, program);
    let jsdoc_before = |start: u32| -> Option<&Cmt> {
        let after = prev_token_end(source, &comments, start);
        comments.iter().filter(|c| c.jsdoc && c.start >= after && c.end <= start).last()
    };
    let mut attached: Vec<(Option<&Cmt>, &[&str])> = vec![(jsdoc_before(export_default.span.start), &["type"])];
    let mut node: Option<&Expression> = match &export_default.declaration {
        ExportDefaultDeclarationKind::FunctionDeclaration(_)
        | ExportDefaultDeclarationKind::ClassDeclaration(_)
        | ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => None,
        other => Some(other.to_expression()),
    };
    while let Some(Expression::ParenthesizedExpression(p)) = node {
        attached.push((jsdoc_before(p.span().start), &["type", "satisfies"]));
        node = Some(&p.expression);
    }
    let aliases = jsdoc_aliases(&comments, type_name);
    attached.iter().any(|(c, tags)| {
        let Some(c) = c else { return false };
        let found = jsdoc_tags(&c.value);
        tags.iter().any(|name| {
            let tag = found.iter().find(|t| t.0 == *name);
            tag.and_then(|t| braced_type(&t.1)).is_some_and(|(ty, _)| is_doc_type(&ty, &aliases, type_name, &mut Vec::new()))
        })
    })
}

fn is_space(c: char) -> bool {
    c == ' ' || c == '\t'
}

/// `jsdocTags`: (name, text) per tag.
fn jsdoc_tags(value: &str) -> Vec<(String, String)> {
    let body: Vec<char> = value.chars().skip(1).collect();
    let mut starts: Vec<usize> = Vec::new();
    let (mut line_start, mut saw_asterisk, mut in_tag, mut backticks) = (true, true, false, false);
    let mut i = 0;
    while i < body.len() {
        let ch = body[i];
        if ch == '\n' || ch == '\r' {
            line_start = true;
            saw_asterisk = false;
            backticks = false;
            i += 1;
            continue;
        }
        if line_start {
            if is_space(ch) {
                i += 1;
                continue;
            }
            if ch == '*' && !saw_asterisk {
                saw_asterisk = true;
                i += 1;
                continue;
            }
            line_start = false;
            if ch == '@' {
                starts.push(i);
                in_tag = true;
                i += 1;
                continue;
            }
        }
        if ch == '`' && in_tag {
            backticks = !backticks;
        } else if ch == '@'
            && !backticks
            && i > 0
            && is_space(body[i - 1])
            && !body.get(i + 1).copied().unwrap_or(' ').is_whitespace()
        {
            starts.push(i);
            in_tag = true;
            backticks = false;
        }
        i += 1;
    }
    starts
        .iter()
        .enumerate()
        .map(|(pos, &start)| {
            let end = starts.get(pos + 1).copied().unwrap_or(body.len());
            let raw: String = body[start + 1..end].iter().collect();
            let name: String = raw.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '$').collect();
            let rest = &raw[name.len()..];
            // replace(/(\r?\n)[ \t]*\*?/g, '$1')
            let mut text = String::new();
            let rc: Vec<char> = rest.chars().collect();
            let mut j = 0;
            while j < rc.len() {
                let nl = if rc[j] == '\r' && rc.get(j + 1) == Some(&'\n') {
                    Some(2)
                } else if rc[j] == '\n' {
                    Some(1)
                } else {
                    None
                };
                if let Some(n) = nl {
                    for k in 0..n {
                        text.push(rc[j + k]);
                    }
                    j += n;
                    while j < rc.len() && is_space(rc[j]) {
                        j += 1;
                    }
                    if j < rc.len() && rc[j] == '*' {
                        j += 1;
                    }
                } else {
                    text.push(rc[j]);
                    j += 1;
                }
            }
            (name, text)
        })
        .collect()
}

/// `bracedType`: the braced type (whitespace removed) and what follows.
fn braced_type(text: &str) -> Option<(String, String)> {
    let chars: Vec<char> = text.chars().collect();
    let open = chars.iter().position(|c| !c.is_whitespace())?;
    if chars[open] != '{' {
        return None;
    }
    let mut depth = 0i32;
    let mut quote: Option<char> = None;
    for i in open..chars.len() {
        let ch = chars[i];
        if let Some(q) = quote {
            if ch == q {
                quote = None;
            }
        } else if ch == '\'' || ch == '"' || ch == '`' {
            quote = Some(ch);
        } else if ch == '{' {
            depth += 1;
        } else if ch == '}' {
            depth -= 1;
            if depth == 0 {
                let ty: String = chars[open + 1..i].iter().filter(|c| !c.is_whitespace()).collect();
                return Some((ty, chars[i + 1..].iter().collect()));
            }
        }
    }
    None
}

fn split_type(ty: &str, op: char) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut quote: Option<char> = None;
    let mut cur = String::new();
    for ch in ty.chars() {
        if let Some(q) = quote {
            if ch == q {
                quote = None;
            }
        } else if ch == '\'' || ch == '"' || ch == '`' {
            quote = Some(ch);
        } else if "([{<".contains(ch) {
            depth += 1;
        } else if ")]}>".contains(ch) {
            depth -= 1;
        } else if ch == op && depth == 0 {
            parts.push(std::mem::take(&mut cur));
            continue;
        }
        cur.push(ch);
    }
    parts.push(cur);
    parts
}

fn wrapped_in_parens(ty: &str) -> bool {
    if !ty.starts_with('(') || !ty.ends_with(')') {
        return false;
    }
    let mut depth = 0;
    let n = ty.chars().count();
    for (i, c) in ty.chars().enumerate() {
        if c == '(' {
            depth += 1;
        } else if c == ')' {
            depth -= 1;
            if depth == 0 {
                return i == n - 1;
            }
        }
    }
    false
}

fn authoring_type(ty: &str, type_name: &str) -> bool {
    for q in ['\'', '"'] {
        if ty == format!("import({q}@astryxdesign/cli/authoring{q}).{type_name}") {
            return true;
        }
    }
    false
}

fn is_doc_type(ty: &str, aliases: &[(String, String)], type_name: &str, seen: &mut Vec<String>) -> bool {
    let mut current = ty.to_string();
    loop {
        if current.starts_with('!') || current.starts_with('?') {
            current = current[1..].to_string();
        } else if current.ends_with('=') {
            current.pop();
        } else if wrapped_in_parens(&current) {
            current = current[1..current.len() - 1].to_string();
        } else {
            break;
        }
    }
    let members: Vec<String> = split_type(&current, '|').into_iter().filter(|m| m != "null" && m != "undefined").collect();
    if members.len() != 1 {
        return false;
    }
    if members[0] != current {
        return is_doc_type(&members[0], aliases, type_name, seen);
    }
    let parts: Vec<String> = split_type(&current, '&').into_iter().filter(|p| p != "{}").collect();
    if parts.len() != 1 {
        return false;
    }
    if parts[0] != current {
        return is_doc_type(&parts[0], aliases, type_name, seen);
    }
    if authoring_type(&current, type_name) {
        return true;
    }
    let Some(named) = aliases.iter().rev().find(|(k, _)| *k == current).map(|(_, v)| v.clone()) else { return false };
    if seen.contains(&current) {
        return false;
    }
    seen.push(current);
    is_doc_type(&named, aliases, type_name, seen)
}

fn ident_prefix(s: &str) -> Option<(String, &str)> {
    let mut it = s.char_indices();
    let (_, first) = it.next()?;
    if !(first == '$' || first == '_' || first.is_ascii_alphabetic()) {
        return None;
    }
    let end = s.char_indices().find(|(_, c)| !(c.is_ascii_alphanumeric() || *c == '_' || *c == '$')).map(|(i, _)| i).unwrap_or(s.len());
    Some((s[..end].to_string(), &s[end..]))
}

/// Strip `from '@astryxdesign/cli/authoring'` (either quote) at the start.
fn from_authoring(s: &str) -> bool {
    let t = s.trim_start();
    let Some(t) = t.strip_prefix("from") else { return false };
    let t = t.trim_start();
    t.starts_with("'@astryxdesign/cli/authoring'") || t.starts_with("\"@astryxdesign/cli/authoring\"")
}

fn jsdoc_aliases(comments: &[Cmt], type_name: &str) -> Vec<(String, String)> {
    let mut aliases: Vec<(String, String)> = Vec::new();
    let mut set = |k: String, v: String| {
        aliases.retain(|(a, _)| *a != k);
        aliases.push((k, v));
    };
    let theme = format!("import('@astryxdesign/cli/authoring').{type_name}");
    for c in comments.iter().filter(|c| c.jsdoc) {
        for (name, text) in jsdoc_tags(&c.value) {
            if name == "typedef" {
                if let Some((ty, rest)) = braced_type(&text) {
                    if let Some((n, _)) = ident_prefix(rest.trim_start()) {
                        set(n, ty);
                    }
                }
            } else if name == "import" {
                let t = text.trim_start();
                if let Some(inner) = t.strip_prefix('{') {
                    if let Some(close) = inner.find('}') {
                        let list = &inner[..close];
                        if !list.contains('{') && from_authoring(&inner[close + 1..]) {
                            for spec in list.split(',') {
                                let sp = spec.trim();
                                let sp = sp.strip_prefix("type").filter(|r| r.starts_with(char::is_whitespace)).map(str::trim_start).unwrap_or(sp);
                                if let Some(rest) = sp.strip_prefix(type_name) {
                                    let rest = rest.trim();
                                    if rest.is_empty() {
                                        set(type_name.to_string(), theme.clone());
                                    } else if let Some(alias) = rest.strip_prefix("as").filter(|r| r.starts_with(char::is_whitespace)) {
                                        if let Some((a, tail)) = ident_prefix(alias.trim_start()) {
                                            if tail.trim().is_empty() {
                                                set(a, theme.clone());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if let Some(rest) = t.strip_prefix('*') {
                    let rest = rest.trim_start();
                    if let Some(rest) = rest.strip_prefix("as").filter(|r| r.starts_with(char::is_whitespace)) {
                        if let Some((ns, tail)) = ident_prefix(rest.trim_start()) {
                            if tail.starts_with(char::is_whitespace) && from_authoring(tail) {
                                set(format!("{ns}.{type_name}"), theme.clone());
                            }
                        }
                    }
                }
            }
        }
    }
    aliases
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_typed_descriptor() {
        let src = "// c\n\n/** @type {import('@astryxdesign/cli/authoring').IconDefinitionDoc} */\nexport default {\n  type: 'icon-definition',\n  name: 'activity',\n  words: ['pulse', 'live'],\n};\n";
        let v = read_descriptor_source(src, "L", "IconDefinitionDoc", true).unwrap();
        assert_eq!(v["words"][1], "live");
        let e = read_descriptor_source(src, "L", "ThemeDoc", true).unwrap_err();
        assert_eq!(e, "L must declare its public ThemeDoc type from @astryxdesign/cli/authoring.");
        let e = read_descriptor_source(src, "L", "IconDefinitionDoc", false).unwrap_err();
        assert_eq!(e, "L must use static string and boolean values in its default export.");
        let e = read_descriptor_source("export default {a: 1};", "L", "X", false).unwrap_err();
        assert_eq!(e, "L must declare its public X type from @astryxdesign/cli/authoring.");
        let e = read_descriptor_source("const a = 1; export default {};", "L", "X", false).unwrap_err();
        assert_eq!(e, "L must contain only its static default-exported X object.");
        let src2 = "/** @import {IconSetDoc as D} from '@astryxdesign/cli/authoring' */\n/** @type {D} */\nexport default ({name: 'x'});\n";
        assert!(read_descriptor_source(src2, "L", "IconSetDoc", false).is_ok());
    }
}

#[cfg(test)]
mod oracle {
    #[test]
    fn matches_js_reads() {
        let Ok(text) = std::fs::read_to_string("/tmp/defs.json") else { return };
        let want: serde_json::Value = serde_json::from_str(&text).unwrap();
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../cli/assets/icons/definitions");
        for (f, v) in want.as_object().unwrap() {
            let (path, ty, data) = if f.starts_with('/') { (f.clone(), "IconSetDoc", false) } else { (format!("{dir}/{f}"), "IconDefinitionDoc", true) };
            let got = super::read_static_descriptor_value(&path, "L", ty, data).unwrap();
            assert_eq!(&got, v, "{f}");
        }
    }
}
