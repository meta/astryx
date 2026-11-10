//! Dev tool: for each {source, mode} in a JSON array on stdin, print
//! {ast, roundtrip} as one JSON line.
use astryx_rs::commands::upgrade::recast::*;
fn main() {
    let input = std::io::read_to_string(std::io::stdin()).unwrap();
    let items: Vec<serde_json::Value> = serde_json::from_str(&input).unwrap();
    for it in items {
        let src = it["source"].as_str().unwrap();
        let mode = if it["mode"] == "babel" { Mode::Estree } else { Mode::Babel };
        let mut ast = Ast::new();
        let out = match parse(&mut ast, src, mode) {
            Ok(p) => {
                let prog = ast.child(p.file, "program").unwrap();
                let orig = ast.node(prog).original.unwrap();
                let rt = to_source(&ast, p.file, Config::default());
                serde_json::json!({"ast": debug_json(&ast, orig), "roundtrip": rt})
            }
            Err(e) => serde_json::json!({"error": e.message, "line": e.line, "column": e.column}),
        };
        println!("{}", out);
    }
}
