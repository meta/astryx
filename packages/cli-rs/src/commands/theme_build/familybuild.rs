//! `themeBuildFamily` (build.mjs): build the selected family members in
//! memory, then write one keyed CSS, JS and declaration set beside the root.

use super::build_impl::{err, is_undef, with_live_logger, ApiError, BuildOptions, FamilyLoad, Logger, Prepared};
use super::family::{generate_family_css, FMember};
use super::icon_imports::IconImports;
use super::module::{built_module_with, built_types_with, has_function_entries, icon_entries, slot_values, ModuleOpts};
use super::nodepath;
use crate::json::{self, Map, Value};
use boa_engine::JsValue;
use std::path::Path;

fn regex(p: &str) -> regress::Regex {
    regress::Regex::new(p).unwrap()
}

/// `extractRegistryInfo(filePath, field)`: `(exportName, importPath)`.
pub fn extract_registry_info(file: &str, field: &str) -> Option<(String, String)> {
    let content = std::fs::read_to_string(file).ok()?;
    let at = content.find("defineTheme(")?;
    let src = &content[at..];
    let explicit = regex(&format!(r"{field}:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=[,}}])"));
    let shorthand = regex(&format!(r"[,{{]\s*({field})\s*(?=[,}}])"));
    let var = explicit
        .find(src)
        .and_then(|m| m.group(1).map(|r| src[r].to_string()))
        .or_else(|| shorthand.find(src).and_then(|m| m.group(1).map(|r| src[r].to_string())))?;
    let imports = regex(r#"import\s*{([^}]*)}\s*from\s*['"]([^'"]+)['"]"#);
    let as_split = regex(r"\s+as\s+");
    for m in imports.find_iter(&content) {
        let specs = &content[m.group(1).unwrap()];
        let path = &content[m.group(2).unwrap()];
        for spec in specs.split(',') {
            let spec = spec.trim_matches(crate::cli::format::js_ws);
            let parts: Vec<&str> = {
                let mut v = Vec::new();
                let mut last = 0;
                for sm in as_split.find_iter(spec) {
                    v.push(&spec[last..sm.start()]);
                    last = sm.end();
                }
                v.push(&spec[last..]);
                v
            };
            let export = parts[0];
            let local = parts.get(1).copied().unwrap_or(export);
            if local == var {
                return Some((export.to_string(), path.to_string()));
            }
        }
    }
    None
}

fn family_binding(name: &str) -> String {
    let splitter = regex(r"[^A-Za-z0-9_$]+");
    let mut words = Vec::new();
    let mut last = 0;
    for m in splitter.find_iter(name) {
        words.push(&name[last..m.start()]);
        last = m.end();
    }
    words.push(&name[last..]);
    let words: Vec<&str> = words.into_iter().filter(|w| !w.is_empty()).collect();
    let mut id: String = words
        .iter()
        .enumerate()
        .map(|(i, w)| {
            if i == 0 {
                w.to_string()
            } else {
                let mut c = w.chars();
                c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
            }
        })
        .collect();
    if !id.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_' || c == '$') {
        id = format!("_{id}");
    }
    format!("{}Theme", if id.is_empty() { "_".to_string() } else { id })
}

struct Member {
    p: Prepared,
    name: String,
    parent_name: Option<String>,
}

fn theme_name(v: &Value) -> String {
    match v.get("name") {
        Some(Value::String(s)) => s.clone(),
        Some(v) => crate::cli::format::js_string(v),
        None => String::new(),
    }
}

fn resolve_family(prepared: Vec<Prepared>) -> Result<Vec<Member>, String> {
    if prepared.len() < 2 {
        return Err("A theme family requires at least two selected theme files.".into());
    }
    let mut names: Vec<String> = Vec::new();
    let mut sources: Vec<String> = Vec::new();
    for p in &prepared {
        if sources.contains(&p.file_path) {
            return Err(format!("Duplicate family source: {}. Select each theme file once.", p.file_path));
        }
        let n = theme_name(&p.theme);
        if names.contains(&n) {
            return Err(format!("Duplicate theme identity \"{n}\" in the selected family."));
        }
        sources.push(p.file_path.clone());
        names.push(n);
    }
    // Parents, by the exact source object each member extends.
    let mut parents: Vec<Option<String>> = Vec::new();
    with_live_logger(|s| -> Result<(), String> {
        for p in &prepared {
            let parent = &p.source_parent;
            if parent.is_undefined() {
                parents.push(None);
                continue;
            }
            let pname = parent.as_object().map(|o| s.get(&o, "name"));
            let valid = matches!(&pname, Some(v) if v.is_string() && !s.string(v).is_empty());
            if !valid {
                return Err(format!("Theme \"{}\" has an invalid normalized parent.", theme_name(&p.theme)));
            }
            let pname = s.string(&pname.unwrap());
            let Some(idx) = names.iter().position(|n| *n == pname) else {
                return Err(format!("Theme \"{}\" is missing selected ancestor \"{pname}\".", theme_name(&p.theme)));
            };
            if !parent.strict_equals(&prepared[idx].source_theme) {
                return Err(format!("Theme \"{}\" does not extend the selected \"{pname}\" source.", theme_name(&p.theme)));
            }
            parents.push(Some(pname));
        }
        Ok(())
    })?;
    // Cycles.
    let mut marks: std::collections::HashMap<String, u8> = Default::default();
    fn visit(i: usize, names: &[String], parents: &[Option<String>], marks: &mut std::collections::HashMap<String, u8>) -> Result<(), String> {
        let m = *marks.get(&names[i]).unwrap_or(&0);
        if m == 1 {
            return Err(format!("Cycle detected in selected theme family at \"{}\".", names[i]));
        }
        if m == 2 {
            return Ok(());
        }
        marks.insert(names[i].clone(), 1);
        if let Some(p) = &parents[i] {
            let j = names.iter().position(|n| n == p).unwrap();
            visit(j, names, parents, marks)?;
        }
        marks.insert(names[i].clone(), 2);
        Ok(())
    }
    for i in 0..prepared.len() {
        visit(i, &names, &parents, &mut marks)?;
    }
    let roots = parents.iter().filter(|p| p.is_none()).count();
    if roots != 1 {
        return Err(format!("A theme family must have exactly one selected root; found {roots}."));
    }
    let mut items: Vec<Option<Member>> = prepared
        .into_iter()
        .zip(parents)
        .map(|(p, parent)| {
            let name = theme_name(&p.theme);
            Some(Member { p, name, parent_name: parent })
        })
        .collect();
    let mut emitted: Vec<String> = Vec::new();
    let mut ordered = Vec::new();
    while ordered.len() < items.len() {
        let mut eligible: Vec<usize> = (0..items.len())
            .filter(|&i| {
                items[i].as_ref().map(|m| !emitted.contains(&m.name) && m.parent_name.as_ref().map(|p| emitted.contains(p)).unwrap_or(true)).unwrap_or(false)
            })
            .collect();
        if eligible.is_empty() {
            return Err("Cycle detected in selected theme family.".into());
        }
        eligible.sort_by(|&a, &b| {
            let ka = format!("{}\0{}", items[a].as_ref().unwrap().name, items[a].as_ref().unwrap().p.file_path);
            let kb = format!("{}\0{}", items[b].as_ref().unwrap().name, items[b].as_ref().unwrap().p.file_path);
            crate::discovery::jsort::cmp_utf16(&ka, &kb)
        });
        let m = items[eligible[0]].take().unwrap();
        emitted.push(m.name.clone());
        ordered.push(m);
    }
    Ok(ordered)
}

/// `familyRegistryInput`: the specifier rebased to the aggregate module.
fn registry_input(info: &Option<(String, String)>, file: &str, out_dir: &str, override_: Option<&str>) -> Option<String> {
    if info.is_none() || override_.is_some() {
        return override_.map(String::from);
    }
    let source = &info.as_ref().unwrap().1;
    if !source.starts_with("./") && !source.starts_with("../") {
        return None;
    }
    let abs = nodepath::resolve(&nodepath::dirname(file), &[source]);
    let mut spec = nodepath::relative("/", out_dir, &abs);
    if !spec.starts_with("./") && !spec.starts_with("../") {
        spec = format!("./{spec}");
    }
    Some(spec)
}

fn shell_word(v: &str) -> String {
    if !v.is_empty() && v.chars().all(|c| c.is_ascii_alphanumeric() || "@%+=:,./_-".contains(c)) {
        return v.to_string();
    }
    format!("'{}'", v.replace('\'', "'\\''"))
}

/// Dependency-first order of the selected files (`planFamilySources`, the
/// selected entries only: intermediary modules need no preload here).
fn plan_sources(files: &[String], cwd: &str) -> Vec<(String, String)> {
    let entries: Vec<(String, String)> = files.iter().map(|f| (f.clone(), nodepath::resolve(cwd, &[f]))).collect();
    let canon = |p: &str| std::fs::canonicalize(p).map(|x| x.to_string_lossy().into_owned()).unwrap_or_else(|_| nodepath::resolve(cwd, &[p]));
    let selected: Vec<String> = entries.iter().map(|e| canon(&e.1)).collect();
    let mut uniq = selected.clone();
    uniq.sort();
    uniq.dedup();
    if uniq.len() != entries.len() {
        return entries;
    }
    let deps = |file: &str| -> Vec<String> {
        let Ok(src) = std::fs::read_to_string(file) else { return vec![] };
        let re = regex(r#"(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]*)['"]|(?:^|\n)\s*import\s*['"](\.[^'"]*)['"]"#);
        let mut out = Vec::new();
        for m in re.find_iter(&src) {
            let spec = m.group(1).or(m.group(2)).map(|r| src[r].to_string()).unwrap_or_default();
            let base = nodepath::resolve(&nodepath::dirname(file), &[&spec]);
            let mut found = None;
            for cand in std::iter::once(base.clone()).chain([".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx", ".mjs", ".cjs", ".js", ".json"].iter().map(|e| format!("{base}{e}"))) {
                if Path::new(&cand).is_file() {
                    found = Some(cand);
                    break;
                }
            }
            if let Some(f) = found {
                out.push(canon(&f));
            }
        }
        out
    };
    let mut plan: Vec<(String, String)> = Vec::new();
    let mut marks: Vec<String> = Vec::new();
    fn visit(
        key: &str,
        selected: &[String],
        entries: &[(String, String)],
        deps: &dyn Fn(&str) -> Vec<String>,
        marks: &mut Vec<String>,
        plan: &mut Vec<(String, String)>,
        depth: usize,
    ) {
        if marks.iter().any(|m| m == key) || depth > 64 {
            return;
        }
        marks.push(key.to_string());
        for d in deps(key) {
            if !d.contains("/node_modules/") {
                visit(&d, selected, entries, deps, marks, plan, depth + 1);
            }
        }
        if let Some(i) = selected.iter().position(|s| s == key) {
            plan.push(entries[i].clone());
        }
    }
    for s in &selected {
        visit(s, &selected, &entries, &deps, &mut marks, &mut plan, 0);
    }
    plan
}

#[allow(clippy::too_many_arguments)]
pub fn theme_build_family(
    files: &[String],
    family_key: &str,
    check: bool,
    icons_specifier: Option<&str>,
    cwd: &str,
    cli_root: &str,
    log: &mut Logger,
    private_var_error: &mut bool,
) -> Result<Value, ApiError> {
    let key_ok = regex(r"^[a-z0-9]+(?:-[a-z0-9]+)*$").find(family_key).is_some();
    if !key_ok {
        return Err(err("Family key must be an exact lower-kebab filename stem (for example, ocean-family).", "ERR_THEME_INVALID"));
    }
    let mut fam = super::build_impl::family_load(cwd, cli_root)?;
    let mut prepared: Vec<Prepared> = Vec::new();
    for (file, _) in plan_sources(files, cwd) {
        let opts = BuildOptions { out: None, check: false, icons_specifier: icons_specifier.map(String::from) };
        fam.prepared = None;
        super::build_impl::theme_build_internal(&file, &opts, cwd, cli_root, log, false, None, private_var_error, Some(&mut fam))?;
        match fam.prepared.take() {
            Some(p) => prepared.push(p),
            None => return Err(err(format!("Theme family member \"{file}\" did not produce a complete build plan."), "ERR_THEME_INVALID")),
        }
    }
    let members = resolve_family(prepared).map_err(|m| err(m, "ERR_THEME_INVALID"))?;
    for m in &members {
        let parent = members.iter().find(|o| Some(&o.name) == m.parent_name.as_ref());
        for (field, info) in [("icons", &m.p.icon_info), ("indicators", &m.p.indicator_info)] {
            let value = if field == "icons" { icon_entries(Some(&m.p.theme)) } else { m.p.theme.get(field) };
            let inherited = parent.and_then(|p| if field == "icons" { icon_entries(Some(&p.p.theme)) } else { p.p.theme.get(field) });
            let has = super::build_impl::as_obj(value).map(|o| !o.is_empty()).unwrap_or(false);
            if has && value != inherited && info.is_none() {
                return Err(err(format!("Theme \"{}\" must supply {field} through a named import for family output.", m.name), "ERR_THEME_INVALID"));
            }
        }
    }
    if members.iter().any(|m| m.name == family_key) {
        return Err(err(
            format!("Family key \"{family_key}\" collides with a selected theme's standalone outputs. Choose a distinct filename stem."),
            "ERR_THEME_INVALID",
        ));
    }
    let root = &members[0];
    let out_dir = nodepath::dirname(&root.p.file_path);
    let out_path = nodepath::join(&[&out_dir, &format!("{family_key}.css")]);
    let css_dts = format!("{out_path}.d.ts");
    let js_path = nodepath::join(&[&out_dir, &format!("{family_key}.js")]);
    let dts_path = nodepath::join(&[&out_dir, &format!("{family_key}.d.ts")]);
    let real = |p: &str| std::fs::canonicalize(p).map(|x| x.to_string_lossy().into_owned()).unwrap_or_else(|_| p.to_string());
    let sources: Vec<String> = members.iter().flat_map(|m| [nodepath::resolve(cwd, &[&m.p.file_path]).to_lowercase(), real(&m.p.file_path).to_lowercase()]).collect();
    for o in [&out_path, &css_dts, &js_path, &dts_path] {
        let mut c = vec![nodepath::resolve(cwd, &[o])];
        if Path::new(o).exists() {
            c.push(real(o));
        }
        if c.iter().any(|v| sources.contains(&v.to_lowercase())) {
            return Err(err(format!("Family output {} collides with a selected source file.", nodepath::relative(cwd, cwd, o)), "ERR_THEME_INVALID"));
        }
    }
    let rels: Vec<String> = members.iter().map(|m| m.p.source_relative.clone()).collect();
    let source_relative = rels.join(", ");
    let inv = crate::cli::env::format_cli_command_at(Path::new(cwd), "");
    let build_command = format!("{inv} theme build --family {} --family-key {family_key}", rels.join(" "));
    let mut used: std::collections::HashMap<String, usize> = Default::default();
    let bindings: Vec<String> = members
        .iter()
        .map(|m| {
            let base = family_binding(&m.name);
            let n = used.entry(base.clone()).or_insert(0);
            *n += 1;
            if *n == 1 {
                base
            } else {
                format!("{base}{n}")
            }
        })
        .collect();
    let fm: Vec<FMember> = members.iter().map(|m| FMember { name: m.name.clone(), css: &m.p.css }).collect();
    let css = generate_family_css(&fm).map_err(|m| err(m, "ERR_THEME_INVALID"))?;
    let mut js_parts: Vec<String> = Vec::new();
    let mut registry_imports: Vec<(String, String)> = Vec::new();
    for (i, m) in members.iter().enumerate() {
        let binding = &bindings[i];
        let parent_idx = m.parent_name.as_ref().and_then(|p| members.iter().position(|o| &o.name == p));
        let parent_binding = parent_idx.map(|j| bindings[j].clone());
        let icon_spec = registry_input(&m.p.icon_info, &m.p.file_path, &out_dir, icons_specifier);
        let ind_spec = registry_input(&m.p.indicator_info, &m.p.file_path, &out_dir, None);
        for (info, spec) in [(&m.p.icon_info, &icon_spec), (&m.p.indicator_info, &ind_spec)] {
            if let Some((export, path)) = info {
                registry_imports.push((spec.clone().unwrap_or_else(|| path.clone()), export.clone()));
            }
        }
        let own_icons = m.p.icon_info.as_ref().map(|_| format!("{binding}Icons"));
        let parent = parent_idx.map(|j| &members[j]);
        let inherited_icons = parent_binding.as_ref().map(|pb| {
            format!("{pb}.{}", if has_function_entries(icon_entries(parent.map(|p| &p.p.theme))) { "__icons" } else { "icons" })
        });
        let own_ind = m.p.indicator_info.as_ref().map(|_| format!("{binding}Indicators"));
        let inherited_ind = parent_binding.as_ref().map(|pb| format!("{pb}.indicators"));
        let expression = |own: Option<String>, inh: Option<String>| match (own, inh) {
            (Some(o), Some(i)) => Some(format!("{{...{i}, ...{o}}}")),
            (o, i) => o.or(i),
        };
        let ind_import = match (&m.p.indicator_info, &own_ind) {
            (Some((export, path)), Some(local)) => format!(
                "import {{ {export} as {local} }} from {};\n",
                json::stringify(&Value::String(ind_spec.clone().unwrap_or_else(|| path.clone())), 0)
            ),
            _ => String::new(),
        };
        let icon_imports = match (&m.p.icon_info, &own_icons) {
            (Some((export, path)), Some(local)) => Some(IconImports {
                imports: vec![(path.clone(), export.clone(), local.clone())],
                expression: local.clone(),
                export_name: local.clone(),
                merge_name: None,
                icons_specifier_import_path: Some(path.clone()),
                icons_specifier_local_name: Some(local.clone()),
            }),
            _ => None,
        };
        let component = family_component_icons(m, parent, binding, parent_binding.as_deref(), &out_dir, &mut registry_imports, &expression)?;
        let module = built_module_with(
            &m.p.theme,
            &inv,
            icon_imports.as_ref(),
            icon_spec.as_deref(),
            component.as_ref(),
            &ModuleOpts {
                theme_binding: Some(binding.clone()),
                icons_expression: expression(own_icons.clone(), inherited_icons),
                indicators_expression: expression(own_ind, inherited_ind),
                artifact_base: Some(family_key.to_string()),
                hide_icons_export: true,
            },
        )?;
        js_parts.push(ind_import + &module);
    }
    let js = js_parts.join("\n");
    validate_registry_graphs(&registry_imports, &js_path)?;
    let declarations: String = members
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let info = m.p.icon_info.as_ref().map(|(e, _)| IconImports {
                imports: vec![],
                expression: e.clone(),
                export_name: e.clone(),
                merge_name: None,
                icons_specifier_import_path: None,
                icons_specifier_local_name: None,
            });
            built_types_with(&m.p.theme, info.as_ref(), None, Some(&bindings[i]), false, i == 0)
        })
        .collect();
    let mut augs: Vec<String> = Vec::new();
    for m in &members {
        if let Some(d) = &m.p.variant_decl {
            if !augs.contains(d) {
                augs.push(d.clone());
            }
        }
    }
    let augmentations = augs.join("\n");
    let header = |lang: &str| super::build_impl::generated_header_pub(&source_relative, lang, &build_command, &root.p.cli_version, &root.p.core_version);
    let writes = vec![
        (out_path.clone(), header("css") + &css, false),
        (css_dts.clone(), header("ts") + "export {};\n", true),
        (js_path.clone(), header("js") + &js, false),
        (dts_path.clone(), header("ts") + &declarations + &(if augmentations.is_empty() { String::new() } else { format!("\n{augmentations}") }), false),
    ];
    let rel = |p: &str| nodepath::relative(cwd, cwd, p);
    let mut outputs = Map::new();
    outputs.insert("css".into(), Value::String(rel(&out_path)));
    outputs.insert("cssDts".into(), Value::String(rel(&css_dts)));
    outputs.insert("js".into(), Value::String(rel(&js_path)));
    outputs.insert("dts".into(), Value::String(rel(&dts_path)));
    const FAMILY_REMEDY: &str = "Family outputs go beside the family's root theme file, so run the build from a directory that contains it.";
    if !check {
        for w in &writes {
            super::build_impl::confine_output_pub(&w.0, cwd, FAMILY_REMEDY, &w.0)?;
        }
    }
    if check {
        let mut stale: Vec<Value> = Vec::new();
        for w in &writes {
            let r = rel(&w.0);
            if !Path::new(&w.0).exists() {
                if !w.2 {
                    stale.push(serde_json::json!({"path": r, "reason": "missing"}));
                }
                continue;
            }
            let on_disk = std::fs::read_to_string(&w.0).unwrap_or_default();
            if super::build_impl::normalize_for_compare_pub(&on_disk) != super::build_impl::normalize_for_compare_pub(&w.1) {
                stale.push(serde_json::json!({"path": r, "reason": "outdated"}));
            }
        }
        let up = stale.is_empty();
        if up {
            log.log(&format!("\n[ok] Theme family outputs are up to date with {source_relative}."));
        } else {
            log.warn(&format!("\n[fail] {} theme family output(s) are out of date:", stale.len()));
            for st in &stale {
                log.warn(&format!("  {}: {}", if st["reason"] == "missing" { "missing" } else { "stale" }, st["path"].as_str().unwrap_or_default()));
            }
            let paths: Vec<String> = members.iter().map(|m| m.p.file_path.clone()).collect();
            let mut extra = vec!["--family-key".to_string(), family_key.to_string()];
            if let Some(i) = icons_specifier {
                extra.push("--icons-specifier".into());
                extra.push(i.into());
            }
            let dests: Vec<String> = writes.iter().map(|w| w.0.clone()).collect();
            let mut arg_paths = vec!["--family".to_string()];
            arg_paths.extend(paths.iter().cloned());
            match super::build_impl::outside_check_remedy(&dests, &paths, cwd, &arg_paths, &extra) {
                Some(lines) => log.warn(&format!("\n  {}", lines.join("\n  "))),
                None => log.warn(&format!("\n  Rebuild with: {build_command}")),
            }
        }
        let checked: Vec<Value> = writes.iter().filter(|w| !w.2 || Path::new(&w.0).exists()).map(|w| Value::String(rel(&w.0))).collect();
        return Ok(serde_json::json!({"type": "theme.build.check", "data": {"name": root.name, "upToDate": up, "stale": stale, "checked": checked}}));
    }
    for w in &writes {
        if let Some(parent) = Path::new(&w.0).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&w.0, &w.1).map_err(|e| {
            err(
                format!("Failed to write theme outputs: {}", super::palette::generate::node_error_message(&e, "open", &w.0)),
                "ERR_WRITE_FAILED",
            )
        })?;
    }
    for v in outputs.values() {
        log.log(&format!("[ok] {}", v.as_str().unwrap_or_default()));
    }
    let rel_out = {
        let r = rel(&out_dir);
        if r.is_empty() {
            ".".to_string()
        } else {
            r
        }
    };
    let js_import = super::build_impl::import_specifier(&rel_out, family_key);
    let css_import = format!("{js_import}.css");
    log.log(&format!(
        "\nLoad the family CSS once, then select any member by theme identity:\n  import {{ {} }} from '{js_import}';\n  import '{css_import}';\nOr load the same stylesheet natively:\n  <link rel=\"stylesheet\" href=\"{css_import}\" />\n",
        bindings.join(", ")
    ));
    let mut warnings: Vec<String> = Vec::new();
    let mut fonts: Vec<String> = Vec::new();
    for m in &members {
        for w in &m.p.warnings {
            if !warnings.contains(w) {
                warnings.push(w.clone());
            }
        }
        for f in &m.p.unloaded_fonts {
            if !fonts.contains(f) {
                fonts.push(f.clone());
            }
        }
    }
    let notices: Vec<String> = fonts
        .iter()
        .map(|f| format!("Font \"{f}\" is named by this theme family but not loaded; add a <link> or @font-face in your app (recipe: astryx docs typography)"))
        .collect();
    for n in &notices {
        log.log(&format!("  note: {n}"));
    }
    let size = super::fmt::to_fixed(css.len() as f64 / 1024.0, 1);
    Ok(serde_json::json!({
        "type": "theme.build",
        "data": {
            "name": root.name,
            "tokenCount": members.iter().map(|m| m.p.token_count).sum::<usize>(),
            "componentCount": members.iter().map(|m| m.p.component_count).sum::<usize>(),
            "sizeKB": json::num(size.parse::<f64>().unwrap_or(0.0)),
            "outputs": Value::Object(outputs),
            "warnings": warnings,
            "notices": notices,
        }
    }))
}

#[allow(clippy::too_many_arguments)]
fn family_component_icons(
    m: &Member,
    parent: Option<&Member>,
    binding: &str,
    parent_binding: Option<&str>,
    out_dir: &str,
    registry_imports: &mut Vec<(String, String)>,
    expression: &dyn Fn(Option<String>, Option<String>) -> Option<String>,
) -> Result<Option<IconImports>, ApiError> {
    let values = slot_values(Some(&m.p.theme));
    if !has_function_entries(values) {
        return Ok(None);
    }
    let inherited_values = parent.and_then(|p| slot_values(Some(&p.p.theme)));
    let inherited = match (parent_binding, inherited_values) {
        (Some(pb), Some(iv)) if !is_undef(Some(iv)) && !iv.is_null() => {
            Some(format!("{pb}.{}", if has_function_entries(Some(iv)) { "__componentIcons" } else { "componentIcons" }))
        }
        _ => None,
    };
    let mut imports = Vec::new();
    let mut own: Option<String> = None;
    if let Some((export, path)) = &m.p.component_icon_info {
        let spec = registry_input(&m.p.component_icon_info, &m.p.file_path, out_dir, None).unwrap_or_else(|| path.clone());
        let local = format!("{binding}ComponentIconSource");
        imports.push((spec.clone(), export.clone(), local.clone()));
        registry_imports.push((spec, export.clone()));
        own = Some(local);
    } else {
        let mut own_values = Map::new();
        if let Some(Value::Object(vals)) = values {
            for (slot, v) in vals {
                let same = inherited_values.and_then(|iv| iv.get(slot)).map(|iv| iv == v && !super::build_impl::is_fn(v)).unwrap_or(false);
                if same {
                    continue;
                }
                if super::build_impl::is_fn(v) {
                    return Err(err(
                        format!("Theme \"{}\" must supply its componentIcons slot functions through a named import of its whole componentIcons map for family output.", m.name),
                        "ERR_THEME_INVALID",
                    ));
                }
                own_values.insert(slot.clone(), v.clone());
            }
        }
        if !own_values.is_empty() {
            own = crate::js::to_json_data(&Value::Object(own_values)).map(|v| json::stringify(&v, 0));
        }
    }
    if m.p.component_icon_info.is_some() {
        let merge = format!("{binding}MergeComponentIcons");
        return Ok(Some(IconImports {
            imports,
            expression: format!("{merge}({}, {})", inherited.unwrap_or_else(|| "{}".into()), own.unwrap_or_default()),
            export_name: String::new(),
            merge_name: Some(merge),
            icons_specifier_import_path: None,
            icons_specifier_local_name: None,
        }));
    }
    Ok(expression(own, inherited).map(|e| IconImports {
        imports,
        expression: e,
        export_name: String::new(),
        merge_name: None,
        icons_specifier_import_path: None,
        icons_specifier_local_name: None,
    }))
}

fn graph_err(m: String) -> ApiError {
    err(m, "ERR_THEME_INVALID")
}

const BUILTINS: &[&str] = &["assert", "buffer", "child_process", "crypto", "events", "fs", "fs/promises", "http", "https", "module", "net", "os", "path", "path/posix", "process", "stream", "url", "util", "vm", "worker_threads", "zlib", "readline", "tty", "string_decoder", "timers", "perf_hooks", "querystring", "dns", "dgram", "cluster", "async_hooks", "v8", "inspector"];

/// `resolveRegistryModule`.
fn resolve_registry(spec: &str, parent: &str, common_js: bool) -> Result<Option<String>, ApiError> {
    if BUILTINS.contains(&spec) || spec.starts_with("node:") {
        return Ok(None);
    }
    use crate::js::resolve::{resolve, Mode, Resolved};
    let resolved: String = if common_js || (!spec.starts_with('.') && !spec.starts_with('/')) {
        let mode = if common_js { Mode::Jiti } else { Mode::Esm };
        match resolve(spec, Path::new(parent), mode) {
            Ok(Resolved::File(p)) => p.to_string_lossy().into_owned(),
            Ok(Resolved::Builtin(_)) => return Ok(None),
            Err(e) => return Err(graph_err(format!("Cannot resolve registry import \"{spec}\" from {parent}: {}", e.message))),
        }
    } else if spec.starts_with('.') {
        let no_query = spec.split(['?', '#']).next().unwrap_or(spec);
        nodepath::resolve(&nodepath::dirname(parent), &[no_query])
    } else {
        spec.to_string()
    };
    if !Path::new(&resolved).is_file() {
        return Err(graph_err(format!("Cannot resolve registry import \"{spec}\" from {parent}.")));
    }
    Ok(Some(std::fs::canonicalize(&resolved).map(|p| p.to_string_lossy().into_owned()).unwrap_or(resolved)))
}

fn with_registry_ast<R>(file: &str, f: impl FnOnce(&oxc::ast::ast::Program) -> Result<R, ApiError>) -> Result<R, ApiError> {
    let src = std::fs::read_to_string(file).unwrap_or_default();
    let alloc = oxc::allocator::Allocator::default();
    let st = oxc::span::SourceType::from_path(file).unwrap_or_else(|_| oxc::span::SourceType::tsx()).with_typescript(true).with_jsx(true).with_unambiguous(true);
    let ret = oxc::parser::Parser::new(&alloc, &src, st).parse();
    if let Some(d) = ret.diagnostics.first() {
        return Err(graph_err(format!("Cannot inspect registry module {file}: {}", d.message)));
    }
    f(&ret.program)
}

fn mep(n: &oxc::ast::ast::ModuleExportName) -> String {
    use oxc::ast::ast::ModuleExportName as M;
    match n {
        M::IdentifierName(i) => i.name.to_string(),
        M::IdentifierReference(i) => i.name.to_string(),
        M::StringLiteral(s) => s.value.as_str().unwrap_or("").to_string(),
    }
}

/// `hasNamedExport`: Some(true/false), or None when it cannot tell.
fn has_named_export(file: &str, name: &str, seen: &mut Vec<String>) -> Result<Option<bool>, ApiError> {
    let key = format!("{file}\0{name}");
    if seen.contains(&key) {
        return Ok(Some(false));
    }
    seen.push(key);
    enum Step {
        Found,
        Follow(String, String),
        All(String),
    }
    let (steps, esm) = with_registry_ast(file, |prog| {
        use oxc::ast::ast::*;
        let mut steps: Vec<Step> = Vec::new();
        let mut esm = false;
        for st in &prog.body {
            match st {
                Statement::ExportDefaultDeclaration(_) => {
                    esm = true;
                    if name == "default" {
                        steps.push(Step::Found);
                    }
                }
                Statement::ExportDeclaration(e) => {
                    esm = true;
                    let hit = match &e.declaration {
                        Declaration::VariableDeclaration(v) => v.declarations.iter().any(|d| d.id.get_identifier_name().map(|n| n.as_str() == name).unwrap_or(false)),
                        Declaration::FunctionDeclaration(f) => f.id.as_ref().map(|i| i.name.as_str() == name).unwrap_or(false),
                        Declaration::ClassDeclaration(c) => c.id.as_ref().map(|i| i.name.as_str() == name).unwrap_or(false),
                        _ => false,
                    };
                    if hit {
                        steps.push(Step::Found);
                    }
                }
                Statement::ExportNamedDeclaration(e) => {
                    esm = true;
                    if e.specifiers.iter().any(|sp| mep(&sp.exported) == name) {
                        steps.push(Step::Found);
                    }
                }
                Statement::ExportFromDeclaration(e) => {
                    esm = true;
                    if let Some(sp) = e.specifiers.iter().find(|sp| mep(&sp.exported) == name) {
                        steps.push(Step::Follow(e.source.value.as_str().unwrap_or("").to_string(), mep(&sp.local)));
                    }
                }
                Statement::ExportAllDeclaration(e) => {
                    esm = true;
                    match &e.exported {
                        Some(x) if mep(x) == name => steps.push(Step::Found),
                        Some(_) => {}
                        None => steps.push(Step::All(e.source.value.as_str().unwrap_or("").to_string())),
                    }
                }
                _ => {}
            }
        }
        Ok((steps, esm))
    })?;
    let mut unknown = false;
    for step in steps {
        match step {
            Step::Found => return Ok(Some(true)),
            Step::Follow(src, local) => {
                return match resolve_registry(&src, file, false)? {
                    Some(t) => has_named_export(&t, &local, seen),
                    None => Ok(Some(false)),
                };
            }
            Step::All(src) => {
                let status = match resolve_registry(&src, file, false)? {
                    Some(t) => has_named_export(&t, name, seen)?,
                    None => Some(false),
                };
                if status == Some(true) {
                    return Ok(Some(true));
                }
                if status.is_none() {
                    unknown = true;
                }
            }
        }
    }
    Ok(if esm && !unknown { Some(false) } else { None })
}

/// `moduleDependencies`: (specifier, commonJs, imports).
fn module_dependencies(file: &str) -> Result<Vec<(String, bool, Vec<String>)>, ApiError> {
    with_registry_ast(file, |prog| {
        use oxc::ast::ast::*;
        use oxc::ast_visit::{walk, Visit};
        struct V {
            found: Vec<(String, bool, Vec<String>)>,
            non_static: bool,
        }
        fn literal(e: &Expression) -> Option<String> {
            match e {
                Expression::StringLiteral(s) => s.value.as_str().map(String::from),
                Expression::TemplateLiteral(t) if t.expressions.is_empty() => t.quasis.first().and_then(|q| q.value.cooked).and_then(|c| c.as_str().map(String::from)),
                _ => None,
            }
        }
        impl<'a> Visit<'a> for V {
            fn visit_import_declaration(&mut self, d: &ImportDeclaration<'a>) {
                if d.import_kind.is_type() {
                    return;
                }
                let mut imports = Vec::new();
                if let Some(sp) = &d.specifiers {
                    for s in sp {
                        match s {
                            ImportDeclarationSpecifier::ImportSpecifier(i) if !i.import_kind.is_type() => imports.push(mep(&i.imported)),
                            ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => imports.push("default".into()),
                            _ => {}
                        }
                    }
                }
                self.found.push((d.source.value.as_str().unwrap_or("").to_string(), false, imports));
            }
            fn visit_export_from_declaration(&mut self, d: &ExportFromDeclaration<'a>) {
                if d.export_kind.is_type() {
                    return;
                }
                let imports = d.specifiers.iter().filter(|s| !s.export_kind.is_type()).map(|s| mep(&s.local)).collect();
                self.found.push((d.source.value.as_str().unwrap_or("").to_string(), false, imports));
            }
            fn visit_export_all_declaration(&mut self, d: &ExportAllDeclaration<'a>) {
                if d.export_kind.is_type() {
                    return;
                }
                self.found.push((d.source.value.as_str().unwrap_or("").to_string(), false, vec![]));
            }
            fn visit_import_expression(&mut self, e: &ImportExpression<'a>) {
                match literal(&e.source) {
                    Some(s) => self.found.push((s, false, vec![])),
                    None => self.non_static = true,
                }
                walk::walk_import_expression(self, e);
            }
            fn visit_call_expression(&mut self, c: &CallExpression<'a>) {
                if matches!(&c.callee, Expression::Identifier(i) if i.name == "require") {
                    match c.arguments.first().and_then(|a| a.as_expression()).and_then(literal) {
                        Some(s) => self.found.push((s, true, vec![])),
                        None => self.non_static = true,
                    }
                }
                walk::walk_call_expression(self, c);
            }
        }
        let mut v = V { found: vec![], non_static: false };
        v.visit_program(prog);
        if v.non_static {
            return Err(graph_err(format!("Registry module {file} has a non-static dependency; family output cannot prove that graph is resolvable and CSS-free.")));
        }
        Ok(v.found)
    })
}

/// `validateRegistryGraphs`: every registry's module graph resolves, imports
/// no CSS, and the named exports exist (installed modules are imported).
fn validate_registry_graphs(imports: &[(String, String)], aggregate: &str) -> Result<(), ApiError> {
    let css = regress::Regex::with_flags(r"\.css(?:$|[?#])", "i").unwrap();
    let mut pending: Vec<(String, String, bool, Vec<String>, Option<String>)> =
        imports.iter().map(|(spec, export)| (spec.clone(), aggregate.to_string(), false, vec![export.clone()], Some(export.clone()))).collect();
    let mut runtime: Vec<(String, String)> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    while let Some((spec, parent, cjs, names, root)) = pending.pop() {
        if css.find(&spec).is_some() {
            return Err(graph_err(format!("Theme family registry graph imports CSS: {spec}")));
        }
        let Some(file) = resolve_registry(&spec, &parent, cjs)? else { continue };
        if file.to_lowercase().ends_with(".css") {
            return Err(graph_err(format!("Theme family registry graph imports CSS: {file}")));
        }
        let external = file.split('/').any(|seg| seg == "node_modules");
        for n in &names {
            if external {
                runtime.push((file.clone(), n.clone()));
            } else {
                match has_named_export(&file, n, &mut Vec::new())? {
                    Some(false) => return Err(graph_err(format!("Family registry {file} does not export \"{n}\"."))),
                    None => runtime.push((file.clone(), n.clone())),
                    Some(true) => {}
                }
            }
        }
        if let Some(r) = root {
            runtime.push((file.clone(), r));
        }
        if seen.contains(&file) {
            continue;
        }
        seen.push(file.clone());
        if regress::Regex::with_flags(r"\.[cm]?[jt]sx?$", "i").unwrap().find(&file).is_some() {
            for (s2, c2, i2) in module_dependencies(&file)? {
                pending.push((s2, file.clone(), c2, i2, None));
            }
        }
    }
    for (file, export) in runtime {
        let r = with_live_logger(|s| -> Result<bool, String> {
            let ns = s
                .import(Path::new(&file), &crate::js::ImportOptions { jsx: false, fresh: true })
                .map_err(|e| e.message.clone())?;
            Ok(ns.has_property(boa_engine::JsString::from(export.as_str()), s.ctx()).unwrap_or(false))
        });
        match r {
            Err(m) => return Err(graph_err(format!("Cannot import family registry {file}: {m}"))),
            Ok(false) => return Err(graph_err(format!("Family registry {file} does not export \"{export}\"."))),
            Ok(true) => {}
        }
    }
    Ok(())
}

#[allow(dead_code)]
fn unused(_: JsValue, _: &dyn Fn(&str) -> String) {
    let _ = shell_word("");
}
