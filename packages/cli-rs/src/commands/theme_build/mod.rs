//! `astryx theme build` and `astryx theme palette generate`
//! (`clients/cli/commands/theme.mjs`, `api/theme/build/`,
//! `api/theme/palette/generate/`).

pub mod jsonparse;
pub mod nodepath;
pub mod build_impl;
pub mod coredocs;
pub mod fmt;
pub mod fonts;
pub mod module;
pub mod validate;
pub mod watch;
pub mod palette;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out};
use crate::cli::format::{code, section, text};

/// `theme palette generate <config>`.
pub fn palette_generate(inv: &Invocation, out: &mut Out) -> CmdResult {
    let config = inv.arg(0).unwrap_or_default().to_string();
    let opts = palette::generate::GenerateOptions {
        out: inv.opt_str("out"),
        preview: inv.opt_str("preview"),
        overwrite: inv.flag("overwrite"),
    };
    let cwd = inv.cwd.to_string_lossy().into_owned();
    let result = match palette::generate::theme_palette_generate(&config, &opts, &cwd) {
        Ok(r) => r,
        Err(e) => return out.cli_error(&e.message, ErrorOpts::code(e.code)),
    };
    if inv.json() {
        out.json_out("theme.palette.generate", None, result.data, None);
        return Ok(());
    }
    if result.output.is_none() && result.preview.is_none() {
        let subtitle = format!("{} families, {} stops, {}", result.family_count, result.stop_count, result.modes.join(", "));
        let body = palette::generate::serialize_palette_candidate(&result.candidate);
        out.emit(&[section("Palette candidate", Some(&subtitle)), code(body.trim_end())]);
        return Ok(());
    }
    if !result.written {
        out.emit(&[
            text("[skip] One or more requested palette outputs already exist — left as is."),
            text("Pass --overwrite to replace both generated candidate files."),
        ]);
        return Ok(());
    }
    let mut blocks = Vec::new();
    for p in [&result.output, &result.receipt, &result.preview].into_iter().flatten() {
        blocks.push(text(&format!("[ok] Wrote {p}")));
    }
    blocks.push(text("Review and edit the candidate before adopting it as theme-owned palette data."));
    out.emit(&blocks);
    Ok(())
}

/// `theme build <files...>`.
pub fn build(inv: &Invocation, out: &mut Out) -> CmdResult {
    let files = inv.arg_list(0);
    let cwd = inv.cwd.to_string_lossy().into_owned();
    let json = inv.json();
    for file in &files {
        let file_path = nodepath::resolve(&cwd, &[file]);
        if std::path::Path::new(&file_path).exists() {
            continue;
        }
        let globby = file.chars().any(|c| matches!(c, '*' | '?' | '[' | ']' | '{' | '}'));
        let mut opts = ErrorOpts::code("ERR_FILE_NOT_FOUND");
        if globby {
            opts = opts.suggestions(vec![crate::cli::command::Suggestion::new(
                format!("astryx theme build {}", file.replace(['\'', '"'], "")),
                "globs are expanded by your shell; pass the pattern unquoted, or list the files",
            )]);
        }
        return out.cli_error(&format!("File not found: {file_path}"), opts);
    }
    let family = inv.flag("family");
    let family_key = inv.opt_str("familyKey");
    let out_path = inv.opt_str("out");
    let watch = inv.flag("watch");
    let check = inv.flag("check");
    let invalid = |out: &mut Out, m: &str| out.cli_error(m, ErrorOpts::code("ERR_THEME_INVALID"));
    if family != family_key.is_some() {
        return invalid(out, if family { "--family requires --family-key <key>" } else { "--family-key requires --family" });
    }
    if family && out_path.is_some() {
        return invalid(out, "--family cannot be combined with --out");
    }
    if family && watch {
        return invalid(out, "--family cannot be combined with --watch");
    }
    if check && watch {
        return invalid(out, "--check cannot be combined with --watch");
    }
    if out_path.is_some() && files.len() > 1 {
        return invalid(
            out,
            &format!(
                "--out takes a single output path and {} theme files were given. Build them without --out (each theme writes <name>.css next to its source), or run one invocation per theme.",
                files.len()
            ),
        );
    }
    if watch && json {
        return invalid(out, "--watch is not supported with --json");
    }
    if watch {
        let opts = watch::WatchOptions {
            out: out_path.map(String::from),
            icons_specifier: inv.opt_str("iconsSpecifier").map(String::from),
            detail: build_impl::detail_chosen(inv).then(|| inv.globals.detail.clone()),
        };
        watch::run(&cwd, &files, &opts);
        return Ok(());
    }
    build_impl::run(inv, out, &files)
}
