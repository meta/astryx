//! The one seam every doc reader loads a module through
//! (`foundation/doc-compiler/import.mjs`).
//!
//! The CLI's own doc modules (CommandDocs, `assets/docs`, template docs,
//! self-docs) come from the namespaces `scripts/gen-own-modules.mjs`
//! embedded at build time; anything else (the user's project,
//! `node_modules`) loads at run time through `crate::js`.

use super::nodepath as np;
use super::paths;
use crate::js::{ImportOptions, JsError, Namespace};
use crate::json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Which JS loader a read uses (`LOADERS` in read.mjs).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Loader {
    /// jiti for `.ts`, native otherwise (`importDocModule`).
    User,
    /// A plain `import()` (`importNativeModule`).
    Native,
    /// jiti with JSX for `.ts` (`importTemplateModule`).
    Template,
}

static OWN: &str = include_str!("generated/own-modules.json");

struct Own {
    hashes: Map<String, Value>,
    modules: Map<String, Value>,
}

fn own() -> &'static Own {
    static O: OnceLock<Own> = OnceLock::new();
    O.get_or_init(|| {
        let v: Value = serde_json::from_str(OWN).expect("embedded own-modules.json");
        let Value::Object(mut m) = v else { panic!("own-modules.json") };
        let take = |m: &mut Map<String, Value>, k: &str| match m.remove(k) {
            Some(Value::Object(o)) => o,
            _ => Map::new(),
        };
        Own { hashes: take(&mut m, "hashes"), modules: take(&mut m, "modules") }
    })
}

/// The path of `file` relative to the CLI root, when it lies inside it.
pub fn cli_relative(file: &str) -> Option<String> {
    let root = paths::cli_root();
    let abs = np::resolve1(file);
    let rel = np::relative(root, &abs);
    if rel.is_empty() || rel.starts_with("..") || np::is_absolute(&rel) {
        return None;
    }
    Some(rel)
}

/// The embedded namespace of a CLI-owned module, if one was embedded.
pub fn embedded(file: &str) -> Option<Result<Namespace, JsError>> {
    let rel = cli_relative(file)?;
    let entry = own().modules.get(&rel)?;
    if let Some(Value::Object(ns)) = entry.get("ok") {
        return Some(Ok(ns.clone()));
    }
    let e = entry.get("error")?;
    Some(Err(JsError {
        name: e.get("name").and_then(|v| v.as_str()).unwrap_or("").into(),
        message: e.get("message").and_then(|v| v.as_str()).unwrap_or("").into(),
        code: e.get("code").and_then(|v| v.as_str()).map(String::from),
        file: PathBuf::from(file),
    }))
}

/// Import a doc module with the given loader.
pub fn import(file: &str, loader: Loader) -> Result<Namespace, JsError> {
    if let Some(r) = embedded(file) {
        return r;
    }
    let jsx = loader == Loader::Template && file.ends_with(".ts");
    crate::js::import_module(Path::new(file), &ImportOptions { jsx, fresh: false })
}

/// `importDocModule(file)`.
pub fn import_doc_module(file: &str) -> Result<Namespace, JsError> {
    import(file, Loader::User)
}

/// `importNativeModule(file)`.
pub fn import_native_module(file: &str) -> Result<Namespace, JsError> {
    import(file, Loader::Native)
}

/// `importTemplateModule(file)`.
pub fn import_template_module(file: &str) -> Result<Namespace, JsError> {
    import(file, Loader::Template)
}

/// A value is the JS `undefined` marker (or absent).
pub fn is_undefined(v: Option<&Value>) -> bool {
    match v {
        None => true,
        Some(Value::Object(m)) => m.len() == 1 && m.get("__js").and_then(|x| x.as_str()) == Some("undefined"),
        _ => false,
    }
}

/// `v == null` in JS: absent, `undefined` or `null`.
pub fn is_nullish(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::Null)) || is_undefined(v)
}

/// `a ?? b ?? ...` over namespace exports.
pub fn first_export<'a>(ns: &'a Namespace, names: &[&str]) -> Option<&'a Value> {
    let mut last = None;
    for n in names {
        let v = ns.get(*n);
        if !is_nullish(v) {
            return v;
        }
        last = v;
    }
    last
}

/// Hashes of the sources the embedded namespaces came from.
pub fn embedded_hashes() -> &'static Map<String, Value> {
    &own().hashes
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;

    /// The embedded namespaces were generated from the CLI sources as they
    /// are now: regenerate with `node scripts/gen-own-modules.mjs <cli>`.
    #[test]
    fn embedded_modules_are_fresh() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("cli");
        let mut stale = Vec::new();
        for (rel, want) in embedded_hashes() {
            let got = std::fs::read(root.join(rel))
                .map(|b| sha2::Sha256::digest(&b).iter().map(|x| format!("{x:02x}")).collect::<String>())
                .unwrap_or_default();
            if Some(got.as_str()) != want.as_str() {
                stale.push(rel.clone());
            }
        }
        assert!(stale.is_empty(), "stale embedded modules (rerun scripts/gen-own-modules.mjs): {stale:?}");
    }
}
