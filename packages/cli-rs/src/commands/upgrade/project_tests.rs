//! Ports of the JS tests whose fixtures need real folders: the v0.6.7
//! copied-themes project codemod and v0.7.0 described themes.

use super::registry::registry;
use super::runner::{run_codemods, RunOptions, RunOutcome};
use super::transforms;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

struct TempDir(PathBuf);
impl TempDir {
    fn new(tag: &str) -> TempDir {
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let p = std::env::temp_dir().join(format!("astryx-rs-{}-{}-{}", tag, std::process::id(), n));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        TempDir(std::fs::canonicalize(&p).unwrap())
    }
    fn write(&self, rel: &str, text: &str) -> PathBuf {
        let f = self.0.join(rel);
        std::fs::create_dir_all(f.parent().unwrap()).unwrap();
        std::fs::write(&f, text).unwrap();
        f
    }
}
impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn camel_stem(slug: &str) -> String {
    let mut out = String::new();
    let mut up = false;
    for c in slug.chars() {
        if c == '-' {
            up = true;
        } else if up {
            out.extend(c.to_uppercase());
            up = false;
        } else {
            out.push(c);
        }
    }
    format!("{}Theme", out)
}

fn write_copy(root: &TempDir, slug: &str) -> (PathBuf, String, String) {
    let stem = camel_stem(slug);
    let dir = root.0.join("src/themes").join(slug);
    let source = format!("export const {} = {{name: '{}'}};\n", stem, slug);
    root.write(&format!("src/themes/{}/{}.ts", slug, stem), &source);
    root.write(&format!("src/themes/{}/icons.tsx", slug), "export const icons = {};\n");
    (dir, stem, source)
}

fn run_next(root: &Path, apply: bool) -> (usize, usize) {
    let manifests: Vec<_> = registry().versions.iter().filter(|m| m.version == "0.6.7").cloned().collect();
    let mut out = crate::cli::command::Out::new(false, root.to_path_buf());
    let skip = HashSet::new();
    let o = RunOptions { apply, path: root, codemod: None, skip: &skip, silent: true, root, covers_target: true };
    let prot = super::protection::Resolver::new(root, Default::default()).unwrap();
    let mut outcomes = Vec::new();
    match run_codemods(&mut out, &manifests, &o, prot, &mut outcomes) {
        RunOutcome::Done(r) => (r.errors.len(), r.total_files_changed),
        RunOutcome::SourceMissing => panic!("source missing"),
    }
}

fn copied() -> transforms::ProjectFn {
    transforms::get_project("v0.6.7/migrate-copied-themes-to-descriptors").expect("project codemod registered")
}

#[test]
fn copied_themes_is_a_project_codemod() {
    let m = registry().versions.iter().find(|m| m.version == "0.6.7").unwrap();
    let rows: Vec<(String, Option<String>)> = m.transforms.iter().map(|t| (t.name.clone(), t.codemod_type.clone())).collect();
    assert_eq!(rows, vec![("migrate-copied-themes-to-descriptors".to_string(), Some("project".to_string()))]);
}

#[test]
fn copied_themes_writes_only_the_missing_descriptor() {
    let root = TempDir::new("copied");
    root.write("package.json", "{\"name\":\"app\",\"version\":\"1.0.0\"}\n");
    let (dir, stem, source) = write_copy(&root, "deep-sea");
    let icons = std::fs::read_to_string(dir.join("icons.tsx")).unwrap();
    let (errors, changed) = run_next(&root.0, true);
    assert_eq!((errors, changed), (0, 1));
    assert_eq!(std::fs::read_to_string(dir.join(format!("{}.ts", stem))).unwrap(), source);
    assert_eq!(std::fs::read_to_string(dir.join("icons.tsx")).unwrap(), icons);
    assert_eq!(
        std::fs::read_to_string(dir.join(format!("{}.doc.mjs", stem))).unwrap(),
        "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {\n  type: 'theme',\n  name: 'deep-sea',\n  displayName: 'Deep Sea',\n  description: 'Deep Sea theme copied into this app.',\n  maintained: false,\n};\n"
    );
}

#[test]
fn copied_themes_leaves_non_copies_and_described_themes() {
    let root = TempDir::new("copied2");
    root.write("package.json", "{\"name\":\"app\",\"version\":\"1.0.0\"}\n");
    let (_dir, stem, _) = write_copy(&root, "ocean");
    root.write(&format!("src/themes/ocean/{}.doc.mjs", stem), "export default {type: 'theme', name: 'ocean', displayName: 'Mine', description: '', maintained: false};\n");
    root.write("src/themes/not-a-theme/helper.ts", "export const helper = true;\n");
    root.write("src/themes/nested/source/nestedTheme.ts", "export const nestedTheme = {};\n");
    root.write("src/themes/ambiguous/firstTheme.ts", "export const firstTheme = {};\n");
    root.write("src/themes/ambiguous/secondTheme.ts", "export const secondTheme = {};\n");
    let plan = copied()(&root.0).unwrap();
    assert!(plan.writes.is_empty() && plan.deletes.is_empty() && plan.problems.is_empty());
}

#[test]
fn copied_themes_is_a_fixed_point() {
    let root = TempDir::new("copied3");
    root.write("package.json", "{\"name\":\"app\",\"version\":\"1.0.0\"}\n");
    let (dir, stem, source) = write_copy(&root, "ocean");
    let first = run_next(&root.0, true);
    let descriptor = std::fs::read_to_string(dir.join(format!("{}.doc.mjs", stem))).unwrap();
    let second = run_next(&root.0, true);
    assert_eq!(first, (0, 1));
    assert_eq!(second, (0, 0));
    assert_eq!(std::fs::read_to_string(dir.join(format!("{}.doc.mjs", stem))).unwrap(), descriptor);
    assert_eq!(std::fs::read_to_string(dir.join(format!("{}.ts", stem))).unwrap(), source);
}

const THEME_DOC: &str = "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {\n  type: 'theme',\n  name: 'brand',\n  displayName: 'Brand',\n  description: 'A brand theme.',\n  maintained: false,\n};\n";

fn surface(source: &str, path: &Path) -> String {
    let t = transforms::get("v0.7.0/migrate-deprecated-theme-surface").unwrap();
    t(source, &path.display().to_string(), &serde_json::Value::Null).unwrap().unwrap_or_else(|| source.to_string())
}

#[test]
fn described_theme_direct_object_is_renamed() {
    let dir = TempDir::new("surface1");
    dir.write("brandTheme.doc.mjs", THEME_DOC);
    let out = surface("export const brandTheme = {name: 'brand', components: {navicon: {base: {}}}};", &dir.0.join("brandTheme.ts"));
    assert!(out.contains("'nav-icon':"), "{out}");
    assert!(!super::jsre::test(r"navicon\s*:", "", &out));
}

#[test]
fn described_theme_only_the_declared_binding() {
    let dir = TempDir::new("surface2");
    dir.write("brandTheme.doc.mjs", THEME_DOC);
    let out = surface(
        "export const brandTheme = {name: 'brand', components: {navicon: {base: {}}}};\nexport const otherLibraryTheme = {\n  name: 'other',\n  components: {checkbox: {root: {}}, textarea: {root: {}}},\n};",
        &dir.0.join("brandTheme.ts"),
    );
    assert!(out.contains("'nav-icon':"));
    assert!(out.contains("components: {checkbox: {root: {}}, textarea: {root: {}}}"));
    assert!(!out.contains("checkbox-indicator") && !out.contains("text-area"));
}

#[test]
fn described_theme_follows_exported_local() {
    let dir = TempDir::new("surface3");
    dir.write("brandTheme.doc.mjs", THEME_DOC);
    let out = surface("const theme = {name: 'brand', components: {navicon: {base: {}}}} as const;\nexport {theme as brandTheme};", &dir.0.join("brandTheme.ts"));
    assert!(out.contains("'nav-icon':"));
}

#[test]
fn described_theme_ignores_unexported_or_nested() {
    let dir = TempDir::new("surface4");
    dir.write("brandTheme.doc.mjs", THEME_DOC);
    for input in [
        "const brandTheme = {name: 'brand', components: {navicon: {base: {}}}};",
        "export function make() {\n  const brandTheme = {name: 'brand', components: {navicon: {base: {}}}};\n  return brandTheme;\n}",
    ] {
        assert_eq!(surface(input, &dir.0.join("brandTheme.ts")), input);
    }
}

#[test]
fn described_theme_other_stem_or_kind_is_no_proof() {
    let input = "export const brandTheme = {name: 'brand', components: {navicon: {base: {}}}};";
    let other_stem = TempDir::new("surface5");
    other_stem.write("otherTheme.doc.mjs", THEME_DOC);
    assert_eq!(surface(input, &other_stem.0.join("brandTheme.ts")), input);
    let other_kind = TempDir::new("surface6");
    other_kind.write("brandTheme.doc.mjs", "export default {name: \"brand\", props: []};\n");
    assert_eq!(surface(input, &other_kind.0.join("brandTheme.ts")), input);
}
