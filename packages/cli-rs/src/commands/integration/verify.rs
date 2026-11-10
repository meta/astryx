//! `integrationPackCheck` (`api/integration/pack-check.mjs`): check the
//! package the way npm will publish it.

use super::add_helpers::{normalize, relative};
use super::jsjson;
use crate::json::{Map, Value};
use std::path::Path;

fn issue(code: &str, severity: &str, message: String) -> Value {
    let mut m = Map::new();
    m.insert("code".into(), Value::String(code.into()));
    m.insert("severity".into(), Value::String(severity.into()));
    m.insert("message".into(), Value::String(message));
    Value::Object(m)
}

fn empty_receipt(name: Value, issues: Vec<Value>) -> Value {
    let packable = !issues.iter().any(|i| i["severity"] == "error");
    let mut inv = Map::new();
    inv.insert("manifest".into(), Value::Null);
    inv.insert("roots".into(), Value::Array(vec![]));
    inv.insert("expectedFiles".into(), Value::from(0));
    inv.insert("packedFiles".into(), Value::from(0));
    let mut contrib = Map::new();
    contrib.insert("local".into(), Value::Null);
    contrib.insert("packed".into(), Value::Null);
    let mut d = Map::new();
    d.insert("name".into(), name);
    d.insert("version".into(), Value::Null);
    d.insert("packable".into(), Value::Bool(packable));
    d.insert("tarball".into(), Value::Null);
    d.insert("inventory".into(), Value::Object(inv));
    d.insert("contributions".into(), Value::Object(contrib));
    d.insert("issues".into(), Value::Array(issues));
    let mut m = Map::new();
    m.insert("type".into(), Value::String("integration.pack-check".into()));
    m.insert("data".into(), Value::Object(d));
    Value::Object(m)
}

/// `findPackage(cwd)`: Ok(None) when there is no package.json.
fn find_package(cwd: &Path) -> Result<Option<(std::path::PathBuf, Value)>, String> {
    let mut dir = normalize(cwd);
    for _ in 0..50 {
        let file = dir.join("package.json");
        if file.exists() {
            let text = std::fs::read_to_string(&file).map_err(|e| e.to_string())?;
            return match jsjson::parse(&text) {
                Ok(v) => Ok(Some((dir, v))),
                Err(m) => Err(format!("Could not parse {}: {m}", file.to_string_lossy())),
            };
        }
        match dir.parent() {
            Some(p) if p != dir => dir = p.to_path_buf(),
            _ => break,
        }
    }
    Ok(None)
}

pub fn integration_pack_check(cwd: &Path) -> Value {
    let (dir, pkg) = match find_package(cwd) {
        Err(m) => return empty_receipt(Value::Null, vec![issue("invalid_package_json", "error", m)]),
        Ok(None) => {
            return empty_receipt(
                Value::Null,
                vec![issue("no_package", "error", "No package.json found. Run this command inside an integration package.".into())],
            )
        }
        Ok(Some(x)) => x,
    };
    let name = match pkg.get("name") {
        Some(Value::String(s)) => s.clone(),
        _ => "(unnamed package)".into(),
    };
    let local = crate::commands::doctor::integration::validate::validate_local(&cwd.to_string_lossy());
    let mut issues: Vec<Value> = local.issues.clone();
    if local.found {
        for i in &local.listed {
            let mut i = i.clone();
            if i["code"] == "invalid_package_json" {
                i["severity"] = Value::String("error".into());
            }
            issues.push(i);
        }
    }
    if !local.found || local.integration.is_none() {
        if !local.found {
            issues.push(issue("missing_manifest", "error", "No astryx.integration.{ts,mjs,js} found next to package.json.".into()));
        }
        return empty_receipt(Value::String(name), issues);
    }
    let loaded = local.integration.clone().and_then(|v| v.as_object().cloned()).unwrap_or_default();
    full_check(&dir, &pkg, name, issues, &loaded)
}

// ── The packed-package check ─────────────────────────────────────────

fn copy_packed(src: &Path, dest: &Path, files: &[String]) -> std::io::Result<()> {
    for f in files {
        let to = dest.join(f);
        if let Some(d) = to.parent() {
            std::fs::create_dir_all(d)?;
        }
        std::fs::copy(src.join(f), &to)?;
    }
    Ok(())
}

fn random_suffix() -> String {
    let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_nanos()).unwrap_or(0) ^ std::process::id();
    let chars: Vec<char> = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".chars().collect();
    let mut x = n as u64 | 1;
    (0..6)
        .map(|_| {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            chars[(x % chars.len() as u64) as usize]
        })
        .collect()
}

fn package_relative(issues: &mut [Value], packed: &Path, consumer: &Path) {
    let spellings = |d: &Path| {
        let mut v = vec![d.to_string_lossy().to_string()];
        if let Ok(r) = std::fs::canonicalize(d) {
            let r = r.to_string_lossy().to_string();
            if r != v[0] {
                v.push(r);
            }
        }
        v
    };
    let packed_s = spellings(packed);
    let consumer_s = spellings(consumer);
    for i in issues.iter_mut() {
        let Some(Value::String(msg)) = i.get("message").cloned() else { continue };
        let mut m = msg;
        for pre in &packed_s {
            m = m.split(&format!("{pre}/")).collect::<Vec<_>>().join("");
            // `prefix` not followed by a word char, `-`, or `.x`.
            let mut out = String::new();
            let mut rest = m.as_str();
            while let Some(pos) = rest.find(pre.as_str()) {
                let after = &rest[pos + pre.len()..];
                let mut ch = after.chars();
                let c1 = ch.next();
                let c2 = ch.next();
                let blocked = match c1 {
                    Some(c) if c.is_alphanumeric() || c == '_' || c == '-' => true,
                    Some('.') => matches!(c2, Some(c) if c.is_alphanumeric() || c == '_'),
                    _ => false,
                };
                out.push_str(&rest[..pos]);
                if blocked {
                    out.push_str(pre);
                } else {
                    out.push_str("the package root");
                }
                rest = after;
            }
            out.push_str(rest);
            m = out;
        }
        for pre in &consumer_s {
            let mut out = String::new();
            let mut rest = m.as_str();
            while let Some(pos) = rest.find(pre.as_str()) {
                out.push_str(&rest[..pos]);
                out.push_str("a consumer project");
                let after = &rest[pos + pre.len()..];
                let end = after.find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == '`').unwrap_or(after.len());
                rest = &after[end..];
            }
            out.push_str(rest);
            m = out;
        }
        i["message"] = Value::String(m);
    }
}

fn full_check(dir: &Path, pkg: &Value, name: String, mut issues: Vec<Value>, loaded: &crate::discovery::integrations::Record) -> Value {
    use crate::discovery::contribution_inventory as ci;
    let version = match pkg.get("version") {
        Some(Value::String(v)) => Value::String(v.clone()),
        _ => Value::Null,
    };
    let (manifest_rel, roots, all_files) = ci::compute_required_files(loaded);
    let (local, local_errors) = ci::collect_identities(loaded);
    for e in &local_errors {
        issues.push(issue("local_discovery_failed", "error", format!("{}: {}", e.kind, e.message)));
    }
    for (kind, path, files) in &roots {
        let abs = loaded.get(kind.as_str()).and_then(|v| v.as_str()).map(std::path::PathBuf::from).unwrap_or_else(|| dir.join(path));
        if !abs.is_dir() || std::fs::read_dir(&abs).is_err() {
            continue;
        }
        if files.is_empty() {
            issues.push(issue("empty_contribution_root", "error", format!("Declared {kind} root \"{path}\" contains no discoverable contribution files.")));
        }
    }
    if loaded.get("docs").map(|v| v.is_string()).unwrap_or(false) {
        let docs = crate::discovery::docs_discovery::discover_integration_docs(loaded);
        let problem = if !docs.namespaces.is_empty() || !docs.guides.is_empty() { super::cli_requirement::docs_tree_cli_problem(pkg) } else { None };
        let mut files: Vec<String> = docs.records.iter().map(|r| r.path.clone()).collect();
        for g in &docs.guides {
            if let Some(f) = g.get("ref").and_then(|r| r.get("topicFile")).and_then(|f| f.as_str()) {
                files.push(f.to_string());
            }
        }
        let sets_field = |fields: &[&str]| {
            files.iter().any(|f| {
                let Ok(doc) = crate::discovery::docs_discovery::load_topic_module(f) else { return false };
                doc.get("sections").and_then(|s| s.as_array()).map(|a| a.iter().any(|sec| fields.iter().any(|k| !matches!(sec.get(*k), None | Some(Value::Null))))).unwrap_or(false)
            })
        };
        if let Some(p) = problem.clone() {
            issues.push(issue("docs_tree_needs_cli", "error", p));
        } else if sets_field(&["id"]) {
            if let Some(p) = crate::discovery::cli_requirement::section_ids_cli_problem(pkg) {
                issues.push(issue("section_ids_need_cli", "error", p));
            }
        }
        if sets_field(&["before", "after"]) {
            if let Some(p) = crate::discovery::cli_requirement::section_position_cli_problem(pkg) {
                issues.push(issue("section_position_needs_cli", "warning", p));
            }
        }
        let writes_tokens = files.iter().any(|f| std::fs::read_to_string(f).map(|t| !crate::discovery::doc_tokens::command_tokens_in(&t).is_empty()).unwrap_or(false));
        if problem.is_none() && writes_tokens {
            if let Some(p) = crate::discovery::cli_requirement::doc_tokens_cli_problem(pkg) {
                issues.push(issue("doc_tokens_need_cli", "warning", p));
            }
        }
    }
    if !local.themes.is_empty() {
        if let Some(p) = super::cli_requirement::themes_cli_problem(pkg) {
            issues.push(issue("themes_need_cli", "error", p));
        }
    }
    let pack = match super::pack::npm_pack(dir, pkg) {
        Ok(p) => p,
        Err(e) => {
            issues.push(issue("pack_failed", "error", e));
            return build_receipt(name, version, &manifest_rel, &roots, &all_files, None, Some(&local.to_json()), None, issues);
        }
    };
    let issues_before = issues.len();
    let scratch = dir.join(format!(".astryx-pack-check-{}", random_suffix()));
    let _ = std::fs::create_dir_all(&scratch);
    let _ = std::fs::write(scratch.join("package.json"), "{\"name\":\"astryx-verify-consumer\",\"private\":true}\n");
    if !pack.files.contains(&manifest_rel) {
        issues.push(issue(
            "manifest_not_packed",
            "error",
            format!("Integration manifest \"{manifest_rel}\" is not in the npm pack list. Add it to \"files\" in package.json."),
        ));
    }
    for (kind, path, files) in &roots {
        let missing: Vec<&String> = files.iter().filter(|f| !pack.files.contains(f)).collect();
        if missing.len() == files.len() && !files.is_empty() {
            issues.push(issue(
                "root_not_packed",
                "error",
                format!(
                    "Declared {kind} root \"{path}\" has 0 of {} expected files in the pack list. Add \"{}\" to \"files\" in package.json.",
                    files.len(),
                    path.strip_prefix("./").unwrap_or(path)
                ),
            ));
        } else {
            for f in missing {
                issues.push(issue("file_not_packed", "error", format!("{kind} file \"{f}\" is not in the pack list.")));
            }
        }
    }
    let extract = scratch.join("node_modules").join(&name);
    let mut packed_ids = None;
    if let Err(e) = copy_packed(dir, &extract, &pack.files) {
        issues.push(issue("extract_failed", "error", e.to_string()));
    } else {
        let packed_result = crate::commands::doctor::integration::validate::validate_installed_with(&name, &scratch.to_string_lossy(), Some(true));
        for i in &packed_result.issues {
            let mut m = Map::new();
            m.insert("code".into(), Value::String(format!("packed_{}", i["code"].as_str().unwrap_or(""))));
            m.insert("severity".into(), i["severity"].clone());
            m.insert("message".into(), Value::String(format!("Packed: {}", crate::cli::format::js_string(&i["message"]))));
            for k in ["fix", "file", "line"] {
                if !matches!(i.get(k), None | Some(Value::Null)) {
                    m.insert(k.into(), i[k].clone());
                }
            }
            issues.push(Value::Object(m));
        }
        if let Some(Value::Object(packed_loaded)) = &packed_result.integration {
            let (packed, errs) = ci::collect_identities(packed_loaded);
            for e in &errs {
                issues.push(issue("packed_discovery_failed", "error", format!("{}: {}", e.kind, e.message)));
            }
            for (code, msg_sev, msg) in ci::compare_identities(&local, &packed) {
                let (sev, message) = if msg_sev == "error" || msg_sev == "warning" { (msg_sev, msg) } else { ("error".to_string(), msg_sev) };
                let _ = &message;
                issues.push(issue(&code, &sev, message));
            }
            let pm = Value::Object(packed_loaded.clone());
            issues.extend(packed_theme_exports(loaded, packed_loaded, &scratch));
            issues.extend(packed_component_exports(&extract, &pm, &name, &scratch));
            issues.extend(packed_template_exports(packed_loaded, &name, &scratch));
            packed_ids = Some(packed.to_json());
        }
    }
    package_relative(&mut issues[issues_before..], &extract, &scratch);
    let _ = std::fs::remove_dir_all(&scratch);
    build_receipt(name, version, &manifest_rel, &roots, &all_files, Some(&pack), Some(&local.to_json()), packed_ids.as_ref(), issues)
}

/// `import.meta.resolve(specifier)` from the scratch consumer, as Node 22
/// answers it: a file target is not checked for existence (only a legacy
/// `main`, or a package that is missing, fails).
fn consumer_resolve(spec: &str, scratch: &Path) -> Result<std::path::PathBuf, String> {
    let from = scratch.join(".astryx-resolve-imports.mjs");
    match crate::js::resolve::resolve(spec, &from, crate::js::resolve::Mode::Esm) {
        Ok(crate::js::resolve::Resolved::File(p)) => Ok(p),
        Ok(_) => Err(format!("Cannot resolve {spec}")),
        Err(e) => {
            for prefix in ["Cannot find module '", "Directory import '"] {
                if let Some(rest) = e.message.strip_prefix(prefix) {
                    if let Some(end) = rest.find('\'') {
                        return Ok(std::path::PathBuf::from(&rest[..end]));
                    }
                }
            }
            Err(e.message)
        }
    }
}

fn ts_extension_issues(entries: &[(String, String)]) -> Vec<Value> {
    entries
        .iter()
        .filter(|(_, s)| s.ends_with(".ts") || s.ends_with(".tsx"))
        .map(|(label, s)| {
            issue(
                "typescript_extension_in_specifier",
                "error",
                format!("{label} advertises import \"{s}\", which ends in a TypeScript extension. A consumer with default moduleResolution will reject it (TS5097). Use an extensionless specifier mapped through the package exports."),
            )
        })
        .collect()
}

fn fmt_cmd(cmd: &str, dir: &str) -> String {
    crate::cli::env::format_cli_command_at(Path::new(dir), cmd)
}

/// `validatePackedThemeExports`.
fn packed_theme_exports(local_int: &crate::discovery::integrations::Record, packed_int: &crate::discovery::integrations::Record, scratch: &Path) -> Vec<Value> {
    use super::theme_fresh as tf;
    use crate::commands::theme::{discovery as td, imports};
    use std::path::PathBuf;
    let mut issues = Vec::new();
    let local_themes = match td::discover_integration_themes(local_int) {
        Ok(t) => t,
        Err(e) => return vec![issue("theme_discovery_failed", "error", format!("Local themes could not be validated: {e}"))],
    };
    let packed_themes = match td::discover_integration_themes(packed_int) {
        Ok(t) => t,
        Err(e) => return vec![issue("packed_theme_discovery_failed", "error", format!("Packed themes could not be validated: {e}"))],
    };
    let pkg_dir = local_int.get("__packageDir").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let read_pkg = |r: &crate::discovery::integrations::Record| -> Value {
        let d = r.get("__packageDir").and_then(|v| v.as_str()).unwrap_or("");
        std::fs::read_to_string(Path::new(d).join("package.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_else(|| serde_json::json!({"name": r.get("name").cloned().unwrap_or(Value::Null)}))
    };
    let local_pkg = read_pkg(local_int);
    let packed_pkg = read_pkg(packed_int);
    let packed_dir = packed_int.get("__packageDir").and_then(|v| v.as_str()).unwrap_or("").to_string();
    for lt in &local_themes {
        let Some(pt) = packed_themes.iter().find(|t| t.slug == lt.slug) else { continue };
        let source = Path::new(&lt.source_dir).join(&lt.entry);
        let packed_source = Path::new(&pt.source_dir).join(&pt.entry);
        let src_rel = relative(Path::new(&pkg_dir), &source);
        if std::fs::read(&source).ok() != std::fs::read(&packed_source).ok() {
            issues.push(issue("packed_theme_source_changed", "error", format!("Theme \"{}\" source changed during packing. Keep {src_rel} unchanged in the tarball.", lt.slug)));
        }
        // declaredThemeBuildOutputs
        let declared: Vec<(&str, String, imports::ExportInfo)> = if local_pkg.get("exports").is_none() {
            Vec::new()
        } else {
            let mut groups = vec![vec![
                ("module", format!("./themes/{}", lt.slug)),
                ("stylesheet", format!("./themes/{}.css", lt.slug)),
                ("font stylesheet", format!("./themes/{}.fonts.css", lt.slug)),
            ]];
            if local_themes.len() == 1 {
                groups.push(vec![("module", "./built".into()), ("stylesheet", "./theme.css".into()), ("font stylesheet", "./fonts.css".into())]);
            }
            let declared_groups: Vec<Vec<(&str, String, imports::ExportInfo)>> = groups
                .into_iter()
                .map(|g| g.into_iter().map(|(k, sp)| { let i = imports::inspect_export(&local_pkg, &pkg_dir, &sp); (k, sp, i) }).filter(|(_, _, i)| i.exported).collect())
                .collect();
            let complete = declared_groups.iter().position(|g| g.iter().any(|o| o.0 == "module") && g.iter().any(|o| o.0 == "stylesheet"));
            let pick = complete.or_else(|| declared_groups.iter().position(|g| !g.is_empty()));
            match pick {
                Some(i) => declared_groups.into_iter().nth(i).unwrap(),
                None => Vec::new(),
            }
        };
        if declared.is_empty() {
            issues.push(issue(
                "theme_exports_missing",
                "warning",
                format!(
                    "Theme \"{s}\" has no declared built exports. The package remains source-compatible. To make it importable, run `{}` and export \"./themes/{s}\" plus \"./themes/{s}.css\" from package.json; `{}` creates those exports for a new theme.",
                    fmt_cmd(&format!("theme build {src_rel}"), &pkg_dir),
                    fmt_cmd(&format!("integration add theme {}", lt.slug), &pkg_dir),
                    s = lt.slug
                ),
            ));
            continue;
        }
        if !declared.iter().any(|o| o.0 == "module") || !declared.iter().any(|o| o.0 == "stylesheet") {
            issues.push(issue(
                "theme_exports_incomplete",
                "warning",
                format!(
                    "Theme \"{}\" exports {} without a complete built module and stylesheet pair. Missing partner exports alone do not block packing; add the matching export when the theme should be importable. Every declared export must resolve. Staleness is a warning until the complete importable pair is declared.",
                    lt.slug,
                    declared.iter().map(|o| o.2.specifier.clone()).collect::<Vec<_>>().join(", ")
                ),
            ));
            let mut unresolved = false;
            let mut outputs = Vec::new();
            for (kind, sp, info) in &declared {
                let packed = imports::inspect_export(&packed_pkg, &packed_dir, sp);
                if info.target.is_none() || !packed.exported || packed.target.is_none() {
                    unresolved = true;
                    issues.push(issue(
                        "theme_import_unresolvable",
                        "error",
                        format!("Theme \"{}\" declares {}, but that {kind} does not resolve from both the source package and packed tarball.", lt.slug, info.specifier),
                    ));
                } else {
                    outputs.push((*kind, PathBuf::from(info.target.clone().unwrap()), PathBuf::from(packed.target.clone().unwrap())));
                }
            }
            if unresolved {
                continue;
            }
            let expected_dir = scratch.join(format!(".astryx-theme-{}", lt.slug));
            let built = if outputs.iter().any(|o| o.0 != "font stylesheet") {
                tf::scratch_build(&source, Path::new(&pkg_dir), &expected_dir, &lt.slug)
            } else {
                Ok(Some((expected_dir.join(format!("{}.js", lt.slug)), expected_dir.join(format!("{}.css", lt.slug)))))
            };
            match built {
                Err(e) => issues.push(issue(
                    "theme_build_failed",
                    "error",
                    format!("Theme \"{}\" could not be rebuilt from {src_rel}: {e} Run `{}` before packing.", lt.slug, fmt_cmd(&format!("theme build {src_rel}"), &pkg_dir)),
                )),
                Ok(None) => issues.push(issue(
                    "theme_build_failed",
                    "error",
                    format!("Theme \"{}\" could not be rebuilt from {src_rel}: the theme build produced no complete receipt Run `{}` before packing.", lt.slug, fmt_cmd(&format!("theme build {src_rel}"), &pkg_dir)),
                )),
                Ok(Some((exp_module, exp_css))) => {
                    for (kind, local_file, packed_file) in &outputs {
                        if *kind == "font stylesheet" {
                            if std::fs::read(local_file).ok() != std::fs::read(packed_file).ok() {
                                issues.push(issue("packed_theme_font_stylesheet_changed", "error", format!("Theme \"{}\" font stylesheet changed during packing. Keep its export and bytes unchanged in the tarball.", lt.slug)));
                            }
                            continue;
                        }
                        let expected = tf::read_normalized(if *kind == "module" { &exp_module } else { &exp_css });
                        let local = tf::read_normalized(local_file);
                        let packed = tf::read_normalized(packed_file);
                        if expected != local {
                            issues.push(issue(
                                if *kind == "module" { "theme_module_stale" } else { "theme_stylesheet_stale" },
                                "warning",
                                format!("Theme \"{}\" {kind} does not match {src_rel}. This incomplete export remains packable, but run `{}` before adding its matching export.", lt.slug, fmt_cmd(&format!("theme build {src_rel}"), &pkg_dir)),
                            ));
                        }
                        if local != packed {
                            issues.push(issue(
                                if *kind == "module" { "packed_theme_module_changed" } else { "packed_theme_stylesheet_changed" },
                                "error",
                                format!("Theme \"{}\" {kind} changed during packing. Keep the built output unchanged in the tarball.", lt.slug),
                            ));
                        }
                    }
                }
            }
            let _ = std::fs::remove_dir_all(&expected_dir);
            continue;
        }
        let local_imports = imports::resolve(lt, &pkg_dir, local_themes.len());
        let packed_imports = local_imports.as_ref().ok().map(|_| imports::resolve(pt, &scratch.to_string_lossy(), packed_themes.len()));
        let (li, pi) = match (local_imports, packed_imports) {
            (Err(e), _) | (Ok(_), Some(Err(e))) => {
                issues.push(issue("theme_import_unresolvable", "error", format!("{e} Run `{}` before packing.", fmt_cmd(&format!("theme build {src_rel}"), &pkg_dir))));
                continue;
            }
            (Ok(l), Some(Ok(p))) => (l, p),
            _ => continue,
        };
        let expected_dir = scratch.join(format!(".astryx-theme-{}", lt.slug));
        let built_name = tf::literal_theme_name(&source, &lt.export_name);
        match tf::scratch_build(&source, Path::new(&pkg_dir), &expected_dir, &lt.slug) {
            Ok(None) => {
                issues.push(issue(
                    "theme_build_failed",
                    "error",
                    format!("Theme \"{}\" did not produce a complete build. Run `{}` before packing.", lt.slug, fmt_cmd(&format!("theme build {src_rel}"), &pkg_dir)),
                ));
                let _ = std::fs::remove_dir_all(&expected_dir);
                continue;
            }
            Err(e) => {
                issues.push(issue(
                    "theme_build_failed",
                    "error",
                    format!("Theme \"{}\" could not be rebuilt from {src_rel}: {e} Run `{}` before packing.", lt.slug, fmt_cmd(&format!("theme build {src_rel}"), &pkg_dir)),
                ));
                let _ = std::fs::remove_dir_all(&expected_dir);
                continue;
            }
            Ok(Some((exp_module, exp_css))) => {
                let pf = |f: &Option<String>| f.as_ref().map(PathBuf::from);
                let local_theme = tf::WrapperTheme {
                    export_name: &lt.export_name,
                    stylesheet_file: pf(&li.stylesheet_file),
                    font_stylesheet_file: pf(&li.font_stylesheet_file),
                    pkg: &local_pkg,
                    package_dir: Path::new(&pkg_dir),
                };
                let packed_theme = tf::WrapperTheme {
                    export_name: &pt.export_name,
                    stylesheet_file: pf(&pi.stylesheet_file),
                    font_stylesheet_file: pf(&pi.font_stylesheet_file),
                    pkg: &packed_pkg,
                    package_dir: Path::new(&packed_dir),
                };
                for (kind, exp, l, p, stale_code, packed_code) in [
                    ("module", exp_module.clone(), pf(&li.module_file), pf(&pi.module_file), "theme_module_stale", "packed_theme_module_changed"),
                    ("stylesheet", exp_css.clone(), pf(&li.stylesheet_file), pf(&pi.stylesheet_file), "theme_stylesheet_stale", "packed_theme_stylesheet_changed"),
                ] {
                    let (Some(l), Some(p)) = (l, p) else { continue };
                    let expected = tf::read_normalized(&exp);
                    let local = tf::read_normalized(&l);
                    let packed = tf::read_normalized(&p);
                    let local_wrapper = if kind == "module" && expected != local { tf::own_styles_entry(&l, &expected, &local_theme) } else { None };
                    let packed_wrapper = if kind == "module" && expected != packed { tf::own_styles_entry(&p, &expected, &packed_theme) } else { None };
                    let local_matches = expected == local || matches!(local_wrapper, Some(tf::Wrapper::Ok));
                    let packed_matches = expected == packed || matches!(packed_wrapper, Some(tf::Wrapper::Ok));
                    if !local_matches {
                        let cmd = fmt_cmd(&format!("theme build {src_rel}"), &pkg_dir);
                        let message = match &local_wrapper {
                            Some(tf::Wrapper::Reject { reason, rebuild: false }) => format!(
                                "Theme \"{}\" module is not the module `{cmd}` writes and does not only wrap it: {reason}. A module that wraps the built module may only import the theme's own stylesheet and font stylesheet for their side effects and re-export from the built module either everything or only its theme, as {}.",
                                lt.slug, lt.export_name
                            ),
                            Some(tf::Wrapper::Reject { reason, rebuild: true }) => format!(
                                "Theme \"{}\" module re-exports {reason}, which does not match {src_rel}. Run `{cmd}` before packing.",
                                lt.slug
                            ),
                            _ => tf::renamed_output_message(&lt.slug, kind, &l, &source, built_name.as_deref(), Path::new(&pkg_dir))
                                .unwrap_or_else(|| format!("Theme \"{}\" {kind} does not match {src_rel}. Run `{cmd}` before packing.", lt.slug)),
                        };
                        issues.push(issue(stale_code, "error", message));
                    }
                    if local != packed || (local_matches && !packed_matches) {
                        issues.push(issue(packed_code, "error", format!("Theme \"{}\" {kind} changed during packing. Keep the built output unchanged in the tarball.", lt.slug)));
                    }
                }
            }
        }
        let _ = std::fs::remove_dir_all(&expected_dir);
        let fonts_differ = li.font_stylesheet != pi.font_stylesheet
            || match (&li.font_stylesheet_file, &pi.font_stylesheet_file) {
                (Some(a), Some(b)) => std::fs::read(a).ok() != std::fs::read(b).ok(),
                _ => false,
            };
        if fonts_differ {
            issues.push(issue("packed_theme_font_stylesheet_changed", "error", format!("Theme \"{}\" font stylesheet changed during packing. Keep its export and bytes unchanged in the tarball.", lt.slug)));
        }
    }
    issues
}

/// `validatePackedComponentExports`: each packed component's advertised
/// import must resolve for a consumer and export the component.
fn packed_component_exports(pkg_dir: &Path, manifest: &Value, name: &str, scratch: &Path) -> Vec<Value> {
    let mut issues = Vec::new();
    let Some(r) = manifest.get("components").and_then(|v| v.as_str()) else { return issues };
    let root = super::add_helpers::resolve(pkg_dir, r);
    let mut docs = Vec::new();
    walk(&root, &|n| doc_ext(n).is_some(), &mut docs);
    let mut components: Vec<(String, String)> = Vec::new();
    for d in docs {
        let Some(v) = super::manifest_load::load_default(&d) else { continue };
        let Some(cname) = v.get("name").and_then(|t| t.as_str()) else { continue };
        let owner = crate::discovery::component_discovery::ImportOwner {
            exports_map: None,
            package_dir: Some(pkg_dir.to_path_buf()),
            doc_path: Some(d.clone()),
            package_name: name.to_string(),
        };
        let spec = crate::discovery::component_discovery::resolve_integration_import_path(&owner, cname, v.get("import").and_then(|i| i.as_str()));
        components.push((cname.to_string(), spec));
    }
    issues.extend(ts_extension_issues(&components.iter().map(|(n, s)| (format!("Component \"{n}\""), s.clone())).collect::<Vec<_>>()));
    for (cname, spec) in &components {
        match consumer_resolve(spec, scratch) {
            Err(e) => issues.push(issue(
                "component_import_unresolvable",
                "error",
                format!("Component \"{cname}\" advertises import \"{spec}\", but a consumer cannot resolve it: {e}"),
            )),
            Ok(target) => {
                if !crate::discovery::module_exports::module_exports_name(&target, cname) {
                    issues.push(issue(
                        "component_export_missing",
                        "error",
                        format!("Component \"{cname}\" advertises import \"{spec}\", but that packed module does not export \"{cname}\". Add or correct the package export before publishing."),
                    ));
                }
            }
        }
    }
    issues
}

/// `validatePackedTemplateExports`: each packed template's public import
/// must resolve and have a default export.
fn packed_template_exports(loaded: &crate::discovery::integrations::Record, name: &str, scratch: &Path) -> Vec<Value> {
    let pkg_dir = loaded.get("__packageDir").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let (templates, _) = crate::commands::template::integration::for_one(loaded);
    let entries: Vec<(String, String)> = templates
        .iter()
        .map(|t| {
            let rel = relative(Path::new(&pkg_dir), Path::new(&t.file_path));
            let ext = rel.strip_suffix(".tsx").or_else(|| rel.strip_suffix(".ts")).unwrap_or(&rel).to_string();
            (t.dir_name.clone(), format!("{name}/{ext}"))
        })
        .collect();
    let mut issues = ts_extension_issues(&entries.iter().map(|(id, s)| (format!("Template \"{id}\""), s.clone())).collect::<Vec<_>>());
    for (id, spec) in &entries {
        match consumer_resolve(spec, scratch) {
            Err(e) => issues.push(issue(
                "template_import_unresolvable",
                "error",
                format!("Template \"{id}\" source is packed but its public import \"{spec}\" cannot be resolved: {e}"),
            )),
            Ok(target) => {
                if !crate::discovery::module_exports::module_exports_name(&target, "default") {
                    issues.push(issue("template_export_missing", "error", format!("Template \"{id}\" public import \"{spec}\" does not have a default export.")));
                }
            }
        }
    }
    issues
}

#[allow(clippy::too_many_arguments)]
fn build_receipt(
    name: String,
    version: Value,
    manifest: &str,
    roots: &[(String, String, Vec<String>)],
    all_files: &[String],
    pack: Option<&super::pack::PackResult>,
    local: Option<&Value>,
    packed: Option<&Value>,
    issues: Vec<Value>,
) -> Value {
    let packed_paths: Vec<String> = pack.map(|p| p.files.clone()).unwrap_or_default();
    let roots_json: Vec<Value> = roots
        .iter()
        .map(|(kind, path, files)| {
            let missing: Vec<Value> = files.iter().filter(|f| !packed_paths.contains(f)).cloned().map(Value::String).collect();
            let mut m = Map::new();
            m.insert("kind".into(), Value::String(kind.clone()));
            m.insert("path".into(), Value::String(path.clone()));
            m.insert("expectedFiles".into(), Value::from(files.len() as u64));
            m.insert("complete".into(), Value::Bool(missing.is_empty()));
            m.insert("missingFiles".into(), Value::Array(missing));
            let mut o = Map::new();
            for k in ["kind", "path", "expectedFiles", "missingFiles", "complete"] {
                o.insert(k.into(), m[k].clone());
            }
            Value::Object(o)
        })
        .collect();
    let packable = !issues.iter().any(|i| i["severity"] == "error");
    let mut d = Map::new();
    d.insert("name".into(), Value::String(name));
    d.insert("version".into(), version);
    d.insert("packable".into(), Value::Bool(packable));
    d.insert(
        "tarball".into(),
        match pack {
            None => Value::Null,
            Some(p) => {
                let mut t = Map::new();
                t.insert("filename".into(), Value::String(p.filename.clone()));
                t.insert("fileCount".into(), Value::from(p.file_count as u64));
                t.insert("size".into(), Value::from(p.size as u64));
                t.insert("unpackedSize".into(), Value::from(p.unpacked_size));
                Value::Object(t)
            }
        },
    );
    let mut inv = Map::new();
    inv.insert("manifest".into(), Value::String(manifest.into()));
    inv.insert("roots".into(), Value::Array(roots_json));
    inv.insert("expectedFiles".into(), Value::from(all_files.len() as u64));
    inv.insert("packedFiles".into(), Value::from(all_files.iter().filter(|f| packed_paths.contains(f)).count() as u64));
    d.insert("inventory".into(), Value::Object(inv));
    let mut c = Map::new();
    c.insert("local".into(), local.cloned().unwrap_or(Value::Null));
    c.insert("packed".into(), packed.cloned().unwrap_or(Value::Null));
    d.insert("contributions".into(), Value::Object(c));
    d.insert("issues".into(), Value::Array(issues));
    let mut m = Map::new();
    m.insert("type".into(), Value::String("integration.pack-check".into()));
    m.insert("data".into(), Value::Object(d));
    Value::Object(m)
}




fn walk(dir: &Path, filter: &dyn Fn(&str) -> bool, out: &mut Vec<std::path::PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut v: Vec<std::path::PathBuf> = Vec::new();
    for e in rd.flatten() {
        let n = e.file_name().to_string_lossy().to_string();
        if ["node_modules", ".git", "__tests__", "__fixtures__"].contains(&n.as_str()) {
            continue;
        }
        let p = e.path();
        if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            walk(&p, filter, &mut v);
        } else if filter(&n) {
            v.push(p);
        }
    }
    v.sort();
    out.extend(v);
}

fn doc_ext(n: &str) -> Option<usize> {
    [".doc.ts", ".doc.mjs", ".doc.js"].iter().find(|x| n.ends_with(*x)).map(|x| x.len())
}
