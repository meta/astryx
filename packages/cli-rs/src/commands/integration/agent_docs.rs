//! The `agentDocs` manifest field schema (`authoring/integration/schema.mjs`).

use crate::json::Value;

const MAX_LINES: usize = 8;
const MAX_LINE_CODE_POINTS: usize = 240;

fn js_trim(s: &str) -> &str {
    let ws = |c: char| c.is_whitespace() || c == '\u{FEFF}';
    s.trim_matches(ws)
}

/// Why one agent-doc line is invalid, or None.
pub fn invalid_line(value: &str) -> Option<String> {
    if value.is_empty() || js_trim(value).is_empty() {
        return Some("must not be blank".into());
    }
    if value != js_trim(value) {
        return Some("must not have surrounding whitespace".into());
    }
    for c in value.chars() {
        let cp = c as u32;
        if cp == 0 {
            return Some("must not contain NUL".into());
        }
        if cp == 0x2028 || cp == 0x2029 {
            return Some("must be a single line".into());
        }
        if cp <= 0x1f || (0x7f..=0x9f).contains(&cp) {
            return Some("must not contain control characters or line separators".into());
        }
    }
    if ["ASTRYX:START", "ASTRYX:END", "XDS:START", "XDS:END"].iter().any(|m| value.contains(m)) {
        return Some("must not contain managed marker text".into());
    }
    let n = value.chars().count();
    if n > MAX_LINE_CODE_POINTS {
        return Some(format!("must contain at most {MAX_LINE_CODE_POINTS} Unicode code points (received {n})"));
    }
    None
}

fn received(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn issues_of_append(lines: &[Value]) -> Vec<String> {
    let mut issues = Vec::new();
    for (i, l) in lines.iter().enumerate() {
        match l {
            Value::String(s) => {
                if let Some(m) = invalid_line(s) {
                    issues.push(format!("append.{i}: {m}"));
                }
            }
            other => issues.push(format!("append.{i}: Invalid input: expected string, received {}", received(other))),
        }
    }
    if lines.len() > MAX_LINES {
        issues.push(format!("append: append may contain at most {MAX_LINES} lines"));
    }
    issues
}

/// `parseAgentDocsField({append: lines}, label)`: Err is the message.
pub fn check_append(lines: &[String], label: &str) -> Result<(), String> {
    let vals: Vec<Value> = lines.iter().cloned().map(Value::String).collect();
    let issues = issues_of_append(&vals);
    if issues.is_empty() {
        Ok(())
    } else {
        Err(format!("{label} is invalid: {}", issues.join("; ")))
    }
}

/// `parseAgentDocsField(value, label)` for any value.
pub fn check_field(v: &Value, label: &str) -> Result<(), String> {
    let issues = match v {
        Value::Object(m) => match m.get("append") {
            None => Vec::new(),
            Some(Value::Array(a)) => issues_of_append(a),
            Some(other) => vec![format!("append: Invalid input: expected array, received {}", received(other))],
        },
        other => vec![format!("(root): Invalid input: expected object, received {}", received(other))],
    };
    if issues.is_empty() {
        Ok(())
    } else {
        Err(format!("{label} is invalid: {}", issues.join("; ")))
    }
}
