//! File access for the module loader and the `node:fs` shim. Paths through
//! Yarn Plug'n'Play's zipped packages or `__virtual__` folders read through
//! [`crate::discovery::zipfs`], as PnP's patched `fs` shows them; every
//! other path reads the disk.

use std::io;
use std::path::{Path, PathBuf};

use crate::discovery::zipfs;

fn special(p: &Path) -> Option<&str> {
    let s = p.to_str()?;
    zipfs::is_special(s).then_some(s)
}

/// What a path is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    File,
    Dir,
}

/// What a path is (following links); None when it does not exist.
pub fn kind(p: &Path) -> Option<Kind> {
    if let Some(s) = special(p) {
        if let Some(k) = zipfs::stat(s) {
            return Some(match k {
                zipfs::Kind::File => Kind::File,
                zipfs::Kind::Dir => Kind::Dir,
            });
        }
        let real = zipfs::resolve_virtual(s);
        if real != s {
            return kind(Path::new(&real));
        }
    }
    let m = std::fs::metadata(p).ok()?;
    if m.is_dir() {
        Some(Kind::Dir)
    } else {
        Some(Kind::File)
    }
}

pub fn is_file(p: &Path) -> bool {
    kind(p) == Some(Kind::File)
}

pub fn is_dir(p: &Path) -> bool {
    kind(p) == Some(Kind::Dir)
}

/// A file's bytes.
pub fn read(p: &Path) -> io::Result<Vec<u8>> {
    if let Some(s) = special(p) {
        if let Some(b) = zipfs::read(s) {
            return Ok(b);
        }
        let real = zipfs::resolve_virtual(s);
        if real != s {
            return read(Path::new(&real));
        }
        if zipfs::split(s).is_some() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("no such file or directory, open '{s}'"),
            ));
        }
    }
    std::fs::read(p)
}

/// A file's text (UTF-8).
pub fn read_to_string(p: &Path) -> io::Result<String> {
    let bytes = read(p)?;
    String::from_utf8(bytes).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

/// A folder's entries: (name, is file, is folder, is link).
pub fn read_dir(p: &Path) -> io::Result<Vec<(String, bool, bool, bool)>> {
    if let Some(s) = special(p) {
        if let Some(entries) = zipfs::read_dir(s) {
            return Ok(entries
                .into_iter()
                .map(|(n, k)| (n, k == zipfs::Kind::File, k == zipfs::Kind::Dir, false))
                .collect());
        }
        let real = zipfs::resolve_virtual(s);
        if real != s {
            return read_dir(Path::new(&real));
        }
    }
    Ok(std::fs::read_dir(p)?
        .filter_map(|e| e.ok())
        .map(|e| {
            let ft = e.file_type().ok();
            (
                e.file_name().to_string_lossy().into_owned(),
                ft.map(|f| f.is_file()).unwrap_or(false),
                ft.map(|f| f.is_dir()).unwrap_or(false),
                ft.map(|f| f.is_symlink()).unwrap_or(false),
            )
        })
        .collect())
}

/// The real path, as Node's `realpath` gives it. A zipped or virtual path
/// is its own real path (PnP keeps it as written).
pub fn canonicalize(p: &Path) -> io::Result<PathBuf> {
    if special(p).is_some() {
        return match kind(p) {
            Some(_) => Ok(p.to_path_buf()),
            None => Err(io::Error::new(io::ErrorKind::NotFound, "no such file or directory")),
        };
    }
    std::fs::canonicalize(p)
}
