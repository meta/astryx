//! A sampling profiler for engine work (ignored tests; run by hand).
//! SIGPROF samples the instruction pointer; symbols resolve at the end.

use std::sync::atomic::{AtomicUsize, Ordering};

const MAX: usize = 1 << 20;
static SAMPLES: [AtomicUsize; MAX] = [const { AtomicUsize::new(0) }; MAX];
static COUNT: AtomicUsize = AtomicUsize::new(0);

extern "C" fn on_prof(_: libc::c_int, _: *mut libc::siginfo_t, ctx: *mut libc::c_void) {
    unsafe {
        let uc = ctx as *const libc::ucontext_t;
        let ip = (*uc).uc_mcontext.gregs[libc::REG_RIP as usize] as usize;
        let i = COUNT.fetch_add(1, Ordering::Relaxed);
        if i < MAX {
            SAMPLES[i].store(ip, Ordering::Relaxed);
        }
    }
}

pub fn profile<R>(f: impl FnOnce() -> R) -> R {
    unsafe {
        let mut sa: libc::sigaction = std::mem::zeroed();
        sa.sa_sigaction = on_prof as usize;
        sa.sa_flags = libc::SA_SIGINFO | libc::SA_RESTART;
        libc::sigaction(libc::SIGPROF, &sa, std::ptr::null_mut());
        let tv = libc::itimerval {
            it_interval: libc::timeval { tv_sec: 0, tv_usec: 1000 },
            it_value: libc::timeval { tv_sec: 0, tv_usec: 1000 },
        };
        libc::setitimer(libc::ITIMER_PROF, &tv, std::ptr::null_mut());
    }
    let r = f();
    unsafe {
        let zero: libc::itimerval = std::mem::zeroed();
        libc::setitimer(libc::ITIMER_PROF, &zero, std::ptr::null_mut());
    }
    let n = COUNT.load(Ordering::Relaxed).min(MAX);
    let mut by_sym: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut cache: std::collections::HashMap<usize, String> = std::collections::HashMap::new();
    for s in SAMPLES.iter().take(n) {
        let ip = s.load(Ordering::Relaxed);
        let name = cache.entry(ip).or_insert_with(|| {
            let mut name = format!("{ip:#x}");
            backtrace::resolve(ip as *mut _, |sym| {
                if let Some(n) = sym.name() {
                    let full = format!("{n:#}");
                    let file = sym.filename().map(|f| f.display().to_string()).unwrap_or_default();
                    let short = file.rsplit("/src/").next().unwrap_or("").to_string();
                    let krate = file.split('/').find(|p| p.starts_with("boa_") || p.starts_with("oxc")).unwrap_or("").to_string();
                    name = format!("{full} [{krate}:{short}]");
                }
            });
            name
        });
        *by_sym.entry(name.clone()).or_default() += 1;
    }
    let mut v: Vec<_> = by_sym.into_iter().collect();
    v.sort_by(|a, b| b.1.cmp(&a.1));
    eprintln!("{n} samples");
    for (name, c) in v.iter().take(45) {
        eprintln!("{:5.1}% {c:6} {}", *c as f64 * 100.0 / n as f64, name.chars().take(170).collect::<String>());
    }
    r
}

#[test]
#[ignore]
fn profile_parse() {
    let p = std::env::var("JS_PROBE").unwrap();
    let text = std::fs::read_to_string(&p).unwrap();
    let wrapped = format!("(function (exports, require, module, __filename, __dirname) {{{text}\n}})");
    let mut ctx = boa_engine::Context::default();
    if std::env::var_os("JS_NO_OPT").is_some() {
        ctx.set_optimizer_options(boa_engine::optimizer::OptimizerOptions::empty());
    }
    let stage = std::env::var("JS_STAGE").unwrap_or_else(|_| "parse".into());
    if stage == "parse" {
        profile(|| boa_engine::Script::parse(boa_engine::Source::from_bytes(wrapped.as_str()), None, &mut ctx).unwrap());
    } else {
        let s = boa_engine::Script::parse(boa_engine::Source::from_bytes(wrapped.as_str()), None, &mut ctx).unwrap();
        if stage == "compile" {
            profile(|| s.codeblock(&mut ctx).unwrap());
        } else {
            let _ = s.codeblock(&mut ctx).unwrap();
            profile(|| s.evaluate(&mut ctx).unwrap());
        }
    }
}

#[test]
#[ignore]
fn profile_call() {
    let p = std::env::var("JS_CALL").unwrap();
    let ex = std::env::var("JS_EXPORT").unwrap_or_else(|_| "run".into());
    let r = profile(|| super::call_export(std::path::Path::new(&p), &[ex.as_str()], &[], &super::CallOptions::default()));
    eprintln!("{:?}", r.map(|r| r.value.to_string().chars().take(200).collect::<String>()));
}

