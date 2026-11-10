//! Doc command tokens (foundation/doc-compiler/doc-syntax.mjs): `{@command}`,
//! `{@pm}` and `{@pm-only}` steps, rendered for one package manager.
//!
//! Owner: the docs lane (agreed with discovery).

use std::sync::OnceLock;

pub const DOC_PACKAGE_MANAGERS: &[&str] = &["npm", "pnpm", "yarn", "yarn-classic", "bun"];
const PM_VERBS: &[&str] = &["install", "remove", "update", "run", "exec", "dlx", "create"];
const PM_FLAGS: &[(&str, &[&str])] = &[("--dev", &["install"]), ("--exact", &["install"]), ("--global", &["install", "remove"]), ("--latest", &["update"])];

fn binary(pm: &str) -> &'static str {
    match pm {
        "pnpm" => "pnpm",
        "yarn" | "yarn-classic" => "yarn",
        "bun" => "bun",
        _ => "npm",
    }
}

fn token_re() -> &'static regress::Regex {
    static R: OnceLock<regress::Regex> = OnceLock::new();
    R.get_or_init(|| regress::Regex::new(r#"\{@(@*)([a-z][\w-]*)(?:[ \t]+((?:'[^'\n`]*'|"[^"\n`]*"|\{[^{}\n`]*\}|[^{}'"\n`])*?))?[ \t]*\}"#).unwrap())
}

fn range_re() -> &'static regress::Regex {
    static R: OnceLock<regress::Regex> = OnceLock::new();
    R.get_or_init(|| regress::Regex::with_flags(r"[\^~<>*| ]|(?:^|\.)x(?:\.|$)|^latest$|^next$", "i").unwrap())
}

/// `splitWords(body)`.
pub fn split_words(body: &str) -> Vec<String> {
    static R: OnceLock<regress::Regex> = OnceLock::new();
    let r = R.get_or_init(|| regress::Regex::new(r#""([^"]*)"|(\S+)"#).unwrap());
    r.find_iter(body)
        .map(|m| match m.group(1) {
            Some(g) => format!("\"{}\"", &body[g]),
            None => body[m.group(2).unwrap()].to_string(),
        })
        .collect()
}

#[derive(Debug, Clone)]
pub enum Step {
    Command(Vec<String>),
    PmOnly { manager: String, reason: String, args: Vec<String> },
    Pm { verb: String, args: Vec<String>, flags: Vec<String> },
}

/// `parseCommandToken(name, body)`: a step, or the error doctor reports.
pub fn parse_command_token(name: &str, body: &str) -> Result<Step, String> {
    let words = split_words(body);
    match name {
        "command" => {
            if words.is_empty() {
                return Err("`{@command}` needs a command: `{@command docs theme}`".into());
            }
            if words[0] == "astryx" {
                return Err(format!("`{{@command}}` takes the command without `astryx`: `{{@command {}}}`", words[1..].join(" ")));
            }
            Ok(Step::Command(words))
        }
        "pm-only" => {
            let manager = words.first().cloned().unwrap_or_default();
            if !DOC_PACKAGE_MANAGERS.contains(&manager.as_str()) {
                return Err(format!(
                    "`{{@pm-only}}` starts with the package manager, one of {}: `{{@pm-only npm \"<why only npm>\" pkg set name=x}}`",
                    DOC_PACKAGE_MANAGERS.join(", ")
                ));
            }
            let reason = words.get(1).cloned().unwrap_or_default();
            let args: Vec<String> = words.iter().skip(2).cloned().collect();
            let quoted = reason.len() >= 3 && reason.starts_with('"') && reason.ends_with('"');
            if !quoted {
                return Err(format!(
                    "`{{@pm-only {manager}}}` needs a reason in double quotes after the package manager, which readers see: `{{@pm-only {manager} \"<why only {manager}>\" {}}}`",
                    if args.is_empty() { "<command>".to_string() } else { args.join(" ") }
                ));
            }
            if args.is_empty() {
                return Err(format!("`{{@pm-only {manager} {reason}}}` needs a command"));
            }
            Ok(Step::PmOnly { manager, reason: reason[1..reason.len() - 1].to_string(), args })
        }
        "pm" => {
            let verb = words.first().cloned().unwrap_or_default();
            if !PM_VERBS.contains(&verb.as_str()) {
                return Err(format!("`{{@pm}}` starts with a verb, one of {}: `{{@pm install @acme/widgets}}`", PM_VERBS.join(", ")));
            }
            let mut flags: Vec<String> = Vec::new();
            let mut args = Vec::new();
            let passthrough = verb == "run" || verb == "exec" || verb == "dlx";
            for word in words.iter().skip(1) {
                let known = PM_FLAGS.iter().find(|(f, _)| *f == word.as_str());
                if word.starts_with("--") && known.is_some() && !passthrough {
                    let allowed = known.unwrap().1;
                    if !allowed.contains(&verb.as_str()) {
                        return Err(format!(
                            "`{word}` applies to {}, not `{{@pm {verb}}}`",
                            allowed.iter().map(|e| format!("`{{@pm {e}}}`")).collect::<Vec<_>>().join(" and ")
                        ));
                    }
                    if !flags.contains(word) {
                        flags.push(word.clone());
                    }
                } else if word.starts_with('-') && !passthrough && verb != "create" {
                    let takes: Vec<&str> = PM_FLAGS.iter().filter(|(_, v)| v.contains(&verb.as_str())).map(|(f, _)| *f).collect();
                    return Err(format!(
                        "`{{@pm {verb}}}` takes the flags {}, not `{word}`, so it reads the same in every package manager",
                        if takes.is_empty() { "none".to_string() } else { takes.join(", ") }
                    ));
                } else {
                    args.push(word.clone());
                }
            }
            if ["run", "exec", "dlx", "create"].contains(&verb.as_str()) && args.is_empty() {
                return Err(format!("`{{@pm {verb}}}` needs a name: `{{@pm {verb} <name>}}`"));
            }
            if verb == "remove" && args.is_empty() {
                return Err("`{@pm remove}` needs a package".into());
            }
            if flags.iter().any(|f| f == "--exact") {
                let ranged = args.iter().find(|a| match a.rfind('@') {
                    Some(at) if at > 0 => range_re().find(&a[at + 1..]).is_some(),
                    _ => false,
                });
                if let Some(r) = ranged {
                    return Err(format!("`--exact` with a range (`{r}`) keeps the range in every package manager but npm: write one version, or drop `--exact`"));
                }
            }
            if flags.iter().any(|f| f == "--latest") && args.is_empty() {
                return Err("`{@pm update --latest}` needs the packages to move".into());
            }
            Ok(Step::Pm { verb, args, flags })
        }
        _ => Err(format!("`{{@{name}}}` is not a doc token")),
    }
}

fn join(parts: &[&[String]]) -> String {
    parts.iter().flat_map(|p| p.iter()).filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join(" ")
}

fn w(s: &str) -> Vec<String> {
    vec![s.to_string()]
}

/// `renderPmStep(step, pm)`.
pub fn render_pm_step(verb: &str, args: &[String], flags: &[String], pm: &str) -> String {
    let has = |f: &str| flags.iter().any(|x| x == f);
    let global = has("--global");
    let manager = if global && pm == "yarn" { "npm" } else { pm };
    match verb {
        "install" => {
            if args.is_empty() && !global {
                return join(&[&w(binary(manager)), &w("install")]);
            }
            let dev = if has("--dev") { if manager == "bun" { "-d" } else { "-D" } } else { "" };
            let exact = if has("--exact") { if manager == "bun" { "--exact" } else { "-E" } } else { "" };
            if global {
                let head = match manager {
                    "pnpm" => "pnpm add -g",
                    "yarn-classic" => "yarn global add",
                    "bun" => "bun add -g",
                    _ => "npm install -g",
                };
                return join(&[&w(head), &w(exact), args]);
            }
            let add = if manager == "npm" { "npm install".to_string() } else { format!("{} add", binary(manager)) };
            join(&[&w(&add), &w(dev), &w(exact), args])
        }
        "remove" => {
            if global {
                let head = match manager {
                    "pnpm" => "pnpm remove -g",
                    "yarn-classic" => "yarn global remove",
                    "bun" => "bun remove -g",
                    _ => "npm uninstall -g",
                };
                return join(&[&w(head), args]);
            }
            let head = if manager == "npm" { "npm uninstall".to_string() } else { format!("{} remove", binary(manager)) };
            join(&[&w(&head), args])
        }
        "update" => {
            if has("--latest") {
                return match pm {
                    "pnpm" => join(&[&w("pnpm update --latest"), args]),
                    "yarn" => join(&[&w("yarn up"), args]),
                    "yarn-classic" => join(&[&w("yarn upgrade --latest"), args]),
                    "bun" => join(&[&w("bun update --latest"), args]),
                    _ => join(&[&w("npm install"), &args.iter().map(|a| format!("{a}@latest")).collect::<Vec<_>>()]),
                };
            }
            let head = match pm {
                "pnpm" => "pnpm update",
                "yarn" => "yarn up -R",
                "yarn-classic" => "yarn upgrade",
                "bun" => "bun update",
                _ => "npm update",
            };
            join(&[&w(head), args])
        }
        "run" => {
            let script = args.first().cloned().unwrap_or_default();
            let rest: Vec<String> = args.iter().skip(1).cloned().collect();
            if pm == "npm" {
                let tail: Vec<String> = if rest.is_empty() { vec![] } else { std::iter::once("--".to_string()).chain(rest).collect() };
                return join(&[&w("npm run"), &w(&script), &tail]);
            }
            join(&[&w(binary(pm)), &w("run"), &w(&script), &rest])
        }
        "exec" => {
            let head = match pm {
                "pnpm" => "pnpm exec",
                "yarn" | "yarn-classic" => "yarn run",
                "bun" => "bunx",
                _ => "npx",
            };
            join(&[&w(head), args])
        }
        "dlx" => {
            let head = match pm {
                "pnpm" => "pnpm dlx",
                "yarn" => "yarn dlx",
                "bun" => "bunx",
                _ => "npx",
            };
            join(&[&w(head), args])
        }
        "create" => {
            let flag_at = args.iter().position(|a| a.starts_with('-'));
            if pm == "npm" {
                if let Some(at) = flag_at.filter(|&a| a > 0) {
                    let mut v: Vec<String> = args[..at].to_vec();
                    v.push("--".into());
                    v.extend(args[at..].iter().cloned());
                    return join(&[&w("npm create"), &v]);
                }
            }
            join(&[&w(binary(pm)), &w("create"), args])
        }
        _ => join(&[&w(binary(pm)), &w(verb), args]),
    }
}

fn manager_name(pm: &str) -> &'static str {
    match pm {
        "pnpm" => "pnpm",
        "yarn" => "Yarn",
        "yarn-classic" => "Yarn 1",
        "bun" => "Bun",
        _ => "npm",
    }
}

/// `renderStep(step, {stem, pm})`: the command and an optional note.
pub fn render_step(step: &Step, stem: &str, pm: &str) -> (String, Option<String>) {
    match step {
        Step::Command(args) => (std::iter::once(stem.to_string()).chain(args.iter().cloned()).collect::<Vec<_>>().join(" "), None),
        Step::PmOnly { manager, reason, args } => (
            std::iter::once(binary(manager).to_string()).chain(args.iter().cloned()).collect::<Vec<_>>().join(" "),
            Some(format!("only with {}: {reason}", manager_name(manager))),
        ),
        Step::Pm { verb, args, flags } => (render_pm_step(verb, args, flags, pm), None),
    }
}

const SHELL_LANGS: &[&str] = &["", "bash", "sh", "shell", "zsh", "console"];

fn render_part(part: &str, stem: &str, pm: &str, notes: &mut Vec<String>, wrap: bool) -> String {
    let re = token_re();
    let mut out = String::new();
    let mut last = 0;
    for m in re.find_iter(part) {
        out.push_str(&part[last..m.start()]);
        last = m.end();
        let whole = &part[m.range()];
        let escaped = m.group(1).map(|g| &part[g]).unwrap_or("");
        let name = m.group(2).map(|g| &part[g]).unwrap_or("");
        let body = m.group(3).map(|g| &part[g]).unwrap_or("");
        if !escaped.is_empty() {
            out.push_str(&whole.replacen("{@@", "{@", 1));
            continue;
        }
        if !["command", "pm", "pm-only"].contains(&name) {
            out.push_str(whole);
            continue;
        }
        let Ok(step) = parse_command_token(name, body) else {
            out.push_str(whole);
            continue;
        };
        let (command, note) = render_step(&step, stem, pm);
        match note {
            Some(n) if wrap => out.push_str(&format!("`{command}` ({n})")),
            Some(n) => {
                notes.push(n);
                out.push_str(&command);
            }
            None if wrap => out.push_str(&format!("`{command}`")),
            None => out.push_str(&command),
        }
    }
    out.push_str(&part[last..]);
    out
}

/// `/^\s*(`{3,}|~{3,})\s*([\w-]*)/`.
fn fence_marker(line: &str) -> Option<(String, String)> {
    let ws = crate::cli::format::js_ws;
    let t = line.trim_start_matches(ws);
    let c = t.chars().next()?;
    if c != '`' && c != '~' {
        return None;
    }
    let n = t.chars().take_while(|&x| x == c).count();
    if n < 3 {
        return None;
    }
    let rest = t[n..].trim_start_matches(ws);
    let lang: String = rest.chars().take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '-').collect();
    Some((t[..n].to_string(), lang))
}

/// Split on `(`[^`\n]*`)` keeping the spans, as JS `split` with a capture.
fn split_spans(line: &str, newline_ok: bool) -> Vec<String> {
    let mut parts = Vec::new();
    let mut cur = String::new();
    let mut chars = line.char_indices().peekable();
    let bytes = line;
    while let Some((i, c)) = chars.next() {
        if c == '`' {
            // Find the closing tick.
            let rest = &bytes[i + 1..];
            let close = rest.find(|ch: char| ch == '`' || (!newline_ok && ch == '\n'));
            if let Some(j) = close {
                if &rest[j..j + 1] == "`" {
                    parts.push(std::mem::take(&mut cur));
                    parts.push(bytes[i..i + 1 + j + 1].to_string());
                    // Skip the span's characters.
                    let end = i + 1 + j + 1;
                    while let Some(&(k, _)) = chars.peek() {
                        if k < end {
                            chars.next();
                        } else {
                            break;
                        }
                    }
                    continue;
                }
            }
        }
        cur.push(c);
    }
    parts.push(cur);
    parts
}

/// `renderCommandTokens(text, {stem, pm}, lang)`.
pub fn render_command_tokens(text: &str, stem: &str, pm: &str, lang: Option<&str>) -> String {
    if !text.contains("{@") {
        return text.to_string();
    }
    if let Some(lang) = lang {
        let shell = SHELL_LANGS.contains(&lang.to_lowercase().as_str());
        return text
            .split('\n')
            .map(|line| {
                let mut notes = Vec::new();
                let out = render_part(line, stem, pm, &mut notes, false);
                if notes.is_empty() {
                    out
                } else if shell {
                    format!("{out}  # {}", notes.join("; "))
                } else {
                    format!("{out} ({})", notes.join("; "))
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
    }
    let prose = |line: &str| -> String {
        split_spans(line, false)
            .iter()
            .map(|part| {
                let mut notes = Vec::new();
                let is_span = part.chars().count() > 1 && part.starts_with('`') && part.ends_with('`');
                let out = render_part(part, stem, pm, &mut notes, !is_span);
                if notes.is_empty() {
                    out
                } else {
                    format!("{out} ({})", notes.join("; "))
                }
            })
            .collect::<String>()
    };
    let mut fence: Option<(String, String)> = None;
    text.split('\n')
        .map(|line| {
            if let Some((marker, l)) = fence_marker(line) {
                match &fence {
                    None => fence = Some((marker, l.to_lowercase())),
                    Some((m, _)) if marker.starts_with(m.as_str()) => fence = None,
                    _ => {}
                }
                return line.to_string();
            }
            match &fence {
                None => prose(line),
                Some((_, l)) => render_command_tokens(line, stem, pm, Some(l)),
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn renders() {
        assert_eq!(render_command_tokens("Run {@pm install -D? x}", "astryx", "pnpm", None), "Run {@pm install -D? x}");
        assert_eq!(render_command_tokens("Run {@pm install --dev @acme/w}.", "astryx", "pnpm", None), "Run `pnpm add -D @acme/w`.");
        assert_eq!(render_command_tokens("{@pm exec astryx docs}", "astryx", "npm", Some("bash")), "npx astryx docs");
        assert_eq!(render_command_tokens("`{@command docs}` and {@command docs x}", "astryx", "npm", None), "`astryx docs` and `astryx docs x`");
        assert_eq!(render_command_tokens("{@pm-only npm \"why\" pkg set a=b}", "astryx", "pnpm", Some("sh")), "npm pkg set a=b  # only with npm: why");
    }
}
