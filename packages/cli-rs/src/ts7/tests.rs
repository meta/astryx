//! The Rust client against a recording of the Node client (`scripts/ts7-oracle.mjs`):
//! the same calls, the same request bytes, the same response bytes.

use super::client::{Client, Scope};
use super::{fs_reply, Callback};
use super::syntax::{Syntax, V};
use base64::Engine;
use serde_json::Value;
use std::path::Path;

const ROOT: &str = "/tmp/astryx-ts7-oracle/proj";

/// The development TypeScript 7 package (tests only; the CLI uses its own).
fn dev_exe() -> Option<String> {
    let dir = std::env::var("TS7_PACKAGE_DIR").ok().or_else(|| std::env::var("HOME").ok().map(|h| format!("{h}/ts7/node_modules/typescript")))?;
    if !Path::new(&dir).join("package.json").exists() {
        eprintln!("skipping: no TypeScript 7 package at {dir}");
        return None;
    }
    Some(super::exe_of_package(&dir).expect("tsgo"))
}

fn copy_dir(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for e in std::fs::read_dir(from).unwrap() {
        let e = e.unwrap();
        let target = to.join(e.file_name());
        if e.file_type().unwrap().is_dir() {
            copy_dir(&e.path(), &target);
        } else {
            std::fs::copy(e.path(), target).unwrap();
        }
    }
}

fn oracle() -> Value {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/ts7/testdata/oracle.json")).unwrap();
    serde_json::from_str(&text).unwrap()
}

/// Compare recorded exchanges with the oracle's, with the compiler's folder
/// written as `<tslib>`.
fn compare(got: &[(String, Vec<u8>, Vec<u8>)], want: &Value, lib_dir: &str) {
    let want = want.as_array().unwrap();
    for (i, ((method, req, res), w)) in got.iter().zip(want).enumerate() {
        let norm = |b: &[u8]| String::from_utf8_lossy(b).replace(lib_dir, "<tslib>");
        assert_eq!(method, w["method"].as_str().unwrap(), "method of exchange {i}");
        assert_eq!(norm(req), w["request"].as_str().unwrap(), "request {i} ({method})");
        if let Some(b64) = w.get("responseBase64").and_then(|v| v.as_str()) {
            let bytes = base64::engine::general_purpose::STANDARD.decode(b64).unwrap();
            assert!(res == &bytes, "binary response {i} ({method}) differs");
        } else {
            assert_eq!(norm(res), w["response"].as_str().unwrap(), "response {i} ({method})");
        }
    }
    assert_eq!(got.len(), want.len(), "exchange count");
}

fn utf16_index(text: &str, needle: &str) -> u64 {
    let byte = text.find(needle).unwrap();
    text[..byte].encode_utf16().count() as u64
}

#[test]
fn matches_node_client() {
    let Some(exe) = dev_exe() else { return };
    let lib_dir = Path::new(&exe).parent().unwrap().to_string_lossy().into_owned();
    let _ = std::fs::remove_dir_all(Path::new(ROOT).parent().unwrap());
    copy_dir(Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/src/ts7/testdata/proj")), Path::new(ROOT));
    let oracle = oracle();
    let tsconfig = format!("{ROOT}/tsconfig.json");
    let button = format!("{ROOT}/src/Button.ts");
    let index = format!("{ROOT}/src/index.ts");
    let text = std::fs::read_to_string(&button).unwrap();

    // ── Session 1: the real file system ──
    let mut client = Client::spawn(&exe, ROOT, vec![]).unwrap();
    client.record = Some(vec![]);
    client.initialize().unwrap();
    let snap = client.update_snapshot(&[&tsconfig]).unwrap();
    let snapshot = snap["snapshot"].as_u64().unwrap();
    let project = snap["projects"][0]["id"].as_str().unwrap().to_string();
    {
        let mut s = Scope::new(&mut client, snapshot, &project);
        s.get_source_file_names().unwrap();
        let sf_bytes = s.get_source_file(&button).unwrap().unwrap();
        let props = s.get_symbol_at_position(&button, utf16_index(&text, "ButtonProps")).unwrap().unwrap();
        let props_type = s.get_declared_type_of_symbol(props.id()).unwrap().unwrap();
        s.type_to_string(props_type.id(), None, None).unwrap();
        for prop in s.get_properties_of_type(props_type.id()).unwrap() {
            let t = s.get_type_of_symbol(prop.id()).unwrap().unwrap();
            s.type_to_string(t.id(), None, None).unwrap();
            s.get_documentation_comment(prop.id()).unwrap();
        }
        s.get_js_doc_tags(props.id()).unwrap();
        let mut syn = Syntax::new();
        let sf = syn.add(sf_bytes);
        let fn_end = (utf16_index(&text, "function Button") + "function Button".len() as u64) as i64;
        fn all(syn: &Syntax, n: V, out: &mut Vec<V>) {
            out.push(n);
            for c in syn.children(&n) {
                all(syn, c, out);
            }
        }
        let mut nodes = vec![];
        all(&syn, sf, &mut nodes);
        let fn_name = syn.handle(nodes.iter().find(|n| syn.is("isIdentifier", n) && syn.end(n) == fn_end).unwrap());
        let fn_sym = s.get_symbol_at_location(&fn_name).unwrap().unwrap();
        let fn_type = s.get_type_at_location(&fn_name).unwrap().unwrap();
        for sig in s.get_signatures_of_type(fn_type.id(), 0).unwrap() {
            s.get_return_type_of_signature(sig.id()).unwrap();
            s.get_parameter_type(sig.id(), 0).unwrap();
        }
        s.get_type_of_symbol(fn_sym.id()).unwrap();
        s.diagnostics("Semantic", Some(&button)).unwrap();
        s.diagnostics("Semantic", Some(&index)).unwrap();
        s.diagnostics("Syntactic", Some(&index)).unwrap();
        let isf_bytes = s.get_source_file(&index).unwrap().unwrap();
        let isf = syn.add(isf_bytes);
        assert!(syn.is("isSourceFile", &isf));
        let module = s.get_symbol_at_location(&syn.handle(&isf)).unwrap().unwrap();
        s.get_exports_of_module(module.id()).unwrap();
        s.get_symbols_at_positions(&index, &[0, 10, 30]).unwrap();
        s.intrinsic("getStringType").unwrap();
    }
    client.release(snapshot).unwrap();
    let rec = client.record.take().unwrap();
    client.close();
    compare(&rec, &oracle["exchanges"], &lib_dir);

    // ── Session 2: file system callbacks ──
    let virtual_cfg = format!("{ROOT}/__astryx.tsconfig.json");
    let instrumented = format!("{text}\ntype __astryx_0 = ButtonProps['size'];\n");
    let calls = std::rc::Rc::new(std::cell::RefCell::new(Vec::<(String, String, String)>::new()));
    let (vc, bt, ins) = (virtual_cfg.clone(), button.clone(), instrumented.clone());
    let log = calls.clone();
    let read_file: Callback = Box::new(move |raw| {
        let p = fs_reply::arg(raw);
        let cfg = format!(r#"{{"compilerOptions":{{"strict":true,"noEmit":true,"lib":["es2022"]}},"files":["{bt}"]}}"#);
        let out = if p == vc {
            fs_reply::read_file(Some(Some(&cfg)))
        } else if p == bt {
            fs_reply::read_file(Some(Some(&ins)))
        } else if p == format!("{ROOT}/missing.ts") {
            fs_reply::read_file(Some(None))
        } else {
            fs_reply::read_file(None)
        };
        log.borrow_mut().push(("readFile".into(), raw.to_string(), out.clone()));
        Ok(out)
    });
    let vc2 = virtual_cfg.clone();
    let log = calls.clone();
    let file_exists: Callback = Box::new(move |raw| {
        let out = fs_reply::boolean(if fs_reply::arg(raw) == vc2 { Some(true) } else { None });
        log.borrow_mut().push(("fileExists".into(), raw.to_string(), out.clone()));
        Ok(out)
    });
    // Given out of order on purpose: the flag lists them in the Node order.
    let mut client = Client::spawn(&exe, ROOT, vec![("fileExists", file_exists), ("readFile", read_file)]).unwrap();
    client.record = Some(vec![]);
    client.initialize().unwrap();
    let snap = client.update_snapshot(&[&virtual_cfg]).unwrap();
    let snapshot = snap["snapshot"].as_u64().unwrap();
    let project = snap["projects"][0]["id"].as_str().unwrap().to_string();
    {
        let mut s = Scope::new(&mut client, snapshot, &project);
        let t = s.get_type_at_position(&button, utf16_index(&instrumented, "__astryx_0")).unwrap().unwrap();
        s.type_to_string(t.id(), None, None).unwrap();
        s.diagnostics("Semantic", Some(&button)).unwrap();
    }
    client.release(snapshot).unwrap();
    let rec = client.record.take().unwrap();
    client.close();
    compare(&rec, &oracle["virtual"]["exchanges"], &lib_dir);

    let mut got: Vec<(String, String, String)> = calls.borrow().iter().map(|(n, a, r)| (n.clone(), a.replace(&lib_dir, "<tslib>"), r.replace(&lib_dir, "<tslib>"))).collect();
    got.sort_by(|a, b| format!("{}{}", a.0, a.1).encode_utf16().cmp(format!("{}{}", b.0, b.1).encode_utf16()));
    let want: Vec<(String, String, String)> = oracle["virtual"]["calls"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| (c["name"].as_str().unwrap().into(), c["arg"].as_str().unwrap().into(), c["payload"].as_str().unwrap().into()))
        .collect();
    assert_eq!(got, want, "callbacks");
}

#[test]
fn finds_exe_like_get_exe_path() {
    let Some(exe) = dev_exe() else { return };
    assert!(exe.ends_with("/lib/tsc"), "{exe}");
    assert!(super::find_exe("/nonexistent").is_err());
}

#[test]
fn syntax_matches_node_api() {
    use super::syntax::{leading_comment_ranges, Syntax, V};
    let Some(exe) = dev_exe() else { return };
    let root = "/tmp/astryx-ts7-syntax-rs";
    let _ = std::fs::remove_dir_all(root);
    copy_dir(Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/src/ts7/testdata/syntax")), Path::new(root));
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/ts7/testdata/syntax-oracle.json")).unwrap();
    let oracle: Value = serde_json::from_str(&text.replace("/tmp/astryx-ts7-syntax", root)).unwrap();
    let config = format!("{root}/__astryx_check_1.tsconfig.json");
    let config_text = oracle["config"].as_str().unwrap().to_string();
    let (c1, c2) = (config.clone(), config.clone());
    let read_file: Callback = Box::new(move |raw| Ok(fs_reply::read_file(if fs_reply::arg(raw) == c1 { Some(Some(&config_text)) } else { None })));
    let file_exists: Callback = Box::new(move |raw| Ok(fs_reply::boolean(if fs_reply::arg(raw) == c2 { Some(true) } else { None })));
    let mut client = Client::spawn(&exe, root, vec![("readFile", read_file), ("fileExists", file_exists)]).unwrap();
    client.initialize().unwrap();
    let snap = client.update_snapshot(&[&config]).unwrap();
    let snapshot = snap["snapshot"].as_u64().unwrap();
    let mut syn = Syntax::new();
    for (name, want) in oracle["files"].as_object().unwrap() {
        let file = format!("{root}/{name}");
        let bytes = Scope::new(&mut client, snapshot, &config).get_source_file(&file).unwrap().unwrap();
        let sf = syn.add(bytes);
        assert_eq!(syn.path(&sf), want["path"].as_str().unwrap());
        assert_eq!(syn.text16(&sf).len() as u64, want["textLength"].as_u64().unwrap());
        let idx = |v: &V| match v {
            V::Node(_, i) | V::List(_, i) => *i as u64,
            V::Undef => 0,
        };
        let mut got: Vec<Value> = Vec::new();
        fn visit(syn: &Syntax, n: V, got: &mut Vec<Value>, idx: &dyn Fn(&V) -> u64) {
            let mut props = serde_json::Map::new();
            for name in super::syntax_tables::child_properties(syn.kind(&n)) {
                let c = syn.get(&n, name);
                match c {
                    V::Undef => {}
                    V::List(..) => {
                        props.insert(name.to_string(), serde_json::json!({ "list": syn.items(&c).iter().map(idx).collect::<Vec<_>>() }));
                    }
                    V::Node(..) => {
                        props.insert(name.to_string(), serde_json::json!(idx(&c)));
                    }
                }
            }
            let is_sf = syn.kind(&n) == super::syntax_tables::kind("SourceFile").unwrap();
            let start = syn.start(&n);
            let (line, character) = syn.line_and_character(&n, start as usize);
            let comments: Vec<Value> = leading_comment_ranges(syn.text16(&n), syn.pos(&n))
                .iter()
                .map(|r| serde_json::json!([r.kind, r.pos, r.end, r.has_trailing_new_line]))
                .collect();
            let parent = syn.parent(&n);
            got.push(serde_json::json!({
                "index": idx(&n),
                "kind": syn.kind(&n),
                "pos": syn.pos(&n),
                "end": syn.end(&n),
                "start": start,
                "startJsDoc": syn.start_with_jsdoc(&n),
                "text": if is_sf { None } else { syn.text_opt(&n) },
                "flags": syn.flags(&n),
                "parent": if parent.is_undefined() { Value::Null } else { serde_json::json!(idx(&parent)) },
                "props": props,
                "children": syn.children(&n).iter().map(idx).collect::<Vec<_>>(),
                "jsDoc": syn.jsdoc(&n).iter().map(idx).collect::<Vec<_>>(),
                "comments": comments,
                "line": {"line": line, "character": character},
            }));
            for j in syn.jsdoc(&n) {
                visit(syn, j, got, idx);
            }
            for c in syn.children(&n) {
                visit(syn, c, got, idx);
            }
        }
        visit(&syn, sf, &mut got, &idx);
        let want = want["nodes"].as_array().unwrap();
        for (g, w) in got.iter().zip(want) {
            assert_eq!(g, w, "{name}");
        }
        assert_eq!(got.len(), want.len(), "{name} node count");
    }
    client.close();
}
