//! The page template a kit starts from (`api/build/kit/start.mjs`).

use super::kind::asks_for_new_page;
use super::rank::{pick_alternatives, pick_start, RankedPage};
use super::weights::{blend_order, weigh_start, WeightsFile};
use super::words::{IdeaKind, PageTemplate};
use crate::json::{Map, Value};
use std::collections::{HashMap, HashSet};

const FALLBACK_STARTS: &[&str] = &["shell-top-nav", "blank"];

/// A page template as the kit names it: `{name, package, displayName,
/// description, command}`.
pub fn as_template(t: &PageTemplate) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("name".into(), Value::String(t.name.clone()));
    m.insert("package".into(), Value::String(t.package.clone()));
    m.insert("displayName".into(), Value::String(t.display_name.clone()));
    m.insert("description".into(), Value::String(t.description.clone()));
    m.insert("command".into(), Value::String(format!("{} <path>", t.command)));
    m
}

fn placement(kind: IdeaKind, in_page: bool) -> Option<&'static str> {
    match kind {
        IdeaKind::Edit => Some("the idea changes a page you already have, so keep it and add blocks to it; a new page starts from the app shell."),
        IdeaKind::Part => Some(if in_page {
            "the idea is a part of a page, so it starts from the page it names."
        } else {
            "the idea is a part of a page and names no page, so it starts from the app shell."
        }),
        IdeaKind::Page => None,
    }
}

fn capitalize(s: &str) -> String {
    // `place[0].toUpperCase() + place.slice(1)`; places are ASCII.
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

/// The start without its alternatives: `asTemplate` fields, then `basis` and
/// `reason`.
pub fn choose_start(
    ranked: &[RankedPage],
    kind: IdeaKind,
    page_names: &[String],
    direct_match: bool,
    catalog: &[PageTemplate],
    idea: &str,
    weights: Option<&WeightsFile>,
) -> Option<Map<String, Value>> {
    let direct: Option<&str> = if direct_match { page_names.first().map(|s| s.as_str()) } else { None };
    let unready = direct.filter(|d| !catalog.iter().any(|t| t.name == *d));
    let loose = page_names.iter().map(|p| format!("`{p}`")).collect::<Vec<_>>().join(", ");
    let placed = |place: &str, start_name: &str| -> String {
        match direct {
            Some(d) if d != start_name => format!("Search matched `{d}` by name, but {place}"),
            _ => capitalize(place),
        }
    };
    let proposed = pick_start(ranked, kind);
    let weighed: Option<Option<String>> = if kind == IdeaKind::Page {
        weigh_start(idea, ranked, proposed.as_ref(), catalog, weights, asks_for_new_page(idea, catalog))
    } else {
        None
    };
    let pick: Option<RankedPage> = match &weighed {
        None => proposed.clone(),
        Some(None) => {
            let keep = match &proposed {
                Some(p) => p.family == "Shell" || (direct.is_some() && unready.is_none()),
                None => false,
            };
            if keep {
                proposed.clone()
            } else {
                None
            }
        }
        Some(Some(w)) => ranked.iter().find(|r| &r.name == w).cloned().or_else(|| proposed.clone()),
    };
    let closest = pick.as_ref().and_then(|p| catalog.iter().find(|t| t.name == p.name));
    if let (Some(pick), Some(closest)) = (&pick, closest) {
        let agrees = Some(closest.name.as_str()) == direct;
        let place = placement(kind, pick.base && pick.family_named);
        let mut m = as_template(closest);
        m.insert("basis".into(), Value::String(if agrees { "direct" } else { "closest" }.into()));
        let reason = if let Some(u) = unready {
            format!("`{u}` matches but is not ready yet; this is the closest ready template.")
        } else if let Some(place) = place {
            placed(place, &closest.name)
        } else if agrees {
            "Matches the idea.".to_string()
        } else if let Some(d) = direct {
            format!("Search matched `{d}` by name, but this template fits more of the idea.")
        } else {
            "The closest template; none is exactly this page.".to_string()
        };
        m.insert("reason".into(), Value::String(reason));
        return Some(m);
    }
    for id in FALLBACK_STARTS {
        if let Some(shell) = catalog.iter().find(|t| t.name == *id) {
            let nearest = (ranked.first().map(|r| r.name == shell.name && r.hits > 0).unwrap_or(false))
                || (matches!(weighed, Some(None)) && proposed.as_ref().map(|p| p.family != "Shell").unwrap_or(false));
            let place = placement(kind, false);
            let mut m = as_template(shell);
            m.insert("basis".into(), Value::String("fallback".into()));
            let reason = if let Some(u) = unready {
                format!("`{u}` matches but is not ready yet, so start from the app shell.")
            } else if let Some(place) = place {
                placed(place, &shell.name)
            } else if let Some(d) = direct {
                if matches!(weighed, Some(None)) {
                    format!("Search matched `{d}` by name, but the app shell is the closer start.")
                } else {
                    format!("Search matched `{d}` by name, but too little of the idea fits it, so start from the app shell.")
                }
            } else if nearest {
                "No template is a clear match; the app shell is the closest.".to_string()
            } else if !loose.is_empty() {
                format!("Search matched {loose} only loosely, so start from the app shell.")
            } else {
                "No template matched, so start from the app shell.".to_string()
            };
            m.insert("reason".into(), Value::String(reason));
            return Some(m);
        }
    }
    None
}

/// The next best page templates beside the start.
pub fn pick_start_alternatives(
    ranked: &[RankedPage],
    kind: IdeaKind,
    start_name: &str,
    catalog: &[PageTemplate],
    idea: &str,
    weights: Option<&WeightsFile>,
) -> Vec<RankedPage> {
    let eligible = pick_alternatives(ranked, start_name, ranked.len());
    let by_ranker: Vec<RankedPage> = eligible.iter().take(2).cloned().collect();
    if kind != IdeaKind::Page {
        return by_ranker;
    }
    let order = blend_order(idea, ranked, pick_start(ranked, kind).as_ref(), catalog, weights);
    let (Some(weights), Some(order)) = (weights, order) else { return by_ranker };
    let listed: HashSet<&str> = weights.candidates.iter().map(|s| s.as_str()).collect();
    let mut at: HashMap<&str, usize> = HashMap::new();
    for (i, name) in order.iter().enumerate() {
        at.insert(name.as_str(), i);
    }
    let slots: Vec<Option<RankedPage>> =
        by_ranker.iter().map(|r| if listed.contains(r.name.as_str()) { None } else { Some(r.clone()) }).collect();
    let mut rest: Vec<RankedPage> = eligible
        .iter()
        .filter(|r| listed.contains(r.name.as_str()) && at.contains_key(r.name.as_str()))
        .cloned()
        .collect();
    rest.sort_by_key(|r| at[r.name.as_str()]);
    let mut rest = rest.into_iter();
    slots.into_iter().filter_map(|slot| slot.or_else(|| rest.next())).collect()
}
