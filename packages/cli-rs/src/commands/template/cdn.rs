//! `template --cdn`: write the annotated no-build-step starter page.

use super::{fsutil, ApiError};

pub struct CdnResult {
    pub path: String,
    pub version: String,
    pub written: bool,
}

/// The installed Core's version, else this CLI's.
// TEMP: replace with src/discovery find_core_dir + getXdsVersion when it lands.
pub fn xds_version(cwd: &std::path::Path) -> String {
    crate::cli::release::core_and_copy(cwd).0.unwrap_or_else(crate::cli::env::cli_version)
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
    let version = xds_version(cwd);
    if std::path::Path::new(&resolved).exists() && !overwrite {
        return Ok(CdnResult { path: rel, version, written: false });
    }
    let src = std::fs::read_to_string(cli_root.join("assets").join("cdn.template.html")).unwrap_or_default();
    let contents = fsutil::strip_copyright_header(&src).replace("__ASTRYX_VERSION__", &version);
    let _ = std::fs::create_dir_all(fsutil::dirname(&resolved));
    let _ = std::fs::write(&resolved, contents);
    Ok(CdnResult { path: rel, version, written: true })
}
