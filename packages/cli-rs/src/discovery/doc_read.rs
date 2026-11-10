//! Port of `foundation/doc-compiler/read.mjs` (`readDocView`, the topic-file
//! loaders), `overlays.mjs`, `source.mjs`, the per-doc part of
//! `compile.mjs` (`lowerDoc` as a view) and `discovery/component-loader.mjs`.
//!
//! Errors are the message the JS reader throws (`err.message`).

use super::docmod::{self, Loader};
use super::doctypes;
use super::nodepath as np;
use super::paths::js_truthy;
use crate::json::{Map, Value};
use std::collections::HashMap;
use std::sync::Mutex;

/// The exports each root reads, in `??` order (`DOC_EXPORTS`).
pub fn doc_exports(root: &str) -> &'static [&'static str] {
    match root {
        "components" | "hooks" => &["default", "docs"],
        "templates" => &["default", "doc"],
        "self-docs" => &["doc", "docs", "default"],
        "tree" => &["docs", "default"],
        _ => &[],
    }
}

/// `ROOT_KINDS`.
pub fn root_kinds(root: &str) -> Option<&'static [&'static str]> {
    Some(match root {
        "components" => &["component"],
        "hooks" => &["function"],
        "templates" => &["page", "block"],
        "themes" => &["theme"],
        "icon-definitions" => &["icon-definition"],
        "self-docs" => &["command", "function", "schema", "enum"],
        "tree" => &["namespace", "generic"],
        _ => return None,
    })
}

/// Options of `readDocView`.
#[derive(Debug, Clone)]
pub struct ReadDocOptions {
    pub root: String,
    pub lang: Option<String>,
    pub label: Option<String>,
    pub strict: bool,
    pub check: bool,
    pub loader: Loader,
    pub exports: Option<Vec<String>>,
    pub provider: Option<String>,
    pub id: Option<String>,
    /// `value: 'parsed'`: the view is the parser's output.
    pub value_parsed: bool,
}

impl ReadDocOptions {
    pub fn new(root: &str) -> Self {
        ReadDocOptions {
            root: root.into(),
            lang: None,
            label: None,
            strict: false,
            check: false,
            loader: Loader::User,
            exports: None,
            provider: None,
            id: None,
            value_parsed: false,
        }
    }
}

/// What a file holds for a reader (`loadAuthored` result).
#[derive(Debug, Clone)]
pub enum Authored {
    /// The module failed to load.
    Error { file: String, message: String },
    /// The doc value (`None` = undefined) and its translation overlay.
    Doc { file: String, doc: Option<Value>, overlay: Option<Value> },
}

/// `translationFor(mod, lang)`.
pub fn translation_for(ns: &Map<String, Value>, lang: &str) -> Option<Value> {
    let key = match lang {
        "zh" => "docsZh",
        "dense" => "docsDense",
        _ => return None,
    };
    ns.get(key).filter(|v| js_truthy(Some(v))).cloned()
}

fn load_authored(file: &str, opts: &ReadDocOptions) -> Authored {
    let name = np::basename(file);
    let ns = match docmod::import(file, opts.loader) {
        Ok(ns) => ns,
        Err(e) => return Authored::Error { file: name, message: e.message },
    };
    let names: Vec<&str> = match &opts.exports {
        Some(e) => e.iter().map(|s| s.as_str()).collect(),
        None => doc_exports(&opts.root).to_vec(),
    };
    let doc = docmod::first_export(&ns, &names).filter(|v| !docmod::is_undefined(Some(v))).cloned();
    let overlay = match &opts.lang {
        Some(l) if opts.root == "components" || opts.root == "hooks" => translation_for(&ns, l),
        _ => None,
    };
    Authored::Doc { file: name, doc, overlay }
}

fn is_undef(v: &Value) -> bool {
    docmod::is_undefined(Some(v))
}

fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    v.get(k).filter(|x| !is_undef(x))
}

fn truthy(v: &Value, k: &str) -> bool {
    js_truthy(get(v, k))
}

/// `mergeTranslation(docs, translation)`.
pub fn merge_translation(docs: &Value, t: &Value) -> Value {
    if !js_truthy(Some(t)) {
        return docs.clone();
    }
    let mut merged = docs.as_object().cloned().unwrap_or_default();
    let desc_of = |v: &Value, k: &str| get(v, k).cloned();
    if js_truthy(merged.get("usage")) {
        let mut usage = merged.get("usage").and_then(|u| u.as_object()).cloned().unwrap_or_default();
        let tu = get(t, "usage");
        if let Some(d) = tu.and_then(|u| get(u, "description")).filter(|d| js_truthy(Some(d))) {
            usage.insert("description".into(), d.clone());
        } else if truthy(t, "description") {
            usage.insert("description".into(), desc_of(t, "description").unwrap());
        }
        for k in ["bestPractices", "accessibility"] {
            if let Some(v) = tu.and_then(|u| get(u, k)).filter(|d| js_truthy(Some(d))) {
                usage.insert(k.into(), v.clone());
            }
        }
        merged.insert("usage".into(), Value::Object(usage));
    }
    if truthy(t, "description") && !js_truthy(merged.get("usage")) {
        merged.insert("description".into(), desc_of(t, "description").unwrap());
    }
    let by_name = |list: &Value, descs: &Value, field: &str| -> Value {
        match list {
            Value::Array(a) => Value::Array(
                a.iter()
                    .map(|p| {
                        let name = super::paths::js_string(p.get("name"));
                        match descs.get(&name).filter(|d| !d.is_null() && !is_undef(d)) {
                            Some(d) => {
                                let mut m = p.as_object().cloned().unwrap_or_default();
                                m.insert(field.into(), d.clone());
                                Value::Object(m)
                            }
                            None => p.clone(),
                        }
                    })
                    .collect(),
            ),
            other => other.clone(),
        }
    };
    for (tk, mk) in [("propDescriptions", "props"), ("paramDescriptions", "params"), ("returnDescriptions", "returns")] {
        if truthy(t, tk) && js_truthy(merged.get(mk)) {
            let v = by_name(&merged[mk], &t[tk], "description");
            merged.insert(mk.into(), v);
        }
    }
    if truthy(t, "components") && js_truthy(merged.get("components")) {
        let tcomps = t["components"].as_array().cloned().unwrap_or_default();
        if let Some(Value::Array(comps)) = merged.get("components").cloned() {
            let out: Vec<Value> = comps
                .iter()
                .enumerate()
                .map(|(i, comp)| {
                    let found = tcomps.iter().find(|x| x.get("name") == comp.get("name")).filter(|x| js_truthy(Some(x)));
                    let trans = found.or_else(|| tcomps.get(i).filter(|x| js_truthy(Some(x))));
                    let Some(trans) = trans else { return comp.clone() };
                    let mut mc = comp.as_object().cloned().unwrap_or_default();
                    if truthy(trans, "description") {
                        mc.insert("description".into(), trans["description"].clone());
                    }
                    if truthy(trans, "propDescriptions") && js_truthy(comp.get("props")) {
                        mc.insert("props".into(), by_name(&comp["props"], &trans["propDescriptions"], "description"));
                    }
                    Value::Object(mc)
                })
                .collect();
            merged.insert("components".into(), Value::Array(out));
        }
    }
    Value::Object(merged)
}

fn spread(a: &Value, b: &Value) -> Map<String, Value> {
    let mut m = a.as_object().cloned().unwrap_or_default();
    if let Value::Object(bm) = b {
        for (k, v) in bm {
            m.insert(k.clone(), v.clone());
        }
    }
    m
}

fn overlay_component_doc(docs: &Value, t: &Value) -> Value {
    let overlay_props = |base: Option<&Value>, tprops: Option<&Value>| -> Option<Value> {
        let base = base?;
        if !js_truthy(Some(base)) {
            return Some(base.clone());
        }
        let tlist = tprops.and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let Value::Array(b) = base else { return Some(base.clone()) };
        Some(Value::Array(
            b.iter()
                .map(|p| {
                    // Map keeps the last prop of a name.
                    match tlist.iter().rev().find(|x| x.get("name") == p.get("name")) {
                        Some(tp) => {
                            let mut m = spread(p, tp);
                            m.insert("name".into(), p.get("name").cloned().unwrap_or(Value::Null));
                            m.insert("type".into(), p.get("type").cloned().unwrap_or_else(super::zod::undefined));
                            Value::Object(m)
                        }
                        None => p.clone(),
                    }
                })
                .collect(),
        ))
    };
    let merge_usage = |base: Option<&Value>, tu: Option<&Value>| -> Value {
        let Some(tu) = tu.filter(|v| js_truthy(Some(v))) else {
            return base.cloned().unwrap_or_else(super::zod::undefined);
        };
        let mut m = tu.as_object().cloned().unwrap_or_default();
        for k in ["accessibility", "accessibilityThemeCoverage", "anatomy"] {
            let t_undef = tu.get(k).map(is_undef).unwrap_or(true);
            let b = base.and_then(|b| b.get(k)).filter(|v| !is_undef(v));
            if t_undef {
                if let Some(bv) = b {
                    m.insert(k.into(), bv.clone());
                }
            }
        }
        Value::Object(m)
    };
    let mut merged = spread(docs, t);
    merged.insert("usage".into(), merge_usage(docs.get("usage"), t.get("usage")));
    merged.insert(
        "props".into(),
        overlay_props(docs.get("props"), t.get("props")).unwrap_or_else(super::zod::undefined),
    );
    if let Some(Value::Array(comps)) = docs.get("components").filter(|v| js_truthy(Some(v))) {
        let tcomps = t.get("components").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let out: Vec<Value> = comps
            .iter()
            .map(|base| match tcomps.iter().rev().find(|c| c.get("name") == base.get("name")) {
                None => base.clone(),
                Some(tc) => {
                    let mut m = spread(base, tc);
                    m.insert("usage".into(), merge_usage(base.get("usage"), tc.get("usage")));
                    m.insert(
                        "props".into(),
                        overlay_props(base.get("props"), tc.get("props")).unwrap_or_else(super::zod::undefined),
                    );
                    Value::Object(m)
                }
            })
            .collect();
        merged.insert("components".into(), Value::Array(out));
    }
    Value::Object(merged)
}

/// `overlayAuthoredDoc(docs, translation)`.
pub fn overlay_authored_doc(docs: &Value, t: &Value) -> Value {
    let has_props = truthy(t, "props")
        || t.get("components").and_then(|c| c.as_array()).map(|a| a.iter().any(|c| truthy(c, "props"))).unwrap_or(false);
    if has_props {
        overlay_component_doc(docs, t)
    } else {
        merge_translation(docs, t)
    }
}

// ── source.mjs ─────────────────────────────────────────────────────────────

static ROOTS: Mutex<Option<HashMap<String, (Option<(String, String)>, Option<(String, String)>)>>> = Mutex::new(None);

fn folder_name(dir: &str) -> String {
    let lower = np::basename(dir).to_lowercase();
    let mut out = String::new();
    let mut prev_dash = false;
    for c in lower.chars() {
        let ok = c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '~' | '-');
        if ok {
            out.push(c);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let t = out.trim_start_matches(['.', '_']);
    if t.is_empty() {
        "unknown".into()
    } else {
        t.into()
    }
}

/// `(named, any)` package roots of a folder: `(dir, name)`.
fn package_roots_of(dir: &str) -> (Option<(String, String)>, Option<(String, String)>) {
    if let Some(m) = ROOTS.lock().unwrap().as_ref() {
        if let Some(v) = m.get(dir) {
            return v.clone();
        }
    }
    let mut here = None;
    let mut named = false;
    let manifest = np::join2(dir, "package.json");
    if np::exists(&manifest) {
        here = Some((dir.to_string(), folder_name(dir)));
        if let Some(Value::String(n)) = np::read_json(&manifest).as_ref().and_then(|p| p.get("name")) {
            if !n.is_empty() {
                here = Some((dir.to_string(), n.clone()));
                named = true;
            }
        }
    }
    let parent = np::dirname(dir);
    let above = if named || parent == dir { (None, None) } else { package_roots_of(&parent) };
    let found = if named { (here.clone(), here) } else { (above.0, here.or(above.1)) };
    ROOTS.lock().unwrap().get_or_insert_with(HashMap::new).insert(dir.to_string(), found.clone());
    found
}

/// `packageSource(file)`.
pub fn package_source(file: &str) -> String {
    let abs = np::resolve1(file);
    let dir = np::dirname(&abs);
    let (named, any) = package_roots_of(&dir);
    match named.or(any) {
        None => format!("{}/{}", folder_name(&dir), np::basename(file)),
        Some((rdir, name)) => format!("{name}/{}", np::relative(&rdir, &abs)),
    }
}

/// `packageOf(file)`.
pub fn package_of(file: &str) -> String {
    let dir = np::dirname(&np::resolve1(file));
    let (named, any) = package_roots_of(&dir);
    named.or(any).map(|r| r.1).unwrap_or_else(|| "unknown".into())
}

// ── lowerDoc (view only) and readDocView ───────────────────────────────────

/// The view half of `lowerDoc`.
#[derive(Debug, Clone, Default)]
pub struct Lowered {
    pub load_failed: Option<String>,
    pub missing: bool,
    /// `missingValue`: None = undefined.
    pub missing_value: Option<Value>,
    pub failed: Option<String>,
    pub overlay_failed: Option<String>,
    pub view: Option<Value>,
    /// `wrong_kind` / `invalid_doc` / ... codes with messages.
    pub diagnostics: Vec<(String, String)>,
}

/// `lowerDoc(input, {check, node: false})`.
pub fn lower_doc_view(root: &str, label: Option<&str>, authored: Authored, check: bool, use_parsed: bool) -> Result<Lowered, String> {
    let mut out = Lowered::default();
    let (file, doc, overlay) = match authored {
        Authored::Error { file, message } => {
            out.diagnostics.push(("load_failed".into(), format!("{file} could not be loaded: {message}")));
            out.load_failed = Some(message);
            return Ok(out);
        }
        Authored::Doc { file, doc, overlay } => (file, doc, overlay),
    };
    let doc = match doc {
        Some(d) if !d.is_null() => d,
        other => {
            out.diagnostics.push(("missing_export".into(), format!("{file} exports no doc.")));
            out.missing = true;
            out.missing_value = other;
            return Ok(out);
        }
    };
    let allowed = root_kinds(root).ok_or_else(|| format!("No doc root is named \"{root}\"."))?;
    let stamped = match &doc {
        Value::Object(m) if super::zod::received(&doc) == "object" => m.get("type").filter(|v| !is_undef(v)),
        _ => None,
    };
    let kind_fits = match stamped {
        None => true,
        Some(Value::String(s)) => allowed.contains(&s.as_str()),
        Some(_) => false,
    };
    if !kind_fits {
        out.diagnostics.push((
            "wrong_kind".into(),
            format!(
                "{file} is stamped type {}, which the {root} root does not read (it reads {}).",
                crate::json::stringify(stamped.unwrap(), 0),
                allowed.join(", ")
            ),
        ));
    }
    let mut view = doc.clone();
    let static_root = root == "themes" || root == "icon-definitions";
    if check || static_root {
        match doctypes::parser_for(root)(&doc, label.unwrap_or(&file)) {
            Ok(parsed) => {
                if use_parsed || static_root {
                    view = parsed;
                }
            }
            Err(e) => {
                out.diagnostics.push(("invalid_doc".into(), e.clone()));
                out.failed = Some(e);
            }
        }
    }
    if let Some(o) = overlay {
        view = overlay_authored_doc(&view, &o);
    }
    out.view = Some(view);
    Ok(out)
}

/// `readDocView(file, options)`: the doc a reader sees. `Ok(None)` is a file
/// that exports no doc (`undefined`), read without `strict`.
pub fn read_doc_view(file: &str, opts: &ReadDocOptions) -> Result<Option<Value>, String> {
    let authored = load_authored(file, opts);
    let r = lower_doc_view(&opts.root, opts.label.as_deref(), authored, opts.strict || opts.check, opts.value_parsed)?;
    if let Some(e) = r.load_failed {
        return Err(e);
    }
    if r.missing {
        if opts.strict {
            let exported: Vec<String> = match &opts.exports {
                Some(e) => e.clone(),
                None => doc_exports(&opts.root).iter().map(|s| s.to_string()).collect(),
            };
            if r.missing_value.is_none() {
                if let Some(problem) = missing_doc_problem(file, opts, &exported) {
                    return Err(format!("{} {problem}", opts.label.as_deref().unwrap_or(file)));
                }
            }
            let v = r.missing_value.clone().unwrap_or_else(super::zod::undefined);
            doctypes::parser_for(&opts.root)(&v, opts.label.as_deref().unwrap_or(file))?;
        }
        return Ok(r.missing_value);
    }
    if opts.strict {
        if let Some(f) = r.failed {
            return Err(f);
        }
    }
    if let Some(o) = r.overlay_failed {
        return Err(o);
    }
    Ok(r.view)
}

fn missing_doc_problem(file: &str, opts: &ReadDocOptions, exported: &[String]) -> Option<String> {
    if opts.root == "themes" {
        return None;
    }
    let fix = "Fix: export the doc object as the default export: `export default {type: ..., name: ..., ...}`.";
    let text = np::read_text(file)?;
    let code = strip_comments(&text);
    if code.trim_matches(super::paths::js_ws).is_empty() {
        return Some(format!("is empty, so it documents nothing. {fix}"));
    }
    let ns = docmod::import(file, opts.loader).ok()?;
    let names: Vec<&String> = ns.keys().filter(|k| *k != "default").collect();
    let takes: Vec<String> =
        exported.iter().map(|n| if n == "default" { "default export".to_string() } else { format!("`{n}` export") }).collect();
    let found = if names.is_empty() {
        " (it exports nothing)".to_string()
    } else {
        format!(" (it exports {})", names.iter().map(|n| format!("`{n}`")).collect::<Vec<_>>().join(", "))
    };
    Some(format!("has no {}{found}, so it documents nothing. {fix}", takes.join(" or ")))
}

fn strip_comments(text: &str) -> String {
    let t = text.strip_prefix('\u{feff}').unwrap_or(text);
    let block = regress::Regex::with_flags(r"\/\*[\s\S]*?\*\/", "gu").unwrap();
    let mut s = String::new();
    let mut last = 0;
    for m in block.find_iter(t) {
        s.push_str(&t[last..m.start()]);
        last = m.end();
    }
    s.push_str(&t[last..]);
    let line = regress::Regex::with_flags(r"(^|[^:])\/\/.*$", "gmu").unwrap();
    let mut out = String::new();
    let mut last = 0;
    for m in line.find_iter(&s) {
        out.push_str(&s[last..m.start()]);
        out.push_str(&s[m.group(1).unwrap()]);
        last = m.end();
    }
    out.push_str(&s[last..]);
    out
}

// ── component-loader.mjs ────────────────────────────────────────────────────

fn locale_of(lang: Option<&str>, zh: bool, dense: bool) -> Option<String> {
    match lang {
        Some(l) if !l.is_empty() => Some(l.to_string()),
        _ if dense => Some("dense".into()),
        _ if zh => Some("zh".into()),
        _ => None,
    }
}

/// `loadComponentDoc(docPath, {lang, root})`: strict read.
pub fn load_component_doc(doc_path: &str, lang: Option<&str>, root: Option<&str>) -> Result<Option<Value>, String> {
    let mut o = ReadDocOptions::new(root.unwrap_or("components"));
    o.lang = locale_of(lang, false, false);
    o.label = Some(doc_path.into());
    o.strict = true;
    read_doc_view(doc_path, &o)
}

/// `loadDocs(readmePath, {lang, root})`: unchecked native read.
pub fn load_docs(path: &str, lang: Option<&str>, root: Option<&str>) -> Result<Option<Value>, String> {
    let mut o = ReadDocOptions::new(root.unwrap_or("components"));
    o.lang = locale_of(lang, false, false);
    o.label = Some(path.into());
    o.loader = Loader::Native;
    read_doc_view(path, &o)
}

// ── Topic files ─────────────────────────────────────────────────────────────

/// `OVERLAY_LANGUAGES`.
pub const OVERLAY_LANGUAGES: [&str; 2] = ["zh", "dense"];

/// `overlayPath(docPath, lang)`.
pub fn overlay_path(doc_path: &str, lang: &str) -> String {
    let base = np::basename(doc_path);
    let stem = base.strip_suffix(".doc.mjs").unwrap_or(&base);
    np::join2(&np::dirname(doc_path), &format!("{stem}.doc.{lang}.mjs"))
}

/// A loaded topic file (`loadTopicFile` result).
#[derive(Debug, Clone)]
pub struct TopicFile {
    pub file: String,
    pub doc: Option<Value>,
    pub error: Option<String>,
    pub overlay: Option<Value>,
    pub overlay_error: Option<String>,
}

/// `loadTopicFile(docPath, lang)`.
pub fn load_topic_file(doc_path: &str, lang: Option<&str>) -> TopicFile {
    let file = np::basename(doc_path);
    let mut out = TopicFile { file: file.clone(), doc: None, error: None, overlay: None, overlay_error: None };
    let doc = docmod::import_native_module(doc_path)
        .map_err(|e| e.message)
        .and_then(|ns| {
            let v = docmod::first_export(&ns, &["docs", "default"]).cloned().unwrap_or_else(super::zod::undefined);
            doctypes::parse_readable_doc(&v, &file)
        });
    match doc {
        Err(e) => {
            out.error = Some(e);
            return out;
        }
        Ok(d) => out.doc = Some(d),
    }
    let Some(lang) = lang else { return out };
    let tp = overlay_path(doc_path, lang);
    if !np::exists(&tp) {
        return out;
    }
    match docmod::import_native_module(&tp) {
        Ok(ns) => {
            let o = ns
                .get("docsZh")
                .filter(|v| js_truthy(Some(v)))
                .or_else(|| ns.get("docsDense").filter(|v| js_truthy(Some(v))))
                .cloned();
            out.overlay = o;
        }
        Err(e) => out.overlay_error = Some(e.message),
    }
    out
}

/// `overlayLanguages(entry)`: the overlay languages any of the files has.
pub fn overlay_languages(files: &[&str]) -> Vec<&'static str> {
    OVERLAY_LANGUAGES.iter().copied().filter(|l| files.iter().any(|f| np::exists(&overlay_path(f, l)))).collect()
}
