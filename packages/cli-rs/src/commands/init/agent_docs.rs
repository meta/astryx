//! Port of foundation/agent-docs (agent-docs.mjs, agent-doc-state.mjs,
//! agent-docs-target.mjs): where the managed Astryx block goes, how it is
//! rendered, installed, refreshed and removed.

use crate::commands::swizzle::jspath as p;
use crate::commands::swizzle::path_safety::{assert_within, PathSafetyError};
use regress::Regex;
use std::collections::{BTreeSet, HashMap, HashSet};

pub const AGENTS_MD: &str = "AGENTS.md";
pub const CLAUDE_MD: &str = "CLAUDE.md";
pub const CLAUDE_DIR_MD: &str = ".claude/CLAUDE.md";
pub const GEMINI_MD: &str = "GEMINI.md";
pub const CURSOR_RULES: &str = ".cursorrules";
pub const HERMES_DOT_MD: &str = ".hermes.md";
pub const HERMES_MD: &str = "HERMES.md";

pub const WORKFLOW_TITLE: &str = "WORKFLOW — start every page from a template, never from scratch:";
pub const WORKFLOW_STEPS: &[&str] = &[
    "1. `astryx build \"<idea>\"` — names the template to scaffold from and the parts it lacks.",
    "2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.",
    "3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.",
];
pub const SELF_CHECK_CSS: &str = "replace any raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or a token";

pub const MARKER_START: &str = "<!-- ASTRYX:START -->";
pub const MARKER_END: &str = "<!-- ASTRYX:END -->";
pub const LEGACY_MARKER_START: &str = "<!-- XDS:START -->";
pub const LEGACY_MARKER_END: &str = "<!-- XDS:END -->";

pub const AGENT_DOC_PATHS: &[&str] = &[AGENTS_MD, CLAUDE_MD, CLAUDE_DIR_MD, GEMINI_MD, CURSOR_RULES, HERMES_DOT_MD, HERMES_MD];
const MAX_PROJECT_AGENT_DOC_LINES: usize = 32;
const CREATED_HEADER_AGENTS: &str = "# AGENTS.md\n\nProject-specific guidance for AI coding agents.";

/// A failure while writing agent docs, as the JS throws it.
#[derive(Debug, Clone)]
pub enum DocsError {
    PathSafety(PathSafetyError),
    Home(String),
    Other(String),
}

impl From<PathSafetyError> for DocsError {
    fn from(e: PathSafetyError) -> Self {
        DocsError::PathSafety(e)
    }
}

/// Lines a run prints, in order: (stderr?, text).
pub type Log = Vec<(bool, String)>;

pub fn discover_agent_docs(dir: &str) -> Vec<&'static str> {
    AGENT_DOC_PATHS.iter().copied().filter(|r| p::exists(&p::join2(dir, r))).collect()
}

fn read(path: &str) -> Option<String> {
    std::fs::read(path).ok().map(|b| String::from_utf8_lossy(&b).into_owned())
}

/// JS `String#trim`.
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(crate::cli::format::js_ws)
}
fn js_trim_end(s: &str) -> &str {
    s.trim_end_matches(crate::cli::format::js_ws)
}
fn js_trim_start(s: &str) -> &str {
    s.trim_start_matches(crate::cli::format::js_ws)
}

// ---- target folder (agent-docs-target.mjs) ----

pub fn real_dir(p_: &str) -> String {
    p::realpath(&p::resolve1(p_)).unwrap_or_else(|| p::resolve1(p_))
}

fn home() -> Option<String> {
    std::env::var("HOME").ok().filter(|h| !h.is_empty())
}

fn relative_to_home(dir: &str) -> Option<String> {
    let h = home()?;
    Some(p::relative(&real_dir(&h), &real_dir(dir)))
}

fn is_home_folder(dir: &str) -> bool {
    relative_to_home(dir).as_deref() == Some("")
}

fn is_home_or_settings_folder(dir: &str) -> bool {
    let Some(rel) = relative_to_home(dir) else { return false };
    if rel.is_empty() {
        return true;
    }
    if rel == ".." || rel.starts_with("../") || p::is_absolute(&rel) {
        return false;
    }
    let parts: Vec<&str> = rel.split('/').collect();
    if !parts[0].starts_with('.') {
        return false;
    }
    let mut current = real_dir(dir);
    let mut depth = parts.len();
    while depth > 1 {
        if p::exists(&p::join2(&current, "package.json")) {
            return false;
        }
        current = p::dirname(&current);
        depth -= 1;
    }
    true
}

pub fn home_error_message(dir: &str) -> String {
    format!("Agent docs are not written into the home folder, or into a settings folder in it outside a project ({dir}): agents read the files there in every project. Run init inside a project folder.")
}

pub fn assert_agent_docs_target(dir: &str) -> Result<(), DocsError> {
    if is_home_or_settings_folder(dir) {
        return Err(DocsError::Home(home_error_message(&real_dir(dir))));
    }
    Ok(())
}

pub const REPOSITORY_MARKERS: &[&str] = &[".git", ".hg", ".sl"];
const DEP_FIELDS_TARGET: &[&str] = &["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/// Some(Some(json)) parsed; Some(None) unparsable; None missing.
fn read_package_json(dir: &str) -> Option<Option<serde_json::Value>> {
    let f = p::join2(dir, "package.json");
    if !p::exists(&f) {
        return None;
    }
    Some(read(&f).and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()).filter(|v| v.is_object() || v.is_array()))
}

fn declares_astryx(m: &Option<serde_json::Value>) -> bool {
    let Some(m) = m else { return false };
    DEP_FIELDS_TARGET.iter().any(|f| m.get(*f).and_then(|d| d.as_object()).map(|d| d.keys().any(|k| k.starts_with("@astryxdesign/"))).unwrap_or(false))
}

pub fn resolve_agent_docs_root(cwd: &str) -> Option<String> {
    let mut dir = p::resolve1(cwd);
    let mut nearest: Option<String> = None;
    let mut i = 0;
    while i < 50 && !is_home_folder(&dir) {
        if let Some(m) = read_package_json(&dir) {
            if declares_astryx(&m) {
                return Some(dir);
            }
            if nearest.is_none() {
                nearest = Some(dir.clone());
            }
        }
        if REPOSITORY_MARKERS.iter().any(|mk| p::exists(&p::join2(&dir, mk))) {
            break;
        }
        let parent = p::dirname(&dir);
        if parent == dir {
            break;
        }
        dir = parent;
        i += 1;
    }
    nearest
}

pub fn agent_docs_target_dir(cwd: &str) -> String {
    resolve_agent_docs_root(cwd).unwrap_or_else(|| cwd.to_string())
}

// ---- managed block ----

fn find_from(hay: &str, needle: &str, from: usize) -> Option<usize> {
    hay.get(from..)?.find(needle).map(|i| i + from)
}

/// `findManagedBlock`: Ok(None) when no block; Err on duplicate STARTs.
pub fn find_managed_block(content: &str) -> Result<Option<(usize, usize)>, String> {
    for (start, end) in [(MARKER_START, MARKER_END), (LEGACY_MARKER_START, LEGACY_MARKER_END)] {
        let Some(si) = content.find(start) else { continue };
        let Some(ei) = find_from(content, end, si + start.len()) else { continue };
        if find_from(content, start, si + start.len()).is_some() {
            return Err(format!("Malformed agent-docs block: multiple \"{start}\" markers found. Remove the duplicate/broken block manually, then re-run."));
        }
        return Ok(Some((si, ei + end.len())));
    }
    Ok(None)
}

fn without_managed_block(content: &str) -> String {
    match find_managed_block(content) {
        Ok(Some((s, e))) => format!("{}{}", &content[..s], &content[e..]),
        _ => content.to_string(),
    }
}

fn render_agents_import_block() -> String {
    format!("{MARKER_START}\n@./AGENTS.md\n{MARKER_END}")
}

fn is_agents_import_block(rel: &str, content: &str) -> bool {
    let Ok(Some((s, e))) = find_managed_block(content) else { return false };
    let text = &content[s..e];
    let a = text.find("-->").map(|i| i + 3).unwrap_or(2);
    let b = text.rfind("<!--").unwrap_or(0);
    let inner = if b >= a { js_trim(&text[a..b]) } else { "" };
    let Some(target) = inner.strip_prefix('@') else { return false };
    if target.is_empty() || target.chars().any(crate::cli::format::js_ws) || p::is_absolute(target) {
        return false;
    }
    p::normalize(&p::join2(&p::dirname(rel), target)) == AGENTS_MD
}

fn find_gemini_imports(content: &str) -> Vec<String> {
    let mut code: Vec<(usize, usize)> = Vec::new();
    let re = Regex::new(r"(`+)[\s\S]*?\1").unwrap();
    for m in re.find_iter(content) {
        code.push((m.start(), m.end()));
    }
    let mut found = Vec::new();
    let re2 = Regex::new(r"(?<=^|[ \t\r\n])@([^ \t\r\n]+)").unwrap();
    for m in re2.find_iter(content) {
        let g = &content[m.group(1).unwrap()];
        let first = g.chars().next().unwrap_or(' ');
        if !(first == '.' || first == '/' || first.is_ascii_alphabetic()) {
            continue;
        }
        if code.iter().any(|(s, e)| m.start() >= *s && m.start() < *e) {
            continue;
        }
        found.push(g.to_string());
    }
    found
}

fn gemini_imports_agents_md(target: &str) -> bool {
    let Some(content) = read(&p::join2(target, GEMINI_MD)) else { return false };
    let agents = p::resolve(&[target, AGENTS_MD]);
    find_gemini_imports(&without_managed_block(&content)).iter().any(|r| p::resolve(&[target, r]) == agents)
}

/// `readAgentDocImports`.
fn read_agent_doc_imports(target: &str, docs: &[&str], extra: &[&str]) -> Vec<(String, BTreeSet<String>)> {
    let known: HashSet<String> = docs.iter().chain(extra.iter()).map(|x| p::normalize(x)).collect();
    let mut out = Vec::new();
    let line_re = Regex::new(r"^\s*@([^\s]+)\s*$").unwrap();
    for rel in docs {
        let Some(c) = read(&p::join2(target, rel)) else { continue };
        let content = without_managed_block(&c);
        let mut targets = BTreeSet::new();
        // JS split(/\r?\n/)
        for line in content.split('\n') {
            let line = line.strip_suffix('\r').unwrap_or(line);
            let Some(m) = line_re.find(line) else { continue };
            let t = &line[m.group(1).unwrap()];
            if p::is_absolute(t) {
                continue;
            }
            let imported = p::normalize(&p::join2(&p::dirname(rel), t));
            if imported != p::normalize(rel) && known.contains(&imported) {
                targets.insert(imported);
            }
        }
        if !targets.is_empty() {
            out.push((rel.to_string(), targets));
        }
    }
    out
}

type Imports = Vec<(String, BTreeSet<String>)>;

fn find_agent_doc_wrappers(imports: &Imports) -> Imports {
    let map: HashMap<&str, &BTreeSet<String>> = imports.iter().map(|(k, v)| (k.as_str(), v)).collect();
    let is_cyclic = |start: &str| -> bool {
        fn visit(map: &HashMap<&str, &BTreeSet<String>>, start: &str, current: &str, seen: &mut HashSet<String>) -> bool {
            if let Some(ts) = map.get(current) {
                for t in ts.iter() {
                    if t == start {
                        return true;
                    }
                    if seen.contains(t) {
                        continue;
                    }
                    seen.insert(t.clone());
                    if visit(map, start, t, seen) {
                        return true;
                    }
                }
            }
            false
        }
        let mut seen = HashSet::new();
        seen.insert(start.to_string());
        visit(&map, start, start, &mut seen)
    };
    imports.iter().filter(|(r, _)| !is_cyclic(r)).cloned().collect()
}

fn has_wrapper(w: &Imports, k: &str) -> bool {
    w.iter().any(|(r, _)| r == k)
}

pub fn parse_block_version(content: &str) -> Option<String> {
    let re = Regex::new(r"Astryx v(\d+\.\d+\.\d+[^\s·]*)").unwrap();
    re.find(content).map(|m| content[m.group(1).unwrap()].to_string())
}

// ---- rendering ----

pub fn detect_styling_system(target: &str) -> &'static str {
    let f = p::join2(target, "package.json");
    if !p::exists(&f) {
        return "css";
    }
    let Some(pkg) = read(&f).and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()) else { return "css" };
    let has = |name: &str| {
        ["dependencies", "devDependencies"].iter().any(|k| pkg.get(*k).and_then(|d| d.as_object()).map(|d| d.contains_key(name)).unwrap_or(false))
    };
    let compilers = [
        "@stylexjs/babel-plugin", "@stylexjs/rollup-plugin", "@stylexjs/webpack-plugin", "@stylexjs/nextjs-plugin", "@stylexjs/unplugin",
        "vite-plugin-stylex", "unplugin-stylex", "@stylexswc/unplugin", "@stylexswc/nextjs-plugin", "stylex-webpack",
    ];
    if compilers.iter().any(|c| has(c)) {
        return "stylex";
    }
    if has("tailwindcss") {
        return "tailwind";
    }
    "css"
}

fn semver_parts(v: &str) -> Option<(u64, u64, u64)> {
    let mut it = v.split('.');
    let a = it.next()?.parse().ok()?;
    let b = it.next()?.parse().ok()?;
    let c = it.next()?.parse().ok()?;
    if it.next().is_some() {
        return None;
    }
    Some((a, b, c))
}

fn has_built_check(version: &str) -> bool {
    // isValidSemver: x.y.z with optional -prerelease / +build.
    let re = Regex::new(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$").unwrap();
    if re.find(version).is_none() {
        return false;
    }
    let mut sp = version.splitn(3, '-');
    let release = sp.next().unwrap_or("");
    let prerelease = sp.next();
    let release = release.split('+').next().unwrap_or("");
    if prerelease.is_some() && release == "0.7.4" {
        return false;
    }
    match semver_parts(release) {
        Some(r) => r >= (0, 7, 4),
        None => false,
    }
}

fn find_installed_package(dir: &str, name: &str) -> Option<String> {
    crate::discovery::paths::find_installed_package(dir, name, 6)
}

pub fn project_has_built_check(dir: &str) -> bool {
    let Some(inst) = find_installed_package(dir, "@astryxdesign/cli") else { return false };
    read(&p::join2(&inst, "package.json"))
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("version").and_then(|x| x.as_str()).map(has_built_check))
        .unwrap_or(false)
}

pub struct IntegrationDocs {
    pub package: String,
    pub append: Vec<String>,
}

pub struct IndexOptions<'a> {
    pub core_dir: Option<&'a str>,
    pub invocation: String,
    pub styling: &'static str,
    pub topics: Option<Vec<String>>,
    pub agent_docs: Vec<IntegrationDocs>,
    pub built_check: bool,
}

/// TEMP: replace with the component lane's discoverComponents count.
fn component_count(core_dir: &str) -> Option<usize> {
    crate::commands::init::temp::component_count(core_dir)
}

pub fn generate_compressed_index(version: &str, o: &IndexOptions) -> Result<String, String> {
    let total: usize = o.agent_docs.iter().map(|c| c.append.len()).sum();
    if total > MAX_PROJECT_AGENT_DOC_LINES {
        return Err(format!("Configured integrations contribute {total} agent-doc lines, exceeding the {MAX_PROJECT_AGENT_DOC_LINES}-line project limit."));
    }
    let run = &o.invocation;
    let mut lines: Vec<String> = vec![MARKER_START.into()];
    let mut count = "90+".to_string();
    if let Some(cd) = o.core_dir {
        if let Some(n) = component_count(cd) {
            if n > 0 {
                count = n.to_string();
            }
        }
    }
    lines.push(format!("Astryx v{version} · {count} components"));
    lines.push(format!("CLI: run every command as `{run} <cmd>` (shown below as `astryx ...`)."));
    lines.push(String::new());
    lines.push("SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:".into());
    lines.push("  import \"@astryxdesign/core/reset.css\";".into());
    lines.push("  import \"@astryxdesign/core/astryx.css\";".into());
    lines.push(String::new());
    lines.push(WORKFLOW_TITLE.into());
    lines.extend(WORKFLOW_STEPS.iter().map(|s| s.to_string()));
    lines.push("Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.".into());
    if o.built_check {
        lines.push("Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.".into());
    }
    lines.push(String::new());
    lines.push("RULES:".into());
    lines.push("- No <div> — components handle all layout and spacing.".into());
    lines.push("- Read `astryx docs layout` before changing a template's frame.".into());
    lines.push("- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.".into());
    match o.styling {
        "stylex" => lines.push("- Style with component props first, then the xstyle prop / StyleX tokens. No raw hex/px.".into()),
        "tailwind" => lines.push("- Style with component props first, then Tailwind utilities backed by tokens. No raw hex/px.".into()),
        _ => lines.push("- Style with component props first, then tokens (var(--color-*|--spacing-*|--radius-*)). No raw hex/px. No StyleX/Tailwind compiler here — don't use xstyle/utility classes directly. Some templates use StyleX and need a compiler plugin; see `astryx docs styling-overview`.".into()),
    }
    lines.push("- Palettes and custom colors go through the theme, never :root overrides. Run `astryx theme add <slug>` to import; `theme eject <slug>` only forks source. See `astryx docs theme`.".into());
    let fix = match o.styling {
        "stylex" => "replace any className=, style={{…}}, raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or the xstyle prop + a token",
        "tailwind" => "replace any style={{…}}, raw <div>/<span>, imported .css/@apply, or hardcoded/arbitrary value (bg-[#fff], p-[13px]) with the component or a token-backed utility",
        _ => SELF_CHECK_CSS,
    };
    lines.push(format!("- SELF-CHECK: re-read the file; {fix}."));
    lines.push(String::new());
    lines.push("`astryx help` lists every command. Key ones beyond the workflow:".into());
    lines.push("  search \"<query>\"   find any component / hook / doc / template".into());
    lines.push("  discover <words>   integrations you could add".into());
    let topics = match &o.topics {
        Some(t) => t.clone(),
        None => crate::commands::init::temp::fallback_topics(),
    };
    if !topics.is_empty() {
        let key = ["getting-started", "principles", "tokens", "theme"];
        let shown: Vec<&str> = key.iter().copied().filter(|t| topics.iter().any(|x| x == t)).collect();
        let suffix = if topics.len() > shown.len() { " …" } else { "" };
        lines.push(format!("  docs <topic>       {}{suffix} (`astryx docs` lists all)", shown.join(", ")));
    }
    lines.push("  docs cli           commands and API reference".into());
    lines.push("  docs authoring     build an integration package, and every field it holds".into());
    lines.push("  upgrade --from <old version> --apply   run after a dependency bump".into());
    if total > 0 {
        lines.push(String::new());
        lines.push("INTEGRATIONS:".into());
        for c in &o.agent_docs {
            for l in &c.append {
                lines.push(format!("- `{}`: {l}", c.package));
            }
        }
    }
    lines.push(MARKER_END.into());
    Ok(lines.join("\n"))
}

/// `getXdsVersion(coreDir)`: an unreadable package.json throws (Err).
pub fn get_xds_version(core_dir: Option<&str>, cli_root: &str) -> Result<String, String> {
    let ver = |f: &str| -> Result<String, String> {
        let v: serde_json::Value = serde_json::from_str(&read(f).unwrap_or_default()).map_err(|e| e.to_string())?;
        Ok(v.get("version").map(crate::cli::format::js_string).unwrap_or_else(|| "undefined".into()))
    };
    if let Some(cd) = core_dir {
        let f = p::join2(cd, "package.json");
        if p::exists(&f) {
            return ver(&f);
        }
    }
    ver(&p::join2(cli_root, "package.json"))
}

/// `renderAgentDocsBlock(targetDir)`.
pub fn render_agent_docs_block(target: &str, cli_root: &str) -> Result<String, String> {
    let core_dir = crate::commands::init::temp::find_core_dir(target);
    let version = get_xds_version(core_dir.as_deref(), cli_root)?;
    let project = crate::commands::init::temp::load_project(target)?;
    generate_compressed_index(
        &version,
        &IndexOptions {
            core_dir: core_dir.as_deref(),
            built_check: project_has_built_check(target),
            invocation: crate::discovery::package_manager::get_cli_invocation(Some(target)),
            styling: detect_styling_system(target),
            topics: Some(project.topics),
            agent_docs: project.agent_docs,
        },
    )
}

// ---- writing ----

/// `injectXdsBlock`. Ok(true) when written.
pub fn inject_xds_block(file: &str, index: &str, create_if_missing: bool, header: &str, only_replace: bool) -> Result<bool, DocsError> {
    let content;
    if p::exists(file) {
        let c = read(file).unwrap_or_default();
        match find_managed_block(&c).map_err(DocsError::Other)? {
            Some((s, e)) => content = format!("{}{}{}", &c[..s], index, &c[e..]),
            None => {
                if c.contains(MARKER_START) || c.contains(LEGACY_MARKER_START) {
                    return Err(DocsError::Other(format!(
                        "Malformed agent-docs block: found a start marker with no matching end in {file}. Remove the incomplete block manually, then re-run."
                    )));
                } else if only_replace {
                    return Ok(false);
                } else {
                    content = format!("{}\n\n{}\n", js_trim_end(&c), index);
                }
            }
        }
    } else if create_if_missing {
        content = if header.is_empty() { format!("{index}\n") } else { format!("{header}\n\n{index}\n") };
    } else {
        return Ok(false);
    }
    std::fs::write(file, content).map_err(|e| DocsError::Other(e.to_string()))?;
    Ok(true)
}

fn created_heading(rest: &str) -> bool {
    Regex::new(r"^# [^\n]+\n\nProject-specific guidance for AI coding agents\.$").unwrap().find(rest).is_some()
}

/// `removeXdsBlock`.
pub fn remove_xds_block(file: &str, delete_if_empty: bool, delete_if_blank: bool) -> Result<bool, DocsError> {
    if !p::exists(file) {
        return Ok(false);
    }
    let c = read(file).unwrap_or_default();
    let Some((s, e)) = find_managed_block(&c).map_err(DocsError::Other)? else { return Ok(false) };
    let before = js_trim_end(&c[..s]);
    let after = js_trim_start(&c[e..]);
    let content = format!("{before}{}\n", if after.is_empty() { String::new() } else { format!("\n\n{after}") });
    let rest = js_trim(&content);
    if (delete_if_blank && rest.is_empty()) || (delete_if_empty && (rest.is_empty() || created_heading(rest))) {
        let _ = std::fs::remove_file(file);
        return Ok(true);
    }
    std::fs::write(file, &content).map_err(|e| DocsError::Other(e.to_string()))?;
    Ok(true)
}

fn has_managed_marker(file: &str) -> bool {
    read(file).map(|c| c.contains(MARKER_START) || c.contains(LEGACY_MARKER_START)).unwrap_or(false)
}

fn has_removable_block(file: &str) -> bool {
    read(file).map(|c| matches!(find_managed_block(&c), Ok(Some(_)))).unwrap_or(false)
}

fn assert_targets_within(target: &str, rels: &[String]) -> Result<(), PathSafetyError> {
    for r in rels {
        assert_within(r, target, false, "agent docs path")?;
    }
    Ok(())
}

fn skip_escaping(target: &str, rels: &[String], skipped_out: &mut Vec<(String, String)>) -> HashSet<String> {
    let mut skipped = HashSet::new();
    for r in rels {
        if let Err(e) = assert_within(r, target, false, "agent docs path") {
            skipped.insert(r.clone());
            skipped_out.push((r.clone(), e.message));
        }
    }
    skipped
}

// -- ignore checks (claudeDirKeepsCopy) --

fn repository_root_of(dir: &str) -> Option<String> {
    let mut cur = p::resolve1(dir);
    loop {
        if REPOSITORY_MARKERS.iter().any(|m| p::exists(&p::join2(&cur, m))) {
            return Some(cur);
        }
        let parent = p::dirname(&cur);
        if parent == cur {
            return None;
        }
        cur = parent;
    }
}

fn untracked_ignored(root: &str, target: &str, rel: &str) -> Option<bool> {
    let (cmd, args, by_exit): (&str, Vec<&str>, bool) = if p::exists(&p::join2(root, ".git")) {
        ("git", vec!["check-ignore", "-q", "--"], true)
    } else if p::exists(&p::join2(root, ".sl")) {
        ("sl", vec!["status", "-i", "-n", "--"], false)
    } else if p::exists(&p::join2(root, ".hg")) {
        ("hg", vec!["status", "-i", "-n", "--"], false)
    } else {
        return None;
    };
    let out = std::process::Command::new(cmd)
        .args(&args)
        .arg(rel)
        .current_dir(target)
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;
    let code = out.status.code();
    if by_exit {
        return match code {
            Some(0) => Some(true),
            Some(1) => Some(false),
            _ => None,
        };
    }
    if code != Some(0) {
        return None;
    }
    Some(!js_trim(&String::from_utf8_lossy(&out.stdout)).is_empty())
}

fn uncommitted_here(target: &str, rel: &str, unreadable: bool) -> bool {
    match repository_root_of(target) {
        None => crate::commands::init::temp::ignored_here(target, rel).unwrap_or(unreadable),
        Some(root) => untracked_ignored(&root, target, rel).unwrap_or(unreadable),
    }
}

fn claude_dir_keeps_copy(target: &str) -> bool {
    if !uncommitted_here(target, CLAUDE_MD, true) {
        return false;
    }
    !uncommitted_here(target, CLAUDE_DIR_MD, false)
}

fn root_claude_holds(target: &str, block: &str) -> bool {
    if claude_dir_keeps_copy(target) {
        return false;
    }
    let Some(c) = read(&p::join2(target, CLAUDE_MD)) else { return false };
    match find_managed_block(&c) {
        Ok(Some((s, e))) => &c[s..e] == js_trim(block),
        _ => false,
    }
}

fn strip_managed_block(file: &str, index: &str) -> Result<bool, DocsError> {
    let delete_if_blank = p::basename(file) == "CLAUDE.md" && p::basename(&p::dirname(file)) == ".claude";
    if remove_xds_block(file, false, delete_if_blank)? {
        return Ok(true);
    }
    if has_managed_marker(file) {
        inject_xds_block(file, index, false, "", true)?;
    }
    Ok(false)
}

fn mkdirp(dir: &str) {
    let _ = std::fs::create_dir_all(dir);
}

#[allow(clippy::too_many_arguments)]
fn write_each_agent_doc(
    target: &str,
    existing: &[&str],
    given_wrappers: &Imports,
    index: &str,
    only_replace: bool,
    skipped_out: &mut Vec<(String, String)>,
    refuse_escapes: bool,
) -> Result<Vec<String>, DocsError> {
    let marked = |r: &str| has_managed_marker(&p::join2(target, r));
    let kept_copy = has_wrapper(given_wrappers, CLAUDE_DIR_MD) && marked(CLAUDE_DIR_MD) && claude_dir_keeps_copy(target);
    let wrappers: Imports = given_wrappers.iter().filter(|(r, _)| !(kept_copy && r == CLAUDE_DIR_MD)).cloned().collect();
    let is_import = |r: &str| read(&p::join2(target, r)).map(|c| is_agents_import_block(r, &c)).unwrap_or(false);
    let targets: Vec<String> = existing.iter().filter(|r| !has_wrapper(&wrappers, r) && !is_import(r)).map(|s| s.to_string()).collect();
    let writes: Vec<String> = targets.iter().filter(|r| !only_replace || marked(r)).cloned().collect();
    let strips: Vec<String> = wrappers.iter().map(|(r, _)| r.clone()).filter(|r| marked(r)).collect();
    let both: Vec<String> = writes.iter().chain(strips.iter()).cloned().collect();
    let candidates: Vec<String> = both.iter().filter(|r| !refuse_escapes || r.as_str() == GEMINI_MD).cloned().collect();
    let skipped = skip_escaping(target, &candidates, skipped_out);
    assert_targets_within(target, &both.iter().filter(|r| !skipped.contains(*r)).cloned().collect::<Vec<_>>())?;
    let mut written = Vec::new();
    for r in &targets {
        if skipped.contains(r) {
            continue;
        }
        if inject_xds_block(&p::join2(target, r), index, false, "", only_replace)? {
            written.push(r.clone());
        }
    }
    for (r, _) in &wrappers {
        if skipped.contains(r) {
            continue;
        }
        if r == CLAUDE_DIR_MD && (skipped.contains(CLAUDE_MD) || !root_claude_holds(target, index)) {
            continue;
        }
        if strip_managed_block(&p::join2(target, r), index)? {
            written.push(r.clone());
        }
    }
    Ok(written)
}

fn claude_copy_file(present: &[String], aliases: &HashSet<String>) -> Option<&'static str> {
    if aliases.contains(CLAUDE_MD) {
        return None;
    }
    [CLAUDE_MD, CLAUDE_DIR_MD].into_iter().find(|x| present.iter().any(|p_| p_ == x))
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Action {
    Block,
    Import,
    Strip,
}

fn plan_default(target: &str, existing: &[&str], wrappers: &Imports, aliases: &HashSet<String>) -> Vec<(String, Action)> {
    let present: Vec<String> = existing.iter().filter(|r| !aliases.contains(**r)).map(|s| s.to_string()).collect();
    let mut plan: Vec<(String, Action)> = vec![(AGENTS_MD.into(), Action::Block)];
    let set = |plan: &mut Vec<(String, Action)>, k: &str, a: Action| {
        if let Some(e) = plan.iter_mut().find(|(r, _)| r == k) {
            e.1 = a;
        } else {
            plan.push((k.to_string(), a));
        }
    };
    let copy = claude_copy_file(&present, aliases);
    for r in [CLAUDE_MD, CLAUDE_DIR_MD] {
        if present.iter().any(|x| x == r) {
            set(&mut plan, r, if Some(r) == copy { Action::Block } else { Action::Strip });
        }
    }
    if !aliases.contains(GEMINI_MD) {
        if gemini_imports_agents_md(target) {
            if present.iter().any(|x| x == GEMINI_MD) {
                set(&mut plan, GEMINI_MD, Action::Strip);
            }
        } else {
            set(&mut plan, GEMINI_MD, Action::Import);
        }
    }
    for r in &present {
        if !plan.iter().any(|(k, _)| k == r) {
            let a = if has_wrapper(wrappers, r) { Action::Strip } else { Action::Block };
            plan.push((r.clone(), a));
        }
    }
    plan
}

#[allow(clippy::too_many_arguments)]
fn write_default_agent_docs(
    target: &str,
    existing: &[&str],
    wrappers: &Imports,
    aliases: &HashSet<String>,
    index: &str,
    skipped_out: &mut Vec<(String, String)>,
    refuse_escapes: bool,
) -> Result<Vec<String>, DocsError> {
    let mut plan = plan_default(target, existing, wrappers, aliases);
    let get = |plan: &Vec<(String, Action)>, k: &str| plan.iter().find(|(r, _)| r == k).map(|(_, a)| *a);
    if get(&plan, CLAUDE_DIR_MD) == Some(Action::Strip) && claude_dir_keeps_copy(target) {
        plan.iter_mut().find(|(r, _)| r == CLAUDE_DIR_MD).unwrap().1 = Action::Block;
    }
    let left_alone = |r: &str| {
        existing.contains(&AGENTS_MD)
            && wrappers.iter().find(|(k, _)| k == r).map(|(_, t)| t.contains(AGENTS_MD)).unwrap_or(false)
            && !has_managed_marker(&p::join2(target, r))
    };
    let legacy_paths: Vec<&str> = AGENT_DOC_PATHS.iter().copied().filter(|x| *x != GEMINI_MD).collect();
    let found_legacy: Vec<&str> = existing.iter().copied().filter(|x| legacy_paths.contains(x)).collect();
    let legacy = |r: &str| !left_alone(r) && (found_legacy.contains(&r) || (r == AGENTS_MD && found_legacy.is_empty()));
    let mut escaped: HashSet<String> = HashSet::new();
    let snapshot = plan.clone();
    for (r, a) in &snapshot {
        if *a == Action::Strip && !has_managed_marker(&p::join2(target, r)) {
            plan.retain(|(k, _)| k != r);
            continue;
        }
        if let Err(e) = assert_within(r, target, false, "agent docs path") {
            if refuse_escapes && legacy(r) {
                return Err(DocsError::PathSafety(e));
            }
            plan.retain(|(k, _)| k != r);
            escaped.insert(r.clone());
            skipped_out.push((r.clone(), e.message));
        }
    }
    if escaped.contains(AGENTS_MD) && get(&plan, GEMINI_MD) == Some(Action::Import) {
        plan.retain(|(k, _)| k != GEMINI_MD);
        skipped_out.push((GEMINI_MD.into(), "its import of AGENTS.md would point at a file left as it is".into()));
    }
    let mut written = Vec::new();
    for r in AGENT_DOC_PATHS {
        let Some(a) = get(&plan, r) else { continue };
        let file = p::join2(target, r);
        if a == Action::Strip {
            if *r == CLAUDE_DIR_MD && (escaped.contains(CLAUDE_MD) || !root_claude_holds(target, index)) {
                continue;
            }
            if strip_managed_block(&file, index)? {
                written.push(r.to_string());
            }
            continue;
        }
        mkdirp(&p::dirname(&file));
        let header = if *r == AGENTS_MD { CREATED_HEADER_AGENTS } else { "" };
        let content = if a == Action::Block { index.to_string() } else { render_agents_import_block() };
        inject_xds_block(&file, &content, true, header, false)?;
        written.push(r.to_string());
    }
    Ok(written)
}

fn find_shared_agent_docs(target: &str, existing: &[&str]) -> (HashSet<String>, bool) {
    let mut by_file: Vec<(String, Vec<String>)> = Vec::new();
    for r in existing {
        let real = p::realpath(&p::join2(target, r)).unwrap_or_else(|| p::resolve(&[target, r]));
        match by_file.iter_mut().find(|(k, _)| *k == real) {
            Some(e) => e.1.push(r.to_string()),
            None => by_file.push((real, vec![r.to_string()])),
        }
    }
    let mut aliases = HashSet::new();
    let mut other = false;
    for (_, names) in by_file {
        if names.len() < 2 {
            continue;
        }
        if !names.iter().any(|n| n == AGENTS_MD) {
            other = true;
            continue;
        }
        for n in names {
            if n != AGENTS_MD {
                aliases.insert(n);
            }
        }
    }
    (aliases, other)
}

fn preset_paths(agent: &str) -> Option<&'static [&'static str]> {
    Some(match agent {
        "claude" => &[CLAUDE_MD, CLAUDE_DIR_MD],
        "cursor" => &[CURSOR_RULES, AGENTS_MD],
        "codex" => &[AGENTS_MD],
        "hermes" => &[HERMES_DOT_MD, HERMES_MD, AGENTS_MD],
        "muse" => &[AGENTS_MD],
        _ => return None,
    })
}

fn resolve_agent_paths(target: &str, agent: &str) -> (Vec<String>, Vec<String>) {
    if agent == "all" {
        let existing: Vec<String> = discover_agent_docs(target).into_iter().filter(|r| *r != GEMINI_MD).map(String::from).collect();
        if !existing.is_empty() {
            return (existing, vec![]);
        }
        return (vec![], vec![AGENTS_MD.into(), CLAUDE_DIR_MD.into()]);
    }
    let Some(paths) = preset_paths(agent) else { return (vec![], vec![AGENTS_MD.into()]) };
    for r in paths {
        if p::exists(&p::join2(target, r)) {
            return (vec![r.to_string()], vec![]);
        }
    }
    (vec![], vec![paths[paths.len() - 1].to_string()])
}

pub struct InstallOptions<'a> {
    pub agent: Option<&'a str>,
    pub paths: Option<Vec<String>>,
    pub only_replace: bool,
    pub rendered_block: String,
    pub refuse_escapes: bool,
}

fn created_header_for(r: &str) -> String {
    format!("# {}\n\nProject-specific guidance for AI coding agents.", p::basename_ext(r, &p::extname(r)))
}

/// `installAgentDocs`. `skipped_out` gets (rel, reason) for each skipped file.
pub fn install_agent_docs(target: &str, o: &InstallOptions, skipped_out: &mut Vec<(String, String)>) -> Result<Vec<String>, DocsError> {
    let explicit = o.paths.as_ref().map(|v| !v.is_empty()).unwrap_or(false);
    if !explicit {
        assert_agent_docs_target(target)?;
    }
    let index = o.rendered_block.as_str();
    let mut written = Vec::new();
    if explicit {
        let paths = o.paths.as_ref().unwrap();
        for r in paths {
            assert_within(r, target, false, "agent docs path")?;
        }
        for r in paths {
            assert_agent_docs_target(&p::dirname(&p::join2(target, r)))?;
        }
        for r in paths {
            let file = p::join2(target, r);
            let dir = p::dirname(&file);
            if dir != target {
                mkdirp(&dir);
            }
            inject_xds_block(&file, index, true, &created_header_for(r), false)?;
            written.push(r.clone());
        }
        return Ok(written);
    }
    if let Some(agent) = o.agent.filter(|a| !a.is_empty()) {
        let (inject, create) = resolve_agent_paths(target, agent);
        let claude_root = inject.iter().any(|r| r == CLAUDE_MD);
        let keep_dir_copy = claude_root && claude_dir_keeps_copy(target);
        let inject_all: Vec<String> = if !claude_root {
            inject.clone()
        } else if keep_dir_copy {
            let mut v: Vec<String> = Vec::new();
            for r in inject.iter().cloned().chain(std::iter::once(CLAUDE_DIR_MD.to_string())) {
                if !v.contains(&r) {
                    v.push(r);
                }
            }
            v.into_iter().filter(|r| r != CLAUDE_DIR_MD || p::exists(&p::join2(target, CLAUDE_DIR_MD))).collect()
        } else {
            inject.iter().filter(|r| *r != CLAUDE_DIR_MD).cloned().collect()
        };
        let dir_has_block = has_managed_marker(&p::join2(target, CLAUDE_DIR_MD));
        let strip: Vec<String> = if claude_root && !keep_dir_copy && dir_has_block { vec![CLAUDE_DIR_MD.into()] } else { vec![] };
        let added: Vec<String> = inject_all.iter().filter(|r| !inject.contains(r)).cloned().collect();
        let unrefused: Vec<String> = if agent == "claude" { added.iter().chain(strip.iter()).cloned().collect() } else { added.clone() };
        let escaping = if o.refuse_escapes {
            skip_escaping(target, &unrefused, skipped_out)
        } else {
            let all: Vec<String> = inject_all.iter().chain(create.iter()).chain(strip.iter()).cloned().collect();
            skip_escaping(target, &all, skipped_out)
        };
        let inject_here: Vec<String> = inject_all.iter().filter(|r| !escaping.contains(*r)).cloned().collect();
        let create_here: Vec<String> = create.iter().filter(|r| !escaping.contains(*r)).cloned().collect();
        let strip_here: Vec<String> = if escaping.contains(CLAUDE_MD) { vec![] } else { strip.iter().filter(|r| !escaping.contains(*r)).cloned().collect() };
        let all: Vec<String> = inject_here.iter().chain(create_here.iter()).chain(strip_here.iter()).cloned().collect();
        assert_targets_within(target, &all)?;
        for r in &inject_here {
            inject_xds_block(&p::join2(target, r), index, false, "", false)?;
            written.push(r.clone());
        }
        for r in &create_here {
            let file = p::join2(target, r);
            let dir = p::dirname(&file);
            if dir != target {
                mkdirp(&dir);
            }
            inject_xds_block(&file, index, true, &created_header_for(r), false)?;
            written.push(r.clone());
        }
        for r in &strip_here {
            if !root_claude_holds(target, index) {
                continue;
            }
            if strip_managed_block(&p::join2(target, r), index)? {
                written.push(r.clone());
            }
        }
        return Ok(written);
    }
    let existing = discover_agent_docs(target);
    if o.only_replace {
        let mut wrappers = find_agent_doc_wrappers(&read_agent_doc_imports(target, &existing, &[]));
        let (aliases, _) = find_shared_agent_docs(target, &existing);
        let present: Vec<String> = existing.iter().filter(|r| !aliases.contains(**r)).map(|s| s.to_string()).collect();
        if let Some(c) = claude_copy_file(&present, &aliases) {
            wrappers.retain(|(r, _)| r != c);
        }
        return write_each_agent_doc(target, &existing, &wrappers, index, true, skipped_out, o.refuse_escapes);
    }
    let wrappers = find_agent_doc_wrappers(&read_agent_doc_imports(target, &existing, &[AGENTS_MD]));
    let (aliases, other) = find_shared_agent_docs(target, &existing);
    if other || wrappers.iter().any(|(_, t)| !t.contains(AGENTS_MD)) {
        let own = find_agent_doc_wrappers(&read_agent_doc_imports(target, &existing, &[]));
        return write_each_agent_doc(target, &existing, &own, index, false, skipped_out, o.refuse_escapes);
    }
    write_default_agent_docs(target, &existing, &wrappers, &aliases, index, skipped_out, o.refuse_escapes)
}

// ---- removal ----

fn assert_removable_within(target: &str, skip: &HashSet<String>) -> Result<(), PathSafetyError> {
    let all: Vec<String> = discover_agent_docs(target)
        .into_iter()
        .filter(|r| !skip.contains(*r) && has_removable_block(&p::join2(target, r)))
        .map(String::from)
        .collect();
    assert_targets_within(target, &all).map_err(|e| PathSafetyError { message: e.message, code: "ERR_PATH_TRAVERSAL" })
}

pub fn remove_agent_docs(target: &str, shown_from: &str, skip: &HashSet<String>, log: &mut Log) -> Result<Vec<String>, DocsError> {
    assert_removable_within(target, skip)?;
    let all: Vec<&str> = discover_agent_docs(target).into_iter().filter(|r| !skip.contains(*r)).collect();
    let mut removed = Vec::new();
    for r in all {
        let file = p::join2(target, r);
        let delete_if_empty = r == AGENTS_MD || r == CLAUDE_DIR_MD;
        if remove_xds_block(&file, delete_if_empty, false)? {
            if r == GEMINI_MD && read(&file).map(|c| js_trim(&c).is_empty()).unwrap_or(false) {
                let _ = std::fs::remove_file(&file);
            }
            removed.push(r.to_string());
            let rel = p::relative(shown_from, &file);
            let shown = if rel.is_empty() { r.to_string() } else { rel };
            if !p::exists(&file) {
                log.push((false, format!("[ok] Removed empty {shown}")));
            } else {
                log.push((false, format!("[ok] Removed design system section from {shown}")));
            }
        }
    }
    Ok(removed)
}

pub fn remove_project_agent_docs(cwd: &str, skipped_out: &mut Vec<(String, String)>, log: &mut Log) -> Result<Vec<String>, DocsError> {
    let root = agent_docs_target_dir(cwd);
    let below = real_dir(&root) != real_dir(cwd);
    let root_skip: HashSet<String> = if below {
        let cands: Vec<String> = discover_agent_docs(&root).into_iter().filter(|r| has_removable_block(&p::join2(&root, r))).map(String::from).collect();
        let mut local = Vec::new();
        let s = skip_escaping(&root, &cands, &mut local);
        for (r, reason) in local {
            skipped_out.push((p::relative(cwd, &p::join2(&root, &r)), reason));
        }
        s
    } else {
        HashSet::new()
    };
    let dirs: Vec<String> = if below { vec![root.clone(), cwd.to_string()] } else { vec![cwd.to_string()] };
    let empty = HashSet::new();
    for d in &dirs {
        assert_removable_within(d, if *d == root { &root_skip } else { &empty })?;
    }
    let mut out = Vec::new();
    for d in &dirs {
        let removed = remove_agent_docs(d, cwd, if *d == root { &root_skip } else { &empty }, log)?;
        out.extend(removed.into_iter().map(|r| p::relative(cwd, &p::join2(d, &r))));
    }
    Ok(out)
}

// ---- inspection (upgrade) ----

pub struct InspectedFile {
    pub path: String,
    pub block_version: Option<String>,
    pub legacy: bool,
    pub stale: bool,
}

pub struct Inspection {
    pub installed_version: String,
    pub status: &'static str,
    pub files: Vec<InspectedFile>,
    pub stale_files: Vec<String>,
    pub block_versions: Vec<String>,
}

/// `inspectAgentDocs(targetDir, installedVersion, expectedBlock)`.
pub fn inspect_agent_docs(target: &str, installed_version: &str, expected_block: Option<&str>) -> Inspection {
    let mut files = Vec::new();
    for r in discover_agent_docs(target) {
        let Some(c) = read(&p::join2(target, r)) else { continue };
        let has_new = c.contains(MARKER_START);
        let has_legacy = c.contains(LEGACY_MARKER_START);
        if !has_new && !has_legacy {
            continue;
        }
        if is_agents_import_block(r, &c) {
            continue;
        }
        let legacy = !has_new && has_legacy;
        let bv = parse_block_version(&c);
        let matches = match expected_block {
            None => true,
            Some(exp) => matches!(find_managed_block(&c), Ok(Some((s, e))) if &c[s..e] == exp),
        };
        let stale = legacy || bv.is_none() || bv.as_deref() != Some(installed_version) || !matches;
        files.push(InspectedFile { path: r.into(), block_version: bv, legacy, stale });
    }
    let stale_files: Vec<String> = files.iter().filter(|f| f.stale).map(|f| f.path.clone()).collect();
    let mut block_versions: Vec<String> = Vec::new();
    for f in files.iter().filter(|f| f.stale) {
        if let Some(v) = &f.block_version {
            if !block_versions.contains(v) {
                block_versions.push(v.clone());
            }
        }
    }
    let status = if files.is_empty() {
        "missing"
    } else if !stale_files.is_empty() {
        "stale"
    } else {
        "current"
    };
    Inspection { installed_version: installed_version.into(), status, files, stale_files, block_versions }
}

/// `holdsAstryxBlock(content)`.
pub fn holds_astryx_block(content: &str) -> bool {
    for marker in [MARKER_START, LEGACY_MARKER_START] {
        let mut at = content.find(marker);
        while let Some(a) = at {
            let from = a + marker.len();
            let end = find_from(content, "<!--", from);
            let inner = js_trim(match end {
                Some(e) => &content[from..e],
                None => &content[from..],
            });
            let is_import = inner.starts_with('@') && inner.len() > 1 && !inner[1..].chars().any(crate::cli::format::js_ws);
            if !is_import {
                return true;
            }
            at = find_from(content, marker, from);
        }
    }
    false
}

pub fn is_astryx_initialized(dir: &str) -> bool {
    discover_agent_docs(dir).iter().any(|r| read(&p::join2(dir, r)).map(|c| holds_astryx_block(&c)).unwrap_or(false))
}
