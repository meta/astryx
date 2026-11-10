//! Port of `resolveDefaultLook` (api/icon/_default-look.mjs): which variant a
//! set's icons draw by default, checked against the looks the library's
//! export names encode.

use super::add::{described_looks, drawn_word, js_sorted, shell_arg, style_words, Drawn, Positions};
use super::api::{ierr, IconError};
use crate::cli::command::Suggestion;

/// `{variants, default, named}`.
pub type Looks = (Vec<String>, String, bool);

fn unknown_look(word: &str, flag: &str, module: &str, positions: &Positions) -> IconError {
    let sorted: Vec<Vec<String>> = positions.iter().map(|p| js_sorted(p)).collect();
    ierr(
        format!("\"{word}\" is no look of {module}: its exports name their looks with {}. Name one of these words, so each icon's export draws that look.", described_looks(&sorted)),
        style_words(positions).into_iter().map(|w| Suggestion::new(format!("{flag} {w}"), format!("a look {module} names"))).collect(),
        "ERR_INVALID_ARGUMENT",
    )
}

fn refresh_command(name: &str, module: Option<&str>, looks: &Looks) -> String {
    format!(
        "astryx experimental icon new-set {name} --from {} --variants {} --default-variant {}",
        module.map(shell_arg).unwrap_or_else(|| "<module>".into()),
        looks.0.join(","),
        looks.1
    )
}

fn in_place_move(name: &str, count: usize, now: &str, looks: &Looks, module: Option<&str>, current: Option<&str>) -> IconError {
    ierr(
        format!(
            "Icon set \"{name}\" can't {} in place: each of its {count} icons still draws \"{now}\". Wrap the library again with the new default, so each icon takes that look.",
            match current {
                Some(c) => format!("move its default variant from \"{c}\" to \"{}\"", looks.1),
                None => format!("take \"{}\" as its default variant", looks.1),
            }
        ),
        vec![Suggestion::new(refresh_command(name, module, looks), "wrap the library again in the new default look")],
        "ERR_INVALID_ARGUMENT",
    )
}

fn unencoded_move(name: &str, count: usize, current: &str, looks: &Looks) -> IconError {
    let mut variants = vec![current.to_string()];
    for v in &looks.0 {
        if !variants.contains(v) {
            variants.push(v.clone());
        }
    }
    let d = &looks.1;
    ierr(
        format!("Icon set \"{name}\" can't move its default variant from \"{current}\" to \"{d}\": its icons' export names name no looks, so each of its {count} icons draws \"{current}\", the look its icons' module draws. Keep \"{current}\" as the default, declare \"{d}\" as a variant, and add it from the module that draws it (fill <module> with that module)."),
        vec![
            Suggestion::new(
                format!("astryx experimental icon new-set {name} --variants {} --default-variant {current}", variants.join(",")),
                format!("declare {d} as a variant and keep {current} as the default"),
            ),
            Suggestion::new(format!("astryx experimental icon add --variant {d} --from <module> --all --set {name}"), format!("give each icon its {d} look from the module that draws it")),
        ],
        "ERR_INVALID_ARGUMENT",
    )
}

fn dropped_default(name: &str, count: usize, current: &str, looks: &Looks, from: &str) -> IconError {
    let others: Vec<String> = looks.0.iter().filter(|v| *v != current).cloned().collect();
    let mut sug = vec![Suggestion::new(
        format!("astryx experimental icon new-set {name}{from} --variants {}", std::iter::once(current.to_string()).chain(others.iter().cloned()).collect::<Vec<_>>().join(",")),
        format!("keep {current}, the look each icon draws, as the default"),
    )];
    for v in &others {
        sug.push(Suggestion::new(format!("astryx experimental icon add --variant {v} --from <module> --all --set {name}"), format!("give each icon its {v} look from the module that draws it")));
    }
    ierr(
        format!("--variants ({}) leaves out \"{current}\", the default variant of icon set \"{name}\". Its icons' export names name no looks, so each of its {count} icons still draws \"{current}\", the look its icons' module draws. List \"{current}\" in --variants, and add each other look as a variant from the module that draws it (fill <module> with that module).", looks.0.join(", ")),
        sug,
        "ERR_INVALID_OPTION",
    )
}

fn unencoded_default(name: &str, given: &Looks, current: Option<&str>, icons: usize, module: Option<&str>, refresh: bool) -> Result<(Option<Looks>, bool), IconError> {
    if given.2 {
        if let Some(c) = current {
            if given.1 != c && icons > 0 {
                return Err(unencoded_move(name, icons, c, given));
            }
        }
        return Ok((Some(given.clone()), false));
    }
    if let Some(c) = current {
        if given.0.iter().any(|v| v == c) {
            return Ok((Some((given.0.clone(), c.to_string(), given.2)), false));
        }
    }
    let from = match (refresh, module) {
        (true, Some(m)) => format!(" --from {}", shell_arg(m)),
        _ => String::new(),
    };
    if let Some(c) = current {
        if icons > 0 {
            return Err(dropped_default(name, icons, c, given, &from));
        }
    }
    if current.is_none() && icons > 0 {
        return Err(ierr(
            format!("Icon set \"{name}\" declares no default variant, and its icons' export names name none of {}. Name the look its {icons} icons draw with --default-variant.", given.0.join(", ")),
            given
                .0
                .iter()
                .map(|v| Suggestion::new(format!("astryx experimental icon new-set {name}{from} --variants {} --default-variant {v}", given.0.join(",")), format!("if each icon draws {v}")))
                .collect(),
            "ERR_INVALID_OPTION",
        ));
    }
    Ok((Some(given.clone()), false))
}

/// `resolveDefaultLook({name, given, current, icons, drawn, library})`:
/// (looks, moved).
pub fn resolve_default_look(
    name: &str,
    given: Option<&Looks>,
    current: Option<&str>,
    icons: usize,
    drawn: Option<&Drawn>,
    library: Option<(&str, &Positions)>,
) -> Result<(Option<Looks>, bool), IconError> {
    let Some(given) = given else { return Ok((None, false)) };
    let refresh = library.is_some();
    let empty: Positions = vec![];
    let positions: &Positions = match library {
        Some((_, p)) => p,
        None => drawn.map(|d| &d.positions).unwrap_or(&empty),
    };
    let module: Option<&str> = library.map(|(m, _)| m).or(drawn.map(|d| d.module.as_str()));
    let now = drawn.filter(|d| !d.positions.is_empty());
    if positions.is_empty() {
        return unencoded_default(name, given, current, icons, module, refresh);
    }
    if given.2 {
        let chosen = &given.1;
        let Some(index) = positions.iter().position(|p| p.contains(chosen)) else {
            return Err(unknown_look(chosen, "--default-variant", module.unwrap_or(""), positions));
        };
        let drawn_here = now.and_then(|n| n.words.get(index).cloned().flatten());
        if let (Some(n), Some(dh)) = (now, drawn_here) {
            if &dh != chosen {
                if !refresh {
                    return Err(in_place_move(name, n.icons, &dh, given, module, current));
                }
                return Ok((Some(given.clone()), true));
            }
        }
        return Ok((Some(given.clone()), false));
    }
    let words: Vec<Option<String>> = match now {
        Some(n) => n.words.clone(),
        None => super::library::preferred_look(positions, &[]).into_iter().map(Some).collect(),
    };
    let look = drawn_word(positions, &words, &given.0);
    match look {
        Some(l) if given.0.contains(&l) => Ok((Some((given.0.clone(), l, given.2)), false)),
        other => {
            let shown = other.unwrap_or_else(|| "<look>".into());
            let mut all = vec![shown.clone()];
            all.extend(given.0.iter().cloned());
            let m = module.unwrap_or("");
            Err(ierr(
                format!(
                    "None of --variants ({}) is the look {} (\"{shown}\"), and each icon's own export draws the default variant. List it in --variants, or name the default with --default-variant.",
                    given.0.join(", "),
                    match now {
                        Some(n) => format!("the set's {} icons draw", n.icons),
                        None => format!("{m} is wrapped in by default"),
                    }
                ),
                vec![Suggestion::new(
                    format!("astryx experimental icon new-set {name}{} --variants {}", if refresh { format!(" --from {}", shell_arg(m)) } else { String::new() }, all.join(",")),
                    format!("declare {shown}, the look each icon draws, as the default"),
                )],
                "ERR_INVALID_OPTION",
            ))
        }
    }
}
