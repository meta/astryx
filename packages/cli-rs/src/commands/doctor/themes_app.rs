//! The ten app-theme checks for a managed theme record (`checkAppThemes` in
//! `api/doctor/theme-checks.mjs`), and the import wiring `checkThemes` reads.

use super::css;
use super::env;
use super::{Check, Status};
use crate::commands::theme::discovery::Theme;
use crate::commands::theme::state::Entry;
use crate::discovery::nodepath as np;
use crate::json::Value;
use std::collections::BTreeSet;

pub const SOURCE_EXTENSIONS: &[&str] = &[".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"];
const SKIP_DIRS: &[&str] = &[".git", ".next", "build", "coverage", "dist", "node_modules"];

fn rel(root: &str, file: &str) -> String {
    np::relative(root, file)
}

/// `listProjectSourceFiles(root, generatedModule, {stylesheets})`.
pub fn list_project_source_files(root: &str, generated: &str, stylesheets: bool) -> Vec<String> {
    let mut files = Vec::new();
    let mut queue = std::collections::VecDeque::from([root.to_string()]);
    while let Some(dir) = queue.pop_front() {
        if files.len() >= 5000 {
            break;
        }
        let Some(entries) = crate::commands::doctor::support::read_dir_sorted(&dir) else { continue };
        for e in entries {
            if e.is_symlink {
                continue;
            }
            let file = np::join2(&dir, &e.name);
            if e.is_dir {
                if !SKIP_DIRS.contains(&e.name.as_str()) && !e.name.starts_with(".astryx-") {
                    queue.push_back(file);
                }
            } else if e.is_file && file != generated {
                let ext = np::extname(&e.name);
                if SOURCE_EXTENSIONS.contains(&ext.as_str()) || (stylesheets && ext == ".css") {
                    files.push(file);
                }
            }
        }
    }
    files
}

/// `moduleSpecifiers(source, {runtimeOnly})`: Err when it does not parse.
pub fn module_specifiers(source: &str, runtime_only: bool) -> Result<BTreeSet<String>, ()> {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::*;
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    use oxc_ast_visit::{walk, Visit};
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, source, SourceType::unambiguous().with_typescript(true).with_jsx(true)).parse();
    if ret.fatal_error || !ret.diagnostics.is_empty() {
        return Err(());
    }
    struct V {
        out: Vec<String>,
        runtime_only: bool,
    }
    impl<'a> Visit<'a> for V {
        fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
            if !(self.runtime_only && it.import_kind.is_type()) {
                self.out.push(it.source.value.display().to_string());
            }
            walk::walk_import_declaration(self, it);
        }
        fn visit_export_named_declaration(&mut self, it: &ExportNamedDeclaration<'a>) {
            walk::walk_export_named_declaration(self, it);
        }
        fn visit_export_from_declaration(&mut self, it: &ExportFromDeclaration<'a>) {
            if !(self.runtime_only && it.export_kind.is_type()) {
                self.out.push(it.source.value.display().to_string());
            }
            walk::walk_export_from_declaration(self, it);
        }
        fn visit_export_all_declaration(&mut self, it: &ExportAllDeclaration<'a>) {
            if !(self.runtime_only && it.export_kind.is_type()) {
                self.out.push(it.source.value.display().to_string());
            }
            walk::walk_export_all_declaration(self, it);
        }
        fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
            if let Expression::StringLiteral(s) = &it.source {
                self.out.push(s.value.display().to_string());
            }
            walk::walk_import_expression(self, it);
        }
        fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
            if let Expression::Identifier(id) = &it.callee {
                if id.name == "require" {
                    if let Some(Argument::StringLiteral(s)) = it.arguments.first() {
                        self.out.push(s.value.display().to_string());
                    }
                }
            }
            walk::walk_call_expression(self, it);
        }
    }
    let mut v = V { out: vec![], runtime_only };
    v.visit_program(&ret.program);
    Ok(v.out.into_iter().collect())
}

/// `specifierTargets(specifier, fromFile, target)`.
fn specifier_targets(spec: &str, from: &str, target: &str) -> bool {
    if !spec.starts_with('.') {
        return false;
    }
    let base = np::resolve(&[&np::dirname(from), spec]);
    let t = np::resolve1(target);
    std::iter::once(base.clone())
        .chain(SOURCE_EXTENSIONS.iter().map(|e| format!("{base}{e}")))
        .chain(SOURCE_EXTENSIONS.iter().map(|e| np::join2(&base, &format!("index{e}"))))
        .any(|c| np::resolve1(&c) == t)
}

fn read(file: &str) -> Option<String> {
    std::fs::read(file).ok().map(|b| String::from_utf8_lossy(&b).into_owned())
}

fn refresh_command(project_dir: &str, run: &str, available: &[Theme], slug: &str, owner: &str) -> String {
    let theme = available.iter().find(|c| c.slug == slug && c.import_package() == owner);
    if !crate::commands::theme::state::is_local_owner(owner) {
        let selector = theme.map(|t| t.package.clone()).unwrap_or_else(|| owner.to_string());
        return format!("npm install {owner}@latest; {run} theme add {slug} --package {selector}");
    }
    let source = match theme {
        Some(t) => rel(project_dir, &np::join2(&t.source_dir, &t.entry)),
        None => np::join(&[owner, slug, &format!("{slug}Theme.ts")]),
    };
    format!("{run} theme build {source}; {run} theme add {slug}")
}

fn normalize_font_name(v: &str) -> String {
    let t = v.trim_matches(crate::discovery::paths::js_ws);
    let unq = if let Some(m) = crate::doctor_re!(r"^(['\x22])(.*)\1$", "u").find(t) { t[m.group(2).unwrap()].to_string() } else { t.to_string() };
    use crate::commands::doctor::util::JsRe;
    crate::doctor_re!(r"\s+", "gu").replace_all(&unq, " ")
}

fn named_theme_fonts(files: &[String]) -> Vec<String> {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::*;
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    use oxc_ast_visit::{walk, Visit};
    let mut names: Vec<(String, String)> = Vec::new();
    for f in files {
        let Some(source) = (if np::exists(f) { read(f) } else { None }) else { continue };
        let alloc = Allocator::default();
        let ret = Parser::new(&alloc, &source, SourceType::unambiguous().with_typescript(true).with_jsx(true)).parse();
        if ret.fatal_error || !ret.diagnostics.is_empty() {
            continue;
        }
        struct V {
            pairs: Vec<(String, String)>,
        }
        impl<'a> Visit<'a> for V {
            fn visit_object_property(&mut self, it: &ObjectProperty<'a>) {
                let key = match &it.key {
                    PropertyKey::StaticIdentifier(i) => Some(i.name.to_string()),
                    PropertyKey::StringLiteral(s) => Some(s.value.display().to_string()),
                    PropertyKey::Identifier(i) if !it.computed => Some(i.name.to_string()),
                    _ => None,
                };
                if let (Some(k), Expression::StringLiteral(v)) = (key, &it.value) {
                    self.pairs.push((k, v.value.display().to_string()));
                }
                walk::walk_object_property(self, it);
            }
        }
        let mut v = V { pairs: vec![] };
        v.visit_program(&ret.program);
        for (key, value) in v.pairs {
            let probe = if key.starts_with("--font-family-") {
                serde_json::json!({"tokens": {key: value}})
            } else if key == "family" {
                serde_json::json!({"typography": {"body": {"family": value}}})
            } else if key == "fontFamily" {
                serde_json::json!({"components": {"probe": {"base": {"fontFamily": value}}}})
            } else {
                continue;
            };
            for n in crate::commands::theme_build::fonts::collect_unloaded_fonts(&probe) {
                let lower = n.to_lowercase();
                if !names.iter().any(|(l, _)| *l == lower) {
                    names.push((lower, n));
                }
            }
        }
    }
    names.into_iter().map(|(_, n)| n).collect()
}

fn font_stylesheet_evidence(css_text: &str) -> Result<(Vec<String>, bool), String> {
    let nodes = css::parse(css_text)?;
    let mut ats = Vec::new();
    css::walk_at_rules(&nodes, &mut ats);
    let mut loaded = Vec::new();
    let mut external = false;
    for a in ats {
        if let css::Node::AtRule { name, children, .. } = a {
            let n = name.to_lowercase();
            if n == "import" {
                external = true;
            }
            if n != "font-face" {
                continue;
            }
            let mut ds = Vec::new();
            css::walk_decls(children, &mut ds);
            for d in ds {
                if d.prop.eq_ignore_ascii_case("font-family") {
                    let v = normalize_font_name(&d.value).to_lowercase();
                    if !loaded.contains(&v) {
                        loaded.push(v);
                    }
                }
            }
        }
    }
    Ok((loaded, external))
}

fn global_rules(css_text: &str, slug: &str) -> Result<Vec<(String, String)>, String> {
    let nodes = css::parse(css_text)?;
    let mut rules = Vec::new();
    css::walk_rules(&nodes, &mut Vec::new(), &mut rules);
    let needles = [format!("[data-astryx-theme=\"{slug}\"]"), format!("[data-astryx-theme='{slug}']")];
    let mut out: Vec<(String, String)> = Vec::new();
    for (selector, children, ancestors) in rules {
        if needles.iter().any(|n| selector.contains(n.as_str())) || ancestors.iter().any(|(_, p)| needles.iter().any(|n| p.contains(n.as_str()))) {
            continue;
        }
        if ancestors.iter().any(|(n, _)| n.to_lowercase().ends_with("keyframes")) {
            continue;
        }
        let mut ds = Vec::new();
        css::walk_decls(children, &mut ds);
        let mut decls: Vec<String> = ds.iter().map(|d| format!("{}:{}{}", d.prop.trim(), d.value.trim(), if d.important { "!important" } else { "" })).collect();
        decls.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
        let key = selector.trim().to_string();
        let v = decls.join(";");
        match out.iter_mut().find(|(k, _)| *k == key) {
            Some(e) => e.1 = v,
            None => out.push((key, v)),
        }
    }
    Ok(out)
}

fn chk(id: &str, label: &str, status: Status, message: impl Into<String>) -> Check {
    Check::new(id, label, status, message)
}

/// The managed-record checks, after `readThemeState` found a generated module.
pub fn managed_checks(state: &crate::commands::theme::state::ThemeState) -> Vec<Check> {
    let cli_root = std::path::PathBuf::from(crate::discovery::paths::cli_root());
    let project_dir = state.project_dir.clone();
    let run = env::invocation(&project_dir);
    let owner_entries: Vec<(String, String)> = state.themes.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
    let available = crate::commands::theme::discovery::available(&cli_root, &project_dir, true);
    let discovery_error: Option<String> = None;
    let mut resolved: Vec<Entry> = Vec::new();
    let mut problems: Vec<(String, String, String)> = Vec::new();
    let count = |owner: &str| available.iter().filter(|t| t.import_package() == owner).count();
    for (slug, owner) in &owner_entries {
        let Some(theme) = available.iter().find(|c| c.slug == *slug && c.import_package() == owner) else {
            problems.push((slug.clone(), owner.clone(), format!("Theme \"{slug}\" from {owner} is unavailable.")));
            continue;
        };
        let entry = match crate::commands::theme::imports::resolve(theme, &project_dir, count(owner).max(1)) {
            Ok(e) => e,
            Err(e) => {
                problems.push((slug.clone(), owner.clone(), e));
                continue;
            }
        };
        match crate::commands::theme::recorded::resolve_recorded_theme(&cli_root, &project_dir, Some(slug)) {
            Ok(loaded) => {
                if loaded.module.is_none() {
                    let why = loaded.problem.clone().unwrap_or_else(|| format!("{} does not resolve", loaded.specifier));
                    problems.push((slug.clone(), owner.clone(), format!("Theme \"{slug}\" from {owner} could not load its built module: {why}.")));
                    continue;
                }
            }
            Err(e) => {
                let first = e.message.split('\n').next().unwrap_or("").trim().to_string();
                let detail = if first.is_empty() { e.name.clone() } else { first };
                problems.push((slug.clone(), owner.clone(), format!("Theme \"{slug}\" from {owner} could not load its built module: {detail}.")));
                continue;
            }
        }
        resolved.push(entry);
    }
    let incomplete = discovery_error.is_some() || !problems.is_empty() || resolved.len() != owner_entries.len();
    let valid_default = state.default_slug.as_ref().map(|d| state.themes.contains_key(d)).unwrap_or(false);
    let prepared: Option<(Vec<Entry>, String)> = if !incomplete && valid_default {
        plan(state, &resolved).ok()
    } else {
        None
    };
    let mut checks = Vec::new();
    // theme-owners
    let (id, label) = ("theme-owners", "Theme owners and built imports");
    if owner_entries.is_empty() {
        checks.push(chk(id, label, Status::Fail, "The generated record has no added themes.").fix(format!("{run} theme add <slug>")));
    } else if let Some(e) = &discovery_error {
        checks.push(chk(id, label, Status::Fail, e.clone()).fix(format!("{run} theme add <slug>")));
    } else if !problems.is_empty() {
        checks.push(
            chk(id, label, Status::Fail, problems.iter().map(|p| p.2.clone()).collect::<Vec<_>>().join(" "))
                .fix(problems.iter().map(|p| refresh_command(&project_dir, &run, &available, &p.0, &p.1)).collect::<Vec<_>>().join(" ")),
        );
    } else {
        checks.push(chk(
            id,
            label,
            Status::Pass,
            format!("{} added theme{} resolve to built modules and stylesheets, and every built module loads.", resolved.len(), if resolved.len() == 1 { "" } else { "s" }),
        ));
    }
    // theme-module
    let current = state.module.expected_original.as_ref().map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let (id, label) = ("theme-module", "Generated theme module");
    match &prepared {
        None => checks.push(chk(id, label, Status::Info, "Could not regenerate the module until its owners, imports, and default are valid.")),
        Some((_, contents)) if *contents != current => checks.push(
            chk(id, label, Status::Fail, format!("{} differs from the exact module generated from its own record.", state.module.path))
                .fix(format!("{run} theme use {}", state.default_slug.clone().unwrap_or_default())),
        ),
        Some(_) => checks.push(chk(id, label, Status::Pass, format!("{} has the generated marker and exactly matches its record.", state.module.path))),
    }
    // theme-module-import
    let mut parse_failures = 0;
    let mut found = false;
    for f in list_project_source_files(&project_dir, &state.module.file, false) {
        match read(&f).ok_or(()).and_then(|s| module_specifiers(&s, false)) {
            Ok(specs) => {
                if specs.iter().any(|s| specifier_targets(s, &f, &state.module.file)) {
                    found = true;
                    break;
                }
            }
            Err(_) => parse_failures += 1,
        }
    }
    let (id, label) = ("theme-module-import", "App imports the theme module");
    if found {
        checks.push(chk(id, label, Status::Pass, format!("Project source imports {}.", state.module.path)));
    } else {
        checks.push(
            chk(
                id,
                label,
                Status::Warn,
                format!(
                    "Could not prove that project source imports {}{}.",
                    state.module.path,
                    if parse_failures > 0 { format!("; {parse_failures} source file(s) could not be parsed") } else { String::new() }
                ),
            )
            .fix("Import {themes, defaultThemeSlug} from the generated module and {Theme} from '@astryxdesign/core/theme', then render <Theme theme={themes[defaultThemeSlug]}>."),
        );
    }
    // theme-stylesheet-imports
    let (id, label) = ("theme-stylesheet-imports", "Built theme stylesheet imports");
    let default = state.default_slug.clone().unwrap_or_default();
    if discovery_error.is_some() || !problems.is_empty() {
        checks.push(chk(id, label, Status::Info, "Could not prove module and stylesheet pairs until every built import resolves."));
    } else {
        let themes: Vec<Entry> = prepared.as_ref().map(|p| p.0.clone()).unwrap_or_else(|| resolved.clone());
        let mut files = vec![state.module.file.clone()];
        files.extend(list_project_source_files(&project_dir, &state.module.file, false));
        let mut unpaired: Vec<String> = Vec::new();
        let mut unproven: Vec<String> = Vec::new();
        for f in &files {
            let Some(src) = read(f) else { continue };
            let cands: Vec<&Entry> = themes
                .iter()
                .filter(|th| if th.source == "local" { src.contains(&np::basename(th.module_file.as_deref().unwrap_or(""))) } else { src.contains(&th.module) })
                .collect();
            if cands.is_empty() {
                continue;
            }
            let Ok(specs) = module_specifiers(&src, false) else {
                unproven.push(rel(&project_dir, f));
                continue;
            };
            for th in cands {
                let local = th.source == "local";
                let imports_module = specs.iter().any(|s| if local { specifier_targets(s, f, th.module_file.as_deref().unwrap_or("")) } else { *s == th.module });
                if !imports_module {
                    continue;
                }
                let imports_css = specs.iter().any(|s| if local { specifier_targets(s, f, th.stylesheet_file.as_deref().unwrap_or("")) } else { *s == th.stylesheet });
                if !imports_css {
                    let sheet = if !th.stylesheet.is_empty() { th.stylesheet.clone() } else { rel(&project_dir, th.stylesheet_file.as_deref().unwrap_or("")) };
                    unpaired.push(format!("{} imports {} without {sheet}", rel(&project_dir, f), th.slug));
                }
            }
        }
        if !unpaired.is_empty() {
            checks.push(chk(id, label, Status::Fail, unpaired.join("; ")).fix(format!("Import the named stylesheet beside each built module, then run {run} theme use {default}.")));
        } else if !unproven.is_empty() {
            checks.push(chk(id, label, Status::Info, format!("Could not parse theme imports in {}.", unproven.join(", "))));
        } else {
            checks.push(chk(id, label, Status::Pass, "Every added built module import is paired with its stylesheet import."));
        }
    }
    // theme-local-builds
    let (id, label) = ("theme-local-builds", "Local theme build freshness");
    let locals: Vec<&Entry> = resolved.iter().filter(|e| e.source == "local").collect();
    if incomplete {
        checks.push(chk(id, label, Status::Info, "Could not check local build freshness until every local output resolves."));
    } else if !locals.is_empty() && crate::discovery::paths::find_project_core_dir(&project_dir).is_none() {
        checks.push(chk(id, label, Status::Info, "The project's Core isn't installed, so local theme builds were not checked. Install the project's dependencies, then run doctor again."));
    } else if locals.is_empty() {
        checks.push(chk(id, label, Status::Pass, "No added local themes need a freshness check."));
    } else {
        let mut stale: Vec<String> = Vec::new();
        let root = cli_root.to_string_lossy().into_owned();
        for th in &locals {
            let Some(a) = available.iter().find(|c| c.slug == th.slug && c.import_package() == th.owner) else { continue };
            let entry = np::join2(&a.source_dir, &a.entry);
            match crate::commands::theme_build::check_up_to_date(&entry, &project_dir, &root) {
                Ok(true) => {}
                _ => stale.push(th.slug.clone()),
            }
        }
        if !stale.is_empty() {
            checks.push(
                chk(id, label, Status::Fail, format!("Local theme outputs are missing or stale: {}.", stale.join(", ")))
                    .fix(stale.iter().map(|s| refresh_command(&project_dir, &run, &available, s, state.themes.get(s).map(|x| x.as_str()).unwrap_or(""))).collect::<Vec<_>>().join(" ")),
            );
        } else {
            checks.push(chk(id, label, Status::Pass, "Every added local theme output matches its source."));
        }
    }
    // theme-private-variables
    let root = cli_root.to_string_lossy().into_owned();
    let mut private: Vec<(Entry, String)> = Vec::new();
    for th in &resolved {
        let Some(a) = available.iter().find(|c| c.slug == th.slug && c.import_package() == th.owner) else { continue };
        let entry = np::join2(&a.source_dir, &a.entry);
        match crate::commands::theme_build::validate_private_inputs(&entry, &project_dir, &root) {
            Ok(errors) if !errors.is_empty() => private.push((th.clone(), errors.join("; "))),
            Ok(_) => {}
            Err(e) => private.push((th.clone(), format!("input could not be inspected: {e}"))),
        }
    }
    let (id, label) = ("theme-private-variables", "Private theme variables");
    if incomplete {
        checks.push(chk(id, label, Status::Info, "Could not inspect every theme input until built imports resolve."));
    } else if !private.is_empty() {
        checks.push(
            chk(id, label, Status::Fail, format!("Added theme inputs set private --_* variables directly ({}).", private.iter().map(|(t, m)| format!("{}: {m}", t.slug)).collect::<Vec<_>>().join("; "))).fix(format!(
                "Remove the direct private input keys, then {}",
                private.iter().map(|(t, _)| refresh_command(&project_dir, &run, &available, &t.slug, &t.owner)).collect::<Vec<_>>().join(" ")
            )),
        );
    } else {
        checks.push(chk(id, label, Status::Pass, "No added theme input sets a private --_* variable directly."));
    }
    // theme-core-peers
    let core_dir = crate::discovery::paths::find_project_core_dir(&project_dir);
    let core_version = core_dir.as_ref().and_then(|d| np::read_json(&np::join2(d, "package.json"))).and_then(|p| p.get("version").and_then(|v| v.as_str()).map(String::from));
    let mut peer: Vec<(String, String, Option<String>, String)> = Vec::new();
    for (slug, owner) in &owner_entries {
        if crate::commands::theme::state::is_local_owner(owner) {
            continue;
        }
        let pd = crate::discovery::paths::find_installed_package(&project_dir, owner, crate::discovery::paths::INSTALLED_REACH);
        let pkg = pd.and_then(|d| np::read_json(&np::join2(&d, "package.json")));
        let range = pkg.as_ref().and_then(|p| p.get("peerDependencies")).and_then(|p| p.get("@astryxdesign/core")).and_then(|v| v.as_str()).map(String::from);
        let ok = match (&core_version, &range) {
            (Some(v), Some(r)) => crate::discovery::semver::satisfies_range(v, r),
            _ => false,
        };
        if !ok {
            peer.push((
                slug.clone(),
                owner.clone(),
                range.clone(),
                format!("{slug}: {owner} requires {}, installed {}", range.clone().unwrap_or_else(|| "an undeclared Core range".into()), core_version.clone().unwrap_or_else(|| "none".into())),
            ));
        }
    }
    let (id, label) = ("theme-core-peers", "Theme Core peer compatibility");
    if incomplete {
        checks.push(chk(id, label, Status::Info, "Could not prove Core peer compatibility until every added theme resolves."));
    } else if !peer.is_empty() {
        checks.push(
            chk(id, label, Status::Fail, peer.iter().map(|p| p.3.clone()).collect::<Vec<_>>().join("; ")).fix(
                peer.iter()
                    .map(|p| match &p.2 {
                        Some(r) => format!("npm install '@astryxdesign/core@{r}'; {run} doctor"),
                        None => refresh_command(&project_dir, &run, &available, &p.0, &p.1),
                    })
                    .collect::<Vec<_>>()
                    .join(" "),
            ),
        );
    } else {
        checks.push(chk(id, label, Status::Pass, "Every added package theme accepts the installed @astryxdesign/core version."));
    }
    // theme-default
    let (id, label) = ("theme-default", "Default added theme");
    if valid_default {
        checks.push(chk(id, label, Status::Pass, format!("Default theme \"{default}\" is added.")));
    } else {
        checks.push(chk(id, label, Status::Fail, format!("Default theme \"{default}\" is not one of the added themes.")).fix(match owner_entries.first() {
            Some((s, _)) => format!("{run} theme use {s}"),
            None => format!("{run} theme add <slug>"),
        }));
    }
    // theme-fonts
    let generated_imports = module_specifiers(&current, false).ok();
    let mut font_failures: Vec<(Entry, String)> = Vec::new();
    let mut external: Vec<String> = Vec::new();
    let mut missing_warn: Vec<(Entry, String)> = Vec::new();
    for th in &resolved {
        let av = available.iter().find(|c| c.slug == th.slug && c.import_package() == th.owner);
        let mut files = vec![th.module_file.clone().unwrap_or_default()];
        if let Some(a) = av {
            files.push(np::join2(&a.source_dir, &a.entry));
        }
        let names = named_theme_fonts(&files);
        if names.is_empty() {
            continue;
        }
        let imported = prepared.as_ref().and_then(|p| p.0.iter().find(|e| e.slug == th.slug).cloned()).unwrap_or_else(|| th.clone());
        if th.font_stylesheet_file.is_none() || imported.font_stylesheet.is_none() {
            missing_warn.push((th.clone(), format!("{} (font stylesheet is not imported)", names.join(", "))));
            continue;
        }
        if !generated_imports.as_ref().map(|g| g.contains(imported.font_stylesheet.as_deref().unwrap_or(""))).unwrap_or(false) {
            font_failures.push((th.clone(), format!("{} (font stylesheet is not imported)", names.join(", "))));
            continue;
        }
        match read(th.font_stylesheet_file.as_deref().unwrap_or("")).ok_or(String::new()).and_then(|c| font_stylesheet_evidence(&c)) {
            Ok((loaded, ext)) => {
                let missing: Vec<String> = names.iter().filter(|n| !loaded.contains(&n.to_lowercase())).cloned().collect();
                if missing.is_empty() {
                    continue;
                }
                if ext {
                    external.push(format!("{}: {}", th.slug, missing.join(", ")));
                } else {
                    font_failures.push((th.clone(), missing.join(", ")));
                }
            }
            Err(_) => font_failures.push((th.clone(), "font stylesheet could not be parsed".into())),
        }
    }
    let mut warn_messages = Vec::new();
    let mut warn_fixes = Vec::new();
    if !missing_warn.is_empty() {
        warn_messages.push(format!(
            "Added themes name font families but import no font stylesheet ({}).",
            missing_warn.iter().map(|(t, m)| format!("{}: {m}", t.slug)).collect::<Vec<_>>().join("; ")
        ));
        let local: Vec<&(Entry, String)> = missing_warn.iter().filter(|(t, _)| t.source == "local").collect();
        let pkg: Vec<&(Entry, String)> = missing_warn.iter().filter(|(t, _)| t.source != "local").collect();
        if !local.is_empty() {
            warn_fixes.push(format!(
                "Add <slug>.fonts.css beside each built local theme output, then {}.",
                local.iter().map(|(t, _)| format!("{run} theme add {}", t.slug)).collect::<Vec<_>>().join("; ")
            ));
        }
        if !pkg.is_empty() {
            warn_fixes.push("Load the named package fonts in app HTML, or install a package version that exports <slug>.fonts.css (or fonts.css for a single-theme package).".into());
        }
    }
    if !external.is_empty() {
        warn_messages.push(format!("External font imports prevent proof for {}.", external.join("; ")));
        warn_fixes.push("Confirm the font service stylesheet loads each named family.".into());
    }
    let (id, label) = ("theme-fonts", "Theme font loading");
    if incomplete {
        checks.push(chk(id, label, Status::Info, "Could not prove font loading until every added theme resolves."));
    } else if !font_failures.is_empty() {
        checks.push(
            chk(id, label, Status::Fail, format!("Named font families have no proven loader ({}).", font_failures.iter().map(|(t, m)| format!("{}: {m}", t.slug)).collect::<Vec<_>>().join("; "))).fix(format!(
                "Add the missing font stylesheet export or local <slug>.fonts.css, then {}",
                font_failures.iter().map(|(t, _)| refresh_command(&project_dir, &run, &available, &t.slug, &t.owner)).collect::<Vec<_>>().join(" ")
            )),
        );
    } else if !warn_messages.is_empty() {
        checks.push(chk(id, label, Status::Warn, warn_messages.join(" ")).fix(warn_fixes.join(" ")));
    } else {
        checks.push(chk(id, label, Status::Pass, "Every named non-system font has a local @font-face loader."));
    }
    // theme-global-rules
    let mut by_selector: Vec<(String, Entry, String)> = Vec::new();
    let mut gproblems: Vec<(String, Vec<Entry>)> = Vec::new();
    for th in &resolved {
        match read(th.stylesheet_file.as_deref().unwrap_or("")).ok_or(String::new()).and_then(|c| global_rules(&c, &th.slug)) {
            Ok(rules) => {
                for (selector, decls) in rules {
                    match by_selector.iter().find(|(s, _, _)| *s == selector) {
                        Some((_, pt, pd)) if *pd != decls => gproblems.push((format!("{selector}: {}, {}", pt.slug, th.slug), vec![pt.clone(), th.clone()])),
                        Some(_) => {}
                        None => by_selector.push((selector, th.clone(), decls)),
                    }
                }
            }
            Err(_) => gproblems.push((format!("{}: stylesheet could not be parsed", th.slug), vec![th.clone()])),
        }
    }
    let mut repair: Vec<Entry> = Vec::new();
    for (_, ts) in &gproblems {
        for t in ts {
            if let Some(slot) = repair.iter_mut().find(|r| r.owner == t.owner && r.slug == t.slug) {
                *slot = t.clone();
            } else {
                repair.push(t.clone());
            }
        }
    }
    let (id, label) = ("theme-global-rules", "Cross-theme global CSS rules");
    if incomplete {
        checks.push(chk(id, label, Status::Info, "Could not compare global CSS until every added stylesheet resolves."));
    } else if !gproblems.is_empty() {
        checks.push(
            chk(id, label, Status::Fail, format!("Added themes write different global rules for the same selector ({}).", gproblems.iter().map(|p| p.0.clone()).collect::<Vec<_>>().join("; "))).fix(format!(
                "Scope each conflicting rule under its [data-astryx-theme] selector, then {}",
                repair.iter().map(|t| refresh_command(&project_dir, &run, &available, &t.slug, &t.owner)).collect::<Vec<_>>().join(" ")
            )),
        );
    } else {
        checks.push(chk(id, label, Status::Pass, "No added themes write different rules for the same selector outside their own scope."));
    }
    if let Some(m) = unmigrated_copy_check(&project_dir) {
        checks.push(m);
    }
    checks
}

/// `planThemeAppWrite(state, themes, defaultSlug, resolved)`: entries and
/// the module contents.
fn plan(state: &crate::commands::theme::state::ThemeState, resolved: &[Entry]) -> Result<(Vec<Entry>, String), String> {
    use crate::commands::theme::state;
    let module = state::resolve_module(&state.project_dir, true).map_err(|e| e.0)?;
    let entries: Vec<Entry> = resolved
        .iter()
        .map(|t| {
            if t.source == "local" {
                let mut e = t.clone();
                e.module = state::local_import_specifier(&module.file, t.module_file.as_deref().unwrap_or(""));
                e.stylesheet = state::local_import_specifier(&module.file, t.stylesheet_file.as_deref().unwrap_or(""));
                if let Some(f) = &t.font_stylesheet_file {
                    e.font_stylesheet = Some(state::local_import_specifier(&module.file, f));
                }
                e
            } else {
                t.clone()
            }
        })
        .collect();
    for e in &entries {
        if state.themes.get(&e.slug) != Some(&e.owner) {
            return Err(format!("Theme record for \"{}\" does not match its resolved owner.", e.slug));
        }
    }
    let contents = state::render_module(&entries, state.default_slug.as_deref().unwrap_or(""), module.typescript).map_err(|e| e.0)?;
    Ok((entries, contents))
}

/// `unmigratedCopyCheck(projectDir)`.
pub fn unmigrated_copy_check(project_dir: &str) -> Option<Check> {
    let copies = crate::commands::theme::discovery::unmigrated_copies(project_dir);
    if copies.is_empty() {
        return None;
    }
    let shown = copies.iter().map(|c| c.1.clone()).collect::<Vec<_>>().join(", ");
    let command = format!("{} upgrade --from 0.6.4 --path . --apply", env::invocation(project_dir));
    Some(
        chk("theme-unmigrated-copies", "Earlier copied themes", Status::Warn, format!("{} source theme copy or copies are not managed themes yet: {shown}.", copies.len()))
            .fix(format!("Write their missing descriptors with `{command}`.")),
    )
}

/// `themeImportWiring(cwd)`: themes the app wires by importing their built
/// module or stylesheet, or whose module a `theme` value passed to Core's
/// `Theme` traces to.
pub fn theme_import_wiring(cwd: &str) -> super::themes::Wiring {
    let none = super::themes::Wiring::default();
    let Ok(state) = crate::commands::theme::state::read(cwd) else { return none };
    if state.configured || super::themes::app_package_names_theme_pub(cwd) {
        return none;
    }
    let project_dir = state.project_dir.clone();
    let cli_root = std::path::PathBuf::from(crate::discovery::paths::cli_root());
    let available = crate::commands::theme::discovery::available(&cli_root, &project_dir, true);
    let count = |owner: &str| available.iter().filter(|t| t.import_package() == owner).count();
    let mut themes: Vec<Entry> = Vec::new();
    for th in &available {
        let Ok(e) = crate::commands::theme::imports::resolve(th, &project_dir, count(th.import_package()).max(1)) else { continue };
        if e.source == "local" || crate::discovery::paths::find_installed_package(&project_dir, &e.owner, crate::discovery::paths::INSTALLED_REACH).is_some() {
            themes.push(e);
        }
    }
    if themes.is_empty() {
        return none;
    }
    let key = |e: &Entry| format!("{}\0{}", e.owner, e.slug);
    let real = |f: &str| std::fs::canonicalize(f).ok().map(|p| p.to_string_lossy().into_owned());
    let installed_dir = |owner: &str| crate::discovery::paths::find_installed_package(&project_dir, owner, crate::discovery::paths::INSTALLED_REACH).and_then(|d| real(&d));
    let theme_at = |origin: &crate::discovery::module_origins::Origin| -> Option<Entry> {
        let file = real(&origin.file)?;
        if let Some(l) = themes.iter().find(|th| th.source == "local" && th.module_file.as_deref().and_then(|m| real(m)).as_deref() == Some(file.as_str())) {
            return Some(l.clone());
        }
        let owned: Vec<&Entry> = themes
            .iter()
            .filter(|th| th.source != "local" && installed_dir(&th.owner).map(|d| file.starts_with(&format!("{d}/"))).unwrap_or(false))
            .collect();
        let named: Vec<&&Entry> = owned.iter().filter(|th| th.export_name == origin.name).collect();
        if named.len() == 1 {
            return Some((*named[0]).clone());
        }
        if owned.len() == 1 {
            Some(owned[0].clone())
        } else {
            None
        }
    };
    let mut wired: Vec<(String, String, String)> = Vec::new();
    let mut unconfirmed: Vec<String> = Vec::new();
    for file in list_project_source_files(&project_dir, "", true) {
        let Some(src) = read(&file) else { continue };
        let shown = rel(&project_dir, &file);
        let origin_pass = np::extname(&file) != ".css" && src.contains("theme=");
        let cands: Vec<&Entry> = themes
            .iter()
            .filter(|th| !wired.iter().any(|w| w.0 == key(th)))
            .filter(|th| {
                if th.source == "local" {
                    src.contains(&np::basename(th.module_file.as_deref().unwrap_or(""))) || src.contains(&np::basename(th.stylesheet_file.as_deref().unwrap_or("")))
                } else {
                    src.contains(&th.module) || src.contains(&th.stylesheet)
                }
            })
            .collect();
        let _ = &cands;
        let specs: BTreeSet<String> = if np::extname(&file) == ".css" {
            css_imports(&src).into_iter().collect()
        } else {
            module_specifiers(&src, true).unwrap_or_default()
        };
        for th in cands {
            let hit = specs.iter().any(|s| {
                if th.source == "local" {
                    specifier_targets(s, &file, th.module_file.as_deref().unwrap_or("")) || specifier_targets(s, &file, th.stylesheet_file.as_deref().unwrap_or(""))
                } else {
                    *s == th.module || *s == th.stylesheet
                }
            });
            if hit {
                wired.push((key(th), th.slug.clone(), shown.clone()));
            }
        }
        if origin_pass {
            for origin in crate::discovery::module_origins::element_prop_origins(&file, &["@astryxdesign/core", "@astryxdesign/core/theme"], "Theme", "theme", Some(crate::discovery::module_origins::Unwrap::DefinedThemeBase)) {
                match origin.as_ref().and_then(|o| theme_at(o)) {
                    None => {
                        if !unconfirmed.contains(&shown) {
                            unconfirmed.push(shown.clone());
                        }
                    }
                    Some(th) => {
                        if !wired.iter().any(|w| w.0 == key(&th)) {
                            wired.push((key(&th), th.slug.clone(), shown.clone()));
                        }
                    }
                }
            }
        }
    }
    unconfirmed.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    super::themes::Wiring {
        wired: themes.iter().filter_map(|th| wired.iter().find(|w| w.0 == key(th)).map(|w| (w.1.clone(), w.2.clone()))).collect(),
        unconfirmed,
    }
}

/// `cssImports(css)` (`foundation/render/embedded-imports.mjs`).
fn css_imports(css_text: &str) -> Vec<String> {
    let Ok(nodes) = css::parse(css_text) else { return vec![] };
    let mut ats = Vec::new();
    css::walk_at_rules(&nodes, &mut ats);
    let re = crate::doctor_re!(r#"^\s*(?:url\(\s*(['"]?)([\s\S]*?)\1\s*\)|(['"])([\s\S]*?)\3)"#);
    let mut out = Vec::new();
    for a in ats {
        if let css::Node::AtRule { name, params, .. } = a {
            if !name.eq_ignore_ascii_case("import") {
                continue;
            }
            if let Some(m) = re.find(params) {
                let url = m.group(2).or(m.group(4)).map(|r| params[r].to_string()).unwrap_or_default();
                if !url.is_empty() {
                    out.push(url);
                }
            }
        }
    }
    out
}

pub fn _value(_: &Value) {}
