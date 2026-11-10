//! Compares the manifest writer with recorded recast output. Cases live in
//! `testdata/writer` (or the folder named by `INTEGRATION_WRITER_CASES`): `<n>.src`, `<n>.op`
//! (`root <key> <value>` or `agent <line>`), and `<n>.out`.

use super::manifest_writer::*;

pub fn apply_op(src: &str, op: &str) -> String {
    let (mode, rest) = op.split_once(' ').unwrap();
    let r = if mode == "root" {
        let (k, v) = rest.split_once(' ').unwrap();
        patch_root_source(src, "astryx.integration.mjs", k, v)
    } else {
        add_agent_doc_source(src, "astryx.integration.mjs", rest, 0)
    };
    match r {
        Ok(s) => s,
        Err(e) => format!("ERROR {e}"),
    }
}

#[test]
fn recorded_cases() {
    let dir = std::env::var("INTEGRATION_WRITER_CASES").unwrap_or_else(|_| concat!(env!("CARGO_MANIFEST_DIR"), "/src/commands/integration/testdata/writer").to_string());
    let mut fails = 0;
    let mut total = 0;
    let mut names: Vec<_> = std::fs::read_dir(&dir).unwrap().filter_map(|e| {
        let p = e.ok()?.path();
        (p.extension()? == "src").then(|| p.file_stem().unwrap().to_string_lossy().to_string())
    }).collect();
    names.sort();
    for n in names {
        total += 1;
        let src = std::fs::read_to_string(format!("{dir}/{n}.src")).unwrap();
        let op = std::fs::read_to_string(format!("{dir}/{n}.op")).unwrap();
        let want = std::fs::read_to_string(format!("{dir}/{n}.out")).unwrap();
        let got = apply_op(&src, op.trim_end_matches('\n'));
        if got != want {
            fails += 1;
            if fails <= 30 {
                eprintln!("=== {n} FAIL\n--- want\n{want}\n--- got\n{got}");
            }
        }
    }
    eprintln!("writer cases: {}/{} pass", total - fails, total);
    assert_eq!(fails, 0);
}
