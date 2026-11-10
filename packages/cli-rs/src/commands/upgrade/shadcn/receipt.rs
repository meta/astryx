//! The ShadCN provenance receipt contract (`authoring/shadcn/receipt.mjs`):
//! zod-exact validation (issue list and order), hashing, receipt placement,
//! and deterministic serialization.

use crate::json::{Map, Value};
use sha2::{Digest, Sha256};

pub const PUBLIC_SHADCN_REGISTRY_ORIGIN: &str = "https://astryx.atmeta.com/shadcn";

#[derive(Clone, Debug, PartialEq)]
pub struct Variant {
    pub format: String,
    pub target: String,
    pub registry_target: String,
    pub sha256: String,
    pub content: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ReceiptFile {
    pub id: String,
    pub target: String,
    pub registry_target: String,
    pub registry_path: String,
    pub sha256: String,
    pub content: String,
    /// Absent in schema version 1.
    pub variants: Option<Vec<Variant>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Item {
    pub name: String,
    pub path: String,
    pub aliases: Vec<String>,
    pub kind: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Receipt {
    pub schema_version: u8,
    pub item: Item,
    pub source_version: String,
    pub files: Vec<ReceiptFile>,
}

/// A file of a registry item (`registryUpgradeFileSchema`, passthrough).
#[derive(Clone, Debug)]
pub struct UpgradeFile {
    pub path: String,
    pub ty: String,
    pub target: Option<String>,
    pub content: String,
}

#[derive(Clone, Debug)]
pub struct UpgradeItem {
    pub name: String,
    pub ty: String,
    pub files: Vec<UpgradeFile>,
}

/// `registryContentHash(content)`
pub fn content_hash(content: &str) -> String {
    let d = Sha256::digest(content.as_bytes());
    let mut s = String::with_capacity(64);
    for b in d {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

/// `path.posix.normalize`-style join of segments.
pub fn posix_join(parts: &[&str]) -> String {
    let joined = parts.iter().filter(|p| !p.is_empty()).cloned().collect::<Vec<_>>().join("/");
    posix_normalize(&joined)
}

pub fn posix_normalize(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let abs = p.starts_with('/');
    let trailing = p.ends_with('/');
    let mut out: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if !out.is_empty() && *out.last().unwrap() != ".." {
                    out.pop();
                } else if !abs {
                    out.push("..");
                }
            }
            s => out.push(s),
        }
    }
    let mut r = out.join("/");
    if r.is_empty() && !abs {
        r = ".".into();
    }
    if trailing && r != "." && !r.is_empty() {
        r.push('/');
    }
    if abs {
        format!("/{r}")
    } else {
        r
    }
}

/// `path.posix.dirname`
pub fn posix_dirname(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let has_root = p.starts_with('/');
    let bytes = p.as_bytes();
    let mut end: Option<usize> = None;
    let mut matched_slash = true;
    for i in (1..bytes.len()).rev() {
        if bytes[i] == b'/' {
            if !matched_slash {
                end = Some(i);
                break;
            }
        } else {
            matched_slash = false;
        }
    }
    match end {
        None => {
            if has_root {
                "/".into()
            } else {
                ".".into()
            }
        }
        Some(1) if has_root => "//".into(),
        Some(e) => p[..e].to_string(),
    }
}

/// `path.posix.extname`
pub fn posix_extname(p: &str) -> String {
    let base = p.trim_end_matches('/');
    let base = base.rsplit('/').next().unwrap_or("");
    match base.rfind('.') {
        None | Some(0) => String::new(),
        Some(i) => {
            if base[..i].chars().all(|c| c == '.') {
                String::new()
            } else {
                base[i..].to_string()
            }
        }
    }
}

/// `registryReceiptTarget(sourceTarget, itemName)`
pub fn receipt_target(source_target: &str, item_name: &str) -> String {
    let dir = posix_dirname(source_target);
    posix_join(&[&dir, ".astryx", &format!("{item_name}.json")])
}

fn s(v: &str) -> Value {
    Value::String(v.to_string())
}

impl Variant {
    fn to_value(&self) -> Value {
        let mut m = Map::new();
        m.insert("format".into(), s(&self.format));
        m.insert("target".into(), s(&self.target));
        m.insert("registryTarget".into(), s(&self.registry_target));
        m.insert("sha256".into(), s(&self.sha256));
        m.insert("content".into(), s(&self.content));
        Value::Object(m)
    }
}

impl Receipt {
    pub fn to_value(&self) -> Value {
        let mut item = Map::new();
        item.insert("name".into(), s(&self.item.name));
        item.insert("path".into(), s(&self.item.path));
        item.insert("aliases".into(), Value::Array(self.item.aliases.iter().map(|a| s(a)).collect()));
        item.insert("kind".into(), s(&self.item.kind));
        let mut source = Map::new();
        source.insert("package".into(), s("@astryxdesign/cli"));
        source.insert("version".into(), s(&self.source_version));
        let files = self
            .files
            .iter()
            .map(|f| {
                let mut m = Map::new();
                m.insert("id".into(), s(&f.id));
                m.insert("target".into(), s(&f.target));
                m.insert("registryTarget".into(), s(&f.registry_target));
                m.insert("registryPath".into(), s(&f.registry_path));
                m.insert("sha256".into(), s(&f.sha256));
                m.insert("content".into(), s(&f.content));
                if let Some(v) = &f.variants {
                    m.insert("variants".into(), Value::Array(v.iter().map(|x| x.to_value()).collect()));
                }
                Value::Object(m)
            })
            .collect();
        let mut m = Map::new();
        m.insert("schemaVersion".into(), Value::from(self.schema_version as u64));
        m.insert("item".into(), Value::Object(item));
        m.insert("source".into(), Value::Object(source));
        m.insert("files".into(), Value::Array(files));
        Value::Object(m)
    }

    /// `serializeRegistryReceipt(receipt)`
    pub fn serialize(&self) -> String {
        format!("{}\n", crate::json::stringify(&self.to_value(), 2))
    }
}

/// `createRegistryReceipt(input)` (used by tests to build fixtures).
pub struct CreateFile<'a> {
    pub id: &'a str,
    pub target: &'a str,
    pub registry_path: &'a str,
    pub content: &'a str,
    pub variants: Vec<(&'a str, String)>,
}

pub fn create_receipt(item: Item, source_version: &str, receipt_target: &str, files: Vec<CreateFile>) -> Result<Receipt, String> {
    let dir = posix_dirname(receipt_target);
    let rel = |t: &str| posix_relative(&dir, t);
    let r = Receipt {
        schema_version: 2,
        item,
        source_version: source_version.into(),
        files: files
            .iter()
            .map(|f| ReceiptFile {
                id: f.id.into(),
                target: rel(f.target),
                registry_target: f.target.into(),
                registry_path: f.registry_path.into(),
                sha256: content_hash(f.content),
                content: f.content.into(),
                variants: Some(
                    f.variants
                        .iter()
                        .map(|(t, c)| Variant { format: "javascript".into(), target: rel(t), registry_target: (*t).into(), sha256: content_hash(c), content: c.clone() })
                        .collect(),
                ),
            })
            .collect(),
    };
    parse_receipt(&r.to_value())
}

/// `path.posix.relative(from, to)` for relative inputs (resolved against `/`).
pub fn posix_relative(from: &str, to: &str) -> String {
    let f = posix_normalize(&format!("/{from}"));
    let t = posix_normalize(&format!("/{to}"));
    let fa: Vec<&str> = f.split('/').filter(|x| !x.is_empty()).collect();
    let ta: Vec<&str> = t.split('/').filter(|x| !x.is_empty()).collect();
    let mut i = 0;
    while i < fa.len() && i < ta.len() && fa[i] == ta[i] {
        i += 1;
    }
    let mut parts: Vec<&str> = vec![".."; fa.len() - i];
    parts.extend(&ta[i..]);
    parts.join("/")
}

// ---------------------------------------------------------------------------
// zod v4 validation, issue for issue.

#[derive(Clone)]
enum P {
    K(&'static str),
    I(usize),
}

struct Ctx {
    issues: Vec<Value>,
    /// Whether every issue so far lets later refinements run.
    cont: bool,
}

fn path_value(path: &[P]) -> Value {
    Value::Array(
        path.iter()
            .map(|p| match p {
                P::K(k) => s(k),
                P::I(i) => Value::from(*i as u64),
            })
            .collect(),
    )
}

fn type_name(v: Option<&Value>) -> &'static str {
    match v {
        None => "undefined",
        Some(Value::Null) => "null",
        Some(Value::Bool(_)) => "boolean",
        Some(Value::Number(_)) => "number",
        Some(Value::String(_)) => "string",
        Some(Value::Array(_)) => "array",
        Some(Value::Object(_)) => "object",
    }
}

impl Ctx {
    fn push(&mut self, fields: Vec<(&str, Value)>, path: &[P], message: String, cont: bool) {
        let mut m = Map::new();
        for (k, v) in fields {
            if k == "path" {
                continue;
            }
            m.insert(k.into(), v);
        }
        m.insert("path".into(), path_value(path));
        m.insert("message".into(), Value::String(message));
        self.issues.push(Value::Object(m));
        if !cont {
            self.cont = false;
        }
    }
    fn invalid_type(&mut self, expected: &str, v: Option<&Value>, path: &[P]) {
        let msg = format!("Invalid input: expected {expected}, received {}", type_name(v));
        self.push(vec![("expected", s(expected)), ("code", s("invalid_type"))], path, msg, false);
    }
    fn regex(&mut self, pattern: &str, path: &[P], message: Option<&str>) {
        let msg = message.map(|m| m.to_string()).unwrap_or_else(|| format!("Invalid string: must match pattern {pattern}"));
        self.push(vec![("origin", s("string")), ("code", s("invalid_format")), ("format", s("regex")), ("pattern", s(pattern))], path, msg, true);
    }
    fn custom(&mut self, path: &[P], message: &str) {
        self.push(vec![("code", s("custom"))], path, message.into(), true);
    }
    fn too_small(&mut self, origin: &str, path: &[P]) {
        let msg = if origin == "string" { "Too small: expected string to have >=1 characters" } else { "Too small: expected array to have >=1 items" };
        self.push(vec![("origin", s(origin)), ("code", s("too_small")), ("minimum", Value::from(1u64)), ("inclusive", Value::Bool(true))], path, msg.into(), true);
    }
    fn string<'v>(&mut self, v: Option<&'v Value>, path: &[P]) -> Option<&'v str> {
        match v {
            Some(Value::String(x)) => Some(x.as_str()),
            other => {
                self.invalid_type("string", other, path);
                None
            }
        }
    }
}

fn kebab(s: &str) -> bool {
    !s.is_empty() && s.split('-').all(|seg| !seg.is_empty() && seg.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()))
}

fn semver_exact(v: &str) -> bool {
    if v == "canary" {
        return true;
    }
    let cls = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-');
    let (main, build) = match v.find('+') {
        Some(i) => (&v[..i], Some(&v[i + 1..])),
        None => (v, None),
    };
    if let Some(b) = build {
        if !cls(b) {
            return false;
        }
    }
    let (core, pre) = match main.find('-') {
        Some(i) => (&main[..i], Some(&main[i + 1..])),
        None => (main, None),
    };
    if let Some(p) = pre {
        if !cls(p) {
            return false;
        }
    }
    let parts: Vec<&str> = core.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

const NAME_PATTERN: &str = "/^[a-z0-9]+(?:-[a-z0-9]+)*$/";
const PATH_PATTERN: &str = "/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/";
const SHA_PATTERN: &str = "/^[a-f0-9]{64}$/";
const TARGET_PATTERN: &str = "/^\\.\\.\\/[^/\\\\]+$/";
const VERSION_PATTERN: &str = "/^(?:canary|\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?)$/";
const ADJACENT: &str = "must point to one adjacent source file";

fn kebab_field(c: &mut Ctx, v: Option<&Value>, path: &[P]) -> String {
    match c.string(v, path) {
        Some(x) => {
            if !kebab(x) {
                c.regex(NAME_PATTERN, path, None);
            }
            x.to_string()
        }
        None => String::new(),
    }
}

fn registry_path_field(c: &mut Ctx, v: Option<&Value>, path: &[P]) -> String {
    match c.string(v, path) {
        Some(x) => {
            if !(!x.is_empty() && x.split('/').all(kebab)) {
                c.regex(PATH_PATTERN, path, Some("must be a lowercase registry path"));
            }
            x.to_string()
        }
        None => String::new(),
    }
}

fn file_path_field(c: &mut Ctx, v: Option<&Value>, path: &[P]) -> String {
    match c.string(v, path) {
        Some(x) => {
            if x.is_empty() {
                c.too_small("string", path);
            }
            if x.starts_with('/') {
                c.custom(path, "must be relative");
            }
            if x.contains('\\') {
                c.custom(path, "must use forward slashes");
            }
            if !x.split('/').all(|seg| !seg.is_empty() && seg != "." && seg != "..") {
                c.custom(path, "must be a normalized registry path");
            }
            x.to_string()
        }
        None => String::new(),
    }
}

fn target_field(c: &mut Ctx, v: Option<&Value>, path: &[P]) -> String {
    match c.string(v, path) {
        Some(x) => {
            let ok = x.strip_prefix("../").map(|r| !r.is_empty() && !r.contains('/') && !r.contains('\\')).unwrap_or(false);
            if !ok {
                c.regex(TARGET_PATTERN, path, Some(ADJACENT));
            }
            if x == "../." || x == "../.." {
                c.custom(path, ADJACENT);
            }
            x.to_string()
        }
        None => String::new(),
    }
}

fn sha_field(c: &mut Ctx, v: Option<&Value>, path: &[P]) -> String {
    match c.string(v, path) {
        Some(x) => {
            if !(x.len() == 64 && x.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))) {
                c.regex(SHA_PATTERN, path, None);
            }
            x.to_string()
        }
        None => String::new(),
    }
}

fn plain_string(c: &mut Ctx, v: Option<&Value>, path: &[P]) -> String {
    c.string(v, path).map(|x| x.to_string()).unwrap_or_default()
}

fn with(path: &[P], p: P) -> Vec<P> {
    let mut v = path.to_vec();
    v.push(p);
    v
}

fn quote_list(vals: &[&str], sep: &str) -> String {
    vals.iter().map(|v| format!("\"{v}\"")).collect::<Vec<_>>().join(sep)
}

/// Strict-object unknown keys, reported after the shape's own issues.
fn strict_keys(c: &mut Ctx, m: &Map<String, Value>, shape: &[&str], path: &[P]) {
    let extra: Vec<&str> = m.keys().filter(|k| !shape.contains(&k.as_str())).map(|k| k.as_str()).collect();
    if !extra.is_empty() {
        let msg = format!("Unrecognized key{}: {}", if extra.len() > 1 { "s" } else { "" }, quote_list(&extra, ", "));
        c.push(vec![("code", s("unrecognized_keys")), ("keys", Value::Array(extra.iter().map(|k| s(k)).collect()))], path, msg, false);
    }
}

fn object<'v>(c: &mut Ctx, v: Option<&'v Value>, path: &[P]) -> Option<&'v Map<String, Value>> {
    match v {
        Some(Value::Object(m)) => Some(m),
        other => {
            c.invalid_type("object", other, path);
            None
        }
    }
}

fn array<'v>(c: &mut Ctx, v: Option<&'v Value>, path: &[P]) -> Option<&'v Vec<Value>> {
    match v {
        Some(Value::Array(a)) => Some(a),
        other => {
            c.invalid_type("array", other, path);
            None
        }
    }
}

fn parse_item(c: &mut Ctx, v: Option<&Value>) -> Item {
    let path = [P::K("item")];
    let mut item = Item { name: String::new(), path: String::new(), aliases: Vec::new(), kind: String::new() };
    let Some(m) = object(c, v, &path) else { return item };
    item.name = kebab_field(c, m.get("name"), &with(&path, P::K("name")));
    item.path = registry_path_field(c, m.get("path"), &with(&path, P::K("path")));
    let ap = with(&path, P::K("aliases"));
    if let Some(a) = array(c, m.get("aliases"), &ap) {
        for (i, x) in a.iter().enumerate() {
            item.aliases.push(registry_path_field(c, Some(x), &with(&ap, P::I(i))));
        }
    }
    let kinds = ["showcase", "example", "block", "page"];
    let kp = with(&path, P::K("kind"));
    match m.get("kind") {
        Some(Value::String(k)) if kinds.contains(&k.as_str()) => item.kind = k.clone(),
        _ => {
            let msg = format!("Invalid option: expected one of {}", quote_list(&kinds, "|"));
            c.push(vec![("code", s("invalid_value")), ("values", Value::Array(kinds.iter().map(|k| s(k)).collect()))], &kp, msg, false);
        }
    }
    strict_keys(c, m, &["name", "path", "aliases", "kind"], &path);
    item
}

fn parse_source(c: &mut Ctx, v: Option<&Value>) -> String {
    let path = [P::K("source")];
    let Some(m) = object(c, v, &path) else { return String::new() };
    let pp = with(&path, P::K("package"));
    if m.get("package").and_then(|x| x.as_str()) != Some("@astryxdesign/cli") {
        c.push(vec![("code", s("invalid_value")), ("values", Value::Array(vec![s("@astryxdesign/cli")]))], &pp, "Invalid input: expected \"@astryxdesign/cli\"".into(), false);
    }
    let vp = with(&path, P::K("version"));
    let version = match c.string(m.get("version"), &vp) {
        Some(x) => {
            if !semver_exact(x) {
                c.regex(VERSION_PATTERN, &vp, Some("must be canary or an exact semantic version"));
            }
            x.to_string()
        }
        None => String::new(),
    };
    strict_keys(c, m, &["package", "version"], &path);
    version
}

fn parse_variant(c: &mut Ctx, v: &Value, path: &[P]) -> Variant {
    let mut out = Variant { format: String::new(), target: String::new(), registry_target: String::new(), sha256: String::new(), content: String::new() };
    let Some(m) = object(c, Some(v), path) else { return out };
    let fp = with(path, P::K("format"));
    if m.get("format").and_then(|x| x.as_str()) == Some("javascript") {
        out.format = "javascript".into();
    } else {
        c.push(vec![("code", s("invalid_value")), ("values", Value::Array(vec![s("javascript")]))], &fp, "Invalid input: expected \"javascript\"".into(), false);
    }
    out.target = target_field(c, m.get("target"), &with(path, P::K("target")));
    out.registry_target = file_path_field(c, m.get("registryTarget"), &with(path, P::K("registryTarget")));
    out.sha256 = sha_field(c, m.get("sha256"), &with(path, P::K("sha256")));
    out.content = plain_string(c, m.get("content"), &with(path, P::K("content")));
    strict_keys(c, m, &["format", "target", "registryTarget", "sha256", "content"], path);
    out
}

fn parse_file(c: &mut Ctx, v: &Value, path: &[P], v2: bool) -> ReceiptFile {
    let mut f = ReceiptFile {
        id: String::new(),
        target: String::new(),
        registry_target: String::new(),
        registry_path: String::new(),
        sha256: String::new(),
        content: String::new(),
        variants: if v2 { Some(Vec::new()) } else { None },
    };
    let Some(m) = object(c, Some(v), path) else { return f };
    f.id = kebab_field(c, m.get("id"), &with(path, P::K("id")));
    f.target = target_field(c, m.get("target"), &with(path, P::K("target")));
    f.registry_target = file_path_field(c, m.get("registryTarget"), &with(path, P::K("registryTarget")));
    f.registry_path = file_path_field(c, m.get("registryPath"), &with(path, P::K("registryPath")));
    f.sha256 = sha_field(c, m.get("sha256"), &with(path, P::K("sha256")));
    f.content = plain_string(c, m.get("content"), &with(path, P::K("content")));
    if v2 {
        let vp = with(path, P::K("variants"));
        if let Some(a) = array(c, m.get("variants"), &vp) {
            let vs = a.iter().enumerate().map(|(i, x)| parse_variant(c, x, &with(&vp, P::I(i)))).collect();
            f.variants = Some(vs);
        }
        strict_keys(c, m, &["id", "target", "registryTarget", "registryPath", "sha256", "content", "variants"], path);
    } else {
        strict_keys(c, m, &["id", "target", "registryTarget", "registryPath", "sha256", "content"], path);
    }
    f
}

fn issues_message(issues: Vec<Value>) -> String {
    crate::json::stringify(&Value::Array(issues), 2)
}

fn has_dup(v: &[&str]) -> bool {
    let mut seen = std::collections::HashSet::new();
    v.iter().any(|x| !seen.insert(*x))
}

/// `parseRegistryReceipt(input)`: the receipt, or the ZodError message.
pub fn parse_receipt(v: &Value) -> Result<Receipt, String> {
    let mut c = Ctx { issues: Vec::new(), cont: true };
    let Value::Object(m) = v else {
        let msg = format!("Invalid input: expected object, received {}", type_name(Some(v)));
        c.push(vec![("code", s("invalid_type")), ("expected", s("object"))], &[], msg, false);
        return Err(issues_message(c.issues));
    };
    let version = match m.get("schemaVersion") {
        Some(Value::Number(n)) if n.as_f64() == Some(1.0) => 1u8,
        Some(Value::Number(n)) if n.as_f64() == Some(2.0) => 2u8,
        _ => {
            c.push(
                vec![
                    ("code", s("invalid_union")),
                    ("errors", Value::Array(vec![])),
                    ("note", s("No matching discriminator")),
                    ("discriminator", s("schemaVersion")),
                    ("options", Value::Array(vec![Value::from(1u64), Value::from(2u64)])),
                ],
                &[P::K("schemaVersion")],
                "Invalid discriminator value. Expected '1' | '2'".into(),
                false,
            );
            return Err(issues_message(c.issues));
        }
    };
    let item = parse_item(&mut c, m.get("item"));
    let source_version = parse_source(&mut c, m.get("source"));
    let mut files = Vec::new();
    let fp = [P::K("files")];
    if let Some(a) = array(&mut c, m.get("files"), &fp) {
        for (i, x) in a.iter().enumerate() {
            files.push(parse_file(&mut c, x, &[P::K("files"), P::I(i)], version == 2));
        }
        if a.is_empty() {
            c.too_small("array", &fp);
        }
    }
    strict_keys(&mut c, m, &["schemaVersion", "item", "source", "files"], &[]);
    if c.cont {
        let ids: Vec<&str> = files.iter().map(|f| f.id.as_str()).collect();
        let paths: Vec<&str> = files.iter().map(|f| f.registry_path.as_str()).collect();
        let mut targets: Vec<&str> = Vec::new();
        let mut rtargets: Vec<&str> = Vec::new();
        for f in &files {
            targets.push(&f.target);
            rtargets.push(&f.registry_target);
            if let Some(vs) = &f.variants {
                let formats: Vec<&str> = vs.iter().map(|v| v.format.as_str()).collect();
                if has_dup(&formats) {
                    c.custom(&fp, "receipt file variant formats must be unique");
                }
                targets.extend(vs.iter().map(|v| v.target.as_str()));
                rtargets.extend(vs.iter().map(|v| v.registry_target.as_str()));
            }
        }
        for (label, vals) in [("id", &ids), ("registryPath", &paths), ("target", &targets), ("registryTarget", &rtargets)] {
            if has_dup(vals) {
                c.custom(&fp, &format!("receipt file {label} values must be unique"));
            }
        }
    }
    if !c.issues.is_empty() {
        return Err(issues_message(c.issues));
    }
    Ok(Receipt { schema_version: version, item, source_version, files })
}

/// `parseRegistryUpgradeItem(input)`
pub fn parse_upgrade_item(v: &Value) -> Result<UpgradeItem, String> {
    let mut c = Ctx { issues: Vec::new(), cont: true };
    let mut out = UpgradeItem { name: String::new(), ty: String::new(), files: Vec::new() };
    let Some(m) = object(&mut c, Some(v), &[]) else { return Err(issues_message(c.issues)) };
    out.name = kebab_field(&mut c, m.get("name"), &[P::K("name")]);
    let types = ["registry:block", "registry:page"];
    match m.get("type") {
        Some(Value::String(t)) if types.contains(&t.as_str()) => out.ty = t.clone(),
        _ => {
            let msg = format!("Invalid option: expected one of {}", quote_list(&types, "|"));
            c.push(vec![("code", s("invalid_value")), ("values", Value::Array(types.iter().map(|k| s(k)).collect()))], &[P::K("type")], msg, false);
        }
    }
    let fp = [P::K("files")];
    if let Some(a) = array(&mut c, m.get("files"), &fp) {
        for (i, x) in a.iter().enumerate() {
            let p = [P::K("files"), P::I(i)];
            let Some(fm) = object(&mut c, Some(x), &p) else { continue };
            let path = file_path_field(&mut c, fm.get("path"), &with(&p, P::K("path")));
            let tp = with(&p, P::K("type"));
            let ty = match c.string(fm.get("type"), &tp) {
                Some(t) => {
                    if t.is_empty() {
                        c.too_small("string", &tp);
                    }
                    t.to_string()
                }
                None => String::new(),
            };
            let target = match fm.get("target") {
                None => None,
                Some(t) => Some(file_path_field(&mut c, Some(t), &with(&p, P::K("target")))),
            };
            let content = plain_string(&mut c, fm.get("content"), &with(&p, P::K("content")));
            out.files.push(UpgradeFile { path, ty, target, content });
        }
        if a.is_empty() {
            c.too_small("array", &fp);
        }
    }
    if !c.issues.is_empty() {
        return Err(issues_message(c.issues));
    }
    Ok(out)
}

/// `JSON.parse(text)`: the value, or V8's error message.
pub fn json_parse(text: &str) -> Result<Value, String> {
    match serde_json::from_str::<Value>(text) {
        Ok(v) => Ok(v),
        Err(_) => Err(crate::commands::doctor::jsonerr::json_parse_error(text).unwrap_or_else(|| "Unexpected end of JSON input".into())),
    }
}
