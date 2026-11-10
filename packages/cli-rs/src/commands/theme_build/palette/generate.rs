//! Port of `api/theme/palette/generate/generate.mjs`: read the request, run
//! the recipe, serialize the candidate and receipt, and write them safely.

use super::generator::*;
use super::preview::{render_palette_preview, PALETTE_PREVIEW_VERSION};
use crate::commands::theme_build::nodepath;
use crate::json::{self, Map, Value};
use indexmap::IndexMap;
use sha2::{Digest, Sha256};
use std::fs;
use std::os::unix::fs::MetadataExt;

pub const PALETTE_TYPESCRIPT_FORMAT_VERSION: &str = "palette-typescript-v1";
pub const PALETTE_JSON_FORMAT_VERSION: &str = "palette-json-v1";

/// An `AstryxError`: message and stable code.
pub struct ApiError {
    pub message: String,
    pub code: &'static str,
}

fn err(message: impl Into<String>, code: &'static str) -> ApiError {
    ApiError { message: message.into(), code }
}

pub struct CandidateFamily {
    pub id: String,
    pub name: String,
    pub light: Option<IndexMap<String, String>>,
    pub dark: Option<IndexMap<String, String>>,
}

impl CandidateFamily {
    pub fn ramp(&self, mode: &str) -> Option<&IndexMap<String, String>> {
        if mode == "light" {
            self.light.as_ref()
        } else {
            self.dark.as_ref()
        }
    }

    /// Entries ordered as `Object.entries(colors).sort(by Number(key))`:
    /// the JS key order first, then a stable numeric sort.
    pub fn sorted(&self, colors: &IndexMap<String, String>) -> Vec<(String, String)> {
        let ordered = colors_json(colors);
        let mut v: Vec<(String, String)> = ordered
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.as_str().unwrap_or_default().to_string()))
            .collect();
        v.sort_by(|a, b| {
            let d = a.0.parse::<f64>().unwrap_or(f64::NAN) - b.0.parse::<f64>().unwrap_or(f64::NAN);
            if d < 0.0 {
                std::cmp::Ordering::Less
            } else if d > 0.0 {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        });
        v
    }
}

pub struct Candidate {
    pub recipe: String,
    pub black: String,
    pub white: String,
    pub stops: Vec<f64>,
    pub palette: Vec<CandidateFamily>,
}

impl Candidate {
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("schemaVersion".into(), Value::from(1));
        m.insert("status".into(), Value::String("candidate".into()));
        m.insert("recipe".into(), Value::String(self.recipe.clone()));
        m.insert("black".into(), Value::String(self.black.clone()));
        m.insert("white".into(), Value::String(self.white.clone()));
        m.insert("stops".into(), Value::Array(self.stops.iter().map(|s| json::num(*s)).collect()));
        let mut p = Map::new();
        for f in &self.palette {
            let mut fm = Map::new();
            fm.insert("name".into(), Value::String(f.name.clone()));
            if let Some(l) = &f.light {
                fm.insert("light".into(), colors_json(l));
            }
            if let Some(d) = &f.dark {
                fm.insert("dark".into(), colors_json(d));
            }
            p.insert(f.id.clone(), Value::Object(fm));
        }
        m.insert("palette".into(), Value::Object(p));
        Value::Object(m)
    }
}

fn snapshot(result: &GenerationResult) -> Candidate {
    Candidate {
        recipe: PALETTE_RECIPE.into(),
        black: PALETTE_BLACK.into(),
        white: PALETTE_WHITE.into(),
        stops: result.request.stops.clone(),
        palette: result
            .families
            .iter()
            .map(|f| CandidateFamily {
                id: f.id.clone(),
                name: f.name.clone(),
                light: f.light.as_ref().map(|r| r.colors.clone()),
                dark: f.dark.as_ref().map(|r| r.colors.clone()),
            })
            .collect(),
    }
}

fn quote(s: &str) -> String {
    let mut o = String::new();
    json::quote(&mut o, s);
    o
}

fn serialize_ramp(f: &CandidateFamily, colors: &IndexMap<String, String>, indentation: usize) -> String {
    let prefix = " ".repeat(indentation);
    let entries: Vec<String> =
        f.sorted(colors).iter().map(|(stop, color)| format!("{prefix}  {}: {}", quote(stop), quote(color))).collect();
    format!("{{\n{}\n{prefix}}}", entries.join(",\n"))
}

fn serialize_palette(palette: &[CandidateFamily], indentation: usize) -> String {
    let prefix = " ".repeat(indentation);
    let fams: Vec<String> = palette
        .iter()
        .map(|f| {
            let mut props = vec![format!("{prefix}    \"name\": {}", quote(&f.name))];
            for mode in ["light", "dark"] {
                if let Some(c) = f.ramp(mode) {
                    props.push(format!("{prefix}    \"{mode}\": {}", serialize_ramp(f, c, indentation + 4)));
                }
            }
            format!("{prefix}  {}: {{\n{}\n{prefix}  }}", quote(&f.id), props.join(",\n"))
        })
        .collect();
    format!("{{\n{}\n{prefix}}}", fams.join(",\n"))
}

pub fn serialize_palette_candidate(c: &Candidate) -> String {
    let stops: Vec<String> = c.stops.iter().map(|s| format!("    {}", json::stringify(&json::num(*s), 0))).collect();
    format!(
        "{{\n  \"schemaVersion\": 1,\n  \"status\": \"candidate\",\n  \"recipe\": {},\n  \"black\": {},\n  \"white\": {},\n  \"stops\": [\n{}\n  ],\n  \"palette\": {}\n}}\n",
        quote(&c.recipe),
        quote(&c.black),
        quote(&c.white),
        stops.join(",\n"),
        serialize_palette(&c.palette, 2)
    )
}

fn serialize_palette_module(c: &Candidate) -> String {
    format!(
        "// Generated by {}. Review before committing.\nexport const black = '{}' as const;\nexport const white = '{}' as const;\n\n// prettier-ignore\nexport const palette = {} as const;\n\nexport default palette;\n",
        c.recipe,
        c.black,
        c.white,
        serialize_palette(&c.palette, 0)
    )
}

fn serialize_candidate(c: &Candidate, output: Option<&str>) -> Result<(&'static str, String), ApiError> {
    if let Some(o) = output {
        if o.ends_with(".ts") {
            return Ok((PALETTE_TYPESCRIPT_FORMAT_VERSION, serialize_palette_module(c)));
        }
    }
    if output.map(|o| o.ends_with(".json")).unwrap_or(true) {
        return Ok((PALETTE_JSON_FORMAT_VERSION, serialize_palette_candidate(c)));
    }
    Err(err("Palette output must end in .ts or .json.", "ERR_PALETTE_GENERATION"))
}

fn sha256_hex(s: &str) -> String {
    let d = Sha256::digest(s.as_bytes());
    d.iter().map(|b| format!("{b:02x}")).collect()
}

fn receipt_for(result: &GenerationResult, format: &str, text: &str, preview: Option<&str>) -> Value {
    let mut m = Map::new();
    m.insert("schemaVersion".into(), Value::from(1));
    m.insert("recipe".into(), Value::String(PALETTE_RECIPE.into()));
    m.insert("generatorVersion".into(), Value::String(PALETTE_GENERATOR_VERSION.into()));
    m.insert("candidateFormatVersion".into(), Value::String(format.into()));
    m.insert("candidateSha256".into(), Value::String(sha256_hex(text)));
    if let Some(p) = preview {
        if !p.is_empty() {
            let mut pm = Map::new();
            pm.insert("version".into(), Value::String(PALETTE_PREVIEW_VERSION.into()));
            pm.insert("sha256".into(), Value::String(sha256_hex(p)));
            m.insert("preview".into(), Value::Object(pm));
        }
    }
    m.insert("request".into(), result.request.to_json());
    let mut fams = Map::new();
    for f in &result.families {
        let mut fm = Map::new();
        if let Some(l) = &f.light {
            fm.insert("light".into(), l.diagnostics.to_json());
        }
        if let Some(d) = &f.dark {
            fm.insert("dark".into(), d.diagnostics.to_json());
        }
        fams.insert(f.id.clone(), Value::Object(fm));
    }
    let mut diag = Map::new();
    diag.insert("families".into(), Value::Object(fams));
    diag.insert("coordination".into(), Value::Array(result.coordination.iter().map(|c| c.to_json()).collect()));
    m.insert("diagnostics".into(), Value::Object(diag));
    Value::Object(m)
}

fn receipt_path_for(candidate: &str) -> String {
    let ext = nodepath::extname(candidate);
    if ext.is_empty() {
        format!("{candidate}.receipt.json")
    } else {
        format!("{}.receipt.json", &candidate[..candidate.len() - ext.len()])
    }
}

fn resolve_safe(target: &str, cwd: &str, label: &str) -> Result<String, ApiError> {
    nodepath::assert_within(target, cwd, label, false).map_err(|e| err(e.message, "ERR_PATH_TRAVERSAL"))
}

fn identity(path: &str) -> Result<Option<(u64, u64)>, ApiError> {
    match fs::metadata(path) {
        Ok(m) => Ok(Some((m.dev(), m.ino()))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(err(format!("Could not write palette candidate: {}", node_error_message(&e, "stat", path)), "ERR_WRITE_FAILED")),
    }
}

/// Node's `fs` error message: `CODE: description, syscall 'path'`.
pub fn node_error_message(e: &std::io::Error, syscall: &str, path: &str) -> String {
    let (code, desc) = match e.raw_os_error() {
        Some(2) => ("ENOENT", "no such file or directory"),
        Some(13) => ("EACCES", "permission denied"),
        Some(17) => ("EEXIST", "file already exists"),
        Some(20) => ("ENOTDIR", "not a directory"),
        Some(21) => ("EISDIR", "illegal operation on a directory"),
        Some(1) => ("EPERM", "operation not permitted"),
        _ => ("EIO", "i/o error"),
    };
    format!("{code}: {desc}, {syscall} '{path}'")
}

fn assert_distinct(input: &str, files: &[(String, String)]) -> Result<(), ApiError> {
    let mut seen_paths: Vec<&str> = Vec::new();
    let mut seen_ids: Vec<(u64, u64)> = Vec::new();
    let all = std::iter::once(input).chain(files.iter().map(|f| f.0.as_str()));
    for p in all {
        let distinct = || err("Palette inputs and outputs must refer to distinct files.", "ERR_PATH_TRAVERSAL");
        if seen_paths.contains(&p) {
            return Err(distinct());
        }
        seen_paths.push(p);
        if let Some(id) = identity(p)? {
            if seen_ids.contains(&id) {
                return Err(distinct());
            }
            seen_ids.push(id);
        }
    }
    Ok(())
}

fn write_files_atomically(files: &[(String, String)], overwrite: bool) -> Result<(), String> {
    struct Orig {
        path: String,
        contents: Option<Vec<u8>>,
        temporary: Option<String>,
        published: bool,
    }
    let mut originals: Vec<Orig> = files
        .iter()
        .map(|(p, _)| Orig { path: p.clone(), contents: fs::read(p).ok(), temporary: None, published: false })
        .collect();
    let result = (|| -> Result<(), String> {
        for (i, (p, next)) in files.iter().enumerate() {
            let dir = nodepath::dirname(p);
            fs::create_dir_all(&dir).map_err(|e| node_error_message(&e, "mkdir", &dir))?;
            let tmp = nodepath::join(&[&dir, &format!(".{}.tmp-{}", nodepath::basename(p), unique_suffix(i))]);
            fs::write(&tmp, next).map_err(|e| node_error_message(&e, "open", &tmp))?;
            originals[i].temporary = Some(tmp);
        }
        for o in originals.iter_mut() {
            let tmp = o.temporary.clone().ok_or("Missing temporary file.")?;
            if overwrite {
                fs::rename(&tmp, &o.path).map_err(|e| node_error_message(&e, "rename", &tmp))?;
            } else {
                if let Err(e) = fs::hard_link(&tmp, &o.path) {
                    if matches!(e.raw_os_error(), Some(1) | Some(18)) {
                        if std::path::Path::new(&o.path).exists() {
                            return Err(node_error_message(&std::io::Error::from_raw_os_error(17), "copyfile", &tmp));
                        }
                        fs::copy(&tmp, &o.path).map_err(|e| node_error_message(&e, "copyfile", &tmp))?;
                    } else {
                        return Err(node_error_message(&e, "link", &tmp));
                    }
                }
                o.published = true;
                let _ = fs::remove_file(&tmp);
            }
            o.published = true;
            o.temporary = None;
        }
        Ok(())
    })();
    if result.is_err() {
        for o in &originals {
            if let Some(t) = &o.temporary {
                let _ = fs::remove_file(t);
            }
            if o.published {
                match &o.contents {
                    Some(c) => {
                        let _ = fs::write(&o.path, c);
                    }
                    None => {
                        let _ = fs::remove_file(&o.path);
                    }
                }
            }
        }
    }
    result
}

fn unique_suffix(i: usize) -> String {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{:x}-{}-{}", nanos, std::process::id(), i)
}

pub struct GenerateOptions<'a> {
    pub out: Option<&'a str>,
    pub preview: Option<&'a str>,
    pub overwrite: bool,
}

pub struct GenerateResponse {
    pub candidate: Candidate,
    pub data: Value,
    pub family_count: usize,
    pub stop_count: usize,
    pub modes: Vec<&'static str>,
    pub output: Option<String>,
    pub receipt: Option<String>,
    pub preview: Option<String>,
    pub written: bool,
}

pub fn theme_palette_generate(config: &str, opts: &GenerateOptions, cwd: &str) -> Result<GenerateResponse, ApiError> {
    let resolved_config = resolve_safe(config, cwd, "palette config path")?;
    if !std::path::Path::new(&resolved_config).exists() {
        return Err(err(
            format!("Palette config not found: {}", nodepath::relative(cwd, cwd, &resolved_config)),
            "ERR_FILE_NOT_FOUND",
        ));
    }
    let request: Value = match fs::read(&resolved_config) {
        Ok(bytes) => {
            let text = String::from_utf8_lossy(&bytes).into_owned();
            crate::commands::theme_build::jsonparse::parse(&text)
                .map_err(|m| err(format!("Could not parse palette config: {m}"), "ERR_PALETTE_GENERATION"))?
        }
        Err(e) => {
            return Err(err(
                format!("Could not parse palette config: {}", node_error_message(&e, "read", &resolved_config)),
                "ERR_PALETTE_GENERATION",
            ))
        }
    };
    let result = generate_palette_set(&request).map_err(|m| err(m, "ERR_PALETTE_GENERATION"))?;
    if !result.errors.is_empty() {
        let msg: Vec<String> = result.errors.iter().map(|(id, m)| format!("{id}: {m}")).collect();
        return Err(err(msg.join("\n"), "ERR_PALETTE_GENERATION"));
    }
    let candidate = snapshot(&result);
    let (mut format, mut text) = serialize_candidate(&candidate, None)?;
    let preview_text = if opts.preview.map(|p| !p.is_empty()).unwrap_or(false) { Some(render_palette_preview(&candidate)) } else { None };
    let mut receipt = receipt_for(&result, format, &text, preview_text.as_deref());
    let mut output = None;
    let mut receipt_output = None;
    let mut preview_output = None;
    let mut written = false;
    let mut reason = Value::Null;
    let mut files: Vec<(String, String)> = Vec::new();

    if let Some(out) = opts.out.filter(|o| !o.is_empty()) {
        let resolved_out = resolve_safe(out, cwd, "palette output path")?;
        let resolved_receipt = receipt_path_for(&resolved_out);
        let s = serialize_candidate(&candidate, Some(&resolved_out))?;
        format = s.0;
        text = s.1;
        receipt = receipt_for(&result, format, &text, preview_text.as_deref());
        let receipt_text = serialize_generation_result(&receipt);
        output = Some(nodepath::relative(cwd, cwd, &resolved_out));
        receipt_output = Some(nodepath::relative(cwd, cwd, &resolved_receipt));
        files.push((resolved_out, text.clone()));
        files.push((resolved_receipt, receipt_text));
    }
    if let Some(p) = opts.preview.filter(|p| !p.is_empty()) {
        let resolved_preview = resolve_safe(p, cwd, "palette preview path")?;
        if !resolved_preview.ends_with(".html") {
            return Err(err("Palette preview output must end in .html.", "ERR_PALETTE_GENERATION"));
        }
        preview_output = Some(nodepath::relative(cwd, cwd, &resolved_preview));
        files.push((resolved_preview, preview_text.clone().unwrap_or_default()));
    }
    if !files.is_empty() {
        assert_distinct(&resolved_config, &files)?;
        if !opts.overwrite && files.iter().any(|f| std::path::Path::new(&f.0).exists()) {
            reason = Value::String("exists".into());
        } else {
            write_files_atomically(&files, opts.overwrite)
                .map_err(|m| err(format!("Could not write palette candidate: {m}"), "ERR_WRITE_FAILED"))?;
            written = true;
        }
    }
    let modes: Vec<&'static str> = match result.request.mode_strategy.as_str() {
        "light-and-dark" => vec!["light", "dark"],
        "light-only" => vec!["light"],
        _ => vec!["dark"],
    };
    let opt_str = |o: &Option<String>| o.clone().map(Value::String).unwrap_or(Value::Null);
    let mut data = Map::new();
    data.insert("recipe".into(), Value::String(PALETTE_RECIPE.into()));
    data.insert("status".into(), Value::String("candidate".into()));
    data.insert("familyCount".into(), Value::from(result.families.len()));
    data.insert("stopCount".into(), Value::from(result.request.stops.len()));
    data.insert("modes".into(), Value::Array(modes.iter().map(|m| Value::String(m.to_string())).collect()));
    data.insert("output".into(), opt_str(&output));
    data.insert("receipt".into(), opt_str(&receipt_output));
    data.insert("preview".into(), opt_str(&preview_output));
    data.insert("written".into(), Value::Bool(written));
    data.insert("reason".into(), reason);
    data.insert("candidate".into(), candidate.to_json());
    data.insert("generationReceipt".into(), receipt);
    Ok(GenerateResponse {
        family_count: result.families.len(),
        stop_count: result.request.stops.len(),
        modes,
        output,
        receipt: receipt_output,
        preview: preview_output,
        written,
        candidate,
        data: Value::Object(data),
    })
}
