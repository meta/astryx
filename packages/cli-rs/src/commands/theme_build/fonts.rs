//! `api/theme/build/font-warning.mjs`: fonts a theme names but does not load.

use crate::json::Value;

const GENERIC: [&str; 18] = [
    "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "math", "emoji", "fangsong", "ui-serif",
    "ui-sans-serif", "ui-monospace", "ui-rounded", "inherit", "initial", "unset", "revert", "revert-layer",
];

const SYSTEM: &[&str] = &[
    "-apple-system", "blinkmacsystemfont", "segoe ui", "segoe ui emoji", "segoe ui symbol", "roboto", "helvetica",
    "helvetica neue", "arial", "arial black", "sf mono", "sf pro", "sf pro text", "sf pro display", "monaco",
    "consolas", "menlo", "courier", "courier new", "georgia", "times", "times new roman", "verdana", "tahoma",
    "trebuchet ms", "impact", "palatino", "cambria", "calibri", "lucida grande", "lucida console", "gill sans",
    "brush script mt", "snell roundhand", "old english text mt", "liberation mono", "liberation sans",
    "liberation serif", "dejavu sans", "dejavu sans mono",
];

fn regex(p: &str) -> regress::Regex {
    regress::Regex::new(p).expect("regex")
}

fn split_families(value: &str) -> Vec<String> {
    let vars = regex(r"var\([^()]*(?:\([^()]*\)[^()]*)*\)");
    let mut without = String::new();
    let mut last = 0;
    for m in vars.find_iter(value) {
        without.push_str(&value[last..m.start()]);
        last = m.end();
    }
    without.push_str(&value[last..]);
    let seg = regex(r#""[^"]*"|'[^']*'|[^,"'\s][^,]*"#);
    let ws = regex(r"\s+");
    let mut out = Vec::new();
    for m in seg.find_iter(&without) {
        let mut name = without[m.range()].trim_matches(crate::cli::format::js_ws).to_string();
        if name.is_empty() {
            continue;
        }
        let quoted = name.len() >= 2
            && ((name.starts_with('"') && name.ends_with('"')) || (name.starts_with('\'') && name.ends_with('\'')));
        if quoted {
            let inner: Vec<char> = name.chars().collect();
            name = inner[1..inner.len() - 1].iter().collect();
        }
        let trimmed = name.trim_matches(crate::cli::format::js_ws).to_string();
        let mut collapsed = String::new();
        let mut last = 0;
        for m in ws.find_iter(&trimmed) {
            collapsed.push_str(&trimmed[last..m.start()]);
            collapsed.push(' ');
            last = m.end();
        }
        collapsed.push_str(&trimmed[last..]);
        if collapsed.is_empty() || (!quoted && (collapsed.contains('(') || collapsed.contains(')'))) {
            continue;
        }
        out.push(collapsed);
    }
    out
}

/// `collectUnloadedFonts(resolvedTheme)`.
pub fn collect_unloaded_fonts(theme: &Value) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    let mut unloaded = Vec::new();
    let mut consider = |v: Option<&Value>| {
        let Some(Value::String(s)) = v else { return };
        for f in split_families(s) {
            let key = f.to_lowercase();
            if GENERIC.contains(&key.as_str()) || SYSTEM.contains(&key.as_str()) {
                continue;
            }
            if seen.contains(&key) {
                continue;
            }
            seen.push(key);
            unloaded.push(f);
        }
    };
    if let Some(Value::Object(tokens)) = theme.get("tokens") {
        for (k, v) in tokens {
            if k.starts_with("--font-family-") {
                consider(Some(v));
            }
        }
    }
    for part in ["body", "heading", "code"] {
        let t = theme.get("typography").and_then(|t| t.get(part));
        if let Some(t) = t {
            if super::build_impl::truthy(t.get("family")) {
                consider(t.get("family"));
                consider(t.get("fallbacks"));
            }
        }
    }
    fn walk(node: Option<&Value>, f: &mut dyn FnMut(Option<&Value>)) {
        match node {
            Some(Value::Object(m)) if !m.contains_key("__js") => {
                for (k, v) in m {
                    if k == "fontFamily" {
                        f(Some(v));
                    } else {
                        walk(Some(v), f);
                    }
                }
            }
            Some(Value::Array(a)) => {
                for (_, v) in a.iter().enumerate() {
                    walk(Some(v), f);
                }
            }
            _ => {}
        }
    }
    walk(theme.get("components"), &mut consider);
    unloaded
}

fn encode_uri_component(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn recipe(families: &[String], cwd: &str) -> String {
    let href = format!(
        "https://fonts.googleapis.com/css2?{}&display=swap",
        families.iter().map(|f| format!("family={}", encode_uri_component(f).replace("%20", "+"))).collect::<Vec<_>>().join("&")
    );
    let first = &families[0];
    let slug = first.to_lowercase().replace(' ', "-");
    let mut q = String::new();
    crate::json::quote(&mut q, first);
    format!(
        "  The built CSS only sets font-family; load these in your app, or every\n  browser quietly falls back.\n\n  Google Fonts (add :wght@... axes as your theme's weights require):\n\n    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\" />\n    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin />\n    <link rel=\"stylesheet\" href=\"{href}\" />\n\n  Self-hosted (repeat per family and weight):\n\n    @font-face {{\n      font-family: {q};\n      src: url('/fonts/{slug}.woff2') format('woff2');\n      font-display: swap;\n    }}\n\n  Recipe and fallback-stack guidance: {}\n",
        crate::cli::env::format_cli_command_at(std::path::Path::new(cwd), "docs typography")
    )
}

pub fn font_loading_help(theme: &str, families: &[String], cwd: &str) -> String {
    let named: Vec<String> = families.iter().map(|f| format!("\"{f}\"")).collect();
    format!("\n[note] Theme \"{theme}\" names fonts it does not load: {}\n{}", named.join(", "), recipe(families, cwd))
}

pub fn batch_font_loading_help(entries: &[(String, Vec<String>)], cwd: &str) -> String {
    let named: Vec<String> = entries.iter().map(|(f, t)| format!("  \"{f}\" ({})", t.join(", "))).collect();
    let fams: Vec<String> = entries.iter().map(|e| e.0.clone()).collect();
    format!("\n[note] The built themes name fonts they do not load:\n{}\n{}", named.join("\n"), recipe(&fams, cwd))
}
