//! The project and computer checks (port of `api/doctor/doctor.mjs`).

use super::env::{self, fmt};
use super::project::{self, ProjectState};
use super::util::{first_line, slice16};
use super::{built, themes, Check, Report, Status};
use crate::discovery::{nodepath as np, release, semver};
use crate::json::Value;
use std::path::Path;

/// What the project checks read (`DoctorContext`).
pub struct Ctx {
    pub cwd: String,
    pub node_version: String,
    pub core_dir: Option<String>,
    pub own_cli: bool,
    pub project_core: Option<String>,
    pub config_path: Option<String>,
    pub config_error: Option<String>,
    pub p: ProjectState,
}

fn s(v: Option<&Value>) -> Option<&str> {
    v.and_then(|x| x.as_str())
}

fn truthy(v: Option<&Value>) -> bool {
    super::util::truthy(v)
}

fn skipped_because(ctx: &Ctx, what: &str) -> String {
    match &ctx.p.project_error {
        Some(e) => format!("Skipped \u{2014} {what}: {}", first_line(e, 300)),
        None => format!("Skipped \u{2014} {what}."),
    }
}

const NAMED_INTEGRATIONS: usize = 10;

fn name_integrations(list: &[&Value]) -> String {
    let names: Vec<String> = list
        .iter()
        .map(|i| s(i.get("name")).or(s(i.get("__spec"))).unwrap_or("(integration)").to_string())
        .collect();
    if names.len() <= NAMED_INTEGRATIONS {
        names.join(", ")
    } else {
        format!("{} and {} more", names[..NAMED_INTEGRATIONS].join(", "), names.len() - NAMED_INTEGRATIONS)
    }
}

fn project_root_of(ctx: &Ctx) -> String {
    if let Some(c) = &ctx.config_path {
        return np::dirname(c);
    }
    let mut dir = ctx.cwd.clone();
    for _ in 0..50 {
        if np::exists(&np::join2(&dir, "package.json")) {
            return dir;
        }
        let parent = np::dirname(&dir);
        if parent == dir {
            break;
        }
        dir = parent;
    }
    ctx.cwd.clone()
}

/* ── individual checks ── */

pub fn check_node_version(node: &str) -> Check {
    let ok = env::is_node_version_supported(node);
    let min = env::MIN_NODE_VERSION;
    if ok {
        Check::new("node-version", "Node.js version", Status::Pass, format!("Node v{node} meets the minimum (>={min})."))
    } else {
        Check::new("node-version", "Node.js version", Status::Fail, format!("Node v{node} is below the required minimum (>={min})."))
            .fix(format!("Upgrade Node.js to >={min} and re-run."))
    }
}

fn check_core_installed(ctx: &Ctx) -> Check {
    let id = "core-installed";
    let label = "@astryxdesign/core installed";
    match &ctx.core_dir {
        Some(d) => {
            let v = env::pkg_version(Some(d));
            Check::new(id, label, Status::Pass, format!("@astryxdesign/core resolved{}.", v.map(|v| format!(" (v{v})")).unwrap_or_default()))
        }
        None => Check::new(id, label, Status::Fail, "@astryxdesign/core could not be resolved from this project.")
            .fix("Install the design system: `npm install @astryxdesign/core` (or yarn/pnpm/bun)."),
    }
}

fn check_version_alignment(ctx: &Ctx) -> Check {
    let id = "version-alignment";
    let label = "@astryxdesign/core <-> @astryxdesign/cli alignment";
    let core = env::pkg_version(ctx.core_dir.as_deref()).or_else(|| if !ctx.own_cli { ctx.project_core.clone() } else { None });
    let cli = env::pkg_version(Some(&env::cli_root()));
    let (Some(core), Some(cli)) = (core.filter(|s| !s.is_empty()), cli.filter(|s| !s.is_empty())) else {
        return Check::new(id, label, Status::Info, "Skipped \u{2014} could not read both @astryxdesign/core and @astryxdesign/cli versions.");
    };
    if !semver::is_valid_semver(&core) || !semver::is_valid_semver(&cli) {
        return Check::new(
            id,
            label,
            Status::Info,
            format!("Skipped \u{2014} @astryxdesign/core v{core} / @astryxdesign/cli v{cli} are not both comparable semver."),
        );
    }
    if !ctx.own_cli {
        let add = env::add_cli_command_for(&ctx.cwd, &core);
        let matches = core == cli;
        let fix = match &add {
            Some(a) => Some(format!("{}, run: {a}.", if matches { "To pin it for the team and CI" } else { "To match" })),
            None if matches => None,
            None => Some(env::RUN_FROM_PROJECT.to_string()),
        };
        return Check::new(
            id,
            label,
            if matches { Status::Info } else { Status::Warn },
            if matches {
                format!("This project has no Astryx CLI installed; CLI {cli}, the one you started, answered and matches its Core.")
            } else {
                format!("This project has no Astryx CLI installed; CLI {cli}, the one you started, answered while its Core is {core}.")
            },
        )
        .fix_opt(fix);
    }
    if core != cli {
        let fix = match env::align_command(&ctx.cwd, &cli, &core) {
            Some(c) => format!("To align them, run: {c}."),
            None => env::RUN_FROM_PROJECT.to_string(),
        };
        Check::new(
            id,
            label,
            Status::Warn,
            format!("This project's CLI {cli} answers it, but its Core is {core}: templates, docs, and agent text come from CLI {cli}, components from Core {core}."),
        )
        .fix(fix)
    } else {
        Check::new(id, label, Status::Pass, format!("@astryxdesign/core v{core} is in step with @astryxdesign/cli v{cli}."))
    }
}

fn check_config(ctx: &Ctx) -> Check {
    let id = "config";
    let label = "astryx.config.mjs";
    if let Some(e) = &ctx.config_error {
        return Check::new(id, label, Status::Fail, e.clone()).fix("Keep exactly one astryx.config.{ts,mjs,js} at your project root.");
    }
    let Some(path) = &ctx.config_path else {
        return Check::new(id, label, Status::Info, "No astryx.config.mjs found \u{2014} using defaults.");
    };
    match project::import_config_default(path) {
        Err(message) => Check::new(id, label, Status::Fail, format!("astryx.config.mjs failed to load: {message}"))
            .fix("Fix the syntax/runtime error in astryx.config.mjs so it imports cleanly."),
        Ok(Some(kind)) => Check::new(id, label, Status::Fail, format!("astryx.config.mjs default export is not an object (got {kind})."))
            .fix("Export a default object from astryx.config.mjs, e.g. `export default { integrations: [] };`."),
        Ok(None) => {
            if let Some(e) = &ctx.p.project_error {
                return Check::new(
                    id,
                    label,
                    Status::Fail,
                    format!("astryx.config.mjs loads, but the CLI could not load the project from it: {}", first_line(e, 300)),
                )
                .fix(format!(
                    "Fix what the message names. `{}` lists every field astryx.config accepts.",
                    fmt("docs authoring config", &ctx.cwd)
                ));
            }
            let rel = np::relative(&ctx.cwd, path);
            Check::new(id, label, Status::Pass, format!("astryx.config.mjs loaded cleanly ({}).", if rel.is_empty() { path.clone() } else { rel }))
        }
    }
}

fn describe_no_implicit(loaded: &[&Value]) -> String {
    let own: Vec<&&Value> = loaded.iter().filter(|i| truthy(i.get("__local"))).collect();
    let configured = loaded.len() - own.len();
    let own_names = own.iter().map(|i| s(i.get("name")).unwrap_or("this package")).collect::<Vec<_>>().join(", ");
    if own.is_empty() {
        "None \u{2014} every loaded integration is named in astryx.config.".into()
    } else if configured == 0 {
        format!("None \u{2014} the only loaded integration is this package's own manifest ({own_names}).")
    } else {
        format!("None \u{2014} every loaded integration is named in astryx.config or is this package's own manifest ({own_names}).")
    }
}

fn describe_unreadable(failures: &[(String, String)]) -> String {
    if failures.is_empty() {
        return String::new();
    }
    let one = failures.len() == 1;
    let listed = failures.iter().map(|(spec, err)| format!("{spec} ({})", first_line(err, 160))).collect::<Vec<_>>().join("; ");
    format!(
        " {} installed {} an astryx.integration.* manifest that could not be loaded, so {} nothing: {listed}. Run `{}` for details.",
        failures.len(),
        if one { "dependency ships" } else { "dependencies ship" },
        if one { "it contributes" } else { "they contribute" },
        env::fmt0("doctor integration validate <package>")
    )
}

fn has_load_error(i: &Value) -> bool {
    !super::util::nullish(i.get("__loadError"))
}

fn check_implicit_integrations(ctx: &Ctx) -> Check {
    let id = "implicit-integrations";
    let label = "Implicitly linked integrations";
    let Some(integrations) = &ctx.p.integrations else {
        return Check::new(id, label, Status::Info, skipped_because(ctx, "the project configuration could not be read"));
    };
    let implicit: Vec<&Value> = integrations.iter().filter(|i| truthy(i.get("__autolinked"))).collect();
    let unreadable = describe_unreadable(ctx.p.autolink_failures.as_deref().unwrap_or(&[]));
    if implicit.is_empty() {
        let loaded: Vec<&Value> = integrations.iter().filter(|i| !has_load_error(i)).collect();
        let head = if !loaded.is_empty() {
            describe_no_implicit(&loaded)
        } else if !integrations.is_empty() || !unreadable.is_empty() {
            "None loaded.".into()
        } else {
            "None \u{2014} no installed dependency ships an astryx.integration.* manifest.".into()
        };
        return Check::new(id, label, Status::Info, format!("{head}{unreadable}"));
    }
    let icon_opt_in = ctx.p.icon_sets.as_ref().and_then(|v| v.get("choice")).map(|c| truthy(c.get("configured"))).unwrap_or(false);
    let described: Vec<String> = implicit
        .iter()
        .map(|i| {
            let version = s(i.get("version")).filter(|v| !v.is_empty()).map(|v| format!("@{v}")).unwrap_or_default();
            let name = i.get("name").map(crate::cli::format::js_string).unwrap_or_else(|| "undefined".into());
            let alias = match s(i.get("__spec")) {
                Some(spec) if !spec.is_empty() && Some(spec) != s(i.get("name")) => format!(" (declared as \"{spec}\")"),
                _ => String::new(),
            };
            let mut roots = vec!["components", "templates", "themes", "docs", "codemods"];
            if icon_opt_in {
                roots.push("iconSets");
            }
            let declared: Vec<&str> = roots.into_iter().filter(|r| truthy(i.get(*r))).collect();
            let base = s(i.get("__packageDir")).map(String::from).unwrap_or_else(|| ctx.cwd.clone());
            let missing: Vec<&str> = declared
                .iter()
                .copied()
                .filter(|r| match i.get(*r) {
                    Some(Value::String(dir)) => {
                        let p = if np::is_absolute(dir) { dir.clone() } else { np::resolve(&[&base, dir]) };
                        !np::exists(&p)
                    }
                    _ => false,
                })
                .collect();
            let present: Vec<&str> = declared.iter().copied().filter(|r| !missing.contains(r)).collect();
            let contributes = if present.is_empty() { "nothing".to_string() } else { present.join(", ") };
            let absent = if missing.is_empty() { String::new() } else { format!(" (declared {} missing on disk)", missing.join(", ")) };
            let field = i.get("__dependencyField").map(crate::cli::format::js_string).unwrap_or_else(|| "undefined".into());
            format!("{name}{version}{alias} from {field}, contributing {contributes}{absent}")
        })
        .collect();
    Check::new(
        id,
        label,
        Status::Info,
        format!(
            "{} integration{} loaded from installed dependencies with no astryx.config entry: {}.{unreadable}",
            implicit.len(),
            if implicit.len() == 1 { "" } else { "s" },
            described.join("; ")
        ),
    )
    .fix("Nothing to fix. Keep these dependencies installed. The CLI links them from package.json, so an unused-dependency check that looks only for source imports will report them as unused. Add them to `integrations` in astryx.config.* to make the link explicit.")
}

fn check_configured_integrations(ctx: &Ctx) -> Check {
    let id = "configured-integrations";
    let label = "Configured integrations";
    let Some(integrations) = &ctx.p.integrations else {
        return Check::new(id, label, Status::Info, skipped_because(ctx, "the project configuration could not be read"));
    };
    let configured: Vec<project::Configured> = match &ctx.p.configured {
        Some(c) => c.clone(),
        None => integrations
            .iter()
            .filter(|i| !truthy(i.get("__autolinked")) && !truthy(i.get("__local")))
            .map(|i| project::Configured {
                spec: s(i.get("__spec")).unwrap_or("").to_string(),
                label: s(i.get("name")).or(s(i.get("__spec"))).unwrap_or("").to_string(),
                error: if has_load_error(i) { Some(crate::cli::format::js_string(i.get("__loadError").unwrap())) } else { None },
            })
            .collect(),
    };
    if configured.is_empty() {
        return Check::new(id, label, Status::Info, "No integration is named in astryx.config.");
    }
    let plural = if configured.len() == 1 { "" } else { "s" };
    let withdrawn: Vec<&project::Configured> = configured.iter().filter(|c| c.error.is_some()).collect();
    if !withdrawn.is_empty() {
        let listed = withdrawn
            .iter()
            .map(|c| format!("{} ({})", c.label, slice16(&first_line(c.error.as_deref().unwrap(), 300), 160)))
            .collect::<Vec<_>>()
            .join("; ");
        return Check::new(
            id,
            label,
            Status::Fail,
            format!(
                "{} of {} integration{plural} named in astryx.config could not be loaded, so {} nothing: {listed}.",
                withdrawn.len(),
                configured.len(),
                if withdrawn.len() == 1 { "it contributes" } else { "they contribute" }
            ),
        )
        .fix(format!(
            "Install each one, fix its astryx.integration.* manifest (`{}` says what is wrong), or remove it from `integrations` in astryx.config.",
            fmt("doctor integration validate <package>", &ctx.cwd)
        ));
    }
    Check::new(
        id,
        label,
        Status::Pass,
        format!(
            "{} integration{plural} named in astryx.config loaded: {}.",
            configured.len(),
            configured.iter().map(|c| c.label.clone()).collect::<Vec<_>>().join(", ")
        ),
    )
}

fn check_agent_docs(ctx: &Ctx) -> Check {
    let id = "agent-docs";
    let label = "AI agent docs";
    let mut dirs: Vec<String> = Vec::new();
    for d in [ctx.cwd.clone(), project_root_of(ctx), env::resolve_agent_docs_root(&ctx.cwd).unwrap_or_else(|| ctx.cwd.clone())] {
        let r = np::resolve1(&d);
        if !dirs.contains(&r) {
            dirs.push(r);
        }
    }
    let present: Vec<String> = dirs
        .iter()
        .flat_map(|d| env::AGENT_DOC_PATHS.iter().map(move |rel| np::join2(d, rel)))
        .filter(|abs| np::exists(abs))
        .collect();
    let shown = |abs: &str| {
        let r = np::relative(&ctx.cwd, abs);
        if r.is_empty() {
            np::basename(abs)
        } else {
            r
        }
    };
    let refusal = env::agent_docs_refusal(&ctx.cwd);
    let fix_for = |init_fix: String| match &refusal {
        Some(r) => format!("{r} Move the project into a folder of its own, or edit the Astryx block in its agent file by hand."),
        None => init_fix,
    };
    let inv = env::invocation(&ctx.cwd);
    if present.is_empty() {
        return Check::new(
            id,
            label,
            Status::Info,
            format!(
                "No agent docs found: looked for {} in {}.",
                env::AGENT_DOC_PATHS.join(", "),
                dirs.iter()
                    .map(|d| {
                        let r = np::relative(&ctx.cwd, d);
                        if r.is_empty() {
                            ".".to_string()
                        } else {
                            r
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(" and ")
            ),
        )
        .fix(fix_for(format!("Generate agent docs with `{inv} init --features agents`.")));
    }
    let read = |abs: &str| std::fs::read(abs).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
    let with_markers: Vec<&String> = present
        .iter()
        .filter(|abs| {
            let c = read(abs);
            (c.contains("<!-- ASTRYX:START -->") || c.contains("<!-- XDS:START -->"))
                && (c.contains("<!-- ASTRYX:END -->") || c.contains("<!-- XDS:END -->"))
                && env::holds_astryx_block(&c)
        })
        .collect();
    let mut dangling: Vec<(String, String)> = Vec::new();
    for abs in &present {
        let c = read(abs);
        if let Some(m) = crate::doctor_re!(r"<!-- ASTRYX:START -->\s*@(\S+)\s*<!-- ASTRYX:END -->").find(&c) {
            let target = np::resolve(&[&np::dirname(abs), &c[m.group(1).unwrap()]]);
            if !env::holds_astryx_block(&read(&target)) {
                dangling.push((abs.clone(), target));
            }
        }
    }
    if !dangling.is_empty() {
        return Check::new(
            id,
            label,
            Status::Fail,
            dangling
                .iter()
                .map(|(a, t)| format!("{} imports {}, which holds no Astryx block, so agents that read them get no Astryx docs.", shown(a), shown(t)))
                .collect::<Vec<_>>()
                .join(" "),
        )
        .fix(fix_for(format!("Write the block again with `{inv} init --features agents`.")));
    }
    if with_markers.is_empty() {
        return Check::new(
            id,
            label,
            Status::Warn,
            format!("Agent docs present ({}) but no Astryx section markers found.", present.iter().map(|a| shown(a)).collect::<Vec<_>>().join(", ")),
        )
        .fix(fix_for(format!("Add the Astryx section to your agent docs with `{inv} init --features agents`.")));
    }
    Check::new(
        id,
        label,
        Status::Pass,
        format!("Astryx agent docs section present in {}.", with_markers.iter().map(|a| shown(a)).collect::<Vec<_>>().join(", ")),
    )
}

fn check_peer_deps(ctx: &Ctx) -> Check {
    let id = "peer-deps";
    let label = "@astryxdesign/core peer dependencies";
    let Some(core) = &ctx.core_dir else {
        return Check::new(id, label, Status::Info, "Skipped \u{2014} @astryxdesign/core is not installed.");
    };
    let pkg = env::read_json(&np::join2(core, "package.json"));
    let peers = pkg.as_ref().and_then(|p| p.get("peerDependencies")).and_then(|v| v.as_object()).cloned().unwrap_or_default();
    if peers.is_empty() {
        return Check::new(id, label, Status::Info, "@astryxdesign/core declares no peer dependencies.");
    }
    let mut missing = Vec::new();
    let mut mismatched: Vec<(String, String, String)> = Vec::new();
    for (name, want) in &peers {
        let want = crate::cli::format::js_string(want);
        let Some(dir) = crate::discovery::paths::find_installed_package(&ctx.cwd, name, 6) else {
            missing.push(format!("{name}@{want}"));
            continue;
        };
        if let Some(have) = env::pkg_version(Some(&dir)).filter(|h| !h.is_empty()) {
            if !semver::satisfies_range(&have, &want) {
                mismatched.push((name.clone(), want, have));
            }
        }
    }
    if !missing.is_empty() || !mismatched.is_empty() {
        let mut problems = Vec::new();
        if !missing.is_empty() {
            problems.push(format!("missing: {}", missing.join(", ")));
        }
        if !mismatched.is_empty() {
            problems.push(format!(
                "out of range: {}",
                mismatched.iter().map(|(n, w, h)| format!("{n}@{h} (needs {w})")).collect::<Vec<_>>().join(", ")
            ));
        }
        let quote = |t: &str| if t.contains(['<', '>', '|', '(', ')', ' ']) { format!("'{t}'") } else { t.to_string() };
        let targets: Vec<String> = missing.iter().cloned().chain(mismatched.iter().map(|(n, w, _)| format!("{n}@{w}"))).map(|t| quote(&t)).collect();
        return Check::new(id, label, Status::Warn, format!("Peer dependency issues \u{2014} {}.", problems.join("; ")))
            .fix(format!("Install compatible peers: `npm install {}`.", targets.join(" ")));
    }
    Check::new(id, label, Status::Pass, format!("All peer dependencies satisfied ({}).", peers.keys().cloned().collect::<Vec<_>>().join(", ")))
}

fn check_integration_issues(ctx: &Ctx) -> Check {
    let id = "integration-issues";
    let label = "Integration contributions";
    let Some(issues) = &ctx.p.issues else {
        return Check::new(id, label, Status::Info, skipped_because(ctx, "the project integration graph could not be loaded"));
    };
    if issues.is_empty() {
        let checked: Vec<&Value> = ctx.p.integrations.as_deref().unwrap_or(&[]).iter().filter(|i| !has_load_error(i)).collect();
        if checked.is_empty() {
            return Check::new(id, label, Status::Info, "No integration is loaded, so there are no integration contributions to check.");
        }
        return Check::new(
            id,
            label,
            Status::Pass,
            format!(
                "{} loaded integration{} checked ({}): contributions and cross-package relationships are valid.",
                checked.len(),
                if checked.len() == 1 { "" } else { "s" },
                name_integrations(&checked)
            ),
        );
    }
    let errors = issues.iter().filter(|i| s(i.get("severity")) == Some("error")).count();
    let js = |v: Option<&Value>| v.map(crate::cli::format::js_string).unwrap_or_else(|| "undefined".into());
    let details = issues.iter().map(|i| format!("{}: {}", js(i.get("package")), js(i.get("message")))).collect::<Vec<_>>().join(" | ");
    Check::new(
        id,
        label,
        Status::Warn,
        format!(
            "{} integration issue(s){}: {details}",
            issues.len(),
            if errors > 0 { format!(", {errors} of them errors") } else { String::new() }
        ),
    )
    .fix(format!(
        "Run `{}` for package-specific diagnostics and resolve cross-package precedence in astryx.config.",
        fmt("doctor integration", &ctx.cwd)
    ))
}

fn check_icon_sets(ctx: &Ctx) -> Option<Check> {
    let state = ctx.p.icon_sets.as_ref()?;
    let choice = state.get("choice")?;
    if !truthy(choice.get("configured")) {
        return None;
    }
    let id = "icon-sets";
    let label = "Icon sets";
    let reason = s(choice.get("reason")).unwrap_or("").to_string();
    match s(choice.get("status")) {
        Some("missing") => {
            return Some(Check::new(id, label, Status::Fail, reason).fix("Install the package that ships the set, or set experimental.iconSet in astryx.config to an installed set (`astryx experimental icon --list` names them)."))
        }
        Some("withdrawn") => {
            return Some(Check::new(id, label, Status::Fail, reason).fix("Run `astryx integration check` in the package that ships the set, or install the module its data names; or set experimental.iconSet in astryx.config to a valid installed set (`astryx experimental icon --list` names them)."))
        }
        _ => {}
    }
    let mut problems = Vec::new();
    let ambiguous = s(choice.get("status")) == Some("ambiguous");
    if ambiguous {
        problems.push(reason.clone());
    }
    for w in state.get("withdrawn").and_then(|v| v.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
        problems.push(s(w.get("reason")).unwrap_or("").to_string());
    }
    if !problems.is_empty() {
        return Some(Check::new(id, label, Status::Warn, problems.join(" | ")).fix(if ambiguous {
            "Set experimental.iconSet in astryx.config to \"<package>/<set>\" so templates use one set."
        } else {
            "Run `astryx integration check` in the package that ships the set, or install its module."
        }));
    }
    let n = state.get("sets").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    Some(Check::new(id, label, Status::Pass, format!("{n} icon set{} installed. {reason}", if n == 1 { "" } else { "s" })))
}

fn check_package_manager(ctx: &Ctx) -> Check {
    let id = "package-manager";
    let label = "Package manager";
    let r = crate::discovery::package_manager::explain_package_manager(Some(&ctx.cwd));
    let dir = r.dir.clone().unwrap_or_else(|| "null".into());
    if r.ambiguous {
        return Check::new(
            id,
            label,
            Status::Fail,
            format!(
                "Cannot tell which package manager this project uses: {} lockfiles both sit in {dir}, and nothing the project owns picks between them. Commands are printed with the neutral `npx` form until this is resolved.",
                r.candidates.join(" and ")
            ),
        )
        .fix(format!("Add a `packageManager` field to {dir}/package.json, or delete the lockfile that does not belong."));
    }
    if let Some(declared) = &r.declared {
        if !r.stray_lockfiles.is_empty() {
            let files = r.stray_lockfiles.iter().map(|l| l.file).collect::<Vec<_>>().join(" and ");
            let mut owners: Vec<&str> = Vec::new();
            for l in &r.stray_lockfiles {
                if !owners.contains(&l.pm) {
                    owners.push(l.pm);
                }
            }
            let owners = owners.join(" and ");
            return Check::new(
                id,
                label,
                Status::Warn,
                format!(
                    "This project declares `packageManager: {declared}` in {dir}/package.json, but {files} also sits there. Astryx follows the declaration and prints {} commands; anything that follows the lockfile instead will use {owners}.",
                    r.pm
                ),
            )
            .fix(format!(
                "Delete {files} from {dir} and reinstall with {declared}, or change the `packageManager` field if {owners} is what this project actually uses."
            ));
        }
    }
    let message = if r.pm != "npx" {
        if r.declared.is_some() {
            format!("Detected package manager: {} (declared in {dir}/package.json).", r.pm)
        } else {
            format!("Detected package manager: {}.", r.pm)
        }
    } else {
        "No lockfile detected \u{2014} defaulting to npm/npx.".into()
    };
    Check::new(id, label, Status::Info, message)
}

fn check_provider_identity(ctx: &Ctx) -> Check {
    let id = "provider-identity";
    let label = "Integration provider identity";
    let Some(integrations) = &ctx.p.integrations else {
        return Check::new(id, label, Status::Info, skipped_because(ctx, "the project configuration could not be read"));
    };
    let conflicts: Vec<&Value> = integrations.iter().filter(|i| truthy(i.get("__providerConflict"))).collect();
    if !conflicts.is_empty() {
        return Check::new(
            id,
            label,
            Status::Warn,
            conflicts
                .iter()
                .map(|i| i.get("__providerConflict").and_then(|c| c.get("message")).map(crate::cli::format::js_string).unwrap_or_default())
                .collect::<Vec<_>>()
                .join(" "),
        )
        .fix("Give each integration its own `providerId` in astryx.integration.*. A renamed package may keep its predecessor's ID only when the predecessor is no longer installed.");
    }
    let count = integrations.iter().filter(|i| !super::util::nullish(i.get("providerId")) && !has_load_error(i)).count();
    let unread = integrations.iter().filter(|i| has_load_error(i)).count();
    let note = match unread {
        0 => String::new(),
        1 => " 1 loaded integration could not be read, so its provider ID is unknown.".into(),
        n => format!(" {n} loaded integrations could not be read, so their provider IDs are unknown."),
    };
    if count == 0 {
        return Check::new(
            id,
            label,
            Status::Info,
            format!(
                "{}{note}",
                if unread == 0 { "None \u{2014} no loaded integration has a provider identity." } else { "No readable integration has a provider identity." }
            ),
        );
    }
    Check::new(
        id,
        label,
        Status::Pass,
        format!(
            "{}{note}",
            if count == 1 { "1 loaded integration has its own provider ID.".to_string() } else { format!("{count} loaded integrations each have their own provider ID.") }
        ),
    )
}

fn check_cli_command(ctx: &Ctx) -> Check {
    let id = "cli-command";
    let label = "CLI command";
    let mut declared: Vec<(String, String)> = Vec::new();
    for i in ctx.p.integrations.as_deref().unwrap_or(&[]) {
        if has_load_error(i) || !super::util::nullish(i.get("__providerConflict")) {
            continue;
        }
        let Some(cmd) = s(i.get("cliCommand")) else { continue };
        let pkg = s(i.get("name")).or(s(i.get("__spec"))).unwrap_or("(unnamed)").to_string();
        declared.push((pkg, cmd.to_string()));
    }
    let mut commands: Vec<&str> = Vec::new();
    for (_, c) in &declared {
        if !commands.contains(&c.as_str()) {
            commands.push(c);
        }
    }
    if commands.len() > 1 {
        let claims = declared.iter().map(|(p, c)| format!("{p} (`{c}`)")).collect::<Vec<_>>().join(", ");
        return Check::new(
            id,
            label,
            Status::Warn,
            format!(
                "Loaded integrations declare different CLI commands: {claims}. Neither is used, so printed commands start with `{}`.",
                crate::discovery::package_manager::guess_cli_invocation(Some(&ctx.cwd))
            ),
        )
        .fix("Remove the integration that does not belong here, or have every package declare the same `cliCommand` in its astryx.integration manifest.");
    }
    if commands.len() == 1 {
        let packages = declared.iter().map(|(p, _)| p.clone()).collect::<Vec<_>>().join(", ");
        return Check::new(id, label, Status::Pass, format!("Printed commands start with `{}`, the cliCommand of {packages}.", declared[0].1));
    }
    Check::new(
        id,
        label,
        Status::Info,
        format!("No loaded integration declares a cliCommand, so printed commands start with `{}`.", env::invocation(&ctx.cwd)),
    )
}

/* ── release and the computer ── */

pub struct ReleaseFacts {
    pub cli: String,
    pub core: Option<String>,
    pub latest: Option<String>,
    pub global_behind: Option<(String, String, Option<String>, String)>,
    pub project_lag: Option<env::ProjectLag>,
    pub last_notice_skip: Option<(String, String, f64)>,
    pub last_check_failure: Option<(f64, String)>,
    pub state_lock: Option<(Option<i64>, Option<String>, f64)>,
    pub search_path: Vec<env::SearchPathCommand>,
}

/// `releaseFacts(cwd, {project})`.
pub fn release_facts(cwd: &str, project: bool) -> ReleaseFacts {
    let answered = release::answered_by(cwd);
    let cli = answered.get("cli").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let core = answered.get("core").and_then(|v| v.as_str()).map(String::from);
    let copy = answered.get("copy").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let latest = env::known_latest();
    let global_behind = if !project && crate::discovery::package_manager::is_global_copy(&env::cli_root()) {
        latest.as_ref().and_then(|(v, node)| {
            if is_behind(&cli, v) {
                Some((cli.clone(), v.clone(), node.clone(), env::global_upgrade_command(&env::cli_root())))
            } else {
                None
            }
        })
    } else {
        None
    };
    let project_lag = if project {
        let current = if copy == "starting" { env::project_core_version(cwd).unwrap_or_else(|| cli.clone()) } else { cli.clone() };
        env::project_lag(cwd, &current)
    } else {
        None
    };
    ReleaseFacts {
        cli,
        core,
        latest: latest.map(|l| l.0),
        global_behind,
        project_lag,
        last_notice_skip: env::last_notice_skip(),
        last_check_failure: env::last_check_failure(),
        state_lock: env::state_lock_holder(),
        search_path: env::search_path_commands(),
    }
}

fn is_behind(version: &str, newest: &str) -> bool {
    release::is_release_version(Some(version))
        && release::is_release_version(Some(newest))
        && !version.contains('-')
        && !newest.contains('-')
        && semver::semver_compare(newest, version) > 0.0
}

fn iso(ms: f64) -> String {
    super::util::iso_string(ms)
}

fn check_answering_release(f: &ReleaseFacts, cwd: &str) -> Check {
    let head = match &f.core {
        Some(core) => format!("CLI {} with Core {core} answered, outside a project.", f.cli),
        None => format!(
            "CLI {} answered, outside a project. It installs Core {} into the per-user cache the first time a command needs it.",
            f.cli, f.cli
        ),
    };
    Check::new(
        "answering-release",
        "Release that answered",
        if f.core.is_some() { Status::Pass } else { Status::Info },
        format!("{head} How each folder is answered: `{}`.", fmt("astryx docs global", cwd)),
    )
}

fn check_newest_release(f: &ReleaseFacts, outside: bool) -> Check {
    let base = |m: String| Check::new("newest-release", "Newest release", Status::Info, m);
    let mut check = if let (true, Some((current, newest, node, command))) = (outside, &f.global_behind) {
        base(format!(
            "{}. The CLI installed for the computer stays on its release until you upgrade it.",
            env::available_line(current, newest)
        ))
        .fix(format!("{}.", env::upgrade_line(command, node.as_deref())))
    } else if let Some(lag) = &f.project_lag {
        base(format!("This project uses Astryx {}; {} is the newest.", lag.current, lag.newest))
            .fix(format!("{}.", env::upgrade_line(&format!("{}, then {}", lag.install, lag.upgrade), lag.node.as_deref())))
    } else {
        match &f.latest {
            None => base("Update check: not run yet, so the newest release is not known here; it runs in the background once a day, after a command.".into()),
            Some(latest) if semver::is_valid_semver(latest) && semver::is_valid_semver(&f.cli) && semver::semver_compare(latest, &f.cli) > 0.0 => {
                base(format!("Release {latest} is newer than {}, the release that answered.", f.cli))
            }
            Some(latest) => base(format!("No newer release is known: the newest is {latest}.")),
        }
    };
    let mut notes: Vec<String> = Vec::new();
    if let Some((at, reason)) = &f.last_check_failure {
        let why = if reason == "npm-missing" {
            "npm could not be started".to_string()
        } else if reason == "bad-reply" {
            "npm's answer named no release".to_string()
        } else if let Some(r) = reason.strip_prefix("npm-failed: ") {
            format!("npm failed ({r}); its registry and proxy settings decide where it asks")
        } else {
            reason.clone()
        };
        notes.push(format!("The last update check, {}, did not reach the registry: {why}.", iso(*at)));
    }
    if let Some((key, reason, at)) = &f.last_notice_skip {
        let why = match reason.as_str() {
            "already-shown" => "it had already printed that day",
            "no-newer" => "no newer release was known",
            "no-project" => "the folder belongs to no Astryx project, so no install command fits",
            other => other,
        };
        notes.push(format!("Last update notice skipped {} ({key}): {why}.", iso(*at)));
    }
    if let Some((pid, host, since)) = &f.state_lock {
        let by = match pid {
            None => String::new(),
            Some(p) => format!(" by process {p}{}", host.as_ref().filter(|h| !h.is_empty()).map(|h| format!(" on {h}")).unwrap_or_default()),
        };
        notes.push(format!("The state file's lock is held{by} since {}.", iso(*since)));
    }
    if !notes.is_empty() {
        check.message = format!("{} {}", check.message, notes.join(" "));
    }
    check
}

fn check_cli_on_path(rows: &[env::SearchPathCommand]) -> Check {
    let id = "cli-on-path";
    let label = "`astryx` on the search path";
    let describe = |r: &env::SearchPathCommand| {
        if r.astryx {
            format!("{} (CLI {})", r.file, r.version.clone().unwrap_or_else(|| "of unknown version".into()))
        } else {
            format!("{} (not the Astryx CLI)", r.file)
        }
    };
    let others = if rows.len() > 1 { format!(" Later on the search path: {}.", rows[1..].iter().map(describe).collect::<Vec<_>>().join(", ")) } else { String::new() };
    let Some(first) = rows.first() else {
        return Check::new(id, label, Status::Info, "No `astryx` command on the search path, so `astryx` runs only through a package manager.")
            .fix("To run the CLI in any folder, install it for the computer: `npm i -g @astryxdesign/cli`.");
    };
    if !first.astryx {
        return Check::new(
            id,
            label,
            Status::Warn,
            format!("The first `astryx` on the search path, {}, is not the Astryx CLI, so `astryx` runs another program.{others}", first.file),
        )
        .fix("Remove that program from the search path, or put the folder of the CLI installed for the computer before it.");
    }
    if first.hands_off == Some(false) {
        return Check::new(
            id,
            label,
            Status::Warn,
            format!(
                "The first `astryx` on the search path, {}, runs CLI {}, which predates the hand-off and answers every folder itself.{others}",
                first.file,
                first.version.clone().unwrap_or_else(|| "of unknown version".into())
            ),
        )
        .fix(format!("To upgrade, run: `{}`.", first.upgrade.clone().unwrap_or_else(|| "npm i -g @astryxdesign/cli@latest".into())));
    }
    Check::new(id, label, Status::Pass, format!("`astryx` runs {}.{others}", describe(first)))
}

fn check_computer_agent_text(cwd: &str, rows: Option<&[env::SearchPathCommand]>) -> Check {
    let st = env::computer_agent_text_state();
    let base = |m: String| Check::new("computer-agent-text", "Computer-level agent text", Status::Info, m);
    if !st.install {
        return base("The computer-level agent text is turned off (`astryx init --user --remove-agents`), so the CLI installed for the computer does not write it.".into())
            .fix(format!("To turn it back on, run `{}`.", fmt("astryx init --user", cwd)));
    }
    let fix = format!("Run `{}`.", fmt("astryx init --user", cwd));
    let file = &st.entries[0];
    let links = &st.entries[1..];
    let home = |e: &env::AgentTextEntry| env::display_home_path(&e.path);
    let pick = |states: &[&str]| links.iter().filter(|l| states.contains(&l.state)).map(home).collect::<Vec<_>>();
    let linked = pick(&["linked"]);
    let copied = pick(&["current"]);
    let skipped = pick(&["foreign", "edited"]);
    let dangling = pick(&["dangling"]);
    let missing = pick(&["absent", "differs"]);
    let mut note = String::new();
    if !linked.is_empty() {
        note.push_str(&format!(" Linked into: {}.", linked.join(", ")));
    }
    if !copied.is_empty() {
        note.push_str(&format!(" Copied into: {}.", copied.join(", ")));
    }
    if !skipped.is_empty() {
        note.push_str(&format!(" Not linked, because something Astryx did not create is there: {}.", skipped.join(", ")));
    }
    if !dangling.is_empty() {
        note.push_str(&format!(" Linked, but the skill folder the link points to is not there, so agents reading it see nothing (as in a container that mounts only that folder): {}.", dangling.join(", ")));
    }
    if !missing.is_empty() {
        note.push_str(&format!(" Not linked yet: {}.", missing.join(", ")));
    }
    if file.state == "foreign" || file.state == "edited" {
        return base(format!(
            "{} {}, so it is left as it is (delete it to get the current text).{note}",
            home(file),
            if file.state == "edited" { "was edited since Astryx wrote it" } else { "was not written by Astryx" }
        ));
    }
    if file.state == "absent" {
        return base(format!("No computer-level agent text: agents outside a project with Astryx agent docs do not know Astryx is here.{note}")).fix(fix);
    }
    let current = file.state == "current";
    let status = format!(
        "{}: {}.",
        if current { "The computer-level agent text matches this release" } else { "The computer-level agent text differs from this release's" },
        home(file)
    );
    if st.command.as_deref() == Some(env::COMPUTER_COMMAND) {
        if let Some(rows) = rows {
            if !rows.iter().any(|r| !r.runner) {
                let c = env::COMPUTER_COMMAND;
                return base(format!("{status} It tells agents to run `{c}`, but no `{c}` command is on the search path, so agents that read it find no CLI to run (as when a restart removes the CLI installed for the computer and keeps the home folder).{note}"))
                    .fix(match &st.install_step {
                        Some(r) => format!("Run `{r}`, the step the skill names for when `{c}` is not found."),
                        None => format!("Install it for the computer: `{}`.", env::COMPUTER_INSTALL_STEP),
                    });
            }
        }
    }
    let c = base(format!("{status}{note}"));
    if !current || !missing.is_empty() || !dangling.is_empty() {
        c.fix(fix)
    } else {
        c
    }
}

fn check_computer_integrations_outside(cwd: &str) -> Check {
    let found = env::computer_integration_candidates(cwd);
    let id = "computer-integrations";
    let label = "Integrations installed for this computer";
    if found.is_empty() {
        return Check::new(id, label, Status::Info, "No integration is installed beside the CLI installed for this computer.");
    }
    let (loaded, own): (Vec<String>, Vec<String>) = match crate::discovery::project::Project::load_with(cwd, true) {
        Ok(p) => {
            let name = |r: &crate::discovery::integrations::Record| r.get("name").map(crate::cli::format::js_string).unwrap_or_default();
            (
                p.loaded_integrations
                    .iter()
                    .filter(|r| truthy(r.get("__computer")) && !has_load_error(&Value::Object((*r).clone())))
                    .map(name)
                    .collect(),
                p.loaded_integrations.iter().filter(|r| !truthy(r.get("__computer"))).map(name).collect(),
            )
        }
        Err(_) => (vec![], vec![]),
    };
    let lbl = |c: &env::ComputerIntegration| c.version.as_ref().map(|v| format!("{}@{v}", c.name)).unwrap_or_else(|| c.name.clone());
    let shadowed: Vec<&env::ComputerIntegration> = found.iter().filter(|c| own.contains(&c.name)).collect();
    let rest: Vec<&env::ComputerIntegration> = found.iter().filter(|c| !own.contains(&c.name)).collect();
    let used: Vec<&&env::ComputerIntegration> = rest.iter().filter(|c| c.incompatible.is_none() && loaded.contains(&c.name)).collect();
    let skipped: Vec<&&env::ComputerIntegration> = rest.iter().filter(|c| c.incompatible.is_some()).collect();
    let failed: Vec<&&env::ComputerIntegration> = rest.iter().filter(|c| c.incompatible.is_none() && !loaded.contains(&c.name)).collect();
    let mut notes = Vec::new();
    if !used.is_empty() {
        notes.push(format!("Used outside a project: {}.", used.iter().map(|c| lbl(c)).collect::<Vec<_>>().join(", ")));
    }
    for c in &shadowed {
        notes.push(format!("{} is not used here: this folder loads its own copy of {}.", lbl(c), c.name));
    }
    for c in &skipped {
        notes.push(format!("Skipped {}: {}.", lbl(c), c.incompatible.clone().unwrap()));
    }
    for c in &failed {
        notes.push(format!("{} could not be loaded.", lbl(c)));
    }
    let mut fixes: Vec<String> = skipped.iter().map(|c| format!("install a release of {} that supports this CLI", c.name)).collect();
    fixes.extend(failed.iter().map(|c| format!("run `{}`", fmt(&format!("astryx doctor integration validate {}", c.name), cwd))));
    let check = Check::new(id, label, if skipped.len() + failed.len() > 0 { Status::Warn } else { Status::Pass }, notes.join(" "));
    if fixes.is_empty() {
        check
    } else {
        check.fix(format!("To fix: {}.", fixes.join("; ")))
    }
}

fn check_computer_integrations_available(cwd: &str, loaded: &[String], declared: &[String]) -> Check {
    let id = "computer-integrations";
    let label = "Integrations installed for this computer";
    let installed: Vec<String> = loaded.iter().chain(declared.iter()).cloned().collect();
    let candidates = env::available_computer_integrations(cwd, &installed);
    let available: Vec<&env::ComputerIntegration> = candidates.iter().filter(|c| !loaded.contains(&c.name)).collect();
    if available.is_empty() {
        return Check::new(id, label, Status::Info, "No integration installed for this computer is missing from this project.");
    }
    let c = Check::new(
        id,
        label,
        Status::Info,
        format!(
            "Installed for this computer but not in this project, so not used here: {}.",
            available.iter().map(|c| c.name.clone()).collect::<Vec<_>>().join(", ")
        ),
    );
    match env::project_add_prefix(cwd) {
        Some(add) => c.fix(format!(
            "To use one in this project, run {}.",
            available.iter().map(|x| format!("`{add} {}`", x.name)).collect::<Vec<_>>().join(" or ")
        )),
        None if env::inside_project_elsewhere(cwd) => c.fix(env::RUN_FROM_PROJECT),
        None => c,
    }
}

fn run_computer_checks(cwd: &str) -> Report {
    let f = release_facts(cwd, false);
    let checks = vec![
        check_node_version(&env::node_version()),
        check_answering_release(&f, cwd),
        check_newest_release(&f, true),
        check_cli_on_path(&f.search_path),
        check_computer_integrations_outside(cwd),
        check_computer_agent_text(cwd, Some(&f.search_path)),
    ];
    Report::from_checks(checks)
}

/// `runChecks({cwd, built})`.
pub fn run_checks(cwd: &Path, built_target: Option<&str>) -> Report {
    let cwd_s = cwd.to_string_lossy().into_owned();
    let mut report = if release::is_outside_project(&cwd_s) { run_computer_checks(&cwd_s) } else { run_project_checks(&cwd_s) };
    if let Some(target) = built_target {
        let packages = project::built_integration_packages(target, &cwd_s);
        let mut checks = std::mem::take(&mut report.checks);
        checks.extend(built::check_built(target, cwd, &packages, built::BUILT_FILE_LIMIT));
        report = Report::from_checks(checks);
    }
    report
}

fn run_project_checks(cwd: &str) -> Report {
    let core_dir = crate::discovery::paths::find_project_core_dir(cwd);
    let (config_path, config_error) = match project::find_config_path(cwd) {
        Ok(p) => (p, None),
        Err(e) => (None, Some(e)),
    };
    let p = project::load(cwd);
    let ctx = Ctx {
        cwd: cwd.to_string(),
        node_version: env::node_version(),
        core_dir,
        own_cli: env::project_has_own_cli(cwd),
        project_core: env::project_core_version(cwd),
        config_path,
        config_error,
        p,
    };
    let mut checks = vec![check_node_version(&ctx.node_version), check_core_installed(&ctx), check_version_alignment(&ctx)];
    let app = themes::check_app_themes(cwd);
    checks.push(themes::check_themes(cwd, &app, &themes::theme_import_wiring(cwd)));
    checks.extend(app);
    checks.push(check_config(&ctx));
    checks.push(check_implicit_integrations(&ctx));
    checks.push(check_configured_integrations(&ctx));
    checks.push(check_provider_identity(&ctx));
    checks.push(check_integration_issues(&ctx));
    if let Some(c) = check_icon_sets(&ctx) {
        checks.push(c);
    }
    checks.push(check_agent_docs(&ctx));
    checks.push(check_peer_deps(&ctx));
    checks.push(check_package_manager(&ctx));
    checks.push(check_cli_command(&ctx));
    let f = release_facts(cwd, true);
    checks.push(check_newest_release(&f, false));
    checks.push(check_cli_on_path(&f.search_path));
    let loaded: Vec<String> = ctx
        .p
        .integrations
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|i| i.get("name").map(crate::cli::format::js_string).unwrap_or_else(|| "undefined".into()))
        .collect();
    checks.push(check_computer_integrations_available(cwd, &loaded, &project::declared_package_names(cwd)));
    checks.extend(super::docs_checks::run(&ctx));
    Report::from_checks(checks)
}
