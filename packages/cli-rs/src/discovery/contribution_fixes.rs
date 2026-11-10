//! Port of `foundation/integrations/contribution-fixes.mjs`: the Fix text
//! doctor prints for a contribution a package's roots cannot reach. The
//! static stamp and import reads use oxc where the JS uses jscodeshift.

use super::integrations::{self as integ, Record};
use super::nodepath as np;
use std::cell::RefCell;
use std::collections::HashMap;

pub const DOC_CANDIDATE_RE: &str = r"\.doc\.(?:ts|mjs|js)$";
pub const TEMPLATE_CANDIDATE_RE: &str = r"\.template\.(?:ts|mjs|js)$";
pub const CODEMOD_FILE_RE: &str = r"\.(?:ts|mjs|js)$";
pub const CODEMOD_TEST_RE: &str = r"\.(?:test|spec|fixture)\.(?:ts|mjs|js)$";
pub const CODEMOD_SKIP_DIRS: [&str; 4] = ["node_modules", ".git", "__tests__", "__fixtures__"];
const STATIC_DOC_TYPES: [&str; 5] = ["component", "generic", "page", "block", "theme"];
const STATIC_TEMPLATE_TYPES: [&str; 2] = ["page", "block"];
const METADATA_ROOTS: [&str; 4] = ["components", "templates", "docs", "themes"];
const FOLDER_SCAN_LIMIT: usize = 5_000;
const THEME_DOC_SUFFIX: &str = ".doc.mjs";
const THEME_MODULE_EXTENSIONS: [&str; 6] = [".mjs", ".js", ".mts", ".ts", ".tsx", ".jsx"];

fn jstr(v: oxc::str::JSStr) -> String {
    v.as_str().map(String::from).unwrap_or_else(|| v.display().to_string())
}

fn re_test(re: &str, s: &str) -> bool {
    regress::Regex::with_flags(re, "u").unwrap().find(s).is_some()
}

fn is_doc_candidate(name: &str) -> bool {
    re_test(DOC_CANDIDATE_RE, name)
}

fn is_template_candidate(name: &str) -> bool {
    re_test(TEMPLATE_CANDIDATE_RE, name)
}

fn theme_slug_ok(s: &str) -> bool {
    re_test(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$", s)
}

/// `ROOT_FOR_TYPE[type]`.
pub fn root_for_type(t: &str) -> Option<&'static str> {
    match t {
        "component" => Some("components"),
        "generic" => Some("docs"),
        "page" | "block" => Some("templates"),
        "theme" => Some("themes"),
        _ => None,
    }
}

fn root_holds(k: &str) -> &'static str {
    match k {
        "components" => "components",
        "docs" => "topics",
        "templates" => "templates",
        _ => "themes",
    }
}

/// A static contribution stamp (`{type, name}`).
#[derive(Debug, Clone, PartialEq)]
pub struct Stamp {
    pub kind: String,
    pub name: Option<String>,
}

/// `readContributionStamp(file, templateOnly)`.
pub fn read_contribution_stamp(file: &str, template_only: bool) -> Option<Stamp> {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::*;
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    let source = np::read_text(file)?;
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, &source, SourceType::tsx()).parse();
    if ret.diagnostics.has_errors() {
        return None;
    }
    fn unwrap<'b, 'a>(e: &'b Expression<'a>) -> &'b Expression<'a> {
        let mut cur = e;
        loop {
            cur = match cur {
                Expression::TSSatisfiesExpression(x) => &x.expression,
                Expression::TSAsExpression(x) => &x.expression,
                Expression::ParenthesizedExpression(x) => &x.expression,
                _ => break,
            };
        }
        if let Expression::CallExpression(c) = cur {
            if let Some(first) = c.arguments.first() {
                if let Some(e) = first.as_expression() {
                    return unwrap(e);
                }
            }
        }
        cur
    }
    let mut defaults: Vec<&Expression> = Vec::new();
    let mut named: Vec<&Expression> = Vec::new();
    for stmt in &ret.program.body {
        match stmt {
            Statement::ExportDefaultDeclaration(d) => {
                if let Some(e) = d.declaration.as_expression() {
                    defaults.push(e);
                }
            }
            Statement::ExportDeclaration(d) => {
                if let Declaration::VariableDeclaration(v) = &d.declaration {
                    for decl in &v.declarations {
                        if let BindingPattern::BindingIdentifier(id) = &decl.id {
                            if id.name == "docs" {
                                if let Some(init) = &decl.init {
                                    named.push(init);
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    let allowed: &[&str] = if template_only { &STATIC_TEMPLATE_TYPES } else { &STATIC_DOC_TYPES };
    for cand in defaults.into_iter().chain(named) {
        let Expression::ObjectExpression(obj) = unwrap(cand) else { continue };
        let field = |name: &str| -> Option<&Expression> {
            for p in &obj.properties {
                let ObjectPropertyKind::ObjectProperty(p) = p else { continue };
                if p.computed || p.method || p.kind != PropertyKind::Init {
                    continue;
                }
                let hit = match &p.key {
                    PropertyKey::StaticIdentifier(id) => id.name == name,
                    PropertyKey::StringLiteral(s) => s.value.as_str() == Some(name),
                    _ => false,
                };
                if hit {
                    return Some(unwrap(&p.value));
                }
            }
            None
        };
        if let Some(Expression::StringLiteral(t)) = field("type") {
            if allowed.contains(&t.value.as_str().unwrap_or("\u{0}")) {
                let name = match field("name") {
                    Some(Expression::StringLiteral(n)) => Some(jstr(n.value)),
                    _ => None,
                };
                return Some(Stamp { kind: jstr(t.value), name });
            }
        }
    }
    None
}

/// `pathIsInside(candidate, root)`.
pub fn path_is_inside(candidate: &str, root: &str) -> bool {
    candidate == root || candidate.starts_with(&format!("{root}/"))
}

/// `createFixContext(packageDir, integration)`.
pub struct FixContext {
    pub package_dir: String,
    pub manifest: String,
    /// components, templates, codemods, docs, themes.
    pub roots: Vec<(&'static str, Option<String>)>,
    stamps: RefCell<HashMap<String, Option<Stamp>>>,
    candidates: RefCell<HashMap<String, Option<Vec<String>>>>,
}

/// `createFixContext(packageDir, integration)`.
pub fn create_fix_context(package_dir: &str, integration: &Record) -> FixContext {
    let root = |k: &str| integ::s(integration, k).filter(|v| !v.is_empty()).map(String::from);
    FixContext {
        package_dir: package_dir.into(),
        manifest: integ::s(integration, "__manifestFile").filter(|m| !m.is_empty()).map(np::basename).unwrap_or_else(|| "astryx.integration.mjs".into()),
        roots: vec![
            ("components", root("components")),
            ("templates", root("templates")),
            ("codemods", root("codemods")),
            ("docs", root("docs")),
            ("themes", root("themes")),
        ],
        stamps: RefCell::new(HashMap::new()),
        candidates: RefCell::new(HashMap::new()),
    }
}

impl FixContext {
    pub fn root(&self, k: &str) -> Option<&str> {
        self.roots.iter().find(|(n, _)| *n == k).and_then(|(_, r)| r.as_deref())
    }
    fn declared(&self) -> Vec<&str> {
        self.roots.iter().filter_map(|(_, r)| r.as_deref()).collect()
    }
}

/// `stampOf(context, file)`.
pub fn stamp_of(ctx: &FixContext, file: &str) -> Option<Stamp> {
    if let Some(s) = ctx.stamps.borrow().get(file) {
        return s.clone();
    }
    let s = read_contribution_stamp(file, is_template_candidate(file));
    ctx.stamps.borrow_mut().insert(file.into(), s.clone());
    s
}

fn shown(ctx: &FixContext, file: &str) -> String {
    np::relative(&ctx.package_dir, file)
}

fn candidates_under(ctx: &FixContext, dir: &str) -> Option<Vec<String>> {
    if let Some(c) = ctx.candidates.borrow().get(dir) {
        return c.clone();
    }
    let mut found: Option<Vec<String>> = Some(Vec::new());
    let mut seen = 0usize;
    fn walk(cur: &str, found: &mut Option<Vec<String>>, seen: &mut usize) {
        let Some(entries) = np::list_dir_entries(cur) else { return };
        for e in entries {
            if found.is_none() {
                return;
            }
            if e.name == ".git" {
                continue;
            }
            *seen += 1;
            if *seen > FOLDER_SCAN_LIMIT {
                *found = None;
                return;
            }
            let full = np::join2(cur, &e.name);
            if e.is_dir {
                walk(&full, found, seen);
            } else if e.is_file && (is_doc_candidate(&e.name) || is_template_candidate(&e.name)) {
                found.as_mut().unwrap().push(full);
            }
        }
    }
    walk(dir, &mut found, &mut seen);
    ctx.candidates.borrow_mut().insert(dir.into(), found.clone());
    found
}

fn is_free_folder(ctx: &FixContext, dir: &str) -> bool {
    dir != ctx.package_dir && path_is_inside(dir, &ctx.package_dir) && !ctx.declared().iter().any(|r| path_is_inside(r, dir) || path_is_inside(dir, r))
}

fn is_complete_theme(ctx: &FixContext, dir: &str, fixing: Option<&str>) -> bool {
    let Some(found) = candidates_under(ctx, dir) else { return false };
    if found.len() != 1 {
        return false;
    }
    let d = &found[0];
    let stamp = stamp_of(ctx, d);
    let slug = np::basename(dir);
    theme_slug_ok(&slug)
        && np::dirname(d) == dir
        && d.ends_with(THEME_DOC_SUFFIX)
        && stamp.as_ref().map(|s| s.kind == "theme" && s.name.as_deref() == Some(slug.as_str())).unwrap_or(false)
        && (Some(d.as_str()) == fixing || (sources_beside(d, "theme").len() == 1 && imports_outside(d).map(|v| v.is_empty()).unwrap_or(false)))
}

fn reads_as_themes_root(ctx: &FixContext, dir: &str, except: Option<&str>, ignore: Option<&str>, fixing: Option<&str>) -> bool {
    if !np::exists(dir) {
        return true;
    }
    if np::exists(&np::join2(dir, "manifest.json")) {
        return false;
    }
    let Some(entries) = np::list_dir_entries(dir) else { return false };
    entries.iter().all(|e| {
        let full = np::join2(dir, &e.name);
        if e.name.starts_with('.') {
            return true;
        }
        if e.is_symlink {
            return false;
        }
        if e.is_dir {
            return Some(full.as_str()) == except || !crate::commands::theme::discovery::is_theme_folder(&full) || is_complete_theme(ctx, &full, fixing);
        }
        Some(full.as_str()) == ignore || !(is_doc_candidate(&e.name) || is_template_candidate(&e.name))
    })
}

fn can_be_root(ctx: &FixContext, dir: &str, key: &str, fixing: Option<&str>) -> bool {
    if !is_free_folder(ctx, dir) {
        return false;
    }
    if key == "themes" {
        return reads_as_themes_root(ctx, dir, None, None, fixing);
    }
    let Some(found) = candidates_under(ctx, dir) else { return false };
    let complete = found.iter().all(|f| match stamp_of(ctx, f) {
        Some(s) => root_for_type(&s.kind) == Some(key) && (Some(f.as_str()) == fixing || s.kind == "generic" || !sources_beside(f, &s.kind).is_empty()),
        None => false,
    });
    let names: Vec<String> = found.iter().map(|f| identity(ctx, f, key)).collect();
    let mut uniq = names.clone();
    uniq.sort();
    uniq.dedup();
    complete && uniq.len() == names.len() && (key != "components" || uncovered_sources(dir, &found).is_empty())
}

fn identity(ctx: &FixContext, file: &str, key: &str) -> String {
    if key == "components" {
        return doc_stem(file);
    }
    if key == "docs" {
        return stamp_of(ctx, file).and_then(|s| s.name).map(|n| n.to_lowercase()).unwrap_or_else(|| file.to_string());
    }
    np::join2(&np::dirname(file), &doc_stem(file).to_lowercase())
}

fn uncovered_sources(dir: &str, found: &[String]) -> Vec<String> {
    let covered: Vec<String> = found.iter().filter(|f| is_doc_candidate(f)).map(|f| doc_stem(f)).collect();
    let re = regress::Regex::with_flags(r"^([A-Z][A-Za-z0-9]+)\.tsx$", "u").unwrap();
    let Some(entries) = np::list_dir_entries(dir) else { return vec![] };
    entries
        .into_iter()
        .filter(|e| e.is_file || e.is_symlink)
        .map(|e| e.name)
        .filter(|n| match re.find(n) {
            Some(m) => !covered.contains(&n[m.group(1).unwrap()].to_string()),
            None => false,
        })
        .collect()
}

fn has_entry(dir: &str, name: &str) -> bool {
    let wanted = name.to_lowercase();
    np::list_dir(dir).map(|v| v.iter().any(|e| e.to_lowercase() == wanted)).unwrap_or(false)
}

fn taken_in(ctx: &FixContext, file: &str, stamp: &Stamp, root: &str) -> Option<String> {
    let key = root_for_type(&stamp.kind).unwrap_or("");
    let stem = doc_stem(file);
    let name = identity(ctx, &np::join2(root, &np::basename(file)), key);
    let same = candidates_under(ctx, root).unwrap_or_default().into_iter().find(|other| {
        (key == "templates" || is_doc_candidate(other))
            && if key == "docs" {
                stamp.name.is_some() && stamp_of(ctx, other).and_then(|s| s.name).map(|n| n.to_lowercase()) == stamp.name.as_ref().map(|n| n.to_lowercase())
            } else {
                identity(ctx, other, key) == name
            }
    });
    if let Some(same) = same {
        let kind = match key {
            "components" => "component",
            "docs" => "topic",
            "templates" => "template",
            _ => "undefined",
        };
        let called = if key == "docs" { format!("\"{}\"", stamp.name.clone().unwrap_or_else(|| "null".into())) } else { stem };
        return Some(format!("a {kind} named {called} ({})", shown(ctx, &same)));
    }
    let mut list = vec![np::basename(file)];
    list.extend(sources_beside(file, &stamp.kind));
    list.into_iter().find(|e| has_entry(root, e)).map(|c| format!("a file named {c}"))
}

/// One local import edge.
#[derive(Debug, Clone)]
pub struct Edge {
    pub importer: String,
    pub specifier: String,
    pub target: String,
}

pub(crate) fn import_specifiers(file: &str) -> Option<Vec<String>> {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::*;
    use oxc::ast_visit::{walk, Visit};
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    let source = np::read_text(file)?;
    let ts = re_test(r"\.(?:ts|tsx|mts)$", file);
    let st = if ts { SourceType::tsx() } else { SourceType::jsx() };
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, &source, st).parse();
    if ret.diagnostics.has_errors() {
        return None;
    }
    #[derive(Default)]
    struct V {
        imports: Vec<String>,
        named: Vec<String>,
        all: Vec<String>,
        dynamic: Vec<String>,
    }
    impl<'a> Visit<'a> for V {
        fn visit_import_declaration(&mut self, d: &ImportDeclaration<'a>) {
            self.imports.push(jstr(d.source.value));
            walk::walk_import_declaration(self, d);
        }
        fn visit_export_from_declaration(&mut self, d: &ExportFromDeclaration<'a>) {
            self.named.push(jstr(d.source.value));
            walk::walk_export_from_declaration(self, d);
        }
        fn visit_export_all_declaration(&mut self, d: &ExportAllDeclaration<'a>) {
            self.all.push(jstr(d.source.value));
            walk::walk_export_all_declaration(self, d);
        }
        fn visit_import_expression(&mut self, e: &ImportExpression<'a>) {
            if let Expression::StringLiteral(s) = &e.source {
                self.dynamic.push(jstr(s.value));
            }
            walk::walk_import_expression(self, e);
        }
    }
    let mut v = V::default();
    v.visit_program(&ret.program);
    let mut out = v.imports;
    out.extend(v.named);
    out.extend(v.all);
    out.extend(v.dynamic);
    Some(out)
}

fn local_imports(entry: &str) -> Option<Vec<Edge>> {
    let mut edges = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    let mut queue: std::collections::VecDeque<String> = std::collections::VecDeque::from(vec![entry.to_string()]);
    while let Some(file) = queue.pop_front() {
        if seen.contains(&file) {
            continue;
        }
        seen.push(file.clone());
        let specifiers = import_specifiers(&file)?;
        for spec in specifiers {
            if !spec.starts_with('.') {
                continue;
            }
            let base = np::resolve(&[&np::dirname(&file), &spec]);
            let mut options = vec![base.clone()];
            options.extend(THEME_MODULE_EXTENSIONS.iter().map(|e| format!("{base}{e}")));
            options.extend(THEME_MODULE_EXTENSIONS.iter().map(|e| np::join2(&base, &format!("index{e}"))));
            let Some(target) = options.into_iter().find(|o| np::is_file(o)) else { continue };
            edges.push(Edge { importer: file.clone(), specifier: spec, target: target.clone() });
            if THEME_MODULE_EXTENSIONS.contains(&np::extname(&target).as_str()) {
                queue.push_back(target);
            }
        }
    }
    Some(edges)
}

fn imports_outside(file: &str) -> Option<Vec<Edge>> {
    let Some(source) = sources_beside(file, "theme").into_iter().next() else { return Some(vec![]) };
    let home = np::dirname(file);
    local_imports(&np::join2(&home, &source)).map(|e| e.into_iter().filter(|x| !path_is_inside(&x.target, &home)).collect())
}

fn list_and(items: &[String]) -> String {
    if items.len() == 1 {
        items[0].clone()
    } else {
        format!("{} and {}", items[..items.len() - 1].join(", "), items[items.len() - 1])
    }
}

fn theme_import_note(ctx: &FixContext, file: &str, destination: &str) -> String {
    let Some(source) = sources_beside(file, "theme").into_iter().next() else { return String::new() };
    let home = np::dirname(file);
    let Some(edges) = local_imports(&np::join2(&home, &source)) else { return String::new() };
    let mut copies: Vec<String> = Vec::new();
    for e in &edges {
        if !path_is_inside(&e.target, &home) && !copies.contains(&e.target) {
            copies.push(e.target.clone());
        }
    }
    if copies.is_empty() || copies.iter().any(|t| !path_is_inside(t, &ctx.package_dir)) {
        return String::new();
    }
    let why = ": a theme can import only files inside its own folder.";
    let listed: Vec<String> = copies.iter().map(|t| shown(ctx, t)).collect();
    let list = list_and(&listed);
    let names: Vec<String> = copies.iter().map(|t| np::basename(t).to_lowercase()).collect();
    let mut u = names.clone();
    u.sort();
    u.dedup();
    if u.len() != names.len() || copies.iter().any(|t| has_entry(&home, &np::basename(t))) {
        let them = if copies.len() == 1 { "it at the copy" } else { "them at the copies" };
        return format!(" Also copy {list} into {destination} and point the imports of {them}{why}");
    }
    let in_theme = |t: &str| if path_is_inside(t, &home) { np::relative(&home, t) } else { np::basename(t) };
    let mut changes: Vec<String> = Vec::new();
    for e in &edges {
        let ext = np::extname(&e.specifier);
        let mut next = in_theme(&e.target);
        if !(!ext.is_empty() && e.target.ends_with(&ext)) {
            let ne = np::extname(&next);
            next.truncate(next.len() - ne.len());
        }
        next = np::relative(&np::dirname(&in_theme(&e.importer)), &next);
        if !next.starts_with('.') {
            next = format!("./{next}");
        }
        let change = format!("of {} in {} to {next}", e.specifier, np::basename(&e.importer));
        if next != e.specifier && !changes.contains(&change) {
            changes.push(change);
        }
    }
    let changed = if changes.len() == 1 {
        format!("the import {}", changes[0])
    } else {
        // JS: slice(0,-1).join + ' and ' + at(-1); an empty list gives "undefined".
        let last = changes.last().cloned().unwrap_or_else(|| "undefined".into());
        let head = if changes.is_empty() { String::new() } else { changes[..changes.len() - 1].join(", ") };
        format!("the imports {head} and {last}")
    };
    format!(" Also copy {list} into {destination} and change {changed}{why}")
}

fn sources_beside(file: &str, kind: &str) -> Vec<String> {
    if kind == "generic" {
        return vec![];
    }
    let dir = np::dirname(file);
    let stem = doc_stem(file);
    let names: Vec<String> = if kind == "theme" { THEME_MODULE_EXTENSIONS.iter().map(|e| format!("{stem}{e}")).collect() } else { vec![format!("{stem}.tsx")] };
    names.into_iter().filter(|n| np::is_file(&np::join2(&dir, n))).collect()
}

fn doc_stem(file: &str) -> String {
    let b = np::basename(file);
    let r1 = super::file_protection::js_replace(&b, DOC_CANDIDATE_RE, "u", false, &|_, _, _| String::new());
    super::file_protection::js_replace(&r1, TEMPLATE_CANDIDATE_RE, "u", false, &|_, _, _| String::new())
}

fn source_note(file: &str, kind: &str) -> String {
    let rename = if kind == "theme" && !file.ends_with(THEME_DOC_SUFFIX) {
        format!(" Also rename {} to {}{THEME_DOC_SUFFIX}: a theme descriptor is a {THEME_DOC_SUFFIX} file.", np::basename(file), doc_stem(file))
    } else {
        String::new()
    };
    if kind == "generic" || !sources_beside(file, kind).is_empty() {
        return rename;
    }
    if kind == "theme" {
        format!("{rename} Also add its same-stem theme source, such as {}.ts, beside it.", doc_stem(file))
    } else {
        format!(" Also add {}.tsx beside it.", doc_stem(file))
    }
}

fn place(ctx: &FixContext, dir: &str) -> String {
    if dir == ctx.package_dir {
        "the package root".into()
    } else {
        format!("{}/", shown(ctx, dir))
    }
}

fn capitalize(t: &str) -> String {
    let mut u: Vec<u16> = t.encode_utf16().collect();
    if u.is_empty() {
        return String::new();
    }
    let first = String::from_utf16_lossy(&u[..1]).to_uppercase();
    let rest = String::from_utf16_lossy(&u.split_off(1));
    format!("{first}{rest}")
}

fn holds_only_versions(dir: &str) -> bool {
    if !np::exists(dir) {
        return true;
    }
    let Some(entries) = np::list_dir_entries(dir) else { return false };
    entries.iter().all(|e| {
        if e.is_dir {
            super::semver::is_valid_semver(&e.name) || CODEMOD_SKIP_DIRS.contains(&e.name.as_str())
        } else {
            !re_test(CODEMOD_FILE_RE, &e.name) || re_test(CODEMOD_TEST_RE, &e.name)
        }
    })
}

fn own_codemods_folder(ctx: &FixContext) -> (String, Option<&'static str>) {
    let target = np::join2(&ctx.package_dir, "codemods");
    if ctx.root("codemods") != Some(target.as_str()) && holds_only_versions(&target) {
        (format!("create codemods/, move each version folder into it, and set `codemods: './codemods'` in {}", ctx.manifest), Some("codemods"))
    } else {
        (format!("move each version folder into a new folder of their own, and set `codemods` to that folder in {}", ctx.manifest), None)
    }
}

fn metadata_roots_in(ctx: &FixContext, dir: &str) -> Vec<(&'static str, String)> {
    METADATA_ROOTS.iter().filter_map(|k| ctx.root(k).filter(|r| path_is_inside(r, dir)).map(|r| (*k, r.to_string()))).collect()
}

/// `sharedCodemodsRootFix(context, stray)`.
pub fn shared_codemods_root_fix(ctx: &FixContext, stray: Option<&str>) -> Option<String> {
    let root = ctx.root("codemods")?;
    let (step, folder) = own_codemods_folder(ctx);
    let also = match stray {
        None => String::new(),
        Some(s) => format!(
            " If it is a codemod, move it into the folder named for the version it migrates to, for example {}.",
            match folder {
                Some(f) => format!("{f}/1.2.0/{s}"),
                None => format!("1.2.0/{s} in that folder"),
            }
        ),
    };
    if root == ctx.package_dir {
        return Some(format!(
            "Fix: the codemods root is the package root, so everything in the package is read as a codemod or a version folder. {}.{also}",
            capitalize(&step)
        ));
    }
    if root == np::join2(&ctx.package_dir, "codemods") {
        return None;
    }
    let (kind, held) = metadata_roots_in(ctx, root).into_iter().next()?;
    let relation = if held == root { format!("is also the {kind} root") } else { format!("also holds the {kind} root {}", place(ctx, &held)) };
    Some(format!("Fix: the codemods root {} {relation}. {}.{also}", place(ctx, root), capitalize(&step)))
}

/// `heldRootFix(context, folder)`.
pub fn held_root_fix(ctx: &FixContext, folder: &str) -> Option<String> {
    let (kind, held) = metadata_roots_in(ctx, folder).into_iter().next()?;
    let codemods = ctx.root("codemods")?;
    Some(format!(
        "Fix: it holds the {kind} root {}; move that root out of {} and update `{kind}` in {}.",
        place(ctx, &held),
        place(ctx, codemods),
        ctx.manifest
    ))
}

fn overlap_note(ctx: &FixContext, dir: Option<&str>, key: &str) -> String {
    let covers = |root: Option<&str>| match root {
        None => false,
        Some(r) => match dir {
            None => r == ctx.package_dir,
            Some(d) => path_is_inside(d, r),
        },
    };
    let at = match dir {
        None => "that folder".to_string(),
        Some(d) => place(ctx, d),
    };
    let mut note = String::new();
    let codemods = ctx.root("codemods");
    if covers(codemods) {
        let c = codemods.unwrap();
        if dir.is_some() && c == np::join2(&ctx.package_dir, "codemods") {
            return format!(" The codemods root codemods/ also reads {at}; move {at} out of codemods/ and set `{key}` to its new path in {}.", ctx.manifest);
        }
        let which = if c == ctx.package_dir { "is the package root, so it".to_string() } else { place(ctx, c) };
        note = format!(" The codemods root {which} also reads {at}; {}.", own_codemods_folder(ctx).0);
    }
    let own = np::join2(&ctx.package_dir, key);
    let free = !np::exists(&own) && is_free_folder(ctx, &own);
    let m = &ctx.manifest;
    for kind in METADATA_ROOTS {
        let other = ctx.root(kind);
        if kind == key || other.is_none() || !covers(other) {
            continue;
        }
        let other = other.unwrap();
        if other == ctx.package_dir {
            note += &format!(
                " The {kind} root is the package root, so it also reads {at}; create {kind}/, move the {} into it, and set `{kind}: './{kind}'` in {m}.",
                root_holds(kind)
            );
            continue;
        }
        if Some(other) == dir {
            return if free {
                format!("{note} The {kind} root is also {at}; move the {} there into {key}/ and set `{key}: './{key}'` in {m}.", root_holds(key))
            } else {
                format!("{note} The {kind} root is also {at}; move the {} there into a folder of their own and set `{key}` to that folder in {m}.", root_holds(key))
            };
        }
        return if free {
            format!("{note} The {kind} root {} also reads {at}; move {at} to {key}/ and set `{key}: './{key}'` in {m}.", place(ctx, other))
        } else {
            format!("{note} The {kind} root {} also reads {at}; move {at} out of it and set `{key}` to its new path in {m}.", place(ctx, other))
        };
    }
    note
}

fn theme_slug(ctx: &FixContext, file: &str, stamp: &Stamp) -> String {
    let dir = np::dirname(file);
    if let Some(n) = stamp.name.as_ref().filter(|n| !n.is_empty()) {
        return n.clone();
    }
    if dir == ctx.package_dir {
        doc_stem(file)
    } else {
        np::basename(&dir)
    }
}

fn theme_files(ctx: &FixContext, file: &str, target: Option<&str>) -> (String, bool) {
    let dir = np::dirname(file);
    if dir != ctx.package_dir && target.map(|t| !path_is_inside(t, &dir)).unwrap_or(true) && !ctx.declared().iter().any(|r| path_is_inside(r, &dir)) {
        if let Some(found) = candidates_under(ctx, &dir) {
            if found.len() == 1 && found[0] == file {
                return (format!("{}/", shown(ctx, &dir)), true);
            }
        }
    }
    let sources = sources_beside(file, "theme");
    let doc = np::basename(file);
    match sources.len() {
        0 => (doc, false),
        1 => (format!("{doc} and {} (with any local files it imports)", sources[0]), false),
        _ => (format!("{doc} and its same-stem sources (with any local files they import)"), false),
    }
}

fn move_theme(ctx: &FixContext, file: &str, stamp: &Stamp, root: &str, slug: Option<&str>) -> String {
    let slug = slug.map(String::from).unwrap_or_else(|| theme_slug(ctx, file, stamp));
    let (what, folder) = theme_files(ctx, file, Some(&np::join2(root, &slug)));
    let target = format!("{}{slug}/", if root == ctx.package_dir { String::new() } else { format!("{}/", shown(ctx, root)) });
    if folder {
        format!("move {what} to {target}")
    } else {
        format!("move {what} into {target}")
    }
}

fn move_under(ctx: &FixContext, file: &str, stamp: &Stamp, root: &str, destination: Option<&str>) -> (String, String) {
    let key = root_for_type(&stamp.kind).unwrap_or("");
    let overlap = overlap_note(ctx, Some(root), key);
    if key == "themes" {
        let slug_dir = np::join2(root, &theme_slug(ctx, file, stamp));
        let taken = has_entry(root, &np::basename(&slug_dir));
        let dest = destination.map(String::from).unwrap_or_else(|| if taken { format!("{}<slug>/", place(ctx, root)) } else { place(ctx, &slug_dir) });
        let imports = theme_import_note(ctx, file, &dest);
        let notes = source_note(file, &stamp.kind) + &imports + &overlap;
        if taken {
            return (
                format!(
                    "{} is taken, so give this theme a new lower-kebab slug: {} and set `name` in {} to <slug>",
                    place(ctx, &slug_dir),
                    move_theme(ctx, file, stamp, root, Some("<slug>")),
                    np::basename(file)
                ),
                notes,
            );
        }
        return (move_theme(ctx, file, stamp, root, None), notes);
    }
    let source = sources_beside(file, &stamp.kind).into_iter().next();
    if let Some(taken) = taken_in(ctx, file, stamp, root) {
        let name = if key == "components" { "<Name>" } else { "<name>" };
        let b = np::basename(file);
        let suffix = &b[doc_stem(file).len()..];
        let renamed = match &source {
            Some(s) => format!("rename it and {s} to {name}{suffix} and {name}.tsx"),
            None => format!("rename it to {name}{suffix}"),
        };
        let missing = if stamp.kind == "generic" || source.is_some() { String::new() } else { format!(" Also add {name}.tsx beside it.") };
        return (
            format!(
                "{} already has {taken}, so give this one a new name: {renamed}, set its `name` to {name}, and move {} under {} (the {key} root)",
                place(ctx, root),
                if source.is_some() { "them" } else { "it" },
                place(ctx, root)
            ),
            missing + &overlap,
        );
    }
    (
        format!(
            "move {} under {} (the {key} root)",
            match &source {
                Some(s) => format!("it and {s}"),
                None => "it".into(),
            },
            place(ctx, root)
        ),
        source_note(file, &stamp.kind) + &overlap,
    )
}

fn move_to_new_root(ctx: &FixContext, file: &str, stamp: &Stamp) -> (String, String) {
    let key = root_for_type(&stamp.kind).unwrap_or("");
    let target = np::join2(&ctx.package_dir, key);
    let declare = format!("set `{key}: './{key}'` in {}", ctx.manifest);
    let point_at_it = format!("set `{key}` to that folder in {}", ctx.manifest);
    let notes = source_note(file, &stamp.kind);
    if key == "themes" {
        let theme_dir = np::dirname(file);
        let slug = theme_slug(ctx, file, stamp);
        let slug_dir = np::join2(&target, &slug);
        let except = if np::dirname(&theme_dir) == target { Some(theme_dir.as_str()) } else { None };
        let clear = is_free_folder(ctx, &target) && reads_as_themes_root(ctx, &target, except, Some(file), Some(file)) && (slug_dir == theme_dir || !np::exists(&slug_dir));
        if clear && slug_dir == theme_dir {
            return (declare, notes.clone() + &theme_import_note(ctx, file, &place(ctx, &theme_dir)));
        }
        if clear {
            return (format!("{} and {declare}", move_theme(ctx, file, stamp, &target, None)), notes.clone() + &theme_import_note(ctx, file, &place(ctx, &slug_dir)));
        }
        let (what, folder) = theme_files(ctx, file, None);
        return (
            if folder {
                format!("move {what} into a folder that holds only themes, as {slug}/, and {point_at_it}")
            } else {
                format!("move {what} into a {slug}/ folder inside a folder that holds only themes, and {point_at_it}")
            },
            notes.clone() + &theme_import_note(ctx, file, "the theme folder") + &overlap_note(ctx, None, key),
        );
    }
    let picked = notes.clone() + &overlap_note(ctx, None, key);
    let source = sources_beside(file, &stamp.kind).into_iter().next();
    let what = match &source {
        Some(s) => format!("it and {s}"),
        None => "it".into(),
    };
    let clear = if np::exists(&target) { can_be_root(ctx, &target, key, Some(file)) && taken_in(ctx, file, stamp, &target).is_none() } else { is_free_folder(ctx, &target) };
    if clear {
        return (format!("move {what} into {key}/ and {declare}"), notes);
    }
    (format!("move {what} into a folder that holds only {}, and {point_at_it}", root_holds(key)), picked)
}

/// `unreachableFix(context, file, stamp)`.
pub fn unreachable_fix(ctx: &FixContext, file: &str, stamp: &Stamp) -> String {
    let key = root_for_type(&stamp.kind).unwrap_or("");
    let root = ctx.root(key);
    let folder = np::dirname(&if key == "themes" { np::dirname(file) } else { file.to_string() });
    let declare = format!("set `{key}: './{}'` in {}", shown(ctx, &folder), ctx.manifest);
    let folder_can_be_root = can_be_root(ctx, &folder, key, Some(file));
    let stays = source_note(file, &stamp.kind) + &if key == "themes" { theme_import_note(ctx, file, &place(ctx, &np::dirname(file))) } else { String::new() };
    if let Some(root) = root {
        let swappable = folder_can_be_root && candidates_under(ctx, root).map(|c| c.is_empty()).unwrap_or(false);
        if swappable && !overlap_note(ctx, Some(root), key).is_empty() {
            return format!("Fix: {declare}.{stays}");
        }
        let (main, notes) = move_under(ctx, file, stamp, root, if swappable { Some("the theme folder") } else { None });
        return format!("Fix: {main}{}.{notes}", if swappable { format!(", or {declare}") } else { String::new() });
    }
    if folder_can_be_root {
        return format!("Fix: {declare}.{stays}");
    }
    let (main, notes) = move_to_new_root(ctx, file, stamp);
    format!("Fix: {main}.{notes}")
}

fn holds_only_components(ctx: &FixContext, dir: &str) -> bool {
    if !np::exists(dir) {
        return true;
    }
    let Some(found) = candidates_under(ctx, dir) else { return false };
    found.iter().all(|f| stamp_of(ctx, f).map(|s| s.kind == "component").unwrap_or(false))
        && uncovered_sources(dir, &found).is_empty()
        && !METADATA_ROOTS.iter().any(|k| *k != "components" && ctx.root(k).map(|r| path_is_inside(r, dir)).unwrap_or(false))
}

/// `newComponentDocNote(context)`.
pub fn new_component_doc_note(ctx: &FixContext) -> String {
    match ctx.root("components") {
        Some(c) => overlap_note(ctx, Some(c), "components"),
        None => String::new(),
    }
}

/// `themeImporting(context, file)`: `(doc, stamp, source)`.
pub fn theme_importing(ctx: &FixContext, file: &str) -> Option<(String, Stamp, String)> {
    let dir = np::dirname(file);
    let entries = np::list_dir(&dir)?;
    for name in entries.iter().filter(|e| is_doc_candidate(e)) {
        let doc = np::join2(&dir, name);
        let Some(stamp) = stamp_of(ctx, &doc) else { continue };
        if stamp.kind != "theme" {
            continue;
        }
        let Some(source) = sources_beside(&doc, "theme").into_iter().next() else { continue };
        if local_imports(&np::join2(&dir, &source)).map(|e| e.iter().any(|x| x.target == file)).unwrap_or(false) {
            return Some((doc, stamp, source));
        }
    }
    None
}

/// `notACodemodFix(context, file, stamp, source, stray)`.
pub fn not_a_codemod_fix(ctx: &FixContext, file: &str, stamp: &Stamp, source: Option<&str>, stray: Option<&str>) -> String {
    let key = root_for_type(&stamp.kind).unwrap_or("");
    let root = ctx.root(key);
    let codemods = ctx.root("codemods");
    let b = np::basename(file);
    let lead = match (source, stray) {
        (Some(s), Some(st)) => format!("Fix: {st} is imported by {s}, the source of {b}, which has type: '{}', so none of them is a codemod", stamp.kind),
        (Some(s), None) => format!("Fix: {s} is the source of {b}, which has type: '{}', so neither is a codemod", stamp.kind),
        _ => format!("Fix: {b} has type: '{}', so it is not a codemod", stamp.kind),
    };
    if let (Some(r), Some(c)) = (root, codemods) {
        if path_is_inside(file, r) {
            let companion = sources_beside(file, &stamp.kind).into_iter().next();
            return format!(
                "{lead}; move {b}{} out of {} to another folder under {} (the {key} root).{}{}",
                companion.map(|c| format!(" and {c}")).unwrap_or_default(),
                place(ctx, c),
                place(ctx, r),
                source_note(file, &stamp.kind),
                overlap_note(ctx, Some(r), key)
            );
        }
    }
    let (main, notes) = match root {
        Some(r) => move_under(ctx, file, stamp, r, None),
        None => move_to_new_root(ctx, file, stamp),
    };
    format!("{lead}; {main}.{notes}")
}

/// `notAComponentFix(context, file, stamp)`.
pub fn not_a_component_fix(ctx: &FixContext, file: &str, stamp: &Stamp) -> String {
    let components = ctx.root("components").unwrap_or("").to_string();
    let key = root_for_type(&stamp.kind).unwrap_or("");
    let root = ctx.root(key);
    let lead = format!("Fix: {} has type: '{}', so it is not a component", np::basename(file), stamp.kind);
    if components == ctx.package_dir {
        let why = format!("{lead}, and the components root is the package root, which reads every doc in the package");
        let target = np::join2(&ctx.package_dir, "components");
        return if holds_only_components(ctx, &target) {
            format!(
                "{why}; create components/, move the components into it, and set `components: './components'` in {}.{}",
                ctx.manifest,
                overlap_note(ctx, Some(&target), "components")
            )
        } else {
            format!(
                "{why}; move the components into a folder that holds only components, and set `components` to that folder in {}.{}",
                ctx.manifest,
                overlap_note(ctx, None, "components")
            )
        };
    }
    if let Some(r) = root {
        if path_is_inside(r, &components) {
            let (main, notes) = separate_roots(ctx, file, stamp, r);
            return format!("{lead}, and {main}.{}{notes}", source_note(file, &stamp.kind));
        }
        if path_is_inside(file, r) {
            return format!(
                "{lead}; move it out of {} (the components root) to another folder under {} (the {key} root).{}{}",
                place(ctx, &components),
                place(ctx, r),
                source_note(file, &stamp.kind),
                overlap_note(ctx, Some(r), key)
            );
        }
    }
    let (main, notes) = match root {
        Some(r) => move_under(ctx, file, stamp, r, None),
        None => move_to_new_root(ctx, file, stamp),
    };
    format!("{lead}; {main}.{notes}")
}

fn separate_roots(ctx: &FixContext, file: &str, stamp: &Stamp, root: &str) -> (String, String) {
    let components = ctx.root("components").unwrap_or("").to_string();
    let key = root_for_type(&stamp.kind).unwrap_or("");
    let target = np::join2(&ctx.package_dir, key);
    let free = !np::exists(&target) && is_free_folder(ctx, &target);
    let picked = overlap_note(ctx, None, key);
    let m = &ctx.manifest;
    if root == components {
        let both = format!("the {key} root and the components root are both {}", place(ctx, root));
        return if free {
            (format!("{both}; move the {} into {key}/ and set `{key}: './{key}'` in {m}", root_holds(key)), String::new())
        } else {
            (format!("{both}; move the {} into a folder of their own and set `{key}` to that folder in {m}", root_holds(key)), picked)
        };
    }
    let overlap = format!("the components root {} also reads the {key} root {} inside it", place(ctx, &components), place(ctx, root));
    let carried = path_is_inside(file, root);
    let slug = theme_slug(ctx, file, stamp);
    let taken = !carried && if key == "themes" { has_entry(root, &slug) } else { taken_in(ctx, file, stamp, root).is_some() };
    let source = sources_beside(file, &stamp.kind).into_iter().next();
    let name = "<name>";
    let b = np::basename(file);
    let suffix = &b[doc_stem(file).len()..];
    let renamed = format!(
        "give it a new name: {}, set its `name` to {name}, and move {}",
        match &source {
            Some(s) => format!("rename it and {s} to {name}{suffix} and {name}.tsx"),
            None => format!("rename it to {name}{suffix}"),
        },
        if source.is_some() { "them" } else { "it" }
    );
    let new_slug = if taken { "<slug>".to_string() } else { slug.clone() };
    let slug_note = if taken { format!(" and set `name` in {b} to <slug>") } else { String::new() };
    if free {
        let then = if !carried && key == "themes" {
            format!(", then {}{slug_note}", move_theme(ctx, file, stamp, &target, Some(&new_slug)))
        } else if !carried {
            format!(", then {} into {key}/", if taken { renamed.as_str() } else { "move it" })
        } else {
            String::new()
        };
        return (format!("{overlap}; move {} to {key}/ and set `{key}: './{key}'` in {m}{then}", place(ctx, root)), String::new());
    }
    let then = if !carried && key == "themes" {
        let (what, folder) = theme_files(ctx, file, Some(root));
        if folder {
            format!(", then move {what} into that root as {new_slug}/{slug_note}")
        } else {
            format!(", then move {what} into a {new_slug}/ folder in that root{slug_note}")
        }
    } else if !carried {
        format!(", then {} into that root", if taken { renamed.as_str() } else { "move it" })
    } else {
        String::new()
    };
    (format!("{overlap}; move {} out of {} and set `{key}` to its new path in {m}{then}", place(ctx, root), place(ctx, &components)), picked)
}
