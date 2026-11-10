//! `api/theme/build/core-interception.mjs`: what a recorded `defineTheme`
//! lineage tells the build — every raw input a theme came from, the members
//! nobody observed, and the generative axes an old Core does not keep — plus
//! build.mjs `assertAdaptationCapability`.

use super::build_impl::{as_obj, err, is_undef, ApiError, FamilyLoad};
use super::nodepath;
use crate::js::live::LiveSession;
use crate::json::{Map, Value};
use boa_engine::{JsObject, JsValue};
use std::path::Path;

fn undef_marker() -> Value {
    let mut m = Map::new();
    m.insert("__js".into(), Value::String("undefined".into()));
    Value::Object(m)
}

fn contains(list: &[JsObject], o: &JsObject) -> bool {
    list.iter().any(|x| JsObject::equals(x, o))
}

/// The `[input, result]` pair recorded for `value`, if any.
fn lineage_for(s: &mut LiveSession, rec: &FamilyLoad, value: &JsObject) -> Option<JsObject> {
    let len = {
        let l = s.get(&rec.log, "length");
        s.string(&l).parse::<usize>().unwrap_or(0)
    };
    let v: JsValue = value.clone().into();
    for i in 0..len {
        let pair = s.get(&rec.log, &i.to_string());
        if let Some(p) = pair.as_object() {
            if s.get(&p, "1").strict_equals(&v) {
                return Some(p.clone());
            }
        }
    }
    s.get_symbol_for(value, "astryx.theme.lineage").as_object().map(|o| o.clone())
}

fn input_of(s: &mut LiveSession, pair: &JsObject) -> Option<JsObject> {
    s.get(pair, "0").as_object().map(|o| o.clone())
}

/// `lineageOf(theme)`.
pub fn lineage_of(s: &mut LiveSession, rec: &FamilyLoad, theme: &JsValue) -> Vec<JsObject> {
    let mut out: Vec<JsObject> = Vec::new();
    let mut queue: Vec<JsValue> = vec![theme.clone()];
    while let Some(v) = queue.pop() {
        let Some(o) = v.as_object().filter(|o| !o.is_callable()).map(|o| o.clone()) else { continue };
        if contains(&out, &o) {
            continue;
        }
        out.push(o.clone());
        if let Some(pair) = lineage_for(s, rec, &o) {
            if let Some(input) = input_of(s, &pair) {
                queue.push(input.into());
            }
        }
        let ext = s.get(&o, "extends");
        if ext.to_boolean() {
            queue.push(ext);
        }
    }
    out
}

/// `unobservedIn(theme)`.
pub fn unobserved_in(s: &mut LiveSession, rec: &FamilyLoad, theme: &JsValue) -> Vec<JsObject> {
    let lineage = lineage_of(s, rec, theme);
    let mut observed_inputs: Vec<JsObject> = Vec::new();
    for v in &lineage {
        if let Some(pair) = lineage_for(s, rec, v) {
            if let Some(i) = input_of(s, &pair) {
                observed_inputs.push(i);
            }
        }
    }
    lineage
        .into_iter()
        .filter(|v| {
            let observed = lineage_for(s, rec, v).is_some();
            let none = |s: &mut LiveSession, k: &str| s.get(v, k).is_undefined();
            !observed && !contains(&observed_inputs, v) && none(s, "adaptations") && none(s, "__adaptations") && none(s, "__adaptationRules")
        })
        .collect()
}

fn merge_role(root: Option<Value>, next: Option<Value>) -> Option<Value> {
    match (root, next) {
        (None, n) => n,
        (r, None) => r,
        (Some(r), Some(n)) => {
            let mut m = as_obj(Some(&r)).cloned().unwrap_or_default();
            for (k, v) in as_obj(Some(&n)).cloned().unwrap_or_default() {
                m.insert(k, v);
            }
            let rw = r.get("weights").filter(|v| crate::commands::theme_build::build_impl::truthy(Some(v)));
            let nw = n.get("weights").filter(|v| crate::commands::theme_build::build_impl::truthy(Some(v)));
            let weights = if rw.is_some() || nw.is_some() {
                let mut w = rw.and_then(|v| as_obj(Some(v)).cloned()).unwrap_or_default();
                for (k, v) in nw.and_then(|v| as_obj(Some(v)).cloned()).unwrap_or_default() {
                    w.insert(k, v);
                }
                Value::Object(w)
            } else {
                undef_marker()
            };
            m.insert("weights".into(), weights);
            Some(Value::Object(m))
        }
    }
}

fn get(v: Option<&Value>, k: &str) -> Option<Value> {
    v.and_then(|x| x.get(k)).filter(|x| !is_undef(Some(x)) && !x.is_null()).cloned()
}

fn set_undef(m: &mut Map<String, Value>, k: &str, v: Option<Value>) {
    m.insert(k.into(), v.unwrap_or_else(undef_marker));
}

/// `mergeGenerativeAxes(inherited, own)`.
fn merge_axes(inherited: Option<&Value>, own: &Map<String, Value>) -> Value {
    let own_v = Value::Object(own.clone());
    let it = get(inherited, "typography");
    let ot = get(Some(&own_v), "typography");
    let resolve_family = |ir: Option<Value>, or: Option<Value>, follows_body: bool| -> Option<Value> {
        let merged = merge_role(ir.clone(), or.clone())?;
        let mut m = as_obj(Some(&merged)).cloned().unwrap_or_default();
        if crate::commands::theme_build::build_impl::truthy(or.as_ref().and_then(|o| o.get("family"))) {
            set_undef(&mut m, "family", get(or.as_ref(), "family"));
            set_undef(&mut m, "fallbacks", get(or.as_ref(), "fallbacks"));
        } else if follows_body {
            set_undef(&mut m, "family", None);
            set_undef(&mut m, "fallbacks", None);
        } else {
            set_undef(&mut m, "family", get(ir.as_ref(), "family"));
            set_undef(&mut m, "fallbacks", get(ir.as_ref(), "fallbacks"));
        }
        Some(Value::Object(m))
    };
    let truthy = |v: Option<&Value>| crate::commands::theme_build::build_impl::truthy(v);
    let body = resolve_family(get(it.as_ref(), "body"), get(ot.as_ref(), "body"), false);
    let follows = truthy(ot.as_ref().and_then(|t| t.get("body")).and_then(|b| b.get("family")))
        && !truthy(ot.as_ref().and_then(|t| t.get("heading")).and_then(|b| b.get("family")));
    let heading = resolve_family(get(it.as_ref(), "heading"), get(ot.as_ref(), "heading"), follows);
    let code = resolve_family(get(it.as_ref(), "code"), get(ot.as_ref(), "code"), false);
    let weight_owner = if truthy(ot.as_ref().and_then(|t| t.get("scale"))) {
        ot.clone()
    } else if truthy(it.as_ref().and_then(|t| t.get("scale"))) {
        it.clone()
    } else {
        None
    };
    let apply = |role: Option<Value>, owner: Option<Value>| -> Option<Value> {
        let r = role?;
        let mut m = as_obj(Some(&r)).cloned().unwrap_or_default();
        set_undef(&mut m, "weight", get(owner.as_ref(), "weight"));
        set_undef(&mut m, "weights", get(owner.as_ref(), "weights"));
        Some(Value::Object(m))
    };
    let body = apply(body, get(weight_owner.as_ref(), "body"));
    let heading = apply(heading, get(weight_owner.as_ref(), "heading"));
    let code = apply(code, get(weight_owner.as_ref(), "code"));
    let mut out = Map::new();
    if it.is_some() || ot.is_some() {
        let mut t = it.as_ref().and_then(|v| as_obj(Some(v)).cloned()).unwrap_or_default();
        for (k, v) in ot.as_ref().and_then(|v| as_obj(Some(v)).cloned()).unwrap_or_default() {
            t.insert(k, v);
        }
        set_undef(&mut t, "scale", get(ot.as_ref(), "scale").or_else(|| get(it.as_ref(), "scale")));
        set_undef(&mut t, "body", body);
        set_undef(&mut t, "heading", heading);
        set_undef(&mut t, "code", code);
        out.insert("typography".into(), Value::Object(t));
    }
    if let Some(c) = get(Some(&own_v), "color").or_else(|| get(inherited, "color")) {
        out.insert("color".into(), c);
    }
    for k in ["radius", "motion"] {
        let v = match get(Some(&own_v), k) {
            Some(o) => {
                let mut m = get(inherited, k).and_then(|v| as_obj(Some(&v)).cloned()).unwrap_or_default();
                for (kk, vv) in as_obj(Some(&o)).cloned().unwrap_or_default() {
                    m.insert(kk, vv);
                }
                Some(Value::Object(m))
            }
            None => get(inherited, k),
        };
        if let Some(v) = v {
            out.insert(k.into(), v);
        }
    }
    Value::Object(out)
}

/// `capturedAxesOf(theme)` (converted values; `None` = undefined).
pub fn captured_axes_of(s: &mut LiveSession, rec: &FamilyLoad, theme: &JsValue) -> Option<Value> {
    fn visit(s: &mut LiveSession, rec: &FamilyLoad, v: &JsValue, seen: &mut Vec<JsObject>) -> Option<Value> {
        let o = v.as_object().filter(|o| !o.is_callable())?.clone();
        if contains(seen, &o) {
            return None;
        }
        seen.push(o.clone());
        let axes = s.get(&o, "__axes");
        if !axes.is_undefined() {
            return match axes.as_object() {
                Some(a) if !a.is_array() && !a.is_callable() => s.to_value(&axes).ok(),
                _ => None,
            };
        }
        let input = lineage_for(s, rec, &o).and_then(|p| input_of(s, &p)).unwrap_or(o.clone());
        let ext = s.get(&input, "extends");
        let inherited = visit(s, rec, &ext, seen);
        let mut own = Map::new();
        for k in ["typography", "color", "radius", "motion"] {
            let v = s.get(&input, k);
            if !v.is_undefined() {
                if let Ok(c) = s.to_value(&v) {
                    own.insert(k.into(), c);
                }
            }
        }
        if inherited.is_none() && own.is_empty() {
            return None;
        }
        Some(merge_axes(inherited.as_ref(), &own))
    }
    visit(s, rec, theme, &mut Vec::new())
}

// ---------------------------------------------------------------------------

const WIDTH_NAMES: [&str; 5] = ["sm", "md", "lg", "xl", "2xl"];
const WIDTH_DEFAULTS: [f64; 5] = [640.0, 768.0, 1024.0, 1280.0, 1536.0];

fn num(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Number(n)) => n.as_f64(),
        _ => None,
    }
}

fn malformed_width(w: &Value) -> bool {
    let Some(m) = as_obj(Some(w)) else { return true };
    if m.keys().any(|k| !WIDTH_NAMES.contains(&k.as_str())) {
        return true;
    }
    for (_, v) in m {
        match num(Some(v)) {
            Some(n) if n.is_finite() && n > 0.0 => {}
            _ => return true,
        }
    }
    let eff: Vec<f64> = WIDTH_NAMES.iter().enumerate().map(|(i, n)| num(m.get(*n)).unwrap_or(WIDTH_DEFAULTS[i])).collect();
    (1..5).any(|i| eff[i] <= eff[i - 1])
}

fn custom_width(w: &Value) -> bool {
    let Some(m) = as_obj(Some(w)) else { return false };
    if m.is_empty() {
        return false;
    }
    if m.iter().any(|(k, v)| {
        let d = WIDTH_NAMES.iter().position(|n| n == k).map(|i| WIDTH_DEFAULTS[i]);
        num(Some(v)) != d
    }) {
        return true;
    }
    m.len() != 5
}

fn metadata_intent(a: Option<&Value>) -> bool {
    let Some(a) = a.filter(|v| !is_undef(Some(v))) else { return false };
    let Some(m) = as_obj(Some(a)) else { return true };
    if m.keys().any(|k| k != "widthBreakpoints" && k != "rules") {
        return true;
    }
    if let Some(r) = m.get("rules").filter(|v| !is_undef(Some(v))) {
        match r {
            Value::Array(list) if list.is_empty() => {}
            _ => return true,
        }
    }
    if let Some(w) = m.get("widthBreakpoints").filter(|v| !is_undef(Some(v))) {
        if malformed_width(w) || custom_width(w) {
            return true;
        }
    }
    false
}

/// `hasAdaptationIntent(themeDef)`.
pub fn has_adaptation_intent(t: &Value) -> bool {
    if as_obj(Some(t)).is_none() {
        return false;
    }
    if let Some(r) = t.get("__adaptationRules").filter(|v| !is_undef(Some(v))) {
        match r {
            Value::Array(list) if list.is_empty() => {}
            _ => return true,
        }
    }
    metadata_intent(t.get("adaptations")) || metadata_intent(t.get("__adaptations"))
}

pub struct Degradation {
    pub top_level_await: bool,
    pub common_js: bool,
}

/// `assertAdaptationCapability`.
pub fn assert_capability(core_version: &str, candidates: &[Value], unobserved_names: &[Option<String>], d: &Degradation) -> Result<(), ApiError> {
    let installed = if !core_version.is_empty() && core_version != "unknown" {
        format!("@astryxdesign/core@{core_version}")
    } else {
        "the installed @astryxdesign/core".to_string()
    };
    if candidates.iter().any(has_adaptation_intent) {
        return Err(err(
            format!("This theme declares ordered adaptations, but {installed} does not export `generateAdaptationCSS` from @astryxdesign/core/theme, so its adaptation rules cannot be compiled. Building without them would silently drop every adaptation rule from the generated CSS. Upgrade @astryxdesign/core to a version that supports theme adaptations, or remove `adaptations` from this theme."),
            "ERR_CORE_INCOMPATIBLE",
        ));
    }
    if unobserved_names.is_empty() {
        return Ok(());
    }
    let named: Vec<String> = unobserved_names.iter().flatten().map(|n| format!("\"{n}\"")).collect();
    let mut gaps: Vec<&str> = Vec::new();
    if d.top_level_await {
        gaps.push("top-level await forced the fallback loader for installed packages");
    }
    if d.common_js {
        gaps.push("a CommonJS source dependency reached a frozen or non-configurable core namespace");
    }
    Err(err(
        format!(
            "{installed} cannot compile ordered adaptations, and whether {} uses adaptations could not be observed{}. This core erases adaptations while resolving, so building could emit CSS with adaptation rules silently missing. Upgrade @astryxdesign/core to a version that supports theme adaptations, or use a built theme artifact that retains adaptation metadata.",
            if named.is_empty() { "part of this theme".to_string() } else { named.join(", ") },
            if gaps.is_empty() { String::new() } else { format!(" because {}", gaps.join(" and ")) }
        ),
        "ERR_CORE_INCOMPATIBLE",
    ))
}

/// Whether `patchCommonJs` could wrap every CommonJS-reachable Core entry:
/// an ESM-only Core reached through `require` is a frozen namespace.
pub fn common_js_covered(file: &str) -> bool {
    let dir = nodepath::dirname(file);
    let Some(core) = crate::discovery::paths::find_installed_package(&dir, "@astryxdesign/core", usize::MAX) else {
        return true;
    };
    let Ok(text) = std::fs::read_to_string(Path::new(&core).join("package.json")) else { return true };
    let Ok(pkg) = crate::js::jsonparse::parse(&text) else { return true };
    let entry = match pkg.get("exports") {
        Some(Value::Object(m)) if m.keys().any(|k| k.starts_with('.')) => m.get("./theme").cloned(),
        _ => None,
    };
    let target = entry.and_then(|e| {
        fn pick(v: &Value) -> Option<String> {
            match v {
                Value::String(s) => Some(s.clone()),
                Value::Object(m) => m.iter().filter(|(c, _)| matches!(c.as_str(), "node" | "require" | "default")).find_map(|(_, t)| pick(t)),
                _ => None,
            }
        }
        pick(&e)
    });
    let Some(target) = target else { return true };
    let is_esm = target.ends_with(".mjs") || (target.ends_with(".js") && pkg.get("type").and_then(|t| t.as_str()) == Some("module"));
    !is_esm
}

/// Whether a module (or a relative module it imports) awaits at its top
/// level, which sends jiti to its asynchronous loader.
pub fn has_top_level_await(file: &str) -> bool {
    fn scan(file: &str, seen: &mut Vec<String>) -> bool {
        if seen.iter().any(|s| s == file) || seen.len() > 200 {
            return false;
        }
        seen.push(file.to_string());
        let Ok(src) = std::fs::read_to_string(file) else { return false };
        use oxc::allocator::Allocator;
        use oxc::ast::ast::*;
        use oxc::ast_visit::{walk, Visit};
        let alloc = Allocator::default();
        let st = oxc::span::SourceType::from_path(file).unwrap_or_else(|_| oxc::span::SourceType::tsx()).with_module(true);
        let ret = oxc::parser::Parser::new(&alloc, &src, st).parse();
        struct V {
            depth: usize,
            found: bool,
            deps: Vec<String>,
        }
        impl<'a> Visit<'a> for V {
            fn visit_function(&mut self, f: &Function<'a>, flags: oxc::syntax::scope::ScopeFlags) {
                self.depth += 1;
                walk::walk_function(self, f, flags);
                self.depth -= 1;
            }
            fn visit_arrow_function_expression(&mut self, f: &ArrowFunctionExpression<'a>) {
                self.depth += 1;
                walk::walk_arrow_function_expression(self, f);
                self.depth -= 1;
            }
            fn visit_await_expression(&mut self, e: &AwaitExpression<'a>) {
                if self.depth == 0 {
                    self.found = true;
                }
                walk::walk_await_expression(self, e);
            }
            fn visit_for_of_statement(&mut self, s: &ForOfStatement<'a>) {
                if s.r#await && self.depth == 0 {
                    self.found = true;
                }
                walk::walk_for_of_statement(self, s);
            }
            fn visit_import_declaration(&mut self, d: &ImportDeclaration<'a>) {
                if let Some(v) = d.source.value.as_str() {
                    self.deps.push(v.to_string());
                }
            }
        }
        let mut v = V { depth: 0, found: false, deps: vec![] };
        v.visit_program(&ret.program);
        if v.found {
            return true;
        }
        for d in v.deps {
            if !d.starts_with('.') {
                continue;
            }
            let base = nodepath::resolve(&nodepath::dirname(file), &[&d]);
            let cand = std::iter::once(base.clone())
                .chain([".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js"].iter().map(|e| format!("{base}{e}")))
                .find(|c| Path::new(c).is_file());
            if let Some(c) = cand {
                if scan(&c, seen) {
                    return true;
                }
            }
        }
        false
    }
    scan(file, &mut Vec::new())
}
