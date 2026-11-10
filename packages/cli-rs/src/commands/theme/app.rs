//! `theme add | remove | use | eject | list`: the app's themes.
//! Port of api/theme/_adapter.mjs (app half), api/theme/{add,remove,use,eject,list}
//! and their printers in clients/cli/commands/theme.mjs.

use super::discovery::{self, Theme};
use super::imports;
use super::state::{self, Entry, ThemeState};
use crate::cli::command::{CmdResult, Invocation, Out, Suggestion};
use crate::cli::format::{self, code, record, section, text, Block, Field};
use crate::commands::template::{fsutil, ApiError};
use crate::json::{Map, Value};
use std::path::Path;

fn sv(s: &str) -> Value {
    Value::String(s.to_string())
}

fn theme_err(e: state::StateError) -> ApiError {
    let code = if e.0.starts_with("Refusing to replace") { "ERR_FILE_EXISTS" } else { "ERR_THEME_INVALID" };
    ApiError::new(&e.0, code)
}

fn fmt_at(cmd: &str, dir: &str) -> String {
    crate::cli::env::format_cli_command_at(Path::new(dir), cmd)
}

/// `findTheme`.
fn find_theme(inv: &Invocation, slug: &str, package: Option<&str>, include_local: bool) -> Result<Option<Theme>, ApiError> {
    if slug.is_empty() {
        return Ok(None);
    }
    let cwd = fsutil::path_str(&inv.cwd);
    let themes = discovery::available(&inv.cli_root, &cwd, include_local);
    let needle = slug.to_lowercase();
    let matches: Vec<&Theme> =
        themes.iter().filter(|t| t.slug.to_lowercase() == needle && package.map_or(true, |p| t.package == p)).collect();
    if matches.len() > 1 && package.is_none() {
        if let Some(l) = matches.iter().find(|t| t.source == "local") {
            return Ok(Some((*l).clone()));
        }
    }
    if matches.len() > 1 {
        return Err(ApiError::with(
            &format!("Theme \"{slug}\" is provided by more than one package. Select one with --package."),
            matches.iter().map(|t| Suggestion::new(format!("{} --package {}", t.slug, t.package), t.origin_reason())).collect(),
            "ERR_AMBIGUOUS_THEME",
        ));
    }
    Ok(matches.first().map(|t| (*t).clone()))
}

fn read_state(cwd: &str) -> Result<ThemeState, ApiError> {
    state::read(cwd).map_err(theme_err)
}

fn resolve_recorded(themes: &indexmap::IndexMap<String, String>, project_dir: &str, available: &[Theme]) -> Result<Vec<Entry>, ApiError> {
    let mut counts: std::collections::HashMap<String, usize> = Default::default();
    for t in available {
        *counts.entry(t.import_package().to_string()).or_default() += 1;
    }
    let mut out = Vec::new();
    for (slug, owner) in themes {
        let Some(theme) = available.iter().find(|c| &c.slug == slug && c.import_package() == owner) else {
            return Err(ApiError::new(
                &format!(
                    "Added theme \"{slug}\" from {owner} is unavailable. Reinstall the package or restore the local theme, then run `{}`.",
                    fmt_at(&format!("theme add {slug} --package {owner}"), project_dir)
                ),
                "ERR_UNKNOWN_THEME",
            ));
        };
        out.push(imports::resolve(theme, project_dir, *counts.get(owner).unwrap_or(&1)).map_err(|m| ApiError::new(&m, "ERR_THEME_INVALID"))?);
    }
    Ok(out)
}

pub struct AppResult {
    pub package: Option<String>,
    pub entries: Vec<Entry>,
    pub default: String,
    pub module_path: String,
    pub action: String,
    pub slug: String,
    pub changed: bool,
    pub first_add: bool,
}

/// `applyWrites([plan])` for one file.
fn apply_write(path: &str, contents: &str, create_only: bool, expected: Option<&[u8]>) -> Result<(), ApiError> {
    let _ = std::fs::create_dir_all(fsutil::dirname(path));
    let exists = Path::new(path).exists();
    if create_only && exists {
        return Err(ApiError::new(&format!("Refusing to overwrite existing file {path}."), "ERR_FILE_EXISTS"));
    }
    let original = if exists { std::fs::read(path).ok() } else { None };
    if let Some(e) = expected {
        if original.as_deref() != Some(e) {
            return Err(ApiError::new(
                &format!("Failed to write the generated theme module: File changed while preparing: {path}"),
                "ERR_WRITE_FAILED",
            ));
        }
    }
    std::fs::write(path, contents).map_err(|e| {
        ApiError::new(
            &format!("Failed to write the generated theme module: {}", crate::commands::template::node_err(&e, "open", path)),
            "ERR_WRITE_FAILED",
        )
    })
}

fn write_app(
    st: &ThemeState,
    themes: indexmap::IndexMap<String, String>,
    default: String,
    action: &str,
    slug: String,
    changed: bool,
    available: &[Theme],
) -> Result<AppResult, ApiError> {
    let resolved = resolve_recorded(&themes, &st.project_dir, available)?;
    let module = state::resolve_module(&st.project_dir, true).map_err(theme_err)?;
    let entries: Vec<Entry> = resolved
        .into_iter()
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
                t
            }
        })
        .collect();
    for e in &entries {
        if themes.get(&e.slug) != Some(&e.owner) {
            return Err(ApiError::new(&format!("Theme record for \"{}\" does not match its resolved owner.", e.slug), "ERR_THEME_INVALID"));
        }
    }
    let contents = state::render_module(&entries, &default, module.typescript).map_err(theme_err)?;
    apply_write(&module.file, &contents, module.expected_original.is_none(), module.expected_original.as_deref())?;
    let added = if action == "add" { entries.iter().find(|e| e.slug == slug) } else { None };
    Ok(AppResult {
        package: added.filter(|a| a.source != "local").map(|a| a.owner.clone()),
        entries: entries.clone(),
        default,
        module_path: module.path.clone(),
        action: action.into(),
        slug,
        changed,
        first_add: action == "add" && !st.configured,
    })
}

fn unknown_theme(inv: &Invocation, slug: &str, package: Option<&str>, include_local: bool, dot: bool) -> ApiError {
    let cwd = fsutil::path_str(&inv.cwd);
    let available = discovery::available(&inv.cli_root, &cwd, include_local);
    ApiError::with(
        &format!(
            "Unknown theme \"{slug}\"{}{}",
            package.map(|p| format!(" in package \"{p}\"")).unwrap_or_default(),
            if dot { "." } else { "" }
        ),
        available
            .iter()
            .map(|t| {
                Suggestion::new(
                    format!("{} --package {}", t.slug, t.package),
                    if include_local { t.origin_reason() } else if t.bundled { "bundled theme".into() } else { format!("provided by {}", t.package) },
                )
            })
            .collect(),
        "ERR_UNKNOWN_THEME",
    )
}

pub fn add_api(inv: &Invocation, slug: &str, package: Option<&str>) -> Result<AppResult, ApiError> {
    let cwd = fsutil::path_str(&inv.cwd);
    let Some(m) = find_theme(inv, slug, package, true)? else {
        return Err(unknown_theme(inv, slug, package, true, true));
    };
    let st = read_state(&cwd)?;
    let available = discovery::available(&inv.cli_root, &st.project_dir, true);
    let owner = m.import_package().to_string();
    let mut themes = st.themes.clone();
    let changed = st.themes.get(&m.slug) != Some(&owner);
    themes.insert(m.slug.clone(), owner);
    let default = if st.configured { st.default_slug.clone().unwrap_or_else(|| m.slug.clone()) } else { m.slug.clone() };
    write_app(&st, themes, default, "add", m.slug.clone(), changed, &available)
}

fn recorded_slug(st: &ThemeState, slug: &str) -> Option<String> {
    let n = slug.to_lowercase();
    st.themes.keys().find(|k| k.to_lowercase() == n).cloned()
}

pub fn remove_api(inv: &Invocation, slug: &str) -> Result<AppResult, ApiError> {
    let st = read_state(&fsutil::path_str(&inv.cwd))?;
    let rec = recorded_slug(&st, slug);
    let Some(rec) = rec.filter(|_| st.configured) else {
        return Err(ApiError::new(
            &format!("Theme \"{slug}\" is not added. Run `{}` first.", fmt_at(&format!("theme add {slug}"), &st.project_dir)),
            "ERR_UNKNOWN_THEME",
        ));
    };
    if st.default_slug.as_deref() == Some(rec.as_str()) {
        return Err(ApiError::new(
            &format!(
                "Theme \"{rec}\" is the default. Run `{}` before removing it.",
                fmt_at("theme use <other-slug>", &st.project_dir)
            ),
            "ERR_THEME_INVALID",
        ));
    }
    let mut themes = st.themes.clone();
    themes.shift_remove(&rec);
    let Some(default) = st.default_slug.clone() else {
        return Err(ApiError::new(
            &format!(
                "The generated theme module has no default theme. Run `{}` first.",
                fmt_at("theme use <slug>", &st.project_dir)
            ),
            "ERR_THEME_INVALID",
        ));
    };
    let available = discovery::available(&inv.cli_root, &st.project_dir, true);
    write_app(&st, themes, default, "remove", rec, true, &available)
}

pub fn use_api(inv: &Invocation, slug: &str) -> Result<AppResult, ApiError> {
    let st = read_state(&fsutil::path_str(&inv.cwd))?;
    let rec = recorded_slug(&st, slug);
    let Some(rec) = rec.filter(|_| st.configured) else {
        return Err(ApiError::new(
            &format!("Theme \"{slug}\" is not added. Run `{}` first.", fmt_at(&format!("theme add {slug}"), &st.project_dir)),
            "ERR_UNKNOWN_THEME",
        ));
    };
    let available = discovery::available(&inv.cli_root, &st.project_dir, true);
    let changed = st.default_slug.as_deref() != Some(rec.as_str());
    write_app(&st, st.themes.clone(), rec.clone(), "use", rec, changed, &available)
}

fn app_json(r: &AppResult) -> (Option<Value>, Value) {
    let themes: Vec<Value> = r
        .entries
        .iter()
        .map(|e| {
            let mut m = Map::new();
            m.insert("slug".into(), sv(&e.slug));
            m.insert("owner".into(), sv(&e.owner));
            m.insert("module".into(), sv(&e.module));
            m.insert("stylesheet".into(), sv(&e.stylesheet));
            if let Some(f) = &e.font_stylesheet {
                m.insert("fontStylesheet".into(), sv(f));
            }
            m.insert("source".into(), sv(&e.source));
            Value::Object(m)
        })
        .collect();
    let mut change = Map::new();
    change.insert("action".into(), sv(&r.action));
    change.insert("slug".into(), sv(&r.slug));
    change.insert("changed".into(), Value::Bool(r.changed));
    change.insert("firstAdd".into(), Value::Bool(r.first_add));
    let mut d = Map::new();
    d.insert("themes".into(), Value::Array(themes));
    d.insert("default".into(), sv(&r.default));
    d.insert("modulePath".into(), sv(&r.module_path));
    d.insert("change".into(), Value::Object(change));
    (r.package.as_deref().map(sv), Value::Object(d))
}

fn f(s: &str) -> Field {
    Field::from(s)
}

fn print_app(out: &mut Out, r: &AppResult) {
    if let Some(p) = &r.package {
        out.emit(&[record(&[("package".into(), f(p))])]);
    }
    let rows: Vec<format::Fields> = r
        .entries
        .iter()
        .map(|e| {
            vec![
                ("slug".into(), f(&e.slug)),
                ("owner".into(), f(&e.owner)),
                ("module".into(), f(&e.module)),
                ("stylesheet".into(), f(&e.stylesheet)),
                ("fontStylesheet".into(), Field::from(e.font_stylesheet.clone())),
                ("source".into(), f(&e.source)),
            ]
        })
        .collect();
    let summary: Vec<format::Fields> = vec![vec![
        ("default".into(), f(&r.default)),
        ("modulePath".into(), f(&r.module_path)),
        ("action".into(), f(&r.action)),
        ("slug".into(), f(&r.slug)),
        ("changed".into(), f(if r.changed { "true" } else { "false" })),
        ("firstAdd".into(), f(if r.first_add { "true" } else { "false" })),
    ]];
    out.emit(&[
        section("App themes", Some(&format!("{} added", r.entries.len()))),
        format::records(&rows),
        format::records(&summary),
    ]);
    if !r.first_add {
        return;
    }
    let base = fsutil::basename(&r.module_path);
    let ext = fsutil::extname(&base);
    let stem = &base[..base.len() - ext.len()];
    out.emit(&[
        text("Wire the generated module once in the app root:"),
        code(&format!(
            "import {{Theme}} from '@astryxdesign/core/theme';\nimport {{themes, defaultThemeSlug}} from './{stem}';\n\n<Theme theme={{themes[defaultThemeSlug]}}>\n  <App />\n</Theme>"
        )),
    ]);
}

fn fail(out: &mut Out, e: ApiError) -> CmdResult {
    super::fail(out, e)
}

fn finish_app(inv: &Invocation, out: &mut Out, r: Result<AppResult, ApiError>) -> CmdResult {
    let r = match r {
        Ok(r) => r,
        Err(e) => return fail(out, e),
    };
    super::warn_theme_integration_issues(inv, out);
    if inv.json() {
        let (pkg, data) = app_json(&r);
        out.json_out("theme.app", pkg, data, None);
    } else {
        print_app(out, &r);
    }
    Ok(())
}

pub fn remove_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    let slug = inv.arg(0).unwrap_or("").to_string();
    finish_app(inv, out, remove_api(inv, &slug))
}

pub fn use_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    let slug = inv.arg(0).unwrap_or("").to_string();
    finish_app(inv, out, use_api(inv, &slug))
}

pub fn add_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    let slug = inv.arg(0).map(String::from);
    let package = inv.opt_str("package").map(String::from);
    if inv.flag("list") || slug.as_deref().map_or(true, |s| s.is_empty()) {
        let cwd = fsutil::path_str(&inv.cwd);
        let themes: Vec<Theme> = discovery::available(&inv.cli_root, &cwd, false)
            .into_iter()
            .filter(|t| package.as_deref().map_or(true, |p| t.package == p))
            .collect();
        super::warn_theme_integration_issues(inv, out);
        if inv.json() {
            let data: Vec<Value> = themes
                .iter()
                .map(|t| {
                    let mut m = Map::new();
                    m.insert("slug".into(), sv(&t.slug));
                    m.insert("displayName".into(), sv(&t.display_name));
                    m.insert("description".into(), sv(&t.description));
                    m.insert("maintained".into(), Value::Bool(t.maintained));
                    m.insert("package".into(), sv(&t.package));
                    Value::Object(m)
                })
                .collect();
            out.json_out("theme.list", None, Value::Array(data), None);
            return Ok(());
        }
        let run = crate::cli::env::cli_invocation(&inv.cwd);
        let more = text(&format!("More themes in packages you could add: {run} discover theme"));
        if themes.is_empty() {
            out.emit(&[text("No themes are available in this project."), more]);
            return Ok(());
        }
        let items: Vec<String> = themes
            .iter()
            .map(|t| {
                let head = format!("{} ({}, {})", t.slug, if t.maintained { "maintained" } else { "example" }, t.package);
                if t.description.is_empty() { head } else { format!("{head}\n{}", t.description) }
            })
            .collect();
        out.emit(&[section("Themes", None), list_block(&themes), text(&next_steps(inv, &run)), more]);
        let _ = items;
        return Ok(());
    }
    let slug = slug.unwrap_or_default();
    finish_app(inv, out, add_api(inv, &slug, package.as_deref()))
}

/// `list([...])` with `[head, description]` items, as printThemeAddList builds them.
fn list_block(themes: &[Theme]) -> Block {
    let items: Vec<Vec<String>> = themes
        .iter()
        .map(|t| {
            let head = format!("{} ({}, {})", t.slug, if t.maintained { "maintained" } else { "example" }, t.package);
            if t.description.is_empty() { vec![head] } else { vec![head, t.description.clone()] }
        })
        .collect();
    let hang = " ".repeat(crate::cli::format::BULLET.chars().count() + 1);
    let rendered: Vec<String> = items
        .iter()
        .map(|lines| {
            let mut v = vec![format!("{} {}", crate::cli::format::BULLET, lines[0])];
            v.extend(lines[1..].iter().map(|l| format!("{hang}{l}")));
            v.join("\n")
        })
        .collect();
    let multiline = rendered.iter().any(|r| r.contains('\n'));
    Block(crate::cli::format::to_ascii(&rendered.join(if multiline { "\n\n" } else { "\n" })))
}

fn next_steps(inv: &Invocation, run: &str) -> String {
    let fork = format!("Fork source: {run} theme eject <slug> [target-path]");
    if crate::discovery::release::is_outside_project(&fsutil::path_str(&inv.cwd)) {
        fork
    } else {
        format!("Import one: {run} theme add <slug> [--package <package>]\n{fork}")
    }
}

pub fn list_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    let cwd = fsutil::path_str(&inv.cwd);
    let package = inv.opt_str("package").map(String::from);
    // readThemeListState
    let st = match state::find_theme_project(&cwd) {
        Err(_) => None,
        Ok(_) => match state::read(&cwd) {
            Ok(s) => Some(s),
            Err(e) => return fail(out, theme_err(e)),
        },
    };
    let project_dir = st.as_ref().map(|s| s.project_dir.clone()).unwrap_or_else(|| fsutil::normalize(&cwd));
    let themes = discovery::available(&inv.cli_root, &cwd, true);
    let rows: Vec<(Theme, bool, bool)> = themes
        .into_iter()
        .filter(|t| package.as_deref().map_or(true, |p| t.package == p))
        .map(|t| {
            let added = st.as_ref().map_or(false, |s| s.themes.get(&t.slug).map(|o| o.as_str()) == Some(t.import_package()));
            let default = added && st.as_ref().and_then(|s| s.default_slug.as_deref()) == Some(t.slug.as_str());
            (t, added, default)
        })
        .collect();
    let copies = if package.is_none() { discovery::unmigrated_copies(&project_dir) } else { vec![] };
    let upgrade = format!("{} upgrade --from 0.6.4 --path . --apply", crate::cli::env::cli_invocation(Path::new(&project_dir)));
    super::warn_theme_integration_issues(inv, out);
    if inv.json() {
        let data: Vec<Value> = rows
            .iter()
            .map(|(t, a, d)| {
                let mut m = Map::new();
                m.insert("slug".into(), sv(&t.slug));
                m.insert("displayName".into(), sv(&t.display_name));
                m.insert("description".into(), sv(&t.description));
                m.insert("maintained".into(), Value::Bool(t.maintained));
                m.insert("package".into(), sv(&t.package));
                m.insert("added".into(), Value::Bool(*a));
                m.insert("default".into(), Value::Bool(*d));
                m.insert("source".into(), sv(&t.source));
                Value::Object(m)
            })
            .collect();
        let meta = if copies.is_empty() {
            None
        } else {
            let mut mm = Map::new();
            mm.insert(
                "unmigratedCopies".into(),
                Value::Array(
                    copies
                        .iter()
                        .map(|(slug, p, src, desc)| {
                            let mut m = Map::new();
                            m.insert("slug".into(), sv(slug));
                            m.insert("path".into(), sv(p));
                            m.insert("source".into(), sv(src));
                            m.insert("descriptor".into(), sv(desc));
                            m.insert("upgradeCommand".into(), sv(&upgrade));
                            Value::Object(m)
                        })
                        .collect(),
                ),
            );
            Some(mm)
        };
        out.json_out("theme.list", None, Value::Array(data), meta);
        return Ok(());
    }
    let run = crate::cli::env::cli_invocation(&inv.cwd);
    let more = text(&format!("More themes in packages you could add: {run} discover theme"));
    if rows.is_empty() {
        out.emit(&[text("No themes are available in this project."), more]);
    } else {
        let yn = |b: bool| f(if b { "yes" } else { "no" });
        let recs: Vec<format::Fields> = rows
            .iter()
            .map(|(t, a, d)| {
                vec![
                    ("slug".into(), f(&t.slug)),
                    ("displayName".into(), f(&t.display_name)),
                    ("description".into(), f(&t.description)),
                    ("maintained".into(), yn(t.maintained)),
                    ("package".into(), f(&t.package)),
                    ("source".into(), f(&t.source)),
                    ("added".into(), yn(*a)),
                    ("default".into(), yn(*d)),
                ]
            })
            .collect();
        out.emit(&[
            section("Themes", Some(&format!("{} available", rows.len()))),
            format::records(&recs),
            text(&next_steps(inv, &run)),
            more,
        ]);
    }
    if !copies.is_empty() {
        let recs: Vec<format::Fields> = copies
            .iter()
            .map(|(slug, p, src, desc)| {
                vec![("slug".into(), f(slug)), ("path".into(), f(p)), ("source".into(), f(src)), ("descriptor".into(), f(desc))]
            })
            .collect();
        out.emit(&[
            section("Unmigrated theme copies", Some(&format!("{} not listed as themes", copies.len()))),
            format::records(&recs),
            text(&format!("Migrate them: {upgrade}")),
        ]);
    }
    Ok(())
}

fn local_descriptor(t: &Theme) -> String {
    let q = |s: &str| {
        let mut o = String::new();
        crate::json::quote(&mut o, s);
        o
    };
    format!(
        "/** @type {{import('@astryxdesign/cli/authoring').ThemeDoc}} */\nexport default {{\n  type: 'theme',\n  name: {},\n  displayName: {},\n  description: {},\n  maintained: false,\n}};\n",
        q(&t.slug),
        q(&t.display_name),
        q(&t.description)
    )
}

pub fn eject_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    let slug = inv.arg(0).unwrap_or("").to_string();
    let target = inv.arg(1).map(String::from);
    let overwrite = inv.flag("overwrite");
    let package = inv.opt_str("package").map(String::from);
    let cwd = fsutil::path_str(&inv.cwd);
    let m = match find_theme(inv, &slug, package.as_deref(), false) {
        Ok(Some(m)) => m,
        Ok(None) => return fail(out, unknown_theme(inv, &slug, package.as_deref(), false, false)),
        Err(e) => return fail(out, e),
    };
    let target_path = target.filter(|t| !t.is_empty()).unwrap_or_else(|| format!("src/themes/{}", m.slug));
    let resolved = match fsutil::assert_within(&target_path, &cwd, "theme target path") {
        Ok(r) => r,
        Err(e) => return fail(out, ApiError::from_path(e)),
    };
    let mut writes = Vec::new();
    for name in &m.files {
        match fsutil::assert_within(name, &resolved, &format!("theme destination for {name}")) {
            Ok(dest) => writes.push((name.clone(), fsutil::join(&m.source_dir, name), dest)),
            Err(e) => return fail(out, ApiError::from_path(e)),
        }
    }
    for (name, src, _) in &writes {
        if !Path::new(src).exists() {
            return fail(out, ApiError::new(
                &format!(
                    "Theme \"{}\" is missing bundled file \"{name}\". Re-run `node scripts/generate-cli-themes.mjs` to rebuild the bundle.",
                    m.slug
                ),
                "ERR_NO_SOURCE",
            ));
        }
    }
    if !overwrite {
        if let Some((_, _, dest)) = writes.iter().find(|(_, _, d)| Path::new(d).exists()) {
            let rel = {
                let r = fsutil::relative(&cwd, dest);
                if r.is_empty() { dest.clone() } else { r }
            };
            return fail(out, ApiError::new(
                &format!("Refusing to overwrite existing file {rel}. Re-run with --overwrite (or -f) to replace it."),
                "ERR_FILE_EXISTS",
            ));
        }
    }
    let _ = std::fs::create_dir_all(&resolved);
    for (_, src, dest) in &writes {
        let _ = std::fs::create_dir_all(fsutil::dirname(dest));
        let bytes: Vec<u8> = if fsutil::resolve("/", src) == fsutil::resolve("/", &m.doc_path) {
            local_descriptor(&m).into_bytes()
        } else {
            let b = std::fs::read(src).unwrap_or_default();
            match String::from_utf8(b.clone()) {
                Ok(t) => fsutil::strip_copyright_header(&t).into_bytes(),
                Err(_) => b,
            }
        };
        if let Err(e) = std::fs::write(dest, bytes) {
            return fail(out, ApiError::new(
                &format!("Failed to write theme files: {}", crate::commands::template::node_err(&e, "open", dest)),
                "ERR_WRITE_FAILED",
            ));
        }
    }
    let output_dir = {
        let r = fsutil::relative(&cwd, &resolved);
        if r.is_empty() { ".".to_string() } else { r }
    };
    super::warn_theme_integration_issues(inv, out);
    if inv.json() {
        let mut d = Map::new();
        d.insert("slug".into(), sv(&m.slug));
        d.insert("displayName".into(), sv(&m.display_name));
        d.insert("maintained".into(), Value::Bool(m.maintained));
        d.insert("package".into(), sv(&m.package));
        d.insert("outputDir".into(), sv(&output_dir));
        d.insert("entry".into(), sv(&m.entry));
        d.insert("exportName".into(), sv(&m.export_name));
        d.insert("files".into(), Value::Array(m.files.iter().map(|x| sv(x)).collect()));
        out.json_out("theme.eject", None, Value::Object(d), None);
        return Ok(());
    }
    let run = crate::cli::env::cli_invocation(&inv.cwd);
    out.emit(&[
        section("Ejected theme", None),
        format::records(&[vec![
            ("slug".into(), f(&m.slug)),
            ("displayName".into(), f(&m.display_name)),
            ("maintained".into(), f(if m.maintained { "true" } else { "false" })),
            ("package".into(), f(&m.package)),
            ("outputDir".into(), f(&output_dir)),
            ("entry".into(), f(&m.entry)),
            ("exportName".into(), f(&m.export_name)),
            ("files".into(), Field::from(m.files.clone())),
        ]]),
        text(&format!("This is a local fork. Build it with {run} theme build {}.", fsutil::join(&output_dir, &m.entry))),
    ]);
    Ok(())
}
