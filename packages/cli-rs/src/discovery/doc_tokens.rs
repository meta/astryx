//! The token scans of `foundation/doc-compiler/doc-syntax.mjs` doctor uses
//! (`commandTokensIn`, `unknownTokensIn`, `unclosedTokensIn`,
//! `tokenForCommand`), on the docs lane's `parse_command_token`.

use super::doc_compiler::doc_syntax::{parse_command_token, Step};
use std::sync::OnceLock;

fn token_re() -> &'static regress::Regex {
    static R: OnceLock<regress::Regex> = OnceLock::new();
    R.get_or_init(|| {
        regress::Regex::new(r#"\{@(@*)([a-z][\w-]*)(?:[ \t]+((?:'[^'\n`]*'|"[^"\n`]*"|\{[^{}\n`]*\}|[^{}'"\n`])*?))?[ \t]*\}"#).unwrap()
    })
}

const COMMAND_TOKENS: [&str; 3] = ["command", "pm", "pm-only"];

/// One command token found (`{token, name, step}`).
#[derive(Debug, Clone)]
pub struct FoundToken {
    pub token: String,
    pub name: String,
    pub step: Result<Step, String>,
}

/// `commandTokensIn(text)`.
pub fn command_tokens_in(text: &str) -> Vec<FoundToken> {
    let mut out = Vec::new();
    for m in token_re().find_iter(text) {
        let ats = m.group(1).map(|g| &text[g]).unwrap_or("");
        let name = &text[m.group(2).unwrap()];
        if !ats.is_empty() || !COMMAND_TOKENS.contains(&name) {
            continue;
        }
        let body = m.group(3).map(|g| &text[g]).unwrap_or("");
        out.push(FoundToken { token: text[m.range()].to_string(), name: name.into(), step: parse_command_token(name, body) });
    }
    out
}

/// `unknownTokensIn(text)`.
pub fn unknown_tokens_in(text: &str) -> Vec<String> {
    token_re()
        .find_iter(text)
        .filter(|m| {
            let ats = m.group(1).map(|g| &text[g]).unwrap_or("");
            let name = &text[m.group(2).unwrap()];
            ats.is_empty() && !COMMAND_TOKENS.contains(&name) && name != "link"
        })
        .map(|m| text[m.range()].to_string())
        .collect()
}

/// `unclosedTokensIn(text)`.
pub fn unclosed_tokens_in(text: &str) -> Vec<String> {
    let starts: Vec<usize> = token_re().find_iter(text).map(|m| m.start()).collect();
    let open = regress::Regex::new(r"\{@@*(?:command|pm-only|pm)\b").unwrap();
    let mut out = Vec::new();
    for m in open.find_iter(text) {
        let at = m.start();
        if starts.contains(&at) {
            continue;
        }
        let end = text[at..].find('\n').map(|e| at + e).unwrap_or(text.len());
        let piece: Vec<u16> = text[at..end].encode_utf16().take(80).collect();
        out.push(String::from_utf16_lossy(&piece));
    }
    out
}

const PM_BINARIES: [&str; 6] = ["npm", "npx", "pnpm", "yarn", "bun", "bunx"];
const NPM_TOOLS: [&str; 24] = [
    "pkg", "pack", "publish", "version", "view", "info", "config", "prefix", "setup", "link", "why", "ls", "list", "outdated", "cache", "init",
    "dist-tag", "login", "whoami", "audit", "ci", "store", "global", "dedupe",
];

/// `tokenForCommand(command)`.
pub fn token_for_command(command: &str) -> Option<String> {
    let words: Vec<&str> = command.trim_matches(super::paths::js_ws).split(super::paths::js_ws).filter(|w| !w.is_empty()).collect();
    let words: Vec<&str> = if words.is_empty() { vec![""] } else { words };
    let bin = words[0];
    let rest: Vec<&str> = words[1..].to_vec();
    if bin == "astryx" {
        return Some(format!("{{@command {}}}", rest.join(" ")).replacen(" }", "}", 1));
    }
    if !PM_BINARIES.contains(&bin) {
        return None;
    }
    let astryx_at = rest.iter().position(|w| *w == "astryx");
    let r0 = rest.first().copied();
    let runner_words = if bin == "npx" || bin == "bunx" {
        0
    } else if bin == "pnpm" && matches!(r0, Some("exec") | Some("dlx")) {
        1
    } else if bin == "yarn" && matches!(r0, Some("run") | Some("dlx") | Some("exec")) {
        1
    } else if bin == "npm" && matches!(r0, Some("exec") | Some("x")) {
        1
    } else if bin == "bun" && r0 == Some("x") {
        1
    } else {
        0
    };
    if let Some(at) = astryx_at {
        if at <= runner_words || rest[runner_words..at].iter().all(|w| w.starts_with('-')) {
            let after: Vec<&str> = rest[at + 1..].iter().copied().filter(|w| *w != "--").collect();
            return if after.is_empty() { None } else { Some(format!("{{@command {}}}", after.join(" "))) };
        }
    }
    if bin == "npm" && r0 == Some("run") && rest.get(1) == Some(&"astryx") {
        let after: Vec<&str> = rest[2..].iter().copied().filter(|w| *w != "--").collect();
        return if after.is_empty() { None } else { Some(format!("{{@command {}}}", after.join(" "))) };
    }
    let pm_only = |m: &str| format!("{{@pm-only {m} \"<why only {m}>\" {}}}", rest.join(" "));
    if bin == "npx" || bin == "bunx" {
        let plain: Vec<&str> = rest.iter().copied().filter(|w| *w != "-y" && *w != "--yes").collect();
        let target = plain.iter().find(|w| !w.starts_with('-')).copied().unwrap_or("");
        let downloads = plain.len() < rest.len() || target.starts_with('@') || regress::Regex::new(r"^[^@]+@").unwrap().find(target).is_some();
        return Some(format!("{{@pm {} {}}}", if downloads { "dlx" } else { "exec" }, plain.join(" ")));
    }
    let mut flags: Vec<&str> = Vec::new();
    let mut args: Vec<&str> = Vec::new();
    let mut verb = r0;
    let mut tail: Vec<&str> = if rest.is_empty() { vec![] } else { rest[1..].to_vec() };
    if bin == "yarn" && verb == Some("global") {
        if matches!(tail.first(), Some(&"add") | Some(&"remove")) {
            flags.push("--global");
            verb = Some(tail[0]);
            tail = tail[1..].to_vec();
        } else {
            return Some(pm_only("yarn-classic"));
        }
    }
    let Some(verb) = verb else { return Some("{@pm install}".into()) };
    let mapped = match verb {
        "install" | "i" | "add" => Some("install"),
        "uninstall" | "un" | "rm" | "remove" => Some("remove"),
        "update" | "up" | "upgrade" => Some("update"),
        "run" | "run-script" => Some("run"),
        "exec" | "x" => Some("exec"),
        "dlx" => Some("dlx"),
        "create" => Some("create"),
        _ => None,
    };
    let manager = if bin == "yarn" { "yarn" } else { bin };
    let Some(mapped) = mapped else {
        if bin == "npm" && ["test", "start", "stop", "restart"].contains(&verb) {
            let mut v = vec![verb];
            v.extend(tail.iter().copied().filter(|w| *w != "--"));
            return Some(format!("{{@pm run {}}}", v.join(" ")));
        }
        if bin != "npm" && bin != "bun" && regress::Regex::new(r"^[\w:.-]+$").unwrap().find(verb).is_some() && !NPM_TOOLS.contains(&verb) {
            let mut v = vec![verb];
            v.extend(tail.iter().copied());
            return Some(format!("{{@pm run {}}}", v.join(" ")));
        }
        return Some(pm_only(manager));
    };
    let passes = ["run", "exec", "dlx", "create"].contains(&mapped);
    for w in &tail {
        if passes {
            if *w != "--" {
                args.push(w);
            }
            continue;
        }
        if ["-D", "-d", "--save-dev", "--dev", "-DE", "-ED"].contains(w) {
            flags.push("--dev");
        }
        if ["-E", "--exact", "--save-exact", "-DE", "-ED"].contains(w) {
            flags.push("--exact");
        }
        if ["-g", "--global"].contains(w) {
            flags.push("--global");
        }
        if *w == "--latest" || *w == "-L" {
            flags.push("--latest");
        }
        if !w.starts_with('-') {
            args.push(w);
        }
    }
    let mut unique: Vec<&str> = Vec::new();
    for f in flags {
        if !unique.contains(&f) {
            unique.push(f);
        }
    }
    let known = ["-D", "-d", "--save-dev", "--dev", "-E", "--exact", "--save-exact", "-g", "--global", "--latest", "-L", "-DE", "-ED", "--"];
    if !passes && tail.iter().any(|w| w.starts_with('-') && !known.contains(w)) {
        return Some(pm_only(manager));
    }
    let mut all = vec![mapped];
    all.extend(args);
    all.extend(unique);
    let body = all.join(" ");
    match parse_command_token("pm", &body) {
        Ok(_) => Some(format!("{{@pm {body}}}")),
        Err(_) => Some(pm_only(manager)),
    }
}
