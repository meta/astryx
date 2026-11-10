//! Port of `api/theme/palette/generate/generator.mjs`.
//!
//! The request arrives as parsed JSON, so every check follows the JS code's
//! own coercions: `??` treats a missing key (undefined) and `null` alike,
//! `String(x)` spells values as JS does, and `includes` compares strictly.

use super::color::*;
use crate::json::{self, Map, Value};
use indexmap::IndexMap;

pub const PALETTE_RECIPE: &str = "astryx-oklch-v1";
pub const PALETTE_GENERATOR_VERSION: &str = "palette-generator-v1";
pub const PALETTE_BLACK: &str = "#000000";
pub const PALETTE_WHITE: &str = "#ffffff";
const DEFAULT_21_STOPS: [f64; 21] =
    [0.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0, 55.0, 60.0, 65.0, 70.0, 75.0, 80.0, 85.0, 90.0, 95.0, 100.0];
const DARK_CHROMA_FACTOR: f64 = 0.85;
const NEUTRAL_PROFILES: [&str; 4] = ["neutral-v1", "warm-v1", "cool-v1", "custom"];

/// JS `String(v)`, with `None` as `undefined`.
pub fn js_str(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(v) => crate::cli::format::js_string(v),
    }
}

fn nullish(v: Option<&Value>) -> bool {
    matches!(v, None | Some(Value::Null))
}

fn num_of(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Number(n)) => n.as_f64(),
        _ => None,
    }
}

fn is_finite_number(v: Option<&Value>) -> bool {
    num_of(v).map(|n| n.is_finite()).unwrap_or(false)
}

fn str_of(v: Option<&Value>) -> Option<&str> {
    match v {
        Some(Value::String(s)) => Some(s.as_str()),
        _ => None,
    }
}

fn is_plain_object(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::Object(_)))
}

fn key(stop: f64) -> String {
    json::js_number_to_string(stop)
}

#[derive(Clone, Debug)]
pub struct Anchor {
    pub mode: String,
    pub stop: f64,
    pub color: String,
    pub policy: String,
    pub max_delta_e: Option<f64>,
}

impl Anchor {
    fn to_json(&self) -> Map<String, Value> {
        let mut m = Map::new();
        m.insert("mode".into(), Value::String(self.mode.clone()));
        m.insert("stop".into(), json::num(self.stop));
        m.insert("color".into(), Value::String(self.color.clone()));
        m.insert("policy".into(), Value::String(self.policy.clone()));
        if self.policy == "bounded" {
            m.insert("maxDeltaE".into(), json::num(self.max_delta_e.unwrap_or(0.0)));
        }
        m
    }
}

#[derive(Clone, Debug)]
pub struct Family {
    pub id: String,
    pub name: String,
    pub seed: String,
    pub kind: String,
    pub anchors: Vec<Anchor>,
}

#[derive(Clone, Debug)]
pub struct Request {
    pub vibrancy: f64,
    pub neutral_profile: String,
    pub mode_strategy: String,
    pub stops: Vec<f64>,
    pub families: Vec<Family>,
}

impl Request {
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("recipe".into(), Value::String(PALETTE_RECIPE.into()));
        m.insert("vibrancy".into(), json::num(self.vibrancy));
        m.insert("neutralProfile".into(), Value::String(self.neutral_profile.clone()));
        m.insert("modeStrategy".into(), Value::String(self.mode_strategy.clone()));
        m.insert("stops".into(), Value::Array(self.stops.iter().map(|s| json::num(*s)).collect()));
        let fams = self
            .families
            .iter()
            .map(|f| {
                let mut fm = Map::new();
                fm.insert("id".into(), Value::String(f.id.clone()));
                fm.insert("name".into(), Value::String(f.name.clone()));
                fm.insert("seed".into(), Value::String(f.seed.clone()));
                fm.insert("kind".into(), Value::String(f.kind.clone()));
                fm.insert("anchors".into(), Value::Array(f.anchors.iter().map(|a| Value::Object(a.to_json())).collect()));
                Value::Object(fm)
            })
            .collect();
        m.insert("families".into(), Value::Array(fams));
        Value::Object(m)
    }
}

#[derive(Clone, Debug)]
pub struct AnchorResult {
    pub anchor: Anchor,
    pub generated_color: String,
    pub delta_e: f64,
}

#[derive(Clone, Debug)]
pub struct Diagnostics {
    pub monotonic: bool,
    pub minimum_adjacent_delta_e: f64,
    pub maximum_adjacent_delta_e: f64,
    pub maximum_hue_drift: f64,
    pub hue_identity_risk: Option<&'static str>,
    pub gamut_mapped_stops: Vec<f64>,
    pub anchors: Vec<AnchorResult>,
}

impl Diagnostics {
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("monotonic".into(), Value::Bool(self.monotonic));
        m.insert("minimumAdjacentDeltaE".into(), json::num(self.minimum_adjacent_delta_e));
        m.insert("maximumAdjacentDeltaE".into(), json::num(self.maximum_adjacent_delta_e));
        m.insert("maximumHueDrift".into(), json::num(self.maximum_hue_drift));
        m.insert("hueIdentityRisk".into(), self.hue_identity_risk.map(|s| Value::String(s.into())).unwrap_or(Value::Null));
        m.insert("gamutMappedStops".into(), Value::Array(self.gamut_mapped_stops.iter().map(|s| json::num(*s)).collect()));
        let anchors = self
            .anchors
            .iter()
            .map(|a| {
                let mut am = a.anchor.to_json();
                am.insert("generatedColor".into(), Value::String(a.generated_color.clone()));
                am.insert("deltaE".into(), json::num(a.delta_e));
                Value::Object(am)
            })
            .collect();
        m.insert("anchors".into(), Value::Array(anchors));
        Value::Object(m)
    }
}

/// A ramp: colors keyed by `String(stop)` in JS object key order once
/// serialized.
#[derive(Clone, Debug)]
pub struct Ramp {
    pub colors: IndexMap<String, String>,
    pub diagnostics: Diagnostics,
}

pub fn colors_json(colors: &IndexMap<String, String>) -> Value {
    let m: Map<String, Value> = colors.iter().map(|(k, v)| (k.clone(), Value::String(v.clone()))).collect();
    Value::Object(json::js_key_order(m))
}

#[derive(Clone, Debug)]
pub struct GeneratedFamily {
    pub id: String,
    pub name: String,
    pub light: Option<Ramp>,
    pub dark: Option<Ramp>,
}

impl GeneratedFamily {
    fn ramp(&self, mode: &str) -> Option<&Ramp> {
        if mode == "light" {
            self.light.as_ref()
        } else {
            self.dark.as_ref()
        }
    }
}

#[derive(Clone, Debug)]
pub struct Coordination {
    pub mode: String,
    pub stop: f64,
    pub closest: Option<(String, String)>,
    pub minimum_family_delta_e: Option<f64>,
    pub strongest: Option<String>,
    pub weakest: Option<String>,
    pub chroma_ratio: Option<f64>,
}

impl Coordination {
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("mode".into(), Value::String(self.mode.clone()));
        m.insert("stop".into(), json::num(self.stop));
        m.insert(
            "closestFamilies".into(),
            match &self.closest {
                Some((a, b)) => Value::Array(vec![Value::String(a.clone()), Value::String(b.clone())]),
                None => Value::Null,
            },
        );
        m.insert("minimumFamilyDeltaE".into(), self.minimum_family_delta_e.map(json::num).unwrap_or(Value::Null));
        m.insert("strongestFamily".into(), self.strongest.clone().map(Value::String).unwrap_or(Value::Null));
        m.insert("weakestFamily".into(), self.weakest.clone().map(Value::String).unwrap_or(Value::Null));
        m.insert("chromaRatio".into(), self.chroma_ratio.map(json::num).unwrap_or(Value::Null));
        Value::Object(m)
    }
}

pub struct GenerationResult {
    pub request: Request,
    pub families: Vec<GeneratedFamily>,
    pub coordination: Vec<Coordination>,
    pub errors: Vec<(String, String)>,
}

fn clamp(v: f64, lo: f64, hi: f64) -> f64 {
    js_min(hi, js_max(lo, v))
}

fn normalize_hue(h: f64) -> f64 {
    js_rem(js_rem(h, 360.0) + 360.0, 360.0)
}

fn hue_distance(a: f64, b: f64) -> f64 {
    let d = (normalize_hue(a) - normalize_hue(b)).abs();
    js_min(d, 360.0 - d)
}

fn signed_hue_delta(from: f64, to: f64) -> f64 {
    js_rem(normalize_hue(to) - normalize_hue(from) + 540.0, 360.0) - 180.0
}

fn interpolate_hue(a: f64, b: f64, amount: f64) -> f64 {
    let delta = js_rem(b - a + 540.0, 360.0) - 180.0;
    normalize_hue(a + delta * amount)
}

fn validate_stops(stops: Option<&Value>) -> Result<Vec<f64>, String> {
    let arr = match stops {
        Some(Value::Array(a)) if !a.is_empty() => a,
        _ => return Err("A palette requires at least one stop.".into()),
    };
    let mut out = Vec::new();
    for s in arr {
        match num_of(Some(s)) {
            Some(n) if n.is_finite() && n >= 0.0 && n <= 100.0 => out.push(n),
            _ => return Err(format!("Stop {} must be a finite number from 0 to 100.", js_str(Some(s)))),
        }
    }
    for i in 1..out.len() {
        if out[i] <= out[i - 1] {
            return Err("Stops must be unique and strictly increasing.".into());
        }
    }
    Ok(out)
}

fn modes_for_strategy(strategy: Option<&Value>) -> Result<Vec<&'static str>, String> {
    match str_of(strategy) {
        Some("light-only") => Ok(vec!["light"]),
        Some("dark-only") => Ok(vec!["dark"]),
        Some("light-and-dark") => Ok(vec!["light", "dark"]),
        _ => Err(format!("Unknown mode strategy: {}", js_str(strategy))),
    }
}

fn modes_of(strategy: &str) -> Vec<&'static str> {
    modes_for_strategy(Some(&Value::String(strategy.into()))).unwrap_or_default()
}

fn hue_balance_factor(hue: f64) -> f64 {
    let n = normalize_hue(hue);
    if (70.0..115.0).contains(&n) {
        0.94
    } else if (115.0..175.0).contains(&n) {
        0.78
    } else if (175.0..230.0).contains(&n) {
        0.82
    } else if (285.0..340.0).contains(&n) {
        0.9
    } else {
        1.0
    }
}

fn smoothstep(amount: f64) -> f64 {
    let v = clamp(amount, 0.0, 1.0);
    v * v * (3.0 - 2.0 * v)
}

fn high_tone_chroma_factor(hue: f64, tone: f64) -> f64 {
    if tone <= 60.0 {
        return 1.0;
    }
    let taper = smoothstep((tone - 60.0) / 35.0);
    let n = normalize_hue(hue);
    if (115.0..175.0).contains(&n) {
        return 1.0 - 0.28 * taper;
    }
    if (175.0..200.0).contains(&n) {
        return 1.0 - 0.4 * taper;
    }
    1.0
}

fn tone_adjusted_hue(hue: f64, tone: f64) -> f64 {
    let n = normalize_hue(hue);
    if n < 40.0 || n >= 70.0 || tone >= 50.0 {
        return n;
    }
    let darkening = clamp((50.0 - tone) / 40.0, 0.0, 1.0);
    normalize_hue(n - 8.0 * darkening.sqrt())
}

fn tone_chroma_envelope(tone: f64) -> f64 {
    let n = clamp(tone / 100.0, 0.0, 1.0);
    0.18 + 0.82 * js_max(0.0, crate::js::jsmath::sin(std::f64::consts::PI * n)).sqrt()
}

fn vibrancy_multiplier(v: f64) -> Result<f64, String> {
    if !v.is_finite() || v < 0.0 || v > 100.0 {
        return Err("Vibrancy must be a number from 0 to 100.".into());
    }
    Ok(if v <= 25.0 {
        (v / 25.0) * 0.72
    } else if v <= 50.0 {
        0.72 + ((v - 25.0) / 25.0) * 0.28
    } else {
        1.0 + (v - 50.0) * 0.0096
    })
}

fn coordinated_chroma(c: f64) -> f64 {
    c * 0.35 + 0.18 * 0.65
}

#[derive(Clone, Copy)]
struct Polar {
    lightness: f64,
    chroma: f64,
    hue: f64,
}

fn color_to_polar(c: &str) -> Polar {
    let v = hex_to_oklch(c);
    Polar { lightness: v.l, chroma: v.c, hue: v.h }
}

fn neutral_polar(profile: &str, seed: &str) -> Result<Polar, String> {
    if profile == "custom" {
        return Ok(color_to_polar(seed));
    }
    let hue = if profile == "warm-v1" {
        75.0
    } else if profile == "cool-v1" {
        250.0
    } else {
        0.0
    };
    if !["neutral-v1", "warm-v1", "cool-v1"].contains(&profile) {
        return Err(format!("Unknown neutral profile: {profile}"));
    }
    Ok(Polar { lightness: 0.5, chroma: if profile == "neutral-v1" { 0.0 } else { 0.018 }, hue })
}

fn sort_by_stop(anchors: &[Anchor]) -> Vec<Anchor> {
    let mut v = anchors.to_vec();
    v.sort_by(|a, b| js_cmp(a.stop - b.stop));
    v
}

/// Comparator result as `Array#sort` reads it.
fn js_cmp(d: f64) -> std::cmp::Ordering {
    if d < 0.0 {
        std::cmp::Ordering::Less
    } else if d > 0.0 {
        std::cmp::Ordering::Greater
    } else {
        std::cmp::Ordering::Equal
    }
}

fn anchor_polar_at_stop(seed: Polar, anchors: &[Anchor], stop: f64) -> Polar {
    if anchors.is_empty() {
        return seed;
    }
    let sorted = sort_by_stop(anchors);
    let lower = sorted.iter().rev().find(|a| a.stop <= stop);
    let upper = sorted.iter().find(|a| a.stop >= stop);
    match (lower, upper) {
        (Some(l), Some(u)) if l.stop != u.stop => {
            let start = color_to_polar(&l.color);
            let end = color_to_polar(&u.color);
            let amount = (stop - l.stop) / (u.stop - l.stop);
            Polar {
                lightness: start.lightness + (end.lightness - start.lightness) * amount,
                chroma: start.chroma + (end.chroma - start.chroma) * amount,
                hue: interpolate_hue(start.hue, end.hue, amount),
            }
        }
        _ => {
            let a = lower.or(upper).unwrap_or(&sorted[0]);
            color_to_polar(&a.color)
        }
    }
}

fn generate_candidate(source: Polar, tone: f64, mode: &str, vibrancy: f64, coordinate: bool) -> Result<(String, bool), String> {
    let adjusted_hue = tone_adjusted_hue(source.hue, tone);
    let base = if coordinate { coordinated_chroma(source.chroma) } else { source.chroma };
    let chroma = base
        * vibrancy_multiplier(vibrancy)?
        * hue_balance_factor(adjusted_hue)
        * high_tone_chroma_factor(adjusted_hue, tone)
        * tone_chroma_envelope(tone)
        * (if mode == "dark" { DARK_CHROMA_FACTOR } else { 1.0 });
    let lightness = tone_to_oklab_lightness(tone);
    Ok((oklch_clamped_hex(lightness, chroma, adjusted_hue), chroma > max_oklch_chroma(adjusted_hue, lightness) + 0.000001))
}

pub fn perceptual_delta(a: &str, b: &str) -> f64 {
    let [la, aa, ba] = oklab_coordinates(a);
    let [lb, ab, bb] = oklab_coordinates(b);
    let p = crate::js::jsmath::pow;
    (p(la - lb, 2.0) + p(aa - ab, 2.0) + p(ba - bb, 2.0)).sqrt() * 100.0
}

fn interpolate_color(a: &str, b: &str, amount: f64) -> String {
    let s = hex_to_oklch(a);
    let e = hex_to_oklch(b);
    oklch_clamped_hex(s.l + (e.l - s.l) * amount, s.c + (e.c - s.c) * amount, interpolate_hue(s.h, e.h, amount))
}

fn apply_anchor(candidate: &str, anchor: &Anchor) -> Result<AnchorResult, String> {
    let target = normalize_color_str(&anchor.color)?;
    let mut generated = candidate.to_string();
    match anchor.policy.as_str() {
        "exact" => generated = target.clone(),
        "bounded" => {
            let tol = anchor.max_delta_e.unwrap_or(f64::NAN);
            if !tol.is_finite() || tol < 0.0 {
                return Err(format!(
                    "Bounded anchor at stop {} requires a non-negative maxDeltaE.",
                    key(anchor.stop)
                ));
            }
            if perceptual_delta(candidate, &target) > tol {
                let mut low = 0.0;
                let mut high = 1.0;
                for _ in 0..18 {
                    let amount = (low + high) / 2.0;
                    let mixed = interpolate_color(&target, candidate, amount);
                    if perceptual_delta(&mixed, &target) <= tol {
                        low = amount;
                    } else {
                        high = amount;
                    }
                }
                generated = interpolate_color(&target, candidate, low);
            }
        }
        "flexible" => generated = interpolate_color(candidate, &target, 0.35),
        other => return Err(format!("Unknown anchor policy: {other}")),
    }
    let delta_e = perceptual_delta(&generated, &target);
    let mut a = anchor.clone();
    a.color = target;
    Ok(AnchorResult { anchor: a, generated_color: generated, delta_e })
}

fn interpolate_delta(s: Triple, e: Triple, amount: f64) -> Triple {
    [s[0] + (e[0] - s[0]) * amount, s[1] + (e[1] - s[1]) * amount, s[2] + (e[2] - s[2]) * amount]
}

struct Correction {
    stop: f64,
    delta: Triple,
    result: AnchorResult,
}

fn correction_at_stop(corrections: &[Correction], stop: f64) -> Triple {
    let zero = [0.0, 0.0, 0.0];
    if corrections.is_empty() {
        return zero;
    }
    let first = &corrections[0];
    if stop <= first.stop {
        let boundary = js_max(0.0, first.stop - 25.0);
        if stop <= boundary && boundary != first.stop {
            return zero;
        }
        let amount = if boundary == first.stop { 1.0 } else { smoothstep((stop - boundary) / (first.stop - boundary)) };
        return interpolate_delta(zero, first.delta, amount);
    }
    let last = &corrections[corrections.len() - 1];
    if stop >= last.stop {
        let boundary = js_min(100.0, last.stop + 25.0);
        if stop >= boundary && boundary != last.stop {
            return zero;
        }
        let amount = if boundary == last.stop { 1.0 } else { smoothstep((stop - last.stop) / (boundary - last.stop)) };
        return interpolate_delta(last.delta, zero, amount);
    }
    let upper_index = corrections.iter().position(|c| c.stop > stop).unwrap_or(0);
    let lower = &corrections[upper_index - 1];
    let upper = &corrections[upper_index];
    interpolate_delta(lower.delta, upper.delta, smoothstep((stop - lower.stop) / (upper.stop - lower.stop)))
}

fn apply_anchor_corrections(
    colors: IndexMap<String, String>,
    stops: &[f64],
    anchors: &[Anchor],
) -> Result<(IndexMap<String, String>, Vec<AnchorResult>), String> {
    if anchors.is_empty() {
        return Ok((colors, vec![]));
    }
    let mut corrections = Vec::new();
    for anchor in anchors {
        let candidate = colors.get(&key(anchor.stop)).cloned().unwrap_or_default();
        let result = apply_anchor(&candidate, anchor)?;
        let base = oklab_coordinates(&candidate);
        let target = oklab_coordinates(&result.generated_color);
        corrections.push(Correction {
            stop: anchor.stop,
            delta: [target[0] - base[0], target[1] - base[1], target[2] - base[2]],
            result,
        });
    }
    corrections.sort_by(|a, b| js_cmp(a.stop - b.stop));
    let mut corrected = IndexMap::new();
    for &stop in stops {
        let base = oklab_coordinates(colors.get(&key(stop)).map(|s| s.as_str()).unwrap_or(""));
        let d = correction_at_stop(&corrections, stop);
        corrected.insert(key(stop), oklab_coordinates_to_hex([base[0] + d[0], base[1] + d[1], base[2] + d[2]]));
    }
    for c in &corrections {
        corrected.insert(key(c.stop), c.result.generated_color.clone());
    }
    Ok((corrected, corrections.into_iter().map(|c| c.result).collect()))
}

fn assert_anchor_set(anchors: &[Anchor], stops: &[f64]) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for a in anchors {
        let color = normalize_color_str(&a.color)?;
        if a.mode != "light" && a.mode != "dark" {
            return Err(format!("Unknown anchor mode: {}", a.mode));
        }
        if !stops.contains(&a.stop) {
            return Err(format!("Anchor stop {} is not present in the requested stop layout.", key(a.stop)));
        }
        if (a.stop == 0.0 && color != PALETTE_BLACK) || (a.stop == 100.0 && color != PALETTE_WHITE) {
            return Err(reserved_message(a.stop));
        }
        let k = format!("{}:{}", a.mode, key(a.stop));
        if !seen.insert(k) {
            return Err(format!("Duplicate anchor for {} stop {}.", a.mode, key(a.stop)));
        }
    }
    Ok(())
}

fn reserved_message(stop: f64) -> String {
    format!(
        "Anchor stop {} is reserved for exact {}; use an interior stop for a tinted endpoint.",
        key(stop),
        if stop == 0.0 { "black" } else { "white" }
    )
}

fn build_diagnostics(
    colors: &IndexMap<String, String>,
    stops: &[f64],
    source_hue: f64,
    gamut_mapped_stops: Vec<f64>,
    anchors: Vec<AnchorResult>,
) -> Diagnostics {
    let mut monotonic = true;
    let mut min_adj = f64::INFINITY;
    let mut max_adj = 0.0;
    let mut max_drift = 0.0;
    let mut risk = None;
    for (index, &stop) in stops.iter().enumerate() {
        let color = colors.get(&key(stop)).cloned().unwrap_or_default();
        let o = hex_to_oklch(&color);
        if o.c >= 0.015 {
            let drift = signed_hue_delta(source_hue, o.h);
            max_drift = js_max(max_drift, hue_distance(source_hue, o.h));
            if source_hue >= 230.0 && source_hue < 285.0 && drift > 12.0 {
                risk = Some("blue-to-purple");
            }
            if source_hue >= 70.0 && source_hue < 115.0 && drift < -12.0 {
                risk = Some("yellow-to-brown");
            }
        }
        if index == 0 {
            continue;
        }
        let previous = colors.get(&key(stops[index - 1])).cloned().unwrap_or_default();
        if luminance(&color) + 0.000001 < luminance(&previous) {
            monotonic = false;
        }
        let d = perceptual_delta(&previous, &color);
        min_adj = js_min(min_adj, d);
        max_adj = js_max(max_adj, d);
    }
    Diagnostics {
        monotonic,
        minimum_adjacent_delta_e: if min_adj == f64::INFINITY { 0.0 } else { min_adj },
        maximum_adjacent_delta_e: max_adj,
        maximum_hue_drift: max_drift,
        hue_identity_risk: risk,
        gamut_mapped_stops,
        anchors,
    }
}

fn generate_ramp(request: &Request, family: &Family, mode: &str) -> Result<Ramp, String> {
    let seed_hex = normalize_color_str(&family.seed)?;
    let anchors: Vec<Anchor> = family.anchors.iter().filter(|a| a.mode == mode).cloned().collect();
    assert_anchor_set(&family.anchors, &request.stops)?;
    let neutral = family.kind == "neutral";
    let seed = if neutral { neutral_polar(&request.neutral_profile, &seed_hex)? } else { color_to_polar(&seed_hex) };
    let mut colors = IndexMap::new();
    let mut gamut = Vec::new();
    let reference = generate_candidate(seed, 50.0, mode, request.vibrancy, !neutral)?.0;
    for &stop in &request.stops {
        let source = anchor_polar_at_stop(seed, &anchors, stop);
        let (hex, mapped) = generate_candidate(source, stop, mode, request.vibrancy, !neutral)?;
        colors.insert(key(stop), hex);
        if mapped {
            gamut.push(stop);
        }
    }
    let (colors, results) = apply_anchor_corrections(colors, &request.stops, &anchors)?;
    let diagnostics = build_diagnostics(&colors, &request.stops, hex_to_oklch(&reference).h, gamut, results);
    if !diagnostics.monotonic {
        return Err(format!("{} {} ramp is not luminance-monotonic with the requested anchors.", family.name, mode));
    }
    Ok(Ramp { colors, diagnostics })
}

fn nearest_stop(stops: &[f64], target: f64) -> f64 {
    let mut best = stops[0];
    for &s in &stops[1..] {
        if (s - target).abs() < (best - target).abs() {
            best = s;
        }
    }
    best
}

fn build_coordination(request: &Request, families: &[GeneratedFamily]) -> Vec<Coordination> {
    let stop = nearest_stop(&request.stops, 50.0);
    let chromatic: Vec<&str> = request.families.iter().filter(|f| f.kind != "neutral").map(|f| f.id.as_str()).collect();
    modes_of(&request.mode_strategy)
        .into_iter()
        .map(|mode| {
            struct Sample {
                name: String,
                color: String,
                chroma: f64,
            }
            let samples: Vec<Sample> = families
                .iter()
                .filter(|f| chromatic.contains(&f.id.as_str()) && f.ramp(mode).is_some())
                .map(|f| {
                    let color = f.ramp(mode).unwrap().colors.get(&key(stop)).cloned().unwrap_or_default();
                    let chroma = hex_to_oklch(&color).c;
                    Sample { name: f.name.clone(), color, chroma }
                })
                .collect();
            let mut closest = None;
            let mut min = f64::INFINITY;
            for i in 0..samples.len() {
                for j in i + 1..samples.len() {
                    let d = perceptual_delta(&samples[i].color, &samples[j].color);
                    if d < min {
                        min = d;
                        closest = Some((samples[i].name.clone(), samples[j].name.clone()));
                    }
                }
            }
            let mut by: Vec<&Sample> = samples.iter().collect();
            by.sort_by(|a, b| js_cmp(a.chroma - b.chroma));
            let weakest = by.first();
            let strongest = by.last();
            Coordination {
                mode: mode.into(),
                stop,
                closest,
                minimum_family_delta_e: if min == f64::INFINITY { None } else { Some(min) },
                strongest: strongest.map(|s| s.name.clone()),
                weakest: weakest.map(|s| s.name.clone()),
                chroma_ratio: match (weakest, strongest) {
                    (Some(w), Some(s)) if w.chroma > 0.0001 => Some(s.chroma / w.chroma),
                    _ => None,
                },
            }
        })
        .collect()
}

fn is_truthy_object(v: Option<&Value>) -> bool {
    is_plain_object(v)
}

pub fn normalize_request(input: &Value) -> Result<Request, String> {
    let obj = match input {
        Value::Object(o) => o,
        _ => return Err("Palette generation config must be an object.".into()),
    };
    let families = match obj.get("families") {
        Some(Value::Array(a)) if !a.is_empty() => a,
        _ => return Err("Palette generation requires at least one family.".into()),
    };
    let mode_value = if nullish(obj.get("modeStrategy")) { Value::String("light-and-dark".into()) } else { obj["modeStrategy"].clone() };
    let modes = modes_for_strategy(Some(&mode_value))?;
    let mode_strategy = mode_value.as_str().unwrap_or_default().to_string();
    let stops = if nullish(obj.get("stops")) {
        DEFAULT_21_STOPS.to_vec()
    } else {
        validate_stops(obj.get("stops"))?
    };
    let mut ids: Vec<String> = Vec::new();
    let mut out_families = Vec::new();
    for (index, family) in families.iter().enumerate() {
        if !is_truthy_object(Some(family)) {
            return Err(format!("Family {index} must be an object."));
        }
        let f = family.as_object().unwrap();
        let id_raw = if nullish(f.get("id")) { String::new() } else { js_str(f.get("id")) };
        let id = id_raw.trim_matches(crate::cli::format::js_ws).to_string();
        let valid_id = {
            let mut cs = id.chars();
            matches!(cs.next(), Some('a'..='z')) && cs.all(|c| matches!(c, 'a'..='z' | '0'..='9' | '-'))
        };
        if !valid_id {
            return Err(format!("Family {index} id must use lower-kebab-case characters."));
        }
        if id == "black" || id == "white" {
            return Err(format!("Family id {id} is reserved for the standalone {id} palette value."));
        }
        if ids.contains(&id) {
            return Err(format!("Duplicate family id: {id}."));
        }
        ids.push(id.clone());
        let kind_value = if nullish(f.get("kind")) { Value::String("chromatic".into()) } else { f["kind"].clone() };
        let kind = match kind_value.as_str() {
            Some(k @ ("chromatic" | "neutral")) => k.to_string(),
            _ => return Err(format!("Unknown family kind: {}", js_str(Some(&kind_value)))),
        };
        let anchors_value = f.get("anchors");
        if !nullish(anchors_value) && !matches!(anchors_value, Some(Value::Array(_))) {
            return Err(format!("Family {id} anchors must be an array."));
        }
        let mut anchors = Vec::new();
        if let Some(Value::Array(list)) = anchors_value {
            for (ai, anchor) in list.iter().enumerate() {
                let a = match anchor {
                    Value::Object(a) => a,
                    _ => return Err(format!("Family {id} anchor {ai} must be an object.")),
                };
                let mode = match str_of(a.get("mode")) {
                    Some(m @ ("light" | "dark")) => m.to_string(),
                    _ => return Err(format!("Unknown anchor mode: {}", js_str(a.get("mode")))),
                };
                if !modes.contains(&mode.as_str()) {
                    return Err(format!("Anchor mode {mode} is not generated by mode strategy {mode_strategy}."));
                }
                let stop = match num_of(a.get("stop")) {
                    Some(s) if s.is_finite() && stops.contains(&s) => s,
                    _ => {
                        return Err(format!(
                            "Anchor stop {} is not present in the requested stop layout.",
                            js_str(a.get("stop"))
                        ))
                    }
                };
                let policy = match str_of(a.get("policy")) {
                    Some(p @ ("exact" | "bounded" | "flexible")) => p.to_string(),
                    _ => return Err(format!("Unknown anchor policy: {}", js_str(a.get("policy")))),
                };
                let max = a.get("maxDeltaE");
                if policy == "bounded" && !(is_finite_number(max) && num_of(max).unwrap() >= 0.0) {
                    return Err(format!("Bounded anchor at stop {} requires a non-negative maxDeltaE.", key(stop)));
                }
                if policy != "bounded" && !nullish(max) {
                    return Err(format!("Anchor policy {policy} does not accept maxDeltaE."));
                }
                let color = normalize_color_str(&js_str(a.get("color")))?;
                if (stop == 0.0 && color != PALETTE_BLACK) || (stop == 100.0 && color != PALETTE_WHITE) {
                    return Err(reserved_message(stop));
                }
                anchors.push(Anchor { mode, stop, color, policy: policy.clone(), max_delta_e: if policy == "bounded" { num_of(max) } else { None } });
            }
        }
        let name = if nullish(f.get("name")) { id.clone() } else { js_str(f.get("name")) };
        let seed = normalize_color_str(&js_str(f.get("seed")))?;
        out_families.push(Family { id, name, seed, kind, anchors });
    }
    let profile_value = if nullish(obj.get("neutralProfile")) { Value::String("neutral-v1".into()) } else { obj["neutralProfile"].clone() };
    let neutral_profile = match profile_value.as_str() {
        Some(p) if NEUTRAL_PROFILES.contains(&p) => p.to_string(),
        _ => return Err(format!("Unknown neutral profile: {}", js_str(Some(&profile_value)))),
    };
    let vibrancy_value = if nullish(obj.get("vibrancy")) { Value::from(50) } else { obj["vibrancy"].clone() };
    let vibrancy = match num_of(Some(&vibrancy_value)) {
        Some(v) => {
            vibrancy_multiplier(v)?;
            v
        }
        None => return Err("Vibrancy must be a number from 0 to 100.".into()),
    };
    Ok(Request { vibrancy, neutral_profile, mode_strategy, stops, families: out_families })
}

pub fn generate_palette_set(input: &Value) -> Result<GenerationResult, String> {
    let request = normalize_request(input)?;
    let mut families = Vec::new();
    let mut errors = Vec::new();
    for family in &request.families {
        let mut g = GeneratedFamily { id: family.id.clone(), name: family.name.clone(), light: None, dark: None };
        let mut failed = None;
        for mode in modes_of(&request.mode_strategy) {
            match generate_ramp(&request, family, mode) {
                Ok(r) => {
                    if mode == "light" {
                        g.light = Some(r)
                    } else {
                        g.dark = Some(r)
                    }
                }
                Err(e) => {
                    failed = Some(e);
                    break;
                }
            }
        }
        match failed {
            Some(e) => errors.push((family.id.clone(), e)),
            None => families.push(g),
        }
    }
    let coordination = build_coordination(&request, &families);
    Ok(GenerationResult { request, families, coordination, errors })
}

pub fn serialize_generation_result(v: &Value) -> String {
    format!("{}\n", json::stringify(v, 2))
}
