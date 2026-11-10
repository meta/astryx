use super::*;
use std::fs;

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("astryx-js-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn relative_mjs_imports() {
    let d = tmp("rel");
    fs::create_dir_all(d.join("sub")).unwrap();
    fs::write(d.join("sub/b.mjs"), "export const b = {x: 1, f() {}, u: undefined, n: NaN};\nexport default 'B';").unwrap();
    fs::write(
        d.join("a.mjs"),
        "import B, {b} from './sub/b.mjs';\nimport * as path from 'node:path';\nexport const docs = {z: 1, a: [B, b], 2: 'two', 1: 'one', url: import.meta.url, base: path.basename(import.meta.filename)};\n",
    )
    .unwrap();
    let ns = import_module(&d.join("a.mjs"), &ImportOptions::default()).unwrap();
    let s = crate::json::stringify(&strip_fn_ids(Value::Object(ns)), 0);
    let url = format!("file://{}/a.mjs", fs::canonicalize(&d).unwrap().display());
    assert_eq!(
        s,
        format!(r#"{{"docs":{{"1":"one","2":"two","z":1,"a":["B",{{"x":1,"f":{{"__js":"function","name":"f"}},"u":{{"__js":"undefined"}},"n":{{"__js":"number","value":"NaN"}}}}],"url":"{url}","base":"a.mjs"}}}}"#)
    );
}

#[test]
fn load_errors() {
    let d = tmp("err");
    fs::write(d.join("broken.mjs"), "export default createIntegration({});\n").unwrap();
    let e = import_module(&d.join("broken.mjs"), &ImportOptions::default()).unwrap_err();
    assert_eq!((e.name.as_str(), e.message.as_str()), ("ReferenceError", "createIntegration is not defined"));
    fs::write(d.join("missing.mjs"), "import './nope.mjs';\n").unwrap();
    let e = import_module(&d.join("missing.mjs"), &ImportOptions::default()).unwrap_err();
    assert_eq!(e.code.as_deref(), Some("ERR_MODULE_NOT_FOUND"));
    let real = fs::canonicalize(&d).unwrap();
    assert_eq!(
        e.message,
        format!("Cannot find module '{0}/nope.mjs' imported from {0}/missing.mjs", real.display())
    );
}

#[test]
fn typescript_through_jiti() {
    let d = tmp("ts");
    fs::write(d.join("t.ts"), "import {v} from './v';\nexport const docs: {n: number} = {n: v};\nexport default docs;\n").unwrap();
    fs::write(d.join("v.ts"), "export const v: number = 7;\n").unwrap();
    let ns = import_module(&d.join("t.ts"), &ImportOptions::default()).unwrap();
    assert_eq!(crate::json::stringify(&Value::Object(ns), 0), r#"{"default":{"n":7},"docs":{"n":7}}"#);
}

/// The snapshot has no function ids (they are per process).
fn strip_fn_ids(v: Value) -> Value {
    match v {
        Value::Object(mut m) => {
            if m.get("__js").and_then(|k| k.as_str()) == Some("function") {
                m.shift_remove("id");
                return Value::Object(m);
            }
            Value::Object(m.into_iter().map(|(k, v)| (k, strip_fn_ids(v))).collect())
        }
        Value::Array(a) => Value::Array(a.into_iter().map(strip_fn_ids).collect()),
        other => other,
    }
}

const CLI_COMPILER_DOCS: &[&str] = &[
    "packages/cli/assets/docs/tree/field-reference.doc.mjs",
    "packages/cli/assets/docs/tree/icon-set-files.doc.mjs",
];

/// Every real doc, theme source and CLI fixture loads and converts as Node
/// loads it (snapshot recorded by testdata/oracle.mjs).
#[test]
fn real_files_match_node() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let repo = crate_dir.join("../..").canonicalize().unwrap();
    let repo_s = repo.to_string_lossy().to_string();
    let snapshot = fs::read_to_string(crate_dir.join("src/js/testdata/snapshot.jsonl")).unwrap();
    let only = std::env::var("JS_ONLY").ok();
    let started = std::time::Instant::now();
    let mut failures = Vec::new();
    let mut total = 0;
    for line in snapshot.lines() {
        let rec: Value = serde_json::from_str(line).unwrap();
        let file = rec["file"].as_str().unwrap();
        if let Some(o) = &only {
            if !file.contains(o.as_str()) {
                continue;
            }
        }
        // These two CLI-own docs build their text by running the CLI's doc
        // compiler. The clone embeds the CLI's own docs precompiled
        // (CONTRACT.md); it never runs CLI code in the engine.
        if CLI_COMPILER_DOCS.contains(&file) {
            continue;
        }
        total += 1;
        let opts = ImportOptions { jsx: file.starts_with("packages/themes/"), fresh: false };
        let t0 = std::time::Instant::now();
        let got = match import_module(&repo.join(file), &opts) {
            Ok(ns) => Value::Object(ns),
            Err(e) => serde_json::json!({"__error": {"name": e.name, "message": e.message, "code": e.code}}),
        };
        if std::env::var("JS_TIMES").is_ok() {
            eprintln!("{:>8.1}ms {file}", t0.elapsed().as_secs_f64() * 1000.0);
        }
        let got = crate::json::stringify(&strip_fn_ids(got), 0).replace(&repo_s, "<repo>");
        let want = crate::json::stringify(&rec["value"], 0);
        if got != want {
            let at = got.bytes().zip(want.bytes()).take_while(|(a, b)| a == b).count();
            let lo = at.saturating_sub(80);
            failures.push(format!(
                "{file}\n  got:  …{}\n  want: …{}",
                &got.get(lo..(at + 120).min(got.len())).unwrap_or(""),
                &want.get(lo..(at + 120).min(want.len())).unwrap_or("")
            ));
        }
    }
    eprintln!("loaded {total} files in {:?}", started.elapsed());
    if !failures.is_empty() {
        let n = failures.len();
        failures.truncate(15);
        panic!("{n}/{total} files differ from Node:\n{}", failures.join("\n"));
    }
}

#[test]
#[ignore]
fn perf_probe() {
    let p = std::env::var("JS_PROBE").unwrap();
    let text = fs::read_to_string(&p).unwrap();
    let mut ctx = boa_engine::Context::default();
    let wrapped = format!("(function (exports, require, module, __filename, __dirname) {{{text}\n}})");
    let t = std::time::Instant::now();
    let s = boa_engine::Script::parse(boa_engine::Source::from_bytes(wrapped.as_str()), None, &mut ctx).unwrap();
    eprintln!("parse {:?}", t.elapsed());
    let t = std::time::Instant::now();
    let _ = s.codeblock(&mut ctx).unwrap();
    eprintln!("compile {:?}", t.elapsed());
    let t = std::time::Instant::now();
    let _ = s.evaluate(&mut ctx);
    eprintln!("eval {:?}", t.elapsed());
}

#[test]
fn math_override() {
    let d = tmp("math");
    fs::write(d.join("m.mjs"), "export const v = Math.pow(2, 10); export const n = Math.pow.name;\n").unwrap();
    override_math("pow", |a| a[0] * 1000.0 + a[1]);
    let ns = import_module(&d.join("m.mjs"), &ImportOptions::default()).unwrap();
    assert_eq!(crate::json::stringify(&Value::Object(ns), 0), r#"{"n":"pow","v":2010}"#);
}

/// Compare every `Math` function with Node on a sample (JS_MATH_SAMPLE: a
/// file of `fn x[,y] result` lines, f64 bits in hex).
#[test]
#[ignore]
fn math_matches_node_sample() {
    let sample = fs::read_to_string(std::env::var("JS_MATH_SAMPLE").unwrap()).unwrap();
    let d = tmp("mathsample");
    let mut src = String::from("const b = new DataView(new ArrayBuffer(8));\nconst f = h => { b.setBigUint64(0, BigInt('0x' + h)); return b.getFloat64(0); };\nconst h = x => { b.setFloat64(0, x); return b.getBigUint64(0).toString(16); };\nconst bad = {};\nconst lines = __LINES__;\nfor (const l of lines) { const [fn, args, want] = l.split(' '); const r = Math[fn](...args.split(',').map(f)); const got = h(r); if (got !== want && !(Number.isNaN(r) && Number.isNaN(f(want)))) bad[fn] = (bad[fn] || 0) + 1; }\nexport default bad;\n");
    let lines: Vec<&str> = sample.lines().collect();
    src = src.replace("__LINES__", &serde_json::to_string(&lines).unwrap());
    fs::write(d.join("m.mjs"), src).unwrap();
    let ns = import_module(&d.join("m.mjs"), &ImportOptions::default()).unwrap();
    eprintln!("mismatches per function: {}", crate::json::stringify(&ns["default"], 0));
    assert_eq!(ns["default"], serde_json::json!({}));
}

#[test]
fn exponent_operator_uses_node_pow() {
    let d = tmp("pow");
    fs::write(d.join("p.mjs"), "let z = 1.9629632234573364; z **= 2.4;\nexport const v = [1.9629632234573364 ** 2.4, z, 2n ** 64n === 18446744073709551616n, 2 ** -1];\n").unwrap();
    let ns = import_module(&d.join("p.mjs"), &ImportOptions::default()).unwrap();
    assert_eq!(crate::json::stringify(&ns["v"], 0), "[5.04648737826075,5.04648737826075,true,0.5]");
}

#[test]
fn function_ids_follow_identity() {
    let d = tmp("ids");
    fs::write(d.join("h.mjs"), "export function handle() {}\n").unwrap();
    fs::write(d.join("c.mjs"), "import {handle} from './h.mjs';\nexport default {a: handle, b: handle, c() {}};\n").unwrap();
    let ns = import_module(&d.join("c.mjs"), &ImportOptions::default()).unwrap();
    let h = import_module(&d.join("h.mjs"), &ImportOptions::default()).unwrap();
    let d = &ns["default"];
    assert_eq!(d["a"]["id"], d["b"]["id"]);
    assert_ne!(d["a"]["id"], d["c"]["id"]);
    assert_eq!(h["handle"]["id"], d["a"]["id"]);
}

/// Compare jsmath ports with Node's results directly (JS_MATH_SAMPLE).
#[test]
#[ignore]
fn jsmath_ports_match_node_sample() {
    let sample = fs::read_to_string(std::env::var("JS_MATH_SAMPLE").unwrap()).unwrap();
    let f = |h: &str| f64::from_bits(u64::from_str_radix(h, 16).unwrap());
    let mut bad: std::collections::BTreeMap<String, (usize, Vec<String>)> = Default::default();
    for l in sample.lines() {
        let mut p = l.split(' ');
        let (name, args, want) = (p.next().unwrap(), p.next().unwrap(), f(p.next().unwrap()));
        let a: Vec<f64> = args.split(',').map(f).collect();
        let got = match name {
            "exp" => super::jsmath::exp(a[0]),
            "log" => super::jsmath::log(a[0]),
            "log1p" => super::jsmath::log1p(a[0]),
            "expm1" => super::jsmath::expm1(a[0]),
            "log2" => super::jsmath::log2(a[0]),
            "log10" => super::jsmath::log10(a[0]),
            "pow" => super::jsmath::pow(a[0], a[1]),
            "atan2" => super::jsmath::atan2(a[0], a[1]),
            "sin" => super::jsmath::sin(a[0]),
            "cos" => super::jsmath::cos(a[0]),
            "atan" => super::jsmath::atan(a[0]),
            "cbrt" => super::jsmath::cbrt(a[0]),
            _ => continue,
        };
        if got.to_bits() != want.to_bits() && !(got.is_nan() && want.is_nan()) {
            let e = bad.entry(name.to_string()).or_default();
            e.0 += 1;
            if e.1.len() < 3 {
                e.1.push(format!("{:e} got {:e} want {:e}", a[0], got, want));
            }
        }
    }
    eprintln!("{bad:#?}");
    assert!(bad.is_empty());
}

#[test]
#[ignore]
fn log1p_variant_search() {
    variant_search("log1p ", &[3, 3, 2, 2, 2, 2], super::jsmath::log1p_variant);
}

#[test]
#[ignore]
fn log2_variant_search() {
    variant_search("log2 ", &[2, 2, 2, 2, 3, 2, 2, 2], super::jsmath::log2_variant);
}

#[test]
#[ignore]
fn log10_variant_search() {
    variant_search("log10 ", &[3, 2], super::jsmath::log10_variant);
}

#[cfg(test)]
fn variant_search(prefix: &str, dims: &[usize], f_v: fn(f64, &[usize]) -> f64) {
    let sample = fs::read_to_string(std::env::var("JS_MATH_SAMPLE").unwrap()).unwrap();
    let f = |h: &str| f64::from_bits(u64::from_str_radix(h, 16).unwrap());
    let cases: Vec<(f64, f64)> = sample
        .lines()
        .filter(|l| l.starts_with(prefix))
        .map(|l| {
            let p: Vec<&str> = l.split(' ').collect();
            (f(p[1]), f(p[2]))
        })
        .collect();
    let total: usize = dims.iter().product();
    let mut results = vec![];
    for n in 0..total {
        let mut v = vec![0; dims.len()];
        let mut m = n;
        for (i, d) in dims.iter().enumerate() {
            v[i] = m % d;
            m /= d;
        }
        let bad = cases
            .iter()
            .filter(|(x, want)| {
                let g = f_v(*x, &v);
                g.to_bits() != want.to_bits() && !(g.is_nan() && want.is_nan())
            })
            .count();
        results.push((bad, v));
    }
    results.sort();
    eprintln!("best {:?}", &results[..5.min(results.len())]);
}

#[test]
#[ignore]
fn log_variant_search() {
    let sample = fs::read_to_string(std::env::var("JS_MATH_SAMPLE").unwrap()).unwrap();
    let f = |h: &str| f64::from_bits(u64::from_str_radix(h, 16).unwrap());
    let cases: Vec<(f64, f64)> = sample
        .lines()
        .filter(|l| l.starts_with("log "))
        .map(|l| {
            let p: Vec<&str> = l.split(' ').collect();
            (f(p[1]), f(p[2]))
        })
        .collect();
    let dims = [3, 2, 3, 3, 2, 2, 2, 3];
    let total: usize = dims.iter().product();
    let mut best = (usize::MAX, vec![]);
    for n in 0..total {
        let mut v = vec![0; dims.len()];
        let mut m = n;
        for (i, d) in dims.iter().enumerate() {
            v[i] = m % d;
            m /= d;
        }
        let bad = cases
            .iter()
            .filter(|(x, want)| {
                let g = super::jsmath::log_variant(*x, &v);
                g.to_bits() != want.to_bits() && !(g.is_nan() && want.is_nan())
            })
            .count();
        if bad < best.0 {
            best = (bad, v);
        }
    }
    eprintln!("best {best:?}");
}

/// A small fixed sample of the bit-exact Math functions through the engine
/// (inputs and Node's results recorded on the reference Node).
#[test]
fn math_through_engine_matches_node() {
    let d = tmp("mathfixed");
    fs::write(
        d.join("m.mjs"),
        "export default [Math.exp(0.7), Math.exp(-3.3), Math.log(2.7810263633728027), Math.log1p(0.4763145446777344), Math.expm1(0.3), Math.log2(1365.3421932831407), Math.log10(86.20738983154297), Math.sin(-7080205.047176157), Math.cos(2259628042.7244873), 2 ** 0.5];\n",
    )
    .unwrap();
    let ns = import_module(&d.join("m.mjs"), &ImportOptions::default()).unwrap();
    assert_eq!(
        crate::json::stringify(&ns["default"], 0),
        "[2.0137527074704766,0.036883167401240015,1.022820055024515,0.3895488096246172,0.3498588075760031,10.415046861215496,1.9355444958189305,0.7348011677536206,-0.9536120159614545,1.4142135623730951]"
    );
}

#[test]
fn forced_jiti_wording_and_aliases() {
    let d = tmp("jiti");
    fs::write(d.join("theme.mjs"), "import x from './does-not-exist.mjs'; export default x;\n").unwrap();
    let jiti = JitiOptions { force: true, ..Default::default() };
    let e = import_module_jiti(&d.join("theme.mjs"), &ImportOptions::default(), &jiti).unwrap_err();
    let real = fs::canonicalize(&d).unwrap();
    assert_eq!(e.code.as_deref(), Some("MODULE_NOT_FOUND"));
    assert_eq!(e.message, format!("Cannot find module './does-not-exist.mjs'\nRequire stack:\n- {}/theme.mjs", real.display()));
    fs::write(d.join("core.mjs"), "export const v = 42;\n").unwrap();
    fs::write(d.join("a.mjs"), "import {v} from '@astryxdesign/core/theme'; export const w = v;\n").unwrap();
    fs::write(d.join("b.ts"), "export const t = 1;\n").unwrap();
    fs::write(d.join("b.mjs"), "export const t = 2;\n").unwrap();
    fs::write(d.join("c.mjs"), "export {t} from './b';\n").unwrap();
    let jiti = JitiOptions {
        force: true,
        aliases: vec![("@astryxdesign/core/theme".into(), d.join("core.mjs"))],
        extensions: Some(vec![".ts".into(), ".mjs".into()]),
        ..Default::default()
    };
    let ns = import_module_jiti(&d.join("a.mjs"), &ImportOptions::default(), &jiti).unwrap();
    assert_eq!(ns["w"], serde_json::json!(42));
    let ns = import_module_jiti(&d.join("c.mjs"), &ImportOptions::default(), &jiti).unwrap();
    assert_eq!(ns["t"], serde_json::json!(1));
}

#[test]
fn locale_compare_is_icu_root() {
    let d = tmp("collate");
    fs::write(d.join("c.mjs"), "export default ['b', 'A', 'a', 'B', '_x', 'é', 'e'].sort((x, y) => x.localeCompare(y));\n").unwrap();
    let ns = import_module(&d.join("c.mjs"), &ImportOptions::default()).unwrap();
    assert_eq!(crate::json::stringify(&ns["default"], 0), r#"["_x","a","A","b","B","e","é"]"#);
}

#[test]
fn web_globals() {
    let d = tmp("web");
    fs::write(
        d.join("w.mjs"),
        "const bytes = new TextEncoder().encode('h\\u00e9\\u{1F600}');\nconst back = new TextDecoder().decode(bytes);\nconst got = await new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = e => r(e.data); c.port2.postMessage('ping'); });\nexport default [Array.from(bytes), back === 'h\\u00e9\\u{1F600}', got, typeof Intl.DateTimeFormat, new Intl.NumberFormat('en-US').format(1234.5)];\n",
    )
    .unwrap();
    let ns = import_module(&d.join("w.mjs"), &ImportOptions::default()).unwrap();
    assert_eq!(
        crate::json::stringify(&ns["default"], 0),
        r#"[[104,195,169,240,159,152,128],true,"ping","function","1,234.5"]"#
    );
}

#[test]
#[ignore]
fn startup_time() {
    let d = tmp("startup");
    fs::write(d.join("s.mjs"), "export default 1;\n").unwrap();
    let t = std::time::Instant::now();
    import_module(&d.join("s.mjs"), &ImportOptions::default()).unwrap();
    eprintln!("first import (engine start) {:?}", t.elapsed());
}

#[test]
#[ignore]
fn call_probe() {
    let p = std::env::var("JS_CALL").unwrap();
    let t = std::time::Instant::now();
    let ex = std::env::var("JS_EXPORT").unwrap_or_else(|_| "go".into());
    let r = call_export(Path::new(&p), &[ex.as_str()], &[], &CallOptions::default());
    eprintln!("call {:?}: {}", t.elapsed(), match r { Ok(r) => crate::json::stringify(&r.value, 0).chars().take(300).collect::<String>(), Err(e) => format!("{e:?}") });
}

#[test]
fn console_capture_and_load_records() {
    let d = tmp("console");
    fs::write(d.join("dep.json"), "{\"a\": 1}").unwrap();
    fs::write(
        d.join("c.mjs"),
        "import dep from './dep.json' with {type: 'json'};\nconsole.log('n=%d', 42, {a: [1, 2], b: 'x'});\nconsole.warn('w', dep);\nexport default 1;\n",
    )
    .unwrap();
    capture_console(true);
    record_loads(true);
    import_module(&d.join("c.mjs"), &ImportOptions::default()).unwrap();
    let lines = capture_console(false);
    let loads = record_loads(false);
    assert_eq!(
        lines,
        vec![
            ("log".to_string(), "n=42 { a: [ 1, 2 ], b: 'x' }".to_string()),
            ("warn".to_string(), "w { a: 1 }".to_string())
        ]
    );
    let real = fs::canonicalize(&d).unwrap();
    assert_eq!(loads, vec![real.join("c.mjs"), real.join("dep.json")]);
}

#[test]
fn jsx_automatic_and_missing_specifier() {
    let d = tmp("jsxauto");
    fs::create_dir_all(d.join("node_modules/react")).unwrap();
    fs::write(d.join("node_modules/react/package.json"), "{\"name\":\"react\",\"type\":\"module\",\"exports\":{\"./jsx-runtime\":\"./jsx.js\"}}").unwrap();
    fs::write(d.join("node_modules/react/jsx.js"), "export const jsx = (t, p) => ({t, p}); export const jsxs = jsx;\n").unwrap();
    fs::write(d.join("p.tsx"), "export default <div className=\"a\">hi</div>;\n").unwrap();
    let jiti = JitiOptions { jsx_automatic: true, ..Default::default() };
    let ns = import_module_jiti(&d.join("p.tsx"), &ImportOptions::default(), &jiti).unwrap();
    assert_eq!(crate::json::stringify(&ns["default"], 0), r#"{"t":"div","p":{"className":"a","children":"hi"}}"#);
    fs::write(d.join("m.mjs"), "import x from 'not-installed/sub';\nexport default x;\n").unwrap();
    let e = import_module(&d.join("m.mjs"), &ImportOptions::default()).unwrap_err();
    assert_eq!(missing_specifier(&e).as_deref(), Some("not-installed/sub"));
}

#[test]
fn virtual_modules_from_live_objects() {
    let d = tmp("virtual");
    fs::write(d.join("t.mjs"), "import core, {defineTheme} from '@astryxdesign/core/theme';\nexport default [defineTheme({a: 1}), typeof core.defineTheme];\n").unwrap();
    let id = super::engine::with_engine(|e| {
        let obj = e.ctx.eval(boa_engine::Source::from_bytes("({defineTheme: (x) => ({wrapped: x})})")).unwrap();
        e.register_virtual(obj.as_object().unwrap()).unwrap()
    });
    let jiti = JitiOptions { force: true, virtual_modules: vec![("@astryxdesign/core/theme".into(), id)], ..Default::default() };
    let ns = import_module_jiti(&d.join("t.mjs"), &ImportOptions::default(), &jiti).unwrap();
    assert_eq!(crate::json::stringify(&ns["default"], 0), r#"[{"wrapped":{"a":1}},"function"]"#);
}

#[test]
fn json_errors_read_as_v8() {
    let d = tmp("badjson");
    fs::write(d.join("bad.json"), "nope{\n").unwrap();
    fs::write(d.join("j.mjs"), "import x from './bad.json' with {type: 'json'}; export default x;\n").unwrap();
    fs::write(d.join("p.mjs"), "let m; try { JSON.parse('nope{'); } catch (e) { m = e.name + ': ' + e.message; } export default m;\n").unwrap();
    let e = import_module(&d.join("j.mjs"), &ImportOptions::default()).unwrap_err();
    let real = fs::canonicalize(&d).unwrap();
    assert_eq!(e.name, "SyntaxError");
    assert_eq!(e.message, format!("{}/bad.json: Unexpected token 'o', \"nope{{\n\" is not valid JSON", real.display()));
    let ns = import_module(&d.join("p.mjs"), &ImportOptions::default()).unwrap();
    assert_eq!(ns["default"], serde_json::json!("SyntaxError: Unexpected token 'o', \"nope{\" is not valid JSON"));
}

#[test]
fn jiti_missing_named_import_is_undefined() {
    let d = tmp("selfimport");
    fs::write(d.join("slots.ts"), "import {chevron} from './slots';\nexport const close = 'x';\nexport default [typeof chevron, close];\n").unwrap();
    let jiti = JitiOptions { force: true, extensions: Some(vec![".ts".into()]), ..Default::default() };
    let ns = import_module_jiti(&d.join("slots.ts"), &ImportOptions::default(), &jiti).unwrap();
    assert_eq!(crate::json::stringify(&ns["default"], 0), r#"["undefined","x"]"#);
}

#[test]
fn fresh_jiti_rereads_the_graph() {
    let d = tmp("freshgraph");
    fs::write(d.join("dep.ts"), "export const v = 1;\n").unwrap();
    fs::write(d.join("root.ts"), "import {v} from './dep';\nexport const got = v;\n").unwrap();
    let fresh = ImportOptions { fresh: true, ..Default::default() };
    assert_eq!(import_module(&d.join("root.ts"), &fresh).unwrap()["got"], serde_json::json!(1));
    fs::write(d.join("dep.ts"), "export const v = 2;\n").unwrap();
    assert_eq!(import_module(&d.join("root.ts"), &fresh).unwrap()["got"], serde_json::json!(2));
    // A native ES fresh read rereads the root only, as Node does.
    fs::write(d.join("dep.mjs"), "export const v = 1;\n").unwrap();
    fs::write(d.join("root.mjs"), "import {v} from './dep.mjs';\nexport const got = v;\n").unwrap();
    assert_eq!(import_module(&d.join("root.mjs"), &fresh).unwrap()["got"], serde_json::json!(1));
    fs::write(d.join("dep.mjs"), "export const v = 2;\n").unwrap();
    assert_eq!(import_module(&d.join("root.mjs"), &fresh).unwrap()["got"], serde_json::json!(1));
}

#[test]
#[ignore]
fn oxc_probe() {
    use oxc::allocator::Allocator;
    use oxc::parser::Parser;
    use oxc::span::SourceType;
    let shapes: Vec<(String, String)> = serde_json::from_str(&fs::read_to_string("/tmp/jse_se/shapes.json").unwrap()).unwrap();
    for (name, src) in shapes {
        if std::env::var("JSX_ONLY").is_ok() && !name.contains("jsx") && name != "html_comment" { continue; }
        for (kind, st) in [("mjs", SourceType::mjs()), ("ts", SourceType::ts()), ("tsx", SourceType::tsx())] {
            let a = Allocator::default();
            let ret = Parser::new(&a, &src, st).parse();
            let d = ret.diagnostics.iter().next();
            let s = d.map(|d| {
                let l = d.labels.iter().map(|l| format!("{}+{}", l.offset(), l.len())).collect::<Vec<_>>().join(",");
                format!("{} @{} [{}]", d.message, l, src.get(d.labels.first().map(|l| l.offset() as usize).unwrap_or(0)..).unwrap_or("").chars().take(6).collect::<String>().escape_debug())
            });
            eprintln!("{name:22} {kind:4} {}", s.unwrap_or_else(|| "ok".into()));
        }
    }
    for src in ["export const class = 1;\n", "export const f = <T>(x: T) => x;\n", "let x = {if: 1}; var function = 2;\n", "import {a as class} from 'x';\n"] {
        for (kind, st) in [("ts", SourceType::ts()), ("tsx", SourceType::tsx())] {
            let a = Allocator::default();
            let ret = Parser::new(&a, src, st).parse();
            eprintln!("{src:?} {kind} {:?}", ret.diagnostics.iter().map(|d| (d.message.to_string(), d.labels.iter().map(|l| l.offset()).collect::<Vec<_>>())).collect::<Vec<_>>());
        }
    }
}

/// Syntax-error shapes and the messages Node (native import) and jiti give
/// for them (recorded by testdata/syntax-oracle.mjs).
#[test]
fn syntax_errors_match_node_and_jiti() {
    use super::syntax::{syntax_error, Dialect};
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let cases: Vec<Value> = serde_json::from_str(&fs::read_to_string(crate_dir.join("src/js/testdata/syntax.json")).unwrap()).unwrap();
    let mut bad = Vec::new();
    for c in &cases {
        let src = c["source"].as_str().unwrap();
        let name = c["name"].as_str().unwrap();
        for (key, dialect, ts, jsx) in [
            ("esm", Dialect::V8Module, false, false),
            ("jiti_ts", Dialect::Jiti, true, false),
            ("jiti_tsx", Dialect::Jiti, true, true),
        ] {
            if c[key].get("name").and_then(|n| n.as_str()).map(|n| n != "SyntaxError" && n != "Error").unwrap_or(false) {
                continue; // a runtime error, not a parse error
            }
            // JSX in a `.ts` file that jiti reads without JSX: no real load does this.
            if key == "jiti_ts" && (name == "jsx_adjacent" || name == "jsx_bad_attr") {
                continue;
            }
            let got = syntax_error(src, Path::new("<file>"), dialect, ts, jsx)
                .map(|(n, m)| serde_json::json!({"name": n, "message": m}))
                .unwrap_or(Value::Null);
            if got != c[key] {
                bad.push(format!("{name} {key}\n  got:  {got}\n  want: {}", c[key]));
            }
        }
    }
    assert!(bad.is_empty(), "{}/{} differ:\n{}", bad.len(), cases.len() * 3, bad.join("\n"));
}

#[test]
#[ignore]
fn oxc_sem_probe() {
    for src in ["export default 017;\n", "with (a) {}\n", "let a; delete a;\nexport default 1;\n"] {
        let a = oxc::allocator::Allocator::default();
        let ret = oxc::parser::Parser::new(&a, src, oxc::span::SourceType::mjs()).parse();
        eprintln!("parse {:?}", ret.diagnostics.iter().map(|d| (d.message.to_string(), d.labels.iter().map(|l| l.offset()).collect::<Vec<_>>())).collect::<Vec<_>>());
        let sem = oxc::semantic::SemanticBuilder::new().with_check_syntax_error(true).build(&ret.program);
        eprintln!("sem {:?}", sem.diagnostics.iter().map(|d| (d.message.to_string(), d.labels.iter().map(|l| l.offset()).collect::<Vec<_>>())).collect::<Vec<_>>());
    }
}

#[test]
fn syntax_errors_through_the_loader() {
    let d = tmp("syntaxload");
    fs::write(d.join("a.doc.mjs"), "export default {a: 1 @@};\n").unwrap();
    fs::write(d.join("b.doc.ts"), "export default {name: 'abc,\n b: 1};\n").unwrap();
    fs::write(d.join("c.cjs"), "module.exports = {a: 1,\n").unwrap();
    let e = import_module(&d.join("a.doc.mjs"), &ImportOptions::default()).unwrap_err();
    assert_eq!((e.name.as_str(), e.message.as_str(), e.code.as_deref()), ("SyntaxError", "Invalid or unexpected token", None));
    let e = import_module(&d.join("b.doc.ts"), &ImportOptions::default()).unwrap_err();
    let real = fs::canonicalize(&d).unwrap();
    assert_eq!(e.name, "Error");
    assert_eq!(e.message, format!("ParseError: Unterminated string constant.  \n {}/b.doc.ts:1:22", real.display()));
    let e = import_module(&d.join("c.cjs"), &ImportOptions::default()).unwrap_err();
    assert_eq!((e.name.as_str(), e.message.as_str()), ("SyntaxError", "Unexpected end of input"));
}

#[test]
fn jsx_text_braces_load_as_babel_reads_them() {
    let d = tmp("jsxtext");
    fs::create_dir_all(d.join("node_modules/react")).unwrap();
    fs::write(d.join("node_modules/react/package.json"), "{\"name\":\"react\",\"type\":\"module\",\"exports\":{\"./jsx-runtime\":\"./jsx.js\"}}").unwrap();
    fs::write(d.join("node_modules/react/jsx.js"), "export const jsx = (t, p) => p.children; export const jsxs = jsx;\n").unwrap();
    fs::write(d.join("p.tsx"), "export default <p>a } b > c</p>;\n").unwrap();
    let jiti = JitiOptions { jsx_automatic: true, ..Default::default() };
    let ns = import_module_jiti(&d.join("p.tsx"), &ImportOptions::default(), &jiti).unwrap();
    assert_eq!(ns["default"], serde_json::json!("a } b > c"));
    assert_eq!(
        super::syntax::babel_error("export default function Page() {\n  return <p>unclosed;\n}\n", true, true),
        Some(("Unterminated JSX contents.".to_string(), 2, 12))
    );
}

#[test]
#[ignore]
fn strip_probe() {
    let f = std::env::var("JS_STRIP").unwrap_or_default();
    let src = fs::read_to_string(&f).unwrap();
    let rew = super::syntax::babel_jsx_text(&src);
    eprintln!("jsx text rewrite: {}", rew.is_some());
    if let Some(r) = &rew { fs::write("/tmp/jse_rew.tsx", r).unwrap(); }
    let out = super::transform::strip(&src, Path::new(&f), true, true);
    match &out { Ok(o) => { fs::write("/tmp/jse_strip.js", o).unwrap(); eprintln!("strip ok"); } Err(e) => eprintln!("strip err {e}") }
    if let Ok(o) = out {
        let p = super::transform::rewrite_pow(&o, true);
        eprintln!("pow rewrite: {}", p.is_some());
        let o2 = p.unwrap_or(o);
        let j = super::transform::jiti_import_reads(&o2);
        eprintln!("jiti reads: {}", j.is_some());
        fs::write("/tmp/jse_final.js", j.unwrap_or(o2)).unwrap();
    }
}

#[test]
#[ignore]
fn minify_probe() {
    let p = std::env::var("JS_PROBE").unwrap();
    let text = fs::read_to_string(&p).unwrap();
    let t = std::time::Instant::now();
    let a = oxc::allocator::Allocator::default();
    let ret = oxc::parser::Parser::new(&a, &text, oxc::span::SourceType::cjs()).parse();
    let out = oxc::codegen::Codegen::new().with_options(oxc::codegen::CodegenOptions::minify()).build(&ret.program).code;
    eprintln!("oxc minify {:?}: {} -> {} bytes", t.elapsed(), text.len(), out.len());
    let mut ctx = boa_engine::Context::default();
    let wrapped = format!("(function (exports, require, module, __filename, __dirname) {{{out}\n}})");
    let t = std::time::Instant::now();
    let s = boa_engine::Script::parse(boa_engine::Source::from_bytes(wrapped.as_str()), None, &mut ctx).unwrap();
    eprintln!("parse {:?}", t.elapsed());
    let t = std::time::Instant::now();
    let _ = s.codeblock(&mut ctx).unwrap();
    eprintln!("compile {:?}", t.elapsed());
}

#[test]
#[ignore]
fn parse_input_probe() {
    let p = std::env::var("JS_PROBE").unwrap();
    let text = fs::read_to_string(&p).unwrap();
    let wrapped = format!("(function (exports, require, module, __filename, __dirname) {{{text}\n}})");
    let mut ctx = boa_engine::Context::default();
    let t = std::time::Instant::now();
    let _ = boa_engine::Script::parse(boa_engine::Source::from_bytes(wrapped.as_str()), None, &mut ctx).unwrap();
    eprintln!("utf8 parse {:?}", t.elapsed());
    let u16s: Vec<u16> = wrapped.encode_utf16().collect();
    let mut ctx = boa_engine::Context::default();
    let t = std::time::Instant::now();
    let _ = boa_engine::Script::parse(boa_engine::Source::from_utf16(&u16s), None, &mut ctx).unwrap();
    eprintln!("utf16 parse {:?}", t.elapsed());
    let t = std::time::Instant::now();
    let a = oxc::allocator::Allocator::default();
    let _ = oxc::parser::Parser::new(&a, &wrapped, oxc::span::SourceType::cjs()).parse();
    eprintln!("oxc parse {:?}", t.elapsed());
}

#[test]
#[ignore]
fn boa_runtime_probe() {
    let snippets: Vec<(String, String)> = serde_json::from_str(&fs::read_to_string("/tmp/jse_rt/snippets.json").unwrap()).unwrap();
    let d = tmp("rtprobe");
    for (name, src) in snippets {
        let f = d.join(format!("{name}.mjs"));
        fs::write(&f, format!("{src}\nexport default 1;\n")).unwrap();
        let r = super::engine::with_engine(|e| {
            let (m, _, _) = match e.load(&f, &ImportOptions::default()) { Ok(x) => x, Err(err) => return format!("LOADERR {} | {}", err.name, err.message) };
            let _ = m;
            "ok".to_string()
        });
        let detail = super::engine::LAST_STACK.with(|s| s.borrow().clone());
        eprintln!("{name:24} {r} || {}", detail.replace('\n', "\\n"));
    }
}

#[test]
#[ignore]
fn boa_parse_probe() {
    let f = std::env::var("JS_PARSE").unwrap();
    let src = fs::read_to_string(&f).unwrap();
    let mut ctx = boa_engine::Context::default();
    match boa_engine::Module::parse(boa_engine::Source::from_bytes(src.as_str()), None, &mut ctx) {
        Ok(_) => eprintln!("boa ok"),
        Err(e) => eprintln!("boa err {e:?}"),
    }
}

#[test]
#[ignore]
fn jiti_load_probe() {
    let f = std::env::var("JS_LOAD").unwrap();
    let jiti = JitiOptions { force: true, jsx_automatic: true, ..Default::default() };
    record_loads(true);
    let r = import_module_jiti(Path::new(&f), &ImportOptions::default(), &jiti);
    let loads = record_loads(false);
    eprintln!("loads: {}", loads.len());
    if let Some(l) = loads.last() { eprintln!("last load: {}", l.display()); }
    eprintln!("result: {:?}", r.map(|n| n.keys().cloned().collect::<Vec<_>>()));
}

#[test]
fn jiti_sync_package_exports_use_require_conditions() {
    let d = tmp("syncreg");
    let pkg = d.join("node_modules/reg");
    fs::create_dir_all(&pkg).unwrap();
    fs::write(pkg.join("package.json"), r#"{"name":"reg","exports":{"import":"./index.mjs","require":"./index.cjs"}}"#).unwrap();
    fs::write(pkg.join("index.mjs"), "throw new Error('esm registry exploded');\n").unwrap();
    fs::write(pkg.join("index.cjs"), "exports.icons = {a: 1};\n").unwrap();
    let only = d.join("node_modules/onlyimp");
    fs::create_dir_all(&only).unwrap();
    fs::write(only.join("package.json"), r#"{"name":"onlyimp","exports":{"import":"./i.mjs"}}"#).unwrap();
    fs::write(only.join("i.mjs"), "export const k = 'imp';\n").unwrap();
    fs::write(d.join("theme.ts"), "import {icons} from 'reg';\nimport {k} from 'onlyimp';\nexport const t: number = Object.keys(icons).length;\nexport const kk = k;\n").unwrap();
    let opts = ImportOptions { fresh: true, ..Default::default() };
    let sync = JitiOptions { force: true, sync: true, ..Default::default() };
    let ns = import_module_jiti(&d.join("theme.ts"), &opts, &sync).unwrap();
    assert_eq!(ns["t"], serde_json::json!(1));
    assert_eq!(ns["kk"], serde_json::json!("imp"));
    let not_sync = JitiOptions { force: true, ..Default::default() };
    let e = import_module_jiti(&d.join("theme.ts"), &opts, &not_sync).unwrap_err();
    assert_eq!(e.message, "esm registry exploded");
}

#[test]
fn jiti_sync_unknown_extension_loads_as_js() {
    let d = tmp("synccss");
    fs::write(d.join("x.css"), "").unwrap();
    fs::write(d.join("y.css"), ".a{color:red}\n").unwrap();
    fs::write(d.join("t3.ts"), "import './x.css';\nexport const a = 1;\n").unwrap();
    fs::write(d.join("t2.ts"), "import './y.css';\nexport const a = 1;\n").unwrap();
    let opts = ImportOptions { fresh: true, ..Default::default() };
    let sync = JitiOptions { force: true, sync: true, ..Default::default() };
    let ns = import_module_jiti(&d.join("t3.ts"), &opts, &sync).unwrap();
    assert_eq!(ns["a"], serde_json::json!(1));
    let e = import_module_jiti(&d.join("t2.ts"), &opts, &sync).unwrap_err();
    assert_eq!(e.to_js_string(), "SyntaxError: Unexpected token '.'");
    let not_sync = JitiOptions { force: true, ..Default::default() };
    let e = import_module_jiti(&d.join("t3.ts"), &opts, &not_sync).unwrap_err();
    assert!(e.message.starts_with("Unknown file extension \".css\""), "{}", e.message);
}

/// Runtime errors read as V8 words them (recorded by
/// testdata/runtime-oracle.mjs).
#[test]
fn runtime_errors_match_node() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let cases: Vec<Value> = serde_json::from_str(&fs::read_to_string(crate_dir.join("src/js/testdata/runtime.json")).unwrap()).unwrap();
    let d = tmp("runtime");
    let mut bad = Vec::new();
    for c in &cases {
        let name = c["name"].as_str().unwrap();
        let f = d.join(format!("{name}.mjs"));
        fs::write(&f, format!("{}\nexport default 1;\n", c["source"].as_str().unwrap())).unwrap();
        let got = match import_module(&f, &ImportOptions::default()) {
            Ok(_) => Value::Null,
            Err(e) => serde_json::json!({"name": e.name, "message": e.message}),
        };
        let want = c["error"].clone();
        if got != want {
            bad.push(format!("{name}: {}\n  got:  {got}\n  want: {want}", c["source"].as_str().unwrap()));
        }
    }
    eprintln!("{}/{} match", cases.len() - bad.len(), cases.len());
    assert!(bad.is_empty(), "{} differ:\n{}", bad.len(), bad.join("\n"));
}

#[test]
#[ignore]
fn parse_only_probe() {
    let p = std::env::var("JS_PROBE").unwrap();
    let text = fs::read_to_string(&p).unwrap();
    let wrapped = format!("(function (exports, require, module, __filename, __dirname) {{{text}\n}})");
    let mut ctx = boa_engine::Context::default();
    let t = std::time::Instant::now();
    let s = boa_engine::Script::parse(boa_engine::Source::from_bytes(wrapped.as_str()), None, &mut ctx).unwrap();
    eprintln!("parse {:?}", t.elapsed());
    if std::env::var("JS_COMPILE").is_ok() {
        let t = std::time::Instant::now();
        let _ = s.codeblock(&mut ctx).unwrap();
        eprintln!("compile {:?}", t.elapsed());
    }
}

#[test]
fn source_overrides_replace_file_text() {
    let d = tmp("override");
    fs::write(d.join("dep.ts"), "export const v: number = 1;\n").unwrap();
    fs::write(d.join("root.ts"), "import {v} from './dep';\nexport const got = v;\n").unwrap();
    let jiti = JitiOptions { source_overrides: vec![(d.join("dep.ts"), "export const v: number = 42;\n".into())], ..Default::default() };
    let ns = import_module_jiti(&d.join("root.ts"), &ImportOptions::default(), &jiti).unwrap();
    assert_eq!(ns["got"], serde_json::json!(42));
    let ns = import_module(&d.join("root.ts"), &ImportOptions::default()).unwrap();
    assert_eq!(ns["got"], serde_json::json!(1));
}
