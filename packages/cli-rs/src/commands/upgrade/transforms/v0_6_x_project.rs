//! Project codemods: v0.6.4 `migrate-theme-catalog-to-descriptors` and v0.6.7
//! `migrate-copied-themes-to-descriptors`.

use crate::commands::integration::add_helpers::find_local_manifest;
use crate::commands::integration::add_theme::theme_descriptor_source;
use crate::commands::integration::manifest_load::load_manifest_labeled;
use crate::commands::upgrade::jsre;
use crate::commands::upgrade::transforms::ProjectPlan;
use serde_json::Value;
use std::path::{Component, Path, PathBuf};

fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// `path.relative(from, to)` for absolute, normalized paths.
fn relative(from: &Path, to: &Path) -> String {
    let f: Vec<_> = from.components().collect();
    let t: Vec<_> = to.components().collect();
    let mut i = 0;
    while i < f.len() && i < t.len() && f[i] == t[i] {
        i += 1;
    }
    let mut parts: Vec<String> = vec![];
    for _ in i..f.len() {
        parts.push("..".into());
    }
    for c in &t[i..] {
        parts.push(c.as_os_str().to_string_lossy().to_string());
    }
    parts.join("/")
}

fn js_stringify_or_undefined(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(v) => crate::json::stringify(v, 0),
    }
}

pub fn migrate_theme_catalog_to_descriptors(root: &Path) -> Result<ProjectPlan, String> {
    let root = normalize(root);
    let mut plan = ProjectPlan::default();
    let rel = |f: &Path| relative(&root, f);
    let manifest_file = match find_local_manifest(&root).map_err(|e| e.message)? {
        Some(m) => m,
        None => return Ok(plan),
    };
    let base = manifest_file.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let manifest = load_manifest_labeled(&manifest_file, &format!("Integration manifest {}", base)).map_err(|e| e.message)?;
    let themes = match manifest.get("themes").and_then(|t| t.as_str()) {
        Some(t) => t.to_string(),
        None => return Ok(plan),
    };
    let themes_root = normalize(&root.join(&themes));
    let from_root = relative(&root, &themes_root);
    if from_root.starts_with("..") || from_root.starts_with('/') {
        return Ok(plan);
    }
    let catalog_file = themes_root.join("manifest.json");
    if !catalog_file.exists() {
        return Ok(plan);
    }
    let catalog_path = rel(&catalog_file);
    let text = std::fs::read_to_string(&catalog_file).unwrap_or_default();
    let catalog: Value = match crate::commands::theme_build::jsonparse::parse(&text) {
        Ok(v) => v,
        Err(e) => {
            plan.problems.push((catalog_path, format!("is not valid JSON ({}).", e)));
            return Ok(plan);
        }
    };
    let entries = match (catalog.get("version").and_then(|v| v.as_f64()), catalog.get("themes").and_then(|t| t.as_array())) {
        (Some(v), Some(t)) if v == 1.0 && catalog.is_object() => t.clone(),
        _ => {
            plan.problems.push((catalog_path, "is not a version 1 theme catalog.".into()));
            return Ok(plan);
        }
    };
    let slug_re = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$";
    let source_re = "\\.(?:ts|tsx|mjs|js)$";
    for (index, entry) in entries.iter().enumerate() {
        let slug = match entry.get("slug").and_then(|s| s.as_str()) {
            Some(s) if jsre::test(slug_re, "u", s) => s.to_string(),
            _ => {
                plan.problems.push((catalog_path.clone(), format!("themes[{}] has no lowercase kebab-case slug; fix the entry or add that theme's descriptor by hand.", index)));
                continue;
            }
        };
        let theme_dir = themes_root.join(&slug);
        let source = entry.get("entry");
        let src_ok = source.and_then(|s| s.as_str()).filter(|s| jsre::test(source_re, "u", s) && !s.contains('/'));
        let source_s = match src_ok {
            Some(s) => s.to_string(),
            None => {
                plan.problems.push((catalog_path.clone(), format!("theme \"{}\" has entry {}; a descriptor sits beside a .ts, .tsx, .mjs, or .js source directly in {}/.", slug, js_stringify_or_undefined(source), rel(&theme_dir))));
                continue;
            }
        };
        let stem = jsre::replace_fn(source_re, "u", &source_s, |_| String::new());
        if entry.get("exportName").and_then(|e| e.as_str()) != Some(stem.as_str()) {
            plan.problems.push((catalog_path.clone(), format!("theme \"{}\" exports {} from {}; a descriptor takes the export name from the file name, so rename the export or the file to match.", slug, js_stringify_or_undefined(entry.get("exportName")), source_s)));
            continue;
        }
        let display = match entry.get("displayName").and_then(|d| d.as_str()) {
            Some(d) if !crate::commands::upgrade::css::postcss::js_trim(d).is_empty() => d.to_string(),
            _ => {
                plan.problems.push((catalog_path.clone(), format!("theme \"{}\" has no displayName.", slug)));
                continue;
            }
        };
        let description = match entry.get("description").and_then(|d| d.as_str()) {
            Some(d) => d.to_string(),
            None => {
                plan.problems.push((catalog_path.clone(), format!("theme \"{}\" has no description string.", slug)));
                continue;
            }
        };
        let maintained = match entry.get("maintained").and_then(|m| m.as_bool()) {
            Some(m) => m,
            None => {
                plan.problems.push((catalog_path.clone(), format!("theme \"{}\" has no maintained flag.", slug)));
                continue;
            }
        };
        if !theme_dir.join(&source_s).exists() {
            plan.problems.push((rel(&theme_dir), format!("holds no {} for theme \"{}\".", source_s, slug)));
            continue;
        }
        let descriptor = theme_dir.join(format!("{}.doc.mjs", stem));
        if descriptor.exists() {
            continue;
        }
        plan.writes.push((descriptor, theme_descriptor_source(&slug, &display, &description, maintained)));
    }
    if !plan.problems.is_empty() {
        return Ok(ProjectPlan { writes: vec![], deletes: vec![], problems: plan.problems });
    }
    plan.deletes.push(catalog_file);
    Ok(plan)
}

fn display_name(slug: &str) -> String {
    slug.split('-')
        .map(|p| {
            let mut cs = p.chars();
            match cs.next() {
                Some(f) => f.to_uppercase().collect::<String>() + cs.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn migrate_copied_themes_to_descriptors(root: &Path) -> Result<ProjectPlan, String> {
    let root = normalize(root);
    let root_s = root.to_string_lossy().to_string();
    let mut plan = ProjectPlan::default();
    for (slug, _dir, _source, descriptor) in crate::commands::theme::discovery::unmigrated_copies(&root_s) {
        let name = display_name(&slug);
        let contents = theme_descriptor_source(&slug, &name, &format!("{} theme copied into this app.", name), false);
        plan.writes.push((normalize(&root.join(descriptor)), contents));
    }
    Ok(plan)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn entry(slug: &str, export: Option<&str>, src: Option<&str>) -> Value {
        let id: String = {
            let mut out = String::new();
            let mut up = false;
            for c in slug.chars() {
                if c == '-' {
                    up = true;
                } else if up {
                    out.extend(c.to_uppercase());
                    up = false;
                } else {
                    out.push(c);
                }
            }
            out
        };
        let dn = display_name(slug);
        serde_json::json!({"slug": slug, "displayName": dn, "description": format!("{} theme.", dn), "maintained": true,
            "entry": src.map(|s| s.to_string()).unwrap_or(format!("{}Theme.ts", id)), "exportName": export.map(|s| s.to_string()).unwrap_or(format!("{}Theme", id))})
    }

    fn kit(themes: &[Value]) -> PathBuf {
        let root = std::env::temp_dir().join(format!("astryx-theme-catalog-rs-{}-{}", std::process::id(), themes.len()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("themes")).unwrap();
        fs::write(root.join("package.json"), "{\"name\":\"@acme/kit\",\"version\":\"1.0.0\"}\n").unwrap();
        fs::write(root.join("astryx.integration.mjs"), "export default {themes: './themes'};\n").unwrap();
        for t in themes {
            let src = root.join("themes").join(t["slug"].as_str().unwrap()).join(t["entry"].as_str().unwrap());
            fs::create_dir_all(src.parent().unwrap()).unwrap();
            fs::write(&src, "export const x = 1;\n").unwrap();
        }
        fs::write(root.join("themes/manifest.json"), serde_json::json!({"version": 1, "themes": themes}).to_string()).unwrap();
        root
    }

    #[test]
    fn catalog_plans_descriptors_and_problems() {
        let root = kit(&[entry("ocean", None, None), entry("deep-sea", None, None)]);
        let plan = migrate_theme_catalog_to_descriptors(&root).unwrap();
        assert!(plan.problems.is_empty(), "{:?}", plan.problems);
        assert_eq!(plan.writes.len(), 2);
        assert_eq!(plan.writes[0].1, "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {\n  type: 'theme',\n  name: 'ocean',\n  displayName: 'Ocean',\n  description: 'Ocean theme.',\n  maintained: true,\n};\n");
        assert_eq!(plan.deletes, vec![root.join("themes/manifest.json")]);
        let _ = fs::remove_dir_all(&root);

        let root = kit(&[entry("ocean", None, None), entry("sea", Some("oceanBlue"), None), entry("nested", None, Some("src/nestedTheme.ts"))]);
        fs::remove_file(root.join("themes/ocean/oceanTheme.ts")).unwrap();
        let plan = migrate_theme_catalog_to_descriptors(&root).unwrap();
        assert_eq!(
            plan.problems,
            vec![
                ("themes/ocean".to_string(), "holds no oceanTheme.ts for theme \"ocean\".".to_string()),
                ("themes/manifest.json".to_string(), "theme \"sea\" exports \"oceanBlue\" from seaTheme.ts; a descriptor takes the export name from the file name, so rename the export or the file to match.".to_string()),
                ("themes/manifest.json".to_string(), "theme \"nested\" has entry \"src/nestedTheme.ts\"; a descriptor sits beside a .ts, .tsx, .mjs, or .js source directly in themes/nested/.".to_string()),
            ]
        );
        assert!(plan.writes.is_empty() && plan.deletes.is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn catalog_invalid_json_uses_v8_messages() {
        // Messages from Node 22's JSON.parse.
        let cases = [
            ("{\"version\": 1,", "Expected double-quoted property name in JSON at position 14 (line 1 column 15)"),
            ("{version: 1}", "Expected property name or '}' in JSON at position 1 (line 1 column 2)"),
            ("", "Unexpected end of JSON input"),
            ("{\"a\":1}x", "Unexpected non-whitespace character after JSON at position 7 (line 1 column 8)"),
            ("[1,]", "Unexpected token ']', \"[1,]\" is not valid JSON"),
        ];
        for (i, (text, msg)) in cases.iter().enumerate() {
            let root = kit(&[]);
            let root2 = root.with_file_name(format!("{}-bad{}", root.file_name().unwrap().to_string_lossy(), i));
            let _ = fs::remove_dir_all(&root2);
            fs::rename(&root, &root2).unwrap();
            fs::write(root2.join("themes/manifest.json"), text).unwrap();
            let plan = migrate_theme_catalog_to_descriptors(&root2).unwrap();
            assert_eq!(plan.problems, vec![("themes/manifest.json".to_string(), format!("is not valid JSON ({}).", msg))]);
            let _ = fs::remove_dir_all(&root2);
        }
    }
}
