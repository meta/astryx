//! Port of `foundation/render/ts-paths.mjs`: a project's `compilerOptions.paths`
//! matched by TypeScript's rules.

use crate::discovery::nodepath as np;

const EXTENSIONS: [&str; 9] = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".mts", ".cts", ".json"];

#[derive(Debug, Clone)]
pub struct PathPattern {
    pub key: String,
    pub prefix: String,
    pub suffix: String,
    pub wildcard: bool,
    pub targets: Vec<String>,
}

pub struct PathMatch<'a> {
    pub pattern: &'a PathPattern,
    pub capture: String,
}

/// `readPathsIn(dir)`: None when neither config exists.
pub fn read_paths_in(dir: &str) -> Option<Vec<PathPattern>> {
    for name in ["tsconfig.json", "jsconfig.json"] {
        let file = np::join2(dir, name);
        if !np::exists(&file) {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&file) else { return Some(vec![]) };
        let strip = regress::Regex::new(r#"("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\/"#).unwrap();
        let mut text = String::new();
        let mut last = 0;
        for m in strip.find_iter(&raw) {
            text.push_str(&raw[last..m.start()]);
            if let Some(g) = m.group(1) {
                text.push_str(&raw[g]);
            }
            last = m.end();
        }
        text.push_str(&raw[last..]);
        let comma = regress::Regex::new(r",(\s*[}\]])").unwrap();
        let mut t2 = String::new();
        let mut last = 0;
        for m in comma.find_iter(&text) {
            t2.push_str(&text[last..m.start()]);
            t2.push_str(&text[m.group(1).unwrap()]);
            last = m.end();
        }
        t2.push_str(&text[last..]);
        let Ok(json) = serde_json::from_str::<crate::json::Value>(&t2) else { return Some(vec![]) };
        let options = json.get("compilerOptions").cloned().unwrap_or(crate::json::Value::Null);
        let base = np::resolve(&[dir, options.get("baseUrl").and_then(|b| b.as_str()).unwrap_or(".")]);
        let mut out = vec![];
        if let Some(paths) = options.get("paths").and_then(|p| p.as_object()) {
            for (key, targets) in paths {
                let Some(arr) = targets.as_array() else { continue };
                let star = key.find('*');
                if star != key.rfind('*') {
                    continue;
                }
                out.push(PathPattern {
                    key: key.clone(),
                    prefix: match star {
                        Some(s) => key[..s].to_string(),
                        None => key.clone(),
                    },
                    suffix: star.map(|s| key[s + 1..].to_string()).unwrap_or_default(),
                    wildcard: star.is_some(),
                    targets: arr
                        .iter()
                        .filter_map(|t| t.as_str())
                        .filter(|t| t.find('*') == t.rfind('*'))
                        .map(|t| np::resolve(&[&base, t]))
                        .collect(),
                });
            }
        }
        return Some(out);
    }
    None
}

/// `matchPath(patterns, spec)`.
pub fn match_path<'a>(patterns: &'a [PathPattern], spec: &str) -> Option<PathMatch<'a>> {
    if spec.starts_with('/') || spec == "." || spec == ".." || spec.starts_with("./") || spec.starts_with("../") {
        return None;
    }
    if let Some(p) = patterns.iter().find(|p| !p.wildcard && p.key == spec) {
        return Some(PathMatch { pattern: p, capture: String::new() });
    }
    let mut best: Option<PathMatch> = None;
    let su: Vec<u16> = spec.encode_utf16().collect();
    for p in patterns {
        if !p.wildcard {
            continue;
        }
        let pl = p.prefix.encode_utf16().count();
        let sl = p.suffix.encode_utf16().count();
        if su.len() < pl + sl || !spec.starts_with(&p.prefix) || !spec.ends_with(&p.suffix) {
            continue;
        }
        if let Some(b) = &best {
            if b.pattern.prefix.encode_utf16().count() >= pl {
                continue;
            }
        }
        best = Some(PathMatch { pattern: p, capture: String::from_utf16_lossy(&su[pl..su.len() - sl]) });
    }
    best
}

fn existing_file(candidate: &str) -> Option<String> {
    let is_file = |f: &str| np::is_file(f);
    if is_file(candidate) {
        return Some(candidate.to_string());
    }
    for e in EXTENSIONS {
        let c = format!("{candidate}{e}");
        if is_file(&c) {
            return Some(c);
        }
    }
    for e in EXTENSIONS {
        let c = np::join2(candidate, &format!("index{e}"));
        if is_file(&c) {
            return Some(c);
        }
    }
    None
}

/// `resolvePath(patterns, spec)`.
pub fn resolve_path(patterns: &[PathPattern], spec: &str) -> Option<String> {
    let m = match_path(patterns, spec)?;
    m.pattern.targets.iter().map(|t| t.replacen('*', &m.capture, 1)).find_map(|c| existing_file(&c))
}

/// `namesAlias(spec)`: a key with a literal prefix matches it.
pub fn names_alias(patterns: &[PathPattern], spec: &str) -> bool {
    match_path(patterns, spec).is_some_and(|m| !m.pattern.prefix.is_empty())
}
