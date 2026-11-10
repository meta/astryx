//! `astryx experimental render`: port of `clients/cli/commands/experimental/
//! render.mjs` and `api/render/render.mjs` (argument checks, reading the
//! input, the output's confinement). Rendering itself is not cloned yet.

pub mod charts;
pub mod css;
pub mod page;
pub mod rebuild;
pub mod reverse;
pub mod texts;
pub mod ts_paths;
pub mod worker;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out, Suggestion};
use crate::discovery::nodepath as np;

pub const PAGE_EXTENSIONS: [&str; 5] = [".tsx", ".jsx", ".ts", ".js", ".mjs"];

const ASSET_EXTS: [&str; 17] = [
    "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp", "woff", "woff2", "ttf", "otf", "mp4", "webm",
    "mp3", "wav",
];

pub struct RenderError {
    pub message: String,
    pub suggestions: Vec<Suggestion>,
    pub code: &'static str,
}

pub(crate) fn err(message: impl Into<String>, suggestions: Vec<Suggestion>, code: &'static str) -> RenderError {
    RenderError { message: message.into(), suggestions, code }
}

pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let file = inv.arg(0).unwrap_or("");
    let cwd = inv.cwd.to_string_lossy().to_string();
    let opts = RenderOptions {
        out: inv.opt_str("out").map(String::from),
        reverse: inv.flag("reverse"),
        title: inv.opt_str("title").map(String::from),
        overwrite: inv.flag("overwrite"),
    };
    match render(file, &cwd, &opts) {
        Ok((kind, data)) => {
            if inv.json() {
                out.json_out(kind, None, data, None);
            } else {
                print_result(out, kind, &data, &inv.cwd);
            }
            Ok(())
        }
        Err(e) => out.cli_error(&e.message, ErrorOpts::code(&e.code).suggestions(e.suggestions)),
    }
}

fn kb(n: u64) -> String {
    if n < 1024 {
        format!("{n} B")
    } else {
        format!("{} KB", page::to_fixed1(n as f64 / 1024.0))
    }
}

fn print_result(out: &mut Out, kind: &str, d: &crate::json::Value, cwd: &std::path::Path) {
    use crate::cli::format::{list, record, section, text, Field};
    let s = |k: &str| d.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let strs = |k: &str| -> Vec<String> {
        d.get(k).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
    };
    let n = |k: &str| d.get(k).and_then(|v| v.as_u64()).unwrap_or(0);
    if kind == "render.page" {
        let sheets = strs("stylesheets").join(", ");
        let fields: Vec<(String, Field)> = vec![
            ("input".into(), Field::Str(s("input"))),
            ("output".into(), Field::Str(s("output"))),
            ("bytes".into(), Field::Str(kb(n("bytes")))),
            ("cssBytes".into(), Field::Str(kb(n("cssBytes")))),
            ("classes".into(), Field::Str(n("classes").to_string())),
            ("images".into(), Field::Str(n("images").to_string())),
            ("files".into(), Field::Str(strs("files").join(", "))),
            ("stylesheets".into(), Field::Str(if sheets.is_empty() { "none".into() } else { sheets })),
        ];
        let mut blocks = vec![section(&format!("Rendered {}", s("input")), None), record(&fields)];
        let warnings: Vec<String> = d
            .get("warnings")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().map(|w| w["message"].as_str().unwrap_or("").to_string()).collect())
            .unwrap_or_default();
        if !warnings.is_empty() {
            blocks.push(section("Warnings", None));
            blocks.push(list(&warnings));
        }
        blocks.push(text(&format!(
            "Give it back: {} experimental render --reverse {}",
            crate::cli::env::cli_invocation(cwd),
            s("output")
        )));
        out.emit(&blocks);
        return;
    }
    let mode = s("mode");
    let rebuilt = mode == "rebuilt";
    let mut fields: Vec<(String, Field)> = vec![
        ("input".into(), Field::Str(s("input"))),
        ("mode".into(), Field::Str(mode.clone())),
        ("exact".into(), Field::Str(d.get("exact").map(crate::cli::format::js_string).unwrap_or_default())),
        ("output".into(), Field::Str(s("output"))),
        ("files".into(), Field::Str(strs("files").join(", "))),
    ];
    if !strs("missing").is_empty() {
        fields.push(("missing".into(), Field::Str(strs("missing").join(", "))));
    }
    if rebuilt {
        let comps = strs("components").join(", ");
        fields.push(("components".into(), Field::Str(if comps.is_empty() { "none".into() } else { comps })));
        fields.push(("elements".into(), Field::Str(d.get("elements").map(crate::cli::format::js_string).unwrap_or_else(|| "0".into()))));
        if !strs("omitted").is_empty() {
            fields.push(("omitted".into(), Field::Str(strs("omitted").join(", "))));
        }
        if !strs("unknown").is_empty() {
            fields.push(("unknown".into(), Field::Str(strs("unknown").join(", "))));
        }
    }
    let mut blocks = vec![
        section(&if mode == "embedded" { format!("Restored {}", s("output")) } else { format!("Rebuilt {}", s("output")) }, None),
        record(&fields),
    ];
    if rebuilt {
        blocks.push(text("The file had no embedded source, so the page was rebuilt from its Astryx markup: text and layout only. Review it before use."));
    }
    out.emit(&blocks);
}

pub struct RenderOptions {
    pub out: Option<String>,
    pub reverse: bool,
    pub title: Option<String>,
    pub overwrite: bool,
}

fn is_html(p: &str) -> bool {
    let l = p.to_ascii_lowercase();
    l.ends_with(".html") || l.ends_with(".htm")
}

fn page_ext(p: &str) -> bool {
    PAGE_EXTENSIONS.contains(&np::extname(p).to_lowercase().as_str())
}

/// `shown(cwd, file)`: relative and `/`-joined inside cwd, else absolute.
pub fn shown(cwd: &str, file: &str) -> String {
    let rel = np::relative(cwd, file);
    if !rel.is_empty() && !rel.starts_with("..") && !np::is_absolute(&rel) {
        rel
    } else {
        file.to_string()
    }
}

fn render(file: &str, cwd: &str, o: &RenderOptions) -> Result<(&'static str, crate::json::Value), RenderError> {
    if file.trim().is_empty() {
        return Err(if o.reverse {
            err(
                "A rendered HTML file is required",
                vec![Suggestion::new(
                    "astryx experimental render --reverse page.html",
                    "turn a rendered file back into a page",
                )],
                "ERR_MISSING_ARGUMENT",
            )
        } else {
            err(
                "A page file is required",
                vec![Suggestion::new("astryx experimental render page.tsx", "render a page to one HTML file")],
                "ERR_MISSING_ARGUMENT",
            )
        });
    }
    let input = np::resolve(&[cwd, file]);
    let output = o.out.as_deref().filter(|s| !s.is_empty()).map(|s| np::resolve(&[cwd, s]));
    if output.as_deref() == Some(input.as_str()) {
        return Err(err("--out names the input file itself; choose another file", vec![], "ERR_INVALID_ARGUMENT"));
    }
    if o.reverse {
        if o.title.is_some() {
            return Err(err("--title applies only to rendering, not to --reverse", vec![], "ERR_INVALID_ARGUMENT"));
        }
        if !is_html(&input) {
            return Err(err(
                format!("--reverse reads a rendered .html file; {file} is not one"),
                vec![Suggestion::new(format!("astryx experimental render {file}"), "render the page instead")],
                "ERR_INVALID_ARGUMENT",
            ));
        }
        if let Some(out) = &output {
            if !page_ext(out) {
                return Err(err(
                    format!("--out for --reverse must be a page module ({})", PAGE_EXTENSIONS.join(", ")),
                    vec![],
                    "ERR_INVALID_ARGUMENT",
                ));
            }
            let base = np::basename(out);
            if let Some(reason) = embedded_path_problem(&base, true).or_else(|| embedded_path_problem(&base, false)) {
                return Err(err(
                    format!("--out for --reverse must name a page module, not {reason}"),
                    vec![],
                    "ERR_INVALID_ARGUMENT",
                ));
            }
        }
        return reverse::reverse_to_file(cwd, &input, output.as_deref(), o.overwrite).map(|d| ("render.reverse", d));
    }
    if !page_ext(&input) {
        return Err(if is_html(&input) {
            err(
                format!("{file} is already HTML; pass --reverse to turn it back into a page"),
                vec![Suggestion::new(format!("astryx experimental render --reverse {file}"), "turn it back into a page")],
                "ERR_INVALID_ARGUMENT",
            )
        } else {
            err(
                format!("render reads a page module ({}); {file} is not one", PAGE_EXTENSIONS.join(", ")),
                vec![],
                "ERR_INVALID_ARGUMENT",
            )
        });
    }
    if o.overwrite {
        return Err(err(
            "--overwrite applies only to --reverse; rendering replaces an existing HTML file only when a render wrote it",
            vec![],
            "ERR_INVALID_ARGUMENT",
        ));
    }
    if let Some(out) = &output {
        if !is_html(out) {
            return Err(err("--out must be an .html file", vec![], "ERR_INVALID_ARGUMENT"));
        }
    }
    let target = output.clone().unwrap_or_else(|| {
        let dot = input.rfind('.').unwrap_or(input.len());
        format!("{}.html", &input[..dot])
    });
    render_to_file(cwd, &input, &target, o.title.as_deref()).map(|d| ("render.page", d))
}

/// `renderToFile({cwd, input, output, title})`.
fn render_to_file(cwd: &str, input: &str, output: &str, title: Option<&str>) -> Result<crate::json::Value, RenderError> {
    use crate::json::{Map, Value};
    read_input(input, cwd)?;
    confined(output, cwd, "The output")?;
    let dir = np::dirname(input);
    let served = if crate::discovery::release::run_choice(&dir).in_project {
        None
    } else {
        crate::discovery::paths::require_core_dir(&dir).ok().map(|d| page::Served { dir: d, integrations: vec![] })
    };
    let root = {
        let mut d = dir.clone();
        loop {
            if np::exists(&np::join2(&d, "package.json")) {
                break d;
            }
            let up = np::dirname(&d);
            if up == d {
                break dir.clone();
            }
            d = up;
        }
    };
    let as_err = |e: page::RenderError| {
        let suggestions = match (&e.code[..], &e.package) {
            ("ERR_RENDER_MISSING_DEPENDENCY", Some(p)) => vec![Suggestion::new(format!("npm install {p}"), "install the package the page imports")],
            _ => vec![],
        };
        RenderError { message: e.message, suggestions, code: leak(&e.code) }
    };
    let msg = worker::run_worker(input, &root, served.as_ref(), 60_000).map_err(as_err)?;
    let rendered = page::render_page(input, title, &crate::cli::env::cli_version(), served.as_ref(), msg).map_err(as_err)?;
    refuse_symlinks(output, cwd)?;
    if let Ok(m) = std::fs::metadata(output) {
        if m.is_file() {
            let head: String = std::fs::read(output).map(|b| String::from_utf8_lossy(&b[..b.len().min(4096 * 4)]).chars().take(4096).collect()).unwrap_or_default();
            let ok = head.contains("<meta name=\"generator\" content=\"Astryx ") || head.contains("<meta name=\"generator\" content=\"Astryx\"");
            if !ok {
                return Err(err(
                    format!("{} already exists and was not written by a render, so it is not replaced; nothing was written. Choose another --out.", shown(cwd, output)),
                    vec![],
                    "ERR_FILE_EXISTS",
                ));
            }
        }
    }
    if let Some(parent) = std::path::Path::new(output).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(output, &rendered.html)
        .map_err(|e| err(format!("Could not write {}: {e}", shown(cwd, output)), vec![], "ERR_WRITE_FAILED"))?;
    let mut d = Map::new();
    d.insert("input".into(), Value::String(shown(cwd, input)));
    d.insert("output".into(), Value::String(shown(cwd, output)));
    d.insert("bytes".into(), Value::from(rendered.html.len()));
    d.insert("files".into(), Value::Array(rendered.files.iter().cloned().map(Value::String).collect()));
    d.insert("stylesheets".into(), Value::Array(rendered.stylesheets.iter().cloned().map(Value::String).collect()));
    d.insert("classes".into(), Value::from(rendered.classes));
    d.insert("cssBytes".into(), Value::from(rendered.css_bytes));
    d.insert("images".into(), Value::from(rendered.images));
    d.insert(
        "warnings".into(),
        Value::Array(
            rendered
                .warnings
                .iter()
                .map(|w| {
                    let mut m = Map::new();
                    m.insert("code".into(), Value::String(w.code.into()));
                    m.insert("message".into(), Value::String(w.message.clone()));
                    Value::Object(m)
                })
                .collect(),
        ),
    );
    Ok(Value::Object(d))
}

fn leak(s: &str) -> &'static str {
    Box::leak(s.to_string().into_boxed_str())
}

/// The symbolic-link half of `refuseProtected([output], cwd)`.
pub(crate) fn refuse_symlinks(file: &str, cwd: &str) -> Result<(), RenderError> {
    let mut current = cwd.to_string();
    for part in np::relative(cwd, file).split('/') {
        current = np::join2(&current, part);
        match std::fs::symlink_metadata(&current) {
            Err(_) => break,
            Ok(m) if m.file_type().is_symlink() => {
                return Err(err(
                    format!("{} is reached through a symbolic link ({}); nothing was written.", shown(cwd, file), shown(cwd, &current)),
                    vec![],
                    "ERR_PATH_TRAVERSAL",
                ))
            }
            _ => {}
        }
    }
    Ok(())
}


pub(crate) fn read_input(file: &str, cwd: &str) -> Result<Vec<u8>, RenderError> {
    match std::fs::metadata(file) {
        Ok(m) if m.is_file() => {
            std::fs::read(file).map_err(|_| err(format!("{} does not exist", shown(cwd, file)), vec![], "ERR_FILE_NOT_FOUND"))
        }
        _ => Err(err(format!("{} does not exist", shown(cwd, file)), vec![], "ERR_FILE_NOT_FOUND")),
    }
}

/// `assertWithin(file, cwd, {allowAbsolute: true})`, symlinks followed.
pub(crate) fn confined(file: &str, cwd: &str, what: &str) -> Result<String, RenderError> {
    let outside = || {
        err(
            format!(
                "{what} {} is outside the current folder; nothing was written. Write inside the folder you run the command from.",
                shown(cwd, file)
            ),
            vec![],
            "ERR_PATH_TRAVERSAL",
        )
    };
    let root = np::resolve1(cwd);
    let resolved = np::resolve(&[&root, file]);
    let inside = |r: &str, t: &str| t == r || t.starts_with(&if r.ends_with('/') { r.to_string() } else { format!("{r}/") });
    if !inside(&root, &resolved) {
        return Err(outside());
    }
    let real_root = canonical(&root);
    let real_target = canonical(&resolved);
    if !inside(&real_root, &real_target) {
        return Err(outside());
    }
    Ok(resolved)
}

/// Resolve every symlink on the path, dangling ones included: the longest
/// existing prefix is canonicalized and the rest appended.
fn canonical(p: &str) -> String {
    let path = std::path::Path::new(p);
    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    let mut cur = path.to_path_buf();
    for _ in 0..64 {
        if let Ok(meta) = std::fs::symlink_metadata(&cur) {
            if meta.file_type().is_symlink() {
                if let Ok(target) = std::fs::read_link(&cur) {
                    let parent = cur.parent().map(|x| x.to_path_buf()).unwrap_or_default();
                    cur = np::p(&np::resolve(&[&parent.to_string_lossy(), &target.to_string_lossy()])).to_path_buf();
                    continue;
                }
            }
            let base = std::fs::canonicalize(&cur).unwrap_or(cur.clone());
            let mut out = base;
            for seg in rest.iter().rev() {
                out.push(seg);
            }
            return out.to_string_lossy().to_string();
        }
        match (cur.parent(), cur.file_name()) {
            (Some(parent), Some(name)) => {
                rest.push(name.to_os_string());
                cur = parent.to_path_buf();
            }
            _ => break,
        }
    }
    p.to_string()
}

pub(crate) fn runner_picks_up_pub(segments: &[&str]) -> bool {
    runner_picks_up(segments)
}

fn runner_picks_up(segments: &[&str]) -> bool {
    let base = segments[segments.len() - 1];
    let lower = base.to_ascii_lowercase();
    let script_ext = |l: &str, jsx: bool| {
        let exts: &[&str] = if jsx {
            &[".js", ".jsx", ".ts", ".tsx", ".cjs", ".cjsx", ".cts", ".ctsx", ".mjs", ".mjsx", ".mts", ".mtsx"]
        } else {
            &[".js", ".ts", ".cjs", ".cts", ".mjs", ".mts"]
        };
        exts.iter().any(|e| l.ends_with(e))
    };
    if !script_ext(&lower, true) {
        return false;
    }
    let stem = match base.rfind('.') {
        Some(i) => base[..i].to_lowercase(),
        None => base.to_lowercase(),
    };
    // (^|[._-])(test|spec)+$
    let mut s = stem.as_str();
    let mut stripped = false;
    loop {
        if let Some(r) = s.strip_suffix("test").or_else(|| s.strip_suffix("spec")) {
            s = r;
            stripped = true;
        } else {
            break;
        }
    }
    if stripped && (s.is_empty() || s.ends_with(['.', '_', '-'])) {
        return true;
    }
    for suf in [".bench", ".benchmark", ".stories", ".story", ".cy"] {
        if stem.ends_with(suf) {
            return true;
        }
    }
    if segments[..segments.len() - 1].iter().any(|s| {
        let l = s.to_lowercase();
        l == "__tests__" || l == "test" || l == "tests"
    }) {
        return true;
    }
    if script_ext(&lower, false) && (stem.starts_with("test-") || stem.starts_with("test_")) {
        return true;
    }
    false
}

fn ext_of(p: &str) -> String {
    let base = &p[p.rfind('/').map(|i| i + 1).unwrap_or(0)..];
    match base.rfind('.') {
        Some(d) if d > 0 => base[d..].to_lowercase(),
        _ => String::new(),
    }
}

fn config_json(base: &str) -> bool {
    let l = base.to_lowercase();
    let names = [
        "package", "package-lock", "composer", "deno", "turbo", "vercel", "nx", "lerna", "app", "bower", "now",
        "netlify", "firebase", "renovate", "project", "workspace", "angular", "biome", "components",
    ];
    for n in names {
        if l == format!("{n}.json") || l == format!("{n}.jsonc") {
            return true;
        }
    }
    if l.contains("config") {
        return true;
    }
    for key in ["rc", "lock"] {
        for ext in [".json", ".jsonc"] {
            let suf = format!("{key}{ext}");
            if let Some(pre) = l.strip_suffix(&suf) {
                if pre.is_empty() || pre.ends_with(['.', '_', '-']) {
                    return true;
                }
            }
        }
    }
    false
}

fn config_module(base: &str) -> bool {
    let l = base.to_lowercase();
    let exts = [
        "js", "jsx", "ts", "tsx", "cjs", "cjsx", "cts", "ctsx", "mjs", "mjsx", "mts", "mtsx",
    ];
    for e in exts {
        if let Some(pre) = l.strip_suffix(&format!("config.{e}")) {
            if pre.is_empty() || pre.ends_with('.') {
                return true;
            }
        }
    }
    for e in ["js", "ts", "cjs", "cts", "mjs", "mts"] {
        if let Some(pre) = l.strip_suffix(&format!("rc.{e}")) {
            if !pre.is_empty() && pre.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                return true;
            }
        }
    }
    false
}

/// `embeddedPathProblem(p, {page})`: the reason, or `None`.
pub fn embedded_path_problem(p: &str, page: bool) -> Option<String> {
    if p.is_empty() || p.contains('\0') {
        return Some("an empty or invalid path".into());
    }
    let b = p.as_bytes();
    if p.starts_with('/') || (b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':') || p.contains('\\') {
        return Some(format!("an absolute path ({p})"));
    }
    let segments: Vec<&str> = p.split('/').collect();
    if segments.iter().any(|s| *s == ".." || *s == "." || s.is_empty()) {
        return Some(format!("a path outside its own tree ({p})"));
    }
    if segments.iter().any(|s| s.starts_with('.')) {
        return Some(format!("a dotfile or dot-folder ({p})"));
    }
    if segments.contains(&"node_modules") {
        return Some(format!("a file inside node_modules ({p})"));
    }
    let base = segments[segments.len() - 1];
    let ext = ext_of(p);
    if page {
        if !PAGE_EXTENSIONS.contains(&ext.as_str()) {
            return Some(format!("a page that is not a page module ({p})"));
        }
        return None;
    }
    if runner_picks_up(&segments) {
        return Some(format!("a test, spec, story or benchmark file ({p})"));
    }
    if ((ext == ".json" || ext == ".jsonc") && config_json(base)) || config_module(base) {
        return Some(format!("a project or tool configuration file ({p})"));
    }
    let asset = {
        let e = np::extname(p);
        let e = e.strip_prefix('.').unwrap_or("").to_lowercase();
        ASSET_EXTS.contains(&e.as_str())
    };
    if PAGE_EXTENSIONS.contains(&ext.as_str()) || ext == ".css" || ext == ".json" || asset {
        return None;
    }
    Some(format!("a kind of file a render never embeds ({p})"))
}
