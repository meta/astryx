//! `astryx doctor integration validate|templates|components|docs`: port of
//! `api/integration/validate-integration.mjs` and `authoring-checks.mjs`, and
//! their printers in `clients/cli/commands/doctor.mjs`. The integration lane
//! calls these for `integration check`.

pub mod examples;
pub mod packlist;
pub mod names_check;
pub mod public_imports;
pub mod validate;

use super::status_token;
use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out};
use crate::cli::format::{json_fields, list, record, records, section, text, Block, Field, Fields};
use crate::json::{Map, Value};

pub fn issue(code: &str, severity: &str, message: impl Into<String>) -> Value {
    let mut m = Map::new();
    m.insert("code".into(), Value::String(code.into()));
    m.insert("severity".into(), Value::String(severity.into()));
    m.insert("message".into(), Value::String(message.into()));
    Value::Object(m)
}

pub fn error(code: &str, message: impl Into<String>) -> Value {
    issue(code, "error", message)
}

pub fn warning(code: &str, message: impl Into<String>) -> Value {
    issue(code, "warning", message)
}

fn arr(v: Option<&Value>) -> &[Value] {
    v.and_then(|x| x.as_array()).map(|a| a.as_slice()).unwrap_or(&[])
}

fn sv<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(|x| x.as_str())
}

/// `summarizeIssues(issues)`: (errors, warnings).
pub fn summarize(issues: &[Value]) -> (usize, usize) {
    let mut e = 0;
    let mut w = 0;
    for i in issues {
        match sv(i, "severity") {
            Some("error") => e += 1,
            Some("warning") => w += 1,
            _ => {}
        }
    }
    (e, w)
}

/// Records with the given fields; `severity` printed as a status token.
fn recs(items: &[Value], fields: &[&str]) -> Block {
    let rows: Vec<Fields> = items
        .iter()
        .map(|i| {
            let mut f = json_fields(i, Some(fields));
            for (k, v) in f.iter_mut() {
                if k == "severity" {
                    if let Some(s) = i.get("severity") {
                        let tok = status_token(&crate::cli::format::js_string(s)).to_string();
                        *v = if s.is_null() { Field::Str(status_token("null").to_string()) } else { Field::Str(tok) };
                    }
                }
            }
            f
        })
        .collect();
    records(&rows)
}

fn label_of(data: &Value) -> String {
    let name = data.get("name");
    match name {
        None | Some(Value::Null) => "(local package)".into(),
        Some(n) => {
            let n = crate::cli::format::js_string(n);
            match data.get("version") {
                None | Some(Value::Null) => n,
                Some(v) => format!("{n}@{}", crate::cli::format::js_string(v)),
            }
        }
    }
}

fn is_icon(code: &str) -> bool {
    code.contains("icon")
}

/// `unseen(issues, seen)`.
pub fn unseen(issues: &[Value], seen: Option<&mut std::collections::HashSet<String>>) -> Vec<Value> {
    let Some(seen) = seen else { return issues.to_vec() };
    let key = |i: &Value| format!("{}\0{}", sv(i, "code").unwrap_or(""), sv(i, "message").unwrap_or(""));
    let fresh: Vec<Value> = issues.iter().filter(|i| !is_icon(sv(i, "code").unwrap_or("")) || !seen.contains(&key(i))).cloned().collect();
    for i in issues {
        if is_icon(sv(i, "code").unwrap_or("")) {
            seen.insert(key(i));
        }
    }
    fresh
}

fn also_apply(total: usize, fresh: usize) -> Vec<Block> {
    let repeated = total - fresh;
    if repeated == 0 {
        return vec![];
    }
    vec![text(&format!(
        "{repeated} package-wide issue{} listed above also appl{} here.",
        if repeated == 1 { "" } else { "s" },
        if repeated == 1 { "ies" } else { "y" }
    ))]
}

fn issue_blocks(issues: &[Value], seen: Option<&mut std::collections::HashSet<String>>) -> Vec<Block> {
    let fresh = unseen(issues, seen);
    if fresh.is_empty() {
        return also_apply(issues.len(), 0);
    }
    let mut out = vec![section("Integration issues", None), recs(&fresh, &["severity", "code", "message", "fix", "file", "line"])];
    out.extend(also_apply(issues.len(), fresh.len()));
    out
}

fn doc_types_blocks(report: Option<&Value>, failed: bool) -> Vec<Block> {
    let Some(r) = report else { return vec![] };
    let docs = r.get("docs").and_then(|v| v.as_u64()).unwrap_or(0);
    let findings = arr(r.get("findings"));
    let unchecked = arr(r.get("unchecked"));
    let fixtures = r.get("fixtures").and_then(|v| v.as_u64()).unwrap_or(0);
    let status = sv(r, "status").unwrap_or("");
    if status == "checked" && docs == 0 && findings.is_empty() && unchecked.is_empty() {
        let mut b = vec![text("[info] No doc files to type-check.")];
        if fixtures > 0 {
            b.push(text(&format!("[info] {fixtures} test fixture doc(s) not checked.")));
        }
        return b;
    }
    if status == "skipped" {
        return vec![text(&format!("[skip] Docs not type-checked: {}", r.get("reason").map(crate::cli::format::js_string).unwrap_or_default()))];
    }
    let ts = r.get("typescript").map(crate::cli::format::js_string).filter(|s| !s.is_empty() && s != "null");
    let mut blocks = vec![section(
        &format!("Checking {docs} doc(s) against the authoring types{}", ts.map(|t| format!(" (TypeScript {t})")).unwrap_or_default()),
        None,
    )];
    if !findings.is_empty() {
        let mut files: Vec<String> = Vec::new();
        for f in findings {
            let d = f.get("doc").map(crate::cli::format::js_string).unwrap_or_default();
            if !files.contains(&d) {
                files.push(d);
            }
        }
        blocks.push(recs(findings, &["severity", "doc", "line", "export", "type", "field", "problem", "message", "fix"]));
        blocks.push(text(&format!(
            "{} doc field(s) in {} file(s) do not match the authoring types. These are warnings; `astryx docs authoring` lists every field.",
            findings.len(),
            files.len()
        )));
    }
    if !unchecked.is_empty() {
        blocks.push(text(&format!("[info] Not type-checked: {} doc file(s):", unchecked.len())));
        blocks.push(recs(unchecked, &["doc", "reason"]));
    }
    if fixtures > 0 {
        blocks.push(text(&format!("[info] {fixtures} test fixture doc(s) not checked.")));
    }
    if findings.is_empty() && docs > 0 {
        blocks.push(text(&if failed {
            format!("[info] No doc field differs from its authoring type ({docs} checked).")
        } else if !unchecked.is_empty() {
            format!("[ok] Every doc that was checked matches its authoring type ({docs} checked).")
        } else {
            format!("[ok] Every doc matches its authoring type ({docs} checked).")
        }));
    }
    blocks
}

fn unchecked_list(report: Option<&Value>, head: impl Fn(usize) -> String, fields: &[&str]) -> Vec<Block> {
    let Some(r) = report else { return vec![] };
    let u = arr(r.get("unchecked"));
    if u.is_empty() {
        return vec![];
    }
    vec![text(&head(u.len())), recs(u, fields)]
}

fn icon_set_blocks(sets: Option<&Value>) -> Vec<Block> {
    let sets = arr(sets);
    let listed: Vec<&Value> =
        sets.iter().filter(|s| !arr(s.get("unmappedDefinitions")).is_empty() || !arr(s.get("suggestions")).is_empty()).collect();
    let mut unchecked: Vec<Value> = Vec::new();
    for s in sets {
        for item in arr(s.get("unchecked")) {
            let it = if let Some(i) = sv(item, "icon").filter(|x| !x.is_empty()) {
                format!("icon {i}")
            } else if let Some(a) = sv(item, "adapter").filter(|x| !x.is_empty()) {
                format!("adapter {a}")
            } else {
                format!("theme map {}", item.get("entry").map(crate::cli::format::js_string).unwrap_or_default())
            };
            let mut m = Map::new();
            m.insert("set".into(), s.get("set").cloned().unwrap_or(Value::Null));
            m.insert("item".into(), Value::String(it));
            m.insert("reason".into(), item.get("reason").cloned().unwrap_or(Value::Null));
            unchecked.push(Value::Object(m));
        }
    }
    let mut out = Vec::new();
    if !unchecked.is_empty() {
        out.push(section("Not checked", None));
        out.push(recs(&unchecked, &["set", "item", "reason"]));
        out.push(text("The icon-set checks could not judge these; they are never counted and never fail a check."));
    }
    if !listed.is_empty() {
        out.push(section("Unmapped icon definitions (optional)", None));
        let rows: Vec<Value> = listed
            .iter()
            .map(|s| {
                let mut m = Map::new();
                m.insert("set".into(), s.get("set").cloned().unwrap_or(Value::Null));
                m.insert("unmapped".into(), Value::from(arr(s.get("unmappedDefinitions")).len() as u64));
                Value::Object(m)
            })
            .collect();
        out.push(recs(&rows, &["set", "unmapped"]));
        for s in &listed {
            let set_flag = if listed.len() == 1 { String::new() } else { format!(" --set {}", s.get("set").map(crate::cli::format::js_string).unwrap_or_default()) };
            let items: Vec<String> = arr(s.get("unmappedDefinitions"))
                .iter()
                .map(|d| {
                    let name = sv(d, "name").unwrap_or("");
                    let words: Vec<String> = arr(d.get("words")).iter().map(crate::cli::format::js_string).collect();
                    let sug = arr(s.get("suggestions")).iter().rev().find(|x| sv(x, "definition") == Some(name)).and_then(|x| x.get("icon"));
                    format!(
                        "{name}: {} Words: {}.{}",
                        d.get("description").map(crate::cli::format::js_string).unwrap_or_default(),
                        words.join(", "),
                        sug.map(|i| format!(" Suggested: astryx experimental icon map {name} {}{set_flag}", crate::cli::format::js_string(i))).unwrap_or_default()
                    )
                })
                .collect();
            out.push(list(&items));
        }
        out.push(text("Mapping these is optional and never fails a check. Map one with `astryx experimental icon map <definition> <icon id>`; list your icons with `astryx experimental icon --set <set> --all-icons`; see how many definitions each set maps with `astryx experimental icon --list`."));
    }
    out
}

/// `printIntegrationValidation(data, seen)`.
pub fn validation_blocks(data: &Value, seen: Option<&mut std::collections::HashSet<String>>) -> Vec<Block> {
    let issues = arr(data.get("issues"));
    let (errors, warnings) = summarize(issues);
    let mut out = vec![section(&format!("Validating integration: {}", label_of(data)), None)];
    if !issues.is_empty() {
        out.push(recs(&unseen(issues, seen), &["severity", "code", "message", "fix", "file", "line"]));
    } else {
        out.push(text("[ok] No integration issues found."));
    }
    for n in arr(data.get("notes")) {
        let next = crate::discovery::paths::js_truthy(n.get("next"));
        out.push(text(&format!(
            "note ({}): {}{}",
            n.get("code").map(crate::cli::format::js_string).unwrap_or_default(),
            if next { "[next minor] " } else { "" },
            n.get("message").map(crate::cli::format::js_string).unwrap_or_default()
        )));
    }
    out.push(text(&format!(
        "Summary: {errors} error{}, {warnings} warning{}",
        if errors == 1 { "" } else { "s" },
        if warnings == 1 { "" } else { "s" }
    )));
    out.extend(doc_types_blocks(data.get("docTypes"), errors > 0));
    out.extend(unchecked_list(
        data.get("docNames"),
        |n| format!("[info] Component names not checked: {n} doc(s) whose source exports this check cannot read:"),
        &["file", "name", "reason"],
    ));
    out.extend(unchecked_list(
        data.get("blockComponents"),
        |n| format!("[info] Block component names not checked: {n} name(s) this check could not judge:"),
        &["file", "name", "reason"],
    ));
    out.extend(icon_set_blocks(data.get("iconSets")));
    let older = arr(data.get("olderCliNotes"));
    if !older.is_empty() {
        out.push(section("Notes for older CLIs", None));
        out.push(recs(older, &["file", "kind", "message"]));
    }
    out.extend(unchecked_list(data.get("exampleAssets"), |n| format!("[info] Template assets not checked: {n}:"), &["file", "asset", "reason"]));
    out.extend(unchecked_list(data.get("publicImports"), |n| format!("[info] Imports not checked: {n}:"), &["file", "specifier", "reason"]));
    out
}

/// `printTemplateConflicts(data, seen)`.
pub fn template_blocks(data: &Value, seen: Option<&mut std::collections::HashSet<String>>) -> Vec<Block> {
    let issues = arr(data.get("issues"));
    let conflicts = arr(data.get("conflicts"));
    let mut out = vec![section(&format!("Checking integration templates: {}", label_of(data)), None)];
    out.extend(issue_blocks(issues, seen));
    if conflicts.is_empty() && issues.is_empty() {
        out.push(text("[ok] No template ids conflict with Core."));
    } else if !conflicts.is_empty() {
        let expanded = conflicts.iter().any(|c| c.get("relationship").is_some());
        let fields: &[&str] = if expanded {
            &["severity", "relationship", "id", "replaces", "integrationPackage", "integrationType", "integrationName", "message", "command"]
        } else {
            &["severity", "id", "integrationPackage", "integrationType", "integrationName", "message", "command"]
        };
        out.push(recs(conflicts, fields));
        out.push(text(&if expanded {
            format!("{} Core template relationship(s).", conflicts.len())
        } else {
            format!(
                "{} Core template conflict(s). Renaming is recommended but optional; keep the package-qualified command if the overlap is intentional.",
                conflicts.len()
            )
        }));
    }
    out
}

fn prop_drift_blocks(report: Option<&Value>, failed: bool) -> Vec<Block> {
    let Some(r) = report else { return vec![] };
    let js = |v: Option<&Value>| v.map(crate::cli::format::js_string).unwrap_or_else(|| "undefined".into());
    if sv(r, "status") == Some("skipped") {
        return vec![text(&format!("[skip] Props not compared: {}", js(r.get("reason"))))];
    }
    let findings = arr(r.get("findings"));
    let unchecked = arr(r.get("unchecked"));
    let not_checked = arr(r.get("propsNotChecked"));
    let comps = js(r.get("components"));
    let ts = js(r.get("typescript"));
    let mut blocks = Vec::new();
    if !findings.is_empty() {
        let mut seen: Vec<String> = Vec::new();
        for f in findings {
            let k = format!("{}\0{}", js(f.get("doc")), js(f.get("component")));
            if !seen.contains(&k) {
                seen.push(k);
            }
        }
        blocks.push(recs(
            findings,
            &["severity", "component", "prop", "kind", "message", "doc", "source", "docType", "codeType", "docRequired", "codeRequired", "docDefault", "codeDefault", "fix"],
        ));
        blocks.push(text(&format!(
            "{} prop(s) differ between the docs and the code in {} of {comps} component(s) compared (TypeScript {ts}). These are warnings: update the doc, or the code if the doc is right.",
            findings.len(),
            seen.len()
        )));
    }
    if !unchecked.is_empty() {
        blocks.push(text(&format!("[info] Props not compared for {} documented component(s):", unchecked.len())));
        blocks.push(recs(unchecked, &["component", "doc", "reason"]));
    }
    if !not_checked.is_empty() {
        blocks.push(text(&format!("[info] Props not checked for a doc entry in {} component(s):", not_checked.len())));
        blocks.push(recs(not_checked, &["component", "doc", "reason", "props"]));
    }
    if findings.is_empty() {
        let apart = if not_checked.is_empty() { "" } else { ", apart from the props not checked" };
        let n = r.get("components").and_then(|v| v.as_f64()).unwrap_or(0.0);
        blocks.push(text(&if !failed && n > 0.0 {
            format!("[ok] Documented prop names and required flags match the code in {comps} component(s){apart} (TypeScript {ts}).")
        } else {
            format!("[info] Props compared in {comps} component(s) (TypeScript {ts}).")
        }));
    }
    if crate::discovery::paths::js_truthy(r.get("typesSkipped")) {
        blocks.push(text(&format!("[skip] Prop types not judged: {}.", js(r.get("typesSkipped")))));
        return blocks;
    }
    let tnc = arr(r.get("typesNotCompared"));
    let not_compared: usize = tnc.iter().map(|e| arr(e.get("props")).len()).sum();
    blocks.push(text(&format!(
        "[info] Documented prop types judged: {}; not compared: {not_compared}. A type is judged when the doc writes it the same as the source (exactly, if it contains `readonly`), or when both are primitives, literals, arrays and unions of those, or names for them.",
        js(r.get("typesCompared"))
    )));
    if not_compared > 0 {
        blocks.push(recs(tnc, &["component", "doc", "reason", "props"]));
    }
    blocks
}

/// `printComponentConflicts(data, seen)`.
pub fn component_blocks(data: &Value, seen: Option<&mut std::collections::HashSet<String>>) -> Vec<Block> {
    let issues = arr(data.get("issues"));
    let conflicts = arr(data.get("conflicts"));
    let mut out = vec![section(&format!("Checking integration components: {}", label_of(data)), None)];
    out.extend(issue_blocks(issues, seen));
    let failed = issues.iter().any(|i| sv(i, "severity") == Some("error"));
    if conflicts.is_empty() {
        if !failed {
            out.push(text("[ok] No component names conflict with Core."));
        }
    } else {
        out.push(recs(conflicts, &["severity", "name", "integrationPackage", "message", "command"]));
        out.push(text(&format!(
            "{} Core component conflict(s). Renaming is recommended but optional; keep the package-qualified command if the overlap is intentional.",
            conflicts.len()
        )));
    }
    out.extend(prop_drift_blocks(data.get("propDrift"), failed));
    out
}

/// `printDocConflicts(data, seen)`.
pub fn doc_blocks(data: &Value, seen: Option<&mut std::collections::HashSet<String>>) -> Vec<Block> {
    let issues = arr(data.get("issues"));
    let shown: Vec<Value> = issues
        .iter()
        .filter(|i| !matches!(sv(i, "code"), Some("copied_passage" | "doc_fluff" | "stray_doc_pointer")))
        .cloned()
        .collect();
    let mut out = vec![section(&format!("Checking integration docs: {}", label_of(data)), None)];
    out.extend(issue_blocks(&shown, seen));
    let any_error = issues.iter().any(|i| sv(i, "severity") == Some("error"));
    if !issues.iter().any(|i| sv(i, "severity") == Some("error") || sv(i, "code") == Some("invalid_doc_graph")) {
        out.push(text("[ok] The docs tree and every link in these docs check out."));
    }
    let findings = arr(data.get("findings"));
    if findings.is_empty() {
        if !any_error {
            out.push(text("[ok] No doc topics overlap with Core."));
        }
    } else {
        out.push(recs(findings, &["severity", "topic", "relationship", "coreTopic", "message"]));
    }
    let copied = arr(data.get("copiedPassages"));
    if copied.is_empty() {
        if !any_error {
            out.push(text("[ok] No topic copies a passage from another."));
        }
    } else {
        out.push(text(&format!(
            "[warn] {} copied passage(s) (copied_passage): two topics say the same thing word for word. Keep the text in one and link to it from the other.",
            copied.len()
        )));
        out.push(recs(copied, &["topic", "section", "line", "otherTopic", "otherOwner", "owner", "text", "words", "passages", "message"]));
    }
    let fluff = arr(data.get("fluff"));
    if fluff.is_empty() {
        if !any_error {
            out.push(text("[ok] No filler phrases or low-density topics."));
        }
    } else {
        out.push(text(&format!(
            "[warn] {} fluff finding(s) (doc_fluff): words that add length, not meaning. Cut each one.",
            fluff.len()
        )));
        out.push(recs(fluff, &["topic", "kind", "phrase", "section", "file", "line", "density", "message"]));
    }
    let stray = arr(data.get("strayPointers"));
    if stray.is_empty() {
        if !any_error {
            out.push(text("[ok] Every pointer to a doc is a link."));
        }
    } else {
        out.push(text(&format!(
            "[warn] {} stray doc pointer(s) (stray_doc_pointer): a written `astryx docs <name>` where a link would be checked. Replace each with the link shown.",
            stray.len()
        )));
        out.push(recs(stray, &["topic", "section", "file", "line", "pointer", "link", "message"]));
    }
    out
}

/// `printIntegrationCheckResponse(response, seen)`: the blocks one check prints.
pub fn check_response_blocks(response: &Value, seen: Option<&mut std::collections::HashSet<String>>) -> Vec<Block> {
    let data = response.get("data").cloned().unwrap_or(Value::Null);
    match sv(response, "type") {
        Some("integration.validate") => validation_blocks(&data, seen),
        Some("integration.component-conflicts") => component_blocks(&data, seen),
        Some("integration.template-conflicts") => template_blocks(&data, seen),
        _ => doc_blocks(&data, seen),
    }
}

/// `--built` goes with `doctor` alone.
fn refuse_built(inv: &Invocation, out: &mut Out) -> Option<CmdResult> {
    let given = matches!(inv.parent_opt("doctor", "built"), Some(v) if !matches!(v, crate::cli::command::OptValue::Bool(false)));
    if given {
        Some(out.cli_error(
            "`--built` checks a finished build and goes with `doctor` alone, not with a `doctor integration` check",
            ErrorOpts::code("ERR_INVALID_OPTION"),
        ))
    } else {
        None
    }
}

fn emit_response(out: &mut Out, response: &Value) {
    out.json_out_response(response);
}

/// `astryx doctor integration validate [package]`.
pub fn run_validate(inv: &Invocation, out: &mut Out) -> CmdResult {
    if let Some(r) = refuse_built(inv, out) {
        return r;
    }
    let cwd = inv.cwd.to_string_lossy().into_owned();
    let response = validate::validate_integration(inv.arg(0).filter(|p| !p.is_empty()), &cwd);
    let data = response.get("data").cloned().unwrap_or(Value::Null);
    if inv.json() {
        emit_response(out, &response);
    } else if data.get("validated") != Some(&Value::Bool(true)) {
        let no_package = arr(data.get("issues")).iter().any(|i| sv(i, "code") == Some("no_package"));
        out.emit(&[text(&if no_package {
            "Nothing was validated: no package.json found. Run this command inside a package directory.".to_string()
        } else {
            format!(
                "Nothing was validated: no astryx.integration.* found next to package.json. To validate an installed integration: {}",
                super::env::fmt0("doctor integration validate <package>")
            )
        })]);
    } else {
        out.emit(&validation_blocks(&data, None));
    }
    if summarize(arr(data.get("issues"))).0 > 0 {
        out.exit_code = 1;
    }
    Ok(())
}

fn run_authoring(inv: &Invocation, out: &mut Out, kind: &str) -> CmdResult {
    if let Some(r) = refuse_built(inv, out) {
        return r;
    }
    let cwd = inv.cwd.to_string_lossy().into_owned();
    let response = match kind {
        "templates" => validate::template_conflicts(inv.arg(0).filter(|p| !p.is_empty()), &cwd),
        "components" => validate::component_conflicts(inv.arg(0).filter(|p| !p.is_empty()), &cwd),
        _ => validate::doc_conflicts(inv.arg(0).filter(|p| !p.is_empty()), &cwd),
    };
    let data = response.get("data").cloned().unwrap_or(Value::Null);
    if inv.json() {
        emit_response(out, &response);
    } else if data.get("validated") != Some(&Value::Bool(true)) {
        out.emit(&[text(&if crate::discovery::release::is_outside_project(&cwd) {
            "Nothing was checked: no astryx.integration.* found next to package.json, and this folder is outside a project.".to_string()
        } else {
            format!(
                "Nothing was checked: no astryx.integration.* found next to package.json. To check an installed integration: {}",
                super::env::fmt0(&format!("doctor integration {kind} <package>"))
            )
        })]);
    } else {
        out.emit(&check_response_blocks(&response, None));
    }
    let structural = summarize(arr(data.get("issues"))).0;
    let doc_errors = if kind == "docs" { arr(data.get("findings")).iter().filter(|f| sv(f, "severity") == Some("error")).count() } else { 0 };
    if structural > 0 || doc_errors > 0 {
        out.exit_code = 1;
    }
    Ok(())
}

pub fn run_templates(inv: &Invocation, out: &mut Out) -> CmdResult {
    run_authoring(inv, out, "templates")
}

pub fn run_components(inv: &Invocation, out: &mut Out) -> CmdResult {
    run_authoring(inv, out, "components")
}

pub fn run_docs(inv: &Invocation, out: &mut Out) -> CmdResult {
    run_authoring(inv, out, "docs")
}

#[allow(dead_code)]
fn unused(_: Fields, _: Block) {
    let _ = record(&[]);
}

/* ── the API `integration check` calls (local package at `cwd`) ── */

pub fn validate_integration(cwd: &std::path::Path) -> Value {
    validate::validate_integration(None, &cwd.to_string_lossy())
}
pub fn integration_component_conflicts(cwd: &std::path::Path) -> Value {
    validate::component_conflicts(None, &cwd.to_string_lossy())
}
pub fn integration_template_conflicts(cwd: &std::path::Path) -> Value {
    validate::template_conflicts(None, &cwd.to_string_lossy())
}
pub fn integration_doc_conflicts(cwd: &std::path::Path) -> Value {
    validate::doc_conflicts(None, &cwd.to_string_lossy())
}
pub fn summarize_issues(issues: &[Value]) -> (usize, usize) {
    summarize(issues)
}
pub fn print_integration_check_response(response: &Value, seen: &mut std::collections::HashSet<String>) -> Vec<Block> {
    check_response_blocks(response, Some(seen))
}
