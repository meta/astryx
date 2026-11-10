//! `integrationPackCheck` (`api/integration/pack-check.mjs`): check the
//! package the way npm will publish it.

use super::add_helpers::{find_manifest_paths, normalize, relative};
use super::jsjson;
use crate::json::{Map, Value};
use std::path::Path;

fn issue(code: &str, severity: &str, message: String) -> Value {
    let mut m = Map::new();
    m.insert("code".into(), Value::String(code.into()));
    m.insert("severity".into(), Value::String(severity.into()));
    m.insert("message".into(), Value::String(message));
    Value::Object(m)
}

fn empty_receipt(name: Value, issues: Vec<Value>) -> Value {
    let packable = !issues.iter().any(|i| i["severity"] == "error");
    let mut inv = Map::new();
    inv.insert("manifest".into(), Value::Null);
    inv.insert("roots".into(), Value::Array(vec![]));
    inv.insert("expectedFiles".into(), Value::from(0));
    inv.insert("packedFiles".into(), Value::from(0));
    let mut contrib = Map::new();
    contrib.insert("local".into(), Value::Null);
    contrib.insert("packed".into(), Value::Null);
    let mut d = Map::new();
    d.insert("name".into(), name);
    d.insert("version".into(), Value::Null);
    d.insert("packable".into(), Value::Bool(packable));
    d.insert("tarball".into(), Value::Null);
    d.insert("inventory".into(), Value::Object(inv));
    d.insert("contributions".into(), Value::Object(contrib));
    d.insert("issues".into(), Value::Array(issues));
    let mut m = Map::new();
    m.insert("type".into(), Value::String("integration.pack-check".into()));
    m.insert("data".into(), Value::Object(d));
    Value::Object(m)
}

/// `findPackage(cwd)`: Ok(None) when there is no package.json.
fn find_package(cwd: &Path) -> Result<Option<(std::path::PathBuf, Value)>, String> {
    let mut dir = normalize(cwd);
    for _ in 0..50 {
        let file = dir.join("package.json");
        if file.exists() {
            let text = std::fs::read_to_string(&file).map_err(|e| e.to_string())?;
            return match jsjson::parse(&text) {
                Ok(v) => Ok(Some((dir, v))),
                Err(m) => Err(format!("Could not parse {}: {m}", file.to_string_lossy())),
            };
        }
        match dir.parent() {
            Some(p) if p != dir => dir = p.to_path_buf(),
            _ => break,
        }
    }
    Ok(None)
}

pub fn integration_pack_check(cwd: &Path) -> Value {
    let (dir, pkg) = match find_package(cwd) {
        Err(m) => return empty_receipt(Value::Null, vec![issue("invalid_package_json", "error", m)]),
        Ok(None) => {
            return empty_receipt(
                Value::Null,
                vec![issue("no_package", "error", "No package.json found. Run this command inside an integration package.".into())],
            )
        }
        Ok(Some(x)) => x,
    };
    let name = match pkg.get("name") {
        Some(Value::String(s)) => s.clone(),
        _ => "(unnamed package)".into(),
    };
    let local = crate::commands::doctor::integration::validate::validate_local(&cwd.to_string_lossy());
    let mut issues: Vec<Value> = local.issues.clone();
    if local.found {
        for i in &local.listed {
            let mut i = i.clone();
            if i["code"] == "invalid_package_json" {
                i["severity"] = Value::String("error".into());
            }
            issues.push(i);
        }
    }
    if !local.found || local.integration.is_none() {
        if !local.found {
            issues.push(issue("missing_manifest", "error", "No astryx.integration.{ts,mjs,js} found next to package.json.".into()));
        }
        return empty_receipt(Value::String(name), issues);
    }
    full_check(&dir, &pkg, name, issues)
}

// ── The packed-package check ─────────────────────────────────────────

const ROOT_KINDS: [&str; 5] = ["themes", "components", "templates", "codemods", "docs"];

fn walk(dir: &Path, filter: &dyn Fn(&str) -> bool, out: &mut Vec<std::path::PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut v: Vec<std::path::PathBuf> = Vec::new();
    for e in rd.flatten() {
        let n = e.file_name().to_string_lossy().to_string();
        if ["node_modules", ".git", "__tests__", "__fixtures__"].contains(&n.as_str()) {
            continue;
        }
        let p = e.path();
        if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            walk(&p, filter, &mut v);
        } else if filter(&n) {
            v.push(p);
        }
    }
    v.sort();
    out.extend(v);
}

fn doc_ext(n: &str) -> Option<usize> {
    for x in [".doc.ts", ".doc.mjs", ".doc.js"] {
        if n.ends_with(x) {
            return Some(x.len());
        }
    }
    None
}

fn enumerate(kind: &str, root: &Path, pkg_dir: &Path) -> Vec<String> {
    let rel = |p: &Path| relative(pkg_dir, p);
    let mut out = Vec::new();
    match kind {
        "components" | "templates" => {
            let mut docs = Vec::new();
            let tmpl = kind == "templates";
            walk(root, &|n| doc_ext(n).is_some() || (tmpl && [".template.ts", ".template.mjs", ".template.js"].iter().any(|x| n.ends_with(x))), &mut docs);
            for d in docs {
                out.push(rel(&d));
                let s = d.to_string_lossy().to_string();
                let cut = [".doc.ts", ".doc.mjs", ".doc.js", ".template.ts", ".template.mjs", ".template.js"].iter().find(|x| s.ends_with(*x)).map(|x| x.len()).unwrap_or(0);
                let src = std::path::PathBuf::from(format!("{}.tsx", &s[..s.len() - cut]));
                if src.exists() {
                    out.push(rel(&src));
                }
            }
        }
        "codemods" => {
            let mut f = Vec::new();
            walk(root, &|n| (n.ends_with(".ts") || n.ends_with(".mjs") || n.ends_with(".js")) && ![".test.", ".spec.", ".fixture."].iter().any(|x| n.contains(x)), &mut f);
            out.extend(f.iter().map(|p| rel(p)));
        }
        "docs" => {
            let mut f = Vec::new();
            walk(root, &|n| doc_ext(n).is_some(), &mut f);
            out.extend(f.iter().map(|p| rel(p)));
        }
        _ => {
            // themes: every file of each theme folder.
            let Ok(rd) = std::fs::read_dir(root) else { return out };
            let mut files = Vec::new();
            for e in rd.flatten() {
                if e.file_type().map(|t| t.is_dir()).unwrap_or(false) && !e.file_name().to_string_lossy().starts_with('.') {
                    let mut f = Vec::new();
                    walk(&e.path(), &|n| !n.starts_with('.'), &mut f);
                    files.extend(f);
                }
            }
            files.sort();
            out.extend(files.iter().map(|p| rel(p)));
        }
    }
    out
}

#[derive(Default, Clone, PartialEq)]
struct Identities {
    themes: Vec<Value>,
    components: Vec<String>,
    templates: Vec<Value>,
    codemods: Vec<Value>,
    docs: Vec<String>,
    agent_docs_append: Vec<String>,
}

impl Identities {
    fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("themes".into(), Value::Array(self.themes.clone()));
        m.insert("components".into(), Value::Array(self.components.iter().cloned().map(Value::String).collect()));
        m.insert("templates".into(), Value::Array(self.templates.clone()));
        m.insert("codemods".into(), Value::Array(self.codemods.clone()));
        m.insert("docs".into(), Value::Array(self.docs.iter().cloned().map(Value::String).collect()));
        m.insert("agentDocsAppend".into(), Value::Array(self.agent_docs_append.iter().cloned().map(Value::String).collect()));
        Value::Object(m)
    }
}

/// TEMP: replace with the discovery lanes' component, template, docs,
/// codemod and theme discovery.
fn collect_identities(pkg_dir: &Path, manifest: &Value) -> Identities {
    let mut id = Identities::default();
    let root = |k: &str| manifest.get(k).and_then(|v| v.as_str()).map(|r| super::add_helpers::resolve(pkg_dir, r)).filter(|p| p.is_dir());
    if let Some(Value::Array(a)) = manifest.get("agentDocs").and_then(|a| a.get("append")) {
        id.agent_docs_append = a.iter().filter_map(|x| x.as_str().map(String::from)).collect();
    }
    if let Some(r) = root("components") {
        let mut docs = Vec::new();
        walk(&r, &|n| doc_ext(n).is_some(), &mut docs);
        for d in docs {
            if let Some(v) = super::manifest_load::load_default(&d) {
                if v.get("type").and_then(|t| t.as_str()) == Some("component") {
                    if let Some(n) = v.get("name").and_then(|t| t.as_str()) {
                        id.components.push(n.to_string());
                    }
                }
            }
        }
        id.components.sort();
    }
    if let Some(r) = root("docs") {
        let mut docs = Vec::new();
        walk(&r, &|n| doc_ext(n).is_some(), &mut docs);
        for d in docs {
            if let Some(v) = super::manifest_load::load_default(&d) {
                if v.get("type").and_then(|t| t.as_str()) != Some("namespace") {
                    if let Some(n) = v.get("name").and_then(|t| t.as_str()) {
                        id.docs.push(n.to_string());
                    }
                }
            }
        }
        id.docs.sort();
    }
    if let Some(r) = root("templates") {
        let mut docs = Vec::new();
        walk(&r, &|n| doc_ext(n).is_some(), &mut docs);
        for d in docs {
            if let Some(v) = super::manifest_load::load_default(&d) {
                let fname = super::add_helpers::basename(&d);
                let stem = &fname[..fname.len() - doc_ext(&fname).unwrap()];
                let mut t = Map::new();
                t.insert("id".into(), Value::String(stem.into()));
                t.insert("type".into(), v.get("type").cloned().unwrap_or(Value::Null));
                t.insert("name".into(), v.get("name").cloned().unwrap_or(Value::Null));
                if let Some(rp) = v.get("replaces") {
                    t.insert("replaces".into(), rp.clone());
                }
                id.templates.push(Value::Object(t));
            }
        }
    }
    if let Some(r) = root("codemods") {
        if let Ok(rd) = std::fs::read_dir(&r) {
            let mut entries: Vec<(String, String)> = Vec::new();
            for v in rd.flatten().filter(|e| e.path().is_dir()) {
                let version = v.file_name().to_string_lossy().to_string();
                for f in std::fs::read_dir(v.path()).into_iter().flatten().flatten() {
                    let n = f.file_name().to_string_lossy().to_string();
                    if let Some(stem) = n.strip_suffix(".mjs").or_else(|| n.strip_suffix(".js")).or_else(|| n.strip_suffix(".ts")) {
                        entries.push((version.clone(), stem.to_string()));
                    }
                }
            }
            entries.sort_by(|a, b| crate::text::collate::locale_compare(&format!("{}/{}", a.0, a.1), &format!("{}/{}", b.0, b.1)));
            id.codemods = entries
                .into_iter()
                .map(|(v, i)| {
                    let mut m = Map::new();
                    m.insert("version".into(), Value::String(v));
                    m.insert("id".into(), Value::String(i));
                    Value::Object(m)
                })
                .collect();
        }
    }
    id
}

fn compare_identities(local: &Identities, packed: &Identities) -> Vec<Value> {
    let mut issues = Vec::new();
    let mut kind = |label: &str, l: Vec<(String, Value)>, p: Vec<(String, Value)>| {
        for (k, item) in &l {
            match p.iter().find(|(pk, _)| pk == k) {
                None => issues.push(issue("identity_not_packed", "error", format!("{label} \"{k}\" is discoverable locally but missing from the packed tarball."))),
                Some((_, pi)) if pi != item => issues.push(issue("identity_mismatch", "error", format!("{label} \"{k}\" resolves differently from the packed tarball."))),
                _ => {}
            }
        }
        for (k, _) in &p {
            if !l.iter().any(|(lk, _)| lk == k) {
                issues.push(issue("packed_identity_unexpected", "error", format!("{label} \"{k}\" exists only in the packed tarball.")));
            }
        }
    };
    let by = |v: &[Value], f: &dyn Fn(&Value) -> String| v.iter().map(|x| (f(x), x.clone())).collect::<Vec<_>>();
    let strs = |v: &[String]| v.iter().map(|x| (x.clone(), Value::String(x.clone()))).collect::<Vec<_>>();
    kind("Theme", by(&local.themes, &|x| x["slug"].as_str().unwrap_or("").into()), by(&packed.themes, &|x| x["slug"].as_str().unwrap_or("").into()));
    kind("Component", strs(&local.components), strs(&packed.components));
    kind("Template", by(&local.templates, &|x| x["id"].as_str().unwrap_or("").into()), by(&packed.templates, &|x| x["id"].as_str().unwrap_or("").into()));
    let cm = |x: &Value| format!("{}/{}", x["version"].as_str().unwrap_or(""), x["id"].as_str().unwrap_or(""));
    kind("Codemod", by(&local.codemods, &cm), by(&packed.codemods, &cm));
    kind("Doc topic", strs(&local.docs), strs(&packed.docs));
    if local.agent_docs_append != packed.agent_docs_append {
        issues.push(issue("agent_docs_mismatch", "error", "agentDocs.append lines differ between local and packed manifests.".into()));
    }
    issues
}

fn copy_packed(src: &Path, dest: &Path, files: &[String]) -> std::io::Result<()> {
    for f in files {
        let to = dest.join(f);
        if let Some(d) = to.parent() {
            std::fs::create_dir_all(d)?;
        }
        std::fs::copy(src.join(f), &to)?;
    }
    Ok(())
}

fn random_suffix() -> String {
    let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_nanos()).unwrap_or(0) ^ std::process::id();
    let chars: Vec<char> = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".chars().collect();
    let mut x = n as u64 | 1;
    (0..6)
        .map(|_| {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            chars[(x % chars.len() as u64) as usize]
        })
        .collect()
}

fn package_relative(issues: &mut [Value], packed: &Path, consumer: &Path) {
    let spellings = |d: &Path| {
        let mut v = vec![d.to_string_lossy().to_string()];
        if let Ok(r) = std::fs::canonicalize(d) {
            let r = r.to_string_lossy().to_string();
            if r != v[0] {
                v.push(r);
            }
        }
        v
    };
    let packed_s = spellings(packed);
    let consumer_s = spellings(consumer);
    for i in issues.iter_mut() {
        let Some(Value::String(msg)) = i.get("message").cloned() else { continue };
        let mut m = msg;
        for pre in &packed_s {
            m = m.split(&format!("{pre}/")).collect::<Vec<_>>().join("");
            // `prefix` not followed by a word char, `-`, or `.x`.
            let mut out = String::new();
            let mut rest = m.as_str();
            while let Some(pos) = rest.find(pre.as_str()) {
                let after = &rest[pos + pre.len()..];
                let mut ch = after.chars();
                let c1 = ch.next();
                let c2 = ch.next();
                let blocked = match c1 {
                    Some(c) if c.is_alphanumeric() || c == '_' || c == '-' => true,
                    Some('.') => matches!(c2, Some(c) if c.is_alphanumeric() || c == '_'),
                    _ => false,
                };
                out.push_str(&rest[..pos]);
                if blocked {
                    out.push_str(pre);
                } else {
                    out.push_str("the package root");
                }
                rest = after;
            }
            out.push_str(rest);
            m = out;
        }
        for pre in &consumer_s {
            let mut out = String::new();
            let mut rest = m.as_str();
            while let Some(pos) = rest.find(pre.as_str()) {
                out.push_str(&rest[..pos]);
                out.push_str("a consumer project");
                let after = &rest[pos + pre.len()..];
                let end = after.find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == '`').unwrap_or(after.len());
                rest = &after[end..];
            }
            out.push_str(rest);
            m = out;
        }
        i["message"] = Value::String(m);
    }
}

fn full_check(dir: &Path, pkg: &Value, name: String, mut issues: Vec<Value>) -> Value {
    let version = match pkg.get("version") {
        Some(Value::String(v)) => Value::String(v.clone()),
        _ => Value::Null,
    };
    let manifest_file = find_manifest_paths(dir).into_iter().next().unwrap();
    let manifest = match super::manifest_load::load_manifest_value(&manifest_file) {
        Ok(m) => m,
        Err(e) => {
            issues.push(issue("invalid_manifest", "error", e.message));
            return empty_receipt(Value::String(name), issues);
        }
    };
    let manifest_rel = relative(dir, &manifest_file);
    let mut roots: Vec<(String, String, Vec<String>)> = Vec::new();
    let mut all_files = vec![manifest_rel.clone()];
    for kind in ROOT_KINDS {
        let Some(r) = manifest.get(kind).and_then(|v| v.as_str()) else { continue };
        let abs = super::add_helpers::resolve(dir, r);
        let files = enumerate(kind, &abs, dir);
        for f in &files {
            if !all_files.contains(f) {
                all_files.push(f.clone());
            }
        }
        roots.push((kind.to_string(), relative(dir, &abs), files));
    }
    let local = collect_identities(dir, &manifest);
    for (kind, path, files) in &roots {
        let abs = dir.join(path);
        if !abs.is_dir() {
            continue;
        }
        if files.is_empty() {
            issues.push(issue("empty_contribution_root", "error", format!("Declared {kind} root \"{path}\" contains no discoverable contribution files.")));
        }
    }
    if !local.themes.is_empty() {
        if let Some(p) = super::cli_requirement::themes_cli_problem(pkg) {
            issues.push(issue("themes_need_cli", "error", p));
        }
    }
    let pack = match super::pack::npm_pack(dir, pkg) {
        Ok(p) => p,
        Err(e) => {
            issues.push(issue("pack_failed", "error", e));
            return build_receipt(name, version, &manifest_rel, &roots, &all_files, None, Some(&local), None, issues);
        }
    };
    let issues_before = issues.len();
    let scratch = dir.join(format!(".astryx-pack-check-{}", random_suffix()));
    let _ = std::fs::create_dir_all(&scratch);
    let _ = std::fs::write(scratch.join("package.json"), "{\"name\":\"astryx-verify-consumer\",\"private\":true}\n");
    if !pack.files.contains(&manifest_rel) {
        issues.push(issue(
            "manifest_not_packed",
            "error",
            format!("Integration manifest \"{manifest_rel}\" is not in the npm pack list. Add it to \"files\" in package.json."),
        ));
    }
    for (kind, path, files) in &roots {
        let missing: Vec<&String> = files.iter().filter(|f| !pack.files.contains(f)).collect();
        if missing.len() == files.len() && !files.is_empty() {
            issues.push(issue(
                "root_not_packed",
                "error",
                format!(
                    "Declared {kind} root \"{path}\" has 0 of {} expected files in the pack list. Add \"{}\" to \"files\" in package.json.",
                    files.len(),
                    path.strip_prefix("./").unwrap_or(path)
                ),
            ));
        } else {
            for f in missing {
                issues.push(issue("file_not_packed", "error", format!("{kind} file \"{f}\" is not in the pack list.")));
            }
        }
    }
    let extract = scratch.join("node_modules").join(&name);
    let mut packed_ids = None;
    if let Err(e) = copy_packed(dir, &extract, &pack.files) {
        issues.push(issue("extract_failed", "error", e.to_string()));
    } else {
        let packed_result = crate::commands::doctor::integration::validate::validate_installed(&name, &scratch.to_string_lossy());
        for i in &packed_result.issues {
            let mut m = Map::new();
            m.insert("code".into(), Value::String(format!("packed_{}", i["code"].as_str().unwrap_or(""))));
            m.insert("severity".into(), i["severity"].clone());
            m.insert("message".into(), Value::String(format!("Packed: {}", crate::cli::format::js_string(&i["message"]))));
            for k in ["fix", "file", "line"] {
                if !matches!(i.get(k), None | Some(Value::Null)) {
                    m.insert(k.into(), i[k].clone());
                }
            }
            issues.push(Value::Object(m));
        }
        let packed_manifest_file = if packed_result.integration.is_some() { find_manifest_paths(&extract).into_iter().next() } else { None };
        if let Some(pmf) = packed_manifest_file {
            if let Ok(pm) = super::manifest_load::load_manifest_value(&pmf) {
                let packed = collect_identities(&extract, &pm);
                issues.extend(compare_identities(&local, &packed));
                issues.extend(packed_component_exports(&extract, &pm, &name, &scratch));
                packed_ids = Some(packed);
            }
        }
    }
    package_relative(&mut issues[issues_before..], &extract, &scratch);
    let _ = std::fs::remove_dir_all(&scratch);
    build_receipt(name, version, &manifest_rel, &roots, &all_files, Some(&pack), Some(&local), packed_ids.as_ref(), issues)
}

/// `validatePackedComponentExports`: each packed component's advertised
/// import must resolve for a consumer and export the component.
fn packed_component_exports(pkg_dir: &Path, manifest: &Value, name: &str, scratch: &Path) -> Vec<Value> {
    let mut issues = Vec::new();
    let Some(r) = manifest.get("components").and_then(|v| v.as_str()) else { return issues };
    let root = super::add_helpers::resolve(pkg_dir, r);
    let mut docs = Vec::new();
    walk(&root, &|n| doc_ext(n).is_some(), &mut docs);
    let from = scratch.join(".astryx-resolve-imports.mjs");
    for d in docs {
        let Some(v) = super::manifest_load::load_default(&d) else { continue };
        let Some(cname) = v.get("name").and_then(|t| t.as_str()) else { continue };
        let owner = crate::discovery::component_discovery::ImportOwner {
            exports_map: None,
            package_dir: Some(pkg_dir.to_path_buf()),
            doc_path: Some(d.clone()),
            package_name: name.to_string(),
        };
        let spec = crate::discovery::component_discovery::resolve_integration_import_path(&owner, cname, v.get("import").and_then(|i| i.as_str()));
        match crate::js::resolve::resolve(&spec, &from, crate::js::resolve::Mode::Esm) {
            Err(e) => issues.push(issue(
                "component_import_unresolvable",
                "error",
                format!("Component \"{cname}\" advertises import \"{spec}\", but a consumer cannot resolve it: {}", e.message),
            )),
            Ok(_) => {}
        }
    }
    issues
}

#[allow(clippy::too_many_arguments)]
fn build_receipt(
    name: String,
    version: Value,
    manifest: &str,
    roots: &[(String, String, Vec<String>)],
    all_files: &[String],
    pack: Option<&super::pack::PackResult>,
    local: Option<&Identities>,
    packed: Option<&Identities>,
    issues: Vec<Value>,
) -> Value {
    let packed_paths: Vec<String> = pack.map(|p| p.files.clone()).unwrap_or_default();
    let roots_json: Vec<Value> = roots
        .iter()
        .map(|(kind, path, files)| {
            let missing: Vec<Value> = files.iter().filter(|f| !packed_paths.contains(f)).cloned().map(Value::String).collect();
            let mut m = Map::new();
            m.insert("kind".into(), Value::String(kind.clone()));
            m.insert("path".into(), Value::String(path.clone()));
            m.insert("expectedFiles".into(), Value::from(files.len() as u64));
            m.insert("complete".into(), Value::Bool(missing.is_empty()));
            m.insert("missingFiles".into(), Value::Array(missing));
            let mut o = Map::new();
            for k in ["kind", "path", "expectedFiles", "missingFiles", "complete"] {
                o.insert(k.into(), m[k].clone());
            }
            Value::Object(o)
        })
        .collect();
    let packable = !issues.iter().any(|i| i["severity"] == "error");
    let mut d = Map::new();
    d.insert("name".into(), Value::String(name));
    d.insert("version".into(), version);
    d.insert("packable".into(), Value::Bool(packable));
    d.insert(
        "tarball".into(),
        match pack {
            None => Value::Null,
            Some(p) => {
                let mut t = Map::new();
                t.insert("filename".into(), Value::String(p.filename.clone()));
                t.insert("fileCount".into(), Value::from(p.file_count as u64));
                t.insert("size".into(), Value::from(p.size as u64));
                t.insert("unpackedSize".into(), Value::from(p.unpacked_size));
                Value::Object(t)
            }
        },
    );
    let mut inv = Map::new();
    inv.insert("manifest".into(), Value::String(manifest.into()));
    inv.insert("roots".into(), Value::Array(roots_json));
    inv.insert("expectedFiles".into(), Value::from(all_files.len() as u64));
    inv.insert("packedFiles".into(), Value::from(all_files.iter().filter(|f| packed_paths.contains(f)).count() as u64));
    d.insert("inventory".into(), Value::Object(inv));
    let mut c = Map::new();
    c.insert("local".into(), local.map(|l| l.to_json()).unwrap_or(Value::Null));
    c.insert("packed".into(), packed.map(|l| l.to_json()).unwrap_or(Value::Null));
    d.insert("contributions".into(), Value::Object(c));
    d.insert("issues".into(), Value::Array(issues));
    let mut m = Map::new();
    m.insert("type".into(), Value::String("integration.pack-check".into()));
    m.insert("data".into(), Value::Object(d));
    Value::Object(m)
}
