//! `astryx doctor --built <path>` (port of `api/doctor/built-checks.mjs` and
//! the `--built` readers of `api/doctor/_adapter.mjs`). Source files are read
//! with oxc where the JS reads them with `@babel/parser`.

use super::util::{line_at, locale_compare, plural, JsRe};
use super::{Check, Status};
use crate::doctor_re;
use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};

pub const BUILT_FILE_LIMIT: usize = 20000;
pub const BUILT_FILE_MAX_MB: usize = 5;
const BUILT_FILE_MAX_BYTES: u64 = (BUILT_FILE_MAX_MB as u64) * 1024 * 1024;
const BUILT_SKIPPED_DIRS: &[&str] = &["node_modules", ".git", ".hg", ".sl"];
const BUILD_OUTPUT_DIRS: &[&str] = &[".next", "dist", "build", "out", ".output"];

const SOURCE_EXT: &[&str] = &[".tsx", ".jsx", ".ts", ".js", ".mjs", ".cjs"];
const JSX_EXT: &[&str] = &[".tsx", ".jsx"];
const BUILT_EXT: &[&str] = &[".css", ".html", ".htm", ".js", ".mjs"];
const SHOWN: usize = 5;

const RAW_ELEMENTS: &[(&str, &str)] = &[
    ("div", "`VStack`, `HStack`, `Grid`, `Card`, `Section` or `Center`"),
    ("span", "`Text`"),
    ("p", "`Text`"),
    ("h1", "`Heading`"),
    ("h2", "`Heading`"),
    ("h3", "`Heading`"),
    ("h4", "`Heading`"),
    ("h5", "`Heading`"),
    ("h6", "`Heading`"),
    ("button", "`Button` or `IconButton`"),
    ("a", "`Link`"),
    ("nav", "`LayoutPanel`"),
    ("aside", "`LayoutPanel`"),
    ("header", "`LayoutHeader`"),
    ("main", "`LayoutContent`"),
    ("ul", "`List`"),
    ("ol", "`List`"),
    ("li", "`ListItem`"),
    ("input", "the matching form control"),
    ("textarea", "the matching form control"),
    ("select", "the matching form control"),
    ("table", "`Table`"),
    ("tr", "`Table`"),
    ("td", "`Table`"),
    ("th", "`Table`"),
    ("hr", "`Divider`"),
    ("dialog", "`Dialog`"),
    ("details", "`Collapsible`"),
    ("summary", "`Collapsible`"),
];

const SVG_ELEMENTS: &[&str] = &["svg", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g"];

const ICON_PACKAGES: &[&str] = &[
    "lucide-react",
    "react-icons",
    "@heroicons/react",
    "@tabler/icons-react",
    "@phosphor-icons/react",
    "react-feather",
    "@mui/icons-material",
    "@fortawesome/react-fontawesome",
    "@radix-ui/react-icons",
];

fn extension_of(rel: &str) -> String {
    let name = &rel[rel.rfind('/').map(|i| i + 1).unwrap_or(0)..];
    match name.rfind('.') {
        Some(d) if d > 0 => name[d..].to_lowercase(),
        _ => String::new(),
    }
}

#[derive(Debug, Clone)]
pub struct Finding {
    pub category: &'static str,
    pub file: String,
    pub line: usize,
    pub message: String,
}

#[derive(Debug, Default)]
pub struct Scan {
    pub source_files: usize,
    pub jsx_files: usize,
    pub built_files: usize,
    pub imports: usize,
    pub import_files: usize,
    pub component_uses: usize,
    pub packages: Vec<String>,
    pub stylesheets: Vec<String>,
    pub findings: Vec<Finding>,
    pub truncated: bool,
    pub unread: usize,
    pub unread_files: Vec<String>,
    pub missing_links: usize,
}

pub struct BuiltFile {
    pub rel: String,
    pub built: bool,
    pub path: PathBuf,
}

impl BuiltFile {
    fn read(&self) -> Option<String> {
        let md = std::fs::metadata(&self.path).ok()?;
        if md.len() > BUILT_FILE_MAX_BYTES {
            return None;
        }
        let bytes = std::fs::read(&self.path).ok()?;
        Some(String::from_utf8_lossy(&bytes).into_owned())
    }
}

fn is_astryx_specifier(spec: &str, packages: &[String]) -> bool {
    spec.starts_with("@astryxdesign/") || packages.iter().any(|n| spec == n || spec.starts_with(&format!("{n}/")))
}

fn is_icon_specifier(spec: &str) -> bool {
    ICON_PACKAGES.iter().any(|n| spec == *n || spec.starts_with(&format!("{n}/")))
}

/// `path.resolve(cwd, target)` when it exists.
pub fn resolve_built_path(cwd: &Path, target: &str) -> Option<PathBuf> {
    let resolved = super::support::resolve(cwd, target);
    if resolved.exists() {
        Some(resolved)
    } else {
        None
    }
}

fn rel_slash(from: &Path, to: &Path) -> String {
    super::support::relative(from, to)
}

/// `readBuiltPath`.
pub fn read_built_path(target: &Path, file_limit: usize) -> (Vec<BuiltFile>, bool, usize) {
    if !target.is_dir() {
        let parent = target.parent().unwrap_or(Path::new("/"));
        let in_build = parent.to_string_lossy().split('/').any(|p| BUILD_OUTPUT_DIRS.contains(&p));
        let name = target.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let mut files = vec![BuiltFile { rel: name, built: in_build, path: target.to_path_buf() }];
        let mut missing = 0;
        let target_s = target.to_string_lossy();
        if doctor_re!(r"\.html?$", "iu").find(&target_s).is_some() {
            let raw = files[0].read().unwrap_or_default();
            let page = doctor_re!(r"<!--[\s\S]*?-->", "g").replace_all(&raw, " ");
            let mut seen: HashSet<PathBuf> = HashSet::new();
            seen.insert(target.to_path_buf());
            let re = doctor_re!(
                r##"<(?:link|script)\b[^>]*?\b(?:href|src)\s*=\s*(?:"([^"#?]+)|'([^'#?]+)|([^\s"'#?>]+))"##,
                "giu"
            );
            for m in re.find_iter(&page) {
                let whole = &page[m.range()];
                let href = (1..=3).find_map(|i| m.group(i)).map(|r| &page[r]).unwrap_or("");
                if doctor_re!(r"^(?:[a-z][\w+.-]*:|\/\/)", "iu").find(href).is_some() {
                    continue;
                }
                let stripped = href.strip_prefix('/').unwrap_or(href);
                let mut file = super::support::resolve(parent, stripped);
                if href.starts_with('/') {
                    let mut dir = parent.to_path_buf();
                    loop {
                        let cand = super::support::join(&dir, href);
                        if cand.exists() {
                            file = cand;
                            break;
                        }
                        match dir.parent() {
                            Some(p) if p != dir => dir = p.to_path_buf(),
                            _ => break,
                        }
                    }
                }
                if seen.contains(&file) {
                    continue;
                }
                if !file.exists() {
                    if doctor_re!(r"\.css$", "iu").find(href).is_some()
                        || doctor_re!(r#"\brel\s*=\s*["']?stylesheet"#, "iu").find(whole).is_some()
                    {
                        missing += 1;
                    }
                    continue;
                }
                seen.insert(file.clone());
                files.push(BuiltFile { rel: rel_slash(parent, &file), built: true, path: file });
            }
        }
        return (files, false, missing);
    }
    let mut files = Vec::new();
    let base = target.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let mut stack = vec![(target.to_path_buf(), BUILD_OUTPUT_DIRS.contains(&base.as_str()))];
    while let Some((dir, built)) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        let mut entries: Vec<(String, std::fs::FileType)> = rd
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_type().ok().map(|t| (e.file_name().to_string_lossy().into_owned(), t)))
            .collect();
        entries.sort_by(|a, b| locale_compare(&a.0, &b.0));
        for (name, ft) in entries {
            let full = dir.join(&name);
            if ft.is_dir() {
                if BUILT_SKIPPED_DIRS.contains(&name.as_str()) {
                    continue;
                }
                stack.push((full, built || BUILD_OUTPUT_DIRS.contains(&name.as_str())));
            } else if ft.is_file() {
                if files.len() >= file_limit {
                    return (files, true, 0);
                }
                files.push(BuiltFile { rel: rel_slash(target, &full), built, path: full });
            }
        }
    }
    (files, false, 0)
}

struct Import {
    spec: String,
    names: Vec<String>,
    at: usize,
}

/// What the JS reads from `@babel/parser`'s tree, read from oxc's.
struct Parsed {
    comments: Vec<(usize, usize)>,
    imports: Vec<Import>,
    has_jsx: bool,
}

fn parse_source(text: &str, ext: &str) -> Option<Parsed> {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::*;
    use oxc_ast_visit::{walk, Visit};
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    let typescript = doctor_re!(r"^\.[cm]?tsx?$").find(ext).is_some();
    let jsx = ext == ".tsx" || !typescript;
    let st = SourceType::unambiguous().with_typescript(typescript).with_jsx(jsx);
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, text, st).parse();
    if ret.fatal_error {
        return None;
    }
    let program = &ret.program;
    let comments = program.comments.iter().map(|c| (c.span.start as usize, c.span.end as usize)).collect();
    let mut imports = Vec::new();
    for stmt in &program.body {
        match stmt {
            Statement::ImportDeclaration(d) => {
                if d.import_kind.is_type() {
                    continue;
                }
                let specs = d.specifiers.as_ref();
                let all = specs.map(|s| s.len()).unwrap_or(0);
                let values: Vec<String> = specs
                    .map(|s| {
                        s.iter()
                            .filter_map(|sp| match sp {
                                ImportDeclarationSpecifier::ImportSpecifier(x) => {
                                    if x.import_kind.is_type() {
                                        None
                                    } else {
                                        Some(x.local.name.to_string())
                                    }
                                }
                                ImportDeclarationSpecifier::ImportDefaultSpecifier(x) => Some(x.local.name.to_string()),
                                ImportDeclarationSpecifier::ImportNamespaceSpecifier(x) => Some(x.local.name.to_string()),
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                if all > 0 && values.is_empty() {
                    continue;
                }
                imports.push(Import { spec: d.source.value.display().to_string(), names: values, at: d.span.start as usize });
            }
            Statement::ExportFromDeclaration(d) => {
                if d.export_kind.is_type() {
                    continue;
                }
                if !d.specifiers.is_empty() && d.specifiers.iter().all(|s| s.export_kind.is_type()) {
                    continue;
                }
                imports.push(Import { spec: d.source.value.display().to_string(), names: vec![], at: d.span.start as usize });
            }
            Statement::ExportAllDeclaration(d) => {
                if d.export_kind.is_type() {
                    continue;
                }
                imports.push(Import { spec: d.source.value.display().to_string(), names: vec![], at: d.span.start as usize });
            }
            _ => {}
        }
    }
    struct V {
        calls: Vec<Import>,
        jsx: bool,
    }
    impl<'a> Visit<'a> for V {
        fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
            if let Expression::Identifier(id) = &it.callee {
                if id.name == "require" {
                    if let Some(Argument::StringLiteral(s)) = it.arguments.first() {
                        self.calls.push(Import { spec: s.value.display().to_string(), names: vec![], at: it.span.start as usize });
                    }
                }
            }
            walk::walk_call_expression(self, it);
        }
        fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
            if let Expression::StringLiteral(s) = &it.source {
                self.calls.push(Import { spec: s.value.display().to_string(), names: vec![], at: it.span.start as usize });
            }
            walk::walk_import_expression(self, it);
        }
        fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
            self.jsx = true;
            walk::walk_jsx_element(self, it);
        }
        fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
            self.jsx = true;
            walk::walk_jsx_fragment(self, it);
        }
    }
    let mut v = V { calls: vec![], jsx: false };
    v.visit_program(program);
    // Babel's walk pops a stack, so calls come out last-first.
    v.calls.reverse();
    imports.extend(v.calls);
    Some(Parsed { comments, imports, has_jsx: v.jsx })
}

fn blank(text: &str, ranges: &[(usize, usize)]) -> String {
    let mut out = text.as_bytes().to_vec();
    for &(s, e) in ranges {
        for b in out.iter_mut().take(e.min(text.len())).skip(s) {
            if *b != b'\n' {
                *b = b' ';
            }
        }
    }
    // Blanking whole bytes of a multi-byte char keeps the text valid UTF-8
    // only when ranges hold whole chars; comment spans always do.
    String::from_utf8(out).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

fn scan_out_comments(text: &str) -> String {
    let b = text.as_bytes();
    let mut out = b.to_vec();
    let mut quote: Option<u8> = None;
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if let Some(q) = quote {
            if c == b'\\' {
                i += 1;
            } else if c == q || (c == b'\n' && q != b'`') {
                quote = None;
            }
            i += 1;
            continue;
        }
        if c == b'"' || c == b'\'' || c == b'`' {
            quote = Some(c);
            i += 1;
            continue;
        }
        if c != b'/' {
            i += 1;
            continue;
        }
        let next = b.get(i + 1).copied();
        if next != Some(b'/') && next != Some(b'*') {
            i += 1;
            continue;
        }
        let end = if next == Some(b'/') {
            text[i..].find('\n').map(|p| i + p).unwrap_or(b.len())
        } else {
            match text[i + 2..].find("*/") {
                Some(p) => i + 2 + p + 2,
                None => b.len(),
            }
        };
        for x in out.iter_mut().take(end).skip(i) {
            if *x != b'\n' {
                *x = b' ';
            }
        }
        i = end;
    }
    String::from_utf8(out).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

fn imports_of(text: &str) -> Vec<Import> {
    let mut found = Vec::new();
    let all_types = |list: &str| {
        let parts: Vec<&str> = list.split(',').map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
        !parts.is_empty() && parts.iter().all(|p| doctor_re!(r"^type\s").find(p).is_some())
    };
    let re = doctor_re!(r#"\bimport\s+(type\s+)?([^'";]*?)\s+from\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]"#, "g");
    for m in re.find_iter(text) {
        let at = m.start();
        if let Some(r) = m.group(4) {
            found.push(Import { spec: text[r].to_string(), names: vec![], at });
            continue;
        }
        if m.group(1).is_some() {
            continue;
        }
        let clause = m.group(2).map(|r| &text[r]).unwrap_or("");
        if let Some(ob) = doctor_re!(r"^\{([\s\S]*)\}$").find(clause.trim()) {
            let t = clause.trim();
            if all_types(&t[ob.group(1).unwrap()]) {
                continue;
            }
        }
        let mut names = Vec::new();
        if let Some(br) = doctor_re!(r"\{([\s\S]*)\}").find(clause) {
            for part in clause[br.group(1).unwrap()].split(',') {
                let p = part.trim();
                let p = doctor_re!(r"^type\s+").replace(p, "");
                let local = doctor_re!(r"\s+as\s+").split(&p).last().map(|s| s.trim().to_string());
                if let Some(l) = local {
                    if !l.is_empty() {
                        names.push(l);
                    }
                }
            }
        }
        let outside = doctor_re!(r"\{[\s\S]*\}").replace(clause, "");
        for part in outside.split(',') {
            let name = doctor_re!(r"^\*\s+as\s+").replace(part.trim(), "").to_string();
            if doctor_re!(r"^[A-Za-z_$][\w$]*$").find(&name).is_some() {
                names.push(name);
            }
        }
        found.push(Import { spec: text[m.group(3).unwrap()].to_string(), names, at });
    }
    let re = doctor_re!(r#"\bexport\s+(type\s+)?(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s+['"]([^'"]+)['"]"#, "g");
    for m in re.find_iter(text) {
        if m.group(1).is_some() {
            continue;
        }
        let list = &text[m.group(2).unwrap()];
        if let Some(l) = doctor_re!(r"^\{([\s\S]*)\}$").find(list) {
            if all_types(&list[l.group(1).unwrap()]) {
                continue;
            }
        }
        found.push(Import { spec: text[m.group(3).unwrap()].to_string(), names: vec![], at: m.start() });
    }
    let re = doctor_re!(r#"\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)"#, "g");
    for m in re.find_iter(text) {
        let r = m.group(1).or_else(|| m.group(2)).unwrap();
        found.push(Import { spec: text[r].to_string(), names: vec![], at: m.start() });
    }
    found
}

fn jsx_findings(text: &str, rel: &str, icon_names: &[String]) -> Vec<Finding> {
    let mut findings = Vec::new();
    for m in doctor_re!(r"<([a-z][a-z0-9]*)(?=[\s/>])([^>]*)", "g").find_iter(text) {
        let tag = &text[m.group(1).unwrap()];
        let line = line_at(text, m.start());
        if SVG_ELEMENTS.contains(&tag) {
            if tag == "svg" {
                findings.push(Finding {
                    category: "Icons",
                    file: rel.into(),
                    line,
                    message: "raw `<svg>`: render icons through `Icon`, `IconButton` or an icon prop".into(),
                });
            }
            continue;
        }
        let Some((_, owner)) = RAW_ELEMENTS.iter().find(|(t, _)| *t == tag) else { continue };
        if tag == "input" && doctor_re!(r#"\btype\s*=\s*["']hidden["']"#).find(&text[m.group(2).unwrap()]).is_some() {
            continue;
        }
        findings.push(Finding {
            category: "Astryx components",
            file: rel.into(),
            line,
            message: format!("raw `<{tag}>`: use {owner}"),
        });
    }
    for name in icon_names {
        let pat = format!("<{}(?=[\\s/>])", name.replace('$', "\\$"));
        if let Ok(re) = regress::Regex::with_flags(&pat, "g") {
            for m in re.find_iter(text) {
                findings.push(Finding {
                    category: "Icons",
                    file: rel.into(),
                    line: line_at(text, m.start()),
                    message: format!("`<{name}>` from an icon library: render it through `Icon` or an icon prop"),
                });
            }
        }
    }
    for (re, what) in [
        (doctor_re!(r"\bstyle\s*=\s*\{", "g"), "an inline `style`"),
        (doctor_re!(r"\bclassName\s*=", "g"), "a `className`"),
    ] {
        for m in re.find_iter(text) {
            findings.push(Finding {
                category: "Styling",
                file: rel.into(),
                line: line_at(text, m.start()),
                message: format!("{what}: use a component prop or token first"),
            });
        }
    }
    findings
}

fn package_root(spec: &str) -> String {
    let n = if spec.starts_with('@') { 2 } else { 1 };
    spec.split('/').take(n).collect::<Vec<_>>().join("/")
}

/// `scanBuilt`.
pub fn scan_built(target: &Path, packages: &[String], file_limit: usize) -> Scan {
    let (files, truncated, missing) = read_built_path(target, file_limit);
    let mut scan = Scan { truncated, missing_links: missing, ..Default::default() };
    let mut imported: BTreeSet<String> = BTreeSet::new();
    for f in &files {
        let ext = extension_of(&f.rel);
        let ext = ext.as_str();
        let is_source = SOURCE_EXT.contains(&ext) && !f.rel.ends_with(".d.ts") && (!f.built || JSX_EXT.contains(&ext));
        let is_built = BUILT_EXT.contains(&ext) && (f.built || !is_source);
        if !is_source && !is_built {
            continue;
        }
        let Some(raw) = f.read() else {
            if is_source {
                scan.unread += 1;
                scan.unread_files.push(f.rel.clone());
            }
            continue;
        };
        if is_built {
            scan.built_files += 1;
            let styles = if ext == ".css" || ext == ".html" || ext == ".htm" {
                doctor_re!(r"\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->", "g").replace_all(&raw, " ")
            } else {
                raw.clone()
            };
            if doctor_re!(r"@layer\s+[^{;]*\bastryx-(?:base|theme)\b|--astryx-[\w-]+").find(&styles).is_some() {
                scan.stylesheets.push(f.rel.clone());
            }
            if ext == ".css" {
                for m in doctor_re!(r#"@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)"#, "g").find_iter(&styles) {
                    let spec = &styles[m.group(1).unwrap()];
                    if !is_astryx_specifier(spec, packages) {
                        continue;
                    }
                    scan.imports += 1;
                    scan.import_files += 1;
                    imported.insert(package_root(spec));
                }
            }
        }
        if !is_source {
            continue;
        }
        scan.source_files += 1;
        let parsed = parse_source(&raw, ext);
        let text = match &parsed {
            Some(p) => blank(&raw, &p.comments),
            None => scan_out_comments(&raw),
        };
        let mut astryx_names: Vec<String> = Vec::new();
        let mut icon_names: Vec<String> = Vec::new();
        let mut file_imports = 0;
        let imports = match &parsed {
            Some(p) => p.imports.iter().map(|i| Import { spec: i.spec.clone(), names: i.names.clone(), at: i.at }).collect(),
            None => imports_of(&text),
        };
        for imp in imports {
            if is_astryx_specifier(&imp.spec, packages) {
                file_imports += 1;
                imported.insert(package_root(&imp.spec));
                for n in imp.names {
                    if !astryx_names.contains(&n) {
                        astryx_names.push(n);
                    }
                }
            } else if is_icon_specifier(&imp.spec) {
                for n in imp.names {
                    if !icon_names.contains(&n) {
                        icon_names.push(n);
                    }
                }
            } else if doctor_re!(r"\.(?:css|scss|sass|less)$").find(&imp.spec).is_some() {
                scan.findings.push(Finding {
                    category: "Styling",
                    file: f.rel.clone(),
                    line: line_at(&text, imp.at),
                    message: format!("imports the stylesheet `{}`: use component props and tokens", imp.spec),
                });
            }
        }
        for m in doctor_re!(r"\bstylex\.create\s*\(", "g").find_iter(&text) {
            scan.findings.push(Finding {
                category: "Styling",
                file: f.rel.clone(),
                line: line_at(&text, m.start()),
                message: "a `stylex.create` declaration: use a component prop or token first".into(),
            });
        }
        scan.imports += file_imports;
        if file_imports > 0 {
            scan.import_files += 1;
        }
        for name in &astryx_names {
            if !name.starts_with(|c: char| c.is_ascii_uppercase()) {
                continue;
            }
            let pat = format!("<{name}(?=[\\s/>.])");
            if let Ok(re) = regress::Regex::with_flags(&pat, "g") {
                scan.component_uses += re.find_iter(&text).count();
            }
        }
        let js_like = doctor_re!(r"\.[cm]?js$", "u").find(ext).is_some();
        if parsed.is_none() && (JSX_EXT.contains(&ext) || js_like) {
            scan.unread += 1;
            scan.unread_files.push(f.rel.clone());
            continue;
        }
        let jsx = if js_like { has_jsx(&text) } else { Some(false) };
        let Some(jsx) = jsx else {
            scan.unread += 1;
            scan.unread_files.push(f.rel.clone());
            continue;
        };
        if JSX_EXT.contains(&ext) || jsx {
            scan.jsx_files += 1;
            scan.findings.extend(jsx_findings(&text, &f.rel, &icon_names));
        }
    }
    // Set iteration order is insertion order in JS; `[...imported].sort()`
    // sorts by UTF-16 code units, which matches byte order for these names.
    scan.packages = imported.into_iter().collect();
    scan.findings.sort_by(|a, b| locale_compare(&a.file, &b.file).then(a.line.cmp(&b.line)));
    scan
}

/// `hasJsx` on comment-blanked text: parsed as JSX (`.js`, `.mjs`, `.cjs`).
fn has_jsx(text: &str) -> Option<bool> {
    if doctor_re!(r"<(?:[A-Za-z]|>)").find(text).is_none() {
        return Some(false);
    }
    parse_source(text, ".js").map(|p| p.has_jsx)
}

/// `checkBuilt`.
pub fn check_built(target: &str, cwd: &Path, packages: &[String], file_limit: usize) -> Vec<Check> {
    let fmt = |c: &str| crate::cli::env::format_cli_command_at(cwd, c);
    let usage_id = "built-astryx-usage";
    let usage_label = "Built output uses Astryx";
    let Some(resolved) = resolve_built_path(cwd, target) else {
        return vec![Check::new(usage_id, usage_label, Status::Fail, format!("{target} does not exist, so nothing was checked."))
            .fix("Pass the project folder, the build output folder, or the built HTML file.")];
    };
    let scan = scan_built(&resolved, packages, file_limit);
    let used = scan.imports > 0 || scan.component_uses > 0 || !scan.stylesheets.is_empty();
    let read = format!(
        "{} and {}{}",
        plural(scan.source_files, "source file"),
        plural(scan.built_files, "built file"),
        if scan.truncated { format!(" (the first {file_limit} files)") } else { String::new() }
    );
    let mut evidence = Vec::new();
    if scan.imports > 0 {
        evidence.push(format!(
            "{} from {} in {}",
            plural(scan.imports, "import"),
            scan.packages.join(", "),
            plural(scan.import_files, "file")
        ));
    }
    if scan.component_uses > 0 {
        evidence.push(plural(scan.component_uses, "component use"));
    }
    if !scan.stylesheets.is_empty() {
        let n = scan.stylesheets.len();
        evidence.push(format!(
            "Astryx styles in {}{}",
            scan.stylesheets.iter().take(3).cloned().collect::<Vec<_>>().join(", "),
            if n > 3 { format!(" and {} more", n - 3) } else { String::new() }
        ));
    }
    let usage = if used {
        Check::new(usage_id, usage_label, Status::Pass, format!("Read {read}: {}.", evidence.join("; ")))
    } else if scan.source_files == 0 && scan.built_files == 0 && scan.unread == 0 && !scan.truncated {
        Check::new(usage_id, usage_label, Status::Fail, format!("{target} holds no source or built files, so nothing was checked."))
            .fix("Pass the project folder, the build output folder, or the built HTML file.")
    } else if scan.truncated || scan.unread > 0 || scan.missing_links > 0 {
        let mut why = Vec::new();
        if scan.truncated {
            why.push(format!("the rest past the first {file_limit} files"));
        }
        if scan.unread > 0 {
            why.push(format!("{} over {BUILT_FILE_MAX_MB} MB, unreadable or unparsed", plural(scan.unread, "source file")));
        }
        if scan.missing_links > 0 {
            why.push(format!("{} the page links but that are not there", plural(scan.missing_links, "file")));
        }
        Check::new(
            usage_id,
            usage_label,
            Status::Warn,
            format!(
                "Read {read} and found no Astryx in them, but {} went unread, so this does not show whether the output uses Astryx.",
                why.join(" and ")
            ),
        )
        .fix(format!("Run `{}` on the folder that holds the page itself, or on its build output.", fmt("doctor --built <folder>")))
    } else {
        Check::new(
            usage_id,
            usage_label,
            Status::Fail,
            format!("Read {read}: no value import from an Astryx package (a type-only import is erased from the build), no Astryx component, and no Astryx styles, so this output does not use Astryx."),
        )
        .fix(format!(
            "Rebuild the page from an Astryx template: run `{}`, scaffold the template it names, and fill it with Astryx components. Do not deliver this output.",
            fmt("build \"<what the page is>\"")
        ))
    };
    let unread_names = format!(
        "{}{}",
        scan.unread_files.iter().take(SHOWN).cloned().collect::<Vec<_>>().join(", "),
        if scan.unread_files.len() > SHOWN { format!(" and {} more", scan.unread_files.len() - SHOWN) } else { String::new() }
    );
    let unread_note = if scan.unread > 0 {
        format!(
            " {} went unread (over {BUILT_FILE_MAX_MB} MB, unreadable or not parsed), so {} not inspected: {unread_names}.",
            plural(scan.unread, "source file"),
            if scan.unread == 1 { "it was" } else { "they were" }
        )
    } else {
        String::new()
    };
    let pid = "built-astryx-purity";
    let plabel = "Source uses Astryx well";
    let purity = if scan.jsx_files == 0 {
        Check::new(
            pid,
            plabel,
            Status::Info,
            format!(
                "Not inspected: {} under {target} and no JSX read among them, so components, icons and styles were not checked. A bundle or other build output is not source.{unread_note}",
                plural(scan.source_files, "source file")
            ),
        )
        .fix(format!("Run `{}` on the folder that holds the page's source.", fmt("doctor --built <project folder>")))
    } else if scan.findings.is_empty() && (scan.truncated || scan.unread > 0) {
        Check::new(
            pid,
            plabel,
            Status::Info,
            format!(
                "Not fully inspected: {} with JSX had no finding{}.{unread_note}",
                plural(scan.jsx_files, "source file"),
                if scan.truncated { format!(", but only the first {file_limit} files were read") } else { String::new() }
            ),
        )
        .fix(format!("Run `{}` on the folder that holds the page's own source.", fmt("doctor --built <folder>")))
    } else if scan.findings.is_empty() {
        Check::new(
            pid,
            plabel,
            Status::Pass,
            format!(
                "{} with JSX: no raw element Astryx has a component for, no hand-drawn or library icon, and no custom styling.",
                plural(scan.jsx_files, "source file")
            ),
        )
    } else {
        let mut by: Vec<(&str, usize)> = Vec::new();
        for f in &scan.findings {
            match by.iter_mut().find(|(c, _)| *c == f.category) {
                Some(e) => e.1 += 1,
                None => by.push((f.category, 1)),
            }
        }
        let counts = by.iter().map(|(c, n)| format!("{c} {n}")).collect::<Vec<_>>().join(", ");
        let shown = scan
            .findings
            .iter()
            .take(SHOWN)
            .map(|f| format!("{}:{} {}", f.file, f.line, f.message))
            .collect::<Vec<_>>()
            .join("; ");
        let more = if scan.findings.len() > SHOWN { format!("; and {} more", scan.findings.len() - SHOWN) } else { String::new() };
        Check::new(
            pid,
            plabel,
            Status::Warn,
            format!(
                "{} ({counts}): {shown}{more}.{unread_note}{}",
                plural(scan.findings.len(), "finding"),
                if scan.truncated { format!(" Only the first {file_limit} files were read.") } else { String::new() }
            ),
        )
        .fix(format!(
            "Replace each with the Astryx component, icon surface, prop or token it names; `{}` has the full rubric. Keep a raw element only where its native meaning is needed.",
            fmt("docs is-my-code-good")
        ))
    };
    vec![usage, purity]
}
