//! TEMP: a minimal Commander-style parse for the shell's provisional
//! dispatch, which passes argv through unparsed. Unused once the shell's
//! parser fills `Invocation::args` and `opts`.

use crate::cli::command::{Arg, Invocation, OptValue};

pub enum Kind {
    Bool,
    Value,
    Variadic,
}

pub struct OptSpec {
    pub long: &'static str,
    pub short: Option<&'static str>,
    pub key: &'static str,
    pub kind: Kind,
}

pub fn normalize(inv: &Invocation, specs: &[OptSpec], positional: usize) -> Invocation {
    if !inv.args.is_empty() || !inv.opts.is_empty() || inv.extra_args.is_empty() {
        return inv.clone();
    }
    let mut out = inv.clone();
    out.extra_args.clear();
    let mut pos: Vec<String> = Vec::new();
    let argv = inv.extra_args.clone();
    let mut i = 0;
    while i < argv.len() {
        let a = &argv[i];
        i += 1;
        if a == "--json" || a == "--dense" || a == "--zh" {
            continue;
        }
        let (name, inline) = match a.split_once('=') {
            Some((n, v)) if n.starts_with("--") => (n.to_string(), Some(v.to_string())),
            _ => (a.clone(), None),
        };
        let spec = specs.iter().find(|s| s.long == name || s.short == Some(name.as_str()));
        match spec {
            Some(s) => match s.kind {
                Kind::Bool => {
                    out.opts.insert(s.key.into(), OptValue::Bool(true));
                }
                Kind::Value => {
                    let v = inline.or_else(|| {
                        i += 1;
                        argv.get(i - 1).cloned()
                    });
                    if let Some(v) = v {
                        out.opts.insert(s.key.into(), OptValue::Str(v));
                    }
                }
                Kind::Variadic => {
                    let mut vals: Vec<String> = match out.opts.get(s.key) {
                        Some(OptValue::List(v)) => v.clone(),
                        _ => Vec::new(),
                    };
                    if let Some(v) = inline {
                        vals.push(v);
                    }
                    while i < argv.len() && !argv[i].starts_with('-') {
                        vals.push(argv[i].clone());
                        i += 1;
                    }
                    out.opts.insert(s.key.into(), OptValue::List(vals));
                }
            },
            None => pos.push(a.clone()),
        }
    }
    for k in 0..positional {
        out.args.push(match pos.get(k) {
            Some(v) => Arg::One(v.clone()),
            None => Arg::Missing,
        });
    }
    out
}
