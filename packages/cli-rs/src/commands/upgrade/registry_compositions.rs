//! ShadCN-copied composition receipts (`api/upgrade/registry/registry.mjs`):
//! find the receipts under the source folder, fetch each item's latest
//! receipt from the registry, plan an update, merge or conflict per copied
//! file, and apply it atomically.

use super::fsutil::{io_message, relative, s};
use super::shadcn::diff3::{merge_diff3, Labels};
use super::shadcn::receipt::{self as rc, Receipt, ReceiptFile, PUBLIC_SHADCN_REGISTRY_ORIGIN};
use super::shadcn::source_variants as sv;
use super::ui::Ui;
use super::{ApiError, Opts};
use crate::json::{Map, Value};
use std::path::{Path, PathBuf};

const SKIP_DIRS: &[&str] = &[".cache", ".git", ".next", ".pnpm", ".turbo", "build", "coverage", "dist", "node_modules", "out"];
const MAX_ITEM_BYTES: usize = 16 * 1024 * 1024;
const FETCH_CONCURRENCY: usize = 8;

// ---------------------------------------------------------------------------
// Fetching.

/// What a `fetch` resolves to.
pub struct FetchResponse {
    pub status: u16,
    /// The `content-length` header, when sent.
    pub content_length: Option<String>,
    /// The body, at most `MAX_ITEM_BYTES + 1` bytes.
    pub body: Vec<u8>,
}

/// `fetchImpl(url, {headers: {accept: 'application/json'}, redirect: 'error',
/// signal: AbortSignal.timeout(15_000)})`. `Err` is the rejection message.
pub trait Fetcher: Sync {
    fn fetch(&self, url: &str) -> Result<FetchResponse, String>;
}

impl<F: Fn(&str) -> Result<FetchResponse, String> + Sync> Fetcher for F {
    fn fetch(&self, url: &str) -> Result<FetchResponse, String> {
        self(url)
    }
}

/// The global `fetch` (undici): transport failures reject with
/// "fetch failed", a timeout with the abort reason.
pub struct HttpFetcher;

impl Fetcher for HttpFetcher {
    fn fetch(&self, url: &str) -> Result<FetchResponse, String> {
        use std::io::Read;
        let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(15)).redirects(0).build();
        let resp = match agent.get(url).set("accept", "application/json").call() {
            Ok(r) => r,
            Err(ureq::Error::Status(_, r)) => r,
            Err(ureq::Error::Transport(t)) => {
                let timed_out = std::error::Error::source(&t)
                    .and_then(|e| e.downcast_ref::<std::io::Error>())
                    .map(|e| matches!(e.kind(), std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock))
                    .unwrap_or(false);
                return Err(if timed_out { "The operation was aborted due to timeout".into() } else { "fetch failed".into() });
            }
        };
        let status = resp.status();
        if (300..400).contains(&status) {
            return Err("fetch failed".into());
        }
        let content_length = resp.header("content-length").map(|h| h.to_string());
        let mut body = Vec::new();
        if status >= 200 && status < 300 {
            let declared = content_length.as_deref().map(js_number).unwrap_or(0.0);
            if !(declared.is_finite() && declared > MAX_ITEM_BYTES as f64) {
                resp.into_reader().take(MAX_ITEM_BYTES as u64 + 1).read_to_end(&mut body).map_err(|_| "fetch failed".to_string())?;
            }
        }
        Ok(FetchResponse { status, content_length, body })
    }
}

/// `Number(text)` for a header value.
fn js_number(text: &str) -> f64 {
    let t = text.trim();
    if t.is_empty() {
        return 0.0;
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

// ---------------------------------------------------------------------------
// Discovery and small helpers.

/// `discoverRegistryReceipts(root)`
pub fn discover_registry_receipts(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if !root.exists() {
        return out;
    }
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        let mut entries: Vec<_> = rd.filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let name = e.file_name().to_string_lossy().into_owned();
            if SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            let full = dir.join(&name);
            if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            if name == ".astryx" {
                if let Ok(rd2) = std::fs::read_dir(&full) {
                    for r in rd2.filter_map(|x| x.ok()) {
                        let rn = r.file_name().to_string_lossy().into_owned();
                        if r.file_type().map(|t| t.is_file()).unwrap_or(false) && rn.ends_with(".json") {
                            out.push(full.join(rn));
                        }
                    }
                }
                continue;
            }
            walk(&full, out);
        }
    }
    walk(root, &mut out);
    out.sort_by(|a, b| s(a).encode_utf16().cmp(s(b).encode_utf16()));
    out
}

fn rel(file: &Path, root: &Path) -> String {
    relative(root, file)
}

fn read_utf8(p: &Path) -> Result<String, String> {
    std::fs::read(p).map(|b| String::from_utf8_lossy(&b).into_owned()).map_err(|e| io_message(&e, "open", p))
}

fn normalize_line_endings(s: &str) -> String {
    s.replace("\r\n", "\n")
}

fn apply_line_ending(s: &str, crlf: bool) -> String {
    let n = normalize_line_endings(s);
    if crlf {
        n.replace('\n', "\r\n")
    } else {
        n
    }
}

fn is_js_file(p: &str) -> bool {
    p.ends_with(".js") || p.ends_with(".jsx")
}

fn temp_suffix() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{:08x}-{:04x}-4{:03x}-8{:03x}-{:012x}", (t & 0xffff_ffff) as u32, std::process::id() & 0xffff, N.fetch_add(1, Ordering::Relaxed) & 0xfff, (t >> 32) & 0xfff, (t >> 44) & 0xffff_ffff_ffff)
}

/// `atomicWrite(filePath, content)`
fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let tmp = PathBuf::from(format!("{}.astryx-tmp-{}", s(path), temp_suffix()));
    let mode = std::fs::symlink_metadata(path).ok().filter(|m| !m.file_type().is_symlink()).map(|m| m.permissions().mode());
    let result = (|| {
        std::fs::write(&tmp, content).map_err(|e| io_message(&e, "open", &tmp))?;
        if let Some(m) = mode {
            std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(m)).map_err(|e| io_message(&e, "chmod", &tmp))?;
        }
        std::fs::rename(&tmp, path).map_err(|e| format!("{} -> '{}'", io_message(&e, "rename", &tmp), s(path)))
    })();
    let _ = std::fs::remove_file(&tmp);
    result
}

// ---------------------------------------------------------------------------
// Receipt candidates.

#[derive(Clone, Debug)]
struct Candidate {
    format: &'static str,
    id: String,
    target: String,
    registry_target: String,
    registry_path: String,
    sha256: String,
    content: String,
    source_path: PathBuf,
}

/// `receiptFileCandidates(receipt, file)`: the canonical file, then each
/// format variant (derived for version 1 receipts).
fn file_candidates(receipt: &Receipt, file: &ReceiptFile) -> Vec<Candidate> {
    let mut out = vec![Candidate {
        format: "typescript",
        id: file.id.clone(),
        target: file.target.clone(),
        registry_target: file.registry_target.clone(),
        registry_path: file.registry_path.clone(),
        sha256: file.sha256.clone(),
        content: file.content.clone(),
        source_path: PathBuf::new(),
    }];
    let mut variants: Vec<rc::Variant> = if receipt.schema_version == 2 { file.variants.clone().unwrap_or_default() } else { Vec::new() };
    if receipt.schema_version == 1 {
        let target = sv::js_target(&file.target);
        let registry_target = sv::js_target(&file.registry_target);
        if target != file.target || registry_target != file.registry_target {
            if let Ok(content) = sv::transform(&file.content) {
                variants = vec![rc::Variant { format: "javascript".into(), target, registry_target, sha256: rc::content_hash(&content), content }];
            }
        }
    }
    for v in variants {
        out.push(Candidate {
            format: "javascript",
            id: file.id.clone(),
            target: v.target,
            registry_target: v.registry_target,
            registry_path: file.registry_path.clone(),
            sha256: v.sha256,
            content: v.content,
            source_path: PathBuf::new(),
        });
    }
    out
}

// ---------------------------------------------------------------------------
// The latest receipt.

fn item_url(item_path: &str, registry_origin: &str) -> String {
    let base = format!("{}/", registry_origin.strip_suffix('/').unwrap_or(registry_origin));
    let rel = format!("{item_path}.json");
    match url::Url::parse(&base).and_then(|b| b.join(&rel)) {
        Ok(u) => u.to_string(),
        Err(_) => format!("{base}{rel}"),
    }
}

/// `sourceVersionMatches(sourceVersion, expectedVersion)`
fn source_version_matches(source: &str, expected: &str) -> bool {
    if source == expected {
        return true;
    }
    if source != "canary" {
        return false;
    }
    let lower = expected.to_ascii_lowercase();
    let b = lower.as_bytes();
    let mut from = 0;
    while let Some(i) = lower[from..].find("canary") {
        let at = from + i;
        let end = at + 6;
        let before_ok = at == 0 || matches!(b[at - 1], b'.' | b'-');
        let after_ok = end == b.len() || matches!(b[end], b'.' | b'-');
        if before_ok && after_ok {
            return true;
        }
        from = at + 1;
    }
    false
}

/// `fetchLatestReceipt(itemPath, options)`
fn fetch_latest_receipt(item_path: &str, ctx: &Ctx) -> Result<Receipt, String> {
    let url = item_url(item_path, ctx.registry_origin);
    let resp = ctx.fetcher.fetch(&url).map_err(|e| format!("Could not fetch {url}: {e}"))?;
    if !(200..300).contains(&resp.status) {
        return Err(format!("Could not fetch {url}: HTTP {}", resp.status));
    }
    let too_big = || format!("Registry item {url} exceeds {MAX_ITEM_BYTES} bytes");
    let declared = resp.content_length.as_deref().map(js_number).unwrap_or(0.0);
    if declared.is_finite() && declared > MAX_ITEM_BYTES as f64 {
        return Err(too_big());
    }
    if resp.body.len() > MAX_ITEM_BYTES {
        return Err(too_big());
    }
    let text = String::from_utf8_lossy(&resp.body).into_owned();
    let parsed = rc::json_parse(&text).and_then(|v| rc::parse_upgrade_item(&v)).map_err(|e| format!("Registry item {url} is invalid: {e}"))?;

    let mut candidates: Vec<(Receipt, &rc::UpgradeFile)> = Vec::new();
    for f in &parsed.files {
        if f.ty != "registry:file" || !f.path.ends_with(".json") {
            continue;
        }
        if let Ok(r) = rc::json_parse(&f.content).and_then(|v| rc::parse_receipt(&v)) {
            candidates.push((r, f));
        }
    }
    if candidates.len() != 1 {
        return Err(format!("Registry item {url} must contain exactly one Astryx receipt; found {}", candidates.len()));
    }
    let (receipt, carrier) = candidates.pop().unwrap();
    if let Some(expected) = ctx.expected_version.filter(|e| !e.is_empty()) {
        if !source_version_matches(&receipt.source_version, expected) {
            return Err(format!(
                "Registry item {url} targets Astryx {}, but the project has {expected}. Update Astryx packages first or retry after the registry catches up.",
                receipt.source_version
            ));
        }
    }
    let expected_type = if receipt.item.kind == "page" { "registry:page" } else { "registry:block" };
    if parsed.name != receipt.item.name || parsed.ty != expected_type {
        return Err(format!("Registry item {url} identity does not match its receipt"));
    }
    let expected_receipt_target = rc::receipt_target(&receipt.files[0].registry_target, &receipt.item.name);
    if carrier.path != format!("registry/{}/astryx-receipt.json", receipt.item.name) || carrier.target.as_deref() != Some(expected_receipt_target.as_str()) {
        return Err(format!("Registry item {url} has a misplaced Astryx receipt"));
    }
    if receipt.item.path != item_path && !receipt.item.aliases.iter().any(|a| a == item_path) {
        return Err(format!("Registry item {url} no longer recognizes installed path {item_path}"));
    }
    let primary = receipt.files.iter().find(|f| f.id == "primary");
    let types = receipt.files.iter().find(|f| f.id == "types");
    if let Some(types) = types {
        let types_variants = if receipt.schema_version == 2 { types.variants.as_ref().map(|v| v.len()) } else { None };
        let primary_target = primary.map(|p| p.registry_target.as_str()).unwrap_or("");
        let (exp_target, exp_content) = match (sv::precompiled_declaration_target(primary_target), sv::precompiled_declaration(primary_target)) {
            (Ok(t), Ok(c)) => (Some(t), Some(c)),
            _ => (None, None),
        };
        if primary.is_none() || Some(&types.registry_target) != exp_target.as_ref() || Some(&types.content) != exp_content.as_ref() || types_variants != Some(0) {
            return Err(format!("Registry item {url} has an invalid TypeScript declaration"));
        }
    }
    for file in &receipt.files {
        let source = parsed.files.iter().find(|c| c.path == file.registry_path);
        let matches = source.map(|src| src.target.as_deref() == Some(file.registry_target.as_str()) && src.content == file.content).unwrap_or(false);
        if !matches {
            return Err(format!("Registry item {url} receipt does not match {}", file.registry_path));
        }
        if rc::content_hash(&file.content) != file.sha256 {
            return Err(format!("Registry item {url} receipt has a corrupt hash for {}", file.registry_path));
        }
        for variant in file_candidates(&receipt, file).into_iter().skip(1) {
            let transformed = sv::transform(&file.content).map_err(|e| e.clone())?;
            if variant.target != sv::js_target(&file.target)
                || variant.registry_target != sv::js_target(&file.registry_target)
                || variant.content != transformed
                || rc::content_hash(&variant.content) != variant.sha256
            {
                return Err(format!("Registry item {url} has an invalid {} variant for {}", variant.format, file.registry_path));
            }
        }
    }
    Ok(receipt)
}

// ---------------------------------------------------------------------------
// Planning.

struct Installed {
    receipt: Receipt,
    files: Vec<Candidate>,
    text: String,
}

fn assert_source(target: &Path, root: &Path, label: &str) -> Result<PathBuf, String> {
    super::assert_within(&s(target), root, true, label).map_err(|e| e.message)
}

/// `loadInstalledReceipt(receiptPath, root, display)`
fn load_installed_receipt(receipt_path: &Path, root: &Path, display: &Path) -> Result<Installed, String> {
    let shown = rel(receipt_path, display);
    let invalid = |m: String| format!("Invalid receipt {shown}: {m}");
    let (receipt, text) = (|| -> Result<(Receipt, String), String> {
        let meta = std::fs::symlink_metadata(receipt_path).map_err(|e| io_message(&e, "lstat", receipt_path))?;
        if meta.file_type().is_symlink() {
            return Err("receipt is a symbolic link".into());
        }
        if meta.len() as usize > MAX_ITEM_BYTES {
            return Err(format!("receipt exceeds {MAX_ITEM_BYTES} bytes"));
        }
        let text = read_utf8(receipt_path)?;
        let receipt = rc::json_parse(&text).and_then(|v| rc::parse_receipt(&v))?;
        let dir_name = receipt_path.parent().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let base = receipt_path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if dir_name != ".astryx" || base != format!("{}.json", receipt.item.name) {
            return Err("receipt filename does not match its item identity".into());
        }
        Ok((receipt, text))
    })()
    .map_err(invalid)?;

    let dir = receipt_path.parent().unwrap_or(Path::new("/"));
    let mut files = Vec::new();
    for file in &receipt.files {
        let mut cands = Vec::new();
        for mut c in file_candidates(&receipt, file) {
            if rc::content_hash(&c.content) != c.sha256 {
                return Err(format!("Invalid receipt {shown}: stored hash does not match {} ({})", file.registry_path, c.format));
            }
            let target = super::fsutil::resolve_from(dir, &c.target);
            c.source_path = assert_source(&target, root, "registry composition source").map_err(|m| format!("Invalid receipt {shown}: {m}"))?;
            cands.push(c);
        }
        let existing: Vec<&Candidate> = cands.iter().filter(|c| c.source_path.exists()).collect();
        if existing.len() > 1 {
            return Err(format!("Invalid receipt {shown}: multiple install variants exist for {}", file.registry_path));
        }
        files.push(existing.first().map(|c| (*c).clone()).unwrap_or_else(|| cands[0].clone()));
    }
    Ok(Installed { receipt, files, text })
}

#[derive(Clone, Debug, Default)]
struct PlannedFile {
    path: String,
    source_path: Option<PathBuf>,
    action: String,
    message: Option<String>,
    content: Option<String>,
    current_content: Option<String>,
    conflict_path: Option<PathBuf>,
}

#[derive(Clone, Debug, Default)]
struct Plan {
    receipt_path: PathBuf,
    item: String,
    item_path: Option<String>,
    action: String,
    message: Option<String>,
    files: Vec<PlannedFile>,
    new_receipt: Option<Receipt>,
    old_receipt_text: Option<String>,
}

fn pf(path: &str, action: &str, message: Option<String>) -> PlannedFile {
    PlannedFile { path: path.into(), action: action.into(), message, ..Default::default() }
}

/// `planReceipt(receiptPath, root, options)`
fn plan_receipt(receipt_path: &Path, root: &Path, display: &Path, ctx: &Ctx) -> Plan {
    let installed = match load_installed_receipt(receipt_path, root, display) {
        Ok(i) => i,
        Err(m) => {
            let stem = receipt_path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let item = stem.strip_suffix(".json").unwrap_or(&stem).to_string();
            return Plan { receipt_path: receipt_path.into(), item, action: "invalid".into(), message: Some(m), ..Default::default() };
        }
    };
    let old = installed.receipt;
    let base = Plan { receipt_path: receipt_path.into(), item: old.item.name.clone(), item_path: Some(old.item.path.clone()), ..Default::default() };
    let new = match fetch_latest_receipt(&old.item.path, ctx) {
        Ok(r) => r,
        Err(m) => return Plan { action: "fetch-error".into(), message: Some(m), ..base },
    };
    let with_text = Plan { old_receipt_text: Some(installed.text.clone()), ..base.clone() };
    if new.item.name != old.item.name || new.item.kind != old.item.kind {
        return Plan { action: "conflict".into(), message: Some("Latest item changed its stable name or kind".into()), ..with_text };
    }
    let mut old_ids: Vec<&str> = old.files.iter().map(|f| f.id.as_str()).collect();
    let mut new_ids: Vec<&str> = new.files.iter().map(|f| f.id.as_str()).collect();
    old_ids.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    new_ids.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    let removed: Vec<&str> = old_ids.iter().filter(|i| !new_ids.contains(i)).copied().collect();
    let added: Vec<&str> = new_ids.iter().filter(|i| !old_ids.contains(i)).copied().collect();
    let adds_only_types = removed.is_empty() && added == ["types"] && old.files.iter().any(|f| f.id == "primary" && is_js_file(&f.registry_target));
    if old_ids != new_ids && !adds_only_types {
        return Plan { action: "conflict".into(), message: Some("Latest item changed its copied source set; no files were written".into()), ..with_text };
    }

    let dir = receipt_path.parent().unwrap_or(Path::new("/"));
    let mut planned: Vec<PlannedFile> = Vec::new();
    if adds_only_types {
        if let Some(types) = new.files.iter().find(|f| f.id == "types") {
            let nf = file_candidates(&new, types).remove(0);
            let source_path = match assert_source(&super::fsutil::resolve_from(dir, &nf.target), root, "registry composition declaration") {
                Ok(p) => p,
                Err(m) => return Plan { action: "invalid".into(), message: Some(m), ..with_text },
            };
            let shown = rel(&source_path, display);
            let entry = (|| -> Result<PlannedFile, String> {
                if !source_path.exists() {
                    return Ok(PlannedFile { source_path: Some(source_path.clone()), content: Some(nf.content.clone()), ..pf(&shown, "create", None) });
                }
                let meta = std::fs::symlink_metadata(&source_path).map_err(|e| io_message(&e, "lstat", &source_path))?;
                if meta.file_type().is_symlink() {
                    return Ok(PlannedFile { source_path: Some(source_path.clone()), ..pf(&shown, "invalid", Some("Generated declaration is a symbolic link; it will not be replaced".into())) });
                }
                let current = read_utf8(&source_path)?;
                let same = rc::content_hash(&current) == nf.sha256;
                Ok(PlannedFile {
                    source_path: Some(source_path.clone()),
                    current_content: Some(current),
                    ..pf(&shown, if same { "current" } else { "conflict" }, if same { None } else { Some("Generated declaration already exists with different content".into()) })
                })
            })();
            planned.push(entry.unwrap_or_else(|m| PlannedFile { source_path: Some(source_path.clone()), ..pf(&shown, "invalid", Some(m)) }));
        }
    }
    for of in &installed.files {
        let shown = rel(&of.source_path, display);
        let Some(new_rf) = new.files.iter().find(|f| f.id == of.id) else {
            planned.push(pf(&shown, "target-changed", Some(format!("Latest item removed source id {}", of.id))));
            continue;
        };
        let Some(nf) = file_candidates(&new, new_rf).into_iter().find(|c| c.format == of.format) else {
            planned.push(pf(&shown, "target-changed", Some(format!("Latest item removed the {} install variant", of.format))));
            continue;
        };
        if nf.target != of.target || nf.registry_target != of.registry_target || nf.registry_path != of.registry_path {
            planned.push(pf(&shown, "target-changed", Some("Latest item changed the copied source target".into())));
            continue;
        }
        if !of.source_path.exists() {
            planned.push(pf(&shown, "missing", Some("Copied source was deleted or moved; it will not be recreated".into())));
            continue;
        }
        let current = match std::fs::symlink_metadata(&of.source_path) {
            Ok(m) if m.file_type().is_symlink() => {
                planned.push(pf(&shown, "invalid", Some("Copied source is a symbolic link; it will not be replaced".into())));
                continue;
            }
            Ok(_) => match read_utf8(&of.source_path) {
                Ok(c) => c,
                Err(m) => {
                    planned.push(pf(&shown, "invalid", Some(m)));
                    continue;
                }
            },
            Err(e) => {
                planned.push(pf(&shown, "invalid", Some(io_message(&e, "lstat", &of.source_path))));
                continue;
            }
        };
        let crlf = current.contains("\r\n");
        let conflict_path = PathBuf::from(format!("{}.astryx-conflict", s(&of.source_path)));
        let cur_c = normalize_line_endings(&current);
        let old_c = normalize_line_endings(&of.content);
        let new_c = normalize_line_endings(&nf.content);
        let (cur_h, old_h, new_h) = (rc::content_hash(&cur_c), rc::content_hash(&old_c), rc::content_hash(&new_c));
        let matches_old = cur_h == old_h || (is_js_file(&of.target) && sv::sources_equivalent(&cur_c, &old_c));
        let mk = |action: &str, content: Option<String>| PlannedFile {
            path: shown.clone(),
            source_path: Some(of.source_path.clone()),
            action: action.into(),
            message: None,
            content,
            current_content: Some(current.clone()),
            conflict_path: Some(conflict_path.clone()),
        };
        if old_h == new_h {
            planned.push(mk(if matches_old { "current" } else { "user-modified" }, None));
            continue;
        }
        if matches_old {
            planned.push(mk("update", Some(apply_line_ending(&new_c, crlf))));
            continue;
        }
        if cur_h == new_h {
            planned.push(mk("receipt-only", None));
            continue;
        }
        let split = |t: &str| t.split('\n').map(|x| x.to_string()).collect::<Vec<_>>();
        let installed_label = format!("installed {}", old.source_version);
        let latest_label = format!("latest {}", new.source_version);
        let (conflict, merged) = merge_diff3(&split(&cur_c), &split(&old_c), &split(&new_c), &Labels { a: "current project", o: &installed_label, b: &latest_label });
        planned.push(mk(if conflict { "conflict" } else { "merge" }, Some(apply_line_ending(&merged.join("\n"), crlf))));
    }

    let any = |acts: &[&str]| planned.iter().any(|f| acts.contains(&f.action.as_str()));
    let action = if any(&["conflict", "missing", "invalid", "target-changed"]) {
        "conflict"
    } else if any(&["merge"]) {
        "merge"
    } else if any(&["update", "create"]) {
        "update"
    } else if any(&["receipt-only"]) || old.serialize() != new.serialize() {
        "receipt-only"
    } else {
        "current"
    };
    Plan { action: action.into(), files: planned, new_receipt: Some(new), ..with_text }
}

// ---------------------------------------------------------------------------
// Summary and apply.

fn n(v: u64) -> Value {
    Value::from(v)
}

/// `emptySummary(apply)`
pub fn empty_summary(apply: bool) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("applied".into(), Value::Bool(apply));
    m.insert("ok".into(), Value::Bool(true));
    for k in ["found", "current", "wouldUpdate", "updated", "wouldMerge", "merged", "wouldRefreshReceipt", "receiptsRefreshed", "conflicts", "missing", "invalid", "failed"] {
        m.insert(k.into(), n(0));
    }
    m.insert("items".into(), Value::Array(vec![]));
    m
}

fn bump(m: &mut Map<String, Value>, k: &str, by: i64) {
    let v = m.get(k).and_then(|x| x.as_i64()).unwrap_or(0) + by;
    m.insert(k.into(), Value::from(v));
}

fn count(m: &Map<String, Value>, k: &str) -> i64 {
    m.get(k).and_then(|x| x.as_i64()).unwrap_or(0)
}

fn public_action(action: &str, apply: bool) -> String {
    match action {
        "update" => if apply { "updated" } else { "would-update" },
        "create" => if apply { "created" } else { "would-create" },
        "merge" => if apply { "merged" } else { "would-merge" },
        "receipt-only" => if apply { "receipt-refreshed" } else { "would-refresh-receipt" },
        a => a,
    }
    .to_string()
}

/// `publicItem(item, display, apply)`
fn public_item(plan: &Plan, display: &Path, apply: bool) -> Value {
    let mut m = Map::new();
    m.insert("item".into(), Value::String(plan.item.clone()));
    if let Some(p) = &plan.item_path {
        m.insert("path".into(), Value::String(p.clone()));
    }
    m.insert("action".into(), Value::String(public_action(&plan.action, apply)));
    if let Some(msg) = plan.message.as_ref().filter(|x| !x.is_empty()) {
        m.insert("message".into(), Value::String(msg.clone()));
    }
    let files = plan
        .files
        .iter()
        .map(|f| {
            let mut fm = Map::new();
            fm.insert("path".into(), Value::String(f.path.clone()));
            fm.insert("action".into(), Value::String(public_action(&f.action, apply)));
            if let Some(msg) = f.message.as_ref().filter(|x| !x.is_empty()) {
                fm.insert("message".into(), Value::String(msg.clone()));
            }
            if f.action == "conflict" {
                if let Some(c) = &f.conflict_path {
                    fm.insert("conflictFile".into(), Value::String(rel(c, display)));
                }
            }
            Value::Object(fm)
        })
        .collect();
    m.insert("files".into(), Value::Array(files));
    Value::Object(m)
}

fn record_item(summary: &mut Map<String, Value>, item: Value, action: &str, apply: bool) {
    if let Some(Value::Array(items)) = summary.get_mut("items") {
        items.push(item);
    }
    match action {
        "current" | "user-modified" => bump(summary, "current", 1),
        "update" => bump(summary, if apply { "updated" } else { "wouldUpdate" }, 1),
        "merge" => bump(summary, if apply { "merged" } else { "wouldMerge" }, 1),
        "receipt-only" => bump(summary, if apply { "receiptsRefreshed" } else { "wouldRefreshReceipt" }, 1),
        "conflict" => bump(summary, "conflicts", 1),
        "invalid" => bump(summary, "invalid", 1),
        "fetch-error" => bump(summary, "failed", 1),
        _ => {}
    }
}

/// `applyPlan(plan)`
fn apply_plan(plan: &Plan) -> Result<(), String> {
    if !["conflict", "update", "merge", "receipt-only"].contains(&plan.action.as_str()) {
        return Ok(());
    }
    if let Some(old_text) = &plan.old_receipt_text {
        if &read_utf8(&plan.receipt_path)? != old_text {
            return Err("Receipt changed while the upgrade was running".into());
        }
    }
    for f in &plan.files {
        if f.action == "create" && f.source_path.as_ref().map(|p| p.exists()).unwrap_or(false) {
            return Err(format!("{} appeared while the upgrade was running", f.path));
        }
        if let (Some(p), Some(cur)) = (&f.source_path, &f.current_content) {
            if &read_utf8(p)? != cur {
                return Err(format!("{} changed while the upgrade was running", f.path));
            }
        }
    }
    if plan.action == "conflict" {
        for f in &plan.files {
            if f.action == "conflict" {
                if let (Some(c), Some(content)) = (&f.conflict_path, &f.content) {
                    atomic_write(c, content)?;
                }
            }
        }
        return Ok(());
    }
    let writable: Vec<&PlannedFile> = plan.files.iter().filter(|f| ["update", "merge", "create"].contains(&f.action.as_str())).collect();
    let mut originals = Vec::new();
    for f in writable.iter().filter(|f| f.action != "create") {
        let p = f.source_path.clone().unwrap_or_default();
        let c = read_utf8(&p)?;
        originals.push((p, c));
    }
    let mut created: Vec<PathBuf> = Vec::new();
    let old_receipt_text = read_utf8(&plan.receipt_path)?;
    let result = (|| -> Result<(), String> {
        for f in &writable {
            let p = f.source_path.clone().unwrap_or_default();
            atomic_write(&p, f.content.as_deref().unwrap_or(""))?;
            if f.action == "create" {
                created.push(p);
            }
        }
        let receipt = plan.new_receipt.as_ref().map(|r| r.serialize()).unwrap_or_default();
        atomic_write(&plan.receipt_path, &receipt)
    })();
    if let Err(e) = result {
        for c in &created {
            let _ = std::fs::remove_file(c);
        }
        for (p, c) in &originals {
            let _ = atomic_write(p, c);
        }
        let _ = atomic_write(&plan.receipt_path, &old_receipt_text);
        return Err(e);
    }
    for f in &plan.files {
        if let Some(c) = &f.conflict_path {
            let _ = std::fs::remove_file(c);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Entry points.

/// The context of `reconcileRegistryCompositions(options, ctx)`.
pub struct Ctx<'a> {
    pub cwd: &'a Path,
    pub origin: Option<&'a Path>,
    pub fetcher: &'a dyn Fetcher,
    pub registry_origin: &'a str,
    pub expected_version: Option<&'a str>,
    pub require_expected_version: bool,
}

pub struct Reconciled {
    pub summary: Map<String, Value>,
    pub written_files: Vec<PathBuf>,
}

fn source_root(opts_path: Option<&str>, cwd: &Path) -> Result<PathBuf, ApiError> {
    super::assert_within(opts_path.unwrap_or("./src"), cwd, true, "source directory").map_err(|e| ApiError::new(e.message, "ERR_PATH_TRAVERSAL"))
}

/// `reconcileRegistryCompositions(options, ctx)`
pub fn reconcile_registry_compositions(apply: bool, path: Option<&str>, ctx: &Ctx) -> Result<Reconciled, ApiError> {
    let root = source_root(path, ctx.cwd)?;
    let display: PathBuf = ctx.origin.map(|o| o.to_path_buf()).unwrap_or_else(|| root.clone());
    if root.exists() && !root.is_dir() {
        // readdirSync on a file: an uncaught error in the JS CLI.
        return Err(ApiError::new(format!("ENOTDIR: not a directory, scandir '{}'", root.display()), "CRASH"));
    }
    let receipts = discover_registry_receipts(&root);
    let mut summary = empty_summary(apply);
    summary.insert("found".into(), n(receipts.len() as u64));
    if receipts.is_empty() {
        return Ok(Reconciled { summary, written_files: Vec::new() });
    }
    if ctx.require_expected_version && ctx.expected_version.map(|v| v.is_empty()).unwrap_or(true) {
        return Err(ApiError::new("Could not find installed @astryxdesign/core. Install project dependencies before upgrading copied compositions.", "ERR_VERSION_DETECT"));
    }

    // Plan with at most FETCH_CONCURRENCY receipts in flight, keeping order.
    let next = std::sync::atomic::AtomicUsize::new(0);
    let results: std::sync::Mutex<Vec<Option<Plan>>> = std::sync::Mutex::new(vec![None; receipts.len()]);
    std::thread::scope(|scope| {
        for _ in 0..FETCH_CONCURRENCY.min(receipts.len()) {
            scope.spawn(|| loop {
                let i = next.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                if i >= receipts.len() {
                    break;
                }
                let plan = plan_receipt(&receipts[i], &root, &display, ctx);
                results.lock().unwrap()[i] = Some(plan);
            });
        }
    });
    let plans: Vec<Plan> = results.into_inner().unwrap().into_iter().map(|p| p.unwrap_or_default()).collect();

    let mut written = Vec::new();
    for plan in &plans {
        for f in &plan.files {
            if f.action == "missing" {
                bump(&mut summary, "missing", 1);
            }
            if f.action == "invalid" || f.action == "target-changed" {
                bump(&mut summary, "invalid", 1);
            }
        }
        record_item(&mut summary, public_item(plan, &display, apply), &plan.action, apply);
        if !apply {
            continue;
        }
        match apply_plan(plan) {
            Ok(()) => {
                if plan.action == "update" || plan.action == "merge" {
                    for f in &plan.files {
                        if let Some(p) = &f.source_path {
                            if ["update", "merge", "create"].contains(&f.action.as_str()) {
                                written.push(p.clone());
                            }
                        }
                    }
                }
            }
            Err(e) => {
                match plan.action.as_str() {
                    "update" => bump(&mut summary, "updated", -1),
                    "merge" => bump(&mut summary, "merged", -1),
                    "receipt-only" => bump(&mut summary, "receiptsRefreshed", -1),
                    _ => {}
                }
                bump(&mut summary, "failed", 1);
                if let Some(Value::Array(items)) = summary.get_mut("items") {
                    if let Some(Value::Object(last)) = items.last_mut() {
                        last.insert("action".into(), Value::String("write-error".into()));
                        last.insert("message".into(), Value::String(e));
                    }
                }
            }
        }
    }
    let ok = count(&summary, "conflicts") == 0 && count(&summary, "missing") == 0 && count(&summary, "invalid") == 0 && count(&summary, "failed") == 0;
    summary.insert("ok".into(), Value::Bool(ok));
    Ok(Reconciled { summary, written_files: written })
}

fn plural(n: i64, word: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { word } else { many })
}

/// `logRegistryCompositionSummary(summary)`
pub fn log_summary(ui: &mut Ui, summary: &Map<String, Value>) {
    let found = count(summary, "found");
    if found == 0 {
        return;
    }
    ui.log(&format!("{} checked.", plural(found, "ShadCN composition receipt", "ShadCN composition receipts")));
    let applied = summary.get("applied").and_then(|v| v.as_bool()).unwrap_or(false);
    let pending = count(summary, "wouldUpdate") + count(summary, "wouldMerge") + count(summary, "wouldRefreshReceipt");
    if !applied && pending > 0 {
        ui.log(&format!("{} available (dry run).", plural(pending, "update", "updates")));
    }
    let changed = count(summary, "updated") + count(summary, "merged");
    let refreshed = count(summary, "receiptsRefreshed");
    if changed + refreshed > 0 {
        let tail = if refreshed > 0 { format!("; {} refreshed.", plural(refreshed, "receipt", "receipts")) } else { ".".into() };
        ui.log(&format!("{} updated{tail}", plural(changed, "composition", "compositions")));
    }
    let (conflicts, missing, invalid, failed) = (count(summary, "conflicts"), count(summary, "missing"), count(summary, "invalid"), count(summary, "failed"));
    if conflicts + missing + invalid + failed > 0 {
        ui.warn(&format!("{conflicts} conflict(s), {missing} missing file(s), {invalid} invalid receipt(s), {failed} failed item(s)."));
        if let Some(Value::Array(items)) = summary.get("items") {
            for item in items {
                let name = item.get("item").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(msg) = item.get("message").and_then(|v| v.as_str()) {
                    ui.warn(&format!("  {name}: {msg}"));
                }
                for f in item.get("files").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
                    let action = f.get("action").and_then(|v| v.as_str()).unwrap_or("");
                    if !["conflict", "missing", "invalid", "target-changed"].contains(&action) {
                        continue;
                    }
                    let detail = if let Some(c) = f.get("conflictFile").and_then(|v| v.as_str()) {
                        format!(" Review {c}.")
                    } else if let Some(m) = f.get("message").and_then(|v| v.as_str()) {
                        format!(" {m}.")
                    } else {
                        String::new()
                    };
                    let p = f.get("path").and_then(|v| v.as_str()).unwrap_or("");
                    ui.warn(&format!("  {p}: {action}.{detail}"));
                }
            }
        }
    }
}

fn live_ctx<'a>(cwd: &'a Path, origin: Option<&'a Path>, expected: Option<&'a str>) -> Ctx<'a> {
    Ctx { cwd, origin, fetcher: &HttpFetcher, registry_origin: PUBLIC_SHADCN_REGISTRY_ORIGIN, expected_version: expected, require_expected_version: true }
}

/// `registryUpgrade(options, ctx)`: the standalone `upgrade --registry` leaf.
pub fn registry_upgrade(ui: &mut Ui, opts: &Opts, cwd: &Path, origin: Option<&Path>) -> Result<Value, ApiError> {
    if let Some(o) = origin {
        let r = relative(o, cwd);
        ui.log(&format!("Project root: {}", if r.is_empty() { "." } else { &r }));
    }
    let installed = super::run::detect_installed_target_version(cwd);
    let expected = installed.as_ref().filter(|i| i.package_name == "@astryxdesign/core").map(|i| i.version.clone());
    let res = reconcile_registry_compositions(opts.apply, opts.path.as_deref(), &live_ctx(cwd, origin, expected.as_deref()))?;
    let summary = res.summary;
    if count(&summary, "found") == 0 {
        ui.log("No ShadCN composition receipts found.");
    } else {
        log_summary(ui, &summary);
    }
    let ok = summary.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
    let applied = summary.get("applied").and_then(|v| v.as_bool()).unwrap_or(false);
    ui.log(if ok {
        if applied {
            "Registry upgrade complete\n"
        } else {
            "Registry dry run complete\n"
        }
    } else {
        "Registry upgrade finished with unresolved items\n"
    });
    Ok(Value::Object(summary))
}

/// `reconcileCompositions()` inside `run`, with the files it wrote.
pub fn reconcile_for_run_with_writes(ui: &mut Ui, apply: bool, path: &Path, cwd: &Path, origin: Option<&Path>, expected: Option<&str>) -> Result<Option<(Value, Vec<PathBuf>)>, ApiError> {
    let res = reconcile_registry_compositions(apply, Some(&s(path)), &live_ctx(cwd, origin, expected))?;
    if count(&res.summary, "found") > 0 {
        log_summary(ui, &res.summary);
        return Ok(Some((Value::Object(res.summary), res.written_files)));
    }
    Ok(None)
}

/// `reconcileCompositions()` inside `run`: the summary when receipts exist.
pub fn reconcile_for_run(ui: &mut Ui, apply: bool, path: &Path, cwd: &Path, origin: Option<&Path>, expected: Option<&str>) -> Result<Option<Value>, ApiError> {
    Ok(reconcile_for_run_with_writes(ui, apply, path, cwd, origin, expected)?.map(|(v, _)| v))
}
