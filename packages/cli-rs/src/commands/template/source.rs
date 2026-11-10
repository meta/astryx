//! Template source rewrites: demo media and demo content replacement, and the
//! components a source composes. Port of the matching parts of
//! foundation/discovery/template-adapter.mjs.

use super::ApiError;

const PLACEHOLDER_IMAGE: &str = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20300%22%20preserveAspectRatio%3D%22xMidYMid%20slice%22%3E%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23f5f6f8%22%2F%3E%3Cg%20transform%3D%22translate%28200%20150%29%22%20fill%3D%22none%22%20stroke%3D%22%23c2cad6%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%22-44%22%20y%3D%22-44%22%20width%3D%2288%22%20height%3D%2288%22%20rx%3D%2216%22%2F%3E%3Ccircle%20cx%3D%2218%22%20cy%3D%22-18%22%20r%3D%222.5%22%20fill%3D%22%23c2cad6%22%20stroke%3D%22none%22%2F%3E%3Cpath%20d%3D%22M-34%2030%20L-8%200%20L10%2018%20L20%208%20L34%2024%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E";

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mov", "ogv", "m4v"];
const IMAGE_EXTENSIONS: &[&str] = &["svg", "png", "jpg", "jpeg", "gif", "webp", "avif", "ico"];
const FIXTURE_SEGMENT: &str = "template-assets";
pub const DEMO_CONTENT_MODULE: &str = "@astryx-docs/demo-content";

/// JS `/\s/u`.
pub fn js_space(c: char) -> bool {
    matches!(
        c,
        '\u{9}' | '\u{a}' | '\u{b}' | '\u{c}' | '\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

fn is_token_delim(c: Option<char>) -> bool {
    match c {
        None => true,
        Some(c) => js_space(c) || "'\"`()<>{}[]\\|^".contains(c),
    }
}
fn is_text_delim(c: Option<char>) -> bool {
    match c {
        None => true,
        Some(c) => js_space(c) || c == '<' || c == '>',
    }
}
fn closing_of(c: Option<char>) -> Option<char> {
    match c? {
        '\'' => Some('\''),
        '"' => Some('"'),
        '`' => Some('`'),
        '(' => Some(')'),
        _ => None,
    }
}
fn is_closer(c: Option<char>) -> bool {
    matches!(c, Some('\'') | Some('"') | Some('`') | Some(')'))
}

fn st(v: &[char], a: usize, b: usize) -> String {
    v[a.min(v.len())..b.min(v.len())].iter().collect()
}

fn absolute_url(token: &str) -> bool {
    let mut it = token.chars();
    match it.next() {
        Some(c) if c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    for c in it {
        if c == ':' {
            return true;
        }
        if !(c.is_ascii_alphanumeric() || c == '+' || c == '.' || c == '-') {
            return false;
        }
    }
    false
}

fn relative_prefix(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || "_.~%@/-".contains(c))
}

/// The path segments of a root-relative URL under the fixture folder.
fn fixture_segments(reference: &str) -> Option<Vec<String>> {
    if !reference.starts_with('/') || reference.starts_with("//") {
        return None;
    }
    // WHATWG URL path parsing, enough for these tokens.
    let cleaned: String = reference.chars().filter(|c| !matches!(c, '\t' | '\n' | '\r')).collect();
    let cleaned = cleaned.replace('\\', "/");
    if cleaned.starts_with("//") {
        return None;
    }
    let path_part = cleaned.split(|c| c == '?' || c == '#').next().unwrap_or("");
    let raw: Vec<&str> = path_part[1..].split('/').collect();
    let mut out: Vec<String> = Vec::new();
    let n = raw.len();
    for (i, seg) in raw.iter().enumerate() {
        let lower = seg.to_ascii_lowercase();
        let single = lower == "." || lower == "%2e";
        let double = matches!(lower.as_str(), ".." | ".%2e" | "%2e." | "%2e%2e");
        let last = i + 1 == n;
        if double {
            out.pop();
            if last {
                out.push(String::new());
            }
        } else if single {
            if last {
                out.push(String::new());
            }
        } else {
            out.push(encode_path_segment(seg));
        }
    }
    let mut segs = vec![String::new()];
    segs.extend(out);
    if segs.get(1).map(|s| s.as_str()) == Some(FIXTURE_SEGMENT) {
        Some(segs)
    } else {
        None
    }
}

fn encode_path_segment(seg: &str) -> String {
    let mut o = String::new();
    for c in seg.chars() {
        if (c as u32) < 0x20 || c as u32 == 0x7f || " \"#<>?`{}^".contains(c) || (c as u32) > 0x7e {
            let mut buf = [0u8; 4];
            for b in c.encode_utf8(&mut buf).bytes() {
                o.push_str(&format!("%{b:02X}"));
            }
        } else {
            o.push(c);
        }
    }
    o
}

fn display_reference(v: &[char], at: usize) -> String {
    let mut end = at;
    while end < v.len() && !(js_space(v[end]) || "'\"`<>".contains(v[end])) {
        end += 1;
    }
    st(v, at, end)
}

fn unsafe_fixture(v: &[char], at: usize, reason: &str) -> String {
    format!(
        "Template asset reference {} cannot be replaced safely: {reason}. Use the complete path as one static string.",
        display_reference(v, at)
    )
}

fn module_specifier_lead(s: &str) -> bool {
    let mut t = s.strip_suffix('(').unwrap_or(s);
    t = t.trim_end_matches(js_space);
    for kw in ["from", "import", "require"] {
        if let Some(before) = t.strip_suffix(kw) {
            match before.chars().last() {
                None => return true,
                Some(c) if !(c.is_ascii_alphanumeric() || c == '_' || c == '$') => return true,
                _ => {}
            }
        }
    }
    // `\s*\(?$` also matches when a `(` is followed by nothing but the
    // keyword lead; handled by the strip above.
    false
}

fn expression_use(v: &[char], open: usize, close: usize) -> Option<&'static str> {
    let mut prev = open as isize - 1;
    while prev >= 0 && js_space(v[prev as usize]) {
        prev -= 1;
    }
    let mut next = close + 1;
    while next < v.len() && js_space(v[next]) {
        next += 1;
    }
    let at = |i: isize| if i >= 0 && (i as usize) < v.len() { Some(v[i as usize]) } else { None };
    if at(prev) == Some('+') || (at(prev) == Some('=') && at(prev - 1) == Some('+')) || v.get(next) == Some(&'+') {
        return Some("the string is concatenated with another value");
    }
    if v.get(next) == Some(&'.') && v.get(next + 1).map_or(false, |c| c.is_ascii_alphabetic() || *c == '_' || *c == '$') {
        return Some("a method is called on the string");
    }
    let from = (prev - 16).max(0) as usize;
    let to = (prev + 1).max(0) as usize;
    if module_specifier_lead(&st(v, from, to)) {
        return Some("it is imported as a module");
    }
    None
}

enum Edit {
    None,
    Some(String, usize),
}

fn fixture_edit(v: &[char], start: usize, at: usize, end: usize, video: &str) -> Result<Edit, String> {
    let token = st(v, start, end);
    if absolute_url(&token) {
        return Ok(Edit::None);
    }
    let get = |i: isize| if i >= 0 && (i as usize) < v.len() { Some(v[i as usize]) } else { None };
    if !token.starts_with('/') {
        if fixture_segments(&st(v, at, end)).is_none() {
            return Ok(Edit::None);
        }
        if get(start as isize - 1) != Some('\\') && relative_prefix(&st(v, start, at)) {
            return Ok(Edit::None);
        }
        return Err(unsafe_fixture(v, at, "it is joined to text the copy cannot parse"));
    }
    let before = get(start as isize - 1);
    let after = get(end as isize);
    if after == Some('{') && token.ends_with('$') {
        if fixture_segments(&token[..token.len() - 1]).is_none() {
            return Ok(Edit::None);
        }
        return Err(unsafe_fixture(v, at, "it is built by a template-literal interpolation"));
    }
    let quoted = before.is_some() && closing_of(before) == after;
    let escaped_quoted = matches!(before, Some('\'') | Some('"'))
        && get(start as isize - 2) == Some('\\')
        && after == Some('\\')
        && get(end as isize + 1) == before;
    let whole = quoted || escaped_quoted;
    let mut reference_end = end;
    if !whole {
        while reference_end > at && ".,;:!?".contains(v[reference_end - 1]) {
            reference_end -= 1;
        }
    }
    let Some(segments) = fixture_segments(&st(v, start, reference_end)) else { return Ok(Edit::None) };
    let in_text = (is_text_delim(before) || closing_of(before).is_some())
        && (is_text_delim(after) || is_closer(after))
        && (is_text_delim(before) || is_text_delim(after));
    if !whole && !in_text {
        return Err(unsafe_fixture(v, at, "it is not a whole quoted, url(), or text value"));
    }
    if quoted && before != Some('(') {
        if let Some(u) = expression_use(v, start - 1, end) {
            return Err(unsafe_fixture(v, at, u));
        }
    }
    let last = segments.last().cloned().unwrap_or_default();
    let ext = super::fsutil::extname(&last).trim_start_matches('.').to_lowercase();
    let ext = if super::fsutil::extname(&last).is_empty() { String::new() } else { ext };
    if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        return Ok(Edit::Some(video.to_string(), reference_end));
    }
    if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return Ok(Edit::Some(PLACEHOLDER_IMAGE.to_string(), reference_end));
    }
    if whole || !ext.is_empty() {
        return Err(format!(
            "Unrecognized template asset format {} for {}",
            if ext.is_empty() { "(none)".to_string() } else { ext },
            display_reference(v, at)
        ));
    }
    Ok(Edit::None)
}

fn find(v: &[char], needle: &[char], from: usize) -> Option<usize> {
    if needle.len() > v.len() {
        return None;
    }
    (from..=v.len() - needle.len()).find(|&i| &v[i..i + needle.len()] == needle)
}

/// `replaceDemoMedia`.
pub fn replace_demo_media(source: &str, video: &str) -> Result<(String, usize), String> {
    let v: Vec<char> = source.chars().collect();
    let needle: Vec<char> = format!("/{FIXTURE_SEGMENT}").chars().collect();
    let mut output = String::new();
    let mut copied = 0usize;
    let mut count = 0usize;
    let mut comments: Option<Vec<(usize, usize)>> = None;
    let mut at_opt = find(&v, &needle, 0);
    while let Some(at) = at_opt {
        let mut start = at;
        while start > 0 && !is_token_delim(Some(v[start - 1])) {
            start -= 1;
        }
        let mut end = at + needle.len();
        while end < v.len() && !is_token_delim(Some(v[end])) {
            end += 1;
        }
        let edit = match fixture_edit(&v, start, at, end, video) {
            Ok(e) => e,
            Err(msg) => {
                let c = comments.get_or_insert_with(|| comment_ranges(source));
                if !c.iter().any(|(f, t)| *f <= at && at < *t) {
                    return Err(msg);
                }
                Edit::None
            }
        };
        if let Edit::Some(text, e) = edit {
            output.push_str(&st(&v, copied, start));
            output.push_str(&text);
            copied = e;
            count += 1;
        }
        at_opt = find(&v, &needle, end);
    }
    output.push_str(&st(&v, copied, v.len()));
    Ok((output, count))
}

/// Char-index ranges of every comment, or none when the source does not parse.
fn comment_ranges(source: &str) -> Vec<(usize, usize)> {
    use oxc::allocator::Allocator;
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, source, SourceType::tsx()).parse();
    if ret.diagnostics.has_errors() {
        return Vec::new();
    }
    let map = byte_to_char(source);
    ret.program.comments.iter().map(|c| (map[c.span.start as usize], map[c.span.end as usize])).collect()
}

/// Byte offset -> char index table (length = bytes + 1).
pub fn byte_to_char(s: &str) -> Vec<usize> {
    let mut m = vec![0usize; s.len() + 1];
    let mut ci = 0;
    for (bi, ch) in s.char_indices() {
        for k in 0..ch.len_utf8() {
            m[bi + k] = ci;
        }
        ci += 1;
    }
    m[s.len()] = ci;
    m
}

/// `replaceTemplateDemos`: (source, demoContentReplaced, demoMediaReplaced).
pub fn replace_template_demos(source: &str) -> Result<(String, usize, usize), ApiError> {
    let (with_content, content) = super::demo_content::replace_demo_content(source).map_err(|m| ApiError::new(&m, ""))?;
    let (out, media) = replace_demo_media(&with_content, "").map_err(|m| ApiError::new(&m, ""))?;
    Ok((out, content, media))
}

const UBIQUITOUS: &[&str] = &["Text", "Heading", "Button", "HStack", "VStack", "Link", "StackItem", "Icon"];
const PART_SUFFIXES: &[&str] = &[
    "Item", "Section", "Header", "Content", "Footer", "Panel", "Heading", "CollapseButton", "Column", "Sortable",
    "Selection", "Group", "Source",
];

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// The JSX tag names `/(?<![\w$.])<(XDS)?([A-Z]\w+)/g` finds (group 2).
pub fn jsx_tags(src: &str) -> Vec<String> {
    let v: Vec<char> = src.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < v.len() {
        if v[i] == '<' && !(i > 0 && (is_word(v[i - 1]) || v[i - 1] == '$' || v[i - 1] == '.')) {
            let s = i + 1;
            let word_end = |from: usize| {
                let mut e = from;
                while e < v.len() && is_word(v[e]) {
                    e += 1;
                }
                e
            };
            // Try with the XDS prefix first, then without.
            let mut matched: Option<(usize, usize)> = None;
            if v.len() >= s + 3 && v[s] == 'X' && v[s + 1] == 'D' && v[s + 2] == 'S' {
                let n = s + 3;
                if n < v.len() && v[n].is_ascii_uppercase() {
                    let e = word_end(n + 1);
                    if e > n + 1 {
                        matched = Some((n, e));
                    }
                }
            }
            if matched.is_none() && s < v.len() && v[s].is_ascii_uppercase() {
                let e = word_end(s + 1);
                if e > s + 1 {
                    matched = Some((s, e));
                }
            }
            if let Some((a, e)) = matched {
                out.push(st(&v, a, e));
                i = e;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// Top-level declared names and Astryx named imports (local -> imported).
fn top_level_bindings(src: &str) -> (std::collections::HashSet<String>, std::collections::HashMap<String, String>) {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::{BindingPattern, Declaration, ExportDefaultDeclarationKind, ImportDeclarationSpecifier, Statement};
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    let mut names = std::collections::HashSet::new();
    let mut imports = std::collections::HashMap::new();
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, src, SourceType::tsx()).parse();
    let decl_names = |d: &Declaration, names: &mut std::collections::HashSet<String>| match d {
        Declaration::FunctionDeclaration(f) => {
            if let Some(id) = &f.id {
                names.insert(id.name.to_string());
            }
        }
        Declaration::ClassDeclaration(c) => {
            if let Some(id) = &c.id {
                names.insert(id.name.to_string());
            }
        }
        Declaration::VariableDeclaration(vd) => {
            for d in &vd.declarations {
                if let BindingPattern::BindingIdentifier(id) = &d.id {
                    names.insert(id.name.to_string());
                }
            }
        }
        _ => {}
    };
    for stmt in &ret.program.body {
        match stmt {
            Statement::ImportDeclaration(imp) => {
                if !imp.source.value.as_str().unwrap_or("").starts_with("@astryxdesign/") {
                    continue;
                }
                if let Some(specs) = &imp.specifiers {
                    for sp in specs {
                        if let ImportDeclarationSpecifier::ImportSpecifier(s) = sp {
                            imports.insert(s.local.name.to_string(), s.imported.name().to_string());
                        }
                    }
                }
            }
            Statement::ExportDeclaration(e) => decl_names(&e.declaration, &mut names),
            Statement::ExportDefaultDeclaration(e) => match &e.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(f) => {
                    if let Some(id) = &f.id {
                        names.insert(id.name.to_string());
                    }
                }
                ExportDefaultDeclarationKind::ClassDeclaration(c) => {
                    if let Some(id) = &c.id {
                        names.insert(id.name.to_string());
                    }
                }
                _ => {}
            },
            other => {
                if let Some(d) = other.as_declaration() {
                    decl_names(d, &mut names);
                }
            }
        }
    }
    (names, imports)
}

fn strip_part_suffix(n: &str) -> String {
    let chars: Vec<(usize, char)> = n.char_indices().collect();
    for (k, (bi, _)) in chars.iter().enumerate() {
        if k == 0 {
            continue;
        }
        let rest = &n[*bi..];
        if PART_SUFFIXES.contains(&rest) {
            return n[..*bi].to_string();
        }
    }
    n.to_string()
}

/// `catalogNames`.
pub fn catalog_names(names: Vec<String>) -> Vec<String> {
    let mut seen = indexmap::IndexSet::new();
    for n in names {
        if n == "Theme" || n == "ThemeProvider" || UBIQUITOUS.contains(&n.as_str()) {
            continue;
        }
        let s = strip_part_suffix(&n);
        if !s.is_empty() {
            seen.insert(s);
        }
    }
    let mut v: Vec<String> = seen.into_iter().collect();
    v.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    v
}

/// `componentsInSource`.
pub fn components_in_source(src: &str) -> Vec<String> {
    let tags = jsx_tags(src);
    let (declared, imports) = top_level_bindings(src);
    catalog_names(
        tags.into_iter().filter(|n| !declared.contains(n)).map(|n| imports.get(&n).cloned().unwrap_or(n)).collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tags() {
        assert_eq!(jsx_tags("return <XDSSection a><Foo/> useState<Set<x>>"), vec!["Section", "Foo"]);
        assert_eq!(strip_part_suffix("ListItem"), "List");
        assert_eq!(strip_part_suffix("Section"), "Section");
        assert_eq!(components_in_source("import {Text as T} from '@astryxdesign/core';\nfunction Local(){}\nconst x = <Card><T/><Local/><TableHeader/></Card>"), vec!["Card", "Table"]);
    }
    #[test]
    fn media() {
        let (s, n) = replace_demo_media("<img src=\"/template-assets/a.png\" /><video src='/template-assets/v.mp4'/>", "").unwrap();
        assert_eq!(n, 2);
        assert!(s.contains("data:image/svg+xml"));
        assert!(s.contains("src=''"));
    }
}
