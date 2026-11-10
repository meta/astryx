//! The compile step of `theme build` (`api/theme/build/build.mjs`
//! `themeBuildInternal`, `themeBuildForReport`, the trailers) and the CLI
//! action's report loop (`clients/cli/commands/theme.mjs`).
//!
//! The theme file and the installed Core run in the in-process JS engine, as
//! the JS CLI runs them: the theme's `defineTheme` is Core's own, and the CSS
//! comes from Core's `generateThemeRulesSplit`, `generateAdaptationCSS` and
//! `generateOnMediaCSS`. Everything around those calls is ported here.

use super::nodepath;
use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out};
use crate::cli::format::text;
use crate::js::live::{with_live, LiveSession};
use crate::json::{self, Map, Value};
use boa_engine::{JsObject, JsValue};
use std::path::Path;

pub struct ApiError {
    pub message: String,
    pub code: &'static str,
}

pub fn err(message: impl Into<String>, code: &'static str) -> ApiError {
    ApiError { message: message.into(), code }
}

/// The shared `logger`: silent in JSON mode.
pub struct Logger<'a> {
    pub out: &'a mut Out,
    pub silent: bool,
}

impl Logger<'_> {
    pub fn log(&mut self, s: &str) {
        if !self.silent {
            self.out.log(s);
        }
    }
    pub fn warn(&mut self, s: &str) {
        if !self.silent {
            self.out.warn(s);
        }
    }
}

#[derive(Clone, Default)]
pub struct BuildOptions {
    pub out: Option<String>,
    pub check: bool,
    pub icons_specifier: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Trailer {
    pub theme_name: String,
    pub export_name: String,
    pub js_import: String,
    pub css_import: String,
    pub unloaded_fonts: Vec<String>,
    pub font_notices: Vec<String>,
}

// ---------------------------------------------------------------------------
// Small JS-semantics helpers over converted values (markers for undefined
// and functions, see crate::js).

pub fn is_undef(v: Option<&Value>) -> bool {
    match v {
        None => true,
        Some(Value::Object(m)) => m.get("__js").and_then(|k| k.as_str()) == Some("undefined"),
        _ => false,
    }
}

pub fn is_fn(v: &Value) -> bool {
    matches!(v, Value::Object(m) if m.get("__js").and_then(|k| k.as_str()) == Some("function"))
}

/// A plain (non-marker) object.
pub fn as_obj(v: Option<&Value>) -> Option<&Map<String, Value>> {
    match v {
        Some(Value::Object(m)) if !m.contains_key("__js") => Some(m),
        _ => None,
    }
}

/// `value ?? {}` keys count.
fn key_count(v: Option<&Value>) -> usize {
    as_obj(v).map(|m| m.len()).unwrap_or(0)
}

/// JS truthiness of a converted value.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(false),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Object(m)) => match m.get("__js").and_then(|k| k.as_str()) {
            Some("undefined") => false,
            Some("number") => m.get("value").and_then(|v| v.as_str()) != Some("NaN"),
            _ => true,
        },
        Some(Value::Array(_)) => true,
    }
}

/// `JSON.stringify(v, null, 2)` of a converted value.
pub fn stringify2(v: &Value) -> String {
    match crate::js::to_json_data(v) {
        Some(d) => json::stringify(&d, 2),
        None => "undefined".into(),
    }
}

fn indent_after_first(s: &str) -> String {
    s.split('\n').enumerate().map(|(i, l)| if i == 0 { l.to_string() } else { format!("  {l}") }).collect::<Vec<_>>().join("\n")
}

// ---------------------------------------------------------------------------
// Names.

/// `toIdentifier`.
pub fn to_identifier(name: &str) -> String {
    let chars: Vec<char> = name.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '-' || chars[i] == '.' {
            let mut j = i;
            while j < chars.len() && (chars[j] == '-' || chars[j] == '.') {
                j += 1;
            }
            if j < chars.len() && (chars[j].is_ascii_alphanumeric() || chars[j] == '_') {
                out.extend(chars[j].to_uppercase());
                i = j + 1;
            } else {
                i = j;
            }
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    if out.starts_with(|c: char| c.is_ascii_digit()) {
        format!("_{out}")
    } else if out.is_empty() {
        "_".into()
    } else {
        out
    }
}

/// `importSpecifier(relDir, base)`.
pub fn import_specifier(rel_dir: &str, base: &str) -> String {
    let normalized = if rel_dir == "." { "" } else { rel_dir };
    let within = if let Some(r) = normalized.strip_prefix("src") {
        r.strip_prefix('/').map(|x| x.to_string()).unwrap_or_else(|| if r.is_empty() { String::new() } else { normalized.to_string() })
    } else {
        normalized.to_string()
    };
    // `/^src\/?/` matches `src` followed by anything, so `srcx` drops `src`.
    let within = if normalized.starts_with("src") && !normalized.starts_with("src/") && normalized != "src" {
        normalized[3..].to_string()
    } else {
        within
    };
    let within = within.trim_end_matches('/').to_string();
    if within.is_empty() {
        format!("./{base}")
    } else {
        format!("./{within}/{base}")
    }
}

/// `sanitizeName(name, {label: 'theme name'})`.
fn sanitize_name(name: &str) -> Result<(), String> {
    let label = "theme name";
    if name.is_empty() {
        return Err(format!("Invalid {label}: must be a non-empty string"));
    }
    if name.contains('\0') {
        return Err(format!("Invalid {label}: contains a NUL byte"));
    }
    if name.contains('/') || name.contains('\\') {
        return Err(format!("Invalid {label} \"{name}\": must not contain path separators ('/' or '\\\\')."));
    }
    if name.starts_with('.') {
        return Err(format!("Invalid {label} \"{name}\": must not start with '.'."));
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')) {
        return Err(format!("Invalid {label} \"{name}\": only letters, digits, '.', '_', and '-' are allowed."));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Core.

fn read_pkg_version(dir: Option<&str>) -> String {
    let Some(dir) = dir else { return "unknown".into() };
    std::fs::read_to_string(Path::new(dir).join("package.json"))
        .ok()
        .and_then(|t| crate::commands::theme_build::jsonparse::parse(&t).ok())
        .and_then(|v| v.get("version").and_then(|x| x.as_str()).map(String::from))
        .unwrap_or_else(|| "unknown".into())
}

/// `importTarget(dir, subpath)`: the file an import of `subpath` reaches
/// through the package's `exports` map.
fn import_target(dir: &str, subpath: &str) -> Option<String> {
    let text = std::fs::read_to_string(Path::new(dir).join("package.json")).ok()?;
    let pkg = crate::commands::theme_build::jsonparse::parse(&text).ok()?;
    let map = pkg.get("exports")?;
    let by_subpath = matches!(map, Value::Object(m) if m.keys().any(|k| k.starts_with('.')));
    let entry = if by_subpath { map.get(subpath) } else if subpath == "." { Some(map) } else { None };
    fn pick(v: &Value) -> Option<String> {
        match v {
            Value::String(s) => Some(s.clone()),
            Value::Object(m) => {
                for (cond, target) in m {
                    if cond != "node" && cond != "import" && cond != "default" {
                        continue;
                    }
                    if let Some(p) = pick(target) {
                        return Some(p);
                    }
                }
                None
            }
            _ => None,
        }
    }
    let target = pick(entry?)?;
    Some(nodepath::resolve(dir, &[&target]))
}

fn in_astryx_repository(cwd: &str) -> bool {
    let mut dir = cwd.to_string();
    for _ in 0..6 {
        if let Ok(t) = std::fs::read_to_string(Path::new(&dir).join("packages/core/package.json")) {
            if let Ok(v) = crate::commands::theme_build::jsonparse::parse(&t) {
                if v.get("name").and_then(|x| x.as_str()) == Some("@astryxdesign/core") {
                    return true;
                }
            }
        }
        let parent = nodepath::dirname(&dir);
        if parent == dir {
            break;
        }
        dir = parent;
    }
    false
}

fn format_cli_command(cwd: &str, cmd: &str) -> String {
    crate::cli::env::format_cli_command_at(Path::new(cwd), cmd)
}

/// `coreUnavailableMessage(cwd, importError)`.
pub fn core_unavailable_message(cwd: &str, import_error: Option<&str>) -> String {
    let why = format!(
        "`{}` generates CSS with @astryxdesign/core, the same code the runtime <Theme> uses",
        format_cli_command(cwd, "theme build")
    );
    let detail = import_error.map(|m| format!("\n  Import error: {m}")).unwrap_or_default();
    if in_astryx_repository(cwd) {
        return format!("Could not load @astryxdesign/core/theme: {why}. Build @astryxdesign/core first (e.g. `pnpm -F @astryxdesign/core build`).{detail}");
    }
    if let Some(installed) = crate::discovery::paths::find_installed_package(cwd, "@astryxdesign/core", crate::discovery::paths::INSTALLED_REACH) {
        let rel = nodepath::relative(cwd, cwd, &installed);
        return format!(
            "Could not load the @astryxdesign/core installed at {}: {why}. Reinstall it.{detail}",
            if rel.is_empty() { "." } else { &rel }
        );
    }
    format!("This project does not have @astryxdesign/core installed: {why}. Install it: `npm install @astryxdesign/core` (or yarn/pnpm/bun).{detail}")
}

/// The Core this build generates with: its theme namespace and directory.
pub struct Core {
    pub ns: JsObject,
    pub dir: Option<String>,
}

/// `selectCore` + the import: the project's installed Core, else the Core the
/// CLI carries.
fn select_core(s: &mut LiveSession, cwd: &str, cli_root: &str) -> Result<Core, ApiError> {
    let installed = crate::discovery::paths::find_installed_package(cwd, "@astryxdesign/core", crate::discovery::paths::INSTALLED_REACH);
    let carried = if installed.is_none() { crate::discovery::paths::find_carried_core_dir(cwd, false) } else { None };
    let dir = installed.clone().or(carried.clone());
    let theme_file = dir.as_deref().and_then(|d| import_target(d, "./theme"));
    if let (Some(dir), Some(file)) = (dir.clone(), theme_file) {
        let ns = s.import(Path::new(&file), &crate::js::ImportOptions::default()).map_err(|e| {
            let message = if installed.is_none() {
                format!("Could not load the @astryxdesign/core this CLI release carries, at {dir}.\n  Import error: {}", e.message)
            } else {
                core_unavailable_message(cwd, Some(&e.message))
            };
            err(message, "ERR_CORE_NOT_FOUND")
        })?;
        let missing: Vec<&str> = ["defineTheme", "generateThemeRulesSplit"]
            .into_iter()
            .filter(|n| !s.get(&ns, n).as_object().map(|o| o.is_callable()).unwrap_or(false))
            .collect();
        if !missing.is_empty() {
            let rel = nodepath::relative(cwd, cwd, &dir);
            return Err(err(
                format!(
                    "The @astryxdesign/core at {} does not export {} from its `./theme` entry, which `{}` calls. Update it.",
                    if rel.is_empty() { "." } else { &rel },
                    missing.join(" or "),
                    format_cli_command(cwd, "theme build")
                ),
                "ERR_CORE_INCOMPATIBLE",
            ));
        }
        return Ok(Core { ns, dir: Some(dir) });
    }
    // The CLI's own Core: the one its own package resolves.
    let own = crate::discovery::paths::find_installed_package(cli_root, "@astryxdesign/core", usize::MAX);
    let own_file = own.as_deref().and_then(|d| import_target(d, "./theme"));
    match own_file {
        Some(file) => {
            let ns = s
                .import(Path::new(&file), &crate::js::ImportOptions::default())
                .map_err(|e| err(core_unavailable_message(cwd, Some(&e.message)), "ERR_CORE_NOT_FOUND"))?;
            Ok(Core { ns, dir: own })
        }
        None => {
            let from = nodepath::join(&[cli_root, "api/theme/build/build.mjs"]);
            let msg = format!("Cannot find package '@astryxdesign/core' imported from {from}");
            Err(err(core_unavailable_message(cwd, Some(&msg)), "ERR_CORE_NOT_FOUND"))
        }
    }
}

// ---------------------------------------------------------------------------
// Loading the theme module.

struct Loaded {
    theme: JsObject,
    export_name: String,
}

fn is_theme_object(s: &mut LiveSession, v: &JsValue) -> bool {
    let Some(o) = v.as_object() else { return false };
    let name = s.get(&o, "name");
    let tokens = s.get(&o, "tokens");
    name.is_string() && tokens.as_object().is_some()
}

fn is_plain_object(s: &mut LiveSession, v: &JsValue) -> bool {
    let Some(o) = v.as_object() else { return false };
    if o.is_array() {
        return false;
    }
    !is_module_namespace(s, &o)
}

fn is_module_namespace(s: &mut LiveSession, o: &JsObject) -> bool {
    let tag = o.get(boa_engine::JsSymbol::to_string_tag(), s.ctx()).unwrap_or_default();
    tag.as_string().map(|t| t.to_std_string_lossy() == "Module").unwrap_or(false)
}

fn own_keys(s: &mut LiveSession, o: &JsObject) -> Vec<String> {
    let object = s.global("Object");
    let keys_fn = object.as_object().map(|ob| s.get(&ob, "keys")).unwrap_or_default();
    match s.call(&keys_fn, &[o.clone().into()]) {
        Ok(v) => s.string_items(&v),
        Err(_) => vec![],
    }
}

fn load_theme(s: &mut LiveSession, file: &str, aliases: Vec<(String, std::path::PathBuf)>) -> Result<Loaded, String> {
    let jiti = crate::js::JitiOptions {
        force: true,
        aliases,
        extensions: Some(THEME_MODULE_EXTENSIONS.iter().map(|e| e.to_string()).collect()),
        ..Default::default()
    };
    let ns = s
        .import_jiti(Path::new(file), &crate::js::ImportOptions { jsx: true, fresh: true }, &jiti)
        .map_err(|e| e.message.clone())?;
    let keys = own_keys(s, &ns);
    let has_default = keys.iter().any(|k| k == "default");
    let default_export = if has_default { s.get(&ns, "default") } else { JsValue::undefined() };
    if is_theme_object(s, &default_export) {
        return Ok(Loaded { theme: default_export.as_object().unwrap().clone(), export_name: "default".into() });
    }
    for k in &keys {
        if k == "default" || k == "module.exports" {
            continue;
        }
        let v = s.get(&ns, k);
        if is_theme_object(s, &v) {
            return Ok(Loaded { theme: v.as_object().unwrap().clone(), export_name: k.clone() });
        }
    }
    if is_plain_object(s, &default_export) {
        return Ok(Loaded { theme: default_export.as_object().unwrap().clone(), export_name: "default".into() });
    }
    Err(format!(
        "Could not find a defineTheme() result in {file}.\nExpected an export like: export const myTheme = defineTheme({{ name: '...', tokens: {{...}} }})"
    ))
}

// ---------------------------------------------------------------------------

const THEME_MODULE_EXTENSIONS: [&str; 10] = [".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx", ".mjs", ".cjs", ".js", ".json"];

const INPUT_ONLY_FIELDS: [&str; 9] = ["extends", "typography", "motion", "radius", "color", "syntax", "onDark", "onLight", "adaptations"];

fn generated_header(source: &str, lang: &str, command: &str, cli: &str, core: &str) -> String {
    let body = [
        "@generated by `astryx theme build` \u{2014} do not edit manually.".to_string(),
        format!("Source: {source}"),
        format!("Command: {command}"),
        format!("CLI: @astryxdesign/cli@{cli}"),
        format!("Core: @astryxdesign/core@{core}"),
    ];
    if lang == "css" {
        format!("/*\n * {}\n */\n\n", body.join("\n * "))
    } else {
        format!("/**\n * {}\n */\n\n", body.join("\n * "))
    }
}

fn normalize_for_compare(content: &str) -> String {
    content
        .split('\n')
        .filter(|line| {
            let t = line.trim_start_matches([' ', '\t']);
            let t = t.strip_prefix('*').unwrap_or(t);
            let t = t.strip_prefix(' ').unwrap_or(t);
            !t.starts_with("Command:")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

struct Write {
    dest: String,
    content: String,
    allow_missing_in_check: bool,
}

const OUT_REMEDY: &str = "Pass an --out path inside it.";
const SOURCE_REMEDY: &str = "Without --out the outputs go beside the theme file, so run the build from a directory that contains the theme file, or pass an --out path inside the working directory.";

fn real_or_self(p: &str) -> String {
    std::fs::canonicalize(p).map(|x| x.to_string_lossy().into_owned()).unwrap_or_else(|_| p.to_string())
}

fn real_location(target: &str) -> String {
    let mut missing: Vec<String> = Vec::new();
    let mut existing = target.to_string();
    while !Path::new(&existing).exists() {
        let parent = nodepath::dirname(&existing);
        if parent == existing {
            break;
        }
        missing.insert(0, nodepath::basename(&existing));
        existing = parent;
    }
    let mut parts = vec![real_or_self(&existing)];
    parts.extend(missing);
    let refs: Vec<&str> = parts.iter().map(|s| s.as_str()).collect();
    nodepath::join(&refs)
}

fn confine_output(dest: &str, root: &str, remedy: &str, shown: &str) -> Result<(), ApiError> {
    let r = real_or_self(&nodepath::resolve(root, &[root]));
    match nodepath::assert_within(&real_location(dest), &r, "output path", true) {
        Ok(_) => Ok(()),
        Err(e) => Err(err(
            if e.code == "ERR_PATH_TRAVERSAL" {
                format!("Output path \"{shown}\" is outside the working directory ({root}). {remedy}")
            } else {
                e.message
            },
            "ERR_PATH_TRAVERSAL",
        )),
    }
}

fn refused_output(dest: &str, root: &str) -> bool {
    confine_output(dest, root, "", dest).is_err()
}

fn common_directory(dirs: &[String]) -> Option<String> {
    let mut common = dirs.first()?.clone();
    for dir in &dirs[1..] {
        loop {
            let rel = nodepath::relative("/", &common, dir);
            if !(rel.starts_with("..") || rel.starts_with('/')) {
                break;
            }
            let parent = nodepath::dirname(&common);
            if parent == common {
                return None;
            }
            common = parent;
        }
    }
    Some(common)
}

fn shell_word(v: &str) -> String {
    if !v.is_empty() && v.chars().all(|c| c.is_ascii_alphanumeric() || "@%+=:,./_-".contains(c)) {
        return v.to_string();
    }
    format!("'{}'", v.replace('\'', "'\\''"))
}

/// `outsideCheckRemedy`: `paths` are absolute files the args name (made
/// relative to the directory to run from); `extra` follows them verbatim.
pub fn outside_check_remedy(dests: &[String], sources: &[String], root: &str, paths: &[String], extra: &[String]) -> Option<Vec<String>> {
    if !dests.iter().any(|d| refused_output(d, root)) {
        return None;
    }
    let real = |f: &str| real_location(&nodepath::resolve(root, &[f]));
    let mut dirs: Vec<String> = sources.iter().map(|f| nodepath::dirname(&real(f))).collect();
    dirs.extend(dests.iter().map(|d| nodepath::dirname(&real(d))));
    let Some(dir) = common_directory(&dirs) else {
        return Some(vec!["These outputs are outside the working directory, so a build here refuses them. Build and check them from one directory that contains the theme files and the outputs.".into()]);
    };
    let command = |more: &[&str]| {
        let mut words: Vec<String> = vec!["theme".into(), "build".into()];
        for p in paths {
            if p.starts_with('/') {
                words.push(nodepath::relative(&dir, &dir, &real(p)));
            } else {
                words.push(p.clone());
            }
        }
        words.extend(extra.iter().cloned());
        words.extend(more.iter().map(|m| m.to_string()));
        let cmd = words.iter().map(|w| shell_word(w)).collect::<Vec<_>>().join(" ");
        format_cli_command(&dir, &cmd)
    };
    Some(vec![
        "These outputs are outside the working directory, so a build here refuses them, and each output records the directory it was built from. Build and check them from a directory that contains them:".into(),
        format!("  cd {}", shell_word(&dir)),
        format!("  {}", command(&[])),
        format!("  {}", command(&["--check"])),
    ])
}

fn write_outputs(writes: &[Write]) -> Result<(), ApiError> {
    for w in writes {
        if let Some(parent) = Path::new(&w.dest).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&w.dest, &w.content).map_err(|e| {
            err(
                format!("Failed to write theme outputs: {}", crate::commands::theme_build::palette::generate::node_error_message(&e, "open", &w.dest)),
                "ERR_WRITE_FAILED",
            )
        })?;
    }
    Ok(())
}

/// One theme, built (or checked). `Ok(None)`: the theme produced no CSS.
#[allow(clippy::too_many_arguments)]
pub fn theme_build_internal(
    file: &str,
    opts: &BuildOptions,
    cwd: &str,
    cli_root: &str,
    log: &mut Logger,
    compact: bool,
    trailers: Option<&mut Vec<Trailer>>,
    private_var_error: &mut bool,
) -> Result<Option<Value>, ApiError> {
    let file_path = nodepath::resolve(cwd, &[file]);
    if !Path::new(&file_path).exists() {
        return Err(err(format!("File not found: {file_path}"), "ERR_FILE_NOT_FOUND"));
    }
    let rel_source = nodepath::relative(cwd, cwd, &file_path);
    if !compact {
        log.log(&format!("\nBuilding theme from {rel_source}..."));
    }
    let source = if compact { format!("{rel_source}: ") } else { String::new() };

    let (core, theme_js, theme) = with_live(|s| -> Result<(Core, JsValue, Value), ApiError> {
        let core = select_core(s, cwd, cli_root)?;

        // Load the theme.
        let before = std::fs::read_to_string(&file_path).unwrap_or_default();
        // A theme whose own folder cannot resolve Core is handed the Core this
    // build selected (jiti virtualModules in the JS CLI).
    let resolves_core = crate::discovery::paths::find_installed_package(&nodepath::dirname(&file_path), "@astryxdesign/core", usize::MAX).is_some();
    let mut aliases = Vec::new();
    if !resolves_core {
        if let Some(dir) = core.dir.as_deref() {
            if let Some(f) = import_target(dir, "./theme") {
                aliases.push(("@astryxdesign/core/theme".to_string(), std::path::PathBuf::from(f)));
            }
            if let Some(f) = import_target(dir, ".") {
                aliases.push(("@astryxdesign/core".to_string(), std::path::PathBuf::from(f)));
            }
        }
    }
    let loaded = load_theme(s, &file_path, aliases).map_err(|m| {
            err(
                format!("Failed to load theme from {file_path}: {m}\nMake sure all imports in the theme file are resolvable."),
                "ERR_THEME_LOAD",
            )
        })?;
        let after = std::fs::read_to_string(&file_path).unwrap_or_default();
        if before != after || before.is_empty() {
            return Err(err(format!("{file_path} changed while it was loading. Build again once it is saved."), "ERR_THEME_LOAD"));
        }
        let theme_js: JsValue = loaded.theme.clone().into();
        let theme = s.to_value(&theme_js).map_err(|m| err(m, "ERR_THEME_LOAD"))?;
        Ok((core, theme_js, theme))
    })?;
    let name_v = theme.get("name");
    if !truthy(name_v) {
        return Err(err("Theme must have a name property.", "ERR_THEME_INVALID"));
    }
    let name = match name_v {
        Some(Value::String(n)) => n.clone(),
        Some(v) => crate::cli::format::js_string(v),
        None => String::new(),
    };
    sanitize_name(&name).map_err(|m| err(m, "ERR_PATH_TRAVERSAL"))?;

    let has_icons = key_count(theme.get("icons")) > 0 || key_count(theme.get("extends").and_then(|e| e.get("icons"))) > 0;
    if has_icons {
        return Err(err("theme build: icon registries are not ported yet", "ERR_THEME_INVALID"));
    }

    let mut warnings: Vec<String> = Vec::new();
    for w in super::validate::component_override_warnings(&theme, cli_root) {
        log.warn(&format!("  [warn] {source}{w}"));
        warnings.push(w);
    }
    let private_errors = super::validate::private_vars(&theme);
    for e in &private_errors {
        warnings.push(e.clone());
        log.warn(&format!("  [error] {source}{e}"));
    }
    if !private_errors.is_empty() {
        *private_var_error = true;
        log.warn(&format!("\n  {source}{} private var error(s). Use standard CSS properties instead.", private_errors.len()));
    }
    let mut heading_errors = super::validate::custom_heading_types_errors(&theme);
    heading_errors.extend(super::validate::heading_augmentation_support(&theme, cli_root));
    if !heading_errors.is_empty() {
        return Err(err(heading_errors.join("\n"), "ERR_THEME_INVALID"));
    }

    // Resolve through Core's defineTheme when the export is raw input.
    let (resolved_js, resolved) = with_live(|s| -> Result<(JsValue, Value), ApiError> {
        let needs_resolution = INPUT_ONLY_FIELDS.iter().any(|f| !is_undef(theme.get(*f)))
            || (theme.as_object().map(|m| m.contains_key("localTokens")).unwrap_or(false) && is_undef(theme.get("__localTokenLineage")));
        let resolved_js: JsValue = if needs_resolution {
            let object = s.global("Object");
            let assign = object.as_object().map(|o| s.get(&o, "assign")).unwrap_or_default();
            let empty = boa_engine::object::ObjectInitializer::new(s.ctx()).build();
            let copy = s.call(&assign, &[empty.into(), theme_js.clone()]).unwrap_or_default();
            let define = s.get(&core.ns, "defineTheme");
            s.call(&define, &[copy]).map_err(|e| err(s.error_message(&e).unwrap_or_else(|| "Theme normalization failed.".into()), "ERR_THEME_INVALID"))?
        } else {
            theme_js.clone()
        };
        let resolved = s.to_value(&resolved_js).map_err(|m| err(m, "ERR_THEME_INVALID"))?;
        Ok((resolved_js, resolved))
    })?;
    let enrollment = super::validate::adaptation_enrollment_errors(&resolved, cli_root);
    if !enrollment.is_empty() {
        return Err(err(enrollment.join("\n"), "ERR_THEME_INVALID"));
    }
    let (css_parts, component, on_media, dropped_list) = with_live(|s| -> Result<(Vec<String>, Vec<String>, String, Vec<String>), ApiError> {

        let scope = format!("[data-astryx-theme=\"{name}\"]");
        let scope_to = "[data-astryx-theme]";
        let dropped = s.new_array();
        let gen = s.get(&core.ns, "generateThemeRulesSplit");
        let rules = s
            .call(&gen, &[resolved_js.clone(), dropped.clone()])
            .map_err(|e| err(s.error_message(&e).unwrap_or_else(|| "Theme normalization failed.".into()), "ERR_THEME_INVALID"))?;
        let rules_obj = rules.as_object();
        let (component, prose) = match &rules_obj {
            Some(o) => {
                let c = s.get(o, "component");
                let p = s.get(o, "prose");
                (s.string_items(&c), s.string_items(&p))
            }
            None => (vec![], vec![]),
        };
        let mut css_parts: Vec<String> = Vec::new();
        if !prose.is_empty() {
            css_parts.push(format!("@layer reset {{\n@scope ({scope}) to ({scope_to}) {{\n{}\n}}\n}}", prose.join("\n\n")));
        }
        let adapt = s.get(&core.ns, "generateAdaptationCSS");
        let (adapt_component, adapt_prose) = if adapt.as_object().map(|o| o.is_callable()).unwrap_or(false) {
            let r = s
                .call(&adapt, &[resolved_js.clone(), dropped.clone()])
                .map_err(|e| err(s.error_message(&e).unwrap_or_else(|| "Theme normalization failed.".into()), "ERR_THEME_INVALID"))?;
            match r.as_object() {
                Some(o) => {
                    let c = s.get(&o, "component");
                    let p = s.get(&o, "prose");
                    (s.string(&c), s.string(&p))
                }
                None => (String::new(), String::new()),
            }
        } else {
            (String::new(), String::new())
        };
        let component_scope = if component.is_empty() {
            String::new()
        } else {
            format!("@scope ({scope}) to ({scope_to}) {{\n{}\n}}", component.join("\n\n"))
        };
        let own_values = {
            let mut list = vec![
                resolved.get("tokens").cloned().filter(|v| !is_undef(Some(v))).unwrap_or(Value::Object(Map::new())),
                resolved.get("localTokens").cloned().filter(|v| !is_undef(Some(v))).unwrap_or(Value::Object(Map::new())),
                resolved.get("components").cloned().filter(|v| !is_undef(Some(v))).unwrap_or(Value::Object(Map::new())),
            ];
            if let Some(Value::Array(rules)) = resolved.get("__adaptationRules") {
                for r in rules {
                    for k in ["tokens", "localTokens", "components"] {
                        list.push(r.get(k).cloned().filter(|v| !is_undef(Some(v))).unwrap_or(Value::Object(Map::new())));
                    }
                }
            }
            crate::js::to_json_data(&Value::Array(list)).map(|v| json::stringify(&v, 0)).unwrap_or_default()
        };
        let color_scheme = if own_values.contains("light-dark(") || adapt_component.contains("light-dark(") {
            "  :root { color-scheme: light dark; }\n  html[data-theme=\"light\"] { color-scheme: light; }\n  html[data-theme=\"dark\"] { color-scheme: dark; }\n\n"
        } else {
            ""
        };
        if !color_scheme.is_empty() || !component_scope.is_empty() {
            css_parts.push(format!("@layer astryx-theme {{\n{color_scheme}{component_scope}\n}}"));
        }
        if !adapt_prose.is_empty() {
            css_parts.push(format!("@layer reset {{\n{adapt_prose}\n}}"));
        }
        if !adapt_component.is_empty() {
            css_parts.push(format!("@layer astryx-theme {{\n{adapt_component}\n}}"));
        }
        let on_media_fn = s.get(&core.ns, "generateOnMediaCSS");
        let mut on_media = String::new();
        if on_media_fn.as_object().map(|o| o.is_callable()).unwrap_or(false) {
            let r = s.call(&on_media_fn, &[resolved_js.clone(), dropped.clone()]).unwrap_or_default();
            on_media = s.string(&r);
            if r.is_undefined() || r.is_null() {
                on_media.clear();
            }
            if !on_media.is_empty() {
                css_parts.push(format!("@layer astryx-theme {{\n{on_media}\n}}"));
            }
        }
        let dropped_list = s.string_items(&dropped);
        Ok((css_parts, component, on_media, dropped_list))
    })?;
    let mut css_parts = css_parts;
    for m in dropped_list {
        let w = format!("Declaration {m}. The generated CSS omits it; fix the value in the theme source.");
        log.warn(&format!("  [warn] {source}{w}"));
        warnings.push(w);
    }
    let unemitted = super::validate::heading_types_without_rule(&super::validate::custom_heading_types(&theme), &format!("{}\n{}", component.join("\n"), on_media));
    if !unemitted.is_empty() {
        return Err(err(
            unemitted
                .iter()
                .map(|t| format!("Custom Heading type \"{t}\" has no declaration the theme compiler could emit: every declaration in its standalone \"type:{t}\" rule was dropped. Give that rule at least one valid declaration."))
                .collect::<Vec<_>>()
                .join("\n"),
            "ERR_THEME_INVALID",
        ));
    }
    if css_parts.is_empty() {
        log.log(&format!("{source}No overrides found; nothing to build."));
        return Ok(None);
    }
    css_parts.insert(0, "@layer reset, astryx-base, astryx-theme;".into());
    let css = css_parts.join("\n\n") + "\n";

    let out_rel = opts.out.as_ref().map(|o| nodepath::relative(cwd, cwd, &nodepath::resolve(cwd, &[o])));
    let build_command = format!("astryx theme build {rel_source}{}", out_rel.as_ref().map(|o| format!(" --out {o}")).unwrap_or_default());
    let cli_version = read_pkg_version(Some(cli_root));
    let core_version = read_pkg_version(crate::discovery::paths::find_core_dir(cwd).as_deref());

    let out_path = match &opts.out {
        Some(o) => {
            let p = nodepath::resolve(cwd, &[o]);
            if !opts.check || !o.starts_with('/') {
                confine_output(&p, cwd, OUT_REMEDY, o)?;
            }
            p
        }
        None => nodepath::join(&[&nodepath::dirname(&file_path), &format!("{name}.css")]),
    };
    let display = &resolved;
    let token_count = key_count(display.get("tokens")) + key_count(display.get("localTokens"));
    let component_count = key_count(display.get("components"));
    let size = super::fmt::to_fixed(css.len() as f64 / 1024.0, 1);

    let out_dir = nodepath::dirname(&out_path);
    let css_dts_path = format!("{out_path}.d.ts");
    let js_path = nodepath::join(&[&out_dir, &format!("{name}.js")]);
    let dts_path = nodepath::join(&[&out_dir, &format!("{name}.d.ts")]);

    let variant_decl = super::module::variant_declarations(&resolved, cli_root);
    let variants_file = variant_decl.as_ref().map(|_| format!("{name}.variants.d.ts"));
    let variant_path = variants_file.as_ref().map(|f| nodepath::join(&[&out_dir, f]));
    let header = |lang: &str| generated_header(&rel_source, lang, &build_command, &cli_version, &core_version);
    let css_content = header("css") + &css;
    let css_dts_content = header("ts") + "export {};\n";
    let js_content = header("js") + &super::module::built_module(&resolved, &format_cli_command(cwd, ""))?;
    let dts_content = header("ts") + &super::module::built_types(&resolved, variants_file.as_deref());

    let mut unloaded = super::fonts::collect_unloaded_fonts(&resolved);
    for v in super::validate::adaptation_rule_values(&resolved) {
        for f in super::fonts::collect_unloaded_fonts(&v) {
            if !unloaded.contains(&f) {
                unloaded.push(f);
            }
        }
    }

    let mut writes = vec![
        Write { dest: out_path.clone(), content: css_content, allow_missing_in_check: false },
        Write { dest: css_dts_path.clone(), content: css_dts_content, allow_missing_in_check: true },
        Write { dest: js_path.clone(), content: js_content, allow_missing_in_check: false },
        Write { dest: dts_path.clone(), content: dts_content, allow_missing_in_check: false },
    ];
    if let (Some(p), Some(d)) = (&variant_path, &variant_decl) {
        writes.push(Write { dest: p.clone(), content: header("ts") + d, allow_missing_in_check: false });
    }
    if !opts.check {
        let remedy = if opts.out.is_some() { OUT_REMEDY } else { SOURCE_REMEDY };
        for w in &writes {
            confine_output(&w.dest, cwd, remedy, &w.dest)?;
        }
    }
    let rel = |p: &str| nodepath::relative(cwd, cwd, p);
    if opts.check {
        let mut stale: Vec<Value> = Vec::new();
        for w in &writes {
            let r = rel(&w.dest);
            if !Path::new(&w.dest).exists() {
                if !w.allow_missing_in_check {
                    stale.push(serde_json::json!({"path": r, "reason": "missing"}));
                }
                continue;
            }
            let on_disk = std::fs::read_to_string(&w.dest).unwrap_or_default();
            if normalize_for_compare(&on_disk) != normalize_for_compare(&w.content) {
                stale.push(serde_json::json!({"path": r, "reason": "outdated"}));
            }
        }
        let up_to_date = stale.is_empty();
        if up_to_date {
            log.log(&format!("\n[ok] Theme outputs are up to date with {rel_source}."));
        } else {
            log.warn(&format!("\n[fail] {} theme output(s) are out of date with {rel_source}:", stale.len()));
            for st in &stale {
                let reason = if st["reason"] == "missing" { "missing" } else { "stale" };
                log.warn(&format!("  {reason}: {}", st["path"].as_str().unwrap_or_default()));
            }
            let mut args = vec![file_path.clone()];
            if opts.out.is_some() {
                args.push("--out".into());
                args.push(out_path.clone());
            }
            let icons = opts.icons_specifier.clone().map(|i| vec!["--icons-specifier".to_string(), i]).unwrap_or_default();
            let dests: Vec<String> = writes.iter().map(|w| w.dest.clone()).collect();
            match outside_check_remedy(&dests, &[file_path.clone()], cwd, &args, &icons) {
                Some(lines) => log.warn(&format!("\n  {}", lines.join("\n  "))),
                None => log.warn(&format!("\n  Rebuild with: {build_command}")),
            }
        }
        let checked: Vec<Value> = writes
            .iter()
            .filter(|w| !w.allow_missing_in_check || Path::new(&w.dest).exists())
            .map(|w| Value::String(rel(&w.dest)))
            .collect();
        return Ok(Some(serde_json::json!({
            "type": "theme.build.check",
            "data": {"name": name, "upToDate": up_to_date, "stale": stale, "checked": checked}
        })));
    }
    write_outputs(&writes)?;
    if !compact {
        log.log(&format!("\n[ok] {}", rel(&out_path)));
        log.log(&format!("[ok] {}", rel(&css_dts_path)));
        log.log(&format!("  {token_count} token overrides, {component_count} component overrides"));
        log.log(&format!("  {size} KB"));
        log.log(&format!("[ok] {}", rel(&js_path)));
        log.log(&format!("[ok] {}", rel(&dts_path)));
        if let (Some(p), Some(d)) = (&variant_path, &variant_decl) {
            log.log(&format!("[ok] {} ({} type augmentations)", rel(p), d.matches("': true;").count()));
        }
    }
    let rel_out_dir = {
        let r = rel(&out_dir);
        if r.is_empty() {
            ".".to_string()
        } else {
            r
        }
    };
    let css_base = {
        let b = nodepath::basename(&out_path);
        b.strip_suffix(".css").map(String::from).unwrap_or(b)
    };
    let export_name = format!("{}Theme", to_identifier(&name));
    let font_notices: Vec<String> = unloaded
        .iter()
        .map(|f| format!("Font \"{f}\" is named by this theme but not loaded; add a <link> or @font-face in your app (recipe: astryx docs typography)"))
        .collect();
    let trailer = Trailer {
        theme_name: name.clone(),
        export_name,
        js_import: import_specifier(&rel_out_dir, &name),
        css_import: import_specifier(&rel_out_dir, &css_base) + ".css",
        unloaded_fonts: unloaded.clone(),
        font_notices: font_notices.clone(),
    };
    match trailers {
        Some(t) => t.push(trailer),
        None => print_build_trailer(log, &trailer, cwd),
    }
    let mut outputs = Map::new();
    outputs.insert("css".into(), Value::String(rel(&out_path)));
    outputs.insert("cssDts".into(), Value::String(rel(&css_dts_path)));
    outputs.insert("js".into(), Value::String(rel(&js_path)));
    outputs.insert("dts".into(), Value::String(rel(&dts_path)));
    if let Some(p) = &variant_path {
        outputs.insert("variantsDts".into(), Value::String(rel(p)));
    }
    let mut data = Map::new();
    data.insert("name".into(), Value::String(name));
    data.insert("tokenCount".into(), Value::from(token_count));
    data.insert("componentCount".into(), Value::from(component_count));
    data.insert("sizeKB".into(), json::num(size.parse::<f64>().unwrap_or(0.0)));
    data.insert("outputs".into(), Value::Object(outputs));
    data.insert("warnings".into(), Value::Array(warnings.into_iter().map(Value::String).collect()));
    data.insert("notices".into(), Value::Array(font_notices.into_iter().map(Value::String).collect()));
    let mut r = Map::new();
    r.insert("type".into(), Value::String("theme.build".into()));
    r.insert("data".into(), Value::Object(data));
    Ok(Some(Value::Object(r)))
}

fn install_snippet(t: &Trailer) -> String {
    format!(
        "\nInstall in your app (paths are relative to a file in src/; adjust if yours lives elsewhere):\n\n  import {{ Theme }} from '@astryxdesign/core/theme';\n  import {{ {e} }} from '{j}';\n  import '{c}';\n\n  <Theme theme={{{e}}}>\n    <App />\n  </Theme>\n\nOr with a <link> tag:\n\n  import {{ Theme }} from '@astryxdesign/core/theme';\n  import {{ {e} }} from '{j}';\n\n  <link rel=\"stylesheet\" href=\"{c}\" />\n  <Theme theme={{{e}}}>\n    <App />\n  </Theme>\n",
        e = t.export_name,
        j = t.js_import,
        c = t.css_import
    )
}

fn print_build_trailer(log: &mut Logger, t: &Trailer, cwd: &str) {
    log.log(&install_snippet(t));
    for m in &t.font_notices {
        log.log(&format!("  note: {m}"));
    }
    if !t.unloaded_fonts.is_empty() {
        log.log(&super::fonts::font_loading_help(&t.theme_name, &t.unloaded_fonts, cwd));
    }
}

fn group_unloaded_fonts(trailers: &[Trailer]) -> Vec<(String, Vec<String>)> {
    let mut groups: Vec<(String, String, Vec<String>)> = Vec::new();
    for t in trailers {
        for f in &t.unloaded_fonts {
            let key = f.to_lowercase();
            match groups.iter_mut().find(|g| g.0 == key) {
                Some(g) => g.2.push(t.theme_name.clone()),
                None => groups.push((key, f.clone(), vec![t.theme_name.clone()])),
            }
        }
    }
    groups.into_iter().map(|(_, f, t)| (f, t)).collect()
}

pub fn print_batch_trailer(log: &mut Logger, trailers: &[Trailer], cwd: &str) {
    let Some(first) = trailers.first() else { return };
    log.log(&install_snippet(first));
    if trailers.len() > 1 {
        log.log("Each built theme imports the same way:");
        for t in trailers {
            log.log(&format!("  import {{ {} }} from '{}'; import '{}';", t.export_name, t.js_import, t.css_import));
        }
    }
    let fonts = group_unloaded_fonts(trailers);
    if !fonts.is_empty() {
        log.log(&super::fonts::batch_font_loading_help(&fonts, cwd));
    }
}

pub fn print_compact_trailer(log: &mut Logger, trailers: &[Trailer], hint: bool, cwd: &str) {
    if trailers.is_empty() {
        return;
    }
    let fonts = group_unloaded_fonts(trailers);
    if !fonts.is_empty() {
        let named: Vec<String> = fonts
            .iter()
            .map(|(f, themes)| if trailers.len() > 1 { format!("\"{f}\" ({})", themes.join(", ")) } else { format!("\"{f}\"") })
            .collect();
        log.log(&format!(
            "[note] Fonts named but not loaded: {}. Load them in your app (recipe: {}).",
            named.join(", "),
            format_cli_command(cwd, "docs typography")
        ));
    }
    if hint {
        log.log("Run with --detail full for the install example and font recipe.");
    }
}

/// Whether `--detail` was given on the command line.
pub fn detail_chosen(inv: &Invocation) -> bool {
    for a in &inv.argv {
        if a == "--" {
            break;
        }
        if a == "--detail" || a.starts_with("--detail=") {
            return true;
        }
    }
    false
}

/// The action's non-watch, non-family path: build each theme in order.
pub fn run(inv: &Invocation, out: &mut Out, files: &[String]) -> CmdResult {
    let json = inv.json();
    let cwd = inv.cwd.to_string_lossy().into_owned();
    let cli_root = inv.cli_root.to_string_lossy().into_owned();
    let chosen = detail_chosen(inv);
    let compact = !chosen || inv.globals.detail != "full";
    let check = inv.flag("check");
    let opts = BuildOptions {
        out: inv.opt_str("out").map(String::from),
        check,
        icons_specifier: inv.opt_str("iconsSpecifier").map(String::from),
    };
    let report = !json && !check && (files.len() > 1 || compact);
    let mut trailers: Vec<Trailer> = Vec::new();
    let mut results: Vec<(String, Option<Value>)> = Vec::new();
    let mut stale = false;
    let mut private_var_error = false;
    let mut failure: Option<(String, ApiError)> = None;
    {
        for file in files {
            let mut log = Logger { out: &mut *out, silent: json };
            let r = theme_build_internal(
                file,
                &opts,
                &cwd,
                &cli_root,
                &mut log,
                report && compact,
                if report { Some(&mut trailers) } else { None },
                &mut private_var_error,
            );
            match r {
                Ok(receipt) => {
                    if report && compact {
                        if let Some(rc) = &receipt {
                            if rc["type"] == "theme.build" {
                                let d = &rc["data"];
                                log.out.emit(&[text(&format!(
                                    "[ok] {} ({} KB, {} token overrides, {} component overrides)",
                                    d["outputs"]["css"].as_str().unwrap_or_default(),
                                    json::stringify(&d["sizeKB"], 0),
                                    d["tokenCount"],
                                    d["componentCount"]
                                ))]);
                            }
                        }
                    }
                    if check {
                        if let Some(rc) = &receipt {
                            if rc["type"] == "theme.build.check" && rc["data"]["upToDate"] == false {
                                stale = true;
                            }
                        }
                    }
                    results.push((file.clone(), receipt));
                }
                Err(e) => {
                    failure = Some((file.clone(), e));
                    break;
                }
            }
        }
    }
    let mut log = Logger { out: &mut *out, silent: json };
    if let Some((file, e)) = failure {
        if report && compact {
            print_compact_trailer(&mut log, &trailers, false, &cwd);
        } else if report {
            print_batch_trailer(&mut log, &trailers, &cwd);
        }
        let message = if files.len() > 1 { format!("{file}: {}", e.message) } else { e.message };
        return out.cli_error(&message, ErrorOpts::code(e.code));
    }
    if json {
        if files.len() == 1 {
            if let Some(Some(r)) = results.first().map(|r| r.1.clone()) {
                out.json_out_response(&r);
            }
        } else {
            let list: Vec<Value> = results
                .iter()
                .map(|(f, r)| serde_json::json!({"file": f, "receipt": r.clone().unwrap_or(Value::Null)}))
                .collect();
            let mut data = Map::new();
            data.insert("count".into(), Value::from(results.len()));
            data.insert("results".into(), Value::Array(list));
            out.json_out("theme.build.batch", None, Value::Object(data), None);
        }
    } else if report && compact {
        print_compact_trailer(&mut log, &trailers, !chosen, &cwd);
    } else if report {
        print_batch_trailer(&mut log, &trailers, &cwd);
    }
    if !json && files.len() > 1 {
        out.emit(&[text(&if check {
            format!("\n{} Checked {} themes.", if stale { "[fail]" } else { "[ok]" }, files.len())
        } else {
            format!("\n[ok] Built {} themes.", files.len())
        })]);
    }
    if private_var_error || (check && stale) {
        out.exit_code = 1;
    }
    Ok(())
}
