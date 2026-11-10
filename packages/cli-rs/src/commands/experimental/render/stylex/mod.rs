//! A native port of the part of StyleX 0.19 (@stylexjs/babel-plugin) a
//! render needs: `stylex.create` with static styles compiled to class
//! names and CSS rules, and `processStylexRules` with `useLayers: false`.
//! The compiled objects replace the `create` call in the page's module, so
//! StyleX's own runtime `props` merges them as the compiled code would.

pub mod compile;
pub mod jseval;
pub mod vars;
pub mod media;
pub mod priorities_data;
pub mod value_parser;

use crate::json::{Map, Value};
use value_parser as vp;

// ---- hashing ----

fn murmurhash2_32_gc(s: &str, seed: u32) -> u32 {
    let codes: Vec<u32> = s.encode_utf16().map(|c| c as u32).collect();
    let mut l = codes.len() as u32;
    let mut h: u32 = seed ^ l;
    let mut i = 0usize;
    let mul = |x: u32| -> u32 { (x & 0xffff).wrapping_mul(0x5bd1e995).wrapping_add((((x >> 16).wrapping_mul(0x5bd1e995)) & 0xffff) << 16) };
    while l >= 4 {
        let mut k = (codes[i] & 0xff) | ((codes[i + 1] & 0xff) << 8) | ((codes[i + 2] & 0xff) << 16) | ((codes[i + 3] & 0xff) << 24);
        k = mul(k);
        k ^= k >> 24;
        k = mul(k);
        h = mul(h) ^ k;
        l -= 4;
        i += 4;
    }
    if l == 3 {
        h ^= (codes[i + 2] & 0xff) << 16;
    }
    if l >= 2 {
        h ^= (codes[i + 1] & 0xff) << 8;
    }
    if l >= 1 {
        h ^= codes[i] & 0xff;
        h = mul(h);
    }
    h ^= h >> 13;
    h = mul(h);
    h ^= h >> 15;
    h
}

fn to_radix(mut n: u64, radix: u64, digits: &[u8]) -> String {
    if n == 0 {
        return (digits[0] as char).to_string();
    }
    let mut out = vec![];
    while n > 0 {
        out.push(digits[(n % radix) as usize]);
        n /= radix;
    }
    out.reverse();
    String::from_utf8(out).unwrap()
}

pub fn hash(s: &str) -> String {
    to_radix(murmurhash2_32_gc(s, 1) as u64, 36, b"0123456789abcdefghijklmnopqrstuvwxyz")
}

fn create_short_hash(s: &str) -> String {
    let n = murmurhash2_32_gc(s, 1) as u64 % 62u64.pow(5);
    if n == 0 {
        return String::new();
    }
    to_radix(n, 62, b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
}

fn dashify(s: &str) -> String {
    let mut out = String::new();
    let cs: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c.is_ascii_uppercase() && (i == 0 || cs[i - 1].is_ascii_lowercase()) {
            // `(^|[a-z])([A-Z])` -> `$1-$2`; a match consumes the lower letter.
            out.push('-');
        }
        out.push(c);
        i += 1;
    }
    // A capital after a capital that itself followed a lower letter is not
    // matched again (the regex consumed the lower letter): reproduce.
    let re = regress::Regex::new(r"(^|[a-z])([A-Z])").unwrap();
    let mut r = String::new();
    let mut last = 0;
    for m in re.find_iter(s) {
        r.push_str(&s[last..m.start()]);
        r.push_str(&s[m.group(1).unwrap()]);
        r.push('-');
        r.push_str(&s[m.group(2).unwrap()]);
        last = m.end();
    }
    r.push_str(&s[last..]);
    let _ = out;
    r.to_lowercase()
}

// ---- values ----

fn js_parse_float(s: &str) -> Option<f64> {
    let t = s.trim_start();
    let re = regress::Regex::new(r"^[+-]?(?:Infinity|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)").unwrap();
    let m = re.find(t)?;
    let txt = &t[m.range()];
    if txt.ends_with("Infinity") {
        return Some(if txt.starts_with('-') { f64::NEG_INFINITY } else { f64::INFINITY });
    }
    txt.parse::<f64>().ok()
}

fn num_str(n: f64) -> String {
    crate::json::js_number_to_string(n)
}

const UNITLESS: [&str; 48] = [
    "WebkitLineClamp", "animationIterationCount", "aspectRatio", "borderImageOutset", "borderImageSlice", "borderImageWidth", "counterSet", "counterReset",
    "columnCount", "flex", "flexGrow", "flexShrink", "flexOrder", "gridRow", "gridRowStart", "gridRowEnd", "gridColumn", "gridColumnStart", "gridColumnEnd",
    "gridArea", "fontWeight", "hyphenateLimitChars", "lineClamp", "lineHeight", "maskBorderOutset", "maskBorderSlice", "maskBorderWidth", "opacity", "order",
    "orphans", "tabSize", "widows", "zIndex", "fillOpacity", "floodOpacity", "rotate", "scale", "shapeImageThreshold", "stopOpacity", "strokeDasharray",
    "strokeDashoffset", "strokeMiterlimit", "strokeOpacity", "strokeWidth", "scale", "mathDepth", "zoom", "zoom",
];

pub fn number_suffix_pub(key: &str) -> &'static str {
    number_suffix(key)
}

fn number_suffix(key: &str) -> &'static str {
    if UNITLESS.contains(&key) || key.starts_with("--") {
        return "";
    }
    match key {
        "animationDelay" | "animationDuration" | "transitionDelay" | "transitionDuration" | "voiceDuration" => "ms",
        _ => "px",
    }
}

#[derive(Debug)]
pub struct StylexError(pub String);

fn normalize_value(value: &str, key: &str) -> Result<String, StylexError> {
    let mut ast = vp::parse(value);
    // detectUnclosedFns / detectUnclosedStrings
    let mut bad = None;
    vp::walk(&mut ast, &mut |n, _| {
        if n.kind == vp::Kind::Function && n.unclosed {
            bad = Some("Rule contains an unclosed function");
        }
        if n.kind == vp::Kind::Str && n.unclosed && bad.is_none() {
            bad = Some("Rule contains an unclosed string");
        }
    });
    if let Some(b) = bad {
        return Err(StylexError(b.into()));
    }
    // normalizeWhitespace
    if ast.first().is_some_and(|n| n.kind == vp::Kind::Space) {
        ast.remove(0);
    }
    if ast.last().is_some_and(|n| n.kind == vp::Kind::Space) {
        ast.pop();
    }
    let mut i = 0;
    while i < ast.len() {
        if ast[i].kind == vp::Kind::Word && ast[i].value == "!important" && i > 0 && ast[i - 1].kind == vp::Kind::Space {
            ast.remove(i - 1);
            continue;
        }
        i += 1;
    }
    vp::walk(&mut ast, &mut |n, _| match n.kind {
        vp::Kind::Space => n.value = " ".into(),
        vp::Kind::Div => {
            if n.value == "," {
                n.before.clear();
                n.after.clear();
            } else {
                n.before = " ".into();
                n.after = " ".into();
            }
        }
        vp::Kind::Function => {
            n.before.clear();
            n.after.clear();
        }
        _ => {}
    });
    // normalizeTimings
    vp::walk(&mut ast, &mut |n, _| {
        if n.kind != vp::Kind::Word {
            return;
        }
        let Some(v) = js_parse_float(&n.value) else { return };
        if let Some((_, u)) = vp::unit(&n.value) {
            if u == "ms" && v >= 10.0 {
                n.value = format!("{}s", num_str(v / 1000.0));
            }
        }
    });
    // normalizeZeroDimensions
    if !key.starts_with("--") {
        let mut end_function = 0usize;
        vp::walk(&mut ast, &mut |n, _| {
            if n.kind == vp::Kind::Function && end_function == 0 {
                end_function = n.source_end_index;
            }
            if end_function > 0 && n.source_index > end_function {
                end_function = 0;
            }
            if n.kind != vp::Kind::Word {
                return;
            }
            let Some((num, u)) = vp::unit(&n.value) else { return };
            if num != "0" {
                return;
            }
            if ["deg", "grad", "turn", "rad"].contains(&u.as_str()) {
                n.value = "0deg".into();
            } else if u == "ms" || u == "s" {
                n.value = "0s".into();
            } else if u == "fr" {
                n.value = "0fr".into();
            } else if u == "%" {
                n.value = "0%".into();
            } else if end_function == 0 {
                n.value = "0".into();
            }
        });
    }
    // normalizeLeadingZero
    vp::walk(&mut ast, &mut |n, _| {
        if n.kind != vp::Kind::Word {
            return;
        }
        let Some(v) = js_parse_float(&n.value) else { return };
        if v.is_nan() {
            return;
        }
        let u = vp::unit(&n.value).map(|x| x.1).unwrap_or_default();
        if (0.0..1.0).contains(&v) {
            n.value = format!("{}{u}", num_str(v).replacen("0.", ".", 1));
        }
    });
    // normalizeQuotes
    vp::walk(&mut ast, &mut |n, _| {
        if n.kind == vp::Kind::Str && n.value.is_empty() {
            n.quote = "\"".into();
        }
    });
    // convertCamelCasedValues
    if key == "transitionProperty" || key == "willChange" {
        for n in ast.iter_mut() {
            if n.kind == vp::Kind::Word && !n.value.starts_with("--") {
                n.value = dashify(&n.value);
            }
        }
    }
    Ok(vp::stringify(&ast))
}

#[derive(Debug, Clone, PartialEq)]
enum Raw {
    Num(f64),
    Str(String),
}

fn transform_value(key: &str, raw: &Raw) -> Result<String, StylexError> {
    let value = match raw {
        Raw::Num(n) => format!("{}{}", num_str((n * 10000.0).round() / 10000.0), number_suffix(key)),
        Raw::Str(s) => s.clone(),
    };
    if matches!(key, "content" | "hyphenateCharacter" | "hyphenate-character") && matches!(raw, Raw::Str(_)) {
        let val = crate::commands::gap_report::api::js_trim(&value).to_string();
        let fns = ["attr(", "counter(", "counters(", "url(", "linear-gradient(", "image-set(", "var(--"];
        let keywords = ["normal", "none", "open-quote", "close-quote", "no-open-quote", "no-close-quote", "inherit", "initial", "revert", "revert-layer", "unset"];
        let quotes = val.matches('"').count() >= 2 || val.matches('\'').count() >= 2;
        if fns.iter().any(|f| val.contains(f)) || keywords.contains(&val.as_str()) || quotes {
            return Ok(val);
        }
        return Ok(format!("\"{val}\""));
    }
    normalize_value(&value, key)
}

// ---- shorthands (property-specificity) ----

fn expand(key: &str, value: Option<Raw>) -> Vec<(String, Option<Raw>)> {
    let unsupported = [
        "all", "animation", "background", "border", "borderInline", "borderBlock", "borderTop", "borderInlineEnd", "borderRight", "borderBottom",
        "borderInlineStart", "borderLeft", "borderHorizontal", "borderVertical", "borderBlockStart", "borderEnd", "borderBlockEnd", "borderStart",
    ];
    if unsupported.contains(&key) {
        return vec![];
    }
    let alias = match key {
        "blockSize" => "height",
        "inlineSize" => "width",
        "minBlockSize" => "minHeight",
        "minInlineSize" => "minWidth",
        "maxBlockSize" => "maxHeight",
        "maxInlineSize" => "maxWidth",
        "borderHorizontalWidth" => "borderInlineWidth",
        "borderHorizontalStyle" => "borderInlineStyle",
        "borderHorizontalColor" => "borderInlineColor",
        "borderVerticalWidth" => "borderBlockWidth",
        "borderVerticalStyle" => "borderBlockStyle",
        "borderVerticalColor" => "borderBlockColor",
        "borderBlockStartColor" => "borderTopColor",
        "borderBlockEndColor" => "borderBottomColor",
        "borderBlockStartStyle" => "borderTopStyle",
        "borderBlockEndStyle" => "borderBottomStyle",
        "borderBlockStartWidth" => "borderTopWidth",
        "borderBlockEndWidth" => "borderBottomWidth",
        "borderStartColor" => "borderInlineStartColor",
        "borderEndColor" => "borderInlineEndColor",
        "borderStartStyle" => "borderInlineStartStyle",
        "borderEndStyle" => "borderInlineEndStyle",
        "borderStartWidth" => "borderInlineStartWidth",
        "borderEndWidth" => "borderInlineEndWidth",
        "borderTopStartRadius" => "borderStartStartRadius",
        "borderTopEndRadius" => "borderStartEndRadius",
        "borderBottomStartRadius" => "borderEndStartRadius",
        "borderBottomEndRadius" => "borderEndEndRadius",
        "containIntrinsicBlockSize" => "containIntrinsicHeight",
        "containIntrinsicInlineSize" => "containIntrinsicWidth",
        "marginBlockStart" => "marginTop",
        "marginBlockEnd" => "marginBottom",
        "marginStart" => "marginInlineStart",
        "marginEnd" => "marginInlineEnd",
        "marginHorizontal" => "marginInline",
        "marginVertical" => "marginBlock",
        "overflowBlock" => "overflowY",
        "overflowInline" => "overflowX",
        "paddingBlockStart" => "paddingTop",
        "paddingBlockEnd" => "paddingBottom",
        "paddingStart" => "paddingInlineStart",
        "paddingEnd" => "paddingInlineEnd",
        "paddingHorizontal" => "paddingInline",
        "paddingVertical" => "paddingBlock",
        "scrollMarginBlockStart" => "scrollMarginTop",
        "scrollMarginBlockEnd" => "scrollMarginBottom",
        "insetBlockStart" => "top",
        "insetBlockEnd" => "bottom",
        "start" => "insetInlineStart",
        "end" => "insetInlineEnd",
        _ => key,
    };
    vec![(alias.to_string(), value)]
}

// ---- LTR / RTL ----

fn generate_ltr(key: &str, val: &str) -> (String, String) {
    let to = |k: &str| (k.to_string(), val.to_string());
    match key {
        "margin-start" => to("margin-left"),
        "margin-end" => to("margin-right"),
        "padding-start" => to("padding-left"),
        "padding-end" => to("padding-right"),
        "border-start" => to("border-left"),
        "border-end" => to("border-right"),
        "border-start-width" => to("border-left-width"),
        "border-end-width" => to("border-right-width"),
        "border-start-color" => to("border-left-color"),
        "border-end-color" => to("border-right-color"),
        "border-start-style" => to("border-left-style"),
        "border-end-style" => to("border-right-style"),
        "border-top-start-radius" => to("border-top-left-radius"),
        "border-bottom-start-radius" => to("border-bottom-left-radius"),
        "border-top-end-radius" => to("border-top-right-radius"),
        "border-bottom-end-radius" => to("border-bottom-right-radius"),
        "float" | "clear" => (
            key.to_string(),
            match val {
                "start" | "inline-start" => "left".into(),
                "end" | "inline-end" => "right".into(),
                v => v.into(),
            },
        ),
        "start" => to("left"),
        "end" => to("right"),
        "background-position" => (
            key.to_string(),
            val.split(' ').map(|w| if w == "start" || w == "insetInlineStart" { "left" } else if w == "end" || w == "insetInlineEnd" { "right" } else { w }).collect::<Vec<_>>().join(" "),
        ),
        _ => to(key),
    }
}

fn generate_rtl(key: &str, val: &str) -> Option<(String, String)> {
    let to = |k: &str| Some((k.to_string(), val.to_string()));
    match key {
        "margin-start" => to("margin-right"),
        "margin-end" => to("margin-left"),
        "padding-start" => to("padding-right"),
        "padding-end" => to("padding-left"),
        "border-start" => to("border-right"),
        "border-end" => to("border-left"),
        "border-start-width" => to("border-right-width"),
        "border-end-width" => to("border-left-width"),
        "border-start-color" => to("border-right-color"),
        "border-end-color" => to("border-left-color"),
        "border-start-style" => to("border-right-style"),
        "border-end-style" => to("border-left-style"),
        "border-top-start-radius" => to("border-top-right-radius"),
        "border-bottom-start-radius" => to("border-bottom-right-radius"),
        "border-top-end-radius" => to("border-top-left-radius"),
        "border-bottom-end-radius" => to("border-bottom-left-radius"),
        "float" | "clear" => match val {
            "start" | "inline-start" => Some((key.to_string(), "right".into())),
            "end" | "inline-end" => Some((key.to_string(), "left".into())),
            _ => None,
        },
        "start" => to("right"),
        "end" => to("left"),
        "background-position" => {
            let words: Vec<&str> = val.split(' ').collect();
            if !words.contains(&"start") && !words.contains(&"end") {
                return None;
            }
            Some((
                key.to_string(),
                words.iter().map(|w| if *w == "start" || *w == "insetInlineStart" { "right" } else if *w == "end" || *w == "insetInlineEnd" { "left" } else { w }).collect::<Vec<_>>().join(" "),
            ))
        }
        _ => None,
    }
}

// ---- priorities ----

fn pseudo_class_priority_of(p: &str) -> Option<f64> {
    priorities_data::PSEUDO_CLASS_PRIORITIES.iter().find(|(k, _)| *k == p).map(|(_, v)| *v)
}

fn get_priority(key: &str) -> f64 {
    if key.starts_with("--") {
        return 1.0;
    }
    if key.starts_with("@supports") {
        return 30.0;
    }
    if key.starts_with("@media") {
        return 200.0;
    }
    if key.starts_with("@container") {
        return 300.0;
    }
    // compound pseudos
    let parts_re = regress::Regex::new(r"::[a-zA-Z-]+|:[a-zA-Z-]+(?:\([^)]*\))?").unwrap();
    let parts: Vec<&str> = parts_re.find_iter(key).map(|m| &key[m.range()]).collect();
    if parts.len() > 1 && !parts.iter().any(|p| p.contains('(')) {
        return parts.iter().map(|p| if p.starts_with("::") { 5000.0 } else { pseudo_class_priority_of(p).unwrap_or(40.0) }).sum();
    }
    if key.starts_with("::") {
        return 5000.0;
    }
    let base = |p: &str| pseudo_class_priority_of(p).unwrap_or(40.0) / 100.0;
    let rel = |re: &str| regress::Regex::new(re).unwrap().find(key).map(|m| (m.group(1).map(|r| key[r].to_string()), m.group(2).map(|r| key[r].to_string())));
    if let Some((a, _)) = rel(r"^:where\(\.[0-9a-zA-Z_-]+(:[a-zA-Z-]+)\s+\*\)$") {
        return 10.0 + base(&a.unwrap_or_default());
    }
    if let Some((a, _)) = rel(r"^:where\(:has\(\.[0-9a-zA-Z_-]+(:[a-zA-Z-]+)\)\)$") {
        return 15.0 + base(&a.unwrap_or_default());
    }
    if let Some((a, b)) = rel(r"^:where\(\.[0-9a-zA-Z_-]+(:[a-zA-Z-]+)\s+~\s+\*,\s+:has\(~\s\.[0-9a-zA-Z_-]+(:[a-zA-Z-]+)\)\)$") {
        return 20.0 + base(&a.unwrap_or_default()).max(base(&b.unwrap_or_default()));
    }
    if let Some((a, _)) = rel(r"^:where\(\.[0-9a-zA-Z_-]+(:[a-zA-Z-]+)\s+~\s+\*\)$") {
        return 30.0 + base(&a.unwrap_or_default());
    }
    if let Some((a, _)) = rel(r"^:where\(:has\(~\s\.[0-9a-zA-Z_-]+(:[a-zA-Z-]+)\)\)$") {
        return 40.0 + base(&a.unwrap_or_default());
    }
    if key.starts_with(':') {
        let prop = key.split('(').next().unwrap_or("");
        return pseudo_class_priority_of(prop).unwrap_or(40.0);
    }
    if priorities_data::SHORTHANDS_OF_SHORTHANDS.contains(&key) {
        return 1000.0;
    }
    if priorities_data::SHORTHANDS_OF_LONGHANDS.contains(&key) {
        return 2000.0;
    }
    if priorities_data::LONGHAND_LOGICAL.contains(&key) {
        return 3000.0;
    }
    if priorities_data::LONGHAND_PHYSICAL.contains(&key) {
        return 4000.0;
    }
    3000.0
}

// ---- rules ----

fn utf16_sorted(v: &[String]) -> Vec<String> {
    let mut v = v.to_vec();
    v.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(a, b));
    v
}

fn sort_pseudos(pseudos: &[String]) -> Vec<String> {
    if pseudos.len() < 2 {
        return pseudos.to_vec();
    }
    let mut groups: Vec<Result<String, Vec<String>>> = vec![];
    for p in pseudos {
        if p.starts_with("::") {
            groups.push(Ok(p.clone()));
            continue;
        }
        match groups.last_mut() {
            Some(Err(g)) => g.push(p.clone()),
            _ => groups.push(Err(vec![p.clone()])),
        }
    }
    groups
        .into_iter()
        .flat_map(|g| match g {
            Ok(p) => vec![p],
            Err(mut v) => {
                v.sort_by(|a, b| {
                    if a == "default" {
                        std::cmp::Ordering::Less
                    } else if b == "default" {
                        std::cmp::Ordering::Greater
                    } else {
                        crate::cli::collate::locale_compare(a, b)
                    }
                });
                v
            }
        })
        .collect()
}

fn build_nested_rule(class: &str, decls: &str, pseudos: &[String], at_rules: &[String], const_rules: &[String]) -> String {
    let mut classes = String::new();
    let mut elements = String::new();
    for p in pseudos {
        if p == "::thumb" {
            continue;
        }
        if p.starts_with("::") {
            elements.push_str(p);
        } else {
            classes.push_str(p);
        }
    }
    let pseudo = format!("{classes}{elements}");
    let combined: Vec<String> = at_rules.iter().chain(const_rules.iter()).cloned().collect();
    let extra = if pseudo.contains(":where(") { format!(".{class}") } else { String::new() };
    let mut sel = format!(".{class}{extra}{}{pseudo}", combined.iter().map(|_| format!(".{class}")).collect::<String>());
    if pseudos.iter().any(|p| p == "::thumb") {
        sel = ["::-webkit-slider-thumb", "::-moz-range-thumb", "::-ms-thumb"].iter().map(|s| format!("{sel}{s}")).collect::<Vec<_>>().join(", ");
    }
    combined.iter().fold(format!("{sel}{{{decls}}}"), |acc, at| format!("{at}{{{acc}}}"))
}

#[derive(Debug, Clone)]
pub struct Rule {
    pub class: String,
    pub ltr: String,
    pub rtl: Option<String>,
    pub priority: f64,
}

#[derive(Debug, Clone)]
enum Val {
    One(String),
    Many(Vec<String>),
}

fn convert_to_class(key: &str, raw: &[Raw], pseudos: &[String], at_rules: &[String], const_rules: &[String]) -> Result<(String, Rule), StylexError> {
    let dashed = if key.starts_with("--") { key.to_string() } else { dashify(key) };
    let value = if raw.len() == 1 {
        Val::One(transform_value(key, &raw[0])?)
    } else {
        Val::Many(raw.iter().map(|r| transform_value(key, r)).collect::<Result<Vec<_>, _>>()?)
    };
    let value = match value {
        Val::Many(v) if v.iter().any(|x| x.starts_with("var(") && x.ends_with(')')) => Val::Many(variable_fallbacks(&v)?),
        v => v,
    };
    let sorted_pseudos = sort_pseudos(pseudos);
    let mut ats: Vec<String> = at_rules.iter().chain(const_rules.iter()).cloned().collect();
    ats = utf16_sorted(&ats);
    let modifier = {
        let m = format!("{}{}", sorted_pseudos.join(""), ats.join(""));
        if m.is_empty() { "null".to_string() } else { m }
    };
    let value_str = match &value {
        Val::One(v) => v.clone(),
        Val::Many(v) => v.join(", "),
    };
    let class = format!("x{}", hash(&format!("<>{dashed}{value_str}{modifier}")));
    let values: Vec<String> = match &value {
        Val::One(v) => vec![v.clone()],
        Val::Many(v) => v.clone(),
    };
    let ltr_decls = values.iter().map(|v| {
        let (k, v) = generate_ltr(&dashed, v);
        format!("{k}:{v}")
    }).collect::<Vec<_>>().join(";");
    let rtl_decls = values.iter().filter_map(|v| generate_rtl(&dashed, v).map(|(k, v)| format!("{k}:{v}"))).collect::<Vec<_>>().join(";");
    let ltr = build_nested_rule(&class, &ltr_decls, pseudos, at_rules, const_rules);
    let rtl = if rtl_decls.is_empty() { None } else { Some(build_nested_rule(&class, &rtl_decls, pseudos, at_rules, const_rules)) };
    let priority = get_priority(&dashed) + pseudos.iter().map(|p| get_priority(p)).sum::<f64>() + at_rules.iter().map(|p| get_priority(p)).sum::<f64>() + const_rules.iter().map(|p| get_priority(p)).sum::<f64>();
    Ok((class.clone(), Rule { class, ltr, rtl, priority }))
}

fn variable_fallbacks(values: &[String]) -> Result<Vec<String>, StylexError> {
    let is_var = |v: &String| v.starts_with("var(") && v.ends_with(')');
    let first = values.iter().position(is_var).unwrap();
    let last = values.iter().rposition(is_var).unwrap();
    let before = &values[..first];
    let mut vars: Vec<String> = values[first..=last].iter().rev().cloned().collect();
    let after = &values[last + 1..];
    if vars.iter().any(|v| !is_var(v)) {
        return Err(StylexError("All variables passed to firstThatWorks() must appear next to each other.".into()));
    }
    vars = vars.iter().map(|v| v[4..v.len() - 1].to_string()).collect();
    fn compose(vars: &[String]) -> String {
        let (first, rest) = vars.split_first().unwrap();
        if !rest.is_empty() {
            format!("var({first},{})", compose(rest))
        } else if first.starts_with("--") {
            format!("var({first})")
        } else {
            first.clone()
        }
    }
    let mut out: Vec<String> = if !before.is_empty() {
        before.iter().map(|b| {
            let mut all = vars.clone();
            all.push(b.clone());
            compose(&all)
        }).collect()
    } else {
        vec![compose(&vars)]
    };
    out.extend(after.iter().cloned());
    Ok(out)
}

// ---- flatten ----

#[derive(Debug, Clone)]
enum Pre {
    Null,
    Rule { property: String, value: Vec<Raw>, key_path: Vec<String> },
    Set(Vec<Pre>),
}

impl Pre {
    fn create(rules: Vec<Pre>) -> Pre {
        let flat: Vec<Pre> = rules.into_iter().flat_map(|r| match r {
            Pre::Set(v) => v,
            o => vec![o],
        }).collect();
        match flat.len() {
            0 => Pre::Null,
            1 => flat.into_iter().next().unwrap(),
            _ => Pre::Set(flat),
        }
    }

    fn compiled(&self) -> Result<Vec<Option<(String, Rule, String)>>, StylexError> {
        match self {
            Pre::Null => Ok(vec![None]),
            Pre::Rule { property, value, key_path } => {
                let pseudos: Vec<String> = sort_pseudos(&key_path.iter().filter(|k| k.starts_with(':') || k.starts_with('[')).cloned().collect::<Vec<_>>());
                let ats: Vec<String> = utf16_sorted(&key_path.iter().filter(|k| k.starts_with('@')).cloned().collect::<Vec<_>>());
                let consts: Vec<String> = key_path.iter().filter(|k| k.starts_with("var(--")).cloned().collect();
                let (c, r) = convert_to_class(property, value, &pseudos, &ats, &consts)?;
                Ok(vec![Some((c, r, key_path.join("_")))])
            }
            Pre::Set(rules) => {
                let mut out = vec![];
                for r in rules {
                    out.extend(r.compiled()?.into_iter().flatten().map(Some));
                }
                if out.is_empty() {
                    out.push(None);
                }
                Ok(out)
            }
        }
    }
}

fn raw_of(v: &Value) -> Option<Raw> {
    match v {
        Value::Number(n) => n.as_f64().map(Raw::Num),
        Value::String(s) => Some(Raw::Str(s.clone())),
        _ => None,
    }
}

fn is_condition(k: &str) -> bool {
    k.starts_with(':') || k.starts_with('@') || k.starts_with('[')
}

fn flatten(style: &Map<String, Value>, key_path: &[String]) -> Result<Vec<(String, Pre)>, StylexError> {
    let mut out: Vec<(String, Pre)> = vec![];
    let var_re = regress::Regex::new(r"var\(--[a-z0-9]+\)").unwrap();
    let path_for = |property: &str, key: &str| -> Vec<String> {
        if key_path.iter().any(|k| k == key) {
            key_path.iter().map(|k| if k == key { property.to_string() } else { k.clone() }).collect()
        } else {
            let mut p = key_path.to_vec();
            p.push(property.to_string());
            p
        }
    };
    for (raw_key, value) in style {
        let key = if var_re.find(raw_key).is_some() { raw_key[4..raw_key.len() - 1].to_string() } else { raw_key.clone() };
        match value {
            Value::Null | Value::String(_) | Value::Number(_) => {
                for (property, v) in expand(&key, raw_of(value)) {
                    match v {
                        None => out.push((property, Pre::Null)),
                        Some(r) => out.push((property.clone(), Pre::Rule { property: property.clone(), value: vec![r], key_path: path_for(&property, &key) })),
                    }
                }
            }
            Value::Array(items) => {
                let mut eq: Vec<(String, Vec<Raw>)> = vec![];
                for item in items {
                    for (property, v) in expand(&key, raw_of(item)) {
                        let slot = match eq.iter_mut().find(|(p, _)| *p == property) {
                            Some(s) => s,
                            None => {
                                eq.push((property.clone(), vec![]));
                                eq.last_mut().unwrap()
                            }
                        };
                        if let Some(r) = v {
                            slot.1.push(r);
                        }
                    }
                }
                for (property, values) in eq {
                    let mut uniq: Vec<Raw> = vec![];
                    for v in values {
                        // `.filter(Boolean)` drops empty strings and 0.
                        let truthy = match &v {
                            Raw::Num(n) => *n != 0.0 && !n.is_nan(),
                            Raw::Str(s) => !s.is_empty(),
                        };
                        if truthy && !uniq.contains(&v) {
                            uniq.push(v);
                        }
                    }
                    if uniq.is_empty() {
                        out.push((property, Pre::Null));
                    } else {
                        let kp = if key_path.iter().any(|k| k == raw_key) {
                            key_path.iter().map(|k| if k == raw_key { property.clone() } else { k.clone() }).collect()
                        } else {
                            let mut p = key_path.to_vec();
                            p.push(property.clone());
                            p
                        };
                        out.push((property.clone(), Pre::Rule { property, value: uniq, key_path: kp }));
                    }
                }
            }
            Value::Object(obj) if !is_condition(&key) => {
                let mut eq: Vec<(String, Vec<(String, Pre)>)> = vec![];
                for (condition, inner) in obj {
                    let mut wrapper = Map::new();
                    wrapper.insert(key.clone(), inner.clone());
                    let kp = if !key_path.is_empty() {
                        let mut p = key_path.to_vec();
                        p.push(condition.clone());
                        p
                    } else {
                        vec![key.clone(), condition.clone()]
                    };
                    for (property, pre) in flatten(&wrapper, &kp)? {
                        match eq.iter_mut().find(|(p, _)| *p == property) {
                            Some((_, v)) => match v.iter_mut().find(|(c, _)| c == condition) {
                                Some(slot) => slot.1 = pre,
                                None => v.push((condition.clone(), pre)),
                            },
                            None => eq.push((property, vec![(condition.clone(), pre)])),
                        }
                    }
                }
                for (property, obj) in eq {
                    out.push((property, Pre::create(obj.into_iter().map(|(_, p)| p).collect())));
                }
            }
            Value::Object(obj) => {
                let mut kp = key_path.to_vec();
                kp.push(raw_key.clone());
                for (property, pre) in flatten(obj, &kp)? {
                    out.push((format!("{key}_{property}"), pre));
                }
            }
            _ => return Err(StylexError("A style value can only contain an array, string, number, boolean, null or undefined.".into())),
        }
    }
    Ok(out)
}

/// `lastMediaQueryWinsTransform`: in each conditional object, every
/// `@media` key excludes the ones after it, and moves to the end.
fn last_media_query_wins(obj: &Map<String, Value>, depth: usize) -> Result<Map<String, Value>, StylexError> {
    let mut result = Map::new();
    for (k, v) in obj {
        match v {
            Value::Object(o) => {
                result.insert(k.clone(), Value::Object(last_media_query_wins(o, depth + 1)?));
            }
            other => {
                result.insert(k.clone(), other.clone());
            }
        }
    }
    if depth >= 1 {
        let keys: Vec<String> = result.keys().filter(|k| k.starts_with("@media ")).cloned().collect();
        if keys.is_empty() {
            return Ok(result);
        }
        let bad = || StylexError("Invalid media query syntax.".into());
        let mut negations: Vec<media::Q> = vec![];
        let mut accumulated: Vec<Vec<media::Q>> = vec![];
        for i in (1..keys.len()).rev() {
            negations.push(media::parse(&keys[i]).ok_or_else(bad)?);
            accumulated.push(negations.clone());
        }
        accumulated.reverse();
        accumulated.push(vec![]);
        for (i, key) in keys.iter().enumerate() {
            let base = media::parse(key).ok_or_else(bad)?;
            let mut rev = accumulated[i].clone();
            rev.reverse();
            let combined = media::combine_with_negations(base, &rev);
            let new_key = media::to_string(&combined);
            let v = result.shift_remove(key).unwrap();
            result.insert(new_key, v);
        }
    }
    Ok(result)
}

/// `styleXKeyframes(frames)`: the animation name and its rule.
pub fn keyframes(frames: &Map<String, Value>) -> Result<(String, Rule), StylexError> {
    let mut ltr_frames = vec![];
    let mut rtl_frames = vec![];
    for (key, frame) in frames {
        let Value::Object(frame) = frame else { return Err(StylexError("Every frame within a keyframes() call must be an object.".into())) };
        let mut ltr = vec![];
        let mut rtl = vec![];
        for (k, v) in frame {
            for (prop, val) in expand(k, raw_of(v)) {
                let Some(val) = val else { continue };
                let dk = dashify(&prop);
                let tv = transform_value(&dk, &val)?;
                let (lk, lv) = generate_ltr(&dk, &tv);
                ltr.push(format!("{lk}:{lv};"));
                let (rk, rv) = generate_rtl(&dk, &tv).unwrap_or((dk.clone(), tv.clone()));
                rtl.push(format!("{rk}:{rv};"));
            }
        }
        ltr_frames.push(format!("{key}{{{}}}", ltr.concat()));
        rtl_frames.push(format!("{key}{{{}}}", rtl.concat()));
    }
    let ltr_s = ltr_frames.concat();
    let rtl_s = rtl_frames.concat();
    let name = format!("x{}-B", hash(&format!("<>{ltr_s}")));
    let ltr = format!("@keyframes {name}{{{ltr_s}}}");
    let rtl = if ltr_s == rtl_s { None } else { Some(format!("@keyframes {name}{{{rtl_s}}}")) };
    Ok((name.clone(), Rule { class: name, ltr, rtl, priority: 0.0 }))
}

/// `stylexFirstThatWorks(...args)`.
pub fn first_that_works(args: &[Value]) -> Value {
    let is_var = |v: &Value| v.as_str().is_some_and(|s| regress::Regex::new(r"^var\(--[a-zA-Z0-9-_]+\)$").unwrap().find(s).is_some());
    let Some(first_var) = args.iter().position(is_var) else {
        let mut r = args.to_vec();
        r.reverse();
        return Value::Array(r);
    };
    let mut priorities: Vec<Value> = args[..first_var].to_vec();
    priorities.reverse();
    let rest = &args[first_var..];
    let first_non_var = rest.iter().position(|a| !is_var(a));
    let mut var_parts: Vec<Value> = match first_non_var {
        None => rest.to_vec(),
        Some(i) => rest[..=i].to_vec(),
    };
    var_parts.reverse();
    let vars: Vec<String> = var_parts
        .iter()
        .map(|a| {
            let s = a.as_str().map(String::from).unwrap_or_else(|| crate::json::stringify(a, 0));
            if is_var(a) { s[4..s.len() - 1].to_string() } else { s }
        })
        .collect();
    let mut so_far = String::new();
    for v in vars {
        so_far = if !so_far.is_empty() {
            format!("var({v}, {so_far})")
        } else if v.starts_with("--") {
            format!("var({v})")
        } else {
            v
        };
    }
    let mut out = vec![Value::String(so_far)];
    out.extend(priorities);
    if out.len() == 1 { out.pop().unwrap() } else { Value::Array(out) }
}

/// `stylex.when.*(pseudo)` with the default marker.
pub fn when(kind: &str, pseudo: &str) -> Option<String> {
    let m = "x-default-marker";
    Some(match kind {
        "ancestor" => format!(":where(.{m}{pseudo} *)"),
        "descendant" => format!(":where(:has(.{m}{pseudo}))"),
        "siblingBefore" => format!(":where(.{m}{pseudo} ~ *)"),
        "siblingAfter" => format!(":where(:has(~ .{m}{pseudo}))"),
        "anySibling" => format!(":where(.{m}{pseudo} ~ *, :has(~ .{m}{pseudo}))"),
        _ => return None,
    })
}

/// `styleXCreateSet(namespaces)`: each namespace's compiled keys, and the
/// rules to inject.
pub type Namespaces = Vec<(String, Vec<(String, Option<String>)>)>;

pub fn create_set(namespaces: &Map<String, Value>) -> Result<(Namespaces, Vec<Rule>), StylexError> {
    create_set_with_paths(namespaces).map(|(n, r, _)| (n, r))
}

/// [`create_set`], with each namespace's class -> key path (`a_b`).
pub fn create_set_with_paths(namespaces: &Map<String, Value>) -> Result<(Namespaces, Vec<Rule>, Vec<Vec<(String, String)>>), StylexError> {
    let mut out = vec![];
    let mut all_paths: Vec<Vec<(String, String)>> = vec![];
    let mut injected: Vec<Rule> = vec![];
    for (name, ns) in namespaces {
        let Value::Object(ns) = ns else { return Err(StylexError("A StyleX namespace must be an object.".into())) };
        let processed = last_media_query_wins(ns, 0)?;
        let flat = flatten(&processed, &[])?;
        // Keep the last entry for each property, in its position from the end.
        let mut seen: Vec<String> = vec![];
        let mut kept: Vec<(String, Pre)> = vec![];
        for (k, p) in flat.into_iter().rev() {
            if seen.contains(&k) {
                continue;
            }
            seen.push(k.clone());
            kept.insert(0, (k, p));
        }
        let mut keys = vec![];
        let mut paths: Vec<(String, String)> = vec![];
        for (key, pre) in kept {
            let display = if !key.starts_with("--") { format!("k{}", create_short_hash(&format!("<>{key}"))) } else { key.clone() };
            let compiled = pre.compiled()?;
            let mut classes: Vec<String> = vec![];
            for (class, rule, path) in compiled.into_iter().flatten() {
                if let Some(slot) = paths.iter_mut().find(|(c, _)| *c == class) {
                    slot.1 = path;
                } else {
                    paths.push((class.clone(), path));
                }
                if !classes.contains(&class) {
                    classes.push(class.clone());
                }
                if !injected.iter().any(|r| r.class == class) {
                    injected.push(rule);
                }
            }
            let joined = classes.join(" ");
            keys.push((display, if joined.is_empty() { None } else { Some(joined) }));
        }
        out.push((name.clone(), keys));
        all_paths.push(paths);
    }
    Ok((out, injected, all_paths))
}

/// `processStylexRules(rules, {useLayers: false})`.
pub fn process_rules(rules: &[Rule]) -> String {
    if rules.is_empty() {
        return String::new();
    }
    let mut sorted: Vec<&Rule> = rules.iter().collect();
    sorted.sort_by(|a, b| {
        a.priority.partial_cmp(&b.priority).unwrap_or(std::cmp::Ordering::Equal).then_with(|| {
            let p1 = &a.ltr[a.ltr.rfind('{').unwrap_or(0)..];
            let p2 = &b.ltr[b.ltr.rfind('{').unwrap_or(0)..];
            crate::cli::collate::locale_compare(p1, p2).then_with(|| crate::cli::collate::locale_compare(&a.ltr, &b.ltr))
        })
    });
    let mut groups: Vec<Vec<&Rule>> = vec![];
    let mut last = -1i64;
    for r in sorted {
        let level = (r.priority / 1000.0).floor() as i64;
        if level == last {
            groups.last_mut().unwrap().push(r);
        } else {
            last = level;
            groups.push(vec![r]);
        }
    }
    let root_re = regress::Regex::new(r"\.([a-zA-Z0-9]+), \.([a-zA-Z0-9]+):root").unwrap();
    let fix_root = |s: &str| -> String {
        let mut out = String::new();
        let mut l = 0;
        for m in root_re.find_iter(s) {
            out.push_str(&s[l..m.start()]);
            let c = &s[m.group(1).unwrap()];
            out.push_str(&format!(".{c}.{c}, .{c}.{c}:root"));
            l = m.end();
        }
        out.push_str(&s[l..]);
        out
    };
    let mut blocks = vec![];
    for (index, group) in groups.iter().enumerate() {
        // Dedupe by class name, keeping the last rule in the first position.
        let mut uniq: Vec<(&str, &Rule)> = vec![];
        for r in group {
            match uniq.iter_mut().find(|(c, _)| *c == r.class) {
                Some(slot) => slot.1 = r,
                None => uniq.push((&r.class, r)),
            }
        }
        let mut lines = vec![];
        for (_, r) in uniq {
            let ltr = fix_root(&add_specificity(&r.ltr, index));
            match &r.rtl {
                Some(rtl) => {
                    let rtl = fix_root(&add_specificity(rtl, index));
                    lines.push(add_ancestor(&ltr, "html:not([dir='rtl'])"));
                    lines.push(add_ancestor(&rtl, "html[dir='rtl']"));
                }
                None => lines.push(ltr),
            }
        }
        blocks.push(lines.join("\n"));
    }
    blocks.join("\n")
}

fn add_specificity(selector: &str, index: usize) -> String {
    if selector.starts_with("@keyframes") {
        return selector.to_string();
    }
    let pseudo = ":not(#\\#)".repeat(index);
    let at = if selector.contains("::") { selector.find("::").unwrap() } else { selector.rfind('{').unwrap_or(0) };
    format!("{}{pseudo}{}", &selector[..at], &selector[at..])
}

fn add_ancestor(selector: &str, ancestor: &str) -> String {
    if selector.starts_with("@keyframes") {
        return selector.to_string();
    }
    if !selector.starts_with('@') {
        return format!("{ancestor} {selector}");
    }
    let last_at = selector.rfind('@').unwrap();
    let brace = selector[last_at..].find('{').map(|i| i + last_at).unwrap_or(selector.len());
    format!("{}{ancestor} {}", &selector[..brace + 1], &selector[brace + 1..])
}

/// The compiled namespaces as a JS object literal.
pub fn compiled_js(namespaces: &[(String, Vec<(String, Option<String>)>)]) -> String {
    let q = |s: &str| {
        let mut o = String::new();
        crate::json::quote(&mut o, s);
        o
    };
    let parts: Vec<String> = namespaces
        .iter()
        .map(|(name, keys)| {
            let mut inner: Vec<String> = keys.iter().map(|(k, v)| format!("{}: {}", q(k), v.as_ref().map(|c| q(c)).unwrap_or_else(|| "null".into()))).collect();
            inner.push("$$css: true".into());
            format!("{}: {{{}}}", q(name), inner.join(", "))
        })
        .collect();
    format!("{{{}}}", parts.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hashes() {
        assert_eq!(format!("x{}", hash("<>padding8pxnull")), "xe8ttls");
        assert_eq!(format!("x{}", hash("<>colorrebeccapurplenull")), "x1n0khkq");
    }
}
