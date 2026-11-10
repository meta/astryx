//! Port of `foundation/discovery/runner-commands.mjs` and
//! `runner-allowlist.mjs`: commands a doc writes that should be doc tokens.

use super::doc_compiler::doc_syntax::Step;
use super::doc_tokens;
use super::docs_discovery::IntegrationDocs;
use super::nodepath as np;
use crate::json::Value;

const DOWNLOAD_RUNNERS: [&str; 7] = ["pnpm dlx", "yarn dlx", "npm exec --", "npm exec", "npx", "bunx", "bun x"];
const PROJECT_RUNNERS: [&str; 3] = ["pnpm exec", "pnpm", "yarn"];

/// `CLI_COMMANDS`.
pub const CLI_COMMANDS: [&str; 18] = [
    "blog", "build", "component", "discover", "docs", "doctor", "gap-report", "help", "hook", "init", "integration", "manifest", "postinstall",
    "search", "swizzle", "template", "theme", "upgrade",
];

const BLANK: &str = r"[ \t]+";

fn alternatives(words: &[&str]) -> String {
    words.iter().map(|w| w.replace(' ', BLANK)).collect::<Vec<_>>().join("|")
}

fn download_re() -> regress::Regex {
    let name_end = r"(?![\w@/-]|\.\w)";
    regress::Regex::with_flags(
        &format!(
            r"(?<![\w@/.-])(?:{})(?:{BLANK}--?[a-z][\w-]*)*{BLANK}astryx(?:@[\w^~-]+(?:\.[\w^~-]+)*)?{name_end}(?:{BLANK}({})(?![\w-]))?",
            alternatives(&DOWNLOAD_RUNNERS),
            alternatives(&CLI_COMMANDS)
        ),
        "g",
    )
    .unwrap()
}

fn project_re() -> regress::Regex {
    regress::Regex::with_flags(
        &format!(r"(?<![\w@/.-])(?:{}){BLANK}astryx{BLANK}({})(?![\w-])", alternatives(&PROJECT_RUNNERS), alternatives(&CLI_COMMANDS)),
        "g",
    )
    .unwrap()
}

/// A runner command (`{written, bare, download}`).
#[derive(Debug, Clone, PartialEq)]
pub struct RunnerCommand {
    pub written: String,
    pub bare: String,
    pub download: bool,
}

/// `runnerCommandsIn(text)`.
pub fn runner_commands_in(text: &str) -> Vec<RunnerCommand> {
    let mut found: Vec<(usize, RunnerCommand)> = Vec::new();
    let mut add = |re: regress::Regex, download: bool, found: &mut Vec<(usize, RunnerCommand)>| {
        for m in re.find_iter(text) {
            if found.iter().any(|(at, _)| *at == m.start()) {
                continue;
            }
            let bare = match m.group(1) {
                Some(g) => format!("astryx {}", &text[g]),
                None => "astryx".into(),
            };
            found.push((m.start(), RunnerCommand { written: text[m.range()].to_string(), bare, download }));
        }
    };
    add(download_re(), true, &mut found);
    add(project_re(), false, &mut found);
    found.sort_by_key(|x| x.0);
    found.into_iter().map(|x| x.1).collect()
}

/// A string in a doc with its section title and code language.
struct DocString {
    text: String,
    section: Option<String>,
    lang: Option<String>,
}

fn all_strings(doc: &Value) -> Vec<DocString> {
    let mut out = Vec::new();
    fn walk(v: &Value, section: &Option<String>, lang: Option<String>, out: &mut Vec<DocString>) {
        match v {
            Value::String(s) => out.push(DocString { text: s.clone(), section: section.clone(), lang }),
            Value::Array(a) => a.iter().for_each(|x| walk(x, section, None, out)),
            Value::Object(m) => {
                if m.contains_key("__js") {
                    return;
                }
                for (k, f) in m {
                    if k == "sections" {
                        if let Value::Array(a) = f {
                            for each in a {
                                let t = each.get("title").and_then(|t| t.as_str()).map(String::from).or_else(|| section.clone());
                                walk(each, &t, None, out);
                            }
                            continue;
                        }
                    }
                    if k == "code" {
                        if let Value::String(_) = f {
                            let l = m.get("lang").and_then(|l| l.as_str()).unwrap_or("").to_string();
                            walk(f, section, Some(l), out);
                            continue;
                        }
                    }
                    walk(f, section, None, out);
                }
            }
            _ => {}
        }
    }
    walk(doc, &None, None, &mut out);
    out
}

fn find_from(line: &str, needle: &str, from16: usize) -> Option<usize> {
    // indexOf in UTF-16 units.
    let l: Vec<u16> = line.encode_utf16().collect();
    let n: Vec<u16> = needle.encode_utf16().collect();
    if n.is_empty() {
        return Some(from16.min(l.len()));
    }
    (from16..l.len().saturating_sub(n.len() - 1).max(from16)).find(|&i| i + n.len() <= l.len() && l[i..i + n.len()] == n[..])
}

fn locate(lines: &[&str], written: &str, cursor: (usize, usize)) -> Option<(usize, usize)> {
    for at in cursor.0..lines.len() {
        if let Some(c) = find_from(lines[at], written, if at == cursor.0 { cursor.1 } else { 0 }) {
            return Some((at, c));
        }
    }
    let first = lines.iter().position(|l| l.contains(written))?;
    Some((first, find_from(lines[first], written, 0)?))
}

const MENTION_VERBS: [&str; 11] = ["run", "dlx", "exec", "x", "add", "remove", "rm", "uninstall", "create", "up", "upgrade"];

fn is_mention(command: &str) -> bool {
    let words: Vec<&str> = command.trim_matches(super::paths::js_ws).split(super::paths::js_ws).filter(|w| !w.is_empty()).collect();
    let words = if words.is_empty() { vec![""] } else { words };
    let verb = words.get(1).copied().unwrap_or("");
    let rest: Vec<&str> = words.iter().skip(2).copied().collect();
    let args: Vec<&str> = rest.iter().copied().filter(|w| !w.starts_with('-')).collect();
    let global = rest.iter().any(|w| *w == "-g" || *w == "--global");
    if MENTION_VERBS.contains(&verb) && args.is_empty() {
        return true;
    }
    if (verb == "i" || verb == "install") && global && args.is_empty() {
        return true;
    }
    if verb == "global" && args.len() <= 1 && args.first().copied().unwrap_or("add") == "add" {
        return true;
    }
    (verb == "pkg" || verb == "config") && args.len() <= 1 && args.first().copied().unwrap_or("set") == "set"
}

const SHELL_LANGS: [&str; 6] = ["", "bash", "sh", "shell", "zsh", "console"];

fn commands_of(line: &str) -> Vec<String> {
    let mut body = regress::Regex::new(r"^\s*\$\s+").unwrap().find(line).map(|m| line[m.end()..].to_string()).unwrap_or_else(|| line.to_string());
    if let Some(m) = regress::Regex::new(r"\s+#\s.*$").unwrap().find(&body) {
        body.truncate(m.start());
    }
    let parts: Vec<String> = if body.contains('"') || body.contains('\'') {
        vec![body]
    } else {
        let re = regress::Regex::new(r"&&|\|\||;|\|").unwrap();
        let mut v = Vec::new();
        let mut last = 0;
        for m in re.find_iter(&body) {
            v.push(body[last..m.start()].to_string());
            last = m.end();
        }
        v.push(body[last..].to_string());
        v
    };
    parts.into_iter().map(|p| p.trim_matches(super::paths::js_ws).to_string()).filter(|p| !p.is_empty()).collect()
}

/// One doc command finding (`docCommandsIn` entry).
#[derive(Debug, Clone, PartialEq)]
pub struct DocCommand {
    /// Byte offset (JS sorts by UTF-16 index; the order is the same).
    pub at: i64,
    pub written: String,
    pub code: &'static str,
    pub fix: String,
}

fn index_of(s: &str, needle: &str) -> i64 {
    s.find(needle).map(|b| s[..b].encode_utf16().count() as i64).unwrap_or(-1)
}

fn utf16_at(s: &str, byte: usize) -> i64 {
    s[..byte].encode_utf16().count() as i64
}

const STANDALONE_FLAGS: [&str; 4] = ["--version", "-V", "--help", "-h"];

fn command_word(args: &[String]) -> String {
    let mut i = 0;
    while i < args.len() {
        let a = &args[i];
        if a == "--detail" || a == "--lang" {
            i += 2;
            continue;
        }
        if !a.starts_with('-') {
            return a.clone();
        }
        i += 1;
    }
    String::new()
}

/// `docCommandsIn(text, lang)`.
pub fn doc_commands_in(source: &str, lang: Option<&str>) -> Vec<DocCommand> {
    let mut found: Vec<DocCommand> = Vec::new();
    for each in runner_commands_in(source) {
        let shown = if each.bare.len() > 7 { each.bare[7..].to_string() } else { "…".to_string() };
        found.push(DocCommand {
            at: index_of(source, &each.written),
            written: each.written.clone(),
            code: "runner_command",
            fix: format!(
                "Write the token `{{@command {shown}}}`; the CLI shows it with your project's runner{}",
                if each.download { ", and a download runner with the bare name fetches an unrelated package called astryx." } else { "." }
            ),
        });
    }
    let mut commands: Vec<(i64, String)> = Vec::new();
    match lang {
        None => {
            let span = regress::Regex::with_flags(r"`([^`\n]+)`", "g").unwrap();
            let pointer = regress::Regex::new(r"^astryx docs [\w-]+$").unwrap();
            for m in span.find_iter(source) {
                let inner = &source[m.group(1).unwrap()];
                if pointer.find(inner.trim_matches(super::paths::js_ws)).is_some() {
                    continue;
                }
                for c in commands_of(inner) {
                    commands.push((utf16_at(source, m.start()), c));
                }
            }
        }
        Some(l) if SHELL_LANGS.contains(&l.to_lowercase().as_str()) => {
            let mut offset = 0i64;
            for line in source.split('\n') {
                for c in commands_of(line) {
                    commands.push((offset, c));
                }
                offset += line.encode_utf16().count() as i64 + 1;
            }
        }
        _ => {}
    }
    let pm_start = regress::Regex::new(r"^(?:npm|npx|pnpm|yarn|bun|bunx)[ \t]+\S").unwrap();
    let plain_start = regress::Regex::new(&format!(r"^astryx{BLANK}(?:{})(?![\w-])", alternatives(&CLI_COMMANDS))).unwrap();
    for (at, command) in commands {
        if found.iter().any(|f| command.contains(&f.written)) {
            continue;
        }
        if is_mention(&command) {
            continue;
        }
        if pm_start.find(&command).is_some() {
            let Some(token) = doc_tokens::token_for_command(&command) else { continue };
            if token.starts_with("{@command") {
                continue;
            }
            let first = command.split(super::paths::js_ws).next().unwrap_or("");
            found.push(DocCommand {
                at,
                written: command.clone(),
                code: "package_manager_command",
                fix: if token.starts_with("{@pm-only") {
                    format!("Only {first} runs this; write `{token}` with the reason readers see, or the `{{@pm …}}` step every package manager runs")
                } else {
                    format!("Write `{token}`; the CLI shows it in your reader's package manager")
                },
            });
        } else if plain_start.find(&command).is_some() {
            found.push(DocCommand {
                at,
                written: command.clone(),
                code: "plain_command",
                fix: format!(
                    "Write `{{@command {}}}`; the CLI shows it with your reader's runner and checks that the command exists",
                    command["astryx".len()..].trim_matches(super::paths::js_ws)
                ),
            });
        }
    }
    for t in doc_tokens::command_tokens_in(source) {
        match &t.step {
            Err(e) => found.push(DocCommand { at: index_of(source, &t.token), written: t.token.clone(), code: "doc_token", fix: e.clone() }),
            Ok(Step::Command(args)) => {
                let word = command_word(args);
                if !CLI_COMMANDS.contains(&word.as_str()) && !(args.len() == 1 && STANDALONE_FLAGS.contains(&args[0].as_str())) {
                    found.push(DocCommand {
                        at: index_of(source, &t.token),
                        written: t.token.clone(),
                        code: "doc_token",
                        fix: if word.is_empty() {
                            format!("This token names no Astryx command: write the command first, then its flags; the commands are {}", CLI_COMMANDS.join(", "))
                        } else {
                            format!("`{word}` is not an Astryx command; the commands are {}", CLI_COMMANDS.join(", "))
                        },
                    });
                }
            }
            Ok(_) => {}
        }
    }
    let reads_tokens = match lang {
        None => true,
        Some(l) => SHELL_LANGS.contains(&l.to_lowercase().as_str()),
    };
    for opening in doc_tokens::unclosed_tokens_in(source) {
        found.push(DocCommand {
            at: index_of(source, &opening),
            written: opening,
            code: "doc_token",
            fix: "This token never closes, so it prints as written: end it with `}`, and close any quote inside it".into(),
        });
    }
    if reads_tokens {
        for token in doc_tokens::unknown_tokens_in(source) {
            found.push(DocCommand {
                at: index_of(source, &token),
                written: token,
                code: "doc_token",
                fix: "Doc tokens are `{@link}`, `{@command}`, `{@pm}` and `{@pm-only}`; write `{@@…}` to show a token as written".into(),
            });
        }
    }
    found.sort_by_key(|f| f.at);
    found
}

/// One `findDocCommands` row.
#[derive(Debug, Clone, PartialEq)]
pub struct DocCommandNote {
    pub code: &'static str,
    pub topic: String,
    pub section: Option<String>,
    pub file: String,
    pub line: Option<usize>,
    pub command: String,
    pub message: String,
}

impl DocCommandNote {
    pub fn to_json(&self) -> Value {
        serde_json::json!({"code": self.code, "topic": self.topic, "section": self.section, "file": self.file, "line": self.line, "command": self.command, "message": self.message})
    }
}

/// `findDocCommands(discovered)`.
pub fn find_doc_commands(discovered: &IntegrationDocs) -> Vec<DocCommandNote> {
    let mut topics: Vec<(String, Option<String>)> = discovered.records.iter().map(|r| (r.name.clone(), Some(r.path.clone()))).collect();
    for g in &discovered.guides {
        topics.push((
            super::paths::js_string(g.get("name")),
            g.get("ref").and_then(|r| r.get("topicFile")).and_then(|f| f.as_str()).map(String::from),
        ));
    }
    let mut found = Vec::new();
    for (name, file) in topics {
        let Some(file) = file else { continue };
        let Ok(doc) = super::docs_discovery::load_topic_module(&file) else { continue };
        let text_all = np::read_text(&file).unwrap_or_default();
        let lines: Vec<&str> = if text_all.is_empty() { vec![] } else { text_all.split('\n').collect() };
        let mut cursor = (0usize, 0usize);
        for ds in all_strings(&doc) {
            let commands = doc_commands_in(&ds.text, ds.lang.as_deref());
            if commands.is_empty() {
                continue;
            }
            let forms = [format!("'{}'", ds.text), format!("\"{}\"", ds.text), crate::json::stringify(&Value::String(ds.text.clone()), 0)];
            let holds = |l: &str| forms.iter().any(|f| l.contains(f.as_str()));
            let multiline = ds.text.contains('\n');
            let after: i64 = if multiline {
                -1
            } else {
                lines
                    .iter()
                    .enumerate()
                    .position(|(at, l)| if at > cursor.0 { holds(l) } else { at == cursor.0 && forms.iter().any(|f| find_from(l, f, cursor.1).is_some()) })
                    .map(|x| x as i64)
                    .unwrap_or(-1)
            };
            let literal: i64 = if after >= 0 || multiline { after } else { lines.iter().position(|l| holds(l)).map(|x| x as i64).unwrap_or(-1) };
            let column = if after >= 0 && after as usize == cursor.0 { cursor.1 } else { 0 };
            let mut from = if literal >= 0 { (literal as usize, column) } else { cursor };
            for c in commands {
                let place = locate(&lines, &c.written, from);
                if let Some((pl, pc)) = place {
                    from = (pl, pc + c.written.encode_utf16().count());
                    if pl > cursor.0 || (pl == cursor.0 && pc >= cursor.1) {
                        cursor = from;
                    }
                }
                let line = place.map(|p| p.0 + 1);
                let where_ = ds.section.as_ref().map(|s| format!(" (section \"{s}\")")).unwrap_or_default();
                let at_line = line.map(|l| format!(" (line {l})")).unwrap_or_default();
                found.push(DocCommandNote {
                    code: c.code,
                    topic: name.clone(),
                    section: ds.section.clone(),
                    file: file.clone(),
                    line,
                    command: c.written.clone(),
                    message: format!("\"{name}\"{where_} writes `{}`{at_line}. {}", c.written, c.fix),
                });
            }
        }
    }
    found
}

/// `findRunnerCommands(discovered)`.
pub fn find_runner_commands(discovered: &IntegrationDocs) -> Vec<DocCommandNote> {
    find_doc_commands(discovered).into_iter().filter(|c| c.code == "runner_command").collect()
}

/// `RUNNER_COMMAND_ALLOWLIST`: skip patterns (JS regex sources) and runner
/// examples (repo path → reason).
pub const RUNNER_SKIP: [&str; 5] = [
    r"(^|\/)CHANGELOG\.md$",
    r"\.test\.[cm]?[jt]sx?$",
    r"(^|\/)__tests__\/",
    r"^packages\/cli\/test\/",
    r"^packages\/cli\/foundation\/env\/package-manager\.mjs$",
];
pub const RUNNER_EXAMPLES: [(&str, &str); 9] = [
    ("packages/core/docs.mjs", "Core's setup banner, for a project that has no CLI installed yet"),
    ("packages/cli/assets/docs/tree/updates.doc.mjs", "quotes the CLI's own update notice, which names the project's runner"),
    ("packages/cli/assets/docs/tree/cli-command.doc.mjs", "explains how printed commands start, the pinned `npx @astryxdesign/cli@<version>` among them"),
    ("packages/cli/assets/docs/tree/who-answers.doc.mjs", "explains how printed commands start, the pinned `npx @astryxdesign/cli@<version>` among them"),
    ("packages/cli/assets/docs/tree/project-global-or-both.doc.mjs", "compares running the CLI with npx to installing it, and is found by searching for that command"),
    ("packages/cli/assets/docs/tree/install-once.doc.mjs", "names a pinned release, `npx @astryxdesign/cli@<version>`, which answers as that version"),
    ("packages/cli/assets/docs/tree/doc-syntax.doc.mjs", "shows what each doc token renders as, in every package manager"),
    ("packages/cli/assets/docs/tree/add-a-topic.doc.mjs", "shows what a reader sees for a command token, with their runner"),
    ("packages/cli/clients/cli/commands/upgrade.doc.mjs", "quotes the command upgrade prints when the CLI is older than Core, pinned to the matching release"),
];
