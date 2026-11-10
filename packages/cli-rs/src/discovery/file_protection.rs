//! Port of the `ignore` npm package (7.x, the gitignore matcher the JS CLI
//! uses) and `foundation/fs/file-protection.mjs`.

use super::nodepath as np;
use std::collections::HashMap;

/// JS `str.replace(re, fn)`: `global` replaces every match, else the first.
/// The callback gets the groups (index 0 = the match), the offset and the
/// whole string.
pub fn js_replace(s: &str, re: &str, flags: &str, global: bool, f: &dyn Fn(&[Option<String>], usize, &str) -> String) -> String {
    let r = regress::Regex::with_flags(re, flags).expect("regex");
    let mut out = String::new();
    let mut last = 0;
    for m in r.find_iter(s) {
        out.push_str(&s[last..m.start()]);
        let groups: Vec<Option<String>> = m.groups().map(|g| g.map(|g| s[g].to_string())).collect();
        // JS passes the offset in UTF-16 units; the patterns here are ASCII
        // driven, and callers compare it to a UTF-16 length.
        let off16 = s[..m.start()].encode_utf16().count();
        out.push_str(&f(&groups, off16, s));
        last = m.end();
        if !global {
            break;
        }
    }
    out.push_str(&s[last..]);
    out
}

fn g(groups: &[Option<String>], i: usize) -> String {
    groups.get(i).cloned().flatten().unwrap_or_default()
}

fn sanitize_range(range: &str) -> String {
    js_replace(range, r"([0-z])-([0-z])", "", true, &|m, _, _| {
        let from = g(m, 1).encode_utf16().next().unwrap_or(0);
        let to = g(m, 2).encode_utf16().next().unwrap_or(0);
        if from <= to {
            g(m, 0)
        } else {
            String::new()
        }
    })
}

fn clean_range_back_slash(slashes: &str) -> String {
    let n = slashes.len();
    slashes[..n - n % 2].to_string()
}

fn make_regex_prefix(pattern: &str) -> String {
    let mut s = pattern.to_string();
    s = js_replace(&s, r"^\uFEFF", "", false, &|_, _, _| String::new());
    s = js_replace(&s, r"((?:\\\\)*?)(\\?\s+)$", "", false, &|m, _, _| {
        g(m, 1) + if g(m, 2).starts_with('\\') { " " } else { "" }
    });
    s = js_replace(&s, r"(\\+?)\s", "", true, &|m, _, _| {
        let m1 = g(m, 1);
        let n = m1.len();
        format!("{} ", &m1[..n - n % 2])
    });
    s = js_replace(&s, r"[\\$.|*+(){^]", "", true, &|m, _, _| format!("\\{}", g(m, 0)));
    s = js_replace(&s, r"(?!\\)\?", "", true, &|_, _, _| "[^/]".into());
    s = js_replace(&s, r"^\/", "", false, &|_, _, _| "^".into());
    s = js_replace(&s, r"\/", "", true, &|_, _, _| "\\/".into());
    s = js_replace(&s, r"^\^*\\\*\\\*\\\/", "", false, &|_, _, _| "^(?:.*\\/)?".into());
    let this = pattern.to_string();
    s = js_replace(&s, r"^(?=[^^])", "", false, &|_, _, _| {
        if regress::Regex::new(r"\/(?!$)").unwrap().find(&this).is_none() {
            "(?:^|\\/)".into()
        } else {
            "^".into()
        }
    });
    s = js_replace(&s, r"\\\/\\\*\\\*(?=\\\/|$)", "", true, &|_, index, string| {
        if index + 6 < string.encode_utf16().count() {
            "(?:\\/[^\\/]+)*".into()
        } else {
            "\\/.+".into()
        }
    });
    s = js_replace(&s, r"(^|[^\\]+)(\\\*)+(?=.+)", "", true, &|m, _, _| {
        let p2 = g(m, 2);
        g(m, 1) + &p2.replace("\\*", "[^\\/]*")
    });
    s = js_replace(&s, r"\\\\\\(?=[$.|*+(){^])", "", true, &|_, _, _| "\\".into());
    s = js_replace(&s, r"\\\\", "", true, &|_, _, _| "\\".into());
    s = js_replace(&s, r"(\\)?\[([^\]/]*?)(\\*)($|\])", "", true, &|m, _, _| {
        let lead = g(m, 1);
        let range = g(m, 2);
        let end = g(m, 3);
        let close = g(m, 4);
        if lead == "\\" {
            format!("\\[{range}{}{close}", clean_range_back_slash(&end))
        } else if close == "]" {
            if end.len() % 2 == 0 {
                format!("[{}{end}]", sanitize_range(&range))
            } else {
                "[]".into()
            }
        } else {
            "[]".into()
        }
    });
    s = js_replace(&s, r"(?:[^*])$", "", false, &|m, _, _| {
        let mm = g(m, 0);
        if mm.ends_with('/') {
            format!("{mm}$")
        } else {
            format!("{mm}(?=$|\\/$)")
        }
    });
    s
}

struct Rule {
    negative: bool,
    regex: regress::Regex,
}

/// `ignore({ignorecase})`.
pub struct Ignore {
    ignore_case: bool,
    rules: Vec<Rule>,
    cache: std::cell::RefCell<HashMap<String, (bool, bool)>>,
}

impl Ignore {
    pub fn new(ignore_case: bool) -> Ignore {
        Ignore { ignore_case, rules: vec![], cache: Default::default() }
    }

    /// `.add(text)`: one pattern per line. Errors when a pattern compiles to
    /// an invalid regex (the JS `new RegExp` throws `Invalid regular
    /// expression: ...`).
    pub fn add(&mut self, text: &str) -> Result<(), String> {
        for line in text.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).filter(|l| !l.is_empty()) {
            if !check_pattern(line) {
                continue;
            }
            let mut body = line.to_string();
            let negative = body.starts_with('!');
            if negative {
                body = body[1..].to_string();
            }
            if let Some(r) = body.strip_prefix("\\!") {
                body = format!("!{r}");
            } else if let Some(r) = body.strip_prefix("\\#") {
                body = format!("#{r}");
            }
            let prefix = make_regex_prefix(&body);
            let src = js_replace(&prefix, r"(^|\\\/)?\\\*$", "", false, &|m, _, _| {
                let p1 = m.get(1).cloned().flatten();
                let pre = match p1 {
                    Some(p) if !p.is_empty() => format!("{p}[^/]+"),
                    _ => "[^/]*".into(),
                };
                format!("{pre}(?=$|\\/$)")
            });
            let regex = regress::Regex::with_flags(&src, if self.ignore_case { "i" } else { "" })
                .map_err(|e| format!("Invalid regular expression: /{src}/{}: {e}", if self.ignore_case { "i" } else { "" }))?;
            self.rules.push(Rule { negative, regex });
        }
        self.cache.borrow_mut().clear();
        Ok(())
    }

    fn rules_test(&self, path: &str, check_unignored: bool) -> (bool, bool) {
        let mut ignored = false;
        let mut unignored = false;
        for r in &self.rules {
            let neg = r.negative;
            if (unignored == neg && ignored != unignored) || (neg && !ignored && !unignored && !check_unignored) {
                continue;
            }
            if r.regex.find(path).is_none() {
                continue;
            }
            ignored = !neg;
            unignored = neg;
        }
        (ignored, unignored)
    }

    fn t(&self, path: &str, check_unignored: bool, slices: Option<Vec<String>>) -> (bool, bool) {
        if let Some(v) = self.cache.borrow().get(path) {
            return *v;
        }
        let mut slices = slices.unwrap_or_else(|| path.split('/').filter(|s| !s.is_empty()).map(String::from).collect());
        slices.pop();
        let r = if slices.is_empty() {
            self.rules_test(path, check_unignored)
        } else {
            let parent_path = format!("{}/", slices.join("/"));
            let parent = self.t(&parent_path, check_unignored, Some(slices));
            if parent.0 {
                parent
            } else {
                self.rules_test(path, check_unignored)
            }
        };
        self.cache.borrow_mut().insert(path.to_string(), r);
        r
    }

    /// `.test(path)`: `(ignored, unignored)`; Err for a path `ignore`
    /// rejects (not relative, or empty).
    pub fn test(&self, path: &str) -> Result<(bool, bool), String> {
        if path.is_empty() {
            return Err("path must not be empty".into());
        }
        if regress::Regex::new(r"^\.{0,2}\/|^\.{1,2}$").unwrap().find(path).is_some() {
            return Err(format!("path should be a `path.relative()`d string, but got \"{path}\""));
        }
        Ok(self.t(path, true, None))
    }
}

fn check_pattern(p: &str) -> bool {
    !p.is_empty()
        && !(p.chars().all(super::paths::js_ws))
        && regress::Regex::new(r"(?:[^\\]|^)\\$").unwrap().find(p).is_none()
        && !p.starts_with('#')
}

// ── file-protection.mjs ───────────────────────────────────────────────────

const DEPENDENCY_DIRS: [&str; 3] = ["node_modules", "bower_components", "jspm_packages"];
const YARN_DEPENDENCY_DIRS: [&str; 4] = ["__virtual__", "cache", "sdks", "unplugged"];
const VCS_DIRS: [&str; 3] = [".git", ".hg", ".sl"];
const PROTECTION_FILES: [&str; 3] = [".gitattributes", ".gitignore", ".hgignore"];

/// `ProtectionSourceError` (`code: ERR_CODEMOD_PROTECTION_SOURCE`).
#[derive(Debug, Clone, PartialEq)]
pub struct ProtectionSourceError {
    pub source: String,
    pub message: String,
}

impl ProtectionSourceError {
    fn new(source: &str, reason: &str) -> Self {
        ProtectionSourceError { source: source.into(), message: format!("Could not read file-protection source {source}: {reason}") }
    }
    pub const CODE: &'static str = "ERR_CODEMOD_PROTECTION_SOURCE";
}

/// One protection (`FileProtection`).
#[derive(Debug, Clone, PartialEq)]
pub struct FileProtection {
    pub file: String,
    /// `outside-root` | `dependency` | `vcs` | `symlink` | `ignored` | `generated` | `vendored`.
    pub reason: &'static str,
    pub declaration: String,
    pub source: Option<String>,
    pub line: Option<usize>,
    pub command: Option<String>,
}

fn prot(file: &str, reason: &'static str, declaration: String) -> FileProtection {
    FileProtection { file: file.into(), reason, declaration, source: None, line: None, command: None }
}

fn relative_within(candidate: &str, root: &str) -> Option<String> {
    let rel = np::relative(root, candidate);
    if rel.is_empty() || (!rel.starts_with("../") && rel != ".." && !np::is_absolute(&rel)) {
        Some(rel)
    } else {
        None
    }
}

/// A gitattributes / hgignore glob (`globRegex`) as a regex source.
fn glob_regex(pattern: &str, basename: bool) -> Result<String, String> {
    let chars: Vec<char> = pattern.chars().collect();
    let mut out = String::from(if basename { "(?:^|/)" } else { "^" });
    let esc = |c: char, out: &mut String| {
        if ".*+?^${}()|[]\\".contains(c) {
            out.push('\\');
        }
        out.push(c);
    };
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '*' {
            if chars.get(i + 1) == Some(&'*') {
                while chars.get(i + 1) == Some(&'*') {
                    i += 1;
                }
                if chars.get(i + 1) == Some(&'/') {
                    i += 1;
                    out.push_str("(?:.*/)?");
                } else {
                    out.push_str(".*");
                }
            } else {
                out.push_str("[^/]*");
            }
        } else if c == '?' {
            out.push_str("[^/]");
        } else if c == '[' {
            let end = chars[i + 1..].iter().position(|x| *x == ']').map(|p| p + i + 1).ok_or("unterminated character class")?;
            let mut cls: String = chars[i + 1..end].iter().collect();
            if let Some(r) = cls.strip_prefix('!') {
                cls = format!("^{r}");
            }
            out.push('[');
            out.push_str(&cls.replace('\\', "\\\\"));
            out.push(']');
            i = end;
        } else if c == '\\' && i + 1 < chars.len() {
            i += 1;
            esc(chars[i], &mut out);
        } else {
            esc(c, &mut out);
        }
        i += 1;
    }
    out.push('$');
    regress::Regex::new(&out).map_err(|e| format!("Invalid regular expression: /{out}/: {e}"))?;
    Ok(out)
}

fn is_ws(c: char) -> bool {
    super::paths::js_ws(c)
}

fn split_attribute_line(line: &str) -> Result<Vec<String>, String> {
    let text: Vec<char> = line.trim_matches(super::paths::js_ws).chars().collect();
    let mut tokens = Vec::new();
    let mut token = String::new();
    let mut escaped = false;
    let mut quoted = false;
    let mut i = 0;
    while i < text.len() {
        let c = text[i];
        if escaped {
            let octal: String = if quoted { text[i..].iter().take(3).take_while(|d| ('0'..='7').contains(*d)).collect() } else { String::new() };
            if !octal.is_empty() {
                let cp = u32::from_str_radix(&octal, 8).unwrap();
                token.push(char::from_u32(cp).unwrap_or('\u{fffd}'));
                i += octal.len() - 1;
            } else if quoted {
                token.push(match c {
                    'n' => '\n',
                    't' => '\t',
                    'r' => '\r',
                    x => x,
                });
            } else if is_ws(c) {
                token.push(c);
            } else {
                token.push('\\');
                token.push(c);
            }
            escaped = false;
        } else if c == '\\' {
            escaped = true;
        } else if c == '"' {
            quoted = !quoted;
        } else if is_ws(c) && !quoted {
            if !token.is_empty() {
                tokens.push(std::mem::take(&mut token));
            }
        } else {
            token.push(c);
        }
        i += 1;
    }
    if escaped {
        token.push('\\');
    }
    if quoted {
        return Err("unterminated quoted pattern".into());
    }
    if !token.is_empty() {
        tokens.push(token);
    }
    Ok(tokens)
}

/// An attribute value: Some(true/false) or None (unspecified, `!name`).
type Attrs = Vec<(String, Option<bool>)>;

fn set_attr(a: &mut Attrs, k: &str, v: Option<bool>) {
    match a.iter_mut().find(|(n, _)| n == k) {
        Some(slot) => slot.1 = v,
        None => a.push((k.into(), v)),
    }
}

fn parse_assignments(tokens: &[String], macros: &HashMap<String, Attrs>) -> Attrs {
    let mut a: Attrs = Vec::new();
    for t in tokens {
        if let Some(m) = macros.get(t) {
            for (k, v) in m {
                set_attr(&mut a, k, *v);
            }
            continue;
        }
        if let Some(n) = t.strip_prefix('-') {
            set_attr(&mut a, n, Some(false));
        } else if let Some(n) = t.strip_prefix('!') {
            set_attr(&mut a, n, None);
        } else {
            let (name, value) = match t.find('=') {
                None => (t.as_str(), "true"),
                Some(e) => (&t[..e], &t[e + 1..]),
            };
            set_attr(&mut a, name, Some(value.to_lowercase() != "false"));
        }
    }
    a
}

struct AttrRule {
    pattern: regress::Regex,
    attributes: Attrs,
    line: usize,
}

fn lines_of(s: &str) -> Vec<&str> {
    super::paths::split_lines_crlf(s)
}

fn parse_attributes(source: &str, contents: &str, macros: &mut HashMap<String, Attrs>, top: bool) -> Result<Vec<AttrRule>, ProtectionSourceError> {
    let lines = lines_of(contents);
    if top {
        let mut defs: Vec<(String, Vec<String>, usize)> = Vec::new();
        for (index, l) in lines.iter().enumerate() {
            let raw = l.trim_matches(super::paths::js_ws);
            if raw.is_empty() || raw.starts_with('#') {
                continue;
            }
            let mut tokens = split_attribute_line(raw)
                .map_err(|e| ProtectionSourceError::new(source, &format!("invalid rule on line {}: {e}", index + 1)))?;
            if tokens.is_empty() {
                continue;
            }
            let pattern = tokens.remove(0);
            let Some(name) = pattern.strip_prefix("[attr]") else { continue };
            if name.is_empty() || tokens.is_empty() {
                return Err(ProtectionSourceError::new(source, &format!("invalid attribute macro on line {}", index + 1)));
            }
            match defs.iter_mut().find(|d| d.0 == name) {
                Some(d) => {
                    d.1 = tokens;
                    d.2 = index + 1;
                }
                None => defs.push((name.to_string(), tokens, index + 1)),
            }
        }
        fn resolve(
            name: &str,
            defs: &[(String, Vec<String>, usize)],
            macros: &mut HashMap<String, Attrs>,
            resolving: &mut Vec<String>,
            source: &str,
        ) -> Result<(), ProtectionSourceError> {
            if macros.contains_key(name) {
                return Ok(());
            }
            let Some(d) = defs.iter().find(|d| d.0 == name) else { return Ok(()) };
            if resolving.iter().any(|r| r == name) {
                return Err(ProtectionSourceError::new(source, &format!("cyclic attribute macro on line {}", d.2)));
            }
            resolving.push(name.into());
            for t in &d.1 {
                if defs.iter().any(|x| x.0 == *t) {
                    resolve(t, defs, macros, resolving, source)?;
                }
            }
            let a = parse_assignments(&d.1, macros);
            macros.insert(name.into(), a);
            resolving.retain(|r| r != name);
            Ok(())
        }
        let names: Vec<String> = defs.iter().map(|d| d.0.clone()).collect();
        for n in names {
            resolve(&n, &defs, macros, &mut vec![], source)?;
        }
    }
    let mut rules = Vec::new();
    for (index, l) in lines.iter().enumerate() {
        let raw = l.trim_matches(super::paths::js_ws);
        if raw.is_empty() || raw.starts_with('#') {
            continue;
        }
        let mut tokens = split_attribute_line(raw).map_err(|e| ProtectionSourceError::new(source, &format!("invalid rule on line {}: {e}", index + 1)))?;
        if tokens.len() < 2 {
            return Err(ProtectionSourceError::new(source, &format!("invalid rule on line {}", index + 1)));
        }
        let mut pattern = tokens.remove(0);
        if pattern.starts_with('!') {
            return Err(ProtectionSourceError::new(source, &format!("invalid pattern on line {}", index + 1)));
        }
        if let Some(name) = pattern.strip_prefix("[attr]") {
            if !top || name.is_empty() {
                return Err(ProtectionSourceError::new(source, &format!("invalid attribute macro on line {}", index + 1)));
            }
            continue;
        }
        if let Some(p) = pattern.strip_prefix('/') {
            pattern = p.to_string();
        }
        let basename = !pattern.contains('/');
        let src = glob_regex(&pattern, basename).map_err(|e| ProtectionSourceError::new(source, &format!("invalid pattern on line {}: {e}", index + 1)))?;
        rules.push(AttrRule { pattern: regress::Regex::new(&src).unwrap(), attributes: parse_assignments(&tokens, macros), line: index + 1 });
    }
    Ok(rules)
}

fn generated_marker(contents: &str, file: &str) -> Option<String> {
    let text: String = {
        let units: Vec<u16> = contents.encode_utf16().take(65_536).collect();
        String::from_utf16_lossy(&units)
    };
    let ext = np::extname(file).to_lowercase();
    let hash = text.starts_with("#!") || [".py", ".pyi", ".rb", ".sh", ".bash", ".zsh", ".yaml", ".yml", ".toml"].contains(&ext.as_str());
    let dash = [".sql", ".lua"].contains(&ext.as_str());
    let mut cursor = 0usize;
    if text.starts_with("#!") {
        cursor = text.find('\n').map(|e| e + 1).unwrap_or(text.len());
    }
    let mut comments: Vec<&str> = Vec::new();
    while cursor < text.len() {
        let rest = &text[cursor..];
        let ws = rest.len() - rest.trim_start_matches(super::paths::js_ws).len();
        cursor += ws;
        let rest = &text[cursor..];
        if rest.starts_with("//") || (hash && rest.starts_with('#')) || (dash && rest.starts_with("--")) {
            let end = rest.find('\n');
            comments.push(&rest[..end.unwrap_or(rest.len())]);
            cursor = match end {
                Some(e) => cursor + e + 1,
                None => text.len(),
            };
            continue;
        }
        let block = if rest.starts_with("/*") {
            Some(("/*", "*/"))
        } else if rest.starts_with("<!--") {
            Some(("<!--", "-->"))
        } else {
            None
        };
        if let Some((open, close)) = block {
            match rest[open.len()..].find(close) {
                None => break,
                Some(e) => {
                    let end = open.len() + e + close.len();
                    comments.push(&rest[..end]);
                    cursor += end;
                    continue;
                }
            }
        }
        break;
    }
    let leading = comments.join("\n");
    let has = |re: &str, flags: &str| regress::Regex::with_flags(re, flags).unwrap().find(&leading).is_some();
    if has(r"(?:^|[^\w-])@partially-generated(?:[^\w-]|$)", "i") {
        return Some("@partially-generated in the leading comment block".into());
    }
    if has(r"(?:^|[^\w-])@generated(?:[^\w-]|$)", "i") {
        return Some("@generated in the leading comment block".into());
    }
    if has(r"Code generated\b[^\r\n]*\bDO NOT EDIT\.", "") {
        return Some("Code generated ... DO NOT EDIT. in the leading comment block".into());
    }
    None
}

fn generated_command(contents: &str) -> Option<String> {
    let units: Vec<u16> = contents.encode_utf16().take(65_536).collect();
    let text = String::from_utf16_lossy(&units);
    let re = regress::Regex::with_flags(r"^\s*(?:\/\/|\*|#|<!--)?\s*Command:\s*(.+?)\s*(?:\*\/|-->)?\s*$", "m").unwrap();
    let m = re.find(&text)?;
    let c = text[m.group(1)?].trim_matches(super::paths::js_ws).to_string();
    if c.is_empty() {
        None
    } else {
        Some(c)
    }
}

struct GitIgnoreSource {
    file: String,
    dir: String,
    matcher: Ignore,
}

struct HgRule {
    file: String,
    dir: String,
    matcher: regress::Regex,
    line: usize,
}

struct AttrSource {
    file: String,
    dir: String,
    rules: Vec<AttrRule>,
}

/// `createFileProtectionResolver(root, {overrides})`.
pub struct FileProtectionResolver {
    pub root: String,
    overrides: HashMap<String, Option<String>>,
    git: Vec<GitIgnoreSource>,
    hg: Vec<HgRule>,
    attrs: Vec<AttrSource>,
}

struct Builder<'a> {
    root: String,
    real_root: String,
    overrides: &'a HashMap<String, Option<String>>,
    raw_attrs: Vec<(String, String, String)>,
    git: Vec<GitIgnoreSource>,
    hg: Vec<HgRule>,
    parsed_hg: Vec<String>,
    seen: Vec<String>,
}

impl Builder<'_> {
    fn read(&self, file: &str) -> Result<(String, String), ProtectionSourceError> {
        let rel = {
            let r = np::relative(&self.root, file);
            if r.is_empty() { ".".to_string() } else { r }
        };
        let contents = match self.overrides.get(&np::resolve1(file)) {
            Some(None) => return Err(ProtectionSourceError::new(&rel, "is deleted by the staged plan")),
            Some(Some(c)) => c.clone(),
            None => match std::fs::read(file) {
                Ok(b) => String::from_utf8_lossy(&b).into_owned(),
                Err(e) => return Err(ProtectionSourceError::new(&rel, &node_fs_message(&e, "open", file))),
            },
        };
        if contents.contains('\0') {
            return Err(ProtectionSourceError::new(&rel, "contains a NUL byte"));
        }
        Ok((contents, rel))
    }

    fn parse_hg(&mut self, file: &str, base: &str) -> Result<(), ProtectionSourceError> {
        let abs = np::resolve1(file);
        if self.parsed_hg.contains(&abs) {
            return Ok(());
        }
        let Some(within) = relative_within(&abs, &self.root) else {
            return Err(ProtectionSourceError::new(&np::relative(&self.root, &abs), "included source is outside the operation root"));
        };
        let virt = matches!(self.overrides.get(&abs), Some(Some(_)));
        if !virt {
            let real = np::realpath(&abs).ok_or_else(|| ProtectionSourceError::new(&within, &format!("ENOENT: no such file or directory, realpath '{abs}'")))?;
            if real != np::resolve(&[&self.real_root, &within]) {
                return Err(ProtectionSourceError::new(&within, "included source is reached through a symbolic link"));
            }
        } else {
            let mut ancestor = np::dirname(&abs);
            while !np::exists(&ancestor) && ancestor != self.root {
                ancestor = np::dirname(&ancestor);
            }
            let aw = relative_within(&ancestor, &self.root);
            if aw.is_none() || np::realpath(&ancestor) != Some(np::resolve(&[&self.real_root, aw.as_deref().unwrap()])) {
                return Err(ProtectionSourceError::new(&within, "staged source is beneath a symbolic link"));
            }
        }
        self.parsed_hg.push(abs.clone());
        let (contents, rel) = self.read(&abs)?;
        let mut syntax = "regexp".to_string();
        for (index, l) in lines_of(&contents).iter().enumerate() {
            let raw = l.trim_matches(super::paths::js_ws);
            if raw.is_empty() || raw.starts_with('#') {
                continue;
            }
            if let Some(s) = raw.strip_prefix("syntax:") {
                syntax = s.trim_matches(super::paths::js_ws).to_string();
                if syntax != "glob" && syntax != "regexp" {
                    return Err(ProtectionSourceError::new(&rel, &format!("unknown syntax on line {}", index + 1)));
                }
                continue;
            }
            if raw.starts_with("include:") || raw.starts_with("subinclude:") {
                let sub = raw.starts_with("subinclude:");
                let p = raw[raw.find(':').unwrap() + 1..].trim_matches(super::paths::js_ws);
                if p.is_empty() {
                    return Err(ProtectionSourceError::new(&rel, &format!("empty include on line {}", index + 1)));
                }
                let included = np::resolve(&[&np::dirname(&abs), p]);
                let b = if sub { np::dirname(&included) } else { base.to_string() };
                self.parse_hg(&included, &b)?;
                continue;
            }
            let (kind, pattern) = if let Some(p) = raw.strip_prefix("glob:") {
                ("glob", p)
            } else if let Some(p) = raw.strip_prefix("re:") {
                ("regexp", p)
            } else {
                (syntax.as_str(), raw)
            };
            let src = if kind == "glob" {
                glob_regex(pattern.strip_prefix('/').unwrap_or(pattern), !pattern.contains('/'))
            } else {
                regress::Regex::new(pattern).map(|_| pattern.to_string()).map_err(|e| format!("Invalid regular expression: /{pattern}/: {e}"))
            }
            .map_err(|e| ProtectionSourceError::new(&rel, &format!("invalid {kind} pattern on line {}: {e}", index + 1)))?;
            self.hg.push(HgRule { file: rel.clone(), dir: base.to_string(), matcher: regress::Regex::new(&src).unwrap(), line: index + 1 });
        }
        Ok(())
    }

    fn scan(&mut self, dir: &str) -> Result<(), ProtectionSourceError> {
        let mut entries = np::list_dir_entries(dir).ok_or_else(|| {
            let r = np::relative(&self.root, dir);
            ProtectionSourceError::new(if r.is_empty() { "." } else { &r }, &format!("ENOENT: no such file or directory, scandir '{dir}'"))
        })?;
        entries.sort_by_key(|e| e.is_dir as u8);
        for e in entries {
            let full = np::join2(dir, &e.name);
            if e.is_symlink {
                continue;
            }
            if e.is_dir {
                let parts: Vec<String> = np::relative(&self.root, &full).split('/').map(String::from).collect();
                if DEPENDENCY_DIRS.contains(&e.name.as_str())
                    || VCS_DIRS.contains(&e.name.as_str())
                    || (parts[0] == ".yarn" && parts.get(1).map(|p| YARN_DEPENDENCY_DIRS.contains(&p.as_str())).unwrap_or(false))
                {
                    continue;
                }
                self.scan(&full)?;
                continue;
            }
            if !PROTECTION_FILES.contains(&e.name.as_str()) {
                continue;
            }
            if e.name == ".hgignore" && dir != self.root {
                continue;
            }
            let abs = np::resolve1(&full);
            self.seen.push(abs.clone());
            if matches!(self.overrides.get(&abs), Some(None)) {
                continue;
            }
            let (contents, rel) = self.read(&full)?;
            self.add_source(&e.name, &rel, dir, contents, &full)?;
        }
        Ok(())
    }

    fn add_source(&mut self, name: &str, rel: &str, dir: &str, contents: String, full: &str) -> Result<(), ProtectionSourceError> {
        if name == ".gitattributes" {
            self.raw_attrs.push((rel.into(), dir.into(), contents));
        } else if name == ".gitignore" {
            let mut m = Ignore::new(false);
            m.add(&contents).map_err(|e| ProtectionSourceError::new(rel, &e))?;
            self.git.push(GitIgnoreSource { file: rel.into(), dir: dir.into(), matcher: m });
        } else if dir == self.root {
            self.parse_hg(full, dir)?;
        }
        Ok(())
    }
}

fn node_fs_message(e: &std::io::Error, syscall: &str, path: &str) -> String {
    let code = match e.kind() {
        std::io::ErrorKind::NotFound => "ENOENT: no such file or directory",
        std::io::ErrorKind::PermissionDenied => "EACCES: permission denied",
        _ if e.raw_os_error() == Some(21) => "EISDIR: illegal operation on a directory",
        _ => "EIO: i/o error",
    };
    format!("{code}, {syscall} '{path}'")
}

fn cmp_sources(a_dir: &str, a_file: &str, b_dir: &str, b_file: &str) -> std::cmp::Ordering {
    a_dir.encode_utf16().count().cmp(&b_dir.encode_utf16().count()).then_with(|| super::jsort::locale_compare(a_file, b_file))
}

impl FileProtectionResolver {
    /// `createFileProtectionResolver(root, {overrides})`; an override of
    /// `None` is a file the staged plan deletes.
    pub fn new(root: &str, overrides: &[(String, Option<String>)]) -> Result<FileProtectionResolver, ProtectionSourceError> {
        let resolved = np::resolve1(root);
        let ov: HashMap<String, Option<String>> = overrides.iter().map(|(f, c)| (np::resolve1(f), c.clone())).collect();
        let real_root = np::realpath(&resolved).ok_or_else(|| ProtectionSourceError::new(".", &format!("ENOENT: no such file or directory, realpath '{resolved}'")))?;
        let mut b = Builder { root: resolved.clone(), real_root, overrides: &ov, raw_attrs: vec![], git: vec![], hg: vec![], parsed_hg: vec![], seen: vec![] };
        b.scan(&resolved)?;
        let extra: Vec<(String, String)> = overrides
            .iter()
            .filter_map(|(f, c)| c.as_ref().map(|c| (np::resolve1(f), c.clone())))
            .collect();
        for (abs, contents) in extra {
            if b.seen.contains(&abs) {
                continue;
            }
            let name = np::basename(&abs);
            if !PROTECTION_FILES.contains(&name.as_str()) {
                continue;
            }
            let Some(rel) = relative_within(&abs, &resolved) else { continue };
            let dir = np::dirname(&abs);
            if name == ".hgignore" && dir != resolved {
                continue;
            }
            if contents.contains('\0') {
                return Err(ProtectionSourceError::new(&rel, "contains a NUL byte"));
            }
            if name == ".hgignore" {
                b.parse_hg(&abs, &dir)?;
            } else {
                b.add_source(&name, &rel, &dir, contents, &abs)?;
            }
        }
        let mut raw = std::mem::take(&mut b.raw_attrs);
        raw.sort_by(|a, c| cmp_sources(&a.1, &a.0, &c.1, &c.0));
        let mut macros = HashMap::new();
        let mut attrs = Vec::new();
        for (file, dir, contents) in raw {
            let rules = parse_attributes(&file, &contents, &mut macros, dir == resolved)?;
            attrs.push(AttrSource { file, dir, rules });
        }
        let mut git = std::mem::take(&mut b.git);
        git.sort_by(|a, c| cmp_sources(&a.dir, &a.file, &c.dir, &c.file));
        let hg = std::mem::take(&mut b.hg);
        Ok(FileProtectionResolver { root: resolved, overrides: ov, git, hg, attrs })
    }

    fn git_ignored_by(&self, target: &str, end: usize, directory: bool) -> Option<(bool, usize)> {
        let mut state = None;
        for i in 0..end {
            let s = &self.git[i];
            let Some(mut rel) = relative_within(target, &s.dir).filter(|r| !r.is_empty()) else { continue };
            if directory {
                rel.push('/');
            }
            if s.dir != self.root && self.git_ignored_by(&s.dir, i, true).map(|x| x.0).unwrap_or(false) {
                continue;
            }
            match s.matcher.test(&rel) {
                Ok((true, _)) => state = Some((true, i)),
                Ok((false, true)) => state = Some((false, i)),
                _ => {}
            }
        }
        state
    }

    /// `resolver.classify(filePath)`.
    pub fn classify(&self, file: &str) -> Result<Vec<FileProtection>, ProtectionSourceError> {
        let abs = np::resolve1(file);
        let Some(rel) = relative_within(&abs, &self.root) else {
            return Ok(vec![prot(&np::relative(&self.root, &abs), "outside-root", "outside the operation root".into())]);
        };
        let parts: Vec<&str> = rel.split('/').filter(|p| !p.is_empty()).collect();
        let pnp = regress::Regex::new(r"^\.pnp\.(?:cjs|loader\.mjs|data\.json)$").unwrap();
        if (parts.len() == 1 && pnp.find(parts[0]).is_some())
            || (parts.first() == Some(&".yarn")
                && (parts.get(1).map(|p| YARN_DEPENDENCY_DIRS.contains(p)).unwrap_or(false)
                    || (parts.len() == 2 && parts[1] == "install-state.gz")))
        {
            let shown = parts.iter().take(2).cloned().collect::<Vec<_>>().join("/");
            return Ok(vec![prot(&rel, "dependency", format!("installed dependency metadata {shown}"))]);
        }
        for p in &parts {
            if DEPENDENCY_DIRS.contains(p) {
                return Ok(vec![prot(&rel, "dependency", format!("installed dependency directory {p}"))]);
            }
            if VCS_DIRS.contains(p) {
                return Ok(vec![prot(&rel, "vcs", format!("version-control metadata directory {p}"))]);
            }
        }
        let mut current = self.root.clone();
        for p in &parts {
            current = np::join2(&current, p);
            match std::fs::symlink_metadata(&current) {
                Ok(m) if m.file_type().is_symlink() => {
                    return Ok(vec![prot(&rel, "symlink", format!("symbolic link at {}", np::relative(&self.root, &current)))]);
                }
                Ok(_) => {}
                Err(e) => {
                    if current == abs && (e.kind() == std::io::ErrorKind::NotFound || e.raw_os_error() == Some(20)) {
                        break;
                    }
                    return Err(ProtectionSourceError::new(&rel, &node_fs_message(&e, "lstat", &current)));
                }
            }
        }
        let mut out = Vec::new();
        if let Some((true, i)) = self.git_ignored_by(&abs, self.git.len(), false) {
            let f = self.git[i].file.clone();
            out.push(FileProtection { file: rel.clone(), reason: "ignored", declaration: format!("excluded by {f}"), source: Some(f), line: None, command: None });
        }
        for r in &self.hg {
            if let Some(c) = relative_within(&abs, &r.dir) {
                if r.matcher.find(&c).is_some() {
                    out.push(FileProtection {
                        file: rel.clone(),
                        reason: "ignored",
                        declaration: format!("excluded by {}:{}", r.file, r.line),
                        source: Some(r.file.clone()),
                        line: Some(r.line),
                        command: None,
                    });
                }
            }
        }
        let mut attributes: Vec<(String, Option<bool>, String, usize)> = Vec::new();
        for s in &self.attrs {
            let Some(c) = relative_within(&abs, &s.dir).filter(|c| !c.is_empty()) else { continue };
            for rule in &s.rules {
                if rule.pattern.find(&c).is_none() {
                    continue;
                }
                for (name, value) in &rule.attributes {
                    let entry = (name.clone(), *value, s.file.clone(), rule.line);
                    match attributes.iter_mut().find(|a| a.0 == *name) {
                        Some(slot) => *slot = entry,
                        None => attributes.push(entry),
                    }
                }
            }
        }
        for (name, reason) in [("linguist-generated", "generated"), ("linguist-vendored", "vendored")] {
            if let Some(a) = attributes.iter().find(|a| a.0 == name && a.1 == Some(true)) {
                out.push(FileProtection {
                    file: rel.clone(),
                    reason,
                    declaration: format!("{name} in {}:{}", a.2, a.3),
                    source: Some(a.2.clone()),
                    line: Some(a.3),
                    command: None,
                });
            }
        }
        let over = self.overrides.get(&abs);
        let has_over = over.is_some();
        if !matches!(over, Some(None)) && (has_over || np::is_file(&abs)) {
            let contents = match over {
                Some(Some(c)) => c.clone(),
                _ => match std::fs::read(&abs) {
                    Ok(b) => String::from_utf8_lossy(&b).into_owned(),
                    Err(e) => return Err(ProtectionSourceError::new(&rel, &node_fs_message(&e, "open", &abs))),
                },
            };
            let marker = generated_marker(&contents, &abs);
            let command = generated_command(&contents);
            if let Some(m) = marker {
                out.push(FileProtection { file: rel.clone(), reason: "generated", declaration: m, source: None, line: None, command: command.clone() });
            }
            if let Some(c) = command {
                for p in out.iter_mut() {
                    if p.reason == "generated" && p.command.is_none() {
                        p.command = Some(c.clone());
                    }
                }
            }
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gitignore_semantics() {
        let mut i = Ignore::new(false);
        i.add("node_modules\n*.log\n!keep.log\n/dist/\nsrc/**/gen\n").unwrap();
        assert_eq!(i.test("a/node_modules/x").unwrap().0, true);
        assert_eq!(i.test("x.log").unwrap().0, true);
        assert_eq!(i.test("keep.log").unwrap(), (false, true));
        assert_eq!(i.test("dist/a.js").unwrap().0, true);
        assert_eq!(i.test("a/dist/a.js").unwrap().0, false);
        assert_eq!(i.test("src/a/b/gen").unwrap().0, true);
        assert_eq!(i.test("src/gen").unwrap().0, true);
    }
}
