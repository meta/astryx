//! The catalog schema check from `authoring/discover/parse.mjs`, with zod 4's
//! first-issue path and message.

use crate::json::Value;

type Issue = (Vec<String>, String);

fn received(v: Option<&Value>) -> &'static str {
    match v {
        None => "undefined",
        Some(Value::Null) => "null",
        Some(Value::Bool(_)) => "boolean",
        Some(Value::Number(_)) => "number",
        Some(Value::String(_)) => "string",
        Some(Value::Array(_)) => "array",
        Some(Value::Object(o)) => match o.get("__js").and_then(|k| k.as_str()) {
            Some("undefined") => "undefined",
            Some("function") => "function",
            _ => "object",
        },
    }
}

fn err(path: &[String], msg: String) -> Result<(), Issue> {
    Err((path.to_vec(), msg))
}

fn expected(path: &[String], what: &str, v: Option<&Value>) -> Result<(), Issue> {
    err(path, format!("Invalid input: expected {what}, received {}", received(v)))
}

fn string(path: &[String], v: Option<&Value>, min: usize, max: usize) -> Result<(), Issue> {
    match v {
        Some(Value::String(s)) => {
            let n = s.encode_utf16().count();
            if n < min {
                return err(path, format!("Too small: expected string to have >={min} characters"));
            }
            if n > max {
                return err(path, format!("Too big: expected string to have <={max} characters"));
            }
            Ok(())
        }
        other => expected(path, "string", other),
    }
}

fn opt_string(path: &[String], v: Option<&Value>, max: usize) -> Result<(), Issue> {
    if v.is_none() {
        return Ok(());
    }
    string(path, v, 0, max)
}

/// The array's type. Its length check runs after its items, as zod runs a
/// schema's checks after its parse: an item's issue comes first.
fn array<'a>(path: &[String], v: Option<&'a Value>) -> Result<&'a Vec<Value>, Issue> {
    match v {
        Some(Value::Array(a)) => Ok(a),
        other => Err((path.to_vec(), format!("Invalid input: expected array, received {}", received(other)))),
    }
}

fn max_items(path: &[String], a: &[Value], max: usize) -> Result<(), Issue> {
    if a.len() > max {
        return err(path, format!("Too big: expected array to have <={max} items"));
    }
    Ok(())
}

fn object<'a>(path: &[String], v: Option<&'a Value>) -> Result<&'a crate::json::Map<String, Value>, Issue> {
    match v {
        Some(Value::Object(o)) if !o.contains_key("__js") => Ok(o),
        other => Err((path.to_vec(), format!("Invalid input: expected object, received {}", received(other)))),
    }
}

fn child(path: &[String], k: impl ToString) -> Vec<String> {
    let mut p = path.to_vec();
    p.push(k.to_string());
    p
}

fn string_array(path: &[String], v: Option<&Value>, item_max: usize, max: usize, item_min: usize) -> Result<(), Issue> {
    let a = array(path, v)?;
    for (i, x) in a.iter().enumerate() {
        string(&child(path, i), Some(x), item_min, item_max)?;
    }
    max_items(path, a, max)
}

/// Check `value` against the catalog schema. `icon_sets` keeps the icon-set
/// item fields; without it they are dropped before the check.
pub fn check_catalog(value: &Value, icon_sets: bool) -> Result<(), Issue> {
    let root: Vec<String> = vec![];
    let o = object(&root, Some(value))?;
    let sv = child(&root, "schemaVersion");
    if o.get("schemaVersion") != Some(&Value::from(1)) {
        return err(&sv, "Invalid input: expected 1".into());
    }
    let sp = child(&root, "source");
    let s = object(&sp, o.get("source"))?;
    string(&child(&sp, "name"), s.get("name"), 1, 256)?;
    string(&child(&sp, "generatedAt"), s.get("generatedAt"), 1, 64)?;
    match s.get("complete") {
        Some(Value::Bool(_)) => {}
        other => expected(&child(&sp, "complete"), "boolean", other)?,
    }
    let pp = child(&root, "packages");
    let pkgs = array(&pp, o.get("packages"))?;
    for (i, p) in pkgs.iter().enumerate() {
        let path = child(&pp, i);
        let p = object(&path, Some(p))?;
        string(&child(&path, "package"), p.get("package"), 1, 214)?;
        string(&child(&path, "integration"), p.get("integration"), 1, 214)?;
        string_array(&child(&path, "aliases"), p.get("aliases"), 214, 64, 1)?;
        opt_string(&child(&path, "description"), p.get("description"), 1024)?;
        match p.get("latest") {
            Some(Value::Null) => {}
            other => string(&child(&path, "latest"), other, 1, 256)?,
        }
        let vp = child(&path, "versions");
        let versions = array(&vp, p.get("versions"))?;
        for (j, v) in versions.iter().enumerate() {
            let vpath = child(&vp, j);
            let v = object(&vpath, Some(v))?;
            string(&child(&vpath, "version"), v.get("version"), 1, 256)?;
            match v.get("publishedAt") {
                Some(Value::Null) => {}
                other => string(&child(&vpath, "publishedAt"), other, 0, 64)?,
            }
            match v.get("prerelease") {
                Some(Value::Bool(_)) => {}
                other => expected(&child(&vpath, "prerelease"), "boolean", other)?,
            }
            string(&child(&vpath, "status"), v.get("status"), 1, 64)?;
        }
        max_items(&vp, versions, 50_000)?;
        let cp = child(&path, "contributions");
        let contributions = array(&cp, p.get("contributions"))?;
        for (j, c) in contributions.iter().enumerate() {
            let cpath = child(&cp, j);
            let c = object(&cpath, Some(c))?;
            string(&child(&cpath, "kind"), c.get("kind"), 1, 32)?;
            string(&child(&cpath, "name"), c.get("name"), 1, 512)?;
            opt_string(&child(&cpath, "title"), c.get("title"), 512)?;
            opt_string(&child(&cpath, "summary"), c.get("summary"), 4096)?;
            if c.get("keywords").is_some() {
                string_array(&child(&cpath, "keywords"), c.get("keywords"), 128, 64, 0)?;
            }
            if icon_sets {
                if let Some(n) = c.get("iconCount") {
                    let ip = child(&cpath, "iconCount");
                    match n {
                        Value::Number(x) => {
                            let f = x.as_f64().unwrap_or(0.0);
                            if f.fract() != 0.0 {
                                err(&ip, "Invalid input: expected int, received number".into())?;
                            }
                            if f < 0.0 {
                                err(&ip, "Too small: expected number to be >=0".into())?;
                            }
                        }
                        other => expected(&ip, "number", Some(other))?,
                    }
                }
                if c.get("definitions").is_some() {
                    string_array(&child(&cpath, "definitions"), c.get("definitions"), 128, 2048, 0)?;
                }
            }
        }
        max_items(&cp, contributions, 50_000)?;
    }
    max_items(&pp, pkgs, 20_000)?;
    Ok(())
}
