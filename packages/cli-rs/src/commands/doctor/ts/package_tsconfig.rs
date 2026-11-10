//! Port of `foundation/discovery/package-tsconfig.mjs` (`openPackageProject`):
//! the package's TypeScript project as `tsc` reads it, opened on this CLI's
//! TypeScript 7 through a virtual tsconfig that extends the package's config.

use super::Ts;
use crate::discovery::nodepath as np;
use crate::ts7::session::{flatten_diagnostic, Project};
use serde_json::Value as Json;
use std::collections::HashMap;

pub struct Opened {
    pub project: Option<Project>,
    /// The project's compiler options (`project.compilerOptions`).
    pub options: Json,
    pub declarations: Vec<String>,
    pub config_path: Option<String>,
    pub error: Option<String>,
}

const DEFAULTS: &str = r#""jsx":"react-jsx","target":"es2022","module":"esnext","moduleResolution":"bundler","strict":true,"allowJs":true,"resolveJsonModule":true,"allowImportingTsExtensions":true"#;
const CHECK_ONLY: &str = r#""noEmit":true,"skipLibCheck":true,"incremental":false,"composite":false"#;

/// `readJsonc(text)`.
fn read_jsonc(text: &str) -> Option<Json> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '"' {
            let mut j = i + 1;
            while j < chars.len() && chars[j] != '"' {
                j += if chars[j] == '\\' { 2 } else { 1 };
            }
            out.extend(&chars[i..(j + 1).min(chars.len())]);
            i = j;
        } else if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            out.push('\n');
        } else if c == '/' && chars.get(i + 1) == Some(&'*') {
            let rest: String = chars[i + 2..].iter().collect();
            i = match rest.find("*/") {
                Some(p) => i + 2 + rest[..p].chars().count() + 1,
                None => chars.len(),
            };
            out.push(' ');
        } else {
            out.push(c);
        }
        i += 1;
    }
    let cleaned = crate::doctor_re!(r",(\s*[}\]])", "g").replace_all(&out, "$1");
    np::parse_json(&cleaned)
}

#[derive(PartialEq, Clone, Copy)]
enum Ambient {
    Yes,
    No,
    Maybe,
}

/// `ambientCandidate(file)`.
fn ambient_candidate(file: &str) -> Ambient {
    if crate::doctor_re!(r"\.d\.[cm]?ts$").find(file).is_some() {
        return Ambient::Yes;
    }
    let Ok(text) = std::fs::read(file).map(|b| String::from_utf8_lossy(&b).into_owned()) else { return Ambient::No };
    if crate::doctor_re!(r"\bdeclare\s+(?:global|module)\b").find(&text).is_some() {
        return Ambient::Yes;
    }
    if crate::doctor_re!(r"\.tsx?$").find(file).is_none() {
        return Ambient::No;
    }
    if crate::doctor_re!(r"\b(?:import|export)\b").find(&text).is_some() {
        Ambient::Maybe
    } else {
        Ambient::Yes
    }
}

/// `filesEntries(configPath, dir)`.
fn files_entries(config_path: &str, dir: &str) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    let mut at = config_path.to_string();
    while !at.is_empty() && !seen.contains(&at) {
        seen.push(at.clone());
        let Ok(text) = std::fs::read_to_string(&at) else { return vec![] };
        let Some(raw) = read_jsonc(&text).filter(|r| r.is_object()) else { return vec![] };
        if let Some(files) = raw.get("files").and_then(|f| f.as_array()) {
            return files
                .iter()
                .filter_map(|f| f.as_str())
                .map(|f| {
                    if f.starts_with("${configDir}") {
                        f.to_string()
                    } else {
                        let r = np::relative(dir, &np::resolve(&[&np::dirname(&at), f]));
                        if r.is_empty() {
                            ".".into()
                        } else {
                            r
                        }
                    }
                })
                .collect();
        }
        let Some(base) = raw.get("extends").and_then(|e| e.as_str()) else { return vec![] };
        if crate::doctor_re!(r"^\.{1,2}[\\/]").find(base).is_none() {
            return vec![];
        }
        at = np::resolve(&[&np::dirname(&at), base]);
        if !at.ends_with(".json") {
            at.push_str(".json");
        }
    }
    vec![]
}

fn find_config(dir: &str) -> Option<String> {
    let mut at = np::resolve1(dir);
    loop {
        let file = np::join2(&at, "tsconfig.json");
        if np::exists(&file) {
            return Some(file);
        }
        let parent = np::dirname(&at);
        if parent == at {
            return None;
        }
        at = parent;
    }
}

#[derive(Clone, Default)]
struct Parsed {
    file_names: Vec<String>,
    options: Json,
    references: Vec<String>,
    unreadable: bool,
}

fn parse(t: &mut Ts, cache: &mut HashMap<String, Parsed>, config_path: &str) -> Parsed {
    if let Some(p) = cache.get(config_path) {
        return p.clone();
    }
    let text = std::fs::read(config_path).ok().map(|b| String::from_utf8_lossy(&b).into_owned());
    let mut result = Parsed { unreadable: text.is_none(), options: Json::Object(Default::default()), ..Default::default() };
    if let Some(text) = &text {
        let raw = read_jsonc(text);
        if let Some(config) = t.s.parse_config_file(config_path) {
            result.file_names = config.get("fileNames").and_then(|f| f.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
            result.options = config.get("options").filter(|o| !o.is_null()).cloned().unwrap_or(Json::Object(Default::default()));
        }
        for r in raw.as_ref().and_then(|r| r.get("references")).and_then(|r| r.as_array()).cloned().unwrap_or_default() {
            let Some(p) = r.get("path").and_then(|p| p.as_str()) else { continue };
            let mut next = np::resolve(&[&np::dirname(config_path), p]);
            if !next.ends_with(".json") {
                next = np::join2(&next, "tsconfig.json");
            }
            result.references.push(next);
        }
    }
    cache.insert(config_path.to_string(), result.clone());
    result
}

fn first_config_problem(t: &mut Ts, project: &Project) -> Option<String> {
    let ds = t.s.scope(project).diagnostics("ConfigFileParsing", None).unwrap_or_default();
    ds.iter().find(|d| !matches!(d.get("code").and_then(|c| c.as_u64()), Some(18002) | Some(18003))).map(|d| flatten_diagnostic(d, " "))
}

/// `configProblem(session, configPath, unreadable)`.
fn config_problem(t: &mut Ts, config_path: &str, unreadable: bool) -> Option<String> {
    if unreadable {
        return Some(format!("Cannot read file '{config_path}'."));
    }
    let project = t
        .s
        .project_with(&np::dirname(config_path), &[], r#"{"noLib":true,"noResolve":true,"types":[]}"#, &[], Some(config_path), Some(&[]))
        .ok()?;
    first_config_problem(t, &project)
}

/// `openPackageProject(session, packageDir, sources)`.
pub fn open_package_project(t: &mut Ts, package_dir: &str, sources: &[String]) -> Opened {
    let where_ = |f: &str| np::relative(package_dir, f);
    let mut cache: HashMap<String, Parsed> = HashMap::new();
    let found = find_config(package_dir);
    let installed = found.as_ref().map(|f| np::relative(&np::dirname(f), package_dir).split('/').any(|x| x == "node_modules")).unwrap_or(false);
    let mut chosen = if installed { None } else { found };
    let own: Vec<String> = sources.iter().map(|f| np::resolve1(f)).collect();
    if let Some(start) = chosen.clone() {
        let mut visited: Vec<String> = vec![np::resolve1(&start)];
        let mut visited_refs: Vec<String> = Vec::new();
        fn including(t: &mut Ts, cache: &mut HashMap<String, Parsed>, own: &[String], config: &str, visited: &mut Vec<String>, refs: &mut Vec<String>) -> Option<String> {
            let p = parse(t, cache, config);
            if p.file_names.iter().any(|f| own.contains(&np::resolve1(f))) {
                return Some(config.to_string());
            }
            for next in p.references {
                if visited.contains(&next) {
                    continue;
                }
                visited.push(next.clone());
                refs.push(next.clone());
                if let Some(hit) = including(t, cache, own, &next, visited, refs) {
                    return Some(hit);
                }
            }
            None
        }
        match including(t, &mut cache, &own, &start, &mut visited, &mut visited_refs) {
            Some(hit) => chosen = Some(hit),
            None => {
                for r in &visited_refs {
                    let unreadable = parse(t, &mut cache, r).unreadable;
                    if let Some(problem) = config_problem(t, r, unreadable) {
                        return Opened {
                            project: None,
                            options: Json::Object(Default::default()),
                            declarations: vec![],
                            config_path: None,
                            error: Some(format!("{}: {problem}", where_(r))),
                        };
                    }
                }
            }
        }
    }
    open_with(t, package_dir, sources, chosen.as_deref(), &mut cache)
}

fn open_with(t: &mut Ts, package_dir: &str, sources: &[String], config_path: Option<&str>, cache: &mut HashMap<String, Parsed>) -> Opened {
    let where_ = |f: &str| np::relative(package_dir, f);
    let config = config_path.map(|c| parse(t, cache, c));
    let candidates: Vec<(String, Ambient)> = config
        .as_ref()
        .map(|c| c.file_names.clone())
        .unwrap_or_default()
        .into_iter()
        .map(|name| {
            let file = if np::exists(&name) {
                name.clone()
            } else {
                [".ts", ".tsx", ".d.ts", ".cts", ".d.cts", ".mts", ".d.mts"].iter().map(|e| format!("{name}{e}")).find(|w| np::exists(w)).unwrap_or(name.clone())
            };
            let a = ambient_candidate(&file);
            (file, a)
        })
        .collect();
    let dir = match config_path {
        Some(c) => np::dirname(c),
        None => np::resolve1(package_dir),
    };
    let entries = config_path.map(|c| files_entries(c, &dir)).unwrap_or_default();
    let mut root_names: Vec<String> = Vec::new();
    for f in entries.into_iter().chain(sources.iter().map(|f| np::resolve1(f))).chain(candidates.iter().filter(|c| c.1 != Ambient::No).map(|c| c.0.clone())) {
        if !root_names.contains(&f) {
            root_names.push(f);
        }
    }
    let options = match (config_path, &config) {
        (Some(_), Some(c)) => {
            let jsx_unset = c.options.get("jsx").map(|j| j.is_null()).unwrap_or(true);
            format!("{{{CHECK_ONLY}{}}}", if jsx_unset { r#","jsx":"react-jsx""# } else { "" })
        }
        _ => format!("{{{DEFAULTS},{CHECK_ONLY}}}"),
    };
    let project = match t.s.project_with(&dir, &root_names, &options, &[], config_path, Some(&[])) {
        Ok(p) => p,
        Err(e) => {
            return Opened { project: None, options: Json::Object(Default::default()), declarations: vec![], config_path: None, error: Some(e) };
        }
    };
    let mut error: Option<String> = None;
    if let Some(cp) = config_path {
        if let Some(problem) = first_config_problem(t, &project) {
            error = Some(format!("{}: {problem}", where_(cp)));
        } else {
            let ds = t.s.scope(&project).diagnostics("Program", None).unwrap_or_default();
            if let Some(missing) = ds.iter().find(|d| matches!(d.get("code").and_then(|c| c.as_u64()), Some(6053) | Some(6231))) {
                let text = missing.get("text").and_then(|x| x.as_str()).unwrap_or("");
                let rel = np::relative(package_dir, &dir);
                let with = if rel.is_empty() { String::new() } else { format!("{rel}/") };
                error = Some(format!("{}: {}", where_(cp), text.split(&format!("{dir}/")).collect::<Vec<_>>().join(&with)));
            }
        }
    }
    let mut declarations = Vec::new();
    for (file, a) in &candidates {
        let keep = match a {
            Ambient::Yes => true,
            Ambient::Maybe => {
                let sf = t.s.source_file(&project, file);
                !sf.is_undefined() && t.s.syntax.external_module_indicator(&sf).is_none()
            }
            Ambient::No => false,
        };
        if keep {
            declarations.push(file.clone());
        }
    }
    let options_json = t.s.project_compiler_options(&project);
    Opened {
        project: Some(project),
        options: options_json,
        declarations,
        config_path: if config_path.is_some() && error.is_none() { config_path.map(String::from) } else { None },
        error,
    }
}
