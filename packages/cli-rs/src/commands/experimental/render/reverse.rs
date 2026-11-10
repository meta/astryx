//! Port of `reverseToFile` (api/render/_adapter.mjs) for a file that carries
//! its source, with `readSourceBlock` (source-block.mjs) and
//! `reachableFiles` (embedded-imports.mjs, relative imports and assets).

use super::page::{is_asset_bytes, is_asset_path, sha256_hex};
use super::{confined, embedded_path_problem, err, shown, RenderError};
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};

pub enum Block {
    None,
    Damaged(String),
    Source { entry: String, files: Vec<(String, Vec<u8>, String)> },
}

pub fn base64_decode(s: &str) -> Vec<u8> {
    let val = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => (c - b'A') as u32,
            b'a'..=b'z' => (c - b'a' + 26) as u32,
            b'0'..=b'9' => (c - b'0' + 52) as u32,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => return None,
        })
    };
    let mut out = vec![];
    let mut buf = 0u32;
    let mut bits = 0;
    for &c in s.as_bytes() {
        if c == b'=' {
            break;
        }
        let Some(v) = val(c) else { continue };
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    out
}

/// `readSourceBlock(html)`.
pub fn read_source_block(html: &str) -> Block {
    let re = regress::Regex::with_flags(r#"<script\s+type=["']application\/x\-astryx\-source["'][^>]*>([\s\S]*?)<\/script>"#, "gi").unwrap();
    let Some(m) = re.find_iter(html).last() else { return Block::None };
    let body = &html[m.group(1).unwrap()];
    let Ok(payload) = serde_json::from_str::<Value>(body) else {
        return Block::Damaged("its embedded source is not valid JSON".into());
    };
    let files = payload.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default();
    if payload.get("version") != Some(&Value::from(1)) || !payload.get("entry").is_some_and(|e| e.is_string()) || !payload.get("files").is_some_and(|f| f.is_array()) || files.is_empty() {
        return Block::Damaged("its embedded source has an unknown shape".into());
    }
    let mut out = vec![];
    for f in &files {
        let (Some(p), Some(b64), Some(sha)) = (
            f.get("path").and_then(|v| v.as_str()),
            f.get("base64").and_then(|v| v.as_str()),
            f.get("sha256").and_then(|v| v.as_str()),
        ) else {
            let name = f.get("path").map(crate::cli::format::js_string).unwrap_or_else(|| "a file".into());
            return Block::Damaged(format!("its embedded copy of {name} does not match its checksum"));
        };
        let bytes = base64_decode(b64);
        if sha256_hex(&bytes) != sha {
            return Block::Damaged(format!("its embedded copy of {p} does not match its checksum"));
        }
        out.push((p.to_string(), bytes, b64.to_string()));
    }
    Block::Source { entry: payload["entry"].as_str().unwrap().to_string(), files: out }
}

const RESOLVE_EXTENSIONS: [&str; 6] = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"];

fn asset_refs_in(text: &str, out: &mut Vec<String>) {
    let re = regress::Regex::with_flags(r#"(?:^|url\(\s*['"]?)(\.\.?\/[^'")\s]+)"#, "g").unwrap();
    for m in re.find_iter(text) {
        let r = &text[m.group(1).unwrap()];
        let r = r.split(['?', '#']).next().unwrap_or("");
        if is_asset_path(r) {
            out.push(r.to_string());
        }
    }
}

/// `scanModule(source, file)`: (imports, asset refs).
fn scan_module(source: &str, file: &str) -> (Vec<String>, Vec<String>) {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::{Argument, CallExpression, Expression, ImportExpression, StringLiteral, TemplateElement};
    use oxc::ast_visit::{walk, Visit};
    use oxc::parser::{ParseOptions, Parser};
    use oxc::span::SourceType;
    struct S {
        imports: Vec<String>,
        assets: Vec<String>,
    }
    impl<'a> Visit<'a> for S {
        fn visit_string_literal(&mut self, s: &StringLiteral<'a>) {
            asset_refs_in(s.value.as_str().unwrap_or(""), &mut self.assets);
        }
        fn visit_template_element(&mut self, t: &TemplateElement<'a>) {
            if let Some(c) = &t.value.cooked {
                asset_refs_in(c.as_str().unwrap_or(""), &mut self.assets);
            }
        }
        fn visit_import_declaration(&mut self, d: &oxc::ast::ast::ImportDeclaration<'a>) {
            self.imports.push(d.source.value.as_str().unwrap_or("").to_string());
            walk::walk_import_declaration(self, d);
        }
        fn visit_export_all_declaration(&mut self, d: &oxc::ast::ast::ExportAllDeclaration<'a>) {
            self.imports.push(d.source.value.as_str().unwrap_or("").to_string());
            walk::walk_export_all_declaration(self, d);
        }
        fn visit_export_from_declaration(&mut self, d: &oxc::ast::ast::ExportFromDeclaration<'a>) {
            self.imports.push(d.source.value.as_str().unwrap_or("").to_string());
            walk::walk_export_from_declaration(self, d);
        }
        fn visit_import_expression(&mut self, e: &ImportExpression<'a>) {
            if let Expression::StringLiteral(s) = &e.source {
                self.imports.push(s.value.as_str().unwrap_or("").to_string());
            }
            walk::walk_import_expression(self, e);
        }
        fn visit_call_expression(&mut self, c: &CallExpression<'a>) {
            if let (Expression::Identifier(id), Some(Argument::StringLiteral(s))) = (&c.callee, c.arguments.first()) {
                if id.name == "require" {
                    self.imports.push(s.value.as_str().unwrap_or("").to_string());
                }
            }
            walk::walk_call_expression(self, c);
        }
    }
    let alloc = Allocator::default();
    let ts = [".ts", ".tsx", ".mts", ".cts"].iter().any(|e| file.ends_with(e));
    let st = if ts { SourceType::tsx() } else { SourceType::jsx() }.with_module(true);
    let ret = Parser::new(&alloc, source, st).with_options(ParseOptions { allow_return_outside_function: true, ..Default::default() }).parse();
    let mut s = S { imports: vec![], assets: vec![] };
    s.visit_program(&ret.program);
    (s.imports, s.assets)
}

pub fn posix_normalize(p: &str) -> String {
    let mut out: Vec<&str> = vec![];
    let abs = p.starts_with('/');
    for seg in p.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if out.last().is_some_and(|l| *l != "..") {
                    out.pop();
                } else if !abs {
                    out.push("..");
                }
            }
            s => out.push(s),
        }
    }
    let j = out.join("/");
    if abs {
        format!("/{j}")
    } else if j.is_empty() {
        ".".into()
    } else {
        j
    }
}

fn posix_dirname(p: &str) -> String {
    match p.rfind('/') {
        Some(0) => "/".into(),
        Some(i) => p[..i].into(),
        None => ".".into(),
    }
}

fn css_imports(css: &str) -> Vec<String> {
    let Ok(tree) = super::css::parse(css) else { return vec![] };
    let mut out = vec![];
    let re = regress::Regex::new(r#"^\s*(?:url\(\s*(['"]?)([\s\S]*?)\1\s*\)|(['"])([\s\S]*?)\3)"#).unwrap();
    for id in tree.walk() {
        if let super::css::Kind::AtRule { name, params, .. } = &tree.nodes[id].kind {
            if name.to_lowercase() == "import" {
                if let Some(m) = re.find(params) {
                    let url = m.group(2).or(m.group(4)).map(|r| params[r].to_string()).unwrap_or_default();
                    if !url.is_empty() {
                        out.push(url);
                    }
                }
            }
        }
    }
    out
}

pub struct Reach {
    pub path: String,
    pub relative: bool,
    pub aliased: Vec<String>,
}

/// `receivingAliases(dir)`.
fn receiving_aliases(dir: &str) -> Vec<super::ts_paths::PathPattern> {
    let mut d = dir.to_string();
    while !np::exists(&d) && np::dirname(&d) != d {
        d = np::dirname(&d);
    }
    loop {
        if let Some(found) = super::ts_paths::read_paths_in(&d) {
            return found;
        }
        if np::exists(&np::join2(&d, "package.json")) {
            return vec![];
        }
        let up = np::dirname(&d);
        if up == d {
            return vec![];
        }
        d = up;
    }
}

/// `reachableFiles(files, {aliases})`: the reached files, and the missing
/// ones (sorted).
fn reachable(files: &[(String, Vec<u8>, String)], aliases: &[super::ts_paths::PathPattern]) -> (Vec<Reach>, Vec<String>) {
    let has = |p: &str| files.iter().any(|f| f.0 == p);
    let resolve_in = |c: &str| -> Option<String> {
        if has(c) {
            return Some(c.into());
        }
        for e in RESOLVE_EXTENSIONS {
            if has(&format!("{c}{e}")) {
                return Some(format!("{c}{e}"));
            }
        }
        for e in RESOLVE_EXTENSIONS {
            if has(&format!("{c}/index{e}")) {
                return Some(format!("{c}/index{e}"));
            }
        }
        None
    };
    let by_suffix = |rest: &str| -> Option<(String, String)> {
        let mut hits: Vec<(String, String)> = vec![];
        for f in files {
            let p = &f.0;
            let mut tails = vec![rest.to_string()];
            tails.extend(RESOLVE_EXTENSIONS.iter().map(|e| format!("{rest}{e}")));
            tails.extend(RESOLVE_EXTENSIONS.iter().map(|e| format!("{rest}/index{e}")));
            for t in tails {
                if *p == t || p.ends_with(&format!("/{t}")) {
                    hits.push((p.clone(), t));
                    break;
                }
            }
        }
        if hits.len() == 1 { hits.pop() } else { None }
    };
    let mut reached: Vec<Reach> = vec![];
    let mut missing: Vec<String> = vec![];
    let mut queue: Vec<String> = vec![];
    fn reach<'a>(reached: &'a mut Vec<Reach>, p: &str) -> (&'a mut Reach, bool) {
        if let Some(i) = reached.iter().position(|r| r.path == p) {
            return (&mut reached[i], false);
        }
        reached.push(Reach { path: p.to_string(), relative: false, aliased: vec![] });
        let n = reached.len() - 1;
        (&mut reached[n], true)
    }
    if let Some(f) = files.first() {
        reach(&mut reached, &f.0).0.relative = true;
        queue.push(f.0.clone());
    }
    while !queue.is_empty() {
        let current = queue.remove(0);
        let ext = np::extname(&current).to_lowercase();
        let is_module = super::PAGE_EXTENSIONS.contains(&ext.as_str());
        if !is_module && ext != ".css" {
            continue;
        }
        let Some(entry) = files.iter().find(|f| f.0 == current) else { continue };
        let source = String::from_utf8_lossy(&entry.1).to_string();
        let dir = posix_dirname(&current);
        let (imports, assets) = if is_module {
            scan_module(&source, &current)
        } else {
            let imports = css_imports(&source)
                .into_iter()
                .filter(|r| regress::Regex::with_flags(r"^([a-z]+:)?\/\/", "i").unwrap().find(r).is_none() && !r.starts_with('@') && !r.starts_with('~'))
                .filter(|r| r.starts_with('.') || has(&posix_normalize(&format!("{dir}/{r}"))))
                .map(|r| if r.starts_with('.') { r } else { format!("./{r}") })
                .collect();
            let mut a = vec![];
            asset_refs_in(&source, &mut a);
            (imports, a)
        };
        for r in assets {
            let joined = posix_normalize(&format!("{dir}/{r}"));
            if joined.starts_with("..") {
                continue;
            }
            if !has(&joined) {
                if !missing.contains(&joined) {
                    missing.push(joined);
                }
                continue;
            }
            reach(&mut reached, &joined).0.relative = true;
        }
        for spec in imports {
            let bare = spec.split('?').next().unwrap_or("").to_string();
            if bare.starts_with("./") || bare.starts_with("../") {
                let joined = posix_normalize(&format!("{dir}/{bare}"));
                let target = if joined.starts_with("..") { None } else { resolve_in(&joined) };
                match target {
                    None => {
                        if !missing.contains(&joined) {
                            missing.push(joined);
                        }
                    }
                    Some(t) => {
                        let (r, fresh) = reach(&mut reached, &t);
                        r.relative = true;
                        if fresh {
                            queue.push(t);
                        }
                    }
                }
                continue;
            }
            let Some(m) = super::ts_paths::match_path(aliases, &bare) else { continue };
            let mut options: Vec<(String, (String, String), usize)> = vec![];
            for target in &m.pattern.targets {
                let named = target.replacen('*', &m.capture, 1);
                let ext = np::extname(&named);
                let star = target.find('*');
                let cut = star.map(|st| target[..st].rfind('/').map(|i| i + 1).unwrap_or(0));
                let rest_raw = match (star, cut) {
                    (Some(_), Some(c)) => target[c..].replacen('*', &m.capture, 1),
                    _ => {
                        let b = np::basename(&named);
                        b.strip_suffix(&ext).unwrap_or(&b).to_string()
                    }
                };
                let rest = rest_raw.trim_start_matches('/').to_string();
                let Some(hit) = (if rest.is_empty() { None } else { by_suffix(&rest) }) else { continue };
                let abs = match (star, cut) {
                    (Some(_), Some(c)) => format!("{}{}", &target[..c], hit.1),
                    _ => {
                        if !ext.is_empty() {
                            named.clone()
                        } else {
                            format!("{named}{}", &hit.1[rest.len()..])
                        }
                    }
                };
                let target_folders: Vec<String> = match (star, cut) {
                    (Some(_), Some(c)) => target[..c].split('/').filter(|x| !x.is_empty()).map(String::from).collect(),
                    _ => np::dirname(&named).split('/').filter(|x| !x.is_empty()).map(String::from).collect(),
                };
                let sent_folders: Vec<String> = hit.0[..hit.0.len() - hit.1.len()].split('/').filter(|x| !x.is_empty()).map(String::from).collect();
                let mut score = 0;
                while score < sent_folders.len() && score < target_folders.len() && sent_folders[sent_folders.len() - 1 - score] == target_folders[target_folders.len() - 1 - score] {
                    score += 1;
                }
                options.push((abs, hit, score));
            }
            let mut chosen: Option<(String, (String, String), usize)> = None;
            for o in options {
                if chosen.as_ref().is_none_or(|c| o.2 > c.2) {
                    chosen = Some(o);
                }
            }
            if let Some((abs, hit, _)) = chosen {
                let (r, fresh) = reach(&mut reached, &hit.0);
                if !r.aliased.contains(&abs) {
                    r.aliased.push(abs);
                }
                if fresh {
                    queue.push(hit.0.clone());
                }
            }
        }
    }
    missing.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(a, b));
    (reached, missing)
}

fn restore_folder(input: &str) -> String {
    let base = np::basename(input);
    let stem = match base.rfind('.') {
        Some(i) if i > 0 => base[..i].to_string(),
        _ => base.clone(),
    };
    let dir = np::dirname(input);
    let mut folder = np::join2(&dir, &format!("{stem}-restored"));
    let mut n = 2;
    while np::exists(&folder) {
        folder = np::join2(&dir, &format!("{stem}-restored-{n}"));
        n += 1;
    }
    folder
}

fn refuse_runnable(files: &[String], cwd: &str, input: &str) -> Result<(), RenderError> {
    let nearest = |marker: &str| -> Option<String> {
        let mut d = cwd.to_string();
        loop {
            if np::exists(&np::join2(&d, marker)) {
                return Some(d);
            }
            let up = np::dirname(&d);
            if up == d {
                return None;
            }
            d = up;
        }
    };
    let mut top = None;
    let mut d = cwd.to_string();
    loop {
        if np::exists(&np::join2(&d, "package.json")) {
            top = Some(d.clone());
        }
        let up = np::dirname(&d);
        if up == d {
            break;
        }
        d = up;
    }
    let root = nearest(".git").or(top).unwrap_or_else(|| cwd.to_string());
    let runnable: Vec<String> = files
        .iter()
        .map(|f| np::relative(&root, f))
        .filter(|r| {
            let segs: Vec<&str> = r.split('/').collect();
            super::runner_picks_up_pub(&segs)
        })
        .collect();
    if !runnable.is_empty() {
        return Err(err(
            format!(
                "{} would write {} (from the project root), where a test, story or benchmark runner would run it; nothing was written. Restore it somewhere else with --out.",
                shown(cwd, input),
                runnable.join(", ")
            ),
            vec![],
            "ERR_INVALID_ARGUMENT",
        ));
    }
    Ok(())
}

fn code_of(reason: &str) -> &'static str {
    if reason.starts_with("an absolute path") || reason.starts_with("a path outside") {
        "ERR_PATH_TRAVERSAL"
    } else {
        "ERR_RENDER_SOURCE_DAMAGED"
    }
}

/// `reverseToFile({cwd, input, output, overwrite})`.
pub fn reverse_to_file(cwd: &str, input: &str, output: Option<&str>, overwrite: bool) -> Result<Value, RenderError> {
    let bytes = super::read_input(input, cwd)?;
    let html = String::from_utf8_lossy(&bytes).to_string();
    let block = read_source_block(&html);
    let refuse_existing = |files: &[String]| -> Result<(), RenderError> {
        if overwrite {
            return Ok(());
        }
        let existing: Vec<&String> = files.iter().filter(|f| np::exists(f)).collect();
        if !existing.is_empty() {
            let one = existing.len() == 1;
            return Err(err(
                format!(
                    "{} already exist{}; nothing was written. Pass --overwrite to replace {}.",
                    existing.iter().map(|f| shown(cwd, f)).collect::<Vec<_>>().join(", "),
                    if one { "s" } else { "" },
                    if one { "it" } else { "them" }
                ),
                vec![],
                "ERR_FILE_EXISTS",
            ));
        }
        Ok(())
    };
    let refuse_config_target = |file: &str| -> Result<(), RenderError> {
        let rel = np::relative(cwd, file);
        let where_ = if rel.starts_with("..") || np::is_absolute(&rel) { np::basename(file) } else { rel };
        if let Some(problem) = embedded_path_problem(&where_, true).or_else(|| embedded_path_problem(&where_, false)) {
            return Err(err(
                format!("{} is not a page module file name a reverse writes ({problem}); nothing was written.", shown(cwd, file)),
                vec![],
                "ERR_INVALID_ARGUMENT",
            ));
        }
        Ok(())
    };
    match block {
        Block::Damaged(d) => Err(err(
            format!("{} carries an Astryx page source, but {d}, so it cannot be given back exactly.", shown(cwd, input)),
            vec![],
            "ERR_RENDER_SOURCE_DAMAGED",
        )),
        Block::Source { files, .. } => {
            for (i, f) in files.iter().enumerate() {
                if let Some(problem) = embedded_path_problem(&f.0, i == 0) {
                    return Err(err(
                        format!("{} carries {problem}, which a render never embeds; nothing was written.", shown(cwd, input)),
                        vec![],
                        code_of(&problem),
                    ));
                }
            }
            let requested = match output {
                Some(o) => o.to_string(),
                None => {
                    let mut p = restore_folder(input);
                    for seg in files[0].0.split('/') {
                        p = np::join2(&p, seg);
                    }
                    p
                }
            };
            refuse_config_target(&requested)?;
            let mut seen: Vec<String> = vec![];
            for f in &files {
                let k = f.0.to_lowercase();
                if seen.contains(&k) {
                    return Err(err(
                        format!("{} lists {} more than once, which a render never does; nothing was written.", shown(cwd, input), f.0),
                        vec![],
                        "ERR_RENDER_SOURCE_DAMAGED",
                    ));
                }
                seen.push(k);
            }
            let aliases = receiving_aliases(&np::dirname(&requested));
            let (mut reached, missing) = reachable(&files, &aliases);
            for f in &files {
                if reached.iter().any(|r| r.path == f.0) || !is_asset_path(&f.0) {
                    continue;
                }
                if is_asset_bytes(&f.1) {
                    reached.push(Reach { path: f.0.clone(), relative: true, aliased: vec![] });
                }
            }
            let stray: Vec<String> = files.iter().filter(|f| !reached.iter().any(|r| r.path == f.0)).map(|f| f.0.clone()).collect();
            if !stray.is_empty() {
                return Err(err(
                    format!(
                        "{} carries {} the page does not import, or that is not the image, font or media file its name says ({}), which a render never embeds; nothing was written. A file reached through a path alias needs the same alias in this project's tsconfig.json or jsconfig.json.",
                        shown(cwd, input),
                        if stray.len() == 1 { "a file" } else { "files" },
                        stray.join(", ")
                    ),
                    vec![],
                    "ERR_RENDER_SOURCE_DAMAGED",
                ));
            }
            let entry_dir = posix_dirname(&files[0].0);
            let anchor = np::dirname(&requested);
            let place_from = |p: &str| -> String {
                let rel = super::super::render::reverse::posix_relative(&entry_dir, p);
                np::resolve(&[&anchor, &rel])
            };
            let mut home: Option<String> = None;
            let mut d = anchor.clone();
            while !np::exists(&d) && np::dirname(&d) != d {
                home = Some(d.clone());
                d = np::dirname(&d);
            }
            let within = |file: &str| -> bool {
                match &home {
                    None => false,
                    Some(h) => {
                        let rel = np::relative(h, file);
                        !rel.is_empty() && !rel.starts_with("..") && !np::is_absolute(&rel)
                    }
                }
            };
            let target = np::join2(&anchor, &np::basename(&requested));
            let mut writes: Vec<(String, Vec<u8>)> = vec![];
            let mut outside: Vec<String> = vec![];
            let mut aliased_outside: Vec<String> = vec![];
            for (i, f) in files.iter().enumerate() {
                let r = reached.iter().find(|r| r.path == f.0).unwrap();
                let mut places: Vec<(String, bool)> = vec![];
                if i == 0 {
                    places.push((target.clone(), false));
                } else if r.relative {
                    places.push((place_from(&f.0), false));
                }
                places.extend(r.aliased.iter().map(|a| (a.clone(), true)));
                for (file, is_aliased) in places {
                    if writes.iter().any(|w| w.0 == file) {
                        continue;
                    }
                    if i > 0 && !within(&file) {
                        if is_aliased {
                            aliased_outside.push(file.clone());
                        } else {
                            outside.push(file.clone());
                        }
                    }
                    writes.push((file, f.1.clone()));
                }
            }
            if !aliased_outside.is_empty() {
                return Err(err(
                    format!(
                        "{} imports {} through a path alias that points outside the folder the restore creates; nothing was written. A received page never adds files to your existing folders: change those imports to relative ones before rendering, or restore it in a project whose alias points somewhere new.",
                        shown(cwd, input),
                        aliased_outside.iter().map(|f| shown(cwd, f)).collect::<Vec<_>>().join(", ")
                    ),
                    vec![],
                    "ERR_PATH_TRAVERSAL",
                ));
            }
            if !outside.is_empty() {
                let top = if entry_dir == "." { String::new() } else { format!("{entry_dir}/") };
                let mut fresh = "restored".to_string();
                let mut n = 2;
                while np::exists(&np::join2(cwd, &fresh)) {
                    fresh = format!("restored-{n}");
                    n += 1;
                }
                let suggestion = format!("--out {fresh}/{top}{}", np::basename(&requested));
                return Err(err(
                    format!(
                        "{} would add {} outside the folder the restore creates; nothing was written. A received page writes the files it imports only inside one new folder: restore it into one, such as {suggestion}.",
                        shown(cwd, input),
                        outside.iter().map(|f| shown(cwd, f)).collect::<Vec<_>>().join(", ")
                    ),
                    vec![crate::cli::command::Suggestion::new(suggestion, "restore the page and the files it imports into a new folder, keeping their layout")],
                    "ERR_PATH_TRAVERSAL",
                ));
            }
            for (i, w) in writes.iter().enumerate() {
                confined(&w.0, cwd, if i == 0 { "The page" } else { "The embedded file" })?;
            }
            let names: Vec<String> = writes.iter().map(|w| w.0.clone()).collect();
            refuse_runnable(&names, cwd, input)?;
            refuse_existing(&names)?;
            super::refuse_protected(&names, cwd)?;
            write_all(&writes, cwd)?;
            let mut m = Map::new();
            m.insert("input".into(), Value::String(shown(cwd, input)));
            m.insert("mode".into(), Value::String("embedded".into()));
            m.insert("output".into(), Value::String(shown(cwd, &target)));
            m.insert("files".into(), Value::Array(names.iter().map(|n| Value::String(shown(cwd, n))).collect()));
            m.insert("exact".into(), Value::Bool(missing.is_empty()));
            if !missing.is_empty() {
                m.insert("missing".into(), Value::Array(missing.into_iter().map(Value::String).collect()));
            }
            Ok(Value::Object(m))
        }
        Block::None => {
            let astryx = regress::Regex::new(r#"\sclass="(?:[^"]*\s)?astryx-[a-z0-9]"#).unwrap().find(&html).is_some();
            let generated = regress::Regex::new(r#"<meta name="generator" content="Astryx[ "]"#).unwrap().find(&html).is_some();
            if !astryx && generated {
                return Err(err(
                    format!("{} was rendered by Astryx, but its embedded source was removed (a sanitizer or an editor strips <script> blocks) and it has no Astryx components to rebuild from; nothing was written. Render the page again from its source and send the new file as is.", shown(cwd, input)),
                    vec![],
                    "ERR_RENDER_SOURCE_DAMAGED",
                ));
            }
            if !astryx {
                return Err(err(
                    format!("{} is not an Astryx page: it has no embedded source and no Astryx components to rebuild from. To start an Astryx page like it, run astryx build \"<what the page is>\".", shown(cwd, input)),
                    vec![crate::cli::command::Suggestion::new("astryx build \"<what the page is>\"", "start an Astryx page from a description of it instead")],
                    "ERR_RENDER_NOT_ASTRYX",
                ));
            }
            let target = output.map(String::from).unwrap_or_else(|| np::join2(&restore_folder(input), "page.tsx"));
            refuse_config_target(&target)?;
            confined(&target, cwd, "The page")?;
            refuse_runnable(&[target.clone()], cwd, input)?;
            refuse_existing(&[target.clone()])?;
            let resolves_core = |dir: &str| -> bool {
                let mut d = dir.to_string();
                while !np::exists(&d) && np::dirname(&d) != d {
                    d = np::dirname(&d);
                }
                matches!(
                    crate::js::resolve::resolve("@astryxdesign/core", std::path::Path::new(&np::join2(&d, "noop.js")), crate::js::resolve::Mode::Cjs),
                    Ok(crate::js::resolve::Resolved::File(_))
                )
            };
            let candidates = [np::dirname(&target), np::dirname(input), cwd.to_string()];
            let from = candidates.iter().find(|d| resolves_core(d)).cloned().unwrap_or_else(|| cwd.to_string());
            let rebuilt = super::rebuild::rebuild_page(&html, &from);
            super::refuse_protected(&[target.clone()], cwd)?;
            if let Some(parent) = std::path::Path::new(&target).parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            std::fs::write(&target, &rebuilt.source).map_err(|e| err(format!("Could not write {}: {e}", shown(cwd, &target)), vec![], "ERR_WRITE_FAILED"))?;
            let strs = |v: &[String]| Value::Array(v.iter().cloned().map(Value::String).collect());
            let mut m = Map::new();
            m.insert("input".into(), Value::String(shown(cwd, input)));
            m.insert("mode".into(), Value::String("rebuilt".into()));
            m.insert("output".into(), Value::String(shown(cwd, &target)));
            m.insert("files".into(), Value::Array(vec![Value::String(shown(cwd, &target))]));
            m.insert("exact".into(), Value::Bool(false));
            m.insert("components".into(), strs(&rebuilt.components));
            m.insert("elements".into(), Value::from(rebuilt.elements));
            m.insert("unknown".into(), strs(&rebuilt.unknown));
            m.insert("omitted".into(), strs(&rebuilt.omitted));
            Ok(Value::Object(m))
        }
    }
}

pub fn posix_relative(from: &str, to: &str) -> String {
    let fs: Vec<String> = posix_normalize(from).split('/').filter(|s| !s.is_empty() && *s != ".").map(String::from).collect();
    let ts: Vec<String> = posix_normalize(to).split('/').filter(|s| !s.is_empty() && *s != ".").map(String::from).collect();
    let mut i = 0;
    while i < fs.len() && i < ts.len() && fs[i] == ts[i] {
        i += 1;
    }
    let mut parts: Vec<String> = vec!["..".to_string(); fs.len() - i];
    parts.extend(ts[i..].iter().cloned());
    parts.join("/")
}

fn write_all(writes: &[(String, Vec<u8>)], cwd: &str) -> Result<(), RenderError> {
    let mut made: Vec<String> = vec![];
    let mut staged: Vec<(String, String)> = vec![];
    let undo = |staged: &Vec<(String, String)>, made: &Vec<String>| {
        for (t, _) in staged {
            let _ = std::fs::remove_file(t);
        }
        for d in made.iter().rev() {
            let _ = std::fs::remove_dir(d);
        }
    };
    let mut current = String::new();
    let r = (|| -> std::io::Result<()> {
        for (file, bytes) in writes {
            current = file.clone();
            let mut missing = vec![];
            let mut d = np::dirname(file);
            while !np::exists(&d) {
                missing.insert(0, d.clone());
                d = np::dirname(&d);
            }
            for d in missing {
                std::fs::create_dir(&d)?;
                made.push(d);
            }
            let temp = format!("{file}.astryx-{}.tmp", std::process::id());
            std::fs::OpenOptions::new().write(true).create_new(true).open(&temp).and_then(|mut f| std::io::Write::write_all(&mut f, bytes))?;
            staged.push((temp, file.clone()));
        }
        for (temp, file) in &staged {
            current = file.clone();
            std::fs::rename(temp, file)?;
        }
        Ok(())
    })();
    if let Err(e) = r {
        undo(&staged, &made);
        return Err(err(format!("Could not write {}: {e}; nothing was written.", shown(cwd, &current)), vec![], "ERR_WRITE_FAILED"));
    }
    Ok(())
}
