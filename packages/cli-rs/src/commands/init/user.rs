//! Port of foundation/agent-docs/computer-agent-text.mjs and api/init/user:
//! the computer-level agent text (`init --user`).

use super::agent_docs::{MARKER_END, MARKER_START, SELF_CHECK_CSS, WORKFLOW_STEPS, WORKFLOW_TITLE};
use crate::commands::swizzle::jspath as p;
use crate::json::{Map, Value};
use regress::Regex;
use std::os::unix::fs::OpenOptionsExt;

pub const COMPUTER_COMMAND: &str = "astryx";
pub const COMPUTER_INSTALL_STEP: &str = "npm i -g @astryxdesign/cli";
const SKILL_DESCRIPTION: &str = "Astryx, a design system and UI library, is available on this computer through the astryx command; use it when building or changing UI, choosing components, layout, styling or theming, working with a design system, or in any project that depends on @astryxdesign packages or mentions Astryx.";

/// (skills folder, condition folder, copy?)
const SKILL_LINKS: &[(&str, Option<&str>, bool)] = &[
    (".claude/skills", None, false),
    (".kiro/skills", Some(".kiro"), false),
    (".codeium/windsurf/skills", Some(".codeium/windsurf"), false),
    (".letta/skills", Some(".letta"), false),
    ("Library/Developer/Xcode/CodingAssistant/ClaudeAgentConfig/skills", Some("Library/Developer/Xcode/CodingAssistant"), false),
    (".config/agents/skills", Some(".config/agents/skills"), false),
    (".continue/skills", Some(".continue"), true),
];

#[derive(Clone, Debug)]
pub struct Row {
    pub path: String,
    pub action: &'static str,
    pub reason: Option<&'static str>,
}

fn row(path: &str, action: &'static str) -> Row {
    Row { path: path.into(), action, reason: None }
}
fn kept(path: &str, reason: &'static str) -> Row {
    Row { path: path.into(), action: "kept", reason: Some(reason) }
}

pub fn homedir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".into())
}

pub fn display_home_path(file: &str, home: &str) -> String {
    let rel = p::relative(home, file);
    if !rel.is_empty() && !rel.starts_with("..") && !p::is_absolute(&rel) {
        format!("~/{rel}")
    } else {
        file.to_string()
    }
}

fn skill_file(home: &str) -> String {
    p::join(&[home, ".agents/skills/astryx", "SKILL.md"])
}

fn skill_links(home: &str) -> Vec<(String, bool, bool)> {
    SKILL_LINKS
        .iter()
        .map(|(skills, when, copy)| (p::join(&[home, skills, "astryx"]), when.map(|w| p::exists(&p::join2(home, w))).unwrap_or(true), *copy))
        .collect()
}

fn skill_install_step_of(content: &str) -> Option<String> {
    let re = Regex::new(r"is not found, run `(.+?)` first\.").unwrap();
    re.find(content).map(|m| content[m.group(1).unwrap()].to_string())
}

/// `computerInstallStep`. TEMP: a global copy's own step is not read yet.
fn install_step(home: &str) -> String {
    p::read_to_string(&skill_file(home)).and_then(|c| skill_install_step_of(&c)).unwrap_or_else(|| COMPUTER_INSTALL_STEP.into())
}

fn body_lines(run: &str, install: &str) -> Vec<String> {
    let mut v = vec![
        "Astryx, a design system and UI library, is available on this computer.".to_string(),
        "Use it when you build or change UI, pick components, or style or theme an app.".into(),
        format!("Its docs, components, templates, and themes are all reachable through `{run}`. Start with `{run} search '<what you need>'`."),
        format!("Then read `{run} component <Name>` or `{run} docs <topic>`, not the package's files."),
        "In a project, the project's version of Astryx answers automatically.".into(),
        format!("To build UI, work in a project folder (create one if there is none). Add `@astryxdesign/core` and `@astryxdesign/cli` to a new project or one without `@astryxdesign/core`; to a project that already has `@astryxdesign/core`, add `@astryxdesign/cli` at the same version. Run `{run} init` there and follow the agent docs it writes."),
        WORKFLOW_TITLE.into(),
    ];
    v.extend(WORKFLOW_STEPS.iter().map(|s| s.replace("`astryx ", &format!("`{run} "))));
    v.push(format!("Before you deliver, re-read each file; {SELF_CHECK_CSS}. Then build the project and deliver that build, not a description of it."));
    if run == COMPUTER_COMMAND {
        v.push(format!("If `{COMPUTER_COMMAND}` is not found, run `{install}` first."));
    }
    v
}

fn sha256(s: &str) -> String {
    use sha2::Digest;
    let d = sha2::Sha256::digest(s.as_bytes());
    d.iter().map(|b| format!("{b:02x}")).collect()
}

fn with_hash(text: &str) -> String {
    let Some(at) = text.find(MARKER_START) else { return text.to_string() };
    let cut = text[at..].find('\n').map(|i| at + i + 1).unwrap_or(text.len());
    format!("{}<!-- astryx-managed sha256:{} -->\n{}", &text[..cut], sha256(text), &text[cut..])
}

pub fn render(command: &str, install: &str) -> String {
    let mut lines = vec![
        "---".to_string(),
        "name: astryx".into(),
        format!("description: {}", crate::json::stringify(&Value::String(SKILL_DESCRIPTION.into()), 0)),
        "---".into(),
        String::new(),
        MARKER_START.into(),
    ];
    lines.extend(body_lines(command, install));
    lines.push(MARKER_END.into());
    lines.push(String::new());
    with_hash(&lines.join("\n"))
}

fn hash_line_re() -> Regex {
    Regex::with_flags(r"^<!-- astryx-managed sha256:([0-9a-f]{64}) -->\n", "mu").unwrap()
}

fn is_unedited(content: &str) -> bool {
    let re = hash_line_re();
    let Some(m) = re.find(content) else { return false };
    let without = format!("{}{}", &content[..m.start()], &content[m.end()..]);
    sha256(&without) == content[m.group(1).unwrap()]
}

fn has_markers(c: &str) -> bool {
    match c.find(MARKER_START) {
        Some(s) => c[s..].contains(MARKER_END),
        None => false,
    }
}

fn state_of(file: &str, expected: &str) -> &'static str {
    let Ok(meta) = std::fs::symlink_metadata(file) else { return "absent" };
    if !meta.is_file() {
        return "foreign";
    }
    let Ok(bytes) = std::fs::read(file) else { return "foreign" };
    let content = String::from_utf8_lossy(&bytes);
    if !has_markers(&content) {
        return "foreign";
    }
    if content == expected {
        return "current";
    }
    if is_unedited(&content) {
        "differs"
    } else {
        "edited"
    }
}

fn real_path(x: &str) -> String {
    match p::realpath(x) {
        Some(r) => r,
        None => {
            let parent = p::dirname(x);
            if parent == x {
                x.to_string()
            } else {
                p::join2(&real_path(&parent), &p::basename(x))
            }
        }
    }
}

fn points_at(at: &str, folder: &str) -> Option<&'static str> {
    let text = std::fs::read_link(at).ok()?.to_string_lossy().into_owned();
    let followed = p::resolve(&[&real_path(&p::dirname(at)), &text]);
    let wanted = real_path(folder);
    if followed.trim_end_matches('/') == wanted {
        return Some("reaches");
    }
    let named = p::resolve(&[&p::dirname(at), &text]);
    if named.trim_end_matches('/') == folder {
        Some("names")
    } else {
        None
    }
}

fn copy_state_of(at: &str, expected: &str) -> &'static str {
    let Ok(meta) = std::fs::symlink_metadata(at) else { return "absent" };
    if !meta.is_dir() {
        return "foreign";
    }
    let Some(names) = p::readdir(at) else { return "foreign" };
    if names.is_empty() {
        return "absent";
    }
    if names.len() != 1 || names[0] != "SKILL.md" {
        return "foreign";
    }
    let st = state_of(&p::join2(at, "SKILL.md"), expected);
    if st == "current" && expected.is_empty() {
        "differs"
    } else {
        st
    }
}

fn link_state_of(at: &str, folder: &str) -> &'static str {
    let Ok(meta) = std::fs::symlink_metadata(at) else { return "absent" };
    if meta.file_type().is_symlink() {
        return match points_at(at, folder) {
            None => "foreign",
            Some("names") => "dangling",
            _ => {
                if p::exists(&p::join2(folder, "SKILL.md")) {
                    "linked"
                } else {
                    "dangling"
                }
            }
        };
    }
    if !meta.is_dir() {
        return "foreign";
    }
    if copy_state_of(at, "") == "differs" {
        "differs"
    } else {
        "foreign"
    }
}

fn write_no_follow(file: &str, content: &str) -> std::io::Result<()> {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o644).custom_flags(libc_o_nofollow()).open(file)?;
    f.write_all(content.as_bytes())
}

fn libc_o_nofollow() -> i32 {
    0o400000
}

fn kept_reason(state: &str) -> &'static str {
    if state == "edited" {
        "edited"
    } else {
        "not-astryx"
    }
}

fn remove_file(file: &str) {
    let _ = std::fs::remove_file(file);
    let _ = std::fs::remove_dir(p::dirname(file));
}

fn make_link(at: &str, folder: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(p::dirname(at))?;
    let real_folder = p::realpath(folder).ok_or_else(|| std::io::Error::other("realpath"))?;
    let base = p::realpath(&p::dirname(at)).ok_or_else(|| std::io::Error::other("realpath"))?;
    let rel = p::relative(&base, &real_folder);
    let target = if p::is_absolute(&rel) { real_folder } else { rel };
    std::os::unix::fs::symlink(target, at)
}

fn write_copy(at: &str, expected: &str) -> Row {
    let st = copy_state_of(at, expected);
    if st == "current" {
        return row(at, "unchanged");
    }
    if st == "foreign" || st == "edited" {
        return kept(at, kept_reason(st));
    }
    if std::fs::create_dir_all(at).is_ok() && write_no_follow(&p::join2(at, "SKILL.md"), expected).is_ok() {
        row(at, "written")
    } else {
        kept(at, "not-astryx")
    }
}

fn write_text(home: &str, command: &str) -> (Vec<Row>, Vec<String>) {
    let judged = render(command, &install_step(home));
    let file = skill_file(home);
    let folder = p::dirname(&file);
    let mut rows = Vec::new();
    let state = state_of(&file, &judged);
    let expected = if state == "current" { judged.clone() } else { render(command, &install_step(home)) };
    if state == "foreign" || state == "edited" {
        rows.push(kept(&file, kept_reason(state)));
    } else if state == "current" {
        rows.push(row(&file, "unchanged"));
    } else {
        let _ = std::fs::create_dir_all(&folder);
        let _ = write_no_follow(&file, &expected);
        rows.push(row(&file, "written"));
    }
    let mut links = Vec::new();
    for (at, wanted, copy) in skill_links(home) {
        if !wanted {
            continue;
        }
        let ls = link_state_of(&at, &folder);
        if ls == "linked" {
            links.push(at.clone());
            rows.push(row(&at, "unchanged"));
            continue;
        }
        if copy {
            rows.push(write_copy(&at, &expected));
            continue;
        }
        if ls == "foreign" {
            rows.push(kept(&at, "not-astryx"));
            continue;
        }
        if ls == "differs" {
            remove_file(&p::join2(&at, "SKILL.md"));
        }
        if ls == "dangling" {
            let _ = std::fs::remove_file(&at);
        }
        match make_link(&at, &folder) {
            Ok(()) => {
                links.push(at.clone());
                rows.push(row(&at, "linked"));
            }
            Err(_) => rows.push(write_copy(&at, &expected)),
        }
    }
    (rows, links)
}

fn remove_text(home: &str, links: &[String]) -> Vec<Row> {
    let file = skill_file(home);
    let folder = p::dirname(&file);
    let mut rows = Vec::new();
    for at in links {
        let ls = link_state_of(at, &folder);
        if ls != "linked" && ls != "dangling" {
            continue;
        }
        match std::fs::remove_file(at) {
            Ok(()) => rows.push(row(at, "removed")),
            Err(_) => rows.push(kept(at, "not-astryx")),
        }
    }
    for (at, _, _) in skill_links(home) {
        if copy_state_of(&at, "") != "differs" {
            continue;
        }
        remove_file(&p::join2(&at, "SKILL.md"));
        rows.push(row(&at, "removed"));
    }
    let st = state_of(&file, "");
    let first = if st == "absent" {
        row(&file, "absent")
    } else if st == "foreign" || st == "edited" {
        kept(&file, kept_reason(st))
    } else {
        remove_file(&file);
        row(&file, "removed")
    };
    rows.insert(0, first);
    rows
}

// ---- settings and state ----

fn config_dir() -> String {
    crate::discovery::release::user_config_dir()
}

fn read_obj(file: &str) -> Map<String, Value> {
    match p::read_to_string(file).and_then(|s| serde_json::from_str::<Value>(&s).ok()) {
        Some(Value::Object(m)) => m,
        _ => Map::new(),
    }
}

fn write_json_atomic(file: &str, v: &Map<String, Value>) {
    let _ = std::fs::create_dir_all(p::dirname(file));
    let tmp = format!("{file}.{}.tmp", std::process::id());
    let text = format!("{}\n", crate::json::stringify(&Value::Object(crate::json::js_key_order(v.clone())), 2));
    if std::fs::write(&tmp, text).is_ok() {
        let _ = std::fs::rename(&tmp, file);
    }
}

fn recorded_links() -> Vec<String> {
    let s = read_obj(&p::join2(&config_dir(), "settings.json"));
    match s.get("computerAgentText") {
        Some(Value::Object(o)) => match o.get("links") {
            Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str().map(String::from)).collect(),
            _ => vec![],
        },
        _ => vec![],
    }
}

fn record_settings(install: bool, links: &[String]) {
    let file = p::join2(&config_dir(), "settings.json");
    let mut s = read_obj(&file);
    let mut c = Map::new();
    c.insert("install".into(), Value::Bool(install));
    c.insert("links".into(), Value::Array(links.iter().cloned().map(Value::String).collect()));
    s.insert("computerAgentText".into(), Value::Object(c));
    write_json_atomic(&file, &s);
}

/// TEMP: replace with shell's global-state `recordAgentTextWritten`.
fn record_agent_text_written(version: &str) {
    if Regex::new(r"^\d+\.\d+\.\d+$").unwrap().find(version).is_none() {
        return;
    }
    let dir = config_dir();
    let file = p::join2(&dir, "state.json");
    let mut s = read_obj(&file);
    let mut a = Map::new();
    a.insert("writtenBy".into(), Value::String(version.into()));
    s.insert("agentText".into(), Value::Object(a));
    write_json_atomic(&file, &s);
}

fn astryx_on_search_path() -> bool {
    crate::discovery::search_path::astryx_commands_on_search_path().first().map(|c| c.astryx).unwrap_or(false)
}

/// `user({remove})`: (log lines (stderr?, text), receipt data).
pub fn user(remove: bool) -> (Vec<(bool, String)>, Value) {
    let home = homedir();
    let command = COMPUTER_COMMAND.to_string();
    let recorded = recorded_links();
    let files = if remove {
        let rows = remove_text(&home, &recorded);
        record_settings(false, &[]);
        rows
    } else {
        let (rows, links) = write_text(&home, &command);
        let mut all = recorded.clone();
        for l in links {
            if !all.contains(&l) {
                all.push(l);
            }
        }
        record_settings(true, &all);
        record_agent_text_written(&crate::cli::env::cli_version());
        rows
    };
    let mut warnings = Vec::new();
    if !remove && command == COMPUTER_COMMAND && !astryx_on_search_path() {
        warnings.push(format!(
            "No `{COMPUTER_COMMAND}` command on this computer runs the Astryx CLI, so agents cannot run the commands this text names. Install the CLI for the computer: {COMPUTER_INSTALL_STEP}"
        ));
    }
    let mut log = Vec::new();
    for f in &files {
        let head = match f.action {
            "written" => "[ok] Wrote",
            "linked" => "[ok] Linked",
            "unchanged" => "[ok] Already current:",
            "removed" => "[ok] Removed",
            "absent" => "[ok] Nothing to remove:",
            _ => "[skip] Kept",
        };
        let reason = match f.reason {
            Some("edited") => " (edited since Astryx wrote it; delete it to get the current text):".to_string(),
            Some(_) => " (not created by Astryx):".to_string(),
            None => {
                if f.action == "kept" {
                    ":".into()
                } else {
                    String::new()
                }
            }
        };
        log.push((false, format!("{head}{reason} {}", display_home_path(&f.path, &home))));
    }
    for w in &warnings {
        log.push((true, format!("[warn] {w}")));
    }
    let mut data = Map::new();
    data.insert(
        "files".into(),
        Value::Array(
            files
                .iter()
                .map(|f| {
                    let mut m = Map::new();
                    m.insert("path".into(), Value::String(f.path.clone()));
                    m.insert("action".into(), Value::String(f.action.into()));
                    if let Some(r) = f.reason {
                        m.insert("reason".into(), Value::String(r.into()));
                    }
                    Value::Object(m)
                })
                .collect(),
        ),
    );
    data.insert("command".into(), Value::String(command));
    data.insert("warnings".into(), Value::Array(warnings.into_iter().map(Value::String).collect()));
    (log, Value::Object(data))
}
