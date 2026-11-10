//! Commander 12's parse, as the JS CLI configures it: `parseOptions`,
//! `_parseCommand`, dispatch, help and the parse errors, plus the hooks and
//! error shim `clients/cli/index.mjs` and `lib/json-shim.mjs` add.

use crate::cli::command::{Arg, CmdResult, ErrorOpts, Exit, Globals, Invocation, OptSource, OptValue, Out, Suggestion};
use crate::cli::program::{self, Node, OptSpec};
use crate::json::{Map, Value};
use indexmap::IndexMap;
use std::path::PathBuf;

/// One run's parse state.
pub struct Run {
    pub argv: Vec<String>,
    pub cwd: PathBuf,
    pub out: Out,
    /// Option values per command node (by full name), as `_optionValues`.
    pub values: IndexMap<String, IndexMap<String, OptValue>>,
    pub sources: IndexMap<String, IndexMap<String, OptSource>>,
}

/// A Commander error on its way to `handleCommanderError`.
struct CommanderError {
    code: &'static str,
    message: String,
    exit_code: i32,
}

type PResult<T> = Result<T, Stop>;

/// Why the parse stopped early.
enum Stop {
    /// `process.exit(code)` with output already written.
    Exit(i32),
    Commander(CommanderError),
}

impl From<Exit> for Stop {
    fn from(e: Exit) -> Self {
        Stop::Exit(e.0)
    }
}

fn maybe_option(arg: &str) -> bool {
    arg.len() > 1 && arg.starts_with('-')
}

fn default_value(o: &OptSpec) -> Option<OptValue> {
    o.default_value.as_ref().map(json_to_opt)
}

fn json_to_opt(v: &Value) -> OptValue {
    match v {
        Value::Bool(b) => OptValue::Bool(*b),
        Value::String(s) => OptValue::Str(s.clone()),
        Value::Array(a) => OptValue::List(a.iter().map(crate::cli::format::js_string).collect()),
        other => OptValue::Str(crate::cli::format::js_string(other)),
    }
}

impl Run {
    pub fn new(argv: Vec<String>, cwd: PathBuf) -> Run {
        let out = Out::new(false, cwd.clone());
        Run { argv, cwd, out, values: IndexMap::new(), sources: IndexMap::new() }
    }

    fn argv_has_json(&self) -> bool {
        self.argv.iter().any(|a| a == "--json")
    }

    /// `jsonActive()` in the shim.
    fn json_active(&self) -> bool {
        self.out.json_mode || self.argv_has_json()
    }

    fn root_json(&self) -> bool {
        matches!(self.values.get("").and_then(|m| m.get("json")), Some(OptValue::Bool(true)))
    }

    fn init_defaults(&mut self, node: &Node) {
        let mut vals = IndexMap::new();
        let mut srcs = IndexMap::new();
        for o in &node.options {
            let key = o.attribute_name.clone();
            if o.negate {
                let positive = o.long.as_deref().unwrap_or("").replacen("--no-", "--", 1);
                if node.find_option(&positive).is_none() {
                    vals.insert(key.clone(), default_value(o).unwrap_or(OptValue::Bool(true)));
                    srcs.insert(key, OptSource::Default);
                }
            } else if let Some(d) = default_value(o) {
                vals.insert(key.clone(), d);
                srcs.insert(key, OptSource::Default);
            }
        }
        self.values.insert(node.full_name.clone(), vals);
        self.sources.insert(node.full_name.clone(), srcs);
    }

    fn error(&mut self, code: &'static str, message: String) -> Stop {
        Stop::Commander(CommanderError { code, message, exit_code: 1 })
    }

    /// The `option:<name>` event: assign a value (val None = no value given).
    fn handle_option(&mut self, node: &Node, o: &OptSpec, val: Option<String>) -> PResult<()> {
        if node.full_name.is_empty() && o.long.as_deref() == Some("--version") && node.version.is_some() {
            // The version option prints and exits while parsing.
            let v = node.version.clone().unwrap_or_default();
            self.out.write(&format!("{v}\n"));
            return Err(Stop::Commander(CommanderError { code: "commander.version", message: v, exit_code: 0 }));
        }
        let key = o.attribute_name.clone();
        let old = self.values.get(&node.full_name).and_then(|m| m.get(&key)).cloned();
        let new = match val {
            Some(v) => {
                if let Some(choices) = &o.choices {
                    if !choices.contains(&v) {
                        let msg = format!("error: option '{}' argument '{}' is invalid. Allowed choices are {}.", o.flags, v, choices.join(", "));
                        return Err(Stop::Commander(CommanderError { code: "commander.invalidArgument", message: msg, exit_code: 1 }));
                    }
                    OptValue::Str(v)
                } else if o.collect {
                    let mut prev = match old {
                        Some(OptValue::List(l)) => l,
                        _ => Vec::new(),
                    };
                    prev.push(v);
                    OptValue::List(prev)
                } else if o.variadic {
                    let is_default = old.is_some() && old == default_value(o);
                    match old {
                        Some(OptValue::List(mut l)) if !is_default => {
                            l.push(v);
                            OptValue::List(l)
                        }
                        _ => OptValue::List(vec![v]),
                    }
                } else {
                    OptValue::Str(v)
                }
            }
            None => {
                if o.negate {
                    OptValue::Bool(false)
                } else if o.is_boolean() || o.optional {
                    OptValue::Bool(true)
                } else {
                    OptValue::Str(String::new())
                }
            }
        };
        self.values.entry(node.full_name.clone()).or_default().insert(key.clone(), new);
        self.sources.entry(node.full_name.clone()).or_default().insert(key, OptSource::Cli);
        Ok(())
    }

    /// `parseOptions(argv)`.
    fn parse_options(&mut self, node: &Node, argv: Vec<String>) -> PResult<(Vec<String>, Vec<String>)> {
        let mut operands: Vec<String> = Vec::new();
        let mut unknown: Vec<String> = Vec::new();
        let mut to_unknown = false;
        let mut args: std::collections::VecDeque<String> = argv.into();
        let mut active_variadic: Option<&OptSpec> = None;
        while let Some(arg) = args.pop_front() {
            if arg == "--" {
                if to_unknown {
                    unknown.push(arg);
                    unknown.extend(args.drain(..));
                } else {
                    operands.extend(args.drain(..));
                }
                break;
            }
            if let Some(o) = active_variadic {
                if !maybe_option(&arg) {
                    self.handle_option(node, o, Some(arg))?;
                    continue;
                }
            }
            active_variadic = None;
            if maybe_option(&arg) {
                if let Some(o) = node.find_option(&arg) {
                    if o.required {
                        match args.pop_front() {
                            None => {
                                return Err(self.error("commander.optionMissingArgument", format!("error: option '{}' argument missing", o.flags)));
                            }
                            Some(v) => self.handle_option(node, o, Some(v))?,
                        }
                    } else if o.optional {
                        let v = if args.front().map(|a| !maybe_option(a)).unwrap_or(false) { args.pop_front() } else { None };
                        self.handle_option(node, o, v)?;
                    } else {
                        self.handle_option(node, o, None)?;
                    }
                    active_variadic = if o.variadic { Some(o) } else { None };
                    continue;
                }
            }
            let chars: Vec<char> = arg.chars().collect();
            if chars.len() > 2 && chars[0] == '-' && chars[1] != '-' {
                if let Some(o) = node.find_option(&format!("-{}", chars[1])) {
                    let rest: String = chars[2..].iter().collect();
                    if o.required || o.optional {
                        // combineFlagAndOptionalValue defaults to true.
                        self.handle_option(node, o, Some(rest))?;
                    } else {
                        self.handle_option(node, o, None)?;
                        args.push_front(format!("-{rest}"));
                    }
                    continue;
                }
            }
            if arg.starts_with("--") {
                if let Some(idx) = arg.find('=') {
                    if idx > 2 {
                        if let Some(o) = node.find_option(&arg[..idx]) {
                            if o.required || o.optional {
                                self.handle_option(node, o, Some(arg[idx + 1..].to_string()))?;
                                continue;
                            }
                        }
                    }
                }
            }
            if maybe_option(&arg) {
                to_unknown = true;
            }
            if to_unknown {
                unknown.push(arg);
            } else {
                operands.push(arg);
            }
        }
        Ok((operands, unknown))
    }

    /// `_parseCommand(operands, unknown)`.
    fn parse_command(&mut self, node: &'static Node, operands: Vec<String>, unknown: Vec<String>) -> PResult<()> {
        self.init_defaults_if_needed(node);
        let (ops2, unk) = self.parse_options(node, unknown)?;
        let mut operands = operands;
        operands.extend(ops2);
        let unknown = unk;
        let mut all_args = operands.clone();
        all_args.extend(unknown.iter().cloned());

        if let Some(first) = operands.first() {
            if let Some(sub) = node.find_command(first) {
                let rest = operands[1..].to_vec();
                return self.parse_command(sub, rest, unknown);
            }
        }
        if let Some(h) = &node.help_command {
            if operands.first().map(|s| s == &h.name).unwrap_or(false) {
                return self.dispatch_help_command(node, operands.get(1).cloned(), all_args);
            }
        }
        if !node.commands.is_empty() && all_args.is_empty() && !node.has_action {
            return self.help(node, true, &all_args);
        }
        self.output_help_if_requested(node, &unknown)?;
        // Mandatory options: none in this CLI's tree.
        let check_unknown = |run: &mut Run| -> PResult<()> {
            if let Some(flag) = unknown.first() {
                if !node.allow_unknown_option {
                    return Err(run.unknown_option(node, flag));
                }
            }
            Ok(())
        };
        if node.has_action {
            check_unknown(self)?;
            let processed = self.process_arguments(node, &all_args)?;
            return self.run_action(node, processed, all_args);
        }
        if !operands.is_empty() {
            if !node.commands.is_empty() {
                return Err(self.unknown_command(node, &all_args));
            }
            check_unknown(self)?;
            self.process_arguments(node, &all_args)?;
        } else if !node.commands.is_empty() {
            check_unknown(self)?;
            return self.help(node, true, &all_args);
        } else {
            check_unknown(self)?;
            self.process_arguments(node, &all_args)?;
        }
        Ok(())
    }

    fn init_defaults_if_needed(&mut self, node: &Node) {
        if !self.values.contains_key(&node.full_name) {
            self.init_defaults(node);
        }
    }

    fn dispatch_help_command(&mut self, node: &'static Node, name: Option<String>, all_args: Vec<String>) -> PResult<()> {
        let Some(name) = name else {
            return self.help(node, false, &all_args);
        };
        if let Some(sub) = node.find_command(&name) {
            return self.help(sub, false, &[]);
        }
        // `_dispatchSubcommand(name, [], ['--help'])` with no such command.
        self.help(node, true, &all_args)
    }

    fn output_help_if_requested(&mut self, node: &Node, unknown: &[String]) -> PResult<()> {
        if unknown.iter().any(|a| a == "-h" || a == "--help") {
            self.output_help(node, false, &[]);
            return Err(Stop::Commander(CommanderError { code: "commander.helpDisplayed", message: "(outputHelp)".into(), exit_code: 0 }));
        }
        Ok(())
    }

    /// `outputHelp(context)` with the shim's JSON patch.
    pub fn output_help(&mut self, node: &Node, error: bool, cmd_args: &[String]) {
        if self.json_active() {
            if !self.out.json_handled {
                self.out.json_handled = true;
                let env = if error { help_error_envelope(node, cmd_args) } else { self.help_envelope(node) };
                self.out.print_json(&env);
            }
            return;
        }
        let text = program::full_help(node, &self.cwd);
        if error {
            self.out.ewrite(&text);
        } else {
            self.out.write(&text);
        }
    }

    /// `help(context)`: output help and exit.
    fn help(&mut self, node: &Node, error: bool, cmd_args: &[String]) -> PResult<()> {
        self.output_help(node, error, cmd_args);
        let mut code = self.out.exit_code;
        if code == 0 && error {
            code = 1;
        }
        Err(Stop::Commander(CommanderError { code: "commander.help", message: "(outputHelp)".into(), exit_code: code }))
    }

    fn help_envelope(&mut self, node: &Node) -> Value {
        let pm = program::doc_pm(&self.cwd);
        let q = program::qualified(&node.full_name);
        let mut data = Map::new();
        data.insert("command".into(), Value::String(q.clone()));
        data.insert("description".into(), Value::String(node.description.get(&pm).to_string()));
        data.insert("usage".into(), Value::String(format!("{q} {}", node.usage_str()).trim().to_string()));
        let opts: Vec<Value> = node
            .options
            .iter()
            .map(|o| {
                let mut m = Map::new();
                m.insert("flags".into(), Value::String(o.flags.clone()));
                m.insert("description".into(), Value::String(o.description.get(&pm).to_string()));
                if let Some(d) = &o.default_value {
                    m.insert("defaultValue".into(), d.clone());
                }
                if let Some(c) = &o.choices {
                    if !c.is_empty() {
                        m.insert("choices".into(), Value::Array(c.iter().cloned().map(Value::String).collect()));
                    }
                }
                Value::Object(m)
            })
            .collect();
        data.insert("options".into(), Value::Array(opts));
        let subs: Vec<Value> = node
            .commands
            .iter()
            .filter(|c| !c.hidden)
            .map(|c| {
                let mut m = Map::new();
                m.insert("name".into(), Value::String(c.name.clone()));
                m.insert("description".into(), Value::String(c.description.get(&pm).to_string()));
                Value::Object(m)
            })
            .collect();
        data.insert("subcommands".into(), Value::Array(subs));
        let mut env = Map::new();
        env.insert("apiVersion".into(), Value::from(1));
        env.insert("type".into(), Value::String("help".into()));
        env.insert("data".into(), Value::Object(data));
        let mut meta = Map::new();
        meta.insert("answeredBy".into(), crate::cli::env::answered_by(&self.cwd));
        env.insert("meta".into(), Value::Object(meta));
        Value::Object(env)
    }

    fn unknown_option(&mut self, node: &Node, flag: &str) -> Stop {
        let mut suggestion = String::new();
        if flag.starts_with("--") {
            let mut candidates: Vec<String> = Vec::new();
            let mut cur = Some(node.full_name.clone());
            while let Some(name) = cur {
                let n = program::root().at(&name).expect("node");
                candidates.extend(n.options.iter().filter(|o| !o.hidden).filter_map(|o| o.long.clone()));
                if n.find_option("--help").is_none() {
                    candidates.push("--help".into());
                }
                cur = if name.is_empty() { None } else { Some(name.rsplit_once(' ').map(|(a, _)| a.to_string()).unwrap_or_default()) };
            }
            suggestion = suggest_similar(flag, &candidates);
        }
        self.error("commander.unknownOption", format!("error: unknown option '{flag}'{suggestion}"))
    }

    fn unknown_command(&mut self, node: &Node, all_args: &[String]) -> Stop {
        let name = all_args.first().cloned().unwrap_or_default();
        let mut candidates: Vec<String> = Vec::new();
        for c in node.commands.iter().filter(|c| !c.hidden) {
            candidates.push(c.name.clone());
            if let Some(a) = c.aliases.first() {
                candidates.push(a.clone());
            }
        }
        if let Some(h) = &node.help_command {
            candidates.push(h.name.clone());
        }
        let suggestion = suggest_similar(&name, &candidates);
        self.error("commander.unknownCommand", format!("error: unknown command '{name}'{suggestion}"))
    }

    /// `_processArguments()` (with `_checkNumberOfArguments`).
    fn process_arguments(&mut self, node: &Node, args: &[String]) -> PResult<Vec<Arg>> {
        for (i, a) in node.args.iter().enumerate() {
            if a.required && args.get(i).is_none() {
                return Err(self.error("commander.missingArgument", format!("error: missing required argument '{}'", a.name)));
            }
        }
        let last_variadic = node.args.last().map(|a| a.variadic).unwrap_or(false);
        if !last_variadic && args.len() > node.args.len() && !node.allow_excess_arguments {
            let expected = node.args.len();
            let s = if expected == 1 { "" } else { "s" };
            let for_sub = if node.full_name.is_empty() { String::new() } else { format!(" for '{}'", node.name) };
            return Err(self.error("commander.excessArguments", format!("error: too many arguments{for_sub}. Expected {expected} argument{s} but got {}.", args.len())));
        }
        let mut out = Vec::new();
        for (i, a) in node.args.iter().enumerate() {
            if a.variadic {
                if i < args.len() {
                    out.push(Arg::Many(args[i..].to_vec()));
                } else {
                    match &a.default_value {
                        Some(Value::Array(v)) => out.push(Arg::Many(v.iter().map(crate::cli::format::js_string).collect())),
                        Some(Value::String(s)) => out.push(Arg::One(s.clone())),
                        _ => out.push(Arg::Many(Vec::new())),
                    }
                }
            } else if i < args.len() {
                out.push(Arg::One(args[i].clone()));
            } else {
                match &a.default_value {
                    Some(Value::String(s)) => out.push(Arg::One(s.clone())),
                    _ => out.push(Arg::Missing),
                }
            }
        }
        Ok(out)
    }

    fn globals(&self) -> Globals {
        let root = self.values.get("").cloned().unwrap_or_default();
        let b = |k: &str| matches!(root.get(k), Some(OptValue::Bool(true)));
        Globals {
            json: b("json"),
            dense: b("dense"),
            zh: b("zh"),
            lang: match root.get("lang") {
                Some(OptValue::Str(s)) => Some(s.clone()),
                _ => None,
            },
            detail: match root.get("detail") {
                Some(OptValue::Str(s)) => s.clone(),
                _ => "full".into(),
            },
        }
    }

    /// The preAction hooks, the action, the postAction hooks.
    fn run_action(&mut self, node: &'static Node, processed: Vec<Arg>, all_args: Vec<String>) -> PResult<()> {
        let json = self.root_json();
        // preAction: the --json gate.
        if json {
            self.out.json_mode = true;
            if !node.full_name.is_empty() && !node.json {
                self.out.json_handled = true;
                if !node.commands.is_empty() {
                    if let Some(word) = all_args.iter().find(|a| !a.starts_with('-')) {
                        let sugg = node.commands.iter().map(|c| Suggestion::new(c.name.clone(), "available subcommand")).collect();
                        self.out.cli_error(&format!("unknown subcommand '{} {}'", node.full_name, word), ErrorOpts::code("ERR_UNKNOWN_SUBCOMMAND").suggestions(sugg))?;
                    }
                }
                let mut env = Map::new();
                env.insert("apiVersion".into(), Value::from(1));
                env.insert("error".into(), Value::String(format!("JSON output is not supported for the '{}' command", node.full_name)));
                env.insert("code".into(), Value::String("ERR_INVALID_OPTION".into()));
                self.out.print_json(&Value::Object(env));
                return Err(Stop::Exit(1));
            }
        }
        // preAction: decide the setup reminder.
        let reminder = crate::cli::nudge::decide(&self.cwd, &node.name, json);
        let inv = Invocation {
            name: node.full_name.clone(),
            args: processed,
            extra_args: all_args.iter().skip(node.args.len()).cloned().collect(),
            opts: self.values.get(&node.full_name).cloned().unwrap_or_default(),
            opt_sources: self.sources.get(&node.full_name).cloned().unwrap_or_default(),
            parent_opts: ancestors(&node.full_name).into_iter().map(|a| (a.clone(), self.values.get(&a).cloned().unwrap_or_default())).collect(),
            parent_sources: ancestors(&node.full_name).into_iter().map(|a| (a.clone(), self.sources.get(&a).cloned().unwrap_or_default())).collect(),
            all_args: all_args.clone(),
            globals: self.globals(),
            cwd: self.cwd.clone(),
            cli_root: crate::cli::env::cli_root(),
            argv: self.argv.clone(),
        };
        let res: CmdResult = if let Some(h) = crate::commands::handler(&node.full_name) {
            h(&inv, &mut self.out)
        } else if let Some(h) = crate::cli::builtin::handler(&node.full_name) {
            h(&inv, &mut self.out)
        } else {
            self.out.eprintln(&format!("astryx-rs: not cloned yet: {}", node.full_name));
            Err(Exit(crate::cli::NOT_CLONED))
        };
        res?;
        // postAction: an envelope must have been printed.
        if json && !self.out.json_handled {
            let mut env = Map::new();
            env.insert("apiVersion".into(), Value::from(1));
            env.insert("error".into(), Value::String(format!("Internal: '{}' completed without emitting a JSON envelope", node.full_name)));
            env.insert("code".into(), Value::String("ERR_UNKNOWN".into()));
            self.out.print_json(&Value::Object(env));
            return Err(Stop::Exit(1));
        }
        let code = self.out.exit_code;
        crate::cli::nudge::after_action(reminder, code, &mut self.out);
        Ok(())
    }

    /// `handleCommanderError`.
    fn handle_commander_error(&mut self, e: CommanderError) -> i32 {
        if matches!(e.code, "commander.helpDisplayed" | "commander.help" | "commander.version") {
            return e.exit_code;
        }
        let cleaned = strip_error_prefix(&e.message);
        if self.json_active() {
            if !self.out.json_handled {
                self.out.json_handled = true;
                let code = commander_code_to_error_code(e.code, &cleaned);
                let env = crate::cli::command::error_envelope(&cleaned, &[], code, None);
                self.out.print_json(&env);
            }
        } else {
            self.out.ewrite(&format!("Error: {cleaned}\n"));
        }
        if e.exit_code == 0 {
            1
        } else {
            e.exit_code
        }
    }
}

fn ancestors(full_name: &str) -> Vec<String> {
    let parts: Vec<&str> = full_name.split(' ').filter(|p| !p.is_empty()).collect();
    let mut v = vec![String::new()];
    for i in 1..parts.len() {
        v.push(parts[..i].join(" "));
    }
    if parts.is_empty() {
        v.clear();
    }
    v
}

fn strip_error_prefix(m: &str) -> String {
    let lower = m.to_ascii_lowercase();
    if lower.starts_with("error:") {
        m[6..].trim_start_matches(crate::cli::format::js_ws).to_string()
    } else {
        m.to_string()
    }
}

fn commander_code_to_error_code(code: &str, message: &str) -> &'static str {
    match code {
        "commander.unknownCommand" => "ERR_UNKNOWN_COMMAND",
        "commander.unknownOption" => "ERR_INVALID_OPTION",
        "commander.missingArgument" | "commander.missingMandatoryOptionValue" => "ERR_MISSING_ARGUMENT",
        "commander.excessArguments" => "ERR_INVALID_ARGUMENT",
        "commander.invalidArgument" | "commander.invalidOptionArgument" => {
            if has_word_flag(message, "--lang") {
                "ERR_INVALID_LANG"
            } else if has_word_flag(message, "--detail") {
                "ERR_INVALID_DETAIL"
            } else {
                "ERR_INVALID_ARGUMENT"
            }
        }
        _ => "ERR_UNKNOWN",
    }
}

/// `/--flag\b/.test(message)`.
fn has_word_flag(message: &str, flag: &str) -> bool {
    let mut start = 0;
    while let Some(i) = message[start..].find(flag) {
        let end = start + i + flag.len();
        let next = message[end..].chars().next();
        if !next.map(|c| c.is_ascii_alphanumeric() || c == '_').unwrap_or(false) {
            return true;
        }
        start = end;
    }
    false
}

/// `buildHelpErrorEnvelope(cmd)`.
fn help_error_envelope(node: &Node, cmd_args: &[String]) -> Value {
    let available: Vec<String> = node.commands.iter().filter(|c| !c.hidden && c.name != "help").map(|c| c.name.clone()).collect();
    if node.full_name.is_empty() {
        let requested = cmd_args.get(1);
        let msg = match requested {
            Some(r) => format!("unknown command '{r}'"),
            None => "unknown command".into(),
        };
        let sugg: Vec<Suggestion> = available.iter().map(|n| Suggestion::new(n.clone(), "available command")).collect();
        return crate::cli::command::error_envelope(&msg, &sugg, "ERR_UNKNOWN_COMMAND", None);
    }
    let group = &node.full_name;
    let sugg: Vec<Suggestion> = available.iter().map(|n| Suggestion::new(format!("{group} {n}"), "available subcommand")).collect();
    crate::cli::command::error_envelope(&format!("'{group}' needs a subcommand"), &sugg, "ERR_MISSING_ARGUMENT", None)
}

fn utf16(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

/// Commander's `editDistance` (optimal string alignment), in UTF-16 units.
fn edit_distance(a: &[u16], b: &[u16]) -> usize {
    let max_distance = 3usize;
    if a.len().abs_diff(b.len()) > max_distance {
        return a.len().max(b.len());
    }
    let mut d = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for j in 0..=b.len() {
        d[0][j] = j;
    }
    for j in 1..=b.len() {
        for i in 1..=a.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            d[i][j] = (d[i - 1][j] + 1).min(d[i][j - 1] + 1).min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }
    d[a.len()][b.len()]
}

/// Commander's `suggestSimilar`.
pub fn suggest_similar(word: &str, candidates: &[String]) -> String {
    if candidates.is_empty() {
        return String::new();
    }
    let mut uniq: Vec<String> = Vec::new();
    for c in candidates {
        if !uniq.contains(c) {
            uniq.push(c.clone());
        }
    }
    let searching_options = word.starts_with("--");
    let (word, cands): (String, Vec<String>) = if searching_options {
        (word[2..].to_string(), uniq.iter().map(|c| c.chars().skip(2).collect()).collect())
    } else {
        (word.to_string(), uniq)
    };
    let w = utf16(&word);
    let mut similar: Vec<String> = Vec::new();
    let mut best = 3usize;
    for c in &cands {
        let cu = utf16(c);
        if cu.len() <= 1 {
            continue;
        }
        let distance = edit_distance(&w, &cu);
        let length = w.len().max(cu.len());
        let similarity = (length as f64 - distance as f64) / length as f64;
        if similarity > 0.4 {
            if distance < best {
                best = distance;
                similar = vec![c.clone()];
            } else if distance == best {
                similar.push(c.clone());
            }
        }
    }
    // localeCompare on plain ASCII flag/command names.
    similar.sort_by(|a, b| crate::cli::collate::locale_compare(a, b));
    if searching_options {
        similar = similar.into_iter().map(|c| format!("--{c}")).collect();
    }
    match similar.len() {
        0 => String::new(),
        1 => format!("\n(Did you mean {}?)", similar[0]),
        _ => format!("\n(Did you mean one of {}?)", similar.join(", ")),
    }
}

/// Parse and run once. Returns the output and the exit code.
pub fn run(argv: Vec<String>, cwd: PathBuf) -> (Out, i32) {
    run_live(argv, cwd, false)
}

/// [`run`], writing to the real streams as it goes when `live`.
pub fn run_live(argv: Vec<String>, cwd: PathBuf, live: bool) -> (Out, i32) {
    let mut run = Run::new(argv.clone(), cwd);
    run.out.live = live;
    if let Some(line) = crate::cli::release::start_notice(&run.cwd, &argv) {
        run.out.eprintln(&line);
    }
    // `--version --json` answers before Commander parses.
    if (argv.iter().any(|a| a == "--version" || a == "-V")) && argv.iter().any(|a| a == "--json") {
        let mut data = Map::new();
        data.insert("version".into(), Value::String(program::program_file().version.clone()));
        let mut env = Map::new();
        env.insert("apiVersion".into(), Value::from(1));
        env.insert("type".into(), Value::String("version".into()));
        env.insert("data".into(), Value::Object(data));
        let mut meta = Map::new();
        meta.insert("answeredBy".into(), crate::cli::env::answered_by(&run.cwd));
        env.insert("meta".into(), Value::Object(meta));
        run.out.print_json(&Value::Object(env));
        return (run.out, 0);
    }
    let root = program::root();
    let result = run.parse_command(root, Vec::new(), argv);
    let code = match result {
        Ok(()) => run.out.exit_code,
        Err(Stop::Exit(c)) => c,
        Err(Stop::Commander(e)) => run.handle_commander_error(e),
    };
    (run.out, code)
}

/// Print help for a command as `cmd.outputHelp()` does (for group actions).
pub fn output_help_for(full_name: &str, out: &mut Out, argv: &[String], cwd: &std::path::Path) {
    let node = program::root().at(full_name).expect("known command");
    let mut run = Run::new(argv.to_vec(), cwd.to_path_buf());
    run.out.json_mode = out.json_mode;
    std::mem::swap(&mut run.out, out);
    run.output_help(node, false, &[]);
    std::mem::swap(&mut run.out, out);
}

/// `cmd.help()`: print help and stop (exit code `process.exitCode || 0`).
pub fn help_for(full_name: &str, out: &mut Out, argv: &[String], cwd: &std::path::Path) -> CmdResult {
    output_help_for(full_name, out, argv, cwd);
    Err(Exit(out.exit_code))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn option_sources_follow_commander() {
        let root = program::root();
        let mut run = Run::new(vec![], std::env::temp_dir());
        run.init_defaults(root);
        assert_eq!(run.sources[""].get("detail"), Some(&OptSource::Default));
        let _ = run.parse_options(root, vec!["docs".into(), "--detail".into(), "full".into()]);
        assert_eq!(run.sources[""].get("detail"), Some(&OptSource::Cli));
        assert_eq!(run.values[""].get("detail"), Some(&OptValue::Str("full".into())));
    }
}
