//! The build.kit response (`api/build/kit/answer.mjs`).

use super::js::{self, re};
use super::signals::KitSignals;
use crate::json::{self, Map, Value};
use std::collections::HashMap;

const THIN_KIT: usize = 3;
const MIN_DESCRIPTION: usize = 24;

pub const FRAME: &[&str] = &["AppShell", "TopNav", "SideNav", "Layout"];
pub const FOUNDATION: &[&str] = &[
    "VStack", "HStack", "Grid", "StackItem", "Card", "Section", "Text", "Heading", "Button", "Icon", "Badge", "Divider",
];

pub use crate::text::string_utils::first_sentence;

/// One listed block, and whether it is one of build's own entries (JS
/// compares object identity with `own.includes(b)`).
#[derive(Clone)]
struct Listed {
    entry: Value,
    own: bool,
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

/// The kit for a request.
pub fn kit_answer(signals: &KitSignals, blocks: Option<&[String]>, picked: &HashMap<String, Value>) -> Value {
    let blocks: Vec<String> = blocks.map(|b| b.to_vec()).unwrap_or_else(|| signals.kit_blocks.clone());
    let mut own: indexmap::IndexMap<String, std::collections::VecDeque<Value>> = indexmap::IndexMap::new();
    for b in &signals.blocks {
        own.entry(s(b, "name")).or_default().push_back(b.clone());
    }
    let mut added: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut named: Vec<Listed> = Vec::new();
    for name in &blocks {
        if let Some(e) = own.get_mut(name).and_then(|q| q.pop_front()) {
            named.push(Listed { entry: e, own: true });
            continue;
        }
        let found = if own.contains_key(name) || added.contains(name) {
            None
        } else {
            signals.searched_entries.get(name).or_else(|| picked.get(name)).cloned()
        };
        if let Some(f) = found {
            added.insert(name.clone());
            named.push(Listed { entry: f, own: false });
        }
    }
    named.truncate(signals.blocks.len());

    let hint = if signals.pages.len() + named.len() + signals.domain.len() < THIN_KIT {
        let mut h = Map::new();
        h.insert(
            "reason".into(),
            Value::String("Few matches. This is keyword search, not semantic \u{2014} try other wordings.".into()),
        );
        h.insert(
            "commands".into(),
            Value::Array(vec![Value::String("component --list".into()), Value::String("template --list".into())]),
        );
        Some(Value::Object(h))
    } else {
        None
    };

    let answer = |list: &[Value]| -> Value {
        let mut d = Map::new();
        d.insert("query".into(), Value::String(signals.query.clone()));
        d.insert("hasResults".into(), Value::Bool(signals.match_count > 0.0));
        d.insert("matchCount".into(), json::num(signals.match_count));
        d.insert("directMatch".into(), Value::Bool(signals.direct_match));
        d.insert("start".into(), signals.start.clone().unwrap_or(Value::Null));
        d.insert("pages".into(), Value::Array(signals.pages.clone()));
        d.insert("blocks".into(), Value::Array(list.to_vec()));
        d.insert("domain".into(), Value::Array(signals.domain.clone()));
        d.insert("frame".into(), Value::Array(FRAME.iter().map(|x| Value::String(x.to_string())).collect()));
        d.insert("foundation".into(), Value::Array(FOUNDATION.iter().map(|x| Value::String(x.to_string())).collect()));
        if let Some(h) = &hint {
            d.insert("hint".into(), h.clone());
        }
        let mut a = Map::new();
        a.insert("type".into(), Value::String("build.kit".into()));
        a.insert("data".into(), Value::Object(d));
        Value::Object(a)
    };
    let bytes = |list: &[Value]| json::stringify(&answer(list), 0).len();
    let text_size = |list: &[Value]| -> usize {
        list.iter()
            .map(|b| format!("{}{}{}", s(b, "name"), s(b, "package"), first_sentence(&s(b, "description"))).len())
            .sum()
    };
    let fitted = fit_descriptions(named, &signals.blocks, &bytes, &text_size);
    answer(&fitted)
}

fn cut_to(description: &str, keep: i64) -> String {
    let room = keep.max(MIN_DESCRIPTION as i64) as usize;
    let u: Vec<u16> = description.encode_utf16().collect();
    if u.len() <= room {
        return description.to_string();
    }
    let cut = &u[..room];
    let at = cut.iter().rposition(|c| *c == b' ' as u16);
    let piece = match at {
        Some(a) if a > 0 => &cut[..a],
        _ => cut,
    };
    let s = String::from_utf16_lossy(piece);
    let trimmed = s.trim_end_matches(|c: char| crate::cli::format::js_ws(c));
    format!("{trimmed}\u{2026}")
}

fn fit_descriptions(
    list: Vec<Listed>,
    own: &[Value],
    json_size: &dyn Fn(&[Value]) -> usize,
    text_size: &dyn Fn(&[Value]) -> usize,
) -> Vec<Value> {
    let limit_json = json_size(own) as i64;
    let limit_text = text_size(own) as i64;
    let mut out = list;
    let vals = |l: &[Listed]| l.iter().map(|x| x.entry.clone()).collect::<Vec<_>>();
    let over = |l: &[Listed]| {
        let v = vals(l);
        ((text_size(&v) as i64 - limit_text).max(0), (json_size(&v) as i64 - limit_json).max(0))
    };
    let mut changed = true;
    while changed {
        changed = false;
        let mut k = out.len();
        while k > 0 {
            k -= 1;
            let (ot, oj) = over(&out);
            if ot == 0 && oj == 0 {
                return vals(&out);
            }
            let b = &out[k];
            let desc = s(&b.entry, "description");
            if b.own || desc.is_empty() {
                continue;
            }
            let first = first_sentence(&desc);
            let dlen = js::len16(&desc) as i64;
            let keep = (if ot > 0 { js::len16(&first) as i64 - ot - 1 } else { dlen })
                .min(if oj > 0 { dlen - oj - 1 } else { dlen });
            let description = cut_to(&desc, keep);
            if js::len16(&description) as i64 >= dlen {
                continue;
            }
            let mut e = out[k].entry.clone();
            if let Some(m) = e.as_object_mut() {
                m.insert("description".into(), Value::String(description));
            }
            out[k] = Listed { entry: e, own: false };
            changed = true;
        }
    }
    vals(&out)
}
