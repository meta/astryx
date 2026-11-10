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
