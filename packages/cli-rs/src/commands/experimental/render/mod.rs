//! `astryx experimental render`: port of `clients/cli/commands/experimental/
//! render.mjs` and `api/render/render.mjs` (argument checks, reading the
//! input, the output's confinement). Rendering itself is not cloned yet.

pub mod css;

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

fn err(message: impl Into<String>, suggestions: Vec<Suggestion>, code: &'static str) -> RenderError {
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
        Ok(()) => Ok(()),
        Err(e) => out.cli_error(&e.message, ErrorOpts::code(e.code).suggestions(e.suggestions)),
    }
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

fn render(file: &str, cwd: &str, o: &RenderOptions) -> Result<(), RenderError> {
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
        read_input(&input, cwd)?;
        return Err(not_cloned());
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
    read_input(&input, cwd)?;
    confined(&target, cwd, "The output")?;
    Err(not_cloned())
}

// TEMP: rendering and reversing are not cloned yet.
fn not_cloned() -> RenderError {
    err("experimental render is not cloned yet", vec![], "ERR_UNKNOWN")
}

fn read_input(file: &str, cwd: &str) -> Result<Vec<u8>, RenderError> {
    match std::fs::metadata(file) {
        Ok(m) if m.is_file() => {
            std::fs::read(file).map_err(|_| err(format!("{} does not exist", shown(cwd, file)), vec![], "ERR_FILE_NOT_FOUND"))
        }
        _ => Err(err(format!("{} does not exist", shown(cwd, file)), vec![], "ERR_FILE_NOT_FOUND")),
    }
}

/// `assertWithin(file, cwd, {allowAbsolute: true})`, symlinks followed.
fn confined(file: &str, cwd: &str, what: &str) -> Result<String, RenderError> {
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
