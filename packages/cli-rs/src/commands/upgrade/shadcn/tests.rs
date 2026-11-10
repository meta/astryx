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

#[test]
fn equivalence_matches_recorded_cases() {
    let cases: Vec<Value> = serde_json::from_str(include_str!("testdata/eq_cases.json")).unwrap();
    let mut bad = Vec::new();
    for (i, c) in cases.iter().enumerate() {
        let (a, b, want) = (c["a"].as_str().unwrap(), c["b"].as_str().unwrap(), c["eq"].as_bool().unwrap());
        if sources_equivalent(a, b) != want {
            bad.push(format!("#{i} {a:?} vs {b:?}: want {want}"));
        }
    }
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}

#[test]
fn diff3_matches_node_diff3() {
    use super::diff3::{merge_diff3, Labels};
    let cases: Vec<Value> = serde_json::from_str(include_str!("testdata/diff3_cases.json")).unwrap();
    for c in &cases {
        let split = |k: &str| c[k].as_str().unwrap().split('\n').map(String::from).collect::<Vec<_>>();
        let (conflict, result) = merge_diff3(&split("a"), &split("o"), &split("b"), &Labels { a: "current project", o: "installed 1", b: "latest 2" });
        let want: Vec<String> = c["result"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
        assert_eq!((conflict, result), (c["conflict"].as_bool().unwrap(), want), "{c}");
    }
}

#[test]
fn zod_issues_match_recorded_messages() {
    use super::receipt::{parse_receipt, parse_upgrade_item};
    let cases: Value = serde_json::from_str(include_str!("testdata/zod_cases.json")).unwrap();
    for (key, parse) in [("receipts", true), ("items", false)] {
        for c in cases[key].as_array().unwrap() {
            let input: crate::json::Value = serde_json::from_value(c["input"].clone()).unwrap();
            let got = if parse { parse_receipt(&input).map(|_| ()) } else { parse_upgrade_item(&input).map(|_| ()) };
            match (c.get("error").and_then(|e| e.as_str()), got) {
                (None, Ok(())) => {}
                (Some(want), Err(got)) => assert_eq!(got, want, "input {}", c["input"]),
                (want, got) => panic!("input {}: want {want:?}, got {got:?}", c["input"]),
            }
        }
    }
}

// receipt.test.mjs

fn sample_receipt() -> super::receipt::Receipt {
    use super::receipt::*;
    let target = "components/astryx/examples/ButtonExample.tsx";
    let content = "export default function Example(): null { return null; }\n";
    create_receipt(
        Item { name: "example-button-basic".into(), path: "examples/button/basic".into(), aliases: vec!["examples/button/old-basic".into()], kind: "example".into() },
        "0.6.0",
        &receipt_target(target, "example-button-basic"),
        vec![CreateFile { id: "primary", target, registry_path: "registry/example-button-basic/ButtonExample.tsx", content, variants: vec![(&js_target(target), transform(content).unwrap())] }],
    )
    .unwrap()
}

#[test]
fn places_a_unique_receipt_beside_the_copied_source() {
    assert_eq!(super::receipt::receipt_target("components/astryx/examples/ButtonExample.tsx", "example-button-basic"), "components/astryx/examples/.astryx/example-button-basic.json");
}

#[test]
fn records_the_installed_base_bytes_and_a_relative_target() {
    use super::receipt::*;
    let r = sample_receipt();
    assert_eq!(r.schema_version, 2);
    let f = &r.files[0];
    assert_eq!((f.id.as_str(), f.target.as_str(), f.registry_target.as_str(), f.registry_path.as_str()), ("primary", "../ButtonExample.tsx", "components/astryx/examples/ButtonExample.tsx", "registry/example-button-basic/ButtonExample.tsx"));
    assert_eq!(f.sha256, content_hash(&f.content));
    let v = &f.variants.as_ref().unwrap()[0];
    assert_eq!((v.format.as_str(), v.target.as_str(), v.registry_target.as_str()), ("javascript", "../ButtonExample.jsx", "components/astryx/examples/ButtonExample.jsx"));
    assert_eq!(v.sha256, content_hash(&v.content));
    let back = parse_receipt(&json_parse(&r.serialize()).unwrap()).unwrap();
    assert_eq!(back, r);
}

#[test]
fn rejects_duplicates_traversal_and_corrupt_hashes() {
    use super::receipt::*;
    let base = sample_receipt().to_value();
    let with = |f: &dyn Fn(&mut crate::json::Value)| {
        let mut v = base.clone();
        f(&mut v);
        parse_receipt(&v).err().unwrap_or_default()
    };
    assert!(with(&|v| {
        let f0 = v["files"][0].clone();
        v["files"].as_array_mut().unwrap().push(f0);
    })
    .contains("must be unique"));
    assert!(with(&|v| {
        let x = v["files"][0]["variants"][0].clone();
        v["files"][0]["variants"].as_array_mut().unwrap().push(x);
    })
    .contains("variant formats must be unique"));
    assert!(with(&|v| v["files"][0]["variants"][0]["target"] = "../../outside.jsx".into()).contains("adjacent source file"));
    for t in ["../../outside.tsx", "../.", "../.."] {
        assert!(with(&|v| v["files"][0]["target"] = t.into()).contains("adjacent source file"));
    }
    assert!(with(&|v| v["source"]["version"] = "0.6.0\n<<<<<<< injected".into()).contains("semantic version"));
    assert!(!with(&|v| v["files"][0]["sha256"] = "not-a-hash".into()).is_empty());
}

// source-variants.test.mjs

#[test]
fn uses_the_target_extension_shadcn_writes() {
    assert_eq!(js_target("components/Example.tsx"), "components/Example.jsx");
    assert_eq!(js_target("hooks/useExample.ts"), "hooks/useExample.js");
    assert_eq!(js_target("components/Example.jsx"), "components/Example.jsx");
}

#[test]
fn matches_the_pinned_typescript_stripping_shape() {
    let src = "'use client';\n\nimport type {ReactNode} from 'react';\nconst value: ReactNode = null;\nexport default function Example() { return value; }\n";
    assert_eq!(transform(src).unwrap(), "'use client';;\nconst value = null;\nexport default function Example() { return value; }\n");
}

#[test]
fn is_idempotent_for_precompiled_jsx() {
    let src = "export default function Example() { return <Component label='A long label' value='A long value' onChange={() => {}} />; }\n";
    let once = transform(src).unwrap();
    assert_eq!(transform(&once).unwrap(), once);
}

#[test]
fn emits_a_narrow_declaration_for_precompiled_javascript() {
    assert_eq!(
        precompiled_declaration("components/astryx/examples/Example.jsx").unwrap(),
        "declare module '*components/astryx/examples/Example' {\n  const Component: import('react').ComponentType;\n  export default Component;\n}\n"
    );
    assert_eq!(precompiled_declaration_target("components/astryx/examples/Example.jsx").unwrap(), "components/astryx/examples/Example.astryx.d.mts");
    assert!(precompiled_declaration("components/Example.tsx").unwrap_err().contains("must be JavaScript"));
}
