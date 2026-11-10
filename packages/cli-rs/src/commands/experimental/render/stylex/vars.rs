//! `stylex.defineVars` (static values) and the names other modules read
//! its variables by.

use super::{hash, Rule, StylexError};
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};

/// `getCanonicalFilePath(file)` with `rootDir`.
pub fn canonical_file_path(file: &str, root_dir: &str) -> String {
    let mut folder = np::dirname(file);
    loop {
        let pj = np::join2(&folder, "package.json");
        if np::exists(&pj) {
            let name = std::fs::read_to_string(&pj).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|v| v.get("name").and_then(|n| n.as_str()).map(String::from));
            // `${name}:${relative}`; an unnamed package prints "undefined".
            return format!("{}:{}", name.unwrap_or_else(|| "undefined".into()), np::relative(&folder, file));
        }
        let up = np::dirname(&folder);
        if up == folder {
            break;
        }
        folder = up;
    }
    np::relative(root_dir, file)
}

pub fn var_group_hash(file_name: &str, export_name: &str) -> String {
    format!("x{}", hash(&format!("{file_name}//{export_name}")))
}

pub fn var_ref(file_name: &str, export_name: &str, key: &str) -> String {
    if key.starts_with("--") {
        return format!("var({key})");
    }
    format!("var(--x{})", hash(&format!("{file_name}//{export_name}.{key}")))
}

fn collect(name_hash: &str, value: &Value, at_rules: &[String], out: &mut Vec<(String, Vec<String>)>) -> Result<(), StylexError> {
    match value {
        Value::String(_) | Value::Number(_) => {
            let v = match value {
                Value::Number(n) => crate::json::js_number_to_string(n.as_f64().unwrap_or(0.0)),
                Value::String(s) => s.clone(),
                _ => unreachable!(),
            };
            let key = if at_rules.is_empty() {
                "default".to_string()
            } else {
                let mut a = at_rules.to_vec();
                a.sort_by(|x, y| crate::discovery::jsort::cmp_utf16(x, y));
                a.join("__$$__")
            };
            match out.iter_mut().find(|(k, _)| *k == key) {
                Some((_, l)) => l.push(format!("--{name_hash}:{v};")),
                None => out.push((key, vec![format!("--{name_hash}:{v};")])),
            }
            Ok(())
        }
        Value::Null => Ok(()),
        Value::Array(_) => Err(StylexError("Array is not supported in defineVars".into())),
        Value::Object(o) => {
            if !o.contains_key("default") {
                return Err(StylexError("Default value is not defined for variable.".into()));
            }
            for (at, v) in o {
                let mut next = at_rules.to_vec();
                if at != "default" {
                    next.push(at.clone());
                }
                collect(name_hash, v, &next, out)?;
            }
            Ok(())
        }
        _ => Err(StylexError("Invalid value in defineVars".into())),
    }
}

/// `styleXDefineVars(variables, {exportId})`: the object the call becomes
/// (as JS text), and the rules.
pub fn define_vars(variables: &Map<String, Value>, file_name: &str, export_name: &str) -> Result<(String, Vec<Rule>), StylexError> {
    let group = var_group_hash(file_name, export_name);
    let export_id = format!("{file_name}//{export_name}");
    let mut by_at: Vec<(String, Vec<String>)> = vec![];
    let mut obj: Vec<(String, String)> = vec![];
    for (key, value) in variables {
        let name_hash = if let Some(k) = key.strip_prefix("--") { k.to_string() } else { format!("x{}", hash(&format!("{export_id}.{key}"))) };
        collect(&name_hash, value, &[], &mut by_at)?;
        obj.push((key.clone(), format!("var(--{name_hash})")));
    }
    let mut rules = vec![];
    for (at, decls) in by_at {
        let suffix = if at == "default" { String::new() } else { format!("-{}", hash(&at)) };
        let mut ltr = format!(":root, .{group}{{{}}}", decls.concat());
        if at != "default" {
            for a in at.split("__$$__") {
                ltr = format!("{a}{{{ltr}}}");
            }
        }
        let priority = (if at == "default" { 1.0 } else { 1.0 + at.split("__$$__").count() as f64 }) / 10.0;
        rules.push(Rule { class: format!("{group}{suffix}"), ltr, rtl: None, priority });
    }
    let q = |s: &str| {
        let mut o = String::new();
        crate::json::quote(&mut o, s);
        o
    };
    let mut parts: Vec<String> = obj.iter().map(|(k, v)| format!("{}: {}", q(k), q(v))).collect();
    parts.push(format!("__varGroupHash__: {}", q(&group)));
    Ok((format!("{{{}}}", parts.join(", ")), rules))
}
