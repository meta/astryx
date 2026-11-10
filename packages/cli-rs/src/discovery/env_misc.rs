//! Ports of `foundation/env/user-settings.mjs`, `env/node-version.mjs` and
//! `fs/publish-file.mjs`.

use super::nodepath as np;
use crate::json::{Map, Value};

/// `settingsFile(configDir)`.
pub fn settings_file(config_dir: Option<&str>) -> String {
    np::join2(&config_dir.map(String::from).unwrap_or_else(super::release::user_config_dir), "settings.json")
}

/// `readSettings(configDir)`: a JSON object, else `{}`.
pub fn read_settings(config_dir: Option<&str>) -> Map<String, Value> {
    match np::read_json(&settings_file(config_dir)) {
        Some(Value::Object(m)) => m,
        _ => Map::new(),
    }
}

/// `computerAgentTextSettings(configDir)`: `(install, links)`.
pub fn computer_agent_text_settings(config_dir: Option<&str>) -> (bool, Vec<String>) {
    let s = read_settings(config_dir);
    let v = match s.get("computerAgentText") {
        Some(Value::Object(m)) => m.clone(),
        _ => Map::new(),
    };
    let links = match v.get("links") {
        Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str().map(String::from)).collect(),
        _ => vec![],
    };
    (v.get("install") != Some(&Value::Bool(false)), links)
}

/// `recordComputerAgentTextSettings({install, links}, configDir)`.
pub fn record_computer_agent_text_settings(install: bool, links: &[String], config_dir: Option<&str>) -> bool {
    let mut next = read_settings(config_dir);
    next.insert("computerAgentText".into(), serde_json::json!({"install": install, "links": links}));
    let file = settings_file(config_dir);
    let ok = (|| -> std::io::Result<()> {
        std::fs::create_dir_all(np::dirname(&file))?;
        let tmp = format!("{file}.{}.tmp", std::process::id());
        std::fs::write(&tmp, format!("{}\n", crate::json::stringify(&Value::Object(next), 2)))?;
        std::fs::rename(&tmp, &file)
    })();
    ok.is_ok()
}

/// `MIN_NODE_VERSION`.
pub const MIN_NODE_VERSION: &str = "22.13.0";

/// `parseNodeVersion(version)`.
pub fn parse_node_version(v: &str) -> (f64, f64, f64) {
    let c = v.trim_matches(super::paths::js_ws);
    let c = c.strip_prefix('v').unwrap_or(c);
    let parts: Vec<f64> = c
        .split('.')
        .map(|s| {
            let n = super::semver::js_parse_int(s);
            if n.is_nan() || n == 0.0 { 0.0 } else { n }
        })
        .collect();
    (*parts.first().unwrap_or(&0.0), *parts.get(1).unwrap_or(&0.0), *parts.get(2).unwrap_or(&0.0))
}

/// `isNodeVersionSupported(version, minimum)`.
pub fn is_node_version_supported(v: &str, minimum: &str) -> bool {
    let a = parse_node_version(v);
    let m = parse_node_version(minimum);
    if a.0 != m.0 {
        return a.0 > m.0;
    }
    if a.1 != m.1 {
        return a.1 > m.1;
    }
    a.2 >= m.2
}

/// `unsupportedNodeMessage(version, minimum)`.
pub fn unsupported_node_message(v: &str, minimum: &str) -> String {
    let c = v.trim_matches(super::paths::js_ws);
    let c = c.strip_prefix('v').unwrap_or(c);
    format!("astryx requires Node.js >={minimum} (you have v{c}). Please upgrade Node and try again.")
}

/// `publishNewFile(temporary, destination)`: hard link, else exclusive copy.
pub fn publish_new_file(temporary: &str, destination: &str) -> std::io::Result<()> {
    match std::fs::hard_link(temporary, destination) {
        Ok(()) => Ok(()),
        Err(e) if matches!(e.raw_os_error(), Some(1) | Some(18)) => {
            use std::io::Write;
            let bytes = std::fs::read(temporary)?;
            let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(destination)?;
            f.write_all(&bytes)
        }
        Err(e) => Err(e),
    }
}
