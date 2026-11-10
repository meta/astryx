//! `runPostCodemodHooks` (api/upgrade/_adapter.mjs): each hook's
//! `buildCommand({packageDir, files})` runs in the config module; with
//! `--apply` its command runs, otherwise it is previewed.

use super::fsutil::s;
use super::ui::Ui;
use crate::json::Value;
use std::path::Path;
use std::time::{Duration, Instant};

fn is_function(v: Option<&Value>) -> bool {
    v.and_then(|x| x.get("__js")).and_then(|x| x.as_str()) == Some("function")
}

pub fn run_post_codemod_hooks(ui: &mut Ui, hooks: &[Value], config_path: Option<&str>, package_dir: &Path, files: &[String], apply: bool) -> Result<(), String> {
    for (i, hook) in hooks.iter().enumerate() {
        let label = hook.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_else(|| format!("postCodemod[{}]", i));
        if !is_function(hook.get("buildCommand")) {
            return Err(format!("Post-codemod hook {} is missing a buildCommand function.", label));
        }
        let config = match config_path {
            Some(c) => c,
            None => return Err(format!("Post-codemod hook {} is missing a buildCommand function.", label)),
        };
        let idx = i.to_string();
        let arg = serde_json::json!({"packageDir": s(package_dir), "files": files});
        let opts = crate::js::CallOptions { capture_output: true, ..Default::default() };
        let res = crate::js::call_export(Path::new(config), &["default", "hooks", "postCodemod", &idx, "buildCommand"], &[arg], &opts);
        let cmd = match res {
            Ok(r) => {
                if !r.output.is_empty() {
                    ui.out.ewrite(&String::from_utf8_lossy(&r.output));
                }
                r.value
            }
            Err(crate::js::CallError::Thrown { error, output, .. }) => {
                if !output.is_empty() {
                    ui.out.ewrite(&String::from_utf8_lossy(&output));
                }
                return Err(error.message);
            }
            Err(crate::js::CallError::Load(e)) => return Err(e.message),
            Err(crate::js::CallError::NotAFunction(_)) => return Err(format!("Post-codemod hook {} is missing a buildCommand function.", label)),
            Err(_) => return Err(format!("Post-codemod hook {} did not finish.", label)),
        };
        let truthy = !(cmd.is_null() || cmd.get("__js").and_then(|x| x.as_str()) == Some("undefined") || cmd == Value::Bool(false) || cmd == Value::String(String::new()) || cmd == serde_json::json!(0));
        if !truthy {
            ui.log(&format!("Post-codemod hook {} produced no command; skipping.", label));
            continue;
        }
        let command = js_str(cmd.get("command"));
        let args: Vec<String> = cmd.get("args").and_then(|a| a.as_array()).map(|a| a.iter().map(|x| js_str(Some(x))).collect()).unwrap_or_default();
        if !apply {
            let mut parts = vec![command.clone()];
            parts.extend(args.iter().cloned());
            ui.log(&format!("Post-codemod hook {} (dry run): {}", label, parts.join(" ")));
            continue;
        }
        let options = cmd.get("options");
        let cwd = options.and_then(|o| o.get("cwd")).and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_else(|| s(package_dir));
        let timeout = options.and_then(|o| o.get("timeout")).and_then(|v| v.as_f64()).unwrap_or(300_000.0);
        let mut c = std::process::Command::new(&command);
        c.args(&args).current_dir(&cwd).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
        if let Some(env) = options.and_then(|o| o.get("env")).and_then(|v| v.as_object()) {
            for (k, v) in env {
                if let Some(v) = v.as_str() {
                    c.env(k, v);
                }
            }
        }
        let mut child = match c.spawn() {
            Ok(ch) => ch,
            Err(e) => {
                let code = if e.kind() == std::io::ErrorKind::NotFound { "ENOENT" } else { "EACCES" };
                return Err(format!("spawn {} {}", command, code));
            }
        };
        let start = Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(st)) => break Some(st),
                Ok(None) => {
                    if timeout > 0.0 && start.elapsed() > Duration::from_millis(timeout as u64) {
                        let _ = child.kill();
                        let _ = child.wait();
                        break None;
                    }
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(_) => break None,
            }
        };
        let out = child.wait_with_output().ok();
        let stderr = out.as_ref().map(|o| String::from_utf8_lossy(&o.stderr).into_owned()).unwrap_or_default();
        let ok = status.map(|s| s.success()).unwrap_or(false);
        if !ok {
            let mut parts = vec![command.clone()];
            parts.extend(args.iter().cloned());
            return Err(format!("Command failed: {}\n{}", parts.join(" "), stderr));
        }
        ui.log(&format!("[ok] Post-codemod hook {} completed.", label));
    }
    Ok(())
}

fn js_str(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => crate::json::js_number_to_string(n.as_f64().unwrap_or(0.0)),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Null) => "null".into(),
        _ => "undefined".into(),
    }
}
