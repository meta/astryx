//! Port of `foundation/render/render-page.mjs` (everything after the page
//! has rendered: stylesheets, assets, warnings, the source block, the file)
//! and `source-block.mjs`, `assets.mjs`, `served-packages.mjs`.

use super::css;
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};
use std::collections::HashSet;

pub const MAX_ASSET_BYTES: u64 = 8 * 1024 * 1024;
const SCHEME_CSS: &str = ":root{color-scheme:light dark}:root[data-theme=\"light\"]{color-scheme:light}:root[data-theme=\"dark\"]{color-scheme:dark}";
pub const SOURCE_TYPE: &str = "application/x-astryx-source";

#[derive(Debug, Clone)]
pub struct RenderError {
    pub code: String,
    pub message: String,
    /// `detail.package` for a missing dependency.
    pub package: Option<String>,
}

pub fn rerr(code: &str, message: impl Into<String>) -> RenderError {
    RenderError { code: code.into(), message: message.into(), package: None }
}

#[derive(Debug, Clone)]
pub struct Warning {
    pub code: &'static str,
    pub message: String,
}

/// The served package set: the Core the CLI carries, for a page outside a
/// project.
#[derive(Debug, Clone)]
pub struct Served {
    pub dir: String,
    pub integrations: Vec<String>,
}

/// One static JSX text (dropped-children warning).
#[derive(Debug, Clone)]
pub struct PageText {
    pub component: String,
    pub text: String,
    pub hidden: bool,
    pub fn_key: String,
    pub line: usize,
}

/// What the page worker answers.
#[derive(Debug, Clone, Default)]
pub struct WorkerOut {
    pub markup: String,
    /// StyleX CSS from the page's own modules.
    pub css: String,
    pub imported_css: Vec<(String, String)>,
    pub packages: Vec<String>,
    pub package_css: Vec<(String, String)>,
    pub skipped_css: Vec<String>,
    pub from_set: Vec<(String, String)>,
    pub charts_failed: usize,
    pub charts_alone: Option<String>,
    pub assets: Vec<String>,
    pub files: Vec<String>,
    pub texts: Vec<PageText>,
    pub fn_texts: Vec<(String, Vec<String>)>,
    pub logs: Vec<(String, String)>,
}

#[derive(Debug, Clone)]
pub struct RenderedPage {
    pub html: String,
    pub files: Vec<String>,
    pub stylesheets: Vec<String>,
    pub classes: usize,
    pub css_bytes: usize,
    pub markup_bytes: usize,
    pub images: usize,
    pub warnings: Vec<Warning>,
    pub from_set: Vec<(String, String)>,
}

const MIME: [(&str, &str); 17] = [
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("avif", "image/avif"),
    ("svg", "image/svg+xml"),
    ("ico", "image/x-icon"),
    ("bmp", "image/bmp"),
    ("woff", "font/woff"),
    ("woff2", "font/woff2"),
    ("ttf", "font/ttf"),
    ("otf", "font/otf"),
    ("mp4", "video/mp4"),
    ("webm", "video/webm"),
    ("mp3", "audio/mpeg"),
    ("wav", "audio/wav"),
];

fn ext_lower(p: &str) -> String {
    np::extname(p).trim_start_matches('.').to_lowercase()
}

pub fn is_asset_path(p: &str) -> bool {
    let e = ext_lower(p);
    MIME.iter().any(|(k, _)| *k == e)
}

pub fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::Digest;
    let d = sha2::Sha256::digest(bytes);
    d.iter().map(|b| format!("{b:02x}")).collect()
}

/// `assetDataUri(file)`.
pub fn asset_data_uri(file: &str) -> Result<String, RenderError> {
    let meta = std::fs::metadata(file).map_err(|_| RenderError {
        code: "ERR_FILE_NOT_FOUND".into(),
        message: format!("The page uses {file}, which does not exist"),
        package: None,
    })?;
    if meta.len() > MAX_ASSET_BYTES {
        return Err(rerr(
            "ERR_RENDER_ASSET_TOO_LARGE",
            format!(
                "{} is {} MB; a rendered page inlines files up to 8 MB each. Use a smaller copy of it.",
                np::basename(file),
                crate::commands::experimental::render::page::to_fixed1(meta.len() as f64 / 1048576.0)
            ),
        ));
    }
    let e = ext_lower(file);
    let mime = MIME.iter().find(|(k, _)| *k == e).map(|(_, m)| *m).unwrap_or("application/octet-stream");
    let bytes = std::fs::read(file).unwrap_or_default();
    Ok(format!("data:{mime};base64,{}", base64(&bytes)))
}

pub fn to_fixed1(x: f64) -> String {
    let r = (x * 10.0).round() / 10.0;
    format!("{r:.1}")
}

/// `isAssetBytes(bytes)`.
pub fn is_asset_bytes(b: &[u8]) -> bool {
    let at = |i: usize, t: &[u8]| b.len() >= i + t.len() && &b[i..i + t.len()] == t;
    if at(0, b"\x89PNG\r\n\x1a\n") || at(0, &[0xff, 0xd8, 0xff]) || at(0, b"GIF87a") || at(0, b"GIF89a") {
        return true;
    }
    if at(0, b"RIFF") && (at(8, b"WEBP") || at(8, b"WAVE")) {
        return true;
    }
    if at(4, b"ftyp") || at(0, b"BM") || at(0, &[0, 0, 1, 0]) {
        return true;
    }
    if at(0, b"wOFF") || at(0, b"wOF2") || at(0, b"OTTO") || at(0, b"true") || at(0, &[0, 1, 0, 0]) {
        return true;
    }
    if at(0, &[0x1a, 0x45, 0xdf, 0xa3]) || at(0, b"ID3") || (b.len() > 1 && b[0] == 0xff && (b[1] & 0xe0) == 0xe0) {
        return true;
    }
    let head = String::from_utf8_lossy(&b[..b.len().min(4096)]).to_string();
    let head = head.trim_start_matches('\u{feff}').trim_start();
    head.starts_with('<') && regress::Regex::with_flags(r"<svg[\s>]", "i").unwrap().find(head).is_some()
}

const RUNTIME: [&str; 3] = ["react", "react-dom", "@stylexjs/stylex"];

pub fn package_of(spec: &str) -> String {
    let parts: Vec<&str> = spec.split('/').collect();
    if spec.starts_with('@') {
        parts.iter().take(2).cloned().collect::<Vec<_>>().join("/")
    } else {
        parts[0].to_string()
    }
}

pub fn is_served_package(name: &str, integrations: &[String]) -> bool {
    name.starts_with("@astryxdesign/") || RUNTIME.contains(&name) || integrations.iter().any(|i| i == name)
}

/// `resolveServed(spec, from, served)`: CommonJS resolution from `from`, else
/// from the served set for a served package.
pub fn resolve_served(spec: &str, from: &str, served: Option<&Served>) -> Option<String> {
    use crate::js::resolve::{resolve, Mode, Resolved};
    if let Ok(Resolved::File(f)) = resolve(spec, std::path::Path::new(from), Mode::Cjs) {
        return Some(f.to_string_lossy().to_string());
    }
    let s = served?;
    if !is_served_package(&package_of(spec), &s.integrations) {
        return None;
    }
    match resolve(spec, std::path::Path::new(&np::join2(&s.dir, "package.json")), Mode::Cjs) {
        Ok(Resolved::File(f)) => Some(f.to_string_lossy().to_string()),
        _ => None,
    }
}

pub fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

pub fn decode_attr(s: &str) -> String {
    s.replace("&quot;", "\"").replace("&#x27;", "'").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
}

/// `sourceBlock(entry, files)`.
pub fn source_block(entry: &str, files: &[(String, Vec<u8>)]) -> String {
    let mut payload = Map::new();
    payload.insert("version".into(), Value::from(1));
    payload.insert("entry".into(), Value::String(entry.into()));
    payload.insert(
        "files".into(),
        Value::Array(
            files
                .iter()
                .map(|(p, b)| {
                    let mut m = Map::new();
                    m.insert("path".into(), Value::String(p.clone()));
                    m.insert("sha256".into(), Value::String(sha256_hex(b)));
                    m.insert("base64".into(), Value::String(base64(b)));
                    Value::Object(m)
                })
                .collect(),
        ),
    );
    let json = crate::json::stringify(&Value::Object(payload), 0).replace('<', "\\u003c").replace('>', "\\u003e").replace('&', "\\u0026");
    format!("<script type=\"{SOURCE_TYPE}\">{json}</script>")
}

struct Ctx {
    dir: String,
    root: String,
    warnings: Vec<Warning>,
    /// Insertion-ordered set of keys.
    counted: Vec<String>,
    local_assets: Vec<String>,
}

fn regex_replace(re: &str, flags: &str, text: &str, mut f: impl FnMut(&regress::Match, &str) -> Result<String, RenderError>) -> Result<String, RenderError> {
    let r = regress::Regex::with_flags(re, flags).unwrap();
    let mut out = String::new();
    let mut last = 0;
    for m in r.find_iter(text) {
        out.push_str(&text[last..m.start()]);
        out.push_str(&f(&m, text)?);
        last = m.end();
    }
    out.push_str(&text[last..]);
    Ok(out)
}

fn group<'a>(m: &regress::Match, text: &'a str, i: usize) -> Option<&'a str> {
    m.group(i).map(|r| &text[r])
}

fn resolve_ref(r: &str, ctx: &mut Ctx) -> Result<Option<String>, RenderError> {
    let decoded = decode_attr(r);
    let clean = crate::commands::gap_report::api::js_trim(&decoded);
    let clean = clean.split(['?', '#']).next().unwrap_or("").to_string();
    if clean.is_empty() {
        return Ok(None);
    }
    let lower = clean.to_lowercase();
    if ["data:", "blob:", "#", "about:", "mailto:", "tel:", "javascript:"].iter().any(|p| lower.starts_with(p)) {
        return Ok(None);
    }
    if lower.starts_with("//") || lower.starts_with("http://") || lower.starts_with("https://") {
        let key = format!("remote:{clean}");
        if !ctx.counted.contains(&key) {
            ctx.counted.push(key);
            ctx.warnings.push(Warning {
                code: "remote-asset",
                message: format!("{clean} is loaded from the network, which a sandboxed page cannot reach; save it beside the page and import it instead."),
            });
        }
        return Ok(None);
    }
    if !is_asset_path(&clean) {
        return Ok(None);
    }
    let candidates = if clean.starts_with('/') {
        vec![np::join(&[&ctx.root, "public", &clean]), np::join(&[&ctx.root, &clean])]
    } else {
        vec![np::resolve(&[&ctx.dir, &clean])]
    };
    let Some(found) = candidates.into_iter().find(|c| np::exists(c)) else {
        let key = format!("missing:{clean}");
        if !ctx.counted.contains(&key) {
            ctx.counted.push(key);
            ctx.warnings.push(Warning {
                code: "missing-asset",
                message: format!("{clean} was not found next to the page, so it is left as is and will not show."),
            });
        }
        return Ok(None);
    };
    let k = format!("file:{found}");
    if !ctx.counted.contains(&k) {
        ctx.counted.push(k);
    }
    if !clean.starts_with('/') && !ctx.local_assets.contains(&found) {
        ctx.local_assets.push(found.clone());
    }
    Ok(Some(asset_data_uri(&found)?))
}

fn css_urls(value: &str, ctx: &mut Ctx) -> Result<String, RenderError> {
    regex_replace(r#"url\(\s*(['"]?)([^'")]+)\1\s*\)"#, "g", value, |m, t| {
        let whole = &t[m.range()];
        match resolve_ref(group(m, t, 2).unwrap_or(""), ctx)? {
            Some(uri) => Ok(format!("url(\"{uri}\")")),
            None => Ok(whole.to_string()),
        }
    })
}

fn inline_assets(text: &str, html: bool, ctx: &mut Ctx) -> Result<String, RenderError> {
    if !html {
        return css_urls(text, ctx);
    }
    let a = regex_replace(r#"\s(src|poster)="([^"]*)""#, "g", text, |m, t| {
        let whole = &t[m.range()];
        let attr = group(m, t, 1).unwrap_or("");
        Ok(match resolve_ref(group(m, t, 2).unwrap_or(""), ctx)? {
            Some(uri) => format!(" {attr}=\"{uri}\""),
            None => whole.to_string(),
        })
    })?;
    let b = regex_replace(r#"\ssrcset="([^"]*)""#, "g", &a, |m, t| {
        let set = decode_attr(group(m, t, 1).unwrap_or(""));
        let mut parts = vec![];
        for part in set.split(',') {
            let pieces: Vec<&str> = crate::commands::gap_report::api::js_trim(part).split_whitespace().collect();
            let r = pieces.first().copied().unwrap_or("");
            let uri = if r.is_empty() { None } else { resolve_ref(r, ctx)? };
            let mut all = vec![uri.unwrap_or_else(|| r.to_string())];
            all.extend(pieces.iter().skip(1).map(|s| s.to_string()));
            parts.push(all.join(" "));
        }
        Ok(format!(" srcset=\"{}\"", parts.join(", ").replace('"', "&quot;")))
    })?;
    regex_replace(r#"\sstyle="([^"]*)""#, "g", &b, |m, t| {
        let c = css_urls(&decode_attr(group(m, t, 1).unwrap_or("")), ctx)?;
        Ok(format!(" style=\"{}\"", c.replace('&', "&amp;").replace('"', "&quot;")))
    })
}

struct Imports {
    carried: Vec<String>,
    included: Vec<String>,
    package_sheets: Vec<String>,
}

struct ImportParams {
    url: String,
    layer: Option<String>,
    supports: Option<String>,
    media: String,
}

fn import_params(params: &str) -> Option<ImportParams> {
    let re = regress::Regex::new(r#"^\s*(?:url\(\s*(['"]?)([\s\S]*?)\1\s*\)|(['"])([\s\S]*?)\3)\s*([\s\S]*)$"#).unwrap();
    let m = re.find(params)?;
    let g = |i: usize| m.group(i).map(|r| params[r].to_string());
    let mut rest = g(5).unwrap_or_default();
    let mut layer = None;
    let lay = regress::Regex::with_flags(r"^layer(?:\(\s*([^)]*?)\s*\))?(?=\s|$)\s*", "i").unwrap();
    if let Some(l) = lay.find(&rest) {
        layer = Some(l.group(1).map(|r| rest[r].to_string()).unwrap_or_default());
        rest = rest[l.end()..].to_string();
    }
    let mut supports = None;
    let sup = regress::Regex::with_flags(r"^supports\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)\s*", "i").unwrap();
    if let Some(sm) = sup.find(&rest) {
        supports = Some(rest[sm.group(1).unwrap()].to_string());
        rest = rest[sm.end()..].to_string();
    }
    Some(ImportParams {
        url: g(2).or(g(4)).unwrap_or_default(),
        layer,
        supports,
        media: crate::commands::gap_report::api::js_trim(&rest).to_string(),
    })
}

/// `expandImports(file, css, ctx)`.
fn expand_imports(file: &str, text: &str, imp: &mut Imports, warnings: &mut Vec<Warning>, served: Option<&Served>, seen: &mut Vec<String>) -> Result<String, RenderError> {
    if !text.to_lowercase().contains("@import") {
        return Ok(text.to_string());
    }
    let Ok(mut tree) = css::parse(text) else { return Ok(text.to_string()) };
    let base = np::basename(file);
    // PostCSS's walk never visits the nodes a replacement inserts.
    for id in tree.walk() {
        if tree.nodes[id].removed {
            continue;
        }
        let params = match &tree.nodes[id].kind {
            css::Kind::AtRule { name, params, .. } if name.to_lowercase() == "import" => params.clone(),
            _ => continue,
        };
        let Some(parsed) = import_params(&params) else { continue };
        if parsed.url.is_empty() {
            continue;
        }
        let url = parsed.url.clone();
        let removed = |tree: &mut css::Tree, _i: &mut usize, id: usize| {
            tree.remove(id);
        };
        let mut i = 0usize;
        if regress::Regex::with_flags(r"^([a-z]+:)?\/\/", "i").unwrap().find(&url).is_some() {
            warnings.push(Warning {
                code: "remote-asset",
                message: format!("{base} imports {url}, which a sandboxed page cannot load, so it is left out; save it beside the stylesheet and import it instead."),
            });
            removed(&mut tree, &mut i, id);
            continue;
        }
        let lu = url.to_lowercase();
        if lu.ends_with(".scss") || lu.ends_with(".sass") || lu.ends_with(".less") {
            warnings.push(Warning {
                code: "missing-asset",
                message: format!("{base} imports {url}, a Sass or Less stylesheet, which a render does not compile, so its styles are missing."),
            });
            removed(&mut tree, &mut i, id);
            continue;
        }
        let relative = np::resolve(&[&np::dirname(file), &url]);
        let mut from_package = false;
        let target = if url.starts_with("./") || url.starts_with("../") || np::exists(&relative) {
            if np::exists(&relative) { Some(relative) } else { None }
        } else {
            let t = resolve_served(url.trim_start_matches('~'), file, served);
            from_package = t.is_some();
            t
        };
        let Some(target) = target else {
            warnings.push(Warning {
                code: "missing-asset",
                message: format!("{base} imports {url}, which was not found, so its styles are missing."),
            });
            removed(&mut tree, &mut i, id);
            continue;
        };
        if seen.contains(&target) || imp.included.contains(&target) {
            removed(&mut tree, &mut i, id);
            continue;
        }
        seen.push(target.clone());
        imp.included.push(target.clone());
        if from_package {
            imp.package_sheets.push(url.trim_start_matches('~').to_string());
        } else if !imp.carried.contains(&target) {
            imp.carried.push(target.clone());
        }
        let inner_text = std::fs::read_to_string(&target).unwrap_or_default();
        let mut inner = expand_imports(&target, &inner_text, imp, warnings, served, seen)?;
        let fdir = np::dirname(file);
        let tdir = np::dirname(&target);
        inner = regex_replace(r#"url\(\s*(['"]?)([^'")]+)\1\s*\)"#, "g", &inner, |m, t| {
            let whole = &t[m.range()];
            let q = group(m, t, 1).unwrap_or("");
            let r = group(m, t, 2).unwrap_or("");
            if regress::Regex::with_flags(r"^(data:|blob:|#|\/|[a-z]+:)", "i").unwrap().find(r).is_some() {
                return Ok(whole.to_string());
            }
            let rebased = np::relative(&fdir, &np::resolve(&[&tdir, r]));
            Ok(format!("url({q}{}{q})", if rebased.starts_with('.') { rebased } else { format!("./{rebased}") }))
        })?;
        if let Some(sup) = &parsed.supports {
            let inner_sup = regress::Regex::with_flags(r"^\((.*)\)$", "s").unwrap().find(sup).map(|m| sup[m.group(1).unwrap()].to_string()).unwrap_or_else(|| sup.clone());
            inner = format!("@supports ({inner_sup}){{{inner}}}");
        }
        if !parsed.media.is_empty() {
            inner = format!("@media {}{{{inner}}}", parsed.media);
        }
        if let Some(l) = &parsed.layer {
            inner = format!("@layer{}{{{inner}}}", if l.is_empty() { String::new() } else { format!(" {l}") });
        }
        match css::parse(&inner) {
            Ok(t) => {
                tree.replace_with_tree(id, t);
            }
            Err(reason) => {
                return Err(rerr("ERR_RENDER_COMPILE", format!("{}, imported by {base}, is not valid CSS: {reason}", np::basename(&target))));
            }
        }
    }
    Ok(tree.to_string())
}

fn project_root_of(dir: &str) -> String {
    let mut d = dir.to_string();
    loop {
        if np::exists(&np::join2(&d, "package.json")) {
            return d;
        }
        let up = np::dirname(&d);
        if up == d {
            return dir.to_string();
        }
        d = up;
    }
}

fn rel_inside(root: &str, f: &str) -> bool {
    let r = np::relative(root, f);
    !(r.starts_with("..") || np::is_absolute(&r) || r.split('/').any(|s| s == "node_modules"))
}

/// `renderPage(entry, options)` after the worker answered.
pub fn render_page(entry: &str, title: Option<&str>, version: &str, served: Option<&Served>, message: WorkerOut) -> Result<RenderedPage, RenderError> {
    let dir = np::dirname(entry);
    let root = project_root_of(&dir);
    let mut warnings: Vec<Warning> = vec![];
    let mut markup = message.markup.clone();
    let mut sheets: Vec<String> = vec![];
    let mut sheet_text: Vec<String> = vec![];
    let mut sheet_files: Vec<String> = vec![];
    let mut add_sheet = |spec: &str, sheets: &mut Vec<String>, sheet_text: &mut Vec<String>, sheet_files: &mut Vec<String>| -> bool {
        let Some(file) = resolve_served(spec, entry, served) else { return false };
        let Ok(text) = std::fs::read_to_string(&file) else { return false };
        sheets.push(spec.to_string());
        sheet_text.push(text);
        sheet_files.push(file);
        true
    };
    let has_core = add_sheet("@astryxdesign/core/reset.css", &mut sheets, &mut sheet_text, &mut sheet_files);
    if has_core {
        add_sheet("@astryxdesign/core/astryx.css", &mut sheets, &mut sheet_text, &mut sheet_files);
    }
    for (spec, from) in &message.package_css {
        if sheets.contains(spec) {
            continue;
        }
        match resolve_served(spec, from, served).and_then(|f| std::fs::read_to_string(&f).ok().map(|t| (f, t))) {
            Some((f, t)) => {
                sheets.push(spec.clone());
                sheet_text.push(t);
                sheet_files.push(f);
            }
            None => warnings.push(Warning {
                code: "missing-asset",
                message: format!("The page imports the stylesheet {spec}, which could not be found, so its styles are missing."),
            }),
        }
    }
    for pkg in &message.packages {
        if let Some(name) = pkg.strip_prefix("@astryxdesign/") {
            if name != "core" && !name.is_empty() && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
                add_sheet(&format!("{pkg}/{name}.css"), &mut sheets, &mut sheet_text, &mut sheet_files);
            }
        }
    }
    if !has_core {
        warnings.push(Warning {
            code: "no-astryx-styles",
            message: if served.is_some() {
                "@astryxdesign/core is not installed where the page is, and the CLI runs without one, so the page has no Astryx styles; install it, or render from inside the project.".into()
            } else {
                "@astryxdesign/core is not installed where the page is, so the page has no Astryx styles; install it, or render from inside the project.".into()
            },
        });
    }
    let mut ctx = Ctx { dir: dir.clone(), root: root.clone(), warnings, counted: vec![], local_assets: vec![] };
    markup = inline_assets(&markup, true, &mut ctx)?;
    markup = regress::Regex::new(r#"<link rel="preload"[^>]*\/?>"#)
        .map(|r| {
            let mut out = String::new();
            let mut last = 0;
            for m in r.find_iter(&markup) {
                out.push_str(&markup[last..m.start()]);
                last = m.end();
            }
            out.push_str(&markup[last..]);
            out
        })
        .unwrap();
    if regress::Regex::with_flags(r"<script\b", "i").unwrap().find(&markup).is_some() {
        ctx.warnings.push(Warning {
            code: "page-script",
            message: "The page renders a <script> element. A sandboxed viewer blocks it, and anywhere else it runs when the file is opened; remove it from the page.".into(),
        });
    }
    let remote = regress::Regex::with_flags(r#"<(link|iframe|object|embed)\b[^>]*?\s(?:href|src|data)="([^"]*)""#, "gi").unwrap();
    for m in remote.find_iter(&markup) {
        let url = group(&m, &markup, 2).unwrap_or("");
        let lu = url.to_lowercase();
        if lu.starts_with("data:") || url.starts_with('#') {
            continue;
        }
        ctx.warnings.push(Warning {
            code: "remote-asset",
            message: format!(
                "The page renders a <{}> that loads {url}, which a sandboxed page cannot reach and which loads from the network anywhere else; remove it from the page.",
                group(&m, &markup, 1).unwrap_or("").to_lowercase()
            ),
        });
    }
    let used: HashSet<String> = css::classes_in(&markup).into_iter().collect();
    let layer_order = sheet_text.iter().map(|t| css::layer_order_of(t)).find(|s| !s.is_empty()).unwrap_or_default();
    let mut css_out = layer_order;
    let mut imp = Imports { carried: vec![], included: sheet_files.clone(), package_sheets: vec![] };
    let mut all_sheets: Vec<(String, String)> = sheet_files.iter().cloned().zip(sheet_text.iter().cloned()).collect();
    all_sheets.extend(message.imported_css.iter().cloned());
    for (file, text) in &all_sheets {
        let own = expand_imports(file, text, &mut imp, &mut ctx.warnings, served, &mut vec![file.clone()])?;
        let cut = css::cut_css(&own, &used).map_err(|reason| {
            rerr("ERR_RENDER_COMPILE", format!("{} is not valid CSS: {reason}", np::relative(&dir, file)))
        })?;
        let saved_dir = std::mem::replace(&mut ctx.dir, np::dirname(file));
        let inlined = inline_assets(&cut, false, &mut ctx);
        ctx.dir = saved_dir;
        css_out.push_str(&inlined?);
    }
    for spec in &imp.package_sheets {
        if !sheets.contains(spec) {
            sheets.push(spec.clone());
        }
    }
    if !message.css.is_empty() {
        css_out.push_str(&inline_assets(&message.css, false, &mut ctx)?);
    }
    css_out = regex_replace(r"<\/style", "gi", &css_out, |m, t| Ok(format!("<\\{}", &t[m.start() + 1..m.end()])))?;

    // Dropped children.
    let plain = {
        let no_tags = regex_replace(r"<[^>]*>", "g", &markup, |_, _| Ok(" ".into()))?;
        let s = no_tags.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#x27;", "'").replace("&#39;", "'").replace("&nbsp;", " ");
        regex_replace(r"\s+", "g", &s, |_, _| Ok(" ".into()))?
    };
    for t in &message.texts {
        if t.hidden || t.text.encode_utf16().count() < 2 || plain.contains(&t.text) {
            continue;
        }
        let around: Vec<&String> = message.fn_texts.iter().find(|(k, _)| *k == t.fn_key).map(|(_, v)| v.iter().filter(|o| **o != t.text).collect()).unwrap_or_default();
        if !around.iter().any(|o| plain.contains(o.as_str())) {
            continue;
        }
        let shown = if t.text.encode_utf16().count() > 60 {
            let u: Vec<u16> = t.text.encode_utf16().take(57).collect();
            format!("{}...", String::from_utf16_lossy(&u))
        } else {
            t.text.clone()
        };
        ctx.warnings.push(Warning {
            code: "dropped-children",
            message: format!(
                "<{}> on line {} did not render the text \"{shown}\" it was given; it takes that text through a prop (often label=), so check its props.",
                t.component, t.line
            ),
        });
    }
    let count = |re: &str| regress::Regex::new(re).unwrap().find_iter(&markup).count();
    let blank = count(r#"<div class="recharts-responsive-container[" ][^>]*><div[^>]*><\/div><\/div>"#)
        + count(r#"<div\b[^>]*\bclass="recharts-wrapper"[^>]*><\/div>"#)
        + message.charts_failed;
    if blank > 0 {
        ctx.warnings.push(Warning {
            code: "chart-size",
            message: format!(
                "{} could not be drawn without a browser, so {} empty here: the render draws a chart only when a module of the page (not an installed package) imports the chart, and its ResponsiveContainer, from recharts by name (`import {{LineChart}} from 'recharts'`).",
                if blank == 1 { "A chart".to_string() } else { format!("{blank} charts") },
                if blank == 1 { "it is" } else { "they are" }
            ),
        });
    }
    if let Some(alone) = &message.charts_alone {
        let why = match alone.as_str() {
            "changed" => "The page changed its charts once its effects ran (their data or props, or which charts it shows)",
            "rerendered" => "A component that makes a chart rendered again once the page's effects ran",
            _ => "The page could not be drawn again without a browser",
        };
        ctx.warnings.push(Warning {
            code: "chart-size",
            message: format!("{why}, so each chart was drawn by itself, as the first render gave it: a custom tick, label or shape in a chart sees React context defaults, not the values the page provides."),
        });
    }
    for s in &message.skipped_css {
        ctx.warnings.push(Warning {
            code: "missing-asset",
            message: format!("The page imports {s}, a Sass or Less stylesheet, which a render does not compile, so its styles are missing."),
        });
    }
    for (level, text) in message.logs.iter().take(5) {
        let first = text.split('\n').next().unwrap_or("");
        let u: Vec<u16> = first.encode_utf16().take(200).collect();
        ctx.warnings.push(Warning {
            code: "page-output",
            message: format!("The page printed while rendering ({level}): {}", String::from_utf16_lossy(&u)),
        });
    }
    let mut files: Vec<String> = if message.files.is_empty() { vec![entry.to_string()] } else { message.files.clone() };
    if !files.iter().any(|f| f == entry) {
        files.insert(0, entry.to_string());
    }
    for sheet in &imp.carried {
        if !rel_inside(&root, sheet) {
            continue;
        }
        if !files.contains(sheet) {
            files.push(sheet.clone());
        }
    }
    let local_assets = ctx.local_assets.clone();
    for asset in local_assets {
        if !rel_inside(&root, &asset) || files.contains(&asset) {
            continue;
        }
        if !is_asset_bytes(&std::fs::read(&asset).unwrap_or_default()) {
            ctx.warnings.push(Warning {
                code: "not-embedded",
                message: format!(
                    "{} is shown inline but not carried in the file: its bytes are not a known image, font or media format, so --reverse cannot give it back.",
                    np::relative(&dir, &asset)
                ),
            });
            continue;
        }
        files.push(asset);
    }
    let mut base = dir.clone();
    for f in &files {
        while np::relative(&base, f).starts_with("..") {
            base = np::dirname(&base);
        }
    }
    let mut ordered = vec![entry.to_string()];
    ordered.extend(files.iter().filter(|f| *f != entry).cloned());
    let mut embedded: Vec<(String, Vec<u8>)> = vec![];
    for f in &ordered {
        let rel = np::relative(&base, f);
        if f != entry && super::embedded_path_problem(&rel, false).is_some() {
            ctx.warnings.push(Warning {
                code: "not-embedded",
                message: format!("{rel} is not carried in the file (a rendered page carries the page and the local modules, stylesheets, JSON files and images it imports, but never project or tool configuration, or a file a test, story or benchmark runner would run), so --reverse cannot give it back."),
            });
            continue;
        }
        embedded.push((rel, std::fs::read(f).unwrap_or_default()));
    }
    let heading = regress::Regex::with_flags(r"<h1\b[^>]*>([\s\S]*?)<\/h1>", "i").unwrap().find(&markup).and_then(|m| {
        let inner = group(&m, &markup, 1)?.to_string();
        let stripped = regex_replace(r"<[^>]*>", "g", &inner, |_, _| Ok(String::new())).ok()?;
        Some(crate::commands::gap_report::api::js_trim(&stripped).to_string())
    });
    let title = match title {
        Some(t) => t.to_string(),
        None => match heading.filter(|h| !h.is_empty()) {
            Some(h) => decode_attr(&h),
            None => {
                let b = np::basename(entry);
                match b.rfind('.') {
                    Some(i) => b[..i].to_string(),
                    None => b,
                }
            }
        },
    };
    let chart_css = if markup.contains("class=\"recharts-responsive-container\"") { super::charts::CHART_CSS } else { "" };
    let html = format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"color-scheme\" content=\"light dark\"><meta name=\"generator\" content=\"Astryx{}\"><title>{}</title><style>{SCHEME_CSS}{chart_css}{css_out}</style></head><body>{markup}{}</body></html>\n",
        if version.is_empty() { String::new() } else { format!(" {}", escape_html(version)) },
        escape_html(&title),
        source_block(&np::basename(entry), &embedded)
    );
    let images: HashSet<String> = ctx
        .counted
        .iter()
        .filter_map(|k| k.strip_prefix("file:").map(String::from))
        .chain(message.assets.iter().cloned())
        .collect();
    Ok(RenderedPage {
        html,
        files: embedded.iter().map(|(p, _)| p.clone()).collect(),
        stylesheets: sheets,
        classes: used.len(),
        css_bytes: css_out.len(),
        markup_bytes: markup.len(),
        images: images.len(),
        warnings: ctx.warnings,
        from_set: message.from_set,
    })
}
