//! `theme targets [filter]`: every component theming target.
//! Port of api/theme/targets.

use crate::cli::command::{CmdResult, Invocation, Out, Suggestion};
use crate::cli::format::{self, section, text, Field, InlineOpts};
use crate::commands::template::{fsutil, ApiError};
use crate::json::{Map, Value};

#[derive(Debug, Clone)]
pub struct Target {
    pub key: String,
    pub class_name: String,
    pub component: String,
    pub props: Vec<String>,
    pub states: Vec<String>,
}

/// `collectThemingTargets(coreSrc)`.
pub fn collect(core_src: &str) -> Vec<Target> {
    crate::discovery::theming_targets::collect_theming_targets(std::path::Path::new(core_src))
        .into_iter()
        .map(|t| Target { key: t.key, class_name: t.class_name, component: t.component, props: t.props, states: t.states })
        .collect()
}

pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let filter = inv.arg(0).map(String::from);
    let cwd = fsutil::path_str(&inv.cwd);
    let core = match crate::discovery::paths::require_core_dir(&cwd) {
        Ok(d) => d,
        Err(e) => return super::fail(out, ApiError::new(&e.message, e.code)),
    };
    let all = collect(&fsutil::join(&core, "src"));
    let needle = filter.as_deref().filter(|f| !f.is_empty()).map(|f| f.to_lowercase());
    let mut targets: Vec<&Target> = all.iter().collect();
    if let Some(n) = &needle {
        let named: Vec<&Target> = all.iter().filter(|t| t.component.to_lowercase() == *n).collect();
        targets = if !named.is_empty() {
            named
        } else {
            all.iter()
                .filter(|t| t.key.to_lowercase().contains(n) || t.class_name.to_lowercase().contains(n) || t.component.to_lowercase().contains(n))
                .collect()
        };
        if targets.is_empty() {
            let prefix: String = n.encode_utf16().take(3).map(|u| u as u32).filter_map(char::from_u32).collect();
            let mut near: Vec<String> = Vec::new();
            for t in &all {
                if t.component.to_lowercase().starts_with(&prefix) && !near.contains(&t.component) {
                    near.push(t.component.clone());
                }
            }
            near.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            near.truncate(5);
            return super::fail(out, ApiError::with(
                &format!(
                    "No theming target matches \"{}\". Run `theme targets` with no filter for the whole list.",
                    filter.as_deref().unwrap_or("")
                ),
                near.into_iter().map(|n| Suggestion::new(n, "has theming targets")).collect(),
                "ERR_UNKNOWN_COMPONENT",
            ));
        }
    }
    let mut comps: Vec<&str> = Vec::new();
    for t in &targets {
        if !comps.contains(&t.component.as_str()) {
            comps.push(&t.component);
        }
    }
    let component_count = comps.len();
    if inv.json() {
        let mut d = Map::new();
        d.insert("filter".into(), filter.as_deref().map(|f| Value::String(f.into())).unwrap_or(Value::Null));
        d.insert("componentCount".into(), Value::from(component_count));
        d.insert(
            "targets".into(),
            Value::Array(
                targets
                    .iter()
                    .map(|t| {
                        let mut m = Map::new();
                        m.insert("key".into(), Value::String(t.key.clone()));
                        m.insert("className".into(), Value::String(t.class_name.clone()));
                        m.insert("component".into(), Value::String(t.component.clone()));
                        m.insert("props".into(), Value::Array(t.props.iter().map(|x| Value::String(x.clone())).collect()));
                        m.insert("states".into(), Value::Array(t.states.iter().map(|x| Value::String(x.clone())).collect()));
                        Value::Object(m)
                    })
                    .collect(),
            ),
        );
        out.json_out("theme.targets", None, Value::Object(d), None);
        return Ok(());
    }
    let run = crate::cli::env::cli_invocation(&inv.cwd);
    let rows: Vec<format::Fields> = targets
        .iter()
        .map(|t| {
            vec![
                ("key".into(), Field::from(t.key.as_str())),
                ("component".into(), Field::from(t.component.as_str())),
                ("props".into(), Field::from(t.props.clone())),
                ("states".into(), Field::from(t.states.clone())),
                ("className".into(), Field::from(t.class_name.as_str())),
            ]
        })
        .collect();
    out.emit(&[
        section(
            "Theming targets",
            Some(&format!(
                "{} across {component_count} component{}\n(key - component - props - states - className)",
                targets.len(),
                if component_count == 1 { "" } else { "s" }
            )),
        ),
        format::records_inline(&rows, &InlineOpts::default()),
        text(
            &[
                "Each key goes under `components` in defineTheme; it paints `.astryx-<key>`.".to_string(),
                "Props take a value (`variant:secondary`); states are written bare (`checked`).".to_string(),
                format!("One component in full: {run} component <Name>"),
            ]
            .join("\n"),
        ),
    ]);
    Ok(())
}
