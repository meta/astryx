//! `astryx init`: port of clients/cli/commands/init.mjs and api/init.

pub mod agent_docs;
pub mod temp;
pub mod user;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, OptValue, Out};
use crate::commands::swizzle::jspath as p;
use crate::commands::swizzle::path_safety::assert_within;
use crate::commands::swizzle::temp_args::{self, Kind, OptSpec};
use crate::json::{Map, Value};
use agent_docs::DocsError;

const VALID_FEATURES: &[&str] = &["agents", "theme", "template"];
const VALID_AGENTS: &[&str] = &["claude", "cursor", "codex", "hermes", "muse", "all"];

struct ApiErr {
    message: String,
    code: &'static str,
}

fn api_err(message: String, code: &'static str) -> ApiErr {
    ApiErr { message, code }
}

/// `logger`: silent under --json; log -> stdout, warn/error -> stderr.
struct Logger<'o> {
    out: &'o mut Out,
    silent: bool,
}

impl Logger<'_> {
    fn log(&mut self, s: &str) {
        if !self.silent {
            self.out.println(s);
        }
    }
    fn warn(&mut self, s: &str) {
        if !self.silent {
            self.out.eprintln(s);
        }
    }
    fn flush(&mut self, lines: agent_docs::Log) {
        for (err, l) in lines {
            if err {
                self.out.warn(&l);
            } else {
                self.out.log(&l);
            }
        }
    }
}

struct Opts {
    features: Option<String>,
    all: bool,
    remove_agents: bool,
    user: bool,
    agent: Option<String>,
    agent_docs_path: Option<Vec<String>>,
}

fn truthy(s: &Option<String>) -> bool {
    s.as_deref().map(|x| !x.is_empty()).unwrap_or(false)
}

pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let inv = &temp_args::normalize(
        inv,
        &[
            OptSpec { long: "--features", short: None, key: "features", kind: Kind::Value },
            OptSpec { long: "--all", short: None, key: "all", kind: Kind::Bool },
            OptSpec { long: "--remove-agents", short: None, key: "removeAgents", kind: Kind::Bool },
            OptSpec { long: "--user", short: None, key: "user", kind: Kind::Bool },
            OptSpec { long: "--agent", short: None, key: "agent", kind: Kind::Value },
            OptSpec { long: "--agent-docs-path", short: None, key: "agentDocsPath", kind: Kind::Variadic },
        ],
        0,
    );
    let opts = Opts {
        features: inv.opt_str("features").map(String::from),
        all: inv.flag("all"),
        remove_agents: inv.flag("removeAgents"),
        user: inv.flag("user"),
        agent: inv.opt_str("agent").map(String::from),
        agent_docs_path: match inv.opt("agentDocsPath") {
            Some(OptValue::List(v)) => Some(v.clone()),
            Some(OptValue::Str(s)) => Some(vec![s.clone()]),
            _ => None,
        },
    };
    let json = inv.json();
    let cwd = inv.cwd.to_string_lossy().into_owned();
    let cli_root = inv.cli_root.to_string_lossy().into_owned();
    let res = {
        let mut lg = Logger { out: &mut *out, silent: json };
        init(&opts, &cwd, &cli_root, &mut lg)
    };
    let receipt = match res {
        Ok(r) => r,
        Err(e) => return out.cli_error(&e.message, ErrorOpts::code(e.code)),
    };
    let soft = receipt.get("type").and_then(|t| t.as_str()) == Some("init.run")
        && receipt["data"]["docsError"].get("kind").and_then(|k| k.as_str()) == Some("path-safety");
    if soft {
        out.exit_code = 1;
    }
    if json {
        out.json_out_response(&receipt);
    }
    Ok(())
}

fn init(o: &Opts, cwd: &str, cli_root: &str, lg: &mut Logger) -> Result<Value, ApiErr> {
    if o.user {
        let mut refused = Vec::new();
        if truthy(&o.features) {
            refused.push("--features");
        }
        if o.all {
            refused.push("--all");
        }
        if o.agent_docs_path.is_some() {
            refused.push("--agent-docs-path");
        }
        if truthy(&o.agent) {
            refused.push("--agent");
        }
        if !refused.is_empty() {
            return Err(api_err(
                format!("`--user` cannot be combined with {}: it writes one skill file for every agent on the computer, linked into the folders agents read, with no features, agents, or path to choose.", refused.join(", ")),
                "ERR_INVALID_ARGUMENT",
            ));
        }
        let (log, data) = user::user(o.remove_agents);
        for (err, l) in log {
            if err {
                lg.warn(&l);
            } else {
                lg.log(&l);
            }
        }
        let mut m = Map::new();
        m.insert("type".into(), Value::String("init.user".into()));
        m.insert("data".into(), data);
        return Ok(Value::Object(m));
    }
    if o.remove_agents {
        let mut ignored = Vec::new();
        if truthy(&o.features) {
            ignored.push("--features");
        }
        if o.all {
            ignored.push("--all");
        }
        if truthy(&o.agent) {
            ignored.push("--agent");
        }
        if o.agent_docs_path.is_some() {
            ignored.push("--agent-docs-path");
        }
        if !ignored.is_empty() {
            return Err(api_err(
                format!("`--remove-agents` cannot be combined with {}: it removes the managed block and ignores install options.", ignored.join(", ")),
                "ERR_INVALID_ARGUMENT",
            ));
        }
        return remove(cwd, lg);
    }
    if o.all && truthy(&o.features) {
        return Err(api_err(
            "`--all` and `--features` cannot be used together: `--all` installs every feature, so a feature list is redundant.".into(),
            "ERR_INVALID_ARGUMENT",
        ));
    }
    run_install(o, cwd, cli_root, lg)
}

fn remove(cwd: &str, lg: &mut Logger) -> Result<Value, ApiErr> {
    let mut skipped = Vec::new();
    let mut log = Vec::new();
    let res = agent_docs::remove_project_agent_docs(cwd, &mut skipped, &mut log);
    lg.flush(log);
    let removed = match res {
        Ok(r) => r,
        Err(DocsError::PathSafety(e)) => return Err(api_err(e.message, code_static(&e.code))),
        Err(DocsError::Home(m)) | Err(DocsError::Other(m)) => return Err(api_err(m, "ERR_UNKNOWN")),
    };
    if !skipped.is_empty() {
        let list: Vec<String> = skipped.iter().map(|(r, why)| format!("{r} ({why})")).collect();
        lg.warn(&format!(
            "Note: Left as {}: {}. To remove the Astryx block there, delete it by hand.",
            if skipped.len() == 1 { "it is" } else { "they are" },
            list.join("; ")
        ));
    }
    let any = !removed.is_empty();
    lg.log(if any { "[ok] AI agent docs removed." } else { "[ok] Nothing to remove: no Astryx agent-docs block was found." });
    let mut data = Map::new();
    data.insert("removed".into(), Value::Bool(any));
    Ok(envelope("init.remove", data))
}

fn code_static(code: &str) -> &'static str {
    match code {
        "ERR_PATH_TRAVERSAL" => "ERR_PATH_TRAVERSAL",
        _ => "ERR_UNKNOWN",
    }
}

fn envelope(kind: &str, data: Map<String, Value>) -> Value {
    let mut m = Map::new();
    m.insert("type".into(), Value::String(kind.into()));
    m.insert("data".into(), Value::Object(data));
    Value::Object(m)
}

struct RunData {
    mode: &'static str,
    features: Vec<String>,
    docs_written: Vec<String>,
    docs_error: Option<(String, Option<String>)>,
    theme: bool,
    theme_template: Option<&'static str>,
    theme_template_path: Option<String>,
    template: Option<&'static str>,
    next_steps: bool,
}

impl RunData {
    fn to_json(&self) -> Value {
        let s = |v: &Option<String>| v.clone().map(Value::String).unwrap_or(Value::Null);
        let mut m = Map::new();
        m.insert("mode".into(), Value::String(self.mode.into()));
        m.insert("features".into(), Value::Array(self.features.iter().cloned().map(Value::String).collect()));
        m.insert("docsWritten".into(), Value::Array(self.docs_written.iter().cloned().map(Value::String).collect()));
        m.insert(
            "docsError".into(),
            match &self.docs_error {
                None => Value::Null,
                Some((kind, msg)) => {
                    let mut e = Map::new();
                    e.insert("kind".into(), Value::String(kind.clone()));
                    if let Some(msg) = msg {
                        e.insert("message".into(), Value::String(msg.clone()));
                    }
                    Value::Object(e)
                }
            },
        );
        m.insert("theme".into(), Value::Bool(self.theme));
        m.insert("themeTemplate".into(), self.theme_template.map(|x| Value::String(x.into())).unwrap_or(Value::Null));
        m.insert("themeTemplatePath".into(), s(&self.theme_template_path));
        m.insert("template".into(), self.template.map(|x| Value::String(x.into())).unwrap_or(Value::Null));
        m.insert("templatePath".into(), Value::Null);
        m.insert("nextSteps".into(), Value::Bool(self.next_steps));
        Value::Object(m)
    }
}

pub fn get_next_steps(inv: &str) -> Vec<String> {
    vec![
        String::new(),
        "  Next steps:".into(),
        "    1. Ensure the @stylexjs/stylex peer dependency is met".into(),
        format!("       (run `{inv} doctor` to verify)"),
        "    2. Import base styles: import '@astryxdesign/core/reset.css'".into(),
        "       and import '@astryxdesign/core/astryx.css'".into(),
        "    3. Import components: import { Button } from '@astryxdesign/core/Button'".into(),
        "    4. Add and wire a theme:".into(),
        "       npm install @astryxdesign/theme-neutral".into(),
        format!("       {inv} theme add neutral"),
        "       import { Theme } from '@astryxdesign/core/theme'".into(),
        "       import { themes, defaultThemeSlug } from './astryx-themes'".into(),
        "       <Theme theme={themes[defaultThemeSlug]}>...</Theme>".into(),
        format!("       Extend an imported theme to customize it. Run `{inv} theme eject <slug>` only to fork source."),
        format!("    5. {inv} --help for all commands"),
        String::new(),
    ]
}

fn same_folder(a: &str, b: &str) -> bool {
    let real = |x: &str| p::realpath(x).unwrap_or_else(|| p::resolve1(x));
    real(a) == real(b)
}

fn apply_agents(cwd: &str, cli_root: &str, o: &Opts, invocation: &str, data: &mut RunData, lg: &mut Logger) -> Result<(), ApiErr> {
    if let Some(a) = o.agent.as_deref().filter(|a| !a.is_empty()) {
        if !VALID_AGENTS.contains(&a) {
            return Err(api_err(format!("Unknown agent \"{a}\". Valid agents: {}", VALID_AGENTS.join(", ")), "ERR_UNKNOWN_AGENT"));
        }
    }
    let paths = o.agent_docs_path.clone();
    let root = agent_docs::agent_docs_target_dir(cwd);
    let target = if paths.is_some() { cwd.to_string() } else { root.clone() };
    let mut skipped = Vec::new();
    let result = (|| -> Result<Vec<String>, DocsError> {
        if paths.is_none() {
            agent_docs::assert_agent_docs_target(&target)?;
        }
        let block = agent_docs::render_agent_docs_block(&root, cli_root).map_err(DocsError::Other)?;
        agent_docs::install_agent_docs(
            &target,
            &agent_docs::InstallOptions {
                agent: o.agent.as_deref(),
                paths: paths.clone(),
                only_replace: false,
                rendered_block: block,
                refuse_escapes: same_folder(&target, cwd),
            },
            &mut skipped,
        )
    })();
    match result {
        Ok(files) => {
            let written: Vec<String> = if p::resolve1(&target) == p::resolve1(cwd) {
                files
            } else {
                files.iter().map(|r| p::relative(cwd, &p::join2(&target, r))).collect()
            };
            lg.log(&format!("[ok] AI agent docs installed -> {}", written.join(", ")));
            data.docs_written = written;
            if !skipped.is_empty() {
                let list: Vec<String> = skipped.iter().map(|(r, why)| format!("{r} ({why})")).collect();
                let message = format!(
                    "Left as {}: {}. To have init write the Astryx block there, make it a regular file inside the project, or copy the block from AGENTS.md by hand.",
                    if skipped.len() == 1 { "it is" } else { "they are" },
                    list.join("; ")
                );
                lg.warn(&format!("Note: {message}"));
                data.docs_error = Some(("install-failed".into(), Some(message)));
            }
        }
        Err(DocsError::PathSafety(e)) => {
            lg.warn(&format!("Error: {}", e.message));
            data.docs_error = Some(("path-safety".into(), Some(e.message)));
        }
        Err(DocsError::Home(m)) => {
            lg.warn(&format!("Note: {m}"));
            data.docs_error = Some(("install-failed".into(), Some(m)));
        }
        Err(DocsError::Other(_e)) => {
            if std::env::var("ASTRYX_RS_DEBUG").is_ok() { eprintln!("debug: {_e}"); }
            lg.warn(&format!("Could not install agent docs. Try again with `{invocation} init --features agents`."));
            data.docs_error = Some(("install-failed".into(), None));
        }
    }
    Ok(())
}

fn strip_copyright_header(s: &str) -> String {
    let re = regress::Regex::new(r"^(\uFEFF?(?:#![^\r\n]*(?:\r?\n))?)\/\/ Copyright \(c\) Meta Platforms, Inc\. and affiliates\.\r?\n(?:\r?\n)*").unwrap();
    let mut out = match re.find(s) {
        Some(m) => format!("{}{}", &s[m.group(1).unwrap()], &s[m.end()..]),
        None => s.to_string(),
    };
    let re2 = regress::Regex::new(r"^(\uFEFF?)<!-- Copyright \(c\) Meta Platforms, Inc\. and affiliates\. -->\r?\n(?:\r?\n)*").unwrap();
    if let Some(m) = re2.find(&out) {
        out = format!("{}{}", &out[m.group(1).unwrap()], &out[m.end()..]);
    }
    out
}

/// TEMP: replace with the template+theme lane's themeTemplate.
fn theme_template(cwd: &str, cli_root: &str) -> Result<(String, bool), ()> {
    let target = "theme.template.ts";
    let resolved = assert_within(target, cwd, false, "theme template path").map_err(|_| ())?;
    let rel = {
        let r = p::relative(cwd, &resolved);
        if r.is_empty() {
            target.to_string()
        } else {
            r
        }
    };
    if p::exists(&resolved) {
        return Ok((rel, false));
    }
    let src = std::fs::read_to_string(p::join(&[cli_root, "assets", "theme.template.ts"])).map_err(|_| ())?;
    std::fs::create_dir_all(p::dirname(&resolved)).map_err(|_| ())?;
    std::fs::write(&resolved, strip_copyright_header(&src)).map_err(|_| ())?;
    Ok((rel, true))
}

fn apply_theme(cwd: &str, cli_root: &str, inv: &str, data: &mut RunData, lg: &mut Logger) {
    data.theme = true;
    match theme_template(cwd, cli_root) {
        Ok((written, did)) => {
            data.theme_template = Some(if did { "created" } else { "skipped" });
            data.theme_template_path = if did { Some(written.clone()) } else { None };
            lg.log(&if did { format!("[ok] Theme template written -> {written}") } else { format!("- {written} already exists - left as is.") });
        }
        Err(()) => {
            data.theme_template = Some("failed");
            lg.warn("Could not write the theme template.");
        }
    }
    if temp::is_outside_project(cwd) {
        lg.log(&format!("  Edit the blank template for a new theme, or run `{inv} theme eject <slug>` to start from the source of a built theme (`{inv} theme list` to browse)."));
    } else {
        lg.log(&format!("  Edit the blank template for a new theme, or run `{inv} theme add <slug>` to import an installed built theme (`{inv} theme list` to browse). Extend an imported theme for ordinary customization; use `{inv} theme eject <slug>` only to fork source."));
    }
}

fn apply_template(cli_root: &str, inv: &str, data: &mut RunData, lg: &mut Logger) {
    let pages = p::join(&[cli_root, "assets", "templates", "pages"]);
    let any = p::readdir(&pages).unwrap_or_default().iter().any(|e| p::is_dir(&p::join2(&pages, e)));
    if !any {
        data.template = Some("skipped");
        return;
    }
    lg.log("[ok] To build UI, use these commands:");
    lg.log("");
    lg.log(&format!("    {inv} build \"<what you're building>\"   build a page - kit: closest template + blocks + components"));
    lg.log(&format!("    {inv} build                            the how-to-build workflow (read this first)"));
    lg.log(&format!("    {inv} search <query>                   find anything - components, docs, templates, blocks"));
    lg.log("");
    data.template = Some("workflow");
}

fn run_install(o: &Opts, cwd: &str, cli_root: &str, lg: &mut Logger) -> Result<Value, ApiErr> {
    let invocation = crate::discovery::package_manager::get_cli_invocation(Some(cwd));
    if truthy(&o.features) || o.all {
        let features: Vec<String> = if o.all {
            VALID_FEATURES.iter().map(|s| s.to_string()).collect()
        } else {
            o.features.as_deref().unwrap().split(',').map(|f| agent_docs::js_trim(f).to_lowercase()).collect()
        };
        let invalid: Vec<&String> = features.iter().filter(|f| !VALID_FEATURES.contains(&f.as_str())).collect();
        if !invalid.is_empty() {
            return Err(api_err(
                format!(
                    "Unknown features: {}. Valid features: {}",
                    invalid.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", "),
                    VALID_FEATURES.join(", ")
                ),
                "ERR_UNKNOWN_FEATURE",
            ));
        }
        let mut data = RunData {
            mode: "features",
            features: features.clone(),
            docs_written: vec![],
            docs_error: None,
            theme: false,
            theme_template: None,
            theme_template_path: None,
            template: None,
            next_steps: false,
        };
        for f in &features {
            match f.as_str() {
                "agents" => apply_agents(cwd, cli_root, o, &invocation, &mut data, lg)?,
                "theme" => apply_theme(cwd, cli_root, &invocation, &mut data, lg),
                "template" => apply_template(cli_root, &invocation, &mut data, lg),
                _ => {}
            }
        }
        let mut m = Map::new();
        m.insert("type".into(), Value::String("init.run".into()));
        m.insert("data".into(), data.to_json());
        return Ok(Value::Object(m));
    }
    let outside = temp::is_outside_project(cwd);
    let mut data = RunData {
        mode: "default",
        features: vec!["agents".into()],
        docs_written: vec![],
        docs_error: None,
        theme: false,
        theme_template: None,
        theme_template_path: None,
        template: None,
        next_steps: !outside,
    };
    apply_agents(cwd, cli_root, o, &invocation, &mut data, lg)?;
    lg.log("");
    lg.log(&format!("  Tip: `{invocation} init --all` also points you to the theme and page-building workflows."));
    if outside {
        lg.log("");
    } else {
        for l in get_next_steps(&invocation) {
            lg.log(&l);
        }
    }
    let mut m = Map::new();
    m.insert("type".into(), Value::String("init.run".into()));
    m.insert("data".into(), data.to_json());
    Ok(Value::Object(m))
}
