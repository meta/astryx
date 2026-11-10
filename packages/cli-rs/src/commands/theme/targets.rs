//! `theme targets [filter]`: every component theming target.
//! Port of api/theme/targets and foundation/discovery/theming-targets.mjs.

use crate::cli::command::{CmdResult, Invocation, Out, Suggestion};
use crate::cli::format::{self, section, text, Field, InlineOpts};
use crate::commands::template::{discovery::read_dir_sorted, fsutil, ApiError};
use crate::json::{Map, Value};

#[derive(Debug, Clone)]
pub struct Target {
    pub key: String,
    pub class_name: String,
    pub component: String,
    pub parent: Option<String>,
    pub props: Vec<String>,
    pub states: Vec<String>,
}

fn string_list(v: Option<&Value>) -> Vec<String> {
    match v {
        Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str().map(String::from)).collect(),
        _ => Vec::new(),
    }
}

/// `loadComponentDoc` (strict reader).
// TEMP: replace with src/discovery component_loader::load_component_doc when it lands.
fn load_component_doc(file: &str) -> Option<Value> {
    let ns = crate::discovery::docmod::import_doc_module(file).ok()?;
    crate::discovery::docmod::first_export(&ns, &["default", "docs"]).cloned()
}

pub fn collect(core_src: &str) -> Vec<Target> {
    let mut targets = Vec::new();
    if !std::path::Path::new(core_src).exists() {
        return targets;
    }
    fn scan(dir: &str, out: &mut Vec<Target>) {
        // fs.readdirSync order.
        for (name, is_dir) in read_dir_sorted(dir) {
            let full = fsutil::join(dir, &name);
            if is_dir {
                if name == "node_modules" || name == "__tests__" {
                    continue;
                }
                scan(&full, out);
                continue;
            }
            if !name.ends_with(".doc.mjs") {
                continue;
            }
            let Some(doc) = load_component_doc(&full) else { continue };
            let component = match doc.get("name").and_then(|v| v.as_str()) {
                Some(n) if !n.is_empty() => n.to_string(),
                _ => fsutil::basename(&fsutil::dirname(&full)),
            };
            let parent = doc.get("subComponentOf").and_then(|v| v.as_str()).map(String::from);
            let list = doc.get("theming").and_then(|t| t.get("targets")).and_then(|t| t.as_array()).cloned().unwrap_or_default();
            for t in list {
                let Some(cn) = t.get("className").and_then(|v| v.as_str()) else { continue };
                let key = cn.strip_prefix("astryx-").unwrap_or(cn).to_string();
                if key.is_empty() {
                    continue;
                }
                out.push(Target {
                    key,
                    class_name: cn.to_string(),
                    component: component.clone(),
                    parent: parent.clone(),
                    props: string_list(t.get("visualProps")),
                    states: string_list(t.get("states")),
                });
            }
        }
    }
    scan(core_src, &mut targets);
    // canonicalizeParentTargets
    let mut roots: std::collections::HashMap<(String, String), Vec<usize>> = Default::default();
    for (i, t) in targets.iter().enumerate() {
        if t.parent.is_none() {
            roots.entry((t.component.clone(), t.class_name.clone())).or_default().push(i);
        }
    }
    let mut dup = std::collections::HashSet::new();
    for i in 0..targets.len() {
        let Some(p) = targets[i].parent.clone() else { continue };
        let r = roots.get(&(p, targets[i].class_name.clone())).cloned().unwrap_or_default();
        if r.len() != 1 {
            continue;
        }
        let c = r[0];
        let (props, states) = (targets[i].props.clone(), targets[i].states.clone());
        for x in props {
            if !targets[c].props.contains(&x) {
                targets[c].props.push(x);
            }
        }
        for x in states {
            if !targets[c].states.contains(&x) {
                targets[c].states.push(x);
            }
        }
        dup.insert(i);
    }
    let mut out: Vec<Target> = targets.into_iter().enumerate().filter(|(i, _)| !dup.contains(i)).map(|(_, t)| t).collect();
    out.sort_by(|a, b| {
        crate::text::locale_compare(&a.key, &b.key).then_with(|| crate::text::locale_compare(&a.component, &b.component))
    });
    out
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
