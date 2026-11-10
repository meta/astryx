//! Port of `api/icon/add/add.mjs` with the naming and look helpers it uses
//! from `icon-set-writer.mjs` and `api/icon/_default-look.mjs`.

use super::api::{ierr, IconError, IconSet};
use super::generated::{self as gen, GeneratedIcon};
use super::writer::{self as wr, LocalSet};
use crate::cli::command::Suggestion;
use crate::discovery::icon_set_discovery::DiscoveredIconSet;
use crate::discovery::module_origins as mo;
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};

// ---- naming ----

fn screaming(name: &str) -> bool {
    let mut cs = name.chars();
    cs.next().is_some_and(|c| c.is_ascii_uppercase()) && name.len() >= 2 && cs.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
}

#[derive(Debug, Clone)]
pub struct Candidate {
    pub name: String,
    pub adapt: bool,
    pub scalar: Option<&'static str>,
}

/// `iconCandidates(file, {adapter, exclude})`.
pub fn icon_candidates(file: &str, adapter: bool, exclude: &[String]) -> Vec<Candidate> {
    let mut out = vec![];
    for name in mo::followed_export_names(file) {
        if name == "default" || name == "Icon" || exclude.contains(&name) {
            continue;
        }
        if name.ends_with("Provider") || name.ends_with("Context") {
            continue;
        }
        if screaming(&name) {
            continue;
        }
        let kind = mo::export_value_kind(file, &name);
        let pascal = name.chars().next().is_some_and(|c| c.is_ascii_uppercase()) && name.chars().all(|c| c.is_ascii_alphanumeric());
        if kind == mo::ValueKind::Component && pascal {
            out.push(Candidate { name, adapt: false, scalar: None });
        } else if adapter && kind == mo::ValueKind::Data && name.chars().next().is_some_and(|c| c.is_ascii_alphabetic()) && name.chars().all(|c| c.is_ascii_alphanumeric()) {
            let scalar = mo::export_scalar_type(file, &name);
            if scalar == Some("number") || scalar == Some("boolean") {
                continue;
            }
            out.push(Candidate { name, adapt: true, scalar });
        }
    }
    if out.iter().any(|c| c.scalar.is_none()) {
        out.retain(|c| c.scalar.is_none());
    }
    out
}

/// `libraryPrefix(names)`.
pub fn library_prefix(names: &[String]) -> Vec<String> {
    if names.len() < 2 {
        return vec![];
    }
    let split: Vec<Vec<String>> = names.iter().map(|n| wr::icon_id_of(n).split('-').map(String::from).collect()).collect();
    let mut prefix = vec![];
    let mut index = 0;
    loop {
        let Some(word) = split[0].get(index) else { break };
        if !split.iter().all(|w| w.get(index) == Some(word) && w.len() > index + 1) {
            break;
        }
        prefix.push(word.clone());
        index += 1;
    }
    prefix
}

fn cap(w: &str) -> String {
    let mut cs = w.chars();
    match cs.next() {
        Some(f) => format!("{}{}", f.to_uppercase(), cs.as_str()),
        None => String::new(),
    }
}

#[derive(Debug, Clone)]
pub struct Naming {
    pub id: String,
    pub name: String,
}

/// `iconNaming(name, prefix)`.
pub fn icon_naming(name: &str, prefix: &[String]) -> Naming {
    let all: Vec<String> = wr::icon_id_of(name).split('-').map(String::from).collect();
    let strip = all.len() > prefix.len() && prefix.iter().enumerate().all(|(i, w)| all[i] == *w);
    let prefix: &[String] = if strip { prefix } else { &[] };
    let words = &all[prefix.len()..];
    let id = words.join("-");
    let pascal: String = words.iter().map(|w| cap(w)).collect();
    Naming { id, name: if !prefix.is_empty() { wr::icon_export_name(&pascal) } else { wr::icon_export_name(name) } }
}

pub type Positions = Vec<Vec<String>>;

const LOOK_STYLE_WORDS: [&str; 22] = [
    "default", "regular", "outline", "outlined", "line", "linear", "stroke", "filled", "fill", "solid", "bold", "light", "thin", "duotone", "twotone",
    "mini", "micro", "sharp", "round", "rounded", "bulk", "broken",
];
const DIRECTION_WORDS: [&str; 12] = ["up", "down", "left", "right", "top", "bottom", "start", "end", "north", "south", "east", "west"];

fn numbered(w: &str) -> bool {
    let t = w.trim_start_matches(|c: char| c.is_ascii_lowercase());
    !t.is_empty() && t.chars().all(|c| c.is_ascii_digit())
}

fn names_look(words: &[String]) -> bool {
    if words.iter().any(|w| DIRECTION_WORDS.contains(&w.as_str())) {
        return false;
    }
    words.iter().all(|w| numbered(w)) || words.iter().any(|w| LOOK_STYLE_WORDS.contains(&w.as_str()))
}

/// `splitLook(words, positions)`.
pub fn split_look(words: &[String], positions: &Positions) -> (Vec<String>, Vec<Option<String>>) {
    let mut end = words.len();
    let mut look: Vec<Option<String>> = positions.iter().map(|_| None).collect();
    for (index, position) in positions.iter().enumerate() {
        if end < 2 {
            break;
        }
        let last = &words[end - 1];
        if !position.contains(last) {
            break;
        }
        look[index] = Some(last.clone());
        end -= 1;
    }
    (words[..end].to_vec(), look)
}

/// `lookPositions(ids)`.
pub fn look_positions(ids: &[String]) -> Positions {
    if ids.len() < 20 {
        return vec![];
    }
    let mut positions: Positions = vec![];
    let least = 2usize.max((ids.len() as f64 * 0.05).ceil() as usize);
    while positions.len() < 4 {
        let mut counts: Vec<(String, usize)> = vec![];
        for id in ids {
            let words: Vec<String> = id.split('-').map(String::from).collect();
            let (base, _) = split_look(&words, &positions);
            if base.len() < 2 || base.len() + positions.len() < words.len() {
                continue;
            }
            let last = base.last().unwrap().clone();
            match counts.iter_mut().find(|(w, _)| *w == last) {
                Some(c) => c.1 += 1,
                None => counts.push((last, 1)),
            }
        }
        let values: Vec<(String, usize)> = counts.into_iter().filter(|(_, c)| *c >= least).collect();
        if values.is_empty() || values.len() > 12 {
            break;
        }
        let covered: usize = values.iter().map(|(_, c)| c).sum();
        if (covered as f64) < ids.len() as f64 * 0.9 {
            break;
        }
        let words: Vec<String> = values.iter().map(|(w, _)| w.clone()).collect();
        if !names_look(&words) {
            break;
        }
        positions.push(words);
    }
    positions
}

/// `iconNamingWithoutLook(name, {prefix, positions})`.
pub fn icon_naming_without_look(name: &str, prefix: &[String], positions: &Positions) -> Naming {
    let named = icon_naming(name, prefix);
    let words: Vec<String> = named.id.split('-').map(String::from).collect();
    let (base, _) = split_look(&words, positions);
    if base.len() == words.len() {
        return named;
    }
    let pascal: String = base.iter().map(|w| cap(w)).collect();
    Naming { id: base.join("-"), name: wr::icon_export_name(&pascal) }
}

/// `moduleNaming(file, {adapter, module})`: the library's shared prefix and
/// look positions.
pub fn module_naming(file: &str, adapter: bool) -> (Vec<String>, Positions) {
    let candidates = icon_candidates(file, adapter, &[]);
    let names: Vec<String> = candidates.iter().map(|c| c.name.clone()).collect();
    let prefix = library_prefix(&names);
    let ids: Vec<String> = names.iter().map(|n| icon_naming(n, &prefix).id).collect();
    (prefix, look_positions(&ids))
}

/// `variantExportName(iconName, variant)`.
pub fn variant_export_name(icon_name: &str, variant: &str) -> String {
    let base = icon_name.strip_suffix("Icon").unwrap_or(icon_name);
    let name: String = variant.split('-').map(cap).collect();
    format!("{base}{name}Icon")
}

fn name_from_id(id: &str) -> String {
    wr::icon_export_name(&id.split('-').map(cap).collect::<String>())
}

// ---- looks (_default-look.mjs) ----

pub fn js_sorted(v: &[String]) -> Vec<String> {
    let mut v = v.to_vec();
    v.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(a, b));
    v
}

pub fn described_looks(positions: &[Vec<String>]) -> String {
    positions
        .iter()
        .rev()
        .map(|w| {
            if w.len() > 3 {
                format!("{} to {}", w[0], w.last().unwrap())
            } else {
                w.join(if w.len() == 2 { " or " } else { ", " })
            }
        })
        .collect::<Vec<_>>()
        .join("; ")
}

pub fn style_words(positions: &Positions) -> Vec<String> {
    let sorted: Vec<Vec<String>> = positions.iter().map(|p| js_sorted(p)).collect();
    sorted.into_iter().filter(|w| w.iter().any(|x| !numbered(x))).rev().flatten().collect()
}

pub fn drawn_word(positions: &Positions, words: &[Option<String>], among: &[String]) -> Option<String> {
    for i in (0..positions.len()).rev() {
        if let Some(Some(w)) = words.get(i) {
            if among.contains(w) {
                return Some(w.clone());
            }
        }
    }
    for i in (0..positions.len()).rev() {
        if let Some(Some(w)) = words.get(i) {
            if positions[i].iter().any(|x| !numbered(x)) {
                return Some(w.clone());
            }
        }
    }
    None
}

pub struct Drawn {
    pub positions: Positions,
    pub words: Vec<Option<String>>,
}

fn set_module(set: &DiscoveredIconSet) -> String {
    set.data.get("module").and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn icons_of(set: &DiscoveredIconSet) -> Vec<Value> {
    set.data.get("icons").and_then(|v| v.as_array()).cloned().unwrap_or_default()
}

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("")
}

/// `drawnLooks(set, packageDir, positionsOf)`.
pub fn drawn_looks(set: &DiscoveredIconSet, package_dir: &str, positions_of: &dyn Fn(&str) -> Option<Positions>) -> Option<Drawn> {
    let generated = generated_module_path(set, package_dir);
    let origins = gen::generated_origins(package_dir, &generated);
    let module = set_module(set);
    let mut by_module: Vec<(String, Vec<String>)> = vec![];
    for icon in icons_of(set) {
        let im = icon.get("module").and_then(|v| v.as_str()).map(String::from).unwrap_or_else(|| module.clone());
        if im != module {
            continue;
        }
        let Some((_, om, os)) = origins.iter().find(|(n, _, _)| n == s(&icon, "export")) else { continue };
        if os == "default" {
            continue;
        }
        match by_module.iter_mut().find(|(m, _)| m == om) {
            Some((_, v)) => v.push(os.clone()),
            None => by_module.push((om.clone(), vec![os.clone()])),
        }
    }
    by_module.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then_with(|| crate::discovery::jsort::cmp_utf16(&a.0, &b.0)));
    if by_module.is_empty() {
        return None;
    }
    for (m, sources) in &by_module {
        let positions = positions_of(m).unwrap_or_default();
        if positions.is_empty() {
            continue;
        }
        let mut counts: Vec<Vec<(String, usize)>> = positions.iter().map(|_| vec![]).collect();
        for src in sources {
            let words: Vec<String> = wr::icon_id_of(src).split('-').map(String::from).collect();
            let (_, look) = split_look(&words, &positions);
            for (i, w) in look.iter().enumerate() {
                if let Some(w) = w {
                    match counts[i].iter_mut().find(|(x, _)| x == w) {
                        Some(c) => c.1 += 1,
                        None => counts[i].push((w.clone(), 1)),
                    }
                }
            }
        }
        let words = counts
            .into_iter()
            .map(|mut c| {
                c.sort_by(|a, b| if a.0 < b.0 { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater });
                let mut best = None;
                let mut most = 0;
                for (w, n) in c {
                    if n > most {
                        best = Some(w);
                        most = n;
                    }
                }
                best
            })
            .collect();
        return Some(Drawn { positions, words });
    }
    Some(Drawn { positions: vec![], words: vec![] })
}

fn default_variant(set: &DiscoveredIconSet) -> Option<String> {
    set.data.get("default").and_then(|d| d.get("variant")).and_then(|v| v.as_str()).map(String::from)
}

fn declared_variants(set: &DiscoveredIconSet) -> Vec<String> {
    set.data.get("variants").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

fn kept_default(set: &DiscoveredIconSet, drawn: Option<&Drawn>) -> Option<String> {
    if let Some(c) = default_variant(set) {
        if !c.is_empty() {
            return Some(c);
        }
    }
    let d = drawn?;
    if d.positions.is_empty() {
        return None;
    }
    drawn_word(&d.positions, &d.words, &declared_variants(set))
}

fn declare_variant_suggestion(set: &DiscoveredIconSet, variant: &str, drawn: Option<&Drawn>) -> Suggestion {
    let kept = kept_default(set, drawn).unwrap_or_else(|| "<default>".into());
    let declared = declared_variants(set);
    let mut variants: Vec<String> = vec![];
    let mut push = |v: String| {
        if !variants.contains(&v) {
            variants.push(v);
        }
    };
    if !declared.contains(&kept) {
        push(kept.clone());
    }
    for d in &declared {
        push(d.clone());
    }
    push(variant.to_string());
    Suggestion::new(
        format!("astryx experimental icon new-set {} --variants {} --default-variant {kept}", set.name, variants.join(",")),
        if kept == "<default>" { "declare the variants; fill <default> with the look the icons draw" } else { "declare the variants" },
    )
}

/// `checkVariantLook({set, variant, module, positions, drawn})`.
pub fn check_variant_look(set: &DiscoveredIconSet, variant: &str, module: &str, positions: &Positions, drawn: Option<&Drawn>) -> Result<(), IconError> {
    if !positions.is_empty() && !positions.iter().any(|p| p.iter().any(|w| w == variant)) {
        let sorted: Vec<Vec<String>> = positions.iter().map(|p| js_sorted(p)).collect();
        return Err(ierr(
            format!("\"{variant}\" is no look of {module}: its exports name their looks with {}. Name one of these words, so each icon's export draws that look.", described_looks(&sorted)),
            style_words(positions).into_iter().map(|w| Suggestion::new(format!("--variant {w}"), format!("a look {module} names"))).collect(),
            "ERR_INVALID_ARGUMENT",
        ));
    }
    let drawn_here = drawn.and_then(|d| {
        let i = d.positions.iter().position(|p| p.iter().any(|w| w == variant))?;
        d.words.get(i).cloned().flatten()
    });
    let dv = default_variant(set);
    if dv.as_deref() == Some(variant) || drawn_here.as_deref() == Some(variant) {
        return Err(ierr(
            format!(
                "\"{variant}\" is the look each icon's own export in \"{}\" already draws{}, so a variant of it would export the same artwork twice.",
                set.name,
                if dv.as_deref() == Some(variant) { " (its default variant)" } else { "" }
            ),
            vec![],
            "ERR_INVALID_ARGUMENT",
        ));
    }
    let declared = declared_variants(set);
    if !declared.iter().any(|d| d == variant) {
        return Err(ierr(
            format!(
                "Icon set \"{}\" declares no variant \"{variant}\"{}. Declare it first{}.",
                set.name,
                if declared.is_empty() { String::new() } else { format!(" (it declares {})", declared.join(", ")) },
                if kept_default(set, drawn).is_none() { ", and name the look its icons draw now as the default variant in place of <default>" } else { "" }
            ),
            vec![declare_variant_suggestion(set, variant, drawn)],
            "ERR_INVALID_ARGUMENT",
        ));
    }
    Ok(())
}

// ---- sources ----

pub struct Source {
    pub file: String,
    pub module: String,
}

fn resolve_file(base: &str) -> Option<String> {
    let exts = ["", ".mjs", ".js", ".cjs", ".ts", ".tsx", ".jsx", ".mts"];
    for e in exts {
        let c = format!("{base}{e}");
        if np::is_file(&c) {
            return Some(c);
        }
    }
    for e in &exts[1..] {
        let c = np::join2(base, &format!("index{e}"));
        if np::is_file(&c) {
            return Some(c);
        }
    }
    None
}

/// `resolveIconSource(from, {packageDir, pkg})`.
pub fn resolve_icon_source(from: &str, local: &LocalSet) -> Result<Source, IconError> {
    let name = local.pkg.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if from.starts_with('.') || np::is_absolute(from) {
        let target = crate::commands::swizzle::path_safety::assert_within(from, &local.package_dir, true, "icon source")
            .map_err(|e| ierr(e.message.clone(), vec![], "ERR_PATH_TRAVERSAL"))?;
        let Some(file) = resolve_file(&target) else {
            return Err(ierr(format!("\"{from}\" does not resolve to a module file in this package."), vec![], "ERR_FILE_NOT_FOUND"));
        };
        let module = format!("./{}", np::relative(&local.package_dir, &file));
        return Ok(Source { file, module });
    }
    match crate::discovery::icon_set_discovery::resolve_icon_module(from, &local.package_dir, Some(&name), Some(&local.package_dir)) {
        Some(file) => Ok(Source { file, module: from.to_string() }),
        None => Err(ierr(
            format!("\"{from}\" does not resolve from {}. Install it as a dependency, or check the specifier.", if name.is_empty() { "this package" } else { &name }),
            vec![],
            "ERR_NOT_FOUND",
        )),
    }
}

/// `assertIconExport(file, module, exportName)`.
pub fn assert_icon_export(file: &str, module: &str, export_name: &str) -> Result<(), IconError> {
    if mo::module_export_origin(file, export_name).is_some() {
        return Ok(());
    }
    let names = mo::followed_export_names(file);
    let mut picks: Vec<String> = names.iter().filter(|n| **n == format!("{export_name}Icon") || format!("{n}Icon") == export_name).cloned().collect();
    for n in wr::closest_names(export_name, &names, 5) {
        if !picks.contains(&n) {
            picks.push(n);
        }
    }
    Err(ierr(
        if export_name == "default" { format!("\"{module}\" has no default export.") } else { format!("\"{module}\" does not export \"{export_name}\".") },
        picks.into_iter().map(|n| Suggestion::new(n, format!("an export of {module}"))).collect(),
        "ERR_NOT_FOUND",
    ))
}

/// `generatedModulePath(set, packageDir)`.
pub fn generated_module_path(set: &DiscoveredIconSet, package_dir: &str) -> String {
    match set.data.get("generated").and_then(|g| g.as_str()) {
        Some(g) => g.to_string(),
        None => format!("./{}", np::relative(package_dir, &np::join2(&set.dir, &format!("{}.generated.js", set.name)))),
    }
}

/// `localSourceNote(packageDir, module)`.
fn local_source_note(package_dir: &str, module: &str) -> Option<String> {
    let rest = module.strip_prefix("./")?;
    let parts: Vec<&str> = rest.split('/').collect();
    let top = if parts.len() > 1 { parts[..parts.len() - 1].join("/") } else { parts[0].to_string() };
    if top.is_empty() {
        return None;
    }
    let pkg = np::read_json(&np::join2(package_dir, "package.json"))?;
    let files = pkg.get("files")?.as_array()?.clone();
    let norm = |v: &str| v.strip_prefix("./").unwrap_or(v).trim_end_matches('/').to_string();
    let wanted = norm(module);
    if files.iter().any(|e| e.as_str().is_some_and(|f| wanted == norm(f) || wanted.starts_with(&format!("{}/", norm(f))))) {
        return None;
    }
    let mut next = files.clone();
    next.push(Value::String(top));
    Some(format!(
        "{module} is not in package.json \"files\", so it would not be published; set \"files\" to `{}`.",
        crate::json::stringify(&Value::Array(next), 0)
    ))
}

/// `shellArg(value)`.
pub fn shell_arg(v: &str) -> String {
    if !v.is_empty() && v.chars().all(|c| c.is_ascii_alphanumeric() || "@/._-".contains(c)) {
        v.to_string()
    } else {
        format!("'{}'", v.replace('\'', "'\\''"))
    }
}

fn look_variant_of(id: &str, wrapped_id: &str, positions: &Positions, set: &DiscoveredIconSet) -> Option<String> {
    let w1: Vec<String> = id.split('-').map(String::from).collect();
    let w2: Vec<String> = wrapped_id.split('-').map(String::from).collect();
    let (_, look) = split_look(&w1, positions);
    let (_, wrapped) = split_look(&w2, positions);
    let mut word = None;
    for i in (0..look.len()).rev() {
        if look[i] != wrapped[i] {
            word = look[i].clone();
            break;
        }
    }
    let word = word?;
    if declared_variants(set).contains(&word) && default_variant(set).as_deref() != Some(word.as_str()) {
        Some(word)
    } else {
        None
    }
}

// ---- definition matches ----

#[allow(clippy::too_many_arguments)]
fn definition_matches(set: &DiscoveredIconSet, export_name: &str, from: &str, id: &str, use_default: bool, given_id: Option<&str>, look: Option<String>, glyph_id: &str) -> Value {
    let astryx: Vec<Value> = crate::discovery::icon_definition_discovery::astryx_icon_definitions().definitions.iter().map(|d| d.doc.clone()).collect();
    let astryx_names: Vec<String> = astryx.iter().map(|d| s(d, "name").to_string()).collect();
    let own: Vec<Value> = set.definitions.iter().filter(|d| !astryx_names.iter().any(|n| n == d.name())).map(|d| d.doc.clone()).collect();
    let all: Vec<(Value, &str)> = astryx.iter().map(|d| (d.clone(), "astryx")).chain(own.iter().map(|d| (d.clone(), "set"))).collect();
    let split_camel = |n: &str, sep: &str| -> String {
        let r = regress::Regex::new(r"([a-z0-9])([A-Z])").unwrap();
        let mut out = String::new();
        let mut last = 0;
        for m in r.find_iter(n) {
            out.push_str(&n[last..m.start()]);
            out.push_str(&n[m.group(1).unwrap()]);
            out.push_str(sep);
            out.push_str(&n[m.group(2).unwrap()]);
            last = m.end();
        }
        out.push_str(&n[last..]);
        out.to_lowercase()
    };
    let icons: Vec<Value> = all
        .iter()
        .map(|(d, _)| {
            let name = s(d, "name");
            let mut words: Vec<Value> = split_camel(name, " ").split(' ').map(|w| Value::String(w.to_string())).collect();
            for w in d.get("words").and_then(|x| x.as_array()).cloned().unwrap_or_default() {
                words.push(w);
            }
            let mut m = Map::new();
            m.insert("id".into(), Value::String(split_camel(name, "-")));
            m.insert("export".into(), Value::String(name.to_string()));
            m.insert("words".into(), Value::Array(words));
            Value::Object(m)
        })
        .collect();
    let mut data = Map::new();
    data.insert("module".into(), Value::String(set_module(set)));
    data.insert("icons".into(), Value::Array(icons));
    let as_set = IconSet {
        name: "definitions".into(),
        display_name: String::new(),
        description: String::new(),
        license: String::new(),
        package: set.package.clone(),
        data: Value::Object(data),
        definitions: vec![],
    };
    let defs = super::api::astryx_icon_definitions(std::path::Path::new(""));
    let mut queries = vec![id.replace('-', " ")];
    queries.extend(id.split('-').filter(|w| w.chars().any(|c| c.is_ascii_lowercase())).map(String::from));
    let mut best: Vec<(String, i64, String)> = vec![];
    for q in &queries {
        let ranked = super::ranking::rank_icons(&[&as_set], q, &defs, &|_, _| None);
        for (score, m) in super::ranking::answering(ranked) {
            let ex = m.get("export").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let reason = m.get("reason").and_then(|v| v.as_str()).unwrap_or("").to_string();
            match best.iter_mut().find(|(e, _, _)| *e == ex) {
                Some(slot) => {
                    if score > slot.1 {
                        slot.1 = score;
                        slot.2 = reason;
                    }
                }
                None => best.push((ex, score, reason)),
            }
        }
    }
    let mut base_parts = vec![format!("astryx experimental icon add {export_name} --from {}", shell_arg(from)), format!("--set {}", shell_arg(&set.name))];
    if use_default {
        base_parts.push("--default".into());
    }
    if let Some(g) = given_id {
        base_parts.push(format!("--id {}", shell_arg(g)));
    }
    let base = base_parts.join(" ");
    let mut matches: Vec<(Value, i64, &str, String)> = all
        .iter()
        .filter_map(|(d, source)| {
            let n = s(d, "name");
            let hit = best.iter().find(|(e, _, _)| e == n)?;
            let mut m = Map::new();
            m.insert("name".into(), Value::String(n.to_string()));
            m.insert("description".into(), d.get("description").cloned().unwrap_or(Value::Null));
            m.insert("source".into(), Value::String(source.to_string()));
            m.insert("score".into(), Value::from(hit.1));
            m.insert("reason".into(), Value::String(hit.2.clone()));
            m.insert("command".into(), Value::String(format!("{base} --definition {n}")));
            Some((Value::Object(m), hit.1, *source, n.to_string()))
        })
        .collect();
    matches.sort_by(|a, b| {
        b.1.cmp(&a.1)
            .then_with(|| if a.2 == b.2 { std::cmp::Ordering::Equal } else if a.2 == "astryx" { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater })
            .then_with(|| a.3.cmp(&b.3))
    });
    matches.truncate(10);
    let fits = matches.iter().any(|m| m.1 >= 80);
    let as_look = look.map(|l| {
        let mut p = vec![format!("astryx experimental icon add {export_name} --from {}", shell_arg(from)), format!("--set {}", shell_arg(&set.name))];
        if use_default {
            p.push("--default".into());
        }
        p.push(format!("--id {glyph_id} --variant {l}"));
        p.join(" ")
    });
    let camel = {
        let r = regress::Regex::new(r"-([a-z0-9])").unwrap();
        let mut out = String::new();
        let mut last = 0;
        for m in r.find_iter(id) {
            out.push_str(&id[last..m.start()]);
            out.push_str(&id[m.group(1).unwrap()].to_uppercase());
            last = m.end();
        }
        out.push_str(&id[last..]);
        out
    };
    let mut d = Map::new();
    d.insert("export".into(), Value::String(export_name.into()));
    d.insert("from".into(), Value::String(from.into()));
    d.insert("id".into(), Value::String(id.into()));
    d.insert("matches".into(), Value::Array(matches.into_iter().map(|m| m.0).collect()));
    d.insert(
        "newDefinition".into(),
        if fits {
            Value::Null
        } else {
            let n = if camel.chars().next().is_some_and(|c| c.is_ascii_lowercase()) { camel.clone() } else { format!("icon{camel}") };
            Value::String(format!("{base} --new-definition {n} --description '<what the icon is for>' --words <word>,<word>"))
        },
    );
    if let Some(v) = as_look {
        d.insert("variant".into(), Value::String(v));
    }
    let mut out = Map::new();
    out.insert("type".into(), Value::String("icon.definitionMatches".into()));
    out.insert("data".into(), Value::Object(d));
    Value::Object(out)
}

pub struct AddOptions<'a> {
    pub from: Option<&'a str>,
    pub selector: Option<&'a str>,
    pub definition: Option<&'a str>,
    pub new_definition: Option<&'a str>,
    pub description: Option<&'a str>,
    pub words: Option<Vec<String>>,
    pub use_default: bool,
    pub variant: Option<&'a str>,
    pub id: Option<&'a str>,
    pub all: bool,
}

fn passed(v: Option<&str>) -> bool {
    v.is_some_and(|s| !s.is_empty())
}

/// `iconAdd(exportName, options)`: `{type, data}`.
pub fn icon_add(cwd: &str, export_name: Option<&str>, o: &AddOptions) -> Result<Value, IconError> {
    super::api::refuse_outside_project(cwd, "experimental icon add", "the icon-set package")?;
    let new_definition = o.new_definition.map(wr::definition_name_from_input);
    super::api::refuse_ignored_pairs(
        &[
            ("an export name", passed(export_name)),
            ("--definition", passed(o.definition)),
            ("--new-definition", passed(new_definition.as_deref())),
            ("--description", passed(o.description)),
            ("--words", o.words.is_some()),
            ("--default", o.use_default),
            ("--id", passed(o.id)),
            ("--all", o.all),
        ],
        &[
            ("--all", "an export name"),
            ("--all", "--definition"),
            ("--all", "--new-definition"),
            ("--all", "--description"),
            ("--all", "--words"),
            ("--all", "--default"),
            ("--all", "--id"),
            ("--definition", "--new-definition"),
            ("--definition", "--description"),
            ("--definition", "--words"),
        ],
    )?;
    for (flag, given) in [("--description", passed(o.description)), ("--words", o.words.is_some())] {
        if given && !passed(new_definition.as_deref()) {
            return Err(ierr(
                format!("{flag} describes a new definition, so it needs --new-definition"),
                vec![Suggestion::new("--new-definition <name> --description '<what it is for>' --words a,b", "add your own definition")],
                "ERR_INVALID_OPTION",
            ));
        }
    }
    if o.all {
        // TEMP: --all (every icon's variant from a library) is not cloned yet.
        return wr::all_or_nothing(|| {
            if o.variant.is_none_or(|v| v.is_empty()) {
                return Err(ierr("--all adds one variant for every icon: pass --variant with the variant, such as solid.", vec![], "ERR_MISSING_ARGUMENT"));
            }
            if o.from.is_none_or(|f| f.trim().is_empty()) {
                return Err(ierr("Pass --from with the module that exports the variant, such as @heroicons/react/24/solid.", vec![], "ERR_MISSING_ARGUMENT"));
            }
            let local = wr::find_local_icon_set(cwd, o.selector)?;
            let source = resolve_icon_source(o.from.unwrap(), &local)?;
            let (_, positions) = module_naming(&source.file, local.set.data.get("adapter").is_some_and(|a| a.is_object()));
            let pd = local.package_dir.clone();
            let sm = source.module.clone();
            let drawn = drawn_looks(&local.set, &pd, &|m| if gen::same_icon_module(m, &sm) { Some(positions.clone()) } else { None });
            check_variant_look(&local.set, o.variant.unwrap(), &source.module, &positions, drawn.as_ref())?;
            Err(ierr("experimental icon add --all is not cloned yet", vec![], "ERR_UNKNOWN"))
        });
    }
    wr::all_or_nothing(|| add_one(cwd, export_name, o, new_definition.as_deref()))
}

fn add_one(cwd: &str, export_name: Option<&str>, o: &AddOptions, new_definition: Option<&str>) -> Result<Value, IconError> {
    let export_ok = export_name.is_some_and(|e| regress::Regex::new(r"^[$A-Z_a-z][$\w]*$").unwrap().find(e).is_some());
    if !export_ok {
        return Err(ierr(
            format!("Name the icon's export, such as TrashIcon; received \"{}\".", export_name.unwrap_or("undefined")),
            vec![],
            "ERR_INVALID_ARGUMENT",
        ));
    }
    let export_name = export_name.unwrap();
    let Some(from) = o.from.filter(|f| !f.trim().is_empty()) else {
        return Err(ierr(
            "Pass --from with the module the icon is exported from: a package, a package subpath, or a relative path in this package.",
            vec![],
            "ERR_MISSING_ARGUMENT",
        ));
    };
    let local = wr::find_local_icon_set(cwd, o.selector)?;
    let set = &local.set;
    let package_dir = local.package_dir.clone();
    let known = wr::mappable_definitions(set, &[]);
    let definition = o.definition.map(|d| wr::definition_name_of(d, &known));
    let source = resolve_icon_source(from, &local)?;
    let source_export = if o.use_default { "default".to_string() } else { export_name.to_string() };
    assert_icon_export(&source.file, &source.module, &source_export)?;
    let has_adapter = set.data.get("adapter").is_some_and(|a| a.is_object());
    let adapt = mo::export_value_kind(&source.file, &source_export) != mo::ValueKind::Component;
    if adapt && !has_adapter {
        return Err(ierr(
            format!("\"{source_export}\" in \"{}\" is not a component, so this set needs an adapter: a function in your package that turns it into one. Declare \"adapter\": {{\"module\": \"./src/adapt.js\", \"export\": \"adapt\"}} in {}.icons.json (astryx docs cli/experimental/icon-sets library-shapes).", source.module, set.name),
            vec![],
            "ERR_INVALID_ARGUMENT",
        ));
    }
    let generated = generated_module_path(set, &package_dir);
    let module = set_module(set);
    let (lib_prefix, positions) = if o.use_default || source.module.starts_with("./") { (vec![], vec![]) } else { module_naming(&source.file, has_adapter) };
    let name_words: Vec<String> = wr::icon_id_of(export_name).split('-').map(String::from).collect();
    let prefix: Vec<String> = if !lib_prefix.is_empty() && name_words.len() > lib_prefix.len() && lib_prefix.iter().enumerate().all(|(i, w)| name_words[i] == *w) { lib_prefix.clone() } else { vec![] };
    let already = gen::generated_names_of(&package_dir, &generated, &source.module, &source_export);
    let icons = icons_of(set);
    let known_icon = icons.iter().find(|i| already.iter().any(|a| a == s(i, "export")));
    let glyph = match known_icon {
        Some(k) => Naming { id: s(k, "id").to_string(), name: s(k, "export").to_string() },
        None => icon_naming_without_look(export_name, &prefix, &positions),
    };
    let as_variant = o.variant.is_some();
    let origins = gen::generated_origins(&package_dir, &generated);
    let origin = origins.iter().find(|(n, _, _)| *n == glyph.name).cloned();
    let glyph_taken = known_icon.is_none() && !as_variant && origin.as_ref().is_some_and(|(_, om, os)| !(gen::same_icon_module(om, &source.module) && *os == source_export));
    let naming = if !glyph_taken {
        glyph.clone()
    } else if let Some(g) = o.id {
        Naming { id: g.to_string(), name: name_from_id(g) }
    } else {
        icon_naming(export_name, &prefix)
    };
    let id = o.id.map(String::from).unwrap_or_else(|| naming.id.clone());
    let base_icon = icons.iter().find(|i| s(i, "id") == id);
    let set_name = match o.variant {
        Some(v) => variant_export_name(base_icon.map(|b| s(b, "export")).unwrap_or(&naming.name), v),
        None => naming.name.clone(),
    };
    if regress::Regex::new(r"^[a-z0-9]+(?:-[a-z0-9]+)*$").unwrap().find(&id).is_none() {
        return Err(ierr(format!("\"{export_name}\" gives no icon id; pass --id with a lower-kebab id."), vec![], "ERR_INVALID_ARGUMENT"));
    }
    if definition.is_none() && new_definition.is_none() && !as_variant {
        let look = match (&origin, glyph_taken) {
            (Some((_, _, os)), true) => look_variant_of(&icon_naming(export_name, &prefix).id, &icon_naming(os, &prefix).id, &positions, set),
            _ => None,
        };
        return Ok(definition_matches(set, export_name, from, &id, o.use_default, o.id, look, &glyph.id));
    }
    let mut created: Option<wr::NewDefinition> = None;
    let mut mapped = definition.clone().or(new_definition.map(String::from));
    if let Some(nd) = new_definition {
        if let Some(own) = set.definitions.iter().find(|d| d.name() == nd) {
            mapped = Some(own.name().to_string());
        } else {
            created = Some(wr::check_new_definition(nd, o.description, o.words.as_deref())?);
        }
    } else if let Some(d) = &definition {
        if !known.contains(d) {
            let mut sug: Vec<Suggestion> = wr::closest_names(d, &known, 5).into_iter().map(|n| Suggestion::new(format!("--definition {n}"), "a known icon definition")).collect();
            sug.push(Suggestion::new(
                format!("--new-definition {} --description '<what it is for>' --words a,b", wr::definition_name_from_input(d)),
                "add it as your own definition",
            ));
            return Err(ierr(format!("\"{d}\" is not an icon definition."), sug, "ERR_NOT_FOUND"));
        }
    }
    let mut next_icons: Vec<Value> = icons.clone();
    let existing_idx = next_icons.iter().position(|i| s(i, "id") == id);
    if let Some(variant) = o.variant {
        let sm = source.module.clone();
        let pos = positions.clone();
        let drawn = drawn_looks(set, &package_dir, &|m| if gen::same_icon_module(m, &sm) { Some(pos.clone()) } else { None });
        check_variant_look(set, variant, &source.module, &positions, drawn.as_ref())?;
        let Some(idx) = existing_idx else {
            let ids: Vec<String> = next_icons.iter().map(|i| s(i, "id").to_string()).collect();
            return Err(ierr(
                format!("Icon set \"{}\" has no icon \"{id}\" to add a variant to. Add the icon first, or pass --id.", set.name),
                wr::closest_names(&id, &ids, 5).into_iter().map(|n| Suggestion::new(format!("--id {n}"), "an icon in this set")).collect(),
                "ERR_NOT_FOUND",
            ));
        };
        let existing_export = s(&next_icons[idx], "export").to_string();
        if let Some((_, om, os)) = origins.iter().find(|(n, _, _)| *n == existing_export) {
            if *os == source_export && gen::same_icon_module(om, &source.module) {
                return Err(ierr(
                    format!("\"{source_export}\" is icon \"{id}\"'s own export, which draws its default look, so it can't be its {variant} variant too."),
                    vec![],
                    "ERR_INVALID_ARGUMENT",
                ));
            }
        }
        let mut variants = next_icons[idx].get("variants").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        if !variants.iter().any(|v| s(v, "export") == set_name) {
            let mut vm = Map::new();
            vm.insert("variant".into(), Value::String(variant.into()));
            vm.insert("export".into(), Value::String(set_name.clone()));
            variants.push(Value::Object(vm));
            next_icons[idx].as_object_mut().unwrap().insert("variants".into(), Value::Array(variants));
        }
    } else if let Some(idx) = existing_idx {
        let e = &next_icons[idx];
        let em = e.get("module").and_then(|v| v.as_str()).map(String::from).unwrap_or_else(|| module.clone());
        if s(e, "export") != set_name || em != module {
            return Err(ierr(
                format!("Icon set \"{}\" already has an icon \"{id}\" ({}). Pass --id to add this one under another id.", set.name, s(e, "export")),
                vec![],
                "ERR_FILE_EXISTS",
            ));
        }
    } else {
        let mut m = Map::new();
        m.insert("id".into(), Value::String(id.clone()));
        m.insert("export".into(), Value::String(set_name.clone()));
        m.insert("words".into(), Value::Array(id.split('-').map(|w| Value::String(w.into())).collect()));
        next_icons.push(Value::Object(m));
    }
    let mut map = set.data.get("map").and_then(|m| m.as_object()).cloned().unwrap_or_default();
    if let Some(m) = &mapped {
        map.insert(m.clone(), Value::String(id.clone()));
    }
    // {...set.data, generated?, themeMap?, map, icons}: spread order keeps
    // existing keys in place and appends new ones.
    let mut next = set.data.as_object().cloned().unwrap_or_default();
    if set.data.get("generated").is_none_or(|g| g.is_null() || g.as_str() == Some("")) {
        next.insert("generated".into(), Value::String(generated.clone()));
    }
    if set.data.get("themeMap").is_none_or(|g| g.is_null() || g.as_str() == Some("")) {
        next.insert("themeMap".into(), Value::String(crate::discovery::icon_set_writer::THEME_MAP_NAME.into()));
    }
    next.insert("map".into(), Value::Object(map));
    next.insert("icons".into(), Value::Array(next_icons));
    let next = Value::Object(next);
    let mut files = vec![];
    if let Some(c) = &created {
        wr::write_definition_file(set, c)?;
    }
    let written = gen::write_generated_icons(&package_dir, &generated, &next, &[GeneratedIcon { name: set_name.clone(), from: source.module.clone(), source: source_export.clone(), adapt }], &[])
        .map_err(|e| {
            if e.message.contains("is not in variants") {
                ierr(format!("{} Declare it in \"variants\" in {}.icons.json first.", e.message, set.name), vec![], "ERR_INVALID_ARGUMENT")
            } else {
                e
            }
        })?;
    let generated_changed = !written.is_empty();
    files.extend(written);
    if let Some(c) = &created {
        files.push(np::relative(&package_dir, &np::join(&[&set.dir, "definitions", &format!("{}.doc.mjs", c.name)])));
    }
    let data_changed = crate::json::stringify(&next, 0) != crate::json::stringify(&set.data, 0);
    if data_changed {
        let extra: Vec<String> = created.iter().map(|c| c.name.clone()).collect();
        wr::write_icon_set_data(set, &next, &extra).map_err(|e| {
            if e.message.contains("is not in variants") {
                ierr(format!("{} Declare it in \"variants\" in {}.icons.json first.", e.message, set.name), vec![], "ERR_INVALID_ARGUMENT")
            } else {
                e
            }
        })?;
        files.push(np::relative(&package_dir, &set.data_path));
    }
    let changed = data_changed || created.is_some() || generated_changed;
    let notes: Vec<String> = [
        local_source_note(&package_dir, &source.module),
        crate::discovery::icon_set_writer::entry_wiring_note(&package_dir, &local.pkg, &generated, Some(&module), Some(&set_name)),
    ]
    .into_iter()
    .flatten()
    .collect();
    let note = notes.join(" ");
    let mut icon = Map::new();
    icon.insert("id".into(), Value::String(id));
    icon.insert("export".into(), Value::String(set_name));
    icon.insert("module".into(), Value::String(module));
    let mut d = Map::new();
    d.insert("set".into(), Value::String(set.name.clone()));
    d.insert("package".into(), Value::String(set.package.clone()));
    d.insert("icon".into(), Value::Object(icon));
    if let Some(v) = o.variant {
        d.insert("variant".into(), Value::String(v.into()));
    }
    d.insert("definition".into(), mapped.map(Value::String).unwrap_or(Value::Null));
    if let Some(c) = &created {
        d.insert("newDefinition".into(), Value::String(c.name.clone()));
    }
    d.insert("files".into(), Value::Array(files.into_iter().map(Value::String).collect()));
    d.insert("changed".into(), Value::Bool(changed));
    if !note.is_empty() {
        d.insert("note".into(), Value::String(note));
    }
    let mut out = Map::new();
    out.insert("type".into(), Value::String("icon.add".into()));
    out.insert("data".into(), Value::Object(d));
    Ok(Value::Object(out))
}
