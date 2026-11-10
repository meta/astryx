//! Port of `libraryIcons`, `libraryLooks`, `collectLibraryIcons`,
//! `preferredLook` and `librarySource` (icon-set-writer.mjs): every icon a
//! library exports, one per glyph.

use super::add::{icon_candidates, icon_naming, library_prefix, look_positions, split_look, Positions};
use super::writer as wr;
use crate::discovery::module_origins as mo;
use crate::discovery::nodepath as np;

#[derive(Debug, Clone)]
pub struct LibraryIcon {
    pub export: String,
    pub id: String,
    pub name: String,
    pub adapt: bool,
    pub aliases: Vec<String>,
    pub look: Option<Vec<Option<String>>>,
    pub looks: Option<Vec<String>>,
}

pub struct LookSummary {
    /// Each position's words, sorted.
    pub positions: Vec<Vec<String>>,
    pub preferred: Vec<String>,
    pub exports: usize,
}

fn cmp(a: &str, b: &str) -> std::cmp::Ordering {
    crate::discovery::jsort::cmp_utf16(a, b)
}

fn collect_library_icons(file: &str, adapter: bool, exclude: &[String]) -> Vec<LibraryIcon> {
    let candidates = icon_candidates(file, adapter, exclude);
    // origin key -> (names, adapt, scalar), in first-seen order
    let mut by_origin: Vec<(String, String, Vec<String>, bool, Option<&'static str>)> = vec![];
    for c in &candidates {
        let Some(origin) = mo::module_export_origin(file, &c.name) else { continue };
        let key = format!("{}\0{}", origin.file, origin.name);
        match by_origin.iter_mut().find(|e| e.0 == key) {
            Some(e) => e.2.push(c.name.clone()),
            None => by_origin.push((key, origin.name.clone(), vec![c.name.clone()], c.adapt, c.scalar)),
        }
    }
    let mut chosen: Vec<(String, bool, Option<&'static str>, Vec<String>)> = vec![];
    for (_, local, names, adapt, scalar) in &by_origin {
        let with_icon: Vec<&String> = names.iter().filter(|n| n.ends_with("Icon")).collect();
        let preferred = with_icon
            .iter()
            .find(|n| **n == &format!("{local}Icon"))
            .map(|n| (*n).clone())
            .or_else(|| names.iter().find(|n| *n == local).cloned())
            .unwrap_or_else(|| {
                let mut pool: Vec<String> = if with_icon.is_empty() { names.clone() } else { with_icon.iter().map(|n| (*n).clone()).collect() };
                pool.sort_by(|a, b| a.encode_utf16().count().cmp(&b.encode_utf16().count()).then_with(|| if a < b { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater }));
                pool[0].clone()
            });
        chosen.push((preferred, *adapt, *scalar, names.clone()));
    }
    // prefixNames(candidates) takes every name.
    let names: Vec<String> = chosen.iter().map(|c| c.0.clone()).collect();
    let prefix = library_prefix(&names);
    let mut by_id: Vec<LibraryIcon> = vec![];
    for (preferred, adapt, _, names) in &chosen {
        let naming = icon_naming(preferred, &prefix);
        if naming.id.is_empty() || by_id.iter().any(|i| i.id == naming.id) {
            continue;
        }
        let mut aliases: Vec<String> = vec![];
        for n in names {
            let a = icon_naming(n, &prefix).id;
            if !a.is_empty() && a != naming.id && !aliases.contains(&a) {
                aliases.push(a);
            }
        }
        by_id.push(LibraryIcon { export: preferred.clone(), id: naming.id, name: naming.name, adapt: *adapt, aliases, look: None, looks: None });
    }
    let mut leads: Vec<(String, usize)> = vec![];
    for icon in &by_id {
        for alias in &icon.aliases {
            if let Some(lead) = alias.strip_suffix(&format!("-{}", icon.id)) {
                match leads.iter_mut().find(|(l, _)| l == lead) {
                    Some(e) => e.1 += 1,
                    None => leads.push((lead.to_string(), 1)),
                }
            }
        }
    }
    let threshold = 2f64.max(by_id.len() as f64 / 2.0);
    let brand: Vec<String> = leads.into_iter().filter(|(_, c)| *c as f64 >= threshold).map(|(l, _)| l).collect();
    let ids: Vec<String> = by_id.iter().map(|i| i.id.clone()).collect();
    for icon in by_id.iter_mut() {
        icon.aliases.retain(|a| !brand.iter().any(|l| a.starts_with(&format!("{l}-"))) && !ids.contains(a));
        icon.aliases.sort_by(|a, b| cmp(a, b));
    }
    by_id.sort_by(|a, b| if a.id < b.id { std::cmp::Ordering::Less } else if a.id > b.id { std::cmp::Ordering::Greater } else { std::cmp::Ordering::Equal });
    by_id
}

const DEFAULT_STYLE_WORDS: [&str; 4] = ["default", "regular", "outline", "outlined"];

/// `preferredLook(positions, prefer)`.
pub fn preferred_look(positions: &Positions, prefer: &[String]) -> Vec<String> {
    let wanted: Vec<String> = prefer.iter().map(|w| w.to_lowercase()).collect();
    positions
        .iter()
        .map(|position| {
            let mut values = position.clone();
            values.sort_by(|a, b| cmp(a, b));
            if let Some(c) = wanted.iter().find(|w| position.contains(w)) {
                return c.clone();
            }
            if let Some(c) = DEFAULT_STYLE_WORDS.iter().find(|w| position.iter().any(|p| p == *w)) {
                return c.to_string();
            }
            let re = regress::Regex::new(r"^([a-z]*)(\d+)$").unwrap();
            let numbered: Vec<Option<(String, f64)>> = values
                .iter()
                .map(|v| re.find(v).map(|m| (v[m.group(1).unwrap()].to_string(), v[m.group(2).unwrap()].parse::<f64>().unwrap_or(0.0))))
                .collect();
            let lead = numbered.first().cloned().flatten().map(|n| n.0);
            if values.len() > 1 && numbered.iter().all(|n| n.as_ref().is_some_and(|n| Some(&n.0) == lead.as_ref())) {
                let mut series: Vec<(String, f64)> = values.iter().zip(numbered.iter()).map(|(v, n)| (v.clone(), n.as_ref().unwrap().1)).collect();
                series.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
                return series[(series.len() - 1) / 2].0.clone();
            }
            values[0].clone()
        })
        .collect()
}

/// `libraryLooks(all, prefer)`.
fn library_looks(all: Vec<LibraryIcon>, prefer: &[String]) -> (Vec<LibraryIcon>, Positions, Vec<String>) {
    let ids: Vec<String> = all.iter().map(|i| i.id.clone()).collect();
    let positions = look_positions(&ids);
    if positions.is_empty() {
        return (all, positions, vec![]);
    }
    let preferred = preferred_look(&positions, prefer);
    let distance = |look: &[Option<String>]| -> String {
        let mut key = String::new();
        for i in (0..look.len()).rev() {
            key.push(if look[i].as_deref() == Some(preferred[i].as_str()) { '0' } else { '1' });
        }
        key
    };
    // id -> (best, look, key, looks)
    let mut by_glyph: Vec<(String, LibraryIcon, Vec<Option<String>>, String, Vec<String>)> = vec![];
    for icon in all {
        let words: Vec<String> = icon.id.split('-').map(String::from).collect();
        let (base, look) = split_look(&words, &positions);
        let id = base.join("-");
        let key = distance(&look);
        match by_glyph.iter_mut().find(|g| g.0 == id) {
            None => {
                let ex = icon.export.clone();
                by_glyph.push((id, icon, look, key, vec![ex]));
            }
            Some(g) => {
                g.4.push(icon.export.clone());
                if key < g.3 || (key == g.3 && icon.export < g.1.export) {
                    g.1 = icon;
                    g.2 = look;
                    g.3 = key;
                }
            }
        }
    }
    let glyph_ids: Vec<String> = by_glyph.iter().map(|g| g.0.clone()).collect();
    let mut icons: Vec<LibraryIcon> = by_glyph
        .into_iter()
        .map(|(id, best, look, _, mut looks)| {
            let pascal: String = id
                .split('-')
                .map(|w| {
                    let mut cs = w.chars();
                    match cs.next() {
                        Some(f) => format!("{}{}", f.to_uppercase(), cs.as_str()),
                        None => String::new(),
                    }
                })
                .collect();
            looks.sort_by(|a, b| cmp(a, b));
            LibraryIcon {
                aliases: best.aliases.iter().filter(|a| !glyph_ids.contains(a)).cloned().collect(),
                name: wr::icon_export_name(&pascal),
                id,
                look: Some(look),
                looks: Some(looks),
                ..best
            }
        })
        .collect();
    icons.sort_by(|a, b| if a.id < b.id { std::cmp::Ordering::Less } else if a.id > b.id { std::cmp::Ordering::Greater } else { std::cmp::Ordering::Equal });
    (icons, positions, preferred)
}

/// `libraryIcons(file, {adapter, exclude, prefer})`; `prefer` gets the
/// library's look positions.
pub fn library_icons(file: &str, adapter: bool, exclude: &[String], prefer: &mut dyn FnMut(&Positions) -> Vec<String>) -> (Vec<LibraryIcon>, Option<LookSummary>) {
    let all = collect_library_icons(file, adapter, exclude);
    let ids: Vec<String> = all.iter().map(|i| i.id.clone()).collect();
    let pref = prefer(&look_positions(&ids));
    let exports = all.len();
    let (icons, positions, preferred) = library_looks(all, &pref);
    let summary = if positions.is_empty() {
        None
    } else {
        Some(LookSummary {
            positions: positions
                .iter()
                .map(|p| {
                    let mut v = p.clone();
                    v.sort_by(|a, b| cmp(a, b));
                    v
                })
                .collect(),
            preferred,
            exports,
        })
    };
    (icons, summary)
}

pub struct Library {
    pub package: String,
    pub version: String,
    pub license: Option<String>,
    pub dir: String,
    pub notices: Vec<String>,
}

/// `librarySource(from, packageDir)`.
pub fn library_source(from: &str, package_dir: &str) -> Option<Library> {
    if from.starts_with('.') || np::is_absolute(from) {
        return None;
    }
    let parts: Vec<&str> = from.split('/').collect();
    let name = if from.starts_with('@') { parts.iter().take(2).cloned().collect::<Vec<_>>().join("/") } else { parts[0].to_string() };
    let dir = crate::discovery::paths::find_installed_package(package_dir, &name, usize::MAX)?;
    let pkg = np::read_json(&np::join2(&dir, "package.json"))?;
    let version = pkg.get("version").and_then(|v| v.as_str()).filter(|v| !v.is_empty())?.to_string();
    let mut notices: Vec<String> = np::read_dir(&dir)
        .unwrap_or_default()
        .into_iter()
        .filter(|e| e.is_file && crate::discovery::icon_set_discovery::is_notice_file(&e.name))
        .map(|e| e.name)
        .collect();
    notices.sort_by(|a, b| cmp(a, b));
    Some(Library {
        package: name,
        version,
        license: pkg.get("license").and_then(|v| v.as_str()).filter(|l| !l.trim().is_empty()).map(String::from),
        dir,
        notices,
    })
}

/// `nonIconExports(file, {exclude})`.
pub fn non_icon_exports(file: &str, adapter: bool, exclude: &[String]) -> Vec<String> {
    let icons: Vec<String> = icon_candidates(file, adapter, exclude).into_iter().map(|c| c.name).collect();
    mo::followed_export_names(file).into_iter().filter(|n| n != "default" && !icons.contains(n)).collect()
}
