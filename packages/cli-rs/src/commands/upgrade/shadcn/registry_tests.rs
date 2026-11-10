//! `api/upgrade/registry/registry.test.mjs`, ported with a fake fetch.

use super::receipt::{create_receipt, receipt_target, CreateFile, Item, Receipt};
use super::source_variants::{js_target, precompiled_declaration, precompiled_declaration_target, transform};
use crate::commands::upgrade::registry_compositions::*;
use crate::json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

const SOURCE_TARGET: &str = "components/astryx/examples/ButtonBasic.tsx";
const REGISTRY_PATH: &str = "registry/example-button-basic/ButtonBasic.tsx";

fn item() -> Item {
    Item { name: "example-button-basic".into(), path: "examples/button/basic".into(), aliases: vec![], kind: "example".into() }
}

fn receipt_path_rel() -> String {
    receipt_target(SOURCE_TARGET, "example-button-basic")
}

struct Project {
    dir: PathBuf,
}

impl Project {
    fn new() -> Project {
        static N: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!("astryx-composition-upgrade-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("src")).unwrap();
        Project { dir }
    }
    fn root(&self) -> PathBuf {
        self.dir.join("src")
    }
}

impl Drop for Project {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[derive(Default)]
struct Over {
    target: Option<String>,
    registry_path: Option<String>,
    receipt_target: Option<String>,
    item: Option<Item>,
    version: Option<String>,
    variants: Vec<(String, String)>,
    extra: Vec<(String, String, String, String)>,
    source_content: Option<String>,
}

fn js_variant(content: &str) -> (String, String) {
    (js_target(SOURCE_TARGET), transform(content).unwrap())
}

fn receipt(content: &str, o: &Over) -> Receipt {
    let target = o.target.clone().unwrap_or(SOURCE_TARGET.into());
    let registry_path = o.registry_path.clone().unwrap_or(REGISTRY_PATH.into());
    let it = o.item.clone().unwrap_or_else(item);
    let rt = o.receipt_target.clone().unwrap_or_else(|| receipt_target(&target, &it.name));
    create_receipt(
        it,
        o.version.as_deref().unwrap_or("0.5.0"),
        &rt,
        vec![CreateFile { id: "primary", target: &target, registry_path: &registry_path, content, variants: o.variants.iter().map(|(t, c)| (t.as_str(), c.clone())).collect() }],
    )
    .unwrap()
}

fn legacy(r: &Receipt) -> String {
    let mut v = r.to_value();
    v["schemaVersion"] = Value::from(1u64);
    if let Some(Value::Object(f)) = v["files"].get_mut(0) {
        f.shift_remove("variants");
    }
    format!("{}\n", crate::json::stringify(&v, 2))
}

fn write(p: &Path, text: &str) {
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, text).unwrap();
}

/// `seed({base, current, receiptValue, sourceTarget, receiptTarget})`
fn seed(p: &Project, current: Option<&str>, receipt_text: &str, source_target: &str, receipt_target_rel: &str) -> (PathBuf, PathBuf) {
    let source = p.root().join(source_target);
    let rp = p.root().join(receipt_target_rel);
    std::fs::create_dir_all(source.parent().unwrap()).unwrap();
    if let Some(c) = current {
        write(&source, c);
    }
    write(&rp, receipt_text);
    (source, rp)
}

fn seed_basic(p: &Project, base: &str, current: Option<&str>) -> (PathBuf, PathBuf) {
    seed(p, current, &receipt(base, &Over::default()).serialize(), SOURCE_TARGET, &receipt_path_rel())
}

fn ok_body(body: String) -> Result<FetchResponse, String> {
    Ok(FetchResponse { status: 200, content_length: None, body: body.into_bytes() })
}

/// `remote(latest, overrides)`: the registry item body.
fn remote_body(latest: &str, o: &Over) -> String {
    let it = o.item.clone().unwrap_or_else(item);
    let target = o.target.clone().unwrap_or(SOURCE_TARGET.into());
    let registry_path = o.registry_path.clone().unwrap_or(REGISTRY_PATH.into());
    let base_rt = receipt_target(&target, &it.name);
    let mut files = vec![CreateFile { id: "primary", target: &target, registry_path: &registry_path, content: latest, variants: o.variants.iter().map(|(t, c)| (t.as_str(), c.clone())).collect() }];
    for (id, t, rp, c) in &o.extra {
        files.push(CreateFile { id, target: t, registry_path: rp, content: c, variants: vec![] });
    }
    let next = create_receipt(it.clone(), o.version.as_deref().unwrap_or("0.6.0"), &base_rt, files).unwrap();
    let mut out_files = Vec::new();
    let mut push = |path: &str, ty: &str, target: &str, content: &str| {
        let mut m = Map::new();
        m.insert("path".into(), Value::String(path.into()));
        m.insert("type".into(), Value::String(ty.into()));
        m.insert("target".into(), Value::String(target.into()));
        m.insert("content".into(), Value::String(content.into()));
        out_files.push(Value::Object(m));
    };
    push(&registry_path, "registry:block", &target, o.source_content.as_deref().unwrap_or(latest));
    for (id, t, rp, c) in &o.extra {
        push(rp, if id == "types" { "registry:file" } else { "registry:block" }, t, c);
    }
    push(&format!("registry/{}/astryx-receipt.json", it.name), "registry:file", o.receipt_target.as_deref().unwrap_or(&base_rt), &next.serialize());
    let mut m = Map::new();
    m.insert("name".into(), Value::String(it.name.clone()));
    m.insert("type".into(), Value::String(if it.kind == "page" { "registry:page" } else { "registry:block" }.into()));
    m.insert("files".into(), Value::Array(out_files));
    crate::json::stringify(&Value::Object(m), 0)
}

struct Remote {
    body: String,
    calls: Mutex<Vec<String>>,
}

impl Remote {
    fn new(latest: &str, o: &Over) -> Remote {
        Remote { body: remote_body(latest, o), calls: Mutex::new(vec![]) }
    }
}

impl Fetcher for Remote {
    fn fetch(&self, url: &str) -> Result<FetchResponse, String> {
        self.calls.lock().unwrap().push(url.into());
        ok_body(self.body.clone())
    }
}

fn reconcile(p: &Project, apply: bool, f: &dyn Fetcher, expected: Option<&str>, origin: Option<&Path>) -> Reconciled {
    let ctx = Ctx { cwd: &p.dir, origin, fetcher: f, registry_origin: "https://registry.example.test", expected_version: expected, require_expected_version: false };
    reconcile_registry_compositions(apply, Some("src"), &ctx).map_err(|e| e.message).unwrap()
}

fn get<'a>(s: &'a Map<String, Value>, k: &str) -> &'a Value {
    s.get(k).unwrap()
}

fn num(s: &Map<String, Value>, k: &str) -> i64 {
    get(s, k).as_i64().unwrap()
}

fn read(p: &Path) -> String {
    std::fs::read_to_string(p).unwrap()
}

fn item0(s: &Map<String, Value>) -> &Value {
    &get(s, "items")[0]
}

#[test]
fn discovers_only_json_receipts_inside_astryx_dirs() {
    let p = Project::new();
    let (_, rp) = seed_basic(&p, "base\n", Some("base\n"));
    write(&rp.parent().unwrap().join("notes.txt"), "ignore");
    write(&p.root().join("node_modules/x/.astryx/ignored.json"), "{}");
    assert_eq!(discover_registry_receipts(&p.root()), vec![rp]);
}

#[test]
fn bounds_concurrent_registry_fetches() {
    let p = Project::new();
    let mut bodies = std::collections::HashMap::new();
    for i in 0..12 {
        let it = Item { name: format!("example-test-{i}"), path: format!("examples/test/item-{i}"), aliases: vec![], kind: "example".into() };
        let st = format!("components/astryx/examples/Test{i}.tsx");
        let rp = format!("registry/{}/Test{i}.tsx", it.name);
        let rt = receipt_target(&st, &it.name);
        let installed = create_receipt(it.clone(), "0.5.0", &rt, vec![CreateFile { id: "primary", target: &st, registry_path: &rp, content: "old\n", variants: vec![] }]).unwrap();
        seed(&p, Some("old\n"), &installed.serialize(), &st, &rt);
        let o = Over { item: Some(it.clone()), target: Some(st.clone()), registry_path: Some(rp.clone()), ..Default::default() };
        bodies.insert(format!("https://registry.example.test/{}.json", it.path), remote_body("new\n", &o));
    }
    let active = AtomicUsize::new(0);
    let max = AtomicUsize::new(0);
    let f = |url: &str| -> Result<FetchResponse, String> {
        let a = active.fetch_add(1, Ordering::SeqCst) + 1;
        max.fetch_max(a, Ordering::SeqCst);
        std::thread::sleep(std::time::Duration::from_millis(20));
        active.fetch_sub(1, Ordering::SeqCst);
        match bodies.get(url) {
            Some(b) => ok_body(b.clone()),
            None => Ok(FetchResponse { status: 404, content_length: None, body: b"not found".to_vec() }),
        }
    };
    let r = reconcile(&p, false, &f, None, None);
    assert_eq!(num(&r.summary, "found"), 12);
    assert_eq!(num(&r.summary, "wouldUpdate"), 12);
    assert_eq!(max.load(Ordering::SeqCst), 8);
}

#[test]
fn reports_a_current_pristine_source_without_writing() {
    let p = Project::new();
    let (sp, rp) = seed_basic(&p, "same\n", Some("same\n"));
    let before = read(&rp);
    let r = reconcile(&p, false, &Remote::new("same\n", &Over { version: Some("0.5.0".into()), ..Default::default() }), None, None);
    assert_eq!(get(&r.summary, "applied"), &Value::Bool(false));
    assert_eq!((num(&r.summary, "found"), num(&r.summary, "current"), num(&r.summary, "conflicts"), num(&r.summary, "failed")), (1, 1, 0, 0));
    assert_eq!(read(&sp), "same\n");
    assert_eq!(read(&rp), before);
}

#[test]
fn refuses_source_from_a_different_release() {
    let p = Project::new();
    let (sp, _) = seed_basic(&p, "old\n", Some("old\n"));
    let r = reconcile(&p, true, &Remote::new("new\n", &Over::default()), Some("0.5.0"), None);
    assert_eq!(get(&r.summary, "ok"), &Value::Bool(false));
    assert_eq!((num(&r.summary, "failed"), num(&r.summary, "updated")), (1, 0));
    assert!(item0(&r.summary)["message"].as_str().unwrap().contains("project has 0.5.0"));
    assert_eq!(read(&sp), "old\n");
}

#[test]
fn accepts_canary_source_for_a_canary_release() {
    let p = Project::new();
    let (sp, _) = seed_basic(&p, "old\n", Some("old\n"));
    let r = reconcile(&p, true, &Remote::new("new\n", &Over { version: Some("canary".into()), ..Default::default() }), Some("0.6.0-canary.42"), None);
    assert_eq!(get(&r.summary, "ok"), &Value::Bool(true));
    assert_eq!(num(&r.summary, "updated"), 1);
    assert_eq!(read(&sp), "new\n");
}

#[test]
fn previews_a_pristine_update_without_writing() {
    let p = Project::new();
    let (sp, rp) = seed_basic(&p, "old\n", Some("old\n"));
    let before = read(&rp);
    let r = reconcile(&p, false, &Remote::new("new\n", &Over::default()), None, None);
    assert_eq!((num(&r.summary, "found"), num(&r.summary, "wouldUpdate"), num(&r.summary, "updated")), (1, 1, 0));
    assert_eq!(item0(&r.summary)["action"], "would-update");
    assert_eq!(read(&sp), "old\n");
    assert_eq!(read(&rp), before);
}

#[test]
fn updates_a_pristine_source_and_advances_its_receipt() {
    let p = Project::new();
    let (sp, rp) = seed_basic(&p, "old\n", Some("old\n"));
    let conflict = PathBuf::from(format!("{}.astryx-conflict", sp.display()));
    write(&conflict, "stale\n");
    let r = reconcile(&p, true, &Remote::new("new\n", &Over::default()), None, None);
    assert_eq!((num(&r.summary, "wouldUpdate"), num(&r.summary, "updated"), num(&r.summary, "conflicts")), (0, 1, 0));
    assert_eq!(item0(&r.summary)["action"], "updated");
    assert_eq!(read(&sp), "new\n");
    assert!(!conflict.exists());
    let next: Value = serde_json::from_str(&read(&rp)).unwrap();
    assert_eq!(next["source"]["version"], "0.6.0");
}

fn js_project(p: &Project, base: &str, current: &str, legacy_receipt: bool) -> (PathBuf, PathBuf) {
    let installed = if legacy_receipt { legacy(&receipt(base, &Over::default())) } else { receipt(base, &Over { variants: vec![js_variant(base)], ..Default::default() }).serialize() };
    seed(p, Some(current), &installed, &js_target(SOURCE_TARGET), &receipt_path_rel())
}

#[test]
fn updates_the_javascript_install_variant() {
    let p = Project::new();
    let base = "export const value: string = 'old';\n";
    let latest = "export const value: string = 'new';\n";
    let (sp, rp) = js_project(&p, base, &transform(base).unwrap(), false);
    let r = reconcile(&p, true, &Remote::new(latest, &Over { variants: vec![js_variant(latest)], ..Default::default() }), None, None);
    assert_eq!((num(&r.summary, "updated"), num(&r.summary, "conflicts")), (1, 0));
    assert_eq!(read(&sp), transform(latest).unwrap());
    assert!(!p.root().join(SOURCE_TARGET).exists());
    let next: Value = serde_json::from_str(&read(&rp)).unwrap();
    assert_eq!(next["schemaVersion"], 2);
    assert_eq!(next["files"][0]["variants"][0]["registryTarget"], js_target(SOURCE_TARGET).as_str());
}

#[test]
fn treats_printer_only_javascript_drift_as_pristine() {
    let p = Project::new();
    let base = "export const value: string = 'old';\n";
    let latest = "export const value: string = 'new';\n";
    let (sp, _) = js_project(&p, base, "export   const value = \"old\";\n", false);
    let r = reconcile(&p, true, &Remote::new(latest, &Over { variants: vec![js_variant(latest)], ..Default::default() }), None, None);
    assert_eq!((num(&r.summary, "updated"), num(&r.summary, "conflicts")), (1, 0));
    assert_eq!(read(&sp), transform(latest).unwrap());
}

#[test]
fn three_way_merges_a_javascript_install_variant() {
    let p = Project::new();
    let base = "const title: string = 'title';\nconst body: string = 'body';\nconst spacer: string = 'spacer';\nconst footer: string = 'footer';\nexport {title, body, spacer, footer};\n";
    let latest = base.replace("'footer'", "'new footer'");
    let current = transform(base).unwrap().replace("'title'", "'custom title'");
    let (sp, _) = js_project(&p, base, &current, false);
    let r = reconcile(&p, true, &Remote::new(&latest, &Over { variants: vec![js_variant(&latest)], ..Default::default() }), None, None);
    assert_eq!((num(&r.summary, "merged"), num(&r.summary, "conflicts")), (1, 0));
    assert_eq!(read(&sp), transform(&latest).unwrap().replace("'title'", "'custom title'"));
}

#[test]
fn repairs_a_version_1_javascript_install() {
    let p = Project::new();
    let base = "export const value: string = 'old';\n";
    let latest = "export const value: string = 'new';\n";
    let (sp, rp) = js_project(&p, base, &transform(base).unwrap(), true);
    let r = reconcile(&p, true, &Remote::new(latest, &Over { variants: vec![js_variant(latest)], ..Default::default() }), None, None);
    assert_eq!((num(&r.summary, "updated"), num(&r.summary, "conflicts")), (1, 0));
    assert_eq!(read(&sp), transform(latest).unwrap());
    let next: Value = serde_json::from_str(&read(&rp)).unwrap();
    assert_eq!(next["schemaVersion"], 2);
}

fn compiled_over(target: &str, registry_path: &str, types: Option<String>) -> Over {
    let mut o = Over { target: Some(target.into()), registry_path: Some(registry_path.into()), ..Default::default() };
    if let Some(c) = types {
        o.extra.push(("types".into(), precompiled_declaration_target(target).unwrap(), "registry/example-button-basic/astryx-types.d.mts".into(), c));
    }
    o
}

#[test]
fn adds_a_declaration_while_upgrading_legacy_precompiled_jsx() {
    let p = Project::new();
    let target = "components/astryx/examples/CompiledExample.jsx";
    let registry_path = "registry/example-button-basic/CompiledExample.jsx";
    let rt = receipt_target(target, "example-button-basic");
    let base = "export default function CompiledExample() { return 'old'; }\n";
    let latest = "export default function CompiledExample() { return 'new'; }\n";
    let installed = receipt(base, &Over { target: Some(target.into()), registry_path: Some(registry_path.into()), receipt_target: Some(rt.clone()), ..Default::default() });
    let (sp, rp) = seed(&p, Some(base), &legacy(&installed), target, &rt);
    let types_target = precompiled_declaration_target(target).unwrap();
    let types_content = precompiled_declaration(target).unwrap();
    let r = reconcile(&p, true, &Remote::new(latest, &compiled_over(target, registry_path, Some(types_content.clone()))), None, None);
    assert_eq!((num(&r.summary, "updated"), num(&r.summary, "conflicts")), (1, 0), "{:?}", r.summary);
    assert_eq!(read(&sp), latest);
    assert_eq!(read(&p.root().join(&types_target)), types_content);
    assert!(r.written_files.contains(&p.root().join(&types_target)));
    let next: Value = serde_json::from_str(&read(&rp)).unwrap();
    assert_eq!(next["schemaVersion"], 2);
    let ids: Vec<&str> = next["files"].as_array().unwrap().iter().map(|f| f["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["primary", "types"]);
}

#[test]
fn reports_an_unreadable_declaration_target_without_aborting() {
    let p = Project::new();
    let target = "components/astryx/examples/CompiledExample.jsx";
    let registry_path = "registry/example-button-basic/CompiledExample.jsx";
    let rt = receipt_target(target, "example-button-basic");
    let base = "export default function CompiledExample() { return 'old'; }\n";
    let installed = receipt(base, &Over { target: Some(target.into()), registry_path: Some(registry_path.into()), receipt_target: Some(rt.clone()), ..Default::default() });
    seed(&p, Some(base), &legacy(&installed), target, &rt);
    let types_target = precompiled_declaration_target(target).unwrap();
    std::fs::create_dir_all(p.root().join(&types_target)).unwrap();
    let r = reconcile(&p, true, &Remote::new(base, &compiled_over(target, registry_path, Some(precompiled_declaration(target).unwrap()))), None, None);
    assert_eq!((num(&r.summary, "invalid"), num(&r.summary, "conflicts"), num(&r.summary, "failed")), (1, 1, 0), "{:?}", r.summary);
    assert!(p.root().join(&types_target).is_dir());
}

#[test]
fn rolls_back_source_when_the_receipt_write_fails() {
    use std::os::unix::fs::PermissionsExt;
    if unsafe { libc::geteuid() } == 0 {
        return;
    }
    let p = Project::new();
    let (sp, rp) = seed_basic(&p, "old\n", Some("old\n"));
    let dir = rp.parent().unwrap().to_path_buf();
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o500)).unwrap();
    let r = reconcile(&p, true, &Remote::new("new\n", &Over::default()), None, None);
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(get(&r.summary, "ok"), &Value::Bool(false));
    assert_eq!((num(&r.summary, "updated"), num(&r.summary, "failed")), (0, 1));
    assert_eq!(item0(&r.summary)["action"], "write-error");
    assert_eq!(read(&sp), "old\n");
    let next: Value = serde_json::from_str(&read(&rp)).unwrap();
    assert_eq!(next["source"]["version"], "0.5.0");
}

#[test]
fn preserves_crlf_when_updating() {
    let p = Project::new();
    let (sp, _) = seed_basic(&p, "first\nsecond\n", Some("first\r\nsecond\r\n"));
    let r = reconcile(&p, true, &Remote::new("first\nupdated\n", &Over::default()), None, None);
    assert_eq!((num(&r.summary, "updated"), num(&r.summary, "conflicts")), (1, 0));
    assert_eq!(read(&sp), "first\r\nupdated\r\n");
}

#[test]
fn three_way_merges_non_overlapping_edits() {
    let p = Project::new();
    let (sp, _) = seed_basic(&p, "title\nbody\nfooter\n", Some("custom title\nbody\nfooter\n"));
    let r = reconcile(&p, true, &Remote::new("title\nbody\nnew footer\n", &Over::default()), None, None);
    assert_eq!((num(&r.summary, "merged"), num(&r.summary, "conflicts")), (1, 0));
    assert_eq!(item0(&r.summary)["action"], "merged");
    assert_eq!(read(&sp), "custom title\nbody\nnew footer\n");
}

#[test]
fn preserves_crlf_when_merging() {
    let p = Project::new();
    let (sp, _) = seed_basic(&p, "title\nbody\nfooter\n", Some("custom title\r\nbody\r\nfooter\r\n"));
    let r = reconcile(&p, true, &Remote::new("title\nbody\nnew footer\n", &Over::default()), None, None);
    assert_eq!((num(&r.summary, "merged"), num(&r.summary, "conflicts")), (1, 0));
    assert_eq!(read(&sp), "custom title\r\nbody\r\nnew footer\r\n");
}

#[test]
fn leaves_edited_source_and_receipt_untouched_on_conflict() {
    let p = Project::new();
    let (sp, rp) = seed_basic(&p, "value = 1\n", Some("value = local\n"));
    let before = read(&rp);
    let r = reconcile(&p, true, &Remote::new("value = upstream\n", &Over::default()), None, None);
    assert_eq!((num(&r.summary, "conflicts"), num(&r.summary, "updated"), num(&r.summary, "merged")), (1, 0, 0));
    assert_eq!(read(&sp), "value = local\n");
    assert_eq!(read(&rp), before);
    let c = read(Path::new(&format!("{}.astryx-conflict", sp.display())));
    // Recorded from the JavaScript CLI.
    assert_eq!(c, "<<<<<<< current project\nvalue = local\n||||||| installed 0.5.0\nvalue = 1\n=======\nvalue = upstream\n>>>>>>> latest 0.6.0\n");
}

#[test]
fn does_not_recreate_a_deleted_source() {
    let p = Project::new();
    let (sp, _) = seed_basic(&p, "old\n", None);
    let r = reconcile(&p, true, &Remote::new("new\n", &Over::default()), None, None);
    assert_eq!((num(&r.summary, "missing"), num(&r.summary, "conflicts")), (1, 1));
    assert!(!sp.exists());
}

#[test]
fn does_not_replace_a_symbolic_link_source() {
    let p = Project::new();
    let (sp, _) = seed_basic(&p, "old\n", Some("old\n"));
    let linked = p.root().join("linked.tsx");
    write(&linked, "linked\n");
    std::fs::remove_file(&sp).unwrap();
    std::os::unix::fs::symlink(&linked, &sp).unwrap();
    let r = reconcile(&p, true, &Remote::new("new\n", &Over::default()), None, None);
    assert_eq!((num(&r.summary, "invalid"), num(&r.summary, "conflicts")), (1, 1));
    assert!(std::fs::symlink_metadata(&sp).unwrap().file_type().is_symlink());
    assert_eq!(read(&linked), "linked\n");
}

#[test]
fn accepts_an_installed_route_that_became_an_alias() {
    let p = Project::new();
    seed_basic(&p, "old\n", Some("old\n"));
    let mut it = item();
    it.path = "examples/button/new-basic".into();
    it.aliases = vec!["examples/button/basic".into()];
    let f = Remote::new("new\n", &Over { item: Some(it), ..Default::default() });
    let r = reconcile(&p, true, &f, None, None);
    assert_eq!(num(&r.summary, "updated"), 1);
    assert_eq!(f.calls.lock().unwrap()[0], "https://registry.example.test/examples/button/basic.json");
}

#[test]
fn refuses_an_upstream_source_set_change() {
    let p = Project::new();
    let (sp, _) = seed_basic(&p, "old\n", Some("old\n"));
    let o = Over { extra: vec![("secondary".into(), "components/astryx/examples/Helper.ts".into(), "registry/example-button-basic/Helper.ts".into(), "export const helper = true;\n".into())], ..Default::default() };
    let r = reconcile(&p, true, &Remote::new("new\n", &o), None, None);
    assert_eq!((num(&r.summary, "conflicts"), num(&r.summary, "updated")), (1, 0));
    assert!(item0(&r.summary)["message"].as_str().unwrap().contains("source set"));
    assert_eq!(read(&sp), "old\n");
}

fn corrupt_receipt() -> String {
    let mut v = receipt("base\n", &Over::default()).to_value();
    v["files"][0]["sha256"] = Value::String("0".repeat(64));
    format!("{}\n", crate::json::stringify(&v, 2))
}

#[test]
fn rejects_a_corrupt_installed_base_before_fetching() {
    let p = Project::new();
    let (sp, _) = seed(&p, Some("base\n"), &corrupt_receipt(), SOURCE_TARGET, &receipt_path_rel());
    let f = Remote::new("new\n", &Over::default());
    let r = reconcile(&p, true, &f, None, None);
    assert_eq!((num(&r.summary, "invalid"), num(&r.summary, "failed")), (1, 0));
    assert!(f.calls.lock().unwrap().is_empty());
    assert_eq!(read(&sp), "base\n");
}

#[test]
fn rejects_a_receipt_target_that_escapes_the_root() {
    let p = Project::new();
    let mut v = receipt("base\n", &Over::default()).to_value();
    v["files"][0]["target"] = Value::String("../../../outside.tsx".into());
    seed(&p, Some("base\n"), &format!("{}\n", crate::json::stringify(&v, 2)), SOURCE_TARGET, &receipt_path_rel());
    let r = reconcile(&p, true, &Remote::new("new\n", &Over::default()), None, None);
    assert_eq!(num(&r.summary, "invalid"), 1);
    assert!(!p.dir.join("outside.tsx").exists());
}

#[test]
fn rejects_an_oversized_registry_item() {
    let p = Project::new();
    seed_basic(&p, "old\n", Some("old\n"));
    let f = |_: &str| Ok(FetchResponse { status: 200, content_length: Some((16 * 1024 * 1024 + 1).to_string()), body: b"{}".to_vec() });
    let r = reconcile(&p, true, &f, None, None);
    assert_eq!(num(&r.summary, "failed"), 1);
    assert!(item0(&r.summary)["message"].as_str().unwrap().contains("exceeds"));
}

#[test]
fn rejects_a_misplaced_remote_receipt() {
    let p = Project::new();
    let (sp, _) = seed_basic(&p, "old\n", Some("old\n"));
    let r = reconcile(&p, true, &Remote::new("new\n", &Over { receipt_target: Some("components/astryx/.astryx/wrong.json".into()), ..Default::default() }), None, None);
    assert_eq!(num(&r.summary, "failed"), 1);
    assert!(item0(&r.summary)["message"].as_str().unwrap().contains("misplaced"));
    assert_eq!(read(&sp), "old\n");
}

#[test]
fn rejects_a_javascript_variant_that_disagrees_with_canonical_source() {
    let p = Project::new();
    let base = "export const value: string = 'old';\n";
    let latest = "export const value: string = 'new';\n";
    let (sp, _) = seed_basic(&p, base, Some(base));
    let r = reconcile(&p, true, &Remote::new(latest, &Over { variants: vec![js_variant("export const value: string = 'tampered';\n")], ..Default::default() }), None, None);
    assert_eq!(num(&r.summary, "failed"), 1);
    assert!(item0(&r.summary)["message"].as_str().unwrap().contains("invalid javascript variant"));
    assert_eq!(read(&sp), base);
}

#[test]
fn rejects_a_remote_receipt_that_disagrees_with_shipped_source() {
    let p = Project::new();
    let (sp, _) = seed_basic(&p, "old\n", Some("old\n"));
    let r = reconcile(&p, true, &Remote::new("new\n", &Over { source_content: Some("tampered\n".into()), ..Default::default() }), None, None);
    assert_eq!(num(&r.summary, "failed"), 1);
    assert_eq!(read(&sp), "old\n");
}

#[test]
fn paths_name_files_from_the_folder_the_command_ran_in() {
    let p = Project::new();
    let (sp, _) = seed_basic(&p, "value = 1\n", Some("value = local\n"));
    let f = Remote::new("value = upstream\n", &Over::default());
    let origin = p.dir.join("apps").join("web");
    let at_root = reconcile(&p, false, &f, None, None);
    let below = reconcile(&p, false, &f, None, Some(&origin));
    let a = &item0(&at_root.summary)["files"][0];
    let b = &item0(&below.summary)["files"][0];
    assert_eq!(a["path"], SOURCE_TARGET);
    assert_eq!(a["conflictFile"], format!("{SOURCE_TARGET}.astryx-conflict").as_str());
    assert_eq!(b["path"], format!("../../src/{SOURCE_TARGET}").as_str());
    assert_eq!(b["conflictFile"], format!("../../src/{SOURCE_TARGET}.astryx-conflict").as_str());
    assert_eq!(crate::commands::upgrade::fsutil::resolve_from(&origin, b["path"].as_str().unwrap()), sp);
}

#[test]
fn invalid_receipt_paths_name_files_from_the_origin_too() {
    let p = Project::new();
    seed(&p, Some("base\n"), &corrupt_receipt(), SOURCE_TARGET, &receipt_path_rel());
    let f = Remote::new("new\n", &Over::default());
    let origin = p.dir.join("docs");
    let at_root = reconcile(&p, false, &f, None, None);
    let below = reconcile(&p, false, &f, None, Some(&origin));
    assert!(item0(&at_root.summary)["message"].as_str().unwrap().contains(&format!("Invalid receipt {}:", receipt_path_rel())));
    assert!(item0(&below.summary)["message"].as_str().unwrap().contains(&format!("Invalid receipt ../src/{}:", receipt_path_rel())));
}

#[test]
fn offline_fetch_reads_like_undici() {
    let p = Project::new();
    seed_basic(&p, "old\n", Some("old\n"));
    let f = |_: &str| -> Result<FetchResponse, String> { Err("fetch failed".into()) };
    let r = reconcile(&p, false, &f, None, None);
    assert_eq!(item0(&r.summary)["message"], "Could not fetch https://registry.example.test/examples/button/basic.json: fetch failed");
    assert_eq!(item0(&r.summary)["action"], "fetch-error");
}
