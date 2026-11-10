//! `componentExamplesCheck` (`validate-contributions.mjs`): the notes a
//! package's examples need to work everywhere they are shown.
//! What `npm pack --dry-run` packs is read with npm-packlist's rules
//! (packlist.rs), since the clone runs no JS program.

use crate::commands::template::discovery::Template;
use crate::discovery::component_discovery as cd;
use crate::discovery::nodepath as np;
use crate::discovery::validate_contributions as vc;
use crate::json::{Map, Value};

const NODE_BUILTINS: &[&str] = &[
    "_http_agent", "_http_client", "_http_common", "_http_incoming", "_http_outgoing", "_http_server", "_stream_duplex",
    "_stream_passthrough", "_stream_readable", "_stream_transform", "_stream_wrap", "_stream_writable", "_tls_common",
    "_tls_wrap", "assert", "assert/strict", "async_hooks", "buffer", "child_process", "cluster", "console", "constants",
    "crypto", "dgram", "diagnostics_channel", "dns", "dns/promises", "domain", "events", "fs", "fs/promises", "http",
    "http2", "https", "inspector", "inspector/promises", "module", "net", "os", "path", "path/posix", "path/win32",
    "perf_hooks", "process", "punycode", "querystring", "readline", "readline/promises", "repl", "stream",
    "stream/consumers", "stream/promises", "stream/web", "string_decoder", "sys", "timers", "timers/promises", "tls",
    "trace_events", "tty", "url", "util", "util/types", "v8", "vm", "wasi", "worker_threads", "zlib",
];

fn note(code: &str, message: String) -> Value {
    let mut m = Map::new();
    m.insert("code".into(), Value::String(code.into()));
    m.insert("message".into(), Value::String(message));
    m.insert("next".into(), Value::Bool(true));
    Value::Object(m)
}

fn kebab(name: &str) -> String {
    let re = crate::doctor_re!(r"([a-z0-9])([A-Z])", "gu");
    let mut out = String::new();
    let mut last = 0;
    for m in re.find_iter(name) {
        out.push_str(&name[last..m.start()]);
        out.push_str(&name[m.group(1).unwrap()]);
        out.push('-');
        out.push_str(&name[m.group(2).unwrap()]);
        last = m.end();
    }
    out.push_str(&name[last..]);
    out.to_lowercase()
}

/// `readModule(source, builtins)`: (what a browser cannot run, asset paths).
fn read_module(source: &str, builtins: &[&str]) -> (Vec<String>, Vec<String>) {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::*;
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    use oxc_ast_visit::{walk, Visit};
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, source, SourceType::mjs().with_typescript(true).with_jsx(true)).parse();
    if ret.fatal_error {
        return (vec![], vec![]);
    }
    struct V<'b> {
        found: Vec<String>,
        assets: Vec<String>,
        builtins: &'b [&'b str],
    }
    impl V<'_> {
        fn check(&mut self, spec: &str) {
            if crate::doctor_re!(r"^(?:server-only|next\/headers|next\/server|next\/cache|node:.+)$", "u").find(spec).is_some()
                || self.builtins.contains(&spec)
            {
                self.found.push(format!("imports '{spec}'"));
            }
        }
    }
    fn literal_path(e: Option<&Argument>) -> Option<String> {
        match e? {
            Argument::StringLiteral(s) => Some(s.value.display().to_string()),
            Argument::TemplateLiteral(t) if t.expressions.is_empty() => t.quasis.first().and_then(|q| q.value.cooked.as_ref().map(|c| c.display().to_string())),
            _ => None,
        }
    }
    impl<'a> Visit<'a> for V<'_> {
        fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
            let all_type = it.specifiers.as_ref().map(|s| !s.is_empty() && s.iter().all(|x| matches!(x, ImportDeclarationSpecifier::ImportSpecifier(i) if i.import_kind.is_type()))).unwrap_or(false);
            if !it.import_kind.is_type() && !all_type {
                self.check(&it.source.value.display().to_string());
            }
        }
        fn visit_export_from_declaration(&mut self, it: &ExportFromDeclaration<'a>) {
            if !it.export_kind.is_type() && !(!it.specifiers.is_empty() && it.specifiers.iter().all(|s| s.export_kind.is_type())) {
                self.check(&it.source.value.display().to_string());
            }
            walk::walk_export_from_declaration(self, it);
        }
        fn visit_export_all_declaration(&mut self, it: &ExportAllDeclaration<'a>) {
            if !it.export_kind.is_type() {
                self.check(&it.source.value.display().to_string());
            }
            walk::walk_export_all_declaration(self, it);
        }
        fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
            if let Expression::Identifier(id) = &it.callee {
                if id.name == "require" {
                    if let Some(Argument::StringLiteral(s)) = it.arguments.first() {
                        self.check(&s.value.display().to_string());
                    }
                }
            }
            walk::walk_call_expression(self, it);
        }
        fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
            if let Expression::StringLiteral(s) = &it.source {
                self.check(&s.value.display().to_string());
            }
            walk::walk_import_expression(self, it);
        }
        fn visit_new_expression(&mut self, it: &NewExpression<'a>) {
            if let Expression::Identifier(id) = &it.callee {
                if id.name == "URL" {
                    let first = literal_path(it.arguments.first());
                    let second_ok = matches!(it.arguments.get(1), Some(Argument::StaticMemberExpression(m))
                        if m.property.name == "url" && matches!(&m.object, Expression::ImportMeta(_)));
                    if let Some(f) = first {
                        if second_ok && crate::doctor_re!(r"^\.{1,2}\/", "u").find(&f).is_some() {
                            self.assets.push(f);
                        }
                    }
                }
            }
            walk::walk_new_expression(self, it);
        }
        fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
            if let Expression::Identifier(o) = &it.object {
                if o.name == "process" && it.property.name == "env" {
                    self.found.push("reads process.env".into());
                    return;
                }
            }
            if let Expression::StaticMemberExpression(inner) = &it.object {
                if matches!(&inner.object, Expression::Identifier(p) if p.name == "process") && inner.property.name == "env" {
                    if it.property.name == "NODE_ENV" {
                        return;
                    }
                    self.found.push("reads process.env".into());
                    return;
                }
            }
            walk::walk_static_member_expression(self, it);
        }
        fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
            if let Expression::StaticMemberExpression(inner) = &it.object {
                if matches!(&inner.object, Expression::Identifier(p) if p.name == "process") && inner.property.name == "env" {
                    self.found.push("reads process.env".into());
                    return;
                }
            }
            walk::walk_computed_member_expression(self, it);
        }
    }
    let mut v = V { found: vec![], assets: vec![], builtins };
    v.visit_program(&ret.program);
    (v.found, v.assets)
}

fn expand_braces(pattern: &str) -> Vec<String> {
    let c: Vec<char> = pattern.chars().collect();
    let mut depth = 0;
    let mut open = 0usize;
    let mut i = 0;
    while i < c.len() {
        let ch = c[i];
        if ch == '\\' {
            i += 1;
        } else if ch == '{' {
            if depth == 0 {
                open = i;
            }
            depth += 1;
        } else if ch == '}' && depth > 0 {
            depth -= 1;
            if depth == 0 {
                let body: Vec<char> = c[open + 1..i].to_vec();
                let mut parts: Vec<String> = Vec::new();
                let mut level = 0;
                let mut from = 0;
                for (j, b) in body.iter().enumerate() {
                    if *b == '{' {
                        level += 1;
                    } else if *b == '}' {
                        level -= 1;
                    } else if *b == ',' && level == 0 {
                        parts.push(body[from..j].iter().collect());
                        from = j + 1;
                    }
                }
                parts.push(body[from..].iter().collect());
                if parts.len() < 2 {
                    i += 1;
                    continue;
                }
                let head: String = c[..open].iter().collect();
                let tail: String = c[i + 1..].iter().collect();
                return parts.iter().flat_map(|p| expand_braces(&format!("{head}{p}{tail}"))).collect();
            }
        }
        i += 1;
    }
    vec![pattern.to_string()]
}

fn glob_source(pattern: &str) -> String {
    let c: Vec<char> = pattern.chars().collect();
    let esc = |ch: char, set: &str| if set.contains(ch) { format!("\\{ch}") } else { ch.to_string() };
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        let ch = c[i];
        if ch == '*' {
            if c.get(i + 1) == Some(&'*') {
                let slash_after = c.get(i + 2) == Some(&'/');
                let at_start = i == 0 || c[i - 1] == '/';
                if at_start && slash_after {
                    out.push_str("(?:.*/)?");
                    i += 2;
                } else if at_start && i + 2 == c.len() {
                    if out.ends_with('/') {
                        out.pop();
                    }
                    out.push_str("(?:/.*)?");
                    i += 1;
                } else {
                    out.push_str(".*");
                    i += 1;
                }
            } else {
                out.push_str("[^/]*");
            }
        } else if ch == '?' {
            out.push_str("[^/]");
        } else if ch == '[' {
            let close = c.iter().skip(i + 2).position(|x| *x == ']').map(|p| p + i + 2);
            match close {
                None => out.push_str("\\["),
                Some(close) => {
                    let mut body: String = c[i + 1..close].iter().collect();
                    let negated = body.starts_with('!') || body.starts_with('^');
                    if negated {
                        body.remove(0);
                    }
                    let body: String = body.chars().map(|b| esc(b, "\\]")).collect();
                    out.push_str(&format!("[{}{body}]", if negated { "^" } else { "" }));
                    i = close;
                }
            }
        } else if ch == '\\' && i + 1 < c.len() {
            i += 1;
            out.push_str(&esc(c[i], ".+^${}()|[]\\*?/"));
        } else {
            out.push_str(&esc(ch, ".+^${}()|[]\\"));
        }
        i += 1;
    }
    out
}

fn entry_hits(rel: &str, spelling_src: &str, by_path: bool) -> bool {
    let parts: Vec<&str> = rel.split('/').collect();
    let Ok(re) = regress::Regex::with_flags(&format!("^{}$", glob_source(spelling_src)), "iu") else { return false };
    if by_path {
        (0..parts.len()).any(|i| re.find(&parts[..=i].join("/")).is_some())
    } else {
        parts.iter().any(|n| re.find(n).is_some())
    }
}

fn trim_entry(e: &str) -> String {
    let e = e.strip_prefix("./").or_else(|| e.strip_prefix('/')).unwrap_or(e);
    let e = e.trim_end_matches('/');
    match e.strip_suffix("/*") {
        Some(b) => format!("{b}/**"),
        None => e.to_string(),
    }
}

/// `outsideFiles(rel, files)`.
fn outside_files(rel: &str, files: Option<&[String]>) -> bool {
    let Some(files) = files else { return false };
    !files.iter().any(|entry| {
        if entry.starts_with('!') {
            return false;
        }
        let trimmed = trim_entry(entry);
        let slashed = entry.starts_with("./") || entry.starts_with('/');
        expand_braces(&trimmed).iter().any(|sp| entry_hits(rel, sp, sp.contains('/') || slashed))
    })
}

/// `negatedFilesEntry(rel, files)`.
fn negated_files_entry(rel: &str, files: Option<&[String]>) -> Option<String> {
    let files = files?;
    for entry in files {
        let Some(body) = entry.strip_prefix('!') else { continue };
        let trimmed = trim_entry(body);
        let slashed = body.starts_with("./") || body.starts_with('/');
        if expand_braces(&trimmed).iter().any(|sp| entry_hits(rel, sp, sp.contains('/') || slashed)) {
            return Some(entry.clone());
        }
    }
    None
}

/// `ignoreFix(base, template, asset, nestedOnly)`.
fn ignore_fix(base: &str, template: &str, asset: &str, nested_only: bool) -> String {
    let files: Vec<String> = ignore_files_for(base, asset).into_iter().filter(|f| !nested_only || f.contains('/')).collect();
    for file in files.iter().rev() {
        let folder = np::dirname(file);
        let within = if folder == "." { asset.to_string() } else { asset[folder.len() + 1..].to_string() };
        let Ok(text) = std::fs::read(np::join2(base, file)) else { continue };
        let text = String::from_utf8_lossy(&text).into_owned();
        let line = text.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).find(|e| {
            let t = e.trim();
            !t.is_empty() && !t.starts_with('#') && !t.starts_with('!') && !outside_files(&within, Some(&[t.to_string()]))
        });
        if let Some(line) = line {
            return format!("{template}: loads {asset}, which npm leaves out of the package because {file} drops it, so the template breaks once installed. Fix: remove or narrow the line `{}` in {file}, and confirm with `npm pack --dry-run`.", line.trim());
        }
    }
    let file = files.last().cloned().unwrap_or_else(|| ".npmignore".into());
    format!("{template}: loads {asset}, which npm leaves out of the package because an ignore file drops it, so the template breaks once installed. Fix: remove the line in {file} (or another ignore file on its path) that matches {asset}, and confirm with `npm pack --dry-run`.")
}

fn ignore_files_for(base: &str, rel: &str) -> Vec<String> {
    let folders: Vec<&str> = rel.split('/').collect();
    let folders = &folders[..folders.len().saturating_sub(1)];
    let mut found = Vec::new();
    for depth in 0..=folders.len() {
        let folder = folders[..depth].join("/");
        if let Some(f) = [".npmignore", ".gitignore"].iter().find(|n| np::exists(&np::join(&[base, &folder, n]))) {
            found.push(if folder.is_empty() { f.to_string() } else { format!("{folder}/{f}") });
        }
    }
    found
}

pub struct ExampleReport {
    pub notes: Vec<Value>,
    pub unchecked: Vec<Value>,
}

pub fn component_examples_check(integration: &Value) -> ExampleReport {
    let mut notes = Vec::new();
    let mut unchecked: Vec<Value> = Vec::new();
    let Some(rec) = integration.as_object() else { return ExampleReport { notes, unchecked } };
    let s = |k: &str| rec.get(k).and_then(|v| v.as_str()).map(String::from);
    let base = s("__packageDir").or_else(|| s("components")).unwrap_or_default();
    let root = s("templates");
    let mut templates: Vec<Template> = Vec::new();
    if let Some(r) = &root {
        if vc::root_problem(r).is_none() {
            templates = crate::commands::template::integration::for_one(rec).0;
        }
    }
    let rel = |f: &str| np::relative(&base, f);
    let pkg = np::read_json(&np::join2(&base, "package.json"));
    let packed_files = pkg.as_ref().and_then(|p| p.get("files")).cloned();
    let mut declared: Vec<String> = Vec::new();
    if let Some(p) = &pkg {
        for field in ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"] {
            if let Some(m) = p.get(field).and_then(|v| v.as_object()) {
                declared.extend(m.keys().cloned());
            }
        }
    }
    let builtins: Vec<&str> = NODE_BUILTINS.iter().copied().filter(|b| !declared.iter().any(|d| d == b)).collect();
    let mut shown: Vec<String> = Vec::new();
    for t in &templates {
        let doc_file = rel(if t.doc_path.is_empty() { &t.file_path } else { &t.doc_path });
        if t.kind == "block" {
            if let (Some(e), Some(true)) = (&t.example_for, t.is_showcase) {
                shown.push(e.clone());
            }
            if let Some(Value::Array(a)) = &t.also_showcase_for {
                shown.extend(a.iter().filter_map(|x| x.as_str().map(String::from)));
            }
        }
        if !t.category.is_empty() && crate::doctor_re!(r"^[a-z0-9][\w.-]*(?:\/[\w.-]+)+$", "u").find(&t.category).is_some() {
            let mut parts = t.category.split('/');
            let group = parts.next().unwrap_or("");
            let rest: Vec<&str> = parts.collect();
            let joined = rest.join(" ");
            let variant = if !joined.trim().is_empty() {
                joined.trim().to_string()
            } else {
                t.display_name.clone().filter(|d| !d.is_empty()).unwrap_or_else(|| t.dir_name.clone())
            };
            let mut g = group.chars();
            let suggested = format!("{}{} - {variant}", g.next().map(|c| c.to_uppercase().collect::<String>()).unwrap_or_default(), g.as_str());
            notes.push(note(
                "template_category",
                format!(
                    "{doc_file}: category '{}' reads as a file path, and `astryx template` lists templates under their category as written. Fix: category: '{suggested}', a \"<Group> - <Variant>\" name.",
                    t.category
                ),
            ));
        }
        let Ok(source) = std::fs::read_to_string(&t.file_path) else { continue };
        let (server, assets) = read_module(&source, &builtins);
        let showcase = t.is_showcase == Some(true) || matches!(&t.also_showcase_for, Some(Value::Array(a)) if !a.is_empty());
        if t.kind == "block" && showcase && !server.is_empty() {
            let mut uniq: Vec<String> = Vec::new();
            for b in server {
                if !uniq.contains(&b) {
                    uniq.push(b);
                }
            }
            notes.push(note(
                "showcase_not_standalone",
                format!(
                    "{}: the showcase {}, which cannot run in a browser, so a docs page or catalog card cannot render it. Fix: move that code into the app; pass values in as props or a sample-data provider the showcase renders itself. Fetching live data through the app is fine.",
                    rel(&t.file_path),
                    uniq.join(", ")
                ),
            ));
        }
        let mut seen_assets: Vec<String> = Vec::new();
        for a in assets {
            if seen_assets.contains(&a) {
                continue;
            }
            seen_assets.push(a.clone());
            let asset = np::resolve(&[&np::dirname(&t.file_path), &a]);
            let asset_rel = rel(&asset);
            let exists = np::exists(&asset);
            let from_base = np::relative(&base, &asset);
            if from_base.starts_with("..") || np::is_absolute(&from_base) {
                notes.push(note(
                    "template_asset_not_packed",
                    format!(
                        "{}: loads {asset_rel}, which is outside the package, so npm never packs it and the template breaks once installed. Fix: move it inside the package (beside the template is simplest), point `new URL()` at the new place, and confirm with `npm pack --dry-run`.",
                        rel(&t.file_path)
                    ),
                ));
                continue;
            }
            if exists {
                if !matches!(packed_files, Some(Value::Array(_))) && ignore_files_for(&base, &asset_rel).is_empty() {
                    continue;
                }
                let files: Option<Vec<String>> = match &packed_files {
                    Some(Value::Array(a)) => Some(a.iter().map(crate::cli::format::js_string).collect()),
                    _ => None,
                };
                let is_folder = np::is_dir(&asset);
                if super::packlist::npm_packs(&base, &asset_rel, is_folder, files.as_deref()) {
                    continue;
                }
            }
            let files_arr: Option<Vec<String>> = match &packed_files {
                Some(Value::Array(a)) => Some(a.iter().filter_map(|v| v.as_str().map(String::from)).collect()),
                _ => None,
            };
            let has_files = matches!(packed_files, Some(Value::Array(_)));
            let folder = if np::dirname(&asset_rel) == "." { asset_rel.clone() } else { np::dirname(&asset_rel) };
            let negated = negated_files_entry(&asset_rel, files_arr.as_deref());
            let outside = outside_files(&asset_rel, files_arr.as_deref());
            let tf = rel(&t.file_path);
            let message = if !exists {
                format!("{tf}: loads {asset_rel}, which does not exist. Fix: add the file, or point `new URL()` at one that does.")
            } else if negated.is_some() && !outside {
                let n = negated.unwrap();
                format!("{tf}: loads {asset_rel}, which the `files` entry \"{n}\" leaves out of the package, so the template breaks once installed. Fix: drop or narrow \"{n}\" so it no longer matches {asset_rel}, and confirm with `npm pack --dry-run`.")
            } else if has_files && (outside || !ignore_files_for(&base, &asset_rel).iter().any(|f| f.contains('/'))) {
                format!("{tf}: loads {asset_rel}, which npm leaves out of the package by its `files` field, so the template breaks once installed. Fix: add \"{folder}\" to `files`, drop any `!` entry that excludes it, and confirm with `npm pack --dry-run`.")
            } else {
                ignore_fix(&base, &tf, &asset_rel, has_files)
            };
            notes.push(note("template_asset_not_packed", message));
        }
    }
    let Some(components) = s("components") else { return ExampleReport { notes, unchecked } };
    if vc::root_problem(&components).is_some() {
        return ExampleReport { notes, unchecked };
    }
    let li = vc::loaded_integration(rec);
    let records = cd::discover_integration_components(&li, true);
    let templates_dir = match &root {
        Some(r) => {
            let x = rel(r);
            if x.is_empty() {
                ".".to_string()
            } else {
                x
            }
        }
        None => "templates".into(),
    };
    let key = |v: &str| v.to_lowercase().chars().filter(|c| !matches!(c, '-' | '_') && !c.is_whitespace()).collect::<String>();
    let mut component_names: Vec<String> = records.iter().map(|r| r.name.clone()).collect();
    component_names.sort_by(|a, b| b.encode_utf16().count().cmp(&a.encode_utf16().count()));
    let file_stem = |t: &Template| np::basename(&t.file_path).rsplit_once('.').map(|(a, _)| a.to_string()).unwrap_or_else(|| np::basename(&t.file_path));
    let mut owner_of: Vec<(usize, String)> = Vec::new();
    for (i, t) in templates.iter().enumerate() {
        if t.kind != "block" || t.example_for.is_some() {
            continue;
        }
        let mut words: Vec<String> = Vec::new();
        words.push(key(&t.category));
        words.push(key(&t.name));
        if let Some(d) = &t.display_name {
            words.push(key(d));
        }
        words.push(key(&file_stem(t)));
        if let Some(owner) = component_names.iter().find(|n| words.iter().any(|w| w.contains(&key(n)))) {
            owner_of.push((i, owner.clone()));
        }
    }
    let owner = |i: usize| owner_of.iter().find(|(j, _)| *j == i).map(|(_, o)| o.clone());
    let mut claimed: Vec<usize> = Vec::new();
    for r in &records {
        if cd::is_integration_member(&r.name, Some(&r.doc_path)) || shown.contains(&r.name) {
            continue;
        }
        let Ok(doc) = cd::load_component_doc_strict(&r.doc_path) else { continue };
        if doc.get("hidden") == Some(&Value::Bool(true)) || doc.get("isHiddenFromOverview") == Some(&Value::Bool(true)) {
            continue;
        }
        if doc.get("category").and_then(|v| v.as_str()) == Some("Utility") {
            continue;
        }
        let name = &r.name;
        let stem = format!("{}-showcase", kebab(name));
        let doc_rel = rel(&r.doc_path.to_string_lossy());
        let head = format!("{doc_rel}: no block template shows \"{name}\" (`exampleFor: '{name}'` with `isShowcase: true`), so template lists, docs pages and catalog cards have no example of it.");
        if let Some(named) = templates.iter().find(|t| t.kind == "block" && t.example_for.as_deref() == Some(name.as_str())) {
            let p = if named.doc_path.is_empty() { &named.file_path } else { &named.doc_path };
            notes.push(note(
                "component_without_example",
                format!("{head} Fix: add `isShowcase: true` to {}, whose `exampleFor` already names {name}.", rel(p)),
            ));
            continue;
        }
        let names_it = |i: usize| owner(i).as_deref() == Some(name.as_str());
        let mut composing: Vec<usize> = templates
            .iter()
            .enumerate()
            .filter(|(i, t)| {
                t.kind == "block"
                    && matches!(&t.components_used, Some(Value::Array(a)) if a.iter().any(|x| x.as_str() == Some(name.as_str())))
                    && (owner(*i).is_none() || names_it(*i))
            })
            .map(|(i, _)| i)
            .collect();
        composing.sort_by(|&a, &b| {
            (names_it(b) as i32 - names_it(a) as i32)
                .cmp(&0)
                .then(((templates[a].example_for.is_some() as i32) - (templates[b].example_for.is_some() as i32)).cmp(&0))
        });
        let existing = composing
            .iter()
            .copied()
            .find(|&i| templates[i].example_for.is_none() && !claimed.contains(&i))
            .or_else(|| composing.iter().copied().find(|&i| templates[i].example_for.is_some()));
        let shows_another = existing.map(|i| templates[i].example_for.is_some()).unwrap_or(false);
        if let (Some(i), false) = (existing, shows_another) {
            claimed.push(i);
        }
        let stem_template = templates.iter().find(|t| file_stem(t) == stem);
        let stem_shows_another = stem_template.map(|t| t.example_for.as_deref().map(|e| e != name).unwrap_or(false)).unwrap_or(false);
        let usable_root = root.as_ref().filter(|r| vc::root_problem(r).is_none());
        let mut free_stem = stem.clone();
        if stem_shows_another {
            if let Some(r) = usable_root {
                let mut n = 2;
                while np::exists(&np::join2(r, &format!("{free_stem}.tsx"))) || np::exists(&np::join2(r, &format!("{free_stem}.doc.mjs"))) {
                    free_stem = format!("{stem}-{n}");
                    n += 1;
                }
            }
        }
        let taken = existing.is_none() && !stem_shows_another && usable_root.map(|r| np::exists(&np::join2(r, &format!("{stem}.tsx")))).unwrap_or(false);
        if existing.is_some() || taken {
            let doc = match existing {
                Some(i) => rel(if templates[i].doc_path.is_empty() { &templates[i].file_path } else { &templates[i].doc_path }),
                None => format!("{templates_dir}/{stem}.doc.mjs"),
            };
            let fix = if shows_another {
                format!(
                    "add '{name}' to `alsoShowcaseFor` in {doc}, the block that already composes {name} as the showcase of {}",
                    templates[existing.unwrap()].example_for.clone().unwrap_or_default()
                )
            } else {
                format!(
                    "add `exampleFor: '{name}'` and `isShowcase: true` to {doc}{}",
                    if existing.is_some() { format!(", the block that already composes {name}") } else { String::new() }
                )
            };
            notes.push(note(
                "component_without_example",
                format!("{head} Fix: {fix}. A doc set to `hidden`, `isHiddenFromOverview` or category `Utility` needs no example."),
            ));
            continue;
        }
        notes.push(note(
            "component_without_example",
            format!(
                "{head}{} Fix: add {templates_dir}/{free_stem}.tsx, a small composition that renders {name}, and beside it {templates_dir}/{free_stem}.doc.mjs: export default {{type: 'block', name: '{free_stem}', displayName: '{name} showcase', description: 'A {name} in use.', exampleFor: '{name}', isShowcase: true, aspectRatio: 16 / 10}}; A doc set to `hidden`, `isHiddenFromOverview` or category `Utility` needs no example.",
                if root.is_some() { "" } else { " The manifest sets no `templates` root; add `templates: './templates'` to it." }
            ),
        ));
    }
    ExampleReport { notes, unchecked }
}

/// The notes alone (validate's `notes`).
pub fn component_example_notes(integration: &Value) -> Vec<Value> {
    component_examples_check(integration).notes
}
