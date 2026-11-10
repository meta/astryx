//! Runs every recorded transform fixture (input, options, expected output
//! from the JavaScript codemods) through the native transforms.

use super::transforms;
use std::path::Path;

pub struct Outcome {
    pub pass: usize,
    pub total: usize,
    pub failures: Vec<String>,
    pub missing: Vec<String>,
}

pub fn run_all(filter: Option<&str>) -> Outcome {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/commands/upgrade/fixtures");
    let mut files: Vec<_> = std::fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().map(|x| x == "json").unwrap_or(false)).collect();
    files.sort();
    let mut out = Outcome { pass: 0, total: 0, failures: vec![], missing: vec![] };
    for f in files {
        let cases: Vec<serde_json::Value> = serde_json::from_str(&std::fs::read_to_string(&f).unwrap()).unwrap();
        for c in cases {
            let name = c["transform"].as_str().unwrap().to_string();
            if let Some(fl) = filter {
                if !name.contains(fl) {
                    continue;
                }
            }
            out.total += 1;
            let t = match transforms::get(&name) {
                Some(t) => t,
                None => {
                    if !out.missing.contains(&name) {
                        out.missing.push(name.clone());
                    }
                    continue;
                }
            };
            let source = c["source"].as_str().unwrap();
            let path = c["path"].as_str().unwrap_or("test.tsx");
            let res = std::panic::catch_unwind(|| t(source, path, &c["options"]));
            let expected_err = c["error"].as_str();
            let ok = match &res {
                Ok(Ok(got)) => expected_err.is_none() && got.as_deref() == c["output"].as_str(),
                Ok(Err(e)) => expected_err == Some(e.message.as_str()) || (expected_err.is_some() && e.parse),
                Err(_) => false,
            };
            if ok {
                out.pass += 1;
            } else {
                let got = match res {
                    Ok(Ok(g)) => format!("{:?}", g),
                    Ok(Err(e)) => format!("ERR {}", e.message),
                    Err(_) => "PANIC".into(),
                };
                out.failures.push(format!("{}\n  input: {:?}\n  want:  {:?}{}\n  got:   {}", name, source, c["output"].as_str(), expected_err.map(|e| format!(" ERR {}", e)).unwrap_or_default(), got));
            }
        }
    }
    out
}

#[test]
fn transform_fixtures() {
    let filter = std::env::var("FIXTURE_FILTER").ok();
    let o = run_all(filter.as_deref());
    for f in o.failures.iter().take(std::env::var("SHOW").ok().and_then(|s| s.parse().ok()).unwrap_or(5)) {
        eprintln!("FAIL {}", f);
    }
    eprintln!("missing transforms: {}", o.missing.len());
    eprintln!("fixtures: {}/{} pass", o.pass, o.total);
    assert_eq!(o.pass, o.total);
}
