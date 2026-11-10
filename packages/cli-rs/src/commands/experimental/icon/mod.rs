//! `astryx experimental icon` and its subcommands: port of
//! `clients/cli/commands/experimental/icon.mjs` over `api.rs`.

pub mod api;
pub mod authoring;
pub mod ranking;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out, Suggestion};
use crate::cli::env::{cli_invocation, format_cli_command_at};
use crate::cli::format::{json_fields, list, record, records, section, text, Block, Field, Fields};
use crate::json::{Map, Value};
use api::{ierr, refuse_ignored_pairs, IconError, IconOptions, IconResult};

fn fail(out: &mut Out, e: IconError) -> CmdResult {
    out.cli_error(&e.message, ErrorOpts::code(&e.code).suggestions(e.suggestions))
}

fn cwd_of(inv: &Invocation) -> String {
    inv.cwd.to_string_lossy().to_string()
}

/// The words, as Commander passes the variadic `[words...]`.
fn query_of(inv: &Invocation) -> Option<String> {
    match inv.args.first() {
        Some(crate::cli::command::Arg::Many(v)) => Some(v.join(" ")),
        Some(crate::cli::command::Arg::One(s)) => Some(s.clone()),
        _ => None,
    }
}

pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let cwd = cwd_of(inv);
    let o = IconOptions {
        list: inv.flag("list"),
        set: inv.opt_str("set").map(String::from),
        limit: inv.opt_str("limit").map(api::js_number),
        all_icons: inv.flag("allIcons"),
        definitions: inv.flag("definitions"),
    };
    let cli_root = inv.cli_root.clone();
    let defs = move || api::astryx_icon_definitions(&cli_root);
    let query = query_of(inv);
    let result = match api::icon(query.as_deref(), &o, &cwd, &defs) {
        Ok(r) => r,
        Err(e) => return fail(out, e),
    };
    if inv.json() {
        match result {
            IconResult::List(d) => out.json_out("icon.list", None, d, None),
            IconResult::Definitions(d) => out.json_out("icon.definitions", None, d, None),
            IconResult::SetIcons(d) => out.json_out("icon.setIcons", None, d, None),
            IconResult::Search(d) => out.json_out("icon.search", None, d, None),
            IconResult::Detail { package, data } => out.json_out("icon.detail", Some(Value::String(package)), data, None),
        }
        return Ok(());
    }
    let run = cli_invocation(&inv.cwd);
    let strs = |v: &Value| -> Vec<String> {
        v.as_array().map(|a| a.iter().map(crate::cli::format::js_string).collect()).unwrap_or_default()
    };
    match result {
        IconResult::Definitions(d) => {
            let defs = d["definitions"].as_array().cloned().unwrap_or_default();
            let built = defs.iter().filter(|e| e["builtIn"] == Value::Bool(true)).count();
            let items: Vec<String> = defs
                .iter()
                .map(|e| {
                    format!(
                        "{} [{}]: {} Words: {}.",
                        e["name"].as_str().unwrap_or(""),
                        if e["builtIn"] == Value::Bool(true) { "built-in" } else { "optional" },
                        e["description"].as_str().unwrap_or(""),
                        strs(&e["words"]).join(", ")
                    )
                })
                .collect();
            out.emit(&[
                section(&format!("Icon definitions ({}, {} built-in)", defs.len(), built), None),
                list(&items),
                text(&format!(
                    "Built-in definitions are the ones every set maps. Map one: {run} experimental icon map <definition> <icon id> --set <set>"
                )),
            ]);
        }
        IconResult::SetIcons(d) => {
            let set = d["set"].as_str().unwrap_or("").to_string();
            let icons = d["icons"].as_array().cloned().unwrap_or_default();
            let items: Vec<String> = icons
                .iter()
                .map(|e| {
                    let defs = strs(&e["definitions"]);
                    format!(
                        "{}: {}{}",
                        e["id"].as_str().unwrap_or(""),
                        strs(&e["words"]).join(", "),
                        if defs.is_empty() { String::new() } else { format!(" = {}", defs.join(", ")) }
                    )
                })
                .collect();
            out.emit(&[
                section(&format!("Icons in {set} ({})", crate::cli::format::js_string(&d["iconCount"])), None),
                list(&items),
                text(&format!("Map one: {run} experimental icon map <definition> <id> --set {set}")),
            ]);
        }
        IconResult::Search(d) => {
            let q = d["query"].as_str().unwrap_or("");
            let matches = d["matches"].as_array().cloned().unwrap_or_default();
            if matches.is_empty() {
                out.emit(&[
                    text(&format!("No icons match \"{q}\".")),
                    text(&format!("See the installed sets: {run} experimental icon --list")),
                ]);
                return Ok(());
            }
            let count = d["matchCount"].as_u64().unwrap_or(0) as usize;
            let heading = if count > matches.len() {
                format!("Icons for \"{q}\" ({} of {count})", matches.len())
            } else {
                format!("Icons for \"{q}\" ({})", matches.len())
            };
            let rows: Vec<Fields> = matches
                .iter()
                .map(|m| {
                    let mut obj = m.as_object().cloned().unwrap_or_default();
                    let variants = obj.shift_remove("variants").and_then(|v| v.as_array().cloned()).unwrap_or_default();
                    if !variants.is_empty() {
                        obj.insert(
                            "variant".into(),
                            Value::String(
                                variants
                                    .iter()
                                    .map(|v| {
                                        format!("{} ({})", v["variant"].as_str().unwrap_or(""), v["export"].as_str().unwrap_or(""))
                                    })
                                    .collect::<Vec<_>>()
                                    .join(", "),
                            ),
                        );
                    }
                    json_fields(
                        &Value::Object(obj),
                        Some(&["set", "id", "package", "import", "words", "definitions", "variant", "reason"]),
                    )
                })
                .collect();
            out.emit(&[
                section(&heading, None),
                records(&rows),
                text(&format!("Read one with its variants: {run} experimental icon <set>/<id>")),
            ]);
        }
        IconResult::Detail { data, .. } => {
            let variants = data["variants"].as_array().cloned().unwrap_or_default();
            let mut blocks = vec![record(&json_fields(
                &data,
                Some(&["set", "id", "package", "module", "export", "import", "words", "definitions"]),
            ))];
            if !variants.is_empty() {
                blocks.push(section("Other variants", None));
                blocks.push(records(
                    &variants.iter().map(|v| json_fields(v, Some(&["variant", "module", "export", "import"]))).collect::<Vec<_>>(),
                ));
            }
            let first = strs(&data["words"]).into_iter().next().unwrap_or_default();
            blocks.push(text(&format!(
                "More icons: {}",
                format_cli_command_at(&inv.cwd, &format!("experimental icon {first}"))
            )));
            out.emit(&blocks);
        }
        IconResult::List(d) => {
            let mut blocks: Vec<Block> = vec![
                section("Icon sets", None),
                record(&json_fields(&d, Some(&["status", "projectSet", "reason"]))),
            ];
            let sets = d["sets"].as_array().cloned().unwrap_or_default();
            if !sets.is_empty() {
                let rows: Vec<Fields> = sets
                    .iter()
                    .map(|s| {
                        let cov = &s["coverage"];
                        let get = |k: &str| Field::from_json(&s[k]);
                        let default = s["default"]["variant"].as_str().unwrap_or("").to_string();
                        let variants = strs(&s["variants"]).join("/");
                        vec![
                            ("name".to_string(), get("name")),
                            ("displayName".to_string(), get("displayName")),
                            ("package".to_string(), get("package")),
                            ("license".to_string(), get("license")),
                            ("iconCount".to_string(), get("iconCount")),
                            ("default".to_string(), Field::Str(default)),
                            ("variants".to_string(), Field::Str(variants)),
                            (
                                "builtIn".to_string(),
                                Field::Str(format!(
                                    "{}/{}",
                                    crate::cli::format::js_string(&cov["builtIn"]["mapped"]),
                                    crate::cli::format::js_string(&cov["builtIn"]["total"])
                                )),
                            ),
                            (
                                "definitions".to_string(),
                                Field::Str(format!(
                                    "{}/{}",
                                    crate::cli::format::js_string(&cov["astryx"]["mapped"]),
                                    crate::cli::format::js_string(&cov["astryx"]["total"])
                                )),
                            ),
                            ("own".to_string(), Field::from_json(&cov["own"])),
                            ("missing".to_string(), Field::from_json(&cov["builtIn"]["missing"])),
                            ("project".to_string(), get("project")),
                            ("description".to_string(), get("description")),
                        ]
                    })
                    .collect();
                blocks.push(records(&rows));
            }
            let withdrawn = d["withdrawn"].as_array().cloned().unwrap_or_default();
            if !withdrawn.is_empty() {
                blocks.push(section("Withdrawn", None));
                blocks.push(list(
                    &withdrawn
                        .iter()
                        .map(|w| {
                            format!(
                                "{}/{}: {}",
                                w["package"].as_str().unwrap_or(""),
                                w["name"].as_str().unwrap_or(""),
                                w["reason"].as_str().unwrap_or("")
                            )
                        })
                        .collect::<Vec<_>>(),
                ));
            }
            blocks.push(text(&format!("Find one: {run} experimental icon <words>")));
            out.emit(&blocks);
        }
    }
    Ok(())
}

/// The set an authoring subcommand edits: its own `--set`, else the parent's.
fn set_of(inv: &Invocation) -> Option<String> {
    inv.opt_str("set").map(String::from)
}

fn passed(v: Option<&str>) -> bool {
    v.is_some_and(|s| !s.is_empty())
}

pub fn use_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    let cwd = cwd_of(inv);
    let selector = inv.arg(0).unwrap_or("");
    let r = (|| -> Result<(), IconError> {
        if selector.trim().is_empty() {
            return Err(ierr(
                "Name the icon set to use",
                vec![Suggestion::new("astryx experimental icon --list", "list the installed sets")],
                "ERR_MISSING_ARGUMENT",
            ));
        }
        api::refuse_outside_project(&cwd, "experimental icon use", "the app project")?;
        let sets = api::load_icon_sets(&cwd);
        let named = api::sets_named(&sets.sets, selector);
        if named.is_empty() {
            return Err(api::unusable_set(&sets.sets, &sets.withdrawn, selector));
        }
        Err(ierr("experimental icon use is not cloned yet", vec![], "ERR_UNKNOWN"))
    })();
    match r {
        Ok(()) => Ok(()),
        Err(e) => fail(out, e),
    }
}

pub fn map_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    let cwd = cwd_of(inv);
    let definition = inv.arg(0);
    let icon = inv.arg(1);
    let remove = inv.flag("remove");
    let pairs = inv.opt_str("pairs");
    let r = (|| -> Result<(), IconError> {
        api::refuse_outside_project(&cwd, "experimental icon map", "the icon-set package")?;
        refuse_ignored_pairs(
            &[
                ("a definition", passed(definition)),
                ("an icon", passed(icon)),
                ("--remove", remove),
                ("--pairs", passed(pairs)),
            ],
            &[("--pairs", "a definition"), ("--pairs", "an icon"), ("--pairs", "--remove"), ("--remove", "an icon")],
        )?;
        if pairs.is_some() {
            api::find_local_icon_set(&cwd, set_of(inv).as_deref())?;
            return Ok(());
        }
        if definition.is_none_or(|d| d.trim().is_empty()) {
            return Err(ierr(
                "Name the icon definition to map",
                vec![Suggestion::new("astryx docs cli/experimental/icon-definitions", "every icon definition")],
                "ERR_MISSING_ARGUMENT",
            ));
        }
        if !remove && icon.is_none_or(|d| d.trim().is_empty()) {
            return Err(ierr("Name the icon id to map it to, or pass --remove", vec![], "ERR_MISSING_ARGUMENT"));
        }
        api::find_local_icon_set(&cwd, set_of(inv).as_deref())
    })();
    match r {
        Ok(()) => Ok(()),
        Err(e) => fail(out, e),
    }
}

/// `definitionNameFromInput`: a lower-kebab name becomes camelCase.
fn definition_name_from_input(name: &str) -> String {
    let parts: Vec<&str> = name.split('-').collect();
    let kebab = parts.len() >= 2
        && parts[0].chars().next().is_some_and(|c| c.is_ascii_lowercase())
        && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
    if !kebab {
        return name.to_string();
    }
    let mut out = parts[0].to_string();
    for p in &parts[1..] {
        let mut cs = p.chars();
        if let Some(f) = cs.next() {
            out.extend(f.to_uppercase());
            out.push_str(cs.as_str());
        }
    }
    out
}

fn is_identifier(s: &str) -> bool {
    let mut cs = s.chars();
    match cs.next() {
        Some(c) if c == '$' || c == '_' || c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    cs.all(|c| c == '$' || c == '_' || c.is_ascii_alphanumeric())
}

pub fn add_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    let cwd = cwd_of(inv);
    let export_name = inv.arg(0);
    let from = inv.opt_str("from");
    let given_definition = inv.opt_str("definition");
    let new_definition = inv.opt_str("newDefinition").map(definition_name_from_input);
    let description = inv.opt_str("description");
    // `--words` splits on commas, so `--words ""` is `['']`, which is passed.
    let words = inv.opt_str("words");
    let use_default = inv.flag("default");
    let variant = inv.opt_str("variant");
    let given_id = inv.opt_str("id");
    let all = inv.flag("all");
    let r = (|| -> Result<(), IconError> {
        api::refuse_outside_project(&cwd, "experimental icon add", "the icon-set package")?;
        refuse_ignored_pairs(
            &[
                ("an export name", passed(export_name)),
                ("--definition", passed(given_definition)),
                ("--new-definition", passed(new_definition.as_deref())),
                ("--description", passed(description)),
                ("--words", words.is_some()),
                ("--default", use_default),
                ("--id", passed(given_id)),
                ("--all", all),
            ],
            &[
                ("--all", "an export name"),
                ("--all", "--definition"),
                ("--all", "--new-definition"),
                ("--all", "--description"),
                ("--all", "--words"),
                ("--all", "--default"),
                ("--all", "--id"),
                ("--definition", "--new-definition"),
                ("--definition", "--description"),
                ("--definition", "--words"),
            ],
        )?;
        for (flag, given) in [("--description", passed(description)), ("--words", words.is_some())] {
            if given && !passed(new_definition.as_deref()) {
                return Err(ierr(
                    format!("{flag} describes a new definition, so it needs --new-definition"),
                    vec![Suggestion::new(
                        "--new-definition <name> --description '<what it is for>' --words a,b",
                        "add your own definition",
                    )],
                    "ERR_INVALID_OPTION",
                ));
            }
        }
        if all {
            if variant.is_none_or(|v| v.is_empty()) {
                return Err(ierr(
                    "--all adds one variant for every icon: pass --variant with the variant, such as solid.",
                    vec![],
                    "ERR_MISSING_ARGUMENT",
                ));
            }
            if from.is_none_or(|f| f.trim().is_empty()) {
                return Err(ierr(
                    "Pass --from with the module that exports the variant, such as @heroicons/react/24/solid.",
                    vec![],
                    "ERR_MISSING_ARGUMENT",
                ));
            }
            return api::find_local_icon_set(&cwd, set_of(inv).as_deref());
        }
        if !export_name.is_some_and(is_identifier) {
            return Err(ierr(
                format!(
                    "Name the icon's export, such as TrashIcon; received \"{}\".",
                    export_name.unwrap_or("undefined")
                ),
                vec![],
                "ERR_INVALID_ARGUMENT",
            ));
        }
        if from.is_none_or(|f| f.trim().is_empty()) {
            return Err(ierr(
                "Pass --from with the module the icon is exported from: a package, a package subpath, or a relative path in this package.",
                vec![],
                "ERR_MISSING_ARGUMENT",
            ));
        }
        api::find_local_icon_set(&cwd, set_of(inv).as_deref())
    })();
    match r {
        Ok(()) => Ok(()),
        Err(e) => fail(out, e),
    }
}

fn kebab(name: &str) -> bool {
    let parts: Vec<&str> = name.split('-').collect();
    parts[0].chars().next().is_some_and(|c| c.is_ascii_lowercase())
        && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
}

pub fn new_set_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    let cwd = cwd_of(inv);
    let name = inv.arg(0).unwrap_or("");
    let from = inv.opt_str("from");
    let r = (|| -> Result<Value, IconError> {
        api::refuse_outside_project(&cwd, "experimental icon new-set", "the integration package")?;
        // variantOptions
        let variants: Vec<String> = {
            let mut v: Vec<String> = Vec::new();
            for each in inv.opt_str("variants").map(|s| s.split(',').map(|x| x.trim().to_string()).collect::<Vec<_>>()).unwrap_or_default() {
                if !each.is_empty() && !v.contains(&each) {
                    v.push(each);
                }
            }
            v
        };
        let chosen = inv.opt_str("defaultVariant").map(|s| crate::commands::gap_report::api::js_trim(s).to_string());
        if variants.is_empty() {
            if let Some(c) = chosen.as_deref().filter(|c| !c.is_empty()) {
                return Err(ierr(
                    "--default-variant names one of the set's variants, so it needs --variants.",
                    vec![Suggestion::new(format!("--variants {c},<other>"), "declare the variants")],
                    "ERR_INVALID_OPTION",
                ));
            }
        } else {
            for v in &variants {
                if !kebab(v) {
                    return Err(ierr(
                        format!("Invalid variant name \"{v}\": use lower-kebab, such as outline or solid."),
                        vec![],
                        "ERR_INVALID_ARGUMENT",
                    ));
                }
            }
            if let Some(c) = chosen.as_deref().filter(|c| !c.is_empty()) {
                if !variants.iter().any(|v| v == c) {
                    return Err(ierr(
                        format!("--default-variant \"{c}\" is not one of --variants ({}).", variants.join(", ")),
                        variants.iter().map(|v| Suggestion::new(format!("--default-variant {v}"), "a declared variant")).collect(),
                        "ERR_INVALID_ARGUMENT",
                    ));
                }
            }
        }
        let exclude: Vec<String> = inv
            .opt_str("exclude")
            .map(|s| s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect())
            .unwrap_or_default();
        if !exclude.is_empty() && from.is_none() {
            return Err(ierr("--exclude names library exports to leave out, so it needs --from.", vec![], "ERR_INVALID_OPTION"));
        }
        if !kebab(name) {
            return Err(ierr(
                format!("Invalid icon set name \"{name}\": use lowercase kebab-case starting with a letter."),
                vec![],
                "ERR_INVALID_ARGUMENT",
            ));
        }
        if let Err(e) = crate::commands::integration::add_helpers::sanitize_name(name, "icon set name") {
            return Err(ierr(e.message, vec![], "ERR_INVALID_ARGUMENT"));
        }
        let looks = if variants.is_empty() {
            None
        } else {
            let named = chosen.as_deref().is_some_and(|c| !c.is_empty());
            let default = if named { chosen.clone().unwrap() } else { variants[0].clone() };
            Some((variants.clone(), default, named))
        };
        authoring::add_icon_set(
            name,
            &authoring::NewSetOptions {
                dry_run: inv.flag("dryRun"),
                from: from.map(String::from),
                exclude,
                looks,
                display_name: inv.opt_str("displayName").map(String::from),
                description: inv.opt_str("description").map(String::from),
            },
            &cwd,
        )
    })();
    match r {
        Ok(data) => {
            if inv.json() {
                out.json_out("icon.newSet", None, data, None);
            } else {
                print_new(out, "icon set", &data);
            }
            Ok(())
        }
        Err(e) => fail(out, e),
    }
}

/// `printNew(what)`: a new-set or new-definition receipt.
fn print_new(out: &mut Out, what: &str, data: &Value) {
    let b = |k: &str| data.get(k).and_then(|v| v.as_bool()) == Some(true);
    let (dry, written, refreshed, updated) = (b("dryRun"), b("written"), b("refreshed"), b("updated"));
    let files: Vec<String> = data
        .get("files")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let state = if dry { "plan" } else if written { "ok" } else { "unchanged" };
    let up = {
        let mut c = what.chars();
        let f = c.next().unwrap().to_uppercase().collect::<String>();
        format!("{f}{}", c.as_str())
    };
    let heading = if refreshed {
        if dry { format!("Refresh {what} plan") } else { format!("{up} refreshed") }
    } else if updated {
        if dry {
            format!("{up} update plan")
        } else if written && !files.is_empty() {
            format!("{up} updated")
        } else {
            format!("{up} unchanged")
        }
    } else if dry {
        format!("New {what} plan")
    } else if written {
        format!("New {what} added")
    } else {
        format!("New {what} unchanged")
    };
    let name = data.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let manifest = data.get("manifest").and_then(|v| v.as_str()).unwrap_or("");
    let root_line = match data.get("root").filter(|r| r.is_object()) {
        Some(root) => {
            let path = root.get("path").and_then(|v| v.as_str()).unwrap_or("");
            if root.get("created").and_then(|v| v.as_bool()) == Some(true) {
                format!("{} the experimental.iconSets root {path} in {manifest}.", if dry { "Would declare" } else { "Declared" })
            } else {
                format!("The experimental.iconSets root {path} in {manifest} is unchanged.")
            }
        }
        None => format!("{} {manifest}.", if dry { "Would update" } else { "Updated" }),
    };
    let mut blocks = vec![section(&heading, None), text(&format!("[{state}] {name}")), text(&root_line)];
    if !files.is_empty() {
        blocks.push(list(&files));
    }
    for n in data.get("notes").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        blocks.push(text(&format!("[next] {}", n.as_str().unwrap_or(""))));
    }
    let mapped = data.get("mapped").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if !mapped.is_empty() {
        blocks.push(section(&format!("Mapped by name ({}, check each)", mapped.len()), None));
        blocks.push(list(
            &mapped
                .iter()
                .map(|m| format!("{} = {}", m["definition"].as_str().unwrap_or(""), m["icon"].as_str().unwrap_or("")))
                .collect::<Vec<_>>(),
        ));
    }
    let sugg = data.get("suggestions").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if !sugg.is_empty() {
        let mut defs: Vec<&str> = Vec::new();
        for s in &sugg {
            let d = s["definition"].as_str().unwrap_or("");
            if !defs.contains(&d) {
                defs.push(d);
            }
        }
        blocks.push(section(&format!("Suggestions ({} for {} definitions, not written)", sugg.len(), defs.len()), None));
        blocks.push(list(
            &sugg
                .iter()
                .map(|s| {
                    let (d, i, w) = (s["definition"].as_str().unwrap_or(""), s["icon"].as_str().unwrap_or(""), s["word"].as_str().unwrap_or(""));
                    format!(
                        "{d} -> {i} ({w}): {}",
                        format_cli_command_at(&out.cwd.clone(), &format!("experimental icon map {d} {i} --set {name}"))
                    )
                })
                .collect::<Vec<_>>(),
        ));
    }
    out.emit(&blocks);
}

pub fn new_definition_cmd(inv: &Invocation, out: &mut Out) -> CmdResult {
    let cwd = cwd_of(inv);
    let r = (|| -> Result<(), IconError> {
        api::refuse_outside_project(&cwd, "experimental icon new-definition", "the icon-set package")?;
        api::find_local_icon_set(&cwd, set_of(inv).as_deref())
    })();
    match r {
        Ok(()) => Ok(()),
        Err(e) => fail(out, e),
    }
}

#[allow(dead_code)]
fn unused(_: Map<String, Value>) {}
