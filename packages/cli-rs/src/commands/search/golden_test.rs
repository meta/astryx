//! Compares the ranker with goldens recorded from the JS ranker
//! (`SEARCH_INDEX` = an exported index, `SEARCH_GOLDEN` = JSONL of
//! `{q, type, limit, r, lex, err}`). Ignored unless both are set.

use super::cand::Candidate;
use super::learned::SearchData;
use super::lexical::{rank_lexical, response_json, Catalog};
use crate::json::{self, Value};

#[test]
#[ignore]
fn goldens() {
    let (Ok(index), Ok(golden)) = (std::env::var("SEARCH_INDEX"), std::env::var("SEARCH_GOLDEN")) else { return };
    let index: Value = serde_json::from_str(&std::fs::read_to_string(index).unwrap()).unwrap();
    let cands = index["candidates"].as_array().unwrap();
    let data = SearchData::load(&crate::cli::env::cli_root());
    let only = std::env::var("SEARCH_ONLY").ok();
    let (mut pass, mut fail, mut lpass, mut lfail) = (0, 0, 0, 0);
    let mut catalogs: std::collections::HashMap<Option<String>, Catalog> = Default::default();
    let start = std::time::Instant::now();
    for line in std::fs::read_to_string(golden).unwrap().lines() {
        let g: Value = serde_json::from_str(line).unwrap();
        let q = g["q"].as_str().unwrap();
        if only.as_deref().is_some_and(|o| o != q) {
            continue;
        }
        let type_ = g["type"].as_str();
        let limit = g["limit"].as_f64();
        let catalog = catalogs.entry(type_.map(String::from)).or_insert_with(|| {
            let wanted: Vec<&Value> =
                cands.iter().filter(|c| type_.is_none() || c["domain"].as_str() == type_).collect();
            Catalog {
                all: wanted.iter().map(|v| Candidate::from_json(v)).collect(),
                searched_components: true,
                outside: false,
                core_skipped: None,
            }
        });
        let got = super::index::check_search_args(q, type_, limit)
            .and_then(|_| super::index::rank_catalog(q, catalog, limit, &data));
        let ok = match (&got, g.get("err")) {
            (Err(e), Some(Value::String(m))) => &e.message == m,
            (Ok(v), _) if g.get("r").is_some() => json::stringify(v, 0) == json::stringify(&g["r"], 0),
            _ => false,
        };
        if ok {
            pass += 1
        } else {
            fail += 1;
            if fail <= 5 {
                eprintln!("FAIL r {q:?} {type_:?} {limit:?}");
                if let Ok(v) = &got {
                    let a = json::stringify(v, 2);
                    let b = json::stringify(&g["r"], 2);
                    for (x, y) in a.lines().zip(b.lines()) {
                        if x != y {
                            eprintln!("  got: {x}\n want: {y}");
                            break;
                        }
                    }
                } else {
                    eprintln!("  got {:?} want {:?}", got.as_ref().err(), g.get("err"));
                }
            }
        }
        if let Some(lex) = g.get("lex").filter(|l| !l.is_null()) {
            let l = rank_lexical(q, limit.map_or(20, |l| l as usize), catalog);
            let mut v = response_json(&l, catalog, &l.results);
            let cov: Vec<Value> = l
                .results
                .iter()
                .map(|r| {
                    let mut m = json::Map::new();
                    m.insert("matched".into(), r.matched.into());
                    m.insert("total".into(), r.total.into());
                    Value::Object(m)
                })
                .collect();
            v["cov"] = Value::Array(cov);
            if json::stringify(&v, 0) == json::stringify(lex, 0) {
                lpass += 1
            } else {
                lfail += 1;
                if lfail <= 3 {
                    eprintln!("FAIL lex {q:?}");
                    let a = json::stringify(&v, 2);
                    let b = json::stringify(lex, 2);
                    for (x, y) in a.lines().zip(b.lines()) {
                        if x != y {
                            eprintln!("  got: {x}\n want: {y}");
                            break;
                        }
                    }
                }
            }
        }
    }
    eprintln!("ranked {pass}/{} lexical {lpass}/{} in {:?}", pass + fail, lpass + lfail, start.elapsed());
    assert_eq!(fail + lfail, 0);
}

#[test]
#[ignore]
fn timing() {
    let Ok(index) = std::env::var("SEARCH_INDEX") else { return };
    let q = std::env::var("SEARCH_ONLY").unwrap_or("data table with filters".into());
    let t = std::time::Instant::now();
    let index: Value = serde_json::from_str(&std::fs::read_to_string(index).unwrap()).unwrap();
    eprintln!("parse index {:?}", t.elapsed());
    let t = std::time::Instant::now();
    let data = SearchData::load(&crate::cli::env::cli_root());
    eprintln!("load data {:?}", t.elapsed());
    let t = std::time::Instant::now();
    let all: Vec<Candidate> = index["candidates"].as_array().unwrap().iter().map(Candidate::from_json).collect();
    eprintln!("candidates {:?}", t.elapsed());
    let catalog = Catalog { all, searched_components: true, outside: false, core_skipped: None };
    let t = std::time::Instant::now();
    let _ = super::collate::compare("a", "b");
    eprintln!("collator {:?}", t.elapsed());
    let t = std::time::Instant::now();
    let l = rank_lexical(&q, 20, &catalog);
    eprintln!("lexical {:?} {}", t.elapsed(), l.match_count);
    let t = std::time::Instant::now();
    let tb = super::learned::build_table(&catalog.all, &data.cards);
    eprintln!("table {:?} {}", t.elapsed(), tb.ids.len());
    let t = std::time::Instant::now();
    let l = super::learned::run_tree(&q, 20, &catalog, &data);
    eprintln!("tree {:?} {}", t.elapsed(), l.match_count);
}

#[test]
#[ignore]
fn gather_core() {
    let (Ok(index), Ok(core)) = (std::env::var("SEARCH_INDEX"), std::env::var("SEARCH_CORE")) else { return };
    let index: Value = serde_json::from_str(&std::fs::read_to_string(index).unwrap()).unwrap();
    let core = std::path::PathBuf::from(core);
    let t = std::time::Instant::now();
    let mut mine = super::gather::gather_core_components(&core);
    eprintln!("components {:?}", t.elapsed());
    let t = std::time::Instant::now();
    mine.extend(super::gather::gather_hooks(&core));
    eprintln!("hooks {:?}", t.elapsed());
    let theirs: Vec<&Value> = index["candidates"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["_package"] == "@astryxdesign/core" && (c["domain"] == "component" || c["domain"] == "hook"))
        .collect();
    eprintln!("mine {} theirs {}", mine.len(), theirs.len());
    let mut bad = 0;
    for (a, b) in mine.iter().zip(&theirs) {
        let (sa, sb) = (json::stringify(a, 0), json::stringify(b, 0));
        if sa != sb {
            bad += 1;
            if bad <= 4 {
                for (k, v) in b.as_object().unwrap() {
                    if a.get(k) != Some(v) {
                        eprintln!("{} {k}: got {:?} want {:?}", b["name"], a.get(k).map(|x| json::stringify(x, 0).chars().take(200).collect::<String>()), json::stringify(v, 0).chars().take(200).collect::<String>());
                    }
                }
            }
        }
    }
    eprintln!("differ {bad}");
}

#[test]
#[ignore]
fn dump_gather() {
    let (Ok(cwd), Ok(out)) = (std::env::var("SEARCH_CWD"), std::env::var("SEARCH_DUMP")) else { return };
    let g = super::api::gather_values(std::path::Path::new(&cwd), None).unwrap();
    std::fs::write(out, json::stringify(&Value::Array(g), 0)).unwrap();
}

#[test]
#[ignore]
fn debug_integration() {
    let Ok(cwd) = std::env::var("SEARCH_CWD") else { return };
    for i in crate::commands::component::deps::load_integrations_safely(std::path::Path::new(&cwd)) {
        let v = crate::discovery::component_discovery::discover_valid_integration_components(&i, false);
        eprintln!("{} discovered {} valid {} errors {:?}", i.name, v.discovered.len(), v.components.len(), v.errors);
        for r in &v.discovered {
            if !v.components.iter().any(|c| c.name == r.name) {
                eprintln!("  dropped {} {:?} {:?}", r.name, r.doc_path, r.source_path);
            }
        }
    }
}

#[test]
#[ignore]
fn time_gather() {
    let Ok(core) = std::env::var("SEARCH_CORE") else { return };
    let core = std::path::PathBuf::from(core);
    let t = std::time::Instant::now();
    let n = crate::discovery::component_discovery::discover_components(&core).len();
    eprintln!("discover_components {:?} {n}", t.elapsed());
    let t = std::time::Instant::now();
    super::gather::preload_core(&core, true, true);
    eprintln!("preload {:?}", t.elapsed());
    for _ in 0..2 {
        let t = std::time::Instant::now();
        let c = super::gather::gather_core_components(&core);
        eprintln!("core components {:?} {}", t.elapsed(), c.len());
        let t = std::time::Instant::now();
        let h = super::gather::gather_hooks(&core);
        eprintln!("hooks {:?} {}", t.elapsed(), h.len());
    }
    let names: Vec<String> = crate::discovery::component_discovery::discover_components(&core).into_values().flatten().collect();
    let t = std::time::Instant::now();
    for c in &names { let _ = crate::discovery::component_discovery::find_component_readme(&core, c); }
    eprintln!("readmes {:?}", t.elapsed());
    let t = std::time::Instant::now();
    for c in &names { let _ = crate::discovery::component_discovery::resolve_import_path(&core, c); }
    eprintln!("imports {:?}", t.elapsed());
}

#[test]
#[ignore]
fn forced_project_docs() {
    let Ok(cwd) = std::env::var("SEARCH_CWD") else { return };
    let pm = crate::discovery::package_manager::doc_package_manager(Some(&cwd));
    let t = std::time::Instant::now();
    let got = super::docs::project_docs(&cwd, &pm, true).unwrap();
    eprintln!("runtime docs {:?}", t.elapsed());
    let want = super::gather::own_docs(&pm);
    eprintln!("got {} want {}", got.len(), want.len());
    let key = |c: &Value| format!("{}#{}", c["_topic"].as_str().unwrap_or(""), c["_section"].as_str().unwrap_or(""));
    let mut bad = 0;
    for (i, (a, b)) in got.iter().zip(&want).enumerate() {
        if a != b {
            bad += 1;
            if bad <= 6 {
                eprintln!("#{i} got {} want {}", key(a), key(b));
                if key(a) == key(b) {
                    for (k, v) in b.as_object().unwrap() {
                        if a.get(k) != Some(v) {
                            eprintln!("   {k}: got {} want {}", a.get(k).map(|x| json::stringify(x, 0)).unwrap_or_default().chars().take(200).collect::<String>(), json::stringify(v, 0).chars().take(200).collect::<String>());
                        }
                    }
                }
            }
        }
    }
    eprintln!("differ {bad}");
}
