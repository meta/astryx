//! Port of `api/theme/palette/generate/color.mjs`: OKLCH conversions with the
//! reference Node's floating-point results.

use crate::js::jsmath;

pub type Triple = [f64; 3];

fn srgb_to_linear(channel: f64) -> f64 {
    let value = channel / 255.0;
    if value <= 0.04045 {
        value / 12.92
    } else {
        jsmath::pow((value + 0.055) / 1.055, 2.4)
    }
}

/// `Math.round`: halves round toward +Infinity.
pub fn js_round(x: f64) -> f64 {
    if !x.is_finite() || x == 0.0 {
        return x;
    }
    let f = x.floor();
    if x - f >= 0.5 {
        f + 1.0
    } else {
        f
    }
}

fn linear_to_srgb(channel: f64) -> f64 {
    let value = if channel <= 0.0031308 { channel * 12.92 } else { 1.055 * jsmath::pow(channel, 1.0 / 2.4) - 0.055 };
    js_round(255f64.min(0f64.max(value * 255.0)))
}

/// `Math.max(a, b)` for non-NaN-sensitive callers: NaN wins, as in JS.
pub fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_negative() {
            b
        } else {
            a
        }
    } else if a > b {
        a
    } else {
        b
    }
}

pub fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_negative() {
            a
        } else {
            b
        }
    } else if a < b {
        a
    } else {
        b
    }
}

fn hex_to_rgb(hex: &str) -> Triple {
    let value = hex.replacen('#', "", 1);
    let chars: Vec<char> = value.chars().collect();
    let full: String = if chars.len() == 3 {
        [chars[0], chars[0], chars[1], chars[1], chars[2], chars[2]].iter().collect()
    } else {
        chars.iter().take(6).collect()
    };
    let numeric = i64::from_str_radix(&full, 16).unwrap_or(0) as i32;
    [((numeric >> 16) & 0xff) as f64, ((numeric >> 8) & 0xff) as f64, (numeric & 0xff) as f64]
}

fn rgb_to_hex(r: f64, g: f64, b: f64) -> String {
    let mut s = String::from("#");
    for c in [r, g, b] {
        let v = js_round(js_max(0.0, js_min(255.0, c))) as i64;
        s.push_str(&format!("{:02x}", v));
    }
    s
}

fn linear_rgb_to_oklab(red: f64, green: f64, blue: f64) -> Triple {
    let l_root = jsmath::cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
    let m_root = jsmath::cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
    let s_root = jsmath::cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
    [
        0.2104542553 * l_root + 0.793617785 * m_root - 0.0040720468 * s_root,
        1.9779984951 * l_root - 2.428592205 * m_root + 0.4505937099 * s_root,
        0.0259040371 * l_root + 0.7827717662 * m_root - 0.808675766 * s_root,
    ]
}

fn oklab_to_linear_rgb(lightness: f64, a: f64, b: f64) -> Triple {
    let l_root = lightness + 0.3963377774 * a + 0.2158037573 * b;
    let m_root = lightness - 0.1055613458 * a - 0.0638541728 * b;
    let s_root = lightness - 0.0894841775 * a - 1.291485548 * b;
    let l = jsmath::pow(l_root, 3.0);
    let m = jsmath::pow(m_root, 3.0);
    let s = jsmath::pow(s_root, 3.0);
    [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]
}

fn is_hex_digits(s: &str, n: usize) -> bool {
    s.chars().count() == n && s.chars().all(|c| c.is_ascii_hexdigit())
}

/// `normalizeColor(input)`, given `String(input)` already; the error message
/// uses `${input}`, which is the same string.
pub fn normalize_color_str(input: &str) -> Result<String, String> {
    let value = input.trim_matches(crate::cli::format::js_ws);
    let body = value.strip_prefix('#').unwrap_or(value);
    if is_hex_digits(body, 3) {
        let hex = body.to_ascii_lowercase();
        let c: Vec<char> = hex.chars().collect();
        return Ok(format!("#{0}{0}{1}{1}{2}{2}", c[0], c[1], c[2]));
    }
    if is_hex_digits(body, 6) {
        return Ok(format!("#{}", body.to_ascii_lowercase()));
    }
    Err(format!("Invalid color: {input}"))
}

#[derive(Clone, Copy, Debug)]
pub struct Oklch {
    pub l: f64,
    pub c: f64,
    pub h: f64,
}

pub fn hex_to_oklch(hex: &str) -> Oklch {
    let [r, g, b] = hex_to_rgb(&normalize_color_str(hex).unwrap_or_else(|_| hex.to_string()));
    let [l, a, bb] = linear_rgb_to_oklab(srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b));
    let mut hue = (jsmath::atan2(bb, a) * 180.0) / std::f64::consts::PI;
    if hue < 0.0 {
        hue += 360.0;
    }
    Oklch { l, c: (a * a + bb * bb).sqrt(), h: hue }
}

fn oklch_in_gamut(lightness: f64, chroma: f64, hue: f64) -> bool {
    let radians = (hue * std::f64::consts::PI) / 180.0;
    let [r, g, b] = oklab_to_linear_rgb(lightness, chroma * jsmath::cos(radians), chroma * jsmath::sin(radians));
    r >= -0.001 && r <= 1.001 && g >= -0.001 && g <= 1.001 && b >= -0.001 && b <= 1.001
}

fn oklch_to_hex(lightness: f64, chroma: f64, hue: f64) -> String {
    if lightness <= 0.0 {
        return "#000000".into();
    }
    if lightness >= 1.0 {
        return "#ffffff".into();
    }
    let radians = (hue * std::f64::consts::PI) / 180.0;
    let [r, g, b] = oklab_to_linear_rgb(lightness, chroma * jsmath::cos(radians), chroma * jsmath::sin(radians));
    rgb_to_hex(linear_to_srgb(js_max(0.0, r)), linear_to_srgb(js_max(0.0, g)), linear_to_srgb(js_max(0.0, b)))
}

pub fn max_oklch_chroma(hue: f64, lightness: f64) -> f64 {
    let mut low = 0.0;
    let mut high = 0.4;
    for _ in 0..20 {
        let middle = (low + high) / 2.0;
        if oklch_in_gamut(lightness, middle, hue) {
            low = middle;
        } else {
            high = middle;
        }
    }
    low
}

pub fn oklch_clamped_hex(lightness: f64, chroma: f64, hue: f64) -> String {
    if oklch_in_gamut(lightness, chroma, hue) {
        return oklch_to_hex(lightness, chroma, hue);
    }
    oklch_to_hex(lightness, max_oklch_chroma(hue, lightness), hue)
}

pub fn tone_to_oklab_lightness(tone: f64) -> f64 {
    if tone <= 0.0 {
        return 0.0;
    }
    if tone >= 100.0 {
        return 1.0;
    }
    let relative = if tone > 8.0 { jsmath::pow((tone + 16.0) / 116.0, 3.0) } else { tone / 903.3 };
    jsmath::cbrt(relative)
}

pub fn luminance(hex: &str) -> f64 {
    let [r, g, b] = hex_to_rgb(hex);
    0.2126 * srgb_to_linear(r) + 0.7152 * srgb_to_linear(g) + 0.0722 * srgb_to_linear(b)
}

pub fn oklab_coordinates(hex: &str) -> Triple {
    let v = hex_to_oklch(hex);
    let radians = (v.h * std::f64::consts::PI) / 180.0;
    [v.l, v.c * jsmath::cos(radians), v.c * jsmath::sin(radians)]
}

/// JS `%` on doubles (fmod semantics).
pub fn js_rem(a: f64, b: f64) -> f64 {
    a % b
}

pub fn oklab_coordinates_to_hex(c: Triple) -> String {
    let [l, a, b] = c;
    let chroma = (a * a + b * b).sqrt();
    let hue = js_rem((jsmath::atan2(b, a) * 180.0) / std::f64::consts::PI + 360.0, 360.0);
    oklch_clamped_hex(js_min(1.0, js_max(0.0, l)), chroma, hue)
}
