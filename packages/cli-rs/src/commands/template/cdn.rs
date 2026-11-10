//! `template --cdn`: write the annotated no-build-step starter page.

use super::{fsutil, ApiError};

pub struct CdnResult {
    pub path: String,
    pub version: String,
    pub written: bool,
}

/// `getXdsVersion(findCoreDir(cwd))`: the found Core's version, else this CLI's.
pub fn xds_version(cwd: &std::path::Path) -> Result<String, ApiError> {
    let core = crate::discovery::paths::find_core_dir(&fsutil::path_str(cwd));
    let root = crate::cli::env::cli_root();
    crate::commands::init::agent_docs::get_xds_version(core.as_deref(), &root.to_string_lossy())
        .map_err(|m| ApiError::new(&m, "ERR_UNKNOWN"))
}

/// `templateCdn`.
pub fn write(cli_root: &std::path::Path, cwd: &std::path::Path, target: Option<&str>, overwrite: bool) -> Result<CdnResult, ApiError> {
    let target = target.unwrap_or("cdn.template.html");
    let cwd_s = fsutil::path_str(cwd);
    let resolved = fsutil::assert_within(target, &cwd_s, "cdn template path").map_err(ApiError::from_path)?;
    let rel = {
        let r = fsutil::relative(&cwd_s, &resolved);
        if r.is_empty() { target.to_string() } else { r }
    };
    let version = xds_version(cwd)?;
    if std::path::Path::new(&resolved).exists() && !overwrite {
        return Ok(CdnResult { path: rel, version, written: false });
    }
    let src = std::fs::read_to_string(cli_root.join("assets").join("cdn.template.html")).unwrap_or_default();
    let contents = fsutil::strip_copyright_header(&src).replace("__ASTRYX_VERSION__", &version);
    // The JS writes without a guard, so a failure reaches the command's catch
    // as the bare Node error.
    if let Err((_, m)) = super::mkdir_p(&fsutil::dirname(&resolved)) {
        return Err(ApiError::new(&m, ""));
    }
    if let Err(e) = std::fs::write(&resolved, contents) {
        return Err(ApiError::new(&super::node_err(&e, "open", &resolved), ""));
    }
    Ok(CdnResult { path: rel, version, written: true })
}
