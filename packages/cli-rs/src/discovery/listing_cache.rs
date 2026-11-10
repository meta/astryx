//! Port of `foundation/fs/listing-cache.mjs` (the in-operation part): one
//! directory listing and one existence probe per path for the duration of a
//! read-only operation. Inside the operation the tree does not change, so
//! each answer equals a fresh read. Outside `with_listing_cache` every helper
//! reads the disk directly.
//!
//! The scope is per thread. A thread an operation spawns joins it with
//! [`Scope::enter`] on a [`scope`] handle taken by the spawning thread.

use std::cell::Cell;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

/// A directory entry's type as `readdir` reports it (no link following).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Kind {
    pub is_dir: bool,
    pub is_file: bool,
    pub is_symlink: bool,
}

/// One raw listing entry; `kind` is `None` when the type could not be read.
#[derive(Debug, Clone)]
pub struct RawEntry {
    pub name: String,
    pub kind: Option<Kind>,
}

/// A folder's listing with an index by name (`findEntry`).
struct Listing {
    entries: Arc<Vec<RawEntry>>,
    by_name: HashMap<String, Option<Kind>>,
}

impl Listing {
    fn new(entries: Vec<RawEntry>) -> Listing {
        let by_name = entries.iter().map(|e| (e.name.clone(), e.kind)).collect();
        Listing { entries: Arc::new(entries), by_name }
    }
}

/// Keys are the path's bytes: hashing them is much cheaper than `Path`'s
/// component-wise hash.
#[derive(Default)]
struct Cache {
    listings: HashMap<Vec<u8>, Option<Arc<Listing>>>,
    exists: HashMap<Vec<u8>, bool>,
    memos: HashMap<String, Arc<dyn std::any::Any + Send + Sync>>,
}

fn key(p: &Path) -> Vec<u8> {
    use std::os::unix::ffi::OsStrExt;
    p.as_os_str().as_bytes().to_vec()
}

fn listing(shared: &Shared, dir: &Path) -> Option<Arc<Listing>> {
    let k = key(dir);
    if let Some(hit) = shared.lock().unwrap().listings.get(&k) {
        return hit.clone();
    }
    let v = read_raw(dir).map(|e| Arc::new(Listing::new(e)));
    shared.lock().unwrap().listings.insert(k, v.clone());
    v
}

type Shared = Arc<Mutex<Cache>>;

thread_local! {
    static CURRENT: std::cell::RefCell<Option<Shared>> = const { std::cell::RefCell::new(None) };
    static DEPTH: Cell<usize> = const { Cell::new(0) };
}

/// Run `f` with a listing cache. A nested call shares the outer cache. Only
/// wrap operations that do not change the files they list.
pub fn with_listing_cache<T>(f: impl FnOnce() -> T) -> T {
    let outer = DEPTH.with(|d| d.get());
    if outer == 0 {
        CURRENT.with(|c| *c.borrow_mut() = Some(Arc::new(Mutex::new(Cache::default()))));
    }
    DEPTH.with(|d| d.set(outer + 1));
    struct Reset(usize);
    impl Drop for Reset {
        fn drop(&mut self) {
            DEPTH.with(|d| d.set(self.0));
            if self.0 == 0 {
                CURRENT.with(|c| *c.borrow_mut() = None);
            }
        }
    }
    let _reset = Reset(outer);
    f()
}

/// The calling thread's cache, to hand to a thread it spawns.
#[derive(Clone)]
pub struct Scope(Option<Shared>);

pub fn scope() -> Scope {
    Scope(CURRENT.with(|c| c.borrow().clone()))
}

impl Scope {
    /// Run `f` on this thread inside the captured operation (if any).
    pub fn enter<T>(&self, f: impl FnOnce() -> T) -> T {
        let Some(shared) = &self.0 else { return f() };
        if DEPTH.with(|d| d.get()) > 0 {
            return f();
        }
        CURRENT.with(|c| *c.borrow_mut() = Some(shared.clone()));
        DEPTH.with(|d| d.set(1));
        struct Leave;
        impl Drop for Leave {
            fn drop(&mut self) {
                DEPTH.with(|d| d.set(0));
                CURRENT.with(|c| *c.borrow_mut() = None);
            }
        }
        let _leave = Leave;
        f()
    }
}

fn current() -> Option<Shared> {
    CURRENT.with(|c| c.borrow().clone())
}

/// Whether an operation's listing cache is active on this thread.
pub fn active() -> bool {
    DEPTH.with(|d| d.get()) > 0
}

fn read_raw(dir: &Path) -> Option<Vec<RawEntry>> {
    let rd = std::fs::read_dir(dir).ok()?;
    Some(
        rd.flatten()
            .map(|e| RawEntry {
                name: e.file_name().to_string_lossy().into_owned(),
                kind: e.file_type().ok().map(|t| Kind { is_dir: t.is_dir(), is_file: t.is_file(), is_symlink: t.is_symlink() }),
            })
            .collect(),
    )
}

/// `fs.readdirSync(dir, {withFileTypes: true})` in the order the OS returns
/// them, read once per operation. `None` when the folder cannot be read.
pub fn read_dir(dir: &Path) -> Option<Arc<Vec<RawEntry>>> {
    let Some(shared) = current() else { return read_raw(dir).map(Arc::new) };
    listing(&shared, dir).map(|l| l.entries.clone())
}

/// `fs.existsSync(target)` (follows links), probed once per operation.
pub fn exists(target: &Path) -> bool {
    let Some(shared) = current() else { return target.exists() };
    let k = key(target);
    if let Some(&hit) = shared.lock().unwrap().exists.get(&k) {
        return hit;
    }
    let v = target.exists();
    shared.lock().unwrap().exists.insert(k, v);
    v
}

/// `oncePerListing(key, compute)`: `compute()` once per operation, under
/// `key`; outside an operation it computes each time.
pub fn once_per_listing<T: Send + Sync + 'static>(key: &str, compute: impl FnOnce() -> T) -> Arc<T> {
    let Some(shared) = current() else { return Arc::new(compute()) };
    if let Some(hit) = shared.lock().unwrap().memos.get(key) {
        if let Ok(v) = hit.clone().downcast::<T>() {
            return v;
        }
    }
    let v = Arc::new(compute());
    shared.lock().unwrap().memos.insert(key.to_string(), v.clone());
    v
}

/// `findEntry` down each segment of `rel` below `root`: the last segment's
/// entry kind (`Some(None)` when its type could not be read), or `None` when
/// a listing lacks a segment or cannot be read. A `..` segment never matches.
pub fn find_entry_path(root: &Path, rel: &Path) -> Option<Option<Kind>> {
    let shared = current();
    let mut dir = root.to_path_buf();
    let mut kind = None;
    for seg in rel.components() {
        let seg = seg.as_os_str().to_string_lossy();
        kind = Some(match &shared {
            Some(shared) => *listing(shared, &dir)?.by_name.get(seg.as_ref())?,
            None => read_raw(&dir)?.into_iter().find(|e| e.name == seg)?.kind,
        });
        dir.push(seg.as_ref());
    }
    kind
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caches_inside_the_scope_only() {
        let dir = std::env::temp_dir().join(format!("listing-cache-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a"), "").unwrap();
        with_listing_cache(|| {
            assert_eq!(read_dir(&dir).unwrap().len(), 1);
            assert!(!exists(&dir.join("b")));
            std::fs::write(dir.join("b"), "").unwrap();
            // Inside the operation the first answers hold.
            assert_eq!(read_dir(&dir).unwrap().len(), 1);
            assert!(!exists(&dir.join("b")));
            let s = scope();
            std::thread::scope(|t| {
                t.spawn(|| s.enter(|| assert_eq!(read_dir(&dir).unwrap().len(), 1)));
            });
        });
        assert!(!active());
        assert_eq!(read_dir(&dir).unwrap().len(), 2);
        assert!(exists(&dir.join("b")));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
