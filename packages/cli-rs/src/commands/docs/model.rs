//! The CLI's own docs, compiled ahead of time by `scripts/gen-docs-model.mjs`
//! into `docs-model.json`: the docs tree, the topic list, and every topic read
//! in each language, once for each package manager a doc's `{@pm}` steps
//! render for. Strings are interned: a string is its index in `strings`, a
//! number is `{"#": n}`.

use crate::json::{Map, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

const MODEL: &str = include_str!("docs-model.json");

/// The package managers the model holds a variant for.
pub const PMS: &[&str] = &["npm", "pnpm", "yarn", "yarn-classic", "bun"];

#[derive(serde::Deserialize)]
struct Raw<'a> {
    strings: Vec<String>,
    #[serde(borrow, rename = "cliTree")]
    cli_tree: &'a serde_json::value::RawValue,
    #[serde(borrow)]
    variants: HashMap<String, &'a serde_json::value::RawValue>,
}

#[derive(serde::Deserialize)]
struct RawVariant<'a> {
    #[serde(borrow)]
    nodes: &'a serde_json::value::RawValue,
    #[serde(borrow)]
    topics: &'a serde_json::value::RawValue,
    #[serde(borrow)]
    reads: HashMap<String, &'a serde_json::value::RawValue>,
}

fn raw() -> &'static Raw<'static> {
    static RAW: OnceLock<Raw<'static>> = OnceLock::new();
    RAW.get_or_init(|| serde_json::from_str(MODEL).expect("docs model parses"))
}

fn decode(v: Value, strings: &[String]) -> Value {
    match v {
        Value::Number(n) => {
            let i = n.as_u64().unwrap_or(0) as usize;
            Value::String(strings.get(i).cloned().unwrap_or_default())
        }
        Value::Array(a) => Value::Array(a.into_iter().map(|x| decode(x, strings)).collect()),
        Value::Object(o) => {
            if o.len() == 1 {
                if let Some(n) = o.get("#") {
                    return n.clone();
                }
            }
            let mut m = Map::new();
            for (k, v) in o {
                m.insert(k, decode(v, strings));
            }
            Value::Object(m)
        }
        other => other,
    }
}

fn decode_raw(r: &serde_json::value::RawValue) -> Value {
    let v: Value = serde_json::from_str(r.get()).expect("docs model value parses");
    decode(v, &raw().strings)
}

/// The CLI's own docs-tree inputs: `{namespaces, docs}`.
pub fn cli_tree_inputs() -> Value {
    decode_raw(raw().cli_tree)
}

/// One package manager's docs.
pub struct Variant {
    raw: RawVariant<'static>,
}

impl Variant {
    pub fn get(pm: &str) -> Variant {
        let r = raw();
        let pm = if r.variants.contains_key(pm) { pm } else { "npm" };
        let v: RawVariant<'static> = serde_json::from_str(r.variants[pm].get()).expect("docs model variant parses");
        Variant { raw: v }
    }
    /// Every tree node, in route order.
    pub fn nodes(&self) -> Vec<Value> {
        match decode_raw(self.raw.nodes) {
            Value::Array(a) => a,
            _ => Vec::new(),
        }
    }
    /// Every catalog topic, in catalog order.
    pub fn topics(&self) -> Vec<Value> {
        match decode_raw(self.raw.topics) {
            Value::Array(a) => a,
            _ => Vec::new(),
        }
    }
    /// One topic read: `topic:<name>:<lang>` or `guide:<route>:<lang>`.
    pub fn read(&self, key: &str) -> Option<Value> {
        self.raw.reads.get(key).map(|r| decode_raw(r))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discovery::doc_compiler::tree::*;

    /// The tree built again from the CLI's inputs is the tree in the model.
    #[test]
    fn tree_rebuilds() {
        let inputs = cli_tree_inputs();
        let variant = Variant::get("npm");
        let model = variant.nodes();
        let (ns, docs, topics) = super::super::runtime::cli_inputs(&inputs, &model);
        let tree = build_docs_tree(&ns, &docs, &topics);
        assert!(tree.diagnostics.is_empty(), "{:?}", tree.diagnostics);
        let built: Vec<String> = tree.nodes.iter().map(|n| n.route.clone()).collect();
        let want: Vec<String> = model.iter().map(|n| n["route"].as_str().unwrap().to_string()).collect();
        assert_eq!(built, want);
        for (n, m) in tree.nodes.iter().zip(model.iter()) {
            let v = n.to_model(&tree, None, vec![]);
            for k in ["id", "kind", "title", "parent", "provider", "generated", "flatTopic", "topicFile", "selfDoc", "experimental", "slots"] {
                assert_eq!(v[k], m[k], "{} {k}", n.route);
            }
        }
    }

    /// The embedded model matches what the generator makes from the CLI's
    /// docs today.
    #[test]
    fn model_is_current() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let Ok(status) = std::process::Command::new("node").arg(dir.join("scripts/gen-docs-model.mjs")).arg("--check").status() else {
            eprintln!("node is not installed: skipping the docs model check");
            return;
        };
        assert!(status.success(), "docs-model.json is stale: run node scripts/gen-docs-model.mjs");
    }
}
