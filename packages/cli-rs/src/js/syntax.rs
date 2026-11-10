//! Syntax-error messages as Node shows them: V8's wording for a native
//! import, jiti's (babel's) wording and position for a jiti load.
//!
//! oxc finds the first error; its kind and the token at its position map to
//! the message the reference parser gives for that shape. The shapes and
//! their reference messages live in `testdata/syntax.json`.

use oxc::allocator::Allocator;
use oxc::parser::Parser;
use oxc::semantic::SemanticBuilder;
use oxc::span::SourceType;
use std::path::Path;

/// Which parser's wording to copy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    /// V8, parsing an ES module.
    V8Module,
    /// V8, parsing a CommonJS script.
    V8Script,
    /// jiti (babel), any source.
    Jiti,
}

/// The first syntax error in `source` as `(name, message)`, or `None` when
/// oxc finds none.
pub fn syntax_error(source: &str, path: &Path, dialect: Dialect, ts: bool, jsx: bool) -> Option<(String, String)> {
    let allocator = Allocator::default();
    let mut st = if ts { SourceType::ts() } else if dialect == Dialect::V8Script { SourceType::cjs() } else { SourceType::mjs() };
    st = st.with_jsx(jsx);
    let normalized = if dialect == Dialect::Jiti { babel_normalize(source, ts, jsx) } else { None };
    if let Some(n) = &normalized {
        let a = Allocator::default();
        if Parser::new(&a, n, st).parse().diagnostics.is_empty() {
            return None;
        }
    }
    let ret = Parser::new(&allocator, source, st).parse();
    // babel reads `}` and `>` in JSX text as text; oxc reports them.
    let lenient = |m: &str| jsx && dialect == Dialect::Jiti && m.contains("Did you mean `{'");
    if dialect == Dialect::Jiti && jsx && !ret.diagnostics.is_empty() {
        if let Some(pos) = babel_unterminated_jsx(source) {
            let (line, col) = line_col(source, pos);
            return Some(("Error".into(), format!("ParseError: Unterminated JSX contents.  \n {}:{line}:{col}", path.display())));
        }
    }
    let first = ret.diagnostics.iter().find(|d| !lenient(&d.message));
    let (message, labels): (String, Vec<(usize, usize)>) = match first {
        Some(d) => (d.message.to_string(), d.labels.iter().map(|l| (l.offset() as usize, l.len() as usize)).collect()),
        None => {
            let sem = SemanticBuilder::new().with_check_syntax_error(true).build(&ret.program);
            let d = sem.diagnostics.into_iter().next()?;
            (d.message.to_string(), d.labels.iter().map(|l| (l.offset() as usize, l.len() as usize)).collect())
        }
    };
    let at = labels.first().map(|l| l.0).unwrap_or(0).min(source.len());
    Some(match dialect {
        Dialect::Jiti => {
            JSX_ON.with(|j| j.set(jsx));
            let (msg, pos) = babel_message(source, &message, &labels, at);
            let (line, col) = line_col(source, pos);
            ("Error".into(), format!("ParseError: {msg}  \n {}:{line}:{col}", path.display()))
        }
        _ => ("SyntaxError".into(), v8_message(source, &message, &labels, at, dialect)),
    })
}

/// babel's own parse error for `source` (what jiti's babel throws before
/// jiti rewords it): the message without its `(line:column)` suffix, the
/// 1-based line and the 0-based column. `None` when the source parses.
pub fn babel_error(source: &str, ts: bool, jsx: bool) -> Option<(String, usize, usize)> {
    let (_, m) = syntax_error(source, Path::new(""), Dialect::Jiti, ts, jsx)?;
    let body = m.strip_prefix("ParseError: ")?;
    let (msg, loc) = body.split_once("  \n ")?;
    let mut parts = loc.rsplitn(3, ':');
    let col = parts.next()?.parse().ok()?;
    let line = parts.next()?.parse().ok()?;
    Some((msg.to_string(), line, col))
}

/// 1-based line and 0-based UTF-16 column of a byte offset, as babel counts.
fn line_col(src: &str, pos: usize) -> (usize, usize) {
    let mut line = 1;
    let mut col = 0;
    let mut chars = src[..pos.min(src.len())].chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\r' => {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                }
                line += 1;
                col = 0;
            }
            '\n' | '\u{2028}' | '\u{2029}' => {
                line += 1;
                col = 0;
            }
            c => col += c.len_utf16(),
        }
    }
    (line, col)
}

#[derive(Debug, PartialEq)]
enum Tok {
    Eof,
    Ident(String),
    Keyword(String),
    StrictReserved,
    Await,
    Number,
    Str,
    Template,
    Punct(String),
    Invalid,
}

const KEYWORDS: &[&str] = &[
    "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else",
    "export", "extends", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "return",
    "super", "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with", "null", "true",
    "false", "enum",
];
const STRICT_RESERVED: &[&str] =
    &["implements", "interface", "let", "package", "private", "protected", "public", "static", "yield"];
const PUNCTS: &[&str] = &[
    ">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=", "=>", "==", "!=", "<=", ">=",
    "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "**", "{",
    "}", "(", ")", "[", "]", ";", ",", "<", ">", "+", "-", "*", "/", "%", "&", "|", "^", "!", "~", "?", ":",
    "=", ".",
];

fn is_id_start(c: char) -> bool {
    c == '$' || c == '_' || c.is_alphabetic()
}

fn is_id_part(c: char) -> bool {
    is_id_start(c) || c.is_alphanumeric() || c == '\u{200c}' || c == '\u{200d}'
}

/// Skip whitespace and comments from `pos`.
fn skip_trivia(src: &str, mut pos: usize) -> usize {
    let b = src.as_bytes();
    loop {
        let rest = &src[pos..];
        let Some(c) = rest.chars().next() else { return pos };
        if c.is_whitespace() || c == '\u{feff}' {
            pos += c.len_utf8();
        } else if rest.starts_with("//") {
            pos += rest.find(['\n', '\r']).unwrap_or(rest.len());
        } else if rest.starts_with("/*") {
            pos += rest[2..].find("*/").map(|i| i + 4).unwrap_or(rest.len());
        } else {
            let _ = b;
            return pos;
        }
    }
}

fn token_at(src: &str, pos: usize) -> Tok {
    let rest = &src[pos.min(src.len())..];
    let Some(c) = rest.chars().next() else { return Tok::Eof };
    if is_id_start(c) || c == '\\' && rest.starts_with("\\u") {
        let word: String = rest.chars().take_while(|c| is_id_part(*c)).collect();
        return if word == "await" {
            Tok::Await
        } else if KEYWORDS.contains(&word.as_str()) {
            Tok::Keyword(word)
        } else if STRICT_RESERVED.contains(&word.as_str()) {
            Tok::StrictReserved
        } else {
            Tok::Ident(word)
        };
    }
    if c.is_ascii_digit() || (c == '.' && rest[1..].starts_with(|d: char| d.is_ascii_digit())) {
        return Tok::Number;
    }
    match c {
        '\'' | '"' => return Tok::Str,
        '`' => return Tok::Template,
        _ => {}
    }
    for p in PUNCTS {
        if rest.starts_with(p) {
            return Tok::Punct((*p).to_string());
        }
    }
    Tok::Invalid
}

fn unexpected(tok: Tok, dialect: Dialect) -> String {
    match tok {
        Tok::Eof => "Unexpected end of input".into(),
        Tok::Ident(n) => format!("Unexpected identifier '{n}'"),
        Tok::Keyword(k) => format!("Unexpected token '{k}'"),
        Tok::StrictReserved => "Unexpected strict mode reserved word".into(),
        Tok::Await if dialect == Dialect::V8Module => "Unexpected reserved word".into(),
        Tok::Await => "Unexpected identifier 'await'".into(),
        Tok::Number => "Unexpected number".into(),
        Tok::Str => "Unexpected string".into(),
        Tok::Template => "Unexpected template string".into(),
        Tok::Punct(p) => format!("Unexpected token '{p}'"),
        Tok::Invalid => "Invalid or unexpected token".into(),
    }
}

/// The word that ends just before `pos` (skipping spaces back).
fn word_before(src: &str, pos: usize) -> &str {
    let head = src[..pos.min(src.len())].trim_end();
    let start = head.rfind(|c: char| !is_id_part(c)).map(|i| i + head[i..].chars().next().unwrap().len_utf8()).unwrap_or(0);
    &head[start..]
}

fn quoted_name(message: &str) -> Option<String> {
    let s = message.find(['`', '\''])?;
    let q = message[s..].chars().next()?;
    let e = message[s + 1..].find(q)?;
    Some(message[s + 1..s + 1 + e].to_string())
}

fn v8_message(src: &str, message: &str, labels: &[(usize, usize)], at: usize, dialect: Dialect) -> String {
    let m = message;
    if m.starts_with("Unterminated string") {
        return if src[at..].starts_with('`') { "Unexpected end of input".into() } else { "Invalid or unexpected token".into() };
    }
    if m.starts_with("Unterminated regular expression") {
        return "Invalid regular expression: missing /".into();
    }
    if m.starts_with("Invalid Character") || m.starts_with("Invalid character") {
        return "Invalid or unexpected token".into();
    }
    if m.starts_with("Missing initializer in const declaration") {
        return m.into();
    }
    if m.starts_with("Invalid assignment in object literal") {
        return "Invalid shorthand property initializer".into();
    }
    if m.starts_with("A 'return' statement can only be used") {
        return "Illegal return statement".into();
    }
    if m.starts_with("`await` is only allowed") {
        return "Unexpected reserved word".into();
    }
    if m.starts_with("HTML comments are not allowed in modules") {
        return m.into();
    }
    if m.starts_with("Duplicated export") || m.contains("has already been declared") {
        let name = quoted_name(m).unwrap_or_default();
        let second = labels.get(1).map(|l| l.0).unwrap_or(at);
        let first = labels.first().map(|l| l.0).unwrap_or(at);
        let decl = |p: usize| matches!(word_before(src, p), "const" | "let" | "var" | "function" | "class");
        return if m.starts_with("Duplicated export") && !(decl(first) && decl(second)) {
            format!("Duplicate export of '{name}'")
        } else {
            format!("Identifier '{name}' has already been declared")
        };
    }
    if m.contains("octal") || m.contains("Octal") {
        return "Octal literals are not allowed in strict mode.".into();
    }
    if m.contains("'with' statements") || m.contains("with") && m.contains("strict") {
        return "Strict mode code may not include a with statement".into();
    }
    if m.starts_with("Delete of an unqualified identifier") || m.contains("Deleting") {
        return "Delete of an unqualified identifier in strict mode.".into();
    }
    if m.starts_with("Expected a semicolon") || m.starts_with("Type assertion expressions") {
        let pos = if m.starts_with("Type assertion") {
            // `expr as T` / `expr satisfies T`: V8 stops at the keyword.
            let end = at + labels.first().map(|l| l.1).unwrap_or(0);
            let span = &src[at..end.min(src.len())];
            match span.rfind(" as ").or_else(|| span.rfind(" satisfies ")) {
                Some(i) => at + i,
                None => end,
            }
        } else {
            at
        };
        // A strict reserved word used as a name is the error itself.
        if STRICT_RESERVED.contains(&word_before(src, pos)) && dialect == Dialect::V8Module {
            return "Unexpected strict mode reserved word".into();
        }
        let next = skip_trivia(src, pos);
        if m.starts_with("Type assertion") {
            // `expr as T`: V8 stops at `as`.
            return unexpected(token_at(src, next), dialect);
        }
        return unexpected(token_at(src, next), dialect);
    }
    if m.starts_with("Expected `,` or `)`") {
        // Inside call arguments V8 says so; parameters and parentheses do not.
        if let Some(open) = labels.get(1).map(|l| l.0) {
            let before = src[..open].trim_end();
            let callee = before.chars().last().map(|c| is_id_part(c) || c == ')' || c == ']').unwrap_or(false);
            let word = word_before(src, open);
            let head = before[..before.len() - word.len()].trim_end();
            let is_function = head.ends_with("function") || head.ends_with('*') || KEYWORDS.contains(&word);
            if callee && !is_function {
                return "missing ) after argument list".into();
            }
        }
    }
    if m.starts_with("Identifier expected after '?.'") {
        return unexpected(token_at(src, skip_trivia(src, at + 2)), dialect);
    }
    if m.starts_with("Unexpected JSX expression") {
        return "Unexpected token '<'".into();
    }
    unexpected(token_at(src, at), dialect)
}

/// `<` at `at` starts JSX (babel with the JSX plugin reads it so).
fn jsx_at(src: &str, at: usize) -> bool {
    src[at..].starts_with('<') && JSX_ON.with(|j| j.get())
}

thread_local! {
    static JSX_ON: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// Whether `at` is inside a JSX opening tag (after `<name`, before `>`).
fn in_jsx_tag(src: &str, at: usize) -> bool {
    let head = &src[..at];
    match (head.rfind('<'), head.rfind('>')) {
        (Some(lt), Some(gt)) => lt > gt && head[lt + 1..].starts_with(|c: char| c.is_alphabetic()),
        (Some(lt), None) => head[lt + 1..].starts_with(|c: char| c.is_alphabetic()),
        _ => false,
    }
}

/// babel's JSX tokenizer reaches the end of the file inside an element's
/// children: the position of the text it was reading ("Unterminated JSX
/// contents."). `None` when every JSX element closes.
fn babel_unterminated_jsx(src: &str) -> Option<usize> {
    scan_jsx(src, &mut Vec::new())
}

/// `<T>(x: T) => …` in TSX: babel falls back to an arrow function with
/// type parameters when the JSX reading fails; oxc reads JSX. Write such
/// type parameters as `<T,>` (the same arrow). `None` when none is found.
pub fn tsx_generic_arrows(src: &str) -> Option<String> {
    let b = src.as_bytes();
    let mut inserts = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'<' {
            let head = src[..i].trim_end();
            let starts = head.ends_with('=') || head.ends_with('(') || head.ends_with(',') || head.ends_with(':')
                || head.ends_with('?') || head.ends_with("return") || head.ends_with("default") || head.ends_with("=>");
            if starts {
                let mut j = i + 1;
                while j < b.len() && b[j] == b' ' {
                    j += 1;
                }
                let id_start = j;
                while j < b.len() && (b[j].is_ascii_alphanumeric() || b[j] == b'_' || b[j] == b'$') {
                    j += 1;
                }
                let id_end = j;
                while j < b.len() && b[j] == b' ' {
                    j += 1;
                }
                if id_end > id_start && b[id_start].is_ascii_alphabetic() && b.get(j) == Some(&b'>') {
                    let mut k = j + 1;
                    while k < b.len() && b[k].is_ascii_whitespace() {
                        k += 1;
                    }
                    if b.get(k) == Some(&b'(') {
                        inserts.push(id_end);
                    }
                }
            }
        }
        i += 1;
    }
    if inserts.is_empty() {
        return None;
    }
    let mut out = String::with_capacity(src.len() + inserts.len());
    let mut cursor = 0;
    for at in inserts {
        out.push_str(&src[cursor..at]);
        out.push(',');
        cursor = at;
    }
    out.push_str(&src[cursor..]);
    Some(out)
}

/// The source as babel would read it, in a form oxc reads the same way:
/// TSX generic arrows, and JSX text with `}` or `>`. Only applied when oxc
/// rejects the source as written.
pub fn babel_normalize(src: &str, ts: bool, jsx: bool) -> Option<String> {
    if !jsx {
        return None;
    }
    let st = if ts { SourceType::tsx() } else { SourceType::mjs().with_jsx(true) };
    let fails = |s: &str| {
        let a = Allocator::default();
        !Parser::new(&a, s, st).parse().diagnostics.is_empty()
    };
    if !fails(src) {
        return None;
    }
    let mut cur = src.to_string();
    let mut changed = false;
    if ts {
        if let Some(t) = tsx_generic_arrows(&cur) {
            cur = t;
            changed = true;
        }
    }
    if fails(&cur) {
        if let Some(t) = babel_jsx_text(&cur) {
            cur = t;
            changed = true;
        }
    }
    changed.then_some(cur)
}

/// JSX text with `}` or `>` in it, which babel reads as text and oxc
/// rejects, rewritten as one string expression with babel's whitespace
/// rules. `None` when no text needs it.
pub fn babel_jsx_text(src: &str) -> Option<String> {
    let mut texts = Vec::new();
    if scan_jsx(src, &mut texts).is_some() {
        return None;
    }
    let mut out = String::new();
    let mut cursor = 0;
    let mut changed = false;
    for (start, end) in texts {
        let text = &src[start..end];
        if !(text.contains('}') || text.contains('>')) || text.contains('&') || start < cursor {
            continue;
        }
        let lines: Vec<&str> = text.split("\r\n").flat_map(|l| l.split(['\n', '\r'])).collect();
        let last_non_empty = lines.iter().rposition(|l| l.chars().any(|c| c != ' ' && c != '\t'));
        let mut value = String::new();
        for (i, line) in lines.iter().enumerate() {
            let mut t = line.replace('\t', " ");
            if i != 0 {
                t = t.trim_start_matches(' ').to_string();
            }
            if i != lines.len() - 1 {
                t = t.trim_end_matches(' ').to_string();
            }
            if !t.is_empty() {
                if Some(i) != last_non_empty {
                    t.push(' ');
                }
                value.push_str(&t);
            }
        }
        out.push_str(&src[cursor..start]);
        if !value.is_empty() {
            out.push('{');
            out.push_str(&serde_json::to_string(&value).unwrap_or_default());
            out.push('}');
        }
        cursor = end;
        changed = true;
    }
    if !changed {
        return None;
    }
    out.push_str(&src[cursor..]);
    Some(out)
}

fn scan_jsx(src: &str, texts: &mut Vec<(usize, usize)>) -> Option<usize> {
    match scan_js(src.as_bytes(), 0, false, texts) {
        Err(Some(pos)) => Some(pos),
        _ => None,
    }
}

/// Whether a token ending with `prev` leaves the scanner where an
/// expression starts (so `/` is a regex and `<` may open JSX).
fn expr_start(prev: u8) -> bool {
    matches!(prev, b'(' | b'=' | b',' | b':' | b'?' | b'[' | b'{' | b'}' | b'&' | b'|' | b'!' | b'>' | b'<' | b'+' | b'-' | b'*' | b'%' | b'^' | b'~' | b'R' | b';' | b'S')
}

/// Skip a string literal starting at `i` (its quote); returns the end.
fn skip_quoted(b: &[u8], i: usize) -> usize {
    let q = b[i];
    let mut j = i + 1;
    while j < b.len() {
        if b[j] == b'\\' {
            j += 2;
            continue;
        }
        if b[j] == q || (q != b'`' && b[j] == b'\n') {
            return j + 1;
        }
        j += 1;
    }
    b.len()
}

/// Skip a regex literal starting at `i` (its `/`); returns the end.
fn skip_regex(b: &[u8], i: usize) -> usize {
    let mut j = i + 1;
    let mut class = false;
    while j < b.len() {
        match b[j] {
            b'\\' => j += 1,
            b'[' => class = true,
            b']' => class = false,
            b'/' if !class => {
                j += 1;
                while j < b.len() && b[j].is_ascii_alphabetic() {
                    j += 1;
                }
                return j;
            }
            b'\n' => return j,
            _ => {}
        }
        j += 1;
    }
    b.len()
}

/// Scan JS from `i`: to the end of input, or (`in_braces`) past the `}`
/// that closes the brace at `i - 1`. JSX elements found on the way are
/// scanned as babel scans them. Err(Some(pos)): unterminated JSX contents;
/// Err(None): some other shape.
fn scan_js(b: &[u8], mut i: usize, in_braces: bool, texts: &mut Vec<(usize, usize)>) -> Result<usize, Option<usize>> {
    let n = b.len();
    let mut depth = 0usize;
    let mut prev: u8 = b'S';
    while i < n {
        let c = b[i];
        match c {
            b'\'' | b'"' => {
                i = skip_quoted(b, i);
                prev = b'a';
                continue;
            }
            b'`' => {
                // Template: `${` opens a nested scan.
                let mut j = i + 1;
                while j < n && b[j] != b'`' {
                    if b[j] == b'\\' {
                        j += 2;
                        continue;
                    }
                    if b[j] == b'$' && b.get(j + 1) == Some(&b'{') {
                        j = scan_js(b, j + 2, true, texts)?;
                        continue;
                    }
                    j += 1;
                }
                i = (j + 1).min(n);
                prev = b'a';
                continue;
            }
            b'/' if b.get(i + 1) == Some(&b'/') => {
                while i < n && b[i] != b'\n' {
                    i += 1;
                }
                continue;
            }
            b'/' if b.get(i + 1) == Some(&b'*') => {
                i = b[i + 2..].windows(2).position(|w| w == b"*/").map(|k| i + k + 4).unwrap_or(n);
                continue;
            }
            b'/' if expr_start(prev) => {
                i = skip_regex(b, i);
                prev = b'a';
                continue;
            }
            // babel parses an expression container as JS; a closing tag in
            // it is that parser's error, not unterminated contents.
            b'<' if in_braces && b.get(i + 1) == Some(&b'/') && expr_start(prev) => return Err(None),
            b'<' if expr_start(prev) && b.get(i + 1).map(|d| d.is_ascii_alphabetic() || *d == b'>').unwrap_or(false) => {
                i = jsx_element(b, i, texts)?;
                prev = b'a';
                continue;
            }
            b'{' => depth += 1,
            b'}' => {
                if depth == 0 {
                    if in_braces {
                        return Ok(i + 1);
                    }
                } else {
                    depth -= 1;
                }
            }
            c if c.is_ascii_whitespace() => {
                i += 1;
                continue;
            }
            c if c.is_ascii_alphanumeric() || c == b'_' || c == b'$' => {
                let start = i;
                while i < n && (b[i].is_ascii_alphanumeric() || b[i] == b'_' || b[i] == b'$') {
                    i += 1;
                }
                let word = std::str::from_utf8(&b[start..i]).unwrap_or("");
                prev = if matches!(word, "return" | "default" | "yield" | "await" | "case" | "in" | "of" | "typeof" | "void" | "else" | "do" | "new" | "delete" | "throw") {
                    b'R'
                } else {
                    b'a'
                };
                continue;
            }
            _ => {}
        }
        prev = if c == b')' || c == b']' { b'a' } else { c };
        i += 1;
    }
    if in_braces {
        Err(None)
    } else {
        Ok(n)
    }
}

/// A JSX element at `i` (its `<`): Ok(end) when it closes.
fn jsx_element(b: &[u8], i: usize, texts: &mut Vec<(usize, usize)>) -> Result<usize, Option<usize>> {
    let mut j = i + 1;
    // Opening tag.
    loop {
        if j >= b.len() {
            return Err(None);
        }
        match b[j] {
            b'"' | b'\'' => j = skip_quoted(b, j),
            b'{' => j = scan_js(b, j + 1, true, texts)?,
            b'/' if b.get(j + 1) == Some(&b'>') => return Ok(j + 2),
            b'>' => {
                j += 1;
                break;
            }
            _ => j += 1,
        }
    }
    // Children.
    let mut text = j;
    loop {
        if j >= b.len() {
            return Err(Some(text));
        }
        match b[j] {
            b'<' if b.get(j + 1) == Some(&b'/') => {
                if j > text {
                    texts.push((text, j));
                }
                while j < b.len() && b[j] != b'>' {
                    j += 1;
                }
                return if j < b.len() { Ok(j + 1) } else { Err(None) };
            }
            b'<' => {
                if j > text {
                    texts.push((text, j));
                }
                j = jsx_element(b, j, texts)?;
                text = j;
            }
            b'{' => {
                if j > text {
                    texts.push((text, j));
                }
                j = scan_js(b, j + 1, true, texts)?;
                text = j;
            }
            _ => j += 1,
        }
    }
}

fn babel_message(src: &str, message: &str, labels: &[(usize, usize)], at: usize) -> (String, usize) {
    let m = message;
    if m.starts_with("Unterminated string") {
        return if src[at..].starts_with('`') { ("Unterminated template.".into(), at + 1) } else { ("Unterminated string constant.".into(), at) };
    }
    if m.starts_with("Unterminated regular expression") {
        return ("Unterminated regular expression.".into(), at + 1);
    }
    if m.starts_with("Invalid characters after number") {
        return ("Identifier directly after number.".into(), at);
    }
    if m.starts_with("Identifier expected.") && m.contains("is a reserved word") {
        let w = quoted_name(m).unwrap_or_default();
        return (format!("Unexpected keyword '{w}'."), at);
    }
    if m.starts_with("Invalid Character") || m.starts_with("Invalid character") {
        let c = src[at..].chars().next().unwrap_or(' ');
        return (format!("Unexpected character '{c}'."), at);
    }
    if m.starts_with("Missing initializer in const declaration") {
        return ("Missing initializer in const declaration.".into(), at + labels.first().map(|l| l.1).unwrap_or(0));
    }
    if m.starts_with("Invalid assignment in object literal") {
        let eq = src[at..].find('=').map(|i| at + i).unwrap_or(at);
        return ("Invalid shorthand property initializer.".into(), eq);
    }
    if m.starts_with("A 'return' statement can only be used") {
        return ("'return' outside of function.".into(), at);
    }
    if m.starts_with("`await` is only allowed") {
        return ("Unexpected reserved word 'await'.".into(), at);
    }
    if m.starts_with("Duplicated export") || m.contains("has already been declared") {
        let name = quoted_name(m).unwrap_or_default();
        let second = labels.get(1).map(|l| l.0).unwrap_or(at);
        return (format!("Identifier '{name}' has already been declared."), second);
    }
    if m.contains("octal") || m.contains("Octal") {
        return ("Legacy octal literals are not allowed in strict mode.".into(), at);
    }
    if m.contains("'with' statements") || m.contains("with") && m.contains("strict") {
        return ("'with' in strict mode.".into(), at);
    }
    if m.starts_with("Delete of an unqualified identifier") || m.contains("Deleting") {
        let start = src[..at].rfind("delete").unwrap_or(at);
        return ("Deleting local variable in strict mode.".into(), start);
    }
    if m.starts_with("Expected a semicolon") {
        if STRICT_RESERVED.contains(&word_before(src, at)) || word_before(src, at) == "interface" {
            let w = word_before(src, at);
            return (format!("Unexpected reserved word '{w}'."), at - w.len());
        }
        return ("Missing semicolon.".into(), at);
    }
    if m.starts_with("HTML comments") {
        return ("Unexpected token".into(), if jsx_at(src, at) { at } else { at + 1 });
    }
    if m.starts_with("Adjacent JSX elements must be wrapped") {
        return ("Adjacent JSX elements must be wrapped in an enclosing tag. Did you want a JSX fragment <>...</>?".into(), at);
    }
    if m == "Unexpected token" && src[..at].trim_end().ends_with('=') && in_jsx_tag(src, at) {
        return ("JSX value should be either an expression or a quoted JSX text.".into(), at);
    }
    if m.starts_with("Identifier expected after '?.'") {
        return ("Unexpected token".into(), skip_trivia(src, at + 2));
    }
    if let Some(rest) = m.strip_prefix("Expected `") {
        let found_eof = m.ends_with("`EOF`");
        if rest.starts_with(",`") || (rest.starts_with(">`") && !found_eof) {
            return ("Unexpected token, expected \",\"".into(), at);
        }
        return ("Unexpected token".into(), at);
    }
    ("Unexpected token".into(), at)
}
