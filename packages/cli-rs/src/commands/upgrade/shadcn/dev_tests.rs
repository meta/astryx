//! Corpus checks against values recorded from the JavaScript CLI. They need
//! the recorded files, so they are ignored by default:
//! `SHADCN_CORPUS=<dir> cargo test --release shadcn::dev_tests -- --ignored`.

use super::source_variants::*;
use crate::commands::upgrade::recast::{self, Ast, Mode};
use serde_json::Value;

fn corpus(name: &str) -> Option<Vec<Value>> {
    let dir = std::env::var("SHADCN_CORPUS").ok()?;
    let text = std::fs::read_to_string(format!("{dir}/{name}")).ok()?;
    serde_json::from_str::<Value>(&text).ok()?.as_array().cloned()
}

fn program_json(src: &str) -> String {
    let mut ast = Ast::new();
    match recast::parse(&mut ast, src, Mode::Babel) {
        Ok(p) => {
            let prog = ast.child(p.file, "program").unwrap();
            normalized_json(&ast, prog)
        }
        Err(e) => format!("ERR {}", e.message),
    }
}

fn first_diff(a: &str, b: &str) -> String {
    let i = a.bytes().zip(b.bytes()).take_while(|(x, y)| x == y).count();
    let lo = i.saturating_sub(150);
    let cut = |s: &str| s.get(lo..(i + 150).min(s.len())).unwrap_or("").to_string();
    format!("want …{}…\n got …{}…", cut(a), cut(b))
}

#[test]
#[ignore]
fn converter_matches_babel_shape() {
    let Some(src) = corpus("corpus.json") else { return };
    let asts = corpus("corpus_ast.json").unwrap();
    let mut bad = 0;
    for (s, a) in src.iter().zip(asts.iter()) {
        for (key, akey) in [("src", "src"), ("out", "out")] {
            let text = s[key].as_str().unwrap();
            let want_full: Value = serde_json::from_str(a[akey].as_str().unwrap()).unwrap_or(Value::Null);
            let want = serde_json::to_string(&want_full["program"]).unwrap();
            let got = program_json(text);
            let got_v: Value = serde_json::from_str(&got).unwrap_or(Value::Null);
            if got_v != want_full["program"] {
                bad += 1;
                if bad <= 8 {
                    eprintln!("== {} [{key}]\n{}", s["path"], first_diff(&want, &serde_json::to_string(&got_v).unwrap()));
                }
            }
        }
    }
    eprintln!("shape mismatches: {bad} of {}", src.len() * 2);
    assert_eq!(bad, 0);
}

#[test]
#[ignore]
fn transform_matches_corpus() {
    let Some(src) = corpus("corpus.json") else { return };
    let mut bad = 0;
    for s in &src {
        let text = s["src"].as_str().unwrap();
        let want = s["out"].as_str().unwrap_or("");
        let got = transform(text).unwrap_or_else(|e| format!("ERR {e}"));
        if got != want {
            bad += 1;
            if bad <= 6 {
                eprintln!("== {}\n{}", s["path"], first_diff(want, &got));
            }
        }
    }
    eprintln!("transform mismatches: {bad} of {}", src.len());
    assert_eq!(bad, 0);
}

#[test]
#[ignore]
fn dump_snippet() {
    let Ok(src) = std::env::var("SNIPPET") else { return };
    let mut ast = Ast::new();
    let p = recast::parse(&mut ast, &src, Mode::Babel).unwrap();
    std::fs::write("/tmp/u3dump.json", serde_json::to_string(&recast::debug_json(&ast, p.file)).unwrap()).unwrap();
}
