//! Port of api/swizzle/copy/copy.mjs: copy one component's source into the
//! project, with the internal modules it needs.

use super::exports as ex;
use super::graph::{self, Choice};
use super::jspath as p;
use super::path_safety::{assert_within, sanitize_name};
use crate::cli::command::Suggestion;
use crate::json::{Map, Value};
use regress::Regex;
use std::collections::{HashMap, HashSet};

pub const CORE_PACKAGE: &str = "@astryxdesign/core";
const DEFAULT_ISSUES_URL: &str = "https://github.com/meta/astryx/issues/new";
const SWIZZLE_MARKER: &str = "astryx-swizzle.json";

#[derive(Debug, Clone)]
pub struct ApiError {
    pub message: String,
    pub suggestions: Vec<Suggestion>,
    pub code: String,
}

pub fn api_err(message: impl Into<String>, suggestions: Vec<Suggestion>, code: &str) -> ApiError {
    ApiError { message: message.into(), suggestions, code: code.into() }
}

pub fn resolve_core(cwd: &str) -> Result<(String, Vec<String>), ApiError> {
    let Some(core) = ex::find_project_core_dir(cwd) else {
        return Err(api_err(
            "Could not find @astryxdesign/core package. Make sure you are inside the design system monorepo or have @astryxdesign/core installed.",
            vec![],
            "ERR_CORE_NOT_FOUND",
        ));
    };
    let comps = ex::list_components(&core);
    Ok((core, comps))
}

/// `loadConfigSafely(cwd)`: the loaded integrations and Core's issues URL.
fn load_config_safely(cwd: &str) -> (Vec<crate::discovery::component_discovery::LoadedIntegration>, Option<String>) {
    match crate::discovery::project::Project::load_with(cwd, true) {
        Ok(project) => (
            project.loaded_integrations.iter().map(to_loaded).collect(),
            project.issues_url(Some(CORE_PACKAGE)),
        ),
        Err(_) => (Vec::new(), None),
    }
}

/// A loaded integration record as the component readers take it.
pub fn to_loaded(r: &crate::discovery::integrations::Record) -> crate::discovery::component_discovery::LoadedIntegration {
    let s = |k: &str| r.get(k).and_then(|v| v.as_str()).map(String::from);
    crate::discovery::component_discovery::LoadedIntegration {
        name: s("name").unwrap_or_default(),
        version: s("version"),
        components: s("components").map(std::path::PathBuf::from),
        issues_url: s("issuesUrl"),
        package_dir: s("__packageDir").map(std::path::PathBuf::from),
        package_exports: r.get("__packageExports").cloned(),
        provider_id: s("providerId"),
        autolinked: r.get("__autolinked").and_then(|v| v.as_bool()).unwrap_or(false),
        load_error: crate::commands::init::shared::present(r.get("__loadError")),
    }
}

fn package_version_of(dir: &str) -> String {
    match ex::read_json(&p::join2(dir, "package.json")) {
        Some(v) => match v.get("version") {
            None | Some(Value::Null) => "0".into(),
            Some(Value::String(s)) => s.clone(),
            Some(other) => crate::cli::format::js_string(other),
        },
        None => "0".into(),
    }
}

fn entry_files_of(component_dir: &str) -> Vec<String> {
    for name in ["index.ts", "index.tsx", "index.mjs", "index.js"] {
        let f = p::join2(component_dir, name);
        if p::exists(&f) {
            return vec![f];
        }
    }
    let code = Regex::new(r"\.[cm]?[jt]sx?$").unwrap();
    let skip = Regex::new(r"\.(?:test|spec|stories|doc)\.").unwrap();
    let dts = Regex::new(r"\.d\.[cm]?ts$").unwrap();
    p::readdir(component_dir)
        .unwrap_or_default()
        .into_iter()
        .filter(|f| code.find(f).is_some() && skip.find(f).is_none() && dts.find(f).is_none())
        .map(|f| p::join2(component_dir, &f))
        .filter(|f| p::is_file(f))
        .collect()
}

fn to_module_path(src_root: &str, file: &str) -> String {
    let rel = p::relative(src_root, file);
    match Regex::new(r"\.[cm]?[jt]sx?$").unwrap().find(&rel) {
        Some(m) => rel[..m.start()].to_string(),
        None => rel,
    }
}

fn is_within(target: &str, root: &str) -> bool {
    let rel = p::relative(root, target);
    rel.is_empty() || (!rel.starts_with("..") && !p::is_absolute(&rel))
}

fn versioned_path(dest: &str, version: &str, n: usize) -> String {
    let ext = Regex::new(r"(\.stylex)?\.[cm]?[jt]sx?$").unwrap().find(dest).map(|m| dest[m.start()..].to_string()).unwrap_or_else(|| p::extname(dest));
    let stem = &dest[..dest.len() - ext.len()];
    format!("{stem}.v{version}{}{ext}", if n > 1 { format!("-{n}") } else { String::new() })
}

fn check_gh_cli() -> bool {
    let path = std::env::var("PATH").unwrap_or_default();
    for dir in path.split(':') {
        // Node's search-path walk resolves an empty entry against the cwd.
        let d = if dir.is_empty() { "." } else { dir };
        let f = p::join2(d, "gh");
        if let Ok(m) = std::fs::metadata(&f) {
            use std::os::unix::fs::PermissionsExt;
            if m.is_file() && m.permissions().mode() & 0o111 != 0 {
                return true;
            }
        }
    }
    false
}

fn build_feedback(component: &str, issues_url: Option<&str>) -> Option<Value> {
    let url = issues_url.filter(|u| !u.is_empty())?;
    let mut fb = Map::new();
    fb.insert("issuesUrl".into(), Value::String(url.into()));
    let re = Regex::new(r"^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues(?:\/new)?\/?$").unwrap();
    if let Some(m) = re.find(url) {
        if check_gh_cli() {
            let owner = &url[m.group(1).unwrap()];
            let repo = &url[m.group(2).unwrap()];
            fb.insert("ghCommand".into(), Value::String(format!("gh issue create --repo {owner}/{repo} --title \"[{component}] Swizzle feedback\"")));
        }
    }
    Some(Value::Object(fb))
}

fn confine(target: &str, cwd: &str, allow_abs: bool, label: &str) -> Result<String, ApiError> {
    assert_within(target, cwd, allow_abs, label).map_err(|e| api_err(e.message, vec![], "ERR_PATH_TRAVERSAL"))
}

fn read_existing(dest: &str) -> Option<String> {
    if !p::exists(dest) {
        return None;
    }
    Some(std::fs::read(dest).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default())
}

pub struct CopyOptions {
    pub cwd: String,
    pub output: String,
    pub package: Option<String>,
    pub overwrite: bool,
}

struct Output {
    dest: String,
    content: String,
    component: bool,
    owner: bool,
    exists: bool,
    unchanged: bool,
    marker: bool,
}

pub fn swizzle_copy(component: &str, opts: &CopyOptions) -> Result<Value, ApiError> {
    let cwd = opts.cwd.as_str();
    let (core_dir, components) = resolve_core(cwd)?;
    let dir_name = component.strip_prefix("XDS").unwrap_or(component).to_string();
    sanitize_name(&dir_name, "component name").map_err(|e| api_err(e.message, vec![], "ERR_PATH_TRAVERSAL"))?;

    let (integrations, project_issues) = load_config_safely(cwd);
    let core_issues_url: Option<String> = project_issues;
    let pkg = opts.package.as_deref();

    if pkg != Some(CORE_PACKAGE) && !integrations.is_empty() {
        let reps = crate::discovery::component_replacement::resolve_component_replacements(Some(std::path::Path::new(&core_dir)), &integrations, "");
        if let Some(rep) = reps.for_target(&dir_name) {
            let copy_name = crate::discovery::component_discovery::doc_stem(&rep.doc_path);
            if !copy_name.is_empty() && (pkg.is_none() || (pkg == Some(rep.package.as_str()) && copy_name != dir_name)) {
                let next = CopyOptions { cwd: opts.cwd.clone(), output: opts.output.clone(), package: Some(rep.package.clone()), overwrite: opts.overwrite };
                return swizzle_copy(&copy_name, &next);
            }
        }
    }

    use crate::discovery::component_discovery::{find_component_readme, find_integration_component, unscoped_component_owners, NameHold};
    // (package, sourceDir, issuesUrl, hold)
    let mut found: Vec<(String, Option<String>, Option<String>, NameHold)> = Vec::new();
    let core_component_dir = p::join(&[&core_dir, "src", &dir_name]);
    let core_folder = p::exists(&core_component_dir);
    if !core_folder && !p::exists(&p::join2(&core_dir, "src")) {
        return Err(api_err(format!("ENOENT: no such file or directory, scandir '{}'", p::join2(&core_dir, "src")), vec![], "ERR_UNKNOWN"));
    }
    if core_folder || find_component_readme(std::path::Path::new(&core_dir), &dir_name).is_some() {
        found.push((
            CORE_PACKAGE.into(),
            if core_folder { Some(core_component_dir.clone()) } else { None },
            Some(core_issues_url.clone().filter(|u| !u.is_empty()).unwrap_or_else(|| DEFAULT_ISSUES_URL.into())),
            NameHold::Core,
        ));
    }
    for integ in &integrations {
        let Some(fc) = find_integration_component(integ, &dir_name) else { continue };
        found.push((
            integ.name.clone(),
            fc.source_path.as_ref().map(|s| p::dirname(&s.to_string_lossy())),
            integ.issues_url.clone(),
            fc.hold,
        ));
    }
    let scoped = if pkg.is_some() { found.clone() } else { unscoped_component_owners(&found, |o| o.3) };
    let owners: Vec<(String, Option<String>, Option<String>)> =
        scoped.into_iter().filter(|o| o.0 != CORE_PACKAGE || o.1.is_some()).map(|o| (o.0, o.1, o.2)).collect();
    if owners.is_empty() {
        return Err(api_err(
            format!("Component \"{component}\" not found."),
            components.iter().take(10).map(|n| Suggestion { name: n.clone(), reason: None }).collect(),
            "ERR_UNKNOWN_COMPONENT",
        ));
    }
    let owner = if let Some(pk) = pkg {
        match owners.iter().find(|o| o.0 == pk) {
            Some(o) => o.clone(),
            None => {
                return Err(api_err(
                    format!("Component \"{dir_name}\" is not provided by package \"{pk}\"."),
                    owners.iter().map(|o| Suggestion::new(o.0.clone(), "provides this component")).collect(),
                    "ERR_UNKNOWN_COMPONENT",
                ))
            }
        }
    } else if owners.len() > 1 {
        return Err(api_err(
            format!("Component \"{dir_name}\" is provided by multiple packages. Re-run with --package <pkg> to choose one."),
            owners.iter().map(|o| Suggestion::new(o.0.clone(), "provides this component")).collect(),
            "ERR_AMBIGUOUS_COMPONENT",
        ));
    } else {
        owners[0].clone()
    };
    let (owner_package, source_dir, issues_url) = owner;
    let component_dir = match source_dir {
        Some(d) if p::exists(&d) => d,
        _ => return Err(api_err(format!("No source found for \"{dir_name}\" in package \"{owner_package}\"."), vec![], "ERR_NO_SOURCE")),
    };

    let output_base = confine(&opts.output, cwd, false, "output directory")?;
    let output_dir = p::join2(&output_base, &dir_name);
    let feedback = build_feedback(&dir_name, issues_url.as_deref());

    let package_dir = ex::find_package_root(&component_dir).unwrap_or_else(|| component_dir.clone());
    let package_src = p::join2(&package_dir, "src");
    let in_package_src = component_dir.starts_with(&format!("{package_src}/"));
    let graph_root = if in_package_src { package_src.clone() } else { package_dir.clone() };
    let src_root = if in_package_src { package_src.clone() } else { p::dirname(&component_dir) };
    let plan = graph::plan_copy(&package_dir, &graph_root, &component_dir, &owner_package, &entry_files_of(&component_dir));
    let owner_version = package_version_of(&package_dir);

    let depth = p::relative(&src_root, &component_dir).split('/').count();
    let ups: Vec<&str> = std::iter::repeat("..").take(depth).collect();
    let mut parts = vec![output_dir.as_str()];
    parts.extend(ups.iter());
    let shifted_root = p::resolve(&parts);
    let layout_root = if is_within(&shifted_root, &output_base) { shifted_root } else { output_base.clone() };
    let comp_prefix = format!("{component_dir}/");
    let src_prefix = format!("{src_root}/");
    let is_component_file = |f: &str| f.starts_with(&comp_prefix);
    let layout_dest_of = |f: &str| -> Option<String> {
        if f.starts_with(&comp_prefix) {
            return Some(p::join2(&output_dir, &p::relative(&component_dir, f)));
        }
        if f.starts_with(&src_prefix) {
            return Some(p::join2(&layout_root, &p::relative(&src_root, f)));
        }
        None
    };
    let all_files: Vec<String> = plan.files.keys().cloned().collect();
    let mut taken: HashSet<String> = all_files.iter().filter_map(|f| layout_dest_of(f)).collect();
    let mut root_dests: HashMap<String, String> = HashMap::new();
    let other_package_of = |f: &str| -> Option<(String, String)> {
        for (root, name) in &plan.other_packages {
            if f.starts_with(&format!("{root}/")) {
                return Some((root.clone(), name.rsplit('/').next().unwrap_or(name).to_string()));
            }
        }
        None
    };
    let version_of = |f: &str| -> String {
        match other_package_of(f) {
            Some((root, _)) => package_version_of(&ex::find_package_root(&root).unwrap_or(root)),
            None => owner_version.clone(),
        }
    };
    let mut sorted = all_files.clone();
    sorted.sort();
    for f in &sorted {
        if layout_dest_of(f).is_some() {
            continue;
        }
        let other = other_package_of(f);
        let base = match &other {
            Some((_, folder)) => folder.clone(),
            None => p::basename(&package_dir),
        };
        let package_path = p::relative(other.as_ref().map(|o| o.0.as_str()).unwrap_or(&graph_root), f);
        let mut dest = if other.is_some() { p::join(&[&output_base, &base, &package_path]) } else { p::join2(&output_base, &package_path) };
        let mut n = 1;
        while taken.contains(&dest) {
            let folder = if n == 1 && other.is_none() { base.clone() } else { format!("{base}-{n}") };
            dest = p::join(&[&output_base, &folder, &package_path]);
            n += 1;
        }
        taken.insert(dest.clone());
        root_dests.insert(f.clone(), dest);
    }
    let base_dest_of = |f: &str| -> String { layout_dest_of(f).unwrap_or_else(|| root_dests[f].clone()) };

    let component_files: Vec<String> = all_files.iter().filter(|f| is_component_file(f)).cloned().collect();
    let helpers: Vec<String> = all_files.iter().filter(|f| !is_component_file(f)).cloned().collect();
    let owner_module = Regex::new(r"^privateAttributes\/[^/]+\.stylex$").unwrap();
    let stylex_module = Regex::new(r"\.stylex(?:\.[cm]?[jt]sx?)?$").unwrap();
    let root_of = |f: &str| other_package_of(f).map(|o| o.0).unwrap_or_else(|| src_root.clone());
    let mut owner_group: HashSet<String> = HashSet::new();
    let mut queue: std::collections::VecDeque<String> = helpers.iter().filter(|f| owner_module.find(&to_module_path(&root_of(f), f)).is_some()).cloned().collect();
    while let Some(f) = queue.pop_front() {
        if !owner_group.insert(f.clone()) {
            continue;
        }
        if let Some(deps) = plan.depends_on.get(&f) {
            for dep in deps {
                if !is_component_file(dep) && stylex_module.find(&to_module_path(&root_of(dep), dep)).is_some() {
                    queue.push_back(dep.clone());
                }
            }
        }
    }

    let mut redirected: HashMap<String, String> = HashMap::new();
    let dest_of = |redirected: &HashMap<String, String>, f: &str| -> String { redirected.get(f).cloned().unwrap_or_else(|| base_dest_of(f)) };
    let render = |redirected: &HashMap<String, String>, f: &str| -> String {
        let spec_of = |c: &Choice| match c {
            Choice::Fixed(s) => s.clone(),
            Choice::Rel { from, to } => graph::relative_specifier_between(&dest_of(redirected, from), &dest_of(redirected, to)),
        };
        graph::render_file(&plan.files[f], &spec_of)
    };
    let mut attempts: HashMap<String, usize> = HashMap::new();
    let mut moved = true;
    while moved {
        moved = false;
        for f in &helpers {
            if owner_group.contains(f) {
                continue;
            }
            let existing = read_existing(&dest_of(&redirected, f));
            match existing {
                None => continue,
                Some(e) if e == render(&redirected, f) => continue,
                _ => {}
            }
            let a = attempts.get(f).copied().unwrap_or(0) + 1;
            attempts.insert(f.clone(), a);
            redirected.insert(f.clone(), versioned_path(&base_dest_of(f), &version_of(f), a));
            moved = true;
        }
    }

    let mut outputs: Vec<Output> = Vec::new();
    for f in component_files.iter().chain(helpers.iter()) {
        let dest = confine(&dest_of(&redirected, f), cwd, true, "output file")?;
        let content = render(&redirected, f);
        let existing = read_existing(&dest);
        outputs.push(Output {
            unchanged: existing.as_deref() == Some(content.as_str()),
            exists: existing.is_some(),
            dest,
            content,
            component: is_component_file(f),
            owner: owner_group.contains(f),
            marker: false,
        });
    }
    let existing_files = outputs.iter().filter(|o| o.component && o.exists).count();
    let changed_shared: Vec<&Output> = outputs.iter().filter(|o| o.owner && o.exists && !o.unchanged).collect();
    if (existing_files > 0 || !changed_shared.is_empty()) && !opts.overwrite {
        let rel_out = {
            let r = p::relative(cwd, &output_dir);
            if r.is_empty() {
                ".".to_string()
            } else {
                r
            }
        };
        let shared_note = if changed_shared.is_empty() {
            String::new()
        } else {
            format!(
                " and {} changed shared module(s) ({})",
                changed_shared.len(),
                changed_shared.iter().map(|s| p::relative(cwd, &s.dest)).collect::<Vec<_>>().join(", ")
            )
        };
        return Err(api_err(
            format!("Refusing to overwrite {existing_files} existing file(s) in {rel_out}/{shared_note}. Re-run with --overwrite (or -f) to replace them."),
            vec![],
            "ERR_FILE_EXISTS",
        ));
    }

    let marker_dest = confine(&p::join2(&output_base, SWIZZLE_MARKER), cwd, true, "output file")?;
    let marker_existing = read_existing(&marker_dest);
    let marker_content = swizzle_marker_content(marker_existing.as_deref(), &owner_package, &owner_version);
    let found_in_base: Vec<String> = if marker_existing.is_none() && p::is_dir(&output_base) { p::readdir(&output_base).unwrap_or_default() } else { vec![] };
    let marks = found_in_base.is_empty();
    if marks {
        outputs.push(Output {
            unchanged: marker_existing.as_deref() == Some(marker_content.as_str()),
            dest: marker_dest.clone(),
            content: marker_content,
            component: false,
            owner: false,
            exists: false,
            marker: true,
        });
    }
    let output_dir_existed = p::exists(&output_dir);
    let mut created_dirs: Vec<String> = Vec::new();
    let mut written: Vec<(String, Option<Vec<u8>>)> = Vec::new();
    let mut copied = 0usize;
    for o in &outputs {
        let counts = !o.marker;
        if o.unchanged {
            if counts {
                copied += 1;
            }
            continue;
        }
        let res = (|| -> std::io::Result<()> {
            let original = if p::exists(&o.dest) { Some(std::fs::read(&o.dest)?) } else { None };
            let dir = p::dirname(&o.dest);
            if let Some(first) = first_missing_dir(&dir) {
                std::fs::create_dir_all(&dir)?;
                created_dirs.push(first);
            } else {
                std::fs::create_dir_all(&dir)?;
            }
            written.push((o.dest.clone(), original));
            std::fs::write(&o.dest, &o.content)?;
            Ok(())
        })();
        match res {
            Ok(()) => {
                if counts {
                    copied += 1;
                }
            }
            Err(e) => {
                let unrestored = undo_copy(&written);
                for d in created_dirs.iter().rev() {
                    js_rm_rf(d).map_err(|m| api_err(m, vec![], "ERR_UNKNOWN"))?;
                }
                if !output_dir_existed {
                    js_rm_rf(&output_dir).map_err(|m| api_err(m, vec![], "ERR_UNKNOWN"))?;
                }
                return Err(write_failed(&o.dest, cwd, &e, &unrestored));
            }
        }
    }
    if !p::exists(&output_dir) {
        let _ = std::fs::create_dir_all(&output_dir);
    }
    // Only the planned outputs are listed (not the marker).
    let file_outputs: Vec<&Output> = outputs.iter().filter(|o| !o.marker).collect();
    let mut data = Map::new();
    data.insert("component".into(), Value::String(dir_name.clone()));
    data.insert("package".into(), Value::String(owner_package.clone()));
    data.insert("outputDir".into(), Value::String(p::relative(cwd, &output_dir)));
    data.insert("filesCopied".into(), Value::from(copied as u64));
    data.insert("files".into(), Value::Array(file_outputs.iter().map(|o| Value::String(p::relative(&output_dir, &o.dest))).collect()));
    data.insert("usesStyleX".into(), Value::Bool(file_outputs.iter().any(|o| o.content.contains("@stylexjs/stylex"))));
    let mut deps = Map::new();
    for (k, v) in &plan.dependencies {
        deps.insert(k.clone(), Value::String(v.clone()));
    }
    data.insert("dependencies".into(), Value::Object(deps));
    let mut marker = Map::new();
    marker.insert("path".into(), Value::String(p::relative(cwd, &marker_dest)));
    marker.insert("written".into(), Value::Bool(marks));
    if !marks {
        marker.insert("found".into(), Value::Array(found_in_base.iter().take(5).map(|s| Value::String(s.clone())).collect()));
    }
    data.insert("marker".into(), Value::Object(marker));
    if let Some(fb) = feedback {
        data.insert("feedback".into(), fb);
    }
    let mut resp = Map::new();
    resp.insert("type".into(), Value::String("swizzle.copy".into()));
    resp.insert("package".into(), Value::String(owner_package));
    resp.insert("data".into(), Value::Object(crate::json::js_key_order(data)));
    Ok(Value::Object(resp))
}

/// `fs.rmSync(path, {recursive: true, force: true})`: a missing path is fine;
/// a path below a file throws Node's ENOTDIR error.
fn js_rm_rf(path: &str) -> Result<(), String> {
    match std::fs::symlink_metadata(path) {
        Ok(m) => {
            let _ = if m.is_dir() { std::fs::remove_dir_all(path) } else { std::fs::remove_file(path) };
            Ok(())
        }
        Err(e) if e.raw_os_error() == Some(20) => Err(format!("ENOTDIR: not a directory, unlink '{path}'")),
        Err(_) => Ok(()),
    }
}

/// The outermost folder `mkdirSync(dir, {recursive: true})` would create.
fn first_missing_dir(dir: &str) -> Option<String> {
    if p::exists(dir) {
        return None;
    }
    let mut cur = dir.to_string();
    loop {
        let parent = p::dirname(&cur);
        if parent == cur || p::exists(&parent) {
            return Some(cur);
        }
        cur = parent;
    }
}

fn swizzle_marker_content(existing: Option<&str>, owner_package: &str, version: &str) -> String {
    let mut packages = Map::new();
    if let Some(e) = existing {
        if let Ok(Value::Object(parsed)) = serde_json::from_str::<Value>(e) {
            if let Some(Value::Object(pk)) = parsed.get("packages") {
                packages = pk.clone();
            } else if let Some(Value::Array(a)) = parsed.get("packages") {
                // `{...array}` spreads index keys.
                for (i, v) in a.iter().enumerate() {
                    packages.insert(i.to_string(), v.clone());
                }
            }
        }
    }
    packages.insert(owner_package.into(), Value::String(version.into()));
    let packages = crate::json::js_key_order(packages);
    let mut root = Map::new();
    root.insert("packages".into(), Value::Object(packages));
    format!("{}\n", crate::json::stringify(&Value::Object(root), 2))
}

fn undo_copy(written: &[(String, Option<Vec<u8>>)]) -> Vec<String> {
    let mut unrestored = Vec::new();
    for (dest, original) in written.iter().rev() {
        let ok = match original {
            None => std::fs::remove_file(dest).or_else(|e| if e.kind() == std::io::ErrorKind::NotFound { Ok(()) } else { Err(e) }).is_ok(),
            Some(orig) => {
                let cur = std::fs::read(dest).ok();
                if cur.as_ref() != Some(orig) {
                    std::fs::write(dest, orig).is_ok()
                } else {
                    true
                }
            }
        };
        if !ok {
            unrestored.push(dest.clone());
        }
    }
    unrestored
}

fn errno_name(e: &std::io::Error) -> Option<&'static str> {
    Some(match e.raw_os_error()? {
        1 => "EPERM",
        2 => "ENOENT",
        13 => "EACCES",
        17 => "EEXIST",
        20 => "ENOTDIR",
        21 => "EISDIR",
        28 => "ENOSPC",
        30 => "EROFS",
        _ => return None,
    })
}

fn write_failed(target: &str, cwd: &str, e: &std::io::Error, unrestored: &[String]) -> ApiError {
    let rel = {
        let r = p::relative(cwd, target);
        if r.is_empty() {
            target.to_string()
        } else {
            r
        }
    };
    let errno = errno_name(e);
    let why = if matches!(errno, Some("EACCES") | Some("EPERM")) { " (no permission)" } else { "" };
    let outcome = if unrestored.is_empty() {
        "Nothing was written.".to_string()
    } else {
        format!(
            "Earlier writes could not all be undone: {}.",
            unrestored.iter().map(|f| { let r = p::relative(cwd, f); if r.is_empty() { f.clone() } else { r } }).collect::<Vec<_>>().join(", ")
        )
    };
    api_err(format!("Could not write {rel}{}{why}. {outcome}", errno.map(|e| format!(": {e}")).unwrap_or_default()), vec![], "ERR_WRITE_FAILED")
}
