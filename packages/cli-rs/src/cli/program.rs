//! The program tree the JS CLI assembles (generated into `program.json` by
//! `scripts/gen-program.mjs`) and Commander 12's help layout for it.

use crate::json::Value;
use serde::Deserialize;
use std::path::Path;
use std::sync::OnceLock;

/// The invocation placeholder `program.json` uses for the run prefix.
pub const STEM: char = '\u{1}';

/// Text that may differ by the doc package manager.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Text {
    Plain(String),
    ByPm {
        #[serde(rename = "byPm")]
        by_pm: std::collections::BTreeMap<String, String>,
    },
}

impl Text {
    pub fn get(&self, pm: &str) -> &str {
        match self {
            Text::Plain(s) => s,
            Text::ByPm { by_pm } => by_pm.get(pm).or_else(|| by_pm.get("npm")).map(|s| s.as_str()).unwrap_or(""),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArgSpec {
    pub name: String,
    pub required: bool,
    pub variadic: bool,
    pub description: Text,
    #[serde(default)]
    pub default_value: Option<Value>,
    pub choices: Option<Vec<String>>,
}

impl ArgSpec {
    /// `humanReadableArgName`.
    pub fn human(&self) -> String {
        let inner = if self.variadic { format!("{}...", self.name) } else { self.name.clone() };
        if self.required {
            format!("<{inner}>")
        } else {
            format!("[{inner}]")
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptSpec {
    pub flags: String,
    pub long: Option<String>,
    pub short: Option<String>,
    pub attribute_name: String,
    pub description: Text,
    pub required: bool,
    pub optional: bool,
    pub variadic: bool,
    pub negate: bool,
    pub mandatory: bool,
    pub hidden: bool,
    #[serde(default)]
    pub default_value: Option<Value>,
    pub default_value_description: Option<String>,
    pub choices: Option<Vec<String>>,
    pub collect: bool,
}

impl OptSpec {
    pub fn is(&self, arg: &str) -> bool {
        self.short.as_deref() == Some(arg) || self.long.as_deref() == Some(arg)
    }
    pub fn is_boolean(&self) -> bool {
        !self.required && !self.optional && !self.negate
    }
    /// `option.name()`: the long flag without dashes, else the short one.
    pub fn name(&self) -> String {
        match (&self.long, &self.short) {
            (Some(l), _) => l.trim_start_matches("--").to_string(),
            (None, Some(s)) => s.trim_start_matches('-').to_string(),
            _ => String::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExitCodeDoc {
    pub code: Value,
    pub when: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelpCommandSpec {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub name: String,
    pub full_name: String,
    pub aliases: Vec<String>,
    pub description: Text,
    pub summary: String,
    pub hidden: bool,
    pub usage: Option<String>,
    pub has_action: bool,
    pub allow_unknown_option: bool,
    pub allow_excess_arguments: bool,
    pub args: Vec<ArgSpec>,
    pub options: Vec<OptSpec>,
    pub before_help: Text,
    pub after_help: Text,
    pub json: bool,
    pub response_types: Vec<String>,
    pub examples: Vec<String>,
    pub exit_codes: Vec<ExitCodeDoc>,
    pub outside_project: Option<Value>,
    pub commands: Vec<Node>,
    #[serde(default)]
    pub help_command: Option<HelpCommandSpec>,
    #[serde(default)]
    pub version: Option<String>,
}

impl Node {
    pub fn find_command(&self, name: &str) -> Option<&Node> {
        if name.is_empty() {
            return None;
        }
        self.commands.iter().find(|c| c.name == name || c.aliases.iter().any(|a| a == name))
    }
    pub fn find_option(&self, arg: &str) -> Option<&OptSpec> {
        self.options.iter().find(|o| o.is(arg))
    }
    /// The node at a full command name (`"theme build"`); `""` is the root.
    pub fn at(&self, full_name: &str) -> Option<&Node> {
        let mut node = self;
        for part in full_name.split(' ').filter(|p| !p.is_empty()) {
            node = node.commands.iter().find(|c| c.name == part)?;
        }
        Some(node)
    }
    /// `cmd.usage()`.
    pub fn usage_str(&self) -> String {
        if let Some(u) = &self.usage {
            return u.clone();
        }
        let mut parts: Vec<String> = Vec::new();
        // Every command has the help option, so `[options]` always shows.
        parts.push("[options]".into());
        if !self.commands.is_empty() {
            parts.push("[command]".into());
        }
        for a in &self.args {
            parts.push(a.human());
        }
        parts.join(" ")
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgramFile {
    pub version: String,
    pub json_supported: Vec<String>,
    pub command_names: Vec<String>,
    pub program: Node,
}

static PROGRAM: OnceLock<ProgramFile> = OnceLock::new();

/// The embedded program tree.
pub fn program_file() -> &'static ProgramFile {
    PROGRAM.get_or_init(|| serde_json::from_str(include_str!("program.json")).expect("program.json parses"))
}

pub fn root() -> &'static Node {
    &program_file().program
}

/// The doc package manager for help text that differs by it.
pub fn doc_pm(cwd: &Path) -> String {
    crate::cli::release::doc_package_manager(cwd)
}

/// Fill in the run prefix.
pub fn fill_stem(s: &str, cwd: &Path) -> String {
    if !s.contains(STEM) {
        return s.to_string();
    }
    s.replace(STEM, &crate::cli::env::cli_invocation(cwd))
}

/// The ancestors' names then this command's, as `commandUsage` lists them.
fn path_names(full_name: &str) -> Vec<String> {
    let mut v = vec!["astryx".to_string()];
    v.extend(full_name.split(' ').filter(|p| !p.is_empty()).map(String::from));
    v
}

struct Item {
    term: String,
    desc: String,
}

fn option_description(o: &OptSpec, pm: &str) -> String {
    let mut extra: Vec<String> = Vec::new();
    if let Some(ch) = &o.choices {
        extra.push(format!("choices: {}", ch.iter().map(|c| crate::json::stringify(&Value::String(c.clone()), 0)).collect::<Vec<_>>().join(", ")));
    }
    if let Some(d) = &o.default_value {
        let show = o.required || o.optional || (o.is_boolean() && d.is_boolean());
        if show {
            let s = match &o.default_value_description {
                Some(desc) if !desc.is_empty() => desc.clone(),
                _ => crate::json::stringify(d, 0),
            };
            extra.push(format!("default: {s}"));
        }
    }
    let desc = o.description.get(pm);
    if extra.is_empty() {
        desc.to_string()
    } else {
        format!("{desc} ({})", extra.join(", "))
    }
}

fn argument_description(a: &ArgSpec, pm: &str) -> String {
    let mut extra: Vec<String> = Vec::new();
    if let Some(ch) = &a.choices {
        extra.push(format!("choices: {}", ch.iter().map(|c| crate::json::stringify(&Value::String(c.clone()), 0)).collect::<Vec<_>>().join(", ")));
    }
    if let Some(d) = &a.default_value {
        extra.push(format!("default: {}", crate::json::stringify(d, 0)));
    }
    let desc = a.description.get(pm).to_string();
    if extra.is_empty() {
        return desc;
    }
    let e = format!("({})", extra.join(", "));
    if desc.is_empty() {
        e
    } else {
        format!("{desc} {e}")
    }
}

fn subcommand_term(c: &Node) -> String {
    let args = c.args.iter().map(|a| a.human()).collect::<Vec<_>>().join(" ");
    let mut s = c.name.clone();
    if let Some(a) = c.aliases.first() {
        s.push('|');
        s.push_str(a);
    }
    if !c.options.is_empty() {
        s.push_str(" [options]");
    }
    if !args.is_empty() {
        s.push(' ');
        s.push_str(&args);
    }
    s
}

/// `helpInformation()`: the Commander-formatted help (no before/after text).
pub fn help_information(node: &Node, cwd: &Path) -> String {
    let pm = doc_pm(cwd);
    let pm = pm.as_str();
    let len = crate::cli::format::js_len;
    // Arguments show only when one has a description.
    let args: Vec<Item> = if node.args.iter().any(|a| !a.description.get(pm).is_empty()) {
        node.args.iter().map(|a| Item { term: a.name.clone(), desc: argument_description(a, pm) }).collect()
    } else {
        Vec::new()
    };
    let mut opts: Vec<Item> = node.options.iter().filter(|o| !o.hidden).map(|o| Item { term: o.flags.clone(), desc: option_description(o, pm) }).collect();
    // The help option, minus any flag a command option already takes.
    let remove_short = node.find_option("-h").is_some();
    let remove_long = node.find_option("--help").is_some();
    let help_desc = "display help for command".to_string();
    if !remove_short && !remove_long {
        opts.push(Item { term: "-h, --help".into(), desc: help_desc });
    } else if !remove_long {
        opts.push(Item { term: "--help".into(), desc: help_desc });
    } else if !remove_short {
        opts.push(Item { term: "-h".into(), desc: help_desc });
    }
    let mut cmds: Vec<Item> = node
        .commands
        .iter()
        .filter(|c| !c.hidden)
        .map(|c| Item { term: subcommand_term(c), desc: if c.summary.is_empty() { c.description.get(pm).to_string() } else { c.summary.clone() } })
        .collect();
    if let Some(h) = &node.help_command {
        cmds.push(Item { term: h.name.clone(), desc: h.description.clone().unwrap_or_else(|| "display help for command".into()) });
    }
    let term_width = args.iter().chain(opts.iter()).chain(cmds.iter()).map(|i| len(&i.term)).max().unwrap_or(0);
    let format_item = |i: &Item| -> String {
        if i.desc.is_empty() {
            i.term.clone()
        } else {
            format!("{}{}", crate::cli::format::pad_end(&i.term, term_width + 2), i.desc)
        }
    };
    let format_list = |items: &[Item]| -> String {
        let joined = items.iter().map(format_item).collect::<Vec<_>>().join("\n");
        joined.split('\n').map(|l| format!("  {l}")).collect::<Vec<_>>().join("\n")
    };
    let mut usage_name = node.name.clone();
    if node.full_name.is_empty() {
        usage_name = "astryx".into();
    }
    if let Some(a) = node.aliases.first() {
        usage_name = format!("{usage_name}|{a}");
    }
    let mut names = path_names(&node.full_name);
    names.pop();
    let ancestors: String = names.iter().map(|n| format!("{n} ")).collect();
    let mut out: Vec<String> = vec![format!("Usage: {ancestors}{usage_name} {}", node.usage_str()), String::new()];
    let desc = node.description.get(pm);
    if !desc.is_empty() {
        out.push(desc.to_string());
        out.push(String::new());
    }
    if !args.is_empty() {
        out.push("Arguments:".into());
        out.push(format_list(&args));
        out.push(String::new());
    }
    if !opts.is_empty() {
        out.push("Options:".into());
        out.push(format_list(&opts));
        out.push(String::new());
    }
    if !cmds.is_empty() {
        out.push("Commands:".into());
        out.push(format_list(&cmds));
        out.push(String::new());
    }
    out.join("\n")
}

/// Everything `outputHelp()` writes: before text, help, after text.
pub fn full_help(node: &Node, cwd: &Path) -> String {
    let pm = doc_pm(cwd);
    let mut s = String::new();
    s.push_str(&fill_stem(node.before_help.get(&pm), cwd));
    s.push_str(&help_information(node, cwd));
    s.push_str(&fill_stem(node.after_help.get(&pm), cwd));
    s
}

/// The full command name with `astryx` in front (`astryx theme build`).
pub fn qualified(full_name: &str) -> String {
    path_names(full_name).join(" ")
}

#[cfg(test)]
mod tests {
    /// `program.json` matches what the JS CLI assembles. Needs node and an
    /// installed JS CLI (`ASTRYX_JS_CLI`, or `packages/cli` with its
    /// dependencies); skipped without them.
    #[test]
    fn program_json_is_fresh() {
        let crate_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let js_cli = std::env::var("ASTRYX_JS_CLI").map(std::path::PathBuf::from).unwrap_or_else(|_| crate_dir.join("..").join("cli"));
        if !js_cli.join("node_modules").exists() {
            eprintln!("skipped: no installed JS CLI");
            return;
        }
        let status = std::process::Command::new("node").arg(crate_dir.join("scripts").join("gen-program.mjs")).arg("--check").env("ASTRYX_JS_CLI", &js_cli).status();
        match status {
            Ok(s) => assert!(s.success(), "program.json is stale: run node scripts/gen-program.mjs"),
            Err(_) => eprintln!("skipped: no node"),
        }
    }

    #[test]
    fn program_json_parses() {
        assert_eq!(super::root().name, "astryx");
        assert!(super::root().at("theme build").is_some());
    }
}
