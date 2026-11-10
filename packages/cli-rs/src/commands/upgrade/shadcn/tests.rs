//! Tests ported from the JavaScript CLI, with values recorded from it.

use super::source_variants::*;
use serde_json::Value;

#[test]
fn transform_matches_recorded_cases() {
    let cases: Vec<Value> = serde_json::from_str(include_str!("testdata/transform_cases.json")).unwrap();
    let mut bad = Vec::new();
    for (i, c) in cases.iter().enumerate() {
        let src = c["src"].as_str().unwrap();
        let got = transform(src);
        match (c.get("out").and_then(|v| v.as_str()), got) {
            (Some(want), Ok(got)) if want == got => {}
            (None, Err(_)) => {}
            (want, got) => bad.push(format!("#{i} {src:?}\n  want {want:?}\n  got  {got:?}")),
        }
    }
    assert!(bad.is_empty(), "{} of {} differ:\n{}", bad.len(), cases.len(), bad.join("\n"));
}
