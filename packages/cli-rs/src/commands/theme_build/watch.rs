//! `theme build --watch` (theme.mjs `runThemeBuildWatch`): build each file,
//! then rebuild the one that changed, one at a time, until interrupted.
//! Each build runs this binary again as a child, as the JS CLI re-runs
//! itself, so a failing build ends only that child.

use super::nodepath;
use std::io::Write;
use std::path::Path;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicI32, Ordering};
use std::time::{Duration, Instant, SystemTime};

static SIGNAL: AtomicI32 = AtomicI32::new(0);

extern "C" fn on_signal(sig: libc::c_int) {
    SIGNAL.store(sig, Ordering::SeqCst);
}

fn install_handlers() {
    unsafe {
        libc::signal(libc::SIGINT, on_signal as extern "C" fn(libc::c_int) as libc::sighandler_t);
        libc::signal(libc::SIGTERM, on_signal as extern "C" fn(libc::c_int) as libc::sighandler_t);
    }
}

fn say(s: &str) {
    let mut o = std::io::stdout().lock();
    let _ = writeln!(o, "{}", crate::cli::format::to_ascii(s));
    let _ = o.flush();
}

pub struct WatchOptions {
    pub out: Option<String>,
    pub icons_specifier: Option<String>,
    pub detail: Option<String>,
}

fn spawn(file: &str, opts: &WatchOptions) -> Option<Child> {
    let exe = std::env::current_exe().ok()?;
    let mut args: Vec<String> = Vec::new();
    if let Some(d) = &opts.detail {
        args.push("--detail".into());
        args.push(d.clone());
    }
    args.extend(["theme".to_string(), "build".to_string(), file.to_string()]);
    if let Some(o) = &opts.out {
        args.push("--out".into());
        args.push(o.clone());
    }
    if let Some(i) = &opts.icons_specifier {
        args.push("--icons-specifier".into());
        args.push(i.clone());
    }
    Command::new(exe).args(args).spawn().ok()
}

/// What a change looks like from outside: identity, size and mtime of the
/// file, read through its directory (an editor's rename-save replaces it).
fn stamp(path: &str) -> Option<(u64, u64, SystemTime)> {
    use std::os::unix::fs::MetadataExt;
    let m = std::fs::metadata(path).ok()?;
    Some((m.ino(), m.len(), m.modified().ok()?))
}

pub fn run(cwd: &str, files: &[String], opts: &WatchOptions) {
    let entries: Vec<(String, String)> = files.iter().map(|f| (f.clone(), nodepath::resolve(cwd, &[f]))).collect();
    let rel = |p: &str| nodepath::relative(cwd, cwd, p);
    let watching = format!(
        "\nWatching {} for changes \u{2014} press Ctrl-C to stop.",
        entries.iter().map(|e| rel(&e.1)).collect::<Vec<_>>().join(", ")
    );
    install_handlers();
    for (file, _) in &entries {
        if let Some(mut c) = spawn(file, opts) {
            let _ = c.wait();
        }
    }
    let mut stamps: Vec<Option<(u64, u64, SystemTime)>> = entries.iter().map(|e| stamp(&e.1)).collect();
    let mut debounce: Vec<Option<Instant>> = vec![None; entries.len()];
    let mut queued: Vec<usize> = Vec::new();
    let mut child: Option<Child> = None;
    say(&watching);
    loop {
        let sig = SIGNAL.load(Ordering::SeqCst);
        if sig != 0 {
            if let Some(c) = child.as_mut() {
                unsafe {
                    libc::kill(c.id() as libc::pid_t, sig);
                }
                let _ = c.wait();
            }
            say("\nStopped watching.");
            return;
        }
        for (i, e) in entries.iter().enumerate() {
            let s = stamp(&e.1);
            if s != stamps[i] {
                stamps[i] = s;
                debounce[i] = Some(Instant::now() + Duration::from_millis(100));
            }
        }
        let now = Instant::now();
        for i in 0..entries.len() {
            if let Some(at) = debounce[i] {
                if now >= at {
                    debounce[i] = None;
                    if child.is_some() || !queued.is_empty() {
                        if !queued.contains(&i) {
                            queued.push(i);
                        }
                    } else {
                        queued.push(i);
                    }
                }
            }
        }
        if let Some(c) = child.as_mut() {
            if let Ok(Some(_)) = c.try_wait() {
                child = None;
                say(&watching);
            }
        }
        if child.is_none() && !queued.is_empty() {
            let i = queued.remove(0);
            say(&format!("\nChange detected \u{2014} rebuilding {}...", rel(&entries[i].1)));
            child = spawn(&entries[i].0, opts);
            if child.is_none() {
                say(&watching);
            }
        }
        std::thread::sleep(Duration::from_millis(20));
        let _ = Path::new(cwd);
    }
}
