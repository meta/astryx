//! Port of `foundation/render/page-worker.mjs`: load the page through the
//! module loader and render its default export with React's own static
//! renderer (React and the page are npm/user modules, run in-process).
//!
//! The page's local module graph is read first (oxc): each bare import is
//! resolved here, so outside a project React, React DOM and StyleX come from
//! the CLI's package set and Astryx packages fall back to it; stylesheet and
//! asset imports are recorded and replaced with small modules.

use super::page::{asset_data_uri, is_asset_path, package_of, rerr, PageText, RenderError, Served, WorkerOut};
use crate::discovery::nodepath as np;
use crate::js::resolve::{resolve, Mode, Resolved};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

const SINGLE_COPY: [&str; 3] = ["react", "react-dom", "@stylexjs/stylex"];

fn is_local(file: &str, entry: &str, root: &str) -> bool {
    let root_prefix = if root.ends_with('/') { root.to_string() } else { format!("{root}/") };
    !file.contains("/node_modules/") && (file == entry || file.starts_with(&root_prefix))
}

fn resolve_file(spec: &str, from: &str) -> Option<String> {
    match resolve(spec, Path::new(from), Mode::Jiti) {
        Ok(Resolved::File(f)) => Some(f.to_string_lossy().to_string()),
        _ => None,
    }
}

/// Every module specifier one source imports or re-exports, in order.
fn imports_of(source: &str, file: &str) -> Result<Vec<String>, String> {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::{Expression, Statement};
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    let alloc = Allocator::default();
    let st = SourceType::from_path(file).unwrap_or_else(|_| SourceType::tsx()).with_jsx(true);
    let ret = Parser::new(&alloc, source, st).parse();
    if let Some(e) = ret.diagnostics.first() {
        return Err(e.message.to_string());
    }
    let mut out = Vec::new();
    for s in &ret.program.body {
        match s {
            Statement::ImportDeclaration(d) => out.push(d.source.value.as_str().unwrap_or("").to_string()),
            Statement::ExportAllDeclaration(d) => out.push(d.source.value.as_str().unwrap_or("").to_string()),
            Statement::ExportFromDeclaration(d) => out.push(d.source.value.as_str().unwrap_or("").to_string()),
            _ => {}
        }
    }
    // Dynamic import('x') with a literal anywhere in the source.
    let _ = Expression::is_literal;
    let re = regress::Regex::new(r#"\bimport\(\s*(['"])([^'"]+)\1\s*\)"#).unwrap();
    for m in re.find_iter(source) {
        out.push(source[m.group(2).unwrap()].to_string());
    }
    Ok(out)
}

pub struct Plan {
    pub aliases: Vec<(String, PathBuf)>,
    pub local_files: Vec<String>,
    pub packages: Vec<String>,
    pub imported_css: Vec<(String, String)>,
    pub package_css: Vec<(String, String)>,
    pub skipped_css: Vec<String>,
    pub assets: Vec<String>,
    pub from_set: Vec<(String, String)>,
    pub texts: Vec<PageText>,
    pub fn_texts: Vec<(String, Vec<String>)>,
    /// Per module, the stylesheets, JSON and images it imports.
    pub side_files: Vec<(String, Vec<String>)>,
}

fn push_side(p: &mut Plan, owner: &str, f: String) {
    if !p.local_files.contains(&f) {
        p.local_files.push(f.clone());
    }
    match p.side_files.iter_mut().find(|(o, _)| o == owner) {
        Some((_, l)) => {
            if !l.contains(&f) {
                l.push(f)
            }
        }
        None => p.side_files.push((owner.to_string(), vec![f])),
    }
}

fn stub_dir() -> PathBuf {
    let base = std::env::var("TMPDIR").unwrap_or_else(|_| "/tmp".into());
    let d = Path::new(&base).join(format!("astryx-render-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&d);
    d
}

fn package_dir_of(file: &str, name: &str) -> String {
    let mut d = np::dirname(file);
    while np::dirname(&d) != d {
        if np::read_json(&np::join2(&d, "package.json")).and_then(|p| p.get("name").and_then(|v| v.as_str()).map(String::from)).as_deref() == Some(name) {
            return d;
        }
        d = np::dirname(&d);
    }
    np::dirname(file)
}

/// Read the page's local graph and decide how every import resolves.
pub fn plan(entry: &str, root: &str, served: Option<&Served>) -> Result<Plan, RenderError> {
    let served_parent = served.map(|s| np::join2(&s.dir, "package.json"));
    let mut p = Plan {
        aliases: vec![],
        local_files: vec![],
        packages: vec![],
        imported_css: vec![],
        package_css: vec![],
        skipped_css: vec![],
        assets: vec![],
        from_set: vec![],
        texts: vec![],
        fn_texts: vec![],
        side_files: vec![],
    };
    let stubs = stub_dir();
    let empty = stubs.join("empty.mjs");
    let _ = std::fs::write(&empty, "export default {};\n");
    let mut aliased: HashSet<String> = HashSet::new();
    let mut queue = vec![entry.to_string()];
    let mut seen: HashSet<String> = HashSet::new();
    let mut add_alias = |p: &mut Plan, spec: &str, target: PathBuf| {
        if aliased.insert(spec.to_string()) {
            p.aliases.push((spec.to_string(), target));
        }
    };
    // React's automatic JSX runtime is imported by every JSX module.
    let mut runtime_specs: Vec<String> = vec!["react".into(), "react/jsx-runtime".into(), "react/jsx-dev-runtime".into()];
    while let Some(file) = queue.pop() {
        if !seen.insert(file.clone()) {
            continue;
        }
        if !p.local_files.contains(&file) {
            p.local_files.push(file.clone());
        }
        let Ok(source) = std::fs::read_to_string(&file) else { continue };
        if file.ends_with(".json") {
            continue;
        }
        let specs = match imports_of(&source, &file) {
            Ok(s) => s,
            Err(m) => return Err(rerr("ERR_RENDER_COMPILE", format!("The page does not compile: {m}"))),
        };
        if file != entry || true {
            super::texts::collect(&source, &file, &mut p.texts, &mut p.fn_texts);
        }
        let dir = np::dirname(&file);
        for spec in specs {
            let raw = spec.split('?').next().unwrap_or("").to_string();
            let relative = raw.starts_with('.') || raw.starts_with('/');
            if !relative {
                let pkg = package_of(&raw);
                if !p.packages.contains(&pkg) {
                    p.packages.push(pkg.clone());
                }
            }
            let lower = raw.to_lowercase();
            if lower.ends_with(".json") && relative {
                let f = np::resolve(&[&dir, &raw]);
                if np::exists(&f) && !p.local_files.contains(&f) {
                    push_side(&mut p, &file, f);
                }
                continue;
            }
            if lower.ends_with(".scss") || lower.ends_with(".sass") || lower.ends_with(".less") {
                p.skipped_css.push(raw.clone());
                add_alias(&mut p, &spec, empty.clone());
                continue;
            }
            if lower.ends_with(".css") {
                if relative {
                    let f = np::resolve(&[&dir, &raw]);
                    if !np::exists(&f) {
                        return Err(rerr("ERR_FILE_NOT_FOUND", format!("{} imports {spec}, which does not exist.", np::basename(&file))));
                    }
                    if !p.imported_css.iter().any(|(x, _)| *x == f) {
                        p.imported_css.push((f.clone(), std::fs::read_to_string(&f).unwrap_or_default()));
                        if !p.local_files.contains(&f) {
                            push_side(&mut p, &file, f);
                        }
                    }
                } else {
                    p.package_css.push((raw.clone(), file.clone()));
                }
                add_alias(&mut p, &spec, empty.clone());
                continue;
            }
            if is_asset_path(&raw) && relative {
                let f = np::resolve(&[&dir, &raw]);
                let uri = asset_data_uri(&f)?;
                if !p.assets.contains(&f) {
                    p.assets.push(f.clone());
                }
                if !p.local_files.contains(&f) {
                    push_side(&mut p, &file, f.clone());
                }
                let stub = stubs.join(format!("asset-{}.mjs", p.assets.len()));
                let mut lit = String::new();
                crate::json::quote(&mut lit, &uri);
                let _ = std::fs::write(&stub, format!("export default {lit};\n"));
                add_alias(&mut p, &spec, stub);
                continue;
            }
            if relative {
                if let Some(f) = resolve_file(&raw, &file) {
                    if is_local(&f, entry, root) {
                        queue.push(f);
                    }
                }
                continue;
            }
            runtime_specs.push(raw.clone());
        }
    }
    // Bare specifiers: React, React DOM and StyleX from the set when there is
    // one; a served package the page's folder lacks, from the set.
    let mut extra = vec!["react-dom/server.browser".to_string()];
    extra.extend(runtime_specs.iter().cloned());
    for spec in extra {
        let pkg = package_of(&spec);
        if let Some(sp) = &served_parent {
            if SINGLE_COPY.contains(&pkg.as_str()) {
                if let Some(f) = resolve_file(&spec, sp) {
                    add_alias(&mut p, &spec, PathBuf::from(&f));
                    continue;
                }
            }
        }
        if resolve_file(&spec, entry).is_some() {
            continue;
        }
        if let (Some(s), Some(sp)) = (served, &served_parent) {
            if super::page::is_served_package(&pkg, &s.integrations) {
                if let Some(f) = resolve_file(&spec, sp) {
                    if !p.from_set.iter().any(|(n, _)| *n == pkg) {
                        p.from_set.push((pkg.clone(), package_dir_of(&f, &pkg)));
                    }
                    add_alias(&mut p, &spec, PathBuf::from(&f));
                }
            }
        }
    }
    Ok(p)
}

const GLUE: &str = r#"const logs = [];
const msg = e => String(e && e.message !== undefined ? e.message : e);
export async function run(entry, reactSpec, serverSpec) {
  let mod;
  try { mod = await import(entry); } catch (e) { return {stage: 'import', error: msg(e), name: e && e.name, code: e && e.code, logs}; }
  const Page = mod && mod.default !== undefined ? mod.default : (typeof mod === 'function' ? mod : undefined);
  if (typeof Page !== 'function' && typeof (Page && Page.$$typeof) !== 'symbol') return {noDefault: true, logs};
  let React, server;
  try { const r = await import(reactSpec); React = r.default || r; const s = await import(serverSpec); server = s.default || s; }
  catch (e) { return {stage: 'react', error: msg(e), name: e && e.name, code: e && e.code, logs}; }
  try { return {markup: server.renderToStaticMarkup(React.createElement(Page)), logs}; }
  catch (e) { return {stage: 'render', error: msg(e), name: e && e.name, code: e && e.code, logs}; }
}
"#;

fn classify(message: &str, name: &str) -> RenderError {
    let message = regress::Regex::new(r"^\/[^:\n]*: ").unwrap().find(message).map(|m| message[m.end()..].to_string()).unwrap_or_else(|| message.to_string());
    if message.contains("suspended while responding to synchronous input") || message.contains("A component suspended") {
        return rerr("ERR_RENDER_FAILED", "The page waits for data while rendering (a component suspended), and a static render cannot wait. Load the data first, or render a version of the page that has it.");
    }
    let missing = regress::Regex::new(r#"Cannot find (?:module|package) ['"]([^'"]+)['"]"#)
        .unwrap()
        .find(&message)
        .map(|m| message[m.group(1).unwrap()].to_string());
    if let Some(spec) = missing {
        if !spec.starts_with('.') && !spec.starts_with('/') {
            let pkg = package_of(&spec);
            return RenderError {
                code: "ERR_RENDER_MISSING_DEPENDENCY".into(),
                message: format!("The page imports {pkg}, which is not installed"),
                package: Some(pkg),
            };
        }
        return rerr("ERR_FILE_NOT_FOUND", format!("The page imports {spec}, which does not exist"));
    }
    if name == "SyntaxError" || message.contains("Unexpected token") {
        return rerr("ERR_RENDER_COMPILE", format!("The page does not compile: {}", message.split('\n').next().unwrap_or("")));
    }
    let browser = regress::Regex::new(r"\b(window|document|localStorage|sessionStorage|navigator|location|matchMedia|requestAnimationFrame|IntersectionObserver|ResizeObserver|HTMLElement|customElements) is not defined").unwrap();
    if let Some(m) = browser.find(&message) {
        let api = &message[m.group(1).unwrap()];
        return rerr(
            "ERR_RENDER_BROWSER_API",
            format!("The page uses `{api}` while rendering, and a rendered page has no browser yet. Read it inside useEffect, or guard it with typeof {api} !== 'undefined'."),
        );
    }
    rerr("ERR_RENDER_FAILED", format!("The page threw while rendering: {}", message.split('\n').next().unwrap_or("")))
}

/// Run the page and answer what the JS worker posts.
pub fn run_worker(entry: &str, root: &str, served: Option<&Served>, timeout_ms: u64) -> Result<WorkerOut, RenderError> {
    let served = served.filter(|_| crate::discovery::paths::find_node_modules_package(&np::dirname(entry), "@astryxdesign/core").is_none());
    let plan = plan(entry, root, served)?;
    let stubs = stub_dir();
    let glue = stubs.join("glue.mjs");
    std::fs::write(&glue, GLUE).map_err(|e| rerr("ERR_RENDER_FAILED", format!("The page could not be rendered: {e}")))?;
    let opts = crate::js::CallOptions {
        timeout_ms: Some(timeout_ms),
        capture_output: true,
        jiti: crate::js::JitiOptions { force: true, aliases: plan.aliases.clone(), jsx_automatic: true, ..Default::default() },
        ..Default::default()
    };
    let target_of = |spec: &str| -> String {
        plan.aliases
            .iter()
            .find(|(s, _)| s == spec)
            .map(|(_, f)| f.to_string_lossy().to_string())
            .or_else(|| resolve_file(spec, entry))
            .unwrap_or_else(|| spec.to_string())
    };
    let args = [
        crate::json::Value::String(entry.to_string()),
        crate::json::Value::String(target_of("react")),
        crate::json::Value::String(target_of("react-dom/server.browser")),
    ];
    crate::js::capture_console(true);
    crate::js::record_loads(true);
    let r = crate::js::call_export(&glue, &["run"], &args, &opts);
    let loads = crate::js::record_loads(false);
    let console = crate::js::capture_console(false);
    let _ = std::fs::remove_dir_all(&stubs);
    let v = match r {
        Ok(r) => r.value,
        Err(crate::js::CallError::Timeout { .. }) => {
            return Err(rerr(
                "ERR_RENDER_TIMEOUT",
                format!("The page did not finish rendering within {} seconds, so it was stopped. Look for a loop that never ends or a promise the page waits on.", timeout_ms / 1000),
            ))
        }
        Err(crate::js::CallError::Thrown { error, .. }) => return Err(classify(&error.message, &error.name)),
        Err(crate::js::CallError::Load(e)) => return Err(classify(&e.message, &e.name)),
        Err(e) => return Err(rerr("ERR_RENDER_FAILED", format!("The page could not be rendered: {e:?}"))),
    };
    let logs: Vec<(String, String)> = console
        .into_iter()
        .filter(|(l, t)| l != "trace" && !t.starts_with("[BABEL]"))
        .collect();
    // Local files in load order, each followed by the files it imports
    // for their content (stylesheets, JSON, images).
    let mut files: Vec<String> = vec![];
    for f in loads {
        let f = f.to_string_lossy().to_string();
        if !is_local(&f, entry, root) || f == glue.to_string_lossy() || f.starts_with(&*stubs.to_string_lossy()) {
            continue;
        }
        if !files.contains(&f) {
            files.push(f.clone());
        }
        for (owner, side) in &plan.side_files {
            if *owner == f {
                for x in side {
                    if !files.contains(x) {
                        files.push(x.clone());
                    }
                }
            }
        }
    }
    if files.is_empty() {
        files = plan.local_files.clone();
    }
    if v.get("noDefault").and_then(|x| x.as_bool()) == Some(true) {
        return Err(rerr(
            "ERR_RENDER_NO_DEFAULT_EXPORT",
            "The page has no default export to render. Export the page component: export default function Page() { … }",
        ));
    }
    if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
        return Err(classify(err, v.get("name").and_then(|n| n.as_str()).unwrap_or("")));
    }
    let mut from_set = plan.from_set.clone();
    // The render always runs on React; StyleX only when the page uses it.
    if let Some(s) = served {
        let sp = np::join2(&s.dir, "package.json");
        for name in SINGLE_COPY {
            if name == "@stylexjs/stylex" && !plan.packages.iter().any(|p| p == name) {
                continue;
            }
            if let Some(f) = resolve_file(&format!("{name}/package.json"), &sp) {
                if !from_set.iter().any(|(n, _)| n == name) {
                    from_set.push((name.to_string(), np::dirname(&f)));
                }
            }
        }
    }
    Ok(WorkerOut {
        markup: v.get("markup").and_then(|m| m.as_str()).unwrap_or("").to_string(),
        css: String::new(),
        imported_css: plan.imported_css,
        packages: plan.packages,
        package_css: plan.package_css,
        skipped_css: plan.skipped_css,
        from_set,
        charts_failed: 0,
        charts_alone: None,
        assets: plan.assets,
        files,
        texts: plan.texts,
        fn_texts: plan.fn_texts,
        logs,
    })
}
