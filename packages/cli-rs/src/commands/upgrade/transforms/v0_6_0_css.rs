//! v0.6.0 `migrate-astryx-theme-selectors-to-data-attrs` (CSS), shared with
//! the v0.7.0 theme-surface migration.

use crate::commands::upgrade::css::postcss::{self, Css, Kind};
use crate::commands::upgrade::css::selector::{SType, Sel};
use crate::commands::upgrade::css::{css_parse_error, process_selector};
use crate::commands::upgrade::jsc::*;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

pub type Candidate = (String, String);

pub struct DynRule {
    pub axis: String,
    pub token: String,
    pub prefix: Option<String>,
}

pub struct SelectorData {
    pub targets: HashMap<String, serde_json::Map<String, Value>>,
    pub dynamic: HashMap<String, Vec<DynRule>>,
}

/// Reads one `export const NAME = {...};` table from a frozen data module.
fn table(src: &str, name: &str) -> serde_json::Map<String, Value> {
    let start = src.find(&format!("export const {} = ", name)).expect("table") + format!("export const {} = ", name).len();
    let end = start + src[start..].find("\n};").expect("table end") + 2;
    let mut body = src[start..end].to_string();
    // drop the trailing comma before the closing brace
    if let Some(i) = body.rfind(',') {
        if body[i + 1..].trim() == "}" {
            body.remove(i);
        }
    }
    serde_json::from_str::<Value>(&body).expect("table json").as_object().unwrap().clone()
}

fn load(src: &str, targets: &str, axes: &str) -> SelectorData {
    let t = table(src, targets).into_iter().map(|(k, v)| (k, v.as_object().unwrap().clone())).collect();
    let d = table(src, axes)
        .into_iter()
        .map(|(k, v)| {
            let rules = v.as_array().unwrap().iter().map(|r| DynRule { axis: r["axis"].as_str().unwrap().to_string(), token: r["token"].as_str().unwrap().to_string(), prefix: r.get("prefix").and_then(|p| p.as_str()).map(|s| s.to_string()) }).collect();
            (k, rules)
        })
        .collect();
    SelectorData { targets: t, dynamic: d }
}

pub fn v054_data() -> &'static SelectorData {
    static D: OnceLock<SelectorData> = OnceLock::new();
    D.get_or_init(|| load(include_str!("../../../../../cli/assets/codemods/transforms/v0.6.0/migrate-astryx-theme-selectors-v0.5.4-data.mjs"), "V054_THEME_SELECTOR_TARGETS", "V054_THEME_SELECTOR_DYNAMIC_AXES"))
}

pub fn v06_data() -> &'static SelectorData {
    static D: OnceLock<SelectorData> = OnceLock::new();
    D.get_or_init(|| load(include_str!("../../../../../cli/assets/codemods/transforms/v0.7.0/migrate-deprecated-theme-surface-v0.6-data.mjs"), "V06_THEME_SELECTOR_TARGETS", "V06_THEME_SELECTOR_DYNAMIC_AXES"))
}

fn uniq(v: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    for x in v {
        if !out.contains(&x) {
            out.push(x);
        }
    }
    out
}

fn starts_digit(s: &str) -> bool {
    s.as_bytes().first().map(|c| c.is_ascii_digit()).unwrap_or(false)
}

pub fn data_attribute_name(axis: &str) -> String {
    crate::commands::upgrade::jsre::replace_fn("([a-z0-9])([A-Z])", "g", axis, |g| format!("{}-{}", g[1].unwrap_or(""), g[2].unwrap_or(""))).to_lowercase()
}

fn escape_attribute_value(v: &str) -> String {
    let mut out = String::new();
    for ch in v.chars() {
        let cp = ch as u32;
        if ch == '"' || ch == '\\' || cp < 0x20 || cp == 0x7f {
            out.push_str(&format!("\\{:x} ", if cp == 0 { 0xfffd } else { cp }));
        } else {
            out.push(ch);
        }
    }
    out
}

/// A selector, or the `of` filter list of an nth pseudo (a bare node list).
#[derive(Clone)]
enum SelLike {
    Real(usize),
    Fake(Vec<usize>),
}

#[derive(Clone, Default, Debug)]
pub struct Ctx {
    pub guaranteed: Vec<String>,
    pub possible: Vec<String>,
}

pub struct M<'d> {
    pub d: &'d SelectorData,
}

impl<'d> M<'d> {
    fn nodes_of(&self, s: &Sel, x: &SelLike) -> Vec<usize> {
        match x {
            SelLike::Real(id) => s.kids(*id),
            SelLike::Fake(v) => v.clone(),
        }
    }

    pub fn candidates_for(&self, target: &str, token: &str) -> Vec<Candidate> {
        let mut c: Vec<Candidate> = vec![];
        if !self.d.targets.contains_key(target) && !self.d.dynamic.contains_key(target) && crate::commands::upgrade::transforms::jsproto::proto(target).is_some() {
            PROTO_THREW.with(|f| f.set(true));
            return c;
        }
        if let Some(entry) = self.d.targets.get(target).and_then(|m| m.get(token)) {
            if let Some(arr) = entry.as_array() {
                if arr.first().map(|f| f.is_string()).unwrap_or(false) {
                    c.push((arr[0].as_str().unwrap().to_string(), arr[1].as_str().unwrap().to_string()));
                } else {
                    for p in arr {
                        let p = p.as_array().unwrap();
                        c.push((p[0].as_str().unwrap().to_string(), p[1].as_str().unwrap().to_string()));
                    }
                }
            }
        }
        for rule in self.d.dynamic.get(target).map(|v| v.as_slice()).unwrap_or(&[]) {
            if rule.token == "class-value" {
                c.push((rule.axis.clone(), token.to_string()));
                let np = format!("{}-", rule.axis);
                if let Some(un) = token.strip_prefix(&np) {
                    if starts_digit(un) {
                        c.push((rule.axis.clone(), un.to_string()));
                    }
                }
            } else if let Some(p) = rule.prefix.as_deref().filter(|p| !p.is_empty()) {
                if let Some(v) = token.strip_prefix(p) {
                    if starts_digit(v) {
                        c.push((rule.axis.clone(), v.to_string()));
                    }
                }
            }
        }
        c
    }

    fn dedupe(c: Vec<Candidate>) -> Vec<Candidate> {
        // `new Map(key → candidate)`: first position, last value (equal anyway)
        let mut out: Vec<Candidate> = vec![];
        for x in c {
            if !out.contains(&x) {
                out.push(x);
            }
        }
        out
    }

    fn candidate_key(c: &Candidate) -> String {
        format!("{}\0{}", data_attribute_name(&c.0), c.1)
    }

    fn attribute_node(s: &mut Sel, c: &Candidate) -> usize {
        let esc = escape_attribute_value(&c.1);
        s.attribute_eq(&format!("data-{}", data_attribute_name(&c.0)), &c.1, &format!("\"{}\"", esc))
    }

    fn gated_attribute_selector(s: &mut Sel, target: &str, c: &Candidate) -> usize {
        let cls = s.class_name(&format!("astryx-{}", target));
        let inner = s.selector(vec![cls]);
        let gate = s.pseudo(":where", vec![inner]);
        let attr = Self::attribute_node(s, c);
        s.selector(vec![gate, attr])
    }

    fn union_node(s: &mut Sel, old: usize, cands: &[Candidate], gated: &[(String, Candidate)]) -> usize {
        let cl = s.clone_node(old);
        let mut arms = vec![s.selector(vec![cl])];
        for c in cands {
            let a = Self::attribute_node(s, c);
            arms.push(s.selector(vec![a]));
        }
        for (t, c) in gated {
            arms.push(Self::gated_attribute_selector(s, t, c));
        }
        s.pseudo(":is", arms)
    }

    fn known_target(&self, t: &str) -> bool {
        // `TARGETS[t] != null`: inherited Object.prototype members count.
        self.d.targets.contains_key(t) || self.d.dynamic.contains_key(t) || crate::commands::upgrade::transforms::jsproto::proto(t).is_some()
    }

    fn completed_arms(&self, s: &Sel, pseudo: usize, target_names: &[String], conditional: &[String]) -> Vec<usize> {
        let mut completed: Vec<usize> = vec![];
        if target_names.is_empty() && conditional.is_empty() {
            return completed;
        }
        let mut class_arms: Vec<(usize, String)> = vec![];
        let mut attr_arms: HashMap<String, usize> = HashMap::new();
        let mut gated_arms: HashMap<String, usize> = HashMap::new();
        for sel in s.kids(pseudo) {
            if s.ty(sel) != SType::Selector {
                continue;
            }
            let ns = s.kids(sel);
            if ns.len() == 1 {
                let node = ns[0];
                if s.ty(node) == SType::Class && !s.val(node).starts_with("astryx-") {
                    class_arms.push((sel, s.val(node).to_string()));
                } else if s.ty(node) == SType::Attribute && s.n[node].attribute.as_deref().unwrap_or("").starts_with("data-") {
                    let a = s.n[node].attribute.clone().unwrap_or_default();
                    attr_arms.insert(format!("{}\0{}", &a[5..], s.n[node].value.clone().unwrap_or_default()), sel);
                }
                continue;
            }
            if ns.len() != 2 {
                continue;
            }
            let (gate, attribute) = (ns[0], ns[1]);
            let gk = s.kids(gate);
            let ok = s.ty(gate) == SType::Pseudo && s.val(gate) == ":where" && gk.len() == 1 && s.ty(gk[0]) == SType::Selector && s.kids(gk[0]).len() == 1 && s.ty(s.kids(gk[0])[0]) == SType::Class && s.val(s.kids(gk[0])[0]).starts_with("astryx-") && s.ty(attribute) == SType::Attribute && s.n[attribute].attribute.as_deref().unwrap_or("").starts_with("data-");
            if !ok {
                continue;
            }
            let target = s.val(s.kids(gk[0])[0])["astryx-".len()..].to_string();
            let a = s.n[attribute].attribute.clone().unwrap_or_default();
            gated_arms.insert(format!("{}\0{}\0{}", target, &a[5..], s.n[attribute].value.clone().unwrap_or_default()), sel);
        }
        for (sel, token) in class_arms {
            let cands = Self::dedupe(target_names.iter().flat_map(|t| self.candidates_for(t, &token)).collect());
            let gated: Vec<(String, Candidate)> = conditional.iter().flat_map(|t| self.candidates_for(t, &token).into_iter().map(move |c| (t.clone(), c))).collect();
            if cands.is_empty() && gated.is_empty() {
                continue;
            }
            let direct: Vec<Option<usize>> = cands.iter().map(|c| attr_arms.get(&Self::candidate_key(c)).copied()).collect();
            let gat: Vec<Option<usize>> = gated.iter().map(|(t, c)| gated_arms.get(&format!("{}\0{}", t, Self::candidate_key(c))).copied()).collect();
            if direct.iter().chain(gat.iter()).any(|a| a.is_none()) {
                continue;
            }
            if !completed.contains(&sel) {
                completed.push(sel);
            }
            for a in direct.into_iter().chain(gat).flatten() {
                if !completed.contains(&a) {
                    completed.push(a);
                }
            }
        }
        completed
    }

    fn compounds(s: &Sel, nodes: &[usize]) -> Vec<Vec<usize>> {
        let mut c: Vec<Vec<usize>> = vec![vec![]];
        for &n in nodes {
            if s.ty(n) == SType::Combinator {
                c.push(vec![]);
            } else {
                c.last_mut().unwrap().push(n);
            }
        }
        c
    }

    fn direct_target_names(&self, s: &Sel, nodes: &[usize]) -> Vec<String> {
        nodes.iter().filter(|&&n| s.ty(n) == SType::Class && s.val(n).starts_with("astryx-")).map(|&n| s.val(n)["astryx-".len()..].to_string()).filter(|t| self.known_target(t)).collect()
    }

    fn nth_filter_selectors(s: &Sel, pseudo: usize) -> Vec<SelLike> {
        let mut filters = vec![];
        let mut found_of = false;
        for sel in s.kids(pseudo) {
            if s.ty(sel) != SType::Selector {
                continue;
            }
            if !found_of {
                let ns = s.kids(sel);
                let of = ns.iter().position(|&n| s.ty(n) == SType::Tag && s.val(n) == "of");
                match of {
                    None => continue,
                    Some(i) => {
                        found_of = true;
                        filters.push(SelLike::Fake(ns[i + 1..].to_vec()));
                        continue;
                    }
                }
            }
            filters.push(SelLike::Real(sel));
        }
        filters
    }

    fn subject_target_context(&self, s: &Sel, sel: &SelLike) -> Ctx {
        let nodes = self.nodes_of(s, sel);
        let compounds = Self::compounds(s, &nodes);
        let subject = compounds.last().cloned().unwrap_or_default();
        let nested = self.same_element_pseudo_ctx(s, &subject);
        let direct = self.direct_target_names(s, &subject);
        Ctx { guaranteed: uniq(direct.iter().cloned().chain(nested.guaranteed).collect()), possible: uniq(direct.into_iter().chain(nested.possible).collect()) }
    }

    fn pseudo_branches(s: &Sel, node: usize) -> Option<(bool, Vec<SelLike>)> {
        if s.ty(node) != SType::Pseudo || s.n[node].nodes.is_none() {
            return None;
        }
        let v = s.val(node);
        let positive = matches!(v, ":is" | ":where" | ":nth-child" | ":nth-last-child");
        let negative = v == ":not";
        if !positive && !negative {
            return None;
        }
        let sels = if v == ":nth-child" || v == ":nth-last-child" { Self::nth_filter_selectors(s, node) } else { s.kids(node).into_iter().filter(|&x| s.ty(x) == SType::Selector).map(SelLike::Real).collect() };
        Some((positive, sels))
    }

    fn same_element_pseudo_ctx(&self, s: &Sel, nodes: &[usize]) -> Ctx {
        let mut guaranteed = vec![];
        let mut possible = vec![];
        for &node in nodes {
            let (positive, sels) = match Self::pseudo_branches(s, node) {
                Some(x) => x,
                None => continue,
            };
            let branches: Vec<Ctx> = sels.iter().map(|b| self.subject_target_context(s, b)).collect();
            if branches.is_empty() {
                continue;
            }
            if positive {
                for t in &branches[0].guaranteed {
                    if branches.iter().all(|b| b.guaranteed.contains(t)) {
                        guaranteed.push(t.clone());
                    }
                }
            }
            for b in &branches {
                possible.extend(b.possible.iter().cloned());
            }
        }
        let g = uniq(guaranteed);
        Ctx { possible: uniq(g.iter().cloned().chain(possible).collect()), guaranteed: g }
    }

    fn migrate_compound(&self, s: &mut Sel, nodes: &[usize], inherited: &[String], inherited_cond: &[String]) {
        let direct = uniq(inherited.iter().cloned().chain(self.direct_target_names(s, nodes)).collect());
        let pc = self.same_element_pseudo_ctx(s, nodes);
        let guaranteed = uniq(direct.into_iter().chain(pc.guaranteed).collect());
        let possible = uniq(guaranteed.iter().cloned().chain(inherited_cond.iter().cloned()).chain(pc.possible).collect());
        let conditional: Vec<String> = possible.iter().filter(|t| !guaranteed.contains(t)).cloned().collect();
        for &node in nodes {
            if s.ty(node) != SType::Pseudo || s.n[node].nodes.is_none() {
                continue;
            }
            let completed = self.completed_arms(s, node, &guaranteed, &conditional);
            let arms: Vec<usize> = s.kids(node).into_iter().filter(|&x| s.ty(x) == SType::Selector).collect();
            if !completed.is_empty() && completed.len() == arms.len() {
                continue;
            }
            let v = s.val(node).to_string();
            if v == ":nth-child" || v == ":nth-last-child" {
                for f in Self::nth_filter_selectors(s, node) {
                    self.migrate_selector_node(s, &f, &[], &possible);
                }
                continue;
            }
            let same = matches!(v.as_str(), ":is" | ":where" | ":not");
            let nt: Vec<String> = if same { guaranteed.clone() } else { vec![] };
            let nc: Vec<String> = if same { conditional.clone() } else { vec![] };
            for arm in arms {
                if completed.contains(&arm) {
                    continue;
                }
                self.migrate_selector_node(s, &SelLike::Real(arm), &nt, &nc);
            }
        }
        if guaranteed.is_empty() && conditional.is_empty() {
            return;
        }
        for &node in nodes {
            if s.ty(node) != SType::Class || s.val(node).starts_with("astryx-") {
                continue;
            }
            let token = s.val(node).to_string();
            let cands = Self::dedupe(guaranteed.iter().flat_map(|t| self.candidates_for(t, &token)).collect());
            let mut gated: Vec<(String, Candidate)> = vec![];
            let mut seen: Vec<String> = vec![];
            for t in &conditional {
                for c in self.candidates_for(t, &token) {
                    let k = format!("{}\0{}", t, Self::candidate_key(&c));
                    if seen.contains(&k) {
                        continue;
                    }
                    seen.push(k);
                    gated.push((t.clone(), c));
                }
            }
            if cands.is_empty() && gated.is_empty() {
                continue;
            }
            let u = Self::union_node(s, node, &cands, &gated);
            s.replace_with(node, u);
        }
    }

    fn migrate_selector_node(&self, s: &mut Sel, sel: &SelLike, inherited: &[String], inherited_cond: &[String]) {
        let nodes = self.nodes_of(s, sel);
        let compounds = Self::compounds(s, &nodes);
        let last = compounds.len() - 1;
        for (i, c) in compounds.iter().enumerate() {
            if i == last {
                self.migrate_compound(s, c, inherited, inherited_cond);
            } else {
                self.migrate_compound(s, c, &[], &[]);
            }
        }
    }

    fn nesting_ctx_sel(&self, s: &Sel, sel: &SelLike) -> (bool, bool) {
        let nodes = self.nodes_of(s, sel);
        let compounds = Self::compounds(s, &nodes);
        self.nesting_ctx(s, compounds.last().map(|v| v.as_slice()).unwrap_or(&[]))
    }

    fn nesting_ctx(&self, s: &Sel, nodes: &[usize]) -> (bool, bool) {
        let mut guaranteed = nodes.iter().any(|&n| s.ty(n) == SType::Nesting);
        let mut possible = guaranteed;
        for &node in nodes {
            let (positive, sels) = match Self::pseudo_branches(s, node) {
                Some(x) => x,
                None => continue,
            };
            let branches: Vec<(bool, bool)> = sels.iter().map(|b| self.nesting_ctx_sel(s, b)).collect();
            if branches.is_empty() {
                continue;
            }
            if positive && branches.iter().all(|b| b.0) {
                guaranteed = true;
            }
            if branches.iter().any(|b| b.1) {
                possible = true;
            }
        }
        (guaranteed, possible)
    }

    /// `migrateSelectorTextWithContext`
    /// A selector whose target is an inherited `Object.prototype` member makes
    /// the JS `for (const rule of DYNAMIC_AXES[target] ?? [])` throw; the
    /// selector then counts as one the parser could not migrate.
    pub fn migrate_text_ctx(&self, text: &str, parent: &Ctx) -> Result<(String, Ctx), crate::commands::upgrade::css::ProcessError> {
        PROTO_THREW.with(|f| f.set(false));
        let r = self.migrate_text_ctx_inner(text, parent);
        if PROTO_THREW.with(|f| f.get()) {
            return Err(crate::commands::upgrade::css::ProcessError::Other("DYNAMIC_AXES[target] is not iterable".into()));
        }
        r
    }

    fn migrate_text_ctx_inner(&self, text: &str, parent: &Ctx) -> Result<(String, Ctx), crate::commands::upgrade::css::ProcessError> {
        let mut ctx = Ctx::default();
        let out = process_selector(text, &mut |s| {
            let mut branch_ctx: Vec<Ctx> = vec![];
            let root = s.root;
            s.each(root, &mut |s, sel| {
                let (ng, np) = self.nesting_ctx_sel(s, &SelLike::Real(sel));
                let inh: Vec<String> = if ng { parent.guaranteed.clone() } else { vec![] };
                let inh_c: Vec<String> = if ng {
                    parent.possible.iter().filter(|t| !parent.guaranteed.contains(t)).cloned().collect()
                } else if np {
                    parent.possible.clone()
                } else {
                    vec![]
                };
                self.migrate_selector_node(s, &SelLike::Real(sel), &inh, &inh_c);
                let own = self.subject_target_context(s, &SelLike::Real(sel));
                branch_ctx.push(Ctx {
                    guaranteed: uniq(own.guaranteed.into_iter().chain(if ng { parent.guaranteed.clone() } else { vec![] }).collect()),
                    possible: uniq(own.possible.into_iter().chain(if np { parent.possible.clone() } else { vec![] }).collect()),
                });
                true
            });
            ctx = combine(&branch_ctx);
            Ok(())
        })?;
        Ok((out, ctx))
    }
}

fn combine(c: &[Ctx]) -> Ctx {
    if c.is_empty() {
        return Ctx::default();
    }
    let g = c[0].guaranteed.iter().filter(|t| c.iter().all(|x| x.guaranteed.contains(t))).cloned().collect();
    Ctx { guaranteed: g, possible: uniq(c.iter().flat_map(|x| x.possible.clone()).collect()) }
}

/// The outer-parenthesized selector groups of an `@scope` prelude, each
/// passed through `finish(group, groupStartUtf16)`.
pub fn map_scope_params<E>(params: &str, finish: &mut dyn FnMut(&str, usize) -> Result<String, E>) -> Result<String, E> {
    let mut result = String::new();
    let mut last = 0;
    let mut depth = 0;
    let mut group_start: Option<usize> = None;
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for (i, ch) in params.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if let Some(q) = quote {
            if ch == q {
                quote = None;
            }
            continue;
        }
        if ch == '"' || ch == '\'' {
            quote = Some(ch);
            continue;
        }
        if ch == '(' {
            if depth == 0 {
                result.push_str(&params[last..i + 1]);
                group_start = Some(i + 1);
            }
            depth += 1;
            continue;
        }
        if ch == ')' && depth > 0 {
            depth -= 1;
            if depth == 0 {
                if let Some(gs) = group_start {
                    let u16_start = params[..gs].encode_utf16().count();
                    result.push_str(&finish(&params[gs..i], u16_start)?);
                    result.push(')');
                    last = i + 1;
                    group_start = None;
                }
            }
        }
    }
    result.push_str(&params[last..]);
    Ok(result)
}

/// `migrateAstryxThemeSelectors(source, from, data)`.
thread_local! {
    static PROTO_THREW: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

pub fn migrate_astryx_theme_selectors(source: &str, from: &str, data: &SelectorData) -> Result<String, CodemodError> {
    let mut root = postcss::parse(source, Some(from)).map_err(css_parse_error)?;
    let m = M { d: data };
    let mut existing: Vec<String> = vec![];
    root.walk_kind(Kind::Comment, &mut |c, id| existing.push(postcss::js_trim(&c.nodes[id].text).to_string()));
    let add_parse_todo = |c: &mut Css, node: usize, original: &str, existing: &mut Vec<String>| {
        let text = format!("TODO(astryx upgrade): verify selector {}; the CSS selector parser could not migrate it safely.", original);
        if !existing.contains(&text) {
            let cm = c.new_comment(&text);
            c.insert_before(node, cm);
            existing.push(text);
        }
    };
    let mut ctxs: HashMap<usize, Ctx> = HashMap::new();
    root.walk_kind(Kind::Rule, &mut |c, rule| {
        let original = c.nodes[rule].selector.clone();
        let mut parent = c.nodes[rule].parent;
        while let Some(p) = parent {
            if matches!(c.nodes[p].kind, Kind::Rule | Kind::Root) {
                break;
            }
            parent = c.nodes[p].parent;
        }
        let pctx = match parent {
            Some(p) if c.nodes[p].kind == Kind::Rule => ctxs.get(&p).cloned().unwrap_or_default(),
            _ => Ctx::default(),
        };
        match m.migrate_text_ctx(&original, &pctx) {
            Ok((text, ctx)) => {
                c.nodes[rule].selector = text;
                ctxs.insert(rule, ctx);
            }
            Err(_) => {
                ctxs.insert(rule, Ctx::default());
                add_parse_todo(c, rule, &original, &mut existing);
            }
        }
    });
    root.walk_at_rules("scope", &mut |c, at| {
        let original = c.nodes[at].params.clone();
        let r = map_scope_params(&original, &mut |g, _| m.migrate_text_ctx(g, &Ctx::default()).map(|x| x.0));
        match r {
            Ok(p) => c.nodes[at].params = p,
            Err(_) => add_parse_todo(c, at, &format!("@scope {}", original), &mut existing),
        }
    });
    Ok(root.to_string())
}

pub fn extname_lower(path: &str) -> String {
    let base = path.rsplit('/').next().unwrap_or(path);
    match base.rfind('.') {
        Some(i) if i > 0 => base[i..].to_lowercase(),
        _ => String::new(),
    }
}

pub fn migrate_theme_selectors_to_data_attrs(source: &str, path: &str, _o: &Value) -> TResult {
    if extname_lower(path) != ".css" {
        return Ok(None);
    }
    let r = migrate_astryx_theme_selectors(source, path, v054_data())?;
    Ok(if r == source { None } else { Some(r) })
}
