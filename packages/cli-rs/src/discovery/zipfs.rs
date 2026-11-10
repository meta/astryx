//! A read-only view of Yarn Plug'n'Play's zipped packages, as PnP's patched
//! `fs` shows them: a path through `<…>/<name>.zip/<inner>` reads inside the
//! archive (the archive itself reads as a folder), and a
//! `…/__virtual__/<hash>/<depth>/<rest>` path reads as the path it stands
//! for (`VirtualFS.resolveVirtual`). Discovery's file reads (`nodepath`) and
//! the JS module loader go through [`read`] / [`stat`] / [`read_dir`].
//!
//! The archive reader handles what Yarn writes: stored and deflated entries,
//! no zip64, no encryption.

use std::cell::RefCell;
use std::collections::HashMap;
use std::io::Read;
use std::sync::Arc;

/// What a path is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    File,
    Dir,
}

#[derive(Debug)]
struct Entry {
    method: u16,
    csize: u64,
    usize_: u64,
    local_offset: u64,
}

#[derive(Debug)]
struct Archive {
    bytes: Vec<u8>,
    files: HashMap<String, Entry>,
    /// Every folder (`""` is the root), with its children (name, kind).
    dirs: HashMap<String, Vec<(String, Kind)>>,
}

thread_local! {
    static ARCHIVES: RefCell<HashMap<String, Option<Arc<Archive>>>> = RefCell::new(HashMap::new());
}

/// `VirtualFS.resolveVirtual(p)`.
pub fn resolve_virtual(p: &str) -> String {
    let re = regress::Regex::new(r"^(\/(?:[^/]+\/)*?(?:\$\$virtual|__virtual__))((?:\/((?:[^/]+-)?[a-f0-9]+)(?:\/([^/]+))?)?((?:\/.*)?))$").unwrap();
    let Some(m) = re.find(p) else { return p.to_string() };
    let g = |i: usize| m.group(i).map(|r| &p[r]);
    let target = super::nodepath::dirname(g(1).unwrap_or(""));
    let (Some(_), Some(depth)) = (g(3), g(4)) else { return p.to_string() };
    let Ok(depth) = depth.parse::<usize>() else { return p.to_string() };
    let back = "../".repeat(depth);
    let sub = g(5).filter(|s| !s.is_empty()).unwrap_or(".");
    let joined = super::nodepath::normalize(&format!("{target}/{back}{}", sub.trim_start_matches('/')));
    resolve_virtual(&joined)
}

/// Whether a path names a virtual or zipped location.
pub fn is_special(p: &str) -> bool {
    p.contains("/__virtual__/") || p.contains("/$$virtual/") || p.contains(".zip")
}

/// `(archive file, path inside it)` for a path through a `.zip` file.
pub fn split(p: &str) -> Option<(String, String)> {
    let p = resolve_virtual(p);
    let mut from = 0;
    while let Some(i) = p[from..].find(".zip") {
        let end = from + i + 4;
        // The archive file itself reads as the file it is; a path into it reads
        // inside.
        let at_boundary = end < p.len() && p.as_bytes()[end] == b'/';
        if at_boundary {
            let file = &p[..end];
            if std::fs::metadata(file).map(|m| m.is_file()).unwrap_or(false) {
                let inner = p[end..].trim_start_matches('/').trim_end_matches('/').to_string();
                return Some((file.to_string(), inner));
            }
        }
        from = end;
    }
    None
}

fn u16_at(b: &[u8], i: usize) -> Option<u16> {
    Some(u16::from_le_bytes(b.get(i..i + 2)?.try_into().ok()?))
}

fn u32_at(b: &[u8], i: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(i..i + 4)?.try_into().ok()?))
}

fn parse(bytes: Vec<u8>) -> Option<Archive> {
    let min = bytes.len().saturating_sub(22 + 65535);
    let eocd = (min..=bytes.len().checked_sub(22)?).rev().find(|&i| u32_at(&bytes, i) == Some(0x0605_4b50))?;
    let count = u16_at(&bytes, eocd + 10)? as usize;
    let mut at = u32_at(&bytes, eocd + 16)? as usize;
    let mut files = HashMap::new();
    let mut dirs: HashMap<String, Vec<(String, Kind)>> = HashMap::new();
    dirs.insert(String::new(), Vec::new());
    let mut add_dir = |dirs: &mut HashMap<String, Vec<(String, Kind)>>, path: &str| {
        let mut cur = String::new();
        for seg in path.split('/').filter(|s| !s.is_empty()) {
            let next = if cur.is_empty() { seg.to_string() } else { format!("{cur}/{seg}") };
            if !dirs.contains_key(&next) {
                dirs.insert(next.clone(), Vec::new());
                dirs.get_mut(&cur).unwrap().push((seg.to_string(), Kind::Dir));
            }
            cur = next;
        }
    };
    for _ in 0..count {
        if u32_at(&bytes, at)? != 0x0201_4b50 {
            return None;
        }
        let method = u16_at(&bytes, at + 10)?;
        let csize = u32_at(&bytes, at + 20)? as u64;
        let usize_ = u32_at(&bytes, at + 24)? as u64;
        let n = u16_at(&bytes, at + 28)? as usize;
        let m = u16_at(&bytes, at + 30)? as usize;
        let k = u16_at(&bytes, at + 32)? as usize;
        let local = u32_at(&bytes, at + 42)? as u64;
        let name = String::from_utf8_lossy(bytes.get(at + 46..at + 46 + n)?).into_owned();
        at += 46 + n + m + k;
        if let Some(d) = name.strip_suffix('/') {
            add_dir(&mut dirs, d);
            continue;
        }
        let (parent, base) = match name.rfind('/') {
            Some(i) => (&name[..i], &name[i + 1..]),
            None => ("", name.as_str()),
        };
        add_dir(&mut dirs, parent);
        dirs.get_mut(parent).unwrap().push((base.to_string(), Kind::File));
        files.insert(name.clone(), Entry { method, csize, usize_, local_offset: local });
    }
    Some(Archive { bytes, files, dirs })
}

fn archive(file: &str) -> Option<Arc<Archive>> {
    if let Some(a) = ARCHIVES.with(|c| c.borrow().get(file).cloned()) {
        return a;
    }
    let a = std::fs::read(file).ok().and_then(parse).map(Arc::new);
    ARCHIVES.with(|c| c.borrow_mut().insert(file.to_string(), a.clone()));
    a
}

/// What a zipped or virtual path is; None when it is neither or is missing.
pub fn stat(p: &str) -> Option<Kind> {
    let (file, inner) = split(p)?;
    let a = archive(&file)?;
    if a.files.contains_key(&inner) {
        Some(Kind::File)
    } else if a.dirs.contains_key(&inner) {
        Some(Kind::Dir)
    } else {
        None
    }
}

/// A zipped file's bytes.
pub fn read(p: &str) -> Option<Vec<u8>> {
    let (file, inner) = split(p)?;
    let a = archive(&file)?;
    let e = a.files.get(&inner)?;
    let lo = e.local_offset as usize;
    let n = u16_at(&a.bytes, lo + 26)? as usize;
    let m = u16_at(&a.bytes, lo + 28)? as usize;
    let start = lo + 30 + n + m;
    let data = a.bytes.get(start..start + e.csize as usize)?;
    match e.method {
        0 => Some(data.to_vec()),
        8 => {
            let mut out = Vec::with_capacity(e.usize_ as usize);
            flate2::read::DeflateDecoder::new(data).read_to_end(&mut out).ok()?;
            Some(out)
        }
        _ => None,
    }
}

/// A zipped folder's entries (name, kind), in archive order.
pub fn read_dir(p: &str) -> Option<Vec<(String, Kind)>> {
    let (file, inner) = split(p)?;
    let a = archive(&file)?;
    a.dirs.get(&inner).cloned()
}
