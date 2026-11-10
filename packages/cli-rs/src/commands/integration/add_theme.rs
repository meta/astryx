//! `integration add theme` (`api/integration/add-theme.mjs`): scaffold one
//! typed theme source/descriptor pair, declare the themes root on first
//! use, and add the built module and stylesheet exports.

use super::add::{patch_integration_root, AddOptions, RootError};
use super::add_helpers::*;
use super::cli_requirement;
use super::jsjson;
use super::manifest_load::load_manifest_value;
use crate::json::{Map, Value};
use std::fs;

pub struct Identity {
    pub slug: String,
    pub identifier: String,
    pub display_name: String,
    pub export_name: String,
    pub entry: String,
    pub descriptor: String,
}

pub fn theme_identity(slug: &str) -> R<Identity> {
    sanitize_name(slug, "theme name").map_err(|e| AddError::new(e.message, "ERR_INVALID_ARGUMENT"))?;
    if !is_kebab(slug) {
        return Err(AddError::new(format!("Invalid theme name \"{slug}\": use lowercase kebab-case starting with a letter."), "ERR_INVALID_ARGUMENT"));
    }
    let mut identifier = String::new();
    let mut up = false;
    for c in slug.chars() {
        if c == '-' {
            up = true;
        } else if up {
            identifier.push(c.to_ascii_uppercase());
            up = false;
        } else {
            identifier.push(c);
        }
    }
    let display_name = slug
        .split('-')
        .map(|p| if p == "y2k" { "Y2K".to_string() } else { format!("{}{}", p[..1].to_uppercase(), &p[1..]) })
        .collect::<Vec<_>>()
        .join(" ");
    Ok(Identity {
        slug: slug.into(),
        export_name: format!("{identifier}Theme"),
        entry: format!("{identifier}Theme.ts"),
        descriptor: format!("{identifier}Theme.doc.mjs"),
        identifier,
        display_name,
    })
}

fn quote(v: &str) -> String {
    let e = v
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029");
    format!("'{e}'")
}

/// `themeDescriptorSource`.
pub fn theme_descriptor_source(name: &str, display_name: &str, description: &str, maintained: bool) -> String {
    [
        "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */".to_string(),
        "export default {".into(),
        "  type: 'theme',".into(),
        format!("  name: {},", quote(name)),
        format!("  displayName: {},", quote(display_name)),
        format!("  description: {},", quote(description)),
        format!("  maintained: {maintained},"),
        "};".into(),
        String::new(),
    ]
    .join("\n")
}

pub fn add_theme(name: &str, o: &AddOptions) -> R<Value> {
    let dry = o.dry_run.unwrap_or(false);
    let package_dir = find_package_dir(&o.cwd)?;
    let package_file = package_dir.join("package.json");
    let pkg = read_package_json(&package_file, "ERR_THEME_INVALID")?;
    let owner = owner_of(&pkg);
    let identity = theme_identity(name)?;
    let theme_invalid = |e: AddError| AddError::new(e.message, "ERR_THEME_INVALID");
    let existing = find_local_manifest(&package_dir).map_err(theme_invalid)?;
    let manifest_exists = existing.is_some();
    let manifest_file = existing.unwrap_or_else(|| package_dir.join("astryx.integration.mjs"));
    let manifest = if manifest_exists { load_manifest_value(&manifest_file).map_err(theme_invalid)? } else { Value::Object(Map::new()) };
    let declared = manifest.get("themes").and_then(|v| v.as_str()).map(|s| s.to_string());
    let root_path = declared.clone().unwrap_or_else(|| "./themes".into());
    let root = assert_within(&root_path, &package_dir, "themes root", false).map_err(|e| AddError::new(e.message, "ERR_PATH_TRAVERSAL"))?;
    let mut root_receipt = match patch_integration_root(&package_dir, "themes", &root_path, true, true) {
        Ok(r) => r,
        Err(RootError::Conflict(m)) => return Err(AddError::new(m, "ERR_INTEGRATION_ROOT_CONFLICT")),
        Err(RootError::Other(e)) => return Err(theme_invalid(e)),
    };
    if root.exists() {
        crate::commands::theme::discovery::discover_directory(&root.to_string_lossy(), &owner, false)
            .map_err(|m| AddError::new(m, "ERR_THEME_INVALID"))?;
    }
    let theme_dir = within(&identity.slug, &root, "theme directory")?;
    if let Some(from) = &o.from {
        if from == name {
            return Err(AddError::new(format!("Cannot fork theme \"{from}\" into itself."), "ERR_INVALID_ARGUMENT"));
        }
    }
    let base_theme = match &o.from {
        Some(from) => Some(resolve_base_theme(from, &owner, &root)?),
        None => None,
    };
    let mut plans = if let Some(base) = &base_theme {
        let plans = fork_theme_plans(base, &identity, &theme_dir)?;
        for p in &plans {
            if p.path.exists() {
                return Err(AddError::new(format!("Refusing to overwrite existing file {}.", relative(&package_dir, &p.path)), "ERR_FILE_EXISTS"));
            }
        }
        plans
    } else {
        let source_file = within(&identity.entry, &theme_dir, "theme source file")?;
        let descriptor_file = within(&identity.descriptor, &theme_dir, "theme descriptor file")?;
        for f in [&source_file, &descriptor_file] {
            if f.exists() {
                return Err(AddError::new(format!("Refusing to overwrite existing file {}.", relative(&package_dir, f)), "ERR_FILE_EXISTS"));
            }
        }
        let src = format!(
            "import {{defineTheme}} from '@astryxdesign/core/theme';\n\nexport const {} = defineTheme({{\n  name: '{}',\n}});\n",
            identity.export_name, identity.slug
        );
        let desc = theme_descriptor_source(&identity.slug, &identity.display_name, &format!("{} theme.", identity.display_name), true);
        vec![WritePlan::create(source_file, src), WritePlan::create(descriptor_file, desc)]
    };
    let output_base = relative(&package_dir, &theme_dir.join(&identity.slug));
    let mut upd = package_json_update(
        &package_file,
        &root_path,
        &basename(&manifest_file),
        &[
            ExportEntry { subpath: format!("themes/{}", identity.slug), target: format!("{output_base}.js") },
            ExportEntry { subpath: format!("themes/{}.css", identity.slug), target: format!("{output_base}.css") },
        ],
        true,
        &["**/*.css"],
    )?;
    {
        let (expected, text) = match &upd {
            Some(u) => (u.expected_original.clone(), u.contents.clone()),
            None => {
                let b = fs::read(&package_file).map_err(|e| AddError::plain(e.to_string()))?;
                let t = String::from_utf8_lossy(&b).to_string();
                (b, t)
            }
        };
        let current = jsjson::parse(&text).map_err(AddError::plain)?;
        let mut changed = false;
        let mut next = current.clone();
        if cli_requirement::themes_cli_problem(&current).is_some() {
            next = cli_requirement::with_cli_peer(&current, cli_requirement::THEMES_CLI);
            changed = true;
        }
        let forked = match &base_theme {
            Some(b) => fork_dependencies(b, &next),
            None => Vec::new(),
        };
        if !forked.is_empty() {
            let mut deps = match next.get("dependencies") {
                Some(Value::Object(m)) => m.clone(),
                _ => Map::new(),
            };
            for (k, v) in forked {
                deps.insert(k, Value::String(v));
            }
            let mut keys: Vec<String> = deps.keys().cloned().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            let sorted: Map<String, Value> = keys.into_iter().map(|k| { let v = deps[&k].clone(); (k, v) }).collect();
            next.as_object_mut().unwrap().insert("dependencies".into(), Value::Object(sorted));
            changed = true;
        }
        if changed {
            let mut contents = crate::json::stringify(&next, 2);
            if text.ends_with('\n') {
                contents.push('\n');
            }
            upd = Some(PackageJsonUpdate { contents, expected_original: expected });
        }
    }
    if let Some(u) = upd {
        plans.push(WritePlan { path: package_file.clone(), contents: u.contents.into_bytes(), create_only: false, expected_original: Some(u.expected_original) });
    }
    let mut files: Vec<String> = plans.iter().map(|p| relative(&package_dir, &p.path)).collect();
    let manifest_path = relative(&package_dir, &manifest_file);
    if !dry {
        let rb = apply_writes(&plans).map_err(|e| if e.code.is_some() { e } else { AddError::new(format!("Failed to write theme contribution: {}", e.message), "ERR_WRITE_FAILED") })?;
        let label = format!("Integration manifest {}", basename(&manifest_file));
        let verify = || {
            super::add::verify_contribution(&package_dir, &manifest_file, &owner, &label, "themes", "The themes root was not visible after writing.", "theme", &identity.slug, None)
        };
        match super::add::patch_integration_root_verified(&package_dir, "themes", &root_path, false, true, Some(&verify)) {
            Ok(r) => root_receipt = r,
            Err(e) => {
                rb.run();
                return Err(match e {
                    RootError::Conflict(m) => AddError::new(m, "ERR_INTEGRATION_ROOT_CONFLICT"),
                    RootError::Other(e) if e.code.is_some() => e,
                    RootError::Other(e) => AddError::new(format!("Failed to write theme contribution: {}", e.message), "ERR_WRITE_FAILED"),
                });
            }
        }
    }
    if root_receipt.1 && !files.contains(&manifest_path) {
        files.push(manifest_path.clone());
    }
    let mut r = receipt("theme", &identity.slug, Some(root_receipt), &manifest_path, &files, dry);
    if let Some(f) = &o.from {
        r["data"]["from"] = Value::String(f.clone());
    }
    Ok(r)
}

// ── --from: resolve and fork a base theme ───────────────────────────

use crate::commands::theme::discovery::Theme as BaseTheme;

fn resolve_base_theme(slug: &str, owner: &str, themes_root: &std::path::Path) -> R<BaseTheme> {
    let mut candidates = crate::commands::theme::discovery::bundled(&crate::cli::env::cli_root());
    if themes_root.exists() {
        candidates.extend(crate::commands::theme::discovery::discover_directory(&themes_root.to_string_lossy(), owner, false).unwrap_or_default());
    }
    let lower = slug.to_lowercase();
    if let Some(i) = candidates.iter().position(|t| t.slug.to_lowercase() == lower) {
        return Ok(candidates.swap_remove(i));
    }
    let names: Vec<String> = candidates.iter().map(|t| t.slug.clone()).collect();
    let mut e = AddError::new(
        format!("Unknown base theme \"{slug}\". Available themes: {}.", if names.is_empty() { "(none)".to_string() } else { names.join(", ") }),
        "ERR_UNKNOWN_THEME",
    );
    e.suggestions = candidates
        .iter()
        .map(|t| (t.slug.clone(), if t.bundled { "bundled theme".to_string() } else { format!("provided by {}", t.package) }))
        .collect();
    Err(e)
}

fn rename_theme_file(file: &str, base_id: &str, new_id: &str) -> String {
    let (dir, base) = match file.rfind('/') {
        Some(i) => (Some(&file[..i]), &file[i + 1..]),
        None => (None, file),
    };
    if !base.starts_with(base_id) {
        return file.to_string();
    }
    let renamed = format!("{new_id}{}", &base[base_id.len()..]);
    match dir {
        Some(d) => format!("{d}/{renamed}"),
        None => renamed,
    }
}

fn strip_copyright_header(s: &str) -> String {
    for (open, close) in [("// Copyright (c) Meta Platforms, Inc. and affiliates.", ""), ("<!-- Copyright (c) Meta Platforms, Inc. and affiliates. -->", "")] {
        let _ = close;
        let mut prefix = String::new();
        let mut rest = s;
        if let Some(r) = rest.strip_prefix('\u{FEFF}') {
            prefix.push('\u{FEFF}');
            rest = r;
        }
        if open.starts_with("//") && rest.starts_with("#!") {
            if let Some(nl) = rest.find('\n') {
                prefix.push_str(&rest[..=nl]);
                rest = &rest[nl + 1..];
            } else {
                continue;
            }
        }
        if let Some(mut r) = rest.strip_prefix(open) {
            if let Some(x) = r.strip_prefix("\r\n") {
                r = x;
            } else if let Some(x) = r.strip_prefix('\n') {
                r = x;
            } else {
                continue;
            }
            loop {
                if let Some(x) = r.strip_prefix("\r\n") {
                    r = x;
                } else if let Some(x) = r.strip_prefix('\n') {
                    r = x;
                } else {
                    break;
                }
            }
            return format!("{prefix}{r}");
        }
    }
    s.to_string()
}

fn rewrite_theme_source(src: &str, base_slug: &str, base_id: &str, new_slug: &str, new_id: &str) -> String {
    let mut out = String::new();
    let mut i = 0;
    while i < src.len() {
        if src[i..].starts_with(base_id) {
            let after = src[i + base_id.len()..].chars().next();
            if matches!(after, Some(c) if c.is_ascii_uppercase()) {
                out.push_str(new_id);
                i += base_id.len();
                continue;
            }
        }
        let c = src[i..].chars().next().unwrap();
        out.push(c);
        i += c.len_utf8();
    }
    out.replace(&format!("'astryx-{base_slug}'"), &format!("'astryx-{new_slug}'"))
        .replace(&format!("'{base_slug}'"), &format!("'{new_slug}'"))
        .replace(&format!("--astryx-theme-{base_slug}-"), &format!("--astryx-theme-{new_slug}-"))
}

fn fork_theme_plans(base: &BaseTheme, id: &Identity, theme_dir: &std::path::Path) -> R<Vec<WritePlan>> {
    let base_id = theme_identity(&base.slug)?;
    let mut plans = Vec::new();
    for file in base.files.iter().filter(|f| f.rsplit('/').next() != Some(&format!("{}.doc.mjs", base_id.export_name))) {
        let new_name = rename_theme_file(file, &base_id.identifier, &id.identifier);
        let dest = within(&new_name, theme_dir, &format!("forked theme file \"{new_name}\""))?;
        let bytes = fs::read(std::path::Path::new(&base.source_dir).join(file)).map_err(|e| AddError::plain(e.to_string()))?;
        let contents = match String::from_utf8(bytes.clone()) {
            Ok(text) => rewrite_theme_source(&strip_copyright_header(&text), &base.slug, &base_id.identifier, &id.slug, &id.identifier).into_bytes(),
            Err(_) => bytes,
        };
        plans.push(WritePlan::create(dest, contents));
    }
    let desc = within(&id.descriptor, theme_dir, "theme descriptor file")?;
    plans.push(WritePlan::create(desc, theme_descriptor_source(&id.slug, &id.display_name, &format!("{} theme.", id.display_name), true)));
    Ok(plans)
}

const NODE_BUILTINS: &[&str] = &[
    "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
    "events", "fs", "http", "http2", "https", "inspector", "module", "net", "os", "path", "perf_hooks", "process", "punycode", "querystring",
    "readline", "repl", "stream", "string_decoder", "sys", "timers", "tls", "trace_events", "tty", "url", "util", "v8", "vm", "wasi",
    "worker_threads", "zlib",
];

fn package_of_specifier(spec: &str) -> Option<String> {
    if spec.starts_with('.') || spec.starts_with('/') || spec.starts_with("node:") {
        return None;
    }
    let first = spec.split('/').next().unwrap_or("");
    if NODE_BUILTINS.contains(&first) && (spec == first || ["fs/promises", "path/posix", "path/win32", "stream/promises", "stream/web", "util/types", "timers/promises", "dns/promises", "assert/strict", "readline/promises", "stream/consumers", "inspector/promises"].contains(&spec)) {
        return None;
    }
    let parts: Vec<&str> = spec.split('/').collect();
    Some(if spec.starts_with('@') { parts.iter().take(2).cloned().collect::<Vec<_>>().join("/") } else { parts[0].to_string() })
}

fn file_imports(path: &std::path::Path) -> Option<Vec<String>> {
    use oxc::ast::ast::{ModuleDeclaration, Statement};
    let src = fs::read_to_string(path).ok()?;
    let alloc = oxc::allocator::Allocator::default();
    let ret = oxc::parser::Parser::new(&alloc, &src, oxc::span::SourceType::tsx()).parse();
    if !ret.diagnostics.is_empty() {
        return None;
    }
    let mut out = Vec::new();
    for st in ret.program.body.iter() {
        if let Some(m) = st.as_module_declaration() {
            match m {
                ModuleDeclaration::ImportDeclaration(d) => out.push(d.source.value.as_str().unwrap_or_default().to_string()),
                ModuleDeclaration::ExportFromDeclaration(d) => out.push(d.source.value.as_str().unwrap_or_default().to_string()),
                ModuleDeclaration::ExportAllDeclaration(d) => out.push(d.source.value.as_str().unwrap_or_default().to_string()),
                _ => {}
            }
        }
        let _ = matches!(st, Statement::EmptyStatement(_));
    }
    Some(out)
}

fn fork_dependencies(base: &BaseTheme, pkg: &Value) -> Vec<(String, String)> {
    if !base.bundled {
        return Vec::new();
    }
    let Ok(text) = fs::read_to_string(crate::cli::env::cli_root().join("package.json")) else { return Vec::new() };
    let Ok(cli) = jsjson::parse(&text) else { return Vec::new() };
    let mut ranges: Map<String, Value> = Map::new();
    for k in ["devDependencies", "peerDependencies", "dependencies"] {
        if let Some(Value::Object(m)) = cli.get(k) {
            for (n, v) in m {
                ranges.insert(n.clone(), v.clone());
            }
        }
    }
    let mut declared: std::collections::HashSet<String> = Default::default();
    for k in ["devDependencies", "peerDependencies", "dependencies"] {
        if let Some(Value::Object(m)) = pkg.get(k) {
            declared.extend(m.keys().cloned());
        }
    }
    let provided = ["@astryxdesign/core", "react", "react-dom"];
    let mut needed: Vec<(String, String)> = Vec::new();
    for file in &base.files {
        let code = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".mjsx", ".cjsx", ".mtsx", ".ctsx"].iter().any(|x| file.ends_with(x));
        if !code || file.ends_with(".doc.mjs") {
            continue;
        }
        let Some(specs) = file_imports(&std::path::Path::new(&base.source_dir).join(file)) else { continue };
        for s in specs {
            let Some(name) = package_of_specifier(&s) else { continue };
            if provided.contains(&name.as_str()) || declared.contains(&name) {
                continue;
            }
            if let Some(Value::String(r)) = ranges.get(&name) {
                if let Some(e) = needed.iter_mut().find(|(n, _)| *n == name) {
                    e.1 = r.clone();
                } else {
                    needed.push((name, r.clone()));
                }
            }
        }
    }
    needed
}
