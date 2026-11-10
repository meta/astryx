//! Port of `refreshIconSet` (api/icon/_authoring.mjs) with `claimRootMoves`,
//! `derivedId` and `packageRootMoves`: `new-set <name> --from <library>`
//! over an existing set reads the library again.

use super::add::{self, drawn_looks, generated_module_path, look_positions, resolve_icon_source, shell_arg};
use super::api::{ierr, IconError};
use super::generated::{self as gen, GeneratedIcon};
use super::library::{self, LibraryIcon};
use super::writer as wr;
use crate::discovery::module_origins as mo;
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};
use std::collections::HashMap;

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

fn derived_id(id: &str, glyph: &LibraryIcon) -> bool {
    let flat = |t: &str| t.to_lowercase().chars().filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit()).collect::<String>();
    let ex = glyph.export.strip_suffix("Icon").unwrap_or(&glyph.export);
    [glyph.id.as_str(), glyph.export.as_str(), ex].iter().map(|x| flat(x)).any(|x| x == flat(id))
}

/// `packageRootMoves(origins, root, rootExports, where)`.
fn package_root_moves(origins: &[(String, String, String)], root_module: &str, root_file: &str, root_exports: &[String], local: &wr::LocalSet) -> Vec<(String, String, String)> {
    let mut moves: Vec<(String, String, String)> = vec![];
    if gen::icon_module_package(root_module) != root_module || root_module.starts_with('.') {
        return moves;
    }
    let subpaths: Vec<&(String, String, String)> =
        origins.iter().filter(|(_, m, _)| !m.starts_with('.') && m != root_module && gen::icon_module_package(m) == root_module).collect();
    if subpaths.is_empty() {
        return moves;
    }
    let key_of = |o: &mo::Origin| format!("{}\0{}", o.file, o.name);
    let mut by_origin: HashMap<String, String> = HashMap::new();
    for name in root_exports {
        if let Some(o) = mo::module_export_origin(root_file, name) {
            by_origin.entry(key_of(&o)).or_insert_with(|| name.clone());
        }
    }
    let self_name = local.pkg.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    for (name, module, source) in subpaths {
        let file = crate::discovery::icon_set_discovery::resolve_icon_module(module, &local.package_dir, Some(&self_name), Some(&local.package_dir));
        let resolved = file.as_ref().and_then(|f| mo::module_export_origin(f, source));
        let src = match resolved {
            Some(r) => by_origin.get(&key_of(&r)).cloned(),
            None => {
                if root_exports.contains(source) {
                    Some(source.clone())
                } else {
                    None
                }
            }
        };
        if let Some(src) = src {
            moves.push((name.clone(), src, module.clone()));
        }
    }
    moves
}

/// `claimRootMoves(set, origins, root, moves)`: (export -> (source, from)), skipped.
fn claim_root_moves(set_icons: &[Value], set_module: &str, origins: &[(String, String, String)], root: &str, moves: &[(String, String, String)]) -> (Vec<(String, String, String)>, Vec<String>) {
    let mut kept: Vec<(String, String, String)> = vec![];
    let mut skipped: Vec<String> = vec![];
    let mut claimed: Vec<String> = origins.iter().filter(|(_, m, _)| gen::same_icon_module(m, root)).map(|(_, _, src)| src.clone()).collect();
    let get = |e: &str| moves.iter().find(|(n, _, _)| n == e).cloned();
    for icon in set_icons {
        let im = icon.get("module").and_then(|v| v.as_str()).map(String::from).unwrap_or_else(|| set_module.to_string());
        if im != set_module {
            continue;
        }
        let ex = s(icon, "export");
        let own = get(&ex);
        let reads_root = origins.iter().find(|(n, _, _)| *n == ex).is_some_and(|(_, m, _)| gen::same_icon_module(m, root));
        if let Some(own) = own {
            if claimed.contains(&own.1) {
                skipped.push(s(icon, "id"));
                continue;
            }
            claimed.push(own.1.clone());
            kept.push(own);
        } else if !reads_root {
            continue;
        }
        for v in icon.get("variants").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
            let Some(mv) = get(&s(&v, "export")) else { continue };
            if claimed.contains(&mv.1) {
                skipped.push(format!("{} ({})", s(icon, "id"), s(&v, "variant")));
                continue;
            }
            claimed.push(mv.1.clone());
            kept.push(mv);
        }
    }
    skipped.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(a, b));
    (kept, skipped)
}

fn uniq(v: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    for x in v {
        if !out.contains(&x) {
            out.push(x);
        }
    }
    out
}

fn words_of(v: &Value) -> Vec<String> {
    v.get("words").and_then(|w| w.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

pub struct RefreshArgs<'a> {
    pub name: &'a str,
    pub cwd: &'a str,
    pub dry_run: bool,
    pub from: &'a str,
    pub exclude: &'a [String],
    pub looks: Option<&'a super::looks::Looks>,
    pub display_name: Option<&'a str>,
    pub description: Option<&'a str>,
    pub root_path: &'a str,
    pub manifest_path: &'a str,
}

/// `refreshIconSet(name, ...)`.
pub fn refresh_icon_set(a: &RefreshArgs) -> Result<Value, IconError> {
    let name = a.name;
    let local = wr::find_local_icon_set(a.cwd, Some(name))?;
    let set = &local.set;
    let package_dir = local.package_dir.clone();
    let set_icons: Vec<Value> = set.data.get("icons").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let set_module = s(&set.data, "module");
    let current = set.data.get("default").and_then(|d| d.get("variant")).and_then(|v| v.as_str()).map(String::from);
    let source = resolve_icon_source(a.from, &local)?;
    let mut excluded: Vec<String> = uniq(set.data.get("exclude").and_then(|e| e.as_array()).map(|x| x.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()).unwrap_or_default().into_iter().chain(a.exclude.iter().cloned()));
    excluded.sort_by(|x, y| crate::discovery::jsort::cmp_utf16(x, y));
    let has_adapter = set.data.get("adapter").is_some_and(|x| x.is_object());
    let every = library::collect_library_icons(&source.file, has_adapter, &excluded);
    let lib_positions = look_positions(&every.iter().map(|i| i.id.clone()).collect::<Vec<_>>());
    let sm = source.module.clone();
    let lp = lib_positions.clone();
    // drawnLooks(set, packageDir, () => positions, {module}): only icons
    // read from this library count.
    let drawn = drawn_looks_for_module(set, &package_dir, &sm, &lp);
    let (looks, moved) = super::looks::resolve_default_look(name, a.looks, current.as_deref(), set_icons.len(), drawn.as_ref(), Some((&source.module, &lib_positions)))?;
    if let Some((_, default, _)) = &looks {
        let as_extra: Vec<String> = set_icons
            .iter()
            .filter(|i| i.get("variants").and_then(|v| v.as_array()).is_some_and(|x| x.iter().any(|v| s(v, "variant") == *default)))
            .map(|i| s(i, "id"))
            .collect();
        if !as_extra.is_empty() {
            return Err(ierr(
                format!(
                    "\"{default}\" can't be the default variant: {} icons list it as another look ({}{}), and each icon's own export draws the default.",
                    as_extra.len(),
                    as_extra.iter().take(8).cloned().collect::<Vec<_>>().join(", "),
                    if as_extra.len() > 8 { ", …" } else { "" }
                ),
                vec![],
                "ERR_INVALID_ARGUMENT",
            ));
        }
    }
    let generated_before = generated_module_path(set, &package_dir);
    let origins = gen::generated_origins(&package_dir, &generated_before);
    let every_exports: Vec<String> = every.iter().map(|i| i.export.clone()).collect();
    let pr_moves = package_root_moves(&origins, &source.module, &source.file, &every_exports, &local);
    let (root_moves, skipped_moves) = claim_root_moves(&set_icons, &set_module, &origins, &source.module, &pr_moves);
    let root_move = |e: &str| root_moves.iter().find(|(n, _, _)| n == e).cloned();
    let library_export_of = |e: &str| -> Option<String> { root_move(e).map(|m| m.1).or_else(|| origins.iter().find(|(n, _, _)| n == e).map(|(_, _, src)| src.clone())) };
    let supplied_here = |icon: &Value| -> bool {
        let im = icon.get("module").and_then(|v| v.as_str()).map(String::from).unwrap_or_else(|| set_module.clone());
        if im != set_module {
            return false;
        }
        let ex = s(icon, "export");
        if root_move(&ex).is_some() {
            return true;
        }
        origins.iter().find(|(n, _, _)| *n == ex).is_some_and(|(_, m, _)| gen::same_icon_module(m, &source.module))
    };
    // Indexes into set_icons stand for identity.
    let supplied: Vec<usize> = (0..set_icons.len()).filter(|&i| supplied_here(&set_icons[i])).collect();
    let others: Vec<usize> = (0..set_icons.len()).filter(|&i| !supplied_here(&set_icons[i])).collect();
    let moving: Vec<usize> = supplied.iter().cloned().filter(|&i| root_move(&s(&set_icons[i], "export")).is_some()).collect();
    let last_by = |f: &dyn Fn(usize) -> Option<String>, key: &str| -> Option<usize> { supplied.iter().rev().cloned().find(|&i| f(i).as_deref() == Some(key)) };
    let by_id = |k: &str| last_by(&|i| Some(s(&set_icons[i], "id")), k);
    let by_export = |k: &str| last_by(&|i| Some(s(&set_icons[i], "export")), k);
    let by_source = |k: &str| last_by(&|i| library_export_of(&s(&set_icons[i], "export")), k);
    let preferred = looks.as_ref().map(|l| l.1.clone()).or(current.clone());
    let (looks_of, _, _) = library::library_looks(every.clone(), &preferred.iter().cloned().collect::<Vec<_>>());
    let icon_by_export = |e: &str| every.iter().rev().find(|i| i.export == e).cloned();
    let mut repicked: Vec<String> = vec![];
    let mut repicked_by: Vec<(String, usize)> = vec![];
    let mut found: Vec<LibraryIcon> = vec![];
    for icon in &looks_of {
        let wrapped: Vec<String> = icon.looks.clone().unwrap_or_default().into_iter().filter(|l| by_source(l).is_some()).collect();
        if wrapped.is_empty() {
            found.push(icon.clone());
            continue;
        }
        for look in wrapped {
            let prior = by_source(&look).unwrap();
            let same_glyph = moving.contains(&prior) || s(&set_icons[prior], "id") == icon.id;
            if moved && same_glyph && by_source(&icon.export).is_none() {
                repicked.push(s(&set_icons[prior], "export"));
                repicked_by.push((icon.export.clone(), prior));
                found.push(icon.clone());
                continue;
            }
            let own = icon_by_export(&look).unwrap();
            if s(&set_icons[prior], "id") == icon.id {
                found.push(LibraryIcon { id: icon.id.clone(), name: icon.name.clone(), ..own });
            } else {
                found.push(own);
            }
        }
    }
    let resolved_prior = |g: &LibraryIcon| -> Option<usize> { repicked_by.iter().rev().find(|(e, _)| *e == g.export).map(|(_, p)| *p).or_else(|| by_source(&g.export)) };
    let resolved: Vec<usize> = found.iter().filter_map(resolved_prior).collect();
    let taken_ids: Vec<String> = others.iter().map(|&i| s(&set_icons[i], "id")).collect();
    let taken_exports: Vec<String> = others.iter().map(|&i| s(&set_icons[i], "export")).collect();
    let mut shadowed: Vec<String> = vec![];
    let mut renames: Vec<(String, String)> = vec![];
    let mut public_name: Vec<(String, String)> = vec![];
    let mut from_library: Vec<Value> = vec![];
    for icon in &found {
        let by_origin = resolved_prior(icon);
        let by_name = if by_origin.is_some() { None } else { by_export(&icon.name).or_else(|| by_id(&icon.id)) };
        let prior = by_origin.or(match by_name {
            Some(b) if resolved.contains(&b) => None,
            other => other,
        });
        let pname = prior.map(|p| s(&set_icons[p], "export")).unwrap_or_else(|| icon.name.clone());
        if prior.is_none() && (by_name.is_some() || taken_ids.contains(&icon.id) || taken_exports.contains(&pname)) {
            shadowed.push(icon.id.clone());
            continue;
        }
        if let Some(slot) = public_name.iter_mut().find(|(e, _)| *e == icon.export) {
            slot.1 = pname.clone();
        } else {
            public_name.push((icon.export.clone(), pname.clone()));
        }
        if let (Some(p), Some(_)) = (prior, by_origin) {
            if !derived_id(&s(&set_icons[p], "id"), icon) {
                let mut o = set_icons[p].as_object().cloned().unwrap_or_default();
                let w = uniq(words_of(&set_icons[p]).into_iter().chain(icon.aliases.iter().cloned()));
                o.insert("words".into(), Value::Array(w.into_iter().map(Value::String).collect()));
                from_library.push(Value::Object(o));
                continue;
            }
        }
        let prior_id = prior.map(|p| s(&set_icons[p], "id"));
        if let Some(pid) = &prior_id {
            if *pid != icon.id {
                renames.push((pid.clone(), icon.id.clone()));
            }
        }
        let old_id_words: Vec<String> = match &prior_id {
            Some(pid) if *pid != icon.id => super::authoring::id_words_pub(pid),
            _ => vec![],
        };
        let mut o = prior.map(|p| set_icons[p].as_object().cloned().unwrap_or_default()).unwrap_or_default();
        let w = uniq(
            super::authoring::id_words_pub(&icon.id)
                .into_iter()
                .chain(icon.aliases.iter().cloned())
                .chain(prior.map(|p| words_of(&set_icons[p])).unwrap_or_default().into_iter().filter(|x| !old_id_words.contains(x))),
        );
        o.insert("id".into(), Value::String(icon.id.clone()));
        o.insert("export".into(), Value::String(pname));
        o.insert("words".into(), Value::Array(w.into_iter().map(Value::String).collect()));
        from_library.push(Value::Object(o));
    }
    let mut icons: Vec<Value> = from_library.clone();
    icons.extend(others.iter().map(|&i| set_icons[i].clone()));
    let mut moved_icons: Vec<(String, String, String)> = vec![];
    let mut moved_variants: Vec<GeneratedIcon> = vec![];
    for icon in &from_library {
        let vmoves: Vec<Value> = icon.get("variants").and_then(|v| v.as_array()).cloned().unwrap_or_default().into_iter().filter(|v| root_move(&s(v, "export")).is_some()).collect();
        for v in &vmoves {
            let mv = root_move(&s(v, "export")).unwrap();
            moved_variants.push(GeneratedIcon { name: s(v, "export"), from: source.module.clone(), source: mv.1.clone(), adapt: icon_by_export(&mv.1).map(|i| i.adapt).unwrap_or(false) });
        }
        let from = root_move(&s(icon, "export")).or_else(|| vmoves.first().and_then(|v| root_move(&s(v, "export")))).map(|m| m.2);
        if let Some(f) = from {
            moved_icons.push((s(icon, "id"), f, source.module.clone()));
        }
    }
    moved_icons.sort_by(|x, y| x.0.cmp(&y.0));
    let kept_exports: Vec<String> = from_library.iter().map(|i| s(i, "export")).collect();
    let gone: Vec<usize> = supplied.iter().cloned().filter(|&i| !kept_exports.contains(&s(&set_icons[i], "export"))).collect();
    let is_excluded = |i: usize| -> bool {
        let ex = s(&set_icons[i], "export");
        excluded.contains(&library_export_of(&ex).unwrap_or_default()) || excluded.contains(&ex)
    };
    let gone_excluded: Vec<usize> = gone.iter().cloned().filter(|&i| is_excluded(i)).collect();
    let gone_missing: Vec<usize> = gone.iter().cloned().filter(|&i| !is_excluded(i)).collect();
    let excluded_ids: Vec<String> = gone_excluded.iter().map(|&i| s(&set_icons[i], "id")).collect();
    let ids: Vec<String> = icons.iter().map(|i| s(i, "id")).collect();
    let mut kept = Map::new();
    let mut lost_excluded: Vec<String> = vec![];
    let mut lost_missing: Vec<String> = vec![];
    for (definition, idv) in set.data.get("map").and_then(|m| m.as_object()).cloned().unwrap_or_default() {
        let id = idv.as_str().unwrap_or("").to_string();
        let now = renames.iter().rev().find(|(f, _)| *f == id).map(|(_, t)| t.clone()).unwrap_or_else(|| id.clone());
        if ids.contains(&now) {
            kept.insert(definition, Value::String(now));
        } else if excluded_ids.contains(&id) {
            lost_excluded.push(format!("{definition} -> \"{id}\""));
        } else {
            lost_missing.push(format!("{definition} -> \"{id}\""));
        }
    }
    let generated = generated_module_path(set, &package_dir);
    let lib = library::library_source(&source.module, &package_dir);
    let map = super::authoring::exact_definition_map_with(&icons, &kept);
    let suggestions = super::authoring::definition_suggestions_pub(&icons, &map);
    let mut next = set.data.as_object().cloned().unwrap_or_default();
    if let Some(l) = &lib {
        let mut src = Map::new();
        src.insert("package".into(), Value::String(l.package.clone()));
        src.insert("version".into(), Value::String(l.version.clone()));
        next.insert("source".into(), Value::Object(src));
    }
    if !excluded.is_empty() {
        next.insert("exclude".into(), Value::Array(excluded.iter().cloned().map(Value::String).collect()));
    }
    next.insert("generated".into(), Value::String(generated.clone()));
    if let Some((variants, default, _)) = &looks {
        next.insert("variants".into(), Value::Array(variants.iter().cloned().map(Value::String).collect()));
        let mut d = Map::new();
        d.insert("variant".into(), Value::String(default.clone()));
        next.insert("default".into(), Value::Object(d));
    }
    if set.data.get("themeMap").is_none_or(|t| t.is_null() || t.as_str() == Some("")) {
        next.insert("themeMap".into(), Value::String(crate::discovery::icon_set_writer::THEME_MAP_NAME.into()));
    }
    next.insert("map".into(), Value::Object(map.clone()));
    next.insert("icons".into(), Value::Array(icons.clone()));
    let next = Value::Object(next);
    let mut files: Vec<String> = vec![];
    let data_changed = wr::icon_set_data_text(&next) != std::fs::read_to_string(&set.data_path).unwrap_or_default();
    let doc_file = np::join2(&set.dir, &format!("{}.doc.mjs", set.name));
    let doc_before = std::fs::read_to_string(&doc_file).unwrap_or_default();
    let mut doc_after = super::authoring::described_doc_pub(&doc_before, a.display_name, a.description);
    let mut license_note: Option<String> = None;
    if let Some(license) = lib.as_ref().and_then(|l| l.license.clone()) {
        if set.data.get("source").is_none() {
            let re = regress::Regex::with_flags(r#"^(\s*license:\s*)(['"`])((?:\\.|(?!\2).)*)\2,?$"#, "mu").unwrap();
            let cur = re.find(&doc_before).map(|m| doc_before[m.group(3).unwrap()].to_string());
            let package_license = local.pkg.get("license").and_then(|v| v.as_str()).filter(|l| !l.trim().is_empty()).unwrap_or("UNLICENSED").to_string();
            let doc_rel = np::relative(&package_dir, &doc_file);
            let lp = &lib.as_ref().unwrap().package;
            if cur.as_deref() == Some(license.as_str()) {
            } else if cur.is_none() || cur.as_deref() == Some(package_license.as_str()) {
                if let Some(m) = re.find(&doc_after) {
                    let lead = doc_after[m.group(1).unwrap()].to_string();
                    doc_after = format!("{}{lead}{},{}", &doc_after[..m.start()], super::authoring::quote_js(&license), &doc_after[m.end()..]);
                }
                license_note = Some(format!(
                    "The set's license in {doc_rel} changed from \"{}\" to \"{license}\", the license of {lp}, whose artwork it now wraps. Edit it if the artwork's license differs.",
                    cur.clone().unwrap_or_else(|| "(none)".into())
                ));
            } else {
                license_note = Some(format!("The set's license in {doc_rel} stays \"{}\", which you set; {lp} is licensed \"{license}\". Change it if the artwork is the library's.", cur.unwrap()));
            }
        }
    }
    if doc_after != doc_before {
        files.push(np::relative(&package_dir, &doc_file));
    }
    let notices: Vec<(String, String)> = lib.as_ref().map(|l| l.notices.iter().map(|n| (n.clone(), np::join2(&set.dir, n))).filter(|(_, t)| !np::exists(t)).collect()).unwrap_or_default();
    for (_, t) in &notices {
        files.push(np::relative(&package_dir, t));
    }
    if !a.dry_run {
        let mut rewritten: Vec<GeneratedIcon> = found
            .iter()
            .filter(|i| public_name.iter().any(|(e, _)| *e == i.export))
            .map(|i| GeneratedIcon {
                name: public_name.iter().find(|(e, _)| *e == i.export).map(|(_, n)| n.clone()).unwrap_or_else(|| i.name.clone()),
                from: source.module.clone(),
                source: i.export.clone(),
                adapt: i.adapt,
            })
            .collect();
        rewritten.extend(moved_variants.iter().cloned());
        let rewritten_names: Vec<String> = rewritten.iter().map(|i| i.name.clone()).collect();
        let mut remove: Vec<String> = gone.iter().map(|&i| s(&set_icons[i], "export")).collect();
        remove.extend(repicked.iter().cloned());
        remove.extend(root_moves.iter().map(|(n, _, _)| n.clone()).filter(|n| rewritten_names.contains(n)));
        let written = wr::all_or_nothing(|| {
            let w = gen::write_generated_icons(&package_dir, &generated, &next, &rewritten, &remove)?;
            wr::write_icon_set_data(set, &next, &[])?;
            for (notice, target) in &notices {
                wr::journal_file(target);
                let bytes = std::fs::read(np::join2(&lib.as_ref().unwrap().dir, notice)).unwrap_or_default();
                std::fs::write(target, bytes).map_err(|e| ierr(format!("Could not write {notice}: {e}"), vec![], "ERR_WRITE_FAILED"))?;
            }
            if doc_after != doc_before {
                wr::journal_file(&doc_file);
                std::fs::write(&doc_file, &doc_after).map_err(|e| ierr(format!("Could not write {}: {e}", np::basename(&doc_file)), vec![], "ERR_WRITE_FAILED"))?;
            }
            Ok(w)
        })?;
        files.extend(written);
    }
    if data_changed {
        files.push(np::relative(&package_dir, &set.data_path));
    }
    let r = crate::commands::integration::add_helpers::receipt("icon-set", name, Some((a.root_path.to_string(), false)), a.manifest_path, &files, a.dry_run);
    let mut d = r.get("data").and_then(|v| v.as_object()).cloned().unwrap_or_default();
    d.insert("icons".into(), Value::from(icons.len()));
    d.insert("refreshed".into(), Value::Bool(true));
    let by_name: Vec<(String, Value)> = map
        .iter()
        .filter(|(def, id)| !kept.contains_key(*def) || id.as_str() == Some(super::authoring::definition_id_pub(def).as_str()))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    d.insert(
        "mapped".into(),
        Value::Array(
            by_name
                .iter()
                .map(|(k, v)| {
                    let mut m = Map::new();
                    m.insert("definition".into(), Value::String(k.clone()));
                    m.insert("icon".into(), v.clone());
                    Value::Object(m)
                })
                .collect(),
        ),
    );
    d.insert(
        "suggestions".into(),
        Value::Array(
            suggestions
                .iter()
                .map(|(def, icon, word)| {
                    let mut m = Map::new();
                    m.insert("definition".into(), Value::String(def.clone()));
                    m.insert("icon".into(), Value::String(icon.clone()));
                    m.insert("word".into(), Value::String(word.clone()));
                    Value::Object(m)
                })
                .collect(),
        ),
    );
    if !renames.is_empty() {
        d.insert(
            "renamed".into(),
            Value::Array(
                renames
                    .iter()
                    .map(|(f, t)| {
                        let mut m = Map::new();
                        m.insert("from".into(), Value::String(f.clone()));
                        m.insert("to".into(), Value::String(t.clone()));
                        Value::Object(m)
                    })
                    .collect(),
            ),
        );
    }
    if !moved_icons.is_empty() {
        d.insert(
            "moved".into(),
            Value::Array(
                moved_icons
                    .iter()
                    .map(|(id, f, t)| {
                        let mut m = Map::new();
                        m.insert("id".into(), Value::String(id.clone()));
                        m.insert("from".into(), Value::String(f.clone()));
                        m.insert("to".into(), Value::String(t.clone()));
                        Value::Object(m)
                    })
                    .collect(),
            ),
        );
    }
    let set_dir_rel = np::relative(&package_dir, &set.dir);
    let missing_notice = if crate::discovery::icon_set_discovery::has_license_notice(&set.dir) {
        None
    } else {
        lib.as_ref().filter(|l| l.notices.is_empty() && !crate::discovery::icon_set_discovery::has_license_notice(&package_dir)).map(|l| {
            let named = format!("{}@{}", l.package, l.version);
            (format!("{named} ships no LICENSE or NOTICE file to copy, so the set has no license notice. {}", crate::discovery::icon_set_discovery::license_notice_fix(&set_dir_rel, &named)), named)
        })
    };
    if let Some((_, named)) = &missing_notice {
        let mut m = Map::new();
        m.insert("library".into(), Value::String(named.clone()));
        m.insert("path".into(), Value::String(format!("{set_dir_rel}/NOTICE")));
        d.insert("licenseNoticeMissing".into(), Value::Object(m));
    }
    let mut notes: Vec<String> = vec![];
    notes.extend(license_note);
    if let Some((n, _)) = &missing_notice {
        notes.push(n.clone());
    }
    if !renames.is_empty() {
        notes.push(format!(
            "{} icons have a new id under this release's id rule, and keep their map entries, variants, and words: {}.",
            renames.len(),
            renames.iter().map(|(f, t)| format!("{f} -> {t}")).collect::<Vec<_>>().join(", ")
        ));
    }
    if !moved_icons.is_empty() {
        notes.push(format!(
            "{} icons now import from {} instead of one file each, and keep their ids, exports, map entries, variants, and words: {}.",
            moved_icons.len(),
            source.module,
            moved_icons.iter().map(|m| m.0.clone()).collect::<Vec<_>>().join(", ")
        ));
    }
    if !by_name.is_empty() {
        notes.push(format!("{} icon definitions were mapped because an icon has their exact name (listed under Mapped by name). A library can draw another meaning under the same name, such as a backspace key named delete: check each, and remap with `astryx experimental icon map <definition> <icon> --set {name}`.", by_name.len()));
    }
    if !suggestions.is_empty() {
        let defs = uniq(suggestions.iter().map(|x| x.0.clone()));
        notes.push(format!("{} unmapped icon definitions have possible icons (listed under Suggestions; nothing was written for them). Check each meaning, then map the ones that fit: `astryx experimental icon map <definition> <icon> --set {name}`.", defs.len()));
    }
    if !gone_missing.is_empty() {
        notes.push(format!(
            "{} icons the library no longer exports were removed from the set: {}.",
            gone_missing.len(),
            gone_missing.iter().map(|&i| s(&set_icons[i], "id")).collect::<Vec<_>>().join(", ")
        ));
    }
    if !lost_missing.is_empty() {
        notes.push(format!("These map entries named those icons and were removed: {}.", lost_missing.join(", ")));
    }
    if !gone_excluded.is_empty() {
        notes.push(format!("Left out by --exclude, and removed from the set: {}.", gone_excluded.iter().map(|&i| s(&set_icons[i], "id")).collect::<Vec<_>>().join(", ")));
    }
    if !lost_excluded.is_empty() {
        notes.push(format!("These map entries named icons --exclude left out and were removed: {}.", lost_excluded.join(", ")));
    }
    if !shadowed.is_empty() {
        notes.push(format!("Left out {} library icons whose id or name an icon of the set already has: {}.", shadowed.len(), shadowed.join(", ")));
    }
    if !skipped_moves.is_empty() {
        notes.push(format!(
            "{} icons stay on their own file, because another icon of the set already reads the same export of {}: {}.",
            skipped_moves.len(),
            source.module,
            skipped_moves.join(", ")
        ));
    }
    let all_mapped = crate::discovery::icon_definition_discovery::astryx_icon_definitions().definitions.iter().all(|x| map.get(x.name()).is_some_and(|v| v.as_str().is_some_and(|s| !s.is_empty())));
    notes.push(if all_mapped { "Every Astryx icon definition is mapped.".into() } else { "Run `astryx integration check` to see the icon definitions still to map.".into() });
    d.insert("notes".into(), Value::Array(notes.into_iter().map(Value::String).collect()));
    let _ = shell_arg;
    let _ = add::split_look;
    Ok(Value::Object(d))
}

/// `drawnLooks(set, packageDir, () => positions, {module})`.
fn drawn_looks_for_module(set: &crate::discovery::icon_set_discovery::DiscoveredIconSet, package_dir: &str, module: &str, positions: &add::Positions) -> Option<add::Drawn> {
    // Restrict to icons read from `module` by filtering a copy of the set.
    let generated = generated_module_path(set, package_dir);
    let origins = gen::generated_origins(package_dir, &generated);
    let mut copy = set.clone();
    if let Some(icons) = copy.data.get_mut("icons").and_then(|v| v.as_array_mut()) {
        icons.retain(|i| origins.iter().find(|(n, _, _)| *n == s(i, "export")).is_some_and(|(_, m, _)| gen::same_icon_module(m, module)));
    }
    let p = positions.clone();
    drawn_looks(&copy, package_dir, &move |_| Some(p.clone()))
}
