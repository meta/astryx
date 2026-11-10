//! Commands the shell answers itself: the root action (bare `astryx`, an
//! unknown command, `astryx --json`), `manifest`, and the bare group
//! commands (`theme`, `integration`, ...) that print help or report an
//! unknown subcommand. A command lane may still register any of these in
//! `crate::commands`; that registration wins.

use crate::cli::command::{CmdResult, ErrorOpts, Handler, Invocation, Out, Suggestion};
use crate::cli::format::{records, section, text, Field};
use crate::cli::parse::{help_for, output_help_for};
use crate::cli::program::{self, Node};
use crate::json::{Map, Value};

pub fn handler(name: &str) -> Option<Handler> {
    Some(match name {
        "" => root,
        "manifest" => manifest,
        "postinstall" => postinstall,
        "theme" | "theme palette" | "experimental" => group_help_exit,
        "integration" => integration_group,
        "doctor integration" => doctor_integration_group,
        _ => return None,
    })
}

/// The JS CLI's own Levenshtein distance (gap above 5 counts as 999).
fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<u16> = a.encode_utf16().collect();
    let b: Vec<u16> = b.encode_utf16().collect();
    let (m, n) = (a.len(), b.len());
    if m.abs_diff(n) > 5 {
        return 999;
    }
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for (i, row) in dp.iter_mut().enumerate() {
        row[0] = i;
    }
    for j in 0..=n {
        dp[0][j] = j;
    }
    for i in 1..=m {
        for j in 1..=n {
            dp[i][j] = if a[i - 1] == b[j - 1] { dp[i - 1][j - 1] } else { 1 + dp[i - 1][j].min(dp[i][j - 1]).min(dp[i - 1][j - 1]) };
        }
    }
    dp[m][n]
}

fn root(inv: &Invocation, out: &mut Out) -> CmdResult {
    let program = program::root();
    if let Some(unknown) = inv.all_args.first() {
        let known: Vec<&str> = program.commands.iter().filter(|c| !c.hidden && c.name != "help").map(|c| c.name.as_str()).collect();
        let lower = unknown.to_lowercase();
        let mut close: Vec<(&str, usize)> = known.iter().map(|n| (*n, levenshtein(&lower, &n.to_lowercase()))).filter(|(_, d)| *d <= 3).collect();
        close.sort_by_key(|(_, d)| *d);
        close.truncate(3);
        let suggestions: Vec<Suggestion> = if !close.is_empty() {
            close.iter().map(|(n, _)| Suggestion::new(*n, "did you mean this?")).collect()
        } else {
            known.iter().map(|n| Suggestion::new(*n, "available command")).collect()
        };
        return out.cli_error(&format!("unknown command '{unknown}'"), ErrorOpts::code("ERR_UNKNOWN_COMMAND").suggestions(suggestions));
    }
    if inv.globals.json {
        out.json_handled = true;
        let manifest = build_manifest(&inv.cwd);
        let mut data = Map::new();
        data.insert("name".into(), manifest["name"].clone());
        data.insert("version".into(), manifest["version"].clone());
        let names: Vec<Value> = manifest["commands"].as_array().map(|a| a.iter().map(|c| c["name"].clone()).collect()).unwrap_or_default();
        data.insert("commands".into(), Value::Array(names));
        data.insert("jsonSupported".into(), manifest["jsonSupported"].clone());
        data.insert("manifest".into(), manifest);
        let mut env = Map::new();
        env.insert("apiVersion".into(), Value::from(1));
        env.insert("type".into(), Value::String("help".into()));
        env.insert("data".into(), Value::Object(data));
        let mut meta = Map::new();
        meta.insert("answeredBy".into(), crate::cli::env::answered_by(&inv.cwd));
        env.insert("meta".into(), Value::Object(meta));
        out.print_json(&Value::Object(env));
        return Ok(());
    }
    help_for("", out, &inv.argv, &inv.cwd)
}

fn manifest(inv: &Invocation, out: &mut Out) -> CmdResult {
    let manifest = build_manifest(&inv.cwd);
    if inv.globals.json {
        out.json_out("manifest", None, manifest, None);
        return Ok(());
    }
    let cmds = manifest["commands"].as_array().cloned().unwrap_or_default();
    let rows: Vec<Vec<(String, Field)>> = cmds
        .iter()
        .map(|c| {
            vec![
                ("name".to_string(), Field::from_json(&c["name"])),
                ("json".to_string(), Field::from(if c["json"].as_bool().unwrap_or(false) { "yes" } else { "" })),
                ("description".to_string(), Field::from_json(&c["description"])),
            ]
        })
        .collect();
    out.emit(&[
        section(&format!("{} v{} ({} commands)", manifest["name"].as_str().unwrap_or(""), manifest["version"].as_str().unwrap_or(""), cmds.len()), None),
        records(&rows),
        text(&format!("Run `{} manifest --json` for the full structured manifest.", crate::cli::env::cli_invocation(&inv.cwd))),
    ]);
    Ok(())
}

/// `theme`, `theme palette`, `experimental`: an unknown word is an unknown
/// subcommand; bare, print help and stop (exit 0).
fn group_help_exit(inv: &Invocation, out: &mut Out) -> CmdResult {
    if let Some(first) = inv.all_args.first() {
        return unknown_subcommand(inv, out, first);
    }
    help_for(&inv.name, out, &inv.argv, &inv.cwd)
}

fn unknown_subcommand(inv: &Invocation, out: &mut Out, word: &str) -> CmdResult {
    let node = program::root().at(&inv.name).expect("group");
    let sugg = node.commands.iter().map(|c| Suggestion::new(c.name.clone(), "available subcommand")).collect();
    out.cli_error(&format!("unknown subcommand '{} {}'", inv.name, word), ErrorOpts::code("ERR_UNKNOWN_SUBCOMMAND").suggestions(sugg))
}

/// `integration`: unknown options stay among the args; a word is an unknown
/// subcommand, a flag alone an unknown option; bare, print help.
fn integration_group(inv: &Invocation, out: &mut Out) -> CmdResult {
    let word = inv.all_args.iter().find(|a| !a.starts_with('-'));
    if word.is_none() && !inv.all_args.is_empty() {
        return out.cli_error(&format!("unknown option '{}'", inv.all_args[0]), ErrorOpts::code("ERR_INVALID_OPTION"));
    }
    if let Some(w) = word {
        return unknown_subcommand(inv, out, w);
    }
    output_help_for(&inv.name, out, &inv.argv, &inv.cwd);
    Ok(())
}

fn doctor_integration_group(inv: &Invocation, out: &mut Out) -> CmdResult {
    if let Some(w) = inv.all_args.iter().find(|a| !a.starts_with('-')) {
        return unknown_subcommand(inv, out, w);
    }
    output_help_for(&inv.name, out, &inv.argv, &inv.cwd);
    Ok(())
}

const CLI_LAYER_RESPONSE_TYPES: &[(&str, &str)] = &[("manifest", "manifest"), ("theme build", "theme.build.batch"), ("theme add", "theme.list")];

const GLOBAL_MODE_SUMMARY: &str = "In a folder that belongs to a project, the project's own CLI answers: this copy hands the run to it. In a project with no CLI of its own, and outside any project, this copy answers. A copy installed for the computer checks the registry for a newer release once a day in the background, and keeps one agent skill file in the home folder.";

fn describe_option(o: &program::OptSpec, pm: &str) -> Value {
    let mut d = Map::new();
    d.insert("flag".into(), Value::String(o.flags.clone()));
    d.insert("description".into(), Value::String(o.description.get(pm).to_string()));
    d.insert("type".into(), Value::String(if o.required || o.optional { "string" } else { "boolean" }.into()));
    if let Some(c) = &o.choices {
        if !c.is_empty() {
            d.insert("choices".into(), Value::Array(c.iter().cloned().map(Value::String).collect()));
            d.insert("type".into(), Value::String("enum".into()));
        }
    }
    if let Some(v) = &o.default_value {
        d.insert("default".into(), v.clone());
    }
    if o.negate {
        d.insert("negate".into(), Value::Bool(true));
    }
    Value::Object(d)
}

fn describe_command(c: &Node, pm: &str, json_supported: &[String]) -> Option<Value> {
    let name = &c.full_name;
    if name.is_empty() || c.hidden || name == "help" {
        return None;
    }
    let mut subs: Vec<Value> = c.commands.iter().filter_map(|s| describe_command(s, pm, json_supported)).collect();
    let mut e = Map::new();
    e.insert("name".into(), Value::String(name.clone()));
    e.insert("description".into(), Value::String(c.description.get(pm).to_string()));
    let args: Vec<Value> = c
        .args
        .iter()
        .map(|a| {
            let mut m = Map::new();
            m.insert("name".into(), Value::String(a.name.clone()));
            m.insert("required".into(), Value::Bool(a.required));
            m.insert("variadic".into(), Value::Bool(a.variadic));
            m.insert("description".into(), Value::String(a.description.get(pm).to_string()));
            Value::Object(m)
        })
        .collect();
    e.insert("arguments".into(), Value::Array(args));
    e.insert("options".into(), Value::Array(c.options.iter().map(|o| describe_option(o, pm)).collect()));
    e.insert("json".into(), Value::Bool(json_supported.iter().any(|j| j == name)));
    if !c.aliases.is_empty() {
        e.insert("aliases".into(), Value::Array(c.aliases.iter().cloned().map(Value::String).collect()));
    }
    let mut rt: Vec<Value> = c.response_types.iter().cloned().map(Value::String).collect();
    for (n, t) in CLI_LAYER_RESPONSE_TYPES {
        if n == name {
            rt.push(Value::String(t.to_string()));
        }
    }
    if !rt.is_empty() {
        e.insert("responseTypes".into(), Value::Array(rt));
    }
    if !c.examples.is_empty() {
        e.insert("examples".into(), Value::Array(c.examples.iter().cloned().map(Value::String).collect()));
    }
    if !c.exit_codes.is_empty() {
        let ec: Vec<Value> = c
            .exit_codes
            .iter()
            .map(|x| {
                let mut m = Map::new();
                m.insert("code".into(), x.code.clone());
                m.insert("when".into(), Value::String(x.when.clone()));
                Value::Object(m)
            })
            .collect();
        e.insert("exitCodes".into(), Value::Array(ec));
    }
    if let Some(op) = &c.outside_project {
        if !op.is_null() && op != &Value::Bool(false) && op != &Value::String(String::new()) {
            e.insert("outsideProject".into(), op.clone());
        }
    }
    if !subs.is_empty() {
        subs.sort_by(|a, b| crate::cli::collate::locale_compare(a["name"].as_str().unwrap_or(""), b["name"].as_str().unwrap_or("")));
        e.insert("subcommands".into(), Value::Array(subs));
    }
    Some(Value::Object(e))
}

fn flatten(cmds: &[Value], out: &mut Vec<Value>) {
    for c in cmds {
        out.push(c.clone());
        if let Some(s) = c.get("subcommands").and_then(|s| s.as_array()) {
            flatten(s, out);
        }
    }
}

/// `buildManifest(program, {jsonSupported, version})`.
pub fn build_manifest(cwd: &std::path::Path) -> Value {
    let pf = program::program_file();
    let pm = program::doc_pm(cwd);
    let root = &pf.program;
    let mut commands: Vec<Value> = root.commands.iter().filter_map(|c| describe_command(c, &pm, &pf.json_supported)).collect();
    commands.sort_by(|a, b| crate::cli::collate::locale_compare(a["name"].as_str().unwrap_or(""), b["name"].as_str().unwrap_or("")));
    let mut globals: Vec<Value> = root.options.iter().map(|o| describe_option(o, &pm)).collect();
    if !root.options.iter().any(|o| o.long.as_deref() == Some("--version")) {
        let mut m = Map::new();
        m.insert("flag".into(), Value::String("-V, --version".into()));
        m.insert("description".into(), Value::String("Output the version number".into()));
        m.insert("type".into(), Value::String("boolean".into()));
        globals.push(Value::Object(m));
    }
    let mut js = pf.json_supported.clone();
    js.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    let mut gm = Map::new();
    gm.insert("docs".into(), Value::String("astryx docs global".into()));
    gm.insert("summary".into(), Value::String(GLOBAL_MODE_SUMMARY.into()));
    let mut flat = Vec::new();
    flatten(&commands, &mut flat);
    let mut rt = Map::new();
    for c in flat {
        if let Some(t) = c.get("responseTypes") {
            rt.insert(c["name"].as_str().unwrap_or("").to_string(), t.clone());
        }
    }
    let mut m = Map::new();
    m.insert("name".into(), Value::String("astryx".into()));
    m.insert("version".into(), Value::String(pf.version.clone()));
    m.insert("apiVersion".into(), Value::from(1));
    m.insert("description".into(), Value::String(root.description.get(&pm).to_string()));
    m.insert("globalOptions".into(), Value::Array(globals));
    m.insert("commands".into(), Value::Array(commands));
    m.insert("jsonSupported".into(), Value::Array(js.into_iter().map(Value::String).collect()));
    m.insert("globalMode".into(), Value::Object(gm));
    m.insert("responseTypes".into(), Value::Object(rt));
    Value::Object(m)
}

/// `welcomeBox(r)` (lib/welcome-box.mjs).
pub fn welcome_box(r: &str) -> String {
    const W: usize = 49;
    let line = |s: &str| format!("  \u{2502} {}\u{2502}", crate::cli::format::pad_end(s, W));
    let rule = "\u{2500}".repeat(W + 2);
    let lines = [
        String::new(),
        format!("  \u{256d}{rule}\u{256e}"),
        line(""),
        line("  Design system installed!"),
        line(""),
        line("  Get started:"),
        line(&format!("    {r} init          Setup + AI agent docs")),
        line(&format!("    {r} --help        See all commands")),
        line(""),
        line("  Or run directly:"),
        line(&format!("    {r} init           Setup + AI agent docs")),
        line(&format!("    {r} component     Browse component docs")),
        line(&format!("    {r} hook          Browse hook docs")),
        line(&format!("    {r} docs          Design system reference")),
        line(&format!("    {r} swizzle       Customize a component")),
        line(&format!("    {r} template      Add a page template")),
        line(""),
        format!("  \u{2570}{rule}\u{256f}"),
        String::new(),
    ];
    lines.join("\n")
}

fn postinstall(inv: &Invocation, out: &mut Out) -> CmdResult {
    let r = crate::cli::env::cli_invocation(&inv.cwd);
    out.emit(&[crate::cli::format::code(&welcome_box(&r))]);
    Ok(())
}
