//! Equality with the JS functions, from JSON the oracle script dumps:
//! `node scripts/discovery-oracle.mjs <js-cli-root> $CARGO_TARGET_DIR/discovery-oracle.json`.
//! Skipped (with a note) when the oracle file is absent.

use super::nodepath as np;
use super::{package_manager as pm, paths, release, semver};
use crate::json::Value;

fn oracle() -> Option<Value> {
    let file = std::env::var("DISCOVERY_ORACLE").unwrap_or_else(|_| "/tmp/disc-oracle.json".into());
    let v = np::read_json(&file);
    if v.is_none() {
        eprintln!("discovery oracle {file} missing: skipped");
    }
    v
}

/// Point the clone at the JS CLI root the oracles ran against.
fn use_js_cli_root() {
    let root = format!("{}/rustcli/astryx/packages/cli", np::homedir());
    std::env::set_var("ASTRYX_RS_CLI_ROOT", root);
}

fn opt(v: Option<String>) -> Value {
    v.map(Value::String).unwrap_or(Value::Null)
}

#[test]
fn matches_js_paths_and_package_manager() {
    let Some(o) = oracle() else { return };
    std::env::set_var("ASTRYX_RS_CLI_ROOT", o["cliRoot"].as_str().unwrap());
    std::env::set_current_dir(o["cwd"].as_str().unwrap()).unwrap();
    let mut failures = Vec::new();
    for c in o["cases"].as_array().unwrap() {
        let dir = c["dir"].as_str().unwrap();
        let mut check = |name: &str, got: Value| {
            if got != c[name] {
                failures.push(format!("{dir} {name}: rust {got} js {}", c[name]));
            }
        };
        check("findCoreDir", opt(paths::find_core_dir(dir)));
        check("findProjectCoreDir", opt(paths::find_project_core_dir(dir)));
        check(
            "requireCoreDir",
            match paths::require_core_dir(dir) {
                Ok(d) => Value::String(d),
                Err(e) => serde_json::json!({"error": e.message, "code": e.code}),
            },
        );
        check("findAstryxProject", opt(paths::find_astryx_project(dir)));
        check("findWorkspaceRoot", Value::String(paths::find_workspace_root(dir)));
        check("findPackageRoot", opt(paths::find_package_root(dir)));
        check("findProjectRoot", opt(paths::find_project_root(dir)));
        check(
            "findInstalledCli",
            opt(paths::find_installed_package(dir, "@astryxdesign/cli", paths::INSTALLED_REACH)),
        );
        check(
            "listComponents",
            match paths::find_core_dir(dir) {
                Some(core) => serde_json::json!(paths::list_components(&core)),
                None => Value::Null,
            },
        );
        let r = pm::explain_package_manager(Some(dir));
        check(
            "explain",
            serde_json::json!({"pm": r.pm, "ambiguous": r.ambiguous, "dir": r.dir, "candidates": r.candidates,
                "declared": r.declared, "source": r.source,
                "stray": r.stray_lockfiles.iter().map(|l| serde_json::json!({"pm": l.pm, "file": l.file})).collect::<Vec<_>>()}),
        );
        check("dlx", Value::String(pm::get_dlx_prefix(Some(dir)).into()));
        check("docPm", Value::String(pm::doc_package_manager(Some(dir))));
        check("invocation", Value::String(pm::get_cli_invocation(Some(dir))));
        check("formatted", Value::String(pm::format_cli_command("astryx docs tokens", Some(dir))));
        check("answeredBy", release::answered_by(dir));
        let ch = release::run_choice(dir);
        check("runChoice", serde_json::json!({"copy": ch.copy, "inProject": ch.in_project}));
    }
    for s in o["semverCases"].as_array().unwrap() {
        let (v, r, want) = (s[0].as_str().unwrap(), s[1].as_str().unwrap(), s[2].as_bool().unwrap());
        if semver::satisfies_range(v, r) != want {
            failures.push(format!("satisfiesRange({v}, {r}) != {want}"));
        }
    }
    for s in o["compares"].as_array().unwrap() {
        let c = semver::semver_compare(s[0].as_str().unwrap(), s[1].as_str().unwrap());
        let got = if c > 0.0 { 1.0 } else if c < 0.0 { -1.0 } else { 0.0 };
        let want = s[2].as_f64().unwrap();
        if got != want && !(got == 0.0 && want == 0.0) {
            failures.push(format!("semverCompare {s}: {got}"));
        }
    }
    let p = &o["prefix"];
    let got = pm::prefix_cli_commands(p[0].as_str().unwrap(), "pnpm exec astryx", None);
    if got != p[1].as_str().unwrap() {
        failures.push(format!("prefixCliCommands: {got:?}"));
    }
    for q in o["quote"].as_array().unwrap() {
        let got = pm::quote_command_argument(q[0].as_str().unwrap());
        if got != q[1].as_str().unwrap() {
            failures.push(format!("quote {q}: {got}"));
        }
    }
    assert!(failures.is_empty(), "{} mismatches:\n{}", failures.len(), failures.join("\n"));
}

#[test]
fn matches_js_doc_parsers() {
    use_js_cli_root();
    let file = std::env::var("PARSE_ORACLE").unwrap_or_else(|_| "/tmp/parse-oracle.json".into());
    let Some(Value::Array(cases)) = np::read_json(&file) else {
        eprintln!("parse oracle {file} missing: skipped");
        return;
    };
    let mut failures = Vec::new();
    for c in &cases {
        let input = &c["input"];
        let label = c["label"].as_str().unwrap();
        let got = match c["parser"].as_str().unwrap() {
            "template" => super::doctypes::parse_template(input, label),
            "theme" => super::doctypes::parse_theme(input, label),
            "icon-definition" => super::doctypes::parse_icon_definition(input, label),
            _ => super::doctypes::parse_doc(input, label),
        };
        let want = if let Some(e) = c.get("error") { Err(e.as_str().unwrap().to_string()) } else { Ok(c["ok"].clone()) };
        if got != want {
            failures.push(format!("{label}:\n  rust {got:?}\n  js   {want:?}"));
        }
    }
    assert!(failures.is_empty(), "{} of {} mismatches:\n{}", failures.len(), cases.len(), failures.join("\n"));
}

fn strip_handles(v: &mut Value) {
    match v {
        Value::Object(m) => {
            if m.get("__js").and_then(|x| x.as_str()) == Some("function") {
                m.shift_remove("module");
                m.shift_remove("export");
                m.shift_remove("path");
            }
            for (_, x) in m.iter_mut() {
                strip_handles(x);
            }
        }
        Value::Array(a) => a.iter_mut().for_each(strip_handles),
        _ => {}
    }
}

#[test]
fn matches_js_project_load() {
    use_js_cli_root();
    let file = std::env::var("PROJECT_ORACLE").unwrap_or_else(|_| "/tmp/project-oracle.json".into());
    let Some(Value::Array(cases)) = np::read_json(&file) else {
        eprintln!("project oracle {file} missing: skipped");
        return;
    };
    let mut failures = Vec::new();
    for c in &cases {
        let dir = c["dir"].as_str().unwrap();
        match super::project::Project::load(dir) {
            Err(e) => {
                if c.get("error").and_then(|x| x.as_str()) != Some(e.as_str()) {
                    failures.push(format!("{dir}: rust error {e}, js {:?}", c.get("error")));
                }
            }
            Ok(p) => {
                let mut loaded = Value::Array(p.loaded_integrations.iter().map(|r| Value::Object(r.clone())).collect());
                strip_handles(&mut loaded);
                if loaded != c["loaded"] {
                    failures.push(format!("{dir} loaded:\n  rust {loaded}\n  js   {}", c["loaded"]));
                }
                let mut config = p.config.clone();
                strip_handles(&mut config);
                if config != c["config"] {
                    failures.push(format!("{dir} config: rust {config} js {}", c["config"]));
                }
                let issues = Value::Array(p.issues().iter().map(|i| i.to_json()).collect());
                // Validation issues come from project::VALIDATOR (doctor lane).
                if issues != c["issues"] && super::project::VALIDATOR.get().is_some() {
                    failures.push(format!("{dir} issues:\n  rust {issues}\n  js   {}", c["issues"]));
                }
            }
        }
    }
    assert!(failures.is_empty(), "{} mismatches:\n{}", failures.len(), failures.join("\n"));
}

#[test]
fn matches_js_read_doc_view() {
    use_js_cli_root();
    let file = std::env::var("READ_ORACLE").unwrap_or_else(|_| "/tmp/read-oracle.json".into());
    let Some(Value::Array(cases)) = np::read_json(&file) else {
        eprintln!("read oracle {file} missing: skipped");
        return;
    };
    let mut failures = Vec::new();
    for c in &cases {
        let f = c["file"].as_str().unwrap();
        let root = c["root"].as_str();
        let lang = c["lang"].as_str();
        let got = if c["reader"] == "strict" {
            super::doc_read::load_component_doc(f, lang, root)
        } else {
            super::doc_read::load_docs(f, lang, root)
        };
        let want: Result<Option<Value>, String> = match c.get("error") {
            Some(e) => Err(e.as_str().unwrap().to_string()),
            None if c["undef"] == true => Ok(None),
            None => Ok(Some(c["ok"].clone())),
        };
        if got != want {
            let g = format!("{got:?}");
            let w = format!("{want:?}");
            failures.push(format!("{f} {lang:?} {}:\n  rust {}\n  js   {}", c["reader"], &g[..g.len().min(400)], &w[..w.len().min(400)]));
        }
    }
    assert!(failures.is_empty(), "{} of {} mismatches:\n{}", failures.len(), cases.len(), failures.iter().take(15).cloned().collect::<Vec<_>>().join("\n"));
}

fn entry_json(c: &super::docs_discovery::DocsCatalog, e: &super::docs_discovery::TopicEntry) -> Value {
    let mut m = crate::json::Map::new();
    m.insert("name".into(), Value::String(e.name.clone()));
    m.insert("package".into(), Value::String(e.package.clone()));
    m.insert("path".into(), Value::String(e.path.clone()));
    if e.package != super::docs_discovery::BUILTIN_DOCS_PACKAGE {
        if let Some(t) = &e.title { m.insert("title".into(), t.clone()); }
        if let Some(t) = &e.description { m.insert("description".into(), t.clone()); }
        if let Some(t) = &e.category { m.insert("category".into(), t.clone()); }
        if let Some(t) = &e.replaces { m.insert("replaces".into(), Value::String(t.clone())); }
        if let Some(t) = &e.replaced_package { m.insert("replacedPackage".into(), Value::String(t.clone())); }
        if let Some(t) = &e.provider_id { m.insert("providerId".into(), Value::String(t.clone())); }
    }
    m.insert(
        "extensions".into(),
        Value::Array(e.extensions.iter().map(|x| serde_json::json!({"package": x.package, "path": x.path})).collect()),
    );
    m.insert("aliases".into(), serde_json::json!(c.aliases_of(e)));
    Value::Object(m)
}

#[test]
fn matches_js_docs_catalog() {
    use_js_cli_root();
    let file = std::env::var("DOCS_ORACLE").unwrap_or_else(|_| "/tmp/docs-oracle.json".into());
    let Some(Value::Array(cases)) = np::read_json(&file) else { return };
    let mut failures = Vec::new();
    for c in &cases {
        let dir = c["dir"].as_str().unwrap();
        let p = super::project::Project::load(dir).unwrap();
        let cat = p.docs();
        let entries = Value::Array(cat.entries().iter().map(|e| entry_json(&cat, e)).collect());
        let mut want = c["entries"].clone();
        // JSON drops undefined fields on the JS side.
        if let Value::Array(a) = &mut want { for e in a.iter_mut() { if let Value::Object(m) = e { m.retain(|_, v| !v.is_null() || true); } } }
        if entries != want {
            failures.push(format!("{dir} entries:\n rust {entries}\n js   {want}"));
        }
        let mut tree = Value::Array(cat.tree_inputs.iter().map(|t| serde_json::json!({"namespaces": t.namespaces, "guides": t.guides})).collect());
        super::docs_section_key::strip_marks(&mut tree);
        if tree != c["tree"] {
            failures.push(format!("{dir} tree:\n rust {tree}\n js   {}", c["tree"]));
        }
        let issues = Value::Array(cat.issues.iter().map(|(p, m)| serde_json::json!({"package": p, "message": m})).collect());
        if issues != c["issues"] {
            failures.push(format!("{dir} issues: rust {issues} js {}", c["issues"]));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn matches_js_collect_identities() {
    use_js_cli_root();
    let file = std::env::var("IDENTITY_ORACLE").unwrap_or_else(|_| "/tmp/identity-oracle.json".into());
    let Some(Value::Array(cases)) = np::read_json(&file) else { return };
    let mut failures = Vec::new();
    for c in &cases {
        let dir = c["dir"].as_str().unwrap();
        let p = super::project::Project::load(dir).unwrap();
        let r = p.loaded_integrations.iter().find(|r| r.get("name") == c.get("name")).unwrap();
        let (ids, errs) = super::contribution_inventory::collect_identities(r);
        let got = ids.to_json();
        if got != c["identities"] {
            failures.push(format!("{dir} {}: rust {got}\n js {}", c["name"], c["identities"]));
        }
        let errs = Value::Array(errs.iter().map(|e| serde_json::json!({"kind": e.kind, "message": e.message})).collect());
        if errs != c["errors"] {
            failures.push(format!("{dir} errors: rust {errs} js {}", c["errors"]));
        }
        let (manifest, roots, all) = super::contribution_inventory::compute_required_files(r);
        let req = serde_json::json!({"manifest": manifest, "roots": roots.iter().map(|(k, p, f)| serde_json::json!({"kind": k, "path": p, "files": f})).collect::<Vec<_>>(), "allFiles": all});
        if req != c["required"] {
            failures.push(format!("{dir} required: rust {req}\n js {}", c["required"]));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn matches_js_file_protection() {
    let file = std::env::var("PROTECTION_ORACLE").unwrap_or_else(|_| "/tmp/protection-oracle.json".into());
    let Some(o) = np::read_json(&file) else { return };
    let mut failures = Vec::new();
    for c in o["ignore"].as_array().unwrap() {
        let mut m = super::file_protection::Ignore::new(false);
        m.add(c["pattern"].as_str().unwrap()).unwrap();
        for r in c["results"].as_array().unwrap() {
            let got = m.test(r[0].as_str().unwrap()).unwrap();
            if got != (r[1].as_bool().unwrap(), r[2].as_bool().unwrap()) {
                failures.push(format!("ignore {} on {}: rust {got:?} js {r}", c["pattern"], r[0]));
            }
        }
    }
    let root = o["root"].as_str().unwrap();
    let res = super::file_protection::FileProtectionResolver::new(root, &[]).unwrap();
    for c in o["cases"].as_array().unwrap() {
        let f = c["file"].as_str().unwrap();
        let classified = res.classify(&np::join2(root, f));
        if let Some(e) = c.get("error") {
            match &classified {
                Err(err) if Some(err.message.as_str()) == e.as_str() => {}
                other => failures.push(format!("classify {f}: rust {other:?} js error {e}")),
            }
            continue;
        }
        let got: Vec<Value> = match classified { Ok(v) => v, Err(e) => { failures.push(format!("classify {f}: rust error {}", e.message)); continue } }
            .into_iter()
            .map(|p| {
                let mut m = crate::json::Map::new();
                m.insert("file".into(), Value::String(p.file));
                m.insert("reason".into(), Value::String(p.reason.into()));
                m.insert("declaration".into(), Value::String(p.declaration));
                if let Some(s) = p.source { m.insert("source".into(), Value::String(s)); }
                if let Some(l) = p.line { m.insert("line".into(), Value::from(l)); }
                if let Some(c) = p.command { m.insert("command".into(), Value::String(c)); }
                Value::Object(m)
            })
            .collect();
        let mut want = c["protections"].clone();
        if let Value::Array(a) = &mut want {
            for x in a.iter_mut() {
                if let Value::Object(m) = x {
                    m.retain(|_, v| !v.is_null());
                }
            }
        }
        let got = Value::Array(got);
        if got != want {
            failures.push(format!("classify {f}: rust {got} js {want}"));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn matches_js_doc_consistency() {
    use_js_cli_root();
    let file = std::env::var("CONSISTENCY_ORACLE").unwrap_or_else(|_| "/tmp/consistency-oracle.json".into());
    let Some(Value::Array(cases)) = np::read_json(&file) else { return };
    let mut failures = Vec::new();
    for c in &cases {
        let mut r = crate::json::Map::new();
        for k in ["components", "docs"] {
            if let Some(Value::String(v)) = c["integration"].get(k) {
                r.insert(k.into(), Value::String(v.clone()));
            }
        }
        let pkg = c.get("packageDir").and_then(|v| v.as_str()).unwrap_or(c["dir"].as_str().unwrap());
        let got = Value::Array(super::doc_consistency::integration_doc_consistency(&r, pkg));
        if got != c["issues"] {
            failures.push(format!("{}:\n rust {got}\n js   {}", c["name"], c["issues"]));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn matches_js_doc_commands() {
    use_js_cli_root();
    let file = std::env::var("COMMANDS_ORACLE").unwrap_or_else(|_| "/tmp/commands-oracle.json".into());
    let Some(o) = np::read_json(&file) else { return };
    let mut failures = Vec::new();
    for t in o["texts"].as_array().unwrap() {
        let text = t[0].as_str().unwrap();
        let got: Vec<Value> = super::runner_commands::doc_commands_in(text, t[1].as_str())
            .into_iter()
            .map(|c| serde_json::json!({"at": c.at, "written": c.written, "code": c.code, "fix": c.fix}))
            .collect();
        if Value::Array(got.clone()) != t[2] {
            failures.push(format!("{text:?}:\n rust {}\n js   {}", Value::Array(got), t[2]));
        }
    }
    for t in o["tokens"].as_array().unwrap() {
        let got = super::doc_tokens::token_for_command(t[0].as_str().unwrap());
        if got.as_deref() != t[1].as_str() {
            failures.push(format!("token {}: rust {got:?} js {}", t[0], t[1]));
        }
    }
    let mut r = crate::json::Map::new();
    r.insert("name".into(), Value::String("@x/c".into()));
    r.insert("docs".into(), o["docsDir"].clone());
    let found = super::docs_discovery::discover_integration_docs(&r);
    let notes = Value::Array(super::runner_commands::find_doc_commands(&found).iter().map(|n| n.to_json()).collect());
    if notes != o["notes"] {
        failures.push(format!("notes:\n rust {notes}\n js   {}", o["notes"]));
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn matches_js_integration_doc_files() {
    use_js_cli_root();
    let file = std::env::var("DOCFILES_ORACLE").unwrap_or_else(|_| "/tmp/docfiles-oracle.json".into());
    let Some(Value::Array(cases)) = np::read_json(&file) else { return };
    let mut failures = Vec::new();
    for c in &cases {
        let p = super::project::Project::load(c["dir"].as_str().unwrap()).unwrap();
        let r = p.loaded_integrations.iter().find(|r| r.get("name") == c.get("name")).unwrap();
        let got = super::integration_doc_files::integration_doc_files(r).to_json();
        if got != c["result"] {
            failures.push(format!("{}:\n rust {got}\n js   {}", c["name"], c["result"]));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn matches_js_copied_passages_and_fluff() {
    use_js_cli_root();
    let file = std::env::var("PROSE_ORACLE").unwrap_or_else(|_| "/tmp/prose-oracle.json".into());
    let Some(o) = np::read_json(&file) else { return };
    let mut failures = Vec::new();
    let mut r = crate::json::Map::new();
    r.insert("name".into(), Value::String("@x/prose".into()));
    r.insert("docs".into(), o["docsDir"].clone());
    let found = super::docs_discovery::discover_integration_docs(&r);
    let copied = Value::Array(super::copied_passages::find_copied_passages(&found).iter().map(|c| c.to_json()).collect());
    if copied != o["copied"] {
        failures.push(format!("copied:\n rust {copied}\n js   {}", o["copied"]));
    }
    let fluff = Value::Array(super::doc_fluff::find_fluff(&found).iter().map(|c| c.to_json()).collect());
    if fluff != o["fluff"] {
        failures.push(format!("fluff:\n rust {fluff}\n js   {}", o["fluff"]));
    }
    for t in o["filler"].as_array().unwrap() {
        let got = Value::Array(
            super::doc_fluff::filler_at(t[0].as_str().unwrap())
                .iter()
                .map(|f| serde_json::json!({"phrase": f.phrase, "at": f.at, "thatAfter": f.that_after}))
                .collect(),
        );
        if got != t[1] {
            failures.push(format!("filler {}: rust {got} js {}", t[0], t[1]));
        }
    }
    let m = super::doc_fluff::core_density_median();
    if Some(m) != o["median"].as_f64() {
        failures.push(format!("median rust {m} js {}", o["median"]));
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn matches_js_stray_pointers() {
    use_js_cli_root();
    let file = std::env::var("STRAY_ORACLE").unwrap_or_else(|_| "/tmp/stray-oracle.json".into());
    let Some(o) = np::read_json(&file) else { return };
    let mut r = crate::json::Map::new();
    r.insert("name".into(), Value::String("@x/stray".into()));
    r.insert("docs".into(), o["docsDir"].clone());
    let found = super::docs_discovery::discover_integration_docs(&r);
    let comps: Vec<(String, String)> = o["components"].as_array().unwrap().iter().map(|c| (c[0].as_str().unwrap().into(), c[1].as_str().unwrap().into())).collect();
    let got = Value::Array(super::stray_pointers::find_stray_pointers(&found, &comps).iter().map(|s| s.to_json()).collect());
    assert_eq!(got, o["found"], "\n rust {got}\n js   {}", o["found"]);
}

#[test]
fn matches_js_older_cli_and_icon_notes() {
    use_js_cli_root();
    let file = std::env::var("STABILITY_ORACLE").unwrap_or_else(|_| "/tmp/stability-oracle.json".into());
    let Some(o) = np::read_json(&file) else { return };
    let loaded = o["loaded"].as_object().unwrap().clone();
    let pkg_dir = loaded["__packageDir"].as_str().unwrap().to_string();
    let older = Value::Array(super::doc_stability::older_cli_notes(&loaded, &o["pkg"], &pkg_dir).iter().map(|n| n.to_json()).collect());
    assert_eq!(older, o["older"], "\n rust {older}\n js   {}", o["older"]);
    let icons = Value::Array(
        super::doc_stability::template_icon_notes(&loaded, &pkg_dir).iter().map(|(c, m)| serde_json::json!({"code": c, "message": m})).collect(),
    );
    assert_eq!(icons, o["icons"], "\n rust {icons}\n js   {}", o["icons"]);
}

#[test]
fn matches_js_contribution_fixes() {
    use super::contribution_fixes as cf;
    use_js_cli_root();
    let file = std::env::var("FIXES_ORACLE").unwrap_or_else(|_| "/tmp/fixes-oracle.json".into());
    let Some(Value::Array(cases)) = np::read_json(&file) else { return };
    let mut failures = Vec::new();
    for c in &cases {
        let integ = c["integration"].as_object().unwrap().clone();
        let ctx = cf::create_fix_context(c["dir"].as_str().unwrap(), &integ);
        let args = c["args"].as_array().unwrap();
        let a = |i: usize| args.get(i).and_then(|v| v.as_str());
        let file = a(0).unwrap_or("");
        let stamp = if file.is_empty() { None } else { cf::stamp_of(&ctx, file) };
        let st = || stamp.clone().unwrap();
        let s = |v: Option<String>| v.map(Value::String).unwrap_or(Value::Null);
        let got = match c["fn"].as_str().unwrap() {
            "stamp" => stamp.as_ref().map(|s| serde_json::json!({"type": s.kind, "name": s.name})).unwrap_or(Value::Null),
            "unreachable" => Value::String(cf::unreachable_fix(&ctx, file, &st())),
            "notAComponent" => Value::String(cf::not_a_component_fix(&ctx, file, &st())),
            "notACodemod" => Value::String(cf::not_a_codemod_fix(&ctx, file, &st(), a(1), a(2))),
            "sharedCodemods" => s(cf::shared_codemods_root_fix(&ctx, a(1))),
            "heldRoot" => s(cf::held_root_fix(&ctx, &np::join2(&np::dirname(c["dir"].as_str().unwrap()), a(1).unwrap()))),
            "newComponentDocNote" => Value::String(cf::new_component_doc_note(&ctx)),
            "themeImporting" => cf::theme_importing(&ctx, file)
                .map(|(d, s, src)| serde_json::json!({"doc": d, "stamp": {"type": s.kind, "name": s.name}, "source": src}))
                .unwrap_or(Value::Null),
            _ => Value::Null,
        };
        if got != c["result"] {
            failures.push(format!("{} {} {:?}:\n rust {got}\n js   {}", c["pkg"], c["fn"], a(0), c["result"]));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn matches_js_module_origins() {
    use super::module_origins as mo;
    let file = std::env::var("ORIGINS_ORACLE").unwrap_or_else(|_| "/tmp/origins-oracle.json".into());
    let Some(o) = np::read_json(&file) else { return };
    let ser = |o: Option<mo::Origin>| o.map(|o| serde_json::json!({"file": o.file, "name": o.name})).unwrap_or(Value::Null);
    let mut failures = Vec::new();
    for c in o["cases"].as_array().unwrap() {
        let f = c["file"].as_str().unwrap();
        let n = c["name"].as_str().unwrap();
        let v = mo::export_origin_verdict(f, n);
        let (origin, reason) = match &v {
            mo::Verdict::Exports(o) => (ser(o.clone()), Value::Null),
            mo::Verdict::Unknown(r) => (Value::Null, Value::String(r.clone())),
            mo::Verdict::Lacks => (Value::Null, Value::Null),
        };
        let org = mo::module_export_origin(f, n);
        let got = serde_json::json!({
            "file": f, "name": n, "verdict": v.name(), "origin": origin, "reason": reason,
            "plain": mo::module_export_verdict(f, n).name(),
            "kind": mo::export_value_kind(f, n).as_str(),
            "scalar": mo::export_scalar_type(f, n),
            "aliased": org.as_ref().map(|o| ser(mo::aliased_origin(o))).unwrap_or(Value::Null),
            "bindings": mo::static_export_bindings(f, n).map(|b| b.into_iter().map(|(k, o)| serde_json::json!([k, ser(o)])).collect::<Vec<_>>()),
        });
        if &got != c {
            failures.push(format!("{f} {n}:\n rust {got}\n js   {c}"));
        }
    }
    for c in o["followed"].as_array().unwrap() {
        let got = serde_json::json!(mo::followed_export_names(c[0].as_str().unwrap()));
        if got != c[1] {
            failures.push(format!("followed {}: rust {got} js {}", c[0], c[1]));
        }
    }
    for c in o["failures"].as_array().unwrap() {
        let got = mo::module_parse_failure(c[0].as_str().unwrap()).map(|(f, m)| serde_json::json!([f, m])).unwrap_or(Value::Null);
        if got != c[1] {
            failures.push(format!("parse failure {}: rust {got} js {}", c[0], c[1]));
        }
    }
    assert!(failures.is_empty(), "{} failures\n{}", failures.len(), failures.join("\n"));
}

#[test]
fn matches_js_icon_set_checks() {
    use_js_cli_root();
    let file = std::env::var("ICONCHECKS_ORACLE").unwrap_or_else(|_| "/tmp/iconchecks-oracle.json".into());
    let Some(Value::Array(cases)) = np::read_json(&file) else { return };
    let mut failures = Vec::new();
    for c in &cases {
        let loaded = c["loaded"].as_object().unwrap().clone();
        let mut unchecked = super::icon_set_checks::Unchecked::new();
        let issues = Value::Array(super::icon_set_checks::icon_set_issues(c["dir"].as_str().unwrap(), &loaded, &mut unchecked));
        if issues != c["issues"] {
            failures.push(format!("{} issues:\n rust {issues}\n js   {}", c["name"], c["issues"]));
        }
        let un = Value::Array(unchecked.iter().map(|(k, v)| serde_json::json!([k, v])).collect());
        if un != c["unchecked"] {
            failures.push(format!("{} unchecked:\n rust {un}\n js   {}", c["name"], c["unchecked"]));
        }
        let cov = Value::Array(super::icon_set_checks::icon_set_coverage(&loaded, &unchecked));
        if cov != c["coverage"] {
            failures.push(format!("{} coverage:\n rust {cov}\n js   {}", c["name"], c["coverage"]));
        }
    }
    assert!(failures.is_empty(), "{} failures\n{}", failures.len(), failures.join("\n"));
}

#[test]
fn fresh_load_rereads_the_config() {
    let dir = std::env::temp_dir().join(format!("astryx-fresh-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("package.json"), "{\"name\":\"app\"}").unwrap();
    let cfg = dir.join("astryx.config.mjs");
    std::fs::write(&cfg, "export default {integrations: []};\n").unwrap();
    let d = dir.to_string_lossy().to_string();
    assert!(super::project::Project::load(&d).is_ok());
    std::fs::write(&cfg, "export default {integrations: [], layout: 1};\n").unwrap();
    assert!(super::project::Project::load(&d).is_ok(), "a plain load serves the cached config");
    let e = super::project::Project::load_opts(&d, true, true).err().expect("fresh load rereads");
    assert!(e.contains("layout"), "{e}");
    assert!(super::project::Project::load(&d).is_err(), "the reread replaces the cached config");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn matches_js_unread_theme_folders() {
    let file = std::env::var("UNREAD_ORACLE").unwrap_or_else(|_| "/tmp/unread-oracle.json".into());
    let Some(o) = np::read_json(&file) else { return };
    let got = super::theme_unread::unread_theme_folders(o["root"].as_str().unwrap(), o["dir"].as_str(), Some("@x/pkg"));
    assert_eq!(serde_json::json!(got), o["result"]);
}

#[test]
fn matches_js_set_config_string() {
    let file = std::env::var("CONFIGWRITER_ORACLE").unwrap_or_else(|_| "/tmp/configwriter-oracle.json".into());
    let Some(Value::Array(cases)) = np::read_json(&file) else { return };
    let mut failures = Vec::new();
    for c in &cases {
        let dir = c["dir"].as_str().unwrap();
        let r = super::config_writer::set_config_string(dir, c["key"].as_str().unwrap(), c["value"].as_str().unwrap());
        let got = match &r {
            Ok(w) => serde_json::json!({"file": w.file, "created": w.created, "previous": w.previous, "changed": w.changed}),
            Err(e) => serde_json::json!({"error": e.message, "code": e.code}),
        };
        let f = ["astryx.config.ts", "astryx.config.mjs"].iter().map(|n| np::join2(dir, n)).find(|f| np::exists(f));
        let output = f.as_deref().and_then(np::read_text).unwrap_or_default();
        if got != c["result"] || output != c["output"].as_str().unwrap() {
            failures.push(format!("{} {}:\n rust {got}\n{output}\n js   {}\n{}", c["name"], c["key"], c["result"], c["output"].as_str().unwrap()));
        }
        // Put the input back so the test can run again.
        match (c["input"].as_str(), &f) {
            (Some(t), Some(f)) => std::fs::write(f, t).unwrap(),
            (None, Some(f)) => std::fs::remove_file(f).unwrap(),
            _ => {}
        }
    }
    assert!(failures.is_empty(), "{} failures\n{}", failures.len(), failures.join("\n"));
}
