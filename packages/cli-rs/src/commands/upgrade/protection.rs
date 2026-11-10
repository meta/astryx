//! File protection (`foundation/fs/file-protection.mjs`): which files a
//! codemod must not write.
//!
//! TEMP: structural reasons only (outside the root, dependency and VCS
//! folders, symbolic links, generated headers). Ignore-file and
//! `.gitattributes` rules are not read yet.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq)]
pub struct Protection {
    /// Path relative to the root, with `/`.
    pub file: String,
    pub reason: String,
    pub declaration: String,
    pub command: Option<String>,
}

pub struct Resolver {
    pub root: PathBuf,
    pub real_root: PathBuf,
    /// Staged contents (`None` = deleted).
    pub overrides: HashMap<PathBuf, Option<String>>,
}

#[derive(Debug, Clone)]
pub struct ProtectionSourceError {
    pub message: String,
}

fn slash(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

pub fn relative(root: &Path, file: &Path) -> String {
    crate::commands::upgrade::fsutil::relative(root, file)
}

impl Resolver {
    pub fn new(root: &Path, overrides: HashMap<PathBuf, Option<String>>) -> Result<Resolver, ProtectionSourceError> {
        let root = crate::commands::upgrade::fsutil::resolve(root);
        let real_root = std::fs::canonicalize(&root).map_err(|e| ProtectionSourceError { message: format!("Could not read file-protection source .: {}", crate::commands::upgrade::fsutil::io_message(&e, "realpath", &root)) })?;
        Ok(Resolver { root, real_root, overrides })
    }

    pub fn contents_of(&self, file: &Path) -> Option<String> {
        if let Some(o) = self.overrides.get(file) {
            return o.clone();
        }
        std::fs::read_to_string(file).ok()
    }

    pub fn classify(&self, file: &Path) -> Vec<Protection> {
        let abs = crate::commands::upgrade::fsutil::resolve(file);
        let rel = relative(&self.root, &abs);
        let mut out = Vec::new();
        if rel == ".." || rel.starts_with("../") || Path::new(&rel).is_absolute() {
            out.push(Protection { file: slash(&abs), reason: "outside-root".into(), declaration: "outside the project root".into(), command: None });
            return out;
        }
        let parts: Vec<&str> = rel.split('/').collect();
        for (i, part) in parts.iter().enumerate() {
            if ["node_modules", "bower_components", "jspm_packages"].contains(part) {
                out.push(Protection { file: rel.clone(), reason: "dependency".into(), declaration: format!("dependency folder {}", parts[..=i].join("/")), command: None });
                return out;
            }
            if [".git", ".hg", ".sl"].contains(part) {
                out.push(Protection { file: rel.clone(), reason: "vcs".into(), declaration: format!("version-control folder {}", parts[..=i].join("/")), command: None });
                return out;
            }
        }
        if let Ok(md) = std::fs::symlink_metadata(&abs) {
            if md.file_type().is_symlink() {
                out.push(Protection { file: rel.clone(), reason: "symlink".into(), declaration: format!("symbolic link at {}", rel), command: None });
            }
        }
        if let Some(contents) = self.contents_of(&abs) {
            if let Some(marker) = generated_marker(&contents, &abs) {
                out.push(Protection { file: rel.clone(), reason: "generated".into(), declaration: marker, command: generated_command(&contents) });
            }
        }
        out
    }
}

fn generated_marker(contents: &str, file: &Path) -> Option<String> {
    use crate::commands::upgrade::jsre;
    let text: String = contents.chars().take(65_536).collect();
    let ext = file.extension().map(|e| format!(".{}", e.to_string_lossy().to_lowercase())).unwrap_or_default();
    let hash = text.starts_with("#!") || [".py", ".pyi", ".rb", ".sh", ".bash", ".zsh", ".yaml", ".yml", ".toml"].contains(&ext.as_str());
    let dash = [".sql", ".lua"].contains(&ext.as_str());
    let mut cursor = 0usize;
    if text.starts_with("#!") {
        cursor = text.find('\n').map(|e| e + 1).unwrap_or(text.len());
    }
    let mut comments: Vec<&str> = Vec::new();
    while cursor < text.len() {
        let rest = &text[cursor..];
        let ws = rest.len() - rest.trim_start().len();
        cursor += ws;
        let rest = &text[cursor..];
        if rest.starts_with("//") || (hash && rest.starts_with('#')) || (dash && rest.starts_with("--")) {
            let end = rest.find('\n');
            comments.push(&rest[..end.unwrap_or(rest.len())]);
            cursor = end.map(|e| cursor + e + 1).unwrap_or(text.len());
            continue;
        }
        let block = if rest.starts_with("/*") { Some(("/*", "*/")) } else if rest.starts_with("<!--") { Some(("<!--", "-->")) } else { None };
        if let Some((open, close)) = block {
            match rest[open.len()..].find(close) {
                Some(e) => {
                    let end = open.len() + e + close.len();
                    comments.push(&rest[..end]);
                    cursor += end;
                    continue;
                }
                None => break,
            }
        }
        break;
    }
    let leading = comments.join("\n");
    if jsre::test(r"(?:^|[^\w-])@partially-generated(?:[^\w-]|$)", "i", &leading) {
        return Some("@partially-generated in the leading comment block".into());
    }
    if jsre::test(r"(?:^|[^\w-])@generated(?:[^\w-]|$)", "i", &leading) {
        return Some("@generated in the leading comment block".into());
    }
    if jsre::test(r"Code generated\b[^\r\n]*\bDO NOT EDIT\.", "", &leading) {
        return Some("Code generated ... DO NOT EDIT. in the leading comment block".into());
    }
    None
}

fn generated_command(contents: &str) -> Option<String> {
    let text: String = contents.chars().take(65_536).collect();
    let c = crate::commands::upgrade::jsre::captures(r"^\s*(?:\/\/|\*|#|<!--)?\s*Command:\s*(.+?)\s*(?:\*\/|-->)?\s*$", "m", &text)?;
    c.get(1).cloned().flatten().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}
