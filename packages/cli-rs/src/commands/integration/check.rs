//! `integrationCheck` (`api/integration/check/check.mjs`) and the
//! `integration check` printer: every `doctor integration` check in one call.

use crate::json::{Map, Value};
use std::collections::HashMap;
use std::path::Path;

pub const NO_MANIFEST_SKIP: &str = "No astryx.integration.* found next to package.json, so nothing was checked.";
pub const NO_MANIFEST_CODE: &str = "missing_manifest";

fn check_of_type(t: &str) -> &'static str {
    match t {
        "integration.validate" => "validate",
        "integration.component-conflicts" => "components",
        "integration.template-conflicts" => "templates",
        _ => "docs",
    }
}

fn conflict_code(check: &str) -> Option<&'static str> {
    match check {
        "components" => Some("component_name_conflict"),
        "templates" => Some("template_id_conflict"),
        _ => None,
    }
}

/// `skippedCode(key)`: `propDrift` -> `prop_drift_skipped`.
pub fn skipped_code(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    let mut out = String::new();
    for (i, c) in chars.iter().enumerate() {
        if c.is_ascii_uppercase() && i > 0 && (chars[i - 1].is_ascii_lowercase() || chars[i - 1].is_ascii_digit()) {
            out.push('_');
        }
        out.push(*c);
    }
    format!("{}_skipped", out.to_lowercase())
}

pub fn is_check_report(v: &Value) -> bool {
    let Some(o) = v.as_object() else { return false };
    matches!(o.get("status").and_then(|s| s.as_str()), Some("checked") | Some("skipped")) && o.get("findings").map(|f| f.is_array()).unwrap_or(false)
}

/// `asIssue(finding, code)`.
fn as_issue(f: &Value, code: &str) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("code".into(), Value::String(code.into()));
    let msg = match f.get("message") {
        None | Some(Value::Null) => String::new(),
        Some(v) => crate::cli::format::js_string(v),
    };
    m.insert("message".into(), Value::String(msg));
    for k in ["component", "prop", "fix"] {
        if let Some(Value::String(s)) = f.get(k) {
            m.insert(k.into(), Value::String(s.clone()));
        }
    }
    let file = [f.get("file"), f.get("doc"), f.get("source")]
        .into_iter()
        .find(|v| !matches!(v, None | Some(Value::Null)))
        .flatten();
    if let Some(Value::String(s)) = file {
        m.insert("file".into(), Value::String(s.clone()));
    }
    if let Some(n @ Value::Number(_)) = f.get("line") {
        m.insert("line".into(), n.clone());
    }
    m
}

fn str_of<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(|x| x.as_str())
}

fn arr<'a>(v: &'a Value, k: &str) -> &'a [Value] {
    v.get(k).and_then(|x| x.as_array()).map(|a| a.as_slice()).unwrap_or(&[])
}

/// `strictIssues(check, response, {noPackage})`.
pub fn strict_issues(check: &str, response: &Value, no_package_ctx: bool) -> (Vec<Map<String, Value>>, Vec<Map<String, Value>>) {
    let data = &response["data"];
    let mut warnings = Vec::new();
    for issue in arr(data, "issues") {
        if str_of(issue, "severity") == Some("warning") {
            warnings.push(as_issue(issue, str_of(issue, "code").unwrap_or("")));
        }
    }
    if let Some(cc) = conflict_code(check) {
        for c in arr(data, "conflicts") {
            if str_of(c, "severity") == Some("warning") {
                warnings.push(as_issue(c, cc));
            }
        }
    }
    for f in arr(data, "findings") {
        if str_of(f, "severity") == Some("warning") {
            let code = str_of(f, "code").or_else(|| str_of(f, "relationship")).unwrap_or("");
            warnings.push(as_issue(f, code));
        }
    }
    let mut skipped = Vec::new();
    let no_package = no_package_ctx || arr(data, "issues").iter().any(|i| str_of(i, "code") == Some("no_package"));
    if data.get("validated") != Some(&Value::Bool(true)) && !no_package {
        let mut m = Map::new();
        m.insert("code".into(), Value::String(NO_MANIFEST_CODE.into()));
        m.insert("message".into(), Value::String(NO_MANIFEST_SKIP.into()));
        skipped.push(m);
    }
    if let Some(obj) = data.as_object() {
        for (key, value) in obj {
            if !is_check_report(value) {
                continue;
            }
            if str_of(value, "status") == Some("skipped") {
                let mut m = Map::new();
                m.insert("code".into(), Value::String(skipped_code(key)));
                let msg = match value.get("reason") {
                    None | Some(Value::Null) => format!("{key} did not run"),
                    Some(v) => crate::cli::format::js_string(v),
                };
                m.insert("message".into(), Value::String(msg));
                skipped.push(m);
                continue;
            }
            for f in arr(value, "findings") {
                let sev = str_of(f, "severity").unwrap_or("warning");
                if sev != "warning" {
                    continue;
                }
                let code = str_of(f, "code").or_else(|| str_of(f, "problem")).or_else(|| str_of(f, "kind")).unwrap_or("");
                warnings.push(as_issue(f, code));
            }
            if let Some(Value::String(t)) = value.get("typesSkipped") {
                let mut m = Map::new();
                m.insert("code".into(), Value::String("prop_types_skipped".into()));
                m.insert("message".into(), Value::String(format!("prop types not judged: {t}")));
                skipped.push(m);
            }
        }
    }
    (warnings, skipped)
}

fn count_errors(issues: &[Value]) -> usize {
    issues.iter().filter(|i| str_of(i, "severity") == Some("error")).count()
}

/// `summarizeCheck(response, {noPackage})`.
fn summarize_check(response: &Value, no_package: bool) -> (usize, usize, Vec<String>, bool) {
    let check = check_of_type(str_of(response, "type").unwrap_or(""));
    let data = &response["data"];
    let mut errors = count_errors(arr(data, "issues"));
    if str_of(response, "type") == Some("integration.doc-conflicts") {
        errors += arr(data, "findings").iter().filter(|f| str_of(f, "severity") == Some("error")).count();
    }
    let (w, s) = strict_issues(check, response, no_package);
    let skipped = s.iter().map(|m| m["message"].as_str().unwrap_or("").to_string()).collect();
    (errors, w.len(), skipped, errors > 0)
}

fn key_of(kind: &str, issue: &Map<String, Value>) -> String {
    format!("{kind}\0{}", crate::json::stringify(&Value::Object(issue.clone()), 0))
}

/// `integrationCheck({strict, next})` given the four responses.
pub fn combine(responses: Vec<Value>, strict: bool, next: bool) -> Value {
    let validation = responses[0].clone();
    let no_package = arr(&validation["data"], "issues").iter().any(|i| str_of(i, "code") == Some("no_package"));
    let mut checks: Vec<Map<String, Value>> = responses
        .iter()
        .map(|r| {
            let (e, w, s, f) = summarize_check(r, no_package);
            let mut m = Map::new();
            m.insert("check".into(), Value::String(check_of_type(str_of(r, "type").unwrap_or("")).into()));
            m.insert("errors".into(), Value::from(e as u64));
            m.insert("warnings".into(), Value::from(w as u64));
            m.insert("skipped".into(), Value::Array(s.into_iter().map(Value::String).collect()));
            m.insert("failed".into(), Value::Bool(f));
            m.insert("response".into(), r.clone());
            m
        })
        .collect();
    let validate_found = strict_issues("validate", &validation, no_package);
    let mut from_validate: HashMap<String, usize> = HashMap::new();
    let mut keys = Vec::new();
    for i in arr(&validation["data"], "issues") {
        if str_of(i, "severity") == Some("error") {
            keys.push(key_of("error", &as_issue(i, str_of(i, "code").unwrap_or(""))));
        }
    }
    keys.extend(validate_found.0.iter().map(|i| key_of("warning", i)));
    keys.extend(validate_found.1.iter().map(|i| key_of("skipped", i)));
    for k in keys {
        *from_validate.entry(k).or_insert(0) += 1;
    }
    let (mut errors, mut warnings, mut unchecked) = (0usize, 0usize, 0usize);
    let mut skipped: Vec<String> = Vec::new();
    let mut failures: Vec<Value> = Vec::new();
    for (index, r) in responses.iter().enumerate() {
        let check = check_of_type(str_of(r, "type").unwrap_or(""));
        let mut repeats: HashMap<String, usize> = if index == 0 { HashMap::new() } else { from_validate.clone() };
        let mut is_repeat = |k: &str| -> bool {
            match repeats.get_mut(k) {
                Some(n) if *n > 0 => {
                    *n -= 1;
                    true
                }
                _ => false,
            }
        };
        for i in arr(&r["data"], "issues") {
            if str_of(i, "severity") == Some("error") && !is_repeat(&key_of("error", &as_issue(i, str_of(i, "code").unwrap_or("")))) {
                errors += 1;
            }
        }
        if str_of(r, "type") == Some("integration.doc-conflicts") {
            errors += arr(&r["data"], "findings").iter().filter(|f| str_of(f, "severity") == Some("error")).count();
        }
        if let Some(obj) = r["data"].as_object() {
            for v in obj.values() {
                if is_check_report(v) {
                    if let Some(Value::Array(l)) = v.get("unchecked") {
                        unchecked += l.len();
                    }
                }
            }
        }
        let found = if index == 0 { validate_found.clone() } else { strict_issues(check, r, no_package) };
        let tagged = |issue: &Map<String, Value>| {
            let mut m = Map::new();
            m.insert("check".into(), Value::String(check.into()));
            m.insert("severity".into(), Value::String("error".into()));
            for (k, v) in issue {
                m.insert(k.clone(), v.clone());
            }
            Value::Object(m)
        };
        for issue in &found.0 {
            if is_repeat(&key_of("warning", issue)) {
                continue;
            }
            warnings += 1;
            if strict {
                failures.push(tagged(issue));
            }
        }
        for issue in &found.1 {
            if is_repeat(&key_of("skipped", issue)) {
                continue;
            }
            skipped.push(format!("{check}: {}", issue["message"].as_str().unwrap_or("")));
            if strict {
                failures.push(tagged(issue));
            }
        }
    }
    let notes = arr(&validation["data"], "notes");
    let upcoming: Vec<&Value> = notes.iter().filter(|n| n.get("next") == Some(&Value::Bool(true))).collect();
    if next {
        warnings += upcoming.len();
        let w = checks[0]["warnings"].as_u64().unwrap_or(0) + upcoming.len() as u64;
        checks[0].insert("warnings".into(), Value::from(w));
        if strict {
            for n in &upcoming {
                let mut m = Map::new();
                m.insert("check".into(), Value::String("validate".into()));
                m.insert("severity".into(), Value::String("error".into()));
                m.insert("code".into(), n.get("code").cloned().unwrap_or(Value::Null));
                m.insert("message".into(), n.get("message").cloned().unwrap_or(Value::Null));
                failures.push(Value::Object(m));
            }
        }
    }
    let failed = checks.iter().any(|c| c["failed"] == Value::Bool(true)) || !failures.is_empty();
    let vd = &validation["data"];
    let mut data = Map::new();
    data.insert("validated".into(), vd.get("validated").cloned().unwrap_or(Value::Bool(false)));
    data.insert("name".into(), vd.get("name").cloned().unwrap_or(Value::Null));
    data.insert("version".into(), vd.get("version").cloned().unwrap_or(Value::Null));
    data.insert("strict".into(), Value::Bool(strict));
    data.insert("next".into(), Value::Bool(next));
    data.insert("checks".into(), Value::Array(checks.into_iter().map(Value::Object).collect()));
    data.insert("errors".into(), Value::from(errors as u64));
    data.insert("warnings".into(), Value::from(warnings as u64));
    data.insert("skipped".into(), Value::Array(skipped.into_iter().map(Value::String).collect()));
    data.insert("unchecked".into(), Value::from(unchecked as u64));
    data.insert("upcoming".into(), Value::from(upcoming.len() as u64));
    data.insert("failures".into(), Value::Array(failures));
    data.insert("failed".into(), Value::Bool(failed));
    let mut out = Map::new();
    out.insert("type".into(), Value::String("integration.check".into()));
    out.insert("data".into(), Value::Object(data));
    Value::Object(out)
}

/// The four responses, from the doctor command's integration checks.
pub fn run_checks(cwd: &Path) -> Vec<Value> {
    use crate::commands::doctor::integration as d;
    vec![
        d::validate_integration(cwd),
        d::integration_component_conflicts(cwd),
        d::integration_template_conflicts(cwd),
        d::integration_doc_conflicts(cwd),
    ]
}
