//! `astryx theme template [path]`: write the annotated theme template.

use crate::cli::command::{CmdResult, Invocation, Out};
use crate::cli::format::{code, text};
use crate::commands::template::fsutil;
use crate::commands::template::ApiError;
use crate::json::{Map, Value};

pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let cwd = fsutil::path_str(&inv.cwd);
    let target = inv.arg(0).unwrap_or("theme.template.ts").to_string();
    let overwrite = inv.flag("overwrite");
    let res = match write(&inv.cli_root, &cwd, &target, overwrite) {
        Ok(r) => r,
        Err(e) => return super::fail(out, e),
    };
    let (path, written) = res;
    if inv.json() {
        let mut d = Map::new();
        d.insert("path".into(), Value::String(path.clone()));
        d.insert("written".into(), Value::Bool(written));
        d.insert("reason".into(), if written { Value::Null } else { Value::String("exists".into()) });
        out.json_out("theme.template", None, Value::Object(d), None);
        return Ok(());
    }
    if !written {
        out.emit(&[
            text(&format!("[skip] {path} already exists — left as is.")),
            text("Pass --overwrite to replace it with a fresh copy."),
        ]);
        return Ok(());
    }
    let inv_s = crate::cli::env::cli_invocation(&inv.cwd);
    out.emit(&[
        text(&format!("[ok] Wrote {path}")),
        text("It documents every defineTheme field, the token families, and the component override syntax. Copy what you need into your own theme file, then delete it."),
        code(&format!("{inv_s} theme build {path}")),
    ]);
    Ok(())
}

/// `themeTemplate`: returns (relative path, written).
pub fn write(cli_root: &std::path::Path, cwd: &str, target: &str, overwrite: bool) -> Result<(String, bool), ApiError> {
    let resolved = fsutil::assert_within(target, cwd, "theme template path").map_err(ApiError::from_path)?;
    let rel = {
        let r = fsutil::relative(cwd, &resolved);
        if r.is_empty() { target.to_string() } else { r }
    };
    if std::path::Path::new(&resolved).exists() && !overwrite {
        return Ok((rel, false));
    }
    let src = cli_root.join("assets").join("theme.template.ts");
    let contents = fsutil::strip_copyright_header(&std::fs::read_to_string(src).unwrap_or_default());
    let res = std::fs::create_dir_all(fsutil::dirname(&resolved)).and_then(|_| std::fs::write(&resolved, contents));
    if let Err(e) = res {
        return Err(ApiError::new(
            &format!("Failed to write the theme template to {rel}: {}", crate::commands::template::node_err(&e, "open", &resolved)),
            "ERR_WRITE_FAILED",
        ));
    }
    Ok((rel, true))
}
