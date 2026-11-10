//! The codemod runner: `runner.mjs` and `run-codemod.mjs`.

use super::fsutil::{extname, relative, s};
use super::jsc::{CodemodError, Outcome};
use super::protection::{Protection, Resolver};
use super::registry::{Entry, Kind, VersionManifest};
use super::ui::TermLog;
use crate::cli::command::Out;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

pub const DEFAULT_CODE_EXTENSIONS: &[&str] = &[".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"];
const IGNORED_DIRS: &[&str] = &["node_modules", "bower_components", "jspm_packages", ".git", ".hg", ".sl"];
const YARN_STORE_DIRS: &[&str] = &["__virtual__", "cache", "sdks", "unplugged"];

#[derive(Debug, Clone)]
pub struct ProtectedRow {
    pub file: String,
    pub codemod: String,
    pub reason: String,
    pub declaration: String,
    pub generated: bool,
    pub command: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DeclinedRow {
    pub file: String,
    pub codemod: String,
    pub location: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct ErrorRow {
    pub file: String,
    pub codemod: String,
    pub error: String,
}

#[derive(Debug, Clone)]
pub struct OutcomeRow {
    pub kind: String, // manual | regenerate
    pub message: String,
    pub line: Option<usize>,
    pub commands: Vec<String>,
    pub file: String,
    pub codemod: String,
}

#[derive(Default)]
pub struct StepResult {
    pub files_changed: usize,
    pub changed_files: Vec<PathBuf>,
    pub written_files: Vec<PathBuf>,
    pub protected_files: Vec<ProtectedRow>,
    pub declined: Vec<DeclinedRow>,
    pub errors: Vec<ErrorRow>,
    pub staged_overrides: Option<Vec<(PathBuf, Option<String>)>>,
}

pub struct RunResult {
    pub total_files_changed: usize,
    pub total_transforms_applied: usize,
    pub changed_files: Vec<PathBuf>,
    pub written_files: Vec<PathBuf>,
    pub protected_files: Vec<ProtectedRow>,
    pub declined: Vec<DeclinedRow>,
    pub staged_contents: HashMap<PathBuf, String>,
    pub errors: Vec<ErrorRow>,
}

fn boundary_len(parts: &[&str], i: usize) -> usize {
    if IGNORED_DIRS.contains(&parts[i]) {
        return 1;
    }
    if parts[i] == ".yarn" && i + 1 < parts.len() && YARN_STORE_DIRS.contains(&parts[i + 1]) {
        return 2;
    }
    0
}

fn is_ignored_directory(root: &Path, full: &Path, name: &str) -> bool {
    if IGNORED_DIRS.contains(&name) {
        return true;
    }
    let rel = relative(root, full);
    let parts: Vec<&str> = rel.split('/').collect();
    boundary_len(&parts, 0) == 2
}

fn is_ignored_linked_directory(root: &Path, full: &Path, name: &str, real_target: &Path, op_root: &Path) -> bool {
    if is_ignored_directory(root, full, name) {
        return true;
    }
    let real_root = std::fs::canonicalize(op_root).unwrap_or_else(|_| op_root.to_path_buf());
    let rel = relative(&real_root, real_target);
    let inside = rel.is_empty() || (rel != ".." && !rel.starts_with("../") && !Path::new(&rel).is_absolute());
    let floor = if inside { s(&real_root).split('/').count() } else { 0 };
    let tp: Vec<String> = s(real_target).split('/').map(|x| x.to_string()).collect();
    let parts: Vec<&str> = tp.iter().map(|x| x.as_str()).collect();
    for i in 0..parts.len() {
        let l = boundary_len(&parts, i);
        if l > 0 && i + l > floor {
            return true;
        }
    }
    false
}

/// `findSourceFiles(dir, root)` (runner.mjs): candidate files, sorted.
pub fn find_source_files(dir: &Path, root: &Path, extensions: Option<&HashSet<String>>) -> Vec<PathBuf> {
    let mut results: Vec<PathBuf> = Vec::new();
    fn walk(cur: &Path, ancestors: &HashSet<PathBuf>, dir: &Path, root: &Path, exts: Option<&HashSet<String>>, results: &mut Vec<PathBuf>) {
        let real = match std::fs::canonicalize(cur) {
            Ok(r) => r,
            Err(_) => return,
        };
        if ancestors.contains(&real) {
            return;
        }
        let mut next = ancestors.clone();
        next.insert(real);
        let mut entries: Vec<std::fs::DirEntry> = match std::fs::read_dir(cur) {
            Ok(r) => r.filter_map(|e| e.ok()).collect(),
            Err(_) => return,
        };
        entries.sort_by_key(|e| e.file_name());
        let ext_ok = |p: &Path| exts.map(|e| e.contains(&extname(p))).unwrap_or(true);
        for e in entries {
            let name = e.file_name().to_string_lossy().into_owned();
            let full = cur.join(&name);
            let ft = match e.file_type() {
                Ok(f) => f,
                Err(_) => continue,
            };
            if ft.is_symlink() {
                if let Ok(md) = std::fs::metadata(&full) {
                    if md.is_file() && ext_ok(&full) {
                        results.push(full);
                    } else if md.is_dir() {
                        let rt = std::fs::canonicalize(&full).unwrap_or_else(|_| full.clone());
                        if !is_ignored_linked_directory(dir, &full, &name, &rt, root) {
                            walk(&full, &next, dir, root, exts, results);
                        }
                    }
                }
                continue;
            }
            if ft.is_dir() {
                if is_ignored_directory(dir, &full, &name) {
                    continue;
                }
                walk(&full, &next, dir, root, exts, results);
            } else if ext_ok(&full) {
                results.push(full);
            }
        }
    }
    walk(dir, &HashSet::new(), dir, root, extensions, &mut results);
    results.sort_by(|a, b| {
        let a16: Vec<u16> = s(a).encode_utf16().collect();
        let b16: Vec<u16> = s(b).encode_utf16().collect();
        a16.cmp(&b16)
    });
    results
}

pub fn fix_directive_corruption(code: &str) -> String {
    super::jsre::replace(r#"^(['"]use (client|server|strict)['"]);\s*;"#, "gm", code, "$1;")
}

fn count_matches(re: &str, s: &str) -> usize {
    super::jsre::captures_all(re, "g", s).len()
}

/// `validateOutput(result, source, j, {parse})`
pub fn validate_output(result: &str, source: &str, path: &str, parse: bool) -> Result<(), String> {
    if parse {
        if let Err(e) = super::jsc::parse_with(result, super::jsc::mode_for_path(path)) {
            return Err(format!("transform produced unparseable output: {}", e.message));
        }
    }
    for (pat, desc) in [(r"\[native code\]", "[native code] injection (prototype pollution in identifier map)"), (r"function \w+\(\) \{ \[native code\] \}", "native function toString() leak")] {
        let r = count_matches(pat, result);
        let s0 = count_matches(pat, source);
        if r > s0 {
            let n = r - s0;
            return Err(format!("detected corruption: {} ({} new occurrence{})", desc, n, if n > 1 { "s" } else { "" }));
        }
    }
    Ok(())
}

fn protected_result(resolver: &Resolver, file: &Path, name: &str) -> Vec<ProtectedRow> {
    resolver
        .classify(file)
        .into_iter()
        .map(|p: Protection| ProtectedRow { generated: p.reason == "generated", file: p.file, codemod: name.to_string(), reason: p.reason, declaration: p.declaration, command: p.command })
        .collect()
}

fn log_protected(out: &mut Out, log: &TermLog, rows: &[ProtectedRow]) {
    let decls: Vec<&str> = rows.iter().map(|r| r.declaration.as_str()).collect();
    log.warn(out, &format!("    ! {} — protected by {}", rows[0].file, decls.join("; ")));
}

fn dedupe_protected(rows: Vec<ProtectedRow>) -> Vec<ProtectedRow> {
    let mut out: Vec<ProtectedRow> = Vec::new();
    for r in rows {
        if !out.iter().any(|o| o.file == r.file && o.reason == r.reason && o.declaration == r.declaration) {
            out.push(r);
        }
    }
    out
}

/// A Babel-style parse error description: message without position, 1-based location.
fn describe_parse_error(e: &CodemodError) -> (String, Option<String>) {
    if e.css {
        return (e.message.clone(), e.line.map(|l| format!("{}:{}", l, e.column.unwrap_or(1))));
    }
    let msg = super::jsre::replace(r"\s*\(\d+:\d+\)$", "", &e.message, "");
    (msg, e.line.map(|l| format!("{}:{}", l, e.column.unwrap_or(0) + 1)))
}

pub struct Ctx<'a> {
    pub apply: bool,
    pub root: &'a Path,
    pub log: &'a TermLog,
}

/// `runCodeCodemod(entry, files, ...)`
pub fn run_code_codemod(out: &mut Out, entry: &Entry, files: &[PathBuf], ctx: &Ctx, resolver: &Resolver, contents: &mut HashMap<PathBuf, String>, outcomes: &mut Vec<OutcomeRow>) -> StepResult {
    let name = format!("core:{}", entry.name);
    let exts: Vec<String> = entry.file_extensions.clone().unwrap_or_else(|| DEFAULT_CODE_EXTENSIONS.iter().map(|s| s.to_string()).collect());
    let mut res = StepResult::default();
    let mut candidates: Vec<(PathBuf, String, String)> = Vec::new();
    for fp in files {
        let ext = extname(fp);
        if !exts.contains(&ext) {
            continue;
        }
        let rel = relative(ctx.root, fp);
        let source = match contents.get(fp) {
            Some(c) => c.clone(),
            None => match std::fs::read_to_string(fp) {
                Ok(c) => c,
                Err(e) => {
                    let message = super::fsutil::io_message(&e, "open", fp);
                    ctx.log.error(out, &format!("    ✗ {} — {}", rel, message));
                    res.errors.push(ErrorRow { file: rel, codemod: name.clone(), error: message });
                    continue;
                }
            },
        };
        let path_s = s(fp);
        let t = match &entry.kind {
            Kind::Code(t) => *t,
            _ => {
                let message = format!("codemod {} has no native implementation", entry.name);
                res.errors.push(ErrorRow { file: rel, codemod: name.clone(), error: message });
                continue;
            }
        };
        let r = t(&source, &path_s, &serde_json::Value::Null);
        match r {
            Ok(None) => continue,
            Ok(Some(result)) => {
                if result == source {
                    continue;
                }
                let result = fix_directive_corruption(&result);
                let parse = DEFAULT_CODE_EXTENSIONS.contains(&ext.as_str());
                if let Err(reason) = validate_output(&result, &source, &path_s, parse) {
                    ctx.log.error(out, &format!("    ✗ {} — {}", rel, reason));
                    res.errors.push(ErrorRow { file: rel, codemod: name.clone(), error: reason });
                    continue;
                }
                candidates.push((fp.clone(), rel, result));
            }
            Err(e) => {
                if let Some(o) = &e.outcome {
                    // withCodemodOutcomes: recorded, the file is left as is.
                    let (kind, line, commands) = match o {
                        Outcome::Manual { line } => ("manual", *line, vec![]),
                        Outcome::Regenerate { commands } => ("regenerate", None, commands.clone()),
                    };
                    outcomes.push(OutcomeRow { kind: kind.into(), message: e.message.clone(), line, commands, file: rel.clone(), codemod: name.clone() });
                    continue;
                }
                if e.parse {
                    let prots = resolver.classify(fp);
                    if !prots.is_empty() {
                        let (message, location) = describe_parse_error(&e);
                        let mut reasons: Vec<String> = Vec::new();
                        for p in &prots {
                            if !reasons.contains(&p.reason) {
                                reasons.push(p.reason.clone());
                            }
                        }
                        res.declined.push(DeclinedRow { file: rel, codemod: name.clone(), location, reason: format!("unparseable protected file ({}): {}", reasons.join(", "), message) });
                        continue;
                    }
                }
                ctx.log.error(out, &format!("    ✗ {} — {}", rel, e.message));
                res.errors.push(ErrorRow { file: rel, codemod: name.clone(), error: e.message });
            }
        }
    }
    let mut current: HashMap<PathBuf, Vec<ProtectedRow>> = HashMap::new();
    let mut staged: HashMap<PathBuf, Option<String>> = contents.iter().map(|(k, v)| (k.clone(), Some(v.clone()))).collect();
    for (fp, _, result) in &candidates {
        let blocked = protected_result(resolver, fp, &name);
        if blocked.is_empty() {
            staged.insert(fp.clone(), Some(result.clone()));
        }
        current.insert(fp.clone(), blocked);
    }
    let staged_resolver = Resolver::new(ctx.root, staged).ok();
    for (fp, rel, result) in candidates {
        let mut rows = current.remove(&fp).unwrap_or_default();
        if let Some(sr) = &staged_resolver {
            rows.extend(protected_result(sr, &fp, &name));
        }
        let rows = dedupe_protected(rows);
        if !rows.is_empty() {
            log_protected(out, ctx.log, &rows);
            res.protected_files.extend(rows);
            continue;
        }
        res.files_changed += 1;
        res.changed_files.push(fp.clone());
        contents.insert(fp.clone(), result.clone());
        if ctx.apply {
            let _ = std::fs::write(&fp, &result);
            res.written_files.push(fp.clone());
            ctx.log.success(out, &format!("    ✓ {}", rel));
        } else {
            ctx.log.warn(out, &format!("    ~ {} (would change)", rel));
        }
    }
    res
}

/// `runConfigCodemod(entry, ...)`
pub fn run_config_codemod(out: &mut Out, entry: &Entry, ctx: &Ctx, resolver: &Resolver, contents: &mut HashMap<PathBuf, String>) -> StepResult {
    let name = format!("core:{}", entry.name);
    let mut res = StepResult::default();
    let config_path = match crate::discovery::project::find_config_path(&s(ctx.root)) {
        Err(message) => {
            ctx.log.error(out, &format!("    ✗ astryx.config.* — {}", message));
            res.errors.push(ErrorRow { file: "astryx.config.*".into(), codemod: name, error: message });
            return res;
        }
        Ok(None) => {
            ctx.log.info(out, &format!("  {} — no astryx.config.* found; skipping.", entry.title));
            return res;
        }
        Ok(Some(p)) => PathBuf::from(p),
    };
    let rel = relative(ctx.root, &config_path);
    let source = match contents.get(&config_path) {
        Some(c) => c.clone(),
        None => match std::fs::read_to_string(&config_path) {
            Ok(c) => c,
            Err(e) => {
                let message = super::fsutil::io_message(&e, "open", &config_path);
                ctx.log.error(out, &format!("    ✗ {} — {}", rel, message));
                res.errors.push(ErrorRow { file: rel, codemod: name, error: message });
                return res;
            }
        },
    };
    let t = match &entry.kind {
        Kind::Config(t) => *t,
        _ => return res,
    };
    let path_s = s(&config_path);
    let result = match t(&source, &path_s, &serde_json::Value::Null) {
        Ok(None) => return res,
        Ok(Some(r)) if r == source => return res,
        Ok(Some(r)) => r,
        Err(e) => {
            ctx.log.error(out, &format!("    ✗ {} — {}", rel, e.message));
            res.errors.push(ErrorRow { file: rel, codemod: name, error: e.message });
            return res;
        }
    };
    let result = fix_directive_corruption(&result);
    let ext = extname(&config_path);
    if let Err(reason) = validate_output(&result, &source, &path_s, DEFAULT_CODE_EXTENSIONS.contains(&ext.as_str())) {
        ctx.log.error(out, &format!("    ✗ {} — {}", rel, reason));
        res.errors.push(ErrorRow { file: rel, codemod: name, error: reason });
        return res;
    }
    let rows = protected_result(resolver, &config_path, &name);
    if !rows.is_empty() {
        log_protected(out, ctx.log, &rows);
        res.protected_files = rows;
        return res;
    }
    contents.insert(config_path.clone(), result.clone());
    if ctx.apply {
        let _ = std::fs::write(&config_path, &result);
        ctx.log.success(out, &format!("    ✓ {}", rel));
        res.written_files.push(config_path.clone());
    } else {
        ctx.log.warn(out, &format!("    ~ {} (would change)", rel));
    }
    res.files_changed = 1;
    res.changed_files.push(config_path);
    res
}

/// `runProjectCodemod(entry, ...)`
pub fn run_project_codemod(out: &mut Out, entry: &Entry, ctx: &Ctx, resolver: &Resolver, overrides_base: &HashMap<PathBuf, Option<String>>) -> StepResult {
    let name = entry.name.clone();
    let mut res = StepResult::default();
    let rel = |f: &Path| relative(ctx.root, f);
    let t = match &entry.kind {
        Kind::Project(t) => *t,
        _ => {
            let message = format!("codemod {} has no native implementation", entry.name);
            ctx.log.error(out, &format!("    ✗ {}", message));
            res.errors.push(ErrorRow { file: ".".into(), codemod: name, error: message });
            return res;
        }
    };
    let plan = match t(ctx.root) {
        Ok(p) => p,
        Err(message) => {
            ctx.log.error(out, &format!("    ✗ {}", message));
            res.errors.push(ErrorRow { file: ".".into(), codemod: name, error: message });
            return res;
        }
    };
    if !plan.problems.is_empty() {
        for (file, message) in &plan.problems {
            ctx.log.error(out, &format!("    ✗ {} — {}", file, message));
        }
        res.errors = plan.problems.iter().map(|(f, m)| ErrorRow { file: f.clone(), codemod: name.clone(), error: m.clone() }).collect();
        return res;
    }
    let mut candidates: Vec<(PathBuf, bool)> = plan.writes.iter().map(|(p, _)| (p.clone(), p.exists())).collect();
    candidates.extend(plan.deletes.iter().map(|p| (p.clone(), true)));
    let structural = ["outside-root", "dependency", "vcs", "symlink"];
    let current_decls = |r: &Resolver, f: &Path, existing: bool| -> Vec<Protection> { r.classify(f).into_iter().filter(|i| existing || structural.contains(&i.reason.as_str())).collect() };
    let currently_blocked: HashSet<PathBuf> = candidates.iter().filter(|(f, e)| !current_decls(resolver, f, *e).is_empty()).map(|(f, _)| f.clone()).collect();
    let mut staged: HashMap<PathBuf, Option<String>> = overrides_base.clone();
    for (p, c) in &plan.writes {
        if !currently_blocked.contains(p) {
            staged.insert(p.clone(), Some(c.clone()));
        }
    }
    for p in &plan.deletes {
        if !currently_blocked.contains(p) {
            staged.insert(p.clone(), None);
        }
    }
    let staged_resolver = Resolver::new(ctx.root, staged).ok();
    let mut blocked: HashSet<PathBuf> = HashSet::new();
    for (f, existing) in &candidates {
        let mut decls = current_decls(resolver, f, *existing);
        if let Some(sr) = &staged_resolver {
            decls.extend(sr.classify(f));
        }
        let mut uniq: Vec<Protection> = Vec::new();
        for d in decls {
            if !(*existing || structural.contains(&d.reason.as_str())) {
                continue;
            }
            if !uniq.iter().any(|u| u.file == d.file && u.reason == d.reason && u.declaration == d.declaration) {
                uniq.push(d);
            }
        }
        if uniq.is_empty() {
            continue;
        }
        blocked.insert(f.clone());
        let rows: Vec<ProtectedRow> = uniq.into_iter().map(|p| ProtectedRow { generated: p.reason == "generated", file: p.file, codemod: name.clone(), reason: p.reason, declaration: p.declaration, command: p.command }).collect();
        let decls: Vec<&str> = rows.iter().map(|r| r.declaration.as_str()).collect();
        ctx.log.warn(out, &format!("    ! {} — protected by {}", rel(f), decls.join("; ")));
        res.protected_files.extend(rows);
    }
    let writes: Vec<(PathBuf, String)> = plan.writes.into_iter().filter(|(p, _)| !blocked.contains(p)).collect();
    let deletes: Vec<PathBuf> = plan.deletes.into_iter().filter(|p| !blocked.contains(p)).collect();
    res.changed_files = writes.iter().map(|(p, _)| p.clone()).chain(deletes.iter().cloned()).collect();
    for (p, c) in &writes {
        if ctx.apply {
            if let Some(parent) = p.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(p, c);
            res.written_files.push(p.clone());
            ctx.log.success(out, &format!("    ✓ {}", rel(p)));
        } else {
            ctx.log.warn(out, &format!("    ~ {} (would write)", rel(p)));
        }
    }
    for p in &deletes {
        if ctx.apply {
            let _ = std::fs::remove_file(p);
            res.written_files.push(p.clone());
            ctx.log.success(out, &format!("    ✓ {} (removed)", rel(p)));
        } else {
            ctx.log.warn(out, &format!("    ~ {} (would remove)", rel(p)));
        }
    }
    let mut applied = Vec::new();
    for (p, c) in &writes {
        applied.push((p.clone(), Some(c.clone())));
    }
    for p in &deletes {
        applied.push((p.clone(), None));
    }
    res.files_changed = res.changed_files.len();
    res.staged_overrides = Some(applied);
    res
}

pub struct RunOptions<'a> {
    pub apply: bool,
    pub path: &'a Path,
    pub codemod: Option<&'a str>,
    pub skip: &'a HashSet<String>,
    pub silent: bool,
    pub root: &'a Path,
    pub covers_target: bool,
}

pub enum RunOutcome {
    SourceMissing,
    Done(RunResult),
}

/// `runCodemods(versionManifests, options)`
pub fn run_codemods(out: &mut Out, manifests: &[VersionManifest], o: &RunOptions, protection: Resolver, outcomes: &mut Vec<OutcomeRow>) -> RunOutcome {
    let log = TermLog { silent: o.silent };
    let mut protection = protection;
    let mut prot_overrides: HashMap<PathBuf, Option<String>> = HashMap::new();
    let mut prot_write_count = 0usize;
    let has_code = manifests.iter().any(|m| m.transforms.iter().any(|t| !matches!(t.codemod_type.as_deref(), Some("config") | Some("project"))));
    let exists = o.path.exists();
    if !exists && has_code {
        log.error(out, &format!("Source path not found: {}", s(o.path)));
        return RunOutcome::SourceMissing;
    }
    let mut files = Vec::new();
    if exists {
        log.info(out, &format!("Scanning {} for source files...", s(o.path)));
        let exts: HashSet<String> = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".css", ".scss", ".sass", ".less"].iter().map(|s| s.to_string()).collect();
        files = find_source_files(o.path, o.root, Some(&exts));
        if files.is_empty() {
            log.warn(out, "No source files found.");
        } else {
            log.info(out, &format!("Found {} source file{}", files.len(), if files.len() == 1 { "" } else { "s" }));
        }
    }
    let ctx = Ctx { apply: o.apply, root: o.root, log: &log };
    let mut total_applied = 0usize;
    let mut total_validation_blocked = 0usize;
    let mut errors: Vec<ErrorRow> = Vec::new();
    let mut virtual_contents: HashMap<PathBuf, String> = HashMap::new();
    let mut changed: Vec<PathBuf> = Vec::new();
    let mut written: Vec<PathBuf> = Vec::new();
    let mut protected: Vec<ProtectedRow> = Vec::new();
    let mut declined: Vec<DeclinedRow> = Vec::new();
    let mut skipped_optional: Vec<&Entry> = Vec::new();
    for m in manifests {
        log.info(out, &format!("Applying v{} codemods...", m.version));
        for t in &m.transforms {
            if let Some(c) = o.codemod {
                if t.name != c {
                    continue;
                }
            }
            if o.skip.contains(&t.name) {
                continue;
            }
            if t.optional && o.codemod.is_none() {
                skipped_optional.push(t);
                continue;
            }
            if o.apply && written.len() != prot_write_count {
                if let Ok(r) = Resolver::new(o.root, prot_overrides.clone()) {
                    protection = r;
                }
                prot_write_count = written.len();
            }
            log.info(out, &format!("  {}", t.title));
            match t.codemod_type.as_deref() {
                Some("project") => {
                    let r = run_project_codemod(out, t, &ctx, &protection, &prot_overrides);
                    errors.extend(r.errors);
                    protected.extend(r.protected_files);
                    changed.extend(r.changed_files);
                    written.extend(r.written_files);
                    if let Some(so) = r.staged_overrides {
                        for (f, c) in so {
                            if let Some(c2) = &c {
                                virtual_contents.insert(f.clone(), c2.clone());
                            }
                            prot_overrides.insert(f, c);
                        }
                        if let Ok(r2) = Resolver::new(o.root, prot_overrides.clone()) {
                            protection = r2;
                        }
                        prot_write_count = written.len();
                    }
                    if r.files_changed > 0 {
                        total_applied += 1;
                    }
                    continue;
                }
                Some("config") => {
                    let r = run_config_codemod(out, t, &ctx, &protection, &mut virtual_contents);
                    errors.extend(r.errors);
                    protected.extend(r.protected_files);
                    changed.extend(r.changed_files);
                    written.extend(r.written_files);
                    total_applied += r.files_changed;
                    continue;
                }
                _ => {}
            }
            let r = run_code_codemod(out, t, &files, &ctx, &protection, &mut virtual_contents, outcomes);
            total_validation_blocked += r.errors.iter().filter(|e| e.error.starts_with("transform produced unparseable output") || e.error.starts_with("detected corruption:")).count();
            errors.extend(r.errors);
            protected.extend(r.protected_files);
            declined.extend(r.declined);
            changed.extend(r.changed_files);
            written.extend(r.written_files);
            total_applied += r.files_changed;
            if r.files_changed > 0 {
                log.info(out, &format!("  {} {} file{}", if o.apply { "Updated" } else { "Would update" }, r.files_changed, if r.files_changed == 1 { "" } else { "s" }));
            }
        }
    }
    log.blank(out);
    if !errors.is_empty() {
        log.error(out, &format!("{} error{} during codemods:", errors.len(), if errors.len() == 1 { "" } else { "s" }));
        for e in &errors {
            log.error(out, &format!("  {} → {}: {}", e.codemod, e.file, e.error));
        }
    }
    if total_validation_blocked > 0 {
        let n = total_validation_blocked;
        log.warn(out, &format!("{} file{} blocked by validation — no changes written to {}.", n, if n == 1 { " was" } else { "s were" }, if n == 1 { "that file" } else { "those files" }));
        log.info(out, "This means a codemod produced invalid output. Please report this as a bug.");
    }
    let mut seen = HashSet::new();
    let total_files_changed = changed.iter().filter(|f| seen.insert((*f).clone())).count();
    if !protected.is_empty() {
        let mut fs_: Vec<&str> = Vec::new();
        for p in &protected {
            if !fs_.contains(&p.file.as_str()) {
                fs_.push(&p.file);
            }
        }
        let n = fs_.len();
        log.warn(out, &format!("{} protected file{} require{} regeneration or manual review.", n, if n == 1 { "" } else { "s" }, if n == 1 { "s" } else { "" }));
    }
    let blocked_files: HashSet<String> = protected.iter().map(|p| p.file.clone()).collect();
    let reported_declined: Vec<DeclinedRow> = declined.into_iter().filter(|d| !blocked_files.contains(&d.file)).collect();
    let pending_regen = outcomes.iter().any(|x| x.kind == "regenerate");
    if total_files_changed == 0 && errors.is_empty() && protected.is_empty() && reported_declined.is_empty() {
        if o.covers_target && outcomes.is_empty() {
            log.success(out, "No changes needed — your code is already up to date!");
        }
    } else if o.apply && (!protected.is_empty() || pending_regen) {
        log.warn(
            out,
            &format!(
                "Applied {} owned change{} across {} file{}; {}.",
                total_applied,
                if total_applied == 1 { "" } else { "s" },
                total_files_changed,
                if total_files_changed == 1 { "" } else { "s" },
                if !protected.is_empty() { "protected changes remain" } else { "generated files to regenerate remain" }
            ),
        );
    } else if o.apply {
        log.success(out, &format!("Done! Applied {} change{} across {} file{}.", total_applied, if total_applied == 1 { "" } else { "s" }, total_files_changed, if total_files_changed == 1 { "" } else { "s" }));
        if !errors.is_empty() {
            log.warn(out, "Some files had errors — review them manually.");
        }
        log.info(out, "Run your type checker and tests to verify the changes.");
    } else {
        log.warn(out, &format!("Found {} change{} across {} file{}.", total_applied, if total_applied == 1 { "" } else { "s" }, total_files_changed, if total_files_changed == 1 { "" } else { "s" }));
        log.info(out, "Run with --apply to write changes to disk.");
    }
    if !skipped_optional.is_empty() {
        log.blank(out);
        let n = skipped_optional.len();
        log.info(out, &format!("{} optional codemod{} available:", n, if n == 1 { "" } else { "s" }));
        for t in &skipped_optional {
            log.info(out, &format!("  {} — {}", t.name, t.title));
            if let Some(d) = &t.description {
                if !d.is_empty() {
                    log.info(out, &format!("    {}", d));
                }
            }
            log.info(out, &format!("    Run: astryx upgrade --codemod {} --path <dir> --apply", t.name));
        }
    }
    RunOutcome::Done(RunResult {
        total_files_changed,
        total_transforms_applied: total_applied,
        changed_files: changed,
        written_files: written,
        protected_files: protected,
        declined: reported_declined,
        staged_contents: virtual_contents,
        errors,
    })
}
