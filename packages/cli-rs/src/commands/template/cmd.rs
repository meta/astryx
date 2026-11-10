//! The `template` command: dispatch (api/template/template.mjs) and terminal
//! output (clients/cli/commands/template.mjs).

use super::discovery::{self, Template};
use super::{fsutil, source, ApiError};
use crate::cli::command::{CmdResult, ErrorOpts, Invocation, OptValue, Out, Suggestion};
use crate::cli::format::{self, code, record, section, text, Block, Field};
use crate::json::{Map, Value};

fn s(v: &str) -> Value {
    Value::String(v.to_string())
}

fn reject_empty(out: &mut Out, name: &str, value: Option<&str>) -> CmdResult {
    if value == Some("") {
        return out.cli_error(
            &format!(
                "Argument <{name}> is an empty string. An empty argument is not the same as an omitted one, and ignoring it would silently discard the rest of the command: pass a value, or leave <{name}> out of `astryx template` entirely."
            ),
            ErrorOpts::code("ERR_INVALID_ARGUMENT"),
        );
    }
    Ok(())
}

fn fail(out: &mut Out, e: ApiError) -> CmdResult {
    let opts = if e.code.is_empty() { ErrorOpts::default() } else { ErrorOpts::code(&e.code) };
    out.cli_error(&e.message, opts.suggestions(e.suggestions))
}

pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let name = inv.arg(0).map(|x| x.to_string());
    let target = inv.arg(1).map(|x| x.to_string());
    let list = inv.flag("list");
    let skeleton = inv.flag("skeleton");
    let overwrite = inv.flag("overwrite");
    let type_ = inv.opt_str("type").map(|x| x.to_string());
    let package = inv.opt_str("package").map(|x| x.to_string());
    let cdn: Option<OptValue> = inv.opt("cdn").cloned().filter(|v| !matches!(v, OptValue::Bool(false)));
    let cdn_str = match &cdn {
        Some(OptValue::Str(x)) => Some(x.clone()),
        _ => None,
    };
    // JS truthiness: `--cdn ""` is falsy, as is an absent option.
    let cdn_truthy = match &cdn {
        Some(OptValue::Str(x)) => !x.is_empty(),
        Some(OptValue::Bool(b)) => *b,
        _ => false,
    };
    let uses_name = !cdn_truthy && !list;
    let uses_path = if cdn_truthy { cdn_str.is_none() } else { !list && !skeleton };
    if uses_name {
        reject_empty(out, "name", name.as_deref())?;
    }
    if uses_path {
        reject_empty(out, "path", target.as_deref())?;
    }
    let json = inv.json();
    super::integration::warn_on_integration_issues(inv, out);

    // Validation (api/template/template.mjs).
    let name_given = name.as_deref().map_or(false, |n| !n.is_empty());
    let target_given = target.as_deref().map_or(false, |n| !n.is_empty());
    let type_given = type_.as_deref().map_or(false, |n| !n.is_empty());
    let pkg_given = package.as_deref().map_or(false, |n| !n.is_empty());
    if cdn_truthy {
        let ignored: Vec<&str> = [
            (name_given, "<name>"),
            (list, "--list"),
            (skeleton, "--skeleton"),
            (type_given, "--type"),
            (pkg_given, "--package"),
        ]
        .iter()
        .filter(|(b, _)| *b)
        .map(|(_, n)| *n)
        .collect();
        if !ignored.is_empty() {
            return fail(out, ApiError::new(
                &format!("`--cdn` cannot be combined with {}: the CDN starter does not use templates.", ignored.join(", ")),
                "ERR_INVALID_ARGUMENT",
            ));
        }
    }
    if list {
        let ignored: Vec<&str> =
            [(name_given, "<name>"), (target_given, "<path>"), (skeleton, "--skeleton"), (overwrite, "--overwrite")]
                .iter()
                .filter(|(b, _)| *b)
                .map(|(_, n)| *n)
                .collect();
        if !ignored.is_empty() {
            return fail(out, ApiError::new(
                &format!("`--list` cannot be combined with {}: it lists templates and does not scaffold.", ignored.join(", ")),
                "ERR_INVALID_ARGUMENT",
            ));
        }
    }
    if skeleton {
        let ignored: Vec<&str> = [(target_given, "<path>"), (overwrite, "--overwrite")]
            .iter()
            .filter(|(b, _)| *b)
            .map(|(_, n)| *n)
            .collect();
        if !ignored.is_empty() {
            return fail(out, ApiError::new(
                &format!("`--skeleton` cannot be combined with {}: it prints the skeleton and does not write files.", ignored.join(", ")),
                "ERR_INVALID_ARGUMENT",
            ));
        }
    }

    if cdn_truthy {
        let tp = cdn_str.clone().or(target.clone());
        let tp = tp.filter(|x| !x.is_empty());
        let r = match super::cdn::write(&inv.cli_root, &inv.cwd, tp.as_deref(), overwrite) {
            Ok(r) => r,
            Err(e) => return fail(out, e),
        };
        if json {
            let mut d = Map::new();
            d.insert("path".into(), s(&r.path));
            d.insert("version".into(), s(&r.version));
            d.insert("written".into(), Value::Bool(r.written));
            d.insert("reason".into(), if r.written { Value::Null } else { s("exists") });
            out.json_out("template.cdn", None, Value::Object(d), None);
            return Ok(());
        }
        if !r.written {
            out.emit(&[
                text(&format!("[skip] {} already exists — left as is.", r.path)),
                text("Pass --overwrite to replace it with a fresh copy."),
            ]);
        } else {
            out.emit(&[
                text(&format!("[ok] Wrote {}", r.path)),
                text(&format!("Open it in a browser — no bundler, no install, no build step. Every CDN URL is pinned to {}, and the annotations mark the parts that are load-bearing.", r.version)),
            ]);
        }
        return Ok(());
    }

    let cwd = fsutil::path_str(&inv.cwd);
    let templates = match package.as_deref() {
        Some(p) if p == discovery::CORE_PACKAGE => discovery::discover_all_unresolved(&inv.cli_root, &cwd),
        Some(p) if !p.is_empty() => discovery::discover_all_resolved(&inv.cli_root, &cwd),
        _ => discovery::discover_all(&inv.cli_root, &cwd),
    };

    if list || (!name_given && !skeleton) {
        let listed = match list_templates(&templates, type_.as_deref().filter(|x| !x.is_empty()), package.as_deref().filter(|x| !x.is_empty())) {
            Ok(l) => l,
            Err(e) => return fail(out, e),
        };
        if json {
            let data: Vec<Value> = listed.iter().map(|t| list_entry(t)).collect();
            out.json_out("template.list", None, Value::Array(data), None);
            return Ok(());
        }
        print_list(inv, out, &listed, list || name_given);
        return Ok(());
    }

    // Resolve the name.
    let n = name.clone().unwrap_or_default();
    let mut pool: Vec<&Template> = templates.iter().collect();
    if let Some(t) = type_.as_deref().filter(|x| !x.is_empty()) {
        pool.retain(|x| x.kind == t);
    }
    if let Some(p) = package.as_deref().filter(|x| !x.is_empty()) {
        pool.retain(|x| x.pkg() == p);
    }
    let replacements: Vec<&Template> =
        if pkg_given || name.is_none() { vec![] } else { pool.iter().copied().filter(|t| t.replaces.as_deref() == Some(n.as_str())).collect() };
    let mut candidates: Vec<&Template> = if pkg_given {
        pool.iter().copied().filter(|t| t.dir_name == n).collect()
    } else if !replacements.is_empty() {
        replacements
    } else {
        pool.iter().copied().filter(|t| t.lookup_ids().contains(&n.as_str())).collect()
    };
    if !pkg_given && !type_given && candidates.len() > 1 {
        let core: Vec<&Template> = candidates.iter().copied().filter(|t| t.pkg() == discovery::CORE_PACKAGE).collect();
        let rejected: Vec<&Template> = candidates.iter().copied().filter(|t| t.pkg() != discovery::CORE_PACKAGE).collect();
        if core.len() == 1
            && rejected.len() == candidates.len() - 1
            && rejected.iter().all(|t| t.replacement_rejected && t.replacement_target.as_deref() == Some(n.as_str()))
        {
            candidates = core;
        }
    }
    if name_given && candidates.is_empty() {
        let ordered = crate::text::suggest_order::order_by_affinity(
            &n,
            &templates,
            &|t: &Template| vec![t.dir_name.clone(), t.name.clone()],
            true,
            true,
        );
        let sugg = ordered.iter().map(|t| Suggestion::new(t.dir_name.clone(), format!("{} template", t.kind))).collect();
        return fail(out, ApiError::with(&format!("Unknown template \"{n}\""), sugg, "ERR_UNKNOWN_TEMPLATE"));
    }
    if name_given && candidates.len() > 1 {
        let sugg = candidates
            .iter()
            .map(|t| Suggestion::new(t.dir_name.clone(), format!("{} template in {}", t.kind, t.pkg())))
            .collect();
        return fail(out, ApiError::with(
            &format!("Template \"{n}\" is ambiguous — narrow it with --type and/or --package."),
            sugg,
            "ERR_AMBIGUOUS_TEMPLATE",
        ));
    }
    let matched = candidates.first().copied();

    if skeleton {
        let Some(m) = matched else {
            let sugg = templates.iter().map(|t| Suggestion::new(t.dir_name.clone(), format!("{} template", t.kind))).collect();
            return fail(out, ApiError::with("Specify a template name for --skeleton", sugg, "ERR_UNKNOWN_TEMPLATE"));
        };
        let src = match read_source(m) {
            Ok(x) => x,
            Err(e) => return fail(out, e),
        };
        let (rewritten, _, _) = match source::replace_template_demos(&src) {
            Ok(x) => x,
            Err(e) => return fail(out, e),
        };
        let comps = source::components_in_source(&rewritten);
        let skel = super::skeleton::extract_skeleton(&rewritten);
        if json {
            let mut d = Map::new();
            d.insert("template".into(), s(&m.dir_name));
            d.insert("description".into(), s(&m.description));
            d.insert("components".into(), Value::Array(comps.iter().map(|c| s(c)).collect()));
            d.insert("skeleton".into(), s(&skel));
            out.json_out("template.skeleton", Some(s(m.pkg())), Value::Object(d), None);
            return Ok(());
        }
        let desc = if m.description.is_empty() { String::new() } else { format!(" — {}", m.description) };
        out.emit(&[
            record(&[("package".to_string(), Field::from(m.pkg()))]),
            text(&format!("# {}{desc}\n# Components: {}", m.dir_name, comps.join(", "))),
            code(&skel),
        ]);
        return Ok(());
    }

    let m = matched.expect("a resolved template");
    if !target_given {
        return show(out, json, m);
    }
    copy(inv, out, json, m, target.as_deref().unwrap_or(""), overwrite)
}

fn read_source(m: &Template) -> Result<String, ApiError> {
    std::fs::read_to_string(&m.file_path).map_err(|_| {
        ApiError::new(&format!("No source file found for template \"{}\"", m.dir_name), "ERR_NO_SOURCE")
    })
}

fn plural(n: usize) -> &'static str {
    if n == 1 { "" } else { "s" }
}

fn demo_content_note(count: usize, file: Option<&str>) -> String {
    format!(
        "Replaced {count} Astryx demo content element{}{} with a <Text>Card content</Text> placeholder. Put your own content there.",
        plural(count),
        file.map(|f| format!(" in {f}")).unwrap_or_default()
    )
}

fn show(out: &mut Out, json: bool, m: &Template) -> CmdResult {
    let src = match read_source(m) {
        Ok(x) => x,
        Err(e) => return fail(out, e),
    };
    let (with_media, content, media) = match source::replace_template_demos(&src) {
        Ok(x) => x,
        Err(e) => return fail(out, e),
    };
    let sets = super::icons::load(&fsutil::path_str(&out.cwd));
    let (source_text, icons) = super::icons::map_template_icons(&with_media, &sets, m.icons.as_ref());
    let comps = source::components_in_source(&source_text);
    if json {
        let mut d = Map::new();
        d.insert("template".into(), s(&m.dir_name));
        d.insert("description".into(), s(&m.description));
        d.insert("type".into(), s(&m.kind));
        d.insert("components".into(), Value::Array(comps.iter().map(|c| s(c)).collect()));
        d.insert("source".into(), s(&source_text));
        d.insert("demoMediaReplaced".into(), Value::from(media));
        d.insert("demoContentReplaced".into(), Value::from(content));
        if let Some(i) = &icons {
            d.insert("icons".into(), i.clone());
        }
        out.json_out("template.show", Some(s(m.pkg())), Value::Object(d), None);
        return Ok(());
    }
    out.eprintln(&format!("package: {}", m.pkg()));
    out.emit(&[code(&source_text)]);
    if media > 0 {
        out.eprintln(&format!(
            "Replaced {media} Astryx demo media reference{}: images now show a neutral placeholder and videos have an empty source. Supply your own media there.",
            plural(media)
        ));
    }
    if content > 0 {
        out.eprintln(&demo_content_note(content, None));
    }
    for line in super::icons::icon_lines(icons.as_ref()) {
        out.eprintln(&line);
    }
    Ok(())
}

fn copy(inv: &Invocation, out: &mut Out, json: bool, m: &Template, target: &str, overwrite: bool) -> CmdResult {
    let cwd = fsutil::path_str(&inv.cwd);
    if !std::path::Path::new(&m.file_path).exists() {
        return fail(out, ApiError::new(&format!("No source file found for template \"{}\"", m.dir_name), "ERR_NO_SOURCE"));
    }
    let file_target = if fsutil::is_file_path_arg(target) {
        target.to_string()
    } else {
        fsutil::join(target, &if m.kind == "block" { fsutil::basename(&m.file_path) } else { "page.tsx".into() })
    };
    let output_file = match fsutil::assert_within(&file_target, &cwd, "template target path") {
        Ok(p) => p,
        Err(e) => return fail(out, ApiError::from_path(e)),
    };
    let output_dir = fsutil::dirname(&output_file);
    let file_name = fsutil::basename(&output_file);
    if !overwrite && std::path::Path::new(&output_file).exists() {
        let rel = {
            let r = fsutil::relative(&cwd, &output_file);
            if r.is_empty() { output_file.clone() } else { r }
        };
        return fail(out, ApiError::new(
            &format!("Refusing to overwrite existing file {rel}. Re-run with --overwrite (or -f) to replace it."),
            "ERR_FILE_EXISTS",
        ));
    }
    let src = match read_source(m) {
        Ok(x) => x,
        Err(e) => return fail(out, e),
    };
    let (with_media, content, media) = match source::replace_template_demos(&src) {
        Ok(x) => x,
        Err(e) => return fail(out, e),
    };
    let sets = super::icons::load(&cwd);
    let (output_source, icons) = super::icons::map_template_icons(&with_media, &sets, m.icons.as_ref());
    if let Err((code, _)) = super::mkdir_p(&output_dir) {
        return fail(out, super::needs::write_failed_code(&output_file, &cwd, &code));
    }
    if let Err(e) = std::fs::write(&output_file, &output_source) {
        return fail(out, super::needs::write_failed(&output_file, &cwd, &e));
    }
    let needs = super::needs::analyze(inv, &output_source, &cwd);
    let rel_out = {
        let r = fsutil::relative(&cwd, &output_dir);
        if r.is_empty() { ".".to_string() } else { r }
    };
    if json {
        let mut d = Map::new();
        d.insert("template".into(), s(&m.dir_name));
        d.insert("outputDir".into(), s(&rel_out));
        d.insert("fileName".into(), s(&file_name));
        d.insert("filesCopied".into(), Value::from(1));
        d.insert("demoMediaReplaced".into(), Value::from(media));
        d.insert("demoContentReplaced".into(), Value::from(content));
        d.insert("notes".into(), Value::Array(needs.notes.iter().map(|n| s(n)).collect()));
        d.insert("missingPackages".into(), Value::Array(needs.missing.iter().map(|n| s(n)).collect()));
        d.insert("installCommand".into(), needs.install_command.as_deref().map(s).unwrap_or(Value::Null));
        if let Some(i) = &icons {
            d.insert("icons".into(), i.clone());
        }
        out.json_out("template.copy", Some(s(m.pkg())), Value::Object(d), None);
        return Ok(());
    }
    let file = format!("{rel_out}/{file_name}");
    let mut blocks: Vec<Block> = vec![text(&format!("Copied template to {file}")), record(&[("package".to_string(), Field::from(m.pkg()))])];
    if media > 0 {
        blocks.push(text(&format!(
            "Replaced {media} Astryx demo media reference{} in {file}: images now show a neutral placeholder and videos have an empty source. Supply your own media there.",
            plural(media)
        )));
    }
    if content > 0 {
        blocks.push(text(&demo_content_note(content, Some(&file))));
    }
    for n in &needs.notes {
        blocks.push(text(n));
    }
    let icon_text = super::icons::icon_lines(icons.as_ref());
    if !icon_text.is_empty() {
        blocks.push(text(&icon_text.join("\n")));
    }
    out.emit(&blocks);
    Ok(())
}

/// `templateList`.
fn list_templates<'a>(templates: &'a [Template], type_: Option<&str>, package: Option<&str>) -> Result<Vec<&'a Template>, ApiError> {
    let mut filtered: Vec<&Template> = templates.iter().collect();
    if let Some(t) = type_ {
        if t != "page" && t != "block" {
            return Err(ApiError::with(
                &format!("Unknown template type \"{t}\". Valid types: page, block."),
                vec![Suggestion::new("page", "valid type"), Suggestion::new("block", "valid type")],
                "ERR_INVALID_ARGUMENT",
            ));
        }
        filtered.retain(|x| x.kind == t);
    }
    if let Some(p) = package {
        let mut all: Vec<String> = Vec::new();
        for t in templates {
            if !all.iter().any(|x| x == t.pkg()) {
                all.push(t.pkg().to_string());
            }
        }
        if !all.iter().any(|x| x == p) {
            all.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            return Err(ApiError::with(
                &format!("No templates found in package \"{p}\"."),
                all.iter().map(|x| Suggestion::new(x.clone(), "has templates")).collect(),
                "ERR_INVALID_ARGUMENT",
            ));
        }
        filtered.retain(|x| x.pkg() == p);
    }
    Ok(filtered)
}

fn list_entry(t: &Template) -> Value {
    let mut m = Map::new();
    m.insert("id".into(), s(&t.dir_name));
    m.insert("name".into(), s(&t.name));
    if let Some(d) = &t.display_name {
        m.insert("displayName".into(), s(d));
    }
    m.insert("description".into(), s(&t.description));
    m.insert("type".into(), s(&t.kind));
    m.insert("package".into(), s(t.pkg()));
    if let Some(r) = &t.replaces {
        m.insert("replaces".into(), s(r));
    }
    if !t.category.is_empty() {
        m.insert("category".into(), s(&t.category));
    }
    if let Some(c) = &t.components_used {
        m.insert("componentsUsed".into(), c.clone());
    }
    if let Some(a) = &t.aspect_ratio {
        m.insert("aspectRatio".into(), a.clone());
    }
    if let Some(e) = &t.example_for {
        m.insert("exampleFor".into(), s(e));
    }
    if let Some(e) = &t.also_example_for {
        m.insert("alsoExampleFor".into(), e.clone());
    }
    if let Some(e) = &t.also_showcase_for {
        m.insert("alsoShowcaseFor".into(), e.clone());
    }
    if let Some(b) = t.is_showcase {
        m.insert("isShowcase".into(), Value::Bool(b));
    }
    m.insert("isReady".into(), Value::Bool(t.is_ready));
    m.insert("scaffold".into(), Value::Bool(t.scaffold.unwrap_or(false)));
    Value::Object(m)
}

fn print_list(inv: &Invocation, out: &mut Out, listed: &[&Template], full: bool) {
    let run = crate::cli::env::cli_invocation(&inv.cwd);
    let pages: Vec<&Template> = listed.iter().copied().filter(|t| t.kind == "page").collect();
    let blocks: Vec<&Template> = listed.iter().copied().filter(|t| t.kind == "block").collect();
    if !full {
        let grouped = |items: &[&Template]| -> String {
            let mut groups: indexmap::IndexMap<String, Vec<String>> = indexmap::IndexMap::new();
            for t in items {
                let cat = if t.category.is_empty() { "Other".to_string() } else { t.category.clone() };
                groups.entry(cat).or_default().push(t.dir_name.clone());
            }
            groups.iter().map(|(c, ids)| format!("{c}: {}", ids.join(", "))).collect::<Vec<_>>().join("\n")
        };
        let mut b: Vec<Block> = Vec::new();
        if !pages.is_empty() {
            b.push(section(&format!("Page Templates ({})", pages.len()), None));
            b.push(text(&grouped(&pages)));
        }
        if !blocks.is_empty() {
            b.push(section(&format!("Block Templates ({})", blocks.len()), None));
            b.push(text(&grouped(&blocks)));
        }
        b.push(section("Usage", None));
        b.push(text(
            &[
                format!("{run} template <id>                  Show full source"),
                format!("{run} template <id> [target-path]     Scaffold page or block"),
                format!("{run} template <id> --skeleton        Layout reference"),
                format!("{run} template --list                 Full catalog with descriptions"),
                format!("{run} template --list --type block    List only blocks"),
                format!("{run} template --list --package <pkg> List from one package"),
                format!("{run} template --cdn                 CDN starter page, no build step"),
            ]
            .join("\n"),
        ));
        out.emit(&b);
        return;
    }
    let row = |t: &&Template| -> format::Fields {
        vec![
            ("id".into(), Field::from(t.dir_name.as_str())),
            ("name".into(), Field::from(if t.is_ready { t.name.clone() } else { format!("{} (WIP)", t.name) })),
            ("description".into(), Field::from(t.description.as_str())),
            (
                "package".into(),
                Field::from(match &t.package {
                    Some(p) if p != discovery::CORE_PACKAGE => p.clone(),
                    _ => String::new(),
                }),
            ),
            ("replaces".into(), Field::from(t.replaces.clone().unwrap_or_default())),
        ]
    };
    let mut b: Vec<Block> = Vec::new();
    if !pages.is_empty() {
        b.push(section("Page Templates", None));
        b.push(format::records(&pages.iter().map(row).collect::<Vec<_>>()));
    }
    if !blocks.is_empty() {
        b.push(section("Block Templates", None));
        b.push(format::records(&blocks.iter().map(row).collect::<Vec<_>>()));
    }
    b.push(section("Usage", None));
    b.push(text(
        &[
            format!("{run} template <id> [target-path]     Scaffold page or block"),
            format!("{run} template <id> --skeleton        Layout reference"),
            format!("{run} template --list --type block    List only blocks"),
            format!("{run} template --list --package <pkg> List from one package"),
            format!("{run} template --cdn                 CDN starter page, no build step"),
        ]
        .join("\n"),
    ));
    out.emit(&b);
}
